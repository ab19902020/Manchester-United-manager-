const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * A mailbox you can keep: delete, ignore, mark important.
 *
 * The rule that matters more than any of the features is the one that
 * stops them: a letter waiting on a decision cannot be deleted, muted or
 * filtered out of sight, because the season does not advance until it is
 * answered and a mailbox that lets you throw those away is a mailbox
 * that bricks the save. Three of these five tests are about that.
 */

test('a letter can be starred, and starring survives a redraw', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Post');

    const result = game.eval(`(function () {
      const m = G.inbox.filter((x) => !x.actions || !x.actions.length)[0];
      const before = !!m.star;
      ACTIONS.mailStar({ dataset: { id: m.id } });
      const on = !!G.inbox.filter((x) => x.id === m.id)[0].star;
      ACTIONS.mailStar({ dataset: { id: m.id } });
      const off = !!G.inbox.filter((x) => x.id === m.id)[0].star;
      return { before, on, off };
    }())`);

    assert.equal(result.before, false);
    assert.equal(result.on, true, 'clicking the star marks it important');
    assert.equal(result.off, false, 'and clicking again takes it off');
  } finally {
    game.close();
  }
});

test('an ordinary letter can be deleted; one awaiting a decision cannot', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Post');

    const result = game.eval(`(function () {
      /* a decision letter is made here rather than hunted for: whether a
         fresh career happens to have one in the tray at this instant is
         not what this test is about */
      mail('board', 'Answer this before the season moves', 'Body.',
        [{ k: 'yes', t: 'Agreed' }, { k: 'no', t: 'No' }]);
      const blocking = G.inbox.filter((x) => x.actions && x.actions.length)[0];
      const ordinary = G.inbox.filter((x) => !x.actions || !x.actions.length)[0];
      const startCount = G.inbox.length;

      ACTIONS.mailBin({ dataset: { id: ordinary.id } });
      const afterOrdinary = G.inbox.filter((x) => x.id === ordinary.id).length;

      let toastSaid = null;
      const realToast = window.toast;
      window.toast = function (t) { toastSaid = String(t); };
      if (blocking) ACTIONS.mailBin({ dataset: { id: blocking.id } });
      window.toast = realToast;

      return {
        startCount,
        afterOrdinary,
        blockingStill: blocking ? G.inbox.filter((x) => x.id === blocking.id).length : 1,
        hadBlocking: !!blocking,
        toastSaid,
      };
    }())`);

    assert.equal(result.afterOrdinary, 0, 'an ordinary letter goes in the bin');
    assert.equal(result.hadBlocking, true, 'the test needs a decision letter to be meaningful');
    assert.equal(result.blockingStill, 1,
      'a letter the season is waiting on must not be deletable');
    assert.match(String(result.toastSaid || ''), /needs an answer/i,
      'and the manager should be told why');
  } finally {
    game.close();
  }
});

test('clear read keeps decisions and anything you marked important', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Post');

    const result = game.eval(`(function () {
      /* everything read, one starred, decisions left as they are */
      G.inbox.forEach((m) => { m.read = true; });
      const ordinary = G.inbox.filter((x) => !x.actions || !x.actions.length);
      const starred = ordinary[0];
      starred.star = true;
      const decisions = G.inbox.filter((x) => x.actions && x.actions.length).length;
      const before = G.inbox.length;

      ACTIONS.mailBinRead();

      return {
        before,
        after: G.inbox.length,
        starredKept: G.inbox.filter((x) => x.id === starred.id).length,
        decisionsKept: G.inbox.filter((x) => x.actions && x.actions.length).length,
        decisions,
      };
    }())`);

    assert.ok(result.after < result.before, 'read mail should have been cleared');
    assert.equal(result.starredKept, 1, 'an important letter is not read mail to be swept');
    assert.equal(result.decisionsKept, result.decisions,
      'and a decision is never swept, read or not');
  } finally {
    game.close();
  }
});

