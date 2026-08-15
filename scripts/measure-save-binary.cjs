#!/usr/bin/env node
/* global window, document, newGame, advanceDay, G, MU, userMatchOn, simInstant,
          CompressionStream, TextEncoder, Response */

/* Binary lossless, second pass.
 *
 * The first pass came to 1,407 kB against a 1,024 kB limit. Two things
 * in it were obviously wasteful and are fixed here:
 *
 *   1. every numeric field was an Int32 regardless of range, and stored
 *      row-major, so a column of values 0..20 cost four bytes each and
 *      sat next to a column of millions where gzip could not see the
 *      pattern. Now each field is its own column, right-sized to the
 *      narrowest type its real range allows.
 *   2. ten fields were left as JSON because they hold arrays or objects.
 *      The two that matter are packed as columns too.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--mute-audio'],
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

    const gz = async (buf) => {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(buf); w.close();
      return (await new Response(cs.readable).arrayBuffer()).byteLength;
    };
    const enc = new TextEncoder();

    const all = [];
    G.clubs.forEach((c) => {
      (c.players || []).forEach((x) => all.push(x));
      (c.youth || []).forEach((x) => all.push(x));
    });
    (G.freeAgents || []).forEach((x) => all.push(x));
    const N = all.length;
    const ATTR = Object.keys(all[0].attrs).sort();

    const strings = new Map();
    const sIdx = (s) => {
      const k = String(s == null ? '' : s);
      if (!strings.has(k)) strings.set(k, strings.size);
      return strings.get(k);
    };

    const keys = new Set();
    all.forEach((x) => Object.keys(x).forEach((k) => keys.add(k)));
    const strKeys = []; const numKeys = []; const otherKeys = [];
    [...keys].sort().forEach((k) => {
      if (k === 'attrs' || k === 'stats') return;
      let sawStr = false; let sawNum = false; let sawOther = false;
      for (let i = 0; i < N; i += 1) {
        const v = all[i][k];
        if (v == null) continue;
        if (typeof v === 'string') sawStr = true;
        else if (typeof v === 'number' || typeof v === 'boolean') sawNum = true;
        else sawOther = true;
      }
      if (sawOther) otherKeys.push(k);
      else if (sawStr) strKeys.push(k);
      else numKeys.push(k);
    });

    /* COLUMN-MAJOR AND RIGHT-SIZED. Each field becomes its own array of
       the narrowest type that holds its real range, so a column of ages
       costs one byte a player and gzip sees 16,000 similar bytes in a
       row instead of them interleaved with wages. */
    const column = (read) => {
      const raw = new Float64Array(N);
      let lo = Infinity; let hi = -Infinity; let fractional = false;
      for (let i = 0; i < N; i += 1) {
        const v = read(all[i]);
        raw[i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (!Number.isInteger(v)) fractional = true;
      }
      if (fractional) {
        /* one decimal place is enough for every fractional field here
           (ratings, condition), so store tenths as an integer */
        let allTenths = true;
        for (let i = 0; i < N; i += 1) {
          if (Math.abs(raw[i] * 10 - Math.round(raw[i] * 10)) > 1e-6) { allTenths = false; break; }
        }
        if (allTenths) {
          const t = new Int32Array(N);
          for (let i = 0; i < N; i += 1) t[i] = Math.round(raw[i] * 10);
          return new Uint8Array(t.buffer);
        }
        return new Uint8Array(new Float64Array(raw).buffer);
      }
      if (lo >= 0 && hi <= 255) {
        const a = new Uint8Array(N);
        for (let i = 0; i < N; i += 1) a[i] = raw[i];
        return a;
      }
      if (lo >= 0 && hi <= 65535) {
        const a = new Uint16Array(N);
        for (let i = 0; i < N; i += 1) a[i] = raw[i];
        return new Uint8Array(a.buffer);
      }
      const a = new Int32Array(N);
      for (let i = 0; i < N; i += 1) a[i] = raw[i];
      return new Uint8Array(a.buffer);
    };

    const chunks = [];
    ATTR.forEach((k) => chunks.push(column((x) => Math.round(+x.attrs[k] || 0))));
    numKeys.forEach((k) => chunks.push(column((x) => {
      const v = x[k];
      return typeof v === 'boolean' ? (v ? 1 : 0) : (+v || 0);
    })));
    strKeys.forEach((k) => chunks.push(column((x) => sIdx(x[k]))));
    const statKeys = ['apps', 'goals', 'assists', 'rSum', 'motm', 'cleanSheets', 'pas', 'pasC',
      'key', 'tak', 'takW', 'intc', 'clr', 'duel', 'duelW', 'aer', 'aerW', 'drb', 'drbW',
      'sav', 'fls', 'mins'];
    statKeys.forEach((k) => chunks.push(column((x) => (x.stats && +x.stats[k]) || 0)));

    /* the engine's five-rating form array, as five columns of tenths */
    for (let slot = 0; slot < 5; slot += 1) {
      chunks.push(column((x) => {
        const f = x.form;
        return (Array.isArray(f) && f[slot] != null) ? +f[slot] : 0;
      }));
    }
    /* traits and position families are short strings — into the table */
    chunks.push(column((x) => sIdx(Array.isArray(x.traits) ? x.traits.join(',') : '')));
    chunks.push(column((x) => sIdx(Array.isArray(x.posFam) ? x.posFam.join(',') : (x.posFam || ''))));
    chunks.push(column((x) => sIdx(Array.isArray(x.pos2) ? x.pos2.join(',') : (x.pos2 || ''))));

    /* concatenate every column into one buffer, so gzip sees the lot */
    let size = 0;
    chunks.forEach((c) => { size += c.length; });
    const body = new Uint8Array(size);
    let at = 0;
    chunks.forEach((c) => { body.set(c, at); at += c.length; });

    const stillJson = ['_devA', '_rbsGrow', 'car', 'injury', 'log', 'mlog'];
    const leftover = JSON.stringify(all.map((x) => {
      const o = {};
      stillJson.forEach((k) => { if (x[k] != null) o[k] = x[k]; });
      return o;
    }));
    const strTable = enc.encode([...strings.keys()].join(''));
    const world = JSON.stringify({
      ...G,
      clubs: G.clubs.map((c) => ({ ...c, players: undefined, youth: undefined })),
      fixtures: (G.fixtures || []).map((f) => [f.h, f.a, f.day, f.div, f.r,
        f.played ? 1 : 0, f.hs, f.as, f.comp]),
      freeAgents: undefined,
    });

    const parts = {
      columns: await gz(body),
      strTable: await gz(strTable),
      leftover: await gz(enc.encode(leftover)),
      world: await gz(enc.encode(world)),
    };
    const total = Object.values(parts).reduce((s, v) => s + v, 0);

    return {
      N, uniqueStrings: strings.size, columns: chunks.length,
      bodyRaw: size, parts, total, season: G.season, day: G.day,
    };
  });

  const kb = (n) => (n / 1024).toFixed(0) + ' kB';
  console.log('season', r.season, 'day', r.day, '| players', r.N,
    '| columns', r.columns, '| unique strings', r.uniqueStrings);
  console.log('column body before gzip:', kb(r.bodyRaw));
  console.log('');
  Object.entries(r.parts).forEach(([k, v]) => console.log('   ' + k.padEnd(10), kb(v)));
  console.log('   ' + 'TOTAL'.padEnd(10), kb(r.total));
  console.log('');
  console.log('1 MB limit (1024 kB):',
    r.total <= 1048576 ? 'FITS, ' + kb(1048576 - r.total) + ' spare'
      : 'over by ' + kb(r.total - 1048576));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
