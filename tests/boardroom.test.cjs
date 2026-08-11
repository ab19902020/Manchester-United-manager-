const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Reported from a real save: top of the league after five matches — four
 * wins and a draw — against a target of 1st, and the monthly review said
 * "which is about where we asked you to be", offered "Take the criticism",
 * and docked five points of patience for asking to be backed.
 *
 * The old scene graded on `pos < obj.pos`, so first place against a target
 * of first fell through to the underperformance branch and every answer in
 * the room keyed off that one boolean.
 */

/* play real league matches — the table is cached on G.day, so a probe that
   stamps fixtures without advancing the day reads a stale table */
const PLAY = (results) => `
  (function(){
    const div = myDiv();
    const want = ${JSON.stringify(results)};
    let mine = 0, guard = 0;
    while (mine < want.length && guard++ < 600) {
      const f = fixturesOn(G.day).find(x => !x.played && (x.h === G.my || x.a === G.my) && x.div === div);
      if (f) {
        const r = want[mine];
        const gf = r === 'W' ? 2 : r === 'D' ? 1 : 0;
        const ga = r === 'L' ? 2 : r === 'D' ? 1 : 0;
        if (f.h === G.my) { f.hs = gf; f.as = ga; } else { f.hs = ga; f.as = gf; }
        f.played = true;
        G.clubs[G.my].recent = [{r, gf, ga, day: G.day, cup: false}].concat(G.clubs[G.my].recent || []);
        mine++;
      }
      simRestOfDay(); G.day++;
    }
    return mine;
  })()`;

test('a league leader on target is graded as a league leader', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  game.eval(PLAY(['W', 'W', 'W', 'W', 'D']));

  const room = game.eval(`(function(){
    // force the reported state exactly: top of the table, target 1st
    // seal a table with this club top. The sealed array has to be built
    // before G._sealed exists: setting it changes tableKey(), which rebuilds
    // the cache and throws away any edit made to the rows first.
    const div = myDiv();
    const rows = tableRows(div).map(r => Object.assign({}, r, r.i === G.my ? {} : {pts: -99}));
    rows.sort((a,b) => b.pts - a.pts);
    G._sealed = {};
    G._sealed[div] = rows;
    const obj = boardTarget(); obj.pos = 1; obj.agreed = true;

    const F = RBSBoard.brFacts();
    const grade = RBSBoard.gradeOf(F);
    const s = boardScene('monthly');
    const before = G.clubs[G.my].patience, bank = G.clubs[G.my].budget;
    const backing = s.opts.filter(o => /back|spend|fund|money/i.test(o.lbl + ' ' + o.sub))[0];
    const line = backing ? backing.go() : '';
    return {
      pos: F.pos, target: F.target, played: F.played, atCeiling: F.atCeiling,
      band: grade.band,
      say: s.say,
      labels: s.opts.map(o => o.lbl + ' | ' + o.sub),
      backingPatience: G.clubs[G.my].patience - before,
      backingBudget: Math.round(G.clubs[G.my].budget - bank),
      backingLine: line,
    };
  })()`);

  assert.equal(room.pos, 1, 'the probe must actually put the club top');
  assert.equal(room.target, 1);
  assert.equal(room.atCeiling, true);
  assert.equal(room.band, 'flying', `first with a 1st target must be the top band, got ${room.band}`);

  // the sentence itself has to stop claiming this is roughly on plan
  assert.ok(!/about where we asked/i.test(room.say), room.say);
  assert.ok(/1st/.test(room.say));

  // nobody offers criticism to a league leader
  const labels = room.labels.join(' | ').toLowerCase();
  assert.ok(!labels.includes('take the criticism'), room.labels.join(' / '));
  assert.ok(!/own it/.test(labels), room.labels.join(' / '));

  // and asking to be backed is a conversation, not a punishment
  assert.ok(room.backingPatience >= 0,
    `asking for backing while top cost ${room.backingPatience} patience`);
  assert.ok(room.backingBudget > 0, 'a delighted board should find something');
});

