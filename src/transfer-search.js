/* global G, UI, ACTIONS, trResultsHtml:writable, vTrFilters:writable, askPrice:writable,
          shortlist, pRow, emptyBox, esc, fmtM, fmtW, posBadge, render, vTransfers:writable,
          vTransferBudget, vScouts, faList, faAsk, faAppeal, myRoom, face, ovrPill,
          toast, openModal */

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

  /* `num` IS NOT A GLOBAL. There are two of them in the legacy file and
     both are `const` inside a function body, so neither is on `window`.
     I added it to this file's eslint globals, which silenced the linter
     without creating the function — the card would have thrown
     ReferenceError on first click. Same trap as the lexical `class` and
     `const` hooks; declaring a global to a linter does not make one. */
  const num = (v) => (v == null ? 0 : +v || 0);

  /* WHAT HE ACTUALLY ASKS FOR. `p.wage` is what his last club paid him,
     and on a free agent freshly rehydrated from a save it is not set at
     all — which is where the NaN came from. `faAsk` is the number the
     game charges you, and it falls as he waits. */
  function asking(p) {
    try {
      if (typeof faAsk === 'function') return faAsk(p);
    } catch (error) { /* fall through */ }
    const w = +(p && (p.askWage || p.wage));
    return Number.isFinite(w) ? w : 0;
  }

  /* CLICKING A PLAYER OPENS THAT PLAYER.
     The game's own `openProfile` cannot be used here: it looks the man
     up with `playerById`, which walks `G.clubs` only and never sees the
     free-agent pool, and it then reads `G.clubs[p.club]` — which for a
     free agent is `G.clubs[-1]`. It would find nobody, and if it did it
     would throw on the crest.
     And it must NOT be `faSign`, which signs him on the spot with no
     confirmation — a misplaced tap would put a player on your wage bill.
     So this is a card: who he is, what he wants, whether he would come,
     and then the offer button he already has. */
  function faCardHtml(p) {
    const ask = asking(p);
    let appeal = null;
    try { if (typeof faAppeal === 'function') appeal = faAppeal(p); } catch (error) { appeal = null; }
    const mood = appeal == null ? ''
      : appeal >= 70 ? 'Keen to sign'
        : appeal >= 45 ? 'Would consider it'
          : appeal >= 25 ? 'Needs persuading' : 'Not interested';
    let room = Infinity;
    try { if (typeof myRoom === 'function') room = myRoom(); } catch (error) { room = Infinity; }
    const fits = ask <= room;

    const kpi = (v, l, colour) => '<div class="kpi"><div class="v num"'
      + (colour ? ' style="color:' + colour + '"' : '') + '>' + v + '</div>'
      + '<div class="l">' + l + '</div></div>';

    let h = '<div class="row" style="margin-bottom:2px;gap:8px">'
      + (typeof face === 'function' ? face(p, 34) : '')
      + '<div style="flex:1;min-width:0"><h3>' + esc(p.name) + '</h3>'
      + '<div class="small muted">Free agent · ' + num(p.age) + ' yrs · ' + esc(p.pos)
      + '</div></div>'
      + (typeof ovrPill === 'function' ? ovrPill(p) : '<b class="num">' + num(p.ovr) + '</b>')
      + '</div>';

    h += '<div class="grid3" style="margin:12px 0">'
      + kpi(fmtW(ask), 'He asks', fits ? 'var(--green)' : 'var(--danger)')
      + kpi(num(p.ovr), 'Ability')
      + kpi(num(p.pot || p.ovr), 'Potential')
      + '</div>';

    h += '<div class="small muted" style="line-height:1.55;margin-bottom:10px">'
      + (mood ? '<b>' + mood + '.</b> ' : '')
      + 'No fee and no selling club — you are agreeing wages only. '
      + (fits ? 'That fits inside your wage room.'
        : 'That is more than your wage room allows, so the board will block it.')
      + (p.scouted ? '' : ' He has not been scouted, so the detail is a guess.')
      + '</div>';

    h += '<button class="btn ' + (fits ? 'btn-gold' : 'btn-ghost')
      + ' btn-block" data-action="faSign" data-v="' + p.id + '">'
      + (fits ? 'Offer him ' + fmtW(ask) : 'Offer anyway') + '</button>'
      + '<button class="btn btn-ghost btn-block" style="margin-top:8px" '
      + 'data-action="closeModal">Close</button>';
    return h;
  }

  try {
    if (ACTIONS && typeof openModal === 'function') {
      ACTIONS.faCard = function faCardOpen(el) {
        const id = +((el && el.dataset && el.dataset.id) || 0);
        let p = null;
        try {
          const pool = (typeof faList === 'function') ? faList() : (G.freeAgents || []);
          p = pool.filter((x) => x && x.id === id)[0] || null;
        } catch (error) { p = null; }
        if (!p) {
          try { toast('He is no longer a free agent.'); } catch (error) { /* no toast */ }
          return;
        }
        openModal(faCardHtml(p));
      };
    }
  } catch (error) { /* the list still renders */ }

  function freeRow(p) {
    const wanted = fmtW(asking(p));
    return pRow(p, {
      /* NOT `faOpen`. The live `ACTIONS.faOpen` ignores its argument
         entirely and reopens the whole free-agent modal, so clicking a
         player took you back to the list you were already looking at.
         An earlier definition of it did take an id; this one overrode
         it, and nothing complained. */
      act: 'faCard',
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
    const mood = get('trMood', 'any');
    const fit = get('trFit', 'any');
    const role = get('trRole', 'any');
    const attr = get('trAttr', '');
    const attrMin = +get('trAttrMin', 14) || 0;

    /* THE WAGE HE ACTUALLY ASKS. This list was testing `p.wage` — what
       his last club paid him — so the same slider meant one thing on the
       market tab and another here. `faAsk` is what the signing costs. */
    const wageOf = asking;
    const room = (() => {
      try {
        return (typeof window.myRoom === 'function') ? window.myRoom() : Infinity;
      } catch (error) { return Infinity; }
    })();
    const starter = (p) => {
      try {
        return (typeof window.trStarter === 'function') ? window.trStarter(p) : false;
      } catch (error) { return false; }
    };
    const natOf = (p) => {
      try {
        return (typeof window.natOf === 'function') ? window.natOf(p) : p.nat;
      } catch (error) { return p.nat; }
    };

    /* THROUGH `faList()`, NEVER OFF `G.freeAgents` DIRECTLY.
       A save stores free agents in a compact form — plain arrays — and
       `faList()` is what rehydrates them back into players, in place, on
       first read. This list went to the raw array, so before anything
       else happened to call `faList()` every row was built from an
       array: no name, no age, no wage, and every number NaN. Opening the
       game's own free-agent modal fixed it, because that calls
       `faList()` — which is exactly why it looked fine "after the first
       time" and broken before. */
    const pool = (() => {
      try {
        if (typeof faList === 'function') return faList() || [];
      } catch (error) { /* fall through */ }
      return G.freeAgents || [];
    })();

    let blocked = 0;
    const list = pool.filter((p) => {
      if (!p || Array.isArray(p)) return false;
      if (UI.trShort && sl.indexOf(p.id) < 0) return false;
      if (UI.trPos !== 'Any' && p.pos !== UI.trPos) return false;
      if (p.age > +(UI.trAge || '40')) return false;
      if (q && String(p.name || '').toLowerCase().indexOf(q) < 0) return false;
      if (minOvr && p.ovr < minOvr) return false;
      if (minPot && (p.pot || p.ovr) < minPot) return false;
      if (nat && nat !== 'any' && natOf(p) !== nat) return false;

      /* EVERY FILTER THE REST OF THE MARKET HAS, ON THE SAME TERMS.
         This list used to apply seven of them and quietly ignore the
         rest, so setting a mood or an attribute narrowed the market tab
         and did nothing at all here — the panel said it had filtered
         and it had not. */
      if (mood !== 'any') {
        const m = p.morale == null ? 60 : p.morale;
        if (mood === 'unhappy' && m >= 45) return false;
        if (mood === 'angry' && m >= 32) return false;
      }
      if (fit === 'fit' && p.injury) return false;
      if (fit === 'inj' && !p.injury) return false;
      if (role === 'bench' && starter(p)) return false;
      if (role === 'star' && !starter(p)) return false;
      if (attr && ((p.attrs && p.attrs[attr]) || 0) < attrMin) return false;

      const w = wageOf(p);
      if (maxWage && w > maxWage) return false;
      /* "Within my means" costs nothing in fees here — a free agent is
         wages only — but the wage still has to fit under the ceiling */
      if (UI.trAfford && w > room) { blocked += 1; return false; }

      /* a free agent has no club, so the transfer-listed and contract
         filters are meaningless rather than false — they are not applied */
      return true;
    });

    const s = UI.trSort || 'ovr';
    list.sort((a, b) => (
      s === 'val' ? b.value - a.value
        : s === 'age' ? a.age - b.age || b.ovr - a.ovr
          : s === 'pot' ? (b.pot || b.ovr) - (a.pot || a.ovr) || b.ovr - a.ovr
            : s === 'wage' ? wageOf(a) - wageOf(b) || b.ovr - a.ovr
              : b.ovr - a.ovr));

    /* A PAGER, NOT A CEILING. This list used to stop at twenty and tell
       you to tighten the filters to see further down — while the market
       tab beside it paged through everything. So the free-agent market
       was the one place you could not actually browse, which is the
       opposite of what it is for. Same twenty a page, same control, same
       `UI.trPage` the base search already keeps. */
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const page = Math.max(0, Math.min(pages - 1, +UI.trPage || 0));
    UI.trPage = page;
    const shown = list.slice(page * PAGE, page * PAGE + PAGE);

    let h = '<div class="sec"><div class="t">Free agents</div><div class="ln"></div>'
      + '<div class="sub">' + list.length + ' match' + (list.length === 1 ? '' : 'es')
      + '</div></div><div class="card tight" style="padding:4px 8px">';
    if (!shown.length) {
      h += emptyBox('🆓', 'No free agent fits that',
        blocked
          ? 'Everything that fits is above your wage ceiling. Turn off "Within my '
            + 'means" to look anyway, or take somebody off the bill first.'
          : 'Widen the age range, change the position, or clear the name search.');
    } else {
      h += '<div class="plist">' + shown.map(freeRow).join('') + '</div>';
    }
    h += '</div>';
    if (pages > 1) {
      h += '<div class="spread" style="gap:8px;padding:7px 2px 2px">'
        + '<button class="btn btn-ghost btn-sm" data-action="trPage" data-v="' + (page - 1) + '"'
        + (page <= 0 ? ' disabled' : '') + '>← Previous</button>'
        + '<span class="xs faint">Page ' + (page + 1) + ' of ' + pages
        + ' · ' + list.length + ' players</span>'
        + '<button class="btn btn-ghost btn-sm" data-action="trPage" data-v="' + (page + 1) + '"'
        + (page >= pages - 1 ? ' disabled' : '') + '>Next →</button></div>';
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
    /* ONE export, at the end. I briefly added a second one earlier in
       the file and this one silently overwrote it -- the same last-write
       -wins trap that put faOpen over the id-taking version in the first
       place. cardHtml and asking are here so the suite can assert on the
       player card without opening a real modal. */
    window.RBSTransferSearch = Object.freeze({
      DEALS, deal, isFree, isExpiring, pool, results,
      cardHtml: faCardHtml, asking,
    });
  } catch (error) { /* no window */ }
}());
