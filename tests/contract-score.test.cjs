const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The goal bonus, as a lever that works at every level.
 *
 * The acceptance score in `submitTerms` measures every term against what
 * the player is asking except the goal bonus, which was measured against
 * a flat £8,000. That broke it at both ends of the pyramid: a National
 * League sheet opens at £50 a goal and scored 0.02 of the four points it
 * is worth, while a Premier League sheet opens at £7,500 and scored 3.75
 * — pinned near the ceiling before you touched it. Dead either way.
 *
 * These are written against the shape rather than against any division's
 * numbers, because the opening offer is Agent One's `goalBonusFor` and
 * that is theirs to retune. Whatever it says, the rule is the same: the
 * bonus the sheet opens with is worth half marks, and double it is worth
 * full marks, at every wage in the game.
 *
 * The last one matters most and is the one a reader should not skip: the
 * fix works by handing the untouched formula a rescaled number, so the
 * thing that could go wrong is the player being paid the rescaled figure
 * instead of what was actually offered.
 */

const WEEKLY_WAGES = [
  ['Premier League', 150000],
  ['Championship', 18000],
  ['League One', 5000],
  ['League Two', 2200],
  ['National League', 800],
];

/* the four points the term is worth, on the scale the formula uses */
const points = (bonus, fullMarks) => Math.min(4, (bonus / fullMarks) * 4);

test('a goal bonus is worth the same at every level of the pyramid', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Terms');
    const api = game.window.RBSContractScore;
    assert.ok(api, 'the contract-score module did not load');

    for (const [division, weekly] of WEEKLY_WAGES) {
      const opening = api.openingBonus(weekly);
      const full = api.fullMarksBonus(weekly);

      assert.ok(opening > 0, `${division}: the sheet must open with a bonus`);
      assert.equal(full, opening * 2, `${division}: full marks is double the opening offer`);

      /* half marks for what the sheet offers you, full marks for double,
         and the same at every wage — which is the whole point */
      assert.ok(
        Math.abs(points(opening, full) - 2) < 0.001,
        `${division}: the opening bonus should be worth 2 of 4, got ${points(opening, full)}`,
      );
      assert.ok(
        Math.abs(points(full, full) - 4) < 0.001,
        `${division}: double the opening bonus should be worth 4 of 4`,
      );

      /* and the defect this replaced: measured against the old flat
         £8,000, everything below the Premier League scored ~nothing */
      const legacy = Math.min(4, (opening / 8000) * 4);
      if (weekly <= 18000) {
        assert.ok(legacy < 0.5, `${division}: the old scale should have been near-dead here`);
      }
    }
  } finally {
    game.close();
  }
});

test('the player is paid the bonus that was offered, not the rescaled one', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Terms');

    const result = game.eval(`(function () {
      const my = G.clubs[G.my];
      const p = my.players.find(x => x.contract >= 2) || my.players[0];
      const wageBefore = p.wage;

      openContractSheet(p, { renew: true });
      const negotiation = G.negotiation;
      const bonusField = document.getElementById('tBonus');
      const wageField = document.getElementById('tWage');
      const opened = Math.round(+bonusField.value || 0);

      /* comfortably over the asking wage, so the deal closes and we are
         testing what gets stored rather than whether he signs */
      const ask = (negotiation && negotiation.exp) || p.wage;
      wageField.value = String(Math.round(ask * 1.25));

      const offered = Math.round(opened * 1.5);
      bonusField.value = String(offered);
      ACTIONS.submitTerms();

      return {
        opened,
        offered,
        stored: p.bonus,
        fieldAfter: Math.round(+bonusField.value || 0),
        signed: p.wage !== wageBefore,
      };
    }())`);

    assert.ok(result.opened > 0, 'the sheet should open with a bonus already typed in');
    assert.ok(result.signed, 'a comfortably over-the-odds offer should be accepted');
    assert.equal(result.stored, result.offered, 'the stored bonus must be what was offered');
    assert.equal(result.fieldAfter, result.offered, 'the sheet must show the real figure afterwards');
  } finally {
    game.close();
  }
});
