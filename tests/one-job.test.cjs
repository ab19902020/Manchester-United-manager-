const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * One man, one job.
 *
 * Yann Fontaine was managing Madrid Blancos and União Lisboa at the same time,
 * and fourteen other men were in two jobs with him. Two causes: three
 * real managers appear in both of the game's manager lists, which
 * nothing reconciles, and twelve generated names collide because 450
 * independent draws from a name pool will.
 */

test('no manager is in charge of two clubs', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const by = {};
    G.clubs.forEach(c => {
      let n = null;
      try { n = managerOf(c); } catch (e) { n = null; }
      if (!n || n === 'You') return;
      (by[n] = by[n] || []).push(c.name + ' [' + c.league + ']');
    });
    const dupes = Object.keys(by).filter(n => by[n].length > 1)
      .map(n => n + ': ' + by[n].join(' | '));
    return { clubs: G.clubs.length, named: Object.keys(by).length, dupes };
  })()`);

  assert.ok(run.clubs > 400, `only ${run.clubs} clubs in the world`);
  assert.ok(run.named > 400,
    `only ${run.named} clubs had a named manager, so this proves little`);
  /* joined rather than deep-compared: these arrays come back from the
     page's realm, so a strict deep equal fails on the prototype alone */
  assert.equal(Array.from(run.dupes).join('\n  '), '',
    `managers holding two jobs:\n  ${Array.from(run.dupes).join('\n  ')}`);
});

test('Fontaine is at Madrid Blancos, and only there', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const where = [];
    let benfica = null;
    G.clubs.forEach(c => {
      let n = null;
      try { n = managerOf(c); } catch (e) { n = null; }
      if (n && /Fontaine/.test(n)) where.push(c.name);
      if (c.name === 'União Lisboa') benfica = n;
    });
    return { where, benfica };
  })()`);

  assert.equal(Array.from(run.where).join(', '), 'Madrid Blancos',
    `Fontaine is at: ${Array.from(run.where).join(', ') || 'nowhere'}`);
  assert.ok(run.benfica, 'União Lisboa has no manager at all');
  assert.doesNotMatch(run.benfica, /Fontaine/,
    'União Lisboa is still managed by Fontaine');
});

test('the clubs the game names keep the man it named', async (t) => {
  /* The replacement has to fall on the club that is not the curated one.
     If a collision took Fontaine off Madrid Blancos instead of off União Lisboa
     the duplicate count would still be zero and the game would still be
     wrong. */
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const wrong = [];
    G.clubs.forEach(c => {
      if (!MANAGERS[c.key]) return;
      if (c.i === G.my) return;
      let n = null;
      try { n = managerOf(c); } catch (e) { n = null; }
      if (n !== MANAGERS[c.key]) wrong.push(c.name + ': ' + MANAGERS[c.key] + ' became ' + n);
    });
    return { wrong, curated: G.clubs.filter(c => MANAGERS[c.key]).length };
  })()`);

  assert.ok(run.curated > 20, `only ${run.curated} clubs are in the curated list`);
  assert.equal(Array.from(run.wrong).join('\n  '), '',
    `a curated club lost its manager to the deduplication:\n  ${Array.from(run.wrong).join('\n  ')}`);
});
