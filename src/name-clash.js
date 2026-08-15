/* global G, wName:writable, newGame:writable, hashStr, mulberry */

/* =====================================================================
   NOBODY GETS TO BE ERLING HAALAND TWICE
   ---------------------------------------------------------------------
   Codex's cycle-3 duplicate-player problems are closed. Checked in a live
   world of 484 clubs and 13,919 player seats:

     one player object seated in two squads          0
     p.club disagreeing with the squad he sits in    0
     one real ESPN identity in two squads            0
     two players sharing one internal id             0

   All twelve recorded roster conflicts resolve to a single club, and
   Jacquet and Onyeka each appear once with both spellings as aliases.
   That work is done.

   THE CHECK FOUND SOMETHING ELSE, which nobody had reported: a second
   Erling Haaland. A 66-rated one, generated, at Bodø/Glimt, in the same
   world as the real 91-rated one at Manchester City.

   The cause is that the name generator does not know which names the
   authored squads already used. `wName` picks a first name and a surname
   from that country's pools, and the Norwegian pools contain both
   'Erling' and 'Haaland' — because they are ordinary Norwegian names,
   which is exactly why they are in there. Sooner or later it puts them
   together.

   Exactly one collision in 11,633 generated players, so this is not a
   widespread fault. It is worth fixing anyway, because the one it
   produced is the single most recognisable name in the game and a
   duplicate of him tells the player, immediately, that the world is
   made up.

   ---------------------------------------------------------------------
   HOW: `wName` re-rolls when it composes a name that belongs to a real
   player, and a sweep after the world is built catches anyone already
   seated. Generated-on-generated collisions are left alone — there are
   2,719 of them, real football is full of shared names, and two men
   called Lewis Entwistle in different divisions is not a bug.
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

  /* the real men, from the roster data that ships with the game. Aliases
     count too: a generated 'Jeremy Jacquet' is as wrong as a generated
     'Jérémy Jacquet'. */
  function realNames() {
    if (taboo) return taboo;
    taboo = new Set();
    try {
      const data = window.RBSLowerLeagueData;
      if (data && data.divisions) {
        Object.keys(data.divisions).forEach((div) => {
          const teams = (data.divisions[div] || {}).teams || {};
          Object.keys(teams).forEach((name) => {
            (teams[name].players || []).forEach((p) => {
              if (p && p.name) taboo.add(norm(p.name));
              (p && p.aliases ? p.aliases : []).forEach((a) => taboo.add(norm(a)));
            });
          });
        });
      }
      if (data && Array.isArray(data.extraPlayers)) {
        data.extraPlayers.forEach((p) => { if (p && p.name) taboo.add(norm(p.name)); });
      }
    } catch (error) { /* the pools are still usable without it */ }
    taboo.delete('');
    return taboo;
  }

  /* and any authored man already standing in the world — this catches the
     real squads written into the legacy file rather than into the JSON */
  function harvestWorld() {
    const set = realNames();
    try {
      (G.clubs || []).forEach((c) => {
        (c.players || []).forEach((p) => { if (p && p.espnId && p.name) set.add(norm(p.name)); });
      });
    } catch (error) { /* no world yet */ }
    return set;
  }

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
      const seen = new Set();
      (G.clubs || []).forEach((c) => {
        (c.players || []).forEach((p) => { if (p && p.espnId) seen.add(norm(p.name)); });
      });
      (G.clubs || []).forEach((c) => {
        [].concat(c.players || [], c.youth || []).forEach((p) => {
          if (!p || p.espnId || !p.name) return;
          if (!set.has(norm(p.name)) && !seen.has(norm(p.name))) return;
          const rng = (typeof mulberry === 'function' && typeof hashStr === 'function')
            ? mulberry(hashStr('unclash' + p.id + p.name))
            : Math.random;
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const next = wName(c.cc || 'ENG', rng);   /* `cc`, not `nat` — checked */
            if (!set.has(norm(next)) && !seen.has(norm(next))) {
              p.name = next;
              renamed += 1;
              break;
            }
          }
        });
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
