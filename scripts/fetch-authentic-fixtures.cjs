const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'src', 'authentic-fixture-data.js');
const readDate = new Date().toISOString().slice(0, 10);
const range = '20260801-20270531';

const divisions = {
  PL: {
    tier: 'england',
    code: 'eng.1',
    name: 'Premier League',
    fixtureCount: 380,
    teams: [
      'AFC Bournemouth', 'Arsenal', 'Aston Villa', 'Brentford',
      'Brighton & Hove Albion', 'Chelsea', 'Coventry City', 'Crystal Palace',
      'Everton', 'Fulham', 'Hull City', 'Ipswich Town', 'Leeds United',
      'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle United',
      'Nottingham Forest', 'Sunderland', 'Tottenham Hotspur',
    ],
  },
  CH: {
    tier: 'england',
    code: 'eng.2',
    name: 'Championship',
    fixtureCount: 552,
    teams: [
      'Birmingham City', 'Blackburn Rovers', 'Bolton Wanderers', 'Bristol City',
      'Burnley', 'Cardiff City', 'Charlton Athletic', 'Derby County',
      'Lincoln City', 'Middlesbrough', 'Millwall', 'Norwich City', 'Portsmouth',
      'Preston North End', 'Queens Park Rangers', 'Sheffield United',
      'Southampton', 'Stoke City', 'Swansea City', 'Watford',
      'West Bromwich Albion', 'West Ham United', 'Wolverhampton Wanderers',
      'Wrexham',
    ],
  },
  L1: {
    tier: 'england',
    code: 'eng.3',
    name: 'League One',
    fixtureCount: 552,
    teams: [
      'AFC Wimbledon', 'Barnsley', 'Blackpool', 'Bradford City', 'Bromley',
      'Burton Albion', 'Cambridge United', 'Doncaster Rovers',
      'Huddersfield Town', 'Leicester City', 'Leyton Orient', 'Luton Town',
      'Mansfield Town', 'Milton Keynes Dons', 'Notts County', 'Oxford United',
      'Peterborough United', 'Plymouth Argyle', 'Reading', 'Sheffield Wednesday',
      'Stevenage', 'Stockport County', 'Wigan Athletic', 'Wycombe Wanderers',
    ],
  },
  L2: {
    tier: 'england',
    code: 'eng.4',
    name: 'League Two',
    fixtureCount: 552,
    teams: [
      'Accrington Stanley', 'Barnet', 'Bristol Rovers', 'Cheltenham Town',
      'Chesterfield', 'Colchester United', 'Crawley Town', 'Crewe Alexandra',
      'Exeter City', 'Fleetwood Town', 'Gillingham', 'Grimsby Town',
      'Newport County', 'Northampton Town', 'Oldham Athletic', 'Port Vale',
      'Rochdale', 'Rotherham United', 'Salford City', 'Shrewsbury Town',
      'Swindon Town', 'Tranmere Rovers', 'Walsall', 'York City',
    ],
  },
  NL: {
    tier: 'england',
    code: 'eng.5',
    name: 'National League',
    fixtureCount: 552,
    teams: [
      'AFC Fylde', 'AFC Hornchurch', 'Aldershot Town', 'Altrincham', 'Barrow',
      'Boreham Wood', 'Boston United', 'Carlisle United', 'Eastleigh',
      'FC Halifax Town', 'Forest Green Rovers', 'Gateshead', 'Harrogate Town',
      'Hartlepool United', 'Kidderminster Harriers', 'Scunthorpe United',
      'Solihull Moors', 'Southend United', 'Sutton United', 'Tamworth',
      'Wealdstone', 'Woking', 'Worthing', 'Yeovil Town',
    ],
  },
  ESP: {
    tier: 'major',
    code: 'esp.1',
    name: 'La Liga',
    fixtureCount: 380,
    sourceTeams: [
      'Alavés', 'Athletic Club', 'Atlético Madrid', 'Barcelona', 'Celta Vigo',
      'Deportivo La Coruña', 'Elche', 'Espanyol', 'Getafe', 'Levante', 'Málaga',
      'Osasuna', 'Racing Santander', 'Rayo Vallecano', 'Real Betis', 'Real Madrid',
      'Real Sociedad', 'Sevilla', 'Valencia', 'Villarreal',
    ],
    aliases: { 'Alavés': 'Deportivo Alavés', Barcelona: 'FC Barcelona' },
    membership: { pool: ['ESP', 'ESP2'], cc: 'ESP', tier: 1 },
  },
  ITA: {
    tier: 'major',
    code: 'ita.1',
    name: 'Serie A',
    fixtureCount: 380,
    sourceTeams: [
      'AC Milan', 'AS Roma', 'Atalanta', 'Bologna', 'Cagliari', 'Como',
      'Fiorentina', 'Frosinone', 'Genoa', 'Internazionale', 'Juventus', 'Lazio',
      'Lecce', 'Monza', 'Napoli', 'Parma', 'Sassuolo', 'Torino', 'Udinese', 'Venezia',
    ],
    aliases: { Internazionale: 'Inter Milan' },
    membership: { pool: ['ITA', 'ITA2'], cc: 'ITA', tier: 1 },
  },
  GER: {
    tier: 'major',
    code: 'ger.1',
    name: 'Bundesliga',
    fixtureCount: 306,
    sourceTeams: [
      '1. FC Union Berlin', 'Bayer Leverkusen', 'Bayern Munich',
      'Borussia Dortmund', 'Borussia Mönchengladbach', 'Eintracht Frankfurt',
      'FC Augsburg', 'FC Cologne', 'Hamburg SV', 'Mainz', 'RB Leipzig',
      'SC Freiburg', 'SC Paderborn 07', 'SV Elversberg', 'Schalke 04',
      'TSG Hoffenheim', 'VfB Stuttgart', 'Werder Bremen',
    ],
    aliases: {
      'Bayern Munich': 'Bayern München',
      'FC Cologne': '1. FC Köln',
      'Hamburg SV': 'Hamburger SV',
      Mainz: '1. FSV Mainz 05',
      'Schalke 04': 'FC Schalke 04',
    },
    membership: { pool: ['GER', 'GER2'], cc: 'GER', tier: 1 },
  },
  FRA: {
    tier: 'major',
    code: 'fra.1',
    name: 'Ligue 1',
    fixtureCount: 306,
    sourceTeams: [
      'AJ Auxerre', 'AS Monaco', 'Angers', 'Brest', 'Le Havre AC', 'Le Mans',
      'Lens', 'Lille', 'Lorient', 'Lyon', 'Marseille', 'Nice', 'Paris FC',
      'Paris Saint-Germain', 'Stade Rennais', 'Strasbourg', 'Toulouse', 'Troyes',
    ],
    aliases: {
      Angers: 'Angers SCO', Brest: 'Stade Brestois', 'Le Mans': 'Le Mans FC',
      Lens: 'RC Lens', Lille: 'Lille OSC', Lorient: 'FC Lorient',
      Lyon: 'Olympique Lyonnais', Nice: 'OGC Nice', Strasbourg: 'RC Strasbourg',
      Toulouse: 'Toulouse FC', Troyes: 'ESTAC Troyes',
    },
    membership: { pool: ['FRA', 'FRA2'], cc: 'FRA', tier: 1 },
  },
  POR: {
    tier: 'major',
    code: 'por.1',
    name: 'Primeira Liga',
    fixtureCount: 306,
    sourceTeams: [
      'Académico de Viseu', 'Alverca', 'Arouca', 'Benfica', 'Braga',
      'C.D. Nacional', 'Casa Pia', 'Estoril', 'Estrela', 'FC Famalicao',
      'FC Porto', 'Gil Vicente', 'Maritimo', 'Moreirense', 'Rio Ave',
      'Santa Clara', 'Sporting CP', 'Vitória de Guimaraes',
    ],
    aliases: {
      Alverca: 'FC Alverca', Arouca: 'FC Arouca', Braga: 'SC Braga',
      'C.D. Nacional': 'CD Nacional', Estoril: 'Estoril Praia',
      Estrela: 'Estrela da Amadora', 'FC Famalicao': 'FC Famalicão',
      'Vitória de Guimaraes': 'Vitória de Guimarães',
    },
    membership: { pool: ['POR'], cc: 'POR', tier: 1 },
  },
  NED: {
    tier: 'major',
    code: 'ned.1',
    name: 'Eredivisie',
    fixtureCount: 306,
    sourceTeams: [
      'ADO Den Haag', 'AZ Alkmaar', 'Ajax Amsterdam', 'Excelsior', 'FC Groningen',
      'FC Twente', 'FC Utrecht', 'Feyenoord Rotterdam', 'Fortuna Sittard',
      'Go Ahead Eagles', 'Heerenveen', 'NEC Nijmegen', 'PEC Zwolle',
      'PSV Eindhoven', 'SC Cambuur', 'Sparta Rotterdam', 'Telstar', 'Willem II',
    ],
    aliases: {
      'Ajax Amsterdam': 'Ajax', 'Feyenoord Rotterdam': 'Feyenoord',
      Heerenveen: 'SC Heerenveen',
    },
    membership: { pool: ['NED'], cc: 'NED', tier: 1 },
  },
  ITA2: {
    tier: 'rest',
    code: 'ita.2',
    name: 'Serie B',
    fixtureCount: 380,
    sourceTeams: [
      'Arezzo', 'Ascoli', 'Benevento', 'Carrarese', 'Catanzaro', 'Cesena',
      'Cremonese', 'Empoli', 'Hellas Verona', 'Juve Stabia', 'Mantova',
      'Modena', 'Padova', 'Palermo', 'Pisa', 'Sampdoria', 'Sudtirol',
      'US Avellino', 'Vicenza', 'Virtus Entella',
    ],
    aliases: { Sudtirol: 'Südtirol', 'US Avellino': 'Avellino' },
    membership: { pool: ['ITA2'], cc: 'ITA', tier: 2 },
  },
  GER2: {
    tier: 'rest',
    code: 'ger.2',
    name: '2. Bundesliga',
    fixtureCount: 306,
    sourceTeams: [
      '1. FC Heidenheim 1846', '1. FC Magdeburg', '1. FC Nürnberg',
      'Arminia Bielefeld', 'Dynamo Dresden', 'Energie Cottbus', 'Hannover 96',
      'Hertha Berlin', 'Holstein Kiel', 'Kaiserslautern', 'Karlsruher SC',
      'SV Darmstadt 98', 'SpVgg Greuther Fürth', 'St. Pauli',
      'TSV Eintracht Braunschweig', 'VfL Bochum', 'VfL Osnabruck', 'VfL Wolfsburg',
    ],
    aliases: {
      '1. FC Heidenheim 1846': '1. FC Heidenheim',
      'Hertha Berlin': 'Hertha BSC', Kaiserslautern: '1. FC Kaiserslautern',
      'St. Pauli': 'FC St. Pauli',
      'TSV Eintracht Braunschweig': 'Eintracht Braunschweig',
    },
    membership: { pool: ['GER2'], cc: 'GER', tier: 2 },
  },
  FRA2: {
    tier: 'rest',
    code: 'fra.2',
    name: 'Ligue 2',
    fixtureCount: 306,
    sourceTeams: [
      'AS Nancy Lorraine', 'Annecy', 'Boulogne', 'Clermont Foot', 'Dijon FCO',
      'Dunkerque', 'Grenoble', 'Guingamp', 'Metz', 'Montpellier', 'Nantes',
      'Pau', 'Red Star FC 93', 'Rodez Aveyron', 'Saint-Étienne', 'Sochaux',
      'Stade Laval', 'Stade de Reims',
    ],
    aliases: {
      'AS Nancy Lorraine': 'AS Nancy', Annecy: 'FC Annecy', Boulogne: 'US Boulogne',
      Dunkerque: 'USL Dunkerque', Grenoble: 'Grenoble Foot', Guingamp: 'EA Guingamp',
      Metz: 'FC Metz', Montpellier: 'Montpellier HSC', Nantes: 'FC Nantes',
      Pau: 'Pau FC', 'Rodez Aveyron': 'Rodez AF',
      'Saint-Étienne': 'AS Saint-Étienne', 'Stade Laval': 'Stade Lavallois',
    },
    membership: { pool: ['FRA2'], cc: 'FRA', tier: 2 },
  },
  TUR: {
    tier: 'rest',
    code: 'tur.1',
    name: 'Süper Lig',
    fixtureCount: 306,
    sourceTeams: [
      'Alanyaspor', 'Amed SFK', 'Besiktas', 'Caykur Rizespor', 'Erzurum BB',
      'Eyupspor', 'Fenerbahce', 'Galatasaray', 'Gaziantep FK', 'Genclerbirligi',
      'Goztepe', 'Istanbul Basaksehir', 'Kasimpasa', 'Kocaelispor', 'Konyaspor',
      'Samsunspor', 'Trabzonspor', 'Çorum FK',
    ],
    aliases: {
      Besiktas: 'Beşiktaş', 'Caykur Rizespor': 'Çaykur Rizespor',
      Eyupspor: 'Eyüpspor', Fenerbahce: 'Fenerbahçe',
      Genclerbirligi: 'Gençlerbirliği', Goztepe: 'Göztepe',
      'Istanbul Basaksehir': 'İstanbul Başakşehir', Kasimpasa: 'Kasımpaşa',
    },
    membership: { pool: ['TUR'], cc: 'TUR', tier: 1 },
  },
  GRE: {
    tier: 'rest',
    code: 'gre.1',
    name: 'Super League Greece',
    fixtureCount: 182,
    sourceTeams: [
      'AEK Athens', 'Aris', 'Asteras Tripoli', 'Atromitos', 'Iraklis', 'Kalamata',
      'Kifisia', 'Levadiakos', 'OFI Crete', 'Olympiacos', 'PAOK', 'Panathinaikos',
      'Panetolikos', 'Volos NFC',
    ],
    aliases: { Aris: 'Aris Thessaloniki', 'Asteras Tripoli': 'Asteras Tripolis' },
    membership: { pool: ['GRE'], cc: 'GRE', tier: 1 },
  },
  CZE: {
    tier: 'rest',
    provider: 'Chance Liga',
    source: 'https://www.chanceliga.cz/rozpis-zapasu/2027?type=2&id_stage=1&month=0&round=0',
    name: 'Czech First League',
    fixtureCount: 240,
    sourceTeams: [
      '1.FC Slovácko', 'AC Sparta Praha', 'Bohemians Praha 1905',
      'FC Baník Ostrava', 'FC Hradec Králové', 'FC Slovan Liberec',
      'FC Viktoria Plzeň', 'FC Zbrojovka Brno', 'FC Zlín', 'FK Jablonec',
      'FK Mladá Boleslav', 'FK Pardubice', 'FK Teplice', 'SK Artis Brno',
      'SK Sigma Olomouc', 'SK Slavia Praha',
    ],
    aliases: {
      '1.FC Slovácko': 'Slovácko',
      'AC Sparta Praha': 'Sparta Praha',
      'Bohemians Praha 1905': 'Bohemians 1905',
      'FC Baník Ostrava': 'Baník Ostrava',
      'FC Hradec Králové': 'Hradec Králové',
      'FC Slovan Liberec': 'Slovan Liberec',
      'FC Viktoria Plzeň': 'Viktoria Plzeň',
      'FC Zbrojovka Brno': 'Zbrojovka Brno',
      'FC Zlín': 'Zlín',
      'FK Jablonec': 'Jablonec',
      'FK Mladá Boleslav': 'Mladá Boleslav',
      'FK Pardubice': 'Pardubice',
      'FK Teplice': 'Teplice',
      'SK Artis Brno': 'Artis Brno',
      'SK Sigma Olomouc': 'Sigma Olomouc',
      'SK Slavia Praha': 'Slavia Praha',
    },
    identity: {
      'Zbrojovka Brno': {
        primary: '#d40000', secondary: '#ffffff', venue: 'ShipEx Aréna',
      },
      'Artis Brno': {
        primary: '#283371', secondary: '#ffffff', venue: 'ShipEx Aréna',
      },
    },
    membership: { pool: ['CZE'], cc: 'CZE', tier: 1 },
  },
};

