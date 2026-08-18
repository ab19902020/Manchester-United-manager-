/* global THREE */

/* =====================================================================
   THE MATCHDAY BROADCAST, INSIDE THE GAME
   ---------------------------------------------------------------------
   "you've made a separate dot file. We can't have that. It's gonna be
    merged into the main games, so it works with it."

   Right, and for a better reason than tidiness: as its own page it had
   to be reached through an iframe, and a browser refuses same-origin
   access to an iframe on a `file://` page - so opening the game off a
   disk fell back to the old view and nothing explained why. As part of
   the game there is no frame, no second document, and no origin rule to
   fall foul of.

   Three things had to change to bring it in, and only three:

   1. ITS STYLESHEET IS SCOPED. Nineteen class names, thirteen of which
      the game already uses - .card, .chip, .row, .on, .num. Left alone
      its `.card{}` would have restyled every card in the game. Every
      rule now sits under #mdHost, and its html,body rule became the
      host. Its thirty-two ids collide with nothing, so those are
      untouched.

   2. position:fixed BECAME position:absolute. Fixed is relative to the
      viewport, so the pitch and the HUD would have escaped the dugout
      and covered the whole game.

   3. IT SIZES TO THE HOST rather than to the window.

   The engine is otherwise the file from the Gamefootball repository,
   unedited, and it boots lazily - a WebGL context is not worth building
   until somebody walks into the dugout.
   ===================================================================== */

