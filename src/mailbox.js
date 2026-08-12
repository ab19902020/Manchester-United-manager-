/* global G, UI, ACTIONS, render */
/* global renderMailbox:writable, openModal:writable */

/* =====================================================================
   THE MAILBOX — folders, instead of one long list
   ---------------------------------------------------------------------
   Every letter the game has ever sent you arrives in a single stream,
   newest first, eight at a time behind a "show older" button. A contract
   expiry, a scout report, a cup draw, the board asking to see you and a
   newspaper column all look the same and all queue behind each other.

   The mail already knows what it is. `mail(type, ...)` has been stamping
   a type on every letter since the beginning and nothing has ever read
   it except to choose an icon:

       board 74 · transfer 44 · news 37 · info 18 · match 15
       contract 15 · award 12 · train 6 · injury 5 · squad 4 · scout 3

   So the folders are not a new classification, they are the one already
   in the file, grouped the way a manager would think about it: the
   boardroom, the transfer market, your squad, the press, and results.

   HOW IT IS DONE. The inbox list is built inside `vHome`, inline, in a
   layer that has been rewritten several times. Rather than reproduce
   that markup — which would rot the first time anybody touches it — the
   filter is applied to `G.inbox` around the call, and the real list is
   put back in a `finally`. The renderer does all its own work on a
   shorter array and never knows. The only markup this file writes is the
   row of folder chips, inserted above the list.
   ===================================================================== */

(function installMailbox() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  /* Which folder a letter belongs in, by the type it was posted with.
     Anything unrecognised falls into the club's own business rather than
     disappearing — a folder that hides mail is worse than no folder. */
  const FOLDER_OF = {
    board: 'board',
    contract: 'board',
    transfer: 'transfers',
    scout: 'transfers',
    squad: 'squad',
    injury: 'squad',
    train: 'squad',
    news: 'media',
    info: 'media',
    match: 'results',
    award: 'results',
  };

  const FOLDERS = [
    { key: 'all', label: 'All', icon: '📥' },
    { key: 'board', label: 'Boardroom', icon: '🏛️' },
    { key: 'transfers', label: 'Transfers', icon: '🔁' },
    { key: 'squad', label: 'Squad', icon: '👥' },
    { key: 'media', label: 'Media', icon: '📰' },
    { key: 'results', label: 'Results', icon: '⚽' },
  ];

  function folderOf(m) {
    if (!m) return 'media';
    return FOLDER_OF[m.type] || 'board';
  }

  function currentTab() {
    const t = UI && UI.mailTab;
    return FOLDERS.some((f) => f.key === t) ? t : 'all';
  }

  function inFolder(m, key) {
    return key === 'all' || folderOf(m) === key;
  }

  /* A letter you have to answer should never be filed out of sight. */
  function blocking(m) {
    return !!(m && m.actions && m.actions.length);
  }

  function counts() {
    const out = {};
    FOLDERS.forEach((f) => { out[f.key] = { total: 0, unread: 0, act: 0 }; });
    (G.inbox || []).forEach((m) => {
      if (!m) return;
      const k = folderOf(m);
      ['all', k].forEach((key) => {
        if (!out[key]) return;
        out[key].total += 1;
        if (!m.read) out[key].unread += 1;
        if (blocking(m)) out[key].act += 1;
      });
    });
    return out;
  }

  function chipRow() {
    const n = counts();
    const tab = currentTab();
    const chips = FOLDERS.map((f) => {
      const c = n[f.key] || { total: 0, unread: 0, act: 0 };
      if (f.key !== 'all' && c.total === 0 && f.key !== tab) return '';
      const badge = c.unread
        ? '<span class="xs" style="margin-left:4px;font-weight:800;color:var(--gold)">' + c.unread + '</span>'
        : '';
      const needs = c.act && f.key !== tab
        ? '<span class="xs" style="margin-left:3px;color:var(--gold)">•</span>' : '';
      return '<button class="chip' + (tab === f.key ? ' on' : '') + '" data-action="mailTab" data-v="' +
        f.key + '" style="white-space:nowrap">' + f.icon + ' ' + f.label + badge + needs + '</button>';
    }).join('');
    return '<div class="chips" style="margin:0 0 8px;overflow-x:auto;flex-wrap:nowrap">' + chips + '</div>';
  }

  if (typeof ACTIONS !== 'undefined' && ACTIONS) {
    ACTIONS.mailTab = function mailTab(el) {
      const v = el && el.dataset && el.dataset.v;
      if (!v) return;
      UI.mailTab = v;
      UI.mailView = null;                /* a new folder starts at the list */
      UI.mailAll = true;                 /* and shows everything filed there */
      if (has(window.renderMailbox)) window.renderMailbox();
      if (has(window.render)) window.render();
    };
  }

  /* ---- the one place the list is filtered ----------------------------
     The mailbox is an overlay built by `renderMailbox()` and handed to
     `openModal`. The filter goes around the build, so the existing
     renderer sorts, prioritises, counts and paginates a shorter array
     without knowing anything has happened, and the real inbox is put
     back in a `finally`. The chip row is spliced into the finished
     markup on the way to the modal. */
  let injecting = false;

  if (has(window.renderMailbox)) {
    const previousRender = window.renderMailbox;
    window.renderMailbox = function renderMailboxWithFolders() {
      const tab = currentTab();
      const real = G.inbox;
      /* the detail view is one letter; folders belong on the list */
      const listView = !(UI && UI.mailView);
      injecting = listView;
      try {
        if (listView && tab !== 'all' && Array.isArray(real)) {
          G.inbox = real.filter((m) => inFolder(m, tab));
        }
        return previousRender.apply(this, arguments);
      } finally {
        G.inbox = real;
        injecting = false;
      }
    };
  }

  if (has(window.openModal)) {
    const previousModal = window.openModal;
    window.openModal = function openModalWithFolderChips(html) {
      let out = html;
      try {
        if (injecting && typeof html === 'string') {
          const at = html.indexOf('<div class="card tight"');
          if (at >= 0) {
            out = html.slice(0, at) + chipRow() + html.slice(at);
            if (currentTab() !== 'all') {
              out = out.replace('Nothing new. Your desk is clear.',
                'Nothing in this folder.');
            }
          }
        }
      } catch (error) { /* the mailbox still opens without its chips */ }
      return previousModal.call(this, out);
    };
  }

  try {
    window.RBSMailbox = Object.freeze({ FOLDERS, folderOf, counts, currentTab, inFolder });
  } catch (error) { /* no window */ }
}());
