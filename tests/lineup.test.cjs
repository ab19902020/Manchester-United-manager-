const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Reported: "I want to swap a left winger out. It only gives me three
 * suggestions. And if I tap a player on the bench it takes me to the
 * bench and makes me pick my bench. I can't swap the player out."
 *
 * Three faults behind that: two features owning the action name
 * `benchPick`, a shortlist hard-capped at three, and a slot fill that
 * cloned a player who was already on the pitch.
 */

test('you can swap a starter with anybody in the squad', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const api = window.RBSLineup;
    const c = G.clubs[G.my];
    const out = {};

    // 1. the reported bug: a shirt selected, then a player off the pitch
    UI.selSlot = 7;
    const lenBefore = G.tacs.xi.length;
    const sub = c.players.find(p => !G.tacs.xi.includes(p.id) && !p.injury && (p.susp||0) <= 0);
    ACTIONS.benchPick({dataset:{id: String(sub.id)}});
    out.swap = {
      wentIn: G.tacs.xi[7] === sub.id,
      cleared: UI.selSlot === null,
      sameSize: G.tacs.xi.length === lenBefore,
      hijacked: /Name your bench/.test((document.getElementById('sheetBody')||{}).innerHTML || ''),
    };

    // 2. choosing a man already in the eleven swaps rather than clones
    UI.selSlot = 3;
    const wasAt9 = G.tacs.xi[9], wasAt3 = G.tacs.xi[3];
    ACTIONS.sugPick({dataset:{id: String(wasAt9)}});
    const xi = G.tacs.xi.slice();
    out.clone = {
      moved: xi[3] === wasAt9,
      swappedBack: xi[9] === wasAt3,
      unique: new Set(xi).size === xi.length,
    };

    // 3. the whole squad, not a shortlist of three
    UI.selSlot = 7;
    const cand = api.candidates(7);
    ACTIONS.xiSwapOpen();
    const sheet = (document.getElementById('sheetBody')||{}).innerHTML || '';
    out.list = {
      offered: (sheet.match(/data-action="sugPick"/g) || []).length,
      candidates: cand.rows.length,
      squad: c.players.filter(p => !p.loan && !p.youth).length,
    };

    // 4. and with no shirt selected the bench sheet still works
    UI.selSlot = null;
    const namedBefore = ((G.tacs && G.tacs.bench) || []).length;
    ACTIONS.benchPick({dataset:{id: String(sub.id)}});
    out.bench = {named: ((G.tacs && G.tacs.bench) || []).length > namedBefore};
    return out;
  })()`);

  // 1. the swap the report was about
  assert.ok(run.swap.wentIn, 'tapping a squad player should put him in the selected shirt');
  assert.ok(run.swap.cleared, 'and clear the selection afterwards');
  assert.ok(run.swap.sameSize, 'the eleven should still be eleven');
  assert.equal(run.swap.hijacked, false,
    'it must not open the bench-naming sheet instead of swapping');

  // 2. no duplicates
  assert.ok(run.clone.moved, 'the chosen player should take the shirt');
  assert.ok(run.clone.swappedBack, 'and the man he replaced should take his');
  assert.ok(run.clone.unique, 'nobody should end up in the eleven twice');

  // 3. the whole squad
  assert.ok(run.list.offered > 3,
    `only ${run.list.offered} players offered — the shortlist is still capped`);
  assert.equal(run.list.offered, run.list.candidates,
    'every candidate should be on the sheet');
  assert.ok(run.list.candidates >= run.list.squad - 1,
    `${run.list.candidates} of ${run.list.squad} squad players were offered`);

  // 4. the other feature is undamaged
  assert.ok(run.bench.named, 'naming your bench should still work when no shirt is selected');
});