(function matchdayEngine() {
  var STYLE_ID = 'mdStyle';
  var CSS = '/* the host itself is the stage */\n#mdHost{position:relative;contain:layout paint}\n#mdHost *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}\n#mdHost{width:100%;height:100%;overflow:hidden;background:#03050d;\n    font-family:"Arial Narrow","Helvetica Neue",system-ui,sans-serif;\n    user-select:none;-webkit-user-select:none;touch-action:none;overscroll-behavior:none}\n#mdHost #scene{position:absolute;inset:0;display:block}\n#mdHost #hud{position:absolute;inset:0;pointer-events:none;z-index:10}\n\n  /* -------- scoreboard -------- */\n#mdHost .board{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);left:12px;\n    display:flex;height:40px;border-radius:4px;overflow:hidden;\n    box-shadow:0 8px 26px rgba(0,0,0,.6)}\n#mdHost .crest{width:7px}\n#mdHost .side{display:flex;align-items:center;gap:9px;padding:0 10px;background:rgba(10,14,32,.9)}\n#mdHost .abbr{font-size:17px;font-weight:700;letter-spacing:.1em;color:#eef2fb}\n#mdHost .num{font-size:20px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;\n    font-family:ui-monospace,"SF Mono",Menlo,monospace}\n#mdHost .clock{display:flex;flex-direction:column;justify-content:center;align-items:center;\n    padding:0 9px;background:#e9ff4a;min-width:56px}\n#mdHost .clock b{font-size:15px;font-weight:700;color:#0a0e20;font-variant-numeric:tabular-nums;\n    font-family:ui-monospace,"SF Mono",Menlo,monospace;line-height:1}\n#mdHost .clock i{font-size:7px;letter-spacing:.2em;color:#0a0e20;font-style:normal;opacity:.7;margin-top:2px}\n#mdHost .poss{position:absolute;top:calc(env(safe-area-inset-top,0px) + 54px);left:12px;\n    width:198px;height:16px;background:rgba(10,14,32,.9);border-radius:3px;overflow:hidden;\n    display:flex;align-items:center;font-size:9px;letter-spacing:.12em;color:#eef2fb}\n#mdHost .poss span{padding:0 6px;z-index:2;font-weight:700}\n#mdHost .poss span:last-child{margin-left:auto}\n#mdHost #possFill{position:absolute;left:0;top:0;bottom:0;width:50%;opacity:.55}\n\n  /* -------- controls -------- */\n#mdHost .rail{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);right:12px;\n    display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:auto}\n#mdHost .grp{display:flex;gap:5px}\n#mdHost .chip{height:34px;min-width:34px;padding:0 9px;border-radius:4px;background:rgba(10,14,32,.86);\n    border:1px solid rgba(238,242,251,.16);color:#dfe5f4;display:flex;align-items:center;\n    justify-content:center;font-size:10px;letter-spacing:.11em;font-weight:700;cursor:pointer}\n#mdHost .chip.on{background:#e9ff4a;color:#0a0e20;border-color:#e9ff4a}\n#mdHost .chip:active{transform:scale(.96)}\n#mdHost .chip svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;\n    stroke-linecap:round;stroke-linejoin:round}\n\n  /* -------- radar -------- */\n#mdHost #radar{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);right:12px;\n    width:170px;height:104px;opacity:.92;filter:drop-shadow(0 6px 16px rgba(0,0,0,.7))}\n\n  /* -------- ticker -------- */\n#mdHost #feed{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);left:12px;\n    width:210px;display:flex;flex-direction:column-reverse;gap:4px}\n#mdHost .ev{background:rgba(10,14,32,.82);border-left:3px solid #e9ff4a;padding:5px 8px;\n    border-radius:2px;font-size:10px;letter-spacing:.05em;color:#cfd7ea;\n    font-family:system-ui,-apple-system,sans-serif;animation:slide .3s ease}\n#mdHost .ev b{color:#fff}\n  @keyframes slide{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}\n\n  /* -------- lower third -------- */\n#mdHost #lower{position:absolute;left:0;right:0;bottom:22%;display:flex;justify-content:center;\n    opacity:0;transition:opacity .3s}\n#mdHost #lower .card{display:flex;align-items:stretch;box-shadow:0 14px 40px rgba(0,0,0,.7);\n    border-radius:4px;overflow:hidden;transform:translateY(14px);transition:transform .35s}\n#mdHost #lower.show .card{transform:none}\n#mdHost #lower .tag{background:#e9ff4a;color:#0a0e20;font-size:26px;font-weight:700;\n    letter-spacing:.22em;padding:12px 18px;display:flex;align-items:center}\n#mdHost #lower .txt{background:rgba(10,14,32,.94);padding:10px 20px;display:flex;\n    flex-direction:column;justify-content:center;min-width:170px}\n#mdHost #lower .txt b{color:#fff;font-size:19px;letter-spacing:.09em}\n#mdHost #lower .txt i{color:#98a3bd;font-size:10px;font-style:normal;letter-spacing:.2em;margin-top:3px}\n\n  /* -------- menu -------- */\n#mdHost #menu{position:absolute;inset:0;z-index:30;background:rgba(3,5,13,.92);backdrop-filter:blur(12px);\n    display:flex;align-items:center;justify-content:center;padding:22px}\n#mdHost #menu.off{display:none}\n#mdHost .card2{width:min(370px,100%);background:rgba(10,14,32,.95);\n    border:1px solid rgba(238,242,251,.13);border-radius:8px;padding:22px}\n#mdHost .card2 h1{font-size:25px;letter-spacing:.15em;color:#eef2fb;font-weight:700;line-height:1.15}\n#mdHost .card2 h1 em{font-style:normal;color:#e9ff4a}\n#mdHost .card2 p{font-size:12px;line-height:1.6;color:rgba(238,242,251,.55);margin-top:9px;\n    font-family:system-ui,-apple-system,sans-serif}\n#mdHost .row{display:flex;align-items:center;justify-content:space-between;margin-top:13px;\n    padding-top:11px;border-top:1px solid rgba(238,242,251,.09)}\n#mdHost .row label{font-size:10px;letter-spacing:.17em;color:rgba(238,242,251,.6)}\n#mdHost .seg{display:flex;gap:4px}\n#mdHost .seg button{background:rgba(238,242,251,.07);border:1px solid rgba(238,242,251,.13);\n    color:#e3e8f5;font-size:10px;letter-spacing:.09em;padding:6px 9px;border-radius:3px;\n    font-family:inherit;cursor:pointer}\n#mdHost .seg button.on{background:#e9ff4a;color:#0a0e20;border-color:#e9ff4a;font-weight:700}\n#mdHost .go{width:100%;margin-top:19px;padding:14px;border:none;border-radius:4px;background:#e9ff4a;\n    color:#0a0e20;font-size:14px;font-weight:700;letter-spacing:.2em;font-family:inherit;cursor:pointer}\n#mdHost #load{position:absolute;inset:0;z-index:40;background:#03050d;display:flex;\n    align-items:center;justify-content:center;color:#e9ff4a;font-size:11px;letter-spacing:.35em}\n#mdHost #load.off{display:none}\n\n  /* -------- broadcast grade --------\n     A vignette, a cool lift in the shadows and a whisper of grain. None\n     of this costs a draw call and together they do most of what a real\n     post chain would: they stop the render reading as a render. */\n#mdHost #grade{position:absolute;inset:0;z-index:5;pointer-events:none;\n    background:radial-gradient(125% 92% at 50% 44%,\n      rgba(0,0,0,0) 38%, rgba(0,0,0,.20) 70%, rgba(2,4,12,.62) 100%)}\n#mdHost #tint{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:.16;\n    mix-blend-mode:screen;\n    background:linear-gradient(178deg, rgba(80,130,255,.55) 0%,\n      rgba(0,0,0,0) 46%, rgba(255,178,90,.30) 100%)}\n#mdHost #grain{position:absolute;inset:-60%;z-index:6;pointer-events:none;opacity:.05;\n    background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'180\' height=\'180\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E");\n    animation:grain 1.1s steps(5) infinite}\n  @keyframes grain{\n    0%{transform:translate(0,0)}      20%{transform:translate(-3%,-4%)}\n    40%{transform:translate(2%,3%)}   60%{transform:translate(-2%,4%)}\n    80%{transform:translate(4%,-2%)}  100%{transform:translate(0,0)}}\n\n  /* -------- brand bug -------- */\n#mdHost #bug{position:absolute;top:calc(env(safe-area-inset-top,0px) + 78px);left:12px;\n    display:flex;align-items:center;gap:7px;padding:5px 9px 5px 6px;\n    background:linear-gradient(90deg,rgba(10,12,16,.92),rgba(10,12,16,.55));\n    border-left:3px solid #da291c;border-radius:3px}\n#mdHost #bug canvas{width:22px;height:22px;display:block;border-radius:3px}\n#mdHost #bug b{font-size:10px;letter-spacing:.16em;color:#fff;font-weight:700;line-height:1.15}\n#mdHost #bug i{font-size:8px;letter-spacing:.14em;color:#f5c518;font-style:normal;display:block}\n#mdHost .live{display:inline-block;width:5px;height:5px;border-radius:50%;background:#ff3b3b;\n    margin-right:5px;vertical-align:middle;animation:pulse 1.6s ease-in-out infinite}\n  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}';
  var MARKUP = '<canvas id="scene"></canvas>\n\n<div id="hud">\n  <div class="board">\n    <div class="crest" id="crestA"></div>\n    <div class="side"><span class="abbr" id="abbrA"></span><span class="num" id="scoreA">0</span></div>\n    <div class="clock"><b id="clock">00:00</b><i id="period">1ST</i></div>\n    <div class="side"><span class="num" id="scoreB">0</span><span class="abbr" id="abbrB"></span></div>\n    <div class="crest" id="crestB"></div>\n  </div>\n  <div class="poss"><div id="possFill"></div><span id="possA">50%</span><span id="possB">50%</span></div>\n  <div id="bug"><canvas id="bugLogo" width="64" height="64"></canvas>\n    <b><span class="live"></span>UNITED ROAD<i id="bugDomain">unitedroad.uk</i></b></div>\n\n  <div class="rail">\n    <div class="grp">\n      <div class="chip" id="btnFull"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></div>\n      <div class="chip" id="btnPause"><svg viewBox="0 0 24 24"><path d="M9 4v16M15 4v16"/></svg></div>\n    </div>\n    <div class="grp" id="camGrp">\n      <div class="chip on" data-cam="auto">AUTO</div>\n      <div class="chip" data-cam="broadcast">WIDE</div>\n      <div class="chip" data-cam="tele">TELE</div>\n      <div class="chip" data-cam="goal">GOAL</div>\n    </div>\n    <div class="grp" id="spdGrp">\n      <div class="chip on" data-spd="1">1×</div>\n      <div class="chip" data-spd="2">2×</div>\n      <div class="chip" data-spd="4">4×</div>\n    </div>\n  </div>\n\n  <div id="feed"></div>\n  <canvas id="radar" width="340" height="208"></canvas>\n\n  <div id="lower"><div class="card">\n    <div class="tag" id="lowTag">GOAL</div>\n    <div class="txt"><b id="lowName">—</b><i id="lowSub">—</i></div>\n  </div></div>\n</div>\n\n<div id="menu">\n  <div class="card2">\n    <h1>MATCHDAY<br><em>BROADCAST</em></h1>\n    <p>Northgate against Valemont, played out by the AI under the lights at United Road. You\'re in the gantry — pick a camera, change the speed, and watch. AUTO cuts to the keeper for a save and behind the goal for a celebration.</p>\n    <div class="row"><label>HALF LENGTH</label>\n      <div class="seg" id="segLen"><button data-v="120">2m</button><button data-v="240" class="on">4m</button><button data-v="420">7m</button></div></div>\n    <div class="row"><label>TEMPO</label>\n      <div class="seg" id="segDiff"><button data-v="0.7">LOOSE</button><button data-v="0.86" class="on">PRO</button><button data-v="1">ELITE</button></div></div>\n    <div class="row"><label>DETAIL</label>\n      <div class="seg" id="segQual"><button data-v="1" class="on">HIGH</button><button data-v="0">LITE</button></div></div>\n    <button class="go" id="btnStart">KICK OFF</button>\n  </div>\n</div>\n<div id="grade"></div>\n<div id="tint"></div>\n<div id="grain"></div>\n<div id="load">WARMING UP</div>\n\n<!-- OUR VENDORED COPY, NOT A CDN. The upstream file pulls three.js r128\n     from cdnjs; this game ships offline and onto CrazyGames, where an\n     outside request is at best a slow frame and at worst a black screen.\n     vendor/three.min.js is the same revision, r128, so nothing else in\n     this file changes. -->';
  var booted = false;
  var host = null;
  function hostW(){ return (host && host.clientWidth) || 640; }
  function hostH(){ return (host && host.clientHeight) || 360; }
  function inject(){
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function boot() {
"use strict";
/* =====================================================================
   MATCHDAY — AI vs AI football, broadcast presentation.
   Simulation core (physics / team AI / rules) carried over and tuned;
   this build replaces control with a camera director and a full art pass.
   ===================================================================== */

/* =====================================================================
   BRAND — everything United Road, in one place.

   >>> TO USE YOUR REAL LOGO: set logoSrc below. <<<
   It accepts a data URI (best — keeps this file self-contained and
   avoids canvas tainting) or any same-origin / CORS-enabled URL:

       logoSrc: 'data:image/png;base64,iVBORw0KGgo...'

   It loads asynchronously and repaints the LED boards, the shirt-sponsor
   patch and the big-screen bug the moment it arrives, so nothing has to
   wait on it. Leave it null and the procedural mark below is drawn
   instead — a road running to a horizon inside a rounded badge, which is
   what the boards ship with until you paste the real artwork in.
   ===================================================================== */
const BRAND = {
  name:      'UNITED ROAD',
  domain:    'unitedroad.uk',
  youtube:   '@unitedroad',              // <-- put your real handle here
  tagline:   'FOLLOW THE ROAD',
  ink:       '#ffffff',
  red:       '#da291c',
  deep:      '#0a0c10',
  gold:      '#f5c518',
  logoSrc:   null                        // <-- your logo goes here
};
const BRAND_LOGO = { img:null, ready:false };
if(BRAND.logoSrc){
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = ()=>{ BRAND_LOGO.img = im; BRAND_LOGO.ready = true; repaintBrand(); };
  im.src = BRAND.logoSrc;
}

const CFG = {
  L:105, W:68, GOAL_W:7.32, GOAL_H:2.44,
  PEN_D:16.5, PEN_W:40.32, SIX_D:5.5, SIX_W:18.32,
  CIRCLE:9.15, SPOT:11, BALL_R:0.11, DT:1/60,
  JOG:5.6, SPRINT:8.0, ACCEL:13, DECEL:18, TURN:7.5, CTRL_R:1.35
};
const HALF_L = CFG.L/2, HALF_W = CFG.W/2;

const TEAMS = [
  { name:'NORTHGATE', abbr:'NOR', shirt:'#16307d', trim:'#f3f6ff', shorts:'#f3f6ff',
    socks:'#16307d', sleeve:'#0f2260', pattern:'pinstripe', radar:'#5b8bff', chip:'#16307d',
    sponsor:BRAND.name, sponsorInk:'#ffffff', numberInk:'#ffffff',
    formation:'4-3-3', mentality:'Balanced', quality:13, squad:null },
  { name:'VALEMONT', abbr:'VAL', shirt:'#b02024', trim:'#1a1a1f', shorts:'#1a1a1f',
    socks:'#b02024', sleeve:'#8c161a', pattern:'stripe', radar:'#ff6b6b', chip:'#b02024',
    sponsor:'THE RESULTS BUSINESS', sponsorInk:'#ffffff', numberInk:'#ffffff',
    formation:'4-4-2', mentality:'Balanced', quality:13, squad:null }
];
const GK_KITS = [
  { shirt:'#1fbf7a', trim:'#0d2a1e', shorts:'#0d2a1e', socks:'#1fbf7a', sleeve:'#17a066',
    pattern:'none', numberInk:'#0d2a1e' },
  { shirt:'#f2b52a', trim:'#241a06', shorts:'#241a06', socks:'#f2b52a', sleeve:'#d69b16',
    pattern:'none', numberInk:'#241a06' }
];

/* The manager stores a shape as x along the length (0-100) and y across
   the width (0-68). This engine works in -1..1 either way, measured from
   the centre spot, so a shape converts once on load and never again. */
function slotVec(x, y){
  return { x: THREE.MathUtils.clamp((x-50)/50, -0.98, 0.98),
           y: THREE.MathUtils.clamp((y-34)/34, -0.95, 0.95) };
}

/* Fill in anything a caller did not supply: a shape from the formation
   table, names from the pool, a physique from the position group and a
   full attribute set at the club's level. Called for both sides at
   kick-off, so a standalone match still has eleven real players a side. */
function buildSquad(t){
  const T = TEAMS[t];
  const shape = FORMATIONS[T.formation] || FORMATIONS['4-3-3'];
  const supplied = T.squad || [];
  const squad = [];
  for(let i=0;i<11;i++){
    const [slot, fx, fy] = shape[i];
    const given = supplied[i] || {};
    const grp = SLOT_GROUP[given.slot || slot] || 'M';
    const a = ANTHRO[grp];
    const ph = given.heightCm && given.weightKg
      ? { h: THREE.MathUtils.clamp(given.heightCm,150,215)/100,
          w: THREE.MathUtils.clamp(given.weightKg,45,130) }
      : { h: THREE.MathUtils.clamp(a.h + gauss()*a.hsd, 166, 203)/100,
          w: THREE.MathUtils.clamp(a.w + gauss()*a.wsd, 58, 104) };
    const bmi = ph.w/(ph.h*ph.h);
    squad.push({
      pid:   given.id != null ? String(given.id) : T.abbr+'-'+i,
      name:  (given.name || (NAME_POOL[t%2]||NAME_POOL[0])[i] || 'PLAYER').toUpperCase(),
      num:   given.number || given.shirt || (i+1),
      slot:  given.slot || slot,
      pos:   given.pos ? slotVec(given.pos[0], given.pos[1]) : slotVec(fx, fy),
      h: ph.h, w: ph.w,
      build: THREE.MathUtils.clamp(1 + (bmi-22.4)*0.030, 0.86, 1.15),
      attrs: given.attrs || rollAttrs(given.slot || slot, T.quality || 12),
      morale: given.morale, cond: given.cond, sharp: given.sharp
    });
  }
  T.squad = squad;
  return squad;
}

const S = {
  phase:'menu', clock:0, half:1, halfLen:240, score:[0,0],
  aiSkill:0.86, offsideOn:true, freeze:0, restart:null, passTo:null,
  possTeam:1, lastTouch:null, pendingOffside:null, running:false,
  dir:[1,-1], speed:1, quality:1,
  /* aerial and loose are duels won, which is a real match statistic and
     also the only way to measure whether an attribute does anything: a
     scoreline gives you one number a match, duels give you hundreds. */
  stats:{ poss:[0,0], shots:[0,0], onTarget:[0,0], corners:[0,0],
          aerial:[0,0], loose:[0,0] }, stoppage:0,
  camMode:'auto', camShot:'broadcast', camHold:0, focus:null,
  org:[0.5,0.5]        /* how well each side is led — see teamOrg() */
};

/* =====================================================================
   ATTRIBUTES AND SQUADS — the seam the manager game plugs into
   ---------------------------------------------------------------------
   Nothing in the match logic below invents a player's ability any more.
   Every decision — how hard he can run, whether a pass finds its man,
   whether he shoots or squares it, whether a tackle wins the ball, what
   the keeper gets a hand to — is read out of the same nineteen
   attributes The Results Business already stores, on the same 1-20
   scale, under the same names:

     passing shooting dribbling tackling crossing firstTouch heading
     positioning vision workRate decisions composure aggression
     leadership pace acceleration stamina strength agility

   Four goalkeeping attributes and two outfield ones are DERIVED rather
   than stored, exactly as the manager derives them: handling, reflexes,
   oneOnOnes and distribution for keepers, offTheBall and marking for
   everyone else. They blend the attributes a player already has with a
   variation seeded on his own id, so two identically-rated keepers are
   still different keepers and no save file has to change.

   A 20-rated passer misplaces almost nothing. A 3-rated passer gives it
   away. That is the whole point of the exercise, and it is worth knowing
   that the spread is deliberately wide: see PASS_ERR below.
   ===================================================================== */

const ATTR_KEYS = ['passing','shooting','dribbling','tackling','crossing','firstTouch',
  'heading','positioning','vision','workRate','decisions','composure','aggression',
  'leadership','pace','acceleration','stamina','strength','agility'];

/* The manager's position slots, and how each one plays here. */
const SLOT_GROUP = {GK:'GK', DL:'D',DC:'D',DR:'D',WBL:'D',WBR:'D',
  DM:'M',MC:'M',ML:'M',MR:'M',AMC:'M', AML:'F',AMR:'F',ST:'F'};
const SLOT_WIDE = {DL:1,DR:1,WBL:1,WBR:1,ML:1,MR:1,AML:1,AMR:1};
const SLOT_FWD  = {ST:1,AML:1,AMR:1,AMC:1};
const SLOT_DEF  = {DL:1,DC:1,DR:1,WBL:1,WBR:1};

/* Position emphasis, same shape and much the same numbers as the
   manager's W table — used to generate a plausible standalone squad
   when nothing has been loaded. Real squads overwrite all of it. */
const SLOT_W = {
  GK:{passing:.7,shooting:.15,dribbling:.2,tackling:.2,crossing:.1,firstTouch:.6,heading:.4,positioning:1.25,vision:.6,workRate:.7,decisions:1.05,composure:1.05,aggression:.5,leadership:.9,pace:.5,acceleration:.5,stamina:.6,strength:.9,agility:1.3},
  DL:{passing:.95,shooting:.4,dribbling:.85,tackling:1.15,crossing:1.1,firstTouch:.9,heading:.8,positioning:1.1,vision:.8,workRate:1.15,decisions:1,composure:.9,aggression:.95,leadership:.8,pace:1.1,acceleration:1.05,stamina:1.15,strength:.9,agility:.95},
  DC:{passing:.85,shooting:.3,dribbling:.55,tackling:1.3,crossing:.35,firstTouch:.8,heading:1.3,positioning:1.3,vision:.7,workRate:.95,decisions:1.15,composure:1,aggression:1.05,leadership:1.05,pace:.9,acceleration:.85,stamina:.9,strength:1.25,agility:.8},
  DM:{passing:1.1,shooting:.55,dribbling:.8,tackling:1.25,crossing:.5,firstTouch:1,heading:.95,positioning:1.25,vision:1,workRate:1.2,decisions:1.2,composure:1.05,aggression:1,leadership:.95,pace:.85,acceleration:.85,stamina:1.15,strength:1.05,agility:.85},
  MC:{passing:1.2,shooting:.8,dribbling:1,tackling:.95,crossing:.7,firstTouch:1.1,heading:.7,positioning:1,vision:1.15,workRate:1.1,decisions:1.15,composure:1.05,aggression:.8,leadership:.9,pace:.85,acceleration:.9,stamina:1.15,strength:.9,agility:.9},
  ML:{passing:1.05,shooting:.8,dribbling:1.15,tackling:.8,crossing:1.2,firstTouch:1.05,heading:.6,positioning:.9,vision:1,workRate:1.1,decisions:.95,composure:.9,aggression:.7,leadership:.7,pace:1.15,acceleration:1.15,stamina:1.1,strength:.75,agility:1.05},
  AMC:{passing:1.25,shooting:1.05,dribbling:1.15,tackling:.55,crossing:.75,firstTouch:1.2,heading:.55,positioning:.85,vision:1.3,workRate:.9,decisions:1.15,composure:1.1,aggression:.6,leadership:.85,pace:.9,acceleration:1,stamina:.95,strength:.75,agility:1.05},
  AML:{passing:1,shooting:1.05,dribbling:1.3,tackling:.5,crossing:1.1,firstTouch:1.15,heading:.55,positioning:.8,vision:1,workRate:.9,decisions:.95,composure:1,aggression:.6,leadership:.65,pace:1.3,acceleration:1.3,stamina:1,strength:.7,agility:1.15},
  ST:{passing:.8,shooting:1.35,dribbling:1.05,tackling:.35,crossing:.5,firstTouch:1.2,heading:1.1,positioning:1.05,vision:.85,workRate:.9,decisions:1,composure:1.25,aggression:.85,leadership:.75,pace:1.15,acceleration:1.15,stamina:.95,strength:1.05,agility:1}
};
SLOT_W.DR=SLOT_W.DL; SLOT_W.WBL={...SLOT_W.DL,crossing:1.25,stamina:1.3,pace:1.2};
SLOT_W.WBR=SLOT_W.WBL; SLOT_W.MR=SLOT_W.ML; SLOT_W.AMR=SLOT_W.AML;

/* The manager's five formations, verbatim: [slot, x along the length
   0-100, y across the width 0-68]. Converted to this engine's -1..1
   slot space on load. */
const FORMATIONS = {
 '4-4-2':[['GK',6,34],['DL',22,7],['DC',19,25],['DC',19,43],['DR',22,61],['ML',49,7],['MC',45,26],['MC',45,42],['MR',49,61],['ST',76,27],['ST',76,41]],
 '4-3-3':[['GK',6,34],['DL',23,7],['DC',19,25],['DC',19,43],['DR',23,61],['DM',38,34],['MC',52,21],['MC',52,47],['AML',73,9],['ST',80,34],['AMR',73,59]],
 '3-5-2':[['GK',6,34],['DC',20,17],['DC',18,34],['DC',20,51],['WBL',44,6],['DM',40,34],['MC',54,23],['MC',54,45],['WBR',44,62],['ST',77,27],['ST',77,41]],
 '4-2-3-1':[['GK',6,34],['DL',23,7],['DC',19,25],['DC',19,43],['DR',23,61],['DM',40,26],['DM',40,42],['AML',66,9],['AMC',63,34],['AMR',66,59],['ST',81,34]],
 '5-3-2':[['GK',6,34],['WBL',36,6],['DC',19,20],['DC',17,34],['DC',19,48],['WBR',36,62],['MC',51,23],['DM',44,34],['MC',51,45],['ST',77,27],['ST',77,41]]
};
const MENT_MOD = {
  Defensive:{poss:.92,att:.86,def:1.14,line:-0.12,shoot:.85,direct:1.15,press:.9},
  Counter:  {poss:.97,att:.95,def:1.06,line:-0.06,shoot:.95,direct:1.30,press:.95},
  Balanced: {poss:1,   att:1,   def:1,   line:0,    shoot:1,   direct:1,   press:1},
  Attacking:{poss:1.05,att:1.09,def:.93,line:0.08, shoot:1.10,direct:.95,press:1.10},
  Overload: {poss:1.10,att:1.18,def:.84,line:0.15, shoot:1.22,direct:.90,press:1.20}
};

function hashStr(text){
  let v = 2166136261;
  const s = String(text||'x');
  for(let i=0;i<s.length;i++){ v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); }
  return v >>> 0;
}
/* 0..1, stable for a given player and key — the "personal variation"
   that stops two identically-rated players deriving identically. */
function seedVar(p, key){
  return ((hashStr((p.pid||p.name||'p')+':'+key) % 1000) / 1000);
}

const DERIVED = {
  handling:    p => 0.55*A(p,'positioning') + 0.25*A(p,'agility')    + 0.20*A(p,'composure'),
  reflexes:    p => 0.55*A(p,'agility')     + 0.25*A(p,'positioning') + 0.20*A(p,'decisions'),
  oneOnOnes:   p => 0.45*A(p,'positioning') + 0.30*A(p,'composure')  + 0.25*A(p,'agility'),
  distribution:p => 0.60*A(p,'passing')     + 0.25*A(p,'vision')     + 0.15*A(p,'firstTouch'),
  offTheBall:  p => 0.45*A(p,'positioning') + 0.30*A(p,'decisions')  + 0.25*A(p,'workRate'),
  marking:     p => 0.50*A(p,'positioning') + 0.30*A(p,'decisions')  + 0.20*A(p,'tackling')
};

/* Raw stored attribute, 1-20. */
function A(p, key){
  const v = p && p.attrs ? p.attrs[key] : null;
  return (typeof v === 'number' && isFinite(v)) ? Math.max(1, Math.min(20, v)) : 10;
}
/* Stored or derived, 1-20. Everything in the match logic asks through
   here, so a keeper asked for agility answers with his hands. */
/* =====================================================================
   ABILITY FIRST, BUT NOT ABILITY ONLY
   ---------------------------------------------------------------------
   "ability must always be the main driving factor, but a team that has
    won five in a row has momentum and positivity ... if they lost four
    games that should make them not as good. In real football everything
    means something."

   Only the nineteen attributes crossed into the picture, so a side on a
   five-match run played exactly like the same side on a four-match
   losing streak, and a man at 40% condition played like a fresh one.

   Four things move a player off his rating, and all of them are small
   on purpose, because ability is supposed to decide a football match:

       condition   the biggest of them. A blown player is a worse one
       morale      a man who is enjoying it plays nearer his ceiling
       sharpness   match fitness, not the same thing as being rested
       momentum    his side's last six results, shared by the whole XI

   The whole swing is about a tenth either way, so a 14 plays somewhere
   between a 12.6 and a 15.4. That is a difference you can see over
   ninety minutes without a good side ever losing to a bad one because
   it was in a mood. Worked out once a match and kept, because none of
   it changes between kick-off and the whistle. */
function stateMul(p){
  if(p._stateMul != null) return p._stateMul;
  const unit = (v, dflt) => (typeof v === 'number' ? THREE.MathUtils.clamp(v/100, 0, 1) : dflt);
  const cond = unit(p.cond, 0.9);
  const mor  = unit(p.morale, 0.7);
  const shp  = unit(p.sharp, 0.7);
  const mom  = (typeof p.momentum === 'number') ? THREE.MathUtils.clamp(p.momentum, 0, 1) : 0.5;
  const m = 1
    + (cond - 0.85)*0.115      /* fully fit +0.017, run into the ground -0.098 */
    + (mor  - 0.60)*0.075
    + (shp  - 0.65)*0.055
    + (mom  - 0.50)*0.055;
  p._stateMul = THREE.MathUtils.clamp(m, 0.86, 1.09);
  return p._stateMul;
}

function effA(p, key){
  if(p && p.attrs && typeof p.attrs[key] === 'number')
    return THREE.MathUtils.clamp(A(p, key) * stateMul(p), 1, 20);
  const d = DERIVED[key];
  if(!d) return 10;
  if(p && p._derived && p._derived[key] != null) return p._derived[key];
  const base = d(p);
  const val = Math.max(1, Math.min(20, base*0.88 + seedVar(p,key)*4.2));
  if(p){ (p._derived || (p._derived = {}))[key] = val; }
  return val;
}
/* Normalised 0..1 — 1 is a 20, 0 is a 1. */
function A01(p, key){ return (effA(p,key) - 1) / 19; }
/* A weighted blend of several attributes, 0..1. */
function Amix(p, spec){
  let sum = 0, w = 0;
  for(const k in spec){ sum += A01(p,k)*spec[k]; w += spec[k]; }
  return w ? sum/w : 0.5;
}

/* Generate a believable attribute set for a standalone match. `quality`
   is the club's level, roughly the squad's average rating. */
function rollAttrs(slot, quality){
  const W = SLOT_W[slot] || SLOT_W.MC, out = {};
  for(const k of ATTR_KEYS){
    const emphasis = W[k] == null ? 1 : W[k];
    // emphasis moves the mean; every player still gets his own spread
    const mean = quality * (0.55 + emphasis*0.45);
    out[k] = Math.max(1, Math.min(20, Math.round(mean + gauss()*2.1)));
  }
  return out;
}
const NAME_POOL = [
  ['HOLT','BRENNAN','VOSS','KEATING','ADEYEMI','SANDERS','MARCHETTI','OKONKWO','LINDQVIST','REYES','BAPTISTE'],
  ['DUARTE','FALK','NAKAMURA','ROSSI','ELLIOTT','KOVAC','TRAORE','MENDES','HALVORSEN','CRUZ','WEBB']
];

/* ================== renderer ================== */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(hostW(), hostH());
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070c1c, 0.0042);
const camera = new THREE.PerspectiveCamera(30, hostW()/hostH(), 0.4, 900);
camera.position.set(0, 22, -60);

addEventListener('resize', ()=>{
  camera.aspect = hostW()/hostH(); camera.updateProjectionMatrix();
  renderer.setSize(hostW(), hostH());
});

/* ================== procedural textures ================== */
function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function tex(c, rx, ry){
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  if(rx){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry||rx); }
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/* =====================================================================
   THE PITCH

   A groundsman's roller lays the grass toward or away from you, and the
   pattern he walks is a choice: up and down the length, across the
   width, a checkerboard from two passes at right angles, or diagonals.
   PITCH_CUTS holds those four, one is drawn at random per match, and the
   base green and the amount of wear move with it — so two matches in the
   same stadium do not look like the same afternoon.

   No branding is mown into the turf: this is a normal football pitch.
   ===================================================================== */
const PITCH_CUTS = [
  {id:'lengthwise', label:'STRIPES'},
  {id:'crosswise',  label:'CROSS-CUT'},
  {id:'check',      label:'CHECKERBOARD'},
  {id:'diagonal',   label:'DIAGONALS'}
];
const PITCH = {
  cut:   PITCH_CUTS[(Math.random()*PITCH_CUTS.length)|0],
  hue:   Math.random(),          // 0 = cool blue-green, 1 = warm yellow-green
  wear:  0.55 + Math.random()*0.75,
  bands: 0
};
function rollPitch(){
  PITCH.cut  = PITCH_CUTS[(Math.random()*PITCH_CUTS.length)|0];
  PITCH.hue  = Math.random();
  PITCH.wear = 0.55 + Math.random()*0.75;
}
/* Re-cut the grass for a new match. The old texture is disposed rather
   than left on the GPU, because a long session would otherwise leak a
   4MB canvas per kick-off. */
function reskinPitch(){
  rollPitch();
  if(!TEX.turf) return;
  const old = TEX.turf.material.map;
  TEX.turf.material.map = pitchTexture();
  TEX.turf.material.needsUpdate = true;
  if(old && old.dispose) old.dispose();
}

function pitchTexture(){
  const M=6, ppm=18;
  const c = cv(Math.round((CFG.L+M*2)*ppm), Math.round((CFG.W+M*2)*ppm)), g = c.getContext('2d');
  const px = x=>(x+HALF_L+M)*ppm, py = z=>(z+HALF_W+M)*ppm;

  /* Two greens, a light band and a dark band, shifted along the
     yellow<->blue axis by PITCH.hue so a summer pitch and a wet
     October one are recognisably different surfaces. */
  const h = PITCH.hue;
  const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  const rgb=v=>'rgb('+v[0]+','+v[1]+','+v[2]+')';
  const darkC  = mix([24,74,44],[38,80,26], h);
  const lightC = mix([36,100,58],[54,108,36], h);
  const dark = rgb(darkC), light = rgb(lightC);
  const darker  = rgb(darkC.map(v=>Math.max(0,v-7)));
  const lighter = rgb(lightC.map(v=>Math.min(255,v+9)));
  g.fillStyle = dark; g.fillRect(0,0,c.width,c.height);

  const W = c.width, Hc = c.height;
  /* One band of cut grass. `dir` is the roller's heading; the gradient
     across the band is the grass standing up at the edges where the
     mower turned. */
  const band=(x,y,w,hgt,lightSide,vertical)=>{
    const grd = vertical ? g.createLinearGradient(x,0,x+w,0) : g.createLinearGradient(0,y,0,y+hgt);
    const a = lightSide ? light : dark, b = lightSide ? lighter : darker;
    grd.addColorStop(0,a); grd.addColorStop(.5,b); grd.addColorStop(1,a);
    g.fillStyle = grd; g.fillRect(x,y,w+1,hgt+1);
  };

  switch(PITCH.cut.id){
    case 'crosswise': {
      const n = 13; PITCH.bands = n;
      const bh = CFG.W/n;
      for(let i=0;i<n;i++)
        band(px(-HALF_L), py(-HALF_W+i*bh), CFG.L*ppm, bh*ppm, i%2===0, false);
      break;
    }
    case 'check': {
      const nx = 14, nz = 9; PITCH.bands = nx;
      const bw = CFG.L/nx, bh = CFG.W/nz;
      for(let i=0;i<nx;i++) for(let j=0;j<nz;j++)
        band(px(-HALF_L+i*bw), py(-HALF_W+j*bh), bw*ppm, bh*ppm, (i+j)%2===0, true);
      break;
    }
    case 'diagonal': {
      const n = 26; PITCH.bands = n;
      g.save();
      g.beginPath(); g.rect(px(-HALF_L),py(-HALF_W),CFG.L*ppm,CFG.W*ppm); g.clip();
      g.translate(px(0),py(0)); g.rotate(-Math.PI/5);
      const span = (CFG.L+CFG.W)*ppm, bw = span/n;
      for(let i=0;i<n;i++)
        band(-span/2+i*bw, -span/2, bw, span, i%2===0, true);
      g.restore();
      break;
    }
    default: {                                        // lengthwise
      const n = 18; PITCH.bands = n;
      const bw = CFG.L/n;
      for(let i=0;i<n;i++)
        band(px(-HALF_L+i*bw), py(-HALF_W), bw*ppm, CFG.W*ppm, i%2===0, true);
    }
  }
  // the faint second pass every groundsman leaves behind
  g.globalAlpha=.035;
  for(let j=0;j<26;j++){
    g.fillStyle = j%2 ? '#ffffff' : '#000000';
    g.fillRect(px(-HALF_L), py(-HALF_W)+j*(CFG.W*ppm/26), CFG.L*ppm, CFG.W*ppm/26);
  }
  g.globalAlpha=1;

  // wear: goalmouths, centre circle, penalty spots
  const wr = PITCH.wear;
  const wear=(x,z,r,a)=>{
    const gr=g.createRadialGradient(px(x),py(z),0,px(x),py(z),r*ppm);
    gr.addColorStop(0,'rgba(126,102,56,'+(a*wr)+')'); gr.addColorStop(1,'rgba(126,102,56,0)');
    g.fillStyle=gr; g.fillRect(px(x-r),py(z-r),r*2*ppm,r*2*ppm);
  };
  for(const s of [-1,1]){
    wear(s*(HALF_L-2.5),0,7.5,.26); wear(s*(HALF_L-CFG.SPOT),0,2.4,.20);
    wear(s*(HALF_L-CFG.PEN_D),0,9,.10);
  }
  wear(0,0,3.4,.17);
  g.globalAlpha=.05;                                   // divots and clippings
  for(let i=0;i<9000;i++){
    g.fillStyle = Math.random()>.5?'#ffffff':'#000000';
    g.fillRect(Math.random()*c.width, Math.random()*c.height, 2+Math.random()*9, 2);
  }
  g.globalAlpha=.10*wr;
  for(let i=0;i<340;i++){
    g.fillStyle='#6b5a30';
    const bx=Math.random()*c.width, by=Math.random()*c.height;
    g.fillRect(bx,by,3+Math.random()*10,2+Math.random()*4);
  }
  g.globalAlpha=1;

  g.strokeStyle='rgba(255,255,255,.94)'; g.lineWidth=.12*ppm;
  const rect=(x1,z1,x2,z2)=>{g.beginPath();g.rect(px(x1),py(z1),(x2-x1)*ppm,(z2-z1)*ppm);g.stroke();};
  const dot=(x,z,r)=>{g.beginPath();g.arc(px(x),py(z),r*ppm,0,7);g.fillStyle='rgba(255,255,255,.94)';g.fill();};
  rect(-HALF_L,-HALF_W,HALF_L,HALF_W);
  g.beginPath(); g.moveTo(px(0),py(-HALF_W)); g.lineTo(px(0),py(HALF_W)); g.stroke();
  g.beginPath(); g.arc(px(0),py(0),CFG.CIRCLE*ppm,0,7); g.stroke();
  dot(0,0,.18);
  for(const s of [-1,1]){
    rect(s>0?HALF_L-CFG.PEN_D:-HALF_L,-CFG.PEN_W/2,s>0?HALF_L:-HALF_L+CFG.PEN_D,CFG.PEN_W/2);
    rect(s>0?HALF_L-CFG.SIX_D:-HALF_L,-CFG.SIX_W/2,s>0?HALF_L:-HALF_L+CFG.SIX_D,CFG.SIX_W/2);
    const sx=s*(HALF_L-CFG.SPOT); dot(sx,0,.18);
    const a=Math.acos((CFG.PEN_D-CFG.SPOT)/CFG.CIRCLE);
    g.beginPath();
    if(s>0) g.arc(px(sx),py(0),CFG.CIRCLE*ppm,Math.PI-a,Math.PI+a);
    else    g.arc(px(sx),py(0),CFG.CIRCLE*ppm,-a,a);
    g.stroke();
    for(const t of [-1,1]){
      g.beginPath();
      g.arc(px(s*HALF_L),py(t*HALF_W),1*ppm,
        s>0?(t>0?Math.PI:Math.PI/2):(t>0?Math.PI/2:0),
        s>0?(t>0?Math.PI*1.5:Math.PI):(t>0?Math.PI:Math.PI/2));
      g.stroke();
    }
  }
  return tex(c);
}

function grassNormal(){
  const c = cv(256,256), g = c.getContext('2d');
  g.fillStyle='#8080ff'; g.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){
    const x=Math.random()*256, y=Math.random()*256, l=2+Math.random()*4;
    const tilt = Math.random()*0.5+0.25;
    g.strokeStyle = 'rgba('+(128+tilt*70|0)+','+(128-tilt*40|0)+',255,.5)';
    g.lineWidth=1; g.beginPath(); g.moveTo(x,y); g.lineTo(x+(Math.random()-.5)*2, y-l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70,45);
  return t;
}

/* A stand is rows of seats with people in some of them, lit from the
   roof down. Painting the empty seat first and the supporter over it —
   and leaving perhaps one seat in eight empty — is what stops the tier
   reading as flat noise. `home` tints a bloc of shirts in club colour. */
function crowdTexture(home){
  const c = cv(1024,512), g = c.getContext('2d');
  const grd = g.createLinearGradient(0,0,0,512);
  grd.addColorStop(0,'#0a0f1c'); grd.addColorStop(.35,'#141c30'); grd.addColorStop(1,'#1d2740');
  g.fillStyle=grd; g.fillRect(0,0,1024,512);

  const pal=['#e7ecf7','#9aa4c0','#39415f','#cdd4e4','#20283f','#566188','#e8c88c','#7d3a3a','#2f5f7a','#1b2438'];
  const rows=52, rh=512/rows;
  for(let r=0;r<rows;r++){
    const y = r*rh;
    const depth = 0.60 + (r/rows)*0.40;                 // upper rows sit in roof shadow
    g.fillStyle='rgba(10,15,28,'+(0.58-depth*0.26)+')'; // the seat backs
    g.fillRect(0,y,1024,rh*0.92);
    for(let x=2;x<1024;x+=11){
      if(Math.random()<0.13) continue;                  // an empty seat here and there
      const jx=x+(Math.random()*2.4-1.2), jy=y+(Math.random()*2.2-1.1);
      let col = pal[(Math.random()*pal.length)|0];
      if(home && Math.random()<0.42) col = home;        // the bloc behind the goal
      g.globalAlpha = (0.62+Math.random()*0.38)*depth;
      g.fillStyle = col; g.fillRect(jx, jy+2.4, 5.4, 6.2);          // body
      g.fillStyle = 'rgba(24,20,26,.62)'; g.fillRect(jx+1, jy, 3.4, 3.2); // head
    }
  }
  g.globalAlpha=1;
  // gangways cut down through the tier
  g.fillStyle='rgba(3,5,10,.85)';
  for(let x=96;x<1024;x+=190) g.fillRect(x,0,9,512);
  // handrails catching the floodlights
  g.globalAlpha=.16; g.fillStyle='#cfe0ff';
  for(let r=8;r<rows;r+=8) g.fillRect(0,r*rh,1024,1.4);
  g.globalAlpha=1;
  return tex(c,1,1);
}

/* The scoreboard on the end stand — carries the brand between replays. */
function bigscreenTexture(){
  const c = cv(1024,512), g = c.getContext('2d');
  g.fillStyle='#04060a'; g.fillRect(0,0,1024,512);
  const gr=g.createLinearGradient(0,0,1024,512);
  gr.addColorStop(0,'#12161f'); gr.addColorStop(1,'#05070b');
  g.fillStyle=gr; g.fillRect(12,12,1000,488);
  drawBrandLogo(g, 512, 190, 210);
  g.textAlign='center'; g.textBaseline='middle';
  g.fillStyle='#ffffff'; g.font='900 92px "Arial Narrow",Arial,sans-serif';
  g.fillText(BRAND.name, 512, 350);
  g.fillStyle=BRAND.gold; g.font='bold 46px Arial,sans-serif';
  g.fillText(BRAND.domain, 512, 418);
  g.fillStyle=BRAND.red; g.fillRect(12,470,1000,14);
  g.globalAlpha=.22; g.fillStyle='#000';                 // pixel pitch
  for(let y=0;y<512;y+=4) g.fillRect(0,y,1024,1);
  for(let x=0;x<1024;x+=4) g.fillRect(x,0,1,512);
  g.globalAlpha=1;
  return tex(c);
}

/* ================== advertising ================== */
function roundRect(g,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}

/* The fallback United Road mark: a road running away to a lit horizon
   inside a rounded badge. Replaced wholesale the moment BRAND.logoSrc
   resolves — see drawBrandLogo(). */
function drawURMark(g, cx, cy, s){
  g.save(); g.translate(cx,cy);
  const r = s*0.22;
  roundRect(g,-s/2,-s/2,s,s,r);
  const bg = g.createLinearGradient(-s/2,-s/2,s/2,s/2);
  bg.addColorStop(0,'#1c2028'); bg.addColorStop(1,'#04060a');
  g.fillStyle=bg; g.fill();
  g.save();
  roundRect(g,-s/2,-s/2,s,s,r); g.clip();
  const sky=g.createLinearGradient(0,-s/2,0,-s*0.14);
  sky.addColorStop(0,'rgba(218,41,28,0)'); sky.addColorStop(1,'rgba(218,41,28,.6)');
  g.fillStyle=sky; g.fillRect(-s/2,-s/2,s,s*0.36);
  g.beginPath();
  g.moveTo(-s*0.42,s*0.44); g.lineTo(-s*0.07,-s*0.14);
  g.lineTo(s*0.07,-s*0.14); g.lineTo(s*0.42,s*0.44); g.closePath();
  const rd=g.createLinearGradient(0,-s*0.14,0,s*0.44);
  rd.addColorStop(0,'#39404e'); rd.addColorStop(1,'#cbd0da');
  g.fillStyle=rd; g.fill();
  g.fillStyle=BRAND.gold;
  for(let i=0;i<4;i++){
    const t0=i/4, t1=t0+0.14;
    const w0=s*0.010+t0*s*0.048, w1=s*0.010+t1*s*0.048;
    const y0=-s*0.14+t0*s*0.58,  y1=-s*0.14+t1*s*0.58;
    g.beginPath(); g.moveTo(-w0,y0); g.lineTo(w0,y0); g.lineTo(w1,y1); g.lineTo(-w1,y1);
    g.closePath(); g.fill();
  }
  g.restore();
  roundRect(g,-s/2,-s/2,s,s,r);
  g.lineWidth=s*0.05; g.strokeStyle=BRAND.red; g.stroke();
  g.restore();
}
function drawBrandLogo(g, cx, cy, s){
  if(BRAND_LOGO.ready && BRAND_LOGO.img){
    const im = BRAND_LOGO.img;
    const k = Math.min(s/im.width, s/im.height);          // fit, never distort
    g.drawImage(im, cx-im.width*k/2, cy-im.height*k/2, im.width*k, im.height*k);
  } else drawURMark(g, cx, cy, s);
}

/* Each creative paints into its own SEG-wide slot on one long strip. The
   strip scrolls behind the goal-line boards exactly like a real LED rig. */
/* THE BOARDS, AT THE RESOLUTION THEY ARE ACTUALLY SEEN AT.
   Every creative is drawn in a 512x128 panel, which is the right shape
   and the wrong number of pixels: the low touchline camera puts the
   near boards a few metres from the lens, where 512 across reads as a
   blurred smear behind the play. The panels are still authored at
   512x128 -- the strip is simply rendered at twice that and the
   context scaled, so the type has edges and none of the artwork had to
   be re-measured. */
const AD_SEG = 512, AD_H = 128, AD_SS = 2;
const CREATIVES = [
  function unitedRoad(g,x){
    const gr=g.createLinearGradient(x,0,x+AD_SEG,AD_H);
    gr.addColorStop(0,'#000000'); gr.addColorStop(.55,BRAND.deep); gr.addColorStop(1,'#1d0605');
    g.fillStyle=gr; g.fillRect(x,0,AD_SEG,AD_H);
    g.fillStyle=BRAND.red; g.fillRect(x,AD_H-9,AD_SEG,9);
    drawBrandLogo(g, x+72, AD_H/2, 96);
    g.textAlign='left'; g.textBaseline='alphabetic';
    g.fillStyle=BRAND.ink; g.font='900 52px "Arial Narrow",Arial,sans-serif';
    g.fillText(BRAND.name, x+140, AD_H/2+6);
    g.fillStyle=BRAND.gold; g.font='bold 25px Arial,sans-serif';
    g.fillText(BRAND.domain, x+142, AD_H/2+40);
  },
  function domain(g,x){
    g.fillStyle=BRAND.red; g.fillRect(x,0,AD_SEG,AD_H);
    g.fillStyle='rgba(0,0,0,.22)'; g.fillRect(x,0,AD_SEG,30);
    g.textAlign='center'; g.textBaseline='middle';
    g.fillStyle='#ffffff'; g.font='900 68px "Arial Narrow",Arial,sans-serif';
    g.fillText(BRAND.domain.toUpperCase(), x+AD_SEG/2, AD_H/2-8);
    g.fillStyle='rgba(255,255,255,.82)'; g.font='bold 21px Arial,sans-serif';
    g.fillText(BRAND.tagline, x+AD_SEG/2, AD_H/2+38);
  },
  function youtube(g,x){
    g.fillStyle='#0b0b0d'; g.fillRect(x,0,AD_SEG,AD_H);
    const cx=x+80, cy=AD_H/2;
    roundRect(g,cx-46,cy-32,92,64,18); g.fillStyle='#ff0033'; g.fill();
    g.beginPath(); g.moveTo(cx-13,cy-19); g.lineTo(cx+22,cy); g.lineTo(cx-13,cy+19);
    g.closePath(); g.fillStyle='#ffffff'; g.fill();
    g.textAlign='left'; g.textBaseline='alphabetic';
    g.fillStyle='#ffffff'; g.font='900 44px "Arial Narrow",Arial,sans-serif';
    g.fillText('SUBSCRIBE', x+146, cy-2);
    g.fillStyle=BRAND.gold; g.font='bold 27px Arial,sans-serif';
    g.fillText('YOUTUBE  '+BRAND.youtube, x+148, cy+33);
  },
  function results(g,x){
    const gr=g.createLinearGradient(x,0,x+AD_SEG,AD_H);
    gr.addColorStop(0,'#17271b'); gr.addColorStop(1,'#050806');
    g.fillStyle=gr; g.fillRect(x,0,AD_SEG,AD_H);
    g.fillStyle='#eef3ee';                                     // the three-bar mark
    g.fillRect(x+30,AD_H/2-38,86,14); g.fillRect(x+30,AD_H/2-7,62,14); g.fillRect(x+30,AD_H/2+24,86,14);
    g.save(); g.translate(x+108,AD_H/2); g.rotate(0.21);
    const rd=g.createLinearGradient(-13,-13,13,13);
    rd.addColorStop(0,'#ff4a3c'); rd.addColorStop(1,'#a91810');
    g.fillStyle=rd; g.fillRect(-13,-13,26,26); g.restore();
    g.textAlign='left'; g.textBaseline='alphabetic';
    g.fillStyle='#eef3ee'; g.font='900 38px "Arial Narrow",Arial,sans-serif';
    g.fillText('THE RESULTS BUSINESS', x+150, AD_H/2+2);
    g.fillStyle='#fbe122'; g.font='bold 22px Arial,sans-serif';
    g.fillText('FOOTBALL MANAGEMENT CAREER', x+152, AD_H/2+34);
  },
  function unitedRoadAlt(g,x){
    g.fillStyle=BRAND.deep; g.fillRect(x,0,AD_SEG,AD_H);
    for(let i=0;i<7;i++){                                       // forward chevrons
      g.beginPath();
      const bx=x+34+i*68;
      g.moveTo(bx,22); g.lineTo(bx+30,AD_H/2); g.lineTo(bx,AD_H-22);
      g.lineTo(bx+16,AD_H-22); g.lineTo(bx+46,AD_H/2); g.lineTo(bx+16,22);
      g.closePath();
      g.fillStyle='rgba(218,41,28,'+(0.14+i*0.12)+')'; g.fill();
    }
    g.textAlign='right'; g.textBaseline='middle';
    g.fillStyle='#ffffff'; g.font='900 46px "Arial Narrow",Arial,sans-serif';
    g.fillText(BRAND.name, x+AD_SEG-26, AD_H/2-12);
    g.fillStyle=BRAND.gold; g.font='bold 23px Arial,sans-serif';
    g.fillText(BRAND.domain, x+AD_SEG-26, AD_H/2+24);
  },
  function nova(g,x){    adFiller(g,x,'NOVA ENERGY','#0b2a7a','#e9ff4a','POWERING THE NORTH'); },
  function kestrel(g,x){ adFiller(g,x,'KESTREL AIR','#111318','#ff5252','FLY THE RED TAIL'); },
  function meridian(g,x){adFiller(g,x,'MERIDIAN BANK','#3a1060','#9fe8ff','SINCE 1874'); },
  function harrow(g,x){  adFiller(g,x,'HARROWGATE ALES','#20120a','#f0b64a','BREWED MATCHDAY'); },
  function saltmark(g,x){adFiller(g,x,'SALTMARK TYRES','#0d1512','#7dffb0','GRIP, WHATEVER THE WEATHER'); },
  function orbit(g,x){   adFiller(g,x,'ORBIT SPORTSWEAR','#141416','#ffffff','OFFICIAL KIT PARTNER'); }
];
function adFiller(g,x,text,bg,ink,strap){
  g.fillStyle=bg; g.fillRect(x,0,AD_SEG,AD_H);
  g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(x,0,AD_SEG,34);
  /* a bar of the sponsor's own colour, so one board is not another */
  g.fillStyle=ink; g.globalAlpha=.85; g.fillRect(x,AD_H-7,AD_SEG,7); g.globalAlpha=1;
  g.textAlign='center'; g.textBaseline='middle';
  g.fillStyle=ink; g.font='bold '+(strap?50:54)+'px "Arial Narrow",Arial,sans-serif';
  g.fillText(text, x+AD_SEG/2, AD_H/2 - (strap?12:0));
  if(strap){
    g.fillStyle='rgba(255,255,255,.62)'; g.font='bold 19px Arial,sans-serif';
    g.fillText(strap, x+AD_SEG/2, AD_H/2+26);
  }
}

let adCanvas = null;
function paintAds(){
  const W = AD_SEG*CREATIVES.length;
  if(!adCanvas) adCanvas = cv(W*AD_SS, AD_H*AD_SS);
  const g = adCanvas.getContext('2d');
  g.setTransform(AD_SS,0,0,AD_SS,0,0);
  g.clearRect(0,0,W,AD_H);
  CREATIVES.forEach((fn,i)=>{ g.save(); fn(g, i*AD_SEG); g.restore(); });
  /* LED pitch: a fine dark grid so the strip reads as diodes, not paint.
     Drawn in device pixels, so the diodes stay the same size on screen
     however far the artwork is supersampled. */
  g.setTransform(1,0,0,1,0,0);
  const px = adCanvas.width, py = adCanvas.height;
  g.globalAlpha=.18; g.fillStyle='#000000';
  for(let x=0;x<px;x+=4*AD_SS) g.fillRect(x,0,AD_SS,py);
  for(let y=0;y<py;y+=4*AD_SS) g.fillRect(0,y,px,AD_SS);
  /* the top edge of a real board catches the floodlights */
  g.globalAlpha=.14; g.fillStyle='#ffffff'; g.fillRect(0,0,px,2*AD_SS);
  g.globalAlpha=.10; g.fillStyle='#000000'; g.fillRect(0,py-3*AD_SS,px,3*AD_SS);
  g.globalAlpha=1;
  return adCanvas;
}
function ledTexture(){
  const t = tex(paintAds());
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(2.4,1);
  return t;
}
/* called when the real logo finishes loading */
function repaintBrand(){
  paintAds();
  for(const L of ledTextures) L.t.needsUpdate = true;
  if(ledMat && ledMat.map) ledMat.map.needsUpdate = true;
  if(TEX.bigscreen){
    const fresh = bigscreenTexture();
    TEX.bigscreen.image = fresh.image; TEX.bigscreen.needsUpdate = true;
  }
  if(typeof paintBug === 'function') paintBug();
}

/* A real goal net is a diamond mesh of twine with visible knots, not a
   square grid. Rotating the lattice 45° and thickening the crossings is
   most of the difference when the ball is sitting in it. */
function netTexture(){
  const N=256, c = cv(N,N), g = c.getContext('2d');
  g.clearRect(0,0,N,N);
  g.strokeStyle='rgba(255,255,255,.88)'; g.lineWidth=2.1; g.lineCap='round';
  const step=24;
  for(let i=-N;i<N*2;i+=step){
    g.beginPath(); g.moveTo(i,0);    g.lineTo(i+N,N); g.stroke();
    g.beginPath(); g.moveTo(i,N);    g.lineTo(i+N,0); g.stroke();
  }
  g.fillStyle='rgba(255,255,255,.95)';                    // knots
  for(let y=0;y<=N;y+=step) for(let x=(y/step%2)*step/2;x<=N;x+=step){
    g.beginPath(); g.arc(x,y,1.9,0,7); g.fill();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/* Proper 32-panel ball: twelve pentagons on an icosahedral layout rather
   than blobs scattered at random, plus stitching and a scuff or two. */
function ballTexture(){
  const W=1024,H=512, c = cv(W,H), g = c.getContext('2d');
  g.fillStyle='#f8fafd'; g.fillRect(0,0,W,H);
  const poly=(cx,cy,r,n,rot,fill)=>{
    g.beginPath();
    for(let k=0;k<n;k++){
      const a=rot+k/n*Math.PI*2;
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r*0.92;
      k?g.lineTo(x,y):g.moveTo(x,y);
    }
    g.closePath(); g.fillStyle=fill; g.fill();
    g.lineWidth=5; g.strokeStyle='#e2e6ee'; g.stroke();
  };
  // two staggered rings of pentagons plus a cap at each pole
  for(let i=0;i<5;i++){
    poly(W*(i+0.5)/5, H*0.30, 46, 5, -Math.PI/2, '#1b202a');
    poly(W*(i+1.0)/5, H*0.70, 46, 5,  Math.PI/2, '#1b202a');
  }
  poly(W*0.5, 12, 40, 5, 0, '#1b202a');
  poly(W*0.5, H-12, 40, 5, Math.PI, '#1b202a');
  // stitching
  g.strokeStyle='rgba(150,158,172,.55)'; g.lineWidth=2.4; g.setLineDash([7,9]);
  for(let i=0;i<5;i++){
    g.beginPath(); g.arc(W*(i+0.5)/5, H*0.30, 74, 0, 7); g.stroke();
    g.beginPath(); g.arc(W*(i+1.0)/5, H*0.70, 74, 0, 7); g.stroke();
  }
  g.setLineDash([]);
  // brand flash and a couple of grass scuffs
  g.save(); g.globalAlpha=.9; g.textAlign='center'; g.textBaseline='middle';
  g.fillStyle=BRAND.red; g.font='900 34px "Arial Narrow",Arial,sans-serif';
  g.fillText(BRAND.name, W*0.30, H*0.50); g.fillText(BRAND.name, W*0.80, H*0.50);
  g.restore();
  g.globalAlpha=.13; g.fillStyle='#5d7a3a';
  for(let i=0;i<26;i++) g.fillRect(Math.random()*W, Math.random()*H, 12+Math.random()*40, 5+Math.random()*9);
  g.globalAlpha=1;
  return tex(c);
}

/* The torso is a lathe, so u wraps once around the body: u=0.5 is the
   middle of his BACK and u=0/1 is the middle of his chest. The number
   therefore sits at canvas centre, and the chest sponsor is drawn twice —
   once off each edge — so its two halves meet at the seam. v=0 is the hem
   and v=1 the collar, so top-of-canvas is the shoulder line. */
function kitTexture(kit, number, name){
  const W=512, Hc=256;
  const c = cv(W,Hc), g = c.getContext('2d');
  g.fillStyle = kit.shirt; g.fillRect(0,0,W,Hc);

  g.fillStyle = kit.trim;
  if(kit.pattern==='stripe'){ for(let x=16;x<W;x+=64) g.fillRect(x,0,30,Hc); }
  else if(kit.pattern==='hoop'){ for(let y=26;y<Hc;y+=46) g.fillRect(0,y,W,20); }
  else if(kit.pattern==='sash'){
    g.save(); g.globalAlpha=.92; g.translate(W*0.5,0); g.rotate(-0.46);
    g.fillRect(-44,-160,64,560); g.restore();
  } else if(kit.pattern==='pinstripe'){
    g.globalAlpha=.34; for(let x=8;x<W;x+=26) g.fillRect(x,0,6,Hc); g.globalAlpha=1;
  }

  // woven fabric grain — kills the plastic look under a strong key light
  g.globalAlpha=.055;
  for(let i=0;i<3200;i++){
    g.fillStyle = Math.random()>.5 ? '#ffffff' : '#000000';
    g.fillRect(Math.random()*W, Math.random()*Hc, 2, 1);
  }
  g.globalAlpha=1;

  // vertical ambient occlusion: shoulders catch the floodlights, hem doesn't
  const ao = g.createLinearGradient(0,0,0,Hc);
  ao.addColorStop(0,'rgba(255,255,255,.12)');
  ao.addColorStop(.45,'rgba(255,255,255,0)');
  ao.addColorStop(1,'rgba(0,0,0,.34)');
  g.fillStyle=ao; g.fillRect(0,0,W,Hc);

  g.textAlign='center'; g.textBaseline='middle';

  // chest sponsor, split across the wrap seam so the halves rejoin
  if(kit.sponsor){
    g.font='bold 30px "Arial Narrow",Arial,sans-serif';
    g.fillStyle = kit.sponsorInk || '#ffffff';
    g.globalAlpha=.95;
    g.fillText(kit.sponsor, 0, 122); g.fillText(kit.sponsor, W, 122);
    g.globalAlpha=1;
  }

  if(number != null){
    if(name){
      g.font='bold 26px "Arial Narrow",Arial,sans-serif';
      g.lineWidth=5; g.strokeStyle='rgba(0,0,0,.5)';
      g.strokeText(name, W*0.5, 52);
      g.fillStyle = kit.numberInk || '#ffffff';
      g.fillText(name, W*0.5, 52);
    }
    g.font='900 88px Arial,sans-serif';
    g.lineWidth=10; g.strokeStyle='rgba(0,0,0,.5)';
    g.strokeText(String(number), W*0.5, 124);
    g.fillStyle = kit.numberInk || (kit.pattern==='stripe' ? '#ffffff' : kit.trim);
    g.fillText(String(number), W*0.5, 124);
  }

  g.fillStyle = kit.trim; g.fillRect(0,0,W,11);            // collar band
  g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0,11,W,4);
  return tex(c);
}

function glowTexture(){
  const c = cv(128,128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,252,235,.95)'); gr.addColorStop(.25,'rgba(210,225,255,.35)');
  gr.addColorStop(1,'rgba(160,190,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}

function skyTexture(){
  const W=512,H=512, c = cv(W,H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0,0,0,H);
  grd.addColorStop(0,'#010206'); grd.addColorStop(.42,'#050c1e');
  grd.addColorStop(.70,'#0d2044'); grd.addColorStop(.88,'#1d3f70');
  grd.addColorStop(1,'#2c5a8e');
  g.fillStyle=grd; g.fillRect(0,0,W,H);
  for(let i=0;i<900;i++){                                   // stars, thinning downward
    const y=Math.pow(Math.random(),1.7)*H*0.62;
    g.fillStyle='rgba(255,255,255,'+(0.10+Math.random()*0.55)+')';
    const r=Math.random()<.08?1.7:1;
    g.fillRect(Math.random()*W, y, r, r);
  }
  // thin cloud lit from beneath by the floodlights — the night-match tell
  for(let i=0;i<26;i++){
    const cx=Math.random()*W, cy=H*0.42+Math.random()*H*0.34, r=40+Math.random()*130;
    const cl=g.createRadialGradient(cx,cy,0,cx,cy,r);
    cl.addColorStop(0,'rgba(150,178,225,'+(0.05+Math.random()*0.09)+')');
    cl.addColorStop(1,'rgba(150,178,225,0)');
    g.fillStyle=cl; g.fillRect(cx-r,cy-r,r*2,r*2);
  }
  const halo=g.createLinearGradient(0,H*0.72,0,H);
  halo.addColorStop(0,'rgba(120,160,220,0)'); halo.addColorStop(1,'rgba(150,190,255,.22)');
  g.fillStyle=halo; g.fillRect(0,H*0.72,W,H*0.28);
  return tex(c);
}

/* ================== stadium ================== */
const TEX = {};
let ledMat = null;
const flags = [];
const netPanels = [];        // goal nets, so a finish can ripple them
const ledTextures = [];      // every scrolling board surface, animated together

function buildWorld(){
  TEX.net = netTexture(); TEX.glow = glowTexture();
  TEX.bigscreen = bigscreenTexture();

  // ---- sky ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 20),
    new THREE.MeshBasicMaterial({map:skyTexture(), side:THREE.BackSide, fog:false}));
  scene.add(sky);

  // ---- turf ----
  const M=6;
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(CFG.L+M*2, CFG.W+M*2, 1,1),
    new THREE.MeshStandardMaterial({map:pitchTexture(), normalMap:grassNormal(),
      normalScale:new THREE.Vector2(.42,.42), roughness:.94, metalness:0}));
  turf.rotation.x=-Math.PI/2; turf.receiveShadow=true; scene.add(turf);
  TEX.turf = turf;

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(CFG.L+90, CFG.W+90),
    new THREE.MeshStandardMaterial({color:0x0a1c0f, roughness:1}));
  apron.rotation.x=-Math.PI/2; apron.position.y=-0.03; apron.receiveShadow=true; scene.add(apron);

  // ---- LED advertising boards ----
  const ledTex = ledTexture();
  ledMat = new THREE.MeshBasicMaterial({map:ledTex, toneMapped:false});
  const boardBack = new THREE.MeshStandardMaterial({color:0x05070c, roughness:.9});
  const led=(len,x,z,ry,rep)=>{
    const t = ledTex.clone(); t.needsUpdate=true;
    t.wrapS=THREE.RepeatWrapping; t.repeat.set(rep,1);
    ledTextures.push({t, speed:1});
    const mat = new THREE.MeshBasicMaterial({map:t, toneMapped:false});
    const m=new THREE.Mesh(new THREE.BoxGeometry(len,1.15,.34),
      [boardBack,boardBack,boardBack,boardBack,mat,boardBack]);
    m.position.set(x,.62,z); m.rotation.y=ry; scene.add(m);
    // the boards throw their own colour onto the grass in front of them
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(len,3.4),
      new THREE.MeshBasicMaterial({color:0x223047, transparent:true, opacity:.14,
        blending:THREE.AdditiveBlending, depthWrite:false}));
    spill.rotation.x=-Math.PI/2; spill.rotation.z=ry;
    spill.position.set(x - Math.sin(ry)*1.9, .02, z - Math.cos(ry)*1.9);
    scene.add(spill);
    return {mesh:m, tex:t};
  };
  ledMat.map = ledTex;
  led(CFG.L+16, 0, -(HALF_W+5), 0, 1.5);
  led(CFG.L+16, 0,  (HALF_W+5), Math.PI, 1.5);
  led(CFG.W+8, -(HALF_L+6.5), 0, Math.PI/2, 1.0);
  led(CFG.W+8,  (HALF_L+6.5), 0, -Math.PI/2, 1.0);

  // ---- stands ----
  const concrete = new THREE.MeshStandardMaterial({color:0x0b1120, roughness:.92});
  const steel    = new THREE.MeshStandardMaterial({color:0x161d2e, roughness:.55, metalness:.55});
  function stand(len, dist, ry, px, pz, homeCol){
    const grp = new THREE.Group();
    grp.position.set(px,0,pz); grp.rotation.y=ry; scene.add(grp);
    const rake = -Math.PI/3, cos=Math.cos(Math.PI/6), sin=Math.sin(Math.PI/6);
    const tier=(slope, baseY, baseZ, rep)=>{
      const t = crowdTexture(homeCol);
      t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rep, Math.max(0.8,slope/34));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, slope),
        new THREE.MeshBasicMaterial({map:t}));
      m.rotation.x = rake;
      m.position.set(0, baseY + slope*sin/2, baseZ - slope*cos/2);
      grp.add(m);
      return {top:baseY+slope*sin, back:baseZ-slope*cos, mat:m.material};
    };
    const lower = tier(17, 1.6, -dist, Math.max(2,Math.round(len/46)));
    const upper = tier(21, lower.top+5.0, lower.back-1.6, Math.max(2,Math.round(len/46)));

    // pitch-side wall the front row sits behind
    const wallF = new THREE.Mesh(new THREE.BoxGeometry(len+3, 1.7, .6), concrete);
    wallF.position.set(0, .85, -dist+.6); grp.add(wallF);

    // the balcony between the tiers, with a lit fascia
    const facade = new THREE.Mesh(new THREE.BoxGeometry(len+3, 5.2, 1.4), concrete);
    facade.position.set(0, lower.top+2.4, lower.back-0.7); grp.add(facade);
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(len+2, 1.5),
      new THREE.MeshBasicMaterial({map:ledTex.clone(), toneMapped:false}));
    fascia.material.map.wrapS=THREE.RepeatWrapping;
    fascia.material.map.repeat.set(Math.max(2,len/34),1);
    fascia.material.map.needsUpdate=true;
    ledTextures.push({t:fascia.material.map, speed:-0.55});   // upper tier runs the other way
    fascia.position.set(0, lower.top+2.6, lower.back-1.45); grp.add(fascia);

    // roof, trusses and the light bar slung beneath
    const depth = Math.abs(upper.back)+8;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(len+8, depth),
      new THREE.MeshStandardMaterial({color:0x060a14, roughness:.94, side:THREE.DoubleSide}));
    roof.rotation.x = Math.PI/2 - 0.07;
    roof.position.set(0, upper.top+5.0, (-dist + upper.back)/2 - 1);
    grp.add(roof);
    for(let i=-3;i<=3;i++){
      const truss = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, depth), steel);
      truss.position.set(i*len/7, upper.top+4.7, (-dist+upper.back)/2 - 1);
      truss.rotation.x = -0.07; grp.add(truss);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, .5, .8),
      new THREE.MeshBasicMaterial({color:0xfff6e2, toneMapped:false}));
    bar.position.set(0, upper.top+3.6, -dist-1.5); grp.add(bar);

    const back = new THREE.Mesh(new THREE.BoxGeometry(len+8, upper.top+8, 1.2), concrete);
    back.position.set(0, (upper.top+8)/2, upper.back-2.4); grp.add(back);
    return {top:upper.top, back:upper.back, grp, len};
  }
  stand(CFG.L+30, 8.5, 0,         0, -(HALF_W), null);
  stand(CFG.L+30, 8.5, Math.PI,   0,  (HALF_W), null);
  const eEnd = stand(CFG.W+22, 10, -Math.PI/2,  (HALF_L), 0, TEAMS[1].chip);
  stand(CFG.W+22, 10,  Math.PI/2, -(HALF_L), 0, TEAMS[0].chip);

  // ---- big screen on the east end ----
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(17, 9),
    new THREE.MeshBasicMaterial({map:TEX.bigscreen, toneMapped:false}));
  screen.position.set(HALF_L+16, 22, 0); screen.rotation.y = -Math.PI/2; scene.add(screen);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(.6, 10.2, 18.2), concrete);
  bezel.position.set(HALF_L+16.4, 22, 0); scene.add(bezel);

  // ---- goals ----
  const postMat = new THREE.MeshStandardMaterial({color:0xf6f8fc, roughness:.35, metalness:.15});
  for(const s of [-1,1]){
    const gx=s*HALF_L, hw=CFG.GOAL_W/2, d=2.0, R=.06;
    const post=()=>new THREE.Mesh(new THREE.CylinderGeometry(R,R,CFG.GOAL_H,14), postMat);
    const p1=post(); p1.position.set(gx,CFG.GOAL_H/2,-hw);
    const p2=post(); p2.position.set(gx,CFG.GOAL_H/2,hw);
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(R,R,CFG.GOAL_W+R*2,14), postMat);
    bar.rotation.x=Math.PI/2; bar.position.set(gx,CFG.GOAL_H,0);
    [p1,p2,bar].forEach(m=>{m.castShadow=true; scene.add(m);});
    // the two rear stanchions the net is hung from
    for(const t of [-1,1]){
      const stay=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,CFG.GOAL_H*1.02,8), postMat);
      stay.position.set(gx+s*d, CFG.GOAL_H*0.5, t*hw);
      stay.rotation.x = 0; scene.add(stay);
    }
    // net: a real material, doubled-sided, with slack modelled into the mesh
    const mkNet = (w,h,segW,segH)=>{
      const geo = new THREE.PlaneGeometry(w,h,segW,segH);
      const t = TEX.net.clone(); t.needsUpdate=true;
      t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(w*1.5, h*1.5);
      const mat = new THREE.MeshLambertMaterial({map:t, transparent:true, opacity:.62,
        side:THREE.DoubleSide, depthWrite:false, alphaTest:.04});
      return new THREE.Mesh(geo, mat);
    };
    const back = mkNet(CFG.GOAL_W, CFG.GOAL_H, 14, 10);
    const pa = back.geometry.attributes.position;
    const rest = [];
    for(let i=0;i<pa.count;i++){
      const u=(pa.getX(i)/CFG.GOAL_W)+.5, v=(pa.getY(i)/CFG.GOAL_H)+.5;
      const z = -Math.sin(u*Math.PI)*Math.sin(v*Math.PI*0.9)*0.62;   // slack bag
      pa.setZ(i,z); rest.push(z);
    }
    back.geometry.computeVertexNormals();
    back.position.set(gx+s*d, CFG.GOAL_H/2, 0); back.rotation.y = s>0?-Math.PI/2:Math.PI/2;
    scene.add(back);
    netPanels.push({mesh:back, rest, side:s, t:0});
    for(const t of [-1,1]){
      const side=mkNet(d,CFG.GOAL_H,4,6);
      side.position.set(gx+s*d/2,CFG.GOAL_H/2,t*hw);
      side.rotation.y = 0; scene.add(side);
    }
    const top=mkNet(CFG.GOAL_W,d,10,4);
    top.rotation.x=-Math.PI/2; top.position.set(gx+s*d/2,CFG.GOAL_H-0.03,0); scene.add(top);
  }

  // ---- corner flags ----
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,1.5,6),
      new THREE.MeshStandardMaterial({color:0xf0f0f0, roughness:.6}));
    pole.position.set(sx*HALF_L, .75, sz*HALF_W); pole.castShadow=true; scene.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(.44,.32,4,2),
      new THREE.MeshStandardMaterial({color:0xe9ff4a, side:THREE.DoubleSide, roughness:.8}));
    flag.position.set(sx*(HALF_L-.21), 1.34, sz*HALF_W); flag.castShadow=true; scene.add(flag);
    flags.push(flag);
  }

  /* ---- technical area ----
     A dugout is a shelter, not a block: a back wall, two returns, a
     smoked-perspex roof cantilevered over an OPEN front, and a row of
     seats you can see substitutes sitting in. It also sits BEHIND the
     advertising boards, which is where the real ones are — in front of
     them it read as a slab parked on the touchline. */
  const DUG_Z = HALF_W + 7.4;
  for(const sx of [-1,1]){
    const team  = sx<0 ? 0 : 1;
    const grp = new THREE.Group(); grp.position.set(sx*15, 0, DUG_Z); scene.add(grp);
    const wallMat = new THREE.MeshStandardMaterial({color:0x0d1424, roughness:.88});
    const backW = new THREE.Mesh(new THREE.BoxGeometry(10.4,2.5,.3), wallMat);
    backW.position.set(0,1.25,1.5); backW.castShadow=true; grp.add(backW);
    for(const e of [-1,1]){
      const endW = new THREE.Mesh(new THREE.BoxGeometry(.3,2.5,3.0), wallMat);
      endW.position.set(e*5.05,1.25,0); endW.castShadow=true; grp.add(endW);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10.8,.16,3.4),
      new THREE.MeshStandardMaterial({color:0x0b1220, roughness:.42, metalness:.25,
        transparent:true, opacity:.62}));
    roof.position.set(0,2.62,0.1); roof.rotation.x = -0.05; roof.castShadow=true; grp.add(roof);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(10.8,.34,.18),
      new THREE.MeshStandardMaterial({color:team? TEAMS[1].chip : TEAMS[0].chip, roughness:.6}));
    trim.position.set(0,2.44,-1.6); grp.add(trim);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10.4,.12,3.2),
      new THREE.MeshStandardMaterial({color:0x151a22, roughness:.95}));
    floor.position.set(0,.06,0); floor.receiveShadow=true; grp.add(floor);

    // seats, and men sitting in them
    const seatMat = new THREE.MeshStandardMaterial({color:TEAMS[team].chip, roughness:.66});
    const track = {shirt:TEAMS[team].shirt, trim:TEAMS[team].trim, shorts:'#14171d',
                   socks:TEAMS[team].shirt, sleeve:TEAMS[team].sleeve, pattern:'none',
                   numberInk:'#ffffff'};
    for(let i=0;i<7;i++){
      const x = -3.9 + i*1.30;
      const pan  = new THREE.Mesh(new THREE.BoxGeometry(.60,.10,.56), seatMat);
      pan.position.set(x,.52,0.15); grp.add(pan);
      const rest = new THREE.Mesh(new THREE.BoxGeometry(.60,.62,.10), seatMat);
      rest.position.set(x,.82,0.45); rest.rotation.x = -0.16; grp.add(rest);
      if(i===3) continue;                                   // leave a gap in the row
      const ph = physique('M');
      const sub = buildBody(track, null, {
        simple:true, height:ph.h, build:ph.build,
        skin:SKIN[(Math.random()*SKIN.length)|0], hair:HAIR[(Math.random()*HAIR.length)|0],
        hairStyle:pickHairStyle(), beard:pickBeard(), boot:BOOTS[(Math.random()*BOOTS.length)|0]
      });
      seatPose(sub, 0.12 + Math.random()*0.10);
      sub.group.position.set(x, 0.12, 0.16);
      sub.group.rotation.y = Math.PI + (Math.random()-.5)*0.35;   // facing the pitch
      grp.add(sub.group);
    }
    // the manager, on his feet in front of the shelter
    const coat = {shirt:'#15181f', trim:'#2b303c', shorts:'#15181f', socks:'#15181f',
                  sleeve:'#15181f', pattern:'none', numberInk:'#2b303c'};
    const mh = physique('M');
    const boss = buildBody(coat, null, {
      simple:true, height:mh.h, build:mh.build*1.10,
      skin:SKIN[(Math.random()*SKIN.length)|0], hair:HAIR[(Math.random()*HAIR.length)|0],
      hairStyle:[1,4,0][(Math.random()*3)|0], boot:0x0a0a0c
    });
    standPose(boss);
    boss.group.position.set(sx*1.4, 0, -2.6);
    boss.group.rotation.y = Math.PI - sx*0.25;
    grp.add(boss.group);
  }

  // ---- broadcast cameras on the near touchline ----
  for(const cx of [-24, 0, 26]){
    const tri = new THREE.Mesh(new THREE.CylinderGeometry(.05,.34,1.5,6),
      new THREE.MeshStandardMaterial({color:0x1a1f2b, roughness:.7}));
    tri.position.set(cx, .75, -(HALF_W+7.5)); scene.add(tri);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(.5,.42,1.0),
      new THREE.MeshStandardMaterial({color:0x0d1017, roughness:.5, metalness:.3}));
    cam.position.set(cx, 1.62, -(HALF_W+7.5)); cam.rotation.x = 0.14; scene.add(cam);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.5,10),
      new THREE.MeshStandardMaterial({color:0x05070a, roughness:.3, metalness:.5}));
    lens.rotation.x = Math.PI/2 - 0.14; lens.position.set(cx, 1.60, -(HALF_W+6.9)); scene.add(lens);
  }

  // ---- floodlight pylons ----
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const X = sx*(HALF_L+22), Z = sz*(HALF_W+20);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.5,1.0,42,10),
      new THREE.MeshStandardMaterial({color:0x121828, roughness:.85}));
    pole.position.set(X, 21, Z); scene.add(pole);
    for(let i=0;i<4;i++){                                  // lattice bracing
      const br=new THREE.Mesh(new THREE.BoxGeometry(.16,10,.16),
        new THREE.MeshStandardMaterial({color:0x1a2233, roughness:.8}));
      br.position.set(X, 8+i*9, Z); br.rotation.z = i%2?0.16:-0.16; scene.add(br);
    }
    const rigGrp = new THREE.Group(); rigGrp.position.set(X, 43, Z); scene.add(rigGrp);
    rigGrp.lookAt(0,0,0);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(11,6,.5),
      new THREE.MeshStandardMaterial({color:0x0c1220, roughness:.8}));
    rigGrp.add(frame);
    const lampMat = new THREE.MeshBasicMaterial({color:0xfffaf0, toneMapped:false});
    for(let r=0;r<3;r++) for(let ccol=0;ccol<6;ccol++){     // the individual lamps
      const lamp=new THREE.Mesh(new THREE.CircleGeometry(.62,10), lampMat);
      lamp.position.set(-4.6+ccol*1.85, 1.9-r*1.9, .3); rigGrp.add(lamp);
    }
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.glow,
      blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:.8}));
    sp.scale.set(42,42,1); sp.position.set(X,43,Z); scene.add(sp);
  }

  // ---- lighting ----
  scene.add(new THREE.HemisphereLight(0x7d9ce0, 0x0e2413, 0.26));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.30);
  key.position.set(45,80,30); key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  const c=key.shadow.camera;
  c.left=-40; c.right=40; c.top=40; c.bottom=-40; c.near=1; c.far=230;
  c.updateProjectionMatrix(); key.shadow.bias=-0.0008; key.shadow.normalBias=0.022;
  scene.add(key); scene.add(key.target);
  // three floodlit fills from the other corners: crossed shadows, no black side
  const fillA = new THREE.DirectionalLight(0xb9d0ff, 0.30); fillA.position.set(-60,64,-44); scene.add(fillA);
  const fillB = new THREE.DirectionalLight(0xaec6ff, 0.20); fillB.position.set(52,58,-52); scene.add(fillB);
  const fillC = new THREE.DirectionalLight(0xc9dcff, 0.16); fillC.position.set(-48,60,54);  scene.add(fillC);
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const p=new THREE.PointLight(0xcfe0ff, .26, 230, 2);
    p.position.set(sx*(HALF_L+16), 38, sz*(HALF_W+14)); scene.add(p);
  }
  return {key};
}

