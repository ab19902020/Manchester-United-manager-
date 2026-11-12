const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   A RENAME CHANGES THE NAME AND NOTHING ELSE
   ---------------------------------------------------------------------
   A good deal of the game is seeded from names: a player's face, his
   personality, the ceiling on his ability, his nationality; a club's
   standing and who manages it. The editor lets a player rename any of
   them, so the thing to prove is that renaming a man does not quietly
   turn him into somebody else -- and that a club under a new name is
   still the same club with the same manager.
   ===================================================================== */

test('a renamed player keeps his face, his ceiling, his nationality and his character', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Editor');

  const run = game.eval(`(function () {
    const club = G.clubs[G.my];
    const p = club.players.slice().sort((a, b) => b.ovr - a.ovr)[3];
    const read = () => ({
      face: typeof face === 'function' ? face(p, 64) : '',
      spec: typeof faceSpec === 'function' ? JSON.stringify(faceSpec(p)) : '',
      pot: typeof potOf === 'function' ? potOf(p) : p.pot,
      nat: typeof natOf === 'function' ? natOf(p) : p.nat,
      pers: p.pers, ovr: p.ovr, wage: p.wage, contract: p.contract, id: p.id,
    });
    const before = read();
    const original = p.name;
    const result = window.RBSNameEditor.renamePlayer(p, 'Zebedee Quillfeather');
    /* force anything cached per player to be worked out again */
    p.nat = undefined;
    const after = read();
    const restored = window.RBSNameEditor.restorePlayer(p);
    return { ok: result.ok, original, name: p.name, kept: after.id === before.id, restored,
      same: { spec: before.spec === after.spec, pot: before.pot === after.pot, nat: before.nat === after.nat,
        pers: before.pers === after.pers, ovr: before.ovr === after.ovr, wage: before.wage === after.wage },
      short: (function () { const r = window.RBSNameEditor.renamePlayer(p, 'X'); return r.ok; }()),
      edits: JSON.stringify(G.nameEdits) };
  })()`);

  assert.equal(run.ok, true);
  assert.equal(run.kept, true);
  assert.deepEqual({ ...run.same }, { spec: true, pot: true, nat: true, pers: true, ovr: true, wage: true },
    'renaming a player changed something other than his name');
  assert.equal(run.restored, true);
  assert.equal(run.name, run.original, 'the original name did not come back');
  assert.equal(run.short, false, 'a one-letter name was accepted');
});

test('a renamed club is the same club: same manager, same standing, and no two clubs share a name', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Editor');

  const run = game.eval(`(function () {
    const club = G.clubs[G.my];
    const rival = G.clubs.find((c) => c.i !== G.my && c.league === club.league);
    const other = G.clubs.find((c) => c !== rival && c.i !== G.my);
    const read = (c) => ({ mgr: managerOf(c), tier: clubTier(c).n, rep: c.rep, key: c.key, cap: c.cap });
    const before = read(rival);
    const original = rival.name;
    const clash = window.RBSNameEditor.renameClub(rival, { name: other.name });
    const renamed = window.RBSNameEditor.renameClub(rival, { name: 'Dunmore Wanderers', short: '', stadium: 'The Rectory Field' });
    const after = read(rival);
    const table = (typeof render === 'function') ? (UI.view = 'world', UI.clubTab = 'table', render(), document.getElementById('view').textContent) : '';
    const abbrs = G.clubs.filter((c) => c.cc === rival.cc).map((c) => c.abbr);
    return { clash: clash.ok, renamed: renamed.ok, name: rival.name, short: rival.short, stadium: rival.stadium, n0: rival._n0, original,
      same: JSON.stringify(before) === JSON.stringify(after), abbr: rival.abbr,
      uniqueAbbrs: new Set(abbrs).size === abbrs.length, shown: table.indexOf('Dunmore') >= 0,
      edits: Object.keys(G.nameEdits.clubs).length };
  })()`);

  assert.equal(run.clash, false, 'a club was allowed to take another club\'s name');
  assert.equal(run.renamed, true);
  assert.equal(run.name, 'Dunmore Wanderers');
  assert.equal(run.stadium, 'The Rectory Field');
  assert.ok(run.short && run.short.length <= 14, `short name was "${run.short}"`);
  assert.equal(run.n0, run.original, 'the original name was not kept as the identity');
  assert.equal(run.same, true, 'renaming a club changed its manager, standing or reputation');
  assert.equal(run.uniqueAbbrs, true, 'two clubs in one country share a badge monogram');
  assert.equal(run.shown, true, 'the league table still shows the old name');
  assert.equal(run.edits, 1);
});

test('a name pack is validated, and renames a fresh career', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Editor');

  const run = game.eval(`(function () {
    const api = window.RBSNameEditor;
    const club = G.clubs[5];
    const star = G.clubs[0].players.slice().sort((a, b) => b.ovr - a.ovr)[0];
    const pack = { format: 'results-business-names', version: 1, clubs: {}, players: {} };
    pack.clubs[club.key] = { name: 'Garside <b>Athletic</b>', short: 'Garside', stadium: 'Mill Lane' };
    pack.clubs['not a key'] = { name: 'Ignored' };
    pack.players[star.name] = 'Barnaby Thistlewood';
    const junk = api.importText('{"format":"something-else","clubs":{}}');
    const broken = api.importText('not json at all');
    const good = api.importText(JSON.stringify(pack));
    const first = { club: G.clubs[5].name, star: star.name, starId: star.id, n0: star._n0 };
    /* and a brand new career on the same device picks the pack up */
    newGame(0);
    const again = G.clubs.find((c) => c.key === club.key);
    const starAgain = G.clubs.flatMap((c) => c.players).find((p) => (p._n0 || p.name) === first.n0);
    return { junk: junk.ok, broken: broken.ok, good: good.ok, changed: good.clubs + good.players, first,
      fresh: { club: again && again.name, star: starAgain && starAgain.name },
      cleared: api.clearAll(), after: G.clubs.find((c) => c.key === club.key).name };
  })()`);

  assert.equal(run.junk, false);
  assert.equal(run.broken, false);
  assert.equal(run.good, true);
  assert.equal(run.changed, 2);
  assert.equal(run.first.club, 'Garside bAthletic/b', 'markup must be stripped from an imported name');
  assert.equal(run.first.star, 'Barnaby Thistlewood');
  assert.equal(run.fresh.club, 'Garside bAthletic/b', 'the pack was not applied to a new career');
  assert.equal(run.fresh.star, 'Barnaby Thistlewood');
  assert.ok(run.cleared >= 2);
  assert.notEqual(run.after, 'Garside bAthletic/b', 'clearing did not restore the original');
});
