const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, startCareer, waitFor } = require('./game-harness.cjs');

test('portraits are stable, self-contained and bounded, with distinct appearance and current kits', async (t) => {
  const game = await createGame(); t.after(() => game.close());
  assert.deepEqual(game.errors, [], 'new presentation modules load before a career exists');
  await startCareer(game, 'Portrait QA', { seed: 20260906 });
  const out = game.eval(`(() => {
    const c=G.clubs[G.my], p=c.players.find(p=>p.pos!=='GK');
    const authored=JSON.stringify(MUN_FACES);
    const tielemans=faceSpec({id:910000,name:'Youri Tielemans',age:29});
    const before=JSON.stringify(p), first=face(p,120), second=face(p,120);
    const parser=new DOMParser(); const doc=parser.parseFromString(first,'text/html');
    const image=doc.querySelector('img');
    const svg=decodeURIComponent(image.getAttribute('src').split(',').slice(1).join(','));
    const parsed=parser.parseFromString(svg,'image/svg+xml');
    const ids=new Set(Array.from(parsed.querySelectorAll('[id]')).map(n=>n.id));
    const unresolved=Array.from(svg.matchAll(/url\\(#([^)]*)\\)/g)).filter(m=>!ids.has(m[1]));
    const own=face(p,28);const originalClub=p.club;p.club=G.clubs.find(c=>c.i!==G.my&&c.c1!==G.clubs[G.my].c1).i;
    const transferred=face(p,28);p.club=originalClub;
    const all=G.clubs[G.my].players.map(p=>face(p,28));
    const spec=Object.assign({},faceSpec(p));
    const cuts=MGR_CUTS.map(([cut])=>RBSPortraits.drawing(p,{...spec,cut},c));
    const valid=cuts.every(s=>!parser.parseFromString(s,'image/svg+xml').querySelector('parsererror')&&!/undefined|NaN/.test(s));
    for(let i=0;i<210;i++)RBSPortraits.source({...p,id:900000+i},spec,c);
    return {stable:first===second,oneNode:doc.body.children.length===1&&doc.body.firstElementChild.tagName==='IMG',
      selfContained:!parsed.querySelector('parsererror')&&unresolved.length===0&&!/<image|https?:/.test(svg.replace('http://www.w3.org/2000/svg','')),
      unchanged:before===JSON.stringify(p),authoredUnchanged:authored===JSON.stringify(MUN_FACES),
      authoredWins:tielemans.sk==='brown'&&tielemans.hr==='black',
      kitChanged:own!==transferred,distinct:new Set(all).size===all.length,
      valid,bounded:RBSPortraits.cacheSize()<=RBSPortraits.cacheLimit};
  })()`);
  for (const [key, value] of Object.entries(out)) assert.equal(value, true, key);
  assert.deepEqual(game.errors, []);
});

test('career search opens actual players and every management shortcut reaches its screen', async (t) => {
  const game = await createGame(); t.after(() => game.close());
  await startCareer(game, 'Navigation QA', { seed: 20260907 });
  game.click('careerSearch');
  const input = game.document.getElementById('rbsCareerSearch');
  input.value = 'Bruno'; input.dispatchEvent(new game.window.Event('input', { bubbles: true }));
  const result = game.document.querySelector('[data-action="careerResult"][data-kind="player"]');
  assert.ok(result);
  assert.match(result.textContent, /Bruno/);
  result.click();
  assert.match(game.document.getElementById('sheetBody').textContent, /Bruno/);
  assert.ok(game.document.getElementById('rbsPlayerReadiness'));
  assert.equal(game.document.querySelector('.rbs-compare-open').parentElement.id, 'sheetBody',
    'the comparison button must not squeeze the portrait identity row');
  const paths = [
    ['training','squad','training'], ['treatment','squad','treat'], ['academy','squad','academy'],
    ['fixtures','world','fixtures'], ['table','world','table'], ['finances','club','finances'],
    ['staff','club','staff'], ['saves','club','save'], ['squad','squad','first'],
    ['tactics','tactics',null], ['transfers','transfers',null], ['office','home',null],
  ];
  for (const [key, view, tab] of paths) {
    game.eval(`RBSExperience.navigate(${JSON.stringify(key)})`);
    assert.equal(game.eval('UI.view'), view, key);
    if (tab) assert.equal(game.eval(view === 'squad' ? 'UI.squadTab' : 'UI.clubTab'), tab, key);
    assert.equal(game.document.querySelectorAll('#rbsPageTools').length, 1, key);
  }
  const matches = game.eval("RBSExperience.search('Martinez')");
  assert.ok(matches.some((p) => /Martínez/.test(p.title)), 'accent-free search finds accented surnames');
  game.document.dispatchEvent(new game.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  await waitFor(() => game.document.getElementById('rbsCareerSearch'), { label: 'career search shortcut' });
  assert.deepEqual(game.errors, []);
});

test('tactical and player explanations read the real settings and protect unscouted information', async (t) => {
  const game = await createGame(); t.after(() => game.close());
  await startCareer(game, 'Tactical Help QA', { seed: 20260908 });
  const data = game.eval(`(() => {
    RBSExperience.navigate('tactics');
    const p=playerById(G.tacs.xi[6]);
    const fresh=RBSExperience.readiness(p);p.cond=41;
    ACTIONS.tacSet({dataset:{k:'tempo',v:'Fast'}});ACTIONS.tacSet({dataset:{k:'press',v:'High'}});
    const before=JSON.stringify({tacs:G.tacs,p});
    const brief=RBSExperience.tacticalBrief(), tired=RBSExperience.readiness(p);
    const after=JSON.stringify({tacs:G.tacs,p});
    const other=G.clubs.find(c=>c.i!==G.my).players[0];other.scouted=false;
    const hidden=RBSExperience.readiness(other)===null;
    const html=document.getElementById('rbsTacticalBrief').textContent;
    return {readOnly:before===after,lower:tired.effective<fresh.effective,condition:tired.condition,
      hidden,workload:brief.workload,shown:html.includes('below 80%')&&html.includes('Fast tempo')};
  })()`);
  assert.ok(data.readOnly); assert.ok(data.lower); assert.ok(data.hidden); assert.ok(data.shown);
  assert.equal(data.condition, 41); assert.ok(data.workload >= 2);
  game.click('careerGuide');
  const input = game.document.getElementById('rbsGuideSearch');
  input.value = 'sharpness'; input.dispatchEvent(new game.window.Event('input', { bubbles: true }));
  assert.equal(input.value, 'sharpness');
  assert.ok(game.document.querySelector('.rbs-guide-article[open]'));
  assert.match(game.document.getElementById('rbsGuideArticles').textContent, /Condition, sharpness and morale/);
  assert.deepEqual(game.errors, []);
});
