#!/usr/bin/env node
/* eslint-disable */
/* WHAT IS ACTUALLY WRONG WITH THE LAYOUT, measured rather than eyeballed.
 *
 *   node scripts/audit-layout.cjs
 *
 * Reading screenshots is how this started and it produced three faults
 * in a row that were not faults. The dock "covering" the bottom of every
 * screen: the scroller already has padding for it and every screen
 * scrolls clear. The scrolling tab rows "cut dead" at the right edge:
 * they have had a measured edge fade for months. Section values
 * "colliding" with the rule beside them: a ten pixel gap, and the value
 * sits a clean seventeen pixels off the glass.
 *
 * So this measures instead. Four faults, each defined so that a machine
 * can decide it and a person cannot argue with the answer:
 *
 *   OVERLAP     two siblings whose boxes intersect. Almost always a
 *               sticky or negatively-margined element sitting on its
 *               neighbour, which is the one layout fault that reads as
 *               broken rather than tight.
 *   CLIPPED     text wider than the box holding it, where that box does
 *               not scroll. The end of the word is simply gone.
 *   OFF-SCREEN  anything reaching past the viewport, which on a phone
 *               means a horizontal scrollbar on the whole page.
 *   SMALL       a control whose hit area is under 40x40. What makes an
 *               interface feel imprecise rather than ugly.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const SEED = 20260821;
const SCREENS = [
  ['home', 'home', null], ['squad', 'squad', null], ['tactics', 'tactics', null],
  ['transfers', 'transfers', null], ['club', 'club', null],
  ['club:staff', 'club', 'staff'], ['club:stadium', 'club', 'stadium'],
  ['club:training', 'club', 'training'], ['club:finances', 'club', 'finances'],
  ['club:trophies', 'club', 'trophies'], ['club:media', 'club', 'media'],
  ['club:save', 'club', 'save'],
  ['world:table', 'world', 'table'], ['world:calendar', 'world', 'calendar'],
  ['world:fixtures', 'world', 'fixtures'], ['world:cups', 'world', 'cups'],
  ['world:stats', 'world', 'stats'],
];

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const ready = await page.evaluate(({ seed }) => {
    try {
      const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      clear(); window.RBSWorldSeed.build(seed, 'MUN'); clear();
      UI.view = 'home'; render();
      return 'ok';
    } catch (e) { return String(e).slice(0, 200); }
  }, { seed: SEED });
  if (ready !== 'ok') { console.log('could not start: ' + ready); await browser.close(); return; }

  const out = await page.evaluate(({ screens }) => {
    const overlap = [], clipped = [], offscreen = [], small = [], covered = [];

    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return null;
      return r;
    };
    const label = (el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26);
      return (t || '<' + el.tagName.toLowerCase() + '>')
        + (el.className ? ' .' + String(el.className).split(/\s+/).slice(0, 2).join('.') : '');
    };

    screens.forEach(([name, view, tab]) => {
      try {
        UI.view = view; UI.selSlot = null;
        if (tab) UI.clubTab = tab;
        render();
        const v = document.getElementById('view');
        if (v) v.scrollTop = 0;
        /* let layout settle before measuring anything. Without this the
           hit test caught crests mid-paint and reported two home tiles
           as covered by an SVG that a second look says is not there. */
        void document.body.offsetHeight;
      } catch (e) { return; }

      const root = document.getElementById('view');
      if (!root) return;
      const all = [...root.querySelectorAll('*')];

      /* ---- OVERLAP: siblings whose boxes intersect ------------------
         Two exclusions, both learned by running it. Everything inside an
         <svg> overlaps on purpose -- a club crest is layered paths, and
         the first run reported two thousand of them. And an element
         taken out of flow was put where it is deliberately: the position
         badge sitting on the corner of a player's photograph is not a
         collision, it is a design. Only elements that are laid out
         beside each other can collide by accident. */
      const parents = new Set(all.map((e) => e.parentElement).filter(Boolean));
      parents.forEach((par) => {
        if (par.closest('svg')) return;
        const kids = [...par.children].map((k) => ({ el: k, r: vis(k) }))
          .filter((k) => k.r && k.el.tagName !== 'svg'
            && ['static', 'relative', 'sticky'].indexOf(getComputedStyle(k.el).position) >= 0);
        for (let i = 0; i < kids.length; i += 1) {
          for (let j = i + 1; j < kids.length; j += 1) {
            const a = kids[i].r, b = kids[j].r;
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            /* 2px of anti-aliasing overlap is not a fault; 8 is */
            if (ox > 8 && oy > 8) {
              overlap.push({ where: name, a: label(kids[i].el), b: label(kids[j].el),
                by: Math.round(Math.min(ox, oy)) });
            }
          }
        }
      });

      /* ---- CLIPPED: text a box has actually cut off -----------------
         scrollWidth over clientWidth on its own means nothing: a pill
         with side padding and centred text reports a difference while
         rendering perfectly, and the first run listed forty rating
         badges that are entirely legible. Text is only LOST when
         something hides the overflow, so that is the test. An ellipsis
         is a deliberate trim and does not count. */
      all.forEach((el) => {
        const r = vis(el);
        if (!r) return;
        if (el.children.length) return;                 // leaves only
        if (el.closest('svg')) return;
        const s = getComputedStyle(el);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') return;
        if (el.closest('.xscroll')) return;
        const chain = [el, el.parentElement, el.parentElement && el.parentElement.parentElement]
          .filter(Boolean);
        /* AN ELLIPSIS IS NOT A CLIP. text-overflow still lays the whole
           string out and only paints it short, so a Range around the
           text reports the full width either way -- and the check has to
           look up the chain, because the ellipsis lives on the box that
           hides the overflow, not on the leaf that holds the words. */
        if (chain.some((q) => getComputedStyle(q).textOverflow === 'ellipsis')) return;
        const hider = chain
          .find((q) => { const cs = getComputedStyle(q); return cs.overflow === 'hidden'
            || cs.overflowX === 'hidden' || cs.overflowY === 'hidden'; });
        if (!hider) return;
        /* AND THE GLYPHS HAVE TO ACTUALLY BE CUT. scrollWidth is measured
           on the box's layout, and a flex item inside a fixed-width pill
           reports twelve pixels of overflow while every digit still
           paints -- thirty-seven rating badges were listed on that
           reading and a 4x crop shows "87-98" complete. A Range around
           the text node gives where the letters really are, and only
           letters outside the box that hides them are lost. */
        const rng = document.createRange();
        rng.selectNodeContents(el);
        const tr = rng.getBoundingClientRect();
        rng.detach && rng.detach();
        const hb = hider.getBoundingClientRect();
        const cut = Math.max(tr.right - hb.right, hb.left - tr.left);
        if (cut > 1.5 && tr.width > 0) {
          clipped.push({ where: name, what: label(el), by: Math.round(cut) });
        }
      });

      /* ---- OFF-SCREEN --------------------------------------------- */
      all.forEach((el) => {
        const r = vis(el);
        if (!r) return;
        if (el.closest('.xscroll')) return;             // meant to run on
        const s = getComputedStyle(el);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') return;
        if (r.right > innerWidth + 2 || r.left < -2) {
          offscreen.push({ where: name, what: label(el),
            by: Math.round(Math.max(r.right - innerWidth, -r.left)) });
        }
      });

      /* ---- COVERED: a control something else is sitting on ----------
         The click audit calls el.click() straight on the element, which
         bypasses hit testing entirely, so it cannot see this: a control
         that is present, wired, and works when called -- and that a
         thumb can never reach because something transparent is lying
         over it. That is the truest form of "I tapped it and nothing
         happened", and it needs the browser's own answer to "what is at
         this point". */
      all.forEach((el) => {
        if (!el.hasAttribute('data-action') && el.tagName !== 'BUTTON') return;
        if (el.querySelector('[data-action]')) return;
        if (el.closest('svg')) return;
        /* SCROLLED TO WHERE A PLAYER WOULD PUT IT FIRST. Measuring at the
           top of the scroll asks "what is under the fixed dock right
           now", and the answer is whatever happens to be parked there --
           eighteen rows of league table and a goalkeeper. The question
           worth asking is whether a control can be reached AT ALL, so
           each one is brought into view before the browser is asked. */
        try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
        const r = vis(el);
        if (!r) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit) return;
        if (hit === el || el.contains(hit) || hit.contains(el)) return;
        covered.push({ where: name, what: label(el), by: label(hit) });
      });

      /* ---- SMALL: a control you have to aim at --------------------- */
      all.forEach((el) => {
        if (!el.hasAttribute('data-action') && el.tagName !== 'BUTTON') return;
        if (el.querySelector('[data-action]')) return;
        if (el.closest('svg')) return;
        const r = vis(el);
        if (!r) return;
        /* a row in a list is a control the width of the screen; it is
           the small square ones that need aiming at */
        if (r.width >= 40 || r.height >= 40) return;
        try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
        const rr = vis(el);
        if (!rr) return;
        r.left = rr.left; r.top = rr.top; r.width = rr.width; r.height = rr.height;
        /* AND THE BOX IS NOT THE TARGET. A hit area can be extended with
           a pseudo-element without moving anything, which is how the
           shortlist star went from 17x21 to a 44px target while still
           measuring 17x21 here. So ask the browser what is actually at
           the corners of a 40px square over the control. */
        const cx = rr.left + rr.width / 2, cy = rr.top + rr.height / 2;
        const reach = [[-18, 0], [18, 0], [0, -18], [0, 18]]
          .filter(([dx, dy]) => {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
            const h = document.elementFromPoint(x, y);
            return h && (h === el || el.contains(h) || h.contains(el));
          }).length;
        if (reach >= 4) return;                    // 40px of it is reachable
        small.push({ where: name, what: label(el),
          size: Math.round(rr.width) + 'x' + Math.round(rr.height)
            + ' (' + reach + '/4 edges reachable)' });
      });
    });

    /* one row per distinct fault, not one per screen it appears on */
    const fold = (list, key) => {
      const m = new Map();
      list.forEach((r) => {
        const k = key(r);
        if (!m.has(k)) m.set(k, { ...r, screens: [r.where] });
        else m.get(k).screens.push(r.where);
      });
      return [...m.values()];
    };
    return {
      overlap: fold(overlap, (r) => r.a + '|' + r.b),
      clipped: fold(clipped, (r) => r.what),
      offscreen: fold(offscreen, (r) => r.what),
      small: fold(small, (r) => r.what + r.size),
      covered: fold(covered, (r) => r.what + '|' + r.by),
    };
  }, { screens: SCREENS });

  const show = (title, rows, fmt) => {
    console.log('\n  ' + title + ' (' + rows.length + ')');
    rows.slice(0, 30).forEach((r) => console.log('    ' + fmt(r)
      + '   [' + r.screens.slice(0, 3).join(', ')
      + (r.screens.length > 3 ? ' +' + (r.screens.length - 3) : '') + ']'));
    if (rows.length > 30) console.log('    … and ' + (rows.length - 30) + ' more');
  };
  show('OVERLAPPING SIBLINGS', out.overlap, (r) => r.a + '  ⟂  ' + r.b + '   by ' + r.by + 'px');
  show('TEXT CLIPPED BY ITS BOX', out.clipped, (r) => r.what + '   by ' + r.by + 'px');
  show('REACHING PAST THE SCREEN', out.offscreen, (r) => r.what + '   by ' + r.by + 'px');
  show('CONTROLS UNDER 40x40', out.small, (r) => r.what + '   ' + r.size);
  show('CONTROLS COVERED BY SOMETHING ELSE', out.covered,
    (r) => r.what + '   is under  ' + r.by);
  console.log('\n  page errors: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
})();
