# Changelog

## Unreleased

### Added

- **Every other result in your division, and the goals from any of them.**
  "Every team around you has to perform correctly, obviously, in the whole
  game." They do — ninety-odd clubs play a full season each and the table
  proves it — and there was no way to **look** at any of it. A Saturday's
  results existed only as the numbers they moved in the standings, and the one
  match you could watch was your own.

  The reel has been able to play anybody's match since it was built:
  `playFixture()` takes a fixture, builds both sides from their real squads,
  seats the men who actually scored and plays the goals. Brighton 1–3 Villa was
  watched back that way while it was being tested. There was simply nothing
  anywhere in the game that would hand it a fixture that was not yours —
  `vFixtures` lists your club and only your club, the calendar opens your own
  days, the match report is your own report.

  So there is now a **Results** toggle on World → Table. Not a new tab: the
  table already carries a country rail and a division rail, and a division's
  results belong behind those same two rails rather than behind a third copy of
  them. The card underneath switches between the standings and the round, the
  round has arrows, and every match with goals in it carries a 🎥.

  Verified in a real browser rather than only under JSDOM: opened on Matchday
  1, listed all ten fixtures with the played one showing 2–0 and the rest
  showing their date, highlighted the row that was mine, stepped a matchday
  with the arrows, and pressed the camera on **Arsenal 2–0 Coventry — a match
  between two clubs the player has never managed** — which opened the reel with
  both goals in it and no page errors. Toggling back left the league table
  exactly as it was.

  It decides nothing. Every fixture it lists was played by the same engine that
  plays yours, at the time the calendar reached it; this only reads the result
  out of the save. A goalless draw has an empty reel, so it gets no button
  rather than a button that opens on nothing — which the tests check by
  counting cameras against matches with goals, not by trusting the markup.

### Fixed

- **Shots on target were nearly double what football manages, and the corner
  count was thirty per cent over.** This started as "get corners up to a real
  rate", opened when the broadcast was measured at 2.0 corners a match against
  a real ten. Measuring it again first found the premise had moved: 2.0 is the
  **broadcast's** counter, and since the live Dugout was retired nothing shows
  it to anyone. The number a player actually reads after every game is
  MatchSim's, on the match report — and that was **13.35 a match, too many
  rather than too few.**

  The same rig found the real fault underneath it. Four hundred matches of
  mid-table against mid-table off a seeded stream, goal-rate controller pinned:

  | | game | real |
  |---|---|---|
  | shots a match | 27.5 | 25.5 |
  | **shots on target** | **17.2** | **8.7** |
  | **saves** | **14.0** | **5.9** |
  | corners | 13.4 | 10.3 |
  | goals from corners | 11% | 13% |

  One function: `onTargetChance`, `clamp(0.38 + ratio*0.22, 0.35, 0.72)`, put
  56% of non-goal efforts on target where football puts about 26%. Most of the
  corner surplus was a **consequence** rather than a fault of its own — 52% of
  saves go behind, so fourteen saves a match were manufacturing six and a half
  corners. The split, measured by call depth rather than by guessing: 47% of
  corners from a chance that broke down, 49% from a save, 4% won from another
  corner.

  It went unexamined for so long precisely because it is harmless to results:
  the goal is rolled first, and this only decides what happens to the shots
  that did not go in. Harmless to results is not harmless — it is on the match
  report as "On target", on the analytics screen as a percentage, and on every
  player's own line as "3 (2 OT)".

  Four replacements swept over 300 matches on each of three seeds.
  `clamp(0.13 + ratio*0.13, 0.10, 0.48)` was the most consistent. Shipped, on
  two seeds of 400:

  | | before | after | real |
  |---|---|---|---|
  | shots on target | 17.15 | 9.13 / 8.87 | 8.7 |
  | saves | 14.04 | 6.07 / 5.92 | 5.9 |
  | corners | 13.35 | 9.39 / 9.34 | ~10.3 |
  | a side wins no corner | 0.5% | 2.3% / 2.8% | — |

  The shape is kept, because a flat number would not be a football model: a
  better shot against a worse keeper finds the target more often, from about
  18% at a hopeless mismatch to 48% at the other end, which is roughly the best
  accuracy a real player sustains. Nothing in it knows who is playing or what
  the score is, so it is a dial on the physics rather than a thumb on the scale.

  **What it costs, stated rather than buried:** goals fall about 0.10 a match —
  all of it fewer corners producing fewer corner goals — which the division's
  goal-rate controller restores in live play and which is pinned off in the rig
  above. Corners land at 9.35 against a real ~10.3, about nine per cent under
  where they were thirty per cent over, and goals from corners at 7–10% against
  a real 13%. Closing that last gap means a second dial on top of this one, and
  one measured change is worth more than two guessed ones.

  `scripts/measure-corners.cjs` is new and is how any of this is checked again.
  It reports the corner rate the player sees, splits it by where the corners
  came from, and counts what they were worth in goals.

- **A man could be in a squad twice, and the sweep that removes duplicates
  reported the squad clean.** This was open as an intermittent test failure:
  `squad-identity` caught one duplicate in a full suite run, then passed ten
  times on its own and could not be reproduced.

  It was not flaky. The same-squad pass of `dedupeWorld` chose the survivor and
  removed the loser inside a single `Array#filter`, and when a later copy of a
  man outranked the copy already held it nulled the loser like this:

  ```js
  const at = club.players.indexOf(held);
  if (at >= 0) club.players[at] = null;
  ```

  `club.players` is still the **original** array while a filter over it is
  running — the assignment that replaces it has not happened yet — and `held`
  had already been returned true and copied into the result. So the null landed
  in the array about to be discarded, both men stayed, and `report.sameSquad`
  came back `0` because the squad was no shorter. The sweep declared a clean
  squad while leaving the duplicate in it, which is why nobody found this by
  reading the report.

  It fired only when the second copy was the better one, which is roughly half
  of them. That is the whole of the intermittency: ten clean runs were ten
  worlds that did not happen to contain one.

  Reproduced deliberately before it was touched — a copied player pushed into a
  squad both ways round, which left **one man when the copy was worse and two
  when it was better** — and the same rig after the fix leaves one either way,
  counted in the report both times. The pass now decides who survives and then
  keeps exactly those objects, which cannot have this fault. Two smaller things
  went with it: the same player *object* listed twice is now caught as well as
  two equal copies, and an id only counts as dropped once it is gone from the
  world, so a removal no longer triggers a rebuild of an XI that has no hole in
  it.

  **How often it actually bit, measured rather than assumed:** across eight
  worlds there were no same-squad duplicates at career creation at all (six to
  eight cross-club duplicates each, which the world pass has always removed
  correctly). So at kick-off this was latent. It bit when a duplicate appeared
  later — the sweep also runs on load — and when it did, it left the man in the
  squad and said it had not.

  The test that found it is now repeatable. `startCareer` takes an optional
  seed, which pins the world through machinery `src/world-seed.js` already has
  rather than adding any: `newGame` draws its world seed from `Math.random`
  before replacing it, so pinning the stream for the duration of career
  creation pins which world gets built, and the stream is put back afterwards.
  The check runs over four named worlds and names the club, both men and the
  folded name they collide on, instead of reporting `1 !== 0`. And because
  waiting for a world to contain the fault is not a test, a second one puts the
  duplicate there on purpose and tries both orderings — only one of them was
  ever broken.

- **A man could be in a squad twice, and the sweep that removes duplicates
  reported the squad clean.** This was open as an intermittent test failure:
  `squad-identity` caught one duplicate in a full suite run, then passed ten
  times on its own and could not be reproduced.

  It was not flaky. The same-squad pass of `dedupeWorld` chose the survivor and
  removed the loser inside a single `Array#filter`, and when a later copy of a
  man outranked the copy already held it nulled the loser like this:

  ```js
  const at = club.players.indexOf(held);
  if (at >= 0) club.players[at] = null;
  ```

  `club.players` is still the **original** array while a filter over it is
  running — the assignment that replaces it has not happened yet — and `held`
  had already been returned true and copied into the result. So the null landed
  in the array about to be discarded, both men stayed, and `report.sameSquad`
  came back `0` because the squad was no shorter. The sweep declared a clean
  squad while leaving the duplicate in it, which is why nobody found this by
  reading the report.

  It fired only when the second copy was the better one, which is roughly half
  of them. That is the whole of the intermittency: ten clean runs were ten
  worlds that did not happen to contain one.

  Reproduced deliberately before it was touched — a copied player pushed into a
  squad both ways round, which left **one man when the copy was worse and two
  when it was better** — and the same rig after the fix leaves one either way,
  counted in the report both times. The pass now decides who survives and then
  keeps exactly those objects, which cannot have this fault. Two smaller things
  went with it: the same player *object* listed twice is now caught as well as
  two equal copies, and an id only counts as dropped once it is gone from the
  world, so a removal no longer triggers a rebuild of an XI that has no hole in
  it.

  **How often it actually bit, measured rather than assumed:** across eight
  worlds there were no same-squad duplicates at career creation at all (six to
  eight cross-club duplicates each, which the world pass has always removed
  correctly). So at kick-off this was latent. It bit when a duplicate appeared
  later — the sweep also runs on load — and when it did, it left the man in the
  squad and said it had not.

  The test that found it is now repeatable. `startCareer` takes an optional
  seed, which pins the world through machinery `src/world-seed.js` already has
  rather than adding any: `newGame` draws its world seed from `Math.random`
  before replacing it, so pinning the stream for the duration of career
  creation pins which world gets built, and the stream is put back afterwards.
  The check runs over four named worlds and names the club, both men and the
  folded name they collide on, instead of reporting `1 !== 0`. And because
  waiting for a world to contain the fault is not a test, a second one puts the
  duplicate there on purpose and tries both orderings — only one of them was
  ever broken.

### Changed

- **A goal at forty reads forty everywhere, and the clock is what waits.**
  "The forty minute goal can't be reading us forty six. It has to be all
  correct no matter what."

  Measured first, on the shipped build: **none of sixty goals** was recorded at
  the minute the save scored it, average drift 9.3 minutes and worst 17. That
  also corrects a claim I made earlier in this changelog — that live timing was
  fine — which came from watching two goals rather than measuring sixty.

  The cause is arithmetic, not a bug. A half in the Dugout is 150 seconds, so a
  match minute is three and a third seconds of football, and no side can build a
  goal out of open play inside one. The first attempt let the picture choose:
  whatever minute the broadcast landed on became the minute in the save, so all
  four views agreed with each other — and the goal was recorded at fifty-five.

  So the save's minute is the minute, and the **clock waits**. While a goal is
  owed the match keeps being played — twenty-two men, a real move, a real
  finish — but the broadcast's clock stops on the minute the goal belongs to,
  and the save is held on the same minute. The goal is scored at forty on the
  broadcast, written down as forty in the commentary and recorded as forty in
  the report, because all three are the same number.

  Keeping the wait short is a ladder, and it replaced one that could not work
  any more: it used to escalate on how many match minutes late a goal was, and
  a stopped clock never gets later. It runs on seconds of football now — the
  ball broken to the man who is owed the goal after a second, again every
  second or so and closer to goal each time, a set piece for every third
  attempt, and a spot kick only after forty-five seconds. Measured at nine
  seconds, 42% of the picture's goals were being put away from the spot, which
  is not football; at forty-five it is 11–13%, against about 10% in the real
  game.

  Measured over ninety watched matches with a real renderer, on three seeds:
  **every one of 221 goals recorded at the minute the save scored it, and all
  ninety scorelines agreeing.** The price is the stopped clock — twenty-six to
  twenty-eight seconds a goal, about a sixth of a match — spent watching a side
  lay siege rather than watching nothing. `scripts/measure-goal-minute.cjs`.

  One caveat on the measuring: run to run, the same seed and the same code
  produce a different number of goals (72, 77, 99 across runs), so the timings
  above are ranges rather than figures. The two invariants — every minute and
  every scoreline — held in every run.

  Three real faults were found on the way and fixed:

  - **The picture's whistle went before the save's.** The broadcast blows on
    ninety; MatchSim plays to ninety plus two to five and adds more for goals
    and injuries. Those minutes were played out after the broadcast had
    stopped, so a goal in them could never be shown. The save can now ask the
    picture to keep playing (`holdWhistle`), and it does until the save has
    played its last minute.
  - **A stoppage-time goal was posted as a first-minute goal.** The record
    writes them the way a scoreboard does — `"45+3"` — and `+"45+3"` is NaN,
    which fell through to a default of 1. On the non-live path (walking into the
    Dugout on a match already under way) seven of thirty-six goals were being
    shown inside the opening seconds. That path now measures 12 of 12 matches
    agreeing on the score and on every minute.
  - **The save could run past its own goal.** It scored at 1' and ticked on to
    2' in the same pass, so the goal was written down against the minute it had
    reached rather than the minute it happened.
  - **The first half had no stoppage of its own,** so a goal at "45+2" was shown
    in the opening seconds of the second half. It now plays added time as well —
    but only while the goal it is waiting for belongs in that stoppage, or a
    match handed its whole plan up front would wait at half-time for ever on a
    goal at sixty.
  - **Stoppage time carried over the interval.** `S.stoppage` was not reset at
    the restart, so after a first half that played any added time the whole
    second half ran under the urgency and the short spot-kick fuse that belong
    to the last minutes of a match.

  `scripts/watch-dugout-match.cjs` had quietly stopped measuring anything —
  under the held-goal seam every goal sat in the queue, the fixture stayed 0-0,
  and it reported twelve goalless draws that both sides agreed on. Agreement
  about nothing is not agreement. It now covers the non-live path, which is a
  real path and was the one carrying the stoppage-time bug.

- **The Golden Boot is a top-flight award.** It was picked from every senior
  player in the world, and the lower a division is the more freely it scores,
  so the fifth tier kept winning it — across three played seasons it went to a
  National League striker on 38 and a League One striker on 31, with a Premier
  League player taking it once.

  Two separate things now. Every division keeps its **own top scorer**, fifth
  tier included. And the **Golden Boot itself can only be won out of the top
  flight of a country** — twenty first divisions across twenty countries, so a
  La Liga striker wins it if he scores most.

  "Across all competitions" needed no building, only correcting: `stats.goals`
  is totalled in `MatchSim.finish()`, which the league, the FA Cup, the League
  Cup and Europe all run through. The old mail called them "league goals" and
  they never were.

  Measured on a played season, the award goes to Nacho Ruiz of Arsenal on 30
  while the leading scorer in the world is a League Two man on 42 — who would
  have won it before. The English divisions still report 34, 29, 33, 42 and 36
  down the pyramid.

- **The draw rate: ten mechanisms measured, none of which moves it.** The
  target itself was worth checking before tuning against it — the last ten
  Premier League seasons average about **23%** drawn rather than 24%, and the
  competition has produced 31.3% (1996-97), an all-time low of 18.7%
  (2018-19) and 26% (2025-26). So the gap is real, about four points against
  the modern rate, but it is not a fixed number.

  Already right: 2.80 goals a game, per-side dispersion 1.08 (football is
  about the same), away wins 32% against a real 31%, the bottom club and
  mid-table. Wrong: home wins 41% against a real 45% — and those four missing
  home wins are exactly the four points of surplus draws.

  Tested and rejected, each over 4,560 matches or more: the gate clamps,
  slopes, multipliers and squad compression (absorbed by the goal-rate
  controller); home advantage (trades away wins for home wins, and away wins
  are already right); the day-form range both widened *and removed entirely*
  (dispersion unchanged at 1.08, draws rose to 28.0%); the calendar; the
  late-game "park" term; momentum for conceding and for scoring, both removed
  (draws rose to 27.7%); a level game given a reason to break (27.3, 26.2,
  27.5 for pushes of nothing, 6% and 14% — non-monotonic and inside one
  standard error); tilting the goal-rate trim by the quality of the matchup;
  and widening conversion (draws rose, because it raises dispersion and more
  dispersion means more goalless draws).

  The conclusion is that the draw rate is a property of how the match model
  generates a result rather than of any parameter inside it, and closing it is
  a redesign rather than a tuning pass.

- **The draw rate is 27.7%, and the reason is not what I twice thought it
  was.** Five played seasons, 1,900 Premier League matches, standard error
  0.7, on 2.80 goals a game which is exactly real. Real football draws 24%.

  Both of my earlier conclusions about it were wrong and are corrected here. A
  two-season sample suggested a played career drew only 25–26% and that the
  league-only rig was overstating; five seasons say the two rigs agree. And
  the shot-count compressor was not the cause — per-side goals vary by 1.08
  and 1.09 of their mean, slightly *above* Poisson rather than below.

  What it actually is: the game's per-match scoring means sit too close
  together. Real football draws *below* its own Poisson because a strong side
  against a weak one plays to means like 2.2 and 0.8, which rarely finishes
  level. This game's best squad scores 1.46 times the division average and
  concedes 0.76, where a real champion is 1.70 and 0.62 — so every matchup is
  nearer even than football's, and near-even matches draw.

  Every uniform lever is absorbed by the goal-rate controller, which holds the
  division at 2.80 by trimming every side alike and in doing so keeps those
  means bunched. A late push for a level game was tried and measured at 27.3,
  26.2 and 27.5 for pushes of nothing, 6% and 14% — non-monotonic, inside one
  standard error, and not shipped.

