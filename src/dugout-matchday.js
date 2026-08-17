/* global G, MU, ACTIONS, drawDugout:writable, FORMATIONS, shirtNo, surname, toast */

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
   WHY THE MATCH IS DECIDED BEFORE YOU WATCH IT

   Left to itself that engine plays its own game and hands you its own
   score, which would disagree with the one the league table records —
   the single worst thing a match view can do. So it does not decide.
   `playScript` takes the goals OUR engine recorded, with the minute and
   the named scorer, and enforces them at the goal line: anything else
   that crosses becomes a save or the woodwork, and when a goal falls
   due the named scorer is pushed forward so it arrives out of real
   build-up rather than being teleported in.

   That means the ninety minutes are simulated the moment you walk into
   the dugout, and then performed. You still watch a whole match, with
   the speed and the cameras in your hands — but the score on the screen
   is the score in your save, to the goal and the scorer, and it cannot
   drift.

   ---------------------------------------------------------------------
   WHY AN IFRAME AND NOT AN INLINE SCRIPT

   It is a complete document with its own stylesheet and its own ids —
   `#scene`, `#hud`, `#menu`. This game is fifty-seven thousand lines
   with ids of its own. Pasting one into the other invites a collision
   that would show up as something subtly wrong on an unrelated screen
   weeks later. An iframe is total isolation for the price of one
   element, its own file is cached by the service worker, and its
   author's own instructions offer it first: "Drop this file into an
   iframe (or paste the script inline)".

   Same origin, so we hold `contentWindow.Matchday` directly — no
   message passing, no serialisation.
   ===================================================================== */

(function dugoutMatchday() {
  const FRAME_ID = 'mdFrame';
  const SRC = 'matchday.html';

  const state = {
    fixture: null,      /* the fixture the frame is currently showing   */
    started: false,
    failed: false,
    lastSpeed: 0,
  };

  const num = (v, d) => (Number.isFinite(+v) ? +v : d);

  function frame() {
    return document.getElementById(FRAME_ID);
  }

  /* the API lives inside the frame; it is only there once it has loaded */
  function api() {
    try {
      const f = frame();
      return (f && f.contentWindow && f.contentWindow.Matchday) || null;
    } catch (error) { return null; }
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

  function squadFor(side) {
    const club = side.c || (G.clubs || [])[side.ci] || {};
    const kit = {
      shirt: club.c1 || '#d21', trim: club.c2 || '#fff',
      shorts: club.c2 || '#fff', socks: club.c1 || '#d21',
    };
    const players = (side.onfield || []).map((pl) => {
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
      };
    }).filter(Boolean);

    return {
      name: String(club.name || 'CLUB').toUpperCase(),
      abbr: club.short || club.abbr || 'CLB',
      shirt: kit.shirt, trim: kit.trim, shorts: kit.shorts, socks: kit.socks,
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

  /* -------------------------------------------------------------------
     MOUNTING
     ------------------------------------------------------------------- */
  function mount() {
    const canvas = document.getElementById('dugCanvas');
    const host = canvas ? canvas.parentElement : document.getElementById('mBody');
    if (!host) return null;
    if (canvas) canvas.style.display = 'none';

    let f = frame();
    if (!f) {
      f = document.createElement('iframe');
      f.id = FRAME_ID;
      f.src = SRC;
      f.setAttribute('title', 'Live match broadcast');
      f.setAttribute('scrolling', 'no');
      f.style.cssText = 'display:block;width:100%;height:100%;min-height:200px;'
        + 'border:0;background:#03050d';
      host.appendChild(f);
    }
    return f;
  }

  function drive() {
    const md = api();
    if (!md) return false;
    const match = MU && MU.m;
    const fixture = MU && MU.fix;
    if (!match || !fixture) return false;

    if (!settle(match)) return false;

    try {
      md.loadSquads({ home: squadFor(match.sides[0]), away: squadFor(match.sides[1]) });
      md.playScript(planFor(fixture, match));
      md.setHalfLength(150);
      md.setSpeed(num(MU.speed, 1) || 1);
      md.start();
      state.started = true;
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

        /* a new fixture means a new broadcast */
        if (state.fixture && state.fixture !== MU.fix) {
          const old = frame();
          if (old && old.parentElement) old.parentElement.removeChild(old);
          state.fixture = null; state.started = false; state.failed = false;
        }

        if (state.failed) return previous.apply(this, arguments);

        const f = mount();
        if (!f) return previous.apply(this, arguments);

        if (!state.started) { drive(); return undefined; }

        /* keep the broadcast at the speed the match controls are set to */
        const want = num(MU.speed, 1) || 1;
        if (want !== state.lastSpeed) {
          const md = api();
          if (md) { try { md.setSpeed(want); } catch (error) { /* keeps its own */ } }
          state.lastSpeed = want;
        }
        return undefined;
      } catch (error) {
        state.failed = true;
        return previous.apply(this, arguments);
      }
    };
  }

  try {
    window.RBSDugoutMatchday = Object.freeze({
      squadFor, planFor, settle, api, FRAME_ID, SRC, state,
    });
  } catch (error) { /* no window */ }
}());
