const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE SEAM BETWEEN THE GAME AND THE PICTURE
   ---------------------------------------------------------------------
   The broadcast needs WebGL and JSDOM has none, so the picture itself
   cannot run here. What can run is the seam it is driven through, and
   that is the part worth protecting: the game plays the match, and
   every goal it gives — and only a goal it gives — is handed to the
   broadcast to show.

   The invariant is one sentence: `scoreNow` is called if and only if
   the score moved. It is written that way rather than as two separate
   cases because the interesting failure was exactly the gap between
   them — `goal()` is not a promise that the score changes, since VAR
   rules one out in about sixteen by returning without touching the
   scoreboard, and the picture was told to score it anyway. A watched
   match read save 0-0, picture 0-1.
   ===================================================================== */

test('the picture is told about a goal if and only if the game gave one',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Live Dugout');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');

    /* the broadcast cannot boot in JSDOM, so stand in for it and record
       what it is asked to do */
    const told=[];
    const realMatchday=window.Matchday;
    window.Matchday={ scoreNow:(ev)=>{ told.push(ev); return ev; }, owed:()=>0 };

    const out={ trials:[], offMode:null };

    /* with no picture the game plays exactly as it always has. VAR is
       off for this one goal only: it rules one out in about sixteen,
       which would make this half flaky about something it is not
       testing. It is switched back on for the trials, where a
       disallowed goal is the whole point. */
    api.LIVE.on=false;
    m._varOff=true;
    const before=f.hs+f.as;
    m.goal(A,D,shooter,null,null,false);
    out.offMode={ scored:(f.hs+f.as)-before, told:told.length };

    /* now with the picture driving. Every roll of the dice is a trial:
       whether the goal stood is up to the engine and its VAR, and the
       invariant has to hold either way. */
    api.LIVE.on=true;
    m._varOff=false;
    const realRandom=Math.random;
    for(let i=0;i<40;i++){
      const at=told.length, was=f.hs+f.as;
      /* half the trials with the dice forced cold, which is where VAR
         disallows one */
      if(i%2===0) Math.random=()=>0;
      try{ m.goal(A,D,shooter,null,null,false); } finally { Math.random=realRandom; }
      out.trials.push({ scored:(f.hs+f.as)-was, told:told.length-at });
    }

    /* and the scorer the picture is given is the man who scored */
    const last=told[told.length-1]||null;
    out.namedRight = last ? String(last.pid)===String(shooter.p.id) : null;
    out.teamRight = last ? last.team===0 : null;

    api.LIVE.on=false;
    window.Matchday=realMatchday;
    return out;
  })()`);

    assert.equal(result.offMode.scored, 1,
      'with no picture the game still scores its own goals');
    assert.equal(result.offMode.told, 0,
      'and says nothing to a broadcast that is not driving');

    /* counted, not deep-equalled: these arrays come back from the game's
       own realm and never compare reference-equal to one built here */
    const trials = Array.from(result.trials).map((t2) => ({ scored: t2.scored, told: t2.told }));
    const disagreed = trials.filter((t2) => t2.scored !== t2.told);
    assert.equal(disagreed.length, 0,
      'the picture must be told about a goal exactly when the score moved, but '
      + disagreed.length + ' of ' + trials.length + ' disagreed: '
      + JSON.stringify(disagreed.slice(0, 4)));

    /* the trials have to have covered both outcomes, or this proves nothing */
    assert.ok(trials.some((t2) => t2.scored === 1), 'some goals stood');
    assert.ok(trials.some((t2) => t2.scored === 0),
      'and some were turned away, or the interesting half is untested');

    assert.equal(result.namedRight, true, 'the scorer is the man who scored');
    assert.equal(result.teamRight, true, 'and the side is the side that scored');
  });

test('the tab you are on is the tab that is lit', { timeout: 45000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Match Tabs');

  const lit = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const read=()=>[...document.querySelectorAll('#matchScreen .mtabs [data-action="mtab"]')]
      .filter(b=>b.classList.contains('on')).map(b=>b.dataset.v).join(',');
    const out={atKickoff:read(), after:{}};
    ['comm','stats','pitch','dugout'].forEach(v=>{
      ACTIONS.mtab(document.querySelector('.mtabs [data-v="'+v+'"]'));
      out.after[v]=read();
    });
    return out;
  })()`);

  /* kick-off opens on the football, not on the 2D pitch */
  assert.equal(lit.atKickoff, 'dugout');
  assert.equal(lit.after.comm, 'comm');
  assert.equal(lit.after.stats, 'stats');
  assert.equal(lit.after.pitch, 'pitch');
  assert.equal(lit.after.dugout, 'dugout');
});
