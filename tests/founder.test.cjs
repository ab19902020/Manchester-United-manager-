const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   FOUND A CLUB ANYWHERE, AND RUN IT
   ---------------------------------------------------------------------
   The builder places a club at the bottom of the chosen country's
   pyramid with money in that league's terms; the job you pick decides
   who makes which decisions; and the Director's Office does what it
   says with the club's money -- including taking points off a club that
   cannot pay its bills.
   ===================================================================== */

function found(game, cc, role, chair) {
  return game.eval(`(function () {
    const F = window.RBSFounder;
    F.state.cc = ${JSON.stringify(cc)}; F.state.foundRole = ${JSON.stringify(role)};
    CC.spec.name = 'Test ' + ${JSON.stringify(cc)} + ' FC'; CC.spec.chair = ${JSON.stringify(chair || 'sen')}; CC.pending = true;
    newGame(0);
    const c = G.clubs[G.my];
    const others = divMembers(c.league).map((i) => G.clubs[i]).filter((x) => x !== c);
    const keys = leaguesOf(${JSON.stringify(cc)});
    return { league: c.league, bottom: keys[keys.length - 1], cc: c.cc, custom: !!c.custom, role: G.role,
      rep: c.rep, minRep: Math.min(...others.map((x) => x.rep)), budget: c.budget,
      topBudget: Math.max(...others.map((x) => x.budget || 0)), players: c.players.length, youth: (c.youth || []).length,
      wealth: G.owner && G.owner.wealth, delegate: JSON.stringify(G.delegate || {}),
      english: G.inbox.some((m) => /National Division/.test(m.body + m.title)) };
  })()`);
}

test('a founded club starts at the bottom of the country you choose, on that league\'s money', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const eng = found(game, 'ENG', 'owner');
  assert.equal(eng.league, 'NL');
  assert.equal(eng.custom, true);

  for (const cc of ['ESP', 'GER', 'NOR']) {
    const r = found(game, cc, 'owner');
    assert.equal(r.league, r.bottom, `${cc}: placed in ${r.league}, not the bottom division ${r.bottom}`);
    assert.equal(r.cc, cc);
    assert.ok(r.rep < r.minRep, `${cc}: a new club should be the smallest in its league (${r.rep} vs ${r.minRep})`);
    assert.ok(r.budget <= r.topBudget * 1.4, `${cc}: a sensible backer gave ${r.budget}, the richest rival has ${r.topBudget}`);
    assert.ok(r.budget >= r.topBudget * 0.5, `${cc}: the budget ${r.budget} is not in this league's terms`);
    assert.equal(r.players, 0, 'a new club starts with no senior squad');
    assert.ok(r.youth >= 10, 'but with an academy');
    assert.equal(r.english, false, `${cc}: the welcome still talks about the English fifth tier`);
  }
});

test('the job you choose decides who does what', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const chair = found(game, 'ENG', 'chairman');
  assert.equal(chair.role, 'chairman');
  assert.deepEqual(JSON.parse(chair.delegate), { lineup: true, press: true, training: true },
    'a chairman\'s manager runs the team');
  assert.ok(chair.wealth > 0, 'an owner has money of his own');

  const run = game.eval(`(function () {
    const F = window.RBSFounder;
    /* an owner cannot be sacked */
    sackManager();
    const ownerSacked = G.sacked;
    const deal = myDeal(); deal.left = 0; dailyTickCore();
    /* a manager can */
    F.setUpRole('manager', false);
    const budget0 = G.clubs[G.my].budget;
    sackManager();
    /* the owners' rule must step aside for a manager: the sacking goes to the
       board's own rules, and the backers' penalty is not applied */
    const managerSacked = G.clubs[G.my].budget === budget0
      && !G.inbox.slice(0, 3).some((m) => /backers have lost faith/.test(m.title));
    G.sacked = false;
    /* a head coach cannot bid; his director of football signs instead */
    F.setUpRole('coach', false);
    const c = G.clubs[G.my];
    let blocked = false;
    const t0 = document.getElementById('toast');
    ACTIONS.submitBid({ dataset: {} });
    blocked = /director of football/.test(t0 ? t0.textContent : '');
    c.players = c.players.length ? c.players : [];
    return { ownerSacked, contract: myDeal().left, managerSacked, blocked, role: G.role };
  })()`);
  assert.equal(run.ownerSacked, false, 'an owner was sacked');
  assert.ok(run.contract >= 3, 'an owner\'s contract ran out');
  assert.equal(run.managerSacked, true, 'the owners\' rule was applied to a manager');
  assert.equal(run.blocked, true, 'a head coach was allowed to bid');
});

