#!/usr/bin/env node
/* eslint-disable */
/* Which balance numbers produce a real league table?
 *
 *   node scripts/sweep-balance.cjs [repeats-per-fixture]
 *
 * measure-title-race.cjs answers "what does the table look like now".
 * This answers "what would it look like if". It rebuilds the seeded
 * world for each candidate setting of SPREAD — the clamps and the
 * compression that decide how much of the gap between two squads
 * survives into the result — measures what that setting does to
 * football, and prints the candidates side by side.
 *
 * It does not play seasons. Playing seasons is how the first two runs
 * of this script wasted an hour: three seasons a candidate carries
 * about five points of noise on a champion's total, the identical
 * shipped settings returned 84.7 and then 79.7, and every difference
 * worth arguing about is smaller than that. Seeding the match stream
 * fixes repeatability but not comparability — the moment a parameter
 * changes one gate, every later draw shifts and the two seasons are
 * independent again.
 *
 * So it measures the fixture rather than the season. Every one of the
 * 380 fixtures is played REPEATS times and its win/draw/loss
 * probabilities are counted; the table is then drawn three thousand
 * times from those probabilities in arithmetic, which costs nothing and
 * removes the noise instead of averaging over it. The last row of the
 * report is the control measured a second time, and the report says in
 * words whether it reproduced.
 *
 * The reference column is real English football. The champion's average
 * over the thirty Premier League seasons before 2025-26 is 87.6 and
 * second is 80.5 (Opta/premierleague.com); fourth has averaged about 70
 * over the last decade; the club that finishes bottom has averaged
 * about 21 over the last ten seasons — 17, 24, 31, 16, 21, 23, 22, 25,
 * 16, 12 — which is NOT the 24 an earlier version of the title-race rig
 * carried, and that wrong reference is why the bottom of this game's
 * table was once reported as too weak when it was already right.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const SEASONS = +(process.argv[2] || 3);
const DIV = process.argv[3] || 'PL';
const SEED = +(process.argv[4] || 20260821);

/* THE CANDIDATES. The first row is always the control — an empty `bal`
   leaves every shipped value alone — and every other row is one stated
   difference from it.

   NOTHING IS CARRIED FORWARD FROM THE FIRST TWO RUNS OF THIS SCRIPT.
   They played three seasons a candidate and read the champion off the
   end of them, which turned out to be a measurement of the weather:
   the identical shipped settings returned 84.7 and then 79.7. Whatever
   those runs appeared to show about ceilings, floors or compression
   was inside their own noise, so the candidates below are the same
   questions asked again of a rig that can answer them. */
/* A FACTORIAL, NOT A LIST OF HUNCHES.
   The scattergun sweeps found the shape of the problem — the clamps do
   nothing the goal-rate controller does not undo, and the slopes do
   something — but they could not rank their own candidates, because
   REPEATS matches per fixture leaves each fixture's probability with a
   standard error of about 0.5/sqrt(REPEATS). At four repeats that is
   0.25 a fixture, and a club's expected total sums 38 of them: roughly
   two points of noise per club, which is why "steeper shot" read
   better at .60 than at the harder .78. Drawing the table three
   thousand times does not help — every draw reuses the same estimated
   probabilities, so it removes the season's noise and not the
   measurement's.

   So: two changes, crossed, and enough repeats to tell them apart.
   `shotK` is how much of a finisher's advantage over a goalkeeper
   survives into the ball going in; `compress` is how much of the gap
   between two squads survives into the gates at all. If they add, the
   pair is worth more than either. */
