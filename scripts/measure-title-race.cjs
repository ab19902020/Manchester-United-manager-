#!/usr/bin/env node
/* eslint-disable */
/* How many points does it take to win the league?
 *
 *   node scripts/measure-title-race.cjs [seasons] [division]
 *
 * A whole season of a division, played with the game's own quickSim and
 * nothing else -- no days advancing, no transfers, no cups -- so a
 * season takes seconds rather than minutes and a tuning change can be
 * judged straight away. The world and the match stream are both seeded,
 * so the same arguments produce the same football every time; two runs
 * of this script can be compared to each other, which before they could
 * not be.
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
/* A FIFTH ARGUMENT: overrides for SPREAD, as JSON, e.g.
     node scripts/measure-title-race.cjs 8 PL 20260821 '{"chanceK":1.7}'
   sweep-balance.cjs chooses settings against measured fixture
   probabilities, which is precise but deliberately leaves out
   everything a season does to a squad across its length — fatigue,
   injuries, suspensions, a run of form. Those are exactly what this rig
   has and that one does not, and comparing the two says the played
   season spreads wider at both ends. So a setting is not accepted until
   it has been played, and it can be played here without editing the
   game. */
const BAL = process.argv[5] ? JSON.parse(process.argv[5]) : null;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ seasons, div, seed, bal }) => {
    /* HOW LONG BETWEEN MATCHDAYS, IN DAYS OF RECOVERY. This rig has
       always assumed three, which is the congested end of a real
       calendar: 38 league matches across a nine-month season average
       nearer seven days apart even allowing for cup ties. It matters
       more than it looks. Played with rested squads the engine finishes
       4.4% of matches goalless and scores 2.92 a game; played through a
       season on three days' rest it finishes 11% goalless and scores
       2.7. That difference is fatigue, so a rig that gets the schedule
       wrong reports the game's scoring and its draw rate wrong, and
       both were being read as faults in the match engine. */
    let REST = 3;
    if (bal) {
      /* the day-form range is not part of SPREAD — it is a pair of
         top-level lets — but it is the other half of the same question,
         so the override argument takes it under the same names */
      if (bal.REST != null) { REST = bal.REST; delete bal.REST; }
      if (bal.DAY_LO != null) { DAY_LO = bal.DAY_LO; delete bal.DAY_LO; }
      if (bal.DAY_RANGE != null) { DAY_RANGE = bal.DAY_RANGE; delete bal.DAY_RANGE; }
      Object.assign(SPREAD, bal);
    }
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
    /* the duels are seeded too, on a stream of their own, so the head
       to heads are repeatable without borrowing the seasons' numbers */
    Math.random = window.RBSWorldSeed.mulberry32((seed ^ 0x5f37) >>> 0);
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
      /* THE SAME SEASON EVERY RUN, not just the same world. MatchSim
         calls Math.random for the possession contest, every gate, every
         shot and every save, so two runs of identical code play
         different football: this rig, run twice on this seed with
         nothing changed, reported champions on 84.7 and on 79.7. Four
         seasons carry roughly five points of noise on a champion's
         total, which is bigger than most changes worth making, and any
         before/after taken as two separate runs of this script was
         measuring that noise as much as the change. Seeding the match
         stream makes a run repeatable and a comparison real. */
      Math.random = window.RBSWorldSeed.mulberry32((seed + 1013 * s) >>> 0);
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
      /* EVERY LEAGUE MATCH, NOT A SELECTED PAIR OF THEM. The duels above
         ask about two named clubs; this asks about the division. Real
         English football splits 45 home wins, 24 draws and 31 away wins
         in every hundred league matches, and the scoreline histogram
         says whether the goals are spread the way football spreads them
         or bunched into 1-1s. A league can arrive at the right champion
         with entirely the wrong football underneath it. */
      const split = { h: 0, d: 0, a: 0, hg: 0, ag: 0, hh: 0, aa: 0, ha: 0 };
      const lines = {};
      /* WHAT A SEASON LEAVES ON A SQUAD. Reset the squads before every
         match and this engine draws 25.2% of them and finishes 4.4%
         goalless; play a season and it draws 27.3% and finishes 9.6%
         goalless. The difference is not the match engine, it is what
         the players are carrying by the time they take the field, so
         measure that against real football: a Premier League squad has
         about three or four men unavailable at a time. */
      const wear = { n: 0, out: 0, cond: 0, sharp: 0, morale: 0, men: 0 };
      rounds.forEach((round) => {
        mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
          if (!p.injury) p.cond = Math.min(100, p.cond + 6.1 * REST);
        }));
        mem.forEach((i) => {
          const ps = G.clubs[i].players || [];
          wear.n += 1;
          wear.out += ps.filter((p) => p.injury).length;
          ps.forEach((p) => {
            if (p.injury) return;
            wear.men += 1; wear.cond += p.cond;
            wear.sharp += p.sharp; wear.morale += p.morale;
          });
        });
        round.forEach(([hi, ai]) => {
          const fix = { h: hi, a: ai, div, sc: [], hs: 0, as: 0, r: 0,
            day: 40 + (rounds.indexOf(round) * 7) % 260, played: false };
          if (typeof buildContext === 'function') buildContext(fix);
          quickSim(fix);
          const H = row[hi], A = row[ai];
          H.p += 1; A.p += 1;
          H.gf += fix.hs; H.ga += fix.as; A.gf += fix.as; A.ga += fix.hs;
          if (fix.hs > fix.as) { H.w += 1; A.l += 1; H.pts += 3; split.h += 1; }
          else if (fix.hs < fix.as) { A.w += 1; H.l += 1; A.pts += 3; split.a += 1; }
          else { H.d += 1; A.d += 1; H.pts += 1; A.pts += 1; split.d += 1; }
          /* HOW THE GOALS SPLIT BETWEEN THE TWO ENDS. Real football
             scores about 1.53 at home and 1.27 away out of its 2.8, and
             that gap is a large part of why only 24% of matches finish
             level: two unequal averages produce fewer identical scores
             than two equal ones. A game whose home and away sides score
             alike will draw more than football does however its win
             percentages are arranged. */
          split.hg += fix.hs; split.ag += fix.as;
          /* AND HOW SPREAD OUT EACH SIDE'S GOALS ARE. Draws are
             P(home - away = 0), so they are set by the variance of the
             difference: Var(H) + Var(A) - 2Cov. If each side's goals
             are under-dispersed -- more predictable than Poisson --
             both scores cluster near their means, the means are close
             together, and the two land on the same number far too
             often. Football's per-side variance over mean is about 1. */
          split.hh += fix.hs * fix.hs; split.aa += fix.as * fix.as;
          split.ha += fix.hs * fix.as;
          const key = Math.min(fix.hs, 5) + '-' + Math.min(fix.as, 5);
          lines[key] = (lines[key] || 0) + 1;
        });
      });

      const table = mem.map((i) => row[i]).sort((x, y) => y.pts - x.pts
        || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
      const goals = table.reduce((t, r) => t + r.gf, 0);
      const games = table.reduce((t, r) => t + r.p, 0) / 2;
      runs.push({
        split, lines,
        /* WHAT BEING GOOD IS WORTH, which is the number the draw rate
           is downstream of. A real champion scores about 1.70 times its
           division's average and concedes about 0.62 times it; the club
           that finishes bottom is close to the mirror. If the two ends
           of the league sit nearer the middle than that, every matchup
           is nearer even than football's and near-even matches draw. */
        spread: (() => {
          const byI = {};
          table.forEach((r) => { byI[r.i] = r; });
          const totG = table.reduce((t, r) => t + r.gf, 0);
          const totP = table.reduce((t, r) => t + r.p, 0);
          const mean = totP ? totG / totP : 1;
          const at = (ci) => {
            const r = byI[ci];
            if (!r || !r.p || !mean) return null;
            return { gf: (r.gf / r.p) / mean, ga: (r.ga / r.p) / mean };
          };
          return { top: at(byStrength[0]), bot: at(byStrength[byStrength.length - 1]) };
        })(),
        wear: { out: wear.out / wear.n, cond: wear.cond / wear.men,
          sharp: wear.sharp / wear.men, morale: wear.morale / wear.men },
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
  }, { seasons: SEASONS, div: DIV, seed: SEED, bal: BAL });

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
  /* the division as a whole, across every league match played */
  const S = out.runs.reduce((t, r) => ({ h: t.h + r.split.h, d: t.d + r.split.d, a: t.a + r.split.a,
    hg: t.hg + r.split.hg, ag: t.ag + r.split.ag, hh: t.hh + r.split.hh,
    aa: t.aa + r.split.aa, ha: t.ha + r.split.ha }),
  { h: 0, d: 0, a: 0, hg: 0, ag: 0, hh: 0, aa: 0, ha: 0 });
  const St = S.h + S.d + S.a;
  if (St) {
    console.log('\n  every league match, ' + St + ' of them');
    console.log('    home wins  ' + (S.h / St * 100).toFixed(1) + '%   (real 45%)');
    console.log('    draws      ' + (S.d / St * 100).toFixed(1) + '%   (real 24%)');
    console.log('    away wins  ' + (S.a / St * 100).toFixed(1) + '%   (real 31%)');
    console.log('    goals      ' + (S.hg / St).toFixed(2) + ' at home, '
      + (S.ag / St).toFixed(2) + ' away   (real 1.53 and 1.27)');
    /* what an independent-Poisson model would draw at those two means,
       which is the floor a low-scoring sport is arguing with */
    const pois = (m, n) => {
      let p = 0;
      for (let k = 0; k < 12; k += 1) {
        const f = (x) => (x <= 1 ? 1 : x * f(x - 1));
        p += (Math.exp(-m) * (m ** k) / f(k)) * (Math.exp(-n) * (n ** k) / f(k));
      }
      return p;
    };
    const mh = S.hg / St, ma = S.ag / St;
    const vh = S.hh / St - mh * mh, va = S.aa / St - ma * ma;
    const cov = S.ha / St - mh * ma;
    console.log('    spread     ' + (vh / mh).toFixed(2) + ' at home and '
      + (va / ma).toFixed(2) + ' away, variance over mean   (football about 1.00)');
    console.log('    the goal difference varies by ' + (vh + va - 2 * cov).toFixed(2)
      + '; Poisson on these means would give ' + (mh + ma).toFixed(2)
      + '   (lower means more draws)');
    console.log('    if those two were Poisson it would draw '
      + (pois(S.hg / St, S.ag / St) * 100).toFixed(1) + '% of them');
    const L = {};
    out.runs.forEach((r) => Object.entries(r.lines)
      .forEach(([k, v]) => { L[k] = (L[k] || 0) + v; }));
    /* the ten commonest scorelines. Real English football, in order:
       1-0, 2-1, 1-1, 0-0, 2-0, 0-1, 1-2, 3-1, 3-0, 2-2 — roughly 10, 9,
       9, 8, 8, 6, 5, 4, 4, 4 in every hundred. If a game draws too many
       matches, this says whether that is 0-0s or 1-1s. */
    const top = Object.entries(L).sort((x, y) => y[1] - x[1]).slice(0, 10);
    console.log('    commonest scorelines   ' + top
      .map(([k, v]) => k + ' ' + (v / St * 100).toFixed(1) + '%').join('   '));

    /* HOW OFTEN A SIDE FAILS TO SCORE AT ALL, against how often two
       independent Poisson sides on the same means would.
       -----------------------------------------------------------------
       This is the line that found the draw problem. Every constant in
       SPREAD was swept and none of them moved the draw rate off 28%, and
       the reason is that the excess is not spread across the drawn
       scorelines at all: 1-1 measures right, 2-2 measures right, and the
       whole of it is 0-0. A goalless game is two blanks in the same
       match, so the question is not "why so many draws" but "why do so
       many sides fail to score", and that is a different fault with a
       different fix. */
    let blanks = 0, hb = 0, ab = 0;
    Object.entries(L).forEach(([k, v]) => {
      const [h, a] = k.split('-').map(Number);
      if (h === 0) { blanks += v; hb += v; }
      if (a === 0) { blanks += v; ab += v; }
    });
    const p0 = (m) => Math.exp(-m);
    console.log('    a side fails to score in ' + (blanks / (St * 2) * 100).toFixed(1)
      + '% of team-innings   (Poisson on these means: '
      + ((p0(mh) + p0(ma)) / 2 * 100).toFixed(1) + '%)');
    console.log('    goalless matches ' + ((L['0-0'] || 0) / St * 100).toFixed(1)
      + '%   (Poisson would give ' + (p0(mh) * p0(ma) * 100).toFixed(1)
      + '%, real football about 8%)');
    void hb; void ab;
  }
  const W = out.runs.reduce((t, r) => ({ out: t.out + r.wear.out, cond: t.cond + r.wear.cond,
    sharp: t.sharp + r.wear.sharp, morale: t.morale + r.wear.morale }),
  { out: 0, cond: 0, sharp: 0, morale: 0 });
  const wn = out.runs.length || 1;
  console.log('\n  what a club carries on an average matchday');
  console.log('    unavailable  ' + (W.out / wn).toFixed(1)
    + ' players   (real football: about 3 or 4)');
  console.log('    condition    ' + (W.cond / wn).toFixed(1) + '%');
  console.log('    sharpness    ' + (W.sharp / wn).toFixed(1) + '%');
  console.log('    morale       ' + (W.morale / wn).toFixed(1) + '%');
  /* the two ends of the league, against what real football gives them */
  const sp = out.runs.map((r) => r.spread).filter((x) => x && x.top && x.bot);
  if (sp.length) {
    const m = (f) => sp.reduce((t, x) => t + f(x), 0) / sp.length;
    console.log('\n  what being good is worth, as a multiple of the division average');
    console.log('    best squad    ' + m((x) => x.top.gf).toFixed(2) + ' scored, '
      + m((x) => x.top.ga).toFixed(2) + ' conceded   (real champion 1.70 and 0.62)');
    console.log('    worst squad   ' + m((x) => x.bot.gf).toFixed(2) + ' scored, '
      + m((x) => x.bot.ga).toFixed(2) + ' conceded   (real bottom 0.62 and 1.70)');
  }
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
