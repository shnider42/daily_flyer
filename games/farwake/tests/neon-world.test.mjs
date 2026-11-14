import test from 'node:test';
import assert from 'node:assert/strict';
import {NEON_SYSTEM,NEON_DISTRICTS,NEON_QUEST_CONTACTS,NEON_QUEST_OBJECTS,NEON_QUEST_THREADS,appendNeonSystem} from '../dist/neon-content.mjs';
import {generateSurface,isWalkable,nearestEntity,drawSurface,drawSurfaceMap} from '../dist/surface.mjs';
import {drawNeonRain} from '../dist/neon-world.mjs';
import {decorateGalaxyTypes,bodyVisualRadius} from '../dist/world-types.mjs';
import {decorateStationGeography} from '../dist/station-geography.mjs';
import {systemBodyPosition} from '../dist/system-space.mjs';

function reachable(map) {
  const index=p=>Math.floor(p.y/24)*map.cols+Math.floor(p.x/24),queue=[index(map.spawn)],seen=new Set(queue);
  for(let i=0;i<queue.length;i++){
    const n=queue[i],x=n%map.cols,y=Math.floor(n/map.cols);
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const xx=x+dx,yy=y+dy,k=yy*map.cols+xx;
      if(xx<0||xx>=map.cols||yy<0||yy>=map.rows||seen.has(k)||!isWalkable(map,(xx+.5)*24,(yy+.5)*24,6))continue;
      seen.add(k);queue.push(k);
    }
  }
  return{seen,index};
}

test('Voltage appends without replacing, moving or mutating any released galaxy entry',()=>{
  const previous=[{id:'hearth',gx:0,gy:0,index:0,bodies:[{id:'morrow',x:840,y:-420}]},{id:'known-procedural',gx:3.2,gy:-4.9,index:1,bodies:[{id:'saved-address'}]}];
  const before=JSON.stringify(previous),catalog=JSON.stringify(NEON_SYSTEM),next=appendNeonSystem(previous);
  assert.equal(next.length,previous.length+1);assert.equal(JSON.stringify(previous),before);assert.equal(next[0],previous[0]);assert.equal(next[1],previous[1]);
  const added=next.at(-1);assert.equal(added.id,'voltage');assert.equal(added.index,2);assert.ok(previous.every(old=>Math.hypot(added.gx-old.gx,added.gy-old.gy)>=1.15));
  assert.deepEqual(appendNeonSystem(previous),next);assert.equal(appendNeonSystem(next),next);assert.equal(JSON.stringify(NEON_SYSTEM),catalog);
});

test('the orbital exchange is physically near Glimmer and names its real supply worlds',()=>{
  const system=decorateStationGeography(decorateGalaxyTypes(appendNeonSystem([]),'neon-orbit'),'neon-orbit')[0];
  const bodies=system.bodies.map((body,i)=>({...body,...systemBodyPosition(body,i,system.id)})),port=bodies.find(body=>body.id==='voltage-crown'),city=bodies.find(body=>body.id==='glimmer');
  const gap=Math.hypot(port.x-city.x,port.y-city.y)-bodyVisualRadius(port)-bodyVisualRadius(city);
  assert.ok(gap>350&&gap<1400,'ships have a clear approach while the station shares the planetary neighborhood');
  assert.deepEqual(port.stationGeography.anchorBodyIds,['glimmer']);assert.deepEqual(new Set(port.stationGeography.servedBodyIds),new Set(['glimmer','voltage-kilowatt','voltage-reservoir']));
  assert.equal(city.planetTypeId,'ecumenopolis');assert.equal(city.sizeClass,'super-earth');
  for(const id of port.stationGeography.servedBodyIds)assert.ok(bodies.some(body=>body.id===id));
});

test('six authored city districts, every service and every table share one traversable region',()=>{
  const map=generateSurface('glimmer','neon-city'),{seen,index}=reachable(map);
  assert.equal(map.authoredCity,true);assert.equal(map.atmosphere,'city-rain');assert.equal(map.cols,140);assert.equal(map.rows,104);
  assert.deepEqual(map.districts.map(d=>d.name),NEON_DISTRICTS.map(d=>d.name));
  assert.ok(seen.size>map.cols*map.rows*.65);assert.ok(seen.has(index(map.exit)));
  assert.ok(map.decor.some(d=>d.kind==='city-tower'));assert.ok(map.decor.some(d=>d.kind==='city-scrap'));assert.ok(map.decor.some(d=>d.kind==='city-pipe'));
  for(const e of map.entities){assert.ok(isWalkable(map,e.x,e.y),e.id);assert.ok(seen.has(index(e)),`${e.id} has a physical route`);assert.equal(nearestEntity(map,e,0),e);}
  const games=map.entities.filter(e=>e.type==='gambling');assert.deepEqual(new Set(games.map(e=>e.data.gameId)),new Set(['poker','pool','blackjack']));
  for(const e of games){assert.equal(e.data.homeLocationId,'glimmer');assert.equal(e.data.systemId,'voltage');assert.equal(e.data.venueName,'Low Orbit');assert.deepEqual(e.data.stakes,[10,20,50,100]);assert.ok(e.x>=7*24&&e.x<=38*24&&e.y>=46*24&&e.y<=65*24,'tables remain inside Low Orbit');}
  assert.equal(map.spawn.x,(26+.5)*24);assert.equal(map.spawn.y,(88+.5)*24);
});

