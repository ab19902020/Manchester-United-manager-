/* global toast, UI, MU, ACTIONS */

/* =====================================================================
   THE ANDROID APP
   ---------------------------------------------------------------------
   The game ships as an Android app as well as a web page. The app is a
   WebView around exactly this build (android/), and the WebView is a
   browser with pieces missing. This file fills the pieces in, talking to
   the Java side through `window.AndroidShell`. In a browser that object
   does not exist and this file does nothing at all.

   What it adds, and why each one matters to a player:

   BACK. Android's back button reached the WebView's history, which this
   game never uses, so one press left the app. It now does what back
   means on the screen you are looking at: steps back through stacked
   sheets, closes the last one, leaves a letter or a sub-page, returns to
   Home — and only on Home, pressed twice, leaves the game. During a
   match it pauses rather than walking out of the ground.

   EXPORT. "Export save file" makes a Blob and clicks a download link.
   A WebView ignores the click, so the career backup — the one thing
   that survives uninstalling — silently did nothing. The file is now
   handed to Android in chunks and the system picker asks where to put it.

   VOICE. Android's WebView has no working speechSynthesis, so the press
   room was mute. A Web Speech shim speaks through Android's own
   text-to-speech, and tells the game which British voices are men so
   the press-voice rules still choose one.

   AWAY AND BACK. Leaving the app saves the career at once, stops the
   voice and suspends the crowd, rather than leaving a stadium playing
   in a pocket. Coming back resumes the sound.

   THE SCREEN. It stays awake while a match is on; the fullscreen button
   is hidden, because the app is already full screen.

   Nothing here touches the game's state, the match engine or the save
   format. It only connects what the game already does to the phone.
   ===================================================================== */
