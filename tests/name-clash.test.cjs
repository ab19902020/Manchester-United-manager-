const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Codex's cycle-3 duplicate players, and the one his brief did not know
 * about.
 *
 * The three he named are closed, and the first test here is what proves
 * it rather than a claim in a handover file: no player object, real
 * identity or internal id is seated twice anywhere in a 484-club world.
 *
 * The second is the fault that check turned up. A generated player had
 * been given the name of a real one — a 66-rated Erling Haaland at
 * Bodø/Glimt alongside the real 91-rated one at Manchester City —
 * because the name generator does not know which names the authored
 * squads used, and 'Erling' and 'Haaland' are both ordinary Norwegian
 * names sitting in the Norwegian pools.
 */

test('nobody is seated in two squads at once', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Dup');

    const result = game.eval(`(function () {
      const seats = [];
      G.clubs.forEach((c) => {
        (c.players || []).forEach((p) => seats.push({ p, c }));
        (c.youth || []).forEach((p) => seats.push({ p, c }));
      });

      const count = (key) => {
        const m = new Map();
        seats.forEach((s) => {
          const k = key(s);
          if (k == null || k === '') return;
          m.set(String(k), (m.get(String(k)) || 0) + 1);
        });
        return [...m.values()].filter((n) => n > 1).length;
      };

      return {
        seats: seats.length,
        clubs: G.clubs.length,
        objectTwice: count((s) => s.p.id),
        identityTwice: count((s) => s.p.espnId),
        stranded: seats.filter((s) => s.p.club !== s.c.i).length,
        withIdentity: seats.filter((s) => s.p.espnId).length,
      };
    }())`);

    assert.ok(result.seats > 5000, `a real world, got ${result.seats} players`);
    assert.ok(result.withIdentity > 500,
      `and real identities in it, got ${result.withIdentity}`);
    assert.equal(result.objectTwice, 0, 'no player is in two squads');
    assert.equal(result.identityTwice, 0,
      'and no real player is in two squads under one identity');
    assert.equal(result.stranded, 0,
      'every player agrees with the squad he is sitting in');
  } finally {
    game.close();
  }
});

test('a generated player never wears a real player\'s name', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Dup');

    const result = game.eval(`(function () {
      const norm = window.RBSNameClash.norm;
      const seats = [];
      G.clubs.forEach((c) => {
        (c.players || []).forEach((p) => seats.push({ p, c }));
        (c.youth || []).forEach((p) => seats.push({ p, c }));
      });
      const real = new Map();
      seats.forEach((s) => { if (s.p.espnId) real.set(norm(s.p.name), s); });

      const clashes = [];
      seats.forEach((s) => {
        if (s.p.espnId) return;
        const hit = real.get(norm(s.p.name));
        if (hit) {
          clashes.push(s.p.name + ' (' + s.p.ovr + ' at ' + s.c.short
            + ') vs the real one (' + hit.p.ovr + ' at ' + hit.c.short + ')');
        }
      });

      /* and the taboo set is actually populated, so a pass here is not
         a pass by having nothing to compare against */
      const taboo = window.RBSNameClash.realNames();
      return {
        clashes: clashes.slice(0, 6),
        n: clashes.length,
        taboo: taboo.size,
        knowsHaaland: taboo.has('erling haaland'),
        generated: seats.filter((s) => !s.p.espnId).length,
      };
    }())`);

    assert.ok(result.taboo > 2000,
      `the real-name set must be populated, had ${result.taboo}`);
    assert.equal(result.knowsHaaland, true,
      'and it must contain the name that found this bug');
    assert.ok(result.generated > 3000, 'with plenty of generated players to get it wrong');
    assert.equal(result.n, 0,
      'a generated player wearing a real name: ' + Array.from(result.clashes).join(' | '));
  } finally {
    game.close();
  }
});

test('the sweep renames a clash and leaves everybody else alone', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Dup');

    const result = game.eval(`(function () {
      const api = window.RBSNameClash;
      const club = G.clubs.filter((c) => (c.players || []).some((p) => !p.espnId))[0];
      const victim = club.players.filter((p) => !p.espnId)[0];
      const before = victim.name;

      /* plant the exact fault that was found in the wild */
      victim.name = 'Erling Haaland';
      const others = G.clubs[0].players.map((p) => p.name).join('|');

      const renamed = api.sweep();

      return {
        renamed,
        stillHaaland: victim.name === 'Erling Haaland',
        gotAName: !!victim.name && victim.name.split(' ').length >= 2,
        newName: victim.name,
        before,
        othersUntouched: G.clubs[0].players.map((p) => p.name).join('|') === others,
        /* and running it again changes nothing, because nothing is wrong */
        secondPass: api.sweep(),
      };
    }())`);

    assert.ok(result.renamed >= 1, 'the sweep found the planted clash');
    assert.equal(result.stillHaaland, false,
      `he should not still be Erling Haaland, was ${result.newName}`);
    assert.equal(result.gotAName, true,
      `and he needs a real name, got "${result.newName}"`);
    assert.equal(result.othersUntouched, true, 'nobody else was touched');
    assert.equal(result.secondPass, 0,
      'and a second sweep renames nobody, because there is nothing left to fix');
  } finally {
    game.close();
  }
});
