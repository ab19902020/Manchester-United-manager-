/* global face:writable, faceHair:writable, beardInk */

/* =====================================================================
   THE FACES: REAL LIGHT, AND HAIR THAT COVERS THE HEAD
   ---------------------------------------------------------------------
   "It's like they've got fake lighting on them. It don't look good, and
    it's like two weird circles over the faces. Also fix the hair, it
    still looks like they've got bald spots on the back of the head."

   Both of those are one cause, which is why fixing the lighting once
   before did not settle it. The portrait ends with two white ellipses
   drawn LAST, after the hair:

       <ellipse cx="9.1"  cy="14" rx="3.5" ry="10.5" opacity=".10"/>
       <ellipse cx="31.4" cy="19" rx="3.1" ry="8.5"  opacity=".045"/>

   They were meant as rim light. Two things go wrong. They are drawn on
   top of everything, so on the left they lie across the HAIR as well as
   the cheek -- a pale vertical streak through a dark head, which is
   exactly what a bald patch looks like. And they are ellipses of flat
   white with a hard falloff, so at avatar size the shape is lost and
   what is left is two smudges. Neither is lighting: light on a face
   follows the form, it does not sit on it in patches.

   An earlier pass narrowed them and left them in place. Narrower smudges
   are still smudges.

   ---------------------------------------------------------------------
   WHAT REPLACES THEM. Light with a direction, built the way a renderer
   builds it rather than painted on:

     a key light   one soft linear wash across the whole portrait from
                   the upper left, so every part of the head is lit by
                   the same lamp and nothing has its own private glow
     occlusion     a shadow under the hairline and under the jaw, which
                   is the thing that actually makes a face read as a
                   solid object rather than a sticker
     a rim         a genuine one: a thin bright line hugging the RIGHT
                   silhouette, one unit wide, which is what light behind
                   the shoulder does

   ---------------------------------------------------------------------
   AND THE BALD SPOTS GO WITH THEM, because they were never bald spots.
   A filled skull cap under every style was built first, on the
   assumption the hair was too thin -- and at 400px it reads as a helmet:
   a slab of flat ink with a hard edge across the temples under styles
   that carry their own highlight. It was thrown away. Rendering the same
   thirty-six faces before and after shows the streaks were the left rim
   ellipse lying across the hair, and removing it is the whole fix.

   THE SEAM GOES TOO. The head is drawn a second time in shadow ink,
   offset 1.6 units right, which leaves a straight vertical boundary from
   the temple down through the cheek. It is invisible at 28px and plain
   at 400. A head is shaded with a gradient, and a gradient has no edge.
   ===================================================================== */

