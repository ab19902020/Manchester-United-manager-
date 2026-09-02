#!/usr/bin/env node
/* eslint-disable */
/* Which balance numbers produce a real league table?
 *
 *   node scripts/sweep-balance.cjs [repeats-per-fixture]
 *
 * measure-title-race.cjs answers "what does the table look like now".
 * This answers "what would it look like if". It rebuilds the seeded
 * world for each candidate setting of SPREAD — the clamps and the
 * compression that decide how much of the gap between two squads
 * survives into the result — measures what that setting does to
 * football, and prints the candidates side by side.
 *
 * It does not play seasons. Playing seasons is how the first two runs
 * of this script wasted an hour: three seasons a candidate carries
 * about five points of noise on a champion's total, the identical
 * shipped settings returned 84.7 and then 79.7, and every difference
 * worth arguing about is smaller than that. Seeding the match stream
 * fixes repeatability but not comparability — the moment a parameter
 * changes one gate, every later draw shifts and the two seasons are
 * independent again.
 *
 * So it measures the fixture rather than the season. Every one of the
 * 380 fixtures is played REPEATS times and its win/draw/loss
 * probabilities are counted; the table is then drawn three thousand
 * times from those probabilities in arithmetic, which costs nothing and
 * removes the noise instead of averaging over it. The last row of the
 * report is the control measured a second time, and the report says in
 * words whether it reproduced.
 *
 * The reference column is real English football. The champion's average
 * over the thirty Premier League seasons before 2025-26 is 87.6 and
 * second is 80.5 (Opta/premierleague.com); fourth has averaged about 70
 * over the last decade; the club that finishes bottom has averaged
 * about 21 over the last ten seasons — 17, 24, 31, 16, 21, 23, 22, 25,
 * 16, 12 — which is NOT the 24 an earlier version of the title-race rig
 * carried, and that wrong reference is why the bottom of this game's
 * table was once reported as too weak when it was already right.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const SEASONS = +(process.argv[2] || 3);
const DIV = process.argv[3] || 'PL';
const SEED = +(process.argv[4] || 20260821);

/* THE CANDIDATES. The first row is always the control — an empty `bal`
   leaves every shipped value alone — and every other row is one stated
   difference from it.

   NOTHING IS CARRIED FORWARD FROM THE FIRST TWO RUNS OF THIS SCRIPT.
   They played three seasons a candidate and read the champion off the
   end of them, which turned out to be a measurement of the weather:
   the identical shipped settings returned 84.7 and then 79.7. Whatever
   those runs appeared to show about ceilings, floors or compression
   was inside their own noise, so the candidates below are the same
   questions asked again of a rig that can answer them. */
/* A FACTORIAL, NOT A LIST OF HUNCHES.
   The scattergun sweeps found the shape of the problem — the clamps do
   nothing the goal-rate controller does not undo, and the slopes do
   something — but they could not rank their own candidates, because
   REPEATS matches per fixture leaves each fixture's probability with a
   standard error of about 0.5/sqrt(REPEATS). At four repeats that is
   0.25 a fixture, and a club's expected total sums 38 of them: roughly
   two points of noise per club, which is why "steeper shot" read
   better at .60 than at the harder .78. Drawing the table three
   thousand times does not help — every draw reuses the same estimated
   probabilities, so it removes the season's noise and not the
   measurement's.

   So: two changes, crossed, and enough repeats to tell them apart.
   `shotK` is how much of a finisher's advantage over a goalkeeper
   survives into the ball going in; `compress` is how much of the gap
   between two squads survives into the gates at all. If they add, the
   pair is worth more than either. */
/* WHAT THE DIAGNOSTIC SAID. Measured as a multiple of the division's
   average, the shipped game gives its best squad 1.27 goals for and
   0.87 against where real football gives a champion 1.70 and 0.62. Its
   worst squad is close to right going forward (0.64 against 0.62) and
   far too hard to score against (1.30 against 1.70). The game models
   being bad; it does not model being good. That is the missing six
   points, and it is why tuning the points directly went nowhere.

   Steepening the gates fixes most of the shape — 1.44 and 0.72 — but
   costs volume, because the good side's extra is capped by the ceiling
   while the poor side's loss is not: 2.5 goals a game against a target
   of 2.8, with the controller already at zero trim and no way to put a
   goal back. So the slope and the volume have to move together, which
   is what the gate multipliers are for. */