- **The Dugout is a view of the match again, not the match.** Watching in the
  Dugout was a different game from watching the same match on the Pitch tab,
  reading it as rolling text, or simulating it. While the broadcast was
  driving, a goal MatchSim scored for itself was turned into "a chance that
  did not quite come off" and the goals that counted were the ones the picture
  scored. No season measurement could ever have caught it, because every one
  of them runs through `quickSim`.

  **MatchSim decides in every view now**, and the broadcast performs what it
  decided. Two mechanisms hold it: each goal is posted to the picture through
  the engine's own `addGoal` as the save scores it, and the script is armed
  empty at kick-off so an active script refuses every goal the picture is not
  owed. Across forty matches it refused 473 of its own.

  **And the minute is the picture's to choose.** MatchSim decides *that* a
  goal happens and *who* scores it; it cannot decide *when* it is seen,
  because the broadcast needs a few minutes of pressure to build one out of
  open play, and a minute fixed in advance is a minute the picture then has to
  hit — measured, it could not. So the save's record, and the commentary line
  with it, takes the minute the picture put on it. One minute exists rather
  than two. The score, the scorer, the penalty flag, the ratings, the morale
  and the stats are all still MatchSim's.

  Verified over forty matches with real squads, through the engine's own
  headless mode:

  | | |
  |---|---|
  | picture showed exactly the score the save recorded | **40 of 40** |
  | every goal's minute agreed, save against picture | **40 of 40** |
  | goals still owed at the whistle | **0** |

  The cost, stated plainly: the picture takes about six match minutes to build
  a goal, so one the engine simulated at 40' is recorded at about 46'. The
  result is untouched; the timestamp is the broadcast's.

- **Added time in which nobody played.** The broadcast engine kept a match
  alive while a goal was still owed — but the `return` that added the stoppage
  sat above every line that plays the match, so the added time invented to let
  that goal be scored was added time in which the clock ran, the scoreboard
  updated and twenty-two men stood still. The goal could not arrive and the
  match blew up on its safety cap with the plan unpaid. It was why goals the
  save recorded after the 87th minute were never shown at all.

- **The league table measures right, and the entry below overstates its own
  precision.** Thirty seasons of the shipped engine, played on one world seed
  with the match stream seeded so the run repeats:

  | Premier League | measured | real |
  |---|---|---|
  | champion | 85.3 | 87.6 |
  | 2nd | 80.0 | 80.5 |
  | 4th | 71.8 | 70.1 |
  | mid-table | 48.7 | ~49 |
  | bottom club | 21.5 | 20.7 |
  | goals a game | 2.7 | 2.8 |
  | champion is the *n*th best squad | #2.7 | #2 |
  | table against squad strength | 2.6 places out | ~3 |

  Thirty seasons produced eight different champions. Two things follow from
  that table, and both are corrections.

  The first is that the entry below quotes before-and-after numbers to one
  decimal from four seasons of a rig that seeded the world but not the
  football. MatchSim calls `Math.random` for the possession contest, every
  gate, every shot and every save, so two runs of identical code play
  different seasons: the same settings measured twice returned a champion on
  84.7 and then on 79.7. The change it describes is real and the direction is
  right, but four unpaired seasons cannot support one-decimal precision and
  those figures should be read as "about eighty, then about eighty-seven".

  The second is that a claim made after it — that the champion was six points
  short and the top of the table would not separate — came from the same
  four-season measurement and is simply wrong. Measured properly the champion
  is within two points of real football and second, fourth, mid-table and the
  bottom club are within one or two. **No balance value has been changed on
  account of it.**

  What is wrong is narrower: the game draws **27.3%** of league matches
  against a real 24%, finishes 0-0 in 9.6% against a real ~8%, and wins at
  home 40.9% of the time against a real 45%. Away wins are already right, at
  31.7% against 31%.

  The cause is not the match engine. Played with squads reset to full
  condition, morale and fitness before every match, the same engine draws
  25.2% and finishes only **4.4%** goalless, scoring 2.92 a game on 14.7 shots
  a side. The surplus arrives with what a season leaves on a squad —
  injuries, morale, sharpness — and whether the game over-models those is the
  open question. The goals are not even over-dispersed: variance over mean is
  0.84, slightly *under*, so nothing is bunching goals into matches.

  **Every mechanism that could plausibly cause it has now been measured and
  ruled out**, each over 4,560 matches or more, and the draw rate sits between
  27.3% and 28.2% through all of them: the gate clamps, slopes and
  multipliers; the squad-average compression; the shot conversion slope; two
  poor squads meeting (4.9% goalless against 4.4% overall); the day-form range
  (widening it 0.90–1.10 to 0.82–1.18 moved the split half a point); home
  advantage; the calendar (five days' recovery between matchdays and seven
  give identical results — condition saturates by five); the late-game "park"
  term, below; and the response to conceding, where removing it *entirely*
  moves draws 27.3% → 27.7% and one-all 11.6% → 11.4% while costing the
  champion three points. Squad wear is not excessive either: 2.6 players
  unavailable a club against a real 3 or 4.

  So the draw rate is a structural property of the match model — a per-minute
  possession contest feeding two gates and a shot — and not of any parameter
  in it. Closing the last three points needs a change to the model's shape,
  which is a far larger piece of work than tuning and ought to be a deliberate
  decision rather than something slipped in. Nothing further should be
  attempted by turning knobs.

- **A comment that lied about its own code, and the code was right.** In the
  last ten minutes the engine gives one side 5% more defensive resistance.
  `agf` is the goals of the side with the ball, so the condition `aga<agf`
  fires when the side *defending* is losing — a team a goal down digs in while
  it chases. The comment beside it said "leading side digs in", the exact
  opposite, and it read like a one-character typo.

  It was measured before being touched. Swapping the condition to match the
  comment made every headline number worse over twelve seasons: home wins
  40.9% → 39.0% against a real 45%, draws 27.3% → 28.2% against a real 24%,
  the champion 84.5 → 82.3, and the table followed squad quality *less*
  closely, the champion falling from the 2.3rd best squad to the 3.5th. The
  engine has been balanced around the behaviour it actually has, so the code
  stands and the comment was corrected to describe it.

- **Winning the league costs what it should.** Premier League champions were
  averaging 76 points across five measured seasons — one title won on **69
  with eleven defeats** — against a real ~87.

  The cause was one line. When a goal went in, the side that **conceded** got
  +5 of momentum and the side that **scored** got +3: conceding was worth more
  than scoring, a built-in equaliser and a draw factory. Home advantage barely
  existed alongside it — half a per cent off the away side's attack, with the
  crowd showing up in possession and nowhere else.

  Measured A/B on one seeded world, four seasons each, so this is the change
  and not the weather:

  | Premier League | before | after | real |
  |---|---|---|---|
  | champion's points | 80.8 | **87.8** | 87 |
  | 2nd | 76.8 | 80.5 | 80 |
  | champion's record | 24.3W 8.0D 5.8L | 27.5W 5.3D 5.3L | 28W 3D 7L |
  | champion is the *n*th best squad | #3.3 | **#2.3** | #2 |
  | table against squad strength | 2.9 places out | 2.3 | ~3 |
  | goals a game | 2.7 | 2.7 | 2.8 |

  Goals a game did not move, so none of it was bought by inflating scoring.

  **A correction worth recording.** An earlier measurement reported that the
  champion was the *thirteenth* best squad in the division and the table
  finished eight places from squad strength — worse than random — and was
  read as an engine that ignores quality. That was the rig, not the engine. It
  looped every pair as `for a { for b { … } }`, which is not a season: each
  club played nineteen home matches back to back while its opponents played
  one each, and the clubs sit strongest first, so the best squads burned
  through their home fixtures against fresh opposition. Played against the
  game's own Berger round robin, the same engine put United, City and
  Liverpool top on 87, 80 and 78.

### Changed

- **The rule the game is built on, written down and then measured: nothing is
  scripted.**

  > "we are not making a game where it scripts out the [results]. A player's
  > input into signings and keeping players fit and their morale up — that will
  > have an input on how well they do… Obviously, if you had the best player in
  > the world in your team, you'll have a better chance of winning. So not
  > scripted."

  It is now the first thing in `CLAUDE.md`, above everything else, with the line
  drawn where it can be applied: **the causal direction runs one way only** —
  what the manager does decides how good the side is, which decides the result —
  and nothing may pick a result and work backwards to it, for his club or for
  the ninety-odd others. Calibration that cannot see who it is acting on (the
  goal-rate controller trims every side alike and cannot see the table, the
  fixture or the score) is a dial on the physics, not a thumb on the scale. The
  test is whether the mechanism knows the identity or the standing of the club.

  **And then measured, because a rule nobody checks is a wish.** `effA` does
  multiply every attribute by condition, sharpness, morale and the team talk —
  but a term being present says nothing about whether it is big enough to change
  a season. `scripts/measure-inputs.cjs` (new) plays 1,200 matches a variant
  against the same opponent off a seeded stream, healing both squads before
  every match, and reports what each input is worth over a 38-game season:

  | input | −  | | base | + |
  |---|---|---|---|---|
  | morale 20 / 45 / 72 / 95 | −9.9 | −4.8 | — | +1.3 |
  | condition 60 / 80 / 100 | −27.8 | −17.9 | — | |
  | sharpness 35 / 70 / 95 | −11.7 | | — | +4.9 |
  | best man / best three injured | −4.0 | −8.1 | | |
  | every attribute −2 / +2 | −55.1 | | — | +36.2 |

  Every ladder is monotonic, every sign is right, and **squad quality dominates
  everything else**, which is the shape the rule asks for. Fitness is the largest
  thing a manager controls week to week at 28 points a season; morale bites
  harder going down than it rewards going up, which is about right for a
  dressing room.

  `tests/manager-inputs.test.cjs` (new) guards the ordering rather than the
  numbers, so the match model stays free to change while a knackered squad can
  never be as good as a fresh one.

  **The rig was wrong twice before it was right**, and both faults are worth
  recording because they would fool anyone measuring this again. Replaying one
  fixture hundreds of times lets `tickOnce` injure real players and the injuries
  stick to the club — the first run reported 568 goalless draws in 600 and
  looked like a dead match model, when it was two teams of crocks. The goal-rate
  controller separately read the repetition as a scoring glut and trimmed almost
  every goal away. And the test itself failed on its second run until the world
  was seeded: `startCareer` builds an unseeded one, so which clubs sit ninth and
  tenth changes each time, and that swamped morale's effect — 0.26 points a game
  on one run, 0.045 on the next.

- **The Dugout stops being a live view and becomes the highlights.** "Remove
  dugout mode. It's just not working. It's just forcing penalties for the goals.
  I think we should use that visual engine to create highlights at the end of
  the game."

  He is right, and every measurement in this changelog agrees with him. Watching
  live meant the broadcast had to score a named man's goal inside a named minute
  while a save file ran alongside it — and a half in the Dugout is 150 seconds,
  so a match minute is three and a third seconds of football. Nobody builds a
  goal out of open play in that. Every bridge built over the gap cost something:
  posting the goal early moved the record (the save took the picture's minute,
  so a 40th-minute goal was written down as the 55th); holding the clock made
  the minutes exact — 221 of 221 — and stopped the clock for thirty seconds a
  goal; the escalation ladder put **42% of the picture's goals away from the
  penalty spot**, and pushing the spot kick out to forty-five seconds only
  brought that to 11%.

  All of it was the price of one constraint: the picture and the save agreeing
  *while both are running*. Removing the constraint removes every one of those
  problems at once.

  **Live play is now Pitch, Text and Stats** — the same engine in all three, as
  it has always been, with nothing to force and nothing to disagree about.
  Verified: kicking off gives tabs `pitch, comm, stats`, the live driver can
  never take a match (`LIVE.want` false, `state.failed` true), and a played
  match records its goals with **zero penalties** among them.

  **The reel plays afterwards.** Each goal is handed to the broadcast on its
  own, as a plan of exactly one event, and the caption carries the minute out of
  the save — because the goal has already happened, there is nothing to race.
  The engine's own five-second celebration, which a live match never had time
  for, is what plays after the ball goes in.

  Getting a moment to come off quickly was measured rather than guessed, over
  thirty goals from ten matches, headless at full speed:

  | staging | landed | median |
  |---|---|---|
  | wait for the siege | 24 of 25 | 12.0s |
  | ball to the scorer in the box, every tick | 10 of 26 | 13.0s |
  | staged once, retried after three seconds of nothing | **27 of 30** | **4.5s** |

  The middle row is the interesting one: re-staging every tick took the ball off
  his foot before he could hit it. Staged once and left alone, a moment comes
  off in four and a half seconds and **no moment in any run was a penalty**.

  Nothing is deleted. `src/dugout-matchday.js` stays where it is, because its
  squad conversion, kit conversion and mount are exactly what the reel needs.

  **The reel plays when the whistle goes, not when a button is found.** It was
  a button first, and the button could not be placed: full time hands the
  controls to the dressing-room panel, whose `.dr-wrap` is `height:100%` of
  `#mCtl`. A button at the top of `#mCtl`, a button appended inside the wrap,
  and a button floated over the match screen were all measured as present,
  visible and 366x46 — and all three had `.dr-grp-b` answering at their centre.
  Three attempts at the same wrong idea. What was asked for was simpler: when
  the match finishes and there were goals, the goals play. Closing the reel
  leaves the manager in the dressing room, which is where full time was always
  going to put him. Verified through a real match played by the game's own
  timer, both halves, to `stage: FT` — the reel opens by itself.

  **And every match you have already played.** A finished fixture keeps
  everything a reel needs and always has — measured across a played season,
  **242 of 257 completed fixtures carry their full goal list** (minute, scorer,
  club, penalty flag), and the fifteen without one are the goalless draws. So
  nothing new is stored and the save format does not change: the reel is rebuilt
  from the record whenever it is asked for, and the match report grows a "Watch
  the goals again".

  The one thing a past fixture does not keep is the eleven who were on the
  pitch, because MatchSim is long gone. `autoPick` names a side for any club —
  the same call the engine makes for every AI team — and the men who actually
  scored are seated in it by hand, because the engine finds its scorer by id and
  a goal by somebody left out of today's side would otherwise be scored by a
  stranger. Verified on a fixture from earlier in the season: four goals, both
  minutes and sides matching the record, both elevens named, every scorer
  seated, and the squad converting cleanly for the broadcast.

  **Three ways to the goals, and none of them a dead button.** The reel plays
  itself at full time; after that it is offered wherever the game already
  surfaces a finished match — the match report, and the calendar day, which is
  the one screen already listing that match's scorers.

  The calendar entry is worth recording because everything about it measured
  correct while it did not work: the wrapper installed, the day's event found,
  the fixture played, the reel holding three goals, the sheet 901 characters
  long — and no button. `insertBefore` needs a direct child, the close button is
  nested a level down in that sheet, and the NotFoundError went into a catch. It
  goes through the close button's own parent now, and a test pins it above
  Close.

  A second fault came out of writing that test rather than from running the
  game: `seatTheScorers` asked for the first outfield slot every time, so when
  two scorers were both out of today's side the second was seated on top of the
  first and the first vanished again. Each one takes a different shirt now.

  **What is not verified:** how the reel looks at real speed. Under headless
  software rendering the engine gets about one frame a second, so on-screen
  playback here is measuring SwiftShader rather than the reel. The staging logic
  is measured at full speed; the picture needs a device with a GPU to judge.

- **Four layout faults fixed, one diagnosed and left alone.** "improve the
  visual layout but keep all functionality" — so nothing here changes what a
  control does or what a screen contains. `src/layout-polish.js` is all pixels.

  The method is the story. Reading screenshots produced three confident faults
  in a row that were not faults: the Continue dock "covering" the bottom of
  every screen (the scroller has had padding for it for months, and all eleven
  screens scroll clear — measured); the tab rails "cut dead" at the right edge
  (they have an edge fade that sizes itself to how much is actually hidden); a
  section's value "colliding" with the rule beside it (a ten-pixel gap, and the
  value sits a clean seventeen pixels off the glass). So `scripts/audit-layout.cjs`
  was built to decide it by measurement instead, over seventeen screens, and
  what shipped is only what survived that.

  * **Your own country's chip was printed over the next one.** On the league
    table the home country is `position:sticky` so it stays reachable however
    far the rail is scrolled — with a background of `rgba(255,255,255,.03)`, so
    the chip sliding underneath showed straight through it. Measured: England's
    chip ended at x=106 while France's began at x=85. Twenty-one pixels of two
    flags on top of each other. Now opaque.
  * **The shortlist star was a 17x21 target**, on every row in the market. The
    glyph is the right size; the hit area was not, and they are not the same
    thing. Extended to 44px with a pseudo-element, so nothing moves.
  * **The calendar's month arrows were 24x32.** Same fault, same fix.
  * **Two-letter chips were 39x32 and lopsided** next to "Premier League". A
    floor on the width evens the rail and widens the target; the height is
    extended the same way, so the rail keeps its 32px rhythm.

  Measured after: zero controls under 40x40 that a thumb cannot reach, zero
  controls covered by something else, zero elements past the screen edge, and
  the only two remaining overlaps are both by design (the two-layer star rating,
  and sticky doing what sticky does).

  **And the fifth, which needed markup rather than CSS.** A transfer row reads
  "23 · unscouted" and rendered "3 ·" — the age losing its first digit, so a
  33-year-old showed as three, on every unscouted row in the market.

  The chain: `.pright` measures 178px because `.psub`, the wage line, is
  `white-space:nowrap`; `.prow`'s third grid track is `auto` so it takes that
  first; the 1fr track holding the name, club and age is left with 76px; and
  `.pmeta`'s `text-overflow:ellipsis` — which would trim this neatly — is inert
  because `.pmeta` is also `display:flex`, so the age is squeezed to nothing and
  cut from the left instead.

  Four CSS attempts were measured and three regressed the row, each caught by
  the audit inside a run. Making `.pmeta` a block cost *more* information than
  it saved — the crest jumped to its own line and both the age and the scouting
  status were lost. A min-width floor overflowed the grid and printed the two
  columns across each other by 57px on every row. Letting the third track shrink
  moved neither width, because its max is still max-content.

  None could work, because none addressed the cause: **a long line of text was
  in the narrow column.** `pRowInner` puts `opt.sub` beside the rating pill, and
  for almost every row that is right — a squad row's sub is a value or a wage,
  six to nine characters. The market's is thirty-one that will not wrap, and it
  is the only one wide enough to starve the column beside it. So only that one
  moves: over sixteen characters it goes under the player's details, under it
  nothing changes at all, which leaves every other screen exactly as it was.

  Measured after: `.pmeta` 76px → **214px**, `.pright` 178px → **40px**. The
  row now reads "Jude Bellingham / Real Madrid · 23 · unscouted" in full, and
  the squad screen is pixel-identical to before.

