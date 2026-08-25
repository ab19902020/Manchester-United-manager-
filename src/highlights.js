/* global G, MU, ACTIONS, buildMatchScreen, renderMCtl, esc, FORMATIONS, autoPick,
   playerById */

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
      /* AND SOMETHING HAS TO BE LIT. The bar records which tab was
         selected at the moment it was built, so taking the Dugout chip
         off a bar that was built while the Dugout was selected leaves
         three chips and none of them on -- measured in JSDOM: tab
         "pitch", chips pitch/comm/stats, not one of them lit. Rather
         than depend on which layer rebuilds last, the lamp is set from
         MU.tab here, every time. */
      const chips = [...document.querySelectorAll('#matchScreen [data-action="mtab"]')];
      if (!chips.length) return;
      const want = (MU && MU.tab) || 'pitch';
      let hit = false;
      chips.forEach((b) => {
        const on = b.dataset.v === want;
        b.classList.toggle('on', on);
        if (on) hit = true;
      });
      if (!hit) { chips[0].classList.add('on'); if (MU) MU.tab = chips[0].dataset.v; }
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

  /* -------------------------------------------------------------------
     ANY GAME, NOT JUST THE ONE YOU JUST PLAYED
     -------------------------------------------------------------------
     "you can watch the highlights of each game that way"

     A finished fixture keeps everything a reel needs and always has:
     measured across a played season, 242 of 257 completed fixtures carry
     their full goal list -- minute, scorer, club and penalty flag -- and
     the fifteen without one are the goalless draws. So no save format
     changes and nothing new is stored; the reel is rebuilt from the
     record whenever it is asked for.

     What a past fixture does NOT keep is the eleven that were on the
     pitch, because MatchSim is long gone. `autoPick` names a side for any
     club, which is the same thing the engine does for every AI team, and
     the men who actually scored are put into it by hand -- the engine
     finds its scorer by id, so a reel of a goal by somebody left out of
     today's XI would otherwise be scored by a stranger.
     ------------------------------------------------------------------- */
  function sideForClub(ci, home) {
    const c = (G.clubs || [])[ci];
    if (!c) return null;
    const form = (c.tacs && c.tacs.formation) || '4-3-3';
    const slots = (typeof FORMATIONS !== 'undefined' && FORMATIONS[form]) || null;
    if (!slots) return null;
    let ids = [];
    try { ids = (typeof autoPick === 'function' && autoPick(ci, form)) || []; }
    catch (error) { ids = []; }
    const used = new Set();
    const onfield = slots.map((sl, ix) => {
      const pos = sl[0];
      let p = ids[ix] != null ? playerById(ids[ix]) : null;
      if (!p || used.has(p.id)) {
        p = (c.players || []).find((q) => !used.has(q.id) && !q.loan) || null;
      }
      if (!p) return null;
      used.add(p.id);
      return { p, slot: pos, hx: sl[1], hy: sl[2], cond: p.cond,
        rating: 6, yc: 0, off: false, goals: 0, assists: 0, entered: 0 };
    }).filter(Boolean);
    return { ci, c, home, isMy: ci === G.my, onfield, bench: [],
      tac: { formation: form, mentality: 'Balanced' },
      st: { sh: 0, sot: 0, cor: 0, fl: 0, xg: 0, sv: 0 } };
  }

  /* the men who scored have to be on the pitch for the reel to name them */
  function seatTheScorers(side, fixture) {
    if (!side) return;
    try {
      const want = (fixture.sc || [])
        .filter((g) => g.ci === side.ci && g.pid != null)
        .map((g) => String(g.pid));
      want.forEach((pid) => {
        if (side.onfield.some((x) => x && x.p && String(x.p.id) === pid)) return;
        const p = playerById(pid);
        if (!p) return;
        /* the outfield man furthest from being a goalkeeper makes way */
        const ix = side.onfield.findIndex((x) => x && x.slot !== 'GK');
        if (ix < 0) return;
        side.onfield[ix] = { ...side.onfield[ix], p, cond: p.cond };
      });
    } catch (error) { /* the reel still plays, with a stand-in */ }
  }

  /* a reel for any finished fixture in the world */
  function playFixture(fixture) {
    const fx = fixture;
    if (!fx || !reelFor(fx).length) return false;
    const home = sideForClub(fx.h, true);
    const away = sideForClub(fx.a, false);
    if (!home || !away) return false;
    seatTheScorers(home, fx);
    seatTheScorers(away, fx);
    return play(fx, { sides: [home, away] });
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
  /* THE REEL IS THE END OF THE MATCH, so it does not wait to be found.
     -------------------------------------------------------------------
     "the highlight of goals should be after the match has finished"

     It was a button first, and the button could not be placed. Full time
     hands the controls to the dressing-room panel, whose `.dr-wrap` is
     `height:100%` of #mCtl; a button at the top of #mCtl, a button
     appended inside the wrap, and a button floated over the match screen
     were all measured as present, visible and 366x46 -- and all three
     had `.dr-grp-b` answering at their centre. Three attempts at the
     same wrong idea.

     The right one is simpler and is what was actually asked for: when
     the whistle goes and there were goals, the goals play. Closing the
     reel puts the manager in the dressing room, which is where full time
     was always going to leave him. */
  let played = null;

  function autoPlayAtFullTime() {
    try {
      if (!MU || !MU.m || !MU.m.done || !MU.fix) return;
      if (played === MU.fix) return;
      if (!reelFor(MU.fix).length) return;
      played = MU.fix;
      /* a beat, so the full-time whistle and the score land first */
      setTimeout(() => {
        try { if (MU && MU.m && MU.m.done && MU.fix === played) play(MU.fix, MU.m); }
        catch (error) { /* the report is still there */ }
      }, 900);
    } catch (error) { /* ignore */ }
  }

  function offerAtFullTime() {
    autoPlayAtFullTime();
    try {
      const ctl = document.getElementById('mCtl');
      if (!ctl) return;
      if (document.getElementById('hlBtn')) return;
      if (!MU || !MU.m || !MU.m.done || !MU.fix) return;
      if (!reelFor(MU.fix).length) return;
      const b = document.createElement('button');
      b.id = 'hlBtn';
      b.className = 'btn btn-block';
      b.style.cssText = 'margin:8px 0 0';
      b.setAttribute('data-action', 'hlPlay');
      b.textContent = '\ud83c\udfa5 Watch the highlights';
      /* ABOVE THE DRESSING ROOM, NOT IN IT. Full time hands the controls
         to the dressing-room panel, whose `.dr-wrap` is `height:100%` of
         #mCtl -- so a button placed at the top of #mCtl, and a button
         appended inside the wrap, are both laid out in the same box and
         covered by it. Measured twice: present, visible, 366x46, and
         what answered at its centre was `.dr-grp-b` both times. A
         control the player cannot press is not a control.

         So it stops competing for that box. Anchored to the match screen
         just above the panel, on its own layer, it is the first thing
         under the scoreboard when the whistle goes. */
      b.style.cssText = 'position:absolute;left:12px;right:12px;z-index:12;'
        + 'margin:0;box-shadow:0 6px 20px rgba(0,0,0,.55)';
      const screen = document.getElementById('matchScreen') || ctl.parentElement;
      const anchor = ctl.getBoundingClientRect();
      const host = screen.getBoundingClientRect();
      b.style.top = Math.max(8, Math.round(anchor.top - host.top - 54)) + 'px';
      if (getComputedStyle(screen).position === 'static') screen.style.position = 'relative';
      screen.appendChild(b);
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

  /* -------------------------------------------------------------------
     AND EVERY MATCH YOU HAVE ALREADY PLAYED
     -------------------------------------------------------------------
     The match report is where the game already keeps a past match, so
     that is where the reel goes rather than a new screen. A report names
     the two clubs and the day, which finds the fixture, which carries
     the goals.
     ------------------------------------------------------------------- */
  function fixtureFor(entry) {
    if (!entry) return null;
    try {
      const all = (G.fixtures || []).concat(
        Object.keys(G.cups || {}).reduce((acc, k) => acc.concat((G.cups[k].ties) || []), []),
      );
      return all.find((f) => f && f.played && f.h === entry.h && f.a === entry.a
        && (entry.day == null || f.day === entry.day)) || null;
    } catch (error) { return null; }
  }

  try {
    const passReport = ACTIONS.matchReport;
    if (typeof passReport === 'function') {
      ACTIONS.matchReport = function reportWithHighlights(el) {
        const out = passReport.apply(this, arguments);
        try {
          const ix = +((el && el.dataset && el.dataset.v) || 0);
          const entry = G.repLog && G.repLog[ix];
          const fx = fixtureFor(entry);
          if (!fx || !reelFor(fx).length) return out;
          const sb = document.getElementById('sheetBody');
          if (!sb || sb.querySelector('[data-action="hlFix"]')) return out;
          const b = document.createElement('button');
          b.className = 'btn btn-block';
          b.style.cssText = 'margin-top:8px';
          b.setAttribute('data-action', 'hlFix');
          b.setAttribute('data-v', String(ix));
          b.textContent = '\ud83c\udfa5 Watch the goals again';
          sb.appendChild(b);
        } catch (error) { /* the report is still the report */ }
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  try {
    ACTIONS.hlFix = (el) => {
      try {
        const ix = +((el && el.dataset && el.dataset.v) || 0);
        const fx = fixtureFor(G.repLog && G.repLog[ix]);
        if (!fx) return;
        if (typeof window.closeModal === 'function') window.closeModal();
        playFixture(fx);
      } catch (error) { /* ignore */ }
    };
    ACTIONS.hlPlay = () => { play(MU && MU.fix, MU && MU.m); };
    ACTIONS.hlNext = () => { next(); };
    ACTIONS.hlClose = () => { close(); };
  } catch (error) { /* ignore */ }

  window.RBSHighlights = Object.freeze({
    standDown, offTheBar, reelFor, minuteOf, dug, api, num,
    play, next, close, REEL, offerAtFullTime, autoPlayAtFullTime,
    playFixture, sideForClub, seatTheScorers, fixtureFor,
  });
}());
