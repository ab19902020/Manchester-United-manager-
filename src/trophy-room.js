/* global G, CUP_DEFS, TROPHY_LABEL, trophyBadge, myTrophies, myHonourRows,
          vMgrHonours, vTrophyRoomTab, roomTrophies, tableRows, leaguePos,
          divLabel, seasonLabel, fmtDateShort, esc, trophyArt */

/* =====================================================================
   THE TROPHY ROOM — WHAT YOU ARE PLAYING FOR, NOT ONLY WHAT YOU WON
   ---------------------------------------------------------------------
   Open the Trophies tab in a brand new career and this is what was
   there:

       Your honours
       England · 44 · no silverware yet
       Nothing in here yet. Win something and it appears with the
       badge of the club you were at.
       The hall
       The cabinet — Nothing won yet

   A hundred nodes and two buttons, three of the four lines saying the
   same thing: you have not won anything. It is the only screen in the
   game that is dead on the day you start, and it stays dead for the
   first nine months of your first season, which for most people is the
   only part of the game they ever see.

   The screen was answering the wrong question. "What have you won" has
   no answer in August. "What are you playing for" always has one, and
   in August it is the entire reason you are here: you are in a league,
   you are in two domestic cups, and you may be in Europe. Those are
   real, they are on the calendar, and the game already knows the dates.

   So the tab now opens with the season's campaign — every competition
   the club is actually entered in, live, with where you are in it and
   when the next round is. It fills in as the season goes: still in,
   knocked out at the fifth round, champions. By May it is the story of
   your season, and the cabinet underneath it is the story of your
   career. Neither one is ever blank.

   ---------------------------------------------------------------------
   HOW "STILL IN" IS DECIDED, and why it is decided this way.

   There is no `stillIn` flag on a cup, and adding one to the engine
   would mean touching five places that draw rounds. Everything needed
   is already implied by the ties:

     you have an unplayed tie                   -> in it
     the cup has a winner and it is you         -> won it
     the cup has moved to a round past your
       last one, or has a winner that is not
       you                                      -> out of it
     otherwise (your round is done, the draw
       for the next one has not happened yet)   -> in it, awaiting the draw

   That last case is a real window: `advanceCup` draws the next round
   only once every tie in the current one is played, so between your
   result and the draw you own no unplayed tie and are still very much
   in the competition. Reading it as "out" would tell a manager he had
   been knocked out of a cup he had just won a quarter-final in.

   The rule also handles Europe without knowing anything about Europe.
   The league phase is eight ties with `lg` set and no elimination; when
   it ends the engine sets `cup.round = 8` and draws the play-off for
   the sides that finished in the top twenty-four. If you are in it you
   have an unplayed tie (in). If you are not, the cup's round has moved
   past your last one (out). Nothing here mentions `phase`, `top8` or
   `euroTable`, so none of that can drift out of step with it.

   And the entry lists are read too: a Premier League club is not in the
   FA Cup draw in August, it is in `entryLater` for the third round in
   January. It is in the competition — it says so, with the round it
   comes in at.
   ===================================================================== */

