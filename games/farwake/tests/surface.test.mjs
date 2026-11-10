import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSurface,movePerson,nearestEntity,isWalkable,TILE,drawSurface} from '../dist/surface.mjs';
import {NAMED_SYSTEMS,DIALOGUE,LORE} from '../dist/content.mjs';
const fixtures=[
 {id:'kettle',name:'Kettle Station',kind:'station'},
 {id:'morrow',name:'Morrow',kind:'planet',biome:'verdant'},
 {id:'lumen',name:'Lumen',kind:'moon',biome:'ice'},
 {id:'sirocco',name:'Sirocco',kind:'planet',biome:'arid'},
 {id:'ember',name:'Ember',kind:'planet',biome:'volcanic'},
 {id:'blue',name:'Blue',kind:'planet',biome:'ocean'},
 {id:'wreck',name:'The Cairn',kind:'derelict'},
 {id:'own-ship',name:'The Wren',kind:'ship'}
];
function flood(map){
 const sx=Math.floor(map.spawn.x/24),sy=Math.floor(map.spawn.y/24),seen=new Set([`${sx},${sy}`]),queue=[[sx,sy]];
 for(let i=0;i<queue.length;i++){
  const[x,y]=queue[i];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,key=`${xx},${yy}`;if(!seen.has(key)&&isWalkable(map,(xx+.5)*24,(yy+.5)*24,6)){seen.add(key);queue.push([xx,yy]);}}
 }
 return seen;
}
for(const fixture of fixtures){
 test(`${fixture.kind} ${fixture.biome||''}: every interaction can be reached from landing`,()=>{
  for(const seed of['farwake','test-route','another']){
   const m=generateSurface(fixture,seed);assert.equal(m.width,m.cols*24);assert.equal(m.height,m.rows*24);assert.ok(isWalkable(m,m.spawn.x,m.spawn.y));assert.equal(m.tiles.length,m.rows);assert.ok(m.tiles.every(row=>row.length===m.cols));
   const reachable=flood(m);if(fixture.kind==='ship')assert.equal(reachable.size,m.walkable.filter(Boolean).length,'Every tile of the compact starter cabin is reachable.');else assert.ok(reachable.size>70);
   for(const e of m.entities){assert.ok(isWalkable(m,e.x,e.y),`${fixture.id}/${e.id} must stand on clear ground`);const accessible=[...reachable].some(key=>{const[x,y]=key.split(',').map(Number);return Math.hypot((x+.5)*24-e.x,(y+.5)*24-e.y)<=34;});assert.ok(accessible,`${fixture.id}/${seed}: cannot reach ${e.id}`);}
  }
 });
}
test('deterministic generation produces stable places, with different wilderness between seeds',()=>{
 const a=generateSurface(fixtures[1],'same'),b=generateSurface(fixtures[1],'same'),c=generateSurface(fixtures[1],'different');assert.deepEqual(a,b);assert.notDeepEqual(a.decor,c.decor);assert.deepEqual(a.entities,b.entities);
});
test('movement supports diagonal speed, facing, sliding and collision without tunnelling',()=>{
 const m=generateSurface(fixtures[0],42);const p={...m.spawn,facing:'down'};const x=p.x,y=p.y;movePerson(m,p,1,0,.1);assert.equal(p.facing,'right');assert.ok(p.x>x);assert.equal(p.y,y);
 const p2={...m.spawn};movePerson(m,p2,1,1,.1);assert.ok(Math.abs(Math.hypot(p2.x-m.spawn.x,p2.y-m.spawn.y)-11.2)<.01);
 const edge={x:3*24+6.1,y:14.5*24,speed:1000};movePerson(m,edge,-1,0,.25);assert.ok(edge.x>=3*24+6);assert.ok(isWalkable(m,edge.x,edge.y));
 const safeX=edge.x;movePerson(m,edge,NaN,Infinity,NaN);assert.equal(edge.x,safeX);assert.ok(Number.isFinite(edge.y));
});
test('local work has a crate route, three maintenance stops and field samples',()=>{
 const p=generateSurface(fixtures[1],1);assert.equal(p.entities.filter(e=>e.type==='sample').length,3);assert.equal(p.entities.filter(e=>e.type==='work').length,3);assert.equal(p.entities.filter(e=>e.type==='crate').length,1);assert.equal(p.entities.filter(e=>e.type==='delivery').length,1);
 const station=generateSurface(fixtures[0],1);assert.ok(station.entities.some(e=>e.type==='mechanic'));assert.ok(station.entities.some(e=>e.type==='medic'));assert.ok(station.entities.some(e=>e.role==='bartender'));assert.ok(station.entities.some(e=>e.data.story));
});
test('nearestEntity returns original entities and ignores hidden interactables',()=>{
 const m=generateSurface(fixtures[0],1),e=m.entities.find(e=>e.type==='jobboard');assert.equal(nearestEntity(m,e,10),e);e.hidden=true;assert.notEqual(nearestEntity(m,e,10),e);assert.equal(nearestEntity(m,{x:-1000,y:-1000}),null);
});
test('rendering does not change map state and returns a camera contained in map bounds',()=>{
 const ctx={canvas:{width:400,height:600},save(){},restore(){},fillRect(){},fillText(){},translate(){},scale(){},setLineDash(){},strokeRect(){},measureText(s){return{width:String(s).length*5};}};
 for(const fixture of fixtures){const m=generateSurface(fixture,'render'),snapshot=JSON.stringify(m);const view=drawSurface(ctx,m,{width:400,height:600,time:1.4,person:{...m.spawn,facing:'down'}});assert.ok(Number.isFinite(view.cameraX));assert.ok(Number.isFinite(view.cameraY));assert.equal(JSON.stringify(m),snapshot);}
});
test('authored body IDs resolve their own location, system, valid lore and reachable residents',()=>{
 const original=JSON.stringify(NAMED_SYSTEMS),loreIds=new Set(LORE.map(l=>l.id));
 for(const system of NAMED_SYSTEMS)for(const body of system.bodies){
  const m=generateSurface(body.id,'authored-check'),reachable=flood(m);
  assert.equal(m.name,body.name);assert.equal(m.systemId,system.id);assert.equal(m.systemName,system.name);assert.equal(m.faction,system.faction);assert.equal(m.localLore,body.lore);assert.ok(loreIds.has(m.loreId));
  const archive=m.entities.find(e=>e.id===`${body.id}:lore`);assert.ok(loreIds.has(archive.data.loreId));assert.equal(archive.data.localLore,body.lore);assert.ok(archive.text.includes(body.lore));
  for(const e of m.entities){assert.ok(reachable.has(`${Math.floor(e.x/24)},${Math.floor(e.y/24)}`),`${body.id}: ${e.name} is blocked`);if(['npc','medic','mechanic'].includes(e.type)){assert.equal(e.data.homeLocationId,body.id);assert.equal(e.data.systemName,system.name);assert.ok(e.text.length>10);}}
 }
 assert.equal(JSON.stringify(NAMED_SYSTEMS),original,'surface generation must not mutate authored content');
});
test('main-story contacts match their authored identity and keep stable action roles',()=>{
 const expected={kettle:[DIALOGUE.dockworker.name,'dockworker','first_shift'],listening:[DIALOGUE.archivist.name,'archivist','listening_house'],ledger:['Liaison Evin Raye','governor','three_claims'],stillwater:['Custodian Nemi Ives','archivist','witness_vault'],earth:[DIALOGUE.governor.name,'governor','open_sky']};
 for(const[id,[name,role,chapter]]of Object.entries(expected)){const m=generateSurface({id},1),contact=m.entities.find(e=>e.data.story);assert.equal(contact.name,name);assert.equal(contact.role,role);assert.equal(contact.data.storyKey,chapter);}
 const kettle=generateSurface('kettle',1),listening=generateSurface('listening',1),kettleMechanic=kettle.entities.find(e=>e.type==='mechanic'),otherMechanic=listening.entities.find(e=>e.type==='mechanic');
 assert.equal(kettleMechanic.name,DIALOGUE.mechanic.name);assert.equal(kettleMechanic.role,'mechanic');assert.notEqual(otherMechanic.name,kettleMechanic.name);assert.ok(otherMechanic.text.includes('Listening House'));assert.notEqual(kettle.entities.find(e=>e.role==='bartender').name,listening.entities.find(e=>e.role==='bartender').name);
});
test('an uncrewed cabin has consoles; assigned crew occupy stations exactly once',()=>{
 const empty=generateSurface({kind:'ship',id:'own-ship'},1);assert.equal(empty.entities.filter(e=>e.type==='crew').length,0);
 for(const slot of['engineering','navigation','medical','security']){const e=empty.entities.find(e=>e.id===`own-ship:station:${slot}`);assert.equal(e.type,'station');assert.equal(e.data.stationRole,slot);}
 const crew=[{id:'anik',name:'Anik Sol',role:'engineer'},{id:'jules',name:'Jules Aster',role:'navigator'},{id:'tavi',name:'Tavi Sen',role:'medic'}],staffed=generateSurface({kind:'ship',id:'own-ship',crew},1),people=staffed.entities.filter(e=>e.type==='crew');
 assert.equal(people.length,3);assert.equal(new Set(people.map(e=>e.data.crewId)).size,3);assert.equal(staffed.entities.find(e=>e.data.crewId==='anik').name,'Anik Sol');assert.equal(staffed.entities.find(e=>e.data.crewId==='jules').name,'Jules Aster');
 for(const e of people)assert.ok(isWalkable(staffed,e.x,e.y));
});
