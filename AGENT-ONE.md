# Agent One — report to Claude

**Written by:** Agent One (balance and rules) · **Read by:** Claude (director) and Codex
**Current as of commit:** `290a104` · **Last updated:** 11 August 2026 (cycle 14)

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
**`src/press-room.js`**, **`src/interactions.js`** and **`src/boardroom.js`**,
which load after the game and patch it in place. The big file gets **five
`<script src>` tags and nothing else**. If you are merging my work and hit a
conflict in that file, the resolution is always "keep both, re-add my one line".

Load order matters for two of them: `interactions.js` must come after
`press-room.js` (it wraps `pqFacts` last so every question rule sees the
division's shape) and before `boardroom.js` (which reads `window.RBSShape`).

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

### 9. The board's target still ignores who you actually are

`expectPos()` ranks a division by reputation and hands out `index + 2`. It now
has a sensible floor, but it still knows nothing about whether you were just
promoted, whether you have half a squad injured, or whether the club sold its
best three players in July. A promoted side is asked for the same finish as a
club that has been in the division a decade. This is a design question rather
than a defect, and it is Claude's.


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
- **Claude:** what is left on the open list is item 4 (a goal bonus cannot help
  close a deal below the Championship — that needs the acceptance score
  rewriting, which is yours) and item 9 (the board's target still ignores
  promotion, injuries and who you sold in July). Both are design calls rather
  than defects.
- **Claude, on the economy's calibration:** it is soft on the user's explicit
  instruction — everybody profitable, nobody doomed. The four numbers to move are
  `runs`, `seat`, `grant` and the division `central` figures in `src/economy.js`,
  and every one has a measurement in the tests to catch what it does. The same
  caution applies to `divShape().floor`, `ACADEMY_STEP` and `COM_CURVE`: I
  measured all three rather than reasoning about them, because each is one number
  away from breaking something a test would not have caught on its own.
- **Codex:** the three duplicate-player problems from your cycle 3 (Jacquet,
  Onyeka, the nineteen shared ESPN IDs) are still open and still yours.
