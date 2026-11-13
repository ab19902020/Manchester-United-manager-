/* global G, UI, ACTIONS, CC, W_LG, LEAGUES, leaguesOf, divMembers, esc, fmtM, fmtW, toast, mail,
          render, paintStart:writable, vClubCreate:writable, ccRepaintHero:writable, ccVictim:writable,
          installCustomClub:writable, newGame:writable, sackManager:writable, myDeal, mulberry, hashStr,
          windowOpen, wageFor, POSGROUP, clamp, irnd, playerById */

/* =====================================================================
   FOUND A CLUB ANYWHERE, AND DECIDE WHAT YOUR JOB IS
   ---------------------------------------------------------------------
   "the ultimate is to build your own club. You start from the lowest
   league in which country you like and work your way up and build your
   biggest club. You manage the club, you run the club as the director
   ... or you can just literally be the coach."

   1. WHERE. The builder always put a new club in the English fifth tier.
      It now offers every country in the game and puts the club at the
      bottom of that country's pyramid: five divisions to climb in
      England, two in the big four of Europe, and in the countries with a
      single division the climb is the continent. Money and reputation
      are scaled to the league the club actually starts in -- a founder
      in the Spanish second tier is not handed fifth-tier English money.

   2. WHAT YOU ARE. Four jobs, chosen at the start:

        Owner-manager   it is your club and your team: the money, the
                        ground and the borrowing are yours, and so is the
                        eleven. Nobody can sack you.
        Chairman        you run the club; your manager runs the team. You
                        sign the players and set the budgets; he picks the
                        side, takes training and faces the press.
        Manager         the classic job. The board holds the money and can
                        sack you.
        Head coach      the eleven, the tactics and the training ground.
                        A director of football does the recruiting, and the
                        board can still sack you.

      A founded club is yours by definition, so it offers the first two.

   An owner cannot be sacked, but an owner can run out of money, and that
   is handled in the Director's Office (src/directors-office.js).

   Nothing here touches a result. The jobs change who makes a decision,
   never how a match comes out.
   ===================================================================== */