(function trophyRoomSeason() {
  /* the order a season is actually thought about */
  const CUP_ORDER = ['CL', 'EL', 'EC', 'FA', 'LC'];

  const has = (list, ci) => Array.isArray(list) && list.indexOf(ci) >= 0;

  /* which round does the club come in at, if it has not entered yet */
  function entersAt(cup, def) {
    let best = null;
    const scan = (table) => {
      Object.keys(table || {}).forEach((ix) => {
        if (!has(table[ix], G.my)) return;
        const stage = (def.stages || [])[+ix];
        if (stage == null) return;
        if (best == null || stage < best) best = stage;
      });
    };
    scan(cup.entryLater);
    scan(cup.byes);
    return best;
  }

  /* the club's standing in one cup, or null if it was never in it */
  function cupStanding(key) {
    const cup = G.cups && G.cups[key];
    const def = CUP_DEFS && CUP_DEFS[key];
    if (!cup || !def) return null;

    const mine = (cup.ties || []).filter((t) => t.h === G.my || t.a === G.my);
    const joins = entersAt(cup, def);
    if (!mine.length && joins == null) return null;

    const label = def.name;
    const icon = def.icon || '🏆';

    if (cup.winner === G.my) {
      return { key, label, icon, state: 'won', line: 'Champions · ' + seasonLabel(G.season) };
    }

    const next = mine.filter((t) => !t.played).sort((a, b) => a.day - b.day)[0];
    if (next) {
      const other = G.clubs[next.h === G.my ? next.a : next.h];
      const where = next.neutral ? 'at ' + (def.venue || 'a neutral ground')
        : (next.h === G.my ? 'at home' : 'away');
      return {
        key,
        label,
        icon,
        state: 'in',
        round: def.rn[next.r] || '',
        line: (def.rn[next.r] || 'Next round') + ' · ' + (other ? other.short || other.name : 'TBC')
          + ' ' + where + ' · ' + fmtDateShort(next.day),
      };
    }

    /* not entered yet — a Premier League club in August is in the FA Cup,
       it simply does not play in it until January */
    if (!mine.length) {
      return {
        key,
        label,
        icon,
        state: 'in',
        round: def.rn[joins] || '',
        line: 'Enters at the ' + String(def.rn[joins] || 'later round').toLowerCase(),
      };
    }

    const last = mine.slice().sort((a, b) => a.day - b.day || (a.leg || 0) - (b.leg || 0)).pop();
    const reached = def.rn[last.r] || '';
    const movedOn = cup.winner != null || (cup.round != null && cup.round > last.r);
    if (movedOn) {
      return { key, label, icon, state: 'out', round: reached, line: 'Knocked out · ' + reached };
    }
    return { key, label, icon, state: 'in', round: reached, line: reached + ' won · awaiting the draw' };
  }

  /* WHAT THE LEAGUE POSITION MEANS depends entirely on which league it
     is, and the game does not carry a per-division table of what fourth
     place is worth. So this says only what it can defend: where you are,
     out of how many, and how far through. Inventing "Champions League
     places" for League Two would be worse than saying nothing. */
  function leagueStanding() {
    try {
      const me = G.clubs[G.my];
      const div = me.league;
      const rows = tableRows(div) || [];
      const pos = leaguePos(G.my);
      const mine = rows.filter((r) => r.i === G.my)[0];
      const played = mine ? mine.p : 0;
      const games = Math.max(1, (rows.length - 1) * 2);
      const code = TROPHY_LABEL[div] ? div : null;
      const champion = pos === 1 && played >= games;
      return {
        key: code || 'PL',
        code,
        label: divLabel(div),
        icon: '🏆',
        state: champion ? 'won' : 'in',
        line: champion
          ? 'Champions · ' + seasonLabel(G.season)
          : (played
            ? ordinal(pos) + ' of ' + rows.length + ' · ' + (mine ? mine.pts : 0) + ' pts · '
              + played + ' of ' + games + ' played'
            : 'Starts ' + rows.length + '-strong · ' + games + ' games'),
        bar: played / games,
      };
    } catch (error) {
      return null;
    }
  }

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    return n + ['th', 'st', 'nd', 'rd'][(n % 10) < 4 ? (n % 10) : 0];
  }

  /* every competition the club is in this season, league first */
  function campaign() {
    const out = [];
    try {
      const league = leagueStanding();
      if (league) out.push(league);
      CUP_ORDER.forEach((key) => {
        const row = cupStanding(key);
        if (row) out.push(row);
      });
    } catch (error) { /* an empty board still renders */ }
    return out;
  }

  const STATE_WORD = { in: 'Still in', out: 'Out', won: 'Won' };

  /* THE COMPETITION'S OWN GLYPH, not a generic cup. `trophyBadge` falls
     back to 🏆 for everything, so the first render put four identical
     gold cups down the board and the Champions League looked like the
     League Cup. The art, when a PNG exists, still wins — this only
     changes what stands in for it, and `trophyArt` patches the element
     by its data-trophy attribute if the file turns up later. */
  function compBadge(code, icon) {
    const art = (typeof trophyArt === 'function') ? trophyArt(code) : null;
    return '<span class="trophy tr-badge' + (art ? ' has-art' : '') + '"'
      + ' data-trophy="' + esc(code) + '" style="width:34px;height:34px'
      + (art ? ';background-image:url(\'' + art + '\')' : '') + '">'
      + (art ? '' : '<span class="trophy-fb">' + (icon || '🏆') + '</span>') + '</span>';
  }

  function board() {
    const rows = campaign();
    if (!rows.length) return '';
    const live = rows.filter((r) => r.state === 'in').length;
    const won = rows.filter((r) => r.state === 'won').length;
    const head = won
      ? won + (won === 1 ? ' trophy' : ' trophies') + ' won'
      : (live ? live + ' to play for' : 'Nothing left to play for');
    return '<section class="tr-block"><div class="chip-lbl" style="margin-top:0">This season</div>'
      + '<div class="card tight tr-season">'
      + '<div class="tr-season-hd"><span>' + esc(seasonLabel(G.season)) + '</span>'
      + '<span class="tr-season-n">' + esc(head) + '</span></div>'
      + rows.map((r) => '<div class="tr-comp" data-state="' + r.state + '">'
        + compBadge(r.code || r.key, r.icon)
        + '<div class="tr-comp-b"><div class="tr-comp-n">' + esc(r.label) + '</div>'
        + '<div class="tr-comp-s">' + esc(r.line) + '</div>'
        + (r.bar != null ? '<div class="tr-bar"><i style="width:'
          + Math.round(Math.max(0, Math.min(1, r.bar)) * 100) + '%"></i></div>' : '')
        + '</div>'
        + '<span class="tr-state">' + STATE_WORD[r.state] + '</span></div>').join('')
      + '</div></section>';
  }

  /* the door into the 3D room */
  function door() {
    const won = (typeof myTrophies === 'function' ? myTrophies() : []).length;
    return '<section class="tr-block"><div class="troom-door">'
      + '<div class="troom-door-k">The cabinet</div>'
      + '<div class="troom-door-n">' + (won
        ? won + ' troph' + (won === 1 ? 'y' : 'ies') + ' won'
        : 'Nothing won yet') + '</div>'
      + '<div class="troom-door-b">' + (won
        ? 'Every trophy you have lifted stands on its own plinth, at its real size '
          + 'against the others.'
        : 'Walk in anyway. The trophies you are playing for this season are already '
          + 'standing there, waiting to be earned.') + '</div>'
      + '<button class="btn btn-gold btn-block" data-action="trophyRoom">'
      + '🏆 Walk into the trophy room</button></div></section>';
  }

  /* THE TAB, REBUILT. The old one rendered the same list of trophies
     twice — `vMgrHonours` grouped them by club at the top, and the base
     view listed them again flat underneath as "What you have won". */
  if (typeof vTrophyRoomTab === 'function') {
    const previous = vTrophyRoomTab;
    vTrophyRoomTab = function trophyRoomTabSeason() {
      try {
        /* THE SAME SENTENCE, THREE TIMES. A new career used to say "no
           silverware yet", then "Nothing in here yet", then "Nothing won
           yet" — the manager's case, its empty blurb, and the door. The
           door says it once and says what to do about it, so the case
           only appears when there is something in it. */
        const rows = (typeof myHonourRows === 'function') ? myHonourRows() : [];
        const cabinet = (rows.length && typeof vMgrHonours === 'function')
          ? '<section class="tr-block"><div class="chip-lbl" style="margin-top:0">Your honours</div>'
            + vMgrHonours() + '</section>'
          : '';
        return board() + door() + cabinet;
      } catch (error) {
        return previous.apply(this, arguments);
      }
    };
  }

  /* WHAT STANDS IN THE ROOM BEFORE YOU HAVE WON ANYTHING.
     It used to be a curated fifteen — the Ballon d'Or, the World Cup,
     La Liga — which is a catalogue of the game rather than anything to
     do with you. A National League manager was being shown the Champions
     League as his preview. Now the empty room holds exactly the
     competitions you are in this season, so walking in shows you the
     five things you could actually lift, at their real sizes, next to
     each other. If that leaves too few to fill a shelf the old set tops
     it up rather than leaving the cabinet bare. */
  if (typeof roomTrophies === 'function') {
    const previous = roomTrophies;
    roomTrophies = function roomTrophiesSeason() {
      const base = previous.apply(this, arguments) || [];
      try {
        const won = (typeof myTrophies === 'function' ? myTrophies() : []).filter((t) => t.code);
        if (won.length) return base;
        /* REORDER, DO NOT REBUILD. The preview list is the set of
           trophies the room can actually sculpt, and only the room knows
           what that set is — an early cut of this filtered against
           TROPHY_ALL instead and quietly dropped League Two from a
           League Two manager's cabinet, because the two lists are not
           the same list. So the season's competitions are moved to the
           front of whatever the room already offered, and anything it
           cannot build was never in there to move. */
        const wanted = campaign().map((r) => r.code || r.key).filter(Boolean);
        const rank = (row) => {
          const at = wanted.indexOf(row.code);
          return at < 0 ? wanted.length : at;
        };
        return base.slice().sort((a, b) => rank(a) - rank(b));
      } catch (error) {
        return base;
      }
    };
  }

  (function style() {
    try {
      if (document.getElementById('trSeasonCSS')) return;
      const tag = document.createElement('style');
      tag.id = 'trSeasonCSS';
      /* No overflow:hidden on .tr-comp. It is a flex row, and the last
         time a panel in this game was given overflow:hidden to keep a
         bar's corners tidy the row measured 82px inside a 340px panel:
         a scroll container has an automatic minimum size of zero. The
         bar gets its corners from border-radius on the fill instead. */
      /* A HEADING AND ITS CARD ARE ONE THING.
         The landscape shell lays the view's direct children out in two
         columns, so when the label and the card were siblings the label
         took the left cell on its own and the card sat BESIDE its own
         heading in the right one — and because the row then sized itself
         off the 11px label, the next block was placed 44px down and drew
         straight through the card. Measured at 844x390: the card ran
         y=130..378 and the door started at y=188. Each section is one
         grid item now, so it can neither be split nor overlapped. */
      tag.textContent = [
        '.tr-block{display:block;min-width:0}',
        '.tr-block+.tr-block{margin-top:14px}',
        '.tr-season{padding:10px 12px 12px}',
        '.tr-season-hd{display:flex;align-items:baseline;justify-content:space-between;',
        ' gap:10px;margin:0 2px 8px;font:800 10px/1 var(--body);letter-spacing:.14em;',
        ' text-transform:uppercase;color:var(--ink-faint)}',
        '.tr-season-n{color:var(--gold,#e8c46a);letter-spacing:.08em}',
        '.tr-comp{display:flex;align-items:center;gap:10px;padding:8px 4px;',
        ' border-top:1px solid rgba(255,255,255,.07)}',
        '.tr-comp:first-of-type{border-top:0}',
        '.tr-comp-b{flex:1 1 auto;min-width:0}',
        '.tr-comp-n{font:800 13px/1.25 var(--body);color:var(--ink)}',
        /* it wraps rather than truncating: "League phase 1 · Salzburg at
           home · 9 Sept" is the most useful line on the board and at
           390px an ellipsis ate the date, which is the half you plan
           around */
        '.tr-comp-s{font:500 11px/1.4 var(--body);color:var(--ink-faint)}',
        '.tr-bar{margin-top:5px;height:3px;border-radius:3px;background:rgba(255,255,255,.09)}',
        '.tr-bar i{display:block;height:100%;border-radius:3px;background:var(--gold,#e8c46a);',
        ' opacity:.72}',
        '.tr-state{flex:0 0 auto;font:800 9px/1 var(--body);letter-spacing:.12em;',
        ' text-transform:uppercase;padding:5px 8px;border-radius:999px;',
        ' border:1px solid rgba(255,255,255,.14);color:var(--ink-faint)}',
        '.tr-comp[data-state="in"] .tr-state{border-color:rgba(61,220,132,.5);color:#7fe0a6}',
        '.tr-comp[data-state="won"] .tr-state{border-color:rgba(232,196,106,.65);',
        ' color:#f0d493;background:rgba(232,196,106,.10)}',
        '.tr-comp[data-state="out"]{opacity:.55}',
        '@media (max-width:359px){.tr-comp-s{white-space:normal}}',
      ].join('');
      document.head.appendChild(tag);
    } catch (error) { /* unstyled is still readable */ }
  }());

  try {
    window.RBSTrophyRoom = Object.freeze({ campaign, cupStanding, leagueStanding, board, ordinal });
  } catch (error) { /* no window */ }
}());
