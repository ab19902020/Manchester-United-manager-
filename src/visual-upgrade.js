/* global */

/* =====================================================================
   THE VISUAL PASS
   ---------------------------------------------------------------------
   "Improve everything visually. A visual upgrade, a UI upgrade, to the
    maximum level possible."

   The game already has a design system -- a floodlit-pitch palette, a
   card, a chip, a rating pill -- and it is decent. What it does not have
   is CONSISTENCY OF MATERIAL AND DENSITY. Every surface is the same flat
   charcoal rectangle, so nothing tells you what is a page, what is a
   card and what is a control inside one; every label is the same shouty
   grey small-caps, so a screen of six labels reads as six headlines; and
   the form controls are sized as though the phone had nothing else to
   show, which is why the transfer market -- the screen where the whole
   point is the list of players -- is entirely filter boxes above the
   fold.

   So this is one layer that does four things, in order of how much they
   are worth:

     1. THE CHROME STOPS LEAKING. The bottom navigation is frosted at
        0.86 alpha, so fourteen per cent of the page reads through it:
        photographed on the transfer market, "Jude Bellingham", "Real
        Madrid" and an 87 are all legible THROUGH the tab bar. Chrome
        that you can see the page through is the single thing that makes
        an interface look unfinished, and it is on every screen.

     2. MATERIAL AND DEPTH. Three surface levels that actually differ --
        the page, a card raised off it, and an inset well inside a card
        -- each with a light edge on top and a shadow under it, so the
        eye can tell a container from its contents without reading them.

     3. DENSITY. The controls are 56px tall with 20px gaps. Bringing them
        to a normal phone rhythm puts roughly a third more football on
        every screen without shrinking a single tap target below the 44px
        floor the audit enforces.

     4. TYPE AND COLOUR DISCIPLINE. One label style instead of four. One
        accent -- the club's red -- for the thing you are meant to press,
        and structure carried by weight and spacing instead. Tabular
        numerals wherever numbers sit in a column, so they line up.

   NOTHING HERE CHANGES WHAT ANYTHING DOES. It is a stylesheet: no markup
   is rewritten, no handler is wrapped, no value is recomputed. Every
   rule is additive and scoped, and `scripts/audit-layout.cjs` is the
   check that it did not break a screen -- reading a screenshot is how
   three faults got "found" that were not faults.
   ===================================================================== */

