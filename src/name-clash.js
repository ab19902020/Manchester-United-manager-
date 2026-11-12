/* global G, wName:writable, newGame:writable, hashStr, mulberry */

/* =====================================================================
   NOBODY GETS TO BE THE STAR TWICE
   ---------------------------------------------------------------------
   The squads at the top of the game are written out by hand -- every
   player in them is invented, but he is somebody in particular: the
   91-rated striker at Manchester Blues is one man, and the world should
   contain one of him.

   The name generator does not know which names those authored squads
   already used. `wName` picks a first name and a surname from a
   country's pools, and the pools are made of ordinary names -- which is
   exactly why the authored squads use them too. Sooner or later it puts
   the same two together, and a 66-rated namesake of the best striker in
   the world turns up in the Norwegian second tier, telling the player at
   a glance that the world is made up.

   ---------------------------------------------------------------------
   HOW: `wName` re-rolls when it composes a name an authored player
   already has, and a sweep after the world is built catches anyone
   already seated: where a name from the authored squads appears more
   than once, the best player keeps it and the others are renamed.
   Generated-on-generated collisions are left alone -- football is full
   of shared names, and two men called Lewis Entwistle in different
   divisions is not a bug.
   ===================================================================== */

(function nameClash() {
  const norm = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let taboo = null;

  /* the authored men: every name written into the squad tables that
     ship in the page. Read through `typeof` because each table is a
     lexical global that may not exist in a cut-down build. */
  function realNames() {
    if (taboo) return taboo;
    taboo = new Set();
    const rows = (list) => (list || []).forEach((p) => { if (p && p[0]) taboo.add(norm(p[0])); });
    try {
      /* eslint-disable no-undef */
      if (typeof DB !== 'undefined') DB.forEach((club) => rows(club[9]));
      if (typeof EU_DB !== 'undefined') EU_DB.forEach((club) => rows(club[9]));
      if (typeof EU2_DB !== 'undefined') EU2_DB.forEach((club) => rows(club[9]));
      if (typeof CH_SQUADS !== 'undefined') Object.keys(CH_SQUADS).forEach((key) => rows(CH_SQUADS[key]));
      if (typeof MUN_YOUTH !== 'undefined') rows(MUN_YOUTH);
      if (typeof FREE_AGENTS_2026 !== 'undefined') rows(FREE_AGENTS_2026);
      if (typeof NEW26 !== 'undefined') rows(NEW26);
      /* eslint-enable no-undef */
    } catch (error) { /* the pools are still usable without it */ }
    taboo.delete('');
    return taboo;
  }

  function harvestWorld() { return realNames(); }

  if (typeof wName === 'function') {
    const previous = wName;
    wName = function wNameUnclashed(cc, rng) {
      let out = previous.apply(this, arguments);
      try {
        const set = realNames();
        /* a bounded re-roll: if a pool is so small that every combination
           is taken, the last attempt stands rather than looping forever */
        for (let attempt = 0; attempt < 12 && set.has(norm(out)); attempt += 1) {
          out = previous.apply(this, arguments);
        }
      } catch (error) { /* the first name stands */ }
      return out;
    };
  }

  /* -------------------------------------------------------------------
     THE SWEEP
     -------------------------------------------------------------------
     `wName` is only one of the doors a name comes through, and the real
     squads in the legacy file are not in the JSON the taboo set is built
     from — so after the world exists, anyone generated who is wearing a
     real man's name is renamed. Seeded from his own id, so the same save
     renames the same man to the same thing.
     ------------------------------------------------------------------- */
  function sweep() {
    let renamed = 0;
    try {
      const set = harvestWorld();
      /* who holds each authored name: the best player wearing it keeps it */
      const holder = new Map();
      const everyone = [];
      (G.clubs || []).forEach((c) => {
        [].concat(c.players || [], c.youth || []).forEach((p) => {
          if (!p || !p.name) return;
          const key = norm(p.name);
          if (!set.has(key)) return;
          everyone.push({ p, c, key });
          const best = holder.get(key);
          if (!best || (p.ovr || 0) > (best.ovr || 0)) holder.set(key, p);
        });
      });
      everyone.forEach(({ p, c, key }) => {
        if (holder.get(key) === p) return;
        const rng = (typeof mulberry === 'function' && typeof hashStr === 'function')
          ? mulberry(hashStr('unclash' + p.id + p.name))
          : Math.random;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const next = wName(c.cc || 'ENG', rng);   /* `cc`, not `nat` — checked */
          if (!set.has(norm(next))) {
            p.name = next;
            renamed += 1;
            break;
          }
        }
      });
    } catch (error) { /* the world is unchanged */ }
    return renamed;
  }

  if (typeof newGame === 'function') {
    const previous = newGame;
    newGame = function newGameUnclashed() {
      const result = previous.apply(this, arguments);
      try { sweep(); } catch (error) { /* the world still built */ }
      return result;
    };
  }

  try {
    window.RBSNameClash = Object.freeze({ realNames, sweep, norm });
  } catch (error) { /* no window */ }
}());
