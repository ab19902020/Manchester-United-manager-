#!/usr/bin/env node
/* eslint-disable */
/* Does every attribute actually make a difference?
 *
 *   node scripts/measure-attribute-effect.cjs [matches]
 *
 * WHY IT EXISTS. "All attributes should make a difference in the game"
 * is a claim you can either argue about or measure. This measures it:
 * two identical elevens, every attribute at 12, and then ONE attribute
 * raised to 18 on one side and dropped to 6 on the other. Anything the
 * attribute does shows up as goal difference and shot difference over
 * a run of matches; an attribute that does nothing produces a column of
 * noise around zero, which is how `leadership` was caught.
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
const N = +(process.argv[2] || 24);
/* an optional list, so one attribute can be re-checked on its own after
   it has been wired up rather than paying for all nineteen again */
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
srv.listen(0, async () => {
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox','--mute-audio','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  await p.goto('http://127.0.0.1:' + port + '/index.html');
  await p.waitForTimeout(2500);
  let booted = false;
  for (let i = 0; i < 60 && !booted; i++) {
    booted = await p.evaluate(() => { let d = document.getElementById('rigHost');
      if (!d) { d = document.createElement('div'); d.id = 'rigHost';
        d.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px'; document.body.appendChild(d); }
      window.RBSMatchday.mount(d); return !!window.Matchday; });
    if (!booted) await p.waitForTimeout(600);
  }
  if (!booted) { console.log('the engine never booted'); await b.close(); srv.close(); return; }

  /* THE CONTROL COMES FIRST, because without it there is no way to tell
     a real effect from a run of luck. It is the same test with nothing
     varied at all: whatever spread it shows is the noise floor, and
     nothing smaller than that means anything. */
  let keys = ['(control: nothing varied)'].concat(await p.evaluate(() => window.Matchday.ATTR_KEYS.slice()));
  if (ONLY.length) keys = keys.filter((k, i) => i === 0 || ONLY.indexOf(k) >= 0);
  console.log('one attribute at a time: 18 for the home side, 6 for the away side,');
  console.log('everything else 12 for both.', N, 'matches each.\n');
  console.log('attribute       goals for  against   diff   shots for  against    diff');
  const out = [];
  for (const key of keys) {
    const r = await p.evaluate(({ key, n }) => {
      const M = window.Matchday;
      const shape = M.FORMATIONS['4-3-3'];
      const squad = (level) => ({
        name: 'TEST', abbr: 'TST', shirt: '#c33', trim: '#fff', shorts: '#111', socks: '#111',
        formation: '4-3-3', mentality: 'Balanced',
        players: shape.map((s, i) => {
          const attrs = {};
          for (const k of M.ATTR_KEYS) attrs[k] = 12;
          if (M.ATTR_KEYS.indexOf(key) >= 0) attrs[key] = level;
          return { id: 't' + i, name: 'P' + i, number: i + 1, slot: s[0],
            heightCm: 182, weightKg: 76, attrs };
        }),
      });
      M.loadSquads({ home: squad(18), away: squad(6) });
      M.clearScript(); M.setHalfLength(150);
      let gf = 0, ga = 0, sf = 0, sa = 0;
      for (let i = 0; i < n; i++) {
        const s = M.simulateMatch();
        gf += s.score[0]; ga += s.score[1]; sf += s.shots[0]; sa += s.shots[1];
      }
      return { gf: gf / n, ga: ga / n, sf: sf / n, sa: sa / n };
    }, { key, n: N });
    const f = (v) => (v >= 0 ? '+' : '') + (Math.round(v * 100) / 100).toFixed(2);
    console.log(key.padEnd(15),
      r.gf.toFixed(2).padStart(8), r.ga.toFixed(2).padStart(8), f(r.gf - r.ga).padStart(7),
      r.sf.toFixed(1).padStart(10), r.sa.toFixed(1).padStart(9), f(r.sf - r.sa).padStart(8));
    out.push({ key, goals: r.gf - r.ga, shots: r.sf - r.sa });
  }
  const control = out.shift();
  out.sort((a, b) => a.shots - b.shots);
  console.log('\nnoise floor (control): goal diff ' + control.goals.toFixed(2)
    + ', shot diff ' + control.shots.toFixed(1));
  console.log('\nevery attribute by how much it moves the shot count, weakest first:');
  for (const o of out)
    console.log('  ' + o.key.padEnd(14), 'shots', (o.shots >= 0 ? '+' : '') + o.shots.toFixed(1).padStart(5),
      '  goals', (o.goals >= 0 ? '+' : '') + o.goals.toFixed(2));
  await b.close(); srv.close();
});
