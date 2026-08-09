# Changelog

## Unreleased

### Fixed

- Prevented the first autosave from capturing the incomplete 84-club world.
- Replaced silent save-slot eviction with validated IndexedDB careers and rotating autosave recovery points.
- Fixed incoming transfer acceptance crashing because an arrow function referenced `arguments`.
- Made detailed shot conversion probabilistic and driven by the same xG value displayed by the match engine.
- Corrected the first broadcast-confirmed Manchester United fixture changes: Ipswich, Everton and Manchester City.
- Corrected press-conference copy before the manager has entered the room.
- Made fullscreen feedback reflect actual API success or failure.
- Prevented repeated player and club SVG gradient IDs.
- Restored crowd audio after neural-voice interruption and bounded its decoded-audio cache by memory.
- Gave the Continue dock its side gutter back. An earlier rule set 12px of padding
  as `.continue-dock`, which loses to `#app>.continue-dock{padding:14px 0 6px}`, so
  the buttons ran flush into both edges of the screen.
- Warned the player when the upgraded career store did not load. The HTML now
  pulls three scripts from `src/`; a copy of the file on its own falls back to the
  ~5 MB `localStorage` path silently, which is the failure the store was built to
  fix. It now says so on the save screen and once per session.
- Fixed the instant-simulation integration test, which slept a fixed 120 ms for a
  path that takes about 300 ms in a real browser and 1.5 s under JSDOM. Tests now
  wait on the condition through a shared `waitFor` harness helper.
- Kept date-only fixtures on their intended calendar day in timezones west of UTC.
  They previously rendered one day early because UTC midnight was formatted in the
  device timezone.

### Improved

- Faded the edges of the nine horizontally scrollable tab and chip rows so it is
  visible that they continue. They were slicing words in half against the screen
  edge — 446px of the tactics row was hidden with no cue at all. The fade is sized
  to how much is actually off-screen on each side, so it never overstates it. The
  rescan is driven by a debounced observer on the document rather than by the main
  render, so rows drawn by the front screen, a modal or the match screen are covered
  too.
- Added transfer-market pagination and per-render fee/wage caching.
- Added static branding and social metadata for The Results Business.
- Added an installable PWA shell and offline caching for core game assets.
- Added keyboard focus, semantic labels, zoom support and reduced-motion handling.
- Added bounded runtime diagnostics, modular save/simulation code, automated tests and GitHub Actions.
- Replaced generated first-team identities across League One, League Two and the
  National League with a sourced 9 August 2026 snapshot. Championship membership
  is refreshed with it so promotion and relegation remain consistent, while the
  existing squad shape, ratings, contracts and economy remain game-balanced.
- Added a validated ESPN roster updater and cached its generated data in the PWA.
