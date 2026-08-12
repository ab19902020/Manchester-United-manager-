/* global G, UI, ACTIONS, FORMATIONS, playerById, calcEff, posPenalty, posBadge,
          esc, openModal, render, toast, face */

/* =====================================================================
   PICKING THE SIDE — three faults, one screen
   ---------------------------------------------------------------------
   Reported: "I want to swap a left winger out. It only gives me three
   suggestions. And if I tap a player on the bench it takes me to the
   bench and makes me pick my bench. I can't swap the player out."

   All three parts are real and they are three different faults.

   1. TWO FEATURES OWN THE SAME ACTION NAME. The original screen answered
      a shirt tap with a list of replacements, each row carrying
      `data-action="benchPick"`, and `ACTIONS.benchPick` put that player
      into the selected slot. Much later, a "name your bench" feature was
      added — and defined `ACTIONS.benchPick` again, to mean "add this
      man to the nine". The second definition replaced the first. So
      tapping a replacement stopped swapping anybody and started opening
      the bench-naming sheet, which is exactly what was reported.

      There is even a comment in the file from whoever hit this before me,
      routing a later panel around it via a different action rather than
      untangling it.

   2. ONLY THREE SUGGESTIONS. The panel that replaced the old list does
      `s.opts.slice(0, 3)`. Three is a shortlist, not a squad, and there
      is no way from that screen to the other twenty players.

   3. PICKING A STARTER PUTS HIM IN TWICE. `sugPick` does
      `G.tacs.xi[UI.selSlot] = id` with no check on whether that player is
      already in the eleven, so choosing one duplicates him into two
      slots and quietly drops whoever he was standing next to.

   WHAT THIS DOES

   `benchPick` is disambiguated by state rather than by renaming
   anything: if a shirt is selected, it means "put him in that slot",
   which is what the tactics screen has always wanted it to mean; with no
   shirt selected it is the bench sheet, untouched. Opening the bench
   sheet clears the selection so the two can never overlap.

   Putting a player into a slot now swaps when he is already on the
   pitch, instead of cloning him.

   And a "Swap with anyone" button opens the whole squad for that
   position — every fit player, sorted by how good he actually is there,
   with what he adds or costs against the man in the shirt, whether he is
   out of position, and his condition. Three suggestions stay where they
   are for when they are all you need.
   ===================================================================== */

