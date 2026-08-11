/* global G, esc, clamp, fmtM, fmtW, WEEKS_IN_YEAR, mail, squadWage, staffWage, divMembers, leaguePos,
          LEAGUES, commercialIncome, ensureCommercial, MU, ordinal, tableRows,
          fixCtx, DIV_ORDER, ACTIONS, playerById, toast, $, loanTerms, offerById,
          CC_CHAIRS, budLimits, budOrigin, sfx, render, DIV_NAMES, myDiv,
          SPONSOR_SLOTS, commercialPower, dealValue, mulberry, hashStr */
/* global seasonRevenue:writable, seasonCosts:writable, monthlyIncome:writable,
          applyPostMatch:writable, endSeason:writable, vFinances:writable,
          dailyTickCore:writable, normaliseReps:writable, completeSigning:writable,
          vTransferBudget:writable, takeOverClub:writable */

/* =====================================================================
   ECONOMY — what football clubs actually earn, and what it costs them
   ---------------------------------------------------------------------
   Phase one of the economy rebuild. Measured before touching anything:
   the Premier League was close to right and everything underneath it was
   inflated, more so the further down you went.

     central distribution, per club   game        real 2024/25
       Premier League champion        £169.7M     £174.9M   ok
       Premier League bottom          £135.1M     £109.2M   1.2x
       Championship                   £38-48M     ~£11M     4x
       League One                     £12-13M     ~£2M      6x
       League Two                     £5.7-6.0M   ~£1.5M    4x
       National League                £2.7-2.9M   ~£150K    18x

   Three separate things caused it. The divisor {CH:.32, L1:.11, L2:.055,
   NL:.028} is nothing like the real 1 : 0.08 : 0.014 : 0.011 : 0.001. A
   flat £6.5M base was added to every club before that divisor, which put
   a Premier League floor under the whole pyramid. And commercial income
   was counted twice — once through the sponsorship-deals system, which
   is well calibrated (Arsenal £216M against a real £218M), and again
   through a `rep x 1150` stream worth another £132M on top.

   The costs were worse in the other direction. Operating costs were
   `cap x 760 + rep x 14000 + wages x 0.30`, and that middle term is a
   Premier League constant: it charged a National League club with a
   4,000-seat ground £28.7M a year to run. So every club from League One
   down showed a £35-50M annual loss and sat permanently IN BREACH of
   Profit & Sustainability on day one of a career, before the manager had
   done anything at all.

   WHAT THIS IS CALIBRATED TO, AND WHAT IT DELIBERATELY IS NOT. The
   shape is real: the money falls off a cliff below the Premier League,
   wages are far and away the largest cost, and a wage bill you cannot
   support will put you in trouble. The level is not real: in actual
   football the Championship spends 94p of every pound on wages and the
   division lost £436M last season. A club here runs a modest profit at
   every level if it is sensibly managed, because this is a game and you
   are supposed to be able to win it. Overspend and you will still feel
   it — the tension is intact, the doom is not.

   Money the game pays you now equals the money the Finances screen says
   it will, which was not previously true: you were paid £38 a head at the
   turnstile while the screen projected £24 across 19 home matches, and
   19 is only the right number of home league matches for the Premier
   League. The other four English divisions play 23.
   ===================================================================== */

