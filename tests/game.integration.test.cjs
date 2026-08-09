const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, startCareer, waitFor } = require('./game-harness.cjs');

test('new careers save the complete world and manual slots never evict one another', { timeout: 60000 }, async () => {
  const game = await createGame();
  try {
    await startCareer(game);
    const live = game.eval('({clubs:G.clubs.length,players:G.clubs.reduce((n,c)=>n+c.players.length+(c.youth||[]).length,0),fixtures:G.fixtures.length,day:G.day,date:fmtDate(G.day)})');
    assert.equal(live.clubs, 484);
    assert.ok(live.players >= 9800);
    assert.equal(live.fixtures, 8781);
    assert.equal(live.day, 0);

    const auto = await game.window.RBSSaves.store.get('auto');
    assert.ok(auto);
    const checked = game.window.RBSCareerStore.validatePayload(auto.payload);
    assert.equal(checked.valid, true);
    assert.equal(checked.counts.clubs, 484);
    assert.equal(checked.counts.fixtures, 8781);

    await game.window.RBSSaves.save('1', true);
    await game.window.RBSSaves.save('2', true);
    await game.window.RBSSaves.save('3', true);
    const slots = (await game.window.RBSSaves.store.list())
      .map((meta) => meta.slot)
      .filter((slot) => ['auto', '1', '2', '3'].includes(slot))
      .sort();
    assert.deepEqual(slots, ['1', '2', '3', 'auto']);

    game.eval('G.day=8');
    await game.window.RBSSaves.save('1', true);
    game.eval('G.day=19');
    assert.equal(await game.window.RBSSaves.load('1'), true);
    assert.equal(game.eval('G.day'), 8);

    assert.doesNotThrow(() => game.eval("ACTIONS.offerAccept({dataset:{arg:'missing-offer'}})"));
    assert.equal(game.window.RBSDiagnostics.list().filter((item) => /offerAccept/.test(item.context)).length, 0);

    game.eval("G.day=nextUserFixture().day;UI.view='home';render();ACTIONS.advance()");
    assert.ok(game.document.querySelector('[data-action="kickoff"]'));
    game.eval('ACTIONS.simMatch()');
    // simMatch ticks the whole match synchronously, rebuilds the match screen
    // and then opens the full-time report a frame later, so the Continue button
    // is not there the instant the call returns. Wait for it rather than for a
    // duration.
    await waitFor(
      () => game.eval('!!(MU.m && MU.m.done)') && !!game.document.querySelector('[data-action="matchDone"]'),
      { label: 'the instant-simulated match to finish and offer Continue' },
    );
    assert.equal(game.eval('MU.m.done'), true);
    assert.ok(game.document.querySelector('[data-action="matchDone"]'));
    game.eval('ACTIONS.matchDone()');
    await waitFor(
      () => game.eval("UI.view==='home'&&MU.m===null&&MU.fix===null"),
      { label: 'the match to be cleared down and home to come back' },
    );
    assert.equal(game.eval("UI.view==='home'&&MU.m===null&&MU.fix===null"), true);
    await game.window.RBSSaves.save('auto', true);
  } finally {
    game.close();
  }
});

test('mobile UI fixes cover press copy, fixture dates, unique SVG ids and paginated transfers', { timeout: 60000 }, async () => {
  const game = await createGame();
  try {
    await startCareer(game);
    assert.equal(game.document.title, 'The Results Business — A Football Management Career');

    const openingDates = game.eval(`G.fixtures
      .filter(f=>f.div==='PL'&&(f.h===G.my||f.a===G.my))
      .sort((a,b)=>a.day-b.day)
      .slice(0,4).map(f=>fmtDate(f.day))`);
    assert.deepEqual(Array.from(openingDates), [
      'Sat, 22 Aug 2026',
      'Sun, 30 Aug 2026',
      'Sun, 6 Sept 2026',
      'Sun, 13 Sept 2026',
    ]);

    game.eval("UI.view='club';UI.clubTab='save';render()");
    assert.match(game.document.getElementById('view').textContent, /device database/i);
    assert.equal(game.document.querySelectorAll('[data-action="restartAsk"]').length, 1);

    game.eval("G.pressCtx={q:0,qTotal:4,day:G.day};UI.view='home';render()");
    assert.match(game.document.getElementById('view').textContent, /press conference is waiting/i);
    assert.doesNotMatch(game.document.getElementById('view').textContent, /walked out/i);

    game.eval("G.pressCtx=null;UI.view='transfers';render()");
    const ids = Array.from(game.document.querySelectorAll('[id]')).map((element) => element.id).filter(Boolean);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(duplicates, []);
    assert.ok(game.document.querySelectorAll('#trResults .plist > *').length <= 20);
    assert.ok(game.document.querySelectorAll('*').length < 4300);

    await game.eval('ACTIONS.fullscreen()');
    assert.match(game.document.getElementById('toast').textContent, /isn.t available|Add to Home Screen/i);
  } finally {
    game.close();
  }
});

test('detailed and background match engines stay inside shared regression bands', { timeout: 90000 }, async () => {
  const game = await createGame();
  try {
    game.eval(`(()=>{
      let seed=0x26272026;
      Math.random=()=>{
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        return seed/4294967296;
      };
    })()`);
    await startCareer(game);
    const result = game.eval(`(()=>{
      // Keep the statistical regression reproducible in CI. World generation
      // is already complete, so this seed only controls the simulated season.
      let seed=0xdecafbad;
      Math.random=()=>{
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        return seed/4294967296;
      };
      const fixtures=G.fixtures.filter(f=>f.div==='PL').sort((a,b)=>a.day-b.day);
      let current=0;
      fixtures.forEach(f=>{
        while(current<f.day){dailyRecovery();current++}
        quickSim(f)
      });
      const stats=list=>{
        const goals=list.reduce((sum,f)=>sum+f.hs+f.as,0);
        return {
          goals:goals/list.length,
          draws:list.filter(f=>f.hs===f.as).length/list.length,
          zeros:list.filter(f=>f.hs===0&&f.as===0).length/list.length
        }
      };
      const detailed=stats(fixtures);
      const background=fixtures.map(f=>({h:f.h,a:f.a,day:f.day,div:f.div,r:f.r,sc:[]}));
      background.forEach(f=>fastSim(f));
      return {detailed,background:stats(background),cal:G.gcal&&G.gcal.PL};
    })()`);
    const bands = game.window.RBSMatchModel.regressionBands();
    for (const model of [result.detailed, result.background]) {
      assert.ok(model.goals >= bands.goalsPerMatch[0] && model.goals <= bands.goalsPerMatch[1], JSON.stringify(result));
      assert.ok(model.draws >= bands.drawRate[0] && model.draws <= bands.drawRate[1], JSON.stringify(result));
      assert.ok(model.zeros >= bands.goallessRate[0] && model.zeros <= bands.goallessRate[1], JSON.stringify(result));
    }
    assert.ok(Math.abs(result.detailed.goals - result.background.goals) <= bands.modelGap, JSON.stringify(result));
  } finally {
    game.close();
  }
});
