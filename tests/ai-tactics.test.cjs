const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   THE OTHER CLUBS HAVE A WAY OF PLAYING NOW
   ---------------------------------------------------------------------
   Every club that was not yours took its instructions as constants:
   Mixed, Central, Normal, Medium, Standard, Normal, and no width, trap
   or marking at all. Four distinct instruction sets across a division.

   Two things have to be true together, and the second is the one that
   killed the first attempt at this file: the league must be VARIED, and
   it must not be quietly harder to score in. Three of the four extra
   instructions are one-way in the engine -- the trap is worth 1.055
   defensively and costs nothing, man-marking 1.02, counter-pressing
   helps all three multipliers -- so handing them out across a division
   without centring them is a league-wide nerf wearing a disguise.
   ===================================================================== */

/* The game's own method: day order, with recovery between match days.
   Looping quickSim over the fixture list instead measures a league of
   exhausted players -- 2.1 goals a game against 2.7 -- and every
   conclusion drawn from it is about tiredness. */
const SEASON = (on) => `(function(){
  RBSAiTactics.set(${on});
  RBSWorldSeed.build(20260901, 0);
  let seed=0xdecafbad;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const fx=G.fixtures.filter(f=>f.div==='PL').sort((a,b)=>a.day-b.day);
  let cur=0; const seen={};
  fx.forEach(f=>{
    while(cur<f.day){dailyRecovery();cur++}
    const m=quickSim(f);
    m.sides.forEach(s=>{const t=s.tac;
      seen[[t.passStyle,t.tempo,t.press,t.line,t.tackling,
            t.width||'-',t.trap||'-',t.marking||'-'].join('/')]=1});
  });
  const n=fx.length, goals=fx.reduce((s,f)=>s+f.hs+f.as,0);
  return {
    styles:Object.keys(seen).length,
    gpm:goals/n,
    draws:fx.filter(f=>f.hs===f.as).length/n,
    zeros:fx.filter(f=>f.hs===0&&f.as===0).length/n
  };
})()`;

/* A FRESH GAME PER SEASON. Running both conditions in one page reuses a
   world whose fixtures are already played and leaves the seeded
   Math.random from the first run in place, which collapsed the counts to
   3 and 1 and had nothing to do with the module. */
async function season(on) {
  const game = await createGame();
  try {
    game.eval('newGame(0)');
    return game.eval(SEASON(on));
  } finally { game.close(); }
}

test('a division no longer plays one way', async () => {
  const off = await season(false);
  const on = await season(true);

  assert.ok(off.styles <= 6,
    `the shipped game had ${off.styles} instruction sets — this test's premise has changed`);
  assert.ok(on.styles >= 9,
    `only ${on.styles} instruction sets across a division, against ${off.styles} before`);
});

test('variety does not quietly make the league harder to score in', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const bands = game.window.RBSMatchModel.regressionBands();
  const on = game.eval(SEASON(true));

  assert.ok(on.gpm >= bands.goalsPerMatch[0] && on.gpm <= bands.goalsPerMatch[1],
    `goals a match fell to ${on.gpm.toFixed(3)}, outside ${bands.goalsPerMatch.join('-')}`);
  assert.ok(on.draws >= bands.drawRate[0] && on.draws <= bands.drawRate[1],
    `the draw rate is ${(on.draws * 100).toFixed(1)}%, outside ${bands.drawRate.join('-')}`);
  assert.ok(on.zeros >= bands.goallessRate[0] && on.zeros <= bands.goallessRate[1],
    `the goalless rate is ${(on.zeros * 100).toFixed(1)}%, outside ${bands.goallessRate.join('-')}`);
});

test('the one-way instructions are centred, not handed out free', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const A=RBSAiTactics;
    /* the trap, man-marking and counter-pressing are all pure gain in
       the engine's own table, so an uncentred league drifts defensive */
    const everything={width:'Narrow',counter:'Counter-press',trap:'On',marking:'Man'};
    const nothing={width:'Standard',counter:'Off',trap:'Off',marking:'Zonal'};
    return {
      rawBest:A.raw(everything), rawNone:A.raw(nothing),
      modBest:A.modifiers(everything), modNone:A.modifiers(nothing),
      centre:A.centre()
    };
  })()`);

  /* raw: doing everything is strictly better defensively than doing nothing */
  assert.ok(got.rawBest.def > got.rawNone.def,
    'the engine table is not what this file thinks it is');
  assert.equal(got.rawNone.def, 1, 'a plain side should earn no raw modifier at all');

  /* centred: the spread survives, but the middle is 1 rather than the floor */
  assert.ok(got.modBest.def > got.modNone.def,
    'centring flattened the difference between a defensive side and an open one');
  assert.ok(got.modNone.def < 1,
    `a side that does none of it should be BELOW the league average, not on it (${got.modNone.def.toFixed(4)})`);
  assert.ok(got.centre.def > 1,
    'the league average of a one-way table must be above 1, or there is nothing to centre');
});

test('your own instructions are never overwritten', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    G.tacs.width='Wide'; G.tacs.press='Low'; G.tacs.line='Deep';
    G.tacs.trap='On'; G.tacs.marking='Man'; G.tacs.tempo='Slow';
    const f=G.fixtures.find(x=>!x.played&&!x.cup&&(x.h===G.my||x.a===G.my));
    const m=new MatchSim(f);
    const mine=m.sides[f.h===G.my?0:1], theirs=m.sides[f.h===G.my?1:0];
    return {
      mine:[mine.tac.width,mine.tac.press,mine.tac.line,mine.tac.trap,mine.tac.marking,mine.tac.tempo].join('/'),
      isMy:!!mine.isMy,
      theirsHasAWay: !!(theirs.tac.width && theirs.tac.marking)
    };
  })()`);

  assert.equal(got.isMy, true, 'the test did not find the human side');
  assert.equal(got.mine, 'Wide/Low/Deep/On/Man/Slow',
    'the module overwrote the instructions the manager chose');
  assert.equal(got.theirsHasAWay, true,
    'the opposition still has no width or marking of its own');
});
