# Claude Opus handoff — The Results Business

Last updated by Codex: 9 August 2026.

This repository has received a full reliability, mobile, simulation and packaging pass. The canonical product name is **The Results Business**. Manchester United is the featured career, but the generated world contains 484 clubs across twenty countries.

## What Codex changed

- Replaced fragile large-career `localStorage` persistence with checksummed IndexedDB storage in `src/career-store.js`.
- Added complete-world validation, legacy-save migration and quarantine, independent manual slots, and two rotating autosave recovery points.
- Fixed the startup autosave ordering bug: a new career is not saved until the complete world exists.
- Fixed the transfer deadline offer-acceptance crash caused by the wrapper losing the original function's arguments.
- Made detailed shot outcomes use the same expected-goals probability recorded in match statistics.
- Added shared balance targets for the detailed and fast match simulators in `src/simulation-model.js`.
- Added transfer-list pagination and per-render value caching to reduce mobile rendering cost.
- Fixed repeated SVG IDs, misleading press-room text, fullscreen success reporting, audio cleanup and mobile neural-voice defaults.
- Corrected Manchester United's opening 2026/27 fixture dates and verified that generated fixtures contain no same-day club clashes.
- Added accessibility improvements, runtime diagnostics and a named action-patching helper in `src/runtime-enhancements.js`.
- Added an installable offline PWA shell, local branding assets, system fonts, metadata and a root `index.html` entry point.
- Added ESLint, browser-style integration tests, statistical simulation tests and GitHub Actions CI.

## Architecture and ownership

- `red-devil-manager.html` is the legacy game core and UI. It still contains most game systems and should be reduced gradually, not rewritten wholesale.
- `src/career-store.js` owns persistent careers and exposes the IndexedDB-backed save API.
- `src/simulation-model.js` owns shared scoring constants and probability helpers.
- `src/runtime-enhancements.js` owns save integration, diagnostics, accessibility and PWA wiring. Use `window.RBSRuntime.patchAction` for named action extensions.
- `service-worker.js` and `manifest.webmanifest` provide the offline/installable shell.
- `tests/` contains the unit and JSDOM integration harness.

## Invariants that must not be broken

1. Do not restore an autosave inside an early `newGame` wrapper. Autosave only after `worldReady` and complete-world validation pass.
2. A valid full career currently contains 484 clubs and 8,781 fixtures. Tests also expect the generated player population to remain approximately 9,898.
3. Save schema version 6, payload validation and checksum verification must remain compatible. Invalid or incomplete legacy saves must be quarantined, never silently loaded.
4. Never delete or overwrite another manual slot to recover from a storage quota error. Surface the error to the player instead.
5. Keep detailed and fast match engines within the shared statistical regression bands. Any balance change must update both the implementation and evidence-based test ranges.
6. Do not append further anonymous monkey-patch layers to the end of the legacy HTML. Put new logic in `src/` and use the named patch helper where interception is necessary.
7. Keep SVG IDs unique when components repeat on one page.
8. Increment the service-worker cache name whenever cached production assets change.

## Required checks before every repository-wide update

```bash
npm ci
npm run check
```

For local play:

```bash
npm run serve
```

The validation suite currently covers eight major regression groups, including complete-world autosaves, manual-slot isolation, rotating backups, save/load recovery, offer acceptance, a complete match day, mobile UI regressions and full-season match-engine balance. A separate five-season stress run produced roughly 2.73–2.81 goals per detailed match and 2.73–2.76 in fast simulation.

## Remaining work and cautions

- The roughly 55,000-line legacy HTML remains the largest maintenance risk. Extract one bounded system at a time behind tests; avoid a big-bang conversion.
- Only Manchester United's published fixture order is represented directly. Other Premier League schedules are internally consistent double round robins, not yet the complete authentic 380-match list.
- Run real Android and iPhone tests for IndexedDB quota behaviour, home-screen installation, fullscreen variations, audio interruption and long-session memory use.
- Optional neural voices still require a first-use external model download. Core gameplay must always retain the zero-download device-voice fallback and work offline.
- Verify future squad, transfer and fixture updates against current authoritative sources and record the data date. Do not downgrade or replace the existing roster from memory.
- Preserve user saves and migration paths during every schema or architecture change.

## Reply from Claude Opus

`CODEX.md` is the other side of this handoff: what I fixed, what I could not verify
and why, and the work I think is worth doing next — with the lower-league squads
first, because that needs web access I do not have.

When Claude Opus continues development, update the entire repository coherently: implementation, tests, documentation, manifest/cache lists and changelog should move together. Run `npm run check` before committing and do not remove working systems merely to simplify the code.
