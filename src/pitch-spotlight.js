/* global MU, G, playState, dotOf, dugProject, drawPitch:writable */

/* =====================================================================
   THE PITCH TELLS YOU WHERE THE BALL IS
   ---------------------------------------------------------------------
   "on the pitch mode, when I'm actually watching the game live -- on the
    little circle -- have a spot on it, a representation of what is
    happening."

   The 2D pitch is not a diagram. Underneath it is a real passing
   sequence: `playState()` holds who has the ball, the pass in flight,
   the carry, the dribble, the restart. All of that was already being
   animated and almost none of it was legible, because what you actually
   saw was twenty-two coloured dots drifting on a green rectangle and a
   white dot two and a half pixels across somewhere among them. You could
   not tell, at a glance, where the ball was -- let alone who had it.

   So this puts a spot on it, in the sense a floodlight puts a spot on
   something:

     the beam       everything outside a circle around the ball is taken
                    down, so the eye goes to the ball the way it goes to
                    the lit part of a stage. It is soft-edged and it
                    moves with the play rather than snapping about
     the trail      where the ball has just been, fading. A pass reads as
                    a pass rather than as the ball being somewhere else
                    all of a sudden
     the man on it  a ring, in his own club's colour, around whoever has
                    possession -- and a heavier one when he is in the act
                    of shooting
     the attack     a small arrow at the edge of the beam pointing the
                    way the side in possession is going, because on a
                    diagram with no crowd and no goalposts in view the
                    one thing you lose is which way is which

   NOTHING HERE DECIDES ANYTHING. It reads `MU.ball`, `MU.dots` and
   `playState()` after the pitch has been drawn and paints over the top.
   Every line is inside a guard: if any of it is missing, or the canvas
   is not ready, the pitch is exactly the pitch it was.
   ===================================================================== */

(function pitchSpotlight() {
  'use strict';

  /* the ball's recent path, in pitch metres. Short on purpose -- a long
     tail turns a passing move into spaghetti. */
  const TRAIL = [];
  const TRAIL_MAX = 14;
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
      return d ? { dot: d, si: p.si, mode: p.mode, pl: p.holder } : null;
    } catch (error) { return null; }
  }

  function paint(cv) {
    const ctx = cv.getContext('2d');
    if (!ctx || !cv.width || !cv.height) return;
    const ball = MU.ball;
    if (!ball || !Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return;
    if (typeof dugProject !== 'function') return;

    const P = dugProject(cv.width, cv.height);
    const at = P(ball.x, ball.y, MU.ballH || 0);
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return;
    const bx = at[0];
    const by = at[1];
    /* the projector's third value is metres-to-pixels at this depth, so
       everything below is sized in metres and comes out right whether
       the ball is on the near touchline or against the far stand */
    const sx = at[2];
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
       drawing a tail across the whole pitch to a goal kick is noise */
    if (TRAIL.length > 1) {
      const a = TRAIL[TRAIL.length - 1];
      const b = TRAIL[TRAIL.length - 2];
      if (Math.hypot(a.x - b.x, a.y - b.y) > 15 * sx) TRAIL.length = 1;
    }

    /* ---- the beam --------------------------------------------------
       Drawn as a darkening of everything OUTSIDE the circle rather than
       a bright disc inside it: a bright disc washes the club colours
       out, and the point is to make the dots easier to read, not to
       paint over them. */
    const r = Math.max(30, Math.min(sx * 17, Math.min(cv.width, cv.height) * 0.5));
    try {
      const g = ctx.createRadialGradient(bx, by, r * 0.35, bx, by, r * 1.55);
      /* GENTLE, BECAUSE THE GROUND IS ALREADY DARK. This view is a
         floodlit night match with a crowd behind it; a heavy vignette on
         top of that stops being a spotlight and starts being a hole. */
      g.addColorStop(0, 'rgba(2,8,4,0)');
      g.addColorStop(0.55, 'rgba(2,8,4,0.12)');
      g.addColorStop(1, 'rgba(2,8,4,0.30)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
    } catch (error) { /* no gradient, no beam, still a pitch */ }

    /* ---- the trail, over the beam ---------------------------------- */
    if (TRAIL.length > 2) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < TRAIL.length; i += 1) {
        const t = i / TRAIL.length;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.05 + t * 0.32).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.8, sx * 0.28 * t);
        ctx.beginPath();
        ctx.moveTo(TRAIL[i - 1].x, TRAIL[i - 1].y);
        ctx.lineTo(TRAIL[i].x, TRAIL[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- the man on the ball --------------------------------------- */
    const held = holderNow();
    const hp = held ? P(held.dot.x, held.dot.y, 0) : null;
    if (held && hp && Number.isFinite(hp[0])) {
      const c = clubOf(held.si);
      const hx = hp[0];
      const hy = hp[1];
      const shooting = held.mode === 'shot' || held.mode === 'finish';
      const pulse = 1 + Math.sin(now / (shooting ? 110 : 260)) * 0.10;
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(6, sx * 1.5) * pulse, 0, 7);
      ctx.lineWidth = Math.max(1.4, sx * (shooting ? 0.36 : 0.24));
      ctx.strokeStyle = shooting ? 'rgba(251,225,34,.95)'
        : ((c && c.c1) || 'rgba(255,255,255,.9)');
      ctx.stroke();
      ctx.restore();
    }

    /* ---- the ball itself, so the beam cannot swallow it ------------- */
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(3, sx * 0.62), 0, 7);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(255,255,255,.85)';
    ctx.shadowBlur = Math.max(4, sx * 1.1);
    ctx.fill();
    ctx.restore();

    /* ---- which way they are going ----------------------------------
       On a diagram with no goalposts in view, the thing you lose first
       is which end is which. A small arrow at the edge of the beam is
       enough and does not sit on top of the football. */
    if (held && MU.m && MU.m.sides) {
      try {
        const dir = held.si === 0 ? 1 : -1;
        const ax = bx + dir * r * 0.86;
        const ay = by;
        const w = Math.max(4, sx * 0.85);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = (clubOf(held.si) || {}).c1 || '#fff';
        ctx.beginPath();
        ctx.moveTo(ax + dir * w, ay);
        ctx.lineTo(ax - dir * w * 0.5, ay - w * 0.8);
        ctx.lineTo(ax - dir * w * 0.5, ay + w * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } catch (error) { /* the arrow is the least of it */ }
    }
  }

  /* WRAPPED ROUND THE LAST drawPitch, AND THE PAIRING TOOK FINDING.
     The legacy file redefines `drawPitch` nine times and `drawDugout`
     three, and the names no longer describe what they draw: the live
     loop calls `drawPitch`, and what `drawPitch` ends up rendering is
     the projected pitch on `#dugCanvas` -- measured by counting calls
     through a live match, 150 to drawPitch and none at all to
     drawDugout. So this wraps drawPitch and paints on dugCanvas, which
     looks like a mismatch and is the truth. */
  function install() {
    if (typeof drawPitch !== 'function') return;
    const pass = drawPitch;
    drawPitch = function drawPitchWithSpotlight() {
      const out = pass.apply(this, arguments);
      try {
        if (!MU || !MU.m) return out;
        const cv = document.getElementById('dugCanvas');
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
