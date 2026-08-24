const test = require('node:test');
const assert = require('node:assert/strict');

const renderer = require('../src/dugout-renderer.js');
const { createGame, startCareer } = require('./game-harness.cjs');

test('the broadcast camera keeps play large and preserves perspective', () => {
  const camera = renderer.cameraTarget(780, 560, {
    ballX: 52.5, ballY: 34, velocity: 0, leadX: 0, done: false, halfTime: false,
  });
  const focus = renderer.projectPoint(camera, 52.5, 34, 0);
  const nearPlayer = renderer.projectPoint(camera, 52.5, 8, 1.82);
  const farPlayer = renderer.projectPoint(camera, 52.5, 60, 1.82);

  assert.ok(Math.abs(focus.x - 390) < 1);
  assert.ok(Math.abs(focus.y - 560 * 0.64) < 1);
  assert.ok(nearPlayer.scale > farPlayer.scale * 1.8, 'near players should be visibly larger');
  assert.ok(camera.zoom >= 1.5, 'normal play should use a recognisable broadcast close shot');
  const switchCamera = renderer.cameraTarget(780, 560, {
    ballX: 52.5, ballY: 34, velocity: 24, leadX: 20, done: false, halfTime: false,
  });
  assert.ok(switchCamera.zoom < camera.zoom, 'a long switch should pull the camera out');
});

test('similar club colours are separated into readable kits', () => {
  const [home, away] = renderer.resolveKits(
    { c1: '#d71920', c2: '#ffffff' },
    { c1: '#cf1724', c2: '#111827' },
  );
  assert.ok(renderer.colourDistance(home.primary, away.primary) >= 92);
  assert.notEqual(home.goalkeeper, away.goalkeeper);
});

test('engine commentary maps onto actions the renderer can show', () => {
  assert.equal(renderer.classifyEvent('Martínez times the tackle perfectly.', ''), 'tackle');
  assert.equal(renderer.classifyEvent('Onana tips it over!', 'big'), 'save');
  assert.equal(renderer.classifyEvent('Fernandes dances past his marker and squares it.', ''), 'dribble');
  assert.equal(renderer.classifyEvent('Mainoo completes a pass through midfield.', ''), 'pass');
  assert.equal(renderer.classifyEvent('GOAL! Højlund rifles it in!', 'goal'), 'goal');
  assert.equal(renderer.classifyEvent('A quiet spell in midfield.', ''), null);
});

test('the Dugout is retired, and the broadcast is kept for the highlights',
  { timeout: 45000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Dugout Retired');

    /* WHAT THIS TEST USED TO PROVE no longer exists. It selected the
       Dugout tab, drew the 2D renderer into it and checked that the
       renderer picked up engine events -- the fallback path for a device
       that could not bring the broadcast up.

       There is no Dugout tab to select now. Watching a match live meant
       the broadcast had to score a named man's goal inside a named
       minute while the save ran beside it, and at 150 seconds a half
       there is no room to build one out of open play, so it forced them:
       42% of the picture's goals were put away from the penalty spot.
       Live play is Pitch, Text and Stats, and the goals are played back
       once the match is over.

       So what matters here is that the retirement is complete and that
       nothing needed for the reel was thrown away with it. */
    const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    const d=window.RBSDugoutMatchday;
    return {
      /* the tab is gone, and nothing can reach it */
      dugoutTab:!!document.querySelector('#matchScreen .mtabs [data-v="dugout"]'),
      tabs:[...document.querySelectorAll('#matchScreen .mtabs [data-action="mtab"]')]
        .map(b=>b.dataset.v).join(','),
      lit:[...document.querySelectorAll('#matchScreen .mtabs [data-action="mtab"]')]
        .filter(b=>b.classList.contains('on')).map(b=>b.dataset.v).join(','),
      /* the live driver is stood down and cannot take a match */
      liveWant:d.LIVE.want, liveOn:d.LIVE.on, standDown:d.state.failed,
      /* and everything the reel runs on is still here */
      broadcastLoaded:!!window.RBSDugoutMatchday,
      squadFor:typeof d.squadFor==='function',
      highlights:!!window.RBSHighlights,
      reelFor:typeof window.RBSHighlights.reelFor==='function',
      rendererInstalled:window.RBSDugoutRenderer.installed
    };
  })()`);

    assert.equal(result.dugoutTab, false, 'there is no Dugout tab to select');
    assert.equal(result.tabs, 'pitch,comm,stats');
    assert.equal(result.lit, 'pitch', 'and a match opens on the football');
    assert.equal(result.liveWant, false, 'the live driver is never armed');
    assert.equal(result.liveOn, false);
    assert.equal(result.standDown, true,
      'and it is stood down, so it cannot take a match even if asked');
    assert.equal(result.broadcastLoaded, true,
      'the broadcast driver stays — the reel is built on its squad and kit conversion');
    assert.equal(result.squadFor, true);
    assert.equal(result.highlights, true, 'and the reel itself is installed');
    assert.equal(result.reelFor, true);
    assert.equal(result.rendererInstalled, true,
      'the 2D renderer is left alone rather than deleted');
  });
