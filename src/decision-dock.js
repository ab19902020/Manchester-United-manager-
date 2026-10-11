/* global G, ACTIONS, blockingMails, renderDock, renderHdr, render, toast */

/* =====================================================================
   THE "ANSWER 1 THING" BUTTON THAT WENT DEAD
   ---------------------------------------------------------------------
   Found by playing a career through the real interface. Agree a loan
   from the inbox and the dock still read "⚠️ Answer 1 thing — Loan
   enquiry", and pressing it did nothing at all, however many times. The
   season could not be continued from the button that was offered.

   The cause is an ordering fault repeated across the legacy file. A mail
   answer is an action wrapped by later layers, and the inner action
   draws the screen before the outer one clears the letter:

       ACTIONS.loanDo = function (el) {
         const r = inner(el);            // ...which ends with render()
         m.actions = null;               // the letter is answered AFTER
         return r;
       };

   So the dock is drawn while the letter is still open, then the letter
   closes, and nothing draws the dock again. Pressing it runs
   `gotoDecision`, which finds no open letter and returns without a word.
   The same shape appears in a dozen wrappers, so fixing the loan alone
   would leave the next one waiting.

   Two things, both about the screen telling the truth:

   1. After any answer given from a letter (every response button carries
      the letter's id as `data-mid`), the dock and header are redrawn once
      the whole chain of wrappers has finished.

   2. If the dock is pressed with nothing left to answer, it redraws
      itself into Continue and says so, rather than doing nothing.

   Nothing here answers a letter, chooses for the manager, or changes
   what any decision does.
   ===================================================================== */
(function decisionDock() {
  'use strict';

  if (typeof document === 'undefined' || typeof ACTIONS === 'undefined') return;

  function redraw() {
    try {
      if (typeof G === 'undefined' || !G || G.sacked) return;
      if (typeof renderDock === 'function') renderDock();
      if (typeof renderHdr === 'function') renderHdr();
    } catch (error) { /* the next render will catch up */ }
  }

  /* 1. a letter answered: redraw after every wrapper has had its turn */
  document.addEventListener('click', (event) => {
    const answer = event.target && event.target.closest ? event.target.closest('[data-mid]') : null;
    if (!answer || !answer.dataset || !answer.dataset.action) return;
    setTimeout(redraw, 0);
  });

  /* 2. the button can never be a dead end */
  if (typeof ACTIONS.gotoDecision === 'function') {
    const previous = ACTIONS.gotoDecision;
    ACTIONS.gotoDecision = function gotoDecisionOrCatchUp() {
      let open = 1;
      try { open = typeof blockingMails === 'function' ? blockingMails().length : 1; } catch (error) { open = 1; }
      if (!open) {
        try { if (typeof render === 'function') render(); else redraw(); } catch (error) { redraw(); }
        try { if (typeof toast === 'function') toast('✅ Nothing left to answer — carry on'); } catch (error) { /* no toast */ }
        return undefined;
      }
      return previous.apply(this, arguments);
    };
  }
})();
