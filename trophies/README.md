# Trophies

**The trophies are code, not files.** There is nothing in this folder to
upload — each trophy is a function that builds a `THREE.Group`, exactly the way
your Premier League trophy does it. That is a better answer than an asset
pipeline: nothing to download, nothing to 404, no format guessing, and the only
dependency left is Three.js itself.

The builders live in `red-devil-manager.html` in the `w70_trophymodels` layer,
in a registry called `TB`, keyed by competition code. The room they stand in is
the `w71_trophyhall` layer.

## The hall

A rotunda. Every competition gets its own plinth — dark wood, stone cap,
engraved brass plaque, glass case — arranged on a horseshoe with your club
crest on the wall behind it. You are inside the room, not looking at a
diorama: drag to look, walk with `W A S D` / the arrow keys / the on-screen
pad, and tap a case to walk up to it and read what it is and which seasons you
won it in.

Two rules the room is built around:

**Every trophy is always there.** One you have never won still stands on its
plinth, in the gloom, with `NOT YET WON` on the plaque. Seeing what is missing
is most of the point.

**They are at their real heights against each other.** `TROPHY_CM` holds the
actual measurements — Champions League 74cm, World Cup 37cm, Ballon d'Or 31cm —
and each is scaled to its true size in metres. Nothing is normalised to a
common height, because normalising is what made the first version useless: a
World Cup the same size as a European Cup tells you nothing.

Winning something pushes onto `G.honours`, `render()` notices the list has
grown, and you get the option to walk straight in and see it on its plinth with
the season on the plaque.

## What is sculpted

| Code | Trophy |
|---|---|
| `PL` | Premier League — yours, ported |
| `FA` | FA Cup — lidded bowl, scrolled handles, finial |
| `LC` | League Cup — three handles, fluted bowl |
| `CL` | Champions Cup — the big ears |
| `EL` | Europa — fluted amphora |
| `EC` | Conference — faceted spire |
| `WC` | World Cup — malachite base, spiralling figures, the globe |
| `EURO` | Henri Delaunay — heavy plinth, long slender bowl |
| `boot` | Golden Boot — sole, upper, tongue, laces, studs |
| `ballon` | Ballon d'Or — panelled gold ball |
| `young` / `poty` | Rising star |
| `glove` | Golden Glove — curled fingers, padded palm, strapped cuff |
| `playmaker` | Playmaker — a panelled ball in a swept crescent |
| `mgr` | Manager of the Season — tactics board |
| `ESP` `ITA` `GER` `FRA` `CH` `L1` `L2` `NL` | one shared league cup, tinted per competition |

## Adding another

```js
TB.XYZ = function(){
  const M = tMaterials(), g = new THREE.Group();
  g.add(tLathe([[4,0],[4,1],[3,2]], M.silver));   // profile → lathe
  return g;                                        // base at y=0
};
```

Then give it a real height in `TROPHY_CM` and a place in `HALL_ORDER`, and it
gets a plinth.

Helpers available: `tLathe(points, material, segments)`, `tCap(r, len, mat)` (r128
has no `CapsuleGeometry`), `tCanvas(w, h, draw)` for procedural textures,
`tEngraveBand(lines)` for engraved plinths, `tMaterials()` for the shared
silver / gold / crystal / malachite / wood set.

Conventions: build base at `y = 0`, roughly 20 units tall, and **do not add
lights** — the room supplies them. The hall rescales to `TROPHY_CM`, so the
units you build in do not matter; only the real measurement does.

## Getting in

The room is a tab in the **club area** — *The club → 🏆 Trophy room*. It was
reachable only from an honours view that nothing linked to, which meant a room
built to be walked around was in practice unreachable.

## Three.js

Vendored at `vendor/three.min.js` (r128), loaded from a relative path, so the
room works **offline as well as online**. A classic `<script src>` does not care
about the `file://` scheme the way `fetch` does. If the vendor file is missing
the room falls back to the CDN, and if that is unreachable it says so and closes
cleanly — the rest of the game is unaffected either way.

## Two things that are not optional

**The studio environment.** Polished metal with `metalness: 1, roughness: 0.04`
is a mirror, and a mirror with nothing to reflect renders **black**. Lights
alone will not fix it. The room builds a procedural environment through
`PMREMGenerator` — two softboxes, an overhead strip, a floor bounce — which is
what makes the silver read as silver. Everything came out black on the first
render until that went in.

**The room stays dark.** The first hall had an ambient light at `.5` and a
directional at `.35` on top of six sconces, and it came out evenly lit like an
office — the trophies had nothing to stand out against. Ambient is `.10` now
and each plinth carries its own spot: bright and warm if you have won it, dim
and cold if you have not.

## Triangle budget

396,000 across all 23 sculpts; a full hall of 22 draws about 380,000 with the
room on top. `tLathe` runs at 48 segments against a 40-point spline — 72 × 64
looked identical and cost 58% more, which is a bad trade for something a phone
has to draw.
