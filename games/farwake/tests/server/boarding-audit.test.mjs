import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout,enemyHullProfile} from '../../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
async function fixture(count=2) {
  const realm=new Realm({id:'AUDIT123',seed:'capture-authority-audit',persistence:{kind:'memory',save:async(_id,version)=>({version:version+1})}}),captains=[];
  for(let i=0;i<count;i++){
    const {captain}=await realm.createCaptain(`Captain ${i+1}`);realm.attach(captain,{close(){}});
    Object.assign(realm.vessels.get(captain.ownedVesselId).ship,{x:i*130,y:0,angle:0,vx:0,vy:0,shield:0});captains.push(captain);
  }
  const room=realm._room('hearth');for(const key of ['enemies','bullets','asteroids','pickups','signals'])room.runtime[key]=[];
  return {realm,captains,room};
}
const bridge=(realm,captain,vessel)=>Object.assign(captain.game.state.person,cabinLayout(vessel.ship.classId).stations.helm);
const tick=(realm,count=1)=>{for(let i=0;i<count;i++)realm.step(1/30,realm.tick+1,Date.now());};
function capturedNpc(f,captain=f.captains[0]) {
  const {realm,room}=f,source=realm.vessels.get(captain.aboard);
  const enemy={id:'audit-pirate',name:'Copper Finch',...enemyHullProfile(),x:source.ship.x+130,y:source.ship.y,angle:0,hp:35,maxHp:100,shield:0,disabled:true,active:false,cooldown:99,speed:0,damage:5,reward:0,faction:'cinder'};
  room.runtime.enemies.push(enemy);ok(realm._command(captain,'boardEnemy',{id:enemy.id}));
  const target=realm.vessels.get(captain.aboard),actor=realm._actor(target);
  for(const guard of target.boarding.enemies)guard.health=0;
  actor._finishBoarding('won');realm._syncActor(target);bridge(realm,captain,target);ok(realm._command(captain,'takeCapturedHelm',{}));
  return {source,target,enemy,captain};
}
function capturedPlayer(f) {
  const {realm}=f,[captor,defender]=f.captains,source=realm.vessels.get(captor.aboard),target=realm.vessels.get(defender.aboard);
  target.ship.hull=35;target.ship.shield=0;ok(realm._command(captor,'declareHostility',{vesselId:target.id}));ok(realm._command(captor,'boardHostileShip',{vesselId:target.id}));
  const spawn=cabinLayout(target.ship.classId).spawn;Object.assign(captor.game.state.person,spawn);Object.assign(defender.game.state.person,{x:spawn.x+18,y:spawn.y,health:24});
  ok(realm._command(captor,'attackBoarder',{enemyId:defender.id}));bridge(realm,captor,target);ok(realm._command(captor,'takeCapturedHelm',{}));
  return {source,target,captor,defender};
}

test('a captured NPC prize still requires defeating its living player defenders before a second capture',async()=>{
  const f=await fixture(),{target,captain:owner}=capturedNpc(f),attacker=f.captains[1];
  ok(f.realm._command(attacker,'declareHostility',{vesselId:target.id}));ok(f.realm._command(attacker,'boardHostileShip',{vesselId:target.id}));bridge(f.realm,attacker,target);
  assert.equal(owner.game.state.person.health,100);assert.equal(owner.aboard,target.id);assert.equal(f.realm._canTakeCapturedHelm(attacker,target),false);
  assert.equal(f.realm._command(attacker,'takeCapturedHelm',{}).code,'boarding');assert.notEqual(target.helmOwner,attacker.id);
  const restored=new Realm({id:f.realm.id,snapshot:f.realm.document(),persistence:f.realm.persistence});assert.equal(restored.vessels.get(target.id).installedBunks,0,'An unfitted prize must not gain a free bunk when restored.');
});

test('a former owner cannot use crew-permission revocation to remotely eject the hostile captor from the helm',async()=>{
  const f=await fixture(),{target,captor,defender}=capturedPlayer(f);
  assert.equal(target.ownerId,defender.id);assert.equal(target.occupation.controllerId,captor.id);
  f.realm._command(defender,'setCrewAccess',{vesselId:target.id,captainId:captor.id,allowed:false});
  assert.equal(target.helmOwner,captor.id);assert.equal(captor.crewRole,'helm');assert.equal(captor.game.state.mode,'ship');assert.equal(captor.aboard,target.id);
});

test('a captor can dock, retain the selected physical ship, reboard it, and launch it again',async()=>{
  const f=await fixture(),{target,captor,defender}=capturedPlayer(f),{realm}=f;
  Object.assign(target.ship,{x:0,y:120});ok(realm._command(captor,'dock',{id:'kettle'}));
  assert.equal(captor.portVesselId,target.id);assert.equal(realm.snapshotFor(captor).state.ship.id,target.id);assert.equal(realm._canBoard(captor,target),true);
  assert.equal(realm._canBoard(defender,target),false,'The former owner does not regain access by the captor docking.');
  ok(realm._command(captor,'boardShip',{vesselId:target.id}));assert.equal(realm._captainTeam(captor,target),captor.id);
  const helm=realm._surface(captor).entities.find(entity=>entity.data?.stationRole==='helm');Object.assign(captor.game.state.person,helm);ok(realm._command(captor,'takeStation',{role:'helm',entityId:helm.id}));
  assert.equal(target.dockedAt,null);assert.equal(captor.game.state.mode,'ship');assert.equal(target.helmOwner,captor.id);
  assert.equal(target.occupation.controllerId,captor.id);
});

