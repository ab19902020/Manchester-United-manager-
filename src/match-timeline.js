/* global MatchSim */

/* =====================================================================
   ONE MATCH, ONE TIMELINE
   ---------------------------------------------------------------------
   "let's say I'm watching text now, and it says it's a corner. If I go
    to the dugout view, it should be a corner ready to be taken there."

   The save already plays a full match of football. Minute by minute it
   contests possession off your midfield, builds, creates a chance,
   works a corner when the chance breaks down, gives a free kick when
   somebody catches a man, and takes the shot. Everything the picture
   would need to show is decided in there.

   What it does with all of it is write a SENTENCE:

       this.say(this.dispMin(), A, cf(COMM.corner, {...}))

   Prose is perfect for the commentary column and useless to anything
   else. The stats screen has to keep its own counters, and the
   broadcast, which cannot read English, had no idea a corner had been
   given and so invented its own football alongside the save's. Three
   views, three accounts of one match.

   This module gives every beat a TYPED twin. It does not replace the
   commentary and it does not decide anything -- it records what the
   save just did, in a shape a machine can act on:

       {min: 34, at: '34', type: 'corner', team: 0, pid: null, ...}

   Nothing here is inferred from the text of a sentence. Each record is
   taken at the method that performs the event, from the arguments it
   was given and the state it changed, so a rewritten line of commentary
   cannot silently break the picture.

   WHY IT IS A WRAPPER AND NOT AN EDIT. MatchSim lives in the game file
   and this module never touches it. Every event worth recording happens
   inside a method on MatchSim.prototype which is handed the men it
   concerns -- foulEvent gets the offender, card gets the man booked,
   shotEvent gets the shooter -- so wrapping the method is enough, and
   there is no call site to keep in step.

   `MatchSim` is a class declaration at the top level of a classic
   script, which makes it a lexical global and NOT a property of window,
   exactly like `G`. The bare name reaches it; `window.MatchSim` does
   not. That distinction has cost me a probe run before now.
   ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var Sim = null;
  try { Sim = typeof MatchSim === 'function' ? MatchSim : null; } catch (e) { Sim = null; }
  if (!Sim || !Sim.prototype) return;

  var P = Sim.prototype;

  /* ---- the record ---------------------------------------------------- */

  function line(m, type, side, who, extra) {
    var home = m.sides && m.sides[0];
    var ev = {
      min: num(m.min, 0),
      at: typeof m.dispMin === 'function' ? m.dispMin() : String(num(m.min, 0)),
      type: type,
      /* WHICH HALF, because the clock is not monotonic across the
         interval and a bare minute cannot be ordered. A goal in first
         half stoppage is minute 47; the second half then restarts at 46.
         Anything sequencing this by minute alone puts them the wrong way
         round, so the half is carried and `seq` is the real order. */
      half: m.stage || null,
      team: side == null ? null : (side === home ? 0 : 1),
      pid: who && who.p ? String(who.p.id) : null,
      name: who && who.p ? who.p.name : null,
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
    return ev;
  }

  function push(m, type, side, who, extra) {
    if (!m.tl) { m.tl = []; m.tlCursor = 0; }
    var ev = line(m, type, side, who, extra);
    ev.seq = m.tl.length;
    m.tl.push(ev);
    return ev;
  }

  /* WHERE THE RECORD WOULD HAVE GONE, HELD UNTIL WE KNOW IT HAPPENED.

     A method being CALLED is not the same as its event happening. The
     game file wraps several of these to swallow the call outright --
     `shotEvent` and `penaltyEvent` both begin `if(this._cool>0)return;`
     so that one move cannot produce four shots in four seconds -- and
     this module's wrapper sits outside those, so it sees every call
     including the ones about to be thrown away. Recording on the way in
     put 28 shots in a match the stats screen counted 26 of.

     So the position is marked on the way in, the call is made, and the
     record is only slotted into that position if the match state moved.
     It has to be the position rather than the end of the list, or a
     goal would be filed ahead of the shot that scored it. */
  function mark(m) {
    if (!m.tl) { m.tl = []; m.tlCursor = 0; }
    return m.tl.length;
  }

  function insert(m, at, type, side, who, extra) {
    var ev = line(m, type, side, who, extra);
    m.tl.splice(at, 0, ev);
    for (var i = at; i < m.tl.length; i++) m.tl[i].seq = i;
    return ev;
  }

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  /* ---- wrapping ------------------------------------------------------ */

  /* Each of these is the ONE place its event happens, which is why the
     record can be taken here rather than at a dozen call sites. */

  function wrap(name, fn) {
    var pass = P[name];
    if (typeof pass !== 'function') return false;
    P[name] = function () { return fn.call(this, pass, arguments); };
    return true;
  }

  var wrapped = {};

  /* A CORNER. The save gives one when a chance breaks down off a
     defender, and again when a keeper pushes a shot behind. Both come
     through here. The taker and the man attacking it are chosen inside
     the method and are not ours to know, but the picture picks its
     eleven from the same squad, so it will find the same sort of man. */
  wrapped.corner = wrap('cornerEvent', function (pass, args) {
    push(this, 'corner', args[0], null, null);
    return pass.apply(this, args);
  });

  /* A FREE KICK, recorded for the side that WINS it rather than the one
     that gave it away -- that is the side who will be standing over the
     ball, which is what the picture has to stage. The offender is named
     because he is the one the referee talks to. */
  wrapped.foul = wrap('foulEvent', function (pass, args) {
    var D = args[0], dp = args[1], A = args[2], inBox = args[3];
    push(this, 'freekick', A, null, {
      byPid: dp && dp.p ? String(dp.p.id) : null,
      byName: dp && dp.p ? dp.p.name : null,
      inBox: !!inBox,
    });
    return pass.apply(this, args);
  });

  /* A PENALTY, subject to the same cooldown as a shot, and to VAR --
     which overturns one in eight before it is ever taken. Either way the
     spot kick that did not happen must not be handed to the picture. */
  wrapped.pen = wrap('penaltyEvent', function (pass, args) {
    var A = args[0];
    var sh = A.st.sh, at = mark(this);
    var out = pass.apply(this, args);
    if (A.st.sh !== sh) insert(this, at, 'penalty', A, null, null);
    return out;
  });

  /* A BOOKING and A SENDING OFF. `card` may itself call `sendOff` on a
     second yellow, and both records are wanted: the man was booked, and
     then he went. */
  wrapped.card = wrap('card', function (pass, args) {
    /* the second yellow is a red as well, and `sendOff` records that
       half of it from inside the same call */
    push(this, 'yellow', args[0], args[1], null);
    return pass.apply(this, args);
  });

  wrapped.red = wrap('sendOff', function (pass, args) {
    push(this, 'red', args[0], args[1], { straight: !!args[2] });
    return pass.apply(this, args);
  });

  /* A SHOT, AND WHAT BECAME OF IT. The outcome is decided inside the
     method, so it is read from what the method CHANGED rather than from
     the sentence it wrote: the score moving means it went in (and
     `goal` has already recorded it), a shot on target that did not
     score was saved, and anything else was off. State, not strings. */
  wrapped.shot = wrap('shotEvent', function (pass, args) {
    var A = args[0], D = args[1], shooter = args[2], fromCorner = args[4];
    var hs = this.fix.hs, as = this.fix.as;
    var sh = A.st.sh, sot = A.st.sot, sv = (D && D.st) ? D.st.sv : 0;
    var at = mark(this);
    var out = pass.apply(this, args);
    if (A.st.sh === sh) return out;      // swallowed by the shot cooldown
    insert(this, at, 'shot', A, shooter, { header: !!fromCorner });
    var scored = this.fix.hs !== hs || this.fix.as !== as;
    if (!scored) {
      var onTarget = A.st.sot > sot || (D && D.st && D.st.sv > sv);
      push(this, onTarget ? 'save' : 'miss', A, shooter, null);
    }
    return out;
  });

  /* A GOAL -- IF IT STOOD.

     Recorded after the fact, so the fixture already carries it and the
     record can name the score it produced. But "goal() was called" is
     not the same as "a goal was scored": the game file wraps this method
     to put it through VAR, and a disallowed goal RETURNS EARLY without
     ever reaching the scorer underneath. This module loads after the
     game, so its wrapper is the outermost one and sees the call VAR is
     about to throw out.

     So the score is what decides it, as with the shot. Without this the
     timeline showed 3 goals in a 2-goal match, which is exactly the
     disagreement between the views that the whole thing exists to
     prevent. */
  wrapped.goal = wrap('goal', function (pass, args) {
    var A = args[0], shooter = args[2], assister = args[4], pen = args[5];
    var hs = this.fix.hs, as = this.fix.as;
    var out = pass.apply(this, args);
    if (this.fix.hs === hs && this.fix.as === as) {
      push(this, 'disallowed', A, shooter, null);
      return out;
    }
    push(this, 'goal', A, shooter, {
      pen: !!pen,
      assistPid: assister && assister.p ? String(assister.p.id) : null,
      hs: this.fix.hs, as: this.fix.as,
    });
    return out;
  });

  /* THE SHOT THAT COMES THROUGH NEITHER DOOR.

     There is a third source of shots and it is not a method at all: a
     rare thirty-yard drive written straight into a `tickOnce` wrapper in
     the game file. It bumps the shot count and calls `goal` itself, so
     the goals agreed all along while the shots were seven short across
     eight matches -- the one that made this worth chasing rather than
     rounding off.

     It cannot be wrapped: it is an anonymous body inside a wrapper, with
     no method of its own. The obvious trick -- spying on `this.weighted`
     to catch the man it picks -- is unsafe here, because the game's own
     penalty-taker and corner-taker overrides install their own
     `this.weighted` and end with `delete this.weighted`, which would
     take this module's spy off the instance halfway through a tick.

     So the tick is compared against itself: whatever the shot counters
     moved by, minus the shots this module recorded, is a shot that came
     from somewhere else. It is recorded as one, from distance, WITHOUT
     A NAME -- the record does not know who hit it and does not pretend
     to. The picture picks a shooter for it from the same eleven. */
  wrapped.tick = wrap('tickOnce', function (pass, args) {
    var m = this;
    var s = m.sides;
    if (!s || !s[0] || !s[1] || !s[0].st || !s[1].st) return pass.apply(m, args);
    if (!m.tl) { m.tl = []; m.tlCursor = 0; }
    var before = [s[0].st.sh, s[1].st.sh];
    var at = m.tl.length;
    var out = pass.apply(m, args);

    var mine = [0, 0], firstGoal = [-1, -1];
    for (var i = at; i < m.tl.length; i++) {
      var e = m.tl[i];
      if (e.team == null) continue;
      if (e.type === 'shot' || e.type === 'penalty') mine[e.team]++;
      else if (e.type === 'goal' && firstGoal[e.team] < 0) firstGoal[e.team] = i;
    }
    for (var t = 0; t < 2; t++) {
      var surplus = (s[t].st.sh - before[t]) - mine[t];
      while (surplus-- > 0) {
        /* ahead of the goal it may have produced, or the picture would
           be told to celebrate before it is told to shoot */
        var slot = firstGoal[t] >= 0 ? firstGoal[t] : m.tl.length;
        insert(m, slot, 'shot', s[t], null, { long: true });
        if (firstGoal[t] >= 0) firstGoal[t]++;
      }
    }
    return out;
  });

  /* THE WHISTLES. Not events anybody scores, but the picture has to
     know a half has ended as surely as it has to know about a corner. */
  wrapped.finish = wrap('finish', function (pass, args) {
    push(this, 'fulltime', null, null, { hs: this.fix.hs, as: this.fix.as });
    return pass.apply(this, args);
  });

  /* ---- what the other views read ------------------------------------- */

  window.RBSMatchTimeline = {
    /* Everything that has happened so far. */
    of: function (m) { return (m && m.tl) || []; },

    /* Everything since you last asked. This is how the broadcast is fed:
       the save is ticked up to the picture's clock, and whatever it did
       in those minutes is handed over to be performed. */
    drain: function (m) {
      if (!m || !m.tl) return [];
      var from = num(m.tlCursor, 0);
      m.tlCursor = m.tl.length;
      return m.tl.slice(from);
    },

    /* Rewind the cursor so a view that has just been opened can catch
       up on the match it missed. */
    rewind: function (m, toMinute) {
      if (!m || !m.tl) return;
      if (toMinute == null) { m.tlCursor = 0; return; }
      var i = 0;
      while (i < m.tl.length && m.tl[i].min < toMinute) i++;
      m.tlCursor = i;
    },

    /* Which beats are wired up, for the tests and for anyone wondering
       why a type never appears. */
    wrapped: wrapped,
  };
})();