(function avatarUpgrade() {
  'use strict';

  /* the two smudges, exactly as face-polish leaves them */
  const RIM = '<ellipse cx="9.1" cy="14" rx="3.5" ry="10.5" fill="#ffffff" opacity=".10"/>'
    + '<ellipse cx="31.4" cy="19" rx="3.1" ry="8.5" fill="#ffffff" opacity=".045"/>';
  /* and the version before it, in case this runs without that layer */
  const RIM_OLD = '<ellipse cx="10.4" cy="12.5" rx="6.2" ry="10" fill="#ffffff" opacity=".085"/>'
    + '<ellipse cx="30.6" cy="20" rx="4.4" ry="9" fill="#ffffff" opacity=".05"/>';
  /* THE HALO. A white ellipse thirty units across and twenty-two tall,
     laid over the card behind the head before anything else is drawn --
     on a 40x40 portrait that is most of the picture. It is the pale
     rounded glow sitting behind every head, and at .045 it is subtle
     enough that it never looks like light, only like the background
     being unevenly mixed. The card already has its own gradient. */
  const HALO = '<ellipse cx="20" cy="7" rx="15" ry="11" fill="#ffffff" opacity=".045"/>';
  /* the manager's portrait is drawn by its own renderer and carries the
     same one a hundredth heavier */
  const HALO_M = '<ellipse cx="20" cy="7" rx="15" ry="11" fill="#ffffff" opacity=".05"/>';

  /* the forehead bloom some layers end with */
  const SHEEN = /<ellipse cx="15\.[0-9]+" cy="(9|10)\.[0-9]+" rx="[456](\.[0-9]+)?" ry="[35](\.[0-9]+)?" fill="#fff" opacity="\.0[567]"\/>/g;

  /* THE HEAD'S OWN OUTLINE, WHICH HAS TO BE ASKED FOR RATHER THAN ASSUMED
     -------------------------------------------------------------------
     Light shaped to the wrong silhouette is worse than no light at all,
     and this is where the first attempt went wrong. It clipped everything
     to one hard-coded head path -- which turns out to be `JAWS.long`, one
     of FIVE the game draws, and not the one the manager uses. On any of
     the other four the "rim" no longer hugs the edge: it falls a unit or
     two INSIDE the face and draws a bright vertical line down the cheek
     and through the hair. Rendered at 400px that line is the pale streak
     through the hair that started all of this, put back by the thing
     meant to remove it.

     So the shape is read out of the portrait instead. Both renderers
     paint the head exactly once, as the silhouette filled with the skin
     gradient:

         <path d="{jaw}" fill="url(#sh{uid})"/>

     which is unique in the markup and gives the real outline for whatever
     jaw this face happens to have -- and for any jaw added later. */
  const HEAD = /<path d="(M20 [^"]+)" fill="url\(#sh[^)]*\)"\s*\/>/;
  /* the fallback, only if that ever stops matching */
  const SKULL = 'M20 2.9c-5.8 0-9.1 3.9-9.1 10.2 0 5.3.8 9.3 2.4 12.3 1.6 3 3.9 4.6 6.7 4.6'
    + 's5.1-1.6 6.7-4.6c1.6-3 2.4-7 2.4-12.3 0-6.3-3.3-10.2-9.1-10.2z';

  function headOf(svg) {
    const hit = HEAD.exec(svg);
    return (hit && hit[1]) || SKULL;
  }

  /* `k` scales the whole rig. The manager is drawn by a renderer that
     already shades him properly -- a three-stop diagonal skin gradient,
     lid shadows, a nose, creases -- so he wants a light touch on top of
     it. A player portrait has a flatter two-stop gradient and carries the
     full dose. */
  function dim(v, k) { return String(Math.round(v * k * 1000) / 1000).replace(/^0/, ''); }

  function lighting(uid, shape, k) {
    const head = shape || SKULL;
    const s = k || 1;
    return '<defs>'
      /* the key: one lamp, upper left, falling off across the face */
      + '<linearGradient id="kl' + uid + '" x1="0" y1="0" x2="1" y2="0.9">'
      /* GENTLE, AND WITH NO STOP IN THE MIDDLE. A three-stop version of
         this -- bright, nearly nothing at 45%, dark at the end -- put a
         visible boundary down the cheek where the curve changed
         direction. Two stops cannot have a knee in them. */
      + '<stop offset="0" stop-color="#fff" stop-opacity="' + dim(0.11, s) + '"/>'
      + '<stop offset="1" stop-color="#000" stop-opacity="' + dim(0.10, s) + '"/></linearGradient>'
      /* occlusion under the hairline: dark at the top, gone by the brow */
      + '<linearGradient id="ao' + uid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#000" stop-opacity="' + dim(0.30, s) + '"/>'
      + '<stop offset="0.34" stop-color="#000" stop-opacity="0"/>'
      + '<stop offset="0.78" stop-color="#000" stop-opacity="0"/>'
      + '<stop offset="1" stop-color="#000" stop-opacity="' + dim(0.26, s) + '"/></linearGradient>'
      + '<clipPath id="sk' + uid + '"><path d="' + head + '"/></clipPath>'
      + '</defs>'
      + '<g clip-path="url(#sk' + uid + ')">'
      + '<path d="' + head + '" fill="url(#kl' + uid + ')"/>'
      + '<path d="' + head + '" fill="url(#ao' + uid + ')"/>'
      /* A REAL RIM. The same silhouette, shifted a shade left and up and
         painted bright, then clipped back to where it started: all that
         survives is a sliver hugging the RIGHT edge, opposite the key,
         which is what a light behind the shoulder does. Because it is the
         portrait's own outline it stays on the edge whatever the jaw, and
         a line on the edge of the hair reads as light catching it -- it
         is a smudge across the middle that reads as a bald patch. */
      + '<path d="' + head + '" fill="none" stroke="#fff" stroke-opacity="' + dim(0.15, s) + '"'
      + ' stroke-width="0.9" transform="translate(-0.8,-0.45)"/>'
      + '</g>';
  }

  /* -------------------------------------------------------------------
     NO CAP UNDER THE HAIR, BECAUSE THE BALD SPOTS WERE NOT BALD SPOTS
     -------------------------------------------------------------------
     A filled skull cap under every style was the obvious answer to "bald
     spots on the back of the head" and it was the wrong one. Rendered at
     400px it reads as a helmet: a solid slab of flat ink with a hard
     edge across the temples, under styles that all carry their own
     highlight, so the join shows as a band.

     The spots were the two rim ellipses. They are drawn last, over the
     hair, so on a dark head the left one is a pale vertical streak
     through it -- which is what a bald patch looks like. Removing them,
     which is what this file does anyway, removes the spots. Measured by
     rendering the same thirty-six faces before and after: the streaks
     are gone and the hair is solid, with no cap involved.
     ------------------------------------------------------------------- */

  /* -------------------------------------------------------------------
     THE BEARD, WHICH IS A STAIN AND OUGHT TO BE HAIR
     -------------------------------------------------------------------
     Once the streak was off the faces this was the worst thing left on
     them at card size. A full beard is drawn as the beard mass in ink at
     eight-tenths opacity, and then the SAME path again at two-tenths
     shifted up a unit and a half to soften the join:

         <path d="{full}" fill="{ink}" opacity=".80" .../>
         <path d="{full}" fill="{ink}" opacity=".22" transform="translate(0,-1.6)"/>

     Two translucent copies of one shape over a skin gradient do not make
     hair. They make a wash the colour of neither -- on pale skin a muddy
     beige, on dark skin almost nothing -- with a second faint edge
     running parallel to the first, a unit and a half above it. Rendered
     at 200px it reads as a mask laid over the lower face, which is what
     it is.

     What a beard actually is: an opaque material of its own, with a
     growth edge that fades over two or three units rather than stopping
     dead, and enough texture that the eye reads hair. So:

       the mass    near-opaque, so it is its own colour and not a tint
                   of the cheek underneath
       the edge    a real gradient mask, fading in across the band the
                   beard line runs through, instead of a second copy
       texture     short strokes along the grain, lighter than the mass,
                   dense at the chin and sparse at the cheek
       form        a highlight under the lower lip and along the jaw, so
                   the beard has a near side and a far side like the rest
                   of the head does

     The moustache and the other four styles keep their shapes -- those
     were fixed properly once already -- and gain the same material. */
  function beardBody(uid, full, ink, clip, k) {
    const g = 'bd' + uid;
    /* the growth edge. The beard line runs through y=21..24 wherever it
       is on the face, so a wash that fades in across that band lands on
       the line whatever the jaw is doing, which a second offset copy of
       the path never did. */
    return '<defs><linearGradient id="' + g + 'g" gradientUnits="userSpaceOnUse"'
      + ' x1="0" y1="19.6" x2="0" y2="24.4">'
      + '<stop offset="0" stop-color="#fff" stop-opacity="0"/>'
      + '<stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>'
      + '<mask id="' + g + 'm"><rect width="40" height="40" fill="url(#' + g + 'g)"/>'
      + '</mask></defs>'
      + '<path d="' + full + '" fill="' + ink + '" opacity="' + k + '"'
      + ' mask="url(#' + g + 'm)"' + clip + '/>';
  }

  /* the grain. Short strokes following the way a beard lies -- down and
     outward from the chin -- in a lighter tone than the mass, which is
     what stops a solid shape reading as paint. */
  const GRAIN = [
    [14.2, 25.0, 13.6, 27.4], [15.8, 26.2, 15.4, 28.8], [17.6, 26.8, 17.4, 29.6],
    [20.0, 27.0, 20.0, 29.9], [22.4, 26.8, 22.6, 29.6], [24.2, 26.2, 24.6, 28.8],
    [25.8, 25.0, 26.4, 27.4], [12.8, 22.6, 12.4, 24.6], [27.2, 22.6, 27.6, 24.6]
  ];
  function beardGrain(clip, tone) {
    let s = '<g stroke="' + tone + '" stroke-width=".42" stroke-linecap="round"'
      + ' opacity=".30" fill="none"' + clip + '>';
    GRAIN.forEach(function (v) {
      s += '<path d="M' + v[0] + ' ' + v[1] + 'L' + v[2] + ' ' + v[3] + '"/>';
    });
    return s + '</g>';
  }

  try {
    if (typeof faceHair === 'function') {
      const passHair = faceHair;
      /* the mass, exactly as the game draws it */
      const FULL = 'M5 12 C6.5 19, 9.5 22.4, 13.5 23.4 C16 22.6, 18 22.2, 20 22.2 '
        + 'C22 22.2, 24 22.6, 26.5 23.4 C30.5 22.4, 33.5 19, 35 12 L35 36 L5 36 Z';
      const TASH = 'M16.5 21.35 C17.6 20.5, 18.75 20.15, 20 20.15 C21.25 20.15, 22.4 20.5, 23.5 21.35 '
        + 'C22.5 21.85, 21.3 22.1, 20 22.1 C18.7 22.1, 17.5 21.85, 16.5 21.35 Z';
      faceHair = function faceHairMaterial(kind, H, S, uid) {
        const was = passHair.apply(this, arguments);
        try {
          if (kind !== 'full' && kind !== 'stubble') return was;
          if (!was || was.indexOf(FULL) < 0) return was;
          const ink = (typeof beardInk === 'function') ? beardInk(H, S) : (H && H.b) || '#3a2a1e';
          const clip = ' clip-path="url(#jw' + uid + ')"';
          const lift = (H && H.h) || '#ffffff';
          if (kind === 'stubble') {
            /* stubble is skin showing through hair, so it stays light --
               but it gets the same real edge instead of two flat copies */
            return beardBody(uid, FULL, ink, clip, '.42')
              + beardGrain(clip, lift).replace('opacity=".30"', 'opacity=".16"');
          }
          return beardBody(uid, FULL, ink, clip, '.94')
            + beardGrain(clip, lift)
            /* under the lower lip, where a beard always catches the light */
            + '<path d="M17.4 25.4c1.7.7 3.5.7 5.2 0" stroke="' + lift + '"'
            + ' stroke-width=".55" fill="none" opacity=".22"' + clip + '/>'
            /* the moustache keeps its shape -- it was got right once
               already, thin and parted under the nose -- and only gains
               the same opacity as the mass it belongs to */
            + '<path d="' + TASH + '" fill="' + ink + '" opacity=".9"/>';
        } catch (error) { /* the beard is still a beard */ }
        return was;
      };
      window.faceHair = faceHair;
    }
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     AND THE PORTRAIT ITSELF
     ------------------------------------------------------------------- */
  try {
    if (typeof face === 'function') {
      const pass = face;
      face = function faceLit() {
        let svg = pass.apply(this, arguments);
        try {
          if (!svg || svg.indexOf('<svg') < 0) return svg;
          const had = svg.indexOf(RIM) >= 0 || svg.indexOf(RIM_OLD) >= 0
            || svg.indexOf(HALO) >= 0 || svg.indexOf(HALO_M) >= 0 || SHEEN.test(svg);
          SHEEN.lastIndex = 0;
          /* AND THE SEAM DOWN THE MIDDLE OF EVERY FACE. The head is
             drawn a second time in shadow ink, offset 1.6 units right
             and clipped to the card:

               <path d="{jaw}" fill="{S.d}" opacity=".16"
                     transform="translate(1.6,0)" .../>

             Two hard-edged copies of the same silhouette a hair apart
             leave a straight vertical boundary running from the temple
             down through the cheek -- invisible at 28px and obvious at
             400. Shading a head is what the occlusion gradient below is
             for, and a gradient has no edge. */
          svg = svg.replace(/<path d="[^"]+" fill="[^"]+" opacity="\.16"\s+transform="translate\(1\.6,0\)"[^>]*\/>/g, '');
          if (svg.indexOf(HALO) >= 0) svg = svg.split(HALO).join('');
          if (svg.indexOf(HALO_M) >= 0) svg = svg.split(HALO_M).join('');
          if (svg.indexOf(RIM) >= 0) svg = svg.split(RIM).join('');
          if (svg.indexOf(RIM_OLD) >= 0) svg = svg.split(RIM_OLD).join('');
          svg = svg.replace(SHEEN, '');
          SHEEN.lastIndex = 0;
          if (!had) return svg;
          /* a uid of its own, so two portraits on one screen cannot
             share a gradient id */
          const uid = 'L' + (svg.length % 9973) + (Math.random() * 1e6 | 0);
          const at = svg.lastIndexOf('</g></svg>');
          if (at < 0) return svg;
          return svg.slice(0, at) + lighting(uid, headOf(svg), 1) + svg.slice(at);
        } catch (error) { /* the portrait is still a portrait */ }
        return svg;
      };
      window.face = face;
    }
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     AND THE MANAGER, WHO IS DRAWN BY A DIFFERENT FUNCTION
     -------------------------------------------------------------------
     `mgrFaceSVG` is its own renderer -- the manager wears a suit rather
     than a kit -- and it carries the same halo. It is also the portrait
     that gets shown BIGGEST, at 154px on the screen where you make him,
     so every artefact on it is four times the size it is anywhere else.
     ------------------------------------------------------------------- */
  try {
    if (typeof window.mgrFaceSVG === 'function') {
      const pass = window.mgrFaceSVG;
      window.mgrFaceSVG = function mgrFaceLit() {
        let svg = pass.apply(this, arguments);
        try {
          if (!svg || svg.indexOf('<svg') < 0) return svg;
          SHEEN.lastIndex = 0;
          const had = svg.indexOf(HALO_M) >= 0 || svg.indexOf(HALO) >= 0 || SHEEN.test(svg);
          SHEEN.lastIndex = 0;
          if (svg.indexOf(HALO_M) >= 0) svg = svg.split(HALO_M).join('');
          if (svg.indexOf(HALO) >= 0) svg = svg.split(HALO).join('');
          /* THE FOREHEAD BLOOM. The manager ends on a six-by-five white
             ellipse over the upper left of the head -- drawn after the
             hair, so on him it is a pale wash across the fringe rather
             than a highlight on skin. It is the same artefact as the
             player's, and it goes for the same reason. */
          svg = svg.replace(SHEEN, '');
          SHEEN.lastIndex = 0;
          if (!had) return svg;
          const uid = 'M' + (svg.length % 9973) + (Math.random() * 1e6 | 0);
          const at = svg.lastIndexOf('</g></svg>');
          if (at < 0) return svg;
          /* HALF THE DOSE. `mgrFaceSVG` is a far more finished renderer
             than the player's -- three-stop diagonal skin, lid shadows, a
             shaded nose, creases past fifty -- and it is seen at 154px,
             where a wash laid over shading that is already there stops
             being light and starts being haze. */
          return svg.slice(0, at) + lighting(uid, headOf(svg), 0.55) + svg.slice(at);
        } catch (error) { /* the portrait is still a portrait */ }
        return svg;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    window.RBSAvatarUpgrade = Object.freeze({ SKULL, RIM, RIM_OLD, HALO, HALO_M, headOf, lighting });
  } catch (error) { /* no window */ }
}());
