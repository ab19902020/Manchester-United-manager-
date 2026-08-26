/* global MU, MTABS, ACTIONS, buildMatchScreen:writable, renderMBody:writable,
          startRaf:writable, drawPitch, sizeCanvas, fillFeed, renderStats,
          stopRaf, $ */

/* =====================================================================
   THE MATCH IS THE PITCH, THE TEXT AND THE STATS. NOTHING ELSE.
   ---------------------------------------------------------------------
   "Completely rip out dugout view. No replays. No actual match engine
    like that. The only match engine now will be the pitch view, the
    text, and the stats, and all of that will be displaying the same
    information no matter what. It needs to go back to the proper core
    of a football manager game -- your decisions, the fitness, the
    attributes will decide the game."

   That is the right call and it was mine to make badly. A 3D broadcast
   was built alongside the match, then a live Dugout, then a highlights
   reel, then a staged re-enactment of every goal -- and every one of
   those is a SECOND account of a match that MatchSim had already
   decided. Two accounts of the same ninety minutes can only ever agree
   by accident, and keeping them in step cost held clocks, forced
   penalties, staged chances and an escalation ladder. All of that
   machinery existed to paper over a picture that should never have been
   a second engine in the first place.

   So there is one engine now. MatchSim plays the match; the Pitch, the
   Text and the Stats are three windows onto that one result, and none of
   them can disagree with it because none of them decides anything.

   WHY THIS IS A MODULE AND NOT AN EDIT. The legacy file redefines
   `renderMBody` five times, `drawPitch` nine times and the match tab bar
   in four places, and a later layer beats an earlier one. Editing any
   one of them leaves the others to argue -- which is exactly the fault
   that left the Pitch tab a black rectangle for a whole match, because
   one layer moved the canvas and another kept drawing to the old one.
   This file loads last, so it is the last word, and it says the same
   thing however many layers came before it.

   WHAT IS NOT TOUCHED. Everything else about a matchday stays exactly as
   it is: the speed control, the dressing room, substitutions, shouts,
   the callouts, the touchline strip, the commentary feed, the stats, the
   report at the end. Only the second engine goes.
   ===================================================================== */