/* ---- camera flashes in the stands ----
   Thirty thousand phones going off at random is the single cheapest cue
   that a night crowd is alive rather than wallpapered on. One Points
   object, one additive material, no per-flash draw calls. */
const FLASH = (function(){
  const N=70, pos=new Float32Array(N*3), alpha=new Float32Array(N);
  const home=[], life=[];
  for(let i=0;i<N;i++){
    // scatter them through the four banks of seating
    const edge = (Math.random()<0.62);
    const x = edge ? (Math.random()-.5)*(CFG.L+30) : (Math.random()<.5?-1:1)*(HALF_L+11+Math.random()*16);
    const z = edge ? (Math.random()<.5?-1:1)*(HALF_W+10+Math.random()*22) : (Math.random()-.5)*(CFG.W+18);
    const y = 4 + Math.random()*22;
    home.push([x,y,z]); life.push(-Math.random()*9);
    pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; alpha[i]=0;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha,1));
  const mat=new THREE.PointsMaterial({color:0xffffff, size:1.5, transparent:true,
    opacity:.9, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true});
  const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; scene.add(pts);
  return { step(dt, excite){
    let any=false;
    for(let i=0;i<N;i++){
      life[i] -= dt;
      if(life[i] <= 0){
        // fire, then wait a random interval — shorter when something happened
        life[i] = 0.10 + Math.random()*(excite ? 0.55 : 3.4);
        pos[i*3+1] = home[i][1];
        any = true;
      }
      // a flash is only visible for the first fraction of its interval
      const on = life[i] > 0 && life[i] < 0.085;
      pos[i*3+1] = on ? home[i][1] : -900;      // park the dead ones below the world
      if(on) any = true;
    }
    if(any) geo.attributes.position.needsUpdate = true;
  }};
})();

/* ---- turf spray: one pooled sprite cloud, reused for every slide ---- */
const SPRAY = (function(){
  const N=44, geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0x8fbf5e, size:.19, transparent:true,
    opacity:0, depthWrite:false, sizeAttenuation:true});
  const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; scene.add(pts);
  const vel=[]; for(let i=0;i<N;i++) vel.push(new THREE.Vector3());
  let life=0;
  return {
    burst(x,z,dx,dz){
      for(let i=0;i<N;i++){
        pos[i*3]=x+(Math.random()-.5)*.4; pos[i*3+1]=.05; pos[i*3+2]=z+(Math.random()-.5)*.4;
        vel[i].set(dx*(.4+Math.random()*.8)+(Math.random()-.5)*2.2,
                   1.1+Math.random()*2.4,
                   dz*(.4+Math.random()*.8)+(Math.random()-.5)*2.2);
      }
      life=.55; mat.opacity=.85; geo.attributes.position.needsUpdate=true;
    },
    step(dt){
      if(life<=0) return;
      life-=dt; mat.opacity=Math.max(0,life/.55)*.85;
      for(let i=0;i<N;i++){
        vel[i].y-=11*dt;
        pos[i*3]+=vel[i].x*dt; pos[i*3+1]=Math.max(.02,pos[i*3+1]+vel[i].y*dt); pos[i*3+2]+=vel[i].z*dt;
      }
      geo.attributes.position.needsUpdate=true;
    }
  };
})();

/* ---- net ripple ----
   A still net makes a goal look like the ball went through a wall. Kick
   the struck panel with a decaying radial wave and let it settle back to
   the slack it was built with. The back panel is yawed 90°, so its local
   x runs along world z — with the sign flipping between the two ends. */
function rippleNet(side, worldZ, worldY){
  for(const n of netPanels){
    if(n.side !== side) continue;
    n.t = 1; n.hitX = side>0 ? worldZ : -worldZ; n.hitY = worldY - CFG.GOAL_H/2;
  }
}
function stepNets(dt){
  for(const n of netPanels){
    if(n.t <= 0) continue;
    const was = n.t;
    n.t = Math.max(0, n.t - dt*1.45);
    const pa = n.mesh.geometry.attributes.position, decay = n.t*n.t;
    for(let i=0;i<pa.count;i++){
      const d = Math.hypot(pa.getX(i)-n.hitX, pa.getY(i)-n.hitY);
      const w = Math.sin(d*3.0 - (1-n.t)*14) * Math.exp(-d*0.8);
      pa.setZ(i, n.rest[i] - w*0.60*decay);
    }
    if(n.t<=0 && was>0) for(let i=0;i<pa.count;i++) pa.setZ(i, n.rest[i]);
    pa.needsUpdate = true;
    n.mesh.geometry.computeVertexNormals();
  }
}

/* ================== ball ================== */
/* A match ball is the one object the eye must never lose. It gets a lift
   of self-illumination so it stays legible against dark turf at the far
   end of a 105m pitch, without turning into a glowing bauble up close. */
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({map:ballTexture(), roughness:.34, metalness:.03,
    emissive:0x8a97ad, emissiveIntensity:.30}));
ballMesh.castShadow = true; scene.add(ballMesh);

/* A contact shadow under the ball. The cast shadow alone leaves it
   ambiguous how high a lofted ball actually is; a blob that shrinks and
   fades with altitude reads instantly. */
function blobTexture(){
  const c = cv(128,128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(0,0,0,.62)'); gr.addColorStop(.55,'rgba(0,0,0,.28)');
  gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
const BLOB_TEX = blobTexture();
const ballBlob = new THREE.Mesh(new THREE.PlaneGeometry(.62,.62),
  new THREE.MeshBasicMaterial({map:BLOB_TEX, transparent:true, depthWrite:false, opacity:.8}));
ballBlob.rotation.x = -Math.PI/2; ballBlob.position.y = .015; scene.add(ballBlob);

const BALL_AXIS = new THREE.Vector3(), BALL_UP = new THREE.Vector3(0,1,0), BALL_Q = new THREE.Quaternion();

const ball = { pos:new THREE.Vector3(0,CFG.BALL_R,0), vel:new THREE.Vector3(),
  spin:0, owner:null, cool:0 };

function stepBall(dt){
  if(ball.owner){
    const p = ball.owner;
    const d = Math.hypot(ball.pos.x-p.pos.x, ball.pos.z-p.pos.y);
    const spd = p.vel.length();
    if(d > 2.9 || ball.pos.y > 1.9){ ball.owner = null; }
    else if(spd <= 1.2 && d < 1.5){
      const t = new THREE.Vector3(p.pos.x+Math.cos(p.face)*.55, CFG.BALL_R, p.pos.y+Math.sin(p.face)*.55);
      ball.pos.lerp(t, Math.min(1,dt*15)); ball.vel.set(0,0,0);
      ballMesh.position.copy(ball.pos); return;
    } else {
      p.touch -= dt;
      if(p.touch <= 0){
        p.touch = .3;
        const ax=p.pos.x+Math.cos(p.face)*.9, az=p.pos.y+Math.sin(p.face)*.9;
        ball.vel.set((ax-ball.pos.x)*3.4+p.vel.x*.9, .05, (az-ball.pos.z)*3.4+p.vel.y*.9);
      }
    }
  }
  ball.cool = Math.max(0, ball.cool-dt);
  ball.vel.y -= 9.81*dt;
  const sp = ball.vel.length();
  if(sp > .01){
    const drag = .0058*sp*sp;
    ball.vel.addScaledVector(ball.vel.clone().normalize(), -drag*dt*sp*.35 - drag*dt);
  }
  if(Math.abs(ball.spin) > .01){
    const lat = new THREE.Vector3(-ball.vel.z,0,ball.vel.x).normalize();
    ball.vel.addScaledVector(lat, ball.spin*.055*dt*sp);
    ball.spin *= (1-.55*dt);
  }
  ball.pos.addScaledVector(ball.vel, dt);
  if(ball.pos.y < CFG.BALL_R){
    ball.pos.y = CFG.BALL_R;
    if(ball.vel.y < 0) ball.vel.y = -ball.vel.y*.56;
    if(Math.abs(ball.vel.y) < .55) ball.vel.y = 0;
    const f = Math.max(0, 1-.62*dt);
    ball.vel.x*=f; ball.vel.z*=f;
  }
  for(const s of [-1,1]) for(const t of [-1,1]){
    const dx=ball.pos.x-s*HALF_L, dz=ball.pos.z-t*CFG.GOAL_W/2, d=Math.hypot(dx,dz);
    if(d < CFG.BALL_R+.065 && ball.pos.y < CFG.GOAL_H){
      const n=new THREE.Vector3(dx,0,dz).normalize();
      ball.pos.x=s*HALF_L+n.x*(CFG.BALL_R+.075);
      ball.pos.z=t*CFG.GOAL_W/2+n.z*(CFG.BALL_R+.075);
      ball.vel.addScaledVector(n, -1.5*ball.vel.dot(n));
      event('WOODWORK', 'off the post');
    }
  }
  ballMesh.position.copy(ball.pos);
  /* Roll about the axis perpendicular to travel, at the rate the contact
     patch demands (v = ωr). The old two-axis nudge span the ball about
     the wrong axis on any diagonal pass, which read as a wobble. */
  const gs = Math.hypot(ball.vel.x, ball.vel.z);
  if(gs > .02){
    BALL_AXIS.set(ball.vel.z, 0, -ball.vel.x).normalize();
    BALL_Q.setFromAxisAngle(BALL_AXIS, (gs/CFG.BALL_R)*dt);
    ballMesh.quaternion.premultiply(BALL_Q);
  }
  if(Math.abs(ball.spin) > .01){
    BALL_Q.setFromAxisAngle(BALL_UP, -ball.spin*dt*2.2);
    ballMesh.quaternion.premultiply(BALL_Q);
  }
  const alt = Math.max(0, ball.pos.y - CFG.BALL_R);
  ballBlob.position.set(ball.pos.x, .015, ball.pos.z);
  const k = 1/(1+alt*0.42);
  ballBlob.scale.setScalar(THREE.MathUtils.clamp(k*1.05, .45, 1.15));
  ballBlob.material.opacity = .78*k;
}

/* ================== player models ======================================
   JOINT CONVENTION — read this before touching a pose.

   Every figure is yawed so that its LOCAL +Z is the direction it faces.
   In that frame, a positive rotation.x applied to a bone that hangs
   downward swings that bone BACKWARD. So the human rules are:

       knee    rotation.x >= 0 ALWAYS   (a knee only folds backwards)
       elbow   rotation.x <= 0 ALWAYS   (an elbow only folds forwards)
       hip     negative reaches the leg forward, positive drives it back
       ankle   positive is toes-down (push-off), negative is toes-up

   The previous rig drove knees and elbows with the SAME sign, which is
   why every leg on the pitch hinged the wrong way. buildBody() below and
   every pose in animate() obey the four rules above, and the knee/elbow
   values are built from terms that cannot go negative rather than from a
   sine that swings through zero.

   PROPORTIONS are canonical fractions of standing height, so a 2.01m
   keeper and a 1.68m winger are one rig at two scales — limbs stay in
   step with the ground instead of a single mesh being stretched.
   ====================================================================== */

const PROP = {
  hip:      0.530,   // hip joint above the sole
  thigh:    0.245,   // hip -> knee
  shin:     0.246,   // knee -> ankle  (leaves the ankle at 0.039H)
  torso:    0.290,   // hip joint -> shoulder joint
  neck:     0.052,
  headR:    0.072,
  shoulder: 0.105,   // half-width of the shoulder line
  upperArm: 0.172,
  foreArm:  0.157,
  foot:     0.150
};

/* Height and weight spreads measured off the 3,242 real players carried
   in the manager game's squad data, split by position group. Feeding a
   squad from these is what stops twenty-two identical men lining up. */
const ANTHRO = {
  GK:{h:190.1, hsd:5.1, w:80.1, wsd:7.4},
  D: {h:184.6, hsd:6.4, w:75.6, wsd:7.1},
  M: {h:179.8, hsd:5.7, w:71.4, wsd:6.1},
  F: {h:181.4, hsd:6.5, w:73.4, wsd:6.7}
};
const ROLE_GROUP = {GK:'GK',LB:'D',CB:'D',RB:'D',DM:'M',CM:'M',LW:'F',ST:'F',RW:'F'};

const SKIN  = [0xf3cbaa,0xe8b892,0xdfa77f,0xcd9068,0xb0774f,0x96603c,0x7b4b31,0x62381f,0x4a2a17];
const HAIR  = [0x14100e,0x1d1712,0x2b1c14,0x3d2a1a,0x5a3d22,0x7b5a2e,0xa8834a,0xc9a86a,0x2a2622];
const BOOTS = [0x101014,0x101014,0x0d0d12,0x1a1a20,0xf2f4f8,0xf2f4f8,0xe8ecf2,
               0xc9a227,0xe9ff4a,0xff3b6b,0x1e6cff,0x00d9a3];

/* Arm 0 hangs at local -X and arm 1 at +X, and a positive rotation.z
   swings a hanging bone toward +X. OUT(i) is therefore the sign that
   takes arm i AWAY from the body — get it backwards and the player
   folds his arms across his chest instead of spreading them. */
const OUT = i => (i ? 1 : -1);

const geoCache = {};
function G(key, make){ return geoCache[key] || (geoCache[key] = make()); }

/* ~N(0,1) from four uniforms — cheap, no logs, and the tails stay sane */
function gauss(){ return (Math.random()+Math.random()+Math.random()+Math.random()-2)*1.7320508; }

function physique(role){
  const a = ANTHRO[ROLE_GROUP[role]||'M'];
  const h = THREE.MathUtils.clamp(a.h + gauss()*a.hsd, 166, 203)/100;
  const w = THREE.MathUtils.clamp(a.w + gauss()*a.wsd, 58, 104);
  const bmi = w/(h*h);
  return {h, w, build: THREE.MathUtils.clamp(1 + (bmi-22.4)*0.030, 0.86, 1.15)};
}

/* A tapered capsule whose origin sits at its TOP, hanging to y = -len.
   Bone pivots can then be parented directly with no half-length offset,
   which is what keeps a chain of three joints from drifting apart. */
function limbGeo(rTop, rBot, len, seg){
  len = Math.max(len, (rTop+rBot)*1.06);
  const pts = [], C = 4;
  for(let i=0;i<=C;i++){
    const a = -Math.PI/2 + (i/C)*(Math.PI/2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a)*rBot), -len + rBot + Math.sin(a)*rBot));
  }
  for(let i=0;i<=C;i++){
    const a = (i/C)*(Math.PI/2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a)*rTop), -rTop + Math.sin(a)*rTop));
  }
  return new THREE.LatheGeometry(pts, seg||12);
}

/* Torso as a lathe: wide at the shoulders, pinched at the waist, flared
   again over the chest. A pill-shaped body reads as a pill no matter how
   well it is animated — the shoulder line is what makes it read as a man. */
function torsoGeo(H, build){
  const len = H*PROP.torso, r = H*0.092*build;    // narrower than the shoulder line,
  const prof = [[0.66,0.00],[0.94,0.10],[0.97,0.26],[0.88,0.45],[0.95,0.64],[1.00,0.82],[0.86,0.94],[0.46,1.00]];
  return new THREE.LatheGeometry(prof.map(q=>new THREE.Vector2(Math.max(1e-4,q[0]*r), q[1]*len)), 18);
}                                                 // so the deltoids read as shoulders

/* An extruded side profile beats a box: a boot has a heel, an instep and
   a toe, and those three silhouettes are what sell a planted foot. */
function bootGeo(len, w, h){
  const s = new THREE.Shape();
  s.moveTo(-len*0.30, 0);
  s.lineTo( len*0.58, 0);
  s.quadraticCurveTo(len*0.70, h*0.10, len*0.60, h*0.62);
  s.quadraticCurveTo(len*0.30, h*0.92, len*0.06, h*1.05);
  s.lineTo(-len*0.15, h*1.70);
  s.quadraticCurveTo(-len*0.34, h*1.62, -len*0.30, 0);
  const g = new THREE.ExtrudeGeometry(s, {depth:w, bevelEnabled:true, bevelSize:h*0.15,
    bevelThickness:h*0.15, bevelSegments:2, curveSegments:5});
  g.rotateY(-Math.PI/2);      // shape +X becomes local +Z (forward)
  g.translate(w/2, 0, 0);     // extrusion ran to -X; recentre it
  return g;
}

/* Seven heads of hair. At broadcast distance the silhouette above the
   ears is most of what tells two players apart once kit is shared. */
function addHair(parent, style, R, hairMat, trimMat){
  const made = [];
  const put = (geo, mat, y, sc, z)=>{
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, y, z||0);
    if(sc) m.scale.set(sc[0],sc[1],sc[2]);
    m.rotation.x = -0.20;          // hairline sits higher at the front
    parent.add(m); made.push(m); return m;
  };
  const cap = (r, sweep)=>new THREE.SphereGeometry(r, 14, 10, 0, Math.PI*2, 0, Math.PI*sweep);
  switch(style){
    case 0: put(cap(R*1.03,0.58), hairMat, R*0.09, [1.00,0.80,1.02]); break;               // crop
    case 1: put(cap(R*1.00,0.70), hairMat, R*0.05, [1.00,0.56,1.02]); break;               // buzz
    case 2: put(new THREE.SphereGeometry(R*1.15,14,12), hairMat, R*0.16, [1,0.92,1]); break; // afro
    case 3: put(cap(R*1.04,0.60), hairMat, R*0.09, [1.00,0.84,1.02]);                      // long
            put(new THREE.SphereGeometry(R*0.56,10,8), hairMat, -R*0.24, [1.02,1.20,0.62], -R*0.50); break;
    case 4: break;                                                                          // shaved
    case 5: put(cap(R*1.02,0.56), hairMat, R*0.09, [1.00,0.78,1.02]);                       // headband
            { const b=new THREE.Mesh(new THREE.TorusGeometry(R*1.00, R*0.062, 6, 16), trimMat);
              b.rotation.x = Math.PI/2; b.position.y = R*0.14; parent.add(b); made.push(b); } break;
    case 6: put(cap(R*1.02,0.58), hairMat, R*0.09, [1.00,0.80,1.02]);                       // topknot
            put(new THREE.SphereGeometry(R*0.26,8,7), hairMat, R*0.74, [1,0.9,1], -R*0.22); break;

    /* ---- seven more, because six heads and a bald one is not a crowd.
       A stand full of players should look like a stand full of people:
       the common cuts stay common (see HAIR_WEIGHTS below), and the ones
       you notice — dreads, a mohawk, a ponytail — stay rare enough to be
       worth noticing. */

    case 7: { // dreadlocks: a cap, and ropes down the back of the neck
      put(cap(R*1.03,0.60), hairMat, R*0.09, [1.00,0.82,1.02]);
      const rope = new THREE.CylinderGeometry(R*0.075, R*0.062, R*0.95, 5);
      for(let i=0;i<7;i++){
        const a = (i/6 - 0.5)*2.1;
        const m = new THREE.Mesh(rope, hairMat);
        m.position.set(Math.sin(a)*R*0.78, -R*0.46, -Math.cos(a)*R*0.60 - R*0.10);
        m.rotation.x = 0.30 + (i%2)*0.06;
        parent.add(m); made.push(m);
      }
      break;
    }
    case 8: { // mohawk: shaved at the sides, a ridge over the crown
      put(cap(R*1.00,0.52), hairMat, R*0.05, [1.00,0.34,1.02]);
      const ridge = new THREE.SphereGeometry(R*0.92, 12, 9, 0, Math.PI*2, 0, Math.PI*0.52);
      const m = new THREE.Mesh(ridge, hairMat);
      m.position.y = R*0.16; m.scale.set(0.30, 1.02, 1.06); m.rotation.x = -0.20;
      parent.add(m); made.push(m);
      break;
    }
    case 9: { // volume on top, faded at the sides
      put(cap(R*1.00,0.50), hairMat, R*0.04, [1.00,0.40,1.02]);
      const top = new THREE.SphereGeometry(R*0.86, 12, 10);
      const m = new THREE.Mesh(top, hairMat);
      m.position.set(0, R*0.42, -R*0.03); m.scale.set(1.06, 0.72, 1.04);
      parent.add(m); made.push(m);
      break;
    }
    case 10: { // ponytail
      put(cap(R*1.02,0.62), hairMat, R*0.08, [1.00,0.84,1.02]);
      const band = new THREE.Mesh(new THREE.SphereGeometry(R*0.20,8,7), trimMat);
      band.position.set(0, -R*0.06, -R*0.86); parent.add(band); made.push(band);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(R*0.16, R*0.10, R*0.80, 7), hairMat);
      tail.position.set(0, -R*0.36, -R*0.92); tail.rotation.x = 0.42;
      parent.add(tail); made.push(tail);
      break;
    }
    case 11: { // going back at the temples — footballers get older too
      put(cap(R*0.98,0.46), hairMat, R*0.02, [1.00,0.52,1.00], -R*0.10);
      break;
    }
    case 12: { // cornrows: ridges front to back
      put(cap(R*1.00,0.56), hairMat, R*0.07, [1.00,0.62,1.02]);
      const row = new THREE.CylinderGeometry(R*0.055, R*0.055, R*1.30, 5);
      for(let i=0;i<5;i++){
        const m = new THREE.Mesh(row, hairMat);
        m.position.set((i-2)*R*0.30, R*0.40, 0);
        m.rotation.x = Math.PI/2; m.rotation.z = (i-2)*0.05;
        parent.add(m); made.push(m);
      }
      break;
    }
    default: { // a side parting with a bit of a quiff
      put(cap(R*1.03,0.58), hairMat, R*0.09, [1.00,0.80,1.02]);
      const q = new THREE.Mesh(new THREE.SphereGeometry(R*0.44,10,8), hairMat);
      q.position.set(R*0.22, R*0.40, R*0.52); q.scale.set(1.05, 0.78, 0.72);
      q.rotation.z = -0.30;
      parent.add(q); made.push(q);
    }
  }
  return made;
}

/* Common cuts common, striking ones rare — the distribution of a real
   team sheet rather than a uniform roll over everything available. */
const HAIR_WEIGHTS = [
  [0, 20], [1, 16], [9, 12], [13, 10], [3, 8], [4, 8], [12, 6],
  [2, 5], [7, 5], [5, 4], [11, 3], [10, 2], [6, 2], [8, 1],
];
const HAIR_TOTAL = HAIR_WEIGHTS.reduce((n, w) => n + w[1], 0);
/* FACIAL HAIR, of which there was none at all. Twenty-two clean-shaven
   men is the one thing a football crowd never is. Same idea as the cuts:
   most players have something, a full beard is common, a moustache on
   its own is rare and worth a second look. Drawn in the hair colour, so
   it belongs to the head it is on. */
