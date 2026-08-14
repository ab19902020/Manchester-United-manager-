/* global G, newGame, loadSlot, autoPick, FORMATIONS */

/* =====================================================================
   SQUAD IDENTITY — one man, one squad, whatever he is spelled
   ---------------------------------------------------------------------
   Codex logged three duplicate players in their cycle 3 and they have
   been open since, marked as theirs. Codex and Agent One are away until
   Saturday, so I have taken this one; it is a correctness bug in the
   squads and the fix is game code, which is mine anyway.

   WHAT IS ACTUALLY WRONG. The legacy file carries a summer-2026 signing
   list that places real transfers into the world. Both the lookup that
   decides whether a signing already exists —

       (c.players || []).find(x => x.name === nm)

   — and the duplicate sweep that follows it key on the exact string. So
   two spellings of one man are two men:

     Liverpool  "Jeremy Jacquet"   (base squad)
                "Jérémy Jacquet"   (the signing list)

   The signing is not found, so it is created rather than moved, and the
   sweep that exists specifically to catch this cannot see it either
   because the strings differ by two accents. Liverpool play the season
   with both.

   The harder case is a man under two different names rather than two
   spellings of one: Frank Onyeka is listed at Brentford and Ogochukwu
   Onyeka at Coventry. No amount of string folding joins those.

   ---------------------------------------------------------------------
   CODEX'S OWN DATA ALREADY SOLVES IT. The biography pass they ran stores
   an `aliases` array per player against an ESPN id:

     355980  Jérémy Jacquet   [ "Jérémy Jacquet", "Jeremy Jacquet" ]
     258491  Frank Onyeka     [ "Frank Onyeka", "Ogochukwu Onyeka" ]

   Thirty-six players carry more than one alias. So identity does not
   have to be guessed from spelling — it can be looked up. Every alias
   maps to one id, and a player whose name matches any alias is that
   player. Folding accents is only the fallback for the eight thousand
   players outside England, who have no sourced identity at all.

   That is worth saying plainly because it is the argument for the whole
   biography cycle: the aliases were collected to get names right, and
   they turn out to be what fixes a duplication bug nobody had linked to
   them.
   ===================================================================== */

