import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NAMED_SYSTEMS} from '../dist/content.mjs';
import {FRONTIER_SYSTEMS} from '../dist/galaxy-expansion.mjs';
import {PLANET_PLACES} from '../dist/planet-content.mjs';
import {QUEST_CONTACTS,QUEST_OBJECTS} from '../dist/quest-content.mjs';
import {explorationSites,explorationLocation,createSiteState,claimSiteReward,inspectSiteRecord} from '../dist/exploration.mjs';
import {generateSurface,isWalkable,nearestEntity,drawCharacter,drawContactPortrait,drawSurface,drawSurfaceMap} from '../dist/surface.mjs';

const bodies=[...NAMED_SYSTEMS,...FRONTIER_SYSTEMS].flatMap(system=>system.bodies.map(body=>({...body,systemId:system.id,systemName:system.name,faction:system.faction})));
const findBody=id=>bodies.find(body=>body.id===id);
const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function flood(map){
 const start=Math.floor(map.spawn.y/24)*map.cols+Math.floor(map.spawn.x/24),queue=[start],seen=new Set(queue);
 for(let i=0;i<queue.length;i++){
  const n=queue[i],x=n%map.cols,y=Math.floor(n/map.cols);
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy,k=yy*map.cols+xx;if(xx<0||yy<0||xx>=map.cols||yy>=map.rows||seen.has(k)||!isWalkable(map,(xx+.5)*24,(yy+.5)*24,6))continue;
   seen.add(k);queue.push(k);
  }
 }
 return seen;
}
const cell=(map,item)=>Math.floor(item.y/24)*map.cols+Math.floor(item.x/24);
function canvas(width=320,height=240,record=false){
 const pixels=[],ctx={canvas:{width,height},count:0,save(){},restore(){},translate(){},scale(){},setLineDash(){},strokeRect(){},fillText(){},measureText(value){return{width:String(value).length*5};},fillRect(x,y,w,h){assert.ok([x,y,w,h].every(Number.isFinite));assert.ok([x,y,w,h].every(Number.isInteger),'pixel primitives must stay on the source grid');this.count++;if(record)pixels.push([this.fillStyle,x,y,w,h]);}};
 return{ctx,pixels};
}

test('authored district expansion is deterministic and keeps every new entrance reachable',()=>{
 assert.equal(Object.values(PLANET_PLACES).flat().length,31);
 for(const bodyId of Object.keys(PLANET_PLACES))for(const seed of['planet-life','alternate-paths']){
  const body=findBody(bodyId),map=generateSurface(body,seed),reachable=flood(map);
  assert.ok(body,bodyId);assert.deepEqual(map,generateSurface(body,seed));
  assert.equal(new Set(map.entities.map(entity=>entity.id)).size,map.entities.length);
  for(const entity of map.entities)assert.ok(reachable.has(cell(map,entity)),`${seed}/${bodyId}/${entity.id}`);
  for(const site of PLANET_PLACES[bodyId])assert.ok(map.entities.some(entity=>entity.id===`${bodyId}:site:${site.id}`&&entity.data.siteId===site.id));
 }
});

test('developed interiors have walkable records, choices, rewards, creatures and an immediate retreat',()=>{
 const layouts=new Map();
 for(const[bodyId,places]of Object.entries(PLANET_PLACES))for(const authored of places){
  const body=findBody(bodyId),location=explorationLocation(body,authored.id,'planet-life'),map=generateSurface(location,'planet-life'),state=createSiteState(location.site),reachable=flood(map);
  assert.ok(Math.hypot(map.exit.x-map.spawn.x,map.exit.y-map.spawn.y)<=48);
  for(const entity of [...map.entities,...state.monsters])assert.ok(reachable.has(cell(map,entity)),`${bodyId}/${authored.id}/${entity.id}`);
  assert.ok(!map.entities.some(entity=>entity.data.professionDesk||entity.data.contactId?.startsWith('passage-desk:')));
  assert.deepEqual(map,generateSurface(location,'planet-life'));
  if(['market','clinic','laboratory','conservatory','theatre','sanctum'].includes(authored.kind))layouts.set(authored.kind,checksum({tiles:map.tiles,decor:map.decor.map(({kind,x,y})=>({kind,x,y}))}));
  for(const record of location.site.records)assert.equal(inspectSiteRecord(location.site,record.id).ok,true);
  if(authored.empty){assert.equal(state.monsters.length,0);assert.equal(location.site.caches.length,0);assert.equal(location.site.choices.length,0);}
 }
 assert.equal(layouts.size,6);assert.equal(new Set(layouts.values()).size,6,'each room type has its own layout and furniture');
});