(function installLineup() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  function guard(label, fn, fallback) {
    try {
      return fn();
    } catch (error) {
      try { console.warn('[lineup] ' + label, error); } catch (e) { /* no console */ }
      return fallback;
    }
  }

  function slotNameAt(ix) {
    const form = (typeof FORMATIONS !== 'undefined') && FORMATIONS[G.tacs && G.tacs.formation];
    const slot = form && form[ix];
    return slot ? slot[0] : null;
  }

  /* ---- 1. putting a man in a shirt, without cloning him -------------- */
  function putInSlot(ix, id) {
    const xi = (G.tacs && G.tacs.xi) || [];
    if (ix == null || ix < 0 || ix >= xi.length || id == null) return false;
    const already = xi.indexOf(id);
    if (already === ix) return false;
    if (already >= 0) {
      /* he is already on the pitch: the two change places rather than one
         of them being cloned and somebody else silently dropped */
      xi[already] = xi[ix];
      xi[ix] = id;
    } else {
      xi[ix] = id;
    }
    return true;
  }

  if (typeof ACTIONS !== 'undefined' && has(ACTIONS.sugPick)) {
    ACTIONS.sugPick = function sugPickThatSwaps(el) {
      const ix = UI.selSlot;
      const id = +((el && el.dataset && el.dataset.id) || NaN);
      if (ix == null || !(id === id)) return;          /* NaN guard */
      putInSlot(ix, id);
      UI.selSlot = null;
      if (has(window.render)) window.render();
    };
  }

  /* ---- 2. the two meanings of benchPick ------------------------------ */
  if (typeof ACTIONS !== 'undefined' && has(ACTIONS.benchPick)) {
    const previousBench = ACTIONS.benchPick;
    ACTIONS.benchPick = function benchPickThatKnowsWhichScreen(el) {
      if (UI.selSlot != null) {
        const id = +((el && el.dataset && el.dataset.id) || NaN);
        if (id === id) {
          putInSlot(UI.selSlot, id);
          UI.selSlot = null;
          if (has(window.render)) window.render();
          return undefined;
        }
      }
      return previousBench.apply(this, arguments);
    };
  }

  if (typeof ACTIONS !== 'undefined' && has(ACTIONS.benchOpen)) {
    const previousOpen = ACTIONS.benchOpen;
    ACTIONS.benchOpen = function benchOpenClearingTheShirt() {
      UI.selSlot = null;                 /* the two modes cannot overlap */
      return previousOpen.apply(this, arguments);
    };
  }

  /* ---- 3. the whole squad, for the shirt you tapped ------------------ */
  function candidates(ix) {
    const name = slotNameAt(ix);
    const c = G.clubs[G.my];
    if (!name || !c) return { name, rows: [], cur: null };
    const xi = (G.tacs && G.tacs.xi) || [];
    const cur = playerById(xi[ix]) || null;
    const curEff = cur && has(window.calcEff) ? window.calcEff(cur, name) : 0;
    const rows = (c.players || [])
      .filter((p) => p && !p.loan && !p.youth && p.id !== xi[ix])
      .map((p) => ({
        p,
        eff: has(window.calcEff) ? window.calcEff(p, name) : (p.ovr || 0),
        onPitch: xi.indexOf(p.id) >= 0,
        out: has(window.posPenalty) ? window.posPenalty(p, name) > 0 : false,
        unfit: !!p.injury || (p.susp || 0) > 0,
      }))
      .sort((a, b) => (a.unfit ? 1 : 0) - (b.unfit ? 1 : 0) || b.eff - a.eff);
    return { name, rows, cur, curEff };
  }

  ACTIONS.xiSwapOpen = function xiSwapOpen() {
    guard('swapOpen', () => {
      const ix = UI.selSlot;
      if (ix == null || !has(window.openModal)) return;
      const { name, rows, cur, curEff } = candidates(ix);
      if (!name) return;
      const line = (r) => {
        const d = Math.round(r.eff - curEff);
        const col = d > 0 ? 'var(--green)' : d < 0 ? 'var(--ink-faint)' : 'var(--ink)';
        const tags = (r.onPitch ? '<span class="xs" style="color:var(--gold)">in the XI</span> ' : '') +
          (r.out ? '<span class="xs" style="color:var(--amber)">⚠ natural ' + esc(r.p.pos) + '</span> ' : '') +
          (r.unfit ? '<span class="xs" style="color:var(--danger)">unavailable</span>' : '');
        return '<div class="mail" data-action="sugPick" data-id="' + r.p.id + '">' +
          '<div class="ic">' + (has(window.face) ? window.face(r.p, 26) : '👤') + '</div>' +
          '<div style="flex:1;min-width:0"><div class="tt">' + esc(r.p.name) + '</div>' +
          '<div class="bd">' + (has(window.posBadge) ? window.posBadge(r.p.pos) : r.p.pos) +
          ' · ' + Math.round(r.p.cond) + '% fit' + (tags ? ' · ' + tags : '') + '</div></div>' +
          '<div style="text-align:right"><div class="num" style="font-weight:800">' + Math.round(r.eff) + '</div>' +
          '<div class="xs" style="font-weight:800;color:' + col + '">' +
          (d > 0 ? '+' + d : d < 0 ? String(d) : 'level') + '</div></div></div>';
      };
      window.openModal('<h3>Swap ' + esc(name) + '</h3>' +
        '<div class="small muted" style="margin:4px 0 10px">' +
        (cur ? 'Currently <b>' + esc(cur.name) + '</b> at <b>' + Math.round(curEff) + '</b>. '
          : 'Nobody in this shirt. ') +
        'Anyone already in the eleven changes places with him.</div>' +
        '<div class="card tight" style="max-height:58vh;overflow-y:auto">' +
        (rows.length ? rows.map(line).join('')
          : '<div class="small muted" style="padding:10px 4px">Nobody else in the squad.</div>') +
        '</div>');
    });
  };

  /* the way in: a button on the panel that used to offer three names */
  if (has(window.vTactics)) {
    const previousTactics = window.vTactics;
    window.vTactics = function vTacticsWithFullSwap() {
      const html = previousTactics.apply(this, arguments);
      return guard('view', () => {
        if (typeof html !== 'string' || UI.selSlot == null) return html;
        const btn = '<button class="btn btn-ghost btn-sm btn-block" ' +
          'style="margin:6px 0 10px" data-action="xiSwapOpen">🔄 Swap with anyone in the squad</button>';
        /* above the shortlist, which is where you look when three names
           were not the three you wanted */
        const at = html.indexOf('<div class="prow" data-action="sugPick"');
        if (at >= 0) return html.slice(0, at) + btn + html.slice(at);
        /* no shortlist rendered — still offer the full list */
        const tail = html.indexOf('<div class="sec"><div class="t">In possession');
        if (tail >= 0) return html.slice(0, tail) + btn + html.slice(tail);
        return html + btn;
      }, html);
    };
  }

  try {
    window.RBSLineup = Object.freeze({ putInSlot, candidates, slotNameAt });
  } catch (error) { /* no window */ }
}());
