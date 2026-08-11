const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * Goalkeepers had no goalkeeping attributes: shot-stopping was
 * (positioning + agility) / 2, both borrowed from outfield play. These
 * check that the four new ones exist, differ between players who are
 * otherwise identical, and reach both the engine and the player page.
 */

test('two keepers with identical attributes are no longer the same keeper', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const api = window.RBSAttributes;
    const keepers = G.clubs.flatMap(c => c.players).filter(p => p.pos === 'GK').slice(0, 3);
    const base = Object.assign({}, keepers[0].attrs);
    const read = (p) => {
      p.attrs = Object.assign({}, base);
      delete p._rbsDer;
      return api.GK_KEYS.map(k => +api.derive(p, k).toFixed(3));
    };
    const rows = keepers.map(read);
    // and asking twice gives the same answer
    const again = read(keepers[0]);
    // an explicit value wins over the derived one
    keepers[0].attrs = Object.assign({}, base, {reflexes: 3});
    delete keepers[0]._rbsDer;
    const forced = api.derive(keepers[0], 'reflexes');
    return {rows, again, forced, keys: api.GK_KEYS.length};
  })()`);

  assert.equal(run.keys, 4, 'a keeper should have four goalkeeping attributes');
  const [a, b, c] = run.rows.map((r) => Array.from(r).join(','));
  assert.notEqual(a, b, 'two keepers with the same base attributes came out identical');
  assert.notEqual(b, c, 'and so did another pair');
  assert.equal(Array.from(run.again).join(','), a,
    'the same keeper must give the same answer every time it is asked');
  assert.equal(run.forced, 3, 'an attribute written on the player should win over the derived one');
});

/* Deliberately NOT a goals-conceded test. Sweeping the keeper's four
   attributes over 150 matches a side measures 0.44 goals a game, which is
   a real effect, but the engine's own noise floor at that sample is about
   0.28 -- so an assertion on goals would fail roughly one run in three.
   That measurement lives in AGENT-ONE.md, where it can be honest about
   its error bars. What is asserted here is the part that is deterministic:
   the save model can no longer be handed any keeper and shrug. */
test('the save model can tell one goalkeeper from another', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const fix = G.fixtures.find(f => f.h===G.my || f.a===G.my);
    const m = new MatchSim({h:fix.h,a:fix.a,day:fix.day,div:fix.div,r:0,
      played:false,hs:0,as:0,sc:[]});
    const mine = fix.h===G.my?0:1;
    const slot = m.sides[mine].onfield.find(x => x.slot === 'GK');
    const keepers = G.clubs.flatMap(c => c.players).filter(p => p.pos === 'GK').slice(0, 40);
    const rate = (p) => {
      const was = slot.p;
      slot.p = p;
      const v = (m.effA(slot,'positioning') + m.effA(slot,'agility')) / 2;
      slot.p = was;
      return v;
    };
    const vals = keepers.map(rate);
    const old = keepers.map(p => (((p.attrs.positioning||10) + (p.attrs.agility||10)) / 2));
    const spread = (a) => Math.max.apply(null,a) - Math.min.apply(null,a);
    // how far apart the new model puts keepers the old one rated the same.
    // A mean gap is far steadier than counting pairs over a cutoff, which
    // lands on a coin flip whenever the cutoff sits near the typical gap.
    let pairs = 0, gap = 0;
    for (let i = 0; i < keepers.length; i++) {
      for (let j = i+1; j < keepers.length; j++) {
        if (Math.abs(old[i]-old[j]) < 0.35) { pairs++; gap += Math.abs(vals[i]-vals[j]); }
      }
    }
    return {n: keepers.length, spread: +spread(vals).toFixed(2),
      oldSpread: +spread(old).toFixed(2), pairs, meanGap: gap / (pairs || 1)};
  })()`);

  assert.ok(run.n >= 20, 'a decent sample of goalkeepers');
  assert.ok(run.spread > 3,
    `the save model should rate the best and worst keeper differently (spread ${run.spread})`);
  assert.ok(run.pairs > 5, 'the old model rated plenty of keepers identically');
  assert.ok(run.meanGap > 0.6,
    `keepers the old model could not tell apart should now differ by something `
    + `worth having (mean gap ${run.meanGap.toFixed(2)} across ${run.pairs} pairs)`);
});

test('the goalkeeping attributes reach the engine and the player page', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const fix = G.fixtures.find(f => f.h===G.my || f.a===G.my);
    const m = new MatchSim({h:fix.h,a:fix.a,day:fix.day,div:fix.div,r:0,
      played:false,hs:0,as:0,sc:[]});
    const mine = fix.h===G.my?0:1;
    const gk = m.sides[mine].onfield.find(x => x.slot === 'GK');
    const out = m.sides[mine].onfield.find(x => x.slot === 'ST') ||
                m.sides[mine].onfield.find(x => x.slot === 'DC');
    // the engine's answer must move when the goalkeeping does
    const before = m.effA(gk, 'agility');
    gk.p.attrs.handling = 20; gk.p.attrs.reflexes = 20; delete gk.p._rbsDer;
    const after = m.effA(gk, 'agility');
    gk.p.attrs.handling = 1; gk.p.attrs.reflexes = 1; delete gk.p._rbsDer;
    const worst = m.effA(gk, 'agility');
    delete gk.p.attrs.handling; delete gk.p.attrs.reflexes; delete gk.p._rbsDer;
    // an outfield player's agility must be left alone
    const outBefore = m.effA(out, 'agility');
    out.p.attrs.handling = 20; delete out.p._rbsDer;
    const outAfter = m.effA(out, 'agility');
    delete out.p.attrs.handling; delete out.p._rbsDer;

    // read what actually landed on the sheet. Replacing openModal here
    // would replace the wrapper that does the injecting, and capture the
    // page as it was before it was patched.
    openProfile(gk.p.id);
    const html = (document.getElementById('sheetBody') || {}).innerHTML || '';
    return {before, after, worst, outBefore, outAfter,
      page: /Goalkeeping/.test(html) && /Reflexes/.test(html) && /One-on-ones/.test(html)};
  })()`);

  assert.ok(run.after > run.before,
    `great hands should raise what the engine reads (${run.before} -> ${run.after})`);
  assert.ok(run.worst < run.before,
    `and bad ones should lower it (${run.before} -> ${run.worst})`);
  assert.ok(run.after - run.worst > 5,
    `the spread between the best and worst keeper should be real (${(run.after - run.worst).toFixed(1)})`);
  assert.equal(run.outBefore, run.outAfter,
    'an outfield player has no business having his agility read off his handling');
  assert.ok(run.page, 'the goalkeeping attributes should be shown on his page');
});
