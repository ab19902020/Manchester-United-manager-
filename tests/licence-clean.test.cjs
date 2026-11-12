const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* =====================================================================
   NOTHING IN THE GAME BELONGS TO SOMEBODY ELSE
   ---------------------------------------------------------------------
   The game is sold on app stores, so every club, player, manager,
   competition, ground, broadcaster and sponsor in it is invented. It did
   not start that way: it began as a game about one real club, with real
   squads read from a roster feed and a real published fixture list, and
   all of that was taken out.

   This test is what keeps it out. It reads every file that ships -- the
   page, each module the offline cache lists, the manifest and the Android
   strings -- and fails if any of them names a real competition, club,
   ground, broadcaster or footballer from the list below.

   The list is deliberately the famous end of the real world rather than
   an attempt at all of it: those are the names somebody would reach for
   by habit when writing a comment or a line of commentary, and the ones
   whose owners look. It is a tripwire, not a proof.

   IF THIS FAILS: do not add an exception. Rename the thing. A club is
   its town plus a suffix nobody real uses; a player is a first name and
   a surname from the pools; a competition says what it is.
   ===================================================================== */

const root = path.resolve(__dirname, '..');

const COMPETITIONS = [
  'Premier League', 'League One', 'League Two', 'National League', 'FA Cup', 'EFL', 'Carabao',
  'Community Shield', 'Champions League', 'Europa League', 'Conference League', 'UEFA', 'FIFA',
  'World Cup', 'La Liga', 'LaLiga', 'Bundesliga', 'Serie A', 'Serie B', 'Ligue 1', 'Ligue 2',
  'Eredivisie', 'Primeira Liga', 'Süper Lig', 'Scottish Premiership', 'Ekstraklasa', 'Eliteserien',
  'Ballon d', 'CONMEBOL', 'CONCACAF',
];

const CLUBS = [
  'Manchester United', 'Man Utd', 'Man United', 'Manchester City', 'Man City', 'Liverpool', 'Arsenal',
  'Chelsea', 'Tottenham', 'Spurs', 'Everton', 'Aston Villa', 'Newcastle United', 'West Ham',
  'Leeds United', 'Nottingham Forest', 'Crystal Palace', 'Leicester City', 'Sheffield United',
  'Sheffield Wednesday', 'Wolverhampton Wanderers', 'Brighton & Hove', 'Queens Park Rangers',
  'Blackburn Rovers', 'Bolton Wanderers', 'Derby County', 'Stoke City', 'Sunderland', 'Middlesbrough',
  'Real Madrid', 'FC Barcelona', 'Barça', 'Atlético Madrid', 'Atletico Madrid', 'Athletic Club',
  'Real Sociedad', 'Real Betis', 'Bayern', 'Borussia Dortmund', 'Bayer Leverkusen', 'RB Leipzig',
  'Schalke', 'Juventus', 'Inter Milan', 'Internazionale', 'AC Milan', 'AS Roma', 'Lazio',
  'Fiorentina', 'Atalanta', 'Sampdoria', 'Paris Saint-Germain', 'Olympique', 'AS Monaco',
  'Ajax', 'Feyenoord', 'PSV Eindhoven', 'Benfica', 'Sporting CP', 'FC Porto', 'Celtic',
  'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Anderlecht', 'Club Brugge', 'Red Bull', 'Shakhtar',
  'Dynamo Kyiv', 'Dinamo Zagreb', 'Olympiacos', 'Panathinaikos', 'Red Devil', 'Gunners',
];

const GROUNDS = [
  'Old Trafford', 'Anfield', 'Etihad', 'Emirates Stadium', 'Stamford Bridge', 'Wembley',
  'Goodison', 'St James', 'Villa Park', 'Elland Road', 'Selhurst', 'Molineux', 'Bernabéu',
  'Camp Nou', 'San Siro', 'Allianz', 'Signal Iduna', 'Parc des Princes', 'Stade de France',
  'Johan Cruijff', 'Carrington', 'Stretford',
];

const MEDIA_AND_BRANDS = [
  'Sky Sports', 'BBC', 'ESPN', 'talkSPORT', 'The Athletic', 'Match of the Day', 'Transfermarkt',
  'Opta', 'Adidas', 'Nike', 'Puma', 'Umbro', 'TeamViewer', 'Football Manager', 'Glazer', 'INEOS',
  'Fenway', 'Kroenke',
];

