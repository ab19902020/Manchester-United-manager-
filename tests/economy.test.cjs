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
      const owner = RBSEconomy.ownerUnderwrite(nl);
      const ownerCash = RBSEconomy.ownerCash(nl);
      const guarantee = RBSEconomy.guaranteedTurnover(nl);
      const scmp = RBSEconomy.scmpPosition(0);
      const rev = seasonRevenue();
      nl.rep = 1878;                          // reputation drifts over a season
      normaliseReps();                        // the summer that used to overwrite him
      const promoted = (function(){ const was = nl.league; nl.league = 'L2';
        const v = RBSEconomy.chairCeiling(nl); nl.league = was; return v; })();
      out.push({name, wage, budget, owner, ownerCash, guarantee,
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

  // 4. a ceiling above what the club can earn is an owner GUARANTEEING
  //    turnover, which is what makes the ceiling legal under the wage
  //    cap. That guarantee is not the same as cash: paying it into the
  //    bank every month put £22.5M a season into a National League club
  //    that had no use for it and compounded to £410M by season six.
  //    He covers what the club loses, and nothing more.
  const tight = chairmen.find((c) => c.name === 'Tight');
  const generous = chairmen.find((c) => c.name === 'Generous');
  assert.ok(tight.owner > 1e6, 'every chairman is underwriting the wage ceiling he set');
  assert.ok(generous.owner > tight.owner * 2,
    'and the generous one is visibly bankrolling the club harder than the tight one');
  assert.ok(generous.guarantee > generous.revenue,
    'the guaranteed turnover is what the wage ceiling is measured against');
  assert.ok(generous.ownerCash <= generous.owner,
    'the cash he actually wires cannot exceed what he has guaranteed');
  assert.equal(generous.ownerShown, generous.ownerCash,
    'and the accounts show the money that moves, not the guarantee');
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

test('the budget slider moves money both ways and never lies about the wage bill', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const drag = (id, value) => `(function(){
    const i = document.createElement('input');
    i.type = 'range'; i.id = '${id}';
    i.min = '-99999999'; i.max = '99999999';   // a range input clamps to its own bounds
    i.value = String(${value});
    document.body.appendChild(i);
    i.dispatchEvent(new window.Event('change', {bubbles: true}));
    i.remove();
  })()`;

  // 1. a healthy club: money moves out and comes straight back.
  const both = game.eval(`(function(){
    const c = G.clubs[G.my];
    delete c._bud0;
    const b0 = c.budget, w0 = c.wageCap;
    ${drag('budSplit', 250000)};
    const out = {budget: c.budget - b0, cap: c.wageCap - w0};
    ${drag('budSplit', -250000)};
    return {out, back: {budget: c.budget - b0, cap: c.wageCap - w0}};
  })()`);

  assert.equal(both.out.budget, 250000, 'dragging towards transfers adds to the transfer budget');
  assert.ok(both.out.cap < 0, 'and takes it off the wage ceiling');
  assert.equal(both.back.budget, 0, 'dragging back returns the transfer budget exactly');
  assert.equal(both.back.cap, 0, 'and returns the wage ceiling exactly');

  /* 2. The reported save: a wage bill of £106K/w against a £72K/w ceiling.
        The transfers screen used to call that "£183/w wage room left" in
        green while the squad screen called it over budget in red, and the
        slider rendered its neutral handle hard against "more transfers →"
        because nothing could move that way. */
  const broken = game.eval(`(function(){
    const c = G.clubs.filter(x => x.league === 'NL').sort((a,b) => a.rep - b.rep)[0];
    G.my = c.i; G.deals = null;
    c.custom = true; c.rep = 1850; c.cap = 2400;
    c.budget = 12e5; c.wageCap = 72000; c.bank = 6e5;
    c._bud0 = {budget: 12e5, wageCap: 72000};
    const k = 106000 / Math.max(1, squadWage(c));
    c.players.forEach(p => { p.wage = Math.round(p.wage * k); });

    const html = vTransferBudget();
    const b0 = c.budget, w0 = c.wageCap;
    ${drag('budSplit', -5e6)};        // shove everything towards wages
    return {
      bill: squadWage(c), ceiling: w0,
      saysOver: html.indexOf('Over the ceiling') >= 0,
      claimsRoomLeft: html.indexOf('Wage room left') >= 0,
      explains: html.indexOf('no money can move back to transfers') >= 0,
      maxToTransfers: (html.match(/max="(-?\\d+)" value="0"/) || [])[1],
      escaped: {budget: c.budget - b0, cap: c.wageCap - w0},
    };
  })()`);

  assert.ok(broken.bill > broken.ceiling, 'the reproduction really is over the ceiling');
  assert.equal(broken.saysOver, true, 'the panel says you are over the ceiling');
  assert.equal(broken.claimsRoomLeft, false, 'it does not simultaneously claim you have room left');
  assert.equal(broken.explains, true, 'and it explains why nothing can move back to transfers');
  assert.equal(broken.maxToTransfers, '0', 'nothing can be moved into transfers while the bill is over');
  assert.ok(broken.escaped.cap > 0 && broken.escaped.budget < 0,
    'but transfer money can still be poured into the ceiling, which is the way out of the hole');

  // 3. and a loan cannot push the bill over the ceiling in the first place
  const loan = game.eval(`(function(){
    const c = G.clubs[G.my];
    const before = c.players.length;
    const mkt = (typeof loanMarket === 'function' ? loanMarket() : []);
    if (!mkt.length) return 'no market';
    G._loanList = mkt;
    ACTIONS.loanInDo({dataset: {v: '0'}});
    return c.players.length === before ? 'blocked' : 'went through';
  })()`);
  assert.equal(loan, 'blocked', 'a loan may not push the wage bill past the ceiling — that is how it got there');
});

/*
 * Found by tracing every change to a club's bank balance over a season.
 * Start a career at Worthing — National League, £348,000 in the bank — and
 * the club drew £160,300,000 a year in sponsorship: Manchester United's four
 * contracts, verbatim, 202 times what the club could sign.
 *
 * `newGame(key)` — how you pick a club, and how you start one you have built
 * — runs newGame(0) first, so the world is built around Manchester United and
 * ensureCommercial() writes United's deals; only then does it takeOverClub()
 * you into the club you chose. Nothing cleared G.deals, and ensureCommercial
 * only ever fills empty slots.
 */
test('the sponsorship belongs to the club, not to the save', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const united = game.eval(`(function(){
    return {club:G.clubs[G.my].name,div:myDiv(),commercial:Math.round(commercialIncome())};
  })()`);
  assert.equal(united.div, 'PL');
  assert.ok(united.commercial > 5e7, `a Premier League giant should have real sponsorship, got ${united.commercial}`);

  const bottom = game.eval(`(function(){
    const nl=divMembers('NL');
    const key=G.clubs[nl[nl.length-1]].key;
    newGame(key);
    const c=G.clubs[G.my];
    return {club:c.name,div:myDiv(),rep:c.rep,
      commercial:Math.round(commercialIncome()),
      market:Math.round(window.RBSCommercial.marketCommercial())};
  })()`);

  assert.equal(bottom.div, 'NL');
  assert.ok(bottom.commercial < 3e6,
    `a National League club drew ${bottom.commercial} in sponsorship`);
  assert.ok(bottom.commercial <= bottom.market * 2.5,
    'sponsorship must be within reach of what this club could actually sign');
  assert.ok(bottom.commercial > 0, 'but it should still have deals');

  // and moving club rewrites them again rather than carrying them over
  const moved = game.eval(`(function(){
    const before=Math.round(commercialIncome());
    const pl=divMembers('PL').sort((a,b)=>G.clubs[b].rep-G.clubs[a].rep);
    takeOverClub(pl[0]);
    return {before,after:Math.round(commercialIncome()),div:myDiv()};
  })()`);
  assert.equal(moved.div, 'PL');
  assert.ok(moved.after > moved.before * 5,
    `taking a Premier League job should be worth more than ${moved.before}, got ${moved.after}`);
});

