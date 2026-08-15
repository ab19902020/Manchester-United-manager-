const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * A world is a number.
 *
 * The save is 16.24 MB and CrazyGames stores 1 MB. The only shape that
 * fits is to keep the seed the world was built from and build it again
 * on load, and that is worth nothing unless the same seed gives back the
 * same world — the same clubs, the same men, and above all the same
 * NUMBER of men, because the count is what used to move:
 *
 *     before   run 1  9,887 players   hash 496791c4
 *              run 2  9,886 players   hash a6bc2454
 *
 * So these tests do not check that generation is seeded. They check the
 * only thing a save format can be built on: that it comes back.
 */

const SEED = 20260815;

test('the same seed builds the same world, in a page that has never had a career', async (t) => {
  const one = await createGame();
  t.after(() => one.close());
  const two = await createGame();
  t.after(() => two.close());

  const build = (game) => game.eval(
    `(RBSWorldSeed.build(${SEED}, 0), RBSWorldSeed.hash())`,
  );

  const a = build(one);
  const b = build(two);

  assert.equal(a.players, b.players,
    `the player count moved: ${a.players} then ${b.players}`);
  assert.equal(a.youth, b.youth, 'the academies moved');
  assert.equal(a.clubs, b.clubs, 'the club count moved');
  assert.equal(a.free, b.free, 'the free agents moved');
  assert.equal(a.fixtures, b.fixtures, 'the fixture list moved');
  assert.equal(a.hash, b.hash,
    `two pages built different worlds from seed ${SEED}: ${a.hash} vs ${b.hash}`);

  // and it is a real world, not an empty one that trivially matches
  assert.ok(a.players > 8000, `only ${a.players} players were built`);
  assert.ok(a.clubs > 400, `only ${a.clubs} clubs were built`);
});

test('a career that has already been played does not change what a seed builds', async (t) => {
  /* The reason this can fail is not the seed. `LEAGUES` and `DIV_NAMES`
     describe the game rather than the career, so they live outside the
     save and buildWorld() fills them in — which means the first career
     of a session generates against empty tables and every one after it
     generates against the last career's leftovers. buildFixtures() laid
     380 rows the first time and 1,046 the second from the same seed, and
     those rows are laid with random numbers, so every draw after them
     shifted. */
  const cold = await createGame();
  t.after(() => cold.close());
  const coldHash = cold.eval(`(RBSWorldSeed.build(${SEED}, 0), RBSWorldSeed.hash())`);

  const warm = await createGame();
  t.after(() => warm.close());
  await startCareer(warm);
  const warmHash = warm.eval(`(function(){
    for (let i = 0; i < 20; i += 1) advanceDay();
    RBSWorldSeed.build(${SEED}, 0);
    return RBSWorldSeed.hash();
  })()`);

  assert.equal(warmHash.players, coldHash.players,
    `a played career changed the player count the seed builds: ` +
    `${coldHash.players} cold, ${warmHash.players} warm`);
  assert.equal(warmHash.hash, coldHash.hash,
    `a played career changed the world the seed builds: ${coldHash.hash} vs ${warmHash.hash}`);
});

test('a career stamps the seed it was built from, and that seed rebuilds it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const seed = G.worldSeed, my = G.my;
    const asPlayed = RBSWorldSeed.hash();
    RBSWorldSeed.build(seed, my);
    return {seed, my, asPlayed, rebuilt: RBSWorldSeed.hash(), stamped: G.worldSeed};
  })()`);

  assert.equal(typeof run.seed, 'number', 'the career did not record the seed it was built from');
  assert.ok(run.seed >= 0 && run.seed <= 0xFFFFFFFF, `${run.seed} is not a 32-bit seed`);
  assert.equal(run.stamped, run.seed, 'rebuilding from a seed stamped a different seed');
  assert.equal(run.rebuilt.players, run.asPlayed.players,
    `rebuilding the career's own world gave ${run.rebuilt.players} players, not ${run.asPlayed.players}`);
  assert.equal(run.rebuilt.hash, run.asPlayed.hash,
    'a career cannot be rebuilt from the seed it recorded');
});

test('only the world is seeded — the football is as random as it ever was', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const duringGeneration = [];
    // the seeded stream must be handed back the moment generation ends
    const active = RBSWorldSeed.active();

    function season(){
      RBSWorldSeed.build(${SEED}, 0);
      const fx = G.fixtures.slice().sort((x, y) => x.day - y.day || x.h - y.h).slice(0, 60);
      fx.forEach(f => { if (!f.played) quickSim(f); });
      return fx.map(f => f.hs + '-' + f.as).join(',');
    }
    return {active, a: season(), b: season()};
  })()`);

  assert.equal(run.active, false,
    'the seeded stream was still installed after generation finished');
  assert.ok(run.a.length > 20, 'no matches were played, so nothing was measured');
  assert.notEqual(run.a, run.b,
    'the same world played out identically twice — in-play randomness has been seeded too');
});
