const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   A SCOUTING REPORT THAT CANNOT LIE
   ---------------------------------------------------------------------
   Every club has a way of playing now, and until this report there was
   no way to find out what it was before kick-off -- which left the
   touchline instructions and the opposition marking as guesses.

   The point of the report is not that it exists but that it AGREES with
   the match. It is not prose written alongside the engine; it asks the
   engine the same question `_side` will ask, from the eleven `autoPick`
   will choose. The first test is that agreement, because a scouting note
   maintained separately from the thing it describes is wrong the day
   somebody moves a threshold.
   ===================================================================== */

test('the report says what the side will actually do', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const R=RBSOppositionReport;
    let checked=0, agreed=0, mismatch=null;
    const mine=G.my;
    divMembers('PL').filter(i=>i!==mine).slice(0,10).forEach(ci=>{
      const plan=R.planFor(ci, mine);
      if(!plan) return;
      /* what the match will really use for that club against us */
      const f=G.fixtures.find(x=>!x.played&&!x.cup&&
        ((x.h===ci&&x.a===mine)||(x.a===ci&&x.h===mine)));
      if(!f) return;
      const m=new MatchSim(f);
      const side=m.sides[f.h===ci?0:1];
      checked++;
      const keys=['passStyle','tempo','press','line','tackling','width','trap','marking','counter'];
      const same=keys.every(k=>String(plan.style[k])===String(side.tac[k]));
      if(same) agreed++;
      else if(!mismatch) mismatch={club:G.clubs[ci].short,
        said:keys.map(k=>k+'='+plan.style[k]).join(' '),
        did:keys.map(k=>k+'='+side.tac[k]).join(' ')};
    });
    return {checked, agreed, mismatch};
  })()`);

  assert.ok(got.checked >= 5, `only ${got.checked} opponents could be checked`);
  assert.equal(got.agreed, got.checked,
    `the report disagreed with the match for ${got.mismatch && got.mismatch.club}:\n`
    + `  said: ${got.mismatch && got.mismatch.said}\n  did:  ${got.mismatch && got.mismatch.did}`);
});

test('different opponents read differently, and none of it contradicts itself', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const R=RBSOppositionReport;
    const lines=[];
    divMembers('PL').filter(i=>i!==G.my).forEach(ci=>{
      const plan=R.planFor(ci,G.my);
      if(plan) lines.push(R.sentence(plan.style));
    });
    return {
      n:lines.length,
      distinct:[...new Set(lines)].length,
      /* the fault this guards: press and line were read out as separate
         clauses, which produced "they press high, drop deep" */
      contradictory:lines.filter(l=>/press high/.test(l)&&/drop|deep/.test(l)
        &&!/deep block, pressing in bursts/.test(l)).length,
      /* per SENTENCE: the report is deliberately two or three sentences,
         so a whole-string test for two "and"s flags "…and press high.
         … and they swarm you", which is two clean clauses */
      doubleAnd:lines.filter(l=>l.split(/(?<=\.)\s+/)
        .some(sent=>(sent.match(/ and /g)||[]).length>1)).length,
      empty:lines.filter(l=>!l||!l.trim()).length,
      sample:lines.slice(0,3)
    };
  })()`);

  assert.ok(got.n >= 15, `only ${got.n} reports produced`);
  assert.ok(got.distinct >= 4,
    `only ${got.distinct} different reports across a division — everyone reads the same`);
  assert.equal(got.contradictory, 0,
    `a report says a side presses high AND drops deep: ${JSON.stringify(got.sample)}`);
  assert.equal(got.doubleAnd, 0,
    `a report runs two "and"s into one clause: ${JSON.stringify(got.sample)}`);
  assert.equal(got.empty, 0, 'a report came back blank');
});

test('it is on the home screen, under the fixture', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Scout');

  const got = game.eval(`(function(){
    UI.view='home'; render();
    const o=document.querySelector('.opr');
    return {
      shown:!!o,
      underFixture: !!(o && o.previousElementSibling
        && /fixture-hero/.test(o.previousElementSibling.className||'')),
      hasShape: !!(o && o.querySelector('.opr-h')),
      hasLine: !!(o && o.querySelector('.opr-l')),
      namesAMan: !!(o && o.querySelector('.opr-m')),
      /* rendering twice must not stack two reports */
      once:(function(){ render(); render();
        return document.querySelectorAll('.opr').length })()
    };
  })()`);

  assert.equal(got.shown, true, 'no scouting report on the home screen');
  assert.equal(got.underFixture, true, 'the report is not attached to the fixture');
  assert.equal(got.hasShape, true, 'the report does not give their shape');
  assert.equal(got.hasLine, true, 'the report does not say how they play');
  assert.equal(got.namesAMan, true, 'the report does not name anyone to watch');
  assert.equal(got.once, 1, `re-rendering stacked ${got.once} reports`);
});

/* =====================================================================
   AND THE CLUBS WHO CAME UP
   ---------------------------------------------------------------------
   Promotion floored all three at one reputation, 5950, which sat 1,100
   below the club above them when every other adjacent pair in the
   division differs by 200-350. aiMentality reads that gap, and anything
   past -700 is Counter -- so the promoted three set up to counter-attack
   even against Sunderland and Leeds, the games a promoted side targets.
   ===================================================================== */

test('a promoted club arrives as a Premier League club', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const by={};
    divMembers('PL').forEach(i=>{by[G.clubs[i].key]=G.clubs[i].rep});
    const up=['HUL','IPS','COV'].map(k=>by[k]);
    /* the two established clubs they have to compete with */
    const strugglers=Object.entries(by)
      .filter(([k])=>['HUL','IPS','COV'].indexOf(k)<0)
      .map(([,v])=>v).sort((a,b)=>a-b).slice(0,2);
    return {up, strugglers,
      allSame: up[0]===up[1] && up[1]===up[2],
      worstGap: Math.min(...strugglers) - Math.max(...up)};
  })()`);

  assert.equal(got.allSame, false,
    `all three promoted clubs share one reputation (${got.up.join(', ')})`);
  /* Counter starts at a 700 gap. Against the two clubs they are actually
     fighting, a promoted side should be able to have a go. */
  assert.ok(got.worstGap < 700,
    `the best promoted club is still ${got.worstGap} behind the weakest established one, `
    + `so it counter-attacks even against them`);
  assert.ok(got.worstGap > 0,
    'a promoted club should still arrive below the clubs that stayed up');
});
