#!/usr/bin/env node
/* Reproduce, with diagnostics, the dugout-live assertion that failed once:
 *
 *     assert.equal(result.offMode, '1,0')
 *
 * It runs the test's own setup in a fresh page N times and prints the
 * state of everything that could stop m.goal() moving the score: whether
 * VAR was actually disabled, whether the broadcast had taken the goal
 * over, whether the match under test is still MU.m, whether a shooter
 * was found.
 *
 * Twenty-one consecutive passes as of writing, so this exists to be run
 * again rather than to prove anything today. If it ever fails, the
 * printed line says which of those it was.
 *
 *   node scripts/probe-dugout-flake.cjs
 */
const { createGame, startCareer } = require('/home/user/Manchester-United-manager-/tests/game-harness.cjs');
(async () => {
  let fails = 0;
  for (let run = 1; run <= 14; run += 1) {
    const g = await createGame();
    await startCareer(g, 'Live Dugout');
    const out = g.eval(`(()=>{
      G.day=nextUserFixture().day;
      UI.view='home';render();ACTIONS.advance();
      ACTIONS.kickoff();
      const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
      m._varOff=true;
      const A=m.sides[0], D=m.sides[1];
      const shooter=A.onfield.find(x=>x.slot!=='GK');
      api.LIVE.on=false;
      const before=[f.hs,f.as];
      const diag={varOffBefore:m._varOff, varInUse:(typeof varInUse==='function')?varInUse(f):null,
        liveOn:api.LIVE.on, liveWant:api.LIVE.want, sameMatch:(m===MU.m),
        shooter:!!shooter, done:!!m.done, sides0IsHome:(m.sides[0]===m._side?null:true),
        hsBefore:f.hs, asBefore:f.as, minute:m.min};
      m.goal(A,D,shooter,null,null,false);
      diag.offMode=(f.hs-before[0])+','+(f.as-before[1]);
      diag.varOffAfter=m._varOff;
      /* THE ANSWER. The goal-rate calibrator (wA3_balance, "how a goal
         becomes a save") turns this share of goals into saves to hold
         the division's goals-a-game target. m.goal() has never been a
         promise that the score moves, and this is the other reason. */
      try{ const c=goalCal(f.div); diag.trim=Math.round(c.trim*1000)/1000; diag.calN=c.n; }
      catch(e){ diag.trim='n/a'; }
      /* and prove it: with the trim at zero it should not happen again */
      try{ goalCal(f.div).trim=0; }catch(e){}
      let scored=0;
      for(let k=0;k<20;k++){
        const was=f.hs+f.as;
        m.goal(A,D,shooter,null,null,false);
        if(f.hs+f.as>was) scored++;
      }
      diag.withTrimZero=scored+'/20';
      return diag;
    })()`);
    const ok = out.offMode === '1,0';
    if (!ok) { fails += 1; console.log('FAIL run', run, JSON.stringify(out)); }
    else if (run === 1) console.log('pass sample:', JSON.stringify(out));
    g.close();
  }
  console.log('failures:', fails, 'of 14');
})();
