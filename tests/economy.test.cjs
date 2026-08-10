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

test('promotion and relegation are the financial events they really are', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  // 1. the cliff. The same club, in each division in turn.
  const cliff = game.eval(`(function(){
    const c = G.clubs.filter(x => x.league === 'CH').sort((a,b) => b.rep - a.rep)[0];
    const was = c.league, saved = G.my;
    const out = {};
    ['PL','CH','L1','L2','NL'].forEach(div => {
      c.league = div; G.my = c.i; G.deals = {};
      out[div] = {central: RBSEconomy.centralFor(c), revenue: seasonRevenue().total};
      G.my = saved; G.deals = {};
    });
    c.league = was;
    return out;
  })()`);

  assert.ok(cliff.PL.central > cliff.CH.central * 5,
    `promotion to the Premier League should transform a club: £${Math.round(cliff.CH.central/1e6)}M -> £${Math.round(cliff.PL.central/1e6)}M`);
  assert.ok(cliff.CH.central > cliff.L1.central * 2.5, 'and the Championship should be worth leaving League One for');
  assert.ok(cliff.L2.central > cliff.NL.central * 2, 'and getting out of the National League should matter');

  // 2. the parachute taper, and the rule that decides its length.
  const chute = game.eval(`(function(){
    const c = G.clubs.filter(x => x.league === 'CH')[0];
    const read = (total) => {
      const out = [];
      for (let left = total; left > 0; left--) { c.chute = {left, total, years: total}; out.push(RBSEconomy.parachuteFor(c)); }
      c.chute = null;
      return out;
    };
    return {oneSeasonUp: read(2), longerUp: read(3)};
  })()`);

  assert.equal(Array.from(chute.oneSeasonUp).join(','), '49000000,40000000',
    'a club up for one season gets two years of parachute, starting at the top of the taper');
  assert.equal(Array.from(chute.longerUp).join(','), '49000000,40000000,22000000',
    'a club up for longer gets the third year too');

  // 3. and it is what keeps a relegated club with a top-flight wage bill
  //    alive, which is the whole point of it.
  const relegated = game.eval(`(function(){
    const c = G.clubs.filter(x => x.league === 'CH').sort((a,b) => b.rep - a.rep)[0];
    const saved = G.my; G.my = c.i; G.deals = {};
    c.chute = null;
    const bare = seasonRevenue().total - seasonCosts().total;
    c.chute = {left: 3, total: 3, years: 3};
    const withChute = seasonRevenue().total - seasonCosts().total;
    c.chute = null; G.my = saved; G.deals = {};
    return {bare, withChute, wages: 0};
  })()`);

  assert.ok(relegated.bare < 0,
    'a relegated club carrying a Premier League wage bill on Championship income should be losing money');
  assert.ok(relegated.withChute > 0,
    'and the parachute should be what stops it going under');
});

test('the lower leagues run the wage cap the EFL actually runs', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const positions = game.eval(`(function(){
    const out = []; const saved = G.my;
    ['PL','CH','L1','L2','NL'].forEach(div => {
      const list = G.clubs.filter(x => x.league === div).sort((a,b) => b.rep - a.rep);
      [['top', list[0]], ['mid', list[Math.floor(list.length/2)]], ['bot', list[list.length-1]]].forEach(([w, c]) => {
        G.my = c.i; G.deals = {};
        const p = RBSEconomy.scmpPosition(0);
        out.push({div, w, club: c.short, applies: !!p, cap: p ? p.rule.share : null, ok: p ? p.ok : null});
        G.my = saved; G.deals = {};
      });
    });
    return out;
  })()`);

  // Profit & Sustainability is a top-two-division rule; the EFL runs the
  // Salary Cost Management Protocol below it.
  positions.filter((p) => p.div === 'PL' || p.div === 'CH').forEach((p) => {
    assert.equal(p.applies, false, `${p.div} runs Profit & Sustainability, not a wage cap`);
  });
  positions.filter((p) => ['L1', 'L2', 'NL'].includes(p.div)).forEach((p) => {
    assert.equal(p.applies, true, `${p.div} should run a wage cap`);
  });

  // 2026/27 figures: League One 50% of turnover including coaching, League Two 55%.
  assert.equal(positions.find((p) => p.div === 'L1').cap, 0.50, 'League One is capped at 50% of turnover');
  assert.equal(positions.find((p) => p.div === 'L2').cap, 0.55, 'League Two is capped at 55%');

  // No career may open under embargo — a club that inherits a bill above
  // the cap gets the compliance path, not a frozen transfer window.
  positions.filter((p) => p.applies).forEach((p) => {
    assert.equal(p.ok, true, `${p.div} (${p.club}) starts a career already embargoed`);
  });

  // But the cap is real: it stops a wage the club cannot support.
  const bite = game.eval(`(function(){
    const c = G.clubs.filter(x => x.league === 'L2').sort((a,b) => b.rep - a.rep)[0];
    const saved = G.my; G.my = c.i; G.deals = {};
    const out = {modest: RBSEconomy.scmpPosition(2000).ok, absurd: RBSEconomy.scmpPosition(200000).ok};
    G.my = saved; G.deals = {};
    return out;
  })()`);
  assert.equal(bite.modest, true, 'a sensible signing is allowed');
  assert.equal(bite.absurd, false, 'a wage the turnover cannot carry is refused');
});
