import test from 'node:test';
import assert from 'node:assert/strict';
import {explorationSites,explorationLocation,createSiteState,inspectSiteRecord,claimSiteReward,stepSiteEncounter} from '../dist/exploration.mjs';
import {generateSurface,isWalkable,drawSurface} from '../dist/surface.mjs';
import {clearSidearmSight,SIDEARM} from '../dist/combat.mjs';
const body={id:'morrow',name:'Morrow',kind:'planet',biome:'verdant',systemId:'hearth'};
const point=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
function flood(map){const start=Math.floor(map.spawn.y/24)*map.cols+Math.floor(map.spawn.x/24),queue=[start],seen=new Set(queue);for(let i=0;i<queue.length;i++){const n=queue[i],x=n%map.cols,y=Math.floor(n/map.cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*map.cols+xx;if(xx<0||yy<0||xx>=map.cols||yy>=map.rows||seen.has(k)||!isWalkable(map,(xx+.5)*24,(yy+.5)*24,6))continue;seen.add(k);queue.push(k);}}return seen;}
function cave(){const location=explorationLocation(body,'chalkfold','expedition-test'),site=location.site,surface=generateSurface(location,'expedition-test');return{location,site,surface,state:createSiteState(site)};}
function actor(x=22,y=14,input={}){return{id:'captain-test',name:'Test captain',person:{...point(x,y),health:100,maxHealth:100,facing:'right'},input};}

test('the USE key never fires a sidearm in a peaceful or cleared interior',()=>{
 const{surface,state}=cave(),captain=actor(22,14,{fire:true});state.monsters.forEach(monster=>monster.health=0);
 captain.person.weaponDrawn=true;
 const before=state.shotSerial,events=stepSiteEncounter(state,[captain],.1,surface);
 assert.equal(captain.person.weaponDrawn,false);assert.equal(captain.person.aimTargetId,null);
 assert.equal(state.shotSerial,before);assert.ok(!events.some(event=>event.type==='person-shot'));
 state.monsters=[];captain.person.weaponDrawn=true;
 assert.deepEqual(stepSiteEncounter(state,[captain],.1,surface),[]);assert.equal(captain.person.weaponDrawn,false);
});

test('Morrow expands to five times the old surface area while preserving landing and service coordinates',()=>{
 const surface=generateSurface(body,'expedition-test'),reachable=flood(surface);
 assert.equal(surface.cols*surface.rows,48*36*5);assert.deepEqual(surface.spawn,point(10,26));assert.deepEqual(surface.exit,point(10,28));
 assert.equal(surface.entities.find(e=>e.id==='morrow:mechanic').x,point(10,9).x);
 assert.deepEqual(surface.sites.slice(0,6).map(site=>site.id),['chalkfold','orchard-pump','northwatch','tideglass','reed-house','relay-nine']);
 assert.equal(surface.sites.length,8);assert.equal(surface.entities.filter(e=>e.type==='siteEntrance').length,8);
 assert.ok(surface.sites.some(site=>site.entrance.x>90*24));assert.ok(surface.sites.some(site=>site.entrance.y>60*24));assert.ok(surface.districts.length>=4);
 for(const entry of surface.entities)assert.ok(reachable.has(Math.floor(entry.y/24)*surface.cols+Math.floor(entry.x/24)),entry.id);
});

test('every expedition has a reachable immediate retreat, all records and rewards, and valid creature spawns',()=>{
 for(const location of [body,{id:'quiet-moon',name:'Quiet Moon',kind:'moon',biome:'barren'},{id:'ice-world',kind:'planet',biome:'ice'}])for(const site of explorationSites(location,'range')){
  const place=explorationLocation(location,site.id,'range'),surface=generateSurface(place,'range'),reachable=flood(surface),state=createSiteState(site);
  assert.equal(surface.kind,'site');assert.equal(surface.siteId,site.id);assert.ok(surface.combatLayout.walkable.length===surface.cols*surface.rows);
  const exit=surface.entities.find(e=>e.type==='siteExit');assert.ok(exit);assert.ok(Math.hypot(exit.x-surface.spawn.x,exit.y-surface.spawn.y)<=48);
  for(const item of [...surface.entities,...state.monsters])assert.ok(reachable.has(Math.floor(item.y/24)*surface.cols+Math.floor(item.x/24)),`${place.id}/${item.id}`);
  assert.ok(surface.entities.every(e=>e.type!=='exit'),'a cave exit must not accidentally launch the ship');
 }
});

test('barren moons are sparse, with both danger and an empty shelter, and their sites remain deterministic',()=>{
 const body={id:'silent-rock',name:'Silent Rock',kind:'moon',biome:'barren'},surface=generateSurface(body,'quiet');
 assert.ok(surface.barren);assert.equal(surface.entities.filter(e=>['npc','medic','mechanic','jobboard'].includes(e.type)).length,0);
 assert.equal(surface.sites.length,2);assert.ok(surface.sites.some(site=>site.hostile));assert.ok(surface.sites.some(site=>site.empty&&!site.caches.length&&!site.choices.length));
 assert.deepEqual(explorationSites(body,'quiet'),explorationSites(body,'quiet'));assert.notDeepEqual(explorationSites(body,'quiet'),explorationSites(body,'different'));
 assert.equal(explorationLocation(body,'invented','quiet'),null);assert.deepEqual(explorationSites({id:'station',kind:'station'}),[]);
});

