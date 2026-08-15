const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * The story that runs alongside.
 *
 * "add a bit of a story with the way it runs, but it doesn't affect
 *  results. It's just a story."
 *
 * The first test is the whole design and the rest are decoration. If the
 * layer can move a single number the engine reads, it is not a story any
 * more — it is a difficulty modifier nobody asked for, hidden inside
 * some prose.
 *
 * The obvious way to test that would be to run the same seeded season
 * twice, with the layer on and off, and compare. That is not available
 * here: world generation is not deterministic — measured, two fresh
 * loads of the same club produce 9,890 and 9,886 players. So the test
 * takes the stronger route instead and diffs the state itself.
 */

test('the story layer writes nothing the game reads back', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Scribe');

    const result = game.eval(`(function () {
      /* a deep snapshot of everything the engine reads, minus the layer's
         own drawer and the inbox it is allowed to post to */
      const snap = () => JSON.stringify({
        clubs: G.clubs.map((c) => ({
          i: c.i, bank: c.bank, rep: c.rep, league: c.league, budget: c.budget,
          wageCap: c.wageCap, patience: c.patience, cap: c.cap, form: c.form,
          players: (c.players || []).map((p) => [p.id, p.ovr, p.pot, p.morale, p.cond,
            p.sharp, p.value, p.wage, p.contract, p.injury, p.susp, p.listed,
            p.stats && p.stats.apps, p.stats && p.stats.goals, p.stats && p.stats.rSum,
            JSON.stringify(p.attrs), JSON.stringify(p.form)]),
          youth: (c.youth || []).map((p) => [p.id, p.ovr, p.pot]),
        })),
        fixtures: (G.fixtures || []).map((f) => [f.h, f.a, f.day, f.played, f.hs, f.as]),
        cups: JSON.stringify(G.cups || {}),
        day: G.day, season: G.season, my: G.my,
        bank: G.bank, budget: G.budget, wageBill: G.wageBill,
        tacs: JSON.stringify(G.tacs || {}),
        freeAgents: (G.freeAgents || []).map((p) => [p.id, p.ovr, p.value]),
      });

      /* run a season so there is something to write about */
      let guard = 0;
      while (guard++ < 260) {
        const um = fixturesOn(G.day).filter((f) => !f.played && (f.h === G.my || f.a === G.my))[0];
        if (um) { quickSim(um); finishDayAfterMatch(); }
        else { simRestOfDay(); dailyTickCore(); G.day++; }
      }

      const before = snap();
      const inboxBefore = G.inbox.length;

      /* now drive the whole layer as hard as it can be driven */
      const api = window.RBSStory;
      const posted = [];
      for (let i = 0; i < 12; i += 1) {
        api.tick();
        const col = api.column();
        if (col) posted.push(col.title);
        api.beats().forEach((b) => posted.push(b.title));
        const back = api.retrospective();
        if (back) posted.push(back.title);
      }

      const after = snap();

      return {
        unchanged: before === after,
        posted: posted.length,
        inboxGrew: G.inbox.length - inboxBefore,
        /* and every letter IT posts is a letter, never a decision.
           Counting every 'news' letter instead was counting the game's
           own, which legitimately carry options, and failed at 2. */
        storyLetters: G.inbox.filter((m) => m.story).length,
        noActions: G.inbox.filter((m) => m.story && m.actions && m.actions.length).length,
        hasDrawer: !!G.story,
      };
    }())`);

    assert.equal(result.unchanged, true,
      'the layer changed something the engine reads — that is not a story, it is a modifier');
    assert.ok(result.posted > 0, 'and it did actually have something to say');
    assert.equal(result.hasDrawer, true, 'it keeps its own state, in its own drawer');
    assert.ok(result.storyLetters > 0, 'it posted letters of its own');
    assert.equal(result.noActions, 0,
      'a story letter must never be something the season is waiting on');
  } finally {
    game.close();
  }
});

test('the reporter is one man for the career, not a new one each time', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Scribe');

    const result = game.eval(`(function () {
      const api = window.RBSStory;
      const a = api.reporter();
      const b = api.reporter();
      /* and he survives a save/load, because he is stored not derived
         on the fly from something that moves */
      const stored = JSON.parse(JSON.stringify(G.story));
      G.story = stored;
      const c = api.reporter();
      return {
        same: a.name === b.name && b.name === c.name,
        name: a.name,
        temper: a.temper,
        tempers: ['dry', 'warm', 'sceptical', 'romantic'].indexOf(a.temper) >= 0,
        paper: a.paper,
        twoWords: a.name.trim().split(/\\s+/).length === 2,
      };
    }())`);

    assert.equal(result.same, true, 'the same man every time he is asked for');
    assert.equal(result.twoWords, true, 'with a real name');
    assert.equal(result.tempers, true, `and one of the four temperaments, got ${result.temper}`);
    assert.match(String(result.paper), /Post$/, 'writing for a local paper');
  } finally {
    game.close();
  }
});

