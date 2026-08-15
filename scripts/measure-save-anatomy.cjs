#!/usr/bin/env node
/* global document, newGame, G */

/* What the save is actually made of, field by field. */
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--mute-audio']});
 const p=await b.newPage({viewport:{width:390,height:844}});
 await p.goto('file:///home/user/Manchester-United-manager-/red-devil-manager.html');
 await p.waitForTimeout(2500);
 const r=await p.evaluate(()=>{
   const clear=()=>['startScreen','frontScreen','introScreen','splash'].forEach(id=>{const el=document.getElementById(id);if(el)el.remove()});
   clear(); newGame('MUN'); clear();
   const total=JSON.stringify(G).length;
   // top-level breakdown
   const top=Object.keys(G).map(k=>{
     let n=0; try{ n=JSON.stringify(G[k]).length; }catch(e){}
     return [k,n];
   }).sort((a,b)=>b[1]-a[1]).slice(0,10);
   // inside clubs
   const c0=G.clubs[0];
   const clubNoPlayers=(()=>{const {players,...rest}=c0;return JSON.stringify(rest).length})();
   const allPlayers=G.clubs.reduce((s,c)=>s+JSON.stringify(c.players||[]).length,0);
   const nPlayers=G.clubs.reduce((s,c)=>s+(c.players||[]).length,0);
   // per-player field cost, averaged over a real squad
   const sample=G.clubs[G.my].players;
   const fields={};
   sample.forEach(pl=>Object.keys(pl).forEach(k=>{
     let n=0; try{ n=JSON.stringify(pl[k]).length+k.length+3; }catch(e){}
     fields[k]=(fields[k]||0)+n; }));
   const perPlayer=Object.entries(fields).map(([k,v])=>[k,Math.round(v/sample.length)])
     .sort((a,b)=>b[1]-a[1]);
   return {total, top, clubs:JSON.stringify(G.clubs).length, clubNoPlayers,
     allPlayers, nPlayers, nClubs:G.clubs.length,
     avgPlayerBytes:Math.round(allPlayers/nPlayers),
     perPlayer:perPlayer.slice(0,22), playerKeys:Object.keys(sample[0]).length,
     fixtures:JSON.stringify(G.fixtures||[]).length, nFix:(G.fixtures||[]).length};
 });
 console.log('TOTAL', r.total.toLocaleString(), 'bytes');
 console.log('\ntop-level:'); r.top.forEach(([k,n])=>console.log('  ',k.padEnd(14), n.toLocaleString()));
 console.log('\nclubs', r.clubs.toLocaleString(), '| of which players', r.allPlayers.toLocaleString(),
   `(${(r.allPlayers/r.total*100).toFixed(1)}% of the save)`);
 console.log(r.nClubs,'clubs |',r.nPlayers,'players | avg', r.avgPlayerBytes,'bytes each |',r.playerKeys,'fields each');
 console.log('a club without its players:', r.clubNoPlayers, 'bytes');
 console.log('fixtures', r.fixtures.toLocaleString(), 'over', r.nFix, 'rows');
 console.log('\nbytes per player, by field:');
 r.perPlayer.forEach(([k,n])=>console.log('  ',k.padEnd(14), n));
 await b.close();
})();
