/* global G, MU, MatchSim, ACTIONS, esc, mySideIx, renderMCtl, toast */

/* =====================================================================
   DO SOMETHING ABOUT THEIR BEST PLAYER
   ---------------------------------------------------------------------
   Everything a manager does during a match was already here: change the
   shape, change the mentality, press higher, drop the line, put the trap
   on, waste time, make a substitution, and shout at them once every ten
   minutes. All of it about YOUR eleven.

   Nothing at all about theirs. There was no way to say the one thing a
   manager says before every hard game -- stop him. You could watch a
   number ten pull your afternoon apart and the only answer available was
   to rearrange your own furniture.

   Two instructions, and they are opposites on purpose:

     MARK HIM OUT OF IT   somebody goes with him. He sees far less of
                          the ball -- his weight in every choice the
                          engine makes drops to 0.55 -- but a man who
                          follows him is a man not holding his own
                          position, so the REST of their side finds a
                          little more room (x1.07 each).

     LET HIM HAVE IT      you keep your shape and live with him on the
                          ball (x1.15). Right when the danger is really
                          somebody else, and right when he is not as good
                          as his reputation.

   That is the decision. Mark their best player and you concede space to
   the other ten; ignore him and he plays. Doing it to everybody is not a
   plan -- marking three men hands the other side a 21% uplift across the
   board, which the arithmetic below does on its own without needing a
   rule to forbid it.

   It hooks `weighted`, which is the one place the engine asks "who does
   this fall to?" -- the creator of a chance, the man who shoots, the
   runner in behind, the corner taker. Marking a player therefore takes
   him out of all of them at once, rather than needing a separate patch
   at each.
   ===================================================================== */
