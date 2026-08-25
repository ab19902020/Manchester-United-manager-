#!/usr/bin/env node
/* eslint-disable */
/* DOES WHAT THE MANAGER DOES ACTUALLY DECIDE ANYTHING?
 *
 *   node scripts/measure-inputs.cjs [matchesPerVariant]
 *
 * "A player's input into signings and keeping players fit and their
 *  morale up will have an input on how well they do. If they have a
 *  squad which has all the best players, but their morale's low and
 *  their older players are injured, it will make their team have a
 *  negative consequence."
 *
 * That is the rule the whole game rests on, and it is worth more than an
 * assurance that the code multiplies by a morale term somewhere. It
 * does -- `effA` scales every attribute by condition, sharpness, morale
 * and the team talk -- but a term being present says nothing about
 * whether it is big enough to change a season.
 *
 * So this measures the size of each one. The same fixture is played
 * hundreds of times with everything held still except one input, against
 * the same opponent, off a seeded stream so two variants are comparable.
 * What comes back is what that input is worth in points per season, which
 * is the only unit a manager thinks in.
 *
 * A number near zero here is a fault, not a curiosity: it would mean the
 * game is ignoring something it tells the player to care about.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const N = +(process.argv[2] || 600);
const SEED = +(process.argv[3] || 20260821);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ n, seed }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); window.RBSWorldSeed.build(seed, 'MUN'); clear();

    const mem = G.clubs.filter((c) => c.league === 'PL').map((c) => c.i);
    /* two mid-table sides, so neither variant is masked by a mismatch */
    const rank = mem.slice().sort((a, b) => (G.clubs[b].rep || 0) - (G.clubs[a].rep || 0));
    const ME = rank[9];
    const THEM = rank[10];

    const squad = (ci) => (G.clubs[ci].players || []).filter((p) => !p.loan);
    /* everything that will be put back between variants */
    const snap = () => squad(ME).map((p) => ({
      p, morale: p.morale, cond: p.cond, sharp: p.sharp, injury: p.injury,
      attrs: { ...p.attrs },
    }));
    const restore = (s) => s.forEach((r) => {
      r.p.morale = r.morale; r.p.cond = r.cond; r.p.sharp = r.sharp;
      r.p.injury = r.injury; r.p.attrs = { ...r.attrs };
    });

    /* LADDERS, NOT ONE-OFFS. The baseline squad is healed to morale 72,
       condition 100, sharpness 70, so a single "morale 95" row measures
       a 23-point step and reads as noise. A ladder shows the shape. */
    const VARIANTS = [
      ['as they are', () => {}],

      ['morale 20 (mutinous)', () => squad(ME).forEach((p) => { p.morale = 20; })],
      ['morale 45 (unhappy)', () => squad(ME).forEach((p) => { p.morale = 45; })],
      ['morale 72 (baseline)', () => squad(ME).forEach((p) => { p.morale = 72; })],
      ['morale 95 (flying)', () => squad(ME).forEach((p) => { p.morale = 95; })],

      ['condition 60 (legs gone)', () => squad(ME).forEach((p) => { p.cond = 60; })],
      ['condition 80 (heavy)', () => squad(ME).forEach((p) => { p.cond = 80; })],

      ['sharpness 35 (rusty)', () => squad(ME).forEach((p) => { p.sharp = 35; })],
      ['sharpness 95 (match sharp)', () => squad(ME).forEach((p) => { p.sharp = 95; })],

      ['best three injured', () => {
        squad(ME).slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3)
          .forEach((p) => { p.injury = { days: 20, kind: 'knock' }; });
      }],
      ['best man injured', () => {
        squad(ME).slice().sort((a, b) => b.ovr - a.ovr).slice(0, 1)
          .forEach((p) => { p.injury = { days: 20, kind: 'knock' }; });
      }],

      ['every attribute +2', () => squad(ME).forEach((p) => {
        Object.keys(p.attrs).forEach((k) => { p.attrs[k] = Math.min(20, p.attrs[k] + 2); });
      })],
      ['every attribute -2', () => squad(ME).forEach((p) => {
        Object.keys(p.attrs).forEach((k) => { p.attrs[k] = Math.max(1, p.attrs[k] - 2); });
      })],
    ];

    const rows = [];
    /* EVERY MATCH STARTS FROM THE SAME PLACE. tickOnce injures real
       players and the injury sticks to the club, so replaying a fixture
       hundreds of times quietly dismantles both squads -- the first two
       runs of this rig reported 568 and then 597 goalless draws out of
       600, which was not the match model saying anything, it was two
       teams of crocks. Both sides are put back to full health before
       every match, and the variant is re-applied on top. */
    const heal = (ci) => squad(ci).forEach((p) => {
      p.injury = null; p.susp = 0; p.cond = 100; p.sharp = 70; p.morale = 72;
    });

    VARIANTS.forEach(([label, apply]) => {
      const kept = snap();
      /* the same football for every variant */
      Math.random = window.RBSWorldSeed.mulberry32(0x5eed1 >>> 0);
      let w = 0, d = 0, l = 0, gf = 0, ga = 0;
      for (let i = 0; i < n; i += 1) {
        heal(ME); heal(THEM);
        apply();
        /* and the goal-rate controller held still: it watches a
           division's goals a game, and one fixture replayed hundreds of
           times reads to it as a scoring glut */
        try { goalCal('PL').trim = 0; } catch (e) { /* nothing to pin */ }
        const home = i % 2 === 0;
        const fix = { h: home ? ME : THEM, a: home ? THEM : ME, div: 'PL',
          sc: [], hs: 0, as: 0, r: 0, day: 40, played: false };
        try { buildContext(fix); quickSim(fix); } catch (e) { continue; }
        const my = home ? fix.hs : fix.as;
        const th = home ? fix.as : fix.hs;
        gf += my; ga += th;
        if (my > th) w += 1; else if (my === th) d += 1; else l += 1;
      }
      restore(kept);
      const played = w + d + l || 1;
      rows.push({ label, w, d, l, gf, ga, played,
        ppg: (w * 3 + d) / played, gd: (gf - ga) / played });
    });
    return rows;
  }, { n: N, seed: SEED });

  const base = out[0];
  console.log('\n  ' + N + ' matches a variant, same opponent, same seeded football.');
  console.log('  A season is 38 games, so the last column is what the input is worth\n'
    + '  over a season against a side of the same standard.\n');
  console.log('  ' + 'input'.padEnd(28) + 'W-D-L'.padStart(14)
    + 'goals'.padStart(12) + 'pts/game'.padStart(10) + 'per season'.padStart(12));
  out.forEach((r) => {
    const delta = (r.ppg - base.ppg) * 38;
    console.log('  ' + r.label.padEnd(28)
      + (r.w + '-' + r.d + '-' + r.l).padStart(14)
      + (r.gf + '-' + r.ga).padStart(12)
      + r.ppg.toFixed(3).padStart(10)
      + (r === base ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1) + ' pts').padStart(12));
  });
  console.log('\n  page errors: ' + (errs.length ? errs.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
