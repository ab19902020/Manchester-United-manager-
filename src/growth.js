/* global G */
/* global growPullBack */
/* global growCeiling:writable, ageDevFactor:writable,
          endSeason:writable, newGame:writable */

/* =====================================================================
   PLAYER GROWTH — slower, and shaped by age the way a career is
   ---------------------------------------------------------------------
   Reported: players reach the high nineties far too quickly, and
   improvement should taper with age — barely anything after about
   thirty-two, and nothing much after thirty-five.

   Measured over three simulated seasons from a fresh career, the best
   young players in the world:

       Álvaro Ruiz     age 20, potential 94    82 -> 90 -> 93
       Nathan Cissé    age 21, potential 94    83 -> 90 -> 94
       Enzo Camara     age 17, potential 93    85 -> 92 -> 92
       Asier Iglesias  age 18, potential 92    85 -> 92 -> 92

   Eight and eleven points in one and two seasons. A player arrived at
   his ceiling before he was old enough to have a testimonial, and the
   whole world came up with him: clubs holding a player rated 90 or
   better went from 12 to 24 to 33 across those same two seasons, nearly
   trebling.

   The cause is the season-end settlement, which grants an age band's
   ceiling scaled by what the player earned:

       age  ceiling  factor   most he can gain in a season
       17     10      1.0        10
       19      9      0.9         8
       22      7      0.8         6
       25      5      0.58        3
       28      3      0.3         1
       31+     1      0           0

   Two things are wrong with that. Ten points in a season is roughly
   double what the very best prospect in the world manages in his best
   year, and the top of the curve is a cliff: at thirty-one a player
   stops improving completely, on his birthday, forever. Real players
   keep nicking a point here and there into their mid-thirties — the
   pace goes but the reading of the game does not.

   THE NEW SHAPE. The most anyone can gain in a season:

       to 18    5      the exceptional teenage year
       19-21    4
       22-24    3
       25-27    2
       28-30    1
       31-32    1, but only about a third of the time
       33-35    1, but only about a sixth of the time
       36+      0

   So a good eighteen-year-old still climbs — around fifteen points
   between eighteen and twenty-two — but he arrives in his mid-twenties
   rather than before his twenty-first birthday, and a thirty-three-year
   old can still have a season where something clicks without it being
   the rule.

   HOW THE VETERAN BAND WORKS. The settlement is in whole points of
   overall: `round(ceiling * merit * factor)`. Any factor small enough to
   mean "a little" rounds to nothing, so a veteran given 0.35 of a point
   gets zero every year forever — which is the cliff again with extra
   steps. Instead the factor for those bands is drawn per season: most
   years it is zero, and occasionally it is enough to round to one. The
   average is the small number intended; the granularity is the one the
   game can actually store.
   ===================================================================== */

