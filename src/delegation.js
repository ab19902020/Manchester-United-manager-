/* global G, UI, ACTIONS, vStaff:writable, dailyTickCore:writable, autoPick,
          FORMATIONS, playerById, render, toast, esc, mail */

/* =====================================================================
   JOBS YOU CAN HAND TO YOUR ASSISTANT
   ---------------------------------------------------------------------
   "you should have to pass on jobs to your assistant."

   A manager of a big club does not pick the under-21s, does not run
   every press conference and does not personally decide Tuesday's
   training focus. The game already had exactly one piece of this — a
   "Send your assistant" button on a press invitation — and it was a
   one-off choice each time rather than something you could arrange.

   So: a standing arrangement. You say which jobs he has, and he does
   them, and you stop being asked.

   ---------------------------------------------------------------------
   IT HAS TO COST SOMETHING, or delegating everything is free.

   What it costs is that he is not you. The assistant carries a star
   rating already — it is bought and paid for on the staff screen — and
   that rating decides how well the job is done:

     five stars    he picks the side you would have picked
     three         he gets it mostly right and leaves somebody out
     one           he will pick a tired man over a fresh one and you
                   will notice on Saturday

   A team picked by a two-star assistant is a real team, legally picked,
   just not the best one available. That is the trade: your attention is
   finite, and so is his ability.

   AND HE NEVER TOUCHES A DECISION THAT IS YOURS. Delegation covers the
   chores — the eleven, the press, the training focus. It does not sign
   players, does not answer the board, does not accept bids. Those are
   the game.
   ===================================================================== */

