/* global UI */

/* =====================================================================
   THE VISUAL REFRESH
   ---------------------------------------------------------------------
   Presentation only. Nothing here reads a rating, a result or a balance;
   it is a stylesheet and one small hook that knows when the screen has
   changed.

   1. A SCREEN ARRIVES. Moving between Squad and Tactics swapped one wall
      of cards for another with nothing in between, so the eye had to
      find its place again every time. The view now rises in over a
      quarter of a second, cards a beat apart -- but only when the screen
      or its tab actually changes. The game repaints the same screen
      constantly (every tap is a repaint), and an animation that replayed
      on each of those would be a flicker, so the hook compares where you
      are with where you were and stays quiet when they match.

   2. DEPTH. Cards, chips and buttons were flat tiles on a flat ground.
      They get a top-light edge and a soft shadow, the primary button a
      sheen, and anything you press answers the press.

   3. THE BADGE. Crests sit in a soft shadow with a highlight, so a badge
      reads as an object rather than a sticker.

   4. THE MATCH. The pitch was centred in the space under the tabs, which
      on a tall phone left a dead band above it and squeezed the
      commentary into one line. It sits at the top now and the commentary
      takes the room that is left.

   Everything honours "reduce motion".
   ===================================================================== */
(function visualRefresh() {
  'use strict';

  const CSS = `
/* ---- 1. a screen arrives ------------------------------------------- */
@keyframes rbsRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#view.rbs-enter>*{animation:rbsRise .26s cubic-bezier(.2,.7,.2,1) both}
#view.rbs-enter>*:nth-child(2){animation-delay:.03s}
#view.rbs-enter>*:nth-child(3){animation-delay:.06s}
#view.rbs-enter>*:nth-child(4){animation-delay:.09s}
#view.rbs-enter>*:nth-child(5){animation-delay:.12s}
#view.rbs-enter>*:nth-child(n+6){animation-delay:.15s}
@keyframes rbsSheet{from{transform:translateY(18px);opacity:.4}to{transform:none;opacity:1}}
#modalHost.open #sheetBody{animation:rbsSheet .22s cubic-bezier(.2,.7,.2,1) both}

/* ---- 2. depth -------------------------------------------------------- */
#view .card,#view .sh-panel{
  box-shadow:0 1px 0 rgba(255,255,255,.055) inset,0 10px 24px -14px rgba(0,0,0,.75);
  background-image:linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,0) 42%)}
#view .card:has([data-action]):active{transform:scale(.995)}
.btn{transition:transform .08s ease,filter .12s ease,box-shadow .12s ease}
.btn:active{transform:translateY(1px) scale(.985);filter:brightness(.94)}
.btn-primary{position:relative;overflow:hidden;
  box-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 10px 22px -10px rgba(218,41,28,.7)}
.btn-primary::after{content:"";position:absolute;inset:0 0 55% 0;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,0))}
.chip{transition:transform .08s ease,background-color .14s ease,border-color .14s ease}
.chip:active{transform:scale(.96)}
.chip.on{box-shadow:0 1px 0 rgba(255,255,255,.22) inset,0 8px 18px -10px rgba(218,41,28,.75)}
#view table tr{transition:background-color .12s ease}
#view .sec .t{letter-spacing:.14em}

/* ---- 3. the badge ---------------------------------------------------- */
svg.crest{filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));overflow:visible}

/* ---- 4. the match ---------------------------------------------------- */
#matchScreen #mBody:has(#pitchCanvas){display:flex;flex-direction:column;justify-content:flex-start}
#matchScreen #mBody>#pitchCanvas{flex:0 0 auto;margin-top:0!important;
  box-shadow:0 18px 34px -22px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06)}
#matchScreen #mBody:has(#pitchCanvas)>.commentary{flex:1 1 auto;min-height:0;overflow-y:auto;
  -webkit-mask-image:linear-gradient(180deg,#000 88%,transparent);mask-image:linear-gradient(180deg,#000 88%,transparent)}
#matchScreen .msb{box-shadow:0 14px 28px -20px rgba(0,0,0,.9)}

@media(prefers-reduced-motion:reduce){
  #view.rbs-enter>*,#modalHost.open #sheetBody{animation:none!important}
  .btn,.chip{transition:none!important}}
`;

  let last = '';
  let timer = 0;

  function where() {
    try {
      return [UI.view, UI.clubTab, UI.squadTab, UI.worldTab, UI.trTab, UI.selLeague].join('|');
    } catch (error) { return ''; }
  }

  function arrived() {
    const view = document.getElementById('view');
    if (!view) return;
    const now = where();
    if (now === last) return;
    last = now;
    view.classList.remove('rbs-enter');
    /* reading a layout property restarts the animation on the same node */
    void view.offsetWidth;
    view.classList.add('rbs-enter');
    clearTimeout(timer);
    timer = setTimeout(() => view.classList.remove('rbs-enter'), 520);
  }

  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-visual-refresh';
    style.textContent = CSS;
    document.head.appendChild(style);
    const before = window.render;
    if (typeof before === 'function') {
      window.render = function renderRefreshed() {
        const result = before.apply(this, arguments);
        try { arrived(); } catch (error) { /* the screen is drawn either way */ }
        return result;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
