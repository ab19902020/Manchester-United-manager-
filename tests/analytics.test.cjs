const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The statistics centre.
 *
 * Most of what it shows is arithmetic on numbers the engine was already
 * keeping, so the tests that matter are the ones about the arithmetic
 * being right and about not standing on anything the engine owns. The
 * last of those is the important one: `p.form` is the engine's own
 * rolling rating array and writing objects into it would have made
 * every form figure in the game NaN without throwing anything.
 */

test('the columns compute what they claim, per 90 included', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      const COL = window.RBSAnalytics.COL;
      /* a made-up player, so the numbers are known rather than observed */
      const p = { id: -1, name: 'Test Man', pos: 'MC', club: G.my, stats: {
        apps: 10, mins: 900, goals: 5, assists: 3, rSum: 71,
        pas: 400, pasC: 340, key: 12, tak: 40, takW: 26,
        intc: 15, clr: 9, aer: 20, aerW: 13, duel: 50, duelW: 27,
        drb: 18, drbW: 11, sav: 0, fls: 7, cleanSheets: 0, motm: 2 } };
      const read = (k) => COL[k][1](p);
      const show = (k) => COL[k][2](COL[k][1](p), p);
      return {
        rating: show('rating'),
        g90: show('g90'),
        a90: show('a90'),
        pasPct: show('pasPct'),
        takPct: show('takPct'),
        aerPct: show('aerPct'),
        keyRaw: read('key'),
        /* nothing attempted must read as a dash, not as 0% or NaN% */
        emptyPct: COL.takPct[2](COL.takPct[1]({ stats: {} }), { stats: {} }),
        emptyRating: COL.rating[2](COL.rating[1]({ stats: {} }), { stats: {} }),
      };
    }())`);

    assert.equal(result.rating, '7.10', '71 across 10 games is 7.10');
    assert.equal(result.g90, '0.50', '5 goals in 900 minutes is a goal every other game');
    assert.equal(result.a90, '0.30');
    assert.equal(result.pasPct, '85%', '340 of 400');
    assert.equal(result.takPct, '65%', '26 of 40');
    assert.equal(result.aerPct, '65%', '13 of 20');
    assert.equal(result.keyRaw, 12);
    assert.equal(result.emptyPct, '—', 'a man who never tackled has no tackle percentage');
    assert.equal(result.emptyRating, '—', 'and a man who never played has no rating');
  } finally {
    game.close();
  }
});

test('sorting reaches every player in the division, not just your own', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      const api = window.RBSAnalytics;
      const div = G.clubs[G.my].league;
      const list = api.pool(div);
      const clubs = {};
      list.forEach((p) => { clubs[p.club] = 1; });

      /* give three known men known numbers so the order is checkable */
      const three = list.slice(0, 3);
      three[0].stats.apps = 10; three[0].stats.goals = 20;
      three[1].stats.apps = 10; three[1].stats.goals = 5;
      three[2].stats.apps = 10; three[2].stats.goals = 12;

      const down = api.ranked(three, 'goals', true).map((r) => r[1]);
      const up = api.ranked(three, 'goals', false).map((r) => r[1]);

      return {
        players: list.length,
        clubs: Object.keys(clubs).length,
        mineIncluded: list.filter((p) => p.club === G.my).length,
        othersIncluded: list.filter((p) => p.club !== G.my).length,
        youthExcluded: list.filter((p) => p.youth).length,
        down: down.join(','),
        up: up.join(','),
      };
    }())`);

    assert.ok(result.clubs > 1, 'the pool is a division, not a squad');
    assert.ok(result.players > 100, `a division should have hundreds of players, got ${result.players}`);
    assert.ok(result.mineIncluded > 0, 'your own men are in it');
    assert.ok(result.othersIncluded > 0, 'and so is everybody else');
    assert.equal(result.youthExcluded, 0, 'youth players are not senior statistics');
    assert.equal(result.down, '20,12,5', 'descending is highest first');
    assert.equal(result.up, '5,12,20', 'and clicking again reverses it');
  } finally {
    game.close();
  }
});

