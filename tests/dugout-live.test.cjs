const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE RESULT DOES NOT DEPEND ON HOW YOU WATCHED
   ---------------------------------------------------------------------
   "if I watch it in the 2D picture, or the text, or the stats screen, or
    I simulate it, or I watch it in dugout view, it should all produce
    the same result. Picking one should not change the result."

   It used to. The broadcast cleared the script and decided the match
   outright, with the save following it — so skipping a fixture and
   sitting through it were two different matches settled by two different
   engines.

   The save decides now, whichever screen you are on, and the picture
   performs what the save produces. This test guards that direction: a
   goal MatchSim scores must move the score WHILE THE PICTURE IS LIVE,
   and it must be posted to the picture so the broadcast shows the same
   goal to the same man.

   The broadcast needs WebGL and JSDOM has none — `window.THREE` is
   absent, so the engine bails at its first line and `window.Matchday`
   never exists here. The picture therefore cannot run in this file. But
   the seam it is driven through can, so the seam is stood in for and the
   real engine's half of the contract is checked against its source.
   ===================================================================== */

test('the engine can be told about a goal after kick-off', () => {
  /* The save only knows minute 34's goal at minute 34, so the plan handed
     over at kick-off cannot contain it. `addGoal` is the door that lets a
     goal in late; without it the picture can only ever perform goals that
     were known before a ball was kicked. */
  const engine = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'matchday-engine.js'), 'utf8');
  const api = engine.slice(engine.indexOf('window.Matchday = {'));
  assert.ok(api.length, 'the engine no longer publishes a Matchday API');
  assert.match(api.slice(0, 4000), /\baddGoal\s*\(/,
    'the engine must expose addGoal, or the picture can never be told what to perform');
});

test('the save scores the goals whether or not the picture is running',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Live Dugout');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    /* VAR rules out one goal in sixteen, which would make this test flaky
       about something it is not testing */
    m._varOff=true;
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* with live mode off — no picture, which is this device — the game
       plays itself exactly as it always has */
    api.LIVE.on=false;
    const before=[f.hs,f.as];
    m.goal(A,D,shooter,null,null,false);
    out.offMode=(f.hs-before[0])+','+(f.as-before[1]);

    /* WITH THE PICTURE LIVE, the save still scores it — that is the
       whole point of the change — and the goal is posted to the picture
       so the broadcast performs the same one. */
    api.LIVE.on=true;
    const mid=[f.hs,f.as];
    const goals0=shooter.goals;
    /* the real engine needs WebGL, which JSDOM has not got, so the door it
       would have published is stood in for here. The engine's own half of
       this contract is checked against its source in the test above. */
    const hadMd=Object.prototype.hasOwnProperty.call(window,'Matchday');
    const wasMd=window.Matchday;
    let posted=null;
    window.Matchday={ addGoal(g){ posted=g; return this; } };
    try{ m.goal(A,D,shooter,null,null,false); }
    finally{ if(hadMd) window.Matchday=wasMd; else delete window.Matchday; }
    out.liveScored=(f.hs===mid[0]+1 && f.as===mid[1]);
    out.tallied=shooter.goals===goals0+1;
    out.lastScorer=f.sc.length?String(f.sc[f.sc.length-1].pid):null;
    out.wantScorer=String(shooter.p.id);
    out.posted=posted ? {pid:String(posted.pid), team:posted.team, min:posted.minute} : null;

    api.LIVE.on=false;
    return out;
  })()`);

    assert.equal(result.offMode, '1,0',
      'with no picture the game scores its own goals, as it always did');
    assert.equal(result.liveScored, true,
      'and it scores them with the picture live too — the save owns the result');
    assert.equal(result.tallied, true, 'the scorer is credited');
    assert.equal(result.lastScorer, result.wantScorer,
      'and the fixture records the man who actually scored it');
    assert.ok(result.posted, 'the goal was not posted to the picture');
    assert.equal(result.posted.pid, result.wantScorer,
      'the picture was told to score it through a different player');
    assert.equal(result.posted.team, 0,
      'the home side scored it, so the picture must perform it at the home end');
    assert.equal(typeof result.posted.min, 'number',
      'the picture needs the minute, or it cannot place the goal in the match');
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
