#!/usr/bin/env node
/* eslint-disable */
/* Headless balance rig for the Matchday engine.
 *
 *   node scripts/measure-matchday-balance.cjs [matches]
 *
 * WHY IT EXISTS. The frame loop caps at eight sub-steps a frame, so how
 * fast a match runs is bound by the frame rate -- under a software
 * renderer ninety minutes takes six real minutes, and you cannot tune a
 * football engine six minutes at a time. Matchday.simulateMatch() runs
 * the same tick() with no rendering, so this plays full matches in
 * milliseconds and reports what actually comes out: goals a game, how
 * often the better side wins, and the shot counts that explain why.
 */
/* Headless tuning rig: many full matches, no rendering. Reports goals a
 * game, how often the better side wins, and what the shape of a squad
 * does to goals for and against. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/Manchester-United-manager-';
const T={'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((q,r)=>{let f=decodeURIComponent(q.url.split('?')[0]);
 if(f==='/')f='/index.html';const p=path.join(ROOT,f);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);r.end('no');return;}
 r.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream'});
 fs.createReadStream(p).pipe(r);});
const N = +(process.argv[2]||10);
srv.listen(0, async()=>{
 const port=srv.address().port;
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--mute-audio','--use-gl=swiftshader','--enable-unsafe-swiftshader']});

 /* real squads from a real save */
 const gp=await b.newPage({viewport:{width:390,height:844}});
 await gp.goto('http://127.0.0.1:'+port+'/index.html');
 await gp.waitForTimeout(2500); await gp.mouse.click(195,400); await gp.waitForTimeout(1200);
 const squads=await gp.evaluate(async()=>{
  const clear=()=>['startScreen','frontScreen','introScreen','splash'].forEach(i=>{const e=document.getElementById(i);if(e)e.remove()});
  clear(); newGame('MUN'); clear();
  for(let d=0;d<20;d++){ try{ await advanceDay(); }catch(e){} }
  const api=window.RBSDugoutMatchday;
  const build=c=>{ const m=new MatchSim({h:c.i,a:c.i,sc:[]}); return api.squadFor(m.sides[0]); };
  const pl=G.clubs.filter(c=>c.league==='PL').sort((a,b)=>b.rep-a.rep);
  const nl=G.clubs.filter(c=>c.league==='NL').sort((a,b)=>a.rep-b.rep);
  const avg=(s,ks)=>{let t=0,n=0;s.players.forEach(p=>ks.forEach(k=>{t+=(p.attrs[k]||10);n++}));return (t/n).toFixed(1)};
  const out={ best:build(pl[0]), sixth:build(pl[5]), worstPL:build(pl[pl.length-1]), nonleague:build(nl[0]) };
  out.names=[pl[0].name, pl[5].name, pl[pl.length-1].name, nl[0].name];
  out.tac=Object.fromEntries(['best','sixth','worstPL','nonleague'].map(k=>
    [k, out[k].formation+' / '+out[k].mentality]));
  out.rate=k=>0;
  out.quality=Object.fromEntries(Object.entries(out).filter(([k,v])=>v&&v.players).map(([k,v])=>
    [k, {att:avg(v,['shooting','firstTouch','composure']), def:avg(v,['tackling','positioning','heading','strength'])}]));
  return out;
 });
 await gp.close();
 console.log('teams:', squads.names.join(' | '));
 console.log('quality:', JSON.stringify(squads.quality));
 console.log('tactics:', JSON.stringify(squads.tac));

 const mp=await b.newPage({viewport:{width:844,height:390}});
 const errs=[]; mp.on('pageerror',e=>errs.push(String(e).slice(0,140)));
 await mp.goto('http://127.0.0.1:'+port+'/matchday.html');
 await mp.waitForTimeout(5000);

 const run=async(h,a,n)=>{
   return await mp.evaluate(({H,A,n})=>{
     const res=[];
     Matchday.loadSquads({home:H,away:A}); Matchday.clearScript(); Matchday.setHalfLength(240);
     for(let i=0;i<n;i++){ const s=Matchday.simulateMatch(); res.push({sc:s.score.slice(),
       sh:s.shots.slice(), ok:s.completed}); }
     return res;
   },{H:squads[h],A:squads[a],n});
 };
 const rep=(label,r)=>{
   const g=r.reduce((t,x)=>t+x.sc[0]+x.sc[1],0)/r.length;
   const hw=r.filter(x=>x.sc[0]>x.sc[1]).length, d=r.filter(x=>x.sc[0]===x.sc[1]).length;
   const done=r.filter(x=>x.ok).length;
   console.log(label.padEnd(22), 'goals/game', g.toFixed(2),
     '| home', hw+'/'+r.length, 'draw', d, '| shots',
     (r.reduce((t,x)=>t+x.sh[0],0)/r.length).toFixed(1)+'-'+(r.reduce((t,x)=>t+x.sh[1],0)/r.length).toFixed(1),
     '| completed', done+'/'+r.length);
   console.log('   ', r.slice(0,10).map(x=>x.sc.join('-')).join('  '));
 };
 rep('best v nonleague', await run('best','nonleague',N));
 rep('best v sixth',     await run('best','sixth',N));
 rep('best v worstPL',   await run('best','worstPL',N));
 console.log('errors:', errs.length?errs.slice(0,2):'none');
 await b.close(); srv.close();
});
