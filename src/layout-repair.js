/* global mvApplyWide, paintTacticsPitch, CLUBONLY_GROUPS, CLUB_TABS,
          vHome:writable, G, esc */

/* =====================================================================
   LAYOUT REPAIRS
   ---------------------------------------------------------------------
   Reported from a real phone, and reproduced here before anything was
   changed. Each fix carries the measurement that found it.
   ===================================================================== */

(function layoutRepair() {
  /* -------------------------------------------------------------------
     1. TURNING THE PHONE SIDEWAYS SHOWED A BLACK SCREEN
     -------------------------------------------------------------------
     "every time I put my phone into landscape mode and I'm using the
     game it just makes the black screen I can't see the landscape view"

     Reproduced by loading at 390x844, resizing to 844x390 and firing
     `orientationchange`. The page went black while the layout underneath
     was perfectly healthy — #app 844x390, #view 778x332 with sixteen
     children, the header visible, no page errors. So nothing had failed;
     something was on top. `elementFromPoint` at three places on the
     screen all answered the same thing:

         422,195 -> DIV.mvwide#matchScreen
         100,100 -> DIV.mvwide#matchScreen
         700,300 -> DIV.mvwide#matchScreen

     position:fixed, inset:0, z-index 60, background rgb(8,12,9). An
     empty match screen, drawn over the whole game.

     THE CAUSE IS ONE DECLARATION AND IT IS A SPECIFICITY ACCIDENT. The
     match screen is hidden until a match starts:

         #matchScreen      { display:none }        (1,0,1)
         #matchScreen.open { display:flex }        (1,1,1)

     and the wide landscape layout added a third:

         #matchScreen.mvwide { display:grid; ... } (1,1,1)

     `mvwide` is applied by a resize handler that only asks how wide the
     window is — it has no opinion about whether a match is on, and it
     was never meant to have one, because it is a LAYOUT class. But it
     carries `display:grid`, and (1,1,1) beats (1,0,1), so the moment the
     phone was turned the hidden panel was told to display itself. There
     is no content in it, so what you get is its background: black.

     The repair says the only thing that was ever meant: the match screen
     is visible when a match is open, and its shape in landscape is a
     separate question from whether it is on screen at all. */
  function style() {
    if (document.getElementById('layoutRepairCSS')) return;
    const tag = document.createElement('style');
    tag.id = 'layoutRepairCSS';
    tag.textContent = [
      /* !important because the rule being corrected is itself a
         single-class rule on an id, and a later layer adding another
         `#matchScreen.mvwide{display:...}` would otherwise reopen this.
         Whether a panel is on screen is not a thing a layout class is
         allowed to decide. */
      '#matchScreen:not(.open){display:none!important}',

      /* ---------------------------------------------------------------
         2. THE TACTICS PITCH WAS DRAWING ITSELF ON TOP OF ITSELF
         ---------------------------------------------------------------
         "in the tactics area I can't see the fitness or some players
         it's all squished in together"

         Measured at 390x844 before changing anything. The pitch is
         362x454. Each shirt is 52 wide and 65 tall, and the fitness tag
         is absolutely positioned at `bottom:-15px`, so the real
         footprint runs to 80px. The formation rows are as little as 54px
         apart — the keeper to the centre-halves is 11.9% of the pitch —
         so a token is taller than the space between rows and it lands on
         the one below. Counting boxes that genuinely intersect on screen:
         five overlapping pairs out of fifty-five.

         Two changes, and both are arithmetic rather than taste:

         a) THE TOKEN IS ONE LINE SHORTER. The position and the fitness
            read-out were two stacked lines saying "MC" and "100% · 6.1".
            They sit on one line now, which is where a broadcast graphic
            puts them anyway, and the fitness tag stops hanging outside
            the token into the next row.

         b) THE PITCH IS THE SHAPE OF A PITCH. `paintTacticsPitch` sized
            it at width x 1.26. A real pitch is 105 by 68, which is 1.54.
            Going to 1.45 is both more honest and thirty per cent more
            room between the rows, which is what the tokens needed.

         The first pass of this got it from five clashes to two, and the
         two left were the goalkeeper against both centre-halves by ten
         pixels — the tightest gap in any formation, because a keeper
         stands six metres out and a centre-half twenty. So the token is
         trimmed again rather than the pitch stretched to a shape a pitch
         is not: gaining ten pixels of gap that way would need a ratio of
         1.70. Verified by re-running the same measurement. */
      '#tacPitch .tslot{width:62px}',
      '#tacPitch .tslot .jersey{width:30px;height:30px;font-size:11px}',
      '#tacPitch .tslot .nm{margin-top:2px;font:700 9px/1.15 var(--body)}',
      /* position and vitals share a line: both inline, and the vitals
         tag stops being absolutely positioned so it flows after it */
      '#tacPitch .tslot .ps{display:inline;vertical-align:middle}',
      '#tacPitch .tslot .tvit{position:static;transform:none;display:inline-flex;',
      ' vertical-align:middle;margin-left:3px;font-size:8px;line-height:1.1}',
      '#tacPitch .tslot .ps{font-size:8px;line-height:1.1}',
      /* the name is the one thing allowed to be clipped, and only after
         it has had the full width of the token */
      '#tacPitch .tslot .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

      /* ---------------------------------------------------------------
         3. WHAT IS NOT HERE, AND WHY
         ---------------------------------------------------------------
         There WAS a rule here that put the pitch first on a phone:

             @media (max-width:659px){
               #view[data-view="tactics"]{display:flex;flex-direction:column}
               #view[data-view="tactics"]>#tacPitch{order:-1}
             }

         It wrecked the screen and it went out. Nobody asked for it — I
         added it because the formation picker takes 535px before the
         pitch starts — and the cost of being clever there was every card
         on the tactics screen collapsing into a strip with its contents
         spilling over the one below.

         THE MECHANISM, because it is worth not repeating. A flex item
         has `flex-shrink:1`. The view is a scroll container with a
         definite height and eighty-one children whose total height is
         several times that, so the moment it became a flex column the
         browser did what it is supposed to do and compressed every child
         to fit. Measured after the report: `.pitchbox` came back
         `clientHeight=0` against `scrollHeight=30`, shrink 1. A grid does
         not do this and a block does not do this; only flex does, and
         only when you turn a long scrolling page into one.

         `#view>*{flex:0 0 auto}` would have fixed it. It is still not
         worth it: the reordering was my idea rather than a fault being
         repaired, and the way to guarantee a screen is not broken by a
         layout change is not to make the layout change. The pitch is one
         short scroll down, as it has always been.

         The sweep that passed this screen has been taught the shape of
         this bug — see `scripts/sweep-screens.cjs` — so a squashed box
         is a fault it reports rather than one it walks past. */

      /* ---------------------------------------------------------------
         5. AND IN LANDSCAPE, NEARLY EVERY SCREEN DREW THROUGH ITSELF
         ---------------------------------------------------------------
         Swept all twenty-one screens in both orientations, counting
         pairs of cards whose boxes genuinely intersect. Portrait: zero
         faults, every screen. Landscape: thirteen screens with overlaps,
         some of them enormous — twenty pairs through the stadium hero,
         and one 227px deep on the Stats tab.

         Grid items cannot overlap, so the rows had to be wrong, and the
         computed grid on the Stadium tab says it plainly:

             grid-template-rows: 52px 2px 17px 38px 17px 38px ...
             .stadhero   359px tall   in the 2px row
             .card       136px tall   in the 38px row

         Two pixels is the hero's top and bottom border and nothing else,
         which is the tell: the track was sized as though the box were
         empty. Every one of the offenders is either a scroll container
         (`overflow:hidden` to clip the stadium drawing, `overflow:auto`
         on the cards) or holds an SVG sized `width:100%;height:auto` —
         and a box in one of those two states contributes nothing to an
         `auto` track. It still paints at its content height afterwards,
         so it lands on everything below it.

         RATHER THAN REASON ABOUT WHICH ONE IT WAS, four candidate rules
         were measured against the same five worst screens:

             baseline                              37 overlaps
             #view{display:block}                   0   (loses the columns)
             #view{grid-auto-rows:max-content}      0
             #view>*{overflow:visible}              0   (loses the clipping)
             #view>*{min-height:fit-content}       79   (worse)

         `max-content` is the one that keeps both columns and keeps the
         clipping. It says: size each implicit row to the full height of
         what is in it, and never to what the box claims when asked to be
         as small as possible.

         Scoped to the landscape grid, which is the only place implicit
         rows are created. */
      '@media (orientation:landscape) and (min-width:660px) and (max-width:1023px){',
      ' #app>#view{grid-auto-rows:max-content}',
      /* and the same rule in the other axis: a grid item's automatic
         minimum size is its content, so an item holding a row of chips
         that will not wrap grows wider than its column and the last chip
         hangs off the edge. Measured on Tactics in landscape: a chip
         running 753..830 in a 778px view. `min-width:0` lets the column
         hold it and the row inside wrap. */
      ' #app>#view>*{min-width:0}',
      '}',

      /* ---------------------------------------------------------------
         6. A ROW MARKED AS A SCROLLER THAT COULD NEITHER SCROLL NOR WRAP
         ---------------------------------------------------------------
         The one fault left after (5): on Tactics in landscape a chip
         running 753..830 in a 778px view — "3-5-2 WB", the last
         formation. Tracing its ancestors:

             BUTTON.chip        w=77   overflow-x:visible  wrap:nowrap
             DIV.chips.xscroll  w=750  overflow-x:visible  wrap:nowrap

         `xscroll` is the class the game puts on the rows that really are
         horizontal scrollers — it carries the fade mask on the last chip
         and an inline `--fl/--fr` for where that fade sits. A later
         layer then decided chips should wrap instead of scroll and set
         `overflow-x:visible` on `.chips` wholesale, which caught the
         marked scrollers too. Left with `nowrap` and nothing to scroll
         in, the row simply overflows and the last chip is cut off by
         `#view{overflow-x:hidden}`.

         A row that says it is a scroller gets to scroll.

         THE SELECTOR HAS TO BE THAT LONG. The rule holding it visible is
         the landscape shell's own full-width band list —

             #app>#view>table, #app>#view>.chips, ... , #app>#view>.xscroll
               { grid-column:1/-1; overflow:visible }

         — which is two ids, so `#view .chips.xscroll` loses to it no
         matter how many classes it carries. Ids are compared first.

         And that `overflow:visible` was itself a workaround: the comment
         beneath it says the tab row measured 24px in a track while it
         laid out at 52, which is the very collapse (5) has now fixed at
         the source. So taking the scrolling back is safe — the rows do
         not need to be visible to be measured any more. */
      '@media (orientation:landscape) and (min-width:660px) and (max-width:1023px){',
      ' #app>#view>.chips.xscroll,#app>#view>.subtabs.xscroll,',
      ' #app>#view>.secnav.xscroll{overflow-x:auto;flex-wrap:nowrap}',
      '}',
      '#view .chips.xscroll,#view .subtabs.xscroll{overflow-x:auto;flex-wrap:nowrap}',
    ].join('');
    document.head.appendChild(tag);
  }

  /* -------------------------------------------------------------------
     4. THE TRAINING GROUND HAD NO DOOR ON IT
     -------------------------------------------------------------------
     "training area very clear path to train and shouldn't have to search
     for it"

     He is right, and it is not a matter of taste — the door was removed
     by accident. Training used to be the third room under "The club":

         ['The club',[['staff','Staff'],['stadium','Stadium'],
                      ['training','Training'],['finances','Finances']]]

     When the Club and World screens were split into two doors the club
     side was rewritten as CLUBONLY_GROUPS, and Training was not carried
     across. Enumerating the live navigation confirms it:

         clubTabs  staff, stadium, finances, trophies, media, save
         squadTabs first, academy, loans, treat, training

     So the only way in is the fifth chip on the squad screen's scrolling
     tab strip, which on a 390px phone is off the right-hand edge. You
     have to know it is there to find it.

     Two doors go back on. The room itself is untouched — `vTraining` is
     already wired into the club screen's dispatch, which is how the tab
     worked before it was dropped from the list. */
  function reopenTraining() {
    try {
      if (typeof CLUBONLY_GROUPS !== 'undefined') {
        const club = CLUBONLY_GROUPS.filter((g) => g[0] === 'The club')[0];
        if (club && !club[1].some((x) => x[0] === 'training')) {
          /* back where it was: after the stadium it is trained in */
          const at = club[1].findIndex((x) => x[0] === 'stadium');
          club[1].splice(at < 0 ? club[1].length : at + 1, 0, ['training', 'Training']);
        }
      }
      if (typeof CLUB_TABS !== 'undefined' && CLUB_TABS.indexOf('training') < 0) {
        CLUB_TABS.push('training');
      }
    } catch (error) { /* the squad tab still gets you there */ }
  }
  reopenTraining();

  /* and a tile on the home screen, beside Tactics, because the two are
     the same job: what the eleven does on Saturday and what it does the
     rest of the week */
  if (typeof vHome === 'function') {
    const previous = vHome;
    vHome = function vHomeWithTraining() {
      const html = previous.apply(this, arguments);
      try {
        if (html.indexOf('data-tab="training"') >= 0) return html;
        /* Anchored on the exact string `tile()` emits for the tactics
           tile rather than on an index into the markup. Six layers write
           this screen; counting `</div>`s from a match would find the
           end of `.pt-top` and put the tile inside its neighbour. If the
           anchor ever stops existing the replace is a no-op and the home
           screen is exactly what it was. */
        const anchor = '<div class="ptile" data-action="jump" data-v="tactics">';
        if (html.indexOf(anchor) < 0) return html;
        const club = G.clubs[G.my];
        const facilities = (club && club.stad && club.stad.train) || 1;
        const coach = (G.staff && G.staff.coach && G.staff.coach.stars) || 2;
        const tile = '<div class="ptile" data-action="jump" data-v="squad" data-tab="training">'
          + '<div class="pt-top"><span class="pt-ic">🏋️</span>'
          + '<span class="pt-lbl">Training</span></div>'
          + '<div class="pt-val">' + esc(String(G.trainInt || 'Normal')) + '</div>'
          + '<div class="pt-sub">' + facilities + '/5 facilities · ' + coach + '★ coaching</div>'
          + '</div>';
        return html.replace(anchor, tile + anchor);
      } catch (error) {
        return html;
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', style, { once: true });
  } else {
    style();
  }

  /* the pitch's own proportions — see (b) above */
  if (typeof paintTacticsPitch === 'function') {
    const previous = paintTacticsPitch;
    paintTacticsPitch = function paintTacticsPitchTaller() {
      const result = previous.apply(this, arguments);
      try {
        const box = document.getElementById('tacPitch');
        if (box && box.clientWidth) {
          box.style.height = Math.round(box.clientWidth * 1.45) + 'px';
        }
      } catch (error) { /* the original height stands */ }
      return result;
    };
  }

  /* And the same thought in the one place that can act on it: a screen
     that is not open does not need a landscape shape worked out for it.
     The CSS above is the guarantee; this just stops the work. */
  if (typeof mvApplyWide === 'function') {
    const previous = mvApplyWide;
    mvApplyWide = function mvApplyWideOnlyWhenOpen() {
      try {
        const screen = document.getElementById('matchScreen');
        if (screen && !screen.classList.contains('open')) {
          screen.classList.remove('mvwide');
          return false;
        }
      } catch (error) { /* fall through to the original */ }
      return previous.apply(this, arguments);
    };
  }
}());
