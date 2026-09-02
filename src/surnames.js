/* global G */

/* =====================================================================
   DE LIGT, NOT LIGT
   ---------------------------------------------------------------------
   Wherever the game has room for one word it takes the last one:

       function surname(n){ const p=String(n).split(' ');
                            return p.length>1 ? p[p.length-1] : n }

   Which is right for most of a squad and wrong for the players a
   supporter would notice first. On the team shape on the home screen,
   Matthijs de Ligt is labelled "Ligt". Put Kevin De Bruyne, Virgil van
   Dijk or Achraf Hakimi's team-mates through it and you get "Bruyne",
   "Dijk", "Weghorst" -- names no commentator has ever said out loud.

   A surname carrying a particle is one name, not two: the tussenvoegsel
   in Dutch, the nobiliary particle in French, Spanish and Portuguese,
   the Arabic article. The rule is simply to keep walking back while the
   word in front is one of them, so "Matthijs de Ligt" gives "de Ligt"
   and "Vincent Aboubakar" still gives "Aboubakar".

   The particle is printed the way the name itself spells it -- van Dijk
   keeps its small v mid-name -- except at the start of the label, where
   it is capitalised the way a shirt or a team sheet would: De Ligt, Van
   Dijk. That is what makes it read as a name rather than a fragment.

   Everything the page does with the result is unchanged; this only
   decides where the name is cut. Anyone with a single name -- Rodrygo,
   Casemiro, Fred -- comes back exactly as before.
   ===================================================================== */
