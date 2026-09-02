/* global G, TECH, MENT, PHYS, divMembers, esc */

/* =====================================================================
   WHAT KIND OF FOOTBALLER IS HE?
   ---------------------------------------------------------------------
   A player's card carries his nineteen attributes in three tidy groups,
   his condition, his sharpness, his morale, his value and his contract.
   Everything a spreadsheet wants and nothing a scout would say. Two
   strikers on 82 look identical on that card; one of them lives on the
   shoulder of the last man and the other wants it into his feet with his
   back to goal, and the card cannot tell you which.

   Two things are added, both read from numbers the game already owns.

   HIS ROLE, worked out from what he is actually good at rather than
   typed in by hand: a striker with pace and movement and no heading is a
   Poacher, one with heading and strength is a Target man, a centre-half
   who can pass is a Ball-playing defender. The role is the best fit
   among the ones his position allows, so it changes as he develops --
   a winger who fills out becomes something else, and the card says so.

   AND WHAT HE IS GOOD AT, IN CONTEXT. Fourteen for pace means one thing
   for a centre-half and another for a winger, so every attribute is
   ranked against the players in HIS position in HIS division. "Quick"
   on this card means quick for a Championship left-back, which is the
   only sense in which the word is useful.

   ---------------------------------------------------------------------
   WHAT IS DELIBERATELY NOT HERE: A PREFERRED FOOT. It is the first thing
   missing from these cards and the obvious thing to add -- the game has
   no notion of footedness anywhere. But this game ships real players,
   and the only way to fill that column is to invent it from a hash of
   the player's id. Getting it wrong for Bruno Fernandes is exactly the
   sort of thing the people who play this will notice, and a card that
   states a fact confidently and wrongly is worse than a card that leaves
   it out. It needs sourcing, not generating.
   ===================================================================== */
