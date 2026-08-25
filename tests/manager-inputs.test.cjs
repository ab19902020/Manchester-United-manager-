const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   NOTHING IS SCRIPTED: WHAT THE MANAGER DOES HAS TO DECIDE THE RESULT
   ---------------------------------------------------------------------
   "A player's input into signings and keeping players fit and their
    morale up will have an input on how well they do. If they have a
    squad which has all the best players, but their morale's low and
    their older players are injured, it will make their team have a
    negative consequence. Obviously, if you had the best player in the
    world in your team, you'll have a better chance of winning."

   That is the rule the game rests on, and it is the one thing here that
   is not about football looking right -- it is about the game being a
   game. So it is worth more than a note in CLAUDE.md and more than the
   observation that `effA` multiplies by a morale term. A term being
   present says nothing about whether it is big enough to matter.

   scripts/measure-inputs.cjs measures the size of each one properly:
   1,200 matches a variant, both squads healed before every match,
   against the same opponent off a seeded stream. What it reports, in
   points over a 38-game season:

     morale 20 / 45 / 72 / 95      -9.9   -4.8   base   +1.3
     condition 60 / 80 / 100      -27.8  -17.9   base
     sharpness 35 / 70 / 95       -11.7   base   +4.9
     best man / best three out     -4.0   -8.1
     every attribute -2 / +2      -55.1  +36.2

   Every ladder is monotonic, every sign is right, and squad quality
   dominates everything else -- which is exactly the shape the rule asks
   for. This test is the guard on it. It runs a much shorter sample than
   the rig, so it asserts only the effects that are far outside noise at
   this length, and it asserts ORDER rather than size: the numbers above
   are free to move as the match model changes, but a knackered squad
   must never be as good as a fresh one.

   THE RIG HAD TO BE WRONG TWICE BEFORE IT WAS RIGHT, and both faults are
   why the healing below matters. Replaying one fixture hundreds of times
   let `tickOnce` injure real players, and the injuries stuck to the
   club: the first run reported 568 goalless draws in 600 as if the match
   model were dead, when it was two teams of crocks. The goal-rate
   controller also read the repetition as a scoring glut and trimmed
   almost every goal away. Both are held still here.
   ===================================================================== */

const N = 220;

