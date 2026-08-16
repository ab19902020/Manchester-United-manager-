const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, wait } = require('./game-harness.cjs');

/*
 * The front door.
 *
 * The club picker was a grid of crests: twenty at a time, a three-letter
 * short form and nothing else. No money, no ground, no idea how hard the
 * job was. You picked blind.
 *
 * The world has 484 clubs and `ROSTER` already knew the money, the
 * stadium, the capacity and the standing of every one of them. These
 * tests are about that being on screen, and about the one thing that
 * must never break while it is: the button that starts the career.
 */

async function openPicker() {
  const game = await createGame();
  game.click('frontNew');
  await wait(400);
  return game;
}

test('you can read the job before you take it', async (t) => {
  const game = await openPicker();
  t.after(() => game.close());

  const run = game.eval(`(function(){
    const b = document.getElementById('startBody');
    const stat = {};
    b.querySelectorAll('.fd-stat').forEach(el => {
      stat[el.querySelector('.k').textContent.trim()] = el.querySelector('.v').textContent.trim();
    });
    return {
      club: (b.querySelector('.fd-hero .nm') || {}).textContent,
      stars: (b.querySelector('.fd-stars') || {}).textContent,
      stat,
      squadRows: b.querySelectorAll('.fd-squad .row').length,
      leagues: b.querySelectorAll('[data-action="fdLeague"]').length,
      clubs: b.querySelectorAll('[data-action="pickClub"]').length,
    };
  })()`);

  assert.ok(run.club, 'no club is being described');
  assert.match(run.stars, /[★☆]{5}/, 'the job has no difficulty on it');
  assert.ok(run.stat['Transfer budget'], 'the budget is not shown');
  assert.ok(run.stat.Capacity, 'the ground is not shown');
  assert.ok(run.stat.Standing, 'the club standing is not shown');
  assert.ok(run.squadRows >= 5,
    `only ${run.squadRows} players shown for a club whose squad the game knows`);
  assert.ok(run.leagues >= 20,
    `only ${run.leagues} leagues offered, and the world has more than twenty countries`);
  assert.ok(run.clubs >= 10, `only ${run.clubs} clubs listed`);
});

test('the whole pyramid can be browsed, not just the Premier League', async (t) => {
  const game = await openPicker();
  t.after(() => game.close());

  const run = game.eval(`(function(){
    const out = {};
    ['PL','CH','L1','L2','NL'].forEach(div => {
      ACTIONS.fdLeague({ dataset: { v: div } });
      const b = document.getElementById('startBody');
      out[div] = {
        clubs: b.querySelectorAll('[data-action="pickClub"]').length,
        club: (b.querySelector('.fd-hero .nm') || {}).textContent,
        budget: (b.querySelector('.fd-stat .v') || {}).textContent,
        canStart: !!b.querySelector('[data-action="startGame"]'),
      };
    });
    return out;
  })()`);

  ['PL', 'CH', 'L1', 'L2', 'NL'].forEach((div) => {
    const row = run[div];
    assert.ok(row.clubs >= 20, `${div}: only ${row.clubs} clubs listed`);
    assert.ok(row.club, `${div}: no club described after switching to it`);
    assert.ok(row.canStart, `${div}: no way to start a career from here`);
    // a budget of literally "£0" reads as a broken field
    assert.notEqual(row.budget, '£0', `${div}: budget rendered as £0`);
  });

  assert.notEqual(run.PL.club, run.NL.club,
    'switching leagues did not change the club being described');
});

test('choosing a club changes what the screen says, and what you would be taking on', async (t) => {
  const game = await openPicker();
  t.after(() => game.close());

  const run = game.eval(`(function(){
    const b = () => document.getElementById('startBody');
    const read = () => ({
      club: (b().querySelector('.fd-hero .nm') || {}).textContent,
      button: (b().querySelector('[data-action="startGame"]') || {}).textContent,
    });
    const before = read();
    const tiles = Array.from(b().querySelectorAll('[data-action="pickClub"]'));
    const other = tiles.filter(el => !el.classList.contains('on'))[0];
    if (other) ACTIONS.pickClub(other);
    return { before, after: read(), tiles: tiles.length };
  })()`);

  assert.ok(run.tiles > 1, 'there was only one club to choose from');
  assert.notEqual(run.after.club, run.before.club, 'picking another club changed nothing');
  assert.match(run.after.button, /TAKE THE/i, 'the start button lost its wording');
  assert.notEqual(run.after.button, run.before.button,
    'the start button does not name the club you actually chose');
});

test('the club builder still owns the screen when it is chosen', async (t) => {
  /* The redesign paints over the picker. It must not paint over the
     other way in — building a club from nothing is half the front door. */
  const game = await openPicker();
  t.after(() => game.close());

  const run = game.eval(`(function(){
    ACTIONS.ccMode({ dataset: { v: 'make' } });
    const b = document.getElementById('startBody');
    const made = { builder: !!b.querySelector('#ccName'), fd: !!b.querySelector('.fd-hero') };
    ACTIONS.ccMode({ dataset: { v: 'pick' } });
    const back = { fd: !!b.querySelector('.fd-hero'),
      canStart: !!b.querySelector('[data-action="startGame"]') };
    return { made, back };
  })()`);

  assert.ok(run.made.builder, 'the club builder did not open');
  assert.equal(run.made.fd, false, 'the picker painted over the club builder');
  assert.ok(run.back.fd, 'the picker did not come back');
  assert.ok(run.back.canStart, 'coming back from the builder lost the start button');
});
