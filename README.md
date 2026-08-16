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
npm run sweep
```

`npm run sweep` drives a real career through every screen in both orientations and
reports three kinds of layout fault: anything reaching past the side of the view,
two boxes drawn through each other, and a box shorter than the contents inside it.
The third exists because the first version of the sweep counted only overlaps and
therefore passed a change that collapsed every card on the tactics screen — two
squashed boxes side by side do not intersect.

The automated suite covers:

- complete-world validation for new autosaves;
- IndexedDB manual slots and rotating recovery autosaves;
- save/load round trips and transfer-offer acceptance;
- sourced 2026/27 English fixture dates, pairings and season-two handoff;
- sourced English squad identities, nationality, birth date and physical facts;
- press-conference, fullscreen, SVG-ID and transfer-pagination regressions;
- Dugout 3D camera, accelerated analytics timeline, WebGL fallback and live-render integration;
- goalkeeper Man of the Match frequency across all five English divisions;
- full-season statistical bands for both match simulators.

GitHub Actions runs the same checks on every pull request.

## Project layout

- `red-devil-manager.html` — the legacy game core and UI.
- `src/career-store.js` — validated, checksummed IndexedDB career storage.
- `src/simulation-model.js` — shared scoring probabilities and balance targets.
- `src/lower-league-data.js` — generated five-division English roster and player-facts snapshot.
- `src/lower-league-squads.js` — maps factual identities and biographies onto game-balanced slots.
- `src/authentic-fixture-data.js` — generated snapshot of published 2026/27 fixture lists.
- `src/authentic-fixtures.js` — applies sourced dates to season one without moving them for cups.
- `src/runtime-enhancements.js` — save integration, diagnostics, accessibility and PWA wiring.
- `src/match-ratings.js` — diminishing goalkeeper save rewards and rating-distribution guardrails.
- `src/dugout-3d.js` — the Three.js stadium broadcast and accelerated analytics-to-animation timeline.
- `src/dugout-renderer.js` — the tested perspective 2D fallback for browsers without WebGL.
- `src/cup-calendar.js` — keeps a cup tie off a date that has already gone past, and rescues any that are.
- `src/trophy-room.js` — the season's campaign board on the Trophies tab, and what stands in the empty room.
- `src/world-seed.js` — world generation behind one 32-bit seed, so the same number gives back the same world.
- `src/layout-repair.js` — measured fixes to the landscape shell, the tactics pitch and the way into training.
- `src/mailbox-pro.js` — delete, ignore and important, a landscape sheet that fits, and a shelf life for the home-screen card.
- `src/press-questions.js` — twenty-six more press topics, weighted toward the ordinary week.
- `src/press-voice.js` — British male voice selection, and a pool that cannot fall back to a woman.
- `src/transfer-structure.js` — the manager's choice of how a fee is paid, and what a selling club charges to wait.
- `src/crazygames.js` — the CrazyGames SDK adapter: feature-detected, gzipped cloud saves,
  and an honest refusal when a save is over the platform's 1 MB cap.
- `src/keep-history.js` — stops a save discarding the match logs of 460 clubs and the
  scorers of every match you were not in.
- `src/transfer-search.js` — free agents in the market search, a contract filter, and the
  search above the money rather than below it.
- `src/tactics-token.js` — fitness as the ring on the shirt and form as a pill on it,
  so the name and position under it are a fixed two lines that cannot overlap the next row.
- `src/name-clash.js` — stops a generated player being given a real player's name.
- `src/story.js` — the local journalist, his monthly column and the moments the
  save already knew about; reads game state and writes nothing the engine reads back.
- `src/analytics.js` — the statistics centre: every player and club in any division,
  sortable, plus the per-match rating log and form graph for your own squad.
- `src/delegation.js` — the jobs you hand to your assistant, and what his star rating costs you.
- `src/face-polish.js` — the chinstrap drawn as a shaved-out beard, and the rim light pulled off the middle of the face.
- `service-worker.js` and `manifest.webmanifest` — installable offline shell.
- `scripts/sweep-screens.cjs` — walks every screen in both orientations looking for spill, overlap and squashed boxes.
- `tests/` — unit and browser-style integration tests.

Three agents work on this repository with separate handoffs and ownership. Claude
directs the work, setting Codex's through `CODEX.md` and Agent One's through
`AGENT-ONE-TASKS.md`; Codex reports data, test and audit work in `CLAUDE.md`;
Agent One reports the economy, contracts, morale, transfer-market, inbox and
underlying-rules work in `AGENT-ONE.md`. Each file has exactly one writer, so a
handoff is never a merge conflict. Read the handoffs before changing an owned
system so one agent does not overwrite another's work.

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

All 116 modeled English clubs use an ESPN roster and player-biography snapshot
read on 13 August 2026: [Premier League](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams?limit=100), [Championship](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams?limit=100), [League One](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.3/teams?limit=100), [League Two](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.4/teams?limit=100) and [National League](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.5/teams?limit=100).
The schema 3 snapshot records 3,238 unique roster players and four verified
same-club detail records with the nationality, date of birth, height and weight
ESPN publishes. Twelve IDs returned on more than one team roster are resolved by
the athlete-detail team before the data is accepted; an ambiguous owner now fails
the updater instead of entering the game twice. Each decision retains its roster
and detail URLs and read date. Run `npm run data:player-facts` to validate and
refresh it.

The integration keeps positions, ratings, potential, contracts and the economy
game-balanced. Lower-division slots retain their shape while sourced identities and
facts replace generated ones; stale or generated Premier League names are replaced
by unused players from that club's published roster. Matching never borrows an
identity from another club, and a missing source field remains missing rather than
being inherited from the player who previously occupied the slot or being guessed.

British neural voices are optional. Their first use requires a 36–326 MB download; coarse-pointer and lower-memory devices default to the 36 MB model. Device voices remain the zero-download fallback.
