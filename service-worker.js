const CACHE_NAME = 'results-business-v44';
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
  './src/dugout-renderer.js',
  './src/contract-score.js',
  './src/squad-identity.js',
  './src/dugout-drama.js',
  './src/dugout-commentary.js',
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
  './src/matchday-engine.js',
  './src/dugout-matchday.js',
  './src/stadium-costs.js',
  './src/golden-boot.js',
  './src/layout-polish.js',
  './src/highlights.js',
  './src/crazygames.js',
  './vendor/three.min.js',
  './assets/results-business-icon.svg',
  './assets/results-business-icon-192.png',
  './assets/results-business-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((response) => response || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || update;
    }),
  );
});