test('the column reports the month that actually happened', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Scribe');

    const result = game.eval(`(function () {
      const api = window.RBSStory;
      let guard = 0;
      while (guard++ < 150) {
        const um = fixturesOn(G.day).filter((f) => !f.played && (f.h === G.my || f.a === G.my))[0];
        if (um) { quickSim(um); finishDayAfterMatch(); }
        else { simRestOfDay(); dailyTickCore(); G.day++; }
      }
      G.story = null;
      api.drawer().lastColumn = 0;

      /* what the engine says happened */
      const truth = api.form(api.results(0));
      const col = api.column();
      if (!col) return { none: true };

      const text = col.body.replace(/<[^>]+>/g, ' ');
      return {
        none: false,
        truth,
        saysWon: text.indexOf(truth.w + ' won') >= 0,
        saysDrawn: text.indexOf(truth.d + ' drawn') >= 0,
        saysLost: text.indexOf(truth.l + ' lost') >= 0,
        saysScored: text.indexOf(truth.gf + ' scored') >= 0,
        title: col.title,
      };
    }())`);

    assert.equal(result.none, false, 'a season of football is worth a column');
    assert.equal(result.saysWon, true,
      `the column must report the real wins (${result.truth.w})`);
    assert.equal(result.saysDrawn, true, 'and the real draws');
    assert.equal(result.saysLost, true, 'and the real defeats');
    assert.equal(result.saysScored, true, 'and the real goals');
  } finally {
    game.close();
  }
});

test('a beat fires once and then stops', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Scribe');

    const result = game.eval(`(function () {
      const api = window.RBSStory;
      const club = G.clubs[G.my];
      /* stage a man who is exactly at a milestone */
      const p = club.players.filter((x) => x && !x.youth)[0];
      p.stats.apps = 50;
      p.stats.goals = 25;
      G.story = null;

      const first = api.beats().map((b) => b.title);
      const second = api.beats().map((b) => b.title);
      const third = api.beats().map((b) => b.title);

      /* and it comes back if he reaches the NEXT milestone */
      p.stats.apps = 100;
      const later = api.beats().map((b) => b.title);

      return {
        first: first.length, second: second.length, third: third.length,
        firstText: first.join(' | '),
        laterHas100: later.filter((t) => /100 appearances/.test(t)).length,
      };
    }())`);

    assert.ok(result.first >= 1, `a fiftieth appearance is worth noticing (${result.firstText})`);
    assert.equal(result.second, 0, 'but only once');
    assert.equal(result.third, 0, 'and it stays quiet');
    assert.equal(result.laterHas100, 1, 'the next milestone is its own moment');
  } finally {
    game.close();
  }
});

test('the drawer cannot grow without bound over a long career', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Scribe');

    const result = game.eval(`(function () {
      const api = window.RBSStory;
      G.story = null;
      const d = api.drawer();
      /* thirty seasons of beats */
      for (let i = 0; i < 3000; i += 1) { d.seen['x' + i] = i; }
      for (let i = 0; i < 300; i += 1) { d.gone['g' + i] = { season: 1, goals: 0 }; }
      for (let i = 0; i < 300; i += 1) { d.months.push({ day: i, pos: 1, pts: 3, played: 1 }); }
      api.tick();
      api.beats();
      /* the caps only apply as things are added, so add through the door */
      for (let i = 0; i < 60; i += 1) { d.seen['y' + i] = i; api.tick(); }
      return {
        seen: Object.keys(d.seen).length,
        gone: Object.keys(d.gone).length,
        months: d.months.length,
        bytes: JSON.stringify(G.story).length,
      };
    }())`);

    /* the point is not an exact number, it is that a thirty-year career
       does not carry a story drawer bigger than the squad it describes */
    assert.ok(result.bytes < 200000,
      `the story drawer should stay small, was ${result.bytes} bytes`);
    assert.ok(result.months <= 300, 'the month log is bounded');
  } finally {
    game.close();
  }
});

test('the columns are kept, because the inbox forgets them', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Scribe');

    const result = game.eval(`(function () {
      const api = window.RBSStory;
      G.story = null;

      /* THE REASON THIS EXISTS. mail() caps the tray at 90 and drops the
         oldest, so ordinary post pushes the columns out: across two
         300-day careers one finished with seven story letters in the
         inbox and the other with one. A story you cannot go back and
         read is not much of a story. */
      for (let i = 0; i < 20; i += 1) {
        api.drawer().lastColumn = 0;
        const col = api.column() || { title: 'Filler ' + i, body: 'Body ' + i };
        mail('news', col.title, col.body);
        const letter = G.inbox[0];
        if (letter) letter.story = true;
        const d = api.drawer();
        if (!Array.isArray(d.filed)) d.filed = [];
        d.filed.unshift({ day: G.day, title: col.title, body: col.body });
        if (d.filed.length > 12) d.filed.length = 12;
      }

      /* now flood the inbox the way a season does */
      for (let i = 0; i < 120; i += 1) mail('news', 'Ordinary post ' + i, 'Body.');

      return {
        filed: api.filed().length,
        stillInInbox: G.inbox.filter((m) => m.story).length,
        inboxCapped: G.inbox.length,
        panelShows: /From the local paper/.test(api.panel()),
        bytes: JSON.stringify(G.story).length,
      };
    }())`);

    assert.equal(result.inboxCapped, 90, 'the inbox is capped, which is the problem');
    assert.equal(result.stillInInbox, 0, 'and it did push every column out');
    assert.equal(result.filed, 12, 'but the layer kept its own copies');
    assert.equal(result.panelShows, true, 'and there is somewhere to read them');
    assert.ok(result.bytes < 40000,
      `keeping them must stay cheap, was ${result.bytes} bytes`);
  } finally {
    game.close();
  }
});