test('a muted kind files itself away instead of arriving', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Post');

    const result = game.eval(`(function () {
      G.mailPrefs = { mute: {} };
      const inboxBefore = G.inbox.length;
      mail('news', 'A round-up you do not care about', 'Body text.');
      const unmutedArrived = G.inbox.length - inboxBefore;

      ACTIONS.mailMute({ dataset: { v: 'news' } });
      const archiveBefore = (G.archive || []).length;
      const inboxNow = G.inbox.length;
      mail('news', 'Another round-up', 'Body text.');
      const mutedArrived = G.inbox.length - inboxNow;
      const archived = (G.archive || []).length - archiveBefore;

      /* and a decision is never muted, whatever the setting says */
      ACTIONS.mailMute({ dataset: { v: 'board' } });
      const boardBefore = G.inbox.length;
      mail('board', 'Answer this', 'Body.', [{ k: 'ok', t: 'Fine' }]);
      const boardArrived = G.inbox.length - boardBefore;

      return { unmutedArrived, mutedArrived, archived, boardArrived };
    }())`);

    assert.equal(result.unmutedArrived, 1, 'an unmuted round-up comes to the inbox');
    assert.equal(result.mutedArrived, 0, 'a muted one does not');
    assert.equal(result.archived, 1, 'but it is filed, not destroyed — you can still read it');
    assert.equal(result.boardArrived, 1,
      'a letter that needs an answer arrives even from a muted kind');
  } finally {
    game.close();
  }
});

test('the Important folder still shows the things you must answer', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Post');

    const result = game.eval(`(function () {
      UI.mailStarOnly = false;
      UI.mailOrder = null;
      const all = mailList().length;

      const ordinary = G.inbox.filter((x) => !x.actions || !x.actions.length)[0];
      ordinary.star = true;
      UI.mailStarOnly = true;
      UI.mailOrder = null;
      const list = mailList();
      UI.mailStarOnly = false;

      return {
        all,
        starredView: list.length,
        hasStar: list.filter((m) => m.star).length,
        hasDecision: list.filter((m) => m.actions && m.actions.length).length,
        totalDecisions: G.inbox.filter((m) => m.actions && m.actions.length).length,
      };
    }())`);

    assert.ok(result.starredView < result.all, 'the folder should actually filter');
    assert.ok(result.hasStar >= 1, 'and show what you starred');
    assert.equal(result.hasDecision, result.totalDecisions,
      'a decision is shown in every folder, because the season waits on it');
  } finally {
    game.close();
  }
});

test('worth knowing forgets a letter once it is answered or out of date', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Post');

    const result = game.eval(`(function () {
      const shelf = window.RBSMailboxPro.SHELF;
      /* three optional letters: fresh, answered, and stale */
      /* mail() unshifts, so the last one made is the one at the front */
      mail('news', 'One from months ago', 'Body.', [{ k: 'a', t: 'Yes' }]);
      const stale = G.inbox[0];
      mail('news', 'One you dealt with', 'Body.', [{ k: 'a', t: 'Yes' }]);
      const answered = G.inbox[0];
      mail('news', 'Fresh offer of a friendly', 'Body.', [{ k: 'a', t: 'Yes' }]);
      const fresh = G.inbox[0];

      const ids = (list) => list.map((n) => n.mid).filter(Boolean);
      const before = ids(attnKnow());

      /* answering a letter is exactly this: the options go */
      answered.actions = null;
      /* and time passing is exactly this */
      stale.day = G.day - (shelf + 1);

      const after = ids(attnKnow());
      return {
        shelf,
        freshBefore: before.indexOf(fresh.id) >= 0,
        freshAfter: after.indexOf(fresh.id) >= 0,
        answeredAfter: after.indexOf(answered.id) >= 0,
        staleAfter: after.indexOf(stale.id) >= 0,
        stillInInbox: G.inbox.filter((m) => m.id === stale.id).length,
        stillHasOptions: !!(G.inbox.filter((m) => m.id === stale.id)[0] || {}).actions,
        countBefore: before.length,
        countAfter: after.length,
      };
    }())`);

    assert.equal(result.freshBefore, true, 'a new optional letter is worth knowing about');
    assert.equal(result.freshAfter, true, 'and stays there while it is current');
    assert.equal(result.answeredAfter, false, 'one you have answered should go');
    assert.equal(result.staleAfter, false,
      `one older than ${result.shelf} days should go`);
    assert.ok(result.countAfter >= result.countBefore - 1,
      'and expiring one should not leave a hole in the card');
    /* and going off the front page is not the same as being thrown away */
    assert.equal(result.stillInInbox, 1, 'the letter itself stays in the inbox');
    assert.equal(result.stillHasOptions, true, 'with its options intact');
  } finally {
    game.close();
  }
});
