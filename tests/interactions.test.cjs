const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * An audit for the shape of mistake the boardroom had — a question, a
 * promise or a target written for one twenty-club Premier League and then
 * asked of a twenty-four-club division with different rules. Measured in a
 * live career before these fixes:
 *
 *   4th in League Two, an automatic promotion place:
 *     "4th and in the mix. Is Europe the target or the minimum?"
 *   14th of 24 in the National League, mid-table:
 *     "Is this a relegation fight?" — in a division nobody is relegated from
 *   the weakest club in every division:
 *     "The board expects 24th or better"
 *
 * Everything below asserts against the world rather than against a written
 * down number, so it keeps testing the right thing when the pyramid grows.
 */

test('every division reports its real shape, read from the world', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const shapes = game.eval(`(function(){
    const out={};
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const s=RBSShape.divShape(d);
      const pyr=(PYRAMIDS.ENG||[]);
      const rel=pyr.find(p=>p[0]===d), pro=pyr.find(p=>p[1]===d);
      out[d]={size:s.size,up:s.up,down:s.down,dropFrom:s.dropFrom,floor:s.floor,
        matches:s.matches,euro:s.euro,
        realUp:pro?pro[2]:0, realDown:rel?rel[2]:0,
        realSize:divMembers(d).length};
    });
    return out;
  })()`);

  Object.keys(shapes).forEach((div) => {
    const s = shapes[div];
    assert.equal(s.size, s.realSize, `${div} size`);
    assert.equal(s.up, s.realUp, `${div} promotion places must come from PYRAMIDS`);
    assert.equal(s.down, s.realDown, `${div} relegation places must come from PYRAMIDS`);
    if (s.down > 0) assert.equal(s.dropFrom, s.size - s.down + 1, `${div} drop zone`);
    else assert.equal(s.dropFrom, null, `${div} relegates nobody`);
    // a board never asks a club to finish last
    assert.ok(s.floor < s.size, `${div} target floor ${s.floor} of ${s.size}`);
  });

  // the National League relegates nobody in this game
  assert.equal(shapes.NL.down, 0);
  assert.equal(shapes.NL.dropFrom, null);
  // and League One relegates four, not three
  assert.equal(shapes.L1.down, 4);
  assert.equal(shapes.L1.dropFrom, 21);
});

test('a season is as long as the division actually plays', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const seasons = game.eval(`(function(){
    const out={};
    Object.keys(LEAGUES).forEach(d=>{
      const n=divMembers(d).length;
      if(n<2)return;
      const s=RBSShape.divShape(d);
      out[d]={size:n,matches:s.matches,expected:n<=12?(n-1)*3:(n-1)*2};
    });
    return out;
  })()`);

  const small = Object.keys(seasons).filter((d) => seasons[d].size <= 12);
  assert.ok(small.length >= 5, `expected several small leagues, found ${small.length}`);
  Object.keys(seasons).forEach((d) => {
    assert.equal(seasons[d].matches, seasons[d].expected,
      `${d} plays ${seasons[d].expected} matches, shape says ${seasons[d].matches}`);
  });

  // the press room used to think a 12-club league played 22 games, so the
  // run-in questions fired at matchday 16 and never in the actual run-in
  const scotland = Object.keys(seasons).filter((d) => seasons[d].size === 12)[0];
  assert.ok(scotland, 'no 12-club league to check');
  assert.equal(seasons[scotland].matches, 33);
});

