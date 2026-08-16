/* global ACTIONS, toast, saveBlob */

/* =====================================================================
   THE CRAZYGAMES ADAPTER
   ---------------------------------------------------------------------
   "we need to add the SDK version as well for when I upload to
    crazygames"

   WHAT I COULD NOT DO, SAID FIRST. Their documentation is unreachable
   from this sandbox — docs.crazygames.com fails at CONNECT, as it did
   for Codex. Every name below comes from Codex's search notes, which he
   flagged as unverified, plus Agent One's one confirmed quotation. **No
   API name in this file has been checked against the real docs.**

   So it is written to be harmless when it is wrong. Every call is
   optional-chained and wrapped; a missing or renamed method disables
   that one feature and nothing else. With no `window.CrazyGames` at all
   — which is every offline PWA install and every local file — the game
   behaves exactly as it does now, and the tests prove that rather than
   assume it.

   ---------------------------------------------------------------------
   WHAT IT DOES

     init            once, during loading, before anything else
     loading         loadingStart/Stop around building a world
     gameplay        gameplayStart when a match kicks off, gameplayStop
                     when it ends and whenever a modal takes over — the
                     platform uses these to decide when an ad is not
                     rude
     data            every local save is mirrored to SDK.data, gzipped
                     and base64'd, and a fresh device with no local
                     career pulls it back

   ---------------------------------------------------------------------
   AND THE THING THAT IS STILL TRUE: THE SAVE DOES NOT FIT.

   Measured today through the game's own controller, one season played,
   with the world now keeping its full history: the stored save is
   10,073 kB against a 1,024 kB cap. Gzipping and base64ing it does not
   close a gap that size.

   This adapter therefore does NOT pretend. It compresses, measures, and
   if the result is over the cap it **keeps the local save, skips the
   cloud write, and says so once** rather than writing a truncated file
   or failing silently. When Agent One's packed encoder moves out of
   `scripts/` and into the save path, the same code starts succeeding
   with no change here — the cap check simply stops tripping.

   A player who never signs in loses nothing either way: the local save
   is untouched and authoritative.
   ===================================================================== */

