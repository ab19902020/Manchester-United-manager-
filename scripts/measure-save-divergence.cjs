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
    const scalar = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

    /* Nested values are flattened rather than stringified wherever their
       shape is fixed. The first version dumped every object and array to
       JSON, which put the five-slot form array, the injury record and the
       position families into a 279 kB blob — five numbers a player, as
       text, with their punctuation. Only genuinely variable-length history
       (car, log, mlog) is left as JSON now, because a column cannot hold a
       list that is a different length for every player. */
    const spread = (o, key, v) => {
      if (v == null) { o[key] = null; return; }
      if (Array.isArray(v)) {
        const allNum = v.every((x) => x == null || typeof x === 'number');
        if (allNum && v.length <= 8) {
          for (let i = 0; i < 8; i += 1) o[key + '#' + i] = v[i] == null ? 0 : v[i];
          return;
        }
        const allStr = v.every((x) => typeof x === 'string');
        if (allStr && v.length <= 6) { o[key] = v.join(','); return; }
        o[key] = JSON.stringify(v);
        return;
      }
      if (typeof v === 'object') {
        const keys = Object.keys(v);
        /* width is not the problem, nesting is. `car` is one flat object
           of about twenty-five career totals and it was being dumped to
           JSON for the sole reason that it has more than eight keys —
           94 kB of numbers written out as text. */
        const flatEnough = keys.every((k2) => v[k2] == null || typeof v[k2] !== 'object');
        if (flatEnough) { keys.forEach((k2) => { o[key + '.' + k2] = scalar(v[k2]); }); return; }
        o[key] = JSON.stringify(v);
        return;
      }
      o[key] = scalar(v);
    };

    const flat = (p, ci, youth) => {
      const o = { _club: ci, _youth: youth };
      Object.keys(p).forEach((k) => {
        if (k === 'attrs' || k === 'stats') return;
        spread(o, k, p[k]);
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

    /* Captured HERE, before the rebuild, and not at the end with the rest
       of the reporting. The first version measured these after
       RBSWorldSeed.build() had already replaced the world, so it was
       weighing a fresh season-one world with no results, no cup progress
       and an empty inbox — the parts came to 82 kB against a 228 kB blob,
       which is how the mistake showed itself. */
    const worldSrc = {
      clubs: JSON.stringify(G.clubs.map((c) => ({ ...c, players: undefined, youth: undefined }))),
      fixtures: JSON.stringify((G.fixtures || []).map((f) => [f.h, f.a, f.day, f.div, f.r,
        f.played ? 1 : 0, f.hs, f.as, f.comp])),
      cups: JSON.stringify(G.cups || null),
      inbox: JSON.stringify(G.inbox || null),
      rest: JSON.stringify(Object.fromEntries(Object.keys(G)
        .filter((k) => !['clubs', 'fixtures', 'cups', 'inbox', 'freeAgents'].includes(k))
        .map((k) => [k, G[k]]))),
    };
    /* and what the growing history actually looks like, one example each */
    const sampleOf = (key) => {
      const men = G.clubs[G.my].players || [];
      for (let i = 0; i < men.length; i += 1) {
        const v = men[i][key];
        if (v != null && (!Array.isArray(v) || v.length)) {
          return { len: Array.isArray(v) ? v.length : 1, json: JSON.stringify(v).slice(0, 220) };
        }
      }
      return null;
    };
    const samples = { log: sampleOf('log'), car: sampleOf('car'), mlog: sampleOf('mlog') };

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

    /* One column per field, narrowest type that holds its real range.
     *
     * The first version of this encoder made the measurement worthless and
     * it is worth saying why, because it looked right. A fractional field
     * fell back to Float64 — eight bytes of mantissa a player, which gzip
     * cannot compress at all — and condition, sharpness, morale and every
     * rating are fractional. That alone put 1,600 kB on the total and had
     * me report that a diff was worse than storing the whole world. It is
     * not; my encoder was worse than the one I was comparing against.
     *
     * So: scale to whatever integer grid the values actually sit on
     * (whole numbers, tenths, hundredths), THEN right-size. Float64 is a
     * last resort and the report says when it was used, so a column that
     * silently costs eight bytes cannot hide again. */
    let float64Columns = 0;
    const column = (n, read, quant) => {
      const raw = new Float64Array(n);
      let lo = Infinity; let hi = -Infinity;
      for (let i = 0; i < n; i += 1) {
        const v = read(i);
        raw[i] = Number.isFinite(v) ? v : 0;
        if (raw[i] < lo) lo = raw[i];
        if (raw[i] > hi) hi = raw[i];
      }
      let scale = 0;
      /* quantise: the value is pinned to a hundredth and the tail is
         dropped on purpose. Used only for the measurement that asks what
         a save costs if the game does not carry seventeen significant
         digits of an attribute nobody can see. */
      if (quant) {
        for (const s of [1, 10, 100]) {
          let ok = true;
          for (let i = 0; i < n; i += 1) {
            const q = Math.round(raw[i] * 100) / 100;
            if (Math.abs(q * s - Math.round(q * s)) > 1e-6) { ok = false; break; }
          }
          if (ok) { scale = s; break; }
        }
        if (!scale) scale = 100;
        for (let i = 0; i < n; i += 1) raw[i] = Math.round(raw[i] * 100) / 100;
      }
      if (!scale) for (const s of [1, 10, 100]) {
        let ok = true;
        for (let i = 0; i < n; i += 1) {
          if (Math.abs(raw[i] * s - Math.round(raw[i] * s)) > 1e-6) { ok = false; break; }
        }
        if (ok) { scale = s; break; }
      }
      if (!scale) {
        float64Columns += 1;
        return new Uint8Array(new Float64Array(raw).buffer);
      }
      const slo = Math.round(lo * scale);
      const shi = Math.round(hi * scale);
      if (slo >= 0 && shi <= 255) {
        const a = new Uint8Array(n);
        for (let i = 0; i < n; i += 1) a[i] = Math.round(raw[i] * scale);
        return a;
      }
      if (slo >= -128 && shi <= 127) {
        const a = new Int8Array(n);
        for (let i = 0; i < n; i += 1) a[i] = Math.round(raw[i] * scale);
        return new Uint8Array(a.buffer);
      }
      if (slo >= 0 && shi <= 65535) {
        const a = new Uint16Array(n);
        for (let i = 0; i < n; i += 1) a[i] = Math.round(raw[i] * scale);
        return new Uint8Array(a.buffer);
      }
      if (slo >= -32768 && shi <= 32767) {
        const a = new Int16Array(n);
        for (let i = 0; i < n; i += 1) a[i] = Math.round(raw[i] * scale);
        return new Uint8Array(a.buffer);
      }
      const a = new Int32Array(n);
      for (let i = 0; i < n; i += 1) a[i] = Math.round(raw[i] * scale);
      return new Uint8Array(a.buffer);
    };

    /* Encode a set of flat records over a set of fields. Numeric fields
       become columns; short strings go through a shared table; anything
       with a long value (career logs, match logs) is set aside as its own
       blob so it cannot poison a column of positions. */
    const sideTables = [];
    const encodeSet = (rows, fields, quant) => {
      const n = rows.length;
      const chunks = [];
      const big = [];
      fields.forEach((k) => {
        let numeric = false;
        let long = false;
        for (let i = 0; i < n; i += 1) {
          const v = rows[i][k];
          if (v == null) continue;
          if (typeof v === 'number') { numeric = true; break; }
          if (typeof v === 'string' && v.length > 40) { long = true; break; }
        }
        if (numeric) { chunks.push(column(n, (i) => +rows[i][k] || 0, quant)); return; }
        if (long) {
          /* An array of uniform records is a table, not a blob. `log` is
             one row per appearance — the same fourteen fields every time,
             and its only string is one of about forty competition names
             repeated fifty times a player. Written as JSON that is 114 kB
             of punctuation and repetition; written as a side table it is
             columns like everything else, with one column naming the
             player each row belongs to. */
          const parsed = new Array(n);
          let tabular = true;
          for (let i = 0; i < n && tabular; i += 1) {
            const raw = rows[i][k];
            if (raw == null) { parsed[i] = null; continue; }
            if (typeof raw !== 'string' || raw.charAt(0) !== '[') { tabular = false; break; }
            let arr;
            try { arr = JSON.parse(raw); } catch (e) { tabular = false; break; }
            if (!Array.isArray(arr)) { tabular = false; break; }
            for (let j = 0; j < arr.length; j += 1) {
              const e = arr[j];
              if (!e || typeof e !== 'object' || Array.isArray(e)) { tabular = false; break; }
              const ks = Object.keys(e);
              for (let q = 0; q < ks.length; q += 1) {
                if (e[ks[q]] != null && typeof e[ks[q]] === 'object') { tabular = false; break; }
              }
            }
            parsed[i] = arr;
          }
          if (!tabular) { big.push(k); return; }
          const entries = [];
          for (let i = 0; i < n; i += 1) {
            const arr = parsed[i];
            if (!arr) continue;
            for (let j = 0; j < arr.length; j += 1) entries.push({ _row: i, e: arr[j] });
          }
          if (!entries.length) return;
          const sub = new Set();
          entries.forEach(({ e }) => Object.keys(e).forEach((k2) => sub.add(k2)));
          const subKeys = [...sub].sort();
          const m = entries.length;
          chunks.push(column(m, (i) => entries[i]._row));
          subKeys.forEach((k2) => {
            let subNumeric = false;
            for (let i = 0; i < m; i += 1) {
              const v2 = entries[i].e[k2];
              if (v2 == null) continue;
              subNumeric = typeof v2 === 'number' || typeof v2 === 'boolean';
              break;
            }
            if (subNumeric) {
              chunks.push(column(m, (i) => {
                const v2 = entries[i].e[k2];
                return typeof v2 === 'boolean' ? (v2 ? 1 : 0) : (+v2 || 0);
              }, quant));
            } else {
              chunks.push(column(m, (i) => sIdx(entries[i].e[k2])));
            }
          });
          sideTables.push([k, entries.length, subKeys.length]);
          return;
        }
        chunks.push(column(n, (i) => sIdx(rows[i][k])));
      });
      let size = 0;
      chunks.forEach((c) => { size += c.length; });
      const body = new Uint8Array(size);
      let at = 0;
      chunks.forEach((c) => { body.set(c, at); at += c.length; });
      return {
        body,
        big,
        blob: JSON.stringify(big.map((k) => rows.map((rw) => rw[k]))),
        perBig: big.map((k) => [k, JSON.stringify(rows.map((rw) => rw[k]))]),
        columns: chunks.length,
      };
    };

    const allFields = [...allKeys].sort();
    const carriedRows = carried.map(({ id, now }) => Object.assign({ id }, now));
    const bornRows = born.map(({ id, now }) => Object.assign({ id }, now));

    /* (A) THE WHOLE WORLD, every field, this encoder. The thing to beat,
       measured here rather than quoted from the other script so that both
       numbers below come from one encoder on one career. */
    const full = encodeSet(carriedRows.concat(bornRows), allFields);
    const fullParts = {
      columns: await gz(full.body),
      strTable: await gz(enc.encode([...strings.keys()].join(' '))),
      bigFields: await gz(enc.encode(full.blob)),
      world: await gz(enc.encode(playedWorld)),
    };

    /* (B) SEED PLUS WHAT MOVED. Only the fields the seed does not already
       get right, for the players the seed produces; the men born since
       generation whole, because no seed makes them. */
    strings.clear();
    const diff = encodeSet(carriedRows, moved.concat(['id']));
    const bornOnly = encodeSet(bornRows, allFields);
    const diffParts = {
      changedColumns: await gz(diff.body),
      changedBig: await gz(enc.encode(diff.blob)),
      newPlayers: await gz(bornOnly.body),
      newPlayersBig: await gz(enc.encode(bornOnly.blob)),
      strTable: await gz(enc.encode([...strings.keys()].join(' '))),
      goneIds: await gz(column(buried.length || 1, (i) => buried[i] || 0)),
      world: await gz(enc.encode(playedWorld)),
    };

    /* (C) THE WHOLE WORLD, pinned to a hundredth. Every attribute in this
       game is a full-precision float — a.aggression is 12.292376410679863
       — because growth adds fractional increments and nothing ever rounds
       them. The screen shows 12. Seventeen significant digits of a rating
       nobody can see cost eight incompressible bytes a player a field,
       which is the entire reason a byte-exact save does not fit. This
       measures the same save with those tails dropped at a hundredth. */
    strings.clear();
    const quant = encodeSet(carriedRows.concat(bornRows), allFields, true);
    const quantParts = {
      columns: await gz(quant.body),
      strTable: await gz(enc.encode([...strings.keys()].join(' '))),
      bigFields: await gz(enc.encode(quant.blob)),
      world: await gz(enc.encode(playedWorld)),
    };

    /* (D) and the same again, with the seed carrying what has not moved */
    strings.clear();
    const qdiff = encodeSet(carriedRows, moved.concat(['id']), true);
    const qborn = encodeSet(bornRows, allFields, true);
    const qdiffParts = {
      changedColumns: await gz(qdiff.body),
      changedBig: await gz(enc.encode(qdiff.blob)),
      newPlayers: await gz(qborn.body),
      newPlayersBig: await gz(enc.encode(qborn.blob)),
      strTable: await gz(enc.encode([...strings.keys()].join(' '))),
      goneIds: await gz(column(buried.length || 1, (i) => buried[i] || 0)),
      world: await gz(enc.encode(playedWorld)),
    };

    /* where the remaining blobs and the world blob actually go, so the
       next thing to attack is chosen from a number and not a hunch */
    const bigBreakdown = [];
    for (const [k, json] of qdiff.perBig) bigBreakdown.push([k, await gz(enc.encode(json))]);
    const worldBits = {};
    for (const k of Object.keys(worldSrc)) worldBits[k] = await gz(enc.encode(worldSrc[k]));

    /* (E) D, with the world put through the same mill as the players.
       484 club records, 8,781 fixture rows and the cup ties are uniform
       tables sitting in 225 kB of JSON — the last place in the save where
       numbers are still written out as text. Parsed back from the strings
       captured before the rebuild, so this cannot pick up the regenerated
       world by accident the way the first breakdown did. */
    const rowsOf = (list) => list.map((c) => {
      const o = {};
      Object.keys(c).forEach((k) => spread(o, k, c[k]));
      return o;
    });
    const fieldsOf = (rws) => {
      const set = new Set();
      rws.forEach((rw) => Object.keys(rw).forEach((k) => set.add(k)));
      return [...set].sort();
    };

    strings.clear();
    const clubRows = rowsOf(JSON.parse(worldSrc.clubs));
    const FIX = ['h', 'a', 'day', 'div', 'r', 'played', 'hs', 'as', 'comp'];
    const fixRows = JSON.parse(worldSrc.fixtures)
      .map((t) => Object.fromEntries(FIX.map((k, i) => [k, t[i]])));
    const cupsRaw = JSON.parse(worldSrc.cups) || {};
    const tieRows = [];
    const cupShell = {};
    Object.keys(cupsRaw).forEach((k) => {
      const cup = cupsRaw[k];
      if (!cup || typeof cup !== 'object') { cupShell[k] = cup; return; }
      const { ties, ...rest2 } = cup;
      cupShell[k] = rest2;
      (ties || []).forEach((t) => {
        const o = { _cup: sIdx(k) };
        Object.keys(t).forEach((k2) => spread(o, k2, t[k2]));
        tieRows.push(o);
      });
    });

    const clubsEnc = encodeSet(clubRows, fieldsOf(clubRows), true);
    const fixEnc = encodeSet(fixRows, FIX, true);
    const tieEnc = tieRows.length ? encodeSet(tieRows, fieldsOf(tieRows), true) : null;

    const worldPacked = {
      clubs: await gz(clubsEnc.body),
      clubsBig: await gz(enc.encode(clubsEnc.blob)),
      fixtures: await gz(fixEnc.body),
      cupTies: tieEnc ? await gz(tieEnc.body) : 0,
      cupTiesBig: tieEnc ? await gz(enc.encode(tieEnc.blob)) : 0,
      cupShell: await gz(enc.encode(JSON.stringify(cupShell))),
      inbox: await gz(enc.encode(worldSrc.inbox)),
      rest: await gz(enc.encode(worldSrc.rest)),
      strTable: await gz(enc.encode([...strings.keys()].join(' '))),
    };
    const worldPackedTotal = Object.values(worldPacked).reduce((a, b) => a + b, 0);

    const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

    return {
      seed, season: playedSeason, day: playedDay,
      counts: {
        played: played.size, fromSeed: carried.length, born: born.length,
        buried: buried.length, untouched,
      },
      fields: { moved: moved.length, still: still.length, movedList: moved, stillList: still },
      float64Columns,
      full: { parts: fullParts, total: sum(fullParts), columns: full.columns, big: full.big },
      diff: { parts: diffParts, total: sum(diffParts), columns: diff.columns, big: diff.big },
      quant: { parts: quantParts, total: sum(quantParts), columns: quant.columns, big: quant.big },
      qdiff: { parts: qdiffParts, total: sum(qdiffParts), columns: qdiff.columns, big: qdiff.big },
      bigBreakdown, worldBits, samples, sideTables,
      worldPacked, worldPackedTotal,
      worldBlobs: { cupTies: tieEnc ? tieEnc.big : [], clubs: clubsEnc.big },
      packed: { parts: Object.assign({}, qdiffParts, { world: worldPackedTotal }),
        total: sum(qdiffParts) - qdiffParts.world + worldPackedTotal },
      fullSaveRaw,
    };
  }, { seasons: SEASONS, daysPerSeason: DAYS_PER_SEASON });

  if (r.fatal) { console.error(r.fatal); await browser.close(); process.exit(1); }

  const kb = (n) => (n / 1024).toFixed(0) + ' kB';
  const LIMIT = 1024 * 1024;
  const verdict = (n) => (n <= LIMIT ? 'FITS, ' + kb(LIMIT - n) + ' spare' : 'OVER by ' + kb(n - LIMIT));

  console.log(`seed ${r.seed} | season ${r.season}, day ${r.day} | ${SEASONS} season(s) played`);
  console.log('');
  console.log('players now                ', r.counts.played);
  console.log('  the seed also produces   ', r.counts.fromSeed,
    `(${r.counts.untouched} of them completely unchanged)`);
  console.log('  born since generation    ', r.counts.born, '(no seed makes these)');
  console.log('  the seed makes, gone now ', r.counts.buried, '(ids only)');
  console.log('');
  console.log('fields the seed gets right for everyone:', r.fields.still, '(free under B)');
  console.log('  ' + r.fields.stillList.join(' '));
  console.log('fields that moved for somebody:         ', r.fields.moved);
  console.log('');
  console.log('columns that had to fall back to Float64:', r.float64Columns);
  console.log('');

  const table = (label, m) => {
    console.log(label);
    Object.entries(m.parts).forEach(([k, v]) => console.log('   ' + k.padEnd(16), kb(v)));
    console.log('   ' + 'TOTAL'.padEnd(16), kb(m.total), ' ', verdict(m.total));
    if (m.big && m.big.length) console.log('   set aside as blobs:', m.big.join(' '));
    console.log('');
  };
  table('A. THE WHOLE WORLD, exact           (' + r.full.columns + ' columns)', r.full);
  table('B. SEED PLUS WHAT MOVED, exact       (' + r.diff.columns + ' columns)', r.diff);
  table('C. THE WHOLE WORLD, to a hundredth   (' + r.quant.columns + ' columns)', r.quant);
  table('D. SEED PLUS WHAT MOVED, hundredth   (' + r.qdiff.columns + ' columns)', r.qdiff);
  table('E. D, WITH THE WORLD IN COLUMNS TOO', r.packed);
  console.log('the world, packed:');
  Object.entries(r.worldPacked).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('   ' + k.padEnd(12), kb(v)));
  console.log('   ' + 'TOTAL'.padEnd(12), kb(r.worldPackedTotal), ' was', kb(r.qdiff.parts.world));
  if (r.worldBlobs.cupTies.length) console.log('   cup-tie fields still in a blob:', r.worldBlobs.cupTies.join(' '));
  if (r.worldBlobs.clubs.length) console.log('   club fields still in a blob:', r.worldBlobs.clubs.join(' '));
  console.log('');

  if (r.sideTables.length) {
    console.log('arrays turned into side tables (field, rows, columns):');
    const seenSide = new Set();
    r.sideTables.forEach(([k, rowsN, cols]) => {
      const tag = k + '|' + rowsN;
      if (seenSide.has(tag)) return;
      seenSide.add(tag);
      console.log('   ' + k.padEnd(8), String(rowsN).padStart(8), 'rows', String(cols).padStart(4), 'columns');
    });
    console.log('');
  }
  console.log('what is left in D, blob by blob:');
  r.bigBreakdown.sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('   ' + k.padEnd(16), kb(v)));
  console.log('');
  console.log('what is in the world blob:');
  Object.entries(r.worldBits).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('   ' + k.padEnd(16), kb(v)));
  console.log('');
  console.log('what the growing history looks like:');
  Object.entries(r.samples).forEach(([k, v]) => {
    if (!v) { console.log('   ' + k.padEnd(6), '(none on this squad)'); return; }
    console.log('   ' + k.padEnd(6), 'length ' + v.len);
    console.log('        ' + v.json);
  });
  console.log('');
  const best = [['A', r.full.total], ['B', r.diff.total], ['C', r.quant.total],
    ['D', r.qdiff.total], ['E', r.packed.total]].sort((x, y) => x[1] - y[1])[0];
  console.log('smallest:', best[0], kb(best[1]), verdict(best[1]));
  console.log('full save as JSON, uncompressed, for scale:', kb(r.fullSaveRaw));
  console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
})();