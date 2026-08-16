/* global G, STAD_UP, vStadium:writable, ACTIONS, seatCost */

/* =====================================================================
   WHAT A GROUND COSTS DEPENDS ON WHOSE GROUND IT IS
   ---------------------------------------------------------------------
   "lower league teams shouldn't pay three hundred and eighty five
    million to rebuild their stadium… go for all the upgrade costs for
    each league"

   Every price on the stadium screen was a flat number written for a
   Premier League club and then charged to all 484. Measured on a fresh
   world, smallest ground in each English tier:

     tier  club              ground    bank     a rebuild cost
     NL    AFC Hornchurch     3,500    £376k    £380,000,000
     L2    Salford City       5,108    £1.6m    £380,000,000
     L1    Bromley            5,000    £2.3m    £380,000,000
     CH    Lincoln City      10,669    £6.6m    £380,000,000
     PL    AFC Bournemouth   11,300  £134.6m    £380,000,000

   A thousand times a non-league club's entire bank, for the same
   building. The training centre (£22m), the academy (£18m) and the
   redevelopment (£45m) were flat in exactly the same way.

   ---------------------------------------------------------------------
   HOW THEY SCALE NOW

   By REPUTATION, not by league table position, for two reasons: it
   exists on every club in all twenty countries, so a Danish second-tier
   side is priced sensibly without a lookup table per competition; and it
   does not lurch the day you are promoted.

       multiplier = (rep / 7950) ^ 2.5      clamped to 0.03 … 1.25

   7,950 is the measured median Premier League reputation. The exponent
   was fitted to the five English tiers rather than guessed:

     tier  median rep   multiplier   academy    training   redevelopment
     PL       7,950        1.00       £18.0m     £22.0m       £45.0m
     CH       4,865        0.29        £5.3m      £6.5m       £13.2m
     L1       3,500        0.13        £2.3m      £2.9m        £5.8m
     L2       2,950        0.08        £1.5m      £1.9m        £3.8m
     NL       2,185        0.04        £0.8m      £0.9m        £1.9m

   Set against the measured median bank at each level (£144m, £14.1m,
   £2.95m, £1.20m, £0.41m) every one of those is a real decision — a
   season or two of saving near the bottom, comfortable at the top — and
   none of them is impossible.

   THE REBUILD IS PRICED OFF THE GROUND, NOT THE REPUTATION, because it
   is a building job: four times the next expansion phase, which is
   itself now capacity-scaled. That keeps Old Trafford's rebuild at about
   the £380m it has always been while a non-league ground costs a few
   million — the same formula at both ends.

   Nothing here touches what a club earns, and no AI club reads these
   prices: `stadBuy` is the player's own button and `G.projects` is only
   ever pushed with `club: G.my`.
   ===================================================================== */

(function stadiumCosts() {
  /* the Premier League median reputation, measured, not guessed */
  const PL_REP = 7950;
  const CURVE = 2.5;
  const FLOOR = 0.03;
  const CEILING = 1.25;

  /* what each upgrade costs a club at the very top — the numbers the
     game already shipped, which stay exactly as they were up there */
  const TOP = { tier: 45e6, train: 22e6, youth: 18e6 };

  function multiplier(club) {
    const rep = club && +club.rep;
    if (!Number.isFinite(rep) || rep <= 0) return 1;
    const raw = Math.pow(rep / PL_REP, CURVE);
    return Math.max(FLOOR, Math.min(CEILING, raw));
  }

  /* round to something a board would actually say out loud */
  function tidy(amount) {
    if (amount >= 20e6) return Math.round(amount / 1e6) * 1e6;
    if (amount >= 2e6) return Math.round(amount / 1e5) * 1e5;
    return Math.round(amount / 5e4) * 5e4;
  }

  function priceFor(club) {
    const scale = multiplier(club);
    const out = {};
    Object.keys(TOP).forEach((key) => { out[key] = tidy(TOP[key] * scale); });
    /* A REBUILD IS A BUILDING JOB, SO IT IS PRICED LIKE ONE. Four phases
       of expansion is what tearing the ground down and starting again is
       worth, and seatCost() is already capacity-scaled — so this lands
       near the original £380m at Old Trafford and at a few million for a
       non-league ground, from one formula. */
    try {
      if (typeof seatCost === 'function') {
        out.rebuild = tidy(seatCost(club && club.cap ? club.cap : 0) * 4);
      }
    } catch (error) { /* leave the shipped rebuild price alone */ }

    /* A PART OF THE JOB CANNOT COST MORE THAN ALL OF IT. The two prices
       come from different places on purpose — a redevelopment is scaled
       by who you are, a rebuild by the ground you have — and for a small
       club with a small ground those crossed over: adding a tier and a
       roof was quoted £5.8m where tearing the whole thing down and
       building a new one was £2.8m. Nobody would ever take the first
       deal, and being offered it makes the screen look broken. */
    if (Number.isFinite(out.rebuild) && out.rebuild > 0) {
      out.tier = Math.min(out.tier, tidy(out.rebuild * 0.6));
    }
    return out;
  }

  /* Write the prices for THIS club onto the catalogue. STAD_UP is a
     const, but its properties are not, and the game already mutates
     `STAD_UP.seats` this way in `seatSync()` — same seam, same idea. */
  function sync(club) {
    try {
      if (typeof STAD_UP !== 'object' || !STAD_UP || !club) return;
      const prices = priceFor(club);
      Object.keys(prices).forEach((key) => {
        if (STAD_UP[key] && Number.isFinite(prices[key]) && prices[key] > 0) {
          STAD_UP[key].cost = prices[key];
        }
      });
    } catch (error) { /* the screen still renders at the old price */ }
  }

  const mine = () => {
    try { return G.clubs[G.my]; } catch (error) { return null; }
  };

  /* before the screen is drawn… */
  if (typeof vStadium === 'function') {
    const previous = vStadium;
    vStadium = function vStadiumScaledPrices() {
      sync(mine());
      return previous.apply(this, arguments);
    };
  }

  /* …and before the money is taken, so you are charged what you were
     shown even if something re-rendered in between */
  try {
    if (ACTIONS && typeof ACTIONS.stadBuy === 'function') {
      const previous = ACTIONS.stadBuy;
      ACTIONS.stadBuy = function stadBuyScaledPrices() {
        sync(mine());
        return previous.apply(this, arguments);
      };
    }
  } catch (error) { /* the button still works at the shipped price */ }

  try {
    window.RBSStadiumCosts = Object.freeze({
      PL_REP, CURVE, FLOOR, CEILING, TOP, multiplier, priceFor, sync,
    });
  } catch (error) { /* no window */ }
}());