function addBeard(parent, style, R, mat){
  const made = [];
  if(!style) return made;
  const jaw = (from, sy, y, sx)=>{
    const g = new THREE.SphereGeometry(R*1.01, 14, 10, 0, Math.PI*2, from, Math.PI-from);
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, y, R*0.02); m.scale.set(sx||1.0, sy, 1.02);
    parent.add(m); made.push(m); return m;
  };
  switch(style){
    case 1: jaw(Math.PI*0.66, 0.70, -R*0.02, 0.99); break;            // stubble
    case 2: {                                                          // moustache
      const m = new THREE.Mesh(new THREE.SphereGeometry(R*0.30,8,6), mat);
      m.position.set(0, -R*0.14, R*0.78); m.scale.set(1.30,0.40,0.55);
      parent.add(m); made.push(m); break;
    }
    case 3: {                                                          // goatee
      const m = new THREE.Mesh(new THREE.SphereGeometry(R*0.36,9,7), mat);
      m.position.set(0, -R*0.50, R*0.58); m.scale.set(0.88,0.98,0.78);
      parent.add(m); made.push(m);
      const t = new THREE.Mesh(new THREE.SphereGeometry(R*0.26,8,6), mat);
      t.position.set(0, -R*0.16, R*0.76); t.scale.set(1.15,0.36,0.52);
      parent.add(t); made.push(t); break;
    }
    default: jaw(Math.PI*0.58, 0.92, -R*0.05, 1.0);                   // full beard
  }
  return made;
}
const BEARD_WEIGHTS = [[0, 34], [1, 26], [4, 22], [3, 13], [2, 5]];
const BEARD_TOTAL = BEARD_WEIGHTS.reduce((n, w) => n + w[1], 0);
function pickBeard(){
  let r = Math.random()*BEARD_TOTAL;
  for(const [style, w] of BEARD_WEIGHTS){ r -= w; if(r <= 0) return style; }
  return 0;
}

function pickHairStyle(){
  let r = Math.random()*HAIR_TOTAL;
  for(const [style, w] of HAIR_WEIGHTS){ r -= w; if(r <= 0) return style; }
  return 0;
}

function buildBody(kit, number, opts){
  opts = opts || {};
  const H     = opts.height || 1.82;
  const build = opts.build  || 1;
  // geometry cache buckets: 2cm of height, 0.05 of build — ~20 real variants
  const key = (Math.round(H*50)/50)+'_'+(Math.round(build*20)/20)+'_'+(opts.gloves?'g':'o');

  const g    = new THREE.Group();
  const lean = new THREE.Group();  g.add(lean);   // dive / slide tilt in body space
  const root = new THREE.Group();  lean.add(root);
  root.position.y = H*PROP.hip;

  const skinMat  = new THREE.MeshStandardMaterial({color:opts.skin!=null?opts.skin:SKIN[(Math.random()*SKIN.length)|0], roughness:.78});
  const hairMat  = new THREE.MeshStandardMaterial({color:opts.hair!=null?opts.hair:HAIR[(Math.random()*HAIR.length)|0], roughness:.95});
  const shirtMat = new THREE.MeshStandardMaterial({map:kitTexture(kit, number, opts.name), roughness:.66, metalness:.02});
  const sleeveMat= new THREE.MeshStandardMaterial({color:kit.sleeve||kit.trim, roughness:.68});
  const shortMat = new THREE.MeshStandardMaterial({color:kit.shorts, roughness:.66});
  const sockMat  = new THREE.MeshStandardMaterial({color:kit.socks,  roughness:.86});
  const trimMat  = new THREE.MeshStandardMaterial({color:kit.trim,   roughness:.66});
  const bootMat  = new THREE.MeshStandardMaterial({color:opts.boot!=null?opts.boot:BOOTS[0], roughness:.30, metalness:.24});

  /* Bench figures are seen head-and-shoulders over an advertising board
     and never move, so they are built without the small joint detail. It
     is ten meshes each, and there are fourteen of them. */
  const lod = !!opts.simple;
  const parts = [];
  const add = (geo, mat, parent)=>{
    const m = new THREE.Mesh(geo, mat); (parent||root).add(m);
    m.castShadow = !lod; parts.push(m); return m;
  };
  const detail = (geo, mat, parent)=> lod ? null : add(geo, mat, parent);

  // ---- pelvis, in shorts ----
  const pelvis = add(G('pel'+key, ()=>limbGeo(H*0.074*build, H*0.068*build, H*0.120, 16)), shortMat);
  pelvis.position.y = H*0.046; pelvis.scale.z = .88;

  // ---- torso: its own node so a lean never drags the legs with it ----
  const torso = new THREE.Group(); root.add(torso);
  const shY = H*PROP.torso;
  const chest = add(G('trs'+key, ()=>torsoGeo(H,build)), shirtMat, torso);
  chest.scale.z = .82;                            // a chest is wider than it is deep
  const yoke = detail(G('yok'+key, ()=>limbGeo(H*0.050*build, H*0.050*build, H*PROP.shoulder*1.55, 12)), shirtMat, torso);
  if(yoke){
    yoke.position.set(H*PROP.shoulder*0.775, shY*0.905, 0);
    yoke.rotation.z = -Math.PI/2; yoke.scale.z = .86;   // -90 deg lays it out along -X
  }
  const neck = detail(G('nek'+key, ()=>limbGeo(H*0.030, H*0.038, H*PROP.neck*2.3, 12)), skinMat, torso);
  if(neck) neck.position.y = shY + H*PROP.neck*2.0;

  const headPivot = new THREE.Group();
  headPivot.position.y = shY + H*PROP.neck*1.05;
  torso.add(headPivot);
  const head = add(G('hed'+key, ()=>new THREE.SphereGeometry(H*PROP.headR, 18, 14)), skinMat, headPivot);
  head.position.y = H*0.062; head.scale.set(.90,1.07,.96);
  if(!lod){
    const ear = G('ear'+key, ()=>new THREE.SphereGeometry(H*0.017, 6, 5));
    for(const s of [-1,1]){
      const e = add(ear, skinMat, headPivot);
      e.position.set(s*H*PROP.headR*0.88, H*0.058, -H*0.004); e.scale.set(.5,1.1,.85);
    }
  }
  addHair(headPivot, opts.hairStyle==null?0:opts.hairStyle, H*PROP.headR, hairMat, trimMat)
    .forEach(m=>{ m.position.y += H*0.062; m.castShadow = true; parts.push(m); });
  if(!lod){
    addBeard(headPivot, opts.beard||0, H*PROP.headR, hairMat)
      .forEach(m=>{ m.position.y += H*0.062; parts.push(m); });
  }

  // ---- arms: skin all the way, with a kit sleeve laid over the top ----
  /* The deltoid cap is the load-bearing part of this. Without it the
     upper arm starts inside the chest and the figure reads as a torso
     with two tubes stuck through it; with it, the arm visibly hangs off
     a shoulder. It is parented to the shoulder pivot because a real
     deltoid travels with the humerus, not with the ribcage. */
  const arms = [];
  for(const s of [-1,1]){
    const sh = new THREE.Group();
    sh.position.set(s*H*PROP.shoulder*0.86, shY*0.955, 0);
    torso.add(sh);
    const delt = add(G('dlt'+key, ()=>new THREE.SphereGeometry(H*0.040*build, 14, 10)), sleeveMat, sh);
    delt.position.y = -H*0.022; delt.scale.set(1.04,1.14,0.96);
    add(G('ua'+key, ()=>limbGeo(H*0.034*build, H*0.026*build, H*PROP.upperArm, 10)), skinMat, sh);
    const slv = detail(G('slv'+key, ()=>limbGeo(H*0.042*build, H*0.033*build, H*PROP.upperArm*0.50, 10)), sleeveMat, sh);
    if(slv) slv.position.y = -H*0.004;

    const el = new THREE.Group(); el.position.y = -H*PROP.upperArm; sh.add(el);
    const elbow = detail(G('elb'+key, ()=>new THREE.SphereGeometry(H*0.026*build, 9, 7)), skinMat, el);
    if(elbow) elbow.scale.set(1,.95,1);
    add(G('fa'+key, ()=>limbGeo(H*0.026*build, H*0.019*build, H*PROP.foreArm, 10)), skinMat, el);
    const hand = add(G('hnd'+key, ()=>new THREE.SphereGeometry(H*0.026, 9, 7)),
                     opts.gloves ? trimMat : skinMat, el);
    hand.position.y = -H*(PROP.foreArm+0.018);
    hand.scale.set(opts.gloves?1.5:1.00, 1.30, opts.gloves?1.0:0.66);
    arms.push({sh, el, hand});
  }

  // ---- legs: hip -> knee -> ankle, each a real pivot ----
  const legs = [];
  for(const s of [-1,1]){
    const hip = new THREE.Group();
    hip.position.set(s*H*0.048*build, -H*0.016, 0);
    root.add(hip);
    add(G('th'+key, ()=>limbGeo(H*0.046*build, H*0.034*build, H*PROP.thigh, 16)), skinMat, hip);
    const leg0 = add(G('sl'+key, ()=>limbGeo(H*0.056*build, H*0.050*build, H*PROP.thigh*0.70, 16)), shortMat, hip);
    leg0.position.y = H*0.030; leg0.scale.z = .95;

    const knee = new THREE.Group(); knee.position.y = -H*PROP.thigh; hip.add(knee);
    const cap = detail(G('kc'+key, ()=>new THREE.SphereGeometry(H*0.030*build, 14, 10)), skinMat, knee);
    if(cap) cap.scale.set(1,.90,1);
    add(G('shn'+key, ()=>limbGeo(H*0.035*build, H*0.023*build, H*PROP.shin, 16)), skinMat, knee);
    const sock = add(G('sok'+key, ()=>limbGeo(H*0.042*build, H*0.028*build, H*PROP.shin*0.88, 16)), sockMat, knee);
    sock.position.y = -H*PROP.shin*0.15;

    const ankle = new THREE.Group(); ankle.position.y = -H*PROP.shin; knee.add(ankle);
    const boot = add(G('bt'+key, ()=>bootGeo(H*PROP.foot*0.90, H*0.041*build, H*0.026)), bootMat, ankle);
    boot.position.y = -H*0.039;   // drops the sole onto the turf with the leg straight
    boot.position.z = -H*0.008;
    legs.push({hip, knee, ankle, boot});
  }

  return {group:g, lean, root, torso, arms, legs, headPivot, parts, H, build,
          hipY:H*PROP.hip, legLen:H*(PROP.thigh+PROP.shin)};
}

/* ---- static poses for the technical area ----
   These are props, not actors: they are never handed to animate(), so
   they can own root.position.y outright. Both obey the same joint rules
   as everything else — hips flex negative, knees flex positive. */
function seatPose(body, lean){
  const b = body, H = b.H;
  for(let i=0;i<2;i++){
    b.legs[i].hip.rotation.x   = -1.46;          // thigh forward to horizontal
    b.legs[i].knee.rotation.x  =  1.50;          // shin straight back down
    b.legs[i].ankle.rotation.x =  0.12;
    b.legs[i].hip.rotation.z   = (i?1:-1)*0.09;
    b.arms[i].sh.rotation.x    = -0.50;
    b.arms[i].sh.rotation.z    = OUT(i)*0.24;
    b.arms[i].el.rotation.x    = -1.30;
  }
  b.torso.rotation.x = lean==null ? 0.12 : lean;
  // hips ride at seat height, which is exactly a shin off the floor
  b.root.position.y  = H*PROP.shin;
  b.headPivot.rotation.x = -0.06;
}
function standPose(body){
  const b = body;
  for(let i=0;i<2;i++){
    b.legs[i].hip.rotation.x   = -0.04 + (i?0.10:-0.10);
    b.legs[i].knee.rotation.x  =  0.10;
    b.legs[i].ankle.rotation.x =  0.02;
    b.legs[i].hip.rotation.z   = (i?1:-1)*0.05;
    b.arms[i].sh.rotation.x    = -0.62;          // arms folded across the chest
    b.arms[i].sh.rotation.z    = OUT(i)*0.30;
    b.arms[i].el.rotation.x    = -1.95;
  }
  b.torso.rotation.x = 0.05;
  b.headPivot.rotation.x = -0.04;
}

/* buildWorld() populates the dugouts with real bodies, so it has to run
   after the player-model definitions above rather than beside the rest
   of the scene setup. */
const LIGHTS = buildWorld();

/* ================== entities ================== */
const players = [];
/* Every figure gets a soft contact blob. With shadows on it doubles as
   ambient occlusion at the feet; with shadows off (LITE, or a phone that
   auto-tuned down) it is the only thing keeping players on the ground
   rather than hovering over it. */
function addContact(body, H){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(H*0.42, H*0.30),
    new THREE.MeshBasicMaterial({map:BLOB_TEX, transparent:true, depthWrite:false, opacity:.42}));
  m.rotation.x = -Math.PI/2; m.position.y = .012;
  body.group.add(m); body.contact = m;
}

function makePlayer(team, i){
  const e = TEAMS[team].squad[i];
  const isGK = e.slot === 'GK';
  const kit = isGK ? GK_KITS[team] : TEAMS[team];
  const body = buildBody(kit, e.num, {
    height:e.h, build:e.build, name:e.name,
    skin:  SKIN[(Math.random()*SKIN.length)|0],
    hair:  HAIR[(Math.random()*HAIR.length)|0],
    hairStyle: pickHairStyle(), beard: pickBeard(),
    boot:  BOOTS[(Math.random()*BOOTS.length)|0],
    gloves: isGK
  });
  scene.add(body.group);
  addContact(body, e.h);

  const p = { team, slot:e.slot, isGK, idx:i, num:e.num, name:e.name, pid:e.pid,
    attrs:e.attrs, _derived:null,
    morale:e.morale, cond:e.cond, sharp:e.sharp, momentum:(TEAMS[team]||{}).momentum,
    isWide: !!SLOT_WIDE[e.slot], isFwd: !!SLOT_FWD[e.slot], isDef: !!SLOT_DEF[e.slot],
    H:e.h, build:e.build, reach:e.h/1.82,
    home:new THREE.Vector2(e.pos.x, e.pos.y), pos:new THREE.Vector2(0,0), vel:new THREE.Vector2(0,0),
    face:0, stamina:100, phase:Math.random()*6.283, touch:0, lunge:0, cool:0,
    think:Math.random()*.3, react:0, seen:null, kickAnim:0, celeb:0,
    dive:0, diveDir:1, diveHigh:0, footed: Math.random()<.24 ? 1 : 0,
    skill:0, skillKind:0, skillDir:1, strike:null,
    body, mesh:body.group };

  /* SPEED, IN METRES A SECOND, AND ENOUGH OF IT TO SEE.
     The old line read 5.6 + 2.4*(0.25 + pace*1.25), which put a whole
     squad between 7.7 and 9.2 m/s -- an 18% spread across the entire
     range of the pace attribute. Measured over a match, every player
     reached his own top speed and they were all within a stride of each
     other, which is exactly what "every player seems the same speed"
     looks like from the gantry.

     Real football is 7.5 m/s for a slow centre-half and 10.3 for the
     quickest men alive: a 37% spread. So the scale is the real one now,
     with the attribute running the whole way from one end of it to the
     other, and a heavier man paying a little for it.

     Cruising is his too. Everybody used to jog at a flat 70% of top
     speed; a high work rate and deep stamina now mean he covers the
     ground quicker even when he is not sprinting, which is most of the
     match. */
  p.topSpeed = (6.00 + 4.40*A01(p,'pace')) * (1.05 - e.build*0.05);
  p.cruise   = 0.62 + 0.16*A01(p,'workRate') + 0.06*A01(p,'stamina');
  p.accel    = CFG.ACCEL * (0.60 + A01(p,'acceleration')*0.85);
  p.turn     = 6.0 + A01(p,'agility')*6.5;
  p.gait     = gaitOf(p);
  return p;
}
function buildTeams(){
  for(const p of players){ scene.remove(p.mesh); disposeBody(p.body); }
  players.length = 0;
  for(let t=0;t<2;t++){ buildSquad(t); for(let i=0;i<11;i++) players.push(makePlayer(t,i)); }
}

/* =====================================================================
   A SUBSTITUTION, PROPERLY MADE
   ---------------------------------------------------------------------
   The manager game makes the changes; this shows them. The man going
   off is replaced where he stood by the man coming on, wearing his own
   number, with his own attributes and his own build -- not a rename.
   One of the substitutes warming up on the touchline stops warming up,
   because he is the one who has just gone on.

   Rebuilding one body costs a kit canvas; the geometry comes out of the
   shared cache. Twice a half is nothing.
   ===================================================================== */
function substitutePlayer(team, offPid, coming){
  const t = (team===1) ? 1 : 0;
  const side = teamOf(t);
  let p = offPid!=null ? side.find(x=>String(x.pid)===String(offPid)) : null;
  /* nobody named, or he is not on the pitch: take the tiredest outfielder,
     which is who a manager would be taking off anyway */
  if(!p) p = side.filter(x=>!x.isGK).sort((a,b)=>a.stamina-b.stamina)[0];
  if(!p || !coming) return null;

  const T = TEAMS[t];
  /* p.idx is the squad slot he was built from, which is the slot the man
     coming on takes over */
  const idx = p.idx;
  const grp = SLOT_GROUP[coming.slot || p.slot] || 'M';
  const a = ANTHRO[grp];
  const h = coming.heightCm ? THREE.MathUtils.clamp(coming.heightCm,150,215)/100
    : THREE.MathUtils.clamp(a.h + gauss()*a.hsd, 166, 203)/100;
  const w = coming.weightKg ? THREE.MathUtils.clamp(coming.weightKg,45,130)
    : THREE.MathUtils.clamp(a.w + gauss()*a.wsd, 58, 104);
  const entry = {
    pid: coming.id!=null ? String(coming.id) : (T.abbr+'-sub'+Math.floor(Math.random()*1e4)),
    name: String(coming.name || 'SUBSTITUTE').toUpperCase(),
    num: coming.number || coming.shirt || p.num,
    slot: coming.slot || p.slot,
    pos: new THREE.Vector2(p.home.x, p.home.y),
    h, w, build: THREE.MathUtils.clamp(1 + (w/(h*h)-22.4)*0.030, 0.86, 1.15),
    attrs: coming.attrs || p.attrs
  };
  if(!(idx>=0 && T.squad[idx])) return null;
  T.squad[idx] = entry;

  const where = p.pos.clone(), facing = p.face;
  const at = players.indexOf(p);
  scene.remove(p.mesh); disposeBody(p.body);
  const made = makePlayer(t, idx);
  if(at>=0) players[at] = made; else players.push(made);
  made.pos.copy(where); made.face = facing; made.stamina = 100;
  if(ball.owner===p) ball.owner = made;
  if(S.lastTouch===p) S.lastTouch = made;

  benchUsed(t);
  lowerThird('SUB', made.name, p.name + '  ·  ' + (TEAMS[t].name||'') + '  ·  ' + clockLabel());
  event('SUB', made.name + ' on for ' + p.name);
  emit('substitution', {team:t, on:made.name, onPid:made.pid, off:p.name, offPid:p.pid,
                        minute:clockLabel()});
  return made;
}
/* Geometry is shared through the G() cache, so only materials and the
   per-player kit canvases are ours to release. */
