/* global G, ACTIONS, mail, dailyTickCore:writable, playerById, leaguePos,
          DIV_NAMES, esc, fmtDate, ordinal, hashStr, mulberry, openModal */

/* =====================================================================
   THE STORY THAT RUNS ALONGSIDE
   ---------------------------------------------------------------------
   "add a bit of a story with the way it runs, but it doesn't affect
    results. It's just a story."

   THE RULE, AND IT IS THE WHOLE DESIGN. This layer reads game state and
   never writes anything the engine reads back. No morale nudge, no
   reputation bump, nothing that shifts a fee, a rating or a scoreline.
   A player who never opens one of these letters plays exactly the same
   game as a player who reads every one.

   That is not a promise, it is a test: `tests/story.test.cjs` snapshots
   every club, player and competition, runs the whole layer hard, and
   asserts that the only thing that changed is `G.story` — the layer's
   own drawer, which nothing else reads.

   The constraint is also what makes it possible. We cannot script a
   story around signings we do not control or results we do not decide.
   What we can do is NOTICE. Everything below is already in the save and
   was never said out loud:

     - the academy boy who made his debut
     - the captain in the last year of his contract at thirty-four
     - the man you sold, scoring against you
     - a hundred appearances, a fiftieth goal
     - the month you took thirteen points and nobody mentioned it

   A journalist says them. He is generated once per career, he has a
   name and a temperament, and his opinion of you follows your results
   rather than leading them — which is the correct direction for a story
   that must not touch the football.
   ===================================================================== */

