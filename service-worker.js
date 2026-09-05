const CACHE_PREFIX = 'results-business:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE_NAME = CACHE_PREFIX + 'v59';
const CORE_ASSETS = [
  './',
  './index.html',
  './red-devil-manager.html',
  './manifest.webmanifest',
  './src/simulation-model.js',
  './src/lower-league-data.js',
  './src/lower-league-squads.js',
  './src/authentic-fixture-data.js',
  './src/authentic-fixtures.js',
  './src/career-store.js',
  './src/runtime-enhancements.js',
  './src/gameplay-balance.js',
  './src/economy.js',
  './src/press-room.js',
  './src/interactions.js',
  './src/prize-money.js',
  './src/playoffs.js',
  './src/tactics.js',
  './src/attributes.js',
  './src/injuries.js',
  './src/growth.js',
  './src/mailbox.js',
  './src/player-links.js',
  './src/lineup.js',
  './src/boardroom.js',
  './src/match-ratings.js',
  './src/contract-score.js',
  './src/squad-identity.js',
  './src/dugout-drama.js',
  './src/ui-shell.js',
  './src/delegation.js',
  './src/analytics.js',
  './src/story.js',
  './src/name-clash.js',
  './src/tactics-token.js',
  './src/mailbox-pro.js',
  './src/press-questions.js',
  './src/press-voice.js',
  './src/transfer-structure.js',
  './src/face-polish.js',
  './src/layout-repair.js',
  './src/cup-calendar.js',
  './src/trophy-room.js',
  './src/world-seed.js',
  './src/one-job.js',
  './src/one-soundtrack.js',
  './src/front-door.js',
  './src/transfer-search.js',
  './src/keep-history.js',
  './src/match-timeline.js',
  './src/stadium-costs.js',
  './src/golden-boot.js',
  './src/layout-polish.js',
  './src/results-round.js',
  './src/pitch-spotlight.js',
  './src/match-view.js',
  './src/form-and-momentum.js',
  './src/true-potential.js',
  './src/chip-gutters.js',
  './src/surnames.js',
  './src/manager-background.js',
  './src/player-identity.js',
  './src/opposition-instructions.js',
  './src/ai-tactics.js',
  './src/opposition-report.js',
  './src/offside-trap.js',
  './src/match-preparation.js',
  './src/player-comparison.js',
  './src/player-portraits.js',
  './src/visual-upgrade.js',
  './src/manager-experience.js',
  './src/crazygames.js',
  './vendor/three.min.js',
  './assets/results-business-icon.svg',
  './assets/results-business-icon-192.png',
  './assets/results-business-icon-512.png'
];

// Keep one complete build together. Network-first HTML mixed with old cached
// modules could start an upgraded game with yesterday's rules and save code.
const CORE_URLS = new Set(CORE_ASSETS.map((asset) => new URL(asset, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(CORE_ASSETS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Navigation query strings do not create unbounded copies of the 3 MB shell.
  const key = new URL(url.href);
  if (request.mode === 'navigate') key.search = '';
  if (!CORE_URLS.has(key.href)) return;

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(key.href);
    if (cached) return cached;
    const response = await fetch(request);
    // Never replace a working offline entry with a hosting error page.
    if (response && response.ok) await cache.put(key.href, response.clone());
    return response;
  }));
});
