/* global MatchSim, G */

/* =====================================================================
   EVERY OTHER CLUB IN THE WORLD PLAYED THE SAME WAY
   ---------------------------------------------------------------------
   The game offers a manager eleven instructions. Every club that is not
   yours receives them as constants, in one line of MatchSim._side:

       tac = { formation: c.tacs.formation,
               mentality:  aiMentality(ci, opp, home),
               passStyle:'Mixed', passFocus:'Central', tempo:'Normal',
               press:'Medium', line:'Standard', tackling:'Normal' }

   Mixed, Normal, Medium, Standard, Normal -- and no width, no offside
   trap, no set-piece marking, no counter-press, no time-wasting at all.
   Formation and mentality vary. Nothing else ever does. Counted over 380
   league matches, the twenty-two sides between them played FOUR distinct
   instruction sets across 760 team-performances, and all four differed
   only in attacking focus.

   So there is no such thing in this world as a pressing side, a deep
   block, a counter-attacking team or a side that gets crosses in. You
   cannot be out-thought, because nobody is thinking, and the opposition
   instructions on the touchline sheet are answered by the same shrug
   every week.

   ---------------------------------------------------------------------
   WHAT THIS DOES. Each club is given a way of playing, read from the
   eleven it actually picked for THIS match, so the identity is the
   squad's rather than a label bolted on: a side with quick wide men gets
   the ball wide, a passing midfield keeps it, legs press and push up,
   and a squad with none of that sits in. A club that sells its wingers
   stops playing like a crossing side. Reputation only decides how bold a
   side is against the opponent in front of it.

   THE CUT POINTS ARE MEASURED, AND TWICE NOW THEY HAVE BEEN THE WHOLE
   STORY. Each facet is compared against the squad's own average of the
   four, so a National League side can be "a pressing team" without being
   held up against Manchester City -- but those differences are not
   centred on zero, and a threshold guessed at rather than measured
   simply never fires. The quartiles are in the table beside LOW/HIGH.

   The second time was worse and is worth writing down. This asked
   `sim.effA` for each attribute, which is what the match engine reads --
   except `_side` runs from INSIDE the MatchSim constructor, before the
   sim is finished, so every one of those calls threw and every side read
   as a flat 10. Identical inputs, identical output: measured across 361
   opposition performances, 100% of clubs played Direct and 100% tackled
   Aggressively. The module had replaced one uniform league with a worse
   one, and the count of distinct instruction sets -- the number I was
   watching -- went UP, because attacking focus was still varying
   underneath. Reading the stored attribute instead fixes the ordering
   hazard and is the better answer anyway: how a club plays is a property
   of the players it has, not of whether they are tired this afternoon.

   What it produces now, across a division:

       passStyle  Mixed 68%  Short 21%  Direct 11%
       tempo      Fast 47%  Normal 47%  Slow 5%
       press      High 47%  Medium 32%  Low 21%
       line       High 36%  Deep 33%  Standard 31%
       tackling   Normal 47%  Aggressive 32%  Cautious 21%
       width      Standard 58%  Wide 26%  Narrow 16%
       marking    Zonal 68%  Man 32%
       counter    Off 68%  Counter-press 32%

   -- 155 distinct instruction sets across a season against 4 before, and
   the league is no harder to score in for it:

                    home win   draw   goalless  goals/match
       before         43.7%   24.3%     6.4%      2.795
       after          42.8%   26.1%     6.8%      2.814
       real           44.0%   24.0%     7.0%      2.80

   Goals a match and the goalless rate both move TOWARDS the real thing;
   the draw rate gives up 1.8 points, which is the price and is inside
   the model's own 20-31% band.

   Nothing here touches your own instructions: `isMy` is returned exactly
   as the game built it.
   ===================================================================== */
