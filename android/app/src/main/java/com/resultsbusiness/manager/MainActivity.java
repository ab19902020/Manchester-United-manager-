package com.resultsbusiness.manager;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The Android shell around The Results Business.
 *
 * The game is the same web build that runs in a browser. It is served out of
 * the APK's assets at https://appassets.androidplatform.net/ (a host reserved
 * for exactly this use), never fetched from the internet, so it plays offline
 * and its saves live in a proper secure origin: IndexedDB persists between
 * launches the way it would for an installed web app.
 *
 * What a bare WebView cannot do for a game, this class does:
 *   - the back button steps back through sheets and screens, not out of the app;
 *   - "Export save file" writes a real file (blob downloads do nothing in a WebView);
 *   - "Import save file" opens the phone's file picker;
 *   - the press-conference voice speaks through Android's text-to-speech,
 *     because Android's WebView has no speechSynthesis;
 *   - the career is saved when the app is backgrounded;
 *   - the screen stays awake while a match is on.
 */
public final class MainActivity extends Activity {

    static final String TAG = "ResultsBusiness";
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";

    private static final int REQUEST_OPEN_FILE = 41;
    private static final int REQUEST_SAVE_FILE = 42;
    private static final long SPLASH_TIMEOUT_MS = 12000;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView web;
    private boolean pageReady;
    private long createdAt;

    private ValueCallback<Uri[]> filePickCallback;

    private final Object exportLock = new Object();
    private File exportFile;
    private Writer exportWriter;
    private String exportName;

    private TextToSpeech tts;
    private volatile boolean ttsReady;

    private boolean resumed;
    private final Runnable pauseTimers = () -> {
        if (!resumed && web != null) web.pauseTimers();
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createdAt = SystemClock.uptimeMillis();

        /* Edge to edge only where the insets API can keep the page clear of
           the notch; older Android keeps its own cutout handling. */
        if (Build.VERSION.SDK_INT >= 30) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(lp);
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF080C09);
        setContentView(root);
        applySafeArea();
        immersive();
        holdSplashUntilTheGameIsUp();

