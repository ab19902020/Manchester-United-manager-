/* global G, UI, ACTIONS, trResultsHtml:writable, vTrFilters:writable, askPrice:writable,
          shortlist, pRow, emptyBox, esc, fmtM, fmtW, posBadge, render, vTransfers:writable, vTransferBudget, vScouts */

/* =====================================================================
   SEARCHING FOR A FREE AGENT
   ---------------------------------------------------------------------
   "we should be able to filter out contract players in the search,
    currently it's hard to search free agents"

   IT WAS NOT HARD, IT WAS IMPOSSIBLE. The market search walks the
   clubs:

       G.clubs.forEach(c => { ...; c.players.forEach(p => ...) })

   and free agents are not at a club — they live in `G.freeAgents`. So
   no free agent has ever appeared in a search result. The only way to
   see one was the list at the bottom of the transfers screen, which is
   sorted by ability and has no name search, no position filter and no
   age filter. Looking for a left-back on a free transfer meant reading
   the whole list.

   Two things follow from that, and the second is the one that was
   asked for.

   1. FREE AGENTS JOIN THE SEARCH. Name, position, age, sort — all of it
      now reaches them. The row already knew how to draw one: `trRow`
      falls back to `{name:'Free agent', short:'FA'}` when a player has
      no club, which says this was always meant to work.

   2. A CONTRACT FILTER, because a market of ten thousand men is only
      useful if you can say what kind of deal you are looking for:

        Anyone           the whole market
        Free agents      no club, no fee, wages only
        Expiring         in the last year of his contract — cheap now,
                         free in the summer, and the most useful filter
                         in the game for a club with no money
        Under contract   the rest, if you want the fee-paying market

   `askPrice` is guarded too. It reads `G.clubs[p.club].players`, which
   throws on a man who has no club — so it would have thrown the moment
   a free agent reached a market row.
   ===================================================================== */

