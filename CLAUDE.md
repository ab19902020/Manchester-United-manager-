# Codex report to Claude

## Current as of

- Worked from 250f86c, the cycle-2 fixture brief on top of the accepted squad
  cycle. I did not edit CODEX.md.
- Baseline was 484 clubs, 28 fixture divisions and 8,781 league fixtures.

## Done

- Published together in the repository commit headed `Complete the authentic
  2026/27 fixture cycle`; the work was verified locally in three tier-sized
  checkpoints before publication.
- Sourced all 2,588 fixtures in the Premier League, Championship, League One,
  League Two and National League.
- Sourced all 1,984 fixtures in La Liga, Serie A, Bundesliga, Ligue 1, Primeira
  Liga and Eredivisie.
- Sourced 1,720 fixtures in Serie B, 2. Bundesliga, Ligue 2, Süper Lig, Super
  League Greece and the Czech First League.
- The result is 6,292 exact source events in 17 divisions. The other 2,489
  fixtures stay visibly generated; none were filled with guessed dates.
- Added scripts/fetch-authentic-fixtures.cjs and npm run data:fixtures. It rejects
  wrong counts, membership drift, duplicate source IDs, duplicate directed pairs,
  missing home/away meetings and a club appearing twice on one source date.
- Added src/authentic-fixture-data.js and src/authentic-fixtures.js. The snapshot
  records provider, URL, read date, source season, event ID and club metadata.
  It refreshes 2026/27 promotion/relegation membership inside existing club slots,
  then replaces only season-one league fixtures.
- Sourced dates refuse congestion moves. A generated cup/friendly gives way to a
  sourced league date. Season two clears the provenance and builds a fresh 8,781
  generated-fixture world.
- Updated the harness, integration regressions, PWA cache, README and changelog.
  The regression compares every live source event with the snapshot, checks all
  directed pairs, picker/live membership parity, source metadata, Manchester
  United's four confirmed dates and Bayern München v VfB Stuttgart on 28 August.

Surgical changes to red-devil-manager.html, for review:

1. Added the fixture snapshot and mapper script tags.
2. Called prepareClubs() after the sourced English membership pass.
3. Added fixture membership to worldFingerprint() so a phone cannot reuse a stale
   club-picker cache.
4. Made reschedule() refuse a sourced fixture.
5. Made the collision sweep move a generated cup/friendly around a sourced league
   date.
6. Applied the season-one source overlay at the end of the final buildFixtures()
   layer.

## Checked, and how

- npm run data:fixtures -- --tier=rest:
  ITA2 380, GER2 306, FRA2 306, TUR 306, GRE 182 and CZE 240 validated;
  17 sourced divisions written with read date 2026-08-09.
- node --test --test-reporter=spec tests/game.integration.test.cjs:
  tests 4, pass 4, fail 0; duration 38.303 s.
- npm run check after the complete implementation:
  lint green; tests 9, pass 9, fail 0; duration 52.066 s.
- A live-world probe returned 484 clubs, 8,781 fixtures, 6,292 sourced fixtures,
  17 source divisions and the four United dates as 22/30 August and 6/13
  September. The season-two integration returned 8,781 fixtures, zero sourced
  fixtures and no retained fixture-source metadata.
- Deterministic 380-match measurement:

  | engine | goals/match | draws | 0-0 |
  | --- | ---: | ---: | ---: |
  | detailed | 2.6763 | 25.79% | 7.63% |
  | background | 2.7632 | 22.63% | 4.21% |

  The existing bands remain 2.55–3.05 goals, 20–31% draws, 4–12% 0-0 and a
  maximum model gap of 0.25. No band changed.
- git diff --check reported no whitespace errors.

## Found but not fixed

1. **The brief's universal n×(n−1) invariant contradicts the live calendar.**
   The final buildFixtures() adds a third cycle whenever a division has 12 or
   fewer clubs. A new career therefore has 198 fixtures in each 12-club league
   (not 132) and 135 in the 10-club HNL (not 90). Repro: group G.fixtures by div
   in a new career and inspect SCO/AUT/SUI/DEN/SRB/CRO. The 8,781 baseline depends
   on these extra cycles. Scotland and Switzerland happen to use a real
   33-round pre-split phase, but sourcing it would fail the written acceptance
   rule. This needs a format decision, not a silent validator exception.

2. **Four modeled memberships cannot accept the published competition.**
   Segunda is 20 clubs in-game versus 22/462 source fixtures; Belgium 16 versus
   18/306; Serbia 12 versus 14; Ukraine 12 versus 16. Repro: compare the W_LG
   size values with the source memberships below. Correcting them changes club
   allocation, fixture totals, promotion logic and the save invariant, so I did
   not smuggle that structural rewrite into a data commit.

3. **The no-double-booking property is not fully deterministic outside sourced
   leagues.** One unseeded live-world probe found FC Basel twice on day 112 after
   the collision sweep. The focused integration run, six explicit seeded careers
   and 16 further unseeded careers were clean, so I do not have a stable seed.
   Repro probe: combine G.fixtures with every G.cups[*].ties entry, key both clubs
   by clubIndex|day, and repeat new careers. This appears to be the existing
   generated-league/European rescheduler occasionally exhausting a move, not a
   duplicate in the source snapshots. I left the core calendar algorithm to you.

## Blocked

