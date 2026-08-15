/* global faceHair:writable, beardInk, face:writable */

/* =====================================================================
   TWO THINGS WRONG WITH THE FACES
   ---------------------------------------------------------------------
   "some of the beard to weird like the strap one looks like it's just
   got like a strap across their face also there's like a bloom in on it
   like a light all over their faces like a circle of one"

   Both are real and both are geometry rather than taste.
   ===================================================================== */

(function facePolish() {
  /* -------------------------------------------------------------------
     1. THE CHINSTRAP WAS A STRAP ACROSS THE FACE
     -------------------------------------------------------------------
     It was drawn as a band — an outer curve down the jaw and an inner
     curve 2.4 units inside it — and then clipped to the jaw silhouette:

         'M5 13 C6.2 19.5, 9 23.4, 13.2 24.6 ... L35 15.4 ... Z'

     The outer half of that band lies OUTSIDE the head, so the clip
     throws it away, and what survives is the inner edge: a stripe
     running across the cheeks with skin on both sides of it. That is
     exactly a strap across the face, and no amount of thinning the band
     fixes it, because the part being kept is the wrong part.

     A chinstrap is not a band you draw. It is what is left of a full
     beard when you shave the middle out of it. So that is how it is
     drawn now: the full beard mass, clipped to the jaw as usual, with
     the same shape inset and painted back in the face's own gradient.
     What remains is a rim that follows the real silhouette, because the
     silhouette is what cut it — narrow at the sideburns, wider under the
     chin, exactly where a chinstrap sits.

     The inner cut is painted with `url(#sh<uid>)`, the gradient the head
     itself is filled with, so the shaved area is the face rather than a
     flat patch of one skin tone sitting on a gradient. */
  const FULL = 'M5 12 C6.5 19, 9.5 22.4, 13.5 23.4 C16 22.6, 18 22.2, 20 22.2 '
    + 'C22 22.2, 24 22.6, 26.5 23.4 C30.5 22.4, 33.5 19, 35 12 L35 36 L5 36 Z';

  /* WHICH EDGE THE RIM HAS TO FOLLOW, and the first attempt got it wrong.
     Insetting FULL leaves a rim on every side of FULL — including its
     top edge, which is not a jawline at all: it runs high at the
     sideburns and dips to y=22.2 in the middle, just under the nose. So
     the "chinstrap" came out with a bar across the upper lip that read
     as a moustache. Visible immediately on all five test faces.

     The line a chinstrap follows is the head's own outline, so the cut
     is the head's own outline — the same path the jaw clip is built
     from, scaled to 0.78 about the middle of the face. Whatever is left
     is a band of even width against the silhouette: about two units at
     the cheek, wider under the chin where the head narrows, which is
     where a chinstrap is wider. */
  const JAW = 'M20 2.9c-5.8 0-9.1 3.9-9.1 10.2 0 5.3.8 9.3 2.4 12.3 1.6 3 3.9 4.6 6.7 4.6'
    + 's5.1-1.6 6.7-4.6c1.6-3 2.4-7 2.4-12.3 0-6.3-3.3-10.2-9.1-10.2z';
  const INSET = 'translate(20,17) scale(0.78) translate(-20,-17)';

  if (typeof faceHair === 'function') {
    const previous = faceHair;
    faceHair = function faceHairRealChinstrap(kind, H, S, uid) {
      if (kind !== 'chinstrap') return previous.apply(this, arguments);
      try {
        const ink = beardInk(H, S);
        const clip = ' clip-path="url(#jw' + uid + ')"';
        /* Two paths and no third. An earlier cut added a faint copy of
           the shaved area in beard ink, half a unit high, meaning to
           soften the join; what it actually did was lay a wash back over
           the cheeks that rendered as a diagonal streak across the face.
           A shaved jaw is shaved. */
        return '<path d="' + FULL + '" fill="' + ink + '" opacity=".82"' + clip + '/>'
          + '<path d="' + JAW + '" fill="url(#sh' + uid + ')"'
          + ' transform="' + INSET + '"' + clip + '/>';
      } catch (error) {
        return previous.apply(this, arguments);
      }
    };
  }

  /* -------------------------------------------------------------------
     2. THE LIGHT SITTING ON EVERY FACE
     -------------------------------------------------------------------
     Meant as a rim light — the brightness down the side a room is lit
     from. What was drawn was not a rim:

         <ellipse cx="10.4" cy="12.5" rx="6.2" ry="10" fill="#fff" opacity=".085"/>

     The head runs from about x=10.9 to x=29.1, so that ellipse spans
     4.2 to 16.6 and, once clipped, leaves a white oval nearly six units
     wide lying across the cheek and temple — a quarter of the width of
     the face. At a small size the shape of it is lost and all that is
     left is a soft circle of light in the middle of the face, which is
     what he is seeing.

     A rim light hugs the edge. Pushing the centre outward and narrowing
     it leaves a crescent of about two units against the silhouette,
     which reads as light catching the side of a head rather than as a
     bloom laid over it. The right-hand one was already close to the
     edge; it only needed softening to match.

     Done by rewriting the finished SVG rather than the layer that
     produces it, because that layer is one of seven that draw a face and
     the string is unique to the one that got it wrong. */
  const OLD_RIM = '<ellipse cx="10.4" cy="12.5" rx="6.2" ry="10" fill="#ffffff" opacity=".085"/>'
    + '<ellipse cx="30.6" cy="20" rx="4.4" ry="9" fill="#ffffff" opacity=".05"/>';
  const NEW_RIM = '<ellipse cx="9.1" cy="14" rx="3.5" ry="10.5" fill="#ffffff" opacity=".10"/>'
    + '<ellipse cx="31.4" cy="19" rx="3.1" ry="8.5" fill="#ffffff" opacity=".045"/>';

  /* the same overdone highlight on the hair: twelve units across the top
     of the head at .06, which is the second circle he can see */
  const OLD_SHEEN = '<ellipse cx="15.5" cy="10.5" rx="6" ry="5" fill="#fff" opacity=".06"/>';
  const NEW_SHEEN = '<ellipse cx="15.2" cy="9.4" rx="4.6" ry="3.1" fill="#fff" opacity=".05"/>';

  if (typeof face === 'function') {
    const previous = face;
    face = function faceSofterLight() {
      let svg = previous.apply(this, arguments);
      try {
        if (!svg || svg.indexOf('<svg') < 0) return svg;
        if (svg.indexOf(OLD_RIM) >= 0) svg = svg.split(OLD_RIM).join(NEW_RIM);
        if (svg.indexOf(OLD_SHEEN) >= 0) svg = svg.split(OLD_SHEEN).join(NEW_SHEEN);
      } catch (error) { /* the portrait is still a portrait */ }
      return svg;
    };
  }

  try {
    window.RBSFacePolish = Object.freeze({ FULL, JAW, INSET, OLD_RIM, NEW_RIM, OLD_SHEEN, NEW_SHEEN });
  } catch (error) { /* no window */ }
}());
