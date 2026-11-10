import test from 'node:test';
import assert from 'node:assert/strict';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import {Game} from '../dist/engine.mjs';
import {enemyShipState} from '../dist/fleet.mjs';
import {cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
import {clearSidearmSight} from '../dist/combat.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function firingPoint(game) {
  const layout=cabinLayout(game.state.boarding.shipClass),target=layout.combatSpawns[0];
  const point={x:(layout.spawn.x+target.x)/2,y:(layout.spawn.y+target.y)/2};
  assert.ok(isCabinWalkable(layout,point.x,point.y));assert.ok(clearSidearmSight(layout,point,target));
  assert.ok(Math.hypot(point.x-layout.spawn.x,point.y-layout.spawn.y)>70,'Combat takes place away from the entry airlock.');
  return point;
}
function assault(seed='persistent-deck') {
  const game=new Game(seed),origin=game.state.ship,enemy=placeRaider(game);
  Object.assign(origin,{x:0,y:450,vx:0,vy:0,hull:71,shield:0});
  Object.assign(enemy,{x:90,y:450,hp:14,maxHp:46,disabled:true,active:false,angle:1.1,cooldown:999});
  game.system.enemies=[enemy];ok(game.boardEnemy(enemy.id));
  for(const hostile of game.state.boarding.enemies)hostile.cooldown=999;
  return {game,origin,enemy};
}
function secure(game) {
  const layout=cabinLayout(game.state.boarding.shipClass);
  Object.assign(game.state.person,firingPoint(game),{health:100});
  game.state.boarding.enemies.forEach((enemy,index)=>Object.assign(enemy,layout.combatSpawns[index%layout.combatSpawns.length],{cooldown:999}));
  for(let i=0;i<120&&game.state.boarding.phase==='active';i++)game.step(.1,{fire:true});
  assert.equal(game.state.boarding.phase,'won');
}
function pulse(game,{x,y,owner='outsider',ownerId=owner,vesselId='outsider-vessel',damage=10,vx=1000,vy=0}={}) {
  game.system.bullets.push({x,y,vx,vy,ttl:1,radius:4,owner,ownerId,vesselId,damage});
}

test('assault has a distinct target identity and guard wounds survive retreat, save, and reboarding',()=>{
  const {game,origin,enemy}=assault(),boarding=game.state.boarding;
  assert.equal(game.state.ship,origin);assert.notEqual(boarding.vesselId,origin.id);
  assert.equal(boarding.originVesselId,origin.id);assert.equal(boarding.targetVesselId,enemy.id);
  assert.equal(game.currentBody.vesselId,enemy.id);assert.match(game.currentBody.name,new RegExp(enemy.name));
  Object.assign(game.state.person,firingPoint(game));
  Object.assign(boarding.enemies[0],cabinLayout(boarding.shipClass).combatSpawns[0]);
  const targetId=boarding.enemies[0].id;ok(game.attackBoarder(targetId));
  const remainingHealth=boarding.enemies[0].health;
  assert.equal(remainingHealth,28);assert.equal(game.returnToOwnShip().code,'distance');
  Object.assign(game.state.person,cabinLayout(boarding.shipClass).spawn);ok(game.returnToOwnShip());
  assert.equal(origin.hull,71);assert.equal(origin.x,0);assert.equal(enemy.hp,14);
  const loaded=Game.fromSave(game.serialize()),restored=loaded.system.enemies.find(e=>e.id===enemy.id);
  assert.equal(restored.deck.enemies.find(e=>e.id===targetId).health,remainingHealth);
  assert.equal(restored.deck.occupation.boarderId,null);ok(loaded.boardEnemy(enemy.id));
  assert.equal(loaded.state.boarding.enemies.find(e=>e.id===targetId).health,remainingHealth);
});

test('securing a target retains its damaged hull and dead guards without paying another reward',()=>{
  const {game,origin,enemy}=assault('capture-retained'),before=game.state.credits;
  secure(game);assert.equal(enemy.hp,14);assert.equal(origin.hull,71);
  assert.equal(game.state.credits,before+95);assert.equal(enemy.deck.cleared,true);
  assert.equal(enemy.deck.occupation.controllerId,game.playerId);assert.ok(enemy.deck.enemies.every(e=>e.health===0));
  Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).spawn);ok(game.returnToOwnShip());
  const restored=Game.fromSave(game.serialize());ok(restored.boardEnemy(enemy.id));
  assert.equal(restored.state.boarding.phase,'won');assert.equal(restored.state.credits,before+95);
  assert.ok(restored.state.boarding.enemies.every(e=>e.health===0));
});