test('the grade is a spectrum, not a boolean, and respects the ceiling', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const bands = game.eval(`(function(){
    const base = RBSBoard.brFacts();
    const at = (o) => {
      const F = Object.assign({}, base, {
        cupAlive: [], cupBig: null, recent: [], winRun: 0, unbeaten: 0, lossRun: 0, winless: 0,
        dropSpot: false, promoSpot: false, earlyDays: false,
      }, o);
      F.gap = F.target - F.pos;
      F.atCeiling = F.pos === 1;
      return RBSBoard.gradeOf(F).band;
    };
    return {
      ceiling:   at({pos: 1,  target: 1,  played: 5}),
      wayAhead:  at({pos: 2,  target: 10, played: 20}),
      ahead:     at({pos: 6,  target: 9,  played: 20}),
      onPlan:    at({pos: 9,  target: 9,  played: 20}),
      justShort: at({pos: 11, target: 9,  played: 20}),
      short:     at({pos: 13, target: 9,  played: 20}),
      bad:       at({pos: 16, target: 9,  played: 24}),
      crisis:    at({pos: 20, target: 4,  played: 30}),
      dropZone:  at({pos: 19, target: 18, played: 24, dropSpot: true}),
      earlyBad:  at({pos: 20, target: 4,  played: 4,  earlyDays: true}),
      order: RBSBoard.BANDS,
    };
  })()`);

  assert.equal(bands.ceiling, 'flying');
  assert.equal(bands.wayAhead, 'flying');
  assert.equal(bands.ahead, 'ahead');
  assert.equal(bands.onPlan, 'ontrack');
  assert.equal(bands.justShort, 'justshort');
  assert.equal(bands.short, 'short');
  assert.equal(bands.bad, 'bad');
  assert.equal(bands.crisis, 'crisis');

  // being in the bottom three is its own verdict whatever the target said
  assert.ok(['short', 'bad', 'crisis'].includes(bands.dropZone), bands.dropZone);
  // and nobody is in crisis after four matches
  assert.ok(['short', 'justshort', 'ontrack', 'ahead', 'flying'].includes(bands.earlyBad), bands.earlyBad);
});

test('the room has more than one version of everything it says', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  game.eval(PLAY(['W', 'W', 'D', 'L', 'W', 'D', 'W', 'W']));

  const variety = game.eval(`(function(){
    const obj = boardTarget(); obj.agreed = true;
    const lines = new Set(), labels = new Set(), replies = new Set();
    for (let i = 0; i < 16; i++) {
      G.day += 2;
      const s = boardScene('monthly');
      lines.add(s.say);
      s.opts.forEach(o => labels.add(o.lbl));
      const pick = s.opts[i % s.opts.length];
      const before = G.clubs[G.my].patience;
      replies.add(String(pick.go()));
      G.clubs[G.my].patience = before;
    }
    const check = boardScene('checkin'), rev = boardScene('review');
    return {
      lines: lines.size, labels: labels.size, replies: replies.size,
      checkinOpts: check.opts.length, reviewOpts: rev.opts.length,
      checkinSay: check.say, reviewSay: rev.say,
    };
  })()`);

  assert.ok(variety.lines >= 6, `only ${variety.lines} distinct board lines over 16 meetings`);
  assert.ok(variety.labels >= 8, `only ${variety.labels} distinct answer labels`);
  assert.ok(variety.replies >= 6, `only ${variety.replies} distinct replies`);
  assert.ok(variety.checkinOpts >= 4);
  assert.ok(variety.reviewOpts >= 3);
});

test('the funds meeting reads like the month it is held in', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  game.eval(PLAY(['W', 'W', 'D', 'W', 'W', 'W']));

  const mid = game.eval(`boardScene('review').say`);
  assert.ok(!/you finished/i.test(mid), `mid-season funds meeting said: ${mid}`);
  assert.ok(!/next season/i.test(mid), `mid-season funds meeting said: ${mid}`);
  assert.ok(/after \d+ match/i.test(mid), mid);
});

test('the board mail no longer prints an undefined target', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const target = game.eval(`(function(){
    const t = boardTarget();
    return {pos: t.pos, exp: t.exp, txt: t.txt, ordinal: ordinal(t.exp)};
  })()`);

  assert.equal(typeof target.exp, 'number');
  assert.ok(target.exp >= 1);
  assert.ok(typeof target.txt === 'string' && target.txt.length > 0);
  assert.ok(!/undefined/.test(target.txt + ' ' + target.ordinal),
    `boardTarget() still yields "${target.txt}" / "${target.ordinal}"`);
  assert.equal(target.exp, target.pos, 'both shapes must describe the same target');
});

