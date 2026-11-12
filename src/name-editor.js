/* global G, UI, ACTIONS, esc, openModal, closeModal, render, toast, assignAbbrs, shortenClub,
          playerById, newGame:writable */

/* =====================================================================
   THE NAME EDITOR
   ---------------------------------------------------------------------
   Every club, ground and player in the game is invented. Some people
   will want their own: their town's side in the league, their mates in
   the squad, a whole division renamed the way they like it. This lets
   them, and lets them hand the result to somebody else as a file.

   WHAT A RENAME IS. It changes what a thing is CALLED and nothing about
   what it IS. A lot of the game is seeded from names -- a player's face,
   his personality, the ceiling on his ability, a club's standing, who
   manages it -- so a rename that simply overwrote the name would quietly
   turn the man into somebody else. Instead the original is kept beside
   it as `_n0`, and everything that used to key off the name keys off
   that. Rename your centre-half and he keeps his face, his potential and
   his bad knee.

   WHERE IT IS KEPT. Edits made in a career are part of that career and
   save with it. They are also collected into a "name pack" on the
   device, which is applied to every new career from then on -- clubs by
   their key, authored players by their original name -- so a world
   renamed once stays renamed. A pack can be exported as a file and
   imported on another device.

   It never touches a result. Nothing here reads or writes anything the
   match engine, the transfer market or the board looks at.
   ===================================================================== */
