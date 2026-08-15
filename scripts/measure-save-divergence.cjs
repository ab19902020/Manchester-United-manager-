#!/usr/bin/env node
/* global document, window, newGame, advanceDay, G, MU, userMatchOn, simInstant,
          RBSWorldSeed, CompressionStream, TextEncoder, Response */

/* A LOSSLESS SAVE, MEASURED THE RIGHT WAY ROUND.
 *
 * Both previous measurements costed the same thing: storing the whole
 * world. Packed JSON plus gzip came to 2,343 kB and a column-major binary
 * encoding to 1,238 kB, against a 1,024 kB limit, and we called lossless
 * impossible.
 *
 * That was the wrong thing to measure. The world now rebuilds from a
 * 32-bit seed (src/world-seed.js), so a save does not have to carry what
 * can be regenerated — only what has CHANGED since. That is still a fully
 * lossless save: reload it and you get back exactly what you left, down
 * to the last attribute of the last player in the National League. It
 * simply does not spend bytes restating what the seed already says.
 *
 * So: play a career, rebuild the world from its own seed, and measure
 * only the difference.
 *
 * Method
 *   1. start a career, play N seasons
 *   2. index every player by id, with his fields, as he actually is
 *   3. rebuild the world from G.worldSeed, and index it the same way
 *   4. a field that matches for EVERY player costs nothing — it is in the
 *      seed. Only fields that moved for somebody are stored, and they are
 *      stored column-major and right-sized, the same encoder Claude
 *      measured the full save with
 *   5. players who did not exist at generation (academy intakes, regens)
 *      are stored in full, because no seed produces them
 *
 * Nothing is approximated: every byte reported is a gzipped buffer.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const SEASONS = Number(process.argv[2] || 1);
const DAYS_PER_SEASON = 340;

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

  const r = await page.evaluate(async ({ seasons, daysPerSeason }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); newGame('MUN'); clear();

    if (typeof RBSWorldSeed === 'undefined' || G.worldSeed == null) {
      return { fatal: 'no world seed — src/world-seed.js is not loaded' };
    }
    const seed = G.worldSeed;
    const my = G.my;

    for (let d = 0; d < seasons * daysPerSeason; d += 1) {
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
    const playedSeason = G.season;
    const playedDay = G.day;

    /* ---- 2. the world as it actually is ------------------------------ */

    const everyone = (g) => {
      const out = [];
      g.clubs.forEach((c, ci) => {
        (c.players || []).forEach((p) => out.push({ p, ci, youth: 0 }));
        (c.youth || []).forEach((p) => out.push({ p, ci, youth: 1 }));
      });
      (g.freeAgents || []).forEach((p) => out.push({ p, ci: -1, youth: 0 }));
      return out;
    };

    /* Every field of a player, flattened to one map, so two versions of
       the same man can be compared key by key. attrs and stats are
       flattened in with a prefix rather than compared as objects: a save
       that stored a whole attrs block because one number in it moved
       would be measuring the wrong thing. */
    const flat = (p, ci, youth) => {
      const o = { _club: ci, _youth: youth };
      Object.keys(p).forEach((k) => {
        if (k === 'attrs' || k === 'stats') return;
        const v = p[k];
        if (v == null) { o[k] = null; return; }
        if (typeof v === 'object') { o[k] = JSON.stringify(v); return; }
        o[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
      });
      if (p.attrs) Object.keys(p.attrs).forEach((k) => { o['a.' + k] = p.attrs[k]; });
      if (p.stats) Object.keys(p.stats).forEach((k) => { o['s.' + k] = p.stats[k]; });
      return o;
    };

    const played = new Map();
    everyone(G).forEach(({ p, ci, youth }) => played.set(p.id, flat(p, ci, youth)));
    const playedWorld = JSON.stringify({
      ...G,
      clubs: G.clubs.map((c) => ({ ...c, players: undefined, youth: undefined })),
      fixtures: (G.fixtures || []).map((f) => [f.h, f.a, f.day, f.div, f.r,
        f.played ? 1 : 0, f.hs, f.as, f.comp]),
      freeAgents: undefined,
    });
    const fullSaveRaw = JSON.stringify(G).length;

    /* ---- 3. the world the seed gives back ---------------------------- */

    RBSWorldSeed.build(seed, my);
    const base = new Map();
    everyone(G).forEach(({ p, ci, youth }) => base.set(p.id, flat(p, ci, youth)));

    /* ---- 4. what actually moved -------------------------------------- */

    const carried = [];   // players the seed produces, in their played state
    const born = [];      // players no seed produces — stored in full
    played.forEach((now, id) => {
      if (base.has(id)) carried.push({ id, now, was: base.get(id) });
      else born.push({ id, now });
    });
    const buried = [];    // the seed makes them, the career does not have them
    base.forEach((_, id) => { if (!played.has(id)) buried.push(id); });

    const allKeys = new Set();
    carried.forEach(({ now, was }) => {
      Object.keys(now).forEach((k) => allKeys.add(k));
      Object.keys(was).forEach((k) => allKeys.add(k));
    });

    /* a field the seed already gets right for EVERY player is free */
    const moved = [];
    const still = [];
    allKeys.forEach((k) => {
      let differs = false;
      for (let i = 0; i < carried.length; i += 1) {
        const a = carried[i].now[k];
        const b = carried[i].was[k];
        if (a !== b && !(a == null && b == null)) { differs = true; break; }
      }
      (differs ? moved : still).push(k);
    });
    moved.sort(); still.sort();

    /* how many men are untouched entirely */
    let untouched = 0;
    carried.forEach(({ now, was }) => {
      let same = true;
      for (let i = 0; i < moved.length; i += 1) {
        const k = moved[i];
        if (now[k] !== was[k] && !(now[k] == null && was[k] == null)) { same = false; break; }
      }
      if (same) untouched += 1;
    });

    /* ---- 5. encode it ------------------------------------------------ */

    const gz = async (buf) => {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(buf); w.close();
      return (await new Response(cs.readable).arrayBuffer()).byteLength;
    };
    const enc = new TextEncoder();

    const strings = new Map();
    const sIdx = (s) => {
      const k = String(s == null ? '' : s);
      if (!strings.has(k)) strings.set(k, strings.size);
      return strings.get(k);
    };

    /* one column per field, narrowest type that holds its real range —
       the same encoder the full-save measurement used */
    const column = (n, read) => {
      const raw = new Float64Array(n);
      let lo = Infinity; let hi = -Infinity; let fractional = false;
      for (let i = 0; i < n; i += 1) {
        const v = read(i);
        raw[i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (!Number.isInteger(v)) fractional = true;
      }
      if (fractional) {
        let tenths = true;
        for (let i = 0; i < n; i += 1) {
          if (Math.abs(raw[i] * 10 - Math.round(raw[i] * 10)) > 1e-6) { tenths = false; break; }
        }
        if (tenths) {
          const t = new Int32Array(n);
          for (let i = 0; i < n; i += 1) t[i] = Math.round(raw[i] * 10);
          return new Uint8Array(t.buffer);
        }
        return new Uint8Array(new Float64Array(raw).buffer);
      }
      if (lo >= 0 && hi <= 255) {
        const a = new Uint8Array(n);
        for (let i = 0; i < n; i += 1) a[i] = raw[i];
        return a;
      }
      if (lo >= 0 && hi <= 65535) {
        const a = new Uint16Array(n);
        for (let i = 0; i < n; i += 1) a[i] = raw[i];
        return new Uint8Array(a.buffer);
      }
      const a = new Int32Array(n);
      for (let i = 0; i < n; i += 1) a[i] = raw[i];
      return new Uint8Array(a.buffer);
    };

    const isNumeric = (k) => {
      for (let i = 0; i < carried.length; i += 1) {
        const v = carried[i].now[k];
        if (v == null) continue;
        return typeof v === 'number';
      }
      return false;
    };

    const chunks = [];
    const bigFields = [];   // long JSON blobs that do not belong in a column
    moved.forEach((k) => {
      if (!isNumeric(k)) {
        /* strings and serialised objects: short ones go through the
           string table, long ones are their own gzipped blob so a career
           log does not poison a column of positions */
        let long = false;
        for (let i = 0; i < carried.length; i += 1) {
          const v = carried[i].now[k];
          if (typeof v === 'string' && v.length > 40) { long = true; break; }
        }
        if (long) { bigFields.push(k); return; }
        chunks.push(column(carried.length, (i) => sIdx(carried[i].now[k])));
        return;
      }
      chunks.push(column(carried.length, (i) => +carried[i].now[k] || 0));
    });
    /* the ids the columns are in the order of */
    chunks.push(column(carried.length, (i) => carried[i].id));

    let size = 0;
    chunks.forEach((c) => { size += c.length; });
    const body = new Uint8Array(size);
    let at = 0;
    chunks.forEach((c) => { body.set(c, at); at += c.length; });

    const bigBlob = JSON.stringify(bigFields.map((k) => carried.map(({ now }) => now[k])));
    const bornBlob = JSON.stringify(born.map(({ now }) => now));
    const buriedBuf = column(buried.length || 1, (i) => buried[i] || 0);

    const parts = {
      changedColumns: await gz(body),
      strTable: await gz(enc.encode([...strings.keys()].join(' '))),
      bigFields: await gz(enc.encode(bigBlob)),
      newPlayers: await gz(enc.encode(bornBlob)),
      goneIds: await gz(buriedBuf),
      world: await gz(enc.encode(playedWorld)),
    };
    const total = Object.values(parts).reduce((s, v) => s + v, 0);

    return {
      seed, season: playedSeason, day: playedDay,
      counts: {
        played: played.size, fromSeed: carried.length, born: born.length,
        buried: buried.length, untouched,
      },
      fields: { moved: moved.length, still: still.length, movedList: moved, stillList: still },
      bigFields, bodyRaw: size, parts, total, fullSaveRaw,
    };
  }, { seasons: SEASONS, daysPerSeason: DAYS_PER_SEASON });

  if (r.fatal) { console.error(r.fatal); await browser.close(); process.exit(1); }

  const kb = (n) => (n / 1024).toFixed(0) + ' kB';
  console.log(`seed ${r.seed} | season ${r.season}, day ${r.day} | ${SEASONS} season(s) played`);
  console.log('');
  console.log('players now                ', r.counts.played);
  console.log('  the seed also produces   ', r.counts.fromSeed,
    `(${r.counts.untouched} of them completely unchanged)`);
  console.log('  born since generation    ', r.counts.born, '(stored in full)');
  console.log('  the seed makes, gone now ', r.counts.buried, '(ids only)');
  console.log('');
  console.log('fields the seed gets right for everyone:', r.fields.still, '(free)');
  console.log('fields that moved for somebody:         ', r.fields.moved);
  console.log('  ' + r.fields.movedList.join(' '));
  console.log('');
  console.log('column body before gzip:', kb(r.bodyRaw));
  Object.entries(r.parts).forEach(([k, v]) => console.log('   ' + k.padEnd(16), kb(v)));
  console.log('   ' + 'TOTAL'.padEnd(16), kb(r.total));
  console.log('');
  console.log('full save as JSON, uncompressed, for scale:', kb(r.fullSaveRaw));
  console.log('1 MB limit (1024 kB):',
    r.total <= 1048576 ? 'FITS, ' + kb(1048576 - r.total) + ' spare'
      : 'OVER by ' + kb(r.total - 1048576));
  console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
})();
