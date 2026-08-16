#!/usr/bin/env node
/* global window, document, indexedDB, newGame, advanceDay, G, MU,
          userMatchOn, simInstant */

/* Does the world still remember after a save and a reload, and what does
 * remembering cost? Both measured through the game's own controller. */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto('file:///home/user/Manchester-United-manager-/red-devil-manager.html');
  await page.waitForTimeout(2500);

  const r = await page.evaluate(async () => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); newGame('MUN'); clear();
    for (let d = 0; d < 330; d += 1) {
      try {
        for (let g = 0; g < 3; g += 1) {
          const f = userMatchOn(G.day);
          if (!f || f.played) break;
          MU.fix = f; MU.m = null;
          if (!simInstant()) break;
        }
      } catch (e) { /* pre-season */ }
      try { await advanceDay(); } catch (e) { /* waiting */ }
    }

    const myDiv = (G.clubs[G.my] || {}).league;
    const census = () => {
      let outsideWithLog = 0; let mineWithLog = 0; let logEntries = 0;
      (G.clubs || []).forEach((c) => {
        [].concat(c.players || [], c.youth || []).forEach((p) => {
          const n = (p.log || []).length + (p.hist || []).length;
          if (!n) return;
          logEntries += n;
          if (c.i === G.my) mineWithLog += 1;
          else if (c.league !== myDiv) outsideWithLog += 1;
        });
      });
      const played = (G.fixtures || []).filter((f) => f.played);
      const notMine = played.filter((f) => f.h !== G.my && f.a !== G.my);
      return {
        outsideWithLog,
        mineWithLog,
        logEntries,
        playedNotMine: notMine.length,
        notMineWithScorers: notMine.filter((f) => f.sc && f.sc.length).length,
      };
    };

    const before = census();

    /* save through the real controller, then read the stored record */
    let stored = 0;
    try { await window.RBSSaves.save(1); } catch (e) { /* reported below */ }
    try {
      stored = await new Promise((done) => {
        const req = indexedDB.open('results-business-careers');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['careers'], 'readonly');
          const all = tx.objectStore('careers').getAll();
          all.onsuccess = () => done((all.result || [])
            .reduce((s, row) => s + JSON.stringify(row || null).length, 0));
          all.onerror = () => done(-1);
        };
        req.onerror = () => done(-1);
      });
    } catch (e) { stored = -1; }

    /* THE POINT: does it survive the round trip? Load it back and count
       again. Saving mutates nothing, but loading rebuilds G from the
       file, so this is the honest check. */
    let after = null; let loadError = null;
    try {
      const ok = await window.RBSSaves.load(1);
      after = census();
      after.loadReturned = ok === undefined ? 'undefined' : String(ok);
    } catch (e) { loadError = String(e).slice(0, 160); }

    return { before, after, stored, loadError, season: G.season, day: G.day };
  });

  const kb = (n) => (n / 1024).toFixed(0) + ' kB';
  console.log('season', r.season, 'day', r.day, r.loadError ? ('LOAD ERROR ' + r.loadError) : '');
  console.log('');
  const rows = [
    ['players outside your division with a match log', 'outsideWithLog'],
    ['your own players with a match log', 'mineWithLog'],
    ['total log entries in the world', 'logEntries'],
    ['played matches you were not in', 'playedNotMine'],
    ['...of those, still knowing who scored', 'notMineWithScorers'],
  ];
  console.log('  ' + 'measure'.padEnd(48) + 'before save'.padStart(12) + 'after reload'.padStart(14));
  rows.forEach(([label, key]) => {
    const b = r.before[key];
    const a = r.after ? r.after[key] : '-';
    console.log('  ' + label.padEnd(48) + String(b).padStart(12) + String(a).padStart(14));
  });
  console.log('');
  console.log('stored save (careers store):', kb(r.stored));
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
