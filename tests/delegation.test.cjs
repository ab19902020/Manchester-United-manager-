const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Jobs you hand to your assistant.
 *
 * The point of these is the cost. Delegating has to be a trade — his
 * ability against your attention — or it is free and everybody delegates
 * everything. So the tests are mostly about a weak assistant picking a
 * worse side than a strong one, while still picking a legal one.
 */

test('nothing is delegated until you say so', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Deleg');

    const result = game.eval(`(function () {
      const api = window.RBSDelegation;
      return {
        jobs: api.JOBS.map((j) => j[0]),
        lineup: api.on('lineup'),
        press: api.on('press'),
        training: api.on('training'),
      };
    }())`);

    assert.equal(Array.from(result.jobs).join(','), 'lineup,press,training');
    assert.equal(result.lineup, false);
    assert.equal(result.press, false);
    assert.equal(result.training, false);
  } finally {
    game.close();
  }
});

test('a five-star assistant picks the best side; a one-star does not', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Deleg');

    const result = game.eval(`(function () {
      const api = window.RBSDelegation;
      const shape = G.tacs.formation;
      const best = autoPick(G.my, shape);
      /* MEASURED BY FITNESS FOR THE POSITION, not by raw rating. Summing
         ovr says a holding midfielder at centre-half is an upgrade; the
         game's own calcEff says what the tactics screen says. */
      const slots = FORMATIONS[shape];
      const rate = (xi) => xi.map((id, i) => {
        const p = playerById(id);
        return p ? calcEff(p, slots[i][0]) : 0;
      }).reduce((s, v) => s + v, 0);

      G.staff.assistant.stars = 5;
      const five = api.assistantEleven();
      G.staff.assistant.stars = 3;
      const three = api.assistantEleven();
      G.staff.assistant.stars = 1;
      const one = api.assistantEleven();

      const legal = (xi) => xi.length === 11
        && new Set(xi).size === 11
        && xi.map((id) => playerById(id)).every((p) => p && !p.injury && !(p.susp > 0)
          && p.club === G.my);

      return {
        bestRating: rate(best),
        five: rate(five), three: rate(three), one: rate(one),
        fiveSame: five.join(',') === best.join(','),
        legalFive: legal(five), legalThree: legal(three), legalOne: legal(one),
      };
    }())`);

    assert.equal(result.fiveSame, true,
      'a five-star assistant picks the side you would have picked');
    assert.ok(result.three < result.five,
      `a three-star should pick a weaker side (${result.three} vs ${result.five})`);
    assert.ok(result.one < result.three,
      `and a one-star weaker still (${result.one} vs ${result.three})`);

    /* but always a real, playable eleven — he is not incompetent */
    assert.equal(result.legalFive, true);
    assert.equal(result.legalThree, true, 'a weak assistant still picks eleven fit players');
    assert.equal(result.legalOne, true, 'including the worst one');
  } finally {
    game.close();
  }
});

test('with team selection delegated, the side is named before a match', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Deleg');

    const result = game.eval(`(function () {
      G.delegate = { lineup: true };
      G.staff.assistant.stars = 5;
      /* wreck the eleven, then stand on the eve of a match */
      G.tacs.xi = G.tacs.xi.slice(0, 4);
      const next = nextUserMatch();
      G.day = next.day - 1;
      const before = G.tacs.xi.length;
      dailyTickCore();
      const after = G.tacs.xi.length;

      /* AND WITH IT OFF HE PICKS NOTHING OF HIS OWN. The game repairs a
         short eleven by itself, so "is it eleven long" cannot tell the
         two apart — the first version of this test asserted it stayed at
         four and was really testing the game's own auto-pick. What
         distinguishes them is WHOSE side it is: undelegated it must be
         the game's best, never a two-star assistant's degraded one. */
      G.delegate = { lineup: false };
      G.staff.assistant.stars = 1;
      const shape = G.tacs.formation;
      G.tacs.xi = autoPick(G.my, shape);
      dailyTickCore();
      const untouched = G.tacs.xi.join(',') === autoPick(G.my, shape).join(',');

      return { before, after, untouched };
    }())`);

    assert.equal(result.before, 4, 'the eleven started broken');
    assert.equal(result.after, 11, 'and he named a full side the day before the match');
    assert.equal(result.untouched, true,
      'with it switched off the eleven is yours, not his');
  } finally {
    game.close();
  }
});

test('a delegated press conference is taken by him, and never a board decision', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Deleg');

    const result = game.eval(`(function () {
      G.delegate = { press: true };
      /* a press invitation, in the shape the game sends one */
      mail('media', 'The press are waiting for you', 'Body.',
        [{ lbl: 'Enter the press room', act: 'pressOpen' },
         { lbl: 'Send your assistant', act: 'pressSkip', ghost: 1 }]);
      const press = G.inbox[0];

      /* and a board letter, which he must never touch */
      mail('board', 'The board want your objectives', 'Body.',
        [{ lbl: 'Agree', act: 'boardGo' }]);
      const board = G.inbox[0];

      return {
        pressHandled: !press.actions,
        pressNote: /took the conference/.test(press.body || ''),
        boardStillYours: !!(board.actions && board.actions.length),
      };
    }())`);

    assert.equal(result.pressHandled, true, 'he took the press conference');
    assert.equal(result.pressNote, true, 'and the letter says so');
    assert.equal(result.boardStillYours, true,
      'a board decision is never delegated — that is the game');
  } finally {
    game.close();
  }
});

test('a good assistant reads the fixture list; a poor one does not', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Deleg');

    const result = game.eval(`(function () {
      G.delegate = { training: true };
      const set = (starsN, gap) => {
        G.staff.assistant.stars = starsN;
        const next = nextUserMatch();
        G.day = next.day - gap;
        /* the weekly slot */
        while (G.day % 7 !== 1) G.day -= 1;
        G.trainInt = 'Normal';
        const want = next.day - G.day;
        dailyTickCore();
        return { gap: want, got: G.trainInt };
      };
      const quiet = set(5, 10);
      const busy = set(5, 3);
      const poor = set(1, 10);
      return { quiet, busy, poor };
    }())`);

    /* a clear week is a week to work; a crowded one is a week to rest */
    assert.equal(result.quiet.got, 'Intense',
      `a long gap (${result.quiet.gap} days) should mean hard work`);
    assert.equal(result.busy.got, 'Light',
      `a short gap (${result.busy.gap} days) should mean legs`);
    assert.equal(result.poor.got, 'Normal',
      'a one-star assistant just leaves it on Normal, which is what a poor one does');
  } finally {
    game.close();
  }
});