(function nameEditor() {
  'use strict';

  const PACK_KEY = 'rbsNamePack1';
  const FORMAT = 'results-business-names';
  const LIMITS = { name: 28, short: 14, stadium: 32, player: 32 };

  const active = () => !!(typeof G !== 'undefined' && G && G.clubs && G.clubs[G.my]);
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const clean = (value, max) => String(value == null ? '' : value)
    .replace(/[<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

  function emptyPack() { return { clubs: {}, players: {} }; }

  function readPack() {
    try {
      const raw = JSON.parse(localStorage.getItem(PACK_KEY) || 'null');
      if (raw && typeof raw === 'object') return { clubs: raw.clubs || {}, players: raw.players || {} };
    } catch (error) { /* a blocked or corrupt store is an empty pack */ }
    return emptyPack();
  }

  function writePack(pack) {
    try { localStorage.setItem(PACK_KEY, JSON.stringify(pack)); } catch (error) { /* storage blocked */ }
  }

  function edits() {
    if (!G.nameEdits || typeof G.nameEdits !== 'object') G.nameEdits = emptyPack();
    if (!G.nameEdits.clubs) G.nameEdits.clubs = {};
    if (!G.nameEdits.players) G.nameEdits.players = {};
    return G.nameEdits;
  }

  function allPlayers() {
    const out = [];
    (G.clubs || []).forEach((c) => {
      (c.players || []).forEach((p) => out.push({ p, c }));
      (c.youth || []).forEach((p) => out.push({ p, c }));
    });
    (G.freeAgents || []).forEach((p) => out.push({ p, c: null }));
    return out;
  }

  /* ---- the two renames ------------------------------------------------ */

  function renameClub(club, fields, opts) {
    if (!club) return { ok: false, why: 'No such club.' };
    const name = clean(fields.name, LIMITS.name);
    if (name.length < 2) return { ok: false, why: 'A club needs a name of at least two letters.' };
    const taken = (G.clubs || []).some((c) => c !== club && fold(c.name) === fold(name));
    if (taken) return { ok: false, why: 'Another club is already called ' + name + '.' };
    let short = clean(fields.short, LIMITS.short);
    if (!short) {
      short = name.length <= LIMITS.short ? name
        : (typeof shortenClub === 'function' ? clean(shortenClub(name), LIMITS.short) : name.slice(0, LIMITS.short));
    }
    const stadium = clean(fields.stadium, LIMITS.stadium) || club.stadium;

    if (!club._n0) club._n0 = club.name;
    club.name = name;
    club.short = short;
    club.longShort = 1;
    club.stadium = stadium;
    try { if (typeof assignAbbrs === 'function') assignAbbrs(G.clubs); } catch (error) { /* the badge keeps its letters */ }

    const record = { name, short, stadium };
    edits().clubs[club.key] = record;
    if (!opts || !opts.quiet) { const pack = readPack(); pack.clubs[club.key] = record; writePack(pack); }
    return { ok: true };
  }

  function renamePlayer(player, value, opts) {
    if (!player) return { ok: false, why: 'No such player.' };
    const name = clean(value, LIMITS.player);
    if (name.length < 2) return { ok: false, why: 'A player needs a name of at least two letters.' };
    if (!player._n0) player._n0 = player.name;
    player.name = name;
    const club = (G.clubs || [])[player.club];
    if (club) club._nm = null;

    edits().players[player._n0] = name;
    if (!opts || !opts.quiet) { const pack = readPack(); pack.players[player._n0] = name; writePack(pack); }
    return { ok: true };
  }

  function restoreClub(club) {
    if (!club || !club._n0) return false;
    club.name = club._n0;
    club.short = typeof shortenClub === 'function' ? shortenClub(club.name) : club.name;
    delete club._n0;
    delete edits().clubs[club.key];
    const pack = readPack(); delete pack.clubs[club.key]; writePack(pack);
    try { if (typeof assignAbbrs === 'function') assignAbbrs(G.clubs); } catch (error) { /* unchanged */ }
    return true;
  }

  function restorePlayer(player) {
    if (!player || !player._n0) return false;
    const original = player._n0;
    player.name = original;
    delete player._n0;
    delete edits().players[original];
    const pack = readPack(); delete pack.players[original]; writePack(pack);
    return true;
  }

  /* ---- packs ----------------------------------------------------------- */

  function applyPack(pack) {
    let clubs = 0, players = 0;
    if (!active() || !pack) return { clubs, players };
    const byKey = {};
    G.clubs.forEach((c) => { byKey[c.key] = c; });
    Object.keys(pack.clubs || {}).forEach((key) => {
      const club = byKey[key], row = pack.clubs[key];
      if (!club || !row || typeof row !== 'object') return;
      if (fold(club.name) === fold(row.name) && club.stadium === row.stadium) return;
      if (renameClub(club, row, { quiet: true }).ok) clubs += 1;
    });
    const wanted = pack.players || {};
    if (Object.keys(wanted).length) {
      allPlayers().forEach(({ p }) => {
        const to = wanted[p._n0 || p.name];
        if (to && p.name !== to && renamePlayer(p, to, { quiet: true }).ok) players += 1;
      });
    }
    return { clubs, players };
  }

  function validPack(data) {
    if (!data || typeof data !== 'object' || data.format !== FORMAT) return null;
    const out = emptyPack();
    Object.keys(data.clubs || {}).slice(0, 2000).forEach((key) => {
      const row = data.clubs[key];
      if (!/^[A-Z0-9]{2,12}$/.test(key) || !row || typeof row !== 'object') return;
      const name = clean(row.name, LIMITS.name);
      if (name.length < 2) return;
      out.clubs[key] = { name, short: clean(row.short, LIMITS.short), stadium: clean(row.stadium, LIMITS.stadium) };
    });
    Object.keys(data.players || {}).slice(0, 20000).forEach((from) => {
      const to = clean(data.players[from], LIMITS.player), key = clean(from, 48);
      if (key.length >= 2 && to.length >= 2) out.players[key] = to;
    });
    return out;
  }

  function exportPack() {
    const pack = readPack();
    const body = JSON.stringify({ format: FORMAT, version: 1, clubs: pack.clubs, players: pack.players }, null, 1);
    const blob = new Blob([body], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'results-business-names.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (typeof toast === 'function') toast('📦 Name pack downloading');
  }

  function importText(text) {
    let data = null;
    try { data = JSON.parse(text); } catch (error) { data = null; }
    const incoming = validPack(data);
    if (!incoming) return { ok: false, why: 'That file is not a name pack.' };
    const pack = readPack();
    Object.assign(pack.clubs, incoming.clubs);
    Object.assign(pack.players, incoming.players);
    writePack(pack);
    const done = applyPack(pack);
    return { ok: true, clubs: done.clubs, players: done.players,
      listed: Object.keys(incoming.clubs).length + Object.keys(incoming.players).length };
  }

  function clearAll() {
    let n = 0;
    if (active()) {
      G.clubs.forEach((c) => { if (c._n0) { c.name = c._n0; c.short = typeof shortenClub === 'function' ? shortenClub(c.name) : c.name; delete c._n0; n += 1; } });
      allPlayers().forEach(({ p }) => { if (p._n0) { p.name = p._n0; delete p._n0; n += 1; } });
      G.nameEdits = emptyPack();
      try { if (typeof assignAbbrs === 'function') assignAbbrs(G.clubs); } catch (error) { /* unchanged */ }
    }
    writePack(emptyPack());
    return n;
  }

  /* ---- the screen ------------------------------------------------------ */

  function counts() {
    const e = active() ? edits() : emptyPack();
    return { clubs: Object.keys(e.clubs).length, players: Object.keys(e.players).length };
  }

  function find(query) {
    const q = fold(query);
    if (!active()) return [];
    const rows = [];
    const mine = G.clubs[G.my];
    if (q.length < 2) {
      rows.push({ kind: 'club', id: mine.i, title: mine.name, detail: 'Your club · ' + mine.stadium, edited: !!mine._n0 });
      (mine.players || []).slice().sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 8)
        .forEach((p) => rows.push({ kind: 'player', id: p.id, title: p.name, detail: p.pos + ' · ' + mine.short, edited: !!p._n0 }));
      return rows;
    }
    G.clubs.forEach((c) => {
      if (rows.length < 8 && fold(c.name + ' ' + c.short + ' ' + (c._n0 || '') + ' ' + c.stadium).includes(q)) {
        rows.push({ kind: 'club', id: c.i, title: c.name, detail: 'Club · ' + c.stadium, edited: !!c._n0 });
      }
    });
    const ordered = [mine].concat(G.clubs.filter((c) => c !== mine));
    let players = 0;
    for (const c of ordered) {
      for (const p of (c.players || []).concat(c.youth || [])) {
        if (fold(p.name + ' ' + (p._n0 || '')).includes(q)) {
          rows.push({ kind: 'player', id: p.id, title: p.name, detail: p.pos + ' · ' + c.short, edited: !!p._n0 });
          players += 1;
          if (players >= 14) break;
        }
      }
      if (players >= 14) break;
    }
    return rows;
  }

  function resultRows(query) {
    const rows = find(query);
    if (!rows.length) return '<p class="rbs-ne-empty" role="status">Nothing by that name. Try a surname, a club or a ground.</p>';
    return rows.map((r) => '<button class="rbs-ne-row" data-action="nameEditOpen" data-kind="' + r.kind + '" data-v="' + esc(String(r.id)) + '">'
      + '<span><b>' + esc(r.title) + '</b><small>' + esc(r.detail) + '</small></span>'
      + '<i>' + (r.edited ? 'renamed' : 'rename') + '</i></button>').join('');
  }

  function openEditor() {
    if (!active()) return;
    const n = counts();
    openModal('<section class="rbs-ne"><span class="rbs-eyebrow">Make the world yours</span><h3>Name editor</h3>'
      + '<p class="rbs-ne-intro">Rename any club, ground or player. A rename changes what something is called and nothing else — '
      + 'a player keeps his face, his ability and his contract.</p>'
      + '<label for="rbsNameQuery">Find a club, ground or player</label>'
      + '<input id="rbsNameQuery" type="search" autocomplete="off" placeholder="Start typing a name…">'
      + '<div id="rbsNameResults">' + resultRows('') + '</div>'
      + '<div class="rbs-ne-pack"><h4>Name packs</h4><p id="rbsNameCount">' + n.clubs + ' clubs and ' + n.players + ' players renamed in this career. '
      + 'Your names are applied to every new career on this device.</p>'
      + '<div class="rbs-ne-buttons"><button class="btn btn-ghost" data-action="nameEditExport">⬇️ Export pack</button>'
      + '<button class="btn btn-ghost" data-action="nameEditImport">⬆️ Import pack</button></div>'
      + '<input type="file" id="rbsNameFile" accept=".json,application/json" style="display:none">'
      + (n.clubs + n.players ? '<button class="btn btn-danger btn-block" data-action="nameEditClearAsk">Put every name back</button>' : '')
      + '</div></section>');
    requestAnimationFrame(() => { const input = document.getElementById('rbsNameQuery'); if (input) input.focus(); });
  }

  function field(id, label, value, max, hint) {
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" type="text" maxlength="' + max + '" autocomplete="off" value="'
      + esc(value || '') + '">' + (hint ? '<small class="rbs-ne-hint">' + hint + '</small>' : '');
  }

  function openForm(kind, id) {
    if (!active()) return;
    if (kind === 'club') {
      const c = G.clubs[+id];
      if (!c) return;
      openModal('<section class="rbs-ne"><span class="rbs-eyebrow">Rename a club</span><h3>' + esc(c.name) + '</h3>'
        + (c._n0 ? '<p class="rbs-ne-intro">Originally ' + esc(c._n0) + '.</p>' : '')
        + field('rbsNeName', 'Club name', c.name, LIMITS.name)
        + field('rbsNeShort', 'Short name', c.short, LIMITS.short, 'Used in tables and scorelines. Leave empty to work one out.')
        + field('rbsNeStadium', 'Ground', c.stadium, LIMITS.stadium)
        + '<p id="rbsNeError" class="rbs-ne-error" role="alert"></p>'
        + '<button class="btn btn-primary btn-block" data-action="nameEditSave" data-kind="club" data-v="' + c.i + '">Save names</button>'
        + (c._n0 ? '<button class="btn btn-ghost btn-block" data-action="nameEditRestore" data-kind="club" data-v="' + c.i + '">Put the original back</button>' : '')
        + '<button class="btn btn-ghost btn-block" data-action="nameEditor">Back to the editor</button></section>');
    } else {
      const p = typeof playerById === 'function' ? playerById(+id) : null;
      if (!p) return;
      openModal('<section class="rbs-ne"><span class="rbs-eyebrow">Rename a player</span><h3>' + esc(p.name) + '</h3>'
        + (p._n0 ? '<p class="rbs-ne-intro">Originally ' + esc(p._n0) + '.</p>' : '')
        + field('rbsNeName', 'Player name', p.name, LIMITS.player, 'First name and surname. The surname is what goes on the team sheet.')
        + '<p id="rbsNeError" class="rbs-ne-error" role="alert"></p>'
        + '<button class="btn btn-primary btn-block" data-action="nameEditSave" data-kind="player" data-v="' + p.id + '">Save name</button>'
        + (p._n0 ? '<button class="btn btn-ghost btn-block" data-action="nameEditRestore" data-kind="player" data-v="' + p.id + '">Put the original back</button>' : '')
        + '<button class="btn btn-ghost btn-block" data-action="nameEditor">Back to the editor</button></section>');
    }
    requestAnimationFrame(() => { const input = document.getElementById('rbsNeName'); if (input) { input.focus(); input.select(); } });
  }

  const value = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  function refresh() { try { if (typeof render === 'function') render(); } catch (error) { /* the sheet is still right */ } }

  ACTIONS.nameEditor = openEditor;
  ACTIONS.nameEditOpen = (el) => openForm(el.dataset.kind, el.dataset.v);
  ACTIONS.nameEditSave = (el) => {
    if (!active()) return;
    const result = el.dataset.kind === 'club'
      ? renameClub(G.clubs[+el.dataset.v], { name: value('rbsNeName'), short: value('rbsNeShort'), stadium: value('rbsNeStadium') })
      : renamePlayer(playerById(+el.dataset.v), value('rbsNeName'));
    if (!result.ok) {
      const error = document.getElementById('rbsNeError');
      if (error) error.textContent = result.why;
      return;
    }
    refresh();
    if (typeof toast === 'function') toast('✏️ Renamed');
    openEditor();
  };
  ACTIONS.nameEditRestore = (el) => {
    if (!active()) return;
    if (el.dataset.kind === 'club') restoreClub(G.clubs[+el.dataset.v]);
    else restorePlayer(playerById(+el.dataset.v));
    refresh();
    openEditor();
  };
  ACTIONS.nameEditExport = exportPack;
  ACTIONS.nameEditImport = () => { const input = document.getElementById('rbsNameFile'); if (input) input.click(); };
  ACTIONS.nameEditClearAsk = () => {
    openModal('<section class="rbs-ne"><h3>Put every name back?</h3><p class="rbs-ne-intro">Every club, ground and player returns to the name '
      + 'the game gave it, in this career and for new ones. Export your pack first if you might want it again.</p>'
      + '<button class="btn btn-danger btn-block" data-action="nameEditClear">Yes, restore the originals</button>'
      + '<button class="btn btn-ghost btn-block" data-action="nameEditor">Keep my names</button></section>');
  };
  ACTIONS.nameEditClear = () => {
    const n = clearAll();
    refresh();
    if (typeof toast === 'function') toast(n ? 'Restored ' + n + ' names' : 'Nothing to restore');
    openEditor();
  };

  document.addEventListener('input', (event) => {
    if (event.target && event.target.id === 'rbsNameQuery') {
      const host = document.getElementById('rbsNameResults');
      if (host) host.innerHTML = resultRows(event.target.value);
    }
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || input.id !== 'rbsNameFile' || !input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importText(String(reader.result || ''));
      refresh();
      if (typeof toast === 'function') {
        toast(result.ok ? '📦 Pack imported — ' + (result.clubs + result.players) + ' names changed' : '⚠️ ' + result.why, 3200);
      }
      if (result.ok) openEditor();
    };
    reader.readAsText(input.files[0]);
    input.value = '';
  });

  /* ---- a way in, on the Save tab -------------------------------------- */
  function mount() {
    if (!active() || UI.view !== 'club' || UI.clubTab !== 'save') return;
    const view = document.getElementById('view');
    if (!view || view.querySelector('#rbsNameEditorCard')) return;
    const anchor = view.querySelector('[data-action="exportSave"]');
    const card = anchor && anchor.closest('.card');
    if (!card) return;
    const n = counts();
    card.insertAdjacentHTML('afterend', '<div class="sec"><div class="t">✏️ Names</div><div class="ln"></div></div>'
      + '<div class="card" id="rbsNameEditorCard"><p class="xs muted" style="margin-bottom:10px">Rename any club, ground or player, '
      + 'and share your names as a pack.' + (n.clubs + n.players ? ' <b>' + (n.clubs + n.players) + ' renamed.</b>' : '') + '</p>'
      + '<button class="btn btn-ghost btn-block" data-action="nameEditor">Open the name editor</button></div>');
  }

  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-name-editor';
    style.textContent = `
.rbs-ne{min-width:0}.rbs-ne h3{font-size:24px;line-height:1.2;letter-spacing:-.025em;margin:8px 0 10px}
.rbs-ne-intro{font-size:13px;line-height:1.6;color:#aeb8c4;margin:0 0 6px}
.rbs-ne label{display:block;font-size:12px;font-weight:700;margin:16px 0 7px}
.rbs-ne input[type=text],.rbs-ne input[type=search]{box-sizing:border-box;width:100%;min-height:48px;border:1px solid #46505c;border-radius:10px;background:#0d1116;color:#f2f4f7;padding:0 14px;font:600 16px/1.2 var(--body)}
.rbs-ne input:focus{outline:2px solid var(--gold);outline-offset:2px}
.rbs-ne-hint{display:block;font-size:11px;color:#8c96a3;margin-top:6px;line-height:1.4}
.rbs-ne-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:58px;text-align:left;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.08);color:inherit;padding:8px 2px;cursor:pointer}
.rbs-ne-row:hover{background:rgba(255,255,255,.05)}.rbs-ne-row:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
.rbs-ne-row span{min-width:0}.rbs-ne-row b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rbs-ne-row small{display:block;font-size:12px;color:#97a1ad;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rbs-ne-row i{font-style:normal;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);flex-shrink:0}
.rbs-ne-empty{font-size:13px;color:#97a1ad;padding:14px 0}
.rbs-ne-error{min-height:18px;margin:10px 0 4px;font-size:13px;font-weight:700;color:#ff8f8f}
.rbs-ne-pack{margin-top:18px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1)}
.rbs-ne-pack h4{font-size:13px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 6px;color:#c8d0da}
.rbs-ne-pack p{font-size:12px;line-height:1.6;color:#97a1ad;margin:0 0 12px}
.rbs-ne-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.rbs-ne .btn-block+.btn-block{margin-top:8px}
`;
    document.head.appendChild(style);

    const beforeRender = window.render;
    if (typeof beforeRender === 'function') {
      window.render = function renderWithNameEditor() { const result = beforeRender.apply(this, arguments); try { mount(); } catch (error) { /* no card */ } return result; };
    }
    /* a new career is renamed from the device's pack the moment it exists */
    if (typeof newGame === 'function') {
      const previous = newGame;
      newGame = function newGameWithNames() {
        const result = previous.apply(this, arguments);
        try { const pack = readPack(); if (Object.keys(pack.clubs).length || Object.keys(pack.players).length) applyPack(pack); } catch (error) { /* the world still built */ }
        return result;
      };
    }
  }

  window.RBSNameEditor = Object.freeze({ renameClub, renamePlayer, restoreClub, restorePlayer, applyPack, importText, validPack, clearAll, find, readPack });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