### Added

- **The draw rate: closed as not reachable from these constants, with the
  evidence to stop anyone reopening it.** Roughly forty settings have now been
  measured across three sessions. The last of them was the most promising and it
  is the one that settles it.

  Raising the chance floor and ceiling together (`chanceLo` 0.41→0.45,
  `chanceHi` 0.57→0.66, `chanceMul` 0.70→0.63) was aimed at the blank rate — the
  weak side's attack measured 0.54× the division average against a real 0.62×,
  so lifting the floor should have cut the goalless games. Run paired against
  baseline on **three seeds, 24 seasons each — 27,000 matches a side**:

  | | base | candidate | delta | per seed | verdict |
  |---|---|---|---|---|---|
  | draws % | 28.2 | 27.8 | −0.4 | −1.0, +1.1, −1.3 | **sign flips** |
  | goalless % | 11.2 | 10.9 | −0.3 | −0.6, +0.2, −0.6 | **sign flips** |
  | a side blanks % | 30.3 | 29.3 | −1.0 | −1.3, −0.6, −1.0 | same sign 3/3 |
  | champion pts | 85.8 | 84.4 | −1.4 | −1.4, −2.5, −0.2 | same sign 3/3 |
  | bottom pts | 21.4 | 22.5 | +1.1 | +0.1, +1.3, +2.0 | same sign 3/3 |

  So the two numbers it was aimed at do not move — they flip sign between seeds,
  which is what noise looks like — while the two costs are real and repeat every
  time: the champion loses a point and a half against a real 87, and the bottom
  club climbs past the real 21 it was already sitting on. The blank rate does
  fall by a point, reliably, and that is not worth a flatter league.

  Raising all three ceilings instead (`possHi`, `buildHi`, `chanceHi`, so the
  best sides can run away) was worse on every count: draws 29.2%, blanks 31.5%,
  goalless 12.5%, and total goals down to 2.6.

  **Why no constant can do it.** Both phases of chance creation are
  `sigmoid(attack − defence)`, and they multiply. A side facing a strong defence
  is cut twice, so its rate collapses to roughly 60% of the even-match rate,
  which is a per-side λ near 0.86 and a 42% chance of not scoring — against 24%
  at the division average. That fat low tail is where the goalless games come
  from, and it is a property of multiplying two symmetric sigmoids, not of the
  numbers fed into them. Any constant that thins the tail does it by making the
  two sides more alike, which adds drawn matches at the same rate it removes
  goalless ones. That is the trap, and it is why forty settings all land between
  27% and 29%.

  A fix has to break the symmetry — the defence suppressing chance QUALITY while
  leaving chance COUNT closer to the attacking side's own level — and that is a
  change to how `tickOnce` generates chances, not a number in `SPREAD`.

- **The draw rate has a name now: it is the goalless games.** Two new lines in
  `scripts/measure-title-race.cjs`, and between them they turn a symptom nobody
  could shift into a fault with an address.

  The ask was to get draws from 28% closer to 23%. Twenty more settings were
  measured on top of the ten from the last pass — home advantage in three
  places, the parking bonus, momentum for and against, the shot-count steering,
  the squad compression, all three sigmoid bands and their slopes and
  multipliers, and the chance/finishing split. **None of them moves it.** The
  whole sweep sits between 27% and 29%, and the two that looked like they had
  found something were both noise: `compress: 0.95` read 26.4% over eight
  seasons and 27.95% over twenty-four on two seeds, which is exactly the
  baseline.

  So the thing to measure was not the draws. What the new lines report:

      a side fails to score in 30.1% of team-innings   (Poisson on these means: 26.2%)
      goalless matches 10.9%   (Poisson would give 6.8%, real football about 8%)

  1-1 measures right at 11.4% and 2-2 right at 5.1%. **Every point of the draw
  excess is 0-0s.** The question was never "why so many draws" — it is "why do
  so many sides fail to score at all", and that is a different fault needing a
  different fix.

  Two suspects were killed outright, which is worth as much as the diagnosis:

  * **Momentum is not the cause.** Turned off entirely — `momScore: 0,
    momConcede: 0`, no feedback at all from scoring or conceding — the blank
    rate is 30.5% and goalless games 11.3%. Unchanged.
  * **Nor is chance quality versus chance count.** The obvious reading of the
    blank rate is that a strong defence suppresses how *many* chances you get
    where it should suppress how *good* they are, so weight was moved out of
    the chance sigmoid and into finishing (`chanceK` 3.2 → 1.6, `shotK` 0.42 →
    0.85). Blanks got worse, at 31.9%, and goalless games worse at 11.5%.

  And the trap that makes this look tunable when it is not: every route to
  fewer blanks inside these constants works by making matches more even, which
  adds draws as fast as it removes them. Compressing all three bands cut blanks
  to 28.2% and pushed draws *up* to 29.7%, with the champion collapsing from
  85.9 to 80.5.

  The arithmetic that bounds the whole thing, since it was never written down:
  two independent Poisson sides on the real Premier League means, 1.53 and
  1.27, draw 25.0% and the home side wins 43.4%. Real football draws 23–24%, so
  it sits *below* independent Poisson; this game sits 2.2 points *above* it. No
  constant in `SPREAD` crosses that gap, because the gap is the shape of the
  scoring distribution rather than its level.

- **`scripts/audit-menus.cjs` — can you click on everything, and does anything
  happen?** Walks all 19 screens, clicks every one of 488 controls one at a
  time from a restored starting state, and reports three things: which threw,
  which changed nothing at all, and which elements are dressed as controls
  without being wired to anything.

  The result on the shipped build is **0 threw, 0 dead, 0 inert-but-clickable**,
  and statically all 294 `data-action` values in the markup have handlers. Every
  finding it produced along the way was the instrument rather than the game, and
  each is now fixed in the rig, which is the only reason the clean run means
  anything:

  * it compared the first and last 400 characters of a screen, so the entire
    Tactics screen read as dead — every chip on it moves an `on` class in the
    middle of the markup and leaves both ends identical. It hashes the whole
    screen now.
  * it counted clicking the tab you are already on as a dead control, which
    buried the handful that mattered under twenty that did not.
  * it snapshotted synchronously, so the three save-slot buttons — which await
    the store before they write — all read as dead.
  * it ignored `#toast`, which is one element that changes its text, so
    "⬇️ Save file exported" counted as no response.
  * it treated `.kpi` and `.row` layout tiles as buttons and produced 146
    phantom rows. What the browser says the cursor is over an element IS the
    test for "a player will try pressing this", and it uses that now.

  What it does not yet cover is the depth behind the doors — modal sheets and
  the match screen. The first attempt at crawling those ran unbounded and hung;
  it has a time budget and per-sheet caps now, but no clean run has come out of
  it, so that half is not claimed.

- **`SPREAD.trimTilt`, shipped at 0 and changing nothing.** The goal-rate
  controller holds a division at 2.80 by trimming every side's goals alike,
  which keeps the *ratio* between a good attack and a poor one but shrinks the
  *difference* — and the difference is what decides whether a match finishes
  level. Set above 0 the trim is tilted by the strength of the attack against
  the defence it faces, so a mismatch moves apart while the division still
  lands on its target. Measured over 9,120 matches it puts the champion on
  86.9 and second on 81.6 against real 87.6 and 80.5, and moves the draw rate
  0.6 points, which is inside the noise. It is off because the table already
  measured right and the draw rate is what was being asked for.
- **`src/golden-boot.js`** — every division's top scorer, and the Golden Boot
  itself restricted to the top flight of a country, counted across every
  competition.
- **`scripts/measure-title-race.cjs`** — a whole division played with the
  game's own `quickSim`, pinned to one world seed so two runs can be compared
  at all. Reports what the champion finished on, whether the table follows
  squad strength, the home/draw/away split between evenly matched sides, and
  head-to-heads between the strongest and weakest squads home and away. A
  season takes seconds instead of the ten minutes a played career needs.
- **`scripts/measure-league-history.cjs`** — whole careers through the game's
  own controller, capturing every division's final table, the cup winners and
  the golden boot inside `endSeason`, which is the last moment the standings
  still exist.
- **`scripts/sweep-balance.cjs`** — what the table *would* look like under
  different balance settings, several settings a run, one browser and one
  seeded world. It does not play seasons: three seasons a candidate carries
  about five points of noise on a champion's total and every difference worth
  arguing about is smaller than that. Instead it plays each of the 380
  fixtures several times, counts its win/draw/loss probabilities, and then
  draws the table three thousand times from those in arithmetic — which
  removes the noise rather than averaging over it. The last row of every
  report is the control measured a second time, and the report says in words
  whether it reproduced.

  It also reports what the strongest and weakest squads score and concede as a
  multiple of the division's average, which is where real football gives a
  target that is not an average of averages: a champion scores about 1.70
  times its division's average and concedes about 0.62 times it.

  What it deliberately leaves out is everything a season does to a squad over
  its length — fatigue, injuries, suspensions, form — so a setting it likes is
  played out in `measure-title-race.cjs`, which now takes balance overrides as
  a fifth argument, before anyone believes it. Comparing the two says the
  played season spreads noticeably wider at both ends.
- **`scripts/measure-scoreline-shape.cjs`** — what is underneath the
  scoreline. For thousands of matches it records how many shots each side had
  and how many went in, and reports the shot count and its spread, how often a
  side fails to score, the variance of the match's goal total against its mean
  (Poisson has them equal, so anything above 1.0 is goals bunching into
  matches), and all of it split by whether the two squads are both good, both
  poor, or mismatched. It is what established that this game's draw surplus is
  not in the match engine at all.
- **Named balance constants.** The numbers that decide how much of the gap
  between two squads survives into the result were literals scattered through
  `tickOnce` and one patch layer: the clamps on possession, on getting out of
  your own half and on turning possession into a sight of goal, the slopes
  under each of those sigmoids, the multipliers over them, how much a
  finisher's advantage over a goalkeeper counts, how far squad averages are
  pulled towards the mean, and what playing at home is worth in each of three
  places. They are now one `SPREAD` object with the reasoning written beside
  them, so a tuning run is an argument rather than an edit. **Every value is
  exactly what it was**; this is instrumentation, not a balance change, and
  `tests/balance-constants.test.cjs` reads all nineteen out of the running
  game and checks them against the literals they replaced, so that claim is
  verifiable rather than a promise and the numbers cannot drift unnoticed.

### Fixed

- **The `dugout-live` flake, found and closed.** The assertion that
  `m.goal()` moves the score failed about once in fourteen, and two rounds of
  investigation had ruled out every candidate — VAR off before and after, live
  mode off, the right match, a shooter found, the match not over, and the score
  simply not moving.

  It was the **goal-rate calibrator**. `wA3_balance` ("how a goal becomes a
  save") turns `goalCal(div).trim` of all goals into saves to hold the
  division's goals-a-game target, and that starts at **6%**. `m.goal()` has
  never been a promise that the score moves; VAR was only ever half the reason.

  `scripts/probe-dugout-flake.cjs` now prints the trim and, with it set to
  zero, scores **20 out of 20** in the same page — so the cause is measured
  rather than argued. The test neutralises the calibrator the same way it
  already neutralised VAR, which is narrower than widening the assertion.

### Known

- **The bottom of the table is now too weak.** The same change costs the last
  club three points — 20.8 to 18.0, against a real 24 — because a side that
  concedes first no longer gets the equalising boost that was propping it up.
  Top-to-bottom spread is 70 against a real 52.
- Fourth place comes out on 73.5 where the real number is 69.

### Changed

- **Every attribute now does something, and there is a rig that proves it.**
  "All attributes should make a difference" is a claim you can argue about or
  measure. `scripts/measure-attribute-effect.cjs` measures it: two identical
  elevens, every attribute at 12, then one attribute raised to 18 on one side
  and dropped to 6 on the other — plus a **control row with nothing varied at
  all**, which turned out to be the most important line in the table.

  - **`leadership` did nothing whatsoever.** It was in the attribute list and
    in the table the generator uses to weight a position, and nowhere in play:
    a squad of captains played exactly the same football as a squad of
    passengers. A captain does not take the shots, he organises, so it is a
    team number rather than a personal one — the best man in the side carries
    most of it and the dressing room the rest — and it leans a little on three
    things: keeping heads when passing under pressure, winning second balls,
    and not diving into tackles. Measured at **+2.0 shots and +0.27 goals** a
    match, the size of composure or vision, which is right for it.
  - **`heading` had one job that almost never came up.** It set the accuracy of
    a header once a man was already taking one, and had no say in whether he
    got to the ball — so a 4-heading winger out-jumped an 18-heading centre
    half by standing a few inches closer. A ball above chest height is now a
    contest, weighted on heading and strength.
  - **`firstTouch` and `strength`**: taking a driven ball down was free for
    everybody. The quicker it arrives, the more a poor touch lets it run.
    Strength now moves the loose-ball share by nine points across its range.

- **The engine counts duels now** — loose balls and aerials won, per side, in
  `getState()`. They are ordinary match statistics, and they are also the only
  instrument fine enough to tune with: a match gives one scoreline and about
  ten shots, so the control row swings **±3 shots between runs of forty-four
  matches** and anything smaller than that is noise. It gives 150 loose balls,
  which settle down in a handful of matches.

### Known

- **This engine plays on the floor.** With duels counted, a match produces
  **3 to 5 aerial contests against about forty in real football**. Heading
  works now, but it cannot matter much until the game plays more balls in the
  air — more crosses, more long balls, contested goal kicks. That is a bigger
  job than this one and it is logged rather than glossed over.

### Changed

- **Pace shows on the pitch.** "Every player seems the same speed" was correct,
  and here is the number: top speed was `5.6 + 2.4 × (0.25 + pace × 1.25)`,
  which put an entire squad between **7.7 and 9.2 m/s — an 18% spread across
  the whole range of the attribute**. Measured over a full match every player
  reached his own top speed, and they were all within a stride of each other.
  Real football is about 7.5 m/s for a slow centre-half and 10.3 for the
  quickest men alive, a 37% spread.

  The scale is the real one now — `6.00 + 4.40 × pace`, with a heavier man
  paying a little for it — and the same match measures **7.7 to 10.4 m/s, a
  34% spread**, with Saka at 10.4 and a bottom-half centre-half at 8.1.
  Cruising is his own too: everybody used to jog at a flat 70% of top speed,
  where work rate and stamina now set it between 62% and 84%, which is most of
  the match. And the run cycle reads against *his* top end rather than a
  constant, so a 10 m/s winger and a 7.7 m/s centre-half both look flat out
  when they are flat out. `scripts/measure-player-speed.cjs` prints the table.

  Faster football is a different game, and the first measurement of it was
  worse: the better side's win rate fell in every fixture (a top-six game went
  from 9 wins in 16 to 5, with six draws) because less time on the ball costs
  the better team more than the worse one. Winning a loose ball now leans
  harder on reading it — the term added last week went from 1.05 to 1.80 —
  and the balance came back past where it started:

  | | before speed | after speed | after both |
  |---|---|---|---|
  | top v sixth | 9/16 | 5/16 | 11/16 |
  | top v worst (4-4-2) | 16/16 | 13/16 | 14/16 |
  | top v worst (4-2-3-1) | 8/16 | 6/16 | 12/16 |
  | top v worst (3-5-2) | 10/16 | 6/16 | 8/16 |
  | top v worst (5-3-2) | 14/16 | 12/16 | 10/16 |
  | top v worst, away | 16/16 | 15/16 | 15/16 |

  Corners came up with it, from 2.0 a match to **3.3**.

### Changed

- **The dugout is the match now, and it decides the result.** The broadcast
  engine used to perform a result that had already been calculated: walking
  into the dugout played the whole ninety minutes instantly, handed the goals
  to the picture as a script, and let it act them out. It worked and it was
  wrong — the manager screen would sit on **FULL TIME 0–3 while the broadcast
  was still goalless in the first half**, which is a screenshot of a game
  arguing with itself.

  The authority is inverted. The broadcast plays out of the players you picked,
  and the save follows it minute by minute. Three seams do it:

  - **The clock.** MatchSim advances a minute at a time and is ticked only as
    far as the minute on the broadcast clock, so the commentary, the stats, the
    scoreline and the picture are reading the same minute by construction.
  - **The goals.** Every goal in this game goes through
    `MatchSim.prototype.goal`, which is the only thing that moves the score. A
    goal MatchSim invents for itself now becomes a chance that did not quite
    come off; the goal that goes through is the one the broadcast has just
    scored, with its scorer, its minute and its penalty flag.
  - **The whistle.** MatchSim is held a minute short of full time until the
    picture blows, so the save cannot finish before the match does.

  Watched end to end at match speed: the picture scored at 25′ and the save
  recorded `24' Gonçalo Silva`; at half time both read **2–1** with the same
  three scorers at the same minutes. Everything MatchSim is good at — bookings,
  injuries, substitutions, fitness, ratings, its commentary voice — carries on
  untouched. What it no longer does is decide the result.

