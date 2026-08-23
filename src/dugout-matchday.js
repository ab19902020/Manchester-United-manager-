/* global G, MU, ACTIONS, MatchSim, drawDugout:writable, buildMatchScreen,
   startLoop:writable, stopLoop, skipHalf:writable, trackedTick, onFT,
   renderTop, renderMCtl, renderStats, fillFeed, shirtNo, surname, clubForm */

/* =====================================================================
   THE DUGOUT IS NOW A TELEVISION FEED
   ---------------------------------------------------------------------
   "use it as a dugout view, remove everything from the dugout which is
    in there at the moment, add this in as our new view"

   `matchday.html` came out of the Gamefootball repository and is not a
   renderer — it is a whole match presented as a broadcast: mown turf, a
   stadium with a crowd, LED boards, an articulated player rig, a camera
   director, a radar and a score bug.

   It was written to be driven by this game, which is the only reason
   this file is short. Two of its own section headers say so:

       ATTRIBUTES AND SQUADS — the seam the manager game plugs into
       DIRECTED MATCHES — the manager game owns the result

   It reads the same nineteen attributes we store, on the same 1-20
   scale, under the same names, and it takes our slots, our formations
   and our mentalities verbatim. So there is no translation layer here
   worth the name: the squads go across almost as they sit in the save.

   ---------------------------------------------------------------------
   NOTHING IS DECIDED BEFORE YOU WATCH IT

   The first version of this file played the whole ninety out the moment
   you walked into the dugout, handed the goals to the picture as a
   script, and let it perform them. It worked, and it was wrong: the
   manager screen would sit on FULL TIME 0-3 while the broadcast was
   still goalless in the first half, because the save already knew and
   only the picture was still playing.

   So the authority is the other way round now.

       the broadcast plays  ->  the save follows it, minute by minute

   The picture decides the result out of the players you picked, and the
   save records what it did: the score, the scorer, the minute, the
   commentary, the ratings. Three seams do it — the clock is paced to
   the picture's minute, every goal comes through the one function that
   moves the score, and the whistle is the picture's to blow. There is
   more on each of them further down.

   ---------------------------------------------------------------------
   IT IS IN THIS DOCUMENT, NOT AN IFRAME

   It began in an iframe, for isolation — its ids against the game's. A
   browser will not let a file:// page reach into a frame it loaded from
   disk, so `contentWindow.Matchday` was unreachable, the dugout waited
   six seconds and quietly fell back to the old 2D view. That is what
   "it still shows me the old dugout view" was. The engine is inlined as
   src/matchday-engine.js with every rule of its stylesheet scoped under
   #mdHost, which buys the same isolation and works off the disk.
   ===================================================================== */

