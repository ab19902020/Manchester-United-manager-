const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   THE MANAGER IS SOMEBODY NOW
   ---------------------------------------------------------------------
   He had nine fields and all nine were his face. These are the two a
   football person asks first -- did you play, and what are your badges --
   and the point of the test is the second half: that the answers reach
   something. A dropdown that changes nothing is what was already there.
   ===================================================================== */

test('what you did before decides what the game thinks of you', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const S=RBSManagerBackground;
    const at=(played,badge,age)=>Math.round(S.standing({played,badge,age}));
    return {
      nobody:      at('none','none',34),
      nonleague:   at('nonleague','b',34),
      lower:       at('lower','b',44),
      top:         at('top','a',44),
      international:at('intl','pro',52),
      /* the same man, older */
      young:       at('top','a',30),
      old:         at('top','a',60),
      words:[0,30,45,60,80].map(v=>S.describe(v)),
      /* nothing may fall outside the scale it prints */
      floor:       at('none','none',28),
      ceiling:     at('intl','pro',72)
    };
  })()`);

  assert.ok(got.nobody < got.nonleague, 'playing non-league counts for something');
  assert.ok(got.nonleague < got.lower, 'a longer career counts for more');
  assert.ok(got.lower < got.top, 'the top flight counts for more again');
  assert.ok(got.top < got.international, 'and caps count for most');
  assert.ok(got.young < got.old, 'the years in the game count too');
  assert.ok(got.floor >= 0 && got.ceiling <= 100,
    `standing ran outside its own scale: ${got.floor}..${got.ceiling}`);
  /* the description has to move with the number, or it is decoration */
  assert.equal(new Set(got.words).size >= 4, true,
    `only ${new Set(got.words).size} different descriptions across the range`);
});

test('a manager with a name talks better players into signing', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const all=G.clubs.flatMap(c=>c.players||[]).filter(p=>p.club!==G.my)
      .sort((a,b)=>b.ovr-a.ovr);
    const elite=all.find(p=>p.ovr>=86);
    const ordinary=all.find(p=>p.ovr>=72&&p.ovr<74);
    const score=(p)=>interestScore(p, askPrice(p), expectedWage(p,false));
    const as=(played,badge,age,p)=>{
      G.mgr.played=played; G.mgr.badge=badge; G.mgr.age=age;
      return score(p);
    };
    return {
      eliteNobody:  as('none','none',34,elite),
      eliteName:    as('intl','pro',52,elite),
      plainNobody:  as('none','none',34,ordinary),
      plainName:    as('intl','pro',52,ordinary),
      eliteOvr:elite.ovr, plainOvr:ordinary.ovr
    };
  })()`);

  assert.ok(got.eliteName > got.eliteNobody,
    'a big name should not make a player LESS keen');
  assert.ok(got.plainName > got.plainNobody, 'and the same for an ordinary player');

  /* the better the player, the more he cares who is asking */
  const eliteSwing = got.eliteName - got.eliteNobody;
  const plainSwing = got.plainName - got.plainNobody;
  assert.ok(eliteSwing > plainSwing,
    `a ${got.eliteOvr} moved ${eliteSwing.toFixed(1)} and a ${got.plainOvr} moved ${plainSwing.toFixed(1)}`);

  /* and it must not be able to buy anybody on its own: an elite player
     at a club he has no reason to join still says no */
  assert.ok(got.eliteName < 50,
    `a manager's name alone talked an ${got.eliteOvr} into it (${got.eliteName.toFixed(1)})`);
});

test('the questions are on the screen, and the face still works', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const got = game.eval(`(function(){
    MGRUI.tab='who';
    const html=vMgrCreate();
    /* the game's own handler stores any key, so the new chips ride on it
       -- this checks that is still true rather than assuming it */
    const m=myManager();
    const before={jaw:m.jaw};
    ACTIONS.mgrSet({dataset:{k:'played',v:'intl'}});
    ACTIONS.mgrSet({dataset:{k:'jaw',v:before.jaw}});
    return {
      hasPlayed: html.indexOf('data-v="intl"')>=0,
      hasBadge:  html.indexOf('data-v="pro"')>=0,
      hasBar:    html.indexOf('mgb-bar')>=0,
      /* the face tab must not have grown a football question */
      faceClean: (function(){ MGRUI.tab='face'; const h=vMgrCreate();
                              MGRUI.tab='who'; return h.indexOf('data-v="intl"')<0 })(),
      stored: m.played,
      jawIntact: m.jaw===before.jaw
    };
  })()`);

  assert.equal(got.hasPlayed, true, 'the playing-career question is not on the screen');
  assert.equal(got.hasBadge, true, 'the badges question is not on the screen');
  assert.equal(got.hasBar, true, 'standing is not shown');
  assert.equal(got.faceClean, true, 'the questions leaked onto the Face tab');
  assert.equal(got.stored, 'intl', 'the answer was not stored on the manager');
  assert.equal(got.jawIntact, true, 'wrapping mgrSet broke the appearance chips');
});
