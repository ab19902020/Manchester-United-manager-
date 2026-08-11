const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Winning things has to pay, and the money has to be spendable.
 *
 * These are written against the shape of the reward rather than the
 * constants behind it: a win beats a draw beats a defeat, a later round
 * beats an earlier one, first in the league beats last, and every penny
 * that reaches the bank also reaches the transfer budget. Re-tuning the
 * figures leaves them green; paying nothing for a European night, or
 * paying into an account the manager cannot spend from, does not.
 */

test('every match of the European league phase pays, and the table pays again on top', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const me = G.clubs[G.my];
    const cup = G.cups && G.cups.CL;
    if (!cup || (cup.teams||[]).indexOf(G.my) < 0) return {skipped: true};
    const mine = cup.ties.filter(t=>t.lg && (t.h===G.my||t.a===G.my)).sort((a,b)=>a.day-b.day);
    const rows = [];
    let bank = me.bank, budget = me.budget;
    mine.forEach((t, ix) => {
      const home = t.h === G.my;
      const outcome = ix % 3 === 0 ? 'W' : ix % 3 === 1 ? 'D' : 'L';
      t.played = true;
      if (outcome === 'W') { t.hs = home ? 3 : 0; t.as = home ? 0 : 3; }
      else if (outcome === 'D') { t.hs = 1; t.as = 1; }
      else { t.hs = home ? 0 : 2; t.as = home ? 2 : 0; }
      progressCups();
      rows.push({outcome, bank: Math.round(me.bank - bank), budget: Math.round(me.budget - budget)});
      bank = me.bank; budget = me.budget;
    });
    const before = seasonRevenue();
    cup.ties.filter(t=>t.lg && !t.played).forEach(t=>{ t.played = true; t.hs = 1; t.as = 1; });
    progressCups();
    const close = {bank: Math.round(me.bank - bank), budget: Math.round(me.budget - budget)};
    const table = euroTable('CL');
    const after = seasonRevenue();
    return {rows, close, size: table.length,
      accounts: {before: before.total, after: after.total, tv: after.tv - before.tv},
      earned: window.RBSPrizeMoney.earnedThisSeason(),
      rank: table.findIndex(r=>r.i===G.my) + 1,
      fees: window.RBSPrizeMoney.feesFor('CL'),
      letter: (G.inbox||[]).some(m => m && /league phase draw/i.test(m.title||'')
        && /What it pays/.test(m.body||''))};
  })()`);

  assert.ok(!run.skipped, 'the probe career should be in the Champions League');

  const wins = run.rows.filter((r) => r.outcome === 'W');
  const draws = run.rows.filter((r) => r.outcome === 'D');
  const losses = run.rows.filter((r) => r.outcome === 'L');
  assert.ok(wins.length && draws.length && losses.length, 'the run should contain all three results');

  // 1. a win pays, a draw pays less, a defeat pays nothing
  assert.ok(wins.every((r) => r.bank === run.fees.win),
    `a Champions League win should pay ${run.fees.win}, saw ${wins.map((r) => r.bank).join('/')}`);
  assert.ok(draws.every((r) => r.bank === run.fees.draw),
    `a draw should pay ${run.fees.draw}, saw ${draws.map((r) => r.bank).join('/')}`);
  assert.ok(run.fees.draw > 0 && run.fees.draw < run.fees.win,
    'a draw should be worth something, and less than a win');
  assert.ok(losses.every((r) => r.bank === 0), 'a defeat should pay nothing');

  // 2. all of it is spendable
  run.rows.forEach((r) => assert.equal(r.budget, r.bank,
    'European prize money should reach the transfer budget as well as the bank'));

  // 3. where you finish in the table of thirty-six pays as well
  assert.ok(run.rank >= 1 && run.rank <= run.size, 'the club should appear in the league phase table');
  const shares = run.size - run.rank + 1;
  assert.ok(run.close.bank >= run.fees.rank * shares,
    `finishing ${run.rank} of ${run.size} should pay at least ${shares} ranking shares`);
  assert.equal(run.close.budget, run.close.bank,
    'the ranking money should reach the budget too');

  // 4. and the manager is told what the competition is worth
  assert.ok(run.letter, 'the league phase draw letter should say what the competition pays');

  // 5. the accounts admit the money happened. A club that has won £30M in
  //    Europe should not report the same revenue as one that never qualified.
  const wonInEurope = run.rows.reduce((n, r) => n + r.bank, 0) + run.close.bank;
  assert.ok(run.earned >= wonInEurope,
    `the season's prize total (${run.earned}) should cover everything paid (${wonInEurope})`);
  assert.equal(run.accounts.tv, run.close.bank,
    'closing the league phase should move the broadcast line by what it paid');
  assert.ok(run.accounts.after > run.accounts.before,
    'European prize money should show up in the season revenue');
});

