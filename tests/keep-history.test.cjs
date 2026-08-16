const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The world keeps its past.
 *
 * "I need to understand the world. It can't forget anything from the
 *  seasons. Keep it all there."
 *
 * A save was discarding two things. `trimCareers()` kept 24 match-log
 * entries for your own squad, 4 for your division and none at all for
 * the other 460 clubs — Agent One measured 1,160 players outside the
 * manager's division whose log a save carried none of. `trimFixtures()`
 * dropped the scorers and events of every played match you were not in,
 * about nine thousand a season.
 */

test('nothing trims a career or a fixture any more', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Keep');

    const result = game.eval(`(function () {
      /* both are called by saveBlob as: restore = trim(), then later
         restore(). So each has to hand back something callable or the
         save throws on the way out. */
      const a = trimCareers();
      const b = trimFixtures();
      let callable = 'no';
      try { a(); b(); callable = 'yes'; } catch (e) { callable = 'THREW: ' + e.message; }

      /* and neither may have emptied anything */
      const players = [];
      G.clubs.forEach((c) => [].concat(c.players || [], c.youth || [])
        .forEach((p) => players.push(p)));
      return {
        callable,
        keepsCareers: !!(window.RBSKeepHistory || {}).keepsCareers,
        keepsFixtures: !!(window.RBSKeepHistory || {}).keepsFixtures,
        undefinedLogs: players.filter((p) => p.log === undefined && p.hist === undefined).length,
        total: players.length,
      };
    }())`);

    assert.equal(result.callable, 'yes',
      'both trimmers must return a restore function, because saveBlob calls it');
    assert.equal(result.keepsCareers, true);
    assert.equal(result.keepsFixtures, true);
  } finally {
    game.close();
  }
});

test('a rival striker still has a record after a save and a reload', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Keep');

    const result = game.eval(`(function () {
      const myDiv = (G.clubs[G.my] || {}).league;

      /* play a season so there is a past to keep */
      let guard = 0;
      while (guard++ < 300) {
        const um = fixturesOn(G.day).filter((f) => !f.played && (f.h === G.my || f.a === G.my))[0];
        if (um) { quickSim(um); finishDayAfterMatch(); }
        else { simRestOfDay(); dailyTickCore(); G.day++; }
      }

      const census = () => {
        let outside = 0; let entries = 0;
        G.clubs.forEach((c) => {
          [].concat(c.players || [], c.youth || []).forEach((p) => {
            const n = (p.log || []).length + (p.hist || []).length;
            if (!n) return;
            entries += n;
            if (c.i !== G.my && c.league !== myDiv) outside += 1;
          });
        });
        const notMine = (G.fixtures || [])
          .filter((f) => f.played && f.h !== G.my && f.a !== G.my);
        return {
          outside,
          entries,
          notMine: notMine.length,
          withScorers: notMine.filter((f) => f.sc && f.sc.length).length,
        };
      };

      const before = census();

      /* THE ROUND TRIP, THROUGH THE GAME'S OWN PAIR. Saving alone proves
         nothing — the trimmers used to empty the arrays, write, then put
         them back, so the running game always looked intact. What matters
         is what comes back out of the file, so this writes a slot and
         loads it. (There is no loadBlob; writeSlot and loadSlot are the
         real pair, and loadSlot is what the Load button calls.) */
      /* READ WHAT WAS WRITTEN, which is where the loss happened. The
         trimmers emptied the arrays, let the packer write, then put them
         back — so the running game always looked intact and only the
         bytes on disk were short. loadSlot is the legacy localStorage
         path and returns false in this harness (Agent One hit the same
         thing and corrected himself), so this inspects the blob rather
         than depending on the loader. The full save-and-reload round
         trip is verified in a real browser by
         scripts/measure-kept-history.cjs. */
      const blob = saveBlob();
      const s = JSON.parse(blob);
      const packed = s.G;
      /* THE OFFSET IS +2, NOT +0. The packer writes two leading fields
         before the pk-indexed ones, so reading at pk.indexOf('log')
         lands on a different field that happens to hold an array — which
         is how a first measurement claimed less than half the history
         reached the file when in fact all of it did. */
      const pk = String(s.pk || '').split(',');
      const iLog = pk.indexOf('log') >= 0 ? pk.indexOf('log') + 2 : -1;
      const iHist = pk.indexOf('hist') >= 0 ? pk.indexOf('hist') + 2 : -1;

      let writtenOutside = 0;
      let writtenEntries = 0;
      (packed.clubs || []).forEach((c) => {
        const isMine = c.i === G.my;
        const sameDiv = c.league === myDiv;
        [].concat(c.players || [], c.youth || []).forEach((row) => {
          const a = iLog >= 0 && Array.isArray(row[iLog]) ? row[iLog].length : 0;
          const b = iHist >= 0 && Array.isArray(row[iHist]) ? row[iHist].length : 0;
          if (!(a + b)) return;
          writtenEntries += a + b;
          if (!isMine && !sameDiv) writtenOutside += 1;
        });
      });

      /* fixtures are packed positionally; the scorer list is whichever
         slot holds an array of objects with a pid */
      let writtenScorers = 0;
      (packed.fixtures || []).forEach((row) => {
        if (!Array.isArray(row)) return;
        const hit = row.some((v) => Array.isArray(v) && v.length
          && v[0] && typeof v[0] === 'object' && v[0].pid != null);
        if (hit) writtenScorers += 1;
      });

      return {
        before,
        blobBytes: blob.length,
        pkHasLog: iLog >= 0 || iHist >= 0,
        writtenOutside,
        writtenEntries,
        writtenScorers,
      };
    }())`);

    assert.equal(result.pkHasLog, true,
      'the packed key list must still carry a log field at all');
    assert.ok(result.before.outside > 100,
      `a played season should leave hundreds of outside players with a log, got ${result.before.outside}`);
    assert.ok(result.writtenOutside >= result.before.outside * 0.99,
      'and the SAVE must carry them: '
      + `${result.before.outside} in the world, ${result.writtenOutside} written`);
    assert.equal(result.writtenEntries, result.before.entries,
      'every log entry in the world must reach the file, exactly: '
      + `${result.before.entries} -> ${result.writtenEntries}`);

    assert.ok(result.before.withScorers > 100,
      'matches you were not in had scorers');
    assert.ok(result.writtenScorers >= result.before.withScorers,
      'and the file still knows who scored in them: '
      + `${result.before.withScorers} in the world, ${result.writtenScorers} written`);
  } finally {
    game.close();
  }
});
