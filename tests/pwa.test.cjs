const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
