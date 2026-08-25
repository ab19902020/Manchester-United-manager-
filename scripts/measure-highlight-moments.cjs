#!/usr/bin/env node
/* eslint-disable */
/* HOW LONG A HIGHLIGHT TAKES, AND WHETHER IT COMES OFF AT ALL.
 *
 *   node scripts/measure-highlight-moments.cjs [moments]
 *
 * A moment is staged by Matchday.playMoment(): both sides placed as
 * they would be with the ball in the final third, the scorer in the
 * area, and the clip opening on the pass already travelling. This plays
 * a run of them and reports, for each, how much MATCH time passed
 * between the pass and the ball crossing the line, and which phases the
 * engine went through on the way.
 *
 * Match seconds, not real seconds: a half is `halfLen` seconds of
 * playback for 45 match minutes, so at the default 240 one engine
 * second is about eleven match seconds. A median of 49 match-seconds is
 * therefore about four and a half seconds of watching, which is the
 * length a highlight should be.
 *
 * WHAT TO LOOK FOR IN THE PHASE COLUMN. `play>goal` is the clip working.
 * A `restart` in there is a corner or a throw, which happens and is
 * football. A `half` in there is a fault -- it means the clock was set
 * on a half boundary and the picture blew the whistle instead of showing
 * the goal.
 *
 * This runs under SwiftShader, so the wall-clock column measures the
 * software renderer and not a phone. The match-seconds column is the
 * one that means anything.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const N = +(process.argv[2] || 8);
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--mute-audio','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport:{width:640,height:300} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.goto('file://' + path.resolve('/home/user/Manchester-United-manager-','index.html'));
  await p.waitForTimeout(3000);
  const booted = await p.evaluate(async () => {
    const clear=()=>['startScreen','frontScreen','introScreen','splash'].forEach(i=>{const e=document.getElementById(i);if(e)e.remove()});
    clear(); newGame('MUN'); clear();
    const d=document.createElement('div'); d.id='rigHost';
    d.style.cssText='position:fixed;left:0;top:0;width:640px;height:300px;z-index:50';
    document.body.appendChild(d);
    for(let i=0;i<40;i++){ window.RBSMatchday.mount(d); if(window.Matchday) break;
      await new Promise(r=>setTimeout(r,300)); }
    return !!window.Matchday;
  });
  if(!booted){ console.log('no engine'); await b.close(); return; }
  await p.waitForTimeout(1200);

  const rows = [];
  for (let i=0;i<N;i++){
    const r = await p.evaluate(async ({ i }) => {
      const M = window.Matchday;
      let goalAt = null;
      const onGoal = () => { goalAt = M.getState().elapsed; };
      M.on('goal', onGoal);
      const team = i % 2;
      const ok = M.playMoment({ team, pen:false, minute: 10 + i*7, first: i===0 });
      const start = M.getState().elapsed;
      let waited = 0; const phases = [];
      while (waited < 40 && goalAt == null) {
        await new Promise(r2=>setTimeout(r2,250)); waited += 0.25;
        const ph = M.getState().phase;
        if (phases[phases.length-1] !== ph) phases.push(ph);
      }
      M.off('goal', onGoal);
      const st = M.getState();
      return { ok, team, start, goalAt, wall: waited, phases, score: st.score.slice(),
        matchSeconds: goalAt == null ? null : Math.round((goalAt-start)*60) };
    }, { i });
    rows.push(r);
    console.log('  moment ' + (i+1) + ': team ' + r.team
      + '  ' + (r.matchSeconds == null ? 'NO GOAL' : r.matchSeconds + ' match-seconds')
      + '   (' + r.wall + 's wall)   score ' + r.score.join('-')
      + '   phases: ' + (r.phases||[]).join('>'));
    /* let the celebration finish so the next one starts clean */
    await p.waitForTimeout(1500);
  }
  const got = rows.filter(r=>r.matchSeconds!=null).map(r=>r.matchSeconds).sort((a,b)=>a-b);
  console.log('\n  came off: ' + got.length + '/' + rows.length);
  if (got.length) console.log('  match-seconds  median ' + got[Math.floor(got.length/2)]
    + '   min ' + got[0] + '   max ' + got[got.length-1]);
  console.log('  errors:', errs.length?errs.slice(0,2):'none');
  await b.close();
})();
