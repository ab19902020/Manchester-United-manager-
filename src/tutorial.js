/* global G, UI, ACTIONS, vHome:writable, render, esc, needsList */

/* =====================================================================
   THE TOUR — what everything is, and what to do next
   ---------------------------------------------------------------------
   "Keep improving it visually and the way it gives you everything, so
    it's perfectly easy to work out what's happening and what to do. Add
    a tutorial mode for beginners."

   A football management game is mostly a screen of numbers, and the
   difference between a beginner bouncing off it and staying is whether
   anybody ever told them which number matters. There was nothing: no
   tour, no help, no first-run anything. `needsList` is the closest the
   game came, and it is deliberately not a tutorial -- it lists what is
   waiting on a decision, which only helps once you already know what a
   decision looks like.

   So this points at the real screen. Every step spotlights an ELEMENT
   THAT IS ACTUALLY THERE -- the budget in the header, the Continue
   button, the tab bar -- rather than describing it in prose beside a
   picture, because the thing a beginner needs is to connect a sentence
   to the pixels it is about. A step whose element is missing is skipped
   rather than shown pointing at nothing.

   ---------------------------------------------------------------------
   IT IS OFFERED, NOT LAUNCHED AT YOU, and that is a deliberate choice
   worth writing down. A tour that opens itself over a screen you have
   not asked for is the thing people close without reading, and it would
   also cover the interface for every automated pass over it -- the
   layout audit, the menu sweep and every test that clicks a real
   control would find an overlay in front of the game. So a new manager
   gets a card at the top of the home screen that is impossible to miss,
   and the tour starts when it is pressed. The card disappears once the
   tour has been taken or dismissed, and a `?` in the header brings it
   back for ever.
   ===================================================================== */

