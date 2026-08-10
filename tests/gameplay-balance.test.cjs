const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * These cover the six away-from-the-pitch defects fixed in
 * src/gameplay-balance.js. Each one is written as the thing a player
 * would notice rather than as the line of code that was wrong, so it
 * still means something if the implementation moves.
 */
test('cards are served, loans are affordable and squad unrest cannot loop', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  /* --------------------------------------------------------------
     A red card costs the next match, not the one it was shown in.
     -------------------------------------------------------------- */
  const bans = game.eval(`(function(){
    const c = G.clubs[G.my];
    const p = c.players[7];
    const matchDays = [];
    for (let d = G.day; d < G.day + 260 && matchDays.length < 2; d++) {
      if (fixturesOn(d).some(x => x.h === G.my || x.a === G.my)) matchDays.push(d);
    }
    const out = {};
    G.day = matchDays[0];
    fixturesOn(G.day).forEach(f => { f.played = true; });
    p.susp = 2; p.suspDay = G.day;              // sent off in today's match
    afterRound(G.day);   out.afterRound = p.susp;
    simRestOfDay();      out.afterRestOfDay = p.susp;
    dailyTickCore();     out.afterDayEnds = p.susp;
    G.day = matchDays[1];
    fixturesOn(G.day).forEach(f => { f.played = true; });
    dailyTickCore();     out.afterNextMatch = p.susp;
    dailyTickCore();     out.servedOncePerDay = p.susp;
    return out;
  })()`);

  assert.equal(bans.afterRound, 2, 'the match he was sent off in must not serve the ban');
  assert.equal(bans.afterRestOfDay, 2, 'the rest of the round must not serve it either');
  assert.equal(bans.afterDayEnds, 2, 'nor the end of that day');
  assert.equal(bans.afterNextMatch, 1, 'the next match his club plays serves one of the two');
  assert.equal(bans.servedOncePerDay, 1, 'and it is served once per match, not once per call');

  /* --------------------------------------------------------------
     A National League club can shop in the loan market.
     -------------------------------------------------------------- */
  const loans = game.eval(`(function(){
    const nl = G.clubs.filter(c => c.league === 'NL').sort((a,b) => a.rep - b.rep)[0];
    G.my = nl.i;
    // the tightest of the three chairmen a built club can have
    nl.budget = 150000; nl.bank = 120000; nl.wageCap = 22000; nl.rep = 1850;
    const market = loanMarket() || [];
    return {
      count: market.length,
      max: market.reduce((m, x) => Math.max(m, x.fee), 0),
      free: market.filter(x => x.fee === 0).length,
      viaLoanTerms: market.slice(0, 8).map(x => loanTerms(x.p).fee),
      budget: nl.budget,
    };
  })()`);

  assert.ok(loans.count > 0, 'there has to be a loan market to shop in');
  assert.ok(loans.max <= loans.budget * 0.2,
    `no single loan should cost a fifth of a National League budget (worst was £${loans.max})`);
  assert.ok(loans.free > 0, 'some loans below the Football League carry no fee at all');
  loans.viaLoanTerms.forEach((fee) => {
    assert.ok(fee <= loans.budget * 0.2,
      `the ask-about-any-player route quoted £${fee} against a £${loans.budget} budget`);
  });

  /* --------------------------------------------------------------
     A goal bonus is priced for the division you are in.
     -------------------------------------------------------------- */
  const bonus = game.eval('({nonLeague: RBSBalance.goalBonusFor(1053), premier: RBSBalance.goalBonusFor(205000)})');
  assert.ok(bonus.nonLeague >= 20 && bonus.nonLeague <= 100,
    `a non-league goal bonus should be tens of pounds, got £${bonus.nonLeague}`);
  assert.ok(bonus.premier >= 4000, `a Premier League goal bonus should be thousands, got £${bonus.premier}`);

  /* --------------------------------------------------------------
     The transfer news is about the league you manage in.
     -------------------------------------------------------------- */
  const news = game.eval(`(function(){
    const near = RBSBalance.localDivisions();
    const stories = [];
    for (let i = 0; i < 40; i++) {
      const s = rumourMill();
      if (s) stories.push({from: G.clubs[s.p.club].league, to: s.to.league});
    }
    return {near, stories};
  })()`);

  // joined rather than deep-equalled: the array comes out of the JSDOM realm
  assert.equal(Array.from(news.near).join(','), 'L2,NL',
    'a National League club reads about League Two and its own division');
  assert.ok(news.stories.length > 0, 'the rumour mill has to produce something');
  const local = news.stories.filter((s) => news.near.includes(s.from) && news.near.includes(s.to)).length;
  assert.ok(local / news.stories.length >= 0.5,
    `most transfer stories should be from your own corner of the game, got ${local}/${news.stories.length}`);
});

