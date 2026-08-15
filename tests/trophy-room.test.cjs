const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The Trophies tab used to be the only screen in the game that was dead on
 * the day you started it: four lines, three of them saying you had not won
 * anything, and no answer for the nine months before you could.
 *
 * It now opens with the season you are actually playing — the competitions
 * the club is entered in, whether you are still in them, and when the next
 * round is. These tests are about that board being TRUE rather than merely
 * present, because a board that says "still in" about a cup you went out of
 * in January is worse than no board.
 */

test('a new career is already playing for a league and two cups', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Cabinet');

    const result = game.eval(`(function () {
      const rows = window.RBSTrophyRoom.campaign();
      return {
        codes: rows.map((r) => r.code || r.key),
        states: rows.map((r) => r.state),
        lines: rows.map((r) => r.line),
        league: G.clubs[G.my].league,
        html: window.RBSTrophyRoom.board(),
      };
    }())`);

    /* the division you are in, plus the FA Cup and the League Cup, which
       every English club is in whether or not it has played in them yet */
    assert.ok(result.codes.includes(result.league),
      'the board should lead with the division you are actually in, not a generic one');
    assert.ok(result.codes.includes('FA'), 'and the FA Cup');
    assert.ok(result.codes.includes('LC'), 'and the League Cup');

    /* nothing has been played, so nothing can be out */
    assert.ok(result.states.every((s) => s === 'in'),
      'on day one you are still in everything: ' + JSON.stringify(result.states));

    /* every row says something specific — the point of the screen is that
       it never has to fall back on "nothing yet" */
    assert.ok(result.lines.every((l) => l && l.length > 6),
      'every competition should say where you are in it: ' + JSON.stringify(result.lines));

    assert.match(result.html, /This season/);
    assert.match(result.html, /Still in/);
  } finally {
    game.close();
  }
});

test('a club outside Europe is not told it is in Europe', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Cabinet');

    const result = game.eval(`(function () {
      /* drop the club to the fourth tier and out of every European draw,
         the way a relegated side actually is */
      const me = G.clubs[G.my];
      ['CL', 'EL', 'EC'].forEach((k) => {
        if (!G.cups || !G.cups[k]) return;
        G.cups[k].ties = G.cups[k].ties.filter((t) => t.h !== G.my && t.a !== G.my);
        G.cups[k].entryLater = {};
        G.cups[k].byes = {};
      });
      return window.RBSTrophyRoom.campaign().map((r) => r.code || r.key);
    }())`);

    assert.ok(!result.includes('CL') && !result.includes('EL') && !result.includes('EC'),
      'a club with no European ties should not have a European row: ' + JSON.stringify(result));
    assert.ok(result.includes('FA') && result.includes('LC'),
      'but it is still in both domestic cups');
  } finally {
    game.close();
  }
});

test('knocked out reads as knocked out, and winning reads as won', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Cabinet');

    const result = game.eval(`(function () {
      const find = (rows, key) => rows.filter((r) => r.key === key)[0];
      const out = {};

      /* OUT: our tie is played and lost, and the competition has moved on
         to the next round without us */
      const fa = G.cups.FA;
      fa.entryLater = {}; fa.byes = {};
      fa.ties = [{ h: G.my, a: 1, day: 10, played: true, hs: 0, as: 2, cup: 'FA', r: 2, leg: 0 }];
      fa.round = 3; fa.winner = null;

      /* AWAITING THE DRAW: played, won, and the cup has not moved on yet.
         This is a real window in the engine — the next round is only drawn
         once every tie in this one is finished — and calling it "out"
         would knock you out of a cup you had just gone through in. */
      const lc = G.cups.LC;
      lc.entryLater = {}; lc.byes = {};
      lc.ties = [{ h: G.my, a: 1, day: 10, played: true, hs: 3, as: 0, cup: 'LC', r: 2, leg: 0 }];
      lc.round = 2; lc.winner = null;

      const rows = window.RBSTrophyRoom.campaign();
      out.fa = find(rows, 'FA');
      out.lc = find(rows, 'LC');

      /* WON */
      G.cups.FA.winner = G.my;
      out.faWon = find(window.RBSTrophyRoom.campaign(), 'FA');
      return out;
    }())`);

    assert.equal(result.fa.state, 'out');
    assert.match(result.fa.line, /Knocked out/);
    assert.equal(result.lc.state, 'in', 'a round won but not yet drawn is still in the cup');
    assert.match(result.lc.line, /awaiting the draw/);
    assert.equal(result.faWon.state, 'won');
  } finally {
    game.close();
  }
});

test('the empty room stands up what you are playing for', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Cabinet');

    const result = game.eval(`(function () {
      const preview = roomTrophies().map((t) => t.code);
      const wanted = window.RBSTrophyRoom.campaign().map((r) => r.code || r.key)
        .filter((c) => preview.indexOf(c) >= 0);
      return { head: preview.slice(0, wanted.length), wanted, all: preview.length };
    }())`);

    /* nothing won, so every trophy in the room is a preview — and the ones
       standing at the front are this season's, not a catalogue of the game
       that opens with the World Cup */
    assert.deepEqual(result.head, result.wanted,
      'the season\'s competitions should be at the front of the shelf');
    assert.ok(result.all > result.wanted.length,
      'and the rest of the room is still behind them');
  } finally {
    game.close();
  }
});
