# The Results Business

The Results Business is a mobile-first football management career covering 484 clubs across twenty countries. Every club, player, manager, competition, ground and sponsor in it is invented — nothing is licensed and nothing is taken from a real roster or fixture list — so the game can be published on app stores. Manchester Reds are the featured career, but every playable club uses the same full management systems.

**Make it yours.** *Club → Save → Names* opens the name editor: rename any club, ground or player, and export or import your names as a pack. A rename changes what something is called and nothing else — a player keeps his face, his ability and his contract — and your pack is applied to every new career on the device.

**The manager's legacy.** *Club → Trophies* keeps a running record of every league game you have managed and twenty-one career milestones, from a first win to taking a club all the way up. It only records what has happened; it never gives a bonus or changes a result.

Player portraits now use a single studio-style illustration system with more
natural facial proportions, individual features, current club kits and age detail.
They use the game's existing appearance descriptions. Each portrait is a cached,
self-contained image, keeping long lists light and working without downloads.

Every management screen has **Search** and **Guide** controls. Search players,
clubs or screens by name, or press **Ctrl/Cmd + K**. The searchable handbook
explains selection, training, transfers, contracts, finances and match management,
with direct links to the relevant screen. The tactical brief describes your actual
instructions and highlights selection and workload concerns. Player profiles show
how positional fit, condition, sharpness and morale relate to their effective rating.

The home screen now includes match preparation: condition, sharpness and morale
for your actual XI, selection concerns with a direct replacement picker, and the
next fortnight's fixtures. Open a player's profile and choose **Compare with my
squad** to compare him with your existing players. Unscouted attributes stay hidden.

**Continue your career** opens the most recently saved primary slot. **Choose a
save or recovery point** also opens the two recovery checkpoints, including from
the start screen. Overwriting a manual slot asks first. IndexedDB autosave rotation
commits the career and its recovery copies together, so a failed write cannot
partially rotate away your previous saves.

## Play on Android

**Getting the app.** Every push builds two files in GitHub Actions (the *Android app* workflow, under
*Artifacts*): `the-results-business-apk`, which installs straight onto a phone, and
`the-results-business-play-bundle`, the `.aab` that Google Play asks for. `npm run apk` and `npm run aab`
build the same two locally. The app targets Android 16 (API 36) and runs on Android 7.0 or later.

The game also ships as an Android app (`android/`): the same build, served
from inside the APK, so it plays offline and keeps its saves in the app's own
storage. Install the APK on the phone (allow "install unknown apps" for the
browser or file manager you open it from) and launch **The Results Business**.

The app is more than a browser around the game:

- **Back** steps back through sheets, letters and screens, returns to Home
  and, only on Home, asks before leaving. In a match it pauses rather than
  walking out of the ground; the board keeps you until you have answered.
- **Export save file** writes a real `.json` file wherever you choose
  (Downloads, Drive, …) and **Import save file** opens the phone's file picker.
  Export before uninstalling: removing an app removes its saves.
- The press-conference voice speaks through Android's own text-to-speech,
  choosing a British male voice on the device.
- Sending the app to the background saves the career immediately and silences
  the crowd; the screen stays awake while a match is on.
- Full screen, notch-aware, and Android backup carries careers to a new phone.

Build it with the Android SDK installed (`ANDROID_HOME` set):

```bash
npm run apk          # android/app/build/outputs/apk/release/app-release.apk
npm run android:check  # the app's page side, driven in Chromium with a simulated bridge
```

The web files are not copied into `android/`: the build stages exactly the
files `service-worker.js` lists in `CORE_ASSETS`, so the offline install, the
CrazyGames zip and the APK can never disagree about what the game needs.

**Signing.** An update only installs over an earlier APK if both were signed
with the same key. Put the key's details in `android/keystore.properties`
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`; never committed),
or, for the GitHub Actions build, in the repository secrets
`RB_KEYSTORE_BASE64` (the keystore, base64-encoded), `RB_KEYSTORE_PASSWORD`,
`RB_KEY_ALIAS` and `RB_KEY_PASSWORD`. Without them the build is signed with a
throwaway debug key, which installs fine but will not update an APK signed
with the release key — export your career first in that case.

## Play locally

The game must be served from a web address so browser storage, the service worker and optional neural voices work correctly.

```bash
npm install
npm run serve
```

Open `http://localhost:4173`. On Android or iPhone, use the browser’s **Add to Home Screen** command for the standalone version. The core game is cached for offline play after the first successful visit.

