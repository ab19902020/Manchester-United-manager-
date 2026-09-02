/* global openProfile:writable, playerById, face */

/* =====================================================================
   THE PLAYER CARD
   ---------------------------------------------------------------------
   "Massive upgrade to visual player cards and manager."

   The portrait on it has been rebuilt (src/avatar-upgrade.js). This is
   the card the portrait sits on, and photographed at the size it is
   played at -- 390x844 -- it has four things wrong with it.

   THE MAN IS THE SMALLEST THING ON HIS OWN CARD. The portrait is drawn
   at 56px beside a 26px name, and the rating -- the number the whole
   game turns on -- is a 22px-tall pill floating off to the right at the
   same weight as a tag. Meanwhile the loudest object on the screen by a
   distance is a full-width gold slab reading "Have a word with
   Fernandes": a secondary action, given the visual weight of the main
   event, in the one colour nothing else on the card uses.

   THE ATTRIBUTES ARE A SPREADSHEET. Sixteen rows of name-on-the-left,
   number-on-the-right, each with a hairline under it. Every one is
   identical in weight, so finding out whether a midfielder can pass
   means reading sixteen numbers and holding them in your head. This is
   a football game: what you want from a glance at a card is the SHAPE
   of a player -- quick and brave and cannot head it -- and a column of
   digits is the one presentation that never gives you that.

   THE VITALS ARE THE MOST IMPORTANT NUMBERS AND THE FAINTEST THINGS ON
   THE CARD. Condition, sharpness and morale decide results -- they are
   inputs to `effA`, they are half of why a good squad loses -- and they
   are drawn as 5px rules under 9px grey capitals.

   ---------------------------------------------------------------------
   HOW THIS IS DONE, AND WHY IT IS ALMOST ALL CSS. A player profile is
   the most decorated sheet in the game: six separate layers append to
   it and two of them prepend, and an earlier note in the legacy file
   records that reordering its children broke the chrome. So nothing
   here moves a node. `decorate()` adds marker classes and sets one
   custom property per attribute; the stylesheet does the rest. If the
   tagging ever stops matching, the card renders exactly as it does
   today rather than breaking.
   ===================================================================== */