(function tutorial() {
  'use strict';

  const ID = 'tutLayer';

  /* -------------------------------------------------------------------
     THE STEPS
     -------------------------------------------------------------------
     Ordered the way a manager meets the game: what am I looking at, what
     is being asked of me, where do I go to change it, and how does a
     week actually pass.
     ------------------------------------------------------------------- */
  const STEPS = [
    {
      sel: '.hdr .hclub, .hdr',
      title: 'This is your club',
      body: 'The name you manage, today’s date and the season. Everything in the '
        + 'game moves from this date — nothing happens until you let the days run.',
    },
    {
      sel: '.hdr .bank, .hdr',
      title: 'What you have to spend',
      body: 'Your transfer budget. Wages come out of a separate weekly pot, and you '
        + 'can move money between the two on the Finances screen.',
    },
    {
      sel: '.hrow',
      title: 'Where you stand, at a glance',
      body: 'League position, how long until the next match, whether your side is fit '
        + 'to play it, and anything unread. If one of these turns red it wants you.',
    },
    {
      sel: '.nav [data-v="squad"], [data-action="jump"][data-v="squad"]',
      title: 'Your players',
      body: 'Every man at the club: how good he is, how fit, how happy, and what he '
        + 'costs. A tired or unhappy squad genuinely loses matches — that is not '
        + 'decoration, it is measured.',
    },
    {
      sel: '.nav [data-v="tactics"]',
      title: 'How they play',
      body: 'Your formation, who starts, and the instructions. Picking a man out of '
        + 'position costs him, so the eleven you choose here is most of the result.',
    },
    {
      sel: '.nav [data-v="transfers"]',
      title: 'Signing and selling',
      body: 'The market. Better players win more matches than anything else you can '
        + 'do — a squad two points better on every attribute is worth about '
        + 'thirty-six points a season.',
    },
    {
      sel: '.continue-dock .btn, .continue-dock',
      title: 'This moves the game on',
      body: 'Continue runs the days forward until something needs you — a match, '
        + 'a decision, a letter. When you are not sure what to do next, this is the '
        + 'button.',
    },
  ];

  /* the last step is written when the tour runs, because what is
     outstanding depends on the save */
  function closingStep() {
    let waiting = 0;
    try { waiting = (typeof needsList === 'function' ? needsList() : []).length; }
    catch (error) { waiting = 0; }
    return {
      sel: null,
      title: 'That is the whole game',
      body: waiting
        ? 'You have ' + waiting + ' thing' + (waiting === 1 ? '' : 's')
          + ' waiting on a decision right now — the home screen lists them, and '
          + 'each one has the button that goes there. Take those, then press Continue.'
        : 'Pick your side, keep them fit, sign well, and press Continue. Anything that '
          + 'needs you appears on the home screen with the button that goes there.',
    };
  }

  const TOUR = { on: false, ix: 0, steps: [] };

  function el(id) { return document.getElementById(id); }

  function stop() {
    TOUR.on = false;
    try { const l = el(ID); if (l) l.remove(); } catch (error) { /* ignore */ }
    try { window.removeEventListener('resize', draw); } catch (error) { /* ignore */ }
  }

  function seen() {
    try { G.tutSeen = 1; } catch (error) { /* ignore */ }
    try { localStorage.setItem('rbsTutSeen', '1'); } catch (error) { /* ignore */ }
  }

  function hasSeen() {
    try { if (G && G.tutSeen) return true; } catch (error) { /* ignore */ }
    try { return localStorage.getItem('rbsTutSeen') === '1'; } catch (error) { return false; }
  }

  /* the element this step is about, if it is on the screen at all */
  function target(step) {
    if (!step || !step.sel) return null;
    try {
      for (const one of step.sel.split(',')) {
        const found = document.querySelector(one.trim());
        if (found && found.getBoundingClientRect().width > 0) return found;
      }
    } catch (error) { /* ignore */ }
    return null;
  }

  /* -------------------------------------------------------------------
     THE SPOTLIGHT
     -------------------------------------------------------------------
     Four panels around the target rather than an SVG mask or a
     `clip-path`: it is the one approach that behaves the same in every
     engine, costs nothing to animate, and leaves the hole genuinely
     empty so the real element underneath is the thing you are looking
     at rather than a picture of it.
     ------------------------------------------------------------------- */
  function draw() {
    if (!TOUR.on) return;
    const layer = el(ID);
    if (!layer) return;
    const step = TOUR.steps[TOUR.ix];
    const node = target(step);
    /* A STEP HAS TO BE ON THE SCREEN TO BE POINTED AT. Measured on the
       squad step, whose selector first matched a tile far down the home
       screen: the spotlight was drawn at y=1126 on an 844px phone and
       the caption with it, so the whole step happened below the fold. */
    try {
      if (node && typeof node.scrollIntoView === 'function') {
        const b0 = node.getBoundingClientRect();
        if (b0.top < 0 || b0.bottom > window.innerHeight) {
          node.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      }
    } catch (error) { /* it is measured where it is */ }
    const W = window.innerWidth;
    const H = window.innerHeight;

    let r = null;
    if (node) {
      const b = node.getBoundingClientRect();
      const pad = 8;
      r = {
        x: Math.max(0, b.left - pad), y: Math.max(0, b.top - pad),
        w: Math.min(W, b.width + pad * 2), h: Math.min(H, b.height + pad * 2),
      };
    }

    const shade = 'rgba(4,7,5,.82)';
    const panels = r ? [
      { l: 0, t: 0, w: W, h: r.y },
      { l: 0, t: r.y + r.h, w: W, h: Math.max(0, H - (r.y + r.h)) },
      { l: 0, t: r.y, w: r.x, h: r.h },
      { l: r.x + r.w, t: r.y, w: Math.max(0, W - (r.x + r.w)), h: r.h },
    ] : [{ l: 0, t: 0, w: W, h: H }];

    /* the caption goes under the target if there is room, otherwise above it */
    const cardH = 210;
    let top = r ? r.y + r.h + 12 : Math.round(H / 2 - cardH / 2);
    if (r && top + cardH > H - 16) top = r.y - cardH - 12;
    /* and whatever the arithmetic said, it stays on the phone */
    top = Math.max(12, Math.min(top, H - cardH - 12));

    const last = TOUR.ix >= TOUR.steps.length - 1;
    layer.innerHTML = panels.map((p) => '<div style="position:absolute;left:' + p.l
      + 'px;top:' + p.t + 'px;width:' + p.w + 'px;height:' + p.h
      + 'px;background:' + shade + '"></div>').join('')
      + (r ? '<div style="position:absolute;left:' + r.x + 'px;top:' + r.y + 'px;width:'
        + r.w + 'px;height:' + r.h + 'px;border-radius:14px;pointer-events:none;'
        + 'box-shadow:0 0 0 2px rgba(251,225,34,.9), 0 0 0 7px rgba(251,225,34,.18),'
        + '0 18px 40px -10px rgba(0,0,0,.8)"></div>' : '')
      + '<div class="tut-card" style="position:absolute;left:12px;right:12px;top:' + top + 'px">'
      + '<div class="tut-step">' + (TOUR.ix + 1) + ' of ' + TOUR.steps.length + '</div>'
      + '<div class="tut-title">' + esc(step.title) + '</div>'
      + '<div class="tut-body">' + esc(step.body) + '</div>'
      + '<div class="tut-row">'
      + '<button class="btn btn-ghost" data-action="tutSkip">'
      + (last ? 'Close' : 'Skip') + '</button>'
      + (TOUR.ix > 0 ? '<button class="btn btn-ghost" data-action="tutBack">Back</button>' : '')
      + '<button class="btn btn-primary" data-action="tutNext">'
      + (last ? 'Start managing' : 'Next') + '</button>'
      + '</div></div>';

    /* THE HEIGHT WAS A GUESS UNTIL IT WAS RENDERED. A step with three
       lines of body and one with six are ninety pixels apart, so the
       card is measured once it is on the page and moved if the guess put
       it off the bottom. */
    try {
      const card = layer.querySelector('.tut-card');
      if (card) {
        const h = card.getBoundingClientRect().height;
        let want = top;
        if (r && top === r.y + r.h + 12 && top + h > H - 16) want = r.y - h - 12;
        want = Math.max(12, Math.min(want, H - h - 12));
        if (Math.abs(want - top) > 1) card.style.top = Math.round(want) + 'px';
      }
    } catch (error) { /* the guess stands */ }
  }

  function start() {
    try {
      TOUR.steps = STEPS.slice().concat([closingStep()]);
      TOUR.ix = 0;
      TOUR.on = true;
      let layer = el(ID);
      if (!layer) {
        layer = document.createElement('div');
        layer.id = ID;
        layer.style.cssText = 'position:fixed;inset:0;z-index:200';
        document.body.appendChild(layer);
      }
      window.addEventListener('resize', draw);
      draw();
    } catch (error) { stop(); }
  }

  function step(by) {
    TOUR.ix += by;
    if (TOUR.ix < 0) TOUR.ix = 0;
    if (TOUR.ix >= TOUR.steps.length) { seen(); stop(); try { render(); } catch (e) { /* ignore */ } return; }
    /* a step about a tab is easier to follow on the screen it names */
    draw();
  }

  try {
    ACTIONS.tutStart = () => { seen(); start(); };
    ACTIONS.tutNext = () => step(1);
    ACTIONS.tutBack = () => step(-1);
    ACTIONS.tutSkip = () => { seen(); stop(); try { render(); } catch (e) { /* ignore */ } };
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     THE WAY IN
     -------------------------------------------------------------------
     A card at the top of the home screen for anybody who has not taken
     it, and a `?` in the header for ever after.
     ------------------------------------------------------------------- */
  const CARD = '<div class="card tut-offer">'
    + '<div class="tut-offer-t">New to this?</div>'
    + '<div class="tut-offer-s">A two-minute tour of what everything on the screen '
    + 'means and what to press first.</div>'
    + '<div class="tut-offer-row">'
    + '<button class="btn btn-primary" data-action="tutStart">Show me around</button>'
    + '<button class="btn btn-ghost" data-action="tutSkip">I know my way</button>'
    + '</div></div>';

  try {
    if (typeof vHome === 'function') {
      const pass = vHome;
      vHome = function vHomeWithTour() {
        const out = pass.apply(this, arguments);
        try { if (!hasSeen() && !(G && G.sacked)) return CARD + out; }
        catch (error) { /* ignore */ }
        return out;
      };
      window.vHome = vHome;
    }
  } catch (error) { /* ignore */ }

  /* the header button, added after whatever drew the header last */
  function helpButton() {
    try {
      if (document.getElementById('tutHelp')) return;
      /* BESIDE THE FULLSCREEN CONTROL, AS ITS SIBLING. Appending to
         `.hdr` and positioning it absolutely was the first attempt and
         it landed below the header on the left, because `.fsbtn` is
         positioned against a different ancestor -- so the `?` was
         floating over the team sheet. Putting it next to the button it
         is meant to sit beside means it inherits whatever that button
         is positioned against, whatever that turns out to be. */
      const fs = document.querySelector('.fsbtn');
      if (!fs || !fs.parentNode) return;
      const b = document.createElement('button');
      b.id = 'tutHelp';
      b.className = 'fsbtn tut-help';
      b.setAttribute('data-action', 'tutStart');
      b.setAttribute('aria-label', 'How to play');
      b.textContent = '?';
      fs.parentNode.insertBefore(b, fs);
    } catch (error) { /* ignore */ }
  }

  try {
    const pass = window.render;
    if (typeof pass === 'function') {
      window.render = function renderWithHelp() {
        const out = pass.apply(this, arguments);
        helpButton();
        return out;
      };
    }
  } catch (error) { /* ignore */ }

  /* -------------------------------------------------------------------
     STYLE
     ------------------------------------------------------------------- */
  const CSS = [
    '.tut-card{background:linear-gradient(180deg,#1b2a1d,#121a13);',
    ' border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:16px 16px 14px;',
    ' box-shadow:0 1px 0 rgba(255,255,255,.16) inset, 0 24px 60px -14px rgba(0,0,0,.95)}',
    '.tut-step{font-size:10px;font-weight:800;letter-spacing:1.4px;color:var(--gold);',
    ' text-transform:uppercase;margin-bottom:6px}',
    '.tut-title{font-size:19px;font-weight:800;letter-spacing:-.2px;margin-bottom:6px}',
    '.tut-body{font-size:13.5px;line-height:1.5;color:var(--ink-dim)}',
    '.tut-row{display:flex;gap:8px;margin-top:14px}',
    '.tut-row .btn{flex:1;min-height:44px}',
    '.tut-row .btn-primary{flex:1.4}',

    '.tut-offer{border-color:rgba(251,225,34,.34);',
    ' background:linear-gradient(160deg,rgba(251,225,34,.10),rgba(24,34,26,.9));',
    ' margin-bottom:11px}',
    '.tut-offer-t{font-size:16px;font-weight:800;margin-bottom:3px}',
    '.tut-offer-s{font-size:12.5px;color:var(--ink-dim);line-height:1.45}',
    '.tut-offer-row{display:flex;gap:8px;margin-top:11px}',
    '.tut-offer-row .btn{flex:1;min-height:44px}',

    /* the ? sits beside the fullscreen control rather than over it */
    /* `position:relative` is here so the 44px hit area below can be
       positioned against the button. It has a side effect that has to
       be undone in the same breath: `.fsbtn` carries `top:50%` from the
       layout where it was absolutely positioned, and a later layer set
       it `position:static`, which makes `top` inert -- and set
       `transform:none`, which threw away the `translateY(-50%)` that
       used to cancel it. Turning position back on re-activates the
       `top` and nothing cancels it, so the `?` dropped half of #hrow's
       height -- 18px -- and sat across the Inbox tile. */
    '.tut-help{font-size:16px;font-weight:800;line-height:1;position:relative;top:0}',
    /* AND IT IS THUMB-SIZED. The glyph is 32x32, which is the right size
       for the glyph and the wrong size for a finger, so the hit area is
       extended with a pseudo-element the way layout-polish does it for
       the shortlist star -- the box stays 32 and the target becomes 44,
       centred on it, and no layout moves. */
    '.tut-help::after{content:"";position:absolute;left:50%;top:50%;',
    ' width:44px;height:44px;transform:translate(-50%,-50%);border-radius:50%}',
  ].join('');

  try {
    const st = document.createElement('style');
    st.id = 'tutorial-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  } catch (error) { /* ignore */ }

  try {
    window.RBSTutorial = Object.freeze({ STEPS, start, stop, hasSeen, TOUR });
  } catch (error) { /* no window */ }
}());