(function playerIdentity() {
  'use strict';
  if (typeof window === 'undefined') return;

  /* Each role is a handful of attributes that matter and a couple that
     rule it out. The score is the mean of what it wants, less what it
     cannot do without. */
  const ROLES = {
    GK: [
      ['Sweeper keeper', ['positioning', 'decisions', 'pace', 'passing']],
      ['Shot stopper', ['agility', 'positioning', 'composure']],
    ],
    DC: [
      ['Ball-playing defender', ['passing', 'composure', 'vision', 'firstTouch']],
      ['No-nonsense centre-half', ['heading', 'strength', 'tackling', 'aggression']],
      ['Covering defender', ['pace', 'positioning', 'decisions']],
    ],
    FB: [
      ['Overlapping full-back', ['pace', 'stamina', 'crossing', 'workRate']],
      ['Inverted full-back', ['passing', 'vision', 'decisions', 'firstTouch']],
      ['Defensive full-back', ['tackling', 'positioning', 'strength']],
    ],
    DM: [
      ['Ball-winner', ['tackling', 'aggression', 'workRate', 'strength']],
      ['Deep-lying playmaker', ['passing', 'vision', 'composure', 'firstTouch']],
      ['Anchor man', ['positioning', 'decisions', 'tackling']],
    ],
    MC: [
      ['Box-to-box midfielder', ['stamina', 'workRate', 'pace', 'tackling']],
      ['Playmaker', ['vision', 'passing', 'firstTouch', 'composure']],
      ['Late-arriving midfielder', ['shooting', 'positioning', 'heading']],
    ],
    WIDE: [
      ['Touchline winger', ['pace', 'acceleration', 'crossing', 'dribbling']],
      ['Inside forward', ['shooting', 'dribbling', 'firstTouch', 'composure']],
      ['Wide playmaker', ['vision', 'passing', 'decisions']],
      ['Hard-working wide man', ['workRate', 'stamina', 'tackling']],
    ],
    AMC: [
      ['Number ten', ['vision', 'passing', 'firstTouch', 'composure']],
      ['Shadow striker', ['shooting', 'positioning', 'pace', 'composure']],
    ],
    ST: [
      ['Poacher', ['positioning', 'composure', 'shooting', 'acceleration']],
      ['Target man', ['heading', 'strength', 'firstTouch']],
      ['Complete forward', ['shooting', 'dribbling', 'passing', 'pace', 'strength']],
      ['Runner in behind', ['pace', 'acceleration', 'stamina', 'shooting']],
    ],
  };

  function groupOf(pos) {
    if (pos === 'GK') return 'GK';
    if (pos === 'DC') return 'DC';
    if (pos === 'DL' || pos === 'DR' || pos === 'WBL' || pos === 'WBR') return 'FB';
    if (pos === 'DM') return 'DM';
    if (pos === 'MC') return 'MC';
    if (pos === 'ML' || pos === 'MR' || pos === 'AML' || pos === 'AMR') return 'WIDE';
    if (pos === 'AMC') return 'AMC';
    return 'ST';
  }

  function attrs(p) { return (p && p.attrs) || {}; }

  /* SCORED ON PERCENTILE, NOT ON THE RAW NUMBERS. The first version took
     the mean of each role's attributes and compared those means, which
     is only valid if every attribute is distributed the same way -- and
     they are not. Centre-halves carry high heading and strength and low
     passing, so "No-nonsense centre-half" beat "Ball-playing defender"
     76 times to 0 across a division, and Ball-winner, Deep-lying
     playmaker and Shadow striker turned up once or twice between them.

     Ranking each attribute against players in the same position first
     asks the right question: not "is his passing high" but "is his
     passing high FOR A CENTRE-HALF". */
  function roleOf(p) {
    try {
      const list = ROLES[groupOf(p.pos)];
      if (!list) return null;
      const pct = pctMap(p);
      const a = attrs(p);
      let best = null, bs = -1e9;
      for (let i = 0; i < list.length; i++) {
        const keys = list[i][1];
        let s = 0, n = 0;
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          const v = pct ? pct[key] : (typeof a[key] === 'number' ? a[key] * 5 : undefined);
          if (typeof v === 'number') { s += v; n++; }
        }
        if (!n) continue;
        const score = s / n;
        if (score > bs) { bs = score; best = list[i][0]; }
      }
      return best;
    } catch (error) { return null; }
  }

  /* ---- what he is good at, against his own kind -------------------- */

  /* The players he is really compared to: the same position, in the same
     division. Ranking a League Two centre-half against the Premier
     League tells you he is slow; ranking him against League Two centre-
     halves tells you whether to play him. */
  function peers(p) {
    try {
      const club = G.clubs[p.club];
      if (!club) return null;
      const div = club.league;
      const out = [];
      const mem = (typeof divMembers === 'function') ? divMembers(div) : null;
      if (!mem) return null;
      for (let i = 0; i < mem.length; i++) {
        const men = (G.clubs[mem[i]] || {}).players || [];
        for (let j = 0; j < men.length; j++) if (men[j].pos === p.pos) out.push(men[j]);
      }
      return out.length >= 8 ? out : null;
    } catch (error) { return null; }
  }

  /* A KEEPER'S SHOOTING IS NOT A STRENGTH. Ranking all nineteen for
     everybody produced "his first touch, pace and shooting are
     outstanding for a GK", because a goalkeeper's outfield attributes
     are compared only against other goalkeepers and some of them come
     out high. Each position is ranked on the attributes that decide
     whether he is any good at his actual job. */
  const RELEVANT = {
    GK: ['agility', 'positioning', 'decisions', 'composure', 'passing', 'strength',
      'leadership', 'firstTouch'],
    DC: ['heading', 'strength', 'tackling', 'positioning', 'decisions', 'pace',
      'passing', 'composure', 'aggression', 'leadership', 'firstTouch'],
    FB: ['pace', 'acceleration', 'stamina', 'crossing', 'tackling', 'workRate',
      'positioning', 'passing', 'dribbling', 'decisions'],
    DM: ['tackling', 'positioning', 'decisions', 'passing', 'vision', 'workRate',
      'strength', 'aggression', 'composure', 'stamina', 'firstTouch'],
    MC: ['passing', 'vision', 'stamina', 'workRate', 'firstTouch', 'composure',
      'tackling', 'shooting', 'decisions', 'dribbling', 'positioning'],
    WIDE: ['pace', 'acceleration', 'dribbling', 'crossing', 'firstTouch', 'shooting',
      'stamina', 'workRate', 'vision', 'passing', 'composure'],
    AMC: ['vision', 'passing', 'firstTouch', 'composure', 'shooting', 'dribbling',
      'decisions', 'positioning', 'acceleration'],
    ST: ['shooting', 'composure', 'positioning', 'heading', 'strength', 'pace',
      'acceleration', 'firstTouch', 'dribbling', 'workRate'],
  };

  const ALL = function (pos) {
    const g = RELEVANT[groupOf(pos)];
    if (g) return g.slice();
    const out = [];
    try {
      [TECH, MENT, PHYS].forEach(function (grp) {
        for (let i = 0; i < grp.length; i++) out.push(grp[i]);
      });
    } catch (error) { /* the groups are not up yet */ }
    return out;
  };

  const WORD = [
    [92, 'outstanding'], [80, 'excellent'], [66, 'strong'],
    [40, 'respectable'], [22, 'modest'], [0, 'poor'],
  ];

  function word(pct) {
    for (let i = 0; i < WORD.length; i++) if (pct >= WORD[i][0]) return WORD[i][1];
    return 'poor';
  }

  const NICE = {
    firstTouch: 'first touch', workRate: 'work rate', offTheBall: 'movement',
    acceleration: 'acceleration', injuryProneness: 'durability',
  };
  function label(a) { return NICE[a] || a; }

  /* Percentiles are wanted for the role as well as the bars, and the
     role is asked for every player in a list, so the pool for a division
     and position is worked out once and the answer kept against the
     player. Both are dropped when the squad list changes size, which is
     the cheapest honest signal that the world has moved on. */
  const POOL = { key: null, map: {} };

  function poolFor(p) {
    try {
      const club = G.clubs[p.club];
      if (!club) return null;
      const stamp = String(G.day || 0) + ':' + (G.season || 0);
      if (POOL.key !== stamp) { POOL.key = stamp; POOL.map = {}; }
      const k = club.league + '|' + p.pos;
      if (POOL.map[k] !== undefined) return POOL.map[k];
      const got = peers(p);
      POOL.map[k] = got;
      return got;
    } catch (error) { return null; }
  }

  function pctMap(p) {
    try {
      const pool = poolFor(p);
      if (!pool) return null;
      const a = attrs(p);
      const keys = ALL(p.pos);
      const out = {};
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const mine = a[k];
        if (typeof mine !== 'number') continue;
        let below = 0, n = 0;
        for (let j = 0; j < pool.length; j++) {
          const v = (pool[j].attrs || {})[k];
          if (typeof v !== 'number') continue;
          n++; if (v < mine) below++;
        }
        if (n >= 8) out[k] = Math.round((below / n) * 100);
      }
      return Object.keys(out).length ? out : null;
    } catch (error) { return null; }
  }

  function ranked(p) {
    const map = pctMap(p);
    if (!map) return null;
    const out = Object.keys(map).map(function (k) { return { k: k, pct: map[k] }; });
    if (out.length < 4) return null;
    out.sort(function (x, y) { return y.pct - x.pct; });
    return out;
  }

  function summary(p, list) {
    const best = list.slice(0, 3).filter(function (x) { return x.pct >= 60; });
    const worst = list.slice(-2).filter(function (x) { return x.pct <= 32; });
    if (!best.length && !worst.length) return '';
    let s = '';
    if (best.length) {
      s += 'His ' + best.map(function (x) { return label(x.k); }).join(', ')
        + ' ' + (best.length > 1 ? 'are' : 'is') + ' ' + word(best[0].pct)
        + ' for a ' + p.pos + ' at this level.';
    }
    if (worst.length) {
      s += (s ? ' ' : '') + 'He is caught out by his '
        + worst.map(function (x) { return label(x.k); }).join(' and ') + '.';
    }
    return s;
  }

  /* ---- the band that goes on the card ------------------------------ */

  function band(p, hidden) {
    try {
      const role = roleOf(p);
      if (!role) return '';
      let h = '<div class="pid-band"><div class="pid-role">' + esc(role) + '</div>';
      if (hidden) {
        h += '<div class="pid-note">Scout him to see what he is good at.</div></div>';
        return h;
      }
      const list = ranked(p);
      if (list) {
        const top = list.slice(0, 3);
        h += '<div class="pid-bars">' + top.map(function (x) {
          return '<div class="pid-b"><span>' + esc(label(x.k)) + '</span>'
            + '<i><b style="width:' + x.pct + '%"></b></i>'
            + '<em>' + word(x.pct) + '</em></div>';
        }).join('') + '</div>';
        const line = summary(p, list);
        if (line) h += '<div class="pid-note">' + esc(line) + '</div>';
      }
      return h + '</div>';
    } catch (error) { return ''; }
  }

  /* ---- hooking it onto the card ------------------------------------ */

  /* openProfile builds its markup and hands it to openModal, so there is
     no return value to change. The player being opened is remembered
     across that one call instead, which is exact -- no guessing from the
     HTML about who the card is for. */
  let showing = null;

  const AFTER_POS = /(<div class="row" style="gap:6px;margin:10px 0 4px;flex-wrap:wrap">[\s\S]*?<\/div>)/;

  function inject(html, p) {
    if (typeof html !== 'string' || !p) return html;
    if (html.indexOf('pid-band') >= 0) return html;
    const mine = p.club === G.my;
    const extra = band(p, !mine && !p.scouted);
    if (!extra) return html;
    if (AFTER_POS.test(html)) return html.replace(AFTER_POS, '$1' + extra);
    return html;
  }

  function install() {
    if (typeof window.openProfile === 'function' && typeof window.openModal === 'function') {
      const passProfile = window.openProfile;
      window.openProfile = function openProfileWithIdentity(pid) {
        try { showing = window.playerById ? window.playerById(pid) : null; }
        catch (error) { showing = null; }
        try { return passProfile.apply(this, arguments); }
        finally { showing = null; }
      };
      const passModal = window.openModal;
      window.openModal = function openModalMaybeACard(h) {
        let out = h;
        try { if (showing) out = inject(h, showing); } catch (error) { out = h; }
        return passModal.call(this, out);
      };
    }
    if (document.getElementById('rbs-pid')) return;
    const st = document.createElement('style');
    st.id = 'rbs-pid';
    st.textContent = [
      '.pid-band{margin:8px 0 2px;padding:9px 11px;border-radius:12px;',
      ' background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}',
      '.pid-role{font-weight:800;font-size:13px;letter-spacing:.2px;margin-bottom:6px}',
      '.pid-bars{display:flex;flex-direction:column;gap:4px}',
      '.pid-b{display:flex;align-items:center;gap:8px;font-size:11px}',
      '.pid-b span{flex:0 0 84px;opacity:.72;text-transform:capitalize}',
      '.pid-b i{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.10);overflow:hidden}',
      '.pid-b i b{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#2f7d4f,#5fd08a)}',
      '.pid-b em{flex:0 0 74px;font-style:normal;opacity:.6;text-align:right}',
      '.pid-note{margin-top:7px;font-size:11px;line-height:1.45;opacity:.66}',
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  window.RBSPlayerIdentity = {
    roleOf: roleOf, ranked: ranked, summary: summary, groupOf: groupOf, ROLES: ROLES,
  };
})();
