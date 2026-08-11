# Agent One — report to Claude

**Written by:** Agent One (balance and rules) · **Read by:** Claude (director) and Codex
**Current as of commit:** `652f3e4` · **Last updated:** 11 August 2026 (cycle 17)

---

## Who I am and where I work

There are three of us now. The split, as I understand it:

| | lane |
| --- | --- |
| **Claude** | director. Design, the build, how the game feels, what happens next |
| **Codex** | the eyes. Debugging, audits, real-world data, anything that needs the web |
| **Agent One** (me) | the rules underneath. Gameplay balance, the economy, the systems that are not the match itself |

I write this file. Nobody else should have to — if something in here is wrong,
stale, or a bad call, say so and I will change it rather than have it quietly
rewritten, same protocol Claude and Codex already run between `CODEX.md` and
`CLAUDE.md`.

**My lane, concretely.** Money, contracts, discipline, squad morale, the transfer
and loan markets, and the inbox those things arrive in. Not the match engine, not
the renderer, not the data.

### The rule I work to: keep out of the big file

`red-devil-manager.html` is three megabytes and 136 appended layers, and it is
where three agents will collide. So my code does not live there.

Everything I write goes in **`src/gameplay-balance.js`**, **`src/economy.js`**,
**`src/press-room.js`**, **`src/interactions.js`**, **`src/prize-money.js`**,
**`src/playoffs.js`**, **`src/tactics.js`**, **`src/attributes.js`** and
**`src/boardroom.js`**, which load
after the game and patch it in place. The big file gets **nine `<script src>`
tags and nothing else**. If you are merging my work and hit a conflict in that file, the
resolution is always "keep both, re-add my one line".

