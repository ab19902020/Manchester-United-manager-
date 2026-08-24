#!/usr/bin/env node
/* eslint-disable */
/* A PICTURE OF EVERY SCREEN, at the size it will be played on.
 *
 *   node scripts/shoot-screens.cjs [outDir]
 *
 * Layout work done by reading markup is layout work done blind. This
 * starts a seeded career and photographs each screen at 390x844 -- the
 * phone the game is built for -- so a change can be judged against what
 * it actually looked like before.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.resolve(__dirname, '..', '.shots');
const SEED = 20260821;

const SHOTS = [
  ['home', 'home', null],
  ['squad', 'squad', null],
  ['tactics', 'tactics', null],
  ['transfers', 'transfers', null],
  ['club', 'club', null],
  ['club-stadium', 'club', 'stadium'],
  ['club-finances', 'club', 'finances'],
  ['club-media', 'club', 'media'],
  ['club-save', 'club', 'save'],
  ['world', 'world', 'table'],
  ['world-stats', 'world', 'stats'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const ready = await page.evaluate(({ seed }) => {
    try {
      const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      clear();
      window.RBSWorldSeed.build(seed, 'MUN');
      clear();
      UI.view = 'home'; render();
      return 'ok';
    } catch (e) { return String(e).slice(0, 200); }
  }, { seed: SEED });
  if (ready !== 'ok') { console.log('could not start: ' + ready); await browser.close(); return; }

  for (const [name, view, tab] of SHOTS) {
    const ok = await page.evaluate(({ view, tab }) => {
      try {
        UI.view = view; UI.selSlot = null;
        if (tab) UI.clubTab = tab;
        render();
        const v = document.getElementById('view');
        if (v) v.scrollTop = 0;
        window.scrollTo(0, 0);
        return true;
      } catch (e) { return String(e).slice(0, 160); }
    }, { view, tab });
    if (ok !== true) { console.log(name + ': ' + ok); continue; }
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    /* AND THE SAME SCREEN SCROLLED TO ITS END. A fixed dock sitting over
       the top of a list is not the same fault as a list that cannot be
       scrolled clear of it, and only the second one is a bug. */
    const room = await page.evaluate(() => {
      const v = document.getElementById('view');
      if (!v) return null;
      v.scrollTop = v.scrollHeight;
      return { top: v.scrollTop, height: v.scrollHeight, client: v.clientHeight };
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, name + '-end.png') });
    console.log('  ' + name + (room ? '   scroll ' + room.top + '/' + (room.height - room.client) : ''));
  }

  console.log('\n  written to ' + OUT);
  console.log('  page errors: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
})();
