const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE EMPTY SCREEN THAT OFFERS WHAT IT TALKS ABOUT
   ---------------------------------------------------------------------
   Squad -> On Loan told you that fringe players of 23 and under develop
   faster elsewhere and that "the option is on their profile", and then
   left 366px of a 390x844 phone blank -- half the screen -- rather than
   taking you to any of them. Found by scripts/audit-blank.cjs, which
   samples the pixels a screen actually draws.

   Two things are asserted here and they are different kinds of thing.

   That the list APPEARS is the feature. That everybody on it actually
   fits the rule the screen states is the part that would rot quietly:
   a shortlist headed "who you could send out" that includes a man who
   is 27, or already out on loan, or in the starting eleven, is worse
   than the blank space it replaced, because it is advice that is wrong
   rather than advice that is missing.
   ===================================================================== */

test('the empty loans screen offers the players it is talking about',
  { timeout: 90000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Loan Ranger');

    const out = game.eval(`(()=>{
    const c=G.clubs[G.my];
    c.players.forEach(p=>{ p.loan=null; });
    UI.view='squad'; UI.squadTab='loans'; render();
    const html=vSquadLoans();

    const listed=[...html.matchAll(/data-action="profile" data-id="([0-9]+)"/g)]
      .map(m=>+m[1]);
    const xi=new Set((G.tacs&&G.tacs.xi||[]).filter(Boolean));
    const by=id=>c.players.filter(p=>p.id===id)[0]||null;
    const bad=listed.map(by).filter(p=>!p||p.age>23||p.loan||p.injury||xi.has(p.id))
      .map(p=>p?(p.name+' age '+p.age+(xi.has(p.id)?' IN THE XI':'')
        +(p.loan?' ALREADY OUT':'')+(p.injury?' INJURED':'')):'unknown id');

    /* and the whole point: it is reachable from here */
    return { listed: listed.length, bad,
      heading: html.indexOf('Who you could send out')>=0,
      saysHow: html.indexOf('loan button is on it')>=0,
      /* how many actually qualify, so a short list is not mistaken for
         a broken one */
      eligible: window.RBSLoanCandidates.candidates().length };
  })()`);

    assert.ok(out.heading, 'the empty screen offers a shortlist');
    assert.ok(out.saysHow, 'and says what to do with it');
    assert.ok(out.listed > 0,
      'with somebody on it — ' + out.eligible + ' players qualify');
    assert.deepEqual(Array.from(out.bad), [],
      'everybody offered fits the rule the screen states:\n  '
      + Array.from(out.bad).join('\n  '));
  });

test('and stands aside once somebody is actually out on loan',
  { timeout: 90000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Already Out');

    const out = game.eval(`(()=>{
    const c=G.clubs[G.my];
    c.players.forEach(p=>{ p.loan=null; });
    const empty=vSquadLoans();

    /* send one out, however crudely — this is about which branch the
       screen takes, not about the loan machinery */
    const xi=new Set((G.tacs&&G.tacs.xi||[]).filter(Boolean));
    const young=c.players.filter(p=>p.age<=23&&!xi.has(p.id))[0];
    if(young) young.loan={club:0,share:50,until:400};
    const full=vSquadLoans();
    c.players.forEach(p=>{ p.loan=null; });

    return {
      emptyOffers: empty.indexOf('Who you could send out')>=0,
      fullOffers: full.indexOf('Who you could send out')>=0,
      fullNamesHim: young?full.indexOf(young.name)>=0:false,
      had: !!young };
  })()`);

    assert.ok(out.had, 'the squad has somebody young enough to send out');
    assert.ok(out.emptyOffers, 'the shortlist is there when nobody is out');
    assert.equal(out.fullOffers, false,
      'and gone once the screen has real loans to show — otherwise it would '
      + 'sit under the wage bill offering more of what you already did');
    assert.ok(out.fullNamesHim, 'the man out on loan is named on the screen');
  });