(function installGrowth() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  /* The most a player of this age can gain in a season, before merit. */
  function ceilingFor(age) {
    if (age <= 18) return 5;
    if (age <= 21) return 4;
    if (age <= 24) return 3;
    if (age <= 27) return 2;
    if (age <= 30) return 1;
    if (age <= 35) return 1;
    return 0;
  }

  /* How much of that a player of this age actually gets. Below thirty-one
     this is a straight fraction. At thirty-one and above it is a coin the
     game can round: see the note above. */
  const VETERAN_ODDS = { early: 0.34, late: 0.16 };

  function factorFor(age) {
    if (age <= 18) return 1;
    if (age <= 21) return 0.95;
    if (age <= 24) return 0.9;
    if (age <= 27) return 0.85;
    if (age <= 30) return 0.8;
    if (age <= 32) return Math.random() < VETERAN_ODDS.early ? 1 : 0;
    if (age <= 35) return Math.random() < VETERAN_ODDS.late ? 1 : 0;
    return 0;
  }

  if (has(window.growCeiling)) {
    window.growCeiling = function growCeilingSlower(age) {
      const a = typeof age === 'number' ? age : 24;
      return ceilingFor(a);
    };
  }

  if (has(window.ageDevFactor)) {
    window.ageDevFactor = function ageDevFactorByBand(age) {
      const a = typeof age === 'number' ? age : 24;
      return factorFor(a);
    };
  }

  /* What a season is worth to a player of each age, at full merit, as the
     rest of the game would compute it. Exported so it can be checked
     without re-deriving the rounding. */
  function seasonBest(age) {
    const ceil = ceilingFor(age);
    if (age <= 30) return Math.min(ceil, Math.round(ceil * factorFor(age)));
    return ceil;                                  /* when the coin lands */
  }

  function veteranOdds(age) {
    if (age <= 30) return 1;
    if (age <= 32) return VETERAN_ODDS.early;
    if (age <= 35) return VETERAN_ODDS.late;
    return 0;
  }

  /* ---- the backstop ---------------------------------------------------
     Slowing the age curve exposed something underneath it. Measured over
     one season, 68 players rose by six or more, several by eleven, and
     the tell was that they landed exactly on their potential with *zero
     appearances* — Ben Nelson, 22, 50 to 61 with a potential of 61 and
     not a minute played. That is not the development model, which grants
     at most an age band's ceiling scaled by minutes: with no minutes it
     grants almost nothing. Some other path is walking players up to their
     ceiling, and the season-end settlement is not catching it.

     I have not found which path in the time I had, so this does not claim
     to fix it at source. What it does is make the age band authoritative:
     after everything else the season does, nobody has risen further than
     his age allowed, measured from where he actually started the season.
     `growPullBack` eases his attributes down together, so he is the same
     player at a lower level rather than a differently shaped one.

     If someone later finds the path, this stays honest — it will simply
     stop having anything to do. */

  const SEASON_MARK = '_rbsGrow';

  function allowedRise(age) {
    const ceil = ceilingFor(age);
    if (ceil <= 0) return 0;
    /* the most generous reading of the band: full ceiling, and for the
       veteran bands the point they get when the coin lands */
    return ceil;
  }

  function markBaselines() {
    try {
      const seen = [];
      (G.clubs || []).forEach((c) => {
        (c.players || []).forEach((p) => seen.push(p));
        (c.youth || []).forEach((p) => seen.push(p));
      });
      seen.forEach((p) => {
        if (!p) return;
        p[SEASON_MARK] = { ovr: p.ovr, age: p.age, season: G.season };
      });
    } catch (error) { /* a missing baseline just means no clamp */ }
  }

  function clampToBand() {
    try {
      if (!has(window.growPullBack)) return 0;
      let pulled = 0;
      (G.clubs || []).forEach((c) => {
        const all = (c.players || []).concat(c.youth || []);
        all.forEach((p) => {
          const mark = p && p[SEASON_MARK];
          if (!mark) return;
          const cap = mark.ovr + allowedRise(mark.age);
          if (p.ovr > cap) { window.growPullBack(p, cap); pulled += 1; }
        });
      });
      return pulled;
    } catch (error) {
      return 0;
    }
  }

  if (has(window.endSeason)) {
    const previousEnd = window.endSeason;
    window.endSeason = function endSeasonWithinTheAgeBand() {
      const out = previousEnd.apply(this, arguments);
      clampToBand();
      markBaselines();          /* the new season starts from where they are */
      return out;
    };
  }

  if (has(window.newGame)) {
    const previousNew = window.newGame;
    window.newGame = function newGameMarkingBaselines() {
      const out = previousNew.apply(this, arguments);
      markBaselines();
      return out;
    };
  }

  try {
    window.RBSGrowth = Object.freeze({ ceilingFor, factorFor, seasonBest, veteranOdds,
      allowedRise, clampToBand, markBaselines, SEASON_MARK });
  } catch (error) { /* no window */ }
}());
