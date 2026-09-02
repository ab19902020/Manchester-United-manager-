const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   DOING SOMETHING ABOUT THEIR BEST PLAYER
   ---------------------------------------------------------------------
   Every in-match instruction the game had was about YOUR eleven. This
   is the first one about theirs, so the tests are about the trade being
   real in both directions: a marked man sees less of the ball, and the
   ten around him see more of it. An instruction with only an upside is
   not a decision.
   ===================================================================== */

async function intoAMatch(name) {
  const game = await createGame();
  await startCareer(game, name);
  game.eval(`(function(){
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();ACTIONS.kickoff();
  })()`);
  return game;
}

/* How often a given man is the one the engine picks.

   THE DRAW COUNT IS THE WHOLE TEST. The effect on a team-mate is about
   0.6 of a percentage point, and at four thousand draws the standard
   error on a share near 10% is 0.47 -- so the first version of this
   measured noise slightly larger than the thing it was looking for, and
   duly reported that marking had no cost when the arithmetic says it
   has. Forty thousand puts the error at 0.15, which makes the effect
   four standard errors clear of the dice. */
const DRAWS = 40000;
const SHARE = `function(target){
  const mine=mySideIx(), them=MU.m.sides[1-mine];
  let hits=0;
  for(let i=0;i<${DRAWS};i++){
    const pick=MU.m.weighted(them, x=>x.slot==='GK'?0.01:(x.p.ovr||50));
    if(pick===target)hits++;
  }
  return hits/${DRAWS};
}`;

test('marking their best player takes him out of the game', async (t) => {
  const game = await intoAMatch('Mark');
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const share=${SHARE};
    const O=RBSOppositionInstructions;
    const mine=mySideIx(), them=MU.m.sides[1-mine];
    const star=O.danger(them.onfield.filter(x=>!x.off));
    const out={who:star.p.name};
    out.before=share(star);
    O.set(star.p.id,'tight');  out.marked=share(star);
    O.set(star.p.id,'loose');  out.loose=share(star);
    O.set(star.p.id,null);     out.after=share(star);
    return out;
  })()`);

  assert.ok(got.marked < got.before * 0.8,
    `${got.who} still saw ${(got.marked * 100).toFixed(1)}% of it while marked, against ${(got.before * 100).toFixed(1)}% free`);
  assert.ok(got.loose > got.before,
    'standing off a player should give him MORE of the ball, not less');
  /* and the instruction has to end when you take it off */
  assert.ok(Math.abs(got.after - got.before) < got.before * 0.25,
    `clearing the instruction left him at ${(got.after * 100).toFixed(1)}% against ${(got.before * 100).toFixed(1)}%`);
});

test('the man who goes with him leaves space for the rest', async (t) => {
  const game = await intoAMatch('Space');
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const share=${SHARE};
    const O=RBSOppositionInstructions;
    const mine=mySideIx(), them=MU.m.sides[1-mine];
    const on=them.onfield.filter(x=>!x.off&&x.slot!=='GK');
    const star=O.danger(on);
    const mate=on.find(x=>x!==star);
    const out={};
    out.before=share(mate);
    O.set(star.p.id,'tight');
    out.freed=share(mate);
    O.set(star.p.id,null);
    return out;
  })()`);

  assert.ok(got.freed > got.before,
    `a team-mate saw ${(got.freed * 100).toFixed(1)}% with the star marked and ${(got.before * 100).toFixed(1)}% without — marking has no cost`);
});

test('the instruction only touches the match and the side it was given for', async (t) => {
  const game = await intoAMatch('Scope');
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const O=RBSOppositionInstructions;
    const mine=mySideIx(), them=MU.m.sides[1-mine], us=MU.m.sides[mine];
    const star=O.danger(them.onfield.filter(x=>!x.off&&x.slot!=='GK'));
    O.set(star.p.id,'tight');

    /* our own side must be untouched by a plan aimed at theirs */
    const ours=us.onfield.find(x=>!x.off&&x.slot!=='GK');
    let mineHits=0, mineHitsPlain=0;
    for(let i=0;i<3000;i++) if(MU.m.weighted(us,x=>x.slot==='GK'?0.01:(x.p.ovr||50))===ours) mineHits++;
    O.set(star.p.id,null);
    for(let i=0;i<3000;i++) if(MU.m.weighted(us,x=>x.slot==='GK'?0.01:(x.p.ovr||50))===ours) mineHitsPlain++;

    /* and a match somewhere else in the league must not feel it */
    O.set(star.p.id,'tight');
    const other=G.fixtures.find(f=>!f.played&&!f.cup&&f.h!==G.my&&f.a!==G.my);
    const sim=new MatchSim(other);
    const side=sim.sides[0];
    const man=side.onfield.find(x=>!x.off&&x.slot!=='GK');
    let elsewhere=0;
    for(let i=0;i<3000;i++) if(sim.weighted(side,x=>x.slot==='GK'?0.01:(x.p.ovr||50))===man) elsewhere++;
    /* the same draw with no plan at all */
    O.set(star.p.id,null);
    let elsewherePlain=0;
    for(let i=0;i<3000;i++) if(sim.weighted(side,x=>x.slot==='GK'?0.01:(x.p.ovr||50))===man) elsewherePlain++;

    return {mineHits, mineHitsPlain, elsewhere, elsewherePlain,
      keeperOffered: O.panel().indexOf('>GK<')>=0};
  })()`);

  assert.ok(Math.abs(got.mineHits - got.mineHitsPlain) < 260,
    `our own side moved ${got.mineHits} vs ${got.mineHitsPlain} — the plan is leaking onto the wrong team`);
  assert.ok(Math.abs(got.elsewhere - got.elsewherePlain) < 260,
    `another match in the league moved ${got.elsewhere} vs ${got.elsewherePlain} — the plan is leaking out of this game`);
  assert.equal(got.keeperOffered, false,
    'the panel offers to mark their goalkeeper');
});

test('the panel lists their outfield ten and names the danger', async (t) => {
  const game = await intoAMatch('Panel');
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const O=RBSOppositionInstructions;
    const html=O.panel();
    ACTIONS.instrOpen();
    const sheet=document.getElementById('sheetBody');
    return {
      men:(html.match(/oi-man/g)||[]).length,
      hasStar:/oi-star/.test(html),
      inSheet: !!(sheet && sheet.querySelector('.oi-grid')),
      /* a fresh kick-off must not inherit last week's plan */
      clearedOnKickoff:(function(){
        const p=G.clubs[G.my].players[0];
        O.set(p.id,'tight');
        G.day=nextUserFixture()?nextUserFixture().day:G.day;
        try{ ACTIONS.advance(); ACTIONS.kickoff(); }catch(e){}
        return Object.keys(G.oppInstr||{}).length===0;
      })()
    };
  })()`);

  assert.equal(got.men, 10, `the panel offered ${got.men} opponents, not the outfield ten`);
  assert.equal(got.hasStar, true, 'the panel does not point out who to watch');
  assert.equal(got.inSheet, true, 'the panel is not reaching the touchline sheet');
  assert.equal(got.clearedOnKickoff, true,
    'a plan from an earlier match followed the player into the next one');
});