(function oppositionInstructions() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (typeof MatchSim !== 'function' || !MatchSim.prototype) return;
  if (typeof MatchSim.prototype.weighted !== 'function') return;

  const TIGHT = 0.55;      /* how little of the ball a marked man sees */
  const FREED = 1.07;      /* what his team-mates gain from the man marking him */
  const LOOSE = 1.15;      /* and what he gains if you leave him alone */

  function plan() {
    try {
      if (typeof G === 'undefined' || !G) return null;
      return G.oppInstr && typeof G.oppInstr === 'object' ? G.oppInstr : null;
    } catch (error) { return null; }
  }

  function set(pid, how) {
    try {
      if (!G.oppInstr) G.oppInstr = {};
      if (!how) delete G.oppInstr[pid]; else G.oppInstr[pid] = how;
    } catch (error) { /* no career, nothing to store */ }
  }

  function marked(p) {
    const o = plan();
    return o && p && p.id != null ? o[p.id] || null : null;
  }

  function anyTight() {
    const o = plan();
    if (!o) return false;
    for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] === 'tight') return true;
    return false;
  }

  /* Only the match you are actually watching, and only THEIR side of it.
     Instructions you gave last week must not follow a player around the
     league for the rest of the season. */
  function theirs(sim, side) {
    try {
      if (typeof MU === 'undefined' || !MU || sim !== MU.m) return false;
      const mine = (typeof mySideIx === 'function') ? mySideIx() : 0;
      return sim.sides[1 - mine] === side;
    } catch (error) { return false; }
  }

  const passWeighted = MatchSim.prototype.weighted;
  MatchSim.prototype.weighted = function weightedWithOppositionPlan(side, wfn, exclude) {
    const o = plan();
    if (!o || !theirs(this, side)) return passWeighted.apply(this, arguments);
    const freed = anyTight();
    return passWeighted.call(this, side, function (x) {
      const w = wfn(x);
      if (!isFinite(w)) return w;
      const how = marked(x && x.p);
      if (how === 'tight') return w * TIGHT;
      if (how === 'loose') return w * LOOSE;
      return freed ? w * FREED : w;
    }, exclude);
  };

  /* ---- the panel, inside the in-match tactics sheet ----------------- */

  let opening = false;

  function theirXI() {
    try {
      if (!MU || !MU.m) return null;
      const mine = mySideIx();
      const side = MU.m.sides[1 - mine];
      if (!side) return null;
      /* no keeper: "mark their goalkeeper" is not an instruction anybody
         has ever given, and offering it made the first tap in testing
         put a man on Stuart Butland for the afternoon */
      return {
        side: side,
        men: (side.onfield || []).filter(function (x) {
          return x && x.p && !x.off && x.slot !== 'GK';
        }),
      };
    } catch (error) { return null; }
  }

  function danger(men) {
    let best = null, bv = -1;
    for (let i = 0; i < men.length; i++) {
      const p = men[i].p;
      if (!p || men[i].slot === 'GK') continue;
      const v = (p.ovr || 0) + (men[i].goals || 0) * 3;
      if (v > bv) { bv = v; best = men[i]; }
    }
    return best;
  }

  const NEXT = { null: 'tight', tight: 'loose', loose: null };

  function short(p) {
    try { return window.surname ? window.surname(p.name) : p.name; } catch (error) { return p.name; }
  }

  function panel() {
    const t = theirXI();
    if (!t || !t.men.length) return '';
    const star = danger(t.men);
    let h = '<div class="chip-lbl">Their team</div>';
    if (star) {
      h += '<div class="oi-star">Watch ' + esc(short(star.p)) + ' — '
        + esc(star.slot) + ', ' + (star.p.ovr | 0)
        + (star.goals ? ', ' + star.goals + ' today' : '') + '</div>';
    }
    h += '<div class="oi-grid">' + t.men.map(function (x) {
      const how = marked(x.p);
      return '<button class="oi-man' + (how ? ' oi-' + how : '') + '"'
        + ' data-action="oppMark" data-id="' + x.p.id + '">'
        + '<span class="oi-pos">' + esc(x.slot) + '</span>'
        + '<span class="oi-nm">' + esc(short(x.p)) + '</span>'
        + '<span class="oi-ov">' + (x.p.ovr | 0) + '</span>'
        + '<span class="oi-how">' + (how === 'tight' ? 'marked'
          : how === 'loose' ? 'let him have it' : 'tap to mark') + '</span>'
        + '</button>';
    }).join('') + '</div>'
      + '<div class="xs faint" style="margin:-2px 0 10px 2px">'
      + 'Marking a man takes one of yours with him — the rest of their side '
      + 'get more room. Mark everybody and you have marked nobody.</div>';
    return h;
  }

  const ANCHOR = '<div class="chip-lbl">Shout at them</div>';

  function install() {
    /* ACTIONS is a global lexical binding, not a property of window */
    let A = null;
    try { A = (typeof ACTIONS !== 'undefined') ? ACTIONS : null; } catch (error) { A = null; }
    if (!A || typeof A.instrOpen !== 'function' || typeof window.openModal !== 'function') return false;

    const passOpen = A.instrOpen;
    A.instrOpen = function instrOpenWithTheirTeam() {
      opening = true;
      try { return passOpen.apply(this, arguments); } finally { opening = false; }
    };

    const passModal = window.openModal;
    window.openModal = function openModalMaybeInstr(h) {
      let out = h;
      try {
        if (opening && typeof h === 'string' && h.indexOf(ANCHOR) >= 0
            && h.indexOf('oi-grid') < 0) {
          const extra = panel();
          if (extra) out = h.replace(ANCHOR, extra + ANCHOR);
        }
      } catch (error) { out = h; }
      return passModal.call(this, out);
    };

    A.oppMark = function oppMark(el) {
      try {
        const id = el && el.dataset ? el.dataset.id : null;
        if (id == null) return;
        const now = (plan() || {})[id] || null;
        const next = NEXT[String(now)];
        set(id, next);
        const p = window.playerById ? window.playerById(+id) : null;
        const nm = p ? short(p) : 'him';
        if (typeof toast === 'function') {
          toast(next === 'tight' ? '🎯 Marking ' + nm
            : next === 'loose' ? '🚶 Standing off ' + nm
              : 'No special attention on ' + nm);
        }
        /* redraw the sheet in place so the choice shows without
           closing the game down */
        if (typeof ACTIONS !== 'undefined' && typeof ACTIONS.instrOpen === 'function') ACTIONS.instrOpen();
      } catch (error) { /* the tap did nothing, the match plays on */ }
    };
    return true;
  }

  /* A new match starts with a clean sheet -- last week's plan does not
     follow a player around the league. */
  function hookKickoff() {
    try {
      const A = (typeof ACTIONS !== 'undefined') ? ACTIONS : null;
      if (!A || typeof A.kickoff !== 'function') return;
      const passKick = A.kickoff;
      A.kickoff = function kickoffFresh() {
        try { if (typeof G !== 'undefined' && G) G.oppInstr = {}; } catch (error) { /* no career */ }
        return passKick.apply(this, arguments);
      };
    } catch (error) { /* nothing to hook */ }
  }

  function css() {
    if (document.getElementById('rbs-oi')) return;
    const st = document.createElement('style');
    st.id = 'rbs-oi';
    st.textContent = [
      '.oi-star{font-size:12px;font-weight:700;margin:0 2px 7px;opacity:.85}',
      '.oi-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:7px}',
      '.oi-man{display:grid;grid-template-columns:30px 1fr 26px;grid-template-areas:',
      ' "pos nm ov" "how how how";gap:2px 6px;padding:6px 8px;border-radius:10px;text-align:left;',
      ' background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}',
      '.oi-pos{grid-area:pos;font-size:9.5px;opacity:.6;font-weight:800}',
      '.oi-nm{grid-area:nm;font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.oi-ov{grid-area:ov;font-size:11px;font-weight:800;text-align:right;opacity:.8}',
      '.oi-how{grid-area:how;font-size:9.5px;opacity:.5}',
      '.oi-man.oi-tight{border-color:rgba(226,88,78,.65);background:rgba(226,88,78,.14)}',
      '.oi-man.oi-tight .oi-how{opacity:.9;color:#e2584e}',
      '.oi-man.oi-loose{border-color:rgba(251,225,34,.5);background:rgba(251,225,34,.10)}',
      '.oi-man.oi-loose .oi-how{opacity:.9;color:#fbe122}',
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function boot() { css(); install(); hookKickoff(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.RBSOppositionInstructions = {
    TIGHT: TIGHT, FREED: FREED, LOOSE: LOOSE,
    set: set, marked: marked, plan: plan, danger: danger, panel: panel,
  };
})();