test('story contacts and evidence exist only at their exact body and site, without overlapping other interactions',()=>{
 for(const record of [...QUEST_CONTACTS,...QUEST_OBJECTS]){
  const body=findBody(record.bodyId),location=record.siteId?explorationLocation(body,record.siteId,'quest-doors'):body,map=generateSurface(location,'quest-doors'),reachable=flood(map),entity=map.entities.find(entity=>entity.id==='quest:'+record.id);
  assert.ok(entity,record.id);assert.ok(reachable.has(cell(map,entity)),record.id);assert.equal(nearestEntity(map,entity,0),entity);
  assert.equal(entity.data.bodyId,record.bodyId);assert.equal(entity.data.systemId,record.systemId);
  assert.ok(map.entities.every(other=>other===entity||Math.hypot(other.x-entity.x,other.y-entity.y)>=40),record.id);
  assert.equal(entity.type,QUEST_CONTACTS.includes(record)?'npc':'questObject');
  assert.equal(entity.data[QUEST_CONTACTS.includes(record)?'contactId':'objectId'],record.id);
  if(record.siteId)assert.ok(!generateSurface(body,'quest-doors').entities.some(entity=>entity.id==='quest:'+record.id));
 }
 const foreign=generateSurface('kiln','quest-doors');assert.ok(!foreign.entities.some(entity=>entity.id==='quest:vey'||entity.id==='quest:mara-reed'));
 // Site entry callers may provide only a parent body ID when restoring a save.
 const saved=generateSurface(explorationLocation({id:'morrow',kind:'planet'},'northwatch','quest-doors'),'quest-doors');assert.ok(saved.entities.some(entity=>entity.id==='quest:dome-recorder'));
});

test('inhabited ports provide one passage, faction and public-service desk; barren places and ship interiors do not',()=>{
 for(const body of bodies){
  const map=generateSurface(body,'civic-services'),reachable=flood(map);
  if(map.barren){assert.ok(!map.entities.some(entity=>entity.data.professionDesk));continue;}
  for(const id of[`quest:passage-desk:${body.id}`,`quest:liaison:${body.id}`,`quest:profession-desk:${body.id}`]){
   const matches=map.entities.filter(entity=>entity.id===id);assert.equal(matches.length,1,id);const entity=matches[0];assert.ok(reachable.has(cell(map,entity)),id);assert.equal(entity.data.homeLocationId,body.id);
  }
  const desk=map.entities.find(entity=>entity.data.professionDesk);assert.equal(desk.type,'npc');assert.equal(desk.data.bodyId,body.id);assert.equal(desk.name,'Public services');assert.ok(!desk.data.contactId);
 }
 for(const location of[{id:'empty-rock',kind:'moon',biome:'barren'},{id:'own-ship',kind:'ship'},{id:'quiet-wreck',kind:'derelict'}])assert.ok(!generateSurface(location,'civic-services').entities.some(entity=>entity.data.professionDesk||entity.data.contactId));
});

test('old landing geometry, six original room floors and saved claim IDs remain compatible',()=>{
 const map=generateSurface('morrow','legacy-content');
 assert.equal(checksum(map.tiles.slice(0,35).map(row=>row.slice(0,47))),'bde1c3cf93f4dfc8fd972ebc4815c89fbe0ffda034eeff38a400ea1be2a954b5');
 for(const[id,x,y]of[['exit',252,684],['jobs',420,420],['mechanic',252,228],['medic',540,228],['story',540,492]]){const entity=map.entities.find(entity=>entity.id==='morrow:'+id);assert.deepEqual([entity.x,entity.y],[x,y]);}
 const floors={chalkfold:'32431dcd18ee64ae17775b31661a7de3f8c21208dc2b821ca673a5a94212fd12','orchard-pump':'2b4e21e220019bb14547938e078b8ef8d4784a0cd86e5fba8df580f9d83270c1',northwatch:'2b4e21e220019bb14547938e078b8ef8d4784a0cd86e5fba8df580f9d83270c1',tideglass:'9753d74d2227948d402977352e77109ad25151aa7bae72acc0de03fc1fd5ff6d','reed-house':'9753d74d2227948d402977352e77109ad25151aa7bae72acc0de03fc1fd5ff6d','relay-nine':'2b4e21e220019bb14547938e078b8ef8d4784a0cd86e5fba8df580f9d83270c1'};
 const solids={chalkfold:'8af43d316c23044cdab5c3697fdd7a54723d69080cffb8324433086806f52022','orchard-pump':'a78f0e0b7ff09a09c4af6a79c98b5b3cdfd711d3f066050aa0c15dea8d166b57',northwatch:'3ea3e9f0a1cdb80cacea0ed0cbd28bacf51d28dc17f268d4e44c2d264c64927e',tideglass:'a766db94c35a45f05532e3f631fc851d456e5c5e68344f3a003f088ef6a70a18','reed-house':'a766db94c35a45f05532e3f631fc851d456e5c5e68344f3a003f088ef6a70a18','relay-nine':'3ea3e9f0a1cdb80cacea0ed0cbd28bacf51d28dc17f268d4e44c2d264c64927e'};
 for(const id of Object.keys(floors)){const location=explorationLocation(findBody('morrow'),id,'legacy-content'),siteMap=generateSurface(location,'legacy-content');assert.equal(checksum(siteMap.tiles),floors[id],id);assert.equal(checksum(siteMap.solids),solids[id],id);}
 const cave=explorationSites(findBody('morrow')).find(site=>site.id==='chalkfold'),saved=createSiteState(cave,{collected:['field-kit'],monsters:[{id:'morrow:site:chalkfold:wildlife:0',health:0},{id:'morrow:site:chalkfold:wildlife:1',health:0}]});assert.equal(claimSiteReward(saved,cave,'field-kit').ok,false);
 const pump=explorationSites(findBody('morrow')).find(site=>site.id==='orchard-pump'),state=createSiteState(pump,{choices:{'water-line':'restore'}});assert.equal(state.choices['water-line'],'restore');assert.equal(claimSiteReward(state,pump,'water-line','salvage').ok,false);
});