(function playerCard() {
  'use strict';

  /* -------------------------------------------------------------------
     1. THE TAGGING PASS
     -------------------------------------------------------------------
     Everything below keys off marker classes rather than off `.row` and
     `.attr`, which are generic and used on every screen in the game.
     ------------------------------------------------------------------- */

  /* An attribute is scored out of twenty. The bar behind each row is
     that fraction -- but not from zero: a professional footballer's
     attributes almost never fall below about five, so a bar drawn from
     zero puts every player in the top half of it and the differences
     that matter get squeezed into a third of the width. Drawn from
     four, the range a squad actually occupies fills the track. */
  const FLOOR = 4;
  const CEIL = 20;

  function fill(n) {
    const v = (n - FLOOR) / (CEIL - FLOOR);
    return Math.max(0, Math.min(1, v));
  }

  /* the id of the profile currently open, so the head portrait can be
     redrawn at the size it is actually displayed at */
  let openId = null;

  function decorate(body) {
    if (!body) return;
    const grid = body.querySelector('.attr-grid');
    /* AND IT HAS TO LET GO AGAIN. There is one sheet element in the
       game and every sheet is written into it, so a marker class left
       behind when a profile closes would style whatever opened next --
       a contract talk, a scout report -- as though it were a player
       card. Nothing else keys off `.pcard`, so clearing it here is the
       whole of the cleanup. */
    if (!grid) {
      body.classList.remove('pcard');
      return;
    }
    body.classList.add('pcard');

    /* THE HEAD is the first row carrying both a portrait and a name.
       Found by what it contains rather than by position, because two
       layers prepend to this sheet. */
    const rows = body.querySelectorAll(':scope > .row');
    let head = null;
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].querySelector('svg') && rows[i].querySelector('h3')) {
        head = rows[i];
        break;
      }
    }
    if (head) {
      head.classList.add('pc-head');
      /* AND THE PORTRAIT IS REDRAWN AT THE SIZE IT IS SEEN AT.
         `face(p, sz)` is asked for 46 or 56 here and the stylesheet
         above then displays it at 86, which is fine for an SVG -- it
         scales -- but not for the avatar layer, which uses the
         requested size to decide whether the lighting rig is worth
         drawing. Below its threshold a card portrait got the smudges
         removed and none of the light that replaced them. Asking for
         the size it is shown at costs one call and makes the two
         agree. */
      try {
        const svg = head.querySelector('svg');
        const p = (openId != null && typeof playerById === 'function')
          ? playerById(openId) : null;
        if (svg && p && typeof face === 'function' && !svg.dataset.pcSized) {
          const lifted = document.createElement('div');
          lifted.innerHTML = face(p, 96);
          const next = lifted.firstChild;
          if (next && next.tagName && next.tagName.toLowerCase() === 'svg') {
            next.dataset.pcSized = '1';
            head.replaceChild(next, svg);
          }
        }
      } catch (error) { /* the old portrait is still a portrait */ }
      /* the badge row is whichever row follows it */
      let sib = head.nextElementSibling;
      while (sib && !sib.classList.contains('row')) sib = sib.nextElementSibling;
      if (sib && sib.querySelector('.pos-badge')) sib.classList.add('pc-badges');
    }

    /* THE VITALS: the row of three bars. Identified by holding bars and
       no portrait, so it cannot be confused with the head. */
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i] !== head && rows[i].querySelectorAll('.bar').length >= 2) {
        rows[i].classList.add('pc-vitals');
      }
    }

    /* THE ATTRIBUTES. Each row gets the fraction of the scale it fills,
       which is the whole trick: CSS cannot read the number in the
       markup, so it is handed over as a custom property and the bar is
       drawn from it. */
    /* all of them, not just the one found above: a profile lists
       Technical, Mental and Physical as three separate grids. */
    const cells = body.querySelectorAll('.attr-grid .attr');
    Array.prototype.forEach.call(cells, function (cell) {
      const v = cell.querySelector('.v');
      if (!v) return;
      const n = parseFloat(String(v.textContent).replace(/[^0-9.]/g, ''));
      if (!isFinite(n)) return;
      cell.classList.add('pc-attr');
      cell.style.setProperty('--v', (fill(n) * 100).toFixed(1) + '%');
      /* the tier decides the colour, and the existing av- classes only
         cover three bands. A fourth for the genuinely elite is what
         makes a 19 look different from a 15 at a glance. */
      cell.classList.remove('pc-t1', 'pc-t2', 'pc-t3', 'pc-t4');
      cell.classList.add(n >= 17 ? 'pc-t4' : n >= 14 ? 'pc-t3' : n >= 10 ? 'pc-t2' : 'pc-t1');
    });
  }

  /* -------------------------------------------------------------------
     2. WHEN IT RUNS
     -------------------------------------------------------------------
     This file is loaded last, so wrapping `openProfile` here puts the
     tagging after every layer that decorates the sheet. The frame's
     delay is because two of those layers fill themselves in
     asynchronously -- the form strip and the season analytics -- and a
     bar cannot be sized from a number that is not written yet.
     ------------------------------------------------------------------- */
  function run() {
    try {
      decorate(document.getElementById('sheetBody'));
    } catch (error) { /* the card is still a card */ }
  }

  try {
    if (typeof openProfile === 'function') {
      const pass = openProfile;
      openProfile = function openProfileCarded(id) {
        openId = id;
        const out = pass.apply(this, arguments);
        run();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        setTimeout(run, 60);
        return out;
      };
      window.openProfile = openProfile;
    }
  } catch (error) { /* ignore */ }

  /* EVERY OTHER SHEET, so the card styling is put away when one opens.
     `openModal` is the single place the sheet's contents are replaced --
     forty-odd screens write through it -- which makes it the one hook
     that cannot be got round. It runs before the profile's own layers
     have appended anything, so it will always find no attributes and
     clear the class; the `openProfile` wrapper above then puts it back
     for a profile. */
  try {
    if (typeof window.openModal === 'function') {
      const passModal = window.openModal;
      window.openModal = function openModalCarded() {
        const out = passModal.apply(this, arguments);
        run();
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     3. THE CARD
     ------------------------------------------------------------------- */
  const CSS = [
    /* ---- the head ------------------------------------------------- */
    /* A card should open on the man. The portrait triples, sits on a
       ring and casts a shadow so it reads as an object on the card
       rather than an image pasted into it; the name takes the size the
       gold button used to have; and the rating becomes the medallion it
       always should have been. */
    '.pcard .pc-head{display:grid;grid-template-columns:auto 1fr auto;',
    ' gap:14px;align-items:center;padding:2px 0 12px;margin-bottom:2px;',
    ' border-bottom:1px solid var(--edge,rgba(255,255,255,.08))}',
    '.pcard .pc-head>svg{width:86px!important;height:86px!important;border-radius:20px;',
    ' box-shadow:0 10px 26px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.10),',
    ' inset 0 1px 0 rgba(255,255,255,.12)}',
    /* FLUID, BECAUSE THE LONGEST NAME DECIDES THIS AND NOT THE SHORTEST.
       At a flat 23px "Bruno Fernandes" wraps to two lines on a 390px
       phone once the portrait and the medallion have taken their share
       of the row -- and a wrapped name pushes the club line off the
       card. Sized against the viewport it holds one line down to the
       narrowest phone and still opens big on a tablet. */
    '.pcard .pc-head h3{font-size:clamp(17px,5.2vw,23px);line-height:1.12;',
    ' margin:0 0 5px;letter-spacing:-.4px}',
    /* nationality and club stop being two faint lines and become one
       legible strip, which is all they ever needed to be */
    '.pcard .pc-head .xs.faint,.pcard .pc-head .small.muted{font-size:12px;',
    ' color:var(--ink-faint,#8c9a90);line-height:1.5}',
    '.pcard .pc-head .crest{width:15px;height:15px;vertical-align:-3px}',

    /* THE RATING. Sized off the card's most important number rather
       than off the tag pills it currently matches. */
    '.pcard .pc-head .ovr{width:50px;height:50px;min-width:50px;border-radius:16px;',
    ' font-size:20px;font-family:var(--disp,inherit);letter-spacing:-.5px;',
    ' align-self:start;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),',
    ' 0 6px 16px rgba(0,0,0,.45)}',

    /* ---- the badges ----------------------------------------------- */
    '.pcard .pc-badges{flex-wrap:wrap;gap:6px;margin:10px 0 2px;align-items:center}',
    /* the stars stay next to the word Potential. Pushing them to the
       far edge with margin-left:auto put a hand's width between a label
       and the only thing it labels. */
    '.pcard .pc-badges .stars{margin-left:2px}',

    /* ---- the gold slab -------------------------------------------- */
    /* It is a conversation, not the point of the card. Kept obvious --
       it is still gold and still full width -- but at the height of an
       action rather than of a banner. */
    '.pcard .btn-gold.btn-block{height:44px;min-height:44px;font-size:14px;',
    ' padding:0 16px;margin:12px 0;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.35)}',
    '.pcard .btn-gold.btn-block{font-weight:800;letter-spacing:.1px}',

    /* ---- the vitals ----------------------------------------------- */
    /* Condition, sharpness and morale are inputs to the match engine.
       They are drawn here like it: a real track, a legible label, and
       the reading in the card's display face. */
    '.pcard .pc-vitals{gap:10px;margin:14px 0 4px}',
    '.pcard .pc-vitals>div{flex:1;min-width:0;background:var(--well,rgba(0,0,0,.24));',
    ' border:1px solid var(--edge,rgba(255,255,255,.07));border-radius:14px;padding:9px 10px}',
    /* THE LABEL CARRIES THE READING -- it is "CONDITION 100%", not
       "CONDITION" -- so it is the one thing on the card that must never
       be truncated. Wide tracking at 9.5px overflowed a third of a
       390px row and ellipsed the number away, which left three bars
       and no values. Tighter, and allowed to wrap rather than cut. */
    '.pcard .pc-vitals .xs.faint{font-size:9px;letter-spacing:.35px;text-transform:uppercase;',
    ' font-weight:800;color:var(--ink-faint,#8c9a90);margin-bottom:7px;line-height:1.25}',
    '.pcard .pc-vitals .bar{height:7px}',

    /* ---- the attributes ------------------------------------------- */
    /* THE SPREADSHEET BECOMES A SHAPE. Each row keeps its name and its
       number exactly where they were -- nothing is moved, so nothing
       that reads this markup breaks -- and gains a track behind them
       filled to the value. Sixteen of those in two columns is a
       silhouette of the player: you see the long bars and the short
       ones before you have read a single word. */
    '.pcard .attr-grid{gap:5px 14px}',
    '.pcard .pc-attr{position:relative;border-bottom:0;padding:7px 9px;border-radius:9px;',
    ' background:var(--well,rgba(0,0,0,.22));overflow:hidden;isolation:isolate}',
    '.pcard .pc-attr::before{content:"";position:absolute;inset:0 auto 0 0;width:var(--v,0%);',
    ' background:linear-gradient(90deg,rgba(255,255,255,.05),var(--pc-fill,rgba(255,255,255,.16)));',
    ' z-index:-1;transition:width .35s cubic-bezier(.2,.8,.3,1)}',
    /* the leading edge, so a bar has a definite end rather than fading
       out into the track and leaving the length ambiguous */
    '.pcard .pc-attr::after{content:"";position:absolute;top:0;bottom:0;left:var(--v,0%);',
    ' width:1.5px;background:var(--pc-edge,rgba(255,255,255,.34));z-index:-1}',
    '.pcard .pc-attr>span:first-child{color:var(--ink,#e8f0ea);font-weight:600;',
    ' position:relative;z-index:1}',
    '.pcard .pc-attr .v{position:relative;z-index:1;font-variant-numeric:tabular-nums}',
    /* four bands, because three cannot separate a good player from a
       great one and that is the distinction the card exists to show */
    '.pcard .pc-t1{--pc-fill:rgba(255,255,255,.10);--pc-edge:rgba(255,255,255,.20)}',
    '.pcard .pc-t2{--pc-fill:rgba(120,190,255,.22);--pc-edge:rgba(120,190,255,.50)}',
    '.pcard .pc-t3{--pc-fill:rgba(61,220,132,.24);--pc-edge:rgba(61,220,132,.60)}',
    '.pcard .pc-t4{--pc-fill:rgba(255,196,60,.28);--pc-edge:rgba(255,196,60,.75)}',
    '.pcard .pc-t4 .v{color:#ffd36b}',

    /* ---- the section headings ------------------------------------- */
    /* Technical, Mental, Physical are the card's structure and they are
       set smaller and fainter than the rows they organise. A rule
       running off to the right is the cheapest way to make a heading
       read as one. */
    '.pcard .chip-lbl{display:flex;align-items:center;gap:9px;margin:16px 0 8px;',
    ' font-size:10px;letter-spacing:1.5px;color:var(--ink-faint,#8c9a90)}',
    '.pcard .chip-lbl::after{content:"";flex:1;height:1px;',
    ' background:linear-gradient(90deg,var(--edge,rgba(255,255,255,.10)),transparent)}',

    /* ---- the tiles ------------------------------------------------- */
    '.pcard .grid3{gap:8px;margin:10px 0}',
    '.pcard .kpi{padding:11px 12px;border-radius:14px}',
    '.pcard .kpi .v{font-size:17px}',

    /* ---- and the room it is read in -------------------------------- */
    /* The chrome reserves a row for a close button and nothing else,
       which pushes the man a third of the way down his own card before
       anything has been read. */
    '.pcard>.grab{margin-top:0;margin-bottom:6px}',

    /* WIDE SCREENS. Two columns of attributes is right on a phone and
       wasteful on a tablet, where the same card has twice the width and
       the list still runs off the bottom. */
    '@media (min-width:700px){.pcard .attr-grid{grid-template-columns:1fr 1fr 1fr}',
    ' .pcard .pc-head>svg{width:116px!important;height:116px!important}}',

    /* MOTION. The bars grow when the card opens, which is the one place
       animation earns its keep here -- it draws the eye along the
       length of each bar, which is the thing being read. */
    '@media (prefers-reduced-motion:reduce){.pcard .pc-attr::before{transition:none}}'
  ].join('');

  try {
    const tag = document.createElement('style');
    tag.id = 'rbs-player-card';
    tag.textContent = CSS;
    (document.head || document.documentElement).appendChild(tag);
  } catch (error) { /* ignore */ }

  try {
    window.RBSPlayerCard = Object.freeze({ decorate: run, fill, FLOOR, CEIL });
  } catch (error) { /* no window */ }
}());
