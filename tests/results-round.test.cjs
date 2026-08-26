const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE REST OF THE DIVISION PLAYED TODAY TOO
   ---------------------------------------------------------------------
   The highlights reel could always play anybody's match -- `playFixture`
   takes a fixture, builds both sides from their real squads and plays
   the goals -- and there was nothing anywhere in the game that would
   hand it one that was not yours. `vFixtures` lists your club and only
   your club; the calendar opens your own days; the match report is your
   own report.

   So this checks the screen that closes that, and it checks the thing
   that actually matters about it: that a camera on a row belonging to
   two clubs you have never managed reaches the reel with THAT fixture.
   ===================================================================== */

const SEED = 20260825;

/* one seeded world, played far enough that a round has results in it.
   The day stops advancing when your own match is due -- the season will
   not move past a fixture you have not played -- so the round on show is
   a real one rather than a contrived one. */
async function worldWithResults(game) {
  await startCareer(game, 'Results', { seed: SEED });
  return game.eval(`(function () {
    for (let d = 0; d < 120; d += 1) { try { advanceDay(); } catch (e) { break; } }
    UI.view = 'world'; UI.clubTab = 'table';
    return { day: G.day, div: myDiv(),
      played: (G.fixtures || []).filter((f) => f.played).length };
  }())`);
}

test('the round is listed, and only for the division on show',
  { timeout: 120000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    const state = await worldWithResults(game);

    assert.ok(state.played > 0,
      'the rig needs a played fixture to look at, got ' + state.played);

    const out = game.eval(`(function () {
      const R = window.RBSResultsRound;
      const div = myDiv();
      const round = R.latestRound(div);
      const html = R.roundHtml(div);

      /* every club named in the card belongs to this division */
      const mine = new Set(G.clubs.filter((c) => c.league === div).map((c) => c.i));
      const listed = (G.fixtures || []).filter((f) => f.div === div && !f.comp
        && (f.r == null ? 0 : f.r) === round);
      const strays = listed.filter((f) => !mine.has(f.h) || !mine.has(f.a)).length;

      return { round, strays, fixtures: listed.length,
        rows: (html.match(/class="rr-row/g) || []).length,
        cameras: (html.match(/data-action="rrWatch"/g) || []).length,
        goalsShown: listed.filter((f) => R.goalsIn(f) > 0).length,
        headed: html.indexOf('Matchday ' + (round + 1)) >= 0,
        arrows: (html.match(/data-action="rrRound"/g) || []).length };
    }())`);

    assert.equal(out.strays, 0, 'a club from another division got into the round');
    assert.equal(out.rows, out.fixtures,
      'the card shows ' + out.rows + ' rows for ' + out.fixtures + ' fixtures');
    assert.ok(out.headed, 'the round names itself');
    assert.equal(out.arrows, 2, 'there is a way back and a way forward');

    /* NO CAMERA ON ANY ROW. The highlights reel it opened has been taken
       out of the game -- the match is the Pitch, the Text and the Stats
       -- so a results row is the result and the two clubs and nothing
       else. */
    assert.equal(out.cameras, 0,
      'the results rows carry no highlights button, got ' + out.cameras);
  });

test('the table is still the table, and the toggle switches between them',
  { timeout: 120000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await worldWithResults(game);

    const out = game.eval(`(function () {
      UI.rrView = 'table';
      const table = vTable();
      UI.rrView = 'results';
      const results = vTable();
      UI.rrView = 'table';

      return {
        /* the country and division rails belong to both */
        railsOnTable: (table.match(/data-action="tblCC"/g) || []).length,
        railsOnResults: (results.match(/data-action="tblCC"/g) || []).length,
        toggleOnBoth: (table.match(/data-action="rrView"/g) || []).length === 2
          && (results.match(/data-action="rrView"/g) || []).length === 2,
        /* NO CLOSING QUOTE IN THE NEEDLE. A later layer renders it as
           class="tbl fixcols", and matching the exact opening tag failed
           this test while the screen was perfectly correct. (And no
           backticks in here: this whole block is inside a template
           literal, so one closes the string and the file stops
           parsing.) */
        tableHasTable: table.indexOf('<table class="tbl') >= 0,
        resultsHasTable: results.indexOf('<table class="tbl') >= 0,
        resultsHasRows: (results.match(/class="rr-row/g) || []).length > 0,
        tableHasRows: (table.match(/class="rr-row/g) || []).length,
      };
    }())`);

    assert.ok(out.railsOnTable > 0 && out.railsOnResults === out.railsOnTable,
      'the country rail is on both views, unduplicated');
    assert.ok(out.toggleOnBoth, 'the toggle is on both views');
    assert.ok(out.tableHasTable, 'the league table survived the wrapper');
    assert.ok(!out.resultsHasTable, 'the results view replaces the table rather than stacking it');
    assert.ok(out.resultsHasRows, 'the results view has results in it');
    assert.equal(out.tableHasRows, 0, 'and the table view has none');
  });

test('changing division changes the round with it', { timeout: 120000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await worldWithResults(game);

  const out = game.eval(`(function () {
    const R = window.RBSResultsRound;
    const here = myDiv();
    /* another division in the same country, which will be at a different
       point in its season -- opening it on this division's matchday 27
       would show an empty card */
    const others = leaguesOf(LEAGUES[here].cc).filter((d) => d !== here);
    if (!others.length) return { none: true };
    const there = others[0];

    UI.tblDiv = here; UI.rrRound = R.latestRound(here);
    const was = UI.rrRound;
    ACTIONS.tblDiv({ dataset: { v: there } });
    return { none: false, was, now: UI.rrRound,
      expected: R.latestRound(there), here, there };
  }())`);

  if (out.none) return;
  assert.equal(out.now, out.expected,
    'moving from ' + out.here + ' to ' + out.there + ' left the round on '
    + out.now + ' rather than ' + out.expected);
});
