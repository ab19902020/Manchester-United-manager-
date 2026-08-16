#!/usr/bin/env node
/* global window, document, newGame, G */

/* BUILD THE ZIP THAT GOES TO CRAZYGAMES — AND THEN PROVE IT RUNS.
 *
 *   node scripts/build-upload.cjs
 *
 * The upload is a zip with `index.html` at its root and every path
 * relative. This repository is not that: it carries node_modules, the
 * test suite, four handoff documents and a scripts directory, none of
 * which belong in a game build.
 *
 * WHERE THE FILE LIST COMES FROM, AND WHY IT IS NOT A LIST IN THIS FILE.
 * `service-worker.js` already names every file the game needs to run
 * with no network — that is what an offline install IS. A second list
 * here would be a second thing to forget to update, and the failure
 * would be identical in both places: a module that loads fine from the
 * repository and is missing from the build. So this reads CORE_ASSETS
 * and packs exactly that, then says plainly what on disk was left out,
 * because a file the game needs but the service worker does not list is
 * a bug in the offline install as much as in this zip.
 *
 * And it does not trust its own output. It extracts the zip to a clean
 * directory, serves it, loads it in an iframe the way the platform
 * does, and builds a world. A package that has never been run is a
 * guess.
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css',
};

/* everything the game runs on, as the offline install already defines it */
function coreAssets() {
  const source = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const block = source.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('CORE_ASSETS not found in service-worker.js');
  return block[1]
    .split(',')
    .map((line) => (line.match(/'([^']+)'/) || [])[1])
    .filter(Boolean)
    .map((asset) => asset.replace(/^\.\//, ''))
    .filter((asset) => asset !== '');
}

/* what is on disk and playable but not listed — a hole in the offline
   install, which this build would inherit silently */
function unlisted(listed) {
  const set = new Set(listed);
  const out = [];
  ['src', 'vendor', 'assets', 'audio', 'trophies'].forEach((dir) => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return;
    fs.readdirSync(full).forEach((name) => {
      const rel = dir + '/' + name;
      if (fs.statSync(path.join(full, name)).isDirectory()) return;
      /* documentation is not a runtime asset — `audio/README.md` is the
         audio pack manifest for a human, not a file the game fetches */
      if (path.extname(name) === '.md') return;
      if (!set.has(rel)) out.push(rel);
    });
  });
  return out;
}

function serve(root) {
  return http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file === '/parent.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>host</title><style>html,body{margin:0;height:100%}'
        + 'iframe{border:0;width:100%;height:100%}</style>'
        + '<iframe id="game" src="/index.html"></iframe>');
      return;
    }
    if (file === '/') file = '/index.html';
    const full = path.join(root, file);
    if (!full.startsWith(root) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); res.end('not here'); return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(full)] || 'application/octet-stream',
    });
    fs.createReadStream(full).pipe(res);
  });
}

async function runsFromTheZip(root) {
  const { chromium } = require(PLAYWRIGHT);
  const server = serve(root);
  await new Promise((listening) => server.listen(0, listening));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const missing = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 150)));
  page.on('response', (response) => {
    if (response.status() !== 404) return;
    const where = new URL(response.url()).pathname;
    /* THE AUDIO PACK IS MEANT TO BE ABSENT. The game synthesises every
       sound it makes and probes `audio/` for optional MP3s to use
       instead; `audio/README.md` documents the whole manifest as
       opt-in, and none of it ships. Those probes 404 by design. Any
       OTHER 404 is a module that did not make it into the build, which
       is exactly what this script exists to catch, so the exemption is
       this one folder and no wider. */
    if (/^\/audio\//.test(where)) return;
    missing.push(where);
  });

  await page.goto('http://127.0.0.1:' + port + '/parent.html');
  await page.waitForTimeout(6000);
  const frame = page.frames().find((f) => /red-devil-manager|index/.test(f.url()));

  let clubs = 0;
  let adapter = false;
  if (frame) {
    const found = await frame.evaluate(async () => {
      const clear = () => ['frontScreen', 'introScreen', 'splash']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      clear();
      try { newGame('MUN'); } catch (error) { return { clubs: 0, adapter: false }; }
      clear();
      await new Promise((done) => setTimeout(done, 400));
      /* bare `G` — it is a lexical global and not on window */
      let count = 0;
      try { count = (G.clubs || []).length; } catch (error) { count = 0; }
      return { clubs: count, adapter: !!window.RBSCrazyGames };
    });
    clubs = found.clubs;
    adapter = found.adapter;
  }

  await browser.close();
  server.close();
  return { framed: !!frame, clubs, adapter, errors, missing };
}

async function main() {
  const listed = coreAssets();
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'rbs-upload-'));
  const out = path.join(ROOT, 'dist');
  const zip = path.join(out, 'the-results-business.zip');

  let copied = 0;
  const absent = [];
  listed.forEach((asset) => {
    const from = path.join(ROOT, asset);
    if (!fs.existsSync(from)) { absent.push(asset); return; }
    const to = path.join(stage, asset);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied += 1;
  });
  /* the service worker itself is never in its own asset list */
  fs.copyFileSync(path.join(ROOT, 'service-worker.js'), path.join(stage, 'service-worker.js'));
  copied += 1;

  if (!fs.existsSync(path.join(stage, 'index.html'))) {
    console.log('FAIL: no index.html — CrazyGames loads that and nothing else');
    process.exit(1);
  }

  fs.mkdirSync(out, { recursive: true });
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  execFileSync('zip', ['-qr', zip, '.'], { cwd: stage });

  const bytes = fs.statSync(zip).size;
  const spare = unlisted(listed);

  console.log('files packed     ', copied);
  console.log('zip              ', path.relative(ROOT, zip), (bytes / 1024 / 1024).toFixed(1) + ' MB');
  if (absent.length) console.log('LISTED BUT MISSING', absent);
  if (spare.length) {
    console.log('');
    console.log('on disk but NOT in the service worker, so not in this build');
    console.log('and not in an offline install either — check each one:');
    spare.forEach((file) => console.log('   ', file));
  }

  console.log('');
  console.log('running the zip, framed, the way the platform does…');
  const ran = await runsFromTheZip(stage);
  const want = [
    ['index.html loads the game', ran.framed],
    ['a world builds from the packed files', ran.clubs > 400],
    ['the CrazyGames adapter is in the build', ran.adapter],
    ['nothing 404s but the optional audio pack', ran.missing.length === 0],
    ['no page errors', ran.errors.length === 0],
  ];
  want.forEach(([what, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + what));
  if (ran.missing.length) console.log('   missing:', [...new Set(ran.missing)].slice(0, 8));
  if (ran.errors.length) console.log('   errors: ', ran.errors.slice(0, 3));

  fs.rmSync(stage, { recursive: true, force: true });
  const failed = want.filter((row) => !row[1]).length;
  console.log('');
  console.log(failed ? failed + ' failed — do not upload this' : 'the package runs. Upload ' + path.relative(ROOT, zip));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