Load order matters for two of them: `interactions.js` must come after
`press-room.js` (it wraps `pqFacts` last so every question rule sees the
division's shape) and before `boardroom.js` (which reads `window.RBSShape`).
`prize-money.js` must come after `economy.js`, because it wraps `progressCups`
on top of the gate-receipt layer and expects to be the outermost thing watching
the bank across a cup day.

That is also why I patch by wrapping rather than editing: I never need the
original text of a function, so a layer moving underneath me does not break me.

### What I deliberately did not touch

Because you two were mid-flight on them when I started: the landscape layout, the
avatar generator and its seeding, `src/lower-league-data.js`, the fixture data,
and the three duplicate-player problems Codex reported in cycle 3 (Jacquet,
Onyeka, the nineteen shared ESPN IDs). Those are still open and still yours.

---

## Done, with SHAs

### Cycle 2 — the economy

`d35f73b`, `b5de3b8`, `679cf6d`. Three phases, approved one at a time, each
measured before and after. Everything lives in `src/economy.js`.

**Phase one — the money has the shape of the pyramid.** Measured against the
published 2024/25 distributions, the Premier League was close to right and
everything below it was inflated, worse the further down you went:

| central distribution | game | real 2024/25 | out by |
| --- | ---: | ---: | ---: |
| Premier League champion | £169.7M | £174.9M | ok |
| Championship | £38–48M | ~£11M | 4× |
| League One | £12–13M | ~£2M | 6× |
| National League | £2.7–2.9M | ~£150K | ~18× |

Three causes: a divisor of `{CH:.32, L1:.11, L2:.055, NL:.028}` against a real
`1 : 0.08 : 0.014 : 0.011 : 0.001`; a flat £6.5M added to every club *before*
that divisor, putting a Premier League floor under the whole pyramid; and
commercial income counted twice, once through the sponsorship-deals system —
which is well calibrated, Arsenal £216M against a real £218M — and again
through a `rep × 1150` stream worth another £132M on top.

Costs were wrong the other way. `cap × 760 + rep × 14000 + wages × 0.30`
charged a 4,000-seat National League club **£28.7M a year to run**, so every
club from League One down showed a £35–50M loss and sat permanently IN BREACH
of PSR on day one of a career.

**Calibrated deliberately soft, on the user's instruction.** The shape is real;
the level is not. In actual football the Championship spends 94p in the pound on
wages and the division lost £436M last season. Here every club at every level
runs a modest profit if sensibly managed, because it is a game you are meant to
be able to win. Basic awards are weighted towards the smallest club in each
division — which is where a built club starts, and which is what solidarity is
actually for.

**Phase two — the cliff.** The flat `budget × 2.4 + £8M` on promotion is gone;
phase one's tables do it. Parachute payments on the real taper — £49M, £40M, and
a third year of £22M only for clubs up more than one season, which is the Luton
rule and the reason a club gambles on staying up. They follow the club, so a
Championship rival holding one is genuinely harder to compete with.

**Phase three — the EFL's own rule.** PSR is a top-two-division regulation; below
it the real rule is the Salary Cost Management Protocol. League One 50% of
turnover including coaching costs — that figure changed *for* 2026/27, which is
the season the game is set in — League Two 55%, enforced by refusing to register
the player rather than by a points deduction. Clubs sit at 16–44%, so it only
bites if you go looking for it.

### Cycle 23 — Central finally means something, and a test I could not write

Cycle 20 left this open and measured: choosing `Central` moved chance creation
by half a percentage point, 64.5% against 65.0% for Balanced.

**The cause was upstream of the focus setting.** The engine weights a creator as
`vision + 4 if central`, and six of the eleven slots in a 4-2-3-1 are central, so
two thirds of chances are made through the middle before any instruction applies.
Multiplying an already-saturated share by 1.5 does nothing. And the real omission:
**nothing anywhere suppressed the flanks.** An instruction to play through the
middle has to mean the ball goes down the wings *less*, or it means nothing.

The creator is now picked in `src/tactics.js`, on the same hook that already
re-picks the shooter, with channel multipliers that cut as well as lift. Measured
over 250 matches a setting, assists from wide players:

| | wide |
| --- | ---: |
| no instruction | 44.6% |
| Central / Slight | 20.6% |
| Central / Strong | 12.2% |
| Crosses | 70.1% |
| Through balls | 28.4% |

The Slight/Strong dial is *not* applied here — the per-decision draw in
`withResolvedFocus` has already applied it, and doing it twice would square it.

**A test I could not write, and what I did instead.** Three designs, all flaky at
about one run in three: an outcome test at 80 matches a cell, the same at 200
interleaved so drift hits every cell equally, and a probe of the weighting
function itself. The part I could not explain in the time I had is that the
channel test and the final-third test failed on the **same runs**, which points at
something that differs between generated careers rather than at sampling noise —
most likely which wide players a career produces and who `autoPick` puts in the
XI.

I removed both rather than ship them. A suite that fails one run in three trains
everybody to ignore it, which costs more than the coverage is worth. The claim
ships on the measurement above, the reasoning is written into the test file where
the next person will find it, and the first thing to try is seeding the career in
the harness and diffing a failing run against a passing one.

Two assertions in the final-third test were also dropped for honest reasons: the
scorer's heading under `Crosses` and the wide share under `Through balls` are both
still in the right direction, but Balanced now picks its shooter on movement and
its creator on channel too, so the gaps to Balanced narrowed to inside the noise.
The contrasts that survive — crossing against through balls — are asserted
instead.

**Still open from the four the user picked:** width and set-piece marking are
still worth ±2–3%, the press and boardroom still call 3rd an automatic promotion
place, and the National League play-off is still four clubs rather than six. I got
one of the four done.

### Cycle 22 — what the attributes are worth, and the ones that were missing

Asked to check the nineteen attributes mean something. I swept every one: hold
the squad still, set one attribute to 5 for the whole side, play 150 matches,
set it to 18, play 150 more, read the difference.

**The first result was how noisy the engine is.** A control — the same squad,
twice, nothing changed — swung 0.23 goals a game. Anything smaller than that is
not a measurement, and I have been careful not to report it as one.

| whole squad, 5 → 18 | goals | conceded |
| --- | ---: | ---: |
| *control (nothing changed)* | *−0.227* | *0.127* |
| passing | 0.820 | 0.153 |
| positioning | 0.247 | 0.940 |
| firstTouch | 0.407 | −0.113 |
| dribbling | 0.373 | −0.007 |
| stamina | 0.347 | −0.120 |
| tackling | −0.060 | 0.287 |
| agility | 0.080 | 0.200 |
| leadership | 0.040 | −0.053 |

**Every one of the nineteen is read by the game somewhere.** None is decoration
and I am not claiming any of them does nothing. What the sweep shows is that only
`passing` and `positioning` move a result by more than the engine's own noise, and
that most attributes are one of three names inside an average — about as much
leverage as a third of a third.

**The hole it found: goalkeepers have no goalkeeping attributes.** Shot-stopping
is `(positioning + agility) / 2`, both outfield, and penalty saving is `agility`
alone. Testing the keeper on his own, 150 matches each way:

```text
positioning   0.133 goals prevented
agility       0.053
decisions    -0.033
handling      0.207   <- an attribute that does not exist
```

`handling` was a deliberate control — a made-up name, so setting it to 5 and then
18 changes nothing whatsoever. It "outperformed" every real attribute the keeper
has. That is the cleanest way I know to say that nothing measurable separated a
good goalkeeper from a bad one.

**What I added.** `handling`, `reflexes`, `oneOnOnes`, `distribution` for keepers;
`offTheBall` and `marking` for everybody else. All six are **derived, not stored**
— worked out from the attributes the player already has plus a variation seeded on
his own id. Stable for the life of a save, moves when he trains, different for two
players whose attributes are identical, and **not in the `W` tables**, so no
overall rating moves, no valuation moves, and no save file changes. An explicit
value on the player always wins, so real goalkeeping numbers can be authored later
without any of this changing.

They reach the engine through `effA` — the one method the save model, the penalty
model and the pass model all use — so a keeper asked for his `agility` answers
with his hands, without a line of the match engine being touched.

Measured after: the keeper's four attributes are worth **0.44 goals a game** at
4 → 19, against a made-up attribute at exactly 0.00 in the same run.

**The second hole: who shoots was decided by position alone.** The engine's
shooter weighting is `ST 4.0, attacker 2.9, centre-mid 1.8, anybody else 0.7` and
not one attribute — a twenty-rated striker and a six-rated one were equally likely
to be the man the ball fell to. Movement now tilts that on top of the slot
weights, which are kept exactly as they are. Honest note on size: with United's
XI, scorers averaged 87.08 overall against a position-weighted expectation of
86.78, because their best players already play in the shooting positions. This
will matter far more to a club whose best player is not its striker.

**Not fixed, and said plainly.** `offTheBall` and `marking` measured inside the
noise floor as whole-squad sweeps (0.00 and −0.10 goals). They blend at partial
weight into attributes that are themselves one of three inside an average, so the
effect is real but small. I have kept them because they de-homogenise players and
feed the shooter pick, not because I can show them moving a scoreline.

**A second probe that lied to me, the same way as last time.** My test captured
the player page by replacing `window.openModal` — which replaced the wrapper doing
the injecting, so it captured the page before it was patched and reported the new
attributes missing. Reading `#sheetBody` after the fact fixed it. That is twice in
two cycles: **a spy installed last sees the world first.**

**Why one test is missing on purpose.** The 0.44 goals-a-game figure is real but
the noise floor at that sample is about 0.28, so an assertion on goals conceded
would fail roughly one run in three. The tests assert the deterministic part — the
save model can tell keepers apart, the engine reads the new numbers, the page
shows them — and the measurement lives here with its error bars.

### Cycle 21 — build-up, the final third, and the two-engines question

**The two instructions.** `Build-up` (Play out / Balanced / Go long) and
`Final third` (Work it in / Balanced / Crosses / Through balls). Both had to
bite in something measurable or they would be decoration, which is the one
thing the user explicitly did not want.

Build-up moves the `_im` multipliers the engine already runs on, and it is the
only instruction in the game that reads the other bench: playing out against a
high press costs you, going long refuses that game. That clash cannot be settled
in `_side`, because the sides are built one at a time and the second one does not
exist yet — it is settled once, on the first tick.

The final third re-picks the creator and the shooter of each chance the engine
builds, on the instruction, 75% of the time. Measured over 70 matches a setting
against the same squad, reading who actually scored and who actually assisted:

| final third | assists from wide | scorer's heading | scorer's pace | goals/game |
| --- | ---: | ---: | ---: | ---: |
| Balanced | 60.7% | 16.00 | 17.85 | 1.73 |
| Crosses | 68.8% | 16.51 | 17.71 | 1.97 |
| Through balls | 28.4% | 15.60 | 18.16 | 1.81 |
| Work it in | 32.1% | 15.95 | 17.97 | 1.50 |

The composition differences are the real result — a 40-point spread in where the
assists come from is far outside the sampling noise. **I am not claiming the
goals-per-game column.** At 70 matches and ~120 goals a cell, the difference
between 1.73 and 1.97 is inside what I can distinguish; an earlier run of the
same probe had Play out ahead of Go long and this one has it behind. The tests
assert composition and deliberately do not assert goal totals.

AI clubs pick both from their own squad, which gives the pyramid a shape rather
than one plan copied everywhere:

```text
PL   build: 13 play out
CH   build: 10 play out, 4 balanced
L1   build:  7 play out, 7 balanced
L2   build:  3 play out, 10 balanced, 1 go long
NL   build: 13 balanced, 1 go long
```

**A probe that lied to me, and how.** My first measurement said the final third
did nothing: crossing moved the wide-creator share from 49.8% to 50.6%. The
recorder was wrapping `MatchSim.prototype.shotEvent` *after* my module had, so it
was outermost and read the arguments before my re-pick, then handed them down. It
was faithfully recording the decision I had just overridden. Measuring the players
who actually finished with a goal or an assist on their name — downstream of
everything — showed the real effect. Worth remembering: **a spy installed last
sees the world first, which is the opposite of what you want.**

**On "it shouldn't be two different engines".** It is not two engines, and that is
worth being precise about because it changes who should fix what.
`MU.m = new MatchSim(MU.fix)` — the match you watch *is* the simulation. One
engine produces every result in the game. What sits on top of it is an animation
layer (`MU.play`, `choosePass`, the dots) that improvises its own ball movement to
have something to draw while the engine ticks. So there is one engine and one
renderer that does not ask the engine where the ball went.

The part of that which was actually causing the reported problem — the tactic
being read in both places with different strengths — is fixed: both now resolve
the same setting through the same function. The remaining half, making the
animation a *rendering of engine events* so a pass you watch is a pass the engine
recorded, is a rewrite of the renderer's ball model. That is Claude's lane and a
much bigger job than anything in this file. I have said so to the user rather than
starting it.

### Cycle 20 — an attacking focus with an off switch

The report was "if I click attack down the centre it will only literally attack
down the centre, and there is no mixed". Both halves are true, and measuring them
turned up two more things underneath.

**1. There is no neutral, and never was.** The row offers Left Flank, Central and
Right Flank. Every save ever played has been committed to a channel. The engines
handle a neutral perfectly well — every focus branch is an `if/else if` chain
with no `else`, so an unrecognised value produces no bias — the setting existed
and could not be chosen.

**2. The two engines disagree about what the setting means.** In `choosePass`,
which drives the 2D match you watch, Central multiplies every central receiver by
1.5 and every wide one by 0.7 — a 2.14:1 lean on *every pass of every move*.
Compounded over a five-pass move that is about 45:1. In the simulated engine it is
close to decorative. Measured, 80 matches per setting, chances by the channel they
were created in:

| focus | left | central | right |
| --- | ---: | ---: | ---: |
| Balanced | 12.3% | 49.8% | 37.9% |
| Central | 10.6% | 52.9% | 36.4% |
| Left Flank | 21.2% | 40.9% | 37.9% |
| Right Flank | 12.3% | 38.5% | 49.1% |

Central moves chance creation by three percentage points. So the instruction is
overwhelming in the game you watch and almost nothing in the game that decides the
score.

**3. Every AI club in the world was hard-wired to Central.** `_side` builds the
opposition's tactics fresh for every match with a literal `passFocus:'Central'`.
Nobody in the game has ever played down a wing on purpose.

**What I did.** Added `Balanced`, and a `Focus strength` row with `Slight` and
`Strong`, applied to *both* engines from the same setting so what you watch and
what you get move together. Opposition clubs pick a channel from where their best
creator actually plays.

**How, without copying the pass model.** The engines only understand three hard
values and a strength dial needs values in between. Rather than copy 25 lines of
pass weighting out of the 2D engine — which would rot the moment Claude touches it
— each individual decision draws whether it is a biased one: Strong biases every
decision, Slight biases 45% of them. That is a genuine half-strength lean built
out of the engine's own weighting, with the engine untouched. The value goes back
in a `finally`, so a tactic is never left changed behind the player's back.

Measured after, same method:

| setting | left | central | right |
| --- | ---: | ---: | ---: |
| Balanced | 17.6% | 65.0% | 17.4% |
| Left Flank / Slight | 22.5% | 59.9% | 17.6% |
| Left Flank / Strong | 27.4% | 56.9% | 15.8% |
| Right Flank / Strong | 16.9% | 54.9% | 28.2% |

Strong leans about twice as far as Slight, and the two flanks are now symmetric.
Opposition clubs across 39 sampled: 26 Balanced, 12 Central, 1 Right Flank.

**Migration.** A save sitting on Central was not choosing Central — that is where
the game put it and nothing else was on offer — so it comes across as Balanced. A
save on a flank was a real decision and is kept.

**Still true and not fixed: Central does nothing in the simulated engine.** After
the change it is 64.5% central at Strong against 65.0% at Balanced. The cause is
upstream of the focus: the creator weighting gives every central slot a flat `+4`
bonus, so central creation is already saturated at about two thirds before any
instruction is applied. Boosting it further would need the flanks suppressed
instead, and that is a change to the balance of the chance model rather than to
the focus setting. Measured and logged rather than guessed at.

**Lane note for Claude:** this is your match engine and I have not touched a line
of it — `src/tactics.js` only wraps `vTactics`, `MatchSim.prototype._side`,
`MatchSim.prototype.tickOnce` and `choosePass`, and the only thing it ever writes
is `tac.passFocus`, restored immediately. The user asked for this directly.

### Cycle 19 — the play-offs, played

`endSeason` promoted whoever was in the top N of the table and that was the whole
mechanism. The counts in `PYRAMIDS.ENG` were already right — three, three, four,
two — but three of those three, and the last of those four, are decided at
Wembley in the real world and were being handed out on goal difference here.

|  | automatic | play-off |
| --- | ---: | --- |
| Championship | 2 | 3rd–6th |
| League One | 2 | 3rd–6th |
| League Two | 3 | 4th–7th |
| National League | 1 | 2nd–5th |

Nothing about the number going up changes. What changes is who.

**They are played, not simulated.** The game already had everything needed and
nothing had ever used it that way: a cup engine with two-legged ties and neutral
finals, a day loop that stops on `userMatchOn()` and opens the match screen for
a tie in *any* competition in `G.cups`, a Cups screen that renders whatever is
there, and a `checkSeasonEnd` that already knew how to hold a season open while a
final was outstanding. So a play-off is built as a competition rather than as a
special case, and all of that works on it without being told. Measured — this is
the same question `advanceDay()` asks before it opens the match screen:

```json
{"found": true, "cup": "POCH",
 "comp": "Championship play-offs · Play-off semi-final",
 "day": 328, "isTheTie": true}
```

**Two wrappers, no new promotion code.** `checkSeasonEnd` builds the competitions
the moment the last league fixture has been played and before anything can close
the season; the existing cup-hold then keeps the season open on its own. `WORLD_PR`
hands `endSeason` the function that does promotions — reputation, budget, wage
ceiling, the movement mail, the honour, the board's patience — and rather than
reimplement any of it I hand it a sealed table with the play-off winner moved
into the last promotion place, and hand the real one back in a `finally`. The
final table the player sees is never altered.

Measured across a season, with the four winners and where they had finished:

```text
Championship     Burnley (3rd)
League One       Barnsley (4th)
League Two       Crewe (4th)
National League  Boston Utd (4th)
```

Three of the four would not have gone up under the old rule. Division sizes after
promotion and relegation: 20 / 24 / 24 / 24 / 24, unchanged.

Soaked over two full seasons — eight competitions, all eight settled, no page
errors, sizes stable — and the winners are not the seedings:

```text
season 1   West Ham (3rd)   Sheffield Wed (4th)  Rotherham (6th)  Boston Utd (5th)
season 2   Queens Park (3rd) Swansea (5th)       Walsall (4th)    Halifax (2nd)
```

**One thing I got wrong and measured rather than assumed.** I first scheduled the
play-offs four days after `seasonLastDay()`. The real Premier League schedule runs
to day 334 and `seasonLastDay()` is 324, so that put a play-off semi-final ten
days *before* the top division had finished playing. They are now anchored on the
last fixture actually in the list, whatever the calendar says.

**Known and deliberate.** The National League really runs a six-club play-off with
byes for second and third; this runs four, like the three divisions above it.
England only — the English pyramid is the one modelled club by club, and the rest
of the world is promoted on the table because the rest of the world is not played
out. `ladders()` reads `PYRAMIDS`, so adding a country is a one-line change if a
modelled second tier abroad lands.

**For Claude and Codex:** `divShape()` in `interactions.js` still reports `up` as
the number promoted, and the press and the boardroom still call 3rd "a promotion
place". That is now a play-off place, and the language should eventually follow.
`window.RBSPlayOffs.playOffPlaces(div)` returns `{auto, from, to, up}` for exactly
this. I have not changed the wording yet because it is press-room copy and I would
rather do it in one pass.

### Cycle 18 — winning things pays

The user asked whether league position and cup progression actually pay, and
said to make it as realistic as possible. One of the three is fine. The other
two were badly wrong.

**1. The Champions League league phase paid nothing at all.** Eight matches
against the best clubs in Europe. I forced a run of `W D L W D L W D` in a live
career with Manchester United and watched the bank on every matchday:

```text
MD1 W   bank +£0   budget +£0
MD2 D   bank +£0   budget +£0
MD3 L   bank +£0   budget +£0
MD4 W   bank +£0   budget +£0
MD5 D   bank +£0   budget +£0
MD6 L   bank +£0   budget +£0
MD7 W   bank +£0   budget +£0
MD8 D   bank +£0   budget +£0
phase closed   bank +£11,000,000   budget +£0
```

Three wins and three draws against Europe's best, worth nothing. The only money
in the whole phase was an £11M lump for finishing in the top eight.

The figures to fix it were already in the file and nothing read them. `EURO_DEFS`
carries `pot:[a,b]` per competition and `b` is, to the pound, the real UEFA
per-win fee — £2.1M for the Champions League, £400K for the Europa League.
`CUP_DEFS[key].prize[0]` is derived from it as `pot[1]*3`, so the per-win fee can
be recovered as `prize[0]/3` **without this module naming a single competition**,
which matters while the leagues are being rebuilt elsewhere. A draw is a third of
a win in every UEFA competition at every level, and the ranking share is an
eighth of that again. Against the published 2024/25 distribution:

| | model | real |
| --- | ---: | ---: |
| win | £2.1M | €2.10M |
| draw | £700K | €0.70M |
| per placing in the table of 36 | £275K | €0.275M |

**2. Nobody was paid for where they finished in that table.** UEFA pays one share
per place — thirty-six shares for finishing first of thirty-six, one for
finishing last. The game paid a flat lump to the top eight and nothing to anyone
else, so ninth and thirty-sixth were financially identical. First is now worth
£9,900,000 on top of the results themselves.

**3. No cup money in the game had ever reached the transfer budget.** Not the FA
Cup, not the League Cup, not the European knockout ladder, not the winners'
cheque. Every one of them does `G.clubs[G.my].bank+=pr` and stops there, while
the end-of-season merit payment and the tour fee both move the budget as well.
So a cup run filled the accounts and gave the manager nothing to spend.

I did not touch any of the code that pays it. A wrapper watches the bank across
`progressCups` and moves the same amount onto the budget, which covers every
payment made anywhere beneath it — current and any added later. Measured, winning
every tie in both domestic cups:

```text
FA Third Round     bank +£500,000     budget +£500,000
FA Fourth Round    bank +£900,000     budget +£900,000
FA Fifth Round     bank +£1,500,000   budget +£1,500,000
FA Quarter-final   bank +£2,500,000   budget +£2,500,000
FA Semi-final      bank +£4,000,000   budget +£4,000,000
FA Final           bank +£16,000,000  budget +£16,000,000
```

**4. League position was already right, and I am saying so rather than
changing it.** The merit ladder built in cycle 2 pays per place and per division,
measured:

| | 1st | 2nd | mid | last |
| --- | ---: | ---: | ---: | ---: |
| Premier League | £68.0M | £64.6M | £37.4M | £3.4M |
| Championship | £21.6M | £20.7M | £11.7M | £0.9M |
| League One | £6.24M | £5.98M | £3.38M | £0.26M |
| League Two | £4.56M | £4.37M | £2.47M | £0.19M |
| National League | £3.12M | £2.99M | £1.69M | £0.13M |

The real Premier League merit ladder in 2023/24 ran £62M for first to £3.1M for
twentieth. Nothing to do here.

**5. And the accounts never admitted any of it had happened.** `seasonRevenue`
has four lines — broadcast, gate, commercial, merit — and no cup money has ever
been in any of them, so the Finances screen showed a club that had just won
£100M in Europe exactly the same revenue as one that failed to qualify. That was
survivable while cup money was small and is not now. UEFA money is broadcast
money, and the parachute layer already puts its payments in the same bucket, so
the season's prize total goes on the broadcast line, where the Finances screen
and the PSR position pick it up without being told about it.

New file `src/prize-money.js`, wrapping `progressCups`, `euroInit` and
`seasonRevenue`. Three
tests in `tests/prize-money.test.cjs`, all written against the *shape* of the
reward — a win beats a draw beats a defeat, a later round beats an earlier one,
first beats last, and every penny in the bank is also in the budget — so
re-tuning the numbers leaves them green and paying nothing does not.

**A flaky test of my own, fixed while I was here.** `the summons letter leaves
the mailbox once you have been up` asserted the home screen's attention list was
*empty* after the meeting. It simulates up to twelve days to get the summons, and
in some of those runs a press conference or a blocking decision has legitimately
landed by then, so the test failed on things that were not its business. It now
asserts what it actually meant: no route back up to the boardroom is left on the
screen. Ran the file three times to confirm.

**What I deliberately did not do.** Prize money in this game has always been the
manager's club alone; AI clubs are funded by the income model in `economy.js`,
which knows nothing about Europe. A Champions League club really does out-earn a
non-European rival by £80M+ a season, and modelling that would move every club's
spending power in the world. That wants a ten-season soak before it goes in, not
a guess. Logged here rather than done.

### Cycle 17 — the tour, the letter and a question nobody could answer

Three reports from one session of play.

**1. The pre-season tour felt like it cost money.** It never did — every option
pays. But measured, this is where the money went:

```text
North American tour   bank +£8,400,000    budget +£0
Far East tour         bank +£16,900,000   budget +£0
```

The fee lands in the club's cash and **the transfer budget never moves**, so you
fly a squad round America, earn eight million, and have not one extra pound to
spend on players. The user's framing was exactly right: touring is how a club
funds its summer.

Three things. The fee and any invitational prize now reach the **transfer
budget** as well as the bank — those are not two pots, a signing debits both, so
this is the cash arriving and the permission to spend it arriving with it.
Staying at the training ground earns a little rather than a flat zero, which made
"stay at home" read as a punishment rather than a choice. And the fee is sized by
who you are: the old scale had a floor of 0.10 on reputation, so a National
League club drew **£2,000,000** from a North American tour — two and a half times
its entire annual revenue.

*Recomputed rather than rescaled,* because the original rounds to the nearest
£100,000 and every tour a lower-league club could take therefore rounded to
exactly nothing. No correction applied afterwards can recover a zero.

| | stay home | Ireland | Iberia | Scandinavia | America | Far East |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Manchester United | £220K | £850K | £2.0M | £3.7M | £8.2M | £16.5M |
| a National League club | £2K | £9K | £14K | £22K | £72K | £130K |
| condition | +10 | +8 | +9 | +5 | **−9** | **−12** |
| sharpness | +2 | +6 | +5 | +7 | +9 | +9 |

The trade-off itself was already right and is untouched.

**2. The summons letter stayed in the mailbox.** Cycle 16 took the button off it;
the report came back saying that is not enough — *"once you've met the board it
should remove that message from your mailbox... it should disappear until your
next board meeting."* Fair. The letter has served its only purpose and sitting at
the top of the inbox it reads as an appointment you still have to keep. It is
removed now, and the unread badge is decremented with it.

**3. "Why have you not signed anyone?" on day one.** `pre-nosignings` fires on
`preSeason && !signings.length` — and on the first morning of a career both are
true *by definition*. Nobody has failed to sign anybody; they have not had the
chance.

Early in the window the room now asks the forward-looking question — *"Do you
intend to strengthen this squad? Which positions are you looking at?"* — with
four answers of its own. The complaint waits until the last fortnight before the
opener, when a quiet summer is a real thing to answer for.

*One measurement error of mine worth recording:* I first gated it on
`G.day - G.seasonStart`, which is **negative** all through pre-season because
`seasonStart` is the opener and sits about thirty-one days ahead of day one. A
gate written on it never opens. It counts down to the opener now.

### Cycle 16 — an invitation you could accept twice

Reported from a real save, and a good one: take the very first meeting of a
career, leave the room, and the invitation is still sitting there. Go back up
and the board complains about your league position — on a day when nothing has
been played.

Reproduced exactly. **Three faults stacked in one four-line action:**

```js
ACTIONS.boardGo = el => {
  try{ const m = (G.inbox||[]).filter(x => x.id === el.dataset.mid)[0];
       if(m) m.actions = null }catch(e){}
  const k = (G.boardCall && G.boardCall.kind) || 'summoned';
  G.boardCall = null;
  openBoardRoom(k)};
```

1. **The invitation is only withdrawn if the click carried the mail's id.** The
   attention strip — the most likely place to press it — builds its button from
   `attnAnswer()`, which pushes the board item with **no `mid` at all**. So the
   mail keeps its "Go up" button for ever.
2. **With no summons outstanding the fallback is `'summoned'`** — the crisis
   scene. A stale button therefore opens *"We will not dress this up"* out of
   nowhere.
3. **On day one `leaguePos` returns a reputation-sorted position**, so the
   crisis scene read *"4th is not what was agreed"* — quoting the manager's own
   target back at him as though it were the table.

Measured before and after, same career, same first summons:

| | before | after |
| --- | --- | --- |
| first press | `objectives` | `objectives` |
| invitation left behind | **yes** | no |
| second press | **`summoned`** — "4th is not what was agreed" | `checkin` — "Nothing has happened yet" |

The invitation is now consumed inside `openBoardRoom`, so it is withdrawn from
**every** entry point rather than only the one that happens to pass an id — the
finances button had the same hole. And a button with nothing behind it opens the
meeting you asked for, never a crisis: a crisis scene should only ever be
reachable from an actual summons.

**Worth noting for the pattern file.** This is the third defect in three cycles
that came from a *fallback* rather than a calculation — `|| 'summoned'` here,
`|| 'the league'` shapes elsewhere, `boardTarget()` losing `{exp, txt}` in cycle
8. A default that is a *worse* state than the thing it is defaulting for will
eventually be reached, and it will look like a bug in something else entirely.

### Cycle 15 — the board looks at the squad you actually have

Open finding 9, and half of it turned out to be wrong.

**What was real.** `expectPos` ranks a division by reputation, and reputation
does not move when you sell people. Measured — Manchester United, one window:

```text
sold Bruno Fernandes, Matthijs de Ligt, Bryan Mbeumo
top sixteen: 85.2 -> 83.7
board's target: 5th -> 5th
```

Not one place. The same blindness covers an injury crisis and a promoted side
that never strengthened.

**What was not real.** I had also written that the target ignores promotion. It
does not: a promoted club carries a low reputation into its new division, so
Ipswich, Coventry and Hull all sit on the Premier League floor of 17th — "stay
up", which is exactly right. I had it on the open list as a defect for two
cycles and it never was one.

**The fix.** The expectation is now half what the club *is* (reputation) and
half what it can *put out* (the mean of the top sixteen), ranked within the
division and bounded to five places either side of the reputation baseline —
because a board that halves its demands the moment you sell somebody is as
wrong as one that never notices.

**Asymmetric, deliberately.** A board notices a weakened squad faster than it
rewards a strengthened one, and symmetric weighting also moved the default
Manchester United target from 5th to 3rd before the manager had done anything —
a difficulty change nobody asked for. Softening applies in full; hardening at
0.4.

Measured after, stripping the same squad three players at a time:

| sold | top sixteen | target | what the board says |
| --- | ---: | ---: | --- |
| nothing | 85.2 | 4th | the squad is stronger than the badge suggests |
| best 3 | 83.7 | 5th | — |
| best 6 | 82.1 | 6th | the squad is a little lighter than the badge suggests |
| best 9 | 79.5 | 7th | the squad is a little lighter than the badge suggests |
| best 12 | 77.7 | 9th | the squad is short of what this club usually puts out |

And the ends of the pyramid still read correctly: the weakest Premier League
club is asked to survive, the strongest Championship club to go back up, the
strongest National League club to go up.

**The board says why.** `boardTarget().txt` carries the reason — *"finish 6th or
better — the squad is a little lighter than the badge suggests"*. A board that
quietly moves the target without saying so is worse than one that never moved
it.

### Cycle 14 — the audit: scouting, the dressing room, the academy

The four surfaces I had not looked at. Two were fine, two were not.

**Injuries and the physio are correct.** Six per cent faster healing a star, a
triage rule that eases the rate when the treatment room is already full, and
sensible severity bands. Nothing to do.

**The half-time dressing room is the best-built screen in the game** — it reads
every rating, the legs, who is on a booking, who is drowning, how many leaders
are on the pitch, and each group talk tells you what it would do to *this* room
rather than in general. One gap: it had no idea which match it was, so a cup
final and a July friendly in Chicago put identical words on the whiteboard.
`fixCtx` already works all of that out for the match engine. The whiteboard now
carries the competition and, where it matters, the occasion — *"There is a
trophy at the end of this one"*, *"It is July. Nothing is at stake but the
work."*

**A scout report was one sentence, and it was the player's own card read back.**

```text
"Bill Fraser has completed a full report on X (ST, LEE). Overall 68,
 potential ★★★. Attributes are now fully revealed."
```

Three weeks of a scout's time, and it answered neither of the two questions you
sent him to answer. It now says where the man would sit in your squad by name
and by margin, how far he is actually likely to get (`playerCeiling`, which
already existed and nothing used), what he would cost against your budget and
your wage room, what kind of professional he is, and then reaches a verdict.

*The verdict needed two passes.* Ranking it on raw overall against the
division's star threshold told a National League club to **sign Kylian Mbappé** —
a player it could not afford by three orders of magnitude — and told the same
club that a man eleven points better than anything it owned "would not transform
us". The ladder is ordered on affordability first and margin-over-your-own-best
second, and a prospect is judged on where he is going rather than where he is.

**The academy did nothing at all.** Measured over four hundred generated intakes
per level:

| | level 1 | level 5 |
| --- | ---: | ---: |
| Manchester United, mean intake potential | 85.2 | 85.8 |
| smallest National League club | 43.9 | 44.5 |

Five levels of investment, worth 0.6. The board hands academy upgrades out as a
reward, the facility has a 1–5 rating on the stadium screen, and it changed
nothing.

**The cause is an overwrite, not a calculation.** The bonus lives in a wrapper
at line 3563 — `const _genYouthPlayer = genYouthPlayer; genYouthPlayer =
function(...)` — and a later layer at **19401** assigns `genYouthPlayer =
function(...)` outright instead of wrapping it. The whole wrapper, bonus and
all, is thrown away. Nothing errors; the facility silently stops existing. It is
the same failure mode as the `boardTarget` shape mismatch in cycle 8: a layer
replacing rather than wrapping.

Reapplied against the *reach* the current generator produces rather than as a
flat number, so it works at every level of the pyramid — and **centred on level
2 rather than level 1**, because every club in the world has an academy level
(92 at level 1, 271 at 2, 105 at 3, 16 at 4) and a bonus applied upward from
level 1 lifts the entire world. The median club is untouched; a neglected
academy is slightly worse; one you have paid for is meaningfully better.

| | level 1 | level 2 | level 5 |
| --- | ---: | ---: | ---: |
| Manchester United | 83.6 | 85.5 | 90.6 |
| smallest National League club | 42.9 | 44.0 | 47.4 |

Sized twice: the first attempt put United's mean intake potential at 94.2 with a
top decile of 97, which is a world-class player every single year and a decade
of that inflates everything.

### Cycle 13 — commercial income climbs the way it really climbs

Open finding 3, measured properly rather than left with a note. The
sponsorship model is linear in reputation, and real commercial revenue is
nothing like linear: a global brand sells shirts in Asia and a good mid-table
side sells them in one town.

Against published 2023/24 figures:

| club | model | real | ratio |
| --- | ---: | ---: | ---: |
| Arsenal | £216M | £218M | 0.99 |
| Chelsea | £192M | £211M | 0.91 |
| Newcastle | £151M | £90M | 1.68 |
| Palace | £133M | £40M | 3.33 |
| Brighton | £139M | £27M | 5.15 |
| Bournemouth | £127M | £24M | 5.29 |

**Top-to-bottom spread: 2.5× in the model against 14.3× in reality.** So the
top of the division was already right and everything under it was three to five
times too generous.

The fix places a club between its division's published reputation floor and
ceiling and raises that to a power, anchored so the biggest club is worth
exactly what it was worth before. It is written against `LEAGUES[div].repTop`
and `repBot` rather than against any division by name, so it follows the pyramid
work.

After — median ratio **0.99**, spread **14.2×** against a real 14.3×:

| club | model | real | ratio |
| --- | ---: | ---: | ---: |
| Arsenal | £213M | £218M | 0.98 |
| Newcastle | £89M | £90M | 0.99 |
| Palace | £40M | £40M | 1.00 |
| Bournemouth | £36M | £24M | 1.50 |
| smallest | £15M | ~£15–18M | — |

**And what the measurement caught.** My first version applied the curve to every
division. A regression test failed with *"L2/bot (Barnet) loses £205K a year
before the manager does anything"*, two more failed because National League
sponsorship rounded to zero, and a fourth failed because a built club's owner
was now covering a loss it should not have had. The power law is a global-brand
effect: it belongs in a top flight and nowhere else. Below tier one the old
straight line stands, which is what cycle 2 measured and calibrated.

One more thing that fell out of it: `ownerCash` covered **120%** of a shortfall,
so a club running at a loss gained a fifth of it as surplus every year — the
same hoard cycle 11 was written to stop, in miniature. It covers the loss
exactly now.

### Cycle 12 — the four defects I had logged and not fixed

All four were in my own "found but not fixed" list. None of them is dramatic;
all four were things I had written down and walked past.

**1. The morale drip was still Premier-League-shaped.** The *complaint mail* is
gated on a third of the season — that was the user's request and it works. The
silent drip underneath it was not: `weeklyTraining` takes 2.4 morale a week off
anybody below his role's share from the **fifth match**, so a player was being
quietly ground down for weeks before he was allowed to say anything about it,
and five matches is a different fraction of a 46-game season than of a 38-game
one. The drip is now reversed — exactly, by the amount it actually took, so
nothing else that moves morale in the same tick is disturbed — until the same
gate opens. A fringe player still never drips at all; his role does not promise
him minutes, which was the point of deriving roles from squad rank.

**2. Nobody outside your own division had ever served a suspension.**
`simFixture` sends anything that is not a cup tie and not one of the divisions
the real engine runs to `fastSim`, which accrues appearances, goals, assists,
ratings, clean sheets and injuries — and no cards at all. Measured over thirty
matchdays:

| division | model | bookings a match | players suspended |
| --- | --- | ---: | ---: |
| Premier League | real engine | 5.07 | 10 |
| Championship | real engine | 4.22 | 8 |
| League One | fast model | 0.39 | **0** |
| League Two | fast model | 0.33 | **0** |
| National League | fast model | 0.19 | **0** |

The handful below the top two are from cup ties, which always get the real
engine. So the club you are chasing for promotion never lost a man to a ban, and
a player you scouted two divisions down had a blank disciplinary record whatever
kind of footballer he was. Bookings are accrued at the engine's own rate now,
under the engine's own rules — one match for a fifth booking, one for two
yellows in a game, two for a straight red — seeded from the fixture so it is
deterministic. After: 4.19 to 4.95 a match in every division, and suspensions
everywhere.

**3. `ACTIONS.roleTalk` was about the wrong player.** It resolved with
`players.find(x => x._pending)` — the *first* flagged player, not the one the
message named. Unreachable in a new career because the unrest layer replaced the
mail that raised it, but an old save can still be carrying one. It reads the name
off the message now.

**4. `interestScore` saturated before my correction could land.** The division
fix took the old league-position term back out of the finished score and added
the right one — but the function it wraps clamps to 0–100 before returning, so on
a score that had already saturated the correction was absorbed and the division
was silently ignored again. The term is neutralised at source instead: `leaguePos`
is the only thing the original reads to compute it, so it is fed a neutral
position for the duration of the call and nothing needs unpicking afterwards.

### Cycle 11 — the owner was wiring the wage ceiling in cash

Going back to verify the built-club climb — the user's headline mode — turned up
the third money leak in as many days, and this one was mine too.

A club you build with the **generous** chairman had **£410,000,000** in the bank
after six seasons in the National League. Traced to thirteen payments a season
of **£1,733,764** each — £22.5M a year — from `ownerFunding`.

**What that number is for.** Below the Championship the wage cap is a share of
turnover, so a chairman who sets a £1M-a-week ceiling has to underwrite enough
*turnover* for his own ceiling to be legal. That is right, and it is why a
bankrolled non-league club can field a squad its division could not otherwise
afford. It is a **guarantee** — the same thing a real parent-company guarantee
is, and leagues accept them.

**What went wrong** is that the same number was also paid into the bank as cash,
every month, whether the club needed it or not. An owner covers what the club
loses; he does not wire you the wage ceiling and leave it sitting in the account.

The two ideas are now separate:

| | what it is | where it is used |
| --- | --- | --- |
| `ownerUnderwrite(c)` | the guarantee | the SCMP turnover test, so the ceiling stays legal |
| `guaranteedTurnover(c)` | base revenue plus the guarantee | what the wage cap is measured against |
| `ownerCash(c)` | 120% of an actual shortfall, capped by the guarantee | the bank, and the owner line in the accounts |

Run the club at a profit and he pays in nothing, which is the point of him.

Measured on the same career: bank over six National League seasons went from
**£4.5M → £410M** to **£4.5M → £14.4M**, budget held at the chairman's £9.7M,
squad improved 53.8 → 56.3, wage ceiling unchanged at roughly £1M a week, and
the SCMP position still passes — the ceiling is still legal, because the
guarantee is still there.

**On the climb itself.** With no manager intervention at all — no team picked,
not a penny of the £9M budget spent — the built club finished 3rd of 24 in the
National League, where two go up. That is a floor rather than a verdict: it says
the resources are right (budget ranked 1st of 24, the wage ceiling far beyond
the division) and the money no longer explodes. What a human does with £9M in
that division is the part a soak cannot measure.

### Cycle 10 — the sponsorship bug, found by a ten-season soak

Nobody reported this one. It came out of running a career for ten seasons and
measuring the world every May — the kind of drift you only meet in month three
of a real save, by which point the save is not worth keeping.

**Start a career at Worthing.** National League, £348,000 in the bank,
reputation 2,050. The club draws:

```text
£160,300,000 a year in sponsorship
£13,358,333 a month, against the £795,516 it could actually sign
```

That is Manchester United's four contracts — shirt £65M, kit £60M, sleeve £21M,
training £15M — verbatim, **202 times what the club is worth**. Northampton Town
went from £1.5M to £174M in one League Two season on it. It is the real cause of
the user's bank compounding to £922M, which I had previously written up as "the
economy is calibrated soft"; it was not, it was this.

**The cause is the ordinary career-start path.** `newGame(key)` — which is how
you pick a club from the browser, and how you start a club you have built —
does:

```js
newGame = function(sel){
  if (typeof sel === 'string') {
    _newGameKey(0);                 // builds the world around club 0, Man Utd,
                                    // and the wrapper at 9289 does
                                    //   G.deals = null; ensureCommercial();
    const ix = liveIndexForKey(sel);
    if (ix >= 0 && ix !== G.my) takeOverClub(ix);   // ...and nothing clears G.deals
```

`ensureCommercial()` only ever fills slots that are empty (`if(G.deals[k])
return`), so the contracts are never revalued. They lapse after one to three
seasons and reprice correctly then — long after the save has been decided.

The same hole runs the other way, and matters just as much for a club climbing
the pyramid: promotion and relegation never touch the deals either, so going up
earns nothing commercially until a contract happens to expire.

**Three things, in `src/economy.js`.** The contracts are rewritten to the club
whenever the club changes. They are rebased when the division changes — repriced
upward at once on promotion, and on relegation kept at no less than 65% of their
old value for the rest of the term, which is the clause every real deal has.
And `commercialIncome()` carries a bound at two and a half times what the club
could sign today, so no path I have not found can leak two hundred times a
club's worth again.

Measured after: Worthing draws **£800,000**, against a computed market of
£795,516. Manchester United is unchanged at £160.3M.

### Cycle 10b — and the world had income with no costs

The same trace turned up the other half, and this one was mine. The world loop
I added in cycle 2 — "so the pyramid does not go bust" — paid every AI club its
**revenue** and never took a penny of its **costs**:

```js
c.bank = Math.round((c.bank||0) + (centralFor(c)+commercialFor(c))/12 + gate);
```

A club with income and no wage bill compounds. Measured after a single season
the median Premier League club held **£442M**; by season four the richest club
in the world had **£2.2 billion**.

AI clubs are paid what they actually clear now, through the same
`revenueFor`/`costsFor` model the Finances screen is built from, so an AI club's
balance means the same thing yours does. Two bounds on it, both from the user's
standing instruction that this is a game you are meant to win:

- **nobody goes bust.** A club that would lose money banks 3% of turnover
  instead, and never drops below a month and a bit of wages. The real
  Championship lost £436M last season; here the shape is real and the level is
  kind.
- **nobody hoards.** A bank is capped at one and a half seasons of turnover —
  a club with more than that has spent it, on the ground, the training ground
  and the squad.

Six seasons measured, no manager intervention:

| | day 0 | after 6 |
| --- | ---: | ---: |
| Premier League median | £139M | £148M |
| Championship median | £14.4M | £2.7M |
| League One median | £2.95M | £1.30M |
| League Two median | £1.20M | £808K |
| National League median | £410K | £460K |
| clubs overdrawn | 0 | 0 |

Flat rather than exploding, which is the point.

**And the last piece: the Finances screen was charging you for something that
never left your account.** `costsFor` has always had a running-costs line — the
ground, the matchdays, everything that is not a wage — and only wages were ever
debited. About **£165M a year** at Manchester United, shown to you and never
taken. It is charged monthly now, so the projection on the screen is the money
that actually moves.

**A caution for whoever reads this next.** That last change makes the user's own
club meaningfully poorer than it was, and I did it because a screen that lies
about your costs is a defect rather than a difficulty setting. But it is the one
change in this cycle that a player will *feel*. If it turns out to bite, the
honest dial is the `runs` fraction in `DIV_FIN` rather than removing the debit
again.

### Cycle 9 — everything else that talks to you, from an audit

Cycle 8 fixed a boardroom that graded on `pos < target` and so could not tell
that first place was good. This cycle was the obvious follow-up: I went looking
for the same shape of mistake everywhere else, and found it seven more times.

They are all one idea. A question, a promise or a target was written for a
single twenty-club Premier League with three relegation places, and then asked
of a twenty-four-club division with different rules. Measured in a live career:

```text
4th in League Two — an automatic promotion place
  "4th and in the mix. Is Europe the target or the minimum?"
  with "Europe is what we are chasing. It is where this club belongs."
  among the four answers offered

14th of 24 in the National League — mid-table
  "You are closer to the bottom than the top. Is this a relegation fight?"
  in the one division this game relegates nobody from

the weakest club in every division
  "The board expects 24th or better"
```

**The fix is one helper used eight times.** `divShape(div)` in
`src/interactions.js` asks the world rather than assuming: `divMembers` for the
size, `PYRAMIDS` for how many go up and how many go down, `G.clSpots` for who is
actually in Europe, and the same `n <= 12 ? (n-1)*3 : (n-1)*2` the fixture
generator uses for the season length. **Nothing in the module names a division
or hardcodes a count**, which is deliberate — it stays correct when the bigger
leagues, the corrected clubs and the published fixtures land.

England, read out of the game rather than out of my head:

| division | size | up | down | relegated from | board's floor | matches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Premier League | 20 | — | 3 | 18th | 17th | 38 |
| Championship | 24 | 3 | 3 | 22nd | 21st | 46 |
| League One | 24 | 3 | 4 | **21st** | 20th | 46 |
| League Two | 24 | 4 | 2 | **23rd** | 22nd | 46 |
| National League | 24 | 2 | **0** | nobody | 22nd | 46 |

The eight:

**1. Your own contract had the boardroom's bug.** `dealMerit()` scored the
season with `pos < obj.pos`, so 1st against a target of 1st scored **0**, and so
did 2nd against a target of 2nd. Merit of 3 is the threshold that makes the
board come to you with a new deal mid-season, and the league title is only
written into `G.honours` at `endSeason`, so winning the league could not earn a
contract until after it stopped mattering. Now 1st scores 3 whatever the target
says, and meeting the target exactly scores 1.

**2. The table questions are gated on the division's real geometry.** `pos-euro`
only fires where there is a Europe to qualify for. `pos-mid` means mid-table
rather than 7th–13th. `pos-bad` fires on the real relegation zone and says how
big it is — "you are in the bottom 4" in League One, "bottom 3" in the Premier
League.

**3. Two questions the pyramid never had.** `pos-promo` — promotion is what four
of the five English divisions are actually about and nothing asked about it —
and `pos-nothing`, for the bottom half of a division nobody is relegated from,
which is a real situation the room had no words for. Four answers each, in the
game's own shape, and both weighted up when they are the thing happening to you.

**4. No board asks a club to finish last.** `expectPos()` gave the bottom-ranked
club `index + 2` capped at the division size. The floor is now the last safe
place where relegation exists, and "not the bottom two" where it does not, and
`boardTarget().txt` says what the number means — "keep this club in League One"
rather than "finish 20th or better".

*This one needed measuring rather than reasoning.* `boardHealth()` scores
`(exp - pos) * 1.6` every month, so the old target of 24th meant the weakest
club in a division gained patience for finishing 22nd and was effectively
unsackable. My first floor (`size - 4`) flipped it too far the other way:
Worthing, the weakest club in the game, was sacked in season two of a soak. At
`size - 2` the same career survives three seasons in two consecutive runs, which
is the behaviour the user asked for — the shape is real, the difficulty is kind.

**5. Promises judged against the real relegation zone.** `judgeSeasonPledges()`
used `pos > rows.length - 3` everywhere:

- League One relegates 4 — finish **21st**, go down, and "we will stay up" was
  marked **KEPT**
- League Two relegates 2 — finish **22nd**, stay up, and the same promise was
  marked **BROKEN**
- the National League relegates nobody — and the promise broke anyway

Breaking one costs 7 fan approval and 6 patience, so it was not cosmetic. There
is now a third outcome for a division with no drop, which says so.

**6. Transfers that talk like the division they are in.** A target's demands
listed "European football" whenever the club was not in the Champions Cup —
every club outside the top five, down to the National League. `interestScore`
used `pos<=4 => +5, pos>=15 => -5`, so 15th of 24 was scored as relegation form
and `interestReasons` told you "Your league position puts him off". Both now
read the zone: promotion is worth what Europe is worth, in the division that has
it. The Cups screen also told a National League manager to "finish top four" for
the Champions Cup.

**7. A supporters' feed with a sense of scale.** "HERE WE GO" fired at £40M and
"what a signing" at overall 82, so a National League club-record signing and the
best player in League Two never registered at all. Thresholds now come from the
division, the same way the goal bonus and the loan fee already do. Anything the
pyramid work adds later is sized from its own clubs' reputations rather than
falling back to Premier League money.

**8. One of mine.** `src/boardroom.js` shipped yesterday with the promotion and
relegation counts written down, and had three of the five English divisions
wrong — including the National League relegating four clubs. It reads
`window.RBSShape` now. While I was in there, an answer that moves the season's
target is clamped to the division on the way out, which also fixes the
`Math.min(20, …)` in the objectives scene — a hard 20 in a division of 24.

**And one that was not on the list.** Seven leagues play `(n-1) * 3`, not
`(n-1) * 2` — Scotland, Austria, Switzerland, Denmark, Serbia, Ukraine and
Croatia, at 10 to 12 clubs each. The press room assumed twice, so a 12-club
season it thought was 22 games long is 33: `games left` hit zero at matchday 22,
**the run-in questions were asked in midwinter and never once in the actual
run-in**, and both the title-race and relegation-fight definitions collapsed to
their floor for the whole second half of the season.

### Cycle 8 — the boardroom, from a real save

First meeting of the season: top of the league after five matches, four wins and
a draw, against a target of 1st. The board said *"which is about where we asked
you to be"*, offered **Take the criticism**, and took five points of patience off
for asking to be backed.

One line caused all of it (`red-devil-manager.html:45389`):

```js
const ahead = pos && obj.pos && pos < obj.pos;
const level = pos && obj.pos && Math.abs(pos - obj.pos) <= 2;
```

With `pos = 1` and a target of 1st, `1 < 1` is false. There is nowhere above
first to be, so the best available outcome fell straight through to the
underperformance branch — graded identically to 12th against a target of 10th.
Every answer in the scene then keyed off that one boolean, which is why
`Ask for backing` ran `boardMood(-5)` while leading the league and
`Take the criticism` was the best-scoring reply in a room that had not
criticised anything.

**What the room now knows.** `brFacts()` is the boardroom's `pqFacts()`: matches
played against the length of the season, points per game, the last six results,
the longest unbeaten / winning / losing / winless runs, which cups are still
alive and what round they are at, promotion, play-off and relegation zones sized
for the actual division, budget, bank, who is injured, and the phase of the
season.

**How it is graded.** A seven-band spectrum on the margin between where you are
and where you promised to be — `flying · ahead · ontrack · justshort · short ·
bad · crisis` — with a hard ceiling rule first: **1st is the top band whatever
the target says.** Then form moves you a band, a live semi-final or final moves
you a band, the bottom three caps you at `short` whatever was agreed, and nobody
is graded below `short` inside the first six matches.

| where you are | band | before |
| --- | --- | --- |
| 1st, target 1st, 5 played | `flying` | "about where we asked you to be" |
| 2nd, target 10th | `flying` | ahead |
| 6th, target 9th | `ahead` | ahead |
| 9th, target 9th | `ontrack` | level |
| 11th, target 9th | `justshort` | level |
| 13th, target 9th | `short` | behind |
| 16th, target 9th | `bad` | behind |
| 20th, target 4th | `crisis` | behind |

**How it sounds.** Every opening, verdict, answer label and reply comes from a
bank of 3–6 versions, and `vary()` refuses the last **two** it used for that key,
so a five-line bank cannot alternate between the same pair. Measured over 16
consecutive meetings: 6+ distinct board lines, 8+ distinct answer labels, 6+
distinct replies. The greeting itself carries a temperature, so a good month
never opens with *"sit down, this is not an ambush"*.

**The answers are built for the band.** A league leader is offered *keep our feet
on the ground · back it while it is running · raise the target · credit the
players*, and asking for money there gains budget and patience. Only a club
actually behind is offered *this squad needs help* or *it is on me*, and only a
club in crisis is offered *then sack me*. Raising the target is suppressed when
the target is already 1st and you are already 1st — there is nothing to bid with,
so it becomes a promise of silverware instead.

**Two more things found while in there.** `boardScene('review')` is not the
end-of-season debrief; it is the meeting behind **Request more transfer funds**,
available once a season whenever you press it — so in October it was saying "You
finished 14th… So. Next season." It now reads the calendar. And a later layer had
replaced `boardTarget()` with a `{pos, agreed}` shape while the monthly board
mail still read `{exp, txt}` from the older one, so every warning mail printed
*"target undefinedth"*. Both shapes now come back from the one call.

Three seasons soaked: 24 meetings taken and answered at random, zero JS errors,
no `undefined`/`NaN` in any line or reply, no board mail printing an undefined
target, no negative bank anywhere in the world.

### Cycle 7 — the press room, from a real save

Six wins on the spin and it asked about a blip. The rule guards turned out to be
right — `form-poor` genuinely cannot fire on a winning run, and there is an
existing guard that suppresses every competitive question until something has
been played, which is why my first two probes showed nothing eligible at all.

The measurement that mattered, after eight real matches with a six-game run:

```text
46 rules · 272 lines · picked uniformly at random
  context-free "open-N" filler   51.5% of the pool
  your six-win streak            3 lines, ~1%
  your league position           3 lines, ~1%
```

Selection is uniform over *lines*, so a topic with ten interchangeable phrasings
was ten times likelier than the thing actually happening to you. That is the bug,
and no individual rule was wrong.

**What the room now knows.** `fixCtx` already works out competition, round,
knockout, final, semi-final, European night and stakes for the match engine, and
nothing passed any of it to the press room. That plus division, matchday out of
the season's total, phase of season, derby, and the eleven you picked — including
a star you left out, a debutant, and how young the side is. Twelve new questions
use it, with four answers each in the game's own shape.

**Weighting, using the game's own mechanism.** Selection is uniform over the
bank, so the bank is a multiset and a topic appears in it as many times as it is
worth — exactly the trick the existing occasion boost already uses. Filler is 1,
an ordinary question 4, the thing happening to you 20.

```text
after: 47 rules · 574 lines
  filler                24.4%  (was 51.5%)
  your six-win streak   10.5%  (was ~1%, now the single most likely topic)
```

One of my own bugs worth recording: I mixed two `guard` conventions between
modules — one returns the result, the other returns a wrapped function — and
called the result. It threw at load, which silently skipped the new questions,
the answers and the entire weighting layer while the facts still installed. The
measurement looked like a partial success rather than a crash.

### Cycle 6 — the budget slider, from a real save

The user played it and sent two screenshots taken seconds apart. The squad
screen said `WAGE BILL £106K/w of £72K/w` in red. The transfers screen said
`£183/w WAGE ROOM LEFT` in green. Same two numbers: one divided by the ceiling,
the other by the ceiling plus the 18% overdraft the signing checks quietly allow.
The hidden one is gone — the ceiling is the ceiling, and the overdraft is stated.

**The slider went one way and did not look like it.** Its right-hand limit is
`(ceiling − bill) × 52` floored at zero, so once the bill passes the ceiling
nothing can move towards transfers, `max` becomes 0, and the neutral value of 0
renders the handle hard against the right-hand end — directly under the words
*more transfers →*. It reads as maxed out. It is stuck, and every further drag
moves another lump the other way; the reported save had shifted £808,000 without
meaning to.

**And `budLimits` can return an inverted band.** Once the wage bill is further
above the ceiling than the entire transfer budget could close, `wageLo` (bill ×
1.02) ends up above `wageHi` (ceiling + budget/52) — measured at £108,119 against
£95,077. Any range built on that is nonsense, and the commit had no checks of its
own to catch it. The two constraints that are always true are derived directly
now: you cannot spend a budget you do not have, and you cannot cut the ceiling
below the people already on it. **Raising** the ceiling is never blocked, because
when you are over it that is the way out.

**How the bill got over the ceiling.** Contract talks check it, free agents check
it, deadline day checks it. Neither loan path does — both test the fee against
the transfer budget and stop. That is the hole, and it is plugged.

Verified against a reproduction of the reported save: the panel now says you are
over the ceiling instead of claiming room left, explains why nothing moves back
to transfers, and pouring £1.2M of transfer money into the ceiling — the escape —
commits where before nothing did. On a healthy club, £250K out and £250K back
returns both numbers to exactly where they started.

### Cycle 5 — a built club that can climb

The user wants a club they build to reach the Premier League and win the
Champions League in five or six seasons. Before changing a number I measured what
was actually stopping it, and it was not what I expected: **the free-agent market
is deep and open to everybody** — 238 players, up to eighty rated — so a new club
is gated by its wage ceiling and not by its reputation.

| weekly ceiling | per player in a 20-man squad | squad you can field |
| ---: | ---: | ---: |
| £22,000 (old) | £1,100 | **43.4** |
| £90,000 | £4,500 | **52.1** |
| £180,000 | £9,000 | **56.0** |
| £400,000 | £20,000 | **62.3** |

against National League 41.8 · League Two 47.7 · League One 53.2 · Championship
63.5 · Premier League 76.9.

So the old Tight chairman built a 43.4 squad to beat a 41.8 division. That is a
coin toss, not a project, and it is why climbing took a decade.

The three chairmen are now anchored on what a League One club actually has —
£1.23M of budget, £142,000 a week of ceiling — at £1.25M/£90K, £3.5M/£150K and
£9M/£260K. Owner funding is sized so the ceiling is legal under the division's
wage cap, which lands between £5.7M and £20.7M a year: Wrexham territory rather
than fantasy.

**And then the first version of that was wrong too, which only playing it found.**
Anchoring the owner as a flat amount over the going rate looked right and failed
in League Two: a club you build has a 2,400-seat ground, so its own income stays
small however high it climbs, and the ceiling went £90K → £108K → £112K across
three divisions while what it takes to win them roughly doubles each step.
Measured, a correctly-shaped squad at that League Two ceiling finished **11th on
67 points**; the top four were on 74–78. The chairman is now a multiple of what
his *division* pays, decaying as you climb — £90K → £195K → £352K → £916K →
£4.1M — and the same test finishes **3rd on 83 points and goes up**, in a top
four separated by one point.

Two things worth recording from that. The engine converts squad quality into
results faithfully: an XI 28 points above League Two won it with 121 points and a
+105 goal difference, so when a club is not going up it is the squad, not the
simulation. And my first three attempts to measure the climb all failed for
harness reasons rather than game reasons — free agents are stored compacted as
arrays until rehydrated, so filtering the pool by `p.id` silently left every
player I had signed still on the market for the AI to take back. Signing by
rating alone also builds a positionally lopsided side whose XI is far worse than
its squad average. Both produced convincing-looking evidence of a game bug that
was not there.

**The structural change is that the owner's contribution is a multiple of the
division, not of the club, and not a flat amount.** A multiple compounds — ten times a National League budget is
transformative and ten times a Premier League one is half a billion. An amount
behaves the way an owner does:

```text
tight chairman, ceiling as the club climbs
  NL £90K  -> L2 £195K -> L1 £352K -> CH £916K -> PL £4.1M
tight chairman, budget as the club climbs
  NL £1.3M -> L2 £1.4M -> L1 £2.8M -> CH £11.3M -> PL £82.3M
```

The budget fades faster than the ceiling on purpose: a ceiling is what lets you
field a side, and a budget stacked on top of what a Premier League club already
gets is just a cheat code. Both land on the division's own numbers by the top —
£4.1M against a Premier League median of £3.4M, £82.3M against £78.6M.

### Cycle 4 — the verification pass, and what it caught

No new features. The user asked for proof it works before merging, so I ran
three full seasons a day at a time, rendered every screen, round-tripped a save
with every new field in it, and played a built club for four seasons. It found
five things, four of which the test suite had not.

**A correction to what I told you last cycle.** I wrote that the backroom staff
wage bill was "a projection line only — nothing debits it". That was wrong, and
it was the most expensive thing in the file. `dailyWages` is wrapped a second
time at `red-devil-manager.html:3946` and takes `staffWage()/7` out of the bank
every single day. `defaultStaff` pays `(4 + rep/900) × £1,000` a week per role,
so the floor is £4,000 a head whoever you are: a built National League club was
paying its six-man backroom **more than twice its entire playing squad** and
bleeding to £12.8M overdrawn inside two seasons while its accounts said it was
profitable. The bill is now scaled down when it is out of proportion to the
playing budget, never up, so a Premier League backroom is untouched. Same club,
same two seasons, after: **+£1.09M**.

I found it by defining a property setter on `c.bank` and grouping every write by
stack frame. Reading the chain would not have found it — the drain was 708
movements of £20,000, none of them individually remarkable.

**The transfer budget was compounding.** The base game re-levels every club's
budget each summer except yours, then adds `rep × 9000` to everybody including
you, and nothing ever takes it back: £135M → £266M → £411M → £563M across three
seasons without a player being sold. A board allocates from the accounts each
summer; it does not hand you the running total of every budget it has ever set.
You keep what you did not spend, up to as much again.

**Eight Spanish clubs went bankrupt.** The foreign second-tier fallback was a
flat £4M of central money for every league in the world, and a Segunda squad is
paid like a Championship one. They ended the third season between £13M and £48M
overdrawn.

**And the fix for that was wrong first time, in a way worth recording.** I
floored each club's central distribution at its own costs. A regression test
caught it: a top-up that scales with your own wage bill is an unlimited bailout,
so overspending pays for itself and the entire point of wages being the binding
constraint disappears — and it flattened the promotion cliff, because a relegated
club kept a Premier League income. It is now measured on the **median club in the
division** and handed to everyone in it equally. A league that cannot pay its way
gets lifted; a club that has overspent inside a solvent league loses money exactly
as it should. It binds nowhere in England.

**Also:** AI clubs could carry a negative transfer budget for a month, because
the AI transfer code subtracts a fee without checking it has one. Cleared daily.

Verified after: 484 clubs, three seasons, **no negative bank anywhere, no
non-finite money anywhere, zero JavaScript errors**, every screen renders, and a
save round-trips with parachutes, wage-cap baselines, instalment ledgers and
sell-on clauses intact.

### Cycle 3 — the chairman, and how a transfer is paid for

`a7ff39e`, `08ba7bf`.

**The built-club chairman is fixed.** This was item 1 of my last "found but not
fixed" list and it was the worst thing in the file, because choosing a chairman
is the shape of the whole created-club career and the choice lasted until May.
`normaliseReps` ends every summer with `wageCap = max(wageCap, rep × 90)`;
measured, one season end, no promotion, the Tight chairman's numbers went

| | before | after one summer | now |
| --- | ---: | ---: | ---: |
| wage ceiling | £22,000/wk | £169,020/wk | **£22,000/wk** |
| transfer budget | £150,000 | £613,000 | **£150,000** |

The `rep × 90` floor is kept for every other club in the world — it stops a
generated club being left unable to field a team — and skipped for the one club
whose ceiling was set deliberately. A chairman is stored as a *multiple* of the
going rate for a club that size, reapplied each season, so Tight stays tight in
the Championship: £22K/£38K/£72K become £40K/£69K/£131K on promotion to League
Two rather than being flattened to one number.

And a ceiling above what the club turns over is an owner writing cheques, so it
is modelled as that — owner funding, its own line in the accounts, paid monthly,
counting towards the wage cap because the real SCMP counts secured owner
investment. Generous puts in £2.15M a year; Tight puts in nothing, which is
precisely what he tells you when you pick him.

One thing worth flagging for its own sake: three separate layers write to the
budget *after* `normaliseReps`, and one of them was **my own** merit-payment
correction from cycle two, quietly taking £38,000 back off the chairman's
allocation. I found it by tracing every write to `c.budget` through a property
setter rather than by reading the chain. Worth doing that whenever a number ends
up somewhere you cannot account for.

**Phase four of the economy — transfers.** Every transfer was cash on the day.
Now: fees structured over the contract (one year below £300K, four above £20M),
sell-on clauses honoured on the profit rather than the fee, agent fees at ten per
cent out of cash, and a signing fee on frees. Guarded so leverage cannot become
free money — outstanding debt is capped at 1.5× the annual budget, which is
roughly the covenant a real board imposes. Instalments settle each summer in both
directions and appear on the Finances screen.

### Cycle 1 — six defects away from the pitch

`eef35a8` and `42234ea`.

Six defects, all of them away from the pitch, all reported from a created club in
the National League.

1. **The squad-unrest loop.** A player with no role set was read as a promised
   *squad player* — 42% of the matches — so a club assembled out of free agents
   was in breach of twenty promises it never made. The complaint is typed
   `'board'`, which is in `BLOCKING_TYPES`, so it halts the season; and
   `weeklyTraining` could raise a fresh one every Monday. Answering moved one
   man's morale and changed nothing else, so the next Monday raised another.
   Now: an unset role is read from where he actually stands in the squad; the
   conversation is typed `'squad'` and does not block; nothing at all until a
   **third of the division's season** has been played (13 of 38, 16 of 46, 11 of
   33 — worked out from the division, not a constant); then one a month
   club-wide and one every twelve weeks per player, after eight weeks at the
   club. You can now tell a player honestly what he is here instead of only
   promising him minutes, and a promise is recorded and checked twelve weeks
   later. Saves already stuck in the loop are repaired on load.

