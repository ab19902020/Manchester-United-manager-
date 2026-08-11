/* global G, PQ, PANS, LEAGUES, PYRAMIDS, DIV_NAMES, clamp, ordinal, esc, fmtM,
          fmtW, divMembers, myDiv, tableRows, playerById, offerById, MU, POSGROUP,
          pledgeKept, pledgeBroken, closeModal, render, boardTarget, ACTIONS,
          askPrice, persInfo, playerCeiling, fixCtx, squadWage */
/* global pqFacts:writable, pressBank:writable, expectPos:writable,
          dealMerit:writable, judgeSeasonPledges:writable, vCups:writable,
          openInterestPhase:writable, interestReasons:writable, leaguePos:writable,
          interestScore:writable, completeSigning:writable, buzz:writable,
          scoutTick:writable, vDressingRoom:writable, mail:writable */

/* =====================================================================
   INTERACTIONS — everything that talks to you, in the division you are
   actually in
   ---------------------------------------------------------------------
   The boardroom told a league leader he was "about where we asked you to
   be" because it graded on `pos < target` and there is nothing above
   first. Auditing the rest of the game for the same shape of mistake
   turned up seven more, all of them the same idea: a question, a promise
   or a target written for one twenty-club Premier League and then asked
   of a twenty-four-club division with different rules.

   Measured in a live career:

     4th in League Two — an automatic promotion place —
       "4th and in the mix. Is Europe the target or the minimum?"
     14th of 24 in the National League — mid-table —
       "You are closer to the bottom than the top. Is this a relegation
        fight?", in a division this game relegates nobody from
     the weakest club in every division —
       "The board expects 24th or better"

   The fix is one idea applied eight times. The game already knows the
   shape of every division: `divMembers` gives the size, `PYRAMIDS` gives
   how many go up and how many go down, and `G.clSpots` gives who gets
   into Europe. Nothing here hardcodes a number that the world can
   answer for itself, which also means it stays correct when the leagues,
   clubs and fixtures being worked on elsewhere land.
   ===================================================================== */

