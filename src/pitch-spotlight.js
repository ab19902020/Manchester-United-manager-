/* global MU, G, playState, dotOf, drawPitch:writable */

/* =====================================================================
   THE PITCH TELLS YOU WHERE THE BALL IS
   ---------------------------------------------------------------------
   "on the pitch mode, when I'm actually watching the game live -- on the
    little circle -- have a spot on it, a representation of what is
    happening."

   The Pitch tab is not a diagram. Underneath it is a real passing
   sequence: `playState()` holds who has the ball, the pass in flight,
   the carry, the dribble, the restart -- all of it driven by the same
   MatchSim that decides the result. It was already being animated and
   almost none of it was legible, because what you saw was twenty-two
   coloured dots on a green rectangle and a white dot two pixels across
   somewhere among them. You could not tell where the ball was, let alone
   who had it.

   So three marks, and no more than three:

     the trail      where the ball has just been, fading over about half
                    a second. A pass reads as a pass rather than as the
                    ball being somewhere else all of a sudden
     the man on it  a ring in his club's own colour around whoever has
                    possession, heavier and quicker when he is shooting
     the attack     a small arrow beside the ball for the way the side in
                    possession is going, because on a plan view with no
                    crowd and no goalposts the thing you lose first is
                    which end is which

   THERE IS NO SPOTLIGHT ANY MORE. There was: a vignette that took down
   everything outside a circle round the ball. It was drawn for a low
   projected view of a floodlit ground, that view has been taken out of
   the game, and on a flat plan view a vignette is just a dark ring over
   the football. The three marks above are the part that answers the
   question -- none of them hides anything.

   NOTHING HERE DECIDES ANYTHING. It reads `MU.ball`, `MU.dots` and
   `playState()` after the pitch has been drawn and paints over the top.
   Every line is inside a guard: if any of it is missing, or the canvas
   is not ready, the pitch is exactly the pitch it was.
   ===================================================================== */

(function pitchSpotlight() {
  'use strict';

  /* the ball's recent path, in canvas pixels. Short on purpose -- a long
     tail turns a passing move into spaghetti. */
  const TRAIL = [];
  const TRAIL_MAX = 12;
  let lastAt = 0;

  function clubOf(si) {
    try {
      const s = MU.m && MU.m.sides && MU.m.sides[si];
      return s ? G.clubs[s.ci] : null;
    } catch (error) { return null; }
  }

  function holderNow() {
    try {
      const p = (typeof playState === 'function') ? playState() : null;
      if (!p || !p.holder) return null;
      const d = (typeof dotOf === 'function') ? dotOf(p.holder) : null;
      return d ? { dot: d, si: p.si, mode: p.mode } : null;
    } catch (error) { return null; }
  }

  function paint(cv) {
    const ctx = cv.getContext('2d');
    /* the plan view's own scale: pixels per metre, set wherever the
       canvas is sized (`cv._sx = cv.width/105`) */
    const sx = cv._sx;
    const sy = cv._sy;
    if (!ctx || !(sx > 0) || !(sy > 0)) return;
    const ball = MU.ball;
    if (!ball || !Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return;

    const bx = ball.x * sx;
    const by = ball.y * sy;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();

    /* ---- the trail -------------------------------------------------
       Sampled on a timer rather than every frame, so the tail is the
       same length whatever the frame rate is doing. */
    if (now - lastAt > 34) {
      lastAt = now;
      TRAIL.push({ x: bx, y: by });
      while (TRAIL.length > TRAIL_MAX) TRAIL.shift();
    }
    /* a jump of more than fifteen metres is a restart, not a pass, and
       a tail drawn across the pitch to a goal kick is noise */
    if (TRAIL.length > 1) {
      const a = TRAIL[TRAIL.length - 1];
      const b = TRAIL[TRAIL.length - 2];
      if (Math.hypot(a.x - b.x, a.y - b.y) > 15 * sx) TRAIL.length = 1;
    }

    if (TRAIL.length > 2) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < TRAIL.length; i += 1) {
        const t = i / TRAIL.length;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.04 + t * 0.26).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.8, sx * 0.42 * t);
        ctx.beginPath();
        ctx.moveTo(TRAIL[i - 1].x, TRAIL[i - 1].y);
        ctx.lineTo(TRAIL[i].x, TRAIL[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- the man on the ball --------------------------------------- */
    const held = holderNow();
    if (held) {
      const c = clubOf(held.si);
      const hx = held.dot.x * sx;
      const hy = held.dot.y * sy;
      const shooting = held.mode === 'shot' || held.mode === 'finish';
      const pulse = 1 + Math.sin(now / (shooting ? 110 : 260)) * 0.10;
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(5.5, sx * 2.6) * pulse, 0, 7);
      ctx.lineWidth = Math.max(1.3, sx * (shooting ? 0.7 : 0.45));
      ctx.strokeStyle = shooting ? 'rgba(251,225,34,.95)'
        : ((c && c.c1) || 'rgba(255,255,255,.9)');
      ctx.stroke();
      ctx.restore();
    }

    /* ---- the ball, drawn over its own tail -------------------------- */
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(2.6, sx * 1.05), 0, 7);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(255,255,255,.8)';
    ctx.shadowBlur = Math.max(3, sx * 1.6);
    ctx.fill();
    ctx.restore();

    /* ---- which way they are going ----------------------------------- */
    if (held) {
      try {
        const dir = held.si === 0 ? 1 : -1;
        const w = Math.max(3.5, sx * 1.2);
        const ax = bx + dir * Math.max(9, sx * 4);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = (clubOf(held.si) || {}).c1 || '#fff';
        ctx.beginPath();
        ctx.moveTo(ax + dir * w, by);
        ctx.lineTo(ax - dir * w * 0.5, by - w * 0.8);
        ctx.lineTo(ax - dir * w * 0.5, by + w * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } catch (error) { /* the arrow is the least of it */ }
    }
  }

  /* WRAPPED ROUND THE LAST drawPitch, NOT ADDED TO ONE OF THEM. The
     legacy file redefines `drawPitch` nine times and the last definition
     wins; this module loads after all of them, so wrapping the global
     paints over whichever one is actually live -- including the safety
     wrapper that refuses to draw on a canvas which is not ready, since
     the canvas is checked again below. */
  function install() {
    if (typeof drawPitch !== 'function') return;
    const pass = drawPitch;
    drawPitch = function drawPitchWithMarks() {
      const out = pass.apply(this, arguments);
      try {
        if (!MU || !MU.m || MU.tab !== 'pitch') return out;
        const cv = document.getElementById('pitchCanvas');
        if (!cv || !cv.width || !cv.height) return out;
        paint(cv);
      } catch (error) { /* the pitch is still the pitch */ }
      return out;
    };
    try { window.drawPitch = drawPitch; } catch (error) { /* no window */ }
  }

  /* a new match starts with no tail behind it */
  function clear() { TRAIL.length = 0; }

  try {
    install();
    const passKick = window.ACTIONS && window.ACTIONS.kickoff;
    if (typeof passKick === 'function') {
      window.ACTIONS.kickoff = function kickoffClearingTheTrail() {
        clear();
        return passKick.apply(this, arguments);
      };
    }
  } catch (error) { /* ignore */ }

  try {
    window.RBSPitchSpotlight = Object.freeze({ paint, clear, TRAIL });
  } catch (error) { /* no window */ }
}());
