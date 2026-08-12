/* global G, ACTIONS, playerById */
/* global openModal:writable */

/* =====================================================================
   PLAYER NAMES YOU CAN TAP
   ---------------------------------------------------------------------
   Reported: "a player is moaning he hasn't had minutes, and I'm a new
   manager — I should click on the player and look at his attributes and
   make a decision from there. I'm playing blind." The same for a
   suggested transfer target.

   The game already has the screen: `ACTIONS.profile` opens the full
   player card from a `data-id`, and the squad list has been using it
   since the beginning. What it has never had is a way in from the words.
   Every letter writes a player's name as `<b>Name</b>` and that is where
   it ends.

   So this does not build anything new. It finds names the game has
   already bolded, checks them against the players who actually exist,
   and hangs the existing action on them. A name that matches nobody is
   left exactly as it was — a bolded figure, a club, a competition — and
   an ambiguous name (two players, same name) is left alone too rather
   than opening the wrong man's card.

   WHERE. Anything that goes through `openModal`, which is the mailbox,
   the letter you are reading, the scout report, the negotiation sheets
   and the boardroom's own panels. The index is rebuilt per call from the
   world as it stands, so a player who signed this morning is tappable
   this afternoon.
   ===================================================================== */

(function installPlayerLinks() {
  'use strict';
  if (typeof window === 'undefined' || typeof G === 'undefined') return;

  const has = (fn) => typeof fn === 'function';

  /* Names bolded in a letter, mapped to the one player who owns them.
     A name held by two players maps to nothing: sending the manager to
     the wrong card is worse than sending him nowhere. */
  function nameIndex() {
    const byName = new Map();
    const clash = new Set();
    const add = (p) => {
      if (!p || !p.name || p.id == null) return;
      const k = String(p.name);
      if (byName.has(k) && byName.get(k) !== p.id) { clash.add(k); return; }
      byName.set(k, p.id);
    };
    (G.clubs || []).forEach((c) => {
      (c.players || []).forEach(add);
      (c.youth || []).forEach(add);
    });
    clash.forEach((k) => byName.delete(k));
    return byName;
  }

  /* `<b>Bruno Fernandes</b>` and nothing else. Deliberately narrow: the
     bold tag is how the game marks a name, and matching bare text would
     rewrite the middle of sentences and player names inside attributes. */
  const BOLD = /<b>([^<>]{3,40})<\/b>/g;

  function linkify(html) {
    if (typeof html !== 'string' || html.indexOf('<b>') < 0) return html;
    const index = nameIndex();
    if (!index.size) return html;
    return html.replace(BOLD, (whole, inner) => {
      const id = index.get(inner);
      if (id == null) return whole;
      return '<b data-action="profile" data-id="' + id + '" ' +
        'style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;' +
        'text-underline-offset:2px">' + inner + '</b>';
    });
  }

  if (has(window.openModal)) {
    const previousModal = window.openModal;
    window.openModal = function openModalWithTappableNames(html) {
      let out = html;
      try {
        out = linkify(html);
      } catch (error) {
        out = html;
      }
      return previousModal.call(this, out);
    };
  }

  /* Opening a profile from inside a letter should not lose the letter.
     `ACTIONS.profile` replaces the modal, so the way back is the profile
     screen's own close — which is what a player expects from a card. */
  function linkedCount(html) {
    return (String(html || '').match(/data-action="profile"/g) || []).length;
  }

  try {
    window.RBSPlayerLinks = Object.freeze({ linkify, nameIndex, linkedCount });
  } catch (error) { /* no window */ }
}());
