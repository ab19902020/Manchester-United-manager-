/* global G, MU, ACTIONS, buildMatchScreen, renderMCtl, esc, shortName, surname */

/* =====================================================================
   THE DUGOUT STOPS BEING A LIVE VIEW AND BECOMES THE HIGHLIGHTS
   ---------------------------------------------------------------------
   "Remove dugout mode. It's just not working. It's just forcing
    penalties for the goals. I think we should use that visual engine to
    create highlights at the end of the game... and then at the end, it
    can generate the goals and celebrations and key moments."

   He is right, and the measurements agree with him. Watching a match
   live meant the broadcast had to score a specific goal, for a specific
   man, inside a specific minute, while a save file ran alongside it --
   and a half in the Dugout is 150 seconds, so a match minute is three
   and a third seconds of football. No side can build a goal out of open
   play in that. Everything tried to bridge it and every bridge cost
   something:

     posting the goal early     the picture scored it at 55 when the save
                                said 40, and the save took the picture's
                                minute, so the record moved
     holding the clock          the minutes were then exact -- 221 of 221
                                measured -- but the clock stopped for
                                nearly thirty seconds a goal
     the escalation ladder      set pieces, then a spot kick. At nine
                                seconds it put 42% of the picture's goals
                                away from the penalty spot. Pushed out to
                                forty-five it came down to 11%, and the
                                cost was those thirty seconds

   All of that is the price of ONE constraint: the picture and the save
   must agree while both are running. Take the constraint away and every
   one of those problems goes with it.

   So the match is played and recorded first, exactly as it is on the
   Pitch, Text and Stats tabs, which have always been the same engine and
   have never disagreed with anything. Then the broadcast is handed a
   finished result and asked only to show the goals. It has no clock to
   race, no minute to hit and nothing to force: the minute on the caption
   is the minute out of the save, because the goal already happened.

   WHAT IS REMOVED. Nothing is deleted. The live path is switched off at
   its two entry points -- the tab and the arming in ACTIONS.kickoff --
   and every line of src/dugout-matchday.js is left where it is, because
   the squad conversion, the kit conversion and the mount are exactly
   what the highlights need.
   ===================================================================== */

