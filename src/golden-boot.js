/* global G, LEAGUES, buildAwards:writable, divMembers, leagueKeys */

/* =====================================================================
   THE GOLDEN BOOT IS A TOP-FLIGHT AWARD
   ---------------------------------------------------------------------
   "we just have a top goal scorer in each league, and then the golden
    boot should only go to the top goal scorer from the top league of
    each country... it's the top goal scorer across all competitions as
    well. So it could be FA Cup, League Cup, Champions League, Europa,
    wherever it is, and it's that who has the most goals all combined
    will be the top goal scorer with the golden boot."

   Measured over three played seasons, the Golden Boot went to a
   National League striker on 38 and a League One striker on 31, with a
   Premier League player winning it only once. That is not a bug in the
   scoring — it is a bug in who was allowed to win. The award was picked
   from every senior player in the world, and the lower a division is
   the more freely it scores, so the fifth tier wins a trophy the
   Premier League is supposed to.

   Two things follow, and they are different awards:

     * EVERY LEAGUE HAS A TOP SCORER. Fifth tier included. That is a
       fact about a division and it belongs to that division.

     * THE GOLDEN BOOT IS ONE AWARD, and only the top flight of a
       country can win it — the Premier League, La Liga, Serie A, the
       Bundesliga, Ligue 1. Between those, most goals wins.

   THE TALLY WAS ALREADY RIGHT. `p.stats.goals` is added up in
   MatchSim.finish(), which every competition runs through: the league,
   the FA Cup, the League Cup and Europe alike. So "across all
   competitions" needed nothing built — it needed saying, because the
   old mail called them "league goals" and they never were.
   ===================================================================== */

(function goldenBoot() {
  /* The top division of every country. `tier` is 1 for the Premier
     League, La Liga, Serie A, the Bundesliga and Ligue 1, and 2 or more
     for everything below them; Europe has no tier at all, which is
     right — the Champions League is a competition, not a league, and
     its goals are already counted in whichever league its players play
     in. */
  function topFlights() {
    const out = [];
    try {
      Object.keys(LEAGUES).forEach((k) => {
        if (LEAGUES[k] && +LEAGUES[k].tier === 1) out.push(k);
      });
    } catch (error) { /* an empty list makes the caller fall back */ }
    return out;
  }

  /* Everyone who actually plays for a club in this division. Loans are
     excluded because the man is not theirs, and youth players because
     they are not in the division's football. */
  function playersIn(div) {
    const out = [];
    try {
      (G.clubs || []).forEach((c) => {
        if (!c || c.league !== div) return;
        (c.players || []).forEach((p) => {
          if (p && !p.loan && !p.youth) out.push(p);
        });
      });
    } catch (error) { /* nobody, then */ }
    return out;
  }

  function goalsOf(p) {
    return (p && p.stats && +p.stats.goals) || 0;
  }

  /* THE BEST OF A LIST, WITH TIES BROKEN THE WAY FOOTBALL BREAKS THEM.
     Level on goals, the man who needed fewer appearances is ahead of
     the man who needed more — and if even that is level, by name, so
     the same save always names the same player rather than whichever
     club happened to be built first. */
  function best(list) {
    let winner = null;
    list.forEach((p) => {
      const g = goalsOf(p);
      if (g <= 0) return;
      if (!winner) { winner = p; return; }
      const w = goalsOf(winner);
      if (g > w) { winner = p; return; }
      if (g < w) return;
      const a = (p.stats && p.stats.apps) || 0;
      const b = (winner.stats && winner.stats.apps) || 0;
      if (a < b || (a === b && String(p.name) < String(winner.name))) winner = p;
    });
    return winner;
  }

  /* the top scorer of one division, whichever division it is */
  function leagueTopScorer(div) {
    return best(playersIn(div));
  }

  /* one per division, in the order the world lists them */
  function allLeagueTopScorers() {
    const out = [];
    try {
      const keys = (typeof leagueKeys === 'function') ? leagueKeys() : Object.keys(LEAGUES);
      keys.forEach((k) => {
        const p = leagueTopScorer(k);
        if (p) out.push({ div: k, player: p, goals: goalsOf(p) });
      });
    } catch (error) { /* nothing to show */ }
    return out;
  }

  /* THE AWARD ITSELF. Only the top flights are eligible, and between
     them it is simply whoever scored most in everything he played. */
  function winner() {
    const divs = topFlights();
    if (!divs.length) return null;
    let pool = [];
    divs.forEach((d) => { pool = pool.concat(playersIn(d)); });
    return best(pool);
  }

  /* the whole world's leading scorer, top flight or not — kept because
     "who has scored the most goals anywhere" is still a real question,
     and it is what the award used to answer by mistake */
  function anyLeagueBest() {
    let pool = [];
    try {
      Object.keys(LEAGUES).forEach((k) => { pool = pool.concat(playersIn(k)); });
    } catch (error) { /* none */ }
    return best(pool);
  }

  try {
    window.RBSGoldenBoot = Object.freeze({
      topFlights, leagueTopScorer, allLeagueTopScorers, winner, anyLeagueBest, goalsOf,
    });
    /* the name endSeason calls; a bare identifier so the inline script
       can reach it without knowing this file exists */
    window.goldenBoot = winner;
    window.leagueTopScorer = leagueTopScorer;
  } catch (error) { /* no window, no award */ }

  /* THE SEASON AWARDS PICK THE SAME MAN. buildAwards chose the boot
     from every senior player outside Europe, which is the whole pyramid
     — so the National League won it there too, and the trophy room, the
     player's honours and the ceremony all followed it down. */
  try {
    if (typeof buildAwards === 'function') {
      const passAwards = buildAwards;
      buildAwards = function awardsWithATopFlightBoot() {
        const out = passAwards.apply(this, arguments);
        try {
          const boot = winner();
          if (out && boot) out.boot = boot;
        } catch (error) { /* whatever it picked stands */ }
        return out;
      };
    }
  } catch (error) { /* the awards still go out */ }
}());
