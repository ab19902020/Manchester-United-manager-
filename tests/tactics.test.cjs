const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The attacking focus.
 *
 * Written against the behaviour rather than the constants: there must be
 * a way to say "no channel", the strength must be a dial rather than a
 * switch, and the opposition must not all play through the middle. The
 * exact percentages are free to move.
 */

test('the attacking focus has a neutral, and a strength you can dial', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const ui = game.eval(`(function(){
    // an old save: it was set to Central because the game set it there and
    // offered nothing else
    G.tacs.passFocus = 'Central';
    delete G.tacs.focusPower;
    const html = vTactics();
    const grab = (k) => (html.match(new RegExp('data-k="'+k+'" data-v="([^"]+)"','g'))||[])
      .map(s => s.replace(/.*data-v="/,'').replace('"',''));
    return {
      focus: grab('passFocus'),
      power: grab('focusPower'),
      focusRows: (html.match(/Attacking focus/g)||[]).length,
      powerRows: (html.match(/Focus strength/g)||[]).length,
      migratedFocus: G.tacs.passFocus,
      migratedPower: G.tacs.focusPower,
    };
  })()`);

  assert.ok(Array.from(ui.focus).indexOf('Balanced') >= 0,
    `the focus row must offer a neutral, got ${Array.from(ui.focus).join(', ')}`);
  assert.equal(Array.from(ui.focus).length, 4, 'a neutral, two flanks and the middle');
  assert.equal(Array.from(ui.power).join(','), 'Slight,Strong', 'and a strength to go with it');
  assert.equal(ui.focusRows, 1, 'the focus row must not be rendered twice');
  assert.equal(ui.powerRows, 1, 'nor the strength row');

  // a save that never had the choice was not choosing Central
  assert.equal(ui.migratedFocus, 'Balanced',
    'an old save forced onto Central should come across as Balanced');
  assert.equal(ui.migratedPower, 'Slight', 'and start off leaning rather than committed');
});

test('a deliberate flank choice survives, and Strong leans twice as far as Slight', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const kept = game.eval(`(function(){
    G.tacs.passFocus = 'Left Flank';
    delete G.tacs.focusPower;
    vTactics();
    return G.tacs.passFocus;
  })()`);
  assert.equal(kept, 'Left Flank', 'picking a flank was a real decision and must be kept');

  const run = game.eval(`(function(){
    const LEFT = ['DL','WBL','ML','AML'];
    const RIGHT = ['DR','WBR','MR','AMR'];
    const chan = (s) => LEFT.indexOf(s)>=0 ? 'left' : RIGHT.indexOf(s)>=0 ? 'right' : 'central';
    let bucket = null;
    const real = MatchSim.prototype.shotEvent;
    MatchSim.prototype.shotEvent = function(A, D, shooter, creator) {
      if (bucket && creator && A && A.c && A.c.i === G.my) bucket.push(chan(creator.slot));
      return real.apply(this, arguments);
    };
    const fix = G.fixtures.find(f => f.h===G.my || f.a===G.my);
    const share = (focus, power) => {
      G.tacs.passFocus = focus; G.tacs.focusPower = power;
      const rec = []; bucket = rec;
      for (let i = 0; i < 70; i++) {
        G.clubs.forEach(c => c.players.forEach(p => {
          p.cond = 95; p.sharp = 90; p.injury = null; p.susp = 0; }));
        quickSim({h:fix.h, a:fix.a, day:fix.day, div:fix.div, r:0,
          played:false, hs:0, as:0, sc:[]});
      }
      bucket = null;
      const n = rec.length || 1;
      return {n: rec.length, left: rec.filter(x=>x==='left').length/n};
    };
    const base = share('Balanced','Slight');
    const slight = share('Left Flank','Slight');
    const strong = share('Left Flank','Strong');
    MatchSim.prototype.shotEvent = real;

    // and the dial itself, drawn straight
    const api = window.RBSTactics;
    const draws = (power) => {
      let biased = 0;
      for (let i = 0; i < 4000; i++) {
        if (api.decide({passFocus:'Left Flank', focusPower:power}) === 'Left Flank') biased++;
      }
      return biased / 4000;
    };
    return {base: base.left, slight: slight.left, strong: strong.left,
      samples: [base.n, slight.n, strong.n],
      drawStrong: draws('Strong'), drawSlight: draws('Slight'),
      balancedNeverBiases: api.decide({passFocus:'Balanced', focusPower:'Strong'}) === 'Balanced'};
  })()`);

  assert.ok(Math.min.apply(null, Array.from(run.samples)) > 800,
    `not enough chances sampled: ${Array.from(run.samples).join('/')}`);

  // 1. the dial does what it says
  assert.equal(run.drawStrong, 1, 'Strong should commit to the channel on every decision');
  assert.ok(run.drawSlight > 0.3 && run.drawSlight < 0.6,
    `Slight should lean on some decisions, not all — biased ${(run.drawSlight * 100).toFixed(0)}%`);
  assert.ok(run.balancedNeverBiases, 'Balanced must never bias, whatever the strength says');

  // 2. and it shows up in where chances are made
  const slightGain = run.slight - run.base;
  const strongGain = run.strong - run.base;
  assert.ok(slightGain > 0.01,
    `a slight left-sided focus should still make more left-sided chances (${(slightGain*100).toFixed(1)}pts)`);
  assert.ok(strongGain > slightGain,
    `Strong should lean further than Slight (${(strongGain*100).toFixed(1)} vs ${(slightGain*100).toFixed(1)}pts)`);
});

