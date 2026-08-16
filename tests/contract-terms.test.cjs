const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Every contract term has to be offerable at every level of the pyramid.
 *
 * The goal bonus was fixed first: `Math.min(4, bonus/8e3*4)` measured a
 * bonus against eight thousand pounds regardless of who you were, so the
 * most generous realistic offer in the National League scored 0.06 of a
 * possible 4 and the lever did nothing.
 *
 * The sign-on fee had the same shape in the control rather than the
 * formula. The field was `step="50000"` defaulting to three weeks' wages
 * rounded to the nearest fifty thousand, so at a National League wage of
 * about £1,200 a week the default rounded to ZERO and the smallest offer
 * the control accepted was £50,000 — forty-one weeks of his wages. The
 * acceptance formula was fine; the control was unusable, which amounts
 * to the same thing.
 *
 * These tests read the live sheet rather than the helpers, because a
 * helper returning a sensible number while the input keeps a £50,000
 * step is exactly the bug.
 */

const DIVISIONS = ['PL', 'CH', 'L1', 'L2', 'NL'];

test('a sign-on fee can be offered in every division, not just the rich ones', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const out = [];
    ${JSON.stringify(DIVISIONS)}.forEach(div => {
      const club = G.clubs.find(c => c.league === div && c.i !== G.my);
      const p = club && club.players && club.players[0];
      if (!p) return;
      const exp = expectedWage(p, false);
      openContractSheet(p, {});
      const sign = document.getElementById('tSign');
      const bonus = document.getElementById('tBonus');
      const clause = document.getElementById('tClause');
      out.push({
        div, weekly: Math.round(exp),
        signValue: Math.round(+(sign && sign.value) || 0),
        signStep: Math.round(+(sign && sign.step) || 0),
        bonusValue: Math.round(+(bonus && bonus.value) || 0),
        bonusStep: Math.round(+(bonus && bonus.step) || 0),
        clauseStep: Math.round(+(clause && clause.step) || 0),
      });
      try { closeModal(); } catch (e) { /* the sheet may not be modal */ }
    });
    return out;
  })()`);

  assert.equal(run.length, DIVISIONS.length, 'not every division produced a contract sheet');

  run.forEach((row) => {
    // a default you can actually see
    assert.ok(row.signValue > 0,
      `${row.div}: the sign-on fee defaults to £${row.signValue} on £${row.weekly} a week`);

    // and a step small enough to be worth pressing
    assert.ok(row.signStep <= row.weekly * 2,
      `${row.div}: the sign-on step is £${row.signStep} against a wage of £${row.weekly} a week, `
      + 'so the smallest possible offer is more than a fortnight of wages');

    // the default should be about three weeks' wages, whoever you are
    const weeks = row.signValue / Math.max(1, row.weekly);
    assert.ok(weeks >= 1.5 && weeks <= 5,
      `${row.div}: the sign-on default is ${weeks.toFixed(1)} weeks of wages`);

    // the goal bonus, same rule
    assert.ok(row.bonusValue > 0, `${row.div}: the goal bonus defaults to zero`);
    assert.ok(row.bonusStep <= Math.max(10, row.bonusValue),
      `${row.div}: the goal bonus step (£${row.bonusStep}) is larger than its own default`);

    // and the release clause, which was a flat million a click
    assert.ok(row.clauseStep <= 500000,
      `${row.div}: the release clause still steps by £${row.clauseStep}`);
  });

  // the top of the pyramid must not have been dragged down to fix the bottom
  const top = run.find((r) => r.div === 'PL');
  assert.ok(top.signStep >= 5000,
    `the Premier League sign-on step fell to £${top.signStep}, which is fiddly at £${top.weekly} a week`);
});

test('the bottom two divisions were the ones that were broken', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const out = {};
    ['L2','NL'].forEach(div => {
      const club = G.clubs.find(c => c.league === div && c.i !== G.my);
      const p = club && club.players && club.players[0];
      if (!p) return;
      const exp = expectedWage(p, false);
      openContractSheet(p, {});
      const sign = document.getElementById('tSign');
      out[div] = {
        weekly: Math.round(exp),
        // what the old control would have offered, for the record
        was: Math.round(exp * 3 / 5e4) * 5e4,
        now: Math.round(+(sign && sign.value) || 0),
      };
      try { closeModal(); } catch (e) { /* not modal */ }
    });
    return out;
  })()`);

  ['L2', 'NL'].forEach((div) => {
    const row = run[div];
    assert.ok(row, `${div} produced no sheet`);
    assert.equal(row.was, 0,
      `${div} is meant to be a division where the old default rounded to zero; it gave £${row.was}`);
    assert.ok(row.now > 0,
      `${div}: still nothing offered on £${row.weekly} a week`);
  });
});
