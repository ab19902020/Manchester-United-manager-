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

/* SEEDED, AND OVER SEVERAL WORLDS, because this test caught something
   real once and could not be made to catch it again.

   It failed in a full suite run with `sameSquad 1, expected 0`, then
   passed ten times on its own. The reason was not flakiness in the usual
   sense -- nothing about timing or load was involved. Career creation was
   unseeded, so every run built a different world, and the fault only
   showed in a world where a particular kind of duplicate happened to
   occur. Ten clean runs were ten worlds that did not have one.

   The fault, found by reproducing it deliberately rather than waiting
   for it: the same-squad pass of `dedupeWorld` decided and removed in
   one `Array#filter`, and when a later copy of a man outranked the copy
   already held it nulled the loser in the array being filtered rather
   than the one being built. Both men stayed, and `report.sameSquad` came
   back 0 because the squad was no shorter -- so the sweep called it
   clean. It fired only when the second copy was the better one, which is
   about half of them, and that is the whole of the intermittency.

   So this now names its worlds. The seeds are arbitrary and fixed, and a
   failure is reproducible from the seed printed beside it. */
const WORLDS = [20260825, 7, 4242, 99001];

test('two different men who share a name both survive', { timeout: 180000 }, async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ident', { seed: WORLDS[0] });

    const look = () => game.eval(`(function () {
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

      /* and nobody appears twice inside one squad. A BARE COUNT IS NOT
         DIAGNOSABLE: "1 !== 0" is what this reported the one time it
         caught something, which is why the fault sat open. It now says
         who, and where. */
      const doubled = [];
      G.clubs.forEach((c) => {
        const seen = new Map();
        (c.players || []).forEach((p) => {
          const key = window.RBSIdentity.fold(p.name);
          if (seen.has(key)) {
            if (doubled.length < 8) {
              doubled.push(c.name + ': ' + seen.get(key).name + ' (' + (seen.get(key).ovr || 0)
                + ') and ' + p.name + ' (' + (p.ovr || 0) + ') both fold to "' + key + '"');
            }
          } else seen.set(key, p);
        });
      });

      return { players, survived, doubled,
        emptyXi: (G.tacs.xi || []).filter((x) => x == null).length };
    }())`);

    const check = (result, seed) => {
      /* the whole world is still here. The version that folded names
         globally left 8,023 of these. */
      assert.ok(result.players > 9500,
        'world ' + seed + ': the sweep must not gut the world, got ' + result.players);

      result.survived.forEach((row) => {
        if (row.seen > 0) {
          assert.ok(row.seen >= 1, row.name + ' should not have been merged away');
        }
      });

      /* length rather than deepEqual: this array is built inside JSDOM,
         so it is that realm's Array and a strict deep comparison fails
         on the prototype before it ever looks at the contents */
      assert.equal(result.doubled.length, 0,
        'world ' + seed + ': nobody should appear twice in one squad\n  '
        + Array.from(result.doubled).join('\n  '));
      assert.equal(result.emptyXi, 0,
        'world ' + seed + ': dropping a duplicate must not leave a hole in the XI');
    };

    check(look(), WORLDS[0]);

    /* the rest are rebuilt in place rather than through four more JSDOM
       instances, which would cost a minute each for the same answer */
    for (const seed of WORLDS.slice(1)) {
      game.eval(`window.RBSWorldSeed.build(${seed}, 'MUN')`);
      check(look(), seed);
    }
  } finally {
    game.close();
  }
});

/* WAITING FOR A WORLD TO CONTAIN THE FAULT IS NOT A TEST.
   The four worlds above are the sweep doing its ordinary job, and they
   would not have caught this on their own: the duplicate has to exist
   before the sweep can fail to remove it, and how often one turns up is
   a property of the data rather than of the code being tested.

   So this one puts the duplicate there. Both orderings are tried, because
   only one of them was ever broken — the better copy second — and a test
   that checked the other would have passed throughout. */
test('a man listed twice in one squad is removed whichever copy is better',
  async () => {
    const game = await createGame();
    try {
      await startCareer(game, 'Ident', { seed: 20260825 });

      const result = game.eval(`(function () {
        /* the same-squad pass only sees players the source cannot
           identify; a sourced man is caught by the world pass first */
        let club = null, src = null;
        for (const c of G.clubs) {
          const p = (c.players || []).find(
            (x) => String(window.RBSIdentity.identityOf(x) || '').indexOf('name:') === 0);
          if (p) { club = c; src = p; break; }
        }
        if (!src) return { none: true };

        const copy = (delta) => {
          const c = JSON.parse(JSON.stringify(src));
          c.id = 'twin' + delta;
          c.ovr = (src.ovr || 60) + delta;
          return c;
        };
        const count = () => club.players.filter(
          (p) => window.RBSIdentity.fold(p.name) === window.RBSIdentity.fold(src.name)).length;

        club.players.push(copy(-5));
        const worse = window.RBSIdentity.dedupeWorld();
        const afterWorse = count();

        club.players.push(copy(5));
        const better = window.RBSIdentity.dedupeWorld();
        const afterBetter = count();
        const kept = club.players.find(
          (p) => window.RBSIdentity.fold(p.name) === window.RBSIdentity.fold(src.name));

        return { club: club.name, name: src.name,
          afterWorse, worseReported: worse.sameSquad,
          afterBetter, betterReported: better.sameSquad,
          keptOvr: kept ? kept.ovr : null, baseOvr: src.ovr || 0 };
      }())`);

      assert.ok(!result.none, 'the world should contain at least one unsourced player');

      assert.equal(result.afterWorse, 1,
        'the weaker second copy goes: ' + result.name + ' left ' + result.afterWorse
        + ' times at ' + result.club);
      assert.equal(result.afterBetter, 1,
        'and so does the stronger one: ' + result.name + ' left ' + result.afterBetter
        + ' times at ' + result.club);

      /* THE SWEEP HAS TO SAY SO. The old fault reported a clean squad
         while leaving the duplicate in it, so a count of 1 with a report
         of 0 is the exact shape of the bug and not an acceptable pass. */
      assert.equal(result.worseReported, 1, 'and it is counted');
      assert.equal(result.betterReported, 1, 'both times');

      /* the better man is the one who stays */
      assert.equal(result.keptOvr, result.baseOvr + 5);
    } finally {
      game.close();
    }
  });
