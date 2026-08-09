# Codex report to Claude

## Current as of

- Worked from `9dc4898` (including both edge-fade commits), after first reading the
  brief at `f479283` and rebasing each time `main` moved.
- Published squad/data implementation: `05c2ef7a50b90633999cdff90d8c898c4c501b57`.

## Done

- Added `src/lower-league-data.js`: a generated 9 August 2026 snapshot of all 96
  Championship, League One, League Two and National League teams. It contains
  2,548 sourced players and a roster URL/source timestamp per team.
- Added `scripts/fetch-lower-league-squads.cjs` and
  `npm run data:lower-leagues`. The updater rejects a division unless it has 24
  teams, at least 19 identities per team and goalkeeper/defence/midfield/forward
  coverage. Missing source ages/positions remain null rather than being invented.
- Added `src/lower-league-squads.js`. It updates the 2026/27 memberships, then
  maps source identities, available ages and shirt numbers onto the existing game
  slots. The 19-player depth, positions, ratings, attributes, contracts and
  economy remain the game-balanced values. A second roster-only pass covers the
  depth players created later by `seedSquadDepth()`.
- Updated the picker fingerprint, test harness, PWA cache, README and changelog.
- Added a regression that checks all 72 L1/L2/NL clubs, all 1,368 live names,
  exact division membership, 19-player depth, position/contract shape, source
  metadata, rating-tier order, picker parity and Leicester/Wout Faes.
- Fixed date-only fixtures displaying one day early west of UTC.
- Audited `e0ab5b2`, `32bc5be`, `3aebb9f`, `0446136`, `c643d20`, `f479283`,
  `404cec0` and its follow-up `9dc4898`. Per the brief, none of the audit findings
  below were patched.

Surgical changes to `red-devil-manager.html`, for review:

1. Added two external script tags for the generated data and mapper.
2. Added `timeZone:'UTC'` to `fmtDate()` and `fmtDateShort()`.
3. Added one `RBSLowerLeagueSquads.apply(G.clubs)` call after world membership is
   built and before fixtures.
4. Added one `refreshRosters(G.clubs)` call after `seedSquadDepth()`.
5. Added the lower-league snapshot to `worldFingerprint()` so an old phone picker
   cache cannot start the wrong club.

## Checked, and how

- Baseline at `f479283`: `npm run check` passed 7/8. The mobile fixture-date test
  failed deterministically in `America/New_York`: 22/30 August and 6/13 September
  displayed as 21/29 August and 5/12 September. This led to the UTC date fix.
- `node scripts/fetch-lower-league-squads.cjs`:
  `Wrote src/lower-league-data.js with 96 teams and 2548 sourced players
  (2026-08-09).` Minimum source roster sizes were CH 23, L1 22, L2 21, NL 19.
- Final post-rebase `NPM_CONFIG_CACHE=/tmp/rbs-npm-cache npm run check`:
  lint green; tests 8, pass 8, fail 0; duration 31.515 s. The timezone remained
  `America/New_York`, so the date regression exercised the original failure zone.
- Deterministic 380-match measurement after the squad change:

  | engine | goals/match | draws | 0-0 |
  | --- | ---: | ---: | ---: |
  | detailed | 2.7211 | 24.47% | 6.32% |
  | background | 2.7447 | 26.84% | 4.74% |

  Existing bands remain 2.55–3.05 goals, 20–31% draws, 4–12% 0-0, with a maximum
  model gap of 0.25. No band was changed.
- Audit probes:
  - referee and assistant each drew exactly once and both pending flags cleared in
    normal and fallback depth paths;
  - `initDots()` reset `SUB_WALK` to 0 and `SUB_SEAT` to `[0,0]`;
  - 20,000 `attnAnswer()` calls against a 40-message inbox took 80.57 ms
    (4.03 microseconds/call), so the full-inbox scan is not a frame-budget issue;
  - edge fade produced start `0/30px`, middle `14/30px`, end `30/0px`, then removed
    itself with no overflow. No defect found in `404cec0`/`9dc4898`.
- `git diff --check`: no whitespace errors.

## Found but not fixed

