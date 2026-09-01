const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/* =====================================================================
   THE CARD HAS TO KEEP MATCHING THE SHEET IT DECORATES
   ---------------------------------------------------------------------
   "Massive upgrade to visual player cards and manager."

   The upgrade is almost entirely a stylesheet, and a stylesheet cannot
   fail loudly. It hangs off marker classes that a tagging pass puts on
   the sheet by looking for a row that holds both a portrait and a name,
   a row that holds bars, and the attribute grid. A player profile is
   the most decorated sheet in the game -- six layers append to it and
   two prepend -- so any of those shapes could move, and if one did the
   card would quietly render as it did before with nobody the wiser.

   So this checks the tagging rather than the appearance: that every
   marker still lands, that each attribute gets the fraction its bar is
   drawn from, and -- the one that would actually break something -- that
   the card class is let go again when a different sheet opens, because
   there is only one sheet element in the game and everything is written
   into it.
   ===================================================================== */

test('the card tags the sheet it is given', { timeout: 90000 }, async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Card Reader');

  const out = game.eval(`(()=>{
    const sq=G.clubs[G.my].players.slice().sort((a,b)=>(b.ovr||0)-(a.ovr||0));
    openProfile(sq[0].id);
    const b=document.getElementById('sheetBody');
    const attrs=[...b.querySelectorAll('.attr-grid .attr')];
    const tagged=attrs.filter(a=>a.classList.contains('pc-attr'));
    /* the number in the row against the width its bar is drawn to */
    const pairs=tagged.map(a=>{
      const v=parseFloat(((a.querySelector('.v')||{}).textContent||'').replace(/[^0-9.]/g,''));
      const w=parseFloat(String(a.style.getPropertyValue('--v')||'').replace('%',''));
      return { v, w, tier:['pc-t1','pc-t2','pc-t3','pc-t4']
        .filter(t=>a.classList.contains(t)).join('') };
    });
    return {
      card: b.classList.contains('pcard'),
      head: !!b.querySelector('.pc-head'),
      headHasFace: !!b.querySelector('.pc-head svg'),
      headHasName: !!b.querySelector('.pc-head h3'),
      headHasOvr: !!b.querySelector('.pc-head .ovr'),
      badges: !!b.querySelector('.pc-badges'),
      vitals: !!b.querySelector('.pc-vitals'),
      vitalBars: b.querySelectorAll('.pc-vitals .bar').length,
      attrs: attrs.length, tagged: tagged.length,
      pairs, sheetStyle: !!document.getElementById('rbs-player-card')
    };
  })()`);

  assert.ok(out.sheetStyle, 'the card stylesheet is on the page');
  assert.ok(out.card, 'the sheet is marked as a player card');
  assert.ok(out.head, 'the header row was found');
  assert.ok(out.headHasFace && out.headHasName && out.headHasOvr,
    'and it is the row with the portrait, the name and the rating on it');
  assert.ok(out.badges, 'the badge row was found');
  assert.ok(out.vitals, 'the condition/sharpness/morale row was found');
  assert.ok(out.vitalBars >= 2, 'with its bars, got ' + out.vitalBars);

  assert.ok(out.attrs >= 12, 'a profile lists the attributes, got ' + out.attrs);
  assert.equal(out.tagged, out.attrs, 'every attribute row is tagged');

  /* THE BAR SAYS WHAT THE NUMBER SAYS. A bar drawn from a value it did
     not come from is worse than no bar: it is a picture that disagrees
     with the figure printed on top of it. */
  const pairs = Array.from(out.pairs);
  pairs.forEach((p) => {
    const want = Math.max(0, Math.min(1, (p.v - 4) / 16)) * 100;
    assert.ok(Math.abs(p.w - want) < 0.2,
      'attribute ' + p.v + ' should fill ' + want.toFixed(1) + '%, got ' + p.w);
    assert.ok(p.tier, 'and carries exactly one colour band, got "' + p.tier + '"');
  });

  /* the bands have to actually separate players, not all come out alike */
  const bands = new Set(pairs.map((p) => p.tier));
  assert.ok(bands.size >= 2,
    'a real squad member spans more than one band, got ' + Array.from(bands).join(','));
});

test('and lets go of the sheet when something else opens in it',
  { timeout: 90000 }, async (t) => {
    const game = await createGame();
    t.after(() => game.close());
    await startCareer(game, 'Sheet Sharer');

    const out = game.eval(`(()=>{
    const sq=G.clubs[G.my].players.slice().sort((a,b)=>(b.ovr||0)-(a.ovr||0));
    openProfile(sq[0].id);
    const b=document.getElementById('sheetBody');
    const onProfile=b.classList.contains('pcard');

    /* THE SHEET IS ONE ELEMENT AND EVERY SCREEN IS WRITTEN INTO IT. If
       the card class survived a profile closing, the next thing opened
       in it -- a contract talk, a scout report, a confirmation -- would
       be styled as a player card: 86px portraits, bars behind rows, a
       medallion. openModal is what every one of them goes through. */
    openModal('<div class="row"><div>Something else entirely</div></div>');
    const after=b.classList.contains('pcard');

    /* and back again */
    openProfile(sq[1].id);
    const again=b.classList.contains('pcard');
    return { onProfile, after, again, name:sq[1].name };
  })()`);

    assert.ok(out.onProfile, 'a profile is a card');
    assert.equal(out.after, false,
      'and the next sheet opened in the same element is not');
    assert.ok(out.again, 'opening another profile marks it again');
  });
