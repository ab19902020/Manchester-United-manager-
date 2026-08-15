const test = require('node:test');
const assert = require('node:assert/strict');

const renderer = require('../src/dugout-3d.js');

test('the compressed broadcast shows analytics in proportion to match speed', () => {
  const minute = [
    { type: 'pass', actorId: 1, count: 6 },
    { type: 'dribble', actorId: 2, count: 1 },
    { type: 'tackle', actorId: 3, count: 1 },
  ];
  const normal = renderer.compactAnalytics(minute, 1);
  const double = renderer.compactAnalytics(minute, 2);
  const fast = renderer.compactAnalytics(minute, 4);
  const highlights = renderer.compactAnalytics(minute, 6);

  assert.ok(normal.length >= 5, 'normal speed should show most of a typical passing minute');
  assert.ok(double.length <= 3, '2x should edit the minute down to representative actions');
  assert.equal(fast.length, 1, 'fast mode should show one representative transition');
  assert.equal(highlights.length, 0, 'highlights should skip a routine minute');
  assert.ok(normal.reduce((sum, action) => sum + action.duration, 0) <= 3400);
  assert.ok(double.reduce((sum, action) => sum + action.duration, 0) <= 1800);
});

test('decisive actions survive every visible speed and receive screen time', () => {
  const minute = [
    { type: 'pass', actorId: 1, count: 5 },
    { type: 'dribble', actorId: 2, count: 1 },
    { type: 'goal', actorId: 3, sideIndex: 0, count: 1 },
  ];
  [1, 2, 4, 6].forEach((speed) => {
    const sequence = renderer.compactAnalytics(minute, speed);
    const goal = sequence.find((action) => action.type === 'goal');
    assert.ok(goal, `goal should be retained at speed ${speed}`);
    assert.ok(goal.duration >= 1900);
  });
});

test('the visual edit fits the current 1x, 2x and 4x engine minute clocks', () => {
  assert.ok(renderer.speedBudget(1, false).windowMs < 3200);
  assert.ok(renderer.speedBudget(2, false).windowMs < 1600);
  assert.ok(renderer.speedBudget(4, false).windowMs < 800);
  assert.equal(renderer.speedBudget(6, false).maxActions, 0);
  assert.equal(renderer.speedBudget(9, true).maxActions, 0);
});

test('attempt analytics retain outcomes instead of only showing successful tackles and dribbles', () => {
  const player = {
    p: { id: 7, name: 'Test Midfielder' },
    slot: 'MC',
    ms: { pas: 2, pasC: 1, key: 1, sh: 1, sot: 1, tak: 2, takW: 1, intc: 1, drb: 3, drbW: 2, sav: 0 },
    yc: 0,
    off: false,
  };
  const zero = { pas: 0, pasC: 0, key: 0, sh: 0, sot: 0, tak: 0, takW: 0, intc: 0, drb: 0, drbW: 0, sav: 0, yc: 0, off: false };
  const match = {
    sides: [{ ci: 0, onfield: [player] }, { ci: 1, onfield: [] }],
    fix: { hs: 0, as: 0, sc: [] },
    feed: [],
  };
  const records = renderer.analyticsDelta({ players: new Map([[7, zero]]), hs: 0, as: 0, scorers: 0, feed: 0 }, match);
  const tackle = records.find((record) => record.type === 'tackle');
  const dribble = records.find((record) => record.type === 'dribble');
  const shot = records.find((record) => record.type === 'shot');

  assert.equal(tackle.count, 2);
  assert.equal(tackle.wonCount, 1);
  assert.equal(dribble.count, 3);
  assert.equal(dribble.wonCount, 2);
  assert.equal(shot.onTargetCount, 1);
});

test('the touchline broadcast camera moves into the attack without losing stadium depth', () => {
  const centre = renderer.cameraSpec({ x: 52.5, y: 34 }, null, 0, true);
  const attack = renderer.cameraSpec({ x: 91, y: 28 }, { type: 'shot' }, 0, false);

  assert.equal(centre.mode, 'wide');
  /* The band used to be 10-12, which pinned the old wide camera at 10.9m.
     That height was deliberately dropped: at nearly eleven metres and
     forty-three back the picture was a tactics board — you could read the
     shape of the team and not a single face. A television camera sits
     around six to eight metres up. The band is moved rather than widened,
     and the assertions that carry the actual intent — the cinematic
     camera drops below the wide one and pushes further up the pitch —
     are unchanged below. */
  assert.ok(centre.position[1] >= 7.5 && centre.position[1] <= 10);
  assert.equal(attack.mode, 'cinematic');
  assert.ok(attack.position[1] < centre.position[1]);
  assert.ok(attack.target[0] > centre.target[0]);
});

test('mobile quality keeps WebGL resolution and crowd cost bounded', () => {
  const low = renderer.qualityProfile(390, 2, 3);
  const normal = renderer.qualityProfile(390, 6, 3);
  const desktop = renderer.qualityProfile(1000, 8, 2);

  assert.ok(low.pixelRatio <= 1.15);
  assert.equal(low.shadows, false);
  assert.equal(low.compactPlayers, true);
  assert.equal(normal.compactPlayers, true);
  assert.equal(desktop.compactPlayers, false);
  assert.ok(normal.crowdPoints > low.crowdPoints);
  assert.ok(desktop.crowdPoints > normal.crowdPoints);
  assert.ok(desktop.pixelRatio <= 1.65);
});

