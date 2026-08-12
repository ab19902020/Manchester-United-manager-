/* global ACTIONS, G, UI, $, esc, toast, render, mail, playerById, clamp, pick,
          fmtM, fmtW, fmtDateShort, valueFor, clubTier, fixturesOn, tiesOn,
          LEAGUES, leaguesOf, divMembers, gamesPlayed, formAvg, expectedWage,
          loanStanding, blockingMails, closeMail, openModal, closeModal,
          mailFrom, mailPriority, freezeMailOrder, unreadMails, mulberry, hashStr,
          roleLabel, SQUAD_ROLES, MAIL_ICON, MatchSim, WEEKS_IN_YEAR */
/* global openContractSheet:writable, loanTerms:writable, loanFeeFor:writable,
          rumourMill:writable, dailyTickCore:writable, weeklyTraining:writable,
          renderMailbox:writable, mailListFresh:writable, mailList:writable, roleOf:writable,
          loadSlot:writable, newGame:writable, fastSim:writable */

/* =====================================================================
   GAMEPLAY BALANCE — six things the game got wrong away from the pitch
   ---------------------------------------------------------------------
   Everything here is loaded after the game and patches it in place, for
   one reason: red-devil-manager.html is three megabytes of appended
   layers and two other agents are working in it this week. One script
   tag is the whole footprint in that file.

     1. THE MINUTES LOOP. Every player you had not explicitly given a
        role to was treated as a promised "squad player" — forty-two per
        cent of the matches — so a National League club that had just
        signed twenty free agents was in breach of twenty promises it
        never made. The complaint mail is typed 'board', which is a
        BLOCKING type, and weeklyTraining can raise a fresh one every
        Monday. Answering it moved one player's morale and changed
        nothing else, so the next Monday raised another. That is the
        loop you cannot get out of. And none of it waited for a season
        to happen first: five matches in, a squad of twenty had eleven
        men with a grievance and no manager alive could have answered
        it.

     2. LOAN FEES. loanTerms priced a season loan at max(£200,000, 7% of
        value) rounded to £100,000. A National League club with a
        £150,000 transfer budget was quoted £200,000 for everybody, so
        the loan market — the one market that exists for a small club —
        was shut. (wB6_finance already fixed loanFeeFor, the OTHER loan
        path, and the fee inside loanTerms was missed.)

     3. GOAL BONUSES. The contract sheet opens with £5,000 a goal typed
        into it whoever you are. That is a Premier League number on a
        non-league contract, where the going rate is nearer fifty
        pounds.

     4. THE TRANSFER NEWS. rumourMill only ever looked at players rated
        76 or better, skipped League Two and the National League
        entirely, and only ever picked a suitor from the Premier League
        or Europe. Whoever you manage, your inbox is Arsenal and
        Manchester United.

     5. CARDS. The suspension itself was right — two matches for a
        straight red, one for two yellows, one every fifth booking. It
        was then cancelled before it was ever served: finish() sets the
        ban during the match, and afterRound() decrements every ban at
        every club that played that day, including the one that has
        just been handed out. A red card cost nothing.

     6. WAGE RISES. A renewal at ten thousand a week more came out of
        nowhere. The game already prices a year of wages against a fee —
        the budget slider trades them at fifty-two weeks — so a rise is
        funded the same way.

   And the inbox, which is where five of those six things reach you, is
   given filters, previews and a reason to open it.
   ===================================================================== */