const STEEP = { buildK: 1.8, chanceK: 1.7, buildHi: .80, chanceHi: .65 };
const SPREAD_SET = [
  { name: 'shipped', bal: {} },
  { name: 'steep, ceilings only', bal: Object.assign({}, STEEP) },
  { name: 'steep + volume', bal: Object.assign({ chanceMul: .80, buildMul: 1.30 }, STEEP) },
  { name: 'steep + more volume', bal: Object.assign({ chanceMul: .90, buildMul: 1.38 }, STEEP) },
  { name: 'steep + volume + floors', bal: Object.assign({ chanceMul: .80, buildMul: 1.30, buildLo: .52, chanceLo: .36 }, STEEP) },
  /* THE RIG PROVING ITSELF. This is the control again, with nothing
     changed, and it must reproduce the control's row exactly. If it
     does not, something is carrying between candidates and no other
     row in the table means anything. */
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   THE DRAW RATE, AND THE ONE LEVER THAT IS NOT ABSORBED
   ---------------------------------------------------------------------
   Ten mechanisms were measured against the draw rate and none of them
   moved it, for one reason: the goal-rate controller. It holds the
   division at 2.80 goals a game by turning a share of goals into saves,
   so anything that simply creates more football is handed straight
   back. Worse, it hands it back UNIFORMLY -- every side trimmed alike
   -- which preserves the ratio between a good attack and a poor one and
   shrinks the DIFFERENCE. Two sides on 2.0 and 1.0 finish level far
   less often than the same two on 1.8 and 0.9, so trimming uniformly
   actively manufactures draws.

   `trimTilt` is the exception, and it is the only lever here that can
   be. It does not ask for more goals; it asks WHOSE goals the
   controller takes. A good attack against a poor defence keeps more of
   them, a poor attack against a good defence keeps fewer, and the
   division's total is untouched because the controller measures what
   was actually scored and re-solves either way. Dispersion moves, the
   mean does not, so there is nothing for the controller to absorb.

   It cannot see a league table, a date, a score or whose club it is --
   only how good the eleven on the pitch are against the eleven facing
   them, which is the direction the whole game is built to run in.

   The clamp is the thing to watch. The tilt is applied as
   `t + tilt*(strD - strA)/10` clamped to [0, .62], and that floor is
   one-sided: a strong attack can have its trim taken to zero and no
   further, while a weak one can always be trimmed harder. So the tilt
   removes goals it cannot give back, the controller answers by
   lowering the base trim for everyone, and the two only balance while
   the base has room to fall. If the base is already near zero the
   division goes under its target -- which is exactly what the goals a
   game column is here to catch.
   ===================================================================== */
const TILT_SET = [
  { name: 'shipped (tilt 0)', bal: {} },
  { name: 'tilt 0.15', bal: { trimTilt: .15 } },
  { name: 'tilt 0.30', bal: { trimTilt: .30 } },
  { name: 'tilt 0.50', bal: { trimTilt: .50 } },
  { name: 'tilt 0.80', bal: { trimTilt: .80 } },
  { name: 'tilt 1.20', bal: { trimTilt: 1.2 } },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   AND WHY THE TILT NEEDS THE CONTROLLER TO HAVE ROOM
   ---------------------------------------------------------------------
   The first tilt sweep answered the question and refused the answer.
   Measured over 380 fixtures x 6 on seed 20260821, every candidate came
   back with the controller's trim at 0.000:

     tilt   drawn    0-0     1-1    g/g   trim
     0      27.5%   6.6%   13.2%   2.69  0.000
     0.50   26.1%   7.2%   12.8%   2.49  0.000
     0.80   23.7%   7.9%   11.9%   2.39  0.000
     1.20   24.3%   8.6%   11.4%   2.35  0.000

   The draw rate goes exactly where it was wanted -- 23.7% against real
   football's 24% -- and the champion rises from 75.9 to 85.6 against a
   real 87.6. And it is bought by draining the game: 2.39 goals a match
   against a real 2.80.

   That is the clamp doing what the comment on it warned it would. The
   tilt is `t + tilt*(strD - strA)/10` clamped to [0, .62], and with `t`
   already at zero the floor bites on every fixture where the attack is
   the better side. A strong attack cannot be trimmed less than not at
   all, so the tilt only ever SUBTRACTS -- and the controller, which
   would normally answer by lowering the base trim for everyone, has
   nothing left to lower.

   So the tilt is not a lever on its own. It is a lever on a controller
   that has somewhere to go, and giving it somewhere to go means raising
   the raw goal supply until the trim sits meaningfully above zero.
   `buildMul` and `chanceMul` are the volume controls that exist for
   exactly this, and were added the last time a change to the slopes
   cost the division its goals. Raise the supply, let the controller
   take the surplus back to 2.80, and the tilt then decides WHOSE goals
   come off rather than only how many.
   ===================================================================== */
const TILT_VOL = [
  { name: 'shipped', bal: {} },
  { name: 'volume only', bal: { buildMul: 1.34, chanceMul: .88 } },
  { name: 'vol + tilt 0.50', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: .50 } },
  { name: 'vol + tilt 0.80', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: .80 } },
  { name: 'vol + tilt 1.20', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: 1.2 } },
  { name: 'more vol + tilt 0.80', bal: { buildMul: 1.42, chanceMul: 1.0, trimTilt: .80 } },
  { name: 'more vol + tilt 1.20', bal: { buildMul: 1.42, chanceMul: 1.0, trimTilt: 1.2 } },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   HOW MUCH ROOM THE CONTROLLER NEEDS, AND WHAT BUYING IT COSTS
   ---------------------------------------------------------------------
   Both sweeps above end at the same wall: trim 0.000. The goal-rate
   controller is not holding this division at 2.80 -- it is pinned
   against its own floor while the division scores 2.69, which means it
   has no authority at all. Everything it is supposed to be able to do,
   including carrying a tilt, it currently cannot.

   So this ladder asks one question: how much raw football does the
   division need before the controller is actually controlling, and what
   does buying that do to the rest of the match? The trim column is the
   answer to the first. The shots columns are the answer to the second,
   and they are the reason this is a ladder rather than a single guess:
   the shot counts were calibrated hard and separately -- 25.5 a match
   and 8.7 on target, down from 27.5 and 17.2 -- and a volume change
   large enough to give the controller room could undo that quietly.
   ===================================================================== */
