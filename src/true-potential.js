/* global playerCeiling */

/* =====================================================================
   WHAT HE MIGHT HAVE BEEN, AND WHAT HE ACTUALLY BECOMES
   ---------------------------------------------------------------------
   The game has a good idea in it: almost nobody reaches their potential,
   so every player is given a hidden REALISED CEILING between 80% and
   100% of it, drawn deterministically from his own id. The gap between
   the two is the interesting part -- the boy everyone said would play
   for England who ends up a solid Championship player.

   It was implemented by writing the ceiling over `p.pot`, which deletes
   the gap it was built to create. Measured on the shipped build: 96 of
   136 under-24s in the Premier League had potential equal to ability.
   Leny Yoro read 83/83 where the data says 83/92, Šeško 87/87 against
   87/93, Carlos Baleba 84/84 against 84/91. So the scout could not tell
   you what a young player might become and the academy list could not
   sort on it -- the number was gone before anybody saw it.

   ---------------------------------------------------------------------
   THE OBVIOUS FIX IS THE WRONG ONE, AND IT WAS MEASURED RATHER THAN
   ARGUED. Keeping `p.pot` true and moving the stop -- a backstop that
   pulls anyone back over their ceiling, hooked where `capGrowth` is
   hooked -- looks equivalent and is not. Growth stops at `p.pot` in
   eight separate places, so with the true potential there the gates let
   a player keep growing inside every session and the pull-back
   afterwards does not undo the attribute churn. Five seasons, same
   seed, Premier League mean ability:

       as shipped     77.68 -> 79.69     +2.01
       with the stop moved  77.68 -> 81.54     +3.86

   Nearly double the drift, which is precisely the inflation the ceiling
   was introduced to stop. So the stop does not move.

   `applyCeilings` keeps writing the ceiling into `p.pot`, development is
   byte-for-byte what it was, and the true potential is kept beside it on
   `p.potMax`. This file is the reader: `potOf(p)` is what a scout, a
   profile or an academy list should print, and it falls back to `p.pot`
   for anyone who has not been through the ceiling pass -- a fresh regen,
   a player from an older save -- so it is always safe to call.
   ===================================================================== */

(function truePotential() {
  'use strict';

  /* WHAT HE MIGHT HAVE BEEN. The stored true potential where there is
     one; otherwise whatever the game has, which is the right answer for
     a player the ceiling pass has not reached. */
  function potOf(p) {
    try {
      if (!p) return 0;
      const max = p.potMax;
      if (max != null && max > 0) return Math.max(max, p.pot || 0, p.ovr || 0);
      return p.pot || p.ovr || 0;
    } catch (error) { return (p && (p.pot || p.ovr)) || 0; }
  }

  /* WHAT HE ACTUALLY BECOMES, for anywhere that wants to say so. This is
     the number development really stops at. */
  function capOf(p) {
    try {
      if (!p) return 0;
      if (p.cap != null) return p.cap;
      if (typeof playerCeiling === 'function') return playerCeiling(p);
      return p.pot || p.ovr || 0;
    } catch (error) { return (p && (p.pot || p.ovr)) || 0; }
  }

  /* how close he came, or is going to come */
  function gapOf(p) {
    try { return Math.max(0, potOf(p) - capOf(p)); } catch (error) { return 0; }
  }

  /* A BARE GLOBAL, because the callers are inline in a 57,000 line file
     and they are reached by editing the expression they already use --
     `starsOf(p.pot)` becomes `starsOf(potOf(p))` -- rather than by
     wrapping fifteen layers of render function. */
  try {
    window.potOf = potOf;
    window.capOf = capOf;
    window.RBSTruePotential = Object.freeze({ potOf, capOf, gapOf });
  } catch (error) { /* no window */ }
}());
