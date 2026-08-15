/* global G, ACTIONS, askPrice:writable, openBidSheet:writable,
          completeSigning:writable, vFinances:writable, seasonLabel, fmtM, esc */

/* =====================================================================
   HOW THE FEE IS PAID IS A DECISION, NOT A SIDE EFFECT
   ---------------------------------------------------------------------
   "in the transfer market, you pay instalments — twenty five percent
   upfront, and over the next three years you pay the next twenty five
   percent each year."

   Half of this already existed and it is worth saying where, because it
   is Agent One's and it is good: `src/economy.js` carries a real
   instalment ledger. `G.fin.owed` and `G.fin.due` hold what you owe and
   what you are owed, `endSeason` settles a year of both every summer and
   posts a letter about it, the finances screen shows the running totals,
   and the board refuses to let you carry more transfer debt than it
   thinks you can service. None of that is rebuilt here.

   What was missing is the manager. `instalmentYears(fee)` decided the
   structure from the size of the fee alone — over twenty million was
   four years, over five was three, over three hundred thousand was two —
   so a deal was spread or not spread according to a table, and you were
   told about it afterwards in the post. You could not choose to pay cash
   to get a deal done, and you could not choose to spread a fee you could
   not afford in one go. That is the interesting decision in a transfer
   and it was being made for you.

   ---------------------------------------------------------------------
   THE DECISION HAS TO COST SOMETHING, or it is not a decision.

   If spreading were free every manager would spread every fee, and the
   budget would stop meaning anything. In real football deferred money is
   discounted: a selling club would rather have thirty million today than
   forty over four years, and prices the difference in.

   So the selling club values a deferred offer at less than its face
   value, and asks for more to make up the difference — six per cent for
   every year you push the money back. Pay in full and you deal at the
   asking price. Pay over four years and the same deal costs eighteen per
   cent more in total, which is the price of not having the cash today.

   And the affordability test changes to match. The budget check used to
   demand the whole fee up front, which is exactly the thing instalments
   exist to avoid; on a spread deal you need this year's slice, and the
   rest is a commitment the board polices through the debt ceiling Agent
   One already built.

   ---------------------------------------------------------------------
   HOW IT ATTACHES WITHOUT FIGHTING ANY OF THAT

   `instalmentYears` is a closure inside economy.js and cannot be
   reached, so this does not try. The signing runs exactly as it does
   today — Agent One's wrapper takes the fee, refunds the deferred part
   and writes the ledger row — and then, outermost, the row is rewritten
   to the plan the manager actually chose, with the cash difference moved
   between the two clubs so the books still balance. One row in, one row
   out, and every other rule in that file still applies.
   ===================================================================== */

