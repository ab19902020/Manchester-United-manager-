/* global G, ROSTER:writable, buildRoster, loadSlot:writable, newGame:writable, wName, mulberry, hashStr,
          shortenClub, assignAbbrs, mail */

/* =====================================================================
   A CAREER STARTED BEFORE THE WORLD WAS INVENTED
   ---------------------------------------------------------------------
   Until version 2.0 the game used real clubs, real grounds and real
   players, and a save carries all of them inside it. Loading one into
   this build would bring them straight back onto the screen. So a save
   that predates the invented world is brought into it as it loads:

     - every club takes its current name, short name and ground, matched
       by its key, which never changed (the club you founded yourself is
       yours and is left alone);
     - every player is given a name from the pools for the country his
       club plays in, seeded from his id, so the same save always gets the
       same names; nothing else about him changes -- not his ability, his
       contract, his record or his place in the side;
     - the record -- seasons, honours, cups and fixtures -- is rewritten
       with the new names of clubs, players and competitions; the old
       inbox, gossip and social feed are cleared rather than rewritten.

   A save made by this build is marked and is never touched. A name the
   player has chosen in the name editor is kept.
   ===================================================================== */
(function saveMigration() {
  'use strict';

  const MARK = 2;

  /* THE OLD NAMES OF THINGS THAT ARE NOT CLUBS OR PEOPLE -- competitions,
     broadcasters, a national stadium -- written into old saves as text.
     They have to be recognised to be replaced, and the shipped game must
     not contain them, so this table holds a hash of each old phrase and
     the invented name it becomes. Clubs and players need no table: their
     old names are read out of the save itself. */
  const PHRASES = {"2c9cf3.21":"Champions Cup","1inbx14.16":"Champions Cup","117u4xf.29":"Federation Cup","1pwo0i8.24":"Federation Cup","11awv4d.18":"Continental Cup","18iff04.13":"Continental Cup","1cmel8.17":"Federation Cup","sj066g.14":"Premier Division","gu0bls.15":"National Division","1bzktxw.10":"Third Division","30j04q.10":"Fourth Division","eq8610.6":"Challenge Cup","s84ra4.12":"Second Division","7y834h.21":"European Championship","1hjyg43.9":"World Championship","5sp5jh.14":"World Championship","1oo0z5l.7":"Primera División","1pycilp.6":"Primera División","1acasqw.7":"Prima Divisione","1b69ltt.7":"Seconda Divisione","1p32unr.13":"Zweite Liga","ujhjt2.19":"Austrian First Division","9ysn89.10":"Erste Liga","l8q2be.7":"Première Division","kyqgmf.7":"Deuxième Division","e60ieh.13":"Primeira Divisão","rjyqy6.10":"Hoofdklasse","1i0ogq5.18":"Belgian First Division","3r9avt.9":"Turkish First Division","1n8lz7e.20":"Scottish Premier Division","8qyd3o.18":"Swiss First Division","zni4dg.19":"Greek First Division","fa3vyf.18":"Czech First Division","1yqgx4g.16":"Danish First Division","1i2la2q.11":"Norwegian First Division","lxrv7v.11":"Polish First Division","1d8uicj.17":"Serbian First Division","10qnbfy.24":"Ukrainian First Division","13uncd1.3":"Croatian First Division","1hcmapj.11":"World Player of the Year","b664zx.11":"World Player of the Year","61r2ak.15":"Touchline TV","1ly2nyg.9":"Network Sport","19x6ozo.12":"The Dispatch","vv0qyn.9":"SportTalk Radio","1ft7r6u.7":"Matchday FC","1c90jdu.23":"The Evening Chronicle","xuj7cn.15":"National Stadium","j99bwk.7":"National Stadium","1ioixke.11":"League Cup","1wgkmg2.7":"League Cup","18ofvqc.15":"Stade National"};
  function phraseHash(s) {
    let x = 0x811c9dc5;
    for (const ch of s.normalize('NFC')) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
    return (x >>> 0).toString(36) + '.' + [...s].length;
  }
  const EDGE = /^[\s(\[\u00ab"'\u201c\u2018<>]+|[\s),.;:!?"'\u201d\u2019>\]]+$/g;
  /* every run of one to four words is looked up, longest first, so
     "European Championship" is matched before the "Championship" inside it */
  function rephrase(text) {
    if (typeof text !== 'string' || !text) return text;
    const words = [...text.matchAll(/\S+/g)].map((m) => ({ s: m.index, e: m.index + m[0].length }));
    let out = '', at = 0, i = 0;
    while (i < words.length) {
      let hit = null;
      for (let n = Math.min(4, words.length - i); n >= 1 && !hit; n -= 1) {
        const a = words[i].s, b = words[i + n - 1].e;
        const raw = text.slice(a, b);
        if (/\s{2,}/.test(raw)) continue;
        const lead = raw.length - raw.replace(/^[\s(\[\u00ab"'\u201c\u2018<>]+/, '').length;
        const core = raw.replace(EDGE, '');
        const to = core && PHRASES[phraseHash(core)];
        if (to != null) hit = { a: a + lead, b: a + lead + core.length, to, n };
      }
      if (hit) { out += text.slice(at, hit.a) + hit.to; at = hit.b; i += hit.n; } else i += 1;
    }
    return out + text.slice(at);
  }
  function rephraseAll(node, depth) {
    if (depth > 8 || node == null) return node;
    if (typeof node === 'string') return rephrase(node);
    if (Array.isArray(node)) { for (let k = 0; k < node.length; k += 1) node[k] = rephraseAll(node[k], depth + 1); return node; }
    if (typeof node === 'object') { Object.keys(node).forEach((k) => { node[k] = rephraseAll(node[k], depth + 1); }); }
    return node;
  }

  function rosterMap() {
    let list = null;
    try { list = (typeof buildRoster === 'function') ? buildRoster() : ROSTER; } catch (error) { list = null; }
    const map = {};
    (list || []).forEach((c) => { if (c && c.key) map[c.key] = c; });
    return map;
  }

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function migrate() {
    if (!G || !G.clubs || G.invented >= MARK) return null;
    const now = rosterMap();
    if (!Object.keys(now).length) return null;
    const pairs = [];   /* [old text, new text], applied to the stored prose */
    let clubs = 0, players = 0;

    G.clubs.forEach((c) => {
      if (!c || c.custom || c.key === '__CC__') return;
      const fresh = now[c.key];
      if (!fresh) return;
      if (c._n0) { c._n0 = fresh.name; return; }      /* renamed by the player: keep his name, fix the identity */
      if (c.name !== fresh.name) {
        pairs.push([c.name, fresh.name]);
        if (c.short && c.short !== fresh.short && c.short.length > 3) pairs.push([c.short, fresh.short]);
        if (c.stadium && fresh.stadium && c.stadium !== fresh.stadium) pairs.push([c.stadium, fresh.stadium]);
        c.name = fresh.name;
        c.short = fresh.short || (typeof shortenClub === 'function' ? shortenClub(fresh.name) : fresh.name);
        if (fresh.stadium) c.stadium = fresh.stadium;
        c.abbr = null;
        clubs += 1;
      }
    });

    /* if no club needed a new name this is not an old save, whatever it
       lacks; mark it and leave the players alone */
    if (clubs > 0) {
      const taken = new Set();
      const rename = (p, cc) => {
        if (!p || !p.name) return;
        if (p._n0) return;                             /* renamed by the player */
        const rng = mulberry(hashStr('migrate|' + p.id));
        let name = wName(cc || 'ENG', rng), k = 0;
        while (taken.has(name) && k++ < 12) name = wName(cc || 'ENG', rng);
        taken.add(name);
        pairs.push([p.name, name]);
        p.name = name;
        players += 1;
      };
      G.clubs.forEach((c) => {
        if (!c || c.custom) return;
        (c.players || []).forEach((p) => rename(p, c.cc));
        (c.youth || []).forEach((p) => rename(p, c.cc));
        c._nm = null;
      });
      (G.freeAgents || []).forEach((p) => {
        /* free agents may be stored packed, as a row: [id, name, pos, ...] */
        if (Array.isArray(p) && typeof p[1] === 'string') {
          const rng = mulberry(hashStr('migrate|' + p[0]));
          const name = wName('ENG', rng);
          pairs.push([p[1], name]); p[1] = name; players += 1;
        } else rename(p, 'ENG');
      });
      try { if (typeof assignAbbrs === 'function') assignAbbrs(G.clubs); } catch (error) { /* letters next time */ }

      /* what the roster feed and the published fixture lists left behind */
      const FACTS = ['espnId', 'nationality', 'dob', 'heightCm', 'weightKg', 'displayHeight', 'displayWeight',
        'playerProfile', 'playerFactsSource', 'playerFactsReadDate'];
      G.clubs.forEach((c) => {
        if (!c) return;
        Object.keys(c).forEach((k) => { if (/source|teamid/i.test(k)) delete c[k]; });
        [].concat(c.players || [], c.youth || []).forEach((p) => { if (p) FACTS.forEach((k) => { delete p[k]; }); });
      });
      delete G.fixtureSources;
      (G.fixtures || []).forEach((f) => { if (f) { delete f.authentic; delete f.sourceId; } });

      /* the prose: longest first, so a full name is replaced before a surname inside it */
      try { if (G.deal && G.deal.club) { const hit = pairs.find(([a]) => a === G.deal.club); if (hit) G.deal.club = hit[1]; } } catch (error) { /* unnamed */ }
      const sorted = pairs.filter(([a, b]) => a && b && a !== b && a.length >= 3)
        .sort((x, y) => y[0].length - x[0].length);
      /* the chatter goes: an inbox, a gossip column and a social feed full of
         the old world are weeks old and nobody reads them twice. What is
         kept is the record -- seasons, honours, cups, the fixtures. */
      G.inbox = []; G.unread = 0; G.gossip = []; G.buzz = []; G.fanLog = [];
      if (G.story && typeof G.story === 'object') G.story = null;
      ['history', 'honours', 'archive', 'cupHistory', 'repLog', 'cups', 'fixtures', 'tourneys', 'euroEntry'].forEach((field) => {
        if (G[field] == null) return;
        try {
          let text = JSON.stringify(G[field]);
          sorted.forEach(([a, b]) => {
            text = text.replace(new RegExp('(?<![\\p{L}])' + escRe(JSON.stringify(a).slice(1, -1)) + '(?![\\p{L}])', 'gu'),
              JSON.stringify(b).slice(1, -1));
          });
          G[field] = rephraseAll(JSON.parse(text), 0);
        } catch (error) { /* that drawer keeps its old words */ }
      });
      try {
        mail('info', '🌍 Your career, in the new world',
          'This save was started before every club, ground and player in the game was invented. It has been brought across: '
          + clubs + ' clubs have their new names and grounds, and ' + players + ' players have new names. Abilities, contracts, '
          + 'records and results are exactly as they were.');
      } catch (error) { /* no inbox */ }
    }
    G.invented = MARK;
    return { clubs, players };
  }

  if (typeof loadSlot === 'function') {
    const previous = loadSlot;
    loadSlot = function loadSlotMigrated() {
      const ok = previous.apply(this, arguments);
      try { if (ok) migrate(); } catch (error) { /* the career loads as it was */ }
      return ok;
    };
  }
  if (typeof newGame === 'function') {
    const previous = newGame;
    newGame = function newGameMarked() {
      const r = previous.apply(this, arguments);
      try { if (G) G.invented = MARK; } catch (error) { /* unmarked */ }
      return r;
    };
  }

  window.RBSSaveMigration = Object.freeze({ migrate, rephrase, MARK });
})();
