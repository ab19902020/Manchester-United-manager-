#!/usr/bin/env node
/* eslint-disable */
/* CAN YOU CLICK ON EVERYTHING, AND DOES IT DO ANYTHING?
 *
 *   node scripts/audit-menus.cjs [--deep]
 *
 * "make sure all the menus were connected so you can click on
 *  everything. You can make it more intuitive the way the menus are."
 *
 * Two faults hide in a game this size and neither shows up in a test
 * suite, because a test asserts what somebody thought to assert:
 *
 *   A DEAD CONTROL. It is drawn like a button, it lights up under a
 *   thumb, and clicking it does nothing at all -- the handler is missing,
 *   or it is there and returns early, or it throws and the catch
 *   swallows it. The player taps it three times and decides the game is
 *   broken.
 *
 *   A CONTROL THAT ISN'T ONE. It looks exactly like the things around it
 *   that ARE clickable -- a row in a list where every other row opens a
 *   player, a card in a grid where the neighbouring cards open screens --
 *   and it is inert because nobody wired it. That is the one that makes
 *   an interface feel arbitrary.
 *
 * So this walks every screen, clicks every control on it, and reports
 * which ones threw, which ones changed nothing on the page, and which
 * elements are dressed as controls without being wired to anything. It
 * puts the state back between clicks, so one screen's controls are all
 * measured from the same starting point rather than from wherever the
 * last click left the game.
 *
 * It is a lead generator, not a verdict. A control that legitimately
 * changes nothing visible -- a toggle whose effect is on another screen,
 * a save button -- will be listed, and reading the list is the job.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const DEEP = process.argv.includes('--deep');
/* the sheets pass is slow; --screens-only checks the navigation alone */
const SCREENS_ONLY = process.argv.includes('--screens-only');
const SEED = 20260821;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const boot = [];
  page.on('pageerror', (e) => boot.push(String(e).slice(0, 160)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const ready = await page.evaluate(({ seed }) => {
    try {
      ['startScreen', 'frontScreen', 'introScreen', 'splash']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      window.RBSWorldSeed.build(seed, 'MUN');
      ['startScreen', 'frontScreen', 'introScreen', 'splash']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
      UI.view = 'home'; render();
      return 'ok';
    } catch (e) { return String(e).slice(0, 200); }
  }, { seed: SEED });
  if (ready !== 'ok') { console.log('could not start a career: ' + ready); await browser.close(); return; }

  const out = await page.evaluate(async ({ deep, screensOnly }) => {
    const thrown = [];
    window.addEventListener('error', (e) => thrown.push(String(e.message || e).slice(0, 160)));

    /* WHERE THE GAME CAN BE. The five nav destinations plus the world
       screen, and for the ones that carry their own row of tabs, every
       tab on that row -- a tab is a screen as far as a player is
       concerned. */
    const screens = [];
    const NAVS = ['home', 'squad', 'tactics', 'transfers', 'club', 'world'];

    const goTo = (view, tab) => {
      try {
        UI.view = view;
        UI.selSlot = null;
        if (tab != null) UI.clubTab = tab;
        render();
        const host = document.getElementById('modalHost');
        if (host) host.classList.remove('open');
        return true;
      } catch (e) { return String(e).slice(0, 160); }
    };

    NAVS.forEach((v) => {
      const r = goTo(v, null);
      if (r !== true) { screens.push({ view: v, tab: null, broken: r }); return; }
      screens.push({ view: v, tab: null });
      /* every tab this screen offers */
      const tabs = [...document.querySelectorAll('#view [data-action="clubTab"], '
        + '#view [data-action="tab"], #view [data-action="wtab"]')]
        .map((b) => b.dataset.v).filter(Boolean);
      [...new Set(tabs)].forEach((t) => screens.push({ view: v, tab: t }));
    });

    /* WHAT COUNTS AS A CONTROL. Anything wired to the game's dispatcher,
       plus the things a thumb will treat as a button whether they are
       wired or not. */
    const WIRED = '[data-action]';
    const LOOKS = 'button, .btn, .quick, .kpi, .row, .card-tap, [role="button"], [onclick]';

    const describe = (el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 42);
      const d = Object.keys(el.dataset || {}).filter((k) => k !== 'action')
        .map((k) => k + '=' + el.dataset[k]).slice(0, 3).join(' ');
      return { action: el.dataset ? el.dataset.action || null : null,
        text: t, data: d, cls: (el.className || '').toString().slice(0, 40),
        tag: el.tagName.toLowerCase() };
    };

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05;
    };

    const hash = (str) => {
      let h = 5381;
      for (let i = 0; i < str.length; i += 1) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
      return h;
    };

    /* the state of the page, as a player would see it */
    const snap = () => {
      const v = document.getElementById('view');
      const host = document.getElementById('modalHost');
      const t = document.getElementById('toast');
      return {
        view: UI.view,
        tab: UI.clubTab,
        /* A TOAST IS A RESPONSE. It is one element that is always in the
           document and simply changes its text, so nothing else in this
           snapshot notices it -- and "⬇️ Save file exported" is exactly
           the game answering a button that was being reported as dead. */
        toast: t ? (t.style.display === 'block' ? t.textContent : '') : '',
        html: v ? v.innerHTML.length : 0,
        /* A HASH OF THE WHOLE SCREEN, not its two ends. Comparing the
           first and last four hundred characters said the entire Tactics
           screen was dead: every one of those controls moves an `on`
           class somewhere in the middle of the markup and leaves both
           ends identical. */
        sig: v ? hash(v.innerHTML) : 0,
        modal: !!(host && host.classList.contains('open')),
        body: document.body.children.length,
        day: G ? G.day : 0,
      };
    };

    const dead = [];
    const threw = [];
    const unwired = [];
    const worked = [];
    const seen = new Set();

    for (const s of screens) {
      if (s.broken) { threw.push({ where: s.view, action: '(rendering the screen)', why: s.broken }); continue; }

      /* ELEMENTS DRESSED AS CONTROLS AND WIRED TO NOTHING, and only the
         ones that matter. Two filters do the work:

           a wrapper is not a control. The Club tab bar has no action of
           its own and every tab inside it has one, so reporting the bar
           says nothing except that the bar exists.

           an odd one out is worth more than a lone one. A tile that is
           inert next to five identical tiles that navigate is the fault
           the player actually feels -- "why does this one do nothing?" --
           so a dead element whose own siblings are wired is reported
           separately from one where nothing in the group is wired. */
      goTo(s.view, s.tab);
      [...document.querySelectorAll('#view ' + LOOKS)].forEach((el) => {
        if (el.closest('[data-action]')) return;
        if (el.querySelector('[data-action]')) return;
        if (el.getAttribute('onclick')) return;
        if (!visible(el)) return;
        /* AND IT HAS TO ACTUALLY LOOK LIKE A CONTROL. `.kpi` and `.row`
           are layout, not buttons -- no pointer cursor, no press state --
           and reporting all of them put a hundred and forty-six tiles in
           front of the handful that a thumb would genuinely try. What the
           browser says the cursor is over it IS the test: that is exactly
           what tells a player "this is a thing you press". */
        const cur = getComputedStyle(el).cursor;
        if (cur !== 'pointer' && el.tagName !== 'BUTTON') return;
        const d = describe(el);
        if (!d.text) return;
        const key = s.view + '/' + s.tab + '/' + d.tag + '/' + d.text;
        if (seen.has(key)) return;
        seen.add(key);
        const kin = [...(el.parentElement ? el.parentElement.children : [])]
          .filter((q) => q !== el && q.className === el.className);
        const wiredKin = kin.filter((q) => q.hasAttribute('data-action')
          || q.querySelector('[data-action]')).length;
        unwired.push({ where: s.view + (s.tab ? ':' + s.tab : ''), ...d,
          oddOneOut: kin.length > 0 && wiredKin > 0,
          kin: kin.length, wiredKin });
      });

      /* and now click everything that IS wired */
      const n = [...document.querySelectorAll('#view ' + WIRED)].filter(visible).length;
      for (let i = 0; i < n; i += 1) {
        goTo(s.view, s.tab);
        const list = [...document.querySelectorAll('#view ' + WIRED)].filter(visible);
        const el = list[i];
        if (!el) continue;
        const d = describe(el);
        const key = s.view + '/' + s.tab + '/' + d.action + '/' + d.data + '/' + d.text;
        if (seen.has(key)) continue;
        seen.add(key);
        /* THE ONE YOU ARE ALREADY ON IS ALLOWED TO DO NOTHING. Clicking
           the lit tab, or the selected chip, correctly changes nothing,
           and reporting those buried the four controls that matter under
           twenty that do not. */
        if (/(^|\s)(on|sel|active|selected)(\s|$)/.test(el.className || '')
            || el.getAttribute('aria-selected') === 'true'
            || el.disabled) continue;

        const before = snap();
        const mark = thrown.length;
        let error = null;
        try { el.click(); } catch (e) { error = String(e).slice(0, 160); }
        /* AND THEN WAIT FOR IT. Saving a career is async -- it awaits the
           store before it writes -- so a snapshot taken on the next line
           catches the game before it has done anything, and all three
           save slots were being reported as dead buttons. */
         
        await new Promise((r) => setTimeout(r, 140));
        const after = snap();
        if (!error && thrown.length > mark) error = thrown[thrown.length - 1];

        const row = { where: s.view + (s.tab ? ':' + s.tab : ''), ...d };
        if (error) { threw.push({ ...row, why: error }); continue; }
        const moved = before.view !== after.view || before.tab !== after.tab
          || before.modal !== after.modal || before.body !== after.body
          || before.day !== after.day || before.sig !== after.sig
          || before.toast !== after.toast
          || Math.abs(before.html - after.html) > 0;
        if (moved) worked.push(row); else dead.push(row);
        if (!deep && dead.length + threw.length > 400) break;
      }
    }

    /* =================================================================
       AND NOW THE ROOMS BEHIND THE DOORS
       -----------------------------------------------------------------
       Everything above is the five nav screens and their tabs, which is
       where a player spends most of their time and about a fifth of what
       the game can put in front of them. The rest is behind a door: a
       modal sheet -- a player's profile, a contract offer, a board
       meeting, a scout report -- and the match screen, which has its own
       four tabs and its own controls and is reached from nowhere else.

       A dead control inside a modal is worse than one on a screen,
       because a modal is where the game asks you to decide something.
       ================================================================= */
    if (screensOnly) {
      return { screens: screens.length, worked: worked.length, dead, threw, unwired,
        sheets: 0, sheetControls: 0, seconds: 0, ranOut: false };
    }
    const sheetBody = () => document.getElementById('sheetBody');
    const modalOpen = () => {
      const h = document.getElementById('modalHost');
      return !!(h && h.classList.contains('open'));
    };
    const shut = () => {
      const h = document.getElementById('modalHost');
      if (h) h.classList.remove('open');
      const b = sheetBody();
      if (b) b.innerHTML = '';
    };

    /* every control that opened a sheet, revisited, with the sheet's own
       controls clicked one at a time from a freshly reopened sheet */
    /* BOUNDED, BECAUSE A CRAWLER THAT HANGS TELLS YOU NOTHING. The first
       version had no ceiling and no clock, walked into a sheet whose
       controls opened further sheets, and ran for twenty minutes without
       printing a line. */
    const t0 = Date.now();
    const BUDGET = deep ? 900000 : 240000;
    const openers = [];
    for (const s of screens) {
      if (Date.now() - t0 > BUDGET * 0.4) break;
      if (s.broken) continue;
      goTo(s.view, s.tab);
      const n = [...document.querySelectorAll('#view ' + WIRED)].filter(visible).length;
      for (let i = 0; i < n; i += 1) {
        goTo(s.view, s.tab); shut();
        const el = [...document.querySelectorAll('#view ' + WIRED)].filter(visible)[i];
        if (!el) continue;
        try { el.click(); } catch (e) { continue; }
         
        await new Promise((r) => setTimeout(r, 60));
        if (modalOpen()) openers.push({ view: s.view, tab: s.tab, index: i,
          title: (sheetBody().textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) });
        shut();
      }
    }

    const sheets = [];
    for (const o of openers) {
      const reopen = () => {
        goTo(o.view, o.tab); shut();
        const el = [...document.querySelectorAll('#view ' + WIRED)].filter(visible)[o.index];
        if (!el) return false;
        try { el.click(); } catch (e) { return false; }
        return true;
      };
      if (Date.now() - t0 > BUDGET) break;
      if (!reopen()) continue;
       
      await new Promise((r) => setTimeout(r, 60));
      const count = [...document.querySelectorAll('#sheetBody ' + WIRED)].filter(visible).length;
      sheets.push({ where: o.view + (o.tab ? ':' + o.tab : ''), title: o.title, controls: count });
      for (let i = 0; i < Math.min(count, 24); i += 1) {
        if (Date.now() - t0 > BUDGET) break;
        if (!reopen()) break;
         
        await new Promise((r) => setTimeout(r, 60));
        const el = [...document.querySelectorAll('#sheetBody ' + WIRED)].filter(visible)[i];
        if (!el) continue;
        const d = describe(el);
        const key = 'sheet/' + o.title + '/' + d.action + '/' + d.data + '/' + d.text;
        if (seen.has(key)) continue;
        seen.add(key);
        if (/(^|\s)(on|sel|active|selected)(\s|$)/.test(el.className || '')
            || el.getAttribute('aria-selected') === 'true' || el.disabled) continue;
        const before = { ...snap(), sheet: hash(sheetBody().innerHTML) };
        const mark = thrown.length;
        let error = null;
        try { el.click(); } catch (e) { error = String(e).slice(0, 160); }
         
        await new Promise((r) => setTimeout(r, 140));
        const after = { ...snap(), sheet: hash(sheetBody().innerHTML) };
        if (!error && thrown.length > mark) error = thrown[thrown.length - 1];
        const row = { where: 'sheet «' + o.title + '»', ...d };
        if (error) { threw.push({ ...row, why: error }); continue; }
        const moved = before.view !== after.view || before.modal !== after.modal
          || before.sheet !== after.sheet || before.sig !== after.sig
          || before.toast !== after.toast || before.day !== after.day;
        if (moved) worked.push(row); else dead.push(row);
      }
      shut();
    }
    goTo('home', null); shut();

    return { screens: screens.length, worked: worked.length, dead, threw, unwired,
      sheets: sheets.length, sheetControls: sheets.reduce((t, x) => t + x.controls, 0),
      seconds: Math.round((Date.now() - t0) / 1000),
      ranOut: Date.now() - t0 > BUDGET };
  }, { deep: DEEP, screensOnly: SCREENS_ONLY });

  const line = (r) => '    ' + String(r.where).padEnd(18)
    + String(r.action || '(none)').padEnd(20)
    + (r.data ? r.data.padEnd(22) : ''.padEnd(22))
    + '"' + r.text + '"' + (r.why ? '   -> ' + r.why : '');

  console.log('\n  ' + out.screens + ' screens and ' + out.sheets + ' modal sheets walked; '
    + out.worked + ' controls did something ('
    + out.sheetControls + ' of them inside a sheet)'
    + (out.ranOut ? '   [stopped on the time budget after ' + out.seconds + 's]' : '')
    + '\n');
  console.log('  THREW (' + out.threw.length + ')');
  out.threw.forEach((r) => console.log(line(r)));
  console.log('\n  CLICKED AND NOTHING CHANGED (' + out.dead.length + ')');
  out.dead.forEach((r) => console.log(line(r)));
  const odd = out.unwired.filter((r) => r.oddOneOut);
  const lone = out.unwired.filter((r) => !r.oddOneOut);
  console.log('\n  THE ODD ONE OUT — inert, but its neighbours are clickable ('
    + odd.length + ')');
  odd.forEach((r) => console.log(line(r) + '   [' + r.wiredKin + ' of ' + r.kin
    + ' beside it are wired]'));
  console.log('\n  DRESSED AS A CONTROL, NOTHING NEAR IT IS WIRED EITHER ('
    + lone.length + ')');
  lone.forEach((r) => console.log(line(r)));
  console.log('\n  page errors while booting: ' + (boot.length ? boot.slice(0, 3).join(' | ') : 'none'));
  await browser.close();
})();