        createWebView();
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(START_URL);
        }

        tts = new TextToSpeech(getApplicationContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setOnUtteranceProgressListener(new SpeechEvents());
                emit("tts", "{\"type\":\"voiceschanged\"}");
            }
        });
    }

    /* ------------------------------------------------------------------
       THE WEBVIEW
       ------------------------------------------------------------------ */

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(0xFF080C09);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(false);
        s.setUserAgentString(s.getUserAgentString() + " ResultsBusinessAndroid/" + BuildConfig.VERSION_NAME);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Bridge(), "AndroidShell");
        web.setWebViewClient(new GameClient());
        web.setWebChromeClient(new GameChrome());

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    /** Serves the game out of the APK, and sends everything else to the browser. */
    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return null;
            return serveAsset(url.getPath());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) return false;
            openExternally(url);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pageReady = true;
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            /* The renderer can be killed for memory while the game is in the
               background. Without this the whole app would crash; with it the
               game reloads and the autosave is one tap away. */
            Log.w(TAG, "WebView renderer gone; reloading the game");
            if (web != null) {
                root.removeView(web);
                web.destroy();
                web = null;
            }
            createWebView();
            web.loadUrl(START_URL);
            return true;
        }
    }

    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        String rel = path.startsWith("/") ? path.substring(1) : path;
        if (rel.contains("..")) return notFound();
        try {
            InputStream in = getAssets().open("www/" + rel, AssetManager.ACCESS_STREAMING);
            String mime = mimeOf(rel);
            boolean text = mime.startsWith("text/") || mime.endsWith("javascript")
                    || mime.endsWith("json") || mime.endsWith("+xml") || mime.endsWith("+json");
            WebResourceResponse response = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            response.setResponseHeaders(headers);
            return response;
        } catch (IOException missing) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                new ByteArrayInputStream(new byte[0]));
    }

    static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".ogg")) return "audio/ogg";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private void openExternally(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException none) {
            Log.w(TAG, "Nothing can open " + url);
        }
    }

    private final class GameChrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                Log.e(TAG, message.message() + " @" + message.sourceId() + ":" + message.lineNumber());
            }
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePickCallback != null) filePickCallback.onReceiveValue(null);
            filePickCallback = callback;
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType(pickerType(params.getAcceptTypes()));
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try {
                startActivityForResult(pick, REQUEST_OPEN_FILE);
            } catch (ActivityNotFoundException none) {
                filePickCallback = null;
                Toast.makeText(MainActivity.this, R.string.no_file_app, Toast.LENGTH_LONG).show();
                return false;
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle(R.string.app_name)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle(R.string.app_name)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }
    }

    /** A save is a .json file, but phones label those as anything from
     *  application/json to octet-stream, so a JSON picker shows every file
     *  rather than hiding the one the player exported. */
    static String pickerType(String[] accept) {
        if (accept == null) return "*/*";
        String chosen = null;
        for (String a : accept) {
            if (a == null) continue;
            String t = a.trim().toLowerCase(Locale.ROOT);
            if (t.isEmpty()) continue;
            if (t.startsWith(".") || t.contains("json")) return "*/*";
            if (t.contains("/") && chosen == null) chosen = t;
        }
        return chosen == null ? "*/*" : chosen;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_FILE) {
            ValueCallback<Uri[]> callback = filePickCallback;
            filePickCallback = null;
            if (callback == null) return;
            Uri[] picked = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    picked = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) picked[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    picked = new Uri[]{data.getData()};
                }
            }
            callback.onReceiveValue(picked);
        } else if (requestCode == REQUEST_SAVE_FILE) {
            finishExport(resultCode == RESULT_OK && data != null ? data.getData() : null);
        }
    }

    /* ------------------------------------------------------------------
       EXPORTING A SAVE FILE
       ------------------------------------------------------------------
       The game builds its export as a Blob and clicks a download link,
       which a WebView silently ignores. The page hands the text over in
       chunks instead (a full career is tens of megabytes, too much for one
       bridge call), it is spooled to the cache, and the player picks where
       it goes — Downloads, Drive, anywhere the system file picker reaches. */

    private void beginExport(String name) throws IOException {
        synchronized (exportLock) {
            closeExportQuietly();
            exportFile = new File(getCacheDir(), "export.json");
            exportWriter = new OutputStreamWriter(new FileOutputStream(exportFile), StandardCharsets.UTF_8);
            exportName = name == null || name.trim().isEmpty() ? "results-business-save.json" : name.trim();
        }
    }

    private void appendExport(String chunk) throws IOException {
        synchronized (exportLock) {
            if (exportWriter == null) throw new IOException("No export in progress");
            exportWriter.write(chunk);
        }
    }

    private void endExport(String mime) throws IOException {
        final String name;
        synchronized (exportLock) {
            if (exportWriter == null) throw new IOException("No export in progress");
            exportWriter.close();
            exportWriter = null;
            name = exportName;
        }
        ui.post(() -> {
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            save.addCategory(Intent.CATEGORY_OPENABLE);
            save.setType(mime == null || mime.isEmpty() ? "application/json" : mime);
            save.putExtra(Intent.EXTRA_TITLE, name);
            try {
                startActivityForResult(save, REQUEST_SAVE_FILE);
            } catch (ActivityNotFoundException none) {
                Toast.makeText(this, R.string.no_file_app, Toast.LENGTH_LONG).show();
                finishExport(null);
            }
        });
    }

    private void finishExport(Uri target) {
        final File source;
        final String name;
        synchronized (exportLock) {
            source = exportFile;
            name = exportName;
            exportFile = null;
        }
        if (source == null) return;
        if (target == null) {
            //noinspection ResultOfMethodCallIgnored
            source.delete();
            emit("export", "{\"ok\":false,\"cancelled\":true}");
            return;
        }
        new Thread(() -> {
            boolean ok = false;
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
                if (out == null) throw new IOException("No output stream");
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                ok = true;
            } catch (IOException e) {
                Log.e(TAG, "Export failed", e);
            } finally {
                //noinspection ResultOfMethodCallIgnored
                source.delete();
            }
            /* the page says how it went, in the game's own toast */
            emit("export", "{\"ok\":" + ok + ",\"name\":" + JSONObject.quote(name) + "}");
        }, "rb-export").start();
    }

    private void closeExportQuietly() {
        if (exportWriter != null) {
            try { exportWriter.close(); } catch (IOException ignored) { /* already gone */ }
            exportWriter = null;
        }
        if (exportFile != null) {
            //noinspection ResultOfMethodCallIgnored
            exportFile.delete();
            exportFile = null;
        }
    }

    /* ------------------------------------------------------------------
       TEXT TO SPEECH
       ------------------------------------------------------------------ */

    private final class SpeechEvents extends UtteranceProgressListener {
        @Override public void onStart(String id) { speechEvent(id, "start"); }
        @Override public void onDone(String id) { speechEvent(id, "end"); }
        @Override @Deprecated public void onError(String id) { speechEvent(id, "error"); }
        @Override public void onError(String id, int code) { speechEvent(id, "error"); }
        @Override public void onStop(String id, boolean interrupted) { speechEvent(id, "error"); }
    }

    private void speechEvent(String id, String type) {
        emit("tts", "{\"type\":" + JSONObject.quote(type) + ",\"id\":" + JSONObject.quote(id) + "}");
    }

    /** Google's British voices carry codes, not names. These are the ones
     *  that are known to be men or women, so the game's own voice picker
     *  (which wants a British man for the press room) can tell them apart. */
    static String genderOf(String voiceName) {
        String n = voiceName.toLowerCase(Locale.ROOT);
        String[] male = {"-gbb-", "-gbd-", "-rjs-", "-iol-", "-iom-", "-tpd-", "-ene-", "-end-"};
        String[] female = {"-gba-", "-gbc-", "-gbg-", "-fis-", "-iob-", "-iog-", "-tpc-", "-tpf-", "-sfg-", "-enc-"};
        for (String m : male) if (n.contains(m)) return "male";
        for (String f : female) if (n.contains(f)) return "female";
        return "";
    }

    private String voicesJson() {
        JSONArray list = new JSONArray();
        if (!ttsReady || tts == null) return list.toString();
        try {
            Set<Voice> voices = tts.getVoices();
            Voice fallback = tts.getDefaultVoice();
            if (voices != null) {
                for (Voice v : voices) {
                    if (v == null || v.getLocale() == null) continue;
                    if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    JSONObject o = new JSONObject();
                    o.put("name", v.getName());
                    o.put("lang", v.getLocale().toLanguageTag());
                    o.put("local", !v.isNetworkConnectionRequired());
                    o.put("quality", v.getQuality());
                    o.put("gender", genderOf(v.getName()));
                    o.put("default", fallback != null && fallback.getName().equals(v.getName()));
                    list.put(o);
                }
            }
        } catch (JSONException | RuntimeException e) {
            Log.w(TAG, "Could not list voices", e);
        }
        return list.toString();
    }

    private boolean speak(String id, String text, String lang, String voiceName,
                          float rate, float pitch, float volume) {
        if (!ttsReady || tts == null || text == null) return false;
        try {
            Voice chosen = null;
            if (voiceName != null && !voiceName.isEmpty() && tts.getVoices() != null) {
                for (Voice v : tts.getVoices()) {
                    if (v != null && voiceName.equals(v.getName())) { chosen = v; break; }
                }
            }
            if (chosen != null) tts.setVoice(chosen);
            else if (lang != null && !lang.isEmpty()) tts.setLanguage(Locale.forLanguageTag(lang));
            tts.setSpeechRate(rate > 0 ? rate : 1f);
            tts.setPitch(pitch > 0 ? pitch : 1f);
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, volume)));
            return tts.speak(text, TextToSpeech.QUEUE_ADD, params, id) == TextToSpeech.SUCCESS;
        } catch (RuntimeException e) {
            Log.w(TAG, "Speech failed", e);
            return false;
        }
    }

    /* ------------------------------------------------------------------
       THE BRIDGE THE PAGE TALKS TO (src/android-shell.js)
       ------------------------------------------------------------------ */

    final class Bridge {
        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("versionName", BuildConfig.VERSION_NAME);
                o.put("versionCode", BuildConfig.VERSION_CODE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                return o.toString();
            } catch (JSONException e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public boolean exportBegin(String name) {
            try { beginExport(name); return true; } catch (IOException e) { Log.e(TAG, "export", e); return false; }
        }

        @JavascriptInterface
        public boolean exportChunk(String chunk) {
            try { appendExport(chunk); return true; } catch (IOException e) { Log.e(TAG, "export", e); return false; }
        }

        @JavascriptInterface
        public boolean exportEnd(String mime) {
            try { endExport(mime); return true; } catch (IOException e) { Log.e(TAG, "export", e); return false; }
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            ui.post(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void leave() {
            ui.post(() -> moveTaskToBack(true));
        }

        @JavascriptInterface
        public void openExternal(String url) {
            ui.post(() -> {
                Uri uri = Uri.parse(url);
                String scheme = uri.getScheme();
                if ("https".equals(scheme) || "http".equals(scheme) || "mailto".equals(scheme)) openExternally(uri);
            });
        }

        @JavascriptInterface
        public boolean ttsAvailable() { return ttsReady; }

        @JavascriptInterface
        public String ttsVoices() { return voicesJson(); }

        @JavascriptInterface
        public boolean ttsSpeak(String id, String text, String lang, String voice,
                                float rate, float pitch, float volume) {
            return speak(id, text, lang, voice, rate, pitch, volume);
        }

        @JavascriptInterface
        public void ttsCancel() {
            if (tts != null) try { tts.stop(); } catch (RuntimeException ignored) { /* engine gone */ }
        }

        @JavascriptInterface
        public boolean ttsSpeaking() {
            try { return tts != null && tts.isSpeaking(); } catch (RuntimeException e) { return false; }
        }
    }

    /** One way back into the page: window.AndroidShellEvent(type, detail). */
    private void emit(String type, String detailJson) {
        final String js = "window.AndroidShellEvent&&window.AndroidShellEvent("
                + JSONObject.quote(type) + "," + detailJson + ")";
        ui.post(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    /* ------------------------------------------------------------------
       BACK, LIFECYCLE, AND THE SCREEN
       ------------------------------------------------------------------ */

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript(
                "(function(){try{return window.AndroidShellBack?window.AndroidShellBack():'native'}"
                        + "catch(e){return 'native'}})()",
                value -> {
                    String answer = value == null ? "" : value.replace("\"", "");
                    if ("handled".equals(answer)) return;
                    if ("native".equals(answer) && web != null && web.canGoBack()) { web.goBack(); return; }
                    /* Leaving keeps the process alive rather than destroying the
                       page, so an autosave still being written finishes. */
                    moveTaskToBack(true);
                });
    }

    @Override
    protected void onPause() {
        resumed = false;
        if (web != null) {
            web.evaluateJavascript("window.AndroidShellPause&&window.AndroidShellPause()", null);
            web.onPause();
            /* Give the autosave time to reach IndexedDB before timers stop. */
            ui.removeCallbacks(pauseTimers);
            ui.postDelayed(pauseTimers, 4000);
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        ui.removeCallbacks(pauseTimers);
        immersive();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            web.evaluateJavascript("window.AndroidShellResume&&window.AndroidShellResume()", null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (tts != null) {
            try { tts.shutdown(); } catch (RuntimeException ignored) { /* engine gone */ }
            tts = null;
        }
        if (filePickCallback != null) {
            filePickCallback.onReceiveValue(null);
            filePickCallback = null;
        }
        synchronized (exportLock) { closeExportQuietly(); }
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    /** Full screen, like a game: the bars come back with a swipe from the edge. */
    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            /* Older Android cannot resize a fully immersive window for the
               keyboard, and the game has text boxes, so only the navigation
               bar is hidden there. */
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
        }
    }

    /** Keep the game clear of a camera notch, and above the keyboard. Only
     *  on Android 11 and later, where the window is drawn edge to edge;
     *  below that the system already lays the page out inside the safe area
     *  and padding it again would leave a gap. */
    private void applySafeArea() {
        if (Build.VERSION.SDK_INT < 30) return;
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            /* Consumed here: the page is already clear of the notch and the
               keyboard, and a WebView that also applied them would shrink
               its viewport a second time. */
            return WindowInsets.CONSUMED;
        });
    }

    /** Keep the system splash up while 6 MB of game parses, instead of
     *  showing an empty dark screen; never longer than the timeout. */
    private void holdSplashUntilTheGameIsUp() {
        final View content = findViewById(android.R.id.content);
        content.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                if (pageReady || SystemClock.uptimeMillis() - createdAt > SPLASH_TIMEOUT_MS) {
                    content.getViewTreeObserver().removeOnPreDrawListener(this);
                    return true;
                }
                return false;
            }
        });
    }
}