test('a wage rise is funded, and a player asking for minutes cannot hold up the season', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  game.eval(`(function(){
    let guard = 0;
    while (gamesPlayed(G.my) < 12 && guard++ < 400) {
      const um = fixturesOn(G.day).find(f => !f.played && (f.h === G.my || f.a === G.my));
      if (um) { quickSim(um); finishDayAfterMatch(); }
      else { simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd(); }
    }
  })()`);

  /* --------------------------------------------------------------
     Squad unrest is a conversation in the inbox, not a toll gate.
     -------------------------------------------------------------- */
  const unrest = game.eval(`(function(){
    const c = G.clubs[G.my];
    const victim = c.players.filter(p => !p.injury && !p.youth && !p.loan)
      .sort((a, b) => (a.stats.apps || 0) - (b.stats.apps || 0))[0];
    victim.joined = 0; victim.morale = 30; victim.unrestDay = -9999; delete victim.role;
    G.unrestDay = -9999;
    G.inbox = G.inbox.filter(m => !m.unrest);
    weeklyTraining();
    const m = G.inbox.find(x => x.unrest);
    if (!m) return {raised: false};
    const out = {
      raised: true,
      blocking: blockingMails().some(b => b.id === m.id),
      options: m.actions.length,
      hasHonestOption: m.actions.some(a => String(a.arg).indexOf('honest:') === 0),
      roleBefore: roleOf(victim),
    };
    const promise = m.actions.find(a => String(a.arg).indexOf('promise:') === 0);
    ACTIONS.unrestTalk({dataset: {arg: promise.arg, mid: m.id}});
    out.roleAfter = roleOf(victim);
    out.promiseRecorded = !!victim.promise;
    out.mailClosed = !(G.inbox.find(x => x.id === m.id) || {}).actions;
    // four more weeks must not produce four more demands
    for (let i = 0; i < 4; i++) weeklyTraining();
    out.openAfterAMonth = G.inbox.filter(x => x.unrest && x.actions && x.actions.length).length;
    out.legacyRoleMails = G.inbox.filter(x => x.actions && x.actions.some(a => a.act === 'roleTalk')).length;
    return out;
  })()`);

  assert.equal(unrest.raised, true, 'an unhappy fringe player should still come and see you');
  assert.equal(unrest.blocking, false, 'but it must never sit in front of the Continue button');
  assert.equal(unrest.options, 3, 'promise, be honest, or tell him to earn it');
  assert.equal(unrest.hasHonestOption, true, 'you can tell him what he actually is here');
  assert.notEqual(unrest.roleAfter, unrest.roleBefore, 'promising minutes changes his role, not just his mood');
  assert.equal(unrest.promiseRecorded, true, 'and you can be held to it');
  assert.equal(unrest.mailClosed, true, 'answering closes the message');
  assert.ok(unrest.openAfterAMonth <= 1, 'a month of Mondays cannot queue up a month of demands');
  assert.equal(unrest.legacyRoleMails, 0, 'the old blocking version is never raised again');

  /* --------------------------------------------------------------
     Ten grand a week more comes out of the transfer budget.
     -------------------------------------------------------------- */
  const money = game.eval(`(function(){
    const c = G.clubs[G.my];
    const p = c.players.find(x => !x.youth && !x.loan);
    const wage0 = p.wage, budget0 = c.budget;
    openContractSheet(p, {fee: 0, renew: true});
    const shown = !!document.getElementById('renewFund');
    document.getElementById('tWage').value = String(wage0 + 10000);
    document.getElementById('tLen').value = '3';
    ACTIONS.submitTerms();
    const funded = {shown, rise: p.wage - wage0, charged: budget0 - c.budget};

    const q = c.players.filter(x => !x.youth && !x.loan)[1];
    c.budget = 1000;
    const qWage = q.wage, qBudget = c.budget;
    openContractSheet(q, {fee: 0, renew: true});
    document.getElementById('tWage').value = String(qWage + 50000);
    ACTIONS.submitTerms();
    funded.refusedWage = q.wage === qWage;
    funded.refusedBudget = c.budget === qBudget;
    return funded;
  })()`);

  assert.equal(money.shown, true, 'the sheet says what the rise will cost before you offer it');
  assert.equal(money.rise, 10000, 'the renewal went through');
  assert.equal(money.charged, 10000 * 52, 'a year of the rise leaves the transfer budget');
  assert.equal(money.refusedWage, true, 'a rise the budget cannot fund is refused');
  assert.equal(money.refusedBudget, true, 'and refusing it costs nothing');

  /* --------------------------------------------------------------
     The inbox is worth opening.
     -------------------------------------------------------------- */
  const inbox = game.eval(`(function(){
    closeModal(); UI.mailView = null; UI.mailArchive = false;
    ACTIONS.mailbox();
    const all = document.getElementById('sheetBody').innerHTML;
    ACTIONS.mailFilter({dataset: {v: 'transfer'}});
    const filtered = mailList();
    return {
      tabs: (all.match(/data-action="mailFilter"/g) || []).length,
      previews: all.indexOf('color:var(--ink-dim)') >= 0,
      transferTabIsTransfersOnly: filtered.every(m => m.type === 'transfer' || m.type === 'contract'),
    };
  })()`);

  assert.equal(inbox.tabs, 6, 'the tray is filtered by what the message is about');
  assert.equal(inbox.previews, true, 'and every row shows a line of the message itself');
  assert.equal(inbox.transferTabIsTransfersOnly, true, 'a filter that does not filter is worse than none');
});
