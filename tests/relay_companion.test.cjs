const assert = require('node:assert/strict');
const {test} = require('node:test');
const {normalizePlan,parseImport,estimateMinutes} = require('../daily_flyer/themes/relay_companion_assets/app.js');

test('imports accept only the documented snapshot version', () => {
  assert.throws(()=>parseImport('{"schema":"other","plan":{}}'));
  assert.throws(()=>parseImport('not json'));
  assert.throws(()=>parseImport('{"schema":"relay-fieldguide/v1","plan":{"format":"__proto__"}}'));
});
test('untrusted snapshot data is bounded and unknown fields discarded', () => {
  const p=normalizePlan({format:'ultra',name:'x'.repeat(100),notes:'n'.repeat(3000),tasks:['crew','crew','unknown'],pace:999,roster:Array(30).fill({name:'z'.repeat(90),group:'invalid'}),injected:'ignored'});
  assert.equal(p.name.length,60);assert.equal(p.notes.length,2000);assert.equal(p.roster.length,12);assert.equal(p.roster[0].name.length,40);assert.equal(p.roster[0].group,'unassigned');assert.deepEqual(p.tasks,['crew']);assert.equal(p.pace,16);assert.equal(p.injected,undefined);
});
test('export/import round trip preserves a smaller-format plan and unused roster slots', () => {
  const original=normalizePlan({format:'sprintUltra',name:'A & B <crew>',notes:'Line one\nLine two',roster:[{name:'Alex',group:'a'},null,null,{name:'Retained runner',group:'b'}],tasks:['format'],pace:9.25});
  assert.deepEqual(parseImport(JSON.stringify({schema:'relay-fieldguide/v1',plan:original})),original);
});
test('estimates distinguish full and sprint formats and reject invalid inputs', () => {
  assert.equal(estimateMinutes('standard',10),2000);assert.equal(estimateMinutes('sprint',10),600);assert.equal(estimateMinutes('ultra',9.25),1850);assert.throws(()=>estimateMinutes('standard',Infinity));assert.throws(()=>estimateMinutes('constructor',10));
});
