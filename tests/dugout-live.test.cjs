const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE INVERSION, TESTED WHERE IT CAN BE TESTED
   ---------------------------------------------------------------------
   The broadcast needs WebGL and JSDOM has none, so the picture itself
   cannot run here. What can run — and what actually matters — is the
   seam the picture drives through: while live mode is on, a goal
   MatchSim invents for itself must be turned away, and a goal handed in
   from outside must go through with the scorer it names.

   That is the whole of the architecture change: if this holds, the save
   cannot score a goal the picture did not, and cannot miss one it did.
   ===================================================================== */

test('while the picture is driving, the save cannot score a goal of its own',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Live Dugout');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    /* TWO THINGS TURN A GOAL AWAY, AND NEITHER IS WHAT THIS TESTS.
       VAR rules one out in about sixteen. The goal-rate calibrator
       (wA3_balance, "how a goal becomes a save") turns a further
       goalCal(div).trim of them into saves to hold the division's
       goals-a-game target — six per cent to start with, and it retunes.

       That second one is what the intermittent failure of this test
       was. scripts/probe-dugout-flake.cjs reproduced it 2 times in 14
       and printed varOff true before and after, live mode off, the
       right match, a shooter found, the match not done — every
       candidate ruled out, and the score simply not moving. It was the
       calibrator doing its job. m.goal() has never been a promise that
       the score moves, which is the same fact the seam itself has to
       respect. */
    m._varOff=true;
    try{ goalCal(MU.fix.div).trim=0; }catch(e){}
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* with live mode off — no picture, which is this device — the game
       plays itself exactly as it always has */
    api.LIVE.on=false;
    const before=[f.hs,f.as];
    m.goal(A,D,shooter,null,null,false);
    out.offMode=(f.hs-before[0])+','+(f.as-before[1]);

    /* with the picture driving, MatchSim's own goal becomes a chance */
    api.LIVE.on=true;
    const mid=[f.hs,f.as];
    const feed0=m.feed.length;
    m.goal(A,D,shooter,null,null,false);
    out.suppressed=(f.hs===mid[0] && f.as===mid[1]);
    out.saidInstead=m.feed.slice(feed0).map(e=>e.text);

    /* and the picture's goal goes through the same door */
    const goals0=shooter.goals;
    api.injectGoal({team:0, pid:String(shooter.p.id), scorer:shooter.p.name});
    out.wentThrough=(f.hs+f.as)===(mid[0]+mid[1]+1);
    out.lastScorer=f.sc.length?String(f.sc[f.sc.length-1].pid):null;
    out.wantScorer=String(shooter.p.id);
    out.tallied=shooter.goals===goals0+1;

    /* a penalty in the picture is recorded as a penalty in the save */
    api.LIVE.pen=1;
    api.injectGoal({team:1, pid:String(D.onfield.find(x=>x.slot!=='GK').p.id)});
    out.penFlag=!!f.sc[f.sc.length-1].pen;
    out.awaySide=f.sc[f.sc.length-1].ci===f.a;

    api.LIVE.on=false;
    return out;
  })()`);

    assert.equal(result.offMode, '1,0',
      'with no picture the game scores its own goals, as it always did');
    assert.equal(result.suppressed, true,
      'with the picture driving, MatchSim may not move the score');
    assert.equal(result.saidInstead.length, 1,
      'and it says what happened instead rather than going quiet');
    assert.match(result.saidInstead[0], /post|wide|keeper|goalkeeper|defender/i);
    assert.equal(result.wentThrough, true, 'the picture\'s goal does move the score');
    assert.equal(result.lastScorer, result.wantScorer, 'and it is credited to the man who scored it');
    assert.equal(result.tallied, true);
    assert.equal(result.penFlag, true, 'a penalty is recorded as a penalty');
    assert.equal(result.awaySide, true, 'and team 1 is the away side');
  });

test('the tab you are on is the tab that is lit', { timeout: 45000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Match Tabs');

  const lit = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const read=()=>[...document.querySelectorAll('#matchScreen .mtabs [data-action="mtab"]')]
      .filter(b=>b.classList.contains('on')).map(b=>b.dataset.v).join(',');
    const out={atKickoff:read(), after:{}};
    ['comm','stats','pitch','dugout'].forEach(v=>{
      ACTIONS.mtab(document.querySelector('.mtabs [data-v="'+v+'"]'));
      out.after[v]=read();
    });
    return out;
  })()`);

  /* kick-off opens on the football, not on the 2D pitch */
  assert.equal(lit.atKickoff, 'dugout');
  assert.equal(lit.after.comm, 'comm');
  assert.equal(lit.after.stats, 'stats');
  assert.equal(lit.after.pitch, 'pitch');
  assert.equal(lit.after.dugout, 'dugout');
});
