const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'src', 'lower-league-data.js');
const gameFile = path.join(root, 'red-devil-manager.html');
const readDate = new Date().toISOString().slice(0, 10);

const DIVISIONS = Object.freeze([
  { key: 'PL', espn: 'eng.1', name: 'Premier League', teams: 20 },
  { key: 'CH', espn: 'eng.2', name: 'Championship', teams: 24 },
  { key: 'L1', espn: 'eng.3', name: 'League One', teams: 24 },
  { key: 'L2', espn: 'eng.4', name: 'League Two', teams: 24 },
  { key: 'NL', espn: 'eng.5', name: 'National League', teams: 24 },
]);

// ESPN uses a handful of provider-specific abbreviations. Store the game's
// established canonical code so nationality remains usable by flags and
// international-team logic, while retaining ESPN's full citizenship text.
const NATIONALITY_CODES = Object.freeze({
  MOR: 'MAR', CRM: 'CMR', SBA: 'SRB', RDC: 'COD', KORS: 'KOR',
  ROM: 'ROU', MTG: 'MNE', XKX: 'KVX', LIB: 'LBN', MARQ: 'MTQ',
});

const SEARCH_OVERRIDES = Object.freeze({
  Alisson: { query: 'Alisson Becker', id: '196876' },
  'Florentino Luís': { query: 'Florentino', id: '256607' },
  'Vitalii Mykolenko': { query: 'Vitaliy Mykolenko', id: '262594' },
  'Đorđe Petrović': { query: 'Djordje Petrovic', id: '289824' },
  'Álex Jiménez': { id: '367861' },
  'Eli Junior Kroupi': { query: 'Junior Kroupi', id: '361809' },
  'Oli McBurnie': { query: 'Oliver McBurnie', id: '193010' },
});

const GAME_NAME_ALIASES = Object.freeze({
  'Harry Clarke': 'Harrison Clarke',
  'Will Dennis': 'William Dennis',
  'Daniel Ballard': 'Danny Ballard',
});

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'The Results Business data updater/1.0' },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = new Error(`${url}: ${error.message}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function cleanColour(value, fallback) {
  const colour = String(value || '').replace(/[^0-9a-f]/gi, '').slice(0, 6);
  return colour.length === 6 ? `#${colour.toUpperCase()}` : fallback;
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

function isoDate(value) {
  if (!value) return null;
  const direct = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const display = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!display) return null;
  return `${display[3]}-${display[1].padStart(2, '0')}-${display[2].padStart(2, '0')}`;
}

function heightInches(athlete) {
  const direct = Number(athlete.height);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const display = String(athlete.displayHeight || '').match(/(\d+)\D+(\d+)/);
  return display ? Number(display[1]) * 12 + Number(display[2]) : null;
}

function weightPounds(athlete) {
  const direct = Number(athlete.weight);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const display = String(athlete.displayWeight || '').match(/(\d+(?:\.\d+)?)/);
  return display ? Number(display[1]) : null;
}

function playerRecord(athlete) {
  const group = { G: 'G', D: 'D', M: 'M', F: 'F' }[athlete.position && athlete.position.abbreviation];
  const age = Number(athlete.age);
  const name = athlete.fullName || athlete.displayName;
  if (!name) return null;
  const aliases = [...new Set([
    name,
    athlete.displayName,
    athlete.firstName && athlete.lastName ? `${athlete.firstName} ${athlete.lastName}` : null,
  ].filter(Boolean))];
  const shirt = Number.parseInt(athlete.jersey, 10);
  const inches = heightInches(athlete);
  const pounds = weightPounds(athlete);
  const centimetres = inches ? Math.round(inches * 2.54) : null;
  const kilograms = pounds ? Math.round(pounds * 0.45359237 * 10) / 10 : null;
  const validHeight = centimetres >= 140 && centimetres <= 220;
  const validWeight = kilograms >= 40 && kilograms <= 150;
  const providerCode = athlete.citizenshipCountry && athlete.citizenshipCountry.abbreviation;
  const profile = (athlete.links || []).find((link) => (link.rel || []).includes('playercard'));
  return {
    id: String(athlete.id),
    name,
    aliases,
    group: group || null,
    age: Number.isFinite(age) && age > 0 ? age : null,
    dateOfBirth: isoDate(athlete.dateOfBirth || athlete.displayDOB),
    nationality: athlete.citizenship || null,
    nat: providerCode ? (NATIONALITY_CODES[providerCode] || providerCode) : null,
    heightCm: validHeight ? centimetres : null,
    weightKg: validWeight ? kilograms : null,
    displayHeight: validHeight ? (athlete.displayHeight || null) : null,
    displayWeight: validWeight ? (athlete.displayWeight || null) : null,
    shirt: Number.isInteger(shirt) && shirt > 0 && shirt < 100 ? shirt : null,
    profile: profile ? profile.href : null,
  };
}

