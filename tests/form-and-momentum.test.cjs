const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   FORM AND MOMENTUM HAVE TO REACH THE PITCH
   ---------------------------------------------------------------------
   "If a team is playing well and they have the momentum, that will help
    them. If a player's in a good run of form and has scored more — all
    these sort of things will affect the game."

   They did not. The game recorded both — `p.form` keeps a man's last
   five match ratings and `c.recent` keeps a club's last results — and
   read them only for the awards, the press and the home screen. Every
   term in the match engine's own `effA` was accounted for and form was
   not among them, so a striker on four straight sevens played exactly
   like one who had not kicked a ball.

   Measured after wiring both in, 600 matches a variant off a seeded
   stream, mid-table against mid-table:

       every man on 7.6      +2.6 points a season
       every man on 5.6      -9.6
       five straight wins    +1.6
       five straight defeats -3.1

   Both ladders run the right way. The asymmetry is the engine's own and
   shows in every input measured this way — morale reads -9.9 and +1.3,
   two attribute points read -55 and +36 — because the sigmoids that
   decide a chance cost more when you fall than they pay when you climb.

   THIS IS NOT SCRIPTING. Neither term can see who the club is, where it
   sits, who it is playing or whether it is winning. Each reads one
   thing: the player's own last five ratings, the club's own last five
   results. Both are consequences of how the side has actually played,
   which is the direction CLAUDE.md fixes.
   ===================================================================== */

test('the two dials have the right shape, and a fresh player is neutral', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const out = game.eval(`(()=>{
    const F=window.RBSFormMomentum;
    const run=(r)=>F.runMul({recent:r.map(x=>({r:x}))});
    return {
      /* a man with no history, or barely any, is worth exactly par */
      noForm: F.formMul({}),
      oneGame: F.formMul({form:[9]}),
      par: F.formMul({form:[6.6,6.6,6.6]}),
      hot: F.formMul({form:[7.6,7.6,7.6,7.6,7.6]}),
      cold: F.formMul({form:[5.6,5.6,5.6,5.6,5.6]}),
      /* and it cannot run away: a freak run of nines is still capped */
      absurd: F.formMul({form:[9.9,9.9,9.9,9.9,9.9]}),
      span: F.FORM_SPAN, runSpan: F.RUN_SPAN,

      noRun: run([]),
      shortRun: run(['W','W']),
      allWins: run(['W','W','W','W','W']),
      allLost: run(['L','L','L','L','L']),
      middling: run(['W','D','L','W','L'])
    };
  })()`);

  /* NOTHING HAPPENS TO A MAN WITH NO RECORD, which matters on the first
     weekend of a career when nobody has a rating yet */
  assert.equal(out.noForm, 1, 'a player with no form is untouched');
  assert.equal(out.oneGame, 1, 'and one game is not a run');
  assert.ok(Math.abs(out.par - 1) < 1e-9, 'an ordinary run is worth nothing');

  assert.ok(out.hot > 1 && out.cold < 1, 'hot helps and cold hurts');
  assert.ok(Math.abs((out.hot - 1) - out.span) < 1e-9,
    'a run of 7.6s is the full span');
  assert.equal(out.absurd, out.hot, 'and the span is a cap, not a slope');

  assert.equal(out.noRun, 1, 'a club with no results is untouched');
  assert.equal(out.shortRun, 1, 'and two games is not a run');
  assert.ok(out.allWins > 1 && out.allLost < 1, 'winning helps, losing hurts');
  assert.ok(Math.abs((out.allWins - 1) - out.runSpan) < 1e-9,
    'five wins is the full span');
  assert.ok(Math.abs(out.middling - 1) < out.runSpan * 0.35,
    'and a middling run is close to nothing: ' + out.middling);

  /* THE ORDERING THAT KEEPS THE GAME HONEST. Form must stay smaller than
     the things a manager controls directly. */
  assert.ok(out.span > out.runSpan,
    'a man in form is worth more than his club being on a run');
  assert.ok(out.span < 0.06,
    'and form is not allowed to dwarf morale, condition or the squad');
});