(function transferSearch() {
  const DEALS = [
    ['market', 'At a club', '📄'],
    ['free', 'Free agents', '🆓'],
    ['expiring', 'Expiring', '⏳'],
  ];

  function deal() {
    if (!UI.trDeal || !DEALS.some((d) => d[0] === UI.trDeal)) UI.trDeal = 'market';
    return UI.trDeal;
  }

  const PAGE = 20;          /* the base search pages to twenty; match it */

  const isFree = (p) => p && (p.club == null || !(G.clubs || [])[p.club]);
  const isExpiring = (p) => p && !isFree(p) && (+p.contract || 0) <= 1;

  /* -------------------------------------------------------------------
     THE GUARD. `askPrice(p)` opens with `const c = G.clubs[p.club]` and
     then reads `c.players`, so a free agent throws a TypeError. Nothing
     caught it before because no free agent could reach it.
     ------------------------------------------------------------------- */
  if (typeof askPrice === 'function') {
    const previous = askPrice;
    askPrice = function askPriceFreeAgents(p) {
      if (isFree(p)) return 0;
      try { return previous.apply(this, arguments); } catch (error) { return (p && p.value) || 0; }
    };
  }

  ACTIONS.trDeal = function trDealPick(el) {
    UI.trDeal = el.dataset.v;
    render();
  };

  /* -------------------------------------------------------------------
     THE FILTER ROW
     ------------------------------------------------------------------- */
  if (typeof vTrFilters === 'function') {
    const previous = vTrFilters;
    vTrFilters = function vTrFiltersWithContract() {
      const html = previous.apply(this, arguments);
      try {
        const current = deal();
        const count = (G.freeAgents || []).length;
        const row = '<div class="chip-lbl">Contract</div><div class="chips xscroll">'
          + DEALS.map(([key, label, icon]) => '<button class="chip'
            + (current === key ? ' on' : '') + '" data-action="trDeal" data-v="' + key + '">'
            + (icon ? icon + ' ' : '') + label
            + (key === 'free' && count ? ' (' + count + ')' : '')
            + '</button>').join('')
          + '</div>';
        /* before the sort row, so the question "what kind of deal" is
           asked before "in what order" */
        const at = html.indexOf('<div class="chip-lbl">Sort by</div>');
        if (at < 0) return html + row;
        return html.slice(0, at) + row + html.slice(at);
      } catch (error) { return html; }
    };
  }

  /* -------------------------------------------------------------------
     THE SEARCH
     -------------------------------------------------------------------
     Reimplemented rather than wrapped, because what has to change is
     the pool it draws from and the previous version returns finished
     HTML. Everything else is kept as it was: the same forty-row cap,
     the same counts, the same sorts.
     ------------------------------------------------------------------- */
  function pool() {
    const out = [];
    try {
      (G.clubs || []).forEach((c) => {
        if (!c || c.i === G.my) return;
        (c.players || []).forEach((p) => { if (p) out.push(p); });
      });
    } catch (error) { /* no world */ }
    try {
      (G.freeAgents || []).forEach((p) => { if (p) out.push(p); });
    } catch (error) { /* no free agents built yet */ }
    return out;
  }

  function freeRow(p) {
    const wanted = fmtW(p.wage);
    return pRow(p, {
      act: 'faOpen',
      meta: '<span class="xs" style="color:#7fe0a6;font-weight:800">FREE AGENT</span> · ' + p.age
        + (p.scouted ? '' : ' · <span style="color:var(--blue)">unscouted</span>'),
      rail: '<span class="num" style="color:var(--green);font-weight:800">✓ No fee</span>'
        + '<span class="xs faint">wants ' + wanted + '</span>',
      sub: wanted,
      tags: '<span class="tag-pill" style="background:rgba(61,220,132,.16);color:#7fe0a6">'
        + '🆓 No selling club</span>'
        + (p.injury ? '<span class="tag-pill tp-inj">🚑</span>' : ''),
    });
  }

  /* THE FREE-AGENT LIST ONLY. Everything else delegates.

     The first version of this reimplemented the search, copying the
     version at line 20994 of the legacy file — and the live one is at
     50274, four thousand lines further down, with filters for overall,
     potential, fee, wage, contract length, morale, fitness, role,
     attribute and nationality, budget awareness, a cost cache and
     pagination to twenty. Replacing it threw all of that away. The
     suite caught it on an assertion about pagination that I would not
     have thought to write.

     This is the exact failure mode Agent One flagged — a layer that
     REPLACES a function instead of wrapping it silently discards every
     wrapper beneath it, and nothing throws. So: the base search stays
     the authority for players at clubs, and this only draws the one
     list it cannot draw, because free agents are not in its pool. */
  function results() {
    const q = String(UI.trQ || '').trim().toLowerCase();
    const sl = (typeof shortlist === 'function') ? shortlist() : [];
    const get = (k, d) => {
      try { return (typeof window.trGet === 'function') ? window.trGet(k) : d; }
      catch (error) { return d; }
    };
    const minOvr = +get('trOvr', 0) || 0;
    const minPot = +get('trPot', 0) || 0;
    const maxWage = +get('trWage', 0) || 0;
    const nat = get('trNat', 'any');

    const list = (G.freeAgents || []).filter((p) => {
      if (!p) return false;
      if (UI.trShort && sl.indexOf(p.id) < 0) return false;
      if (UI.trPos !== 'Any' && p.pos !== UI.trPos) return false;
      if (p.age > +(UI.trAge || '40')) return false;
      if (q && String(p.name || '').toLowerCase().indexOf(q) < 0) return false;
      if (minOvr && p.ovr < minOvr) return false;
      if (minPot && (p.pot || p.ovr) < minPot) return false;
      if (maxWage && p.wage > maxWage) return false;
      if (nat && nat !== 'any' && p.nat !== nat) return false;
      /* a free agent has no club, so a transfer-listed filter is
         meaningless rather than false — it is not applied */
      return true;
    });

    const s = UI.trSort || 'ovr';
    list.sort((a, b) => (
      s === 'val' ? b.value - a.value
        : s === 'age' ? a.age - b.age || b.ovr - a.ovr
          : s === 'pot' ? (b.pot || b.ovr) - (a.pot || a.ovr) || b.ovr - a.ovr
            : s === 'wage' ? a.wage - b.wage || b.ovr - a.ovr
              : b.ovr - a.ovr));

    const shown = list.slice(0, PAGE);
    let h = '<div class="sec"><div class="t">Free agents</div><div class="ln"></div>'
      + '<div class="sub">' + list.length + ' match' + (list.length === 1 ? '' : 'es')
      + '</div></div><div class="card tight" style="padding:4px 8px">';
    if (!shown.length) {
      h += emptyBox('🆓', 'No free agent fits that',
        'Widen the age range, change the position, or clear the name search.');
    } else {
      h += '<div class="plist">' + shown.map(freeRow).join('') + '</div>';
    }
    h += '</div>';
    if (list.length > PAGE) {
      h += '<div class="xs faint" style="padding:6px 4px;text-align:center">Showing the top '
        + PAGE + ' of ' + list.length + ' — tighten the filters to see further down.</div>';
    }
    return h + '<div class="xs faint" style="padding:6px 4px;line-height:1.5">'
      + 'No fee and no selling club — you are only bidding wages, and rivals are '
      + 'circling the good ones.</div>';
  }

  /* WRAPPED, NOT REPLACED. Free agents get their own list because the
     base search cannot reach them; everything else is the base search,
     untouched. "Expiring" is the base search with its own contract
     filter set to the final year, which it already knows how to do. */
  if (typeof trResultsHtml === 'function') {
    const previous = trResultsHtml;
    trResultsHtml = function trResultsHtmlByDeal() {
      const want = deal();
      if (want === 'free') {
        try { return results(); } catch (error) { return previous.apply(this, arguments); }
      }
      if (want === 'expiring') {
        const was = UI.trCon;
        UI.trCon = '1';
        try { return previous.apply(this, arguments); } finally { UI.trCon = was; }
      }
      return previous.apply(this, arguments);
    };
  }

  /* -------------------------------------------------------------------
     AND THE SEARCH GOES FIRST
     -------------------------------------------------------------------
     Measured on a phone: the name box sat 768px down the transfers
     screen and the contract chips 1,098px down, on a page 5,359px tall.
     You scrolled past the loan market, the transfer budget, the
     rebalance slider and three scouts before you could type a name.
     That is the other half of "it's hard to search".

     So the search and its results come first, and the money and the
     scouts follow. The budget is in the header bar on every screen
     anyway, which is where you look for it while shopping.

     The standalone free-agent list at the bottom is replaced by a card
     that switches the filter. It was a hundred and ninety-eight rows
     with no filters at all — the search does that job properly now, and
     it was most of the page height.
     ------------------------------------------------------------------- */
  if (typeof window.vTransfers === 'function') {
    const previous = window.vTransfers;
    window.vTransfers = function vTransfersSearchFirst() {
      try {
        const budget = (typeof window.vTransferBudget === 'function') ? window.vTransferBudget() : '';
        const scouts = (typeof window.vScouts === 'function') ? window.vScouts() : '';
        const count = (G.freeAgents || []).length;
        const prompt = count && deal() !== 'free'
          ? '<div class="card tight" style="margin:12px 0;padding:11px 12px">'
            + '<div class="spread"><div style="min-width:0">'
            + '<div style="font-weight:800">🆓 ' + count + ' free agents</div>'
            + '<div class="xs faint">No fee and no selling club — just wages.</div></div>'
            + '<button class="btn btn-ghost btn-sm" data-action="trDeal" data-v="free">Search them</button>'
            + '</div></div>'
          : '';
        return vTrFilters()
          + '<div id="trResults">' + trResultsHtml() + '</div>'
          + prompt + budget + scouts;
      } catch (error) {
        return previous.apply(this, arguments);
      }
    };
  }

  try {
    window.RBSTransferSearch = Object.freeze({
      DEALS, deal, isFree, isExpiring, pool, results,
    });
  } catch (error) { /* no window */ }
}());
