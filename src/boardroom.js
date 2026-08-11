/* global G, BR, clamp, ordinal, esc, fmtM, leaguePos, expectPos, gamesPlayed,
          tableRows, divMembers, myDiv, DIV_NAMES, CUP_DEFS, formStreak,
          fansShift, makePledge, mulberry, hashStr, boardPeople, boardTemper,
          boardMood, boardOwner, sackManager, keyAbsences, ACTIONS */
/* global boardScene:writable, boardTarget:writable, openBoardRoom:writable */

/* =====================================================================
   THE BOARDROOM — a room that can read a league table
   ---------------------------------------------------------------------
   Reported from a real save: top of the league after five matches — four
   wins and a draw — against a target of 1st, and the monthly review said
   "which is about where we asked you to be", then offered "Take the
   criticism" and docked five points of patience for daring to ask for
   backing.

   The cause is one line:

       const ahead = pos && obj.pos && pos < obj.pos;

   With pos = 1 and a target of 1st, `1 < 1` is false. There is no way to
   finish above first, so a manager who has done the best thing available
   to him falls straight through to the underperformance branch. Every
   answer in the scene then keys off that single boolean, which is why
   asking for money while leading the league cost patience and why owning
   criticism that was never given was the best-scoring reply in the room.

   Three things are fixed here.

   WHAT THE ROOM KNOWS. `brFacts()` is the boardroom's equivalent of
   `pqFacts()`: matches played against the length of the season, points
   per game, the shape of the last six results, the longest unbeaten and
   losing runs, which cups are still alive and how far they have gone,
   whether the club is in a promotion, play-off or relegation position,
   how much of the budget is left, and who is missing.

   HOW IT IS GRADED. Not a boolean. A seven-band spectrum measured on the
   margin between where you are and where you promised to be, with a hard
   ceiling rule — first place is the top band whatever the target says,
   because there is nowhere better to be — then nudged by form, by a cup
   run, and by the honest fact that five games is five games.

   HOW IT SOUNDS. Every line and every reply has several versions, picked
   from a seeded bank that will not repeat the version it used last time.
   The answers on offer are built for the band: a league leader is never
   handed "Take the criticism", and asking a delighted board for money is
   a conversation, not a penalty.
   ===================================================================== */