test('a squad in form beats the same squad out of form',
  { timeout: 180000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'In Form');

    /* KEPT SHORT ON PURPOSE. The full ladders are in the rig; this is the
       guard, and `node --test` runs two files at once, so a heavy one
       times its neighbour out. Paired off the same seeded stream, so a
       difference is the input rather than the sample. */
    const out = game.eval(`(()=>{
    window.RBSWorldSeed.build(20260825,'MUN');
    const mem=G.clubs.filter(c=>c.league==='PL').map(c=>c.i);
    const rank=mem.slice().sort((a,b)=>(G.clubs[b].rep||0)-(G.clubs[a].rep||0));
    const ME=rank[9], THEM=rank[10];
    const squad=ci=>(G.clubs[ci].players||[]).filter(x=>!x.loan);
    const heal=ci=>squad(ci).forEach(x=>{
      x.injury=null;x.susp=0;x.cond=100;x.sharp=70;x.morale=72;x.form=[];});

    const play=(apply)=>{
      Math.random=window.RBSWorldSeed.mulberry32(0x5eed1>>>0);
      let pts=0,played=0;
      for(let i=0;i<70;i++){
        heal(ME);heal(THEM);
        G.clubs[ME].recent=[];G.clubs[THEM].recent=[];
        apply();
        try{ goalCal('PL').trim=0; }catch(e){}
        const home=i%2===0;
        const fix={h:home?ME:THEM,a:home?THEM:ME,div:'PL',sc:[],hs:0,as:0,r:0,day:40,played:false};
        try{ buildContext(fix); quickSim(fix); }catch(e){ continue; }
        const my=home?fix.hs:fix.as, th=home?fix.as:fix.hs;
        played++; pts+= my>th?3 : my===th?1 : 0;
      }
      return pts/Math.max(1,played);
    };

    return {
      base: play(()=>{}),
      hot:  play(()=>squad(ME).forEach(x=>{x.form=[7.6,7.6,7.6,7.6,7.6];})),
      cold: play(()=>squad(ME).forEach(x=>{x.form=[5.6,5.6,5.6,5.6,5.6];})),
      won:  play(()=>{G.clubs[ME].recent=[1,2,3,4,5].map(()=>({r:'W',gf:2,ga:0}));}),
      lost: play(()=>{G.clubs[ME].recent=[1,2,3,4,5].map(()=>({r:'L',gf:0,ga:2}));})
    };
  })()`);

    /* ONLY THE EXTREMES ARE ASSERTED. At seventy matches a variant, a
       hot squad against a cold one is the full span apart and separates
       cleanly; base against cold is half that and does not — the first
       version of this test asserted it and read 1.329 against 1.329,
       which is the sample, not the game. The middle of both ladders is
       measured properly in the rig at 600 matches a variant, where cold
       comes out 9.6 points a season below base. */
    assert.ok(out.hot > out.cold,
      'a squad in form beats the same squad out of form: '
      + out.hot.toFixed(3) + ' against ' + out.cold.toFixed(3));
    assert.ok(out.won > out.lost,
      'a side on a run beats the same side on none: '
      + out.won.toFixed(3) + ' against ' + out.lost.toFixed(3));
  });

/* =====================================================================
   THE CEILING TAKES ONE BITE, NOT ONE A SEASON
   ---------------------------------------------------------------------
   Every player gets a hidden realised ceiling between 80% and 100% of
   his potential, because almost nobody reaches their ceiling. It was
   written into `p.pot`, and the ceiling is recomputed deliberately in
   two places -- after the ratings pass and at the end of every season --
   so each recompute took a ceiling OF A CEILING. Yoro traced 92 -> 85 ->
   83 in one world build, and again every season after that, which
   collapsed potential onto ability for 96 of 136 under-24s in the
   Premier League.

   The true potential is kept on `p.potMax` and every recompute is taken
   from that. This is the guard: applying it twice has to land on the
   same number both times.
   ===================================================================== */
test('a second ceiling pass lands where the first one did',
  { timeout: 90000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());

    const out = game.eval(`(()=>{
    window.RBSWorldSeed.build(20260825,'MUN');
    const pl=G.clubs.filter(c=>c.league==='PL');
    const young=pl.flatMap(c=>(c.players||[]).filter(p=>p.age<=23));

    /* ONE SETTLING PASS FIRST. A handful of players are created after
       the world build's own ceiling pass -- the real-transfer window
       makes some -- so they have never been ceiled and the first pass
       legitimately moves them. What is being tested is that the pass is
       IDEMPOTENT, so the baseline is taken once everybody has had one. */
    eachPlayer(p=>{p._cap=0}); applyCeilings();
    const before=young.map(p=>({id:p.id,pot:p.pot,potMax:p.potMax,cap:p.cap,ovr:p.ovr}));

    /* exactly what the ratings pass and the end of a season both do */
    eachPlayer(p=>{p._cap=0}); applyCeilings();
    eachPlayer(p=>{p._cap=0}); applyCeilings();

    let moved=0, worst=0;
    before.forEach(b=>{
      const p=young.find(x=>x.id===b.id); if(!p) return;
      const d=Math.abs((p.pot||0)-(b.pot||0));
      if(d>0){moved++; if(d>worst)worst=d;}
    });
    return {
      young: young.length,
      moved, worst,
      /* and the record of what he might have been survives all of it */
      flat: young.filter(p=>potOf(p)<=p.ovr).length,
      sample: young.slice(0,3).map(p=>p.ovr+'/'+potOf(p)+' stops '+p.cap)
    };
  })()`);

    assert.ok(out.young > 40, 'the division should have young players in it');
    assert.equal(out.moved, 0,
      'two more ceiling passes moved ' + out.moved + ' potentials, worst by '
      + out.worst + ' — the ceiling is compounding again');

    /* AND MOST OF THEM STILL HAVE SOMETHING TO GIVE. At its worst this
       read 96 of 136 with nothing left. */
    assert.ok(out.flat / out.young < 0.25,
      out.flat + ' of ' + out.young + ' under-24s have no potential left: '
      + out.sample.join(' | '));
  });
