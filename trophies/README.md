# Trophy assets

3D trophy models, one per competition and award. Drop files in here using the
exact names below and the game picks them up — no code change needed.

---

## Read this before you model anything

Two constraints, and they change what you should export.

**1. Three.js is not currently in the game.** `HAS3D` tests `typeof THREE` and
nothing ever defines it, so the 3D match engine already written in there is dead
code. Nothing renders a `.glb` today. Bundling Three.js is very doable — it adds
roughly 600 KB to the file and would light up the 3D match view as well — but it
is a real decision and it is yours. Say the word and I will do it.

**2. So export a PNG as well as the model.** A `.png` loads through an `<img>`
tag, and unlike `fetch` that works from `file://` — meaning a PNG trophy shows up
even when someone has downloaded the HTML and opened it offline. It costs you one
extra click in your exporter and it means your work is visible in the game
immediately, today, with no dependency on the decision above.

The game looks for them in this order, per trophy, and takes the first it finds:

| | Needs | Works offline |
|---|---|---|
| `trophy-PL.glb` | Three.js bundled or online | only if bundled |
| `trophy-PL.png` | nothing | **yes** |
| existing 2D art | nothing | yes |

Upload just the PNGs and everything works now. Add the `.glb` files alongside and
they take over the moment Three.js is in.

### PNG export settings

- **512×512**, transparent background
- Trophy centred, filling most of the frame with a little air around it
- Rendered on the dark background the game uses, or transparent — not white
- Under 200 KB each

---

## Why `.glb` alone is not enough

Three.js loads `.glb` through `fetch`/XHR, and **`fetch` refuses the `file://`
scheme**. A model in this folder therefore loads when the game is served over
http — GitHub Pages, a local server — and fails silently when someone
double-clicks the HTML on their desktop. I hit exactly this with the audio pack;
it is not a guess. That is the whole reason for the PNG above.

---

## File format

- **`.glb`** (binary glTF). Self-contained — geometry, materials and textures in
  one file. Export from Three.js with `GLTFExporter`, `binary: true`.
- **Not** `.gltf` + separate `.bin` + separate textures. Those are extra
  requests, and every one of them is another thing to fail.

## Conventions

Get these right and every trophy sits correctly with no per-model tweaking.

| | |
|---|---|
| **Up axis** | +Y |
| **Facing** | +Z toward the camera |
| **Pivot** | Base of the trophy at the origin, centred on X and Z — so it stands on `y = 0` rather than floating or sinking |
| **Height** | Normalise to **1.0 unit tall**. The game scales per context; a consistent height means a World Cup and a League Cup sit sensibly next to each other |
| **Polys** | Aim under 40k triangles. These render on phones |
| **Textures** | 1024×1024 max, and only if the material needs one. Metal usually does not — roughness/metalness values look better and cost nothing |
| **Materials** | PBR (`MeshStandardMaterial`). The game lights the scene; do not bake in your own lighting |
| **File size** | Under 2 MB each. Under 500 KB is better |

A quick sanity check before uploading: load the `.glb` on
<https://gltf-viewer.donmccurdy.com/> — if it stands upright, centred, and about
as tall as the grid square, it will be right in the game.

---

## Filenames

`trophy-<CODE>.glb` and/or `trophy-<CODE>.png`, lowercase `trophy-`, uppercase code. The codes are the
game's own internal keys, so they map straight through with no lookup table.

### Domestic cups

| File | Competition |
|---|---|
| `trophy-FA.glb` | FA Cup |
| `trophy-LC.glb` | League Cup |

### European

| File | Competition |
|---|---|
| `trophy-CL.glb` | Champions League |
| `trophy-EL.glb` | Europa League |
| `trophy-EC.glb` | Conference League |

### League titles

| File | Competition |
|---|---|
| `trophy-PL.glb` | Premier League |
| `trophy-CH.glb` | Championship |
| `trophy-L1.glb` | League One |
| `trophy-L2.glb` | League Two |
| `trophy-NL.glb` | National League |
| `trophy-ESP.glb` | La Liga |
| `trophy-ITA.glb` | Serie A |
| `trophy-GER.glb` | Bundesliga |
| `trophy-FRA.glb` | Ligue 1 |
| `trophy-POR.glb` | Primeira Liga |
| `trophy-NED.glb` | Eredivisie |
| `trophy-SCO.glb` | Scottish Premiership |

Also valid if you get to them: `BEL`, `TUR`, `AUT`, `SUI`, `GRE`, `CZE`, `DEN`,
`NOR`, `POL`, `SRB`, `UKR`, `CRO`.

### International

| File | Competition |
|---|---|
| `trophy-WC.glb` | World Cup |
| `trophy-EURO.glb` | European Championship |

### Individual awards

These use the award keys the game already records each season, so a winner's
trophy can be shown on their player card.

| File | Award |
|---|---|
| `trophy-ballon.glb` | Ballon d'Or — the golden ball |
| `trophy-poty.glb` | Player of the Season |
| `trophy-young.glb` | Young Player of the Season |
| `trophy-boot.glb` | Golden Boot — top scorer |
| `trophy-glove.glb` | Golden Glove — goalkeeper |
| `trophy-playmaker.glb` | Playmaker — most assists |
| `trophy-mgr.glb` | Manager of the Season |

---

## What happens when you add one

Nothing needs wiring per trophy. The game already knows who won what:

- **Competitions** — `G.cupHistory` and the season history record every winner,
  so a trophy appears in your cabinet the season you lift it.
- **Awards** — the end-of-season awards already pick a `ballon`, `poty`,
  `young`, `boot`, `playmaker`, `glove` and `mgr` every year.

Add `trophy-PL.glb` and the Premier League trophy shows up for whoever won it.
Add none and everything carries on as it does today.

## Partial sets are fine

You do not have to finish them all before any of them are useful. A missing file
falls back to the current 2D art for that competition only. Upload the Premier
League one on its own and it will be the only 3D trophy in the game — that is a
supported state, not a broken one.
