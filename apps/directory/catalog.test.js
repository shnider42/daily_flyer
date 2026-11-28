import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectProjects,formatAddedDate,validateCatalog,projectLink,featureWeek,featureEdition,featuredProjects,DEVICE_LABELS} from './catalog.js';
import {ART_KEYS,renderArtwork} from './artwork.js';
const catalog=JSON.parse(await readFile(new URL('./projects.json',import.meta.url),'utf8'));
test('every catalog entry has a launch destination and matching artwork',()=>{
  validateCatalog(catalog);
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
  assert.deepEqual(selectProjects(catalog,{type:'games',kind:'Sports',sort:'name'}).map(p=>p.id),['corner-pocket','pocket-baseball','pocket-basketball','gridiron','hockey','soccer','volleyball','shenanigans-golf','sunday-broadcast']);
});


function sampleProject(id,type='games',best='both',featureWeight=3) {
  return {id,title:id,type,subtype:'Example',art:'dsl',url:`https://example.com/${id}`,linkKind:'app',createdAt:'2020-01-01',datePrecision:'day',device:{best,note:'A device recommendation.'},featureEligible:true,featureWeight};
}
const sampleTypes=['games','tools','catch-up','stories'];
const variedCatalog=sampleTypes.flatMap(type=>['mobile','desktop','both'].flatMap(best=>[1,2].map(n=>sampleProject(`${type}-${best}-${n}`,type,best))));
const featureIds=entries=>entries.map(p=>p.id);
const sortedFeatureIds=entries=>featureIds(entries).sort();
const weekDate=index=>new Date(Date.UTC(2026,10,23+index*7,17));

test('feature weeks switch at Monday midnight New York, including DST and year boundaries',()=>{
  assert.equal(featureWeek(new Date('2026-11-23T04:59:59Z')),'2026-11-16');
  assert.equal(featureWeek(new Date('2026-11-23T05:00:00Z')),'2026-11-23');
  assert.equal(featureWeek(new Date('2026-03-09T03:59:59Z')),'2026-03-02');
  assert.equal(featureWeek(new Date('2026-03-09T04:00:00Z')),'2026-03-09');
  assert.equal(featureWeek(new Date('2026-11-02T04:59:59Z')),'2026-10-26');
  assert.equal(featureWeek(new Date('2026-11-02T05:00:00Z')),'2026-11-02');
  assert.equal(featureWeek(new Date('2027-01-01T12:00:00Z')),'2026-12-28');
  assert.throws(()=>featureWeek(new Date('invalid')),RangeError);
});

test('the same week has the same weighted picks regardless of time or catalog order',()=>{
  const expected=featureEdition(variedCatalog,new Date('2026-11-23T05:00:00Z'));
  assert.deepEqual(featureEdition([...variedCatalog].reverse(),new Date('2026-11-30T04:59:59Z')),expected);
  assert.deepEqual(featureIds(featuredProjects(variedCatalog,weekDate(0))),featureIds(expected.projects));
  assert.equal(expected.week,'2026-11-23');
  assert.equal(expected.projects.length,3);
  assert.equal(new Set(featureIds(expected.projects)).size,3);
});

test('weekly picks mix types, rotate all categories and avoid repeating the same trio',()=>{
  let previous=[];
  const seen=new Set();
  for(let index=0;index<104;index++) {
    const entries=featureEdition(variedCatalog,weekDate(index)).projects;
    assert.equal(entries.length,3);
    assert.equal(new Set(entries.map(p=>p.type)).size,3);
    assert.notDeepEqual(sortedFeatureIds(entries),previous);
    previous=sortedFeatureIds(entries);
    entries.forEach(p=>seen.add(p.type));
  }
  assert.deepEqual([...seen].sort(),sampleTypes.slice().sort());
});

test('device editions recur occasionally, remain global, and only contain suitable recommendations',()=>{
  assert.deepEqual([0,1,2,3].map(index=>featureEdition(variedCatalog,weekDate(index)).focus),['all','mobile','all','desktop']);
  for(let index=0;index<12;index++) {
    const edition=featureEdition(variedCatalog,weekDate(index));
    if(edition.focus==='all') continue;
    assert.ok(edition.projects.every(p=>p.device.best===edition.focus||p.device.best==='both'));
    assert.equal(new Set(edition.projects.map(p=>p.type)).size,3);
  }
  const noMobile=variedCatalog.map(p=>({...p,device:{...p.device,best:'desktop'}}));
  assert.equal(featureEdition(noMobile,weekDate(1)).focus,'all');
  const mobileGamesOnly=variedCatalog.map(p=>({...p,device:{...p.device,best:p.type==='games'?'mobile':'desktop'}}));
  assert.equal(featureEdition(mobileGamesOnly,weekDate(1)).focus,'all');
});