test('taking a captured helm keeps target damage and position, parks the actual source, and permits a later swap',()=>{
  const {game,origin,enemy}=assault('capture-helm');game.state.upgrades.hull_1=1;
  const originId=origin.id;secure(game);Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).stations.helm);ok(game.takeCapturedHelm());
  assert.equal(game.state.ship.id,enemy.id);assert.equal(game.state.ship.x,90);assert.equal(game.state.ship.y,450);
  assert.ok(Math.abs(game.state.ship.hull/game.state.ship.maxHull-14/46)<1e-10);
  assert.equal(game.state.upgrades.hull_1,undefined);assert.equal(enemy.promotedVesselId,enemy.id);
  const parked=game.system.parkedShips.find(s=>s.id===originId);
  assert.equal(parked.x,0);assert.equal(parked.hull,71);assert.equal(parked.storedUpgrades.hull_1,1);
  const restored=Game.fromSave(game.serialize());assert.equal(restored.system.parkedShips.length,1);
  assert.equal(restored.interact().type,'parked-ship');ok(restored.boardParkedShip(originId));
  assert.equal(restored.state.ship.id,originId);assert.equal(restored.state.ship.hull,71);assert.equal(restored.state.upgrades.hull_1,1);
  assert.equal(restored.system.parkedShips.length,1);assert.equal(restored.system.parkedShips[0].id,enemy.id);
});

test('the source and target remain independently vulnerable while a boarding party is inside',()=>{
  const {game,origin,enemy}=assault('outside-fire');
  pulse(game,{x:-55,y:450,owner:'other-pirate',damage:7});game.stepWorld(.05,[game]);
  assert.equal(origin.hull,64);assert.equal(enemy.hp,14);
  pulse(game,{x:45,y:450,owner:'player',damage:5});game.stepWorld(.05,[game]);
  assert.equal(enemy.hp,9);assert.equal(origin.hull,64);assert.equal(game.currentBody.hp,9);
  assert.equal(game.state.mode,'person');
});

test('target hull destruction evacuates and injures the party instead of leaving a phantom deck',()=>{
  const {game,origin,enemy}=assault('destroyed-target');
  game.state.crew.push({id:'crew-1',name:'Mara',role:'security',health:50,maxHealth:100,status:'injured'});
  pulse(game,{x:45,y:450,owner:'player',damage:99});game.stepWorld(.05,[game]);
  assert.equal(game.state.mode,'ship');assert.equal(game.state.interior,null);assert.equal(game.state.boarding,null);
  assert.equal(game.state.ship,origin);assert.equal(origin.hull,71);assert.equal(game.state.person.health,40);
  assert.equal(game.state.crew[0].health,0);assert.equal(game.state.memorial.length,1);
  assert.ok(!game.system.enemies.some(e=>e.id===enemy.id));
  assert.ok(game.drainEvents().some(e=>e.type==='boarding-complete'&&e.phase==='destroyed'));
});

test('destroying the origin does not teleport or revive it while its captain is aboard the target',()=>{
  const {game,origin,enemy}=assault('destroyed-origin');
  game._damageShip(200,{sourceId:'third-party'});
  assert.equal(origin.hull,0);assert.equal(origin.destroyed,true);assert.equal(origin.x,0);
  assert.equal(game.state.mode,'person');assert.equal(game.returnToOwnShip().code,'destroyed');
  const restored=Game.fromSave(game.serialize());assert.equal(restored.state.ship.hull,0);
  secure(restored);Object.assign(restored.state.person,cabinLayout(restored.state.boarding.shipClass).stations.helm);ok(restored.takeCapturedHelm());
  assert.equal(restored.state.ship.id,enemy.id);assert.equal(restored.system.parkedShips.length,0);
});

test('returning requires a conscious captain at the airlock and an intact nearby tether in active and secured combat',()=>{
  const {game,enemy}=assault('return-validation'),boarding=game.state.boarding;
  Object.assign(game.state.person,cabinLayout(boarding.shipClass).spawn);enemy.x=1000;
  assert.equal(game.returnToOwnShip().code,'distance');assert.equal(boarding.phase,'active','A failed retreat cannot stop its guards.');enemy.x=90;
  game.state.person.down=true;assert.equal(game.returnToOwnShip().code,'incapacitated');game.state.person.down=false;game.state.person.health=0;
  assert.equal(game.returnToOwnShip().code,'incapacitated');game.state.person.health=100;
  secure(game);assert.equal(game.returnToOwnShip().code,'distance','Securing a deck does not teleport you to its airlock.');
  Object.assign(game.state.person,cabinLayout(boarding.shipClass).spawn);enemy.x=1000;assert.equal(game.leaveInterior().code,'distance');
  assert.equal(game.state.mode,'person');enemy.x=90;ok(game.returnToOwnShip());assert.equal(game.state.mode,'ship');
});

test('taking a local captured helm requires reaching the actual bridge while conscious',()=>{
  const {game,origin,enemy}=assault('helm-validation');secure(game);
  assert.equal(game.takeCapturedHelm().code,'distance');assert.equal(game.state.ship,origin);
  Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).stations.helm);
  game.state.person.down=true;assert.equal(game.takeCapturedHelm().code,'incapacitated');game.state.person.down=false;game.state.person.health=0;
  assert.equal(game.takeCapturedHelm().code,'incapacitated');assert.equal(game.system.parkedShips.length,0);
  game.state.person.health=35;ok(game.takeCapturedHelm());assert.equal(game.state.ship.id,enemy.id);
});

