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
  assert.ok(centre.position[1] >= 10 && centre.position[1] <= 12);
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
