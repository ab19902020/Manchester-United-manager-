/* global G, UI, ACTIONS, MU, esc, fmtM, fmtW, toast, mail, render, openModal, closeModal, divMembers,
          applyPostMatch:writable, tableRows:writable, endSeason:writable, fansShift, clamp, LEAGUES, leaguePos */

/* =====================================================================
   THE DIRECTOR'S OFFICE
   ---------------------------------------------------------------------
   For an owner-manager or a chairman: the decisions a manager never
   gets to make. Every one of them is about money, and every one of them
   has a price.

   TICKETS. Each home game sells at the division's going rate. Charge
   more and each head is worth more but fewer heads come, and the ones
   who do come grumble; charge less and the ground fills and the mood
   lifts. How many stay away depends on how big the club is -- a club
   people want to watch can charge for it, a small one cannot -- and a
   ground that is already full cannot sell more seats however cheap they
   are. The gate on matchday is recalculated with the price you set.

   BORROWING. The bank lends against what the club turns over. A loan is
   paid off weekly, interest included, over the term you choose; the
   longer the term the smaller the payment and the more it costs in all.
   The rate depends on the division and on how much you already owe.
   Money you borrow can go into the transfer budget or sit in the bank.

   YOUR OWN MONEY. An owner has a fortune outside the club. Putting it
   in is free and it never comes back.

   THE BUDGETS. You decide how much of the cash in the bank is released
   for transfers, and where the wage ceiling sits.

   AND IF IT GOES WRONG. A club that sits beyond its overdraft for six
   weeks running goes into administration: twelve points off this
   season, a transfer embargo until the summer, half the debt written
   off by creditors who will never trust you again, and supporters who
   remember it. That is a rule applied to the club's books, not a hand
   on a result: it does not know or care where the club is in the table.

   Nothing here reaches into a match. A cheaper ticket fills the ground
   and lifts the supporters' mood, and what the mood does is what it
   already did; the office adds no bonus of its own.
   ===================================================================== */
