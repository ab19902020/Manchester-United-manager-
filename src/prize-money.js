/* global G, CUP_DEFS, fmtM, esc, ordinal */
/* global mail:writable, progressCups:writable, euroInit:writable,
          seasonRevenue:writable */

/* =====================================================================
   PRIZE MONEY — winning things pays, and the money reaches the budget
   ---------------------------------------------------------------------
   Three separate holes, all measured in a live career with Manchester
   United in the Champions League.

   1. THE LEAGUE PHASE PAID NOTHING AT ALL.

      The eight-match league phase is the bulk of a European season and
      the game credited nothing for any of it. Forcing a run of
      W D L W D L W D — three wins and three draws against Europe's best
      — the bank moved by exactly £0 across all eight matchdays. The only
      European money in the whole phase was an £11M lump when it closed.

      The data to fix it was already sitting in the file. `EURO_DEFS`
      carries `pot:[a,b]` per competition, and `b` is, to the pound, the
      real UEFA per-win fee: £2.1M in the Champions League, £400K in the
      Europa League. Nothing read it. `CUP_DEFS[key].prize[0]` is derived
      from it as `pot[1] * 3`, so the per-win fee can be recovered from
      the competition itself without this file naming a single
      competition or hardcoding a figure — which matters, because the
      leagues and the clubs in them are being rebuilt elsewhere.

      Against the published 2024/25 UEFA distribution:

          win            £2.1M model   €2.10M real
          draw           £700K model   €0.70M real   (a third of a win)
          per placing    £275K model   €0.275M real

   2. NOBODY WAS PAID FOR WHERE THEY FINISHED IN THAT TABLE.

      UEFA pays a ranking bonus of one share per place: thirty-six shares
      for finishing first of thirty-six, one share for finishing last.
      First in the league phase is worth £9.9M on top of the results
      themselves. The game paid a flat £11M to the top eight and nothing
      to anybody else, so 9th and 36th were financially identical.

   3. NONE OF IT REACHED THE TRANSFER BUDGET.

      Every cup and European payment in the game credits `bank` and only
      `bank`. The end-of-season merit payment credits both, and so does a
      pre-season tour fee. So a European run filled the accounts and gave
      the manager nothing to spend, which is the opposite of what a
      European run is for. Every prize this file can see now moves the
      budget as well, including the ones paid by the original code — a
      wrapper watches the bank across `progressCups` and moves the same
      amount into the budget, so FA Cup and League Cup rounds, the
      knockout ladder and the winners' cheque are all covered without
      touching any of the code that pays them.

   WHAT IS DELIBERATELY NOT HERE. Prize money in this game has always
   been the manager's club alone; AI clubs are funded by the income model
   in `economy.js`, which knows nothing about Europe. Paying the AI too
   would move every club's spending power in a way that wants measuring
   across a decade first. Logged in AGENT-ONE.md rather than guessed at.
   ===================================================================== */