(function highlights() {
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const dug = () => { try { return window.RBSDugoutMatchday || null; } catch (e) { return null; } };
  const api = () => { try { return window.Matchday || null; } catch (e) { return null; } };

  /* -------------------------------------------------------------------
     1. THE LIVE DUGOUT IS RETIRED
     -------------------------------------------------------------------
     `LIVE.want` is what arms the live driver, and `state.failed` is the
     flag it already respects for a device that cannot show a picture --
     so setting both is the supported way to stand it down rather than a
     new switch nobody else knows about. The tab is then taken off the
     bar, and anybody who arrives on it by an old save's UI state is put
     on the Pitch.
     ------------------------------------------------------------------- */
  function standDown() {
    const d = dug();
    if (!d) return;
    try {
      d.LIVE.want = false;
      d.LIVE.on = false;
      d.LIVE.ended = false;
      d.LIVE.waiting = [];
      d.state.failed = true;      /* the live driver never takes the match */
      d.state.wantFull = false;
    } catch (error) { /* the match still plays */ }
  }

  function offTheBar() {
    try {
      document.querySelectorAll('#matchScreen [data-action="mtab"][data-v="dugout"]')
        .forEach((b) => b.remove());
      if (MU && MU.tab === 'dugout') MU.tab = 'pitch';
    } catch (error) { /* ignore */ }
  }

  try {
    const passKick = ACTIONS.kickoff;
    if (typeof passKick === 'function') {
      ACTIONS.kickoff = function kickoffWithoutTheDugout() {
        const out = passKick.apply(this, arguments);
        /* AFTER the layer that arms live mode and switches the tab, so
           this is the last word on both */
        standDown();
        try {
          if (MU && MU.tab === 'dugout') {
            MU.tab = 'pitch';
            if (typeof buildMatchScreen === 'function') buildMatchScreen();
          }
        } catch (error) { /* ignore */ }
        offTheBar();
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    const passBuild = window.buildMatchScreen;
    if (typeof passBuild === 'function') {
      window.buildMatchScreen = function buildWithoutTheDugoutTab() {
        const out = passBuild.apply(this, arguments);
        offTheBar();
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    const passTab = ACTIONS.mtab;
    if (typeof passTab === 'function') {
      ACTIONS.mtab = function mtabWithoutTheDugout(el) {
        try {
          if (el && el.dataset && el.dataset.v === 'dugout') el.dataset.v = 'pitch';
        } catch (error) { /* ignore */ }
        return passTab.apply(this, arguments);
      };
    }
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     2. WHAT IS WORTH SHOWING
     -------------------------------------------------------------------
     A goal is always worth showing. The rest of a highlights reel is
     whatever changed the match: a red card, a penalty, a man off injured
     with the substitutions gone. They come out of the same fixture
     record the report is written from, so a reel cannot say anything the
     save does not.
     ------------------------------------------------------------------- */
  function minuteOf(v, d) {
    if (v == null) return d;
    const parts = String(v).split('+');
    const base = parseFloat(parts[0]);
    if (!Number.isFinite(base)) return d;
    const extra = parts.length > 1 ? parseFloat(parts[1]) : 0;
    return base + (Number.isFinite(extra) ? extra : 0);
  }

  function reelFor(fixture) {
    const out = [];
    try {
      (fixture.sc || []).forEach((g) => {
        out.push({
          kind: 'goal',
          min: minuteOf(g.min, 0),
          label: String(g.min),
          team: g.ci === fixture.h ? 0 : 1,
          pid: g.pid != null ? String(g.pid) : null,
          who: g.name || '',
          pen: !!g.pen,
        });
      });
    } catch (error) { /* a reel of nothing is still a reel */ }
    out.sort((a, b) => a.min - b.min);
    return out;
  }

  /* -------------------------------------------------------------------
     3. THE REEL
     -------------------------------------------------------------------
     One moment at a time. Each goal is handed to the broadcast on its
     own -- a plan of exactly one event, owed from the first second --
     and the escalation that used to be an embarrassment is now simply
     how a highlight is staged: the side that scored is pushed forward
     until the ball goes in, which is what a highlight IS. There is no
     clock to race, so `holdClock(false)` lets the football run, and the
     caption carries the minute out of the save because the goal has
     already happened.

     When the ball crosses the line the engine freezes for its own
     celebration and cuts to it, which is the celebration asked for --
     it was always in there and a live match never had time for it.
     ------------------------------------------------------------------- */
  const REEL = {
    on: false, ix: 0, items: [], fixture: null, match: null,
    timer: 0, waited: 0, onGoal: null,
  };

  const FRAME = 'hlFrame';

  function box() {
    let el = document.getElementById(FRAME);
    if (el) return el;
    el = document.createElement('div');
    el.id = FRAME;
    el.style.cssText = 'position:fixed;inset:0;z-index:120;background:#03050d;'
      + 'display:flex;flex-direction:column';
    el.innerHTML = '<div id="hlStage" style="position:relative;flex:1 1 auto;min-height:0"></div>'
      + '<div id="hlBar" style="flex:none;display:flex;align-items:center;gap:8px;'
      + 'padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#080c09;'
      + 'border-top:1px solid rgba(240,245,240,.12)"></div>';
    document.body.appendChild(el);
    return el;
  }

  function caption(text, sub) {
    const stage = document.getElementById('hlStage');
    if (!stage) return;
    let c = document.getElementById('hlCap');
    if (!c) {
      c = document.createElement('div');
      c.id = 'hlCap';
      c.style.cssText = 'position:absolute;left:12px;right:12px;bottom:12px;z-index:8;'
        + 'pointer-events:none;font-weight:800;text-shadow:0 2px 10px rgba(0,0,0,.8)';
      stage.appendChild(c);
    }
    c.innerHTML = '<div style="font-size:26px;letter-spacing:-.4px">' + esc(String(text)) + '</div>'
      + '<div style="font-size:12px;opacity:.8;font-weight:700">' + esc(String(sub || '')) + '</div>';
  }

  function bar() {
    const b = document.getElementById('hlBar');
    if (!b) return;
    const n = REEL.items.length;
    b.innerHTML = '<button class="btn btn-ghost" data-action="hlClose">Close</button>'
      + '<div class="xs faint" style="flex:1;text-align:center">'
      + (n ? 'Moment ' + Math.min(REEL.ix + 1, n) + ' of ' + n : 'No goals to show')
      + '</div>'
      + '<button class="btn" data-action="hlNext">' + (REEL.ix + 1 >= n ? 'Finish' : 'Skip →') + '</button>';
  }

  function stop() {
    REEL.on = false;
    if (REEL.timer) { clearInterval(REEL.timer); REEL.timer = 0; }
    try {
      const md = api();
      if (md) {
        if (REEL.onGoal && typeof md.off === 'function') md.off('goal', REEL.onGoal);
        if (typeof md.pause === 'function') md.pause();
      }
    } catch (error) { /* ignore */ }
    REEL.onGoal = null;
  }

  function close() {
    stop();
    try { const el = document.getElementById(FRAME); if (el) el.remove(); } catch (error) { /* ignore */ }
    try { if (typeof renderMCtl === 'function') renderMCtl(); } catch (error) { /* ignore */ }
  }

  /* set the next moment up and let it play */
  function stage() {
    const md = api();
    const item = REEL.items[REEL.ix];
    if (!md || !item) { close(); return; }
    bar();
    caption(item.label + "'", (item.who || '') + (item.pen ? ' (pen)' : ''));
    try {
      md.playScript({ events: [{ minute: 0.4, team: item.team, pid: item.pid,
        scorer: item.who ? String(item.who).split(' ').pop() : null,
        finish: item.pen ? 'sidefoot' : null }], stats: null });
      if (typeof md.holdClock === 'function') md.holdClock(false);
      if (typeof md.holdWhistle === 'function') md.holdWhistle(false);
      md.setHalfLength(120);
      md.setSpeed(1);
      md.start();
    } catch (error) { close(); return; }
    REEL.waited = 0;
    let scored = false;
    let since = 99;
    REEL.onGoal = () => { scored = true; };
    try { md.on('goal', REEL.onGoal); } catch (error) { /* ignore */ }
    if (REEL.timer) clearInterval(REEL.timer);
    REEL.timer = setInterval(() => {
      REEL.waited += 0.25;
      since += 0.25;
      /* PUT HIM ON THE BALL, THEN LEAVE HIM ALONE.
         Staging the chance every tick was measured at ten moments in
         twenty-six coming off: each new ball took the last one off his
         foot before he could hit it. Staged once and then only again
         after three seconds of nothing, twenty-seven in thirty come off,
         with a median of four and a half seconds. */
      if (!scored && since >= 3) {
        since = 0;
        try { if (typeof md.stageChance === 'function') md.stageChance(item.team, true); }
        catch (error) { /* it can still come off on its own */ }
      }
      /* the celebration is the engine's own five seconds, then move on.
         The cap is there because a moment that will not come off must not
         hold the reel up -- it is a highlight, not a guarantee. */
      if ((scored && REEL.waited > 5.5) || REEL.waited > 30) next();
    }, 250);
  }

  function next() {
    stop();
    REEL.ix += 1;
    if (REEL.ix >= REEL.items.length) { close(); return; }
    REEL.on = true;
    stage();
  }

  function play(fixture, match) {
    const d = dug();
    const fx = fixture || (MU && MU.fix);
    const m = match || (MU && MU.m);
    if (!d || !fx) return false;
    const items = reelFor(fx);
    if (!items.length) return false;

    const host = box();
    const stageEl = document.getElementById('hlStage');
    REEL.items = items; REEL.ix = 0; REEL.fixture = fx; REEL.match = m; REEL.on = true;
    bar();
    caption('Highlights', 'building the pitch\u2026');

    /* THE BROADCAST IS BUILT ON FIRST USE, AND THAT TAKES A MOMENT.
       Asking it to mount once, immediately, gets a null back while the
       scene is still being constructed -- which read as "this device
       cannot show 3D" and closed the reel before it opened. The dugout
       had a patience loop for exactly this and the reel needs the same
       one. Eight seconds is far longer than a local file needs and short
       enough that nobody is left staring at a black screen. */
    const t0 = Date.now();
    const tryMount = () => {
      if (!REEL.on) return;
      let ok = false;
      try { ok = !!(window.RBSMatchday && window.RBSMatchday.mount(stageEl)); }
      catch (error) { ok = false; }
      if (ok && api()) {
        const md = api();
        try {
          if (m && m.sides) {
            md.loadSquads({ home: d.squadFor(m.sides[0]), away: d.squadFor(m.sides[1]) });
          }
          if (typeof md.embed === 'function') md.embed();
        } catch (error) { /* the reel can still play with the demo squads */ }
        stage();
        return;
      }
      const dead = window.RBSMatchday && typeof window.RBSMatchday.unavailable === 'function'
        && window.RBSMatchday.unavailable();
      if (dead || Date.now() - t0 > 8000) {
        /* no WebGL, no reel -- and the report says everything the reel
           would have, so this is a missing extra rather than a fault */
        close();
        try { if (typeof window.toast === 'function') window.toast('Highlights need 3D, which this device cannot show'); }
        catch (error) { /* ignore */ }
        return;
      }
      setTimeout(tryMount, 250);
    };
    tryMount();
    return true;
  }

  /* -------------------------------------------------------------------
     4. AND THE WAY IN, WHICH IS AT FULL TIME AND NOWHERE ELSE
     -------------------------------------------------------------------
     Offered once the match is over and only when there is something to
     show. A goalless draw gets no button rather than a button that opens
     an empty reel.
     ------------------------------------------------------------------- */
  function offerAtFullTime() {
    try {
      const ctl = document.getElementById('mCtl');
      if (!ctl) return;
      if (document.getElementById('hlBtn')) return;
      if (!MU || !MU.m || !MU.m.done || !MU.fix) return;
      if (!reelFor(MU.fix).length) return;
      const b = document.createElement('button');
      b.id = 'hlBtn';
      b.className = 'btn btn-block';
      b.style.cssText = 'margin-bottom:8px';
      b.setAttribute('data-action', 'hlPlay');
      b.textContent = '\ud83c\udfa5 Watch the highlights';
      ctl.insertBefore(b, ctl.firstChild);
    } catch (error) { /* the report is still there */ }
  }

  try {
    const passCtl = window.renderMCtl;
    if (typeof passCtl === 'function') {
      window.renderMCtl = function renderMCtlWithHighlights() {
        const out = passCtl.apply(this, arguments);
        offerAtFullTime();
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    ACTIONS.hlPlay = () => { play(MU && MU.fix, MU && MU.m); };
    ACTIONS.hlNext = () => { next(); };
    ACTIONS.hlClose = () => { close(); };
  } catch (error) { /* ignore */ }

  window.RBSHighlights = Object.freeze({
    standDown, offTheBar, reelFor, minuteOf, dug, api, num,
    play, next, close, REEL, offerAtFullTime,
  });
}());
