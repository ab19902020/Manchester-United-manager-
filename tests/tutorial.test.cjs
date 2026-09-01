const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE TOUR HAS TO POINT AT SOMETHING
   ---------------------------------------------------------------------
   "Add a tutorial mode for beginners."

   The whole idea of this tour is that it spotlights an element that is
   actually on the screen -- the budget, the tab bar, the Continue button
   -- rather than describing the interface in prose beside a picture of
   it. That makes it fragile in one specific way: a selector that stops
   matching leaves a step highlighting nothing, and nothing about the
   game would break, so nobody would find out.

   So this checks the thing that would rot. Every step's selector must
   still find an element, and the tour must open, walk and close without
   leaving anything behind.

   It also pins the choice not to launch itself. A tour that opens over a
   screen you did not ask for would sit in front of the game for every
   automated pass over it -- the layout audit, the menu sweep, and every
   test in this directory that clicks a real control.
   ===================================================================== */

test('every step of the tour points at something that is really there',
  { timeout: 90000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Beginner');

    const out = game.eval(`(()=>{
    UI.view='home'; render();
    const T=window.RBSTutorial;
    const miss=[];
    T.STEPS.forEach((s,i)=>{
      const hit=s.sel.split(',').some(one=>document.querySelector(one.trim()));
      if(!hit) miss.push((i+1)+': '+s.title+'  ['+s.sel+']');
    });
    return { steps:T.STEPS.length, miss,
      titles:T.STEPS.map(s=>s.title) };
  })()`);

    assert.ok(out.steps >= 6, 'the tour should be worth taking, got ' + out.steps + ' steps');
    assert.deepEqual(Array.from(out.miss), [],
      'these steps point at nothing:\n  ' + Array.from(out.miss).join('\n  '));
  });

test('it is offered rather than launched, and only until it is taken',
  { timeout: 90000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Offered');

    const out = game.eval(`(()=>{
    try{ localStorage.removeItem('rbsTutSeen'); }catch(e){}
    delete G.tutSeen;
    UI.view='home'; render();
    const hb=document.getElementById('tutHelp');
    const sheet=[...document.querySelectorAll('style')]
      .map(s=>s.textContent||'').filter(t=>t.indexOf('.tut-help')>=0).join('');
    const rule=(sheet.match(/\\.tut-help\\{[^}]*\\}/)||[''])[0];
    const fresh={
      offer: !!document.querySelector('.tut-offer'),
      help: !!hb,
      helpClass: hb?hb.className:'',
      helpRule: rule,
      /* NOTHING IS COVERING THE GAME. This is the assertion that keeps
         every other test in this directory working. */
      overlay: !!document.getElementById('tutLayer')
    };

    /* take it */
    ACTIONS.tutStart();
    const open={ layer: !!document.getElementById('tutLayer'),
      on: window.RBSTutorial.TOUR.on,
      steps: window.RBSTutorial.TOUR.steps.length };

    /* and walk it to the end */
    let guard=0;
    while(window.RBSTutorial.TOUR.on && guard++<40) ACTIONS.tutNext();

    UI.view='home'; render();
    const after={ layer: !!document.getElementById('tutLayer'),
      offer: !!document.querySelector('.tut-offer'),
      help: !!document.getElementById('tutHelp'),
      walked: guard };
    return { fresh, open, after };
  })()`);

    assert.ok(out.fresh.offer, 'a new manager is offered the tour on the home screen');
    assert.ok(out.fresh.help, 'and there is a ? in the header');
    /* AND IT SITS WHERE ITS SIBLING SITS. The `?` is given `.fsbtn` so
       it matches the fullscreen control beside it, plus
       `position:relative` so its 44px hit area can be positioned. That
       second one has a bite: `.fsbtn` still carries `top:50%` from an
       older layout, inert only while it is `position:static`, and the
       layer that made it static also set `transform:none` -- throwing
       away the `translateY(-50%)` that used to cancel the `top`. So
       turning position back on re-activated the `top` with nothing to
       cancel it, dropping the `?` by half the header row and laying it
       across the Inbox tile. Measured in Chromium: 28px against the
       fullscreen button's 10px.

       This asserts the CANCELLATION rather than the geometry, because
       this harness is JSDOM and JSDOM has no layout engine --
       getBoundingClientRect returns zeros there, so a test comparing
       two positions would read 0 against 0 and pass whatever the
       stylesheet said. What it can check is that the rule which cancels
       the inherited offset is still in the rule that turns positioning
       on, which is the thing that would actually be deleted. */
    assert.ok(/position\s*:\s*relative/.test(out.fresh.helpRule),
      'the ? is a positioning context for its hit area: ' + out.fresh.helpRule);
    assert.ok(/(^|;)\s*top\s*:\s*0/.test(out.fresh.helpRule),
      'and cancels the top:50% that .fsbtn hands it, or it drops half a '
      + 'header row onto the Inbox tile: ' + out.fresh.helpRule);
    assert.equal(out.fresh.overlay, false,
      'the tour must NOT open itself — it would sit in front of the game for '
      + 'every test and every audit that clicks a real control');

    assert.ok(out.open.layer && out.open.on, 'pressing it opens the tour');
    assert.ok(out.open.steps > out.fresh.steps || out.open.steps >= 7,
      'the tour has its closing step added, got ' + out.open.steps);

    assert.equal(out.after.layer, false, 'walking to the end closes it cleanly');
    assert.equal(out.after.offer, false, 'and the offer does not come back');
    assert.ok(out.after.help, 'but the ? stays, so it can be taken again');
    assert.ok(out.after.walked < 40, 'the tour ends rather than looping');
  });
