#!/usr/bin/env node
/* eslint-disable */
/* Why does this game finish 0-0 so often?
 *
 *   node scripts/measure-scoreline-shape.cjs [matches] [division]
 *
 * Measured across 7,600 league matches the game draws 28.7% of them
 * against real English football's 24%, and the whole surplus is
 * goalless and one-all: 11.0% and 11.6% against a real ~8% and ~9%.
 * That is not a small thing. A goalless draw is the least interesting
 * ninety minutes football has, and this game serves up half again as
 * many as the real sport.
 *
 * An independent-Poisson model on the game's own scoring rate — 2.7 a
 * game, so 1.35 a side — predicts 6.7% goalless. Getting 11% means the
 * goals are OVER-DISPERSED: there are too many matches in which
 * neither side does anything, which has to be paid for by too many in
 * which somebody does far too much. Momentum cannot be the cause,
 * because a match that finishes 0-0 never applied any.
 *
 * So this looks underneath the scoreline. For every match it records
 * how many shots each side had and how many went in, and reports:
 *
 *   - the shot count and its spread, against real football's ~13 a side
 *   - how often a side fails to score, and what Poisson would predict
 *   - the same split by whether the two squads are both good, both
 *     poor, or mismatched, because the suspicion is that the build-up
 *     gate collapses for BOTH sides when two poor squads meet, which
 *     would be a shared per-match factor and exactly what produces
 *     over-dispersion
 *   - the variance of the match's goal total against its mean, which is
 *     the one number that says how over-dispersed the thing is: Poisson
 *     has variance equal to mean, so anything above 1.0 is the fault
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const MATCHES = +(process.argv[2] || 3000);
const DIV = process.argv[3] || 'PL';
const SEED = +(process.argv[4] || 20260821);
const BAL = process.argv[5] ? JSON.parse(process.argv[5]) : null;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ want, div, seed, bal }) => {
    if (bal) {
      if (bal.DAY_LO != null) { DAY_LO = bal.DAY_LO; delete bal.DAY_LO; }
      if (bal.DAY_RANGE != null) { DAY_RANGE = bal.DAY_RANGE; delete bal.DAY_RANGE; }
      Object.assign(SPREAD, bal);
    }
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    window.RBSWorldSeed.build(seed, 'MUN');
    clear();

    const mem = G.clubs.filter((c) => c.league === div).map((c) => c.i);
    const freshen = () => mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
      p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0; p.morale = 70;
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
    const rank = {};
    byStrength.forEach((ci, ix) => { rank[ci] = ix; });
    const half = mem.length / 2;

    Math.random = window.RBSWorldSeed.mulberry32(seed >>> 0);
    const rounds = rrPairs(mem);
    /* let the goal-rate controller settle, then hold it still — the
       measurement wants a steady state, not a controller mid-solve */
    for (let k = 0; k < 700; k += 1) {
      const r = rounds[k % rounds.length];
      const f = r[k % r.length];
      freshen();
      const fx = { h: f[0], a: f[1], div, sc: [], hs: 0, as: 0, r: 0,
        day: 40 + (k * 7) % 260, played: false };
      buildContext(fx); quickSim(fx);
    }
    goalCal(div).n = -1e9;

    const bucket = () => ({ n: 0, goals: 0, gg: 0, shots: 0, ss: 0,
      nil: 0, blank: 0, sideN: 0, oneAll: 0, draw: 0 });
    const all = bucket(), both = { good: bucket(), poor: bucket(), mixed: bucket() };
    let k = 0;
    while (all.n < want) {
      const round = rounds[k % rounds.length];
      const [hi, ai] = round[(k * 3) % round.length];
      k += 1;
      freshen();
      const fix = { h: hi, a: ai, div, sc: [], hs: 0, as: 0, r: 0,
        day: 40 + (k * 7) % 260, played: false };
      buildContext(fix);
      const m = quickSim(fix);
      const sh = m.sides[0].st.sh, sa = m.sides[1].st.sh;
      const tot = fix.hs + fix.as;
      const add = (b) => {
        b.n += 1;
        b.goals += tot; b.gg += tot * tot;
        b.shots += sh + sa; b.ss += sh * sh + sa * sa; b.sideN += 2;
        if (tot === 0) b.nil += 1;
        if (fix.hs === 0) b.blank += 1;
        if (fix.as === 0) b.blank += 1;
        if (fix.hs === 1 && fix.as === 1) b.oneAll += 1;
        if (fix.hs === fix.as) b.draw += 1;
      };
      add(all);
      const hg = rank[hi] < half, ag = rank[ai] < half;
      add(hg && ag ? both.good : (!hg && !ag ? both.poor : both.mixed));
    }

    const read = (b) => {
      const mean = b.goals / b.n;
      const varr = b.gg / b.n - mean * mean;
      const shotMean = b.shots / b.sideN;
      return { n: b.n, mean, over: varr / mean,
        shots: shotMean, shotSd: Math.sqrt(b.ss / b.sideN - shotMean * shotMean),
        nil: b.nil / b.n, blank: b.blank / b.sideN,
        oneAll: b.oneAll / b.n, draw: b.draw / b.n };
    };
    return { all: read(all), good: read(both.good),
      poor: read(both.poor), mixed: read(both.mixed) };
  }, { want: MATCHES, div: DIV, seed: SEED, bal: BAL });

  /* Poisson's own answer for the same mean, so the report never asks a
     reader to hold a formula in their head */
  const pois = (mean) => {
    const half = mean / 2;
    let p = 0;
    for (let i = 0; i < 12; i += 1) {
      const pk = Math.exp(-half) * Math.pow(half, i) / (function f(n) { return n <= 1 ? 1 : n * f(n - 1); }(i));
      p += pk * pk;
    }
    return { nil: Math.exp(-half) * Math.exp(-half), draw: p,
      blank: Math.exp(-half) };
  };

  console.log('\n' + DIV + ', world seed ' + SEED + ', ' + out.all.n + ' matches\n');
  const rows = [['every match', out.all], ['two good squads', out.good],
    ['two poor squads', out.poor], ['one of each', out.mixed]];
  console.log('  ' + 'matches between'.padEnd(20) + 'n'.padStart(6)
    + 'goals'.padStart(8) + 'var/mean'.padStart(10)
    + 'shots'.padStart(8) + '±'.padStart(7)
    + '0-0'.padStart(8) + '1-1'.padStart(8) + 'drawn'.padStart(8));
  rows.forEach(([name, r]) => {
    console.log('  ' + name.padEnd(20) + String(r.n).padStart(6)
      + r.mean.toFixed(2).padStart(8) + r.over.toFixed(2).padStart(10)
      + r.shots.toFixed(1).padStart(8) + r.shotSd.toFixed(1).padStart(7)
      + (r.nil * 100).toFixed(1).padStart(7) + '%'
      + (r.oneAll * 100).toFixed(1).padStart(7) + '%'
      + (r.draw * 100).toFixed(1).padStart(7) + '%');
  });
  const p = pois(out.all.mean);
  console.log('  ' + 'if goals were Poisson'.padEnd(20) + ''.padStart(6)
    + out.all.mean.toFixed(2).padStart(8) + '1.00'.padStart(10)
    + ''.padStart(8) + ''.padStart(7)
    + (p.nil * 100).toFixed(1).padStart(7) + '%'
    + ''.padStart(8)
    + (p.draw * 100).toFixed(1).padStart(7) + '%');
  console.log('  ' + 'real football'.padEnd(20) + ''.padStart(6)
    + '2.80'.padStart(8) + ''.padStart(10)
    + '13.0'.padStart(8) + ''.padStart(7)
    + '8.0%'.padStart(8) + '9.0%'.padStart(8) + '24.0%'.padStart(8));
  console.log('\n  a side fails to score in ' + (out.all.blank * 100).toFixed(1)
    + '% of its matches; Poisson at this rate says ' + (p.blank * 100).toFixed(1)
    + '%   (real football: about 27%)');
  console.log('\n  var/mean above 1.00 is over-dispersion: the goals are bunched into');
  console.log('  matches rather than spread across them, which is what makes a 0-0');
  console.log('  commoner than the scoring rate can explain.');
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