function disposeBody(b){
  if(!b) return;
  b.group.traverse(o=>{
    if(!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for(const m of mats){
      if(!m) continue;
      if(m.map && m.map.dispose && m.map.__own !== false) m.map.dispose();
      m.dispose();
    }
  });
}
buildTeams();
function teamOf(t){ return players.filter(p=>p.team===t); }
/* =====================================================================
   LEADERSHIP, WHICH USED TO BE DECORATION
   ---------------------------------------------------------------------
   It was in the attribute list and in the table the generator uses to
   weight a position, and nowhere in play: a squad of captains and a
   squad of passengers played exactly the same football. Caught by a
   sensitivity rig -- two identical elevens, one attribute at 18 against
   6 -- where leadership was the only one that moved nothing.

   A captain does not take the shots. He organises: the side keeps its
   heads under pressure, holds its shape, wins the second ball and stops
   diving into tackles it cannot win. So leadership is a team number,
   not a personal one -- the best man in the side carries most of it and
   the rest of the dressing room carries the remainder -- and it leans
   on those three things a little each rather than any one of them a
   lot.
   ===================================================================== */
function teamOrg(t){
  const men = teamOf(t).filter(p=>!p.isGK);
  if(!men.length) return 0.5;
  let best = 0, sum = 0;
  for(const p of men){ const l = A01(p,'leadership'); sum += l; if(l>best) best = l; }
  return 0.55*best + 0.45*(sum/men.length);
}
function orgOf(t){ return (S.org && S.org[t] != null) ? S.org[t] : 0.5; }
function keeperOf(t){ return players.find(p=>p.team===t && p.isGK); }

// match officials
const officials = [];
function makeOfficial(kind){
  const kit = {shirt:'#101318', trim:'#e9ff4a', shorts:'#101318', socks:'#101318',
               sleeve:'#1b1f27', pattern:'none', numberInk:'#e9ff4a'};
  const ph = physique('M');
  const body = buildBody(kit, null, {
    height:ph.h*0.99, build:ph.build*1.03, boot:0x0a0a0c,
    skin: SKIN[(Math.random()*SKIN.length)|0],
    hair: HAIR[(Math.random()*HAIR.length)|0],
    hairStyle: [1,4,0][(Math.random()*3)|0]
  });
  scene.add(body.group);
  addContact(body, ph.h);
  return { kind, pos:new THREE.Vector2(0, kind==='ref'?6:HALF_W+1.4), vel:new THREE.Vector2(),
    face:0, phase:0, H:ph.h, body, mesh:body.group, isOfficial:true,
    kickAnim:0, lunge:0, dive:0, celeb:0, isGK:false };
}
officials.push(makeOfficial('ref'), makeOfficial('ar1'), makeOfficial('ar2'));
officials[1].pos.set(-20, -(HALF_W+1.6));
officials[2].pos.set( 20,  (HALF_W+1.6));

/* =====================================================================
   THE TECHNICAL AREAS
   ---------------------------------------------------------------------
   "the substitutes warm up and go out, the managers be on the touch
    line, showing instructions"

   Twenty-two players on an empty stage is the tell that a football game
   is a football game. A real ground has two men in coats on the edge of
   their boxes waving people forward, and four more in bibs jogging up
   and down behind the assistant with their hands over their heads.

   They live on the far touchline, which is the one the camera looks
   across, so they are in shot behind the play rather than behind the
   lens. They cost eight bodies on a stage that already carries
   twenty-five, and they use the same rig and the same run cycle as the
   players — no second animation path to keep working.
   ===================================================================== */
/* WHERE THEY ACTUALLY STAND. The first attempt put everybody at
   HALF_W+3.4, which is within a metre of the advertising boards at
   HALF_W+5 — from a low camera they merged into the artwork and could
   not be seen at all. A real technical area is a metre outside the
   touchline, the warm-up strip runs behind the assistant referee at
   HALF_W+1.6, and the dugout itself is back against the boards. */
const TOUCH_Z  = HALF_W + 1.35;        /* the technical area, by the line   */
const WARM_Z   = HALF_W + 2.75;        /* the warm-up strip, behind the AR  */
const DUGOUT_Z = HALF_W + 4.10;        /* the bench, back against the ads   */
const bench = [];
let benchTeams = [null, null];

function coatKit(team){
  const T = TEAMS[team] || {};
  return {shirt:'#171a20', trim:T.shirt||'#888', shorts:'#0e1116', socks:'#0e1116',
          sleeve:'#101319', pattern:'none', numberInk:'#c8cede'};
}
function bibKit(team){
  const T = TEAMS[team] || {};
  return {shirt:T.shirt||'#c33', trim:'#f2f5ff', shorts:T.shorts||'#111', socks:T.socks||'#111',
          sleeve:T.trim||'#f2f5ff', pattern:'none', numberInk:'#ffffff'};
}
function makeBenchFigure(kind, team, seat){
  const ph = physique(kind==='manager' ? 'GK' : 'M');
  const body = buildBody(kind==='manager' ? coatKit(team) : bibKit(team), null, {
    height: ph.h*(kind==='manager' ? 0.98 : 1),
    build: ph.build*(kind==='manager' ? 1.08 : 1),
    boot: kind==='manager' ? 0x14161b : 0x0c0c0e,
    skin: SKIN[(Math.random()*SKIN.length)|0],
    hair: HAIR[(Math.random()*HAIR.length)|0],
    hairStyle: [0,1,2,4][(Math.random()*4)|0]
  });
  scene.add(body.group);
  addContact(body, ph.h);
  return { kind, team, seat, pos:new THREE.Vector2(0,TOUCH_Z), vel:new THREE.Vector2(),
    face:-Math.PI/2, phase:Math.random()*TAU, H:ph.h, body, mesh:body.group,
    kickAnim:0, lunge:0, dive:0, celeb:0, isGK:false, isBench:true,
    idx: seat, point:0, pointArm: Math.random()<0.5 ? 0 : 1,
    /* a warming-up substitute owns a stretch of touchline and runs it */
    lane:0, way:1, next:1 + Math.random()*4 };
}
function buildTouchline(force){
  /* The kits are the clubs', so this is rebuilt when the clubs change --
     and always at the start of a match, because substitutions take
     figures out of the warm-up group and the same two clubs meeting
     again would otherwise kick off with a bench that is already short. */
  if(!force && benchTeams[0]===(TEAMS[0]||{}).name
     && benchTeams[1]===(TEAMS[1]||{}).name && bench.length) return;
  for(const b of bench){ scene.remove(b.mesh); }
  bench.length = 0;
  for(let team=0; team<2; team++){
    const side = team===0 ? -1 : 1;                    // one technical area each
    const man = makeBenchFigure('manager', team, 0);
    man.home = new THREE.Vector2(side*10.5, TOUCH_Z);
    man.pos.copy(man.home);
    bench.push(man);
    for(let i=0;i<4;i++){
      const sub = makeBenchFigure(i<2 ? 'warmup' : 'sub', team, i);
      if(i<2){
        /* the warm-up strip runs from the corner back toward halfway */
        sub.lane = side*(26 + i*7);
        sub.pos.set(sub.lane, WARM_Z + i*0.85);
        sub.way = i%2 ? -1 : 1;
      } else {
        sub.home = new THREE.Vector2(side*(14.5 + (i-2)*1.7), DUGOUT_Z);
        sub.pos.copy(sub.home);
      }
      bench.push(sub);
    }
  }
  benchTeams = [(TEAMS[0]||{}).name, (TEAMS[1]||{}).name];
}
/* A substitute who has come on stops warming up: the group shrinks. */
function benchUsed(team){
  const warm = bench.filter(b=>b.team===team && b.kind==='warmup');
  const last = warm[warm.length-1];
  if(!last) return;
  last.kind = 'gone'; last.mesh.visible = false;
}
function stepTouchline(dt){
  if(!bench.length) return;
  for(const b of bench){
    if(b.kind==='gone') continue;
    if(b.kind==='warmup'){
      /* up and down his own stretch, turning at each end */
      const span = 9;
      const target = new THREE.Vector2(b.lane + b.way*span, b.pos.y);
      if(Math.abs(b.pos.x - target.x) < 1.2) b.way *= -1;
      movePlayerLite(b, target, dt, 4.2);
      continue;
    }
    if(b.kind==='manager'){
      /* he does not stand still: he works the edge of his box, and every
         few seconds he is pointing somebody twenty yards further up */
      b.next -= dt;
      if(b.next<=0){
        b.next = 2.5 + Math.random()*5;
        b.point = 1.1 + Math.random()*0.8;
        b.pointArm = Math.random()<0.5 ? 0 : 1;
      }
      const push = (ball.pos.x - b.home.x)*0.06;
      const target = new THREE.Vector2(
        THREE.MathUtils.clamp(b.home.x + push, b.home.x-7, b.home.x+7), b.home.y);
      movePlayerLite(b, target, dt, 2.3);
      /* facing the pitch, not the way he happens to be walking */
      b.face = -Math.PI/2;
      continue;
    }
    movePlayerLite(b, b.home, dt, 2.0);
    b.face = -Math.PI/2;
  }
}

/* ================== movement & animation ================== */
function slotWorld(p){
  const dir = S.dir[p.team], attacking = S.possTeam===p.team;
  const bx = ball.pos.x, bz = ball.pos.z;
  let x = p.home.x*(HALF_L*.92)*dir, z = p.home.y*(HALF_W*.95);
  if(!p.isGK){
    /* THE SLOT ITSELF USED TO SLIDE WITH THE BALL, FOR EVERYBODY, BY THE
       SAME AMOUNT. `bx*.34` and `bz*.4` were constants, so ten men's
       targets all moved by the same fraction of the same number on the
       same frame — which is a back four running backwards together no
       matter what I did to how hard each of them chased. I fixed the
       blend around this line last time and left the line alone, so the
       lockstep survived.

       It is his own number now, from how disciplined he is, and it reads
       the ball HE has seen rather than where the ball truly is. A
       holding centre-half barely shifts; a forward drifts most of the
       way with it. */
    const hold = (typeof styleOf === 'function') ? styleOf(p).holds : 0.5;
    const see = p.seen;
    const sx = see ? see.x : bx, sz = see ? see.y : bz;
    const track = 0.19 + (1-hold)*0.26;
    x += sx*track + dir*(attacking?7:-4.5);
    z += sz*(p.isWide ? .16 : .4)*(0.72 + (1-hold)*0.56);
    if(p.isWide && p.isFwd)
      z = Math.sign(p.home.y||1)*Math.max(Math.abs(z), HALF_W-11);
    z = THREE.MathUtils.clamp(z,-HALF_W+2,HALF_W-2);
    x = THREE.MathUtils.clamp(x,-HALF_L+4,HALF_L-4);
  } else {
    x = dir*-(HALF_L-1.6);
    z = THREE.MathUtils.clamp(bz*.28,-4.4,4.4);
  }
  return new THREE.Vector2(x,z);
}

function movePlayer(p, want, sprint, dt){
  /* Fresh legs run at his pace; tired ones do not. Stamina and work
     rate set how long that lasts, so a 5-stamina player is walking by
     the hour mark and a 18-stamina one is still pressing. */
  const fatigue = 0.72 + 0.28*Math.min(1, p.stamina/60);
  const maxS = (sprint && p.stamina>2 ? p.topSpeed : p.topSpeed*(p.cruise||0.70)) * fatigue;
  const desired = want.clone();
  if(desired.length()>1) desired.normalize();
  desired.multiplyScalar(maxS);
  const spd = p.vel.length();
  if(spd>2 && desired.length()>.1){
    const cosA = p.vel.dot(desired)/(spd*desired.length());
    if(cosA<.35) p.vel.multiplyScalar(1-Math.min(.9,(.35-cosA))*p.turn*dt);
  }
  const dv = desired.clone().sub(p.vel);
  p.vel.add(dv.clampLength(0,(desired.length()>.1?p.accel:CFG.DECEL)*dt));
  p.pos.addScaledVector(p.vel, dt);
  p.pos.x = THREE.MathUtils.clamp(p.pos.x,-HALF_L-3,HALF_L+3);
  p.pos.y = THREE.MathUtils.clamp(p.pos.y,-HALF_W-3,HALF_W+3);
  /* what he actually did, so the attributes can be checked against the
     pitch rather than against the formula that set them */
  const now = p.vel.length();
  if(now > (p.peak||0)) p.peak = now;
  p.ran = (p.ran||0) + now*dt;
  const burn = 17 - A01(p,'stamina')*9;
  const rec  = 5.5 + A01(p,'stamina')*6;
  if(sprint && desired.length()>.1) p.stamina = Math.max(0,p.stamina-burn*dt);
  else p.stamina = Math.min(100, p.stamina+(spd<1?rec*1.9:rec)*dt);
  if(p.vel.length()>.35){
    const heading = Math.atan2(p.vel.y,p.vel.x);
    let d = heading-p.face;
    while(d>Math.PI) d-=Math.PI*2;
    while(d<-Math.PI) d+=Math.PI*2;
    p.face += THREE.MathUtils.clamp(d,-p.turn*1.4*dt,p.turn*1.4*dt);
  }
  /* Cadence, not "phase proportional to speed". A footballer's stride
     RATE only climbs from about two steps a second to five; the rest of
     the extra ground speed comes from stride LENGTH, which is the swing
     amplitude in animate(). Driving phase straight off speed gave a
     jog that twinkled and a sprint that scissored. */
  /* against HIS top end, not a constant: a 10 m/s winger and a 7.6 m/s
     centre-half should both look flat out when they are flat out */
  const runN = Math.min(1, spd/(p.topSpeed || CFG.SPRINT));
  const gt = p.gait || DEFAULT_GAIT;
  p.phase += (1.15 + runN*1.85) * gt.cadence * Math.PI*2 * dt;
  if(p.phase > Math.PI*2) p.phase -= Math.PI*2;
  p.lunge = Math.max(0,p.lunge-dt);
  p.cool = Math.max(0,p.cool-dt);
  p.kickAnim = Math.max(0,p.kickAnim-dt);
  p.dive = Math.max(0,(p.dive||0)-dt);
  stepSkills(p, dt);
}

function separate(){
  for(let i=0;i<players.length;i++) for(let j=i+1;j<players.length;j++){
    const a=players[i], b=players[j];
    const dx=b.pos.x-a.pos.x, dz=b.pos.y-a.pos.y, d2=dx*dx+dz*dz;
    if(d2<.56 && d2>1e-5){
      const d=Math.sqrt(d2), push=(.75-d)/2;
      a.pos.x-=dx/d*push; a.pos.y-=dz/d*push; b.pos.x+=dx/d*push; b.pos.y+=dz/d*push;
    }
  }
}

/* =====================================================================
   RUNNING STYLES

   Two footballers do not run the same, and a pitch full of one gait is
   the thing that most gives away a simulation. Every player carries a
   signature that is stable for him — seeded on his id, so he runs the
   same way all match and in every match — and shaped by what he actually
   is. A quick, agile winger runs tall and light on a fast cadence with
   his arms tucked in; a heavy centre-half pounds along on a longer,
   lower stride with his elbows out.
   ===================================================================== */
const DEFAULT_GAIT = {cadence:1, stride:1, armSwing:1, armOut:.10, elbow:1,
                      lean:1, bounce:1, splay:0, sway:1, headSteady:.7};
function gaitOf(p){
  const r = k => seedVar(p, 'gait'+k);
  const quick = A01(p,'acceleration'), agile = A01(p,'agility');
  const heavy = THREE.MathUtils.clamp((p.build-0.86)/0.29, 0, 1);
  return {
    cadence:  0.88 + quick*0.28 + r(1)*0.14 - heavy*0.10,
    stride:   0.90 + (1-quick)*0.18 + heavy*0.10 + r(2)*0.16,
    armSwing: 0.68 + agile*0.46 + r(3)*0.30,
    armOut:   0.04 + heavy*0.17 + r(4)*0.13,
    elbow:    0.82 + r(5)*0.50 - agile*0.16,
    lean:     0.82 + r(6)*0.42 + heavy*0.16,
    bounce:   0.70 + agile*0.44 + r(7)*0.34,
    splay:    (r(8)-0.5)*0.20,
    sway:     0.72 + r(9)*0.58,
    headSteady: 0.45 + r(10)*0.5
  };
}

/* =====================================================================
   SKILL MOVES

   Five, chosen because they read at broadcast distance: a stepover, a
   drag-back turn, a shoulder-drop feint, a knock past and go, and a
   nutmeg. Whether the move comes off is a duel — his dribbling, agility
   and balance against the defender's tackling and positioning — and the
   outcome is decided when he commits, so the animation and the result
   never disagree.
   ===================================================================== */
const SKILLS = [
  {id:'stepover', label:'stepover',   t:0.62, gain:0.9},
  {id:'dragback', label:'drag-back',  t:0.70, gain:0.5},
  {id:'feint',    label:'shoulder drop', t:0.48, gain:1.0},
  {id:'knockon',  label:'knock past', t:0.55, gain:1.3},
  {id:'nutmeg',   label:'nutmeg',     t:0.60, gain:1.1}
];
function startSkill(p, opp){
  // a tight space suits a drag-back; open grass suits a knock past
  const space = Math.abs(p.pos.x - S.dir[p.team]*HALF_L);
  let pool = [0,2,4];
  if(space > 22) pool = [0,2,3];
  if(Math.abs(p.pos.y) > HALF_W-12) pool = [0,1,2];
  const k = pool[(Math.random()*pool.length)|0];
  const mv = SKILLS[k];

  const beat = Amix(p,   {dribbling:2.4, agility:1.2, firstTouch:0.9, composure:0.6});
  const stop = Amix(opp, {tackling:1.6, positioning:1.4, decisions:0.8, agility:0.8});
  const win  = THREE.MathUtils.clamp(0.34 + (beat-stop)*0.95, 0.06, 0.94);

  p.skill     = mv.t;
  p.skillMax  = mv.t;
  p.skillKind = k;
  p.skillDir  = (opp.pos.y > p.pos.y) ? -1 : 1;      // go the other side of him
  p.skillWin  = Math.random() < win;
  p.skillOpp  = opp;
  if(p.skillWin){
    opp.cool = Math.max(opp.cool, mv.t*0.9);          // sold — he cannot challenge
    opp.lunge = 0;
  }
}
/* Bend the carry sideways through the move, then away up the pitch. */
function skillSteer(p, want){
  const mv = SKILLS[p.skillKind];
  const k = 1 - p.skill/(p.skillMax||mv.t);           // 0 -> 1 through the move
  const dir = S.dir[p.team];
  const out = new THREE.Vector2(want.x, want.y);
  if(mv.id==='dragback'){
    // check back, then take it away from the man
    const back = Math.max(0, 1-k*2.2);
    out.set(-dir*back + dir*(1-back), p.skillDir*0.7*(1-back));
  } else {
    const lateral = Math.sin(k*Math.PI) * (mv.id==='knockon' ? 0.5 : 1.0);
    out.x += dir*0.5*k;
    out.y += p.skillDir*lateral*1.1;
  }
  if(out.length()>1) out.normalize();
  return out;
}
function stepSkills(p, dt){
  if(p.skill <= 0) return;
  p.skill -= dt;
  if(p.skill > 0) return;
  const mv = SKILLS[p.skillKind];
  if(p.skillWin){
    event('SKILL', p.name+' with a '+mv.label);
    p.vel.multiplyScalar(1.0);
    p.cool = 0;
  } else {
    p.cool = 0.45;                                    // overran it; the ball is loose
    if(ball.owner===p){ ball.owner=null; ball.cool=0.12;
      ball.vel.set(Math.cos(p.face)*3.2, 0, Math.sin(p.face)*3.2); }
  }
  p.skillOpp = null;
}

/* A smooth 0..1 hump centred on `c`, `w` wide, wrapping around the gait
   cycle. Poses built out of these can never go negative, which is how the
   knee is guaranteed to stay on the correct side of the joint. */
const TAU = Math.PI*2;
function bump(u, c, w){
  let d = Math.abs(u-c); d = Math.min(d, 1-d);
  if(d >= w) return 0;
  const k = Math.cos((d/w)*Math.PI/2);
  return k*k;
}
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;

function animate(p, dt){
  const b = p.body, spd = p.vel.length();
  const run = Math.min(1, spd/(p.topSpeed || CFG.SPRINT));
  const gait = clamp((spd-0.30)/1.30, 0, 1);      // fades the stride out to a stand
  const gt = p.gait || DEFAULT_GAIT;
  const u = (p.phase/TAU) % 1;                    // 0 = right foot strike
  const amp = (0.18 + run*0.52) * gait * gt.stride;
  const t = performance.now()/1000;

  b.group.position.set(p.pos.x, 0, p.pos.y);
  b.group.rotation.y = -p.face + Math.PI/2;
  b.lean.rotation.set(0,0,0);
  b.lean.position.y = 0;

  /* ---- pelvis: drops through mid-stance, rises into the float, and
     counter-rotates against the shoulders. That counter-rotation is the
     single strongest cue that a figure is running rather than sliding. */
  const bob = (Math.cos(2*TAU*u)*0.5 + 0.5);
  b.root.position.y = b.hipY - b.H*(0.008 + 0.030*run)*bob*gait*gt.bounce;
  b.root.rotation.y =  Math.sin(TAU*u)*0.13*gait;
  b.root.rotation.z =  Math.sin(TAU*u)*0.05*gait;

  /* ---- legs ----
     hip:   negative reaches forward, positive drives back
     knee:  ALWAYS >= 0 — small flex absorbing the stance, a big fold
            through the swing as the heel comes up to the backside
     ankle: plantarflexes at push-off, dorsiflexes to clear the ground  */
  for(let i=0;i<2;i++){
    const L = b.legs[i];
    const lu = (u + i*0.5) % 1;                   // legs half a cycle apart
    L.hip.rotation.x   = amp*(-Math.cos(TAU*lu)) - amp*0.16*Math.sin(2*TAU*lu) + run*0.10*gait;
    L.hip.rotation.z   = 0; L.hip.rotation.y = OUT(i)*gt.splay;   // toes in or out
    L.knee.rotation.x  = amp*(0.34*bump(lu,0.26,0.30) + 1.70*bump(lu,0.72,0.27))
                       + 0.05 + run*0.10*gait;
    L.ankle.rotation.x = amp*(0.78*bump(lu,0.44,0.20) - 0.42*bump(lu,0.74,0.30));
    L.ankle.rotation.z = 0;
  }

  /* ---- torso: leans into the run, counter-rotates against the hips ---- */
  b.torso.rotation.x = run*0.22*gt.lean + 0.03;
  b.torso.rotation.y = -Math.sin(TAU*u)*0.20*gait*gt.sway;
  b.torso.rotation.z = -Math.sin(TAU*u)*0.045*gait;

  /* ---- arms: opposite the leg on the same side; the elbow only ever
     folds FORWARD, so its rotation.x is negative throughout ---- */
  for(let i=0;i<2;i++){
    const A = b.arms[i], s = i? 1 : -1;
    const au = (u + i*0.5) % 1;
    /* The upper arm carries a backward bias. Without it the arm hangs
       vertically at the mid-swing crossing and a correctly-flexed elbow
       throws the forearm straight out horizontally — which is exactly
       what "the arms are hanging off" looked like. */
    A.sh.rotation.x = amp*0.62*gt.armSwing*Math.cos(TAU*au) + run*0.16*gait;
    A.sh.rotation.z = OUT(i)*(0.06 + gt.armOut + run*0.11);
    A.sh.rotation.y = 0;
    A.el.rotation.x = -((0.42 + run*0.52 + 0.34*bump(au,0.5,0.5)*gait) * gt.elbow);
    A.el.rotation.z = 0;
  }

  /* ---- idle: weight shift and breathing, so a stood-still player is
     not a mannequin between phases of play ---- */
  if(gait < 0.98){
    const q = 1-gait, br = Math.sin(t*1.5 + p.phase)*0.5+0.5;
    for(let i=0;i<2;i++){
      b.legs[i].knee.rotation.x += q*(0.14 + br*0.03);
      b.legs[i].hip.rotation.x  += q*(-0.05 + (i? 0.04 : -0.04)*Math.sin(t*0.7+p.phase));
      b.arms[i].sh.rotation.x   += q*(0.04*Math.sin(t*1.1+p.phase+i));
      b.arms[i].el.rotation.x   -= q*0.22;
    }
    b.root.rotation.z += q*Math.sin(t*0.7+p.phase)*0.03;
    b.torso.rotation.x += q*0.02*br;
  }

  /* ---- head follows the ball, within a neck's worth of travel ---- */
  let ha = Math.atan2(ball.pos.z-p.pos.y, ball.pos.x-p.pos.x) - p.face;
  while(ha>Math.PI) ha-=TAU;
  while(ha<-Math.PI) ha+=TAU;
  b.headPivot.rotation.y = clamp(-ha, -1.15, 1.15) * (0.55 + gt.headSteady*0.45);
  b.headPivot.rotation.x = clamp((ball.pos.y - b.H*0.83)*0.16, -.28, .40) - b.torso.rotation.x*0.7;
  b.headPivot.rotation.z = -b.torso.rotation.z*0.6;

  /* ---- skill moves ----
     Each is a short, readable shape: the leg circling the ball, the foot
     dragging it back, a shoulder dropped hard one way. */
  if(p.skill > 0){
    const mv = SKILLS[p.skillKind];
    const k = 1 - p.skill/(p.skillMax||mv.t);
    const sw = Math.sin(k*Math.PI), d = p.skillDir;
    const W = b.legs[p.footed], O = b.legs[1-p.footed];
    switch(mv.id){
      case 'stepover':                                     // the foot circles the ball
        W.hip.rotation.x = -0.55*sw;
        W.hip.rotation.z = d*0.85*Math.sin(k*TAU);
        W.knee.rotation.x = 0.55 + 0.75*sw;
        W.ankle.rotation.x = 0.25;
        b.torso.rotation.z = -d*0.24*sw;
        b.torso.rotation.y = d*0.30*sw;
        break;
      case 'dragback':                                     // sole on it, turn away
        W.hip.rotation.x = lerp(-0.75, 0.55, k);
        W.knee.rotation.x = 0.35 + 0.95*sw;
        W.ankle.rotation.x = -0.35 + 0.6*k;
        b.torso.rotation.x = -0.20*sw;
        b.root.rotation.y += d*1.05*k;                     // he spins out of it
        break;
      case 'feint':                                        // drop the shoulder
        b.torso.rotation.z = -d*0.46*sw;
        b.torso.rotation.y = d*0.52*sw;
        b.root.rotation.z  = -d*0.16*sw;
        b.arms[0].sh.rotation.z = OUT(0)*(0.30+0.4*sw);
        b.arms[1].sh.rotation.z = OUT(1)*(0.30+0.4*sw);
        break;
      case 'knockon':                                      // push it and go
        W.hip.rotation.x = -0.85*sw;
        W.knee.rotation.x = 0.25 + 0.35*sw;
        W.ankle.rotation.x = 0.40*sw;
        b.torso.rotation.x = 0.26 + 0.14*sw;
        break;
      default:                                             // nutmeg: a short poke
        W.hip.rotation.x = -0.62*sw;
        W.knee.rotation.x = 0.20 + 0.30*sw;
        W.ankle.rotation.x = 0.30*sw;
        O.knee.rotation.x = 0.45;
        b.torso.rotation.y = d*0.18*sw;
    }
  }

  /* ---- striking the ball ----
     kickAnim runs its duration down to 0, so k walks 0 -> 1 across the
     strike. Every knee value below is keyframed and positive. Headers
     and volleys are whole-body actions, not leg swings, so they branch
     away from the standard plant-and-swing entirely. */
  if(p.kickAnim > 0){
    const dur = p.kickT || .34;
    const k = clamp(1 - p.kickAnim/dur, 0, 1);
    const sw = Math.sin(k*Math.PI);
    const kind = p.kickKind || 'pass';

    if(kind === 'header'){
      // rise, arch, and snap the neck and trunk through the ball
      const rise = Math.sin(Math.min(1,k*1.15)*Math.PI);
      b.lean.position.y = b.H*0.26*rise;
      b.torso.rotation.x = lerp(-0.55, 0.42, clamp((k-0.25)/0.45,0,1));
      b.headPivot.rotation.x = lerp(-0.45, 0.34, clamp((k-0.28)/0.40,0,1));
      for(let i=0;i<2;i++){
        b.arms[i].sh.rotation.x = -0.95*rise - 0.25;       // arms up for leverage
        b.arms[i].sh.rotation.z = OUT(i)*(0.55+0.35*rise);
        b.arms[i].el.rotation.x = -0.85;
        b.legs[i].hip.rotation.x = -0.30*rise + (i? 0.35 : -0.20);
        b.legs[i].knee.rotation.x = 0.30 + 0.85*rise;
        b.legs[i].ankle.rotation.x = 0.45*rise;
      }
    } else if(kind === 'divingheader'){
      // full stretch, horizontal, arms trailing
      const air = Math.sin(Math.min(1,k*1.3)*Math.PI);
      b.lean.rotation.x = -1.05*air;
      b.lean.position.y = b.H*0.16*air;
      b.torso.rotation.x = -0.25;
      b.headPivot.rotation.x = 0.20;
      for(let i=0;i<2;i++){
        b.arms[i].sh.rotation.x = 0.85;
        b.arms[i].sh.rotation.z = OUT(i)*0.55;
        b.arms[i].el.rotation.x = -0.25;
        b.legs[i].hip.rotation.x = 0.55 + i*0.15;
        b.legs[i].knee.rotation.x = 0.35;
        b.legs[i].ankle.rotation.x = 0.30;
      }
    } else if(kind === 'volley' || kind === 'halfvolley'){
      // stand off the plant leg and swing across the body
      const K = b.legs[p.footed], P = b.legs[1-p.footed];
      const high = kind === 'volley' ? 1 : 0.55;
      K.hip.rotation.x  = lerp(0.55, -1.05*high-0.35, k);
      K.knee.rotation.x = Math.max(0, k<.45 ? lerp(1.30,0.22,k/.45) : lerp(0.22,0.55,(k-.45)/.55));
      K.hip.rotation.z  = OUT(p.footed)*0.55*high*sw;      // opened out to meet it
      K.ankle.rotation.x = 0.55*sw;
      P.hip.rotation.x  = -0.15; P.knee.rotation.x = 0.35 + 0.25*sw;
      b.lean.position.y = b.H*0.09*sw*high;
      b.lean.rotation.z = OUT(p.footed)*0.30*sw*high;      // leaning away to get over it
      b.torso.rotation.x = -0.30*sw + 0.22*Math.max(0,k-.6);
      b.torso.rotation.y = (p.footed? -1:1)*0.48*sw;
      const SA = b.arms[1-p.footed], CA = b.arms[p.footed];
      SA.sh.rotation.x = -1.25*sw; SA.sh.rotation.z = OUT(1-p.footed)*0.85;
      CA.sh.rotation.x =  0.45*sw; CA.sh.rotation.z = OUT(p.footed)*0.45;
      SA.el.rotation.x = -0.55; CA.el.rotation.x = -0.45;
    } else {
      // ground strike: plant, cock, whip through, follow
      const heavy = (kind==='banger'||kind==='sweep') ? 1.15 : (kind==='tapin' ? 0.55 : 1);
      const K = b.legs[p.footed], P = b.legs[1-p.footed];
      const hipK  = k<.34 ? lerp(0.10, 0.78*heavy, k/.34) : lerp(0.78*heavy, -1.02*heavy, (k-.34)/.66);
      const kneeK = k<.34 ? lerp(0.30, 1.62*heavy, k/.34)
                  : k<.70 ? lerp(1.62*heavy, 0.10, (k-.34)/.36)
                          : lerp(0.10, 0.42, (k-.70)/.30);
      K.hip.rotation.x   = hipK;
      K.knee.rotation.x  = Math.max(0, kneeK);
      K.ankle.rotation.x = 0.30 + 0.35*sw;
      // a curler is struck across the ball, so the leg comes round it
      if(kind==='curler') K.hip.rotation.z = OUT(p.footed)*0.42*sw;
      P.hip.rotation.x   = lerp(-0.28, 0.16, k);
      P.knee.rotation.x  = 0.24 + 0.22*sw;
      P.ankle.rotation.x = 0.05;
      b.root.position.y  = b.hipY - b.H*0.020*sw;
      b.torso.rotation.x = -0.22*sw*heavy + 0.30*Math.max(0,k-.55);
      b.torso.rotation.y = (p.footed? -1:1)*0.34*sw*heavy;
      const CA = b.arms[p.footed], SA = b.arms[1-p.footed];
      SA.sh.rotation.x = -1.05*sw*heavy; SA.sh.rotation.z = OUT(1-p.footed)*0.50;
      CA.sh.rotation.x =  0.55*sw;       CA.sh.rotation.z = OUT(p.footed)*0.20;
      SA.el.rotation.x = -0.75; CA.el.rotation.x = -0.55;
    }
  }

  /* ---- sliding tackle: leg extended along the ground, trailing leg
     folded under, body pitched back onto the hip ---- */
  if(p.lunge > 0){
    const k = 1 - p.lunge/.35;
    b.lean.rotation.x = 0.80 + 0.25*k;
    b.lean.position.y = -b.H*0.20;
    const A = b.legs[0], B = b.legs[1];
    A.hip.rotation.x = -1.30; A.knee.rotation.x = 0.08; A.ankle.rotation.x = -0.25;
    B.hip.rotation.x = -0.30; B.knee.rotation.x = 1.45; B.ankle.rotation.x = 0.30;
    b.torso.rotation.x = -0.45; b.torso.rotation.y = 0.25;
    b.arms[0].sh.rotation.x = 0.85; b.arms[1].sh.rotation.x = 0.55;
    b.arms[0].sh.rotation.z = OUT(0)*0.75; b.arms[1].sh.rotation.z = OUT(1)*0.75;
    b.arms[0].el.rotation.x = -0.30; b.arms[1].el.rotation.x = -0.30;
    if(!p._sprayed && spd > 3){ p._sprayed = true;
      SPRAY.burst(p.pos.x, p.pos.y, -Math.cos(p.face), -Math.sin(p.face)); }
  } else p._sprayed = false;

  /* ---- goalkeeping ---- */
  if(p.isGK && p.dive > 0){
    const k = 1 - p.dive/.85;
    const air = Math.sin(Math.min(1,k*1.25)*Math.PI);       // up, across, down
    b.lean.rotation.z = p.diveDir * (1.35*Math.min(1,k*2.4));
    b.lean.rotation.x = -0.15*air;
    b.lean.position.y = b.H*(0.30*air*(p.diveHigh?1:0.35)) - b.H*0.10*Math.max(0,k-.75)*4;
    for(let i=0;i<2;i++){
      b.arms[i].sh.rotation.x = -2.35 - 0.25*air;           // both hands to the ball
      b.arms[i].sh.rotation.z = OUT(i)*0.18;
      b.arms[i].el.rotation.x = -0.12;
      b.legs[i].hip.rotation.x = -0.55 + i*0.35;
      b.legs[i].knee.rotation.x = 0.55 + i*0.30;
      b.legs[i].ankle.rotation.x = 0.25;
    }
    b.torso.rotation.set(-0.15, 0, 0);
  } else if(p.isGK && spd < 4.2 && p.kickAnim<=0 && p.celeb<=0){
    /* Set position: on the toes, hands up, weight forward.
       This used to need him almost stationary (1.7 m/s), and a keeper is
       almost never stationary — he tracks across his line every time the
       ball moves, which took him over the threshold and dropped him into
       an ordinary run with his arms by his sides. A keeper shuffling
       across his goal keeps his hands up; only a genuine sprint off his
       line, for a cross or a through ball, should put them down. */
    const br = Math.sin(t*2.4 + p.phase)*0.5+0.5;
    for(let i=0;i<2;i++){
      b.arms[i].sh.rotation.x = -0.62 - br*0.06;
      b.arms[i].sh.rotation.z = OUT(i)*1.02;
      b.arms[i].el.rotation.x = -1.15;
      b.legs[i].knee.rotation.x = 0.42 + br*0.05;
      b.legs[i].hip.rotation.x = -0.18;
      b.legs[i].ankle.rotation.x = 0.10;
    }
    b.torso.rotation.x = 0.16;
    b.root.position.y = b.hipY - b.H*0.030;
  }

  /* ---- a manager giving somebody instructions ----
     Not the celebration pose: one arm out, pointing up the pitch, held
     for a second or two and dropped. It is the single most recognisable
     thing a man in a coat does on a touchline. */
  if(p.point > 0){
    const c = Math.min(1, p.point/0.35);
    const j = Math.sin(t*4.5 + (p.seat||0))*0.16;
    const arm = b.arms[p.pointArm||0];
    arm.sh.rotation.x = lerp(arm.sh.rotation.x, -1.42 + j, c);
    arm.sh.rotation.z = lerp(arm.sh.rotation.z, OUT(p.pointArm||0)*0.30, c);
    arm.el.rotation.x = lerp(arm.el.rotation.x, -0.12, c);
    b.torso.rotation.y = lerp(b.torso.rotation.y, OUT(p.pointArm||0)*-0.16, c);
    p.point -= dt;
  }

  /* ---- celebration ---- */
  if(p.celeb > 0){
    const c = Math.min(1, p.celeb/0.4);
    const wave = Math.sin(t*7 + p.idx)*0.22;
    for(let i=0;i<2;i++){
      b.arms[i].sh.rotation.x = lerp(b.arms[i].sh.rotation.x, -2.45 + wave, c);
      b.arms[i].sh.rotation.z = lerp(b.arms[i].sh.rotation.z, OUT(i)*0.55, c);
      b.arms[i].el.rotation.x = lerp(b.arms[i].el.rotation.x, -0.18, c);
    }
    b.torso.rotation.x = lerp(b.torso.rotation.x, -0.16, c);
    b.headPivot.rotation.x = lerp(b.headPivot.rotation.x, -0.30, c);
    p.celeb -= dt;
  }

  // contact blob softens as he leaves the ground
  if(b.contact) b.contact.material.opacity = 0.42 * (1 - Math.min(1, Math.max(0,b.lean.position.y)/(b.H*0.3)));

  // shadow budget: only cast near the action
  const near = Math.abs(p.pos.x-ball.pos.x)<42 && Math.abs(p.pos.y-ball.pos.z)<32;
  if(b._shadow !== near){
    b._shadow = near;
    for(const m of b.parts) m.castShadow = near && S.quality===1;
  }
}

function stepOfficials(dt){
  const ref = officials[0];
  const t = new THREE.Vector2(ball.pos.x - S.dir[S.possTeam]*4, ball.pos.z + 9);
  t.y = THREE.MathUtils.clamp(t.y, -HALF_W+3, HALF_W-3);
  movePlayerLite(ref, t, dt, 6.4);
  for(let i=1;i<3;i++){
    const ar = officials[i];
    const side = i===1 ? -1 : 1;
    const team = i===1 ? 0 : 1;                    // each assistant owns one half's offside line
    const dir = S.dir[team];
    const xs = teamOf(team).map(p=>p.pos.x*dir).sort((a,b)=>b-a);
    const line = (xs.length>1?xs[1]:0)*dir;
    const t2 = new THREE.Vector2(THREE.MathUtils.clamp(line,-HALF_L+2,HALF_L-2), side*(HALF_W+1.6));
    movePlayerLite(ar, t2, dt, 6.0);
  }
}
/* Officials run the same rig and the same cycle as the players — there is
   no reason for the referee to move worse than the men he is following. */
function movePlayerLite(o, target, dt, maxS){
  const to = target.clone().sub(o.pos);
  const d = to.length();
  const want = d>.4 ? to.normalize().multiplyScalar(Math.min(maxS, d*2.2)) : new THREE.Vector2(0,0);
  o.vel.lerp(want, Math.min(1, dt*4));
  o.pos.addScaledVector(o.vel, dt);
  const spd = o.vel.length();
  if(spd>.3){
    let da = Math.atan2(o.vel.y,o.vel.x) - o.face;   // wrap, or he spins on the turn
    while(da> Math.PI) da-=TAU;
    while(da<-Math.PI) da+=TAU;
    o.face += THREE.MathUtils.clamp(da, -6*dt, 6*dt);
  }
  o.phase += (1.15 + Math.min(1,spd/CFG.SPRINT)*1.85) * TAU * dt;
  if(o.phase > TAU) o.phase -= TAU;
  animate(o, dt);
}
function animateLite(o){ animate(o, 0); }

/* ================== kicks ================== */
const ZERO = new THREE.Vector2(0,0);
function ballTo(p){ return new THREE.Vector2(ball.pos.x-p.pos.x, ball.pos.z-p.pos.y); }
function dist2D(p){ return ballTo(p).length(); }
function passError(p,d){
  /* PASS_ERR. This is the line the manager game cares about most, so
     the spread is deliberately wide: a 20 for passing lands it on the
     laces almost every time, a 3 sprays it. Vision carries the long
     ones, composure keeps him steady under pressure, and a rare wobble
     stands in for the ball bobbling off a divot. */
  let skill = Amix(p, {passing:2.6, vision:1.0, decisions:0.7, composure:0.5, firstTouch:0.4});
  /* a well-led side keeps its head; a badly led one starts to rush */
  skill = THREE.MathUtils.clamp(skill + (orgOf(p.team)-0.5)*0.24, 0, 1);
  /* A side defending a goal the plan has already awarded starts to look
     ragged — which is how a scripted goal arrives out of real play
     rather than being dropped in from nowhere. */
  if(SCRIPT.active && SCRIPT.pending && SCRIPT.pending.team !== p.team)
    skill *= 1 - scriptUrgency(SCRIPT.pending.team)*0.68;
  const range = 0.06 + Math.min(1, d/45)*0.30;      // long balls are harder
  /* The wobble is what reads as "he cannot pass". The base error is
     fine -- a National League player misses by about a metre and a half
     over twenty, which is a receivable ball -- but one pass in thirteen
     was multiplied by 2.8, which at that range is nearly four metres and
     a giveaway. One in twenty at 2.2 keeps the scruffiness without
     making every other pass a present. The skill gradient in the line
     above is untouched, because a poor side is supposed to be poorer. */
  const wobble = Math.random() < (0.075 - skill*0.058) ? 2.2 : 1;
  return (1-skill*0.94)*range*(Math.random()*2-1)*wobble;
}
/* How long each technique takes to execute, and where on the body the
   ball leaves from. A header leaves at the man's forehead; a volley off
   his laces at shin height; a tap-in off the deck. */
const STRIKE_T = {header:.42, divingheader:.55, volley:.40, halfvolley:.38,
                  banger:.44, curler:.40, chip:.38, tapin:.24, sidefoot:.30, sweep:.34};
function strikeHeight(p, kind){
  if(kind==='header') return p.H*0.93;
  if(kind==='divingheader') return p.H*0.55;
  if(kind==='volley') return Math.max(0.35, Math.min(ball.pos.y, p.H*0.55));
  if(kind==='halfvolley') return 0.28;
  return 0.16;
}
function releaseBall(p, kind){
  ball.owner=null; ball.cool=.34; S.lastTouch=p; S.possTeam=p.team;
  p.cool=.18;
  p.kickAnim = kind && STRIKE_T[kind] ? STRIKE_T[kind] : .34;
  p.kickKind = kind || 'pass';
  p.kickT    = p.kickAnim;
  p.skill = 0;                                   // a strike cancels any trick
}
function kick(p, dirV, speed, lift, spin, kind){
  const off = kind==='header'||kind==='divingheader' ? .30 : .45;
  ball.pos.set(p.pos.x+Math.cos(p.face)*off,
               Math.max(strikeHeight(p, kind), CFG.BALL_R),
               p.pos.y+Math.sin(p.face)*off);
  ball.vel.set(dirV.x*speed, lift, dirV.y*speed);
  ball.spin = spin||0;
  releaseBall(p, kind);
}
function passOptions(p){
  return teamOf(p.team).filter(m=>m!==p && !m.isGK).map(m=>{
    const to = new THREE.Vector2(m.pos.x-p.pos.x, m.pos.y-p.pos.y), d = to.length();
    let press=0;
    for(const o of teamOf(1-p.team)){
      const od=Math.hypot(o.pos.x-m.pos.x,o.pos.y-m.pos.y);
      if(od<4.5) press += (4.5-od);
    }
    return {m,to,d,press,fwd:(m.pos.x-p.pos.x)*S.dir[p.team]};
  }).filter(o=>o.d>3 && o.d<42);
}
/* IS THERE ANYBODY STANDING IN THE WAY?
   Nothing asked this, which is most of why the ball kept being given
   away: a defender directly between the passer and the man he picked
   cost the option nothing at all, so the ball was played straight
   through him. This walks the lane and reports how blocked it is —
   an opponent near the line and between the two ends is a problem, one
   behind the passer or beyond the target is not. */
function laneRisk(from, target){
  const dx = target.pos.x - from.pos.x, dz = target.pos.y - from.pos.y;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx/len, uz = dz/len;
  let risk = 0;
  for(const o of teamOf(1-from.team)){
    if(o.isGK) continue;
    const rx = o.pos.x - from.pos.x, rz = o.pos.y - from.pos.y;
    const along = rx*ux + rz*uz;
    if(along < 1.0 || along > len - 0.5) continue;      // not between them
    const off = Math.abs(rx*uz - rz*ux);                // distance from the line
    if(off < 2.4) risk += (2.4 - off) * (1 - (along/len)*0.3);
  }
  return risk;
}

function doPass(p, aimV, power){
  const opts = passOptions(p);
  if(!opts.length){ kick(p,new THREE.Vector2(Math.cos(p.face),Math.sin(p.face)),14,.5,0); return; }
  const aim = aimV.lengthSq()>.04 ? aimV.clone().normalize() : new THREE.Vector2(Math.cos(p.face),Math.sin(p.face));
  let best=null, bs=-1e9;
  const urge = SCRIPT.active ? scriptUrgency(p.team) : 0;
  for(const o of opts){
    /* THE OLD WEIGHTS PICKED WHOEVER WAS IN FRONT OF HIS NOSE.
       `dot(aim)*100` against `-press*6` meant the direction he happened
       to be facing was worth sixteen times more than the man being
       marked, and `aim` is only ever his facing because every caller
       passes ZERO — and facing is set from his direction of travel. So
       he played it wherever he was running, through whoever was there,
       to whoever was standing behind them. In the National League, with
       the widest passing error in the game, that is a turnover nearly
       every time.

       Now: a clear lane and a free man come first, distance keeps it
       sensible, and where he is facing is a mild preference rather than
       the whole decision. */
    const lane = laneRisk(p, o.m);
    let sc = o.to.clone().normalize().dot(aim)*26
           - o.d*1.35
           - o.press*11
           - lane*38
           + o.fwd*1.05;
    /* the plan's scorer is still found, but not through a defender */
    if(urge > 0 && isScriptScorer(o.m)) sc += (60 + urge*320) * (lane > 1.6 ? 0.35 : 1);
    if(sc>bs){ bs=sc; best=o; }
  }
  const lead = best.m.vel.clone().multiplyScalar(.35);
  const to = new THREE.Vector2(best.m.pos.x+lead.x, best.m.pos.y+lead.y).sub(p.pos);
  const d = to.length();
  const speed = THREE.MathUtils.clamp(d*1.45+5,8,30)*(.75+power*.4)*(.95+Math.random()*.1);
  to.normalize().rotateAround(ZERO, passError(p,d));
  p.face = Math.atan2(to.y,to.x);
  /* WHO IT IS FOR. Nothing recorded this, so nobody came to meet a pass:
     only the man who happened to be nearest the ball chased it, and the
     intended receiver carried on walking to his slot -- which from the
     stand looks exactly like a player running away from a ball played to
     him. He is named now, and `aiPlayer` sends him to it. */
  S.passTo = best.m; S.passAt = performance.now();
  kick(p,to,speed,.35,0);
}
function armOffside(passer, receiver){
  const dir=S.dir[passer.team];
  const opp = teamOf(1-passer.team).map(o=>o.pos.x*dir).sort((a,b)=>b-a);
  const secondLast = opp.length>1?opp[1]:opp[0];
  const rx = receiver.pos.x*dir;
  S.pendingOffside = (rx > secondLast+.3 && rx > .5 && rx > ball.pos.x*dir)
    ? {team:passer.team, player:receiver} : null;
}
function doThrough(p, aimV, power){
  const opts = passOptions(p).filter(o=>o.fwd>-2);
  const aim = aimV.lengthSq()>.04 ? aimV.clone().normalize() : new THREE.Vector2(S.dir[p.team],0);
  let best=null, bs=-1e9;
  /* THE THROUGH BALL WAS THE OLD doPass, AND NOBODY HAD FIXED IT.
     `dot(aim)*100` again, so it picked whoever was most directly down
     the pitch; no lane check at all, so it went through defenders; and
     it deliberately put the ball seven to fourteen metres BEYOND him
     with the error multiplied by 1.3. For a decent player that is about
     a third of his releases, and most of them were a present. Same
     treatment as the ordinary pass: a clear lane and a free man matter,
     the direction he faces is a preference, and the ball is played a
     findable distance in front rather than hopefully past everybody. */
  for(const o of opts){
    const lane = laneRisk(p, o.m);
    const sc = o.to.clone().normalize().dot(aim)*30
             + o.fwd*1.30 - o.d*0.70 - o.press*8 - lane*34;
    if(sc>bs){ bs=sc; best=o; }
  }
  if(!best){ doPass(p,aimV,power); return; }
  const space = new THREE.Vector2(
    THREE.MathUtils.clamp(best.m.pos.x + S.dir[p.team]*(4+power*5), -HALF_L+2, HALF_L-2),
    best.m.pos.y + best.m.vel.y*.6);
  const to = space.sub(p.pos), d = to.length();
  if(S.offsideOn) armOffside(p, best.m);
  S.passTo = best.m; S.passAt = performance.now();
  to.normalize().rotateAround(ZERO, passError(p,d)*1.15);
  p.face = Math.atan2(to.y,to.x);
  kick(p,to,THREE.MathUtils.clamp(d*1.5+6,10,30),.8,0);
}
/* =====================================================================
   FINISHING

   One generic shot could only ever produce one kind of goal. A finish is
   really a choice between a handful of techniques, and which one is
   available depends on where the ball is, how high it is, how much time
   he has and what he is good at:

     tap-in      six yards out, ball on the deck, no power needed
     side-foot   placed, accurate, low — the bread-and-butter finish
     sweep       a driven low finish from the edge of the area
     curler      whipped round the keeper with the outside of the box
     banger      a full-blooded drive from distance
     chip        lifted over an advancing keeper
     volley      struck out of the air below the waist
     halfvolley  taken on the bounce
     header      met in the air; needs height and heading, not shooting
     divingheader a low ball met with the forehead at full stretch

   Each has its own accuracy model, its own ball flight, and its own
   strike animation, and the type is carried through to the goal graphic
   so the replay caption says what it actually was.
   ===================================================================== */
const FINISH = {
  tapin:       {label:'TAP-IN',        speed:[10,4],  lift:[0.15,0.3], curl:0.0, spread:0.30, attr:{composure:2,firstTouch:1}},
  sidefoot:    {label:'SIDE-FOOT',     speed:[16,7],  lift:[0.4,0.7],  curl:0.6, spread:0.62, attr:{shooting:1.6,composure:1.4,firstTouch:0.8}},
  sweep:       {label:'LOW DRIVE',     speed:[23,9],  lift:[0.3,0.5],  curl:0.4, spread:0.90, attr:{shooting:2,strength:0.6,composure:0.8}},
  curler:      {label:'CURLER',        speed:[20,8],  lift:[1.1,1.0],  curl:4.4, spread:0.88, attr:{shooting:1.6,technique:0,firstTouch:1.2,vision:0.6}},
  banger:      {label:'SCREAMER',      speed:[29,12], lift:[1.2,1.4],  curl:1.2, spread:1.55, attr:{shooting:2.2,strength:1.4,composure:0.5}},
  chip:        {label:'CHIP',          speed:[13,4],  lift:[3.4,1.4],  curl:0.3, spread:1.05, attr:{composure:2,vision:1.4,firstTouch:1.2}},
  volley:      {label:'VOLLEY',        speed:[26,10], lift:[0.9,1.1],  curl:0.9, spread:1.60, attr:{shooting:1.8,firstTouch:1.6,agility:1.0}},
  halfvolley:  {label:'HALF-VOLLEY',   speed:[25,10], lift:[0.8,1.0],  curl:0.7, spread:1.35, attr:{shooting:1.8,firstTouch:1.4}},
  header:      {label:'HEADER',        speed:[15,7],  lift:[0.5,0.9],  curl:0.2, spread:1.15, attr:{heading:2.6,strength:1.0,positioning:0.8}},
  divingheader:{label:'DIVING HEADER', speed:[14,5],  lift:[0.2,0.4],  curl:0.1, spread:1.30, attr:{heading:2.4,composure:1.0,agility:1.0}}
};

/* Which techniques are even on the table right now. Returned best-first;
   the caller weights them by the player's ability at each. */
function finishOptions(p, d, ballY, pressure){
  const out = [];
  const airborne = ballY > 0.55, high = ballY > 1.35, rising = ball.vel.y > 0.4;
  const tall = p.H > 1.84;
  if(high && d < 18){
    out.push('header');
    if(ballY < 2.0 && d < 11 && pressure < 1.2) out.push('divingheader');
  } else if(airborne && d < 26){
    out.push(rising || ballY > 0.95 ? 'volley' : 'halfvolley');
  } else {
    if(d < 6.5) out.push('tapin');
    if(d < 17) out.push('sidefoot');
    if(d < 22) out.push('sweep');
    if(d > 9 && d < 26 && Math.abs(p.pos.y) > 5) out.push('curler');
    if(d > 19) out.push('banger');
    const gk = keeperOf(1-p.team);
    const gkOut = gk ? Math.hypot(gk.pos.x - S.dir[p.team]*HALF_L, gk.pos.y) : 0;
    if(gkOut > 4.5 && d > 8 && d < 30) out.push('chip');
  }
  if(!out.length) out.push(tall && high ? 'header' : 'sidefoot');
  return out;
}
function pickFinish(p, d, pressure){
  const opts = finishOptions(p, d, ball.pos.y, pressure);

  /* EVERY GOAL LOOKED THE SAME, and this is where it came from. The
     engine knows ten ways to finish, and then took the ARGMAX of them:
     for a given player at a given distance the same option won almost
     every time, because the only thing separating the candidates was a
     ±26 jitter against a score built from a hundred points of ability
     and twenty-two of difficulty. One striker, one distance, one finish,
     for ever.

     Two ways to fix that and only one of them is honest. Widening the
     jitter would have a poor finisher attempt an overhead kick as often
     as a good one; that is variety bought by making everybody stupid.
     Instead the score becomes a WEIGHT and the finish is drawn from it,
     so a player still mostly does what he is best at and occasionally
     does something else — which is what makes two goals by the same man
     look like two goals rather than one played twice.

     The temperature is what buys the variety. At 16 the best option is
     roughly six times likelier than one a couple of classes below it, so
     the tap-in is still the tap-in and the thirty-yarder is still rare
     and still mostly struck by somebody who can strike it. */
  const weighted = [];
  let total = 0;
  for(const k of opts){
    const f = FINISH[k];
    let sc = Amix(p, f.attr)*100 - f.spread*22;
    if(k==='banger') sc += (A01(p,'shooting')-0.55)*70;      // only real strikers try these
    if(k==='chip')   sc += (A01(p,'composure')-0.6)*60;
    if(k==='divingheader') sc += (A01(p,'aggression')-0.5)*40;
    const w = Math.exp(sc/16);
    weighted.push({ k, w });
    total += w;
  }
  if(!(total > 0)) return opts[0];
  let r = Math.random()*total;
  for(const o of weighted){ r -= o.w; if(r <= 0) return o.k; }
  return weighted[weighted.length-1].k;
}

function doShot(p, aimV, power, forced){
  const gx = S.dir[p.team]*HALF_L;
  const flat = new THREE.Vector2(gx - p.pos.x, -p.pos.y);
  const d = flat.length();
  let pressure = 0;
  for(const o of teamOf(1-p.team))
    if(!o.isGK) pressure += Math.max(0, 1 - Math.hypot(o.pos.x-p.pos.x,o.pos.y-p.pos.y)/4);

  /* If the plan owes this side a goal and this is the man it names,
     the technique it names is the one he uses. */
  const urge = SCRIPT.active ? scriptUrgency(p.team) : 0;
  const mine = isScriptScorer(p);
  let kind = forced || pickFinish(p, d, pressure);
  if(mine && urge > 0 && SCRIPT.pending && SCRIPT.pending.finish && FINISH[SCRIPT.pending.finish])
    kind = SCRIPT.pending.finish;
  const f = FINISH[kind];

  /* Accuracy. Ability closes the spread, distance and pressure open it,
     and tired legs open it further. A 19-shooting striker eight yards
     out hits the target nearly every time; a 6-shooting full-back
     hammering one from thirty rarely does. */
  const skill = Amix(p, f.attr);
  const tired = 1 - Math.min(1, p.stamina/45);
  const spread = f.spread * (1.70 - skill*1.05)
               * (1 + Math.max(0, d-14)/34)
               * (1 + pressure*0.30)
               * (1 + tired*0.45)
               * (1 - A01(p,'composure')*0.22);

  let aimZ = THREE.MathUtils.clamp(
    (aimV && aimV.lengthSq()>.04 ? aimV.y*3.0 : 0)
      + (Math.random()-.5)*4.4                          // he picks a corner
      + (Math.random()-.5)*spread*6.2,                  // and this is whether he hits it
    -8.6, 8.6);
  /* The plan's goal is not left to chance: as it falls due the aim is
     pulled inside the posts. It still arrives as a struck shot from open
     play — it simply does not miss. */
  const put = mine ? urge : urge*0.55;
  if(put > 0) aimZ = THREE.MathUtils.clamp(aimZ*(1-put*0.95), -3.1, 3.1);
  const to = new THREE.Vector2(gx, aimZ).sub(p.pos);
  const facing = new THREE.Vector2(Math.cos(p.face), Math.sin(p.face));
  const align = facing.dot(to.clone().normalize());
  // striking across your body is harder than striking through the ball
  to.rotateAround(ZERO, (Math.random()-.5)*(1-Math.max(0,align))*0.55*(1.3-skill*0.6));

  const pw = power==null ? 0.75 : power;
  const speed = (f.speed[0] + f.speed[1]*pw) * (0.80 + A01(p,'strength')*0.22)
              * (0.92 + align*0.08) * (0.94 + Math.random()*0.12);
  const lift  = f.lift[0] + f.lift[1]*Math.random() + Math.max(0,d-20)*0.035;
  const curl  = f.curl * (Math.random()*2-1) * (0.5 + A01(p,'firstTouch')*0.9);

  S.stats.shots[p.team]++;
  S.liveShot = {team:p.team, player:p, t:3.2, kind, d};
  emit('shot', {team:p.team, player:p.name, pid:p.pid, finish:kind,
                distance:Math.round(d), minute:clockLabel()});
  S.pendingOffside = null;
  p.face = Math.atan2(to.y,to.x);
  p.strike = {kind, t:0};                                 // drives the animation
  kick(p, to.normalize(), speed, lift, curl, kind);
}
function clearance(p, panic){
  /* IN HIS OWN SIX-YARD BOX, UNDER PRESSURE, HE PUTS IT OUT.
     Every clearance used to go up the pitch, however desperate, which is
     one of the reasons corners were so rare. A defender stretching for
     one on his own goal line hooks it behind and takes the corner. */
  if(panic && !p.isGK){
    const line = S.dir[p.team]*-HALF_L;
    if(Math.abs(p.pos.x-line) < CFG.PEN_D*0.72 && Math.random() < 0.30){
      S.stats.corners[1-p.team]++;
      S.lastTouch = p; p.cool = .35;
      setRestart('corner', 1-p.team,
        new THREE.Vector2(line, Math.sign(p.pos.y||1)*(HALF_W-.4)), 'CORNER');
      event('CLEARANCE', p.name+' hacks it behind');
      return;
    }
  }
  // a keeper with distribution picks a man; a panicking defender does not
  const acc = p.isGK ? A01(p,'distribution') : A01(p,'passing')*0.6;
  const spread = (panic ? 2.1 : 1.1) * (1.15 - acc*0.85);
  const dir = new THREE.Vector2(S.dir[p.team], (Math.random()-.5)*spread).normalize();
  p.face = Math.atan2(dir.y,dir.x);
  kick(p, dir, (panic ? 22+Math.random()*10 : 26) * (0.85 + A01(p,'strength')*0.25),
       panic ? 6.5 : 5.2, 0);
}
function doCross(p){
  const dir = S.dir[p.team];
  const far = -Math.sign(p.pos.y||1);
  const target = new THREE.Vector2(dir*(HALF_L-7.5), far*(2+Math.random()*6));
  const to = target.sub(p.pos);
  const d = to.length();
  const cAcc = Amix(p, {crossing:2.4, vision:0.8, technique:0});
  to.normalize().rotateAround(ZERO, (Math.random()-.5)*(0.52 - cAcc*0.40));
  p.face = Math.atan2(to.y,to.x);
  kick(p, to, THREE.MathUtils.clamp(d*1.15+4, 12, 26), 4.6+Math.random()*1.6,
       (Math.random()-.5)*2.4*cAcc);
  event('CROSS', p.name+' swings it in');
}

/* ================== possession ================== */
/* HOW HIGH IS AN AERIAL DUEL. Above the head was the obvious answer and
   the wrong one: at 1.05 m the contest happened three times a match, so
   heading had nothing to act on however heavily it was weighted. A ball
   at chest height is headed or chested as often as one above the head,
   and it is still won by the man who reads and attacks it. */
const AERIAL_H = 0.72;
function resolvePossession(){
  if(ball.cool>0 || S.phase!=='play') return;
  const owner = ball.owner;
  const wasHigh = ball.pos.y > AERIAL_H;  /* for the aerial-duel count */
  let best=null, bestD=1e9;
  for(const p of players){
    if(p.cool>0) continue;
    const d = dist2D(p);
    // a taller man covers more ground with the same step, and gets higher
    let reach = (CFG.CTRL_R + (p.lunge>0?1.1:0) + (p.isGK?1.25:0)) * p.reach;
    if(p.isGK && S.liveShot && S.liveShot.team!==p.team)
      reach *= 1.35 + A01(p,'agility')*0.55;      // full stretch at a shot
    if(d>reach || ball.pos.y > (p.isGK?2.55:1.5)*p.reach) continue;
    let score = d;
    if(p===owner) score -= .65;
    else if(owner && p.team===owner.team) score += .5;
    /* WHO GETS THERE FIRST IS NOT ONLY WHO IS NEAREST.
       This was pure geometry, and geometry is decided by the formation --
       which is why a four-point gap in quality could be beaten by a
       spare holding midfielder, and why the same two squads produced
       12 wins out of 12 in one shape and 5 out of 12 in another. A
       loose ball is a duel like any other: reading it, reacting to it
       and getting a yard on the man beside you. It is worth about half
       a metre of the 1.35m control radius between the best in the
       division and the worst, so shape still matters -- it simply no
       longer decides the match on its own. */
    score -= (Amix(p,{positioning:1.3, decisions:1.0, acceleration:0.9, workRate:0.5})
              + (orgOf(p.team)-0.5)*0.62 - 0.5) * 1.80;
    /* A HIGH BALL IS WON IN THE AIR, NOT BY WHOEVER IS NEAREST.
       Heading had one job in this engine -- the accuracy of a header
       once he was already taking one -- and no say at all in whether he
       got to it. So a 4-heading winger out-jumped an 18-heading centre
       half as long as he stood a few inches closer, and the attribute
       barely showed in a match. A ball above chest height is now a
       contest, and it is the one place strength is worth as much as
       timing. */
    if(ball.pos.y > AERIAL_H && !p.isGK)
      score -= (Amix(p,{heading:2.2, strength:1.0, positioning:0.6}) - 0.5) * 0.85;
    /* AND A BALL ARRIVING QUICKLY HAS TO BE CONTROLLED.
       First touch only sharpened a finish and steadied a pass; taking a
       driven ball down was free for everybody. The quicker it arrives,
       the more a poor touch lets it run. */
    const arriving = ball.vel.length();
    if(arriving > 8 && p !== owner)
      score += (0.55 - Amix(p,{firstTouch:2.0, composure:0.7, agility:0.6}))
               * Math.min(1, arriving/22) * 0.75;
    if(SCRIPT.active && SCRIPT.stats && SCRIPT.stats.possession)
      score -= (possBias(p.team)-1)*9.0;             // 50-50s go the plan's way
    if(score<bestD){ bestD=score; best=p; }
  }
  if(!best || best===owner) return;
  if(S.pendingOffside && best===S.pendingOffside.player){
    const off = S.pendingOffside; S.pendingOffside=null;
    event('OFFSIDE', off.player.name+' caught ahead');
    setRestart('free', 1-off.team, new THREE.Vector2(best.pos.x,best.pos.y), 'OFFSIDE');
    return;
  }
  if(S.pendingOffside && best.team!==S.pendingOffside.team) S.pendingOffside=null;
  /* A challenge is a duel: his tackling and strength against the
     carrier's dribbling, balance and composure. Lose it badly enough and
     it is a foul — and a wild, aggressive tackler concedes more of them. */
  if(owner && owner.team!==best.team && best.lunge>0){
    const d = Math.hypot(owner.pos.x-best.pos.x, owner.pos.y-best.pos.y);
    if(d < 1.15){
      const win  = Amix(best,  {tackling:2.4, positioning:0.8, strength:0.8, agility:0.6});
      const keep = Amix(owner, {dribbling:2.0, agility:1.0, composure:0.9, strength:0.8});
      const edge = win - keep;                       // -1 .. +1
      const foul = THREE.MathUtils.clamp(0.34 - edge*0.42 + A01(best,'aggression')*0.20
                                         - (orgOf(best.team)-0.5)*0.30, 0.04, 0.72);
      if(Math.random() < foul){
        const line = S.dir[best.team]*-HALF_L;
        const inBox = Math.abs(owner.pos.x-line) < CFG.PEN_D
                   && Math.abs(owner.pos.y) < CFG.PEN_W/2;
        if(inBox && scriptAllowsGoal(owner.team)){
          awardPenalty(owner.team, null, best.name+' brings down '+owner.name);
        } else {
          event('FOUL', best.name+' catches '+owner.name);
          setRestart('free', owner.team, new THREE.Vector2(owner.pos.x,owner.pos.y), 'FREE KICK');
        }
        return;
      }
      if(Math.random() > 0.5 + edge*0.45){           // beaten: the carrier goes past
        best.cool = 0.55; return;
      }
    }
  }
  // blocks, saves and deflections on a shot in flight
  if(S.liveShot && S.liveShot.team!==best.team && ball.vel.length()>10){
    const line = S.dir[best.team]*-HALF_L;
    const inBox = Math.abs(ball.pos.x-line)<CFG.PEN_D && Math.abs(ball.pos.z)<CFG.PEN_W/2;
    if(best.isGK){
      S.stats.onTarget[S.liveShot.team]++; S.liveShot = null;
      // throw him at it — sideways relative to the way he is facing
      const sideDot = (ball.pos.x-best.pos.x)*(-Math.sin(best.face))
                    + (ball.pos.z-best.pos.y)*( Math.cos(best.face));
      best.dive = .85; best.diveDir = sideDot>=0 ? 1 : -1;
      best.diveHigh = ball.pos.y > 1.15 ? 1 : 0;
      cutTo('save', 1.6);
    }
    /* Whether he keeps it out. A keeper's shot-stopping is reflexes and
       handling against how hard and how well the shot was struck; an
       outfielder blocking is bravery and positioning. Good handling
       gathers it, poor handling parries it back into danger. */
    let stop;
    if(best.isGK){
      const shooter = S.liveShot ? S.liveShot.player : null;
      const power = Math.min(1, ball.vel.length()/32);
      const quality = shooter ? Amix(shooter,{shooting:1.6,composure:1.0}) : 0.5;
      stop = THREE.MathUtils.clamp(
        0.20 + Amix(best,{reflexes:2.0, handling:1.2, positioning:0.9, agility:0.7})*0.62
             - power*0.22 - quality*0.16, 0.08, 0.88);
      // a goal is due to the other side: he is not getting to this one
      if(SCRIPT.active && SCRIPT.pending && SCRIPT.pending.team !== best.team)
        stop *= 1 - scriptUrgency(SCRIPT.pending.team)*0.92;
    } else {
      stop = 0.22 + Amix(best,{positioning:1.4, aggression:1.0, tackling:0.6})*0.42;
    }
    if(inBox && Math.random() < stop){
      const clean = best.isGK && Math.random() < A01(best,'handling')*0.75;
      if(clean){                                    // gathered, match stops
        ball.owner = best; ball.vel.set(0,0,0); S.passTo=null;
        S.possTeam = best.team; S.lastTouch = best; best.gkHold = 1.1;
        event('SAVE', best.name+' holds it');
        return;
      }
      /* BEHIND FOR A CORNER, WHICH IS WHERE THESE ACTUALLY GO.
         This used to send every parry and every block back up the pitch,
         so the only way to win a corner was a wayward pass — measured at
         two corners in six matches, against about ten a game in real
         football, and the ticker said "pushes it behind" while the ball
         went the other way. A keeper at full stretch puts it round the
         post most of the time; a defender throwing himself in front of
         one deflects it over rather less often. */
      const behind = Math.random() < (best.isGK ? 0.62 : 0.34);
      if(behind){
        const line = S.dir[best.team]*-HALF_L;      // the goal he is defending
        const z = THREE.MathUtils.clamp(ball.pos.z + (Math.random()-.5)*6,
                                        -(HALF_W-.4), HALF_W-.4);
        S.stats.corners[1-best.team]++;
        S.lastTouch = best; best.cool = .5;
        setRestart('corner', 1-best.team,
          new THREE.Vector2(line, Math.sign(z||1)*(HALF_W-.4)), 'CORNER');
        event(best.isGK?'SAVE':'BLOCK',
              best.name + (best.isGK?' turns it round the post':' deflects it behind'));
        return;
      }
      const away = -S.dir[best.team];              // parried clear, back into play
      ball.vel.set(away*9, 2.6, (Math.random()-.5)*12);
      ball.cool = .45; best.cool = .5; S.lastTouch = best;
      event(best.isGK?'SAVE':'BLOCK',
            best.name + (best.isGK?' parries it clear':' throws himself in front'));
      return;
    }
    if(best.isGK && Math.random() < 0.35) event('SAVE', best.name+' gathers it');
  }
  // a tackle near the touchline can knock the ball out
  if(owner && owner.team!==best.team && best.lunge>0 &&
     Math.abs(ball.pos.z) > HALF_W-3.5 && Math.random() < .4){
    const out = Math.sign(ball.pos.z);
    ball.vel.set(ball.vel.x*.4, 1.2, out*7);
    ball.cool = .35; best.cool = .4; S.lastTouch = best;
    return;
  }
  if(!owner || owner.team !== best.team){
    S.stats.loose[best.team]++;
    if(wasHigh) S.stats.aerial[best.team]++;
  }
  ball.owner = best; ball.vel.set(0,0,0); S.passTo=null;
  S.possTeam = best.team; S.lastTouch = best;
  if(best.isGK) best.gkHold = 1.1;
}

/* ================== AI ================== */
function nearestToBall(team){
  let best=null, bd=1e9;
  const urge = SCRIPT.active ? scriptUrgency(team) : 0;
  for(const p of teamOf(team)){
    if(p.isGK) continue;
    let d = dist2D(p);
    if(urge>0 && isScriptScorer(p)) d -= urge*9;   // he gambles on it
    if(d<bd){ bd=d; best=p; }
  }
  return best;
}
/* =====================================================================
   A BRAIN EACH
   ---------------------------------------------------------------------
   "every player on the pitch has his own brain, his own attributes and
    his own style of playing. Not everyone completely unique, but
    everyone has their own."

   Attributes were already being read all over this file, but always the
   same way: the same weighted blend of the same numbers at every
   decision, so two players with similar ratings made identical choices
   for ever. What was missing is the bit that is not in the ratings — the
   twenty-two who are technically alike but do not play alike. One
   full-back overlaps every time, another never does; one midfielder
   shoots from thirty yards, the man beside him always squares it.

   So each player gets five leanings, worked out once and kept. Each is
   mostly his attributes, because a style he has not got the feet for is
   a lie, plus a small fixed nudge drawn from his own player id. The
   nudge is +/-0.17: enough that two similar players differ, not enough
   to make a poor passer into a playmaker. And because it comes from his
   id rather than from Math.random, he plays the same way in every match
   he ever appears in, which is what makes him a person rather than a
   dice roll.

       risk     how ambitious a ball he looks for
       shoots   how readily he has a go
       runs     how much he carries it himself
       presses  how hard he hunts it back
       holds    how much he stays where he is meant to be
   ===================================================================== */
function styleSeed(p){
  const s = String(p.pid || p.name || p.idx) + ':' + p.team;
  let h = 2166136261;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h>>>0;
}
function styleRnd(seed, k){
  let a = (seed + Math.imul(k, 0x9E3779B9))>>>0;
  a ^= a>>>16; a = Math.imul(a, 2246822507);
  a ^= a>>>13; a = Math.imul(a, 3266489909); a ^= a>>>16;
  return (a>>>0)/4294967296;
}
function styleOf(p){
  if(p._style) return p._style;
  const seed = styleSeed(p);
  const nudge = k => (styleRnd(seed, k) - 0.5)*0.34;
  const cl = v => THREE.MathUtils.clamp(v, 0, 1);
  p._style = {
    risk:    cl(Amix(p,{vision:1.3, passing:0.9, decisions:0.8, composure:0.5}) + nudge(1)),
    shoots:  cl(Amix(p,{shooting:1.5, composure:0.8, aggression:0.4})           + nudge(2)),
    runs:    cl(Amix(p,{dribbling:1.5, pace:0.8, firstTouch:0.6, composure:0.4})+ nudge(3)),
    presses: cl(Amix(p,{workRate:1.4, aggression:1.0, stamina:0.7})             + nudge(4)),
    holds:   cl(Amix(p,{positioning:1.3, decisions:1.0, marking:0.8})           + nudge(5)),
  };
  return p._style;
}

/* ---------------------------------------------------------------------
   WHO IS PICKING UP WHOM
   ---------------------------------------------------------------------
   Built once a frame for the side without the ball and cached, because
   every defender asking every opponent every frame is the same work
   eleven times over.

   The rule is the one a defence actually uses: the men closest to their
   own goal take the men closest to their own goal. Working through the
   defending side from the back means a centre-half claims the striker
   before a midfielder wanders over and takes him, which is what stops
   two players marking one man and leaving another free.
   --------------------------------------------------------------------- */
const MARKS = { frame:-1, team:-1, map:new Map() };
function markAssignment(p){
  if(MARKS.frame===S.frameId && MARKS.team===p.team) return MARKS.map.get(p) || null;
  MARKS.frame = S.frameId; MARKS.team = p.team; MARKS.map.clear();

  const dir = S.dir[p.team];
  const mine = teamOf(p.team).filter(q=>!q.isGK)
    .sort((a,b)=> (a.pos.x*dir) - (b.pos.x*dir));      // deepest first
  const theirs = teamOf(1-p.team).filter(q=>!q.isGK)
    .sort((a,b)=> (a.pos.x*dir) - (b.pos.x*dir));
  const taken = new Set();

  for(const d of mine){
    /* a forward is not a marker; he presses, which the chaser branch
       already covers */
    if(d.isFwd && !d.isDef) continue;
    let best=null, bd=1e9;
    const reach = d.isDef ? 13 : 10;
    for(const o of theirs){
      if(taken.has(o)) continue;
      const dist = Math.hypot(o.pos.x-d.pos.x, o.pos.y-d.pos.y);
      if(dist < bd && dist < reach){ bd=dist; best=o; }
    }
    if(best){ taken.add(best); MARKS.map.set(d, best); }
  }
  return MARKS.map.get(p) || null;
}

function aiPlayer(p, dt){
  const dir = S.dir[p.team];
  let want = new THREE.Vector2(0,0), sprint = false;

  if(p.isGK){
    const line = dir*-(HALF_L-1.4);
    const inBox = Math.abs(ball.pos.x-line)<CFG.PEN_D && Math.abs(ball.pos.z)<CFG.PEN_W/2;
    if(ball.owner===p){
      p.gkHold = (p.gkHold||0)-dt;
      if(p.gkHold<=0) clearance(p);
      animate(p,dt); return;
    }
    // only leave the line for a genuinely loose ball, or a striker right on top of him
    const dBall = Math.hypot(ball.pos.x-line, ball.pos.z);
    const loose = !ball.owner;
    const threat = ball.owner && ball.owner.team!==p.team;
    /* A shot is on its way. Work out where it will cross his line and
       get across — but only as far as his reflexes and agility let him,
       which is what separates a keeper who reaches the top corner from
       one who watches it go in. Before this the keeper held a central
       position and anything placed wide was an automatic goal. */
    if(S.liveShot && S.liveShot.team!==p.team && Math.abs(ball.vel.x)>4){
      const t = (line - ball.pos.x)/ball.vel.x;
      if(t>0 && t<1.8){
        const zc = ball.pos.z + ball.vel.z*t;
        const yc = ball.pos.y + ball.vel.y*t - 4.905*t*t;
        if(Math.abs(zc) < CFG.GOAL_W/2+2.0 && yc < CFG.GOAL_H+0.8){
          const cover = (0.30 + Amix(p,{reflexes:2.0, agility:1.2, positioning:1.0})*0.92)
                      * (1 - scriptUrgency(1-p.team)*0.90);
          const aim = THREE.MathUtils.clamp(p.pos.y + (zc-p.pos.y)*cover,
                                            -CFG.GOAL_W/2-1.2, CFG.GOAL_W/2+1.2);
          want.set(line-p.pos.x, aim-p.pos.y);
          movePlayer(p, want.clampLength(0,1), true, dt);
          animate(p,dt); return;
        }
      }
    }
    const brave = 4.5 + A01(p,'oneOnOnes')*3.5;
    if(inBox && ((loose && dBall<brave) || (threat && dBall<2.4+A01(p,'oneOnOnes')*1.8))){
      want.set(ball.pos.x-p.pos.x, ball.pos.z-p.pos.y); sprint=true;
    } else {
      const z = THREE.MathUtils.clamp(ball.pos.z*.34, -3.4, 3.4);
      want.set(line-p.pos.x, z-p.pos.y);        // hold the line, track across it
      sprint = want.length()>3;
    }
    movePlayer(p, want.clampLength(0,1), sprint, dt);
    animate(p,dt); return;
  }

  p.think -= dt;
  p.react = (p.react||0) - dt;
  if(p.react<=0 || !p.seen){
    // sharp decision-makers see it developing; slow ones react late
    p.react = .22 - A01(p,'decisions')*0.13;
    p.seen = new THREE.Vector2(ball.pos.x+ball.vel.x*.22, ball.pos.z+ball.vel.z*.22);
  }

  if(ball.owner===p){
    const ment = MENT_MOD[TEAMS[p.team].mentality] || MENT_MOD.Balanced;
    if(p.think<=0){
      // he weighs it up as quickly as his decisions let him
      p.think = .26 - A01(p,'decisions')*0.11 + Math.random()*.10;
      let press=0, nearest=1e9, nearestMan=null;
      for(const o of teamOf(1-p.team)){
        const d = Math.hypot(o.pos.x-p.pos.x,o.pos.y-p.pos.y);
        if(d<3.4) press++;
        if(d<nearest){ nearest=d; nearestMan=o; }
      }
      const wide = Math.abs(p.pos.y) > HALF_W-15;
      const finalThird = p.pos.x*dir > HALF_L-32;
      const ownThird = p.pos.x*dir < -(HALF_L-35);
      const goalD = Math.hypot(dir*HALF_L-p.pos.x, p.pos.y);

      /* A skill move: only if he is good enough to try one, has a man to
         beat, and has the space in front to go into. */
      if(nearestMan && nearest<3.2 && nearest>1.1 && p.skill<=0 && p.cool<=0 &&
         goalD>9 && Math.random() < 0.026 + A01(p,'dribbling')*0.085){
        startSkill(p, nearestMan); animate(p,dt); return;
      }
      // a good crosser in a wide area puts it in the mixer
      if(wide && finalThird && Math.abs(p.pos.x*dir) > 12 && p.isWide &&
         Math.random() < 0.24 + A01(p,'crossing')*0.46){
        doCross(p); animate(p,dt); return;
      }
      // a defender under pressure with no passing ability just hoofs it
      if(ownThird && press>0 && p.isDef &&
         Math.random() < 0.62 - A01(p,'composure')*0.34 - A01(p,'passing')*0.16){
        clearance(p, true); animate(p,dt); return;
      }
      /* Shooting. Appetite comes off shooting and composure and the
         team's mentality; the range he will try from comes off his
         shooting too, so a 5-shooting full-back does not try one from
         thirty yards. */
      const urge = scriptUrgency(p.team), mine = isScriptScorer(p);
      const range = (15 + A01(p,'shooting')*20) * (1 + urge*(mine?0.7:0.25));
      if(goalD < range && nearest > (goalD<16 ? 1.0 : 1.5)*(1-urge*0.6)){
        /* HOW GOOD IS THE CHANCE? Distance bands alone decided this — a
           man eight yards out with the goal gaping was no keener than
           one on the corner of the box with two defenders in front, and
           for a National League striker inside fifteen metres it came to
           about 28%, so he passed seven times out of ten. If he has a
           sight of goal he should take it.

           Three things make a chance: how far, how square, and whether
           anybody is in the way. A clear one straight on from eight
           metres now reads near 1; a tight angle from twenty-five with
           bodies in front reads near 0, which is when passing IS the
           right answer. */
        const angleOff = Math.abs(p.pos.y) / Math.max(5, goalD);
        const mouth = { pos: new THREE.Vector2(dir*HALF_L,
                        THREE.MathUtils.clamp(p.pos.y*0.3, -3, 3)), team: p.team, isGK:false };
        const inTheWay = laneRisk(p, mouth);
        const quality = THREE.MathUtils.clamp(
          (1 - Math.min(1, goalD/30)) *
          (1 - Math.min(1, angleOff*1.15)) *
          (1 - Math.min(1, inTheWay/5.5)), 0, 1);
        const appetite = (0.22 + quality*0.85)
          * (0.55 + styleOf(p).shoots*0.80) * ment.shoot
          * (urge>0 ? Math.max(0.85, shotBias(p.team)) : shotBias(p.team))
          * (1 + urge*(mine ? 4.5 : 0.6));
        if(Math.random() < appetite){
          /* WHERE HE AIMS. Every shot was struck at (Math.random()-.5)*.6
             of the goal's width — a narrow band either side of the
             keeper, which is why nothing ever went into a corner. A good
             finisher picks his spot: composure and shooting decide how
             far off the middle he dares go, so an elite one is genuinely
             hunting the corner and a poor one hits it where he is
             facing. */
          const pick = Amix(p,{shooting:1.3, composure:1.0, decisions:0.5});
          const corner = (Math.random() < 0.30 + pick*0.45)
            ? (Math.random()<0.5 ? -1 : 1) * (0.55 + pick*0.40)
            : (Math.random()-0.5)*0.55;
          doShot(p, new THREE.Vector2(0, corner), .55+Math.random()*.4);
          animate(p,dt); return;
        }
      }
      /* Whether to release it. A good passer under pressure finds a man;
         a poor one holds it too long and gets closed down — which is the
         behaviour the manager game asked for. */
      /* AND HE HAS TO WANT TO PASS IT. The base was 0.30, which for a
         National League side came out around 0.44 — and because a touch
         that is neither a carry nor a pass falls through to "run at the
         goal", which is carrying by another name, the ball ended up at
         his feet on roughly seven touches in ten. Footballers pass far
         more than they run with it, at every level.

         BUT NOT ALL SIDES EQUALLY, and 0.68 was too flat: it put a
         Championship side and an elite one both at effectively every
         touch, so a bad team passed like a good one. The base is 0.42
         with a wide skill term, which puts a National League side near
         0.58 and an elite one near 0.94 -- a gap you can see. */
      const releases = (0.42 + A01(p,'passing')*0.36 + A01(p,'vision')*0.12
                     + A01(p,'decisions')*0.10) * possBias(p.team);

      /* HE NEVER PASSED, HE JUST RAN WITH IT UNTIL SOMEBODY TOOK IT OFF HIM.
         The old line was

             if(nearest>4.2 && goalD>12 && Math.random() > A01(p,'vision')*0.35)

         and a National League player has a vision around 0.25, so the bar
         was 0.09 and `Math.random() > 0.09` is true NINE TIMES IN TEN. With
         nobody inside 4.2 metres he carried it, always, and only ever looked
         for a pass once an opponent was already on him — by which point the
         pass is a panic and the lane is shut. Worse, it ran the wrong way
         round: the lower a side's vision the more it dribbled, when a poor
         side is precisely the one that gets rid of it early.

         Carrying is now what it is on a pitch — real space, and a man who
         can actually beat somebody. A poor dribbler in space carries about
         three times in ten; a good one about half the time. */
      const carry = 0.15 + styleOf(p).runs*0.48;
      if(nearest>6.0 && goalD>12 && Math.random() < carry){
        /* genuine space, and the feet to use it: carry */
      } else if(Math.random() < releases*(press>0 ? 1 : 0.88)){
        /* AND HE CAN PASS WITHOUT BEING HARRIED INTO IT. The pass used to
           be gated behind `press>0`, so a man in space neither carried nor
           passed — he fell through and ran at the goal regardless, which
           looked identical to carrying and lost the ball just as often.
           Unpressured he now releases at a bit over half his normal rate,
           which is a side that moves the ball rather than one that only
           reacts. */
        const through = 0.10 + styleOf(p).risk*0.44;
        if(Math.random() < through*ment.direct*0.7) doThrough(p,new THREE.Vector2(dir,0),.6);
        else doPass(p,ZERO,.5);
        animate(p,dt); return;
      }
    }
    /* AND A POOR SIDE DOES NOT DRIBBLE OUT OF TROUBLE — IT HITS IT LONG.
       This is the single thing that most separates a National League
       match from a Premier League one, and the engine had no version of
       it: every side that failed to find a pass ran at the goal with the
       ball, which is a thing good players do and bad ones cannot. Under
       real pressure a man with poor composure and a poor first touch now
       clears his lines and hopes, about two times in five; an elite one
       does it about one time in seven and otherwise keeps it. */
    let onHim = 0;
    for(const o of teamOf(1-p.team)){
      if(Math.hypot(o.pos.x-p.pos.x, o.pos.y-p.pos.y) < 3.4) onHim++;
    }
    if(onHim > 0 && !p.isGK && ball.owner === p &&
       Math.random() < 0.55 - Amix(p,{composure:1.2, firstTouch:1.0, passing:0.8})*0.45){
      clearance(p, true);
      animate(p,dt); return;
    }
    const goal = new THREE.Vector2(dir*(HALF_L-4), THREE.MathUtils.clamp(p.pos.y*.4,-14,14));
    want = goal.sub(p.pos).normalize();
    let close=null, cd=1e9;
    for(const o of teamOf(1-p.team)){
      const d=Math.hypot(o.pos.x-p.pos.x,o.pos.y-p.pos.y);
      if(d<cd){ cd=d; close=o; }
    }
    if(close && cd<4)
      want.addScaledVector(new THREE.Vector2(p.pos.x-close.pos.x,p.pos.y-close.pos.y).normalize(),.9).normalize();
    if(p.skill>0) want = skillSteer(p, want);
    movePlayer(p, want, cd>2.2, dt); animate(p,dt); return;
  }

  /* THE MAN IT WAS PLAYED TO GOES AND GETS IT, whether or not he happens
     to be the closest. Without this the intended receiver kept walking to
     his formation slot while the ball ran past him. */
  if(!ball.owner && S.passTo===p && p.team===S.possTeam){
    const meet = new THREE.Vector2(
      ball.pos.x + ball.vel.x*0.22 - p.pos.x,
      ball.pos.z + ball.vel.z*0.22 - p.pos.y);
    movePlayer(p, meet.clampLength(0,1), meet.length()>2.5, dt);
    animate(p,dt); return;
  }

  if(!ball.owner && p===nearestToBall(p.team)){
    want.set(p.seen.x-p.pos.x, p.seen.y-p.pos.y);
    if(dist2D(p)<2.4 && p.lunge<=0 && p.team!==S.possTeam &&
       Math.random() < 0.015 + A01(p,'aggression')*0.055) p.lunge=.35;
    movePlayer(p, want.clampLength(0,1), true, dt); animate(p,dt); return;
  }

  if(p.team===S.possTeam){
    const t = slotWorld(p);
    // good movement off the ball buys a forward a few extra yards
    if(p.isFwd && ball.pos.x*dir>0)
      t.x = THREE.MathUtils.clamp(t.x+dir*(3+A01(p,'offTheBall')*7),-HALF_L+3,HALF_L-3);

    /* WITH THE BALL, THE SAME COMPLAINT APPLIED IN REVERSE: ten men
       walking to ten fixed slots. What separates them is what their job
       asks of them, so it is asked here.

       A wide player holds the touchline until the ball is on his side,
       and how disciplined he is about that is his own positioning. A
       full-back overlaps when the ball is ahead of him and his work rate
       says he can get back. A deep midfielder does the opposite and
       stays behind it. */
    const see = p.seen || new THREE.Vector2(ball.pos.x, ball.pos.z);
    if(p.isWide){
      const side = Math.sign(p.home.y || 1);
      const ballSide = Math.sign(see.y || 0) === side;
      const hold = 0.35 + A01(p,'positioning')*0.45;
      const width = (HALF_W-7) * (ballSide ? 1 : hold);
      t.y = side*Math.max(Math.abs(t.y), width);
      if(p.isDef && see.x*dir > 6){
        /* the overlap, if he is the sort who makes it */
        t.x += dir*(A01(p,'workRate')*6 + A01(p,'offTheBall')*4);
      }
    } else if(!p.isFwd && !p.isDef){
      /* The midfielder who screens rather than joins in — but a much
         smaller step than it was. At sixteen metres this pulled the one
         man the carrier could reach out of range, and it is the ball
         carrier who decides where support has to be, not the diagram. */
      const screen = Amix(p,{positioning:1.2, decisions:1.0, marking:0.7});
      t.x -= dir*(screen-0.5)*7;
    }

    /* =================================================================
       SOMEBODY HAS TO SHOW FOR IT
       -----------------------------------------------------------------
       "every time my team gets the ball, every pass, teammates run away"
       — and they did. In possession every player walked to a slot in the
       formation and NOTHING in that sum referred to where the ball
       actually was. The man on it had no short option, so he held it,
       got closed down and lost it. In the National League, where passing
       and vision are at their lowest, that is a turnover nearly every
       time.

       That was made worse by the width and overlap rules just above,
       which are mine: they push a wide man to the touchline and a
       full-back upfield, both away from the ball.

       So the three nearest team-mates now come and offer an angle. One
       ahead and inside for the forward pass, one square for the switch,
       one behind as the out-ball — the shape any side makes around
       whoever has it. How readily he leaves his position to do it is his
       own off-the-ball, decisions and work rate, so a thoughtful player
       shows for it and a lazy one stands and watches.
       ================================================================= */
    const carrier = (ball.owner && ball.owner.team===p.team)
                  ? ball.owner : nearestToBall(p.team);
    if(carrier && carrier!==p && !p.isGK){
      const mates = teamOf(p.team).filter(q=>!q.isGK && q!==carrier);
      mates.sort((a,b)=>
        (Math.hypot(a.pos.x-carrier.pos.x, a.pos.y-carrier.pos.y)) -
        (Math.hypot(b.pos.x-carrier.pos.x, b.pos.y-carrier.pos.y)));
      const rank = mates.indexOf(p);
      if(rank>=0 && rank<3){
        const OFF = [[8.5, 6.0], [1.5, -9.5], [-7.5, 3.5]][rank];
        const sx = THREE.MathUtils.clamp(carrier.pos.x + dir*OFF[0], -HALF_L+4, HALF_L-4);
        const sz = THREE.MathUtils.clamp(carrier.pos.y + OFF[1], -HALF_W+3, HALF_W-3);
        const show = THREE.MathUtils.clamp(
          0.34 + Amix(p,{offTheBall:1.3, decisions:1.0, workRate:0.8})*0.44, 0.28, 0.82);
        t.x = t.x*(1-show) + sx*show;
        t.y = t.y*(1-show) + sz*show;
      }
    }
    /* AND THE MAN THE PLAN SAYS SCORES GETS INTO THE BOX FOR IT — but
       not to the same square yard every time. This pushed him forward
       and squeezed him to the middle, so however varied the finish, the
       APPROACH was identical: every goal in the game arrived through the
       centre of the box from the same distance. Finishing variety cannot
       rescue a build-up that is always the same shape.

       The goal now has a shape of its own, drawn from the pending goal
       itself so it holds for the whole of that build-up and changes for
       the next one: straight through the middle, in off the left, in off
       the right, a late one from deep, or arriving at the back post. */
    if(isScriptScorer(p)){
      const u = 0.4 + scriptUrgency(p.team)*0.6;
      const g = SCRIPT.pending;
      const seed = g ? (((g.min|0)*31) + String(g.pid||g.scorer||'').length*7 + ((g.team|0)*13)) : 0;
      const shape = ((seed % 5) + 5) % 5;
      const WIDE = [0, -0.60, 0.60, 0.22, -0.86][shape];
      const DEEP = [1.00, 0.94, 0.94, 0.70, 0.88][shape];
      t.x = THREE.MathUtils.clamp(t.x + dir*14*u*DEEP, -HALF_L+3, HALF_L-3);
      t.y = t.y*(1-u*0.55) + WIDE*u*(HALF_W-11);
    }
    want.set(t.x-p.pos.x,t.y-p.pos.y);
    sprint = want.length()>12;
  } else {
    const chaser = nearestToBall(p.team);
    if(p===chaser){
      want.set(p.seen.x-p.pos.x,p.seen.y-p.pos.y); sprint=true;
      if(dist2D(p)<2.2 && p.lunge<=0 &&
         Math.random() < (0.018 + Amix(p,{tackling:1,aggression:1})*0.075)
                       * (1 + scriptUrgency(p.team)*1.8)) p.lunge=.35;
    } else {
      /* EVERY DEFENDER USED TO RUN THE SAME WAY AT THE SAME MOMENT, and
         the arithmetic said so plainly:

             want.set(t.x*.55 + ball.pos.x*.45 - push - p.pos.x,
                      t.y*.6  + ball.pos.z*.4  - p.pos.y);

         Identical weights for all ten, all reading `ball.pos` on the
         same frame. Move the ball two metres and every target moved by
         the same 0.45 and 0.4 of it, so the block slid across the grass
         as one piece. Nobody was thinking; one man was thinking and the
         other nine were copying him.

         Two things change here.

         FIRST, he reacts to what HE has seen. `p.seen` already exists —
         a delayed, velocity-extrapolated read of the ball refreshed on
         the player's own `think` timer, which is itself set from his
         decisions. It was computed for all twenty-two and then used by
         exactly two of them. Reading it here means a slow centre-half is
         still turning while a sharp one has already moved, which is most
         of what makes a back four look like four men.

         SECOND, how far he leaves his post is his own number. A
         disciplined reader of the game holds shape; a busy, aggressive
         one goes to the ball. That is the difference between a holding
         midfielder and a terrier, and it was a shared constant. */
      const ment = MENT_MOD[TEAMS[p.team].mentality] || MENT_MOD.Balanced;
      const see = p.seen || new THREE.Vector2(ball.pos.x, ball.pos.z);
      const t = slotWorld(p);

      const disc  = styleOf(p).holds;
      const eager = styleOf(p).presses;
      let pull = THREE.MathUtils.clamp(0.15 + eager*0.44 - disc*0.24, 0.06, 0.64);
      /* the last line holds its shape hardest — a centre-half who chases
         the ball is how a defence is pulled apart */
      if(p.isDef && !p.isWide) pull *= 0.62;

      const push = dir*(3 - ment.line*22);            // an attacking side defends higher
      let tx = t.x*(1-pull) + see.x*pull - push;
      let tz = t.y*(1-pull*0.9) + see.y*(pull*0.9);

      /* AND HE MARKS A MAN, not a patch of grass. Whether he stays with
         him is his marking attribute: a good one is on a shoulder, a
         poor one is loosely in the area and can be lost. */
      const man = markAssignment(p);
      if(man){
        const tight = THREE.MathUtils.clamp(0.22 + A01(p,'marking')*0.52, 0.18, 0.80);
        tx = tx*(1-tight) + (man.pos.x + dir*1.05)*tight;
        tz = tz*(1-tight) + man.pos.y*tight;
      }

      want.set(tx-p.pos.x, tz-p.pos.y);
      sprint = want.length() > 12 - A01(p,'workRate')*5;
    }
  }
  movePlayer(p, want.clampLength(0,1), sprint, dt);
  animate(p,dt);
}

/* =====================================================================
   DIRECTED MATCHES — the manager game owns the result

   The Results Business already knows what a match should look like. It
   has a calibrated model (target goals a game, xG per shot, on-target
   rates, regression bands for draw and goalless rates) and guardrails
   that make a 7-0 possible but rare. Left to itself this view has no
   such knowledge: run two mismatched sides and it will hand you 7-0
   every week, because nothing here is holding it to a distribution.

   So it does not get to decide. The manager passes a PLAN — when the
   goals go in, who scores them, and roughly how many shots and how much
   of the ball each side should have — and this engine performs it:

     * a goal only counts if the plan says one is due; anything else
       that crosses the line is turned into a save or the woodwork,
       which is why the guarantee is enforced at the goal line itself
       and not merely nudged in the shooting code
     * when a goal falls due the named scorer is pushed forward, his
       appetite goes up and the keeper's hands go down, so the goal
       arrives out of real build-up play rather than being teleported in
     * shot volume and possession are steered toward the plan's numbers
       across the half rather than clamped, so the flow still looks like
       football

   The result is a match you can watch that agrees, to the goal and the
   scorer, with the one your save file recorded.
   ===================================================================== */
const SCRIPT = {
  active:false, events:[], stats:null, pending:null, blocked:0, forced:0
};
function clearScript(){
  SCRIPT.active=false; SCRIPT.events=[]; SCRIPT.stats=null;
  SCRIPT.pending=null; SCRIPT.blocked=0; SCRIPT.forced=0; SCRIPT.penWait=0;
  SCRIPT.penTries=0;
}
/* Minutes elapsed on the 90-minute clock the HUD shows. */
function scriptMinute(){
  const total = S.halfLen*2 || 1;
  return ((S.half-1)*S.halfLen + S.clock)/total*90;
}
function loadScript(plan){
  clearScript();
  if(!plan) return;
  const evs = (plan.events||plan.goals||[])
    .filter(e => e && (e.type==null || e.type==='goal'))
    .map((e,i) => ({
      minute: Math.max(0, Math.min(95, +e.minute || +e.min || 0)),
      team:   (e.team===1 || e.team==='away') ? 1 : 0,
      scorer: e.scorer || e.player || null,
      pid:    e.pid != null ? String(e.pid) : (e.playerId != null ? String(e.playerId) : null),
      finish: e.finish || e.kind || null,
      own:    !!e.ownGoal,
      seq:i, fired:false
    }))
    .sort((a,b)=>a.minute-b.minute);
  SCRIPT.events = evs;
  SCRIPT.stats  = plan.stats || null;
  SCRIPT.active = true;
}
/* The next goal this side is owed, if any. */
function nextGoal(team){
  for(const e of SCRIPT.events) if(!e.fired && e.team===team) return e;
  return null;
}
/* Is a goal for `team` allowed to stand right now? A little early is
   fine — football does not keep to the minute — but not a whole goal
   out of sequence. */
function scriptAllowsGoal(team){
  if(!SCRIPT.active) return true;
  const e = nextGoal(team);
  if(!e) return false;
  // any goal still owed before the final whistle may land from 90s early
  return scriptMinute() >= e.minute - 1.5;
}
function markGoalScored(team){
  if(!SCRIPT.active) return null;
  const e = nextGoal(team);
  if(e){ e.fired = true; if(SCRIPT.pending===e) SCRIPT.pending=null; }
  SCRIPT.penWait = 0; SCRIPT.penAt = 0; SCRIPT.penTries = 0;
  return e;
}
/* Each tick: work out whether a goal is due, and if it is overdue push
   the side that is owed it. */
function scriptTick(){
  if(!SCRIPT.active){ SCRIPT.pending=null; return; }
  const now = scriptMinute();
  let due = null;
  for(const e of SCRIPT.events){
    if(e.fired) continue;
    if(now >= e.minute - 0.75){ due = e; break; }
  }
  SCRIPT.pending = due;

  /* Open play will not always oblige. Once a goal is badly overdue the
     owed side gets a spot kick — a legitimate way to score that looks
     like football, rather than a goal appearing out of nowhere. The
     alternative is a scoreline that disagrees with the save file, which
     is the one outcome this mode exists to prevent. */
  if(!due || S.phase!=='play') return;
  const late = now - due.minute;
  const wait = SCRIPT.penWait || 0;
  SCRIPT.penWait = wait + (1/60);
  if(!SCRIPT.penAt) SCRIPT.penAt = 5 + Math.random()*5;   // jittered, so the fallback
  const limit = S.stoppage > 0 ? 1.5 : SCRIPT.penAt;      // never lands on the same minute
  /* EACH ATTEMPT COMES SOONER THAN THE LAST.
     This used to wait six seconds, award a spot kick, and then reset
     BOTH counters -- so a saved penalty put the whole thing back to the
     start, and against a keeper under siege the owed goal could run out
     of stoppage time. Measured: a save recording Hull 1-4 finished on
     screen as 0-4, because Hull's 82nd minute never arrived while they
     managed two shots to United's thirty-five.
     Now only the wait resets, the jittered first delay is kept, and the
     wait shortens with every failed attempt. A missed penalty is a
     setback, not a fresh start. */
  const need = Math.max(1.2, 6/(1+(SCRIPT.penTries||0)));
  if(late > limit && SCRIPT.penWait > need){
    SCRIPT.penWait = 0; SCRIPT.penTries = (SCRIPT.penTries||0)+1; SCRIPT.forced++;
    const named = due.pid || due.scorer
      ? teamOf(due.team).find(q => (due.pid && String(q.pid)===due.pid) ||
          (due.scorer && q.name.toUpperCase()===String(due.scorer).toUpperCase()))
      : null;
    awardPenalty(due.team, named, 'a spot kick for '+TEAMS[due.team].name);
  }
}
/* How hard to push the side that is owed a goal: 0 at the moment it
   falls due, rising the longer it goes unpaid. */
function scriptUrgency(team){
  if(!SCRIPT.active || !SCRIPT.pending || SCRIPT.pending.team!==team) return 0;
  if(S.stoppage > 0) return 1;                       // added time: get it done
  return THREE.MathUtils.clamp((scriptMinute() - SCRIPT.pending.minute + 1.5)/3, 0, 1);
}
/* Is this the man the plan says scores it? */
function isScriptScorer(p){
  const e = SCRIPT.pending;
  if(!e || e.team!==p.team) return false;
  if(e.pid)    return String(p.pid) === e.pid;
  if(e.scorer) return p.name.toUpperCase() === String(e.scorer).toUpperCase();
  return false;
}
/* Shot volume steering. Returns a multiplier that pulls the running
   shot count toward the plan's total as the match goes on. */
function shotBias(team){
  if(!SCRIPT.active || !SCRIPT.stats || !SCRIPT.stats.shots) return 1;
  const target = SCRIPT.stats.shots[team];
  if(!target) return 1;
  const frac = THREE.MathUtils.clamp(scriptMinute()/90, 0.05, 1);
  const expected = target*frac;
  const have = S.stats.shots[team];
  return THREE.MathUtils.clamp(1 + (expected-have)*0.22, 0.25, 2.6);
}
/* Possession steering, same idea, applied to how readily a side gives
   the ball away. */
function possBias(team){
  if(!SCRIPT.active || !SCRIPT.stats || !SCRIPT.stats.possession) return 1;
  const t = SCRIPT.stats.possession[team];
  if(!t) return 1;
  const tot = S.stats.poss[0]+S.stats.poss[1] || 1;
  const have = S.stats.poss[team]/tot*100;
  return THREE.MathUtils.clamp(1 + (t-have)*0.030, 0.62, 1.45);
}

/* =====================================================================
   A CORNER IS A SET PIECE, NOT A THROW-IN NEAR THE FLAG
   ---------------------------------------------------------------------
   "corners are all over the place. They need to reset the players'
    positions and actually go into the box. You've got to cross it for
    headers."

   A corner used to do exactly what a throw-in does: give the ball to the
   nearest man and let open play resume. Nobody went into the box, the
   ball was rarely crossed, and twenty-two players stood wherever the
   move had left them.

   Both boxes are now set the way they are on a Saturday. The attacking
   side sends its tallest and best headers of a ball to the near post,
   the spot and the far post, keeps one short and one on the edge for the
   clearance; the defending side puts a man goal-side of each of them, one
   on each post, and leaves the keeper his six yards.
   ===================================================================== */
function setCornerBox(team, side){
  const dir = S.dir[team];
  const gx = dir*HALF_L;
  const att = teamOf(team).filter(p=>!p.isGK);
  const def = teamOf(1-team).filter(p=>!p.isGK);

  /* the big men go in: heading and height, which is how a side actually
     picks who attacks a corner */
  att.sort((a,b)=> (A01(b,'heading')*1.4 + b.H*0.6) - (A01(a,'heading')*1.4 + a.H*0.6));

  const spots = [
    [gx - dir*5.5,  side*2.6],    // near post
    [gx - dir*10.5, side*0.4],    // the spot
    [gx - dir*6.0, -side*3.6],    // far post
    [gx - dir*13.5, side*4.5],    // the pull-back
    [gx - dir*8.0, -side*7.0],    // wide of the far post
    [gx - dir*19.0, side*1.0],    // the edge, for the second ball
  ];
  const taker = att.find(p=>p.isWide) || att[att.length-1];

  let k = 0;
  for(const p of att){
    if(p === taker) continue;
    const sp = spots[Math.min(k, spots.length-1)];
    p.pos.set(sp[0] + (Math.random()-0.5)*1.2, sp[1] + (Math.random()-0.5)*1.2);
    p.vel.set(0,0);
    p.face = Math.atan2(ball.pos.z - p.pos.y, ball.pos.x - p.pos.x);
    k += 1;
  }

  /* one defender goal-side of each attacker in the box, then the posts */
  const inBox = att.filter(p=>p!==taker).slice(0, 4);
  let d = 0;
  for(const a of inBox){
    const m = def[d]; d += 1;
    if(!m) break;
    m.pos.set(a.pos.x + dir*1.0, a.pos.y + (Math.random()-0.5)*0.8);
    m.vel.set(0,0);
    m.face = Math.atan2(ball.pos.z - m.pos.y, ball.pos.x - m.pos.x);
  }
  const posts = [[gx - dir*0.4, CFG.GOAL_W/2 - 0.4], [gx - dir*0.4, -CFG.GOAL_W/2 + 0.4]];
  for(const post of posts){
    const m = def[d]; d += 1;
    if(!m) break;
    m.pos.set(post[0], post[1]); m.vel.set(0,0);
  }
  for(; d < def.length; d += 1){
    def[d].pos.set(gx - dir*(17 + Math.random()*4), (Math.random()-0.5)*16);
    def[d].vel.set(0,0);
  }
  const gk = keeperOf(1-team);
  if(gk){ gk.pos.set(gx - dir*3.2, 0); gk.vel.set(0,0); }
  return taker;
}

/* ================== rules ================== */
function setRestart(type, team, spot, label){
  S.phase='restart';
  ball.owner=null; ball.vel.set(0,0,0); ball.spin=0;
  ball.pos.set(THREE.MathUtils.clamp(spot.x,-HALF_L+.4,HALF_L-.4), CFG.BALL_R,
               THREE.MathUtils.clamp(spot.y,-HALF_W+.4,HALF_W-.4));
  S.pendingOffside=null; S.liveShot=null;
  let taker;
  if(type==='goalkick') taker = keeperOf(team);
  else {
    let bd=1e9;
    for(const p of teamOf(team)){
      if(p.isGK) continue;
      const d=Math.hypot(p.pos.x-ball.pos.x,p.pos.y-ball.pos.z);
      if(d<bd){ bd=d; taker=p; }
    }
  }
  if(type==='corner'){
    const arranged = setCornerBox(team, Math.sign(spot.y) || 1);
    if(arranged) taker = arranged;
  }
  S.restart={type,team,taker,t:type==='corner' ? 2.2 : 1.5};
  S.possTeam=team;
  if(label && type!=='free') event(label, TEAMS[team].name);
}
function kickoff(team){
  ball.owner=null; ball.vel.set(0,0,0); ball.spin=0; ball.pos.set(0,CFG.BALL_R,0);
  S.possTeam=team; S.pendingOffside=null;
  for(const p of players){
    const dir=S.dir[p.team];
    let x=p.home.x*(HALF_L*.92)*dir, z=p.home.y*(HALF_W*.95);
    if(p.isGK) x=dir*-(HALF_L-1.6);
    x = dir>0 ? Math.min(x,-1) : Math.max(x,1);
    p.pos.set(x,z); p.vel.set(0,0); p.face = dir>0?0:Math.PI; p.celeb=0;
  }
  const st = teamOf(team).find(p=>p.slot==='ST') || teamOf(team).find(p=>p.isFwd)
           || teamOf(team).find(p=>!p.isGK);
  st.pos.set(-S.dir[team]*.8,.4);
  S.restart={type:'kickoff',team,taker:st,t:1.4};
  S.phase='restart';
}
function checkRules(){
  if(S.phase!=='play') return;
  const b = ball.pos;
  for(const s of [-1,1]){
    /* A SHOT THAT IS NOT GOING TO BE ALLOWED IS STOPPED BEFORE THE LINE,
       NOT RETRIEVED FROM THE NET.
       This whole block used to run only once the ball had CROSSED, and a
       blocked goal then did `ball.pos.x = s*(HALF_L-BALL_R*1.5)` — so the
       ball went in and was yanked back out to the paint, stopping dead a
       few millimetres short with the same reaction every time. It read
       exactly like an invisible wall across the goalmouth, because that
       is what it was.

       A save is now taken at the keeper's plane, a metre and a half in
       front of the line, while the ball is still travelling towards it.
       A goal the plan DOES allow is not touched here at all: it crosses,
       and it hits the net. */
    const crossed = s*b.x > HALF_L+CFG.BALL_R*.5;
    const atKeeper = s*b.x > HALF_L-1.55 && s*ball.vel.x > 1;
    if((crossed || atKeeper) && Math.abs(b.z)<CFG.GOAL_W/2 && b.y<CFG.GOAL_H){
      const scorer = S.dir[0]===s ? 0 : 1;
      /* allowed, and not over the line yet — let it go in properly */
      if(!crossed && scriptAllowsGoal(scorer)) continue;

      /* THE GUARANTEE. If the plan does not owe this side a goal, this
         one never happened: it comes back off the keeper or the frame.
         Enforcing it here rather than in the shooting code is the point
         — a deflection, a scramble or an own goal cannot slip past a
         rule that sits on the goal line itself. */
      if(!scriptAllowsGoal(scorer)){
        SCRIPT.blocked++;
        const gk = keeperOf(1-scorer);
        const away = -s;
        if(Math.abs(b.z) > CFG.GOAL_W/2 - 1.1 || b.y > CFG.GOAL_H-0.5){
          ball.pos.x = s*(HALF_L-CFG.BALL_R*1.2);
          ball.vel.set(away*7+Math.random()*3, 2.2, ball.vel.z*0.4 + (Math.random()-.5)*5);
          event('WOODWORK', 'off the frame');
        } else {
          ball.pos.x = s*(HALF_L-1.45);
          if(gk){
            /* THE SAVE USED TO HAPPEN AT THE GOAL LINE, NOT AT HIS HANDS.
               The dive animation fired and the ball was pushed back off
               the line, but the keeper was never moved — so he threw
               himself sideways on the spot while the ball was repelled by
               the post four metres away. It read as the ball bouncing off
               nothing, which is exactly what it was.

               The engine has already decided this one is saved, so the
               keeper is the one who saves it: he gets across to where the
               ball is going, as far as his reflexes let him, and the ball
               comes off him rather than off the paint. What his reflexes
               cannot reach, he only gets fingertips to, and the rebound
               runs further away from him. */
            const gdir = S.dir[gk.team];
            const line = gdir*-(HALF_L-1.4);
            const aimZ = THREE.MathUtils.clamp(b.z, -CFG.GOAL_W/2-0.3, CFG.GOAL_W/2+0.3);
            const gap = aimZ - gk.pos.y;
            const span = 1.6 + Amix(gk,{reflexes:1.6, agility:1.2, handling:0.8})*4.4;
            const got = Math.sign(gap) * Math.min(Math.abs(gap), span);
            gk.pos.set(line, gk.pos.y + got);
            gk.face = gdir > 0 ? 0 : Math.PI;

            const stretched = Math.abs(gap) - Math.abs(got);   // what he could not cover
            ball.pos.z = gk.pos.y + Math.sign(gap || 1) * (0.45 + Math.min(stretched, 1.2));

            /* AND NOW HE DOES SOMETHING WITH IT, which is the part that
               was missing. The ball was simply given a velocity away
               from goal — every save a parry, straight back out, and it
               would sit up in the six-yard box for a striker to walk in.
               A keeper catches most of what he reaches, and what he
               cannot hold he pushes AWAY from the middle, not back into
               it.

               Three outcomes, decided by how comfortable the save was:
               how hard it was struck, how far he had to stretch, and how
               good his hands are.

                 caught   he holds it. The ball is his, play stops, and
                          he distributes it like any other keeper ball
                 parried  round the post or wide of it, never straight
                          back down the middle
                 spilled  the one a striker feeds on -- rare, and rarer
                          the better his handling */
            const power = Math.hypot(ball.vel.x, ball.vel.z);
            const hands = Amix(gk,{handling:1.6, composure:0.9, reflexes:0.6});
            const comfort = THREE.MathUtils.clamp(
              hands - stretched*0.28 - Math.max(0, power-18)*0.026, 0, 1);
            const roll = Math.random();

            if(roll < 0.30 + comfort*0.55){
              /* CAUGHT. He has it in his hands and the move is over. */
              ball.pos.set(gk.pos.x + gdir*0.35, CFG.BALL_R + 0.85, gk.pos.y);
              ball.vel.set(0,0,0); ball.spin = 0;
              ball.owner = gk; gk.gkHold = 1.1 + Math.random()*0.7;
              S.possTeam = gk.team; S.passTo = null;
              event('SAVE', gk.name + ' gathers it');
            } else if(roll < 0.80 + comfort*0.17){
              /* PARRIED, and away from the goal rather than into it. */
              const side = Math.sign(gap || (Math.random()-0.5));
              ball.vel.set(away*(6 + stretched*2.0), 2.2 + Math.random()*0.6,
                           side*(9 + stretched*4) + (Math.random()-.5)*2);
              event('SAVE', gk.name + ' pushes it wide');
            } else {
              /* SPILLED. What the follow-up exists for. */
              ball.vel.set(away*(4 + Math.random()*3), 1.8,
                           (Math.random()-.5)*7);
              event('SAVE', gk.name + ' cannot hold it');
            }

            gk.dive = .85; gk.diveDir = gap>=0 ? 1 : -1;
            gk.diveHigh = b.y > 1.15 ? 1 : 0;
            gk.cool = .4; S.lastTouch = gk;
            cutTo('save', 1.6);
          } else {
            /* no keeper on the pitch to credit it to — the ball still has
               to leave, or it crosses the line again on the next frame
               and blocks forever */
            ball.vel.set(away*8, 2.6, (Math.random()-.5)*11);
          }
        }
        ball.cool = .4; S.liveShot = null;
        return;
      }

      rippleNet(s, ball.pos.z, ball.pos.y);
      S.score[scorer]++;
      /* WHO SCORED, not who is winning. Everything after a goal used to
         be decided by `S.score[0]>S.score[1]`, which is a different
         question and gives a different answer whenever the scoring side
         is still behind: at 3-0 down, a team that pulls one back was
         judged the loser and so restarted the game it had just conceded
         nothing in, while the side that was three up celebrated it. */
      S.lastScorer = scorer;
      const planned = markGoalScored(scorer);
      /* The plan names the scorer, so the graphic credits him even if
         the last touch in the box was somebody else's knee. */
      let who = S.lastTouch && S.lastTouch.team===scorer ? S.lastTouch : null;
      if(planned && (planned.pid || planned.scorer)){
        const named = teamOf(scorer).find(q =>
          (planned.pid && String(q.pid)===planned.pid) ||
          (planned.scorer && q.name.toUpperCase()===String(planned.scorer).toUpperCase()));
        if(named) who = named;
      }
      /* Name the finish. The shot carried its technique and the distance
         it was struck from, so the graphic can say what it actually was
         rather than just "goal". */
      let how = '';
      if(S.liveShot && S.liveShot.team===scorer){
        S.stats.onTarget[scorer]++;
        const f = FINISH[S.liveShot.kind];
        if(f){
          how = f.label;
          if(S.liveShot.kind==='banger' || S.liveShot.d > 22)
            how = Math.round(S.liveShot.d) + 'M ' + f.label;
        }
      } else if(who) how = 'SCRAMBLE';
      if(planned && planned.finish){
        const pf = FINISH[planned.finish];
        how = pf ? pf.label : String(planned.finish).toUpperCase();
      }
      S.liveShot = null;
      updateBoard();
      lowerThird('GOAL', who?who.name:TEAMS[scorer].name,
        TEAMS[scorer].name + (how? '  ·  '+how : '') + '  ·  '+clockLabel());
      event('GOAL', (who?who.name+' — ':'')+S.score[0]+'-'+S.score[1]+(how?'  ('+how.toLowerCase()+')':''));
      if(who){ who.celeb=4; for(const m of teamOf(scorer)) m.celeb=Math.max(m.celeb,2.2); }
      S.phase='goal'; S.freeze=5.2; S.goalSide=s; S.scorer=who; S.shake=1;
      emit('goal', {team:scorer, scorer:who?who.name:null, pid:who?who.pid:null,
                    finish:how, score:S.score.slice(), minute:clockLabel()});
      cutTo('celebration', 5.0);
      return;
    }
  }
  if(Math.abs(b.z) > HALF_W+CFG.BALL_R){
    setRestart('throw', S.lastTouch?1-S.lastTouch.team:1-S.possTeam,
      new THREE.Vector2(b.x, Math.sign(b.z)*(HALF_W-.3)), 'THROW-IN');
    return;
  }
  if(Math.abs(b.x) > HALF_L+CFG.BALL_R){
    const side = Math.sign(b.x);
    const defTeam = S.dir[0]===side ? 1 : 0;
    const last = S.lastTouch ? S.lastTouch.team : S.possTeam;
    if(last===defTeam){
      S.stats.corners[1-defTeam]++;
      setRestart('corner', 1-defTeam,
        new THREE.Vector2(side*(HALF_L-.4), Math.sign(b.z||1)*(HALF_W-.4)), 'CORNER');
    } else {
      setRestart('goalkick', defTeam, new THREE.Vector2(side*(HALF_L-CFG.SIX_D-.5),0), 'GOAL KICK');
    }
  }
}
/* ---- penalties ----
   The game had no way to award one, which left the director with no
   legitimate way to settle a goal the plan insisted on but open play
   would not produce. A spot kick is that way, and it is worth having in
   its own right: everybody clears the area, the taker walks up, the
   keeper picks a side and goes early. */
function awardPenalty(team, taker, reason){
  const dir = S.dir[team];
  const spot = new THREE.Vector2(dir*(HALF_L-CFG.SPOT), 0);
  const t = taker || bestPenaltyTaker(team);
  S.phase='restart';
  ball.owner=null; ball.vel.set(0,0,0); ball.spin=0;
  ball.pos.set(spot.x, CFG.BALL_R, 0);
  S.pendingOffside=null; S.liveShot=null; S.possTeam=team;
  S.restart={type:'penalty', team, taker:t, t:2.6};
  lowerThird('PENALTY', t?t.name:TEAMS[team].name, TEAMS[team].name+'  ·  '+clockLabel());
  event('PENALTY', reason || (TEAMS[team].name+' — spot kick'));
  cutTo('goal', 3.4);
  emit('penalty', {team, taker:t?t.name:null, minute:clockLabel()});
}
function bestPenaltyTaker(team){
  let best=null, bs=-1e9;
  for(const p of teamOf(team)){
    if(p.isGK) continue;
    const sc = Amix(p,{shooting:2, composure:2, firstTouch:1})*100 + (isScriptScorer(p)?500:0);
    if(sc>bs){ bs=sc; best=p; }
  }
  return best;
}

function stepRestart(dt){
  const r = S.restart;
  if(!r){ S.phase='play'; return; }
  r.t -= dt;
  const pen = r.type==='penalty';
  const dir = S.dir[r.team];
  for(const p of players){
    if(p===r.taker){
      // the taker sets himself a couple of paces behind the ball
      const back = pen ? 2.6 : 0;
      const tx = ball.pos.x - dir*back, tz = ball.pos.z;
      const to = new THREE.Vector2(tx-p.pos.x, tz-p.pos.y);
      movePlayer(p, to.length()>0.5 ? to.normalize() : ZERO, false, dt);
      if(pen) p.face = Math.atan2(0-p.pos.y, dir*HALF_L-p.pos.x);
      animate(p,dt);
    } else if(pen && !p.isGK){
      // everyone else has to be outside the area and behind the ball
      const ring = new THREE.Vector2(
        ball.pos.x - dir*(CFG.PEN_D - CFG.SPOT + 4 + (p.idx%3)*2.5),
        ((p.idx%2)?1:-1)*(6 + (p.idx%5)*2.2));
      const to = ring.sub(p.pos);
      movePlayer(p, to.length()>0.6 ? to.normalize() : ZERO, false, dt);
      p.face = Math.atan2(ball.pos.z-p.pos.y, ball.pos.x-p.pos.x);
      animate(p,dt);
    } else if(pen && p.isGK && p.team!==r.team){
      const line = -dir*-(HALF_L-0.55);              // on his line, dancing
      const to = new THREE.Vector2(line-p.pos.x, Math.sin(performance.now()/220)*1.1-p.pos.y);
      movePlayer(p, to.clampLength(0,1), false, dt);
      p.face = Math.atan2(ball.pos.z-p.pos.y, ball.pos.x-p.pos.x);
      animate(p,dt);
    } else aiPlayer(p,dt);
  }
  if(r.t<=0){
    S.phase='play'; ball.cool=0;
    if(pen && r.taker){
      const gk = keeperOf(1-r.team);
      if(gk){                                        // he commits, usually wrongly
        const guess = Math.random()<0.5 ? 1 : -1;
        gk.dive = .85; gk.diveDir = guess; gk.diveHigh = Math.random()<0.4?1:0;
        gk.cool = 0.9;
      }
      r.taker.pos.set(ball.pos.x - S.dir[r.team]*0.6, 0);
      r.taker.face = Math.atan2(0-r.taker.pos.y, S.dir[r.team]*HALF_L-r.taker.pos.x);
      doShot(r.taker, new THREE.Vector2(0,(Math.random()-.5)*.5), 0.85,
             Math.random()<0.5 ? 'sidefoot' : 'sweep');
      S.restart=null; return;
    }
    if(r.taker){
      const d = Math.hypot(r.taker.pos.x-ball.pos.x, r.taker.pos.y-ball.pos.z);
      if(d<2.5){
        ball.owner=r.taker; S.possTeam=r.taker.team; S.lastTouch=r.taker;
        if(r.type==='goalkick') clearance(r.taker);
        /* a corner is crossed, not carried */
        else if(r.type==='corner'){ try{ doCross(r.taker); }catch(e){ clearance(r.taker); } }
      }
    }
    S.restart=null;
  }
}

/* ================== cameras ================== */
const camPos = new THREE.Vector3(0,22,-62), camLook = new THREE.Vector3(0,0,0);
let shotTimer = 0;
function cutTo(shot, hold){ S.camShot = shot; S.camHold = hold; shotTimer = 0; }

function frameFov(dist, coverage){
  const fovH = 2*Math.atan((coverage/2)/Math.max(6,dist));
  const fovV = 2*Math.atan(Math.tan(fovH/2)/camera.aspect);
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(fovV), 14, 48);
}

