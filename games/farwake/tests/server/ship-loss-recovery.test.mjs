import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
async function fixture(count=1){
 const realm=new Realm({id:'LOSS0001',seed:'shared-nearest-loss',persistence:storage()}),captains=[];
 for(let index=0;index<count;index++){
  const {captain}=await realm.createCaptain(`Crew ${index}`);ok(realm.attach(captain,{close(){}}));
  Object.assign(captain.game.state.ship,{x:index*40,y:250,vx:0,vy:0});captains.push(captain);
 }
 return{realm,captains,vessels:captains.map(captain=>realm.vessels.get(captain.ownedVesselId))};
}
function relocate(realm,vessel,systemId,bodyId){
 const body=realm._room(systemId).runtime.bodies.find(body=>body.id===bodyId);
 vessel.systemId=systemId;vessel.dockedAt=null;Object.assign(vessel.ship,{x:body.x+30,y:body.y,vx:0,vy:0});
 for(const captain of realm.captains.values())if(captain.aboard===vessel.id)realm._bindCaptain(captain);
 return body;
}

test('one destroyed ship recovers all online and disconnected occupants at its nearest station without replacing anyone’s hull',async()=>{
 const {realm,captains:[owner,guest,offline],vessels:[carrier,parked,otherParked]}=await fixture(3);
 owner.game.state.fleet.owned.push('tern');owner.game._activateClass('tern',true);carrier.allowCrew=true;
 ok(realm._command(guest,'boardShip',{vesselId:carrier.id}));ok(realm._command(offline,'boardShip',{vesselId:carrier.id}));offline.session=null;
 const originals=[parked,otherParked].map(vessel=>structuredClone(vessel.ship));
 const station=relocate(realm,carrier,'brindle','common-watch'),count=realm.vessels.size;
 const actor=realm._actor(carrier);actor._damageShip(99999);realm._syncActor(carrier);
 assert.equal(carrier.ship.hull,0);assert.equal(carrier.ship.destroyed,true);assert.equal(carrier.destroyed,true);assert.equal(realm.vessels.size,count);
 for(const captain of [owner,guest,offline]){
  assert.equal(captain.aboard,null);assert.equal(captain.game.state.mode,'person');assert.equal(captain.game.state.locationId,station.id);assert.equal(captain.game.state.systemId,'brindle');
  assert.equal(captain.game.state.stationView,null);assert.equal(captain.game.state.shipRecovery.vesselId,carrier.id);assert.equal(captain.game.state.stats.rescues,1);
  assert.equal(realm._command(captain,'launch',{}).ok,false);
 }
 assert.equal(owner.ownedVesselId,null);assert.equal(owner.game.ownsShip,false);assert.equal(owner.game.hasActiveVessel,false);
 assert.equal(guest.ownedVesselId,parked.id);assert.equal(offline.ownedVesselId,otherParked.id);
 assert.deepEqual(parked.ship,originals[0]);assert.deepEqual(otherParked.ship,originals[1]);assert.equal(parked.systemId,'hearth');
 assert.ok([...realm.vessels.values()].every(vessel=>vessel.name!=='Recovery cutter'));
 for(const compact of [false,true]){const view=realm.snapshotFor(owner,{compact,drainEvents:false});assert.equal(view.state.shipRecovery.destination.bodyId,station.id);assert.equal(view.state.multiplayer.ownedVesselId,null);assert.equal(view.state.ship.unowned,true);}
});

test('restart and delayed reconnect preserve the recovery station instead of moving a survivor to their home',async()=>{
 let {realm,captains:[captain],vessels:[vessel]}=await fixture();
 relocate(realm,vessel,'sable','checkpoint');realm._destroyVessel(vessel);captain.lastSeen=Date.now()-120000;
 const id=captain.id,lossId=vessel.id,snapshot=realm.document();realm=new Realm({id:realm.id,persistence:realm.persistence,snapshot});captain=realm.captains.get(id);
 ok(realm.attach(captain,{close(){}}));
 assert.equal(captain.game.state.systemId,'sable');assert.equal(captain.game.state.locationId,'checkpoint');assert.equal(captain.aboard,null);assert.equal(captain.ownedVesselId,null);
 assert.equal(realm.vessels.get(lossId).ship.hull,0);assert.equal(realm.vessels.size,1);assert.equal(captain.game.ownsShip,false);
 realm._restoreAtHome(captain);assert.equal(captain.game.state.locationId,'checkpoint');
});

test('destruction of a distant owned hull removes its registration but cannot teleport the owner from a surviving crew deck',async()=>{
 const {realm,captains:[owner,host],vessels:[lost,safe]}=await fixture(2);safe.allowCrew=true;
 ok(realm._command(owner,'boardShip',{vesselId:safe.id}));
 const pose={x:owner.game.state.person.x,y:owner.game.state.person.y,locationId:owner.game.state.locationId};
 realm._destroyVessel(lost);
 assert.equal(owner.ownedVesselId,null);assert.equal(owner.game.ownsShip,false);assert.equal(owner.aboard,safe.id);
 assert.deepEqual({x:owner.game.state.person.x,y:owner.game.state.person.y,locationId:owner.game.state.locationId},pose);
 assert.equal(owner.game.state.shipRecovery,undefined);assert.equal(safe.ship.hull,safe.ship.maxHull);assert.equal(host.aboard,safe.id);
});

test('a purchased replacement gets a different registration and leaves the destroyed hull in the realm',async()=>{
 const {realm,captains:[captain],vessels:[lost]}=await fixture();realm._destroyVessel(lost);
 captain.game.state.credits=800;
 const mechanic=realm._surface(captain).entities.find(entity=>entity.type==='mechanic');assert.ok(mechanic);Object.assign(captain.game.state.person,mechanic);
 ok(realm._command(captain,'buyShip',{id:'sparrow'}));
 const replacement=realm.vessels.get(captain.ownedVesselId);
 assert.ok(replacement);assert.notEqual(replacement.id,lost.id);assert.equal(captain.game.state.credits,380);
 assert.equal(lost.destroyed,true);assert.equal(lost.ship.hull,0);assert.equal(realm.vessels.get(lost.id),lost);assert.equal(realm.vessels.size,2);
 assert.equal(replacement.dockedAt,'kettle');assert.equal(captain.game.ownsShip,true);
});

test('loading a legacy zero-hull cockpit finishes recovery before an immediate reconnect can revive it',async()=>{
 const {realm,captains:[captain],vessels:[lost]}=await fixture();relocate(realm,lost,'meridian','ledger');
 const snapshot=realm.document();snapshot.vessels[lost.id].ship.hull=0;delete snapshot.vessels[lost.id].ship.destroyed;delete snapshot.vessels[lost.id].destroyed;
 snapshot.captains[captain.id].game.ship.hull=0;delete snapshot.captains[captain.id].game.ship.destroyed;
 const restored=new Realm({id:realm.id,persistence:realm.persistence,snapshot}),survivor=restored.captains.get(captain.id);
 ok(restored.attach(survivor,{close(){}}));
 assert.equal(survivor.ownedVesselId,null);assert.equal(survivor.aboard,null);assert.equal(survivor.game.state.systemId,'meridian');assert.equal(survivor.game.state.locationId,'ledger');
 assert.equal(survivor.game.ownsShip,false);assert.equal(restored.vessels.get(lost.id).ship.hull,0);assert.equal(restored.vessels.size,1);
});
