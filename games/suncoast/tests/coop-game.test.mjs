import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/coop-game.mjs';
import * as Sim from '../public/sim.mjs';
import {LOCATIONS,isLand} from '../public/world.mjs';
import {MISSIONS} from '../public/content.mjs';

const make=(count=2)=>{const w=C.createCoopGame({hostId:'host',name:'Host'});for(let i=1;i<count;i++)assert.equal(C.addCoopPlayer(w,{id:`p${i}`,name:`Crew ${i}`}).ok,true);return w;};
const step=(w,seconds,inputs={})=>{for(let t=0;t<seconds-1e-8;t+=1/30)C.stepCoopGame(w,inputs,1/30);};
const actor=(w,id='host')=>w.players[id];
function beside(w,id,car){Object.assign(actor(w,id).player,{x:car.x+32,y:car.y,interior:null,vehicleId:null,seat:null});}
const use=(w,id)=>C.coopAction(w,id,{type:'interact'});
function choose(w,index=0,id='host'){
 const d=C.projectCoopGame(w,id).dialogue;assert.ok(d,'Expected a conversation');
 return C.coopAction(w,id,{type:'choose',index,dialogueId:d.id});
}

test('One shared city clock and ambient movement regardless of crew size; members move independently',()=>{
 const one=make(1),four=make(4);
 one.game.mission=null;four.game.mission=null;
 for(const w of [one,four])step(w,1);
 assert.equal(one.game.time,four.game.time);
 assert.deepEqual(one.game.npcs,four.game.npcs);
 assert.deepEqual(one.game.vehicles,four.game.vehicles);
 const h={...actor(four).player},guest={...actor(four,'p1').player};
 step(four,.5,{host:{mx:1},p1:{my:1}});
 assert.ok(actor(four).player.x>h.x);assert.equal(actor(four).player.y,h.y);
 assert.ok(actor(four,'p1').player.y>guest.y);assert.equal(actor(four,'p1').player.x,guest.x);
 assert.equal(C.addCoopPlayer(four,{id:'fifth',name:'Fifth'}).ok,false);
});

test('Atomic driver/passenger seats, driver-only movement, safe exit and disconnect handover',()=>{
 const w=make(3);w.game.mission=null;
 const car=w.game.vehicles.find(v=>v.id==='lucia-car');w.game.vehicles=[car];w.game.npcs=[];
 for(const id of ['host','p1','p2']){beside(w,id,car);assert.equal(use(w,id).ok,true);}
 assert.equal(car.driverId,'host');assert.deepEqual(car.passengerIds,['p1','p2']);
 assert.equal(actor(w,'p1').player.seat,'passenger');
 step(w,.4,{host:{throttle:1},p1:{throttle:-1,steer:1}});
 assert.ok(car.speed>0);assert.equal(actor(w,'p1').player.x,car.x);assert.equal(actor(w,'p1').player.y,car.y);
 assert.equal(use(w,'p1').ok,false,'Cannot jump out of a fast-moving car');
 car.speed=0;assert.equal(use(w,'host').ok,true);
 assert.equal(car.driverId,'p1');assert.equal(actor(w,'p1').player.seat,'driver');assert.equal(car.speed,0);
 C.setCoopConnected(w,'p1',false);
 assert.equal(car.driverId,'p2');assert.equal(actor(w,'p1').player.vehicleId,null);assert.equal(car.speed,0);
 C.setCoopConnected(w,'p1',true);assert.equal(actor(w,'p1').player.vehicleId,null);
 assert.equal(C.projectCoopGame(w,'p2').player.seat,'driver');
});

test('Full single-seat vehicles reject a second driver and destroyed boats release everyone',()=>{
 const w=make();w.game.mission=null;
 const bike=w.game.vehicles.find(v=>v.type==='motorcycle');w.game.vehicles=[bike];
 beside(w,'host',bike);assert.equal(use(w,'host').ok,true);beside(w,'p1',bike);
 assert.equal(use(w,'p1').ok,false);assert.equal(bike.driverId,'host');
 const sea=make(),boat=sea.game.vehicles.find(v=>v.id==='boat-0');sea.game.mission=null;sea.game.vehicles=[boat];
 for(const id of ['host','p1']){beside(sea,id,boat);assert.equal(use(sea,id).ok,true);}
 boat.hp=0;C.stepCoopGame(sea,{},1/30);
 for(const id of ['host','p1']){assert.equal(actor(sea,id).player.vehicleId,null);assert.equal(actor(sea,id).player.seat,null);assert.ok(Number.isFinite(actor(sea,id).player.x));}
});

