const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The play-offs.
 *
 * Written against the structure rather than against any division's
 * numbers, because `PYRAMIDS` is what says how many go up and that is
 * being rebuilt elsewhere. Whatever it says, the rule is the same: one
 * fewer club goes up automatically than before, the four clubs below
 * them play for the last place, and the club that wins it is the club
 * that goes up.
 */

/* Take a career to the end of a league season with every cup settled, so
   the only thing left standing between here and the summer is the
   play-offs. */
const RUN_TO_MAY = `
  G.fixtures.forEach(f => { if (!f.played) quickSim(f); });
  for (let pass = 0; pass < 30; pass += 1) {
    let open = false;
    Object.keys(G.cups || {}).forEach(k => {
      const c = G.cups[k];
      if (!c || c.winner != null || !c.ties.length) return;
      c.ties.forEach(t => { if (!t.played) resolveTie(t); });
      advanceCup(k);
      if (G.cups[k].winner == null) open = true;
    });
    if (!open) break;
  }
  G.day = seasonLastDay();
`;

test('the last promotion place is decided by a play-off, and you play it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    ${RUN_TO_MAY}
    checkSeasonEnd();

    const api = window.RBSPlayOffs;
    const rungs = api.ladders();
    const out = {rungs: rungs.length, divisions: {}};

    rungs.forEach(r => {
      const key = api.KEY(r.lo);
      const cup = (G.cups||{})[key];
      if (!cup) { out.divisions[r.lo] = {missing:true}; return; }
      const table = tableRows(r.lo);
      const placeOf = (ci) => table.findIndex(x => x.i === ci) + 1;
      const legs = cup.ties.slice().sort((a,b) => a.day - b.day || a.tid - b.tid);
      out.divisions[r.lo] = {
        up: r.up,
        wide: !!CUP_DEFS[key].wide,
        size: cup.teams.length,
        name: CUP_DEFS[key].name,
        places: cup.teams.map(placeOf).sort((a,b) => a-b),
        ties: legs.length,
        twoLegged: legs.filter(t => t.leg === 2).length,
        neutralFinalVenue: CUP_DEFS[key].venue,
        // the club that finished higher must host the second leg
        secondLegHosts: legs.filter(t => t.leg === 2)
          .every(t => placeOf(t.h) < placeOf(t.a)),
        firstDay: legs[0].day,
        afterTheLeague: legs[0].day > Math.max.apply(null, G.fixtures.map(f => f.day)),
      };
    });

    // playability: exactly the question advanceDay() asks before it opens
    // the match screen
    const anyKey = api.KEY(rungs[0].lo);
    const tie = G.cups[anyKey].ties.slice().sort((a,b) => a.day - b.day)[0];
    const saved = G.my;
    G.my = tie.h;
    const m = userMatchOn(tie.day);
    const playable = m ? {found:true, cup:m.cup, comp:m.comp, day:m.day, isTheTie: m === tie} : {found:false};
    G.my = saved;

    return Object.assign(out, {playable});
  })()`);

  assert.ok(run.rungs >= 4, 'the English pyramid should have at least four rungs with play-offs');

  Object.keys(run.divisions).forEach((div) => {
    const d = run.divisions[div];
    assert.ok(!d.missing, `${div}: no play-off competition was created`);

    // 1. the right clubs: the ones just below the automatic places. A
    // division sending only one club up automatically runs the wider
    // six-club version, which is what the National League does.
    // (joined rather than deep-compared: these arrays come back from the
    // page's realm, so a strict deep equal fails on the prototype alone)
    const count = d.wide ? 6 : 4;
    assert.equal(d.size, count, `${div}: ${count} clubs should contest the play-offs`);
    const expected = [];
    for (let i = 0; i < count; i += 1) expected.push(d.up + i);
    assert.equal(Array.from(d.places).join(','), expected.join(','),
      `${div}: the play-offs should be between places ${expected.join(', ')}`);
    assert.equal(d.wide, d.up - 1 === 1,
      `${div}: only a division with one automatic promotion runs the six-club version`);

    // 2. the right shape of tie, and a final at a neutral ground
    if (d.wide) {
      // two one-off eliminators; 2nd and 3rd are not in them
      assert.equal(d.ties, 2, `${div}: the eliminator round is two one-off matches`);
      assert.equal(d.twoLegged, 0, `${div}: the six-club version has no second legs`);
    } else {
      assert.equal(d.ties, 4, `${div}: two semi-finals over two legs is four matches`);
      assert.equal(d.twoLegged, 2, `${div}: both semi-finals should have a second leg`);
      assert.ok(d.secondLegHosts,
        `${div}: the club that finished higher should play the second leg at home`);
    }
    assert.match(d.neutralFinalVenue, /\w/, `${div}: the final needs a venue`);

    // 3. after the league has finished, not during it
    assert.ok(d.afterTheLeague, `${div}: the play-offs should start after the last league match`);
  });

  // 4. and the manager plays his own
  assert.ok(run.playable.found, 'a play-off tie should be offered to the manager as a match to play');
  assert.ok(run.playable.isTheTie, 'and it should be that tie, not something else that day');
  assert.match(run.playable.comp, /play-off/i, 'the match screen should know what it is');
});

test('the club that wins the play-off is the club that goes up', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    ${RUN_TO_MAY}
    checkSeasonEnd();

    const api = window.RBSPlayOffs;
    const rungs = api.ladders();
    const keys = rungs.map(r => api.KEY(r.lo));

    // let the play-offs be played
    for (let d = 0; d < 40; d += 1) {
      if (keys.every(k => G.cups[k] && G.cups[k].winner != null)) break;
      simRestOfDay(); dailyTickCore(); G.day++;
    }

    const before = {};
    rungs.forEach(r => {
      const cup = G.cups[api.KEY(r.lo)];
      const table = tableRows(r.lo);
      before[r.lo] = {
        up: r.up,
        winner: cup.winner,
        winnerPlace: table.findIndex(x => x.i === cup.winner) + 1,
        auto: table.slice(0, r.up - 1).map(x => x.i),
        nextInLine: table[r.up - 1] ? table[r.up - 1].i : null,
        hi: r.hi,
      };
    });

    checkSeasonEnd();

    const after = {};
    Object.keys(before).forEach(lo => {
      const b = before[lo];
      after[lo] = {
        winnerWentUp: G.clubs[b.winner].league === b.hi,
        autoWentUp: b.auto.every(i => G.clubs[i].league === b.hi),
        winnerPlace: b.winnerPlace,
        up: b.up,
        // the club that finished in the last automatic place under the old
        // rules must NOT go up unless it won the play-off
        nextInLineWentUp: b.nextInLine != null && G.clubs[b.nextInLine].league === b.hi,
        nextInLineIsWinner: b.nextInLine === b.winner,
        promotedCount: G.clubs.filter(c => c.league === b.hi).length,
      };
    });
    return {closed: G.season > 1, after,
      sizes: ['PL','CH','L1','L2','NL'].map(d => G.clubs.filter(c => c.league === d).length)};
  })()`);

  assert.ok(run.closed, 'the season should close once the play-offs are settled');

  Object.keys(run.after).forEach((div) => {
    const a = run.after[div];
    assert.ok(a.winnerWentUp, `${div}: the play-off winner was not promoted`);
    assert.ok(a.autoWentUp, `${div}: the automatic places were not honoured`);
    // a division with one automatic promotion runs six clubs, not four
    const last = a.up + (a.up - 1 === 1 ? 5 : 3);
    assert.ok(a.winnerPlace >= a.up && a.winnerPlace <= last,
      `${div}: the winner finished ${a.winnerPlace}, outside the play-off places ` +
      `(${a.up}-${last})`);
    if (!a.nextInLineIsWinner) {
      assert.equal(a.nextInLineWentUp, false,
        `${div}: ${a.up}th place went up without winning the play-off`);
    }
  });

  // the pyramid still balances — as many clubs went up as came down
  assert.equal(Array.from(run.sizes).join('/'), '20/24/24/24/24',
    `the divisions changed size: ${Array.from(run.sizes).join('/')}`);
});