- **Full screen means the match.** It used to switch itself on in landscape and
  stay on, so the bar ended up over the home screen with no match in sight. It
  is no longer a mode you enter but a condition that is checked four times a
  second: a match screen that is open, on the dugout tab, with the broadcast
  running in it. Kick-off now opens on the dugout, because that is where the
  football is.

- **A loose ball is a duel, not a measurement.** Who reached a loose ball first
  was pure geometry, and geometry is set by the formation — so a four-point gap
  in quality could be beaten by a spare holding midfielder. Measured: the same
  two squads, one always in 4-3-3, produced **12 wins from 12 against a 4-4-2
  and 5 from 12 against a 4-2-3-1**. Reading the ball, reacting to it and
  getting a yard on the man beside you is now worth about half of the 1.35 m
  control radius between the best in the division and the worst. Shape still
  matters; it no longer decides the match on its own.

### Added

- **The technical areas.** Two managers on the touchline, working the edge of
  their boxes and pointing people twenty yards further up, and four
  substitutes a side — two on the bench, two warming up along the strip behind
  the assistant referee. They use the players' rig and run cycle, so there is no
  second animation path to keep working.

- **Substitutions you can see.** A change in the save is a change on the pitch:
  the man coming on takes the place of the man going off, in his own shirt
  number with his own attributes and his own build, and one of the substitutes
  warming up stops warming up. It is watched rather than wired to the sub
  sheet, because changes are made in half a dozen places across the game — the
  sub sheet, a forced change for an injury, an AI manager chasing a goal — and
  the only thing they all agree on is who is on the pitch.

- **Corners that actually happen.** Throw-ins, goal kicks, free kicks, offsides
  and penalties were already played out; corners were in the code and almost
  never occurred — **2 in six matches**, because every parry and every block
  was sent back up the pitch and every clearance went forward, however
  desperate. The ticker even said "pushes it behind" while the ball went the
  other way. A keeper at full stretch now turns it round the post 62% of the
  time, a defender blocking deflects it behind 34% of the time, and a defender
  hacking one clear inside his own box puts it out 30% of the time. Measured
  again: **2.0 corners a match**, in most matches rather than one in six. Real
  football runs at about ten, so this is closer rather than right.

### Fixed

- **The second half kicked off with everyone standing where the first one stopped.**
  `el()` returns null while the match host is detached — the game rebuilds a tab
  whenever you look at another one, and the engine's own comment says so — and the
  half-time line was `el('period').textContent='2ND'; kickoff(1);` with no guard.
  Half-time ending while you were on any other tab threw on `.textContent`, which
  killed the frame before `kickoff(1)` could run: no repositioning, no centre spot,
  twenty-two men in their first-half positions defending the wrong ends. The
  restart now goes first and unconditionally; the scoreboard is cosmetic and can
  miss a beat, the kick-off cannot. The other three unguarded HUD writes are
  guarded too.

- **The goalkeeper dived on the spot while the ball bounced off the post.** When the
  match plan blocks a goal, the engine fires the keeper's dive and pushes the ball
  back off the line -- but it never moved the keeper. He threw himself sideways
  where he stood while the ball was repelled by the paint several metres away, so
  a save read as the ball rebounding off nothing, which is what it was. The engine
  has already decided the shot is saved, so the keeper is the one who saves it now:
  he gets across to where the ball is going as far as his reflexes, agility and
  handling allow, and the ball comes off him. What he cannot quite reach he gets
  fingertips to, and the more stretched he was the further the rebound runs away
  from him.

- **Every defender ran the same way at the same moment.** The off-ball line was
  `t.x*.55 + ball.pos.x*.45` and `t.y*.6 + ball.pos.z*.4` — identical weights for
  all ten, all reading the ball on the same frame — so moving the ball two metres
  moved every target by the same fraction of it and the block slid across the
  grass as one piece. Now each man reacts to what *he* has seen: `p.seen`, a
  delayed extrapolated read refreshed on his own thinking timer, already existed
  for all twenty-two and was being used by two. How far he leaves his post is his
  own blend of positioning, decisions and marking against work rate, aggression
  and off-the-ball, so a disciplined centre-half holds shape while a busy
  midfielder goes to the ball. Defenders and midfielders now pick up a man rather
  than a patch of grass, assigned from the back so two players cannot take the
  same opponent and leave another free, and how tightly he stays is his marking.
  With the ball, wide players hold the touchline until play comes to their side,
  full-backs overlap if their work rate says they can get back, and a deep
  midfielder screens instead of joining in.


- **The wrong team kicked off after a goal, and the wrong team celebrated it.**
  Everything that happened after a goal was decided by `S.score[0]>S.score[1]` —
  which asks who is winning, not who just scored, and gives a different answer
  whenever the scoring side is still behind. Three goals down and pulling one
  back, the team that scored was judged the loser and made to restart, while the
  side three up ran to the corner flag celebrating a goal it had just conceded.
  The replay caption named that side too. The engine now remembers who actually
  scored and the conceding team restarts, which is the rule.

- **Goal replays showed players with their legs together, sliding.** The stride is
  driven off each player's velocity, and a replay writes positions frame by frame
  without ever touching velocity — so everybody kept whatever speed he happened to
  hold when the ball crossed the line, which after the freeze and the celebration
  is nothing. The replay buffer already stores how long each frame took, so the
  velocity is recovered from the distance between consecutive frames rather than
  invented, and the legs run at the speed they actually ran at.


- **The broadcast froze whenever you looked at another match tab.** The engine
  found its scoreboard with `document.getElementById`, which is right for a
  page that is nothing but the engine. Here it lives in a tab the manager game
  rebuilds, so switching to Tactics detached the host, every id vanished from
  the document and the next frame threw on `el('clock')` — the match stopped
  exactly when you were making the tactical change. It searches its own host
  now, which is held as a reference whether or not it is on the page.

- **Full screen was a 554-pixel box with the class on it.** The frame carries an
  inline `position:relative` from the moment it is built and an inline style
  beats a stylesheet rule. Written inline now: measured 844×390 at the top of
  the screen.

- **A phone with no WebGL stood still for twelve seconds before the match
  started.** The broadcast fails when its renderer is constructed, which was
  swallowed and reported as "not ready yet" -- so the dugout rebuilt the whole
  stadium and ran the boot again on every frame, and only a timeout eventually
  handed the match back to the tested 2D renderer. Failing to boot is now
  final, and it is noticed where it happens. Measured with WebGL switched off
  in Chromium: the match is running on the 2D renderer inside a second, and
  the broadcast is not attempted again.

- **The lit tab chip never followed the tab.** The strip is written by
  `buildMatchScreen` and switching tabs only rewrites the body, so the highlight
  stayed wherever kick-off left it. Measured stuck on Pitch before this change
  and stuck on Dugout after it; correct now.

- **The advertising boards were a blurred smear.** Every panel is authored at
  512×128, which is the right shape and the wrong number of pixels for a camera
  that sits a few metres from the near boards. The strip renders at twice that
  with the context scaled, so none of the artwork had to be re-measured, and
  there are six sponsor panels rather than three, each with its own strapline
  and a bar of its own colour.

### Fixed

- **Free agents showed NaN on every row, and clicking one took you back to the
  list.** Both faults were in the free-agent tab and both had the same shape: a
  layer reaching past the function that was supposed to be used.

  A save stores free agents compactly, as plain arrays, and `faList()` is what
  turns them back into players — in place, on first read. This list read
  `G.freeAgents` directly, so until something else happened to call `faList()`
  every row was built out of an array: no name, no age, and every number `NaN`.
  Reproduced exactly by putting the pool back into compact form: **40 `NaN` and
  80 `undefined` across 20 rows**, now 0 and 0. It is also why it looked fine
  "after the first time" — opening the game's own free-agent modal calls
  `faList()`.

  The rows were wired to `faOpen`, and the live `ACTIONS.faOpen` **ignores its
  argument** and reopens the whole modal; an earlier definition did take a player
  id and this one overrode it. Clicking a player took you back to the list you
  were already looking at. Rows now open a card for that player — his asking
  wage, whether it fits your wage room, whether he would come, and the offer
  button. Deliberately not `faSign`, which signs on the spot with no
  confirmation, and not the game's `openProfile`, which looks players up in
  `G.clubs` only and would read `G.clubs[-1]` for a man with no club.

  Rows also print what he actually asks (`faAsk`, which falls the longer he
  waits) rather than what his last club paid him.

- **The free-agent market could not be browsed or filtered properly, and a big
  club could not search for anybody cheap.** Three faults, all in the free-agent
  tab this repository added.

  The wage brackets slide with your money, which fixed the original problem —
  Premier League rungs bracket nothing for a non-league club — but broke the
  mirror image. Managing Manchester United the cheapest bracket on offer was
  **£15,000 a week**, so there was no way to ask for a free agent on two grand.
  The ladder now runs from the bottom up to a ceiling set by your budget instead
  of showing only the top eight rungs: the cheapest offered is £500 a week, and a
  "wage up to £2k" search returns 77 players across 4 pages where it could not
  previously be expressed at all.

  The free-agent list stopped at twenty and told you to tighten the filters to see
  further down, while the market tab beside it paged through everything — so the
  one list you actually browse was the one you could not. It now pages: 212 free
  agents, 11 pages, same control as the rest of the market.

  And it applied seven filters while silently ignoring the rest. Mood, fitness,
  squad role and the attribute minimum did nothing on this tab, so the panel said
  it had filtered and had not — asking for pace 16+ returned all 212 players.
  It now returns 2. It also filters on the wage he would want *here*, which is
  what the market tab has always used, rather than what he was last paid.

- **The test suite was failing about one run in three, and never the same test.**
  `a season does not fill the treatment room` failed with 2 injuries against a
  floor of 3, then with 20 against a ceiling of 16; later `the story layer writes
  nothing the game reads back` failed with no story letters at all. Each looked
  like a defect in the system it tested, and none of them was.

  All three were the suite, not the game. Measured: the injuries file passes 6 of
  6 run on its own and the statistic sampled 22 times never left its window; the
  story file passes 6 of 6 on its own. Every failure came from a full run, which
  on this four-core machine executed test files in parallel — and both failing
  tests are long careers whose day-by-day work does not finish under contention,
  so they assert against a shallower season than they played.

  `npm test` now runs at `--test-concurrency=2`. A full run is 179 of 179 in 35
  minutes, against 27 minutes with a failure at the default and 65 minutes
  sequential. Nothing about the shipped game changes; the assertions were left
  exactly as they were, because widening them would have hidden this rather than
  found it.

- **The story repeated itself word for word inside a career.** Measured across
  three careers, only 3% of sentences were shared — the story really is built out
  of your results rather than a script, and the reporter, his paper and his
  temperament already differ per career. But *within* one career the same kind of
  beat used one fixed phrasing, so two milestones a fortnight apart read
  identically apart from the name, like a mail-merge. The reporter's temperament
  also reached exactly one line of the whole layer: the opening of the monthly
  column. A sceptic and a romantic filed the same note about everything else.

  Each beat now has several phrasings, chosen from the reporter's name, his
  temperament and the beat's own key — stable when you re-read a letter, different
  for the next player to reach the same milestone, different again under another
  byline. Same career now yields "Dalot reaches 50 appearances" beside "Tielemans
  quietly passes 50"; between-career overlap stays at 2%.

- **Stadium and facility prices were Premier League numbers charged to all 484
  clubs.** Rebuilding the ground cost a flat **£380,000,000** whether you were
  Manchester United or a National League side with £376,000 in the bank. A phase
  of seats was a flat £40m plus £1.15m per 1,000 seats, so the smallest ground in
  the National League was quoted £44m — **117 times its entire bank.** The
  training centre (£22m), academy (£18m) and redevelopment (£45m) were flat in the
  same way. Below the Championship, none of it could ever be bought.

  Prices now scale two ways. A phase of seats is proportional to the ground —
  floor 1,500, ceiling the old 8,000 — at a price per seat that climbs with the
  size of the bowl, with a mild reputation factor so a League Two club that
  inherited a 16,000-seat ground is not billed like a giant. The facility
  upgrades scale by club reputation, `(rep / 7950) ^ 2.5`, an exponent fitted to
  the five English tiers rather than guessed; reputation is used instead of league
  so all twenty countries are priced without a lookup table. A rebuild is priced
  off the ground at four phases of expansion.

  Measured, median club per tier, against the median bank at that level:

  | tier | ground | bank | + seats | rebuild | academy |
  |---|---|---|---|---|---|
  | NL | 7,856 | £428k | £700k | £2.8m | £700k |
  | L2 | 16,587 | £1.2m | £3.6m | £14.4m | £1.5m |
  | L1 | 7,800 | £3.0m | £700k | £2.8m | £2.3m |
  | CH | 23,404 | £14.1m | £13.3m | £53m | £5.3m |
  | PL | 30,400 | £142m | £24m | £96m | £18m |
  | Man Utd | 74,310 | £263m | £88m | £352m | £23m |

  Growing a non-league ground from 3,500 to over 20,000 seats is now six phases
  and **£10.4m in total** — less than a quarter of what one phase used to cost —
  while Old Trafford still costs £352m to rebuild, near the £380m it always was.
  A partial redevelopment is also capped below the price of a full rebuild, which
  it exceeded at the bottom of the pyramid.

- **Losing the WebGL context threw an uncaught error instead of falling back.**
  This is the one failure that is specific to phones: a handset drops the GL
  context routinely — backgrounding the tab, taking a call, memory pressure —
  where a desktop browser practically never does, which is why it survived until
  somebody took the context away deliberately.

  A canvas that has held a WebGL context returns `null` from `getContext('2d')`
  for the life of the element. The context-lost handler defers its cleanup with
  `setTimeout(0)`, so a frame drawn in that window handed the dead canvas to the
  2D fallback, which paints without a null guard and threw; its catch then called
  the legacy dugout, which does the same thing, and *that* throw escaped. The
  renderer now hands the fallback a fresh canvas before delegating to it. Proved
  by removing the one call again: the `TypeError` comes straight back.

  Added `scripts/check-dugout-mobile.cjs` — the mobile path at a phone viewport
  under real WebGL, which now takes the context away on purpose and checks the
  match keeps playing through it. It is not a phone and says so: frame rate on a
  real mobile GPU, heat and battery still need hardware.

### Changed

- **The game is now `index.html`.** CrazyGames loads that name and nothing else,
  and until now it was a redirect page pointing at `red-devil-manager.html` — so
  every load on their platform would have taken a navigation hop through a holding
  screen before the game started. The game is that file now, and the old name is a
  one-kilobyte shim redirecting the other way so existing bookmarks, and anything
  installed while the manifest still pointed there, keep working. `npm run serve`
  already mapped `/` to `index.html`, so `http://localhost:4173` opens the game
  directly instead of the redirect.

  Twenty files referenced the old name, almost all a single path string; the game
  file mentioned its own name only in a comment. The service worker's navigate
  fallback and `CACHE_NAME` (v30) moved with it, so an installed copy replaces its
  cache rather than serving a page that is no longer there. The handoff documents
  still name the old file and have deliberately been left alone — they are records
  of work done when that was the name, and `AGENT-ONE.md` belongs to another agent.

### Fixed

- **José Mourinho was managing Real Madrid and Benfica at the same time.** So were
  fourteen other men, in pairs, across the world — De Zerbi at Tottenham and
  Marseille, Pierre Sage at Crystal Palace and Lens, and twelve more in the lower
  divisions and abroad. Two causes. The three real managers are in the game twice
  because it holds two separate manager lists that nothing reconciles: one keyed by
  club code and curated for 2026/27, another keyed by club name covering the rest
  of Europe. The other twelve are generated names — a club with no entry draws from
  its country's name pool seeded off its own key, and four hundred and fifty
  independent draws from a pool that size collide, which nothing was checking for.
  A club the game names by hand now keeps its man, so Mourinho stays at Real
  Madrid; whoever loses a collision gets a fresh name from his own country's pool
  rather than inheriting a real person's job. Measured across the world: 484 clubs,
  484 distinct managers, no man in two jobs.


- **The sign-on fee could not be offered at all in the bottom two divisions.** The
  field stepped by £50,000 and defaulted to three weeks' wages rounded to the
  nearest fifty thousand. In the Premier League that is sensible. In the National
  League, where the asking wage is about £1,400 a week, three weeks is £4,200 —
  which rounds to **zero**, and the smallest offer the control would accept was
  £50,000, or forty-one weeks of his wages and more than most budgets at that
  level hold. Anybody below roughly £8,300 a week saw a term that defaulted to
  nothing and could not be nudged. The acceptance formula was never the problem;
  it has always measured the fee against the asking wage. The control now offers
  three weeks' wages on a step sized to the money involved: £50 a click in the
  National League, £500 in League Two, £50,000 in the Premier League, which is
  unchanged. Measured across the pyramid, the default goes from £0 to £4,200 (NL)
  and £0 to £13,500 (L2), while the Premier League stays at £1,050,000. The
  release clause had the same fault — a flat £1,000,000 a click, more than a whole
  National League squad is worth — and now steps by the player's value.


