/* global G, MatchSim, ATTR_LABEL, playerById, hashStr, mulberry, clamp */
/* global openProfile:writable, openModal:writable */

/* =====================================================================
   ATTRIBUTES — what they are worth, and the ones that were missing
   ---------------------------------------------------------------------
   Asked to check the nineteen attributes mean something, I swept every
   one of them: hold the squad still, set one attribute to 5 for the
   whole side, play 150 matches, set it to 18, play 150 more, and read
   the difference in goals scored and conceded.

   The first thing that came back was how noisy the engine is. A control
   — the same squad, twice, nothing changed — swung 0.23 goals a game.
   So anything smaller than that is not a measurement.

       whole squad 5 -> 18       goals   conceded
       control                  -0.227      0.127
       passing                   0.820      0.153
       positioning               0.247      0.940
       firstTouch                0.407     -0.113
       dribbling                 0.373     -0.007
       aggression               -0.360     -0.187
       stamina                   0.347     -0.120
       tackling                 -0.060      0.287
       acceleration              0.120     -0.033
       agility                   0.080      0.200
       leadership                0.040     -0.053

   Every one of the nineteen is read by the game somewhere — none is
   decoration, and I am not claiming any of them does nothing. What the
   sweep does show is that only passing and positioning move a result by
   more than the engine's own noise, and that most attributes are one of
   three names inside an average, which is about as much leverage as a
   third of a third.

   THE HOLE IT FOUND. Goalkeepers have no goalkeeping attributes. A
   keeper's shot-stopping is `(positioning + agility) / 2` — two
   outfield attributes — and his penalty saving is `agility` alone.
   There is no handling, no reflexes, no one-on-ones, no distribution.
   Testing the keeper on his own, over 150 matches each way:

       positioning   0.133 goals prevented
       agility       0.053
       decisions    -0.033
       handling      0.207   <- an attribute that does not exist

   `handling` was a deliberate control: a made-up name, so setting it to
   5 and then 18 changes nothing at all. It "outperformed" every real
   attribute the keeper has. That is the cleanest way to say that at the
   level of one goalkeeper, nothing measurable separates a good one from
   a bad one.

   WHAT THIS ADDS. Six attributes: `handling`, `reflexes`, `oneOnOnes`
   and `distribution` for goalkeepers, `offTheBall` and `marking` for
   everybody else.

   THEY ARE DERIVED, NOT STORED. Each is worked out from the attributes a
   player already has plus a variation seeded on his own id, so it is
   stable for that player for the life of the save, moves when he trains,
   and — the point — is *different* for two players whose existing
   attributes are identical. No save file changes, nothing to migrate,
   and no overall rating moves, because none of them is in the `W` tables
   that compute it.

   THEY REACH THE ENGINE THROUGH `effA`. The save model, the penalty
   model and the pass model all ask `effA(player, attribute)` for their
   numbers. Wrapping that one method means a keeper asked for his
   `agility` answers with his hands, and a forward asked for his
   `positioning` answers with his movement — without a line of the match
   engine being touched or copied.
   ===================================================================== */

