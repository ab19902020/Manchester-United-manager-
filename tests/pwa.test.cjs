const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('the offline install cache contains every script required by the game', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);

  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    assert.match(serviceWorker, new RegExp(`['"]\\./${script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
});

function workerHarness() {
  const listeners = {};
  const entries = new Map(), deleted = [], writes = [];
  const scope = 'https://example.test/manager/';
  const prefix = 'results-business:' + encodeURIComponent(scope) + ':';
  let networkCalls = 0;
  const context = {
    URL, Set, Promise,
    self: { registration: { scope }, location: new URL(scope),
      addEventListener: (event, fn) => { listeners[event] = fn; },
      skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } },
    caches: {
      keys: async () => ['other-game-v9', prefix + 'v58', prefix + 'v59', 'results-business:other-scope:v58'],
      delete: async (key) => { deleted.push(key); },
      open: async () => ({
        match: async (key) => entries.get(key),
        put: async (key, response) => { entries.set(key, response); writes.push(key); },
        addAll: async () => {},
      }),
    },
    fetch: async () => { networkCalls++; return { ok: false, status: 503, clone() { return this; } }; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), context);
  async function request(url, mode = 'navigate') {
    let response = null;
    listeners.fetch({ request: {url, mode, method: 'GET'}, respondWith: (promise) => { response = promise; } });
    return response;
  }
  return {listeners, entries, deleted, writes, request, scope, prefix, networkCalls: () => networkCalls};
}

test('offline activation leaves other games and other installs alone', async () => {
  const worker = workerHarness();
  let done;
  worker.listeners.activate({waitUntil: (promise) => { done = promise; }});
  await done;
  assert.deepEqual(worker.deleted, [worker.prefix + 'v58']);
});

test('offline HTML and scripts come from the same installed build', async () => {
  const worker = workerHarness();
  worker.entries.set(worker.scope + 'index.html', {body: 'installed HTML'});
  worker.entries.set(worker.scope + 'src/lineup.js', {body: 'installed module'});
  assert.equal((await worker.request(worker.scope + 'index.html?visit=2')).body, 'installed HTML');
  assert.equal((await worker.request(worker.scope + 'src/lineup.js', 'cors')).body, 'installed module');
  assert.equal(worker.networkCalls(), 0, 'an installed build must not mix in newer network files');
});

test('hosting errors and unrelated requests never pollute the offline cache', async () => {
  const worker = workerHarness();
  assert.equal((await worker.request(worker.scope + 'index.html')).status, 503);
  assert.equal(worker.writes.length, 0);
  assert.equal(await worker.request(worker.scope + 'large-optional-audio.mp3', 'cors'), null);
  assert.equal(worker.networkCalls(), 1, 'optional media is left to the browser rather than cached forever');
});
