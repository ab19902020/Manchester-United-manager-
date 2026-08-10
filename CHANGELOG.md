# Changelog

## Unreleased

### Changed

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
