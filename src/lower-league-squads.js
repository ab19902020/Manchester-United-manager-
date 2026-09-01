(function attachLowerLeagueSquads(root, factory) {
  const api = factory(root && root.RBSLowerLeagueData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RBSLowerLeagueSquads = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function lowerLeagueSquadsFactory(data) {
  'use strict';

  const DIVISION_ORDER = ['CH', 'L1', 'L2', 'NL'];
  const FACT_DIVISION_ORDER = ['PL', ...DIVISION_ORDER];
  const TIERS = { CH: 2, L1: 3, L2: 4, NL: 5 };
  const RANGES = {
    CH: { rep: [4300, 5600], budget: [5e6, 18e6] },
    L1: { rep: [3200, 3950], budget: [1.6e6, 4.5e6] },
    L2: { rep: [2700, 3200], budget: [0.6e6, 1.8e6] },
    NL: { rep: [2050, 2600], budget: [0.2e6, 0.9e6] },
  };
  const NAME_ALIASES = { 'Milton Keynes Dons': 'MK Dons' };
  const PLAYER_NAME_ALIASES = {
    'Modou Kéba Cissé': 'Modou Cissé',
    'Ogochukwu Onyeka': 'Frank Onyeka',
  };
  const PLAYER_FACT_FIELDS = [
    'espnId', 'nat', 'nationality', 'dob', 'heightCm', 'weightKg', 'displayHeight',
    'displayWeight', 'playerProfile', 'playerFactsSource', 'playerFactsReadDate',
  ];
  const NEW_CLUB_VENUES = {
    'Birmingham City': {
      name: 'St Andrew\'s @ Knighthead Park', capacity: 29409,
      source: 'https://www.bcfc.com/pages/en/stadium-information',
    },
    Barnet: {
      name: 'The Hive London', capacity: 6500,
      source: 'https://barnetfc.com/partners',
    },
    'AFC Fylde': {
      name: 'Mill Farm', capacity: 6000,
      source: 'https://www.afcfylde.co.uk/news/2023/august/10/bowker-motor-group-extends-mill-farm-stand-partnership',
    },
    'AFC Hornchurch': {
      name: 'Hornchurch Stadium', capacity: 3500,
      source: 'https://en.wikipedia.org/wiki/2026%E2%80%9327_National_League',
    },
    'Kidderminster Harriers': {
      name: 'Aggborough Stadium', capacity: 6444,
      source: 'https://en.wikipedia.org/wiki/2026%E2%80%9327_National_League',
    },
    Worthing: {
      name: 'Woodside Road', capacity: 4000,
      source: 'https://worthingfc.com/2025/04/an-update-on-capacity/',
    },
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function positionGroup(position) {
    if (position === 'GK') return 'G';
    if (['DL', 'DC', 'DR', 'WBL', 'WBR'].includes(position)) return 'D';
    if (['DM', 'MC', 'ML', 'MR', 'AMC'].includes(position)) return 'M';
    return 'F';
  }

  function nameKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ı]/gi, 'i')
      .replace(/[ø]/gi, 'o')
      .replace(/[đð]/gi, 'd')
      .replace(/[ł]/gi, 'l')
      .replace(/[æ]/gi, 'ae')
      .replace(/[œ]/gi, 'oe')
      .replace(/[ß]/gi, 'ss')
      .replace(/[þ]/gi, 'th')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function canonicalPlayerKey(value) {
    return nameKey(PLAYER_NAME_ALIASES[value] || value);
  }

  function ageOnSeasonStart(dateOfBirth) {
    const match = String(dateOfBirth || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const age = 2026 - year - (month > 8 || (month === 8 && day > 1) ? 1 : 0);
    return age >= 15 && age <= 50 ? age : null;
  }

  function validate() {
    if (!data || data.schema !== 3 || !data.divisions) throw new Error('English player source data is unavailable.');
    const sourceIds = new Map();
    for (const division of FACT_DIVISION_ORDER) {
      const entry = data.divisions[division];
      const expected = division === 'PL' ? 20 : 24;
      if (!entry || Object.keys(entry.teams || {}).length !== expected) {
        throw new Error(`${division} does not contain ${expected} sourced teams.`);
      }
      for (const team of Object.values(entry.teams)) {
        if (!Array.isArray(team.players) || team.players.length < 19) {
          throw new Error(`${team.name} does not contain a complete sourced roster.`);
        }
        for (const player of team.players) {
          if (!player.id || !player.name) throw new Error(`${team.name} contains an invalid player record.`);
          if (sourceIds.has(player.id)) {
            throw new Error(`Sourced athlete ${player.id} belongs to both ${sourceIds.get(player.id)} and ${team.name}.`);
          }
          sourceIds.set(player.id, team.name);
          if (player.heightCm && (player.heightCm < 140 || player.heightCm > 220)) {
            throw new Error(`${player.name} has an invalid sourced height.`);
          }
          if (player.weightKg && (player.weightKg < 40 || player.weightKg > 150)) {
            throw new Error(`${player.name} has an invalid sourced weight.`);
          }
        }
      }
    }
    for (const player of data.extraPlayers || []) {
      if (!player.id || !player.name || !player.gameClub) throw new Error('An extra player source record is invalid.');
      if (sourceIds.has(player.id)) {
        throw new Error(`Extra athlete ${player.id} duplicates the source record at ${sourceIds.get(player.id)}.`);
      }
      sourceIds.set(player.id, player.gameClub);
    }
    return true;
  }

  function uniqueKey(clubs, club, team, division) {
    const base = String(team.abbreviation || team.name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ENG';
    let key = base;
    let suffix = 2;
    while (clubs.some((candidate) => candidate !== club && candidate.key === key)) {
      key = `${base}${division}${suffix > 2 ? suffix : ''}`;
      suffix += 1;
    }
    return key;
  }

  function choosePlayer(candidates, used, group, targetAge, blockedNames) {
    const available = (player) => !used.has(player.id)
      && (!blockedNames || !blockedNames.has(canonicalPlayerKey(player.name)));
    let pool = candidates.filter((player) => available(player) && player.group === group);
    if (!pool.length) pool = candidates.filter(available);
    pool.sort((a, b) => {
      const aScore = Math.abs((a.age || targetAge) - targetAge) + (a.shirt ? 0 : 1.5);
      const bScore = Math.abs((b.age || targetAge) - targetAge) + (b.shirt ? 0 : 1.5);
      return aScore - bScore || a.name.localeCompare(b.name, 'en-GB');
    });
    return pool[0] || null;
  }

  function clearFacts(player) {
    for (const field of PLAYER_FACT_FIELDS) delete player[field];
  }

  function applyFacts(player, source, provenance) {
    clearFacts(player);
    player.espnId = source.id;
    if (source.nat) player.nat = source.nat;
    if (source.nationality) player.nationality = source.nationality;
    if (source.dateOfBirth) {
      player.dob = source.dateOfBirth;
      const sourcedAge = ageOnSeasonStart(source.dateOfBirth);
      if (sourcedAge) player.age = sourcedAge;
    } else if (source.age) player.age = source.age;
    if (source.heightCm) player.heightCm = source.heightCm;
    if (source.weightKg) player.weightKg = source.weightKg;
    if (source.displayHeight) player.displayHeight = source.displayHeight;
    if (source.displayWeight) player.displayWeight = source.displayWeight;
    if (source.profile) player.playerProfile = source.profile;
    player.playerFactsSource = provenance;
    player.playerFactsReadDate = data.readDate;
  }

  function buildFactsIndex() {
    const index = new Map();
    const add = (source, team, division, provenance, gameClub) => {
      const entry = { source, team, division, provenance, gameClub };
      for (const alias of source.aliases || [source.name]) {
        const key = nameKey(alias);
        if (!index.has(key)) index.set(key, []);
        const candidates = index.get(key);
        if (!candidates.some((candidate) => candidate.source.id === source.id)) candidates.push(entry);
      }
    };
    for (const division of FACT_DIVISION_ORDER) {
      for (const team of Object.values(data.divisions[division].teams)) {
        for (const source of team.players) add(source, team, division, team.source, team.name);
      }
    }
    for (const source of data.extraPlayers || []) {
      add(source, null, 'PL', source.source, source.gameClub);
    }
    return index;
  }

  function matchFacts(index, player, club, division, used) {
    void division;
    const sourceName = PLAYER_NAME_ALIASES[player.name] || player.name;
    const available = (index.get(nameKey(sourceName)) || [])
      .filter((candidate) => !used.has(candidate.source.id));
    const sameClub = available.filter((candidate) => nameKey(candidate.gameClub) === nameKey(club.name));
    return sameClub.length === 1 ? sameClub[0] : null;
  }

  function assignIdentity(player, source, provenance) {
    player.name = source.name;
    if (source.shirt) player.shirt = source.shirt;
    else delete player.shirt;
    applyFacts(player, source, provenance);
  }

  function applyRoster(club, team) {
    const used = new Set();
    let assigned = 0;
    for (const player of club.players || []) {
      const source = choosePlayer(team.players, used, positionGroup(player.pos), player.age);
      if (!source) continue;
      used.add(source.id);
      assignIdentity(player, source, team.source);
      assigned += 1;
    }
    delete club._shirts;
    club.rosterSource = team.source;
    club.rosterReadDate = data.readDate;
    return assigned;
  }

  function refreshPremierLeague(clubs) {
    const index = buildFactsIndex();
    const unresolved = new Set((data.unresolvedPremierLeague || [])
      .map((player) => `${nameKey(player.club)}\0${canonicalPlayerKey(player.name)}`));
    const report = {
      clubs: 0, players: 0, replacedGenerated: 0, unresolvedAuthored: [], unfilled: [],
      transferredIn: [], identity: null,
    };
    for (const team of Object.values(data.divisions.PL.teams)) {
      const club = clubs.find((candidate) => candidate.league === 'PL' && candidate.name === team.name);
      if (!club) throw new Error(`The live world is missing ${team.name} from PL.`);
      const used = new Set();
      const unmatched = [];
      for (const player of club.players || []) {
        const match = matchFacts(index, player, club, 'PL', used);
        if (!match) {
          unmatched.push(player);
          continue;
        }
        used.add(match.source.id);
        if (PLAYER_NAME_ALIASES[player.name]) player.name = match.source.name;
        applyFacts(player, match.source, match.provenance);
        report.players += 1;
      }
      for (const player of unmatched) {
        /* A MAN A REAL TRANSFER MOVED HERE IS LEFT ALONE. He is not in
           this club's sourced roster because the roster is a snapshot
           taken before he signed, and handing him an unused sourced
           identity does not move him -- it turns him into somebody else
           and deletes him from the game. That is what happened to the
           first attempt at moving Carlos Baleba to Manchester United:
           no player of that name existed anywhere afterwards, and
           nothing reported it. `_trx` is set by applyWindow26. */
        if (player._trx) {
          report.transferredIn.push(`${club.name}: ${player.name}`);
          continue;
        }
        const unresolvedKey = `${nameKey(club.name)}\0${canonicalPlayerKey(player.name)}`;
        if (unresolved.has(unresolvedKey)) {
          report.unresolvedAuthored.push(`${club.name}: ${player.name}`);
          continue;
        }
        const source = choosePlayer(team.players, used, positionGroup(player.pos), player.age);
        if (!source) {
          report.unfilled.push(`${club.name}: ${player.name}`);
          continue;
        }
        used.add(source.id);
        assignIdentity(player, source, team.source);
        report.players += 1;
        report.replacedGenerated += 1;
      }
      delete club._shirts;
      club.playerFactsSource = team.source;
      club.playerFactsReadDate = data.readDate;
      report.clubs += 1;
    }
    report.identity = reconcileEnglishIdentities(clubs);
    return report;
  }

  function sourceOwnership() {
    const byId = new Map();
    const teamsByName = new Map();
    for (const division of FACT_DIVISION_ORDER) {
      for (const team of Object.values(data.divisions[division].teams)) {
        teamsByName.set(nameKey(team.name), team);
        for (const source of team.players) byId.set(source.id, { team, source, provenance: team.source });
      }
    }
    for (const source of data.extraPlayers || []) {
      byId.set(source.id, { team: null, source, provenance: source.source, gameClub: source.gameClub });
    }
    return { byId, teamsByName };
  }

  function reconcileEnglishIdentities(clubs) {
    validate();
    if (!Array.isArray(clubs)) throw new TypeError('Expected the game club array.');
    const englishClubs = clubs.filter((club) => FACT_DIVISION_ORDER.includes(club.league));
    const ownership = sourceOwnership();
    const entries = englishClubs.flatMap((club) => (club.players || []).map((player) => ({ club, player })));
    const losers = new Set();
    const report = { duplicateIdGroups: 0, aliasGroups: 0, replaced: 0, removed: 0 };

    const byId = new Map();
    for (const entry of entries) {
      if (!entry.player.espnId) continue;
      const id = String(entry.player.espnId);
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(entry);
    }
    for (const [id, group] of byId) {
      if (group.length < 2) continue;
      const expected = ownership.byId.get(id);
      const ownerName = expected && (expected.team ? expected.team.name : expected.gameClub);
      const atOwner = group.filter((entry) => ownerName && nameKey(entry.club.name) === nameKey(ownerName));
      const pool = atOwner.length ? atOwner : group;
      pool.sort((left, right) => (Number(right.player.ovr) || 0) - (Number(left.player.ovr) || 0));
      const keeper = pool[0];
      for (const entry of group) if (entry !== keeper) losers.add(entry);
      report.duplicateIdGroups += 1;
    }

    for (const club of englishClubs) {
      const byName = new Map();
      for (const entry of entries.filter((candidate) => candidate.club === club)) {
        const key = canonicalPlayerKey(entry.player.name);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(entry);
      }
      for (const group of byName.values()) {
        if (group.length < 2) continue;
        const ids = new Set(group.map((entry) => entry.player.espnId).filter(Boolean).map(String));
        if (ids.size > 1) continue;
        const active = group.filter((entry) => !losers.has(entry));
        const pool = active.length ? active : group;
        pool.sort((left, right) => {
          const sourced = Number(Boolean(right.player.espnId)) - Number(Boolean(left.player.espnId));
          return sourced || (Number(right.player.ovr) || 0) - (Number(left.player.ovr) || 0);
        });
        const keeper = pool[0];
        for (const entry of group) if (entry !== keeper) losers.add(entry);
        report.aliasGroups += 1;
      }
    }

    const usedIds = new Set(entries.map((entry) => entry.player.espnId).filter(Boolean).map(String));
    for (const entry of losers) {
      const team = ownership.teamsByName.get(nameKey(entry.club.name));
      const blockedNames = new Set((entry.club.players || [])
        .filter((player) => player !== entry.player)
        .map((player) => canonicalPlayerKey(player.name)));
      const source = team && choosePlayer(
        team.players, usedIds, positionGroup(entry.player.pos), entry.player.age, blockedNames,
      );
      if (source) {
        usedIds.add(source.id);
        assignIdentity(entry.player, source, team.source);
        report.replaced += 1;
      } else {
        entry.club.players = (entry.club.players || []).filter((player) => player !== entry.player);
        report.removed += 1;
      }
      delete entry.club._shirts;
    }

    return report;
  }

  function refreshRosters(clubs) {
    validate();
    if (!Array.isArray(clubs)) throw new TypeError('Expected the game club array.');
    const report = { clubs: 0, players: 0, premierLeague: null };
    for (const division of DIVISION_ORDER) {
      for (const team of Object.values(data.divisions[division].teams)) {
        const club = clubs.find((candidate) => candidate.league === division && candidate.name === team.name);
        if (!club) throw new Error(`The live world is missing ${team.name} from ${division}.`);
        report.players += applyRoster(club, team);
        report.clubs += 1;
      }
    }
    report.premierLeague = refreshPremierLeague(clubs);
    return report;
  }

  function apply(clubs) {
    validate();
    if (!Array.isArray(clubs)) throw new TypeError('Expected the game club array.');
    const pool = clubs.filter((club) => DIVISION_ORDER.includes(club.league));
    if (pool.length !== 96) throw new Error(`Expected 96 modeled English pyramid clubs, received ${pool.length}.`);

    const targets = [];
    for (const division of DIVISION_ORDER) {
      for (const team of Object.values(data.divisions[division].teams)) targets.push({ division, team, club: null });
    }

    const used = new Set();
    for (const target of targets) {
      const existingName = NAME_ALIASES[target.team.name] || target.team.name;
      target.club = pool.find((club) => !used.has(club) && club.name === existingName) || null;
      if (target.club) used.add(target.club);
    }

    const spare = pool.filter((club) => !used.has(club));
    for (const target of targets.filter((entry) => !entry.club)) {
      let index = spare.findIndex((club) => club.league === target.division);
      if (index < 0) index = 0;
      target.club = spare.splice(index, 1)[0];
      if (!target.club) throw new Error(`No club slot is available for ${target.team.name}.`);
      target.replaced = target.club.name;
    }
    if (spare.length) throw new Error(`${spare.length} obsolete club slots were not replaced.`);

    const report = { clubs: 0, players: 0, replaced: [], divisions: {} };
    for (const division of DIVISION_ORDER) report.divisions[division] = { clubs: 0, players: 0 };

    for (const target of targets) {
      const { club, team, division } = target;
      const range = RANGES[division];
      const oldRep = Math.max(1, Number(club.rep) || range.rep[0]);
      const rep = clamp(oldRep, range.rep[0], range.rep[1]);
      const oldBudget = Number(club.budget) || range.budget[0];
      club.rep = rep;
      club.budget = clamp(oldBudget, range.budget[0], range.budget[1]);
      club.bank = clamp(Number(club.bank) || club.budget * 1.3, club.budget, club.budget * 1.6);
      club.wageCap = Math.max(1, Math.round((Number(club.wageCap) || rep * 95) * (rep / oldRep)));
      club.name = team.name;
      club.short = team.short;
      club.key = target.replaced ? uniqueKey(clubs, club, team, division) : club.key;
      club.c1 = team.primary;
      club.c2 = team.secondary;
      club.league = division;
      club.cc = 'ENG';
      club.tier = TIERS[division];
      club.espnTeamId = team.id;
      if (target.replaced && NEW_CLUB_VENUES[team.name]) {
        const venue = NEW_CLUB_VENUES[team.name];
        club.stadium = venue.name;
        club.cap = venue.capacity;
        club.venueSource = venue.source;
        club.venueReadDate = data.readDate;
      }
      const assigned = applyRoster(club, team);
      report.clubs += 1;
      report.players += assigned;
      report.divisions[division].clubs += 1;
      report.divisions[division].players += assigned;
      if (target.replaced) report.replaced.push({ removed: target.replaced, added: team.name, division });
    }
    report.premierLeague = refreshPremierLeague(clubs);
    return report;
  }

  return Object.freeze({
    apply, refreshRosters, refreshPremierLeague, reconcileEnglishIdentities, validate, positionGroup, data,
  });
});
