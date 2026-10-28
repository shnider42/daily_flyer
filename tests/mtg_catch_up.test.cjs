const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = require('../static/mtg_catch_up/app.js');
const data = require('../daily_flyer_v2/data/mtg_catch_up.json');
const choose = raw => api.selectStories(data.stories,api.normalize(raw,'2026-10-27')).map(s=>s.id);

test('format and platform intersect while broad rules remain relevant',()=>{
  const commander=choose({format:'commander',platform:'paper'});
  assert(commander.includes('brackets')); assert(commander.includes('combat'));
  assert(!commander.includes('arena-rebalance')); assert(!commander.includes('standard3'));
  assert.deepEqual(choose({format:'commander',platform:'arena'}),[]);
  assert.deepEqual(choose({format:'alchemy',platform:'paper'}),[]);
  assert(choose({format:'alchemy',platform:'arena'}).includes('alchemy-future'));
  assert(!choose({format:'casual'}).includes('rotation-calendar'));
});
test('depth changes presentation without changing eligible changes',()=>{
  const options={format:'standard',when:'2021'};
  assert.deepEqual(choose({...options,depth:'overview'}),choose({...options,depth:'detailed'}));
});
test('announcement and effective milestones use explicit inclusive date boundaries',()=>{
  assert(choose({when:'custom',since:'2026-09-11'}).includes('alchemy-future'));
  assert(!choose({when:'custom',since:'2026-09-12'}).includes('alchemy-future'));
  assert(choose({when:'custom',since:'2026-09-22'}).includes('arena-rebalance'));
  assert.deepEqual(choose({when:'custom',since:'2026-10-01'}),[]);
  const future=data.stories.find(s=>s.id==='alchemy-future');
  assert(future.effective_on>data.reviewed_at); assert.equal(future.status,'Upcoming');
});
test('empty recent periods explicitly identify missing coverage',()=>{
  const message=api.coverageMessage(data,api.normalize({when:'custom',since:'2026-10-01'},'2026-10-27'),0);
  assert.match(message,/beyond the latest included/); assert.match(message,/does not mean nothing changed/);
  assert.match(api.coverageMessage(data,api.normalize({when:'2008'},'2026-10-27'),16),/Earlier changes are not covered/);
});
test('search and ordering are real filters',()=>{
  assert.deepEqual(choose({q:'ward',topic:'mechanics'}),['ward']);
  assert.equal(choose({order:'oldest'})[0],'m2010');
  assert.equal(choose({order:'newest'})[0],'arena-rebalance');
  assert.equal(choose({format:'commander'})[0],'brackets');
});
test('shared views round trip choices, exclude reading marks, and reject malformed data',()=>{
  const state=api.normalize({format:'standard',when:'2021',depth:'detailed',q:'rotation'},'2026-10-27');
  assert.deepEqual(api.sharedState(api.shareHash({...state,read:['combat']}),'2026-10-27'),state);
  for(const hash of ['#view=%','', '#view={bad'])assert.equal(api.sharedState(hash),null);
  for(const raw of [null,[],true,'x'])assert.equal(api.normalize(raw).when,'all');
  assert(!api.validDay('2025-02-29')); assert(api.validDay('2024-02-29'));
  assert.equal(api.normalize({when:'custom',since:'2999-01-01'},'2026-10-27').since,'');
  assert.equal(api.normalize({q:'x'.repeat(100)}).q.length,80);
});
test('source links are restricted to reviewed official HTTPS pages',()=>{
  for(const s of data.sources)assert.equal(api.safeURL(s.url),s.url);
  for(const u of ['javascript:alert(1)','http://magic.wizards.com','https://magic.wizards.com.evil.example','https://user:pass@magic.wizards.com'])assert.equal(api.safeURL(u),'');
});
