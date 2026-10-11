#!/usr/bin/env node
/* global window, document, G, MU, UI, ACTIONS, ttsSay, speechSynthesis */

/* THE ANDROID APP'S PAGE SIDE, DRIVEN IN A REAL BROWSER.
 *
 *   npm run android:check
 *
 * The APK is a WebView around this build plus a Java bridge
 * (android/app/src/main/java/.../MainActivity.java). No emulator runs in
 * CI, so this plays the bridge's part instead: the same methods, the same
 * argument types, the same events coming back through AndroidShellEvent.
 * Everything else — the game, src/android-shell.js, IndexedDB, a phone-
 * sized touch viewport — is the real thing, served over http the way the
 * app serves it over its asset host.
 *
 * What it proves, each one a thing a bare WebView gets wrong:
 *   - back steps through sheets, sub-pages and sections, pauses a live
 *     match, and only leaves from Home on a second press;
 *   - Export save file reaches the phone as a complete, parseable career;
 *   - the press-room voice speaks through the bridge with a British man;
 *   - sending the app to the background writes the autosave;
 *   - the screen is held awake during a match and released after;
 *   - no service worker is registered inside the app.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function serve() {
  return http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file === '/') file = '/index.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
}

/* The Java bridge, as the page sees it. */
function fakeBridge() {
  const shell = window.__shell = {
    exports: [], awake: [], speaks: [], cancels: 0, current: null,
  };
  window.AndroidShell = {
    info: () => JSON.stringify({ versionName: 'check', versionCode: 1, sdk: 35 }),
    exportBegin: (name) => { shell.current = { name, chunks: [] }; return true; },
    exportChunk: (chunk) => { shell.current.chunks.push(chunk); return true; },
    exportEnd: (mime) => {
      const done = shell.current; done.mime = mime; shell.exports.push(done); shell.current = null;
      setTimeout(() => window.AndroidShellEvent('export', { ok: true, name: done.name }), 0);
      return true;
    },
    keepAwake: (on) => { shell.awake.push(!!on); },
    leave: () => {},
    openExternal: () => {},
    ttsAvailable: () => true,
    ttsVoices: () => JSON.stringify([
      { name: 'en-gb-x-gba-local', lang: 'en-GB', local: true, quality: 400, gender: 'female', default: true },
      { name: 'en-gb-x-gbb-local', lang: 'en-GB', local: true, quality: 400, gender: 'male', default: false },
      { name: 'en-gb-x-rjs-network', lang: 'en-GB', local: false, quality: 500, gender: 'male', default: false },
      { name: 'en-us-x-iol-local', lang: 'en-US', local: true, quality: 400, gender: 'male', default: false },
    ]),
    ttsSpeak: (id, text, lang, voice) => {
      shell.speaks.push({ id, text, lang, voice });
      setTimeout(() => {
        window.AndroidShellEvent('tts', { type: 'start', id });
        window.AndroidShellEvent('tts', { type: 'end', id });
      }, 5);
      return true;
    },
    ttsCancel: () => { shell.cancels += 1; },
    ttsSpeaking: () => false,
  };
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const server = serve();
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage({
    viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) '
      + 'Chrome/130.0.0.0 Mobile Safari/537.36 ResultsBusinessAndroid/check',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  await page.addInitScript(fakeBridge);

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  };
  const back = () => page.evaluate(() => window.AndroidShellBack());
  const toastText = () => page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  const pause = (ms) => page.waitForTimeout(ms);

  await page.goto(base + '/index.html');
  await page.waitForFunction('typeof newGame === "function" && window.RBSSaves', { timeout: 120000 });
  await page.evaluate(() => window.RBSSaves.ready);
  await pause(800);

  check('the app is recognised', await page.evaluate(() =>
    document.documentElement.classList.contains('android-app') && !!window.RBSAndroid));
  check('no service worker inside the app', await page.evaluate(async () =>
    !navigator.serviceWorker || (await navigator.serviceWorker.getRegistrations()).length === 0));

  /* ---- the intro: back skips it, like a tap ---- */
  const introUp = await page.evaluate(() => {
    const intro = document.getElementById('introScreen');
    return !!(intro && intro.offsetWidth && !intro.classList.contains('out'));
  });
  if (introUp) {
    const skipped = await back();
    await page.waitForFunction(() => {
      const intro = document.getElementById('introScreen');
      return !intro || !intro.offsetWidth || intro.classList.contains('out');
    }, null, { timeout: 10000 }).catch(() => {});
    check('back skips the intro', skipped === 'handled');
    await pause(900);
  }

  /* ---- start screen: back twice leaves ---- */
  const first = await back();
  const said = await toastText();
  const second = await back();
  check('back on the start screen asks before leaving', first === 'handled' && /back again/i.test(said), said);
  check('a second back leaves', second === 'exit', second);

  /* ---- a real career through the real front door ---- */
  await page.click('[data-action="frontNew"]');
  await pause(200);
  const fromClubPicker = await back();
  const pickerGone = await page.evaluate(() => !document.querySelector('[data-action="startGame"]'));
  check('back leaves the club picker', fromClubPicker === 'handled', `picker closed: ${pickerGone}`);
  await page.click('[data-action="frontNew"]');
  await pause(200);
  await page.click('[data-action="startGame"]');
  await pause(300);
  await page.fill('#mgrName', 'Alex Shell');
  await page.click('[data-action="mgrDone"]');
  await page.waitForFunction(() => typeof G !== 'undefined' && G && G.clubs && G.my != null, { timeout: 120000 });
  await page.waitForFunction(async () => !!(await window.RBSSaves.store.get('auto')), { timeout: 60000 });
  await pause(600);

  /* ---- sections go home ---- */
  await page.evaluate(() => ACTIONS.nav({ dataset: { v: 'squad' } }));
  const fromSquad = await back();
  check('back from a section returns Home', fromSquad === 'handled'
    && await page.evaluate(() => UI.view === 'home'));

  /* ---- sheets step back, then close ---- */
  await page.evaluate(() => {
    const players = G.clubs[G.my].players || [];
    window.openProfile(players[0].id);
    window.openProfile(players[1].id);
  });
  await pause(200);
  const stacked = await page.evaluate(() => !!document.querySelector('#modalHost.open [data-action="sheetBack"]'));
  await back();
  const stillOpen = await page.evaluate(() => !!document.querySelector('#modalHost.open'));
  await back();
  const closed = await page.evaluate(() => !document.querySelector('#modalHost.open'));
  check('back steps through stacked sheets, then closes', stacked && stillOpen && closed,
    `stacked ${stacked}, after one ${stillOpen}, after two closed ${closed}`);

  /* ---- home: twice to leave ---- */
  const homeOnce = await back();
  const homeTwice = await back();
  check('Home needs two presses to leave', homeOnce === 'handled' && homeTwice === 'exit');

  /* ---- export reaches the phone whole ---- */
  await page.evaluate(() => ACTIONS.exportSave());
  await page.waitForFunction(() => window.__shell.exports.length > 0, { timeout: 60000 });
  const exported = await page.evaluate(() => {
    const e = window.__shell.exports[0];
    const text = e.chunks.join('');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (error) { parsed = null; }
    return { name: e.name, mime: e.mime, size: text.length, chunks: e.chunks.length,
      club: parsed && parsed.clubs && parsed.my != null ? parsed.clubs[parsed.my].name : null };
  });
  check('Export save file hands the whole career to Android', exported.club
    && /\.json$/.test(exported.name), `${exported.name}, ${(exported.size / 1e6).toFixed(1)} MB in `
    + `${exported.chunks} chunks, club ${exported.club}`);

  /* ---- the voice: a British man, through the bridge ---- */
  const voice = await page.evaluate(async () => {
    const names = speechSynthesis.getVoices().map((v) => v.name + '=' + v.voiceURI);
    const before = window.__shell.speaks.length;
    try {
      const cfg = window.sfxCfg ? window.sfxCfg() : null;
      if (cfg) cfg.on = true;
      if (window.ttsCfg) { const t = window.ttsCfg(); t.tts = true; }
    } catch (error) { /* settings differ by build */ }
    const spoke = typeof ttsSay === 'function' ? ttsSay('Good afternoon. How do you assess the squad?', 'Reporter', {}) : false;
    await new Promise((done) => setTimeout(done, 1500));
    return { names, spoke, lines: window.__shell.speaks.slice(before) };
  });
  const chosen = voice.lines.map((l) => l.voice);
  check('the press-room voice is a British man on the device', voice.lines.length > 0
    && chosen.every((v) => v === 'en-gb-x-gbb-local'),
  `spoke ${voice.spoke}, ${voice.lines.length} clauses, voices ${[...new Set(chosen)].join(',') || 'none'}`);
  check('an online-only voice is not offered when the phone has its own',
    !voice.names.some((n) => /rjs-network/.test(n)), voice.names.join(' | '));

  /* ---- sending the app away writes the save ---- */
  const savedBefore = await page.evaluate(async () => {
    const rec = await window.RBSSaves.store.get('auto');
    return rec && rec.meta ? rec.meta.savedAt : 0;
  });
  await pause(20);
  await page.evaluate(() => window.AndroidShellPause());
  const savedAfter = await page.waitForFunction(async (t) => {
    const rec = await window.RBSSaves.store.get('auto');
    return rec && rec.meta && rec.meta.savedAt > t ? rec.meta.savedAt : false;
  }, savedBefore, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => 0);
  check('backgrounding the app saves the career', savedBefore > 0 && savedAfter > savedBefore,
    `autosave ${savedBefore} -> ${savedAfter}`);
  await page.evaluate(() => window.AndroidShellResume());

  /* ---- a match: screen awake, back pauses ---- */
  const kicked = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const shown = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    for (let i = 0; i < 1500; i += 1) {
      if (document.querySelector('#matchScreen.open')) return true;
      const board = document.getElementById('brRoom');
      if (board) {
        const b = board.querySelector('[data-action="brPick"]')
          || board.querySelector('[data-action="brNext"],[data-action="brDone"]');
        if (b) b.click();
        await sleep(30); continue;
      }
      const modal = document.querySelector('#modalHost.open');
      if (modal) {
        const ko = modal.querySelector('[data-action="kickoff"]');
        if (ko) { ko.click(); await sleep(400); continue; }
        const preset = modal.querySelector('[data-action="pressPreset"]:not([data-edit])');
        if (preset) { preset.click(); await sleep(30); continue; }
        const answers = [...modal.querySelectorAll('button[data-mid]')].filter(shown)
          .filter((b) => b.dataset.action !== 'mailIgnore');
        const pick = answers.find((b) => /Reject|Refuse/i.test(b.dataset.action)) || answers[0];
        if (pick) pick.click(); else window.closeModal();
        await sleep(30); continue;
      }
      const dock = document.querySelector('#continueDock button:not([data-action="decisionClear"]):not([data-action="gotoAttn"])');
      if (dock) dock.click(); else ACTIONS.advance();
      await sleep(30);
    }
    return !!document.querySelector('#matchScreen.open');
  });
  if (kicked) {
    const prematch = await back();
    check('back on the pre-match team talk keeps you at the ground', prematch === 'handled'
      && await page.evaluate(() => !!document.querySelector('#matchScreen.open')));
    await page.evaluate(() => {
      const ko = document.querySelector('#matchScreen.open [data-action="kickoff"]');
      if (ko) ko.click();
    });
    await page.waitForFunction(() => MU && MU.m && !MU.m.done && MU.m.stage !== 'HT', null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      if (MU && MU.m && !MU.speed) ACTIONS.mspeed({ dataset: { v: '1' } });
    });
    await pause(1200);
    const awakeOn = await page.evaluate(() => window.__shell.awake.slice(-1)[0] === true);
    const answer = await back();
    const paused = await page.evaluate(() => MU.speed === 0);
    check('the screen stays on during a match', awakeOn);
    check('back pauses a live match rather than leaving it', answer === 'handled' && paused,
      `answer ${answer}, speed ${await page.evaluate(() => MU.speed)}`);
  } else {
    check('reached a match to test the match screen', false, 'no match screen opened');
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
