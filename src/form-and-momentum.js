/* global MatchSim, clamp */

/* =====================================================================
   FORM AND MOMENTUM REACH THE PITCH
   ---------------------------------------------------------------------
   "If a team is playing well and they have the momentum, that will help
    them. If the players are fit, if a player's in a good run of form and
    has scored more — all these sort of things will affect the game."

   Two of those did not. Measured by reading every term in the match
   engine's own `effA`, which is the value each attribute is actually
   worth on the day:

       position penalty · condition · sharpness · team talk · morale

   Condition, sharpness and morale are all there and all measured — the
   ladders are in scripts/measure-inputs.cjs and guarded by
   tests/manager-inputs.test.cjs. What is NOT there is form. The game
   records it: `p.form` keeps a man's last five match ratings, and
   `c.recent` keeps a club's last results. Both were written down every
   week and then read only by the awards, the press and the home screen.
   A striker on four straight sevens played exactly like a striker who
   had not kicked a ball.

   Momentum existed only INSIDE a match — `this.mom`, worth possession
   and a better build-up after a goal, decaying over about eight minutes.
   That is real and it stays. What was missing is the momentum a side
   carries INTO a match after a run of wins.

   ---------------------------------------------------------------------
   THIS IS NOT SCRIPTING, and the distinction is the one CLAUDE.md draws.
   Neither term can see who the club is, where it sits in the table, who
   it is playing or whether it is winning. They read one thing each: the
   player's OWN last five ratings, and the club's OWN last five results.
   Both are consequences of how the side has actually played, which is
   the causal direction the game is built on --

       what the manager does -> how good the side is -> the result

   -- and never the other way. A run of wins helps because the side
   earned the run; it does not exist to keep anybody near the top.

   ---------------------------------------------------------------------
   HOW BIG. Sized against the terms already there, because a new one that
   swamps them would be a worse fault than a missing one. Morale spans
   5.7% of every attribute end to end and is worth about eleven points a
   season. So roughly two points a season per one per cent of `effA`.

       player form   +/- 3.5%   a man in a good run against a bad one
       club run      +/- 2.0%   a side on a run against one on none

   Both together are worth less than morale, and far less than squad
   quality, which measures at 36 points a season up and 55 down for two
   points on every attribute. The ordering the game rests on is
   unchanged: the players you sign matter most, keeping them fit next,
   and then how they are going.
   ===================================================================== */

(function formAndMomentum() {
  'use strict';

  /* a match rating is about 6.0 to 8.0 and sits near 6.6 on an ordinary
     afternoon, so that is the point where form is worth nothing */
  const PAR = 6.6;
  const FORM_SPAN = 0.035;
  const RUN_SPAN = 0.020;

  /* HIS OWN LAST FIVE, and nothing else. Fewer than two and he has not
     been going long enough to be in a run either way. */
  function formMul(player) {
    try {
      const f = player && player.form;
      if (!Array.isArray(f) || f.length < 2) return 1;
      let sum = 0;
      for (let i = 0; i < f.length; i += 1) sum += +f[i] || PAR;
      const avg = sum / f.length;
      /* a point of rating either side of par is the whole span, so the
         difference between a run of 5.6s and a run of 7.6s is the full
         seven per cent and everything between is proportional */
      const t = Math.max(-1, Math.min(1, (avg - PAR) / 1.0));
      return 1 + t * FORM_SPAN;
    } catch (error) { return 1; }
  }

  /* THE CLUB'S OWN LAST FIVE RESULTS. A win is worth one, a draw a
     third, a defeat nothing -- and the run is measured against a side
     that takes a point a game, so an ordinary run is worth nothing and
     only a genuinely good or bad one moves it. */
  function runMul(club) {
    try {
      const r = club && club.recent;
      if (!Array.isArray(r) || r.length < 3) return 1;
      const take = r.slice(0, 5);
      let pts = 0;
      take.forEach((x) => { pts += x && x.r === 'W' ? 1 : (x && x.r === 'D' ? 0.34 : 0); });
      const per = pts / take.length;          /* 0 .. 1 */
      const t = Math.max(-1, Math.min(1, (per - 0.45) / 0.45));
      return 1 + t * RUN_SPAN;
    } catch (error) { return 1; }
  }

  /* -------------------------------------------------------------------
     WIRED THROUGH effA, WHICH IS THE ONE PLACE EVERY PHASE READS
     -------------------------------------------------------------------
     Possession, getting out of your own half, making a chance and taking
     it all go through `avg()`, and `avg()` goes through `effA`. Putting
     both terms here means neither can be missed by one phase and applied
     by another, and it survives a mentality change mid-match -- which
     rebuilds `side.mm` and would have thrown a multiplier kept there
     away.

     The club's run is worked out ONCE per side per match and stamped on
     each of that side's on-field records, because it does not change
     while the match is being played and `effA` is called thousands of
     times.
     ------------------------------------------------------------------- */
  function install() {
    if (typeof MatchSim !== 'function' || !MatchSim.prototype) return false;
    const proto = MatchSim.prototype;
    if (proto._rbsFormMomentum) return true;
    proto._rbsFormMomentum = true;

    const passEffA = proto.effA;
    proto.effA = function effAWithForm(pl, attr) {
      const base = passEffA.call(this, pl, attr);
      try {
        if (!pl || !pl.p) return base;
        let run = pl._run;
        if (run == null) run = 1;
        return base * formMul(pl.p) * run;
      } catch (error) { return base; }
    };

    return true;
  }

  /* the run is stamped when the match is built, and again if a side is
     rebuilt mid-match by a substitution */
  function stamp(side, club) {
    try {
      const mul = runMul(club);
      (side.onfield || []).forEach((x) => { if (x) x._run = mul; });
      (side.bench || []).forEach(() => {});
      side._runMul = mul;
    } catch (error) { /* an unstamped side simply plays at 1 */ }
  }

  function wireBuild() {
    if (typeof MatchSim !== 'function') return;
    const Pass = MatchSim;
    MatchSim = function MatchSimWithForm(fix) {
      const m = new Pass(fix);
      try {
        const G = window.G;
        if (G && G.clubs && m.sides) {
          stamp(m.sides[0], G.clubs[m.sides[0].ci]);
          stamp(m.sides[1], G.clubs[m.sides[1].ci]);
        }
      } catch (error) { /* both sides play at 1 */ }
      return m;
    };
    MatchSim.prototype = Pass.prototype;
    try { window.MatchSim = MatchSim; } catch (error) { /* no window */ }
  }

  try {
    install();
    wireBuild();
  } catch (error) { /* the match plays without either term */ }

  /* AND A MAN COMING OFF THE BENCH GETS HIS SIDE'S RUN TOO, or a
     substitute would play as though the club had never won a match. */
  try {
    const proto = MatchSim.prototype;
    const passSub = proto.sub;
    if (typeof passSub === 'function') {
      proto.sub = function subWithRun() {
        const out = passSub.apply(this, arguments);
        try {
          (this.sides || []).forEach((s) => {
            const mul = s && s._runMul != null ? s._runMul : 1;
            (s.onfield || []).forEach((x) => { if (x && x._run == null) x._run = mul; });
          });
        } catch (error) { /* ignore */ }
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    window.RBSFormMomentum = Object.freeze({ formMul, runMul, PAR, FORM_SPAN, RUN_SPAN });
  } catch (error) { /* no window */ }
}());
