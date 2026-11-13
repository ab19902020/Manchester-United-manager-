const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer, waitFor } = require('./game-harness.cjs');

/* =====================================================================
   WHEN IT IS YOUR CLUB, AND WHEN THE SAVE IS OLD
   ---------------------------------------------------------------------
   An owner's board speaks as investors; a chairman's matches play
   themselves unless he asks to watch; and a save from before the world
   was invented is brought into it on load. The old-save test builds its
   "old" save from a new one by giving the clubs other names and taking
   the mark off -- the real names an actual old save carries are exactly
   what this repository must not contain.
   ===================================================================== */

test('an owner\'s board speaks as investors, and a manager\'s does not', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Owner Words');

  const run = game.eval(`(function () {
    const F = window.RBSFounder;
    F.setUpRole('owner', false);
    mail('board', 'Board losing patience', 'The board is concerned about results. The board has asked for more.');
    const owned = G.inbox[0];
    openBoardRoom('review');
    const room = (document.getElementById('brRoom') || {}).textContent || '';
    closeBoardRoom();
    F.setUpRole('manager', false);
    mail('board', 'Board losing patience', 'The board is concerned about results.');
    const managed = G.inbox[0];
    return { ownedTitle: owned.title, ownedBody: owned.body, room: room.slice(0, 400), managedBody: managed.body };
  })()`);

  assert.equal(run.ownedTitle, 'Investors losing patience');
  assert.match(run.ownedBody, /^Your investors are concerned about results\. Your investors have asked for more\.$/);
  assert.match(run.room, /You own this club/);
  assert.equal(run.managedBody, 'The board is concerned about results.', 'a manager\'s board was reworded');
});

test('a chairman sees the result; he can choose to watch instead', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Chair Match');

  game.eval(`(function () {
    window.RBSFounder.setUpRole('chairman', false);
    G.day = nextUserFixture().day; UI.view = 'home'; render(); ACTIONS.advance();
  })()`);
  await waitFor(() => game.eval('!!(MU.m && MU.m.done)'), { label: 'the chairman\'s match to be played out', timeout: 20000 });
  assert.equal(game.eval('!!(MU.m && MU.m.done)'), true);
  game.eval('ACTIONS.matchDone && ACTIONS.matchDone()');
  /* the day after a match is finished off asynchronously; let it */
  await waitFor(() => game.eval("UI.view==='home'&&MU.m===null"), { label: 'the match to be cleared away', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1000));

  const watched = game.eval(`(function () {
    G.owner.watch = true;
    const next = G.fixtures.filter((f) => !f.played && (f.h === G.my || f.a === G.my)).sort((a, b) => a.day - b.day)[0];
    G.day = next.day; UI.view = 'home'; render(); ACTIONS.advance();
    window.__watchFix = next;
    return { kickoff: !!document.querySelector('[data-action="kickoff"]') };
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(watched.kickoff, true, 'watching should leave the kick-off to him');
  assert.equal(game.eval('window.__watchFix.played'), false, 'the match was played without him');
});

test('a save from before the invented world is renamed on load, and a new save is left alone', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Old Save');

  const run = game.eval(`(function () {
    const api = window.RBSSaveMigration;
    /* a new save: marked, and nothing to do */
    const fresh = api.migrate();
    /* make it look old: other club names, provenance on players, chatter in the inbox */
    const mine = G.clubs[G.my], rival = G.clubs.find((c) => c.i !== G.my && c.league === mine.league);
    const want = { mine: mine.name, rival: rival.name, ground: mine.stadium };
    const star = mine.players[0];
    const before = { ovr: star.ovr, id: star.id, wage: star.wage, name: star.name };
    G.invented = 0;
    mine.name = 'Oldtown Wanderers'; mine.short = 'Oldtown'; mine.stadium = 'Oldtown Lane';
    rival.name = 'Elsewhere Rovers';
    star.espnId = '12345'; star.playerProfile = 'x'; mine.rosterSource = 'x';
    G.history = [{ season: 0, club: 'Oldtown Wanderers', rival: 'Elsewhere Rovers' }];
    G.inbox.unshift({ id: 'old', day: 1, type: 'news', title: 'Oldtown Wanderers news', body: 'x', read: false });
    const done = api.migrate();
    const again = api.migrate();
    return { fresh, done, again, want, before,
      now: { mine: mine.name, rival: rival.name, ground: mine.stadium, short: mine.short },
      star: { ovr: star.ovr, id: star.id, wage: star.wage, name: star.name, espn: star.espnId, profile: star.playerProfile },
      source: mine.rosterSource, history: JSON.stringify(G.history), inbox: G.inbox.map((m) => m.title), mark: G.invented };
  })()`);

  assert.equal(run.fresh, null, 'a save made by this build was migrated');
  assert.ok(run.done && run.done.clubs >= 2 && run.done.players > 1000, JSON.stringify(run.done));
  assert.equal(run.again, null, 'a migrated save was migrated twice');
  assert.equal(run.now.mine, run.want.mine);
  assert.equal(run.now.rival, run.want.rival);
  assert.equal(run.now.ground, run.want.ground);
  assert.equal(run.star.id, run.before.id);
  assert.equal(run.star.ovr, run.before.ovr, 'a migrated player lost ability');
  assert.equal(run.star.wage, run.before.wage, 'a migrated player lost his contract');
  assert.notEqual(run.star.name, run.before.name, 'players keep the names an old save gave them');
  assert.equal(run.star.espn, undefined); assert.equal(run.star.profile, undefined); assert.equal(run.source, undefined);
  assert.ok(run.history.includes(run.want.mine) && !run.history.includes('Oldtown'), 'the record still names the old club');
  assert.deepEqual(Array.from(run.inbox), ['🌍 Your career, in the new world'], 'the old chatter is still there');
  assert.equal(run.mark, 2);
});