function authoredPremierLeague() {
  const html = fs.readFileSync(gameFile, 'utf8');
  const token = 'const DB=';
  const start = html.indexOf(token);
  const end = html.indexOf('/* ================= PLAYER GENERATION', start);
  if (start < 0 || end < 0) throw new Error('Could not locate the authored Premier League database.');
  const expression = html.slice(start + token.length, end).trim().replace(/;\s*$/, '');
  const database = vm.runInNewContext(expression, Object.create(null), { timeout: 1000 });
  if (!Array.isArray(database) || database.length < 20) throw new Error('The authored club database is incomplete.');
  return database.slice(0, 20).map((club) => ({
    club: club[1],
    players: club[9].map((player) => player[0]),
  }));
}

function rosterIndex(divisions) {
  const index = new Map();
  for (const division of Object.values(divisions)) {
    for (const team of Object.values(division.teams)) {
      for (const player of team.players) {
        for (const alias of player.aliases || [player.name]) {
          const key = nameKey(alias);
          if (!index.has(key)) index.set(key, []);
          const candidates = index.get(key);
          if (!candidates.some((candidate) => candidate.player.id === player.id)) {
            candidates.push({ player, team, division });
          }
        }
      }
    }
  }
  return index;
}

function matchRosterPlayer(index, target) {
  const candidates = index.get(nameKey(GAME_NAME_ALIASES[target.name] || target.name)) || [];
  const sameClub = candidates.filter((candidate) => nameKey(candidate.team.name) === nameKey(target.club));
  const premierLeague = candidates.filter((candidate) => candidate.division.espnCompetition === 'eng.1');
  if (sameClub.length === 1) return sameClub[0];
  if (premierLeague.length === 1) return premierLeague[0];
  return candidates.length === 1 ? candidates[0] : null;
}

async function fetchExtraPlayer(target) {
  const override = SEARCH_OVERRIDES[target.name] || {};
  const query = override.query || target.name;
  const searchUrl = `https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(query)}&limit=20`;
  const search = await fetchJson(searchUrl);
  const candidates = (search.results || [])
    .filter((result) => result.type === 'player')
    .flatMap((result) => result.contents || [])
    .filter((candidate) => candidate.sport === 'soccer' || /^s:600~a:/.test(candidate.uid || ''));
  const expectedKey = nameKey(query);
  const result = (override.id && candidates.find((candidate) => String(candidate.uid || '').endsWith(`a:${override.id}`)))
    || candidates.find((candidate) => nameKey(candidate.displayName) === expectedKey)
    || (candidates.length === 1 ? candidates[0] : null);
  if (!result) return null;
  const idMatch = String(result.uid || '').match(/a:(\d+)/);
  if (!idMatch) return null;
  const league = result.defaultLeagueSlug || 'eng.1';
  const detailUrl = `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${league}/athletes/${idMatch[1]}`;
  const detail = await fetchJson(detailUrl);
  const player = playerRecord(detail.athlete || detail);
  if (!player) return null;
  if (!player.aliases.includes(target.name)) player.aliases.push(target.name);
  return {
    ...player,
    gameName: target.name,
    gameClub: target.club,
    searchSource: searchUrl,
    source: detailUrl,
  };
}

