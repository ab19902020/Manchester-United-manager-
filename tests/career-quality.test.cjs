const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, startCareer, waitFor } = require('./game-harness.cjs');

test('team selection rejects unavailable identities, swaps the named bench, and checks the keeper slot', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Selection QA', { seed: 20260905 });
  const result = game.eval(`(() => {
    const club = G.clubs[G.my], api = RBSLineup;
    const sub = club.players.find(p => !G.tacs.xi.includes(p.id) && !p.loan && !p.youth && !p.injury && !p.susp);
    const original = G.tacs.xi.slice(), outgoing = original[7];
    sub.injury = {name:'Test injury',days:8};
    const injured = api.putInSlot(7, sub.id);
    delete sub.injury;
    sub.susp = 1;
    const suspended = api.putInSlot(7, sub.id);
    sub.susp = 0;
    const outsider = G.clubs.find(c=>c.i!==G.my).players[0];
    const foreign = api.putInSlot(7, outsider.id);
    const unchanged = JSON.stringify(original) === JSON.stringify(G.tacs.xi);
    G.tacs.bench = [sub.id,sub.id,99999999];
    UI.selSlot=7;
    ACTIONS.xiSwapOpen();
    document.querySelector('[data-xi-swap] [data-id="'+sub.id+'"]').click();
    const chosen = G.tacs.xi[7] === sub.id;
    const closed = !document.getElementById('modalHost').classList.contains('open');
    const bench = G.tacs.bench.slice();
    G.tacs.xi[6] = G.tacs.xi[7];
    const duplicate = squadIssues().some(i=>i.k==='identity');
    G.tacs.xi=original.slice();
    [G.tacs.xi[0],G.tacs.xi[7]]=[G.tacs.xi[7],G.tacs.xi[0]];
    const keeper = squadIssues().some(i=>i.k==='keeper-position');
    return {injured,suspended,foreign,unchanged,chosen,closed,bench,outgoing,duplicate,keeper};
  })()`);
  for (const key of ['injured', 'suspended', 'foreign']) assert.equal(result[key], false, key);
  for (const key of ['unchanged', 'chosen', 'closed', 'duplicate', 'keeper']) assert.equal(result[key], true, key);
  assert.deepEqual(Array.from(result.bench), [result.outgoing]);
});

test('preparation and the scouting report follow a cup tie, show real fitness, and open the right replacement', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  assert.deepEqual(game.errors, [], 'the preparation panel must be safe before a career exists');
  await startCareer(game, 'Preparation QA', { seed: 12 });
  const result = game.eval(`(() => {
    const next=nextUserFixture();
    const ci=G.clubs.find(c=>c.league==='PL' && c.i!==G.my && c.i!==next.a && c.i!==next.h).i;
    G.cups.QA={ties:[{h:G.my,a:ci,day:G.day+1,cup:'QA',played:false}]};
    const p=playerById(G.tacs.xi[7]); p.cond=42;
    const before=JSON.stringify({xi:G.tacs.xi,attrs:p.attrs,cond:p.cond});
    const info=RBSPreparation.read();
    const after=JSON.stringify({xi:G.tacs.xi,attrs:p.attrs,cond:p.cond});
    UI.view='home'; render();
    const report=document.querySelector('.opr-h').textContent;
    const panel=document.getElementById('rbsPreparation');
    const showed=panel.textContent.includes(p.name) && panel.textContent.includes('42% condition');
    panel.querySelector('[data-action="prepReview"][data-v="7"]').click();
    return {report,opponent:G.clubs[ci].short||G.clubs[ci].name,
      cup:info.next.cup,readOnly:before===after,showed,slot:UI.selSlot,view:UI.view,
      picker:!!document.querySelector('[data-xi-swap]')};
  })()`);
  assert.ok(result.report.includes(result.opponent), result.report);
  assert.equal(result.cup, 'QA');
  assert.ok(result.readOnly);
  assert.ok(result.showed);
  assert.equal(result.slot, 7);
  assert.equal(result.view, 'tactics');
  assert.ok(result.picker);
});