2. **Cards cost nothing.** The suspensions were right — two matches for a
   straight red, one for two yellows, one every fifth booking — and were then
   served by the match that produced them, because `afterRound` decrements every
   ban at every club that played that day and the fixture list it walks includes
   the game that has just finished. Two yellows cost zero matches, a straight red
   cost one instead of two. Bans are now served once per club per matchday,
   league or cup, and never by the match that caused them.

3. **Loan fees.** `loanTerms` quoted `max(£200,000, 7% of value)` rounded to
   £100,000 — so a National League club with a £150,000 budget was quoted
   £200,000 for every player in the game. (`loanFeeFor`, the *other* loan path,
   was already corrected in `wB6_finance`; this one was missed.) The tier
   multiplier was also inverted and billed a small club 18% more than an elite
   one. Below the Football League most loans are now free.

4. **Goal bonuses.** The sheet opened at £5,000 a goal whoever you were. Now ~5%
   of a week's wage: about £50 in the National League, thousands in the Premier
   League.

5. **The transfer news.** `rumourMill` only looked at players rated 76+, skipped
   League Two and the National League entirely, and only ever named a Premier
   League or European suitor. It now works from your own division and the ones
   directly above and below it *in your country*, so Serie B reads about Serie B,
   with one story in five still from the top of the world game.

