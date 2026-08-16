#!/usr/bin/env node
/* global window, document, indexedDB, localStorage, Blob, Response,
          CompressionStream, TextEncoder, newGame, advanceDay, G, MU,
          userMatchOn, simInstant */

/* What does the game's OWN save path actually write, and how big is it?
 *
 * Agent One measured a packed binary save at 812 kB. That number comes
 * from scripts/measure-save-divergence.cjs — a measurement script. This
 * asks a different question: press Save in the game and see what lands
 * in storage, because that is what CrazyGames would have to carry.
 */
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

    const gz = async (str) => {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(str)); w.close();
      return (await new Response(cs.readable).arrayBuffer()).byteLength;
    };

    const out = { season: G.season, day: G.day };

    /* what the save controller produces, through its own door */
    let payload = null;
    try {
      const api = window.RBSSaves;
      out.hasController = !!api;
      out.controllerKeys = api ? Object.keys(api).slice(0, 12) : [];
      if (api && typeof api.save === 'function') {
        await api.save(1);
        out.saved = true;
      }
    } catch (e) { out.saveError = String(e).slice(0, 120); }

    /* and what is actually sitting in storage afterwards */
    try {
      let biggest = 0; let where = '';
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        if (v.length > biggest) { biggest = v.length; where = k; }
      }
      out.localStorageBiggest = biggest;
      out.localStorageKey = where;
      out.localStorageTotal = Object.keys(localStorage)
        .reduce((s, k) => s + (localStorage.getItem(k) || '').length, 0);
    } catch (e) { out.lsError = String(e).slice(0, 120); }

    /* IndexedDB is where the career store lives */
    try {
      const dbs = (indexedDB.databases) ? await indexedDB.databases() : [];
      out.databases = dbs.map((d) => d.name);
    } catch (e) { out.idbError = String(e).slice(0, 120); }

    /* READ THE STORED RECORD ITSELF, not G. Measuring G would say what
       the game holds in memory; what matters is what the save controller
       actually put in the database. */
    try {
      const rec = await new Promise((done, fail) => {
        const req = indexedDB.open('results-business-careers');
        req.onerror = () => fail(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const names = [...db.objectStoreNames];
          if (!names.length) { done({ stores: [] }); return; }
          const tx = db.transaction(names, 'readonly');
          const results = {};
          let left = names.length;
          names.forEach((n) => {
            const all = tx.objectStore(n).getAll();
            all.onsuccess = () => {
              results[n] = all.result;
              if (--left === 0) done({ stores: names, data: results });
            };
            all.onerror = () => { if (--left === 0) done({ stores: names, data: results }); };
          });
        };
      });
      out.stores = rec.stores;
      if (rec.data) {
        const sizes = {};
        let total = 0;
        Object.keys(rec.data).forEach((n) => {
          let bytes = 0;
          (rec.data[n] || []).forEach((row) => {
            if (row && row.blob instanceof Blob) bytes += row.blob.size;
            else if (row && row.data instanceof Blob) bytes += row.data.size;
            else bytes += JSON.stringify(row || null).length;
          });
          sizes[n] = bytes; total += bytes;
        });
        out.storeSizes = sizes;
        out.storedTotal = total;
        const first = (rec.data[rec.stores[0]] || [])[0];
        out.recordShape = first ? Object.keys(first).slice(0, 14) : [];
      }
    } catch (e) { out.recError = String(e).slice(0, 160); }

    payload = JSON.stringify(G);
    out.rawG = payload.length;
    out.gzippedG = await gz(payload);
    return out;
  });

  const kb = (n) => (n / 1024).toFixed(0) + ' kB';
  console.log('season', r.season, 'day', r.day);
  console.log('save controller present :', r.hasController, r.controllerKeys || '');
  console.log('saved via controller    :', r.saved === true ? 'yes' : ('no ' + (r.saveError || '')));
  console.log('');
  console.log('raw JSON of G           :', kb(r.rawG));
  console.log('same, gzipped           :', kb(r.gzippedG));
  console.log('');
  console.log('localStorage total      :', kb(r.localStorageTotal || 0),
    '| biggest key', r.localStorageKey, kb(r.localStorageBiggest || 0));
  console.log('indexedDB databases     :', (r.databases || []).join(', ') || 'none reported');
  console.log('object stores           :', (r.stores || []).join(', '), r.recError || '');
  console.log('record fields           :', (r.recordShape || []).join(', '));
  console.log('STORED SAVE TOTAL       :', kb(r.storedTotal || 0),
    JSON.stringify(r.storeSizes || {}));
  console.log('');
  console.log('CrazyGames data module limit: 1024 kB');
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
