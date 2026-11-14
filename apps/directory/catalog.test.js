import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectProjects,formatAddedDate,validateCatalog,projectLink} from './catalog.js';
import {ART_KEYS,renderArtwork} from './artwork.js';
const catalog=JSON.parse(await readFile(new URL('./projects.json',import.meta.url),'utf8'));
test('every catalog entry has a launch destination and matching artwork',()=>{
  assert.equal(validateCatalog(catalog).length,37);
  for(const p of catalog){assert.ok(ART_KEYS.includes(p.art),p.id);assert.match(renderArtwork(p),/<svg/);assert.equal(new URL(projectLink(p)).protocol,'https:');}
});
test('the two sports routes open the intended sport instead of the same default game',()=>{
  for(const id of ['hockey','soccer'])assert.equal(new URL(catalog.find(p=>p.id===id).url).searchParams.get('sport'),id);
});
test('old names and URLs find the canonical projects',()=>{
  assert.deepEqual(selectProjects(catalog,{query:'PGI'}).map(p=>p.id),['gridiron']);
  assert.deepEqual(selectProjects(catalog,{query:'Dead Air'}).map(p=>p.id),['night-transfer']);
  assert.deepEqual(selectProjects(catalog,{query:'music-master.onrender.com'}).map(p=>p.id),['sleeve-notes']);
  assert.deepEqual(selectProjects(catalog,{query:'billiards'}).map(p=>p.id),['corner-pocket']);
  assert.deepEqual(selectProjects(catalog,{query:'parachute'}).map(p=>p.id),['skyward']);
});
test('type, search and favorites compose without showing unrelated entries',()=>{
  const selected=selectProjects(catalog,{type:'games',query:'pocket',favoritesOnly:true},new Set(['soccer','dayboard']));
  assert.deepEqual(selected.map(p=>p.id),['soccer']);
  assert.deepEqual(selectProjects(catalog,{favoritesOnly:true},new Set()),[]);
});
test('newest and oldest are true date orders, with missing dates last',()=>{
  const sample=[{...catalog[0],id:'unknown',datePrecision:'unknown',createdAt:null},{...catalog[1],id:'older',createdAt:'2025-12-31'},{...catalog[2],id:'newer',createdAt:'2026-01-01'}];
  assert.deepEqual(selectProjects(sample,{sort:'newest'}).map(p=>p.id),['newer','older','unknown']);
  assert.deepEqual(selectProjects(sample,{sort:'oldest'}).map(p=>p.id),['older','newer','unknown']);
});
test('approximate dates never present a fictional exact day',()=>{
  const irish=catalog.find(p=>p.id==='irish-today');assert.equal(formatAddedDate(irish),'~ Mar 2026');
  assert.equal(formatAddedDate({createdAt:'2026-11-08',datePrecision:'day'}),'Nov 8, 2026');
});
test('recent updates surface older projects without changing their creation order',()=>{
  const base=catalog.find(p=>p.id==='dsl');
  const sample=[
    {...base,id:'older-updated',createdAt:'2026-09-01',updatedAt:'2026-11-14'},
    {...base,id:'new-release',createdAt:'2026-11-12'},
    {...base,id:'earlier-update',createdAt:'2026-10-01',updatedAt:'2026-11-10'},
    {...base,id:'unrecorded',createdAt:null,datePrecision:'unknown'}
  ];
  assert.deepEqual(selectProjects(sample,{sort:'updated'}).map(p=>p.id),['older-updated','new-release','earlier-update','unrecorded']);
  assert.deepEqual(selectProjects(sample,{sort:'newest'}).map(p=>p.id),['new-release','earlier-update','older-updated','unrecorded']);
});
test('game subtype filter distinguishes sports from the other games',()=>{
  assert.deepEqual(selectProjects(catalog,{type:'games',kind:'Sports',sort:'name'}).map(p=>p.id),['corner-pocket','pocket-baseball','gridiron','hockey','soccer','shenanigans-golf','sunday-broadcast']);
});
