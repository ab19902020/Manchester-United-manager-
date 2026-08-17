#!/usr/bin/env node
/* eslint-disable */
/* Do the attributes show on the pitch?
 *
 *   node scripts/measure-player-speed.cjs
 *
 * Plays one match with two real squads and prints every player's top
 * speed reached and ground covered against the pace he was given. The
 * answer to "every player seems the same speed" is a number, and this
 * is where it comes from: before the speed pass the whole squad sat
 * between 7.7 and 9.2 m/s, an 18% spread across the entire range of the
 * attribute. Real football is 7.5 to 10.3, which is 37%.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const T = {'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]);
  if (f === '/') f = '/index.html'; const p = path.join(ROOT, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, {'content-type': T[path.extname(p)] || 'application/octet-stream'});
  fs.createReadStream(p).pipe(r); });
srv.listen(0, async () => {
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox','--mute-audio','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const gp = await b.newPage({ viewport: { width: 390, height: 844 } });
  await gp.goto('http://127.0.0.1:' + port + '/index.html');
  await gp.waitForTimeout(2500); await gp.mouse.click(195, 400); await gp.waitForTimeout(1200);
  const squads = await gp.evaluate(async () => {
    const clear = () => ['startScreen','frontScreen','introScreen','splash'].forEach(i => { const e = document.getElementById(i); if (e) e.remove(); });
    clear(); newGame('MUN'); clear();
    for (let d = 0; d < 20; d++) { try { await advanceDay(); } catch (e) {} }
    const api = window.RBSDugoutMatchday;
    const build = c => api.squadFor(new MatchSim({ h: c.i, a: c.i, sc: [] }).sides[0]);
    const pl = G.clubs.filter(c => c.league === 'PL').sort((a, b) => b.rep - a.rep);
    return { home: build(pl[0]), away: build(pl[pl.length - 1]) };
  });
  await gp.close();
  const mp = await b.newPage({ viewport: { width: 844, height: 390 } });
  await mp.goto('http://127.0.0.1:' + port + '/index.html');
  await mp.waitForTimeout(2500);
  let booted = false;
  for (let i = 0; i < 60 && !booted; i++) {
    booted = await mp.evaluate(() => { let d = document.getElementById('rigHost');
      if (!d) { d = document.createElement('div'); d.id = 'rigHost';
        d.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px'; document.body.appendChild(d); }
      window.RBSMatchday.mount(d); return !!window.Matchday; });
    if (!booted) await mp.waitForTimeout(600);
  }
  const out = await mp.evaluate(({ H, A }) => {
    const M = window.Matchday;
    M.loadSquads({ home: H, away: A }); M.clearScript(); M.setHalfLength(150);
    const s = M.simulateMatch();
    const rows = M.playerReport();
    return { rows, diag: 'one match, ' + s.ticks + ' ticks, ' + s.score.join('-') };
  }, { H: squads.home, A: squads.away });
  const rows = out.rows; console.log(out.diag);
  rows.sort((x, y) => y.pace - x.pace);
  console.log('pace  accel  topSpeed  peak   m/s spread   metres  who');
  for (const r of rows) console.log(
    String(r.pace).padStart(4), String(r.acceleration).padStart(6),
    String(r.topSpeed).padStart(9), String(r.peak).padStart(6),
    ' '.repeat(6), String(r.metres).padStart(6), ' ', r.slot, r.name);
  const peaks = rows.map(r => r.peak).filter(v => v > 0);
  const tops = rows.map(r => r.topSpeed);
  const f = (v) => Math.round(v * 100) / 100;
  console.log('\ntop speed on paper : ' + f(Math.min(...tops)) + ' to ' + f(Math.max(...tops))
    + ' m/s  (' + Math.round((Math.max(...tops) / Math.min(...tops) - 1) * 100) + '% spread)');
  console.log('top speed reached  : ' + f(Math.min(...peaks)) + ' to ' + f(Math.max(...peaks))
    + ' m/s  (' + Math.round((Math.max(...peaks) / Math.min(...peaks) - 1) * 100) + '% spread)');
  console.log('for scale, real football: about 7.5 m/s for a slow centre-half, 10.3 for the quickest men alive (37% spread)');
  await b.close(); srv.close();
});
