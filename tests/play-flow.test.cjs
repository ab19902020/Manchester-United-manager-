const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer, wait } = require('./game-harness.cjs');

/*
 * Two dead ends found by playing a career through the buttons
 * (scripts/play-career.cjs), each of which left a player unable to carry
 * on from the button the game was offering.
 */

test('agreeing a loan from the inbox does not leave a dead "Answer 1 thing" button', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Loans');

    const before = game.eval(`(function () {
      /* nothing else in the tray, so the dock is about this letter only */
      G.inbox.forEach((m) => { if (m.actions) { m.actions = null; m.must = false; } });
      const me = G.clubs[G.my];
      const p = me.players.filter((x) => G.tacs.xi.indexOf(x.id) < 0 && !x.injury && !x.loan)[0];
      const dest = G.clubs.filter((c) => c.i !== G.my && c.league !== me.league)[0];
      mail('transfer', '🛫 Loan enquiry: ' + p.name, 'They would like him on loan.',
        [{ lbl: 'Agree the loan', act: 'loanDo', arg: p.id, _c: dest.i, _s: 50 },
         { lbl: '🚫 Reject the approach', act: 'loanRefuse', arg: p.id, _c: dest.i, ghost: true }]);
      const m = G.inbox[0];
      render();
      UI.mailView = m.id;
      renderMailbox();
      window.__loanPlayer = p.id;
      return {
        dock: !!document.querySelector('#continueDock [data-action="gotoDecision"]'),
        button: !!document.querySelector('#sheetBody [data-action="loanDo"][data-mid="' + m.id + '"]'),
      };
    }())`);
    assert.equal(before.dock, true, 'the dock asks for the decision while the letter is open');
    assert.equal(before.button, true, 'and the letter offers the loan');

    game.document.querySelector('#sheetBody [data-action="loanDo"]').click();
    await wait(60);

    const after = game.eval(`({
      loaned: !!(playerById(window.__loanPlayer) || {}).loan,
      blocking: blockingMails().length,
      deadButton: !!document.querySelector('#continueDock [data-action="gotoDecision"]'),
      carryOn: !!document.querySelector('#continueDock [data-action="advance"]'),
    })`);
    assert.equal(after.loaned, true, 'the loan went through');
    assert.equal(after.blocking, 0, 'and the letter is answered');
    assert.equal(after.deadButton, false, 'so the dock no longer offers a decision that is gone');
    assert.equal(after.carryOn, true, 'it offers Continue instead');
  } finally {
    game.close();
  }
});

test('a decision button with nothing behind it turns back into Continue and says so', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Dock');

    const result = game.eval(`(function () {
      G.inbox.forEach((m) => { if (m.actions) { m.actions = null; m.must = false; } });
      const me = G.clubs[G.my];
      const p = me.players.filter((x) => G.tacs.xi.indexOf(x.id) < 0 && !x.injury && !x.loan)[0];
      const dest = G.clubs.filter((c) => c.i !== G.my && c.league !== me.league)[0];
      mail('transfer', '🛫 Loan enquiry: ' + p.name, 'They would like him on loan.',
        [{ lbl: 'Agree the loan', act: 'loanDo', arg: p.id, _c: dest.i, _s: 50 }]);
      render();
      const stale = !!document.querySelector('#continueDock [data-action="gotoDecision"]');
      /* what a wrapper that clears the letter after drawing leaves behind */
      G.inbox[0].actions = null;
      let said = '';
      const realToast = window.toast;
      window.toast = function (t) { said = String(t); };
      document.querySelector('#continueDock [data-action="gotoDecision"]').click();
      window.toast = realToast;
      return {
        stale, said,
        still: !!document.querySelector('#continueDock [data-action="gotoDecision"]'),
        carryOn: !!document.querySelector('#continueDock [data-action="advance"]'),
      };
    }())`);
    assert.equal(result.stale, true, 'the setup leaves a decision button on the dock');
    assert.equal(result.still, false, 'pressing it redraws the dock');
    assert.equal(result.carryOn, true, 'into Continue');
    assert.match(result.said, /nothing left to answer/i, 'and the manager is told why');
  } finally {
    game.close();
  }
});

test('going up to the board closes the letter that summoned you', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Board');

    const result = game.eval(`(function () {
      boardSummon('objectives', 'What this season is for', 'The board would like a word.');
      const m = G.inbox[0];
      UI.mailView = m.id;
      renderMailbox();
      const sheetBefore = !!document.querySelector('#modalHost.open [data-action="boardGo"]');
      document.querySelector('#sheetBody [data-action="boardGo"]').click();
      return {
        sheetBefore,
        room: !!document.getElementById('brRoom'),
        sheetAfter: !!document.querySelector('#modalHost.open'),
        letter: G.inbox.filter((x) => x.id === m.id).length,
      };
    }())`);
    assert.equal(result.sheetBefore, true, 'the summons is read in the inbox sheet');
    assert.equal(result.room, true, 'the board room opens');
    assert.equal(result.sheetAfter, false,
      'and the sheet with the old "Go up" button is not left waiting behind it');
    assert.equal(result.letter, 0, 'the letter itself is withdrawn');
  } finally {
    game.close();
  }
});