## Development checks

```bash
npm run check
npm run sweep
```

`npm run sweep` drives a real career through every screen in both orientations and
reports three kinds of layout fault: anything reaching past the side of the view,
two boxes drawn through each other, and a box shorter than the contents inside it.
The third exists because the first version of the sweep counted only overlaps and
therefore passed a change that collapsed every card on the tactics screen — two
squashed boxes side by side do not intersect.

The automated suite covers:

- complete-world validation for new autosaves;
- IndexedDB manual slots and rotating recovery autosaves;
- save/load round trips and transfer-offer acceptance;
- an invented world that is complete: five full English divisions, squads deep enough to play, whole rounds of fixtures;
- a licence guard that fails if any shipped file names a real competition, club, ground, broadcaster or footballer;
- the name editor (a rename never changes a player or a club) and the career milestones (they only watch);
- press-conference, fullscreen, SVG-ID and transfer-pagination regressions;
- one authoritative match displayed through Pitch, Text and Stats;
- legal team selection, consistent bench swaps, cup-opponent scouting, player
  comparison and recruitment filters that agree with visible potential;
- atomic save recovery, start-screen save selection, native keyboard controls,
  and offline updates that keep each installed build together;
- stable, self-contained portraits, bounded portrait caching, current club kits,
  career search, management shortcuts and tactical/readiness explanations;
- goalkeeper Man of the Match frequency across all five English divisions;
- full-season statistical bands for both match simulators.

GitHub Actions runs the same checks on every pull request.

## Project layout

- `index.html` — the legacy game core and UI.
- `src/career-store.js` — validated, checksummed IndexedDB career storage.
- `src/simulation-model.js` — shared scoring probabilities and balance targets.
- `src/name-editor.js` — rename clubs, grounds and players; name packs.
- `src/legacy.js` — the career record and milestones.
- `src/original-trophies.js` — the silverware, designed for this game.
- `src/visual-refresh.js` — screen transitions, depth and the match layout.
- `tests/licence-clean.test.cjs` — the guard that keeps real-world names out.
- `src/runtime-enhancements.js` — save integration, diagnostics, accessibility and PWA wiring.
- `src/match-ratings.js` — diminishing goalkeeper save rewards and rating-distribution guardrails.
- `src/match-view.js` — Pitch, Text and Stats views of the same MatchSim result.
- `src/match-preparation.js` — actionable XI readiness and upcoming workload on the home screen.
- `src/player-comparison.js` — comparison against your squad using existing player attributes and scouting knowledge.
- `src/player-portraits.js` — a consistent portrait composition and bounded image cache.
- `src/manager-experience.js` — management headings, career search, handbook and tactical/readiness explanations.
- `src/cup-calendar.js` — keeps a cup tie off a date that has already gone past, and rescues any that are.
- `src/trophy-room.js` — the season's campaign board on the Trophies tab, and what stands in the empty room.
- `src/world-seed.js` — world generation behind one 32-bit seed, so the same number gives back the same world.
- `src/one-job.js` — one man, one job: no manager is in charge of two clubs at once.
- `src/front-door.js` — the club picker: browse the pyramid by league and read the job before you take it.
- `src/layout-repair.js` — measured fixes to the landscape shell, the tactics pitch and the way into training.
- `src/mailbox-pro.js` — delete, ignore and important, a landscape sheet that fits, and a shelf life for the home-screen card.
- `src/press-questions.js` — twenty-six more press topics, weighted toward the ordinary week.
- `src/press-voice.js` — British male voice selection, and a pool that cannot fall back to a woman.
- `src/transfer-structure.js` — the manager's choice of how a fee is paid, and what a selling club charges to wait.
- `src/crazygames.js` — the CrazyGames SDK adapter: feature-detected, gzipped cloud saves,
  and an honest refusal when a save is over the platform's 1 MB cap.