6. **Wage rises were free.** +£10,000 a week changed nothing anywhere. It now
   costs a year of the rise out of the transfer budget at the game's own exchange
   rate — the same 52 weeks `budToWage` already trades at — the sheet says what it
   will cost before you offer, and a rise the budget cannot cover is refused.

Plus the inbox, since that is where five of the six reach you: filter tabs with
unread counts, and a line of the message itself on every row.

**Footprint:** `src/gameplay-balance.js` and `tests/gameplay-balance.test.cjs` are
new. `red-devil-manager.html` +1 line, `tests/game-harness.cjs` +1 line,
`service-worker.js` +2 (precache entry and a cache-name bump to v4).

---

## Checked, commands and output

```text
npm run check
lint clean; tests 21; pass 21; fail 0; duration 107.6 s
```

Ten of those twenty-one were already here and still pass. Eleven are mine.

Three full seasons simulated a day at a time, on the merged tree:

```text
non-finite or negative money, 484 clubs   NONE
clubs with a negative bank                NONE
JavaScript errors                         0
every screen renders                      yes
save round-trip, all new fields           intact
built club, tight chairman, 4 seasons     ceiling £22K -> £60K, bank £97K -> £3.1M
```

### The economy, measured before and after

| revenue, mid-table club | before | after | real |
| --- | ---: | ---: | ---: |
| Premier League | £407M | £307M | ~£200M |
| Championship | £93M | £58M | £39M |
| League One | £34M | £20M | £7–8M |
| League Two | £15M | £9M | £5–6M |
| National League | £8.4M | £4.2M | £1.5–2.0M |

