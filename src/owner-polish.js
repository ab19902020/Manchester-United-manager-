/* global G, UI, ACTIONS, MU, mail:writable, vBoardRoom:writable, openPreMatch:writable, render, toast */

/* =====================================================================
   WHEN IT IS YOUR CLUB
   ---------------------------------------------------------------------
   Two things the owner's jobs (src/founder.js) left behaving as if you
   were somebody's employee.

   1. THE BOARD. An owner-manager or a chairman has no board above him,
      but the game's board -- its meetings, its monthly reviews, its
      letters -- is a large and well-made system that keeps score of how
      the season is going, and throwing it away would throw the score
      away too. So for an owner it becomes what it would really be: the
      investors who put money in beside you. They still hold you to the
      target you agreed; they cannot sack you (founder.js already turns a
      sacking into money taken back out of the transfer budget); and the
      room says so as you walk in. Everything else they say is the same,
      in their voice rather than an employer's.

   2. THE MATCH. A chairman does not stand on the touchline. His manager
      names the side and runs the match, so on matchday the game plays it
      out and puts the full-time report in front of him -- the same
      instant simulation the Simulate button runs, the same football. He
      can choose to watch from the directors' box instead, in the office.

   Neither touches a result. The first changes words; the second changes
   who presses the button, not what happens when it is pressed.
   ===================================================================== */
