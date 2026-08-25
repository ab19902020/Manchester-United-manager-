#!/usr/bin/env node
/* eslint-disable */
/* HOW MANY CORNERS A MATCH, IN THE NUMBER THE PLAYER ACTUALLY SEES.
 *
 *   node scripts/measure-corners.cjs [matches] [seed]
 *
 * There are two corner counts in this game and they are not the same
 * thing. The broadcast keeps `S.stats.corners` for the pictures, and the
 * match report shows `A.st.cor`, which comes from MatchSim -- the engine
 * that decides the result and writes the save. Only the second one is on
 * a screen the player reads after every game, so it is the one this rig
 * measures.
 *
 * Real football runs at about ten a match across both sides, and the
 * spread matters as much as the mean: a side that never wins one and a
 * side that wins twelve are both ordinary Saturdays.
 *
 * Nothing here knows who is playing or who is winning. It plays a fixed
 * pair of mid-table sides off a seeded stream and counts.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const N = +(process.argv[2] || 400);
const SEED = +(process.argv[3] || 20260825);

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
    const rank = mem.slice().sort((a, b) => (G.clubs[b].rep || 0) - (G.clubs[a].rep || 0));
    const ME = rank[9];
    const THEM = rank[10];

    const squad = (ci) => (G.clubs[ci].players || []).filter((p) => !p.loan);
    /* the same healing the inputs rig needs, and for the same reason:
       replaying one fixture hundreds of times otherwise leaves two teams
       of crocks and measures that instead */
    const heal = (ci) => squad(ci).forEach((p) => {
      p.injury = null; p.susp = 0; p.cond = 100; p.sharp = 70; p.morale = 72;
    });

    /* WHERE THEY COME FROM, WITHOUT EDITING THE ENGINE TO ASK.
       MatchSim awards a corner in two places: a chance that breaks down
       in phase two, and a shot the keeper turns away. Both call
       `cornerEvent`, and the second one is always inside `shotEvent` --
       so the call depth at entry says which it was. A corner won from a
       corner (the header is saved) nests deeper again, which is worth
       seeing on its own because it is a chain that feeds itself. */
    const src = { openPlay: 0, save: 0, chained: 0, goals: 0 };
    let depth = 0;
    const realShot = MatchSim.prototype.shotEvent;
    MatchSim.prototype.shotEvent = function countedShot() {
      depth += 1;
      try { return realShot.apply(this, arguments); } finally { depth -= 1; }
    };
    const realCorner = MatchSim.prototype.cornerEvent;
    MatchSim.prototype.cornerEvent = function countedCorner() {
      if (depth === 0) src.openPlay += 1;
      else if (depth === 1) src.save += 1;
      else src.chained += 1;
      /* AND WHAT THEY ARE WORTH. A corner is not decoration: it runs a
         header contest that can score. So the corner rate is a lever on
         the goal rate too, and any change to it has to be reported with
         the goals it moved rather than the corners alone. */
      const before = this.fix.hs + this.fix.as;
      const out = realCorner.apply(this, arguments);
      if (this.fix.hs + this.fix.as > before) src.goals += 1;
      return out;
    };

    Math.random = window.RBSWorldSeed.mulberry32(0x5eed1 >>> 0);
    const per = [];
    let goals = 0, shots = 0, sot = 0, saves = 0;
    for (let i = 0; i < n; i += 1) {
      heal(ME); heal(THEM);
      try { goalCal('PL').trim = 0; } catch (e) { /* nothing to pin */ }
      const home = i % 2 === 0;
      const fix = { h: home ? ME : THEM, a: home ? THEM : ME, div: 'PL',
        sc: [], hs: 0, as: 0, r: 0, day: 40, played: false };
      let m;
      try { buildContext(fix); m = new MatchSim(fix); while (!m.done) m.tickOnce(); }
      catch (e) { continue; }
      const h = m.sides[0].st || {}, a = m.sides[1].st || {};
      per.push({ h: h.cor || 0, a: a.cor || 0 });
      goals += fix.hs + fix.as;
      shots += (h.sh || 0) + (a.sh || 0);
      sot += (h.sot || 0) + (a.sot || 0);
      saves += (h.sv || 0) + (a.sv || 0);
    }
    return { sides: per, goals, shots, sot, saves, played: per.length, src };
  }, { n: N, seed: SEED });

  const sides = out.sides;
  const total = sides.map((s) => s.h + s.a);
  const mean = total.reduce((t, x) => t + x, 0) / (total.length || 1);
  const sorted = total.slice().sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const none = sides.filter((s) => s.h === 0 || s.a === 0).length;

  console.log('\n  ' + out.played + ' matches, mid-table against mid-table, seeded.\n');
  console.log('  corners a match (both sides)   ' + mean.toFixed(2)
    + '        real football about 10');
  console.log('  median / 10th / 90th           ' + at(0.5) + ' / ' + at(0.1) + ' / ' + at(0.9));
  console.log('  a side wins none               '
    + (none / (out.played || 1) * 100).toFixed(1) + '% of matches');
  console.log('  goals a match                  ' + (out.goals / (out.played || 1)).toFixed(2));
  console.log('  shots a match                  ' + (out.shots / (out.played || 1)).toFixed(2)
    + '        real about 25.5');
  console.log('  shots on target a match        ' + (out.sot / (out.played || 1)).toFixed(2)
    + '        real about 8.7');
  console.log('  saves a match                  ' + (out.saves / (out.played || 1)).toFixed(2)
    + '        real about 5.9');
  console.log('  corners per shot               '
    + (mean / ((out.shots / (out.played || 1)) || 1)).toFixed(2));

  const s = out.src;
  const all = (s.openPlay + s.save + s.chained) || 1;
  console.log('\n  where they come from');
  console.log('    a chance that breaks down    ' + (s.openPlay / out.played).toFixed(2)
    + ' a match   ' + (s.openPlay / all * 100).toFixed(0) + '%');
  console.log('    a shot the keeper turns away ' + (s.save / out.played).toFixed(2)
    + ' a match   ' + (s.save / all * 100).toFixed(0) + '%');
  console.log('    won from another corner      ' + (s.chained / out.played).toFixed(2)
    + ' a match   ' + (s.chained / all * 100).toFixed(0) + '%');
  console.log('  goals scored from a corner     ' + (s.goals / out.played).toFixed(2)
    + ' a match   ' + (s.goals / (out.goals || 1) * 100).toFixed(0)
    + '% of all goals   real about 13%');
  console.log('\n  page errors: ' + (errs.length ? errs.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