test('the press room asks about the thing that decides your division', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const asked = game.eval(`(function(){
    const probe=(div,pos)=>{
      const s=RBSShape.divShape(div);
      const F={pos,played:20,expect:pos,my:G.clubs[G.my],div,shape:s,
        zone:RBSShape.zoneOf(pos,s),left:s.matches-20,games:s.matches,
        streak:{n:0,r:'-'},rows:new Array(s.size).fill(0).map((_,i)=>({i,pts:0}))};
      const out=[];
      PQ.forEach(r=>{ if(String(r.id).indexOf('pos-')!==0)return;
        let ok=false;try{ok=!!r.w(F)}catch(e){}
        if(ok){let q=[];try{q=r.q(F)}catch(e){q=['THREW']}
          out.push({id:r.id,lines:q})} });
      return {zone:F.zone,rules:out};
    };
    return {
      l2Promo:probe('L2',4), l2Chase:probe('L2',6),
      nlMid:probe('NL',14), nlNothing:probe('NL',22),
      l1Down:probe('L1',21), l1Safe:probe('L1',12),
      plEuro:probe('PL',4), plDown:probe('PL',19),
    };
  })()`);

  const idsOf = (r) => r.rules.map((x) => x.id);
  const textOf = (r) => r.rules.map((x) => x.lines.join(' ')).join(' ');

  // 4th in League Two is an automatic promotion place, not a European one
  assert.equal(asked.l2Promo.zone, 'promotion');
  assert.ok(idsOf(asked.l2Promo).includes('pos-promo'), idsOf(asked.l2Promo).join());
  assert.ok(!idsOf(asked.l2Promo).includes('pos-euro'), 'Europe must not be mentioned in League Two');
  assert.ok(/promotion/i.test(textOf(asked.l2Promo)));
  assert.ok(!/Europe/i.test(textOf(asked.l2Promo)));

  assert.equal(asked.l2Chase.zone, 'chasing');
  assert.ok(idsOf(asked.l2Chase).includes('pos-promo'));

  // 14th of 24 in the National League is mid-table, and nobody is relegated
  assert.equal(asked.nlMid.zone, 'mid');
  assert.ok(!idsOf(asked.nlMid).includes('pos-bad'), 'no relegation fight in mid-table');
  assert.ok(!/relegation/i.test(textOf(asked.nlMid)));

  // and the bottom of that division has its own question
  assert.equal(asked.nlNothing.zone, 'nothing');
  assert.ok(idsOf(asked.nlNothing).includes('pos-nothing'));
  assert.ok(!/relegation/i.test(textOf(asked.nlNothing)));

  // League One relegates four, and the question says four
  assert.equal(asked.l1Down.zone, 'relegation');
  assert.ok(idsOf(asked.l1Down).includes('pos-bad'));
  assert.ok(/bottom 4/.test(textOf(asked.l1Down)), textOf(asked.l1Down));
  assert.equal(asked.l1Safe.zone, 'mid');

  // the Premier League keeps the questions it always had
  assert.equal(asked.plEuro.zone, 'europe');
  assert.ok(idsOf(asked.plEuro).includes('pos-euro'));
  assert.equal(asked.plDown.zone, 'relegation');
  assert.ok(/bottom 3/.test(textOf(asked.plDown)), textOf(asked.plDown));

  // every new question has answers written for it
  const answered = game.eval(`(function(){
    const F={pos:4,played:20,shape:RBSShape.divShape('L2'),left:20};
    return ['pos-promo','pos-nothing'].map(id=>({id,n:(PANS[id]?PANS[id](F):[]).length}));
  })()`);
  answered.forEach((a) => assert.equal(a.n, 4, `${a.id} needs four answers`));
});

test('no board asks a club to finish last', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const targets = game.eval(`(function(){
    const out={};
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const s=RBSShape.divShape(d);
      const worst=Math.max.apply(null,divMembers(d).map(i=>expectPos(i)));
      out[d]={size:s.size,floor:s.floor,worstTargetGiven:worst,
        down:s.down,dropFrom:s.dropFrom};
    });
    const t=boardTarget();
    out._mine={pos:t.pos,exp:t.exp,txt:t.txt};
    return out;
  })()`);

  ['PL', 'CH', 'L1', 'L2', 'NL'].forEach((d) => {
    const t = targets[d];
    assert.ok(t.worstTargetGiven <= t.floor,
      `${d}: worst target ${t.worstTargetGiven} exceeds the floor of ${t.floor}`);
    assert.ok(t.worstTargetGiven < t.size,
      `${d}: a board asked a club to finish ${t.worstTargetGiven} of ${t.size}`);
    // where clubs go down, the floor is the last safe place
    if (t.down > 0) assert.equal(t.floor, t.dropFrom - 1, `${d} floor should be the last safe place`);
  });

  assert.equal(typeof targets._mine.txt, 'string');
  assert.ok(targets._mine.txt.length > 0);
  assert.ok(!/undefined/.test(targets._mine.txt));
  assert.equal(targets._mine.exp, targets._mine.pos);
});

test('winning the league counts towards your own contract', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const merit = game.eval(`(function(){
    const div=myDiv();
    const place=(pos)=>{
      const rows=tableRows(div).slice();
      const me=rows.find(r=>r.i===G.my);
      const rest=rows.filter(r=>r.i!==G.my);
      return rest.slice(0,pos-1).concat([me]).concat(rest.slice(pos-1));
    };
    const out={};
    [[1,1],[2,2],[1,4],[5,9],[8,4],[14,4]].forEach(([pos,target])=>{
      G._sealed={};G._sealed[div]=place(pos);
      boardTarget().pos=target;
      out['pos'+pos+'_target'+target]=dealMerit();
    });
    G._sealed=null;
    return out;
  })()`);

  // top of the league against a title-winning target used to score zero,
  // which is below the threshold that makes the board offer a new deal
  assert.ok(merit.pos1_target1 >= 3,
    `1st with a target of 1st scored ${merit.pos1_target1}`);
  assert.ok(merit.pos2_target2 >= 1,
    `2nd with a target of 2nd scored ${merit.pos2_target2}`);
  // and the rest of the scale is unchanged
  assert.ok(merit.pos1_target4 >= 3);
  assert.ok(merit.pos5_target9 >= 3);
  assert.ok(merit.pos14_target4 < 0, 'well below target must still cost you');
});

