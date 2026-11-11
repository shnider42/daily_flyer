import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {Game,distance} from '../../dist/engine.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';
import {repairSolution} from '../../dist/surface.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
async function fixture(startMode='hardcore'){
 const realm=new Realm({id:'LIFE123',seed:'civilian-authority',persistence:storage()});
 const {captain:c}=await realm.createCaptain('Worker',{startMode});realm.attach(c,{close(){}});
 const room=realm._room('hearth');for(const field of ['enemies','bullets','signals','pickups'])room.runtime[field]=[];
 return{realm,c,room};
}
function tick(realm,count=1){for(let i=0;i<count;i++){const at=Date.now();realm.step(.1,realm.tick+1,at,at);}}
function approach(realm,c,predicate){const entity=realm._surface(c).entities.find(typeof predicate==='string'?e=>e.type===predicate:predicate);assert.ok(entity);Object.assign(c.game.state.person,{x:entity.x,y:entity.y});return entity;}
function land(realm,c,bodyId='morrow'){
 const vessel=realm.vessels.get(c.ownedVesselId),body=realm._room('hearth').runtime.bodies.find(b=>b.id===bodyId);
 Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});ok(realm._command(c,'dock',{id:bodyId}));return vessel;
}

test('a shared shipless captain persists without a physical or targetable starter hull',async()=>{
 const {realm,c}=await fixture();assert.equal(c.ownedVesselId,null);assert.equal(c.aboard,null);assert.equal(realm.vessels.size,0);
 assert.equal(c.game.state.locationId,'morrow');assert.equal(c.game.state.credits,180);
 tick(realm,30);assert.equal(realm.vessels.size,0);assert.equal(c.game.state.ship.hull,100);
 for(const name of ['quickLaunch','launch','enterCabin','buyUpgrade','dismissCrew'])assert.equal(realm._command(c,name,{id:'thrusters_1'}).ok,false,name);
 const view=realm.snapshotFor(c,{drainEvents:false}),client=Game.fromSave(view.state);
 assert.equal(view.fleet.length,0);assert.equal(view.remoteShips.length,0);assert.equal(client.ownsShip,false);assert.equal(client.hasActiveVessel,false);
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()});
 const returned=restored.captains.get(c.id);restored.attach(returned,{close(){}});
 assert.equal(restored.vessels.size,0);assert.equal(returned.ownedVesselId,null);assert.equal(returned.game.ownsShip,false);
 restored._restoreAtHome(returned,{forceSafe:true});assert.equal(restored.vessels.size,0);
});

test('two actual local shifts buy one paid first ship and replay cannot charge or create it twice',async()=>{
 const {realm,c}=await fixture();const initial=c.game.state.credits;
 for(let round=0;round<2;round++){
  const job=c.game.availableJobs().find(j=>j.type==='work'&&j.status==='available');assert.ok(job);
  approach(realm,c,'jobboard');ok(realm._command(c,'acceptJob',{id:job.id}));
  const relays=realm._surface(c).entities.filter(e=>e.type==='work').slice(0,3);assert.equal(relays.length,3);
  for(const relay of relays){Object.assign(c.game.state.person,{x:relay.x,y:relay.y});ok(realm._command(c,'surfaceAction',{entityId:relay.id,action:'repair',solution:repairSolution(relay.id)}));}
  approach(realm,c,'jobboard');ok(realm._command(c,'turnInJob',{id:job.id}));
 }
 assert.ok(c.game.state.credits>=initial+240);assert.equal(c.game.state.cargo.ore,0);
 approach(realm,c,'mechanic');const before=c.game.state.credits;
 const first=ok(await realm.command(c,'buyShip',{id:'sparrow'},'first-purchase'));
 assert.equal(c.game.state.credits,before-420);assert.equal(realm.vessels.size,1);assert.ok(c.ownedVesselId);assert.equal(c.game.ownsShip,true);
 const again=ok(await realm.command(c,'buyShip',{id:'sparrow'},'first-purchase'));assert.deepEqual(again,first);assert.equal(realm.vessels.size,1);assert.equal(c.game.state.credits,before-420);
 ok(realm._command(c,'quickLaunch',{}));assert.equal(c.aboard,c.ownedVesselId);assert.equal(c.game.state.mode,'ship');
});

test('paid passage is available to regular owners and leaves their actual vessel at its origin across restart',async()=>{
 const {realm,c}=await fixture('regular'),owned=land(realm,c),pose=structuredClone(owned.ship),quote=c.game.passengerQuote('kettle');ok(quote);
 const before=c.game.state.credits;ok(await realm.command(c,'takePassengerTransit',{bodyId:'kettle'},'ticket'));
 assert.equal(c.game.state.credits,before-quote.fare);assert.equal(c.game.state.locationId,'kettle');assert.equal(c.aboard,null);
 assert.equal(owned.dockedAt,'morrow');assert.deepEqual(owned.ship,pose);assert.equal(realm._command(c,'quickLaunch',{}).ok,false);
 ok(await realm.command(c,'takePassengerTransit',{bodyId:'kettle'},'ticket'));assert.equal(c.game.state.credits,before-quote.fare);
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),returned=restored.captains.get(c.id),parked=restored.vessels.get(c.ownedVesselId);
 returned.lastSeen=0;restored.attach(returned,{close(){}});assert.equal(parked.dockedAt,'morrow');assert.equal(parked.ship.x,pose.x);assert.equal(parked.ship.y,pose.y);
 ok(restored._command(returned,'takePassengerTransit',{bodyId:'morrow'}));ok(restored._command(returned,'quickLaunch',{}));assert.equal(returned.aboard,parked.id);
});