(function ownerPolish() {
  'use strict';

  const role = () => (typeof G !== 'undefined' && G && G.role) || 'manager';
  const isOwner = () => role() === 'owner' || role() === 'chairman';

  /* ---- 1. the board becomes the investors ----------------------------- */
  const SWAPS = [
    [/\bThe board are\b/g, 'Your investors are'], [/\bthe board are\b/g, 'your investors are'],
    [/\bThe board is\b/g, 'Your investors are'], [/\bthe board is\b/g, 'your investors are'],
    [/\bThe board has\b/g, 'Your investors have'], [/\bthe board has\b/g, 'your investors have'],
    [/\bThe board was\b/g, 'Your investors were'], [/\bthe board was\b/g, 'your investors were'],
    [/\bThe board's\b/g, 'Your investors’'], [/\bthe board's\b/g, 'your investors’'],
    [/\bThe board’s\b/g, 'Your investors’'], [/\bthe board’s\b/g, 'your investors’'],
    [/\bThe board\b/g, 'Your investors'], [/\bthe board\b/g, 'your investors'],
    [/\bBoard losing patience\b/g, 'Investors losing patience'],
    [/\bBoard meeting\b/g, 'Investors’ meeting'], [/\bboard meeting\b/g, 'investors’ meeting'],
    [/\bTHE BOARD\b/g, 'YOUR INVESTORS'],
  ];
  function reframe(text) {
    if (typeof text !== 'string' || !isOwner()) return text;
    let out = text;
    SWAPS.forEach(([from, to]) => { out = out.replace(from, to); });
    return out;
  }

  if (typeof mail === 'function') {
    const previous = mail;
    mail = function mailForOwners(type, title, body) {
      if (type === 'board' && isOwner()) {
        const args = Array.prototype.slice.call(arguments);
        args[1] = reframe(title); args[2] = reframe(body);
        return previous.apply(this, args);
      }
      return previous.apply(this, arguments);
    };
  }

  const BANNER = '<div class="op-investors"><b>You own this club.</b> The people at this table are the investors who '
    + 'put money in beside you. They cannot sack you — but if they lose faith, they take money back out of the transfer budget.</div>';

  if (typeof vBoardRoom === 'function') {
    const previous = vBoardRoom;
    vBoardRoom = function vBoardRoomForOwners() {
      const h = previous.apply(this, arguments);
      if (!isOwner() || typeof h !== 'string') return h;
      try {
        /* text only: attributes and markup are left exactly as they were */
        const body = h.replace(/>([^<]+)</g, (all, text) => '>' + reframe(text) + '<');
        const at = body.indexOf('>');
        return at < 0 ? BANNER + body : body.slice(0, at + 1) + BANNER + body.slice(at + 1);
      } catch (error) { return h; }
    };
  }

  /* ---- 2. the chairman's matchday -------------------------------------- */
  function watches() { return !!(G && G.owner && G.owner.watch); }

  if (typeof openPreMatch === 'function') {
    const previous = openPreMatch;
    openPreMatch = function openPreMatchChairman() {
      const r = previous.apply(this, arguments);
      try {
        if (role() === 'chairman' && !watches() && typeof ACTIONS.simMatch === 'function') {
          setTimeout(() => {
            try {
              /* only if the pre-match screen is still the one in front of him */
              if (document.querySelector('[data-action="kickoff"]')) ACTIONS.simMatch();
            } catch (error) { /* he can still press it himself */ }
          }, 120);
        }
      } catch (error) { /* the screen is open either way */ }
      return r;
    };
  }

  /* the same, for the road that reaches the ground through the dressing
     room: the match screen opens waiting for a kick-off nobody will press */
  let playing = false;
  if (typeof window.buildMatchScreen === 'function') {
    const previous = window.buildMatchScreen;
    window.buildMatchScreen = function buildMatchScreenChairman() {
      const r = previous.apply(this, arguments);
      try {
        if (role() === 'chairman' && !watches() && !playing && typeof ACTIONS.simMatch === 'function') {
          setTimeout(() => {
            try {
              const waiting = document.querySelector('#matchScreen.open [data-action="kickoff"]');
              const done = typeof MU !== 'undefined' && MU && MU.m && MU.m.done;
              if (!waiting || done || playing) return;
              playing = true;
              ACTIONS.simMatch();
            } catch (error) { /* he can still press it himself */ } finally { playing = false; }
          }, 80);
        }
      } catch (error) { /* the screen is built either way */ }
      return r;
    };
  }

  ACTIONS.opWatch = () => {
    if (!G || role() !== 'chairman') return;
    G.owner = G.owner || {};
    G.owner.watch = !G.owner.watch;
    toast(G.owner.watch ? 'You will watch from the directors’ box' : 'Your manager will get on with it — you will see the result');
    try { if (typeof ACTIONS.directorsOffice === 'function') ACTIONS.directorsOffice(); } catch (error) { render(); }
  };

  /* the toggle lives in the office, under the money */
  if (typeof ACTIONS.directorsOffice === 'function') {
    const previous = ACTIONS.directorsOffice;
    ACTIONS.directorsOffice = function officeWithMatchday() {
      const r = previous.apply(this, arguments);
      try {
        if (role() !== 'chairman') return r;
        const links = document.querySelector('#sheetBody .do-links');
        if (!links || document.getElementById('opMatchday')) return r;
        links.insertAdjacentHTML('beforebegin', '<h4 id="opMatchday">Matchday</h4><p class="do-note">'
          + (watches() ? 'You watch every match from the directors’ box.' : 'Your manager plays the match and you see the full-time report.')
          + '</p><div class="cc-chips"><button class="chip' + (watches() ? '' : ' on') + '" data-action="opWatch">Let him get on with it</button>'
          + '<button class="chip' + (watches() ? ' on' : '') + '" data-action="opWatch">Watch from the box</button></div>');
      } catch (error) { /* the office is open either way */ }
      return r;
    };
  }

  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-owner-polish';
    style.textContent = '.op-investors{margin:0 0 12px;padding:11px 13px;border-radius:12px;font-size:12.5px;line-height:1.5;'
      + 'color:#d9e0e8;background:rgba(251,225,34,.08);border:1px solid rgba(251,225,34,.3)}.op-investors b{color:var(--gold,#fbe122)}';
    document.head.appendChild(style);
  }

  window.RBSOwnerPolish = Object.freeze({ reframe });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