test('city identity and gambling fixtures survive regeneration and seed changes without rewriting the layout',()=>{
  const a=generateSurface('glimmer','one'),b=generateSurface('glimmer','one'),c=generateSurface('glimmer','two');
  assert.deepEqual(a,b);assert.deepEqual(a.tiles,c.tiles);assert.deepEqual(a.spawn,c.spawn);
  const tables=map=>map.entities.filter(e=>e.type==='gambling').map(({id,x,y,data})=>({id,x,y,data}));
  assert.deepEqual(tables(a),tables(c));
  const generic=generateSurface({id:'ordinary-city',kind:'planet',biome:'industrial',planetTypeId:'ecumenopolis',sizeClass:'super-earth'},'one');
  assert.notDeepEqual(a.tiles,generic.tiles);assert.notEqual(a.settlementId,generic.settlementId);
});

test('new stories use reachable people and evidence at their exact bodies and districts',()=>{
  const content=[...NEON_QUEST_CONTACTS,...NEON_QUEST_OBJECTS],maps=new Map();
  for(const seed of ['quest-doors','alternate-city']){
    for(const record of content){
      const key=seed+record.bodyId;let map=maps.get(key);if(!map){map=generateSurface(record.bodyId,seed);maps.set(key,map);}
      const {seen,index}=reachable(map),entity=map.entities.find(e=>e.id===`quest:${record.id}`);assert.ok(entity,record.id);assert.ok(seen.has(index(entity)),record.id);
      assert.equal(entity.data.systemId,record.systemId);assert.equal(entity.data.bodyId,record.bodyId);
      assert.ok(map.entities.every(other=>other===entity||Math.hypot(other.x-entity.x,other.y-entity.y)>=40),`${record.id} is not hidden by another interaction`);
      if(record.bodyId==='glimmer'){assert.ok(Math.hypot(entity.x-(record.tileX+.5)*24,entity.y-(record.tileY+.5)*24)<85,`${record.id} remains in its authored district`);}
    }
  }
  assert.equal(maps.get('quest-doorsvoltage-kilowatt').barren,false,'the power moon is an inhabited worksite');
  assert.ok(!generateSurface('morrow','quest-doors').entities.some(e=>e.id.startsWith('quest:voltage-')));
  for(const thread of NEON_QUEST_THREADS){
    assert.ok(NEON_QUEST_CONTACTS.some(c=>c.id===thread.offeredBy));assert.equal(thread.stages.length,5);
    for(const stage of thread.stages){assert.ok(content.some(record=>`quest:${record.id}`===stage.at.entityId&&record.bodyId===stage.at.bodyId));assert.ok(!/gambl|poker|blackjack/.test(stage.kind));}
    const ending=thread.stages.at(-1);assert.equal(ending.kind,'choice');assert.equal(ending.options.length,3);assert.ok(ending.options.every(option=>option.effects.flags.length));
  }
});

test('public station games occupy reachable empty floor and Kettle keeps its established arrival',()=>{
  for(const id of ['kettle','voltage-crown','ledger','weighhouse']){
    const map=generateSurface(id,'games-at-ports'),{seen,index}=reachable(map),games=map.entities.filter(e=>e.type==='gambling');
    assert.ok(games.length>=1);if(id==='kettle'||id==='voltage-crown')assert.equal(games.length,3);
    for(const e of games){assert.ok(seen.has(index(e)),e.id);assert.ok(map.entities.every(other=>other===e||Math.hypot(e.x-other.x,e.y-other.y)>=58));}
    if(id==='kettle'){assert.deepEqual(map.spawn,{x:156,y:348});assert.deepEqual(map.exit,{x:108,y:348});}
  }
  assert.equal(generateSurface({id:'test-base',kind:'station',portType:'military'},'games-at-ports').entities.some(e=>e.type==='gambling'),false);
});

class Context {
  constructor(width=800,height=600){this.canvas={width,height};this.calls=0;this.globalAlpha=1;}
  fillRect(){this.calls++;}clearRect(){}save(){}restore(){}translate(){}scale(){}rotate(){}strokeRect(){}fillText(){}drawImage(){}setLineDash(){}measureText(value){return{width:String(value).length*7};}
}
test('city rendering is read-only, map games are discoverable, and rain respects reduced motion',()=>{
  const map=generateSurface('glimmer','city-art'),before=JSON.stringify(map),ctx=new Context(),labels=[];
  const person={x:590,y:1290,health:100,weaponDrawn:false};
  drawSurface(ctx,map,{width:800,height:600,person,labels,time:3});assert.equal(JSON.stringify(map),before);assert.ok(labels.some(label=>label.text.includes('LOW ORBIT')));assert.ok(labels.some(label=>label.text==='POKER'));
  const chart=drawSurfaceMap(new Context(720,540),map,{width:720,height:540,person});assert.equal(chart.markers.filter(marker=>marker.kind==='games').length,3);
  const dry=new Context(),wet=new Context();const view={cameraX:1350,cameraY:1500,width:800,height:600,time:10};
  drawNeonRain(dry,map,{...view,reduceMotion:true});assert.equal(dry.calls,0);
  drawNeonRain(wet,map,view);assert.ok(wet.calls>0&&wet.calls<=650,'weather work stays bounded by a fixed viewport budget');assert.equal(wet.globalAlpha,1);
});