test('shared ship damage requires explicit hostility and identifies the physical vessel separately from its owner',()=>{
  const source=new Game('pvp-source'),target=new Game('pvp-target');source.system.enemies=[];
  Object.assign(source.state.ship,{x:0,y:450,shield:0});Object.assign(target.state.ship,{x:200,y:450,shield:0});
  source._playerId='captain-a';source.netVesselId='vessel-a';target._playerId='captain-b';target.netVesselId='vessel-b';
  const shoot=()=>{pulse(source,{x:130,y:450,owner:'player',ownerId:'captain-a',vesselId:'vessel-a',damage:10});source._updateBullets(.08,[source,target]);source.system.bullets=[];};
  shoot();assert.equal(target.state.ship.hull,100);
  source.netHostileTo=new Set(['vessel-b']);shoot();assert.equal(target.state.ship.hull,100);
  target.netHostileTo=new Set(['vessel-a']);shoot();assert.equal(target.state.ship.hull,90);
  source.netCanDamage=other=>other.netVesselId==='vessel-b';target.netHostileTo.clear();shoot();assert.equal(target.state.ship.hull,80);
});

test('canonical promoted enemies collide once through the authoritative vessel actor',()=>{
  const source=new Game('canonical-target'),enemy=placeRaider(source),target=new Game('target-actor');
  Object.assign(enemy,{x:200,y:450,hp:14,maxHp:46,canonicalVesselId:enemy.id});source.system.enemies=[enemy];
  target.state.ship=enemyShipState(enemy);target.netVesselId=enemy.id;source.netVesselId=source.state.ship.id;
  source.netCanDamage=other=>other===target;
  const before=target.state.ship.hull;
  pulse(source,{x:130,y:450,owner:'player',ownerId:source.playerId,vesselId:source.netVesselId,damage:10});source._updateBullets(.08,[source,target]);
  assert.equal(target.state.ship.hull,before-10);assert.equal(enemy.hp,14);
});

test('same-tick pulses from different physical ships and NPCs keep distinct presentation identities',()=>{
  const one=new Game('pulse-identity'),two=new Game('pulse-identity');placeRaider(one);placeRaider(one);
  one.netVesselId='owned-hull';two.netVesselId='captured-hull';two.bindSharedWorld(one.system,one._record(),'shared-owner');one._playerId='shared-owner';
  const enemies=one.system.enemies;one.system.enemies=[];ok(one.fireWeapons('shared-owner'));ok(two.fireWeapons('shared-owner'));
  assert.equal(new Set(one.system.bullets.map(bullet=>bullet.id)).size,2);assert.deepEqual(new Set(one.system.bullets.map(bullet=>bullet.vesselId)),new Set(['owned-hull','captured-hull']));
  one.system.enemies=enemies;Object.assign(one.state.ship,{x:0,y:450});
  for(const [i,enemy]of enemies.entries())Object.assign(enemy,{x:i?100:-100,y:450,disabled:false,hp:46,maxHp:46,cooldown:0,active:true});
  one._updateEnemies(.01,[one]);const npcShots=one.system.bullets.filter(bullet=>bullet.owner!=='player');assert.equal(npcShots.length,2);
  assert.ok(npcShots.every(bullet=>typeof bullet.id==='string'&&bullet.id.includes(bullet.ownerId)));
  assert.equal(new Set(one.system.bullets.map(bullet=>bullet.id)).size,4);
});

test('shared destruction and boarding loss hooks prevent automatic ship healing or character respawn',()=>{
  const {game,origin}=assault('recovery-hook');let destroyed=0,lost=0;
  game.netOnShipDestroyed=event=>{destroyed++;assert.equal(event.vesselId,origin.id);return true;};
  game.netOnBoardingLost=()=>{lost++;return true;};
  game._damageShip(200);assert.equal(destroyed,1);assert.equal(origin.hull,0);assert.equal(origin.x,0);
  game.state.person.health=0;game.state.person.down=true;game._finishBoarding('lost');
  assert.equal(lost,1);assert.equal(origin.hull,0);assert.equal(game.state.person.health,0);assert.equal(game.state.mode,'person');
});

test('losing a defensive boarding leaves the occupied hull in space and recovers aboard a different cutter',()=>{
  const game=new Game('occupied-loss'),origin=game.state.ship,enemy=placeRaider(game),originId=origin.id;
  Object.assign(origin,{x:0,y:450,shield:0,hull:60});Object.assign(enemy,{x:90,y:450,disabled:false});game.system.enemies=[enemy];
  ok(game.startBoarding(enemy.id));game.state.person.health=0;game.state.person.down=true;game._finishBoarding('lost');
  assert.notEqual(game.state.ship.id,originId);
  const occupied=game.system.enemies.find(e=>e.id===originId);assert.ok(occupied);assert.equal(occupied.hp,60);assert.equal(occupied.x,0);
  assert.equal(occupied.occupation.contested,true);assert.ok(occupied.deck.enemies.some(e=>e.health>0));
  assert.equal(game.state.mode,'ship');assert.equal(game.state.person.health,55);
});
