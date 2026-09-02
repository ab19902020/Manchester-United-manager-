/* global G, UI, render, crest, FORMATIONS, playerById, shirtNo, esc, calcEff, face */

/* =====================================================================
   UI SHELL — the chrome, in the club's colours
   ---------------------------------------------------------------------
   Built against a supplied design: a dark charcoal shell lit from behind
   by the club's own colour, panels with a quiet uppercase header and a
   hairline rule, a left rail with icon and label, and a dashboard whose
   centrepiece is the eleven on a pitch.

   Three things about the approach.

   IT IS TINTED FROM THE CLUB, NOT PAINTED RED. The reference is a
   Manchester United screen, so the obvious reading is "make it red".
   That would be wrong the moment somebody manages Everton. Every accent
   here is derived at render time from `c1` on the club you are actually
   managing, so the same design serves all 484 of them and a club you
   built yourself. Red is what United happens to produce.

   IT RESTYLES, IT DOES NOT REBUILD. The home screen carries things the
   season will not move on without — the board asking to see you, a bid
   that needs an answer, the press conference. Replacing that markup to
   match a picture would look right and quietly strand the player. So
   the existing views keep their content and their behaviour, and get
   the new panel language on top of it; the one piece of new furniture
   is the Team Overview pitch, which is added rather than substituted.

   IT LIVES HERE RATHER THAN IN THE LEGACY FILE. One script tag, loaded
   last, patching in place — the discipline Agent One and Codex settled
   on and which I have been slower to adopt than either of them.
   ===================================================================== */

