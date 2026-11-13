/* global G, UI, ACTIONS, LEAGUES, esc, openModal, toast */

/* =====================================================================
   THE MANAGER'S LEGACY
   ---------------------------------------------------------------------
   A career had seasons and trophies and nothing in between. Winning five
   in a row, taking a club up a division, bringing a teenager through to
   eighty-five -- the things a manager actually remembers -- happened and
   were gone by the next Saturday.

   This keeps them. It is a list of milestones, each of which is either
   done or not, with how far along you are where that can be counted, and
   a running record of every league match you have managed.

   IT ONLY WATCHES. Every milestone is read off things the game has
   already decided -- the fixtures that have been played, the honours
   list, the squad as it stands. Nothing here gives a bonus, moves a
   number the match engine reads, or makes the next result more or less
   likely; a milestone is a record of what happened, never a reason for
   it. It does not even write to the inbox: you get a toast when one
   falls, and the list is on the Trophies tab.

   The only thing it stores is `G.legacy`, its own drawer.
   ===================================================================== */
(function legacy() {
  'use strict';

  const active = () => !!(typeof G !== 'undefined' && G && G.clubs && G.clubs[G.my] && !G.sacked);
  const tierOf = (club) => {
    try { return (LEAGUES[club.league] || {}).tier || club.tier || 1; } catch (error) { return club.tier || 1; }
  };

  function drawer() {
    if (!G.legacy || typeof G.legacy !== 'object') G.legacy = {};
    const L = G.legacy;
    if (!L.done) L.done = {};
    if (!L.past) L.past = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    if (!L.best) L.best = { wins: 0, unbeaten: 0, margin: 0, goals: 0 };
    if (L.start == null) {
      const club = G.clubs[G.my];
      L.start = { tier: tierOf(club), cap: club.cap || 0, season: G.season || 1, club: club.key };
    }
    return L;
  }

  /* this season's league matches, in the order they were played */
  function seasonRun() {
    const my = G.my;
    const rows = (G.fixtures || []).filter((f) => f && f.played && (f.h === my || f.a === my))
      .sort((a, b) => a.day - b.day);
    const run = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, wins: 0, unbeaten: 0, margin: 0, curWins: 0, curUnbeaten: 0 };
    rows.forEach((f) => {
      const mine = f.h === my ? f.hs : f.as, theirs = f.h === my ? f.as : f.hs;
      run.p += 1; run.gf += mine; run.ga += theirs;
      if (mine > theirs) { run.w += 1; run.curWins += 1; run.curUnbeaten += 1; run.margin = Math.max(run.margin, mine - theirs); }
      else if (mine === theirs) { run.d += 1; run.curWins = 0; run.curUnbeaten += 1; }
      else { run.l += 1; run.curWins = 0; run.curUnbeaten = 0; }
      run.wins = Math.max(run.wins, run.curWins);
      run.unbeaten = Math.max(run.unbeaten, run.curUnbeaten);
    });
    return run;
  }

  function honours() {
    const list = (G.honours || []).map((h) => String((h && h.comp) || ''));
    return {
      all: list.filter((c) => !/promotion$/i.test(c)).length,
      titles: list.filter((c) => /champions$/i.test(c)).length,
      cups: list.filter((c) => /winners$/i.test(c) || /cup$/i.test(c)).length,
      promotions: list.filter((c) => /promotion$/i.test(c)).length,
      continental: list.filter((c) => /^(Champions Cup|Continental Cup|Federation Cup)/i.test(c)).length,
    };
  }

  /* every milestone: [id, title, what it takes, (state) => [have, need]] */
  const MILESTONES = [
    ['firstWin', 'Off the mark', 'Win a league match.', (s) => [s.total.w, 1]],
    ['bigWin', 'A statement', 'Win a league match by four goals or more.', (s) => [Math.min(4, s.best.margin), 4]],
    ['five', 'On a roll', 'Win five league matches in a row.', (s) => [Math.min(5, s.best.wins), 5]],
    ['ten', 'Hard to beat', 'Go ten league matches unbeaten.', (s) => [Math.min(10, s.best.unbeaten), 10]],
    ['twenty', 'Invincible spell', 'Go twenty league matches unbeaten.', (s) => [Math.min(20, s.best.unbeaten), 20]],
    ['goals', 'Free scoring', 'Score seventy league goals in one season.', (s) => [Math.min(70, s.best.goals), 70]],
    ['fifty', 'Fifty up', 'Win fifty league matches.', (s) => [Math.min(50, s.total.w), 50]],
    ['century', 'A hundred games', 'Manage a hundred league matches.', (s) => [Math.min(100, s.total.p), 100]],
    ['fiveHundred', 'Part of the furniture', 'Manage five hundred league matches.', (s) => [Math.min(500, s.total.p), 500]],
    ['season', 'A full season', 'See a season through to the end.', (s) => [Math.min(1, s.seasons), 1]],
    ['fiveSeasons', 'Five years', 'Complete five seasons.', (s) => [Math.min(5, s.seasons), 5]],
    ['tenSeasons', 'A decade', 'Complete ten seasons.', (s) => [Math.min(10, s.seasons), 10]],
    ['silver', 'Silverware', 'Win a trophy.', (s) => [Math.min(1, s.hon.all), 1]],
    ['champions', 'Champions', 'Win a league title.', (s) => [Math.min(1, s.hon.titles), 1]],
    ['cup', 'Cup winners', 'Win a cup.', (s) => [Math.min(1, s.hon.cups), 1]],
    ['continent', 'Conquerors', 'Win a continental competition.', (s) => [Math.min(1, s.hon.continental), 1]],
    ['serial', 'Serial winner', 'Win five trophies.', (s) => [Math.min(5, s.hon.all), 5]],
    ['up', 'Going up', 'Win promotion.', (s) => [Math.min(1, s.hon.promotions), 1]],
    ['climb', 'All the way up', 'Reach the top division with a club you took over lower down.', (s) => [s.start.tier > 1 && s.tier === 1 ? 1 : 0, 1]],
    ['prodigy', 'One of our own', 'Have a player aged 21 or under rated 85 or better.', (s) => [s.prodigy ? 1 : 0, 1]],
    ['ground', 'Bricks and mortar', 'Add five thousand to the capacity of your ground.', (s) => [Math.max(0, Math.min(5000, s.cap - s.start.cap)), 5000]],
  ];

  let cacheKey = '', cacheState = null;

  function read() {
    const L = drawer();
    const club = G.clubs[G.my];
    /* a new season: bank the one that has just finished */
    if (L.season !== G.season) {
      if (L.season != null && L.lastRun) {
        ['p', 'w', 'd', 'l', 'gf', 'ga'].forEach((k) => { L.past[k] += L.lastRun[k] || 0; });
        L.seasons = (L.seasons || 0) + 1;
      }
      L.season = G.season;
      L.lastRun = null;
    }
    const run = seasonRun();
    L.lastRun = { p: run.p, w: run.w, d: run.d, l: run.l, gf: run.gf, ga: run.ga };
    L.best.wins = Math.max(L.best.wins, run.wins);
    L.best.unbeaten = Math.max(L.best.unbeaten, run.unbeaten);
    L.best.margin = Math.max(L.best.margin, run.margin);
    L.best.goals = Math.max(L.best.goals, run.gf);
    const total = {};
    ['p', 'w', 'd', 'l', 'gf', 'ga'].forEach((k) => { total[k] = L.past[k] + run[k]; });
    const prodigy = (club.players || []).some((p) => p && p.age <= 21 && (p.ovr || 0) >= 85);
    return { total, best: L.best, seasons: L.seasons || 0, hon: honours(), start: L.start,
      tier: tierOf(club), cap: club.cap || 0, prodigy, run };
  }

  function check(announce) {
    if (!active()) return null;
    const key = [G.my, G.season, G.day, (G.honours || []).length, G.clubs[G.my].cap].join('|');
    if (key === cacheKey && cacheState) return cacheState;
    const state = read();
    const L = G.legacy;
    const fresh = [];
    MILESTONES.forEach(([id, title, , measure]) => {
      if (L.done[id]) return;
      const [have, need] = measure(state);
      if (have >= need) { L.done[id] = { season: G.season, day: G.day }; fresh.push(title); }
    });
    /* the first look at a career that is already under way is not news */
    if (announce && L.seen && fresh.length && typeof toast === 'function') {
      toast('🏅 Milestone: ' + fresh[0] + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ')' : ''), 3200);
    }
    L.seen = 1;
    cacheKey = key; cacheState = state;
    return state;
  }

  function summary() {
    const state = check(false);
    if (!state) return null;
    const done = MILESTONES.filter((m) => G.legacy.done[m[0]]).length;
    return { done, of: MILESTONES.length, record: state.total, best: state.best, seasons: state.seasons };
  }

  function rows(state) {
    return MILESTONES.map(([id, title, what, measure]) => {
      const won = G.legacy.done[id];
      const [have, need] = measure(state);
      const pct = Math.max(0, Math.min(100, Math.round((have / need) * 100)));
      return '<li class="rbs-lg-row' + (won ? ' done' : '') + '"><span class="rbs-lg-mark" aria-hidden="true">' + (won ? '✓' : '') + '</span>'
        + '<div><b>' + esc(title) + '</b><small>' + esc(what) + '</small>'
        + (won ? '<em>Season ' + esc(String(won.season)) + '</em>'
          : (need > 1 ? '<div class="rbs-lg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + need + '" aria-valuenow="' + have
            + '"><i style="width:' + pct + '%"></i></div><em>' + have.toLocaleString() + ' / ' + need.toLocaleString() + '</em>' : ''))
        + '</div></li>';
    }).join('');
  }

  function open() {
    const state = check(false);
    if (!state) return;
    const t = state.total, s = summary();
    const pct = t.p ? Math.round((t.w / t.p) * 100) : 0;
    openModal('<section class="rbs-lg"><span class="rbs-eyebrow">Your career so far</span><h3>The manager’s legacy</h3>'
      + '<div class="rbs-lg-record"><div><strong>' + t.p + '</strong><span>League games</span></div>'
      + '<div><strong>' + t.w + '–' + t.d + '–' + t.l + '</strong><span>Won · drawn · lost</span></div>'
      + '<div><strong>' + pct + '%</strong><span>Win rate</span></div>'
      + '<div><strong>' + t.gf + '–' + t.ga + '</strong><span>Goals</span></div></div>'
      + '<p class="rbs-lg-intro">' + s.done + ' of ' + s.of + ' milestones reached. Best winning run ' + state.best.wins
      + ', longest unbeaten run ' + state.best.unbeaten + '.</p>'
      + '<ul class="rbs-lg-list">' + rows(state) + '</ul></section>');
  }

  function mount() {
    if (!active()) return;
    check(true);
    if (UI.view !== 'club' || UI.clubTab !== 'trophies') return;
    const view = document.getElementById('view');
    if (!view || view.querySelector('#rbsLegacyCard')) return;
    const s = summary();
    const pct = Math.round((s.done / s.of) * 100);
    view.insertAdjacentHTML('beforeend', '<div class="card rbs-lg-card" id="rbsLegacyCard"><span class="rbs-eyebrow">Milestones</span>'
      + '<h4>The manager’s legacy</h4><p>' + s.done + ' of ' + s.of + ' reached · ' + s.record.p + ' league games · '
      + s.record.w + ' wins</p><div class="rbs-lg-bar"><i style="width:' + pct + '%"></i></div>'
      + '<button class="btn btn-ghost btn-block" data-action="legacyOpen">See every milestone</button></div>');
  }

  ACTIONS.legacyOpen = open;

  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-legacy';
    style.textContent = `
.rbs-lg h3{font-size:24px;line-height:1.2;letter-spacing:-.025em;margin:8px 0 14px}
.rbs-lg-record{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.rbs-lg-record>div{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px}
.rbs-lg-record strong{display:block;font:800 22px/1.1 var(--body);letter-spacing:-.02em;color:#f2f4f7}
.rbs-lg-record span{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#97a1ad;margin-top:5px}
.rbs-lg-intro{font-size:13px;line-height:1.6;color:#aeb8c4;margin:14px 0 6px}
.rbs-lg-list{list-style:none;margin:0;padding:0}
.rbs-lg-row{display:flex;gap:12px;align-items:flex-start;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.rbs-lg-mark{flex:0 0 26px;height:26px;border-radius:50%;border:1.5px solid rgba(255,255,255,.22);display:grid;place-items:center;font-weight:900;font-size:14px;margin-top:1px}
.rbs-lg-row.done .rbs-lg-mark{background:var(--gold);border-color:var(--gold);color:#17130a}
.rbs-lg-row>div{flex:1;min-width:0}.rbs-lg-row b{display:block;font-size:15px}
.rbs-lg-row small{display:block;font-size:12px;line-height:1.5;color:#97a1ad;margin-top:2px}
.rbs-lg-row em{display:block;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.06em;color:#c8d0da;margin-top:6px}
.rbs-lg-row.done em{color:var(--gold)}.rbs-lg-row:not(.done) b{color:#d5dbe3}
.rbs-lg-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:8px}
.rbs-lg-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#b8891f,var(--gold))}
.rbs-lg-card{margin-top:14px}.rbs-lg-card h4{font-size:18px;margin:6px 0 4px}.rbs-lg-card p{font-size:13px;color:#aeb8c4;margin:0 0 10px}
.rbs-lg-card .btn{margin-top:12px}
`;
    document.head.appendChild(style);
    const before = window.render;
    if (typeof before === 'function') {
      window.render = function renderWithLegacy() {
        const result = before.apply(this, arguments);
        try { mount(); } catch (error) { /* the screen is drawn either way */ }
        return result;
      };
    }
  }

  window.RBSLegacy = Object.freeze({ check: () => check(false), summary, milestones: () => MILESTONES.map((m) => m[0]) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