(function economy() {
  'use strict';

  const has = (fn) => typeof fn === 'function';

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[economy: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  /* -------------------------------------------------------------------
     1. WHAT A DIVISION IS WORTH
     -------------------------------------------------------------------
     central   equal-share broadcast and central commercial money, a
               season, per club. The Premier League figure is the real
               2024/25 equal share: £29.8M domestic + £59.2M
               international + £7.9M central commercial, plus facility
               fees, rounded to £106M. Merit money is separate and paid
               at the end of the season, as it really is.
     merit     per league place, paid on the final table. £3.4M x 20
               places puts the champion on £174M and twentieth on
               £109.4M, which are the real numbers either end.
     ticket    what a seat yields, before hospitality.
     fill      how full a mid-sized club in that division gets.
     corp      how much the biggest club in the division can charge over
               the smallest. Corporate money is a top-flight phenomenon;
               a National League club sells tickets and pies.
     seat      annual cost of owning and running a seat.
     runs      everything else — travel, academy, medical, admin,
               matchday operations — as a share of revenue.
     ------------------------------------------------------------------- */
  const DIV_FIN = {
    PL: { central: 106e6, merit: 3.4e6, ticket: 42, fill: 0.96, corp: 0.75, seat: 900, runs: 0.28, grant: 4e6 },
    CH: { central: 11e6, merit: 9e5, ticket: 27, fill: 0.78, corp: 0.35, seat: 420, runs: 0.22, grant: 25e5 },
    L1: { central: 2e6, merit: 26e4, ticket: 22, fill: 0.65, corp: 0.20, seat: 240, runs: 0.16, grant: 8e5 },
    L2: { central: 15e5, merit: 19e4, ticket: 20, fill: 0.58, corp: 0.15, seat: 180, runs: 0.15, grant: 35e4 },
    NL: { central: 15e4, merit: 13e4, ticket: 16, fill: 0.42, corp: 0.10, seat: 90, runs: 0.14, grant: 22e4 },
  };
  const EU_FALLBACK = { central: 3e7, merit: 12e5, ticket: 26, fill: 0.80, corp: 0.45, seat: 520, runs: 0.19, grant: 15e5 };

  /* The rest of Europe from its UEFA coefficient: La Liga, Serie A and
     the Bundesliga distribute £55-80M a club, Ligue 1 about £28M, and a
     one-division country in the game is somewhere below that. */
  function divFinance(div) {
    if (DIV_FIN[div]) return DIV_FIN[div];
    const L = (typeof LEAGUES !== 'undefined') && LEAGUES[div];
    if (!L) return EU_FALLBACK;
    const co = L.coef || 2;
    /* Second tiers abroad are not all the same size either — the Segunda
       División and 2. Bundesliga distribute real money and carry real
       wage bills, and a flat £4M for all of them was what sent a dozen
       Spanish clubs into an overdraft they could never climb out of. */
    if (L.tier !== 1) {
      const central = co >= 5 ? 14e6 : co >= 4 ? 7e6 : co >= 3 ? 4e6 : 25e5;
      return { central, merit: Math.round(central * 0.05), ticket: co >= 5 ? 20 : 17,
        fill: 0.62, corp: 0.22, seat: 300, runs: 0.17, grant: Math.round(central * 0.25) };
    }
    const central = co >= 5 ? 55e6 : co >= 4 ? 22e6 : co >= 3 ? 12e6 : co >= 2 ? 6e6 : 3e6;
    return { central, merit: Math.round(central * 0.03), ticket: co >= 5 ? 30 : co >= 4 ? 25 : co >= 3 ? 21 : 18,
      fill: 0.82, corp: co >= 4 ? 0.55 : 0.30, seat: co >= 4 ? 620 : 380, runs: 0.19,
      grant: Math.round(central * 0.2) };
  }

  /* Where a club sits inside its own division on reputation: 1 is the
     biggest name in the league, 0 the smallest. Corporate income and
     crowds both track this rather than raw reputation, which is why a
     Premier League club at the bottom of the table still fills its
     ground and a big Championship club does not charge Arsenal prices. */
  function standing(c) {
    return guard('standing', () => {
      const mem = divMembers(c.league) || [];
      if (mem.length < 2) return 0.5;
      let lo = Infinity;
      let hi = -Infinity;
      mem.forEach((i) => { const r = G.clubs[i].rep || 0; if (r < lo) lo = r; if (r > hi) hi = r; });
      if (hi <= lo) return 0.5;
      return clamp(((c.rep || 0) - lo) / (hi - lo), 0, 1);
    }, 0.5);
  }

  function homeLeagueMatches(div) {
    return guard('homeMatches', () => {
      const n = (divMembers(div) || []).length;
      if (n < 2) return 19;
      return n <= 12 ? Math.round((n - 1) * 1.5) : n - 1;
    }, 19);
  }

  /* -------------------------------------------------------------------
     2. MATCHDAY
     ------------------------------------------------------------------- */
  function attendance(c, opts) {
    return guard('attendance', () => {
      const f = divFinance(c.league);
      const s = standing(c);
      const fans = (G.fans == null || c.i !== G.my) ? 60 : G.fans;
      let fill = f.fill * (0.80 + s * 0.35) * (0.93 + (fans / 100) * 0.14);
      if (opts && opts.won) fill *= 1.03;
      if (opts && opts.cup) fill *= 0.86;         /* a cup tie draws fewer */
      return clamp(Math.round((c.cap || 5000) * clamp(fill, 0.16, 1)), 200, c.cap || 5000);
    }, Math.round((c.cap || 5000) * 0.6));
  }

  /* What the average head through the turnstile is worth, hospitality
     and corporate included. */
  function ticketYield(c) {
    const f = divFinance(c.league);
    return f.ticket * (1 + standing(c) * f.corp);
  }

  function matchdayRevenue(c) {
    return guard('matchday', () => {
      const league = attendance(c, {}) * ticketYield(c) * homeLeagueMatches(c.league);
      const cups = attendance(c, { cup: 1 }) * ticketYield(c) * 3;   /* the usual home cup ties */
      return Math.round(league + cups);
    }, 0);
  }

  /* -------------------------------------------------------------------
     3. COMMERCIAL
     -------------------------------------------------------------------
     Your own club uses the sponsorship deals you have actually signed,
     because that system is well calibrated and worth keeping. Every
     other club in the world is estimated from the same curve, so the
     league table of who can afford what stays honest. */
  const COMMERCIAL_DIV = { PL: 1, EU: 1, CH: 0.30, L1: 0.10, L2: 0.05, NL: 0.025 };
  const SLOT_TOTAL = 1.692e8;  /* the four default slots at full value */

  function commercialFor(c) {
    return guard('commercial', () => {
      if (c.i === G.my && has(commercialIncome)) {
        if (has(ensureCommercial)) ensureCommercial();
        return commercialIncome();
      }
      let divM = COMMERCIAL_DIV[c.league];
      if (divM == null) {
        const L = (typeof LEAGUES !== 'undefined') && LEAGUES[c.league];
        divM = L && L.tier === 1 ? clamp((L.coef || 2) / 5, 0.12, 1) : 0.08;
      }
      return Math.round(((c.rep || 2000) / 11500) * divM * SLOT_TOTAL / 1e4) * 1e4;
    }, 0);
  }

  /* -------------------------------------------------------------------
     4. THE ACCOUNTS
     ------------------------------------------------------------------- */
  /* Central money, plus the part of it that is weighted towards the
     clubs that need it. Basic awards and solidarity are not shared out
     evenly in real football — they are what keeps a small club's lights
     on, and they are worth proportionally far more at the bottom of a
     division than the top. Sized here so that the smallest club in
     every division, which is where a club you built yourself starts,
     clears a small profit rather than an honest small loss. It is keyed
     to standing rather than to anything you control, so it cannot be
     farmed by running the wage bill up. */
  /* THE SOLVENCY FLOOR, APPLIED TO A DIVISION AND NOT TO A CLUB.

     A game should not contain clubs that cannot exist. Wage bills are
     set from reputation, and reputation and revenue do not track each
     other everywhere — a Spanish second-tier squad is paid like a
     Championship one on a fraction of the income, and eight of them
     ended the third simulated season between £13M and £48M overdrawn.

     The first version of this measured each club's own costs, which was
     wrong in a way a regression test caught before it shipped: a top-up
     that scales with your own wage bill is an unlimited bailout, so
     overspending pays for itself and the whole point of wages being the
     binding constraint disappears. It also flattened the cliff between
     divisions, because a relegated club kept a Premier League income.

     So it is measured on the MEDIAN club in the division and handed to
     everybody in it equally. A league that cannot pay its way gets
     lifted; a club that has overspent inside a solvent league does not,
     and loses money exactly as it should. Cached per season — it walks
     every squad in the division. It binds nowhere in England. */
  let floorCache = { season: -1, by: {} };

  function solvencyNeed(c, f) {
    const wages = (has(squadWage) ? squadWage(c) : 0) * 52;
    const staff = wages * 0.18;
    const stadium = (c.cap || 5000) * f.seat;
    const denom = Math.max(0.3, 1 - 1.05 * f.runs);
    return 1.02 * (wages + staff + stadium) / denom;
  }

  function divisionTopUp(div) {
    return guard('topup', () => {
      if (floorCache.season !== G.season) floorCache = { season: G.season, by: {} };
      if (floorCache.by[div] != null) return floorCache.by[div];
      floorCache.by[div] = 0;                     /* guards against re-entry */
      const f = divFinance(div);
      const mem = divMembers(div) || [];
      if (!mem.length) return 0;
      const gaps = mem.map((i) => {
        const c = G.clubs[i];
        return solvencyNeed(c, f) - matchdayRevenue(c) - commercialFor(c) - f.central;
      }).sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      const top = Math.max(0, Math.round(median));
      floorCache.by[div] = top;
      return top;
    }, 0);
  }

  function centralFor(c) {
    const f = divFinance(c.league);
    return Math.round(f.central + (f.grant || 0) * (1 - standing(c)) + divisionTopUp(c.league));
  }

  /* Merit money for a finishing position, paid at the end of the season.
     Twentieth in the Premier League is worth one step, first is worth
     twenty — the real shape. */
  function meritFor(c, pos) {
    return guard('merit', () => {
      const f = divFinance(c.league);
      const n = (divMembers(c.league) || []).length || 20;
      const p = clamp(pos || leaguePos(c.i) || n, 1, n);
      return Math.round(f.merit * (n + 1 - p));
    }, 0);
  }

  function revenueFor(c, pos) {
    const central = centralFor(c);
    const gate = matchdayRevenue(c);
    const com = commercialFor(c);
    const merit = meritFor(c, pos);
    return { tv: central, gate, com, spon: merit, total: central + gate + com + merit };
  }

  /* Backroom staff are paid `(4 + rep/900) x £1,000` a week per role,
     which has a £4,000 floor on it and no idea what division it is in.
     I previously recorded that nothing debited this and it was a
     projection line only. That was wrong: `dailyWages` is wrapped a
     second time and takes `staffWage()/7` out of the bank every single
     day. It is the largest outgoing a small club has — a built National
     League club was paying its six-man backroom more than twice its
     entire playing squad and bleeding to £12.8M overdrawn inside two
     seasons. The bill itself is capped in `rescaleStaff` below; this
     bound keeps the projection honest either way. */
  function costsFor(c, rev) {
    const f = divFinance(c.league);
    const r = rev || revenueFor(c);
    const wages = Math.round((has(squadWage) ? squadWage(c) : 0) * 52);
    const raw = (c.i === G.my && has(staffWage)) ? staffWage() * 52 : wages * 0.18;
    const staff = Math.round(clamp(raw, wages * 0.10, wages * 0.35));
    const amort = (c.i === G.my && G.fin && G.fin.amort) || 0;
    const ops = Math.round((c.cap || 5000) * f.seat + r.total * f.runs);
    return { wages, staff, amort, ops, total: wages + staff + amort + ops };
  }

  /* the two the Finances screen and the PSR panel are built from */
  if (has(seasonRevenue)) {
    seasonRevenue = function seasonRevenueReal() {
      return guard('seasonRevenue', () => revenueFor(G.clubs[G.my]), { tv: 0, gate: 0, com: 0, spon: 0, total: 0 });
    };
  }
  if (has(seasonCosts)) {
    seasonCosts = function seasonCostsReal() {
      return guard('seasonCosts', () => costsFor(G.clubs[G.my]), { wages: 0, staff: 0, amort: 0, ops: 0, total: 0 });
    };
  }

  /* -------------------------------------------------------------------
     5. THE MONEY ACTUALLY ARRIVING
     -------------------------------------------------------------------
     Central and commercial money is paid monthly; matchday is paid at
     the turnstile; merit money is paid in May. And it is paid to every
     club in the world, not only to yours — the old code credited the
     user alone while `dailyWages` debited everybody, so a League Two
     club lost £614K in 120 days and a National League club was down to
     its last £65K before Christmas.
     ------------------------------------------------------------------- */
  if (has(monthlyIncome)) {
    monthlyIncome = function monthlyIncomeReal() {
      return guard('monthlyIncome', () => {
        const me = G.clubs[G.my];
        const central = Math.round(centralFor(me) / 12);
        const com = Math.round(commercialFor(me) / 12);
        /* The Finances screen has always shown a running-costs line — the
           ground, the matchdays, everything that is not a wage — and
           nothing ever debited it. Only wages left the account, so the
           screen and the bank disagreed by the whole of that line: about
           £165M a year at Manchester United. It is charged now, so the
           projection you are shown is the money that actually moves. */
        const ops = Math.round(costsFor(me).ops / 12);
        me.bank += central + com - ops;
        if (!G.fin) G.fin = {};
        G.fin.commercialYTD = (G.fin.commercialYTD || 0) + com;
        mail('info', 'Monthly accounts',
          `Central distribution: <b>${fmtM(central)}</b> · Commercial and sponsorship: <b>${fmtM(com)}</b> ` +
          `· Running costs: <b>−${fmtM(ops)}</b>.` +
          `<br><br><span class="xs faint">Matchday income is paid on the day and wages come out daily. ` +
          `Merit money for your final league position is paid at the end of the season.</span>`);
        /* And the rest of the world, so the pyramid does not go bust.
           This paid every AI club its REVENUE and never took a penny of
           its costs, which is a different bug from the one it was fixing:
           a club with income and no wage bill compounds. Measured after a
           single season, the median Premier League club held £442M and the
           richest club in the world reached £2.2 billion by season four.
           They are paid what they actually clear now — the same revenue
           and cost model the Finances screen shows you, so an AI club's
           balance means the same thing yours does. The division solvency
           floor already guarantees the median club in every league clears
           its bills, which is what makes paying net safe. */
        (G.clubs || []).forEach((c) => {
          if (!c || c.i === G.my) return;
          const rev = revenueFor(c);
          /* Every club in this world clears a small profit — the user's
             rule, and the whole reason this economy is calibrated soft.
             The real Championship lost £436M last season; here the shape of
             the pyramid is real and the level is kind, so a club that would
             genuinely lose money instead banks three per cent of turnover.
             It is a floor, not a payment: a club earning properly keeps
             what it actually earns. */
          const net = Math.max(rev.total * 0.03, rev.total - costsFor(c, rev).total);
          /* No club in this world is allowed to go bust — the user's rule,
             and the reason the whole economy is calibrated soft. A club
             that is losing money drifts down to a month's wages and stops
             there rather than falling into an overdraft it can never
             clear. The floor is a month rather than nothing because the
             transfer market debits these balances between monthly ticks,
             and a floor of zero simply moves the overdraft to a Tuesday. */
          const reserve = Math.round((has(squadWage) ? squadWage(c) : 0) * 4.4);
          let bank = Math.max(reserve, Math.round((c.bank || 0) + net / 12));
          /* And nobody hoards. A club sitting on more than a season and a
             half of turnover has spent it — on the ground, the training
             ground, the wage bill, the squad. Without this the richest
             club in the world reached £2.2 billion by season four, which
             is not a football club, it is a sovereign wealth fund. */
          bank = Math.min(bank, Math.round(rev.total * 1.5) || bank);
          c.bank = bank;
          /* the AI transfer code subtracts a fee without checking it has
             one, so a club that gets carried away in a window carries a
             negative transfer budget for the rest of the season */
          if (!(c.budget > 0)) c.budget = 0;
        });
      });
    };
  }

  /* -------------------------------------------------------------------
     6. THE TURNSTILE
     -------------------------------------------------------------------
     The base game pays `cap x fill x £38` and mails you the figure. That
     is replaced rather than wrapped-around: the original amount is
     recomputed from its own formula, taken back out, and the real one
     paid in, so every layer that sits between here and there is left
     alone.
     ------------------------------------------------------------------- */
  const OLD_FILL = (c, res) => clamp(0.66 + c.rep / 45000 + (res === 'W' ? 0.05 : 0), 0.55, 1);

  if (has(applyPostMatch)) {
    const previousPost = applyPostMatch;
    applyPostMatch = function applyPostMatchGate(res, gf, ga) {
      const r = previousPost.apply(this, arguments);
      guard('gate', () => {
        const f = MU && MU.fix;
        if (!f) return;
        const my = G.clubs[G.my];
        if (!(f.h === G.my && !f.neutral)) return;
        if (has(fixCtx) && (fixCtx(f) || {}).friendly) return;
        /* Every layer between the gate receipt and here posts its own
           mail, and mail() unshifts, so by now the gate message is
           several entries down the tray rather than at the top of it.
           Today's date pins it exactly. */
        const top = (G.inbox || []).find((x) => x.day === G.day && String(x.title).indexOf('Gate receipts:') === 0);
        if (!top) return;

        const oldGate = Math.round(my.cap * OLD_FILL(my, res) * (f.cup ? 30 : 38));
        const crowd = attendance(my, { won: res === 'W', cup: !!f.cup });
        const yield_ = ticketYield(my) * (f.cup ? 0.8 : 1);
        const gate = Math.round(crowd * yield_);

        my.bank += gate - oldGate;
        top.title = `Gate receipts: ${fmtM(gate)}`;
        top.body = `<b>${crowd.toLocaleString()}</b> through the turnstiles at ${esc(my.stadium)} ` +
          `generated <b>${fmtM(gate)}</b> — an average of <b>£${Math.round(yield_)}</b> a head ` +
          'across tickets, hospitality and everything else sold inside the ground.';
      });
      return r;
    };
  }

  /* -------------------------------------------------------------------
     7. MERIT MONEY IN MAY
     -------------------------------------------------------------------
     The season-end prize was `(places below you x £2.2M + £9M)` scaled
     by division, which paid a National League champion £927K and a
     Premier League champion £53M — the second of those is the real
     merit figure, and it was being paid on top of broadcast money that
     already included it. It is now the merit payment proper.
     ------------------------------------------------------------------- */
  if (has(endSeason)) {
    const previousEnd = endSeason;
    endSeason = function endSeasonMerit() {
      const div = (G._preDiv || (G.clubs[G.my] || {}).league);
      const posBefore = G._finalPos;
      const r = previousEnd.apply(this, arguments);
      guard('merit.pay', () => {
        const my = G.clubs[G.my];
        const rows = tableRows(div) || [];
        const pos = posBefore || rows.findIndex((x) => x.i === G.my) + 1 || rows.length;
        const dsc = { PL: 1, EU: 0.8, CH: 0.18, L1: 0.06, L2: 0.03, NL: 0.015 }[div] || 1;
        const oldPrize = Math.round(((rows.length + 1 - pos) * 22e5 + 9e6) * dsc);
        const f = DIV_FIN[div] ? DIV_FIN[div] : divFinance(div);
        const n = rows.length || 20;
        const merit = Math.round(f.merit * (n + 1 - clamp(pos, 1, n)));
        my.bank += merit - oldPrize;
        my.budget = Math.max(0, my.budget + merit - oldPrize);
        const m = (G.inbox || []).find((x) => String(x.title).indexOf('Season over') === 0);
        if (m) {
          m.body = String(m.body).replace(/Prize money: <b>[^<]*<\/b>/,
            `Merit payment for finishing ${ordinal(pos)}: <b>${fmtM(merit)}</b>`);
        }
      });
      return r;
    };
  }

  /* the Finances screen calls the fourth bucket "Other sponsorship";
     it is merit money now, so it says so */
  if (has(vFinances)) {
    const previousFin = vFinances;
    vFinances = function vFinancesRelabelled() {
      let h = previousFin.apply(this, arguments);
      try {
        h = h.replace('💼 Other sponsorship', '🏆 Merit money (projected)');
      } catch (error) { /* leave the label */ }
      return h;
    };
  }

  try {
    window.RBSEconomy = Object.freeze({
      divFinance, standing, attendance, ticketYield, matchdayRevenue,
      commercialFor, centralFor, meritFor, revenueFor, costsFor, homeLeagueMatches,
    });
  } catch (error) { /* no window */ }
}());

/* =====================================================================
   ECONOMY PHASE TWO — the cliff
   ---------------------------------------------------------------------
   Promotion and relegation were modelled as a multiplier on whatever the
   club happened to have: `budget x 2.4 + £8,000,000` going up and
   `budget x 0.55, wageCap x 0.7` coming down. The £8M is flat, so a
   National League club promoted to League Two banked the same eight
   million as a Championship club promoted to the Premier League.

   In real football the promotion from the Championship is the single
   largest financial event in the sport — roughly £110M of central money
   the following season against £11M — and relegation from the Premier
   League is a £100M hole in the accounts that parachute payments only
   partly fill. Both now fall out of the division tables in phase one by
   themselves, so the flat £8M is removed rather than retuned.

   PARACHUTE PAYMENTS are the real 2024/25 taper: about £49M in the first
   year after relegation, £40M in the second, and £22M in a third that is
   only paid to clubs who were up for more than one season. Luton, up
   through the play-offs and straight back down, got two years and
   nothing after. That rule is modelled, because it is the reason a club
   gambles on staying up.

   They follow the club, not the manager, so they are stored on the club
   and appear as central income for whoever holds them — which means a
   Championship rival with a parachute is genuinely harder to compete
   with, as it is in life.
   ===================================================================== */

(function economyCliff() {
  'use strict';

  const has = (fn) => typeof fn === 'function';
  const PARACHUTE = [49e6, 40e6, 22e6];

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[economy: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  function order() {
    return (typeof DIV_ORDER !== 'undefined') ? DIV_ORDER : ['PL', 'CH', 'L1', 'L2', 'NL'];
  }

  /* What a club is owed this season for having been in the Premier
     League. `left` counts down each summer; `years` is how long they
     were up, which decides whether there is a third payment at all. */
  /* Which rung of the taper a club is on. Counted from how many years it
     was awarded rather than from the length of the table, so a two-year
     parachute starts at £49M and steps to £40M — it does not start
     half way down. */
  function parachuteFor(c) {
    if (!c || !c.chute || !(c.chute.left > 0)) return 0;
    const total = c.chute.total || c.chute.left;
    const stage = total - c.chute.left;
    if (stage < 0 || stage >= PARACHUTE.length) return 0;
    return PARACHUTE[stage];
  }

  function grantParachute(c, seasonsUp) {
    const years = seasonsUp > 1 ? 3 : 2;
    c.chute = { left: years, total: years, years: seasonsUp, from: G.season };
  }

  /* Parachute money is central money: it goes in the same bucket, so
     every screen, the PSR position and the monthly payment all pick it
     up without being told about it. */
  if (typeof window !== 'undefined' && window.RBSEconomy && has(window.RBSEconomy.centralFor)) {
    const baseCentral = window.RBSEconomy.centralFor;
    const withChute = function centralWithParachute(c) {
      return baseCentral(c) + parachuteFor(c);
    };
    /* rebuild the frozen export around the new one */
    const api = {};
    Object.keys(window.RBSEconomy).forEach((k) => { api[k] = window.RBSEconomy[k]; });
    api.centralFor = withChute;
    api.parachuteFor = parachuteFor;
    api.baseCentralFor = baseCentral;
    window.RBSEconomy = Object.freeze(api);

    /* and the two globals that read it */
    if (has(seasonRevenue)) {
      const prevRev = seasonRevenue;
      seasonRevenue = function seasonRevenueChute() {
        const r = prevRev.apply(this, arguments);
        return guard('revenue.chute', () => {
          const p = parachuteFor(G.clubs[G.my]);
          if (!p) return r;
          return { tv: r.tv + p, gate: r.gate, com: r.com, spon: r.spon, total: r.total + p };
        }, r);
      };
    }
    if (has(monthlyIncome)) {
      const prevInc = monthlyIncome;
      monthlyIncome = function monthlyIncomeChute() {
        const r = prevInc.apply(this, arguments);
        guard('income.chute', () => {
          (G.clubs || []).forEach((c) => {
            const p = parachuteFor(c);
            if (p) c.bank = Math.round((c.bank || 0) + p / 12);
          });
        });
        return r;
      };
    }
  }

  /* -------------------------------------------------------------------
     WHO GOES UP, WHO COMES DOWN, AND WHAT IT DOES TO THEM
     -------------------------------------------------------------------
     endSeason moves the clubs and applies its own money. This runs after
     it, takes that money back out, and applies the real thing: the
     division tables do the work, and all that is left to record is how
     long a relegated club was up for and how many seasons of parachute
     that earns it.
     ------------------------------------------------------------------- */
  if (has(endSeason)) {
    const previousEnd = endSeason;
    endSeason = function endSeasonCliff() {
      const before = {};
      guard('cliff.before', () => {
        (G.clubs || []).forEach((c) => { if (c) before[c.i] = c.league; });
      });
      const r = previousEnd.apply(this, arguments);
      guard('cliff.after', () => {
        const ord = order();
        const justRelegated = new Set();
        (G.clubs || []).forEach((c) => {
          if (!c) return;
          const was = before[c.i];
          const now = c.league;

          /* another season in this division */
          if (was === now) {
            if (now === 'PL') c.plSeasons = (c.plSeasons || 0) + 1;
            return;
          }

          const wasIx = ord.indexOf(was);
          const nowIx = ord.indexOf(now);

          /* undo the flat promotion and relegation money — the division
             tables in phase one already say what each league is worth */
          if (wasIx >= 0 && nowIx >= 0) {
            if (nowIx < wasIx) c.budget = Math.max(0, Math.round((c.budget - 8e6) / 2.4));
            else c.budget = Math.round(c.budget / 0.55);
            /* and re-level the budget on the division actually joined */
            const rev = (window.RBSEconomy && window.RBSEconomy.revenueFor)
              ? window.RBSEconomy.revenueFor(c).total : c.budget;
            c.budget = Math.max(1e4, Math.round(rev * (now === 'PL' ? 0.22 : now === 'CH' ? 0.18 : 0.12) / 1e4) * 1e4);
          }

          if (was === 'PL' && now === 'CH') {
            grantParachute(c, Math.max(1, c.plSeasons || 1));
            justRelegated.add(c.i);
            c.plSeasons = 0;
            if (c.i === G.my) {
              mail('board', '🪂 Parachute payments confirmed',
                `Relegation costs the club its Premier League central distribution. The parachute is confirmed at ` +
                `<b>${fmtM(PARACHUTE[0])}</b> this coming season and <b>${fmtM(PARACHUTE[1])}</b> the season after` +
                (c.chute.left > 2 ? `, with a third year of <b>${fmtM(PARACHUTE[2])}</b> because we were up for more than one season.` : '.') +
                (c.chute.left <= 2 ? '<br><br>There is no third year. One season in the Premier League does not earn one.' : '') +
                '<br><br>It does not replace what has gone. The wage bill has to come down to meet it.');
            }
          }
          if (now === 'PL') {
            c.plSeasons = 1;
            c.chute = null;
            if (c.i === G.my) {
              mail('board', '💰 What promotion is worth',
                'The club joins the Premier League central distribution. Equal share, international rights and ' +
                'central commercial money come to roughly <b>£106M</b> a season before a ball is kicked, against ' +
                'the <b>£11M</b> we have been living on, and merit money on top of that in May.' +
                '<br><br>Every one of it is at risk the moment we go back down, so spend it like a club that ' +
                'intends to stay.');
            }
          }
        });

        /* A parachute year is used up each summer — but not the summer
           it was awarded in, or a club would drop a rung on the way
           down and never see the first payment. */
        (G.clubs || []).forEach((c) => {
          if (!c || !c.chute || justRelegated.has(c.i)) return;
          if (c.league === 'PL') { c.chute = null; return; }
          c.chute.left -= 1;
          if (c.chute.left <= 0) {
            c.chute = null;
            if (c.i === G.my) {
              mail('board', '🪂 The parachute has run out',
                'The last parachute payment has been made. From this season the club lives on its Championship ' +
                'central distribution and what it earns for itself. If the wage bill has not come down to meet ' +
                'it by now, it has to come down quickly.');
            }
          }
        });
      });
      return r;
    };
  }
}());

/* =====================================================================
   ECONOMY PHASE THREE — the rule the EFL actually uses
   ---------------------------------------------------------------------
   Profit & Sustainability is a Premier League and Championship rule. It
   was being applied to League One, League Two and the National League,
   where the real regulation is the Salary Cost Management Protocol: a
   cap on player wages as a share of turnover, monitored on projections,
   and enforced by a transfer embargo until the club is compliant again
   rather than by a points deduction.

   The game is set in 2026/27 and the League One figure changed for that
   season — down from 60% of turnover to 50%, with manager and coaching
   costs folded into the cap for the first time. League Two stays at 55%
   of player wages. Both are modelled as published.

   This is deliberately a guard rail rather than a noose. Measured across
   the divisions after phase one, clubs sit at 22-53% of turnover, so the
   cap only bites if you go looking for it — and when it does, it stops
   you making the commitment rather than punishing you for having made
   it. An embargo you can lift by selling somebody is a decision. A
   points deduction for something you did in August is not.
   ===================================================================== */

(function economySCMP() {
  'use strict';

  const has = (fn) => typeof fn === 'function';

  /* share of turnover, and whether the backroom counts towards it */
  const SCMP = {
    L1: { share: 0.50, coaching: true, name: 'League One' },
    L2: { share: 0.55, coaching: false, name: 'League Two' },
    NL: { share: 0.65, coaching: false, name: 'National League' },
  };

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[economy: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  /* Where the club stands against its cap. `extra` is a weekly wage you
     are thinking about committing to, so the same function answers both
     "where am I" and "may I do this". */
  function scmpPosition(extra) {
    return guard('scmp', () => {
      const c = G.clubs[G.my];
      const rule = SCMP[c.league];
      if (!rule) return null;
      const rev = has(seasonRevenue) ? seasonRevenue().total : 0;
      const costs = has(seasonCosts) ? seasonCosts() : { wages: 0, staff: 0 };
      const committed = costs.wages + (rule.coaching ? costs.staff : 0);
      const spend = committed + Math.round((extra || 0) * 52);

      /* A club can inherit a bill it did not agree to — the smallest
         League One side in the game starts at 65% of turnover against a
         50% cap, and a career that opens under embargo is a bug, not a
         difficulty setting. The EFL agrees a compliance path with a club
         in that position rather than freezing it. So the ceiling is the
         cap or what you walked into, whichever is higher, snapshotted at
         the start of the season: you can replace what you have, you
         cannot inflate it, and you cannot ratchet the allowance up by
         signing somebody. */
      if (c.scmpBase == null || c.scmpSeason !== G.season) {
        c.scmpBase = committed;
        c.scmpSeason = G.season;
      }
      const cap = Math.round(rev * rule.share);
      const limit = Math.max(cap, c.scmpBase);
      return {
        rule, limit, cap, spend, revenue: rev,
        inherited: limit > cap,
        room: limit - spend,
        pct: rev > 0 ? spend / rev : 0,
        ok: spend <= limit,
      };
    }, null);
  }

  /* -------------------------------------------------------------------
     THE EMBARGO
     -------------------------------------------------------------------
     Every route that adds a wage to the bill goes through one of these
     two: personal terms for a signing or a renewal, and taking a player
     on loan. Both are stopped before the commitment rather than after.
     ------------------------------------------------------------------- */
  function blocked(extraWeekly, what) {
    const p = scmpPosition(extraWeekly);
    if (!p || p.ok) return false;
    const over = Math.round(-p.room);
    toast(`${p.rule.name} wage cap: ${what} would put you £${Math.round(over / 1e3)}K a year over`);
    mail('board', '🚫 Wage cap — the registration would be refused',
      `${p.rule.name} runs a Salary Cost Management Protocol: player wages` +
      `${p.rule.coaching ? ' and coaching costs' : ''} cannot exceed <b>${Math.round(p.rule.share * 100)}%</b> ` +
      `of turnover. That deal would take the club to <b>${fmtM(p.spend)}</b> against a ceiling of ` +
      `<b>${fmtM(p.limit)}</b>, and the league would not register the player.` +
      '<br><br>Move somebody on, get a wage off the books, or grow the turnover, and the room comes back.');
    return true;
  }

  if (typeof ACTIONS !== 'undefined' && typeof ACTIONS.submitTerms === 'function') {
    const previousTerms = ACTIONS.submitTerms;
    ACTIONS.submitTerms = function submitTermsCapped() {
      const stop = guard('scmp.terms', () => {
        const n = G.negotiation;
        if (!n) return false;
        const p = playerById(n.pid);
        if (!p) return false;
        const want = Math.round(+(($('#tWage') || {}).value) || 0);
        const delta = want - (n.renew ? (p.wage || 0) : 0);
        if (delta <= 0) return false;
        return blocked(delta, n.renew ? 'that new contract' : 'signing him');
      }, false);
      if (stop) return undefined;
      return previousTerms.apply(this, arguments);
    };
  }

  ['loanAskDo', 'loanInDo'].forEach((name) => {
    if (typeof ACTIONS === 'undefined' || typeof ACTIONS[name] !== 'function') return;
    const previous = ACTIONS[name];
    ACTIONS[name] = function loanCapped(el) {
      const stop = guard('scmp.loan', () => {
        let weekly = 0;
        if (name === 'loanInDo') {
          const r = (G._loanList || [])[+el.dataset.v];
          if (r) weekly = Math.round(r.p.wage * (100 - r.share) / 100);
        } else {
          const p = playerById(el.dataset.id);
          if (p && has(loanTerms)) weekly = (loanTerms(p) || {}).weekly || 0;
        }
        if (weekly <= 0) return false;
        return blocked(weekly, 'that loan');
      }, false);
      if (stop) return undefined;
      return previous.apply(this, arguments);
    };
  });

  /* -------------------------------------------------------------------
     AND IT SAYS SO ON THE SCREEN
     ------------------------------------------------------------------- */
  if (has(vFinances)) {
    const previousFin = vFinances;
    vFinances = function vFinancesSCMP() {
      let h = previousFin.apply(this, arguments);
      guard('scmp.screen', () => {
        const p = scmpPosition(0);
        if (!p) return;
        const pct = Math.round(p.pct * 100);
        const cap = Math.round(p.rule.share * 100);
        const col = !p.ok ? 'var(--danger)' : pct > cap - 8 ? 'var(--amber)' : 'var(--green)';
        const panel = '<div class="card" style="margin-bottom:12px;border-color:' + col + '55">' +
          '<div class="spread" style="margin-bottom:8px"><div><div class="small" style="font-weight:800">📋 Salary Cost Management</div>' +
          '<div class="xs faint">' + esc(p.rule.name) + ' wage cap</div></div>' +
          '<div style="text-align:right"><div class="num" style="font-size:17px;font-weight:800;color:' + col + '">' +
          pct + '%<span class="small muted"> / ' + cap + '%</span></div>' +
          '<div class="xs faint">' + (p.ok ? fmtM(p.room) + ' of room' : fmtM(-p.room) + ' over') + '</div></div></div>' +
          '<div class="possbar"><i style="width:' + clamp(p.pct / p.rule.share * 100, 0, 100) + '%;background:' + col + '"></i>' +
          '<i style="flex:1;background:rgba(255,255,255,.07)"></i></div>' +
          '<div class="xs faint" style="margin-top:8px">Player wages' + (p.rule.coaching ? ' and coaching costs' : '') +
          ' may not exceed <b>' + cap + '%</b> of turnover. ' +
          (p.ok ? 'You can commit another <b>' + fmtM(p.room) + '</b> a year before the league stops registering players.'
            : '<b style="color:var(--danger)">You are over the cap and under embargo</b> — no new contract or loan will be registered until the bill comes down.') +
          (p.inherited ? '<br><br>You inherited a bill above the cap, so the league has agreed a ceiling of <b>' +
            fmtM(p.limit) + '</b> for this season. You can replace what you have; you cannot add to it.' : '') +
          '</div></div>';
        const anchor = '<div class="sec"><div class="t">Annual income</div>';
        h = h.indexOf(anchor) >= 0 ? h.replace(anchor, panel + anchor) : panel + h;
      });
      return h;
    };
  }

  try {
    if (typeof window !== 'undefined' && window.RBSEconomy) {
      const api = {};
      Object.keys(window.RBSEconomy).forEach((k) => { api[k] = window.RBSEconomy[k]; });
      api.scmpPosition = scmpPosition;
      window.RBSEconomy = Object.freeze(api);
    }
  } catch (error) { /* no window */ }
}());

/* =====================================================================
   THE CHAIRMAN YOU CHOSE, FOR AS LONG AS YOU MANAGE THE CLUB
   ---------------------------------------------------------------------
   Building your own club starts with picking a chairman, and the pick is
   the shape of the whole career: Generous hands you £72,000 a week of
   wage ceiling and expects promotion, Tight hands you £22,000 and tells
   you not to come back for more.

   It lasted until May. `normaliseReps` runs every summer and ends with

       c.wageCap = Math.max(c.wageCap, c.rep * 90)

   which has no idea a club can have been given a deliberately small
   ceiling by its own board. Measured on a National League club with the
   Tight chairman, one season end and no promotion:

       wageCap   £22,000  ->  £169,020     (rep 1878 x 90, exactly)
       budget    £150,000 ->  £651,000

   So the shoestring career the chairman promised became a mid-table
   Championship wage bill in ten months, and the choice stopped meaning
   anything.

   The floor exists for a good reason — it stops a generated club
   anywhere in the world being left with a ceiling it cannot field a team
   on — so it is kept for every club except the one whose ceiling was set
   deliberately.

   WHAT REPLACES IT. A chairman is not a number, he is a multiple: how
   far above or below the going rate for a club that size he is prepared
   to go. That multiple is measured once and then reapplied every season
   against what the club has become, so the ceiling grows as you climb
   without the chairman changing character. Tight stays tight in the
   Championship.

   AND WHERE THE MONEY COMES FROM. A ceiling above what the club turns
   over is an owner writing cheques, which is exactly what bankrolls a
   non-league promotion push in real life. It is now modelled as what it
   is — owner funding, shown on its own line in the accounts, paid in
   monthly, and counting towards the wage cap, because the real Salary
   Cost Management Protocol counts secured owner investment too. It
   tapers away by itself: as the club grows into its own turnover the
   subsidy shrinks to nothing, which is both realistic and the arc the
   chairmen describe when you pick them.
   ===================================================================== */

(function economyChairman() {
  'use strict';

  const has = (fn) => typeof fn === 'function';
  /* what a club that size would normally be allowed to pay, as a share
     of turnover — the wage-cap shares where a cap exists, and roughly
     the going rate above them */
  const NORM_SHARE = { PL: 0.62, CH: 0.60, L1: 0.50, L2: 0.55, NL: 0.65 };

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[economy: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  const E = () => (typeof window !== 'undefined' ? window.RBSEconomy : null);

  /* Revenue before any owner money, so the two cannot feed each other.
     Merit money is left out of the structural figure the chairman is
     anchored against: it moves with the league table, and a chairman who
     cut your budget because you slipped to eleventh in March would be a
     different kind of bug. */
  function structuralRevenue(c) {
    const api = E();
    if (!api) return 0;
    return api.centralFor(c) + api.matchdayRevenue(c) + api.commercialFor(c);
  }

  function baseRevenue(c) {
    const api = E();
    if (!api) return 0;
    return structuralRevenue(c) + api.meritFor(c);
  }

  function typicalCap(c) {
    const share = NORM_SHARE[c.league] || 0.60;
    return Math.max(1000, Math.round(structuralRevenue(c) * share / 52));
  }

  /* What the division itself pays, rather than what this particular club
     can earn. A club you built has a 2,400-seat ground, so its own
     revenue stays small however high it climbs — measured, a tight
     chairman's ceiling went £90K in the National League to £108K in
     League Two to £112K in League One, while what it takes to win those
     divisions roughly doubles at every step. Fielding a squad 6.5
     rating points above League Two finished eleventh on 67 points;
     the top four were on 74 to 78. So the owner has to keep pace with
     the division, not with the turnstiles. */
  let capCache = { season: -1, cap: {}, bud: {} };
  function divisionMedian(div, field) {
    return guard('divmedian', () => {
      if (capCache.season !== G.season) capCache = { season: G.season, cap: {}, bud: {} };
      const store = field === 'budget' ? capCache.bud : capCache.cap;
      if (store[div] != null) return store[div];
      const vals = (divMembers(div) || [])
        .map((i) => G.clubs[i][field] || 0)
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
      const v = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
      store[div] = v;
      return v;
    }, 0);
  }
  const divisionMedianCap = (div) => divisionMedian(div, 'wageCap');
  const divisionMedianBudget = (div) => divisionMedian(div, 'budget');

  /* How much of the owner's advantage survives each promotion. He is
     everything in the fifth tier and a rounding error in the Premier
     League, which is both true of real owners and the only way the
     numbers stay sane at the top. */
  const OWNER_REACH = { NL: 1.0, L2: 0.85, L1: 0.70, CH: 0.45, PL: 0.15 };
  /* The transfer budget fades faster than the wage ceiling. A ceiling is
     what lets you field a side; a budget on top of what a Premier League
     club already gets is just a cheat code. */
  const OWNER_REACH_BUD = { NL: 1.0, L2: 0.70, L1: 0.50, CH: 0.30, PL: 0.08 };

  /* Measured once, on the ceiling the chairman actually set. */
  function anchorChairman(c) {
    if (!c || !c.custom) return;
    if (c.chairMult != null) return;
    const t = typicalCap(c);
    c.chairCap0 = c.wageCap || t;
    const b = typicalBudget(c);
    c.chairBud0 = c.budget || b;
    /* the chairman as a multiple of what his division pays, measured on
       the day he took over */
    const dm = divisionMedianCap(c.league);
    c.chairDivMult = dm > 0 ? clamp(c.chairCap0 / dm, 1, 8) : 1;
    const db = divisionMedianBudget(c.league);
    c.chairBudDivMult = db > 0 ? clamp(c.chairBud0 / db, 1, 4) : 1;
    /* What the owner is putting in, as an amount rather than a multiple.
       A multiple compounds: ten times a National League budget is a
       fortune, and ten times a Premier League one is half a billion. An
       amount behaves the way an owner actually does — it transforms a
       non-league club, it is useful in League One, and by the time the
       club is in the Premier League its own income has made the owner's
       money irrelevant, which is exactly the arc. */
    c.chairCapAdd = Math.max(0, c.chairCap0 - t);
    c.chairBudAdd = Math.max(0, c.chairBud0 - b);
    c.chairMult = 1;
    c.chairBudMult = 1;
  }

  function chairCeiling(c) {
    anchorChairman(c);
    if (!c || c.chairCapAdd == null) return c ? c.wageCap : 0;
    const own = typicalCap(c) + c.chairCapAdd;
    const dm = divisionMedianCap(c.league);
    const reach = OWNER_REACH[c.league] == null ? 0.4 : OWNER_REACH[c.league];
    const keptUp = dm > 0 ? dm * (1 + ((c.chairDivMult || 1) - 1) * reach) : 0;
    return Math.max(c.chairCap0 || 0, Math.round(own), Math.round(keptUp));
  }

  /* The transfer budget drifted the same way and for the same reason:
     every summer adds `rep x 9000` to it, which is a Premier League
     formula, and it took the Tight chairman's £150,000 to £613,000 in
     one season without the club being promoted. The chairman allocates
     a budget in proportion to what the club is, exactly as he does the
     wage ceiling — and what you make from selling players is still
     yours on top of it, in season. */
  const BUDGET_SHARE = { PL: 0.22, CH: 0.18, L1: 0.12, L2: 0.12, NL: 0.12 };

  function typicalBudget(c) {
    return Math.max(1e4, Math.round(structuralRevenue(c) * (BUDGET_SHARE[c.league] || 0.15)));
  }

  function chairBudget(c) {
    anchorChairman(c);
    if (!c || c.chairBudAdd == null) return c ? c.budget : 0;
    /* Floored at what he first gave you, the same way the ceiling is.
       Commercial income moves with where you finished, and a chairman
       who cut the transfer budget a quarter because the sponsorship
       revalued is not a chairman, it is a rounding error. */
    const own = typicalBudget(c) + (c.chairBudAdd || 0);
    const dm = divisionMedianBudget(c.league);
    const reach = OWNER_REACH_BUD[c.league] == null ? 0.3 : OWNER_REACH_BUD[c.league];
    const keptUp = dm > 0 ? dm * (1 + ((c.chairBudDivMult || 1) - 1) * reach) : 0;
    return Math.max(1e4, c.chairBud0 || 0, Math.round(Math.max(own, keptUp) / 1e4) * 1e4);
  }

  /* The gap between what the chairman will underwrite and what the club
     earns for itself. Zero for a chairman who is not putting money in,
     which is the whole point of the Tight one. */
  function ownerFunding(c) {
    return guard('owner', () => {
      if (!c || !c.custom) return 0;
      anchorChairman(c);
      /* A ceiling you are not allowed to spend is not a ceiling. Below
         the Championship the wage cap is a share of turnover, so the
         owner has to underwrite enough turnover for his own ceiling to
         be legal — which is exactly what a bankrolled non-league club
         does, and why one can field a squad its division cannot. */
      const share = NORM_SHARE[c.league] || 0.60;
      const need = chairCeiling(c) * 52 / share * 1.10;
      return Math.max(0, Math.round(need - baseRevenue(c)));
    }, 0);
  }

  /* -------------------------------------------------------------------
     IT IS INCOME, SO IT GOES IN THE ACCOUNTS
     ------------------------------------------------------------------- */
  if (has(seasonRevenue)) {
    const prevRev = seasonRevenue;
    seasonRevenue = function seasonRevenueOwner() {
      const r = prevRev.apply(this, arguments);
      return guard('revenue.owner', () => {
        const owner = ownerFunding(G.clubs[G.my]);
        if (!owner) return r;
        return { tv: r.tv, gate: r.gate, com: r.com, spon: r.spon, owner, total: r.total + owner };
      }, r);
    };
  }

  if (has(monthlyIncome)) {
    const prevInc = monthlyIncome;
    monthlyIncome = function monthlyIncomeOwner() {
      const r = prevInc.apply(this, arguments);
      guard('income.owner', () => {
        (G.clubs || []).forEach((c) => {
          const owner = ownerFunding(c);
          if (owner) c.bank = Math.round((c.bank || 0) + owner / 12);
        });
      });
      return r;
    };
  }

  if (has(vFinances)) {
    const prevFin = vFinances;
    vFinances = function vFinancesOwner() {
      let h = prevFin.apply(this, arguments);
      guard('screen.owner', () => {
        const owner = ownerFunding(G.clubs[G.my]);
        if (!owner) return;
        /* the last row of the income card, immediately before the costs
           heading that follows it */
        const row = '<div class="spread" style="padding:5px 2px;border-bottom:1px solid var(--chalk)">' +
          '<span class="small">🤝 Owner funding</span><b class="num small">' + fmtM(owner) + '</b></div>';
        const anchor = '</div><div class="sec"><div class="t">Annual costs</div>';
        if (h.indexOf(anchor) >= 0) h = h.replace(anchor, row + anchor);
      });
      return h;
    };
  }

  /* -------------------------------------------------------------------
     AND THE SUMMER LEAVES IT ALONE
     ------------------------------------------------------------------- */
  if (typeof normaliseReps === 'function') {
    const prevNorm = normaliseReps;
    normaliseReps = function normaliseRepsChairman() {
      const held = [];
      guard('chair.hold', () => {
        (G.clubs || []).forEach((c) => { if (c && c.custom) { anchorChairman(c); held.push(c); } });
      });
      const r = prevNorm.apply(this, arguments);
      guard('chair.restore', () => {
        held.forEach((c) => {
          const bill = has(squadWage) ? squadWage(c) : 0;
          /* the chairman's number, or the bill already being paid if the
             squad has outgrown him — never the rep x 90 floor */
          c.wageCap = Math.max(chairCeiling(c), Math.round(bill * 1.02));
          c.budget = chairBudget(c);
        });
      });
      return r;
    };
  }

  /* THE BUDGET STOPS COMPOUNDING. The base game re-levels every club's
     transfer budget each summer except yours — `if(c.i!==G.my)` — and
     then adds `rep x 9000` to everybody including you. Nothing ever
     takes it back, so across three simulated seasons a Premier League
     budget went £135M, £266M, £411M, £563M without a single player
     being sold. A board allocates a budget from the accounts each
     summer; it does not hand you a cumulative total of every budget it
     has ever set. You keep what you did not spend, up to as much again,
     which is generous and still bounded. */
  const BUD_SHARE = { PL: 0.22, CH: 0.18, L1: 0.12, L2: 0.12, NL: 0.12 };
  if (has(endSeason)) {
    const prevBudEnd = endSeason;
    endSeason = function endSeasonBudget() {
      const unspent = guard('budget.pre', () => Math.max(0, (G.clubs[G.my] || {}).budget || 0), 0);
      const r = prevBudEnd.apply(this, arguments);
      guard('budget.relevel', () => {
        const c = G.clubs[G.my];
        if (!c || c.custom) return;               /* a built club answers to its chairman */
        const api = E();
        if (!api) return;
        const rev = api.centralFor(c) + api.matchdayRevenue(c) + api.commercialFor(c);
        const allocation = Math.round(rev * (BUD_SHARE[c.league] || 0.15));
        c.budget = Math.max(1e4, Math.round((allocation + Math.min(unspent, allocation)) / 1e4) * 1e4);
      });
      return r;
    };
  }

  /* The summer is a chain of a dozen layers and three of them touch the
     budget after `normaliseReps` has run — including this file's own
     merit-payment correction, which was quietly taking £38,000 back off
     the Tight chairman's allocation. So the chairman has the last word,
     applied once the whole chain has finished. Prize money still lands
     in the bank; the budget is what the chairman says it is. */
  if (has(endSeason)) {
    const prevEnd = endSeason;
    endSeason = function endSeasonChairman() {
      const r = prevEnd.apply(this, arguments);
      guard('chair.final', () => {
        (G.clubs || []).forEach((c) => {
          if (!c || !c.custom) return;
          anchorChairman(c);
          const bill = has(squadWage) ? squadWage(c) : 0;
          c.wageCap = Math.max(chairCeiling(c), Math.round(bill * 1.02));
          c.budget = chairBudget(c);
        });
      });
      return r;
    };
  }

  /* -------------------------------------------------------------------
     A BACKROOM THE CLUB CAN AFFORD
     -------------------------------------------------------------------
     `defaultStaff` pays every role `(4 + rep/900) x £1,000` a week, so
     the floor is £4,000 a head whoever you are. At a National League
     club that is a backroom costing more than twice the playing squad,
     debited daily, and it is why a built club went £12.8M overdrawn in
     two seasons while its accounts said it was profitable.

     Only ever scaled down, and only when it is out of proportion — a
     Premier League backroom is a small fraction of a Premier League
     wage bill already and is left exactly as it is. The staff screen,
     the daily debit and the accounts all read from the same numbers, so
     correcting the numbers keeps all three honest at once.
     ------------------------------------------------------------------- */
  function rescaleStaff() {
    const c = G.clubs[G.my];
    if (!c || !G.staff || !has(staffWage)) return;
    const bill = (has(squadWage) ? squadWage(c) : 0);
    if (bill <= 0) return;
    const current = staffWage();
    const ceiling = bill * 0.35;
    if (current <= ceiling) return;                 /* already proportionate */
    const target = bill * 0.25;
    const k = target / current;
    Object.keys(G.staff).forEach((role) => {
      const st = G.staff[role];
      if (st && typeof st.wage === 'number') st.wage = Math.max(150, Math.round(st.wage * k / 50) * 50);
    });
  }

  /* anchored on the first tick of a career, before any summer can move it */
  if (has(dailyTickCore)) {
    const prevTick = dailyTickCore;
    dailyTickCore = function dailyTickChairman() {
      const r = prevTick.apply(this, arguments);
      guard('chair.tick', () => {
        const c = G.clubs[G.my];
        if (c && c.custom) anchorChairman(c);
        /* a club that overspent in the window carries a negative budget
           until the next month's income; cleared the day it happens */
        (G.clubs || []).forEach((x) => { if (x && !(x.budget > 0)) x.budget = 0; });
        if (G.day % 7 === 1) rescaleStaff();
      });
      return r;
    };
  }

  try {
    if (typeof window !== 'undefined' && window.RBSEconomy) {
      const api = {};
      Object.keys(window.RBSEconomy).forEach((k) => { api[k] = window.RBSEconomy[k]; });
      api.ownerFunding = ownerFunding;
      api.chairCeiling = chairCeiling;
      api.chairBudget = chairBudget;
      api.typicalBudget = typicalBudget;
      api.typicalCap = typicalCap;
      api.baseRevenue = baseRevenue;
      api.structuralRevenue = structuralRevenue;
      window.RBSEconomy = Object.freeze(api);
    }
  } catch (error) { /* no window */ }
}());

/* =====================================================================
   ECONOMY PHASE FOUR — how a transfer is actually paid for
   ---------------------------------------------------------------------
   Every transfer in the game was cash on the day: the full fee left the
   buyer's bank and budget in one movement and arrived in the seller's in
   the same movement. Almost no real transfer works like that.

   INSTALMENTS. A fee of any size is paid over the length of the
   contract, usually in two to five annual payments. It is why a club
   with £30M of budget can buy a £60M player, and why a club that has
   done that for three summers running has no budget at all despite
   having sold nobody. Both halves of that are the mechanic.

   Guarded so it cannot become free money: what you still owe may not
   exceed one and a half times your annual transfer budget, which is
   roughly the covenant a real board would impose, and the first payment
   still has to be affordable today.

   SELL-ON CLAUSES. A selling club that suspects it is letting a good one
   go keeps a share of the next sale. When you buy from a bigger club it
   will often want one, and when you sell that player at a profit years
   later the cheque goes out — which is the single most-forgotten line in
   football accounts.

   AGENT FEES. Around ten per cent of a deal, paid on completion, out of
   cash rather than the transfer budget. On a free transfer there is no
   fee to take a percentage of, so the agent takes a signing fee instead,
   which is why free transfers are not free.

   ADD-ONS. Appearance-triggered money, paid in stages as the player
   actually plays. Small, but it is the reason a fee reported at £15M is
   "£12M rising to £15M".
   ===================================================================== */

(function economyTransfers() {
  'use strict';

  const has = (fn) => typeof fn === 'function';

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[economy: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  function ledger() {
    if (!G.fin) G.fin = {};
    if (!Array.isArray(G.fin.owed)) G.fin.owed = [];
    if (!Array.isArray(G.fin.due)) G.fin.due = [];
    return G.fin;
  }

  function outstanding() {
    return ledger().owed.reduce((s, x) => s + (x.per || 0) * (x.left || 0), 0);
  }

  function receivable() {
    return ledger().due.reduce((s, x) => s + (x.per || 0) * (x.left || 0), 0);
  }

  /* Over how many years. Small fees are paid up front because the
     paperwork is not worth it; a club record is spread as far as the
     contract runs. */
  function instalmentYears(fee) {
    if (fee >= 2e7) return 4;
    if (fee >= 5e6) return 3;
    if (fee >= 3e5) return 2;
    return 1;
  }

  function agentFee(fee, weeklyWage) {
    const v = fee > 0 ? fee * 0.10 : (weeklyWage || 0) * 8;
    const step = v >= 1e6 ? 5e4 : v >= 1e5 ? 1e4 : v >= 1e4 ? 500 : 50;
    return Math.max(0, Math.round(v / step) * step);
  }

  /* ---------------------------------------------------------------
     BUYING
     --------------------------------------------------------------- */
  if (has(completeSigning)) {
    const previousSign = completeSigning;
    completeSigning = function completeSigningStaged(p, fee, t) {
      const seller = G.clubs[p.club];
      const sellerIx = seller ? seller.i : -1;
      const r = previousSign.apply(this, arguments);
      guard('transfer.buy', () => {
        const my = G.clubs[G.my];
        const f = Math.round(fee || 0);
        const agent = agentFee(f, (t && t.wage) || p.wage);
        if (agent > 0) my.bank -= agent;

        /* the seller may want a share of the next sale */
        if (f >= 25e4 && seller && Math.random() < 0.45) {
          p.sellOn = { club: sellerIx, pct: [10, 15, 20, 25][Math.floor(Math.random() * 4)], paid: f };
        } else if (f > 0) {
          p.sellOn = null;
          p.boughtFor = f;
        }
        if (f > 0) p.boughtFor = f;

        if (f > 0) {
          const years = instalmentYears(f);
          if (years > 1) {
            const per = Math.round(f / years);
            /* the base took the lot; give back everything not due today */
            const deferred = f - per;
            my.budget += deferred;
            my.bank += deferred;
            if (seller) { seller.bank -= deferred; seller.budget -= Math.round(deferred * 0.75); }
            ledger().owed.push({ to: sellerIx, per, left: years - 1, who: p.name, total: f });
          }
        }

        const L = ledger();
        const lines = [];
        if (f > 0 && instalmentYears(f) > 1) {
          const years = instalmentYears(f);
          lines.push(`Structured over <b>${years} years</b> at <b>${fmtM(Math.round(f / years))}</b> a year — ` +
            `<b>${fmtM(Math.round(f / years))}</b> paid now.`);
        }
        if (agent > 0) lines.push(`Agent's fee of <b>${fmtM(agent)}</b> settled in cash.`);
        if (p.sellOn) lines.push(`${esc(G.clubs[p.sellOn.club].short)} keep a <b>${p.sellOn.pct}%</b> sell-on clause.`);
        if (L.owed.length) lines.push(`<span class="xs faint">Total still owed on past transfers: <b>${fmtM(outstanding())}</b>.</span>`);
        if (lines.length) {
          mail('transfer', `📄 ${p.name}: how the deal is paid`, lines.join('<br><br>'));
        }
      });
      return r;
    };
  }

  /* You cannot mortgage the club to nothing. The first payment has to be
     affordable now, and the running total owed is capped against the
     budget the board actually allocates. */
  if (typeof ACTIONS !== 'undefined' && typeof ACTIONS.submitBid === 'function') {
    const previousBid = ACTIONS.submitBid;
    ACTIONS.submitBid = function submitBidLeveraged() {
      const stop = guard('transfer.leverage', () => {
        const fee = Math.round(+(($('#bidFee') || {}).value) || 0);
        if (fee <= 0) return false;
        const my = G.clubs[G.my];
        const owedAfter = outstanding() + fee - Math.round(fee / instalmentYears(fee));
        const ceiling = Math.round((my.budget + outstanding()) * 1.5);
        if (owedAfter <= ceiling) return false;
        toast(`The board will not carry more transfer debt — ${fmtM(outstanding())} is already owed`);
        return true;
      }, false);
      if (stop) return undefined;
      return previousBid.apply(this, arguments);
    };
  }

  /* ---------------------------------------------------------------
     SELLING
     --------------------------------------------------------------- */
  if (typeof ACTIONS !== 'undefined' && typeof ACTIONS.offerAccept === 'function') {
    const previousAccept = ACTIONS.offerAccept;
    ACTIONS.offerAccept = function offerAcceptStaged(el) {
      const before = guard('transfer.sell.pre', () => {
        const o = has(offerById) ? offerById(el.dataset.arg) : null;
        if (!o) return null;
        const p = playerById(o.pid);
        return p ? { fee: o.fee, buyer: o.buyer, sellOn: p.sellOn, name: p.name, boughtFor: p.boughtFor || 0 } : null;
      }, null);
      const r = previousAccept.apply(this, arguments);
      guard('transfer.sell', () => {
        if (!before) return;
        const my = G.clubs[G.my];
        const f = Math.round(before.fee || 0);
        const lines = [];

        /* the club you bought him from takes its share of the profit */
        if (before.sellOn && before.sellOn.pct) {
          const profit = Math.max(0, f - (before.sellOn.paid || before.boughtFor || 0));
          const cut = Math.round(profit * before.sellOn.pct / 100);
          if (cut > 0) {
            my.bank -= cut;
            my.budget = Math.max(0, my.budget - cut);
            const owner = G.clubs[before.sellOn.club];
            if (owner) { owner.bank += cut; owner.budget += Math.round(cut * 0.75); }
            lines.push(`<b>${esc(owner ? owner.short : 'The selling club')}</b> take <b>${fmtM(cut)}</b> ` +
              `under their ${before.sellOn.pct}% sell-on clause.`);
          }
        }

        /* and the buyer pays you the way you pay everybody else */
        const years = instalmentYears(f);
        if (years > 1) {
          const per = Math.round(f / years);
          const deferred = f - per;
          my.budget = Math.max(0, my.budget - deferred);
          my.bank -= deferred;
          const buyer = G.clubs[before.buyer];
          if (buyer) buyer.bank += deferred;
          ledger().due.push({ from: before.buyer, per, left: years - 1, who: before.name, total: f });
          lines.push(`The fee is structured over <b>${years} years</b> — <b>${fmtM(per)}</b> received now, ` +
            `<b>${fmtM(deferred)}</b> to follow.`);
        }
        if (lines.length) mail('transfer', `📄 ${before.name}: how the fee arrives`, lines.join('<br><br>'));
      });
      return r;
    };
  }

  /* ---------------------------------------------------------------
     AND EVERY SUMMER, THE CHEQUES GO OUT AND COME IN
     --------------------------------------------------------------- */
  if (has(endSeason)) {
    const previousEnd = endSeason;
    endSeason = function endSeasonInstalments() {
      const r = previousEnd.apply(this, arguments);
      guard('transfer.settle', () => {
        const L = ledger();
        const my = G.clubs[G.my];
        let paid = 0;
        let got = 0;
        L.owed.forEach((x) => {
          if (!(x.left > 0)) return;
          my.bank -= x.per; my.budget = Math.max(0, my.budget - x.per);
          const to = G.clubs[x.to];
          if (to) { to.bank += x.per; to.budget += Math.round(x.per * 0.75); }
          x.left -= 1; paid += x.per;
        });
        L.due.forEach((x) => {
          if (!(x.left > 0)) return;
          my.bank += x.per; my.budget += x.per;
          const from = G.clubs[x.from];
          if (from) from.bank -= x.per;
          x.left -= 1; got += x.per;
        });
        L.owed = L.owed.filter((x) => x.left > 0);
        L.due = L.due.filter((x) => x.left > 0);
        if (paid || got) {
          mail('transfer', '📄 Transfer instalments settled',
            (paid ? `<b>${fmtM(paid)}</b> has gone out in instalments on players already signed.` : '') +
            (paid && got ? '<br><br>' : '') +
            (got ? `<b>${fmtM(got)}</b> has come in on players already sold.` : '') +
            `<br><br><span class="xs faint">Still owed: <b>${fmtM(outstanding())}</b> · still due to you: <b>${fmtM(receivable())}</b>.</span>`);
        }
      });
      return r;
    };
  }

  /* it belongs on the finances screen, because it is money you have
     already committed and cannot spend twice */
  if (has(vFinances)) {
    const prevFin = vFinances;
    vFinances = function vFinancesInstalments() {
      let h = prevFin.apply(this, arguments);
      guard('screen.instalments', () => {
        const owe = outstanding();
        const due = receivable();
        if (!owe && !due) return;
        const card = '<div class="card tight" style="margin-bottom:12px">' +
          '<div class="chip-lbl" style="margin-top:0">📄 Transfer instalments</div>' +
          (owe ? '<div class="spread" style="padding:4px 2px"><span class="small">Still owed on players signed</span>' +
            '<b class="num small" style="color:var(--danger)">' + fmtM(owe) + '</b></div>' : '') +
          (due ? '<div class="spread" style="padding:4px 2px"><span class="small">Still due on players sold</span>' +
            '<b class="num small" style="color:var(--green)">' + fmtM(due) + '</b></div>' : '') +
          '<div class="xs faint" style="padding:4px 2px 0;line-height:1.5">Paid and received each summer. ' +
          'Money already committed cannot be spent twice.</div></div>';
        const anchor = '<div class="sec"><div class="t">Annual income</div>';
        h = h.indexOf(anchor) >= 0 ? h.replace(anchor, card + anchor) : card + h;
      });
      return h;
    };
  }

  try {
    if (typeof window !== 'undefined' && window.RBSEconomy) {
      const api = {};
      Object.keys(window.RBSEconomy).forEach((k) => { api[k] = window.RBSEconomy[k]; });
      api.instalmentYears = instalmentYears;
      api.agentFee = agentFee;
      api.outstanding = outstanding;
      api.receivable = receivable;
      window.RBSEconomy = Object.freeze(api);
    }
  } catch (error) { /* no window */ }
}());

/* =====================================================================
   WHAT THE CHAIRMAN ACTUALLY PUTS IN
   ---------------------------------------------------------------------
   A club you build starts in the National League with no players, and
   the chairman's money is the only thing that decides how fast you can
   get out of it. Measured against what you have to beat and what the
   free-agent market will sell you — the market is deep, 238 players up
   to eighty rated, and open to anybody, so the binding constraint on a
   new club is the wage ceiling and not its reputation:

     ceiling      per player in a 20-man squad   squad you can field
       £22,000              £1,100                  average 43.4
       £90,000              £4,500                  average 52.1
       £180,000             £9,000                  average 56.0
       £400,000             £20,000                 average 62.3

   and what each division is:

     National League 41.8 · League Two 47.7 · League One 53.2
     Championship 63.5 · Premier League 76.9

   At £22,000 a week you assemble a 43.4 squad to beat a 41.8 division.
   That is a coin toss, not a project, and it is why climbing took a
   decade. The three chairmen are now anchored on what a League One club
   actually has — £993,000 of budget and £142,000 a week of ceiling —
   so the tightest of them fields a side that walks the National League
   and the most generous fields one that could hold its own in the
   Championship on day one.

   It stays honest at the top because the owner's contribution is an
   amount, not a multiple: it is transformative in the National League,
   useful in League One, and by the Premier League the club's own income
   has swallowed it.
   ===================================================================== */

(function economyChairmanScale() {
  'use strict';
  try {
    if (typeof CC_CHAIRS === 'undefined') return;
    const set = (id, o) => {
      const c = CC_CHAIRS.filter((x) => x.id === id)[0];
      if (c) Object.keys(o).forEach((k) => { c[k] = o[k]; });
    };

    /* Sized on what actually wins a division rather than on a round
       number. The wage cap below the Championship is a share of
       turnover, so a ceiling has to be underwritten by an owner putting
       in enough turnover to make it legal — £600,000 a week in the
       fifth tier would need £48M of it, which is beyond even a
       heavily-bankrolled non-league club. These land between £6M and
       £19M a year of owner money, which is Wrexham territory, and they
       buy squads of roughly 52, 55 and 58 against a National League of
       41.8, a League Two of 47.7 and a League One of 53.2. */
    set('gen', {
      budget: 9e6, bank: 45e5, wage: 26e4, patience: 74,
      who: 'a hedge fund founder who watched this club from the terraces as a boy and has just had a very good decade',
      blurb: 'A squad that would finish mid-table in League One, in the fifth tier. Three divisions in three years is the plan.',
      warn: 'He is not funding a project. He wants promotions, and he wants the first one this season.',
      target: 1,
    });
    set('sen', {
      budget: 35e5, bank: 18e5, wage: 15e4, patience: 68,
      who: 'a supporters’ trust that sold its stake in the ground to a member who never wanted it back',
      blurb: 'A League One wage bill and better, in the National League. Enough to go up at the first attempt and keep going.',
      warn: 'They want promotion and they want the books to balance while it happens.',
      target: 2,
    });
    set('tig', {
      budget: 125e4, bank: 7e5, wage: 9e4, patience: 60,
      who: 'a local haulage family who have quietly underwritten this club for thirty years',
      blurb: 'A League One transfer budget in the fifth tier — the smallest of the three, and still more than anyone you will play this season.',
      warn: 'They will not give you more. What you have is what the climb has to be built on.',
      target: 3,
    });
  } catch (error) { /* the built-club module is not present */ }
}());

/* =====================================================================
   THE BUDGET SLIDER, AND THE WAGE BILL IT IS SUPPOSED TO DESCRIBE
   ---------------------------------------------------------------------
   Reported from a real save, with two screens that contradicted each
   other. The squad screen said

       WAGE BILL   £106K/w of £72K/w        (red, over)

   and the transfers screen, at the same moment, said

       £183/w  WAGE ROOM LEFT               (green, fine)

   Both are computed from the same two numbers. The squad screen divides
   by the ceiling; the transfers screen divides by the ceiling plus
   eighteen per cent, which is the overdraft the signing checks quietly
   allow. One of them had to go, and it is the hidden one: the ceiling is
   the ceiling, room is what is left of it, and if the board will tolerate
   an overdraft it should say so rather than hide it in a multiplier.

   THE SLIDER ITSELF. Its range is `-maxToWage` to `+maxToFee`, and

       maxToFee = (wageCap - max(wageLo, bill)) x 52   floored at zero

   so the moment the wage bill passes the ceiling, maxToFee is zero, the
   range becomes one-way, and the neutral value of 0 renders the handle
   hard against the right-hand end — directly underneath the words "more
   transfers →". It looks like you have pushed everything into transfers.
   You have not: you cannot move anything into transfers at all, and
   every further drag takes another lump out of the transfer budget and
   puts it into wages. The reported save had shifted £808,000 that way.

   The commit had no guards of its own either — it trusted the range
   attributes, which are only recomputed on render.

   AND HOW THE BILL GOT ABOVE THE CEILING. Contract talks check it, free
   agents check it, deadline day checks it. Loans do not: both loan paths
   test the fee against the transfer budget and never look at wages, so a
   loan signing can push the bill anywhere. That is the actual hole, and
   it is plugged here.
   ===================================================================== */

(function economyBudgetSlider() {
  'use strict';

  const has = (fn) => typeof fn === 'function';
  const WEEKS = (typeof WEEKS_IN_YEAR === 'number') ? WEEKS_IN_YEAR : 52;
  const OVERDRAFT = 1.18;          /* what the signing checks already allow */

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[economy: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  /* The board's band cannot be trusted as given. `budLimits` computes
     `wageLo` as the wage bill plus 2% and `wageHi` as the ceiling plus
     everything the transfer budget could buy, and when the bill is
     further above the ceiling than the whole budget could close, the
     low bound ends up ABOVE the high one. The reported save was exactly
     that: wageLo £108,119 against wageHi £95,077. Any range built on an
     inverted band is nonsense, so the two constraints that are always
     true are derived here and the board's band is applied only where it
     is coherent.

     The two that are always true: you cannot spend a transfer budget you
     do not have, and you cannot cut the ceiling below the people already
     on it. Raising the ceiling is never blocked — when you are over it,
     raising it is the way out. */
  function limits() {
    const c = G.clubs[G.my];
    const bill = has(squadWage) ? squadWage(c) : 0;
    const billFloor = Math.round(bill * 1.02);
    let L = { feeLo: 0, feeHi: Infinity, wageLo: 0, wageHi: Infinity };
    try {
      if (has(budLimits)) {
        const b = budLimits(c);
        const coherent = b && b.wageLo <= b.wageHi && b.feeLo <= b.feeHi;
        if (coherent) L = b;
        else L = { feeLo: 0, feeHi: Math.max(b.feeHi, c.budget), wageLo: 0, wageHi: Infinity };
      }
    } catch (error) { /* use the always-true bounds */ }

    const capMax = Math.max(c.wageCap, L.wageHi === Infinity ? Infinity : L.wageHi);
    const capMin = Math.max(billFloor, Math.min(L.wageLo, c.wageCap));
    const budLo = Math.max(0, L.feeLo);
    const budHi = L.feeHi === Infinity ? Infinity : L.feeHi;

    const toWage = Math.max(0, Math.min(
      c.budget - budLo,
      capMax === Infinity ? c.budget : (capMax - c.wageCap) * WEEKS,
    ));
    const toFee = Math.max(0, Math.min(
      budHi === Infinity ? Infinity : budHi - c.budget,
      (c.wageCap - capMin) * WEEKS,
    ));
    return { c, bill, billFloor, budLo, budHi, capMax, capMin, toWage, toFee, over: bill - c.wageCap };
  }

  /* --------------------------------------------------------------
     THE PANEL
     -------------------------------------------------------------- */
  if (has(vTransferBudget)) {
    vTransferBudget = function vTransferBudgetHonest() {
      return guard('slider', () => {
        const { c, bill, toWage, toFee, over } = limits();
        const room = c.wageCap - bill;
        const moved = c.budget - (has(budOrigin) ? budOrigin(c).budget : c.budget);
        const step = Math.max(1000, Math.round(Math.max(toWage, toFee) / 40 / 1000) * 1000);

        let h = '<div class="budgetbar">' +
          '<div class="bb"><div class="bv" id="bbFee" style="color:var(--gold)">' + fmtM(c.budget) + '</div>' +
          '<div class="bl">Transfer budget</div></div>' +
          '<div class="bb"><div class="bv" id="bbWage" style="color:' + (room >= 0 ? 'var(--green)' : 'var(--danger)') + '">' +
          (room >= 0 ? fmtW(room) : '-' + fmtW(-room)) + '</div>' +
          '<div class="bl">' + (room >= 0 ? 'Wage room left' : 'Over the ceiling') + '</div></div></div>';

        h += '<div class="card tight" style="padding:12px 13px">' +
          '<div class="spread" style="margin-bottom:9px">' +
          '<span class="chip-lbl" style="margin:0">Rebalance the budget</span>' +
          (moved ? '<button class="chip" data-action="budReset">↺ Reset</button>' : '') + '</div>';

        if (toWage <= 0 && toFee <= 0) {
          h += '<div class="xs" style="color:var(--amber);line-height:1.6">The board will not move the split any ' +
            'further in either direction. This is the plan you have already agreed with them.</div>';
        } else {
          h += '<input type="range" id="budSplit" min="' + Math.round(-toWage) + '" max="' + Math.round(toFee) +
            '" value="0" step="' + step + '" style="width:100%;accent-color:var(--gold)">' +
            '<div class="spread xs faint" style="margin-top:5px">' +
            '<span>' + (toWage > 0 ? '← ' + fmtM(toWage) + ' to wages' : '← nothing to move') + '</span>' +
            '<span id="budNote">drag to move money</span>' +
            '<span>' + (toFee > 0 ? fmtM(toFee) + ' to transfers →' : 'nothing to move →') + '</span></div>';
        }

        h += '<div class="xs faint" style="line-height:1.6;margin-top:9px">' +
          'A wage ceiling is weekly and a fee is a lump, so a year is the bridge: ' +
          fmtM(WEEKS * 1e5) + ' of transfer money is worth ' + fmtW(1e5) + ' a week. ' +
          'Paying <b>' + fmtW(bill) + '</b> against a ceiling of <b>' + fmtW(c.wageCap) + '</b>.</div>';

        if (over > 0) {
          h += '<div class="xs" style="margin-top:8px;color:var(--danger);line-height:1.6">' +
            '⚠️ You are <b>' + fmtW(over) + ' a week</b> over the ceiling, so no money can move back to transfers ' +
            'until the wage bill comes down — sell somebody, or let a contract run out. The board tolerate up to ' +
            '<b>' + fmtW(Math.round(c.wageCap * OVERDRAFT)) + '</b> before they stop you signing anyone at all.</div>';
        } else if (toFee <= 0 && toWage > 0) {
          h += '<div class="xs" style="margin-top:8px;color:var(--amber);line-height:1.6">' +
            'Moving money the other way would put the ceiling below the wages you already pay, so this slider only ' +
            'goes one way for now.</div>';
        }

        if (moved) {
          h += '<div class="xs" style="margin-top:8px;color:' + (moved > 0 ? 'var(--green)' : 'var(--gold)') + '">' +
            'Shifted ' + (moved > 0 ? '+' : '−') + fmtM(Math.abs(moved)) + ' against the board’s original split. ' +
            (moved > 0 ? 'More to spend on fees, less on wages.' : 'More to spend on wages, less on fees.') + '</div>';
        }
        return h + '</div>';
      }, '');
    };
  }

  /* --------------------------------------------------------------
     AND IT COMMITS WHAT IT SHOWS
     -------------------------------------------------------------- */
  (function wire() {
    const preview = (v) => guard('slider.preview', () => {
      const { c, bill } = limits();
      const fee = c.budget + v;
      const cap = c.wageCap - Math.round(v / WEEKS);
      const room = cap - bill;
      const f = document.getElementById('bbFee');
      const w = document.getElementById('bbWage');
      const n = document.getElementById('budNote');
      if (f) f.textContent = fmtM(fee);
      if (w) { w.textContent = room >= 0 ? fmtW(room) : '-' + fmtW(-room); w.style.color = room >= 0 ? 'var(--green)' : 'var(--danger)'; }
      if (n) {
        n.textContent = v === 0 ? 'drag to move money'
          : v > 0 ? '+' + fmtM(v) + ' to transfers, −' + fmtW(Math.round(v / WEEKS)) + '/w ceiling'
            : '+' + fmtW(Math.round(-v / WEEKS)) + '/w ceiling, −' + fmtM(-v) + ' to spend';
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'budSplit') preview(+e.target.value);
    });

    document.addEventListener('change', (e) => {
      if (!e.target || e.target.id !== 'budSplit') return;
      guard('slider.commit', () => {
        const v = +e.target.value;
        if (!v) return;
        const { c, billFloor, budLo, budHi, capMax, toWage, toFee } = limits();
        /* the range attributes are only as fresh as the last render, so
           every limit is checked again here rather than trusted */
        const amount = Math.max(-toWage, Math.min(toFee, v));
        if (!amount) { render(); return; }
        const perWeek = Math.round(amount / WEEKS);
        const newBudget = c.budget + amount;
        const newCap = c.wageCap - perWeek;
        if (newBudget < budLo || newBudget > budHi) { toast('The board will not move the split that far.'); render(); return; }
        /* the ceiling may always go up — when you are over it, that is the
           way out. It may only come down as far as the wages you pay. */
        if (amount > 0 && newCap < billFloor) { toast('That would put the ceiling below the wages you already pay.'); render(); return; }
        if (amount < 0 && capMax !== Infinity && newCap > capMax) { toast('The board will not raise the ceiling any further.'); render(); return; }
        c.budget = newBudget;
        c.wageCap = newCap;
        try { sfx('tap'); } catch (error) { /* no audio */ }
        toast(amount > 0 ? `💷 ${fmtM(amount)} moved to the transfer budget`
          : `💷 ${fmtW(-perWeek)} a week added to the wage ceiling`);
        render();
      });
    });
  }());

  /* --------------------------------------------------------------
     THE HOLE THE BILL CAME THROUGH
     --------------------------------------------------------------
     Contract talks, free agents and deadline day all test the wage bill
     against the ceiling. Neither loan path does — they check the fee
     against the transfer budget and stop there — so a loan could put the
     bill anywhere, and in the reported save it was 147% of the ceiling.
     -------------------------------------------------------------- */
  ['loanAskDo', 'loanInDo'].forEach((name) => {
    if (typeof ACTIONS === 'undefined' || typeof ACTIONS[name] !== 'function') return;
    const previous = ACTIONS[name];
    ACTIONS[name] = function loanWageChecked(el) {
      const stop = guard('loan.wages', () => {
        const c = G.clubs[G.my];
        let weekly = 0;
        if (name === 'loanInDo') {
          const r = (G._loanList || [])[+el.dataset.v];
          if (r) weekly = Math.round(r.p.wage * (100 - r.share) / 100);
        } else {
          const p = playerById(el.dataset.id);
          if (p && has(loanTerms)) weekly = (loanTerms(p) || {}).weekly || 0;
        }
        if (weekly <= 0) return false;
        const bill = has(squadWage) ? squadWage(c) : 0;
        if (bill + weekly <= c.wageCap * OVERDRAFT) return false;
        toast(`The wage bill will not take it — ${fmtW(bill + weekly)} against a ${fmtW(c.wageCap)} ceiling`);
        return true;
      }, false);
      if (stop) return undefined;
      return previous.apply(this, arguments);
    };
  });

  /* -------------------------------------------------------------------
     12. THE SPONSORSHIP BELONGS TO THE CLUB, NOT TO THE SAVE
     -------------------------------------------------------------------
     Found by tracing every change to a club's bank balance over a season.
     Start a career at Worthing — National League, £348,000 in the bank,
     reputation 2,050 — and the club draws

         £160,300,000 a year in sponsorship
         £13,358,333 a month, against £795,516 it could actually sign

     which is Manchester United's four contracts, verbatim, 202 times what
     the club is worth. Northampton Town went from £1.5M to £174M in one
     League Two season on it.

     The cause is the career-start path, not an exotic one. `newGame(key)`
     — which is how you pick a club and how you start one you have built —
     runs `newGame(0)` first, so the world is built around Manchester
     United and `ensureCommercial()` writes United's deals; only then does
     it `takeOverClub()` you into the club you actually chose. Nothing
     clears `G.deals`, and `ensureCommercial()` only ever fills slots that
     are empty, so the contracts are never revalued. They lapse after one
     to three seasons and reprice correctly then — long after the save has
     been decided.

     The same hole runs the other way and matters just as much for a club
     climbing the pyramid: promotion and relegation never touch the deals
     either, so going up earns you nothing commercially until a contract
     happens to expire.

     Three things here. The contracts are rewritten to the club whenever
     the club changes. They are rebased when the division changes, with a
     relegation clause so a contract does not collapse the moment you go
     down. And `commercialFor` carries a bound, so no path I have not
     found can leak two hundred times a club's worth again.
     ------------------------------------------------------------------- */
  function slotKeys() {
    return (typeof SPONSOR_SLOTS === 'undefined') ? [] : Object.keys(SPONSOR_SLOTS);
  }

  /* what this club could sign today, across every slot it has sold */
  function marketCommercial() {
    return guard('market', () => {
      if (!has(dealValue)) return 0;
      let total = 0;
      slotKeys().forEach((k) => {
        if (k === 'stadium') return;              /* never sold by default */
        total += dealValue(k) || 0;
      });
      return Math.round(total);
    }, 0);
  }

  /* the raw sum of whatever contracts are on the books, read without going
     back through the bound below — which calls this, and would otherwise
     recurse the moment it found a total worth rewriting */
  function dealTotal() {
    let total = 0;
    Object.keys(G.deals || {}).forEach((k) => { if (G.deals[k]) total += G.deals[k].annual || 0; });
    return Math.round(total);
  }

  function rewriteDeals(why) {
    return guard('rewrite', () => {
      if (!has(ensureCommercial)) return null;
      const before = dealTotal();
      G.deals = null;
      ensureCommercial();
      const after = dealTotal();
      G.finDivSeen = myDiv();
      return { before, after, why };
    }, null);
  }

  /* changing club changes your commercial partners */
  if (has(takeOverClub)) {
    const previousTakeOver = takeOverClub;
    takeOverClub = function takeOverClubOwnDeals(idx) {
      const moved = idx != null && idx !== G.my && (G.clubs || [])[idx];
      const r = previousTakeOver.apply(this, arguments);
      if (moved) guard('takeover', () => { rewriteDeals('new club'); });
      return r;
    };
  }

  /* and changing division changes what they are worth. Real contracts run
     their term, so a relegated club keeps the better part of its deal to
     the end of it; a promoted club is repriced upward at once, which is
     what a promotion clause is for. */
  if (has(endSeason)) {
    const previousEnd = endSeason;
    endSeason = function endSeasonRebaseDeals() {
      const wasDiv = guard('div-before', () => myDiv(), null);
      const r = previousEnd.apply(this, arguments);
      guard('rebase', () => {
        const nowDiv = myDiv();
        if (!nowDiv || nowDiv === wasDiv) return;
        if (!G.deals || !has(dealValue)) return;
        const wentUp = (typeof DIV_ORDER !== 'undefined' && DIV_ORDER.indexOf)
          ? DIV_ORDER.indexOf(nowDiv) < DIV_ORDER.indexOf(wasDiv)
          : true;
        let before = 0;
        let after = 0;
        slotKeys().forEach((k) => {
          const d = G.deals[k];
          if (!d) return;
          const market = dealValue(k) || 0;
          before += d.annual || 0;
          /* up: repriced at once. down: the contract runs on, worth no less
             than 65% of what it was, which is the clause every real deal has */
          d.annual = wentUp
            ? Math.max(d.annual || 0, market)
            : Math.max(market, Math.round((d.annual || 0) * 0.65));
          after += d.annual;
        });
        if (!before || before === after) return;
        mail('board', wentUp ? '📈 The sponsors have moved on the numbers' : '📉 Sponsorship revalued',
          `Promotion and relegation clauses have been triggered across the club's commercial deals. `
          + `Annual commercial income moves from <b>${fmtM(before)}</b> to <b>${fmtM(after)}</b> `
          + `in ${esc((typeof DIV_NAMES !== 'undefined' && DIV_NAMES[nowDiv]) || 'the new division')}.`);
      });
      return r;
    };
  }

  /* Belt and braces. If any path ever hands this club somebody else's
     contracts again, it cannot be worth more than a club of this size
     could plausibly sign — set generously, at two and a half times the
     market across every slot, so a good negotiation is never clipped. */
  if (has(commercialIncome)) {
    const previousCommercial = commercialIncome;
    let bounding = false;
    commercialIncome = function commercialIncomeBounded() {
      const raw = previousCommercial.apply(this, arguments) || 0;
      if (bounding) return raw;
      return guard('bound', () => {
        const ceiling = marketCommercial() * 2.5;
        if (!(ceiling > 0) || raw <= ceiling) return raw;
        /* rewrite rather than merely clip, so the Finances screen, the deal
           list and the money all agree about what the club is earning */
        bounding = true;
        try {
          const fixed = rewriteDeals('bound');
          return fixed ? fixed.after : Math.round(ceiling);
        } finally { bounding = false; }
      }, raw);
    };
  }

  try {
    window.RBSCommercial = Object.freeze({ marketCommercial, rewriteDeals });
  } catch (error) { /* no window */ }
}());