(function story() {
  const drawer = () => (G.story || (G.story = {
    who: null, lastColumn: 0, seen: {}, gone: {}, months: [],
  }));

  const num = (v) => (v == null ? 0 : +v || 0);
  const my = () => (G.clubs || [])[G.my] || null;

  /* -------------------------------------------------------------------
     THE MAN WHO WRITES IT
     -------------------------------------------------------------------
     One reporter for the career, picked deterministically from the club
     and the manager so he is the same man every time the save is opened.
     He has a temperament, which decides how he says things and never
     what happens.
     ------------------------------------------------------------------- */
  const FIRST = ['Alan', 'Martin', 'Henry', 'Ray', 'Douglas', 'Gerald', 'Vincent',
    'Malcolm', 'Clive', 'Roy', 'Stuart', 'Neville', 'Barry', 'Duncan'];
  const LAST = ['Fairbrother', 'Ellwood', 'Considine', 'Rowntree', 'Hartnell',
    'Meakin', 'Pargeter', 'Threlfall', 'Bidwell', 'Cusack', 'Lomax', 'Ferriday'];
  const TEMPER = [
    ['dry', 'has been doing this a long time and is not easily moved'],
    ['warm', 'wants you to do well and says so'],
    ['sceptical', 'is waiting to be convinced, and says that too'],
    ['romantic', 'still thinks football is the best thing there is'],
  ];

  function reporter() {
    const d = drawer();
    if (d.who) return d.who;
    const club = my();
    const seed = (club ? club.name : 'club') + '|' + ((G.mgr && G.mgr.name) || 'manager');
    const rng = (typeof mulberry === 'function' && typeof hashStr === 'function')
      ? mulberry(hashStr(seed))
      : Math.random;
    const temper = TEMPER[Math.floor(rng() * TEMPER.length) % TEMPER.length];
    d.who = {
      name: FIRST[Math.floor(rng() * FIRST.length) % FIRST.length]
        + ' ' + LAST[Math.floor(rng() * LAST.length) % LAST.length],
      temper: temper[0],
      note: temper[1],
      /* NOT 'the town Evening Post', which is what the first draft
         printed for every real club: `town` is only set on a club you
         built yourself, so the fallback ran for all 484 of them. The
         first word of the club's name is the place often enough —
         Manchester Evening Post — and where it is not, it still reads
         like a local paper rather than like a missing variable. */
      paper: ((club && club.town) || String((club && club.name) || 'City').split(' ')[0])
        + ' Evening Post',
    };
    return d.who;
  }

  /* -------------------------------------------------------------------
     WHAT ACTUALLY HAPPENED — read only, every figure from the save
     ------------------------------------------------------------------- */
  function results(sinceDay) {
    const out = [];
    try {
      (G.fixtures || []).forEach((f) => {
        if (!f.played || (f.h !== G.my && f.a !== G.my)) return;
        if (sinceDay != null && f.day < sinceDay) return;
        const home = f.h === G.my;
        const gf = home ? f.hs : f.as;
        const ga = home ? f.as : f.hs;
        out.push({
          day: f.day,
          gf: num(gf),
          ga: num(ga),
          home,
          opp: (G.clubs || [])[home ? f.a : f.h],
          res: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
        });
      });
    } catch (error) { /* no fixture list */ }
    return out.sort((a, b) => a.day - b.day);
  }

  function form(list) {
    const w = list.filter((r) => r.res === 'W').length;
    const d = list.filter((r) => r.res === 'D').length;
    const l = list.filter((r) => r.res === 'L').length;
    return {
      w, d, l, played: list.length, pts: w * 3 + d,
      gf: list.reduce((s, r) => s + r.gf, 0),
      ga: list.reduce((s, r) => s + r.ga, 0),
    };
  }

  function topScorer() {
    const club = my();
    if (!club) return null;
    const men = (club.players || []).filter((p) => p && num(p.stats && p.stats.goals) > 0);
    men.sort((a, b) => num(b.stats.goals) - num(a.stats.goals));
    return men[0] || null;
  }

  function surname(p) {
    const bits = String((p && p.name) || '').trim().split(/\s+/);
    return bits[bits.length - 1] || 'him';
  }

  /* -------------------------------------------------------------------
     THE MONTHLY COLUMN
     -------------------------------------------------------------------
     Written from the month that just happened. Every number in it is
     read off the save; the only thing invented is the sentence around
     it, and the sentence follows the results rather than setting them.
     ------------------------------------------------------------------- */
  function column() {
    const club = my();
    if (!club) return null;
    const d = drawer();
    const since = d.lastColumn || 0;
    const month = results(since);
    if (month.length < 2) return null;              /* nothing to write about */

    const man = reporter();
    const f = form(month);
    const all = form(results(0));
    let pos = 0;
    try { pos = leaguePos(G.my); } catch (error) { pos = 0; }
    const was = d.months.length ? d.months[d.months.length - 1].pos : pos;
    const div = (DIV_NAMES && DIV_NAMES[club.league]) || 'the league';

    const run = month.map((r) => r.res).join('');
    const scorer = topScorer();

    /* the verdict, which is arithmetic wearing a jacket */
    const perGame = f.played ? f.pts / f.played : 0;
    const verdict = perGame >= 2.2 ? 'excellent'
      : perGame >= 1.6 ? 'good'
        : perGame >= 1.1 ? 'ordinary' : 'poor';

    const OPEN = {
      excellent: {
        dry: 'A good month, and there is no other way of putting it.',
        warm: 'What a month. Whatever is being done out there, keep doing it.',
        sceptical: 'I have been waiting to be convinced. This is closer than anything yet.',
        romantic: 'Some months you remember. This was one of them.',
      },
      good: {
        dry: 'A month that did the job.',
        warm: 'Quietly, that was a good month.',
        sceptical: 'Better. Not yet enough to settle the argument.',
        romantic: 'Not fireworks, but the sort of month that wins you things in April.',
      },
      ordinary: {
        dry: 'A month that came and went.',
        warm: 'A middling month, and there is time to put that right.',
        sceptical: 'Exactly the month I expected, which is not a compliment.',
        romantic: 'A month waiting for something to happen to it.',
      },
      poor: {
        dry: 'A bad month. The table is not lying.',
        warm: 'A hard month, and nobody enjoys writing this one.',
        sceptical: 'This is what I was worried about, and here it is.',
        romantic: 'Football can be cruel and this month it did not bother being subtle.',
      },
    };

    const moved = pos && was && pos !== was
      ? (pos < was
        ? ' Up from ' + ordinal(was) + ' to ' + ordinal(pos) + '.'
        : ' Down from ' + ordinal(was) + ' to ' + ordinal(pos) + '.')
      : (pos ? ' Still ' + ordinal(pos) + '.' : '');

    let body = '<b>' + esc(man.name) + '</b> · <i>' + esc(man.paper) + '</i><br><br>';
    body += esc((OPEN[verdict] || OPEN.ordinary)[man.temper] || OPEN[verdict].dry) + ' ';
    body += '<b>' + f.w + ' won, ' + f.d + ' drawn, ' + f.l + ' lost</b> from '
      + f.played + ', ' + f.gf + ' scored and ' + f.ga + ' conceded.' + esc(moved) + '<br><br>';

    const best = month.slice().sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0];
    const worst = month.slice().sort((a, b) => (a.gf - a.ga) - (b.gf - b.ga))[0];
    if (best && best.gf > best.ga && best.opp) {
      body += 'The high point was <b>' + best.gf + '–' + best.ga + '</b> '
        + (best.home ? 'at home to ' : 'away at ') + esc(best.opp.name) + '. ';
    }
    if (worst && worst.ga > worst.gf && worst.opp && worst !== best) {
      body += 'The low point was <b>' + worst.gf + '–' + worst.ga + '</b> '
        + (worst.home ? 'at home to ' : 'away at ') + esc(worst.opp.name) + '. ';
    }
    body += '<br><br>';

    if (scorer) {
      body += '<b>' + esc(scorer.name) + '</b> has <b>' + num(scorer.stats.goals)
        + '</b> for the season';
      const helper = (my().players || [])
        .filter((p) => p && num(p.stats && p.stats.assists) > 0)
        .sort((a, b) => num(b.stats.assists) - num(a.stats.assists))[0];
      if (helper && helper.id !== scorer.id) {
        body += ', and ' + esc(surname(helper)) + ' has made '
          + num(helper.stats.assists) + ' of them for somebody';
      }
      body += '.<br><br>';
    }

    body += '<span class="xs faint">Season record ' + all.w + '-' + all.d + '-' + all.l
      + ' in ' + esc(div) + ' · form ' + esc(run) + '</span>';

    d.months.push({ day: G.day, pos, pts: f.pts, played: f.played, verdict });
    if (d.months.length > 40) d.months.shift();
    d.lastColumn = G.day;

    return {
      title: man.name + ' on ' + (verdict === 'poor' ? 'a month to forget'
        : verdict === 'excellent' ? 'the best month of the season' : 'the month just gone'),
      body,
    };
  }

  /* -------------------------------------------------------------------
     THE THINGS WORTH NOTICING
     -------------------------------------------------------------------
     Each of these is derived from state that already exists and was
     never said. `seen` stops a beat firing twice; it lives in the
     layer's own drawer.
     ------------------------------------------------------------------- */
  function once(key) {
    const d = drawer();
    if (d.seen[key]) return false;
    d.seen[key] = G.day || 1;
    /* the drawer is not allowed to grow without bound over thirty years */
    const keys = Object.keys(d.seen);
    if (keys.length > 400) delete d.seen[keys[0]];
    return true;
  }

  function beats() {
    const club = my();
    if (!club) return [];
    const out = [];
    const man = reporter();

    (club.players || []).forEach((p) => {
      if (!p || p.youth) return;
      const apps = num(p.stats && p.stats.apps);
      const goals = num(p.stats && p.stats.goals);

      /* the academy boy who played */
      if (p._storyAcademy && apps >= 1 && once('deb' + p.id)) {
        out.push({
          title: esc(p.name) + ' has played for the first team',
          body: '<b>' + esc(man.name) + '</b> writes:<br><br>'
            + 'He came through the academy here, and on ' + esc(fmtDate(G.day))
            + ' he played. ' + esc(surname(p)) + ' is ' + num(p.age)
            + '. There is a long way between a debut and a career, and most of them '
            + 'do not make it, but this club made this one and that is worth a line.',
        });
      }

      /* the veteran running out of road */
      if (num(p.age) >= 34 && num(p.contract) <= 1 && apps >= 5 && once('vet' + p.id + G.season)) {
        out.push({
          title: 'The last year of ' + esc(surname(p)) + '?',
          body: '<b>' + esc(man.name) + '</b> writes:<br><br>'
            + esc(p.name) + ' is ' + num(p.age) + ' and his contract runs out in the summer. '
            + 'He has ' + apps + ' appearances this season'
            + (goals ? ' and ' + goals + ' goals' : '')
            + '. Somebody will have to decide, and it will not be him.',
        });
      }

      /* a round number */
      [50, 100, 200, 300].forEach((mark) => {
        if (apps === mark && once('app' + p.id + mark)) {
          out.push({
            title: esc(surname(p)) + ' reaches ' + mark + ' appearances',
            body: '<b>' + esc(man.name) + '</b> writes:<br><br>'
              + esc(p.name) + ' made his <b>' + mark + 'th</b> appearance this week. '
              + 'Not a headline anywhere else. It is one here.',
          });
        }
      });
      [25, 50, 100].forEach((mark) => {
        if (goals === mark && once('gol' + p.id + mark)) {
          out.push({
            title: esc(surname(p)) + '’s ' + mark + 'th goal',
            body: '<b>' + esc(man.name) + '</b> writes:<br><br>'
              + esc(p.name) + ' has <b>' + mark + '</b> goals for this club now, in '
              + apps + ' appearances.',
          });
        }
      });
    });

    /* the man you let go, scoring */
    const d = drawer();
    Object.keys(d.gone || {}).forEach((id) => {
      const p = playerById(+id);
      const record = d.gone[id];
      if (!p || !record) return;
      const goals = num(p.stats && p.stats.goals);
      if (goals > num(record.goals) + 2 && once('ex' + id + G.season)) {
        const now = (G.clubs || [])[p.club];
        out.push({
          title: esc(surname(p)) + ' is scoring for somebody else',
          body: '<b>' + esc(man.name) + '</b> writes:<br><br>'
            + esc(p.name) + ' left here'
            + (record.season ? ' in ' + (2026 + num(record.season) - 1) : '')
            + '. He has <b>' + goals + '</b> this season for '
            + esc((now && now.name) || 'his new club')
            + '. That is either a good piece of business or a bad one, and the table '
            + 'will say which.',
        });
      }
    });

    return out;
  }

  /* -------------------------------------------------------------------
     THE SEASON, WRITTEN UP
     ------------------------------------------------------------------- */
  function retrospective() {
    const club = my();
    if (!club) return null;
    const man = reporter();
    const all = results(0);
    if (all.length < 10) return null;
    const f = form(all);

    /* the best run of the year, measured rather than remembered */
    let bestRun = { pts: 0, from: 0, to: 0 };
    for (let i = 0; i < all.length; i += 1) {
      let pts = 0;
      for (let j = i; j < Math.min(all.length, i + 6); j += 1) {
        pts += all[j].res === 'W' ? 3 : all[j].res === 'D' ? 1 : 0;
        if (j - i >= 4 && pts > bestRun.pts) bestRun = { pts, from: all[i].day, to: all[j].day };
      }
    }
    const biggest = all.slice().sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0];
    const scorer = topScorer();
    const workhorse = (club.players || [])
      .filter((p) => p && !p.youth)
      .sort((a, b) => num(b.stats && b.stats.apps) - num(a.stats && a.stats.apps))[0];

    let body = '<b>' + esc(man.name) + '</b> · <i>' + esc(man.paper) + '</i><br><br>';
    body += 'Played <b>' + f.played + '</b>, won <b>' + f.w + '</b>, drew <b>' + f.d
      + '</b>, lost <b>' + f.l + '</b>. Scored ' + f.gf + ', conceded ' + f.ga + '.<br><br>';
    if (bestRun.pts) {
      body += 'The season turned between <b>' + esc(fmtDate(bestRun.from)) + '</b> and <b>'
        + esc(fmtDate(bestRun.to)) + '</b>: ' + bestRun.pts + ' points from six.<br><br>';
    }
    if (biggest && biggest.opp && biggest.gf > biggest.ga) {
      body += 'The best afternoon was <b>' + biggest.gf + '–' + biggest.ga + '</b> '
        + (biggest.home ? 'at home to ' : 'away at ') + esc(biggest.opp.name) + '.<br><br>';
    }
    if (scorer) {
      body += '<b>' + esc(scorer.name) + '</b> finished on ' + num(scorer.stats.goals)
        + ' goals. ';
    }
    if (workhorse && num(workhorse.stats && workhorse.stats.apps)) {
      body += '<b>' + esc(workhorse.name) + '</b> played the most football: '
        + num(workhorse.stats.apps) + ' appearances.';
    }
    return { title: 'The season, written up', body };
  }

  /* -------------------------------------------------------------------
     POSTING IT
     -------------------------------------------------------------------
     Through the game's own `mail`, so it lands where every other letter
     lands, sorts with them, and can be starred, binned or muted by the
     mailbox like anything else. Never with actions, so it can never be
     something the season is waiting on.
     ------------------------------------------------------------------- */
  function post(item) {
    if (!item) return;
    try {
      mail('news', item.title, item.body);
      /* MARKED AS THE LAYER'S OWN. `mail` unshifts, so the new letter is
         at the front. The mark is for the layer and for the test that
         asserts a story letter never carries a decision — the game posts
         plenty of its own 'news' with actions on it, and a test that
         counted those was testing somebody else's mail. Nothing in the
         engine reads this field. */
      const letter = (G.inbox || [])[0];
      if (letter && letter.title === item.title) letter.story = true;

      /* AND KEPT, BECAUSE THE INBOX FORGETS. `mail` caps the tray at 90
         and drops the oldest, so in a busy season the columns are pushed
         out by ordinary post — measured across two 300-day careers, one
         still had seven story letters at the end and the other had one.
         A story you cannot go back and read is not much of a story, so
         the layer files its own copies. Twelve of them, a few kilobytes,
         which is nothing against the save budget. */
      const d = drawer();
      if (!Array.isArray(d.filed)) d.filed = [];
      d.filed.unshift({ day: G.day || 0, title: item.title, body: item.body });
      if (d.filed.length > 12) d.filed.length = 12;
    } catch (error) { /* no inbox yet */ }
  }

  const COLUMN_EVERY = 30;

  function tick() {
    const club = my();
    if (!club) return;
    const d = drawer();

    /* remember who has left, so the layer can notice them scoring later.
       This is the layer's own record and the engine never reads it. */
    try {
      const here = {};
      (club.players || []).forEach((p) => { if (p) here[p.id] = 1; });
      if (d.roster) {
        Object.keys(d.roster).forEach((id) => {
          if (here[id]) return;
          const p = playerById(+id);
          if (!p || p.club === G.my) return;
          d.gone[id] = { season: G.season, goals: num(p.stats && p.stats.goals) };
        });
      }
      d.roster = here;
      const keys = Object.keys(d.gone);
      if (keys.length > 60) delete d.gone[keys[0]];
    } catch (error) { /* nothing to compare against */ }

    /* ONE LETTER, NOT THREE. Milestones cluster — three men reached fifty
       appearances in the same week of a real career and the inbox got
       three near-identical letters signed by the same man, which reads
       like a broken mail-merge rather than like a column. More than two
       on a day becomes a single round-up. */
    const today = beats();
    if (today.length > 2) {
      const man = reporter();
      post({
        title: man.name + '’s notebook',
        body: '<b>' + esc(man.name) + '</b> writes:<br><br>'
          + 'A few things worth noting this week.<br><br>'
          + today.map((b) => '• <b>' + b.title + '</b>').join('<br>'),
      });
    } else {
      today.forEach(post);
    }

    if (!d.lastColumn) d.lastColumn = G.day;
    else if ((G.day || 0) - d.lastColumn >= COLUMN_EVERY) post(column());
  }

  if (typeof dailyTickCore === 'function') {
    const previous = dailyTickCore;
    dailyTickCore = function dailyTickStory() {
      const result = previous.apply(this, arguments);
      try { tick(); } catch (error) { /* the story is never load-bearing */ }
      return result;
    };
  }

  /* the academy flag, set where a boy is promoted — the layer's own field */
  try {
    if (typeof ACTIONS === 'object' && ACTIONS && typeof ACTIONS.promoteYouth === 'function') {
      const previous = ACTIONS.promoteYouth;
      ACTIONS.promoteYouth = function promoteYouthStory(el) {
        let id = null;
        try { id = +el.dataset.id; } catch (error) { id = null; }
        const out = previous.apply(this, arguments);
        try {
          const p = playerById(id);
          if (p) p._storyAcademy = true;
        } catch (error) { /* he is still promoted */ }
        return out;
      };
    }
  } catch (error) { /* no actions table */ }

  /* -------------------------------------------------------------------
     WHERE YOU GO BACK AND READ IT
     -------------------------------------------------------------------
     The Media centre already gathers every news letter, so the filed
     columns belong at the top of it rather than behind a new screen —
     and being filed rather than only posted is what makes them still be
     there in March.
     ------------------------------------------------------------------- */
  function panel() {
    const kept = drawer().filed || [];
    if (!kept.length) return '';
    const man = reporter();
    return '<div class="sec"><div class="t">\ud83d\uddde\ufe0f From the local paper</div>'
      + '<div class="ln"></div><div class="sub">' + esc(man.name) + '</div></div>'
      + '<div class="card tight" style="margin-bottom:12px">'
      + kept.map((item, ix) => '<div class="mail" data-action="storyRead" data-v="' + ix + '">'
        + '<div class="ic">\ud83d\udcf0</div>'
        + '<div style="flex:1;min-width:0"><div class="tt">' + esc(item.title) + '</div>'
        + '<div class="bd">' + esc(fmtDate(item.day)) + '</div></div></div>').join('')
      + '<div class="xs faint" style="padding:7px 2px 0;line-height:1.5">'
      + esc(man.name) + ' ' + esc(man.note) + '. He reports what happened; he does not '
      + 'decide it.</div></div>';
  }

  /* BARE `ACTIONS`, NOT `window.ACTIONS`. It is declared `const ACTIONS = {}`,
     and a const at the top level goes into the global lexical environment
     rather than onto the global object — so `window.ACTIONS` is undefined
     and both hooks below installed nothing at all. Measured: the browser
     reported `actionAdded: false` and clicking a filed column did nothing.
     This is the second time in this session the same class of mistake has
     bitten me — `class MatchSim` in the Dugout was the first. If a symbol
     is declared with class, const or let, it is NOT on window. */
  try {
    if (typeof ACTIONS === 'object' && ACTIONS) {
      ACTIONS.storyRead = function storyRead(el) {
        try {
          const item = (drawer().filed || [])[+el.dataset.v];
          if (!item) return;
          openModal('<h3>' + esc(item.title) + '</h3>'
            + '<div class="xs faint" style="margin:2px 0 10px">' + esc(fmtDate(item.day)) + '</div>'
            + '<div class="small" style="line-height:1.65">' + item.body + '</div>');
        } catch (error) { /* nothing to read */ }
      };
    }
  } catch (error) { /* no actions table */ }

  try {
    if (typeof window.vMedia === 'function') {
      const previous = window.vMedia;
      window.vMedia = function vMediaStory() {
        const html = previous.apply(this, arguments);
        try { return panel() + html; } catch (error) { return html; }
      };
    }
  } catch (error) { /* no media screen */ }

  try {
    window.RBSStory = Object.freeze({
      reporter, column, beats, retrospective, tick, results, form, drawer,
      filed: () => (drawer().filed || []),
      panel,
      COLUMN_EVERY,
    });
  } catch (error) { /* no window */ }
}());
