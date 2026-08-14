const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Fast through the football, normal speed for the moments that decide it.
 *
 * The match runs at whatever speed you chose. When something that matters
 * happens — a goal, a red card, a penalty, a VAR check, one off the
 * woodwork, a booking — the game drops to normal speed, stays there long
 * enough to watch it, and then goes back to the speed you asked for.
 *
 * These check behaviour rather than wiring, because the failure mode is
 * silence: if the hook stops matching, nothing throws and the goal simply
 * flies past at 4x again.
 */

test('the classifier separates the moments worth stopping for', async () => {
  const game = await createGame();
  try {
    const kind = (text, cls) => game.window.RBSDrama.dramaKind({ text, cls });

    assert.equal(kind('GOAL! Rashford slots it home', 'goal'), 'goal');
    assert.equal(kind('Martínez is sent off after a second yellow', 'big'), 'red');
    assert.equal(kind('PENALTY to Manchester United', 'big'), 'pen');
    assert.equal(kind('The referee is going to the monitor for a VAR check', 'big'), 'var');
    assert.equal(kind('Off the woodwork! Inches away', 'big'), 'post');
    assert.equal(kind('Casemiro is booked for that', 'big'), 'card');

    /* a substitution is an event, but stopping for every one of them
       would make the last twenty minutes of every match crawl */
    assert.equal(kind('Mainoo comes on for Fernandes', 'big'), null);
    assert.equal(kind('United knock it around in midfield', ''), null);

    /* a sending-off inside a goal sequence is the more specific event */
    assert.equal(kind('GOAL — and the keeper is sent off for the foul', 'goal'), 'red');
  } finally {
    game.close();
  }
});

test('a goal drops the match to normal speed and then hands it back', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Drama');

    const result = game.eval(`(function () {
      /* a match on the screen, running fast */
      MU.m = new MatchSim(G.fixtures.find((f) => f.h === G.my || f.a === G.my));
      MU.speed = 4;
      const chosen = MU.speed;

      /* the feed gains a goal, and the loop tells the screen */
      MU.m.feed.push({ min: 12, text: 'GOAL! A fine finish', cls: 'goal' });
      window.RBSDrama.scan();
      const during = MU.speed;
      const kind = window.RBSDrama.state.kind;

      /* wind the clock past the hold and let it release */
      window.RBSDrama.state.until = performance.now() - 1;
      window.RBSDrama.scan();
      const after = MU.speed;

      return { chosen, during, after, kind };
    }())`);

    assert.equal(result.chosen, 4, 'the match should have started fast');
    /* A goal STOPS the clock rather than slowing it. Speed 1 is still
       3,200ms of wall clock per match minute, so at speed 1 a goal went
       past in about a third of a second — which was the original
       complaint, not the fix for it. At 0 the engine does not advance
       while the ball is going in and the celebration runs, and the
       renderer keeps drawing on animation frames, so one second on
       screen is one second of animation. */
    assert.equal(result.during, 0, 'a goal should stop the clock, not merely slow it');
    assert.equal(result.kind, 'goal', 'and say why it slowed down');
    assert.equal(result.after, 4, 'and the chosen speed should come back afterwards');
  } finally {
    game.close();
  }
});

test('choosing a speed yourself beats the automatic slow-down', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Drama');

    const result = game.eval(`(function () {
      MU.m = new MatchSim(G.fixtures.find((f) => f.h === G.my || f.a === G.my));
      MU.speed = 4;
      MU.m.feed.push({ min: 20, text: 'PENALTY to the home side', cls: 'big' });
      window.RBSDrama.scan();
      const during = MU.speed;

      /* the manager reaches for the controls mid-moment */
      ACTIONS.mspeed({ dataset: { v: '4' } });
      return { during, after: MU.speed, held: window.RBSDrama.state.until };
    }())`);

    assert.equal(result.during, 0, 'a penalty should have stopped the clock');
    assert.equal(result.after, 4, 'the manual choice should win');
    assert.equal(result.held, 0, 'and the automatic window should be dropped');
  } finally {
    game.close();
  }
});
