/* global MU, MSPEED, ACTIONS, renderTop, renderMCtl */

/* =====================================================================
   DUGOUT DRAMA — fast through the football, real time for the moments
   ---------------------------------------------------------------------
   A match is ninety minutes and nobody wants to sit through ninety
   minutes of a simulation. But the way a broadcast handles that is not
   to run everything fast: it runs the ordinary passages quickly and
   then it STOPS on the things that decide the game — the goal, the
   penalty, the card, the VAR check, the one that came back off the bar.

   The game already had half of this. `MU.speed` runs the clock, and a
   hold existed for exactly one case: Highlights mode paused 3.2 seconds
   on a big line. Everywhere else you could be at 4x, score the winner
   in the last minute, and watch it go past in two hundred milliseconds
   with the rest of the fast-forward.

   So the rule here is the broadcast one. Whatever speed you have
   chosen, when something that matters happens the match drops to normal
   speed, stays there long enough for you to watch it, and then goes
   back to the speed you asked for. You never have to reach for the
   controls to see the goal you just scored.

   ---------------------------------------------------------------------
   WHAT COUNTS, AND FOR HOW LONG. Roughly how long a broadcast lingers:

     a goal                  seven seconds
     a red card              six
     a penalty given         six
     a VAR check             six
     off the woodwork        four
     a booking               three and a half

   A substitution deliberately does not qualify. It is an event, it is
   worth a caption, and stopping the game for it every time would make
   the last twenty minutes of every match crawl.

   HOW IT HOOKS IN. It does not reimplement the loop, and it does not
   touch the engine. `MU.speed` is read fresh on every iteration of the
   existing loop, so the whole mechanism is: remember what you had it
   on, set it to 1, and put it back when the moment has passed. If you
   change speed yourself during a moment, that wins immediately and the
   window is dropped — the controls are never fighting you.

   Classification reuses `callFor()`, which the caption system already
   uses, rather than growing a second opinion about what a goal is.
   ===================================================================== */

