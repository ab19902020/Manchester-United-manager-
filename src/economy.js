/* global G, esc, clamp, fmtM, mail, squadWage, staffWage, divMembers, leaguePos,
          LEAGUES, commercialIncome, ensureCommercial, MU, ordinal, DIV_NAMES, tableRows,
          fixCtx */
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