(function dugoutMatchday() {
  const FRAME_ID = 'mdFrame';

  /* HOW LONG THE FRAME GETS BEFORE WE GIVE UP ON IT.
     The first version waited for `contentWindow.Matchday` for ever, and
     "for ever" is a real state: a device with no WebGL loads the page,
     its renderer throws on construction, the script dies and the API is
     never defined. The dugout would then sit blank until you left it,
     with the tested 2D renderer sitting right there unused. Six seconds
     is far longer than a local file needs and short enough that nobody
     stares at nothing. */
  const PATIENCE = 6000;
  /* how far ahead of the broadcast the save is allowed to run, in match
     minutes, so a goal is known before the picture is asked to show it */
  const LEAD = 2;
  /* THE LATEST MINUTE A GOAL MAY BE POSTED FOR.
     This was 80, which showed a 90th-minute winner on the broadcast
     clock at 80' while the commentary read "90+2" — a ten-minute lie,
     and the only way to get late goals on screen at all while the
     engine's added time was time in which nobody played. With that
     fixed the picture can be told the truth: 90 leaves a stoppage-time
     goal falling due in stoppage, which is where it happened, and the
     engine now plays football there. */
  const LATE_CAP = 90;

  const state = {
    fixture: null,      /* the fixture the frame is currently showing   */
    started: false,
    failed: false,
    lastSpeed: 0,
    mountedAt: 0,
    full: false,        /* is the picture on the whole screen right now  */
    wantFull: false,    /* and does it want to be, when it can be        */
    guard: 0,           /* the timer that reconciles those two           */
    ftHooked: false,
  };

  const num = (v, d) => (Number.isFinite(+v) ? +v : d);

  /* THE ENGINE IS IN THIS DOCUMENT NOW. It used to live in an iframe,
     which meant a browser blocked us from reaching it on a file:// page
     and the dugout silently fell back to the old view. */
  function api() {
    try { return window.Matchday || null; } catch (error) { return null; }
  }

  /* -------------------------------------------------------------------
     THE SQUADS, WHICH ARE ALMOST A STRAIGHT COPY
     ------------------------------------------------------------------- */
  function shortName(player) {
    try {
      if (typeof surname === 'function') return surname(player.name);
    } catch (error) { /* fall through */ }
    const bits = String(player.name || '').split(' ');
    return bits[bits.length - 1] || String(player.name || '');
  }

  /* one player, in the shape the broadcast reads — used for the eleven
     at kick-off and for everyone who comes off the bench afterwards */
  function playerFor(pl, club) {
    const p = pl && pl.p;
    if (!p) return null;
    return {
      id: String(p.id),
      name: shortName(p),
      number: (typeof shirtNo === 'function') ? shirtNo(p, club) : 0,
      slot: pl.slot,
      heightCm: num(p.heightCm, 182),
      weightKg: num(p.weightKg, 76),
      /* the nineteen, as stored — no renaming, no rescaling */
      attrs: p.attrs || {},
      /* AND THE STATE HE IS ACTUALLY IN. Only the nineteen crossed
         before, so the picture had no idea whether a man was fresh or
         knackered, flying or in a rut. Ability is still what decides a
         match — these move it by a few per cent, the way they should. */
      morale: num(p.morale, 70),
      cond: num(p.cond, 100),
      sharp: num(p.sharp, 70),
    };
  }

  /* How the club is going, from its last six results: 1 is unbeaten and
     flying, 0 is a side that has lost four on the spin and knows it. */
  function momentumOf(side) {
    try {
      const form = (typeof clubForm === 'function') ? clubForm(side.ci) : null;
      if (!form || !form.length) return 0.5;
      let pts = 0;
      form.slice(-6).forEach((r) => { pts += r === 'W' ? 3 : r === 'D' ? 1 : 0; });
      return Math.max(0, Math.min(1, pts / (Math.min(6, form.length) * 3)));
    } catch (error) { return 0.5; }
  }

  function squadFor(side) {
    const club = side.c || (G.clubs || [])[side.ci] || {};
    const kit = {
      shirt: club.c1 || '#d21', trim: club.c2 || '#fff',
      shorts: club.c2 || '#fff', socks: club.c1 || '#d21',
    };
    const players = (side.onfield || []).map((pl) => playerFor(pl, club)).filter(Boolean);

    return {
      name: String(club.name || 'CLUB').toUpperCase(),
      abbr: club.short || club.abbr || 'CLB',
      shirt: kit.shirt, trim: kit.trim, shorts: kit.shorts, socks: kit.socks,
      momentum: momentumOf(side),
      formation: (side.tac && side.tac.formation) || '4-3-3',
      mentality: (side.tac && side.tac.mentality) || 'Balanced',
      players,
    };
  }

  /* -------------------------------------------------------------------
     THE PLAN — OUR RESULT, IN THE SHAPE IT ASKS FOR
     -------------------------------------------------------------------
     `fix.sc` is already {min, pid, name, ci, pen} for every goal, which
     is all `playScript` wants. `ci` is a club index, so it becomes 0 for
     the home side and 1 for the away side.
     ------------------------------------------------------------------- */
  function planFor(fixture, match) {
    const events = (fixture.sc || []).map((goal) => ({
      minute: num(goal.min, 1),
      team: goal.ci === fixture.h ? 0 : 1,
      pid: goal.pid != null ? String(goal.pid) : null,
      scorer: goal.name ? shortName({ name: goal.name }) : null,
      /* a penalty is struck, not headed; everything else the engine
         picks a finish for out of the situation it built */
      finish: goal.pen ? 'sidefoot' : null,
    })).sort((a, b) => a.minute - b.minute);

    const stats = (() => {
      try {
        const h = match.sides[0].st;
        const a = match.sides[1].st;
        const poss = match.poss || [1, 1];
        const total = (poss[0] + poss[1]) || 1;
        return {
          shots: [num(h.sh, 0), num(a.sh, 0)],
          onTarget: [num(h.sot, 0), num(a.sot, 0)],
          corners: [num(h.cor, 0), num(a.cor, 0)],
          possession: [
            Math.round(poss[0] / total * 100),
            Math.round(poss[1] / total * 100),
          ],
        };
      } catch (error) { return null; }
    })();

    return { events, stats };
  }

  /* PLAY IT OUT FIRST. The plan needs the whole match, and the same two
     lines simInstant() uses will finish the one already in progress. */
  function settle(match) {
    let guard = 0;
    while (!match.done && guard < 600) { match.tickOnce(); guard += 1; }
    if (!match.done) { try { match.finish(); } catch (error) { /* it stands */ } }
    return match.done;
  }

  /* =====================================================================
     THE PICTURE IS THE MATCH
     ---------------------------------------------------------------------
     "the actual visual of the new dugout is the only one which runs how
      the score line and everything. Nothing's prescripted. Everything is
      fed into that simulation, and then the score is figured out by that
      simulation. The rolling text and the pitch view and the stats view
      will only correlate with the game which is in the simulation."

     So the authority is inverted. It used to be:

         MatchSim plays 90 minutes instantly -> the picture performs it

     which is why the manager screen could read FULL TIME 0-3 while the
     broadcast was goalless in the first half. It is now:

         the broadcast plays -> the save follows it, minute by minute

     Three seams do all of it.

     1. PACE. MatchSim advances one minute per `tickOnce`, and it is
        ticked only as far as the minute on the broadcast clock. The
        commentary, the stats, the scoreline and the picture are then
        reading the same minute by construction, not by coincidence.

     2. GOALS. Every goal in this game goes through
        `MatchSim.prototype.goal`, which is the one place that moves the
        score, writes the scorer into the fixture, hands out ratings and
        morale, and says the line. In live mode a goal MatchSim invents
        for itself is turned into a chance that did not quite come off;
        a goal the broadcast scores is pushed through that same function.
        Nothing else in the game has to know where goals come from.

     3. THE WHISTLE. MatchSim is held one minute short of full time until
        the broadcast blows, so the save cannot finish the match before
        the picture does.

     Everything MatchSim is good at -- bookings, injuries, substitutions,
     fitness, ratings, the manager's own commentary voice -- carries on
     untouched. What it no longer does is decide the result.
     ===================================================================== */
  const LIVE = {
    want: true,        /* drive from the picture when there is a picture  */
    on: false,         /* and this is whether it is actually driving      */
    ended: false,
    posted: 0,         /* goals already handed to the picture             */
    xi: [null, null],  /* who was on the pitch a moment ago, by side       */
  };

  function bState() {
    const md = api();
    if (!md || typeof md.getState !== 'function') return null;
    try { return md.getState(); } catch (error) { return null; }
  }

  /* The HUD clock reads "23'", which is the number this needs. */
  function bMinute(st) {
    const s = st || bState();
    if (!s) return 0;
    const n = parseFloat(String(s.minute));
    return Number.isFinite(n) ? n : 0;
  }

  function liveStart(md, match, fixture) {
    LIVE.on = true; LIVE.ended = false; LIVE.xi = [null, null];
    LIVE.posted = 0;
    state.fixture = fixture;
    if (LIVE.hooked) return;
    LIVE.hooked = true;
    try {
      /* NO `goal` HANDLER. The broadcast fires one when it performs a
         goal, and that used to be what moved the score. Now it is the
         picture catching up with a goal the save has already scored, so
         there is nothing for the save to do about it. */
      md.on('fulltime', () => { LIVE.ended = true; drainToFullTime(); });
    } catch (error) { LIVE.hooked = false; }
    void match;
  }

  /* -------------------------------------------------------------------
     AND A SUBSTITUTION IN THE SAVE IS A SUBSTITUTION ON THE PITCH
     -------------------------------------------------------------------
     Changes are made in half a dozen places across the game — the sub
     sheet, a forced change for an injury, an AI manager chasing a
     goal — so rather than wrap all of them this watches the only thing
     they agree on: who is on the pitch. Anyone who was not there a
     moment ago and is now has come on, and the man he replaced went
     off. Same idea as the goal seam, and it cannot be routed around.
     ------------------------------------------------------------------- */
  function onPitch(side) {
    return (side.onfield || []).filter((x) => x && x.p && !x.off);
  }

  function syncSubs(match) {
    const md = api();
    if (!md || typeof md.substitute !== 'function') return;
    for (let t = 0; t < 2; t += 1) {
      const side = match.sides[t];
      if (!side) continue;
      const now = onPitch(side);
      const ids = now.map((x) => String(x.p.id));
      const was = LIVE.xi[t];
      if (!was) { LIVE.xi[t] = ids; continue; }
      const came = now.filter((x) => was.indexOf(String(x.p.id)) < 0);
      const went = was.filter((id) => ids.indexOf(id) < 0);
      LIVE.xi[t] = ids;
      if (!came.length) continue;
      const club = side.c || (G.clubs || [])[side.ci] || {};
      came.forEach((pl, i) => {
        try {
          md.substitute({ team: t, offPid: went[i] != null ? went[i] : null, on: playerFor(pl, club) });
        } catch (error) { /* the match carries on */ }
      });
    }
  }

  /* -------------------------------------------------------------------
     THE CLOCK, AND WHO IS ALLOWED TO MOVE IT
     ------------------------------------------------------------------- */
  function tickTo(match, target) {
    let ticks = 0;
    while (!match.done && match.min < target && ticks < 30) {
      if (match.stage === 'HT') match.tickOnce();
      else if (typeof trackedTick === 'function') trackedTick();
      else match.tickOnce();
      ticks += 1;
    }
    return ticks;
  }

  function repaint() {
    try {
      if (typeof renderTop === 'function') renderTop();
      if (typeof fillFeed !== 'function') return;
      if (MU.tab === 'comm') fillFeed(document.getElementById('commList'), 200);
      else if (MU.tab === 'stats') { if (typeof renderStats === 'function') renderStats(); }
      else fillFeed(document.getElementById('miniFeed'), 6);
    } catch (error) { /* the next tick paints it */ }
  }

  /* When the picture blows for full time the save catches up and stops.
     A cup tie still level after ninety is the one case the broadcast
     cannot show, so extra time is played out by MatchSim on its own --
     with live mode off, because from there it is the only match there
     is. */
  function drainToFullTime() {
    const match = MU && MU.m;
    if (!match || match.done) return;
    LIVE.on = false;
    let guard = 0;
    while (!match.done && guard < 400) {
      if (match.stage === 'HT') match.tickOnce(); else match.tickOnce();
      guard += 1;
    }
    if (!match.done) { try { match.finish(); } catch (error) { /* it stands */ } }
    repaint();
    try { if (typeof onFT === 'function') onFT(); } catch (error) { /* the screen still works */ }
  }

  /* -------------------------------------------------------------------
     MOUNTING
     ------------------------------------------------------------------- */
  function mount() {
    const canvas = document.getElementById('dugCanvas');
    const host = canvas ? canvas.parentElement : document.getElementById('mBody');
    if (!host) return null;
    if (canvas) canvas.style.display = 'none';

    let box = document.getElementById(FRAME_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = FRAME_ID;
      box.className = 'md-box';
      box.style.cssText = 'position:relative;width:100%;height:100%;min-height:200px;'
        + 'background:#03050d;overflow:hidden';
      host.appendChild(box);
      state.mountedAt = Date.now();
    }
    if (!window.RBSMatchday) return null;
    /* Building the scene is the expensive part and it happens once, but
       this still has to be called every time: leaving the dugout tab and
       coming back rewrites the tab's innerHTML, which detaches the whole
       stadium. `mount` re-parents the scene it already built, so the way
       back in is the same call as the way in. */
    if (!window.RBSMatchday.mount(box)) {
      /* A DEVICE WITH NO WebGL NEVER GETS PAST HERE, so this is where it
         has to be noticed. `drive()` is the only other place that looks,
         and it is never reached while the mount is failing — which is
         why a no-WebGL match used to stand still for twelve seconds
         before the 2D renderer was handed it back. */
      if (window.RBSMatchday.unavailable()) state.failed = true;
      return null;
    }
    return box;
  }

  function drive() {
    const md = api();
    if (!md) {
      /* it has had long enough; hand the tab back to the 2D renderer
         rather than leave a blank rectangle over the match */
      const waiting = !!(window.RBSMatchday && window.RBSMatchday.waiting());
      const gone = !!(window.RBSMatchday && window.RBSMatchday.unavailable());
      if (gone) state.failed = true;
      else if (!waiting && state.mountedAt && Date.now() - state.mountedAt > PATIENCE) {
        state.failed = true;
      }
      return false;
    }
    const match = MU && MU.m;
    const fixture = MU && MU.fix;
    if (!match || !fixture) return false;

    try {
      md.loadSquads({ home: squadFor(match.sides[0]), away: squadFor(match.sides[1]) });
      /* THE SCRIPT IS ARMED EMPTY, AND THAT IS THE IMPORTANT PART.
         An active script with no events owed refuses every goal: the
         broadcast can build an attack, get a shot away and hit the
         target, and it becomes a save or the woodwork. That is what
         stops the picture inventing a scoreline of its own between one
         save goal and the next. Each goal MatchSim scores is posted in
         as it happens, and the picture then owes it and manufactures it
         out of real play.

         What it must not do is play the ninety minutes out first. That
         is why the manager screen once sat on FULL TIME 0-3 over a
         goalless first half -- the save already knew the whole result
         and only the picture was still playing. The save runs a couple
         of minutes ahead of the broadcast, and no further. */
      if (LIVE.want) {
        md.playScript({ events: [], stats: null });
        liveStart(md, match, fixture);
      } else {
        if (!settle(match)) return false;
        md.playScript(planFor(fixture, match));
      }
      md.setHalfLength(150);
      md.setSpeed(num(MU.speed, 1) || 1);
      md.start();
      state.started = true;
      /* THE MATCH IS ON, SO THE MATCH GETS THE SCREEN. Not the tab, not
         a strip between a header and a nav bar — the picture fills the
         phone the moment the broadcast is actually running, and the bar
         underneath is the way back out. */
      watchGuard();
      state.wantFull = true;
      setFull(true);
      hookFullTime(md);
      state.fixture = fixture;
      return true;
    } catch (error) {
      state.failed = true;
      return false;
    }
  }

  /* -------------------------------------------------------------------
     THE DUGOUT TAB, EVERY FRAME
     -------------------------------------------------------------------
     `drawDugout` is what the match loop calls while the dugout is the
     open tab, and every layer in this game wraps it — so it is the one
     reliable place to stand. The frame runs its own animation loop, so
     there is nothing to draw here: this only has to get it mounted, get
     it started, and keep the speed in step.
     ------------------------------------------------------------------- */
  if (typeof drawDugout === 'function') {
    const previous = drawDugout;
    drawDugout = function drawBroadcastDugout() {
      try {
        if (!MU || !MU.m || !MU.fix) return previous.apply(this, arguments);

        /* A NEW FIXTURE REUSES THE SCENE. Building the stadium is the
           expensive part and it does not change between matches, so a
           new match reloads the squads and the plan rather than tearing
           the whole thing down and paying for it again. */
        if (state.fixture && state.fixture !== MU.fix) {
          state.fixture = null; state.started = false; state.failed = false;
        }

        if (state.failed) return previous.apply(this, arguments);

        const f = mount();
        if (!f) return previous.apply(this, arguments);

        if (!state.started) {
          drive();
          /* while it is coming up, and for good if it never does, the
             2D renderer keeps drawing underneath */
          return previous.apply(this, arguments);
        }

        syncSpeed();
        return undefined;
      } catch (error) {
        state.failed = true;
        return previous.apply(this, arguments);
      }
    };
  }

  /* -------------------------------------------------------------------
     THE SPEED CONTROLS DRIVE THE PICTURE
     -------------------------------------------------------------------
     The match controls are 1x, 2x, 4x, highlights and skip. The engine
     knows 1, 2 and 4 and takes a pause. Highlights becomes 4x, because
     the broadcast already drops to real time for a goal and its replay,
     which is what highlights was for. Skip is not a speed at all and is
     handled where it is pressed.
     ------------------------------------------------------------------- */
  function syncSpeed() {
    const md = api();
    if (!md) return;
    const chosen = num(MU && MU.speed, 1);
    const want = (chosen === 0) ? 0 : (chosen === 2 ? 2 : (chosen >= 4 ? 4 : 1));
    if (want === state.lastSpeed) return;
    state.lastSpeed = want;
    try {
      if (want === 0) { if (typeof md.pause === 'function') md.pause(); return; }
      if (typeof md.resume === 'function') md.resume();
      md.setSpeed(want);
    } catch (error) { /* it keeps the speed it had */ }
  }

  /* =====================================================================
     THE MATCH LOOP, IN LIVE MODE
     ---------------------------------------------------------------------
     `startLoop` runs a 90ms interval that advances MatchSim by the wall
     clock. In live mode the wall clock is the wrong master: the picture
     is. This replaces the rule that decides when a minute passes and
     changes nothing else -- if the broadcast never comes up, or the
     device has no WebGL, the original loop is handed the match back and
     the game behaves exactly as it did.
     ===================================================================== */
  function liveDriving() {
    return !!(LIVE.want && LIVE.on && state.started && !state.failed && api());
  }

  if (typeof startLoop === 'function' && typeof stopLoop === 'function') {
    const passLoop = startLoop;
    startLoop = function startLoopLive() {
      if (!LIVE.want) return passLoop.apply(this, arguments);
      stopLoop();
      /* NOT RESET HERE. A watchdog elsewhere restarts the loop whenever
         the minute has not moved for six seconds, which a picture that
         is still warming up will trip — and if this were the deadline
         for giving up on the picture, that watchdog would keep pushing
         it back for ever. It is stamped once per match, at kick-off. */
      if (!LIVE.began) LIVE.began = Date.now();
      MU.timer = setInterval(pace, 90);
      return undefined;
    };

    function pace() {
      const match = MU && MU.m;
      if (!match) return;
      if (match.done) { try { onFT(); } catch (error) { /* ignore */ } return; }

      /* THE PICTURE MAY NEVER ARRIVE. No WebGL, a context that dies on
         construction, or a manager who kicked off and went straight to
         the team sheet: none of those should leave a match standing
         still at 0'. The original loop gets it back. */
      if (!liveDriving()) {
        const late = LIVE.began && Date.now() - LIVE.began > PATIENCE * 2;
        if (state.failed || late) {
          LIVE.want = false; LIVE.on = false;
          /* AND THIS MATCH IS THE 2D RENDERER'S NOW.
             Without this the dugout would still take the broadcast if
             you walked into it later — down the non-live path, which
             plays the whole ninety out at once and hands the picture a
             script. The save would jump to full time while the
             broadcast kicked off at 0-0, which is the exact fault this
             whole change exists to remove. Whatever the match is being
             played on when it starts, it stays on. */
          state.failed = true;
          stopLoop();
          passLoop.call(null);
        }
        return;
      }

      syncSpeed();
      if (num(MU.speed, 1) === 0) return;

      const st = bState();
      if (!st || !st.running) return;

      /* one minute short of the whistle: the save is not allowed to
         finish the match before the picture does */
      const ceiling = Math.max(0, num(match.ftAt, 90) - (LIVE.ended ? 0 : 1));
      /* A COUPLE OF MINUTES AHEAD, ON PURPOSE. The save has to score a
         goal before the broadcast can be asked to show it, so if the
         save were held exactly level with the picture every goal would
         arrive already overdue and the engine would have to force it --
         at worst with the spot kick it keeps for that. Two minutes of
         lead, about seven seconds at normal speed, is enough for the
         picture to build the goal out of real play and arrive with it
         roughly on time. The ceiling still holds the save short of the
         whistle, so this never becomes "the save has finished and the
         picture has not". */
      const target = Math.min(bMinute(st) + LEAD, ceiling);
      const ticks = tickTo(match, target);
      /* THE PICTURE IS TOLD WHAT THE SAVE JUST DID. Not inside
         `if (ticks)`: a goal posted a moment ago may still be unowed if
         the broadcast was mid-restart when it went in. */
      postGoals(api(), MU && MU.fix);
      /* not inside `if (ticks)`: a change can be made at any moment, and
         on a slow device whole seconds pass between two match minutes */
      syncSubs(match);
      if (ticks) repaint();
      if (match.stage === 'HT' && !MU._htPainted) {
        MU._htPainted = true;
        try { renderMCtl(); } catch (error) { /* ignore */ }
      }
      if (match.done) { try { onFT(); } catch (error) { /* ignore */ } }
    }

    /* SKIPPING IS LEAVING. There is no picture to disagree with once you
       have skipped it, so the broadcast stops and MatchSim plays the
       rest out on its own. */
    if (typeof skipHalf === 'function') {
      const passSkip = skipHalf;
      skipHalf = function skipPastTheBroadcast() {
        if (!liveDriving()) return passSkip.apply(this, arguments);
        LIVE.on = false; LIVE.want = false;
        try { const md = api(); if (md && typeof md.pause === 'function') md.pause(); } catch (error) { /* ignore */ }
        stopLoop();
        return passSkip.apply(this, arguments);
      };
    }
  }

  /* =====================================================================
     THE SAVE DECIDES, THE PICTURE PERFORMS
     ---------------------------------------------------------------------
     "it should be decided by the same way a game is done if I was
      watching it in pitch mode or in rolling text or simulated it"

     There is no wrapper on MatchSim.prototype.goal any more. It used to
     carry the opposite arrangement -- a goal MatchSim scored for itself
     became a chance that did not quite come off, and the goals that
     counted were the ones the broadcast scored -- and that made the
     Dugout a different game from the other three views. Watching a
     match in the Dugout could give a different result from simulating
     the same match, and none of the season measurements could see it,
     because all of them go through quickSim.

     So MatchSim scores its own goals here exactly as it does in Pitch,
     Commentary and Stats mode, and exactly as it does when the whole
     league plays itself. The broadcast is handed each goal as it is
     scored (see `postGoals`) and manufactures it out of real play: the
     named man pushed forward, his appetite up, the keeper's hands down.
     Anything the broadcast would have scored on its own becomes a save
     or the woodwork, because an armed script refuses every goal it is
     not owed.

     The one thing lost is that the picture can no longer surprise the
     save. That was the point of the old arrangement and it is the thing
     that had to go: a view of a match cannot also be the match.
     ===================================================================== */

  /* Every goal the save has already handed to the broadcast, so the same
     one is never posted twice. */
  function postGoals(md, fixture) {
    const sc = (fixture && fixture.sc) || [];
    if (sc.length <= LIVE.posted) return;
    for (let i = LIVE.posted; i < sc.length; i += 1) {
      const goal = sc[i];
      try {
        md.addGoal({
          /* `min` is what the commentary shows, so it can read "45+2"
             and parseFloat gives the 45. The cap is the important part.
             MatchSim plays to a full time of its own — 90 plus two to
             five — while the broadcast's clock reaches 90 and then a
             short stoppage of its own, so a goal the save records in
             added time has nowhere on the picture's clock to land and
             is simply never shown. Measured across twelve matches, that
             was every goal the picture failed to deliver and nothing
             else: 90, 85, 88, 87, 87. Capped a little short of the
             whistle, a stoppage-time winner falls due while there is
             still football left to score it in, and the engine's own
             urgency -- and its spot kick, if open play will not oblige
             -- has room to work. The cap is 90 rather than the 80 it
             needed before the engine played football in added time, so
             a stoppage-time winner is shown in stoppage time. */
          minute: Math.min(LATE_CAP, num(parseFloat(String(goal.min)), 0)),
          team: goal.ci === fixture.h ? 0 : 1,
          pid: goal.pid != null ? String(goal.pid) : null,
          scorer: goal.name ? shortName({ name: goal.name }) : null,
          finish: goal.pen ? 'sidefoot' : null,
        });
      } catch (error) { /* the save still has it; only the picture misses */ }
    }
    LIVE.posted = sc.length;
  }

  /* -------------------------------------------------------------------
     FULL SCREEN, AND THE WAY BACK OUT
     -------------------------------------------------------------------
     "the full screen I meant was when it's in match and our new video
      view will go full screen, so the whole match can be seen properly"

     So while the match is being watched the broadcast fills the screen,
     with one bar under it carrying the way out and the way to your
     tactics. Everything else about managing the match stays where it
     was; this only decides how much of the screen the picture gets, and
     it only ever gets the screen while there is a match on it.
     ------------------------------------------------------------------- */
  const FULL_CSS = [
    '#mdFrame.md-full{position:fixed;inset:0;width:100vw;height:100vh;z-index:900;',
    ' border-radius:0;padding-bottom:env(safe-area-inset-bottom)}',
    '#mdBar{position:fixed;left:0;right:0;bottom:0;z-index:901;display:none;',
    ' gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));',
    ' background:linear-gradient(180deg,rgba(3,5,13,0),rgba(3,5,13,.92) 38%)}',
    '#mdFrame.md-full ~ #mdBar,#mdBar.on{display:flex;justify-content:center}',
    '#mdBar button{flex:0 1 190px;font:800 12px/1 var(--disp,system-ui);',
    ' letter-spacing:1px;text-transform:uppercase;padding:11px 14px;border-radius:11px;',
    ' border:1px solid rgba(255,255,255,.18);background:rgba(12,18,28,.86);color:#eef3ee}',
    '#mdBar button.gold{background:linear-gradient(180deg,#f7dc55,#d9b81a);color:#1a1503;',
    ' border-color:rgba(0,0,0,.25)}',
    /* THE SCREEN IS FOR THE MATCH. In landscape the game chrome is a
       header, a nav bar and a tab strip, which between them eat about a
       third of a short viewport - so while the broadcast is full screen
       they go. */
    'body.md-watching #hdr,body.md-watching #nav,body.md-watching .mtabs{display:none!important}',
  ].join('');

  function styleOnce() {
    if (document.getElementById('mdFullStyle')) return;
    const st = document.createElement('style');
    st.id = 'mdFullStyle';
    st.textContent = FULL_CSS;
    document.head.appendChild(st);
  }

  function bar() {
    let b = document.getElementById('mdBar');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'mdBar';
    b.innerHTML = '<button data-action="mdExit">\u2715 Leave full screen</button>'
      + '<button class="gold" data-action="mdTactics">\u26BD Tactics</button>';
    document.body.appendChild(b);
    return b;
  }

  /* -------------------------------------------------------------------
     ONE CONDITION, CHECKED EVERYWHERE
     -------------------------------------------------------------------
     The first version turned this on and left it on. Full screen hides
     the header, the nav and the tab strip and pins a bar across the
     bottom of the window — so when the match screen closed, the bar
     stayed, sitting over the home screen with LEAVE FULL SCREEN on it
     and no match anywhere in sight.

     Full screen is not a mode you enter, then. It is a fact about right
     now: a match screen that is open, on the dugout tab, with the
     broadcast actually running in it. The moment any of that stops being
     true the screen goes back to being the game's.
     ------------------------------------------------------------------- */
  function watching() {
    try {
      if (!document.querySelector('#matchScreen.open')) return false;
      if (!MU || !MU.m || MU.tab !== 'dugout') return false;
      if (state.failed || !state.started) return false;
      const box = document.getElementById(FRAME_ID);
      return !!(box && box.parentNode && document.body.contains(box));
    } catch (error) { return false; }
  }

  /* WHY A TIMER AND NOT AN EVENT. The match screen is closed from about
     a dozen places across fifty-seven thousand lines — full time, the
     back arrow, a cup shootout, an international handing the club back —
     and wrapping every one of them is how you miss the thirteenth. A
     quarter-second check costs nothing and cannot be routed around.

     It reconciles in both directions, because coming back to the dugout
     tab rebuilds the tab's contents and the scene is only re-attached on
     the next frame — so "go full screen now" has to mean "as soon as
     there is something to show", not "this instant or never". */
  function watchGuard() {
    if (state.guard) return;
    state.guard = setInterval(() => {
      try {
        if (state.full && !watching()) setFull(false);
        else if (!state.full && state.wantFull && watching()) setFull(true);
      } catch (error) { /* next tick */ }
    }, 250);
  }

  /* full time in the picture is full time on the screen: the game's own
     controls are behind this, and that is where you need to be */
  function hookFullTime(md) {
    if (state.ftHooked || !md || typeof md.on !== 'function') return;
    state.ftHooked = true;
    try {
      md.on('fulltime', () => {
        try { state.wantFull = false; setFull(false); } catch (error) { /* ignore */ }
      });
    } catch (error) { state.ftHooked = false; }
  }

  function setFull(on) {
    styleOnce();
    /* asking for it is not enough — it has to be true that a match is
       being watched, or the bar ends up over the wrong screen again */
    const want = !!on && watching();
    /* THE TEARDOWN CANNOT DEPEND ON THE FRAME BEING THERE. Switching
       tabs rewrites the tab body, which destroys the frame — so an
       early return here left the bar on screen and the game's header
       hidden with no match anywhere, which is the whole bug. The two
       things that are not in the tab body get put back regardless. */
    const box = document.getElementById(FRAME_ID);
    if (box) {
      box.classList.toggle('md-full', want);
      /* AND IT HAS TO BE WRITTEN INLINE. The frame carries an inline
         `position:relative` from the moment it is built, and an inline
         style beats a stylesheet rule — so the class alone left the
         picture sitting in its 554px box with `md-full` on it and
         nothing to show for it. */
      const s = box.style;
      s.position = want ? 'fixed' : 'relative';
      s.top = s.left = s.right = s.bottom = want ? '0' : '';
      s.width = want ? '100vw' : '100%';
      s.height = want ? '100vh' : '100%';
      s.zIndex = want ? '900' : '';
      s.borderRadius = want ? '0' : '';
    }
    bar().classList.toggle('on', want);
    document.body.classList.toggle('md-watching', want);
    state.full = want;
    /* the canvas has a new size to fill */
    try { if (window.RBSMatchday) window.RBSMatchday.resize(); } catch (error) { /* ignore */ }
  }

  try {
    ACTIONS.mdFull = function () { state.wantFull = true; setFull(true); };
    ACTIONS.mdExit = function () { state.wantFull = false; setFull(false); };
    /* out of the picture and straight onto the tactics screen — the
       match keeps running behind it, which is the point of coming out */
    ACTIONS.mdTactics = function () {
      state.wantFull = false;
      setFull(false);
      try { ACTIONS.mtab({ dataset: { v: 'tactics' } }); } catch (error) {
        try { ACTIONS.nav({ dataset: { v: 'tactics' } }); } catch (e2) { /* stay put */ }
      }
    };
  } catch (error) { /* the match still plays */ }

  /* THE MATCH OPENS ON THE MATCH. Kick-off has always landed on the 2D
     pitch tab, which was right when the dugout was a second-best
     cartoon and is wrong now that it is the broadcast: you kicked off
     and had to go and find the football. It opens where the match is,
     and the other tabs are still one tap away. */
  try {
    const passKick = ACTIONS.kickoff;
    if (typeof passKick === 'function') {
      ACTIONS.kickoff = function kickoffIntoTheBroadcast() {
        /* every match starts out expecting to be watched, whatever the
           last one had to fall back to */
        LIVE.want = true; LIVE.on = false; LIVE.ended = false; LIVE.posted = 0;
        LIVE.began = 0; LIVE.xi = [null, null];
        state.started = false; state.failed = false; state.lastSpeed = -1;
        const out = passKick.apply(this, arguments);
        try {
          if (!state.failed && MU && MU.tab !== 'dugout') {
            MU.tab = 'dugout';
            if (typeof buildMatchScreen === 'function') buildMatchScreen();
          }
        } catch (error) { /* the match is on either way */ }
        return out;
      };
    }
  } catch (error) { /* the match still plays */ }

  /* LEAVING THE DUGOUT TAB TAKES THE SCREEN BACK, COMING BACK GIVES IT
     UP AGAIN. Tactics, the commentary and the stats are ordinary screens
     and want their header and their tabs; the dugout is the match. */
  try {
    const passTab = ACTIONS.mtab;
    if (typeof passTab === 'function') {
      ACTIONS.mtab = function mtabFullScreen() {
        const out = passTab.apply(this, arguments);
        /* AND THE LIT CHIP FOLLOWS THE TAB. It never has: the strip is
           written by buildMatchScreen and switching tabs only rewrites
           the body, so the highlight stayed wherever kick-off left it —
           on Pitch before this, on Dugout after it. Measured in the
           browser both ways before touching it. */
        try {
          const strip = document.querySelector('#matchScreen .mtabs');
          if (strip && MU) {
            strip.querySelectorAll('[data-action="mtab"]').forEach((chip) => {
              chip.classList.toggle('on', chip.dataset.v === MU.tab);
            });
          }
        } catch (error) { /* the tab still changed */ }
        try {
          if (MU && MU.tab === 'dugout' && state.started && !state.failed) {
            /* the scene is re-attached on the next frame, so this asks
               and the guard delivers */
            state.wantFull = true;
          } else if (state.full) setFull(false);
        } catch (error) { /* the tab still changed */ }
        return out;
      };
    }
  } catch (error) { /* the match still plays */ }

  try {
    window.RBSDugoutMatchday = Object.freeze({
      setFull, watching, watchGuard,
      squadFor, planFor, settle, api, FRAME_ID, state,
      LIVE, postGoals, bMinute, liveDriving,
    });
  } catch (error) { /* no window */ }
}());