test('mining and fitted upgrades remain with the captured physical hull instead of the defeated owner’s recovery cutter',async()=>{
  const f=await fixture(),defender=f.captains[1];defender.game.state.cargo.ore=2;defender.game.state.upgrades.fold_1=1;defender.game._updateStats(false);
  const {target,captor}=capturedPlayer(f),{realm,room}=f;
  room.runtime.asteroids=[{id:'audit-rock',x:target.ship.x+100,y:target.ship.y,radius:20,hp:1,maxHp:1,ore:3,crystal:0,angle:0,spin:0}];
  realm.acceptInput(captor,1,{mine:true});tick(realm,10);
  assert.equal(realm._inventoryFor(target).cargo.ore,5);assert.equal(realm.snapshotFor(captor).state.cargo.ore,5);
  assert.equal(defender.game.state.cargo.ore,0);assert.equal(captor.game.state.cargo.ore,0,'The captor’s unattended original hold is also separate.');
  assert.equal(realm._inventoryFor(target).upgrades.fold_1,1);assert.equal(defender.game.state.upgrades.fold_1,undefined);
  defender.game.state.upgrades.fold_2=1;assert.equal(realm._inventoryFor(target).upgrades.fold_2,undefined);
  const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence});assert.equal(restored._inventoryFor(restored.vessels.get(target.id)).cargo.ore,5);
});

test('ordinary home restoration provisions one recovery cutter when the original was destroyed during a successful capture',async()=>{
  const f=await fixture(1),{source,target,captain}=capturedNpc(f),{realm}=f;
  realm._actor(source)._damageShip(9999);realm._syncActor(source);const prizePose={x:target.ship.x,y:target.ship.y,hull:target.ship.hull};
  realm._restoreAtHome(captain);const recoveryId=captain.ownedVesselId;
  assert.notEqual(recoveryId,source.id);assert.equal(realm.vessels.get(recoveryId).name,'Recovery cutter');assert.equal(captain.game.state.locationId,'kettle');
  assert.equal(source.destroyed,true);assert.equal(source.ship.hull,0);assert.equal(target.dockedAt,null);assert.deepEqual({x:target.ship.x,y:target.ship.y,hull:target.ship.hull},prizePose);
  const count=realm.vessels.size;realm._restoreAtHome(captain);assert.equal(realm.vessels.size,count);assert.equal(captain.ownedVesselId,recoveryId);
  const exit=realm._surface(captain).entities.find(entity=>entity.type==='exit');Object.assign(captain.game.state.person,exit);ok(realm._command(captain,'launch',{}));assert.equal(captain.aboard,recoveryId);
});

test('losing a later pirate raid on an already-captured prize blocks its bunk and never tows the occupied prize home',async()=>{
  const f=await fixture(1),{target,captain}=capturedNpc(f),{realm,room}=f;
  target.bunks[0]=captain.id;target.installedBunks=1;captain.home={kind:'bunk',vesselId:target.id,bunkIndex:0,systemId:'hearth'};
  const pirate={id:'second-raider',name:'Second raider',...enemyHullProfile(),x:target.ship.x+100,y:target.ship.y,hp:100,maxHp:100,disabled:false,active:true,cooldown:99,speed:0,damage:5,faction:'cinder'};room.runtime.enemies.push(pirate);
  target.ship.shield=0;const actor=realm._actor(target);ok(actor.startBoarding(pirate.id));realm._syncActor(target);
  assert.equal(realm._canTakeCapturedHelm(captain,target),false,'An earlier capture cannot skip a fresh pirate raid.');
  assert.equal(realm._command(captain,'takeCapturedHelm',{}).code,'boarding');
  actor.state.person.health=0;actor._finishBoarding('lost');realm._syncActor(target);const pose={x:target.ship.x,y:target.ship.y,hull:target.ship.hull};
  assert.equal(target.captured,true);assert.equal(target.npcOccupied,true);assert.equal(realm._hostileOccupied(target),true);
  realm._restoreAtHome(captain);assert.notEqual(captain.aboard,target.id);assert.equal(captain.game.state.locationId,'kettle');assert.equal(target.dockedAt,null);
  assert.deepEqual({x:target.ship.x,y:target.ship.y,hull:target.ship.hull},pose);assert.ok(target.boarding.enemies.some(guard=>guard.health>0));
});

test('the entry airlock is an escape location and cannot satisfy authority checks for the helm console',async()=>{
  const {realm,captains:[captain]}=await fixture(1),vessel=realm.vessels.get(captain.aboard);
  ok(realm._command(captain,'enterCabin',{}));const airlock=realm._surface(captain).entities.find(entity=>entity.type==='exit'&&!entity.data?.stationRole);
  assert.ok(airlock);Object.assign(captain.game.state.person,airlock);
  assert.equal(realm._command(captain,'takeStation',{role:'helm',entityId:airlock.id}).code,'distance');assert.equal(vessel.helmOwner,null);assert.equal(captain.game.state.mode,'person');
});
