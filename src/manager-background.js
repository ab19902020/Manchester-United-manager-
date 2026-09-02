/* global G, ACTIONS, myManager, mgrRow, mgrChip, esc, clamp, MGRUI, playerById */

/* =====================================================================
   A MANAGER WHO IS SOMEBODY
   ---------------------------------------------------------------------
   "Improve the manager so you can give him more detail when you make
    him."

   He had nine fields and every one of them was a picture: name, age,
   jaw, eyes, skin, hair colour, haircut, beard, what he wears in the
   dugout. `G.mgr` is read in twenty-five places in the game file and all
   twenty-five are drawing his face. Nationality was already there and
   appeared once, under his portrait, and then never again. Creating a
   manager was a dress-up screen bolted to a football game: nothing you
   chose about the man changed a single thing that happened afterwards.

   Two questions are added here, and they are the two a football person
   would ask first:

       DID YOU PLAY?        never · non-league · lower league ·
                            top flight · international
       WHAT ARE YOUR BADGES? none · B licence · A licence · Pro licence

   ---------------------------------------------------------------------
   AND THEN THEY HAVE TO MATTER, or this is just two more dropdowns.

   Standing runs 0 to 100 and is what the game of football knows about
   you before you have done anything in it. A capped international with a
   Pro licence starts around 70; somebody who never played and has no
   badges starts around 22. Age counts for a little, because a man of
   fifty has been somewhere even if nobody remembers where.

   Where it bites first is the place a manager's name is actually worth
   something: PERSUADING A PLAYER TO SIGN. `interestScore` already weighs
   the two clubs' stature, his contract, his ambition, the money and how
   badly he is wanted -- everything except who is asking. A player choosing
   between two similar clubs goes to the manager he rates, and the elite
   ones especially do not sign for a nobody. The term is worth up to
   about nine points of interest either way, against a scale where the
   whole gap between two clubs is worth twenty-eight, so it can tip a
   close decision and never buy a player on its own.

   Nothing here touches the match engine. A great manager still cannot
   make a bad team win; he can talk a better player into joining it.
   ===================================================================== */