/* WHAT THE DIAGNOSTIC SAID. Measured as a multiple of the division's
   average, the shipped game gives its best squad 1.27 goals for and
   0.87 against where real football gives a champion 1.70 and 0.62. Its
   worst squad is close to right going forward (0.64 against 0.62) and
   far too hard to score against (1.30 against 1.70). The game models
   being bad; it does not model being good. That is the missing six
   points, and it is why tuning the points directly went nowhere.

   Steepening the gates fixes most of the shape — 1.44 and 0.72 — but
   costs volume, because the good side's extra is capped by the ceiling
   while the poor side's loss is not: 2.5 goals a game against a target
   of 2.8, with the controller already at zero trim and no way to put a
   goal back. So the slope and the volume have to move together, which
   is what the gate multipliers are for. */
const STEEP = { buildK: 1.8, chanceK: 1.7, buildHi: .80, chanceHi: .65 };
const CANDIDATES = [
  { name: 'shipped', bal: {} },
  { name: 'steep, ceilings only', bal: Object.assign({}, STEEP) },
  { name: 'steep + volume', bal: Object.assign({ chanceMul: .80, buildMul: 1.30 }, STEEP) },
  { name: 'steep + more volume', bal: Object.assign({ chanceMul: .90, buildMul: 1.38 }, STEEP) },
  { name: 'steep + volume + floors', bal: Object.assign({ chanceMul: .80, buildMul: 1.30, buildLo: .52, chanceLo: .36 }, STEEP) },
  /* THE RIG PROVING ITSELF. This is the control again, with nothing
     changed, and it must reproduce the control's row exactly. If it
     does not, something is carrying between candidates and no other
     row in the table means anything. */
  { name: 'shipped (repeat)', bal: {} },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (/^\[sweep\]/.test(m.text())) console.log(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ seasons, div, seed, cands }) => {
    const clear = () => ['startScreen', 'frontScreen', 'introScreen', 'splash']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    clear();
    window.RBSWorldSeed.build(seed, 'MUN');
    clear();

    const mem = G.clubs.filter((c) => c.league === div).map((c) => c.i);
    const freshen = () => mem.forEach((i) => (G.clubs[i].players || []).forEach((p) => {
      p.cond = 100; p.sharp = 88; p.injury = null; p.susp = 0; p.morale = 70;
      if (p.stats) { p.stats.goals = 0; p.stats.assists = 0; p.stats.apps = 0; }
      if (p.form) p.form.length = 0;
    }));

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
    freshen();
    const byStrength = mem.slice().sort((x, y) => strength(y) - strength(x));

    /* the fixture list is built once and every candidate plays it */
    const rounds = rrPairs(mem);

    const shippedBal = Object.assign({}, SPREAD);
    const shippedDay = { lo: DAY_LO, range: DAY_RANGE };

    /* EVERY CANDIDATE PLAYS THE SAME SEASON, NOT JUST THE SAME FIXTURES.
       The world is seeded but the match engine is not: MatchSim calls
       Math.random for the possession contest, every gate, every shot
       and every save. Three seasons of that is about five points of
       noise on a champion's total, which is larger than any difference
       worth tuning — the first two sweeps ran the identical shipped
       code twice and got 84.7 and 79.7, and a reader comparing rows
       across those two runs would have concluded almost anything.

       So the whole match stream is seeded here, and season s uses the
       same seed for every candidate. Each candidate then plays the
       literal same season — same coin flips, same injuries, same
       weather — and a difference in the table is the parameter and
       nothing else. Paired like this, three seasons say more than
       thirty unpaired ones. */
    const mul = window.RBSWorldSeed.mulberry32;
    const trueRandom = Math.random;

    /* =================================================================
       WHY THIS DOES NOT PLAY SEASONS ANY MORE
       -----------------------------------------------------------------
       Seeding the match stream made a run repeatable, which it badly
       needed to be. What it could not do is make two DIFFERENT settings
       comparable. The moment one parameter changes a single gate, that
       draw is consumed differently, every draw after it shifts, and the
       two seasons are independent again. The pairing only survives
       while the candidates behave identically, which is exactly when
       there is nothing to measure. Three seasons of the shipped
       settings came out 85, 83 and 79 — six points of spread with
       nothing changed at all — so no three-season comparison can see a
       difference smaller than about five points, and the differences
       worth arguing about are smaller than that.

       So measure the thing that is actually being changed. A league
       table is not a fact about football, it is arithmetic on 380
       results, and each of those results is a draw from one fixture's
       win/draw/loss probabilities. Those probabilities are what the
       parameters move, and they can be measured as precisely as you are
       willing to pay for: play every fixture REPS times and count.

       Then the table follows without any further football. Draw three
       thousand seasons from those probabilities in arithmetic — which
       costs nothing — and read off what first, fourth and last average.
       That average is the same quantity a played season estimates, with
       the noise of a played season removed rather than averaged over.

       What this deliberately leaves out is everything a season does to
       a squad across its length: fatigue, injuries, suspensions, a run
       of form. Those matter and they are not free — so the setting this
       chooses is checked afterwards against real played seasons in
       measure-title-race.cjs before it goes anywhere near the game.
       ================================================================= */
    const one = (hi, ai, ri) => {
      /* every repeat starts from the same rested squads, so what is
         being measured is the fixture and not the fixture plus whatever
         the previous repeat did to the players */
      freshen();
      const fix = { h: hi, a: ai, div, sc: [], hs: 0, as: 0, r: 0,
        day: 40 + (ri * 7) % 260, played: false };
      buildContext(fix);
      quickSim(fix);
      return fix;
    };

    const playFixtures = (streamSeed, reps) => {
      Math.random = mul(streamSeed >>> 0);
      /* LET THE CONTROLLER SETTLE, THEN HOLD IT STILL. The goal-rate
         controller re-solves its trim every 120 league matches, so a
         measurement of six thousand matches is fifty re-solves long and
         the fixtures played early are not judged by the same standard
         as the ones played late. Worse, how far it has drifted depends
         on how many repeats were asked for, which made the four-repeat
         and sixteen-repeat runs answer different questions.

         So: a warm-up long enough for it to converge on this candidate's
         football, and then its counter is pushed far enough below the
         window that it cannot re-solve again while the measurement
         runs. What gets measured is the steady state, which is the only
         state a season is ever actually played in. */
      for (let k = 0; k < 700; k += 1) {
        const r = rounds[k % rounds.length];
        const f = r[k % r.length];
        one(f[0], f[1], k % rounds.length);
      }
      goalCal(div).n = -1e9;

      const pr = [];   // per ordered fixture: win/draw/loss and goals
      let goals = 0, played = 0;
      const gf = {}, ga = {};
      mem.forEach((i) => { gf[i] = 0; ga[i] = 0; });
      rounds.forEach((round, ri) => {
        round.forEach(([hi, ai]) => {
          let w = 0, d = 0, l = 0;
          for (let k = 0; k < reps; k += 1) {
            const fix = one(hi, ai, ri);
            goals += fix.hs + fix.as; played += 1;
            gf[hi] += fix.hs; ga[hi] += fix.as;
            gf[ai] += fix.as; ga[ai] += fix.hs;
            if (fix.hs > fix.as) w += 1; else if (fix.hs === fix.as) d += 1; else l += 1;
          }
          pr.push({ h: hi, a: ai, w: w / reps, d: d / reps, l: l / reps });
        });
      });
      /* WHAT A LEAGUE TABLE IS MADE OF. Points are downstream of goal
         difference, and goal difference is where real football gives
         unambiguous targets: over the last decade a Premier League
         champion has scored about 1.7 times the division's average and
         conceded about 0.6 times it, and the club finishing bottom has
         been the mirror of that. If the game's best squad is nearer the
         average than that, no amount of tuning the points will help,
         because the matches themselves are too close. */
      const per = (i) => ({ gf: gf[i] / (38 * reps), ga: ga[i] / (38 * reps) });
      const avg = goals / played / 2;
      const top = per(byStrength[0]), bot = per(byStrength[byStrength.length - 1]);
      return { pr, gpg: goals / played,
        topGf: top.gf / avg, topGa: top.ga / avg,
        botGf: bot.gf / avg, botGa: bot.ga / avg };
    };

    /* the table those probabilities imply, drawn many times over */
    const tableFrom = (pr, draws, tableSeed) => {
      const rnd = mul(tableSeed >>> 0);
      const n = mem.length;
      const slot = {};
      mem.forEach((i, ix) => { slot[i] = ix; });
      const sumAt = new Float64Array(n);
      const champRank = [];
      let rhoSum = 0;
      let cw = 0, cd = 0, cl = 0;
      for (let s = 0; s < draws; s += 1) {
        const pts = new Float64Array(n);
        const W = new Int32Array(n), D = new Int32Array(n), L = new Int32Array(n);
        for (let f = 0; f < pr.length; f += 1) {
          const r = rnd(), x = pr[f];
          if (r < x.w) { pts[slot[x.h]] += 3; W[slot[x.h]] += 1; L[slot[x.a]] += 1; }
          else if (r < x.w + x.d) {
            pts[slot[x.h]] += 1; pts[slot[x.a]] += 1;
            D[slot[x.h]] += 1; D[slot[x.a]] += 1;
          } else { pts[slot[x.a]] += 3; W[slot[x.a]] += 1; L[slot[x.h]] += 1; }
        }
        const order = mem.slice().sort((p, q) => pts[slot[q]] - pts[slot[p]]);
        order.forEach((ci, ix) => { sumAt[ix] += pts[slot[ci]]; });
        const top = slot[order[0]];
        cw += W[top]; cd += D[top]; cl += L[top];
        champRank.push(byStrength.indexOf(order[0]) + 1);
        let off = 0;
        order.forEach((ci, ix) => { off += Math.abs(ix - byStrength.indexOf(ci)); });
        rhoSum += off / n;
      }
      return { at: (k) => sumAt[k] / draws,
        W: cw / draws, D: cd / draws, L: cl / draws,
        rank: champRank.reduce((t, v) => t + v, 0) / champRank.length,
        rho: rhoSum / draws };
    };

    const results = [];
    cands.forEach((cand) => {
      /* A CLEAN WORLD FOR EVERY CANDIDATE. Seeding the match stream was
         not enough and the self-check below said so: the control and
         its repeat still played different seasons. Freshening the
         squads does not undo everything a season leaves behind, and the
         one that matters is G.gcal — the goal-rate controller, which
         re-solves its trim every 120 league matches and therefore ends
         each candidate holding a number shaped by that candidate's
         scoring. The next candidate then started from it. Rebuilding
         the world from the same seed puts every candidate back on the
         same squads, the same fixtures and the same untouched trim. */
      Math.random = trueRandom;
      window.RBSWorldSeed.build(seed, 'MUN');
      clear();
      Object.assign(SPREAD, shippedBal, cand.bal || {});
      DAY_LO = (cand.day && cand.day.lo != null) ? cand.day.lo : shippedDay.lo;
      DAY_RANGE = (cand.day && cand.day.range != null) ? cand.day.range : shippedDay.range;
      const m = playFixtures(seed, seasons);
      const { pr, gpg } = m;
      const t = tableFrom(pr, 3000, seed ^ 0x2c9f);
      results.push({
        name: cand.name,
        first: t.at(0), second: t.at(1), fourth: t.at(3),
        mid: t.at(Math.floor(mem.length / 2)),
        seventeenth: t.at(mem.length - 4), last: t.at(mem.length - 1),
        gpg, W: t.W, D: t.D, L: t.L, rank: t.rank, rho: t.rho,
        topGf: m.topGf, topGa: m.topGa, botGf: m.botGf, botGa: m.botGa,
        /* WHY GOALS A GAME BARELY MOVES BETWEEN CANDIDATES. It is held
           there on purpose: the goal-rate controller turns a share of
           goals into saves to hit 2.80. That share is reported here,
           because a controller sitting at zero is a controller out of
           room — it can take goals away and has no way to put one back,
           so a candidate that drives raw scoring under the target
           simply stays under it. */
        trim: goalCal(div).trim,
      });
      console.log('[sweep] ' + cand.name + ' done');
    });
    /* leave the page as we found it */
    Object.assign(SPREAD, shippedBal);
    DAY_LO = shippedDay.lo; DAY_RANGE = shippedDay.range;
    Math.random = trueRandom;
    return { results, clubs: mem.length };
  }, { seasons: SEASONS, div: DIV, seed: SEED, cands: CANDIDATES });

  const REAL = { first: 87.6, second: 80.5, fourth: 70.1, mid: 49, seventeenth: 37.8, last: 20.7, gpg: 2.8 };
  const cols = ['first', 'second', 'fourth', 'mid', 'seventeenth', 'last', 'gpg'];
  const head = ['1st', '2nd', '4th', 'mid', '17th', '20th', 'g/g'];
  console.log('\n' + DIV + ', ' + out.clubs + ' clubs, world seed ' + SEED
    + '\n  every fixture played ' + SEASONS + ' times, the table drawn 3000 times'
    + ' from what those matches measured\n');
  console.log('  ' + 'candidate'.padEnd(24) + head.map((h) => h.padStart(7)).join('')
    + '   champion     best  table');
  console.log('  ' + 'real football'.padEnd(24)
    + cols.map((c) => REAL[c].toFixed(1).padStart(7)).join('')
    + '   27W 6D 5L      #2    ~3');
  out.results.forEach((r) => {
    console.log('  ' + r.name.padEnd(24)
      + cols.map((c) => r[c].toFixed(1).padStart(7)).join('')
      + '   ' + (r.W.toFixed(0) + 'W ' + r.D.toFixed(0) + 'D ' + r.L.toFixed(0) + 'L').padEnd(11)
      + ('#' + r.rank.toFixed(1)).padStart(6) + r.rho.toFixed(1).padStart(6)
      + '  trim ' + r.trim.toFixed(3));
  });

  /* THE MEASUREMENT THAT SAYS WHY. Points are downstream of goal
     difference, and this is the one place real football gives a target
     that is not an average of averages. */
  console.log('\n  scoring and conceding, as a multiple of the division\'s average');
  console.log('  ' + 'candidate'.padEnd(24)
    + 'best squad GF'.padStart(15) + 'GA'.padStart(7)
    + 'worst squad GF'.padStart(17) + 'GA'.padStart(7));
  console.log('  ' + 'real football'.padEnd(24)
    + '1.70'.padStart(15) + '0.62'.padStart(7)
    + '0.62'.padStart(17) + '1.70'.padStart(7));
  out.results.forEach((r) => {
    console.log('  ' + r.name.padEnd(24)
      + r.topGf.toFixed(2).padStart(15) + r.topGa.toFixed(2).padStart(7)
      + r.botGf.toFixed(2).padStart(17) + r.botGa.toFixed(2).padStart(7));
  });
  /* the rig proving itself: the control and its repeat must agree */
  const a = out.results[0], z = out.results[out.results.length - 1];
  if (a && z && /repeat/.test(z.name)) {
    const same = Math.abs(a.first - z.first) < 1e-9 && Math.abs(a.last - z.last) < 1e-9;
    console.log('\n  repeatable: ' + (same
      ? 'yes — the control and its repeat measured the same football'
      : 'NO. ' + a.first.toFixed(2) + '/' + a.last.toFixed(2) + ' against '
        + z.first.toFixed(2) + '/' + z.last.toFixed(2)
        + ' — something carries between candidates and no row above is a comparison'));
  }
  console.log('\npage errors: ' + (errors.length ? errors.slice(0, 2).join(' | ') : 'none'));
  await browser.close();
})();
