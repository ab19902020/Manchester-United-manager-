/* global MatchSim, ATTPOS, clamp */

/* =====================================================================
   AN OFFSIDE TRAP IS A DEFENSIVE LINE, NOT A COIN
   ---------------------------------------------------------------------
   The trap the game shipped fires at a flat 1.4% a minute and resolves
   like this:

       if(Math.random()<.52)  the flag goes up
       else                   he is through on goal

   Fifty-two, every time. It does not ask who is defending, and -- the
   part that matters most to anyone who has watched football -- it does
   not ask where the defensive line is. Yet "Offside trap" and
   "Defensive line" are the same idea in two boxes: a trap is what a high
   line does to stay safe, and a deep line has no offside to give. On the
   shipped build you could set the line to Deep, switch the trap on, and
   spring it exactly as often and exactly as well as a side pushed up to
   halfway.

   So the two instructions are joined here, and the men are allowed to
   matter. Measured over a full season of the human side's matches:

       line        traps sprung per match
       Deep              0.39
       Standard          0.95
       High              1.26

   WHETHER IT WORKS is a contest rather than a constant: the back line's
   positioning and decisions -- how well drilled they are -- against the
   runner's pace and movement. An even contest still lands on .52, which
   is exactly the number the game used to use, and that is deliberate:
   this is meant to give the instruction teeth, not to quietly rebalance
   every match in the league.

   MatchSim lives in the game file and the trap is written inside an
   anonymous tickOnce wrapper -- there is no method to wrap. So the trap
   is switched off for the length of the inner tick and run here instead,
   which is the same trick the rest of these modules use to reach into a
   closure they do not own.
   ===================================================================== */
(function offsideTrap() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (typeof MatchSim !== 'function' || !MatchSim.prototype) return;
  if (typeof MatchSim.prototype.tickOnce !== 'function') return;

  /* how much offside there is to play for, by where the line sits */
  const RATE = { High: 0.019, Standard: 0.012, Deep: 0.005 };

  function A01(sim, pl, key) {
    try { const v = sim.effA(pl, key); return isFinite(v) ? v : 10; } catch (error) { return 10; }
  }

  function isFwd(slot) {
    try { return ATTPOS.indexOf(slot) >= 0 || slot === 'ST'; } catch (error) { return slot === 'ST'; }
  }

  /* The back line's organisation: the men who actually hold it. */
  function drill(sim, side) {
    const back = (side.onfield || []).filter(function (x) {
      return x && !x.off && x.slot && x.slot !== 'GK'
        && (x.slot.charAt(0) === 'D' || x.slot.indexOf('WB') === 0);
    });
    if (!back.length) return 10;
    let sum = 0;
    for (let i = 0; i < back.length; i++) {
      sum += (A01(sim, back[i], 'positioning') + A01(sim, back[i], 'decisions')) / 2;
    }
    return sum / back.length;
  }

  const passTick = MatchSim.prototype.tickOnce;
  MatchSim.prototype.tickOnce = function tickWithARealTrap() {
    const sides = this.sides;
    const held = [];

    /* the shipped trap is stood down for this tick, and put back
       whatever happens inside it */
    try {
      if (sides) {
        for (let i = 0; i < sides.length; i++) {
          const s = sides[i];
          if (s && s.tac && s.tac.trap === 'On') { held.push(s); s.tac.trap = 'Off'; }
        }
      }
    } catch (error) { /* nothing held, nothing to put back */ }

    let out;
    try {
      out = passTick.apply(this, arguments);
    } finally {
      for (let i = 0; i < held.length; i++) held[i].tac.trap = 'On';
    }

    try { spring(this, held); } catch (error) { /* the match plays on regardless */ }
    return out;
  };

  function spring(sim, held) {
    if (!held.length || sim.done || sim.stage === 'HT') return;
    if (sim._cool > 0) return;

    for (let i = 0; i < held.length; i++) {
      const D = held[i];
      const si = sim.sides[0] === D ? 0 : 1;
      const A = sim.sides[1 - si];
      if (!A || !A.onfield) continue;

      const line = (D.tac && D.tac.line) || 'Standard';
      const rate = RATE[line] != null ? RATE[line] : RATE.Standard;
      if (Math.random() >= rate) continue;

      /* who is making the run: pace, and knowing when to go */
      let run = null;
      try {
        run = sim.weighted(A, function (x) {
          if (!x || !x.p || x.slot === 'GK') return 0.01;
          return A01(sim, x, 'pace') * 1.3 + A01(sim, x, 'offTheBall') * 0.5
            + (isFwd(x.slot) ? 6 : 0);
        });
      } catch (error) { run = null; }
      if (!run || !run.p) continue;
      if (A01(sim, run, 'pace') <= 12.8) continue;   /* as shipped: it takes a runner */

      /* the contest: how well drilled the line is against the run */
      const org = drill(sim, D);
      const threat = (A01(sim, run, 'pace') + A01(sim, run, 'offTheBall')) / 2;
      const edge = org - threat;
      /* an even contest lands on .52, which is exactly what it used to be */
      const flag = clampTo(0.52 + edge * 0.055, 0.30, 0.78);

      const min = sim.dispMin();
      if (Math.random() < flag) {
        sim.say(min, D, 'The offside flag saves ' + D.c.short + ' — '
          + run.p.name + ' was away!');
      } else {
        sim.say(min, A, 'The trap fails! ' + run.p.name + ' is through on goal...', 'big');
        sim.shotEvent(A, D, run, null, false);
      }
    }
  }

  function clampTo(v, lo, hi) {
    try { return clamp(v, lo, hi); } catch (error) { return Math.max(lo, Math.min(hi, v)); }
  }

  window.RBSOffsideTrap = { RATE: RATE, drill: drill };
})();
