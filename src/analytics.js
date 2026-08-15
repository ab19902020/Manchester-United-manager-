/* global G, UI, ACTIONS, vStats:writable, openProfile:writable, render, esc, crest,
          playerById, MatchSim, myDiv, DIV_NAMES, fmtM, fmtW, ordinal, posBadge */

/* =====================================================================
   THE STATISTICS CENTRE
   ---------------------------------------------------------------------
   "look at all the squads, all the players, everyone's match ratings,
    everything to be in the game ... absolutely feature rich, full of
    loads of data and analytics you can look at."

   THE DATA WAS ALREADY THERE. Every match, for every player in the
   world, the engine has been banking passes attempted and completed,
   key passes, tackles and tackles won, interceptions, clearances,
   duels, aerials, dribbles, saves, fouls and minutes — see the season
   aggregate block in the match report. Nobody could see any of it.
   The whole statistics screen was three top-ten lists and a history
   table, and the only advanced numbers on show were nine boxes on the
   profile of a player at your own club.

   So this is not new bookkeeping. It is a window onto bookkeeping the
   game has been doing all along, which is why it costs nothing in save
   size — the one thing this release cannot afford.

   FIVE ROOMS:

     Players   every player in a division, sortable on any column, five
               metric groups, filtered by position and by minimum
               appearances. Sort by tackle percentage in League Two if
               you want to.
     Teams     every club in a division: the league table numbers, plus
               what the squad behind them is — age, rating, wage bill,
               value — because a table position without a squad behind
               it tells you nothing.
     Squad     your own players, full stat lines, totals or per 90.
     Matches   the engine's own match reports, kept rather than replaced.
     Records   the leaders, and the career history.

   AND MATCH RATINGS, WHICH IS THE ONE THING THAT WAS MISSING. A season
   average tells you a player is a 7.1; it does not tell you he was a
   6.2 for two months and has been an 8 since Christmas. The engine
   keeps twenty match reports league-wide and then throws them away, so
   nothing remembered a player's own season. Now every man at your club
   carries his last twenty ratings — twenty small numbers each, about
   thirty players, which is nothing against a save measured in
   megabytes — and his profile draws them.
   ===================================================================== */

