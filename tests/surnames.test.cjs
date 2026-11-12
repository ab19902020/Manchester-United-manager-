const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   A SURNAME WITH A PARTICLE IS ONE NAME
   ---------------------------------------------------------------------
   Wherever the game has room for one word it took the last one, so the
   team shape on the home screen labelled Jesse de Wit "Wit". The
   same rule turns Bram De Backer into "Backer" and Luuk van Dam into
   "Dam" -- names no commentator has ever said.

   The two halves of this are equally important: the particles come
   along, and nothing else moves. A rule that grabbed too much would put
   given names on the pitch.
   ===================================================================== */

test('a surname keeps the particle that belongs to it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const names=['Jesse de Wit','Luuk van Dam','Bram De Backer',
      'Mats de Graaf','Jan-Erik ter Horst','Pim van Vliet',
      'Tomás Mac Evoy'];
    const out={};
    names.forEach(n=>{ out[n]=surname(n); });
    return out;
  })()`);

  assert.equal(got['Jesse de Wit'], 'De Wit');
  assert.equal(got['Luuk van Dam'], 'Van Dam');
  assert.equal(got['Bram De Backer'], 'De Backer');
  assert.equal(got['Mats de Graaf'], 'De Graaf');
  assert.equal(got['Jan-Erik ter Horst'], 'Ter Horst');
  assert.equal(got['Pim van Vliet'], 'Van Vliet');
  assert.equal(got['Tomás Mac Evoy'], 'Mac Evoy');
});

test('every other name is left exactly as it was', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const names=['Emil Brekke','Miguel Esteves','Amine Tazi','Koen Maas',
      'Khalid Aouad','Stijn Goossens','Georges Atangana','Pietro Donati',
      'Duarte Leal dos Reis Moura'];
    const out={};
    names.forEach(n=>{ out[n]=surname(n); });
    /* a single name is a whole name */
    out.mono=['Caio','Renan','Dudu'].map(n=>surname(n)).join(',');
    /* and nothing falls over on the edges */
    out.empty=surname('');
    out.blank=surname('   ');
    out.nul=surname(null);
    return out;
  })()`);

  assert.equal(got['Emil Brekke'], 'Brekke');
  assert.equal(got['Miguel Esteves'], 'Esteves');
  assert.equal(got['Amine Tazi'], 'Tazi');
  assert.equal(got['Koen Maas'], 'Maas');
  assert.equal(got['Khalid Aouad'], 'Aouad');
  assert.equal(got['Stijn Goossens'], 'Goossens');
  assert.equal(got['Georges Atangana'], 'Atangana');
  assert.equal(got['Pietro Donati'], 'Donati');
  /* "dos" sits mid-name here, not in front of the last one, so the
     surname is still the final word */
  assert.equal(got['Duarte Leal dos Reis Moura'], 'Moura');
  assert.equal(got.mono, 'Caio,Renan,Dudu');
});

test('the authored squad reads the way a team sheet does', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval('newGame(0)');

  const seen = game.eval(`(function(){
    const out={particled:0, samples:[], empty:0};
    G.clubs.forEach(c=>(c.players||[]).forEach(p=>{
      const s=surname(p.name);
      if(!s) out.empty++;
      if(/\\s/.test(s)){
        out.particled++;
        if(out.samples.length<6) out.samples.push(p.name+' -> '+s);
      }
    }));
    return out;
  })()`);

  /* a world of ten thousand players certainly contains some */
  assert.ok(seen.particled > 20,
    `only ${seen.particled} players kept a particle — the rule is not reaching the squads`);
  assert.equal(seen.empty, 0, 'a player ended up with no name at all');
});