(function gameplayBalance() {
  'use strict';

  const has = (name) => typeof name === 'function';
  const world = () => (typeof G !== 'undefined' && G && Array.isArray(G.clubs) ? G : null);
  const myClub = () => { const g = world(); return g ? g.clubs[g.my] : null; };

  function guard(context, fn) {
    return function guarded() {
      try { return fn.apply(this, arguments); } catch (error) {
        try { console.error(`[balance: ${context}]`, error); } catch (ignored) { /* no console */ }
        return undefined;
      }
    };
  }

  /* ===================================================================
     1. SQUAD UNREST — a conversation, not a weekly toll gate
     =================================================================== */

  /* What a role is worth in appearances, from the game's own table. */
  function roleShare(key) {
    const row = (SQUAD_ROLES || []).find((r) => r[0] === key);
    return row ? row[2] : 0.42;
  }

  const ROLE_LADDER = ['pro', 'rot', 'squad', 'imp', 'star'];

  /* The role a player would assume from where he stands in the squad.
     newGame() hands these out at the start of a career and then nothing
     ever does it again, so every player signed afterwards inherited the
     'squad' default and its forty-two per cent. A twentieth-choice
     signing does not think he was promised half the season. */
  function standingRole(p, club) {
    const c = club || (world() && G.clubs[p.club]);
    if (!c || !Array.isArray(c.players)) return 'squad';
    const senior = c.players.filter((x) => !x.youth && !x.loan).sort((a, b) => b.ovr - a.ovr);
    const ix = senior.indexOf(p);
    if (ix < 0) return 'squad';
    return ix < 3 ? 'star' : ix < 9 ? 'imp' : ix < 15 ? 'squad' : ix < 19 ? 'rot' : 'pro';
  }

  if (has(roleOf)) {
    roleOf = function roleOfStanding(p) {
      if (!p) return 'squad';
      if (p.role) return p.role;
      try { return standingRole(p); } catch (error) { return 'squad'; }
    };
  }

  /* Everybody who plays for you has a date they walked in, so a player
     signed on Friday cannot complain about Saturday. Stamped passively
     rather than in completeSigning, because there are four separate
     routes into a squad — a fee, a free, a loan and the academy. */
  function stampArrivals() {
    const c = myClub();
    if (!c || !Array.isArray(c.players)) return;
    c.players.forEach((p) => { if (p.joined == null) p.joined = G.day; });
  }

  /* An old save can be stuck mid-loop: a blocking 'wants a word' that
     regenerates every week, and _pending flags left on players whose
     mail was ignored rather than answered. Both are cleared once. */
  function repairStuckUnrest() {
    const g = world();
    if (!g || g._unrestRepaired) return;
    g._unrestRepaired = 1;
    let closed = 0;
    (g.inbox || []).forEach((m) => {
      if (!m.actions || !m.actions.some((a) => a.act === 'roleTalk')) return;
      m.actions = null; m.must = false; m.read = true;
      closed += 1;
    });
    (g.clubs || []).forEach((c) => (c.players || []).forEach((p) => { if (p._pending) p._pending = false; }));
    if (closed) {
      mail('squad', '👕 Squad matters settled',
        `The ${closed} outstanding conversation${closed > 1 ? 's' : ''} about playing time ${closed > 1 ? 'have' : 'has'} been closed off. ` +
        'Squad unrest is handled differently now: a player will come to you at most once every three months, ' +
        'it will not hold up the season, and you can tell him honestly what he is at this club rather than ' +
        'promising him minutes you have no intention of giving him.');
    }
  }

  /* A squad conversation is squad business. It belongs in the inbox
     next to everything else, not in front of the Continue button. */
  try { if (typeof MAIL_ICON !== 'undefined' && !MAIL_ICON.squad) MAIL_ICON.squad = '👕'; } catch (error) { /* no icon table */ }

  const UNREST_CLUB_GAP = 28;   /* days between any two conversations */
  const UNREST_PLAYER_GAP = 84; /* days before the same man knocks again */
  const UNREST_SETTLE = 56;     /* days at the club before he has a case */
  const PROMISE_DAYS = 84;      /* how long you have to make good on one */
  const UNREST_SEASON_OPENS = 1 / 3; /* how far in before anyone has a case at all */

  /* How long a league season is where you manage, so that "a third of
     the way in" means the same thing in a thirty-eight match Premier
     League and a forty-six match National League. Divisions of twelve
     or fewer play each other three times rather than twice, which is
     the difference between a thirty-three match season and a
     twenty-two match one. */
  function seasonMatches() {
    try {
      const n = (divMembers(G.clubs[G.my].league) || []).length;
      if (n >= 2) return (n - 1) * (n <= 12 ? 3 : 2);
    } catch (error) { /* fall back below */ }
    return 38;
  }

  function unrestCandidates() {
    const c = myClub();
    if (!c) return [];
    const played = gamesPlayed(G.my);
    /* Nobody has a grievance about minutes two games into a season.
       You have to have had a real chance to spread them around first,
       and that is a third of the campaign — not a fixed number of
       matches, which means something different in every division. */
    if (played < Math.ceil(seasonMatches() * UNREST_SEASON_OPENS)) return [];
    const out = [];
    (c.players || []).forEach((p) => {
      if (p.loan || p.loanIn || p.youth || p.injury || p.susp > 0) return;
      if (G.day - (p.joined == null ? 0 : p.joined) < UNREST_SETTLE) return;
      if (G.day - (p.unrestDay || -9999) < UNREST_PLAYER_GAP) return;
      if ((p.morale || 60) >= 45) return;
      const want = roleShare(roleOf(p));
      const share = (p.stats && p.stats.apps ? p.stats.apps : 0) / played;
      /* A quarter of the season below what his role implies, or less
         than half of it — the second one matters at the bottom of the
         squad, where a flat quarter means a rotation player could never
         have a grievance however little he played. */
      if (share >= Math.max(want * 0.45, want - 0.25)) return;
      out.push({ p, gap: want - share });
    });
    return out.sort((a, b) => b.gap - a.gap || a.p.morale - b.p.morale);
  }

  function raiseUnrest() {
    const g = world();
    if (!g || g.sacked) return;
    /* a conversation you never had is a conversation that has gone
       stale — otherwise ignoring one silences the squad forever */
    (g.inbox || []).forEach((m) => {
      if (m.unrest && m.actions && G.day - m.day > 21) { m.actions = null; m.read = true; }
    });
    if (G.day - (g.unrestDay || -9999) < UNREST_CLUB_GAP) return;
    if ((g.inbox || []).some((m) => m.unrest && m.actions && m.actions.length)) return;
    const cand = unrestCandidates();
    if (!cand.length) return;
    const p = cand[0].p;
    const honest = standingRole(p, myClub());
    const played = gamesPlayed(G.my);
    const apps = (p.stats && p.stats.apps) || 0;

    const body = `<b>${esc(p.name)}</b> has knocked on your door. He has played <b>${apps}</b> of the club's ` +
      `<b>${played}</b> matches and he believes he is a <b>${roleLabel(roleOf(p)).toLowerCase()}</b> here.` +
      '<br><br>You can promise him the football he is asking for — and he will hold you to it. ' +
      'You can tell him honestly what he actually is in this squad, which he will not enjoy hearing but ' +
      'will not come back to. Or you can tell him to earn it, which works on the ones with the character for it ' +
      'and turns the rest against you.';

    mail('squad', `😤 ${p.name} wants a word`, body, [
      { lbl: atTheTop(p) ? 'Promise him he stays your first name on the teamsheet'
        : `Promise him ${roleLabel(promotedRole(p)).toLowerCase()} football`,
      act: 'unrestTalk', arg: `promise:${p.id}` },
      { lbl: `Be straight — he is a ${roleLabel(honest).toLowerCase()}`, act: 'unrestTalk', arg: `honest:${p.id}` },
      { lbl: 'Tell him to earn it', act: 'unrestTalk', arg: `earn:${p.id}`, ghost: 1 },
    ]);
    const raised = (G.inbox || [])[0];
    if (raised) raised.unrest = 1;
    p.unrestDay = G.day;
    g.unrestDay = G.day;
  }

  function promotedRole(p) {
    const ix = ROLE_LADDER.indexOf(roleOf(p));
    return ROLE_LADDER[Math.min(ROLE_LADDER.length - 1, (ix < 0 ? 2 : ix) + 1)];
  }

  /* A star player is already at the top of the ladder, so there is no rung
     to promise him. The promise is still real — it commits you to the
     minutes and he will hold you to them — but offering to "promise him
     star player football" to the man who is already your star player reads
     like the game is not listening. */
  function atTheTop(p) {
    return roleOf(p) === ROLE_LADDER[ROLE_LADDER.length - 1];
  }

  ACTIONS.unrestTalk = guard('unrestTalk', (el) => {
    const parts = String((el && el.dataset && el.dataset.arg) || '').split(':');
    const kind = parts[0];
    const p = playerById(parts[1]);
    const c = myClub();
    if (p && c) {
      if (kind === 'promise') {
        p.role = promotedRole(p);
        p.roleSince = G.day;
        p.promise = { role: p.role, until: G.day + PROMISE_DAYS, apps0: (p.stats && p.stats.apps) || 0, games0: gamesPlayed(G.my) };
        p.morale = clamp(p.morale + 15, 1, 100);
        toast(`🤝 He left happy — and he will be counting the games`);
      } else if (kind === 'honest') {
        const real = standingRole(p, c);
        p.role = real;
        p.roleSince = G.day;
        p.promise = null;
        /* A professional would rather be told where he stands than be
           strung along, and the ones with the character take it best. */
        const takesIt = (p.pressure || 10) >= 11 || (p.loyalty || 10) >= 13;
        p.morale = clamp(p.morale + (takesIt ? 4 : -6), 1, 100);
        toast(takesIt ? '👍 He respected the honesty' : `😐 He did not like it, but he knows where he stands`);
      } else {
        if ((p.pressure || 10) >= 13) {
          p.morale = clamp(p.morale + 6, 1, 100);
          p.sharp = clamp(p.sharp + 5, 0, 100);
          toast('💪 He took it as a challenge');
        } else {
          p.morale = clamp(p.morale - 10, 1, 100);
          if (Math.random() < 0.35) p.listed = true;
          toast('😠 He stormed out');
        }
      }
      p.unrestDay = G.day;
      p._pending = false;
    }
    if (has(closeMail)) closeMail(el, 'You spoke to him.');
    closeModal();
    render();
  });

  /* A promise you keep is worth something and a promise you break costs
     you. Without this, "promise more minutes" was a button that added
     sixteen morale and changed nothing about the football. */
  /* A PROMISE CANNOT BE BROKEN AGAINST MATCHES HE COULD NOT PLAY IN.

     Reported: an injured player complaining he is not getting minutes.
     Every other complaint in the game checks `p.injury` — the unrest
     sweep, the original weekly grumble, the morale drip — but the promise
     settlement did not check it anywhere. Promise a man he will start,
     watch him do a hamstring in October, and in January he loses sixteen
     morale, has a 45% chance of asking for the transfer list, and writes
     to say "you gave me your word" about eleven matches he spent on
     crutches.

     Two changes. While he is actually in the treatment room the promise
     is not judged at all — it waits until he is fit enough for the answer
     to mean something. And the days he spent injured inside the window
     come off what he could reasonably have played, so the share is
     measured against the football that was available to him. */
  const PROMISE_MIN_GAMES = 3;   /* below this there is nothing to judge */

  function availableGames(pr, games) {
    const out = (pr && pr.out) || 0;
    if (out <= 0) return games;
    const share = clamp(1 - out / PROMISE_DAYS, 0, 1);
    return games * share;
  }

  /* The days a promised player spends injured, counted as they happen —
     the weekly pass is the only thing that runs often enough to see them
     and cheap enough to do it on every player. */
  const WEEK = 7;

  function countTimeOut() {
    const c = myClub();
    if (!c) return;
    (c.players || []).forEach((p) => {
      if (p.promise && p.injury) p.promise.out = (p.promise.out || 0) + WEEK;
    });
  }

  function settlePromises() {
    const c = myClub();
    if (!c) return;
    const played = gamesPlayed(G.my);
    (c.players || []).forEach((p) => {
      const pr = p.promise;
      if (!pr || G.day < pr.until) return;
      /* still injured: the promise waits rather than being lost */
      if (p.injury) { pr.until = G.day + 14; return; }
      const rawGames = Math.max(1, played - (pr.games0 || 0));
      const games = availableGames(pr, rawGames);
      /* he was hurt for most of it — there is no case to answer */
      if (games < PROMISE_MIN_GAMES) { pr.until = G.day + 21; return; }
      p.promise = null;
      const apps = ((p.stats && p.stats.apps) || 0) - (pr.apps0 || 0);
      const share = apps / games;
      const want = roleShare(pr.role);
      if (share >= want - 0.15) {
        p.morale = clamp(p.morale + 10, 1, 100);
        p.loyalty = clamp((p.loyalty || 10) + 1, 1, 20);
        return;
      }
      p.morale = clamp(p.morale - 16, 1, 100);
      p.unrestDay = G.day;
      if (Math.random() < 0.45) p.listed = true;
      const missed = Math.round(rawGames - games);
      mail('squad', `😠 ${p.name}: "You gave me your word"`,
        `You told <b>${esc(p.name)}</b> he would be a <b>${roleLabel(pr.role).toLowerCase()}</b> here. ` +
        `Since that conversation he has played <b>${apps}</b> of the <b>${Math.round(games)}</b> ` +
        `matches he was fit for` +
        (missed > 0 ? `, with <b>${missed}</b> more missed through injury` : '') + '.' +
        `<br><br>${p.listed ? 'He has asked to be put on the transfer list.' : 'He has not asked to leave. Yet.'}`);
    });
  }

  /* The original weekly pass raises the mail itself, and it is buried
     inside a wrapper that cannot be unwrapped. Its own guard is
     `!p._pending`, so flagging everybody for the duration of the call
     leaves the morale arithmetic — which is good — running exactly as
     it was, and takes only the mail away from it. */
  if (has(weeklyTraining)) {
    const previousWeekly = weeklyTraining;
    /* The complaint mail is gated on a third of the season. The silent
       morale drip underneath it was not: `weeklyTraining` takes 2.4 a week
       off anybody below his role's share from the fifth match onwards, so
       a player was being quietly ground down for weeks before he was
       allowed to say anything about it — and five matches is a different
       fraction of a 46-game season than of a 38-game one. The drip is
       reversed, exactly, until the same gate opens. */
    function wouldDrip(p) {
      return guard('drip.test', () => {
        if (p.loan || p.youth || p.injury) return false;
        const roles = (typeof SQUAD_ROLES !== 'undefined') ? SQUAD_ROLES : null;
        if (!roles) return false;
        const c = myClub();
        const played = Math.max(1, (c.players || []).reduce((n, x) => Math.max(n, (x.stats && x.stats.apps) || 0), 0));
        const row = roles.find((r) => r[0] === roleOf(p)) || roles[2];
        const want = row[2];
        return ((p.stats && p.stats.apps) || 0) / played < want - 0.22;
      }, false)();
    }

    weeklyTraining = function weeklyTrainingBalanced() {
      const c = myClub();
      const marked = [];
      if (c) (c.players || []).forEach((p) => { if (!p._pending) { p._pending = true; marked.push(p); } });

      const early = guard('drip.gate', () => gamesPlayed(G.my) < Math.ceil(seasonMatches() * UNREST_SEASON_OPENS), false)();
      const owed = [];
      if (early && c) {
        (c.players || []).forEach((p) => {
          if (!wouldDrip(p)) return;
          const before = p.morale == null ? 60 : p.morale;
          owed.push([p, before - clamp(before - 2.4, 1, 100)]);
        });
      }

      try {
        return previousWeekly.apply(this, arguments);
      } finally {
        marked.forEach((p) => { p._pending = false; });
        /* give back exactly what the drip took, and nothing else */
        owed.forEach(([p, taken]) => { if (taken > 0) p.morale = clamp(p.morale + taken, 1, 100); });
        guard('unrest.weekly', () => { countTimeOut(); stampArrivals(); settlePromises(); raiseUnrest(); })();
      }
    };
  }

  /* ===================================================================
     2. WHAT A SEASON LOAN COSTS
     =================================================================== */

  /* Seven per cent of a player's value is the right shape and it was
     never the problem. The problems were a floor written for the
     Premier League, a rounding step of £100,000 that turns every small
     number into the same number, and no reference at all to whether the
     club doing the borrowing could pay it. A lending club also charges
     a big borrower more than a small one, and the old multiplier had
     that exactly the wrong way round. */
  function loanFeeQuote(p) {
    const me = myClub();
    if (!me || !p) return 0;
    const value = p.value || valueFor(p);

    let rate = 0.055;
    if (p.age <= 21) rate = 0.012;        /* a development loan: they want him playing */
    else if (p.age <= 23) rate = 0.025;

    try {
      const st = has(loanStanding) ? loanStanding(p) : null;
      if (st && st.rank >= 16) rate *= 0.55;  /* nowhere near their side */
    } catch (error) { /* standing unavailable */ }
    if (p.listed) rate *= 0.5;

    /* 0 = a small club, 4 = one of the biggest in the world. A lending
       club charges Manchester United and lets a National League side
       have him for the wages — the old multiplier had this backwards
       and billed the small club eighteen per cent more. */
    let k = 2;
    try { k = clubTier(me).k; } catch (error) { k = 2; }
    rate *= 0.45 + k * 0.19;

    const fee = value * rate;

    /* below this it is not worth drawing up a contract for, and it is
       priced off who is borrowing: two thousand pounds is a real fee in
       the National League and rounding error in the Premier League */
    if (fee < 2000 * (1 + k * 3)) return 0;

    const step = fee >= 1e6 ? 5e4 : fee >= 1e5 ? 1e4 : fee >= 1e4 ? 1000 : 250;
    return Math.round(fee / step) * step;
  }

  if (has(loanTerms)) {
    const previousTerms = loanTerms;
    loanTerms = function loanTermsPriced(p) {
      const t = previousTerms.apply(this, arguments);
      try { if (t) t.fee = loanFeeQuote(p); } catch (error) { /* keep the original quote */ }
      return t;
    };
  }

  if (has(loanFeeFor)) {
    const previousLoanFee = loanFeeFor;
    loanFeeFor = function loanFeeForPriced(p, from) {
      try { return loanFeeQuote(p); } catch (error) { return previousLoanFee.call(this, p, from); }
    };
  }

  /* "£0" is a number. "Free" is what the deal actually is. Rewritten in
     the sheet after it opens rather than in four different builders. */
  function dressFreeLoans() {
    const host = $('#sheetBody');
    if (!host) return;
    host.querySelectorAll('.stadstat').forEach((box) => {
      const label = box.querySelector('.ss-l');
      const value = box.querySelector('.ss-v');
      if (!label || !value) return;
      if (label.textContent.trim() !== 'Loan fee') return;
      if (value.textContent.trim() !== '£0') return;
      value.textContent = 'Free';
    });
    host.querySelectorAll('.bd').forEach((row) => {
      if (row.innerHTML.indexOf('£0 + ') === 0) row.innerHTML = row.innerHTML.replace('£0 + ', 'no fee · ');
    });
    host.querySelectorAll('[data-action="loanInDo"]').forEach((btn) => {
      if (btn.textContent.indexOf('— £0') >= 0) btn.textContent = btn.textContent.replace('— £0', '— no fee');
    });
  }

  ['loanAsk', 'loanInSheet', 'loanInOpen'].forEach((name) => {
    if (typeof ACTIONS[name] !== 'function') return;
    const previous = ACTIONS[name];
    ACTIONS[name] = function loanSheetDressed() {
      const r = previous.apply(this, arguments);
      guard('loan.dress', dressFreeLoans)();
      return r;
    };
  });

  /* ===================================================================
     3. WHAT A GOAL IS WORTH, AND WHAT A RISE COSTS
     =================================================================== */

  /* Five per cent of a week's wage, which is roughly the real ratio at
     both ends: about fifty pounds on a National League contract and a
     few thousand on a Premier League one. */
  function goalBonusFor(weekly) {
    const raw = Math.max(0, (+weekly || 0)) * 0.05;
    const step = raw >= 2000 ? 500 : raw >= 200 ? 50 : 10;
    return Math.max(step, Math.round(raw / step) * step);
  }

  function renewalCost(p, wage) {
    return Math.round(((+wage || 0) - (p.wage || 0)) * (typeof WEEKS_IN_YEAR === 'number' ? WEEKS_IN_YEAR : 52));
  }

  if (has(openContractSheet)) {
    const previousSheet = openContractSheet;
    openContractSheet = function openContractSheetScaled(p, opt) {
      const r = previousSheet.apply(this, arguments);
      guard('contract.sheet', () => {
        const exp = (G.negotiation && G.negotiation.exp) || expectedWage(p, opt && opt.renew);
        const bonus = document.getElementById('tBonus');
        if (bonus) {
          const value = goalBonusFor(exp);
          bonus.value = String(value);
          bonus.step = String(Math.max(10, Math.round(value / 4 / 10) * 10));
        }
        if (!(opt && opt.renew)) return;

        /* A rise has to be paid for, and the game already has an
           exchange rate for exactly this: the budget slider trades a
           lump for a year of weekly headroom. A renewal uses the same
           bridge, and says so before you offer rather than after. */
        const wageInput = document.getElementById('tWage');
        const host = $('#sheetBody');
        if (!wageInput || !host || host.querySelector('#renewFund')) return;
        const line = document.createElement('div');
        line.id = 'renewFund';
        line.className = 'xs faint';
        line.style.cssText = 'line-height:1.55;margin:-4px 0 11px 2px';
        const paint = () => {
          const cost = renewalCost(p, Math.round(+wageInput.value || 0));
          const budget = Math.max(0, (myClub() || {}).budget || 0);
          if (cost > 0) {
            line.innerHTML = `A rise of ${fmtW(cost / (WEEKS_IN_YEAR || 52))} a week is <b>${fmtM(cost)}</b> a year, ` +
              `and it comes out of the transfer budget. You have <b class="num">${fmtM(budget)}</b>` +
              (cost > budget ? ' — <span style="color:var(--danger)">not enough</span>.' : '.');
          } else if (cost < 0) {
            line.innerHTML = `Cutting his wage frees <b>${fmtM(-cost)}</b> back into the transfer budget.`;
          } else {
            line.innerHTML = `Same wage, so the transfer budget is untouched. You have <b class="num">${fmtM(budget)}</b>.`;
          }
        };
        paint();
        wageInput.addEventListener('input', paint);
        /* under the row of nudge buttons if there is one, otherwise
           straight under the box itself */
        const bumps = host.querySelector('[data-t="tWage"]');
        const anchor = (bumps && bumps.parentNode) || wageInput.parentNode;
        anchor.insertAdjacentElement('afterend', line);
      })();
      return r;
    };
  }

  if (typeof ACTIONS.submitTerms === 'function') {
    const previousSubmit = ACTIONS.submitTerms;
    ACTIONS.submitTerms = function submitTermsFunded() {
      const n = G.negotiation;
      const p = n ? playerById(n.pid) : null;
      const renewing = !!(n && n.renew && p);
      const before = renewing ? p.wage : null;
      if (renewing) {
        const cost = renewalCost(p, Math.round(+(($('#tWage') || {}).value) || 0));
        const me = myClub();
        if (cost > 0 && me && cost > Math.max(0, me.budget || 0)) {
          toast(`The board won't fund that — ${fmtM(cost)} a year against ${fmtM(me.budget)} of budget`);
          return undefined;
        }
      }
      const r = previousSubmit.apply(this, arguments);
      guard('contract.fund', () => {
        if (!renewing || !p || p.wage === before) return;
        const me = myClub();
        if (!me) return;
        const cost = (p.wage - before) * (WEEKS_IN_YEAR || 52);
        me.budget = Math.max(0, Math.round((me.budget || 0) - cost));
        toast(cost > 0
          ? `💷 ${fmtM(cost)} moved from the transfer budget to cover the rise`
          : `💷 ${fmtM(-cost)} returned to the transfer budget`);
      })();
      return r;
    };
  }

  /* ===================================================================
     4. THE TRANSFER NEWS, FOR THE LEAGUE YOU ACTUALLY MANAGE IN
     =================================================================== */

  /* Your division, the one above it and the one below it, in your own
     country. That is who you compete with for a player and who you read
     about. leaguesOf() already returns a country's divisions in tier
     order, so this works for Italy and Scotland exactly as it does for
     England. */
  function localDivisions() {
    const me = myClub();
    if (!me) return [];
    const key = me.league;
    const L = (typeof LEAGUES !== 'undefined') && LEAGUES[key];
    if (!L || !has(leaguesOf)) return [key];
    const same = leaguesOf(L.cc) || [key];
    const ix = same.indexOf(key);
    if (ix < 0) return [key];
    return same.slice(Math.max(0, ix - 1), ix + 2);
  }

  /* "One of the better players in his division" instead of a fixed 76,
     which below the Championship is nobody at all. Cached for a day
     because it walks every squad in the division. */
  let standardCache = { day: -1, by: {} };
  function divisionStandard(div) {
    if (standardCache.day !== G.day) standardCache = { day: G.day, by: {} };
    if (standardCache.by[div] != null) return standardCache.by[div];
    let total = 0;
    let n = 0;
    (divMembers(div) || []).forEach((i) => {
      (G.clubs[i].players || []).forEach((p) => { if (!p.loan) { total += p.ovr; n += 1; } });
    });
    const out = n ? total / n : 55;
    standardCache.by[div] = out;
    return out;
  }

  if (has(rumourMill)) {
    const previousMill = rumourMill;
    rumourMill = function rumourMillLocal() {
      try {
        const near = localDivisions();
        if (!near.length) return previousMill.apply(this, arguments);
        /* One story in five is still from the top of the game, because
           everybody reads those wherever they manage. */
        if (Math.random() < 0.2) {
          const wide = previousMill.apply(this, arguments);
          if (wide) return wide;
        }
        const pool = [];
        (G.clubs || []).forEach((c) => {
          if (!c.players || near.indexOf(c.league) < 0) return;
          const standard = divisionStandard(c.league);
          c.players.forEach((p) => {
            if (p.loan || p.loanIn || p.youth || p.injury) return;
            if (p.ovr < standard + 2) return;
            let heat = 0;
            if (p.listed) heat += 3;
            if (p.contract <= 1) heat += 3;
            if (p.morale < 45) heat += 2;
            if ((p.stats.goals || 0) >= 4) heat += 2;
            if (formAvg(p) >= 7.2) heat += 2;
            if (p.age <= 23 && p.pot - p.ovr >= 6) heat += 2;
            if (c.i === G.my) heat += 1;          /* your own are always news */
            if (heat >= 3) pool.push({ p, heat });
          });
        });
        if (!pool.length) return previousMill.apply(this, arguments);
        pool.sort((a, b) => b.heat - a.heat);
        const picked = pick(pool.slice(0, 24));
        if (!picked) return null;
        const p = picked.p;
        const from = G.clubs[p.club];
        /* A suitor from the leagues you play in, and one that could
           plausibly find the money. Same division first: those are the
           clubs you are actually bidding against. */
        const canPay = (c) => c.i !== p.club && (c.budget || 0) > p.value * 0.5;
        const divisional = (G.clubs || []).filter((c) => c.league === from.league && canPay(c));
        const nearby = (G.clubs || []).filter((c) => near.indexOf(c.league) >= 0 && canPay(c));
        const field = (divisional.length && Math.random() < 0.6) ? divisional : (nearby.length ? nearby : divisional);
        if (!field.length) return null;
        return { p, from, to: pick(field) };
      } catch (error) {
        return previousMill.apply(this, arguments);
      }
    };
  }

  /* ===================================================================
     5. A CARD THAT COSTS YOU THE NEXT MATCH
     =================================================================== */

  /* finish() applies the ban during the match. afterRound() then serves
     one match of every ban at every club that played that day, and the
     fixture list it walks includes the match that has just finished —
     so the ban was served by the game the player was sent off in. Two
     yellows cost nothing at all and a straight red cost one match
     instead of two.

     Rather than reach into four separate decrement sites, the world's
     bans are snapshotted around each of them and restored, and the
     serving is done here: once per club per day, for clubs that
     actually played, skipping any ban issued in that same match. */

  function eachPlayer(fn) {
    (G.clubs || []).forEach((c) => (c.players || []).forEach(fn));
  }

  function freezeBans(name) {
    const previous = window[name];
    if (typeof previous !== 'function') return;
    window[name] = function bansHeld() {
      const snapshot = [];
      try { eachPlayer((p) => { if (p.susp > 0) snapshot.push([p, p.susp]); }); } catch (error) { /* empty world */ }
      const r = previous.apply(this, arguments);
      try { snapshot.forEach((row) => { row[0].susp = row[1]; }); } catch (error) { /* nothing to restore */ }
      return r;
    };
  }

  ['afterRound', 'simRestOfDay', 'simRestOfRound'].forEach(freezeBans);

  /* Everyone who was sent off, or picked up their fifth booking, in a
     match that finished today. That match does not count towards the
     ban it produced. */
  if (typeof MatchSim === 'function' && MatchSim.prototype && typeof MatchSim.prototype.finish === 'function') {
    const previousFinish = MatchSim.prototype.finish;
    MatchSim.prototype.finish = function finishStamped() {
      const banned = [];
      try {
        (this.sides || []).forEach((s) => (s.onfield || []).forEach((pl) => {
          if (pl.p && pl.p._banPending) banned.push(pl.p);
        }));
      } catch (error) { /* no teamsheet */ }
      const r = previousFinish.apply(this, arguments);
      try { banned.forEach((p) => { p.suspDay = G.day; }); } catch (error) { /* no day */ }
      return r;
    };
  }

  function serveBans() {
    const day = G.day;
    const clubs = new Set();
    try {
      (has(fixturesOn) ? fixturesOn(day) : []).forEach((f) => {
        if (f.played) { clubs.add(f.h); clubs.add(f.a); }
      });
    } catch (error) { /* no fixtures today */ }
    try {
      (has(tiesOn) ? tiesOn(day) : []).forEach((t) => {
        if (t.played) { clubs.add(t.h); clubs.add(t.a); }
      });
    } catch (error) { /* no ties today */ }
    clubs.forEach((i) => {
      const c = G.clubs[i];
      if (!c || c._servedDay === day) return;
      c._servedDay = day;
      (c.players || []).forEach((p) => {
        if (p.susp > 0 && p.suspDay !== day) p.susp -= 1;
      });
    });
  }

  /* A booking away from a ban is worth knowing about before the match,
     not after it. */
  function warnDiscipline() {
    const c = myClub();
    if (!c) return;
    (c.players || []).forEach((p) => {
      const y = p.seasonYellows || 0;
      if (!y || y % 5 !== 4) return;
      if (p._ycWarned === y) return;
      p._ycWarned = y;
      mail('squad', `🟨 ${p.name} is one booking from a ban`,
        `<b>${esc(p.name)}</b> has picked up <b>${y}</b> yellow cards this season. One more and he misses a match. ` +
        'Five bookings is an automatic one-match suspension; a straight red is two; two yellows in a game is one.');
    });
  }

  if (has(dailyTickCore)) {
    const previousTick = dailyTickCore;
    dailyTickCore = function dailyTickBalanced() {
      const r = previousTick.apply(this, arguments);
      guard('daily', () => { repairStuckUnrest(); stampArrivals(); serveBans(); warnDiscipline(); })();
      return r;
    };
  }

  if (has(loadSlot)) {
    const previousLoad = loadSlot;
    loadSlot = function loadSlotRepaired() {
      const ok = previousLoad.apply(this, arguments);
      if (ok) guard('load', () => { repairStuckUnrest(); stampArrivals(); })();
      return ok;
    };
  }

  if (has(newGame)) {
    const previousNew = newGame;
    newGame = function newGameBalanced() {
      const r = previousNew.apply(this, arguments);
      guard('newGame', () => {
        const g = world();
        if (g) { g._unrestRepaired = 1; g.unrestDay = -9999; }
        stampArrivals();
      })();
      return r;
    };
  }

  /* ===================================================================
     6. AN INBOX WORTH OPENING
     =================================================================== */

  /* The tray showed the ten most recent messages of every kind in one
     undifferentiated list, which is why a transfer bid and a corner-flag
     sponsorship look identical and why nobody reads it. Filters, a line
     of the message itself, and a count on each tab. */
  const MAIL_TABS = [
    ['all', 'All', null],
    ['must', '⚠️ Decisions', (m) => mailPriority(m) === 0],
    ['transfer', '💷 Transfers', (m) => m.type === 'transfer' || m.type === 'contract'],
    ['squad', '👕 Squad', (m) => m.type === 'squad' || m.type === 'injury' || m.type === 'train' || m.type === 'scout'],
    ['board', '🏛️ Board', (m) => m.type === 'board'],
    ['media', '📰 Media', (m) => m.type === 'news' || m.type === 'match' || m.type === 'award' || m.type === 'info'],
  ];

  function mailTab() {
    const found = MAIL_TABS.find((t) => t[0] === UI.mailFilter);
    return found || MAIL_TABS[0];
  }

  ACTIONS.mailFilter = guard('mailFilter', (el) => {
    UI.mailFilter = el.dataset.v;
    UI.mailView = null;
    UI.mailOrder = null;
    freezeMailOrder();
    renderMailbox();
  });

  /* Filtering is applied at the source so that next / previous, "read
     the unread" and the frozen reading order all follow the tab you are
     on without any of them being told about it. */
  if (has(mailListFresh)) {
    const previousFresh = mailListFresh;
    mailListFresh = function mailListFreshFiltered() {
      const tab = mailTab();
      if (!tab[2] || UI.mailArchive) return previousFresh.apply(this, arguments);
      const all = G.inbox || [];
      return [...all].filter(tab[2])
        .sort((a, b) => mailPriority(a) - mailPriority(b) || b.day - a.day)
        .slice(0, 24);
    };
  }

  /* The reading order is deliberately frozen while you work through the
     tray, and a frozen order taken on one tab must not survive onto the
     next one. */
  if (has(mailList)) {
    const previousList = mailList;
    mailList = function mailListFiltered() {
      const tab = mailTab();
      const out = previousList.apply(this, arguments);
      if (!tab[2] || UI.mailArchive) return out;
      return out.filter(tab[2]);
    };
  }

  function preview(m) {
    const text = String(m.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 96 ? `${text.slice(0, 95)}…` : text;
  }

  if (has(renderMailbox)) {
    const previousMailbox = renderMailbox;
    renderMailbox = function renderMailboxTabbed() {
      /* The reading view is already good — prev, next, next-unread —
         so it is left exactly as it is. */
      if (UI.mailView || UI.mailArchive) return previousMailbox.apply(this, arguments);
      try {
        const list = mailList();
        const need = blockingMails();
        const unread = unreadMails().length;
        const unreadHere = list.filter((m) => !m.read).length;
        const counts = {};
        MAIL_TABS.forEach((t) => {
          counts[t[0]] = (G.inbox || []).filter((m) => (!t[2] || t[2](m)) && !m.read).length;
        });
        const active = mailTab()[0];

        let h = `<div class="spread" style="margin-bottom:9px"><h3 style="margin:0">📥 Inbox</h3>` +
          `<span class="xs faint">${unread} unread · ${(G.inbox || []).length} in tray</span></div>`;

        h += '<div class="chips" style="margin-bottom:9px">' + MAIL_TABS.map((t) => {
          const n = counts[t[0]];
          return `<button class="chip${active === t[0] ? ' on' : ''}" data-action="mailFilter" data-v="${t[0]}">${t[1]}${n ? ` <b>${n}</b>` : ''}</button>`;
        }).join('') + '</div>';

        if (need.length) {
          h += '<div class="card tight" style="border-color:rgba(251,225,34,.5);margin-bottom:9px;padding:8px 10px">' +
            `<div class="xs" style="font-weight:800;color:var(--gold)">⚠️ ${need.length} item${need.length > 1 ? 's' : ''} ` +
            `still need${need.length > 1 ? '' : 's'} a decision — the season will not move on until ${need.length > 1 ? 'they are' : 'it is'} dealt with</div></div>`;
        }
        if (unreadHere) {
          h += `<button class="btn btn-gold btn-sm btn-block" style="margin-bottom:9px" data-action="mailReadFirst">✉️ Read ${unreadHere} unread message${unreadHere > 1 ? 's' : ''}</button>`;
        }

        h += '<div class="card tight" style="max-height:50vh;overflow-y:auto;overflow-x:hidden">';
        if (!list.length) {
          h += `<div class="small muted" style="padding:10px 2px">${active === 'all' ? 'Your desk is clear.' : 'Nothing in here.'}</div>`;
        }
        list.forEach((x) => {
          const must = mailPriority(x) === 0;
          h += `<div class="mail${x.read ? '' : ' unread'}" data-action="mailOpen" data-id="${x.id}" style="${must ? 'box-shadow:inset 3px 0 0 var(--gold);' : ''}">` +
            `<div class="ic">${MAIL_ICON[x.type] || '✉️'}</div><div style="flex:1;min-width:0">` +
            `<div class="tt" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.title}</div>` +
            `<div class="xs faint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(mailFrom(x))} · ${fmtDateShort(x.day)}${must ? ' · <b style="color:var(--gold)">DECISION NEEDED</b>' : ''}</div>` +
            `<div class="xs" style="color:var(--ink-dim);line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(preview(x))}</div></div>` +
            `${x.read ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:var(--red);flex:none;align-self:center"></span>'}</div>`;
        });
        h += '</div>';

        h += '<div class="row" style="gap:8px;margin-top:8px">' +
          `<button class="btn btn-ghost btn-sm" style="flex:1" data-action="mailArchive">🗄️ Archive (${(G.archive || []).length})</button>` +
          '<button class="btn btn-ghost btn-sm" style="flex:1" data-action="mailAllRead">Mark all read</button></div>' +
          '<button class="btn btn-primary btn-block" style="margin-top:8px" data-action="closeModal">Close</button>';
        openModal(h);
        return undefined;
      } catch (error) {
        return previousMailbox.apply(this, arguments);
      }
    };
  }

  if (typeof ACTIONS.mailbox === 'function') {
    const previousOpen = ACTIONS.mailbox;
    ACTIONS.mailbox = function mailboxOpened() {
      UI.mailFilter = 'all';
      return previousOpen.apply(this, arguments);
    };
  }

  /* ===================================================================
     8. DISCIPLINE EXISTS OUTSIDE YOUR OWN DIVISION
     ===================================================================
     `simFixture` sends anything that is not a cup tie and not one of the
     divisions the real engine runs to `fastSim`, which accrues
     appearances, goals, assists, ratings, clean sheets and injuries — and
     no cards at all. Measured over thirty matchdays:

         Premier League   5.07 bookings a match, 10 players suspended
         Championship     4.22 a match,           8 suspended
         League One       0.39 a match,           0 suspended
         League Two       0.33 a match,           0 suspended
         National League  0.19 a match,           0 suspended

     The handful below the top two come from cup ties, which always get
     the real engine. Nobody outside your own corner of the world has ever
     served a suspension: the club you are chasing for promotion never
     loses a man to a ban, and a player you scout from two divisions down
     has a blank disciplinary record whatever kind of footballer he is.

     Bookings are accrued at the rate the real engine produces, using the
     same rules the real engine applies — one match for a fifth booking,
     one for two yellows in a game, two for a straight red. It is seeded
     from the fixture, so it is deterministic and reproducible, and it
     touches nothing the match model owns.
     =================================================================== */
  const FAST_YELLOWS = 4.4;              /* matched to the engine's own rate */
  const FAST_RED = 0.055;

  function fastRng(fix) {
    const seed = `fscards|${fix.h}|${fix.a}|${fix.day}|${G.season}|${fix.r || 0}`;
    return (has(mulberry) && has(hashStr)) ? mulberry(hashStr(seed)) : Math.random;
  }

  function bookSide(club, n, rng) {
    const xi = (club.players || [])
      .filter((p) => !p.youth && !p.loan && !(p.injury && p.injury.days > 0))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 11);
    if (!xi.length) return;
    const booked = new Set();
    for (let i = 0; i < n; i += 1) {
      /* a midfielder who tackles collects more of them than a winger */
      const p = xi[Math.floor(rng() * xi.length)];
      if (!p) continue;
      p.seasonYellows = (p.seasonYellows || 0) + 1;
      if (booked.has(p)) {
        /* two in a game is a sending off, and one match */
        p.susp = Math.max(p.susp || 0, 1);
        p.suspDay = G.day;
      } else booked.add(p);
      if (p.seasonYellows % 5 === 0) {
        p.susp = Math.max(p.susp || 0, 1);
        p.suspDay = G.day;
      }
    }
    if (rng() < FAST_RED) {
      const p = xi[Math.floor(rng() * xi.length)];
      if (p) { p.susp = Math.max(p.susp || 0, 2); p.suspDay = G.day; }
    }
  }

  if (has(fastSim)) {
    const previousFast = fastSim;
    fastSim = function fastSimWithDiscipline(fix) {
      const r = previousFast.apply(this, arguments);
      guard('fast.cards', () => {
        const H = G.clubs[fix.h];
        const A = G.clubs[fix.a];
        if (!H || !A) return;
        const rng = fastRng(fix);
        /* split the match's bookings between the two sides */
        const total = Math.max(0, Math.round(FAST_YELLOWS + (rng() - 0.5) * 3));
        const home = Math.round(total * (0.42 + rng() * 0.16));
        bookSide(H, home, rng);
        bookSide(A, Math.max(0, total - home), rng);
      })();
      return r;
    };
  }

  /* ===================================================================
     9. A CONVERSATION WITH THE RIGHT PLAYER
     ===================================================================
     `ACTIONS.roleTalk` resolved its player with `players.find(x =>
     x._pending)` — the FIRST flagged player, not the one the message was
     about. The mail that raised it is no longer produced (the unrest
     layer above replaces it), so this is unreachable in a new career, but
     an old save can still be carrying one. It reads the name off the
     message it was attached to now, and only falls back to the old guess
     if there is nothing to read.
     =================================================================== */
  if (ACTIONS && has(ACTIONS.roleTalk)) {
    const previousRoleTalk = ACTIONS.roleTalk;
    ACTIONS.roleTalk = function roleTalkRightPlayer(el) {
      guard('roletalk', () => {
        const c = myClub();
        if (!c || !el || !el.dataset) return;
        const m = (G.inbox || []).filter((x) => x.id === el.dataset.mid)[0];
        if (!m) return;
        const name = String(m.title || '').replace(/^[^\w]*\s*/, '').replace(/\s+wants a word$/, '').trim();
        if (!name) return;
        const who = (c.players || []).filter((p) => p.name === name)[0];
        if (!who) return;
        /* the old code takes the first player carrying the flag, so make
           sure that is the man the message names */
        (c.players || []).forEach((p) => { if (p !== who) p._pending = false; });
        who._pending = true;
      })();
      return previousRoleTalk.apply(this, arguments);
    };
  }

  try {
    window.RBSBalance = Object.freeze({
      loanFeeQuote, goalBonusFor, standingRole, localDivisions, roleShare,
      seasonMatches, unrestOpensAt: () => Math.ceil(seasonMatches() * UNREST_SEASON_OPENS),
    });
  } catch (error) { /* no window */ }
}());