(function boardRoom() {
  'use strict';

  const has = (fn) => typeof fn === 'function';

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[board: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  /* -------------------------------------------------------------------
     0. VARIETY
     -------------------------------------------------------------------
     A line the board has just used is the one line it must not use
     again. `vary` keeps the last index it served for each key on G, so
     two meetings in a row never open the same way, and the choice is
     seeded so a test can reproduce a room exactly.
     ------------------------------------------------------------------- */
  function memory() {
    if (!G.brSeen || typeof G.brSeen !== 'object') G.brSeen = {};
    const keys = Object.keys(G.brSeen);
    if (keys.length > 120) keys.slice(0, keys.length - 120).forEach((k) => { delete G.brSeen[k]; });
    return G.brSeen;
  }

  function vary(key, list, rng) {
    const options = (list || []).filter((line) => line != null && line !== '');
    if (!options.length) return '';
    if (options.length === 1) return options[0];
    return guard('vary', () => {
      const seen = memory();
      /* the last two versions are both off the table, so a five-line bank
         does not alternate between the same pair of openings */
      const recent = Array.isArray(seen[key]) ? seen[key] : (seen[key] == null ? [] : [seen[key]]);
      const free = [];
      for (let i = 0; i < options.length; i += 1) if (recent.indexOf(i) < 0) free.push(i);
      const pool = free.length ? free : options.map((line, i) => i);
      const index = pool[Math.floor(rng() * pool.length) % pool.length];
      seen[key] = [index].concat(recent).slice(0, Math.min(2, options.length - 1));
      return options[index];
    }, options[0]);
  }

  /* a reply bank is picked when the button is pressed, not when the room
     is drawn, so the same scene answered twice does not read identically */
  function reply(key, list) {
    return () => vary(key, list, Math.random);
  }

  /* -------------------------------------------------------------------
     1. WHAT THE ROOM KNOWS
     ------------------------------------------------------------------- */
  function seasonShape(div) {
    const n = (divMembers(div) || []).length;
    if (n < 2) return 38;
    return n <= 12 ? Math.round((n - 1) * 3) : (n - 1) * 2;
  }

  function runOf(recent, test) {
    let n = 0;
    for (let i = 0; i < recent.length; i += 1) {
      if (!test(recent[i])) break;
      n += 1;
    }
    return n;
  }

  function cupState() {
    const out = [];
    const cups = G.cups || {};
    Object.keys(cups).forEach((key) => {
      const cup = cups[key];
      const def = (typeof CUP_DEFS !== 'undefined' && CUP_DEFS[key]) || null;
      if (!cup || !def) return;
      const entered = (cup.ties || []).some((t) => t.h === G.my || t.a === G.my);
      if (!entered) return;
      const alive = (cup.ties || []).some((t) => !t.played && (t.h === G.my || t.a === G.my));
      const won = cup.winner === G.my;
      const rounds = (def.days || []).length;
      const at = Math.min(cup.round || 0, Math.max(0, rounds - 1));
      out.push({
        key,
        name: def.name || key,
        icon: def.icon || '🏆',
        round: at,
        roundName: (def.rn && def.rn[at]) || '',
        left: Math.max(0, rounds - 1 - at),
        isFinal: alive && at === rounds - 1,
        isSemi: alive && at === rounds - 2,
        alive,
        won,
      });
    });
    return out;
  }

  /* The first version of this hardcoded the promotion and relegation counts
     and got three of the five English divisions wrong — it had the National
     League relegating four clubs when the game relegates nobody from it.
     The world already knows: divShape reads PYRAMIDS, divMembers and
     G.clSpots, so this stays right when the pyramid grows. */
  function zones(div, size) {
    const shape = (window.RBSShape && window.RBSShape.divShape) ? window.RBSShape.divShape(div) : null;
    if (shape) {
      return { promo: shape.up, po: 0, drop: shape.down, euro: shape.euro, shape };
    }
    return { promo: 0, po: 0, drop: 3, euro: div === 'PL' ? 4 : 0, shape: null };
  }

  function brFacts() {
    return guard('facts', () => {
      const c = G.clubs[G.my];
      const div = myDiv();
      const size = (divMembers(div) || []).length;
      const total = seasonShape(div);
      const played = gamesPlayed(G.my);
      const pos = played ? leaguePos(G.my) : null;
      const rows = tableRows(div) || [];
      const me = rows.filter((r) => r.i === G.my)[0] || { p: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0 };
      const obj = has(boardTarget) ? boardTarget() : { pos: 10 };
      const target = obj && obj.pos ? obj.pos : expectPos(G.my);
      const recent = (c.recent || []).slice(0, 8);
      const cups = cupState();
      const z = zones(div, size);
      const left = Math.max(0, total - played);
      const share = total ? played / total : 0;

      const F = {
        club: c,
        div,
        divName: (typeof DIV_NAMES !== 'undefined' && DIV_NAMES[div]) || 'the league',
        size,
        total,
        played,
        left,
        pos,
        target,
        obj,
        pts: me.pts || 0,
        won: me.w || 0,
        drew: me.d || 0,
        lost: me.l || 0,
        gd: (me.gf || 0) - (me.ga || 0),
        ppg: played ? (me.pts || 0) / played : 0,
        recent,
        form: recent.slice(0, 6).map((r) => r.r).join(''),
        streak: has(formStreak) ? formStreak(G.my) : { n: 0, r: '-' },
        unbeaten: runOf(recent, (r) => r.r !== 'L'),
        winRun: runOf(recent, (r) => r.r === 'W'),
        lossRun: runOf(recent, (r) => r.r === 'L'),
        winless: runOf(recent, (r) => r.r !== 'W'),
        cups,
        cupAlive: cups.filter((x) => x.alive),
        cupBig: cups.filter((x) => x.alive && (x.isFinal || x.isSemi))[0] || null,
        honours: (G.honours || []).filter((h) => h.season === G.season).length,
        patience: c.patience == null ? 60 : c.patience,
        temper: has(boardTemper) ? boardTemper() : 'content',
        budget: c.budget || 0,
        bank: c.bank || 0,
        absent: has(keyAbsences) ? keyAbsences(G.my) : [],
        zone: z,
        promoSpot: pos != null && z.promo > 0 && pos <= z.promo,
        chasingPromo: pos != null && z.promo > 0 && pos > z.promo && pos <= z.promo + 3,
        dropSpot: pos != null && z.drop > 0 && pos > size - z.drop,
        euroSpot: pos != null && z.euro > 0 && pos <= z.euro,
        earlyDays: played < 6,
        phase: share === 0 ? 'preseason'
          : share < 0.22 ? 'opening'
            : share < 0.55 ? 'autumn'
              : share < 0.85 ? 'newyear'
                : left <= 1 ? 'final-day' : 'runin',
      };
      F.gap = F.pos == null ? null : F.target - F.pos;      /* positive = better than asked */
      F.atCeiling = F.pos === 1;
      return F;
    }, null);
  }

  /* -------------------------------------------------------------------
     2. HOW IT IS GRADED
     -------------------------------------------------------------------
     A spectrum, not a boolean, and one hard rule above everything else:
     you cannot be behind a target while top of the league, because there
     is nowhere above first to be.
     ------------------------------------------------------------------- */
  const BANDS = ['crisis', 'bad', 'short', 'justshort', 'ontrack', 'ahead', 'flying'];

  function gradeOf(F) {
    if (!F || F.pos == null) return { band: 'ontrack', at: 4, why: 'nothing played' };
    let at;
    if (F.atCeiling) at = 6;                                /* first is first */
    else if (F.gap >= 6) at = 6;
    else if (F.gap >= 3) at = 5;
    else if (F.gap >= 0) at = 4;
    else if (F.gap >= -2) at = 3;
    else if (F.gap >= -5) at = 2;
    else if (F.gap >= -9) at = 1;
    else at = 0;

    /* form moves you a band, but never off the top of the table */
    if (!F.atCeiling) {
      if (F.winRun >= 4 || F.unbeaten >= 8) at += 1;
      if (F.lossRun >= 4) at -= 1;
      else if (F.winless >= 6 && F.played >= 8) at -= 1;
      /* a cup run is real credit and the game already counts it elsewhere */
      if (F.cupBig) at += 1;
      /* being in the bottom three is its own verdict whatever the target said */
      if (F.dropSpot && F.played >= 6) at = Math.min(at, 2);
    }
    at = clamp(at, 0, 6);
    /* nobody is in crisis in September */
    if (F.earlyDays) at = clamp(at, 2, 6);
    return { band: BANDS[at], at, why: '' };
  }

  const GOOD = (g) => g.at >= 5;
  const OK = (g) => g.at === 4 || g.at === 3;
  const POOR = (g) => g.at === 2 || g.at === 1;
  const CRISIS = (g) => g.at === 0;

  /* -------------------------------------------------------------------
     3. HOW IT SOUNDS
     ------------------------------------------------------------------- */
  function standing(F) {
    if (F.pos == null) return 'Nothing has been played yet';
    return `You are <b>${ordinal(F.pos)}</b> after ${F.played} ${F.played === 1 ? 'match' : 'matches'}`;
  }

  function targetLine(F) {
    if (F.atCeiling && F.target <= 1) return ', which is the target and there is nothing above it.';
    if (F.atCeiling) return `, against a target of <b>${ordinal(F.target)}</b> — so, better than asked.`;
    return `, against a target of <b>${ordinal(F.target)}</b>.`;
  }

  const VERDICT = {
    flying: [
      'Nobody in this building expected to be sitting here saying this in {month}.',
      'We are not going to pretend that is anything other than excellent.',
      'That is ahead of the plan, ahead of the budget and ahead of what we told the shareholders.',
      'If somebody had offered us this in August we would have signed for it on the spot.',
      'The mood downstairs is the best it has been in years, and that is your doing.',
    ],
    ahead: [
      'Which is better than we asked for, and we are not in the habit of complaining about that.',
      'That is comfortably ahead of where we thought this squad would be.',
      'We had a number in mind and you have beaten it. Noted, and appreciated.',
      'Better than the plan. The question now is whether it holds.',
      'On any reading of it, that is a good start to the job.',
    ],
    ontrack: [
      'Which is where we asked you to be, and there is no argument to have about it.',
      'That is the plan working. Nothing more dramatic than that.',
      'On target. We would rather be having this meeting than the other one.',
      'It is exactly what was agreed, so this can be a short meeting.',
      'No complaints from this side of the table.',
    ],
    justshort: [
      'Which is a little short, but only a little.',
      'Not quite where we asked, though nobody is reaching for a folder over it.',
      'A place or two off. At this stage that is a bad week, not a bad season.',
      'Slightly behind. We would like to see the gap closed rather than explained.',
      'Close enough that it can be fixed, far enough that we have noticed.',
    ],
    short: [
      'Which is not where we asked you to be.',
      'That is below what was agreed, and the gap is starting to look like a pattern.',
      'We are behind, and behind is expensive in this division.',
      'It is not a disaster. It is not what we agreed either.',
      'We had a number and we are the wrong side of it.',
    ],
    bad: [
      'That is a long way from what was agreed and everybody in this room knows it.',
      'We are not going to sit here and tell you that is acceptable.',
      'The gap between that and what we asked for is the reason this meeting is longer than usual.',
      'That is the sort of position that starts costing this club money as well as pride.',
      'We are well short, and the supporters have started telling us so before you do.',
    ],
    crisis: [
      'We will not dress it up. That is as bad as this club has been in a long time.',
      'That is not a slow start any more. That is a season going wrong in front of us.',
      'There is no reading of that table that any of us can defend outside this building.',
      'We are in trouble, and pretending otherwise would waste both our afternoons.',
      'This has gone past disappointing.',
    ],
  };

  function monthName() {
    const day = (G.day || 0) - (G.seasonStart || 0);
    const names = ['August', 'September', 'October', 'November', 'December',
      'January', 'February', 'March', 'April', 'May'];
    return names[clamp(Math.floor(day / 30), 0, names.length - 1)];
  }

  /* a second sentence about whatever is actually happening to you */
  function colour(F, g, rng) {
    const bits = [];
    if (F.winRun >= 4) {
      bits.push(vary('col-win', [
        `${F.winRun} wins on the spin is the sort of run this club puts on a wall.`,
        `Nobody has taken anything off you in ${F.winRun} matches.`,
        `${F.winRun} straight wins. The chief executive has stopped pretending not to look at the table.`,
      ], rng));
    } else if (F.unbeaten >= 6) {
      bits.push(vary('col-unb', [
        `${F.unbeaten} unbeaten is a run in anybody's language.`,
        `We have not seen this side beaten since ${monthName()} started.`,
        `${F.unbeaten} without defeat. Whatever you are doing on the training ground, keep doing it.`,
      ], rng));
    } else if (F.lossRun >= 3) {
      bits.push(vary('col-loss', [
        `${F.lossRun} defeats in a row is what has brought this meeting forward.`,
        `Three of these in a row and people start asking us questions in the street. It is ${F.lossRun}.`,
        `${F.lossRun} straight losses. That is the number we keep coming back to.`,
      ], rng));
    } else if (F.winless >= 5 && F.played >= 7) {
      bits.push(vary('col-winless', [
        `${F.winless} without a win is the part we cannot get past.`,
        `We have not won since ${monthName()} began, and that is the whole of it.`,
      ], rng));
    }

    if (F.cupBig) {
      bits.push(vary('col-cup', [
        `There is a ${F.cupBig.roundName.toLowerCase()} in the ${F.cupBig.name} as well, and this board has not forgotten how rare those are.`,
        `A ${F.cupBig.roundName.toLowerCase()} of the ${F.cupBig.name} is worth saying out loud.`,
        `And the ${F.cupBig.name} is still alive at the ${F.cupBig.roundName.toLowerCase()}, which changes the shape of the season.`,
      ], rng));
    } else if (F.cupAlive.length >= 2) {
      bits.push(vary('col-cups', [
        'Still in two cups, which is a lot of Tuesdays.',
        'Two competitions still running. We would like at least one of them taken seriously.',
      ], rng));
    }

    if (F.earlyDays && F.played) {
      bits.push(vary('col-early', [
        `It is ${F.played} ${F.played === 1 ? 'match' : 'matches'}. Nobody is drawing a conclusion from ${F.played}.`,
        'We know how few games that is. We are not going to pretend the table means much yet.',
        'Far too early for anybody to be certain of anything, ourselves included.',
      ], rng));
    } else if (F.phase === 'runin' || F.phase === 'final-day') {
      bits.push(vary('col-runin', [
        `${F.left} to play. This is the part that decides what the year gets called.`,
        `There are ${F.left} games left and no more room to be patient in.`,
      ], rng));
    } else if (F.dropSpot && !F.earlyDays) {
      bits.push(vary('col-drop', [
        `And we are in the bottom ${F.zone.drop}, which is the number that costs this club everything.`,
        'Relegation is not a word we want in the minutes of a meeting in ' + monthName() + '.',
      ], rng));
    } else if (F.promoSpot && GOOD(g)) {
      bits.push(vary('col-promo', [
        `${F.zone.promo === 1 ? 'The one automatic place' : `The top ${F.zone.promo}`} is where we are sitting, and this board would like it very much.`,
        'That is a promotion place. We are all adults, so we will say it plainly: we want it.',
      ], rng));
    } else if (F.chasingPromo && GOOD(g)) {
      bits.push(vary('col-chase', [
        `${F.pos - F.zone.promo} off the ${F.zone.promo === 1 ? 'automatic place' : `top ${F.zone.promo}`}, and closing. Nobody up here is pretending not to look.`,
        'You are close enough to promotion that the supporters have started doing arithmetic.',
      ], rng));
    }

    return bits.slice(0, 2).join(' ');
  }

  /* -------------------------------------------------------------------
     4. THE ANSWERS ON OFFER
     -------------------------------------------------------------------
     Built for the band. Money asked for from a delighted board is a
     conversation; the same question from a board three defeats into a
     bad autumn is not. Nobody is offered "take the criticism" when there
     has not been any.
     ------------------------------------------------------------------- */
  function grantBudget(c, factor) {
    const before = c.budget || 0;
    const extra = Math.max(0, Math.round(before * (factor - 1)));
    c.budget = before + extra;
    return extra;
  }

  function optKeepFeet(F, g) {
    return {
      lbl: vary('lbl-feet', ['Nothing is won in ' + monthName(), 'A long way to go yet', 'We have done nothing yet'], Math.random),
      sub: 'play it down',
      go: () => {
        boardMood(GOOD(g) ? 4 : 2, 'kept everyone level');
        return vary('rep-feet', [
          '"That is the right answer." Nobody in this room wants a manager who thinks it is finished in ' + monthName() + '.',
          'The chairman nods once. It is the answer he was hoping for and he does not say so.',
          '"Good. Keep saying that outside as well." The meeting relaxes by about a degree.',
          'You get the impression they had a bet on whether you would say it. Somebody has just won.',
        ], Math.random);
      },
    };
  }

  function optCredit(F) {
    return {
      lbl: vary('lbl-credit', ['Credit the players', 'It is the group, not me', 'Praise the dressing room'], Math.random),
      sub: 'push it back to them',
      go: () => {
        boardMood(3, 'gave the players the credit');
        try { F.club.players.forEach((p) => { p.morale = clamp((p.morale || 60) + 4, 1, 100); }); } catch (e) { /* squad missing */ }
        try { fansShift(3, 'praised the players publicly'); } catch (e) { /* no fan model */ }
        return vary('rep-credit', [
          'It will be repeated back to them before training tomorrow, and it will be worth more than a team talk.',
          '"They are your players." He means it as a compliment and it lands as one.',
          'A manager who does that in a boardroom tends to get it back on a Saturday.',
        ], Math.random);
      },
    };
  }

  function optBackingGood(F, g) {
    return {
      lbl: vary('lbl-back-good', ['Back it while it is running', 'Ask them to fund it', 'Now is the time to spend'], Math.random),
      sub: 'ask while the room is warm',
      go: () => {
        const generous = g.at >= 6 || F.patience >= 70;
        const extra = grantBudget(F.club, generous ? 1.18 : 1.1);
        boardMood(generous ? 1 : 0, 'asked to be backed from a position of strength');
        return vary('rep-back-good', [
          `"Given where we are — yes." <b>${fmtM(extra)}</b> goes onto the budget, and nobody around the table pretends it was hard to agree.`,
          `A glance between the three of them, and then a number. <b>${fmtM(extra)}</b>. "Spend it on the first team, not the wage bill."`,
          `<b>${fmtM(extra)}</b>. "Do not make us regret enjoying ourselves." That is as close as this board comes to a joke.`,
        ], Math.random);
      },
    };
  }

  /* Raising the target is only an offer while there is somewhere above you
     to promise. A club already told to finish 1st and already sitting 1st
     has nothing left to bid with in the league, so the promise moves to a
     competition instead. */
  function optTrophy(F) {
    const cup = (F.cupAlive || [])[0];
    if (cup) {
      return {
        lbl: vary('lbl-trophy', [`Then we win the ${cup.name}`, 'Give me a trophy to chase', 'We go for the cup as well'], Math.random),
        sub: 'promise silverware on top',
        go: () => {
          const extra = grantBudget(F.club, 1.12);
          boardMood(1, 'promised silverware');
          try {
            makePledge('trophy', 'I told the board we would win the ' + cup.name, null,
              { label: 'win the ' + cup.name });
          } catch (e) { /* pledges optional */ }
          return vary('rep-trophy', [
            `"Then go and win it." <b>${fmtM(extra)}</b> for the squad depth it will take, and a room full of people who heard you say it.`,
            `The ${cup.name} is now something you have promised out loud. <b>${fmtM(extra)}</b> came with the promise.`,
          ], Math.random);
        },
      };
    }
    return {
      lbl: vary('lbl-hold', ['We intend to stay here', 'Nobody is catching us', 'Hold the lead'], Math.random),
      sub: 'commit to it in front of them',
      go: () => {
        const extra = grantBudget(F.club, 1.1);
        boardMood(1, 'committed to holding the lead');
        try {
          makePledge('finish', 'I told the board we would finish 1st', null,
            { target: 1, label: 'finish 1st' });
        } catch (e) { /* pledges optional */ }
        return vary('rep-hold', [
          `"Then we will hold you to it." <b>${fmtM(extra)}</b> to make sure you are not doing it on your own.`,
          `Nobody writes it down, which in this room means everybody remembers it. <b>${fmtM(extra)}</b> follows.`,
        ], Math.random);
      },
    };
  }

  function optRaise(F) {
    /* nothing above first to promise */
    if ((F.obj.pos || 1) <= 1 && (F.pos || 1) <= 1) return optTrophy(F);
    return {
      lbl: vary('lbl-raise', ['Then raise the target', 'We are going up', 'Promise them more'], Math.random),
      sub: 'stake your credit on it',
      go: () => {
        const from = F.obj.pos;
        const to = Math.max(1, Math.min(from, F.pos || from) - 1);
        F.obj.pos = to;
        const extra = grantBudget(F.club, 1.14);
        boardMood(2, 'raised the bar on himself');
        try {
          makePledge('finish', 'I told the board we would finish in the top ' + to, null,
            { target: to, label: 'finish ' + ordinal(to) + ' or better' });
        } catch (e) { /* pledges optional */ }
        return vary('rep-raise', [
          `"Then say it where they can hear you." The target is now <b>${ordinal(to)}</b> and <b>${fmtM(extra)}</b> has arrived to pay for it.`,
          `The chairman writes <b>${ordinal(to)}</b> on the pad and turns it round so you can see it. <b>${fmtM(extra)}</b> comes with it.`,
          `You have just moved the target from ${ordinal(from)} to <b>${ordinal(to)}</b>, in front of witnesses, for <b>${fmtM(extra)}</b>.`,
        ], Math.random);
      },
    };
  }

  function optOnTarget(F) {
    return {
      lbl: vary('lbl-ontarget', ['It is where we said we would be', 'We are on plan', 'No surprises here'], Math.random),
      sub: 'state it plainly',
      go: () => {
        boardMood(2, 'was straight about the position');
        return vary('rep-ontarget', [
          '"It is." The folder closes. That is the whole of it.',
          'Nobody argues, because there is nothing to argue with.',
          '"Then we will not keep you." Some meetings are supposed to be dull.',
        ], Math.random);
      },
    };
  }

  function optBetter(F) {
    return {
      lbl: vary('lbl-better', ['We can be better than this', 'I want more from us', 'On plan is not good enough'], Math.random),
      sub: 'raise it yourself',
      go: () => {
        boardMood(4, 'refused to settle for the target');
        return vary('rep-better', [
          '"That is what we wanted to hear and we did not want to be the ones to say it."',
          'The chief executive looks up for the first time in ten minutes.',
          '"Then go and be better." He says it warmly, which is not how it reads written down.',
        ], Math.random);
      },
    };
  }

  function optExcuse(F) {
    const injured = (F.absent || []).length;
    return {
      lbl: injured
        ? vary('lbl-excuse-inj', [`We have had ${injured} out`, 'The treatment room explains it', 'Look at who is missing'], Math.random)
        : vary('lbl-excuse', ['The fixtures have been unkind', 'It has been a hard run of games', 'The schedule has not helped'], Math.random),
      sub: injured ? 'point at the treatment room' : 'point at the calendar',
      go: () => {
        if (injured >= 3) {
          boardMood(1, 'pointed at genuine absences');
          return vary('rep-excuse-ok', [
            `They check the list. ${injured} of your best players are unavailable and it is hard to argue with a physiotherapist's report.`,
            '"We had seen that." It is accepted, though nobody offers to do anything about it.',
          ], Math.random);
        }
        boardMood(-3, 'reached for an excuse');
        return vary('rep-excuse-bad', [
          '"Everybody plays the same fixtures." It does not land, and you knew it would not as you said it.',
          'A silence, and then the next item on the agenda. That is your answer.',
          '"We have all had hard runs of games." The temperature drops a little.',
        ], Math.random);
      },
    };
  }

  function optBackingOK(F) {
    return {
      lbl: vary('lbl-back-ok', ['Ask for backing', 'I could use some help', 'Is there money?'], Math.random),
      sub: 'use the meeting for something',
      go: () => {
        const ok = F.patience >= 55 || F.unbeaten >= 4;
        if (ok) {
          const extra = grantBudget(F.club, 1.08);
          boardMood(-1, 'asked for money');
          return vary('rep-back-ok', [
            `"A little. Not a lot." <b>${fmtM(extra)}</b>, and a look that says do not come back in a fortnight.`,
            `<b>${fmtM(extra)}</b> is found without much enthusiasm. It is more than nothing.`,
          ], Math.random);
        }
        boardMood(-3, 'asked for money at the wrong moment');
        return vary('rep-back-no', [
          '"Let us see an improvement first." That is a no, said politely.',
          '"On this run?" He does not finish the sentence, which is its own answer.',
        ], Math.random);
      },
    };
  }

  function optItWillCome(F) {
    return {
      lbl: vary('lbl-come', ['It will come', 'Trust the work', 'We are closer than the table says'], Math.random),
      sub: 'ask them to hold their nerve',
      go: () => {
        boardMood(F.unbeaten >= 3 ? 2 : 0, 'asked for nerve');
        return vary('rep-come', [
          '"We hope so." He closes the folder without looking at you.',
          '"So does everybody, at this stage of a bad season." It is not agreement. It is not a refusal either.',
          'The director nods slowly. He has heard it from three managers now and he is still here.',
        ], Math.random);
      },
    };
  }

  function optSquadNotGoodEnough(F) {
    return {
      lbl: vary('lbl-squad', ['This squad needs help', 'You have not given me enough', 'I need players'], Math.random),
      sub: 'ask for money and put it on the players',
      go: () => {
        const ok = F.patience >= 25 && Math.random() < 0.5;
        try { F.club.players.forEach((p) => { p.morale = clamp((p.morale || 60) - 5, 1, 100); }); } catch (e) { /* squad missing */ }
        if (ok) {
          const extra = grantBudget(F.club, 1.16);
          boardMood(-2, 'blamed the squad and got paid for it');
          return vary('rep-squad-ok', [
            `They agree, and <b>${fmtM(extra)}</b> appears. It will be in a newspaper by Friday, and the dressing room reads newspapers.`,
            `<b>${fmtM(extra)}</b>, and a warning that this is the last time that argument works.`,
          ], Math.random);
        }
        boardMood(-7, 'blamed the squad and was not believed');
        return vary('rep-squad-no', [
          '"We bought you those players." It did not land, and it will get back to them.',
          '"Then you picked the wrong ones." The room has turned, and the players will hear about it anyway.',
        ], Math.random);
      },
    };
  }

  function optOwnIt(F) {
    return {
      lbl: vary('lbl-own', ['It is on me', 'I will fix it', 'No excuses from me'], Math.random),
      sub: 'take it',
      go: () => {
        boardMood(6, 'took responsibility');
        return vary('rep-own', [
          'The chairman looks at you for a long moment. "That is the first honest thing said in this room all month."',
          'Nobody expected it and nobody has a follow-up question ready.',
          '"Then fix it." Short, and better than anything else you would have got.',
        ], Math.random);
      },
    };
  }

  function optTime(F) {
    const already = (G.pledges || []).some((p) => p.kind === 'deadline' && p.state === 'open');
    if (already) return null;
    return {
      lbl: vary('lbl-time', ['Give me until the winter', 'Name a date and judge me on it', 'Ten weeks'], Math.random),
      sub: 'buy time and spend your credit',
      go: () => {
        const due = G.day + 70;
        try {
          makePledge('deadline', 'I asked the board for time', null,
            { due, label: 'turn it round by the winter', target: Math.max(1, F.target) });
        } catch (e) { /* pledges optional */ }
        boardMood(12, 'asked for time and got it');
        return vary('rep-time', [
          '"You have until the winter." You have bought ten weeks and spent your last credit doing it.',
          'A pause, then a nod. Ten weeks. It is written down, which is the part that matters.',
        ], Math.random);
      },
    };
  }

  function optSackMe(F) {
    return {
      lbl: vary('lbl-sack', ['Then sack me', 'Do it now or back me', 'Make your minds up'], Math.random),
      sub: 'call it — this can go either way',
      go: () => {
        if (F.patience <= 14) {
          try { sackManager(); } catch (e) { /* no sack path */ }
          return '"If that is how you want it." It is done.';
        }
        boardMood(18, 'called their bluff and won');
        return vary('rep-sack', [
          'Nobody expected that. The room recalculates, and you walk out with more time than you came in with.',
          '"Sit down." It is the first time all season anybody in this building has sounded like they are on your side.',
        ], Math.random);
      },
    };
  }

  function optsForBand(F, g) {
    const list = [];
    if (GOOD(g)) {
      list.push(optKeepFeet(F, g), optBackingGood(F, g), optRaise(F), optCredit(F));
    } else if (OK(g)) {
      list.push(optOnTarget(F), optBetter(F), optBackingOK(F), optExcuse(F));
    } else if (POOR(g)) {
      list.push(optItWillCome(F), optSquadNotGoodEnough(F), optOwnIt(F), optTime(F));
    } else if (CRISIS(g)) {
      list.push(optOwnIt(F), optSquadNotGoodEnough(F), optTime(F), optSackMe(F));
    }
    return list.filter(Boolean);
  }

  /* -------------------------------------------------------------------
     5. THE SCENES
     ------------------------------------------------------------------- */
  const OPENERS = {
    /* the greeting itself carries a temperature, so a good month does not
       open with "sit down, this is not an ambush" */
    monthlyWarm: [
      'The monthly review.',
      'Same time every month, and here we are.',
      'Half an hour on where the season stands.',
      'Thank you for coming up. The monthly look at things.',
      'Come in, sit down, this will not take long.',
      'The review. There is coffee, which is not always the case.',
    ],
    monthlyCool: [
      'The monthly review.',
      'Same time every month, and here we are.',
      'Sit down. This is the review, not an ambush.',
      'The monthly meeting, and there are a few things on the agenda.',
      'Half an hour on where the season stands, and we would like to use all of it.',
      'Close the door.',
    ],
    checkin: [
      'You wanted to see us.',
      'You asked for the meeting, so the floor is yours.',
      'We were told you wanted half an hour.',
      'Come in. You called this one.',
    ],
  };

  function seededRng(kind, F) {
    const key = `br|${kind}|${G.season || 0}|${G.day || 0}|${F ? F.played : 0}`;
    return has(mulberry) && has(hashStr) ? mulberry(hashStr(key)) : Math.random;
  }

  function monthlyScene(P, F, g) {
    const rng = seededRng('monthly', F);
    const warm = g.at >= 3;
    const opener = vary(warm ? 'open-monthly-warm' : 'open-monthly-cool',
      warm ? OPENERS.monthlyWarm : OPENERS.monthlyCool, rng);
    const verdict = vary('verdict-' + g.band, VERDICT[g.band] || VERDICT.ontrack, rng)
      .replace('{month}', monthName());
    const extra = colour(F, g, rng);
    const who = GOOD(g) ? P.chair : (CRISIS(g) ? P.chair : P.ceo);
    return {
      kind: 'monthly',
      who,
      band: g.band,
      say: `${opener} ${standing(F)}${targetLine(F)} ${verdict}${extra ? ' ' + extra : ''}`,
      opts: optsForBand(F, g),
    };
  }

  function checkinScene(P, F, g) {
    const rng = seededRng('checkin', F);
    const opener = vary('open-checkin', OPENERS.checkin, rng);
    const body = F.played === 0
      ? vary('checkin-pre', [
        'We have not kicked a ball yet, so there is not much to report — but the door is open.',
        'Nothing has happened yet, which makes this the easiest meeting of the year.',
        'Pre-season, so we will spare you the table. What is on your mind?',
      ], rng)
      : `${standing(F)}${targetLine(F)}`;

    const opts = [
      {
        lbl: vary('lbl-nothing', ['Just checking in', 'Nothing in particular', 'Keeping you in the loop'], Math.random),
        sub: 'no agenda',
        go: reply('rep-nothing', [
          `"Good." ${esc(P.chair)} goes back to his phone. It is the shortest meeting anybody has had in this room all year.`,
          'They appreciate it more than they will say. Managers usually only come up here to ask for something.',
          '"Then we will let you get back." Ninety seconds, door to door.',
        ]),
      },
      GOOD(g) ? optBackingGood(F, g) : optBackingOK(F),
      {
        lbl: vary('lbl-stand', ['Where do I stand?', 'Tell me straight', 'Am I in trouble?'], Math.random),
        sub: 'ask them straight',
        go: () => {
          const read = {
            flying: 'You are as safe as anybody in this job ever is, and you have earned it.',
            ahead: 'You are ahead of what we asked. Nobody up here is thinking about anything else.',
            ontrack: 'You are doing what we agreed. That is all we ever ask of anybody.',
            justshort: 'Slightly short, and slightly short is not a problem yet.',
            short: 'Behind, and we would like that closed before Christmas.',
            bad: 'Not well. We are not going to lie to you in a meeting you called.',
            crisis: 'Badly. You asked, so there it is.',
          }[g.band];
          boardMood(1, 'asked for the truth');
          return `"You want it plainly? ${esc(F.temper)}." ${read}` +
            (F.earlyDays ? ' It is early, and everybody in the room knows it.'
              : ` The target is still ${ordinal(F.target)}.`);
        },
      },
      {
        lbl: vary('lbl-summer', ['Talk to me about the summer', 'What happens if we go up?', 'Where is this club going?'], Math.random),
        sub: 'ask about the plan, not the money',
        go: () => {
          boardMood(2, 'asked about the long term');
          const up = F.div === 'PL'
            ? 'Europe changes what this club can pay and who will answer the phone.'
            : `Promotion out of ${F.divName} is worth more to this club than anything you could sell.`;
          return vary('rep-summer', [
            `"${up}" It is the first time all year anybody has talked about a plan rather than a fixture.`,
            `He talks for ten minutes without notes. ${up} You leave knowing more than you did.`,
            `"That is the right question." ${up}`,
          ], Math.random);
        },
      },
    ].filter(Boolean);

    return {
      kind: 'checkin',
      who: P.ceo,
      band: g.band,
      say: `${opener} ${body} What is on your mind?`,
      opts,
    };
  }

  /* `review` is the meeting behind "Request more transfer funds" — once a
     season, whenever you press it. It read as an end-of-season debrief
     ("You finished 14th... so, next season") even in October, so the
     wording follows the calendar. */
  const REVIEW_TOP_END = [
    'Well. That was a season.',
    'We should do this every year and we should mean it.',
    'There is not much on the agenda because there is not much to complain about.',
    'The accountants are happy, which almost never happens in May.',
  ];
  const REVIEW_LOW_END = [
    'So. That was that.',
    'We will keep this brief because neither of us enjoyed it.',
    'A long season, and not in the good way.',
    'The end of a year nobody here will be putting in the programme notes.',
  ];
  const REVIEW_TOP_MID = [
    'You have come up for money. Given the table, we will listen.',
    'The chief executive has the accounts open, which is a good sign for you.',
    'Normally this is the meeting nobody enjoys. Not this year.',
    'We were rather expecting you.',
  ];
  const REVIEW_LOW_MID = [
    'You have come up for money.',
    'Before you start — we have seen the table as well.',
    'We will hear you out. That is not the same as agreeing.',
    'There is money in this club. There is not much goodwill.',
  ];

  function reviewScene(P, F, g) {
    const rng = seededRng('review', F);
    const ended = F.left <= 0 || F.phase === 'final-day';
    const top = GOOD(g) || (OK(g) && F.honours > 0);
    const opener = vary(
      (ended ? 'open-rev-end-' : 'open-rev-mid-') + (top ? 'top' : 'low'),
      ended ? (top ? REVIEW_TOP_END : REVIEW_LOW_END) : (top ? REVIEW_TOP_MID : REVIEW_LOW_MID),
      rng,
    );
    const said = F.pos == null
      ? 'Nothing has been played yet, so there is not much to weigh it against.'
      : ended
        ? `You said ${ordinal(F.target)}. You finished <b>${ordinal(F.pos)}</b>.`
        : `${standing(F)}${targetLine(F)}`;
    const silver = F.honours
      ? vary('rev-silver', [
        'And there is silverware in the cabinet that was not there in August.',
        `There is a trophy in the boardroom now. ${F.honours > 1 ? 'More than one.' : 'It has been a while.'}`,
        'The cabinet has something new in it, which buys a great deal of goodwill in this room.',
      ], rng)
      : '';
    const verdict = vary('rev-verdict-' + g.band, VERDICT[g.band] || VERDICT.ontrack, rng)
      .replace('{month}', ended ? 'May' : monthName());
    const close = ended ? ' So. Next season.' : ' So. What is it you want?';

    const give = GOOD(g) || OK(g) || F.honours > 0;
    return {
      kind: 'review',
      who: P.chair,
      band: g.band,
      say: `${opener} ${said} ${silver ? silver + ' ' : ''}${verdict}${close}`,
      opts: [
        {
          lbl: ended
            ? vary('lbl-rev-back', ['Back me and we go again', 'Give me a summer', 'Fund one more push'], Math.random)
            : vary('lbl-rev-back-mid', ['Back me in this window', 'I need it now, not in June', 'Fund it while it matters'], Math.random),
          sub: 'ask for the tools',
          go: () => {
            const extra = grantBudget(F.club, give ? 1.22 : 1.07);
            boardMood(give ? 0 : -3, 'asked to be funded');
            return vary('rep-rev-back', [
              `<b>${fmtM(extra)}</b> for ${ended ? 'the summer' : 'the window'}${give ? '. They are enjoying this.' : '. It is not much, and you know why.'}`,
              `<b>${fmtM(extra)}</b>, and a list of the players they would rather you did not sell.`,
              `The number is <b>${fmtM(extra)}</b>${give ? ', and it came faster than you expected.' : ', and it took some arguing for.'}`,
            ], Math.random);
          },
        },
        {
          lbl: vary('lbl-rev-youth', ['I want to build, not buy', 'Put it into the academy', 'Grow our own'], Math.random),
          sub: 'youth over money',
          go: () => {
            try { if (F.club.stad) F.club.stad.youth = Math.min(5, (F.club.stad.youth || 1) + 1); } catch (e) { /* no facilities */ }
            boardMood(6, 'invested in the academy');
            try { fansShift(3, 'backed the academy'); } catch (e) { /* no fan model */ }
            return vary('rep-rev-youth', [
              'The academy gets the money instead. It is a slower answer and they respect you for it.',
              '"Every board says that and no manager ever means it." He is smiling as he signs it off.',
              'Facilities, not fees. It will not win you anything next season and it might win you everything after.',
            ], Math.random);
          },
        },
        GOOD(g) ? optRaise(F) : null,
        {
          lbl: vary('lbl-rev-quiet', ['Say nothing', 'Let the results talk', 'Thank them and leave'], Math.random),
          sub: 'leave it there',
          go: () => {
            boardMood(2, 'left it there');
            return vary('rep-rev-quiet', [
              'You thank them and leave. Some rooms are best left early.',
              'Nothing is promised and nothing is asked for. It is the most professional thing anyone does all season.',
              'The door closes on a room that would have preferred a speech, and respects you for not giving one.',
            ], Math.random);
          },
        },
      ].filter(Boolean),
    };
  }

  /* -------------------------------------------------------------------
     6. WIRING
     ------------------------------------------------------------------- */

  /* boardTarget() was replaced by a later layer that returns {pos, agreed}
     and dropped the {exp, div, txt} the monthly board mail still reads —
     so every warning mail printed "target undefinedth". Both shapes now
     come back from the one call. */
  if (has(boardTarget)) {
    const previousTarget = boardTarget;
    boardTarget = function boardTargetBothShapes() {
      const t = previousTarget.apply(this, arguments) || {};
      guard('target', () => {
        if (t.pos == null) t.pos = expectPos(G.my);
        t.div = myDiv();
        const s = (window.RBSShape && window.RBSShape.divShape) ? window.RBSShape.divShape(t.div) : null;
        /* A season's target can be talked up or down in the boardroom, and
           the option that softens it capped at a flat 20 — meaningless in a
           division of 24. It can never be worse than the last safe place. */
        if (s) t.pos = clamp(Math.round(t.pos), 1, s.floor);
        t.exp = t.pos;
        const name = s ? s.name : ((typeof DIV_NAMES !== 'undefined' && DIV_NAMES[t.div]) || 'the league');
        /* "finish 24th or better" is not a target. When the number is the
           last safe position, say what it actually means. */
        if (s && s.hasRelegation && t.pos >= s.floor) t.txt = 'keep this club in ' + name;
        else if (s && s.hasPromotion && t.pos <= s.upTo) {
          t.txt = 'go up out of ' + name + ' (' + (s.up === 1 ? 'the one automatic place' : 'the top ' + s.up) + ')';
        } else if (s && !s.hasEurope) t.txt = 'finish ' + ordinal(t.pos) + ' or better in ' + name;
        else t.txt = 'finish ' + ordinal(t.pos) + ' or better';

        /* And why it is that number rather than simply where this club
           usually finishes. The expectation reads the squad you can
           actually put out, so selling your best three moves it — and a
           board that quietly moves the target without saying so is worse
           than one that never moved it at all. */
        const why = (window.RBSInteractions && typeof window.RBSInteractions.expectWhy === 'function')
          ? window.RBSInteractions.expectWhy(G.my) : '';
        t.why = why || '';
        if (why) t.txt += ' — ' + why;
      });
      return t;
    };
  }

  if (has(boardScene)) {
    const previousScene = boardScene;
    /* whichever scene runs, an answer may move the season's target — and it
       must stay inside the division it belongs to */
    const clampTarget = () => guard('clamp', () => {
      const t = boardTarget();
      const s = (window.RBSShape && window.RBSShape.divShape) ? window.RBSShape.divShape(myDiv()) : null;
      if (t && s && t.pos != null) t.pos = clamp(Math.round(t.pos), 1, s.floor);
    });
    const guardOpts = (scene) => {
      if (!scene || !Array.isArray(scene.opts)) return scene;
      scene.opts = scene.opts.map((o) => {
        if (!o || typeof o.go !== 'function') return o;
        const inner = o.go;
        return Object.assign({}, o, {
          go() { const out = inner.apply(this, arguments); clampTarget(); return out; },
        });
      });
      return scene;
    };

    boardScene = function boardSceneGraded(kind) {
      const built = guard('scene', () => {
        if (kind !== 'monthly' && kind !== 'checkin' && kind !== 'review') return null;
        const F = brFacts();
        if (!F) return null;
        const g = gradeOf(F);
        const P = boardPeople();
        if (kind === 'monthly') return monthlyScene(P, F, g);
        if (kind === 'checkin') return checkinScene(P, F, g);
        return reviewScene(P, F, g);
      }, null);
      if (built && built.opts && built.opts.length) {
        try { if (typeof BR !== 'undefined') BR.chain = null; } catch (e) { /* no chain */ }
        return guardOpts(built);
      }
      return guardOpts(previousScene.apply(this, arguments));
    };
  }

  /* -------------------------------------------------------------------
     7. AN INVITATION CAN ONLY BE ACCEPTED ONCE
     -------------------------------------------------------------------
     Reported from a real save: take the very first meeting of a career,
     leave the room, and the invitation is still sitting there. Go back
     up and the board complains about your league position — on a day
     when nothing has been played.

     Reproduced exactly. Three faults stacked in one four-line action:

       ACTIONS.boardGo = el => {
         try{ const m = (G.inbox||[]).filter(x => x.id === el.dataset.mid)[0];
              if(m) m.actions = null }catch(e){}
         const k = (G.boardCall && G.boardCall.kind) || 'summoned';
         ...

     1. The invitation is only withdrawn if the click carried the mail's
        id. The attention strip — the most likely place to press it —
        builds its button from `attnAnswer()`, which pushes the board item
        with no `mid` at all. So the mail keeps its "Go up" button for
        ever.
     2. With no summons outstanding the fallback is **'summoned'**, which
        is the crisis scene. A stale button therefore opens "We will not
        dress this up" out of nowhere.
     3. And on day one `leaguePos` returns a reputation-sorted position,
        so the crisis scene reads "4th is not what was agreed" — quoting
        the target back as though it were the table.

     The invitation is now withdrawn whenever the room opens, from any
     entry point, and a button with nothing behind it opens the meeting
     you asked for rather than a crisis that has not happened.
     ------------------------------------------------------------------- */
  /* Reported again after the first fix, and the report was right: taking
     the button off the message is not enough. "Once you've met the board
     it should remove that message from your mailbox — it shouldn't be in
     your mailbox any more, it should disappear until your next board
     meeting." So the invitation is withdrawn *and* the letter goes. It
     has served its only purpose; leaving it sitting at the top of the
     inbox reads as an appointment you still have to keep. */
  function consumeInvitation() {
    G.boardCall = null;
    const before = (G.inbox || []).length;
    const kept = (G.inbox || []).filter((m) => {
      if (!m) return false;
      const invite = !!(m.actions && m.actions.length
        && m.actions.some((a) => a && a.act === 'boardGo'));
      /* the letter that summoned you, whether or not it still has a button
         on it — matched on the line boardSummon() always writes */
      const summons = m.type === 'board' && /waiting for you upstairs/i.test(String(m.body || ''));
      return !(invite || summons);
    });
    if (kept.length !== before) {
      /* an unread letter that disappears must not leave the badge counting it */
      const goneUnread = (G.inbox || []).filter((m) => m && kept.indexOf(m) < 0 && !m.read).length;
      G.inbox = kept;
      if (goneUnread > 0) G.unread = Math.max(0, (G.unread || 0) - goneUnread);
    }
  }

  if (has(openBoardRoom)) {
    const previousOpen = openBoardRoom;
    openBoardRoom = function openBoardRoomConsuming() {
      const r = previousOpen.apply(this, arguments);
      /* only if the room actually opened. openBoardRoom bails on a sacked
         manager and on a missing world, and swallowing the summons in
         either case would lose a meeting the player never got. */
      guard('invite', () => {
        if (typeof document === 'undefined') return;
        if (!document.getElementById('brRoom')) return;
        consumeInvitation();
      });
      return r;
    };
  }

  if (typeof ACTIONS !== 'undefined' && has(ACTIONS.boardGo)) {
    const previousGo = ACTIONS.boardGo;
    ACTIONS.boardGo = function boardGoNoStaleCrisis() {
      if (!(G.boardCall && G.boardCall.kind)) {
        guard('invite', consumeInvitation);
        return openBoardRoom('checkin');
      }
      return previousGo.apply(this, arguments);
    };
  }

  try {
    window.RBSBoard = Object.freeze({
      brFacts, gradeOf, seasonShape, cupState, BANDS, consumeInvitation,
    });
  } catch (error) { /* no window */ }
}());
