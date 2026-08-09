(function attachCareerStore(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RBSCareerStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function careerStoreFactory(root) {
  'use strict';

  const DB_NAME = 'results-business-careers';
  const DB_VERSION = 1;
  const CAREERS = 'careers';
  const METADATA = 'metadata';
  const QUARANTINE = 'quarantine';
  const FALLBACK_PREFIX = 'rbs-career:';

  class SaveValidationError extends Error {
    constructor(message, details) {
      super(message);
      this.name = 'SaveValidationError';
      this.details = details || null;
    }
  }

  function checksum(text) {
    const value = String(text || '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
  }

  function countPlayers(clubs) {
    return clubs.reduce(
      (total, club) => total + ((club && club.players) || []).length + ((club && club.youth) || []).length,
      0,
    );
  }

  function validatePayload(payload, options) {
    const settings = Object.assign({ minClubs: 400, minFixtures: 5000 }, options || {});
    let parsed;
    try {
      parsed = JSON.parse(String(payload || ''));
    } catch (error) {
      return { valid: false, reason: 'The save is not valid JSON.', error };
    }

    const state = parsed && parsed.G ? parsed.G : parsed;
    const clubs = state && Array.isArray(state.clubs) ? state.clubs : [];
    const fixtures = state && Array.isArray(state.fixtures) ? state.fixtures : [];
    const declared = (parsed && parsed.world) || {};
    const clubCount = Number(declared.clubs) || clubs.length;
    const fixtureCount = Number(declared.fixtures) || fixtures.length;
    const playerCount = Number(declared.players) || countPlayers(clubs);
    const myClub = state && Number.isInteger(state.my) ? state.my : -1;

    if (clubCount < settings.minClubs || clubs.length < settings.minClubs) {
      return {
        valid: false,
        reason: `Incomplete world: ${clubs.length || clubCount} clubs found; at least ${settings.minClubs} required.`,
        parsed,
        counts: { clubs: clubs.length || clubCount, fixtures: fixtures.length || fixtureCount, players: playerCount },
      };
    }
    if (fixtureCount < settings.minFixtures || fixtures.length < settings.minFixtures) {
      return {
        valid: false,
        reason: `Incomplete calendar: ${fixtures.length || fixtureCount} fixtures found; at least ${settings.minFixtures} required.`,
        parsed,
        counts: { clubs: clubs.length || clubCount, fixtures: fixtures.length || fixtureCount, players: playerCount },
      };
    }
    if (myClub < 0 || myClub >= clubs.length) {
      return { valid: false, reason: 'The save does not identify a valid managed club.', parsed };
    }

    const club = clubs[myClub] || {};
    const meta = {
      club: parsed.club || club.name || 'Unknown club',
      short: parsed.short || club.short || club.name || 'Club',
      crest: parsed.crest || club.c1 || '#da291c',
      season: Number(parsed.season == null ? state.season : parsed.season) || 1,
      day: Number(parsed.day == null ? state.day : parsed.day) || 0,
      date: parsed.date || '',
      pos: Number(parsed.pos) || 0,
      div: parsed.div || club.league || '',
      pts: Number(parsed.pts) || 0,
      fans: Number(parsed.fans) || 0,
      version: Number(parsed.v) || 0,
      schema: parsed.schema || 'legacy-career',
      build: parsed.build || 'legacy',
      savedAt: Number(parsed.t) || Date.now(),
      counts: { clubs: clubCount, fixtures: fixtureCount, players: playerCount },
    };

    return { valid: true, parsed, meta, counts: meta.counts };
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    });
  }

  class CareerStore {
    constructor(options) {
      const settings = options || {};
      this.indexedDB = settings.indexedDB || root.indexedDB || null;
      this.localStorage = settings.localStorage || root.localStorage || null;
      this.dbName = settings.dbName || DB_NAME;
      this.db = null;
      this.mode = 'pending';
      this.ready = this.open();
    }

    async open() {
      if (!this.indexedDB) {
        this.mode = 'localStorage';
        return null;
      }
      try {
        this.db = await new Promise((resolve, reject) => {
          const request = this.indexedDB.open(this.dbName, DB_VERSION);
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(CAREERS)) database.createObjectStore(CAREERS, { keyPath: 'slot' });
            if (!database.objectStoreNames.contains(METADATA)) database.createObjectStore(METADATA, { keyPath: 'slot' });
            if (!database.objectStoreNames.contains(QUARANTINE)) database.createObjectStore(QUARANTINE, { keyPath: 'id' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Could not open career storage.'));
          request.onblocked = () => reject(new Error('Career storage upgrade is blocked by another tab.'));
        });
        this.mode = 'indexedDB';
        return this.db;
      } catch (error) {
        this.db = null;
        this.mode = 'localStorage';
        return null;
      }
    }

    async put(slot, payload, suppliedMeta) {
      await this.ready;
      const checked = validatePayload(payload);
      if (!checked.valid) throw new SaveValidationError(checked.reason, checked);
      const savedAt = Date.now();
      const digest = checksum(payload);
      const meta = Object.assign({}, checked.meta, suppliedMeta || {}, {
        slot: String(slot),
        checksum: digest,
        size: String(payload).length,
        savedAt,
      });
      const data = { slot: String(slot), payload: String(payload), checksum: digest, savedAt };

      if (this.db) {
        const transaction = this.db.transaction([CAREERS, METADATA], 'readwrite');
        transaction.objectStore(CAREERS).put(data);
        transaction.objectStore(METADATA).put(meta);
        await transactionDone(transaction);
      } else {
        if (!this.localStorage) throw new Error('Persistent browser storage is unavailable.');
        this.localStorage.setItem(`${FALLBACK_PREFIX}${slot}`, data.payload);
        this.localStorage.setItem(`${FALLBACK_PREFIX}meta:${slot}`, JSON.stringify(meta));
      }
      return meta;
    }

    async putAutosave(payload, suppliedMeta) {
      await this.ready;
      if (this.db) {
        const previous = await this.get('auto');
        const older = await this.get('auto-1');
        if (older) await this.put('auto-2', older.payload, Object.assign({}, older.meta, { backup: true }));
        if (previous) await this.put('auto-1', previous.payload, Object.assign({}, previous.meta, { backup: true }));
      }
      return this.put('auto', payload, suppliedMeta);
    }

    async get(slot) {
      await this.ready;
      let data = null;
      let meta = null;
      if (this.db) {
        const transaction = this.db.transaction([CAREERS, METADATA], 'readonly');
        [data, meta] = await Promise.all([
          requestResult(transaction.objectStore(CAREERS).get(String(slot))),
          requestResult(transaction.objectStore(METADATA).get(String(slot))),
        ]);
      } else if (this.localStorage) {
        const payload = this.localStorage.getItem(`${FALLBACK_PREFIX}${slot}`);
        if (payload) data = { slot: String(slot), payload, checksum: checksum(payload) };
        const rawMeta = this.localStorage.getItem(`${FALLBACK_PREFIX}meta:${slot}`);
        if (rawMeta) {
          try { meta = JSON.parse(rawMeta); } catch (error) { meta = null; }
        }
      }
      if (!data) return null;
      const digest = checksum(data.payload);
      if (data.checksum && data.checksum !== digest) {
        throw new SaveValidationError('The save checksum does not match; it may be damaged.');
      }
      return { payload: data.payload, meta: meta || validatePayload(data.payload).meta };
    }

    async list() {
      await this.ready;
      if (this.db) {
        const transaction = this.db.transaction(METADATA, 'readonly');
        const records = await requestResult(transaction.objectStore(METADATA).getAll());
        return records.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      }
      if (!this.localStorage) return [];
      const records = [];
      for (let index = 0; index < this.localStorage.length; index += 1) {
        const key = this.localStorage.key(index);
        if (!key || !key.startsWith(`${FALLBACK_PREFIX}meta:`)) continue;
        try { records.push(JSON.parse(this.localStorage.getItem(key))); } catch (error) { /* ignore bad metadata */ }
      }
      return records.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }

    async remove(slot) {
      await this.ready;
      if (this.db) {
        const transaction = this.db.transaction([CAREERS, METADATA], 'readwrite');
        transaction.objectStore(CAREERS).delete(String(slot));
        transaction.objectStore(METADATA).delete(String(slot));
        await transactionDone(transaction);
      } else if (this.localStorage) {
        this.localStorage.removeItem(`${FALLBACK_PREFIX}${slot}`);
        this.localStorage.removeItem(`${FALLBACK_PREFIX}meta:${slot}`);
      }
    }

    async quarantine(id, payload, reason) {
      await this.ready;
      if (!this.db) return false;
      const transaction = this.db.transaction(QUARANTINE, 'readwrite');
      transaction.objectStore(QUARANTINE).put({
        id: String(id),
        payload: String(payload),
        reason: String(reason || 'Invalid legacy save'),
        quarantinedAt: Date.now(),
      });
      await transactionDone(transaction);
      return true;
    }

    close() {
      if (this.db) this.db.close();
      this.db = null;
    }
  }

  return Object.freeze({ CareerStore, SaveValidationError, checksum, validatePayload });
});
