const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Paying a transfer fee in instalments.
 *
 * The ledger and the summer settlement are Agent One's, in economy.js, and
 * these tests do not re-check them. What is checked here is the part that
 * was missing: that the manager chooses the structure, that choosing to
 * spread the money costs him something, that he can commit to a fee he
 * could not pay in one go, and that the money actually moves — this year
 * and every year after it — rather than the schedule being a caption.
 */

test('spreading the fee costs more in total, and the selling club asks for it', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ledger');

    const result = game.eval(`(function () {
      const api = window.RBSTransferStructure;
      /* a five-million fee: economy.js would structure it over three
         years on its own, so three years is free and four costs one
         year of patience */
      const mid = 5e6;
      return {
        base: api.defaultYears(mid),
        cash: api.loaded(mid, 1),
        usual: api.loaded(mid, 3),
        longer: api.loaded(mid, 4),
        perUsual: api.slice(api.loaded(mid, 3), 3),
        bigBase: api.defaultYears(20e6),
        bigFour: api.loaded(20e6, 4),
        bigPer: api.slice(api.loaded(20e6, 4), 4),
      };
    }())`);

    assert.equal(result.base, 3, 'the clubs would have spread this one over three');
    /* paying sooner than the norm is not penalised, and paying later is */
    assert.equal(result.cash, 5e6, 'cash costs the asking price');
    assert.equal(result.usual, 5e6, 'so does the structure they expected');
    assert.equal(result.longer, 5.3e6, 'one extra year of waiting costs six per cent');
    assert.equal(result.perUsual, Math.round(5e6 / 3));

    /* and a twenty-million fee is a four-year deal already, so the
       quarter-a-year the manager asked for is the normal structure and
       costs him nothing extra */
    assert.equal(result.bigBase, 4);
    assert.equal(result.bigFour, 20e6);
    assert.equal(result.bigPer, 5e6);
  } finally {
    game.close();
  }
});

test('a selling club wants more when it has to wait for the money', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ledger');

    const result = game.eval(`(function () {
      const target = G.clubs.filter((c) => c.i !== G.my)[0].players[0];
      const api = window.RBSTransferStructure;
      const plain = askPrice(target);

      /* four years asked of a club that expected two: two years of extra
         waiting, so twelve per cent */
      api.state.scope = { id: target.id, years: 4, base: 2 };
      const deferred = askPrice(target);
      api.state.scope = null;

      /* the structure they expected costs nothing */
      api.state.scope = { id: target.id, years: 2, base: 2 };
      const asExpected = askPrice(target);
      api.state.scope = null;

      /* and nobody else's price moves because of it */
      const other = G.clubs.filter((c) => c.i !== G.my)[1].players[0];
      const otherPlain = askPrice(other);
      api.state.scope = { id: target.id, years: 4, base: 2 };
      const otherDuring = askPrice(other);
      api.state.scope = null;

      const bandPlain = feeBand(target).ask;
      api.state.scope = { id: target.id, years: 4, base: 2 };
      const bandDeferred = feeBand(target).ask;
      api.state.scope = null;

      return { plain, deferred, asExpected, otherPlain, otherDuring, bandPlain, bandDeferred };
    }())`);

    assert.ok(result.deferred > result.plain,
      'a deferred offer should have to beat a higher asking price');
    assert.equal(result.deferred, Math.round(result.plain * 1.12),
      'two extra years of waiting at six per cent each');
    assert.equal(result.asExpected, result.plain,
      'and the structure the club expected costs nothing');
    assert.equal(result.otherDuring, result.otherPlain,
      'and it must not move the price of every other player in the world');
    /* and it has to reach the negotiation, not just askPrice: the live
       bid sheet decides through feeBand(), which is the number the
       manager is actually bidding against */
    assert.ok(result.bandDeferred > result.bandPlain,
      'the negotiation band should move with it');
    assert.equal(result.bandDeferred, Math.round(result.bandPlain * 1.12));
  } finally {
    game.close();
  }
});

test('the fee is paid a quarter now and a quarter a year after that', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ledger');

    const result = game.eval(`(function () {
      const me = G.clubs[G.my];
      const seller = G.clubs.filter((c) => c.i !== G.my && c.players.length > 3)[0];
      const target = seller.players[0];
      const fee = 20e6;

      me.bank = 300e6; me.budget = 300e6;
      const bankBefore = me.bank;
      const sellerBefore = seller.bank;

      window.RBSTransferStructure.setPlan(target.id, 4);
      completeSigning(target, fee, { wage: 120000, len: 4, signOn: 0, bonus: 0, clause: 0 });

      const owed = (G.fin.owed || []).filter((x) => x.who === target.name);
      const paidToday = bankBefore - me.bank;
      return {
        rows: owed.length,
        per: owed[0] ? owed[0].per : null,
        left: owed[0] ? owed[0].left : null,
        paidToday,
        sellerGot: seller.bank - sellerBefore,
        joined: target.club === G.my,
      };
    }())`);

    assert.equal(result.joined, true, 'the player should have signed');
    assert.equal(result.rows, 1, 'one row on the ledger for one signing');
    /* a quarter now, and a quarter owed in each of the next three years */
    assert.equal(result.per, 5e6);
    assert.equal(result.left, 3);
    /* what left the bank today is the first instalment — plus whatever
       else the economy layer charges on a signing, which is why this is
       a bound rather than an equality */
    assert.ok(result.paidToday >= 5e6 && result.paidToday < 9e6,
      `only the first instalment should have gone out (${result.paidToday})`);
    assert.ok(result.sellerGot > 0 && result.sellerGot <= 5e6,
      `the seller should have banked the first instalment only (${result.sellerGot})`);
  } finally {
    game.close();
  }
});

