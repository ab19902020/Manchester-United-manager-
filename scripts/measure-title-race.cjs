#!/usr/bin/env node
/* eslint-disable */
/* How many points does it take to win the league?
 *
 *   node scripts/measure-title-race.cjs [seasons] [division]
 *
 * A whole season of a division, played with the game's own quickSim and
 * nothing else -- no days advancing, no transfers, no cups -- so a
 * season takes seconds rather than minutes and a tuning change can be
 * judged straight away.
 *
 * It reports the numbers a league table is judged on: what the champion
 * finished on, what the gap to second and to fourth was, and how tight
 * the whole thing is. Real English football, for reference:
 *
 *   Premier League   champion 87.6   2nd 80.5   4th 70   17th 38   20th 21
 *   Championship     champion 95     2nd 90     6th 78   21st 46
 *
 * WHERE THE BOTTOM NUMBER CAME FROM, AND WHY IT CHANGED. This rig used
 * to carry 24 for the bottom club and 52 for the spread, and both were
 * wrong. The club that finishes bottom of the Premier League has
 * averaged about 21 over the last ten seasons — 17, 24, 31, 16, 21, 23,
 * 22, 25, 16, 12 — so the spread from first to last is about 67, not
 * 52. That mistake mattered: it made the game's bottom club, on 20.3,
 * look four points too weak when it was already right, and it hid where
 * the real fault is. The top figures are the ones to trust — the
 * champion's 87.6 is the average of the thirty Premier League seasons
 * before 2025-26 and second's 80.5 is the same measure; fourth has
 * averaged about 70 over the last decade and the survival line, 18th
 * plus one, about 36.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const SEASONS = +(process.argv[2] || 6);
const DIV = process.argv[3] || 'PL';
const SEED = +(process.argv[4] || 20260821);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ seasons, div, seed }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    /* THE SAME WORLD EVERY RUN. Without this each measurement generates
       a different league and two runs of the same code cannot be
       compared — which is worthless for tuning, where the whole job is
       telling a change apart from the weather. */
    clear();
    if (window.RBSWorldSeed && typeof window.RBSWorldSeed.build === 'function') {
      window.RBSWorldSeed.build(seed, 'MUN');
    } else { newGame('MUN'); }
    clear();

    const mem = G.clubs.filter((c) => c.league === div).map((c) => c.i);
    const freshen = (list) => list.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
      p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0;
    }));

    /* THE ENGINE'S OWN VIEW OF A SQUAD, not the club's standing and not
       `ovr`. MatchSim picks an eleven with autoPick and rates every man
       in it with calcEff, so that is what "the stronger side" has to
       mean here — otherwise a rig can report that quality does not
       decide matches when all it has really found is that its own
       measure of quality was the wrong one. */
    const STR = {};
    const strength = (ci) => {
      if (STR[ci] != null) return STR[ci];
      const c = G.clubs[ci];
      const shape = FORMATIONS[c.tacs.formation] || FORMATIONS['4-3-3'];
      const ids = autoPick(ci, c.tacs.formation) || [];
      let sum = 0, n = 0;
      shape.forEach(([slot], ix) => {
        const p = ids[ix] ? playerById(ids[ix]) : null;
        if (!p) return;
        sum += calcEff(p, slot); n += 1;
      });
      STR[ci] = n ? sum / n : 0;
      return STR[ci];
    };
    /* HEAD TO HEAD, FIRST AND ON A CLEAN WORLD. A season is 380 matches
       of accumulated noise; this asks the same question directly. It
       runs before the seasons because a rig that has just played six of
       them back to back has nothing left standing — the first version
       of this measured forty 0-0 draws and a squad rated zero, which
       was the rig's state, not the engine's football. */
    /* RANK THEM RESTED. calcEff folds in condition, sharpness and
       morale, so ranking squads straight off a freshly generated world
       ranks them partly by how tired they happen to be — which is how
       an earlier run of this rig came to report that the champion was
       the fifteenth best squad in the division. */
    freshen(mem);
    const byStrength = mem.slice().sort((x, y) => strength(y) - strength(x));
    const h2h = (hi, lo, n) => {
      let w = 0, d = 0, l = 0, gf = 0, ga = 0;
      for (let k = 0; k < n; k += 1) {
        freshen([hi, lo]);
        const fix = { h: hi, a: lo, div, sc: [], hs: 0, as: 0, r: 0,
          day: 40 + (k * 7) % 260, played: false };
        if (typeof buildContext === 'function') buildContext(fix);
        quickSim(fix);
        gf += fix.hs; ga += fix.as;
        if (fix.hs > fix.as) w += 1; else if (fix.hs === fix.as) d += 1; else l += 1;
      }
      return { w, d, l, gf: gf / n, ga: ga / n,
        hi: Math.round(strength(hi) * 10) / 10, lo: Math.round(strength(lo) * 10) / 10 };
    };
    const weakest = byStrength[byStrength.length - 1];
    const mid = byStrength[Math.floor(mem.length / 2)];
    const duels = {
      'strongest HOME v weakest': h2h(byStrength[0], weakest, 40),
      'strongest AWAY at weakest': h2h(weakest, byStrength[0], 40),
      'strongest HOME v mid': h2h(byStrength[0], mid, 40),
      'strongest AWAY at mid': h2h(mid, byStrength[0], 40),
      /* the split every league is built out of: two sides of the same
         quality, one of them at home */
      'evenly matched': (() => {
        let w = 0, d = 0, l = 0, gf = 0, ga = 0, n = 0;
        for (let k = 0; k + 1 < mem.length; k += 2) {
          const r = h2h(byStrength[k], byStrength[k + 1], 12);
          w += r.w; d += r.d; l += r.l; gf += r.gf; ga += r.ga; n += 1;
        }
        return { w, d, l, gf: gf / n, ga: ga / n, hi: 0, lo: 0 };
      })(),
    };

    const runs = [];
    for (let s = 0; s < seasons; s += 1) {
      /* PRE-SEASON. Without this the squads never recover: condition
         drains match by match and is only ever restored by the day
         loop, so a rig that plays season after season back to back had
         everybody walking by the third one — champions falling 77, 57,
         41, 40, 38 and half a goal a game. */
      freshen(mem);
      mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
        if (p.stats) { p.stats.goals = 0; p.stats.assists = 0; p.stats.apps = 0; }
      }));
      const row = {};
      mem.forEach((i) => { row[i] = { i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
      /* A REAL FIXTURE LIST, in matchdays. The first version of this
         rig looped every pair as `for a { for b { … } }`, which is not a
         season: it made each club play nineteen home matches back to
         back while its nineteen opponents played one each. The clubs
         sit in the array strongest first, so the best squads burned
         through their home fixtures exhausted against fresh opposition
         and the table came out inverted — Arsenal on 49 points and
         Sunderland on 74 — which read exactly like an engine that
         ignores quality. It was the schedule.

         rrPairs is the game's own Berger round robin, home and away,
         and between matchdays everybody recovers the way the game
         recovers them: about six a day, three days a match. */
      const rounds = rrPairs(mem);
      rounds.forEach((round) => {
        mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
          if (!p.injury) p.cond = Math.min(100, p.cond + 6.1 * 3);
        }));
        round.forEach(([hi, ai]) => {
          const fix = { h: hi, a: ai, div, sc: [], hs: 0, as: 0, r: 0,
            day: 40 + (rounds.indexOf(round) * 7) % 260, played: false };
          if (typeof buildContext === 'function') buildContext(fix);
          quickSim(fix);
          const H = row[hi], A = row[ai];
          H.p += 1; A.p += 1;
          H.gf += fix.hs; H.ga += fix.as; A.gf += fix.as; A.ga += fix.hs;
          if (fix.hs > fix.as) { H.w += 1; A.l += 1; H.pts += 3; }
          else if (fix.hs < fix.as) { A.w += 1; H.l += 1; A.pts += 3; }
          else { H.d += 1; A.d += 1; H.pts += 1; A.pts += 1; }
        });
      });

      const table = mem.map((i) => row[i]).sort((x, y) => y.pts - x.pts
        || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
      const goals = table.reduce((t, r) => t + r.gf, 0);
      const games = table.reduce((t, r) => t + r.p, 0) / 2;
      runs.push({
        champ: G.clubs[table[0].i].name,
        pts: table.map((r) => r.pts),
        champW: table[0].w, champD: table[0].d, champL: table[0].l,
        gpg: goals / games,
        top: table[0].pts, low: table[table.length - 1].pts,
        byClub: (() => { const m = {}; table.forEach((r) => { m[r.i] = r.pts; }); return m; })(),
        /* DOES THE BEST SQUAD WIN IT? Reputation is a club's standing,
           not its team, so this ranks by the squad the engine actually
           plays with — the mean rating of its best thirteen. */
        strengthRank: (() => {
          const order = mem.slice().sort((x, y) => strength(y) - strength(x));
          return order.indexOf(table[0].i) + 1;
        })(),
        /* and how far the table follows squad strength overall */
        rho: (() => {
          const byStrength = mem.slice().sort((x, y) => strength(y) - strength(x));
          let sum = 0;
          table.forEach((r, ix) => { sum += Math.abs(ix - byStrength.indexOf(r.i)); });
          return sum / table.length;
        })(),
      });
    }
    /* one season laid out against squad strength, because an average
       hides whether the relationship is noisy or inverted */
    const lastTable = runs[runs.length - 1];
    const dump = byStrength.map((i, ix) => ({
      rank: ix + 1, club: G.clubs[i].name,
      str: Math.round(strength(i) * 10) / 10,
      pts: lastTable.byClub[i],
    }));
    return { runs, clubs: mem.length, duels, dump };
  }, { seasons: SEASONS, div: DIV, seed: SEED });

  const avg = (f) => out.runs.reduce((t, r) => t + f(r), 0) / out.runs.length;
  const n = out.clubs;
  const at = (k) => avg((r) => r.pts[k]);
  const real = { PL: { champ: 87, second: 80, fourth: 69, bottom: 24, spread: 52 },
    CH: { champ: 95, second: 90, fourth: 84, bottom: 25, spread: 55 } };
  const R = real[DIV];

  console.log(DIV + ', ' + n + ' clubs, ' + out.runs.length + ' seasons, world seed ' + SEED + '\n');
  console.log('                    measured    real');
  const line = (label, v, r) => console.log('  ' + label.padEnd(18)
    + v.toFixed(1).padStart(8) + (r != null ? String(r).padStart(8) : ''));
  line('champion', at(0), R && R.champ);
  line('2nd', at(1), R && R.second);
  line('4th', at(3), R && R.fourth);
  line('mid-table', at(Math.floor(n / 2)));
  line('bottom club', at(n - 1), R && R.bottom);
  line('top-to-bottom', at(0) - at(n - 1), R && R.spread);
  line('goals a game', avg((r) => r.gpg), 2.8);
  console.log('\n  champion\'s record  '
    + avg((r) => r.champW).toFixed(1) + 'W '
    + avg((r) => r.champD).toFixed(1) + 'D '
    + avg((r) => r.champL).toFixed(1) + 'L');
  console.log('  champion was the    #' + avg((r) => r.strengthRank).toFixed(1)
    + ' strongest squad   (real football: about #2)');
  console.log('  table vs strength   ' + avg((r) => r.rho).toFixed(1)
    + ' places out on average   (real football: about 3)');
  const even = out.duels['evenly matched'];
  if (even) {
    const t = even.w + even.d + even.l;
    console.log('\n  evenly matched sides, ' + t + ' matches');
    console.log('    home wins  ' + Math.round(even.w / t * 100) + '%   (real 45%)');
    console.log('    draws      ' + Math.round(even.d / t * 100) + '%   (real 24%)');
    console.log('    away wins  ' + Math.round(even.l / t * 100) + '%   (real 31%)');
  }
  console.log('\n  head to head, 40 matches each (W/D/L and goals are the HOME side\'s)');
  Object.entries(out.duels).forEach(([k, v]) => {
    console.log('    ' + k.padEnd(21) + v.w + 'W ' + v.d + 'D ' + v.l + 'L'
      + '   ' + v.gf.toFixed(2) + '-' + v.ga.toFixed(2)
      + '   squads ' + v.hi + ' v ' + v.lo);
  });
  console.log('\n  champions: ' + out.runs.map((r) => r.champ + ' ' + r.pts[0]).join(', '));
  console.log('\n  squad strength against points, last season');
  console.log('   #  club                        squad   pts');
  out.dump.forEach((d) => console.log('  ' + String(d.rank).padStart(2) + '  '
    + d.club.padEnd(26) + String(d.str).padStart(6) + String(d.pts).padStart(6)));
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
