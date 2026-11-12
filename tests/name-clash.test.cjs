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
 * been given the name of a real one — a 66-rated Emil Eide at
 * Bodø alongside the real 91-rated one at Manchester Blues —
 * because the name generator does not know which names the authored
 * squads used, and 'Erling' and 'Eide' are both ordinary Norwegian
 * names sitting in the Norwegian pools.
 */

test('nobody is seated in two squads at once', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Dup');

    const result = game.eval(`(function () {
      const norm = window.RBSNameClash.norm;
      const authored = window.RBSNameClash.realNames();
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
        identityTwice: count((s) => (authored.has(norm(s.p.name)) ? norm(s.p.name) : null)),
        stranded: seats.filter((s) => s.p.club !== s.c.i).length,
        withIdentity: seats.filter((s) => authored.has(norm(s.p.name))).length,
      };
    }())`);

    assert.ok(result.seats > 5000, `a real world, got ${result.seats} players`);
    assert.ok(result.withIdentity > 500,
      `and authored players in it, got ${result.withIdentity}`);
    assert.equal(result.objectTwice, 0, 'no player is in two squads');
    assert.equal(result.identityTwice, 0,
      'and no authored player is in the world twice');
    assert.equal(result.stranded, 0,
      'every player agrees with the squad he is sitting in');
  } finally {
    game.close();
  }
});

test('a generated player never wears an authored player\'s name', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Dup');

    const result = game.eval(`(function () {
      const norm = window.RBSNameClash.norm;
      const taboo = window.RBSNameClash.realNames();
      const seats = new Map();
      let total = 0;
      G.clubs.forEach((c) => {
        [].concat(c.players || [], c.youth || []).forEach((p) => {
          total += 1;
          const key = norm(p.name);
          if (!taboo.has(key)) return;
          if (!seats.has(key)) seats.set(key, []);
          seats.get(key).push(p.name + ' (' + p.ovr + ' at ' + c.short + ')');
        });
      });
      const clashes = [...seats.values()].filter((list) => list.length > 1).map((list) => list.join(' vs '));

      /* and the taboo set is actually populated, so a pass here is not
         a pass by having nothing to compare against */
      return {
        clashes: clashes.slice(0, 6),
        n: clashes.length,
        taboo: taboo.size,
        knowsTheStar: taboo.has(norm(DB[1][9][DB[1][9].length - 1][0])),
        generated: total - seats.size,
      };
    }())`);

    assert.ok(result.taboo > 800,
      `the authored-name set must be populated, had ${result.taboo}`);
    assert.equal(result.knowsTheStar, true,
      'and it must contain the players written into the squad tables');
    assert.ok(result.generated > 3000, 'with plenty of generated players to get it wrong');
    assert.equal(result.n, 0,
      'an authored name appears twice: ' + Array.from(result.clashes).join(' | '));
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
      const taboo = api.realNames();
      /* a journeyman a long way from the authored squads */
      const club = G.clubs.filter((c) => c.league === 'NL')[0];
      const victim = club.players.filter((p) => !taboo.has(api.norm(p.name)))[0];
      const before = victim.name;
      /* the best player at the first club, whose name is certainly authored */
      const star = G.clubs[0].players.slice().sort((a, b) => b.ovr - a.ovr)[0];
      const STAR = star.name;

      /* plant the exact fault that was found in the wild */
      victim.name = STAR;
      const others = G.clubs[0].players.map((p) => p.name).join('|');

      const renamed = api.sweep();

      return {
        renamed,
        stillHaaland: victim.name === STAR,
        starKept: star.name === STAR,
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
      `he should not still wear the star's name, was ${result.newName}`);
    assert.equal(result.starKept, true, 'the authored player keeps his own name');
    assert.equal(result.gotAName, true,
      `and he needs a proper name, got "${result.newName}"`);
    assert.equal(result.othersUntouched, true, 'nobody else was touched');
    assert.equal(result.secondPass, 0,
      'and a second sweep renames nobody, because there is nothing left to fix');
  } finally {
    game.close();
  }
});
