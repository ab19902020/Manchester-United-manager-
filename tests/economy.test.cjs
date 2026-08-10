const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Phase one of the economy rebuild. These are written as the shape the
 * money should have rather than as the constants that produce it, so
 * they survive re-tuning but still fail if the pyramid flattens out
 * again or a division stops being able to pay its bills.
 */
test('the money has the shape of the pyramid, and every club can pay its bills', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const books = game.eval(`(function(){
    const out = {}; const saved = G.my;
    ['PL','CH','L1','L2','NL'].forEach(div => {
      const list = G.clubs.filter(c => c.league === div).sort((a,b) => b.rep - a.rep);
      out[div] = [['top', list[0]], ['mid', list[Math.floor(list.length/2)]], ['bot', list[list.length-1]]]
        .filter(r => r[1])
        .map(([which, c]) => {
          G.my = c.i; G.deals = {};
          const rev = seasonRevenue(), cost = seasonCosts();
          const row = {which, club: c.short, revenue: rev.total, central: rev.tv, gate: rev.gate,
            wages: cost.wages, costs: cost.total, profit: rev.total - cost.total,
            wageRatio: cost.wages / Math.max(1, rev.total)};
          G.my = saved; G.deals = {};
          return row;
        });
    });
    return out;
  })()`);

  const mid = (d) => books[d].find((r) => r.which === 'mid');

  // 1. the pyramid has a cliff in it. Real central distribution runs
  //    roughly £110M : £11M : £2M : £1.5M : £0.15M.
  assert.ok(mid('PL').central > mid('CH').central * 5,
    `Premier League central money should dwarf the Championship (£${Math.round(mid('PL').central/1e6)}M vs £${Math.round(mid('CH').central/1e6)}M)`);
  assert.ok(mid('CH').central > mid('L1').central * 2.5,
    'the Championship should be several times League One');
  assert.ok(mid('L2').central > mid('NL').central * 2,
    'League Two should be well clear of the National League');

  // 2. a National League club is a National League club, not a rich one.
  assert.ok(mid('NL').revenue < 6e6,
    `a mid-table National League club should turn over single-digit millions at most, got £${(mid('NL').revenue/1e6).toFixed(1)}M`);
  assert.ok(mid('PL').revenue > 100e6, 'a Premier League club turns over nine figures');

  // 3. wages are the dominant single cost everywhere — that is what
  //    makes the wage bill a decision rather than a detail.
  Object.keys(books).forEach((div) => {
    books[div].forEach((r) => {
      assert.ok(r.wageRatio > 0.10,
        `${div}/${r.which} spends only ${Math.round(r.wageRatio*100)}% of revenue on wages — wages have stopped mattering`);
      assert.ok(r.wageRatio < 0.95,
        `${div}/${r.which} spends ${Math.round(r.wageRatio*100)}% of revenue on wages, which is not survivable`);
    });
  });

  // 4. but nobody is doomed by default. A club that has done nothing
  //    yet should not be losing money — this is a game you can win.
  ['PL', 'CH', 'L1', 'L2', 'NL'].forEach((div) => {
    ['mid', 'bot'].forEach((which) => {
      const r = books[div].find((x) => x.which === which);
      assert.ok(r.profit > 0,
        `${div}/${which} (${r.club}) loses £${Math.round(-r.profit/1e3)}K a year before the manager does anything`);
    });
  });
});

test('the Finances screen and your bank account agree, and nobody goes bust', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  // 1. what the turnstile pays is what the projection said it would.
  const gate = game.eval(`(function(){
    const c = G.clubs[G.my];
    const opp = G.clubs.find(x => x.league === c.league && x.i !== c.i);
    const fix = {h: c.i, a: opp.i, cup: false, played: false, div: c.league, hs: 0, as: 0, r: 0, sc: [], reds: 0};
    const sim = quickSim(fix);
    MU.fix = fix; MU.over = false; MU.m = sim;
    const bank0 = c.bank;
    applyPostMatch('W', 2, 0);
    const mail = G.inbox.find(x => String(x.title).indexOf('Gate receipts:') === 0);
    const homeMatches = RBSEconomy.homeLeagueMatches(c.league);
    return {paid: c.bank - bank0,
            projectedPerMatch: RBSEconomy.matchdayRevenue(c) / (homeMatches + 3),
            mailed: !!mail, body: mail ? String(mail.body) : ''};
  })()`);

  assert.ok(gate.mailed, 'a home match posts a gate receipt');
  assert.ok(gate.paid > 0, 'and it pays actual money');
  const drift = Math.abs(gate.paid - gate.projectedPerMatch) / gate.projectedPerMatch;
  assert.ok(drift < 0.25,
    `the gate paid (£${Math.round(gate.paid)}) should match the Finances projection (£${Math.round(gate.projectedPerMatch)}) — it was two different ticket prices before`);
  assert.ok(gate.body.indexOf('a head') > 0, 'and it tells you what a head was worth');

  // 2. PSR is a constraint you can breach, not a state you start in.
  const psr = game.eval(`(function(){
    const out = []; const saved = G.my;
    ['PL','CH','L1','L2','NL'].forEach(div => {
      const list = G.clubs.filter(x => x.league === div).sort((a,b) => b.rep - a.rep);
      [list[Math.floor(list.length/2)], list[list.length-1]].forEach(c => {
        G.my = c.i; G.deals = {};
        out.push({div, club: c.short, band: psrBand(psrPosition().headroom).k});
        G.my = saved; G.deals = {};
      });
    });
    return out;
  })()`);
  psr.forEach((r) => {
    assert.notEqual(r.band, 'IN BREACH',
      `${r.div} (${r.club}) is in breach of Profit & Sustainability on day one, having done nothing`);
  });

  // 3. run the world forward and check the pyramid is still standing.
  const solvency = game.eval(`(function(){
    const watch = ['PL','CH','L1','L2','NL'].map(div => {
      const c = G.clubs.filter(x => x.league === div).sort((a,b) => a.rep - b.rep)[0];
      return {div, i: c.i, short: c.short, bank0: c.bank};
    });
    let guard = 0;
    while (guard++ < 150) {
      const um = fixturesOn(G.day).find(f => !f.played && (f.h === G.my || f.a === G.my));
      if (um) { quickSim(um); finishDayAfterMatch(); }
      else { simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd(); }
    }
    return watch.map(w => ({div: w.div, short: w.short, bank0: w.bank0, bank1: G.clubs[w.i].bank}));
  })()`);
  solvency.forEach((r) => {
    assert.ok(r.bank1 > 0,
      `the weakest ${r.div} club (${r.short}) went bust in 150 days: £${Math.round(r.bank0/1e3)}K -> £${Math.round(r.bank1/1e3)}K`);
  });
});
