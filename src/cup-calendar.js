/* global G, makeTie, simRestOfDay, CUP_DEFS */

/* =====================================================================
   A CUP TIE CANNOT BE PLAYED ON A DAY THAT HAS ALREADY GONE
   ---------------------------------------------------------------------
   The trophy room's new season board is the first screen in the game
   that says, out loud, which round of which cup you are in and when it
   is. On 26 May of the first season it said this:

       League Cup — Third Round · Millwall away · 16 Sept    STILL IN

   Which is true, and is the bug. Sixteen League Cup ties were sitting
   unplayed with a September date on them, in May.

   ---------------------------------------------------------------------
   WHAT IS ACTUALLY HAPPENING. Traced with a probe that wrapped
   `cupDraw` and logged every draw against the day it was made:

       DRAW LC r1 on day 49  -> 24 ties dated 56
       DRAW LC r2 on day 85  -> 16 ties dated 78

   The second line is the whole thing. A round is drawn only once every
   tie in the round before it has been played, so the draw happens
   whenever it happens — but the DATE comes from a fixed table:

       out.push({ ..., day:(G.seasonStart||0)+def.days[r], ... })

   `def.days` is a calendar written before the season starts. When a
   round runs late for any reason, the next round is born on a date that
   has already gone past. And the only thing that ever plays a tie is

       function tiesOn(day){ ... filter(t=>t.day===day) ... }

   an exact match on today's date. A tie dated in the past is never
   equal to today again, so those sixteen ties were unreachable for the
   rest of the season. The competition froze at the third round, for
   every club in it, in every save.

   It is not silent, either — it is worse than silent. `checkSeasonEnd`
   has a guard that force-resolves a stalled cup after day 330 so the
   season can close, so the League Cup was being decided in one sweep on
   the last day of the season, with no rounds, no draws, no mails, and no
   chance for the manager to play in it. From the outside it looked like
   the cup simply did not exist.

   ---------------------------------------------------------------------
   THE FIX IS TWO LINES OF ARITHMETIC AND A BROOM.

   1. A tie is never dated before the day it was drawn. Three days'
      notice, so the draw mail arrives before the match rather than after
      it, and a two-legged tie keeps the gap it was given.

   2. Anything already stranded gets swept up. Rule (1) means it cannot
      happen again, but a save made before today already has ties in the
      past, and the same thing could be reached by any future layer that
      dates a tie from a table. So overdue ties are pulled onto the
      calendar rather than left to rot.

      The manager's own tie is moved FORWARD, not resolved. Playing his
      cup match for him to tidy the calendar up would be a worse bug than
      the one being fixed — he gets two days' notice and plays it.

   Neither part changes who plays whom, how a tie is decided, prize
   money, or the draw. It only changes the date written on a fixture,
   and only ever from a date that cannot be played to one that can.
   ===================================================================== */

(function cupCalendar() {
  /* enough that the draw mail lands before the match does */
  const NOTICE = 3;
  /* and a rescued tie is close enough to still feel like this week */
  const RESCUE = 2;

  /* ---------------------------------------------------------------
     1. THE DATE A TIE IS BORN WITH
     --------------------------------------------------------------- */
  if (typeof makeTie === 'function') {
    const previous = makeTie;
    makeTie = function makeTieNeverInThePast() {
      const legs = previous.apply(this, arguments);
      try {
        if (!legs || !legs.length || G.day == null) return legs;
        const first = legs[0];
        const floor = G.day + NOTICE;
        if (!(first.day < floor)) return legs;
        /* shift the whole tie by one amount so a two-legged tie keeps
           the fortnight between its legs */
        const shift = floor - first.day;
        legs.forEach((leg) => {
          leg.late = { from: leg.day, drawn: G.day };
          leg.day += shift;
        });
      } catch (error) { /* the tie keeps the date it had */ }
      return legs;
    };
  }

  /* ---------------------------------------------------------------
     2. THE BROOM
     --------------------------------------------------------------- */
  function overdue() {
    const out = [];
    try {
      if (!G || !G.cups || G.day == null) return out;
      Object.keys(G.cups).forEach((key) => {
        const cup = G.cups[key];
        if (!cup || !cup.ties) return;
        cup.ties.forEach((tie) => {
          if (!tie || tie.played || tie.day == null) return;
          if (tie.day >= G.day) return;
          out.push(tie);
        });
      });
    } catch (error) { /* nothing to sweep */ }
    return out;
  }

  function sweep() {
    const stranded = overdue();
    if (!stranded.length) return 0;
    stranded.forEach((tie) => {
      const leg = tie.leg > 1 ? tie.leg - 1 : 0;
      const mine = tie.h === G.my || tie.a === G.my;
      tie.rescued = { from: tie.day, on: G.day };
      /* his own tie is moved so he can play it; everybody else's is
         pulled onto today and settled by the machinery that was always
         going to settle it */
      tie.day = mine ? G.day + RESCUE + leg * 3 : G.day + leg;
    });
    return stranded.length;
  }

  if (typeof simRestOfDay === 'function') {
    const previous = simRestOfDay;
    simRestOfDay = function simRestOfDayCatchUp() {
      try { sweep(); } catch (error) { /* carry on with the day */ }
      return previous.apply(this, arguments);
    };
  }

  try {
    window.RBSCupCalendar = Object.freeze({ overdue, sweep, NOTICE, RESCUE });
  } catch (error) { /* no window */ }
}());