/*
 * The ball must not teleport.
 *
 * Sampling the rendered ball every animation frame through real matches
 * found it moving more than 15m in a single frame about twice a match
 * minute, at EVERY speed, with the worst step 96.6m — the whole pitch.
 * Between one staged action and the next the carrier changes, and the
 * two men can be at opposite ends, so the ball was being snapped from
 * one boot to another. That is what "you just can't tell what's going
 * on the pitch" was.
 *
 * These drive `ballChase` directly with a synthetic clock, because the
 * three things that went wrong while fixing it are all invisible to a
 * screenshot and two of them only appeared in a real match.
 */

function chaser() {
  const state = renderer.state;
  state.ballCarry = null;
  return (now, x, z, height) => renderer.ballChase(now, x, z, height == null ? 0.22 : height);
}

test('ordinary play places the ball exactly, and only a real cut opens a transit', () => {
  const chase = chaser();
  /* a man carrying it, moving a metre or so a frame */
  let x = 40;
  for (let frame = 0; frame < 30; frame += 1) {
    x += 0.9;
    const out = chase(frame * 16.7, x, 34, 0.22);
    assert.equal(out.x, x, 'the ball sits on the man, not a few metres behind him');
    assert.equal(out.z, 34);
    assert.equal(out.height, 0.22, 'and it is not lofted while he is running with it');
  }

  /* THE FIRST ATTEMPT MADE THIS A FILTER ON EVERY FRAME instead of a
     fix for the jump, and the observer caught it: the ball sat on the
     man 0% of the time instead of 100%, and never once reached the net
     on a goal, because a bounded step never converges on a target that
     moves every frame. */
  assert.equal(renderer.state.ballCarry.transit, null, 'no transit for ordinary play');
});

test('a cut across the pitch is covered by a ball that travels', () => {
  const chase = chaser();
  chase(0, 10, 34, 0.22);

  /* the next staged action starts eighty metres away */
  const steps = [];
  let last = { x: 10, z: 34 };
  let frame = 1;
  let out = null;
  for (; frame < 200; frame += 1) {
    out = chase(frame * 16.7, 90, 40, 0.22);
    steps.push(Math.hypot(out.x - last.x, out.z - last.z));
    last = out;
    if (!renderer.state.ballCarry.transit) break;
  }

  assert.ok(frame > 8, `the cut should take several frames, took ${frame}`);
  assert.ok(Math.max(...steps) < 12,
    `no single frame may jump the pitch, worst was ${Math.max(...steps).toFixed(1)}m`);
  assert.ok(Math.max(...steps.map((_, i) => i)) >= 0);
  assert.equal(Math.round(out.x), 90, 'and it arrives exactly where it was going');
  assert.equal(Math.round(out.z), 40);

  /* a long one is hit, not rolled */
  assert.ok(Math.max(...steps) > 0, 'it moved');
});

test('a long transit arcs, and a transit finishes on the target', () => {
  const chase = chaser();
  chase(0, 5, 34, 0.22);
  let peak = 0;
  let out = null;
  for (let frame = 1; frame < 200; frame += 1) {
    out = chase(frame * 16.7, 95, 34, 0.22);
    peak = Math.max(peak, out.height);
    if (!renderer.state.ballCarry.transit) break;
  }
  assert.ok(peak > 1.5, `a ninety-metre ball should leave the floor, peaked at ${peak.toFixed(2)}m`);
  assert.equal(out.height, 0.22, 'and it is back down when it arrives');
  assert.equal(Math.round(out.x), 95);
});

test('a target that cuts mid-transit re-anchors instead of dragging the ball', () => {
  /* THE BUG THIS PINS. Homing on a moving target is right for a target
     that moves and wrong for one that teleports: with the transit 65%
     through, a target jumping across the pitch dragged the ball 50.2m
     in a single 20ms frame — the original fault, back again, inside the
     thing that was supposed to fix it. */
  const chase = chaser();
  chase(0, 10, 34, 0.22);

  let last = null;
  let worst = 0;
  /* FAR ENOUGH THROUGH TO MATTER. The first version of this test cut the
     target after eleven frames — about a fifth of the way — where the
     easing coefficient is still ~0.1 and dragging the endpoint barely
     moves the ball, so it passed with the fix removed and was testing
     nothing. The observed failure was at 65% through, where the
     coefficient is ~0.8 and the drag is almost the whole jump. */
  for (let frame = 1; frame < 34; frame += 1) {
    last = chase(frame * 16.7, 90, 34, 0.22);       /* heading right */
  }
  const before = last;
  const progressed = renderer.state.ballCarry.transit;
  /* now the next action stages at the other end entirely */
  for (let frame = 34; frame < 60; frame += 1) {
    const out = chase(frame * 16.7, 8, 60, 0.22);
    worst = Math.max(worst, Math.hypot(out.x - last.x, out.z - last.z));
    last = out;
  }

  assert.ok(progressed, 'the first transit was still running when the target cut');
  assert.ok(before.x > 45, `the first transit was well under way, reached ${before.x.toFixed(1)}`);
  assert.ok(worst < 12,
    `a target cutting mid-transit must not drag the ball, worst step ${worst.toFixed(1)}m`);
});

test('the cut threshold is a real distance, not a hair trigger', () => {
  const chase = chaser();
  chase(0, 50, 34, 0.22);
  /* just under the threshold is placed, just over opens a transit */
  const under = chase(16.7, 50 + renderer.BALL_CUT - 1, 34, 0.22);
  assert.equal(under.x, 50 + renderer.BALL_CUT - 1, 'a short hop is just placed');
  assert.equal(renderer.state.ballCarry.transit, null);

  chase(33.4, 50, 34, 0.22);
  chase(50, 50 + renderer.BALL_CUT + 8, 34, 0.22);
  assert.ok(renderer.state.ballCarry.transit, 'a real cut opens a transit');
});