(function installPrizeMoney() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  function guard(label, fn, fallback) {
    try {
      return fn();
    } catch (error) {
      try { console.warn('[prize-money] ' + label, error); } catch (e) { /* no console */ }
      return fallback;
    }
  }

  /* A draw is worth a third of a win, in every UEFA competition and at
     every level of it. The ranking share is an eighth of that again. */
  const DRAW_SHARE = 1 / 3;
  const RANK_SHARE = 0.131;

  function me() {
    return (G.clubs || [])[G.my];
  }

  /* Prize money is club income and spending money at the same time: the
     accounts see it and so does the manager. This is the convention the
     merit payment and the tour fee already use. */
  function credit(amount) {
    const c = me();
    if (!c || !(amount > 0)) return 0;
    const paid = Math.round(amount);
    c.bank += paid;
    c.budget = Math.max(0, (c.budget || 0) + paid);
    banked(paid);
    return paid;
  }

  function mirrorToBudget(delta) {
    const c = me();
    if (!c || !(delta > 0)) return;
    const paid = Math.round(delta);
    c.budget = Math.max(0, (c.budget || 0) + paid);
    banked(paid);
  }

  /* Everything that passes through here is prize money by construction,
     so the running total is what the Finances screen should be adding to
     its broadcast line — otherwise a European run puts £100M in the bank
     that the accounts never mention. */
  function banked(amount) {
    ledger();
    G.prizePaid.total = Math.round((G.prizePaid.total || 0) + amount);
  }

  function bank() {
    const c = me();
    return c ? (c.bank || 0) : 0;
  }

  /* ---- what a competition pays -------------------------------------
     Read out of the competition rather than written down here, so a
     competition added later is priced correctly without an edit. */
  function feesFor(key) {
    const def = CUP_DEFS && CUP_DEFS[key];
    if (!def || !def.euro || !def.prize || !def.prize.length) return null;
    const win = Math.round(def.prize[0] / 3);
    if (!(win > 0)) return null;
    return { win, draw: Math.round(win * DRAW_SHARE), rank: Math.round(win * RANK_SHARE), def };
  }

  /* Reset by season, and by club: a manager sacked in March and hired
     down the road does not carry the old club's European money with him. */
  function ledger() {
    if (!G.prizePaid || G.prizePaid.season !== G.season || G.prizePaid.my !== G.my) {
      G.prizePaid = { season: G.season, my: G.my, done: {}, total: 0 };
    }
    return G.prizePaid.done;
  }

  function once(id, fn) {
    const book = ledger();
    if (book[id]) return false;
    book[id] = 1;
    fn();
    return true;
  }

  function say(type, title, body) {
    if (has(window.mail)) window.mail(type, title, body);
  }

  /* ---- 1. the eight matches ---------------------------------------- */
  function payLeaguePhaseResults() {
    guard('results', () => {
      const cups = G.cups || {};
      Object.keys(cups).forEach((key) => {
        const fees = feesFor(key);
        const cup = cups[key];
        if (!fees || !cup || !cup.ties) return;
        if ((cup.teams || []).indexOf(G.my) < 0) return;
        cup.ties.forEach((t) => {
          if (!t || !t.lg || !t.played) return;
          if (t.h !== G.my && t.a !== G.my) return;
          const home = t.h === G.my;
          const mine = home ? t.hs : t.as;
          const theirs = home ? t.as : t.hs;
          once(key + ':lg:' + t.r, () => {
            if (mine < theirs) return;                 /* a defeat pays nothing */
            const won = mine > theirs;
            const paid = credit(won ? fees.win : fees.draw);
            if (!paid) return;
            const opp = (G.clubs || [])[home ? t.a : t.h];
            const who = opp ? esc(opp.short || opp.name) : 'them';
            say('award', fees.def.icon + ' ' + fmtM(paid) + ' from the ' + fees.def.name,
              (won ? 'Beating <b>' + who + '</b>' : 'A point against <b>' + who + '</b>') +
              ' is worth <b>' + fmtM(paid) + '</b> in ' + (won ? 'win' : 'draw') +
              ' money, and it goes straight onto the transfer budget. ' +
              'Every match in the league phase pays, and where you finish in the ' +
              'table of thirty-six pays again on top.');
          });
        });
      });
    });
  }

  /* ---- 2. where you finished in the table of thirty-six ------------ */
  function payLeaguePhaseRanking() {
    guard('ranking', () => {
      if (!has(window.euroTable)) return;
      const cups = G.cups || {};
      Object.keys(cups).forEach((key) => {
        const fees = feesFor(key);
        const cup = cups[key];
        if (!fees || !cup || cup.phase === 'league') return;
        if ((cup.teams || []).indexOf(G.my) < 0) return;
        const rows = window.euroTable(key) || [];
        if (!rows.length) return;
        const ix = rows.findIndex((r) => r && r.i === G.my);
        if (ix < 0) return;
        const size = rows.length;
        const shares = size - ix;                      /* first of 36 earns 36 */
        once(key + ':rank', () => {
          const paid = credit(fees.rank * shares);
          if (!paid) return;
          say('award', fees.def.icon + ' League phase ranking money: ' + fmtM(paid),
            'You finished <b>' + ordinal(ix + 1) + ' of ' + size + '</b> in the ' +
            esc(fees.def.name) + ' league phase. UEFA pays a share for every club ' +
            'you finished above as well as one for being there — <b>' + shares +
            ' shares</b> at <b>' + fmtM(fees.rank) + '</b> each, <b>' + fmtM(paid) +
            '</b> in all, on the budget as well as in the bank.');
        });
      });
    });
  }

  /* ---- 3. the wrappers --------------------------------------------- */
  if (has(window.progressCups)) {
    const previousProgress = window.progressCups;
    window.progressCups = function progressCupsThatPay() {
      payLeaguePhaseResults();
      const before = bank();
      const out = previousProgress.apply(this, arguments);
      mirrorToBudget(bank() - before);                 /* rounds, ladder, winners */
      payLeaguePhaseRanking();
      return out;
    };
  }

  /* The participation fee is paid when the draw is made, outside
     `progressCups`, and the letter announcing it never said what any of
     it was worth. */
  if (has(window.euroInit)) {
    const previousEuroInit = window.euroInit;
    window.euroInit = function euroInitThatExplainsTheMoney(key, teams) {
      const before = bank();
      const out = previousEuroInit.apply(this, arguments);
      guard('euroInit', () => {
        const gained = bank() - before;
        if (!(gained > 0)) return;
        mirrorToBudget(gained);
        const fees = feesFor(key);
        if (!fees) return;
        const letter = (G.inbox || []).find((m) => m && /league phase draw/i.test(String(m.title || '')));
        if (!letter) return;
        letter.body = String(letter.body || '') +
          '<br><br><b>What it pays.</b> <b>' + fmtM(gained) + '</b> for taking part, already ' +
          'in the bank and on the budget. Then <b>' + fmtM(fees.win) + '</b> for every win and <b>' +
          fmtM(fees.draw) + '</b> for every draw, a share of <b>' + fmtM(fees.rank) +
          '</b> for every club you finish above in the table of thirty-six, and more again ' +
          'for every round of the knockout you survive.';
      });
      return out;
    };
  }

  /* ---- 4. and the accounts admit it happened ------------------------
     Cup and European money has never appeared in `seasonRevenue`, so the
     Finances screen showed a club that had won £100M in Europe exactly
     the same revenue as one that had not qualified. UEFA money is
     broadcast money, and the parachute layer above already puts its
     payments in the same bucket, so it goes on the broadcast line where
     the PSR position and every screen pick it up without being told. */
  function earnedThisSeason() {
    return guard('earned', () => {
      const book = G.prizePaid;
      if (!book || book.season !== G.season || book.my !== G.my) return 0;
      return Math.round(book.total || 0);
    }, 0);
  }

  if (has(window.seasonRevenue)) {
    const previousRevenue = window.seasonRevenue;
    window.seasonRevenue = function seasonRevenueWithPrizes() {
      const r = previousRevenue.apply(this, arguments);
      return guard('revenue', () => {
        const won = earnedThisSeason();
        if (!won || !r) return r;
        const out = {};
        Object.keys(r).forEach((k) => { out[k] = r[k]; });
        out.tv = (r.tv || 0) + won;
        out.total = (r.total || 0) + won;
        return out;
      }, r);
    };
  }

  try {
    window.RBSPrizeMoney = Object.freeze({ feesFor, earnedThisSeason, DRAW_SHARE, RANK_SHARE });
  } catch (error) { /* no window */ }
}());
