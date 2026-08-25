/* global G, UI, ACTIONS, LEAGUES, DIV_NAMES, vTable:writable, render, esc, crest,
          fmtDateShort, leaguesOf */

/* =====================================================================
   THE REST OF THE DIVISION PLAYED TODAY TOO
   ---------------------------------------------------------------------
   "every team around you has to perform correctly, obviously, in the
    whole game."

   They do -- ninety-odd clubs play a full season each, and the table
   proves it. What there was no way to do was LOOK at any of it. A
   Saturday's results existed only as the numbers they moved in the
   standings, and the one match you could see was your own.

   The highlights reel has been able to play anybody's match since it was
   built: `playFixture()` takes a fixture, builds both sides from their
   real squads, seats the men who actually scored and plays the goals.
   Brighton 1-3 Villa was watched back that way while it was being
   tested. There was simply nothing anywhere in the game that would hand
   it a fixture that was not yours.

   So this is the screen that does. It is not a new tab -- the league
   table already carries a country rail and a division rail, and the
   results of that division belong behind the same two rails rather than
   behind a third copy of them. A toggle at the top switches the card
   underneath between the table and the round, and the round has arrows.

   WHAT IT IS NOT. It does not simulate, decide or change anything. Every
   fixture it lists was played by the same engine that plays yours, at
   the time the calendar reached it, and this only reads the result out
   of the save. A match with no goals in it has nothing to watch and says
   so rather than offering a button that would open on an empty reel.
   ===================================================================== */