(function uiShell() {
  const STYLE_ID = 'rbs-shell';

  /* ---------------------------------------------------------------
     COLOUR
     --------------------------------------------------------------- */
  function hex(value, fallback) {
    const raw = String(value || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(raw)) return '#' + raw.toLowerCase();
    if (/^[0-9a-f]{3}$/i.test(raw)) return '#' + raw.split('').map((c) => c + c).join('').toLowerCase();
    return fallback;
  }

  function rgb(colour) {
    const h = hex(colour, '#da291c').slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function mix(a, b, t) {
    const x = rgb(a); const y = rgb(b);
    const out = x.map((v, i) => Math.round(v + (y[i] - v) * t));
    return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function rgba(colour, alpha) {
    const [r, g, b] = rgb(colour);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* A club colour has to survive being used as text on a dark panel.
     Newcastle's black and Juventus's black would vanish, so anything
     too dark is lifted toward white until it reads. */
  function legible(colour) {
    const [r, g, b] = rgb(colour);
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luma >= 0.34) return hex(colour, '#da291c');
    return mix(colour, '#ffffff', 0.34 + (0.34 - luma));
  }

  function myClubColours() {
    try {
      const club = G && G.clubs && G.clubs[G.my];
      if (!club) return { c1: '#da291c', c2: '#fbe122' };
      return { c1: hex(club.c1, '#da291c'), c2: hex(club.c2, '#fbe122') };
    } catch (error) {
      return { c1: '#da291c', c2: '#fbe122' };
    }
  }

  /* ---------------------------------------------------------------
     THE SHEET
     --------------------------------------------------------------- */
  function css(c1, c2) {
    const accent = legible(c1);
    const glowA = rgba(c1, 0.22);
    const glowB = rgba(c2, 0.10);
    const panelTop = mix('#14161a', c1, 0.045);
    const panelBot = mix('#0e1013', c1, 0.03);
    const line = 'rgba(255,255,255,.075)';

    return `
:root{
  --sh-accent:${accent};
  --sh-accent-dim:${rgba(c1, 0.18)};
  --sh-line:${line};
  --sh-panel-top:${panelTop};
  --sh-panel-bot:${panelBot};
  --sh-label:rgba(255,255,255,.52);
}

/* ---- the room the game sits in ---- */
body{
  background:
    radial-gradient(1100px 620px at 50% -240px, ${glowA} 0%, transparent 62%),
    radial-gradient(820px 520px at 108% 106%, ${glowB} 0%, transparent 58%),
    linear-gradient(180deg,#0a0b0d 0%,#08090b 100%) !important;
  background-attachment:fixed !important;
}

/* ---- panels ----
   One treatment, everywhere. The old build had cards in four different
   greens depending on which layer drew them. */
#view .card,#view .sec,#view .panel{
  background:linear-gradient(180deg,var(--sh-panel-top),var(--sh-panel-bot)) !important;
  border:1px solid var(--sh-line) !important;
  border-radius:13px !important;
  box-shadow:0 1px 0 rgba(255,255,255,.035) inset, 0 10px 26px rgba(0,0,0,.42) !important;
}

/* the quiet uppercase header the reference uses on every panel */
/* No overflow:hidden, deliberately, and this is the second time this
   exact thing has bitten in this codebase. A scroll container has an
   automatic minimum size of zero, so a grid sizes its track as if the
   item were empty: measured at 896x414 the row came out 82.5px while
   the panel laid out at 340, and every card below it was drawn through
   the pitch. It survived a forced reflow, which is what ruled out a
   timing problem. The children round their own corners instead. */
.sh-panel{
  background:linear-gradient(180deg,var(--sh-panel-top),var(--sh-panel-bot));
  border:1px solid var(--sh-line);
  border-radius:13px;
  box-shadow:0 1px 0 rgba(255,255,255,.035) inset, 0 10px 26px rgba(0,0,0,.42);
}
.sh-panel>.sh-head{border-radius:12px 12px 0 0}
.sh-panel>.sh-head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:11px 14px 10px;
  border-bottom:1px solid var(--sh-line);
  font:800 11px/1 var(--body);
  letter-spacing:.115em;text-transform:uppercase;color:var(--sh-label);
}
.sh-panel>.sh-head .sh-sub{letter-spacing:.04em;font-weight:700;color:rgba(255,255,255,.34)}
.sh-panel>.sh-body{padding:13px 14px}

/* ---- the rail ----
   The desktop layer already builds a 270px sidebar with the icon and
   the label on one line, which is what the reference shows, so there is
   nothing to rebuild here. Two things it does not do: the active state
   is hardcoded to United's red, and the club name in the brand block
   truncates to "M..." because it is given no room to wrap. */
@media (min-width:1024px){
  #app>.nav .nav-inner>button.on{
    background:linear-gradient(100deg,${rgba(c1, 0.34)},${rgba(c1, 0.06)}) !important;
    box-shadow:inset 0 0 0 1px ${rgba(c1, 0.46)} !important}
  #app>.nav .nav-inner>button.on::after{background:var(--sh-accent) !important}
  #app>.nav .navbrand{min-width:0;overflow:hidden}
  #app>.nav .navbrand>div,#app>.nav .navbrand span{min-width:0;overflow:hidden;text-overflow:ellipsis}
  #app>.nav .navbrand .n{white-space:normal !important;line-height:1.2 !important;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
}

/* ---- the top bar ---- */
#hdr{
  background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0)) !important;
  border-bottom:1px solid var(--sh-line) !important;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#hdr .hclub .n,#hdr .hclub b{letter-spacing:-.01em}

/* the money readouts, as labelled blocks rather than loose text */
.sh-stat{display:flex;flex-direction:column;align-items:flex-end;gap:2px;line-height:1}
.sh-stat .sh-k{font:800 9.5px/1 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--sh-label)}
.sh-stat .sh-v{font:900 15px/1 var(--body);color:#fff}

/* ---- the dashboard pitch ---- */
/* The height is set in JavaScript, from the pitch's own measured width.
   Both of the pure-CSS ways of saying "keep this ratio" were tried and
   both broke in the containers this panel actually lands in.
   aspect-ratio measured tall inside the desktop grid; percentage
   padding contributes nothing to intrinsic height while a grid is
   sizing its rows, so the landscape row came out 83px while the panel
   painted 351 and every card below it was drawn over the pitch.
   Measured, both times, rather than inferred from the picture.

   A number in pixels cannot be misread by a layout mode. */
.sh-pitch{position:relative;width:100%;min-height:96px;border-radius:10px;overflow:hidden;
  background:
    repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 8.33%,rgba(0,0,0,0) 8.33% 16.66%),
    radial-gradient(120% 90% at 50% -10%, #24462a 0%, #16301b 46%, #102415 100%);
  box-shadow:inset 0 0 60px rgba(0,0,0,.55)}
.sh-pitch .sh-mk{position:absolute;border:1.5px solid rgba(255,255,255,.16);border-radius:2px}
.sh-tok{position:absolute;transform:translate(-50%,-50%);text-align:center;width:56px}
/* THE MAN, NOT A DISC. The first cut drew a coloured circle with a shirt
   number in it, which at a created club whose primary is white came out
   as eleven identical white dots — you could not tell your side apart
   from a diagram. The tactics pitch already draws the player's own face,
   so the dashboard draws the same face: you recognise the eleven you
   picked at a glance instead of reading numbers off counters. The number
   survives as a corner badge, because a shirt number is how you refer to
   a player, and the ring keeps the club's colour so the side still reads
   as a side. */
.sh-tok .sh-shirt{
  position:relative;width:31px;height:31px;margin:0 auto;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font:900 11.5px/1 var(--body);color:#fff;
  border:1.5px solid rgba(255,255,255,.5);
  box-shadow:0 3px 8px rgba(0,0,0,.55)}
.sh-tok .sh-face{position:absolute;inset:0;border-radius:50%;overflow:hidden;line-height:0}
.sh-tok .sh-face svg,.sh-tok .sh-face img{width:100%;height:100%;border-radius:50%;display:block}
.sh-tok .sh-no{position:absolute;right:-5px;bottom:-3px;min-width:15px;height:14px;padding:0 3px;
  border-radius:7px;display:flex;align-items:center;justify-content:center;
  font:900 9px/1 var(--body);border:1px solid rgba(0,0,0,.45);
  box-shadow:0 2px 5px rgba(0,0,0,.55)}
.sh-tok .sh-nm{margin-top:3px;font:700 9.5px/1.1 var(--body);color:rgba(255,255,255,.9);
  text-shadow:0 1px 3px rgba(0,0,0,.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---- a labelled meter, used for chemistry ---- */
.sh-meter{display:flex;align-items:center;gap:9px;margin-top:11px}
.sh-meter .sh-k{font:800 9.5px/1 var(--body);letter-spacing:.13em;text-transform:uppercase;color:var(--sh-label);flex:0 0 auto}
.sh-meter .sh-bar{flex:1 1 auto;height:5px;border-radius:3px;background:rgba(255,255,255,.09);overflow:hidden}
.sh-meter .sh-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--sh-accent),${mix(c1, '#ffffff', 0.35)})}
.sh-meter .sh-v{font:800 11px/1 var(--body);color:#fff;flex:0 0 auto}

/* ---- status rows ---- */
.sh-rows{display:flex;flex-direction:column}
.sh-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:9px 0;border-bottom:1px solid var(--sh-line)}
.sh-row:last-child{border-bottom:0}
.sh-row .sh-k{font:800 9.5px/1.3 var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--sh-label)}
.sh-row .sh-v{font:800 13px/1 var(--body)}
`;
  }

  function paint() {
    try {
      const { c1, c2 } = myClubColours();
      let tag = document.getElementById(STYLE_ID);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = STYLE_ID;
        document.head.appendChild(tag);
      }
      const key = c1 + '|' + c2;
      if (tag.dataset.key === key) return;
      tag.dataset.key = key;
      tag.textContent = css(c1, c2);
    } catch (error) { /* styling is never worth throwing over */ }
  }

  /* ---------------------------------------------------------------
     THE ELEVEN, ON A PITCH
     ---------------------------------------------------------------
     FORMATIONS already stores what this needs: each slot is
     [position, depth 0-100, across 0-68], which is the same geometry
     the tactics screen draws from. So the panel is a second view of
     one source rather than a second copy of the shape.
     --------------------------------------------------------------- */
  /* The page's own `surname` knows that a particle belongs to the name
     behind it -- de Ligt, van Dijk, De Bruyne -- and this panel used a
     private copy that did not, so the eleven on the home screen read
     "Ligt" while the same man read "De Ligt" everywhere else. It defers
     to the shared rule and keeps the last-word fallback for a page that
     has not defined one. */
  function surname(name) {
    try {
      if (typeof window !== 'undefined' && typeof window.surname === 'function') {
        return window.surname(name);
      }
    } catch (error) { /* fall through to the plain rule */ }
    const parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '');
  }

  function pitchPanel() {
    const club = G.clubs[G.my];
    const shape = (G.tacs && G.tacs.formation) || '4-2-3-1';
    const slots = (typeof FORMATIONS === 'object' && FORMATIONS[shape]) || null;
    if (!slots || !G.tacs || !Array.isArray(G.tacs.xi)) return '';

    const kit = hex(club.c1, '#da291c');
    const keeper = '#f0d040';

    let tokens = '';
    let rated = 0;
    let counted = 0;
    slots.forEach((slot, index) => {
      const [role, depth, across] = slot;
      const player = playerById(G.tacs.xi[index]);
      /* Inset rather than edge-to-edge. Mapped straight, a full-back at
         across=7 lands on 10% and the keeper at depth=6 on 94%, so the
         token straddles the touchline and the name under the keeper is
         cut off by the bottom of the pitch. These margins keep the whole
         token — circle and name — inside the grass. */
      const left = 9 + (across / 68) * 82;
      const top = 7 + (100 - depth) * 0.86;
      const fill = role === 'GK' ? keeper : kit;
      const ink = role === 'GK' ? '#20180a' : '#fff';
      const number = player ? (shirtNo(player, club) || '') : '';
      const label = player ? surname(player.name) : role;
      if (player && typeof calcEff === 'function') {
        try { rated += calcEff(player, role); counted += 1; } catch (error) { /* skip */ }
      }
      /* the player's own face when the generator is there, the coloured
         disc when it is not — a screen that has to work offline in a
         browser that may have failed to build a portrait should still
         put eleven men on the grass */
      let portrait = '';
      if (player && typeof face === 'function') {
        try { portrait = face(player, 31); } catch (error) { portrait = ''; }
      }
      const badge = number === '' ? ''
        : `<span class="sh-no" style="background:${fill};color:${ink}">${esc(String(number))}</span>`;
      tokens += `<div class="sh-tok" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%">`
        + `<div class="sh-shirt" style="background:${fill};color:${ink}">`
        + (portrait ? `<span class="sh-face">${portrait}</span>${badge}`
          : esc(String(number)))
        + `</div>`
        + `<div class="sh-nm">${esc(label)}</div></div>`;
    });

    /* chemistry, as the reference shows it: how well the eleven you
       picked fit the shirts you picked them for */
    const chem = counted ? Math.round((rated / counted) * 1.02) : 0;

    return `<section class="sh-panel" id="shPitch" style="margin-bottom:12px">`
      + `<div class="sh-head"><span>Team Overview</span><span class="sh-sub">${esc(shape)}</span></div>`
      + `<div class="sh-body">`
      + `<div class="sh-pitch">`
      + `<div class="sh-mk" style="left:6%;right:6%;top:4%;bottom:4%"></div>`
      + `<div class="sh-mk" style="left:28%;right:28%;top:4%;height:16%"></div>`
      + `<div class="sh-mk" style="left:28%;right:28%;bottom:4%;height:16%"></div>`
      + `<div class="sh-mk" style="left:40%;right:40%;top:50%;width:20%;height:0;padding-bottom:20%;`
      + `transform:translateY(-50%);border-radius:50%"></div>`
      + tokens
      + `</div>`
      + `<div class="sh-meter"><span class="sh-k">Team chemistry</span>`
      + `<span class="sh-bar"><i style="width:${Math.max(0, Math.min(100, chem))}%"></i></span>`
      + `<span class="sh-v">${chem}%</span></div>`
      + `</div></section>`;
  }

  /* Where the panel goes matters more than it looks like it should. The
     desktop home screen is a two-column grid whose hero spans
     `grid-column:1/-1`, and dropping a new first child into that grid
     put the panel and the hero in the same cell — the pitch drew under
     the fixture card with the players scattered across it. Measured,
     not guessed: the panel came back 643x533 at y=123 and the hero
     1296 wide at y=147.

     `.home-col` is the ordinary block column inside that grid, so
     mounting there means the panel stacks like everything else and the
     grid is left alone. Mobile has no such column, and there the view
     is a single flow, so appending after the hero is correct instead. */
  function mountPitch() {
    try {
      if (!G || !G.clubs || UI.view !== 'home') return;
      const view = document.getElementById('view');
      if (!view || document.getElementById('shPitch')) return;
      const html = pitchPanel();
      if (!html) return;
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const node = holder.firstElementChild;
      if (!node) return;

      const column = view.querySelector(':scope > .home-col');
      if (column) { column.insertBefore(node, column.firstChild); return; }

      const hero = view.querySelector(':scope > .home-hero');
      if (hero && hero.nextSibling) { view.insertBefore(node, hero.nextSibling); return; }
      if (hero) { view.appendChild(node); return; }
      view.insertBefore(node, view.firstChild);
    } catch (error) { /* the dashboard still works without it */ }
  }

  /* ---------------------------------------------------------------
     WIRING
     --------------------------------------------------------------- */
  /* 0.733 is a pitch seen slightly foreshortened rather than a true
     105x68, which is 0.648 — the reference art is drawn from behind the
     goal and a literal ratio reads too wide. Capped so that on a
     landscape phone the eleven does not push everything else off the
     screen. */
  function sizePitch() {
    try {
      document.querySelectorAll('.sh-pitch').forEach((pitch) => {
        const width = pitch.clientWidth || pitch.getBoundingClientRect().width;
        if (!width) return;
        const room = (window.innerHeight || 800) * 0.62;
        const height = Math.max(96, Math.min(width * 0.733, room));
        pitch.style.height = Math.round(height) + 'px';
      });
    } catch (error) { /* the panel is still readable unsized */ }
  }

  function afterRender() {
    paint();
    mountPitch();
    sizePitch();
  }

  if (typeof render === 'function') {
    const previous = render;
    render = function renderShell() {
      const result = previous.apply(this, arguments);
      try {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(afterRender);
        else afterRender();
      } catch (error) { afterRender(); }
      return result;
    };
  }

  paint();
  try {
    window.addEventListener('resize', sizePitch);
    window.addEventListener('orientationchange', sizePitch);
  } catch (error) { /* no window */ }

  try {
    window.RBSShell = Object.freeze({ paint, legible, mix, pitchPanel, sizePitch });
  } catch (error) { /* no window */ }
}());
