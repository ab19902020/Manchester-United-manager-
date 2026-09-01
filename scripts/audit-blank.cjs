#!/usr/bin/env node
/* eslint-disable */
/* DOES THE SCREEN ACTUALLY DRAW ANYTHING?
 *
 *   node scripts/audit-blank.cjs [outDir]
 *
 * There are already two sweeps over the interface and neither asks this
 * question. `audit-menus.cjs` clicks every control and reports the ones
 * that do nothing. `sweep-screens.cjs` measures boxes and reports the
 * ones that spill, intersect or are shorter than their contents. A
 * screen that renders NOTHING passes both of them comfortably: it has
 * no controls to be dead, and no boxes to be misshapen.
 *
 * That fault is real and it has shipped here before -- a tab whose body
 * builds an empty string, a panel that renders only when a list it
 * needs is non-empty, a sheet whose contents depend on a save that a
 * fresh career does not have yet. Every one of them looks like a
 * perfectly good screen in the markup, which is why this measures
 * PIXELS instead. What a player sees is the only thing that settles it.
 *
 * ---------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY BY ROW.
 *
 * The naive test -- count distinct colours in the whole shot -- does not
 * survive contact with this game, because every screen sits on a
 * vertical gradient. A completely blank screen still has one distinct
 * colour per row and comes out looking busy.
 *
 * A gradient is uniform ACROSS a row and varies only DOWN the page. So
 * the unit is the row: a row is empty if, quantised to four bits a
 * channel, it holds no more than two colours -- the background and at
 * most one gradient step through it. Then:
 *
 *   empty        the share of rows with nothing drawn on them
 *   dead band    the tallest run of consecutive empty rows
 *
 * The first catches a screen that renders nothing at all. The second
 * catches the more common and more embarrassing version: a screen that
 * draws its header and its tab bar and then leaves half the phone
 * blank, which reads to a player as the game having crashed.
 *
 * Quantising to four bits is deliberate. A one-bit-per-channel change
 * between adjacent pixels is a dithered gradient, not content, and at
 * full precision every such row counts as drawn -- which is the same
 * bug as counting the gradient.
 *
 * ---------------------------------------------------------------------
 * HOW THE PIXELS ARE READ. There is no image library in this project
 * and this is not worth adding one for, so the PNG goes back into the
 * browser that produced it: a blank page decodes the data URL onto a
 * canvas and reads it back with getImageData. It is a separate page
 * from the game so that decoding cannot disturb what is being measured.
 *
 * ---------------------------------------------------------------------
 * WHAT IT VISITS. The nav is read off the page rather than listed here,
 * and on each screen every tab-shaped control is found, clicked and
 * sampled. A sweep that only visits screens somebody remembered to put
 * in a list cannot find the screen nobody remembered, which is the
 * entire reason to run one.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || null;
const SEED = 20260821;

/* a row with more than this many quantised colours has something on it */
const ROW_COLOURS = 2;
/* the share of empty rows at which a screen is drawing nothing */
const BLANK_AT = 0.92;
/* a dead band this tall, as a share of the view, is a hole in a screen */
const BAND_AT = 0.45;
const BAND_MIN_PX = 180;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
  });
  /* the darkroom: it only ever decodes one image at a time */
  const lab = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await lab.goto('data:text/html,<canvas id=c></canvas>');

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
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
  if (ready !== 'ok') {
    console.log('could not start: ' + ready);
    await browser.close();
    return;
  }

  /* ------------------------------------------------------------------
     READING THE PIXELS
     ------------------------------------------------------------------ */
  async function sample(name) {
    const box = await page.evaluate(() => {
      const v = document.getElementById('view');
      const el = v || document.body;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
        w: Math.round(r.width), h: Math.round(Math.min(r.height, window.innerHeight - r.y)) };
    });
    if (!box || box.w < 40 || box.h < 40) return null;
    const shot = await page.screenshot({
      clip: { x: box.x, y: box.y, width: box.w, height: box.h },
    });
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, name.replace(/[^a-z0-9._-]/gi, '_') + '.png'), shot);
    }
    const url = 'data:image/png;base64,' + shot.toString('base64');
    return lab.evaluate(async ({ url, rowColours }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.getElementById('c');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
      let empty = 0, band = 0, worst = 0, bandTop = 0, worstTop = 0;
      const all = new Set();
      for (let y = 0; y < height; y += 1) {
        const seen = new Set();
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          /* four bits a channel: a one-step dither is not content */
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
          seen.add(key);
          if (seen.size > rowColours) break;
        }
        seen.forEach((k) => all.add(k));
        if (seen.size <= rowColours) {
          empty += 1;
          if (band === 0) bandTop = y;
          band += 1;
          if (band > worst) { worst = band; worstTop = bandTop; }
        } else band = 0;
      }
      return { height, width, empty: empty / height, band: worst,
        bandFrac: worst / height, bandTop: worstTop, colours: all.size };
    }, { url, rowColours: ROW_COLOURS });
  }

  /* ------------------------------------------------------------------
     WHERE IT GOES
     ------------------------------------------------------------------ */
  const navViews = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#navInner [data-v]').forEach((b) => {
      const v = b.dataset.v;
      if (v && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  });

  const rows = [];
  async function visit(name, go) {
    const ok = await page.evaluate(go).catch((e) => String(e).slice(0, 120));
    if (ok !== true) { rows.push({ name, error: String(ok) }); return; }
    await page.waitForTimeout(260);
    const s = await sample(name);
    if (s) rows.push(Object.assign({ name }, s));
  }

  for (const view of navViews) {
    await visit(view, `(()=>{ try{ UI.view=${JSON.stringify(view)}; UI.selSlot=null;
      render(); const v=document.getElementById('view'); if(v)v.scrollTop=0;
      return true; }catch(e){ return String(e).slice(0,120); } })()`);

    /* every tab-shaped control ON this screen, found rather than listed */
    const tabs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#view [data-action]').forEach((el) => {
        const a = el.dataset.action || '';
        if (!/tab$/i.test(a) && !/^rrView$/.test(a)) return;
        const v = el.dataset.v;
        if (v == null) return;
        if (!out.some((t) => t.a === a && t.v === v)) out.push({ a, v });
      });
      return out;
    });

    for (const t of tabs) {
      await visit(view + ':' + t.a + '=' + t.v,
        `(()=>{ try{ UI.view=${JSON.stringify(view)}; render();
          const el=[...document.querySelectorAll('#view [data-action=${JSON.stringify(t.a)}]')]
            .filter(e=>e.dataset.v===${JSON.stringify(t.v)})[0];
          if(!el) return 'tab vanished';
          ACTIONS[${JSON.stringify(t.a)}](el);
          const v=document.getElementById('view'); if(v)v.scrollTop=0;
          return true; }catch(e){ return String(e).slice(0,120); } })()`);
    }
  }

  /* ------------------------------------------------------------------
     THE REPORT
     ------------------------------------------------------------------ */
  const bad = [];
  console.log('\n  ' + rows.length + ' screens sampled at 390x844, world seed ' + SEED + '\n');
  console.log('  ' + 'screen'.padEnd(34) + 'empty'.padStart(8) + 'dead band'.padStart(12)
    + 'colours'.padStart(9));
  rows.forEach((r) => {
    if (r.error) {
      console.log('  ' + r.name.padEnd(34) + '  could not reach: ' + r.error);
      return;
    }
    const blank = r.empty >= BLANK_AT;
    const hole = r.bandFrac >= BAND_AT && r.band >= BAND_MIN_PX;
    if (blank || hole) bad.push({ r, blank, hole });
    console.log('  ' + r.name.padEnd(34)
      + (r.empty * 100).toFixed(0).padStart(7) + '%'
      + (r.band + 'px').padStart(9) + ((r.bandFrac * 100).toFixed(0) + '%').padStart(5)
      + String(r.colours).padStart(8)
      + (blank ? '   RENDERS NOTHING' : hole ? '   HOLE' : ''));
  });

  console.log('\n  ' + (bad.length ? bad.length + ' screen(s) to look at:' : 'nothing renders blank'));
  bad.forEach(({ r, blank, hole }) => {
    console.log('    ' + r.name + ' — ' + (blank
      ? (r.empty * 100).toFixed(0) + '% of its rows have nothing drawn on them'
      : 'a dead band of ' + r.band + 'px (' + (r.bandFrac * 100).toFixed(0)
        + '% of the view) starting at y=' + r.bandTop));
  });
  if (OUT) console.log('\n  shots written to ' + OUT);
  console.log('\n  page errors: ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
  process.exitCode = bad.length ? 1 : 0;
})();
