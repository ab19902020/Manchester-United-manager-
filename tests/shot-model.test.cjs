const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/simulation-model.js');

/* =====================================================================
   WHAT A SHOT DOES, IN THE TWO NUMBERS THAT DECIDE IT
   ---------------------------------------------------------------------
   `shotXg` decides whether it goes in. `onTargetChance` decides what
   happens to the ones that do not: a save, or a miss. They are separate
   rolls in that order, so the second one CANNOT move a result — which is
   exactly why it went unexamined for so long while being wrong by a
   factor of two.

   Measured on the shipped build, 400 matches of mid-table against
   mid-table off a seeded stream, with the goal-rate controller pinned:

       shots a match          27.5    real about 25.5
       shots on target        17.2    real about 8.7
       saves                  14.0    real about 5.9
       corners                13.4    real about 10.3

   Shots on target were nearly double, and half the corner surplus was a
   consequence of it: 52% of saves go behind for a corner, so 14 saves a
   match were manufacturing 6.5 corners. The old model put 56% of
   non-goal efforts on target where real football puts about 26%.

   This test pins the replacement. It is a pure function, so it is
   checked directly rather than through a match: the band it must stay
   in, and the ordering that makes it a football model rather than a
   constant — a better shot against a worse keeper finds the target more
   often.

   THESE NUMBERS ARE ALLOWED TO MOVE, but not quietly. A failure here
   means someone changed how often a shot is on target, which is a
   deliberate decision that has to be measured with
   scripts/measure-corners.cjs and written down.
   ===================================================================== */

test('a shot that is not a goal is on target about a quarter of the time', () => {
  /* the ratio is the shooter's quality over the keeper's, so 1 is an
     even contest and that is where most shots sit */
  const even = model.onTargetChance(1);
  assert.ok(even > 0.22 && even < 0.32,
    'an even shot is on target ' + (even * 100).toFixed(0)
    + '% of the time, which is not the ~26% real football manages');
});

test('a better shot finds the target more often than a worse one', () => {
  const poor = model.onTargetChance(0.4);
  const even = model.onTargetChance(1);
  const good = model.onTargetChance(2);
  assert.ok(poor < even && even < good,
    'the ordering is ' + poor.toFixed(3) + ' / ' + even.toFixed(3)
    + ' / ' + good.toFixed(3));
  /* and the gap is worth having: a flat function would pass the
     ordering check on rounding alone */
  assert.ok(good - poor > 0.12,
    'shot quality is worth only ' + ((good - poor) * 100).toFixed(1)
    + ' points of accuracy, which is not enough to be a model');
});

test('the band holds however extreme the mismatch', () => {
  const values = [-5, 0, 0.1, 1, 3, 12, 1e6, NaN, undefined, 'x']
    .map((r) => model.onTargetChance(r));
  values.forEach((v, i) => {
    assert.ok(Number.isFinite(v), 'input ' + i + ' produced ' + v);
    assert.ok(v >= 0.10 && v <= 0.48,
      'input ' + i + ' produced ' + v + ', outside the band');
  });
  /* a hopeless shot still sometimes squirts on target, and the best
     striker in the world still misses the target more than half the
     time — 48% is roughly the best any real player sustains */
  assert.equal(model.onTargetChance(-5), 0.10);
  assert.equal(model.onTargetChance(1e6), 0.48);
});

test('whether it goes in is a different roll, and it has not moved', () => {
  /* the guard that says this change was to accuracy and not to scoring */
  assert.equal(model.shotXg(1), 0.13);
  assert.equal(model.shotXg(0), 0.02);
  assert.equal(model.shotXg(100), 0.75);
  assert.equal(model.config.targetGoals, 2.8);
});
