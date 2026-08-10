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

test('the chairman you picked when you built the club is the chairman you keep', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const chairmen = game.eval(`(function(){
    // read from the chairmen the game actually offers, not from a copy
    const setups = CC_CHAIRS.map(ch => [ch.name, ch.wage, ch.budget]);
    const out = [];
    setups.forEach(([name, wage, budget]) => {
      const nl = G.clubs.filter(c => c.league === 'NL').sort((a,b) => a.rep - b.rep)[0];
      const saved = G.my;
      G.my = nl.i; G.deals = {};
      nl.custom = true; nl.rep = 1850; nl.cap = 2400;
      nl.wageCap = wage; nl.budget = budget; nl.bank = Math.round(budget * 0.8);
      ['chairMult','chairCap0','chairBudMult','chairBud0','chairCapAdd','chairBudAdd','scmpBase','scmpSeason'].forEach(k => { delete nl[k]; });
      dailyTickCore();                       // day one: the chairman is anchored
      const owner = RBSEconomy.ownerFunding(nl);
      const scmp = RBSEconomy.scmpPosition(0);
      const rev = seasonRevenue();
      nl.rep = 1878;                          // reputation drifts over a season
      normaliseReps();                        // the summer that used to overwrite him
      const promoted = (function(){ const was = nl.league; nl.league = 'L2';
        const v = RBSEconomy.chairCeiling(nl); nl.league = was; return v; })();
      out.push({name, wage, budget, owner,
        capAfterSummer: nl.wageCap, budgetAfterSummer: nl.budget,
        ceilingInL2: promoted, revenue: rev.total, ownerShown: rev.owner || 0,
        scmpOk: scmp ? scmp.ok : null,
        profit: rev.total - seasonCosts().total});
      delete nl.custom; G.my = saved; G.deals = {};
    });
    return out;
  })()`);

  chairmen.forEach((c) => {
    // 1. the summer no longer overwrites him. This used to become
    //    £169,020 - rep x 90 - whichever chairman you picked.
    assert.equal(c.capAfterSummer, c.wage,
      `${c.name}: the wage ceiling was ${c.capAfterSummer}, the chairman set ${c.wage}`);
    assert.ok(c.budgetAfterSummer >= c.budget,
      `${c.name}: the transfer budget fell from £${c.budget} to £${c.budgetAfterSummer} over one summer`);

    // 2. but it grows with the club, so he does not freeze you either.
    assert.ok(c.ceilingInL2 > c.wage,
      `${c.name}: promotion to League Two should lift the ceiling above £${c.wage}`);

    // 3. and nobody is insolvent or embargoed on day one.
    assert.ok(c.profit > 0, `${c.name}: a built club should not be losing money before it has played`);
    assert.equal(c.scmpOk, true, `${c.name}: a built club should not start over the wage cap`);
  });

  // 4. a ceiling above what the club can earn is an owner writing
  //    cheques, and it is shown as that rather than appearing from
  //    nowhere. The tight chairman is not putting money in - that is
  //    the entire point of picking him.
  const tight = chairmen.find((c) => c.name === 'Tight');
  const generous = chairmen.find((c) => c.name === 'Generous');
  assert.ok(tight.owner > 1e6, 'every chairman is underwriting the wage ceiling he set');
  assert.ok(generous.owner > tight.owner * 2,
    'and the generous one is visibly bankrolling the club harder than the tight one');
  assert.equal(generous.ownerShown, generous.owner, 'it appears in the accounts as owner funding');
  assert.ok(generous.revenue > tight.revenue, 'so his club turns over more');
});