(function interactions() {
  'use strict';

  const has = (fn) => typeof fn === 'function';

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[interactions: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  /* -------------------------------------------------------------------
     0. THE SHAPE OF A DIVISION
     -------------------------------------------------------------------
     One source of truth, read from the world rather than written down.
     England moves 3, 3, 4 and 2, so the relegation zone is a different
     size in every division and does not exist at all in the National
     League — and every one of the bugs below came from assuming
     otherwise. Nothing here names a division: add a league, resize one,
     or change who goes up and this follows it.
     ------------------------------------------------------------------- */
  let SHAPE_CACHE = {};
  let shapeKey = '';

  function divShape(div) {
    return guard('shape', () => {
      const d = div || myDiv();
      const key = `${G.season}|${(G.clubs || []).length}`;
      if (shapeKey !== key) { SHAPE_CACHE = {}; shapeKey = key; }
      if (SHAPE_CACHE[d]) return SHAPE_CACHE[d];

      const size = (divMembers(d) || []).length;
      const L = (typeof LEAGUES !== 'undefined' && LEAGUES[d]) || {};
      const pyr = (typeof PYRAMIDS !== 'undefined' && PYRAMIDS[L.cc]) || [];
      let up = 0;
      let down = 0;
      pyr.forEach((row) => {
        if (row[0] === d) down = row[2] | 0;      /* this division sends this many down */
        if (row[1] === d) up = row[2] | 0;        /* and receives this many from below */
      });
      /* who actually gets into Europe, asked of the world rather than assumed */
      const euro = (G.clSpots || []).filter((i) => ((G.clubs || [])[i] || {}).league === d).length;

      const shape = {
        div: d,
        name: (typeof DIV_NAMES !== 'undefined' && DIV_NAMES[d]) || (L.name || 'the league'),
        size,
        tier: L.tier || 0,
        up,
        down,
        euro,
        hasPromotion: up > 0,
        hasRelegation: down > 0,
        hasEurope: euro > 0,
        /* 1 .. upTo are promoted; dropFrom .. size are relegated */
        upTo: up,
        dropFrom: down > 0 ? (size - down + 1) : null,
        /* The worst finish a board would ever ask for. Where clubs go down
           it is the last safe place, which explains itself. Where none do —
           the National League — it is "not the bottom two", which is a real
           ask without being a punishment: boardHealth() scores (exp - pos)
           at 1.6 a place every month, so a floor set too high turns the
           weakest club in a division into an unsackable one and a floor set
           too low turns it into a doomed one. */
        floor: down > 0 ? Math.max(1, size - down) : Math.max(1, size - 2),
        /* how many matches this division actually plays */
        matches: size < 2 ? 38 : (size <= 12 ? (size - 1) * 3 : (size - 1) * 2),
      };
      SHAPE_CACHE[d] = shape;
      return shape;
    }, {
      div: div || 'PL', name: 'the league', size: 20, tier: 1, up: 0, down: 3, euro: 4,
      hasPromotion: false, hasRelegation: true, hasEurope: true,
      upTo: 0, dropFrom: 18, floor: 17, matches: 38,
    });
  }

  /* what a position means in this division, in words */
  function zoneOf(pos, s) {
    if (pos == null) return 'none';
    if (s.hasPromotion && pos <= s.upTo) return 'promotion';
    if (s.hasEurope && pos <= s.euro) return 'europe';
    if (s.hasRelegation && pos >= s.dropFrom) return 'relegation';
    if (s.hasPromotion && pos <= s.upTo + 3) return 'chasing';
    if (s.hasRelegation && pos >= s.dropFrom - 3) return 'trouble';
    if (!s.hasRelegation && pos > Math.round(s.size * 0.6)) return 'nothing';
    return 'mid';
  }

  try { window.RBSShape = Object.freeze({ divShape, zoneOf }); } catch (error) { /* no window */ }

  /* -------------------------------------------------------------------
     1. THE MANAGER'S OWN CONTRACT
     -------------------------------------------------------------------
     dealMerit() scored the season with `pos < obj.pos`, the same line the
     boardroom had. Measured: 1st against a target of 1st scored 0, and
     2nd against a target of 2nd scored 0. Merit of 3 is what makes the
     board come to you with a new deal mid-season, and the league title
     is only written into G.honours at the end of May, so winning the
     league from a title-winning position could not earn a contract.
     ------------------------------------------------------------------- */
  if (has(dealMerit)) {
    const previousMerit = dealMerit;
    dealMerit = function dealMeritWithCeiling() {
      const base = previousMerit.apply(this, arguments) || 0;
      return guard('merit', () => {
        const pos = leaguePos(G.my);
        const obj = has(boardTarget) ? boardTarget() : null;
        const target = obj && obj.pos ? obj.pos : null;
        if (!pos || !target) return base;
        /* the term the old function added, so it can be taken back out */
        const old = pos < target ? Math.min(3, target - pos) : (pos > target + 3 ? -2 : 0);
        /* and the one that respects the ceiling */
        let fresh;
        if (pos === 1) fresh = 3;                       /* nowhere better to be */
        else if (pos < target) fresh = Math.min(3, target - pos);
        else if (pos === target) fresh = 1;             /* you did what was asked */
        else if (pos > target + 3) fresh = -2;
        else fresh = 0;
        return base - old + fresh;
      }, base);
    };
  }

  /* -------------------------------------------------------------------
     2. A TARGET THAT MEANS SOMETHING
     -------------------------------------------------------------------
     expectPos() gives the bottom-ranked club `index + 2` capped at the
     division size, so the weakest club in every division was told "the
     board expects 24th or better". No board asks a club to finish last.
     The floor is the last safe position where relegation exists.
     ------------------------------------------------------------------- */
  /* THE SQUAD YOU ACTUALLY HAVE.

     `expectPos` ranks a division by reputation, and reputation does not
     move when you sell people. Measured: Manchester United sold Bruno
     Fernandes, Matthijs de Ligt and Bryan Mbeumo in one window — the top
     sixteen dropped from 85.2 to 83.7 — and the board still asked for
     <b>5th</b>. Not one place. The same blindness covers an injury crisis
     and a promoted side that never strengthened.

     (Promotion itself was already handled and did not need touching: a
     promoted club carries a low reputation into its new division, so
     Ipswich, Coventry and Hull all sit on the floor of 17th in the
     Premier League. Worth saying, because I had it on the open list as a
     defect and it is not one.)

     So the expectation is now half what the club is and half what it can
     put out, and bounded so it can move a few places rather than
     collapse — a board that halves its demands the moment you sell
     somebody is as wrong as one that never notices. */
  const SQUAD_WEIGHT = 0.5;    /* how much of the expectation is the squad, not the badge */
  const EXPECT_SWING = 5;      /* most places the squad may move it from reputation */
  /* A board notices a weakened squad faster than it rewards a strengthened
     one. Symmetric weighting also moved the default Manchester United
     target from 5th to 3rd before the manager had done anything, which is
     a difficulty change nobody asked for; this keeps the response to
     selling your best players while leaving day one roughly where it was. */
  const HARDEN = 0.4;

  function squadRating(c) {
    const list = (c.players || [])
      .filter((p) => p && !p.youth && !p.loan)
      .map((p) => p.ovr || 0)
      .sort((a, b) => b - a);
    if (!list.length) return 0;
    const n = Math.min(16, list.length);
    let total = 0;
    for (let i = 0; i < n; i += 1) total += list[i];
    return total / n;
  }

  let EXPECT_CACHE = {};
  let expectKey = '';

  function expectationTable(div) {
    const key = `${G.season}|${G.day}|${(G.clubs || []).length}`;
    if (expectKey !== key) { EXPECT_CACHE = {}; expectKey = key; }
    if (EXPECT_CACHE[div]) return EXPECT_CACHE[div];

    const mem = (divMembers(div) || []).slice();
    const s = divShape(div);
    const byRep = mem.slice().sort((a, b) => (G.clubs[b].rep || 0) - (G.clubs[a].rep || 0));
    const bySquad = mem.slice().sort((a, b) => squadRating(G.clubs[b]) - squadRating(G.clubs[a]));
    const repRank = {};
    const squadRank = {};
    byRep.forEach((i, ix) => { repRank[i] = ix; });
    bySquad.forEach((i, ix) => { squadRank[i] = ix; });

    const blended = mem.slice().sort((a, b) => {
      const sa = repRank[a] * (1 - SQUAD_WEIGHT) + squadRank[a] * SQUAD_WEIGHT;
      const sb = repRank[b] * (1 - SQUAD_WEIGHT) + squadRank[b] * SQUAD_WEIGHT;
      return sa - sb || repRank[a] - repRank[b];
    });

    const out = {};
    blended.forEach((i, ix) => {
      /* the original's "+2" slack, kept */
      const fromSquad = Math.min(mem.length, ix + 2);
      const fromRep = Math.min(mem.length, repRank[i] + 2);
      const move = fromSquad - fromRep;
      const eased = fromRep + move * (move > 0 ? 1 : HARDEN);
      const bounded = clamp(eased, fromRep - EXPECT_SWING, fromRep + EXPECT_SWING);
      out[i] = { pos: clamp(Math.round(bounded), 1, s.floor), rep: clamp(fromRep, 1, s.floor) };
    });
    EXPECT_CACHE[div] = out;
    return out;
  }

  /* why this club's target is not simply its reputation rank */
  function expectWhy(ci) {
    return guard('why', () => {
      const c = (G.clubs || [])[ci];
      if (!c) return '';
      const row = expectationTable(c.league)[ci];
      if (!row) return '';
      const moved = row.pos - row.rep;
      if (moved >= 3) return 'the squad is short of what this club usually puts out';
      if (moved >= 1) return 'the squad is a little lighter than the badge suggests';
      if (moved <= -3) return 'the squad is a good deal stronger than this club\u2019s standing';
      if (moved <= -1) return 'the squad is stronger than the badge suggests';
      return '';
    }, '');
  }

  if (has(expectPos)) {
    const previousExpect = expectPos;
    expectPos = function expectPosBySquad(ci) {
      const raw = previousExpect.apply(this, arguments);
      return guard('expect', () => {
        const club = (G.clubs || [])[ci];
        if (!club) return raw;
        const s = divShape(club.league);
        /* a takeover that promises the title overrides everything, and the
           layer under this one signals it by returning 1 */
        if (raw === 1) return 1;
        const row = expectationTable(club.league)[ci];
        if (!row) return clamp(Math.round(raw), 1, s.floor);
        return row.pos;
      }, raw);
    };
  }

  /* -------------------------------------------------------------------
     3. THE PRESS ROOM LEARNS WHICH DIVISION IT IS IN
     ------------------------------------------------------------------- */
  if (has(pqFacts)) {
    const previousFacts = pqFacts;
    pqFacts = function pqFactsWithShape() {
      const F = previousFacts.apply(this, arguments);
      if (!F) return F;
      guard('facts', () => {
        const s = divShape(myDiv());
        F.shape = s;
        F.zone = zoneOf(F.pos, s);

        /* 7. a season is not always (n-1) x 2.
           The fixture generator gives every division of twelve or fewer an
           extra half-cycle, so the Scottish, Austrian, Swiss, Danish,
           Serbian, Ukrainian and Croatian leagues play (n-1) x 3. The press
           room assumed twice, so `games left` hit zero at matchday 22 of 33
           — the run-in questions were asked in midwinter and never once in
           the actual run-in, and both race definitions collapsed to their
           floor for the whole second half of the season. */
        if (F.games !== s.matches && s.matches > 0) {
          F.games = s.matches;
          F.left = Math.max(0, s.matches - (F.played || 0));
          const rows = F.rows || tableRows(myDiv()) || [];
          const window = Math.max(4, Math.round(F.left * 0.45));
          F.inTitleRace = F.played >= 12 && F.pos <= 4 && F.gapTop <= window;
          F.inDropFight = s.hasRelegation && F.played >= 12
            && F.pos >= rows.length - 5 && F.gapDrop <= window;
          F.runIn = F.played >= 10 && F.left <= 6 && F.left > 0;
        }
        /* and nobody is in a relegation fight in a division that relegates
           nobody, however near the bottom they are */
        if (!s.hasRelegation) F.inDropFight = false;
      });
      return F;
    };
  }

  /* the four table questions, re-gated on the division's real geometry */
  const REGATE = {
    'pos-top': {
      w: (F) => F.pos && F.pos <= 2,
      q: (F) => {
        const s = F.shape;
        if (s.hasEurope) {
          return [`${ordinal(F.pos)} in the table. Are you allowed to say the word title yet?`,
            `You are ${ordinal(F.pos)}. Does this squad believe it can stay there?`,
            'Top of the pile. Is the pressure different up here?'];
        }
        return [`${ordinal(F.pos)} in ${s.name}. Are you allowed to say the word promotion yet?`,
          `You are ${ordinal(F.pos)}, and ${s.up === 1 ? 'only the champions go up' : `the top ${s.up} go up`}. Is this squad built to hold it?`,
          `Top of ${s.name}. Does a club like this handle being favourite?`];
      },
    },
    'pos-euro': {
      /* only where there is a Europe to qualify for */
      w: (F) => F.pos && F.shape.hasEurope && F.pos >= 3 && F.pos <= Math.max(6, F.shape.euro + 2),
      q: (F) => [`${ordinal(F.pos)} and in the mix. Is Europe the target or the minimum?`,
        `You are ${ordinal(F.pos)}. Is that where this club should be?`,
        'The gap at the top — is it closeable this season?'],
    },
    'pos-mid': {
      w: (F) => {
        if (!F.pos) return false;
        const z = F.zone;
        return z === 'mid';
      },
      q: (F) => [`${ordinal(F.pos)}. For a club of this size, is that acceptable?`,
        'Mid-table. Is this a season of transition or a season of underachievement?',
        `You are ${ordinal(F.pos)}. What has to change to climb?`],
    },
    'pos-bad': {
      /* the bottom of a division that actually sends clubs down */
      w: (F) => F.pos && F.shape.hasRelegation && (F.zone === 'relegation' || F.zone === 'trouble'),
      q: (F) => {
        const s = F.shape;
        const inIt = F.pos >= s.dropFrom;
        return [`${ordinal(F.pos)} in ${s.name}. How worried are you?`,
          inIt
            ? `You are in the bottom ${s.down}. Is this a relegation fight?`
            : `${s.dropFrom - F.pos === 0 ? 'You are on the line' : `${s.dropFrom - F.pos} place${s.dropFrom - F.pos === 1 ? '' : 's'} above the drop`}. Is this a relegation fight?`,
          `Down in ${ordinal(F.pos)}. Do you still believe you are the right man?`];
      },
    },
  };

  guard('regate', () => {
    if (typeof PQ === 'undefined' || !Array.isArray(PQ)) return;
    PQ.forEach((rule) => {
      const fix = REGATE[rule.id];
      if (!fix) return;
      rule.w = (F) => {
        try { return !!(F && F.shape) && !!fix.w(F); } catch (error) { return false; }
      };
      rule.q = (F) => {
        try { return fix.q(F); } catch (error) { return ['Where do you think this season is going?']; }
      };
    });
  });

  /* the two questions the pyramid needed and never had */
  const NEW_Q = [
    {
      id: 'pos-promo',
      w: (F) => F && F.shape && F.pos && !F.shape.hasEurope && F.shape.hasPromotion
        && F.pos >= 2 && F.pos <= F.shape.upTo + 3,
      q: (F) => {
        const s = F.shape;
        const inIt = F.pos <= s.upTo;
        return [inIt
          ? `${ordinal(F.pos)}, inside the ${s.up === 1 ? 'automatic place' : `top ${s.up}`}. Can you hold it to May?`
          : `${ordinal(F.pos)}, ${F.pos - s.upTo} off the ${s.up === 1 ? 'one automatic place' : `top ${s.up}`}. Is going up realistic from here?`,
        `Promotion out of ${s.name} — is that what this season is for, or is it a bonus?`,
        `Does this squad know how to get out of ${s.name}?`,
        `${F.left} to play. Is it in your hands?`];
      },
    },
    {
      id: 'pos-nothing',
      /* the bottom half of a division nobody is relegated from */
      w: (F) => F && F.shape && F.pos && !F.shape.hasRelegation && F.zone === 'nothing' && F.played >= 10,
      q: (F) => [`${ordinal(F.pos)} with ${F.left} to play, and nothing left to chase. What is this season for now?`,
        'There is nothing above you and nothing below you. How do you keep a dressing room honest?',
        'Is this the part of the year where you find out about people?',
        'Will we see the younger ones between now and May?'],
    },
  ];

  guard('questions', () => {
    if (typeof PQ === 'undefined' || !Array.isArray(PQ)) return;
    const have = new Set(PQ.map((r) => r.id));
    NEW_Q.forEach((r) => { if (!have.has(r.id)) PQ.push(r); });
  });

  guard('answers', () => {
    if (typeof PANS === 'undefined') return;
    const A = {
      'pos-promo': [
        ['🎯 It is the whole point', 'Promotion is what this season is for. I said it in June and I am not going to get shy about it now.'],
        ['🧊 Nothing is decided', 'There are a lot of points still to play for and this division has embarrassed better sides than us.'],
        ['💪 We are good enough', 'If we do what we are capable of we go up. Whether we do it is down to us and nobody else.'],
        ['🛡️ Take the pressure off them', 'I would rather the expectation sat with me than with a dressing room full of young players.'],
      ],
      'pos-nothing': [
        ['🌱 Look at the young ones', 'This is exactly when you find out about the lads who have been waiting. They will get their chance now.'],
        ['😠 Standards do not drop', 'Nothing to play for is a phrase I do not accept. People are playing for next season and for their careers.'],
        ['🧊 Finish it properly', 'You finish a season the way you want to start the next one. The supporters still pay the same money in April.'],
        ['📋 Planning already', 'Honestly? Part of my head is on the summer. Anyone who says otherwise is not doing the job properly.'],
      ],
    };
    Object.keys(A).forEach((k) => { if (!PANS[k]) PANS[k] = () => A[k]; });
  });

  /* a promotion race is the hot topic in four of the five English divisions,
     and the weighting layer has never heard of it */
  if (has(pressBank)) {
    const previousBank = pressBank;
    pressBank = function pressBankPyramid() {
      const bank = previousBank.apply(this, arguments) || [];
      return guard('bank', () => {
        const F = pqFacts();
        if (!F || !F.shape || !bank.length) return bank;
        const boost = {};
        if (F.zone === 'promotion' || F.zone === 'chasing') boost['pos-promo'] = 5;
        if (F.zone === 'relegation') boost['pos-bad'] = 5;
        if (F.zone === 'nothing') boost['pos-nothing'] = 4;
        const extra = [];
        bank.forEach((q) => {
          const n = boost[String(q.id).split('#')[0]] || 0;
          for (let i = 0; i < n; i += 1) extra.push(q);
        });
        return extra.length ? bank.concat(extra) : bank;
      }, bank);
    };
  }

  /* -------------------------------------------------------------------
     4. PROMISES JUDGED AGAINST THE REAL RELEGATION ZONE
     -------------------------------------------------------------------
     judgeSeasonPledges used `pos > rows.length - 3` in every division:

       League One relegates 4 — finish 21st, go down, and "we will stay
         up" was marked KEPT
       League Two relegates 2 — finish 22nd, stay up, and the same
         promise was marked BROKEN
       the National League relegates nobody — and the promise broke for a
         relegation that cannot happen

     Breaking one costs 7 fan approval and 6 patience, so it is not
     cosmetic. The rest of the function is unchanged.
     ------------------------------------------------------------------- */
  if (has(judgeSeasonPledges)) {
    judgeSeasonPledges = function judgeSeasonPledgesByShape() {
      guard('pledges', () => {
        const open = (G.pledges || []).filter((p) => p.state === 'open'
          && ['finish', 'survive', 'trophy'].indexOf(p.kind) >= 0 && p.season === G.season);
        if (!open.length) return;
        let pos = null;
        try { pos = leaguePos(G.my); } catch (error) { pos = null; }
        const wonThis = (G.honours || []).filter((h) => h.season === G.season).length;
        const s = divShape((G.clubs[G.my] || {}).league);
        const relegated = !!(s.hasRelegation && pos != null && s.dropFrom && pos >= s.dropFrom);

        open.forEach((p) => {
          if (p.kind === 'finish') {
            if (pos != null && pos <= (p.target || 4)) {
              pledgeKept(p, 'You said it and you did it',
                `You told them you would ${esc(p.label || 'deliver')}. You finished <b>${ordinal(pos)}</b>.`,
                p.target === 1 ? 12 : 6, p.target === 1 ? 10 : 5);
            } else {
              pledgeBroken(p, 'THE PROMISE THAT WASN’T',
                `You told the world you would ${esc(p.label || 'deliver')}. You finished <b>${pos != null ? ordinal(pos) : 'short'}</b>.`,
                p.target === 1 ? -10 : -7, p.target === 1 ? 9 : 6);
            }
          } else if (p.kind === 'survive') {
            if (!s.hasRelegation) {
              /* there was never anything to survive */
              pledgeKept(p, 'You kept them up',
                `Nobody is relegated from ${s.name}, so the promise was never in danger — `
                + `and you finished <b>${pos != null ? ordinal(pos) : 'the season'}</b>.`, 2, 1);
            } else if (!relegated) {
              pledgeKept(p, 'You kept them up',
                `You promised this club would stay in ${s.name}. You finished <b>${ordinal(pos)}</b>, `
                + `${s.dropFrom - pos} clear of the bottom ${s.down}.`, 7, 8);
            } else {
              pledgeBroken(p, 'RELEGATED, AND HE SAID IT WOULD NOT HAPPEN',
                'You stood in that room and promised these supporters they would not go down. '
                + `You finished <b>${ordinal(pos)}</b> of ${s.size}.`, -14, 14);
            }
          } else if (p.kind === 'trophy') {
            if (wonThis > 0) {
              pledgeKept(p, 'You went for it and you got it',
                'You said this club was going to win something. It has.', 9, 8);
            } else {
              pledgeBroken(p, 'ANOTHER SEASON WITH NOTHING',
                'You told them you were going for silverware and the cabinet is no fuller than it was.', -6, 5);
            }
          }
        });
      });
    };
  }

  /* -------------------------------------------------------------------
     5. TRANSFERS THAT TALK LIKE THE DIVISION THEY ARE IN
     -------------------------------------------------------------------
     A target's demands listed "European football" whenever the club was
     not in the Champions Cup — which is every club outside the top four,
     all the way down to the National League. And the interest score used
     `pos<=4 => +5, pos>=15 => -5`, so 15th of 24 — mid-table — was
     penalised as if it were relegation form, with "Your league position
     puts him off" shown as the reason.
     ------------------------------------------------------------------- */
  function positionTerm(pos, s) {
    if (!pos) return 0;
    const z = zoneOf(pos, s);
    if (z === 'promotion' || z === 'europe') return 5;
    if (z === 'chasing') return 3;
    if (z === 'relegation') return -6;
    if (z === 'trouble') return -3;
    return 0;
  }

  if (has(interestScore)) {
    const previousScore = interestScore;
    /* The first version of this took the old league-position term back out
       of the finished score and added the right one. That is wrong at the
       ends: the function it wraps clamps to 0–100 before returning, so on a
       score that had already saturated the correction was absorbed and the
       division was silently ignored again. The term is neutralised at
       source instead — `leaguePos` is the only thing the original reads to
       compute it, and only for that one line — so nothing needs unpicking
       afterwards. */
    interestScore = function interestScoreByDivision() {
      const pos = guard('interest.pos', () => leaguePos(G.my), null);
      if (!pos) return previousScore.apply(this, arguments);

      const s = divShape(myDiv());
      const realLeaguePos = leaguePos;
      let base;
      try {
        /* a position that scores neither the +5 nor the -5 */
        leaguePos = function leaguePosNeutral(ci) {
          return ci === G.my ? 10 : realLeaguePos.apply(this, arguments);
        };
        base = previousScore.apply(this, arguments);
      } finally {
        leaguePos = realLeaguePos;
      }
      return guard('interest', () => clamp(Math.round(base + positionTerm(pos, s)), 0, 100), base);
    };
  }

  if (has(interestReasons)) {
    const previousReasons = interestReasons;
    interestReasons = function interestReasonsByDivision(p) {
      const base = previousReasons.apply(this, arguments) || [];
      return guard('reasons', () => {
        const drop = ['You are challenging at the top of the table', 'Your league position puts him off'];
        const out = base.filter((r) => drop.indexOf(r[1]) < 0);
        const pos = leaguePos(G.my);
        const s = divShape(myDiv());
        const z = zoneOf(pos, s);
        if (z === 'europe') out.push(['+', 'You are in the European places']);
        else if (z === 'promotion') out.push(['+', `You are in the ${s.up === 1 ? 'automatic promotion place' : `top ${s.up}`} and going up`]);
        else if (z === 'chasing') out.push(['+', `You are pushing for promotion out of ${s.name}`]);
        else if (z === 'relegation') out.push(['-', `He can see you are in the bottom ${s.down}`]);
        else if (z === 'trouble') out.push(['-', 'You are too close to the drop for his liking']);
        return out.slice(0, 5);
      }, base);
    };
  }

  if (has(openInterestPhase)) {
    const previousPhase = openInterestPhase;
    openInterestPhase = function openInterestPhaseByDivision(p, fee) {
      const n = interestScore(p, fee, null);
      /* the accepting path is untouched */
      if (n >= 34) return previousPhase.apply(this, arguments);
      let wrote = false;
      guard('phase', () => {
        const s = divShape(myDiv());
        const pos = leaguePos(G.my);
        const z = zoneOf(pos, s);
        const want = [];
        if (p.contract >= 3) want.push('his club to make him available');
        if (p.ovr >= 84 && s.tier === 1) want.push('a genuine title project');
        else if (p.ovr >= 74 && s.hasPromotion) want.push('a club that is actually going up');
        /* Europe only where there is a Europe to be had */
        if (s.hasEurope && (G.clSpots || []).indexOf(G.my) < 0) want.push('European football');
        else if (s.hasPromotion && z !== 'promotion' && z !== 'chasing') {
          want.push(`to believe this club can get out of ${s.name}`);
        }
        if (z === 'relegation' || z === 'trouble') want.push('to see you out of trouble first');
        else if (z === 'mid' || z === 'nothing') want.push('to see you climbing the table');
        want.push(`a significant rise on his current ${fmtW(p.wage)}`);

        closeModal();
        mail('transfer', `💬 ${p.name} is not sold on the move yet`,
          `A fee of <b>${fmtM(fee)}</b> was agreed with ${esc(G.clubs[p.club].name)}, but his representatives `
          + `say he would need ${want.slice(0, 3).join(', ')} before committing.<br><br>`
          + `<span class="xs faint">Interest: ${n}/100. Improve the package, sell him the project, or come `
          + 'back when his situation changes — there is no ban on talking again.</span>');
        render();
        wrote = true;
      });
      if (!wrote) return previousPhase.apply(this, arguments);
      return undefined;
    };
  }

  /* the Cups screen told a National League manager to "finish top four"
     to reach the Champions Cup */
  if (has(vCups)) {
    const previousCups = vCups;
    vCups = function vCupsByDivision() {
      let h = previousCups.apply(this, arguments);
      guard('cups', () => {
        if (h.indexOf('finish top four') < 0) return;
        const s = divShape(myDiv());
        const line = s.hasEurope
          ? `Not qualified this season — finish in the top ${s.euro || 4}.`
          : `Not qualified this season — the Champions Cup is entered from the Premier League, `
            + `and you are in ${s.name}.`;
        h = h.replace('Not qualified this season — finish top four.', line)
          .replace('Not qualified this season — finish top four.', line);
      });
      return h;
    };
  }

  /* -------------------------------------------------------------------
     6. A SUPPORTERS' FEED WITH A SENSE OF SCALE
     -------------------------------------------------------------------
     "HERE WE GO" fired at £40M and "what a signing" at overall 82, so a
     National League club-record signing and the best player in League Two
     never registered at all. The thresholds now come from the division
     the club is in, the same way the goal bonus and the loan fee do.
     ------------------------------------------------------------------- */
  function levelOf(s) {
    /* what counts as a lot of money, and a lot of player, at this level */
    const byTier = { PL: [4e7, 82, 86], CH: [6e6, 74, 78], L1: [8e5, 68, 72], L2: [3e5, 64, 68], NL: [8e4, 60, 64] };
    if (byTier[s.div]) return byTier[s.div];
    /* anything the pyramid work adds later is sized from its own clubs */
    const reps = (divMembers(s.div) || []).map((i) => (G.clubs[i] || {}).rep || 0);
    const top = reps.length ? Math.max.apply(null, reps) : 6000;
    return [Math.max(5e4, Math.round(top * 900)), clamp(Math.round(top / 115), 58, 84), clamp(Math.round(top / 110), 60, 88)];
  }

  function scaledSigningBuzz(p, fee, from, s) {
    const [bigFee, goodOvr, starOvr] = levelOf(s);
    const record = fee >= bigFee;
    const short = (G.clubs[G.my] || {}).short || 'us';
    buzz('transfer', `HERE WE GO ✅ ${p.name} to ${short}${from ? ` from ${from}` : ''}, ${fmtM(fee)}. Medical done.`,
      { tone: 'pos', big: record });
    const line = p.ovr >= starOvr
      ? `${p.name} at ${p.age} for ${fmtM(fee)} is a serious bit of business for this level 🔴`
      : p.ovr >= goodOvr
        ? `That is a proper signing for ${s.name}. ${p.name} makes us better on Saturday.`
        : p.age <= 21
          ? `${p.name} is ${p.age}. One for the future but we needed one for NOW.`
          : record
            ? `${fmtM(fee)} is big money for this club. Hope he is worth it.`
            : `Decent bit of business, that. ${p.name} improves us.`;
    buzz('transfer', line, { tone: p.ovr >= goodOvr ? 'pos' : 'neu', big: p.ovr >= starOvr || record });
    if (p.ovr >= starOvr) buzz('transfer', `How have ${short} got him at this level? Sickening.`, { rival: 1, tone: 'neu' });
  }

  if (has(completeSigning) && has(buzz)) {
    const previousSigning = completeSigning;
    completeSigning = function completeSigningScaled(p, fee) {
      const seller = (G.clubs || [])[p.club];
      const from = seller ? seller.short : '';
      const snapshot = { name: p.name, ovr: p.ovr, age: p.age };
      const realBuzz = buzz;
      /* the original posts two Premier-League-sized lines; take them out and
         post the same two, measured against this division */
      let s = null;
      try { s = divShape(myDiv()); } catch (error) { s = null; }
      if (s) buzz = function suppressed(kind) { if (kind !== 'transfer') return realBuzz.apply(this, arguments); return undefined; };
      try {
        return previousSigning.apply(this, arguments);
      } finally {
        buzz = realBuzz;
        if (s) guard('buzz', () => scaledSigningBuzz(snapshot, fee, from, s));
      }
    };
  }

  if (ACTIONS && has(ACTIONS.offerAccept) && has(buzz)) {
    const previousAccept = ACTIONS.offerAccept;
    ACTIONS.offerAccept = function offerAcceptScaled(el) {
      /* read the deal before it is executed, the same way the layer under
         this one does, so the reaction can be sized against the division */
      let sold = null;
      guard('sold-read', () => {
        const offer = has(offerById) && el && el.dataset ? offerById(el.dataset.arg) : null;
        const player = offer ? playerById(offer.pid) : null;
        if (player) sold = { name: player.name, ovr: player.ovr, fee: offer.fee || 0, shape: divShape(myDiv()) };
      });
      const realBuzz = buzz;
      if (sold) {
        buzz = function suppressTransfer(kind) {
          if (kind === 'transfer') return undefined;
          return realBuzz.apply(this, arguments);
        };
      }
      try {
        return previousAccept.apply(this, arguments);
      } finally {
        buzz = realBuzz;
        if (sold) {
          guard('sold-buzz', () => {
            const [bigFee, goodOvr, starOvr] = levelOf(sold.shape);
            const key = sold.ovr >= starOvr;
            realBuzz('transfer', key
              ? `Selling ${sold.name} for ${fmtM(sold.fee)}. Explain this to me like I am five.`
              : sold.ovr >= goodOvr
                ? `${sold.name} gone for ${fmtM(sold.fee)}. He was one of the better ones at this level. Replace him.`
                : `That is ${sold.name} gone then. ${fmtM(sold.fee)}. Reinvest it properly.`,
            { tone: sold.ovr >= goodOvr ? 'neg' : 'neu', big: key || sold.fee >= bigFee });
          });
        }
      }
    };
  }

  /* -------------------------------------------------------------------
     8. A SCOUT WHO HAS AN OPINION
     -------------------------------------------------------------------
     Three weeks of a scout's time produced one sentence:

       "Bill Fraser has completed a full report on X (ST, LEE). Overall
        68, potential ★★★. Attributes are now fully revealed."

     which is the numbers you can already see on his card, and reads
     identically whether a Premier League scout is watching a superstar or
     a National League scout is watching a non-league centre half. A scout
     is sent to answer one question — is he any good, and is he any good
     FOR US — and nothing in there answered it.

     The report now says where he would sit in your squad, what he would
     cost against what you have, what kind of professional he is, how far
     he is likely to actually get, and then gives a verdict. Every figure
     is measured against your club and your division rather than against
     the Premier League.
     ------------------------------------------------------------------- */
  function bestAtPosition(club, pos) {
    const grouper = (typeof POSGROUP === 'function') ? POSGROUP : null;
    const group = grouper ? grouper(pos) : null;
    let best = null;
    (club.players || []).forEach((x) => {
      if (x.youth || x.loan) return;
      const same = group && grouper ? grouper(x.pos) === group : x.pos === pos;
      if (!same) return;
      if (!best || x.ovr > best.ovr) best = x;
    });
    return best;
  }

  function scoutVerdict(p, me) {
    const s = divShape(myDiv());
    const [, goodOvr, starOvr] = levelOf(s);
    const rival = bestAtPosition(me, p.pos);
    const gap = rival ? p.ovr - rival.ovr : null;
    const ceiling = has(playerCeiling) ? playerCeiling(p) : (p.pot || p.ovr);
    const ask = has(askPrice) ? askPrice(p) : (p.value || 0);
    const wage = p.wage || 0;
    const room = Math.max(0, (me.wageCap || 0) * 1.18 - (has(squadWage) ? squadWage(me) : 0));
    const affordFee = ask <= (me.budget || 0);
    const affordWage = wage <= room;

    const lines = [];

    /* where he would sit */
    if (gap == null) {
      lines.push(`You have nobody else who plays there, so he would walk into the side.`);
    } else if (gap >= 4) {
      lines.push(`He is <b>${gap}</b> better than ${esc(rival.name)}, who is the best you have in that position. He improves you on day one.`);
    } else if (gap >= 1) {
      lines.push(`Marginally ahead of ${esc(rival.name)} — <b>${gap}</b> on overall. He would compete rather than walk in.`);
    } else if (gap >= -3) {
      lines.push(`About the same as ${esc(rival.name)}. Squad depth rather than a first choice.`);
    } else {
      lines.push(`${esc(rival.name)} is <b>${-gap}</b> better than him. He does not get in this side as things stand.`);
    }

    /* how far he actually gets */
    if (p.age <= 23) {
      const growth = ceiling - p.ovr;
      if (growth >= 10) lines.push(`At ${p.age} there is a lot still to come — my honest read is he tops out around <b>${ceiling}</b>.`);
      else if (growth >= 4) lines.push(`He will improve, though not transform: I would expect him to settle around <b>${ceiling}</b>.`);
      else lines.push(`He is closer to the finished article than his age suggests. Around <b>${ceiling}</b> is where he lands.`);
    } else if (p.age >= 31) {
      lines.push(`He is ${p.age}. What you see is what you get, and it will not be there for long.`);
    }

    /* what it costs, in this club's money */
    const feeWord = affordFee ? 'inside the budget' : `beyond the <b>${fmtM(me.budget || 0)}</b> you have`;
    const wageWord = affordWage ? 'and the wages fit' : 'and the wages are the problem, not the fee';
    lines.push(`They want about <b>${fmtM(ask)}</b>, which is ${feeWord}, ${wageWord} — he is on <b>${fmtW(wage)}</b>.`);

    /* what kind of professional */
    const pers = has(persInfo) ? persInfo(p) : null;
    if (pers) lines.push(`Character: <b>${esc(pers.lbl)}</b>. ${esc(pers.d)}`);

    /* The verdict is about THIS squad and THIS club's money, in that
       order. A first pass ranked it on raw overall against the division's
       star threshold, which told a National League club to sign Kylian
       Mbappé — a player it could not afford by three orders of magnitude
       — and told the same club that a man eleven better than anything it
       owned "would not transform us". What a scout answers is: could we
       have him, and would he improve us. */
    let verdict;
    const reachable = affordFee && affordWage;
    const better = gap == null ? 6 : gap;
    if (!affordFee && !affordWage) {
      verdict = 'Admire him from a distance. We can pay neither the fee nor the wages, and he knows it.';
    } else if (!reachable && better >= 4) {
      verdict = affordFee
        ? 'He would improve us and we cannot afford to pay him. That is the whole report.'
        : 'Exactly what we need and about double what we can spend. Ask me again if the money changes.';
    } else if (better >= 8 && reachable) {
      verdict = p.ovr >= starOvr
        ? 'Sign him. Players of this standard do not come to clubs like ours often.'
        : 'Sign him. He is a level above what we have there and we can pay for him.';
    } else if (better >= 2 && reachable) {
      verdict = 'I would take him. A clear improvement and the numbers work.';
    } else if (p.age <= 21 && rival && ceiling - rival.ovr >= 4 && reachable) {
      /* a prospect is judged on where he is going, not on where he is —
         "not for us" is the wrong answer about a twenty-year-old who will
         be better than anything you own inside two seasons */
      verdict = `Not yet, but not for long. He tops out above ${esc(rival.name)} and he is ${p.age}.`;
    } else if (better <= -4) {
      verdict = 'Not for us. We are already better served there.';
    } else if (p.age <= 21 && ceiling - p.ovr >= 8) {
      verdict = 'One to keep watching. He is not ready, but he might be worth waiting for.';
    } else {
      verdict = 'Worth a conversation. He would not embarrass us and he would not transform us.';
    }
    void goodOvr;

    return { lines, verdict };
  }

  if (has(scoutTick)) {
    const previousScout = scoutTick;
    scoutTick = function scoutTickWithOpinion() {
      /* the scouts about to hand in, noted before the tick decrements them */
      const finishing = [];
      guard('scout.pre', () => {
        (G.scouts || []).forEach((sc) => {
          if (sc.job && sc.job.days <= 1) finishing.push({ scout: sc.name, pid: sc.job.pid });
        });
      });
      if (!finishing.length) return previousScout.apply(this, arguments);

      const realMail = mail;
      mail = function suppressScout(type, title) {
        if (type === 'scout' && String(title).indexOf('Scout report:') === 0) return undefined;
        return realMail.apply(this, arguments);
      };
      try {
        return previousScout.apply(this, arguments);
      } finally {
        mail = realMail;
        guard('scout.report', () => {
          const me = G.clubs[G.my];
          finishing.forEach(({ scout, pid }) => {
            const p = playerById(pid);
            if (!p) return;
            const club = (G.clubs || [])[p.club];
            const v = scoutVerdict(p, me);
            realMail('scout', `🔭 Scout report: ${p.name}`,
              `<b>${esc(scout)}</b> has finished three weeks on <b>${esc(p.name)}</b> — `
              + `${p.pos}, ${p.age}, ${esc((club && club.name) || 'a free agent')}. `
              + `Overall <b>${p.ovr}</b>.<br><br>`
              + v.lines.map((l) => `• ${l}`).join('<br>')
              + `<br><br><b>Verdict:</b> ${esc(v.verdict)}`
              + '<br><br><span class="xs faint">His full attributes are now visible on his profile.</span>');
          });
        });
      }
    };
  }

  /* -------------------------------------------------------------------
     9. THE DRESSING ROOM KNOWS WHAT MATCH THIS IS
     -------------------------------------------------------------------
     The half-time room reads the score, the ratings, the legs, who is on
     a booking and who is drowning — it is the best-built screen in the
     game. The one thing it does not know is which match it is, so a cup
     final at half time and a July friendly in Chicago put the identical
     words on the whiteboard. `fixCtx` already works all of that out for
     the match engine.
     ------------------------------------------------------------------- */
  if (has(vDressingRoom)) {
    const previousRoom = vDressingRoom;
    vDressingRoom = function vDressingRoomInContext() {
      let h = previousRoom.apply(this, arguments);
      guard('dressing', () => {
        const f = (typeof MU !== 'undefined' && MU) ? MU.fix : null;
        if (!f || !has(fixCtx)) return;
        const ctx = fixCtx(f) || {};
        let line = ctx.label || ctx.comp || '';
        if (ctx.friendly && !ctx.trophy) line = 'Pre-season friendly';
        if (!line) {
          const sh = divShape(myDiv());
          line = sh.name;
        }
        const note = ctx.isFinal ? 'There is a trophy at the end of this one.'
          : ctx.isSemi ? 'Forty-five minutes from a final.'
            : ctx.friendly && !ctx.trophy ? 'It is July. Nothing is at stake but the work.'
              : ctx.euro ? 'A European night. They will remember this one either way.'
                : '';
        const html = `<div class="dr-comp" style="font-size:11px;font-weight:800;opacity:.8;letter-spacing:.04em">${esc(line)}</div>`
          + (note ? `<div class="dr-note" style="font-size:10px;opacity:.6">${esc(note)}</div>` : '');
        h = h.replace('<div class="dr-bh">HALF TIME</div>', `<div class="dr-bh">HALF TIME</div>${html}`);
      });
      return h;
    };
  }

  /* -------------------------------------------------------------------
     10. THE ACADEMY YOU PAY FOR DOES SOMETHING
     -------------------------------------------------------------------
     Measured over four hundred generated intakes per level:

         Manchester United, academy level 1 -> mean potential 85.2
         Manchester United, academy level 5 -> mean potential 85.8

     Five levels of investment, worth 0.6. The board hands academy
     upgrades out as a reward and the facility is on the stadium screen
     with a 1-5 rating, and it has no effect on anything.

     The cause is an overwrite rather than a calculation. The academy
     bonus lives in a wrapper at line 3563:

         const _genYouthPlayer = genYouthPlayer;
         genYouthPlayer = function(ci, rng){
           const p = _genYouthPlayer(ci, rng);
           const lvl = (G.clubs[ci].stad && G.clubs[ci].stad.youth) || 1;
           p.pot = clamp(p.pot + (lvl-1)*2, 58, 97);
           return p };

     and a later layer at 19401 assigns `genYouthPlayer = function(...)`
     outright rather than wrapping it, so that whole wrapper — bonus and
     all — is thrown away. Nothing errors; the facility simply stops
     existing.

     Reapplied here against the reach the current generator produces
     rather than as a flat number, so it works at every level of the
     pyramid: a National League intake is pitched at a National League
     club and a level-5 academy stretches what its best prospects might
     become. Level 1 is exactly what it is today, so nothing is nerfed.
     ------------------------------------------------------------------- */
  /* Sized twice. 0.13 applied from level 1 upward put Manchester United's
     mean intake potential at 94.2 with a top decile of 97 — a world-class
     player every year, and a decade of that inflates the world. And every
     club in the world has an academy level, not just yours: 92 at level 1,
     271 at level 2, 105 at 3, 16 at 4. So a bonus applied upward from
     level 1 lifts the entire pyramid.

     It is centred on level 2 instead, which is what most of the world has.
     The median club is untouched, a neglected academy is slightly worse,
     and the one you have paid to upgrade is meaningfully better. The world
     cannot inflate on it because the middle of the distribution does not
     move. */
  const ACADEMY_STEP = 0.09;   /* growth headroom gained per level above 2 */
  const ACADEMY_MID = 2;

  if (has(window.genYouthPlayer)) {
    const previousYouth = window.genYouthPlayer;
    window.genYouthPlayer = function genYouthPlayerWithAcademy(ci) {
      const p = previousYouth.apply(this, arguments);
      guard('academy', () => {
        const c = (G.clubs || [])[ci];
        if (!p || !c) return;
        const lvl = clamp((c.stad && c.stad.youth) || ACADEMY_MID, 1, 5);
        if (lvl === ACADEMY_MID) return;
        const reach = (p.pot || p.ovr) - p.ovr;
        if (!(reach > 0)) return;
        p.pot = clamp(Math.round(p.ovr + reach * (1 + (lvl - ACADEMY_MID) * ACADEMY_STEP)), p.ovr + 3, 97);
      });
      return p;
    };
  }

  try {
    window.RBSInteractions = Object.freeze({
      divShape, zoneOf, positionTerm, levelOf, scoutVerdict, bestAtPosition, ACADEMY_STEP,
      squadRating, expectationTable, expectWhy,
    });
  } catch (error) { /* no window */ }
}());