test('A guest can advance a physical story goal; only host sees/chooses shared dialogue; guests keep moving',()=>{
 const w=make(),guest=actor(w,'p1');
 Object.assign(guest.player,{interior:'cafe',x:320,y:384});C.stepCoopGame(w,{},1/30);
 assert.ok(C.projectCoopGame(w,'host').dialogue);assert.equal(C.projectCoopGame(w,'p1').dialogue,null);
 const before=guest.player.x;step(w,.5,{p1:{mx:1}});assert.ok(guest.player.x>before);
 const d=C.projectCoopGame(w,'host').dialogue;
 assert.equal(C.coopAction(w,'p1',{type:'choose',index:0,dialogueId:d.id}).ok,false);
 assert.equal(choose(w).ok,true);assert.equal(w.game.mission.step,1);
 assert.equal(C.coopAction(w,'host',{type:'choose',index:0,dialogueId:d.id}).ok,false,'Stale repeated choice cannot advance a new step');
 Object.assign(guest.player,{x:320,y:150});assert.equal(use(w,'p1').ok,true);
 assert.ok(C.projectCoopGame(w,'host').dialogue);
});

test('Personal services stay open while another crew member moves, without stopping the city',()=>{
 const w=make();const h=actor(w),g=actor(w,'p1');
 Object.assign(h.player,{interior:'garage',x:320,y:150});assert.equal(use(w,'host').ok,true);
 const dialogId=C.projectCoopGame(w,'host').dialogue.id,before=g.player.x;
 step(w,.5,{p1:{mx:1}});
 assert.equal(C.projectCoopGame(w,'host').dialogue.id,dialogId);
 assert.ok(g.player.x>before);assert.ok(w.game.time>.4);
 const choices=C.projectCoopGame(w,'host').dialogue.choices;
 assert.equal(choose(w,choices.length-1).ok,true);assert.equal(C.projectCoopGame(w,'host').dialogue,null);
});

test('Shared mission rewards and sidearms apply once to every crew member',()=>{
 const w=make(),guest=actor(w,'p1');
 w.game.mission={id:'first_favor',step:8,elapsed:0,dialogueDone:true};
 Object.assign(guest.player,{interior:null,...LOCATIONS.home.door});
 const cash=Object.fromEntries(Object.entries(w.players).map(([id,m])=>[id,m.player.cash]));
 C.stepCoopGame(w,{},1/30);
 assert.equal(w.game.mission,null);assert.deepEqual(w.game.progress.completed,['first_favor']);
 for(const [id,m] of Object.entries(w.players)){assert.equal(m.player.cash,cash[id]+180);assert.equal(m.player.hasPistol,true);}
 step(w,.5);for(const [id,m] of Object.entries(w.players))assert.equal(m.player.cash,cash[id]+180);
 assert.equal(C.coopAction(w,'p1',{type:'startMission',missionId:'paper_trail'}).ok,false);
});

test('Arrest and recovery are personal: guest heat/projectiles/story survive, pistol confiscation does not disarm crew',()=>{
 const w=make(),h=actor(w),guest=actor(w,'p1');
 h.player.hasPistol=true;guest.player.hasPistol=true;h.wanted.stars=2;h.wanted.heat=30;
 guest.wanted.stars=3;guest.wanted.heat=58;guest.wanted.lastSeen=w.game.time;
 w.game.police=[{id:'host-cop',targetId:'host',hp:100,x:900,y:1200},{id:'guest-cop',targetId:'p1',hp:100,x:900,y:1200}];
 const mission=JSON.stringify(w.game.mission);
 assert.equal(C.coopAction(w,'host',{type:'surrender'}).ok,true);assert.equal(h.phase,'busted');
 assert.equal(h.player.hasPistol,false);assert.equal(guest.player.hasPistol,true);assert.equal(guest.wanted.stars,3);
 w.game.bullets=[{id:'still-active',owner:'police',x:900,y:1200,vx:0,vy:0,life:1,damage:10,interior:null}];
 assert.equal(C.coopAction(w,'host',{type:'recover',choice:'continue'}).ok,true);
 assert.equal(h.phase,'playing');assert.equal(h.wanted.stars,0);assert.equal(guest.wanted.stars,3);
 assert.equal(w.game.bullets.length,1);assert.deepEqual(w.game.police.map(c=>c.id),['guest-cop']);assert.equal(JSON.stringify(w.game.mission),mission);
 assert.equal(C.coopAction(w,'p1',{type:'toggleWeapon'}).ok,true);
});

