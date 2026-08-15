#!/usr/bin/env node
/* global window, document, getComputedStyle, newGame, advanceDay, G, MU, ACTIONS,
          userMatchOn, simInstant */

/* Walk every screen in both orientations and report layout faults.
 *
 * WHY THIS EXISTS, AND WHY IT LOOKS FOR WHAT IT LOOKS FOR.
 *
 * The first version of this sweep counted one thing: pairs of cards whose
 * boxes intersect. That found thirteen broken screens in landscape and
 * was worth having. Then it passed the tactics screen in portrait on the
 * same run that shipped a change which collapsed every card on it into a
 * strip with its contents spilling over the one below.
 *
 * It passed because two boxes side by side, each squashed to 20px with
 * their text hanging out of them, do not INTERSECT. The overlap test was
 * asking the wrong question. A box drawn through its neighbour and a box
 * that cannot hold its own contents look the same to a reader and only
 * one of them was being counted.
 *
 * So it now asks three questions of every screen:
 *
 *   spill      does anything stick out past the side of the view
 *   through    do two boxes intersect
 *   squashed   is a box shorter than the content inside it
 *
 * The third is the one that would have caught it: measured after the
 * report, `.pitchbox` on the tactics screen came back clientHeight=0
 * against scrollHeight=30. A scroll container is exempt, because being
 * shorter than its contents is the entire point of one.
 *
 *   node scripts/sweep-screens.cjs [--club MUN] [--days 60]
 */

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright';

const SCREENS = [
  ['home', null], ['squad', 'first'], ['squad', 'academy'], ['squad', 'loans'],
  ['squad', 'treat'], ['squad', 'training'], ['tactics', null], ['transfers', null],
  ['world', 'table'], ['world', 'calendar'], ['world', 'fixtures'], ['world', 'cups'],
  /* the statistics centre is five rooms behind one tab, and four of them
     are wide tables — which is exactly the shape that spills. Visiting
     only the default room would check the one room with no table in it. */
  ['world', 'stats', 'players'], ['world', 'stats', 'teams'],
  ['world', 'stats', 'squad'], ['world', 'stats', 'matches'],
  ['world', 'stats', 'records'],
  ['world', 'intl'],
  ['club', 'staff'], ['club', 'stadium'], ['club', 'training'], ['club', 'finances'],
  ['club', 'trophies'], ['club', 'media'], ['club', 'save'],
];

function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

async function walk(page, orientation) {
  return page.evaluate(async ({ SCREENS, orientation }) => {
    const out = [];
    const scrolls = (style) => /(auto|scroll)/.test(style.overflow)
      || /(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflowX);

    for (const [view, tab, room] of SCREENS) {
      try {
        ACTIONS.nav({ dataset: { v: view } });
        if (tab && view === 'squad') ACTIONS.squadTab({ dataset: { v: tab } });
        else if (tab) ACTIONS.clubTab({ dataset: { v: tab } });
        if (room && ACTIONS.anaRoom) {
          ACTIONS.anaRoom({ dataset: { v: room } });
          /* and drop the appearance filter, or early in a season the
             players room draws its empty state and there is no table to
             measure — a pass that means nothing */
          try { window.RBSAnalytics.state().minApps = 0; } catch (e) { /* not loaded */ }
          ACTIONS.anaRoom({ dataset: { v: room } });
        }
        await new Promise((done) => setTimeout(done, 280));

        const root = document.getElementById('view');
        if (!root) { out.push({ view, tab, orientation, error: 'no #view' }); continue; }
        const bounds = root.getBoundingClientRect();

        /* 1. anything reaching past the side of the view, unless it is
              inside something that scrolls sideways on purpose */
        const spill = [];
        root.querySelectorAll('*').forEach((el) => {
          const style = getComputedStyle(el);
          if (style.position === 'fixed' || style.display === 'none') return;
          const box = el.getBoundingClientRect();
          if (box.width === 0) return;
          if (box.right <= bounds.right + 2 && box.left >= bounds.left - 2) return;
          let parent = el.parentElement;
          while (parent && parent !== root) {
            if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) return;
            parent = parent.parentElement;
          }
          spill.push(el.tagName + '.' + String(el.className).slice(0, 26)
            + ' [' + Math.round(box.left - bounds.left) + '..'
            + Math.round(box.right - bounds.left) + ' of ' + root.clientWidth + ']');
        });

        /* 2. two boxes drawn through each other */
        const cards = [...root.querySelectorAll(':scope > *, .card, .sec, .sh-panel')]
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter((item) => item.box.width > 40 && item.box.height > 12);
        const through = [];
        for (let i = 0; i < cards.length; i += 1) {
          for (let j = i + 1; j < cards.length; j += 1) {
            const a = cards[i]; const b = cards[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const overX = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
            const overY = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
            if (overX > 8 && overY > 8) {
              through.push(String(a.el.className).slice(0, 20) + ' x '
                + String(b.el.className).slice(0, 20)
                + ' (' + Math.round(overX) + 'x' + Math.round(overY) + ')');
            }
          }
        }

        /* 3. a box that cannot hold what is inside it. THE ONE THE FIRST
              VERSION OF THIS SWEEP DID NOT ASK. */
        const squashed = [];
        root.querySelectorAll('*').forEach((el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.position === 'fixed') return;
          if (scrolls(style)) return;
          if (el.clientHeight === 0 && el.scrollHeight <= 8) return;
          const over = el.scrollHeight - el.clientHeight;
          if (over <= 6) return;
          squashed.push(el.tagName + '.' + String(el.className).slice(0, 24)
            + ' box=' + el.clientHeight + ' content=' + el.scrollHeight
            + ' shrink=' + style.flexShrink);
        });

        out.push({
          view,
          tab: room ? tab + '/' + room : tab,
          orientation,
          bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          spillN: spill.length,
          spill: spill.slice(0, 4),
          throughN: through.length,
          through: through.slice(0, 4),
          squashedN: squashed.length,
          squashed: squashed.slice(0, 4),
          empty: (root.innerText || '').trim().length < 12,
        });
      } catch (error) {
        out.push({ view, tab, orientation, error: String(error).slice(0, 90) });
      }
    }
    return out;
  }, { SCREENS, orientation });
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const club = arg('club', 'MUN');
  const days = Number(arg('days', 60));

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));

  await page.goto('file:///home/user/Manchester-United-manager-/red-devil-manager.html');
  await page.waitForFunction('typeof newGame === "function"', { timeout: 90000 });

  /* a real career, played far enough in that the screens have something
     on them — an empty save hides half the layout */
  await page.evaluate(async ({ club, days }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    newGame(club);
    clear();
    for (let day = 0; day < days; day += 1) {
      try {
        for (let guard = 0; guard < 3; guard += 1) {
          const fixture = userMatchOn(G.day);
          if (!fixture || fixture.played) break;
          MU.fix = fixture; MU.m = null;
          if (!simInstant()) break;
        }
      } catch (error) { /* pre-season */ }
      try { await advanceDay(); } catch (error) { /* waiting on an answer */ }
    }
  }, { club, days });

  const portrait = await walk(page, 'portrait');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(500);
  const landscape = await walk(page, 'landscape');

  const all = [...portrait, ...landscape];
  const bad = all.filter((row) => row.error || row.empty
    || row.spillN || row.throughN || row.squashedN || row.bodyOverflow > 1);

  console.log('screens checked', all.length, ' faults', bad.length);
  bad.forEach((row) => console.log(JSON.stringify(row)));
  console.log('page errors    ', errors.length ? errors.slice(0, 3) : 'none');

  await browser.close();
  process.exit(bad.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
