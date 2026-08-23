#!/usr/bin/env node
/* eslint-disable */
/* Does the match you WATCH agree with the match the save recorded?
 *
 *   node scripts/watch-dugout-match.cjs [matches]
 *
 * Every other rig plays through quickSim, which is MatchSim with no
 * pictures, so none of them can see the Dugout — and the Dugout used to
 * be a different game. While the broadcast was driving, a goal MatchSim
 * scored for itself became a chance that did not come off, and the
 * goals that counted were the ones the picture scored. Watching a match
 * could give a different result from simulating it and no amount of
 * season measurement would ever have noticed.
 *
 * The save decides now and the broadcast performs what it decided. Two
 * things have to be true for that to hold, and this checks both against
 * real squads out of a real career:
 *
 *   1. THE PICTURE DELIVERS. Hand it the goals a real MatchSim match
 *      produced and the final score on the broadcast's own scoreboard
 *      is that score, with nothing owed at the whistle.
 *
 *   2. THE PICTURE INVENTS NOTHING. Everything else it would have
 *      scored is refused — turned into a save or the woodwork at the
 *      goal line — and the count of those refusals is reported, because
 *      a run where it refused nothing is a run that proves nothing.
 *
 * It uses the engine's own headless mode, which runs the identical
 * tick() the watched match runs with no rendering and no camera. That
 * matters for a duller reason too: under software rendering a watched
 * match advances about one match minute every twenty seconds, so
 * ninety minutes of football takes half an hour of wall clock and
 * checking a dozen of them is not possible any other way.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const MATCHES = +(process.argv[2] || 12);
const SEED = +(process.argv[3] || 20260821);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--mute-audio', '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(3000);

  /* THE BROADCAST BOOTS WHEN THE DUGOUT MOUNTS IT, and not before: it
     fetches Three, builds a stadium and only then puts `Matchday` on the
     window. So mount it into a container of our own and wait. */
  const booted = await page.evaluate(({ seed }) => new Promise((done) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    window.RBSWorldSeed.build(seed, 'MUN');
    clear();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:400px';
    document.body.appendChild(box);
    const t0 = Date.now();
    const tryBoot = () => {
      try { window.RBSMatchday.mount(box); } catch (e) { /* not yet */ }
      if (window.Matchday) { done('ok'); return; }
      if (window.RBSMatchday && window.RBSMatchday.unavailable()) { done('no WebGL'); return; }
      if (Date.now() - t0 > 60000) { done('timed out waiting for the broadcast'); return; }
      setTimeout(tryBoot, 250);
    };
    tryBoot();
  }), { seed: SEED });
  if (booted !== 'ok') { console.log(booted); await browser.close(); return; }

  const out = await page.evaluate(async ({ want }) => {
    const md = window.Matchday;
    const dug = window.RBSDugoutMatchday;
    if (!md || !dug) return { fatal: 'the broadcast never loaded' };
    if (typeof md.simulateMatch !== 'function') return { fatal: 'no headless mode' };

    const mem = G.clubs.filter((c) => c.league === 'PL').map((c) => c.i);
    const rows = [];
    for (let n = 0; n < want; n += 1) {
      /* a real match, played by the same engine the whole league uses */
      const hi = mem[n % mem.length];
      const ai = mem[(n * 7 + 3) % mem.length];
      if (hi === ai) continue;
      (G.clubs[hi].players || []).concat(G.clubs[ai].players || []).forEach((p) => {
        p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0;
      });
      const fix = { h: hi, a: ai, div: 'PL', sc: [], hs: 0, as: 0, r: 0,
        day: 40 + n * 7, played: false };
      buildContext(fix);
      const m = quickSim(fix);

      /* now hand that match to the picture the way the live path does */
      md.loadSquads({ home: dug.squadFor(m.sides[0]), away: dug.squadFor(m.sides[1]) });
      md.playScript({ events: [], stats: null });
      const stub = { addGoal: (g) => { md.addGoal(g); return stub; } };
      dug.LIVE.posted = 0;
      dug.postGoals(stub, fix);

      md.setHalfLength(240);
      const st = md.simulateMatch({ maxTicks: 400000 });
      const sc = md.scriptState();
      rows.push({
        save: [fix.hs, fix.as],
        picture: st.score.slice(),
        completed: !!st.completed,
        owed: sc.remaining,
        refused: sc.blocked,
        scorers: (fix.sc || []).map((g) => String(g.name)),
        performed: sc.events.filter((e) => e.fired).length,
        /* which minutes were asked for, and which of them arrived */
        mins: sc.events.map((e) => e.minute + (e.fired ? '' : '!')).join(' '),
        ftAt: m.ftAt,
      });
    }
    return { rows };
  }, { want: MATCHES });

  if (out.fatal) { console.log(out.fatal); await browser.close(); return; }

  console.log('\n  match      save   picture   agree   owed   refused   goal minutes (! = never shown)');
  let agree = 0, refused = 0, owed = 0;
  out.rows.forEach((r, i) => {
    const ok = r.picture[0] === r.save[0] && r.picture[1] === r.save[1] && r.owed === 0;
    if (ok) agree += 1;
    refused += r.refused; owed += r.owed;
    console.log('  ' + String(i + 1).padStart(5)
      + r.save.join('-').padStart(10) + r.picture.join('-').padStart(10)
      + (ok ? '     yes' : '      NO').padStart(8)
      + String(r.owed).padStart(7) + String(r.refused).padStart(10)
      + '   ' + r.mins.padEnd(18) + '  ft ' + r.ftAt + (r.completed ? '' : '   NEVER REACHED THE WHISTLE'));
  });
  console.log('\n  ' + agree + ' of ' + out.rows.length
    + ' matches ended with the picture showing exactly the score the save recorded');
  console.log('  ' + owed + ' goals were still owed at the whistle across all of them');
  console.log('  ' + refused + ' goals the picture would have scored on its own were refused'
    + (refused ? '' : '   — WITHOUT ANY REFUSALS THIS RUN PROVES NOTHING'));
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
})();
