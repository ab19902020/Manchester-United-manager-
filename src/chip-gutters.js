/* =====================================================================
   THE FIRST CHIP IN A SCROLLING ROW SAT ON THE EDGE OF THE SCREEN
   ---------------------------------------------------------------------
   Every horizontal chip rail in the game -- formations, mentality, the
   squad tabs, the league picker -- is built to bleed to the frame and
   hold its chips in by 14px, and to snap as you flick it:

       .chips,.subtabs   padding:2px 14px 4px; margin:0 -14px;
                         scroll-snap-type:x proximity
       .chips>*          scroll-snap-align:start

   Those last two lines quietly cancel the first. `scroll-snap-align:
   start` aligns a chip to the start of the SNAPPORT, and the snapport
   is the scrollport's padding box -- the frame edge -- not the content
   box the 14px padding creates. So the resting place for the first chip
   is hard against the edge of the phone, and the gutter every other
   element on the screen lines up to is not merely ignored, it is
   unreachable. Measured on the shipped build at 430px:

       row            scroll range     first chip
       squad tabs       14 - 111          x = 0
       formations       14 - 208          x = 0
       mentality        14 -  33          x = 0

   `scrollLeft = 0` reads back 14 instantly: the position does not
   exist. Fourteen pixels of every rail can never be shown.

   The corroboration is `.secnav`, the third rail. It is built the same
   way but has no snapping, and it alone renders its first item at x=14
   like everything else on the screen. Snap is the difference.

   `scroll-padding` is the property that exists for exactly this: it
   insets the snapport, so "start" means the start of the content rather
   than the start of the frame. One line, and the rails line up with the
   rest of the game while keeping the flick-to-snap that made them feel
   good in the first place.
   ===================================================================== */
(function chipGutters() {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  const css = [
    /* matches the 14px padding the rails already carry, so a snapped
       chip rests on the game's gutter instead of the frame */
    '.chips,.subtabs{scroll-padding-left:14px;scroll-padding-right:14px}',
    /* the country rail on the league screen is inset the same way */
    '.chips.ccrow{scroll-padding-left:14px;scroll-padding-right:14px}',
  ].join('');

  function install() {
    try {
      if (document.getElementById('rbs-chip-gutters')) return;
      const st = document.createElement('style');
      st.id = 'rbs-chip-gutters';
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    } catch (error) { /* the rails still work, they just sit tight to the edge */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  window.RBSChipGutters = { css: css, install: install };
})();
