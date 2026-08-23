const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   ONE ENGINE, WHICHEVER WAY YOU WATCH IT
   ---------------------------------------------------------------------
   "it should be decided by the same way a game is done if I was
    watching it in pitch mode or in rolling text or simulated it"

   This file used to assert the opposite, and that is the point of it.
   The Dugout was the authority: while the broadcast was driving, a goal
   MatchSim scored for itself was turned into a chance that did not
   quite come off, and the goals that counted were the ones the picture
   scored. Watching a match in the Dugout was therefore a different
   game from simulating it, and no season measurement could see the
   difference because they all run through quickSim.

   Now MatchSim decides in every view and the broadcast performs what it
   decided. The broadcast half of that — an armed script refusing every
   goal it is not owed, and manufacturing the ones it is — needs WebGL
   and cannot run in JSDOM. What can run, and what actually matters, is
   the seam either side of it: MatchSim must score normally with the
   Dugout driving, and every goal it scores must be handed to the
   picture exactly once, with the right scorer on the right side.
   ===================================================================== */

test('with the Dugout driving, the save scores its own goals exactly as it does anywhere else',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Live Dugout');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    /* TWO THINGS STILL TURN A GOAL AWAY AND NEITHER IS WHAT THIS TESTS.
       VAR rules one out in about sixteen, and the goal-rate calibrator
       (wA3_balance, "how a goal becomes a save") turns a further
       goalCal(div).trim of them into saves to hold the division's
       goals-a-game target. Both are the game's own football and both
       apply in every view, which is the whole point — they are exactly
       as true in the Dugout as they are on the Pitch tab. They are
       switched off here so the assertion is about the seam. */
    m._varOff=true;
    try{ goalCal(MU.fix.div).trim=0; }catch(e){}
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* live mode off — the Pitch, Commentary and Stats tabs, and the
       whole league playing itself */
    api.LIVE.on=false;
    const before=[f.hs,f.as];
    const goals0=shooter.goals;
    m.goal(A,D,shooter,null,null,false);
    out.offMode=(f.hs-before[0])+','+(f.as-before[1]);

    /* live mode on — the Dugout. Same function, same result. It is the
       same match either way, which is the entire change. */
    api.LIVE.on=true;
    const mid=[f.hs,f.as];
    m.goal(A,D,shooter,null,null,false);
    out.onMode=(f.hs-mid[0])+','+(f.as-mid[1]);
    out.tallied=shooter.goals===goals0+2;
    out.lastScorer=f.sc.length?String(f.sc[f.sc.length-1].pid):null;
    out.wantScorer=String(shooter.p.id);

    /* and a penalty the save recorded is a penalty in the save */
    const pens0=f.sc.filter(x=>x.pen).length;
    m.goal(A,D,shooter,null,null,true);
    out.penFlag=f.sc.filter(x=>x.pen).length===pens0+1;

    api.LIVE.on=false;
    return out;
  })()`);

    assert.equal(result.offMode, '1,0',
      'with no picture the save scores its own goals, as it always did');
    assert.equal(result.onMode, '1,0',
      'and with the picture watching it scores them exactly the same way');
    assert.equal(result.tallied, true, 'both are credited to the man who scored them');
    assert.equal(result.lastScorer, result.wantScorer);
    assert.equal(result.penFlag, true, 'a penalty is recorded as a penalty');
  });

test('every goal the save scores is handed to the picture once, and only once',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Posted Goals');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    m._varOff=true;
    try{ goalCal(MU.fix.div).trim=0; }catch(e){}
    api.LIVE.on=true; api.LIVE.posted=0;

    /* a stand-in for the broadcast: all postGoals wants of it is
       addGoal, and what it was told is the thing under test */
    const seen=[];
    const md={ addGoal(g){ seen.push(g); return md } };

    const home=m.sides[0], away=m.sides[1];
    const hs=home.onfield.find(x=>x.slot!=='GK');
    const as=away.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* nothing scored yet, so nothing is owed */
    api.postGoals(md,f);
    out.beforeAnyGoal=seen.length;

    m.goal(home,away,hs,null,null,false);
    api.postGoals(md,f);
    out.afterOne=seen.length;

    /* called again with nothing new: the picture must not be told twice,
       or it owes two goals and manufactures one out of nowhere */
    api.postGoals(md,f);
    out.afterRepeat=seen.length;

    m.goal(away,home,as,null,null,true);
    api.postGoals(md,f);
    out.afterTwo=seen.length;

    out.teams=seen.map(g=>g.team).join(',');
    out.pids=seen.map(g=>String(g.pid)).join(',');
    out.wantPids=String(hs.p.id)+','+String(as.p.id);
    out.finishes=seen.map(g=>String(g.finish)).join(',');
    out.minutesAreNumbers=seen.every(g=>typeof g.minute==='number'&&isFinite(g.minute));
    api.LIVE.on=false;
    return out;
  })()`);

    assert.equal(result.beforeAnyGoal, 0, 'a goalless match owes the picture nothing');
    assert.equal(result.afterOne, 1);
    assert.equal(result.afterRepeat, 1,
      'the same goal is never handed over twice — the picture would score it twice');
    assert.equal(result.afterTwo, 2);
    assert.equal(result.teams, '0,1', 'the home goal is team 0 and the away goal team 1');
    assert.equal(result.pids, result.wantPids, 'each goal names the man who actually scored it');
    assert.equal(result.finishes, 'null,sidefoot', 'a penalty is struck, not headed');
    assert.equal(result.minutesAreNumbers, true,
      'a stoppage-time goal reads "45+2" in the commentary and must still be a number here');
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