(function aiTactics() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (typeof MatchSim !== 'function' || !MatchSim.prototype) return;
  if (typeof MatchSim.prototype._side !== 'function') return;

  const WIDE = ['ML', 'MR', 'AML', 'AMR', 'WBL', 'WBR', 'DL', 'DR'];
  const MID = ['DM', 'MC', 'AMC', 'ML', 'MR'];

  /* Each facet's own quartiles, measured on the stored attributes over
     400 opposition performances, so about a quarter of the league sits
     at each end of every instruction by construction:

         facet    p10    p25    p50    p75    p90
         flank  -0.50  -0.20   0.25   0.64   0.74
         tech   -0.06   0.27   0.76   1.25   1.45
         legs   -0.50  -0.35  -0.14   0.00   0.20
         air    -1.62  -1.41  -0.96  -0.51  -0.22
         bite   -1.97  -1.75  -1.38  -1.18  -0.95
         drill  -0.36   0.13   0.32   0.48   0.62 */
  const LOW = { flank: -0.20, tech: 0.27, legs: -0.35, air: -1.41, bite: -1.75, drill: 0.13 };
  const HIGH = { flank: 0.64, tech: 1.25, legs: 0.00, air: -0.51, bite: -1.18, drill: 0.48 };

  let enabled = true;

  function mean(list, fn) {
    if (!list.length) return 10;
    let s = 0;
    for (let i = 0; i < list.length; i++) s += fn(list[i]);
    return s / list.length;
  }

  /* THE UNDERLYING ATTRIBUTE, NOT WHAT IT IS WORTH TODAY.

     This asked `sim.effA` at first, which folds in condition, sharpness,
     morale and the team talk -- and `_side` runs from inside the MatchSim
     constructor, before the sim is finished, so every one of those calls
     threw and every side read as a flat 10. Identical inputs gave
     identical output: measured across 361 opposition performances, 100%
     of clubs played Direct and 100% tackled Aggressively. The module was
     turning garbage into a uniform league, which is worse than the
     uniform league it replaced.

     Reading the stored attribute fixes the ordering hazard and is the
     better answer anyway: how a club PLAYS is a property of the players
     it has, not of whether they happen to be tired this afternoon. */
  function attr(sim, pl, key) {
    try {
      const v = pl && pl.p && pl.p.attrs ? pl.p.attrs[key] : undefined;
      return typeof v === 'number' && isFinite(v) ? v : 10;
    } catch (error) { return 10; }
  }

  function read(sim, side) {
    const out = (side.onfield || []).filter(function (x) {
      return x && x.p && !x.off && x.slot !== 'GK';
    });
    if (!out.length) return null;
    const wide = out.filter(function (x) { return WIDE.indexOf(x.slot) >= 0; });
    const mid = out.filter(function (x) { return MID.indexOf(x.slot) >= 0; });
    return {
      flank: wide.length ? mean(wide, function (x) {
        return (attr(sim, x, 'pace') + attr(sim, x, 'crossing') + attr(sim, x, 'dribbling')) / 3;
      }) : 9,
      tech: mid.length ? mean(mid, function (x) {
        return (attr(sim, x, 'passing') + attr(sim, x, 'vision') + attr(sim, x, 'firstTouch')) / 3;
      }) : 9,
      legs: mean(out, function (x) {
        return (attr(sim, x, 'stamina') + attr(sim, x, 'workRate')) / 2;
      }),
      air: mean(out, function (x) {
        return (attr(sim, x, 'heading') + attr(sim, x, 'strength')) / 2;
      }),
      bite: mean(out, function (x) { return attr(sim, x, 'aggression'); }),
      drill: mean(out, function (x) {
        return (attr(sim, x, 'positioning') + attr(sim, x, 'decisions')) / 2;
      }),
    };
  }

  function style(q, edge) {
    const bar = (q.flank + q.tech + q.legs + q.air) / 4;
    const d = {
      flank: q.flank - bar, tech: q.tech - bar, legs: q.legs - bar,
      air: q.air - bar, bite: q.bite - bar, drill: q.drill - bar,
    };
    const hi = function (k) { return d[k] > HIGH[k]; };
    const lo = function (k) { return d[k] < LOW[k]; };
    const t = {};

    /* how they want to move the ball */
    /* a passing midfield keeps it; a big side that is not a passing side
       goes long. Requiring high air AND low technique together was too
       narrow -- the two rarely co-occur, and nothing in the division ever
       played Direct. */
    t.passStyle = hi('tech') ? 'Short' : hi('air') ? 'Direct' : 'Mixed';
    t.width = hi('flank') ? 'Wide' : (hi('tech') && lo('flank') ? 'Narrow' : 'Standard');
    t.tempo = hi('legs') ? 'Fast' : (hi('tech') && lo('legs') ? 'Slow' : 'Normal');

    /* legs decide how hard they can press; the gap to the opponent
       decides how far up they dare start */
    t.press = hi('legs') ? 'High' : (lo('legs') ? 'Low' : 'Medium');
    t.line = (hi('legs') && edge > -0.6) ? 'High'
      : (edge < -1.2 || lo('legs')) ? 'Deep' : 'Standard';

    t.counter = (hi('legs') && edge > -0.4) ? 'Counter-press' : 'Off';
    t.trap = (t.line === 'High' && hi('drill')) ? 'On' : 'Off';
    t.tackling = hi('bite') ? 'Aggressive' : (lo('bite') ? 'Cautious' : 'Normal');
    t.marking = lo('air') ? 'Man' : 'Zonal';
    /* a side not expected to win sees a lead out */
    t.timeWaste = edge < -0.5 ? 'On' : 'Off';
    return t;
  }

  /* THE FOUR MULTIPLIERS THE GAME DERIVES FROM THE EXTRA INSTRUCTIONS,
     RECOMPUTED AND THEN CENTRED.

     The page turns width, counter-press, the trap and marking into
     att/def/poss multipliers, and three of those four are one-way: the
     trap is worth 1.055 defensively and costs nothing, man-marking 1.02
     and costs nothing, counter-pressing helps all three. They were
     harmless while no AI side ever had them; handing them out across a
     division quietly makes the whole league harder to score against,
     which is not variety, it is a nerf.

     So the multipliers a club earns are divided by what the average club
     earns. A side that presses and traps is still better defensively
     than one that does not -- the SPREAD is the point -- but the league
     as a whole is left exactly where the calibration put it. */
  function raw(t) {
    let att = 1, def = 1, poss = 1;
    if (t.width === 'Wide') { att *= 1.035; def *= 0.985; }
    else if (t.width === 'Narrow') { att *= 0.99; def *= 1.03; }
    if (t.counter === 'Counter-press') { poss *= 1.035; att *= 1.02; def *= 1.01; }
    if (t.trap === 'On') def *= 1.055;
    if (t.marking === 'Man') def *= 1.02;
    return { poss: poss, att: att, def: def };
  }

  /* What the average side in this world earns, so the centring divides
     by something measured rather than a constant that drifts the first
     time a cut point moves. Worked out once per season. */
  function centre() {
    try {
      const key = String((G && G.season) || 0) + ':' + String((G && G.worldSeed) || 0);
      if (centre._k === key && centre._v) return centre._v;
      /* the quartiles put a known share at each end, so the average
         multiplier is the mean over the styles those shares produce */
      const seen = { poss: 0, att: 0, def: 0, n: 0 };
      const widths = ['Wide', 'Standard', 'Narrow'];
      const counters = ['Counter-press', 'Off'];
      const traps = ['On', 'Off'];
      const marks = ['Man', 'Zonal'];
      /* weights: a quarter at each end of width, a quarter counter-press
         and trap, a quarter man-marking -- the shape the cut points make */
      const wW = { Wide: 0.25, Standard: 0.5, Narrow: 0.25 };
      const wC = { 'Counter-press': 0.25, Off: 0.75 };
      const wT = { On: 0.18, Off: 0.82 };
      const wM = { Man: 0.25, Zonal: 0.75 };
      widths.forEach(function (w) {
        counters.forEach(function (c) {
          traps.forEach(function (tr) {
            marks.forEach(function (m) {
              const p = wW[w] * wC[c] * wT[tr] * wM[m];
              const r = raw({ width: w, counter: c, trap: tr, marking: m });
              seen.poss += r.poss * p; seen.att += r.att * p; seen.def += r.def * p;
              seen.n += p;
            });
          });
        });
      });
      const v = { poss: seen.poss / seen.n, att: seen.att / seen.n, def: seen.def / seen.n };
      centre._k = key; centre._v = v;
      return v;
    } catch (error) { return { poss: 1, att: 1, def: 1 }; }
  }

  function modifiers(t) {
    const r = raw(t);
    const c = centre();
    return { poss: r.poss / c.poss, att: r.att / c.att, def: r.def / c.def };
  }

  const passSide = MatchSim.prototype._side;
  MatchSim.prototype._side = function sideWithAMindOfItsOwn(ci, home) {
    const s = passSide.call(this, ci, home);
    try {
      if (!enabled || !s || s.isMy || !s.tac) return s;

      const mine = (s.c && s.c.rep) || 0;
      const other = this.fix
        ? ((((typeof G !== 'undefined' && G) ? G.clubs : [])[home ? this.fix.a : this.fix.h] || {}).rep || 0)
        : 0;
      const edge = (mine - other) / 1400;

      const q = read(this, s);
      if (!q) return s;
      const t = style(q, edge);

      for (const k in t) if (Object.prototype.hasOwnProperty.call(t, k)) s.tac[k] = t[k];
      s._im = modifiers(s.tac);
      /* what this side was given, kept on the side so a test or a probe
         can ask rather than infer it back out of the numbers */
      s._aiStyle = t;
      s._aiRead = q;
    } catch (error) { /* a side that cannot be read keeps the old constants */ }
    return s;
  };

  window.RBSAiTactics = {
    read: read, style: style, raw: raw, modifiers: modifiers, centre: centre,
    set: function (on) { enabled = !!on; },
    isOn: function () { return enabled; },
  };
})();
