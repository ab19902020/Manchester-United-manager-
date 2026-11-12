const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, startCareer, waitFor } = require('./game-harness.cjs');

/* THE WORLD IS INVENTED, AND COMPLETE.
   Every club is fictional and every player is generated or authored here;
   nothing is read from a roster feed or a published fixture list. What a
   new career has to guarantee instead is that the invented world is whole:
   five full English divisions, every squad deep enough to field a side,
   nobody in two squads, and nothing carrying the provenance fields the
   sourced data used to stamp on a player. */
function checkInventedWorld(game) {
  const live = JSON.parse(game.eval(`JSON.stringify((()=>{
    const eng=['PL','CH','L1','L2','NL'];
    const out={sizes:{},thin:[],keepers:[],stamped:0,noNat:0,names:[],picker:[]};
    eng.forEach(division=>{
      const clubs=G.clubs.filter(club=>club.league===division);
      out.sizes[division]=clubs.length;
      clubs.forEach(club=>{
        if(club.players.length<16)out.thin.push(club.name+':'+club.players.length);
        if(!club.players.some(player=>player.pos==='GK'))out.keepers.push(club.name);
        club.players.forEach(player=>{
          if(player.espnId||player.playerProfile||player.playerFactsSource)out.stamped++;
          if(!player.nat)out.noNat++;
        });
        out.names.push(club.name);
      });
    });
    out.picker=buildRoster().filter(club=>eng.includes(club.league)).map(club=>club.name);
    out.fixtureSources=Object.keys(G.fixtureSources||{}).length;
    out.authentic=G.fixtures.filter(f=>f.authentic).length;
    return out;
  })())`));
  assert.deepEqual(live.sizes, { PL: 20, CH: 24, L1: 24, L2: 24, NL: 24 });
  assert.deepEqual(live.thin, [], 'a club cannot field a matchday squad');
  assert.deepEqual(live.keepers, [], 'a club has no goalkeeper');
  assert.equal(live.stamped, 0, 'a player still carries sourced-data provenance');
  assert.equal(live.noNat, 0, 'a player has no nationality');
  assert.equal(new Set(live.names).size, live.names.length, 'two English clubs share a name');
  assert.deepEqual([...live.picker].sort(), [...live.names].sort(), 'the club picker and the world disagree');
  assert.equal(live.fixtureSources, 0);
  assert.equal(live.authentic, 0);
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
    checkInventedWorld(game);
    const sourcedPicker = JSON.parse(game.eval(`JSON.stringify(buildRoster()
      .filter(club=>['ESP','ITA','GER','FRA','POR','NED','ITA2','GER2','FRA2','TUR','GRE','CZE'].includes(club.league))
      .map(club=>club.name).sort())`));
    const sourcedLive = JSON.parse(game.eval(`JSON.stringify(G.clubs
      .filter(club=>['ESP','ITA','GER','FRA','POR','NED','ITA2','GER2','FRA2','TUR','GRE','CZE'].includes(club.league))
      .map(club=>club.name).sort())`));
    assert.deepEqual(sourcedPicker, sourcedLive);
    assert.ok(sourcedLive.length > 150);

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

    const migration = game.eval(`(()=>{
      const sourceClub=G.clubs.find(club=>club.name==='Manchester Reds');
      const destination=G.clubs.find(club=>club.name==='Merseyside Reds');
      const moved=sourceClub.players.find(player=>player.pos!=='GK'&&
        !destination.players.some(candidate=>candidate.name===player.name));
      sourceClub.players=sourceClub.players.filter(player=>player!==moved);
      moved.club=destination.i;
      destination.players.push(moved);
      return {movedId:moved.id,stayedId:sourceClub.players[0].id};
    })()`);
    await game.window.RBSSaves.save('2', true);
    assert.equal(await game.window.RBSSaves.load('2'), true);
    const migrated = JSON.parse(game.eval(`JSON.stringify((()=>{
      const where=id=>G.clubs.filter(club=>club.players.some(player=>player.id===id)).map(club=>club.name);
      return {moved:where(${migration.movedId}),stayed:where(${migration.stayedId})};
    })())`));
    assert.deepEqual(migrated.moved, ['Merseyside Reds'], 'loading reset a unique in-career transfer');
    assert.deepEqual(migrated.stayed, ['Manchester Reds']);
    assert.equal(await game.window.RBSSaves.load('1'), true);

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

test('every division plays whole rounds and season two generates afresh', { timeout: 60000 }, async () => {
  const game = await createGame();
  try {
    await startCareer(game);
    const seasonOne = JSON.parse(game.eval(`JSON.stringify((()=>{
      const out={};
      leagueKeys().filter(k=>divMembers(k).length>1).forEach(k=>{
        const members=divMembers(k),rows=G.fixtures.filter(f=>f.div===k);
        const pairs=new Set(rows.map(f=>f.h+'>'+f.a));
        const perClub={};rows.forEach(f=>{perClub[f.h]=(perClub[f.h]||0)+1;perClub[f.a]=(perClub[f.a]||0)+1});
        const each=perClub[members[0]];
        out[k]={n:members.length,rows:rows.length,pairs:pairs.size,
          even:members.every(i=>perClub[i]===each)};
      });
      return out;
    })())`));
    for (const [division, row] of Object.entries(seasonOne)) {
      /* most divisions play everybody twice; a twelve-club one plays three rounds */
      assert.ok(row.rows >= row.n * (row.n - 1), `${division}: fewer than a double round robin`);
      assert.equal(row.rows % (row.n * (row.n - 1) / 2), 0, `${division}: not a whole number of rounds`);
      assert.equal(row.pairs, row.n * (row.n - 1), `${division}: somebody never hosts somebody else`);
      assert.equal(row.even, true, `${division}: clubs play different numbers of matches`);
    }

    const total = game.eval('G.fixtures.length');
    const seasonTwo = game.eval(`(()=>{
      G.fixtures.forEach(f=>{f.played=true;f.hs=0;f.as=0});
      endSeason();
      return {season:G.season,total:G.fixtures.length,sourced:G.fixtures.filter(f=>f.authentic).length,
        sourceCount:Object.keys(G.fixtureSources||{}).length,
        divisions:Object.fromEntries(leagueKeys().filter(k=>divMembers(k).length>1)
          .map(k=>[k,G.fixtures.filter(f=>f.div===k).length]))};
    })()`);
    assert.equal(seasonTwo.season, 2);
    assert.equal(seasonTwo.total, total);
    assert.equal(seasonTwo.sourced, 0);
    assert.equal(seasonTwo.sourceCount, 0);
    assert.equal(seasonTwo.divisions.PL, 380);
    assert.equal(seasonTwo.divisions.CH, 552);
  } finally {
    game.close();
  }
});

test('a second career in the same session never double-books a club', { timeout: 60000 }, async () => {
  // The existing collision assertion only ever sees the FIRST career built in a
  // window, and that one is reliably clean. The calendar was rebuilt once more
  // after the last cup draw, throwing away every repair the rescheduler had
  // made, so the world actually handed to the player had never been swept —
  // and whether it happened to contain a clash varied career to career.
  // Same seed: first career clean, second broken, every time.
  const game = await createGame();
  try {
    await startCareer(game);
    const report = JSON.parse(game.eval(`JSON.stringify((()=>{
      const out=[];
      for(let career=1;career<=3;career+=1){
        let x=(23*2654435761)>>>0;
        Math.random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};
        newGame('MUN');
        const all=[...G.fixtures];
        if(G.cups)for(const k in G.cups)(G.cups[k].ties||[]).forEach(t=>all.push(t));
        const seen=new Map(),clashes=[];
        all.forEach(f=>{
          if(!f||f.played||f.day==null)return;
          [f.h,f.a].forEach(ci=>{
            if(ci==null)return;
            const key=ci+'|'+f.day;
            if(seen.has(key)){
              if(seen.get(key)!==f)clashes.push((G.clubs[ci]||{}).name+' on day '+f.day);
            } else seen.set(key,f);
          });
        });
        out.push({career,fixtures:G.fixtures.length,clashes:clashes.slice(0,5)});
      }
      return out;
    })())`));
    for (const career of report) {
      assert.equal(career.fixtures, 8781);
      assert.deepEqual(career.clashes, [], `career ${career.career} double-booked a club`);
    }
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
    // A rate from one 380-match season moves in whole-fixture steps. Allow a
    // two-fixture sampling margin while keeping the shared model bands intact.
    const rateTolerance = 2 / 380;
    for (const model of [result.detailed, result.background]) {
      assert.ok(model.goals >= bands.goalsPerMatch[0] && model.goals <= bands.goalsPerMatch[1], JSON.stringify(result));
      assert.ok(model.draws >= bands.drawRate[0] - rateTolerance && model.draws <= bands.drawRate[1] + rateTolerance, JSON.stringify(result));
      assert.ok(model.zeros >= bands.goallessRate[0] - rateTolerance && model.zeros <= bands.goallessRate[1] + rateTolerance, JSON.stringify(result));
    }
    assert.ok(Math.abs(result.detailed.goals - result.background.goals) <= bands.modelGap, JSON.stringify(result));
  } finally {
    game.close();
  }
});
