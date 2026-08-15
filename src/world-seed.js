/* global G, LEAGUES, DIV_NAMES */

/* =====================================================================
   THE WORLD IS A NUMBER
   ---------------------------------------------------------------------
   484 clubs, about 9,900 senior players and 4,032 academy boys are built
   when a career starts, and every one of them is written into the save.
   That save is 16.24 MB. CrazyGames stores 1 MB. The only shape that
   fits is to store the seed the world was built from and build it again
   on load, which requires the thing the game has never been: given the
   same seed, generation must produce the same world twice.

   It does not today. Two fresh careers in the same club, measured with
   this module switched off:

       run 1   9,899 players   hash 3c316fa3
       run 2   9,902 players   hash 6bd5ae71

   A different NUMBER OF PLAYERS. There is a seeded `mulberry` in the
   page and squads are built through it, which is what makes this look
   solved from a distance, but 317 Math.random() calls sit around it and
   enough of them are on the generation path to move the player count.

   Auditing 317 call sites one at a time would be a week of work and the
   318th would land the week after. So this module does not audit them.
   It seeds the source: for the duration of world generation, and for
   that duration only, `Math.random` IS a seeded stream. Every call site
   in the page and in the other modules reads it at call time — the page
   holds three `const rng = Math.random` aliases (`aiSquadRefresh`,
   `seedSquadDepth`, `mgrCandidate`) and all three are inside function
   bodies, so they read the slot when they run rather than at load, and
   no module holds one at all — so all 317 become deterministic in one
   move, and stay that way when somebody writes the 318th.

   The window is exactly `newGame()`. The moment it returns, the real
   `Math.random` is back and the football is as random as it ever was.
   Nothing about how the game plays changes; only how it is born.
   ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var W = window;

  /* mulberry32. The page has its own `mulberry` and it is the same
     algorithm, but this module is the thing that guarantees a save can
     be reopened, so it carries its own copy rather than depending on a
     global staying named what it is named today. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function fnv(s) {
    var h = 1779033703;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return (h >>> 0).toString(16);
  }

  /* ---- the seeded region ------------------------------------------ */

  var depth = 0;      // generation can call generation; only the outer seed counts
  var real = null;    // the browser's Math.random, held while we borrow the slot
  var draws = 0;      // how many numbers the seeded stream served, for the report

  function seeded(seed, fn) {
    if (depth === 0) {
      real = Math.random;
      var stream = mulberry32(seed);
      draws = 0;
      Math.random = function () { draws++; return stream(); };
    }
    depth++;
    try {
      return fn();
    } finally {
      depth--;
      if (depth === 0) { Math.random = real; real = null; }
    }
  }

  /* A seed is 32 bits, which is 4 bytes in the save and 4.29 billion
     worlds. Drawn from the real stream, never from the seeded one. */
  function freshSeed() {
    var r = real || Math.random;
    return (r() * 0x100000000) >>> 0;
  }

  /* ---- the state that is not the seed ------------------------------ */

  /* Seeding the stream was not enough on its own, and the reason is
     worth writing down because it is invisible from the call sites.

     `LEAGUES` and `DIV_NAMES` describe the game, not your career, so
     they deliberately live outside the save — and `buildWorld()` fills
     them in. The first `newGame()` of a page session therefore runs
     against empty tables and the second runs against tables the first
     one left behind. `buildFixtures()` asks `leagueKeys()` what exists,
     so it laid 380 rows on the first build and 1,046 on the second from
     the same seed. Those early rows are thrown away and relaid later
     either way, which is why nobody had noticed — but they are laid
     with random numbers, and drawing a different count of them shifts
     every draw after it. Same seed, different world.

     So generation starts by putting the tables back exactly as the page
     had them before any career existed. After this, a world is a pure
     function of its seed whether it is the first career of the session
     or the tenth. */
  var TABLES = [
    { name: 'LEAGUES', get: function () { try { return typeof LEAGUES !== 'undefined' ? LEAGUES : null; } catch (e) { return null; } } },
    { name: 'DIV_NAMES', get: function () { try { return typeof DIV_NAMES !== 'undefined' ? DIV_NAMES : null; } catch (e) { return null; } } },
  ];

  var pristine = null;

  function snapshotTables() {
    var out = {};
    for (var i = 0; i < TABLES.length; i++) {
      var live = TABLES[i].get();
      if (live && typeof live === 'object') {
        try { out[TABLES[i].name] = JSON.parse(JSON.stringify(live)); } catch (e) { /* not plain data; leave it alone */ }
      }
    }
    return out;
  }

  function restoreTables() {
    if (!pristine) return;
    for (var i = 0; i < TABLES.length; i++) {
      var name = TABLES[i].name;
      var snap = pristine[name];
      var live = TABLES[i].get();
      if (!snap || !live) continue;
      /* both are `const`, so they are emptied and refilled rather than
         reassigned */
      for (var k in live) if (Object.prototype.hasOwnProperty.call(live, k)) delete live[k];
      for (var j in snap) if (Object.prototype.hasOwnProperty.call(snap, j)) live[j] = snap[j];
    }
  }

  /* ---- what "the same world" means --------------------------------- */

  /* `G` is `let G=null` at the top of the page, so it is a global
     lexical binding and not a property of `window`. Classic scripts
     share that scope, so the bare name reaches it and `window.G` does
     not — a distinction that cost me a probe run. */
  function world() {
    try { return typeof G !== 'undefined' ? G : null; } catch (e) { return null; }
  }

  /* The hash has to include the things that were wrong, or it certifies
     nothing: the player count first, because that is what differed, and
     then every club and every player by the fields a save would have to
     carry. Anything left out here is something the seed is not actually
     pinning. */
  function worldHash(g) {
    var G = g || world();
    if (!G || !G.clubs) return null;
    var counts = { clubs: G.clubs.length, players: 0, youth: 0 };
    var parts = [];
    for (var i = 0; i < G.clubs.length; i++) {
      var c = G.clubs[i];
      var men = c.players || [];
      var kids = c.youth || [];
      counts.players += men.length;
      counts.youth += kids.length;
      parts.push([c.key, c.name, c.league, c.tier, c.rep, c.cap, c.budget].join('|'));
      for (var k = 0; k < men.length; k++) parts.push(playerLine(men[k]));
      for (var y = 0; y < kids.length; y++) parts.push(playerLine(kids[y]));
    }
    var free = G.freeAgents || [];
    counts.free = free.length;
    for (var f = 0; f < free.length; f++) parts.push(playerLine(free[f]));
    var fx = G.fixtures || [];
    counts.fixtures = fx.length;
    for (var x = 0; x < fx.length; x++) parts.push([fx[x].day, fx[x].h, fx[x].a, fx[x].comp || ''].join('|'));
    return {
      clubs: counts.clubs,
      players: counts.players,
      youth: counts.youth,
      free: counts.free,
      fixtures: counts.fixtures,
      hash: fnv(parts.join('\n')),
    };
  }

  function playerLine(p) {
    if (!p) return '~';
    var a = p.attrs || {};
    var keys = Object.keys(a).sort();
    var attrs = [];
    for (var i = 0; i < keys.length; i++) attrs.push(keys[i] + ':' + a[keys[i]]);
    return [p.name, p.pos, p.age, p.ovr, p.pot, p.nat || '', p.wage || 0, p.value || 0, attrs.join(',')].join('|');
  }

  /* ---- wiring ------------------------------------------------------ */

  /* Taken here, at load, and not lazily at the first `newGame()`:
     loading a save calls `rebuildWorldTables()`, so a lazy snapshot
     taken after "Continue career" would record the filled tables and
     call them pristine. */
  pristine = snapshotTables();

  var pending = null;   // a seed asked for by name, e.g. by a save being reopened

  var _newGame = W.newGame;
  W.newGame = function () {
    var seed = pending == null ? freshSeed() : pending >>> 0;
    pending = null;
    var self = this;
    var args = arguments;
    restoreTables();
    var out = seeded(seed, function () { return _newGame.apply(self, args); });
    try {
      var g = world();
      if (g) {
        g.worldSeed = seed;
        g.worldDraws = draws;   // how long the generation stream ran
      }
    } catch (e) { /* a world without a G is not a world we can stamp */ }
    return out;
  };

  W.RBSWorldSeed = {
    mulberry32: mulberry32,
    hash: worldHash,

    /* Build a world from a seed you name. This is what reopening a save
       will call once the format lands: same number in, same world out. */
    build: function (seed, myIdx) {
      pending = seed >>> 0;
      try {
        return W.newGame(myIdx);
      } finally {
        pending = null;
      }
    },

    /* Run any function against a seeded Math.random. Exposed because
       the tests want it and because a future loader will want to rebuild
       one club rather than a whole world. */
    run: function (seed, fn) { return seeded(seed, fn); },

    seedOf: function () { return W.G ? W.G.worldSeed : null; },
    draws: function () { return draws; },
    active: function () { return depth > 0; },
  };
})();