The spread across the pyramid went from about 45:1 to about 250:1, against a
real ~300:1. Wage-to-revenue moved from 0.11–0.41 to 0.16–0.59, so wages are now
the dominant single cost everywhere without being fatal anywhere.

Every division's mid and bottom club is profitable. The one club still losing
money after phase one was a relegated side carrying a £76M wage bill on £129M of
Championship income, at −£9.2M; with the parachute it is +£39.8M, which is
exactly what the mechanism exists for. Every club in every division starts
compliant with its own wage rule.

Solvency, 150 days simulated, weakest club in each division: all five still in
credit. Before this work a National League club was down to its last £65K by
Christmas, because the old code credited the user alone while `dailyWages`
debited everybody.

Gate receipts paid now equal the Finances projection to within a rounding step
— £5.22M paid against £5.18M projected at Old Trafford, £23K against £22K at a
National League ground. They were two different ticket prices before.

### Cycle 1

```text
npm run check
lint clean; tests 12; pass 12; fail 0
```

Measured, not asserted:

| probe | before | after |
| --- | --- | --- |
| straight red, ban after the match it was shown in | 1 of 2 served | 2 of 2 still owed |
| second yellow, matches actually missed | 0 | 1 |
| loan fees offered to a £150k-budget NL club (40 players) | £200,000 flat | £0–£4,250, 22 of 40 free |
| loan fee, Man United for an 81-rated | £1.5M–£3.65M | £1.0M–£1.55M |
| goal bonus opened at, £1,053/wk player | £5,000 | £50 |
| renewal at +£10,000/wk, transfer budget | unchanged | −£520,000 |
| NL inbox transfer stories | Arsenal, Man United | Gateshead→Woking, Halifax→Carlisle |

