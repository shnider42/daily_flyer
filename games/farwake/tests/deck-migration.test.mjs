import test from 'node:test';
import assert from 'node:assert/strict';
import {cabinLayout,isCabinWalkable,CABIN_REVISION} from '../dist/interior-layouts.mjs';
import {ensureDamageControl,interiorExposure} from '../dist/interior-damage.mjs';

const legacySection=(id,x,y,damage=0,fire=0,breach=0)=>({id,name:id,x,y,damage,fire,breach});

test('merged Sparrow compartments retain their old fires, leaks and scars without creating extra damage',()=>{
 const ship={id:'old-cutter',classId:'sparrow',hull:59,maxHull:100,energy:34,damageControl:{version:1,layoutRevision:2,clock:800,serial:17,
  sections:[legacySection('bridge',348,276,5),legacySection('work',348,600,7),legacySection('medical',180,756,35,50,20),legacySection('quarters',540,780,60,25,55),legacySection('engineering',360,876,48,0,30)],
  impacts:[{serial:16,at:799.5,x:156,y:324,strength:.3,shieldOnly:false,sectionId:'medical',hullDamage:6},{serial:17,at:799.8,x:360,y:876,strength:.5,shieldOnly:false,sectionId:'engineering',hullDamage:10}]
 }};
 const original=structuredClone(ship.damageControl),damage=ensureDamageControl(ship),layout=cabinLayout(ship.classId);
 assert.equal(damage.layoutRevision,CABIN_REVISION);assert.deepEqual(damage.sections.map(s=>s.id),['bridge','work']);
 const work=damage.sections.find(s=>s.id==='work');assert.equal(work.damage,60);assert.equal(work.fire,50);assert.equal(work.breach,55);
 assert.equal(damage.sections[0].damage,5);assert.equal(damage.sections[0].fire,0);
 assert.ok(damage.sections.every(section=>isCabinWalkable(layout,section.x,section.y)));
 assert.ok(interiorExposure(ship,work,{delta:.1})>0,'An old active hazard still affects the actual compact deck.');
 assert.equal(ship.hull,59);assert.equal(ship.energy,34);assert.equal(damage.clock,800);assert.equal(damage.serial,17);
 assert.deepEqual(damage.impacts.map(hit=>[hit.serial,hit.at,hit.strength,hit.hullDamage]),original.impacts.map(hit=>[hit.serial,hit.at,hit.strength,hit.hullDamage]));
 assert.ok(damage.impacts.every(hit=>hit.sectionId==='work'&&isCabinWalkable(layout,hit.x,hit.y)));
 assert.deepEqual({x:damage.impacts[0].x,y:damage.impacts[0].y},{x:156,y:324},'A still-valid historical impact keeps its position.');
 const retained=structuredClone(damage);assert.equal(ensureDamageControl(ship),damage,'Ordinary ticks reuse the migrated state.');assert.deepEqual(ship.damageControl,retained);
 const restored=structuredClone(ship);assert.deepEqual(ensureDamageControl(restored),retained,'Reloading the new layout cannot merge the hazards a second time.');
});

test('removed Kestrel service rooms migrate into its real solo cabin and keep bounded hazard severity',()=>{
 const ship={id:'old-scout',classId:'kestrel',hull:39,maxHull:78,damageControl:{version:1,layoutRevision:2,clock:120,serial:3,
  sections:[legacySection('bridge',276,288),legacySection('quarters',228,720,12),legacySection('medical',372,660,20,36),legacySection('engineering',180,900,80,0,45),legacySection('chart',420,936,60,24,15)],impacts:[]
 }};
 const damage=ensureDamageControl(ship),layout=cabinLayout('kestrel'),cabin=damage.sections.find(s=>s.id==='quarters');
 assert.equal(damage.sections.length,2);assert.equal(cabin.damage,80);assert.equal(cabin.fire,36);assert.equal(cabin.breach,45);
 assert.ok(isCabinWalkable(layout,cabin.x,cabin.y));assert.equal(ship.hull,39);assert.equal(damage.serial,3);
 const saved=structuredClone(ship);assert.deepEqual(ensureDamageControl(saved),damage);
});

test('healthy merged rooms stay healthy and migration never invents a fresh impact',()=>{
 const ship={id:'quiet-old-cutter',classId:'sparrow',hull:100,maxHull:100,damageControl:{version:1,layoutRevision:2,clock:500,serial:9,
  sections:[legacySection('bridge',348,276),legacySection('medical',180,756),legacySection('quarters',540,780),legacySection('engineering',360,876)],impacts:[]
 }};
 const damage=ensureDamageControl(ship);assert.ok(damage.sections.every(s=>s.damage===0&&s.fire===0&&s.breach===0));
 assert.deepEqual(damage.impacts,[]);assert.equal(damage.serial,9);assert.equal(damage.clock,500);
});