(function crazyGames() {
  /* The script the platform serves. UNVERIFIED — if CrazyGames' upload
     instructions give a different URL, change this one constant. It is
     loaded lazily and its failure is ignored, so a wrong URL costs a
     404 in the console and nothing else. */
  const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
  const CAP = 1024 * 1024;
  const KEY = 'rbs-career';

  const state = {
    present: false,
    ready: false,
    playing: false,
    warned: false,
    lastWrite: null,
  };

  const sdk = () => {
    try { return window.CrazyGames && window.CrazyGames.SDK; } catch (error) { return null; }
  };

  /* every call goes through here, so one renamed method cannot take the
     game down with it */
  function call(path, ...args) {
    try {
      const root = sdk();
      if (!root) return undefined;
      let node = root;
      const bits = path.split('.');
      for (let i = 0; i < bits.length - 1; i += 1) {
        node = node[bits[i]];
        if (!node) return undefined;
      }
      const fn = node[bits[bits.length - 1]];
      if (typeof fn !== 'function') return undefined;
      return fn.apply(node, args);
    } catch (error) { return undefined; }
  }

  /* -------------------------------------------------------------------
     GZIP, BECAUSE A SAVE IS TEXT AND TEXT COMPRESSES
     ------------------------------------------------------------------- */
  const canZip = () => {
    try {
      return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
    } catch (error) { return false; }
  };

  /* GZIP IS OPTIONAL. JSDOM has no CompressionStream and neither does
     every browser we might meet, so a save that cannot be compressed is
     stored as it is and measured against the same cap — smaller is an
     optimisation, not a requirement. The prefix says which it is, so a
     reader never has to guess. */
  async function pack(text) {
    if (!canZip()) return 'raw:' + text;
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(text));
    writer.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    }
    return 'gz:' + btoa(binary);
  }

  async function unpack(stored) {
    const text = String(stored || '');
    if (text.slice(0, 4) === 'raw:') return text.slice(4);
    const b64 = text.slice(0, 3) === 'gz:' ? text.slice(3) : text;
    if (!canZip()) return null;
    const binary = atob(b64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) buf[i] = binary.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(buf);
    writer.close();
    return new Response(ds.readable).text();
  }

  /* -------------------------------------------------------------------
     THE CLOUD SAVE, WHICH REFUSES RATHER THAN LIES
     ------------------------------------------------------------------- */
  async function push(text) {
    if (!state.present) return { skipped: 'no sdk' };
    let body;
    try { body = await pack(text); } catch (error) { return { skipped: 'no gzip' }; }
    state.lastWrite = { raw: text.length, packed: body.length };
    if (body.length > CAP) {
      /* SAY IT ONCE. A save that silently does not reach the cloud is
         the worst outcome — the player finds out on another device. */
      if (!state.warned) {
        state.warned = true;
        try {
          toast('Career saved on this device. It is too large to sync yet.');
        } catch (error) { /* no toast yet */ }
      }
      return { skipped: 'over cap', packed: body.length, cap: CAP };
    }
    call('data.setItem', KEY, body);
    return { wrote: body.length };
  }

  async function pull() {
    if (!state.present) return null;
    const body = call('data.getItem', KEY);
    if (!body || typeof body !== 'string') return null;
    try { return await unpack(body); } catch (error) { return null; }
  }

  /* -------------------------------------------------------------------
     WIRING IT TO THE GAME
     ------------------------------------------------------------------- */
  function mirrorSaves() {
    const api = window.RBSSaves;
    if (!api || typeof api.save !== 'function') return;
    const previous = api.save;
    api.save = function saveAndSync(...args) {
      const result = previous.apply(this, args);
      try {
        if (state.present && typeof saveBlob === 'function') {
          Promise.resolve(result).then(() => push(saveBlob())).catch(() => {});
        }
      } catch (error) { /* the local save already happened */ }
      return result;
    };
  }

  /* a match is gameplay; a menu is not */
  function markGameplay() {
    try {
      if (ACTIONS && typeof ACTIONS.kickoff === 'function') {
        const previous = ACTIONS.kickoff;
        ACTIONS.kickoff = function kickoffMarked(...args) {
          if (!state.playing) { state.playing = true; call('game.gameplayStart'); }
          return previous.apply(this, args);
        };
      }
      if (ACTIONS && typeof ACTIONS.closeMatch === 'function') {
        const previous = ACTIONS.closeMatch;
        ACTIONS.closeMatch = function closeMatchMarked(...args) {
          if (state.playing) { state.playing = false; call('game.gameplayStop'); }
          return previous.apply(this, args);
        };
      }
    } catch (error) { /* the match still plays */ }
  }

  /* building a world is a load screen, and the platform wants to know */
  function markLoading() {
    try {
      if (typeof window.newGame === 'function') {
        const previous = window.newGame;
        window.newGame = function newGameMarked(...args) {
          call('game.loadingStart');
          try { return previous.apply(this, args); } finally { call('game.loadingStop'); }
        };
      }
    } catch (error) { /* the world still builds */ }
  }

  function attach() {
    state.present = !!sdk();
    if (!state.present) return false;
    try {
      const started = call('init');
      Promise.resolve(started).then(() => { state.ready = true; }).catch(() => {});
    } catch (error) { /* init is best effort */ }
    mirrorSaves();
    markGameplay();
    markLoading();
    return true;
  }

  /* Load the SDK only where it could possibly work: not on a file://
     page, not in a test harness, and never in a way that can delay or
     break the game if it 404s. */
  function boot() {
    if (attach()) return;
    try {
      if (!window.document || !window.location) return;
      /* ONLY WHERE IT COULD PLAUSIBLY BE. The first version gated on
         file:// alone, so the harness — and every offline PWA served
         over http or https from your own domain — reached out to a CDN
         it has no business calling. CrazyGames serves a game inside an
         iframe on their own host, so being framed or being on their
         domain is the signal. `window.RBS_FORCE_CG = true` forces it on
         for testing the integration before upload. */
      const framed = (() => {
        try { return window.self !== window.top; } catch (error) { return true; }
      })();
      const theirHost = /(^|\.)crazygames\.(com|co\.uk)$/i
        .test(String(window.location.hostname || ''));
      if (!framed && !theirHost && !window.RBS_FORCE_CG) return;
      if (String(window.location.protocol) === 'file:' && !window.RBS_FORCE_CG) return;
      if (document.getElementById('cg-sdk')) return;
      const tag = document.createElement('script');
      tag.id = 'cg-sdk';
      tag.src = SDK_URL;
      tag.async = true;
      tag.onload = () => { attach(); };
      tag.onerror = () => { /* not on CrazyGames, or offline: carry on */ };
      document.head.appendChild(tag);
    } catch (error) { /* no DOM */ }
  }

  try { boot(); } catch (error) { /* never fatal */ }

  try {
    window.RBSCrazyGames = Object.freeze({
      SDK_URL, CAP, KEY, state, pack, unpack, push, pull, attach, call, canZip,
      present: () => state.present,
    });
  } catch (error) { /* no window */ }
}());
