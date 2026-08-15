/* global G, paintTacticsPitch:writable, playerById, formAvg */

/* =====================================================================
   THE TACTICS TOKEN — FITNESS ON THE SHIRT, NOT UNDER THE NAME
   ---------------------------------------------------------------------
   "the portrait screen has the players names and fitness ratings
    overlapping"

   THIS ONE IS MINE, AND HERE IS THE MISTAKE. When the tactics pitch was
   first unsquashed I put the position label and the vitals on one line
   and made `.tvit` `position:static` so they would flow together:

       #tacPitch .tslot .ps  { display:inline }
       #tacPitch .tslot .tvit{ position:static; display:inline-flex }

   It measured clean, because at the time I measured it the vitals read
   `100%`. They only read `100%` before anybody has played a match. Once
   a player has a form average the tag becomes `● 99% · 6.2`, which does
   not fit beside `AML` in a 62px token, so it wraps to a third line, the
   token grows about fifteen pixels, and it runs into the row below.

   A screenshot after four months shows it plainly. My check had been a
   screenshot on day one.

   ---------------------------------------------------------------------
   THE FIX IS NOT MORE LINES, IT IS FEWER.

   Eleven tokens have to fit a 522px pitch, and the tightest rows are
   twelve pixels apart. A token that needs three lines of text under the
   shirt cannot be made to fit by adjusting the text; it has to stop
   needing three lines.

   So the two numbers move onto the shirt itself, where they cost no
   height at all:

     condition   the ring around the avatar — green, amber, red. This is
                 what "fitness at a glance" actually means, and a colour
                 says it faster than "99%" does.
     form        a small pill on the bottom-left of the shirt, mirroring
                 the rating badge on the bottom-right.
     injured     the pill becomes a cross instead.

   What is left under the shirt is the name and the position: two lines,
   both `nowrap`, a fixed height that cannot grow whatever the season
   does. The exact percentages are still a tap away on his profile.
   ===================================================================== */

(function tacticsToken() {
  const CSS = [
    /* the label block: two lines, fixed, and it never wraps into a third */
    '#tacPitch .tslot .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    ' margin-top:3px;font:700 9px/1.2 var(--body)}',
    '#tacPitch .tslot .ps{display:block;white-space:nowrap;font-size:8px;line-height:1.15}',

    /* the shirt carries the numbers now */
    '#tacPitch .tslot .jersey{position:relative;overflow:visible;',
    ' border-width:2.5px;transition:border-color .2s}',

    /* form, bottom-left, mirroring the rating badge on the right */
    '#tacPitch .tslot .tvit{position:absolute;left:-7px;bottom:-5px;right:auto;top:auto;',
    ' transform:none;min-width:19px;height:15px;padding:0 3px;border-radius:8px;',
    ' display:flex;align-items:center;justify-content:center;gap:0;',
    ' font:800 9px/1 var(--body);letter-spacing:0;white-space:nowrap;',
    ' background:#12151a;border:1.5px solid rgba(255,255,255,.35);color:#fff;',
    ' box-shadow:0 2px 5px rgba(0,0,0,.55);pointer-events:none;z-index:3}',
    '#tacPitch .tslot .tvit.tv-none{display:none}',
    '#tacPitch .tslot .tvit i{display:none}',
  ].join('');

  try {
    const tag = document.createElement('style');
    tag.id = 'tactics-token';
    tag.textContent = CSS;
    document.head.appendChild(tag);
  } catch (error) { /* the pitch still draws */ }

  function condColour(cond) {
    return cond >= 80 ? '#3ddc84' : cond >= 62 ? '#ffd21f' : '#ff6b6b';
  }

  function paint() {
    const box = document.querySelector('#tacPitch');
    if (!box || !G || !G.tacs) return;
    box.querySelectorAll('.tslot').forEach((el) => {
      let p = null;
      try { p = playerById(G.tacs.xi[+el.dataset.v]); } catch (error) { p = null; }
      if (!p) return;

      const jersey = el.querySelector('.jersey');
      const vit = el.querySelector('.tvit');
      const cond = Math.round(p.cond == null ? 100 : p.cond);

      /* the ring is the fitness */
      if (jersey) jersey.style.borderColor = condColour(cond);

      if (!vit) return;
      /* MOVED INSIDE THE SHIRT. The engine appends it to the token, where
         being absolute would hang it below the name; inside the jersey it
         sits on the badge line instead. */
      if (jersey && vit.parentNode !== jersey) jersey.appendChild(vit);

      let form = 0;
      try { form = (typeof formAvg === 'function') ? formAvg(p) : 0; } catch (error) { form = 0; }

      if (p.injury) {
        vit.className = 'tvit';
        vit.textContent = '✚';
        vit.style.color = '#ff6b6b';
        vit.title = 'Injured';
      } else if (form) {
        vit.className = 'tvit';
        vit.textContent = form.toFixed(1);
        vit.style.color = form >= 7.2 ? '#3ddc84' : form >= 6.4 ? '#fff' : '#ffb0a8';
        vit.title = 'Form ' + form.toFixed(2) + ' · condition ' + cond + '%';
      } else {
        /* nothing to say yet: the ring already carries the condition, and
           an empty pill on every shirt is noise */
        vit.className = 'tvit tv-none';
        vit.textContent = '';
        vit.title = 'Condition ' + cond + '%';
      }
    });
  }

  if (typeof paintTacticsPitch === 'function') {
    const previous = paintTacticsPitch;
    paintTacticsPitch = function paintTacticsPitchTokens() {
      const result = previous.apply(this, arguments);
      try { paint(); } catch (error) { /* the pitch is still drawn */ }
      return result;
    };
  }

  try {
    window.RBSTacticsToken = Object.freeze({ paint, condColour });
  } catch (error) { /* no window */ }
}());