test('the director of football signs the weakest position inside the budget', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Coach Test');

  const run = game.eval(`(function () {
    const F = window.RBSFounder;
    F.setUpRole('coach', false);
    const c = G.clubs[G.my];
    c.budget = 4e7; c.bank = 4e7;
    c.wageCap = c.players.reduce((s, p) => s + p.wage, 0) + 4e5;
    G.dof.want = 'GK';
    const before = c.players.length, budget = c.budget;
    const p = F.dofTick();
    return { name: p && p.name, pos: p && p.pos, club: p && p.club, my: G.my, n: [before, c.players.length],
      spent: budget - c.budget, open: windowOpen() };
  })()`);
  assert.equal(run.open, true, 'the test assumes the summer window');
  assert.ok(run.name, 'he signed nobody');
  assert.equal(run.pos, 'GK', 'he ignored what the coach asked for');
  assert.equal(run.club, run.my);
  assert.equal(run.n[1], run.n[0] + 1);
  assert.ok(run.spent > 0 && run.spent <= 4e7);
});

test('the office: loans are repaid weekly, tickets trade crowd for price, and insolvency costs points', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Owner Test');

  const run = game.eval(`(function () {
    const O = window.RBSOffice, F = window.RBSFounder;
    F.setUpRole('owner', false);
    const c = G.clubs[G.my];
    const limit = O.creditLimit();
    const bank0 = c.bank, budget0 = c.budget;
    const amount = Math.round(limit * 0.2);
    const loan = O.borrow(amount, 5, true);
    const tooMuch = O.borrow(limit * 10, 5, true).ok;
    const afterBorrow = { bank: c.bank - bank0, budget: c.budget - budget0 };
    const owed = O.debt();
    const b1 = c.bank; O.week();
    const paid = b1 - c.bank;
    const repaid = O.repay(Math.round(O.debt() / 2));
    /* prices */
    const cheap = O.gateAt(-0.3), going = O.gateAt(0), dear = O.gateAt(0.5);
    /* own money */
    const w0 = G.owner.wealth; const inv = O.invest(5e5, true);
    /* insolvency: play some football first so there are points to lose */
    G.fixtures.filter((f) => f.div === c.league && (f.h === G.my || f.a === G.my)).slice(0, 6)
      .forEach((f) => { f.played = true; f.hs = f.h === G.my ? 2 : 0; f.as = f.h === G.my ? 0 : 2; });
    G.day += 1;
    const ptsBefore = tableRows(c.league).find((r) => r.i === G.my).pts;
    c.bank = -O.overdraft() * 3;
    for (let i = 0; i < 6; i += 1) O.week();
    const ptsAfter = tableRows(c.league).find((r) => r.i === G.my).pts;
    const ptsAgain = tableRows(c.league).find((r) => r.i === G.my).pts;
    const lend = O.borrow(1000, 3, true).ok;
    return { loanOk: loan.ok, weekly: loan.weekly, tooMuch, afterBorrow, amount, owed, paid,
      repaid: repaid.ok, debtLeft: O.debt(), cheap, going, dear, cap: c.cap,
      invested: inv.ok, wealthDrop: w0 - G.owner.wealth,
      admin: !!G.owner.admin, embargo: G.owner.embargo === G.season, deduct: G.owner.deduct, ptsBefore, ptsAfter, ptsAgain, lend };
  })()`);

  assert.equal(run.loanOk, true);
  assert.equal(run.tooMuch, false, 'the bank lent ten times its limit');
  assert.equal(run.afterBorrow.bank, run.amount);
  assert.equal(run.afterBorrow.budget, run.amount, 'borrowed money did not reach the transfer budget');
  assert.ok(run.owed > run.amount, 'a loan should cost more than it lends');
  assert.equal(run.paid, run.weekly, 'the weekly repayment did not leave the bank');
  assert.equal(run.repaid, true);
  assert.ok(run.cheap.crowd >= run.going.crowd && run.going.crowd >= run.dear.crowd, 'a dearer ticket should draw fewer');
  assert.ok(run.dear.head > run.going.head && run.cheap.head < run.going.head);
  assert.ok(run.cheap.crowd <= run.cap, 'more people than the ground holds');
  assert.equal(run.invested, true);
  assert.equal(run.wealthDrop, 5e5);
  assert.equal(run.admin, true, 'six weeks beyond the overdraft did not mean administration');
  assert.equal(run.embargo, true);
  assert.equal(run.deduct, 12);
  assert.ok(run.ptsBefore >= 12, `the test needs points to lose, had ${run.ptsBefore}`);
  assert.equal(run.ptsAfter, run.ptsBefore - 12, 'the deduction is not in the table');
  assert.equal(run.ptsAgain, run.ptsAfter, 'the deduction was applied twice');
  assert.equal(run.lend, false, 'a bank lent to a club in administration');
});
