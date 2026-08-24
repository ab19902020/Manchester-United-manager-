const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   ONE ENGINE, WHICHEVER WAY YOU WATCH IT
   ---------------------------------------------------------------------
   "it should be decided by the same way a game is done if I was
    watching it in pitch mode or in rolling text or simulated it"

   This file used to assert the opposite, and that is the point of it.
   The Dugout was the authority: while the broadcast was driving, a goal
   MatchSim scored for itself was turned into a chance that did not
   quite come off, and the goals that counted were the ones the picture
   scored. Watching a match in the Dugout was therefore a different
   game from simulating it, and no season measurement could see the
   difference because they all run through quickSim.

   Now MatchSim decides in every view and the broadcast performs what it
   decided. The broadcast half of that — an armed script refusing every
   goal it is not owed, and manufacturing the ones it is — needs WebGL
   and cannot run in JSDOM. What can run, and what actually matters, is
   the seam either side of it: MatchSim must score normally with the
   Dugout driving, and every goal it scores must be handed to the
   picture exactly once, with the right scorer on the right side.
   ===================================================================== */

test('with the Dugout driving, the save scores its own goals exactly as it does anywhere else',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Live Dugout');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    /* TWO THINGS STILL TURN A GOAL AWAY AND NEITHER IS WHAT THIS TESTS.
       VAR rules one out in about sixteen, and the goal-rate calibrator
       (wA3_balance, "how a goal becomes a save") turns a further
       goalCal(div).trim of them into saves to hold the division's
       goals-a-game target. Both are the game's own football and both
       apply in every view, which is the whole point — they are exactly
       as true in the Dugout as they are on the Pitch tab. They are
       switched off here so the assertion is about the seam. */
    m._varOff=true;
    try{ goalCal(MU.fix.div).trim=0; }catch(e){}
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* live mode off — the Pitch, Commentary and Stats tabs, and the
       whole league playing itself */
    api.LIVE.on=false;
    const before=[f.hs,f.as];
    const goals0=shooter.goals;
    m.goal(A,D,shooter,null,null,false);
    out.offMode=(f.hs-before[0])+','+(f.as-before[1]);

    /* live mode on — the Dugout. Same function, same result. The one
       difference is WHEN it lands: the goal is held out of the record
       until the picture has shown it, so that the minute the save writes
       down is the minute the goal was scored in and not the minute the
       broadcast happened to finish building the move. Release it and the
       match is identical. */
    api.LIVE.on=true;
    const mid=[f.hs,f.as];
    m.goal(A,D,shooter,null,null,false);
    out.heldNotScored=(f.hs-mid[0])+','+(f.as-mid[1]);
    out.waiting=api.LIVE.waiting.length;
    api.releaseHeld();
    out.onMode=(f.hs-mid[0])+','+(f.as-mid[1]);
    out.tallied=shooter.goals===goals0+2;
    out.lastScorer=f.sc.length?String(f.sc[f.sc.length-1].pid):null;
    out.wantScorer=String(shooter.p.id);

    /* and a penalty the save recorded is a penalty in the save */
    const pens0=f.sc.filter(x=>x.pen).length;
    m.goal(A,D,shooter,null,null,true);
    api.releaseHeld();
    out.penFlag=f.sc.filter(x=>x.pen).length===pens0+1;

    api.LIVE.on=false; api.LIVE.waiting=[];
    return out;
  })()`);

    assert.equal(result.offMode, '1,0',
      'with no picture the save scores its own goals, as it always did');
    assert.equal(result.heldNotScored, '0,0',
      'with the picture watching, the goal waits until the picture has shown it');
    assert.equal(result.waiting, 1, 'and it is waiting, not lost');
    assert.equal(result.onMode, '1,0',
      'and when it is shown it scores exactly the same way');
    assert.equal(result.tallied, true, 'both are credited to the man who scored them');
    assert.equal(result.lastScorer, result.wantScorer);
    assert.equal(result.penFlag, true, 'a penalty is recorded as a penalty');
  });

test('every goal the save scores is handed to the picture once, and only once',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Posted Goals');

    /* The handover used to be a poll: postGoals compared the fixture's
       list of scorers against a running count and told the picture about
       anything new. It is the goal seam itself now — a goal is queued and
       posted in the same breath it is scored in — so what has to be true
       is that the queue carries each goal exactly once, on the right
       side, with the right man and the right minute on it. That is the
       thing the picture is handed, and a goal queued twice is a goal the
       picture scores twice. */
    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    m._varOff=true;
    try{ goalCal(MU.fix.div).trim=0; }catch(e){}
    api.LIVE.on=true; api.LIVE.posted=0; api.LIVE.waiting=[];

    const home=m.sides[0], away=m.sides[1];
    const hs=home.onfield.find(x=>x.slot!=='GK');
    const as=away.onfield.find(x=>x.slot!=='GK');
    const out={};

    out.beforeAnyGoal=api.LIVE.waiting.length;

    m.min=33; m.stage='H2';
    m.goal(home,away,hs,null,null,false);
    out.afterOne=api.LIVE.waiting.length;

    m.min=67;
    m.goal(away,home,as,null,null,true);
    out.afterTwo=api.LIVE.waiting.length;

    const q=api.LIVE.waiting;
    out.teams=q.map(w=>w.team).join(',');
    out.pids=q.map(w=>String(w.shooter.p.id)).join(',');
    out.wantPids=String(hs.p.id)+','+String(as.p.id);
    out.pens=q.map(w=>String(!!w.pen)).join(',');
    out.minutes=q.map(w=>w.minute).join(',');
    out.minutesAreNumbers=q.every(w=>typeof w.minute==='number'&&isFinite(w.minute));

    /* showing one of them takes it off the queue and leaves the other */
    api.stampMinute({getState:()=>({minute:"33'"})},{team:0,minute:"33'"});
    out.afterShowingOne=api.LIVE.waiting.length;
    out.scoreAfterOne=f.hs+','+f.as;
    api.releaseHeld();
    out.left=api.LIVE.waiting.length;
    out.score=f.hs+','+f.as;
    out.recorded=f.sc.map(g=>String(g.min)).join(',');

    api.LIVE.on=false; api.LIVE.waiting=[];
    return out;
  })()`);

    assert.equal(result.beforeAnyGoal, 0, 'a goalless match owes the picture nothing');
    assert.equal(result.afterOne, 1);
    assert.equal(result.afterTwo, 2);
    assert.equal(result.teams, '0,1', 'the home goal is team 0 and the away goal team 1');
    assert.equal(result.pids, result.wantPids, 'each goal names the man who actually scored it');
    assert.equal(result.pens, 'false,true', 'and a penalty is carried as a penalty');
    assert.equal(result.minutes, '33,67', 'each carries the minute it was scored in');
    assert.equal(result.minutesAreNumbers, true,
      'a stoppage-time goal reads "45+2" in the commentary and must still be a number here');
    assert.equal(result.afterShowingOne, 1,
      'showing one goal takes that goal off the queue and no other');
    assert.equal(result.scoreAfterOne, '1,0');
    assert.equal(result.left, 0, 'and the whistle clears whatever is still waiting');
    assert.equal(result.score, '1,1');
    assert.equal(result.recorded, '33,67',
      'both are in the record at the minutes they were scored in');
  });

