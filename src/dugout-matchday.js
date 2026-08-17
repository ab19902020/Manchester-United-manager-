/* global G, MU, ACTIONS, drawDugout:writable, buildMatchScreen, shirtNo, surname */

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

  /* HOW LONG THE FRAME GETS BEFORE WE GIVE UP ON IT.
     The first version waited for `contentWindow.Matchday` for ever, and
     "for ever" is a real state: a device with no WebGL loads the page,
     its renderer throws on construction, the script dies and the API is
     never defined. The dugout would then sit blank until you left it,
     with the tested 2D renderer sitting right there unused. Six seconds
     is far longer than a local file needs and short enough that nobody
     stares at nothing. */
  const PATIENCE = 6000;

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
    if (!window.RBSMatchday.mount(box)) return null;
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

    if (!settle(match)) return false;

    try {
      md.loadSquads({ home: squadFor(match.sides[0]), away: squadFor(match.sides[1]) });
      md.playScript(planFor(fixture, match));
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
    });
  } catch (error) { /* no window */ }
}());
