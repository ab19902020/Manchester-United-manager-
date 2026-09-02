const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

const root = path.resolve(__dirname, '..');

/* THE FILE BEING INLINED IS DATA, NOT A REPLACEMENT PATTERN.
   With a string replacement, String.replace interprets `$&`, `` $` ``,
   `$'` and `$$` inside it -- so a module containing `$&` (a perfectly
   ordinary thing to write in a .replace call) had the matched
   `<script src=...>` tag spliced into its own source at inline time.
   The script then threw, the module silently never loaded, and every
   test went on passing against a game that was missing it. A replacer
   FUNCTION is passed the match and returns the text verbatim. */
function inlineScript(html, source, filename) {
  const tag = `<script src="${filename}"></script>`;
  return html.replace(tag, () => `<script>\n${source}\n</script>`);
}

function gameHtml() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
    'src/attributes.js',
    'src/injuries.js',
    'src/growth.js',
    'src/mailbox.js',
    'src/player-links.js',
    'src/lineup.js',
    'src/boardroom.js',
    'src/match-ratings.js',
    'src/contract-score.js',
    'src/squad-identity.js',
    'src/dugout-drama.js',
    'src/ui-shell.js',
    'src/delegation.js',
    'src/analytics.js',
    'src/story.js',
    'src/name-clash.js',
    'src/tactics-token.js',
    'src/mailbox-pro.js',
    'src/press-questions.js',
    'src/press-voice.js',
    'src/transfer-structure.js',
    'src/face-polish.js',
    'src/layout-repair.js',
    'src/cup-calendar.js',
    'src/trophy-room.js',
    'src/world-seed.js',
    'src/one-job.js',
    'src/one-soundtrack.js',
    'src/front-door.js',
    'src/transfer-search.js',
    'src/keep-history.js',
    'src/match-timeline.js',
    'src/stadium-costs.js',
    'src/golden-boot.js',
    'src/layout-polish.js',
    'src/results-round.js',
    'src/pitch-spotlight.js',
    'src/match-view.js',
    'src/form-and-momentum.js',
    'src/true-potential.js',
    'src/chip-gutters.js',
    'src/surnames.js',
    'src/manager-background.js',
    'src/player-identity.js',
    'src/offside-trap.js',
    'src/visual-upgrade.js',
    'src/crazygames.js',
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
    url: 'https://results-business.test/index.html',
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

/* AN OPTIONAL SEED, BECAUSE SOME OF THESE TESTS ASK ABOUT THE WORLD.
 *
 * Career creation is random, so a test that looks at what the world came
 * out like is a different test every run. That is right for most of them
 * -- a squad check that only passes on one world is not much of a check
 * -- and wrong for any test chasing a fault that appears in some worlds
 * and not others. tests/squad-identity.test.cjs failed once in a full
 * run and then passed ten times in isolation, and the reason it could
 * not be reproduced is here rather than in the code it was testing.
 *
 * It works through the machinery src/world-seed.js already has rather
 * than adding any. `newGame` draws its world seed from `Math.random`
 * before it replaces it, so pinning the stream for the duration of
 * career creation pins which world gets built -- and the stream is put
 * back afterwards, so the football is as random as it ever was.
 */
async function startCareer(game, name = 'Adam', options = {}) {
  const seed = options.seed;
  const realRandom = game.window.Math.random;
  if (seed != null) {
    game.window.Math.random = game.window.RBSWorldSeed.mulberry32(seed >>> 0);
  }
  try {
    return await runCareerFlow(game, name);
  } finally {
    if (seed != null) game.window.Math.random = realRandom;
  }
}

async function runCareerFlow(game, name) {
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