/* =====================================================================
   A GOAL THE CALIBRATOR TURNS DOWN IS NEVER SHOWN EITHER
   ---------------------------------------------------------------------
   The goal-rate calibrator turns a share of goals into saves to hold
   each division at 2.80 a game. Under the old arrangement that was a
   visible fault: the broadcast scored, the picture showed it going in,
   and then the save turned it down — measured at 4.3% of them, about
   one goal in twenty-three that you watched hit the net and never
   appeared on the scoreboard.

   It cannot happen now, and the reason is worth pinning down. The
   calibrator returns BEFORE the underlying goal() runs, so nothing is
   recorded: the score does not move, no scorer is written into the
   fixture, and it says a save instead. A goal is not taken back — one
   was never scored. And because the picture is only ever told about
   goals that are already in the fixture, it never hears about this one
   at all.
   ===================================================================== */
test('a goal the calibrator turns down never reaches the score or the picture',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Trimmed Goals');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    m._varOff=true;
    api.LIVE.on=true; api.LIVE.posted=0;
    const seen=[];
    const md={ addGoal(g){ seen.push(g); return md } };
    const A=m.sides[0], D=m.sides[1];
    const shooter=A.onfield.find(x=>x.slot!=='GK');
    const out={};

    /* every goal turned down: the division is scoring far too freely */
    goalCal(f.div).trim=1;
    const feed0=m.feed.length;
    for(let i=0;i<20;i++) m.goal(A,D,shooter,null,null,false);
    api.postGoals(md,f);
    out.score=f.hs+','+f.as;
    out.scorers=f.sc.length;
    out.postedToPicture=api.LIVE.waiting.length;
    out.saidSomething=m.feed.length>feed0;
    out.saves=D.st.sv;

    /* none turned down: they all count, and all reach the picture */
    goalCal(f.div).trim=0;
    for(let i=0;i<5;i++) m.goal(A,D,shooter,null,null,false);
    out.heldAfter=api.LIVE.waiting.length;
    api.releaseHeld();
    api.postGoals(md,f);
    out.scoreAfter=f.hs+','+f.as;
    out.postedAfter=api.LIVE.posted;

    api.LIVE.on=false; api.LIVE.waiting=[];
    return out;
  })()`);

    assert.equal(result.score, '0,0',
      'a goal the calibrator turns down never moves the score');
    assert.equal(result.scorers, 0, 'and nobody is credited with it');
    assert.equal(result.postedToPicture, 0,
      'and the picture is never told about it, so it cannot show a goal the save does not have');
    assert.equal(result.heldAfter, 5,
      'a goal the calibrator allows is held for the picture, not thrown away');
    assert.equal(result.saidSomething, true, 'the commentary says a save rather than going quiet');
    assert.ok(result.saves >= 20, 'and the goalkeeper is credited with the saves');
    assert.equal(result.scoreAfter, '5,0', 'with the calibrator idle every goal counts');
    assert.equal(result.postedAfter, 5, 'and every one of them reaches the picture');
  });

/* =====================================================================
   ONE MINUTE EXISTS, NOT TWO
   ---------------------------------------------------------------------
   "The forty minute goal can't be reading us forty six. It has to be
    all correct no matter what."

   It reads forty everywhere now, and the way that is arranged is worth
   pinning down, because the obvious arrangement was tried first and it
   was wrong. The obvious one lets the picture choose: the save scores at
   forty, the broadcast takes a dozen match minutes to build the move out
   of open play, and whatever minute it lands on is written into the
   save. Every view then agrees with every other -- and the goal is
   recorded at fifty-five.

   So the save's minute is the minute, and the CLOCK waits instead. While
   a goal is owed the broadcast keeps playing football but its clock
   stops on the minute the goal belongs to (scriptClockCap, in
   src/matchday-engine.js), and the save is held on the same minute here.
   The goal is scored at forty on the broadcast, written down as forty in
   the commentary, and recorded as forty in the report.

   Measured over thirty watched matches with a real renderer: every one
   of seventy-nine goals recorded at the minute the save scored it, and
   every scoreline agreeing. scripts/measure-goal-minute.cjs.

   The clock itself needs WebGL and cannot run in JSDOM. What runs here
   is the half either side of it: a goal is held out of the record until
   the picture shows it, and when it is applied it takes the save's
   minute and not the picture's.
   ===================================================================== */
test('a held goal is recorded at the minute the save scored it, whatever the picture says',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'One Minute');

    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const api=window.RBSDugoutMatchday, m=MU.m, f=MU.fix;
    m._varOff=true;
    try{ goalCal(f.div).trim=0; }catch(e){}
    api.LIVE.on=true; api.LIVE.posted=0; api.LIVE.waiting=[];
    const home=m.sides[0], away=m.sides[1];
    const hs=home.onfield.find(x=>x.slot!=='GK');
    const as=away.onfield.find(x=>x.slot!=='GK');
    const out={};
    const feedMin=()=>m.feed.filter(e=>e.cls==='goal').map(e=>String(e.min)).join(',');

    /* the fortieth minute, and the home side score */
    m.min=40; m.stage='H2';
    m.goal(home,away,hs,null,null,false);
    out.queued=api.LIVE.waiting.length;
    out.floor=api.heldFloor();
    /* nothing in the record and nothing in the commentary: the picture
       has not shown it, and a line written now would have to be moved
       later, which is what put the feed out of order */
    out.asScored=f.sc.map(g=>String(g.min)).join(',');
    out.feedWhileWaiting=feedMin();

    /* the picture gets there. It claims the seventy-eighth minute --
       which it never would, because its clock is stopped on the fortieth
       waiting for exactly this, but the record must not depend on that */
    api.stampMinute({getState:()=>({minute:"78'"})},{team:0,minute:"78'"});
    out.left=api.LIVE.waiting.length;
    out.stamped=f.sc.map(g=>String(g.min)).join(',');
    out.feed=feedMin();

    /* a second goal, at a different minute, to the other side */
    m.min=55;
    m.goal(away,home,as,null,null,false);
    out.floor2=api.heldFloor();
    api.stampMinute({getState:()=>({minute:"90'"})},{team:1,minute:"90'"});
    out.both=f.sc.map(g=>String(g.min)).join(',');
    out.feedOrdered=(()=>{
      const mins=m.feed.map(e=>parseFloat(String(e.min))).filter(v=>isFinite(v));
      for(let i=1;i<mins.length;i++) if(mins[i]<mins[i-1]) return false;
      return true;
    })();

    /* a goal nobody is waiting for must not rewrite anything */
    api.stampMinute({getState:()=>({minute:"90'"})},{team:0,minute:"90'"});
    out.after=f.sc.map(g=>String(g.min)).join(',');

    api.LIVE.on=false; api.LIVE.waiting=[];
    return out;
  })()`);

    assert.equal(result.queued, 1, 'the goal waits for the picture to show it');
    assert.equal(result.asScored, '',
      'and until it does, the save has no goal at all — not one at the wrong minute');
    assert.equal(result.feedWhileWaiting, '',
      'the commentary says nothing about a goal the picture has not shown yet');
    assert.equal(result.floor, 40,
      'and the save is not allowed past the minute the goal belongs to');
    assert.equal(result.stamped, '40',
      'the goal is recorded at forty, which is when it happened — not at the '
      + 'seventy-eight the picture claimed');
    assert.equal(result.feed, '40', 'and the commentary says forty as well');
    assert.equal(result.left, 0, 'nothing is left waiting');
    assert.equal(result.floor2, 55, 'the second goal holds the save on its own minute');
    assert.equal(result.both, '40,55', 'each goal keeps the minute it was scored in');
    assert.equal(result.feedOrdered, true,
      'so the minutes down the commentary never go backwards');
    assert.equal(result.after, '40,55',
      'a goal nobody was waiting for changes nothing — the picture cannot invent one');
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
