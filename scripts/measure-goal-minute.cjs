#!/usr/bin/env node
/* eslint-disable */
/* Is a goal shown at the minute it was scored?
 *
 *   node scripts/measure-goal-minute.cjs [matches]
 *
 * A goal the save scores at 40 has to read 40 in the commentary, 40 in
 * the report and 40 on the broadcast. Anything else is the game telling
 * a player two different stories about the same goal.
 *
 * THIS RIG EXISTS BECAUSE THE LAST ONE MEASURED THE WRONG THING.
 * watch-dugout-match.cjs hands the picture every goal before kick-off
 * and lets it play the match out in one call. That is not how the game
 * feeds it: under live pacing the save runs LEAD minutes ahead of the
 * broadcast and posts each goal the moment it scores it, so the picture
 * hears about a goal with a couple of minutes of the match still to run
 * before that minute arrives. The old rig reported goals arriving six
 * minutes late; a watched match with a real renderer put both of its
 * goals on the minute. The rig was wrong, not the game.
 *
 * So this one runs the live loop: step the broadcast a little, tick the
 * save up to the broadcast's minute plus the lead, post anything it
 * scored, step again. Same arithmetic as src/dugout-matchday.js does
 * against a real renderer, without waiting for one — a watched match
 * under software rendering advances about one match minute every twenty
 * seconds, which is half an hour a match.
 *
 * It reports, for every goal, the minute the save scored it against the
 * minute the picture showed it. Those two numbers being equal is the
 * whole point.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const MATCHES = +(process.argv[2] || 20);
const SEED = +(process.argv[3] || 20260821);
const LEAD_ARG = +(process.argv[4] || 2);

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
      if (window.Matchday && typeof window.Matchday.stepMatch === 'function') { done('ok'); return; }
      if (window.RBSMatchday && window.RBSMatchday.unavailable()) { done('no WebGL'); return; }
      if (Date.now() - t0 > 60000) { done('timed out waiting for the broadcast'); return; }
      setTimeout(tryBoot, 250);
    };
    tryBoot();
  }), { seed: SEED });
  if (booted !== 'ok') { console.log(booted); await browser.close(); return; }

  const out = await page.evaluate(({ want, lead }) => {
    const md = window.Matchday;
    const dug = window.RBSDugoutMatchday;
    const mem = G.clubs.filter((c) => c.league === 'PL').map((c) => c.i);
    Math.random = window.RBSWorldSeed.mulberry32(0x9a71c >>> 0);

    /* the same half length the Dugout asks the broadcast for */
    const HALF = 150;
    /* and the same lead the driver keeps the save at */
    const LEAD = lead;
    const rows = [];

    for (let n = 0; n < want; n += 1) {
      const hi = mem[n % mem.length];
      const ai = mem[(n * 7 + 3) % mem.length];
      if (hi === ai) continue;
      (G.clubs[hi].players || []).concat(G.clubs[ai].players || []).forEach((p) => {
        p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0;
      });
      const fix = { h: hi, a: ai, div: 'PL', sc: [], hs: 0, as: 0, r: 0,
        day: 40 + n * 7, played: false };
      buildContext(fix);
      const m = new MatchSim(fix);
      MU.fix = fix; MU.m = m;
      dug.LIVE.on = true; dug.LIVE.posted = 0; dug.LIVE.waiting = [];

      md.loadSquads({ home: dug.squadFor(m.sides[0]), away: dug.squadFor(m.sides[1]) });
      md.playScript({ events: [], stats: null });
      md.setHalfLength(HALF);
      md.beginMatch();

      /* WHAT THE SAVE SAID, AND WHAT THE PICTURE SAID. The save's minute
         is captured as the goal is scored, before anything can restamp
         it; the picture's is the broadcast clock when the ball crossed
         the line. */
      const scoredAt = [];
      const shownAt = [];
      const passGoal = MatchSim.prototype.goal;
      const stub = { addGoal: (g) => { md.addGoal(g); return stub; } };
      const how = [];
      const onGoal = (ev) => {
        how.push(ev && ev.fromPen ? 'PENALTY' : String((ev && ev.finish) || '?'));
        shownAt.push(parseFloat(String((ev && ev.minute) || md.getState().minute)) || 0);
        try { dug.stampMinute(md, ev); } catch (e) { /* keeps its own */ }
      };
      md.on('goal', onGoal);

      /* THE LIVE LOOP, exactly as src/dugout-matchday.js runs it */
      let guard = 0;
      let heldSecs = 0;
      let playSecs = 0;
      while (!m.done && guard++ < 4000) {
        const st = md.stepMatch(1.0);
        /* THE CLOCK STOPPED, which is the cost this is here to price.
           Counting seconds with a goal outstanding measures something
           else: with a long lead the save scores minutes before the
           picture is allowed to, and the clock is running throughout. */
        if (st.held) heldSecs += 1; else playSecs += 1;
        const bMin = st.elapsed;
        const ceiling = Math.max(0, m.ftAt || 90);
        const target = Math.min(bMin + LEAD, ceiling, dug.heldFloor());
        dug.holdWhistle(m.min < ceiling && !m.done);
        let ticks = 0;
        while (!m.done && m.min < target && ticks < 30) {
          const held = dug.LIVE.waiting.length;
          m.tickOnce();
          /* the minute the save DECIDED the goal, captured as it is put
             on the queue — the number the old arrangement would have
             recorded, kept so the drift can still be reported */
          if (dug.LIVE.waiting.length > held) { scoredAt.push(m.min); break; }
          ticks += 1;
        }
        void stub;
        if (st.ended) break;
      }
      /* the whistle: let the save finish and release anything unshown */
      const heldAtWhistle = dug.LIVE.waiting.length;
      const scriptLeft = (() => { try { return md.scriptState().remaining; } catch (e) { return -1; } })();
      const pictureEnded = md.getState().phase === 'end';
      dug.LIVE.on = false;
      try { dug.releaseHeld(); } catch (e) { /* none held */ }
      let g2 = 0;
      while (!m.done && g2++ < 400) m.tickOnce();
      if (!m.done) { try { m.finish(); } catch (e) { /* stands */ } }
      md.off('goal', onGoal);
      void passGoal;

      rows.push({
        save: [fix.hs, fix.as],
        picture: md.getState().score.slice(),
        heldSecs, playSecs,
        how, forced: (() => { try { return md.scriptState().forced; } catch (e) { return -1; } })(),
        scoredAt, shownAt, heldAtWhistle, scriptLeft, pictureEnded,
        recorded: (fix.sc || []).map((g) => {
          /* "45+3" is the forty-eighth minute, not the forty-fifth */
          const parts = String(g.min).split('+');
          return (parseFloat(parts[0]) || 0) + (parts[1] ? parseFloat(parts[1]) || 0 : 0);
        }),
      });
    }
    return { rows };
  }, { want: MATCHES, lead: LEAD_ARG });

  const drift = [];
  let agree = 0, goals = 0, scoreOk = 0;
  out.rows.forEach((r) => {
    if (r.picture[0] === r.save[0] && r.picture[1] === r.save[1]) scoreOk += 1;
    r.recorded.forEach((rec, i) => {
      goals += 1;
      const was = r.scoredAt[i];
      if (was == null) return;
      drift.push(rec - was);
      if (Math.abs(rec - was) < 0.5) agree += 1;
    });
  });
  console.log('\n  match      save   picture   scored at            shown as');
  out.rows.forEach((r, i) => {
    const bad = r.scoredAt.slice().sort((a, b) => a - b).join(' ')
      !== r.recorded.slice().sort((a, b) => a - b).join(' ');
    console.log('  ' + String(i + 1).padStart(5) + r.save.join('-').padStart(10)
      + r.picture.join('-').padStart(10) + '   '
      + (r.scoredAt.join(' ') || '—').padEnd(20)
      + (r.recorded.join(' ') || '—') + (bad ? '   <-- DISAGREES' : ''));
  });
  if (drift.length) {
    drift.sort((a, b) => a - b);
    const mean = drift.reduce((t, v) => t + v, 0) / drift.length;
    console.log('\n  ' + agree + ' of ' + goals
      + ' goals are recorded at the minute the save scored them');
    console.log('  drift: average ' + mean.toFixed(2) + ' minutes, worst '
      + drift[drift.length - 1].toFixed(0) + ', best ' + drift[0].toFixed(0));
  }
  const finishes = {};
  let forced = 0;
  out.rows.forEach((r) => {
    forced += Math.max(0, r.forced);
    (r.how || []).forEach((h) => { finishes[h] = (finishes[h] || 0) + 1; });
  });
  console.log('  how the picture scored them: '
    + Object.keys(finishes).sort().map((k) => k + ' ' + finishes[k]).join(', ')
    + '   (spot kicks awarded to force one: ' + forced + ')');
  const heldSecs = out.rows.reduce((t, r) => t + (r.heldSecs || 0), 0);
  const playSecs = out.rows.reduce((t, r) => t + (r.playSecs || 0), 0);
  console.log('  the clock waited ' + (goals ? (heldSecs / goals).toFixed(1) : '0')
    + 's a goal, ' + (heldSecs + playSecs ? (heldSecs / (heldSecs + playSecs) * 100).toFixed(0) : '0')
    + '% of a match spent waiting (a half is 150s)');
  console.log('  ' + scoreOk + ' of ' + out.rows.length + ' matches agree on the score');
  const bad = out.rows.filter((r) => !(r.picture[0] === r.save[0] && r.picture[1] === r.save[1]));
  bad.forEach((r, i) => console.log('    disagreed: save ' + r.save.join('-')
    + ', picture ' + r.picture.join('-')
    + ', still held at the whistle ' + r.heldAtWhistle
    + ', the picture still owed ' + r.scriptLeft
    + ', the picture had ' + (r.pictureEnded ? 'finished' : 'NOT finished')));
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