/*
 * The same trace showed the other half: the world loop paid every AI club its
 * REVENUE and never took a penny of its costs. After one season the median
 * Premier League club held £442M; by season four the richest club in the world
 * had £2.2 billion. They are paid what they clear now, with a floor so nobody
 * goes bust and a ceiling so nobody becomes a sovereign wealth fund.
 */
test('the rest of the world banks what it earns, and neither goes bust nor hoards', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const snapshot = () => game.eval(`(function(){
    const by={};
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const b=divMembers(d).map(i=>G.clubs[i].bank).sort((x,y)=>x-y);
      by[d]={min:Math.round(b[0]),median:Math.round(b[Math.floor(b.length/2)]),max:Math.round(b[b.length-1])};
    });
    by.negative=G.clubs.filter(c=>c.bank<0).length;
    by.overHoarded=G.clubs.filter(c=>c.i!==G.my&&c.bank>2e9).length;
    return by;
  })()`);

  const before = snapshot();
  assert.equal(before.negative, 0);

  game.eval(`(function(){
    for(let s=0;s<3;s++){
      const start=G.season;let d=0;
      while(G.season===start&&d++<600){
        G.sacked=false;
        if(G.boardCall)G.boardCall=null;
        if(G.pressCtx)G.pressCtx=null;
        const um=fixturesOn(G.day).find(f=>!f.played&&(f.h===G.my||f.a===G.my));
        if(um){quickSim(um);finishDayAfterMatch()}
        else{simRestOfDay();dailyTickCore();G.day++;checkSeasonEnd()}
      }
    }
    return 1;
  })()`);

  const after = snapshot();
  assert.equal(after.negative, 0, 'no club in the world may go bust');
  assert.equal(after.overHoarded, 0, 'no AI club may reach two billion');

  // the pyramid keeps its shape rather than flattening or exploding
  assert.ok(after.PL.median > after.CH.median, 'Premier League above Championship');
  assert.ok(after.CH.median > after.L2.median, 'Championship above League Two');
  assert.ok(after.L2.median > 0 && after.NL.median > 0, 'the bottom stays solvent');
  // and it does not run away: three seasons must not multiply the median tenfold
  assert.ok(after.PL.median < before.PL.median * 6,
    `Premier League median went ${before.PL.median} -> ${after.PL.median}`);
  assert.deepEqual(game.errors, []);
});

