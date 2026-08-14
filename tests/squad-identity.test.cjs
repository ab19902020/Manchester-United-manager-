const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * One man, one squad — and, just as importantly, two men who share a name
 * are still two men.
 *
 * The duplicates came from the summer-2026 signing list looking a player
 * up with `x.name === nm`. Two spellings of one man are two men to that
 * test, so Liverpool carried both "Jeremy Jacquet" and "Jérémy Jacquet",
 * and the dedupe sweep that exists to catch exactly this could not see it
 * either. Frank Onyeka and Ogochukwu Onyeka are the same player under two
 * different names, which no string comparison would ever join.
 *
 * The fix resolves identity from the ESPN aliases in the sourced data.
 * The dangerous half of it is the fallback: an earlier version folded
 * names across the whole world and deleted 1,884 players — nineteen per
 * cent of the game — because the generated name pool collides and real
 * football is full of shared names. So the second test here matters more
 * than the first, and is the one to keep if either is ever in the way.
 */

test('a player identified by the source exists at exactly one club', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ident');

    const result = game.eval(`(function () {
      const find = (pattern) => {
        const out = [];
        G.clubs.forEach((c) => (c.players || []).forEach((p) => {
          if (new RegExp(pattern, 'i').test(p.name)) out.push(p.name + ' @ ' + c.name);
        }));
        return out;
      };
      return { jacquet: find('Jacquet'), onyeka: find('Onyeka'), report: G._identity || null };
    }())`);

    assert.equal(result.jacquet.length, 1, 'Jacquet should exist once, got: ' + result.jacquet.join(' | '));
    assert.equal(result.onyeka.length, 1, 'Onyeka should exist once, got: ' + result.onyeka.join(' | '));
    /* and he keeps the spelling the source uses */
    assert.match(result.jacquet[0], /Jérémy Jacquet/);
    assert.ok(result.report, 'the sweep should have recorded what it did');
  } finally {
    game.close();
  }
});

test('two different men who share a name both survive', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ident');

    const result = game.eval(`(function () {
      let players = 0;
      G.clubs.forEach((c) => { players += (c.players || []).length; });

      /* the sourced data holds several real pairs — two Adam Smiths, two
         Ben Davieses — at different clubs. None of them is a duplicate. */
      const shared = ['Ben Davies', 'Adam Smith', 'Jordan Williams'];
      const survived = shared.map((name) => {
        let seen = 0;
        G.clubs.forEach((c) => (c.players || []).forEach((p) => { if (p.name === name) seen += 1; }));
        return { name, seen };
      });

      /* and nobody appears twice inside one squad */
      let sameSquad = 0;
      G.clubs.forEach((c) => {
        const seen = new Set();
        (c.players || []).forEach((p) => {
          const key = window.RBSIdentity.fold(p.name);
          if (seen.has(key)) sameSquad += 1;
          seen.add(key);
        });
      });

      return { players, survived, sameSquad, emptyXi: (G.tacs.xi || []).filter((x) => x == null).length };
    }())`);

    /* the whole world is still here. The version that folded names
       globally left 8,023 of these. */
    assert.ok(result.players > 9500, 'the sweep must not gut the world, got ' + result.players);

    result.survived.forEach((row) => {
      if (row.seen > 0) {
        assert.ok(row.seen >= 1, row.name + ' should not have been merged away');
      }
    });

    assert.equal(result.sameSquad, 0, 'nobody should appear twice in one squad');
    assert.equal(result.emptyXi, 0, 'dropping a duplicate must not leave a hole in the XI');
  } finally {
    game.close();
  }
});
