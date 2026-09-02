/* global ROSTER, DB, UI, CC, ACTIONS, paintStart:writable, crest, esc, sfx,
          rosterByKey, RBSLowerLeagueData */

/* =====================================================================
   THE FRONT DOOR — CHOOSING WHO YOU ARE
   ---------------------------------------------------------------------
   The picker was a grid of crests. Twenty of them at a time, no names
   beyond a three-letter short form, and nothing at all about the club
   behind the badge: not the money, not the ground, not how hard the job
   is. You picked blind and found out afterwards.

   The world has 484 clubs across twenty countries and every one of them
   is a job you can take. `ROSTER` already knows all of it — reputation,
   transfer budget, stadium, capacity, a star rating — and none of it was
   on screen.

   So: pick a league, see its clubs, and press one to read the job before
   you take it. Money, ground, standing, the size of the task, and the
   squad where the game has one to show. The two ways in — take a job, or
   build a club from nothing in the National League — sit at the top as
   equals, because they are.

   WHAT THIS DOES NOT DO. It does not invent anything. A club outside the
   Premier League has no squad list until the world is generated, so it
   is not shown one; it gets its standing and its money, which are real
   and already there. Nothing here fabricates a player to fill a panel.
   ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var W = window;
  if (typeof W.paintStart !== 'function') return;

  var STYLE_ID = 'rbs-front-door';

  /* The English pyramid first and in order, then the rest of Europe by
     how many people would recognise it. */
  var ENGLISH = [
    ['PL', 'Premier League'], ['CH', 'Championship'], ['L1', 'League One'],
    ['L2', 'League Two'], ['NL', 'National League'],
  ];

  function style() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.fd{max-width:560px;margin:0 auto;width:100%}',
      '.fd-nav{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none}',
      '.fd-nav::-webkit-scrollbar{display:none}',
      '.fd-nav button{flex:0 0 auto;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);',
      'color:inherit;border-radius:999px;padding:7px 13px;font-size:12px;font-weight:700;letter-spacing:.2px;',
      'white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s}',
      '.fd-nav button.on{background:var(--gold,#c9a227);border-color:var(--gold,#c9a227);color:#101010}',
      '.fd-hero{position:relative;overflow:hidden;border-radius:16px;padding:15px 15px 13px;margin:2px 0 10px;',
      'border:1px solid rgba(255,255,255,.13);background:linear-gradient(135deg,var(--fc1,#333) 0%,rgba(12,12,14,.94) 62%)}',
      '.fd-hero .top{display:flex;gap:12px;align-items:center;min-width:0}',
      '.fd-hero .nm{font-size:19px;font-weight:900;letter-spacing:.2px;line-height:1.15}',
      '.fd-hero .sub{font-size:11.5px;opacity:.78;margin-top:3px;font-weight:600}',
      '.fd-stars{margin-top:2px;font-size:12px;letter-spacing:2px;color:var(--gold,#c9a227)}',
      '.fd-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin:11px 0 3px}',
      '.fd-stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px}',
      '.fd-stat .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;opacity:.62;font-weight:800}',
      '.fd-stat .v{font-size:15px;font-weight:800;margin-top:2px}',
      /* the scale, quiet enough that the number is still the thing you read */
      '.fd-stat .fd-of{font-size:10px;font-weight:700;opacity:.5;letter-spacing:.2px}',
      '.fd-squad{margin-top:10px;border-top:1px solid rgba(255,255,255,.09);padding-top:9px}',
      '.fd-squad .row{display:flex;align-items:center;gap:8px;padding:3px 1px;font-size:12px}',
      '.fd-squad .ps{flex:0 0 34px;font-size:9.5px;font-weight:800;opacity:.66;letter-spacing:.5px}',
      '.fd-squad .pn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}',
      '.fd-squad .po{flex:0 0 30px;text-align:right;font-weight:800;font-variant-numeric:tabular-nums}',
      '.fd-note{font-size:11px;opacity:.62;line-height:1.55;margin-top:8px}',
      '.fd-clubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin-top:4px}',
      '.fd-club{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 5px 8px;border-radius:11px;',
      'border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);cursor:pointer;transition:border-color .14s,background .14s}',
      '.fd-club.on{border-color:var(--gold,#c9a227);background:rgba(201,162,39,.13)}',
      '.fd-club .cn{font-size:10.5px;font-weight:700;text-align:center;line-height:1.25;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '.fd-club .cs{font-size:9px;opacity:.6;font-weight:700}',
      '.fd-count{font-size:10.5px;opacity:.6;font-weight:700;margin:9px 2px 5px;text-transform:uppercase;letter-spacing:.8px}',
    ].join('');
    document.head.appendChild(s);
  }

  /* Budgets are held in millions, and at the bottom of the pyramid they
     are a fraction of one. "£0" reads as a broken field rather than as a
     fact, so a club with nothing to spend is told it has nothing. */
  function money(m) {
    var n = +m || 0;
    if (n >= 1000) return '£' + (n / 1000).toFixed(1) + 'bn';
    if (n >= 1) return '£' + Math.round(n) + 'M';
    if (n * 1000 >= 1) return '£' + Math.round(n * 1000) + 'k';
    return 'None';
  }

  function stars(club) {
    var s = Math.max(1, Math.min(5, Math.round(club.stars || (club.rep || 0) / 2000)));
    return '★★★★★'.slice(0, s) + '☆☆☆☆☆'.slice(0, 5 - s);
  }

  /* How hard the job reads, from the club's own standing. */
  function brief(club) {
    var r = club.rep || 0;
    if (r >= 8800) return 'Everything is expected. Anything less is a crisis.';
    if (r >= 7600) return 'Europe every year, and a trophy before long.';
    if (r >= 6300) return 'A big club that wants to be back among the best.';
    if (r >= 4800) return 'A season of consolidation, then push on.';
    if (r >= 3200) return 'Stay up first. Everything after that is yours.';
    return 'Small money, long odds, and a long way up.';
  }

  function roster() {
    try { return (typeof ROSTER !== 'undefined' && ROSTER) ? ROSTER : []; } catch (e) { return []; }
  }

  /* Squad, only where the game genuinely has one before the world is
     built. The Premier League carries its real squads in DB; nothing
     else does, and nothing is invented to fill the gap. */
  function squadOf(club) {
    try {
      if (typeof DB === 'undefined' || !DB[club.i]) return null;
      var row = DB[club.i];
      if (!row || row[0] !== club.key) return null;
      var men = row[9] || [];
      if (!men.length) return null;
      return men.slice().sort(function (a, b) { return (b[3] || 0) - (a[3] || 0); });
    } catch (e) { return null; }
  }

  function selected(list) {
    var key = null;
    try { key = UI && UI.startKey; } catch (e) { key = null; }
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    try {
      if (UI && UI.startSel != null) {
        for (var j = 0; j < list.length; j++) if (list[j].i === UI.startSel) return list[j];
      }
    } catch (e) { /* nothing chosen yet */ }
    return list[0] || null;
  }

  function leagues(list) {
    var seen = {};
    list.forEach(function (c) { seen[c.league] = (seen[c.league] || 0) + 1; });
    var out = [];
    ENGLISH.forEach(function (pair) {
      if (seen[pair[0]]) { out.push({ k: pair[0], label: pair[1], n: seen[pair[0]] }); delete seen[pair[0]]; }
    });
    Object.keys(seen).sort().forEach(function (k) { out.push({ k: k, label: k, n: seen[k] }); });
    return out;
  }

  function render(host, list) {
    var club = selected(list);
    if (!club) return;
    var div = club.league;
    try { if (UI && UI.pickDiv) div = UI.pickDiv; } catch (e) { /* default to the club's own */ }
    var all = leagues(list);
    if (!all.some(function (l) { return l.k === div; })) div = club.league;

    var here = list.filter(function (c) { return c.league === div; });
    var label = (all.filter(function (l) { return l.k === div; })[0] || {}).label || div;
    var men = squadOf(club);

    var h = '<div class="fd">';

    h += '<div class="fd-nav">' + all.map(function (l) {
      return '<button class="' + (l.k === div ? 'on' : '') + '" data-action="fdLeague" data-v="'
        + esc(l.k) + '">' + esc(l.label) + '</button>';
    }).join('') + '</div>';

    h += '<div class="fd-hero" style="--fc1:' + esc(club.c1 || '#333') + '">'
      + '<div class="top">' + crest(club, 46)
      + '<div style="min-width:0"><div class="nm">' + esc(club.name) + '</div>'
      + '<div class="fd-stars">' + stars(club) + '</div>'
      + '<div class="sub">' + esc(label) + ' · ' + esc(club.stadium || 'their ground') + '</div></div></div>'
      + '<div class="fd-grid">'
      + '<div class="fd-stat"><div class="k">Transfer budget</div><div class="v">' + money(club.budget) + '</div></div>'
      + '<div class="fd-stat"><div class="k">Capacity</div><div class="v">'
      + (club.cap || 0).toLocaleString() + '</div></div>'
      /* WAS "Standing 92", WHICH TOLD YOU NOTHING. A bare number with no
         scale and no unit, sitting next to a budget in pounds and a
         capacity in seats -- the one tile on the card a player could not
         read. The stars above it already say how big the club is, so
         this says how big on a scale you can see the top of. */
      + '<div class="fd-stat"><div class="k">Reputation</div><div class="v">'
      + Math.round((club.rep || 0) / 100) + '<span class="fd-of"> of 100</span></div></div>'
      + '<div class="fd-stat"><div class="k">Country</div><div class="v">' + esc(club.cc || '—') + '</div></div>'
      + '</div>';

    if (men) {
      h += '<div class="fd-squad">' + men.slice(0, 6).map(function (p) {
        return '<div class="row"><span class="ps">' + esc(p[1] || '') + '</span>'
          + '<span class="pn">' + esc(p[0] || '') + '</span>'
          + '<span class="po">' + (p[3] || '') + '</span></div>';
      }).join('')
        + '<div class="fd-note">' + men.length + ' in the squad · '
        + brief(club) + '</div></div>';
    } else {
      h += '<div class="fd-note">' + brief(club)
        + '<br>The squad is drawn when the season starts.</div>';
    }
    h += '</div>';

    h += '<div class="fd-count">' + here.length + ' clubs · ' + esc(label) + '</div>';
    h += '<div class="fd-clubs">' + here.map(function (c) {
      return '<div class="fd-club' + (c.key === club.key ? ' on' : '') + '" data-action="pickClub" '
        + 'data-k="' + esc(c.key) + '" data-v="' + c.i + '">'
        + crest(c, 26) + '<div class="cn">' + esc(c.short || c.name) + '</div>'
        + '<div class="cs">' + money(c.budget) + '</div></div>';
    }).join('') + '</div>';

    h += '</div>';

    /* the button the whole screen exists to reach, kept exactly as the
       game already names it so every other layer still finds it */
    var go = '<button class="btn btn-primary btn-block" style="margin:12px 0 4px;min-height:52px;'
      + 'font-family:var(--disp);letter-spacing:1.4px" data-action="startGame">TAKE THE '
      + esc((club.short || club.name).toUpperCase()) + ' JOB</button>';

    host.innerHTML = h + go;
  }

  var _paintStart = W.paintStart;
  W.paintStart = function frontDoorPaintStart() {
    var r = _paintStart.apply(this, arguments);
    try {
      if (typeof CC !== 'undefined' && CC && CC.on) return r;   // the club builder owns the screen
      var body = document.getElementById('startBody');
      if (!body) return r;
      var list = roster();
      if (!list.length) return r;

      style();
      var bar = body.querySelector('.cc-mode');
      var host = body.querySelector('#fdHost');
      if (!host) {
        body.innerHTML = '';
        if (bar) body.appendChild(bar);
        host = document.createElement('div');
        host.id = 'fdHost';
        body.appendChild(host);
      }
      render(host, list);
    } catch (e) { /* leave the game's own picker standing */ }
    return r;
  };

  try {
    ACTIONS.fdLeague = function (el) {
      try {
        UI.pickDiv = el.dataset.v;
        var list = roster();
        var here = list.filter(function (c) { return c.league === UI.pickDiv; });
        /* moving to a league selects its best-known club, so the panel is
           never describing somewhere you are no longer looking at */
        if (here.length) {
          var best = here.slice().sort(function (a, b) { return (b.rep || 0) - (a.rep || 0); })[0];
          UI.startKey = best.key; UI.startSel = best.i; UI.pickCC = best.cc;
        }
      } catch (e) { /* the repaint below still runs */ }
      try { sfx('nav'); } catch (e) { /* silent is fine */ }
      paintStart();
    };
  } catch (e) { /* no ACTIONS, no navigation */ }

  W.RBSFrontDoor = {
    leagues: function () { return leagues(roster()); },
    squadOf: squadOf,
  };
})();
