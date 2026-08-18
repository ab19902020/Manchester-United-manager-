const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE MATCH THE SAVE PLAYED, IN A SHAPE EVERY VIEW CAN READ
   ---------------------------------------------------------------------
   "I'm watching text now, and it says it's a corner. If I go to the
    dugout view, it should be a corner ready to be taken there."

   Before any of that can be true the three views have to be reading one
   account of the match, and only one of them could read anything: the
   save wrote English. These tests are about the record itself -- that
   it exists, that it says the same thing the commentary and the stats
   say, and that it is taken from what the game DID rather than from
   what it wrote.
   ===================================================================== */

test('the save writes down what it did, not just what it said',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Timeline');

    /* SEEDED, AND MORE THAN ONE MATCH. The first version of this test
       played whatever fixture came up and passed -- then failed in the
       full run against a match that happened to contain a penalty. A
       stochastic assertion over a single match measures the dice. Six
       consecutive matches on a fixed stream measure the game, and they
       take in the penalties, the VAR overturns and the red cards that
       one match may not have. */
    const out = game.eval(`RBSWorldSeed.run(7731, function(){
    const all=[], byType={};
    let matches=0, finished=0;
    let goalsScored=0, goalsRecorded=0;
    let cornersCounted=0, cornersRecorded=0;
    let shotsCounted=0, shotsRecorded=0, pensRecorded=0;
    let seqInOrder=true, inOrderWithinHalf=true;
    const tlScorers=[], fixScorers=[];

    /* quickSim plays a fixture out and hands back the sim it used. No
       UI, no match screen, and crucially a FRESH fixture every time --
       driving this through ACTIONS.kickoff() re-opened the same fixture
       round after round, so its score accumulated and the test read 53
       goals in six matches. */
    const pool=G.fixtures.filter(f=>!f.played && !f.cup).slice(0,8);
    for(const f of pool){
      const m=quickSim(f);
      matches++; if(m.done) finished++;

      const tl=RBSMatchTimeline.of(m);
      /* ordering is a property of ONE match's record, so it is checked
         per match rather than across the concatenation */
      if(!tl.every((e,i)=>e.seq===i)) seqInOrder=false;
      if(!tl.every((e,i)=>i===0||tl[i-1].half!==e.half||tl[i-1].min<=e.min)) inOrderWithinHalf=false;

      goalsScored+=f.hs+f.as;
      cornersCounted+=m.sides[0].st.cor+m.sides[1].st.cor;
      shotsCounted+=m.sides[0].st.sh+m.sides[1].st.sh;
      goalsRecorded+=tl.filter(e=>e.type==='goal').length;
      cornersRecorded+=tl.filter(e=>e.type==='corner').length;
      shotsRecorded+=tl.filter(e=>e.type==='shot').length;
      pensRecorded+=tl.filter(e=>e.type==='penalty').length;
      for(const e of tl.filter(e=>e.type==='goal')) tlScorers.push(String(e.pid));
      for(const s of f.sc) fixScorers.push(String(s.pid));
      for(const e of tl){ all.push(e); byType[e.type]=(byType[e.type]||0)+1; }
    }

    return {
      matches, finished, total:all.length, byType,
      goalsScored, goalsRecorded,
      cornersCounted, cornersRecorded,
      /* A PENALTY IS A SHOT ON THE STATS SCREEN but it does not go
         through shotEvent -- penaltyEvent counts its own. The honest
         identity is shots plus spot kicks, and asserting shots alone
         passed only because the first fixture it ran on had no penalty
         in it; the full check found one that did. */
      shotsCounted, shotsRecorded, pensRecorded,
      seqInOrder, inOrderWithinHalf,
      tlScorers:tlScorers.join(','), fixScorers:fixScorers.join(','),
      allTimed:all.every(e=>typeof e.min==='number' && e.min>=0 && e.min<=130),
      halvesKnown:all.every(e=>typeof e.half==='string'&&e.half.length>0),
      teamsSane:all.filter(e=>e.team!=null).every(e=>e.team===0||e.team===1),
      goalsNamed:all.filter(e=>e.type==='goal').every(e=>e.pid&&e.name&&typeof e.hs==='number'),
    };
  })`);

    assert.ok(out.matches >= 3, `only ${out.matches} matches were played`);
    assert.equal(out.finished, out.matches, 'a match did not reach full time');
    assert.ok(out.total > 100,
      `${out.matches} matches produced only ${out.total} recorded beats`);

    /* the record and the counters are two accounts of one match */
    assert.equal(out.goalsRecorded, out.goalsScored,
      'the timeline disagrees with the scoreline');
    assert.equal(out.tlScorers, out.fixScorers,
      'the timeline names different scorers than the fixture does');
    assert.equal(out.cornersRecorded, out.cornersCounted,
      'the timeline disagrees with the corner count on the stats screen');
    assert.equal(out.shotsRecorded + out.pensRecorded, out.shotsCounted,
      'the timeline disagrees with the shot count on the stats screen');

    /* and it is usable by something that has to perform it */
    assert.equal(out.allTimed, true, 'a record with no usable minute cannot be performed');
    assert.equal(out.seqInOrder, true, 'the timeline is out of order');
    assert.equal(out.inOrderWithinHalf, true, 'the clock runs backwards inside one half');
    assert.equal(out.halvesKnown, true, 'a record that does not know its half cannot be placed');
    assert.equal(out.teamsSane, true, 'a record points at neither side');
    assert.equal(out.goalsNamed, true, 'a goal that names nobody cannot be shown');

    /* the beats the picture has to stage must actually appear */
    for (const type of ['shot', 'corner', 'goal', 'save', 'freekick']) {
      assert.ok(out.byType[type] > 0,
        `no ${type} across ${out.matches} matches — the wrapper for it is not firing`);
    }
  });

test('a view that opens late can be caught up, and only once',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Timeline Drain');

    const out = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const m=MU.m;
    let guard=0;
    while(m.min<25 && !m.done && guard++<200) m.tickOnce();

    /* the broadcast asks for whatever the save has done since last time */
    const first=RBSMatchTimeline.drain(m).length;
    const immediatelyAgain=RBSMatchTimeline.drain(m).length;

    while(m.min<60 && !m.done && guard++<400) m.tickOnce();
    const second=RBSMatchTimeline.drain(m).length;

    /* a view opened at the hour catches up on the half it missed */
    RBSMatchTimeline.rewind(m, 45);
    const fromHalfTime=RBSMatchTimeline.drain(m);

    return {
      first, immediatelyAgain, second,
      total:RBSMatchTimeline.of(m).length,
      caughtUp:fromHalfTime.length,
      allAfterHalfTime:fromHalfTime.every(e=>e.min>=45),
    };
  })()`);

    assert.ok(out.first > 0, 'nothing was recorded in the first 25 minutes');
    assert.equal(out.immediatelyAgain, 0,
      'draining twice replayed events the picture had already performed');
    assert.ok(out.second > 0, 'the second half-hour recorded nothing');
    assert.ok(out.caughtUp > 0, 'rewinding caught nothing up');
    assert.equal(out.allAfterHalfTime, true,
      'catching up from half time handed back first-half events');
  });
