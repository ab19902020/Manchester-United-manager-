const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Reported from a real save: six wins on the spin, and the room asked
 * whether the club was going through a blip. The rule guards were fine —
 * the problem was that half the pool was context-free filler and the pick
 * was uniform across every line, so a topic with ten interchangeable
 * phrasings beat the thing actually happening to you ten to one.
 */
test('the press room knows what match this is and asks about it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const room = game.eval(`(function(){
    // play real matches — the competitive questions are correctly suppressed
    // until something has actually been played
    let d = 0;
    while (gamesPlayed(G.my) < 8 && d++ < 400) {
      const um = fixturesOn(G.day).find(f => !f.played && (f.h === G.my || f.a === G.my));
      if (um) { quickSim(um); finishDayAfterMatch(); }
      else { simRestOfDay(); dailyTickCore(); G.day++; checkSeasonEnd(); }
    }
    const my = G.clubs[G.my];
    my.recent = [];
    for (let i = 0; i < 6; i++) my.recent.unshift({r: 'W', gf: 2, ga: 0, day: G.day - (6-i)*7, cup: false});

    const nf = (function(){ for (let x = G.day; x < G.day + 120; x++) {
      const f = fixturesOn(x).find(y => !y.played && (y.h === G.my || y.a === G.my)); if (f) return f; } return null; })();
    G.pressCtx = {kind: 'pre', oppI: nf ? (nf.h === G.my ? nf.a : nf.h) : 1, q: 0, _asked: []};
    G.pressSeen = [];

    const F = pqFacts();
    const bank = pressBank();
    const ids = bank.map(q => String(q.id).split('#')[0]);
    const share = (id) => ids.filter(x => x === id).length / ids.length;
    return {
      facts: {
        comp: F.comp, divName: F.divName, matchday: F.matchday, total: F.totalMatchdays,
        phase: F.phase, xi: (F.xi || []).length, formation: F.formation,
      },
      streakShare: share('streak-w'),
      blipEligible: ids.indexOf('form-poor') >= 0,
      fillerShare: ids.filter(x => x.indexOf('open-') === 0).length / ids.length,
      lines: ids.length,
    };
  })()`);

  // 1. the room knows which match this is
  assert.ok(room.facts.comp, 'it knows which competition the match is in');
  assert.ok(room.facts.divName, 'and which division you play in');
  assert.ok(room.facts.matchday > 0 && room.facts.total > 0,
    `and how far into the season it is (got ${room.facts.matchday}/${room.facts.total})`);
  assert.ok(['opening', 'early', 'midwinter', 'runin', 'final-day'].includes(room.facts.phase),
    `and what part of the season that makes it (got ${room.facts.phase})`);
  assert.equal(room.facts.xi, 11, 'and which eleven you picked');
  assert.ok(room.facts.formation, 'and what shape you picked them in');

  // 2. it does not ask about a bad run during a good one
  assert.equal(room.blipEligible, false, 'nobody asks about a blip during a six-game winning run');

  // 3. and the run is what it wants to talk about
  assert.ok(room.streakShare > 0.05,
    `a six-win streak should dominate the questioning, got ${(room.streakShare * 100).toFixed(1)}%`);

  // 4. filler is variety, not the majority. It was 51.5%.
  assert.ok(room.fillerShare < 0.32,
    `context-free filler should be a minority of the room, got ${(room.fillerShare * 100).toFixed(1)}%`);
});