(function founder() {
  'use strict';

  const KEY_CC = 'rbsFoundCountry';
  const KEY_ROLE_FOUND = 'rbsFoundRole';
  const KEY_ROLE_JOB = 'rbsJobRole';

  const ROLES = {
    owner: { icon: '🏠', name: 'Owner-manager', short: 'Owner-manager',
      line: 'Your club and your team. You run the money, the ground and the borrowing, and you pick the side. Nobody can sack you — but you can go bust.' },
    chairman: { icon: '💼', name: 'Chairman', short: 'Chairman',
      line: 'You run the club and sign the players. Your manager picks the side, runs training and faces the press.' },
    manager: { icon: '📋', name: 'Manager', short: 'Manager',
      line: 'The classic job: the team and the transfers. The board holds the money, and the board can sack you.' },
    coach: { icon: '🧢', name: 'Head coach', short: 'Head coach',
      line: 'The eleven, the tactics and the training ground. A director of football does the recruiting.' },
  };
  const FOUND_ROLES = ['owner', 'chairman'];
  const JOB_ROLES = ['manager', 'coach', 'owner', 'chairman'];

  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } };

  const state = {
    cc: read(KEY_CC, 'ENG'),
    foundRole: FOUND_ROLES.includes(read(KEY_ROLE_FOUND, 'owner')) ? read(KEY_ROLE_FOUND, 'owner') : 'owner',
    jobRole: JOB_ROLES.includes(read(KEY_ROLE_JOB, 'manager')) ? read(KEY_ROLE_JOB, 'manager') : 'manager',
  };

  /* ---- the countries, from the league table the world is built from ---- */
  function countries() {
    const by = {};
    (typeof W_LG !== 'undefined' ? W_LG : []).forEach((L) => {
      const row = by[L.cc] || (by[L.cc] = { cc: L.cc, country: L.country, tiers: 0, bottom: null, coef: 0 });
      row.tiers += 1;
      row.coef = Math.max(row.coef, L.coef || 0);
      if (!row.bottom || L.tier > row.bottom.tier) row.bottom = L;
    });
    if (by.ENG) { by.ENG.tiers += 1; by.ENG.coef = 5; }   /* the Premier Division is defined beside the table */
    return Object.values(by).sort((a, b) => b.tiers - a.tiers || b.coef - a.coef || a.country.localeCompare(b.country));
  }
  function country(cc) { return countries().find((c) => c.cc === cc) || countries().find((c) => c.cc === 'ENG'); }
  function climbLine(c) {
    if (c.tiers >= 3) return c.tiers + ' divisions to climb';
    if (c.tiers === 2) return 'two divisions, then Europe';
    return 'one division — the climb is Europe';
  }

  /* ---- 1. the builder screen ------------------------------------------ */
  function whereSection() {
    const here = country(state.cc);
    let h = '<div class="cc-lbl">Where</div><div class="fd-where">';
    countries().forEach((c) => {
      h += '<button class="chip' + (c.cc === here.cc ? ' on' : '') + '" data-action="fdCountry" data-v="' + esc(c.cc) + '">'
        + esc(c.country) + '</button>';
    });
    h += '</div><div class="xs faint" style="margin-top:6px;line-height:1.45">You start in the <b>'
      + esc(here.bottom.name) + '</b>, the bottom of ' + esc(here.country) + '’s pyramid — ' + esc(climbLine(here)) + '.</div>';
    return h;
  }

  function roleCards(list, current, action) {
    return list.map((id) => {
      const r = ROLES[id];
      return '<button class="cc-chair' + (current === id ? ' on' : '') + '" data-action="' + action + '" data-v="' + id + '">'
        + '<div class="t">' + r.icon + ' ' + esc(r.name) + '</div><div class="b">' + esc(r.line) + '</div></button>';
    }).join('');
  }

  /* The backers' cards were written for the English fifth tier, in pounds
     and English divisions. Abroad the money is scaled to the league the
     club joins, and that is not known until the world exists, so the
     cards say what it will be relative to the clubs you will meet. */
  function abroadBackers(h, here) {
    const lg = esc(here.bottom.name);
    const target = here.tiers > 1
      ? { gen: 'promotion', sen: 'promotion', tig: 'the top half' }
      : { gen: 'win the league', sen: 'the top three', tig: 'the top half' };
    const text = {
      gen: ['Money nobody else in the ' + lg + ' has. Promotion is the plan, and soon.', 'about twice the richest club\u2019s budget'],
      sen: ['Enough to take on anybody in the ' + lg + '. Not enough to buy it.', 'as much as the richest club in the ' + lg],
      tig: ['An ordinary budget for the ' + lg + ', and a whole squad to buy with it.', 'a mid-table budget for the ' + lg],
    };
    return h.replace(/(<button class="cc-chair[^"]*" data-action="ccChair" data-v="(gen|sen|tig)">[\s\S]*?<div class="b">)([\s\S]*?)(<\/div><div class="n">)([\s\S]*?)(<\/div><\/button>)/g,
      (all, a, id, b, c, d, e) => {
        const who = String(b).split('. ')[0];
        return a + who + '. ' + text[id][0] + c + text[id][1] + ' \u00b7 target: ' + target[id] + e;
      });
  }

  if (typeof vClubCreate === 'function') {
    const previous = vClubCreate;
    vClubCreate = function vClubCreateAnywhere() {
      let h = previous.apply(this, arguments);
      try {
        const here = country(state.cc);
        h = h.split(' · National Division</div>').join(' · ' + esc(here.bottom.name) + '</div>');
        h = h.replace('<div class="cc-lbl">The club</div>', whereSection() + '<div class="cc-lbl">The club</div>');
        if (here.cc !== 'ENG') h = abroadBackers(h, here);
        h = h.replace('<div class="cc-lbl">Who owns it</div>',
          '<div class="cc-lbl">Your job</div>' + roleCards(FOUND_ROLES, state.foundRole, 'fdFoundRole')
          + '<div class="cc-lbl">Who backs you</div>');
      } catch (e) { /* the old builder still works */ }
      return h;
    };
  }
  if (typeof ccRepaintHero === 'function') {
    const previous = ccRepaintHero;
    ccRepaintHero = function ccRepaintHeroAnywhere() {
      const r = previous.apply(this, arguments);
      try {
        const sub = document.querySelectorAll('.cc-hero .sub')[0];
        if (sub) sub.innerHTML = sub.innerHTML.replace('National Division', esc(country(state.cc).bottom.name));
      } catch (e) { /* unchanged */ }
      return r;
    };
  }

  /* and the job picker gets the same choice of jobs */
  if (typeof paintStart === 'function') {
    const previous = paintStart;
    paintStart = function paintStartWithRoles() {
      const r = previous.apply(this, arguments);
      try {
        if (CC && CC.on) return r;
        const host = document.getElementById('startBody');
        if (!host || host.querySelector('#fdJobRoles')) return r;
        const bar = host.querySelector('.cc-mode');
        const html = '<details id="fdJobRoles" class="fd-roles"' + (state.jobRole !== 'manager' ? ' open' : '') + '>'
          + '<summary>Your job: <b>' + esc(ROLES[state.jobRole].name) + '</b><span>change</span></summary>'
          + roleCards(JOB_ROLES, state.jobRole, 'fdJobRole') + '</details>';
        if (bar) bar.insertAdjacentHTML('afterend', html);
        else host.insertAdjacentHTML('afterbegin', html);
      } catch (e) { /* the picker still works */ }
      return r;
    };
  }

  ACTIONS.fdCountry = (el) => { state.cc = el.dataset.v; write(KEY_CC, state.cc); paintStart(); };
  ACTIONS.fdFoundRole = (el) => { state.foundRole = el.dataset.v; write(KEY_ROLE_FOUND, state.foundRole); paintStart(); };
  ACTIONS.fdJobRole = (el) => { state.jobRole = el.dataset.v; write(KEY_ROLE_JOB, state.jobRole); paintStart(); };

  /* ---- 2. placing the club --------------------------------------------- */
  function bottomLeague() {
    try {
      const keys = leaguesOf(state.cc) || [];
      const k = keys[keys.length - 1];
      if (k && (divMembers(k) || []).length >= 2) return k;
    } catch (e) { /* fall through */ }
    return 'NL';
  }

  function medianRevenue(league) { /* kept for the office's projections */
    try {
      const eco = window.RBSEconomy;
      const mem = (divMembers(league) || []).map((i) => G.clubs[i]).filter((c) => c && c.key !== '__CC__');
      const vals = mem.map((c) => eco.revenueFor(c, Math.ceil(mem.length / 2)).total).filter((v) => v > 0).sort((a, b) => a - b);
      return vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    } catch (e) { return 0; }
  }

  if (typeof ccVictim === 'function') {
    const previous = ccVictim;
    ccVictim = function ccVictimAnywhere() {
      const league = bottomLeague();
      if (league === 'NL') return previous.apply(this, arguments);
      const pool = G.clubs.filter((c) => c.league === league).sort((a, b) => (a.rep || 0) - (b.rep || 0));
      if (!pool.length) return previous.apply(this, arguments);
      const small = pool.slice(0, Math.min(6, Math.max(2, Math.floor(pool.length / 3))));
      const rng = mulberry(hashStr('victim|' + Date.now() + '|' + ((CC && CC.spec && CC.spec.name) || '')));
      return small[Math.floor(rng() * small.length)];
    };
  }

  if (typeof installCustomClub === 'function') {
    const previous = installCustomClub;
    installCustomClub = function installCustomClubAnywhere() {
      const ok = previous.apply(this, arguments);
      if (!ok) return ok;
      try {
        const c = G.clubs[G.my];
        const league = c.league;
        const L = (typeof LEAGUES !== 'undefined' && LEAGUES[league]) || {};
        /* the smallest club in the league it joins, a little smaller still */
        const others = (divMembers(league) || []).map((i) => G.clubs[i]).filter((x) => x && x !== c);
        const floor = others.length ? Math.min(...others.map((x) => x.rep || 0)) : 2000;
        c.rep = Math.round(Math.min(floor * 0.94, floor - 120));
        /* The backer's money, measured against the clubs in the league the
           club actually joins. The fifth-tier English figures were set by
           hand for that division and stay as they are; anywhere else a
           sensible backer matches the richest club in the division, a
           generous one has about twice that, and a tight one has the
           median. A founder has to buy a whole squad, so even the tight
           route is not poor -- it is ordinary. */
        if (league !== 'NL' && others.length) {
          const pick = (k) => others.map((x) => x[k] || 0).sort((a, b) => a - b);
          const med = (k) => { const v = pick(k); return v[v.length >> 1]; };
          const top = (k) => { const v = pick(k); return v[v.length - 1]; };
          const chair = (G.cc && G.cc.chair) || 'sen';
          const m = { gen: [2.0, 1.3, 1.3], sen: [1.1, 0.9, 1.0], tig: [1.0, 0.5, 1.1] }[chair] || [1.1, 0.9, 1.0];
          c.budget = Math.round(top('budget') * m[0]);
          c.bank = Math.round(med('bank') * m[1]);
          c.wageCap = Math.round((chair === 'tig' ? med('wageCap') : top('wageCap')) * m[2] / 500) * 500;
          G.cc.scale = +(c.budget / 3.2e6).toFixed(2);
        }
        G.cc.country = c.cc || state.cc;
        G.cc.league = league;
        const name = L.name || league;
        (G.inbox || []).forEach((m) => {
          ['title', 'body'].forEach((k) => {
            if (typeof m[k] === 'string') m[k] = m[k].split('National Division').join(name);
          });
          if (typeof m.body === 'string' && G.cc.scale) {
            m.body = m.body.replace(/<b>[^<]*<\/b> to spend, a wage ceiling of <b>[^<]*<\/b>/,
              '<b>' + fmtM(c.budget) + '</b> to spend, a wage ceiling of <b>' + fmtW(c.wageCap) + '</b>');
          }
        });
      } catch (e) { /* the club is placed either way */ }
      return ok;
    };
  }

  /* ---- 3. the job ----------------------------------------------------- */
  function role() { return (G && G.role) || 'manager'; }
  function isOwner() { return role() === 'owner' || role() === 'chairman'; }

  function annualRevenue(c) {
    try {
      const pos = Math.ceil((divMembers(c.league) || []).length / 2) || 10;
      return window.RBSEconomy.revenueFor(c, pos).total || 0;
    } catch (e) { return 0; }
  }

  function setUpRole(id, founded) {
    const c = G.clubs[G.my];
    G.role = id;
    G.owner = G.owner || {};
    if (id === 'owner' || id === 'chairman') {
      /* a founder's own fortune is what got the club started; somebody who
         buys an existing club has a fortune the size of a season's turnover */
      const fortune = founded ? Math.max(c.bank || 0, 250000) : Math.max(1e6, Math.round(annualRevenue(c) * 0.35));
      G.owner.wealth = Math.round(fortune);
      G.owner.since = G.season;
      G.owner.ticket = 0;
      G.owner.loans = [];
    }
    if (id === 'chairman') {
      G.delegate = Object.assign({}, G.delegate || {}, { lineup: true, press: true, training: true });
    }
    if (id === 'coach') {
      G.dof = { want: null, signed: 0 };
    }
    const r = ROLES[id];
    if (id !== 'manager') {
      const lines = {
        owner: 'It is your club. The <b>Director’s Office</b> on the Club screen is where the money is run: ticket prices, '
          + 'borrowing, your own money, the transfer budget and the wage ceiling. Nobody can sack you. '
          + 'If the club cannot pay its bills, though, it goes into administration — and that costs points.',
        chairman: 'You run the club from the <b>Director’s Office</b> on the Club screen, and you sign the players. '
          + 'Your manager names the side, runs training and takes the press conferences — you can take any of those back '
          + 'on the Staff screen.',
        coach: 'You have the dressing room, the tactics and the training ground. Recruitment belongs to the director of '
          + 'football: he signs players when the window is open, inside the budget. Tell him what you need on the Transfers screen.',
      };
      try { mail('board', r.icon + ' Your job: ' + r.name, lines[id]); } catch (e) { /* no inbox yet */ }
    }
  }

  if (typeof newGame === 'function') {
    const previous = newGame;
    newGame = function newGameWithRole() {
      const founding = !!(CC && CC.pending);
      const result = previous.apply(this, arguments);
      try {
        /* the roster preview builds a throwaway world; it has no job */
        if (G && G.clubs && G.clubs[G.my] && !G._rosterBuild) {
          const founded = !!(G.cc && G.cc.on);
          setUpRole(founded ? state.foundRole : (founding ? state.foundRole : state.jobRole), founded);
        }
      } catch (e) { /* the career still starts */ }
      return result;
    };
  }

  /* an owner is not sacked: the people with money in the club lose faith instead */
  if (typeof sackManager === 'function') {
    const previous = sackManager;
    sackManager = function sackManagerOwners() {
      if (!G || !isOwner()) return previous.apply(this, arguments);
      try {
        const c = G.clubs[G.my];
        const cut = Math.round((c.budget || 0) * 0.5);
        c.budget = Math.max(0, (c.budget || 0) - cut);
        c.patience = 45;
        mail('board', '📉 The backers have lost faith',
          'If you were anybody else you would be gone. It is your club, so you are not — but the people who put money '
          + 'in beside you have stopped. <b>' + fmtM(cut) + '</b> of the transfer budget has been taken back, and the club '
          + 'runs on what it earns until results turn.');
      } catch (e) { /* nothing lost */ }
      return undefined;
    };
  }

  /* ---- 4. the director of football, for a head coach ------------------ */
  function needGroup(club) {
    const groups = ['GK', 'D', 'M', 'A'];
    return groups.map((g) => {
      const ps = club.players.filter((p) => !p.loan && POSGROUP(p.pos) === g).sort((a, b) => b.ovr - a.ovr);
      const top = ps.slice(0, g === 'GK' ? 1 : 4);
      return { g, avg: top.reduce((s, p) => s + p.ovr, 0) / Math.max(1, top.length), n: ps.length };
    }).sort((a, b) => a.avg - b.avg);
  }

  function dofTick() {
    if (role() !== 'coach' || !windowOpen()) return null;
    const my = G.clubs[G.my];
    if (!my || (my.players || []).length >= 28) return null;
    const groups = needGroup(my);
    const want = G.dof && G.dof.want;
    const need = (want && groups.find((x) => x.g === want)) || groups[0];
    const wages = my.players.reduce((s, p) => s + (p.wage || 0), 0);
    let best = null, bestScore = -1;
    G.clubs.forEach((seller) => {
      if (seller.i === G.my) return;
      const gap = (seller.rep || 0) - (my.rep || 0);
      if (gap > 3200) return;
      seller.players.forEach((p) => {
        if (p.loan || POSGROUP(p.pos) !== need.g || p.ovr < need.avg + 2) return;
        if (typeof window.windowId === 'function' && p.movedWindow === window.windowId()) return;
        const settled = p.morale >= 55 && !p.listed && p.contract >= 2;
        if (p.ovr >= 80 && gap > 900 && settled) return;
        if (p.ovr >= 76 && gap > 1800 && settled) return;
        const fee = Math.round(p.value * (p.listed ? 0.95 : 1.12));
        if (fee > (my.budget || 0) || fee > Math.max(0, my.bank || 0)) return;
        const wage = wageFor(p.ovr, my.rep);
        if (wages + wage > (my.wageCap || 0)) return;
        const key = seller.players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3).includes(p);
        if (key && !p.listed) return;
        const score = p.ovr - fee / 2e7 - Math.max(0, p.age - 29) * 0.6;
        if (score > bestScore) { bestScore = score; best = { p, seller, fee, wage }; }
      });
    });
    if (!best) return null;
    const { p, seller, fee, wage } = best;
    seller.players = seller.players.filter((x) => x.id !== p.id);
    p.club = G.my; p.listed = false; p.contract = irnd(2, 4); p.wage = wage;
    p.morale = clamp((p.morale || 60) + 10, 1, 100); p.scouted = true;
    if (typeof window.windowId === 'function') p.movedWindow = window.windowId();
    my.players.push(p);
    my.budget -= fee; my.bank -= fee; seller.bank += fee;
    seller.budget = (seller.budget || 0) + Math.round(fee * 0.7);
    G.dof.signed = (G.dof.signed || 0) + 1;
    if (G.dof.want === need.g) G.dof.want = null;
    mail('transfer', '✍️ Your director of football has signed ' + p.name,
      '<b>' + esc(p.name) + '</b> (' + p.pos + ', ' + p.age + ', rated ' + p.ovr + ') joins from ' + esc(seller.name)
      + ' for <b>' + fmtM(fee) + '</b> on <b>' + fmtW(wage) + '</b>. He was the best ' + ({ GK: 'goalkeeper', D: 'defender', M: 'midfielder', A: 'attacker' })[need.g]
      + ' the budget could reach.');
    return p;
  }

  /* A NEW CLUB THAT REACHES MATCHDAY WITHOUT A SQUAD. A club that has
     signed nobody by the eve of its first game used to arrive at it with
     two academy boys and the referee refusing to start -- and nothing on
     the screen could get past him, because the only fix was a squad that
     did not exist. A real club in that position fulfils the fixture with
     whoever will sign: the staff take the cheapest free agents on the
     list until there are sixteen senior players, two of them keepers, and
     say so. Nobody good is on that list for nothing, so it is a fixture
     fulfilled, not a squad built. */
  function fulfilFixture() {
    if (!(G.cc && G.cc.on) || typeof window.ccAgents !== 'function') return 0;
    const my = G.clubs[G.my];
    const next = typeof window.nextUserFixture === 'function' ? window.nextUserFixture() : null;
    if (!next || next.day - G.day > 1) return 0;
    const seniors = () => my.players.filter((p) => !p.loan && !p.youth);
    if (seniors().length >= 16) return 0;
    const list = window.ccAgents().slice().sort((a, b) => a.ask - b.ask);
    const signed = [];
    const take = (a) => {
      const p = a.p;
      p.club = G.my; p.wage = a.ask; p.contract = 1; p.listed = false; delete p.askWage;
      my.players.push(p); signed.push(p);
    };
    const keepers = () => seniors().filter((p) => p.pos === 'GK').length;
    list.filter((a) => a.p.pos === 'GK').slice(0, Math.max(0, 2 - keepers())).forEach(take);
    list.filter((a) => a.p.club === -1).forEach((a) => { if (seniors().length < 16) take(a); });
    if (!signed.length) return 0;
    try { G.tacs.xi = window.autoPick(G.my, G.tacs.formation); } catch (e) { /* picked on the day */ }
    mail('board', '\uD83D\uDCCB The staff signed ' + signed.length + ' players to fulfil the fixture',
      'The club was going to its first game without a team, so the staff did what a club in that position does: they rang round '
      + 'and signed the cheapest free agents who would come, on one-year deals, until there were enough to start a match. '
      + '<br><br>' + signed.map((p) => esc(p.name) + ' (' + p.pos + ', ' + p.ovr + ')').join(', ')
      + '<br><br>It is a team in the sense that there are eleven of them. Building a squad is still your job.');
    return signed.length;
  }

  let lastWeek = null;
  if (typeof window.dailyTickCore === 'function') {
    const previous = window.dailyTickCore;
    window.dailyTickCore = function dailyTickFounder() {
      const r = previous.apply(this, arguments);
      try {
        if (G && G.clubs && G.clubs[G.my]) {
          /* an owner's contract does not run out */
          if (isOwner() && typeof myDeal === 'function') { const d = myDeal(); if (d && d.left < 3) d.left = 3; }
          const wk = Math.floor(G.day / 7);
          if (wk !== lastWeek) { lastWeek = wk; dofTick(); }
          fulfilFixture();
        }
      } catch (e) { /* the day still passes */ }
      return r;
    };
  }

  /* the head coach can only ask */
  ['submitBid', 'faSign'].forEach((name) => {
    const previous = ACTIONS[name];
    if (typeof previous !== 'function') return;
    ACTIONS[name] = function coachCannotBuy() {
      if (G && role() === 'coach') { toast('Recruitment is the director of football’s job — tell him what you need'); return undefined; }
      return previous.apply(this, arguments);
    };
  });
  ACTIONS.dofWant = (el) => {
    if (!G || role() !== 'coach') return;
    G.dof = G.dof || {};
    G.dof.want = el.dataset.v || null;
    toast(G.dof.want ? 'He will look for a ' + ({ GK: 'goalkeeper', D: 'defender', M: 'midfielder', A: 'forward' })[G.dof.want] + ' first' : 'He will judge it himself');
    render();
  };

  function mount() {
    if (!G || !G.clubs || !G.clubs[G.my] || role() !== 'coach' || UI.view !== 'transfers') return;
    const view = document.getElementById('view');
    if (!view || view.querySelector('#fdDof')) return;
    const want = (G.dof && G.dof.want) || '';
    const chip = (v, t) => '<button class="chip' + (want === v ? ' on' : '') + '" data-action="dofWant" data-v="' + v + '">' + t + '</button>';
    view.insertAdjacentHTML('afterbegin', '<div class="card fd-dof" id="fdDof"><span class="rbs-eyebrow">Director of football</span>'
      + '<h4>Recruitment is his job</h4><p>He signs players while the window is open, inside the budget of <b>'
      + fmtM(G.clubs[G.my].budget) + '</b>. ' + (windowOpen() ? 'The window is open.' : 'The window is shut.')
      + ' Signed so far: <b>' + ((G.dof && G.dof.signed) || 0) + '</b>.</p><div class="cc-chips">'
      + chip('', 'Your call') + chip('GK', 'A keeper') + chip('D', 'A defender') + chip('M', 'A midfielder') + chip('A', 'A forward')
      + '</div></div>');
  }

  /* ---- the badge of office, in the header ----------------------------- */
  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-founder';
    style.textContent = `
.fd-where{display:flex;flex-wrap:wrap;gap:6px}
.fd-roles{margin:0 0 12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.03);padding:0 10px}
.fd-roles summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;min-height:44px;font-size:13px}
.fd-roles summary::-webkit-details-marker{display:none}
.fd-roles summary span{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
.fd-roles[open]{padding-bottom:4px}
.fd-dof{margin-bottom:12px}.fd-dof h4{font-size:17px;margin:6px 0 4px}.fd-dof p{font-size:13px;color:#aeb8c4;margin:0 0 10px;line-height:1.5}
`;
    document.head.appendChild(style);
    const before = window.render;
    if (typeof before === 'function') {
      window.render = function renderFounder() {
        const r = before.apply(this, arguments);
        try { mount(); } catch (e) { /* drawn either way */ }
        return r;
      };
    }
  }

  window.RBSFounder = Object.freeze({ countries, ROLES, role, isOwner, setUpRole, dofTick, fulfilFixture, state, annualRevenue });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
