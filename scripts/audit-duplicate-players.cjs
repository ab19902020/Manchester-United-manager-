#!/usr/bin/env node
/* global document, newGame, G */

/* Codex's cycle-3 duplicates, checked in a LIVE WORLD rather than in the
 * data file. The file is clean — every recorded roster conflict resolves
 * to one club and no ESPN id is seated twice. What matters to a player is
 * what the game builds out of it. */
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

  const r = await page.evaluate(() => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); newGame('MUN'); clear();

    const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

    const seats = [];
    G.clubs.forEach((c) => {
      (c.players || []).forEach((p) => seats.push({ p, c, youth: false }));
      (c.youth || []).forEach((p) => seats.push({ p, c, youth: true }));
    });

    /* 1. one player object seated in two squads */
    const byPid = new Map();
    seats.forEach((s) => {
      const k = String(s.p.id);
      if (!byPid.has(k)) byPid.set(k, []);
      byPid.get(k).push(s);
    });
    const twoSeats = [...byPid.entries()].filter(([, v]) => v.length > 1)
      .map(([id, v]) => ({ id, name: v[0].p.name, where: v.map((s) => s.c.short) }));

    /* 2. p.club disagreeing with the squad the player actually sits in */
    const stranded = [];
    seats.forEach((s) => {
      if (s.p.club !== s.c.i) {
        stranded.push({
          name: s.p.name,
          says: (G.clubs[s.p.club] || {}).short || s.p.club,
          sitsIn: s.c.short,
        });
      }
    });

    /* 3. the same real ESPN identity in two squads */
    const byEspn = new Map();
    seats.forEach((s) => {
      const e = s.p.espnId;
      if (!e) return;
      const k = String(e);
      if (!byEspn.has(k)) byEspn.set(k, []);
      byEspn.get(k).push(s);
    });
    const espnTwice = [...byEspn.entries()].filter(([, v]) => v.length > 1)
      .map(([id, v]) => ({
        espnId: id,
        names: [...new Set(v.map((s) => s.p.name))],
        where: v.map((s) => s.c.short),
      }));

    /* 4. the same NAME in two squads — real life has these, so they are
          reported separately and judged by whether the identities differ */
    const byName = new Map();
    seats.forEach((s) => {
      const k = norm(s.p.name);
      if (!k) return;
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(s);
    });
    const nameTwice = [...byName.entries()].filter(([, v]) => v.length > 1)
      .map(([n, v]) => ({
        name: n,
        n: v.length,
        espn: [...new Set(v.map((s) => s.p.espnId || '-'))],
        where: v.map((s) => s.c.short),
        sameEspn: new Set(v.map((s) => String(s.p.espnId || '-'))).size === 1
          && v[0].p.espnId != null,
      }));

    /* 5. two players sharing one id, which would break playerById */
    const idCounts = {};
    seats.forEach((s) => { idCounts[s.p.id] = (idCounts[s.p.id] || 0) + 1; });
    const clashingIds = Object.entries(idCounts).filter(([, n]) => n > 1).length;

    return {
      clubs: G.clubs.length,
      seats: seats.length,
      twoSeats,
      stranded: stranded.slice(0, 12),
      strandedN: stranded.length,
      espnTwice,
      clashingIds,
      nameTwiceN: nameTwice.length,
      nameSameEspn: nameTwice.filter((x) => x.sameEspn),
      nameDifferent: nameTwice.filter((x) => !x.sameEspn).slice(0, 14),
      withEspn: seats.filter((s) => s.p.espnId).length,
    };
  });

  console.log('clubs', r.clubs, '| player seats', r.seats, '| carrying an ESPN id', r.withEspn);
  console.log('');
  console.log('1. one player object in two squads      :', r.twoSeats.length);
  r.twoSeats.forEach((x) => console.log('     ', x.name, x.id, '->', x.where.join(' + ')));
  console.log('2. p.club disagrees with the squad      :', r.strandedN);
  r.stranded.forEach((x) => console.log('     ', x.name, 'says', x.says, 'sits in', x.sitsIn));
  console.log('3. one ESPN identity in two squads      :', r.espnTwice.length);
  r.espnTwice.forEach((x) => console.log('     ', x.names.join('/'), x.espnId, '->', x.where.join(' + ')));
  console.log('4. two players sharing one internal id  :', r.clashingIds);
  console.log('');
  console.log('5. the same NAME in more than one squad :', r.nameTwiceN);
  console.log('     of those, the SAME ESPN identity (a real duplicate):',
    r.nameSameEspn.length);
  r.nameSameEspn.forEach((x) => console.log('       ', x.name, x.espn.join(','), '->', x.where.join(' + ')));
  console.log('     of those, DIFFERENT identities (two real men, fine):',
    r.nameTwiceN - r.nameSameEspn.length);
  r.nameDifferent.forEach((x) => console.log('       ', x.name.padEnd(22),
    'espn ' + x.espn.join(',').padEnd(18), x.where.join(' + ')));
  console.log('');
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
