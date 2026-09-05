> **Agent One: your work order is `AGENT-ONE-TASKS.md`.** Priority one is the
> CrazyGames 1 MB save limit, which blocks the release; the measuring is done for
> you. This note is here because this file is loaded automatically for anyone
> working in the repository, and it is the one place a pointer is certain to be
> read. The rest of this file is Codex's report and is not addressed to you.
>
> **The game file is now `index.html`.** It was `red-devil-manager.html`, and
> everything below this note was written while it still was — the reports are
> accurate about the past and have been left alone. CrazyGames loads `index.html`
> and nothing else, so the game is that file rather than a redirect pointing at
> it. `red-devil-manager.html` is now a one-kilobyte shim redirecting the other
> way, so old bookmarks and installs still open. Edit `index.html`.
> — Claude, 16 August 2026
>
> ---
>
> **THE ONE RULE THE GAME IS BUILT ON: NOTHING IS SCRIPTED.**
>
> > "we are not making a game where it scripts out the [results]. A player's
> > input into signings and keeping players fit and their morale up — that
> > will have an input on how well they do. If they have a squad which has all
> > the best players, but their morale's low and their older players are
> > injured, it will make their team have a negative consequence. Obviously,
> > if you had the best player in the world in your team, you'll have a better
> > chance of winning. So not scripted. When people start their own non-league
> > team, it's a game you play and you have your own outcome. But every team
> > around you has to perform correctly, in the whole game."
> > — the user, 25 August 2026
>
> The causal direction is fixed and runs one way only:
>
> > what the manager does — who he signs, who he plays, how fit and how happy
> > they are — decides how good the side is, which decides the result.
>
> It never runs the other way. Nothing may pick a result and work backwards to
> it: not for the player's club, not for the ninety-odd other clubs, not to hit
> a league table that looks right, and not to make a number in a measurement rig
> land on its real-world target. A season that comes out wrong is evidence that
> the squad model or the match model is wrong, and the fix belongs there.
>
> **What this forbids in practice.** A "the champion should finish on 87" nudge.
> A hidden hand that keeps a rival close. Deciding a scoreline and then dressing
> it in football — which is exactly the fault that retired the live Dugout, and
> why the highlights are built from a match that has already been played rather
> than performed alongside one.
>
> **What it does not forbid.** Calibration that changes how often something
> happens WITHOUT knowing who it happens to: the goal-rate controller trims every
> side alike to hold a division near its real goals-a-game, and it cannot see the
> league table, who is playing, or who is winning. That is a dial on the physics,
> not a thumb on the scale. The line is whether the mechanism knows the identity
> or the standing of the club it is acting on. If it does, it is scripting.
>
> **This binds the open work.** The draw rate is 28% against a real 24%, and the
> tempting fix — reach in and turn some draws into wins — is precisely what this
> rule forbids. `CHANGELOG.md` carries the measurements: forty settings tried,
> the fault located in the goalless games, and a real fix identified as a change
> to how chances are generated. That is the honest route and the only one open.
> — Claude, 25 August 2026

# Codex report to Claude

## Current as of

Worked from remote main `2209bec96b12477da8ae68a0d29a23dbcce4e97b`, Claude’s
latest September 2 build. Re-fetched main during final review: unchanged. The user
explicitly asked for a major visual, avatar and management-quality upgrade and
requested publication directly to main. Current code replaces no match simulator.

## Done

Implementation: the changeset accompanying this report, requested for main by the user.

- New `src/player-portraits.js`: one studio illustration renderer, natural eye and
  mouth proportions, individual features, age detail and current club kits. Uses
  existing appearance descriptions; no photographs or appearance dataset added.
  Each portrait is an isolated SVG image with a 192-entry LRU cache. Gradient IDs
  cannot collide across players and each avatar adds one DOM element.
- New `src/manager-experience.js`: consistent page headings, player/club/screen
  search, Ctrl/Cmd + K, a searchable management handbook with working shortcuts,
  tactical-plan feedback and profile readiness explanations. All readings come
  from current game state; unscouted attributes remain hidden.
- New `src/match-preparation.js`: actual XI condition, sharpness, morale, selection
  concerns with direct replacement actions, and a 14-day league/cup workload.
- New `src/player-comparison.js`: compare a player with the managed squad at his
  position using the same effective rating, true potential and real attributes.
- Selection rejects unavailable/outside-squad players, validates identity and the
  goalkeeper slot, swaps starters, maintains the named bench, and closes the
  replacement picker after a successful choice.
- Cup reports follow `nextUserMatch`; transfer/free-agent potential filters and
  sorting follow `potOf`; contract filters reset pagination; the dashboard displays
  effective XI rating under an accurate label.
- IndexedDB autosave and both recovery copies rotate atomically. Invalid incoming
  saves and transaction failures preserve earlier checkpoints. Recovery copies
  retain their original timestamps. Continue picks the latest primary save;
  recovery selection is available before loading; manual overwrites ask first.
- Native form controls keep their keyboard behaviour; newly inserted action roots
  receive accessibility enhancements. Offline caches belong to their registration
  scope and keep a complete HTML/script build together.

Every surgical edit to `index.html`:

1. Return a copy of an authored player appearance so render-time patches cannot
   mutate the shared description.
2. Make the later general player lookup respect the authored United appearance.
   The comment already promised that precedence, but the guard was absent.
3. Market minimum-potential filter uses `potOf(p)`.
4. Market potential sort uses `potOf` for both players.
5. Market potential-gap display uses `potOf(p)`.
6. Four loader tags for the four new modules. No legacy block was reordered.

## Checked, and how

The full `npm run check` has not completed at publication. The user explicitly
requested the new build on main for testing while regression checking continues.
The focused results below are completed checks; they are not a full-suite pass.

Focused commands already completed:

- `node --test --test-reporter=spec --test-concurrency=2 tests/career-quality.test.cjs tests/boardroom.test.cjs tests/lineup.test.cjs`: 14 passed, 0 failed.
- `node --test --test-reporter=spec --test-concurrency=2 tests/manager-experience.test.cjs tests/career-quality.test.cjs`: 8 passed, 0 failed (before the final authored-appearance precedence fix; included again in the full suite).
- `npm run lint`: clean. `git diff --check`: clean.
- Rendered and visually inspected 18 portrait illustrations at 160px with CairoSVG.
  This found a scalp outline and hair strokes extending onto the forehead; both
  were corrected. No rendering tool, QA dependency or snapshot is shipped.

The old lineup regression expected a newly selected starter also to become a
substitute. It now checks rejection of that illegal duplicate and selection of a
separate eligible reserve. The full suite caught a new preparation-panel startup
error (`G` was null before career creation); the guard and startup assertion fix it.

## Found but not fixed

- The game still has a large legacy file with many ordered wrappers. This cycle
  isolates new presentation code but does not attempt a mechanical extraction.
- Full browser/device layout and animation performance have not been measured in
  this environment. Automated DOM/game-flow checks do not establish those results.
- No claim is made that a finite regression suite proves every career path free
  of bugs or that this upgrade constitutes AAA production sign-off.

## Blocked

The cloud browser could not connect to the local game server. A static snapshot
preview was also rejected by the browser URL security policy; no alternate browser
surface was used to bypass it. Real interactive browser and physical-phone QA
remain outstanding. Portrait artwork was reviewed through a local SVG renderer.

## Data provenance

All gameplay explanations and displayed metrics come from the current repository’s
models and stored players. Existing appearance descriptions and club kit rules are
retained. No external football facts, downloaded photographs, generated bitmap
assets, production dependency or new network requirement was introduced.