- **A CrazyGames SDK adapter, written to be safe while its API names are
  unconfirmed.** `SDK.init` during loading, `loadingStart/Stop` around building a
  world, `gameplayStart/Stop` around a match, and every local save mirrored to
  `SDK.data` gzipped and base64'd. Their documentation is unreachable from the
  build sandbox, so no name in it has been checked against the real thing — which
  is why every call goes through one guarded dispatcher. A missing namespace, a
  property that is not a function and a method that throws are all tested, and all
  produce a no-op rather than an exception. **With no `window.CrazyGames` present
  the game behaves exactly as it does now**, which is every offline install, and
  the tests prove that rather than assume it.

  It refuses to pretend the save fits. Measured through the real save path with
  the world keeping its full history: 8,931 kB raw, 2,377 kB gzipped and base64'd,
  against a 1,024 kB cap. Over the cap it keeps the local save, skips the cloud
  write and says so once, rather than writing a truncated file or failing quietly.
  It also only fetches the SDK where it could plausibly exist — framed, or on
  their host — so an offline install never calls out to a CDN.

  And it reads the cloud save back, which is the half that makes it a save rather
  than an upload. A device with no career of its own — a new phone, a cleared
  browser — pulls one down, validates it through the same checker as any local
  save, and writes it into the `auto` slot so CONTINUE YOUR CAREER appears
  normally. A device that already holds a career is never touched: no overwrite,
  no merge, no asking a player to choose between two versions of their own season.
  Verified in a real browser — a 5,578 kB career packed to 1,712 kB and restored
  byte-for-byte, loadable by the game. `data.getItem` is awaited, so it works
  whether the platform returns a string or a promise; the first version type-checked
  for a string and would have reported a promised career as no career at all.

- **The upload itself is now built and tested, not assembled by hand.**
  `npm run upload` produces `dist/the-results-business.zip` — `index.html` at the
  root, every path relative, and none of the repository's tests, handoffs or
  `node_modules`. Its file list is read out of `service-worker.js` instead of
  being kept separately, so the offline install and the upload cannot disagree
  about what the game needs; anything on disk the service worker does not list is
  reported, because that is a hole in the offline install too. It then extracts
  the zip, serves it, loads it in an iframe and builds a world, failing on any 404
  outside the deliberately-absent audio pack. Proven by deleting a module from the
  list: three of the five checks went red.

  `npm run framed` runs the same iframe arrangement against the working tree with
  the SDK stubbed on an intercepted route. Until it existed, the half of the
  adapter that only runs on their platform — the gate opening, the script tag, the
  load, `attach()` — had never been executed anywhere: the test suite runs without
  an SDK on purpose, and every browser probe loads the game unframed from `file://`.

- **The world no longer forgets its seasons.** A save was discarding two things.
  `trimCareers()` kept 24 match-log entries for your own squad, 4 for the division
  you play in, and **none at all for the other 460 clubs** — so a rival striker's
  record came back empty after a reload. `trimFixtures()` dropped the scorers and
  events of every played match you were not in, about nine thousand a season, so
  after a save nobody had scored in any of them.

  Both are off. Measured through the game's own save and load, one season played:
  2,010 players outside your division carry a match log and all 2,010 survive the
  round trip; 15,003 log entries in the world and 15,003 come back; 8,176 matches
  you were not in still know who scored. The written file now carries exactly what
  the world holds, not a fraction of it.

  It costs space, which was the reason the trimming existed: the stored save goes
  from 7,264 kB to 10,073 kB. That is a deliberate trade — a career you run for
  thirty years is a world with a past, and a game you cannot ask about its own
  history is not one you can understand.

- **You could not search for a free agent, because no free agent was in the search.**
  The market search walked `G.clubs[].players`, and a free agent is not at a club —
  he lives in `G.freeAgents`. So one had never appeared in a result. The only way to
  see them was a list at the bottom of the transfers screen, sorted by ability, with
  no name search, no position filter and no age filter: finding a left-back on a
  free transfer meant reading a hundred and ninety-eight rows.

  A **contract filter** sits above the sort row: *At a club*, *Free agents* and
  *Expiring*. Free agents get their own searchable list — name, position, age,
  overall, potential, wage and every sort reach them. Expiring is a man in the last
  year of his deal: cheaper now, free in the summer, and the most useful filter in
  the game for a club with no money. A free agent's row says what he is, asks no
  fee, and opens wage talks rather than a bid to a club that does not exist.
  `askPrice` is guarded too — it reads `G.clubs[p.club].players` and would have
  thrown on the first free agent ever to reach a market row.

  The club market itself is untouched, and that is deliberate. The first attempt
  rebuilt the search, copying the version that is easy to find in the file — and
  the live one is four thousand lines further down, carrying filters for overall,
  potential, fee, wage, contract length, morale, fitness, role, attribute and
  nationality, budget awareness and pagination. Replacing it threw all of that
  away silently. The suite caught it on a pagination assertion.

  **And the search comes first now.** Measured on a phone: the name box sat 768px
  down a 5,359px page, behind the loan market, the transfer budget, a rebalance
  slider and three scouts. It sits at 203px. The standalone free-agent list is
  replaced by a card that switches the filter, because the search does that job
  properly and the list was most of the page.

- **The tactics pitch overlapped names and fitness, and that was my fault.** When
  the pitch was unsquashed I put the position label and the fitness tag on one line
  and made the tag flow inline rather than float. It measured clean — because I
  measured it on day one of a career, when the tag reads `100%`. Once a player has
  a form average it reads `99% · 6.2`, which will not sit beside `AML` in a 62px
  token, so it wrapped to a third line, grew the token about fifteen pixels and ran
  it into the row below. Four months into a season it is unmissable.

  The fix is fewer lines, not more: eleven tokens have to share a 522px pitch and
  the tightest rows are twelve pixels apart, so a token that needs three lines
  cannot be made to fit by adjusting the text. **Condition is now the ring around
  the shirt** — green, amber, red, which is what fitness at a glance actually means
  — **and form is a small pill on it**, mirroring the rating badge on the other
  side. An injury turns the pill into a cross. What is left under the shirt is the
  name and the position: two lines, fixed, that cannot grow whatever the season
  does. The exact percentages are still a tap away on the player's profile.

  The screen sweep could not see any of this: a tactics token is absolutely
  positioned inside the pitch, so it is not a card, not a section and not a direct
  child of the view — the overlap pass had never looked at one, and reported zero
  faults on the broken screen. It measures every token and every pill now, and
  running a career two hundred days in rather than sixty, because before that
  nobody has a form average and the bug cannot appear.

- **There were two Erling Haalands.** A 66-rated one, generated, at Bodø/Glimt, in
  the same world as the real 91-rated one at Manchester City. The name generator
  builds a player from his country's first-name and surname pools, and the
  Norwegian pools contain both "Erling" and "Haaland" — because they are ordinary
  Norwegian names, which is exactly why they are in there. Sooner or later it put
  them together. One collision in 11,645 generated players, so rare rather than
  widespread, but it is the most recognisable name in the game and a second one
  tells you immediately that the world is made up. A generated player is no longer
  given a name that belongs to a real one. Two men called Lewis Entwistle in
  different divisions are left alone: real football is full of shared names.

- **The ball teleported, and that is why you could not follow the match.** The
  complaint was about fast forward — "I know it's all in fast forward but you just
  can't tell what's going on the pitch" — but sampling the rendered ball on every
  animation frame through real matches found it at every speed: it moved more than
  15m in a single frame about twice a match minute, worst step 96.6m, which is the
  length of the pitch. Nothing was wrong with the actions being shown. What was
  missing was everything between them: each staged action plants the ball at the
  carrier's boot, and consecutive carriers can be at opposite ends, so the ball
  vanished and reappeared. It now travels — a real discontinuity opens a short,
  arced transit from where the ball actually is to where play has moved, which is
  what that transition was: a clearance, a switch, a ball hooked forward.
  Measured after: zero steps over 15m at 1x, 2x or 4x, worst 11.8m, and the ball
  reaches the net on a goal in 79 frames against 11 before.

- **The working copy reverted itself mid-session, five times now.** Not a game bug — a
  note for whoever looks after the environment. During one session the local checkout
  jumped back to an old commit (`ffcb227`, several cycles behind) on its own, with no
  `checkout`, `reset` or `stash` that would explain it: the branch had been hard-synced
  to `204738d` and pushed successfully from there minutes earlier, and
  `git rev-parse HEAD` later returned `ffcb227` again.

  Each time, stale mid-edit copies of `src/playoffs.js` and `tests/playoffs.test.cjs`
  reappeared as uncommitted changes — an **incomplete** six-club National League play-off,
  carrying three of the five markers the finished version has. The remote was correct
  throughout (`main` at `a55d771`, the branch at `204738d`).

  The danger is the combination: a stop hook asks for uncommitted changes to be committed
  and pushed, and following that literally would have committed the half-finished play-off
  over the finished one and regressed it. They were discarded instead. Anything automated
  that commits on a hook's prompt should diff against `origin/main` first, and a session
  should hard-sync to `origin/main` before touching anything.

  **The fifth occurrence cost work, and it is worth saying how.** It took the checkout back
  to `ffcb227` again and, along with it, everything in the working tree that had not been
  pushed — the session's scratch measurements and their logs. What had been committed and
  pushed came back untouched from the remote; what had not, did not. The rule that follows
  is not "commit more often" as a matter of taste: on this machine an uncommitted file is
  not stored anywhere, and a measurement worth quoting is worth committing before it is
  quoted.

- **The mailbox was unusable in landscape.** Measured at 844x390: the sheet came
  back 520 wide and 343 tall with 598px of content in it — using the portrait sheet,
  wasting 324px either side, and starved on the one axis it could not grow on. And
  two filter rows were being drawn on top of each other, because `gameplay-balance.js`
  and `mailbox.js` had each added folders without knowing about the other. Between
  them, the header and the "read the unread" button, 343px of sheet had about sixty
  left for mail: one message, partly visible. One row of folders now, and in
  landscape the sheet takes the width it had been ignoring — 820 of 844.

- **"Worth knowing" never stopped knowing it.** Most of that card clears itself,
  because it is rebuilt from live state: pick your eleven and the warning goes,
  renew a contract and it goes, answer a letter and it goes. The exception was the
  letter you never answer — an optional one keeps its options for ever, so it sat on
  the home screen until the ninety-message inbox cap eventually pushed it out. Those
  now have a fortnight's shelf life, and when one expires another takes its place
  rather than leaving a hole. The letter itself is untouched: it stays in the inbox
  with its options intact, it just loses its claim on the front page.

- **The tactics screen was wrecked in portrait, by me.** A rule I added to put the
  pitch above the formation picker turned the view into a flex column — and a flex
  item shrinks by default, so a scrolling page with eighty-one children compressed
  every card into a strip with its contents spilling over the one below. Measured
  after the report: `.pitchbox` came back `clientHeight=0` against
  `scrollHeight=30`. The rule is gone rather than patched: nobody asked for the
  reordering, and the way to be sure a layout change cannot break a screen is not to
  make it. The screen sweep has been taught to spot a box shorter than its own
  contents — the question it was not asking when it passed this — and now lives in
  `scripts/sweep-screens.cjs` behind `npm run sweep`.

- **The goalkeeper never moved when a goal went in.** The block that made the
  conceding side react put every man in that side into the hands-on-head pose from
  the moment the goal started — including the keeper, so the one player whose job
  is to react to the ball spent its entire flight standing in front of his net with
  his hands on his head. He dives now, and the dive is derived from where the ball
  is actually going: which way from where it is placed across the goal, how flat
  from how high it finishes, how far he gets from how wide it is. Observed across
  four real matches: a driven finish (lift 0.33, roll 0.34), a curled one (0.20,
  0.29) and a header (0.17, 0.18) — three different dives, and he stood still for
  none of them.

- **Every goal looked the same, and the scorer never raised his arms.** Two
  separate faults. The celebration pose lived in an `else if (type === 'goal')`
  underneath a branch that already matched goals, so it was dead code — the scorer
  ran to the corner with the posture of a man taking a throw-in. And the strike
  technique was only known when the commentary happened to describe it, which it
  usually does not, so nearly every goal fell through to one generic kick. An
  unclassified strike now gets one seeded from the event, weighted the way goals
  are actually scored, and the commentary still wins when it says something. There
  are three celebrations rather than one.

- **Faces had a light sitting on them, and the chinstrap was a strap.** The rim
  light was a white oval six units wide lying across the cheek of a nine-unit-wide
  face — at small sizes it read as a bloom in the middle of the face rather than
  light down the side of a head. And the chinstrap was drawn as a band whose outer
  half fell outside the head, so the clip kept the inner edge: a stripe across the
  cheeks with skin on both sides. A chinstrap is what is left of a full beard when
  the middle is shaved out, so it is drawn that way now — the beard mass with the
  head's own outline scaled down and painted back in the face's gradient, leaving a
  rim that follows the real silhouette.

- **Turning the phone sideways showed a black screen.** The match screen is hidden
  until a match starts (`#matchScreen{display:none}`), and the landscape layout added
  `#matchScreen.mvwide{display:grid}` — one class more specific, so the moment the
  phone was turned the empty, full-screen, near-black panel was told to display
  itself over the whole game. Whether a panel is on screen is no longer something a
  layout class can decide.

- **In landscape, nearly every screen drew through itself.** Sweeping all
  twenty-one screens in both orientations: portrait clean everywhere, landscape
  broken on thirteen of them — twenty overlapping pairs through the stadium hero,
  one 227px deep on the Stats tab. The two-column grid was sizing rows as though
  the cards were empty (the stadium hero: 359px tall, in a 2px row), because a box
  that clips or scrolls contributes nothing to an `auto` track. Four candidate
  fixes were measured against the same screens; `grid-auto-rows:max-content` is the
  one that keeps both the columns and the clipping. Zero faults now, on all
  forty-two screen-and-orientation combinations.

- **The training ground had no door on it.** When the Club and World screens were
  split into two doors, Training was not carried across to the club side — the only
  way in was the fifth chip on the squad screen's scrolling tab strip, off the right
  edge of a 390px phone. It is back under The club, and there is a Training tile on
  the home screen beside Tactics.

- **The tactics pitch drew itself on top of itself.** Measured at 390x844: tokens
  65px tall with the fitness tag hanging to 80px, in formation rows as little as
  54px apart — five overlapping pairs, so names, positions and fitness were written
  over the row below. The position and fitness now share one line, the token is
  trimmed, and the pitch is closer to a real pitch's proportions. Zero overlaps.

- **The League Cup was frozen at the third round in every save.** A round is drawn
  only once the round before it has been played, but the date came from a fixed
  table written before the season started — so when a round ran late the next one
  was born in the past. In a traced career the third-round draw fired on day 85 and
  dated its sixteen ties day 78. Ties are only ever played by an exact match on
  today's date, so those sixteen were unreachable for the rest of the season, and a
  season-end guard then settled the whole competition in one sweep with no rounds,
  no draws and no chance to play in it. A tie is now never dated before the day it
  was drawn, and anything already stranded in the past is pulled back onto the
  calendar. Your own tie is moved forward so you play it, never resolved behind your
  back.

### Added

- **The club picker tells you about the job before you take it.** It was a grid of
  crests — twenty at a time, a three-letter short form and nothing else — so you
  chose a club knowing its badge and its name and found out about the money, the
  ground and the size of the task afterwards. Every club in the world was already
  carrying its reputation, transfer budget, stadium, capacity and a star rating;
  none of it was on screen. Now you land on a club and read it: difficulty in
  stars, what there is to spend, how many the ground holds, where the club stands,
  and a line on what is expected of you — *"Everything is expected. Anything less
  is a crisis"* at Manchester United, *"Small money, long odds, and a long way up"*
  in the National League. Twenty-eight league tabs cover the English pyramid in
  order and then the rest of Europe, the tiles carry each club's budget under the
  badge, and the start button names the club you actually chose so you cannot take
  the wrong job by accident. Taking a job and building your own club sit at the top
  as equal ways in. A club outside the Premier League has no squad until the world
  is generated, so it is not shown one rather than being shown invented names.


- **A full save fits after all — 812 kB against the 1 MB the shop allows, with 212 kB
  spare.** Every club, every player in the world, every attribute, every fixture and
  result, every cup tie, every player's match log and career record, restored exactly
  as left. The reduced-fidelity model that had been planned — rival clubs kept as a
  strength rating and a few named men — is not needed and has been dropped. The reason
  a full save had looked impossible turned out to be one thing nobody had looked at:
  every attribute is stored as a full-precision float, `12.292376410679863` where the
  screen shows `12`, and nineteen of those per player across sixteen thousand players
  is about 2.4 MB of mantissa that no compressor can touch. Pinning them to a tenth
  leaves a player identical to within 0.05 of a rating that is only ever displayed as
  a whole number, and took 2,710 kB of encoded attributes down to 561 kB. The rest
  came from treating uniform data as tables rather than text: career totals as columns
  instead of a 94 kB blob, match logs as a 15,000-row side table instead of 114 kB of
  JSON, and the world's 484 club records, 8,781 fixtures and cup ties through the same
  encoder. Measured end to end at 3,332 kB byte-exact, 1,089 kB with the world seed
  carrying what has not changed, 812 kB finished.

