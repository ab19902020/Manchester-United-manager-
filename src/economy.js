/* global G, esc, clamp, fmtM, mail, squadWage, staffWage, divMembers, leaguePos,
          LEAGUES, commercialIncome, ensureCommercial, MU, ordinal, tableRows,
          fixCtx, DIV_ORDER, ACTIONS, playerById, toast, $, loanTerms */
/* global seasonRevenue:writable, seasonCosts:writable, monthlyIncome:writable,
          applyPostMatch:writable, endSeason:writable, vFinances:writable */

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
    if (L.tier !== 1) return { central: 4e6, merit: 4e5, ticket: 18, fill: 0.62, corp: 0.20, seat: 260, runs: 0.17 };
    const co = L.coef || 2;
    const central = co >= 5 ? 55e6 : co >= 4 ? 22e6 : co >= 3 ? 12e6 : co >= 2 ? 6e6 : 3e6;
    return { central, merit: Math.round(central * 0.03), ticket: co >= 5 ? 30 : co >= 4 ? 25 : co >= 3 ? 21 : 18,
      fill: 0.82, corp: co >= 4 ? 0.55 : 0.30, seat: co >= 4 ? 620 : 380, runs: 0.19 };
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
  function centralFor(c) {
    const f = divFinance(c.league);
    return Math.round(f.central + (f.grant || 0) * (1 - standing(c)));
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
     which has a £4,000 floor on it and no idea what division it is in:
     a National League club's six-man backroom costs £1.96M a year
     against an £816K playing budget. Nothing debits it — it is a
     projection line only — but it made the bottom of the pyramid look
     insolvent. Bounded here to a real share of the playing budget in
     both directions, and the underlying formula is flagged for Claude
     rather than rewritten, because staff pay belongs to the staff
     system. */
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
        me.bank += central + com;
        if (!G.fin) G.fin = {};
        G.fin.commercialYTD = (G.fin.commercialYTD || 0) + com;
        mail('info', 'Monthly income received',
          `Central distribution: <b>${fmtM(central)}</b> · Commercial and sponsorship: <b>${fmtM(com)}</b> ` +
          'have been added to the club accounts.' +
          `<br><br><span class="xs faint">Matchday income is paid on the day. Merit money for your final ` +
          `league position is paid at the end of the season.</span>`);
        /* and the rest of the world, so the pyramid does not go bust */
        (G.clubs || []).forEach((c) => {
          if (!c || c.i === G.my) return;
          const gate = Math.round(matchdayRevenue(c) / 12);
          c.bank = Math.round((c.bank || 0) + (centralFor(c) + commercialFor(c)) / 12 + gate);
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