/* the Finances screen showed a running-costs line that nothing ever debited —
   about £165M a year at Manchester United, which is where a user's bank
   compounding to £900M over four seasons came from */
test('the running costs on the Finances screen actually leave the account', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const paid = game.eval(`(function(){
    const ops=Math.round(seasonCosts().ops/12);
    const before=G.clubs[G.my].bank;
    monthlyIncome();
    return {ops,moved:G.clubs[G.my].bank-before};
  })()`);

  assert.ok(paid.ops > 0, 'there should be a running-costs line to charge');
  // the month's movement must be income minus that line, not income alone
  const consistent = game.eval(`(function(){
    const my=G.clubs[G.my];
    const ops=Math.round(seasonCosts().ops/12);
    const before=my.bank;
    monthlyIncome();
    const after=my.bank;
    // charge it twice and the second month must move by the same amount
    const first=after-before;
    const b2=my.bank;
    monthlyIncome();
    const second=my.bank-b2;
    return {ops,first,second,gap:Math.abs(first-second)};
  })()`);
  assert.ok(consistent.gap <= Math.max(1000, consistent.ops * 0.05),
    `monthly movement should be steady, got ${consistent.first} then ${consistent.second}`);
});

/*
 * The owner of a club you build underwrites enough turnover for his own wage
 * ceiling to be legal. That guarantee was also being paid into the bank as
 * cash every month — thirteen payments of £1,733,764 on a National League
 * club with the generous chairman, £22.5M a season it had no use for,
 * compounding to £410M by season six. An owner covers what the club loses.
 */
