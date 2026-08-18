/* global RBSMatchday */

/* =====================================================================
   ONE MATCH, ONE SOUNDTRACK
   ---------------------------------------------------------------------
   "the old dugout view is still playing underneath — all the sound
    effects, all the flashes, I can hear it doing things in the
    background while I'm watching the new version"

   It was. The old RENDERER does stand down: `drawDugout` returns without
   drawing once the broadcast has started. What never stood down was the
   old PRESENTATION, which does not live in the renderer at all — it
   hangs off `MatchSim` in the page and fires on the simulation's own
   events, whoever happens to own the screen:

       sfx('whistle'); crowdLevel()          half-time
       sfx('whistle'); sfx('kick')           the second half
       sfx('whistle'); crowdStart()          kick-off
       sfx('card'); flashScreen('yc')        a booking
       sfx('card'); flashScreen('rc')        a sending off

   The broadcast has a crowd, a referee's whistle and a camera of its
   own, so all of it arrived twice — once from the picture you are
   watching and once from the game underneath it, a beat apart and out of
   step, with the screen flashing for cards the broadcast was already
   showing you.

   So while the broadcast owns the screen, the old match presentation is
   silent. Only the MATCH sounds are held: taps, mail chimes and anything
   else the interface makes still play, because the complaint is about a
   second commentary track, not about the game going quiet.
   ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var W = window;

  /* The broadcast is up when its canvas is mounted and actually being
     displayed. Asking the DOM rather than asking the module means this
     cannot drift out of step with a state flag somewhere else. */
  function broadcastLive() {
    try {
      if (!W.RBSMatchday) return false;
      if (typeof RBSMatchday.unavailable === 'function' && RBSMatchday.unavailable()) return false;
      var scene = document.getElementById('scene');
      if (!scene) return false;
      /* offsetParent is null for a detached or hidden element — and null
         in JSDOM for everything, which is why the tests keep the old
         behaviour and nothing here changes what they assert. */
      return scene.offsetParent !== null;
    } catch (e) { return false; }
  }

  /* Only the sounds the broadcast is already making. Everything else the
     interface plays is left alone. */
  /* Every sound the match itself makes. The first pass at this held
     seven of them and missed six, which is why a tackle could still be
     heard over the broadcast: the list was written from the lines I had
     read rather than from every `sfx(` in the page. It is now the full
     set, taken from the source.

     Deliberately NOT held: nav, ok, open, close, tap, swap, cash and the
     rest of the interface. Those are the game talking to you, not a
     second commentary on the match. */
  var DOUBLED = {
    whistle: 1, kick: 1, card: 1, goal: 1, crowd: 1, post: 1, save: 1,
    tackle: 1, strike: 1, miss: 1, ooh: 1, cheer: 1, fullTime: 1, paStab: 1,
  };

  var _sfx = W.sfx;
  if (typeof _sfx === 'function') {
    W.sfx = function (name) {
      if (DOUBLED[name] && broadcastLive()) return undefined;
      return _sfx.apply(this, arguments);
    };
  }

  /* The screen flash is the old view's way of telling you about a card.
     The broadcast cuts to it instead, so the flash is a second telling. */
  var _flash = W.flashScreen;
  if (typeof _flash === 'function') {
    W.flashScreen = function () {
      if (broadcastLive()) return undefined;
      return _flash.apply(this, arguments);
    };
  }

  /* The old crowd bed. Starting or swelling it under the broadcast's own
     crowd is the layer you can hear; stopping it is always allowed,
     because a crowd left running is the thing we are trying to kill. */
  ['crowdStart', 'crowdLevel', 'crowdSwell'].forEach(function (name) {
    var f = W[name];
    if (typeof f !== 'function') return;
    W[name] = function () {
      if (broadcastLive()) return undefined;
      return f.apply(this, arguments);
    };
  });

  W.RBSOneSoundtrack = { live: broadcastLive, held: DOUBLED };
})();
