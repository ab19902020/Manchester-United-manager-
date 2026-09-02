const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame } = require('./game-harness.cjs');

/* =====================================================================
   A SURNAME WITH A PARTICLE IS ONE NAME
   ---------------------------------------------------------------------
   Wherever the game has room for one word it took the last one, so the
   team shape on the home screen labelled Matthijs de Ligt "Ligt". The
   same rule turns Kevin De Bruyne into "Bruyne" and Virgil van Dijk into
   "Dijk" -- names no commentator has ever said.

   The two halves of this are equally important: the particles come
   along, and nothing else moves. A rule that grabbed too much would put
   given names on the pitch.
   ===================================================================== */

test('a surname keeps the particle that belongs to it', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const names=['Matthijs de Ligt','Virgil van Dijk','Kevin De Bruyne',
      'Frenkie de Jong','Marc-André ter Stegen','Robin van Persie',
      'Alexis Mac Allister'];
    const out={};
    names.forEach(n=>{ out[n]=surname(n); });
    return out;
  })()`);

  assert.equal(got['Matthijs de Ligt'], 'De Ligt');
  assert.equal(got['Virgil van Dijk'], 'Van Dijk');
  assert.equal(got['Kevin De Bruyne'], 'De Bruyne');
  assert.equal(got['Frenkie de Jong'], 'De Jong');
  assert.equal(got['Marc-André ter Stegen'], 'Ter Stegen');
  assert.equal(got['Robin van Persie'], 'Van Persie');
  assert.equal(got['Alexis Mac Allister'], 'Mac Allister');
});

test('every other name is left exactly as it was', async (t) => {
  const game = await createGame();
  t.after(() => game.close());

  const got = game.eval(`(function(){
    const names=['Erling Haaland','Bruno Fernandes','Achraf Hakimi','Nathan Aké',
      'Riyad Mahrez','Youri Tielemans','Carlos Baleba','Sandro Tonali',
      'Cristiano Ronaldo dos Santos Aveiro'];
    const out={};
    names.forEach(n=>{ out[n]=surname(n); });
    /* a single name is a whole name */
    out.mono=['Rodrygo','Casemiro','Fred'].map(n=>surname(n)).join(',');
    /* and nothing falls over on the edges */
    out.empty=surname('');
    out.blank=surname('   ');
    out.nul=surname(null);
    return out;
  })()`);

  assert.equal(got['Erling Haaland'], 'Haaland');
  assert.equal(got['Bruno Fernandes'], 'Fernandes');
  assert.equal(got['Achraf Hakimi'], 'Hakimi');
  assert.equal(got['Nathan Aké'], 'Aké');
  assert.equal(got['Riyad Mahrez'], 'Mahrez');
  assert.equal(got['Youri Tielemans'], 'Tielemans');
  assert.equal(got['Carlos Baleba'], 'Baleba');
  assert.equal(got['Sandro Tonali'], 'Tonali');
  /* "dos" sits mid-name here, not in front of the last one, so the
     surname is still the final word */
  assert.equal(got['Cristiano Ronaldo dos Santos Aveiro'], 'Aveiro');
  assert.equal(got.mono, 'Rodrygo,Casemiro,Fred');
});

test('the real squad reads the way a team sheet does', async (t) => {
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