- **A world is a number now, and the same number gives back the same world.** The
  save is 16.24 MB and the shop it ships in stores 1 MB, so the only shape that
  fits is to keep the seed a world was built from and build it again on load —
  which was worth nothing while the same seed gave a different world every time.
  Two fresh careers in the same club used to differ in the *number of players*
  they contained: 9,899 one run, 9,902 the next. Generation is now driven by a
  seeded stream for the duration of world-building and for that duration only, so
  a career records four bytes that reproduce it exactly, and the football after
  kick-off is as random as it ever was. Two causes, and only one of them was the
  obvious one: 317 unseeded random calls sat on the generation path, and the two
  lookup tables that describe the world rather than your career (`LEAGUES`,
  `DIV_NAMES`) are filled in by the first career of a session and left behind for
  the next, which had the fixture list laying 380 rows on one build and 1,046 on
  another from the same seed. Measured after: four builds from one seed — two in
  fresh pages, two in a page that had already played twenty days of a different
  career — identical down to the count of random numbers drawn (86,170). Nothing
  about the save file has changed yet; existing careers are untouched.

- **A story that runs alongside, and cannot touch the football.** A local
  journalist — one man for the career, with a name, a paper and one of four
  temperaments, generated once and stored — writes a column at the turn of every
  month, assembled entirely from what actually happened: the record, the goals for
  and against, the movement in the table, the high point and the low one, who is
  scoring and who is making them. He also notices the things the save already knew
  and never said: the academy boy who made his debut, the captain at thirty-four in
  the last year of his contract, a fiftieth goal, a hundredth appearance, the man
  you sold who is scoring somewhere else. His opinion follows your results instead
  of leading them.

  **The rule is the design: it reads game state and never writes anything the
  engine reads back.** No morale nudge, no reputation bump, nothing that shifts a
  fee, a rating or a scoreline — a player who never opens one of these letters
  plays exactly the same game as one who reads every one. That is not a promise
  but a test: the suite snapshots every club, player, fixture and competition,
  drives the whole layer hard, and asserts nothing changed but the layer's own
  drawer. The columns are also filed rather than only posted, because the inbox
  caps at ninety and ordinary post pushes them out — measured across two 300-day
  careers, one ended with seven still in the tray and the other with one. They are
  kept, and readable from the Media centre.

- **A statistics centre, built on numbers the game was already keeping.** Every
  match, for every player in the world, the engine has been banking passes
  attempted and completed, key passes, tackles and tackles won, interceptions,
  clearances, duels, aerials, dribbles, saves, fouls and minutes. None of it was
  visible: the whole statistics screen was three top-ten lists and a history
  table, and the only advanced figures anywhere were nine boxes on the profile of
  a player at your own club. It is now five rooms — **Players** (every man in any
  division, five metric groups, sortable on any column, filtered by position and
  by appearances), **Teams** (the league table plus the squad behind it: size,
  age, mean rating, wage bill, value), **Your squad** (full stat lines, totals or
  per 90), **Matches** (the engine's own match reports, kept rather than
  replaced) and **Records** (the leaders and your career history). Because it
  reads existing bookkeeping rather than adding any, it costs nothing in save
  size, which matters more than usual with a 1 MB limit waiting at the other end.

- **Match ratings, match by match.** A season average says a player is a 7.1. It
  does not say he was a 6.2 until Christmas and an 8 since. The engine kept
  twenty match reports league-wide and then threw them away, so nothing
  remembered a player's own season. Every man at your club now carries his last
  twenty ratings and his profile draws them as a graph, with the match he scored
  in marked and a rising/steady/falling read on the last five against the run.
  Your club only — twenty small numbers for thirty players is free, and for ten
  thousand players it is a megabyte the save cannot spare.

- **A mailbox you can actually keep.** Every letter now carries a star and a bin,
  there is a *Clear read* sweep, an ⭐ Important folder, and an *Ignore* sheet that
  mutes a whole kind of post — a muted kind files itself straight into the archive
  on arrival rather than into the inbox, so it is out of your way but not destroyed.
  One rule overrides all three: a letter waiting on a decision cannot be deleted,
  muted or filtered out of sight, because the season does not move on until it is
  answered and a mailbox that lets you throw those away is a mailbox that bricks
  the save.

- **Twenty-six more press conference topics, and a hundred and four new questions.**
  The variety machinery was never the problem: the game already remembers the last
  220 lines you were asked and filters them out, and dresses a repeat differently
  when one is unavoidable. The shortage was the bank. Every question carries a
  predicate saying when it applies, and on an ordinary Wednesday before an ordinary
  league game most of them do not — the post-match ones, the cup-final ones, the
  relegation ones are all out — so what was left drained in a fortnight. The new
  ones are weighted toward the ordinary week, which is the week that repeated: the
  opposition manager, the referee, the pitch, the schedule, rotation, agents, the
  academy, a player's dip in form, your own future, ticket money, the international
  break, what the pundits have been saying. Four ways of asking and four ways of
  answering each.

- **You choose how a transfer fee is paid.** The bid sheet now carries a *How you
  pay* row: in full now, or spread over two, three or four years — four years being
  a quarter on signing and a quarter in each of the next three summers. Spreading it
  is not free, because a selling club would rather have the money today: they want
  six per cent more for every year they have to wait, so the same deal costs
  eighteen per cent more in total over four years. In exchange the budget test is
  against this year's instalment rather than the whole fee, so you can commit to a
  £40M signing on a £12M budget — with the board's existing ceiling on total
  transfer debt still deciding how far that can go.

  The ledger underneath this is Agent One's, and it is not rebuilt: `G.fin.owed`,
  the summer settlement, the letter that reports it and the finances panel all
  already existed. What was missing was the manager. The structure used to be
  decided from the size of the fee by a table — over twenty million was always four
  years — and you were told about it afterwards in the post.

### Changed

- **Every voice in the game is a British man.** The press room already asked for a
  gender and already filtered the browser's voices by it, so the code looks like it
  should have worked. Two things defeated it. Half the press pack were women, so
  half the questions were correctly asked in a woman's voice. And the filter's
  fallback was `return g.length ? g : base` — where `g` is voices whose NAME
  contains a male word. Android names its English voices "English United Kingdom 1"
  through 4, so on a great many phones the filter matched nothing and the pool
  silently became every voice on the device, very often defaulting to a woman. The
  fallback is now "everyone not identified as female", en-GB is ranked decisively
  above other Englishes, and the press pack is male so the byline matches the voice.

- **The eleven on the dashboard are people, not counters.** The Team Overview pitch
  drew coloured discs with shirt numbers, which at a club whose primary is white came
  out as eleven identical white dots. It draws the players' own faces now — the same
  ones the tactics pitch uses — with the number kept as a corner badge.

- **The trophy room is about the season you are playing, not only the one you
  won.** The Trophies tab used to be dead on the day you started a career — four
  lines, three of them saying you had not won anything, and no answer for the nine
  months before you could. It now opens with the campaign: every competition the
  club is actually entered in, whether you are still in it, and when the next round
  is. "League phase 1 · Salzburg at home · 9 Sept" in September; "Knocked out ·
  Fifth Round" in March; "Champions · 2026/27" in May. A Premier League club is
  shown as being in the FA Cup from August with the round it enters at, because it
  is. Walk into the room with nothing won and the trophies standing there are the
  ones you are playing for this season rather than a catalogue of the game — a
  League Two manager is no longer shown the Champions League as his preview. The
  same list of trophies is no longer printed twice on one screen.

- **The dugout runs like a broadcast: fast through the football, normal speed for
  the moments that decide it.** Whatever speed you have chosen, the match now drops
  to normal speed when something matters — a goal, a red card, a penalty, a VAR
  check, one off the woodwork, a booking — stays there long enough to watch it, and
  then hands your speed back. You never have to reach for the controls to see the
  goal you just scored. Consecutive moments run together as one passage rather than
  restarting, so a penalty that becomes a goal that becomes a VAR check reads as one
  thing. Substitutions deliberately do not qualify: stopping for every one would make
  the last twenty minutes of every match crawl. Touch the speed controls yourself and
  your choice wins immediately.

- **One man, one squad.** Two spellings of a player were two players: Liverpool
  carried both "Jeremy Jacquet" and "Jérémy Jacquet", because the signing list looks
  a man up by exact name and so does the sweep meant to catch exactly that. Frank
  Onyeka and Ogochukwu Onyeka are the same person under two different names, which no
  string comparison would ever join. Identity now comes from the aliases in the
  sourced biographies, so eighteen genuine duplicates are gone and twenty-five players
  carry the spelling the source uses. Two different men who happen to share a name —
  and there are two real Adam Smiths and two Ben Davieses in there — are both still
  playing.

- **The interface is lit by the club you manage.** The shell, the panels, the
  active tab and the pitch tokens all take their colour from your club's own
  primary at render time, so the same design serves all 484 of them and a club you
  built yourself — red is what Manchester United happens to produce, not what the
  game is painted. Panels share one treatment now (a quiet uppercase heading, a
  hairline rule, one radius) instead of the four different greens they had picked up
  from four different layers.

- **The dashboard opens with your eleven on a pitch.** Team Overview draws the XI
  from the formation the tactics screen already uses, with shirt numbers, names and
  a team chemistry read-out. It is added to the home screen rather than replacing it,
  so everything the season will not move on without — the board asking to see you, a
  bid that needs an answer — is still exactly where it was.

### Fixed

- **The desktop was being given the phone's layout.** The landscape rule said
  "landscape and at least 660 wide", which is also true of a 1440x900 monitor, so
  every desktop got the 76px icon rail instead of the 270px sidebar built for it —
  labels stacked under icons and the club name truncated to "M...". Bounded to phone
  widths, and the desktop sidebar it was hiding is back.

- **A goal bonus now helps close a deal at every level of the pyramid.** When a
  contract offer is borderline, the game scores it — the wage against what he is
  asking, the sign-on against what he is asking, and then the goal bonus against a
  flat £8,000. That last figure is a Premier League number and it broke the lever at
  both ends. A National League sheet opens at £50 a goal, which scored 0.02 of the
  four points it is worth, so no bonus a club at that level could afford ever moved
  the decision. A Premier League sheet opens at £7,500, which already scored 3.75 of
  4, so there was nothing to gain by offering more. The bonus is now measured against
  what the sheet itself opens with: that offer is worth half marks and double it is
  worth full marks, at every wage in the game. The player is paid exactly what you
  typed.

### Added

- **Dugout mode is now a true 3D stadium broadcast.** A vendored Three.js scene
  supplies a regulation striped pitch, solid markings, goal frames and lattice
  nets, tiered stands and seating, crowd, roofs, floodlights, stadium scoreboard,
  officials, weather, an articulated 22-player match and a tracked touchline camera.
  Heights, builds, club kits, goalkeepers, the ball and contact shadows remain
  readable on a phone, with a lighter mobile profile and the tested perspective 2D
  renderer retained for browsers without WebGL.

  What appears on the pitch is edited from the match engine rather than invented.
  Completed and missed passes, key passes, tackle and dribble attempts and outcomes,
  interceptions, shots on target, saves, cards and goals become staged animations
  with the responsible player's live statistics. The edit fits the actual accelerated
  clock: most of a minute at 1×, representative actions at 2×, one transition at 4×,
  and decisive moments only in Highlights. Goals and cards use the engine's existing
  hold time, so the animation never changes a result or leaves the pictures minutes
  behind the score.

- **Player names in the mail are tappable.** A letter saying a player wants a word, a
  scout report, a suggested transfer target — tap the name and his full card opens, so you
  can look at the man before deciding what to do about him. Nothing new was built for it:
  the profile screen has always existed and every letter has always bolded the name; there
  was simply no way in from the words. Names that match nobody are left alone, and so is a
  name two players share, because sending you to the wrong card is worse than sending you
  nowhere.

- **The mailbox has folders.** Every letter arrived in one stream — a contract expiry, a
  scout report, a cup draw, the board asking to see you and a newspaper column all looked
  the same and all queued behind each other. There are now folders for the **Boardroom**,
  **Transfers**, **Squad**, **Media** and **Results**, with unread counts and a dot on any
  folder holding something you have to answer. Nothing was reclassified to do it: the mail
  has been stamped with a type since the beginning and nothing had ever read it except to
  pick an icon.

- **The board sees you twice a season.** There was a meeting in August to agree the
  season's terms and one in May to review it, plus the unscheduled ones when results go
  badly or you break your word in public. Missing was the ordinary one: a mid-season
  sit-down in January, with half a season played and the transfer window open, which is
  when a real board either backs a manager or starts asking questions.

- **Goalkeepers have goalkeeping attributes.** They did not. A keeper's shot-stopping was
  `(positioning + agility) / 2` — two outfield attributes — and his penalty saving was
  agility alone. There is now **Handling**, **Reflexes**, **One-on-ones** and
  **Distribution**, shown on his page and read by the save model, the penalty model and
  the pass model. Two keepers with identical outfield attributes are no longer the same
  goalkeeper.

  Outfield players get **Off the ball** and **Marking** on the same basis. All six are
  worked out from the attributes a player already has plus a variation seeded on his own
  id, so they are stable for the life of a save, move when he trains, and change nobody's
  overall rating — no save file is touched and no valuation moves.

- **Better players get on the end of more chances.** The engine chose who shot from the
  slot they were standing in and nothing else — `striker 4.0, attacker 2.9, centre-mid
  1.8, anybody else 0.7`, not one attribute in it — so a twenty-rated striker and a
  six-rated one were equally likely to be the man the ball fell to. Movement now tilts
  that choice on top of the positional weighting.

- **Two new instructions that change how goals are actually scored.** **Build-up** —
  play out from the back, balanced, or go long — and **Final third** — work it in,
  balanced, crosses, or through balls. Neither is a label: they change who the engine
  puts on the end of a chance and who makes it. Measured over 70 matches a setting,
  against the same squad:

  | final third | assists from wide | scorer's heading | scorer's pace |
  | --- | ---: | ---: | ---: |
  | Balanced | 60.7% | 16.00 | 17.85 |
  | Crosses | 68.8% | 16.51 | 17.71 |
  | Through balls | 28.4% | 15.60 | 18.16 |
  | Work it in | 32.1% | 15.95 | 17.97 |

  Crossing puts the ball on the head of whoever in your side can head it; through balls
  are slid in from the middle for whoever is quickest; working it in is patient and
  central and makes fewer chances of higher quality. Build-up is the only instruction in
  the game that reads what the opponent is doing — playing out against a high press is
  how you get caught on your own eighteen-yard line, and going long is how you refuse to
  play that game.

  Opposition clubs pick both from their own squads, which gives the pyramid a shape:
  every Premier League side plays out from the back, National League sides mostly do not.

- **The attacking focus has a neutral, and a strength you can dial.** The row offered
  Left Flank, Central and Right Flank and nothing else, so every save ever played was
  committed to a channel — there was no way to say "play it wherever it is on". There is
  now a **Balanced** option, and a second row, **Focus strength**, with Slight and
  Strong. Slight is a lean; Strong is the commitment the game used to force on you.
  Choosing Central no longer means the ball never goes near a touchline: at Slight the
  per-pass bias in the match you watch drops from 2.1:1 to about 1.4:1, which over a
  five-pass move is the difference between forty-five to one and six to one.

  A save that was sitting on Central because that is where the game put it comes across
  as Balanced. A save where you deliberately picked a flank keeps it.

  Opposition clubs were hard-wired to Central — every club in the world, in every match
  ever played, attacked through the middle on purpose. They now pick a channel from where
  their best creator actually plays, at slight strength, so the teams you face no longer
  all play the same way.

- **Promotion play-offs, and you play them.** The game promoted whoever was in the top
  three, or four, or two of the table and that was the whole mechanism. The numbers were
  right; the method was not. One fewer club now goes up automatically and the four below
  them play for the last place — the Championship and League One between third and sixth,
  League Two between fourth and seventh, the National League between second and seventh.
  Two-legged semi-finals with the club that finished higher at home in the second leg,
  then a final at Wembley.

  If your club is in them, you play them: the semi-final second leg and the final open
  on the match screen like any other match, appear on the calendar, and show up on the
  Cups screen. The season does not end until they are settled. Winning the final is
  worth real money on top of the promotion — scaled to the division, so a National League
  final pays a National League afternoon.

- **Winning European matches pays, and every prize now reaches the transfer budget.**
  The Champions League league phase is eight matches against the best clubs in Europe
  and it paid nothing whatsoever. Measured in a live career, a run of three wins and
  three draws moved the bank by exactly £0 across all eight matchdays; the only money in
  the phase was an £11M lump when it closed. A win is now worth £2.1M, a draw £700K, a
  defeat nothing — the published UEFA figures, and they were already in the file, sitting
  in a field nothing read. Where you finish in the table of thirty-six pays as well:
  £275K for every club you finish above, so first is worth £9.9M and ninth is no longer
  worth the same as thirty-sixth. The Europa League and the Conference League are priced
  from their own figures the same way.

  None of the game's cup money had ever reached the transfer budget — not the FA Cup, not
  the League Cup, not the knockout ladder, not the winners' cheque. Prize money filled
  the accounts and gave the manager nothing to spend, which is the opposite of what a
  cup run is for. All of it now moves the budget as well as the bank. Winning the FA Cup
  is worth £16M on the day of the final, and every round on the way there pays more than
  the round before it.

  The league phase draw letter now tells you what the competition is worth before you
  play a minute of it, and the Finances screen finally counts the money — cup and
  European prize money had never appeared in the accounts at all, so a club that had won
  a hundred million in Europe reported the same revenue as one that never qualified.