const VOLUME_SET = [
  { name: 'shipped', bal: {} },
  { name: 'vol 1.34/0.88', bal: { buildMul: 1.34, chanceMul: .88 } },
  { name: 'vol 1.40/1.00', bal: { buildMul: 1.40, chanceMul: 1.0 } },
  { name: 'vol 1.46/1.12', bal: { buildMul: 1.46, chanceMul: 1.12 } },
  { name: 'vol 1.52/1.26', bal: { buildMul: 1.52, chanceMul: 1.26 } },
  { name: 'vol 1.60/1.42', bal: { buildMul: 1.60, chanceMul: 1.42 } },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   THE LADDER'S ANSWER, AND WHAT IT RULES OUT
   ---------------------------------------------------------------------
   The volume ladder gives the controller its room and shows the price
   on the same line:

     candidate        drawn    g/g   trim  shots  on tgt
     real football    24.0%   2.80      —   25.5     8.7
     shipped          27.5%   2.69  0.000   27.9     9.3
     vol 1.46/1.12    24.7%   2.86  0.089   32.0    10.7
     vol 1.52/1.26    24.3%   2.90  0.125   33.0    10.9
     vol 1.60/1.42    24.9%   2.81  0.167   34.5    11.3

   Volume alone fixes the draw rate. It also takes the division from
   27.9 shots a match to 33, against a real 25.5 -- so it buys a right
   number with a wrong one, and a match report full of thirty-three
   shots is a more visible lie than a draw rate four points high.
   Shipping any of those rows is out.

   Which leaves the pairing. `chanceMul` is what turns possession into a
   sight of goal, so it is the multiplier that puts shots on the board;
   `buildMul` is getting out of your own half, which should buy better
   chances rather than more of them. If that distinction is real, a
   build-heavy volume raises goals with less damage to the shot count
   than a chance-heavy one -- and if it is not real, this says so.
   ===================================================================== */
const TILT_FINAL = [
  { name: 'shipped', bal: {} },
  { name: 'vol 1.34/.88 + tilt .50', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: .50 } },
  { name: 'vol 1.34/.88 + tilt .80', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: .80 } },
  { name: 'build 1.50 + tilt .50', bal: { buildMul: 1.50, trimTilt: .50 } },
  { name: 'build 1.50 + tilt .80', bal: { buildMul: 1.50, trimTilt: .80 } },
  { name: 'build 1.65 + tilt .80', bal: { buildMul: 1.65, trimTilt: .80 } },
  { name: 'build 1.65 + tilt 1.2', bal: { buildMul: 1.65, trimTilt: 1.2 } },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   AND THE BUILD/CHANCE DISTINCTION IS NOT REAL
   ---------------------------------------------------------------------
   The set above was built on the idea that `buildMul` buys better
   chances while `chanceMul` buys more of them, so a build-heavy volume
   should cost fewer shots. Measured, it does not:

     build 1.50 + tilt .50     29.2 shots   2.62 g/g   24.1% drawn
     vol 1.34/.88 + tilt .50   29.5 shots   2.66 g/g   24.7% drawn

   Three tenths of a shot apart, which is inside the noise. Getting out
   of your own half more often ends in a shot about as reliably as
   creating more openings does, so there is no cheap territory to buy.
   The hypothesis is recorded here because the next person to have it
   should not pay for the sweep again.

   So the last question is only how far up the volume/tilt line to go.
   The tilt costs goals -- it subtracts and cannot give back while the
   trim is pinned -- and volume pays for them in shots. The exchange
   rate, from the runs above: tilt .50 on top of vol 1.34/.88 costs 0.17
   goals a game and buys 5.5 points on the champion, a point of draw
   rate, and a move from 1.35/0.77 to 1.50/0.67 on the thing that
   actually matters, which is whether being good shows up in results.
   ===================================================================== */