test('recruitment filters use visible potential and comparisons respect scouting knowledge', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Recruitment QA', { seed: 18 });
  const result = game.eval(`(() => {
    const target=G.clubs.find(c=>c.i!==G.my).players.find(p=>p.pos!=='GK');
    target.name='Quality Test Prospect'; target.ovr=70; target.pot=72; target.potMax=94; target.scouted=true;
    UI.trQ=target.name; UI.trPos='Any'; UI.trAge='40'; UI.trPot='90';
    UI.trDeal='market'; UI.trAfford=false; UI.trShort=false; UI.trListed=false;
    const market=trResultsHtml().includes(target.name);
    openProfile(target.id);
    const entry=!!document.querySelector('[data-action="comparePlayer"]');
    ACTIONS.comparePlayer({dataset:{id:String(target.id)}});
    const before=JSON.stringify(target);
    const own=RBSComparison.candidates(target)[0];
    const known=RBSComparison.rows(target,own);
    target.scouted=false;
    const unknown=RBSComparison.rows(target,own);
    target.scouted=true;
    const unchanged=before===JSON.stringify(target);
    const second=RBSComparison.candidates(target)[1];
    const select=document.getElementById('rbsCompareChoice');
    select.value=String(second.id);select.dispatchEvent(new Event('change',{bubbles:true}));
    const switched=document.querySelector('.rbs-compare thead').textContent.includes(second.name);
    UI.trPage=7;ACTIONS.trDeal({dataset:{v:'free'}});
    const reset=UI.trPage===0;
    const free=faList()[0]; free.name='Quality Free Prospect';free.pot=65;free.potMax=96;
    UI.trQ=free.name;UI.trPot='90';UI.trAfford=false;
    return {market,entry,known:known.every(r=>r.a!==null&&r.b!==null),
      unknown:unknown.every(r=>r.a===null&&r.b!==null),unchanged,switched,reset,
      free:trResultsHtml().includes(free.name)};
  })()`);
  for (const [key, value] of Object.entries(result)) assert.equal(value, true, key);
});

test('recovery saves can be restored and Continue chooses the most recent primary save', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  await startCareer(game, 'Save QA', { seed: 34 });
  const saves = game.window.RBSSaves;
  game.eval('G.day=8');
  await saves.save('auto', true);
  game.eval('G.day=15');
  await saves.save('auto', true);
  game.eval('G.day=18');
  await saves.save('3', true);
  game.eval("UI.view='club';UI.clubTab='save';render()");
  assert.ok(game.document.querySelector('[data-action="loadSlotAsk"][data-v="auto-1"]'));
  assert.equal(await saves.load('auto-1'), true);
  assert.equal(game.eval('G.day'), 8);
  game.eval('showStart()');
  await waitFor(() => game.document.querySelector('[data-action="resumeCareer"]'), {label:'Continue button'});
  assert.equal(game.document.querySelector('[data-action="resumeCareer"]').dataset.v, '3');
  game.click('savedCareers');
  await waitFor(() => game.document.querySelector('[data-action="loadSlotAsk"][data-v="auto-1"]'), {label:'recovery picker'});
  assert.equal(game.document.querySelector('#sheetBody [data-action="saveSlot"]'), null,
    'the start-screen picker must not offer to overwrite a save with a world that is not loaded');
  const saved = await saves.store.get('3');
  await game.eval('ACTIONS.saveSlot({dataset:{v:"3"}})');
  assert.ok(game.document.querySelector('[data-action="saveSlotConfirm"]'));
  assert.deepEqual(await saves.store.get('3'), saved, 'opening overwrite confirmation does not replace the career');
});

test('keyboard activation leaves native form controls intact and includes newly inserted actions', async (t) => {
  const game = await createGame();
  t.after(() => game.close());
  game.eval(`(() => {
    const host=document.createElement('div');
    host.innerHTML='<div data-action="qualityKeyboard" id="qualityRow"><input id="qualityInput"><select id="qualitySelect" data-action="qualitySelect"><option>One</option></select></div>';
    document.body.appendChild(host);
    window.qualityActivations=0;
    ACTIONS.qualityKeyboard=()=>window.qualityActivations++;
  })()`);
  await waitFor(() => game.document.getElementById('qualityRow').getAttribute('role') === 'button');
  const input = game.document.getElementById('qualityInput');
  input.dispatchEvent(new game.window.KeyboardEvent('keydown', {key:' ', bubbles:true, cancelable:true}));
  assert.equal(game.window.qualityActivations, 0, 'typing a space must not activate the parent row');
  assert.equal(game.document.getElementById('qualitySelect').getAttribute('role'), null, 'a select retains combobox semantics');
  game.eval(`(() => {
    const row=document.createElement('div');row.dataset.action='qualityKeyboard';row.id='qualityAdded';
    document.body.appendChild(row);
  })()`);
  await waitFor(() => game.document.getElementById('qualityAdded').tabIndex === 0);
  game.document.getElementById('qualityAdded').dispatchEvent(new game.window.KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
  assert.equal(game.window.qualityActivations, 1);
});
