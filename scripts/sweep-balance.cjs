#!/usr/bin/env node
/* eslint-disable */
/* Which balance numbers produce a real league table?
 *
 *   node scripts/sweep-balance.cjs [seasons-per-candidate]
 *
 * measure-title-race.cjs answers "what does the table look like now".
 * This answers "what would it look like if". It builds the seeded world
 * once, then plays a full division under each candidate setting of SPREAD
 * — the clamps and the compression that decide how much of the gap
 * between two squads survives into the result — and prints them side by
 * side.
 *
 * One browser, one world, one fixture list, one difference at a time.
 * Every candidate plays the SAME seasons in the same order from the
 * same starting condition, so a difference in the table is a difference
 * in the numbers and not a difference in the weather.
 *
 * The reference column is real English football. The champion's average
 * over the thirty Premier League seasons before 2025-26 is 87.6 and
 * second is 80.5 (Opta/premierleague.com); fourth has averaged about 70
 * over the last decade; the club that finishes bottom has averaged
 * about 21 over the last ten seasons — 17, 24, 31, 16, 21, 23, 22, 25,
 * 16, 12 — which is NOT the 24 an earlier version of the title-race rig
 * carried, and that wrong reference is why the bottom of this game's
 * table was once reported as too weak when it was already right.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const SEASONS = +(process.argv[2] || 3);
const DIV = process.argv[3] || 'PL';
const SEED = +(process.argv[4] || 20260821);

/* THE CANDIDATES. The first row is always the control — an empty `bal`
   leaves every shipped value alone — and every other row is one stated
   difference from it.

   WHAT THE FIRST SWEEP SETTLED. Widening the gates at both ends lifts
   the champion (84.7 to 87.7 with the compression eased as well, which
   is real football's 87.6) but it costs two things: seventeenth falls
   from 33.7 to 30 against a real 37.8, and goals a game falls from 2.7
   to 2.5. The second cost is the serious one, because the goal-rate
   calibrator can only turn goals into saves — it has no way to put a
   goal back, so a division that arrives under its target stays under
   it. Lowering the floors is what does the damage: it is the weak
   side's share of the ball, and taking it away subtracts matches from
   the bottom of the table and shots from the whole division.

   So this sweep raises the ceilings and leaves the floors alone. The
   best side gets to dominate more without the worst side being made
   worse. */
