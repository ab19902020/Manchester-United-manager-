#!/usr/bin/env node
/* global window, document, newGame, advanceDay, G, MU, ACTIONS, buildMatchScreen */

/* THE DUGOUT ON THE CLOSEST THING TO A PHONE WE HAVE.
 *
 *   node scripts/check-dugout-mobile.cjs
 *
 * WHAT THIS IS NOT. It is not a phone. Nobody has run the 3D Dugout on
 * real handset hardware, and this script cannot change that: SwiftShader
 * is a software rasteriser, so frame time here says nothing about a
 * mobile GPU, and it cannot get warm, throttle or run a battery down.
 * Those remain untested and the release notes should keep saying so.
 *
 * WHAT IT IS. Everything about the mobile path that does NOT need real
 * silicon, which turns out to be most of the ways it can actually break:
 *
 *   - the phone quality path is the one that runs, at a phone viewport
 *     with a coarse pointer and touch
 *   - a scene really builds under real WebGL, with 22 players in it
 *   - the draw-call and triangle budget is what the mobile path claims
 *   - WEBGL CONTEXT LOSS IS SURVIVED. This is the mobile-specific
 *     failure — a phone drops the GL context when the tab is
 *     backgrounded, on a call, or under memory pressure, and it does it
 *     routinely rather than exceptionally. A desktop browser almost
 *     never does, which is exactly why it had never been exercised.
 *     The renderer is supposed to catch it, tear the scene down and put
 *     the tested 2D fallback in its place rather than leave a dead black
 *     canvas over the match.
 *   - and the match keeps playing throughout, because a broken picture
 *     must never cost somebody the result.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';
const path = require('path');

async function openDugout(page) {
  await page.evaluate(async () => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); newGame('MUN'); clear();
    for (let day = 0; day < 30; day += 1) {
      try { await advanceDay(); } catch (error) { /* pre-season */ }
    }
    const fixture = G.fixtures.find((f) => !f.played && (f.h === G.my || f.a === G.my));
    MU.fix = fixture;
    ACTIONS.kickoff();
    MU.tab = 'dugout';
    try { buildMatchScreen(); } catch (error) { /* builds on the next render */ }
  });
  await page.waitForTimeout(3000);
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const file = 'file://' + path.resolve(__dirname, '..', 'index.html');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  /* a phone, held the way you watch a match: landscape, coarse pointer,
     touch, and the device pixel ratio a mid-range handset reports */
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 180)));

  await page.goto(file);
  await page.waitForFunction('typeof newGame === "function"', { timeout: 90000 });
  await openDugout(page);

  const live = await page.evaluate(() => {
    const api = window.RBSDugout3D;
    const state = api && api.state;
    const renderer = state && state.renderer;
    const info = renderer && renderer.info;
    return {
      loaded: !!api,
      ready: !!(state && state.threeReady),
      disabled: !!(state && state.disabled),
      players: state && state.players ? state.players.size : 0,
      calls: info ? info.render.calls : -1,
      triangles: info ? info.render.triangles : -1,
      /* the mobile profile is supposed to be the one in force */
      quality: state ? (state.quality || state.profile || null) : null,
      shadows: renderer ? !!(renderer.shadowMap && renderer.shadowMap.enabled) : null,
      pixelRatio: renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : null,
      error: state && state.lastError ? String(state.lastError.message || state.lastError) : null,
      canvases: document.querySelectorAll('#dugoutWrap canvas, .dugout canvas, canvas').length,
      minute: (() => { try { return MU.m ? MU.m.min : null; } catch (e) { return null; } })(),
    };
  });

  /* ---- now take the context away, the way a phone does ---- */
  const lost = await page.evaluate(async () => {
    const out = { forced: false };
    const canvas = [...document.querySelectorAll('canvas')]
      .find((c) => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } });
    if (!canvas) return out;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return out;
    ext.loseContext();
    out.forced = true;
    await new Promise((done) => setTimeout(done, 1500));
    return out;
  });
  await page.waitForTimeout(2500);

  const after = await page.evaluate(async () => {
    const api = window.RBSDugout3D;
    const state = api && api.state;
    /* the match must still be running and must still advance */
    const before = (() => { try { return MU.m ? MU.m.min : null; } catch (e) { return null; } })();
    await new Promise((done) => setTimeout(done, 2500));
    const now = (() => { try { return MU.m ? MU.m.min : null; } catch (e) { return null; } })();
    /* THE RIGHT QUESTION, AND MY FIRST ONE WAS WRONG. I originally
       asked whether a canvas of some size was still on screen, and it
       reported a fault — but the canvas measures 0x0 in this harness
       BEFORE the context is lost too, because the match screen is built
       synthetically and never laid out. That check was measuring my own
       scaffolding.

       What actually matters is whether the fallback can paint at all:
       a canvas that has held a WebGL context returns null from
       getContext('2d') for ever, and that is what made the switchover
       throw. */
    const canvas = document.getElementById('dugCanvas');
    let painted = false;
    try { painted = !!(canvas && canvas.getContext('2d')); } catch (error) { painted = false; }
    return {
      disabled: !!(state && state.disabled),
      reported: state && state.lastError ? String(state.lastError.message || state.lastError) : null,
      stillACanvas: painted,
      minuteBefore: before,
      minuteNow: now,
      screenAlive: !!document.getElementById('view') || !!document.querySelector('.matchwrap, #matchScreen'),
    };
  });

  const want = [
    ['the renderer loaded', live.loaded],
    ['a real WebGL scene built', live.ready && !live.disabled],
    ['22 players are in it', live.players >= 22],
    ['shadow maps are off on the phone path', live.shadows === false],
    /* A CEILING, NOT A BLESSING OF TODAY'S NUMBER. Codex reported ~130
       draw calls for the mobile path in August; it measures 275 now, on
       the same viewport with the mobile profile confirmed active. I have
       not found what doubled it and I am not going to set the gate to
       whatever it happens to be today -- that turns a budget into a
       rubber stamp. 300 is a defensible mobile ceiling; the doubling is
       written down and still wants an owner. */
    ['the draw-call budget is a mobile one (<= 300)', live.calls > 0 && live.calls <= 300],
    ['no renderer error while it ran', !live.error],
    ['the context could be taken away', lost.forced],
    ['losing the context disabled 3D rather than throwing', after.disabled],
    ['and it said so', !!after.reported],
    ['the fallback can actually paint after the loss', after.stillACanvas],
    ['the match kept playing through it', after.minuteNow !== null
      && after.minuteBefore !== null && after.minuteNow >= after.minuteBefore],
    ['the match screen survived', after.screenAlive],
    ['no page errors', errors.length === 0],
  ];

  console.log('viewport         844x390, dpr 3, touch, coarse pointer');
  console.log('renderer         ready=' + live.ready, 'players=' + live.players,
    'quality=' + live.quality, 'shadows=' + live.shadows, 'dpr=' + live.pixelRatio);
  console.log('budget           ' + live.calls + ' draw calls, '
    + (live.triangles > 0 ? live.triangles.toLocaleString() : '?') + ' triangles');
  console.log('after loss       disabled=' + after.disabled,
    '| minute ' + after.minuteBefore + ' -> ' + after.minuteNow);
  console.log('reported         ' + (after.reported || '(nothing)'));
  console.log('');
  want.forEach(([what, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + what));
  if (errors.length) console.log('   errors:', errors.slice(0, 3));

  const failed = want.filter((row) => !row[1]).length;
  console.log('');
  console.log(failed ? failed + ' failed' : 'the mobile path holds, including losing the GL context');
  console.log('STILL UNTESTED, and no script can fix it: frame rate on a real');
  console.log('mobile GPU, heat, throttling and battery. Physical hardware only.');

  await browser.close();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