const PEOPLE = [
  'Guardiola', 'Klopp', 'Mourinho', 'Ancelotti', 'Arteta', 'Wenger', 'Simeone', 'Zidane',
  'Pochettino', 'Tuchel', 'Amorim', 'Carrick', 'Solskj', 'Moyes', 'Postecoglou', 'Maresca',
  'Nagelsmann', 'Kompany', 'Allegri', 'Spalletti', 'Gasperini', 'Southgate', 'Lampard', 'Gerrard',
  'Rooney', 'Scholes', 'Giggs', 'Beckham', 'Cantona', 'Rashford', 'Mainoo', 'Garnacho', 'Maguire',
  'Mazraoui', 'Ugarte', 'Casemiro', 'Zirkzee', 'Mbeumo', 'Haaland', 'Foden', 'De Bruyne',
  'Grealish', 'Gvardiol', 'Salah', 'van Dijk', 'Alisson', 'Szoboszlai', 'Wirtz', 'Gakpo', 'Saka',
  'Ødegaard', 'Saliba', 'Havertz', 'Gyökeres', 'Caicedo', 'Bellingham', 'Mbappé', 'Mbappe',
  'Vinícius', 'Yamal', 'Pedri', 'Lewandowski', 'Raphinha', 'Messi', 'Ronaldo', 'Neymar', 'Modrić',
  'Kroos', 'Benzema', 'Griezmann', 'Courtois', 'Donnarumma', 'Hakimi', 'Dembélé', 'Kvaratskhelia',
  'Osimhen', 'Dybala', 'Lukaku', 'Vlahović', 'Musiala', 'Kimmich', 'Pulisic', 'Maignan', 'Tonali',
  'Trossard', 'Calafiori', 'Zubimendi', 'Cucurella', 'Maddison', 'Kulusevski', 'Richarlison',
  'Tielemans', 'Paquetá', 'Trippier', 'Pickford', 'Zaha', 'Semenyo', 'Mitoma', 'Baleba', 'Sancho',
  'Pogba', 'Ibrahimović', 'Bergkamp', 'Drogba', 'Agüero', 'Shearer', 'Lineker', 'Gascoigne',
  'Pelé', 'Maradona', 'Cruyff', 'Beckenbauer', 'Ronaldinho', 'Iniesta', 'Pirlo', 'Totti', 'Maldini',
  'Buffon', 'Schmeichel', 'Fergie', 'Busby', 'Abramovich', 'Infantino',
];

const BLOCKED = [...COMPETITIONS, ...CLUBS, ...GROUNDS, ...MEDIA_AND_BRANDS, ...PEOPLE];

function shippedFiles() {
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const listed = [...worker.matchAll(/'\.\/([^']+\.(?:js|html|webmanifest|svg))'/g)].map((m) => m[1]);
  const extra = ['index.html', 'manifest.webmanifest', 'service-worker.js',
    'android/app/src/main/res/values/strings.xml', 'android/app/src/main/AndroidManifest.xml'];
  return [...new Set([...listed, ...extra])]
    .filter((file) => !/^vendor\//.test(file))
    .filter((file) => fs.existsSync(path.join(root, file)));
}

function pattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

test('no shipped file names a real competition, club, ground, broadcaster or footballer', () => {
  const files = shippedFiles();
  assert.ok(files.length > 60, `only ${files.length} shipped files were found — the list is not being read`);
  assert.ok(files.includes('index.html'));

  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const term of BLOCKED) {
      const re = pattern(term);
      let match = re.exec(text);
      while (match) {
        /* Inter, the typeface, is not the football club, and a `font:` rule is
           the only place the word appears */
        const line = text.slice(0, match.index).split('\n').length;
        hits.push(`${file}:${line}  "${match[0]}"  …${text.slice(Math.max(0, match.index - 30), match.index + term.length + 30).replace(/\s+/g, ' ')}…`);
        if (hits.length > 40) break;
        match = re.exec(text);
      }
      if (hits.length > 40) break;
    }
  }
  assert.equal(hits.length, 0, `real-world names in shipped files:\n  ${hits.join('\n  ')}`);
});

test('no shipped file carries sourced roster or fixture data', () => {
  const files = shippedFiles();
  for (const gone of ['src/lower-league-data.js', 'src/lower-league-squads.js',
    'src/authentic-fixture-data.js', 'src/authentic-fixtures.js']) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} is back`);
    assert.equal(files.includes(gone), false, `${gone} is in the offline cache list`);
  }
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /espn\.com|site\.api\.espn|playerFactsSource\s*:|espnId\s*:\s*['"]\d/i,
      `${file} still carries roster-feed provenance`);
  }
});
