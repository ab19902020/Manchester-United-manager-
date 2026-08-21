#!/usr/bin/env node
/* eslint-disable */
/* What actually happens to the world over a long career?
 *
 *   node scripts/measure-league-history.cjs [seasons] [report]
 *
 * Plays the game through its own controller -- advanceDay() and the
 * game's own instant sim for the user's fixtures -- and, on the way past
 * each season's end, writes down every division's final table, the cup
 * winners and the golden boot. Seasons are captured by wrapping
 * `endSeason`, which is the last moment the tables still exist: the very
 * next thing the game does is promote, relegate and rebuild the fixture
 * list.
 *
 * It exists because a football game can look right for ninety minutes
 * and still be wrong over five years -- the same club winning every
 * title, promoted sides bouncing straight back down, scoring drifting
 * up a goal a season. That is not visible from one match and it is
 * obvious from one table.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

const SEASONS = +(process.argv[2] || 20);
const REPORT = +(process.argv[3] || 5);
const OUT = path.resolve(__dirname, '..', 'league-history.json');

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'log' && /^\[rig\]/.test(m.text())) console.log(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const seasons = await page.evaluate(async (opts) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); newGame('MUN'); clear();

    const DIVS = (typeof DIV_ORDER !== 'undefined') ? DIV_ORDER.slice() : ['PL','CH','L1','L2','NL'];
    const out = [];

    /* the last moment the tables still exist */
    const passEnd = endSeason;
    endSeason = function () {
      try {
        const snap = { season: G.season, divs: {}, cups: {}, boot: null, me: null };
        DIVS.forEach((d) => {
          const rows = tableRows(d) || [];
          snap.divs[d] = rows.map((r, ix) => ({
            pos: ix + 1, club: (G.clubs[r.i] || {}).name || '?',
            p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts,
          }));
        });
        ['LC', 'FA', 'CL'].forEach((k) => {
          const c = G.cups && G.cups[k];
          snap.cups[k] = (c && c.winner != null && G.clubs[c.winner])
            ? G.clubs[c.winner].name : null;
        });
        /* the golden boot, across the whole English pyramid */
        let best = null, bg = -1;
        (G.clubs || []).forEach((c) => {
          if (DIVS.indexOf(c.league) < 0) return;
          (c.players || []).forEach((p) => {
            const g = (p.stats && p.stats.goals) || 0;
            if (g > bg) { bg = g; best = { name: p.name, club: c.name, goals: g, div: c.league }; }
          });
        });
        snap.boot = best;
        const me = G.clubs[G.my] || {};
        const myRows = tableRows(me.league) || [];
        const mine = myRows.findIndex((r) => r.i === G.my);
        snap.me = { club: me.name, div: me.league, pos: mine + 1,
          pts: mine >= 0 ? myRows[mine].pts : 0 };
        out.push(snap);
        console.log('[rig] season ' + snap.season + ' done — '
          + DIVS.map((d) => (snap.divs[d][0] || {}).club).join(', '));
      } catch (e) { console.log('[rig] capture failed: ' + e); }
      return passEnd.apply(this, arguments);
    };

    /* play, letting the game run every other match itself */
    const want = opts.seasons;
    let guard = 0;
    while (out.length < want && guard++ < want * 420) {
      try {
        for (let g = 0; g < 3; g += 1) {
          const f = userMatchOn(G.day);
          if (!f || f.played) break;
          MU.fix = f; MU.m = null;
          if (!simInstant()) break;
        }
      } catch (e) { /* pre-season, or no fixture */ }
      try { await advanceDay(); } catch (e) { /* waiting on something */ }
    }
    return out;
  }, { seasons: SEASONS });

  fs.writeFileSync(OUT, JSON.stringify(seasons, null, 1));
  console.log('\n' + seasons.length + ' seasons played; full detail in ' + OUT + '\n');

  const NAMES = { PL: 'Premier League', CH: 'Championship', L1: 'League One',
    L2: 'League Two', NL: 'National League' };
  for (const s of seasons.slice(0, REPORT)) {
    console.log('================ SEASON ' + s.season + ' ================');
    for (const d of Object.keys(s.divs)) {
      const rows = s.divs[d];
      if (!rows.length) continue;
      console.log('\n' + (NAMES[d] || d));
      const line = (r) => '  ' + String(r.pos).padStart(2) + '  ' + r.club.padEnd(26)
        + String(r.p).padStart(3) + String(r.w).padStart(4) + String(r.d).padStart(4)
        + String(r.l).padStart(4) + String(r.gf).padStart(5) + String(r.ga).padStart(5)
        + String(r.gd >= 0 ? '+' + r.gd : r.gd).padStart(5) + String(r.pts).padStart(5);
      console.log('  ' + 'pos'.padStart(2) + '  ' + 'club'.padEnd(26)
        + '  P'.padStart(3) + '   W'.padStart(4) + '   D'.padStart(4) + '   L'.padStart(4)
        + '   GF'.padStart(5) + '   GA'.padStart(5) + '   GD'.padStart(5) + '  PTS'.padStart(5));
      rows.slice(0, 6).forEach((r) => console.log(line(r)));
      if (rows.length > 9) {
        console.log('   ..');
        rows.slice(-3).forEach((r) => console.log(line(r)));
      }
      const goals = rows.reduce((t, r) => t + r.gf, 0);
      const played = rows.reduce((t, r) => t + r.p, 0) / 2;
      console.log('  ' + rows.length + ' clubs, ' + played + ' matches, '
        + (played ? (goals / played).toFixed(2) : '0') + ' goals a game');
    }
    console.log('\n  cups   League Cup: ' + (s.cups.LC || '—')
      + '   FA Cup: ' + (s.cups.FA || '—') + '   Europe: ' + (s.cups.CL || '—'));
    if (s.boot) console.log('  golden boot   ' + s.boot.name + ', ' + s.boot.club
      + ' (' + s.boot.div + ') — ' + s.boot.goals);
    console.log('  your club   ' + s.me.club + ', ' + s.me.div + ', '
      + s.me.pos + (s.me.pos === 1 ? 'st' : s.me.pos === 2 ? 'nd' : s.me.pos === 3 ? 'rd' : 'th')
      + ' on ' + s.me.pts + '\n');
  }

  /* the long view: who won what, across every season played */
  console.log('================ ' + seasons.length + ' SEASONS, THE LONG VIEW ================');
  for (const d of Object.keys(NAMES)) {
    const champs = {};
    seasons.forEach((s) => {
      const c = (s.divs[d] || [])[0];
      if (c) champs[c.club] = (champs[c.club] || 0) + 1;
    });
    const list = Object.entries(champs).sort((a, b) => b[1] - a[1]);
    if (!list.length) continue;
    console.log('\n' + NAMES[d] + ' — ' + list.length + ' different champions');
    list.forEach(([club, n]) => console.log('   ' + String(n).padStart(2) + '  ' + club));
  }
  const gpg = seasons.map((s) => {
    const rows = s.divs.PL || [];
    const g = rows.reduce((t, r) => t + r.gf, 0);
    const p = rows.reduce((t, r) => t + r.p, 0) / 2;
    return p ? g / p : 0;
  });
  console.log('\nPremier League goals a game, season by season:');
  console.log('  ' + gpg.map((v) => v.toFixed(2)).join('  '));
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
})();
