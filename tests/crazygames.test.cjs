const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The CrazyGames adapter.
 *
 * The first test is the one that matters, and it is the one I can
 * actually prove: with no SDK present the game must behave exactly as it
 * does now. That covers every offline PWA install, every local file, and
 * this whole test suite.
 *
 * What these CANNOT prove is that the API names are right. Their
 * documentation is unreachable from this sandbox — docs.crazygames.com
 * fails at CONNECT — so every name in the adapter comes from Codex's
 * unverified search notes. The tests pin the SHAPE: that a missing or
 * renamed method disables one feature and breaks nothing, which is the
 * property that makes shipping it safe while the names are unconfirmed.
 */

test('with no SDK present, nothing about the game changes', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Crazy');

    const result = game.eval(`(function () {
      const api = window.RBSCrazyGames;
      return {
        loaded: !!api,
        present: api.present(),
        /* it must not have injected a script tag into a file:// page */
        scriptTag: !!document.getElementById('cg-sdk'),
        /* and every call is a no-op that returns undefined rather than throwing */
        callSafe: (() => {
          try {
            api.call('game.gameplayStart');
            api.call('data.setItem', 'x', 'y');
            api.call('nothing.at.all');
            return 'safe';
          } catch (e) { return 'THREW: ' + e.message; }
        })(),
        saveStillWorks: (() => {
          try { return typeof saveBlob() === 'string' ? 'yes' : 'no'; }
          catch (e) { return 'THREW: ' + e.message; }
        })(),
        kickoffStillThere: typeof ACTIONS.kickoff === 'function',
        newGameStillThere: typeof newGame === 'function',
      };
    }())`);

    assert.equal(result.loaded, true, 'the adapter loaded');
    assert.equal(result.present, false, 'and correctly reports no SDK here');
    assert.equal(result.scriptTag, false,
      'it must not fetch anything on a local page — this also ships as an offline PWA');
    assert.equal(result.callSafe, 'safe',
      'every SDK call is a no-op without one, including nonsense paths');
    assert.equal(result.saveStillWorks, 'yes', 'saving is untouched');
    assert.equal(result.kickoffStillThere, true);
    assert.equal(result.newGameStillThere, true);
  } finally {
    game.close();
  }
});

test('a broken or renamed SDK method disables one feature and nothing else', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Crazy');

    const result = game.eval(`(function () {
      const api = window.RBSCrazyGames;
      /* an SDK that is present but wrong in every way I can think of:
         a missing namespace, a method that is not a function, and one
         that throws when called */
      window.CrazyGames = { SDK: {
        init: () => { throw new Error('init exploded'); },
        game: { gameplayStart: 'not a function' },
        data: { setItem: () => { throw new Error('quota'); } },
      } };

      const out = { attached: 'no', calls: 'no' };
      try { out.attached = api.attach() ? 'yes' : 'no'; }
      catch (e) { out.attached = 'THREW: ' + e.message; }
      try {
        api.call('init');
        api.call('game.gameplayStart');
        api.call('game.loadingStart');
        api.call('data.setItem', 'k', 'v');
        api.call('user.getUser');
        out.calls = 'safe';
      } catch (e) { out.calls = 'THREW: ' + e.message; }

      /* and the game is still the game */
      try { out.save = typeof saveBlob() === 'string' ? 'yes' : 'no'; }
      catch (e) { out.save = 'THREW: ' + e.message; }

      delete window.CrazyGames;
      return out;
    }())`);

    assert.equal(result.attached, 'yes',
      'it attaches to whatever is there rather than refusing');
    assert.equal(result.calls, 'safe',
      'a method that is missing, is not a function, or throws must not escape');
    assert.equal(result.save, 'yes', 'and the save still works');
  } finally {
    game.close();
  }
});

