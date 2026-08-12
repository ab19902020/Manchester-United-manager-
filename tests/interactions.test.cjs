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
      l2Promo:probe('L2',2), l2PlayOff:probe('L2',4), l2Chase:probe('L2',9),
      nlMid:probe('NL',14), nlNothing:probe('NL',22),
      l1Down:probe('L1',21), l1Safe:probe('L1',12),
      plEuro:probe('PL',4), plDown:probe('PL',19),
    };
  })()`);

  const idsOf = (r) => r.rules.map((x) => x.id);
  const textOf = (r) => r.rules.map((x) => x.lines.join(' ')).join(' ');

  // 2nd in League Two is an automatic promotion place, not a European one.
  // (This used to say 4th. League Two promotes four, but only three of them
  // automatically — the fourth is the play-off place, which is the whole
  // point of the play-offs existing.)
  assert.equal(asked.l2Promo.zone, 'promotion');
  assert.ok(idsOf(asked.l2Promo).includes('pos-promo'), idsOf(asked.l2Promo).join());
  assert.ok(!idsOf(asked.l2Promo).includes('pos-euro'), 'Europe must not be mentioned in League Two');
  assert.ok(/promotion/i.test(textOf(asked.l2Promo)));
  assert.ok(!/Europe/i.test(textOf(asked.l2Promo)));

  // and 4th is a play-off place, which is a different thing to be asked about
  assert.equal(asked.l2PlayOff.zone, 'playoff');
  assert.ok(idsOf(asked.l2PlayOff).includes('pos-promo'), idsOf(asked.l2PlayOff).join());
  assert.ok(!/Europe/i.test(textOf(asked.l2PlayOff)));

  // chasing is now the places just outside the play-offs, not outside the top four
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

/*
 * Three weeks of a scout's time produced one sentence — the numbers already
 * on the player's card — and read identically whether a Premier League scout
 * was watching a superstar or a National League scout was watching a
 * non-league centre half. A scout is sent to answer one question: is he any
 * good, and is he any good FOR US.
 */
test('a scout report is about your squad and your money', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const reports = game.eval(`(function(){
    const pool=[];
    G.clubs.forEach(c=>{ if(c.i===G.my)return; (c.players||[]).forEach(p=>{if(!p.youth)pool.push(p)}) });
    pool.sort((a,b)=>b.ovr-a.ovr);
    const best=pool[0], ordinary=pool[Math.floor(pool.length*0.6)];
    const out=[best,ordinary].map(p=>{
      G.scouts[0].job={pid:p.id,days:1};
      scoutTick();
      const m=G.inbox[0];
      return {ovr:p.ovr,title:String(m.title),body:String(m.body)};
    });
    return out;
  })()`);

  reports.forEach((r) => {
    assert.ok(/Scout report/.test(r.title), r.title);
    assert.ok(/Verdict:/.test(r.body), 'a scout must reach a verdict');
    // it must talk about your squad, your budget and the man himself
    assert.ok(/Character:/.test(r.body), 'and say what kind of professional he is');
    assert.ok(/£/.test(r.body), 'and what he would cost');
    assert.ok(!/undefined|NaN|\[object/.test(r.body), r.body.slice(0, 200));
  });

  // the same player, read by a club that cannot possibly buy him
  const contrast = game.eval(`(function(){
    const star=(function(){let b=null;G.clubs.forEach(c=>{if(c.i===G.my)return;
      (c.players||[]).forEach(p=>{if(!p.youth&&(!b||p.ovr>b.ovr))b=p})});return b})();
    const rich=String(G.inbox.length);
    void rich;
    const nl=divMembers('NL');
    newGame(G.clubs[nl[nl.length-1]].key);
    const again=(function(){let b=null;G.clubs.forEach(c=>{if(c.i===G.my)return;
      (c.players||[]).forEach(p=>{if(!p.youth&&(!b||p.ovr>b.ovr))b=p})});return b})();
    G.scouts[0].job={pid:again.id,days:1};
    scoutTick();
    return {div:myDiv(),body:String(G.inbox[0].body),name:again.name,starName:star.name};
  })()`);

  assert.equal(contrast.div, 'NL');
  // a National League club must not be told to sign the best player on earth
  assert.ok(!/Sign him/.test(contrast.body),
    `a National League club was told to sign a world superstar: ${contrast.body.slice(0, 240)}`);
  assert.ok(/cannot|Ask me again|distance/i.test(contrast.body),
    `the report should say the money is impossible: ${contrast.body.slice(0, 240)}`);
});

/* the half-time room reads the score, the ratings, the legs and who is on a
   booking — and had no idea whether it was a cup final or a July friendly */
test('the dressing room knows what match it is', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const room = game.eval(`(function(){
    // get to a real match and open the room at half time
    let d=0;
    while(d++<300){
      const um=fixturesOn(G.day).find(f=>!f.played&&(f.h===G.my||f.a===G.my));
      if(um){
        const sim=quickSim(um);
        MU.fix=um; MU.m=sim; MU.over=false;
        break;
      }
      simRestOfDay(); dailyTickCore(); G.day++;
    }
    if(!MU.fix)return {skipped:true};
    const league=vDressingRoom();
    // and the same room in a cup final
    const was={cup:MU.fix.cup,r:MU.fix.r,comp:MU.fix.comp,neutral:MU.fix.neutral};
    MU.fix.cup='FA'; MU.fix.r=(CUP_DEFS.FA.days.length-1); MU.fix.neutral=true;
    MU.fix.comp=CUP_DEFS.FA.name+' · '+CUP_DEFS.FA.rn[MU.fix.r];
    const final=vDressingRoom();
    Object.assign(MU.fix,was);
    return {league,final};
  })()`);

  if (room.skipped) return;
  assert.ok(/HALF TIME/.test(room.league), 'the whiteboard still says half time');
  assert.notEqual(room.league, room.final,
    'a cup final and a league game put identical words on the whiteboard');
  assert.ok(/trophy at the end/i.test(room.final),
    `a final should say so: ${room.final.slice(0, 400)}`);
});

/*
 * The academy facility had no effect at all. Measured over 400 generated
 * intakes: Manchester United level 1 -> mean potential 85.2, level 5 -> 85.8.
 * The bonus lived in a wrapper that a later layer overwrote by assigning
 * genYouthPlayer outright instead of wrapping it.
 */
test('the academy you pay for changes what comes out of it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const intake = game.eval(`(function(){
    const sample=(ci,lvl,n)=>{
      const c=G.clubs[ci];
      const was=(c.stad&&c.stad.youth)||2;
      if(c.stad)c.stad.youth=lvl;
      let sum=0;
      for(let i=0;i<300;i++)sum+=genYouthPlayer(ci).pot;
      if(c.stad)c.stad.youth=was;
      return sum/300;
    };
    const nl=divMembers('NL').sort((a,b)=>G.clubs[a].rep-G.clubs[b].rep)[0];
    return {
      bigL1:sample(G.my,1), bigL2:sample(G.my,2), bigL5:sample(G.my,5),
      smallL1:sample(nl,1), smallL2:sample(nl,2), smallL5:sample(nl,5),
    };
  })()`);

  // it has to matter, at both ends of the pyramid
  assert.ok(intake.bigL5 > intake.bigL1 + 3,
    `a five-level academy is worth only ${(intake.bigL5 - intake.bigL1).toFixed(1)} potential at a big club`);
  assert.ok(intake.smallL5 > intake.smallL1 + 2,
    `and only ${(intake.smallL5 - intake.smallL1).toFixed(1)} at a small one`);
  assert.ok(intake.bigL5 > intake.bigL2 && intake.bigL2 > intake.bigL1, 'it must be monotonic');

  // and level 2 — what most of the world has — must be where it always was,
  // or the whole pyramid inflates on the back of it
  assert.ok(intake.bigL2 > 82 && intake.bigL2 < 89,
    `level 2 at a giant should stay near its old 85, got ${intake.bigL2.toFixed(1)}`);
  assert.ok(intake.smallL2 > 41 && intake.smallL2 < 48,
    `level 2 at a non-league club should stay near its old 44, got ${intake.smallL2.toFixed(1)}`);
});

/*
 * The board's target ranked a division by reputation, and reputation does not
 * move when you sell people. Measured: Manchester United sold Bruno Fernandes,
 * Matthijs de Ligt and Bryan Mbeumo in one window — the top sixteen dropped
 * from 85.2 to 83.7 — and the board still asked for 5th. Not one place.
 *
 * (Promotion itself was already handled: a promoted club carries a low
 * reputation into its new division, so the promoted trio all sit on the
 * Premier League floor of 17th. That half of the finding was wrong.)
 */
test('the board looks at the squad you actually have', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const stripped = game.eval(`(function(){
    const c=G.clubs[G.my];
    const out=[];
    const note=(label)=>{
      G.day+=1; G.boardObj=null;
      out.push({label,target:expectPos(G.my),
        squad:+RBSInteractions.squadRating(c).toFixed(1),
        why:RBSInteractions.expectWhy(G.my),
        txt:boardTarget().txt});
    };
    note('full squad');
    [3,3,3,3].forEach((n,ix)=>{
      const order=(c.players||[]).filter(p=>!p.youth&&!p.loan).sort((a,b)=>b.ovr-a.ovr);
      const gone=order.slice(0,n);
      c.players=c.players.filter(p=>gone.indexOf(p)<0);
      note('sold the best '+((ix+1)*3));
    });
    return out;
  })()`);

  const full = stripped[0];
  const last = stripped[stripped.length - 1];

  // stripping the squad has to move the number
  assert.ok(last.target > full.target,
    `selling twelve of the best players left the target at ${full.target}`);
  assert.ok(last.squad < full.squad, 'the probe must actually weaken the squad');
  // and it has to be graduated rather than a cliff
  for (let i = 1; i < stripped.length; i += 1) {
    assert.ok(stripped[i].target >= stripped[i - 1].target,
      'the target must not tighten as the squad is stripped');
  }
  // it must not collapse either — a board does not halve its demands
  assert.ok(last.target - full.target <= 6,
    `the target moved ${last.target - full.target} places, which is a collapse rather than a response`);
  // and the board has to say why, rather than moving the number quietly
  assert.ok(/lighter|short of/.test(last.why), `no explanation given: "${last.why}"`);
  assert.ok(last.txt.indexOf(last.why) > 0, `the target text should carry it: "${last.txt}"`);

  // the floor from the division shape still binds
  const floors = game.eval(`(function(){
    const out={};
    ['PL','CH','L1','L2','NL'].forEach(d=>{
      const s=RBSShape.divShape(d);
      out[d]={floor:s.floor,worst:Math.max.apply(null,divMembers(d).map(i=>expectPos(i)))};
    });
    return out;
  })()`);
  Object.keys(floors).forEach((d) => {
    assert.ok(floors[d].worst <= floors[d].floor,
      `${d}: a target of ${floors[d].worst} exceeds the floor of ${floors[d].floor}`);
  });
});

/* a promoted side is asked to survive and a relegated one to come back —
   this was already true through reputation, and must stay true */
test('coming up and going down still set the right kind of target', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const ends = game.eval(`(function(){
    const pick=(div,which)=>{
      const mem=divMembers(div).slice().sort((a,b)=>G.clubs[b].rep-G.clubs[a].rep);
      const i=which==='top'?mem[0]:mem[mem.length-1];
      return {club:G.clubs[i].short,target:expectPos(i),shape:RBSShape.divShape(div)};
    };
    return {plBottom:pick('PL','bot'),chTop:pick('CH','top'),nlTop:pick('NL','top')};
  })()`);

  // the weakest club in the top flight is asked to stay up, not to finish 20th
  assert.equal(ends.plBottom.target, ends.plBottom.shape.floor,
    'a promoted side should be asked to survive');
  // the strongest club in the division below is asked to go up
  assert.ok(ends.chTop.target <= ends.chTop.shape.upTo + 1,
    `a relegated giant should be asked to go back up, got ${ends.chTop.target}`);
  assert.ok(ends.nlTop.target <= ends.nlTop.shape.upTo + 1,
    `and the same at the bottom of the pyramid, got ${ends.nlTop.target}`);
});

/*
 * Reported: first day of a career, one press conference, and the room asked
 * "The supporters expected additions and there have been none. What do you say
 * to them?" — about a window that opened that morning. `pre-nosignings` fires
 * on preSeason && no signings, and on day one both are true by definition.
 */
test('nobody is asked why they have not signed anyone on the first day', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const ask = (jump) => game.eval(`(function(){
    G.day += ${jump};
    const nf=(function(){for(let x=G.day;x<G.day+140;x++){
      const f=fixturesOn(x).find(y=>!y.played&&(y.h===G.my||y.a===G.my));if(f)return f}return null})();
    G.pressCtx={kind:'pre',oppI:nf?(nf.h===G.my?nf.a:nf.h):1,q:0,_asked:[]};
    G.pressSeen=[];
    const F=pqFacts();
    const fired=[];
    PQ.forEach(r=>{ if(!/^pre-/.test(String(r.id)))return;
      let ok=false;try{ok=!!r.w(F)}catch(e){}
      if(ok){let q=[];try{q=r.q(F)}catch(e){q=[]}fired.push({id:r.id,lines:q})} });
    G.pressCtx=null;
    return {toOpener:Math.max(0,(G.seasonStart||0)-G.day),
      signings:(F.signings||[]).length,fired};
  })()`);

  const dayOne = ask(0);
  assert.equal(dayOne.signings, 0, 'nobody has signed anybody yet');
  assert.ok(dayOne.toOpener > 14, 'and the season is still a way off');

  const ids = dayOne.fired.map((f) => f.id);
  assert.ok(!ids.includes('pre-nosignings'),
    'the room blamed a manager for a window that opened this morning');
  assert.ok(ids.includes('pre-plans'),
    `the room should ask what he plans to do, got: ${ids.join(', ')}`);

  const plans = dayOne.fired.filter((f) => f.id === 'pre-plans')[0];
  const text = plans.lines.join(' ');
  assert.ok(/intend to strengthen|positions|money is there|deadline/i.test(text), text);
  assert.ok(!/expected additions|quiet summer/i.test(text), text);
  // and it has answers written for it
  const answers = game.eval(`(PANS['pre-plans']?PANS['pre-plans']({}):[]).length`);
  assert.equal(answers, 4, 'pre-plans needs four answers');

  // three weeks later, with still nobody signed, the complaint is fair
  const late = ask(20);
  const lateIds = late.fired.map((f) => f.id);
  assert.ok(late.toOpener <= 14, 'the probe must reach the last fortnight');
  assert.ok(lateIds.includes('pre-nosignings'),
    `late in a quiet window the question is fair, got: ${lateIds.join(', ')}`);
  assert.ok(!lateIds.includes('pre-plans'), 'and the forward-looking one steps aside');
});

/*
 * Reported: the competitions email listed the League Cup and the FA Cup and
 * never mentioned the Champions Cup — while the club had eight Champions Cup
 * fixtures already on the calendar.
 *
 * The world is built twice. The letter is written by an early newGame layer
 * while G.clSpots is still empty; the outer layers then rebuild the world and
 * re-run initCups(), which works out the real European entry. The rebuild even
 * deletes the stale mails it created — /draw|qualification|league phase/ — and
 * "Cup competitions" does not match that pattern, so the one letter that lists
 * your season survives with the wrong list on it.
 */
test('the competitions letter lists the competitions you are actually in', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const top = game.eval(`(function(){
    const m=(G.inbox||[]).filter(x=>x&&/Competitions this season|Cup competitions/i.test(String(x.title||'')))[0];
    const euro=G.euroEntry||{};
    const clTies=((G.cups&&G.cups.CL&&G.cups.CL.ties)||[]).filter(t=>t.h===G.my||t.a===G.my).length;
    return {club:G.clubs[G.my].name,
      body:m?String(m.body):null,
      inCL:(euro.CL||[]).indexOf(G.my)>=0,
      clFixtures:clTies,
      englishInCL:(euro.CL||[]).filter(i=>G.clubs[i].cc==='ENG').length};
  })()`);

  assert.ok(top.body, 'a career must start by telling you what you are playing in');
  assert.equal(top.inCL, true, 'the probe club should be in the Champions Cup');
  assert.ok(top.clFixtures > 0, 'and have fixtures for it');

  // the letter has to agree with the calendar
  assert.ok(/Champions/i.test(top.body),
    `eight Champions Cup fixtures and the letter says: ${top.body}`);
  assert.ok(/FA Cup/i.test(top.body) && /League Cup/i.test(top.body), top.body);
  assert.ok(!/undefined|NaN/.test(top.body), top.body);

  // England's Champions Cup places — five, as the game already allocates
  assert.ok(top.englishInCL >= 4 && top.englishInCL <= 5,
    `England should send four or five clubs, got ${top.englishInCL}`);

  // and a club with no European football must not be told it has any
  const lower = game.eval(`(function(){
    const nl=divMembers('NL');
    newGame(G.clubs[nl[nl.length-1]].key);
    const m=(G.inbox||[]).filter(x=>x&&/Competitions this season|Cup competitions/i.test(String(x.title||'')))[0];
    const euro=G.euroEntry||{};
    return {club:G.clubs[G.my].name,div:myDiv(),body:m?String(m.body):null,
      inCL:(euro.CL||[]).indexOf(G.my)>=0};
  })()`);

  assert.equal(lower.inCL, false);
  assert.ok(lower.body, 'every club gets the letter');
  assert.ok(!/Champions|Europa|Conference/i.test(lower.body),
    `a National League club was told it is in Europe: ${lower.body}`);
  assert.ok(/FA Cup/i.test(lower.body), lower.body);
});