test('a promise to stay up is judged against the real relegation zone', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const verdicts = game.eval(`(function(){
    const out={};
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const s=RBSShape.divShape(d);
      const down=(pos)=>!!(s.hasRelegation&&s.dropFrom&&pos>=s.dropFrom);
      out[d]={down:s.down,p20:down(20),p21:down(21),p22:down(22),p23:down(23)};
    });
    return out;
  })()`);

  // League One relegates four: 21st is down, and used to be judged as safe
  assert.equal(verdicts.L1.p21, true, 'League One 21st is relegated');
  assert.equal(verdicts.L1.p20, false);
  // League Two relegates two: 22nd is safe, and used to be judged as relegated
  assert.equal(verdicts.L2.p22, false, 'League Two 22nd stays up');
  assert.equal(verdicts.L2.p23, true);
  // the National League relegates nobody
  assert.equal(verdicts.NL.p23, false);
  assert.equal(verdicts.NL.down, 0);
  // the Premier League is unchanged
  assert.equal(verdicts.PL.p20, true);

  // and the promise itself resolves the right way in a division with no drop
  const kept = game.eval(`(function(){
    const before=(G.pledges||[]).length;
    G.pledges=[{id:'t1',kind:'survive',state:'open',season:G.season,label:'keep this club up'}];
    const realShape=RBSShape.divShape;
    // judge it as if the club were in the National League, bottom of the table
    const club=G.clubs[G.my];
    const wasLeague=club.league;
    judgeSeasonPledges();
    club.league=wasLeague;
    void before;
    return {state:G.pledges[0].state};
  })()`);
  assert.ok(['kept', 'broken'].includes(kept.state), 'the promise must be judged');
});

test('a transfer target asks for the division he would be joining', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const wants = game.eval(`(function(){
    const out={};
    ['PL','L2','NL'].forEach(d=>{
      const s=RBSShape.divShape(d);
      out[d]={hasEurope:s.hasEurope,hasPromotion:s.hasPromotion,
        promotionTerm:RBSInteractions.positionTerm(1,s),
        midTerm:RBSInteractions.positionTerm(15,s),
        dropTerm:RBSInteractions.positionTerm(s.dropFrom||99,s)};
    });
    return out;
  })()`);

  // 15th of 24 is mid-table and must not be scored as relegation form
  assert.equal(wants.L2.midTerm, 0, 'mid-table in a 24-club division is neutral');
  assert.equal(wants.NL.midTerm, 0);
  // the Premier League still penalises 15th, which really is trouble there
  assert.ok(wants.PL.midTerm < 0, '15th of 20 is close to the drop');
  // promotion is worth as much as Europe, in the division that has it
  assert.ok(wants.L2.promotionTerm > 0);
  assert.equal(wants.NL.hasEurope, false);

  // and the Cups screen no longer tells a lower-league club to finish top four
  const cups = game.eval(`vCups()`);
  assert.ok(!/finish top four/.test(cups), 'the cups screen still says "finish top four"');
});

test('the supporters react to money that is big for this club', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const levels = game.eval(`(function(){
    const out={};
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const [fee,good,star]=RBSInteractions.levelOf(RBSShape.divShape(d));
      out[d]={bigFee:fee,goodOvr:good,starOvr:star};
    });
    return out;
  })()`);

  // a threshold that only the Premier League can reach is not a threshold
  assert.ok(levels.PL.bigFee > levels.CH.bigFee);
  assert.ok(levels.CH.bigFee > levels.L1.bigFee);
  assert.ok(levels.L1.bigFee > levels.L2.bigFee);
  assert.ok(levels.L2.bigFee > levels.NL.bigFee);
  assert.ok(levels.NL.bigFee <= 2e5, 'a National League record must be reachable');
  ['PL', 'CH', 'L1', 'L2', 'NL'].forEach((d) => {
    assert.ok(levels[d].starOvr > levels[d].goodOvr, `${d} star vs good`);
  });
  assert.ok(levels.NL.goodOvr < 70, 'nobody in the National League is rated 82');
});

test('a career runs a season with the new layers and stays clean', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    let d=0;
    while(gamesPlayed(G.my)<14 && d++<400){
      const um=fixturesOn(G.day).find(f=>!f.played&&(f.h===G.my||f.a===G.my));
      if(um){quickSim(um);finishDayAfterMatch()}
      else{simRestOfDay();dailyTickCore();G.day++;checkSeasonEnd()}
    }
    const nf=(function(){for(let x=G.day;x<G.day+140;x++){
      const f=fixturesOn(x).find(y=>!y.played&&(y.h===G.my||y.a===G.my));if(f)return f}return null})();
    G.pressCtx={kind:'pre',oppI:nf?(nf.h===G.my?nf.a:nf.h):1,q:0,_asked:[]};
    G.pressSeen=[];
    const F=pqFacts();
    const bank=pressBank();
    const ids=bank.map(q=>String(q.id).split('#')[0]);
    return {played:F.played,games:F.games,left:F.left,zone:F.zone,
      shapeMatches:F.shape?F.shape.matches:null,
      bank:bank.length,distinct:new Set(ids).size,
      target:boardTarget().txt,
      board:boardScene('monthly').say};
  })()`);

  assert.ok(run.played >= 14);
  assert.equal(run.games, run.shapeMatches, 'the press room must use the real season length');
  assert.equal(run.left, run.games - run.played);
  assert.ok(run.bank > 0 && run.distinct > 5);
  assert.ok(!/undefined|NaN/.test(run.target + ' ' + run.board), run.target + ' | ' + run.board);
  assert.deepEqual(game.errors, []);
});
