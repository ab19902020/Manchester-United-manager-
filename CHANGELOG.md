# Changelog

## Unreleased

### Fixed

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

- **The working copy reverted itself mid-session, twice.** Not a game bug — a note for
  whoever looks after the environment. During one session the local checkout jumped back
  to an old commit (`ffcb227`, several cycles behind) on its own, with no `checkout`,
  `reset` or `stash` that would explain it: the branch had been hard-synced to `204738d`
  and pushed successfully from there minutes earlier, and `git rev-parse HEAD` later
  returned `ffcb227` again. It happened twice.

  Each time, stale mid-edit copies of `src/playoffs.js` and `tests/playoffs.test.cjs`
  reappeared as uncommitted changes — an **incomplete** six-club National League play-off,
  carrying three of the five markers the finished version has. The remote was correct
  throughout (`main` at `a55d771`, the branch at `204738d`).

  The danger is the combination: a stop hook asks for uncommitted changes to be committed
  and pushed, and following that literally would have committed the half-finished play-off
  over the finished one and regressed it. They were discarded instead. Anything automated
  that commits on a hook's prompt should diff against `origin/main` first, and a session
  should hard-sync to `origin/main` before touching anything.

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
