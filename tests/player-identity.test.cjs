const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   A CARD THAT SAYS WHAT KIND OF FOOTBALLER HE IS
   ---------------------------------------------------------------------
   Two strikers on 82 used to look identical: nineteen numbers in three
   groups and nothing about which of them plays on the shoulder and which
   wants it to feet. The role and the ranking are both read from numbers
   the game already owns, so the test is that they DISCRIMINATE -- a
   label everybody shares is no better than no label at all.
   ===================================================================== */

test('every module the page loads is actually loaded by the harness', async (t) => {
  /* THE BUG THIS EXISTS FOR. The harness inlines each module with
     html.replace(tag, `<script>${source}</script>`), and a string
     replacement makes String.replace interpret `$&` inside it. A module
     containing `$&` -- an ordinary thing to write in a .replace call --
     had the matched <script src=...> tag spliced into its own source,
     threw on load, and silently never installed. Every test went on
     passing against a game missing that module. */
  const game = await createGame();
  t.after(() => game.close());

  /* joined in the page, because an array that comes back across the
     JSDOM boundary has JSDOM's Array prototype and deepStrictEqual
     compares prototypes -- it fails against a Node [] even when both are
     empty, which cost a confused minute */
  const missing = game.eval(`(function(){
    const want=['RBSChipGutters','RBSSurnames','RBSOffsideTrap',
                'RBSManagerBackground','RBSPlayerIdentity'];
    return want.filter(k=>typeof window[k]!=='object').join(', ');
  })()`);
  assert.equal(missing, '',
    `these modules are in the page but did not install in the harness: ${missing}`);
});

test('the inliner treats a module as text, not as a replacement pattern', () => {
  const harness = fs.readFileSync(path.join(__dirname, 'game-harness.cjs'), 'utf8');
  const fn = harness.slice(harness.indexOf('function inlineScript'));
  assert.match(fn.slice(0, 400), /replace\(\s*tag\s*,\s*\(\)\s*=>/,
    'inlineScript must pass a replacer function, or a module containing $& corrupts itself');
});

test('a player is given the role his attributes actually describe', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const I=RBSPlayerIdentity;
    const div=G.clubs[G.my].league;
    const counts={}, byPos={};
    let n=0, named=0;
    divMembers(div).forEach(ci=>(G.clubs[ci].players||[]).forEach(p=>{
      const r=I.roleOf(p); n++;
      if(r){ named++; counts[r]=(counts[r]||0)+1;
             (byPos[I.groupOf(p.pos)]=byPos[I.groupOf(p.pos)]||{})[r]=1; }
    }));
    const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    return {n, named, roles:Object.keys(counts).length,
      biggestShare: top.length? top[0][1]/named : 1,
      keeperRoles: Object.keys(byPos.GK||{}),
      strikerRoles: Object.keys(byPos.ST||{})};
  })()`);

  assert.equal(got.named, got.n, 'some players came back with no role at all');
  assert.ok(got.roles >= 12,
    `only ${got.roles} different roles across a whole division`);
  /* the failure this guards: scoring roles on raw attribute means made
     "No-nonsense centre-half" swallow 76 defenders and left three roles
     with one player between them */
  assert.ok(got.biggestShare < 0.25,
    `one role covers ${(got.biggestShare * 100).toFixed(0)}% of the division`);
  assert.ok(got.keeperRoles.length >= 1, 'goalkeepers have no role');
  assert.ok(got.strikerRoles.length >= 2,
    `every striker in the division is a ${got.strikerRoles[0]}`);
});

test('what he is good at is judged against his own position', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const I=RBSPlayerIdentity;
    const men=G.clubs[G.my].players;
    const gk=men.find(p=>p.pos==='GK');
    const out=men.slice(0,12).map(p=>{
      const l=I.ranked(p);
      return {pos:p.pos, keys:l?l.map(x=>x.k):null, line:l?I.summary(p,l):''};
    }).filter(x=>x.keys);
    const gkl=I.ranked(gk);
    return {
      rows:out.length,
      /* a keeper's shooting and crossing are not strengths, and the
         first version of this said they were */
      keeperKeys: gkl?gkl.map(x=>x.k):[],
      keeperLine: gkl?I.summary(gk,gkl):'',
      /* the ranking must be a ranking: percentiles inside 0..100, sorted */
      sane: out.every(x=>x.keys.length>=4),
      pctSorted: (function(){ const l=I.ranked(men[3]);
        return !l || l.every((x,i)=>i===0||l[i-1].pct>=x.pct); })(),
      pctRange: (function(){ const l=I.ranked(men[3]);
        return !l || l.every(x=>x.pct>=0&&x.pct<=100); })()
    };
  })()`);

  assert.ok(got.rows >= 8, 'the ranking did not produce anything for most of the squad');
  assert.ok(got.sane, 'a player was ranked on fewer than four attributes');
  assert.equal(got.pctSorted, true, 'the ranking is not in order');
  assert.equal(got.pctRange, true, 'a percentile fell outside 0..100');
  for (const bad of ['shooting', 'crossing', 'heading', 'dribbling']) {
    assert.ok(got.keeperKeys.indexOf(bad) < 0,
      `a goalkeeper is being judged on his ${bad} — the summary read "${got.keeperLine}"`);
  }
});

test('the card carries the role, and the buttons use his real surname', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const got = game.eval(`(function(){
    const p=G.clubs[G.my].players.find(x=>/ de | van | De | Van /.test(' '+x.name+' '))
          || G.clubs[G.my].players[4];
    openProfile(p.id);
    const sheet=document.getElementById('sheetBody');
    const band=sheet?sheet.querySelector('.pid-band'):null;
    const wrong=String(p.name).trim().split(/\\s+/).pop();
    const right=surname(p.name);
    return {
      name:p.name, wrong, right,
      hasBand:!!band,
      role:band?(band.querySelector('.pid-role')||{}).textContent:null,
      /* the chat button is written straight into the sheet AFTER
         openModal, so it is the one that used to say "Ligt" */
      stray: right===wrong ? 0 :
        [...sheet.querySelectorAll('button')]
          .filter(b=>new RegExp('(^|[^\\\\w])'+wrong+'(?![\\\\w])').test(b.textContent)
                     && b.textContent.indexOf(right)<0).length,
      headingIntact: !!(sheet.querySelector('h3')||{}).textContent
        && (sheet.querySelector('h3')||{}).textContent.indexOf(p.name)>=0
    };
  })()`);

  assert.equal(got.hasBand, true, 'the identity band is not on the card');
  assert.ok(got.role, 'the card does not say what kind of player he is');
  assert.equal(got.stray, 0,
    `a button still calls ${got.name} "${got.wrong}" instead of "${got.right}"`);
  assert.equal(got.headingIntact, true,
    'the correction damaged the full name in the heading');
});