test('No PvP from bullets, punches, or crew car collisions; interior identity separates damage',()=>{
 const w=make();w.game.mission=null;w.game.npcs=[];w.game.vehicles=[];
 const h=actor(w),g=actor(w,'p1');Object.assign(h.player,{x:1000,y:1350,interior:null,invulnerable:0,weapon:'pistol',hasPistol:true});Object.assign(g.player,{x:1020,y:1350,interior:null,invulnerable:0});
 w.game.bullets=[{id:'friendly',owner:'player',shooterId:'host',x:g.player.x,y:g.player.y,vx:0,vy:0,life:1,damage:90,interior:null}];
 C.stepCoopGame(w,{},1/30);assert.equal(g.player.hp,100);
 h.player.interior='cafe';g.player.interior='garage';Object.assign(h.player,{x:320,y:240});Object.assign(g.player,{x:320,y:240});
 w.game.bullets=[{id:'room-shot',owner:'police',x:320,y:240,vx:0,vy:0,life:1,damage:20,interior:'cafe'}];
 C.stepCoopGame(w,{},1/30);assert.equal(h.player.hp,80);assert.equal(g.player.hp,100);
 const street=make();street.game.mission=null;street.game.npcs=[];
 const carA=street.game.vehicles.find(v=>v.id==='lucia-car'),carB=street.game.vehicles.find(v=>v.id==='tomi-truck');street.game.vehicles=[carA,carB];
 Object.assign(carA,{x:1010,y:1350,angle:0,speed:0});Object.assign(carB,{x:1040,y:1350,angle:0,speed:0});
 beside(street,'host',carA);actor(street).player.x=carA.x-20;assert.equal(use(street,'host').ok,true);
 beside(street,'p1',carB);actor(street,'p1').player.x=carB.x+20;assert.equal(use(street,'p1').ok,true);
 carA.speed=180;const hp=[carA.hp,carB.hp];C.stepCoopGame(street,{host:{throttle:1}},1/30);assert.deepEqual([carA.hp,carB.hp],hp);
});

test('Disconnected members stop receiving combat damage and leader transfer preserves pending choices',()=>{
 const w=make(),h=actor(w);h.player.invulnerable=0;
 Object.assign(actor(w,'p1').player,{interior:'cafe',x:320,y:384});C.stepCoopGame(w,{},1/30);
 const pending=w.storyDialogue.id;
 C.setCoopConnected(w,'host',false);C.setCoopHost(w,'p1');
 assert.equal(C.projectCoopGame(w,'p1').dialogue.id,pending);
 w.game.bullets=[{id:'offline-shot',owner:'police',x:h.player.x,y:h.player.y,vx:0,vy:0,life:1,damage:100,interior:null}];
 step(w,.2);assert.equal(h.player.hp,100);
 assert.equal(choose(w,0,'p1').ok,true);assert.equal(w.game.mission.step,1);
});

