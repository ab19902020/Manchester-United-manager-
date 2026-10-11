import java.util.Properties

plugins {
    id("com.android.application")
}

/* The game is the repository root. This module is only the Android shell
   around it, so the web files are never copied into source control twice:
   they are staged into the build at build time, from the same list the
   offline install uses (CORE_ASSETS in service-worker.js). A module the
   game needs but that list forgets is then missing from the PWA, the
   CrazyGames zip and the APK alike, and the shell's check below fails the
   build instead of shipping a game that cannot start. */
val gameRootDir: File = rootProject.projectDir.parentFile

fun coreAssets(): List<String> {
    val worker = File(gameRootDir, "service-worker.js").readText()
    val block = Regex("""CORE_ASSETS\s*=\s*\[([\s\S]*?)\]""").find(worker)
        ?: throw GradleException("CORE_ASSETS not found in service-worker.js")
    val assets = Regex("""'([^']+)'""").findAll(block.groupValues[1])
        .map { it.groupValues[1].removePrefix("./") }
        .filter { it.isNotEmpty() }
        .toList()
    listOf("index.html", "src/android-shell.js").forEach {
        if (it !in assets) throw GradleException("$it is not in CORE_ASSETS in service-worker.js")
    }
    return assets
}

abstract class StageGameAssets : DefaultTask() {
    @get:Input
    abstract val relativePaths: ListProperty<String>

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sources: ConfigurableFileCollection

    @get:Internal
    abstract val gameRoot: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun stage() {
        val root = gameRoot.get().asFile
        val out = File(outputDir.get().asFile, "www")
        out.deleteRecursively()
        relativePaths.get().forEach { rel ->
            val source = File(root, rel)
            if (!source.isFile) throw GradleException("CORE_ASSETS lists $rel but it does not exist")
            source.copyTo(File(out, rel), overwrite = true)
        }
        logger.lifecycle("Staged ${relativePaths.get().size} game files into the APK")
    }
}

val stageGameAssets = tasks.register<StageGameAssets>("stageGameAssets") {
    val assets = coreAssets()
    relativePaths.set(assets)
    sources.from(assets.map { File(gameRootDir, it) })
    gameRoot.set(gameRootDir)
}

/* Every APK must carry a higher versionCode than the one it replaces, or
   Android refuses to install it over the top (and the career with it).
   The commit count looked like the obvious counter and is not one: a
   squash-merge gives main fewer commits than the branch it came from. The
   time of the commit only moves forward, so the build number is the
   minutes since 2020 at which HEAD was committed. */
val buildNumber: Int = (findProperty("rbVersionCode") as String?)?.toIntOrNull()
    ?: runCatching {
        val seconds = providers.exec { commandLine("git", "-C", gameRootDir.path, "log", "-1", "--format=%ct") }
            .standardOutput.asText.get().trim().toLong()
        ((seconds - 1577836800L) / 60L).toInt()
    }.getOrDefault(1)

val gameVersion: String = Regex(""""version"\s*:\s*"([^"]+)"""")
    .find(File(gameRootDir, "package.json").readText())?.groupValues?.get(1) ?: "1.0.0"

/* Release signing comes from android/keystore.properties or the
   environment; neither is ever committed. Without one the release build is
   signed with the debug key so that CI still produces an installable APK. */
val signing = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? =
    signing.getProperty(key)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() }

val releaseStore = signingValue("storeFile", "RB_KEYSTORE_FILE")

android {
    namespace = "com.resultsbusiness.manager"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.resultsbusiness.manager"
        minSdk = 24
        targetSdk = 35
        versionCode = buildNumber
        versionName = gameVersion
    }

    signingConfigs {
        if (releaseStore != null) {
            create("release") {
                storeFile = rootProject.file(releaseStore)
                storePassword = signingValue("storePassword", "RB_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "RB_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "RB_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseStore != null) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(stageGameAssets, StageGameAssets::outputDir)
    }
}