test('a cup pays more for every round you survive, and it reaches the transfer budget', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const me = G.clubs[G.my];
    const out = {};
    ['LC','FA'].forEach(k => {
      const cup = G.cups && G.cups[k];
      if (!cup) return;
      const rows = [];
      let bank = me.bank, budget = me.budget;
      for (let step = 0; step < 14 && cup.winner == null; step++) {
        const due = (cup.ties||[]).filter(t => !t.played);
        if (!due.length) break;
        due.forEach(t => { try { resolveTie(t); } catch (e) { t.played = true; t.hs = 1; t.as = 0; } });
        (cup.ties||[]).filter(t => t.h===G.my || t.a===G.my).forEach(t => {
          if (t.h===G.my) { t.hs = 3; t.as = 0; } else { t.hs = 0; t.as = 3; }
        });
        const r = cup.stage;
        progressCups();
        const db = Math.round(me.bank - bank), dg = Math.round(me.budget - budget);
        if (db || dg) rows.push({round: r, bank: db, budget: dg});
        bank = me.bank; budget = me.budget;
      }
      out[k] = {rows, won: cup.winner === G.my};
    });
    return out;
  })()`);

  ['LC', 'FA'].forEach((k) => {
    const cup = run[k];
    assert.ok(cup && cup.rows.length >= 3, `${k}: winning every tie should pay in at least three rounds`);
    assert.ok(cup.won, `${k}: a club winning every tie should end up holding the cup`);
    cup.rows.forEach((r) => assert.equal(r.budget, r.bank,
      `${k}: round ${r.round} paid ${r.bank} into the bank but ${r.budget} onto the budget`));
    for (let i = 1; i < cup.rows.length; i += 1) {
      assert.ok(cup.rows[i].bank >= cup.rows[i - 1].bank,
        `${k}: round ${cup.rows[i].round} paid ${cup.rows[i].bank}, less than the round before it`);
    }
    const last = cup.rows[cup.rows.length - 1];
    assert.ok(last.bank >= cup.rows[0].bank * 4,
      `${k}: lifting the trophy should be worth several times a first-round win`);
  });
});

test('the league pays for the place you finish in, all the way down the pyramid', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const ladders = game.eval(`(function(){
    const api = window.RBSEconomy || {};
    const out = {};
    ['PL','CH','L1','L2','NL'].forEach(d => {
      const list = G.clubs.filter(c => c.league === d);
      if (!list.length || !api.meritFor) return;
      const c = list[0], n = list.length;
      out[d] = {size: n, pay: []};
      for (let p = 1; p <= n; p += 1) out[d].pay.push(Math.round(api.meritFor(c, p)));
    });
    return out;
  })()`);

  const divs = Object.keys(ladders);
  assert.ok(divs.length >= 5, 'every English division should have a merit ladder');

  divs.forEach((d) => {
    const { pay, size } = ladders[d];
    assert.equal(pay.length, size, `${d}: every place should have a payment`);
    for (let i = 1; i < pay.length; i += 1) {
      assert.ok(pay[i] < pay[i - 1],
        `${d}: finishing ${i + 1} should pay less than finishing ${i}`);
    }
    assert.ok(pay[pay.length - 1] > 0, `${d}: finishing last should still pay something`);
    assert.ok(pay[0] >= pay[pay.length - 1] * 5,
      `${d}: winning the division should be worth several times finishing last ` +
      `(${pay[0]} vs ${pay[pay.length - 1]})`);
  });

  // the pyramid holds: a Premier League place is worth far more than a
  // Championship one, and so on down
  const order = ['PL', 'CH', 'L1', 'L2', 'NL'].filter((d) => ladders[d]);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(ladders[order[i - 1]].pay[0] > ladders[order[i]].pay[0],
      `winning ${order[i - 1]} should pay more than winning ${order[i]}`);
  }
});