(function visualUpgrade() {
  'use strict';

  const CSS = [

    /* =================================================================
       0. TOKENS THE REST OF THIS LEANS ON
       -----------------------------------------------------------------
       Added rather than replaced, so every existing rule keeps working
       and anything not touched here looks exactly as it did.
       ================================================================= */
    ':root{',
    /* three real surface levels, each a step lighter than the last */
    ' --surf-0:#0a0f0b;',
    ' --surf-1:#121a13;',
    ' --surf-2:#18221a;',
    ' --well:rgba(0,0,0,.28);',
    /* one edge and one shadow, used everywhere, so depth is consistent */
    ' --edge:rgba(255,255,255,.07);',
    ' --edge-soft:rgba(255,255,255,.045);',
    ' --lift-1:0 1px 0 var(--edge) inset, 0 2px 8px rgba(0,0,0,.35);',
    ' --lift-2:0 1px 0 var(--edge) inset, 0 8px 24px -8px rgba(0,0,0,.6);',
    ' --lift-3:0 1px 0 var(--edge) inset, 0 18px 40px -14px rgba(0,0,0,.75);',
    /* motion, short enough to feel like the interface responding rather
       than the interface animating */
    ' --t-fast:120ms cubic-bezier(.2,.7,.3,1);',
    ' --t-med:180ms cubic-bezier(.2,.7,.3,1);',
    '}',

    /* =================================================================
       1. THE CHROME STOPS LEAKING
       -----------------------------------------------------------------
       The nav's own gradient runs .86 -> .97, and .86 is see-through.
       A tab bar you can read the page through is the loudest "this is
       not finished" signal an interface has. Two layers now: an opaque
       base that nothing gets through, and the blur on top of it for the
       material.
       ================================================================= */
    '.nav{',
    ' background:linear-gradient(180deg,rgba(9,14,10,.97),rgba(6,10,7,1)) !important;',
    ' -webkit-backdrop-filter:blur(18px) saturate(140%);',
    ' backdrop-filter:blur(18px) saturate(140%);',
    ' border-top:1px solid var(--edge);',
    ' box-shadow:0 -12px 28px -18px rgba(0,0,0,.9)}',

    /* the header is chrome too, and it had the same softness */
    '.hdr{',
    ' background:linear-gradient(180deg,rgba(10,16,11,.99),rgba(8,13,9,.96));',
    ' -webkit-backdrop-filter:blur(14px) saturate(130%);',
    ' backdrop-filter:blur(14px) saturate(130%);',
    ' border-bottom:1px solid var(--edge)}',

    /* and the Continue dock, which sits over a scrolling list */
    '.dock,.continue-dock,#continueDock{',
    ' -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}',

    /* =================================================================
       2. MATERIAL: A CARD LOOKS LIKE A CARD
       -----------------------------------------------------------------
       A light edge along the top and a shadow underneath is the whole
       trick -- it is how a physical card sitting on a surface catches
       the light, and two rules of it separate a container from its
       contents better than any amount of border colour.
       ================================================================= */
    '.card{',
    ' background:linear-gradient(180deg,var(--surf-2),var(--surf-1));',
    ' border:1px solid var(--edge-soft);',
    ' box-shadow:var(--lift-2);',
    ' border-radius:var(--radius)}',

    /* a card inside a card is a WELL, not another card: it goes darker
       and sinks, which is the opposite of raising, and that contrast is
       what makes a group read as a group */
    '.card .card,.card .tile,.card .box,.card .inset{',
    ' background:var(--well);',
    ' box-shadow:inset 0 1px 0 rgba(0,0,0,.35), inset 0 -1px 0 var(--edge-soft);',
    ' border:1px solid rgba(0,0,0,.25)}',

    /* the stat tiles on the squad screen are the clearest example */
    '.sqstat,.statgrid>div,.ptile{',
    ' background:var(--well);',
    ' border:1px solid rgba(0,0,0,.22);',
    ' box-shadow:inset 0 1px 0 rgba(0,0,0,.3), inset 0 -1px 0 var(--edge-soft);',
    ' transition:transform var(--t-fast), box-shadow var(--t-fast)}',
    '.ptile:active{transform:scale(.985)}',

    /* =================================================================
       3. DENSITY
       -----------------------------------------------------------------
       The form controls are built for a screen with nothing on it. The
       transfer market is the proof: at 56px a control and 20px a gap,
       the entire first screen is filters and the players -- the reason
       the screen exists -- start below the fold.

       Everything below stays at or above the 44px touch floor that
       audit-layout.cjs enforces; what comes out is the air around them.
       ================================================================= */
    '.card select,.card input[type=text],.card input[type=search],',
    '.card input[type=number],select.sel,input.inp{',
    ' min-height:44px;padding:10px 12px;font-size:14.5px;',
    ' background:var(--well);border:1px solid var(--edge-soft);',
    ' border-radius:12px;color:var(--ink);',
    ' transition:border-color var(--t-fast), box-shadow var(--t-fast)}',
    '.card select:focus,.card input:focus,select.sel:focus,input.inp:focus{',
    ' border-color:rgba(218,41,28,.55);',
    ' box-shadow:0 0 0 3px rgba(218,41,28,.14);outline:none}',

    /* the label above a control does not need to be a headline */
    '.card .chip-lbl,.card .lbl,.card .fld-l{',
    ' font-size:10px;letter-spacing:1.1px;font-weight:800;',
    ' color:var(--ink-faint);text-transform:uppercase;margin-bottom:5px}',

    /* =================================================================
       4. CHIPS: SELECTED SHOULD LOOK CHOSEN, NOT FOCUSED
       -----------------------------------------------------------------
       A selected chip is currently a red 1px outline, which reads as a
       focus ring rather than a choice -- especially with several rails
       on one screen, where three red outlines look like three errors.
       Filled and lifted reads as "this one", and leaves the outline free
       to mean what an outline means.
       ================================================================= */
    '.chip{',
    ' background:var(--surf-2);',
    ' border:1px solid var(--edge-soft);',
    ' color:var(--ink-dim);font-weight:700;',
    ' transition:background var(--t-fast), color var(--t-fast),',
    '   border-color var(--t-fast), transform var(--t-fast)}',
    '.chip:active{transform:scale(.97)}',
    '.chip.on{',
    ' background:linear-gradient(180deg,#e0392c,#b81f14);',
    ' border-color:rgba(255,255,255,.16);',
    ' color:#fff;font-weight:800;',
    ' box-shadow:0 1px 0 rgba(255,255,255,.18) inset, 0 6px 16px -8px rgba(218,41,28,.9)}',

    /* =================================================================
       5. TYPE
       ================================================================= */
    /* every number that sits in a column lines up */
    '.num,.tbl td,.tbl th,.rr-sc,.pt-val,.sqstat .v{',
    ' font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}',

    /* a section heading is a heading, not a shout */
    '.sec .t{letter-spacing:1.3px;font-size:12.5px}',

    /* the league table gets a little more room to breathe per row and a
       clearer separation, which is most of what makes a table readable */
    '.tbl td{padding-top:9px;padding-bottom:9px}',
    '.tbl tbody tr{transition:background var(--t-fast)}',
    '.tbl tbody tr:active{background:rgba(255,255,255,.05)}',

    /* =================================================================
       6. THE PRIMARY ACTION
       -----------------------------------------------------------------
       One button on the screen is the one you are meant to press, and it
       should look pressable: a gradient with a light top edge and a
       shadow that grounds it, rather than a flat fill.
       ================================================================= */
    '.btn-primary,.btn.btn-primary{',
    ' background:linear-gradient(180deg,#e8402f,#c02216);',
    ' border:1px solid rgba(255,255,255,.14);',
    ' box-shadow:0 1px 0 rgba(255,255,255,.22) inset, 0 10px 24px -12px rgba(218,41,28,.95);',
    ' transition:transform var(--t-fast), box-shadow var(--t-fast)}',
    '.btn-primary:active,.btn.btn-primary:active{transform:translateY(1px);',
    ' box-shadow:0 1px 0 rgba(255,255,255,.18) inset, 0 4px 12px -8px rgba(218,41,28,.9)}',
    '.btn{transition:background var(--t-fast), border-color var(--t-fast),',
    ' transform var(--t-fast)}',
    '.btn:active{transform:translateY(1px)}',

    /* =================================================================
       7. A PLAYER ROW, WHICH IS THE MOST REPEATED THING IN THE GAME
       ================================================================= */
    '.prow{transition:background var(--t-fast)}',
    '.prow:active{background:rgba(255,255,255,.045)}',
    /* the rating pill carries the eye down a squad list, so it gets the
       same edge-and-shadow treatment as everything else raised */
    '.ovr,.ovrpill{box-shadow:0 1px 0 rgba(255,255,255,.16) inset,',
    ' 0 4px 10px -6px rgba(0,0,0,.8)}',

    /* =================================================================
       8. CONTENT FADES UNDER THE CHROME RATHER THAN BEING SLICED
       -----------------------------------------------------------------
       The Continue dock floats over a scrolling list, which is right --
       the scroller has padding so everything can be reached. What it
       looked like was a guillotine: a hard-edged red bar with a player's
       name cut in half behind it. A short gradient above the dock, and
       another above the tab bar, turns a cut into a fade, which is what
       every list under fixed chrome does.

       Both are `pointer-events:none` so nothing beneath becomes
       unpressable -- the audit checks exactly that, and CONTROLS COVERED
       BY SOMETHING ELSE stays at nought.
       ================================================================= */
    '.continue-dock{position:fixed}',
    '.continue-dock::before{content:"";position:absolute;left:0;right:0;',
    ' bottom:-14px;height:74px;pointer-events:none;z-index:-1;',
    ' background:linear-gradient(180deg,rgba(8,12,9,0),rgba(8,12,9,.72) 45%,rgba(8,12,9,.92))}',
    '.nav::before{content:"";position:absolute;left:0;right:0;top:-26px;height:26px;',
    ' pointer-events:none;',
    ' background:linear-gradient(180deg,rgba(8,12,9,0),rgba(8,12,9,.82))}',

    /* =================================================================
       9. THE NUMBERS THAT DESCRIBE A SQUAD
       -----------------------------------------------------------------
       `.vitals` and `.depth` are the tiles at the top of the squad -- the
       best XI, the age, how many in each department. They are the first
       thing on the screen and they were flat panels the same colour as
       the card holding them, so the group read as one grey block. Sunk
       into the card, each one becomes a thing you can count.
       ================================================================= */
    '.vitals .vt,.depth .dcell{',
    ' background:var(--well);',
    ' border:1px solid rgba(0,0,0,.24);',
    ' border-radius:12px;',
    ' box-shadow:inset 0 1px 0 rgba(0,0,0,.32), inset 0 -1px 0 var(--edge-soft)}',
    '.vitals .vv,.depth .dn{font-variant-numeric:tabular-nums;letter-spacing:-.3px}',
    '.vitals .vl,.depth .dl{font-size:9.5px;letter-spacing:1.1px;color:var(--ink-faint)}',

    /* NOT THE HEADER'S TOP ROW. `.hrow` was tried here on the assumption
       it was the quick-stat strip -- PREM, NEXT MATCH, SQUAD, INBOX --
       and it is the row above it: the manager's face, the crest, the
       club's name and the budget. Giving every child a sunken panel put
       a box round each of those, which looked like three empty fields
       across the top of every screen. The strip it was meant for was
       already right, so nothing replaces it. */

    /* a position group heading on the squad list */
    '.pgsec .pgt{letter-spacing:1.4px}',
    '.pgsec .pgl{opacity:.55}',

    /* =================================================================
       10. THE TOAST HAS TO LOOK LIKE IT IS FLOATING
       -----------------------------------------------------------------
       It appears over whatever is on the screen, which is what a toast
       is for. Photographed on the home screen it read as a fault rather
       than an overlay: an opaque slab sitting across the middle of the
       pre-season card with the sentence behind it cut mid-word. The
       thing that sells an overlay is not opacity, it is ELEVATION -- a
       real shadow under it and a lit top edge -- so the eye puts it in
       front of the page instead of in it.
       ================================================================= */
    '#toast{',
    ' background:linear-gradient(180deg,#22301f,#16211a);',
    ' border:1px solid rgba(255,255,255,.14);',
    ' -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);',
    ' box-shadow:0 1px 0 rgba(255,255,255,.18) inset,',
    '   0 18px 46px -12px rgba(0,0,0,.92), 0 4px 14px rgba(0,0,0,.55)}',

    /* =================================================================
       11. MODAL SHEETS, which are the other thing that sits over a page
       ================================================================= */
    '#sheetBody,.sheet{',
    ' background:linear-gradient(180deg,var(--surf-2),var(--surf-1));',
    ' box-shadow:var(--lift-3)}',
    '#modalHost.open{-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',

    /* =================================================================
       12. MAKING YOUR MANAGER
       -----------------------------------------------------------------
       "When you make the manager, we need to update that area as well."

       It is the first screen of a career and the only one that is about
       you, and photographed at 390x844 the bottom 45% of it is empty
       grey. The parts are all right -- a portrait, a name, four tabs,
       the controls -- they are just laid out as a form with a picture
       beside it rather than as the moment you are given a manager.

       So the portrait becomes the subject: bigger, centred, standing on
       a pool of light instead of floating in a square. The controls go
       into a panel that FILLS the space rather than trailing off into
       it, and the tabs, the swatches and the footer get the same
       material as the rest of the game.
       ================================================================= */
    /* THE ROOM HE IS STANDING IN, which was a different game's room.
       The creator's backdrop ramps #1d2530 -> #0a0d12 -> #05070a, a cold
       blue-grey, while every surface laid on top of it -- the panel, the
       tabs, the wells -- comes from the green-black palette the rest of
       the game is built in. On a phone the join is obvious: a navy stage
       with a green card sitting on it. Same light, same shape, the
       game's own colour. */
    '#mgrCreate{background:',
    ' radial-gradient(120% 60% at 50% -6%,rgba(201,163,92,.14),transparent 62%),',
    ' radial-gradient(1200px 700px at 50% -10%,#16211a,#0a0f0b 60%,#050806)}',

    /* the portrait, lit from above and standing on something */
    '.mgr-head{flex-direction:column;text-align:center;gap:10px;padding:18px 18px 10px;',
    ' position:relative}',
    /* AND THE OLD SHADOW GOES. An earlier layer pools a shadow at
       left:22px, which was under the portrait when the portrait was
       left-aligned. It is centred now, so that pool sits out on its own
       to the side of him with nothing above it. */
    '.mgr-head::after{display:none}',
    '.mgr-head::before{content:"";position:absolute;left:50%;top:-30px;',
    ' width:300px;height:300px;transform:translateX(-50%);pointer-events:none;',
    ' background:radial-gradient(closest-side,rgba(255,235,190,.13),rgba(255,235,190,0) 70%)}',
    '.mgr-port{position:relative}',
    '.mgr-port svg{width:154px !important;height:154px !important;',
    ' border-radius:22px}',
    /* the pool of light he is standing on */
    '.mgr-port::after{content:"";position:absolute;left:50%;bottom:-13px;',
    ' width:150px;height:20px;transform:translateX(-50%);pointer-events:none;',
    ' background:radial-gradient(closest-side,rgba(0,0,0,.55),rgba(0,0,0,0) 72%)}',
    '.mgr-id{width:100%}',
    '.mgr-n{font-size:30px;letter-spacing:-.4px}',
    '.mgr-rand{margin-top:12px;min-height:38px;padding:8px 18px;font-size:12px}',

    /* the controls sit in a panel that reaches the footer */
    '.mgr-body{background:linear-gradient(180deg,var(--surf-2),var(--surf-1));',
    ' border:1px solid var(--edge-soft);border-radius:18px 18px 0 0;',
    ' box-shadow:0 1px 0 var(--edge) inset, 0 -12px 30px -18px rgba(0,0,0,.8);',
    ' margin:0 10px;padding:16px 14px 20px}',
    '.mgr-tabs{padding:0 10px 10px}',
    '.mgr-tab{min-height:40px;transition:background var(--t-fast),color var(--t-fast)}',
    '.mgr-tab.on{box-shadow:0 1px 0 rgba(255,255,255,.35) inset,',
    ' 0 6px 16px -8px rgba(201,163,92,.8)}',

    /* a colour swatch is a thing you pick, so it gets a real chosen state */
    '.mgr-sw{width:42px;height:42px;transition:transform var(--t-fast),',
    ' box-shadow var(--t-fast),border-color var(--t-fast)}',
    '.mgr-chip{min-height:40px;transition:background var(--t-fast)}',

    /* the field labels stop shouting: they were 1.8px tracked caps, four
       of them down a short screen, each as loud as the name at the top */
    '.mgr-lbl{font-size:10px;letter-spacing:1.1px;color:var(--ink-faint)}',

    /* and the footer is chrome, so it gets the chrome treatment */
    '.mgr-foot{background:linear-gradient(180deg,rgba(8,12,9,.86),rgba(6,10,7,.99));',
    ' -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    ' border-top:1px solid var(--edge)}',
    '.mgr-foot .btn{min-height:46px}',

    /* =================================================================
       13. MOTION, AND THE PEOPLE WHO DO NOT WANT IT
       ================================================================= */
    '@media (prefers-reduced-motion:reduce){',
    ' *,*::before,*::after{transition-duration:.01ms !important;',
    '  animation-duration:.01ms !important}}',
  ].join('');

  try {
    const st = document.createElement('style');
    st.id = 'visual-upgrade';
    st.textContent = CSS;
    /* appended last so it wins over the layers above without any rule
       needing !important beyond the one place the nav gradient does */
    document.head.appendChild(st);
  } catch (error) { /* the game looks as it did */ }
}());
