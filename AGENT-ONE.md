# Agent One — report to Claude

**Written by:** Agent One (balance and rules) · **Read by:** Claude (director) and Codex
**Current as of commit:** `9acb075` · **Last updated:** 10 August 2026 (cycle 6)

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

Everything I write goes in **`src/gameplay-balance.js`** and **`src/economy.js`**,
which load after the game and patch it in place. The big file gets **two
`<script src>` tags and nothing else**. If you are merging my work and hit a conflict in that file, the
resolution is always "keep both, re-add my one line".

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
lint clean; tests 20; pass 20; fail 0; duration 106.9 s
```

Ten of those twenty were already here and still pass. Ten are mine.

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

### 3. Commercial income is too flat across the Premier League

The sponsorship-deals system is excellent at the very top — Arsenal £216M against
a real £218M — and too generous in the middle, because it is linear in reputation
and real commercial revenue is nothing like linear. Crystal Palace is modelled at
£133M against a real ~£40M. I left it alone: it errs towards the user having
money, which is the direction you asked for, and fixing it properly means
deciding what reputation is supposed to mean rather than adjusting a constant.

### 4. A goal bonus cannot help you close a deal below the Championship

`red-devil-manager.html:11574`, inside `submitTerms`:
`Math.min(4, bonus/8e3*4)`. £8,000 is a Premier League number, so the £50 bonus a
National League contract now opens with contributes 0.025 of the four points it
is worth. I could not patch it without re-implementing the whole acceptance
score, which is your call not mine. The main acceptance path (meet the asking
wage) is unaffected, so it is a dead lever rather than a broken one.

### 5. The morale drip is still Premier-League-shaped

`red-devil-manager.html:5180`: nothing until five matches, then −2.4 morale a week
for anyone below `role share − 0.22`. My derived roles largely defused it — a
16th-choice player is now a *rotation* player expecting 25%, so he does not drip
for sitting out August — but the trigger is still a fixed five matches and a
fixed constant. If you want it consistent with the unrest gate it should be the
same fraction of the season.

### 6. Nobody outside your own country's top two tiers is ever suspended

`simFixture` (`red-devil-manager.html:17970`) sends anything that is not a cup tie
or `fullSimDiv` to `fastSim`, which produces no cards, so no bans. Tables and
results are unaffected; it just means discipline exists in your corner of the
world and nowhere else. Probably fine, possibly not once somebody manages abroad.

### 7. Dead code worth deleting when you are next in that block

`ACTIONS.roleTalk` (`red-devil-manager.html:5187`) still resolves its player with
`my.players.find(x => x._pending)` — the *first* flagged player, not the one the
message was about. It can no longer be reached (I stopped that mail being raised
and the old ones are closed on load), but it should go rather than sit there
looking correct.

---

## Blocked

Nothing. Everything I was asked for is in and measured.

---

## What I would like from you

- **Claude:** items 1 and 2 are now fixed. What is left on that list is item 3
  (commercial income too flat across the Premier League), item 4 (a goal bonus
  cannot help close a deal below the Championship — that one needs the acceptance
  score rewriting, which is yours), item 5 (the morale drip still starts at a
  fixed five matches) and item 7 (dead code).
- **Claude:** one wart left that I chose not to touch before merging. The user's
  bank compounds — £922M after four seasons — because everything is profitable by
  design. It buys nothing the transfer budget does not already cap, so it harms
  nothing, but a club hoarding a billion pounds is not a club. If you want it
  handled, the honest mechanism is the board taking profit above a threshold for
  the stadium and the training ground, and that is a feel decision rather than a
  fix.
- **Claude, on feel:** the economy is calibrated soft on the user's explicit
  instruction — everybody profitable, nobody doomed. If you want it to bite
  harder, the four numbers to move are `runs`, `seat`, `grant` and the division
  `central` figures in `src/economy.js`, and every one of them is a one-line
  change with a measurement in the tests to catch what it does.
- **Claude:** items 1 and 2 of cycle one are yours — they are economy design decisions,
  not defects with an obvious right answer, and a created club's finances are the
  spine of that whole mode. Item 3 needs the acceptance score rewritten and I did
  not want to touch feel without asking.
- **Codex:** item 2 is a one-season sim away from being confirmed or dismissed,
  and you have the harness discipline for it. Item 5 is a judgement call about
  how much of the world needs to be real.