(function surnames() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (typeof window.surname !== 'function') return;

  /* The particles that belong to the name behind them. Dutch, German,
     the Romance languages, the Arabic article, and the Irish and Scots
     prefixes that are written apart. */
  const PARTICLE = {
    de: 1, del: 1, della: 1, dello: 1, degli: 1, di: 1, da: 1, das: 1, dos: 1, du: 1,
    van: 1, von: 1, der: 1, den: 1, ter: 1, ten: 1, af: 1, av: 1,
    le: 1, la: 1, les: 1, lo: 1, li: 1,
    al: 1, el: 1, bin: 1, ibn: 1, abu: 1, ben: 1,
    mac: 1, mc: 1, ap: 1, ni: 1, nic: 1, san: 1, santa: 1, st: 1,
  };

  function isParticle(word) {
    if (!word) return false;
    const w = word.toLowerCase().replace(/[.']/g, '');
    return PARTICLE[w] === 1;
  }

  /* A name is capitalised at the head of a label even when it is spelled
     small inside the full name: van Dijk on his passport, Van Dijk on
     the back of the shirt. */
  function head(word) {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  const passSurname = window.surname;

  window.surname = function surnameWithItsParticles(n) {
    try {
      const parts = String(n == null ? '' : n).trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) return passSurname(n);

      /* walk back over the particles in front of the final name */
      let i = parts.length - 1;
      while (i > 1 && isParticle(parts[i - 1])) i--;

      /* `i > 1` above keeps the first word as a given name: "De Bruyne"
         on its own would otherwise swallow the lot and return the whole
         string for a two-word name that happens to start with one. */
      if (i === parts.length - 1) return passSurname(n);

      const out = parts.slice(i);
      out[0] = head(out[0]);
      return out.join(' ');
    } catch (error) {
      return passSurname(n);
    }
  };

  /* -------------------------------------------------------------------
     THE ONE PITCH THAT DOES NOT ASK

     Most of the game shortens a name by calling `surname`, so the rule
     above reaches it. The shape on the Tactics screen does not: it
     builds the label inline, in the page,

         '<div class="nm">'+(p?esc(p.name.split(' ').pop()):'Empty')+...

     which is a private copy of the old rule and cannot be wrapped. So
     the finished markup is corrected instead. Each shirt carries the
     slot it was drawn for, `data-v="3"`, and the eleven picked for those
     slots are in `G.tacs.xi` -- so the right name for each label is
     known exactly rather than guessed at from the text.
     ------------------------------------------------------------------- */
  const LABEL = /(<div class="tslot[^"]*" data-action="tslot" data-v="(\d+)"[\s\S]*?<div class="nm">)([^<]*)(<\/div>)/g;

  function fixPitchLabels(html) {
    if (typeof html !== 'string' || html.indexOf('data-action="tslot"') < 0) return html;
    let xi = null;
    try { xi = (typeof G !== 'undefined' && G && G.tacs && G.tacs.xi) || null; } catch (error) { xi = null; }
    if (!Array.isArray(xi)) return html;
    return html.replace(LABEL, function (all, head, idx, text, tail) {
      try {
        const id = xi[+idx];
        if (id == null) return all;
        const p = window.playerById ? window.playerById(id) : null;
        if (!p || !p.name) return all;
        const want = window.surname(p.name);
        /* only where the two rules actually disagree, so a label the
           page built for something else is never touched */
        if (!want || want === text) return all;
        return head + want + tail;
      } catch (error) { return all; }
    });
  }

  function wrapView() {
    if (typeof window.vTactics !== 'function') return false;
    const passView = window.vTactics;
    window.vTactics = function vTacticsWithRealSurnames() {
      return fixPitchLabels(passView.apply(this, arguments));
    };
    return true;
  }

  if (!wrapView()) {
    /* the view may be defined after this file runs */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wrapView);
    } else {
      window.setTimeout(wrapView, 0);
    }
  }

  /* -------------------------------------------------------------------
     AND THE BUTTONS ON A PLAYER'S CARD

     "Have a word with Ligt". "Ligt replies". "Back to Ligt". Three more
     inline `p.name.split(' ').pop()` in the game file, on the card where
     you actually talk to the man. There is no function to wrap for those
     either, so the modal is corrected on its way out -- and only for the
     player whose card it is, whose full name is known, so this is a
     substitution of one known string for another rather than a guess at
     what any word in the markup might be.

     The full name is put behind a placeholder first, because it CONTAINS
     the short one: replacing "Ligt" in a card headed "Matthijs de Ligt"
     would otherwise produce "Matthijs de De Ligt".
     ------------------------------------------------------------------- */
  function fixModalNames(html, p) {
    try {
      if (typeof html !== 'string' || !p || !p.name) return html;
      const full = String(p.name);
      const parts = full.trim().split(/\s+/);
      if (parts.length < 2) return html;
      const wrong = parts[parts.length - 1];
      const right = window.surname(full);
      if (!right || right === wrong) return html;
      const MARK = '\u0000rbsname\u0000';
      let out = html.split(full).join(MARK);
      const safe = wrong.replace(/[.*+?^${}()|[\]\\]/g, function (ch) { return '\\' + ch; });
      out = out.replace(new RegExp('(^|[^\\w>])' + safe + '(?![\\w])', 'g'),
        function (all, lead) { return lead + right; });
      return out.split(MARK).join(full);
    } catch (error) { return html; }
  }

  /* Text nodes only, so no markup can be damaged, and never a node that
     carries the man's full name -- replacing "Ligt" inside "Matthijs de
     Ligt" would read "Matthijs de De Ligt". */
  function fixSheet(p) {
    if (!p || !p.name) return;
    const parts = String(p.name).trim().split(/\s+/);
    if (parts.length < 2) return;
    const wrong = parts[parts.length - 1];
    const right = window.surname(p.name);
    if (!right || right === wrong) return;
    const sheet = document.getElementById('sheetBody');
    if (!sheet) return;
    const safe = wrong.replace(/[.*+?^${}()|[\]\\]/g, function (ch) { return '\\' + ch; });
    const re = new RegExp('(^|[^\\w])' + safe + '(?![\\w])', 'g');
    const walk = document.createTreeWalker(sheet, 4 /* text nodes */, null);
    const hits = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = n.nodeValue;
      if (!t || t.indexOf(wrong) < 0) continue;
      if (t.indexOf(p.name) >= 0) continue;
      hits.push(n);
    }
    for (let i = 0; i < hits.length; i++) {
      hits[i].nodeValue = hits[i].nodeValue.replace(re, function (all, lead) { return lead + right; });
    }
  }

  let card = null;
  (function hookCard() {
    if (typeof window.openProfile !== 'function' || typeof window.openModal !== 'function') return;
    const passProfile = window.openProfile;
    window.openProfile = function openProfileNamed(pid) {
      let who = null;
      try { who = window.playerById ? window.playerById(pid) : null; } catch (error) { who = null; }
      card = who;
      try {
        return passProfile.apply(this, arguments);
      } finally {
        card = null;
        /* The game wraps openProfile itself to prepend the chat button,
           and writes it straight into the sheet AFTER the modal is built
           -- so "Have a word with Ligt" never passes through openModal.
           The sheet is corrected once the whole chain has run. */
        try { fixSheet(who); } catch (error) { /* the card is still readable */ }
      }
    };
    const passModal = window.openModal;
    window.openModal = function openModalNamed(h) {
      let out = h;
      try { if (card) out = fixModalNames(h, card); } catch (error) { out = h; }
      return passModal.call(this, out);
    };
  })();

  window.RBSSurnames = {
    isParticle: isParticle,
    of: window.surname,
    fixPitchLabels: fixPitchLabels,
    fixModalNames: fixModalNames,
    fixSheet: fixSheet,
  };
})();
