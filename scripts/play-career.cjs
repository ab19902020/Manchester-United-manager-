#!/usr/bin/env node
/* global window, document, getComputedStyle, G, MU, UI, ACTIONS, ROSTER */

/* PLAY A CAREER THROUGH THE REAL INTERFACE, AND REPORT EVERY DEAD END.
 *
 *   npm run play -- [--days 330] [--club MUN] [--live 3] [--landscape]
 *
 * The test suite calls functions. A player presses buttons. Those are not
 * the same thing, and the gap between them is where a game gets stuck:
 * this script was written after a career played through the buttons
 * found two faults no test could see —
 *
 *   - the board's summons stayed open behind the board room, so leaving
 *     the meeting put you back in front of "Go up", for ever;
 *   - "⚠️ Answer 1 thing" outlived the thing, and pressing it did nothing.
 *
 * So this plays a career from the front door the way a person would:
 * every press is a click on something visible. It answers the board,
 * the press, bids and loan enquiries; kicks off and watches some matches
 * live (skipping through the halves) and sims the rest from the pre-match
 * screen; walks out of the dressing room; and presses Continue.
 *
 * It fails if the page throws, if the game logs a diagnostic, or if the
 * career stops moving: the same day and the same screen for too long is a
 * dead end a player could not get out of either. It says what the screen
 * showed when it stuck, because "stuck" alone fixes nothing.
 *
 * Decisions are deliberately dull — reject bids, refuse loans, take the
 * first answer otherwise — so the squad stays intact and the run measures
 * the game, not the driver's transfer policy.
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

function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
}
const flag = (name) => process.argv.includes('--' + name);

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

/* One step of a player's attention: look at the screen, press the one
   thing a person would press next. Returns what it did. Runs in the page. */
function step(liveLeft) {
  const shown = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    && getComputedStyle(el).visibility !== 'hidden');
  const find = (root, selector) => {
    if (!root) return null;
    const all = root.querySelectorAll(selector);
    for (let i = 0; i < all.length; i++) if (shown(all[i])) return all[i];
    return null;
  };
  const press = (el, what) => { el.click(); return what; };

  if (typeof G === 'undefined' || !G) return 'no-career';
  if (G.sacked) return 'sacked';

  /* rooms over everything */
  const celebrate = find(document, '.thall-win [data-thall-skip]');
  if (celebrate) return press(celebrate, 'trophy:later');
  const lift = find(document, '#tpHost [data-tp="close"]');
  if (lift) return press(lift, 'trophy:not-now');
  const trophyRoom = find(document, '#troom [data-action="trophyRoomClose"]');
  if (trophyRoom) return press(trophyRoom, 'trophy-room:close');
  const board = document.getElementById('brRoom');
  if (board) {
    const pickOne = find(board, '[data-action="brPick"]');
    if (pickOne) return press(pickOne, 'board:answer');
    const out = find(board, '[data-action="brNext"],[data-action="brDone"]');
    if (out) return press(out, 'board:' + out.dataset.action);
    return 'board:waiting';
  }
  const dressing = document.getElementById('drRoom');
  if (dressing) {
    const talk = find(dressing, '[data-action="drTalk"]');
    if (talk && !dressing.querySelector('[data-action="drTalk"].on')) return press(talk, 'dressing:talk');
    const out = find(dressing, '[data-action="drOut"]');
    if (out) return press(out, 'dressing:out');
    return 'dressing:waiting';
  }

  /* the match itself */
  const match = document.querySelector('#matchScreen.open');
  const modal = document.querySelector('#modalHost.open');
  if (match && !modal) {
    for (const action of ['kickoff', 'resume2h', 'ftSummary', 'matchDone', 'ftEscape']) {
      const b = find(match, '[data-action="' + action + '"]');
      if (b) return press(b, 'match:' + action);
    }
    const skip = find(match, '[data-action="mspeed"][data-v="9"]');
    if (skip && MU && MU.m && !MU.m.done && MU.m.stage !== 'HT') return press(skip, 'match:skip-half');
    if (MU && MU.m && !MU.m.done && !MU.speed) {
      const go = find(match, '[data-action="mspeed"]:not([data-v="0"])');
      if (go) return press(go, 'match:play');
    }
    return 'match:watching';
  }

  if (modal) {
    const kickoff = find(modal, '[data-action="kickoff"]');
    const sim = find(modal, '[data-action="simMatch"]');
    if (kickoff && (liveLeft > 0 || !sim)) return press(kickoff, 'prematch:kickoff');
    if (sim) return press(sim, 'prematch:sim');

    const preset = find(modal, '[data-action="pressPreset"]:not([data-edit])');
    if (preset) return press(preset, 'press:answer');
    for (const action of ['pressSend', 'pressSay', 'pressNoComment']) {
      const b = find(modal, '[data-action="' + action + '"]');
      if (b) return press(b, 'press:' + action);
    }
    for (const action of ['matchDone', 'ftEscape']) {
      const b = find(modal, '[data-action="' + action + '"]');
      if (b) return press(b, 'report:' + action);
    }
    /* an injured or suspended man in the eleven: take the fix offered */
    const fix = find(modal, '[data-action="fixSquad"]');
    if (fix) return press(fix, 'squad:fix');

    const answers = [...modal.querySelectorAll('button[data-mid]')].filter(shown)
      .filter((b) => b.dataset.action !== 'mailIgnore');
    if (answers.length) {
      const prefer = ['offerReject', 'loanRefuse', 'bidReject', 'reject'];
      const chosen = answers.find((b) => prefer.includes(b.dataset.action)) || answers[0];
      return press(chosen, 'mail:' + chosen.dataset.action);
    }
    const close = find(modal, '.sheet-x[data-action="closeModal"]') || modal.querySelector('.scrim');
    if (close) return press(close, 'sheet:close');
    return 'sheet:stuck';
  }

  const dock = find(document, '#continueDock button:not([data-action="decisionClear"]):not([data-action="gotoAttn"])');
  if (dock) return press(dock, 'dock:' + dock.dataset.action);
  return 'nothing-to-press';
}