(function transferStructure() {
  /* what a year of waiting costs the buyer, per deferred year */
  const PREMIUM = 0.06;
  /* below this a fee is paperwork rather than a deal */
  const MIN_SPREAD = 5e5;
  const PLANS = [
    [1, 'In full now'],
    [2, 'Over 2 years'],
    [3, 'Over 3 years'],
    [4, 'Over 4 years'],
  ];

  const state = { scope: null };

  /* WHAT THE CLUBS WOULD HAVE AGREED ANYWAY, which is the baseline this
     sits on top of. economy.js already structures a fee by its size —
     over twenty million across four years, over five across three — and
     that is realistic: a club record is almost never paid in one go.

     The first cut of this module made cash the default and let the
     manager opt into spreading. That was wrong twice over. It quietly
     changed the economy for every club in the game, and it broke the
     contract economy.js states in its own test: "a quarter of a
     four-year deal leaves the transfer budget on the day" came back at
     the full thirty million. The manager's choice is an OVERRIDE of the
     normal structure, not a replacement for it. */
  function defaultYears(fee) {
    try {
      const api = window.RBSEconomy;
      if (api && typeof api.instalmentYears === 'function') return api.instalmentYears(fee);
    } catch (error) { /* fall through to the same table */ }
    if (fee >= 2e7) return 4;
    if (fee >= 5e6) return 3;
    if (fee >= 3e5) return 2;
    return 1;
  }

  /* the manager's explicit choice, or null when he has not made one */
  function chosenPlan(pid) {
    try {
      const raw = G.payPlan ? G.payPlan[pid] : null;
      if (!raw) return null;
      return Math.max(1, Math.min(4, Math.round(raw)));
    } catch (error) {
      return null;
    }
  }

  function planFor(pid, fee) {
    const picked = chosenPlan(pid);
    if (picked) return picked;
    return defaultYears(Math.round(fee || 0));
  }

  function setPlan(pid, years) {
    try {
      if (!G.payPlan) G.payPlan = {};
      G.payPlan[pid] = Math.max(1, Math.min(4, Math.round(years)));
    } catch (error) { /* the deal still works at one year */ }
  }

  /* The total goes up only for the years you push the money back BEYOND
     what the selling club was going to agree to anyway. Asking a club to
     wait four years for a fee it would have taken over four years costs
     nothing; asking it to wait four for one it wanted in two costs two
     years of patience. Paying sooner than the norm costs nothing either
     — it is simply cheaper than not doing so. */
  function loaded(fee, years, baseYears) {
    const base = baseYears == null ? defaultYears(Math.round(fee || 0)) : baseYears;
    const extra = Math.max(0, Math.max(1, years) - base);
    return Math.round((fee || 0) * (1 + PREMIUM * extra));
  }

  function slice(fee, years) {
    return Math.round((fee || 0) / Math.max(1, years));
  }

  /* ---------------------------------------------------------------
     1. THE CHOICE, ON THE BID SHEET
     --------------------------------------------------------------- */
  ACTIONS.payPlan = function payPlanPick(el) {
    try {
      const pid = el.dataset.id;
      setPlan(pid, +el.dataset.v);
      /* redraw the sheet so the arithmetic under the buttons updates,
         keeping whatever he has typed into the fee box */
      const field = document.getElementById('bidFee');
      const typed = field ? Math.round(+field.value || 0) : null;
      const note = document.getElementById('bidAgentNote');
      openBidSheet(pid, note ? note.innerHTML : '', typed);
    } catch (error) { /* the chips are cosmetic if this fails */ }
  };

  if (typeof openBidSheet === 'function') {
    const previous = openBidSheet;
    openBidSheet = function openBidSheetWithStructure(pid, agentNote, prefill) {
      const result = previous.apply(this, arguments);
      try {
        const field = document.getElementById('bidFee');
        if (!field) return result;
        const fee = Math.round(+field.value || 0);
        const base = defaultYears(fee);
        const years = planFor(pid, fee);
        const total = loaded(fee, years, base);
        const per = slice(total, years);
        const premium = total - fee;

        const chips = PLANS.map(([n, label]) => {
          const allowed = n === 1 || fee >= MIN_SPREAD;
          const mark = n === base ? ' · usual' : '';
          return '<button class="chip' + (years === n ? ' on' : '')
            + (allowed ? '' : ' ghost') + '" data-action="payPlan"'
            + ' data-id="' + esc(String(pid)) + '" data-v="' + n + '"'
            + (allowed ? '' : ' disabled') + '>' + label + mark + '</button>';
        }).join('');

        const shape = years > 1
          ? '<b>' + fmtM(per) + '</b> now and <b>' + fmtM(per) + '</b> a year for '
            + (years - 1) + ' more year' + (years === 2 ? '' : 's') + '.'
          : 'Paid in one go.';
        const sum = '<div class="xs' + (premium ? '' : ' faint')
          + '" style="line-height:1.6;padding:2px">'
          + (premium
            ? 'Longer than they wanted, so they want <b>' + fmtM(premium)
              + '</b> more to wait — <b>' + fmtM(total) + '</b> in all. '
            : 'No premium: this is how a fee of this size is normally structured. ')
          + shape + '</div>';

        /* four short chips wrap rather than scroll. `.chips` is a
           horizontal rail everywhere else in the game, which is right for
           twenty countries and wrong for four options — the selected one
           was landing half off the right edge. An inline style beats the
           rail rule without changing it for anybody else. */
        const block = '<div class="chip-lbl" style="margin-top:2px">How you pay</div>'
          + '<div class="chips" style="margin-bottom:6px;flex-wrap:wrap;'
          + 'overflow-x:visible;row-gap:6px">' + chips + '</div>' + sum;

        /* IN FRONT OF THE SUBMIT BUTTON, which is the last thing he
           looks at before committing — and an anchor that survives. The
           first attempt anchored on the budget line of the ORIGINAL bid
           sheet ("Transfer budget remaining"), not knowing a later layer
           had replaced the whole sheet with the negotiation view, whose
           line reads "Transfer budget:". The block silently never
           appeared. The submit button is the one element the sheet
           cannot be without. */
        const anchor = '<button class="btn btn-primary btn-block" data-action="submitBid"';
        const host = document.getElementById('sheetBody');
        if (host && host.innerHTML.indexOf(anchor) >= 0) {
          host.innerHTML = host.innerHTML.replace(anchor, block + anchor);
          /* the fee survives the rewrite, because the manager typed it */
          const back = document.getElementById('bidFee');
          if (back) back.value = String(fee);
        }
        /* the counter-offer note has to survive a redraw, so name it */
        if (agentNote) {
          const card = host && host.querySelector('.card.tight .small');
          if (card && !card.id) card.id = 'bidAgentNote';
        }
      } catch (error) { /* the sheet still works without the chooser */ }
      return result;
    };
  }

  /* ---------------------------------------------------------------
     2. WHAT THE SELLING CLUB MAKES OF IT
     ---------------------------------------------------------------
     Scoped to the one call being made. `askPrice` is asked the same
     question by the AI transfer market several thousand times a season
     and none of those have anything to do with how the manager has
     decided to pay for somebody else. */
  if (typeof askPrice === 'function') {
    const previous = askPrice;
    askPrice = function askPriceDeferred(p) {
      const base = previous.apply(this, arguments);
      try {
        const scope = state.scope;
        if (scope && p && p.id === scope.id) {
          const extra = Math.max(0, scope.years - scope.base);
          if (extra > 0) return Math.round(base * (1 + PREMIUM * extra));
        }
      } catch (error) { /* fall through to the honest price */ }
      return base;
    };
  }

  if (ACTIONS && typeof ACTIONS.submitBid === 'function') {
    const previous = ACTIONS.submitBid;
    ACTIONS.submitBid = function submitBidStructured(el) {
      const pid = el && el.dataset ? el.dataset.id : null;
      const field = document.getElementById('bidFee');
      const fee = field ? Math.round(+field.value || 0) : 0;
      const years = planFor(pid, fee);
      if (!pid || years <= 1 || fee < MIN_SPREAD) {
        state.scope = null;
        return previous.apply(this, arguments);
      }
      const me = G.clubs[G.my];
      const deferred = fee - slice(fee, years);
      state.scope = { id: pid, years, base: defaultYears(fee) };
      /* THE BUDGET TEST IS ABOUT THIS YEAR. Refusing a bid you can pay
         the first instalment on is refusing the whole point of paying in
         instalments. What stops this being free money is the board's own
         ceiling on total transfer debt, which economy.js already
         enforces on the way through. */
      me.budget += deferred;
      try {
        return previous.apply(this, arguments);
      } finally {
        me.budget -= deferred;
        state.scope = null;
      }
    };
  }

  /* ---------------------------------------------------------------
     3. AND THE LEDGER SAYS WHAT WAS AGREED
     ---------------------------------------------------------------
     This runs outermost, so by the time it does the base signing has
     moved the money and economy.js has written its own row from its own
     table. All that is left is to make the row say what the manager
     chose, and to move the difference in today's payment between the two
     clubs so nothing is created or lost. */
  if (typeof completeSigning === 'function') {
    const previous = completeSigning;
    completeSigning = function completeSigningStructured(p, fee, t) {
      const seller = p ? G.clubs[p.club] : null;
      const sellerIx = seller ? seller.i : -1;
      const pid = p ? p.id : null;
      /* only an explicit choice overrides economy.js — see defaultYears */
      const years = chosenPlan(pid);
      const result = previous.apply(this, arguments);
      try {
        if (!pid || !years) return result;
        if (G.payPlan) delete G.payPlan[pid];
        const total = Math.round(fee || 0);
        if (total <= 0) return result;

        const rows = (G.fin && Array.isArray(G.fin.owed)) ? G.fin.owed : null;
        if (!rows) return result;
        /* the row economy.js just wrote for this player, if it wrote one */
        let at = -1;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i] && rows[i].who === p.name && rows[i].to === sellerIx) { at = i; break; }
        }
        const existing = at >= 0 ? rows[at] : null;
        const paidToday = existing ? (total - existing.per * existing.left) : total;
        const wantPer = years > 1 ? slice(total, years) : total;
        const delta = paidToday - wantPer;   /* positive: less cash today */
        if (delta !== 0) {
          const me = G.clubs[G.my];
          me.bank += delta;
          me.budget = Math.max(0, me.budget + delta);
          if (seller) {
            seller.bank -= delta;
            seller.budget = Math.max(0, seller.budget - Math.round(delta * 0.75));
          }
        }
        if (years > 1) {
          const row = { to: sellerIx, per: wantPer, left: years - 1, who: p.name, total };
          if (at >= 0) rows[at] = row; else rows.push(row);
        } else if (at >= 0) {
          rows.splice(at, 1);
        }
      } catch (error) { /* the transfer stands; the schedule is cosmetic */ }
      return result;
    };
  }

  /* ---------------------------------------------------------------
     4. AND THE ACCOUNTS SHOW IT SPREAD, YEAR BY YEAR
     ---------------------------------------------------------------
     "if it's spread across four years, it needs to be spread across the
     finances over four years."

     Two different things are true of a transfer fee and the accounts had
     one of them. The P&L is right already: economy.js amortises a fee
     across the length of the contract and the Annual costs card shows
     that as "Transfer amortisation", which is how a real set of club
     accounts treats it. And the balance-sheet line is right: the
     instalments card gives the total still owed and still due.

     What was missing is the bit in between — the CASH, and when it
     actually leaves. "£47M owed" tells a manager nothing about whether
     next summer is survivable. Twenty over four years and twenty due in
     one go are the same number and completely different problems.

     So the schedule is laid out summer by summer: what goes out, what
     comes in, and the net for each year, from the rows already on the
     ledger. It reads the same data the settlement pays from, so it
     cannot drift away from what will actually happen. */
  function schedule() {
    const rows = [];
    try {
      const fin = G.fin || {};
      const owed = Array.isArray(fin.owed) ? fin.owed : [];
      const due = Array.isArray(fin.due) ? fin.due : [];
      const span = Math.max(
        owed.reduce((m, x) => Math.max(m, x.left || 0), 0),
        due.reduce((m, x) => Math.max(m, x.left || 0), 0),
      );
      for (let year = 0; year < span; year += 1) {
        const out = owed.reduce((s, x) => s + ((x.left || 0) > year ? (x.per || 0) : 0), 0);
        const inn = due.reduce((s, x) => s + ((x.left || 0) > year ? (x.per || 0) : 0), 0);
        rows.push({ year, out, in: inn, net: inn - out });
      }
    } catch (error) { /* an empty schedule is a fair answer */ }
    return rows;
  }

  if (typeof vFinances === 'function') {
    const previous = vFinances;
    vFinances = function vFinancesByYear() {
      let html = previous.apply(this, arguments);
      try {
        const rows = schedule();
        if (!rows.length) return html;
        const label = (year) => {
          try {
            if (typeof seasonLabel === 'function') return seasonLabel(G.season + 1 + year);
          } catch (error) { /* fall back to counting summers */ }
          return year === 0 ? 'Next summer' : 'In ' + (year + 1) + ' years';
        };
        const body = rows.map((row) => '<div class="spread" style="padding:5px 2px;'
          + 'border-bottom:1px solid var(--chalk)">'
          + '<span class="small">' + esc(label(row.year)) + '</span>'
          + '<span class="row" style="gap:10px">'
          + (row.out ? '<b class="num xs" style="color:var(--danger)">−' + fmtM(row.out) + '</b>' : '')
          + (row.in ? '<b class="num xs" style="color:var(--green)">+' + fmtM(row.in) + '</b>' : '')
          + '<b class="num small" style="min-width:62px;text-align:right;color:'
          + (row.net >= 0 ? 'var(--green)' : 'var(--danger)') + '">'
          + (row.net >= 0 ? '+' : '−') + fmtM(Math.abs(row.net)) + '</b></span></div>').join('');

        const card = '<div class="sec"><div class="t">Transfer instalments by year</div>'
          + '<div class="ln"></div><div class="sub">' + rows.length + ' year'
          + (rows.length === 1 ? '' : 's') + '</div></div>'
          + '<div class="card tight" style="margin-bottom:12px">' + body
          + '<div class="xs faint" style="padding:6px 2px 0;line-height:1.5">'
          + 'Cash in and out each summer on deals already done. The amortisation line '
          + 'above is the accounting charge, which is a different thing: it spreads a '
          + 'fee across the contract however the money is actually paid.</div></div>';

        /* after the annual costs card, which is where a reader has just
           been told what a season costs */
        const anchor = '<div class="sec"><div class="t">Commercial deals</div>';
        html = html.indexOf(anchor) >= 0 ? html.replace(anchor, card + anchor) : html + card;
      } catch (error) { /* the screen is still the screen */ }
      return html;
    };
  }

  try {
    window.RBSTransferStructure = Object.freeze({
      PREMIUM, MIN_SPREAD, PLANS, planFor, chosenPlan, defaultYears, setPlan, loaded, slice,
      schedule, state,
    });
  } catch (error) { /* no window */ }
}());