(function squadIdentity() {
  /* ---------------------------------------------------------------
     KEYS
     --------------------------------------------------------------- */

  /* Accents, case, punctuation and double spaces removed. "Jérémy
     Jacquet" and "Jeremy Jacquet" land on the same string; "Frank
     Onyeka" and "Ogochukwu Onyeka" do not, which is what the alias
     table is for. */
  function fold(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let aliasIndex = null;

  function buildAliasIndex() {
    const index = new Map();
    try {
      const data = (typeof window !== 'undefined') && window.RBSLowerLeagueData;
      if (!data) return index;
      const seen = new Set();
      const walk = (node) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (Array.isArray(node.players)) {
          node.players.forEach((p) => {
            if (!p || !p.id) return;
            const names = Array.isArray(p.aliases) && p.aliases.length ? p.aliases : [p.name];
            names.forEach((alias) => {
              const key = fold(alias);
              /* An alias shared by two different ids is not an identity,
                 it is a coincidence — two real men called Adam Smith.
                 Those are dropped rather than merged. */
              if (!key) return;
              if (index.has(key) && index.get(key).id !== p.id) { index.set(key, null); return; }
              if (index.has(key) && index.get(key) === null) return;
              index.set(key, { id: String(p.id), name: p.name });
            });
          });
        }
        Object.keys(node).forEach((k) => walk(node[k]));
      };
      walk(data);
    } catch (error) { /* fall back to folding alone */ }
    /* strip the poisoned entries */
    [...index.entries()].forEach(([k, v]) => { if (!v) index.delete(k); });
    return index;
  }

  function identityOf(player) {
    if (!aliasIndex) aliasIndex = buildAliasIndex();
    const key = fold(player && player.name);
    if (!key) return null;
    const known = aliasIndex.get(key);
    return known ? 'espn:' + known.id : 'name:' + key;
  }

  function canonicalName(player) {
    if (!aliasIndex) aliasIndex = buildAliasIndex();
    const known = aliasIndex.get(fold(player && player.name));
    return known ? known.name : null;
  }

  /* ---------------------------------------------------------------
     THE SWEEP
     --------------------------------------------------------------- */
  /* -----------------------------------------------------------------
     AN ID IS AN IDENTITY. A NAME IS NOT.
     -----------------------------------------------------------------
     The first version of this swept the whole world on the folded name
     and removed 1,884 players across 354 clubs, taking the game from
     9,908 to 8,023. It "fixed" Jacquet and Onyeka and gutted nineteen
     per cent of the squads doing it, because the generated name pool
     collides: Sebastian Wagner at Bayern and Sebastian Wagner at
     Schalke are two different made-up men, and real football is full of
     this too — two Adam Smiths, two Ben Davieses, both in the sourced
     data.

     So the two cases are treated differently, and the distinction is
     the whole fix:

       a player the source can identify  ->  one man, one squad,
                                             swept across the world
       everybody else                    ->  swept within his own club
                                             only, never across

     The same name twice in one squad is always a bug — nobody plays
     against himself. The same name at two clubs is only a bug when we
     have an id saying it is one man.
     ----------------------------------------------------------------- */
  function dedupeWorld() {
    const report = { duplicates: 0, sameSquad: 0, renamed: 0, clubs: 0, examples: [] };
    try {
      if (!G || !Array.isArray(G.clubs)) return report;

      const dropped = new Set();

      /* ---- pass one: identified players, across the whole world ---- */
      const best = new Map();
      G.clubs.forEach((club) => {
        (club.players || []).forEach((p) => {
          const id = identityOf(p);
          if (!id || id.indexOf('espn:') !== 0) return;
          const held = best.get(id);
          if (!held || (p.ovr || 0) > (held.player.ovr || 0)) best.set(id, { player: p, club });
        });
      });

      G.clubs.forEach((club) => {
        const before = (club.players || []).length;
        club.players = (club.players || []).filter((p) => {
          const id = identityOf(p);
          if (!id || id.indexOf('espn:') !== 0) return true;
          const keep = best.get(id);
          if (keep && keep.player !== p) {
            dropped.add(p.id);
            if (report.examples.length < 8) {
              report.examples.push(p.name + ' at ' + club.name
                + ' (kept ' + keep.player.name + ' at ' + keep.club.name + ')');
            }
            return false;
          }
          return true;
        });
        const lost = before - club.players.length;
        if (lost) { report.duplicates += lost; report.clubs += 1; }
      });

      /* ---- pass two: everybody else, inside his own squad only ---- */
      G.clubs.forEach((club) => {
        const keptHere = new Map();
        const before = (club.players || []).length;
        club.players = (club.players || []).filter((p) => {
          const id = identityOf(p);
          if (!id) return true;
          const held = keptHere.get(id);
          if (!held) { keptHere.set(id, p); return true; }
          /* keep the better of the two, drop the other */
          if ((p.ovr || 0) > (held.ovr || 0)) {
            dropped.add(held.id);
            keptHere.set(id, p);
            const at = club.players.indexOf(held);
            if (at >= 0) club.players[at] = null;
            return true;
          }
          dropped.add(p.id);
          return false;
        });
        club.players = club.players.filter(Boolean);
        report.sameSquad += before - club.players.length;
      });

      /* and give the survivor the spelling the source uses, so the two
         versions of a name never diverge again */
      G.clubs.forEach((club) => {
        (club.players || []).forEach((p) => {
          const proper = canonicalName(p);
          if (proper && proper !== p.name) { p.name = proper; report.renamed += 1; }
        });
      });

      /* A dropped player must not still be named in the XI, or the
         team sheet has a hole where a man used to be. */
      if (dropped.size && G.tacs && Array.isArray(G.tacs.xi)) {
        const holed = G.tacs.xi.some((id) => dropped.has(id));
        if (holed) {
          try {
            G.tacs.xi = autoPick(G.my, G.tacs.formation);
          } catch (error) {
            G.tacs.xi = G.tacs.xi.map((id) => (dropped.has(id) ? null : id));
          }
        }
      }
    } catch (error) { /* a world with duplicates still plays */ }
    return report;
  }

  /* ---------------------------------------------------------------
     WIRING — after the world exists, and after a save is loaded,
     because an old save carries the duplicates it was built with.
     --------------------------------------------------------------- */
  if (typeof newGame === 'function') {
    const previousNew = newGame;
    newGame = function newGameDeduped() {
      const result = previousNew.apply(this, arguments);
      try { G._identity = dedupeWorld(); } catch (error) { /* keep the world */ }
      return result;
    };
  }

  if (typeof loadSlot === 'function') {
    const previousLoad = loadSlot;
    loadSlot = function loadSlotDeduped() {
      const ok = previousLoad.apply(this, arguments);
      try { if (ok) G._identity = dedupeWorld(); } catch (error) { /* keep the save */ }
      return ok;
    };
  }

  try {
    window.RBSIdentity = Object.freeze({ fold, identityOf, canonicalName, dedupeWorld });
  } catch (error) { /* no window */ }
}());