function screenNow() {
  const text = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  };
  return {
    day: G && G.day, view: typeof UI !== 'undefined' ? UI.view : null,
    dock: text('#continueDock'), sheet: text('#modalHost.open #sheetBody'),
    match: text('#matchScreen.open #mCtl'),
    rooms: ['brRoom', 'drRoom', 'troom', 'tpHost', 'mgrCreate'].filter((id) => document.getElementById(id)),
  };
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const days = Number(arg('days', 330));
  const club = arg('club', '');
  let liveLeft = Number(arg('live', 3));
  const landscape = flag('landscape');

  const server = serve();
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage({
    viewport: landscape ? { width: 851, height: 393 } : { width: 393, height: 851 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.stack || error).slice(0, 400)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    /* a 404 is reported twice, as a console line and as a response; the
       response says which file, so it is judged there */
    if (/Failed to load resource/.test(msg.text())) return;
    errors.push('console: ' + msg.text().slice(0, 300));
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const where = new URL(response.url()).pathname;
    /* the optional audio pack is probed for and absent by design
       (audio/README.md); anything else missing is a fault */
    if (/^\/audio\//.test(where)) return;
    errors.push(response.status() + ' ' + where);
  });

  await page.goto(base + '/index.html');
  await page.waitForFunction('typeof newGame === "function" && window.RBSSaves', { timeout: 120000 });
  await page.evaluate(() => window.RBSSaves.ready);

  /* the front door, as a person walks through it */
  await page.click('[data-action="frontNew"]');
  await page.waitForTimeout(250);
  if (club) {
    /* through the picker's own controls: the league tab, then the club */
    const picked = await page.evaluate((key) => {
      const roster = (typeof window.rosterByKey === 'function') ? window.rosterByKey(key) : null;
      if (!roster) return { ok: false };
      const tab = document.querySelector('[data-action="fdLeague"][data-v="' + roster.league + '"]');
      if (tab) tab.click();
      const row = document.querySelector('[data-action="pickClub"][data-k="' + key + '"]');
      if (row) row.click(); else ACTIONS.pickClub({ dataset: { k: key } });
      return { ok: true, name: roster.name, league: roster.league };
    }, club);
    if (!picked.ok) {
      const keys = await page.evaluate(() => ((typeof ROSTER !== 'undefined' && ROSTER) || []).filter((c) => c.league === 'NL').map((c) => c.key).slice(0, 30));
      throw new Error(`No club ${club}. National League keys, for example: ${keys.join(' ')}`);
    }
    await page.waitForTimeout(200);
  }
  if (await page.$('[data-action="startGame"]')) await page.click('[data-action="startGame"]');
  await page.waitForTimeout(300);
  await page.fill('#mgrName', 'Auto Player');
  await page.click('[data-action="mgrDone"]');
  await page.waitForFunction(() => typeof G !== 'undefined' && G && G.clubs && G.my != null, { timeout: 120000 });
  await page.waitForTimeout(800);

  const startDay = await page.evaluate(() => G.day);
  const clubName = await page.evaluate(() => G.clubs[G.my].name);
  console.log(`Playing ${clubName} from day ${startDay} for ${days} days (${liveLeft} live matches)`);

  const counts = {};
  const stuck = [];
  const recent = [];
  let dayAt = startDay;
  let sinceDay = 0;
  let lastKey = '';
  let same = 0;
  let iterations = 0;
  const began = Date.now();

  for (;;) {
    const now = await page.evaluate(() => (typeof G !== 'undefined' && G ? { day: G.day, sacked: !!G.sacked } : null));
    if (!now || now.sacked || now.day - startDay >= days) break;
    let did;
    try {
      did = await page.evaluate(step, liveLeft);
    } catch (error) {
      did = 'driver-error:' + String(error).slice(0, 120);
    }
    iterations += 1;
    recent.push(did);
    if (recent.length > 12) recent.shift();
    const kind = did.split(':')[0] + ':' + (did.split(':')[1] || '');
    counts[kind] = (counts[kind] || 0) + 1;
    if (did === 'prematch:kickoff') liveLeft -= 1;
    await page.waitForTimeout(did.startsWith('match:') ? 120 : did.startsWith('prematch') ? 400 : 40);

    const screen = await page.evaluate(screenNow);
    const key = JSON.stringify(screen);
    if (key === lastKey) same += did.startsWith('match:watching') ? 0.1 : 1; else same = 0;
    lastKey = key;
    if (screen.day !== dayAt) { dayAt = screen.day; sinceDay = 0; } else sinceDay += 1;
    /* a screen that keeps changing without the calendar moving is a loop,
       which the same-screen test cannot see */
    if (sinceDay >= 700) {
      stuck.push({ did: 'loop', screen, recent: recent.slice() });
      console.log('LOOP on day', screen.day, 'recent:', recent.join(' > '), JSON.stringify(screen));
      sinceDay = 0;
      if (stuck.length >= 3) break;
    }
    if (same >= 25) {
      stuck.push({ did, screen });
      console.log('STUCK', did, JSON.stringify(screen));
      if (stuck.length >= 3) break;
      /* get out the way a frustrated person would, and carry on */
      await page.evaluate(() => {
        try { if (document.querySelector('#modalHost.open')) window.closeModal(); } catch (e) { /* none */ }
        try { ACTIONS.nav({ dataset: { v: 'home' } }); } catch (e) { /* none */ }
      });
      same = 0;
    }
    if (iterations % 400 === 0) {
      const at = await page.evaluate(() => ({ day: G.day, pos: typeof window.leaguePos === 'function' ? window.leaguePos(G.my) : null }));
      console.log(`  day ${at.day}  league position ${at.pos}  ${((Date.now() - began) / 1000).toFixed(0)}s  last: ${recent.slice(-4).join(' > ')}`);
    }
  }

  const summary = await page.evaluate(() => {
    const me = G.my;
    let w = 0, d = 0, l = 0;
    (G.fixtures || []).forEach((f) => {
      if (!f.played || (f.h !== me && f.a !== me)) return;
      const mine = f.h === me ? f.hs : f.as;
      const theirs = f.h === me ? f.as : f.hs;
      if (mine > theirs) w += 1; else if (mine === theirs) d += 1; else l += 1;
    });
    const diag = (window.RBSDiagnostics && window.RBSDiagnostics.list()) || [];
    return {
      day: G.day, sacked: !!G.sacked, record: { w, d, l },
      position: typeof window.leaguePos === 'function' ? window.leaguePos(me) : null,
      diagnostics: diag.map((x) => x.context + ': ' + x.message).slice(-10),
    };
  });

  console.log('\nactions', JSON.stringify(counts));
  console.log('reached day', summary.day, ' record W' + summary.record.w + ' D' + summary.record.d + ' L' + summary.record.l,
    ' league position', summary.position, summary.sacked ? ' (SACKED)' : '');
  console.log('time', ((Date.now() - began) / 1000).toFixed(0) + 's', ' presses', iterations);
  console.log('page errors', errors.length ? '' : 'none');
  errors.slice(0, 8).forEach((e) => console.log('  ' + e));
  console.log('diagnostics', summary.diagnostics.length ? '' : 'none');
  summary.diagnostics.forEach((e) => console.log('  ' + e));
  console.log('dead ends', stuck.length ? '' : 'none');

  await browser.close();
  server.close();
  const failed = errors.length || summary.diagnostics.length || stuck.length;
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