for (const config of Object.values(divisions)) {
  if (!config.teams) {
    config.teams = config.sourceTeams.map((team) => (config.aliases && config.aliases[team]) || team);
  }
}

function requestedTier() {
  const flag = process.argv.find((argument) => argument.startsWith('--tier='));
  return flag ? flag.slice('--tier='.length) : 'all';
}

function sourceUrl(code) {
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${range}&limit=1000`;
}

async function fetchJson(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'The Results Business fixture updater/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${url}: ${lastError && lastError.message ? lastError.message : lastError}`);
}

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'The Results Business fixture updater/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${url}: ${lastError && lastError.message ? lastError.message : lastError}`);
}

function sorted(values) {
  return values.slice().sort((left, right) => left.localeCompare(right));
}

function eventSides(event, division) {
  const competition = event && event.competitions && event.competitions[0];
  const competitors = competition && competition.competitors;
  if (!Array.isArray(competitors) || competitors.length !== 2) {
    throw new Error(`${division}: event ${event && event.id} does not have two competitors`);
  }
  const home = competitors.find((entry) => entry.homeAway === 'home');
  const away = competitors.find((entry) => entry.homeAway === 'away');
  if (!home || !away || !home.team || !away.team) {
    throw new Error(`${division}: event ${event.id} has no unambiguous home/away teams`);
  }
  return [home.team.displayName, away.team.displayName];
}