const TUNE_SET = [
  { name: 'shipped', bal: {} },
  { name: 'vol 1.34/.88 only', bal: { buildMul: 1.34, chanceMul: .88 } },
  { name: 'vol 1.34/.88 + tilt .35', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: .35 } },
  { name: 'vol 1.40/.95 + tilt .50', bal: { buildMul: 1.40, chanceMul: .95, trimTilt: .50 } },
  { name: 'vol 1.46/1.02 + tilt .50', bal: { buildMul: 1.46, chanceMul: 1.02, trimTilt: .50 } },
  { name: 'vol 1.40/.95 + tilt .65', bal: { buildMul: 1.40, chanceMul: .95, trimTilt: .65 } },
  { name: 'vol 1.34/.88 + tilt .50', bal: { buildMul: 1.34, chanceMul: .88, trimTilt: .50 } },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   PAYING THE SHOTS BACK
   ---------------------------------------------------------------------
   Every setting that fixes the draw rate lands the division between
   29.5 and 31 shots a match against a real 25.5, where the shipped game
   is 27.9. The volume has to be there -- the tilt subtracts goals and
   cannot give them back while the trim is pinned, so without the volume
   the division falls to 2.5 -- but nothing says the volume has to be
   paid for in shots.

   `shotPull` is the dial that steers a side back towards thirteen shots
   a match, and it is independent of everything above: it does not know
   who is playing, it does not touch the trim, and it acts on the shot
   count rather than on the goals. If it can take 30.6 back towards 27
   while the draw rate and the goals a game stay where the volume and
   the tilt put them, then the shot cost was never a real cost -- it was
   just a dial nobody turned.
   ===================================================================== */