- Real-device neural synthesis remains blocked: there is no physical Android or
  iPhone here. Still needed are first-use bytes/progress for 36/86/326 MB,
  per-clause mid-range Android latency, second-visit offline behavior, iOS
  first-touch AudioContext unlock and 86 MB memory survival, plus listening tests
  for voice volume against the 0.30 crowd duck.
- Eleven fixture divisions remain generated for the explicit reasons below.
  Structural cases need a decision on real club counts and split/quadruple
  formats. Poland needs replacement dates for its postponed games. Norway needs
  the 2027 calendar or a decision to run a calendar-year career.

## Data provenance

All fixture sources were read 9 August 2026. Exact URLs, event IDs and the same
read date are stored per division in src/authentic-fixture-data.js.

| division | status | published source |
| --- | --- | --- |
| Premier League | sourced — 380 | [ESPN eng.1](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Championship | sourced — 552 | [ESPN eng.2](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard?dates=20260801-20270531&limit=1000) |
| League One | sourced — 552 | [ESPN eng.3](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.3/scoreboard?dates=20260801-20270531&limit=1000) |
| League Two | sourced — 552 | [ESPN eng.4](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.4/scoreboard?dates=20260801-20270531&limit=1000) |
| National League | sourced — 552 | [ESPN eng.5](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.5/scoreboard?dates=20260801-20270531&limit=1000) |
| La Liga | sourced — 380 | [ESPN esp.1](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Serie A | sourced — 380 | [ESPN ita.1](https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Bundesliga | sourced — 306 | [ESPN ger.1](https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Ligue 1 | sourced — 306 | [ESPN fra.1](https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Primeira Liga | sourced — 306 | [ESPN por.1](https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Eredivisie | sourced — 306 | [ESPN ned.1](https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Serie B | sourced — 380 | [ESPN ita.2](https://site.api.espn.com/apis/site/v2/sports/soccer/ita.2/scoreboard?dates=20260801-20270531&limit=1000) |
| 2. Bundesliga | sourced — 306 | [ESPN ger.2](https://site.api.espn.com/apis/site/v2/sports/soccer/ger.2/scoreboard?dates=20260801-20270531&limit=1000) |
| Ligue 2 | sourced — 306 | [ESPN fra.2](https://site.api.espn.com/apis/site/v2/sports/soccer/fra.2/scoreboard?dates=20260801-20270531&limit=1000) |
| Süper Lig | sourced — 306 | [ESPN tur.1](https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Super League Greece | sourced — 182 modeled regular-season matches | [ESPN gre.1](https://site.api.espn.com/apis/site/v2/sports/soccer/gre.1/scoreboard?dates=20260801-20270531&limit=1000) |
| Czech First League | sourced — 240 modeled regular-season matches | [official Chance Liga schedule](https://www.chanceliga.cz/rozpis-zapasu/2027?type=2&id_stage=1&month=0&round=0) |

Left generated rather than invented:

| division | status / exact reason |
| --- | --- |
| Segunda División | [ESPN esp.2](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=20260701-20270630&limit=1000) publishes 22 clubs/462 matches; game is 20/380. |
| Belgian Pro League | [ESPN bel.1](https://site.api.espn.com/apis/site/v2/sports/soccer/bel.1/scoreboard?dates=20260701-20270630&limit=1000) publishes 18 clubs/306; game is 16/240. |
| Scottish Premiership | [ESPN sco.1](https://site.api.espn.com/apis/site/v2/sports/soccer/sco.1/scoreboard?dates=20260701-20270630&limit=1000) has the 198-match 33-round pre-split list. Post-split opponents are unknowable; the brief demands a 132-match double round robin while the game generates 198. |
| Austrian Bundesliga | [ESPN aut.1](https://site.api.espn.com/apis/site/v2/sports/soccer/aut.1/scoreboard?dates=20260701-20270630&limit=1000) has 132 regular-phase matches; the game generates 198 and the real split groups are not known. |
| Swiss Super League | [official SFL calendar](https://sfl.ch/calendar/calendrier-superleague) publishes the pre-split calendar, but the real format is 33 rounds plus five group matches; the game stops at 33 and the brief demands a double round robin. |
| Danish Superliga | [ESPN den.1](https://site.api.espn.com/apis/site/v2/sports/soccer/den.1/scoreboard?dates=20260701-20270630&limit=1000) has 132 regular-phase matches; the game generates 198 and the real split groups are not known. |
| Eliteserien | [ESPN nor.1](https://site.api.espn.com/apis/site/v2/sports/soccer/nor.1/scoreboard?dates=20260101-20261231&limit=1000) has 240 calendar-year matches from 14 March to 13 December; the career begins 30 June and the 2027 list is unpublished. |
| Ekstraklasa | [official 2026/27 schedule](https://ekstraklasa.org/terminarz/2026-2027/kolejka-1/) has all 306 pairings, but currently flags seven games postponed with no replacement date. |
| Serbian SuperLiga | [official league schedule](https://www.superliga.rs/sezona/raspored-i-rezultati/) is a 14-club transitional season; the game has 12 clubs/198 matches. |
| Ukrainian Premier League | [official UPL calendar](https://upl.ua/en/tournaments/championship/432/calendar) is 16 clubs/30 rounds; the game has 12 clubs/198 matches. |
| HNL | [official HNS competition page](https://hns-cff.hr/natjecanja/supersport-hnl/) is 10 clubs/36 rounds (180 matches); the game generates a three-cycle 135. |
