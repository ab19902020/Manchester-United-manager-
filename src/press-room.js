/* global G, PQ, MU, clamp, ordinal, esc, divMembers, myDiv, gamesPlayed, leaguePos,
          expectPos, playerById, nextUserMatch, fixCtx, DIV_NAMES, CUP_DEFS, RIVALS,
          PANS, formStreak */
/* global pqFacts:writable, pressBank:writable */

/* =====================================================================
   THE PRESS ROOM — questions that know what match this is
   ---------------------------------------------------------------------
   Reported from a real save: six wins on the spin and the room asked
   whether it was going through a blip.

   Measured, with eight league matches played, a six-game winning run and
   a top-six position, the question pool looked like this:

       46 rules · 272 lines · picked uniformly at random
       generic "open-N" filler:  51.5% of the pool
       your six-win streak:      3 lines, about 1%
       your league position:     3 lines, about 1%

   So it was not that any single question was wrong. It was that half the
   room was context-free filler, the selection was a coin toss across
   every line, and a topic with ten interchangeable phrasings was ten
   times more likely to come up than the thing actually happening to you.

   Two things are fixed here.

   WHAT THE ROOM KNOWS. `pqFacts` had no idea which competition the match
   was in, which division you play in, how far into the season it is, or
   which eleven you picked. `fixCtx` already works all of the competition
   detail out for the match engine and nothing was passing it through, so
   most of this is plumbing rather than invention.

   WHICH QUESTION GETS ASKED. Selection is uniform over lines, so
   weighting is done the way the game already does it — the bank is a
   multiset and a topic appears in it as many times as it is worth. That
   is exactly the trick the existing occasion boost uses. Filler drops to
   one, an ordinary question is four, and whatever is actually happening
   to you — a run, a relegation scrap, a final, a derby, the last day —
   is worth twenty.
   ===================================================================== */