function canonicalName(config, name) {
  return (config.aliases && config.aliases[name]) || name;
}

function assignRounds(events, division, config) {
  const appearances = new Map();
  return events.map((event) => {
    const sourceSides = eventSides(event, division);
    const home = canonicalName(config, sourceSides[0]);
    const away = canonicalName(config, sourceSides[1]);
    const homeGames = appearances.get(home) || 0;
    const awayGames = appearances.get(away) || 0;
    const round = Math.max(homeGames, awayGames);
    const row = [event.date.slice(0, 10), home, away, round, String(event.id)];
    appearances.set(home, homeGames + 1);
    appearances.set(away, awayGames + 1);
    return row;
  });
}

function validateRows(division, config, rows) {
  if (rows.length !== config.fixtureCount) {
    throw new Error(`${division}: expected ${config.fixtureCount} fixtures, received ${rows.length}`);
  }
  const teams = new Set();
  const events = new Set();
  const directedPairs = new Set();
  const clubDays = new Set();
  for (const [date, home, away, , eventId] of rows) {
    if (!/^202[67]-\d\d-\d\d$/.test(date)) throw new Error(`${division}: invalid date ${date}`);
    if (!home || !away || home === away) throw new Error(`${division}: invalid pairing ${home}/${away}`);
    if (events.has(eventId)) throw new Error(`${division}: duplicate source event ${eventId}`);
    events.add(eventId);
    const pair = `${home}\u0000${away}`;
    if (directedPairs.has(pair)) throw new Error(`${division}: duplicate fixture ${home} v ${away}`);
    directedPairs.add(pair);
    for (const team of [home, away]) {
      const key = `${team}\u0000${date}`;
      if (clubDays.has(key)) throw new Error(`${division}: ${team} is scheduled twice on ${date}`);
      clubDays.add(key);
      teams.add(team);
    }
  }
  if (JSON.stringify(sorted([...teams])) !== JSON.stringify(sorted(config.teams))) {
    const missing = config.teams.filter((team) => !teams.has(team));
    const extra = [...teams].filter((team) => !config.teams.includes(team));
    throw new Error(`${division}: membership mismatch; missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  }
  for (const home of config.teams) {
    for (const away of config.teams) {
      if (home !== away && !directedPairs.has(`${home}\u0000${away}`)) {
        throw new Error(`${division}: missing ${home} v ${away}`);
      }
    }
  }
}

function chanceTeam(block, side, config, division) {
  const cell = block.match(new RegExp(`<td class="team ${side}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`));
  if (!cell) throw new Error(`${division}: source row has no ${side} team cell`);
  const anchor = cell[1].match(/<a href="([^"]+)"/);
  const name = cell[1].match(/<span class="hidden-xs">([^<]+)<\/span>/);
  const abbreviation = cell[1].match(/<span class="hidden-sm hidden-md hidden-lg">([^<]+)<\/span>/);
  if (!anchor || !name) throw new Error(`${division}: source row has incomplete ${side} team data`);
  const sourceName = name[1].trim();
  const canonical = canonicalName(config, sourceName);
  const id = anchor[1].match(/\/klub\/(\d+)-/);
  const identity = (config.identity && config.identity[canonical]) || {};
  return {
    sourceName,
    canonical,
    meta: {
      sourceName,
      id: id ? id[1] : anchor[1],
      abbreviation: abbreviation ? abbreviation[1].trim() : null,
      short: canonical,
      primary: identity.primary || null,
      secondary: identity.secondary || null,
      source: new URL(anchor[1], config.source).href,
      venue: identity.venue ? { id: '', name: identity.venue, city: 'Brno', country: 'Czechia' } : null,
    },
  };
}

async function fetchChanceDivision(division, config) {
  const html = await fetchText(config.source);
  const rows = [];
  const sourceTeamNames = new Set();
  const teamMeta = {};
  let round = null;
  const tokenPattern = /<td class="header"[^>]*>(\d+)\.kolo<\/td>|<tr class="game">([\s\S]*?)<\/tr>/g;
  for (const token of html.matchAll(tokenPattern)) {
    if (token[1]) {
      round = Number(token[1]) - 1;
      continue;
    }
    if (!Number.isInteger(round)) throw new Error(`${division}: fixture appeared before its round heading`);
    const block = token[2];
    const date = block.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const event = block.match(/href="\/zapas\/(\d+)-[^"]+"/);
    if (!date || !event) throw new Error(`${division}: source row has no date or event ID`);
    const home = chanceTeam(block, 'home', config, division);
    const away = chanceTeam(block, 'away', config, division);
    sourceTeamNames.add(home.sourceName);
    sourceTeamNames.add(away.sourceName);
    teamMeta[home.canonical] = home.meta;
    teamMeta[away.canonical] = away.meta;
    rows.push([
      `${date[3]}-${date[2]}-${date[1]}`,
      home.canonical,
      away.canonical,
      round,
      `chance-${event[1]}`,
    ]);
  }
  const expectedSourceTeams = config.sourceTeams || config.teams;
  if (JSON.stringify(sorted([...sourceTeamNames])) !== JSON.stringify(sorted(expectedSourceTeams))) {
    const missing = expectedSourceTeams.filter((team) => !sourceTeamNames.has(team));
    const extra = [...sourceTeamNames].filter((team) => !expectedSourceTeams.includes(team));
    throw new Error(`${division}: source membership mismatch; missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  }
  rows.sort((left, right) => left[0].localeCompare(right[0]) || left[4].localeCompare(right[4]));
  validateRows(division, config, rows);
  return {
    name: config.name,
    status: 'published',
    provider: config.provider,
    source: config.source,
    readDate,
    sourceSeason: '2026/27 regular season',
    teamCount: config.teams.length,
    fixtureCount: rows.length,
    teams: config.teams,
    teamMeta,
    membership: config.membership || null,
    fixtures: rows,
  };
}

async function fetchDivision(division, config) {
  if (config.provider === 'Chance Liga') return fetchChanceDivision(division, config);
  const source = sourceUrl(config.code);
  const payload = await fetchJson(source);
  const events = (payload.events || []).slice().sort((left, right) =>
    String(left.date).localeCompare(String(right.date)) || String(left.id).localeCompare(String(right.id)));
  const sourceTeamNames = new Set(events.flatMap((event) => eventSides(event, division)));
  const expectedSourceTeams = config.sourceTeams || config.teams;
  if (JSON.stringify(sorted([...sourceTeamNames])) !== JSON.stringify(sorted(expectedSourceTeams))) {
    const missing = expectedSourceTeams.filter((team) => !sourceTeamNames.has(team));
    const extra = [...sourceTeamNames].filter((team) => !expectedSourceTeams.includes(team));
    throw new Error(`${division}: source membership mismatch; missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  }
  const rows = assignRounds(events, division, config);
  validateRows(division, config, rows);
  const league = payload.leagues && payload.leagues[0];
  const teamMeta = {};
  for (const event of events) {
    const competition = event.competitions[0];
    for (const competitor of competition.competitors) {
      const team = competitor.team;
      const name = canonicalName(config, team.displayName);
      const meta = teamMeta[name] || {
        sourceName: team.displayName,
        id: String(team.id),
        abbreviation: team.abbreviation,
        short: canonicalName(config, team.shortDisplayName || team.displayName),
        primary: team.color ? `#${team.color}` : null,
        secondary: team.alternateColor ? `#${team.alternateColor}` : null,
        source: (team.links || []).find((link) => (link.rel || []).includes('team'))?.href || null,
      };
      if (competitor.homeAway === 'home' && competition.venue) {
        meta.venue = {
          id: String(competition.venue.id || ''),
          name: competition.venue.fullName || null,
          city: competition.venue.address && competition.venue.address.city,
          country: competition.venue.address && competition.venue.address.country,
        };
      }
      teamMeta[name] = meta;
    }
  }
  return {
    name: config.name,
    status: 'published',
    provider: 'ESPN',
    source,
    readDate,
    sourceSeason: league && league.season && league.season.displayName,
    teamCount: config.teams.length,
    fixtureCount: rows.length,
    teams: config.teams,
    teamMeta,
    membership: config.membership || null,
    fixtures: rows,
  };
}

function existingData() {
  if (!fs.existsSync(outputPath)) return { version: 1, readDate, divisions: {} };
  delete require.cache[require.resolve(outputPath)];
  return require(outputPath);
}

function render(data) {
  return `/* Generated by scripts/fetch-authentic-fixtures.cjs. Do not edit by hand.\n` +
    `   Published fixture data read ${data.readDate}; exact source URLs are stored per division. */\n` +
    `(function fixtureDataModule(root, factory) {\n` +
    `  const data = factory();\n` +
    `  if (typeof module === 'object' && module.exports) module.exports = data;\n` +
    `  if (root) root.RBSAuthenticFixtureData = data;\n` +
    `}(typeof globalThis !== 'undefined' ? globalThis : this, function fixtureDataFactory() {\n` +
    `  return ${JSON.stringify(data, null, 2)};\n` +
    `}));\n`;
}

async function main() {
  const tier = requestedTier();
  const selected = Object.entries(divisions).filter(([, config]) => tier === 'all' || config.tier === tier);
  if (!selected.length) throw new Error(`No fixture divisions configured for tier "${tier}"`);
  const data = existingData();
  data.version = 1;
  data.readDate = readDate;
  data.divisions = data.divisions || {};
  for (const [division, config] of selected) {
    data.divisions[division] = await fetchDivision(division, config);
    process.stdout.write(`Validated ${division}: ${data.divisions[division].fixtureCount} fixtures\n`);
  }
  fs.writeFileSync(outputPath, render(data));
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} with ${Object.keys(data.divisions).length} sourced divisions (${readDate}).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