test('a fresh, happy, well-stocked squad beats a tired, unhappy, depleted one',
  { timeout: 120000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Manager Inputs');

    const out = game.eval(`(()=>{
    /* A SEEDED WORLD, or this measures the draw rather than the input.
       startCareer builds an unseeded one, so which two clubs sit ninth
       and tenth -- and how far apart they are -- changes every run. With
       220 matches against a single opponent that is enough to swamp
       morale: one run measured it at 0.26 points a game and the next at
       0.045. The rig seeds the world for the same reason. */
    window.RBSWorldSeed.build(20260821,'MUN');
    const mem=G.clubs.filter(c=>c.league==='PL').map(c=>c.i);
    const rank=mem.slice().sort((a,b)=>(G.clubs[b].rep||0)-(G.clubs[a].rep||0));
    const ME=rank[9], THEM=rank[10];
    const squad=ci=>(G.clubs[ci].players||[]).filter(p=>!p.loan);
    const keep=squad(ME).map(p=>({p,morale:p.morale,cond:p.cond,sharp:p.sharp,
      injury:p.injury,attrs:{...p.attrs}}));

    /* both sides back to full health before every match, so a run cannot
       dismantle the squads it is trying to measure */
    const heal=ci=>squad(ci).forEach(p=>{
      p.injury=null;p.susp=0;p.cond=100;p.sharp=70;p.morale=72;});

    const play=(apply)=>{
      Math.random=window.RBSWorldSeed.mulberry32(0x5eed1>>>0);
      let pts=0,gf=0,ga=0;
      for(let i=0;i<${N};i++){
        heal(ME);heal(THEM);apply();
        try{ goalCal('PL').trim=0; }catch(e){}
        const home=i%2===0;
        const fix={h:home?ME:THEM,a:home?THEM:ME,div:'PL',sc:[],hs:0,as:0,r:0,
          day:40,played:false};
        try{ buildContext(fix); quickSim(fix); }catch(e){ continue; }
        const my=home?fix.hs:fix.as, th=home?fix.as:fix.hs;
        gf+=my;ga+=th;
        pts+= my>th?3 : my===th?1 : 0;
      }
      return {ppg:pts/${N}, gf, ga};
    };

    const base   = play(()=>{});
    const tired  = play(()=>squad(ME).forEach(p=>{p.cond=60;}));
    const sour   = play(()=>squad(ME).forEach(p=>{p.morale=20;}));
    const rusty  = play(()=>squad(ME).forEach(p=>{p.sharp=35;}));
    const hurt   = play(()=>squad(ME).slice().sort((a,b)=>b.ovr-a.ovr).slice(0,3)
                      .forEach(p=>{p.injury={days:20,kind:'knock'};}));
    const better = play(()=>squad(ME).forEach(p=>{
      Object.keys(p.attrs).forEach(k=>{p.attrs[k]=Math.min(20,p.attrs[k]+2);});}));
    const worse  = play(()=>squad(ME).forEach(p=>{
      Object.keys(p.attrs).forEach(k=>{p.attrs[k]=Math.max(1,p.attrs[k]-2);});}));

    keep.forEach(r=>{r.p.morale=r.morale;r.p.cond=r.cond;r.p.sharp=r.sharp;
      r.p.injury=r.injury;r.p.attrs={...r.attrs};});
    return {base,tired,sour,rusty,hurt,better,worse};
  })()`);

    /* the football happened at all — a rig that quietly stops scoring
       would pass every ordering below on zeroes */
    assert.ok(out.base.gf + out.base.ga > N * 1.5,
      'the sample actually played football: ' + out.base.gf + '-' + out.base.ga
      + ' in ' + N + ' matches');

    /* SQUAD QUALITY DOMINATES, which is the half of the rule about
       signings. Two points on every attribute is worth about 36 points a
       season up and 55 down, so at this sample it is not arguable. */
    assert.ok(out.better.ppg > out.base.ppg + 0.4,
      'a better squad wins more: ' + out.better.ppg.toFixed(3)
      + ' against ' + out.base.ppg.toFixed(3));
    assert.ok(out.worse.ppg < out.base.ppg - 0.4,
      'and a worse one wins less: ' + out.worse.ppg.toFixed(3)
      + ' against ' + out.base.ppg.toFixed(3));

    /* KEEPING THEM FIT is the largest thing a manager controls week to
       week -- measured at 28 points a season, far the biggest of the
       three condition/morale/sharpness levers. */
    assert.ok(out.tired.ppg < out.base.ppg - 0.3,
      'legs gone costs points: ' + out.tired.ppg.toFixed(3)
      + ' against ' + out.base.ppg.toFixed(3));

    /* MORALE AND SHARPNESS both bite, more gently */
    assert.ok(out.sour.ppg < out.base.ppg - 0.08,
      'a mutinous squad costs points: ' + out.sour.ppg.toFixed(3)
      + ' against ' + out.base.ppg.toFixed(3));
    assert.ok(out.rusty.ppg < out.base.ppg - 0.08,
      'a rusty squad costs points: ' + out.rusty.ppg.toFixed(3)
      + ' against ' + out.base.ppg.toFixed(3));

    /* AND LOSING YOUR BEST MEN HURTS */
    assert.ok(out.hurt.ppg < out.base.ppg - 0.05,
      'the best three injured costs points: ' + out.hurt.ppg.toFixed(3)
      + ' against ' + out.base.ppg.toFixed(3));

    /* the ordering that matters most: nothing a manager neglects should
       ever be as good as looking after it */
    assert.ok(out.better.ppg > out.tired.ppg && out.tired.ppg > out.worse.ppg,
      'the ladder runs the right way round');
  });
