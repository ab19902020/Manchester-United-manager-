const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer, wait, waitFor } = require('./game-harness.cjs');

/*
 * src/android-shell.js against a stand-in for the Java bridge in
 * android/app/src/main/java/.../MainActivity.java: the same method names,
 * the same argument types, and events back through AndroidShellEvent.
 * scripts/check-android-shell.cjs drives the same thing in Chromium; this
 * keeps it under the suite that runs on every push.
 */
function fakeBridge(window) {
  const shell = { exports: [], awake: [], speaks: [], current: null };
  window.__shell = shell;
  window.AndroidShell = {
    info: () => JSON.stringify({ versionName: 'test', versionCode: 1, sdk: 35 }),
    exportBegin: (name) => { shell.current = { name, chunks: [] }; return true; },
    exportChunk: (chunk) => { shell.current.chunks.push(chunk); return true; },
    exportEnd: (mime) => { shell.current.mime = mime; shell.exports.push(shell.current); shell.current = null; return true; },
    keepAwake: (on) => { shell.awake.push(!!on); },
    leave: () => {},
    openExternal: () => {},
    ttsAvailable: () => true,
    ttsVoices: () => JSON.stringify([
      { name: 'en-gb-x-gba-local', lang: 'en-GB', local: true, gender: 'female', default: true },
      { name: 'en-gb-x-gbb-local', lang: 'en-GB', local: true, gender: 'male', default: false },
      { name: 'en-gb-x-rjs-network', lang: 'en-GB', local: false, gender: 'male', default: false },
    ]),
    ttsSpeak: (id, text, lang, voice) => {
      shell.speaks.push({ id, text, lang, voice });
      setTimeout(() => window.AndroidShellEvent('tts', { type: 'end', id }), 1);
      return true;
    },
    ttsCancel: () => {},
    ttsSpeaking: () => false,
  };
}

test('outside the app the shell does nothing at all', async () => {
  const game = await createGame();
  try {
    /* through JSON: an object made in the page's realm never deep-equals one made here */
    const result = JSON.parse(game.eval(`JSON.stringify({
      cls: document.documentElement.classList.contains('android-app'),
      back: typeof window.AndroidShellBack,
      api: typeof window.RBSAndroid,
    })`));
    assert.deepEqual(result, { cls: false, back: 'undefined', api: 'undefined' });
  } finally {
    game.close();
  }
});

test('in the app, back steps through the game and only leaves from Home', async () => {
  const game = await createGame({ beforeParse: fakeBridge });
  try {
    await startCareer(game, 'Back');
    const result = game.eval(`(function () {
      const out = {};
      out.cls = document.documentElement.classList.contains('android-app');
      ACTIONS.nav({ dataset: { v: 'squad' } });
      out.fromSection = AndroidShellBack();
      out.home = UI.view;
      const ps = G.clubs[G.my].players;
      openProfile(ps[0].id);
      openProfile(ps[1].id);
      out.stacked = !!document.querySelector('#modalHost.open [data-action="sheetBack"]');
      AndroidShellBack();
      out.afterOne = !!document.querySelector('#modalHost.open');
      AndroidShellBack();
      out.afterTwo = !!document.querySelector('#modalHost.open');
      out.first = AndroidShellBack();
      out.second = AndroidShellBack();
      return out;
    }())`);
    assert.equal(result.cls, true);
    assert.equal(result.fromSection, 'handled');
    assert.equal(result.home, 'home', 'back from a section goes Home');
    assert.equal(result.stacked, true, 'a second sheet stacks on the first');
    assert.equal(result.afterOne, true, 'one back returns to the first sheet');
    assert.equal(result.afterTwo, false, 'the next closes it');
    assert.equal(result.first, 'handled', 'Home asks before leaving');
    assert.equal(result.second, 'exit', 'and leaves on the second press');
  } finally {
    game.close();
  }
});

test('in the app, Export save file hands the whole career to Android', async () => {
  const game = await createGame({ beforeParse: fakeBridge });
  try {
    await startCareer(game, 'Export');
    game.eval('ACTIONS.exportSave()');
    await waitFor(() => game.eval('window.__shell.exports.length') > 0, { timeout: 60000, label: 'the export' });
    const result = game.eval(`(function () {
      const e = window.__shell.exports[0];
      const saved = JSON.parse(e.chunks.join(''));
      return { name: e.name, chunks: e.chunks.length, club: saved.clubs[saved.my].name, mine: G.clubs[G.my].name };
    }())`);
    assert.match(result.name, /\.json$/);
    assert.ok(result.chunks > 1, 'a career is far bigger than one bridge call');
    assert.equal(result.club, result.mine, 'and it reads back as the same career');
  } finally {
    game.close();
  }
});

test('in the app, the voice speaks through Android with a British man, and leaving saves', async () => {
  const game = await createGame({ beforeParse: fakeBridge });
  try {
    await startCareer(game, 'Voice');
    const voices = JSON.parse(game.eval('JSON.stringify(speechSynthesis.getVoices().map((v) => v.voiceURI))'));
    assert.deepEqual(voices.sort(), ['en-gb-x-gba-local', 'en-gb-x-gbb-local'],
      'an online-only voice is not offered when the phone has its own');

    game.eval(`(function () {
      const u = new SpeechSynthesisUtterance('Good afternoon.');
      u.voice = speechSynthesis.getVoices().filter((v) => /Male/.test(v.name))[0];
      speechSynthesis.speak(u);
    }())`);
    await waitFor(() => game.eval('window.__shell.speaks.length') > 0, { label: 'speech' });
    assert.equal(game.eval('window.__shell.speaks[0].voice'), 'en-gb-x-gbb-local');

    const before = (await game.window.RBSSaves.store.get('auto')).meta.savedAt;
    assert.ok(before > 0, 'the career-ready autosave carries its time');
    await wait(20);
    game.eval('AndroidShellPause()');
    await waitFor(async () => {
      const record = await game.window.RBSSaves.store.get('auto');
      return record && record.meta && record.meta.savedAt > before;
    }, { timeout: 30000, label: 'the autosave on leaving' });
    game.eval('AndroidShellResume()');
  } finally {
    game.close();
  }
});
