const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Reported: players reach the high nineties far too quickly.
 *
 * Measured over three seasons before the change, the best prospects in
 * the world went 82 -> 90 -> 93 and 85 -> 92, and clubs holding a player
 * rated 90 or better went 12 -> 24 -> 33. After: 82 -> 86 -> 87,
 * 85 -> 88 -> 90, and 12 -> 12 -> 15.
 */

test('the growth curve tapers with age and does not fall off a cliff', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const api = window.RBSGrowth;
    const ceilings = {};
    [16,18,19,21,22,24,25,27,28,30,31,32,33,35,36,38].forEach(a => {
      ceilings[a] = api.ceilingFor(a);
    });
    // the veteran bands are drawn per season, so measure the odds
    const odds = (age) => {
      let hits = 0;
      for (let i = 0; i < 6000; i += 1) if (api.factorFor(age) > 0) hits += 1;
      return hits / 6000;
    };
    return {ceilings, at29: odds(29), at31: odds(31), at34: odds(34), at37: odds(37),
      declared: {a31: api.veteranOdds(31), a34: api.veteranOdds(34), a37: api.veteranOdds(37)}};
  })()`);

  const c = run.ceilings;

  // 1. it only ever goes down with age
  const ages = Object.keys(c).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < ages.length; i += 1) {
    assert.ok(c[ages[i]] <= c[ages[i - 1]],
      `a ${ages[i]}-year-old should not out-develop a ${ages[i - 1]}-year-old ` +
      `(${c[ages[i]]} vs ${c[ages[i - 1]]})`);
  }

  // 2. nobody grows the way they used to. The old model allowed ten in a
  //    season at 17 and eight at 19.
  assert.ok(c[18] <= 6, `a teenager should not gain ${c[18]} overall in one season`);
  assert.ok(c[19] < c[18] || c[19] <= 4, 'and less again once he is out of his teens');
  assert.ok(c[25] <= 2, `a 25-year-old should not gain ${c[25]} in a season`);
  assert.ok(c[28] <= 1, `a 28-year-old should not gain ${c[28]} in a season`);

  // 3. but a young player still develops meaningfully
  assert.ok(c[18] >= 3, 'a good teenager must still improve enough to be worth signing');
  assert.ok(c[21] >= 2, 'and so must a twenty-one-year-old');

  // 4. the top of the curve is a taper, not a cliff. The old model gave a
  //    31-year-old exactly zero, forever, from his birthday.
  assert.ok(run.at29 > 0.9, 'a player under thirty should develop every season');
  assert.ok(run.at31 > 0.1 && run.at31 < 0.6,
    `a 31-year-old should improve sometimes, not usually (${(run.at31 * 100).toFixed(0)}%)`);
  assert.ok(run.at34 > 0 && run.at34 < run.at31,
    `a 34-year-old should improve more rarely still (${(run.at34 * 100).toFixed(0)}%)`);
  assert.equal(run.at37, 0, 'and a 37-year-old is not getting better');

  // and what the module says about itself matches what it does
  assert.ok(Math.abs(run.declared.a31 - run.at31) < 0.06, 'the declared odds should be the real ones');
  assert.ok(Math.abs(run.declared.a34 - run.at34) < 0.06, 'at both veteran bands');
});

test('nobody jumps eight points of overall in a season', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const before = {};
    const walk = (fn) => G.clubs.forEach(c => {
      (c.players||[]).forEach(fn);
      (c.youth||[]).forEach(fn);
    });
    walk(p => { before[p.id] = {ovr: p.ovr, age: p.age, pot: p.pot}; });

    G.fixtures.forEach(f => { if (!f.played) quickSim(f); });
    for (let pass = 0; pass < 30; pass += 1) {
      let open = false;
      Object.keys(G.cups||{}).forEach(k => {
        const c = G.cups[k];
        if (!c || c.winner != null || !c.ties.length) return;
        c.ties.forEach(t => { if (!t.played) resolveTie(t); });
        advanceCup(k);
        if (G.cups[k].winner == null) open = true;
      });
      if (!open) break;
    }
    G.day = Math.max.apply(null, G.fixtures.map(f => f.day));
    let guard = 0;
    const season = G.season;
    while (G.season === season && guard++ < 60) {
      simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd();
    }

    let biggest = 0, biggestWho = null, grew = 0, seen = 0;
    let oldGrew = 0, oldSeen = 0;
    walk(p => {
      const b = before[p.id];
      if (!b) return;
      seen += 1;
      const d = p.ovr - b.ovr;
      if (d > biggest) { biggest = d; biggestWho = p.name + ' (' + b.age + ', ' + b.ovr + '->' + p.ovr + ')'; }
      if (d > 0) grew += 1;
      if (b.age >= 31) { oldSeen += 1; if (d > 0) oldGrew += 1; }
    });
    return {biggest, biggestWho, grew, seen, oldGrew, oldSeen, closed: G.season > season};
  })()`);

  assert.ok(run.closed, 'the season should have rolled over');
  assert.ok(run.seen > 500, `not enough players tracked (${run.seen})`);

  // the complaint, as a bound. The old model allowed ten.
  assert.ok(run.biggest <= 6,
    `somebody gained ${run.biggest} overall in a single season: ${run.biggestWho}`);
  // but a season of football still develops people
  assert.ok(run.grew > 20,
    `only ${run.grew} players in the world improved all season`);
  // and the over-thirties are not all frozen solid
  assert.ok(run.oldSeen > 20, 'there should be plenty of players over thirty');
});
