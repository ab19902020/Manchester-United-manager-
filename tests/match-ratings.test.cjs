const test = require('node:test');
const assert = require('node:assert/strict');

const ratings = require('../src/match-ratings.js');
const { createGame, startCareer } = require('./game-harness.cjs');

test('save rewards diminish instead of growing linearly forever', () => {
  assert.equal(ratings.saveReward(1), 0.10);
  assert.equal(ratings.saveReward(4), 0.07);
  assert.equal(ratings.saveReward(7), 0.045);
  assert.equal(ratings.saveReward(10), 0.025);
  assert.ok(ratings.saveRewardTotal(10) < 0.7);
  assert.ok(ratings.saveRewardTotal(10) > ratings.saveRewardTotal(5));
});

test('goalkeepers no longer dominate Man of the Match across English divisions', { timeout: 90000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  game.eval(`(()=>{
    let seed=0x1a2b3c4d;
    Math.random=()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
  })()`);
  await startCareer(game, 'Rating Regression');

  const result = game.eval(`(()=>{
    let seed=0x5eed1234;
    Math.random=()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
    const divisions=['PL','CH','L1','L2','NL'];
    const fixtures=divisions.flatMap(division=>G.fixtures
      .filter(f=>f.div===division).sort((a,b)=>a.day-b.day).slice(0,120))
      .sort((a,b)=>a.day-b.day);
    let current=0;
    const byDivision={};
    const position={GK:{n:0,sum:0},OUT:{n:0,sum:0}};
    fixtures.forEach(f=>{
      while(current<f.day){dailyRecovery();current++}
      const match=quickSim(f);
      const row=byDivision[f.div]||(byDivision[f.div]={matches:0,gk:0});
      row.matches++;
      if(match.motm&&match.motm.slot==='GK')row.gk++;
      match.sides.flatMap(side=>side.onfield).forEach(player=>{
        const group=player.slot==='GK'?position.GK:position.OUT;
        group.n++;group.sum+=player.rating;
      });
    });
    Object.values(byDivision).forEach(row=>row.share=row.gk/row.matches);
    const gkAwards=Object.values(byDivision).reduce((sum,row)=>sum+row.gk,0);
    return {matches:fixtures.length,share:gkAwards/fixtures.length,byDivision,
      gkRating:position.GK.sum/position.GK.n,
      outfieldRating:position.OUT.sum/position.OUT.n};
  })()`);

  assert.equal(result.matches, 600);
  assert.ok(result.share >= 0.03, `keepers should still win exceptional matches (${JSON.stringify(result)})`);
  assert.ok(result.share <= 0.25, `keepers won too many awards (${JSON.stringify(result)})`);
  for (const [division, row] of Object.entries(result.byDivision)) {
    assert.ok(row.share <= 0.35, `${division} goalkeeper share is ${(row.share * 100).toFixed(1)}%`);
  }
  assert.ok(Math.abs(result.gkRating - result.outfieldRating) <= 0.55,
    `position ratings diverged: GK ${result.gkRating.toFixed(2)}, outfield ${result.outfieldRating.toFixed(2)}`);
});