(function managerBackground() {
  'use strict';
  if (typeof window === 'undefined') return;

  const PLAYED = [
    ['none', 'Never played', 0],
    ['nonleague', 'Non-league', 6],
    ['lower', 'Lower league', 13],
    ['top', 'Top flight', 22],
    ['intl', 'International', 30],
  ];
  const BADGE = [
    ['none', 'None', 0],
    ['b', 'B licence', 8],
    ['a', 'A licence', 15],
    ['pro', 'Pro licence', 22],
  ];

  function look(list, key) {
    for (let i = 0; i < list.length; i++) if (list[i][0] === key) return list[i];
    return list[0];
  }

  /* What football knows about you before you have managed a game. */
  function standing(m) {
    if (!m) return 30;
    const played = look(PLAYED, m.played || 'none')[2];
    const badge = look(BADGE, m.badge || 'none')[2];
    /* a man of fifty has been somewhere, even if nobody remembers where */
    const years = Math.max(0, Math.min(18, ((m.age | 0) - 30) * 0.7));
    return Math.max(0, Math.min(100, 12 + played + badge + years));
  }

  function mgr() {
    try { return (typeof myManager === 'function') ? myManager() : (G && G.mgr) || null; }
    catch (error) { return null; }
  }

  /* ---- the two questions, added to "Who you are" ------------------- */

  function rows(m) {
    const row = (typeof mgrRow === 'function') ? mgrRow : null;
    const chip = (typeof mgrChip === 'function') ? mgrChip : null;
    if (!row || !chip) return '';
    const s = Math.round(standing(m));
    return row('Did you play?',
      PLAYED.map(function (p) { return chip('played', p[0], (m.played || 'none') === p[0], p[1]); }).join(''),
      'what the dressing room already knows about you')
      + row('Coaching badges',
        BADGE.map(function (b) { return chip('badge', b[0], (m.badge || 'none') === b[0], b[1]); }).join(''),
        'the badges a board looks for')
      + row('Standing in the game',
        '<div class="mgb-bar"><i style="width:' + s + '%"></i></div>'
        + '<div class="mgb-num">' + s + '<span> of 100</span></div>',
        describe(s));
  }

  function describe(s) {
    if (s >= 72) return 'a name that opens doors';
    if (s >= 56) return 'well thought of';
    if (s >= 40) return 'known in the game';
    if (s >= 26) return 'still making your way';
    return 'nobody has heard of you yet';
  }

  /* The "Who you are" tab ends with the age row. The two questions go in
     after it, which is found by the marker the age row leaves behind
     rather than by counting rows. */
  const AGE_END = /(<div class="mgr-agewrap">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/;

  function inject(html) {
    if (typeof html !== 'string') return html;
    try {
      if (!MGRUI || MGRUI.tab !== 'who') return html;
      if (html.indexOf('data-v="played"') >= 0) return html;
      const m = mgr();
      if (!m) return html;
      const extra = rows(m);
      if (!extra) return html;
      if (AGE_END.test(html)) return html.replace(AGE_END, '$1' + extra);
      return html;
    } catch (error) { return html; }
  }

  function wrapView() {
    if (typeof window.vMgrCreate !== 'function') return false;
    const passView = window.vMgrCreate;
    window.vMgrCreate = function vMgrCreateWithBackground() {
      return inject(passView.apply(this, arguments));
    };
    return true;
  }

  /* ---- the chips have to do something when tapped ------------------ */

  /* The game's own `mgrSet` already stores any key it is given and
     re-marks the chips in that row, so the two new questions work
     through it untouched. What it does not do is re-render -- only the
     portrait is repainted -- so the standing readout would sit at
     whatever it said when the tab opened. This adds that one update and
     changes nothing else about the handler. */
  function refresh() {
    try {
      const m = mgr();
      if (!m) return;
      const s = Math.round(standing(m));
      const bar = document.querySelector('.mgb-bar i');
      const num = document.querySelector('.mgb-num');
      if (bar) bar.style.width = s + '%';
      if (num) num.innerHTML = s + '<span> of 100</span>';
      const row = num && num.closest ? num.closest('.mgr-row') : null;
      const note = row ? row.querySelector('.mgr-note') : null;
      if (note) note.textContent = describe(s);
    } catch (error) { /* the readout is a fraction stale, nothing more */ }
  }

  /* `ACTIONS` is `const ACTIONS={}` at the top of the game file, which
     makes it a global LEXICAL binding and not a property of window --
     the same trap `G` sets. The bare name reaches it from a classic
     script; `window.ACTIONS` is undefined, and wrapping that is a silent
     no-op, which is exactly what the first version of this did. */
  function actions() {
    try { return (typeof ACTIONS !== 'undefined') ? ACTIONS : null; } catch (error) { return null; }
  }

  function wrapAction() {
    const A = actions();
    if (!A || typeof A.mgrSet !== 'function') return false;
    const passSet = A.mgrSet;
    A.mgrSet = function mgrSetThenShowStanding(el) {
      const out = passSet.apply(this, arguments);
      try {
        const k = el && el.dataset ? el.dataset.k : null;
        if (k === 'played' || k === 'badge') refresh();
      } catch (error) { /* nothing to update */ }
      return out;
    };
    return true;
  }

  /* ---- and where it bites: talking a player into signing ----------- */

  function wrapInterest() {
    if (typeof window.interestScore !== 'function') return false;
    const passScore = window.interestScore;
    window.interestScore = function interestScoreWithAManager(p, fee, wage) {
      const sc = passScore.apply(this, arguments);
      try {
        const m = mgr();
        if (!m) return sc;
        /* centred on 45, which is a working coach nobody has heard much
           about, so an unremarkable manager neither helps nor hurts */
        const edge = (standing(m) - 45) / 55;          /* about -0.8 .. +1.0 */
        let swing = edge * 9;
        /* the better the player, the more he cares who is asking */
        if (p && p.ovr >= 84) swing *= 1.5; else if (p && p.ovr >= 80) swing *= 1.2;
        return sc + swing;
      } catch (error) { return sc; }
    };
    return true;
  }

  function css() {
    if (document.getElementById('rbs-mgb')) return;
    const st = document.createElement('style');
    st.id = 'rbs-mgb';
    st.textContent = [
      '.mgb-bar{height:7px;border-radius:4px;background:rgba(255,255,255,.10);overflow:hidden;flex:1;min-width:120px}',
      '.mgb-bar i{display:block;height:100%;border-radius:4px;',
      ' background:linear-gradient(90deg,#8a6a1e,#fbe122)}',
      '.mgb-num{font-weight:800;font-size:14px;margin-top:5px}',
      '.mgb-num span{font-size:10px;font-weight:700;opacity:.5}',
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function install() {
    css();
    wrapView();
    wrapAction();
    wrapInterest();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  window.RBSManagerBackground = {
    PLAYED: PLAYED, BADGE: BADGE,
    standing: standing, describe: describe,
  };
})();