### Fixed

- **Busy goalkeepers no longer monopolise Man of the Match.** Every routine save used
  to add a full linear rating bonus, so an ordinary high-shot match could leave both
  keepers permanently "on fire". Save rewards now diminish with volume while a
  penalty save remains a meaningful exceptional event. In the same deterministic
  1,296-match five-division audit, goalkeeper awards fell from 963 (74.3%) to 92
  (7.1%) without changing saves, goals, results or goalkeeper attributes.

- **One footballer can no longer occupy two English clubs.** ESPN's roster feeds can
  briefly list the same athlete under an old and a new club; the previous global
  name fallback then spread that identity further when the summer-transfer layer
  ran. The repeatable updater now resolves every duplicate roster ID against the
  athlete-detail team, records the competing roster URLs and refuses an ambiguous
  answer. Runtime matching is club-local, and old saves get a conflict-only repair
  that leaves unique in-career transfers where the manager put them. In the 13
  August snapshot this resolved 12 provider conflicts plus stale authored slots:
  Karl Darlow now exists only at Manchester United, Liverpool has one Jacquet, and
  Coventry has one Frank Onyeka identity. Every live English slot in the verified
  new-career run is sourced, with no duplicate ESPN ID or normalized same-club
  identity.

- **Installed phones cache every game module.** Nine newer scripts were loaded by
  the page but absent from the service worker's install list. They are now part of
  the versioned core cache, with a regression that compares the HTML's script list
  against the offline bundle so a first offline launch cannot silently omit a
  gameplay system.

- **You can swap a starter with anybody in the squad.** Three separate faults on one
  screen. Tapping a replacement did not swap anybody — it opened the bench-naming sheet,
  because a later feature had defined `ACTIONS.benchPick` a second time and replaced the
  handler the tactics screen had been using since the beginning. The shortlist was capped
  at three players with no way through to the other twenty. And choosing a man already in
  the eleven put him in twice, silently dropping whoever he had been standing next to.

  Now: a shirt selected and a player tapped puts him in that shirt; anyone already on the
  pitch changes places with him instead of being cloned; and a **Swap with anyone in the
  squad** button opens the whole squad for that position — sorted by how good each man
  actually is there, with what he adds or costs against the player in the shirt, whether
  he is out of position, and his condition. Measured: 25 players offered for a slot in a
  26-man squad, where it used to be three. Naming your bench is untouched.

- **An injured player no longer complains about not getting minutes.** Every other
  complaint in the game skips a player in the treatment room — the unrest sweep, the weekly
  grumble, the morale drip. The promise settlement checked it nowhere, so you could promise
  a man he would start, watch him do a hamstring in October, and in January he would lose
  sixteen morale, have a 45% chance of asking for the transfer list, and write to say "you
  gave me your word" about eleven matches he spent on crutches. The promise now waits while
  he is out, and the time he missed comes off what he could reasonably have played.

- **Leaving the boardroom no longer drops you back on the invitation.** The letter was
  already being removed, but the manager was left looking at the space where it had been.
  Closing the room now opens whatever is at the top of the inbox, so you land on the next
  thing rather than on nothing.

- **Players no longer reach the high nineties in two seasons.** Reported, and reproduced:
  the best prospects in the world were going 82 → 90 → 93 and 85 → 92, and the whole world
  came up with them — clubs holding a player rated 90 or better went from 12 to 24 to 33
  across two seasons. The season-end settlement allowed a seventeen-year-old ten points of
  overall in a single year, roughly double what the best prospect alive manages in his
  best season, and then cut him off completely on his thirty-first birthday.

  The curve is now five points at eighteen, four to twenty-one, three to twenty-four, two
  to twenty-seven and one to thirty — and instead of a cliff, a thirty-one or thirty-two
  year old still nicks a point about a third of the time and a thirty-three to
  thirty-five year old about a sixth. Measured over four seasons after: 82 → 84 → 88 → 89
  and 83 → 87 → 90 → 92, so a good young player still climbs but arrives in his
  mid-twenties, and the count of 90-rated players held at 12 → 12 → 17 → 17.

- **Width and set-piece marking do something now.** Width was worth `attack x 1.035`
  and man-marking `defence x 1.02` — both inside the engine's own noise, so neither could
  be shown to change anything at all. Width now decides where the pitch is: it moves the
  same channel weighting the attacking focus uses, so a wide side works the touchlines
  and a narrow one packs the middle. Measured over 200 matches a setting, assists from
  wide players came out at **56.6% wide, 39.6% standard and 17.0% narrow**, where before
  the three were indistinguishable.

  Set-piece marking now applies at set pieces, which is the only place the instruction is
  about — it previously did nothing whatsoever at a corner. Man-marking makes the
  defenders contesting the header harder to beat in the air; zonal holds its shape and
  keeps the small open-play edge instead, so the two are a choice rather than one being
  strictly better.

- **The National League play-off is six clubs, as it really is.** Second and third stand
  out of a one-off eliminator round — fourth plays seventh, fifth plays sixth — and come
  in at the semi-finals, with the final at a neutral ground. The draw is corrected so the
  two clubs that earned a bye cannot be drawn against each other, which is the whole point
  of having earned one.

- **The press and the board know a play-off place from an automatic one.** Third in the
  Championship was being described as a promotion place and fourth in League Two as an
  automatic one. They are play-off places now, and every question and every boardroom
  line says so: "4th — a play-off place, 1 off going up without them. Is the aim to avoid
  May altogether?" Being just outside the running now means outside the *play-offs*, which
  it never used to — the phrase had quietly stopped applying to anybody at all.

- **A star player is no longer offered a promotion he already has.** An unhappy player at
  the top of the squad ladder got a "promise him star player football" button that changed
  nothing, because there was no rung above him to be promised. The promise is real — it
  commits you to the minutes and he holds you to them — so it now reads as what it is.

- **Fewer injuries, and not five of them in a fortnight.** Reported as five injuries in
  the first four matches, and reproduced exactly on the first try: two in matches, three
  in training, with nineteen across the season. The season total was close to what a real
  Premier League squad gets — the shape was the problem. There is a cooldown after a
  training injury but it lasts three to six days and match injuries ignore it entirely,
  so a club could lose a player on Saturday, another on Tuesday and a third on Wednesday
  with the model treating each as the first thing to go wrong all year. A club that has
  just lost somebody is now safer for a fortnight, in matches as well as in training, and
  the underlying rate comes down by a third. Measured across three seasons after: ten, ten
  and eleven injuries, with one, two and one in the first four matches.

- **Playing through the middle now actually means playing through the middle.** Choosing
  `Central` moved chance creation by half a percentage point, because two thirds of
  chances already came through the middle before any instruction applied, and nothing
  anywhere pushed the ball away from the wings. Measured over 250 matches a setting,
  assists from wide players: 44.6% with no instruction, 20.6% on a slight central focus,
  12.2% committed to it. Crossing takes it the other way at 70.1%.

- **A pre-season tour now funds your summer instead of vanishing into the bank.** Touring
  never actually cost money — every option pays, from nothing for staying at home to
  £16.9M for the Far East — but the fee went into the club's cash and the transfer budget
  never moved a penny. So you flew a squad round America, earned eight million, and had
  nothing extra to spend on players. The fee and any invitational prize now reach the
  transfer budget as well as the accounts. Staying at the training ground earns a little
  rather than nothing, because two friendlies at your own ground still sell tickets. And
  the fee is sized by who you are: the old scale gave a National League club £2,000,000
  for a North American tour, two and a half times its entire annual revenue. The
  trade-off itself is unchanged — stay home for condition and small money, Iberia for a
  balance, America and the Far East for a fortune and a squad that arrives on empty.

- **The press room no longer asks why you have not signed anyone on your first day.**
  "The supporters expected additions and there have been none" fired on pre-season with
  no signings — both true by definition on day one of a career, before the window had
  been open an hour. Early in the summer the room now asks what you plan to do and which
  positions you are looking at; the complaint waits until the last fortnight before the
  opener, when it is a fair question.

- **The board's summons letter now leaves your mailbox once you have been up.** Taking
  the button off it was not enough — the letter sat at the top of the inbox reading like
  an appointment you still had to keep.

- **Fixed the boardroom's first meeting leaving its invitation behind, so going back
  up opened a crisis that had not happened.** Reported from a real save: take the first
  meeting of a career, leave the room, and the "Go up" button is still there — press it
  and the board complains about your league position on a day when nothing has been
  played. Three faults stacked in one four-line action. The invitation was only withdrawn
  if the click carried the mail's id, and the attention strip that most players press
  builds its button without one, so the mail kept its button for ever. With no summons
  outstanding the fallback was the crisis scene rather than an ordinary meeting. And on
  day one the league position is a reputation-sorted placeholder, so the crisis scene
  read "4th is not what was agreed" — quoting your target back at you as though it were
  the table. The invitation is now withdrawn whenever the room opens, from any entry
  point, and a button with nothing behind it opens the meeting you asked for.

- **The board's target now reads the squad you can actually put out.** It ranked a
  division on reputation alone, and reputation does not move when you sell people:
  Manchester United sold Bruno Fernandes, Matthijs de Ligt and Bryan Mbeumo in one
  window — the top sixteen dropped from 85.2 to 83.7 — and the board still asked for
  5th, not one place different. The expectation is now half the club's standing and half
  its playing squad, bounded so it responds without collapsing, and it eases faster than
  it tightens so nobody's day-one target got harder. The board also says why: "finish 6th
  or better — the squad is a little lighter than the badge suggests".

- **The academy you pay for now does something.** Measured over four hundred generated
  intakes: Manchester United at academy level 1 produced a mean potential of 85.2, and at
  level 5 it produced 85.8. Five levels of investment, worth 0.6. The bonus lived in a
  wrapper that a later layer overwrote by assigning the youth generator outright instead
  of wrapping it, so the facility silently stopped existing. It is reapplied against the
  growth headroom the generator actually produces, and centred on level 2 — what most of
  the world has — so upgrading is worth real money without the whole pyramid inflating
  behind it. A level-5 academy at a big club is now worth about seven points of potential
  over a level-1 one, and about four and a half at a non-league club.

- **A scout report now has an opinion.** Three weeks of a scout's time produced one
  sentence containing the numbers already on the player's card, and read identically
  whether a Premier League scout was watching a superstar or a National League scout was
  watching a non-league centre half. It now says where he would sit in your squad by name
  and margin, how far he is actually likely to get, what he would cost against your
  budget and wage room, what kind of professional he is, and reaches a verdict — one
  ordered on what you can afford first, so a National League club is no longer advised to
  sign the best player on earth.

- The half-time dressing room now knows which match it is. It read every rating, the
  legs, the bookings and the mood, and put identical words on the whiteboard for a cup
  final and a pre-season friendly.

- **Commercial income across the Premier League now climbs the way it really climbs.**
  The sponsorship model was linear in reputation, so the giants were right — Arsenal
  £216M against a real £218M — and everything under them was three to five times too
  generous: Crystal Palace £133M against a real £40M, Bournemouth £127M against £24M.
  Top-to-bottom spread was 2.5x where reality is 14.3x. A club is now placed between its
  division's reputation floor and ceiling on a curve, anchored so the biggest club is
  worth exactly what it was before. Measured after: median ratio 0.99, spread 14.2x. It
  applies to top flights only — a global-brand effect does not belong in League Two,
  where applying it put the smallest club into an annual loss.

- **Nobody outside your own division had ever served a suspension.** Matches the real
  engine does not run accrue appearances, goals, assists, ratings and injuries — and no
  cards. Measured over thirty matchdays: 5.07 bookings a match and 10 suspensions in the
  Premier League, 0.39 and none in League One, 0.19 and none in the National League. So
  the club you were chasing for promotion never lost a man to a ban, and a player scouted
  two divisions down had a blank disciplinary record whatever kind of footballer he was.
  Bookings now accrue at the engine's own rate under the engine's own rules, everywhere.

- Fixed a player quietly losing morale for not playing weeks before he was allowed to
  complain about it. The complaint is gated on a third of the season; the morale drain
  underneath it started at a flat five matches, which is a different fraction of a
  46-game season than of a 38-game one. Both now open together.

- Fixed a conversation about one player cheering up a different one — the reply resolved
  the first flagged player in the squad rather than the one the message named.

- **A club you build was being wired its wage ceiling in cash every month.** With the
  generous chairman it held £410,000,000 after six seasons in the National League —
  thirteen payments a season of £1,733,764 it had no use for. The owner of a club you
  build underwrites enough turnover for his wage ceiling to be legal under the wage cap,
  which is right and is why a bankrolled non-league club can field a squad its division
  could not otherwise afford. But that guarantee was also being paid in as money. The
  guarantee and the cash are now separate things: the ceiling is still measured against
  the turnover he guarantees, and what he actually pays in is what the club actually
  loses. Run it at a profit and he pays nothing. Same career, same chairman, same wage
  ceiling: the bank now goes from £4.5M to £14.4M over six seasons instead of £410M.

- **Every career started at a club other than Manchester United was drawing
  Manchester United's sponsorship money.** Found by tracing every change to a club's
  bank balance across a season. Start a career at a National League club — £348,000 in
  the bank — and it received £160,300,000 a year in sponsorship, which is United's four
  contracts verbatim and 202 times what the club could actually sign. A League Two club
  went from £1.5M to £174M in a single season on it. The cause is the ordinary
  career-start path: picking a club, or starting one you have built, quietly begins the
  save at Manchester United to construct the world and then hands you your club without
  clearing the sponsorship. The contracts are now rewritten whenever the club changes,
  rebased when the division changes — repriced upward at once on promotion, and kept at
  no less than 65% of their value for the rest of the term on relegation, which is the
  clause every real deal has — and bounded so no other path can do this again.

- Fixed AI clubs receiving income and never paying costs. They were credited their
  revenue every month with no wage bill against it, so the median Premier League club
  held £442M after one season and the richest club in the world reached £2.2 billion by
  season four. Every club is now credited what it actually clears, through the same
  revenue and cost model the Finances screen is built from — with a floor so nobody
  goes bust and a ceiling of a season and a half of turnover so nobody hoards. Measured
  over six seasons the pyramid now holds its shape instead of exploding.

- Fixed the running-costs line on the Finances screen never leaving the account. The
  ground, the matchdays and everything that is not a wage — about £165M a year at
  Manchester United — was shown to you and never charged. It is charged monthly now, so
  the projection on the screen is the money that actually moves.

### Changed

- **Taught every conversation in the game which division it is in.** An audit for
  the boardroom's bug — grading on `pos < target`, which cannot tell that first place
  is good — turned it up seven more times. All of them were the same thing: a question,
  a promise or a target written for one twenty-club Premier League with three
  relegation places, then asked of a twenty-four-club division with different rules.
  In a live career, 4th in League Two — an automatic promotion place — was asked
  "Is Europe the target or the minimum?"; 14th of 24 in the National League was asked
  whether it was a relegation fight, in the one division nobody is relegated from; and
  the weakest club in every division was told the board expected "24th or better".

  There is now a single description of a division's shape, read from the game rather
  than written down: how many clubs, how many go up, how many go down, how many reach
  Europe and how many matches the season actually is. Nothing names a division or
  hardcodes a count, so it stays correct as the leagues grow.

  - The table questions fire on real geometry. Europe is only mentioned where there is
    a Europe; "mid-table" means mid-table; and the relegation question says how big the
    zone is — the bottom 4 in League One, the bottom 3 in the Premier League.
  - Two new questions the pyramid never had: promotion, which is what four of the five
    English divisions are about, and a division with nothing left to play for.
  - A promise to stay up is judged against the real drop zone. League One relegates
    four, so 21st went down while the promise was marked kept; League Two relegates two,
    so 22nd stayed up while the promise was marked broken; the National League relegates
    nobody and the promise broke anyway.
  - No board asks a club to finish last. The target floor is the last safe place where
    clubs go down, and the board says what it means — "keep this club in League One"
    rather than "finish 20th or better".
  - Winning the league now counts towards your own contract. `dealMerit` had the same
    ceiling bug, so a title-winning season against a title-winning target scored zero
    and the board never offered you a new deal.
  - Transfer targets ask for the division they would be joining. "European football" was
    demanded of clubs all the way down to the National League, and 15th of 24 —
    mid-table — was scored as relegation form.
  - The supporters' feed has a sense of scale. "HERE WE GO" fired at £40M and "what a
    signing" at overall 82, so a National League club-record signing and the best player
    in League Two never registered at all.

- Fixed the season length in the seven leagues that play three times rather than twice
  — Scotland, Austria, Switzerland, Denmark, Serbia, Ukraine and Croatia, at 10 to 12
  clubs each. A 12-club season the press room thought was 22 matches is 33, so "games
  left" hit zero at matchday 22: the run-in questions were asked in midwinter and never
  once in the actual run-in, and both the title-race and relegation-fight definitions
  collapsed for the whole second half of the season.

