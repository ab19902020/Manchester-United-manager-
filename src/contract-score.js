/* global ACTIONS, G, playerById, expectedWage */

/* =====================================================================
   CONTRACT SCORE — the goal bonus, at every size of club
   ---------------------------------------------------------------------
   Agent One logged this one and left it for me, because fixing it means
   touching the acceptance score rather than the sheet that feeds it.

   `submitTerms` decides a borderline offer with

       score = wage/ask*70
             + lengthPreference
             + min(8, signOn/(ask*8)*8)
             + min(4, bonus/8e3*4)          <-- this one
             + releaseClause
             + loyalty

   Every term is relative to what the player is asking except the goal
   bonus, which is measured against a flat £8,000. That is a Premier
   League number, and it breaks the lever at both ends of the pyramid:

     NATIONAL LEAGUE. The sheet opens at £50 a goal, because Agent One
     scaled the opening offer to 5% of the weekly wage. £50 against a
     £8,000 yardstick is 0.025 of the four points it is worth. You can
     type any bonus a club at that level could afford and the number
     will not move the decision. A dead lever.

     PREMIER LEAGUE. The opposite failure, and the reason this is worth
     fixing rather than special-casing the bottom. The sheet opens at
     £7,500 there, which already scores 3.75 of 4 — so the term is
     pinned near its ceiling before you touch it and there is nothing to
     gain by offering more. Also a dead lever, just at the other end.

   ---------------------------------------------------------------------
   THE SCALE COMES FROM AGENT ONE'S OWN NUMBER. `goalBonusFor(weekly)`
   is what the sheet opens with — five per cent of a week's wage. Full
   marks are now double that opening offer, at every level:

     the sheet's opening bonus  -> 2 of 4 points
     twice the opening bonus    -> 4 of 4 points

   So the term means the same thing to a National League winger as to an
   international, there is always room to improve it, and it is tied to
   Agent One's constant rather than to a second one of mine that would
   drift out of step the first time they retune it.

   ---------------------------------------------------------------------
   WHY THIS WRAPS RATHER THAN REPLACES. `ACTIONS.submitTerms` has been
   redefined three times in the legacy file and the live one is already
   a full reimplementation that never calls its predecessor. Copying its
   seventy lines to change one expression would work today and would
   silently override whatever Agent One does to it next — which is the
   exact failure mode all three of us have now been bitten by.

   So the score is not reimplemented. The bonus is converted into the
   value that produces the correct number of points under the formula
   that is already there, the original runs untouched, and the real
   figure is put back on the player afterwards so he is paid what was
   actually offered. `p.bonus` is the only place the number lands.
   ===================================================================== */

(function contractScore() {
  if (typeof ACTIONS !== 'object' || !ACTIONS || typeof ACTIONS.submitTerms !== 'function') return;

  /* the constant the existing formula measures a bonus against */
  const LEGACY_FULL = 8000;

  function openingBonus(weekly) {
    try {
      const balance = typeof window !== 'undefined' && window.RBSBalance;
      if (balance && typeof balance.goalBonusFor === 'function') return balance.goalBonusFor(weekly);
    } catch (error) { /* fall through to the local copy */ }
    /* Agent One's rule, repeated only for the case where the balance
       module did not load: five per cent of a week, on a sane step */
    const raw = Math.max(0, (+weekly || 0)) * 0.05;
    const step = raw >= 2000 ? 500 : raw >= 200 ? 50 : 10;
    return Math.max(step, Math.round(raw / step) * step);
  }

  function askingWage(negotiation) {
    let wage = +(negotiation && negotiation.exp) || 0;
    if (wage > 0) return wage;
    try {
      const p = playerById(negotiation && negotiation.pid);
      if (p) wage = +expectedWage(p, !!(negotiation && negotiation.renew)) || 0;
    } catch (error) { /* no expectation available */ }
    return wage;
  }

  const previous = ACTIONS.submitTerms;

  ACTIONS.submitTerms = function submitTermsScaledBonus() {
    const field = (typeof document !== 'undefined') && document.getElementById('tBonus');
    const negotiation = (typeof G === 'object' && G) ? G.negotiation : null;
    if (!field || !negotiation) return previous.apply(this, arguments);

    const offered = Math.round(+field.value || 0);
    const fullMarks = openingBonus(askingWage(negotiation)) * 2;
    if (!(offered > 0) || !(fullMarks > 0)) return previous.apply(this, arguments);

    /* what the offer is worth on the corrected scale, expressed in the
       units the untouched formula is about to measure */
    const points = Math.min(4, (offered / fullMarks) * 4);
    const asLegacy = Math.round((points / 4) * LEGACY_FULL);

    let player = null;
    try { player = playerById(negotiation.pid); } catch (error) { player = null; }
    const bonusBefore = player ? player.bonus : undefined;

    field.value = String(asLegacy);
    try {
      return previous.apply(this, arguments);
    } finally {
      /* the sheet shows the real number again whether he signed or not,
         and a player who signed is paid what was actually offered */
      field.value = String(offered);
      if (player && player.bonus !== bonusBefore) player.bonus = offered;
    }
  };

  try {
    window.RBSContractScore = Object.freeze({ openingBonus, fullMarksBonus: (w) => openingBonus(w) * 2 });
  } catch (error) { /* no window */ }
}());