test('a boardroom meeting can be opened and answered on screen', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  game.eval(PLAY(['W', 'W', 'W', 'D', 'W']));

  const screen = game.eval(`(function(){
    const obj = boardTarget(); obj.agreed = true;
    openBoardRoom('monthly');
    const room = document.getElementById('brRoom');
    const opts = room ? room.querySelectorAll('[data-action="brPick"]') : [];
    const before = room ? room.innerHTML.length : 0;
    if (opts.length) opts[0].click();
    const after = document.getElementById('brRoom');
    const reply = after ? /br-said/.test(after.innerHTML) : false;
    ACTIONS.brDone();
    return {opened: !!room, options: opts.length, painted: before > 0, reply,
      closed: !document.getElementById('brRoom')};
  })()`);

  assert.equal(screen.opened, true);
  assert.ok(screen.options >= 3, `only ${screen.options} answers on screen`);
  assert.equal(screen.painted, true);
  assert.equal(screen.reply, true, 'answering should paint a reply');
  assert.equal(screen.closed, true);
  assert.deepEqual(game.errors, []);
});

/*
 * Reported from a real save: take the very first meeting of a career, leave the
 * room, and the invitation is still sitting there. Go back up and the board
 * complains about your league position — on a day when nothing has been played.
 *
 * Three faults stacked in one four-line action. The invitation was only
 * withdrawn if the click carried the mail's id, and the attention strip builds
 * its button from attnAnswer(), which pushes the board item with no mid at all.
 * With no summons outstanding the fallback was 'summoned' — the crisis scene.
 * And on day one leaguePos returns a reputation-sorted position, so it read
 * "4th is not what was agreed", quoting the target back as the table.
 */
test('a summons can only be answered once', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    let d=0;
    while(!G.boardCall && d++<12){simRestOfDay();dailyTickCore();G.day++}
    if(!G.boardCall)return {skipped:true};

    const invited={kind:G.boardCall.kind,
      button:!!((G.inbox[0]||{}).actions||[]).length};

    // the attention strip's button carries no data-mid, which is the whole bug
    const strip=(typeof attnAnswer==='function')?attnAnswer():[];
    const item=strip.filter(x=>x.act==='boardGo')[0]||null;

    ACTIONS.boardGo({dataset:{}});
    const first=(BR.scene||{}).kind;
    ACTIONS.brDone();

    const invitationLeft=(G.inbox||[]).some(m=>m&&m.actions&&
      m.actions.some(a=>a&&a.act==='boardGo'));

    ACTIONS.boardGo({dataset:{}});
    const second={kind:(BR.scene||{}).kind,say:(BR.scene||{}).say};
    ACTIONS.brDone();

    return {invited,stripHasMid:item?('mid' in item):null,
      first,invitationLeft,second,played:gamesPlayed(G.my)};
  })()`);

  if (run.skipped) return;

  assert.equal(run.invited.kind, 'objectives', 'the first summons of a career');
  assert.equal(run.invited.button, true, 'and it arrives with a button');
  assert.equal(run.stripHasMid, false,
    'the attention strip still carries no mail id — the fix must not depend on one');

  assert.equal(run.first, 'objectives', 'the first press opens the meeting it invited you to');
  assert.equal(run.invitationLeft, false,
    'leaving the room must withdraw the invitation, however it was accepted');

  // and a second press must never open the crisis scene
  assert.notEqual(run.second.kind, 'summoned',
    `pressing it again opened the crisis scene: ${run.second.say}`);
  assert.equal(run.second.kind, 'checkin',
    'a button with nothing behind it is a meeting you asked for');
  assert.equal(run.played, 0, 'and none of this happened after a match');
  assert.ok(!/not what was agreed/.test(run.second.say || ''),
    `the board complained about a table that does not exist: ${run.second.say}`);
  assert.deepEqual(game.errors, []);
});