(function delegation() {
  const JOBS = [
    ['lineup', '📋', 'Team selection', 'He names the side for every match.'],
    ['press', '🎙️', 'Press conferences', 'He faces the media instead of you.'],
    ['training', '🏋️', 'Training focus', 'He sets the week on the training ground.'],
  ];

  function assistant() {
    try {
      return (G.staff && G.staff.assistant) || null;
    } catch (error) {
      return null;
    }
  }

  function stars() {
    const a = assistant();
    const n = a && a.stars != null ? +a.stars : 2;
    return Math.max(1, Math.min(5, n));
  }

  function jobs() {
    if (!G.delegate) G.delegate = {};
    return G.delegate;
  }

  function on(key) {
    return !!jobs()[key];
  }

  ACTIONS.delegate = function delegateToggle(el) {
    try {
      const key = el.dataset.v;
      if (!key) return;
      const d = jobs();
      d[key] = !d[key];
      const a = assistant();
      const who = (a && a.name) || 'Your assistant';
      toast(d[key] ? who + ' will handle that' : 'You will handle that yourself');
      render();
    } catch (error) { /* nothing changes */ }
  };

  /* -------------------------------------------------------------------
     1. HE NAMES THE SIDE
     -------------------------------------------------------------------
     `autoPick` is the game's own best eleven, so a five-star assistant
     simply uses it. Below that he is walked backwards from it: the
     weaker he is, the more of the side he gets wrong, swapping a starter
     for the next man down rather than picking somebody ineligible. It is
     always a legal, playable eleven — he is not incompetent, he is just
     not as good at this as you are.
     ------------------------------------------------------------------- */
  function assistantEleven() {
    const shape = (G.tacs && G.tacs.formation) || '4-2-3-1';
    const best = autoPick(G.my, shape) || [];
    const quality = stars();
    if (quality >= 5 || !best.length) return best;

    /* HOW A WORSE ASSISTANT PICKS A WORSE SIDE, and the first attempt got
       this backwards. It swapped in the highest-rated man on the bench,
       which sometimes made the side BETTER on paper — a one-star
       assistant scored 943 against a three-star's 940 — because raw
       rating is not fitness for a position. A holding midfielder dropped
       into central defence raises the total and ruins the team.

       So the yardstick is the game's own: `calcEff(player, slot)`, the
       number the tactics screen shows. For each slot he gets wrong he
       takes the next man down the list for THAT position rather than the
       best man in the building. Five stars takes the top of every list,
       which is what autoPick does; one star reaches five deep. The side
       is always legal and always plausible — it is the side of a manager
       who is not quite good enough, which is what you paid for. */
    const slots = FORMATIONS[shape] || [];
    const depth = Math.max(0, 5 - quality);
    const mistakes = quality >= 4 ? 1 : quality >= 3 ? 2 : quality >= 2 ? 3 : 4;
    const chosen = best.slice();
    const used = new Set(chosen);

    const available = (G.clubs[G.my].players || [])
      .filter((p) => p && !p.injury && !(p.susp > 0) && !p.loan);
    const fitness = (p, slot) => {
      try {
        return (typeof window.calcEff === 'function') ? window.calcEff(p, slot) : (p.ovr || 0);
      } catch (error) {
        return p.ovr || 0;
      }
    };

    for (let n = 0; n < mistakes; n += 1) {
      /* a seeded slot, so the same week gives the same team rather than a
         new one every time the screen is drawn */
      const at = (G.day * 31 + n * 7 + quality) % Math.max(1, chosen.length);
      const slot = (slots[at] && slots[at][0]) || 'MC';
      if (slot === 'GK') continue;
      const ranked = available
        .filter((p) => !used.has(p.id) || p.id === chosen[at])
        .sort((a, b) => fitness(b, slot) - fitness(a, slot));
      const down = Math.min(depth, ranked.length - 1);
      const swap = ranked[down];
      if (!swap || swap.id === chosen[at]) continue;
      used.delete(chosen[at]);
      chosen[at] = swap.id;
      used.add(swap.id);
    }
    return chosen;
  }

  ACTIONS.assistantPick = function assistantPick() {
    try {
      G.tacs.xi = assistantEleven();
      const a = assistant();
      toast(((a && a.name) || 'Your assistant') + ' has named the side');
      render();
    } catch (error) { /* the eleven is unchanged */ }
  };

  /* he names it on the morning of a match, not at some random hour */
  if (typeof dailyTickCore === 'function') {
    const previous = dailyTickCore;
    dailyTickCore = function dailyTickDelegated() {
      const result = previous.apply(this, arguments);
      try {
        if (!on('lineup')) return result;
        const next = (typeof window.nextUserMatch === 'function') ? window.nextUserMatch() : null;
        if (!next || next.day !== (G.day || 0) + 1) return result;
        G.tacs.xi = assistantEleven();
      } catch (error) { /* you pick it yourself */ }
      return result;
    };
  }

  /* -------------------------------------------------------------------
     2. HE FACES THE PRESS
     -------------------------------------------------------------------
     The invitation already offers "Send your assistant" as one of its
     two options. Delegating simply means taking that option every time,
     which is done by pressing the game's own button rather than by
     reimplementing what it does.
     ------------------------------------------------------------------- */
  if (typeof window.mail === 'function') {
    const previous = window.mail;
    window.mail = function mailDelegated(type, title, body, actions) {
      const result = previous.apply(this, arguments);
      try {
        if (!on('press') || !Array.isArray(actions)) return result;
        const skip = actions.filter((a) => a && a.act === 'pressSkip')[0];
        if (!skip) return result;
        const letter = (G.inbox || [])[0];
        if (!letter || letter.title !== title) return result;
        letter.actions = null;
        letter.must = false;
        letter.read = true;
        letter.body += '<br><br><span class="xs" style="color:var(--gold)">✓ '
          + esc(((assistant() || {}).name) || 'Your assistant') + ' took the conference.</span>';
        G.unread = Math.max(0, (G.unread || 0) - 1);
      } catch (error) { /* the invitation stands */ }
      return result;
    };
  }

  /* -------------------------------------------------------------------
     3. HE SETS THE WEEK
     -------------------------------------------------------------------
     A good assistant reads the fixture list: heavy work when there is
     time, lighter when there is not. A poor one just picks Normal and
     leaves it there, which is exactly what a poor assistant would do.
     ------------------------------------------------------------------- */
  if (typeof dailyTickCore === 'function') {
    const previous = dailyTickCore;
    dailyTickCore = function dailyTickTraining() {
      const result = previous.apply(this, arguments);
      try {
        if (!on('training')) return result;
        if ((G.day || 0) % 7 !== 1) return result;       /* once a week */
        if (stars() <= 2) { G.trainInt = 'Normal'; return result; }
        const next = (typeof window.nextUserMatch === 'function') ? window.nextUserMatch() : null;
        const days = next ? next.day - G.day : 9;
        G.trainInt = days >= 6 ? 'Intense' : days <= 3 ? 'Light' : 'Normal';
      } catch (error) { /* the intensity stays where it was */ }
      return result;
    };
  }

  /* -------------------------------------------------------------------
     4. THE PANEL
     ------------------------------------------------------------------- */
  function panel() {
    const a = assistant();
    const quality = stars();
    const who = (a && a.name) || 'your assistant';
    const how = quality >= 5 ? 'He will pick the side you would have picked.'
      : quality >= 4 ? 'He is good. He will get it right most weeks.'
        : quality >= 3 ? 'He is competent, and he will leave somebody out you would have played.'
          : 'He is not good enough for this. Expect to see it on a Saturday.';

    return '<div class="sec"><div class="t">What your assistant handles</div>'
      + '<div class="ln"></div><div class="sub">' + '★'.repeat(quality) + '</div></div>'
      + '<div class="card tight" style="margin-bottom:12px">'
      + JOBS.map(([key, icon, label, note]) => '<div class="mail" data-action="delegate" data-v="' + key + '">'
        + '<div class="ic">' + icon + '</div>'
        + '<div style="flex:1;min-width:0"><div class="tt">' + label + '</div>'
        + '<div class="bd">' + note + '</div></div>'
        + '<span class="tag-pill" style="background:' + (on(key) ? 'rgba(61,220,132,.18);color:#7fe0a6' : 'rgba(255,255,255,.06);color:var(--ink-faint)') + '">'
        + (on(key) ? esc(who.split(' ')[0].toUpperCase()) : 'YOU') + '</span></div>').join('')
      + '<div class="xs faint" style="padding:7px 2px 0;line-height:1.55">'
      + esc(who) + ' is ' + quality + '-star. ' + esc(how)
      + ' He never signs a player, answers the board or accepts a bid — those are yours.</div>'
      + '</div>';
  }

  if (typeof vStaff === 'function') {
    const previous = vStaff;
    vStaff = function vStaffDelegation() {
      const html = previous.apply(this, arguments);
      try { return panel() + html; } catch (error) { return html; }
    };
  }

  try {
    window.RBSDelegation = Object.freeze({ JOBS, jobs, on, stars, assistantEleven, panel });
  } catch (error) { /* no window */ }
}());