(function directorsOffice() {
  'use strict';

  const PRICES = [-0.3, -0.15, 0, 0.15, 0.3, 0.5];
  const TERMS = [3, 5, 10];
  const DEDUCTION = 12;
  const RED_WEEKS = 6;

  const role = () => (G && G.role) || 'manager';
  const isOwner = () => role() === 'owner' || role() === 'chairman';
  const active = () => !!(typeof G !== 'undefined' && G && G.clubs && G.clubs[G.my] && !G.sacked);
  const club = () => G.clubs[G.my];

  function office() {
    if (!G.owner || typeof G.owner !== 'object') G.owner = {};
    const o = G.owner;
    if (o.ticket == null) o.ticket = 0;
    if (!Array.isArray(o.loans)) o.loans = [];
    if (o.wealth == null) o.wealth = 0;
    if (o.red == null) o.red = 0;
    return o;
  }

  function annualRevenue() {
    try {
      const c = club();
      const n = (divMembers(c.league) || []).length || 20;
      let pos = n / 2;
      try { pos = leaguePos(G.my) || pos; } catch (e) { /* mid-table */ }
      return Math.max(1, window.RBSEconomy.revenueFor(c, pos).total || 0);
    } catch (e) { return 1e6; }
  }
  function weeklyWages() { return (club().players || []).reduce((s, p) => s + (p.wage || 0), 0); }

  /* ---- tickets ---------------------------------------------------------- */
  function standing() { try { return window.RBSEconomy.standing(club()); } catch (e) { return 0.5; } }
  /* how many stay away for every 1% on the price: a club people want to
     watch loses fewer than a small one */
  function elasticity() { return clamp(1.15 - standing() * 0.55 - ((G.fans == null ? 60 : G.fans) - 60) / 200, 0.45, 1.3); }

  function gateAt(price, opts) {
    const c = club(), eco = window.RBSEconomy;
    const base = eco.attendance(c, opts || {});
    const crowd = Math.round(clamp(base * (1 - elasticity() * price), 200, c.cap || base));
    const head = eco.ticketYield(c) * (opts && opts.cup ? 0.8 : 1) * (1 + price);
    return { crowd, head, gate: Math.round(crowd * head), base };
  }

  if (typeof applyPostMatch === 'function') {
    const previous = applyPostMatch;
    applyPostMatch = function applyPostMatchPriced(res) {
      const out = previous.apply(this, arguments);
      try {
        if (!isOwner()) return out;
        const f = MU && MU.fix;
        const o = office();
        if (!f || f.h !== G.my || f.neutral || !o.ticket) return out;
        const top = (G.inbox || []).find((x) => x.day === G.day && String(x.title).indexOf('Gate receipts:') === 0);
        if (!top) return out;
        const opts = { won: res === 'W', cup: !!f.cup };
        const was = gateAt(0, opts), now = gateAt(o.ticket, opts);
        club().bank += now.gate - was.gate;
        top.title = 'Gate receipts: ' + fmtM(now.gate);
        top.body = '<b>' + now.crowd.toLocaleString() + '</b> through the turnstiles at ' + esc(club().stadium)
          + ' at your prices (' + (o.ticket > 0 ? '+' : '') + Math.round(o.ticket * 100) + '% on the going rate) generated <b>'
          + fmtM(now.gate) + '</b> — <b>£' + Math.round(now.head) + '</b> a head.';
        /* the supporters notice what they are being charged */
        if (typeof fansShift === 'function') fansShift(-o.ticket * 2.2, o.ticket > 0 ? 'ticket prices going up' : 'cheaper tickets');
      } catch (e) { /* the gate stands as it was */ }
      return out;
    };
  }

  /* ---- loans ------------------------------------------------------------ */
  function debt() { return office().loans.reduce((s, l) => s + l.left, 0); }
  function weeklyRepayments() { return office().loans.reduce((s, l) => s + l.weekly, 0); }
  /* a bank lends against turnover, and against a record: a club founded
     this summer can borrow about half a year's money, and each season it
     survives adds to that up to a year and a quarter's */
  function trust() {
    if (!(G.cc && G.cc.on)) return 1.25;
    const years = Math.max(0, (G.season || 1) - ((G.cc && G.cc.founded) || G.season || 1));
    return Math.min(1.25, 0.5 + years * 0.15);
  }
  function creditLimit() { return Math.max(0, Math.round(annualRevenue() * trust() - debt())); }
  function overdraft() { return Math.round(annualRevenue() * 0.12); }
  function rate() {
    const c = club();
    const tier = ((typeof LEAGUES !== 'undefined' && LEAGUES[c.league]) || {}).tier || 1;
    const load = debt() / Math.max(1, annualRevenue());
    return +(0.045 + tier * 0.012 + load * 0.04).toFixed(4);
  }
  function payment(amount, years, apr) {
    const r = apr / 52, n = years * 52;
    return Math.round(amount * r / (1 - Math.pow(1 + r, -n)));
  }
  function borrow(amount, years, toBudget) {
    const o = office(), c = club();
    if (o.embargo) return { ok: false, why: 'No bank will lend to a club in administration.' };
    amount = Math.round(amount);
    if (!(amount > 0) || amount > creditLimit()) return { ok: false, why: 'The bank will not lend that much.' };
    const apr = rate();
    const weekly = payment(amount, years, apr);
    o.loans.push({ amount, left: Math.round(weekly * years * 52), weekly, apr, years, day: G.day, season: G.season });
    c.bank += amount;
    if (toBudget) c.budget = (c.budget || 0) + amount;
    return { ok: true, weekly, apr };
  }
  function repay(amount) {
    const o = office(), c = club();
    amount = Math.min(Math.round(amount), Math.max(0, c.bank || 0), debt());
    if (!(amount > 0)) return { ok: false, why: 'There is nothing in the bank to repay it with.' };
    let rest = amount;
    /* the dearest first */
    o.loans.sort((a, b) => b.apr - a.apr).forEach((l) => {
      if (rest <= 0) return;
      const take = Math.min(rest, l.left);
      const share = take / l.left;
      l.left -= take; l.weekly = Math.round(l.weekly * (1 - share)); rest -= take;
    });
    o.loans = o.loans.filter((l) => l.left > 0 && l.weekly > 0);
    c.bank -= amount;
    c.budget = Math.min(c.budget || 0, Math.max(0, c.bank));
    return { ok: true, amount };
  }

  /* ---- owner's money and budgets --------------------------------------- */
  function invest(amount, toBudget) {
    const o = office(), c = club();
    amount = Math.min(Math.round(amount), o.wealth);
    if (!(amount > 0)) return { ok: false, why: 'There is nothing left in your own pocket.' };
    o.wealth -= amount; o.invested = (o.invested || 0) + amount;
    c.bank += amount;
    if (toBudget) c.budget = (c.budget || 0) + amount;
    return { ok: true, amount };
  }
  function release(amount) {
    const c = club();
    const room = Math.max(0, (c.bank || 0) - (c.budget || 0));
    amount = Math.min(Math.round(amount), room);
    if (!(amount > 0)) return { ok: false, why: 'Everything in the bank is already in the transfer budget.' };
    c.budget = (c.budget || 0) + amount;
    return { ok: true, amount };
  }
  function freeze(amount) {
    const c = club();
    amount = Math.min(Math.round(amount), c.budget || 0);
    if (!(amount > 0)) return { ok: false, why: 'The transfer budget is already empty.' };
    c.budget -= amount;
    return { ok: true, amount };
  }
  function setWageCap(cap) {
    const c = club();
    const floor = weeklyWages();
    c.wageCap = Math.max(Math.round(floor), Math.round(cap / 500) * 500);
    return { ok: true, cap: c.wageCap };
  }

  /* ---- the week ---------------------------------------------------------- */
  function week() {
    if (!isOwner()) return;
    const o = office(), c = club();
    const due = weeklyRepayments();
    if (due > 0) {
      c.bank -= due;
      o.loans.forEach((l) => { l.left = Math.max(0, l.left - l.weekly); });
      const done = o.loans.filter((l) => l.left <= 0);
      o.loans = o.loans.filter((l) => l.left > 0);
      if (done.length) mail('board', '✅ A loan is paid off', 'The last repayment has gone through. That is <b>' + fmtW(done.reduce((s, l) => s + l.weekly, 0)) + '</b> a week back in the club’s pocket.');
    }
    if ((c.bank || 0) < -overdraft()) {
      o.red += 1;
      if (o.red === 2) {
        mail('board', '⚠️ Beyond the overdraft',
          'The club is <b>' + fmtM(-c.bank) + '</b> overdrawn against a limit of <b>' + fmtM(overdraft()) + '</b>. '
          + 'If it is still there in ' + (RED_WEEKS - o.red) + ' weeks the club goes into administration: '
          + DEDUCTION + ' points, a transfer embargo and half the debt written off. Sell, borrow, put money in or cut the wage bill.');
      }
      if (o.red >= RED_WEEKS && !o.admin) administration();
    } else {
      o.red = 0;
    }
  }

  function administration() {
    const o = office(), c = club();
    o.admin = { season: G.season, day: G.day };
    o.red = 0;
    o.embargo = G.season;
    o.deduct = (o.deductSeason === G.season ? (o.deduct || 0) : 0) + DEDUCTION;
    o.deductSeason = G.season;
    o.loans.forEach((l) => { l.left = Math.round(l.left / 2); l.weekly = Math.round(l.weekly / 2); });
    const owed = Math.max(0, -(c.bank || 0));
    c.bank = Math.round(-owed / 2);
    c.budget = 0;
    o.administrations = (o.administrations || 0) + 1;
    if (typeof fansShift === 'function') fansShift(-15, 'the club going into administration');
    mail('board', '🚨 The club is in administration',
      'The administrators arrived this morning. The league has deducted <b>' + DEDUCTION + ' points</b>, the club is under a '
      + '<b>transfer embargo</b> until the summer, and creditors have accepted half of what they were owed. '
      + 'Nobody will lend to the club this season. It survives; whether it recovers is up to you.');
  }

  if (typeof window.dailyTickCore === 'function') {
    const previous = window.dailyTickCore;
    let lastWeek = null;
    window.dailyTickCore = function dailyTickOffice() {
      const r = previous.apply(this, arguments);
      try {
        if (active()) {
          const wk = Math.floor(G.day / 7);
          if (lastWeek == null) lastWeek = office().week != null ? office().week : wk;
          if (wk !== lastWeek) { lastWeek = wk; office().week = wk; week(); }
        }
      } catch (e) { /* the day still passes */ }
      return r;
    };
  }

  /* the deduction stands in the table for the season it was given */
  if (typeof tableRows === 'function') {
    const previous = tableRows;
    tableRows = function tableRowsAdministration(div) {
      const rows = previous.apply(this, arguments);
      try {
        const o = G && G.owner;
        if (o && o.deduct && o.deductSeason === G.season && rows && rows.length) {
          const me = rows.find((r) => r.i === G.my);
          if (me && !me._admin) {
            me.pts = Math.max(0, me.pts - o.deduct); me._admin = true;
            rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
          }
        }
      } catch (e) { /* the table stands */ }
      return rows;
    };
  }
  if (typeof endSeason === 'function') {
    const previous = endSeason;
    endSeason = function endSeasonOffice() {
      const r = previous.apply(this, arguments);
      try {
        const o = G && G.owner;
        if (o && o.embargo && o.embargo < G.season) {
          o.embargo = null;
          o.admin = null;
          mail('board', '🔓 The embargo is lifted', 'The club is out of administration. You can sign players again, and the bank will at least take your call.');
        }
      } catch (e) { /* the summer comes either way */ }
      return r;
    };
  }
  ['submitBid', 'faSign', 'ccSign'].forEach((name) => {
    const previous = ACTIONS[name];
    if (typeof previous !== 'function') return;
    ACTIONS[name] = function embargoed() {
      if (G && G.owner && G.owner.embargo === G.season) { toast('⛔ Transfer embargo: the club is in administration'); return undefined; }
      return previous.apply(this, arguments);
    };
  });

  /* ---- the screen ------------------------------------------------------- */
  function money(v) { return fmtM(v); }

  function sheet() {
    if (!active() || !isOwner()) return;
    const o = office(), c = club();
    const rev = annualRevenue(), wages = weeklyWages(), due = weeklyRepayments();
    const out = wages * 52 + due * 52;
    const net = rev - out;
    const g0 = gateAt(0), g1 = gateAt(o.ticket);
    const ten = (n) => Math.max(0, Math.round(n / 1e4) * 1e4);
    const limit = creditLimit();
    const amounts = [0.1, 0.25, 0.5].map((f) => ten(limit * f)).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    const investAmounts = [0.1, 0.25, 1].map((f) => ten(o.wealth * f)).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    const free = Math.max(0, (c.bank || 0) - (c.budget || 0));
    const status = o.embargo === G.season ? '<span class="do-bad">In administration — embargo until the summer</span>'
      : (c.bank || 0) < -overdraft() ? '<span class="do-bad">Beyond the overdraft — week ' + o.red + ' of ' + RED_WEEKS + '</span>'
        : (c.bank || 0) < 0 ? '<span class="do-warn">Overdrawn, inside the limit</span>' : '<span class="do-ok">Solvent</span>';

    let h = '<section class="do"><span class="rbs-eyebrow">' + esc(role() === 'chairman' ? 'Chairman' : 'Owner-manager') + ' · ' + esc(c.name) + '</span>'
      + '<h3>The Director’s Office</h3>'
      + '<div class="do-grid"><div><strong>' + money(c.bank) + '</strong><span>In the bank</span></div>'
      + '<div><strong>' + money(c.budget) + '</strong><span>Transfer budget</span></div>'
      + '<div><strong>' + fmtW(wages) + '</strong><span>Wages of ' + fmtW(c.wageCap) + '</span></div>'
      + '<div><strong>' + money(debt()) + '</strong><span>Debt · ' + fmtW(due) + '</span></div></div>'
      + '<p class="do-line">' + status + ' · turnover about <b>' + money(rev) + '</b> a year against <b>' + money(out)
      + '</b> of wages and repayments — <b class="' + (net >= 0 ? 'do-ok' : 'do-bad') + '">' + (net >= 0 ? '+' : '') + money(net) + '</b> a year before transfers and running costs.</p>';

    h += '<h4>Ticket prices</h4><div class="cc-chips">' + PRICES.map((p) => '<button class="chip' + (o.ticket === p ? ' on' : '')
      + '" data-action="doTicket" data-v="' + p + '">' + (p === 0 ? 'Going rate' : (p > 0 ? '+' : '') + Math.round(p * 100) + '%') + '</button>').join('')
      + '</div><p class="do-note">A home league game at this price: about <b>' + g1.crowd.toLocaleString() + '</b> of ' + (c.cap || 0).toLocaleString()
      + ' at <b>£' + Math.round(g1.head) + '</b> a head — <b>' + money(g1.gate) + '</b>, against ' + money(g0.gate)
      + ' at the going rate. ' + (o.ticket > 0 ? 'Supporters will resent it.' : o.ticket < 0 ? 'Supporters will appreciate it.' : '') + '</p>';

    h += '<h4>Borrow</h4>';
    if (o.embargo === G.season) h += '<p class="do-note">Nobody will lend to a club in administration.</p>';
    else if (!amounts.length) h += '<p class="do-note">The bank will not lend any more against this turnover.</p>';
    else {
      const term = o.term || 5;
      h += '<p class="do-note">Up to <b>' + money(limit) + '</b> at <b>' + (rate() * 100).toFixed(1) + '%</b> a year. Term: '
        + TERMS.map((t) => '<button class="chip mini' + (term === t ? ' on' : '') + '" data-action="doTerm" data-v="' + t + '">' + t + ' years</button>').join(' ')
        + '</p><div class="do-rows">' + amounts.map((a) => '<button class="do-row" data-action="doBorrow" data-v="' + a + '"><b>' + money(a)
          + '</b><small>' + fmtW(payment(a, term, rate())) + ' for ' + term + ' years · into the transfer budget</small></button>').join('') + '</div>';
    }
    if (debt() > 0) {
      const pay = [0.25, 1].map((f) => ten(Math.min(debt() * f, Math.max(0, c.bank)))).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
      h += o.loans.map((l) => '<p class="do-note">• ' + money(l.amount) + ' borrowed in season ' + l.season + ' at ' + (l.apr * 100).toFixed(1)
        + '% — ' + money(l.left) + ' still to pay, ' + fmtW(l.weekly) + '</p>').join('');
      if (pay.length) h += '<div class="cc-chips">' + pay.map((a) => '<button class="chip" data-action="doRepay" data-v="' + a + '">Repay ' + money(a) + '</button>').join('') + '</div>';
    }

    h += '<h4>Your own money</h4><p class="do-note">You have <b>' + money(o.wealth) + '</b> outside the club'
      + (o.invested ? ', and have put ' + money(o.invested) + ' in so far' : '') + '. Money you put in is not repaid.</p>';
    if (investAmounts.length) h += '<div class="cc-chips">' + investAmounts.map((a) => '<button class="chip" data-action="doInvest" data-v="' + a + '">Put in ' + money(a) + '</button>').join('') + '</div>';

    h += '<h4>Transfer budget</h4><p class="do-note"><b>' + money(free) + '</b> of the cash in the bank is not in the budget yet.</p><div class="cc-chips">'
      + [0.25, 1].map((f) => ten(free * f)).filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((a) => '<button class="chip" data-action="doRelease" data-v="' + a + '">Release ' + money(a) + '</button>').join('')
      + ((c.budget || 0) > 0 ? '<button class="chip" data-action="doFreeze" data-v="' + ten((c.budget || 0) * 0.5) + '">Hold back half</button>' : '') + '</div>';

    h += '<h4>Wage ceiling</h4><p class="do-note">Paying <b>' + fmtW(wages) + '</b> of <b>' + fmtW(c.wageCap) + '</b>. Every £' + '1,000 a week is '
      + money(52000) + ' a year.</p><div class="cc-chips">'
      + [-0.1, 0.1, 0.25].map((f) => '<button class="chip" data-action="doWage" data-v="' + f + '">' + (f > 0 ? '+' : '') + Math.round(f * 100) + '%</button>').join('') + '</div>';

    h += '<div class="do-links"><button class="btn btn-ghost" data-action="doGo" data-v="stadium">The ground</button>'
      + '<button class="btn btn-ghost" data-action="doGo" data-v="staff">The staff</button>'
      + '<button class="btn btn-ghost" data-action="doGo" data-v="finances">The accounts</button></div></section>';
    openModal(h);
  }

  function after(result, good) {
    if (!result.ok) { toast(result.why, 2600); return; }
    if (good) toast(good, 2400);
    try { render(); } catch (e) { /* redrawn later */ }
    sheet();
  }

  ACTIONS.directorsOffice = sheet;
  ACTIONS.doTicket = (el) => { office().ticket = +el.dataset.v; after({ ok: true }, 'Ticket prices set'); };
  ACTIONS.doTerm = (el) => { office().term = +el.dataset.v; sheet(); };
  ACTIONS.doBorrow = (el) => { const r = borrow(+el.dataset.v, office().term || 5, true); after(r, r.ok ? 'Borrowed ' + fmtM(+el.dataset.v) + ' — ' + fmtW(r.weekly) + ' to repay' : ''); };
  ACTIONS.doRepay = (el) => { const r = repay(+el.dataset.v); after(r, r.ok ? 'Repaid ' + fmtM(r.amount) : ''); };
  ACTIONS.doInvest = (el) => { const r = invest(+el.dataset.v, true); after(r, r.ok ? fmtM(r.amount) + ' of your own money is in the club' : ''); };
  ACTIONS.doRelease = (el) => { const r = release(+el.dataset.v); after(r, r.ok ? fmtM(r.amount) + ' released for transfers' : ''); };
  ACTIONS.doFreeze = (el) => { const r = freeze(+el.dataset.v); after(r, r.ok ? fmtM(r.amount) + ' held back' : ''); };
  ACTIONS.doWage = (el) => { const c = club(); const r = setWageCap((c.wageCap || 0) * (1 + (+el.dataset.v))); after(r, 'Wage ceiling now ' + fmtW(r.cap)); };
  ACTIONS.doGo = (el) => { closeModal(); UI.view = 'club'; UI.clubTab = el.dataset.v; render(); };

  function mount() {
    if (!active() || !isOwner()) return;
    const view = document.getElementById('view');
    if (!view || view.querySelector('#doCard')) return;
    const here = UI.view === 'home' || (UI.view === 'club' && (UI.clubTab === 'finances' || UI.clubTab === 'staff'));
    if (!here) return;
    const c = club(), o = office();
    const warn = o.embargo === G.season ? ' · <b class="do-bad">in administration</b>' : (c.bank || 0) < -overdraft() ? ' · <b class="do-bad">beyond the overdraft</b>' : '';
    const html = '<div class="card do-card" id="doCard"><div><span class="rbs-eyebrow">' + esc(role() === 'chairman' ? 'Chairman' : 'Owner-manager')
      + '</span><h4>The Director’s Office</h4><p>' + fmtM(c.bank) + ' in the bank · ' + fmtM(debt()) + ' owed · tickets '
      + (o.ticket ? (o.ticket > 0 ? '+' : '') + Math.round(o.ticket * 100) + '%' : 'at the going rate') + warn + '</p></div>'
      + '<button class="btn btn-primary" data-action="directorsOffice">Open</button></div>';
    const tools = view.querySelector('#rbsPageTools');
    if (tools && UI.view === 'home') {
      const h1 = tools.querySelector('h1');
      if (h1) h1.textContent = role() === 'chairman' ? 'Chairman\u2019s office' : 'Owner\u2019s office';
    }
    if (tools) tools.insertAdjacentHTML('afterend', html);
    else view.insertAdjacentHTML('afterbegin', html);
  }

  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-directors-office';
    style.textContent = `
.do h3{font-size:24px;line-height:1.2;letter-spacing:-.025em;margin:8px 0 12px}
.do h4{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c8d0da;margin:20px 0 8px}
.do-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.do-grid>div{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:11px 12px;min-width:0}
.do-grid strong{display:block;font:800 19px/1.15 var(--body);color:#f2f4f7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.do-grid span{display:block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#97a1ad;margin-top:4px}
.do-line,.do-note{font-size:12.5px;line-height:1.55;color:#aeb8c4;margin:10px 0 8px}
.do-ok{color:#5fd38d}.do-warn{color:#f0c35a}.do-bad{color:#ff8f8f}
.do .chip.mini{padding:4px 9px;font-size:11px;min-height:0}
.do-rows{display:grid;gap:6px}
.do-row{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 12px;border-radius:11px;
  border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);color:inherit;text-align:left;cursor:pointer}
.do-row b{font-size:16px}.do-row small{font-size:11.5px;color:#97a1ad;text-align:right}
.do-links{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:20px}.do-links .btn{padding:10px 4px;font-size:12px}
.do-card{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;
  border-color:rgba(251,225,34,.35)!important;background-image:linear-gradient(135deg,rgba(251,225,34,.09),rgba(0,0,0,0) 60%)!important}
.do-card h4{font-size:17px;margin:4px 0 3px}.do-card p{font-size:12px;color:#aeb8c4;margin:0;line-height:1.45}.do-card .btn{flex-shrink:0}
`;
    document.head.appendChild(style);
    const before = window.render;
    if (typeof before === 'function') {
      window.render = function renderOffice() {
        const r = before.apply(this, arguments);
        try { mount(); } catch (e) { /* drawn either way */ }
        return r;
      };
    }
  }

  window.RBSOffice = Object.freeze({ borrow, repay, invest, release, freeze, setWageCap, week, administration, gateAt,
    elasticity, debt, creditLimit, overdraft, rate, payment, weeklyRepayments, open: sheet });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
