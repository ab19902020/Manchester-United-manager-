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
  const PLAYER_NAME_ALIASES = { 'Modou Kéba Cissé': 'Modou Cissé' };
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
    if (!data || data.schema !== 2 || !data.divisions) throw new Error('English player source data is unavailable.');
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
          if (player.heightCm && (player.heightCm < 140 || player.heightCm > 220)) {
            throw new Error(`${player.name} has an invalid sourced height.`);
          }
          if (player.weightKg && (player.weightKg < 40 || player.weightKg > 150)) {
            throw new Error(`${player.name} has an invalid sourced weight.`);
          }
        }
      }
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

  function choosePlayer(candidates, used, group, targetAge) {
    let pool = candidates.filter((player) => !used.has(player.id) && player.group === group);
    if (!pool.length) pool = candidates.filter((player) => !used.has(player.id));
    pool.sort((a, b) => {
      const aScore = Math.abs((a.age || targetAge) - targetAge) + (a.shirt ? 0 : 1.5);
      const bScore = Math.abs((b.age || targetAge) - targetAge) + (b.shirt ? 0 : 1.5);
      return aScore - bScore || a.name.localeCompare(b.name, 'en-GB');
    });
    return pool[0] || null;
  }

  function applyFacts(player, source, provenance) {
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
    const sourceName = PLAYER_NAME_ALIASES[player.name] || player.name;
    const available = (index.get(nameKey(sourceName)) || [])
      .filter((candidate) => !used.has(candidate.source.id));
    const sameClub = available.filter((candidate) => nameKey(candidate.gameClub) === nameKey(club.name));
    const sameDivision = available.filter((candidate) => candidate.division === division);
    if (sameClub.length === 1) return sameClub[0];
    if (sameDivision.length === 1) return sameDivision[0];
    return available.length === 1 ? available[0] : null;
  }

  function applyRoster(club, team) {
    const used = new Set();
    let assigned = 0;
    for (const player of club.players || []) {
      const source = choosePlayer(team.players, used, positionGroup(player.pos), player.age);
      if (!source) continue;
      used.add(source.id);
      player.name = source.name;
      if (source.shirt) player.shirt = source.shirt;
      else delete player.shirt;
      applyFacts(player, source, team.source);
      assigned += 1;
    }
    delete club._shirts;
    club.rosterSource = team.source;
    club.rosterReadDate = data.readDate;
    return assigned;
  }

  function refreshPremierLeague(clubs) {
    const index = buildFactsIndex();
    const report = { clubs: 0, players: 0, replacedGenerated: 0, unresolvedAuthored: [] };
    for (const team of Object.values(data.divisions.PL.teams)) {
      const club = clubs.find((candidate) => candidate.league === 'PL' && candidate.name === team.name);
      if (!club) throw new Error(`The live world is missing ${team.name} from PL.`);
      const authored = new Set((team.authoredPlayers || []).map(nameKey));
      const used = new Set();
      const unmatched = [];
      for (const player of club.players || []) {
        const match = matchFacts(index, player, club, 'PL', used);
        if (!match) {
          unmatched.push(player);
          continue;
        }
        used.add(match.source.id);
        applyFacts(player, match.source, match.provenance);
        report.players += 1;
      }
      for (const player of unmatched) {
        if (authored.has(nameKey(player.name))) {
          report.unresolvedAuthored.push(`${club.name}: ${player.name}`);
          continue;
        }
        const source = choosePlayer(team.players, used, positionGroup(player.pos), player.age);
        if (!source) continue;
        used.add(source.id);
        player.name = source.name;
        if (source.shirt) player.shirt = source.shirt;
        else delete player.shirt;
        applyFacts(player, source, team.source);
        report.players += 1;
        report.replacedGenerated += 1;
      }
      delete club._shirts;
      club.playerFactsSource = team.source;
      club.playerFactsReadDate = data.readDate;
      report.clubs += 1;
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

  return Object.freeze({ apply, refreshRosters, refreshPremierLeague, validate, positionGroup, data });
});
