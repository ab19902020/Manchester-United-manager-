/* global */

/* =====================================================================
   FIVE LAYOUT FAULTS, FOUR OF THEM FIXED IN CSS
   ---------------------------------------------------------------------
   "improve the visual layout but keep all functionality"

   Nothing here changes what a control does, what a screen contains or
   what any of it is worth. Every fix below moves pixels, and every one
   of them answers a fault that `scripts/audit-layout.cjs` can point at
   with a number.

   Four are stylesheet rules. The fifth is not, and could not be: four
   CSS attempts at it were measured and three made the row worse. It
   moves one line of a player row from one column to another, which is
   markup, so it is a wrapper at the bottom of this file rather than a
   rule in the middle of it.

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
       1. THE AGE ON A TRANSFER ROW, WHICH THE WAGE LINE WAS EATING
       -----------------------------------------------------------------
       A market row reads "23 · unscouted" and rendered "3 ·", so a
       33-year-old showed as a 3-year-old on every unscouted row.

       The chain, measured: `.prow` is a grid of `auto minmax(0,1fr)
       auto` -- avatar, the player's details, the money block. The money
       block measures 178px, and one declaration holds it open:
       `.psub{white-space:nowrap}` on the wage line, "£453K/w wanted · on
       £370K/w now". The third track is `auto`, so it takes its 178px
       first and the 1fr track holding the name, club and age is left
       with 76. `.pmeta` does carry `text-overflow:ellipsis`, which would
       trim that neatly, and it is inert because `.pmeta` is also
       `display:flex` -- so the age, an anonymous flex item with no
       minimum, is squeezed to nothing and cut from the left.

       Four CSS fixes were tried and three regressed the row, every one
       caught by the audit inside a run. Making `.pmeta` a block put the
       ellipsis back in charge and cost MORE: the crest jumped to its own
       line and the age AND the scouting status were both lost. A
       min-width floor on the middle column overflowed the grid and
       printed the two columns across each other by 57px. Letting the
       third track shrink moved neither width, because its max is still
       max-content and nothing forces it down.

       None of them could work, because none of them addressed the
       actual cause: a long line of text is in the narrow column. The fix
       is to put it in the wide one -- see `wideSubOntoItsOwnLine` at the
       foot of this file. What stays here is how it looks once it is
       there. */
    '.psub-wide{margin-top:3px;font-size:10.5px;font-weight:800;',
    ' color:var(--ink-faint);font-variant-numeric:tabular-nums;letter-spacing:.2px}',

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

  /* -------------------------------------------------------------------
     A LONG SUBTITLE BELONGS IN THE WIDE COLUMN
     -------------------------------------------------------------------
     `pRowInner` puts `opt.sub` in `.pright`, beside the rating pill, and
     for almost every row that is right: a squad row's sub is a value or
     a wage, six to nine characters, and it costs the row nothing. The
     transfer market's is "£453K/w wanted · on £370K/w now" -- thirty-one
     characters that will not wrap -- and it is the only one wide enough
     to starve the column beside it.

     So only that one moves. Under sixteen characters nothing changes at
     all, which leaves every other screen exactly as it was; over it, the
     line goes under the player's details where there is room for it, and
     the money column shrinks to the rating pill and the star.

     It is done by splicing the row's own markup rather than rebuilding
     it, so the row stays whatever `pRowInner` says it is -- and if that
     structure ever changes, the anchor is not found and the row is
     returned untouched.
     ------------------------------------------------------------------- */
  function wideSubOntoItsOwnLine() {
    if (typeof window.pRowInner !== 'function') return;
    const pass = window.pRowInner;
    const ANCHOR = '</div><div class="pright">';
    window.pRowInner = function pRowInnerWideSub(p, opt) {
      const o = opt || {};
      const sub = o.sub == null ? '' : String(o.sub);
      const text = sub.replace(/<[^>]*>/g, '');
      if (text.length <= 16) return pass.call(this, p, o);
      let html;
      try { html = pass.call(this, p, { ...o, sub: null }); }
      catch (error) { return pass.call(this, p, o); }
      const at = html.indexOf(ANCHOR);
      if (at < 0) return pass.call(this, p, o);
      return html.slice(0, at)
        + '<div class="psub psub-wide">' + sub + '</div>'
        + html.slice(at);
    };
  }

  try { wideSubOntoItsOwnLine(); } catch (error) { /* rows render as they did */ }
}());
