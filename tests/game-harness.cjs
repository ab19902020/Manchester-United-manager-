const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

const root = path.resolve(__dirname, '..');

function inlineScript(html, source, filename) {
  const tag = `<script src="${filename}"></script>`;
  return html.replace(tag, `<script>\n${source}\n</script>`);
}

function gameHtml() {
  let html = fs.readFileSync(path.join(root, 'red-devil-manager.html'), 'utf8');
  for (const filename of [
    'src/simulation-model.js',
    'src/lower-league-data.js',
    'src/lower-league-squads.js',
    'src/authentic-fixture-data.js',
    'src/authentic-fixtures.js',
    'src/career-store.js',
    'src/runtime-enhancements.js',
    'src/gameplay-balance.js',
    'src/economy.js',
    'src/press-room.js',
    'src/interactions.js',
    'src/prize-money.js',
    'src/playoffs.js',
    'src/tactics.js',
    'src/boardroom.js',
  ]) {
    html = inlineScript(html, fs.readFileSync(path.join(root, filename), 'utf8'), filename);
  }
  return html;
}

const noop = () => {};

function installBrowserStubs(window) {
  Object.defineProperty(window, 'indexedDB', { value: new IDBFactory(), configurable: true });
  window.scrollTo = noop;
  window.scrollBy = noop;
  window.Element.prototype.scrollIntoView = noop;
  window.matchMedia = (query) => ({
    matches: String(query).includes('pointer:coarse'),
    media: query,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
  });
  window.ResizeObserver = class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.IntersectionObserver = window.ResizeObserver;

  const canvasContext = new Proxy(
    {
      canvas: null,
      measureText: (text) => ({ width: String(text).length * 7 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    },
    {
      get: (target, key) => (key in target ? target[key] : noop),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    canvasContext.canvas = this;
    return canvasContext;
  };
  window.HTMLMediaElement.prototype.load = noop;
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = noop;

  window.AudioContext = window.webkitAudioContext = class AudioContextStub {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
      this.sampleRate = 44100;
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime: noop,
          linearRampToValueAtTime: noop,
          exponentialRampToValueAtTime: noop,
        },
        connect() { return this; },
        disconnect: noop,
      };
    }
    createOscillator() {
      return {
        frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop },
        connect() { return this; },
        disconnect: noop,
        start: noop,
        stop: noop,
      };
    }
    createBuffer(channels = 1, length = 2) {
      return {
        duration: length / 44100,
        length,
        numberOfChannels: channels,
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      return { connect() { return this; }, disconnect: noop, start: noop, stop: noop };
    }
    createBiquadFilter() {
      return { frequency: { value: 0 }, Q: { value: 0 }, connect() { return this; }, disconnect: noop };
    }
    createConvolver() { return { connect() { return this; }, disconnect: noop }; }
    createStereoPanner() {
      return { pan: { value: 0 }, connect() { return this; }, disconnect: noop };
    }
    decodeAudioData() { return Promise.reject(new Error('Audio decode disabled in tests.')); }
  };

  window.speechSynthesis = {
    cancel: noop,
    speak: noop,
    pause: noop,
    resume: noop,
    getVoices: () => [],
    addEventListener: noop,
  };
  window.SpeechSynthesisUtterance = class SpeechSynthesisUtteranceStub {
    constructor(text) { this.text = text; }
  };
  window.fetch = async () => { throw new Error('Network disabled in tests.'); };
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = noop;
  window.navigator.vibrate = noop;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Poll until something is true rather than sleeping for a guessed duration.
// A fixed sleep encodes how fast one machine happened to be: the instant-sim
// assertion below used to allow 120ms for a path that takes ~300ms in a real
// browser and ~1.5s under JSDOM, because buildMatchScreen() dominates it here.
// Waiting on the condition keeps the test honest about what it is checking and
// stops it failing on a slow CI runner.
async function waitFor(predicate, { timeout = 15000, interval = 25, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    let satisfied = false;
    try {
      satisfied = await predicate();
    } catch {
      satisfied = false;
    }
    if (satisfied) return true;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${label}.`);
    await wait(interval);
  }
}

async function createGame() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.stack || error.message));
  virtualConsole.on('error', (...args) => errors.push(`console.error ${args.join(' ')}`));

  const dom = new JSDOM(gameHtml(), {
    url: 'https://results-business.test/red-devil-manager.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse: installBrowserStubs,
  });
  await wait(1400);

  const { window } = dom;
  const { document } = window;
  if (window.RBSSaves) await window.RBSSaves.ready;

  return {
    dom,
    window,
    document,
    errors,
    eval(expression) { return window.eval(expression); },
    click(action, value) {
      const suffix = value === undefined ? '' : `[data-v="${value}"]`;
      const element = document.querySelector(`[data-action="${action}"]${suffix}`);
      if (!element) throw new Error(`Missing action: ${action}/${value === undefined ? '' : value}`);
      element.click();
      return element;
    },
    close() {
      try { if (window.RBSSaves) window.RBSSaves.store.close(); } catch (error) { /* ignore close errors */ }
      dom.window.close();
    },
  };
}

async function startCareer(game, name = 'Adam') {
  game.click('frontNew');
  await wait(100);
  game.click('startGame');
  await wait(160);
  const input = game.document.getElementById('mgrName');
  input.value = name;
  input.dispatchEvent(new game.window.Event('input', { bubbles: true }));
  game.click('mgrDone');
  await wait(1200);
  let automatic = null;
  for (let attempt = 0; attempt < 20 && !automatic; attempt += 1) {
    automatic = await game.window.RBSSaves.store.get('auto');
    if (!automatic) await wait(100);
  }
  if (!automatic) throw new Error('The career-ready autosave was not written.');
  return game;
}

module.exports = { createGame, startCareer, wait, waitFor };
