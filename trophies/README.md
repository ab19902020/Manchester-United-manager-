# Trophies

**The trophies are code, not files.** There is nothing in this folder to upload — each trophy is a
function that builds a `THREE.Group`, so there is nothing to download, nothing to 404 and no format to
guess.

**They are original designs.** Every competition in the game is invented, so its silverware is too: none
of these is modelled on a real trophy. `src/original-trophies.js` builds each cup from one small
parametric builder — a foot, a turned profile, a rim, then whichever of handles, lid, finial and ribbons
the design calls for — and registers it in `TB`, the builder registry in `index.html`, keyed by
competition code. The individual awards (boot, glove, playmaker, young player, manager) and the lower
division cups are built in `index.html` beside the hall.

## The hall

A rotunda. Every competition gets its own plinth — dark wood, stone cap, engraved brass plaque, glass
case — arranged on a horseshoe with your club crest on the wall behind it. Drag to look, walk with
`W A S D` / the arrow keys / the on-screen pad, and tap a case to walk up to it and read which seasons
you won it in.

**Every trophy is always there.** One you have never won still stands on its plinth with `NOT YET WON`
on the plaque. Seeing what is missing is most of the point.

**They are different sizes.** `TROPHY_CM` gives each a height and nothing is normalised to a common
one, so the big cups look big.

## Adding one

Add a builder to `TB` under the competition's code, a height to `TROPHY_CM`, a label to `TROPHY_LABEL`
and a line to `TROPHY_INSCRIPTION`. Design it; do not copy one.
