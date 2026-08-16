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
        /* WAS faOpen, AND THAT WAS THIS TEST PINNING THE BUG.
           The live ACTIONS.faOpen ignores its argument and reopens the
           whole free-agent modal, so a row wired to it sent you back to
           the list you were already looking at. This test asserted that
           wiring, so it was holding the fault in place. */
        opensFreeAgentSheet: /data-action="faCard"/.test(html),
        notTheOldListAction: !/data-action="faOpen"/.test(html),
        noBidSheet: !/data-action="openBid"/.test(html),
      };
    }())`);

    assert.equal(result.ask, 0, 'a free agent costs no fee');
    assert.ok(typeof result.rivalAsk === 'number' && result.rivalAsk > 0,
      `a contracted player still has an asking price, got ${result.rivalAsk}`);
    assert.equal(result.saysFreeAgent, true, 'the row says what he is');
    assert.equal(result.saysNoFee, true, 'and that there is no fee');
    assert.equal(result.opensFreeAgentSheet, true,
      'and tapping him opens his card, not a bid to a club that does not exist');
    assert.equal(result.notTheOldListAction, true,
      'and never the action that just reopens the whole list');
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

/*
 * The two complaints, as tests.
 *
 *   "I wanna be able to search lower wage brackets ... for free agents"
 *   "It only shows me the top twenty, and I can't see the rest"
 *
 * Both were mine. The wage rungs slid up with the club's money, which
 * fixed the original problem — Premier League brackets are useless to a
 * non-league club — and broke the mirror image: managing United the
 * cheapest bracket on offer was £15,000 a week, so a rich club could not
 * ask for anybody cheap. And the free-agent list stopped at twenty and
 * told you to tighten the filters, while the market tab beside it paged
 * through everything.
 */

test('a rich club can still search for cheap players', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Rungs');
    const rungs = game.eval('wageRungs()');
    assert.ok(Array.isArray(rungs) && rungs.length > 0, 'there are wage rungs');
    assert.ok(rungs[0] <= 1000,
      `the cheapest wage bracket offered is ${rungs[0]} — a big club must still be `
      + 'able to ask for somebody on a low wage');
    assert.ok(rungs.length >= 8, `only ${rungs.length} rungs offered`);
    /* and the ladder still stops somewhere sensible rather than showing
       a non-league club £600k a week */
    const sorted = rungs.slice().sort((a, b) => a - b);
    assert.deepEqual(rungs, sorted, 'the rungs are in order');
  } finally {
    game.close();
  }
});

test('the free-agent list pages instead of stopping at twenty', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Pager');

    const out = await game.eval(`(function () {
      Object.keys(TR_DEF).forEach((k) => { UI[k] = TR_DEF[k]; });
      UI.trPos = 'Any'; UI.trAge = '40'; UI.trQ = ''; UI.trShort = false;
      UI.trAfford = false; UI.trPage = 0;
      ACTIONS.trDeal({ dataset: { v: 'free' } });

      const total = (G.freeAgents || []).length;
      const page1 = trResultsHtml();
      UI.trPage = 1;
      const page2 = trResultsHtml();
      UI.trPage = 0;

      const pager = (h) => { const m = h.match(/Page (\\d+) of (\\d+)/); return m ? m[0] : null; };
      return {
        total: total,
        pagerOnPage1: pager(page1),
        pagerOnPage2: pager(page2),
        differentPages: page1 !== page2,
        saysTighten: /tighten the filters to see further down/.test(page1),
      };
    }())`);

    assert.ok(out.total > 20, `there are ${out.total} free agents to page through`);
    assert.ok(out.pagerOnPage1, 'page one offers a pager');
    assert.ok(out.differentPages, 'page two is not page one');
    assert.match(out.pagerOnPage2, /Page 2 of/, 'and it knows which page it is on');
    assert.equal(out.saysTighten, false,
      'it no longer tells you to tighten the filters instead of paging');
  } finally {
    game.close();
  }
});

test('the filters the free-agent list used to ignore now bite', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Filters');

    const out = await game.eval(`(function () {
      const reset = () => {
        Object.keys(TR_DEF).forEach((k) => { UI[k] = TR_DEF[k]; });
        UI.trPos = 'Any'; UI.trAge = '40'; UI.trQ = ''; UI.trShort = false;
        UI.trAfford = false; UI.trPage = 0;
      };
      const count = (h) => { const m = h.match(/(\\d+) match/); return m ? +m[1] : -1; };
      reset();
      ACTIONS.trDeal({ dataset: { v: 'free' } });
      const everyone = count(trResultsHtml());

      reset(); UI.trAttr = 'pace'; UI.trAttrMin = '16';
      const quick = count(trResultsHtml());

      reset(); UI.trWage = '2000';
      const cheap = count(trResultsHtml());

      reset(); UI.trFit = 'fit';
      const fit = count(trResultsHtml());

      reset();
      return { everyone: everyone, quick: quick, cheap: cheap, fit: fit };
    }())`);

    assert.ok(out.everyone > 20, `${out.everyone} free agents unfiltered`);
    /* the attribute filter was applied to the market tab and silently
       dropped on this one, so the panel claimed a filter it never ran */
    assert.ok(out.quick < out.everyone,
      `asking for pace 16+ returned ${out.quick} of ${out.everyone} — it is being ignored`);
    assert.ok(out.cheap < out.everyone,
      `a £2k wage ceiling returned ${out.cheap} of ${out.everyone}`);
    assert.ok(out.cheap > 0, 'and cheap free agents do exist to be found');
    assert.ok(out.fit <= out.everyone, 'the fitness filter runs');
  } finally {
    game.close();
  }
});

/*
 * The three faults reported from play, all in the free-agent tab.
 *
 *   "first time around it says NaN on every player and I can't see them"
 *   "when I click on one of the players it takes me back into the full list"
 *
 * A save stores free agents compactly — as plain arrays — and `faList()`
 * is what turns them back into players, in place, on first read. This
 * list read `G.freeAgents` directly, so until something else happened to
 * call `faList()` every row was built out of an array: no name, no age,
 * and every number NaN. That is also why it looked fine "after the first
 * time" — opening the game's own free-agent modal called `faList()`.
 */

test('free agents straight out of a save render as players, not NaN', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Rehydrate');

    const out = await game.eval(`(function () {
      /* exactly the state a career comes back from disk in */
      G.freeAgents = faList().map((p) => faToRow(p));
      const compacted = Array.isArray(G.freeAgents[0]);

      Object.keys(TR_DEF).forEach((k) => { UI[k] = TR_DEF[k]; });
      UI.trPos = 'Any'; UI.trAge = '40'; UI.trQ = ''; UI.trShort = false;
      UI.trAfford = false; UI.trPage = 0;
      ACTIONS.trDeal({ dataset: { v: 'free' } });

      const html = trResultsHtml();
      return {
        compacted: compacted,
        nan: (html.match(/NaN/g) || []).length,
        undef: (html.match(/undefined/g) || []).length,
        rows: (html.match(/class="prow/g) || []).length,
      };
    }())`);

    assert.equal(out.compacted, true, 'the pool really is in compact form for this test');
    assert.equal(out.nan, 0, `the first render printed NaN ${out.nan} times`);
    assert.equal(out.undef, 0, `the first render printed "undefined" ${out.undef} times`);
    assert.ok(out.rows > 0, 'and there are players to see');
  } finally {
    game.close();
  }
});

test('clicking a free agent opens that player, not the whole list again', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Clicker');

    const out = await game.eval(`(function () {
      Object.keys(TR_DEF).forEach((k) => { UI[k] = TR_DEF[k]; });
      UI.trPos = 'Any'; UI.trAge = '40'; UI.trQ = ''; UI.trShort = false;
      UI.trAfford = false; UI.trPage = 0;
      ACTIONS.trDeal({ dataset: { v: 'free' } });

      const html = trResultsHtml();
      const m = html.match(/data-action="([a-zA-Z]+)" data-id="(\\d+)"/);
      if (!m) return { action: 'no row' };
      const action = m[1];
      const id = +m[2];
      const who = faList().filter((x) => x && x.id === id)[0];

      /* faOpen ignores its argument and reopens the whole modal, which
         is what made a click feel like it went backwards. NO BACKTICKS
         IN HERE -- this is inside a template literal and one would end
         it early, which is the second time I have done that. */
      let card = '';
      try { card = String(window.RBSTransferSearch.cardHtml(who)); }
      catch (e) { card = 'THREW: ' + e.message; }
      /* the card escapes his name, so compare like for like -- a name
         with an apostrophe in it would never match raw */
      const shown = (typeof esc === 'function') ? esc(who.name) : who.name;

      return {
        action: action,
        name: who ? who.name : null,
        namesHim: who ? card.indexOf(shown) >= 0 : false,
        card: card.slice(0, 80),
        offersHim: card.indexOf('data-action="faSign" data-v="' + id + '"') >= 0,
        signsOnSight: action === 'faSign',
      };
    }())`);

    assert.notEqual(out.action, 'faOpen',
      'the row must not use the action that ignores its id and reopens the list');
    assert.equal(out.signsOnSight, false,
      'and it must not be faSign, which signs him with no confirmation');
    assert.ok(out.namesHim, 'the card is about the player you clicked');
    assert.ok(out.offersHim, 'and it offers you him, rather than a list');
  } finally {
    game.close();
  }
});
