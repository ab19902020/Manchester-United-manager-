/* global G, CUP_DEFS, PYRAMIDS, LEAGUES, DIV_NAMES, esc, fmtM, fmtDate, ordinal,
          tableRows, makeTie */
/* global mail:writable, checkSeasonEnd:writable, WORLD_PR:writable */

/* =====================================================================
   THE PLAY-OFFS — the four matches that decide most promotions, and
   which this game did not have
   ---------------------------------------------------------------------
   `endSeason` promoted whoever was in the top N of the table and that
   was the whole mechanism. The counts were already right —
   `PYRAMIDS.ENG` moves three, three, four and two — but three of those
   three, and the last of those four, are decided at Wembley in the real
   world and were being handed out on goal difference here.

       Championship   2 automatic + play-off between 3rd and 6th
       League One     2 automatic + play-off between 3rd and 6th
       League Two     3 automatic + play-off between 4th and 7th
       National League 1 automatic + play-off between 2nd and 5th

   Nothing about the number going up changes. What changes is who.

   THEY ARE PLAYED, NOT SIMULATED. The game already has everything
   needed: a cup engine with two-legged ties and neutral finals, a day
   loop that stops on `userMatchOn()` and opens the match screen for any
   tie in any competition, a Cups screen that renders whatever is in
   `G.cups`, and a `checkSeasonEnd` that already knows how to hold a
   season open while a final is outstanding. So a play-off is built as a
   competition rather than as a special case, and every one of those
   things works on it without being told about it — including your own
   semi-final second leg, which you play.

   WHERE IT HOOKS. Two wrappers.

   `checkSeasonEnd` builds the competitions the moment the last league
   fixture has been played and before anything is allowed to close the
   season. The existing cup-hold wrapper then does the rest: a
   competition with ties and no winner keeps the season open, so the days
   keep advancing and the ties arrive.

   `WORLD_PR` hands `endSeason` its promotion function. Rather than
   reimplement any of what that function does — reputation, budget, wage
   ceiling, the movement mail, the honour, the board's patience — it is
   handed a sealed table with the play-off winner moved into the last
   promotion place, and handed the real one back immediately afterwards.
   The final table the player sees is untouched.

   ENGLAND ONLY, deliberately. The English pyramid is the one this game
   models club by club; the rest of the world moves on the table because
   the rest of the world is not played out. If the leagues being rebuilt
   elsewhere add a modelled second tier abroad, this reads `PYRAMIDS` and
   will want its country adding to the list.

   The National League really runs a six-club play-off with byes for
   second and third. This runs four, like the three divisions above it.
   Logged rather than pretended about.
   ===================================================================== */