- `src/stadium-costs.js` — what a ground costs depends on whose ground it is:
  facility prices scaled by club reputation and a rebuild priced off the ground,
  so a non-league club can build and Old Trafford still costs £352m.
- `src/keep-history.js` — stops a save discarding the match logs of 460 clubs and the
  scorers of every match you were not in.
- `src/transfer-search.js` — free agents in the market search, a contract filter, and the
  search above the money rather than below it.
- `src/tactics-token.js` — fitness as the ring on the shirt and form as a pill on it,
  so the name and position under it are a fixed two lines that cannot overlap the next row.
- `src/name-clash.js` — stops a generated player being given a real player's name.
- `src/story.js` — the local journalist, his monthly column and the moments the
  save already knew about; reads game state and writes nothing the engine reads back.
- `src/analytics.js` — the statistics centre: every player and club in any division,
  sortable, plus the per-match rating log and form graph for your own squad.
- `src/delegation.js` — the jobs you hand to your assistant, and what his star rating costs you.
- `src/face-polish.js` — the chinstrap drawn as a shaved-out beard, and the rim light pulled off the middle of the face.
- `service-worker.js` and `manifest.webmanifest` — installable offline shell.
- `scripts/sweep-screens.cjs` — walks every screen in both orientations looking for spill, overlap and squashed boxes.
- `scripts/check-framed.cjs` (`npm run framed`) — runs the game the way CrazyGames
  does: in an iframe, over http, with the SDK served from an intercepted route.
  Nothing else in the repository executes that path — the tests run without an SDK
  on purpose — so without this the gate, the script tag and `attach()` are never
  exercised at all.
- `scripts/build-upload.cjs` (`npm run upload`) — builds `dist/the-results-business.zip`,
  the CrazyGames upload: `index.html` at the root, every path relative, none of the
  repository's tests, documents or `node_modules`. Its file list is read out of
  `service-worker.js` rather than kept here, so the offline install and the upload
  can never disagree about what the game needs. It then extracts the zip, serves it,
  loads it framed and builds a world — a package that has not been run is a guess.
- `tests/` — unit and browser-style integration tests.

Three agents work on this repository with separate handoffs and ownership. Claude
directs the work, setting Codex's through `CODEX.md` and Agent One's through
`AGENT-ONE-TASKS.md`; Codex reports data, test and audit work in `CLAUDE.md`;
Agent One reports the economy, contracts, morale, transfer-market, inbox and
underlying-rules work in `AGENT-ONE.md`. Each file has exactly one writer, so a
handoff is never a merge conflict. Read the handoffs before changing an owned
system so one agent does not overwrite another's work.

New systems should be added to `src/` rather than appended as another anonymous wrapper in the legacy file. `runtime-enhancements.js` provides one named action-patching helper and a bounded diagnostic log through `window.RBSDiagnostics`.

## Saves

Careers are stored in IndexedDB rather than the approximately 5 MB `localStorage` allowance. Each payload is validated against the complete world, checksummed, and given a separate lightweight metadata record. Manual slots never delete another career. Autosave keeps two spaced recovery points.

Older valid `rdm2627` browser saves are migrated automatically. An incomplete legacy save is quarantined rather than loaded into the game.

## Data notes

**Everything in the game is invented.** There are no real clubs, players, managers, referees,
competitions, grounds, broadcasters, sponsors or trophies in it, and no data read from a roster feed or a
published fixture list. Clubs are named for the town they play in with a suffix no real club there uses;
players and staff are drawn from name pools; competitions say what they are (Premier Division, Challenge
Cup, Champions Cup); fixtures are generated; the trophies in the trophy room were designed here.

`tests/licence-clean.test.cjs` reads every file that ships and fails the build if a real competition,
club, ground, broadcaster or famous footballer is named in one. If it fails, rename the thing — do not add
an exception.

This is not legal advice, and a name check is not a clearance: before publishing, look over the store
listing, screenshots and description for the same things, and remember that the name editor lets players
type whatever they like into their own copy.