test('a club row shows the squad behind the table position', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      const shape = window.RBSAnalytics.squadShape(G.clubs[G.my]);
      const men = G.clubs[G.my].players.filter((p) => p && !p.youth);
      const wage = men.reduce((s, p) => s + (+p.wage || 0), 0);
      const age = men.reduce((s, p) => s + (+p.age || 0), 0) / men.length;
      return {
        n: shape.n, realN: men.length,
        wage: Math.round(shape.wage), realWage: Math.round(wage),
        age: shape.age.toFixed(3), realAge: age.toFixed(3),
        ovrSane: shape.ovr > 30 && shape.ovr < 99,
        empty: JSON.stringify(window.RBSAnalytics.squadShape({ players: [] })),
      };
    }())`);

    assert.equal(result.n, result.realN, 'the squad size is the squad size');
    assert.equal(result.wage, result.realWage, 'and the wage bill is the sum of the wages');
    assert.equal(result.age, result.realAge);
    assert.equal(result.ovrSane, true, 'the mean rating is a rating');
    assert.equal(result.empty, JSON.stringify({ n: 0, age: 0, ovr: 0, wage: 0, value: 0 }),
      'a club with nobody in it divides by nothing and survives');
  } finally {
    game.close();
  }
});

test('match ratings are logged per player without touching the engine form array', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      const api = window.RBSAnalytics;
      const p = G.clubs[G.my].players[0];
      p.mlog = null;
      p.form = [7.1, 6.4];
      const formBefore = p.form.slice().join(',');

      G.day = 100; api.logRating(p, { r: 7.4, g: 1, a: 0, min: 90 });
      G.day = 107; api.logRating(p, { r: 6.2, g: 0, a: 1, min: 78 });
      /* twice on the same day is one match, not two */
      G.day = 107; api.logRating(p, { r: 9.9, g: 3, a: 0, min: 90 });

      /* THE ENGINE'S ARRAY IS NOT MINE. It holds bare numbers, five of
         them, and four other places in the game average it. */
      const formAfter = p.form.slice().join(',');
      const formStillNumbers = p.form.every((v) => typeof v === 'number');
      const formAvg = p.form.reduce((s, v) => s + v, 0) / p.form.length;

      /* and it is capped, so a twenty-year career is twenty numbers */
      for (let d = 200; d < 400; d += 7) { G.day = d; api.logRating(p, { r: 7, g: 0, a: 0, min: 90 }); }

      /* somebody else's player is not logged at all */
      const other = G.clubs.filter((c) => c.i !== G.my && (c.players || []).length)[0].players[0];
      other.mlog = null;
      api.logRating(other, { r: 8.8, g: 2, a: 0, min: 90 });

      return {
        formBefore, formAfter, formStillNumbers,
        formAvgIsNumber: formAvg === formAvg,
        entries: p.mlog.length,
        cap: api.FORM_KEEP,
        first: JSON.stringify(p.mlog[0]),
        rivalLogged: (other.mlog || []).length,
      };
    }())`);

    assert.equal(result.formAfter, result.formBefore,
      'the engine form array must be exactly as it was');
    assert.equal(result.formStillNumbers, true, 'still bare numbers');
    assert.equal(result.formAvgIsNumber, true, 'so averaging it is still a number, not NaN');
    assert.equal(result.rivalLogged, 0, 'only your own squad is logged — the save cannot afford the world');
    assert.equal(result.entries, result.cap, `the log is capped at ${result.cap}`);
    assert.equal(JSON.parse(result.first).d > 0, true, 'and the oldest entries fell off the front');
  } finally {
    game.close();
  }
});