test('sidearms require explicit input, show misses, respect walls and cooldown, and retain dead wildlife after restore',()=>{
 const {site,surface,state}=cave(),captain=actor();
 let events=stepSiteEncounter(state,[captain],.01,surface);assert.ok(!events.some(e=>e.type==='person-shot'));assert.equal(state.monsters[0].health,96);
 captain.input={fire:true,aiming:true,aimX:-1,aimY:0};events=stepSiteEncounter(state,[captain],.01,surface);assert.equal(events.find(e=>e.type==='person-shot').hit,false);
 assert.ok(!stepSiteEncounter(state,[captain],.01,surface).some(e=>e.type==='person-shot'));
 captain.input={fire:true};
 for(let i=0;i<80&&state.monsters.some(m=>m.health>0);i++){
  const target=state.monsters.find(m=>m.health>0);Object.assign(captain.person,{x:target.x-48,y:target.y,health:100,down:false});
  stepSiteEncounter(state,[captain],.1,surface);
 }
 assert.ok(state.monsters.every(m=>m.health===0));assert.ok(state.cleared);
 const restored=createSiteState(site,JSON.parse(JSON.stringify(state)));assert.ok(restored.monsters.every(m=>m.health===0));assert.ok(restored.cleared);
 const blocked=createSiteState(site),shooter=actor(17,14,{fire:true,aiming:true,aimX:0,aimY:-1});Object.assign(blocked.monsters[0],point(17,7));blocked.monsters[1].health=0;
 assert.equal(clearSidearmSight(surface.combatLayout,shooter.person,blocked.monsters[0]),false);
 const shot=stepSiteEncounter(blocked,[shooter],.01,surface).find(e=>e.type==='person-shot');assert.equal(shot.hit,false);assert.equal(shot.blocked,true);assert.equal(blocked.monsters[0].health,96);
});

test('creature attacks have a readable windup, can be escaped, and damage each target only once per attack',()=>{
 const{surface,state}=cave(),captain=actor(24,14);state.monsters[1].health=0;const monster=state.monsters[0];
 stepSiteEncounter(state,[captain],.1,surface);assert.ok(monster.windup>0);assert.equal(captain.person.health,100);
 captain.person.x-=120;for(let i=0;i<6;i++)stepSiteEncounter(state,[captain],.1,surface);assert.equal(captain.person.health,100);
 monster.cooldown=0;Object.assign(captain.person,{x:monster.x-18,y:monster.y});
 const events=[];for(let i=0;i<7;i++)events.push(...stepSiteEncounter(state,[captain],.1,surface));assert.equal(events.filter(e=>e.type==='person-hit').length,1);assert.equal(captain.person.health,84);
});

test('known caches and decisions award exactly once, survive restore, and cannot be invented by a saved document',()=>{
 const{site,state}=cave();assert.equal(claimSiteReward(state,site,'field-kit').ok,false);
 state.monsters.forEach(m=>m.health=0);const earned=claimSiteReward(state,site,'field-kit');assert.equal(earned.ok,true);assert.equal(earned.credits,95);assert.equal(earned.crystal,1);
 assert.equal(claimSiteReward(state,site,'field-kit').ok,false);assert.equal(claimSiteReward(createSiteState(site,state),site,'field-kit').ok,false);assert.equal(claimSiteReward(state,site,'fake').ok,false);
 const pump=explorationSites(body).find(s=>s.id==='orchard-pump'),pumpState=createSiteState(pump);assert.equal(claimSiteReward(pumpState,pump,'water-line','fake').ok,false);
 assert.equal(claimSiteReward(pumpState,pump,'water-line','restore').credits,125);assert.equal(claimSiteReward(pumpState,pump,'water-line','salvage').ok,false);
 assert.equal(createSiteState(pump,pumpState).choices['water-line'],'restore');assert.equal(inspectSiteRecord(site,'last-shift').ok,true);assert.equal(inspectSiteRecord(site,'fake').ok,false);
 const corrupt=createSiteState(site,{time:Infinity,monsters:[{id:site.key+':wildlife:0',x:Infinity,y:-99,health:-9},{id:'invented',health:1000}],collected:['fake'],choices:{fake:'cash'}});
 assert.equal(corrupt.monsters.length,2);assert.equal(corrupt.monsters[0].health,0);assert.ok(Number.isFinite(corrupt.monsters[0].x));assert.deepEqual(corrupt.collected,[]);assert.deepEqual(corrupt.choices,{});
});

test('site combat respects trait multipliers and rendering leaves state and caller flags immutable',()=>{
 const{surface,state}=cave(),captain=actor(23,14,{fire:true});captain.damageMultiplier=1.25;captain.sidearmCooldownMultiplier=.8;
 const events=stepSiteEncounter(state,[captain],.01,surface);assert.equal(events.find(e=>e.type==='person-hit').damage,SIDEARM.damage*1.25);assert.ok(Math.abs(state.actorCooldowns[captain.id]-SIDEARM.cooldown*.8)<1e-9);
 const ctx={canvas:{width:480,height:360},save(){},restore(){},fillRect(){},fillText(){},translate(){},scale(){},setLineDash(){},strokeRect(){},measureText(s){return{width:String(s).length*5};}},flags=new Set(),before=JSON.stringify({surface,state,person:captain.person});
 state.collected.push('field-kit');const now=JSON.stringify({surface,state,person:captain.person});
 drawSurface(ctx,surface,{width:480,height:360,zoom:1,person:captain.person,exploration:state,combat:{active:true},combatTime:state.time,flags,labels:[]});assert.equal(flags.size,0);assert.equal(JSON.stringify({surface,state,person:captain.person}),now);assert.notEqual(now,before);
});