test('a club you build can actually climb out of the division it starts in', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const climb = game.eval(`(function(){
    // what each division is, measured from the squads in it
    const standard = (div) => {
      let n = 0, s = 0;
      (divMembers(div) || []).forEach(i => (G.clubs[i].players || []).forEach(p => { if (!p.loan) { s += p.ovr; n += 1; } }));
      return n ? s / n : 0;
    };
    const fa = (typeof faList === 'function' ? faList() : (G.freeAgents || [])).filter(Boolean);
    // the best twenty players a given weekly ceiling can actually pay for
    const squadFor = (ceiling) => {
      const per = ceiling / 20;
      const top = fa.filter(p => (p.askWage || 1000) <= per).sort((a, b) => b.ovr - a.ovr).slice(0, 20);
      return top.length ? top.reduce((s, p) => s + p.ovr, 0) / top.length : 0;
    };
    return {
      NL: standard('NL'), L2: standard('L2'), L1: standard('L1'), CH: standard('CH'),
      chairmen: CC_CHAIRS.map(ch => ({name: ch.name, wage: ch.wage, budget: ch.budget, squad: squadFor(ch.wage)})),
      l1Budget: Math.round((divMembers('L1') || []).reduce((a, i) => a + (G.clubs[i].budget || 0), 0) / Math.max(1, (divMembers('L1') || []).length)),
    };
  })()`);

  const tightest = climb.chairmen.reduce((a, b) => (a.wage <= b.wage ? a : b));

  // the point of the whole thing: even the smallest chairman fields a side
  // that is better than the division it has been dropped into, by enough
  // that going up is a plan rather than a coin toss.
  assert.ok(tightest.squad > climb.NL + 6,
    `the tightest chairman builds a ${tightest.squad.toFixed(1)} squad for a ${climb.NL.toFixed(1)} division — that is not a promotion push`);
  assert.ok(tightest.squad > climb.L2 + 2,
    `and it should still be ahead of League Two (${climb.L2.toFixed(1)}) so the second promotion follows`);

  // "a budget of a League One club" — the brief, checked against League One
  assert.ok(tightest.budget >= climb.l1Budget * 0.9,
    `the smallest built-club budget (£${tightest.budget}) should be League One money (£${climb.l1Budget})`);

  // and the most generous should be able to look at the Championship
  const richest = climb.chairmen.reduce((a, b) => (a.wage >= b.wage ? a : b));
  assert.ok(richest.squad > climb.L1,
    `the most generous chairman should out-build League One (${climb.L1.toFixed(1)}), got ${richest.squad.toFixed(1)}`);
});

test('a transfer is paid for the way transfers are actually paid for', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  // small fees are settled on the day; big ones are structured
  const terms = game.eval(`([5e4, 2e5, 4e5, 6e6, 3e7].map(f => RBSEconomy.instalmentYears(f)))`);
  assert.equal(Array.from(terms).join(','), '1,1,2,3,4',
    'a non-league fee is cash, a club record is spread across the contract');

  // an agent takes a cut of the deal, or a fee if there is no deal to cut
  const agents = game.eval(`({big: RBSEconomy.agentFee(2e7, 150000), small: RBSEconomy.agentFee(5e5, 8000), free: RBSEconomy.agentFee(0, 1500)})`);
  assert.equal(agents.big, 2e6, 'about ten per cent of the fee');
  assert.ok(agents.free > 0, 'a free transfer is not free — the agent still gets paid');

  const deal = game.eval(`(function(){
    const my = G.clubs[G.my];
    const target = G.clubs.find(c => c.i !== G.my && c.league === 'PL').players.filter(p => p.ovr >= 75)[0];
    const fee = 3e7;
    const b0 = {budget: my.budget, bank: my.bank};
    completeSigning(target, fee, {wage: 120000, len: 4, signOn: 0, bonus: 0, clause: 0});
    const bought = {paidNow: b0.budget - my.budget, cashOut: b0.bank - my.bank, owed: RBSEconomy.outstanding()};

    // sell him on at a profit, with a sell-on clause in the original deal
    target.sellOn = {club: 1, pct: 20, paid: fee};
    const buyer = G.clubs.find(c => c.i !== G.my && c.league === 'PL' && c.i !== 1);
    const oid = 'regress' + Math.random().toString(36).slice(2);
    G.pendingOffers.push({id: oid, pid: target.id, buyer: buyer.i, fee: 5e7, expires: G.day + 5, stage: 0});
    const s0 = {budget: my.budget};
    const owner0 = G.clubs[1].bank;
    ACTIONS.offerAccept({dataset: {arg: oid}});
    const sold = {gainedNow: my.budget - s0.budget, due: RBSEconomy.receivable(),
                  sellOnPaid: G.clubs[1].bank - owner0};

    const beforeSummer = {owed: RBSEconomy.outstanding(), due: RBSEconomy.receivable()};
    endSeason();
    return {bought, sold, beforeSummer,
            afterSummer: {owed: RBSEconomy.outstanding(), due: RBSEconomy.receivable()}};
  })()`);

  // £30M over four years: a quarter leaves the budget now, the rest is owed
  assert.equal(deal.bought.paidNow, 75e5, 'a quarter of a four-year deal leaves the transfer budget on the day');
  assert.equal(deal.bought.owed, 225e5, 'and three quarters of it is owed');
  assert.ok(deal.bought.cashOut > deal.bought.paidNow,
    'more cash than budget leaves the club, because the agent is paid out of cash');

  // 20% of the £20M profit goes back to the club he was bought from
  assert.equal(deal.sold.sellOnPaid, 4e6, 'the sell-on clause is honoured on the profit, not the fee');
  assert.ok(deal.sold.due > 0, 'and the buyer pays you in instalments too');

  // and the summer settles one year of each
  assert.ok(deal.afterSummer.owed < deal.beforeSummer.owed, 'an instalment goes out every summer');
  assert.ok(deal.afterSummer.due < deal.beforeSummer.due, 'and one comes in');
});
