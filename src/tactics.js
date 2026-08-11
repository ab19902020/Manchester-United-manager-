/* global G, MU, MatchSim, tacRow, TAC_HINT, playState */
/* global vTactics:writable, choosePass:writable */

/* =====================================================================
   TACTICS — an attacking focus you can actually dial, instead of a
   switch with no off position
   ---------------------------------------------------------------------
   The report was "if I click attack down the centre it will only
   literally attack down the centre, and there is no mixed". Both halves
   are true, and measuring them turned up something worse underneath.

   1. THERE IS NO NEUTRAL. The row offers Left Flank, Central, Right
      Flank and nothing else, so every save ever played has been
      committed to a channel. There is no way to say "play it wherever
      it is on".

      The engines already cope with a neutral perfectly well — every
      focus branch is an `if/else if` chain with no `else`, so a value
      they do not recognise produces no bias at all. The setting existed
      and could not be chosen.

   2. THE TWO ENGINES DISAGREE ABOUT WHAT THE SETTING MEANS. The match
      you watch and the result you get are built by different code, and
      the focus lands on them very differently. In `choosePass`, which
      drives the 2D match, Central multiplies every central receiver by
      1.5 and every wide one by 0.7 — a 2.14:1 lean applied to every
      pass of every move, which is exactly why it looks like the ball
      never goes near a touchline.

      In the simulated engine it is close to decorative. Measured over
      80 matches per setting, chances by the channel they were created
      in:

          focus          left   central   right
          Balanced       12.3%    49.8%   37.9%
          Central        10.6%    52.9%   36.4%
          Left Flank     21.2%    40.9%   37.9%
          Right Flank    12.3%    38.5%   49.1%

      Choosing Central moves chance creation by three percentage points.
      So the instruction is overwhelming in the game you watch and
      almost nothing in the game that decides the score.

   3. EVERY AI CLUB IN THE WORLD IS HARD-WIRED TO CENTRAL. `_side` builds
      the opposition's tactics fresh for every match with a literal
      `passFocus:'Central'`, so nobody in the game has ever played down
      a wing on purpose.

   WHAT THIS DOES

   Adds `Balanced` to the row, and a second row — `Focus strength` —
   with `Slight` and `Strong`. Slight is a lean; Strong is the
   commitment the game used to force on you. And it applies the same
   setting to both engines, so what you watch and what you get move
   together.

   HOW, WITHOUT REWRITING THE PASS MODEL. The engines only understand
   three hard values, and a strength dial needs values in between. Rather
   than copy 25 lines of pass weighting out of the 2D engine — which
   would rot the moment anybody touches it — each individual decision
   draws whether it is a biased one. Strong biases every decision; Slight
   biases a fraction of them. The result is a genuine half-strength lean
   made out of the engine's own weighting, and the engine is untouched.
   The value is put back in a `finally`, so a tactic is never left
   changed behind the player's back.

   Opposition clubs now pick a focus from where their best creator
   actually plays, at slight strength, instead of all funnelling through
   the middle.
   ===================================================================== */