for(const startMode of ['regular','hardcore'])test(`${startMode}: NPC employment creates a distinct physical hull without transferring ownership or helm access`,async()=>{
 const {realm,c}=await fixture(startMode);if(c.game.ownsShip)land(realm,c);
 const ownedId=c.ownedVesselId,ownShip=structuredClone(c.game.state.ship),ownCrew=structuredClone(c.game.state.crew),before=realm.vessels.size;
 ok(realm._command(c,'acceptNpcContract',{roleId:'medic'}));const contract=c.game.state.npcContract,vessel=realm.vessels.get(contract.vesselId);
 assert.equal(realm.vessels.size,before+1);assert.notEqual(vessel.id,ownedId);assert.equal(c.ownedVesselId,ownedId);assert.equal(c.aboard,vessel.id);
 assert.deepEqual(c.game.state.ship,ownShip);assert.deepEqual(c.game.state.crew,ownCrew);assert.equal(vessel.inventory.crew.length,2);
 for(const name of ['quickHelm','launch','installBunk','setCrewAccess','buyShip'])assert.equal(realm._command(c,name,{role:'helm',id:'sparrow'}).ok,false,name);
 const snapshot=realm.snapshotFor(c,{drainEvents:false}),client=Game.fromSave(snapshot.state);
 assert.equal(client.ownsShip,startMode==='regular');assert.equal(client.hasActiveVessel,true);assert.equal(snapshot.state.ship.id,vessel.id);assert.equal(snapshot.state.interior.location.ownership,'crew');
 const departure={x:vessel.ship.x,y:vessel.ship.y};tick(realm,100);
 assert.equal(contract.phase,'outbound');assert.equal(vessel.dockedAt,null);assert.ok(distance(vessel.ship,departure)>5);assert.equal(c.game.state.completedChapters.length,0);
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),returned=restored.captains.get(c.id);
 returned.lastSeen=0;restored.attach(returned,{close(){}});assert.equal(returned.aboard,vessel.id);assert.equal(returned.ownedVesselId,ownedId);assert.equal(returned.game.state.npcContract.id,contract.id);
 assert.equal(restored.vessels.size,before+1);assert.deepEqual(returned.game.state.ship,ownShip);
});

for(const roleId of ['medic','firehand','gunner'])test(`shared ${roleId}: actual flight, physical work, return, and one authoritative payment`,async()=>{
 const {realm,c}=await fixture();ok(realm._command(c,'acceptNpcContract',{roleId}));const contract=c.game.state.npcContract,vessel=realm.vessels.get(contract.vesselId),layout=cabinLayout(vessel.ship.classId);
 let performed=0;
 for(let i=0;i<4200&&contract.phase!=='docked'&&contract.active;i++){
  if(contract.phase==='working'){
   if(roleId==='medic'){
    Object.assign(c.game.state.person,layout.stations.medical);
    const result=realm._command(c,'npcContractAction',{action:'heal'});if(result.ok)performed++;
   }else if(roleId==='firehand'){
    const section=vessel.ship.damageControl.sections.find(s=>s.id===contract.work.sectionId);Object.assign(c.game.state.person,{x:section.x+24,y:section.y});
    c.damageControlUntil=0;
    const result=realm._command(c,'npcContractAction',{action:section.fire>.1?'suppress':'repair',sectionId:section.id});if(result.ok)performed++;
   }else{Object.assign(c.game.state.person,layout.stations.security);realm.acceptInput(c,c.inputSeq+1,{fire:true});performed++;}
  }
  tick(realm);
 }
 assert.equal(realm.failed,undefined);assert.equal(contract.phase,'docked',`${roleId} ${JSON.stringify(contract.work)}`);assert.equal(contract.work.done,true);assert.ok(performed>0);
 assert.ok(distance(vessel.ship,contract.dockPoint)<60);assert.equal(c.game.state.credits,180);
 const result=ok(await realm.command(c,'completeNpcContract',{},'settle-watch'));assert.equal(result.wages,contract.reward);assert.equal(c.game.state.credits,180+contract.reward);
 assert.equal(c.game.state.npcContract,null);assert.equal(c.aboard,null);assert.equal(c.ownedVesselId,null);assert.equal(c.game.state.locationId,'morrow');assert.equal(realm.vessels.size,0);
 ok(await realm.command(c,'completeNpcContract',{},'settle-watch'));assert.equal(c.game.state.credits,180+contract.reward);assert.equal(realm._command(c,'completeNpcContract',{}).ok,false);
});

test('lost employer hull recovers its employee without granting a free personal vessel',async()=>{
 const {realm,c}=await fixture();ok(realm._command(c,'acceptNpcContract',{roleId:'firehand'}));const vessel=realm.vessels.get(c.aboard);tick(realm,60);
 realm._destroyVessel(vessel);
 assert.equal(c.ownedVesselId,null);assert.equal(c.game.ownsShip,false);assert.equal(c.game.state.npcContract,null);assert.equal(c.aboard,null);assert.equal(c.game.state.credits,180);
 assert.equal(realm.vessels.size,1);assert.equal(vessel.destroyed,true);assert.equal(c.game.state.npcContractHistory.at(-1).outcome,'interrupted');
});