test('new local choices and caches are persistent and cannot award twice after restoring',()=>{
 for(const[bodyId,siteId,choiceId,optionId]of[['orchard','seed-library','reserve','plant'],['ward','winter-annex','power','leave']]){
  const site=explorationSites(findBody(bodyId)).find(site=>site.id===siteId),state=createSiteState(site),result=claimSiteReward(state,site,choiceId,optionId);assert.equal(result.ok,true);
  const restored=createSiteState(site,JSON.parse(JSON.stringify(state)));assert.equal(restored.choices[choiceId],optionId);assert.equal(claimSiteReward(restored,site,choiceId,optionId).ok,false);assert.equal(claimSiteReward(restored,site,'invented','cash').ok,false);
 }
 const site=explorationSites(findBody('morrow')).find(site=>site.id==='rain-market'),state=createSiteState(site);assert.equal(claimSiteReward(state,site,'returns').ok,true);assert.equal(claimSiteReward(createSiteState(site,state),site,'returns').ok,false);
});

test('alien portraits and world sprites have a distinct pixel silhouette; developed rooms render without changing state',()=>{
 const human=canvas(32,40,true),alien=canvas(32,40,true);drawContactPortrait(human.ctx,{id:'same',color:'#a9cfc9',species:'human'});drawContactPortrait(alien.ctx,{id:'same',color:'#a9cfc9',species:'choral'});assert.notDeepEqual(human.pixels,alien.pixels);
 const sprite=canvas(32,40,true);drawCharacter(sprite.ctx,16,37,{id:'same',species:'choral'});assert.ok(sprite.pixels.some(([,x,y,w])=>x===-10&&y===-29&&w===20));
 const chora=generateSurface('chora','render-life'),vey=chora.entities.find(entity=>entity.id==='quest:vey');assert.equal(vey.species,'choral');assert.equal(vey.data.species,'choral');assert.ok(chora.entities.some(entity=>entity.id.includes('tide-listener')&&entity.species==='choral'));
 assert.ok(!generateSurface('morrow','render-life').entities.some(entity=>entity.species==='choral'));
 for(const[bodyId,places]of Object.entries(PLANET_PLACES))for(const site of places){
  const location=explorationLocation(findBody(bodyId),site.id,'render-life'),surface=generateSurface(location,'render-life'),state=createSiteState(location.site),before=JSON.stringify({surface,state}),{ctx}=canvas(surface.width,surface.height);
  drawSurface(ctx,surface,{width:surface.width,height:surface.height,zoom:1,person:{...surface.spawn,facing:'right'},actors:state.monsters,exploration:state,time:2});
  assert.ok(ctx.count>100);assert.equal(JSON.stringify({surface,state}),before);
 }
 const {ctx}=canvas(360,280),map=drawSurfaceMap(ctx,chora,{targetEntityId:vey.id});assert.ok(map.markers.some(marker=>marker.id===vey.id&&marker.selected));assert.ok(map.markers.some(marker=>marker.id==='quest:profession-desk:chora'&&marker.kind==='service'));assert.ok(map.markers.some(marker=>marker.id==='chora:site:resonance-house'&&marker.siteKind==='sanctum'));
});
