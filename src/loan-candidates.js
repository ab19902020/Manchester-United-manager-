/* global G, vSquadLoans:writable, pRow, esc, starHtml, starsOf, potOf, fmtW */

/* =====================================================================
   AN EMPTY SCREEN THAT NAMES AN ACTION SHOULD OFFER IT
   ---------------------------------------------------------------------
   Found by scripts/audit-blank.cjs, which samples what each screen
   actually draws rather than what its markup says it drew. Squad → On
   Loan came back with a dead band of 366px, 49% of a 390x844 phone,
   starting at y=215.

   The screen is not broken. There genuinely is nobody out on loan in a
   fresh career, and it says so honestly:

       Nobody out on loan
       Fringe players of 23 and under develop faster with regular
       football elsewhere. The option is on their profile.

   The fault is the last sentence. It names an action, tells you the
   action lives somewhere else, and then leaves half the phone blank
   rather than taking you there -- so the one screen in the game devoted
   to loans is the one place you cannot arrange one. A player who does
   not already know which of his twenty-odd squad members are 23 and
   under and out of the side has to go and work it out himself, on a
   different screen, from a list sorted by something else.

   So the empty state answers its own sentence: the men this is actually
   about, youngest ceiling first, each one a tap from the profile that
   carries the button. The dead band becomes the shortlist.

   NOTHING IS INVENTED TO FILL SPACE. If there is nobody eligible --
   an old squad, or every young player already in the side -- it says
   that instead, because a list padded out with players the advice does
   not apply to is worse than the blank it replaced.
   ===================================================================== */

(function loanCandidates() {
  'use strict';

  /* the rule the screen already states: 23 and under, and not in the
     side. A man in your starting eleven is not a loan candidate however
     young he is, which is the whole meaning of "fringe". */
  const MAX_AGE = 23;

  function startingXI() {
    try {
      const ids = (G.tacs && G.tacs.xi) || [];
      return new Set(ids.filter(Boolean));
    } catch (error) { return new Set(); }
  }

  function candidates() {
    const club = G.clubs[G.my];
    if (!club || !club.players) return [];
    const xi = startingXI();
    return club.players
      .filter((p) => !p.loan && !p.injury && (p.age || 99) <= MAX_AGE && !xi.has(p.id))
      /* the ones with the most left to gain go first, because that is
         the reason the screen gives for doing it at all */
      .sort((a, b) => (potOf(b) - (b.ovr || 0)) - (potOf(a) - (a.ovr || 0)));
  }

  function block() {
    const list = candidates();
    if (!list.length) {
      return '<div class="card tight" style="margin-top:8px">'
        + '<div class="xs faint" style="line-height:1.5">Nobody in the squad fits: '
        + 'a loan is for a player of ' + MAX_AGE + ' or under who is not in your side, '
        + 'and right now everybody young enough is either playing or injured.</div></div>';
    }
    const rows = list.slice(0, 8).map((p) => {
      const gap = Math.max(0, potOf(p) - (p.ovr || 0));
      return pRow(p, {
        meta: esc(String(p.pos || '')) + ' · ' + (p.age || '?'),
        rail: gap > 0
          ? '<span class="faint" style="font-weight:800;letter-spacing:.5px">+'
            + gap + ' TO GAIN</span>' + starHtml(starsOf(potOf(p)))
          : '<span class="faint">Developed</span>',
        sub: (typeof fmtW === 'function' ? fmtW(p.wage) : ''),
      });
    }).join('');
    return '<div class="chip-lbl" style="margin-top:12px">Who you could send out</div>'
      + '<div class="card tight" style="padding:4px 8px">'
      + '<div class="plist">' + rows + '</div></div>'
      + '<div class="xs faint" style="padding:6px 4px;line-height:1.5">'
      + (list.length > 8 ? 'The eight with the most left to gain, of ' + list.length + '. ' : '')
      + 'Tap anyone to open his profile — the loan button is on it.</div>';
  }

  try {
    if (typeof vSquadLoans === 'function') {
      const pass = vSquadLoans;
      vSquadLoans = function vSquadLoansWithCandidates() {
        let html = pass.apply(this, arguments);
        try {
          const club = G.clubs[G.my];
          /* only the empty state. With men actually out on loan the
             screen has something to say and a later layer adds the
             wage bill under it. */
          if (club && (club.players || []).some((p) => p.loan)) return html;
          html += block();
        } catch (error) { /* the screen is still the screen */ }
        return html;
      };
      window.vSquadLoans = vSquadLoans;
    }
  } catch (error) { /* ignore */ }

  try {
    window.RBSLoanCandidates = Object.freeze({ candidates, MAX_AGE });
  } catch (error) { /* no window */ }
}());