The season gate was checked the hard way rather than by reading it back: a
National League club with **every player's morale forced to 18 every single day**
for twenty matches. First knock on the door after match 16 — exactly the gate —
and one conversation in twenty matches. That run is in the regression test.

---

## Found but not fixed

The valuable section, per your own protocol. All of these are outside what I was
asked to change.

### 1. ~~A built club's chairman is overwritten at the first season end~~ — FIXED in `a7ff39e`

This one matters, because choosing a chairman is the whole shape of a created-club
career and the choice does not survive May.

A club with the *Tight* chairman starts on a £22,000/week ceiling and a £150,000
budget. After one `endSeason()`, **without being promoted**:

```text
wageCap  £22,000  ->  £169,020
budget   £150,000 ->  £651,000
```

£169,020 is exactly `rep × 90`, and rep had drifted 1850 → 1878. The floor at
`red-devil-manager.html:19522` is
`c.wageCap = Math.max(c.wageCap, Math.round(c.rep * (L.tier===1 ? ... : 90)))`,
which has no idea a club can have been given a deliberately small ceiling by its
own board. `wB6_finance`'s `endSeason` wrapper guards custom clubs (`if(!c||c.custom)return`),
but that guard is downstream of this floor, not upstream of it. The budget rise
of £501,000 looks like `red-devil-manager.html:1904` but I have not confirmed
that number, only the wageCap one.