(function installTactics() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  function guard(label, fn, fallback) {
    try {
      return fn();
    } catch (error) {
      try { console.warn('[tactics] ' + label, error); } catch (e) { /* no console */ }
      return fallback;
    }
  }

  const BALANCED = 'Balanced';
  const FOCUS_OPTIONS = [BALANCED, 'Left Flank', 'Central', 'Right Flank'];
  const POWER_OPTIONS = ['Slight', 'Strong'];
  /* How often a Slight focus actually biases a decision. Half-ish, so the
     lean is visible over a move without owning it. */
  const SLIGHT = 0.45;

  const LEFT_SLOTS = ['DL', 'WBL', 'ML', 'AML'];
  const RIGHT_SLOTS = ['DR', 'WBR', 'MR', 'AMR'];

  /* ---- the setting -------------------------------------------------- */

  function powerOf(tac) {
    const p = tac && tac.focusPower;
    return p === 'Strong' ? 'Strong' : 'Slight';
  }

  function focusOf(tac) {
    const f = tac && tac.passFocus;
    return FOCUS_OPTIONS.indexOf(f) > 0 ? f : BALANCED;
  }

  /* One decision's worth of the instruction. Strong means every decision,
     Slight means some of them; the engine sees a value it already knows
     either way. */
  function decide(tac) {
    const f = focusOf(tac);
    if (f === BALANCED) return BALANCED;
    if (powerOf(tac) === 'Strong') return f;
    return Math.random() < SLIGHT ? f : BALANCED;
  }

  /* Run `fn` with every side's focus resolved for one decision, and put
     the tactics back exactly as they were whatever happens. */
  function withResolvedFocus(sides, fn) {
    const saved = [];
    (sides || []).forEach((s) => {
      if (!s || !s.tac) return;
      saved.push([s.tac, s.tac.passFocus]);
      s.tac.passFocus = decide(s.tac);
    });
    try {
      return fn();
    } finally {
      saved.forEach((row) => { row[0].passFocus = row[1]; });
    }
  }

  /* Every save made before this existed had `Central` on it, because that
     is what the game set and there was no other neutral to choose. That
     is not a decision anybody made, so it becomes Balanced. A flank was a
     real choice and is left alone. */
  function normalise(tac) {
    if (!tac) return;
    if (POWER_OPTIONS.indexOf(tac.focusPower) < 0) {
      if (tac.passFocus === 'Central') tac.passFocus = BALANCED;
      tac.focusPower = 'Slight';
    }
    if (FOCUS_OPTIONS.indexOf(tac.passFocus) < 0) tac.passFocus = BALANCED;
  }

  /* ---- what the opposition does -------------------------------------
     Where their best creator plays, rather than always through the
     middle. */
  function focusForSquad(side) {
    return guard('aiFocus', () => {
      const on = (side && side.onfield) || [];
      if (!on.length) return BALANCED;
      const best = { left: 0, central: 0, right: 0 };
      on.forEach((x) => {
        if (!x || x.off || !x.p) return;
        const attrs = x.p.attrs || {};
        const v = (attrs.vision || 10) + (attrs.crossing || 10) * 0.5;
        const lane = LEFT_SLOTS.indexOf(x.slot) >= 0 ? 'left'
          : RIGHT_SLOTS.indexOf(x.slot) >= 0 ? 'right' : 'central';
        if (v > best[lane]) best[lane] = v;
      });
      /* a wing is only worth targeting if it is clearly the best route */
      const edge = 1.08;
      if (best.left > best.right * edge && best.left > best.central * edge) return 'Left Flank';
      if (best.right > best.left * edge && best.right > best.central * edge) return 'Right Flank';
      if (best.central > best.left * edge && best.central > best.right * edge) return 'Central';
      return BALANCED;
    }, BALANCED);
  }

  /* ---- 1. the tactics screen ---------------------------------------- */
  if (typeof TAC_HINT !== 'undefined' && TAC_HINT) {
    TAC_HINT.passFocus = 'Which channel your creators look for first. Balanced plays it wherever it is on.';
    TAC_HINT.focusPower = 'Slight leans that way; Strong commits to it and gives up the other side.';
  }

  if (has(window.vTactics)) {
    const previousTactics = window.vTactics;
    window.vTactics = function vTacticsWithFocusStrength() {
      normalise(G.tacs);
      const html = previousTactics.apply(this, arguments);
      return guard('view', () => {
        if (!has(window.tacRow)) return html;
        const rows = window.tacRow('Attacking focus', 'passFocus', FOCUS_OPTIONS) +
          window.tacRow('Focus strength', 'focusPower', POWER_OPTIONS);
        /* the whole existing block for this instruction: label, chips and
           the hint under them */
        const block = /<div class="chip-lbl">Attacking focus<\/div><div class="chips">[\s\S]*?<\/div><div class="xs faint"[^>]*>[\s\S]*?<\/div>/;
        if (!block.test(html)) return html;
        return html.replace(block, rows);
      }, html);
    };
  }

  /* ---- 2. the simulated engine -------------------------------------- */
  if (typeof MatchSim !== 'undefined' && MatchSim.prototype) {
    const previousSide = MatchSim.prototype._side;
    MatchSim.prototype._side = function sideWithItsOwnIdeas(ci) {
      const s = previousSide.apply(this, arguments);
      guard('side', () => {
        if (!s || !s.tac) return;
        if (ci === G.my) {
          normalise(G.tacs);        /* the stored tactic, so it sticks */
          normalise(s.tac);         /* and this match's copy of it */
          return;
        }
        s.tac.passFocus = focusForSquad(s);
        s.tac.focusPower = 'Slight';
      });
      return s;
    };

    /* One tick builds at most one chance, so one draw per tick is exactly
       one draw per decision. */
    const previousTick = MatchSim.prototype.tickOnce;
    MatchSim.prototype.tickOnce = function tickWithResolvedFocus() {
      const self = this;
      return withResolvedFocus(this.sides, () => previousTick.apply(self, arguments));
    };
  }

  /* ---- 3. the match you watch ---------------------------------------- */
  if (has(window.choosePass)) {
    const previousChoose = window.choosePass;
    window.choosePass = function choosePassWithResolvedFocus() {
      const self = this;
      const args = arguments;
      const m = (typeof MU !== 'undefined' && MU && MU.m) || null;
      if (!m || !m.sides) return previousChoose.apply(self, args);
      return withResolvedFocus(m.sides, () => previousChoose.apply(self, args));
    };
  }

  try {
    window.RBSTactics = Object.freeze({
      FOCUS_OPTIONS, POWER_OPTIONS, SLIGHT, focusOf, powerOf, decide, focusForSquad,
    });
  } catch (error) { /* no window */ }
}());