test('paying in full leaves nothing on the ledger', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ledger');

    const result = game.eval(`(function () {
      const me = G.clubs[G.my];
      const seller = G.clubs.filter((c) => c.i !== G.my && c.players.length > 3)[0];
      const target = seller.players[0];
      const fee = 20e6;
      me.bank = 300e6; me.budget = 300e6;
      const before = me.bank;

      window.RBSTransferStructure.setPlan(target.id, 1);
      completeSigning(target, fee, { wage: 120000, len: 4, signOn: 0, bonus: 0, clause: 0 });

      return {
        rows: (G.fin.owed || []).filter((x) => x.who === target.name).length,
        paid: before - me.bank,
      };
    }())`);

    /* economy.js spreads a twenty-million fee over four years on its own.
       Choosing cash is an explicit override of that, and has to actually
       override it rather than sit beside it. */
    assert.equal(result.rows, 0, 'a cash deal owes nothing afterwards');
    assert.ok(result.paid >= 20e6, `the whole fee should have gone out (${result.paid})`);
  } finally {
    game.close();
  }
});

test('the instalments come out every summer until the deal is paid off', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ledger');

    const result = game.eval(`(function () {
      const me = G.clubs[G.my];
      const seller = G.clubs.filter((c) => c.i !== G.my && c.players.length > 3)[0];
      me.bank = 300e6; me.budget = 300e6;
      G.fin = G.fin || {};
      G.fin.owed = [{ to: seller.i, per: 5e6, left: 3, who: 'Test Signing', total: 20e6 }];
      G.fin.due = [];

      /* MEASURED ON THE SETTLEMENT, NOT ON THE BANK BALANCE. The first
         version of this test took the bank before and after endSeason()
         and expected the difference to be the instalment. It came back
         at minus seventy-one million, because a season rollover also
         pays prize money, gate receipts and sponsorship — the instalment
         is a rounding error inside it. So this watches the seller's side
         of the transaction, which only the settlement touches. */
      const seen = [];
      for (let year = 0; year < 4; year += 1) {
        const sellerBefore = seller.bank;
        const owedBefore = (G.fin.owed || []).reduce((s, x) => s + x.per * x.left, 0);
        endSeason();
        const row = (G.fin.owed || [])[0];
        const owedAfter = (G.fin.owed || []).reduce((s, x) => s + x.per * x.left, 0);
        seen.push({
          liabilityFell: owedBefore - owedAfter,
          sellerGained: seller.bank - sellerBefore,
          left: row ? row.left : 0,
        });
      }
      return { seen, rowsLeft: (G.fin.owed || []).length };
    }())`);

    /* three payments and then it stops, rather than for ever */
    assert.equal(result.seen[0].liabilityFell, 5e6);
    assert.equal(result.seen[1].liabilityFell, 5e6);
    assert.equal(result.seen[2].liabilityFell, 5e6);
    assert.equal(result.seen[3].liabilityFell, 0, 'a paid-off deal must not keep taking money');
    /* and the money reached the club that sold him, every one of those
       three years — a schedule that only counts down is a caption */
    assert.ok(result.seen[0].sellerGained >= 5e6,
      `the seller should have banked the instalment (${result.seen[0].sellerGained})`);
    assert.ok(result.seen[2].sellerGained >= 5e6,
      `including in the final year (${result.seen[2].sellerGained})`);
    assert.equal(result.rowsLeft, 0, 'and the row should be gone');
  } finally {
    game.close();
  }
});

test('you can commit to a fee you could not pay in one go', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Ledger');

    const result = game.eval(`(function () {
      const me = G.clubs[G.my];
      const seller = G.clubs.filter((c) => c.i !== G.my && c.players.length > 3)[0];
      const target = seller.players[0];
      me.budget = 12e6;                 /* nowhere near a 40M fee */
      G.negoRounds = {};
      G.lockouts = {};

      /* the bid sheet, with the fee typed in and four years chosen */
      openBidSheet(target.id);
      const field = document.getElementById('bidFee');
      field.value = String(40e6);
      window.RBSTransferStructure.setPlan(target.id, 4);

      let refused = null;
      const realToast = window.toast;
      window.toast = function (message) { refused = String(message); };
      let threw = null;
      try {
        ACTIONS.submitBid({ dataset: { id: target.id } });
      } catch (error) { threw = String(error).slice(0, 80); }
      window.toast = realToast;

      return { refused, threw, budgetAfter: me.budget };
    }())`);

    assert.equal(result.threw, null, 'the bid should not have thrown');
    assert.ok(!/beyond your transfer budget/i.test(result.refused || ''),
      `a spread bid should not be refused on the full fee (${result.refused})`);
    /* and the budget it borrowed against for the check is handed straight
       back — a check is not a payment */
    assert.equal(result.budgetAfter, 12e6);
  } finally {
    game.close();
  }
});
