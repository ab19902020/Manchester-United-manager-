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
 * THIS IS THE NON-LIVE PATH, and that is now the whole of what it
 * covers. There are two ways into the Dugout: kicking off in it, where
 * the save runs a couple of minutes ahead and each goal is handed over
 * as it is scored (scripts/measure-goal-minute.cjs measures that one,
 * including whether the minutes agree), and walking into it on a match
 * that is already under way, where the save settles the result first and
 * the picture is handed the whole plan before it kicks off. That second
 * one is this. It used to drive the first one too, and stopped being
 * able to the moment goals started being held for the picture rather
 * than recorded and posted: every goal sat in the queue, the fixture
 * stayed 0-0, and twelve matches in a row reported a goalless draw that
 * both sides agreed on. Agreement about nothing is not agreement.
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

    /* SEEDED, BECAUSE THE FIRST VERSION OF THIS COMPARED NOISE.
       The world is seeded but neither MatchSim nor the broadcast is, and
       the broadcast leans on Math.random for every duel, every shot and
       every save. Run twice with identical settings this rig reported
       goals 1.57 minutes late with 38% of them from the spot, and then
       3.38 minutes late with 54% — so the differences between candidate
       settings it was being used to choose between were inside its own
       spread. Seeding the stream makes a setting reproducible and two
       settings comparable. */
    Math.random = window.RBSWorldSeed.mulberry32(0x51ee0 >>> 0);
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
      /* THE SAVE PLAYS AS IT DOES WITH THE DUGOUT WATCHING, which is
         what puts each goal into the queue waiting for a minute */
      const m = new MatchSim(fix);
      MU.fix = fix; MU.m = m;
      /* live mode OFF: the save plays the match out and records it, the
         way it does when you walk into the Dugout on a match already
         under way */
      dug.LIVE.on = false; dug.LIVE.posted = 0; dug.LIVE.waiting = [];
      let guard = 0;
      while (!m.done && guard++ < 600) m.tickOnce();
      if (!m.done) { try { m.finish(); } catch (e) { /* it stands */ } }
      /* the minute the save originally put on each goal, before the
         picture has had any say in it */
      const asScored = (fix.sc || []).map((g) => String(g.min));

      /* now hand that match to the picture the way the live path does */
      md.loadSquads({ home: dug.squadFor(m.sides[0]), away: dug.squadFor(m.sides[1]) });
      md.playScript(dug.planFor(fix, m));

      md.setHalfLength(240);
      /* WHEN THE PICTURE ACTUALLY SHOWS IT. The commentary, the 2D
         pitch and the scoreboard all read MatchSim's minute, so the
         minute a goal was posted for IS the minute the rest of the game
         says it happened. This records the broadcast's own clock at the
         moment the goal goes in, which is the minute the Dugout says it
         happened. The difference between the two is the only thing that
         can make the same goal look like it arrived at two different
         times. */
      const shown = [];
      /* THE REAL PENALTY SHARE. SCRIPT.forced counts spot kicks AWARDED,
         and a saved one is awarded again, so it over-counts badly — it
         was reading 56% while the question is how many goals a viewer
         actually sees converted from the spot. The goal event says how
         each one was finished. */
      let pens = 0;
      const onGoal = (ev) => {
        if (ev && ev.fromPen) pens += 1;
        try {
          /* `elapsed` and not `minute`: the HUD label reads "90+3" and
             parses back to 90, which quietly hides three minutes */
          const m2 = md.getState().elapsed;
          shown.push(Number.isFinite(m2) ? Math.round(m2) : null);
        } catch (e) { shown.push(null); }
        /* nothing to stamp: on this path the save recorded the match
           before the picture ever saw it, and the picture's clock waits
           on each goal's minute rather than putting its own on it */
      };
      md.on('goal', onGoal);
      const st = md.simulateMatch({ maxTicks: 400000 });
      md.off('goal', onGoal);
      dug.LIVE.on = false;
      const sc = md.scriptState();
      rows.push({
        save: [fix.hs, fix.as],
        picture: st.score.slice(),
        completed: !!st.completed,
        owed: sc.remaining,
        refused: sc.blocked,
        forced: sc.forced || 0,
        pens,
        scorers: (fix.sc || []).map((g) => String(g.name)),
        performed: sc.events.filter((e) => e.fired).length,
        /* which minutes were asked for, and which of them arrived */
        mins: sc.events.map((e) => e.minute + (e.fired ? '' : '!')).join(' '),
        ftAt: m.ftAt,
        shown,
        /* THE INVARIANT: every minute in the save is a minute the
           picture showed, and the other way about. NOT compared in
           order: the save may score home-then-away where the picture
           builds away-then-home, so the same six goals arrive in a
           different sequence. Comparing by position said a perfectly
           stamped 3-3 disagreed, which was the check being wrong rather
           than the football. */
        agreeMin: (() => {
          const mine = (fix.sc || []).map((g) => {
            const parts = String(g.min).split('+');
            return (parseFloat(parts[0]) || 0) + (parts[1] ? parseFloat(parts[1]) || 0 : 0);
          }).filter((v) => Number.isFinite(v)).sort((x, y) => x - y).join(',');
          const theirs = shown.filter((v) => v != null)
            .slice().sort((x, y) => x - y).join(',');
          return mine === theirs;
        })(),
        /* and how long the picture took, against the minute the save
           originally had — a quality number, not a correctness one */
        lag: asScored.map((was, i) => {
          if (shown[i] == null) return null;
          const parts = String(was).split('+');
          const w = (parseFloat(parts[0]) || 0) + (parts[1] ? parseFloat(parts[1]) || 0 : 0);
          return shown[i] - w;
        }).filter((v) => v != null),
      });
    }
    return { rows };
  }, { want: MATCHES });

  if (out.fatal) { console.log(out.fatal); await browser.close(); return; }

  console.log('\n  match      save   picture   agree   owed   refused   goal minutes (! = never shown)');
  let agree = 0, refused = 0, owed = 0, forced = 0, goals = 0, pens = 0;
  out.rows.forEach((r, i) => {
    const ok = r.picture[0] === r.save[0] && r.picture[1] === r.save[1]
      && r.owed === 0 && r.agreeMin;
    if (ok) agree += 1;
    refused += r.refused; owed += r.owed; forced += r.forced; pens += r.pens;
    goals += r.save[0] + r.save[1];
    console.log('  ' + String(i + 1).padStart(5)
      + r.save.join('-').padStart(10) + r.picture.join('-').padStart(10)
      + (ok ? '     yes' : '      NO').padStart(8)
      + String(r.owed).padStart(7) + String(r.refused).padStart(10)
      + '   ' + r.mins.padEnd(18) + '  ft ' + r.ftAt + (r.completed ? '' : '   NEVER REACHED THE WHISTLE'));
  });
  /* how far apart the two clocks are when the same goal lands */
  const lags = [];
  out.rows.forEach((r) => (r.lag || []).forEach((v) => lags.push(v)));
  if (lags.length) {
    lags.sort((a, b) => a - b);
    const mean = lags.reduce((t, v) => t + v, 0) / lags.length;
    const pick = (q) => lags[Math.min(lags.length - 1, Math.floor(lags.length * q))];
    console.log('\n  HOW LONG THE PICTURE TOOK, in match minutes, against the minute');
    console.log('  the save first had it — ' + lags.length + ' goals. On this path the');
    console.log('  save recorded the match before the picture saw it, so the clock waits');
    console.log('  on each of these minutes rather than putting one of its own on a goal.');
    console.log('    average ' + mean.toFixed(2)
      + '    median ' + pick(0.5).toFixed(2)
      + '    9 in 10 within ' + pick(0.9).toFixed(2)
      + '    worst ' + lags[lags.length - 1].toFixed(2));
    const agreed = out.rows.filter((r) => r.agreeMin).length;
    console.log('    every goal\'s minute agrees between the save and the picture in '
      + agreed + ' of ' + out.rows.length + ' matches');
  }
  const scoreOk = out.rows.filter((r) =>
    r.picture[0] === r.save[0] && r.picture[1] === r.save[1]).length;
  console.log('\n  ' + scoreOk + ' of ' + out.rows.length
    + ' matches ended with the picture showing exactly the score the save recorded');
  console.log('  ' + agree + ' of ' + out.rows.length
    + ' agreed on the score AND on every minute AND owed nothing at the whistle');
  console.log('  ' + owed + ' goals were still owed at the whistle across all of them');
  console.log('  ' + pens + ' of ' + goals + ' goals were converted from the penalty spot'
    + (goals ? '   (' + Math.round(pens / goals * 100) + '%, real football about 10%)' : '')
    + '   [' + forced + ' spot kicks awarded in all]');
  console.log('  ' + refused + ' goals the picture would have scored on its own were refused'
    + (refused ? '' : '   — WITHOUT ANY REFUSALS THIS RUN PROVES NOTHING'));
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
})();