test('the final-third instruction changes who scores and who makes it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const run = game.eval(`(function(){
    const WIDE = ['DL','WBL','ML','AML','DR','WBR','MR','AMR'];
    const fix = G.fixtures.find(f => f.h===G.my || f.a===G.my);
    const mine = fix.h===G.my ? 0 : 1;
    const measure = (third) => {
      G.tacs.passFocus='Balanced'; G.tacs.focusPower='Slight';
      G.tacs.buildUp='Balanced'; G.tacs.finalThird=third;
      let head=0, pace=0, goals=0, wideAssists=0, assists=0;
      for (let i = 0; i < 70; i++) {
        G.clubs.forEach(c => c.players.forEach(p => {
          p.cond=95; p.sharp=90; p.injury=null; p.susp=0; }));
        const f = {h:fix.h, a:fix.a, day:fix.day, div:fix.div, r:0,
          played:false, hs:0, as:0, sc:[]};
        const m = quickSim(f);
        (m.sides[mine].onfield||[]).forEach(x => {
          const a = (x.p && x.p.attrs) || {};
          if (x.goals) { head += (a.heading||0)*x.goals; pace += (a.pace||0)*x.goals; goals += x.goals; }
          if (x.assists) { assists += x.assists; if (WIDE.indexOf(x.slot)>=0) wideAssists += x.assists; }
        });
      }
      return {goals, assists, head: head/(goals||1), pace: pace/(goals||1),
        wide: wideAssists/(assists||1)};
    };
    return {base: measure('Balanced'), crosses: measure('Crosses'),
      through: measure('Through balls'), worked: measure('Work it in')};
  })()`);

  ['base', 'crosses', 'through', 'worked'].forEach((k) => {
    assert.ok(run[k].goals > 60, `${k}: not enough goals sampled (${run[k].goals})`);
  });

  // crossing: wingers supply it, and the men heading it in can head
  assert.ok(run.crosses.wide > run.base.wide + 0.04,
    `crossing should make more of the assists come from wide (${(run.crosses.wide*100).toFixed(1)}% vs ${(run.base.wide*100).toFixed(1)}%)`);
  assert.ok(run.crosses.head > run.base.head,
    `crossing should put the ball on better heads (${run.crosses.head.toFixed(2)} vs ${run.base.head.toFixed(2)})`);

  // through balls: the opposite shape — central creators, quick finishers
  assert.ok(run.through.wide < run.base.wide - 0.10,
    `through balls should come from inside, not from wide (${(run.through.wide*100).toFixed(1)}% wide)`);
  assert.ok(run.through.pace > run.base.pace,
    `through balls should be run onto by quicker players (${run.through.pace.toFixed(2)} vs ${run.base.pace.toFixed(2)})`);
  assert.ok(run.through.head < run.crosses.head,
    'a through-ball side should not be scoring the same headers as a crossing one');

  // and the three are genuinely different from each other, not three labels
  assert.ok(Math.abs(run.crosses.wide - run.through.wide) > 0.2,
    'crossing and through balls should not produce the same chances');
});

test('build-up leans the way the squad can actually play', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const spread = game.eval(`(function(){
    const fix = G.fixtures.find(f => f.h===G.my || f.a===G.my);
    const m = new MatchSim({h:fix.h,a:fix.a,day:fix.day,div:fix.div,r:0,
      played:false,hs:0,as:0,sc:[]});
    const out = {};
    ['PL','L2','NL'].forEach(d => {
      const build = {}, third = {};
      G.clubs.filter(c => c.league===d && c.i!==G.my).slice(0,14).forEach(c => {
        const s = MatchSim.prototype._side.call(m, c.i, true);
        build[s.tac.buildUp] = (build[s.tac.buildUp]||0)+1;
        third[s.tac.finalThird] = (third[s.tac.finalThird]||0)+1;
      });
      out[d] = {build, third};
    });
    return out;
  })()`);

  const playOut = (d) => spread[d].build['Play out'] || 0;
  assert.ok(playOut('PL') > playOut('NL'),
    `Premier League sides should play out more than National League ones (${playOut('PL')} vs ${playOut('NL')})`);
  assert.ok(Object.keys(spread.NL.build).length >= 1, 'the National League should have a plan too');
  // and the final third is not one plan copied across the world
  const kinds = new Set();
  ['PL', 'L2', 'NL'].forEach((d) => Object.keys(spread[d].third).forEach((k) => kinds.add(k)));
  assert.ok(kinds.size >= 2,
    `every club in the world finishes the same way: ${JSON.stringify(spread)}`);
});

test('the opposition no longer all funnel through the middle', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game);

  const spread = game.eval(`(function(){
    const fix = G.fixtures.find(f => f.h===G.my || f.a===G.my);
    const m = new MatchSim({h:fix.h, a:fix.a, day:fix.day, div:fix.div, r:0,
      played:false, hs:0, as:0, sc:[]});
    const seen = {};
    let n = 0;
    G.clubs.forEach(c => {
      if (c.i === G.my || n >= 60) return;
      const side = MatchSim.prototype._side.call(m, c.i, true);
      const f = side.tac.passFocus;
      seen[f] = (seen[f] || 0) + 1;
      n++;
    });
    return {seen, n};
  })()`);

  const kinds = Object.keys(spread.seen);
  assert.ok(spread.n >= 20, 'a decent sample of clubs');
  assert.ok(kinds.length >= 2,
    `every club in the world still plays the same way: ${JSON.stringify(spread.seen)}`);
  const central = spread.seen.Central || 0;
  assert.ok(central < spread.n,
    'not every club should be set to attack through the middle');
});