(function installAttributes() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  function guard(label, fn, fallback) {
    try {
      return fn();
    } catch (error) {
      try { console.warn('[attributes] ' + label, error); } catch (e) { /* no console */ }
      return fallback;
    }
  }

  /* Each new attribute is a blend of what the player already is, plus a
     personal variation. The blend is what stops a 12-rated keeper having
     20 reflexes; the variation is what stops two 12-rated keepers being
     the same keeper. */
  const DERIVED = {
    handling:     { from: { agility: 0.4, firstTouch: 0.4, composure: 0.2 }, spread: 3.0 },
    reflexes:     { from: { agility: 0.55, positioning: 0.3, decisions: 0.15 }, spread: 3.0 },
    oneOnOnes:    { from: { positioning: 0.4, composure: 0.35, decisions: 0.25 }, spread: 3.2 },
    distribution: { from: { passing: 0.55, vision: 0.3, firstTouch: 0.15 }, spread: 3.2 },
    offTheBall:   { from: { positioning: 0.4, decisions: 0.3, acceleration: 0.3 }, spread: 2.8 },
    marking:      { from: { positioning: 0.45, tackling: 0.35, decisions: 0.2 }, spread: 2.8 },
  };

  const GK_KEYS = ['handling', 'reflexes', 'oneOnOnes', 'distribution'];
  const OUT_KEYS = ['offTheBall', 'marking'];
  const ALL_KEYS = GK_KEYS.concat(OUT_KEYS);

  const LABELS = {
    handling: 'Handling',
    reflexes: 'Reflexes',
    oneOnOnes: 'One-on-ones',
    distribution: 'Distribution',
    offTheBall: 'Off the ball',
    marking: 'Marking',
  };

  function seededOffset(id, key, spread) {
    if (!has(window.hashStr) || !has(window.mulberry)) return 0;
    const rng = window.mulberry(window.hashStr(String(id) + ':rbs:' + key));
    return (rng() * 2 - 1) * spread;
  }

  /* Recomputed only when the attributes it is built from have actually
     moved, so training shows up and the match engine is not hashing a
     string thousands of times a game. */
  function derive(p, key) {
    if (!p || !p.attrs) return 10;
    const spec = DERIVED[key];
    if (!spec) return 10;
    /* an explicit value always wins, so a player can be authored with
       real goalkeeping numbers later without any of this changing */
    const given = p.attrs[key];
    if (typeof given === 'number') return clamp(given, 1, 20);
    let base = 0;
    let signature = 0;
    Object.keys(spec.from).forEach((src) => {
      const v = p.attrs[src];
      const n = typeof v === 'number' ? v : 10;
      base += n * spec.from[src];
      signature += Math.round(n * 4);
    });
    const cache = p._rbsDer && p._rbsDer[key];
    if (cache && cache.s === signature) return cache.v;
    const value = clamp(base + seededOffset(p.id, key, spec.spread), 1, 20);
    if (!p._rbsDer) {
      try { Object.defineProperty(p, '_rbsDer', { value: {}, enumerable: false, writable: true }); }
      catch (error) { p._rbsDer = {}; }
    }
    p._rbsDer[key] = { s: signature, v: value };
    return value;
  }

  function attrsOf(p) {
    const out = {};
    ALL_KEYS.forEach((k) => { out[k] = derive(p, k); });
    return out;
  }

  /* ---- into the engine, through the one method that reads attributes -- */

  const FWD_SLOTS = ['ST', 'AMC', 'AML', 'AMR'];
  const BACK_SLOTS = ['DC', 'DL', 'DR', 'WBL', 'WBR', 'DM'];

  /* How much of the answer comes from the new attribute. A keeper is
     mostly his hands; a forward's positioning is mostly his movement but
     not entirely, because he still has to be in the right shape. */
  function blend(pl, attr, value) {
    const p = pl && pl.p;
    if (!p || !p.attrs) return value;
    const slot = pl.slot;
    if (slot === 'GK') {
      if (attr === 'agility') {
        return value * 0.3 + (derive(p, 'handling') * 0.5 + derive(p, 'reflexes') * 0.5) * 0.7;
      }
      if (attr === 'positioning') {
        return value * 0.3 + (derive(p, 'reflexes') * 0.4 + derive(p, 'oneOnOnes') * 0.6) * 0.7;
      }
      if (attr === 'passing') {
        return value * 0.4 + derive(p, 'distribution') * 0.6;
      }
      return value;
    }
    if (attr === 'positioning') {
      if (FWD_SLOTS.indexOf(slot) >= 0) return value * 0.45 + derive(p, 'offTheBall') * 0.55;
      if (BACK_SLOTS.indexOf(slot) >= 0) return value * 0.55 + derive(p, 'marking') * 0.45;
      return value;
    }
    if (attr === 'tackling' && BACK_SLOTS.indexOf(slot) >= 0) {
      return value * 0.65 + derive(p, 'marking') * 0.35;
    }
    return value;
  }

  if (typeof MatchSim !== 'undefined' && MatchSim.prototype && has(MatchSim.prototype.effA)) {
    const previousEff = MatchSim.prototype.effA;
    MatchSim.prototype.effA = function effAWithTheMissingAttributes(pl, attr) {
      const value = previousEff.apply(this, arguments);
      if (typeof value !== 'number') return value;
      try {
        return blend(pl, attr, value);
      } catch (error) {
        return value;
      }
    };
  }

  /* ---- and onto the player's page ------------------------------------ */
  let showing = null;

  if (has(window.openProfile)) {
    const previousProfile = window.openProfile;
    window.openProfile = function openProfileRemembering(pid) {
      showing = pid;
      try {
        return previousProfile.apply(this, arguments);
      } finally {
        showing = null;
      }
    };
  }

  if (has(window.openModal)) {
    const previousModal = window.openModal;
    window.openModal = function openModalWithDerivedAttributes(html) {
      const patched = guard('profile', () => {
        if (!showing || typeof html !== 'string') return html;
        if (html.indexOf('class="attr-grid"') < 0) return html;
        const p = has(window.playerById) ? window.playerById(showing) : null;
        if (!p) return html;
        const keys = p.pos === 'GK' ? GK_KEYS : OUT_KEYS;
        const mine = p.club === G.my;
        const hide = !mine && !p.scouted;
        const cells = keys.map((k) => {
          const v = Math.round(derive(p, k));
          const cls = v >= 15 ? 'av-hi' : v >= 10 ? 'av-md' : 'av-lo';
          const shown = hide ? '<span class="v av-fog">?</span>' : '<span class="v ' + cls + '">' + v + '</span>';
          return '<div class="attr"><span class="muted">' + (LABELS[k] || k) + '</span>' + shown + '</div>';
        }).join('');
        const title = p.pos === 'GK' ? 'Goalkeeping' : 'Movement';
        const block = '<div class="chip-lbl">' + title + '</div><div class="attr-grid">' + cells + '</div>';
        /* straight after the last attribute grid on the sheet */
        const lastGrid = html.lastIndexOf('<div class="attr-grid">');
        const closeAll = lastGrid < 0 ? -1 : html.indexOf('</div>', lastGrid);
        if (closeAll < 0) return html;
        return html.slice(0, closeAll + 6) + block + html.slice(closeAll + 6);
      }, html);
      return previousModal.call(this, patched);
    };
  }

  if (typeof ATTR_LABEL !== 'undefined' && ATTR_LABEL) {
    Object.keys(LABELS).forEach((k) => { ATTR_LABEL[k] = LABELS[k]; });
  }

  try {
    window.RBSAttributes = Object.freeze({
      GK_KEYS, OUT_KEYS, ALL_KEYS, LABELS, derive, attrsOf, blend,
    });
  } catch (error) { /* no window */ }
}());