function updateCamera(dt){
  shotTimer += dt;
  if(S.camMode==='auto'){
    S.camHold -= dt;
    if(S.camHold <= 0){
      if(S.phase==='goal') cutTo('celebration', 3);
      else cutTo('broadcast', 1);
    }
  } else if(S.camShot !== S.camMode) cutTo(S.camMode, 1e9);

  const focus = new THREE.Vector3(
    THREE.MathUtils.clamp(ball.pos.x+ball.vel.x*.3, -HALF_L-3, HALF_L+3), 0,
    THREE.MathUtils.clamp(ball.pos.z+ball.vel.z*.3, -HALF_W-2, HALF_W+2));

  let want = new THREE.Vector3(), lookAt = focus.clone(), fov = 30, ease = 1.6;

  switch(S.camShot){
    case 'tele':            // low, tight, tracks along the same touchline
      want.set(THREE.MathUtils.clamp(focus.x*.88, -34, 34), 11.5, -(HALF_W+13));
      fov = frameFov(want.distanceTo(focus), 32);
      lookAt.y = 1.0; ease = 2.4;
      break;
    case 'goal': {          // behind the goal being attacked
      const d = S.dir[S.possTeam];
      want.set(d*(HALF_L+15), 12.5, focus.z*.30);
      fov = frameFov(want.distanceTo(focus), 46);
      lookAt.y = 1.2; ease = 1.5;
      break;
    }
    case 'save': {          // tight and low on the keeper as he goes down
      const gk = keeperOf(1-S.possTeam) || null;
      const c = gk ? new THREE.Vector3(gk.pos.x, 1.1, gk.pos.y) : focus;
      want.set(c.x + S.dir[S.possTeam]*7.5, 2.6, c.z - 9);
      lookAt.copy(c); lookAt.y = 1.1;
      fov = 26; ease = 3.2;
      break;
    }
    case 'celebration': {   // low, close, behind the goal that was scored on
      const s = S.goalSide||1;
      const t = S.scorer;
      const c = t ? new THREE.Vector3(t.pos.x,1.3,t.pos.y) : focus;
      want.set(c.x + s*9, 3.2, c.z + 7);
      lookAt.copy(c); lookAt.y = 1.3;
      fov = 32; ease = 1.1;
      break;
    }
    default: {              // BROADCAST: gantry rail at the halfway line
      const rail = THREE.MathUtils.clamp(focus.x*.62, -26, 26);
      want.set(rail, 21.5, -(HALF_W+26));
      fov = frameFov(want.distanceTo(focus), 52);
      lookAt.y = 0.9; ease = 1.35;
    }
  }
  /* Handheld drift, plus a kick when the ball is struck hard. A rig that
     never moves reads as a render; a rig that breathes reads as a camera
     with an operator behind it. */
  const t = performance.now()/1000;
  want.x += Math.sin(t*.37)*.16 + Math.sin(t*1.7)*.04;
  want.y += Math.sin(t*.53)*.09 + Math.sin(t*2.1)*.03;
  S.shake = Math.max(0, (S.shake||0) - dt*2.2);
  if(S.shake > 0){
    const k = S.shake*S.shake*0.42;
    want.x += (Math.random()-.5)*k; want.y += (Math.random()-.5)*k;
  }

  camPos.lerp(want, Math.min(1, dt*ease));
  camLook.lerp(lookAt, Math.min(1, dt*3.4));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.fov += (fov-camera.fov)*Math.min(1, dt*2.4);
  camera.updateProjectionMatrix();

  LIGHTS.key.position.set(focus.x+30, 70, focus.z+26);
  LIGHTS.key.target.position.copy(focus);
  LIGHTS.key.target.updateMatrixWorld();
}