test('a club you build is funded, not showered', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const built = game.eval(`(function(){
    // build the club the way the creator does
    CC.on=true;
    CC.spec.name='Testbed FC';CC.spec.short='Testbed';CC.spec.code='TBD';
    CC.spec.town='Testbed';CC.spec.stadium='The Ground';CC.spec.cap=2400;
    CC.spec.chair='gen';
    CC.pending=true;
    newGame('__CC__');
    const c=G.clubs[G.my];
    return {custom:!!c.custom,div:myDiv()};
  })()`);
  if (!built.custom) return;             // creator path unavailable in this build

  const money = game.eval(`(function(){
    const c=G.clubs[G.my];
    const api=window.RBSEconomy;
    const cover=api.ownerUnderwrite(c);
    const cash=api.ownerCash(c);
    const guarantee=api.guaranteedTurnover(c);
    const rev=api.revenueFor(c);
    const costs=api.costsFor(c,rev);
    return {cover,cash,guarantee,revenue:Math.round(rev.total),costs:Math.round(costs.total),
      wageCap:Math.round(c.wageCap||0),budget:Math.round(c.budget)};
  })()`);

  // the guarantee is real and large — it is what makes the wage ceiling legal
  assert.ok(money.cover > 0, 'a bankrolled club must be underwritten');
  assert.ok(money.guarantee > money.revenue, 'the guarantee must exceed banked turnover');
  // but the cash is only what the club actually loses, never the whole ceiling
  assert.ok(money.cash <= money.cover, 'cash cannot exceed the guarantee');
  const shortfall = Math.max(0, money.costs - money.revenue);
  assert.ok(money.cash <= Math.round(shortfall * 1.2) + 1,
    `owner paid ${money.cash} against a shortfall of ${shortfall}`);
  // and the club still has the money it was promised to spend
  assert.ok(money.budget > 5e6, `the generous chairman should fund a real budget, got ${money.budget}`);

  // over a season the bank must not run away
  const season = game.eval(`(function(){
    const c=G.clubs[G.my];
    const before=Math.round(c.bank);
    const start=G.season;let d=0;
    while(G.season===start&&d++<600){
      G.sacked=false;
      if(G.boardCall)G.boardCall=null;
      if(G.pressCtx)G.pressCtx=null;
      const um=fixturesOn(G.day).find(f=>!f.played&&(f.h===G.my||f.a===G.my));
      if(um){quickSim(um);finishDayAfterMatch()}
      else{simRestOfDay();dailyTickCore();G.day++;checkSeasonEnd()}
    }
    return {before,after:Math.round(c.bank)};
  })()`);
  assert.ok(season.after < season.before * 4,
    `a National League season took the bank from ${season.before} to ${season.after}`);
  assert.ok(season.after > 0, 'and it must not go bust either');
});

/* promotion never touched the sponsorship, so climbing the pyramid earned
   nothing commercially until a contract happened to expire */
test('going up is worth money', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const climbed = game.eval(`(function(){
    // drop into a National League club, then win the division outright
    const nl=divMembers('NL');
    newGame(G.clubs[nl[Math.floor(nl.length/2)]].key);
    const before={div:myDiv(),commercial:Math.round(commercialIncome())};
    const div=myDiv();
    G.fixtures.filter(f=>f.div===div&&(f.h===G.my||f.a===G.my)).forEach(f=>{
      if(f.h===G.my){f.hs=5;f.as=0}else{f.hs=0;f.as=5}
    });
    let d=0;
    while(G.season===1&&d++<600){
      G.sacked=false;
      if(G.boardCall)G.boardCall=null;
      if(G.pressCtx)G.pressCtx=null;
      const um=fixturesOn(G.day).find(f=>!f.played&&(f.h===G.my||f.a===G.my));
      if(um){quickSim(um);finishDayAfterMatch()}
      else{simRestOfDay();dailyTickCore();G.day++;checkSeasonEnd()}
    }
    return {before,after:{div:myDiv(),commercial:Math.round(commercialIncome())},
      honours:(G.honours||[]).map(h=>h.comp)};
  })()`);

  if (climbed.after.div === climbed.before.div) {
    // the blind sim did not go up; the revaluation is still checked directly
    const direct = game.eval(`(function(){
      const before=Math.round(commercialIncome());
      const c=G.clubs[G.my];
      c.league='CH';
      G.deals=null;
      if(typeof ensureCommercial==='function')ensureCommercial();
      return {before,after:Math.round(commercialIncome())};
    })()`);
    assert.ok(direct.after > direct.before * 2,
      `a Championship club should out-earn a National League one, ${direct.before} -> ${direct.after}`);
    return;
  }

  assert.ok(climbed.after.commercial > climbed.before.commercial,
    `promotion left commercial income at ${climbed.after.commercial}`);
});