Repro: start a career, take the weakest National League club, set
`custom=true, budget=150000, wageCap=22000, rep=1850`, call `endSeason()`, read
the two numbers back.

### 2. ~~Promotion pays a flat £8,000,000, at every level~~ — FIXED in `b5de3b8`

`red-devil-manager.html:3395`, in the promotion `swap`:
`c.budget = Math.round(c.budget*2.4 + 8e6)`. `wB6_finance`'s `endSeason` wrapper
re-levels every club's budget from its wage bill afterwards, but only
`if(c.i!==G.my)` — so the AI clubs are corrected and the user's is not. A National
League club going up to League Two appears to bank £8M. **I did not run this** —
my probe did not actually trigger a promotion — so treat it as a code reading
until somebody sits a season out and watches it.

### 3. ~~Commercial income is too flat across the Premier League~~ — FIXED in cycle 13

Was: linear in reputation, so the top of the Premier League was right and
everything under it was three to five times too generous — a 2.5× top-to-bottom
spread against a real 14.3×. Now a power curve anchored on the division's
biggest club, measured at a median ratio of 0.99 and a spread of 14.2×. Top
flights only: applying it down the pyramid put the smallest League Two club into
a £205K annual loss, which a regression test caught.

### 4. A goal bonus cannot help you close a deal below the Championship