1. **One press conference counts as two answers (`3aebb9f`).** `attnAnswer()` adds
   `G.pressCtx`, then adds the press mail returned by `blockingMails()`. Probe with
   one context and one press mail returned `['press','mailpress-one']`. Repro: let a
   pre/post-match press summons arrive and inspect the home counter before entering;
   the context and its launcher mail describe one decision but are both counted.

2. **A red-carded player walks to and sits on the substitutes' bench (`32bc5be`).**
   `subScan()` treats every newly `off` dot as a substitution and never excludes
   `sentOff`. Setting one live player to `{sentOff:true,off:true}` produced a
   `SUB_WALK` entry with phase `walk` and the substitution gate. Repro: receive a
   straight red in the dugout view and keep watching; the dismissed player follows
   the substitution path instead of leaving for the tunnel.

3. **The pictured foul victim can disagree with the commentary (`0446136`).**
   `foulEvent()` chooses and names `vic`, but the card wrappers pass only the
   offender into `lifeFoul()`. That function independently floors whichever
   opponent dot is nearest. Repro: arrange two attackers close to the booked
   defender, trigger a foul, and compare the named victim with the player given the
   `floored` pose.

4. **Crowd duck state survives a stopped crowd (`c643d20`).** After
   `kokoDuck(true)`, removing `A2.crowd` and calling `kokoDuck(false)` left
   `KOKO.duckAt === 0.05`; the off path returns before clearing it. Repro: let
   neural speech overlap full time or another crowd rebuild. The rebuilt crowd is
   not ducked for the remaining speech, and a later utterance can use the stale
   restore level.

5. **A later Kokoro clause failure is swallowed (`c643d20`).** The one-clause-ahead
   promise uses `.catch(()=>null)`. With clause one resolving and clause two
   rejecting, `kokoSay()` made two generation calls but resolved `true` with no
   error, so the `ttsSay()` fallback never ran. Repro: make generation fail after
   the first clause (network/memory/backend error); the rest disappears silently.

6. **The missing-store warning misses a live localStorage downgrade (`f479283`).**
   With `RBSSaves.store.mode='localStorage'`, `rbsStoreMissing()` returned false and
   `rbsStoreWarnHTML()` returned an empty string. `CareerStore.open()` deliberately
   falls back when IndexedDB open fails, while `RBSSaves` still exists. Repro: block
   IndexedDB but load both `src` scripts; there is no toast/banner about the ~5 MB
   path even though that is the active mode.

## Blocked

- Neural synthesis on real hardware is not done. This environment has no physical
  Android/iPhone, so I will not substitute JSDOM or desktop timing for the requested
  numbers. Still required: first-use progress/bytes for 36/86/326 MB; per-clause
  latency on a mid-range Android; second visit offline; iOS first-touch
  AudioContext unlock and 86 MB memory survival; and listening measurements for
  `o.vol` versus the `0.30` crowd duck. This is unblocked by running the published
  build on one mid-range Android and one iPhone Safari with the network/cache panels
  and a timer. If 86 MB fails on iOS, make Small the iOS default.

## Data provenance

- Read 9 August 2026 from ESPN's public soccer API:
  [Championship](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams?limit=100),
  [League One](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.3/teams?limit=100),
  [League Two](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.4/teams?limit=100),
  [National League](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.5/teams?limit=100).
  Each team's exact `/teams/{teamId}/roster` URL and API timestamp are stored next
  to its players in `src/lower-league-data.js`.
- New-slot venue facts, read 9 August 2026: Birmingham City's
  [stadium information](https://www.bcfc.com/pages/en/stadium-information), Barnet's
  [The Hive information](https://barnetfc.com/partners), AFC Fylde's
  [Mill Farm capacity](https://www.afcfylde.co.uk/news/2023/august/10/bowker-motor-group-extends-mill-farm-stand-partnership),
  [2026/27 National League stadium table](https://en.wikipedia.org/wiki/2026%E2%80%9327_National_League)
  for Hornchurch and Kidderminster, and Worthing's
  [capacity update](https://worthingfc.com/2025/04/an-update-on-capacity/).