/*
 * The sponsorship model was linear in reputation and real commercial revenue
 * is nothing like linear — a global brand sells shirts in Asia, a good
 * mid-table side sells them in one town. Measured against published 2023/24
 * figures the top of the Premier League was already right (Arsenal £216M
 * model / £218M real) and everything under it was three to five times too
 * generous (Bournemouth £127M / £24M), giving a top-to-bottom spread of 2.5x
 * against a real 14.3x.
 */
test('commercial income climbs the way it really climbs', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const pl = game.eval(`(function(){
    const saved=G.my, savedDeals=G.deals;
    const out=divMembers('PL').map(i=>{
      G.my=i; G.deals=null;
      if(typeof ensureCommercial==='function')ensureCommercial();
      return {club:G.clubs[i].short,rep:G.clubs[i].rep,com:Math.round(commercialIncome())};
    }).sort((a,b)=>b.com-a.com);
    G.my=saved; G.deals=savedDeals;
    return out;
  })()`);

  const top = pl[0];
  const bottom = pl[pl.length - 1];
  // the giants were right and must stay right
  assert.ok(top.com > 1.7e8 && top.com < 2.6e8,
    `the biggest club should draw around £200M, got £${Math.round(top.com / 1e6)}M`);
  // and the spread should look like the real one rather than flat
  const spread = top.com / bottom.com;
  assert.ok(spread > 8, `top-to-bottom spread is only ${spread.toFixed(1)}x — it was 2.5x and reality is 14.3x`);
  assert.ok(spread < 22, `top-to-bottom spread of ${spread.toFixed(1)}x is steeper than reality`);
  // nobody in the top flight is on non-league money
  assert.ok(bottom.com > 8e6,
    `the smallest Premier League club draws only £${Math.round(bottom.com / 1e6)}M`);
  // it must stay monotonic in reputation
  for (let i = 1; i < pl.length; i += 1) {
    assert.ok(pl[i].com <= pl[i - 1].com + 1, 'a smaller club must not out-earn a bigger one');
  }

  // the curve is a top-flight effect and must not reach into the pyramid,
  // where the lower divisions were measured and calibrated separately
  const lower = game.eval(`(function(){
    const out={};
    ['CH','L1','L2','NL'].forEach(d=>{
      const mem=divMembers(d).slice().sort((a,b)=>G.clubs[b].rep-G.clubs[a].rep);
      const big=RBSEconomy.commercialFor(G.clubs[mem[0]]);
      const small=RBSEconomy.commercialFor(G.clubs[mem[mem.length-1]]);
      out[d]={big:Math.round(big),small:Math.round(small),spread:small>0?big/small:0};
    });
    return out;
  })()`);
  ['CH', 'L1', 'L2', 'NL'].forEach((d) => {
    assert.ok(lower[d].small > 0, `${d} clubs must still have commercial income`);
    assert.ok(lower[d].spread < 6,
      `${d} spread is ${lower[d].spread.toFixed(1)}x — the power law is a top-flight effect`);
  });
});

/*
 * Reported: the pre-season tour feels like it costs you. Measured, it never
 * did — every option pays. But the money went into the club's cash and the
 * transfer budget never moved:
 *
 *     North American tour   bank +£8,400,000   budget +£0
 *     Far East tour         bank +£16,900,000  budget +£0
 *
 * So you fly a squad round America, earn eight million, and have not one extra
 * pound to spend on players. Touring is how a club funds its summer.
 */