/* ================== HUD ==================
   THE SCOREBOARD IS LOOKED UP INSIDE THE HOST, NOT THE DOCUMENT.
   Upstream this was `document.getElementById`, which was right for a
   page that is nothing but this engine. Here the stadium lives in a tab
   that the manager game rebuilds whenever you look at another one — the
   host is detached, not destroyed, so every id vanishes from the
   document and the very next frame threw on `el('clock').textContent`.
   The match froze in place while you were on the tactics screen, which
   is exactly when it is supposed to still be being played.

   `host` is held as a reference, so it can be searched whether or not it
   is currently on the page. */
const el = id => (host ? host.querySelector('#' + id) : document.getElementById(id));
function paintBug(){
  const c = el('bugLogo'); if(!c) return;
  const g = c.getContext('2d');
  g.clearRect(0,0,64,64);
  drawBrandLogo(g, 32, 32, 62);
  const d = el('bugDomain'); if(d) d.textContent = BRAND.domain;
}
paintBug();
/* The scoreboard reads off TEAMS, which loadSquads() may have replaced,
   so it is repainted rather than written once at startup. */
function paintBoard(){
  el('abbrA').textContent = TEAMS[0].abbr; el('abbrB').textContent = TEAMS[1].abbr;
  el('crestA').style.background = TEAMS[0].chip; el('crestB').style.background = TEAMS[1].chip;
  el('possFill').style.background = TEAMS[0].chip;
}
paintBoard();
function updateBoard(){ el('scoreA').textContent=S.score[0]; el('scoreB').textContent=S.score[1]; }
function clockLabel(){
  const total = S.halfLen*2, elapsed = (S.half-1)*S.halfLen + S.clock;
  return Math.floor(elapsed/total*90)+"'";
}
function fmtClock(){
  const total=S.halfLen*2, elapsed=(S.half-1)*S.halfLen+S.clock;
  const m=Math.floor(elapsed/total*90), s=Math.floor((elapsed/total*90-m)*60);
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
const feed = el('feed');
function event(tag, text){
  const d = document.createElement('div');
  d.className='ev'; d.innerHTML='<b>'+clockLabel()+' '+tag+'</b> — '+text;
  feed.appendChild(d);
  while(feed.children.length>3) feed.removeChild(feed.firstChild);
  setTimeout(()=>{ if(d.parentNode) d.parentNode.removeChild(d); }, 7000);
}
let lowerT = 0;
function lowerThird(tag,name,sub){
  el('lowTag').textContent=tag; el('lowName').textContent=name; el('lowSub').textContent=sub;
  el('lower').classList.add('show'); el('lower').style.opacity=1; lowerT=4.2;
}
const rc = el('radar').getContext('2d');
function drawRadar(){
  const w=340,h=208,pad=9;
  rc.clearRect(0,0,w,h);
  rc.fillStyle='rgba(6,10,24,.72)'; rc.strokeStyle='rgba(238,242,251,.4)'; rc.lineWidth=2;
  rc.beginPath();
  if(rc.roundRect) rc.roundRect(1,1,w-2,h-2,6); else rc.rect(1,1,w-2,h-2);
  rc.fill(); rc.stroke();
  const X=x=>pad+(x+HALF_L)/CFG.L*(w-pad*2), Z=z=>pad+(z+HALF_W)/CFG.W*(h-pad*2);
  rc.strokeStyle='rgba(238,242,251,.26)'; rc.lineWidth=1.3;
  rc.strokeRect(X(-HALF_L),Z(-HALF_W),w-pad*2,h-pad*2);
  rc.beginPath(); rc.moveTo(X(0),Z(-HALF_W)); rc.lineTo(X(0),Z(HALF_W)); rc.stroke();
  rc.beginPath(); rc.arc(X(0),Z(0),(w-pad*2)*(CFG.CIRCLE/CFG.L),0,7); rc.stroke();
  for(const s of [-1,1]){
    const x1=X(s*HALF_L), x2=X(s*(HALF_L-CFG.PEN_D));
    rc.strokeRect(Math.min(x1,x2),Z(-CFG.PEN_W/2),Math.abs(x2-x1),Z(CFG.PEN_W/2)-Z(-CFG.PEN_W/2));
  }
  for(const p of players){
    rc.beginPath(); rc.arc(X(p.pos.x),Z(p.pos.y), p===ball.owner?5:3.3, 0, 7);
    rc.fillStyle = p===ball.owner ? '#e9ff4a' : TEAMS[p.team].radar; rc.fill();
    if(p.isGK){ rc.strokeStyle='rgba(255,255,255,.75)'; rc.lineWidth=1.2; rc.stroke(); }
  }
  rc.beginPath(); rc.arc(X(ball.pos.x),Z(ball.pos.z),3,0,7); rc.fillStyle='#fff'; rc.fill();
}
function updatePoss(){
  const t = S.stats.poss[0]+S.stats.poss[1] || 1;
  const a = Math.round(S.stats.poss[0]/t*100);
  el('possFill').style.width = a+'%';
  el('possA').textContent = a+'%'; el('possB').textContent = (100-a)+'%';
}

/* =====================================================================
   REPLAYS — a goal is worth seeing twice
   ---------------------------------------------------------------------
   Every frame of play writes the ball and all twenty-two into a ring
   buffer holding the last few seconds of match time. It stores what the
   posing code needs and nothing more — each man's position on the pitch
   and the way he is facing — so playback runs through the same animate()
   the live match uses and the figures move exactly as they did.

   The buffer only records live play. A replay of a replay would be a
   loop, and a replay of a celebration is not a replay.
   ===================================================================== */
const REPLAY = { buf:[], playing:false, i:0, seconds:6.5 };

function replayRecord(dt){
  if(REPLAY.playing) return;
  const f = { d:dt, b:[ball.pos.x, ball.pos.y, ball.pos.z], p:[] };
  for(const q of players) f.p.push(q.pos.x, q.pos.y, q.face);
  REPLAY.buf.push(f);
  let total = 0;
  for(let i=REPLAY.buf.length-1; i>=0; i--){
    total += REPLAY.buf[i].d;
    if(total > REPLAY.seconds){ REPLAY.buf.splice(0,i); break; }
  }
}
function replayStart(){
  if(REPLAY.buf.length < 12) return false;
  REPLAY.playing = true; REPLAY.i = 0;
  lowerThird('REPLAY', S.scorer ? S.scorer.name : 'THE GOAL',
    TEAMS[S.lastScorer==null ? (S.score[0]>S.score[1] ? 0 : 1) : S.lastScorer].name);
  cutTo('goal', 99);
  return true;
}
function replayStop(){
  REPLAY.playing = false; REPLAY.buf.length = 0;
}
/* One recorded frame per step, at the speed it was recorded — so a
   replay always runs in real time however fast the match was going. */
function replayStep(dt){
  const f = REPLAY.buf[REPLAY.i++];
  if(!f){ replayStop(); return false; }
  ball.pos.set(f.b[0], f.b[1], f.b[2]);
  ballMesh.position.copy(ball.pos);
  /* A REPLAY HAD TO STAND STILL, and this is why. `animate()` reads the
     stride straight off `p.vel`, and a replay sets `pos` frame by frame
     without ever touching velocity — so every player kept whatever speed
     he happened to hold when the goal went in, which after the freeze
     and the celebration is nothing. Twenty-two men slid across the grass
     with their legs together.

     The buffer already knows how fast everybody was going: it is the
     distance between this frame and the last one, over the time between
     them. So the velocity is recovered rather than invented, and the
     legs run at the speed they actually ran at. */
  const prev = REPLAY.buf[REPLAY.i-2];
  const step = Math.max(1e-3, f.d || dt || 1/60);   /* every frame stored its own */
  for(let k=0;k<players.length;k++){
    const q = players[k];
    const nx = f.p[k*3], nz = f.p[k*3+1];
    if(prev) q.vel.set((nx-prev.p[k*3])/step, (nz-prev.p[k*3+1])/step);
    q.pos.x = nx; q.pos.y = nz; q.face = f.p[k*3+2];
    animate(q, dt);
  }
  return true;
}

/* ================== loop ================== */
let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, autoTuned = false;
function frame(now){
  requestAnimationFrame(frame);
  const raw = Math.min(.05,(now-last)/1000); last = now;
  for(const L of ledTextures) L.t.offset.x = (now/9000)*L.speed % 1;
  for(const f of flags){
    f.rotation.y = Math.sin(now/420 + f.position.x)*.38;
    f.rotation.z = Math.sin(now/260 + f.position.z)*.10;
  }
  SPRAY.step(raw);
  stepNets(raw);
  FLASH.step(raw, S.phase==='goal' || (S.freeze>0 && S.phase!=='play'));

  if(S.running){
    /* A GOAL IS WATCHED AT THE SPEED IT HAPPENED. At 4x a celebration
       went by in a blink and a replay would have been useless; the whole
       point of both is to see it. So the goal, and the replay after it,
       ignore the speed control and run a second to the second. */
    const liveSpeed = (S.phase==='goal' || S.phase==='replay') ? 1 : S.speed;
    acc += raw*liveSpeed;
    let guard=0;
    while(acc>=CFG.DT && guard++<8){ tick(CFG.DT); acc-=CFG.DT; }
    stepOfficials(raw*liveSpeed);
    /* the touchline runs on the real clock, not the match clock: a coach
       does not pace twice as fast because you pressed 2x */
    stepTouchline(raw);
  }
  updateCamera(raw); drawRadar(); updatePoss();
  if(lowerT>0){ lowerT-=raw; if(lowerT<=0){ el('lower').style.opacity=0; el('lower').classList.remove('show'); } }

  // one-time quality drop if the device is struggling
  if(!autoTuned){
    fpsAcc += raw; fpsN++;
    if(fpsAcc>4){
      if(fpsN/fpsAcc < 38){
        S.quality = 0;
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
        for(const p of players) for(const m of p.body.parts) m.castShadow=false;
      }
      autoTuned = true;
    }
  }
  renderer.render(scene,camera);
}

function tick(dt){
  /* one number a frame, so the marking assignment is built once for the
     defending side and read eleven times rather than built eleven times */
  S.frameId = (S.frameId|0) + 1;
  if(S.phase==='goal'){
    S.freeze -= dt;
    for(const p of players){
      if(p.celeb>0 && p.team===(S.lastScorer==null?(S.score[0]>S.score[1]?0:1):S.lastScorer)){
        const corner = new THREE.Vector2(S.goalSide*(HALF_L-6), (p.idx%2?1:-1)*(HALF_W-6));
        movePlayer(p, corner.sub(p.pos).clampLength(0,1), true, dt);
      } else movePlayer(p, ZERO, false, dt);
      animate(p,dt);
    }
    stepBall(dt);
    /* the celebration, then the replay, and only then the restart */
    if(S.freeze<=0){
      if(replayStart()){ S.phase='replay'; return; }
      kickoff(S.lastScorer==null?(S.score[0]>S.score[1]?1:0):1-S.lastScorer);
    }
    return;
  }
  if(S.phase==='replay'){
    if(!replayStep(dt)) kickoff(S.lastScorer==null?(S.score[0]>S.score[1]?1:0):1-S.lastScorer);
    return;
  }
  if(S.phase==='half'){
    S.freeze -= dt;
    /* HALF-TIME: THEY GO OFF, AND THEY COME BACK AT THE OTHER END.
       This used to be `movePlayer(p, ZERO, ...)` — twenty-two men
       standing exactly where the whistle caught them for three seconds,
       and then snapping into their second-half positions. Nobody left
       the pitch, so nothing about it read as half-time; the ends simply
       changed while you were looking at it.

       They walk to the tunnel now, spread along its mouth so they do not
       stack into one another, and the restart puts them out at their new
       ends while they are off the pitch — which is where a substitution
       of eleven positions is supposed to happen. */
    const mouthZ = HALF_W + 3.2;
    for(const p of players){
      const lane = ((p.idx % 11) - 5) * 1.15 + (p.team ? 7 : -7);
      const to = new THREE.Vector2(lane, mouthZ);
      const gap = to.sub(p.pos);
      const there = gap.length() < 0.9;
      movePlayer(p, there ? ZERO : gap.clampLength(0,1), false, dt);
      if(there) p.face = Math.PI/2;
      animate(p,dt);
    }
    if(S.freeze<=0){
      S.half=2; S.clock=0; S.dir=[S.dir[0]*-1,S.dir[1]*-1];
      /* THE SECOND HALF USED TO START WHEREVER THE FIRST ONE STOPPED.
         `el()` returns null while the host is detached — the note above
         says so, and paintBug() has guarded against it for months — and
         this line did not. Half-time ending while the manager was on any
         other tab threw on `.textContent`, which killed the frame before
         `kickoff(1)` could run: no repositioning, no centre spot, twenty
         two men standing exactly where the whistle left them, defending
         the wrong ends.

         So the restart goes first and unconditionally. The scoreboard is
         cosmetic and can miss a beat; the kick-off cannot. */
      kickoff(1);
      const per = el('period'); if(per) per.textContent='2ND';
    }
    return;
  }
  if(S.phase==='end'){
    for(const p of players){ movePlayer(p,ZERO,false,dt); animate(p,dt); }
    return;
  }

  S.clock += dt;
  /* the last few seconds of live play, kept so a goal can be shown again */
  replayRecord(dt);
  scriptTick();
  if(S.clock >= S.halfLen){
    /* A referee plays added time, and so does this. If the plan is still
       owed a goal we keep going — with urgency at its highest — rather
       than blowing the whistle on a scoreline that disagrees with the
       save file. Capped, so a plan that can never be satisfied still
       ends the match. */
    if(S.half===2 && SCRIPT.active && SCRIPT.events.some(e=>!e.fired)){
      S.stoppage = (S.stoppage||0) + dt;
      /* WAS 0.30 OF A HALF, WHICH RAN OUT. The referee here keeps the
         match alive until the plan is paid, because ending on a
         scoreline that disagrees with the save is the one thing this
         mode exists to prevent. Two halves' worth is a safety net for a
         plan that genuinely cannot be satisfied -- with the escalating
         spot kick above, it is never reached in practice. */
      if(S.stoppage < S.halfLen*2.0){ const c=el('clock'); if(c) c.textContent = fmtClock(); return; }
    }
    if(S.half===1){
      S.phase='half'; S.freeze=6;   /* long enough to actually walk off */
      lowerThird('HT', S.score[0]+' — '+S.score[1], TEAMS[0].abbr+' v '+TEAMS[1].abbr);
      event('HALF TIME', S.score[0]+'-'+S.score[1]);
      emit('halftime', {score:S.score.slice()});
    } else {
      S.phase='end';
      lowerThird('FT', S.score[0]+' — '+S.score[1], 'FULL TIME');
      event('FULL TIME', S.score[0]+'-'+S.score[1]);
      emit('fulltime', {score:S.score.slice(), stats:S.stats,
        scriptComplete: !SCRIPT.active || !SCRIPT.events.some(e=>!e.fired),
        blocked: SCRIPT.blocked});
      setTimeout(()=>{
        S.running=false; showDemoMenu(true);
        el('btnStart').textContent='PLAY AGAIN';
      }, 4500);
    }
    return;
  }
  { const c = el('clock'); if(c) c.textContent = fmtClock(); }
  if(ball.owner) S.stats.poss[ball.owner.team]++;
  if(S.liveShot){ S.liveShot.t -= dt; if(S.liveShot.t<=0) S.liveShot = null; }

  if(S.phase==='restart'){ stepRestart(dt); stepBall(dt); separate(); return; }
  for(const p of players) aiPlayer(p,dt);
  resolvePossession();
  stepBall(dt);
  separate();
  checkRules();
}

/* ================== ui ================== */
/* THE BROADCAST'S OWN FRONT DOOR IS NOT OURS.
   This file began as a standalone demo, so it carries a menu — half
   length, tempo, detail, KICK OFF — and puts it back up whenever a match
   stops. Inside the manager game that is a second main menu appearing
   over the top of the real one when you come out of a match, offering to
   restart a friendly between two clubs that do not exist. The game owns
   the screen here, so the menu stays down and the settings are the ones
   the director asked for: elite tempo, full detail. */
function showDemoMenu(on){
  const m = el('menu'); if(!m) return;
  if(on && S.embedded) return;              // never, once the game has mounted
  m.classList[on ? 'remove' : 'add']('off');
}

function seg(id, cb){
  const e = el(id);
  e.addEventListener('click', ev=>{
    const b = ev.target.closest('button,.chip'); if(!b) return;
    [...e.children].forEach(c=>c.classList.remove('on'));
    b.classList.add('on'); cb(b.dataset);
  });
}
seg('segLen', d=>S.halfLen=parseFloat(d.v));
/* Standalone only: the level of the two generated squads. Once the
   manager game loads real players this does nothing, because the numbers
   come from the save instead. */
seg('segDiff', d=>{ const q=parseFloat(d.v); TEAMS[0].quality=q; TEAMS[1].quality=q;
                    TEAMS[0].squad=null; TEAMS[1].squad=null; S.squadsDirty=true; });
seg('segQual', d=>{
  S.quality = parseInt(d.v);
  renderer.shadowMap.enabled = !!S.quality;
  renderer.setPixelRatio(S.quality ? Math.min(devicePixelRatio||1,2) : 1);
  autoTuned = true;
});
seg('camGrp', d=>{ S.camMode = d.cam; if(d.cam!=='auto') cutTo(d.cam, 1e9); else cutTo('broadcast',1); });
seg('spdGrp', d=>S.speed = parseFloat(d.spd));

function newMatch(){
  if(S.squadsDirty){ buildTeams(); S.squadsDirty=false; }
  reskinPitch();                                   // a freshly cut pitch each time
  S.score=[0,0]; S.half=1; S.clock=0; S.dir=[1,-1];
  S.stats={poss:[0,0],shots:[0,0],onTarget:[0,0],corners:[0,0],aerial:[0,0],loose:[0,0]};
  for(const p of players){ p.stamina=100; p.celeb=0; p.skill=0; p.dive=0; p.kickAnim=0; }
  S.org = [teamOrg(0), teamOrg(1)];        /* who is leading whom, this match */
  for(const e of SCRIPT.events) e.fired = false;
  SCRIPT.blocked=0; SCRIPT.forced=0; SCRIPT.pending=null; SCRIPT.penWait=0;
  SCRIPT.penTries=0; S.stoppage=0;
  { const p1 = el('period'); if(p1) p1.textContent='1ST'; } updateBoard(); paintBoard();
  kickoff(0); cutTo('broadcast',1);
  event('KICK OFF', TEAMS[0].name+' v '+TEAMS[1].name);
  emit('kickoff', {home:TEAMS[0].name, away:TEAMS[1].name, pitch:PITCH.cut.id});
}
el('btnStart').addEventListener('click', ()=>{
  showDemoMenu(false);
  if(S.phase==='menu' || S.phase==='end') newMatch();
  S.running=true; last=performance.now();
});
el('btnPause').addEventListener('click', ()=>{
  S.running=false; showDemoMenu(true);
  el('btnStart').textContent = S.phase==='end' ? 'PLAY AGAIN' : 'RESUME';
});
el('btnFull').addEventListener('click', ()=>{
  const e = document.documentElement;
  if(!document.fullscreenElement && !document.webkitFullscreenElement){
    const r = e.requestFullscreen||e.webkitRequestFullscreen||e.webkitRequestFullScreen;
    if(r) r.call(e).catch(()=>{});
    if(screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{});
  } else {
    const x = document.exitFullscreen||document.webkitExitFullscreen;
    if(x) x.call(document).catch(()=>{});
  }
});
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && S.running){
    S.running=false; showDemoMenu(true);
    el('btnStart').textContent='RESUME';
  }
});

