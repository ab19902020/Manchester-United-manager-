const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * A cup tie dated in the past can never be played.
 *
 * `tiesOn(day)` matches on `t.day === day` exactly, so a tie born with
 * yesterday's date on it is unreachable for the rest of the season. That is
 * not hypothetical: the League Cup's third-round draw fires whenever the
 * second round finishes, but takes its date from a fixed table written
 * before the season started, and in a traced career it drew sixteen ties on
 * day 85 and dated them day 78. The competition froze at the third round —
 * for every club in it — until a season-end guard resolved the whole thing
 * in one sweep with no rounds and no draws.
 *
 * These two tests are the two halves of the fix: a tie cannot be born in the
 * past, and anything already stranded there gets pulled back onto the
 * calendar.
 */

test('a cup tie is never dated before the day it was drawn', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Calendar');

    const result = game.eval(`(function () {
      /* wind the clock well past the League Cup's third-round date, then
         make the draw — exactly the situation a late round creates */
      const key = 'LC';
      const def = CUP_DEFS[key];
      const nominal = (G.seasonStart || 0) + def.days[2];
      G.day = nominal + 30;

      const before = G.cups[key].ties.length;
      const field = G.clubs.filter((c) => c.league === 'PL').map((c) => c.i).slice(0, 8);
      cupDraw(key, 2, field);
      const made = G.cups[key].ties.slice(before);

      return {
        today: G.day,
        nominal,
        made: made.length,
        days: made.map((t) => t.day),
        earliest: Math.min.apply(null, made.map((t) => t.day)),
      };
    }())`);

    assert.ok(result.made > 0, 'the draw should have produced ties');
    assert.ok(result.nominal < result.today,
      'the test is only meaningful if the table date has already gone past');
    assert.ok(result.earliest >= result.today,
      'a tie drawn today cannot be played yesterday: ' + JSON.stringify(result.days));
    assert.ok(result.earliest > result.today,
      'and it should give at least a day\'s notice so the draw mail lands first');
  } finally {
    game.close();
  }
});

test('a tie stranded in the past is rescued, and yours is not played for you', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Calendar');

    const result = game.eval(`(function () {
      G.day = 200;
      const lc = G.cups.LC;
      /* one of ours and one of theirs, both left behind */
      const mine = { h: G.my, a: 1, day: 150, played: false, hs: 0, as: 0, sc: [], cup: 'LC', r: 2, leg: 0 };
      const theirs = { h: 2, a: 3, day: 150, played: false, hs: 0, as: 0, sc: [], cup: 'LC', r: 2, leg: 0 };
      lc.ties.push(mine, theirs);

      const stranded = window.RBSCupCalendar.overdue().length;
      window.RBSCupCalendar.sweep();
      return {
        stranded,
        mineDay: mine.day,
        theirsDay: theirs.day,
        minePlayed: mine.played,
        stillOverdue: window.RBSCupCalendar.overdue().length,
        today: G.day,
      };
    }())`);

    assert.ok(result.stranded >= 2, 'both ties should have been seen as overdue');
    assert.equal(result.stillOverdue, 0, 'and nothing should be left in the past');

    /* theirs is pulled onto today, where the day's own machinery settles it */
    assert.equal(result.theirsDay, result.today);

    /* MINE IS NOT. Resolving the manager's own cup tie to tidy the calendar
       up would be a worse bug than the one being fixed — he would lose the
       match without being offered it. It moves forward so he can play it. */
    assert.equal(result.minePlayed, false, 'your own tie must not be settled behind your back');
    assert.ok(result.mineDay > result.today,
      'it should be rescheduled to a day you can still play it on');
  } finally {
    game.close();
  }
});