test('a pre-season tour funds the summer instead of vanishing into the bank', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const tours = game.eval(`(function(){
    const c=G.clubs[G.my];
    return TOURS.map(t=>{
      G.tour=null;
      const bank0=c.bank, bud0=c.budget;
      const quoted=tourFee(t);
      ACTIONS.tourBook({dataset:{v:t.id}});
      return {id:t.id,quoted:Math.round(quoted),
        bank:Math.round(c.bank-bank0),budget:Math.round(c.budget-bud0),
        fit:t.fit,sharp:t.sharp};
    });
  })()`);

  tours.forEach((r) => {
    // nothing about a tour may ever take money off you
    assert.ok(r.bank >= 0, `${r.id} took ${-r.bank} off the bank`);
    assert.ok(r.budget >= 0, `${r.id} took ${-r.budget} off the transfer budget`);
    // and what it earns has to reach the money you can actually spend
    assert.equal(r.budget, r.bank,
      `${r.id} banked ${r.bank} but moved the transfer budget by ${r.budget}`);
    assert.equal(r.bank, r.quoted, `${r.id} paid ${r.bank} against a quoted ${r.quoted}`);
  });

  const by = {};
  tours.forEach((r) => { by[r.id] = r; });

  // staying at home is a choice, not a punishment: some money, best condition
  assert.ok(by.base.bank > 0, 'two friendlies at your own ground still sell tickets');
  assert.ok(by.base.fit >= 8, 'and it is the best preparation available');

  // the further you go the more it pays and the worse the legs are
  assert.ok(by.usa.bank > by.scan.bank, 'America must out-earn Scandinavia');
  assert.ok(by.scan.bank > by.ire.bank, 'Scandinavia must out-earn Ireland');
  assert.ok(by.ire.bank > by.base.bank, 'and a tour must out-earn staying at home');
  assert.ok(by.asia.bank > by.usa.bank, 'and the Far East is the biggest cheque');
  assert.ok(by.usa.fit < by.iber.fit, 'long-haul travel has to cost condition');
  assert.ok(by.asia.fit < by.usa.fit, 'and the furthest costs the most');
  // the middle is the compromise: real money and the legs hold up
  assert.ok(by.iber.fit >= 8 && by.iber.bank > by.base.bank,
    'the training camp should pay something and still return them fit');
});

/* the old scale had a floor of 0.10 on reputation, so a National League club
   earned £2,000,000 from a North American tour — two and a half times its
   entire annual revenue. Nobody in Los Angeles buys a ticket to watch them. */
test('tour money is sized by who you are', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const levels = game.eval(`(function(){
    const out={};
    const saved=G.my;
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const mem=divMembers(d).slice().sort((a,b)=>G.clubs[b].rep-G.clubs[a].rep);
      const i=mem[Math.floor(mem.length/2)];
      G.my=i;
      const c=G.clubs[i];
      out[d]={club:c.short,rep:c.rep,
        usa:tourFee(TOURS.filter(t=>t.id==='usa')[0]),
        home:tourFee(TOURS.filter(t=>t.id==='base')[0]),
        revenue:Math.round(RBSEconomy.revenueFor(c).total)};
      G.my=saved;
    });
    return out;
  })()`);

  // every level earns something real rather than rounding to nothing
  ['PL', 'CH', 'L1', 'L2', 'NL'].forEach((d) => {
    assert.ok(levels[d].usa > 0, `a ${d} club earns nothing at all from a tour`);
    assert.ok(levels[d].home > 0, `a ${d} club earns nothing from home friendlies`);
  });

  // and the money follows the standing, steeply
  assert.ok(levels.PL.usa > levels.CH.usa * 2, 'a giant must out-earn a Championship club');
  assert.ok(levels.CH.usa > levels.L1.usa, 'and so on down');
  assert.ok(levels.L1.usa > levels.L2.usa);
  assert.ok(levels.L2.usa > levels.NL.usa);

  // nobody below the top flight earns a tour fee that dwarfs their own club
  ['CH', 'L1', 'L2', 'NL'].forEach((d) => {
    assert.ok(levels[d].usa < levels[d].revenue,
      `a ${d} club earns £${Math.round(levels[d].usa / 1e3)}K from one tour against `
      + `£${Math.round(levels[d].revenue / 1e3)}K of annual revenue`);
  });
});