test('weights increase exposure while leaving lighter themes a real chance',()=>{
  const pool=sampleTypes.flatMap(type=>[sampleProject(`${type}-strong`,type,'both',5),sampleProject(`${type}-light-a`,type,'both',1),sampleProject(`${type}-light-b`,type,'both',1)]);
  const counts=new Map(pool.map(p=>[p.id,0]));
  for(let index=0;index<520;index++) for(const p of featuredProjects(pool,weekDate(index))) counts.set(p.id,counts.get(p.id)+1);
  for(const type of sampleTypes) {
    const strong=counts.get(`${type}-strong`),lightA=counts.get(`${type}-light-a`),lightB=counts.get(`${type}-light-b`);
    assert.ok(strong>2*lightA&&strong>2*lightB,`${type}: ${strong}, ${lightA}, ${lightB}`);
    assert.ok(lightA>0&&lightB>0);
  }
});

test('features handle small catalogs, disabled entries and source-only destinations',()=>{
  const one=sampleProject('one'),two=sampleProject('two','tools');
  assert.deepEqual(featuredProjects([],weekDate(0)),[]);
  assert.equal(featuredProjects([one],weekDate(0)).length,1);
  assert.equal(featuredProjects([one,two],weekDate(0)).length,2);
  const pool=[one,two,sampleProject('three'),sampleProject('four'),sampleProject('disabled','stories','both',0),{...sampleProject('source','stories'),linkKind:'source'}];
  for(let index=0;index<8;index++) {
    const selected=featuredProjects(pool,weekDate(index));
    assert.equal(selected.length,3);
    assert.equal(new Set(selected.map(p=>p.type)).size,2);
    assert.ok(selected.every(p=>!['disabled','source'].includes(p.id)));
  }
});

test('device filters compose with category, search and favorites and include both-device themes',()=>{
  const pool=[sampleProject('touch','tools','mobile'),sampleProject('keys','tools','desktop'),sampleProject('flexible','tools','both'),sampleProject('game','games','both')];
  assert.deepEqual(featureIds(selectProjects(pool,{device:'mobile',sort:'name'})),['flexible','game','touch']);
  assert.deepEqual(featureIds(selectProjects(pool,{device:'desktop',sort:'name'})),['flexible','game','keys']);
  assert.deepEqual(featureIds(selectProjects(pool,{device:'both',sort:'name'})),['flexible','game']);
  assert.deepEqual(featureIds(selectProjects(pool,{type:'tools',device:'mobile',query:'flex',favoritesOnly:true},new Set(['flexible','keys','game']))),['flexible']);
  assert.deepEqual(selectProjects(pool,{device:'unsupported'}),[]);
  assert.deepEqual(Object.keys(DEVICE_LABELS),['mobile','desktop','both']);
});

test('every theme has actionable device metadata and an explicit valid feature weight',()=>{
  const valid=sampleProject('valid');
  assert.deepEqual(validateCatalog([valid]),[valid]);
  for(const device of [undefined,{best:'unsupported',note:'Reason'},{best:'toString',note:'Reason'},{best:'mobile',note:''},{best:'desktop',note:1}]) assert.throws(()=>validateCatalog([{...valid,device}]),/device recommendation/);
  for(const featureWeight of [undefined,-1,6,Infinity,NaN,2.5,'3']) assert.throws(()=>validateCatalog([{...valid,featureWeight}]),/feature weight/);
  assert.doesNotThrow(()=>validateCatalog([{...valid,featureWeight:0}]));
  assert.doesNotThrow(()=>validateCatalog([{...valid,featuredRank:99}]));
});


test('focus and category rotation stay independent, while mixed editions serve both devices',()=>{
  for(const focus of ['all','mobile','desktop']) {
    const seen=new Set();
    for(let index=0;index<32;index++) {
      const edition=featureEdition(variedCatalog,weekDate(index));
      if(edition.focus!==focus) continue;
      edition.projects.forEach(p=>seen.add(p.type));
      if(focus==='all') {
        assert.ok(edition.projects.some(p=>['mobile','both'].includes(p.device.best)));
        assert.ok(edition.projects.some(p=>['desktop','both'].includes(p.device.best)));
      }
    }
    assert.deepEqual([...seen].sort(),sampleTypes.slice().sort(),focus);
  }
});

test('the published catalog keeps three distinct categories and changes its weekly trio',()=>{
  let previous=[];
  for(let index=0;index<104;index++) {
    const edition=featureEdition(catalog,weekDate(index));
    assert.equal(edition.projects.length,3);
    assert.equal(new Set(edition.projects.map(p=>p.type)).size,3);
    assert.notDeepEqual(sortedFeatureIds(edition.projects),previous);
    previous=sortedFeatureIds(edition.projects);
    if(edition.focus==='all') {
      assert.ok(edition.projects.some(p=>['mobile','both'].includes(p.device.best)));
      assert.ok(edition.projects.some(p=>['desktop','both'].includes(p.device.best)));
    }
  }
});
