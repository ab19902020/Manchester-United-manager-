# The Results Business

The Results Business is a mobile-first football management career covering 484 clubs across twenty countries. Manchester United remains the featured career, with its 2026/27 squad and fixture schedule, but every playable club uses the same full management systems.

## Play locally

The game must be served from a web address so browser storage, the service worker and optional neural voices work correctly.

```bash
npm install
npm run serve
```

Open `http://localhost:4173`. On Android or iPhone, use the browser’s **Add to Home Screen** command for the standalone version. The core game is cached for offline play after the first successful visit.

## Development checks

```bash
npm run check
```

The automated suite covers:

- complete-world validation for new autosaves;
- IndexedDB manual slots and rotating recovery autosaves;
- save/load round trips and transfer-offer acceptance;
- sourced 2026/27 English fixture dates, pairings and season-two handoff;
- sourced League One, League Two and National League squad identities and shape;
- press-conference, fullscreen, SVG-ID and transfer-pagination regressions;
- full-season statistical bands for both match simulators.

GitHub Actions runs the same checks on every pull request.

## Project layout

- `red-devil-manager.html` — the legacy game core and UI.
- `src/career-store.js` — validated, checksummed IndexedDB career storage.
- `src/simulation-model.js` — shared scoring probabilities and balance targets.
- `src/lower-league-data.js` — generated English-pyramid team and roster snapshot.
- `src/lower-league-squads.js` — maps factual identities onto the game-balanced squad slots.
- `src/authentic-fixture-data.js` — generated snapshot of published 2026/27 fixture lists.
- `src/authentic-fixtures.js` — applies sourced dates to season one without moving them for cups.
- `src/runtime-enhancements.js` — save integration, diagnostics, accessibility and PWA wiring.
- `service-worker.js` and `manifest.webmanifest` — installable offline shell.
- `tests/` — unit and browser-style integration tests.

Two agents work on this repository and coordinate through two files, each with a
single writer so they never conflict. `CODEX.md` is Claude's brief to Codex — what
to do next and why. `CLAUDE.md` is Codex's report back — what was done, what was
checked and how, and what was found but not fixed. Codex owns real-world data,
tests and audits; Claude owns the game code, the feel and the priority.

New systems should be added to `src/` rather than appended as another anonymous wrapper in the legacy file. `runtime-enhancements.js` provides one named action-patching helper and a bounded diagnostic log through `window.RBSDiagnostics`.

## Saves

Careers are stored in IndexedDB rather than the approximately 5 MB `localStorage` allowance. Each payload is validated against the complete world, checksummed, and given a separate lightweight metadata record. Manual slots never delete another career. Autosave keeps two spaced recovery points.

Older valid `rdm2627` browser saves are migrated automatically. An incomplete legacy save is quarantined rather than loaded into the game.

## Data notes

The game currently carries 6,292 published fixtures across 17 divisions: all
2,588 in the five modeled English divisions; every match in La Liga, Serie A,
Bundesliga, Ligue 1, Primeira Liga and Eredivisie; and the complete modeled
regular seasons for Serie B, 2. Bundesliga, Ligue 2, Süper Lig, Super League
Greece and the Czech First League. The snapshot was read on 9 August 2026 from
ESPN and the official Chance Liga schedule. Exact source URLs and event IDs are
recorded in `src/authentic-fixture-data.js`; run the fixture updater with
`--tier=england`, `--tier=major` or `--tier=rest` to validate and refresh a tier.
The same data updates affected memberships before a career is built; it reuses
existing club slots, ratings and finances rather than inventing new ones.

Sourced dates apply only to 2026/27. From season two, the game returns to its
generated calendar because no future list has been published. Generated cup ties
move around a sourced league date, never the other way round.

Championship, League One, League Two and National League membership and first-team identities are an ESPN roster snapshot read on 9 August 2026: [Championship](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams?limit=100), [League One](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.3/teams?limit=100), [League Two](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.4/teams?limit=100) and [National League](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.5/teams?limit=100). Every team’s exact roster URL and source timestamp are recorded in `src/lower-league-data.js`. Run `npm run data:lower-leagues` to validate all four 24-team divisions and refresh that generated snapshot.

The integration deliberately keeps the game’s 19-player slot shape, positions, ratings and contract lengths. It replaces identities, sourced ages and available shirt numbers; where ESPN omits an age or shirt number, the balanced slot value is retained rather than guessed. Updating the Championship alongside the requested 72 lower-league clubs is necessary because promotion and relegation move clubs across that boundary.

British neural voices are optional. Their first use requires a 36–326 MB download; coarse-pointer and lower-memory devices default to the 36 MB model. Device voices remain the zero-download fallback.