async function fetchDivision(config, authoredByClub) {
  const competitionUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.espn}/teams?limit=100`;
  const listing = await fetchJson(competitionUrl);
  const teams = listing.sports && listing.sports[0]
    && listing.sports[0].leagues && listing.sports[0].leagues[0]
    && listing.sports[0].leagues[0].teams;
  if (!Array.isArray(teams) || teams.length !== config.teams) {
    throw new Error(`${config.name}: expected ${config.teams} teams, received ${teams && teams.length}`);
  }

  const records = await mapLimit(teams.map((entry) => entry.team), 8, async (team) => {
    const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.espn}/teams/${team.id}/roster`;
    const roster = await fetchJson(rosterUrl);
    const players = (roster.athletes || []).map(playerRecord).filter(Boolean);
    if (players.length < 19) throw new Error(`${team.displayName}: only ${players.length} sourced players`);
    const groups = players.reduce((counts, player) => {
      counts[player.group] = (counts[player.group] || 0) + 1;
      return counts;
    }, {});
    if (!groups.G || !groups.D || !groups.M || !groups.F) {
      throw new Error(`${team.displayName}: incomplete positional coverage ${JSON.stringify(groups)}`);
    }
    const authored = (authoredByClub || []).find((entry) => nameKey(entry.club) === nameKey(team.displayName));
    return {
      id: String(team.id),
      name: team.displayName,
      short: team.shortDisplayName || team.displayName,
      abbreviation: team.abbreviation || '',
      primary: cleanColour(team.color, '#555555'),
      secondary: cleanColour(team.alternateColor, '#FFFFFF'),
      source: rosterUrl,
      sourceTimestamp: roster.timestamp || null,
      authoredPlayers: authored ? authored.players : undefined,
      players,
    };
  });

  records.sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  return {
    name: config.name,
    espnCompetition: config.espn,
    readDate,
    source: competitionUrl,
    rosterSourceTemplate: `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.espn}/teams/{teamId}/roster`,
    teams: Object.fromEntries(records.map((team) => [team.name, team])),
  };
}

function moduleSource(data) {
  return `/* This file is generated by scripts/fetch-lower-league-squads.cjs.\n`
    + `   English player identities and biographical facts are ESPN data read ${readDate}; game ratings remain local. */\n`
    + `(function attachLowerLeagueData(root, factory) {\n`
    + `  const data = factory();\n`
    + `  if (typeof module === 'object' && module.exports) module.exports = data;\n`
    + `  if (root) root.RBSLowerLeagueData = data;\n`
    + `})(typeof globalThis !== 'undefined' ? globalThis : this, function lowerLeagueDataFactory() {\n`
    + `  'use strict';\n`
    + `  return ${JSON.stringify(data, null, 2)};\n`
    + `});\n`;
}

async function main() {
  const authored = authoredPremierLeague();
  const divisions = {};
  for (const config of DIVISIONS) {
    divisions[config.key] = await fetchDivision(config, config.key === 'PL' ? authored : null);
  }

  const index = rosterIndex(divisions);
  const targets = authored.flatMap((team) => team.players.map((name) => ({ name, club: team.club })));
  const missing = targets.filter((target) => {
    const match = matchRosterPlayer(index, target);
    if (match && !match.player.aliases.includes(target.name)) match.player.aliases.push(target.name);
    return !match;
  });
  const lookedUp = await mapLimit(missing, 6, fetchExtraPlayer);
  const extraPlayers = lookedUp.filter(Boolean);
  const resolved = new Set(extraPlayers.map((player) => `${player.gameClub}\0${player.gameName}`));
  const unresolvedPremierLeague = missing.filter((target) => !resolved.has(`${target.club}\0${target.name}`));

  const data = {
    schema: 2,
    readDate,
    sourceName: 'ESPN public soccer roster and athlete APIs',
    divisions,
    extraPlayers,
    unresolvedPremierLeague,
  };
  fs.writeFileSync(output, moduleSource(data), 'utf8');
  const teams = Object.values(divisions).reduce((sum, division) => sum + Object.keys(division.teams).length, 0);
  const players = Object.values(divisions).reduce(
    (sum, division) => sum + Object.values(division.teams).reduce((n, team) => n + team.players.length, 0),
    0,
  );
  process.stdout.write(`Wrote ${path.relative(root, output)} with ${teams} teams, ${players} roster players, `
    + `${extraPlayers.length} historical lookups and ${unresolvedPremierLeague.length} unresolved authored players (${readDate}).\n`);
  if (unresolvedPremierLeague.length) {
    process.stdout.write(`Unresolved: ${unresolvedPremierLeague.map((player) => `${player.club}: ${player.name}`).join('; ')}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
