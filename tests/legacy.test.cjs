const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE LEGACY ONLY WATCHES
   ---------------------------------------------------------------------
   The milestones are a record of what happened. Two things to hold them
   to: they are read correctly off the fixtures and the honours list, and
   looking at them changes nothing else in the save -- the rule the whole
   game is built on is that nothing reaches back into a result.
   ===================================================================== */

test('milestones are read off what has been played and won', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Legacy');

  const run = game.eval(`(function () {
    const api = window.RBSLegacy;
    const before = api.summary();
    /* six league matches: five wins, the last by four, then a defeat */
    const mine = G.fixtures.filter((f) => f.h === G.my || f.a === G.my).sort((a, b) => a.day - b.day).slice(0, 6);
    mine.forEach((f, i) => {
      const home = f.h === G.my, win = i < 5;
      const us = win ? (i === 4 ? 5 : 2) : 0, them = win ? 1 : 3;
      f.played = true; f.hs = home ? us : them; f.as = home ? them : us;
    });
    G.day += 1;
    api.check();
    const mid = api.summary();
    const done = Object.keys(G.legacy.done);
    G.honours.push({ season: G.season, comp: 'Premier Division champions' });
    G.day += 1;
    api.check();
    return { before, mid, done, after: Object.keys(G.legacy.done), total: api.milestones().length };
  })()`);

  assert.equal(run.before.done, 0, 'a brand new career has reached nothing');
  assert.equal(run.mid.record.p, 6);
  assert.equal(run.mid.record.w, 5);
  assert.equal(run.mid.best.wins, 5);
  assert.equal(run.mid.best.margin, 4);
  for (const id of ['firstWin', 'bigWin', 'five']) assert.ok(Array.from(run.done).includes(id), `${id} was not recorded`);
  assert.equal(Array.from(run.done).includes('ten'), false, 'an unbeaten run of five is not ten');
  for (const id of ['silver', 'champions']) assert.ok(Array.from(run.after).includes(id), `${id} was not recorded`);
  assert.ok(run.total >= 20);
});

test('looking at the legacy changes nothing but its own drawer', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Legacy');

  const run = game.eval(`(function () {
    const snap = () => {
      const keep = G.legacy; delete G.legacy;
      const s = JSON.stringify(G); G.legacy = keep; return s;
    };
    const before = snap();
    window.RBSLegacy.check();
    UI.view = 'club'; UI.clubTab = 'trophies'; render();
    const card = !!document.getElementById('rbsLegacyCard');
    ACTIONS.legacyOpen();
    const sheet = document.getElementById('sheetBody').textContent;
    closeModal();
    UI.view = 'home'; render();
    /* the home screen is allowed to move UI state, not the world */
    return { same: before === snap(), card, listed: /Off the mark/.test(sheet) && /All the way up/.test(sheet) };
  })()`);

  assert.equal(run.card, true, 'the Trophies tab has no legacy card');
  assert.equal(run.listed, true, 'the milestone list did not open');
  assert.equal(run.same, true, 'reading the legacy changed the save');
});