test('Crew checkpoints restore trusted shared story with a fresh host identity; reject solo and hostile payloads',()=>{
 const w=make();Object.assign(actor(w,'p1').player,{interior:'cafe',x:320,y:384});C.stepCoopGame(w,{},1/30);
 actor(w).player.cash=987;
 const saved=C.serializeCoopGame(w),before=JSON.stringify(w.game);
 assert.equal(saved.kind,'suncoast-crew-checkpoint');assert.equal(saved.game._coopCounter,undefined);
 const restored=C.createCoopGame({hostId:'new_host',name:'Returning',save:saved});
 assert.equal(restored.hostId,'new_host');assert.equal(actor(restored,'new_host').player.id,'new_host');assert.equal(actor(restored,'new_host').player.cash,987);
 assert.equal(Object.keys(restored.players).length,1);assert.ok(C.projectCoopGame(restored,'new_host').dialogue);
 assert.equal(JSON.stringify(w.game),before,'Saving never mutates the live room');
 assert.throws(()=>C.createCoopGame({hostId:'x',save:Sim.serializeGame(Sim.createGame())}),/separate/);
 const broken=structuredClone(saved);broken.game.vehicles[0].x='bad';assert.throws(()=>C.createCoopGame({hostId:'x',save:broken}),/invalid/);
 for(const mutate of [
  g=>{g.vehicles[0].type='invented-car';},g=>{g.vehicles[1].id=g.vehicles[0].id;},g=>{g.npcs[0].id='';},
  g=>{g.player.x=NaN;},g=>{g.player.interior='missing-building';},g=>{g.npcs[0].homeX='bad';},
  g=>{g.progress.completed='first_favor';},g=>{g.progress.choices={'first_favor:7':'unknown-choice'};},g=>{g.mission.step=500;}
 ]){const invalid=structuredClone(saved);mutate(invalid.game);assert.throws(()=>C.createCoopGame({hostId:'x',save:invalid}),/invalid/i);}
 const hostile=JSON.parse('{"kind":"suncoast-crew-checkpoint","version":1,"game":{"__proto__":{"x":1}}}');assert.throws(()=>C.createCoopGame({hostId:'x',save:hostile}),/Invalid/);
 assert.ok(isLand(actor(restored,'new_host').player.x,actor(restored,'new_host').player.y));
});

test('Prediction changes movement only and never advances traffic, combat, health, or story',()=>{
 const w=make(),g=C.projectCoopGame(w,'host');g.mission=null;g.dialogue=null;
 const before={vehicles:structuredClone(g.vehicles),npcs:structuredClone(g.npcs),hp:g.player.hp,cash:g.player.cash,progress:structuredClone(g.progress),time:g.time,ammo:g.player.ammo};
 const start=g.player.x;Sim.predictPlayer(g,{mx:1,fire:true},1/60);assert.ok(g.player.x>start);
 for(const key of ['vehicles','npcs','progress','time'])assert.deepEqual(g[key],before[key]);
 assert.equal(g.player.hp,before.hp);assert.equal(g.player.cash,before.cash);assert.equal(g.player.ammo,before.ammo);
 const car=w.game.vehicles.find(v=>v.id==='lucia-car');beside(w,'host',car);use(w,'host');beside(w,'p1',car);use(w,'p1');
 const passenger=C.projectCoopGame(w,'p1'),saved=structuredClone(passenger);Sim.predictPlayer(passenger,{throttle:1,steer:1},1/30);assert.deepEqual(passenger,saved);
});

test('Pings carry an explicit space, expire, and projections omit distant ambient traffic/private state',()=>{
 const w=make(),h=actor(w);h.player.interior='cafe';h.player.x=320;h.player.y=300;
 assert.equal(C.coopAction(w,'host',{type:'ping',x:1000,y:1400,interior:null}).ok,true);
 assert.equal(w.pings[0].interior,null);step(w,1);
 assert.equal(C.coopAction(w,'host',{type:'ping',x:300,y:200,interior:'garage'}).ok,false);
 assert.equal(C.coopAction(w,'host',{type:'ping',x:300,y:200,interior:'cafe'}).ok,true);
 const p=C.projectCoopGame(w,'host');assert.equal(p.pings[0].interior,'cafe');assert.equal(p._coopCounter,undefined);assert.equal(p.players,undefined);assert.equal(p._rng,undefined);
 assert.ok(p.vehicles.every(v=>!v.traffic));assert.ok(p.npcs.every(n=>n.interior==='cafe'));
 step(w,19);assert.equal(w.pings.length,0);
 assert.equal(C.coopAction(w,'host',{type:'teleport',x:0,y:0}).ok,false);
});