test('a finished match writes a rating into your players and only yours', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      G.clubs[G.my].players.forEach((p) => { p.mlog = null; });
      const before = G.clubs[G.my].players.filter((p) => (p.mlog || []).length).length;

      /* PLAY ONE THROUGH THE GAME'S OWN PATH. dailyTickCore does not
         move the calendar on — G.day++ does — so a loop that only ticks
         spins for four hundred iterations and plays nothing, which is
         what the first version of this test did. This is the sequence
         the economy tests use. */
      let guard = 0;
      while (guard++ < 400) {
        const um = fixturesOn(G.day).filter((f) => !f.played && (f.h === G.my || f.a === G.my))[0];
        if (um) { quickSim(um); finishDayAfterMatch(); break; }
        simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd();
      }

      const logged = G.clubs[G.my].players.filter((p) => (p.mlog || []).length);
      const sample = logged.map((p) => p.mlog[p.mlog.length - 1]);
      return {
        before,
        logged: logged.length,
        allRated: sample.every((e) => e.r >= 4 && e.r <= 10),
        allDated: sample.every((e) => typeof e.d === 'number'),
      };
    }())`);

    assert.equal(result.before, 0, 'nothing logged before a match is played');
    assert.ok(result.logged >= 11,
      `at least a starting eleven should have a rating, got ${result.logged}`);
    assert.equal(result.allRated, true, 'and every rating is a real match rating');
    assert.equal(result.allDated, true, 'stamped with the day it was earned');
  } finally {
    game.close();
  }
});

test('the form graph draws a shape and reads the direction of it', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      const api = window.RBSAnalytics;
      const p = G.clubs[G.my].players[0];
      const draw = (runs) => { p.mlog = runs; return api.formGraph(p); };
      const run = (vals) => vals.map((r, i) => ({ d: i * 7, r, g: 0, a: 0, m: 90 }));

      const rising = draw(run([5.9, 6.0, 6.1, 6.2, 7.8, 8.1, 8.4, 8.2]));
      const falling = draw(run([8.4, 8.2, 8.1, 7.9, 6.2, 6.0, 5.9, 6.1]));
      const flat = draw(run([7.0, 7.0, 7.0, 7.0, 7.0, 7.0]));
      const scored = draw([{ d: 1, r: 8.2, g: 2, a: 0, m: 90 }, { d: 8, r: 6.5, g: 0, a: 0, m: 90 }]);
      const oneGame = draw(run([7.4]));
      const none = draw([]);

      return {
        rising: /rising/.test(rising), falling: /falling/.test(falling),
        flat: /steady/.test(flat),
        risingSvg: /<svg/.test(rising) && /<path/.test(rising),
        goldDot: (scored.match(/#ffd24a/g) || []).length,
        oneGame, none,
        /* everything plotted stays inside the box even off the scale */
        clamped: (() => {
          const wild = draw(run([1, 99, 4, 20]));
          const ys = (wild.match(/cy="([\\d.]+)"/g) || []).map((s) => +s.replace(/[^\\d.]/g, ''));
          return ys.every((y) => y >= 0 && y <= 62);
        })(),
      };
    }())`);

    assert.equal(result.risingSvg, true, 'it draws an actual graph');
    assert.equal(result.rising, true, 'a man who has improved is rising');
    assert.equal(result.falling, true, 'a man falling away is falling');
    assert.equal(result.flat, true, 'and a metronome is steady');
    assert.equal(result.goldDot, 1, 'the match he scored in is marked, and only that one');
    assert.equal(result.oneGame, '', 'one match is not a trend, so nothing is drawn');
    assert.equal(result.none, '', 'and neither is none');
    assert.equal(result.clamped, true, 'impossible ratings still plot inside the box');
  } finally {
    game.close();
  }
});

test('every room renders, and the match reports were kept', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Data');

    const result = game.eval(`(function () {
      const rooms = window.RBSAnalytics.ROOMS.map((r) => r[0]);
      const out = {};
      rooms.forEach((room) => {
        UI.ana = null;
        const s = window.RBSAnalytics.state();
        s.room = room;
        /* THE APPEARANCE FILTER DEFAULTS TO FIVE, and on the first day of
           a career nobody has played once — so the players room correctly
           shows its empty state and not a table. Asserting a table there
           was testing the wrong thing. The filter is dropped to All so
           the table itself is what gets checked. */
        s.minApps = 0;
        let html = '';
        try { html = vStats(); } catch (e) { html = 'THREW: ' + e.message; }
        out[room] = html;
      });

      /* and the empty state is a real message rather than a blank card */
      UI.ana = null;
      const strict = window.RBSAnalytics.state();
      strict.room = 'players';
      strict.minApps = 20;
      const nobody = vStats();

      /* and with a match played, the reports room has the engine's own list */
      let guard = 0;
      while (guard++ < 400) {
        const um = fixturesOn(G.day).filter((f) => !f.played && (f.h === G.my || f.a === G.my))[0];
        if (um) { quickSim(um); finishDayAfterMatch(); break; }
        simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd();
      }
      UI.ana = null;
      window.RBSAnalytics.state().room = 'matches';
      const played = vStats();

      return {
        threw: rooms.filter((r) => /^THREW/.test(out[r])).join(','),
        empty: rooms.filter((r) => out[r].length < 40).join(','),
        playersHasTable: /<table/.test(out.players),
        teamsHasTable: /<table/.test(out.teams),
        squadHasTable: /<table/.test(out.squad),
        recordsHasBoot: /Golden Boot/.test(out.records),
        emptyStateSpeaks: /has played enough/.test(nobody) && !/<table/.test(nobody),
        reportsKept: /matchReport/.test(played),
        reportCount: (played.match(/data-action="matchReport"/g) || []).length,
      };
    }())`);

    assert.equal(result.threw, '', 'no room throws');
    assert.equal(result.empty, '', 'and no room renders to nothing');
    assert.equal(result.playersHasTable, true);
    assert.equal(result.teamsHasTable, true);
    assert.equal(result.squadHasTable, true);
    assert.equal(result.recordsHasBoot, true, 'the leaders survived the rebuild');
    assert.equal(result.emptyStateSpeaks, true,
      'and asking for 20+ appearances on day one says so instead of drawing an empty table');
    assert.equal(result.reportsKept, true,
      "the match report list is the game's own and must not be lost");
    assert.ok(result.reportCount >= 1, 'with a played match in it');
  } finally {
    game.close();
  }
});
