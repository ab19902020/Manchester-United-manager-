#!/usr/bin/env node
/* global window, document, performance, requestAnimationFrame, setTimeout,
          newGame, advanceDay, G, MU, ACTIONS, buildMatchScreen, trackedTick, playState */
/* Observe the 3D dugout while a real match is played.
 *
 * WHY THIS EXISTS. Twice now I have "verified" dugout behaviour by
 * pushing an action into `state.timeline.current` and looking at what
 * happened next. That proves nothing: the render loop calls
 * `activeAction(now, match)` every frame, which re-derives the current
 * action from the queue and throws the injected one away. Both checks
 * were measuring the game carrying on as normal.
 *
 * So this does the opposite. It starts a real career, opens a real
 * fixture, runs the real engine, and samples what the renderer is doing
 * on each frame — including which action the renderer itself decided it
 * was showing. Nothing is injected and nothing is faked. If a goal never
 * happens in the match, the run reports that it never saw a goal rather
 * than manufacturing one.
 *
 *   node scripts/observe-dugout.cjs [--minutes 90] [--shot out.png]
 */

const path = require('node:path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';

function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const minutes = Number(arg('minutes', 90));
  const shot = arg('shot', '');
  const file = 'file://' + path.resolve(__dirname, '..', 'red-devil-manager.html');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 460 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

  await page.goto(file);
  await page.waitForFunction('typeof newGame === "function"', { timeout: 90000 });

  await page.evaluate(async () => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    newGame('MUN');
    clear();
    for (let day = 0; day < 30; day += 1) { try { await advanceDay(); } catch (error) { /* pre-season */ } }
    const fixture = G.fixtures.find((f) => !f.played && (f.h === G.my || f.a === G.my));
    MU.fix = fixture;
    ACTIONS.kickoff();
    MU.tab = 'dugout';
    try { buildMatchScreen(); } catch (error) { /* screen builds on next render */ }
  });

  await page.waitForTimeout(2500);

  /* The recorder lives in the page and samples on animation frames, so
     it sees exactly what the renderer saw — including the action the
     renderer derived for itself. */
  await page.evaluate(() => {
    const api = window.RBSDugout3D;
    const state = api && api.state;
    window.__obs = {
      ready: !!(state && state.threeReady),
      frames: 0,
      seen: {},
      goal: null,
      save: null,
      ballFar: 0,
      ballNear: 0,
    };
    if (!state) return;

    const posOf = (pl) => {
      const model = pl && pl.p ? state.players.get(pl.p.id) : null;
      return model ? { x: model.position.x + 52.5, y: model.position.z + 34, model } : null;
    };

    const sample = () => {
      const obs = window.__obs;
      obs.frames += 1;
      const current = state.timeline && state.timeline.current;
      const type = current && current.type;
      if (type) obs.seen[type] = (obs.seen[type] || 0) + 1;
      if (type && current.technique) {
        obs.tech = obs.tech || {};
        obs.tech[current.technique] = (obs.tech[current.technique] || 0) + 1;
      }

      /* is the ball on the man who has it, when nothing is in flight */
      try {
        const play = playState();
        const holder = play && play.holder;
        const flying = current && ['pass', 'shot', 'goal', 'save', 'penalty'].includes(current.type)
          && performance.now() < current.endsAt;
        const spot = posOf(holder);
        if (spot && !flying) {
          const gap = Math.hypot(MU.ball.x - spot.x, MU.ball.y - spot.y);
          if (gap <= 2.5) obs.ballNear += 1; else obs.ballFar += 1;
        }
      } catch (error) { /* between phases */ }

      /* A GOAL: does the scoring side leave the positions the dot model
         is giving them? That is the question — not "did anybody move",
         which they do anyway. */
      if (type === 'goal' && current.actor) {
        try {
          const side = current.attackingSide;
          const match = MU.m;
          let off = 0; let on = 0; let scorerRun = 0;
          (MU.dots || []).forEach((dot) => {
            if (!dot || !dot.pl || !dot.pl.p || dot.pl.slot === 'GK' || dot.pl.off) return;
            const model = state.players.get(dot.pl.p.id);
            if (!model) return;
            const mine = match.sides[side] && match.sides[side].onfield.indexOf(dot.pl) >= 0;
            if (!mine) return;
            const dx = (model.position.x + 52.5) - dot.x;
            const dy = (model.position.z + 34) - dot.y;
            const drift = Math.hypot(dx, dy);
            if (drift > 4) off += 1; else on += 1;
            if (current.actorId === dot.pl.p.id) scorerRun = drift;
          });
          /* the other side: are they reacting, or standing there */
          let dejected = 0;
          (MU.dots || []).forEach((dot) => {
            if (!dot || !dot.pl || !dot.pl.p || dot.pl.off) return;
            const model = state.players.get(dot.pl.p.id);
            const data = model && model.userData;
            if (!data) return;
            const theirs = match.sides[current.defendingSide]
              && match.sides[current.defendingSide].onfield.indexOf(dot.pl) >= 0;
            if (!theirs) return;
            const armUp = data.leftArm ? Math.abs(data.leftArm.rotation.x) : 0;
            const stooped = data.hips ? (0.92 - data.hips.position.y) : 0;
            if (armUp > 0.5 || stooped > 0.06) dejected += 1;
          });

          /* did the ball actually cross the line and end up in the net */
          const line = current.attackingSide === 1 ? 0 : 105;
          const past = current.attackingSide === 1 ? (MU.ball.x < line) : (MU.ball.x > line);
          const best = window.__obs.goal;
          if (!best || off > best.awayFromDots) {
            window.__obs.goal = {
              awayFromDots: off, holdingShape: on, scorerDrift: +scorerRun.toFixed(2),
              dejected, ballX: +MU.ball.x.toFixed(1), crossedLine: past,
              clockStopped: MU.speed === 0,
            };
          }
          if (past) window.__obs.ballInNet = (window.__obs.ballInNet || 0) + 1;
        } catch (error) { /* skip the frame */ }
      }

      /* A GOAL: does the keeper go for it, or stand there? This is the
         one the complaint was about — "the goalie doesn't make an
         attempt to save it, he stood in front of like his goal". So it
         is measured on GOALS, not only on saves, and it records the
         spread as well as the best: if every goal produces the same
         dive the pictures are still identical. */
      if (type === 'goal' && current.keeperId != null) {
        try {
          const model = state.players.get(current.keeperId);
          const data = model && model.userData;
          if (data) {
            const lift = data.rootBody ? data.rootBody.position.y : 0;
            const roll = data.hips ? Math.abs(data.hips.rotation.z) : 0;
            const arm = data.leftArm ? Math.abs(data.leftArm.rotation.x) : 0;
            const g = window.__obs;
            g.gk = g.gk || {};
            const key = current.id;
            const best = g.gk[key] || { lift: 0, roll: 0, arm: 0 };
            g.gk[key] = {
              lift: Math.max(best.lift, +lift.toFixed(3)),
              roll: Math.max(best.roll, +roll.toFixed(3)),
              arm: Math.max(best.arm, +arm.toFixed(3)),
              tech: current.technique || 'none',
            };
          }
        } catch (error) { /* skip the frame */ }
      }

      /* A SAVE: is the keeper actually diving — arms out, off the floor
         — rather than standing where he was. */
      if (type === 'save') {
        try {
          const match = MU.m;
          const keeper = (match.sides[current.defendingSide].onfield || [])
            .find((pl) => pl.slot === 'GK' && !pl.off);
          const model = keeper && state.players.get(keeper.p.id);
          const data = model && model.userData;
          if (data) {
            const lift = data.rootBody ? data.rootBody.position.y : 0;
            const arm = data.leftArm ? Math.abs(data.leftArm.rotation.x) : 0;
            const roll = data.hips ? Math.abs(data.hips.rotation.z) : 0;
            const best = window.__obs.save;
            const score = lift + arm;
            if (!best || score > best.score) {
              window.__obs.save = { score: +score.toFixed(3), lift: +lift.toFixed(3), arm: +arm.toFixed(2), roll: +roll.toFixed(2) };
            }
          }
        } catch (error) { /* skip the frame */ }
      }

      window.__obsRaf = requestAnimationFrame(sample);
    };
    window.__obsRaf = requestAnimationFrame(sample);
  });

  /* run the real match */
  await page.evaluate(async (limit) => {
    for (let tick = 0; tick < limit * 3 && MU.m && !MU.m.done; tick += 1) {
      try { trackedTick(); } catch (error) { /* keep going */ }
      if (MU.m.stage === 'HT') { try { MU.m.tickOnce(); } catch (error) { /* resume */ } }
      await new Promise((done) => setTimeout(done, 26));
    }
  }, minutes);

  await page.waitForTimeout(600);
  if (shot) await page.screenshot({ path: shot });

  const result = await page.evaluate(() => ({
    obs: window.__obs,
    score: MU.m ? [MU.m.hs, MU.m.as] : null,
    minute: MU.m ? MU.m.min : null,
    feed: MU.m ? MU.m.feed.length : 0,
  }));

  const obs = result.obs || {};
  const near = obs.ballNear || 0;
  const far = obs.ballFar || 0;
  console.log('three ready      ', obs.ready);
  console.log('frames sampled   ', obs.frames, ' match minute', result.minute, ' score', JSON.stringify(result.score));
  console.log('actions rendered ', JSON.stringify(obs.seen));
  console.log('ball on the man  ', near + '/' + (near + far),
    (near + far) ? ((100 * near / (near + far)).toFixed(1) + '%') : 'n/a');
  console.log('goal celebration ', obs.goal ? JSON.stringify(obs.goal) : 'NEVER SAW A GOAL');
  console.log('ball in the net  ', obs.ballInNet || 0, 'frames past the goal line');
  console.log('techniques seen  ', obs.tech ? JSON.stringify(obs.tech) : 'NONE — classifier never matched');
  console.log('keeper save      ', obs.save ? JSON.stringify(obs.save) : 'NEVER SAW A SAVE');
  const gk = obs.gk ? Object.keys(obs.gk).map((k) => obs.gk[k]) : [];
  if (!gk.length) console.log('keeper at a goal  NEVER SAW A GOAL');
  else {
    const still = gk.filter((g) => g.lift < 0.2 && g.roll < 0.1).length;
    const spread = (key) => {
      const v = gk.map((g) => g[key]);
      return Math.min.apply(null, v).toFixed(2) + '..' + Math.max.apply(null, v).toFixed(2);
    };
    console.log('keeper at a goal ', gk.length, 'goals;', still, 'stood still;',
      'lift', spread('lift'), 'roll', spread('roll'), 'arm', spread('arm'));
    console.log('goal techniques  ', JSON.stringify(gk.map((g) => g.tech)));
  }
  console.log('page errors      ', errors.length ? errors.slice(0, 3) : 'none');

  await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
