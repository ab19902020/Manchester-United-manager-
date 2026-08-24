/* global */

/* =====================================================================
   FOUR LAYOUT FAULTS FIXED, AND ONE DIAGNOSED AND LEFT
   ---------------------------------------------------------------------
   "improve the visual layout but keep all functionality"

   Nothing here changes what a control does, what a screen contains or
   what any of it is worth. Every rule below moves pixels, and every one
   of them answers a fault that `scripts/audit-layout.cjs` can point at
   with a number.

   That rig exists because reading screenshots produced three faults in a
   row that were not faults. The Continue dock "covering" the bottom of
   every screen -- the scroller has had padding for it for months and
   every screen scrolls clear. The tab rails "cut dead" at the right edge
   -- they have a measured edge fade that sizes itself to how much is
   actually hidden. A section's value "colliding" with the rule beside it
   -- a ten pixel gap, and the value sits a clean seventeen pixels off
   the glass. Three confident readings of a picture, three wrong.

   So what follows is only what survived measurement.
   ===================================================================== */

(function layoutPolish() {
  const CSS = [

    /* -----------------------------------------------------------------
       NOT FIXED, AND DIAGNOSED SO THE NEXT ATTEMPT STARTS AHEAD
       -----------------------------------------------------------------
       A transfer row reads "23 · unscouted" and renders "3 ·". The age
       loses its first digit, so a 33-year-old shows as a 3-year-old, on
       every unscouted row in the market.

       Measured, and the chain is fully known:

         `.prow` is a grid, `auto minmax(0,1fr) auto`. Avatar, the
         player's details, the money block.
         `.pright`, the money block, measures 178px, and what holds it
         open is one declaration -- `.psub{white-space:nowrap}` on the
         wage line, "£453K/w wanted · on £370K/w now".
         The third track is `auto`, so it takes its 178px first and the
         1fr track holding the name, club and age is left with 76.
         `.pmeta` does carry `text-overflow:ellipsis`, which would trim
         this neatly, and it is inert because `.pmeta` is also
         `display:flex`. So instead the age -- an anonymous flex item
         with no minimum -- is squeezed to nothing and clipped.

       Four fixes were tried and three of them regressed the row. Making
       `.pmeta` a block put the ellipsis back in charge and cost MORE
       information: the crest jumped to its own line, the row grew to
       three, and the age and the scouting status were both lost rather
       than one digit. A min-width floor on the middle column overflowed
       the grid -- the auto track will not shrink -- and printed `.pmain`
       across `.pright` by 57px on every row. Letting the third track
       shrink and the wage line wrap did not move either width: the
       track's max is still max-content, and nothing forces it down.

       Every one of those was caught by scripts/audit-layout.cjs within a
       run, which is the reason none of them shipped. What this needs is
       the row's markup reworked so the wage line is not competing with
       the player's own details for the same track -- not another CSS
       rule -- and that is a change to how the row is built rather than
       how it is painted. Left alone deliberately.

*/

    /* -----------------------------------------------------------------
       2. THE COUNTRY YOU MANAGE IN SITS ON TOP OF THE NEXT ONE
       -----------------------------------------------------------------
       On the league table, your own country's chip is `position:sticky`
       so it stays reachable however far the rail is scrolled. Good idea,
       one omission: `.chip` is `background:rgba(255,255,255,.03)` and
       `.chip.on` is a gradient that does not cover it either, so the
       chip that slides underneath shows straight through the one pinned
       on top of it.

       Measured: England's chip ends at x=106 while France's begins at
       x=85. Twenty-one pixels of two flags printed over each other.

       An opaque backdrop under the sticky chip only. The rule is written
       so the chip's own colour still paints over it, which keeps the
       selected chip looking selected. */
    '.chip.cchome{background-color:#0d1410}',
    '.chip.cchome.on{background-color:#0d1410;'
      + 'background-image:linear-gradient(160deg,#e6392b,#b31f14)}',
    /* and a touch more shadow, so it reads as pinned rather than stuck */
    '.chip.cchome{box-shadow:10px 0 14px -8px rgba(0,0,0,.85)}',

    /* -----------------------------------------------------------------
       3. THE SHORTLIST STAR IS A SEVENTEEN PIXEL TARGET
       -----------------------------------------------------------------
       17x21, on every player row in the transfer market. The glyph is
       the right size -- it is the hit area that is wrong, and the two
       are not the same thing.

       Extended with a pseudo-element rather than padding, because
       padding would move the star and everything beside it. This changes
       no layout at all: the box stays 17x21 and the tappable area
       becomes 44x44, centred on it. */
    '.star-btn{position:relative}',
    '.star-btn::after{content:"";position:absolute;left:50%;top:50%;',
    ' width:44px;height:44px;transform:translate(-50%,-50%);border-radius:50%}',

    /* -----------------------------------------------------------------
       4. AND THE MONTH ARROWS ARE 24x32
       -----------------------------------------------------------------
       Same fault, same fix, on the calendar's ‹ and ›. */
    '.secnav .btn-ghost,.calnav .btn-ghost{position:relative}',
    '.secnav .btn-ghost::after,.calnav .btn-ghost::after{content:"";position:absolute;',
    ' left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}',

    /* -----------------------------------------------------------------
       5. A CHIP WITH A SHORT LABEL IS A SMALL TARGET AND AN ODD SHAPE
       -----------------------------------------------------------------
       The chip rails are deliberately 32px tall to fit more football on
       a phone, and that is a density decision worth keeping. What it
       does not account for is a chip whose label is two characters:
       "GK" comes out 39x32 and "All" 36x32, which is both hard to hit
       and visibly lopsided next to "Premier League".

       A floor on the width evens the rail up and widens the target;
       the height is extended the same way as the star, so the rail
       keeps its 32px rhythm while the thumb gets 44. */
    '.chip{min-width:44px;justify-content:center;position:relative}',
    '.chips>.chip::after,.subtabs>.chip::after{content:"";position:absolute;',
    ' left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}',
  ].join('');

  try {
    const st = document.createElement('style');
    st.id = 'layout-polish';
    st.textContent = CSS;
    document.head.appendChild(st);
  } catch (error) { /* the game still plays without the polish */ }
}());
