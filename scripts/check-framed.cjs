#!/usr/bin/env node
/* global window, document, newGame, G */

/* THE ARRANGEMENT THAT ACTUALLY SHIPS.
 *
 *   node scripts/check-framed.cjs
 *
 * CrazyGames serves a game inside an iframe, over http, from their own
 * host, and the SDK arrives from their CDN. Not one of those conditions
 * is reproduced anywhere else in this repository: the test suite runs in
 * JSDOM with no SDK at all, and every browser probe loads the game from
 * `file://` unframed. Both are deliberately the cases where the adapter
 * does nothing.
 *
 * Which means the interesting half — the gate opening, the script tag
 * going in, the SDK loading, `attach()` running, the markers firing —
 * had never been executed anywhere until this script existed.
 *
 * So this serves the repository over http, loads `index.html` in an
 * iframe, and intercepts sdk.crazygames.com with a stub that records
 * what the adapter calls. Everything is real except their code, which
 * this sandbox cannot reach.
 *
 * WHAT IT CANNOT TELL YOU: whether the API names are right. The stub
 * answers to the names the adapter uses, so it would pass just as
 * happily if every one of them were wrong. It proves the plumbing, not
 * the contract.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css',
};

const SDK_STUB = `window.__cgCalls = [];
  const log = (name) => (...args) => { window.__cgCalls.push(name); return undefined; };
  window.CrazyGames = { SDK: {
    init: () => { window.__cgCalls.push('init'); return Promise.resolve(); },
    game: {
      gameplayStart: log('gameplayStart'), gameplayStop: log('gameplayStop'),
      loadingStart: log('loadingStart'), loadingStop: log('loadingStop'),
    },
    data: {
      setItem: (key, value) => { window.__cgCalls.push('setItem:' + value.length); },
      getItem: () => null,
    },
  } };`;

function serve() {
  return http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    /* the host page, standing in for theirs */
    if (file === '/parent.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>host</title><style>html,body{margin:0;height:100%}'
        + 'iframe{border:0;width:100%;height:100%}</style>'
        + '<iframe id="game" src="/index.html"></iframe>');
      return;
    }
    if (file === '/') file = '/index.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); res.end('not here'); return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(full)] || 'application/octet-stream',
    });
    fs.createReadStream(full).pipe(res);
  });
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const server = serve();
  await new Promise((listening) => server.listen(0, listening));
  const port = server.address().port;

  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const asked = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 180)));
  page.on('request', (request) => {
    if (/sdk\.crazygames/i.test(request.url())) asked.push(request.url());
  });
  await page.route('**sdk.crazygames.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript', body: SDK_STUB,
  }));

  await page.goto('http://127.0.0.1:' + port + '/parent.html');
  await page.waitForTimeout(6000);

  const frame = page.frames().find((f) => /red-devil-manager|index/.test(f.url()));
  if (!frame) {
    console.log('the game never loaded in the frame');
    await browser.close(); server.close(); process.exit(1);
  }

  const found = await frame.evaluate(async () => {
    const api = window.RBSCrazyGames;
    if (!api) return { loaded: false };
    const out = {
      loaded: true,
      framed: (() => {
        try { return window.self !== window.top; } catch (error) { return true; }
      })(),
      scriptTag: !!document.getElementById('cg-sdk'),
      sdkOnPage: !!(window.CrazyGames && window.CrazyGames.SDK),
      attached: api.present(),
    };
    const clear = () => ['frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear(); newGame('MUN'); clear();
    /* `G` IS LEXICAL, NOT A PROPERTY OF WINDOW. Reading `window.G` here
       reported a world of nothing while 484 clubs sat in front of me —
       the same trap that has silently disabled three hooks in this
       repository. Always the bare identifier. */
    try { out.clubs = (G.clubs || []).length; } catch (error) { out.clubs = 0; }
    await new Promise((done) => setTimeout(done, 400));
    out.calls = (window.__cgCalls || []).slice(0, 10);

    /* THE RESTORE HAS TO REACH THE SAVE CONTROLLER, AND ONLY LOAD ORDER
       DECIDES THAT. `attach()` runs the moment the SDK lands, and if
       `crazygames.js` were loaded before `runtime-enhancements.js` there
       would be no `RBSSaves` yet — the restore would disable itself and
       report nothing, for good, in production only. So this asks what it
       actually got: "nothing in the cloud" means it reached the
       controller and found the stub's empty shelf, which is the right
       answer here. "no save controller" would mean the wiring is dead. */
    try {
      const asked = await api.restoreIfEmpty();
      out.restore = asked.restored ? 'restored' : (asked.skipped || '?');
    } catch (error) { out.restore = 'THREW: ' + error.message; }
    return out;
  });

  const want = [
    ['the game is framed', found.framed === true],
    ['the adapter loaded', found.loaded === true],
    ['the gate opened and injected the script', found.scriptTag === true],
    ['the SDK reached the page', found.sdkOnPage === true],
    ['the adapter attached to it', found.attached === true],
    ['a world still builds', found.clubs > 400],
    ['init was called', (found.calls || []).includes('init')],
    ['building a world is marked as loading',
      (found.calls || []).includes('loadingStart') && (found.calls || []).includes('loadingStop')],
    ['the restore reaches the save controller', found.restore !== 'no save controller'],
    ['no page errors', errors.length === 0],
  ];

  console.log('frame            ', frame.url().replace(/^http:\/\/[^/]+/, ''));
  console.log('sdk requested    ', asked.length ? asked[0] : 'NOT REQUESTED');
  console.log('sdk calls        ', found.calls || []);
  console.log('clubs            ', found.clubs);
  console.log('restore said     ', found.restore);
  console.log('');
  want.forEach(([what, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + what));
  if (errors.length) console.log('', errors.slice(0, 3));

  const failed = want.filter((row) => !row[1]).length;
  console.log('');
  console.log(failed ? failed + ' failed' : 'all good — the plumbing works framed');

  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