(function matchView() {
  'use strict';

  /* the three windows, and the order they sit in */
  const TABS = [['pitch', '⚽ Pitch'], ['comm', 'Text'], ['stats', 'Stats']];
  const ALLOWED = TABS.map((t) => t[0]);

  /* Anything that is not one of the three -- `dugout` from a save that
     was mid-match when this landed, `m3d` from further back -- becomes
     the Pitch. */
  function legalTab(v) {
    return ALLOWED.indexOf(v) >= 0 ? v : 'pitch';
  }

  /* THE TAB LIST IS A `const` ARRAY, so it is emptied and refilled
     rather than reassigned. Every layer that builds the bar maps over
     this same array, so changing what is in it changes all of them at
     once and none of them has to be edited. */
  try {
    if (typeof MTABS !== 'undefined' && Array.isArray(MTABS)) {
      MTABS.length = 0;
      TABS.forEach((t) => MTABS.push([t[0], t[1]]));
    }
  } catch (error) { /* the bar is rebuilt below anyway */ }

  /* -------------------------------------------------------------------
     THE BODY
     -------------------------------------------------------------------
     Rendered here rather than left to whichever layer happens to be
     last, because that is the seam the black pitch came through: one
     layer put a different canvas in the body and the draw call went on
     looking for the old one. There is one canvas now and one thing that
     draws to it.
     ------------------------------------------------------------------- */
  const CANVAS = '<canvas id="pitchCanvas" style="width:100%;border-radius:14px;'
    + 'border:1px solid var(--chalk-strong);display:block"></canvas>'
    + '<div class="commentary" id="miniFeed" style="margin-top:10px"></div>';

  /* THE FEED CURSOR IS SHARED, SO IT IS ONLY REWOUND WHEN THE BOX IS NEW.
     `fillFeed` walks `MU.lastFeed` forward through the commentary and
     APPENDS what it finds to whichever list it is handed. Rewinding it
     to zero on every render therefore does not refresh a box -- it
     replays the whole match into whichever box asks next, and the
     wide-screen layer keeps its own feed box beside the pitch. Measured
     on screen: the kick-off line printed twice under the pitch, because
     this rewound the cursor and that box then re-read lines it already
     had.

     So the body is only built, and the cursor only rewound, when the
     element it needs is not already there. Once it is, this leaves both
     the DOM and the cursor alone and the feed runs on as it should. */
  function body() {
    const b = document.getElementById('mBody');
    if (!b || !MU) return;
    MU.tab = legalTab(MU.tab);

    if (MU.tab === 'pitch') {
      if (!document.getElementById('pitchCanvas')) {
        b.innerHTML = CANVAS;
        MU.lastFeed = 0;
        try { fillFeed(document.getElementById('miniFeed'), 4); } catch (error) { /* ignore */ }
      }
      try { sizeCanvas(); } catch (error) { /* sized on the next resize */ }
      try { startRaf(); } catch (error) { /* ignore */ }
      return;
    }

    try { stopRaf(); } catch (error) { /* ignore */ }

    if (MU.tab === 'comm') {
      if (!document.getElementById('commList')) {
        b.innerHTML = '<div class="commentary" id="commList"></div>';
        MU.lastFeed = 0;
        try { fillFeed(document.getElementById('commList'), 200); } catch (error) { /* ignore */ }
      }
      return;
    }

    if (!document.getElementById('statBox')) {
      b.innerHTML = '<div id="statBox"></div>';
    }
    try { renderStats(); } catch (error) { /* ignore */ }
  }

  /* -------------------------------------------------------------------
     THE WIRING
     ------------------------------------------------------------------- */

  /* the bar: any chip that is not one of the three is taken off, and the
     lamp is set from MU.tab so something is always lit */
  function fixBar() {
    try {
      const chips = [...document.querySelectorAll('#matchScreen [data-action="mtab"]')];
      if (!chips.length) return;
      chips.forEach((c) => {
        if (ALLOWED.indexOf(c.dataset.v) < 0) c.remove();
      });
      const left = [...document.querySelectorAll('#matchScreen [data-action="mtab"]')];
      const want = legalTab(MU && MU.tab);
      let lit = false;
      left.forEach((c) => {
        const on = c.dataset.v === want;
        c.classList.toggle('on', on);
        if (on) lit = true;
      });
      if (!lit && left.length) left[0].classList.add('on');
    } catch (error) { /* ignore */ }
  }

  try {
    const pass = renderMBody;
    if (typeof pass === 'function') {
      renderMBody = function renderMBodyPinned() {
        /* the layers below still run -- they size the canvas, fit the
           feed and mark the body, and none of that is being thrown away
           -- and then the body is put right */
        let out;
        try { out = pass.apply(this, arguments); } catch (error) { out = undefined; }
        try { body(); fixBar(); } catch (error) { /* ignore */ }
        return out;
      };
      window.renderMBody = renderMBody;
    }
  } catch (error) { /* ignore */ }

  try {
    const pass = buildMatchScreen;
    if (typeof pass === 'function') {
      buildMatchScreen = function buildMatchScreenPinned() {
        if (MU) MU.tab = legalTab(MU.tab);
        const out = pass.apply(this, arguments);
        try { fixBar(); body(); } catch (error) { /* ignore */ }
        return out;
      };
      window.buildMatchScreen = buildMatchScreen;
    }
  } catch (error) { /* ignore */ }

  try {
    const pass = ACTIONS.mtab;
    if (typeof pass === 'function') {
      ACTIONS.mtab = function mtabPinned(el) {
        try {
          if (el && el.dataset) el.dataset.v = legalTab(el.dataset.v);
        } catch (error) { /* ignore */ }
        return pass.apply(this, arguments);
      };
    }
  } catch (error) { /* ignore */ }

  /* THE FRAME LOOP DRAWS THE PITCH AND NOTHING ELSE. The old one asked
     whether the tab was the Dugout and called `drawDugout`; there is no
     Dugout, and a loop that can still reach it is a loop that can still
     put the projected view on the screen. */
  try {
    startRaf = function startRafPitchOnly() {
      try { stopRaf(); } catch (error) { /* ignore */ }
      const step = () => {
        try { if (MU && MU.tab === 'pitch') drawPitch(); } catch (error) { /* ignore */ }
        MU.raf = requestAnimationFrame(step);
      };
      MU.raf = requestAnimationFrame(step);
    };
    window.startRaf = startRaf;
  } catch (error) { /* ignore */ }

  /* a match always opens on the Pitch */
  try {
    const pass = ACTIONS.kickoff;
    if (typeof pass === 'function') {
      ACTIONS.kickoff = function kickoffOnThePitch() {
        const out = pass.apply(this, arguments);
        try {
          if (MU) MU.tab = 'pitch';
          fixBar(); body();
        } catch (error) { /* ignore */ }
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    window.RBSMatchView = Object.freeze({ TABS, ALLOWED, legalTab, body, fixBar });
  } catch (error) { /* no window */ }
}());