(function androidShell() {
  'use strict';

  const win = window;
  const doc = document;
  const bridge = win.AndroidShell;
  if (!bridge || typeof bridge.info !== 'function') return;

  let info = {};
  try { info = JSON.parse(bridge.info()) || {}; } catch (error) { info = {}; }
  doc.documentElement.classList.add('android-app');

  function say(message, ms) {
    try { if (typeof toast === 'function') toast(message, ms); } catch (error) { /* no toast yet */ }
  }

  /* ---- events from the Java side: AndroidShellEvent(type, detail) ---- */
  const listeners = Object.create(null);
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  win.AndroidShellEvent = function androidShellEvent(type, detail) {
    (listeners[type] || []).forEach((fn) => {
      try { fn(detail || {}); } catch (error) { /* one listener must not stop the rest */ }
    });
  };

  /* ---- what the app looks like ---- */
  const style = doc.createElement('style');
  style.id = 'android-shell';
  style.textContent = [
    '.android-app .fsbtn{display:none!important}',
    '.android-app body{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;',
    ' overscroll-behavior:none}',
    '.android-app button,.android-app .btn,.android-app .chip,.android-app [data-action]{',
    ' -webkit-user-select:none;user-select:none}',
  ].join('\n');
  (doc.head || doc.documentElement).appendChild(style);

  /* =================================================================
     BACK
     ================================================================= */
  /* With no layout engine (the test suite's jsdom) every box measures zero,
     so visibility falls back to the computed display. */
  const laidOut = () => {
    const r = doc.documentElement.getBoundingClientRect();
    return !!(r.width || r.height);
  };
  const visible = (el) => {
    if (!el) return false;
    if (laidOut()) return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const style = win.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const firstVisible = (root, selector) => {
    if (!root) return null;
    const all = root.querySelectorAll(selector);
    for (let i = 0; i < all.length; i++) if (visible(all[i])) return all[i];
    return null;
  };
  const press = (el) => { try { el.click(); return true; } catch (error) { return false; } };

  const SUB_PAGE_BACK = '[data-action="mailBack"],[data-action="subBack"],[data-action="mgrBack"],[data-action="frontBack"]';
  let lastBackAt = 0;

  /* Full-screen rooms drawn above everything else, topmost first, with
     the control in each that is the honest way out of it. A room with no
     way out yet (the board waiting on an answer) keeps you there and says
     why, rather than back dropping a meeting half-held. */
  const ROOMS = [
    { sel: '.thall-win', exit: '[data-thall-skip]' },
    { sel: '#tpHost', exit: '[data-tp="close"]' },
    { sel: '#troom', exit: '[data-action="trophyRoomClose"]' },
    { sel: '#brRoom', exit: '[data-action="brDone"],[data-action="brNext"]', wait: 'The board are waiting for your answer' },
    { sel: '#drRoom', exit: '[data-action="drOut"]', wait: 'Finish the team talk first' },
    { sel: '#mgrCreate', exit: '[data-action="mgrBack"]' },
    { sel: '#introScreen', tapToSkip: true },
  ];

  function backOnce() {
    /* 0. a room on top of everything */
    for (let i = 0; i < ROOMS.length; i++) {
      const room = ROOMS[i];
      const el = doc.querySelector(room.sel);
      if (!el || !visible(el) || el.classList.contains('out')) continue;
      const exit = room.exit ? firstVisible(el, room.exit) : null;
      if (exit && press(exit)) return 'handled';
      if (room.tapToSkip && press(el)) return 'handled';
      if (room.wait) say(room.wait);
      return 'handled';
    }

    /* 1. a sheet is open: step back through the stack, then close it */
    const modal = doc.querySelector('#modalHost.open');
    if (modal) {
      const back = firstVisible(modal, '[data-action="sheetBack"]');
      if (back && press(back)) return 'handled';
      const close = firstVisible(modal, '.sheet-x[data-action="closeModal"]')
        || modal.querySelector('.scrim[data-action="closeModal"]');
      if (close && press(close)) return 'handled';
      return 'handled';
    }

    /* 2. a match is on: pause it, never walk out of it */
    const match = doc.querySelector('#matchScreen.open');
    if (match) {
      const live = typeof MU !== 'undefined' && MU && MU.m && !MU.m.done && MU.m.stage !== 'HT' && MU.speed > 0;
      if (live) {
        const pause = firstVisible(match, '[data-action="mspeed"][data-v="0"]');
        if (pause) press(pause);
        else if (typeof ACTIONS !== 'undefined' && typeof ACTIONS.mspeed === 'function') ACTIONS.mspeed({ dataset: { v: '0' } });
        say('⏸ Match paused');
      } else {
        say('The match is still on — carry on from the match controls');
      }
      return 'handled';
    }

    /* 3. the start screen and the career set-up have their own back */
    const start = doc.getElementById('startScreen');
    const onStart = start && start.style.display !== 'none' && visible(start);
    const scope = onStart ? start : doc.getElementById('app') || doc.body;
    const sub = firstVisible(scope, SUB_PAGE_BACK);
    if (sub && press(sub)) return 'handled';

    /* 4. any section other than Home goes Home */
    if (!onStart) {
      const view = typeof UI !== 'undefined' && UI ? UI.view : 'home';
      if (view && view !== 'home') {
        const homeTab = firstVisible(doc, '[data-action="nav"][data-v="home"]');
        if (homeTab) press(homeTab);
        else if (typeof ACTIONS !== 'undefined' && typeof ACTIONS.nav === 'function') ACTIONS.nav({ dataset: { v: 'home' } });
        return 'handled';
      }
    }

    /* 5. Home, or the start screen: twice to leave, and save on the way */
    const now = Date.now();
    if (now - lastBackAt > 2200) {
      lastBackAt = now;
      say('Press back again to leave the game', 2200);
      return 'handled';
    }
    lastBackAt = 0;
    flushSave();
    return 'exit';
  }

  win.AndroidShellBack = function androidShellBack() {
    try { return backOnce(); } catch (error) { return 'native'; }
  };

  /* =================================================================
     EXPORTING A SAVE FILE
     ================================================================= */
  const CHUNK = 256 * 1024;
  const blobs = new Map();
  const nativeCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function rememberBlob(object) {
    const url = nativeCreate(object);
    try {
      /* only what could be a download: never images or media drawn on screen */
      if (typeof Blob !== 'undefined' && object instanceof Blob && !/^(image|audio|video)\//.test(object.type)) {
        blobs.set(url, object);
        setTimeout(() => blobs.delete(url), 120000);
      }
    } catch (error) { /* remembering is best effort */ }
    return url;
  };

  /* Blob.text() arrived in Chrome 76; a phone whose WebView has not been
     updated since needs the older reader */
  function readText(blob) {
    if (typeof blob.text === 'function') return blob.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('could not read the save'));
      reader.readAsText(blob);
    });
  }

  let exporting = false;
  async function sendToPhone(blob, name) {
    if (exporting) { say('Already exporting — choose where to save it'); return; }
    exporting = true;
    /* the game says "exported" the moment it clicks; on a phone nothing is
       written until a place is chosen, so say that instead */
    setTimeout(() => say('📁 Preparing your save file — choose where to keep it'), 0);
    try {
      const text = await readText(blob);
      if (!bridge.exportBegin(name)) throw new Error('export could not start');
      for (let i = 0; i < text.length; i += CHUNK) {
        if (!bridge.exportChunk(text.slice(i, i + CHUNK))) throw new Error('export chunk refused');
        if (i && i % (CHUNK * 8) === 0) await new Promise((next) => setTimeout(next, 0));
      }
      if (!bridge.exportEnd(blob.type || 'application/json')) throw new Error('export could not finish');
    } catch (error) {
      say('⚠️ The save file could not be exported');
      try { if (win.RBSDiagnostics) win.RBSDiagnostics.report(error, 'android.export'); } catch (ignored) { /* none */ }
    } finally {
      exporting = false;
    }
  }

  function downloadOf(anchor) {
    if (!anchor || !anchor.hasAttribute || !anchor.hasAttribute('download')) return null;
    const href = anchor.href || '';
    const name = anchor.getAttribute('download') || 'results-business-save.json';
    if (href.indexOf('blob:') === 0 && blobs.has(href)) {
      const blob = blobs.get(href);
      blobs.delete(href);
      return { blob, name };
    }
    if (href.indexOf('data:') === 0) {
      const comma = href.indexOf(',');
      const meta = href.slice(5, comma);
      const body = href.slice(comma + 1);
      const text = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
      return { blob: new Blob([text], { type: meta.split(';')[0] || 'application/json' }), name };
    }
    return null;
  }

  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function clickToPhone() {
    let download = null;
    try { download = downloadOf(this); } catch (error) { download = null; }
    if (download) { sendToPhone(download.blob, download.name); return undefined; }
    return nativeClick.apply(this, arguments);
  };
  doc.addEventListener('click', (event) => {
    const anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;
    if (!anchor) return;
    let download = null;
    try { download = downloadOf(anchor); } catch (error) { download = null; }
    if (!download) return;
    event.preventDefault();
    sendToPhone(download.blob, download.name);
  }, true);

  on('export', (detail) => {
    if (detail && detail.cancelled) say('Export cancelled — nothing was written');
    else if (detail && detail.ok) say('💾 Save file written: ' + (detail.name || 'career backup'));
    else if (detail && detail.ok === false) say('⚠️ The save file could not be written');
  });

  /* =================================================================
     VOICE — Web Speech on top of Android text-to-speech
     ================================================================= */
  const utterances = new Map();
  let voiceList = [];
  let utteranceSeq = 0;
  const voiceListeners = [];

  const languageName = (tag) => {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) || tag; } catch (error) { return tag; }
  };

  function readVoices() {
    let raw = [];
    try { raw = JSON.parse(bridge.ttsVoices() || '[]') || []; } catch (error) { raw = []; }
    /* an online voice goes silent the moment the phone does, so it is only
       offered for a language with nothing on the device */
    const localLangs = new Set(raw.filter((v) => v.local).map((v) => String(v.lang).toLowerCase()));
    const usable = raw.filter((v) => v.local || !localLangs.has(String(v.lang).toLowerCase()));
    const counts = Object.create(null);
    voiceList = usable.map((v) => {
      const gender = v.gender === 'male' ? 'Male' : v.gender === 'female' ? 'Female' : 'Voice';
      const key = v.lang + gender;
      counts[key] = (counts[key] || 0) + 1;
      return Object.freeze({
        name: `Google ${languageName(v.lang)} ${gender} ${counts[key]}${v.local ? '' : ' (needs internet)'}`,
        lang: v.lang,
        voiceURI: v.name,
        localService: !!v.local,
        default: !!v.default,
      });
    });
    return voiceList;
  }

  function fire(target, type, extra) {
    const event = Object.assign({ type, target, utterance: target, charIndex: 0, elapsedTime: 0 }, extra || {});
    try { if (typeof target['on' + type] === 'function') target['on' + type](event); } catch (error) { /* page handler */ }
    (target._listeners && target._listeners[type] || []).slice().forEach((fn) => {
      try { fn(event); } catch (error) { /* page handler */ }
    });
  }

  class AndroidUtterance {
    constructor(text) {
      this.text = text == null ? '' : String(text);
      this.lang = '';
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onstart = null; this.onend = null; this.onerror = null;
      this.onpause = null; this.onresume = null; this.onboundary = null; this.onmark = null;
      this._listeners = Object.create(null);
    }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    removeEventListener(type, fn) {
      const list = this._listeners[type];
      if (list) this._listeners[type] = list.filter((x) => x !== fn);
    }
  }

  const speech = {
    onvoiceschanged: null,
    paused: false,
    get pending() { return utterances.size > 1; },
    get speaking() {
      try { return utterances.size > 0 || !!bridge.ttsSpeaking(); } catch (error) { return utterances.size > 0; }
    },
    getVoices() { return voiceList.length ? voiceList.slice() : readVoices().slice(); },
    speak(utterance) {
      if (!utterance) return;
      const id = 'rb' + (++utteranceSeq);
      utterances.set(id, utterance);
      const voice = utterance.voice;
      const ok = bridge.ttsSpeak(id, String(utterance.text || ''),
        String(utterance.lang || (voice && voice.lang) || 'en-GB'),
        voice && voice.voiceURI ? String(voice.voiceURI) : '',
        Number(utterance.rate) || 1, Number(utterance.pitch) || 1,
        utterance.volume == null ? 1 : Number(utterance.volume));
      if (!ok) {
        utterances.delete(id);
        setTimeout(() => fire(utterance, 'error', { error: 'synthesis-unavailable' }), 0);
      }
    },
    cancel() {
      try { bridge.ttsCancel(); } catch (error) { /* engine gone */ }
      /* the engine reports each flushed line itself; anything it has not
         reported within a moment is closed here so no handler waits forever */
      const left = Array.from(utterances.keys());
      setTimeout(() => left.forEach((id) => {
        const u = utterances.get(id);
        if (!u) return;
        utterances.delete(id);
        fire(u, 'error', { error: 'interrupted' });
      }), 400);
    },
    pause() {},
    resume() {},
    addEventListener(type, fn) { if (type === 'voiceschanged') voiceListeners.push(fn); },
    removeEventListener(type, fn) {
      const at = voiceListeners.indexOf(fn);
      if (type === 'voiceschanged' && at >= 0) voiceListeners.splice(at, 1);
    },
  };

  on('tts', (detail) => {
    if (detail.type === 'voiceschanged') {
      readVoices();
      try { if (typeof speech.onvoiceschanged === 'function') speech.onvoiceschanged({ type: 'voiceschanged' }); } catch (error) { /* page handler */ }
      voiceListeners.slice().forEach((fn) => { try { fn({ type: 'voiceschanged' }); } catch (error) { /* page handler */ } });
      return;
    }
    const u = utterances.get(detail.id);
    if (!u) return;
    if (detail.type === 'start') { fire(u, 'start'); return; }
    utterances.delete(detail.id);
    if (detail.type === 'end') fire(u, 'end');
    else fire(u, 'error', { error: 'interrupted' });
  });

  try {
    Object.defineProperty(win, 'speechSynthesis', { value: speech, configurable: true, writable: true });
    Object.defineProperty(win, 'SpeechSynthesisUtterance', { value: AndroidUtterance, configurable: true, writable: true });
  } catch (error) {
    try { if (win.RBSDiagnostics) win.RBSDiagnostics.report(error, 'android.speech'); } catch (ignored) { /* none */ }
  }

  /* =================================================================
     AWAY AND BACK
     ================================================================= */
  const contexts = new Set();
  const NativeAudio = win.AudioContext || win.webkitAudioContext;
  if (NativeAudio) {
    const Tracked = class extends NativeAudio {
      constructor(...args) { super(...args); contexts.add(this); }
    };
    win.AudioContext = Tracked;
    if (win.webkitAudioContext) win.webkitAudioContext = Tracked;
  }
  const silenced = new Set();

  function flushSave() {
    try {
      const saves = win.RBSSaves;
      if (saves && typeof saves.flushAutosave === 'function') return saves.flushAutosave();
    } catch (error) {
      try { if (win.RBSDiagnostics) win.RBSDiagnostics.report(error, 'android.save'); } catch (ignored) { /* none */ }
    }
    return false;
  }

  win.AndroidShellPause = function androidShellPause() {
    flushSave();
    try { speech.cancel(); } catch (error) { /* nothing speaking */ }
    contexts.forEach((ctx) => {
      if (ctx.state !== 'running' || typeof ctx.suspend !== 'function') return;
      silenced.add(ctx);
      Promise.resolve(ctx.suspend()).catch(() => {});
    });
  };

  win.AndroidShellResume = function androidShellResume() {
    silenced.forEach((ctx) => {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') Promise.resolve(ctx.resume()).catch(() => {});
    });
    silenced.clear();
  };

  /* =================================================================
     THE SCREEN STAYS ON FOR A MATCH
     ================================================================= */
  let awake = false;
  function watchMatch() {
    const screen = doc.getElementById('matchScreen');
    if (!screen || typeof MutationObserver !== 'function') return;
    const sync = () => {
      const on = screen.classList.contains('open');
      if (on === awake) return;
      awake = on;
      try { bridge.keepAwake(on); } catch (error) { /* not fatal */ }
    };
    new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watchMatch);
  else watchMatch();

  win.RBSAndroid = Object.freeze({
    info,
    back: () => win.AndroidShellBack(),
    voices: () => speech.getVoices(),
  });
})();