(function resultsRound() {
  'use strict';

  /* -------------------------------------------------------------------
     WHICH ROUND
     -------------------------------------------------------------------
     A league fixture carries `r`, the matchday it belongs to, so a round
     is a filter rather than a date range -- which matters because
     congestion moves fixtures off their Saturday and a date range would
     split a round in half.
     ------------------------------------------------------------------- */
  function fixturesIn(div) {
    try {
      return (G.fixtures || []).filter((f) => f && (f.div || null) === div && !f.comp);
    } catch (error) { return []; }
  }

  function roundsIn(div) {
    const seen = [];
    fixturesIn(div).forEach((f) => {
      const r = f.r == null ? 0 : f.r;
      if (seen.indexOf(r) < 0) seen.push(r);
    });
    return seen.sort((a, b) => a - b);
  }

  /* the latest round that has actually been played, because that is the
     one a manager wants on a Sunday morning; if the season has not
     started, the first one */
  function latestRound(div) {
    const played = fixturesIn(div).filter((f) => f.played);
    if (!played.length) {
      const all = roundsIn(div);
      return all.length ? all[0] : 0;
    }
    return played.reduce((m, f) => Math.max(m, f.r == null ? 0 : f.r), 0);
  }

  /* -------------------------------------------------------------------
     WHETHER THERE IS ANYTHING TO WATCH
     -------------------------------------------------------------------
     The reel is built from the goals the save recorded, so a goalless
     draw has an empty one. Asking the reel itself rather than counting
     `sc` keeps the two from ever disagreeing.
     ------------------------------------------------------------------- */
  function watchable(fix) {
    try {
      const H = window.RBSHighlights;
      if (!H || typeof H.reelFor !== 'function') return false;
      return H.reelFor(fix).length > 0;
    } catch (error) { return false; }
  }

  function scoreLine(fix) {
    return (fix.hs == null ? 0 : fix.hs) + '–' + (fix.as == null ? 0 : fix.as);
  }

  function row(fix, ix) {
    const home = G.clubs[fix.h];
    const away = G.clubs[fix.a];
    if (!home || !away) return '';
    const mine = fix.h === G.my || fix.a === G.my;
    const can = fix.played && watchable(fix);
    return '<div class="rr-row' + (mine ? ' rr-mine' : '') + '">'
      + '<div class="rr-side rr-h" data-action="clubView" data-id="' + fix.h + '">'
        + '<span class="rr-n">' + esc(home.short) + '</span>' + crest(home, 20) + '</div>'
      + '<div class="rr-mid">'
        + (fix.played
          ? '<span class="rr-sc">' + scoreLine(fix) + '</span>'
          : '<span class="rr-when">' + esc(fmtDateShort(fix.day)) + '</span>')
      + '</div>'
      + '<div class="rr-side rr-a" data-action="clubView" data-id="' + fix.a + '">'
        + crest(away, 20) + '<span class="rr-n">' + esc(away.short) + '</span></div>'
      + (can
        ? '<button class="rr-watch" data-action="rrWatch" data-v="' + ix
          + '" title="Watch the goals">🎥</button>'
        : '<span class="rr-watch rr-none"></span>')
      + '</div>';
  }

  function roundHtml(div) {
    const all = roundsIn(div);
    if (!all.length) {
      return '<div class="card tight"><div class="small muted" style="padding:10px;'
        + 'text-align:center">No league fixtures for this division yet.</div></div>';
    }
    if (UI.rrRound == null || all.indexOf(UI.rrRound) < 0) UI.rrRound = latestRound(div);

    const at = all.indexOf(UI.rrRound);
    const games = fixturesIn(div).filter((f) => (f.r == null ? 0 : f.r) === UI.rrRound)
      .slice().sort((a, b) => (a.day - b.day) || (a.h - b.h));
    const done = games.filter((f) => f.played).length;
    const index = new Map();
    (G.fixtures || []).forEach((f, i) => index.set(f, i));

    let h = '<div class="rr-nav">'
      + '<button class="btn-ghost" data-action="rrRound" data-v="' + (at - 1) + '"'
        + (at <= 0 ? ' disabled' : '') + '>‹</button>'
      + '<div class="rr-title"><div class="rr-md">Matchday ' + (UI.rrRound + 1) + '</div>'
        + '<div class="rr-sub">' + (done === games.length
          ? esc(games.length + ' played')
          : esc(done + ' of ' + games.length + ' played')) + '</div></div>'
      + '<button class="btn-ghost" data-action="rrRound" data-v="' + (at + 1) + '"'
        + (at >= all.length - 1 ? ' disabled' : '') + '>›</button>'
      + '</div>';

    h += '<div class="card tight">'
      + games.map((f) => row(f, index.has(f) ? index.get(f) : -1)).join('')
      + '</div>';
    h += '<div class="xs faint" style="padding:6px 4px">'
      + (games.some((f) => f.played && watchable(f))
        ? 'Tap 🎥 to watch the goals from any of them.'
        : 'Nothing to watch from this round yet.')
      + '</div>';
    return h;
  }

  /* -------------------------------------------------------------------
     THE TOGGLE, SPLICED INTO THE TABLE SCREEN
     -------------------------------------------------------------------
     `vTable` builds the country rail, the division rail and then the
     table itself. The two rails are wanted either way, so the wrapper
     keeps everything up to the end of the last chip rail and replaces
     what follows -- which leaves the country and division a player picks
     applying to the results as well, with nothing duplicated.
     ------------------------------------------------------------------- */
  const RAIL_END = '</div>';

  function afterRails(html) {
    /* the rails are the leading run of `<div class="chips"...>` blocks;
       the table card starts at the first `<div class="card` */
    const card = html.indexOf('<div class="card');
    return card < 0 ? -1 : card;
  }

  function install() {
    if (typeof vTable !== 'function') return;
    const pass = vTable;
    vTable = function vTableWithResults() {
      const table = pass.apply(this, arguments);
      try {
        const cut = afterRails(table);
        if (cut < 0) return table;
        const div = (UI.tblDiv && LEAGUES[UI.tblDiv]) ? UI.tblDiv : null;
        if (!div) return table;
        const on = UI.rrView === 'results';
        const toggle = '<div class="subtabs rr-toggle">'
          + '<button class="chip' + (on ? '' : ' on') + '" data-action="rrView" data-v="table">'
            + 'Table</button>'
          + '<button class="chip' + (on ? ' on' : '') + '" data-action="rrView" data-v="results">'
            + 'Results</button></div>';
        return table.slice(0, cut) + toggle
          + (on ? roundHtml(div) : table.slice(cut));
      } catch (error) { return table; }
    };
    /* the global binding and the window property are the same slot for a
       function declaration, so callers using the bare name get this too */
    try { window.vTable = vTable; } catch (error) { /* no window */ }
  }

  try { install(); } catch (error) { /* the table still renders */ }

  /* -------------------------------------------------------------------
     ACTIONS
     ------------------------------------------------------------------- */
  try {
    ACTIONS.rrView = (el) => {
      UI.rrView = (el && el.dataset && el.dataset.v) === 'results' ? 'results' : 'table';
      /* a fresh division means a fresh round, so the arrows never start
         pointing at a matchday this division has not reached */
      if (UI.rrView === 'results' && UI.tblDiv) UI.rrRound = latestRound(UI.tblDiv);
      render();
    };
    ACTIONS.rrRound = (el) => {
      try {
        const div = UI.tblDiv;
        const all = roundsIn(div);
        const at = +((el && el.dataset && el.dataset.v) || 0);
        if (at < 0 || at >= all.length) return;
        UI.rrRound = all[at];
        render();
      } catch (error) { /* the round stays where it was */ }
    };
    ACTIONS.rrWatch = (el) => {
      try {
        const ix = +((el && el.dataset && el.dataset.v) || -1);
        const fix = (G.fixtures || [])[ix];
        if (!fix || !fix.played) return;
        const H = window.RBSHighlights;
        if (H && typeof H.playFixture === 'function') H.playFixture(fix);
      } catch (error) { /* ignore */ }
    };

    /* CHANGING DIVISION HAS TO CHANGE THE ROUND WITH IT, or the
       Championship opens on the Premier League's matchday 27 and shows an
       empty card. The two rails are the game's own actions, so they are
       wrapped rather than reimplemented. */
    ['tblCC', 'tblDiv'].forEach((name) => {
      const pass = ACTIONS[name];
      if (typeof pass !== 'function') return;
      ACTIONS[name] = function railThenRound(el) {
        const out = pass.apply(this, arguments);
        try { UI.rrRound = UI.tblDiv ? latestRound(UI.tblDiv) : null; }
        catch (error) { UI.rrRound = null; }
        return out;
      };
    });
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     STYLE
     -------------------------------------------------------------------
     A results row is a fixed three-column grid with the score in the
     middle, so every score in the card lines up down the page however
     long the club names are -- which is the whole reason a results
     column reads at a glance in a newspaper.
     ------------------------------------------------------------------- */
  const CSS = [
    '.rr-nav{display:flex;align-items:center;gap:8px;margin:2px 0 8px}',
    '.rr-nav .btn-ghost{min-width:44px;min-height:36px;font-size:18px;line-height:1}',
    '.rr-nav .btn-ghost[disabled]{opacity:.3}',
    '.rr-title{flex:1;text-align:center}',
    '.rr-md{font-size:13px;font-weight:800;letter-spacing:.3px}',
    '.rr-sub{font-size:10.5px;color:var(--ink-faint);font-weight:700}',
    '.rr-row{display:grid;grid-template-columns:minmax(0,1fr) 58px minmax(0,1fr) 34px;',
    ' align-items:center;gap:6px;padding:6px 2px}',
    '.rr-row+.rr-row{border-top:1px solid var(--chalk)}',
    '.rr-mine{background:rgba(218,41,28,.13);border-radius:8px}',
    '.rr-side{display:flex;align-items:center;gap:6px;min-width:0}',
    '.rr-h{justify-content:flex-end}',
    '.rr-n{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;',
    ' text-overflow:ellipsis}',
    '.rr-mid{text-align:center}',
    '.rr-sc{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;',
    ' letter-spacing:.5px}',
    '.rr-when{font-size:10.5px;color:var(--ink-faint);font-weight:700}',
    '.rr-watch{width:34px;height:34px;border:0;background:transparent;font-size:15px;',
    ' cursor:pointer;border-radius:50%;padding:0}',
    '.rr-none{visibility:hidden}',
    '.rr-toggle{margin-bottom:10px}',
  ].join('');

  try {
    const st = document.createElement('style');
    st.id = 'results-round';
    st.textContent = CSS;
    document.head.appendChild(st);
  } catch (error) { /* the rows still read without it */ }

  try {
    window.RBSResultsRound = Object.freeze({
      fixturesIn, roundsIn, latestRound, watchable, roundHtml,
    });
  } catch (error) { /* no window */ }
}());