(function pressRoom() {
  'use strict';

  const has = (fn) => typeof fn === 'function';

  function guard(context, fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.error(`[press: ${context}]`, error); } catch (ignored) { /* no console */ }
      return fallback;
    }
  }

  /* -------------------------------------------------------------------
     1. WHAT THE ROOM KNOWS
     ------------------------------------------------------------------- */
  function seasonShape(div) {
    const n = (divMembers(div) || []).length;
    if (n < 2) return 38;
    return n <= 12 ? Math.round((n - 1) * 3) : (n - 1) * 2;
  }

  if (has(pqFacts)) {
    const previousFacts = pqFacts;
    pqFacts = function pqFactsInContext() {
      const F = previousFacts.apply(this, arguments);
      if (!F) return F;
      guard('facts', () => {
        const my = G.clubs[G.my];

        /* which match this is, and what competition it belongs to */
        const fix = F.post ? (MU && MU.fix) : (has(nextUserMatch) ? nextUserMatch() : null);
        F.fixture = fix || null;
        const ctx = (fix && has(fixCtx)) ? fixCtx(fix) : null;
        F.ctx = ctx;
        F.isCup = !!(ctx && ctx.cup);
        F.isEuro = !!(ctx && ctx.euro);
        F.isFriendly = !!(ctx && ctx.friendly);
        F.isFinal = !!(ctx && ctx.isFinal);
        F.isSemi = !!(ctx && ctx.isSemi);
        F.isKnockout = !!(ctx && ctx.knockout);
        F.comp = (ctx && (ctx.comp || ctx.short)) || (DIV_NAMES[my.league] || 'the league');
        F.compShort = (ctx && ctx.short) || (DIV_NAMES[my.league] || 'the league');
        F.round = (ctx && ctx.round) || null;

        /* which division you are in, and where you are in its season */
        F.div = my.league;
        F.divName = DIV_NAMES[my.league] || 'the league';
        F.totalMatchdays = seasonShape(my.league);
        F.played = has(gamesPlayed) ? gamesPlayed(G.my) : 0;
        F.matchday = F.played + (F.post ? 0 : 1);
        F.left = Math.max(0, F.totalMatchdays - F.played);
        const through = F.totalMatchdays ? F.played / F.totalMatchdays : 0;
        F.through = through;
        F.phase = through < 0.15 ? 'opening'
          : through < 0.4 ? 'early'
            : through < 0.7 ? 'midwinter'
              : through < 0.95 ? 'runin' : 'final-day';

        /* where you are, and what is realistically at stake */
        const size = (divMembers(my.league) || []).length || 20;
        const pos = F.pos || leaguePos(G.my);
        F.divSize = size;
        F.titleRace = pos <= 3 && through > 0.35;
        F.promoRace = my.league !== 'PL' && pos <= 6 && through > 0.35;
        F.dropFight = pos >= size - 4 && through > 0.35;
        F.midTable = !F.titleRace && !F.dropFight && !F.promoRace;

        /* a derby */
        F.isDerby = guard('derby', () => {
          if (!fix) return false;
          const opp = G.clubs[fix.h === G.my ? fix.a : fix.h];
          return !!(opp && typeof RIVALS !== 'undefined' && (RIVALS[my.key] || []).indexOf(opp.key) >= 0);
        }, false);

        /* the eleven you picked, and the decisions inside it */
        F.formation = (G.tacs && G.tacs.formation) || null;
        const xi = ((G.tacs && G.tacs.xi) || []).map((id) => playerById(id)).filter(Boolean);
        F.xi = xi;
        F.xiAvg = xi.length ? Math.round(xi.reduce((s, p) => s + p.ovr, 0) / xi.length) : null;
        const inXI = new Set(xi.map((p) => p.id));
        const available = (my.players || []).filter((p) => !p.loan && !p.youth && !p.injury && !(p.susp > 0));
        F.droppedStar = available.filter((p) => !inXI.has(p.id))
          .sort((a, b) => b.ovr - a.ovr)
          .filter((p) => F.xiAvg != null && p.ovr >= F.xiAvg + 3)[0] || null;
        F.debutant = xi.filter((p) => p.stats && (p.stats.apps || 0) === 0)
          .sort((a, b) => a.age - b.age)[0] || null;
        F.youngXI = xi.filter((p) => p.age <= 21).length;
      });
      return F;
    };
  }

  /* -------------------------------------------------------------------
     2. QUESTIONS THAT USE IT
     ------------------------------------------------------------------- */
  const PS = (s) => esc(String(s || ''));
  const NEW_Q = [
    { id: 'ctx-comp', w: (F) => F.pre && F.isCup && !F.isFinal && !F.isSemi, q: (F) => [
      `A ${PS(F.comp)} tie. How much does this competition mean to you this season?`,
      `Do you treat ${PS(F.comp)} as a distraction or as the shortest route to a trophy?`,
      `Will you be changing the side for ${PS(F.comp)}?`] },
    { id: 'ctx-euro', w: (F) => F.pre && F.isEuro, q: (F) => [
      `A European night. Is this the level this club should be at?`,
      `${PS(F.comp)} football — what does it do for a squad like yours?`] },
    { id: 'ctx-final', w: (F) => F.pre && F.isFinal, q: (F) => [
      `A ${PS(F.comp)} final. How do you keep the occasion from getting to them?`,
      `One game for a trophy. Does anything else this season matter beside it?`,
      `Win this and the season is a success whatever else happens. Do you see it that way?`] },
    { id: 'ctx-semi', w: (F) => F.pre && F.isSemi, q: () => [
      'A semi-final. Is it the worst round to lose?',
      'Ninety minutes from a final. How do you approach it?'] },
    { id: 'ctx-phase-open', w: (F) => F.pre && F.phase === 'opening' && !F.isCup, q: (F) => [
      `Matchday ${F.matchday} of ${F.totalMatchdays}. How much can anyone read into a start like this?`,
      `It is early. Are you where you expected to be after ${F.played} games?`] },
    { id: 'ctx-phase-runin', w: (F) => F.pre && F.phase === 'runin' && !F.isCup, q: (F) => [
      `${F.left} games left. Is this the part of the season where it is decided?`,
      `The run-in. Does the squad feel the difference in these weeks?`,
      `${F.left} to play and you are ${ordinal(F.pos)}. What is realistic from here?`] },
    { id: 'ctx-final-day', w: (F) => F.pre && F.phase === 'final-day' && !F.isCup, q: (F) => [
      `The last day, and you are ${ordinal(F.pos)}. How do you spend the morning?`,
      'Everything comes down to ninety minutes. Do you watch the other scores?'] },
    { id: 'ctx-division', w: (F) => F.pre && F.phase !== 'opening' && F.div !== 'PL', q: (F) => [
      `${PS(F.divName)} is a hard league to get out of. What does it take?`,
      `Is this squad built for ${PS(F.divName)} or for the division above it?`] },
    { id: 'sel-dropped', w: (F) => F.pre && F.droppedStar, q: (F) => [
      `${PS(F.droppedStar.name)} is not in your side. Is that form, fitness or something else?`,
      `Leaving out ${PS(F.droppedStar.name)} is a big call. Talk us through it.`,
      `Has ${PS(F.droppedStar.name)} been told why he is not playing?`] },
    { id: 'sel-debut', w: (F) => F.pre && F.debutant, q: (F) => [
      `${PS(F.debutant.name)} is in for his debut at ${F.debutant.age}. Why now?`,
      `A first start for ${PS(F.debutant.name)}. Is he ready for this?`] },
    { id: 'sel-shape', w: (F) => F.pre && F.formation && F.xiAvg != null, q: (F) => [
      `You have gone with a ${PS(F.formation)}. Is that about them or about you?`,
      `Is the shape you have picked the shape you want to play all season?`] },
    { id: 'sel-young', w: (F) => F.pre && F.youngXI >= 3, q: (F) => [
      `${F.youngXI} of your eleven are twenty-one or under. Is that a plan or a necessity?`,
      'That is a very young side. Are you asking too much of them?'] },
  ];

  guard('questions', () => {
    if (typeof PQ === 'undefined' || !Array.isArray(PQ)) return;
    const have = new Set(PQ.map((r) => r.id));
    NEW_Q.forEach((r) => { if (!have.has(r.id)) PQ.push(r); });
  });

  /* answers for each, in the game's own four-option shape */
  guard('answers', () => {
    if (typeof PANS === 'undefined') return;
    const A = {
      'ctx-comp': [['🏆 We want to win it', 'We are in it, so we are trying to win it. I have never seen the point of any other attitude.'],
        ['🔄 Chance to look at people', 'It is a chance to give minutes to players who have earned them and I make no apology for that.'],
        ['⚖️ The league comes first', 'The league is our bread and butter. I will not pretend otherwise, but we will be competitive.'],
        ['😠 Silly question', 'We are a football club. We play to win football matches. All of them.']],
      'ctx-euro': [['🌍 This is why you do it', 'These are the nights everyone at this club works for. You could feel it around the place all week.'],
        ['🧊 Just another game', 'It is three points, or it is a round. I will not have them believing it is bigger than they are.'],
        ['📈 A measure of us', 'It tells us where we are against good sides, and I want to know the answer as much as you do.'],
        ['🛡️ Careful what we wish for', 'We have earned the right to be here. Now we have to show we belong, and that is harder.']],
      'ctx-final': [['🏆 We came to win', 'You do not get many of these. We are not here for the day out.'],
        ['🧊 Keep it ordinary', 'Same routine, same preparation. The occasion looks after itself if the football is right.'],
        ['❤️ For the supporters', 'They have waited a long time. Whatever happens they will not be able to say we hid.'],
        ['😐 It is one game', 'It is one game and anything can happen in one game. That cuts both ways.']],
      'ctx-semi': [['🎯 Get to the final', 'Nobody remembers a semi-final. We are going there to get through it.'],
        ['🧊 Treat it as a tie', 'It is a football match with a good prize. We prepare exactly as we would for any other.'],
        ['🔥 No fear', 'I would rather go out trying to win it than sit in and hope. That is not us.'],
        ['🛡️ Respect them', 'They are here on merit. Anybody who thinks this is a formality will not be playing.']],
      'ctx-phase-open': [['📅 Far too early', 'Ask me in November. Tables in August tell you almost nothing and everyone in this room knows it.'],
        ['📈 Encouraged', 'I am encouraged. Not satisfied — encouraged. There is a difference and the players know it.'],
        ['😠 Not good enough', 'No, we are not where we should be, and I have said so inside the building as well as out here.'],
        ['🎯 Exactly where we planned', 'We set a target for the first block of games and we have hit it. Now the next block.']],
      'ctx-phase-runin': [['🔥 This is the bit', 'This is what the whole year has been for. If you cannot enjoy these weeks you are in the wrong job.'],
        ['🧊 One at a time', 'The moment you start counting games is the moment you drop points in one of them.'],
        ['💪 We are built for it', 'This group has been through enough together. I would back them in a run-in over most sides.'],
        ['😰 It is tight', 'It is tight and pretending otherwise would insult everyone. We have to be nearly perfect.']],
      'ctx-final-day': [['🧊 Like any other', 'Same breakfast, same team meeting, same walk. Routine is the only thing you control.'],
        ['📻 We will know', 'Of course we will know. You cannot keep 30,000 people from telling you what is happening elsewhere.'],
        ['🎯 Win and see', 'Win our game and whatever happens after that is out of our hands. That is a clean way to go into it.'],
        ['❤️ Proud either way', 'Whatever the afternoon brings, what these players have done deserves better than one result deciding it.']],
      'ctx-division': [['⚔️ It is relentless', 'Nobody outside it understands the schedule. Saturday, Tuesday, Saturday, and everyone can beat everyone.'],
        ['📈 Built to go up', 'We are building something better than this division, and that is not disrespect, it is ambition.'],
        ['🧊 Respect the league', 'Anyone who comes into this league expecting it to part for them gets found out by Christmas.'],
        ['🎯 One season at a time', 'I am not going to stand here and promise a division we have not won yet.']],
      'sel-dropped': [['💬 Football reasons', 'A football decision, nothing more. He has trained well and he will be back in.'],
        ['🛡️ Protecting him', 'He needed a week. Managing a season is managing bodies, not just picking your best eleven every time.'],
        ['😠 He has to do more', 'He knows what I want from him and he has not given me enough of it lately. That is between us, or it was.'],
        ['🔄 Horses for courses', 'The eleven I have picked suits this game. Another week, another opponent, another eleven.']],
      'sel-debut': [['🌟 He has earned it', 'He has been the best player in training for a month. You cannot ask for that and then not pick him.'],
        ['🛡️ No pressure on him', 'He plays, he makes mistakes, we pick him up. That is how a debut should work.'],
        ['🎯 The moment is right', 'You get a feel for when a lad is ready. I would rather be a week early than a year late.'],
        ['😐 Needs must', 'I would rather have eased him in. The situation has not allowed it.']],
      'sel-shape': [['🎯 It suits us', 'It is the shape that gets our best players into the game. That is the only test I apply.'],
        ['🛡️ It suits today', 'It is for this opponent. I am not wedded to a formation, I am wedded to winning.'],
        ['📈 Where we are going', 'This is how I want us to play, and we will keep playing it until it is second nature.'],
        ['😠 Ask me at five o’clock', 'You can tell me whether it was right when the game has been played.']],
      'sel-young': [['🌱 They are good enough', 'If they are good enough they are old enough. That is not a slogan here, it is the plan.'],
        ['🛡️ We will look after them', 'There are experienced players around them for a reason. They are not being thrown in alone.'],
        ['😐 Not by choice', 'I would love a deeper squad. This is the squad I have and I like these boys.'],
        ['🔥 It excites me', 'Watching them come through is the best part of the job. Ask me again if we lose 4-0.']],
    };
    Object.keys(A).forEach((k) => { if (!PANS[k]) PANS[k] = () => A[k]; });
  });

  /* -------------------------------------------------------------------
     3. WHICH QUESTION ACTUALLY GETS ASKED
     -------------------------------------------------------------------
     Selection is uniform over the bank, so the bank is a multiset and a
     topic appears in it as many times as it is worth. That is the same
     mechanism the existing occasion boost uses; this replaces the flat
     line-count weighting that made a topic with ten phrasings ten times
     likelier than the thing actually happening to you.
     ------------------------------------------------------------------- */
  const FILLER = /^open-/;
  const BIG_POST = ['thrashing', 'hammered', 'comeback', 'late-winner', 'late-loss',
    'red-ours', 'red-theirs', 'hat-trick', 'motm', 'clean-sheet'];

  function weightFor(id, F) {
    if (FILLER.test(id)) return 1;                 /* context-free filler */
    let w = 4;                                     /* an ordinary question */

    if (F.post && BIG_POST.indexOf(id) >= 0) w = 18;
    if (F.post && ['win-basic', 'loss-basic', 'draw-basic'].indexOf(id) >= 0) w = 10;

    if (F.streak && F.streak.n >= 3) {
      if (id === 'streak-w' && F.streak.r === 'W') w = 20;
      if (id === 'streak-l' && F.streak.r === 'L') w = 22;
      if (id === 'streak-d' && F.streak.r === 'D') w = 14;
    }
    if (F.titleRace && (id === 'pos-top' || id === 'race-title')) w = 18;
    if (F.dropFight && (id === 'pos-bad' || id === 'race-drop')) w = 22;
    if (F.promoRace && (id === 'pos-euro' || id === 'runin')) w = 14;
    if (id === 'vs-expect') w = 12;

    if (F.isDerby && id === 'derby') w = 24;
    if (F.isFinal && (id === 'ctx-final' || id === 'cup-final')) w = 26;
    if (F.isSemi && (id === 'ctx-semi' || id === 'cup-semi')) w = 20;
    if (F.isEuro && id === 'ctx-euro') w = 16;
    if (F.isCup && id === 'ctx-comp') w = 14;
    if (F.phase === 'final-day' && id === 'ctx-final-day') w = 24;
    if (F.phase === 'runin' && (id === 'ctx-phase-runin' || id === 'runin')) w = 14;
    if (F.phase === 'opening' && id === 'ctx-phase-open') w = 12;

    if (id === 'sel-dropped' && F.droppedStar) w = 14;
    if (id === 'sel-debut' && F.debutant) w = 12;
    if (id === 'sel-young' && F.youngXI >= 3) w = 10;

    if (id === 'injury-key' && (F.absent || []).length) w = 12;
    return w;
  }

  if (has(pressBank)) {
    const previousBank = pressBank;
    pressBank = function pressBankWeighted() {
      const bank = previousBank.apply(this, arguments) || [];
      return guard('weight', () => {
        const F = pqFacts();
        if (!F || !bank.length) return bank;
        /* the incoming bank already contains duplicates from the older
           occasion boost — collapse it before applying real weights */
        const lines = [];
        const seen = new Set();
        bank.forEach((q) => { if (!seen.has(q.id)) { seen.add(q.id); lines.push(q); } });

        const out = [];
        lines.forEach((q) => {
          const rid = String(q.id).split('#')[0];
          const w = Math.max(1, Math.round(weightFor(rid, F)));
          for (let i = 0; i < w; i += 1) out.push(q);
        });
        return out.length ? out : bank;
      }, bank);
    };
  }

  try { window.RBSPress = Object.freeze({ weightFor, seasonShape }); } catch (error) { /* no window */ }
}());