- **Gave the boardroom a league table it can read.** Reported from a real save: top of
  the league after five matches, four wins and a draw, against a target of 1st — and the
  monthly review said "which is about where we asked you to be", offered "Take the
  criticism" and docked five points of patience for asking to be backed. The scene graded
  on `pos < target`, so first place against a target of first fell through to the
  underperformance branch, and every answer in the room keyed off that one boolean.

  The board now grades on a seven-band spectrum — flying, ahead, on track, just short,
  short, bad, crisis — measured on the margin between where you are and where you promised
  to be, with a ceiling rule first: 1st is the top band whatever the target says. Form,
  a live semi-final or final, a relegation place and the honest fact that five games is
  five games all move the band. The room also reads matches played against the length of
  the season, points per game, unbeaten and losing runs, which cups are still alive and at
  what round, the promotion, play-off and relegation zones of your actual division, and
  who is injured.

  Every opening, verdict, answer and reply now has three to six versions and will not
  repeat the last two it used, so consecutive meetings do not read identically. The
  answers on offer are built for the band: a league leader is never handed "Take the
  criticism", asking a delighted board for money gains budget and goodwill instead of
  costing it, and only a club in real trouble is offered "then sack me".

- Fixed the "Request more transfer funds" meeting reading as an end-of-season debrief in
  October — "You finished 14th… So. Next season." — when it is a meeting you can call any
  time. It now follows the calendar.

- Fixed every board warning mail printing "target undefinedth". A later layer replaced
  `boardTarget()` with a `{pos, agreed}` shape while the monthly review mail still read
  `{exp, txt}` from the older one; both shapes now come back from the one call.

- **Rebuilt the economy against real football finance.** Measured first: the Premier
  League was close to right and everything below it was inflated, worse the further down
  you went — Championship central distribution 4× too high, League One 6×, the National
  League about 18×. Costs were wrong the other way, with a `rep × 14000` term charging a
  4,000-seat non-league club £28.7M a year to run, so every club from League One down
  showed a £35–50M annual loss and sat permanently in breach of Profit & Sustainability
  on day one of a career. Central distributions, matchday yields, commercial income and
  running costs are now built from the published 2024/25 figures.

  Calibrated deliberately soft: the *shape* is real — the cliff below the Premier League,
  wages as far and away the largest cost — but every club at every level runs a modest
  profit if it is sensibly managed, because this is a game you are meant to win. Basic
  awards are weighted towards the smallest club in each division, which is where a club
  you built yourself starts.

- Made promotion and relegation the financial events they really are. The flat
  `budget × 2.4 + £8,000,000` — the same eight million whether you went up to the Premier
  League or up to League Two — is gone; the division tables do it now. Parachute payments
  land on the real taper (£49M, £40M, and a third year of £22M only for clubs who were up
  for more than one season), follow the club rather than the manager, and are what keeps a
  relegated side with a top-flight wage bill alive.

- Replaced Profit & Sustainability below the Championship with the Salary Cost Management
  Protocol the EFL actually runs: League One 50% of turnover including coaching costs
  (the figure changed for 2026/27, which is the season the game is set in), League Two
  55%, enforced by refusing to register the player rather than by a points deduction. A
  club that inherits a bill above the cap gets a compliance path rather than a frozen
  window.

- Gave a club you build the money to actually climb. Measured what the binding
  constraint was: the free-agent market is deep and open to anyone, so a new club is
  gated by its **wage ceiling**, not by its reputation. At the old £22,000 a week you
  could assemble a squad averaging 43.4 to beat a National League averaging 41.8 — a coin
  toss, not a project. The three chairmen are now anchored on what a League One club
  actually has (£1.23M of budget, £142,000 a week of ceiling), so the smallest of them
  starts you with a League One transfer budget and a squad that walks the fifth tier, and
  the most generous starts you with one that could hold its own in League One on day one.
  The owner keeps pace with the division rather than with the turnstiles. A club you
  build has a 2,400-seat ground, so its own income stays small however high it climbs —
  the ceiling went £90K in the National League to £108K in League Two to £112K in League
  One while what it takes to win those divisions roughly doubles at each step. Measured:
  a squad 6.5 rating points above League Two finished **11th on 67 points**. The chairman
  is now stored as a multiple of what his division pays, decaying as you climb, so the
  ladder reads £90K → £195K → £352K → £916K → £4.1M — and the same squad now finishes
  **3rd on 83 points and goes up**, in a top four separated by a single point. His
  advantage is everything in the fifth tier and a rounding error in the Premier League,
  which is both true of real owners and the only way the top of the game stays sane.

- Kept the chairman you picked when you built your own club. `normaliseReps` ended every
  summer with `wageCap = max(wageCap, rep × 90)`, which has no idea a club can have been
  given a deliberately small ceiling by its own board — so the Tight chairman's £22,000 a
  week became £169,020 and his £150,000 transfer budget became £613,000 in ten months,
  and the choice that shapes the whole career stopped meaning anything. A chairman is now
  stored as the *amount* he is putting in over and above the going rate for a club that
  size, measured once and reapplied every season, so the ceiling grows as you climb
  without him changing character. That money is an owner writing cheques, and it is
  modelled as that: owner funding, on its own line in the accounts, paid in monthly, and
  counting towards the wage cap — because the real Salary Cost Management Protocol counts
  secured owner investment too, and a ceiling you are not allowed to spend is not a
  ceiling.

- Made a transfer get paid for the way transfers are actually paid for. Fees are now
  structured over the length of the contract — one year below £300,000, up to four above
  £20M — so a club with £30M of budget can buy a £60M player, and a club that has done
  that three summers running has no budget despite selling nobody. Selling clubs keep
  sell-on clauses, honoured on the profit rather than the fee. Agents take about ten per
  cent of a deal out of cash, and a signing fee where there is no fee to take a percentage
  of, which is why free transfers are not free. Instalments settle every summer in both
  directions and show on the Finances screen as money already committed.

- Capped a backroom staff bill that was bankrupting every small club. Staff are paid
  `(4 + rep/900) × £1,000` a week per role — a £4,000 floor a head whoever you are — and
  it is debited from the bank daily, so a built National League club was paying its
  six-man backroom more than twice its entire playing squad and went £12.8M overdrawn
  inside two seasons. Scaled down when it is out of proportion to the playing budget,
  never up, so a Premier League backroom is untouched.

- Stopped the transfer budget compounding. Every club is re-levelled each summer except
  yours, and `rep × 9000` is then added to everybody including you, with nothing ever
  taking it back: £135M → £266M → £411M → £563M across three seasons without a player
  being sold. The board now allocates from the accounts each summer and you keep what you
  did not spend, up to as much again.

- Stopped clubs outside England going bankrupt. The second-tier fallback was a flat £4M
  of central money for every league in the world, and eight Spanish clubs ended the third
  simulated season between £13M and £48M overdrawn. Second tiers are now scaled by their
  country's coefficient, and no division may be structurally insolvent — measured on the
  median club in it, so a league that cannot pay its way is lifted while a club that has
  overspent inside a solvent league still loses money.

- Paid the rest of the football world. The old code credited only your club while wages
  were debited from everybody, so a National League club was down to its last £65K before
  Christmas.

- The gate receipt you are paid and the matchday income the Finances screen projects are
  now the same number. They were £38 a head and £24 a head respectively, over 19 home
  matches — which is only the right number for the Premier League; the other four English
  divisions play 23.

### Fixed

- Made the press conference understand which match it is at. Reported from a real save:
  six wins on the spin and the room asked whether it was a blip. Measured, with eight
  matches played and a six-game winning run, the pool was **46 rules, 272 lines, picked
  uniformly at random, of which 51.5% was context-free filler** — your winning run and
  your league position were about 1% each. A topic with ten interchangeable phrasings was
  ten times likelier than the thing actually happening to you. The room now knows the
  competition (`fixCtx` already worked it out for the match engine and nothing passed it
  through), the division, the matchday out of the season's total, what part of the season
  that makes it, whether it is a cup tie, a European night, a semi-final, a final, a derby
  or the last day, and which eleven you picked — including a big name you left out, a
  debutant, and how young the side is. Twelve new questions use it, with answers. And
  selection is weighted: filler drops to a quarter of the room and a six-game run becomes
  the single most likely thing to be asked about.

- Fixed the budget rebalance slider, reported from a real save where two screens
  contradicted each other: the squad screen said `£106K/w of £72K/w` in red while the
  transfers screen said `£183/w wage room left` in green. Both are the same two numbers —
  one divided by the ceiling, the other by the ceiling plus a hidden 18% overdraft. The
  ceiling is the ceiling now, room is what is left of it, and the overdraft the board
  tolerates is stated rather than buried in a multiplier.

  The slider itself went one way. Its right-hand limit is `(ceiling − wage bill) × 52`
  floored at zero, so the moment the bill passed the ceiling nothing could move towards
  transfers — and the neutral handle then rendered hard against the right-hand end,
  directly under the words *more transfers →*, so it looked maxed out when it was stuck.
  Every further drag took another lump out of the transfer budget; the reported save had
  shifted £808,000 that way without meaning to. The commit had no limit checks of its own
  either, and `budLimits` can return an inverted band (low bound £108,119 *above* high
  bound £95,077) once the bill is further above the ceiling than the whole transfer budget
  could close. Both directions now work and reverse exactly, the panel says plainly when
  the bill is over the ceiling and what to do about it, and pouring transfer money into
  the ceiling — the way out of that hole — actually commits.

- Closed the hole the wage bill came through. Contract talks, free agents and deadline day
  all test the bill against the ceiling; neither loan path did, so a loan could put it
  anywhere. In the reported save it was 147% of the ceiling.

- Broke the squad-unrest loop. Any player you had not explicitly given a role to was
  treated as a promised *squad player* — 42% of the matches — so a club that had just
  assembled itself out of free agents was in breach of twenty promises it never made.
  The complaint was typed as board business, which halts the season, and the weekly
  pass could raise a fresh one every Monday for ever. Nothing waited for a season to
  happen first either — five matches in, half a squad had a grievance no manager could
  have answered. Nobody can now raise playing time until a **third of the division's
  season** has been played (match 13 of a 38-game Premier League, match 16 of a 46-game
  National League, match 11 of a 33-game Scottish Premiership), and then only after
  eight weeks at the club. Beyond that: one conversation a month club-wide and one every
  twelve weeks per player; the message sits in the inbox instead of in front of the
  Continue button; a role you have not set is read from where he actually stands in the
  squad; and you can tell him honestly what he is here rather than only promising him
  minutes. A promise is now recorded and checked twelve weeks later.

- Made a red card cost the next match. Suspensions were applied correctly during a
  match — two matches for a straight red, one for two yellows, one for every fifth
  booking — and then served by the match they were shown in, because `afterRound`
  decrements every ban at every club that played that day and the fixture list it walks
  includes the game that has just finished. Two yellows cost nothing at all. Bans are
  now served once per club per matchday, league or cup, and never by the match that
  produced them. Your squad is also warned when a player is one booking from a ban.

- Priced a season loan for the division doing the borrowing. `loanTerms` quoted
  `max(£200,000, 7% of value)` rounded to £100,000, so a National League club with a
  £150,000 transfer budget was quoted £200,000 for every player in the game and the
  loan market was shut. (`loanFeeFor`, the other loan path, had already been corrected;
  this one was missed.) The multiplier that was supposed to charge a big club more was
  also inverted and billed a small club 18% more than Manchester United. Below the
  Football League most loans now carry no fee at all, which is what actually happens.

- Scaled the goal bonus on a contract to the wage on it — about 5% of a week, so £50 in
  the National League rather than the £5,000 the sheet opened with whoever you were.

- Made the transfer news about the league you manage in. The rumour mill only looked at
  players rated 76 or better, skipped League Two and the National League entirely, and
  only ever named a Premier League or European suitor. It now works from your own
  division and the ones directly above and below it in your country — so Serie B reads
  about Serie B — with one story in five still from the top of the world game.

- Funded a wage rise out of the transfer budget. Giving a player another £10,000 a week
  changed nothing anywhere. It now costs a year of the rise at the game's own exchange
  rate — the same 52 weeks the budget slider trades at — the contract sheet says what
  it will cost before you offer it, and a rise the budget cannot cover is refused.

### Changed

- Gave the inbox filters (decisions, transfers, squad, board, media) with unread counts
  on each, and a line of the message itself on every row.

- Made the budget rebalance slider work at every size of club. The board's band was
  plus or minus 40% of its own split, so a created club with a small wage ceiling
  could only move a few thousand a week, and the slider's fixed £100k step was
  coarser than the whole usable range. The limits are now the two real ones — a
  ceiling cannot go below the squad's existing bill, and you cannot spend money you
  do not have — and the step is a fraction of the range.

- Swept the calendar the player is actually given. The rescheduler ran after cup
  draws, but the fixture list was rebuilt once more after the last draw, discarding
  every repair — so the delivered world had never been swept and could contain a
  club with two matches on one day. Measured 1 in 40 careers before, 0 in 105 after.

- Counted a press conference once instead of twice on the home screen; the context
  and the mail that launches it are one decision.
- Sent a red-carded player down the tunnel rather than to a seat on the substitutes'
  bench, and gave him a beat before he starts walking.
- Floored the player the commentary actually named in a foul, instead of whoever
  happened to be nearest the offender.
- Cleared the crowd-duck state when the crowd is rebuilt mid-speech, so a later
  utterance cannot restore a stale level.
- Surfaced a neural-voice failure that happens after the first clause, so the device
  voice takes over instead of the rest of the sentence disappearing.
- Warned about a live localStorage downgrade, not only a missing save store: the
  career store can exist and still have fallen back to the ~5 MB path.

- Prevented the first autosave from capturing the incomplete 84-club world.
- Replaced silent save-slot eviction with validated IndexedDB careers and rotating autosave recovery points.
- Fixed incoming transfer acceptance crashing because an arrow function referenced `arguments`.
- Made detailed shot conversion probabilistic and driven by the same xG value displayed by the match engine.
- Corrected the first broadcast-confirmed Manchester United fixture changes: Ipswich, Everton and Manchester City.
- Corrected press-conference copy before the manager has entered the room.
- Made fullscreen feedback reflect actual API success or failure.
- Prevented repeated player and club SVG gradient IDs.
- Restored crowd audio after neural-voice interruption and bounded its decoded-audio cache by memory.
- Gave the Continue dock its side gutter back. An earlier rule set 12px of padding
  as `.continue-dock`, which loses to `#app>.continue-dock{padding:14px 0 6px}`, so
  the buttons ran flush into both edges of the screen.
- Warned the player when the upgraded career store did not load. The HTML now
  pulls three scripts from `src/`; a copy of the file on its own falls back to the
  ~5 MB `localStorage` path silently, which is the failure the store was built to
  fix. It now says so on the save screen and once per session.
- Fixed the instant-simulation integration test, which slept a fixed 120 ms for a
  path that takes about 300 ms in a real browser and 1.5 s under JSDOM. Tests now
  wait on the condition through a shared `waitFor` harness helper.
- Kept date-only fixtures on their intended calendar day in timezones west of UTC.
  They previously rendered one day early because UTC midnight was formatted in the
  device timezone.
- Replaced the generated English league calendar with all 2,588 published 2026/27
  Premier League, Championship, League One, League Two and National League fixtures.
  Sourced dates are protected from congestion moves; generated cup ties give way.
- Added all 1,984 published 2026/27 fixtures from La Liga, Serie A, Bundesliga,
  Ligue 1, Primeira Liga and Eredivisie, including the promotion/relegation changes
  needed for those schedules to map to the live world without changing its size.
- Added 1,720 more published fixtures from Serie B, 2. Bundesliga, Ligue 2,
  Süper Lig, Super League Greece and the Czech First League. The official Czech
  schedule importer also refreshes its two promoted Brno clubs without changing
  the 484-club or 8,781-fixture world shape.

### Improved

- Added sourced player biographies for all five modeled English divisions. The
  repeatable ESPN updater now records 3,251 roster players across 116 clubs and
  applies published nationality, date of birth, height and weight to live careers.
  Provider-specific country abbreviations are canonicalised, implausible source
  measurements are rejected, and missing fields remain missing instead of guessed.
  Generated Premier League depth names are replaced with unused sourced players
  while ratings, positions, potential, contracts and finances stay unchanged.

- Rebuilt the landscape phone layout. The navigation stands up as a rail down the
  left, the header runs across the top and Continue sits at the end of it, and the
  content uses two columns. Sideways the game had been letterboxed into 720px of an
  896px screen with a bottom bar and a floating dock covering the content between
  them.

- Faded the edges of the nine horizontally scrollable tab and chip rows so it is
  visible that they continue. They were slicing words in half against the screen
  edge — 446px of the tactics row was hidden with no cue at all. The fade is sized
  to how much is actually off-screen on each side, so it never overstates it. The
  rescan is driven by a debounced observer on the document rather than by the main
  render, so rows drawn by the front screen, a modal or the match screen are covered
  too.
- Added transfer-market pagination and per-render fee/wage caching.
- Added static branding and social metadata for The Results Business.
- Added an installable PWA shell and offline caching for core game assets.
- Added keyboard focus, semantic labels, zoom support and reduced-motion handling.
- Added bounded runtime diagnostics, modular save/simulation code, automated tests and GitHub Actions.
- Replaced generated first-team identities across League One, League Two and the
  National League with a sourced 9 August 2026 snapshot. Championship membership
  is refreshed with it so promotion and relegation remain consistent, while the
  existing squad shape, ratings, contracts and economy remain game-balanced.
- Added a validated ESPN roster updater and cached its generated data in the PWA.
- Added a validated fixture updater, exact source-event regression and a season-two
  handoff test so published dates cannot silently fall back or leak into later years.
