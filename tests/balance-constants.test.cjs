const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   THE BALANCE NUMBERS ARE WRITTEN DOWN, SO THEY CANNOT DRIFT
   ---------------------------------------------------------------------
   SPREAD gathers the numbers that decide how much of the gap between
   two squads survives into the result: the clamps on possession, on
   getting out of your own half and on turning possession into a sight
   of goal, the slopes under those sigmoids, the multipliers over them,
   how much of a finisher's advantage over a goalkeeper counts, how far
   squad averages are pulled towards the mean, what playing at home is
   worth in three places, what a side in front is worth defensively, and
   what a goal does to the next ten minutes.

   They were literals scattered through tickOnce and one patch layer.
   Gathering them was instrumentation and not a balance change, and this
   is what makes that claim checkable rather than a promise: every value
   here is the literal it replaced, read out of the running game.

   A failure here is not necessarily a bug. It means someone changed the
   balance of the game, which is a decision that has to be made
   deliberately and measured — scripts/measure-title-race.cjs plays
   seasons and scripts/sweep-balance.cjs measures fixtures. If the
   change is intended, the number here moves with it and the changelog
   says what it did to the league table. What must not happen is the
   value drifting while everyone assumes it did not.

   For the record, what the shipped numbers produce over thirty seeded
   seasons of the Premier League: a champion on 85.3 against a real
   87.6, second on 80.0 against 80.5, fourth on 71.8 against 70.1,
   mid-table 48.7, the bottom club 21.5 against 20.7, and eight
   different champions in thirty seasons.
   ===================================================================== */

const SHIPPED = {
  compress: 0.86,
  possLo: 0.40, possHi: 0.60,
  buildLo: 0.58, buildHi: 0.72,
  chanceLo: 0.41, chanceHi: 0.57,
  possK: 0.22, buildK: 3.4, chanceK: 3.2,
  buildMul: 1.22, chanceMul: 0.70,
  shotK: 0.42,
  homePoss: 1.05, homeBuild: 1.10, homeShot: 1.09,
  park: 1.05,
  momScore: 4, momConcede: 2.6,
  /* how hard a side is steered back towards thirteen shots a match.
     Named while chasing the draw rate: steering the shots steers the
     goals, so it was the first suspect. It was not the cause — per-side
     goals measured 1.08 and 1.09 of variance over mean, slightly ABOVE
     Poisson rather than below — and the value is untouched. */
  shotPull: 0.017,
  /* HOW MUCH OF THE GOAL-RATE TRIM FALLS ON THE WEAKER ATTACK. Zero
     trims every side alike, which is what shipped and what this pins.
     Above zero a mismatch moves apart while the division still lands on
     its goals-a-game target: measured at 0.10 it puts the champion on
     86.9 and second on 81.6 against real 87.6 and 80.5. It is off
     because the table already measured right, and because it moves the
     draw rate only 0.6 points, which is inside the noise. */
  trimTilt: 0,
};

test('the balance constants hold the values they shipped with',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());

    /* JSON rather than the object itself: anything crossing out of the
       JSDOM realm arrives as a foreign object, and comparing those
       directly has cost this repository an afternoon before */
    const got = JSON.parse(game.eval('JSON.stringify(SPREAD)'));

    Object.keys(SHIPPED).forEach((k) => {
      assert.equal(got[k], SHIPPED[k],
        k + ' is ' + got[k] + ', not the ' + SHIPPED[k] + ' it shipped with — '
        + 'if that is deliberate, measure what it does to the league table '
        + 'and move the number here too');
    });

    /* and nothing new has appeared unmeasured */
    assert.deepEqual(Object.keys(got).sort(), Object.keys(SHIPPED).sort(),
      'SPREAD has gained or lost a constant since this test was written');
  });
