const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Searching the transfer market for a free agent.
 *
 * "we should be able to filter out contract players in the search,
 *  currently it's hard to search free agents"
 *
 * It was not hard, it was impossible: the search walked `G.clubs[].players`
 * and a free agent is not at a club — he lives in `G.freeAgents`. No free
 * agent had ever appeared in a search result. The first test is that one.
 */

test('free agents are in the search pool at all', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Market');

    const result = game.eval(`(function () {
      const api = window.RBSTransferSearch;
      if (!G.freeAgents || !G.freeAgents.length) { try { buildFreeAgents(); } catch (e) {} }
      const pool = api.pool();
      const free = pool.filter(api.isFree);
      /* and the old pool, for the comparison that makes the point */
      const clubsOnly = [];
      G.clubs.forEach((c) => { if (c.i !== G.my) (c.players || []).forEach((p) => clubsOnly.push(p)); });
      return {
        freeAgents: G.freeAgents.length,
        inPool: free.length,
        poolSize: pool.length,
        clubsOnly: clubsOnly.length,
        noneOfMine: pool.filter((p) => p.club === G.my).length,
      };
    }())`);

    assert.ok(result.freeAgents > 0, 'the world has free agents');
    assert.equal(result.inPool, result.freeAgents,
      'every one of them is searchable');
    assert.equal(result.poolSize, result.clubsOnly + result.freeAgents,
      'the pool is the clubs plus the free agents, and nothing else');
    assert.equal(result.noneOfMine, 0, 'and never your own players');
  } finally {
    game.close();
  }
});

test('the contract filter delegates, and never replaces the real search', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Market');

    const result = game.eval(`(function () {
      if (!G.freeAgents || !G.freeAgents.length) { try { buildFreeAgents(); } catch (e) {} }
      /* RESET EVERY DEEP FILTER, NOT JUST THE SHALLOW ONES. The first
         version of this left UI.trOvr set from the previous measurement,
         so "everyone" was measured with the 80+ filter still on and came
         back identical to "strong only" — the test failed on its own
         bookkeeping rather than on the code. */
      /* USE THE GAME'S OWN DEFAULTS. Two attempts at hand-writing this
         got it wrong: the first left UI.trOvr set from the previous
         measurement so "everyone" was measured with the 80+ filter still
         on, and the second set trAttr to 'any' when its default is an
         empty string — which made it filter on an attribute named "any"
         and excluded the entire market. TR_DEF is the truth. */
      const reset = () => {
        UI.trPos = 'Any'; UI.trAge = '40'; UI.trQ = '';
        UI.trShort = false; UI.trListed = false;
        Object.keys(TR_DEF).forEach((k) => { UI[k] = TR_DEF[k]; });
      };
      const count = (d) => {
        reset(); UI.trDeal = d;
        const m = trResultsHtml().match(/<div class="sub">(\\d+) match/);
        return m ? +m[1] : -1;
      };
      const market = count('market');
      const free = count('free');
      const expiring = count('expiring');

      /* THE REGRESSION THIS PINS. The live search is four thousand lines
         below the one it is easy to find, and carries filters for
         overall, potential, fee, wage, morale, fitness, role, attribute
         and nationality plus pagination. Replacing it threw all of that
         away; these prove it is still doing the work. */
      reset(); UI.trDeal = 'market';
      const everyone = (trResultsHtml().match(/<div class="sub">(\\d+) match/) || [])[1];
      reset(); UI.trDeal = 'market'; UI.trOvr = 80;
      const strongOnly = (trResultsHtml().match(/<div class="sub">(\\d+) match/) || [])[1];
      reset();

      /* and expiring leaves the shared contract filter as it found it */
      reset(); UI.trCon = 'any'; UI.trDeal = 'expiring';
      trResultsHtml();
      const conAfter = UI.trCon;

      return {
        market, free, expiring,
        freeAgents: G.freeAgents.length,
        strongOnly: +strongOnly, everyone: +everyone, conAfter,
      };
    }())`);

    assert.equal(result.free, result.freeAgents,
      'the free-agent filter shows exactly the free agents');
    assert.ok(result.market > 0, 'the club market still returns players');
    assert.ok(result.expiring > 0 && result.expiring < result.market,
      `expiring is a subset of the club market (${result.expiring} of ${result.market})`);
    assert.ok(result.strongOnly < result.everyone,
      'the deep filters still work — an 80+ overall filter must narrow the market '
      + `(${result.strongOnly} of ${result.everyone})`);
    assert.equal(result.conAfter, 'any',
      'and asking for expiring contracts puts the shared filter back where it was');
  } finally {
    game.close();
  }
});