(function analytics() {
  /* -------------------------------------------------------------------
     THE TABLE STYLE. These tables are wider than a phone by design —
     there is no honest way to show eleven statistics in 390px — so they
     scroll sideways inside their card. What makes that usable rather
     than annoying is pinning the name column, so a reader scrolling out
     to the tackle percentage can still see whose it is.
     ------------------------------------------------------------------- */
  try {
    const css = [
      '.ana-t{font-size:12px}',
      '.ana-t th,.ana-t td{padding:7px 5px;white-space:nowrap}',
      '.ana-t th:first-child,.ana-t td:first-child{position:sticky;left:0;z-index:2;',
      ' background:var(--card,#14161a);box-shadow:1px 0 0 var(--chalk)}',
      '.ana-t tr[style*="rgba(218,41,28"] td:first-child{background:#291416}',
      '.ana-t thead th{position:sticky;top:0;background:var(--card,#14161a)}',
      '.ana-t thead th:first-child{z-index:3}',
      /* the filter rows: four of them stacked ate half the screen */
      '.ana-f{margin-bottom:6px!important}',
      '.ana-f .chip{padding:5px 10px;font-size:11px}',
    ].join('');
    const tag = document.createElement('style');
    tag.id = 'ana-style';
    tag.textContent = css;
    document.head.appendChild(tag);
  } catch (error) { /* styles are a nicety */ }

  const ROOMS = [
    ['players', 'Players'],
    ['teams', 'Teams'],
    ['squad', 'Your squad'],
    ['matches', 'Matches'],
    ['records', 'Records'],
  ];

  /* -------------------------------------------------------------------
     COLUMNS. Each is [key, short heading, how to read it off a player,
     how to print it]. `sum` means the raw total; `rate` means a
     percentage of attempts; `p90` means per ninety minutes played.
     ------------------------------------------------------------------- */
  const num = (v) => (v == null ? 0 : +v || 0);
  const st = (p) => (p && p.stats) || {};
  const mins = (p) => Math.max(0, num(st(p).mins) || num(st(p).apps) * 78);
  const per90 = (v, m) => (m > 0 ? (v / m) * 90 : 0);
  const pctOf = (a, b) => (b > 0 ? (a / b) * 100 : 0);
  const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const two = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const whole = (v) => String(Math.round(v));
  const pctTxt = (v, b) => (b > 0 ? Math.round(v) + '%' : '—');

  const COL = {
    apps: ['Ap', (p) => num(st(p).apps), whole],
    mins: ['Min', (p) => mins(p), whole],
    goals: ['G', (p) => num(st(p).goals), whole],
    assists: ['A', (p) => num(st(p).assists), whole],
    ga: ['G+A', (p) => num(st(p).goals) + num(st(p).assists), whole],
    rating: ['Rat', (p) => (num(st(p).apps) ? num(st(p).rSum) / num(st(p).apps) : 0),
      (v) => (v > 0 ? two(v) : '—')],
    motm: ['MoM', (p) => num(st(p).motm), whole],
    g90: ['G/90', (p) => per90(num(st(p).goals), mins(p)), two],
    a90: ['A/90', (p) => per90(num(st(p).assists), mins(p)), two],
    key: ['KP', (p) => num(st(p).key), whole],
    key90: ['KP/90', (p) => per90(num(st(p).key), mins(p)), two],
    pas: ['Pass', (p) => num(st(p).pas), whole],
    pasPct: ['Pass%', (p) => pctOf(num(st(p).pasC), num(st(p).pas)),
      (v, p) => pctTxt(v, num(st(p).pas))],
    pas90: ['Pass/90', (p) => per90(num(st(p).pas), mins(p)), whole],
    tak: ['Tkl', (p) => num(st(p).tak), whole],
    takPct: ['Tkl%', (p) => pctOf(num(st(p).takW), num(st(p).tak)),
      (v, p) => pctTxt(v, num(st(p).tak))],
    intc: ['Int', (p) => num(st(p).intc), whole],
    clr: ['Clr', (p) => num(st(p).clr), whole],
    aerPct: ['Aer%', (p) => pctOf(num(st(p).aerW), num(st(p).aer)),
      (v, p) => pctTxt(v, num(st(p).aer))],
    duelPct: ['Duel%', (p) => pctOf(num(st(p).duelW), num(st(p).duel)),
      (v, p) => pctTxt(v, num(st(p).duel))],
    drb: ['Drb', (p) => num(st(p).drbW), whole],
    fls: ['Fls', (p) => num(st(p).fls), whole],
    sav: ['Sv', (p) => num(st(p).sav), whole],
    cs: ['CS', (p) => num(st(p).cleanSheets), whole],
    sav90: ['Sv/90', (p) => per90(num(st(p).sav), mins(p)), two],
  };

  /* the five ways of looking at a player, and what each one shows.
     SIX COLUMNS DOES NOT FIT A PHONE. Measured at 390px: with the name
     column and six numbers, the rating — the column the table is sorted
     by — was clipped off the right edge, so the one number the reader
     came for was the one they could not see without scrolling. The
     table still scrolls, and the name column is pinned so scrolling it
     is usable, but the default view has to show the sort column. */
  const GROUPS = [
    ['all', 'Overview', ['apps', 'goals', 'assists', 'motm', 'rating']],
    ['att', 'Attack', ['apps', 'goals', 'assists', 'g90', 'key90', 'rating']],
    ['def', 'Defend', ['apps', 'tak', 'takPct', 'intc', 'aerPct', 'rating']],
    ['pas', 'Passing', ['apps', 'pas', 'pasPct', 'key', 'duelPct', 'rating']],
    ['gk', 'Keepers', ['apps', 'sav', 'sav90', 'cs', 'rating']],
  ];

  const POS_FILTER = [
    ['Any', () => true],
    ['GK', (p) => p.pos === 'GK'],
    ['DEF', (p) => /^(DC|DL|DR|DM|CB|LB|RB|WB)/.test(p.pos || '')],
    ['MID', (p) => /^(MC|ML|MR|AM|DM|CM)/.test(p.pos || '') && p.pos !== 'DM'],
    ['ATT', (p) => /^(ST|FW|AM|LW|RW|CF)/.test(p.pos || '')],
  ];

  function state() {
    if (!UI.ana) {
      UI.ana = {
        room: 'players', group: 'all', sort: 'rating', desc: true,
        div: null, pos: 'Any', minApps: 5, per90: false,
      };
    }
    return UI.ana;
  }

  function divisions() {
    const seen = [];
    try {
      (G.clubs || []).forEach((c) => {
        if (c && c.league && seen.indexOf(c.league) < 0) seen.push(c.league);
      });
    } catch (error) { /* an empty world */ }
    return seen;
  }

  function activeDiv() {
    const s = state();
    const all = divisions();
    if (s.div && all.indexOf(s.div) >= 0) return s.div;
    try { return myDiv(); } catch (error) { return all[0] || null; }
  }

  /* -------------------------------------------------------------------
     THE POOL. Every player in the chosen division, which on the widest
     setting is a couple of thousand men — so it is filtered and cut to
     a page before anything is drawn, not after.
     ------------------------------------------------------------------- */
  function pool(div) {
    const out = [];
    try {
      (G.clubs || []).forEach((c) => {
        if (!c || (div && c.league !== div)) return;
        (c.players || []).forEach((p) => { if (p && !p.youth) out.push(p); });
      });
    } catch (error) { /* nothing to show */ }
    return out;
  }

  function columnsFor(group) {
    const found = GROUPS.filter((g) => g[0] === group)[0] || GROUPS[0];
    return found[2];
  }

  function ranked(list, key, desc) {
    const col = COL[key] || COL.rating;
    const read = col[1];
    const scored = list.map((p) => [p, read(p)]);
    scored.sort((a, b) => (desc ? b[1] - a[1] : a[1] - b[1])
      || num(st(b[0]).apps) - num(st(a[0]).apps));
    return scored;
  }

  function cell(p, key) {
    const col = COL[key];
    if (!col) return '—';
    const v = col[1](p);
    return col[2](v, p);
  }

  /* -------------------------------------------------------------------
     ROOM ONE: EVERY PLAYER
     ------------------------------------------------------------------- */
  function roomPlayers() {
    const s = state();
    const div = activeDiv();
    const filter = (POS_FILTER.filter((f) => f[0] === s.pos)[0] || POS_FILTER[0])[1];
    const minApps = s.group === 'gk' ? Math.min(3, s.minApps) : s.minApps;
    const list = pool(div).filter((p) => filter(p)
      && num(st(p).apps) >= minApps
      && (s.group !== 'gk' ? p.pos !== 'GK' : p.pos === 'GK'));

    const cols = columnsFor(s.group);
    const sortKey = cols.indexOf(s.sort) >= 0 ? s.sort : cols[cols.length - 1];
    const rows = ranked(list, sortKey, s.desc).slice(0, 60);

    let h = '<div class="chips xscroll ana-f" style="margin-bottom:8px">'
      + divisions().map((d) => '<button class="chip' + (d === div ? ' on' : '')
        + '" data-action="anaDiv" data-v="' + d + '">'
        + esc((DIV_NAMES && DIV_NAMES[d]) || d) + '</button>').join('')
      + '</div>';

    h += '<div class="chips xscroll ana-f" style="margin-bottom:8px">'
      + GROUPS.map((g) => '<button class="chip' + (g[0] === s.group ? ' on' : '')
        + '" data-action="anaGroup" data-v="' + g[0] + '">' + g[1] + '</button>').join('')
      + '</div>';

    h += '<div class="chips xscroll ana-f" style="margin-bottom:8px">'
      + POS_FILTER.map((f) => '<button class="chip' + (f[0] === s.pos ? ' on' : '')
        + '" data-action="anaPos" data-v="' + f[0] + '">' + f[0] + '</button>').join('')
      + '<span style="width:8px;flex:0 0 8px"></span>'
      + [0, 3, 5, 10, 20].map((n) => '<button class="chip' + (n === s.minApps ? ' on' : '')
        + '" data-action="anaMin" data-v="' + n + '">'
        + (n === 0 ? 'All' : n + '+ apps') + '</button>').join('')
      + '</div>';

    if (!rows.length) {
      return h + '<div class="card tight"><div class="small muted" style="padding:10px 4px">'
        + 'Nobody in ' + esc((DIV_NAMES && DIV_NAMES[div]) || div || 'this division')
        + ' has played enough yet. Try a lower appearance filter.</div></div>';
    }

    h += '<div class="card tight xscroll" style="overflow-x:auto"><table class="tbl ana-t" style="min-width:max-content">'
      + '<thead><tr><th style="min-width:150px">Player</th>'
      + cols.map((k) => '<th class="c" data-action="anaSort" data-v="' + k + '"'
        + ' style="cursor:pointer;white-space:nowrap' + (k === sortKey ? ';color:var(--gold)' : '') + '">'
        + COL[k][0] + (k === sortKey ? (s.desc ? ' ▾' : ' ▴') : '') + '</th>').join('')
      + '</tr></thead><tbody>';

    rows.forEach(([p], ix) => {
      const c = (G.clubs || [])[p.club] || {};
      const mine = p.club === G.my;
      h += '<tr data-action="profile" data-id="' + p.id + '"'
        + (mine ? ' style="background:rgba(218,41,28,.10)"' : '') + '>'
        + '<td><div class="row" style="gap:6px;align-items:center">'
        + '<span class="xs faint num" style="min-width:16px">' + (ix + 1) + '</span>'
        + (c.i != null ? crest(c, 15) : '')
        + '<span style="font-weight:700;white-space:nowrap">' + esc(p.name) + '</span>'
        + '<span class="xs faint">' + esc(p.pos || '') + '</span></div></td>'
        + cols.map((k) => '<td class="c num"' + (k === sortKey ? ' style="font-weight:800"' : '')
          + '>' + cell(p, k) + '</td>').join('')
        + '</tr>';
    });

    return h + '</tbody></table></div>'
      + '<div class="xs faint" style="padding:8px 2px 0">Showing the top ' + rows.length
      + ' of ' + list.length + '. Tap a column to sort, tap it again to reverse. Tap a player to open him.</div>';
  }

  /* -------------------------------------------------------------------
     ROOM TWO: EVERY CLUB
     -------------------------------------------------------------------
     A league table is a result. This is what is behind the result — the
     size of the wage bill that bought those points, the age of the side
     that scored those goals.
     ------------------------------------------------------------------- */
  function squadShape(c) {
    const men = (c.players || []).filter((p) => p && !p.youth);
    if (!men.length) return { n: 0, age: 0, ovr: 0, wage: 0, value: 0 };
    let age = 0; let ovr = 0; let wage = 0; let value = 0;
    men.forEach((p) => {
      age += num(p.age); ovr += num(p.ovr); wage += num(p.wage); value += num(p.value);
    });
    return {
      n: men.length,
      age: age / men.length,
      ovr: ovr / men.length,
      wage,
      value,
    };
  }

  function roomTeams() {
    const div = activeDiv();
    let table = [];
    try {
      table = (typeof window.tableRows === 'function' ? window.tableRows(div) : []) || [];
    } catch (error) { table = []; }

    let h = '<div class="chips xscroll ana-f" style="margin-bottom:8px">'
      + divisions().map((d) => '<button class="chip' + (d === div ? ' on' : '')
        + '" data-action="anaDiv" data-v="' + d + '">'
        + esc((DIV_NAMES && DIV_NAMES[d]) || d) + '</button>').join('')
      + '</div>';

    if (!table.length) {
      return h + '<div class="card tight"><div class="small muted" style="padding:10px 4px">'
        + 'No table for this division yet.</div></div>';
    }

    h += '<div class="card tight xscroll" style="overflow-x:auto"><table class="tbl ana-t" style="min-width:max-content">'
      + '<thead><tr><th style="min-width:140px">Club</th>'
      + '<th class="c">Pl</th><th class="c">Pts</th><th class="c">GF</th><th class="c">GA</th>'
      + '<th class="c">GD</th><th class="c">G/g</th><th class="c">Sq</th>'
      + '<th class="c">Age</th><th class="c">Ovr</th><th class="c">Wages</th><th class="c">Value</th>'
      + '</tr></thead><tbody>';

    table.forEach((r, ix) => {
      const c = (G.clubs || [])[r.i];
      if (!c) return;
      const shape = squadShape(c);
      const gd = num(r.gd) || (num(r.gf) - num(r.ga));
      h += '<tr data-action="clubView" data-id="' + r.i + '"'
        + (r.i === G.my ? ' style="background:rgba(218,41,28,.10)"' : '') + '>'
        + '<td><div class="row" style="gap:6px;align-items:center">'
        + '<span class="xs faint num" style="min-width:16px">' + (ix + 1) + '</span>'
        + crest(c, 15) + '<span style="font-weight:700;white-space:nowrap">'
        + esc(c.name) + '</span></div></td>'
        + '<td class="c num">' + num(r.p) + '</td>'
        + '<td class="c num" style="font-weight:800">' + num(r.pts) + '</td>'
        + '<td class="c num">' + num(r.gf) + '</td>'
        + '<td class="c num">' + num(r.ga) + '</td>'
        + '<td class="c num">' + (gd > 0 ? '+' : '') + gd + '</td>'
        + '<td class="c num">' + (num(r.p) ? one(num(r.gf) / num(r.p)) : '—') + '</td>'
        + '<td class="c num">' + shape.n + '</td>'
        + '<td class="c num">' + one(shape.age) + '</td>'
        + '<td class="c num">' + whole(shape.ovr) + '</td>'
        + '<td class="c num">' + fmtW(shape.wage) + '</td>'
        + '<td class="c num">' + fmtM(shape.value) + '</td>'
        + '</tr>';
    });

    return h + '</tbody></table></div>'
      + '<div class="xs faint" style="padding:8px 2px 0">Wages are the weekly bill for the'
      + ' senior squad. Ovr is the mean rating of it, which is not the same as the'
      + ' eleven they put out.</div>';
  }

  /* -------------------------------------------------------------------
     ROOM THREE: YOUR OWN SQUAD, in full
     ------------------------------------------------------------------- */
  function roomSquad() {
    const s = state();
    const c = (G.clubs || [])[G.my];
    if (!c) return '<div class="card tight"><div class="small muted">No club.</div></div>';
    const men = (c.players || []).filter((p) => p && !p.youth);
    const showP90 = !!s.per90;

    const cols = ['apps', 'mins', 'goals', 'assists', 'key', 'pasPct', 'tak', 'takPct',
      'intc', 'aerPct', 'rating'];
    const p90cols = ['apps', 'mins', 'g90', 'a90', 'key90', 'pasPct', 'pas90', 'takPct',
      'aerPct', 'rating'];
    const use = showP90 ? p90cols : cols;
    const sortKey = use.indexOf(s.sort) >= 0 ? s.sort : 'rating';
    const rows = ranked(men, sortKey, s.desc);

    let h = '<div class="chips ana-f" style="margin-bottom:8px">'
      + '<button class="chip' + (showP90 ? '' : ' on') + '" data-action="anaP90" data-v="0">Totals</button>'
      + '<button class="chip' + (showP90 ? ' on' : '') + '" data-action="anaP90" data-v="1">Per 90</button>'
      + '</div>';

    h += '<div class="card tight xscroll" style="overflow-x:auto"><table class="tbl ana-t" style="min-width:max-content">'
      + '<thead><tr><th style="min-width:150px">Player</th>'
      + use.map((k) => '<th class="c" data-action="anaSort" data-v="' + k + '"'
        + ' style="cursor:pointer;white-space:nowrap' + (k === sortKey ? ';color:var(--gold)' : '') + '">'
        + COL[k][0] + (k === sortKey ? (s.desc ? ' ▾' : ' ▴') : '') + '</th>').join('')
      + '</tr></thead><tbody>';

    rows.forEach(([p]) => {
      const played = num(st(p).apps) > 0;
      h += '<tr data-action="profile" data-id="' + p.id + '"'
        + (played ? '' : ' style="opacity:.5"') + '>'
        + '<td><div class="row" style="gap:6px;align-items:center">'
        + '<span style="font-weight:700;white-space:nowrap">' + esc(p.name) + '</span>'
        + '<span class="xs faint">' + esc(p.pos || '') + '</span>'
        + (p.injury ? '<span class="xs" title="injured">🩹</span>' : '')
        + '</div></td>'
        + use.map((k) => '<td class="c num"' + (k === sortKey ? ' style="font-weight:800"' : '')
          + '>' + cell(p, k) + '</td>').join('')
        + '</tr>';
    });

    return h + '</tbody></table></div>'
      + '<div class="xs faint" style="padding:8px 2px 0">Greyed rows have not played this season.'
      + ' Per 90 divides by minutes on the pitch, so a substitute is judged by what he did with'
      + ' the time he got.</div>';
  }

  /* -------------------------------------------------------------------
     ROOM FOUR: THE MATCH REPORTS
     -------------------------------------------------------------------
     This list is the game's own and predates this screen — it was the
     top half of the old statistics page, and it opens the full per-
     player analytics for a finished match. It is kept, and given a room
     of its own instead of sitting above three top-ten lists.
     ------------------------------------------------------------------- */
  function roomMatches() {
    const log = G.repLog || [];
    if (!log.length) {
      return '<div class="card tight"><div class="small muted" style="padding:10px 4px">'
        + 'No match reports yet. Play a game.</div></div>';
    }
    let h = '<div class="sec"><div class="t">📊 Match reports</div><div class="ln"></div>'
      + '<div class="sub">last ' + log.length + '</div></div><div class="card tight">';
    log.slice(0, 20).forEach((e, ix) => {
      const home = (G.clubs || [])[e.h] || {};
      const away = (G.clubs || [])[e.a] || {};
      const mine = e.h === G.my;
      const involved = e.h === G.my || e.a === G.my;
      const gf = mine ? e.hs : e.as;
      const ga = mine ? e.as : e.hs;
      const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      h += '<div class="mail" data-action="matchReport" data-v="' + ix + '">'
        + '<div class="ic">' + (involved
          ? '<span class="formpip fp-' + res + '" style="width:20px;height:20px;font-size:10px">'
            + res + '</span>'
          : '<span class="xs faint">·</span>') + '</div>'
        + '<div style="flex:1;min-width:0"><div class="tt">' + esc(home.short || '?') + ' '
        + e.hs + '–' + e.as + ' ' + esc(away.short || '?') + '</div>'
        + '<div class="bd">' + esc(e.comp || '') + ' · tap for full player analytics</div></div></div>';
    });
    return h + '</div>'
      + '<div class="xs faint" style="padding:8px 2px 0">The engine keeps the last twenty'
      + ' reports. Every man in one has his passes, tackles, duels and distance covered.</div>';
  }

  /* -------------------------------------------------------------------
     ROOM FIVE: LEADERS AND HISTORY
     ------------------------------------------------------------------- */
  function leaderCard(title, sub, list, fmt) {
    let h = '<div class="sec"><div class="t">' + title + '</div><div class="ln"></div>'
      + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div class="card tight">';
    if (!list.length) {
      return h + '<div class="small muted" style="padding:6px 2px">Nothing yet this season.</div></div>';
    }
    list.forEach(([p, v], ix) => {
      const c = (G.clubs || [])[p.club] || {};
      h += '<div class="spread" data-action="profile" data-id="' + p.id + '"'
        + ' style="padding:6px 2px;border-bottom:1px solid var(--chalk)'
        + (p.club === G.my ? ';background:rgba(218,41,28,.10);border-radius:6px' : '') + '">'
        + '<div class="row" style="gap:7px"><span class="xs faint num" style="min-width:16px">'
        + (ix + 1) + '</span>' + (c.i != null ? crest(c, 16) : '')
        + '<span class="small" style="font-weight:700">' + esc(p.name) + '</span></div>'
        + '<b class="num small">' + fmt(v) + '</b></div>';
    });
    return h + '</div>';
  }

  function roomRecords() {
    const div = activeDiv();
    const list = pool(div);
    const top = (key, n, guard) => ranked(list.filter((p) => (guard ? guard(p) : true)), key, true)
      .filter(([, v]) => v > 0).slice(0, n || 8);

    let h = '<div class="chips xscroll ana-f" style="margin-bottom:8px">'
      + divisions().map((d) => '<button class="chip' + (d === div ? ' on' : '')
        + '" data-action="anaDiv" data-v="' + d + '">'
        + esc((DIV_NAMES && DIV_NAMES[d]) || d) + '</button>').join('')
      + '</div>';

    h += leaderCard('⚽ Golden Boot', null, top('goals'), whole);
    h += leaderCard('🎯 Assists', null, top('assists'), whole);
    h += leaderCard('⭐ Best average rating', '10+ appearances',
      top('rating', 8, (p) => num(st(p).apps) >= 10), two);
    h += leaderCard('🅰 Chances created', null, top('key'), whole);
    h += leaderCard('🛡 Tackles won', null, top('tak'), whole);
    h += leaderCard('🧤 Clean sheets', null,
      top('cs', 8, (p) => p.pos === 'GK'), whole);

    if (G.history && G.history.length) {
      h += '<div class="sec"><div class="t">📜 Career history</div><div class="ln"></div></div>'
        + '<div class="card tight xscroll" style="overflow-x:auto"><table class="tbl ana-t" style="min-width:max-content">'
        + '<thead><tr><th>S</th><th>Champions</th><th class="c">You</th><th class="c">Pts</th>'
        + '<th>Cups</th></tr></thead><tbody>';
      G.history.slice().reverse().forEach((x) => {
        h += '<tr><td class="num">' + esc(String(x.season)) + '</td>'
          + '<td style="font-weight:700">' + esc(String(x.champ)) + '</td>'
          + '<td class="c num">' + (typeof ordinal === 'function' ? ordinal(x.myPos) : x.myPos) + '</td>'
          + '<td class="c num">' + esc(String(x.pts)) + '</td>'
          + '<td class="xs">' + esc(String(x.cups || '')) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    return h;
  }

  /* -------------------------------------------------------------------
     THE SCREEN
     ------------------------------------------------------------------- */
  vStats = function vStatsAnalytics() {
    const s = state();
    let h = '<div class="subtabs xscroll" style="margin-bottom:8px">'
      + ROOMS.map((r) => '<button class="chip' + (s.room === r[0] ? ' on' : '')
        + '" data-action="anaRoom" data-v="' + r[0] + '">' + r[1] + '</button>').join('')
      + '</div>';
    try {
      if (s.room === 'teams') return h + roomTeams();
      if (s.room === 'squad') return h + roomSquad();
      if (s.room === 'matches') return h + roomMatches();
      if (s.room === 'records') return h + roomRecords();
      return h + roomPlayers();
    } catch (error) {
      return h + '<div class="card tight"><div class="small muted" style="padding:10px 4px">'
        + 'Statistics are not available yet.</div></div>';
    }
  };

  ACTIONS.anaRoom = function anaRoom(el) {
    const s = state();
    s.room = el.dataset.v;
    /* each room has its own natural order rather than inheriting a
       column the new room does not have */
    s.sort = s.room === 'teams' ? 'pts' : 'rating';
    s.desc = true;
    render();
  };
  ACTIONS.anaDiv = function anaDiv(el) { state().div = el.dataset.v; render(); };
  ACTIONS.anaGroup = function anaGroup(el) {
    const s = state();
    s.group = el.dataset.v;
    if (columnsFor(s.group).indexOf(s.sort) < 0) s.sort = 'rating';
    render();
  };
  ACTIONS.anaPos = function anaPos(el) { state().pos = el.dataset.v; render(); };
  ACTIONS.anaMin = function anaMin(el) { state().minApps = +el.dataset.v || 0; render(); };
  ACTIONS.anaP90 = function anaP90(el) { state().per90 = el.dataset.v === '1'; render(); };
  ACTIONS.anaSort = function anaSort(el) {
    const s = state();
    const key = el.dataset.v;
    if (s.sort === key) s.desc = !s.desc; else { s.sort = key; s.desc = true; }
    render();
  };
  /* NO NEW ACTIONS FOR OPENING THINGS. The game already has `profile`
     and `clubView`, they already work from a `data-id`, and every other
     screen uses them — a second pair would be a second thing to keep
     right when the profile sheet changes. */

  /* -------------------------------------------------------------------
     MATCH RATINGS, MATCH BY MATCH
     -------------------------------------------------------------------
     Kept for your own squad only. Twenty numbers a man is free; twenty
     numbers for ten thousand players in the world is a megabyte the
     save cannot spare, and nobody is going to scroll a form graph for a
     reserve left-back in the National League.
     ------------------------------------------------------------------- */
  const FORM_KEEP = 20;

  /* NOT `p.form`. THAT FIELD IS TAKEN, and taking it again would have
     been the expensive kind of mistake. The engine already keeps
     `p.form` as a rolling array of the last five ratings as bare
     numbers, and reads it in at least four places — the squad list's
     form column, and the team-strength calculations that decide who is
     playing well. Pushing objects into it would not have thrown; it
     would have quietly made every form figure in the game NaN. So the
     match log lives in its own field and the engine's array is left
     exactly as it was. */
  function logRating(p, row) {
    if (!p || p.club !== G.my || !row) return;
    if (!Array.isArray(p.mlog)) p.mlog = [];
    const rating = row.r != null ? row.r : row.rating;
    if (!(num(rating) > 0)) return;
    const day = G.day || 0;
    const last = p.mlog[p.mlog.length - 1];
    if (last && last.d === day) return;              /* one entry a day */
    p.mlog.push({
      d: day,
      r: Math.round(num(rating) * 10) / 10,
      g: num(row.g),
      a: num(row.a),
      m: num(row.min),
    });
    if (p.mlog.length > FORM_KEEP) p.mlog.splice(0, p.mlog.length - FORM_KEEP);
  }

  /* WHERE TO HOOK. `MatchSim.prototype.finish` is where the engine
     builds `fix.rep` and folds the per-match numbers into the season
     aggregate, so it is the one place every player who actually
     appeared passes through, for every competition. */
  function harvest(fix) {
    const rep = fix && fix.rep;
    if (!rep) return;
    [].concat(rep.h || [], rep.a || []).forEach((row) => {
      const p = playerById(row.id);
      if (p && p.club === G.my) logRating(p, row);
    });
  }

  /* `MatchSim` IS NOT ON `window`. It is declared `class MatchSim`, and a
     class declaration goes into the global lexical environment rather
     than onto the global object — so `window.MatchSim` is undefined and
     a hook guarded on it silently installs nothing. The first version of
     this did exactly that and logged not a single rating. The bare
     identifier is shared across scripts, which is how the two existing
     layers in the main file reach it, so it is what is used here. */
  try {
    if (typeof MatchSim === 'function' && MatchSim.prototype
      && typeof MatchSim.prototype.finish === 'function') {
      const previous = MatchSim.prototype.finish;
      MatchSim.prototype.finish = function finishLogged() {
        const result = previous.apply(this, arguments);
        try { harvest(this.fix); } catch (error) { /* the report still stands */ }
        return result;
      };
    }
  } catch (error) { /* no match engine here */ }

  /* -------------------------------------------------------------------
     THE FORM GRAPH, on the profile
     -------------------------------------------------------------------
     Drawn as an SVG rather than a row of coloured pips because the
     question it answers is "which way is he going", and a shape answers
     that in a glance where ten numbers do not.
     ------------------------------------------------------------------- */
  function formGraph(p) {
    const runs = (p.mlog || []).slice(-12);
    if (runs.length < 2) return '';
    const W = 300; const H = 62; const PAD = 6;
    const lo = 4; const hi = 10;
    const x = (i) => PAD + (i / (runs.length - 1)) * (W - PAD * 2);
    const y = (v) => H - PAD - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - PAD * 2);
    const line = runs.map((r, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r.r).toFixed(1)).join(' ');
    const area = line + ' L' + x(runs.length - 1).toFixed(1) + ' ' + (H - PAD)
      + ' L' + x(0).toFixed(1) + ' ' + (H - PAD) + ' Z';
    const mean = runs.reduce((sum, r) => sum + r.r, 0) / runs.length;
    const recent = runs.slice(-5);
    const recentMean = recent.reduce((sum, r) => sum + r.r, 0) / recent.length;
    /* not '▬' for steady — it renders as a solid block and reads as a
       colour swatch in a legend rather than as a direction */
    const arrow = recentMean > mean + 0.15 ? '▲ rising'
      : recentMean < mean - 0.15 ? '▼ falling' : '→ steady';
    const colour = recentMean > mean + 0.15 ? '#3ddc84'
      : recentMean < mean - 0.15 ? '#ff6b6b' : 'var(--gold)';

    return '<div class="chip-lbl">Match ratings <span class="faint">last '
      + runs.length + '</span></div>'
      + '<div class="card tight" style="padding:8px 6px 6px;margin-bottom:10px">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:62px;display:block">'
      + '<line x1="' + PAD + '" y1="' + y(6).toFixed(1) + '" x2="' + (W - PAD) + '" y2="' + y(6).toFixed(1)
      + '" stroke="rgba(255,255,255,.10)" stroke-width="1" stroke-dasharray="3 3"/>'
      + '<path d="' + area + '" fill="' + colour + '" opacity=".13"/>'
      + '<path d="' + line + '" fill="none" stroke="' + colour + '" stroke-width="2"'
      + ' stroke-linejoin="round" stroke-linecap="round"/>'
      + runs.map((r, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(r.r).toFixed(1)
        + '" r="' + (r.g ? 3.2 : 2.1) + '" fill="' + (r.g ? '#ffd24a' : colour) + '"/>').join('')
      + '</svg>'
      + '<div class="spread" style="padding:4px 2px 0">'
      + '<span class="xs faint">Average ' + two(mean) + '</span>'
      + '<span class="xs" style="color:' + colour + ';font-weight:800">' + arrow + '</span>'
      + '</div>'
      + '<div class="xs faint" style="padding:3px 2px 0">A gold dot is a match he scored in.'
      + ' The dashed line is 6.0 — a game nobody remembers.</div>'
      + '</div>';
  }

  if (typeof openProfile === 'function') {
    const previous = openProfile;
    openProfile = function openProfileWithForm(pid) {
      previous.apply(this, arguments);
      try {
        const p = playerById(pid);
        if (!p || p.club !== G.my) return;
        const html = formGraph(p);
        if (!html) return;
        const body = document.querySelector('#sheetBody');
        if (!body) return;
        const box = document.createElement('div');
        box.innerHTML = html;
        body.appendChild(box);
      } catch (error) { /* the profile still opened */ }
    };
  }

  try {
    window.RBSAnalytics = Object.freeze({
      COL, GROUPS, ROOMS, FORM_KEEP, state, pool, ranked, squadShape, formGraph, logRating,
    });
  } catch (error) { /* no window */ }
}());
