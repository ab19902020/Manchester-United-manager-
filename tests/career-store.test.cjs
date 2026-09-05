const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const { CareerStore, SaveValidationError, checksum, validatePayload } = require('../src/career-store.js');

function payload(day = 0) {
  const clubs = Array.from({ length: 400 }, (_, index) => ({
    i: index,
    name: index === 0 ? 'Test United' : `Club ${index}`,
    short: index === 0 ? 'TST' : `C${index}`,
    league: 'PL',
    players: [{ id: index + 1, name: `Player ${index}` }],
  }));
  const fixtures = Array.from({ length: 5000 }, (_, index) => ({ h: index % 400, a: (index + 1) % 400, day: index % 320 }));
  return JSON.stringify({
    v: 6,
    schema: 'results-business-career',
    t: Date.now(),
    club: 'Test United',
    date: `Day ${day}`,
    day,
    season: 1,
    world: { clubs: 400, fixtures: 5000, players: 400 },
    G: { my: 0, day, season: 1, clubs, fixtures },
  });
}

test('validates a complete career and rejects the early 84-club autosave shape', () => {
  assert.equal(validatePayload(payload()).valid, true);
  const incomplete = JSON.stringify({ G: { my: 0, clubs: Array.from({ length: 84 }, () => ({ players: [] })), fixtures: [] } });
  const checked = validatePayload(incomplete);
  assert.equal(checked.valid, false);
  assert.match(checked.reason, /Incomplete world/);
});

test('keeps every manual slot instead of deleting another career', async () => {
  const store = new CareerStore({ indexedDB: new IDBFactory(), dbName: `slots-${Date.now()}` });
  await store.ready;
  await store.put('auto', payload(1));
  await store.put('1', payload(2));
  await store.put('2', payload(3));
  await store.put('3', payload(4));
  const slots = (await store.list()).map((item) => item.slot).sort();
  assert.deepEqual(slots, ['1', '2', '3', 'auto']);
  assert.equal((await store.get('2')).meta.day, 3);
  store.close();
});

test('rotates two recovery autosaves and verifies checksums', async () => {
  const store = new CareerStore({ indexedDB: new IDBFactory(), dbName: `rotation-${Date.now()}` });
  await store.ready;
  await store.putAutosave(payload(1));
  await store.putAutosave(payload(4));
  await store.putAutosave(payload(7));
  assert.equal((await store.get('auto')).meta.day, 7);
  assert.equal((await store.get('auto-1')).meta.day, 4);
  assert.equal((await store.get('auto-2')).meta.day, 1);
  assert.equal(checksum('career'), checksum('career'));
  assert.notEqual(checksum('career'), checksum('Career'));
  store.close();
});

test('will not write incomplete state', async () => {
  const store = new CareerStore({ indexedDB: new IDBFactory(), dbName: `invalid-${Date.now()}` });
  await store.ready;
  await assert.rejects(
    store.put('1', JSON.stringify({ G: { my: 0, clubs: [], fixtures: [] } })),
    SaveValidationError,
  );
  assert.equal((await store.list()).length, 0);
  store.close();
});

test('persists a career when the store is reopened', async () => {
  const indexedDB = new IDBFactory();
  const dbName = `reopen-${Date.now()}`;
  const first = new CareerStore({ indexedDB, dbName });
  await first.ready;
  await first.put('1', payload(12));
  first.close();

  const second = new CareerStore({ indexedDB, dbName });
  await second.ready;
  const restored = await second.get('1');
  assert.equal(restored.meta.day, 12);
  assert.equal(validatePayload(restored.payload).valid, true);
  second.close();
});

test('rejecting an autosave leaves both recovery points byte-for-byte intact', async (t) => {
  const store = new CareerStore({ indexedDB: new IDBFactory() });
  t.after(() => store.close());
  await store.putAutosave(payload(1));
  await store.putAutosave(payload(8));
  await store.putAutosave(payload(15));
  const slots = ['auto', 'auto-1', 'auto-2'];
  const before = await Promise.all(slots.map((slot) => store.get(slot)));
  await assert.rejects(store.putAutosave('{"G":{}}'), SaveValidationError);
  assert.deepEqual(await Promise.all(slots.map((slot) => store.get(slot))), before);
});

test('recovery copies preserve their original saved time and survive a damaged autosave', async (t) => {
  const store = new CareerStore({ indexedDB: new IDBFactory() });
  t.after(() => store.close());
  await store.putAutosave(payload(1));
  const original = await store.get('auto');
  await store.putAutosave(payload(8));
  assert.equal((await store.get('auto-1')).meta.savedAt, original.meta.savedAt);
  const recovery = await store.get('auto-1');
  await new Promise((resolve, reject) => {
    const tx = store.db.transaction('careers', 'readwrite');
    tx.objectStore('careers').put({ slot: 'auto', payload: payload(9), checksum: 'corrupt' });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
  await store.putAutosave(payload(15));
  assert.equal((await store.get('auto')).meta.day, 15);
  assert.deepEqual(await store.get('auto-1'), recovery);
});

test('aborting autosave storage rolls back the entire recovery rotation', async (t) => {
  const store = new CareerStore({ indexedDB: new IDBFactory() });
  t.after(() => store.close());
  await store.putAutosave(payload(1));
  await store.putAutosave(payload(8));
  await store.putAutosave(payload(15));
  const slots = ['auto', 'auto-1', 'auto-2'];
  const before = await Promise.all(slots.map((slot) => store.get(slot)));
  const transaction = store.db.transaction.bind(store.db);
  store.db.transaction = (...args) => {
    const tx = transaction(...args);
    if (args[1] === 'readwrite') {
      const objectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name) => {
        const os = objectStore(name);
        const put = os.put.bind(os);
        os.put = (record) => {
          const request = put(record);
          if (name === 'metadata' && record.slot === 'auto') request.addEventListener('success', () => tx.abort());
          return request;
        };
        return os;
      };
    }
    return tx;
  };
  await assert.rejects(store.putAutosave(payload(22)), /abort/i);
  store.db.transaction = transaction;
  assert.deepEqual(await Promise.all(slots.map((slot) => store.get(slot))), before);
});
