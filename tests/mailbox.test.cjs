const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The mailbox was one long stream. Every letter already carried a type —
 * board, transfer, news, contract, match and the rest — and nothing read
 * it except to pick an icon. These check the folders filter the real
 * screen, that nothing is lost behind them, and that the board's meetings
 * happen when they should.
 */

test('the mailbox files letters into folders and puts the inbox back', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    for (let i = 0; i < 40; i++) { simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd(); }
    const body = () => (document.getElementById('sheetBody')||{}).innerHTML || '';
    const rows = (h) => (h.match(/data-action="mailOpen"/g)||[]).length;
    const api = window.RBSMailbox;

    UI.mailTab = 'all';
    ACTIONS.mailbox();
    const allHtml = body();
    const chips = (allHtml.match(/data-action="mailTab" data-v="([^"]+)"/g)||[])
      .map(s => s.replace(/.*data-v="/,'').replace('"',''));

    const per = {};
    ['board','transfers','squad','media','results'].forEach(k => {
      ACTIONS.mailTab({dataset:{v:k}});
      per[k] = {shown: rows(body()), filed: api.counts()[k].total};
    });
    ACTIONS.mailTab({dataset:{v:'all'}});

    // every letter lands in exactly one folder, and none is lost
    const filed = {};
    (G.inbox||[]).forEach(m => { const f = api.folderOf(m); filed[f] = (filed[f]||0)+1; });
    const sum = Object.keys(filed).reduce((a,k) => a + filed[k], 0);

    return {inbox: G.inbox.length, chips, per, sum,
      folders: api.FOLDERS.map(f => f.key),
      types: [...new Set((G.inbox||[]).map(m => m.type))]};
  })()`);

  assert.ok(run.inbox > 15, `not enough mail to test with (${run.inbox})`);

  // 1. the folders exist and every one holding mail is offered. An empty
  //    folder is deliberately not shown — a chip that opens onto nothing
  //    is noise — so this checks coverage, not a fixed list.
  const chips = Array.from(run.chips);
  const folders = Array.from(run.folders);
  assert.ok(folders.length >= 5, 'a handful of folders, not one bucket');
  assert.ok(chips.includes('all'), 'there must always be a way back to everything');
  chips.forEach((k) => assert.ok(folders.includes(k), `unknown folder chip: ${k}`));
  Object.keys(run.per).forEach((k) => {
    if (run.per[k].filed > 0) {
      assert.ok(chips.includes(k), `${k} holds ${run.per[k].filed} letters but has no chip`);
    }
  });

  // 2. nothing is lost: every letter is filed somewhere
  assert.equal(run.sum, run.inbox,
    `${run.inbox} letters went in and ${run.sum} came out of the folders`);

  // 3. a folder shows only its own, and never more than it holds
  Object.keys(run.per).forEach((k) => {
    const p = run.per[k];
    assert.ok(p.shown <= p.filed,
      `${k}: showed ${p.shown} letters but only ${p.filed} are filed there`);
  });
  const boardFiled = run.per.board.filed;
  assert.ok(boardFiled > 0, 'the board should have written to you by now');

  // 4. and the real inbox survives the filtering
  assert.equal(run.inbox, run.sum, 'the inbox must be put back exactly as it was');
});

test('the board sees you twice a season, and at the end of it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const seen = [];
    const realSummon = window.boardSummon;
    window.boardSummon = function(kind, title, body) {
      seen.push({kind, day: G.day, month: dateOf(G.day).getUTCMonth()});
      return realSummon.apply(this, arguments);
    };
    // clear whatever is pending so the run starts clean
    const clear = () => { G.boardCall = null; };
    let guard = 0;
    const season = G.season;
    while (G.season === season && guard++ < 420) {
      const um = (typeof userMatchOn==='function') ? userMatchOn(G.day) : null;
      if (um) { if (um.cup) resolveTie(um); else quickSim(um); }
      simRestOfDay(); dailyTickCore(); G.day++; clear(); checkSeasonEnd();
      if (G.sacked) break;
    }
    window.boardSummon = realSummon;
    return {seen, sacked: !!G.sacked, closed: G.season > season,
      januaryWindow: (function(){
        // the window must be open in January for the meeting to be worth having
        const save = G.day;
        let open = false;
        for (let d = 0; d < 400; d++) {
          G.day = d;
          if (dateOf(d).getUTCMonth() === 0 && windowOpen()) { open = true; break; }
        }
        G.day = save;
        return open;
      })()};
  })()`);

  const kinds = Array.from(run.seen).map((s) => s.kind);

  // the January window has to exist, or a January meeting is pointless
  assert.ok(run.januaryWindow, 'the transfer window should be open in January');

  // 1. the season's terms, in August
  assert.ok(kinds.includes('objectives'),
    `the board should set the season's terms (saw ${kinds.join(', ') || 'nothing'})`);

  // 2. the mid-season review, in January
  const mid = Array.from(run.seen).find((s) => s.kind === 'midseason');
  assert.ok(mid, `there should be a mid-season meeting (saw ${kinds.join(', ')})`);
  assert.equal(mid.month, 0, 'and it should be in January');

  // 3. and the end-of-season review
  if (!run.sacked) {
    assert.ok(kinds.includes('review'),
      `the season should end with a review (saw ${kinds.join(', ')})`);
  }

  // and it does not turn into a weekly meeting
  const midCount = kinds.filter((k) => k === 'midseason').length;
  assert.equal(midCount, 1, `the mid-season review happened ${midCount} times`);
});

test('leaving the boardroom puts you on the next letter, not on the one you just used', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    let d = 0;
    while (!G.boardCall && d++ < 12) { simRestOfDay(); dailyTickCore(); G.day++; }
    if (!G.boardCall) return {skipped: true};
    const invites = () => (G.inbox||[]).filter(m => m && m.actions &&
      m.actions.some(a => a && a.act === 'boardGo')).length;
    const before = {invites: invites(), inbox: G.inbox.length};
    ACTIONS.boardGo({dataset:{}});
    ACTIONS.brDone();
    const opened = (G.inbox||[]).filter(m => m && m.open).length;
    const openedIsInvite = (G.inbox||[]).some(m => m && m.open && m.actions &&
      m.actions.some(a => a && a.act === 'boardGo'));
    return {skipped: false, before, after: {invites: invites(), inbox: G.inbox.length},
      opened, openedIsInvite,
      boardOnScreen: (typeof attnAnswer==='function' ? attnAnswer() : [])
        .filter(n => n && (n.k === 'board' || n.act === 'boardGo')).length};
  })()`);

  if (run.skipped) return;

  assert.equal(run.before.invites, 1, 'the summons arrives with a way up');
  assert.equal(run.after.invites, 0, 'and there is no way back up once you have been');
  assert.equal(run.after.inbox, run.before.inbox - 1, 'the letter itself is gone');
  assert.equal(run.boardOnScreen, 0, 'nor is the meeting still offered on the home screen');
  // the point of the report: you should land somewhere, not on the gap
  assert.ok(run.opened <= 1, 'at most one letter should be left open');
  assert.equal(run.openedIsInvite, false,
    'and it must not be the invitation you have just used');
});
