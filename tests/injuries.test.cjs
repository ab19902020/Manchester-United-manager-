const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Reported: five injuries in the first four matches. Reproduced exactly —
 * two in matches, three in training — with 19 across the season. The
 * season total was close to a real Premier League squad's; the shape was
 * not, because nothing in the model knew the treatment room was already
 * full. After: 10, 10 and 11 across three seasons, and 1, 2 and 1 in the
 * first four matches.
 *
 * Asserted here as a rate and a shape rather than as those numbers.
 */

test('a club that has just lost somebody is safer for a while', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const api = window.RBSInjuries;
    const c = G.clubs[G.my];
    const p = c.players.find(x => !x.injury && !x.loan);
    delete c._rbsInjDay;
    const normal = injRisk(p, c, 'match');
    c._rbsInjDay = G.day;
    const justAfter = injRisk(p, c, 'match');
    c._rbsInjDay = G.day - Math.floor(api.AFTERMATH_DAYS / 2);
    const halfway = injRisk(p, c, 'match');
    c._rbsInjDay = G.day - api.AFTERMATH_DAYS - 1;
    const longAfter = injRisk(p, c, 'match');
    delete c._rbsInjDay;
    return {normal, justAfter, halfway, longAfter};
  })()`);

  assert.ok(run.normal > 0, 'a fit player still carries some risk');
  assert.ok(run.justAfter < run.normal * 0.75,
    `the day after losing somebody the club should be clearly safer ` +
    `(${run.justAfter} vs ${run.normal})`);
  assert.ok(run.halfway > run.justAfter && run.halfway < run.normal,
    'and the cover should tail off rather than switch off');
  assert.ok(Math.abs(run.longAfter - run.normal) < run.normal * 0.001,
    'a fortnight later it should be back to normal');
});

test('a season does not fill the treatment room', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  /* SEEDED, AND HERE IS WHY THE BOUNDS ALONE WERE NEVER GOING TO HOLD.
     A season is fifty-five matches of independent rolls, so the count
     that comes out has a long tail at both ends. Measured across six
     seeds, the same code produced:

         seed 101   7      seed 404   4
         seed 202   5      seed 505   8
         seed 303   9      seed 606  17

     min 4, max 17, mean 8.3 — against assertions of 3 and 16. Both ends
     are reachable by chance, and this test duly failed on the ceiling in
     one run and the floor in another without a line of code changing
     between them. No threshold survives that, which is what Claude
     flagged when he handed the number over.

     So the season runs on a fixed stream. The bounds still say what the
     design says — not five in the first four, not a treatment room full,
     not a season with nobody hurt — but they are now measuring the
     game rather than the dice. If this ever fails, something really did
     change, and re-measuring across seeds is the way to reset it. */
  const run = game.eval(`RBSWorldSeed.run(101, function(){
    let match = 0, train = 0, early = 0;
    const real = window.applyInjury;
    window.applyInjury = function(p, c, inTraining) {
      const r = real.apply(this, arguments);
      if (c && c.i === G.my && r) { if (inTraining) train++; else match++; }
      return r;
    };
    let played = 0, guard = 0;
    while (played < 4 && guard++ < 250) {
      const um = (typeof userMatchOn==='function') ? userMatchOn(G.day) : null;
      if (um) { if (um.cup) resolveTie(um); else quickSim(um); played++; }
      simRestOfDay(); dailyTickCore(); G.day++;
    }
    early = match + train;
    let g2 = 0;
    while (G.fixtures.some(f => !f.played) && g2++ < 420) {
      const um = (typeof userMatchOn==='function') ? userMatchOn(G.day) : null;
      if (um) { if (um.cup) resolveTie(um); else quickSim(um); }
      simRestOfDay(); dailyTickCore(); G.day++;
    }
    window.applyInjury = real;
    const apps = G.fixtures.filter(f => f.played && (f.h===G.my||f.a===G.my)).length;
    return {early, total: match+train, apps, squad: G.clubs[G.my].players.length};
  })`);

  assert.ok(run.apps > 30, `the season should have been played out (${run.apps} matches)`);
  // the reported complaint, as a bound: five in the first four is out
  assert.ok(run.early <= 3,
    `too many injuries in the first four matches (${run.early})`);
  // and a season should still have some — this is football, not a spreadsheet
  assert.ok(run.total >= 3,
    `a whole season with almost no injuries is not right either (${run.total})`);
  assert.ok(run.total <= 16,
    `a ${run.squad}-man squad picked up ${run.total} injuries in a season`);
});