test('a free agent can be found by position, age and name', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Market');

    const result = game.eval(`(function () {
      const api = window.RBSTransferSearch;
      if (!G.freeAgents || !G.freeAgents.length) { try { buildFreeAgents(); } catch (e) {} }
      const search = (o) => {
        UI.trDeal = 'free'; UI.trShort = false; UI.trListed = false; UI.trCon = 'any';
        UI.trPos = o.pos || 'Any'; UI.trAge = o.age || '40'; UI.trQ = o.q || '';
        const m = api.results().match(/<div class="sub">(\\d+) match/);
        return m ? +m[1] : -1;
      };
      const all = search({});
      /* a position that somebody in the pool actually plays */
      const pos = G.freeAgents[0].pos;
      const truePos = G.freeAgents.filter((p) => p.pos === pos).length;
      const byPos = search({ pos });

      const young = G.freeAgents.filter((p) => p.age <= 23).length;
      const byAge = search({ age: '23' });

      const who = G.freeAgents[0];
      const surname = who.name.split(' ').pop();
      const trueName = G.freeAgents
        .filter((p) => p.name.toLowerCase().indexOf(surname.toLowerCase()) >= 0).length;
      const byName = search({ q: surname });

      return { all, pos, byPos, truePos, byAge, young, byName, trueName, surname };
    }())`);

    assert.ok(result.all > 0, 'there are free agents to find');
    assert.equal(result.byPos, result.truePos,
      `filtering free agents by ${result.pos} must be exact`);
    assert.equal(result.byAge, result.young, 'and by age');
    assert.equal(result.byName, result.trueName,
      `and by name ("${result.surname}")`);
    assert.ok(result.byPos < result.all, 'a position filter actually narrows it');
  } finally {
    game.close();
  }
});

test('a market row for a free agent asks no fee and does not throw', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Market');

    const result = game.eval(`(function () {
      const api = window.RBSTransferSearch;
      if (!G.freeAgents || !G.freeAgents.length) { try { buildFreeAgents(); } catch (e) {} }
      const fa = G.freeAgents[0];

      /* THE GUARD. askPrice opens with G.clubs[p.club].players, so a man
         with no club threw a TypeError — nothing had caught it because no
         free agent could reach a market row. */
      let ask = 'THREW';
      try { ask = askPrice(fa); } catch (e) { ask = 'THREW: ' + e.message; }

      /* and a contracted player still gets a real price */
      const rival = G.clubs.filter((c) => c.i !== G.my && (c.players || []).length)[0].players[0];
      let rivalAsk = 'THREW';
      try { rivalAsk = askPrice(rival); } catch (e) { rivalAsk = 'THREW: ' + e.message; }

      UI.trDeal = 'free'; UI.trPos = 'Any'; UI.trAge = '40'; UI.trQ = '';
      UI.trShort = false; UI.trListed = false; UI.trCon = 'any';
      const html = trResultsHtml();

      return {
        ask, rivalAsk,
        saysFreeAgent: /FREE AGENT/.test(html),
        saysNoFee: /No fee/.test(html),
        opensFreeAgentSheet: /data-action="faOpen"/.test(html),
        noBidSheet: !/data-action="openBid"/.test(html),
      };
    }())`);

    assert.equal(result.ask, 0, 'a free agent costs no fee');
    assert.ok(typeof result.rivalAsk === 'number' && result.rivalAsk > 0,
      `a contracted player still has an asking price, got ${result.rivalAsk}`);
    assert.equal(result.saysFreeAgent, true, 'the row says what he is');
    assert.equal(result.saysNoFee, true, 'and that there is no fee');
    assert.equal(result.opensFreeAgentSheet, true,
      'and tapping him opens the free-agent talks, not a bid to a club that does not exist');
  } finally {
    game.close();
  }
});

test('the search comes before the money on the transfers screen', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Market');

    const result = game.eval(`(function () {
      const html = vTransfers();
      const at = (needle) => html.indexOf(needle);
      return {
        nameSearch: at('data-live="trQ"'),
        contractRow: at('data-action="trDeal"'),
        results: at('id="trResults"'),
        budget: at('REBALANCE'),
        scouts: at('data-action="assignScout"'),
        hasAll: at('data-live="trQ"') >= 0 && at('id="trResults"') >= 0,
      };
    }())`);

    assert.equal(result.hasAll, true, 'the screen still has a search and results');
    assert.ok(result.nameSearch < result.results,
      'the filters come before the results');
    if (result.budget >= 0) {
      assert.ok(result.results < result.budget,
        'and the results come before the budget slider — measured on a phone, the '
        + 'name box used to sit 768px down the page');
    }
    assert.ok(result.contractRow >= 0, 'the contract filter is on the screen');
  } finally {
    game.close();
  }
});