const WIN = { buildMul: 1.40, chanceMul: .95, trimTilt: .50 };
const PULL_SET = [
  { name: 'shipped', bal: {} },
  { name: 'winner (pull .017)', bal: Object.assign({}, WIN) },
  { name: 'winner + pull .030', bal: Object.assign({ shotPull: .030 }, WIN) },
  { name: 'winner + pull .045', bal: Object.assign({ shotPull: .045 }, WIN) },
  { name: 'winner + pull .060', bal: Object.assign({ shotPull: .060 }, WIN) },
  { name: 'winner + pull .085', bal: Object.assign({ shotPull: .085 }, WIN) },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   AND shotPull DOES NOT PULL
   ---------------------------------------------------------------------
   Swept over a five-fold range on top of the same settings, the shot
   count does not move:

     pull .017   30.6 shots      pull .060   30.6 shots
     pull .030   30.4 shots      pull .085   30.4 shots
     pull .045   30.6 shots

   Whatever `shotPull` is steering, it is not the number of shots in a
   match, so the volume's shot cost cannot be paid back with it. That is
   a fault of its own and it is written down rather than fixed here,
   because fixing it changes what a match looks like and belongs in its
   own measured change rather than smuggled into this one.

   The same sweep is also the honest measure of this rig's precision.
   Five settings that demonstrably change nothing about the shots
   returned draw rates of 23.4, 25.5, 26.2, 24.1 and 25.9 -- a spread of
   2.8 points with nothing real behind it. So six repeats can see the
   DIRECTION of a change of this size and not its landing point, and no
   claim below is made to a tenth of a point.
   ===================================================================== */
/* THE CANDIDATE THAT SHIPPED, and why this one out of the six the
   landing sweep offered. Their draw rates -- 23.0, 24.4, 24.3, 25.2,
   23.8, 22.4 -- are all a long way better than the shipped 27.5 and all
   within the rig's own noise of each other and of real football's 24,
   so the draw rate could not choose between them. The rest of the shape
   could. Summed absolute error against real football across the six
   table columns: shipped 29.8, this candidate 15.8, and the only one
   that beat it (14.4) did so while dropping the division to 2.64 goals
   a game. This one holds 2.78 and puts the bottom club on 20.1 against
   a real 20.7. It is also the smallest tilt of the six, which is the
   right tie-breaker for a change to how every match in the game is
   decided. */
const SHIP_SET = [
  { name: 'before', bal: { trimTilt: 0 }, xg: .13 },
  { name: 'after', bal: {} },
  { name: 'before (repeat)', bal: { trimTilt: 0 }, xg: .13 },
];

/* =====================================================================
   BUYING THE GOALS IN CONVERSION INSTEAD OF IN SHOTS
   ---------------------------------------------------------------------
   The proposal above works and costs 2.8 shots a match. That cost is
   not intrinsic to the fix -- it is intrinsic to paying for the fix
   with VOLUME. The tilt drains goals, the goals have to come back, and
   raising the gates is only one way to bring them.

   The other is conversion. `shotXg` turns the attack-to-keeper ratio
   into the probability a shot goes in, at 0.13 times the ratio. Raising
   that scale produces more goals from the SAME number of shots, which
   is exactly the shape of what is needed -- and it does something the
   volume route cannot: it lifts raw scoring above the target, so the
   goal-rate controller comes off its floor and has authority again.
   With a trim above zero the tilt is no longer one-sided, because a
   strong attack can be trimmed LESS than the base rather than merely
   not at all.

   If that works, the shot count never moves and the trim column stops
   reading 0.000, which would make it the better fix on both counts.
   ===================================================================== */
const XG_SET = [
  { name: 'shipped', bal: {} },
  { name: 'xg .150 + tilt .50', bal: { trimTilt: .50 }, xg: .150 },
  { name: 'xg .165 + tilt .50', bal: { trimTilt: .50 }, xg: .165 },
  { name: 'xg .165 + tilt .80', bal: { trimTilt: .80 }, xg: .165 },
  { name: 'xg .180 + tilt .80', bal: { trimTilt: .80 }, xg: .180 },
  { name: 'xg .180 + tilt 1.2', bal: { trimTilt: 1.2 }, xg: .180 },
  { name: 'proposed (volume)', bal: Object.assign({}, WIN) },
  { name: 'shipped (repeat)', bal: {} },
];

/* =====================================================================
   AND IT DOES WORK, SO THE VOLUME ROUTE IS DROPPED
   ---------------------------------------------------------------------
     candidate            drawn    0-0    g/g   trim  shots
     real football        24.0%   8.0%   2.80      —   25.5
     shipped              27.5%   6.6%   2.69  0.000   27.9
     xg .150 + tilt .50   22.4%   4.4%   2.84  0.035   27.8
     proposed (volume)    23.4%   5.7%   2.75  0.000   30.6

   Conversion buys the goals for nothing: the shot count does not move
   (27.8 against a shipped 27.9, where the volume route cost 2.7 a
   match) and the trim comes off its floor, which is the controller
   getting its authority back after being pinned at zero.

   What is left is that tilt .50 now overshoots -- 22.4% drawn against a
   real 24%, and 4.4% goalless against a real 8% -- because conversion
   and tilt both push the same way. The last sweep is for the landing
   point, and it is looking for the whole shape rather than the draw
   rate alone: a division can hit 24% drawn with the wrong number of
   goalless games and the wrong bottom of the table, and two of these
   candidates do.
   ===================================================================== */
const LAND_SET = [
  { name: 'shipped', bal: {} },
  { name: 'xg .145 + tilt .25', bal: { trimTilt: .25 }, xg: .145 },
  { name: 'xg .145 + tilt .35', bal: { trimTilt: .35 }, xg: .145 },
  { name: 'xg .150 + tilt .30', bal: { trimTilt: .30 }, xg: .150 },
  { name: 'xg .150 + tilt .40', bal: { trimTilt: .40 }, xg: .150 },
  { name: 'xg .155 + tilt .35', bal: { trimTilt: .35 }, xg: .155 },
  { name: 'xg .150 + tilt .50', bal: { trimTilt: .50 }, xg: .150 },
  { name: 'shipped (repeat)', bal: {} },
];

const SETS = { spread: SPREAD_SET, tilt: TILT_SET, tiltvol: TILT_VOL,
  volume: VOLUME_SET, final: TILT_FINAL, tune: TUNE_SET, pull: PULL_SET,
  ship: SHIP_SET, xg: XG_SET, land: LAND_SET };
const SET_NAME = process.argv[5] || 'spread';
const CANDIDATES = SETS[SET_NAME] || SPREAD_SET;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (/^\[sweep\]/.test(m.text())) console.log(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ seasons, div, seed, cands }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    window.RBSWorldSeed.build(seed, 'MUN');
    clear();

    const mem = G.clubs.filter((c) => c.league === div).map((c) => c.i);
    const freshen = () => mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
      p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0; p.morale = 70;
      if (p.stats) { p.stats.goals = 0; p.stats.assists = 0; p.stats.apps = 0; }
      if (p.form) p.form.length = 0;
    }));

    const STR = {};
    const strength = (ci) => {
      if (STR[ci] != null) return STR[ci];
      const c = G.clubs[ci];
      const shape = FORMATIONS[c.tacs.formation] || FORMATIONS['4-3-3'];
      const ids = autoPick(ci, c.tacs.formation) || [];
      let sum = 0, n = 0;
      shape.forEach(([slot], ix) => {
        const p = ids[ix] ? playerById(ids[ix]) : null;
        if (!p) return;
        sum += calcEff(p, slot); n += 1;
      });
      STR[ci] = n ? sum / n : 0;
      return STR[ci];
    };
    freshen();
    const byStrength = mem.slice().sort((x, y) => strength(y) - strength(x));

    /* the fixture list is built once and every candidate plays it */
    const rounds = rrPairs(mem);

    const shippedBal = Object.assign({}, SPREAD);
    const shippedModel = window.RBSMatchModel;
    const shippedDay = { lo: DAY_LO, range: DAY_RANGE };

    /* EVERY CANDIDATE PLAYS THE SAME SEASON, NOT JUST THE SAME FIXTURES.
       The world is seeded but the match engine is not: MatchSim calls
       Math.random for the possession contest, every gate, every shot
       and every save. Three seasons of that is about five points of
       noise on a champion's total, which is larger than any difference
       worth tuning — the first two sweeps ran the identical shipped
       code twice and got 84.7 and 79.7, and a reader comparing rows
       across those two runs would have concluded almost anything.

       So the whole match stream is seeded here, and season s uses the
       same seed for every candidate. Each candidate then plays the
       literal same season — same coin flips, same injuries, same
       weather — and a difference in the table is the parameter and
       nothing else. Paired like this, three seasons say more than
       thirty unpaired ones. */
    const mul = window.RBSWorldSeed.mulberry32;
    const trueRandom = Math.random;

    /* =================================================================
       WHY THIS DOES NOT PLAY SEASONS ANY MORE
       -----------------------------------------------------------------
       Seeding the match stream made a run repeatable, which it badly
       needed to be. What it could not do is make two DIFFERENT settings
       comparable. The moment one parameter changes a single gate, that
       draw is consumed differently, every draw after it shifts, and the
       two seasons are independent again. The pairing only survives
       while the candidates behave identically, which is exactly when
       there is nothing to measure. Three seasons of the shipped
       settings came out 85, 83 and 79 — six points of spread with
       nothing changed at all — so no three-season comparison can see a
       difference smaller than about five points, and the differences
       worth arguing about are smaller than that.

       So measure the thing that is actually being changed. A league
       table is not a fact about football, it is arithmetic on 380
       results, and each of those results is a draw from one fixture's
       win/draw/loss probabilities. Those probabilities are what the
       parameters move, and they can be measured as precisely as you are
       willing to pay for: play every fixture REPS times and count.

       Then the table follows without any further football. Draw three
       thousand seasons from those probabilities in arithmetic — which
       costs nothing — and read off what first, fourth and last average.
       That average is the same quantity a played season estimates, with
       the noise of a played season removed rather than averaged over.

       What this deliberately leaves out is everything a season does to
       a squad across its length: fatigue, injuries, suspensions, a run
       of form. Those matter and they are not free — so the setting this
       chooses is checked afterwards against real played seasons in
       measure-title-race.cjs before it goes anywhere near the game.
       ================================================================= */
    const one = (hi, ai, ri) => {
      /* every repeat starts from the same rested squads, so what is
         being measured is the fixture and not the fixture plus whatever
         the previous repeat did to the players */
      freshen();
      const fix = { h: hi, a: ai, div, sc: [], hs: 0, as: 0, r: 0,
        day: 40 + (ri * 7) % 260, played: false };
      buildContext(fix);
      /* keep the match object: its per-side stats are where the shot
         counts live, and they are the collateral damage to watch */
      fix._m = quickSim(fix);
      return fix;
    };

    const playFixtures = (streamSeed, reps) => {
      Math.random = mul(streamSeed >>> 0);
      /* LET THE CONTROLLER SETTLE, THEN HOLD IT STILL. The goal-rate
         controller re-solves its trim every 120 league matches, so a
         measurement of six thousand matches is fifty re-solves long and
         the fixtures played early are not judged by the same standard
         as the ones played late. Worse, how far it has drifted depends
         on how many repeats were asked for, which made the four-repeat
         and sixteen-repeat runs answer different questions.

         So: a warm-up long enough for it to converge on this candidate's
         football, and then its counter is pushed far enough below the
         window that it cannot re-solve again while the measurement
         runs. What gets measured is the steady state, which is the only
         state a season is ever actually played in. */
      for (let k = 0; k < 700; k += 1) {
        const r = rounds[k % rounds.length];
        const f = r[k % r.length];
        one(f[0], f[1], k % rounds.length);
      }
      goalCal(div).n = -1e9;

      const pr = [];   // per ordered fixture: win/draw/loss and goals
      let goals = 0, played = 0;
      /* THE SHAPE OF THE DRAWS, not just how many. Goals a game can be
         exactly right while the results are wrong, and it is: the
         division lands on 2.80 and still draws too often. Which
         scoreline carries the surplus says which fault it is — a
         surplus of 0-0 is a division that cannot create, a surplus of
         1-1 is two sides too close together — and those want opposite
         fixes, so it is worth counting them apart. Real English
         football: 24% drawn, about 8% goalless, about 9% one-all. */
      let drawn = 0, goalless = 0, oneAll = 0;
      /* AND WHAT IT COSTS THE REST OF THE FOOTBALL. Raising the gates
         is the only way to give the goal-rate controller room, but the
         shot counts were calibrated separately and hard -- 25.5 shots
         and 8.7 on target a match, against a game that once produced
         27.5 and 17.2 -- and a volume change big enough to matter here
         could quietly undo that. A sweep that cannot see the damage it
         is doing is not a measurement. */
      let shots = 0, onTarget = 0;
      const gf = {}, ga = {};
      mem.forEach((i) => { gf[i] = 0; ga[i] = 0; });
      rounds.forEach((round, ri) => {
        round.forEach(([hi, ai]) => {
          let w = 0, d = 0, l = 0;
          for (let k = 0; k < reps; k += 1) {
            const fix = one(hi, ai, ri);
            goals += fix.hs + fix.as; played += 1;
            try {
              const st = fix._m && fix._m.sides;
              if (st) { shots += st[0].st.sh + st[1].st.sh;
                onTarget += st[0].st.sot + st[1].st.sot; }
            } catch (e) {}
            gf[hi] += fix.hs; ga[hi] += fix.as;
            gf[ai] += fix.as; ga[ai] += fix.hs;
            if (fix.hs > fix.as) w += 1; else if (fix.hs === fix.as) d += 1; else l += 1;
            if (fix.hs === fix.as) {
              drawn += 1;
              if (fix.hs === 0) goalless += 1;
              else if (fix.hs === 1) oneAll += 1;
            }
          }
          pr.push({ h: hi, a: ai, w: w / reps, d: d / reps, l: l / reps });
        });
      });
      /* WHAT A LEAGUE TABLE IS MADE OF. Points are downstream of goal
         difference, and goal difference is where real football gives
         unambiguous targets: over the last decade a Premier League
         champion has scored about 1.7 times the division's average and
         conceded about 0.6 times it, and the club finishing bottom has
         been the mirror of that. If the game's best squad is nearer the
         average than that, no amount of tuning the points will help,
         because the matches themselves are too close. */
      const per = (i) => ({ gf: gf[i] / (38 * reps), ga: ga[i] / (38 * reps) });
      const avg = goals / played / 2;
      const top = per(byStrength[0]), bot = per(byStrength[byStrength.length - 1]);
      return { pr, gpg: goals / played,
        drawRate: drawn / played,
        shots: shots / played, onTarget: onTarget / played,
        goallessRate: goalless / played,
        oneAllRate: oneAll / played,
        topGf: top.gf / avg, topGa: top.ga / avg,
        botGf: bot.gf / avg, botGa: bot.ga / avg };
    };

    /* the table those probabilities imply, drawn many times over */
    const tableFrom = (pr, draws, tableSeed) => {
      const rnd = mul(tableSeed >>> 0);
      const n = mem.length;
      const slot = {};
      mem.forEach((i, ix) => { slot[i] = ix; });
      const sumAt = new Float64Array(n);
      const champRank = [];
      let rhoSum = 0;
      let cw = 0, cd = 0, cl = 0;
      for (let s = 0; s < draws; s += 1) {
        const pts = new Float64Array(n);
        const W = new Int32Array(n), D = new Int32Array(n), L = new Int32Array(n);
        for (let f = 0; f < pr.length; f += 1) {
          const r = rnd(), x = pr[f];
          if (r < x.w) { pts[slot[x.h]] += 3; W[slot[x.h]] += 1; L[slot[x.a]] += 1; }
          else if (r < x.w + x.d) {
            pts[slot[x.h]] += 1; pts[slot[x.a]] += 1;
            D[slot[x.h]] += 1; D[slot[x.a]] += 1;
          } else { pts[slot[x.a]] += 3; W[slot[x.a]] += 1; L[slot[x.h]] += 1; }
        }
        const order = mem.slice().sort((p, q) => pts[slot[q]] - pts[slot[p]]);
        order.forEach((ci, ix) => { sumAt[ix] += pts[slot[ci]]; });
        const top = slot[order[0]];
        cw += W[top]; cd += D[top]; cl += L[top];
        champRank.push(byStrength.indexOf(order[0]) + 1);
        let off = 0;
        order.forEach((ci, ix) => { off += Math.abs(ix - byStrength.indexOf(ci)); });
        rhoSum += off / n;
      }
      return { at: (k) => sumAt[k] / draws,
        W: cw / draws, D: cd / draws, L: cl / draws,
        rank: champRank.reduce((t, v) => t + v, 0) / champRank.length,
        rho: rhoSum / draws };
    };

    const results = [];
    cands.forEach((cand) => {
      /* A CLEAN WORLD FOR EVERY CANDIDATE. Seeding the match stream was
         not enough and the self-check below said so: the control and
         its repeat still played different seasons. Freshening the
         squads does not undo everything a season leaves behind, and the
         one that matters is G.gcal — the goal-rate controller, which
         re-solves its trim every 120 league matches and therefore ends
         each candidate holding a number shaped by that candidate's
         scoring. The next candidate then started from it. Rebuilding
         the world from the same seed puts every candidate back on the
         same squads, the same fixtures and the same untouched trim. */
      Math.random = trueRandom;
      window.RBSWorldSeed.build(seed, 'MUN');
      clear();
      Object.assign(SPREAD, shippedBal, cand.bal || {});
      /* THE OTHER WAY TO BUY GOALS. Volume buys them in shots; this
         buys them in conversion, which is the one thing the shot count
         does not notice. The engine reads RBSMatchModel off the global
         on every shot, so swapping the object swaps the curve. */
      if (cand.xg) {
        window.RBSMatchModel = Object.assign({}, shippedModel, {
          shotXg: (r) => Math.max(0.02, Math.min(0.75,
            cand.xg * (Number.isFinite(r) ? r : 1))),
        });
      } else window.RBSMatchModel = shippedModel;
      DAY_LO = (cand.day && cand.day.lo != null) ? cand.day.lo : shippedDay.lo;
      DAY_RANGE = (cand.day && cand.day.range != null) ? cand.day.range : shippedDay.range;
      const m = playFixtures(seed, seasons);
      const { pr, gpg } = m;
      const t = tableFrom(pr, 3000, seed ^ 0x2c9f);
      results.push({
        name: cand.name,
        first: t.at(0), second: t.at(1), fourth: t.at(3),
        mid: t.at(Math.floor(mem.length / 2)),
        seventeenth: t.at(mem.length - 4), last: t.at(mem.length - 1),
        gpg, W: t.W, D: t.D, L: t.L, rank: t.rank, rho: t.rho,
        drawRate: m.drawRate, goallessRate: m.goallessRate, oneAllRate: m.oneAllRate,
        shots: m.shots, onTarget: m.onTarget,
        topGf: m.topGf, topGa: m.topGa, botGf: m.botGf, botGa: m.botGa,
        /* WHY GOALS A GAME BARELY MOVES BETWEEN CANDIDATES. It is held
           there on purpose: the goal-rate controller turns a share of
           goals into saves to hit 2.80. That share is reported here,
           because a controller sitting at zero is a controller out of
           room — it can take goals away and has no way to put one back,
           so a candidate that drives raw scoring under the target
           simply stays under it. */
        trim: goalCal(div).trim,
      });
      console.log('[sweep] ' + cand.name + ' done');
    });
    /* leave the page as we found it */
    Object.assign(SPREAD, shippedBal);
    window.RBSMatchModel = shippedModel;
    DAY_LO = shippedDay.lo; DAY_RANGE = shippedDay.range;
    Math.random = trueRandom;
    return { results, clubs: mem.length };
  }, { seasons: SEASONS, div: DIV, seed: SEED, cands: CANDIDATES });

  const REAL = { first: 87.6, second: 80.5, fourth: 70.1, mid: 49, seventeenth: 37.8, last: 20.7, gpg: 2.8 };
  const cols = ['first', 'second', 'fourth', 'mid', 'seventeenth', 'last', 'gpg'];
  const head = ['1st', '2nd', '4th', 'mid', '17th', '20th', 'g/g'];
  console.log('\n' + DIV + ', ' + out.clubs + ' clubs, world seed ' + SEED
    + '\n  every fixture played ' + SEASONS + ' times, the table drawn 3000 times'
    + ' from what those matches measured\n');
  console.log('  ' + 'candidate'.padEnd(24) + head.map((h) => h.padStart(7)).join('')
    + '   champion     best  table');
  console.log('  ' + 'real football'.padEnd(24)
    + cols.map((c) => REAL[c].toFixed(1).padStart(7)).join('')
    + '   27W 6D 5L      #2    ~3');
  out.results.forEach((r) => {
    console.log('  ' + r.name.padEnd(24)
      + cols.map((c) => r[c].toFixed(1).padStart(7)).join('')
      + '   ' + (r.W.toFixed(0) + 'W ' + r.D.toFixed(0) + 'D ' + r.L.toFixed(0) + 'L').padEnd(11)
      + ('#' + r.rank.toFixed(1)).padStart(6) + r.rho.toFixed(1).padStart(6)
      + '  trim ' + r.trim.toFixed(3));
  });

  /* THE MEASUREMENT THAT SAYS WHY. Points are downstream of goal
     difference, and this is the one place real football gives a target
     that is not an average of averages. */
  console.log('\n  scoring and conceding, as a multiple of the division\'s average');
  console.log('  ' + 'candidate'.padEnd(24)
    + 'best squad GF'.padStart(15) + 'GA'.padStart(7)
    + 'worst squad GF'.padStart(17) + 'GA'.padStart(7));
  console.log('  ' + 'real football'.padEnd(24)
    + '1.70'.padStart(15) + '0.62'.padStart(7)
    + '0.62'.padStart(17) + '1.70'.padStart(7));
  out.results.forEach((r) => {
    console.log('  ' + r.name.padEnd(24)
      + r.topGf.toFixed(2).padStart(15) + r.topGa.toFixed(2).padStart(7)
      + r.botGf.toFixed(2).padStart(17) + r.botGa.toFixed(2).padStart(7));
  });
  /* THE RESULTS THEMSELVES, which is what the draw rate is about. Goals
     a game can be exactly right while these are wrong, and on the
     shipped settings they are. */
  console.log('\n  how the matches finish');
  console.log('  ' + 'candidate'.padEnd(24)
    + 'drawn'.padStart(8) + '0-0'.padStart(8) + '1-1'.padStart(8)
    + 'g/g'.padStart(8) + 'trim'.padStart(8)
    + 'shots'.padStart(8) + 'on tgt'.padStart(8));
  console.log('  ' + 'real football'.padEnd(24)
    + '24.0%'.padStart(8) + '8.0%'.padStart(8) + '9.0%'.padStart(8)
    + '2.80'.padStart(8) + '—'.padStart(8)
    + '25.5'.padStart(8) + '8.7'.padStart(8));
  out.results.forEach((r) => {
    console.log('  ' + r.name.padEnd(24)
      + (r.drawRate * 100).toFixed(1).padStart(7) + '%'
      + (r.goallessRate * 100).toFixed(1).padStart(7) + '%'
      + (r.oneAllRate * 100).toFixed(1).padStart(7) + '%'
      + r.gpg.toFixed(2).padStart(8) + r.trim.toFixed(3).padStart(8)
      + r.shots.toFixed(1).padStart(8) + r.onTarget.toFixed(1).padStart(8));
  });

  /* the rig proving itself: the control and its repeat must agree */
  const a = out.results[0], z = out.results[out.results.length - 1];
  if (a && z && /repeat/.test(z.name)) {
    const same = Math.abs(a.first - z.first) < 1e-9 && Math.abs(a.last - z.last) < 1e-9;
    console.log('\n  repeatable: ' + (same
      ? 'yes — the control and its repeat measured the same football'
      : 'NO. ' + a.first.toFixed(2) + '/' + a.last.toFixed(2) + ' against '
        + z.first.toFixed(2) + '/' + z.last.toFixed(2)
        + ' — something carries between candidates and no row above is a comparison'));
  }
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
