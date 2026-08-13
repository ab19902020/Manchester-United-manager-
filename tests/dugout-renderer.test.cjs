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

test('the extracted Dugout renderer owns the live frame and receives engine events', { timeout: 45000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Dugout Regression');

  const result = game.eval(`(()=>{
    G.day=nextUserFixture().day;
    UI.view='home';render();ACTIONS.advance();
    ACTIONS.kickoff();
    ACTIONS.mtab(document.querySelector('.mtabs [data-action="mtab"][data-v="dugout"]'));
    drawDugout();
    const before=window.RBSDugoutRenderer.scene.frame;
    const side=MU.m.sides[0];
    const player=side.onfield.find(x=>x.slot!=='GK');
    MU.m.say(MU.m.dispMin(),side,player.p.name+' completes a pass through midfield.','');
    drawDugout();
    const event=window.RBSDugoutRenderer.scene.event;
    const threeEvent=window.RBSDugout3D.state.timeline.queue.at(-1);
    const canvasPresent=!!document.getElementById('dugCanvas');
    ACTIONS.mtab(document.querySelector('.mtabs [data-action="mtab"][data-v="pitch"]'));
    return {
      installed:window.RBSDugoutRenderer.installed,
      threeInstalled:window.RBSDugout3D.installed,
      threeFallback:window.RBSDugout3D.state.disabled,
      frames:window.RBSDugoutRenderer.scene.frame,
      advanced:window.RBSDugoutRenderer.scene.frame>before,
      event:event&&event.type,
      threeEvent:threeEvent&&threeEvent.type,
      actor:event&&event.primary&&event.primary.p.name,
      canvas:canvasPresent,
      pitchTabSelected:document.querySelector('.mtabs [data-v="pitch"]').classList.contains('on'),
      dugoutTabSelected:document.querySelector('.mtabs [data-v="dugout"]').classList.contains('on'),
      error:window.RBSDugoutRenderer.scene.lastError&&String(window.RBSDugoutRenderer.scene.lastError)
    };
  })()`);

  assert.equal(result.installed, true);
  assert.equal(result.threeInstalled, true);
  assert.equal(result.threeFallback, true);
  assert.equal(result.canvas, true);
  assert.equal(result.pitchTabSelected, true);
  assert.equal(result.dugoutTabSelected, false);
  assert.equal(result.advanced, true);
  assert.ok(result.frames >= 2);
  assert.equal(result.event, 'pass');
  assert.equal(result.threeEvent, 'pass');
  assert.ok(result.actor);
  assert.equal(result.error, null);
});
