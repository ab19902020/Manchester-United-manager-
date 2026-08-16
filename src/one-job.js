/* global G, managerOf:writable, MANAGERS, worldName, mulberry, hashStr */

/* =====================================================================
   ONE MAN, ONE JOB
   ---------------------------------------------------------------------
   José Mourinho was managing Real Madrid and Benfica at the same time.
   So were fourteen other men, in pairs, across the world:

       Roberto De Zerbi    Tottenham Hotspur  |  Marseille
       Pierre Sage         Crystal Palace     |  RC Lens
       José Mourinho       Real Madrid        |  Benfica
       ... and twelve more

   TWO CAUSES, and they need different answers.

   The three real managers are in the game twice because the game holds
   two separate lists that nothing reconciles: `MANAGERS`, keyed by club
   code and curated for 2026/27, and a second list keyed by club name
   that carries a manager and an assistant for the rest of Europe. Put
   Mourinho in both and he holds both jobs.

   The other twelve are generated. A club with no entry in either list
   draws a name from its country's pool, seeded off its own key. Four
   hundred and fifty independent draws from a pool that size will collide
   — this is the birthday problem, not a bug in the draw — and nothing
   was checking.

   THE RULE. A club named in `MANAGERS` keeps its man, because that list
   is the curated one and it is the one the director confirmed: Mourinho
   is at Real Madrid. Otherwise the club that comes first in the world
   keeps him, which is arbitrary but stable. Whoever loses gets a fresh
   name from his own country's pool, drawn off a different seed. He does
   not inherit a real person's job by default, and no real manager is
   invented into a post he does not hold.

   This sits on `managerOf`, which is what every screen asks. It does not
   touch the lists, so nothing downstream has to know.
   ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var W = window;
  if (typeof W.managerOf !== 'function') return;

  var _managerOf = W.managerOf;
  var map = null;      // club index -> the name that club actually uses
  var token = '';      // what the map was built for

  function clubs() {
    try { return (typeof G !== 'undefined' && G && G.clubs) ? G.clubs : null; } catch (e) { return null; }
  }

  function raw(club) {
    try { return _managerOf.call(W, club); } catch (e) { return null; }
  }

  /* Named in the curated list, so this club is where the man really is. */
  function curated(club) {
    try {
      return !!(typeof MANAGERS === 'object' && MANAGERS && club && MANAGERS[club.key]);
    } catch (e) { return false; }
  }

  /* A plausible replacement from the losing club's own country, seeded
     off the club so it is the same every time the world is built. */
  function freshName(club, taken, attempt) {
    try {
      var rng = mulberry(hashStr('one-job:' + (club.key || club.i) + ':' + attempt));
      var name = worldName(club.cc || 'ENG', rng, taken);
      if (name && !taken.has(name)) return name;
    } catch (e) { /* fall through */ }
    return null;
  }

  function build() {
    var list = clubs();
    if (!list) return null;
    var assigned = {};
    var taken = new Set();

    /* the curated clubs first, so they never lose a name to a club that
       merely happens to sit earlier in the world */
    var order = [];
    for (var i = 0; i < list.length; i++) if (curated(list[i])) order.push(i);
    for (var j = 0; j < list.length; j++) if (!curated(list[j])) order.push(j);

    for (var k = 0; k < order.length; k++) {
      var ix = order[k];
      var club = list[ix];
      var name = raw(club);
      if (!name || name === 'You') { assigned[ix] = name; continue; }
      if (!taken.has(name)) { assigned[ix] = name; taken.add(name); continue; }

      /* somebody already has this job */
      var replacement = null;
      for (var attempt = 0; attempt < 24 && !replacement; attempt++) {
        replacement = freshName(club, taken, attempt);
      }
      if (!replacement) replacement = name + ' (caretaker)';
      assigned[ix] = replacement;
      taken.add(replacement);
    }
    return assigned;
  }

  function signature() {
    var list = clubs();
    if (!list) return '';
    var g = (typeof G !== 'undefined' && G) ? G : {};
    /* rebuilt when the world changes shape or a season turns, which is
       when managers move */
    return list.length + ':' + (g.season || 0) + ':' + (g.my == null ? -1 : g.my)
      + ':' + (g._mgrChanges || 0);
  }

  W.managerOf = function oneJobManagerOf(club) {
    if (!club) return _managerOf.apply(this, arguments);
    try {
      var sig = signature();
      if (!map || sig !== token) { map = build(); token = sig; }
      if (map && Object.prototype.hasOwnProperty.call(map, club.i)) return map[club.i];
    } catch (e) { /* fall back to the game's own answer */ }
    return _managerOf.apply(this, arguments);
  };

  W.RBSOneJob = {
    /* forget the map — for the tests, and for anything that moves a
       manager mid-season */
    refresh: function () { map = null; token = ''; },

    /* every name held by more than one club, which should always be
       empty once this module is loaded */
    duplicates: function () {
      var list = clubs();
      if (!list) return [];
      var by = {};
      for (var i = 0; i < list.length; i++) {
        var n = null;
        try { n = W.managerOf(list[i]); } catch (e) { n = null; }
        if (!n || n === 'You') continue;
        (by[n] = by[n] || []).push(list[i].name);
      }
      return Object.keys(by).filter(function (n) { return by[n].length > 1; })
        .map(function (n) { return { name: n, clubs: by[n] }; });
    },
  };
})();
