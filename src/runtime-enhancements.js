/* global ACTIONS, G, UI, $, esc, fmtDate, fmtM, fmtW, ordinal, render, showStart,
          vSave, saveBlob, readSlot, loadSlot, unpackG, unpackCareers, autoSave,
          writeSlot, toast, closeModal, openModal */
(function resultsBusinessRuntime() {
  'use strict';

  const win = window;
  const diagnostics = [];
  const appliedPatches = new Set();
  const MAX_DIAGNOSTICS = 80;

  function report(error, context) {
    const item = {
      at: new Date().toISOString(),
      context: context || 'runtime',
      message: String((error && error.message) || error || 'Unknown error'),
      stack: error && error.stack ? String(error.stack).slice(0, 3000) : '',
    };
    diagnostics.push(item);
    while (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
    try { console.error(`[The Results Business: ${item.context}]`, error); } catch (ignored) { /* no console */ }
    return item;
  }

  function notify(message) {
    try {
      if (win.document && win.document.getElementById('toast')) toast(message);
    } catch (error) {
      report(error, 'ui.toast');
    }
  }

  win.RBSDiagnostics = Object.freeze({
    list: () => diagnostics.slice(),
    clear: () => { diagnostics.length = 0; },
    report,
  });

  win.addEventListener('error', (event) => report(event.error || event.message, 'window.error'));
  win.addEventListener('unhandledrejection', (event) => report(event.reason, 'unhandledrejection'));

  function patchAction(name, patchId, wrapper) {
    const key = `${name}:${patchId}`;
    if (appliedPatches.has(key) || typeof ACTIONS[name] !== 'function') return false;
    const original = ACTIONS[name];
    ACTIONS[name] = function patchedAction() {
      return wrapper.call(this, original, Array.from(arguments));
    };
    appliedPatches.add(key);
    return true;
  }

  win.RBSRuntime = Object.freeze({ patchAction, report });

  /* ------------------------------------------------------------------
     ACCESSIBILITY
     ------------------------------------------------------------------ */
  const actionLabels = {
    fullscreen: 'Toggle fullscreen',
    closeModal: 'Close dialog',
    trStar: 'Toggle shortlist',
    mgrCard: 'Open manager profile',
  };

  function accessibleName(element) {
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    if (element.title) return element.title;
    const action = element.dataset && element.dataset.action;
    if (actionLabels[action]) return actionLabels[action];
    if (element.dataset && element.dataset.v) return `Choose ${element.dataset.v}`;
    return action ? action.replace(/([A-Z])/g, ' $1').trim() : '';
  }

  function enhanceAccessibility(root) {
    const host = root && root.querySelectorAll ? root : document;
    host.querySelectorAll('[data-action]').forEach((element) => {
      if (element.tagName !== 'BUTTON' && element.tagName !== 'A') {
        if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
        if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
      }
      if (!element.getAttribute('aria-label')) {
        const label = accessibleName(element);
        if (label) element.setAttribute('aria-label', label);
      }
    });
    host.querySelectorAll('svg.crest').forEach((svg) => svg.setAttribute('aria-hidden', 'true'));
    const main = document.getElementById('view');
    if (main) {
      main.setAttribute('role', 'main');
      main.setAttribute('aria-label', 'Career screen');
    }
    const nav = document.querySelector('nav.nav');
    if (nav) nav.setAttribute('aria-label', 'Main navigation');
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest && event.target.closest('[data-action][role="button"]');
    if (!target || target.tagName === 'BUTTON' || target.tagName === 'A') return;
    event.preventDefault();
    target.click();
  });

  const accessibilityObserver = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === 1) enhanceAccessibility(node);
    }));
  });
  accessibilityObserver.observe(document.body, { childList: true, subtree: true });
  enhanceAccessibility(document);

  const accessibilityStyle = document.createElement('style');
  accessibilityStyle.id = 'rbs-accessibility';
  accessibilityStyle.textContent = [
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}',
    '[role="button"]:focus-visible{outline:3px solid var(--gold);outline-offset:3px}',
  ].join('\n');
  document.head.appendChild(accessibilityStyle);

  /* ------------------------------------------------------------------
     INDEXEDDB CAREER SAVES
     ------------------------------------------------------------------ */
  const StoreApi = win.RBSCareerStore;
  if (!StoreApi || !StoreApi.CareerStore) {
    report(new Error('Career store module did not load.'), 'save.init');
    return;
  }

  const store = new StoreApi.CareerStore();
  const metas = new Map();
  const LEGACY_PREFIX = 'rdm2627:';
  const BRIDGE_SLOT = '__rbs_indexeddb_bridge__';
  let bridgePayload = null;
  let autoTimer = null;
  let saveQueue = Promise.resolve();
  let warnedAutosave = false;

  function worldReady() {
    try {
      return !!(
        G
        && Array.isArray(G.clubs)
        && G.clubs.length >= 400
        && Array.isArray(G.fixtures)
        && G.fixtures.length >= 5000
        && Number.isInteger(G.my)
        && G.clubs[G.my]
      );
    } catch (error) {
      return false;
    }
  }

  function decodeBridge(payload) {
    const save = JSON.parse(payload);
    if (save && save.G && save.pk) save.G = unpackG(save.G, save.pk, save.ak, save.sk);
    if (save && save.G && save.ck) unpackCareers(save.G, save.ck);
    return save;
  }

  const legacyReadSlot = readSlot;
  readSlot = function indexedDbAwareRead(slot) {
    if (String(slot) === BRIDGE_SLOT && bridgePayload) return decodeBridge(bridgePayload);
    return legacyReadSlot.apply(this, arguments);
  };

  function metaFor(slot) {
    return metas.get(String(slot)) || null;
  }

  function dateAgo(timestamp) {
    const milliseconds = Math.max(0, Date.now() - (Number(timestamp) || Date.now()));
    const minutes = Math.round(milliseconds / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function saveLabel(slot) {
    return slot === 'auto' ? '⚡ Autosave' : `Slot ${slot}`;
  }

  function slotCard(slot) {
    const meta = metaFor(slot);
    if (!meta) {
      return `<div class="card tight rbs-save-card"><div class="spread"><div><div class="small" style="font-weight:800">${saveLabel(slot)}</div><div class="xs faint">Empty</div></div>${slot === 'auto' ? '' : `<button class="btn btn-ghost btn-xs" data-action="saveSlot" data-v="${slot}">Save here</button>`}</div></div>`;
    }
    const position = meta.pos ? `${ordinal(meta.pos)} in ` : '';
    return `<div class="card tight rbs-save-card" style="border-left:3px solid ${meta.crest || 'var(--red)'}"><div class="spread" style="align-items:flex-start"><div style="min-width:0"><div class="small" style="font-weight:800">${saveLabel(slot)}</div><div class="xs" style="font-weight:800;margin-top:2px">${esc(meta.club || 'Career')}</div><div class="xs faint">Season ${meta.season || 1} · ${esc(meta.date || `Day ${meta.day || 0}`)} · ${position}${esc(meta.div || '')}</div><div class="xs faint">${dateAgo(meta.savedAt)} · ${(meta.size / 1048576).toFixed(1)} MB</div></div><div style="display:flex;flex-direction:column;gap:5px;flex:none"><button class="btn btn-gold btn-xs" data-action="loadSlotAsk" data-v="${slot}">Load</button>${slot === 'auto' ? '' : `<button class="btn btn-ghost btn-xs" data-action="saveSlot" data-v="${slot}">Overwrite</button><button class="btn btn-ghost btn-xs" data-action="deleteSlotAsk" data-v="${slot}">Delete</button>`}</div></div></div>`;
  }

  async function refreshMetadata() {
    const records = await store.list();
    metas.clear();
    records.forEach((meta) => metas.set(String(meta.slot), meta));
    return records;
  }

  async function migrateLegacySaves() {
    let storage;
    try { storage = win.localStorage; } catch (error) { return; }
    for (const slot of ['auto', '1', '2', '3']) {
      const key = `${LEGACY_PREFIX}${slot}`;
      let payload = null;
      try { payload = storage.getItem(key); } catch (error) { payload = null; }
      if (!payload) continue;
      const checked = StoreApi.validatePayload(payload);
      try {
        if (checked.valid) {
          const existing = await store.get(slot);
          const oldTime = checked.meta.savedAt || 0;
          const newTime = existing && existing.meta ? existing.meta.savedAt || 0 : 0;
          if (!existing || oldTime >= newTime) await store.put(slot, payload, checked.meta);
          storage.removeItem(key);
        } else {
          const kept = await store.quarantine(`legacy-${slot}-${Date.now()}`, payload, checked.reason);
          if (kept) storage.removeItem(key);
        }
      } catch (error) {
        report(error, `save.migrate.${slot}`);
      }
    }
  }

  function paintSaveScreen() {
    try {
      if (win.document && G && UI && UI.view === 'club' && UI.clubTab === 'save') render();
    } catch (error) { report(error, 'save.paint'); }
  }

  function refreshStartResume() {
    const doc = win.document;
    if (!doc) return;
    const screen = doc.getElementById('startScreen');
    if (!screen) return;
    screen.querySelectorAll('[data-rbs-resume], [data-action="resumeCareer"]').forEach((button) => button.remove());
    const slots = ['auto', '1', '2', '3'];
    const slot = slots.find((key) => metaFor(key));
    if (!slot) return;
    const meta = metaFor(slot);
    const button = document.createElement('button');
    button.className = 'btn btn-gold btn-block hero-cta';
    button.dataset.action = 'resumeCareer';
    button.dataset.v = slot;
    button.dataset.rbsResume = '1';
    button.style.marginBottom = '10px';
    button.innerHTML = `▶️ CONTINUE YOUR CAREER<span style="display:block;font-family:var(--body);font-size:10.5px;letter-spacing:.4px;opacity:.85;font-weight:700;text-transform:none;margin-top:2px">${esc(meta.club)} · Season ${meta.season || 1} · ${esc(meta.date || `Day ${meta.day || 0}`)}</span>`;
    const newButton = screen.querySelector('[data-action="frontNew"], [data-action="startGame"], .hero-cta');
    if (newButton && newButton.parentNode) newButton.parentNode.insertBefore(button, newButton);
  }

  const SaveController = {
    store,
    metas,
    ready: null,

    async init() {
      await store.ready;
      await migrateLegacySaves();
      await refreshMetadata();
      refreshStartResume();
      paintSaveScreen();
      return this;
    },

    async save(slot, quiet) {
      if (!worldReady()) {
        if (!quiet) notify('Career is still being prepared — save again in a moment');
        return false;
      }
      let payload;
      let checked;
      try {
        G._lastAuto = Date.now();
        payload = saveBlob();
        checked = StoreApi.validatePayload(payload);
        if (!checked.valid) throw new StoreApi.SaveValidationError(checked.reason, checked);
      } catch (error) {
        report(error, `save.serialise.${slot}`);
        if (!quiet) notify('Save blocked because the career data is incomplete');
        return false;
      }

      const operation = async () => {
        try {
          const previous = metaFor('auto');
          let meta;
          if (String(slot) === 'auto' && (!previous || Math.abs((checked.meta.day || 0) - (previous.day || 0)) >= 7)) {
            meta = await store.putAutosave(payload, checked.meta);
          } else {
            meta = await store.put(String(slot), payload, checked.meta);
          }
          await refreshMetadata();
          if (!quiet) notify(`💾 Saved to ${saveLabel(String(slot))}`);
          refreshStartResume();
          paintSaveScreen();
          return meta;
        } catch (error) {
          report(error, `save.write.${slot}`);
          if (!quiet || !warnedAutosave) {
            notify('⚠️ Save failed — no other careers were changed');
            warnedAutosave = true;
          }
          return false;
        }
      };
      saveQueue = saveQueue.then(operation, operation);
      return saveQueue;
    },

    async load(slot) {
      try {
        const record = await store.get(String(slot));
        if (!record) { notify('That save no longer exists'); return false; }
        const checked = StoreApi.validatePayload(record.payload);
        if (!checked.valid) throw new StoreApi.SaveValidationError(checked.reason, checked);
        bridgePayload = record.payload;
        const loaded = loadSlot(BRIDGE_SLOT);
        if (!loaded) throw new Error('The career could not be restored by this build.');
        closeModal();
        notify(`▶️ ${checked.meta.club} · ${checked.meta.date || `Day ${checked.meta.day}`}`);
        return true;
      } catch (error) {
        report(error, `save.load.${slot}`);
        notify('That save is damaged or belongs to an unsupported build');
        return false;
      } finally {
        bridgePayload = null;
      }
    },

    async remove(slot) {
      try {
        await store.remove(String(slot));
        await refreshMetadata();
        refreshStartResume();
        paintSaveScreen();
        return true;
      } catch (error) {
        report(error, `save.remove.${slot}`);
        notify('That save could not be removed');
        return false;
      }
    },
  };

  win.RBSSaves = SaveController;
  SaveController.ready = SaveController.init().catch((error) => {
    report(error, 'save.init');
    notify('Persistent saves are unavailable — export your career as a backup');
    return SaveController;
  });

  const legacyShowStart = showStart;
  showStart = function indexedDbStartScreen() {
    const result = legacyShowStart.apply(this, arguments);
    Promise.resolve(SaveController.ready).then(refreshStartResume).catch((error) => report(error, 'save.start'));
    return result;
  };

  vSave = function indexedDbSaveScreen() {
    const mode = store.mode === 'indexedDB' ? 'device database' : store.mode === 'localStorage' ? 'limited browser storage' : 'opening storage';
    const backups = [metaFor('auto-1'), metaFor('auto-2')].filter(Boolean).length;
    return `<div class="sec"><div class="t">💾 Your saves</div><div class="ln"></div><div class="sub">${mode}</div></div>${slotCard('auto')}${slotCard('1')}${slotCard('2')}${slotCard('3')}<div class="xs faint" style="padding:2px 4px 10px">Autosaves are checked before writing and never erase a manual career.${backups ? ` ${backups} recovery point${backups === 1 ? '' : 's'} also kept.` : ''}</div><div class="sec"><div class="t">Save file</div><div class="ln"></div></div><div class="card"><p class="xs muted" style="margin-bottom:10px">Export a portable backup for another device or browser.</p><button class="btn btn-primary btn-block" data-action="exportSave">⬇️ Export save file</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-action="importSave">⬆️ Import save file</button><input type="file" id="impFile" accept=".json,application/json" style="display:none"><button class="btn btn-danger btn-block" style="margin-top:18px" data-action="restartAsk">Abandon career & start again</button></div><div class="xs faint" style="text-align:center;margin-top:8px">The Results Business · 2026/27</div>`;
  };

  ACTIONS.saveSlot = async (element) => {
    await SaveController.ready;
    return SaveController.save(element.dataset.v, false);
  };
  ACTIONS.resumeCareer = async (element) => {
    await SaveController.ready;
    return SaveController.load(element.dataset.v || 'auto');
  };
  ACTIONS.loadSlotAsk = (element) => {
    const slot = element.dataset.v;
    const meta = metaFor(slot);
    if (!meta) return;
    openModal(`<h3>Load this career?</h3><div class="card tight" style="margin:8px 0 12px"><div class="small" style="font-weight:800">${esc(meta.club)}</div><div class="xs faint">Season ${meta.season || 1} · ${esc(meta.date || `Day ${meta.day || 0}`)}</div></div><p class="xs muted" style="margin-bottom:12px">The current career will remain available from its latest save.</p><button class="btn btn-gold btn-block" data-action="loadSlotGo" data-v="${slot}">Load it</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-action="closeModal">Cancel</button>`);
  };
  ACTIONS.loadSlotGo = async (element) => {
    await SaveController.ready;
    return SaveController.load(element.dataset.v);
  };
  ACTIONS.deleteSlotAsk = (element) => {
    const slot = element.dataset.v;
    const meta = metaFor(slot);
    if (!meta) return;
    openModal(`<h3>Delete ${saveLabel(slot)}?</h3><p class="small muted" style="margin:10px 0 14px">This removes the saved career for <b>${esc(meta.club)}</b>. Export it first if you may want it later.</p><button class="btn btn-danger btn-block" data-action="deleteSlotGo" data-v="${slot}">Delete this save</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-action="closeModal">Keep it</button>`);
  };
  ACTIONS.deleteSlotGo = async (element) => {
    await SaveController.remove(element.dataset.v);
    closeModal();
    notify('Save deleted');
  };

  function flushAutosave() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
    return SaveController.save('auto', true);
  }

  autoSave = function indexedDbAutosave() {
    if (!worldReady()) return false;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      SaveController.save('auto', true);
    }, 180);
    return true;
  };

  /* Legacy callers receive a safe acknowledgement while the asynchronous
     database write proceeds. No localStorage eviction path remains. */
  writeSlot = function indexedDbWrite(slot, quiet) {
    SaveController.save(String(slot), !!quiet);
    return true;
  };

  patchAction('mgrDoneGo', 'career-ready-save', function careerReadySave(next, args) {
    const result = next.apply(this, args);
    if (worldReady()) setTimeout(flushAutosave, 0);
    return result;
  });
  patchAction('startGame', 'career-ready-fallback', function careerStartSave(next, args) {
    const result = next.apply(this, args);
    setTimeout(() => { if (worldReady()) autoSave(); }, 0);
    return result;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && worldReady()) flushAutosave();
  });
  win.addEventListener('pagehide', () => { if (worldReady()) flushAutosave(); });
  document.addEventListener('change', (event) => {
    if (event.target && event.target.id === 'impFile') {
      setTimeout(() => { if (worldReady()) flushAutosave(); }, 600);
    }
  });

  /* ------------------------------------------------------------------
     INSTALLABLE OFFLINE SHELL
     ------------------------------------------------------------------ */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    win.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => report(error, 'pwa.register'));
    });
  }
})();