(function installPlayOffs() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  function guard(label, fn, fallback) {
    try {
      return fn();
    } catch (error) {
      try { console.warn('[playoffs] ' + label, error); } catch (e) { /* no console */ }
      return fallback;
    }
  }

  const KEY = (div) => 'PO' + div;
  const FIRST_LEG = 4;                  /* days after the league finishes */
  const SECOND_LEG = 8;
  const FINAL = 15;

  /* ---- who plays whom ---------------------------------------------- */

  /* Every rung of the English ladder that sends more than one club up.
     The last of those places is the one the play-offs decide. */
  function ladders() {
    return guard('ladders', () => {
      const P = (typeof PYRAMIDS !== 'undefined') && PYRAMIDS.ENG;
      if (!P || !P.length) return [];
      return P.filter((row) => row && row[2] >= 2 && LEAGUES[row[0]] && LEAGUES[row[1]])
        .map((row) => ({ hi: row[0], lo: row[1], up: row[2] }));
    }, []);
  }

  /* Places `up` to `up + 3`: the four clubs that missed automatic
     promotion by the least. */
  function contenders(div, up) {
    const rows = (has(tableRows) && tableRows(div)) || [];
    if (rows.length < up + 3) return null;
    const four = rows.slice(up - 1, up + 3).map((r) => r && r.i);
    return four.length === 4 && four.every((i) => i != null && G.clubs[i]) ? four : null;
  }

  /* ---- what it is worth --------------------------------------------
     Scaled off the division's own top merit payment, so a National
     League final is worth a National League afternoon and a
     Championship one is worth a Championship afternoon, and neither
     figure is written down here. */
  function purse(div) {
    return guard('purse', () => {
      const api = window.RBSEconomy;
      const club = (G.clubs || []).find((c) => c && c.league === div);
      if (!api || !has(api.meritFor) || !club) return [0, 0, 0];
      const top = api.meritFor(club, 1) || 0;
      return [Math.round(top * 0.15), 0, Math.round(top * 0.6)];
    }, [0, 0, 0]);
  }

  function define(div, startDay) {
    const start = startDay - (G.seasonStart || 0);
    CUP_DEFS[KEY(div)] = {
      name: (DIV_NAMES[div] || div) + ' play-offs',
      icon: '🎟️',
      venue: 'Wembley Stadium',
      days: [start + FIRST_LEG, start + SECOND_LEG, start + FINAL],
      rn: ['Play-off semi-final', 'Play-off semi-final, second leg', 'Play-off final'],
      prize: purse(div),
      legs: { 0: 2 },
      stages: [0, 2],
      neutralFrom: 2,
      playOff: div,
    };
    return CUP_DEFS[KEY(div)];
  }

  /* ---- building them ----------------------------------------------- */

  function leagueIsOver() {
    const fx = G.fixtures || [];
    return fx.length > 0 && fx.every((f) => f && f.played);
  }

  /* The last league match of the season, which is not `seasonLastDay()`:
     the real Premier League schedule runs ten days past it. Anchoring on
     the fixture list means the play-offs cannot be scheduled into a
     division that is still playing, whatever the calendar says. */
  function lastLeagueDay() {
    let last = G.day || 0;
    (G.fixtures || []).forEach((f) => { if (f && f.day > last) last = f.day; });
    return last;
  }

  function build(rung) {
    const div = rung.lo;
    const four = contenders(div, rung.up);
    if (!four) return false;
    const key = KEY(div);
    const def = define(div, lastLeagueDay());

    G.cupHistory = G.cupHistory || {};
    G.cupHistory[key] = G.cupHistory[key] || [];
    G.cups[key] = { key, round: 0, stage: 0, winner: null, ties: [],
      history: G.cupHistory[key], teams: four.slice() };

    /* first plays fourth and second plays third, and the club that
       finished higher plays the second leg at home — which is what the
       second argument to `makeTie` means. */
    makeTie(key, 0, four[3], four[0]);
    makeTie(key, 0, four[2], four[1]);

    if (four.indexOf(G.my) >= 0) tellTheManager(rung, four, def);
    return true;
  }

  function tellTheManager(rung, four, def) {
    guard('mail', () => {
      const seat = four.indexOf(G.my);
      const oppIx = seat === 0 ? 3 : seat === 3 ? 0 : seat === 1 ? 2 : 1;
      const opp = G.clubs[four[oppIx]];
      const place = (n) => ordinal(rung.up - 1 + n + 1);
      const first = (G.cups[KEY(rung.lo)].ties || [])
        .filter((t) => t.h === G.my || t.a === G.my)
        .sort((a, b) => a.day - b.day)[0];
      const money = def.prize[2];
      mail('board', '🎟️ Into the ' + (DIV_NAMES[rung.lo] || rung.lo) + ' play-offs',
        'You finished <b>' + place(seat) + '</b>. ' +
        '<b>' + (rung.up - 1) + '</b> ' + (rung.up - 1 === 1 ? 'club goes' : 'clubs go') +
        ' up automatically and the last place is decided over the next fortnight, ' +
        'between the four of you.<br><br>' +
        'Semi-final: <b>' + esc(opp.name) + '</b> (' + place(oppIx) + '), over two legs' +
        (first ? ', first leg <b>' + fmtDate(first.day) + '</b>' : '') +
        (seat < oppIx ? '. You play the second leg at home.' : '. They play the second leg at home.') +
        '<br><br>Win it and the final is at <b>' + esc(def.venue) + '</b> — ' +
        (money ? '<b>' + fmtM(money) + '</b> and ' : '') + 'promotion.');
    });
  }

  function ensure() {
    guard('ensure', () => {
      if (!G.cups || G._seasonClosed || G.poSeason === G.season) return;
      if (!leagueIsOver()) return;
      if (!has(makeTie) || !has(tableRows)) return;
      G.poSeason = G.season;                 /* one attempt a season, pass or fail */
      const made = ladders().map(build).filter(Boolean).length;
      if (!made) return;
      if (!ladders().some((r) => (G.cups[KEY(r.lo)] || {}).teams &&
        G.cups[KEY(r.lo)].teams.indexOf(G.my) >= 0)) {
        mail('news', '🎟️ The play-offs', 'The automatic places are settled. ' +
          'Four clubs in each division below the top flight now play for the last one.');
      }
    });
  }

  /* ---- 1. build them before anything can close the season ---------- */
  if (has(window.checkSeasonEnd)) {
    const previousCheck = window.checkSeasonEnd;
    window.checkSeasonEnd = function checkSeasonEndWithPlayOffs() {
      ensure();
      return previousCheck.apply(this, arguments);
    };
  }

  /* ---- 2. and let the winner take the last promotion place --------- */
  function winnerFor(div) {
    const cup = (G.cups || {})[KEY(div)];
    return cup && cup.winner != null ? cup.winner : null;
  }

  if (has(window.WORLD_PR)) {
    const previousWorld = window.WORLD_PR;
    window.WORLD_PR = function worldPRWithPlayOffs(swap, moves) {
      /* The reordering is worked out first and applied around a single
         call to the original. `guard` here would evaluate its fallback
         eagerly and promote everybody twice. */
      const wrapped = function swapWithPlayOffWinner(hi, lo, n) {
        let rows = null;
        try {
          const win = winnerFor(lo);
          const table = G._sealed && G._sealed[lo];
          if (win != null && n >= 2 && table && table.length) {
            const auto = table.slice(0, n - 1);
            const winRow = table.find((r) => r && r.i === win);
            /* the play-off winner going up automatically as well would be
               a contradiction, not a promotion — leave the table alone */
            if (winRow && auto.indexOf(winRow) < 0) {
              const rest = table.filter((r) => r !== winRow && auto.indexOf(r) < 0);
              rows = table;
              G._sealed[lo] = auto.concat([winRow], rest);
            }
          }
        } catch (error) {
          try { console.warn('[playoffs] swap', error); } catch (e) { /* no console */ }
        }
        try {
          return swap(hi, lo, n);
        } finally {
          if (rows) G._sealed[lo] = rows;    /* the real table, immediately */
        }
      };
      return previousWorld.call(this, wrapped, moves);
    };
  }

  /* ---- what the rest of the game can ask -------------------------- */
  function playOffPlaces(div) {
    const rung = ladders().find((r) => r.lo === div);
    if (!rung) return null;
    return { auto: rung.up - 1, from: rung.up, to: rung.up + 3, up: rung.up };
  }

  try {
    window.RBSPlayOffs = Object.freeze({ ladders, playOffPlaces, winnerFor, KEY });
  } catch (error) { /* no window */ }
}());
