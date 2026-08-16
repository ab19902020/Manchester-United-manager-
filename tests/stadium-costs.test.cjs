const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * What a ground costs depends on whose ground it is.
 *
 * Every price on the stadium screen used to be a flat Premier League
 * number charged to all 484 clubs: £380,000,000 to rebuild, whether you
 * were Manchester United or a National League side with £376,000 in the
 * bank. Nobody below the Championship could lay a single seat.
 *
 * These tests pin the shape rather than the exact figures, because the
 * figures are balance and balance moves: the ladder must rise with the
 * club, the bottom must be reachable, the top must stay expensive, and
 * no partial job may cost more than the total one.
 */

async function world() {
  const game = await createGame();
  await startCareer(game, 'Stadia');
  return game;
}

/* price everything as if you managed that club, because the seat price
   reads the manager's own reputation */
const AS_CLUB = `(function (league) {
  const api = window.RBSStadiumCosts;
  const clubs = G.clubs.filter((c) => c.league === league);
  if (!clubs.length) return null;
  const reps = clubs.map((c) => c.rep || 0).sort((a, b) => a - b);
  const median = reps[Math.floor(reps.length / 2)];
  const club = clubs.slice().sort((a, b) =>
    Math.abs((a.rep || 0) - median) - Math.abs((b.rep || 0) - median))[0];
  const was = G.my;
  G.my = G.clubs.indexOf(club);
  const prices = api.priceFor(club);
  const seats = seatCost(club.cap || 0);
  const gain = seatGain(club.cap || 0);
  G.my = was;
  return {
    name: club.name, rep: club.rep, cap: club.cap, bank: club.bank,
    mult: api.multiplier(club), seats: seats, gain: gain,
    rebuild: prices.rebuild, tier: prices.tier,
    train: prices.train, youth: prices.youth,
  };
}(LEAGUE))`;

const priceIn = (game, league) =>
  game.eval(AS_CLUB.replace('LEAGUE', JSON.stringify(league)));

test('a club at the bottom can actually afford to build', async () => {
  const game = await world();
  try {
    const nl = priceIn(game, 'NL');
    assert.ok(nl, 'the National League exists');

    /* THE FIGURE THAT STARTED THIS: £44m of seats against £376k of bank,
       a hundred and seventeen times everything the club had. */
    assert.ok(nl.seats < nl.bank * 6,
      `a phase of seats costs ${nl.seats} against a bank of ${nl.bank}`);
    assert.ok(nl.youth < nl.bank * 6, `an academy costs ${nl.youth} on ${nl.bank}`);
    assert.ok(nl.train < nl.bank * 6, `a training centre costs ${nl.train} on ${nl.bank}`);
    assert.ok(nl.rebuild < nl.bank * 12,
      `a whole new ground costs ${nl.rebuild} on ${nl.bank}`);

    /* and the phase is a stand, not a second stadium bolted on */
    assert.ok(nl.gain >= 1500 && nl.gain <= nl.cap,
      `a phase of ${nl.gain} seats onto a ground of ${nl.cap}`);
  } finally {
    game.close();
  }
});

test('the same job costs more the higher up you are', async () => {
  const game = await world();
  try {
    const tiers = ['NL', 'L2', 'L1', 'CH', 'PL'].map((l) => [l, priceIn(game, l)])
      .filter(([, row]) => row);
    assert.ok(tiers.length >= 4, 'the English pyramid is there to compare');

    const top = tiers[tiers.length - 1][1];
    const bottom = tiers[0][1];

    /* the facility upgrades are scaled by reputation, so they must be
       strictly ordered up the pyramid */
    ['youth', 'train'].forEach((key) => {
      for (let i = 1; i < tiers.length; i += 1) {
        assert.ok(tiers[i][1][key] >= tiers[i - 1][1][key],
          `${key}: ${tiers[i][0]} (${tiers[i][1][key]}) should not be cheaper `
          + `than ${tiers[i - 1][0]} (${tiers[i - 1][1][key]})`);
      }
    });

    /* and the gap between top and bottom should be large, or the ladder
       is not a ladder */
    assert.ok(top.youth > bottom.youth * 8,
      `an academy is ${top.youth} at the top and ${bottom.youth} at the bottom`);
  } finally {
    game.close();
  }
});

test('the biggest grounds are still a serious amount of money', async () => {
  const game = await world();
  try {
    /* the point was never to make everything cheap. Manchester United
       rebuilding Old Trafford should still be a once-in-a-career
       decision — it was £380m before and should be near that. */
    const big = game.eval(`(function () {
      const api = window.RBSStadiumCosts;
      const me = G.clubs[G.my];
      return { name: me.name, cap: me.cap, seats: seatCost(me.cap),
        rebuild: api.priceFor(me).rebuild, mult: api.multiplier(me) };
    }())`);

    assert.ok(big.cap > 60000, `the featured club has a big ground (${big.cap})`);
    assert.ok(big.rebuild > 200e6,
      `rebuilding a ${big.cap}-seat ground costs ${big.rebuild}`);
    assert.ok(big.seats > 40e6,
      `another phase at ${big.cap} seats costs ${big.seats}`);
    assert.ok(big.mult <= 1.25 + 1e-9, 'the multiplier is clamped at the top');
  } finally {
    game.close();
  }
});

test('a part of the job never costs more than all of it', async () => {
  const game = await world();
  try {
    ['NL', 'L2', 'L1', 'CH', 'PL'].forEach((league) => {
      const row = priceIn(game, league);
      if (!row) return;
      /* adding a tier and a roof must not be dearer than demolishing the
         ground and building a new one — for a while it was, at the
         bottom, because the two prices came from different places */
      assert.ok(row.tier <= row.rebuild,
        `${league}: a redevelopment (${row.tier}) beats a rebuild (${row.rebuild})`);
    });
  } finally {
    game.close();
  }
});

test('a ground can be grown from non-league to twenty thousand', async () => {
  const game = await world();
  try {
    const climb = game.eval(`(function () {
      const small = G.clubs.filter((c) => c.league === 'NL')
        .sort((a, b) => (a.cap || 0) - (b.cap || 0))[0];
      const was = G.my;
      G.my = G.clubs.indexOf(small);
      let cap = small.cap || 3000;
      const from = cap;
      let spend = 0;
      let phases = 0;
      while (cap < 20000 && phases < 40) {
        spend += seatCost(cap);
        const gain = seatGain(cap);
        if (gain <= 0) break;
        cap += gain;
        phases += 1;
      }
      G.my = was;
      return { from: from, to: cap, spend: spend, phases: phases };
    }())`);

    assert.ok(climb.to >= 20000,
      `the climb reached ${climb.to} seats from ${climb.from}`);
    assert.ok(climb.phases >= 3 && climb.phases <= 12,
      `it took ${climb.phases} phases — it should be a project, not one purchase `
      + 'and not a lifetime');
    /* the whole climb should cost less than the single old £44m quote
       for one phase */
    assert.ok(climb.spend < 44e6,
      `growing from ${climb.from} to ${climb.to} costs ${climb.spend} in total`);
  } finally {
    game.close();
  }
});
