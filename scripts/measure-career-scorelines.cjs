#!/usr/bin/env node
/* global window, document, G, newGame, advanceDay, userMatchOn, simInstant, MU, endSeason:writable */

/* THE SCORELINES A REAL CAREER PRODUCES.
 *
 *   node scripts/measure-career-scorelines.cjs [seasons] [seed]
 *
 * scripts/measure-title-race.cjs plays a division back to back with its
 * own idea of the calendar: a fixed number of days' rest between rounds,
 * recovery added by hand, no cups, no rotation, no injuries healing. It is
 * fast, and it is right about the table, but its draw rate and its 0-0s
 * move with that rest assumption — three days reads 13% goalless, which
 * no career ever sees.
 *
 * This plays the game itself: newGame, then advanceDay() day after day,
 * with the manager's own fixtures run through the game's instant sim. So
 * the calendar, the cups, Europe, recovery, injuries healing, the AI's
 * selection and every other club's season are exactly what a player's
 * career contains. At each season's end — the last moment the fixtures
 * still exist — it reads every played English league match and reports
 * what football is judged on: home/draw/away, goals, 0-0s, the commonest
 * scorelines, and how often a side fails to score.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';
const path = require('path');

const SEASONS = Number(process.argv[2] || 1);
const SEED = Number(process.argv[3] || 20261011);
const ENGLAND = ['PL', 'CH', 'L1', 'L2', 'NL'];

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (/^\[rig\]/.test(m.text())) console.log(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction('typeof newGame === "function"', { timeout: 120000 });

  const result = await page.evaluate(async ({ seasons, seed, divs }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    const real = Math.random;
    Math.random = window.RBSWorldSeed.mulberry32(seed >>> 0);
    newGame('MUN');
    clear();

    const matches = [];
    let captured = 0;
    const passEnd = endSeason;
    endSeason = function capturingEnd() {
      try {
        (G.fixtures || []).forEach((f) => {
          if (!f.played || f.cup || !divs.includes(f.div || (G.clubs[f.h] || {}).league)) return;
          matches.push({ div: f.div || G.clubs[f.h].league, hs: f.hs, as: f.as });
        });
        captured += 1;
        console.log('[rig] season ' + G.season + ' captured, ' + matches.length + ' league matches so far');
      } catch (e) { console.log('[rig] capture failed ' + e); }
      return passEnd.apply(this, arguments);
    };

    const start = G.season;
    let guard = 0;
    while (captured < seasons && guard++ < 420 * seasons) {
      try {
        for (let k = 0; k < 3; k += 1) {
          const fixture = userMatchOn(G.day);
          if (!fixture || fixture.played) break;
          MU.fix = fixture; MU.m = null;
          if (!simInstant()) break;
        }
      } catch (e) { /* pre-season */ }
      try { G.inbox.forEach((m) => { if (m.actions) { m.actions = null; m.must = false; } }); } catch (e) { /* none */ }
      try { await advanceDay(); } catch (e) { /* a decision */ }
      if (G.sacked) { console.log('[rig] sacked'); break; }
    }
    Math.random = real;
    return { matches, seasons: G.season - start };
  }, { seasons: SEASONS, seed: SEED, divs: ENGLAND });

  const by = {};
  const all = { n: 0, h: 0, d: 0, a: 0, hg: 0, ag: 0, nil: 0, blank: 0, lines: {} };
  result.matches.forEach((m) => {
    const rows = [all, by[m.div] = by[m.div] || { n: 0, h: 0, d: 0, a: 0, hg: 0, ag: 0, nil: 0, blank: 0, lines: {} }];
    rows.forEach((r) => {
      r.n += 1; r.hg += m.hs; r.ag += m.as;
      if (m.hs > m.as) r.h += 1; else if (m.hs < m.as) r.a += 1; else r.d += 1;
      if (m.hs === 0 && m.as === 0) r.nil += 1;
      r.blank += (m.hs === 0 ? 1 : 0) + (m.as === 0 ? 1 : 0);
      const key = Math.min(m.hs, 5) + '-' + Math.min(m.as, 5);
      r.lines[key] = (r.lines[key] || 0) + 1;
    });
  });
  const pct = (x, n) => (100 * x / n).toFixed(1) + '%';
  const show = (name, r) => {
    if (!r.n) return;
    const top = Object.entries(r.lines).sort((x, y) => y[1] - x[1]).slice(0, 6)
      .map(([k, v]) => k + ' ' + pct(v, r.n)).join('  ');
    console.log(`${name.padEnd(8)} ${String(r.n).padStart(5)} matches  home ${pct(r.h, r.n)}  draw ${pct(r.d, r.n)}  away ${pct(r.a, r.n)}`
      + `  goals ${((r.hg + r.ag) / r.n).toFixed(2)} (${(r.hg / r.n).toFixed(2)}-${(r.ag / r.n).toFixed(2)})`
      + `  0-0 ${pct(r.nil, r.n)}  blank ${pct(r.blank, 2 * r.n)}`);
    console.log(`         commonest: ${top}`);
  };
  console.log(`\n${result.seasons} season(s) of a played career, seed ${SEED}`);
  console.log('real English football: home ~44%  draw ~25%  away ~31%  goals ~2.7  0-0 ~7-8%  blank ~27%\n');
  ENGLAND.forEach((d) => show(d, by[d] || { n: 0 }));
  show('ENGLAND', all);
  console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