const CANDIDATES = [
  { name: 'shipped', bal: {} },
  { name: 'ceilings', bal: { buildHi: .78, chanceHi: .63 } },
  { name: 'ceilings, higher', bal: { buildHi: .82, chanceHi: .66 } },
  { name: 'ceilings + poss', bal: { buildHi: .78, chanceHi: .63, possHi: .66 } },
  { name: 'ceilings + less compress', bal: { compress: .94, buildHi: .78, chanceHi: .63 } },
  { name: 'higher + poss + compress', bal: { compress: .94, buildHi: .82, chanceHi: .66, possHi: .66 } },
  /* the best of the first sweep, carried forward so the two are
     compared on the same seasons rather than across runs */
  { name: 'first sweep best', bal: { compress: .94, buildLo: .52, buildHi: .78, chanceLo: .35, chanceHi: .63 } },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (/^\[sweep\]/.test(m.text())) console.log(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ seasons, div, seed, cands }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    window.RBSWorldSeed.build(seed, 'MUN');
    clear();

    const mem = G.clubs.filter((c) => c.league === div).map((c) => c.i);
    const freshen = () => mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
      p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0; p.morale = 70;
      if (p.stats) { p.stats.goals = 0; p.stats.assists = 0; p.stats.apps = 0; }
      if (p.form) p.form.length = 0;
    }));

    const STR = {};
    const strength = (ci) => {
      if (STR[ci] != null) return STR[ci];
      const c = G.clubs[ci];
      const shape = FORMATIONS[c.tacs.formation] || FORMATIONS['4-3-3'];
      const ids = autoPick(ci, c.tacs.formation) || [];
      let sum = 0, n = 0;
      shape.forEach(([slot], ix) => {
        const p = ids[ix] ? playerById(ids[ix]) : null;
        if (!p) return;
        sum += calcEff(p, slot); n += 1;
      });
      STR[ci] = n ? sum / n : 0;
      return STR[ci];
    };
    freshen();
    const byStrength = mem.slice().sort((x, y) => strength(y) - strength(x));

    /* the fixture list is built once and every candidate plays it */
    const rounds = rrPairs(mem);

    const shippedBal = Object.assign({}, SPREAD);
    const shippedDay = { lo: DAY_LO, range: DAY_RANGE };

    const playSeason = () => {
      freshen();
      const row = {};
      mem.forEach((i) => { row[i] = { i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
      rounds.forEach((round, ri) => {
        mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
          if (!p.injury) p.cond = Math.min(100, p.cond + 6.1 * 3);
        }));
        round.forEach(([hi, ai]) => {
          const fix = { h: hi, a: ai, div, sc: [], hs: 0, as: 0, r: 0,
            day: 40 + (ri * 7) % 260, played: false };
          buildContext(fix);
          quickSim(fix);
          const H = row[hi], A = row[ai];
          H.p += 1; A.p += 1;
          H.gf += fix.hs; H.ga += fix.as; A.gf += fix.as; A.ga += fix.hs;
          if (fix.hs > fix.as) { H.w += 1; A.l += 1; H.pts += 3; }
          else if (fix.hs < fix.as) { A.w += 1; H.l += 1; A.pts += 3; }
          else { H.d += 1; A.d += 1; H.pts += 1; A.pts += 1; }
        });
      });
      return mem.map((i) => row[i]).sort((x, y) => y.pts - x.pts
        || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
    };

    const results = [];
    cands.forEach((cand) => {
      Object.assign(SPREAD, shippedBal, cand.bal || {});
      DAY_LO = (cand.day && cand.day.lo != null) ? cand.day.lo : shippedDay.lo;
      DAY_RANGE = (cand.day && cand.day.range != null) ? cand.day.range : shippedDay.range;
      const tables = [];
      for (let s = 0; s < seasons; s += 1) tables.push(playSeason());
      const at = (k) => tables.reduce((t, tb) => t + tb[k].pts, 0) / tables.length;
      const champ = tables.map((tb) => tb[0]);
      const gpg = tables.reduce((t, tb) => {
        const g = tb.reduce((u, r) => u + r.gf, 0);
        const p = tb.reduce((u, r) => u + r.p, 0) / 2;
        return t + g / p;
      }, 0) / tables.length;
      results.push({
        name: cand.name,
        first: at(0), second: at(1), fourth: at(3),
        mid: at(Math.floor(mem.length / 2)),
        seventeenth: at(mem.length - 4), last: at(mem.length - 1),
        gpg,
        W: champ.reduce((t, r) => t + r.w, 0) / champ.length,
        D: champ.reduce((t, r) => t + r.d, 0) / champ.length,
        L: champ.reduce((t, r) => t + r.l, 0) / champ.length,
        rank: tables.reduce((t, tb) => t + byStrength.indexOf(tb[0].i) + 1, 0) / tables.length,
        rho: tables.reduce((t, tb) => {
          let sum = 0;
          tb.forEach((r, ix) => { sum += Math.abs(ix - byStrength.indexOf(r.i)); });
          return t + sum / tb.length;
        }, 0) / tables.length,
      });
      console.log('[sweep] ' + cand.name + ' done');
    });
    /* leave the page as we found it */
    Object.assign(SPREAD, shippedBal);
    DAY_LO = shippedDay.lo; DAY_RANGE = shippedDay.range;
    return { results, clubs: mem.length };
  }, { seasons: SEASONS, div: DIV, seed: SEED, cands: CANDIDATES });

  const REAL = { first: 87.6, second: 80.5, fourth: 70.1, mid: 49, seventeenth: 37.8, last: 20.7, gpg: 2.8 };
  const cols = ['first', 'second', 'fourth', 'mid', 'seventeenth', 'last', 'gpg'];
  const head = ['1st', '2nd', '4th', 'mid', '17th', '20th', 'g/g'];
  console.log('\n' + DIV + ', ' + out.clubs + ' clubs, ' + SEASONS
    + ' seasons a candidate, world seed ' + SEED + '\n');
  console.log('  ' + 'candidate'.padEnd(24) + head.map((h) => h.padStart(7)).join('')
    + '   champion  best  table');
  console.log('  ' + 'real football'.padEnd(24)
    + cols.map((c) => REAL[c].toFixed(1).padStart(7)).join('')
    + '   27W 6D 5L    #2    ~3');
  out.results.forEach((r) => {
    console.log('  ' + r.name.padEnd(24)
      + cols.map((c) => r[c].toFixed(1).padStart(7)).join('')
      + '   ' + (r.W.toFixed(0) + 'W ' + r.D.toFixed(0) + 'D ' + r.L.toFixed(0) + 'L').padEnd(11)
      + ('#' + r.rank.toFixed(1)).padStart(5) + r.rho.toFixed(1).padStart(6));
  });
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