test('a save too big for the cloud is kept locally and refused honestly', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Crazy');

    /* push() is async. The harness runs JSDOM in this process, so the
       promise the expression returns can simply be awaited. */
    const outcome = await game.eval(`(async function () {
      const api = window.RBSCrazyGames;
      const written = [];
      window.CrazyGames = { SDK: {
        init: () => Promise.resolve(),
        data: { setItem: (k, v) => { written.push(v.length); }, getItem: () => null },
        game: {},
      } };
      api.attach();

      /* the real save is about ten megabytes and the cap is one, so this
         is not a hypothetical — it is today's save */
      const tooBig = await api.push('x'.repeat(30 * 1024 * 1024));
      const fine = await api.push('a small career');
      const roundTrip = await api.unpack(await api.pack('a small career'));

      delete window.CrazyGames;
      return {
        cap: api.CAP,
        tooBig: tooBig.skipped || 'wrote',
        packedTooBig: tooBig.packed || 0,
        fine: fine.wrote ? 'wrote' : (fine.skipped || '?'),
        writes: written.length,
        roundTrip,
      };
    }())`);

    assert.equal(outcome.cap, 1024 * 1024, 'the cap is the documented 1 MB');
    assert.equal(outcome.tooBig, 'over cap',
      'a save over the cap is refused, not truncated and not silently dropped');
    assert.equal(outcome.fine, 'wrote', 'and one under it is written');
    assert.equal(outcome.writes, 1, 'exactly one write reached the SDK — the small one');
    assert.equal(outcome.roundTrip, 'a small career',
      'gzip and base64 round trip exactly, or a cloud save is worse than none');
  } finally {
    game.close();
  }
});

/*
 * The restore, which is the half that makes it a cloud save rather than
 * an upload. Two properties matter more than the happy path:
 *
 *   it must NEVER overwrite a career already on the device, and
 *   it must survive `data.getItem` being asynchronous.
 *
 * The second is a guess I cannot check — their documentation is
 * unreachable — and a wrong guess there does not throw. It reports "no
 * cloud career" and the player starts again. So it is awaited, and this
 * pins that it is.
 */
test('a cloud career is restored only onto a device that has none', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Crazy');

    const outcome = await game.eval(`(async function () {
      const api = window.RBSCrazyGames;
      const out = {};

      /* getItem returns a PROMISE, which is the case the first version
         of pull() silently threw away */
      const shelf = {};
      window.CrazyGames = { SDK: {
        init: () => Promise.resolve(),
        data: {
          setItem: (k, v) => { shelf[k] = v; },
          getItem: (k) => Promise.resolve(shelf[k] || null),
        },
        game: {},
      } };
      api.attach();

      /* Seed the cloud with a real career, packed the way push() packs
         one. NOT through push() itself: JSDOM has no CompressionStream,
         so a 3.6 MB career stays raw and is correctly refused by the cap
         — which the previous test already proves. The restore is what is
         under test here. */
      const career = saveBlob();
      shelf[api.KEY] = await api.pack(career);

      /* 1. a device that already has a career must be left alone */
      const before = window.RBSSaves.metas.get('auto');
      out.hadLocal = !!before;
      const guarded = await api.restoreIfEmpty();
      out.guarded = guarded.skipped || 'RESTORED OVER A LOCAL CAREER';

      /* 2. now empty the device and let it restore */
      await window.RBSSaves.store.remove('auto');
      for (const slot of ['1', '2', '3']) {
        try { await window.RBSSaves.store.remove(slot); } catch (e) { /* not there */ }
      }
      await window.RBSSaves.init();
      out.nowEmpty = !window.RBSSaves.metas.get('auto');

      const done = await api.restoreIfEmpty();
      out.restored = done.restored ? 'yes' : (done.skipped || '?');
      const back = await window.RBSSaves.store.get('auto');
      out.exact = !!back && back.payload === career;

      /* 3. and rubbish in the cloud is refused, not stored */
      shelf[api.KEY] = await api.pack('this is not a career');
      await window.RBSSaves.store.remove('auto');
      await window.RBSSaves.init();
      const junk = await api.restoreIfEmpty();
      out.junk = junk.restored ? 'STORED RUBBISH' : (junk.skipped || '?');

      delete window.CrazyGames;
      return out;
    }())`);

    assert.equal(outcome.hadLocal, true, 'the device starts with a career on it');
    assert.equal(outcome.guarded, 'local career already here',
      'a device with a career of its own is never overwritten from the cloud');
    assert.equal(outcome.nowEmpty, true, 'the device is now empty');
    assert.equal(outcome.restored, 'yes',
      'an empty device pulls the career back — through a PROMISED getItem');
    assert.equal(outcome.exact, true,
      'and what comes back is the career that went up, byte for byte');
    assert.match(outcome.junk, /^cloud save rejected/,
      'a damaged or foreign cloud save is validated and refused, not written');
  } finally {
    game.close();
  }
});
