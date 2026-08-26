const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   ONE ENGINE, THREE WINDOWS
   ---------------------------------------------------------------------
   "Completely rip out dugout view. No replays. No actual match engine
    like that. The only match engine now will be the pitch view, the
    text, and the stats, and all of that will be displaying the same
    information no matter what. It needs to go back to the proper core of
    a football manager game -- your decisions, the fitness, the
    attributes will decide the game."

   This file replaces tests/dugout-live.test.cjs and
   tests/dugout-renderer.test.cjs, which tested a second match engine
   that no longer exists: a 3D broadcast, a live Dugout driving the
   match, a highlights reel and a staged re-enactment of every goal.
   Every one of those was a SECOND account of a match MatchSim had
   already decided, and all the machinery that kept the two in step --
   held clocks, forced penalties, staged chances, an escalation ladder --
   existed only because there were two of them.

   So what is asserted here is the shape of the game rather than the
   behaviour of a picture: three tabs, one engine behind all three, and
   nothing left that can put a second one back.

   The one test carried over from the old file is the goal-rate
   calibrator, at the bottom. It is not about any view -- it is about a
   goal the save turns down never reaching the score -- and it was worth
   keeping.
   ===================================================================== */

async function intoAMatch(game, name) {
  await startCareer(game, name);
  return game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    return { open: !!(MU && MU.m), tab: MU.tab };
  })()`);
}

test('the match has three tabs and the Dugout is not one of them',
  { timeout: 60000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    const started = await intoAMatch(game, 'Three Tabs');
    assert.ok(started.open, 'the match should be running');

    const out = game.eval(`(()=>{
    const chips=[...document.querySelectorAll('#matchScreen [data-action="mtab"]')];
    return {
      tabs: chips.map(c=>c.dataset.v).join(','),
      labels: chips.map(c=>c.textContent.trim()).join(' | '),
      lit: chips.filter(c=>c.classList.contains('on')).map(c=>c.dataset.v).join(','),
      openedOn: MU.tab,
      /* and the list every layer maps over says the same thing */
      table: (typeof MTABS!=='undefined'?MTABS:[]).map(t=>t[0]).join(',')
    };
  })()`);

    assert.equal(out.tabs, 'pitch,comm,stats',
      'the bar carries the Pitch, the Text and the Stats: got ' + out.tabs);
    assert.equal(out.table, 'pitch,comm,stats', 'and so does MTABS');
    assert.equal(out.openedOn, 'pitch', 'a match opens on the Pitch');
    assert.equal(out.lit, 'pitch', 'and something is always lit');
  });

test('each tab renders its own body, and the Pitch has a canvas to draw on',
  { timeout: 60000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await intoAMatch(game, 'Bodies');

    const out = game.eval(`(()=>{
    const go=v=>{ ACTIONS.mtab({dataset:{v}});
      const b=document.getElementById('mBody');
      return { tab:MU.tab,
        pitch: !!document.getElementById('pitchCanvas'),
        dug: !!document.getElementById('dugCanvas'),
        comm: !!document.getElementById('commList'),
        stats: !!document.getElementById('statBox'),
        empty: !b || !b.innerHTML.trim() };
    };
    return { pitch:go('pitch'), comm:go('comm'), stats:go('stats'),
      /* a save that was mid-match on the Dugout when this landed */
      legacy:go('dugout') };
  })()`);

    assert.equal(out.pitch.tab, 'pitch');
    assert.ok(out.pitch.pitch, 'the Pitch tab renders a pitch canvas');
    assert.ok(!out.pitch.dug, 'and never the projected dugout canvas');
    assert.ok(!out.pitch.empty, 'the body is not blank');

    assert.equal(out.comm.tab, 'comm');
    assert.ok(out.comm.comm, 'the Text tab renders the commentary list');

    assert.equal(out.stats.tab, 'stats');
    assert.ok(out.stats.stats, 'the Stats tab renders the stat box');

    /* THE OLD TAB CANNOT BE REACHED, by a stale save or by anything else */
    assert.equal(out.legacy.tab, 'pitch',
      'asking for the Dugout puts you on the Pitch');
    assert.ok(!out.legacy.dug, 'and does not render the dugout canvas');
  });

test('the second match engine is gone from the page', { timeout: 60000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'One Engine');

  const out = game.eval(`(()=>({
    highlights: typeof window.RBSHighlights,
    broadcast: typeof window.RBSMatchday,
    live: typeof window.RBSDugoutMatchday,
    engine: typeof window.Matchday,
    renderer: typeof window.RBSDugoutRenderer,
    /* and the one that decides a match is still here */
    sim: typeof MatchSim,
    /* as is everything a matchday is made of, none of which was asked
       to go: the speed control, the dressing room, the substitutions,
       the shouts and the report */
    speed: typeof ACTIONS.mspeed,
    subs: typeof ACTIONS.subOpen,
    report: typeof ACTIONS.matchReport,
    drama: typeof window.RBSDugoutDrama
  }))()`);

  assert.equal(out.highlights, 'undefined', 'the highlights reel is gone');
  assert.equal(out.broadcast, 'undefined', 'the 3D broadcast is gone');
  assert.equal(out.live, 'undefined', 'the live Dugout driver is gone');
  assert.equal(out.engine, 'undefined', 'and nothing has mounted one');
  assert.equal(out.renderer, 'undefined', 'as is the dugout renderer');

  assert.equal(out.sim, 'function', 'MatchSim is what decides a match');
  assert.equal(out.subs, 'function', 'substitutions are untouched');
  assert.equal(out.report, 'function', 'and so is the match report');
});

test('the three windows agree, because there is only one match behind them',
  { timeout: 60000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await intoAMatch(game, 'One Truth');

    const out = game.eval(`(()=>{
    const m=MU.m, f=MU.fix;
    m._varOff=true;
    try{ goalCal(f.div).trim=0; }catch(e){}
    /* play it out. The match loop ticks the model and then repaints the
       top of the screen; ticking the model on its own leaves the
       scoreboard on 0-0, which is the view doing exactly what it should
       -- it shows what it was last told, and it decides nothing. */
    let guard=0;
    while(!m.done && guard++<400) m.tickOnce();
    try{ renderTop(); }catch(e){}

    ACTIONS.mtab({dataset:{v:'stats'}});
    const statsHtml=(document.getElementById('statBox')||{}).innerHTML||'';
    ACTIONS.mtab({dataset:{v:'comm'}});
    const commHtml=(document.getElementById('commList')||{}).innerHTML||'';
    ACTIONS.mtab({dataset:{v:'pitch'}});

    const A=m.sides[0].st||{}, D=m.sides[1].st||{};
    return {
      score: f.hs+'-'+f.as,
      board: (document.getElementById('mScore')||{}).textContent||'',
      goalsRecorded: (f.sc||[]).length,
      goalsInFeed: (m.feed||[]).filter(e=>e && e.cls==='goal').length,
      shots: (A.sh||0)+(D.sh||0),
      statsMentionsShots: statsHtml.indexOf(String(A.sh))>=0,
      commHasLines: commHtml.length>40,
      done: m.done
    };
  })()`);

    assert.ok(out.done, 'the match finished');
    /* the scoreboard is the fixture's score, not a picture's idea of it */
    assert.equal(out.board.replace(/[^0-9]/g, '-').replace(/^-|-$/g, ''),
      out.score.replace('-', '-'),
      'the scoreboard reads the fixture score: board ' + out.board
      + ', fixture ' + out.score);
    /* every goal in the record is a goal in the text */
    assert.equal(out.goalsInFeed, out.goalsRecorded,
      'the Text tab names every goal the save recorded: ' + out.goalsInFeed
      + ' against ' + out.goalsRecorded);
    assert.ok(out.statsMentionsShots, 'the Stats tab shows the shots the match had');
    assert.ok(out.commHasLines, 'and the Text tab has the commentary in it');
  });

/* =====================================================================
   CARRIED OVER: A GOAL THE SAVE TURNS DOWN IS NOT A GOAL
   ---------------------------------------------------------------------
   The goal-rate calibrator holds a division near its real goals-a-game
   by turning some goals into saves. It cannot see the league table, who
   is playing or who is winning -- it is a dial on the football, not a
   thumb on the scale -- and it has to be able to refuse a goal without
   the score, the scorer list or the commentary disagreeing about what
   happened. That was worth keeping when the rest of the old file went.
   ===================================================================== */
test('a goal the calibrator turns down never reaches the score',
  { timeout: 60000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await intoAMatch(game, 'Trimmed Goals');

    const result = game.eval(`(()=>{
    const m=MU.m, f=MU.fix;
    m._varOff=true;
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* every goal turned down: the division is scoring far too freely */
    goalCal(f.div).trim=1;
    const feed0=m.feed.length;
    for(let i=0;i<20;i++) m.goal(A,D,shooter,null,null,false);
    out.score=f.hs+','+f.as;
    out.scorers=f.sc.length;
    out.saidSomething=m.feed.length>feed0;
    out.saves=D.st.sv;

    /* none turned down: they all count */
    goalCal(f.div).trim=0;
    for(let i=0;i<5;i++) m.goal(A,D,shooter,null,null,false);
    out.scoreAfter=f.hs+','+f.as;
    out.scorersAfter=f.sc.length;
    return out;
  })()`);

    assert.equal(result.score, '0,0',
      'a goal the calibrator turns down never moves the score');
    assert.equal(result.scorers, 0, 'and nobody is credited with it');
    assert.equal(result.saidSomething, true,
      'the commentary says a save rather than going quiet');
    assert.ok(result.saves >= 20, 'and the goalkeeper is credited with the saves');
    assert.equal(result.scoreAfter, '5,0', 'with the calibrator idle every goal counts');
    assert.equal(result.scorersAfter, 5, 'and every one of them names its scorer');
  });
