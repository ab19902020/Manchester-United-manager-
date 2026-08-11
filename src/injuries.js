/* global G, clamp */
/* global injRisk:writable, applyInjury:writable */

/* =====================================================================
   INJURIES — fewer of them, and not all in the same fortnight
   ---------------------------------------------------------------------
   Reported: "too many injuries, I had four games and five injuries
   straight at the start". Reproduced exactly on the first try — a fresh
   Manchester United career, four matches in:

       match injuries     2
       training injuries  3
       total              5

   Played out to the end of the season, the same career had 19 injuries
   across a 26-man squad over 38 league matches, or 0.50 a match.

   THE SEASON TOTAL WAS NOT THE PROBLEM. Nineteen a season is close to
   what a real Premier League squad gets. What is wrong is the shape:
   five of them landed in the first four matches — a quarter of the
   season's injuries in a tenth of its football — because nothing in the
   model knows or cares that the treatment room is already full.

   There is a cooldown, but it is small and it only covers training:
   `c._injCd = G.day + 3..6`, and match injuries ignore it entirely. So a
   club can lose a player on Saturday, another in Tuesday's session, and
   a third on the Wednesday night, and the model treats each as the first
   thing that has gone wrong all year.

   TWO CHANGES.

   The rate comes down by a third, because the user asked for it and this
   is a game you are supposed to be able to win. The season total was
   defensible and I have said so rather than pretending it was broken.

   And a club that has just lost somebody is safer for a fortnight after
   — in both training and matches, which is the half the existing
   cooldown missed. That is the part that stops five arriving at once
   without making a whole season injury-free.
   ===================================================================== */

(function installInjuries() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  /* How much of the old risk survives. */
  const RATE = 0.66;
  /* And how much of that survives in the fortnight after one has landed. */
  const AFTERMATH = 0.5;
  const AFTERMATH_DAYS = 14;

  function recentlyHit(c) {
    if (!c) return 0;
    const last = c._rbsInjDay;
    if (last == null) return 0;
    const gap = (G.day || 0) - last;
    if (gap < 0 || gap >= AFTERMATH_DAYS) return 0;
    /* full protection the day it happens, tailing off over the fortnight */
    return 1 - gap / AFTERMATH_DAYS;
  }

  if (has(window.injRisk)) {
    const previousRisk = window.injRisk;
    window.injRisk = function injRiskCalmer(p, c) {
      let r = previousRisk.apply(this, arguments);
      if (typeof r !== 'number' || !(r > 0)) return r;
      try {
        r *= RATE;
        const cover = recentlyHit(c);
        if (cover > 0) r *= 1 - (1 - AFTERMATH) * cover;
      } catch (error) { /* the original number is still fine */ }
      return r;
    };
  }

  /* Anything that puts a player on the treatment table starts the clock,
     whether it happened on a Tuesday morning or a Saturday afternoon. */
  if (has(window.applyInjury)) {
    const previousApply = window.applyInjury;
    window.applyInjury = function applyInjuryRemembering(p, c) {
      const days = previousApply.apply(this, arguments);
      try {
        if (days && c) c._rbsInjDay = G.day || 0;
      } catch (error) { /* nothing worth breaking a match over */ }
      return days;
    };
  }

  try {
    window.RBSInjuries = Object.freeze({ RATE, AFTERMATH, AFTERMATH_DAYS, recentlyHit });
  } catch (error) { /* no window */ }
}());
