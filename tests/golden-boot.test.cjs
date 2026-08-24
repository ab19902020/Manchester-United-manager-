const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   THE GOLDEN BOOT IS A TOP-FLIGHT AWARD
   ---------------------------------------------------------------------
   "the golden boot should only go to the top goal scorer from the top
    league of each country... it's the top goal scorer across all
    competitions as well"

   It used to be picked from every senior player in the world, and the
   lower a division is the more freely it scores, so the fifth tier kept
   winning it. Measured over three played seasons the award went to a
   National League striker on 38 and a League One striker on 31, with a
   Premier League player taking it once.

   Two separate things are wanted, and this checks both: every division
   has its own top scorer, and only a top division can win the award.
   ===================================================================== */

test('the Golden Boot goes to a top-flight scorer, however many the fifth tier scores',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());

    const out = game.eval(`(()=>{
    newGame('MUN');
    const GB=window.RBSGoldenBoot;
    if(!GB) return {fatal:'module missing'};
    const out={};

    /* nobody has kicked a ball yet */
    out.beforeAnyFootball=GB.winner();

    const firstIn=(div)=>{
      const c=(G.clubs||[]).find(x=>x.league===div&&(x.players||[]).length);
      return c?c.players.find(p=>!p.loan&&!p.youth):null;
    };
    /* the fifth tier outscores everybody, which is what actually
       happens: 42 in League Two against 34 in the Premier League */
    const nl=firstIn('NL'), l2=firstIn('L2'), pl=firstIn('PL'), esp=firstIn('ESP');
    nl.stats.goals=38; l2.stats.goals=42; pl.stats.goals=30; esp.stats.goals=25;

    const w=GB.winner();
    out.winner=w?w.name:null;
    out.winnerDiv=w?G.clubs[w.club].league:null;
    out.wantWinner=pl.name;

    /* and the whole-world leader is still a real question with a real
       answer — it is simply not this award */
    const any=GB.anyLeagueBest();
    out.worldBest=any?any.name:null;
    out.wantWorldBest=l2.name;

    /* every division keeps its own top scorer, fifth tier included */
    out.nlTop=(GB.leagueTopScorer('NL')||{}).name;
    out.wantNlTop=nl.name;
    out.plTop=(GB.leagueTopScorer('PL')||{}).name;

    /* a foreign top flight can win it — the award is not English */
    esp.stats.goals=61;
    const w2=GB.winner();
    out.foreignWinner=w2?w2.name:null;
    out.wantForeign=esp.name;
    out.foreignDiv=w2?G.clubs[w2.club].league:null;

    /* every top flight is tier one, and no second tier is in the pool */
    out.tiers=GB.topFlights().map(k=>LEAGUES[k].tier).join(',');
    out.hasEnglishTop=GB.topFlights().indexOf('PL')>=0;
    out.excludesChampionship=GB.topFlights().indexOf('CH')<0;
    out.countries=GB.topFlights().length;
    return out;
  })()`);

    assert.equal(out.fatal, undefined, 'the golden-boot module loads with the game');
    assert.equal(out.beforeAnyFootball, null,
      'before a ball is kicked nobody is top scorer');
    assert.equal(out.winner, out.wantWinner,
      'the Premier League man wins it on 30 against a League Two man on 42');
    assert.equal(out.winnerDiv, 'PL');
    assert.equal(out.worldBest, out.wantWorldBest,
      'and the League Two man is still the leading scorer in the world');
    assert.equal(out.nlTop, out.wantNlTop,
      'the National League keeps its own top scorer');
    assert.equal(out.plTop, out.wantWinner);
    assert.equal(out.foreignWinner, out.wantForeign,
      'a La Liga striker on 61 wins it — the award is not English');
    assert.equal(out.foreignDiv, 'ESP');
    assert.ok(out.hasEnglishTop, 'the Premier League is a top flight');
    assert.ok(out.excludesChampionship, 'the Championship is not');
    assert.ok(out.countries >= 5, 'and the pool is every country, not just one');
    assert.ok(/^1(,1)*$/.test(out.tiers), 'every league in the pool is a first tier');
  });