/* =====================================================================
   PUBLIC API — how the football manager game drives this view
   ---------------------------------------------------------------------
   Drop this file into an iframe (or paste the script inline) and hand it
   two squads. Nothing else needs to change: every decision on the pitch
   is already read out of the attributes you pass in.

     Matchday.loadSquads({
       home: {
         name:'MANCHESTER UNITED', abbr:'MUN',
         shirt:'#da291c', trim:'#ffffff', shorts:'#ffffff', socks:'#000000',
         pattern:'none',                 // none | stripe | hoop | sash | pinstripe
         formation:'4-2-3-1',            // any key of FORMATIONS
         mentality:'Attacking',          // Defensive Counter Balanced Attacking Overload
         players:[ {
           id:'12345', name:'Fernandes', number:8, slot:'AMC',
           heightCm:179, weightKg:69,
           attrs:{ passing:18, shooting:15, dribbling:14, tackling:9, crossing:15,
                   firstTouch:16, heading:10, positioning:13, vision:18, workRate:17,
                   decisions:16, composure:15, aggression:13, leadership:16,
                   pace:13, acceleration:13, stamina:16, strength:11, agility:14 }
         }, ...eleven of them ]
       },
       away: { ...same shape... }
     });

   Anything you leave out is filled in: a missing attribute reads as 10, a
   missing height comes from the position's real-world distribution, a
   missing player is generated. Pass the eleven starters in any order —
   `slot` decides where each one stands, and the formation supplies the
   shape.

   Then:  Matchday.start()  .pause()  .resume()
          Matchday.setCamera('auto'|'broadcast'|'tele'|'goal')
          Matchday.setSpeed(1|2|4)     Matchday.setHalfLength(seconds)
          Matchday.on('goal', fn)      also: kickoff, halftime, fulltime, shot
          Matchday.getState()          score, clock, possession, shots
   ===================================================================== */
const LISTENERS = {};
function emit(name, payload){
  const list = LISTENERS[name];
  if(!list) return;
  for(const fn of list){ try{ fn(payload); }catch(e){ /* a listener must not stop play */ } }
}
function applyTeam(slotIdx, cfg){
  if(!cfg) return;
  const T = TEAMS[slotIdx];
  for(const k of ['name','abbr','shirt','trim','shorts','socks','sleeve','pattern',
                  'radar','chip','sponsor','sponsorInk','numberInk','formation',
                  'mentality','quality'])
    if(cfg[k] != null) T[k] = cfg[k];
  if(!MENT_MOD[T.mentality]) T.mentality = 'Balanced';
  if(!FORMATIONS[T.formation]) T.formation = '4-3-3';
  if(cfg.gkKit) Object.assign(GK_KITS[slotIdx], cfg.gkKit);
  if(Array.isArray(cfg.players) && cfg.players.length){
    /* Order the eleven by the formation's slots so each man lines up in
       the position he was picked in, whatever order they arrived in. */
    const shape = FORMATIONS[T.formation];
    const pool = cfg.players.slice(0,11);
    const out = [];
    for(const [slot] of shape){
      let i = pool.findIndex(q => q && (q.slot||'').toUpperCase() === slot);
      if(i < 0) i = pool.findIndex(q => q);
      out.push(i>=0 ? pool.splice(i,1)[0] : null);
    }
    T.squad = out.map(q => q || {});
  } else T.squad = null;
  T.chip  = T.chip  || T.shirt;
  T.radar = T.radar || T.shirt;
}
window.Matchday = {
  version: '2.0',
  ATTR_KEYS, FORMATIONS, MENTALITIES: Object.keys(MENT_MOD),
  SLOTS: Object.keys(SLOT_GROUP),
  loadSquads(cfg){
    cfg = cfg || {};
    applyTeam(0, cfg.home); applyTeam(1, cfg.away);
    buildTeams(); buildTouchline(true); S.squadsDirty = false;
    paintBoard();
    S.phase = 'menu'; S.running = false;
    kickoff(0);
    for(const p of players) animate(p, 0);
    return this;
  },
  /* Hand over the match your own model produced. Every goal in `events`
     will be scored, by the man you name, at about the minute you name —
     and nothing else will be. Anything else that would have gone in
     becomes a save or the woodwork.

       Matchday.playScript({
         events:[ {minute:23, team:0, pid:'123', scorer:'Rashford', finish:'header'},
                  {minute:58, team:1, scorer:'Watkins'},
                  {minute:81, team:0, scorer:'Rashford', finish:'banger'} ],
         stats:{ shots:[15,8], possession:[61,39] }
       }).start();

     `finish` is optional and takes any key of FINISH (tapin, sidefoot,
     sweep, curler, banger, chip, volley, halfvolley, header,
     divingheader). `stats` is optional and steers rather than clamps. */
  playScript(plan){ loadScript(plan); return this; },
  clearScript(){ clearScript(); return this; },
  /* Make a substitution the crowd can see.

       Matchday.substitute({ team:0, offPid:'123',
         on:{ id:'456', name:'Mainoo', number:37, slot:'MC',
              heightCm:180, weightKg:73, attrs:{...} } });

     The man coming on takes the place of the man going off, in his own
     shirt, and one of the substitutes warming up on that touchline is
     taken out of the group. */
  substitute(spec){
    if(!spec) return null;
    return substitutePlayer(spec.team, spec.offPid, spec.on || spec.player);
  },
  /* PLAY A WHOLE MATCH WITHOUT DRAWING IT.
     The frame loop caps at eight sub-steps a frame, so how fast a match
     can run is bound by the frame rate — on a slow renderer ninety
     minutes takes six real minutes, which makes both tuning and any
     "simulate the rest of the league" use of this engine impossible.
     This runs the same tick() the live match runs, with no rendering
     and no camera, until the whistle. Same football, no pictures. */
  simulateMatch(opts){
    const o = opts || {};
    newMatch();
    const wasRunning = S.running;
    S.running = false;                       // the frame loop must not also step it
    let guard = 0;
    const cap = Math.max(1000, +o.maxTicks || 400000);
    while(S.phase !== 'end' && guard++ < cap) tick(CFG.DT);
    const out = this.getState();
    out.ticks = guard;
    out.completed = S.phase === 'end';
    S.running = wasRunning;
    return out;
  },
  scriptState(){ return {active:SCRIPT.active, blocked:SCRIPT.blocked,
    remaining:SCRIPT.events.filter(e=>!e.fired).length,
    events:SCRIPT.events.map(e=>({minute:e.minute, team:e.team, scorer:e.scorer, fired:e.fired}))}; },
  FINISHES: Object.keys(FINISH),
  /* the manager game announces itself here: no demo menu ever again,
     and elite tempo rather than the demo's PRO default */
  embed(){ S.embedded = true; S.aiSkill = 1; showDemoMenu(false); return this; },
  start(){ showDemoMenu(false); newMatch(); S.running=true; last=performance.now(); return this; },
  pause(){ S.running=false; return this; },
  resume(){ showDemoMenu(false); S.running=true; last=performance.now(); return this; },
  setCamera(m){ S.camMode=m; if(m!=='auto') cutTo(m,1e9); else cutTo('broadcast',1); return this; },
  setSpeed(v){ S.speed = Math.max(0.25, Math.min(8, +v||1)); return this; },
  setHalfLength(sec){ S.halfLen = Math.max(30, +sec||240); return this; },
  setQuality(q){ S.quality = q?1:0; renderer.shadowMap.enabled = !!q;
                 renderer.setPixelRatio(q?Math.min(devicePixelRatio||1,2):1);
                 autoTuned = true; return this; },
  recutPitch(){ reskinPitch(); return this; },
  on(name, fn){ (LISTENERS[name] || (LISTENERS[name]=[])).push(fn); return this; },
  off(name, fn){ const l=LISTENERS[name]; if(l) LISTENERS[name]=l.filter(f=>f!==fn); return this; },
  /* WHAT EACH MAN ACTUALLY DID. Top speed reached and ground covered,
     against the attributes that were supposed to decide them -- the only
     way to answer "do the attributes show on the pitch?" with a number
     instead of an opinion. */
  playerReport(){
    return players.map(p=>({
      team:p.team, name:p.name, slot:p.slot,
      pace:Math.round(effA(p,'pace')*10)/10,
      acceleration:Math.round(effA(p,'acceleration')*10)/10,
      stamina:Math.round(effA(p,'stamina')*10)/10,
      topSpeed:Math.round(p.topSpeed*100)/100,
      peak:Math.round((p.peak||0)*100)/100,
      metres:Math.round(p.ran||0)
    }));
  },
  getState(){
    const t = S.stats.poss[0]+S.stats.poss[1] || 1;
    return { phase:S.phase, running:S.running, half:S.half, minute:clockLabel(),
      score:S.score.slice(),
      teams:[TEAMS[0].name, TEAMS[1].name],
      possession:[Math.round(S.stats.poss[0]/t*100), Math.round(S.stats.poss[1]/t*100)],
      shots:S.stats.shots.slice(), onTarget:S.stats.onTarget.slice(),
      corners:S.stats.corners.slice(), pitch:PITCH.cut.id,
      aerial:S.stats.aerial.slice(), loose:S.stats.loose.slice(),
      /* who else is out there — the officials and the two technical
         areas, so a test can prove the touchline is populated */
      crew:{ officials:officials.length, bench:bench.filter(b=>b.kind!=='gone').length,
             benchAt:bench.slice(0,3).map(b=>b.kind+':'+b.pos.x.toFixed(1)+','+b.pos.y.toFixed(1)) } };
  }
};

/* ================== go ================== */
paintBoard();
kickoff(0);
for(const p of players) animate(p, 0);
for(const o of officials) animateLite(o);
buildTouchline();
for(const b of bench) animateLite(b);
updateBoard();
el('load').classList.add('off');
requestAnimationFrame(frame);
  }

  /* THREE HAS TO BE FETCHED, AND USED TO BE SOMEBODY ELSE'S JOB.
     The old 3D dugout lazy-loaded it and this engine simply assumed it
     was there; deleting that dugout took the loader with it, so the
     broadcast silently never booted and the tab fell back to the 2D
     renderer. It loads its own dependency now. */
  var loading = false, loadFailed = false, bootFailed = false;
  function ensureThree() {
    if (typeof THREE !== 'undefined') return true;
    if (loadFailed || loading) return false;
    loading = true;
    try {
      var tag = document.createElement('script');
      tag.src = (typeof window.THREE_LOCAL === 'string') ? window.THREE_LOCAL : 'vendor/three.min.js';
      tag.async = false;
      tag.onload = function () { loading = false; };
      tag.onerror = function () { loading = false; loadFailed = true; };
      document.head.appendChild(tag);
    } catch (error) { loading = false; loadFailed = true; }
    return false;
  }

  window.RBSMatchday = {
    /* Build it once, into the element the dugout hands us. */
    mount: function (el) {
      if (!el) return null;
      /* the game is driving: no demo menu, and elite football */
      try { if (window.Matchday && window.Matchday.embed) window.Matchday.embed(); } catch (e) { /* not booted yet; booted path below embeds */ }
      if (booted) {
        if (host && host.parentNode !== el) el.appendChild(host);
        try { if (window.Matchday && window.Matchday.embed) window.Matchday.embed(); } catch (e) { /* nothing to embed into */ }
        return window.Matchday || null;
      }
      /* not ready yet is not the same as broken: the dugout calls this
         every frame, so it boots on whichever call finds THREE there.
         Broken, though, is final — see bootFailed below. */
      if (bootFailed) return null;
      if (!ensureThree()) return null;
      host = document.createElement('div');
      host.id = 'mdHost';
      host.style.cssText = 'width:100%;height:100%';
      host.innerHTML = MARKUP;
      el.appendChild(host);
      inject();
      try { boot(); booted = true; } catch (error) {
        /* A DEVICE WITH NO WebGL FAILS HERE, AND FAILS FOR GOOD.
           This used to swallow the error and return null, which the
           dugout reads as "not ready yet" — so it rebuilt the host and
           ran the whole boot again on every frame, and waited twelve
           seconds before handing the match back to the 2D renderer.
           Measured with WebGL switched off in Chromium. */
        try { if (host.parentNode) host.parentNode.removeChild(host); } catch (e2) { /* gone */ }
        host = null; bootFailed = true;
        return null;
      }
      return window.Matchday || null;
    },
    booted: function () { return booted; },
    waiting: function () { return loading; },
    unavailable: function () { return loadFailed || bootFailed; },
    host: function () { return host; },
    resize: function () {
      try { window.dispatchEvent(new Event('resize')); } catch (error) { /* no window */ }
    }
  };
}());