(function dugoutDrama() {
  const HOLD = {
    goal: 7000,
    red: 6000,
    pen: 6000,
    var: 6000,
    post: 4000,
    card: 3500,
  };

  const LABEL = {
    goal: 'GOAL',
    red: 'RED CARD',
    pen: 'PENALTY',
    var: 'VAR CHECK',
    post: 'OFF THE WOODWORK',
    card: 'BOOKING',
  };

  /* The kinds `callFor` already knows, plus the two it does not
     separate: it folds a penalty into 'var' and has no idea about the
     woodwork, and both of those are things a viewer wants to watch. */
  function dramaKind(entry) {
    const raw = String((entry && entry.text) || '').replace(/<[^>]*>/g, '');
    if (/second yellow|sent off|red card|is off!|dismissed/i.test(raw)) return 'red';
    if (entry && entry.cls === 'goal') return 'goal';
    if (/\bVAR\b|on review|overturn/i.test(raw)) return 'var';
    if (/penalty|from the spot|spot kick/i.test(raw)) return 'pen';
    if (/post|crossbar|woodwork|rattle/i.test(raw)) return 'post';
    if (/yellow card|booked|goes into the book/i.test(raw)) return 'card';
    return null;
  }

  const state = { match: null, seen: 0, from: null, until: 0, kind: null, manual: false };

  /* WHAT "REAL TIME" HAS TO MEAN.
     The first version of this dropped to speed 1 and called it real
     time. It is not: speed 1 is 3,200ms of wall clock per MATCH minute,
     so a goal still went past in a third of a second. You could not
     watch it, which was the whole complaint.

     For a goal, the clock stops instead. The match does not advance at
     all while the ball is going in and the celebration is running, so
     one second on your screen is one second of animation — the
     renderer is on requestAnimationFrame and keeps drawing whether the
     engine ticks or not. Then the clock starts again at whatever speed
     you had it on.

     The lesser moments — a booking, a VAR check — drop to speed 1
     rather than stopping, because stopping the match dead for every
     yellow card would be worse than missing one. */
  const FULL_STOP = { goal: true, red: true, pen: true };

  function holdSpeed(kind) {
    return FULL_STOP[kind] ? 0 : 1;
  }

  function banner(kind) {
    try {
      let el = document.getElementById('dugDrama');
      if (!el) {
        el = document.createElement('div');
        el.id = 'dugDrama';
        el.className = 'dug-drama';
        const host = document.getElementById('matchScreen') || document.body;
        host.appendChild(el);
      }
      el.textContent = LABEL[kind] || '';
      el.dataset.kind = kind;
      el.classList.add('on');
    } catch (error) { /* the slow-down still works without a caption */ }
  }

  function clearBanner() {
    try {
      const el = document.getElementById('dugDrama');
      if (el) el.classList.remove('on');
    } catch (error) { /* nothing to clear */ }
  }

  function engage(kind) {
    try {
      const now = performance.now();
      const ms = HOLD[kind] || 3000;
      /* Already inside a moment: extend rather than restart, so a
         penalty that becomes a goal that becomes a VAR check reads as
         one passage of play instead of three restarts. The speed to go
         back to is whatever we were on before the FIRST of them. */
      if (state.until > now) {
        state.until = Math.max(state.until, now + ms);
        if ((HOLD[kind] || 0) >= (HOLD[state.kind] || 0)) { state.kind = kind; banner(kind); }
        return;
      }
      if (MU.speed !== 0 && MU.speed !== 9) state.from = MU.speed;
      state.kind = kind;
      state.until = now + ms;
      const want = holdSpeed(kind);
      if (MU.speed !== 9 && MU.speed !== want) {
        MU.speed = want;
        MU.acc = 0;
        try { renderMCtl(); } catch (error) { /* controls repaint next tick */ }
      }
      banner(kind);
    } catch (error) { /* never let a caption break the match */ }
  }

  function release() {
    try {
      if (!state.until) return;
      if (performance.now() < state.until) return;
      const back = state.from;
      const held = holdSpeed(state.kind);
      state.until = 0; state.kind = null; state.from = null;
      clearBanner();
      if (back != null && MU && MU.m && !MU.m.done && MU.speed === held) {
        MU.speed = back;
        MU.acc = 0;
        try { renderMCtl(); } catch (error) { /* controls repaint next tick */ }
      }
    } catch (error) { /* leave the speed where it is */ }
  }

  function scan() {
    try {
      const match = MU && MU.m;
      if (!match || !match.feed) return;
      if (state.match !== match) { state.match = match; state.seen = 0; state.until = 0; state.from = null; }
      if (match.feed.length < state.seen) state.seen = 0;

      /* the most important thing in the batch wins the caption */
      let best = null;
      for (let i = state.seen; i < match.feed.length; i += 1) {
        const kind = dramaKind(match.feed[i]);
        if (kind && (!best || (HOLD[kind] || 0) > (HOLD[best] || 0))) best = kind;
      }
      state.seen = match.feed.length;
      if (best) engage(best);
      release();
    } catch (error) { /* the match carries on */ }
  }

  /* renderTop runs once per batch of ticks, which is where the loop
     already tells the screen something happened. */
  if (typeof renderTop === 'function') {
    const previous = renderTop;
    renderTop = function renderTopDrama() {
      const result = previous.apply(this, arguments);
      scan();
      return result;
    };
  }

  /* A speed you choose yourself beats a speed we chose for you. */
  if (ACTIONS && typeof ACTIONS.mspeed === 'function') {
    const previous = ACTIONS.mspeed;
    ACTIONS.mspeed = function mspeedDrama() {
      state.until = 0; state.kind = null; state.from = null;
      clearBanner();
      return previous.apply(this, arguments);
    };
  }

  /* and a slow tick so the window closes even if the feed goes quiet */
  try { setInterval(release, 250); } catch (error) { /* no timers */ }

  (function style() {
    try {
      if (document.getElementById('dugDramaCSS')) return;
      const tag = document.createElement('style');
      tag.id = 'dugDramaCSS';
      tag.textContent = [
        '.dug-drama{position:absolute;left:50%;top:14%;transform:translate(-50%,-6px);',
        ' z-index:60;pointer-events:none;opacity:0;transition:opacity .18s ease,transform .18s ease;',
        ' font:900 13px/1 var(--body);letter-spacing:.22em;text-transform:uppercase;color:#fff;',
        ' padding:9px 18px;border-radius:999px;white-space:nowrap;',
        ' background:linear-gradient(180deg,rgba(18,20,24,.94),rgba(10,11,13,.94));',
        ' border:1px solid rgba(255,255,255,.16);',
        ' box-shadow:0 10px 30px rgba(0,0,0,.6)}',
        '.dug-drama.on{opacity:1;transform:translate(-50%,0)}',
        '.dug-drama[data-kind="goal"]{border-color:rgba(61,220,132,.75);color:#8dffc0}',
        '.dug-drama[data-kind="red"]{border-color:rgba(255,83,72,.8);color:#ff8f86}',
        '.dug-drama[data-kind="card"]{border-color:rgba(251,225,34,.7);color:#ffe86b}',
        '.dug-drama[data-kind="pen"],.dug-drama[data-kind="var"]{border-color:rgba(88,166,255,.7);color:#9cccff}',
        '.dug-drama[data-kind="post"]{border-color:rgba(255,176,32,.7);color:#ffd28a}',
      ].join('');
      document.head.appendChild(tag);
    } catch (error) { /* unstyled is still legible */ }
  }());

  try {
    window.RBSDrama = Object.freeze({ dramaKind, HOLD, LABEL, state, scan });
  } catch (error) { /* no window */ }
}());
