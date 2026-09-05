/* global G, UI, ACTIONS, FORMATIONS, playerById, calcEff, ovrOf, posFitLabel,
          esc, openModal, closeModal, render, face */
(function managerExperience() {
  'use strict';

  const PAGES = {
    home: ['Manager’s office', 'Prepare your side. Make your next decision.'],
    squad: ['Squad', 'Know your players and keep them ready to perform.'],
    tactics: ['Tactical plan', 'Choose the eleven and give them a way to play.'],
    transfers: ['Recruitment', 'Find the right player for the role and the budget.'],
    world: ['Competitions', 'Follow the fixtures, results and race for honours.'],
    club: ['Club operations', 'Manage the staff, finances and future of your club.'],
  };
  const ROUTES = [
    ['office', 'Manager’s office', 'home'], ['squad', 'First-team squad', 'squad', 'first'],
    ['tactics', 'Tactics and team selection', 'tactics'], ['training', 'Training and development', 'squad', 'training'],
    ['treatment', 'Treatment and injuries', 'squad', 'treat'], ['academy', 'Youth academy', 'squad', 'academy'],
    ['transfers', 'Transfers and scouting', 'transfers'], ['fixtures', 'Fixtures and results', 'world', 'fixtures'],
    ['table', 'League table', 'world', 'table'], ['finances', 'Finances and budgets', 'club', 'finances'],
    ['staff', 'Staff and delegation', 'club', 'staff'], ['saves', 'Save, load and recovery', 'club', 'save'],
  ];
  const GUIDES = [
    ['start', 'Your first week', 'office', 'Review the squad and the board’s expectations. Choose a formation, check the eleven, then set training. Use Continue to move through the calendar. Messages that need an answer stop progress until you make the decision.'],
    ['selection', 'Pick a balanced eleven', 'tactics', 'Tap a shirt to see replacements for that position. The effective rating includes positional familiarity, condition, sharpness and morale. Choosing someone already in the XI swaps the two players. Name your substitutes separately. Injured, suspended and loaned-out players cannot be selected.'],
    ['readiness', 'Condition, sharpness and morale', 'training', 'Condition is how fresh a player is now. Sharpness is match readiness and benefits from playing time. Morale reflects how he feels about his football and your management. An excellent player who is tired, unhappy or in an unfamiliar role can perform below his ability. Review these together before choosing your side.'],
    ['tactics', 'Build a way of playing', 'tactics', 'Formation places the players; instructions tell them how to use those positions. High pressing and fast tempo cost energy. A high defensive line leaves space behind. Direct passing looks forward earlier; short passing needs nearby options. Use the opposition report and change one part of the plan at a time.'],
    ['scouting', 'Recruit for a role', 'transfers', 'Search by position, age and potential, then scout the players you want to understand. Open a profile and choose Compare with my squad. Look at the attributes the role needs, the wage, contract and interest in joining. A bigger overall rating alone does not guarantee a better fit.'],
    ['development', 'Develop your players', 'training', 'Set a training programme that suits the player and give prospects appropriate minutes. Development takes time and depends on the player, coaching and facilities. Potential is a ceiling to work towards, not a promise that every player will reach it. Keep an eye on workload and injuries.'],
    ['contracts', 'Keep promises you can fulfil', 'squad', 'A squad role is a promise about playing time. Players compare their minutes with that promise and can become unhappy when it is broken. Check expiring contracts early and make room in your wage budget before offering a new deal.'],
    ['match', 'Manage the match', 'tactics', 'Pitch, Text and Stats show the same match. Use the match controls to pause and review your side, make substitutions and adjust instructions. Look at condition, chances and individual contributions as well as the score. Strong squads improve your chances; football still has uncertainty.'],
    ['money', 'Understand the two budgets', 'finances', 'The transfer budget pays for bringing players in; the wage budget covers recurring salaries. Instalments and bonuses create future obligations. Check the finance screen before a major deal, and consider how it affects next season as well as today.'],
    ['save', 'Protect a long career', 'saves', 'Autosave keeps your progress and two earlier recovery points. Manual slots let you keep a separate checkpoint. From Save & load you can export a backup. Continue opens the most recently saved primary slot; Choose a save or recovery point lets you restore an earlier career.'],
  ];
  const normalise = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const active = () => !!(G && G.clubs && G.clubs[G.my] && !G.sacked);

  function search(query) {
    const q = normalise(query);
    const pages = ROUTES.filter((r) => !q || normalise(r[1]).includes(q)).map((r) => ({ type: 'page', id: r[0], title: r[1], detail: 'Go to screen' }));
    if (!q || q.length < 2 || !active()) return pages;
    const players = [];
    const clubs = G.clubs.filter((c) => c && normalise(c.name + ' ' + c.short).includes(q)).slice(0, 4)
      .map((c) => ({ type: 'club', id: c.i, title: c.name, detail: c.league || 'Club' }));
    // Your own squad appears first. Searching reveals names, never hidden ratings.
    const ordered = [G.clubs[G.my], ...G.clubs.filter((c) => c && c.i !== G.my)];
    for (const club of ordered) {
      for (const p of club.players || []) {
        if (normalise(p.name).includes(q)) players.push({ type: 'player', id: p.id, title: p.name,
          detail: p.pos + ' · ' + (club.short || club.name) });
        if (players.length >= 12) break;
      }
      if (players.length >= 12) break;
    }
    return [...pages, ...players, ...clubs];
  }

  function searchResults(query) {
    const rows = search(query);
    return '<p class="rbs-search-count" role="status">' + (rows.length ? rows.length + ' results' : 'No matches. Try a surname, club or screen name.') + '</p>'
      + rows.map((r) => '<button class="rbs-search-result" data-action="careerResult" data-kind="' + r.type
        + '" data-v="' + esc(String(r.id)) + '"><span><b>' + esc(r.title) + '</b><small>' + esc(r.detail)
        + '</small></span><span aria-hidden="true">›</span></button>').join('');
  }

  function openSearch() {
    if (!active()) return;
    openModal('<section class="rbs-search"><h3>Find in your career</h3><label for="rbsCareerSearch">Player, club or screen</label>'
      + '<input id="rbsCareerSearch" type="search" autocomplete="off" placeholder="Try Bruno, training or save…">'
      + '<div id="rbsCareerResults">' + searchResults('') + '</div></section>');
    requestAnimationFrame(() => { const input = document.getElementById('rbsCareerSearch'); if (input) input.focus(); });
  }

  function navigate(key) {
    const route = ROUTES.find((r) => r[0] === key);
    if (!route || !active()) return;
    closeModal();
    if (route[3]) {
      if (route[2] === 'squad') UI.squadTab = route[3];
      else UI.clubTab = route[3];
    }
    ACTIONS.nav({ dataset: { v: route[2] } });
  }

  function guideRows(query) {
    const q = normalise(query);
    const rows = GUIDES.filter((row) => !q || normalise(row[1] + ' ' + row[3]).includes(q));
    return rows.length ? rows.map((r) => '<details class="rbs-guide-article"' + (q ? ' open' : '') + '><summary>'
      + esc(r[1]) + '</summary><p>' + esc(r[3]) + '</p><button class="btn btn-ghost" data-action="careerRoute" data-v="'
      + r[2] + '">Open ' + esc(ROUTES.find((route) => route[0] === r[2])[1]) + ' →</button></details>').join('')
      : '<p class="rbs-guide-empty">No guide matches that search. Try fitness, tactics, contract or save.</p>';
  }

  function openGuide() {
    openModal('<section class="rbs-guide"><span class="rbs-eyebrow">The manager’s handbook</span><h3>Make every decision count</h3>'
      + '<p class="rbs-guide-intro">Your squad, their readiness and your instructions shape the football.</p>'
      + '<label for="rbsGuideSearch">What would you like to understand?</label>'
      + '<input id="rbsGuideSearch" type="search" autocomplete="off" placeholder="Search the guide…">'
      + '<div id="rbsGuideArticles">' + guideRows('') + '</div></section>');
  }

  function tacticalBrief() {
    if (!active() || !G.tacs) return null;
    const t = G.tacs, shape = FORMATIONS[t.formation] || [];
    const players = shape.map((slot, i) => ({ p: playerById((t.xi || [])[i]), slot: slot[0] })).filter((r) => r.p);
    const tired = players.filter((r) => r.p.cond < 80);
    const workload = [t.press === 'High', t.tempo === 'Fast', t.counter === 'Counter-press'].filter(Boolean).length;
    const notes = [];
    if (workload >= 2) notes.push('A demanding plan: pressing and tempo will need fresh legs.'
      + (tired.length ? ' ' + tired.length + ' starters are below 80% condition.' : ' Keep rotation options ready.'));
    if (t.line === 'High') notes.push('Your high line leaves space behind. Watch the opposition’s runners and your defenders’ pace.');
    if (t.tackling === 'Aggressive') notes.push('Aggressive tackling increases the risk of cards. Watch players who are already booked.');
    const concerns = window.RBSPreparation ? window.RBSPreparation.read() : null;
    if (concerns && concerns.alerts.length) notes.push(concerns.alerts.length + ' selection concerns: review condition, availability and positional fit.');
    if (!notes.length) notes.push('A measured workload. Use the opposition report and match statistics to decide where to adjust.');
    return { formation: t.formation, without: t.formationOOP || t.formation, workload, notes,
      ball: [t.passStyle || 'Mixed', (t.tempo || 'Normal') + ' tempo', (t.width || 'Standard') + ' width'],
      defend: [(t.press || 'Medium') + ' press', (t.line || 'Standard') + ' line', t.counter || 'Drop off'] };
  }

  function briefHtml() {
    const b = tacticalBrief();
    if (!b) return '';
    const phase = (label, values) => '<div><h4>' + label + '</h4><p>' + values.map(esc).join(' · ') + '</p></div>';
    return '<section id="rbsTacticalBrief" class="sh-panel rbs-tactical-brief" aria-label="Your tactical brief">'
      + '<div class="sh-head"><span>Your tactical brief</span><button data-action="careerGuide">Understand tactics</button></div>'
      + '<div class="sh-body"><div class="rbs-tactical-phases">' + phase('With the ball · ' + b.formation, b.ball)
      + phase('Without the ball · ' + b.without, b.defend) + '</div><ul>'
      + b.notes.map((note) => '<li>' + esc(note) + '</li>').join('') + '</ul></div></section>';
  }

  function readiness(p) {
    if (!p || !active() || (p.club !== G.my && !p.scouted)) return null;
    const at = (G.tacs.xi || []).indexOf(p.id);
    const shape = FORMATIONS[G.tacs.formation] || [];
    const slot = at >= 0 && shape[at] ? shape[at][0] : p.pos;
    return { slot, ability: Math.round(ovrOf(p, slot)), effective: Math.round(calcEff(p, slot)),
      fit: posFitLabel(p, slot), condition: Math.round(p.cond || 0), sharpness: Math.round(p.sharp || 0), morale: Math.round(p.morale || 0) };
  }

  function addProfileReadiness(pid) {
    const p = playerById(pid), r = readiness(p), sheet = document.getElementById('sheetBody');
    if (!r || !sheet || sheet.querySelector('#rbsPlayerReadiness')) return;
    const anchor = sheet.querySelector('.rbs-compare-open');
    if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', '<section id="rbsPlayerReadiness" class="rbs-player-readiness" aria-label="Player match readiness">'
      + '<div class="rbs-readiness-score"><strong>' + r.effective + '<small>/100</small></strong><span>Effective at ' + esc(r.slot)
      + '</span></div><div><b>' + esc(r.fit) + ' in this position</b><p>Position ability ' + r.ability + ' · Condition ' + r.condition
      + '% · Sharpness ' + r.sharpness + '% · Morale ' + r.morale + '%</p><button data-action="careerGuide">What affects this rating?</button></div></section>');
  }

  function mount() {
    if (!active()) return;
    const view = document.getElementById('view'), page = PAGES[UI.view];
    if (!view || !page || view.querySelector('#rbsPageTools')) return;
    view.insertAdjacentHTML('afterbegin', '<header id="rbsPageTools" class="rbs-page-tools"><div><span class="rbs-eyebrow">'
      + esc(G.clubs[G.my].short || G.clubs[G.my].name) + '</span><h1>' + page[0] + '</h1><p>' + page[1]
      + '</p></div><div class="rbs-page-actions"><button data-action="careerSearch" aria-label="Search players, clubs and screens">Search</button>'
      + '<button data-action="careerGuide">Guide</button></div></header>');
    if (UI.view === 'tactics') {
      const pitch = view.querySelector('#tacPitch');
      if (pitch && !view.querySelector('#rbsTacticalBrief')) pitch.insertAdjacentHTML('afterend', briefHtml());
    }
  }

  ACTIONS.careerSearch = openSearch;
  ACTIONS.careerGuide = openGuide;
  ACTIONS.careerRoute = (el) => navigate(el.dataset.v);
  ACTIONS.careerResult = (el) => {
    if (el.dataset.kind === 'page') return navigate(el.dataset.v);
    closeModal();
    if (el.dataset.kind === 'player') ACTIONS.profile({ dataset: { id: el.dataset.v } });
    else if (el.dataset.kind === 'club') ACTIONS.clubView({ dataset: { id: el.dataset.v } });
  };
  document.addEventListener('input', (event) => {
    if (event.target.id === 'rbsCareerSearch') document.getElementById('rbsCareerResults').innerHTML = searchResults(event.target.value);
    if (event.target.id === 'rbsGuideSearch') document.getElementById('rbsGuideArticles').innerHTML = guideRows(event.target.value);
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && active()) {
      const match = document.getElementById('matchScreen');
      if (match && match.offsetParent !== null) return;
      event.preventDefault(); openSearch();
    }
  });

  function install() {
    const style = document.createElement('style'); style.id = 'rbs-manager-experience';
    style.textContent = `
.rbs-page-tools{grid-column:1/-1;order:-2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0 15px;margin-bottom:4px;min-width:0;border-bottom:1px solid var(--sh-line)}
.rbs-page-tools>div:first-child{min-width:0}.rbs-page-tools h1{font:800 clamp(22px,2.4vw,30px)/1.15 var(--body);letter-spacing:-.035em;margin:5px 0;color:#f2f4f7}
.rbs-page-tools p{font-size:13px;line-height:1.5;color:#a7afb9;margin:0}.rbs-eyebrow{font:800 10px/1.4 var(--body);letter-spacing:.15em;text-transform:uppercase;color:var(--sh-accent,#efb16d)}
.rbs-page-actions{display:flex;gap:6px;flex-shrink:0}.rbs-page-actions button,.rbs-tactical-brief button,.rbs-player-readiness button{border:1px solid var(--sh-line);background:rgba(255,255,255,.035);color:#e1e7ef;border-radius:9px;min-height:44px;padding:8px 12px;font:700 12px/1.3 var(--body);cursor:pointer}
.rbs-page-actions button:hover,.rbs-search-result:hover{background:rgba(255,255,255,.085)}
.rbs-page-tools button:focus-visible,.rbs-guide summary:focus-visible,.rbs-search-result:focus-visible,.rbs-tactical-brief button:focus-visible,.rbs-player-readiness button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.rbs-tactical-brief{grid-column:1/-1;margin:10px 0 14px;min-width:0}.rbs-tactical-brief .sh-head{line-height:1.4;flex-wrap:wrap}.rbs-tactical-brief .sh-head button{font-size:11px;letter-spacing:0;text-transform:none}
.rbs-tactical-phases{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.rbs-tactical-phases>div{border-left:2px solid var(--sh-accent);padding-left:10px}.rbs-tactical-phases h4{font-size:12px;margin:0 0 6px}.rbs-tactical-phases p{margin:0;color:#aeb8c4;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.rbs-tactical-brief ul{margin:14px 0 0;padding-left:17px;color:#b7c0ca;font-size:12px;line-height:1.6}.rbs-tactical-brief li+li{margin-top:5px}
.rbs-guide,.rbs-search{min-width:0}.rbs-guide h3,.rbs-search h3{font-size:24px;line-height:1.2;letter-spacing:-.025em;margin:8px 0 12px}.rbs-guide-intro{font-size:13px;line-height:1.6;color:#aeb8c4}
.rbs-guide label,.rbs-search label{display:block;font-size:12px;font-weight:700;margin:16px 0 7px}.rbs-guide input,.rbs-search input{box-sizing:border-box;width:100%;min-height:48px;border:1px solid #48505b;border-radius:10px;padding:12px;background:#10161e;color:#f0f3f7;font:inherit;font-size:16px}
.rbs-guide input:focus,.rbs-search input:focus{outline:2px solid var(--gold);outline-offset:2px}.rbs-guide-article{border-bottom:1px solid var(--sh-line);padding:5px 0}.rbs-guide-article summary{min-height:48px;box-sizing:border-box;padding:14px 4px;font-size:14px;font-weight:700;cursor:pointer;line-height:1.5}.rbs-guide-article p{font-size:14px;color:#b9c2cd;line-height:1.75;margin:0 4px 12px}.rbs-guide-article button{min-height:44px;margin:0 0 12px;white-space:normal}.rbs-guide-empty{font-size:14px;line-height:1.6;color:#b9c2cd}
.rbs-search-result{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:62px;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--sh-line);color:#eef2f7;padding:10px 4px;cursor:pointer}.rbs-search-result>span:first-child{min-width:0}.rbs-search-result b{display:block;font-size:14px;line-height:1.4;overflow-wrap:anywhere}.rbs-search-result small{display:block;font-size:12px;color:#a5b0be;line-height:1.5;margin-top:3px}.rbs-search-count{font-size:12px;line-height:1.5;color:#a5b0be;margin:12px 0}
.rbs-player-readiness{display:flex;align-items:center;gap:14px;padding:14px;background:linear-gradient(135deg,rgba(255,255,255,.045),rgba(0,0,0,.08));border:1px solid var(--sh-line);border-radius:12px;margin:12px 0;min-width:0}.rbs-readiness-score{min-width:76px;text-align:center}.rbs-readiness-score strong{font-size:30px;line-height:1.2;display:block;font-variant-numeric:tabular-nums}.rbs-readiness-score small{font-size:11px;color:#aeb8c4}.rbs-readiness-score span{font-size:10px;color:#aeb8c4}.rbs-player-readiness>div:last-child{min-width:0}.rbs-player-readiness b{font-size:12px}.rbs-player-readiness p{font-size:12px;line-height:1.65;color:#aeb8c4;margin:5px 0}.rbs-player-readiness button{font-size:11px;padding:8px;white-space:normal}
.rbs-portrait{object-fit:cover;box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 3px 10px rgba(0,0,0,.22)}
@media(max-width:540px){.rbs-page-tools{gap:8px;padding-bottom:11px}.rbs-page-tools h1{font-size:22px}.rbs-page-tools p{display:none}.rbs-page-actions button{padding:8px 10px}.rbs-tactical-phases{gap:10px}.rbs-player-readiness{padding:11px;gap:10px}}
@media(prefers-reduced-motion:reduce){.rbs-page-tools *,.rbs-search-result{transition:none!important}}
`;
    document.head.appendChild(style);
    const beforeRender = window.render;
    window.render = function renderManagerExperience() { const result = beforeRender.apply(this, arguments); mount(); return result; };
    const beforeProfile = window.openProfile;
    window.openProfile = function profileWithReadiness(pid) { const result = beforeProfile.apply(this, arguments); addProfileReadiness(pid); return result; };
    mount();
  }
  window.RBSExperience = Object.freeze({ search, navigate, tacticalBrief, readiness });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