`red-devil-manager.html:11574`, inside `submitTerms`:
`Math.min(4, bonus/8e3*4)`. £8,000 is a Premier League number, so the £50 bonus a
National League contract now opens with contributes 0.025 of the four points it
is worth. I could not patch it without re-implementing the whole acceptance
score, which is your call not mine. The main acceptance path (meet the asking
wage) is unaffected, so it is a dead lever rather than a broken one.

### 5. ~~The morale drip is still Premier-League-shaped~~ — FIXED in cycle 12

`red-devil-manager.html:5180`: nothing until five matches, then −2.4 morale a week
for anyone below `role share − 0.22`. My derived roles largely defused it — a
16th-choice player is now a *rotation* player expecting 25%, so he does not drip
for sitting out August — but the trigger is still a fixed five matches and a
fixed constant. If you want it consistent with the unrest gate it should be the
same fraction of the season.

### 6. ~~Nobody outside your own country's top two tiers is ever suspended~~ — FIXED in cycle 12

`simFixture` (`red-devil-manager.html:17970`) sends anything that is not a cup tie
or `fullSimDiv` to `fastSim`, which produces no cards, so no bans. Tables and
results are unaffected; it just means discipline exists in your corner of the
world and nowhere else. Probably fine, possibly not once somebody manages abroad.

### 7. ~~Dead code worth deleting when you are next in that block~~ — FIXED in cycle 12

`ACTIONS.roleTalk` (`red-devil-manager.html:5187`) still resolves its player with
`my.players.find(x => x._pending)` — the *first* flagged player, not the one the
message was about. It can no longer be reached (I stopped that mail being raised
and the old ones are closed on load), but it should go rather than sit there
looking correct.
### 8. ~~`interestScore` saturates before I can correct it~~ — FIXED in cycle 12

`src/interactions.js` corrects the league-position term by subtracting what the
original added and adding what the division actually deserves. The original
clamps its result to 0–100 first, so on the rare score that has already
saturated at either end my correction is absorbed. It is a couple of points on a
hundred-point scale and only at the extremes, so I left it rather than
reimplement a function I do not own.

### 9. ~~The board's target still ignores who you actually are~~ — FIXED in cycle 15

Was: `expectPos()` ranked purely on reputation, which does not move when you
sell people — Manchester United sold three of its best and the target did not
shift a single place. Now half reputation and half the squad you can actually
put out, bounded to five places and asymmetric so it eases faster than it
tightens. **Correction to my own note:** I also claimed it ignored promotion. It
did not — a promoted club carries a low reputation into its new division and
lands on the floor, which is "stay up". That half of the finding was wrong for
two cycles.


---

## Blocked

Nothing. Everything I was asked for is in and measured.

---

## What I would like from you

- **Claude, one to watch for:** cycle 14 turned up the same failure mode as cycle
  8 — a layer that *replaces* a function instead of wrapping it, silently
  throwing away every wrapper beneath it. In cycle 8 it was `boardTarget` losing
  the `{exp, txt}` shape a mail still read, printing "target undefinedth" for
  months. In cycle 14 it was line **19401** assigning `genYouthPlayer =
  function(...)` outright and discarding the academy bonus at 3563, so the
  stadium screen has had a 1–5 academy rating that did nothing at all. Both were
  invisible: nothing throws, the feature just stops. If you are appending a layer
  that redefines an existing function, wrapping it costs one line and would have
  prevented both.
- **Claude and Codex, on the pyramid work:** `src/interactions.js` names no
  division and hardcodes no count — every number comes from `divMembers`,
  `PYRAMIDS`, `G.clSpots` and the same `n <= 12 ? (n-1)*3 : (n-1)*2` the fixture
  generator uses. Add a league, resize one, change who goes up or down, and the
  press room, the boardroom, the promises, the transfer market and the scout
  reports all follow with no edit from me. The one thing that would break it is a
  competition structure `PYRAMIDS` cannot express — play-offs, which this game
  does not currently have. If you add any, tell me and I will teach `divShape`
  about them rather than have you special-case it downstream.
- **Codex:** the seven small leagues (Scotland, Austria, Switzerland, Denmark,
  Serbia, Ukraine, Croatia, 10–12 clubs) play `(n-1) * 3`. If the bigger-leagues
  work moves any division across the 12-club boundary its season length changes
  shape with it. `divShape().matches` handles it; I am flagging it because it is
  invisible until a run-in question fires in December.
- **Claude, on feel — the one change here a player will notice.** The Finances
  screen has always shown a running-costs line and nothing ever debited it, about
  £165M a year at Manchester United. It is charged now, because a screen that
  lies about your costs is a defect rather than a difficulty setting — but it
  makes the user's club meaningfully poorer than it was. If it bites in play, the
  honest dial is the `runs` fraction in `DIV_FIN`, not removing the debit again.
- **Claude:** the only thing left on the open list is item 4 — a goal bonus
  cannot help close a deal below the Championship, because
  `Math.min(4, bonus/8e3*4)` is a Premier-League-sized divisor. That one needs
  the acceptance score rewriting, which is yours.
- **A note on my own reliability.** Item 9 said the board's target ignored
  promotion *and* squad churn. The churn half was real and is fixed; the
  promotion half was never true — a promoted club carries a low reputation into
  its new division and lands on the floor, which is "stay up". I had it written
  down as a defect for two cycles without checking. If something in this file
  reads like an assertion rather than a measurement, treat it as a hypothesis
  until one of us has run it.
- **Claude, on the economy's calibration:** it is soft on the user's explicit
  instruction — everybody profitable, nobody doomed. The four numbers to move are
  `runs`, `seat`, `grant` and the division `central` figures in `src/economy.js`,
  and every one has a measurement in the tests to catch what it does. The same
  caution applies to `divShape().floor`, `ACADEMY_STEP` and `COM_CURVE`: I
  measured all three rather than reasoning about them, because each is one number
  away from breaking something a test would not have caught on its own.
- **Codex:** the three duplicate-player problems from your cycle 3 (Jacquet,
  Onyeka, the nineteen shared ESPN IDs) are still open and still yours.
