const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, startCareer, waitFor } = require('./game-harness.cjs');
const lowerLeagueData = require('../src/lower-league-data.js');
const authenticFixtureData = require('../src/authentic-fixture-data.js');

function checkLowerLeagueSquads(game) {
  const pickerNames = JSON.parse(game.eval(`JSON.stringify(buildRoster()
    .filter(club=>['L1','L2','NL'].includes(club.league)).map(club=>club.name))`));
  const live = JSON.parse(game.eval(`JSON.stringify(['L1','L2','NL'].flatMap(division=>
    G.clubs.filter(club=>club.league===division).map(club=>({
      division,name:club.name,size:club.players.length,
      names:club.players.map(player=>player.name),
      positions:club.players.map(player=>player.pos),
      ratings:club.players.map(player=>player.ovr),
      contracts:club.players.map(player=>player.contract),
      source:club.rosterSource,readDate:club.rosterReadDate
    }))))`));

  assert.equal(live.length, 72);
  assert.deepEqual(pickerNames.slice().sort(), live.map((club) => club.name).sort());
  const divisionAverages = {};
  for (const division of ['L1', 'L2', 'NL']) {
    const actual = live.filter((club) => club.division === division);
    const sourced = lowerLeagueData.divisions[division];
    assert.equal(actual.length, 24);
    assert.equal(sourced.readDate, lowerLeagueData.readDate);
    assert.match(sourced.source, /^https:\/\/site\.api\.espn\.com\//);
    assert.deepEqual(
      actual.map((club) => club.name).sort(),
      Object.keys(sourced.teams).sort(),
    );
    for (const club of actual) {
      const sourceTeam = sourced.teams[club.name];
      const sourceNames = new Set(sourceTeam.players.map((player) => player.name));
      assert.equal(club.size, 19, `${club.name} squad depth changed`);
      assert.ok(club.names.every((name) => sourceNames.has(name)), `${club.name} contains an unsourced player`);
      assert.equal(club.source, sourceTeam.source);
      assert.equal(club.readDate, lowerLeagueData.readDate);
      assert.ok(club.positions.includes('GK'), `${club.name} has no goalkeeper slot`);
      assert.ok(club.positions.some((position) => ['DL', 'DC', 'DR', 'WBL', 'WBR'].includes(position)));
      assert.ok(club.positions.some((position) => ['DM', 'MC', 'ML', 'MR', 'AMC'].includes(position)));
      assert.ok(club.positions.some((position) => ['AML', 'AMR', 'ST'].includes(position)));
      assert.ok(club.contracts.every((years) => years >= 1 && years <= 5));
    }
    const ratings = actual.flatMap((club) => club.ratings);
    divisionAverages[division] = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  }
  assert.ok(divisionAverages.L1 > divisionAverages.L2);
  assert.ok(divisionAverages.L2 > divisionAverages.NL);
  assert.ok(live.find((club) => club.name === 'Leicester City').names.includes('Wout Faes'));
}

function checkAuthenticFixtures(game, divisions) {
  const live = JSON.parse(game.eval(`JSON.stringify((()=>{
    const divisions=${JSON.stringify(divisions)};
    const fixtures=G.fixtures.filter(f=>divisions.includes(f.div));
    return {
      epoch:G.epoch,
      sources:G.fixtureSources,
      collisions:(()=>{
        const seen=new Map(),out=[];
        const all=[...G.fixtures,...Object.values(G.cups||{}).flatMap(c=>c.ties||[])];
        all.filter(f=>!f.played).forEach(f=>[f.h,f.a].forEach(ci=>{
          const key=ci+'|'+f.day;
          if(seen.has(key))out.push({club:G.clubs[ci].name,day:f.day});
          else seen.set(key,f);
        }));
        return out;
      })(),
      fixtures:fixtures.map(f=>({
        division:f.div,date:new Date(G.epoch+f.day*86400000).toISOString().slice(0,10),
        home:G.clubs[f.h].name,away:G.clubs[f.a].name,round:f.r,
        authentic:f.authentic,sourceId:f.sourceId
      }))
    };
  })())`));

  assert.deepEqual(live.collisions, [], 'a club has two league/cup fixtures on the same day');

  for (const division of divisions) {
    const source = authenticFixtureData.divisions[division];
    const actual = live.fixtures.filter((fixture) => fixture.division === division);
    assert.equal(source.status, 'published');
    assert.equal(source.readDate, authenticFixtureData.readDate);
    assert.match(source.source, /^https:\/\//);
    if (source.provider === 'ESPN') assert.match(source.source, /^https:\/\/site\.api\.espn\.com\//);
    if (division === 'CZE') {
      assert.equal(source.provider, 'Chance Liga');
      assert.match(source.source, /^https:\/\/www\.chanceliga\.cz\/rozpis-zapasu/);
    }
    assert.equal(actual.length, source.fixtureCount);
    assert.equal(live.sources[division].source, source.source);
    assert.equal(live.sources[division].readDate, source.readDate);
    assert.ok(actual.every((fixture) => fixture.authentic === 1));
    const expected = source.fixtures
      .map(([date, home, away, round, sourceId]) => ({ date, home, away, round, sourceId }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    const observed = actual
      .map(({ date, home, away, round, sourceId }) => ({ date, home, away, round, sourceId }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    assert.deepEqual(observed, expected, `${division} diverged from its source snapshot`);

    const directedPairs = new Set(actual.map((fixture) => `${fixture.home}\u0000${fixture.away}`));
    for (const home of source.teams) {
      for (const away of source.teams) {
        if (home !== away) assert.ok(directedPairs.has(`${home}\u0000${away}`), `${division}: missing ${home} v ${away}`);
      }
    }
  }

  if (divisions.includes('GER')) {
    assert.ok(live.fixtures.some((fixture) => fixture.division === 'GER'
      && fixture.date === '2026-08-28'
      && fixture.home === 'Bayern München'
      && fixture.away === 'VfB Stuttgart'));
  }
}

test('new careers save the complete world and manual slots never evict one another', { timeout: 60000 }, async () => {
  const game = await createGame();
  try {
    await startCareer(game);
    const live = game.eval('({clubs:G.clubs.length,players:G.clubs.reduce((n,c)=>n+c.players.length+(c.youth||[]).length,0),fixtures:G.fixtures.length,day:G.day,date:fmtDate(G.day)})');
    assert.equal(live.clubs, 484);
    assert.ok(live.players >= 9800);
    assert.equal(live.fixtures, 8781);
    assert.equal(live.day, 0);
    checkLowerLeagueSquads(game);
    checkAuthenticFixtures(game, [
      'PL', 'CH', 'L1', 'L2', 'NL', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED',
      'ITA2', 'GER2', 'FRA2', 'TUR', 'GRE', 'CZE',
    ]);
    const sourcedPicker = JSON.parse(game.eval(`JSON.stringify(buildRoster()
      .filter(club=>['ESP','ITA','GER','FRA','POR','NED','ITA2','GER2','FRA2','TUR','GRE','CZE'].includes(club.league))
      .map(club=>club.name).sort())`));
    const sourcedLive = JSON.parse(game.eval(`JSON.stringify(G.clubs
      .filter(club=>['ESP','ITA','GER','FRA','POR','NED','ITA2','GER2','FRA2','TUR','GRE','CZE'].includes(club.league))
      .map(club=>club.name).sort())`));
    assert.deepEqual(sourcedPicker, sourcedLive);
    assert.ok(sourcedLive.includes('Zbrojovka Brno'));
    assert.ok(sourcedLive.includes('Artis Brno'));

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

test('published 2026/27 dates survive congestion and season two generates afresh', { timeout: 60000 }, async () => {
  const game = await createGame();
  try {
    await startCareer(game);
    const protectedDate = game.eval(`(()=>{
      const cups=Object.values(G.cups||{}).flatMap(c=>c.ties||[]);
      for(const cup of cups){
        const sourced=G.fixtures.find(f=>f.authentic&&f.day>G.day+7&&f.day<G.day+110&&
          (f.h===cup.h||f.a===cup.h||f.h===cup.a||f.a===cup.a));
        if(!sourced)continue;
        const before=sourced.day;
        cup.day=before;
        reschedSweep();
        return {before,after:sourced.day,cupAfter:cup.day,sourceMoved:!!sourced.moved,cupMoved:!!cup.moved};
      }
      return null;
    })()`);
    assert.ok(protectedDate, 'no cup/source collision could be constructed');
    assert.equal(protectedDate.after, protectedDate.before);
    assert.equal(protectedDate.sourceMoved, false);
    assert.notEqual(protectedDate.cupAfter, protectedDate.before);
    assert.equal(protectedDate.cupMoved, true);

    const seasonTwo = game.eval(`(()=>{
      G.fixtures.forEach(f=>{f.played=true;f.hs=0;f.as=0});
      endSeason();
      return {season:G.season,total:G.fixtures.length,sourced:G.fixtures.filter(f=>f.authentic).length,
        sourceCount:Object.keys(G.fixtureSources||{}).length,
        divisions:Object.fromEntries(leagueKeys().filter(k=>divMembers(k).length>1)
          .map(k=>[k,G.fixtures.filter(f=>f.div===k).length]))};
    })()`);
    assert.equal(seasonTwo.season, 2);
    assert.equal(seasonTwo.total, 8781);
    assert.equal(seasonTwo.sourced, 0);
    assert.equal(seasonTwo.sourceCount, 0);
    assert.equal(seasonTwo.divisions.PL, 380);
    assert.equal(seasonTwo.divisions.CH, 552);
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
