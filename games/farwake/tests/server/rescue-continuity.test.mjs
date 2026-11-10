import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { enemyHullProfile, cabinLayout } from '../../dist/fleet.mjs';
import { SIDEARM } from '../../dist/combat.mjs';
import { rescueDisposition, rescueOccupants, rescuedBerthCount } from '../../dist/rescue-rules.mjs';

const sourceId='rescue-fixture-signal',contactId=`contact:${sourceId}`;
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function clock(t){let value=1_800_000_000_000;t.mock.method(Date,'now',()=>value);return{now:()=>value,advance(seconds){value+=seconds*1000;return value;}};}
function seedFor(pirates){
 for(let index=0;index<10000;index++){
  const seed=`shared-rescue-${index}`,intent=rescueDisposition(seed,'hearth',sourceId,'lifeboat');
  if(intent.pirates===pirates&&(!pirates||intent.revealAfter<40))return seed;
 }
 assert.fail('A deterministic disposition fixture could not be found');
}
const seeds={safe:seedFor(false),pirates:seedFor(true)};
async function fixture(count=2,{pirates=false,starterShip='sparrow'}={}){
 const persistence={kind:'memory',snapshot:null,async save(id,version,snapshot){this.snapshot=structuredClone(snapshot);return{version:version+1};}};
 const realm=new Realm({id:'RESCUE01',seed:pirates?seeds.pirates:seeds.safe,persistence}),captains=[];
 for(let index=0;index<count;index++){
  const {captain}=await realm.createCaptain(`Captain ${index+1}`,{starterShip});ok(realm.attach(captain,{close(){}}));captains.push(captain);
  // Rescue crews use an already-earned four-berth carrier, not a starter cabin.
  captain.game.state.fleet.owned.push('quill');captain.game._activateClass('quill',true);
  Object.assign(realm.vessels.get(captain.ownedVesselId).ship,{x:index*100,y:500,angle:0,vx:0,vy:0,angularVelocity:0});
 }
 const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];room.runtime.asteroids=[];room.runtime.pickups=[];room.runtime.signals=[];room.runtime.traffic=[];
 return{realm,captains,vessels:captains.map(captain=>realm.vessels.get(captain.ownedVesselId)),room,persistence};
}
function putDistress({realm,room},carrier,{encounterId='lifeboat'}={}){
 const freighter=encounterId==='ghost_freighter';
 const signal={id:sourceId,name:freighter?'Silent freighter':'Weak lifeboat transponder',kind:freighter?'derelict':'distress',encounterId,vesselId:contactId,x:carrier.ship.x+70,y:carrier.ship.y,radius:20,resolved:false,scanned:false};
 const contact={id:contactId,name:freighter?'Silent freighter':'Unpowered lifeboat',signalId:sourceId,encounterId,...enemyHullProfile(freighter?'hauler':'kestrel'),x:signal.x,y:signal.y,angle:0,speed:0,faction:'freewake',contact:true};
 room.runtime.signals.push(signal);room.runtime.traffic.push(contact);room.record.encounterContacts||={};room.record.encounterContacts[contactId]=structuredClone(contact);
 return signal;
}
async function admit(f,captain=f.captains[0],carrier=f.vessels[0]){
 putDistress(f,carrier);
 const scanned=ok(await f.realm.command(captain,'scan',{id:sourceId}));assert.equal(scanned.encounter.id,'lifeboat');
 assert.equal(captain.game.state.pendingEncounter.shipId,carrier.id);
 const credits=captain.game.state.credits;ok(await f.realm.command(captain,'applyChoice',{encounterId:'lifeboat',choice:'rescue'}));
 assert.equal(carrier.ship.rescueGroups.length,1);assert.equal(carrier.ship.rescueGroups[0].members.length,2);assert.equal(captain.game.state.credits,credits+45);
 return carrier.ship.rescueGroups[0];
}
function tick(realms,time,frames=1){
 for(let index=0;index<frames;index++){time.advance(.1);for(const realm of Array.isArray(realms)?realms:[realms])realm.step(.1,realm.tick+1,time.now());}
}
function visibleGuests(realm,captain){return realm._surface(captain).entities.filter(entity=>entity.data?.rescuePassenger);}
async function permission(realm,captain,guest=null){ok(await realm.command(captain,'setCrewAccess',guest?{captainId:guest.id,allowed:true,roles:['helm']}:{allowed:true}));}
async function takeHelm(realm,captain){const bridge=realm._surface(captain).entities.find(entity=>entity.data?.stationRole==='helm');assert.ok(bridge);Object.assign(captain.game.state.person,{x:bridge.x,y:bridge.y});return realm.command(captain,'takeStation',{role:'helm',entityId:bridge.id});}
function walk(realm,captain,id){const entity=realm._surface(captain).entities.find(entity=>entity.id===id);assert.ok(entity,id);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
async function launch(realm,captain){
 if(captain.game.state.mode==='ship')return;
 const exit=realm._surface(captain).entities.find(entity=>entity.type==='exit');assert.ok(exit);walk(realm,captain,exit.id);ok(await realm.command(captain,'launch'));
}
async function land(realm,captain,bodyId='kettle'){
 await launch(realm,captain);const carrier=realm.vessels.get(captain.ownedVesselId),body=realm._room(carrier.systemId).runtime.bodies.find(body=>body.id===bodyId);assert.ok(body);
 Object.assign(carrier.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0,angularVelocity:0});ok(await realm.command(captain,'dock',{id:body.id}));
}
async function bookOccupant(realm,captain,kind){
 await land(realm,captain);
 if(kind==='fare'){
  const entityId='quest:passage-desk:kettle';walk(realm,captain,entityId);const offer=captain.game.passengerOffers()[0];assert.ok(offer);
  ok(await realm.command(captain,'acceptPassenger',{offerId:offer.id,entityId}));
 }else{
  const entityId='quest:profession-desk:kettle';walk(realm,captain,entityId);ok(await realm.command(captain,'enlistProfession',{professionId:'paramedic',entityId}));
  const offer=captain.game.professionBoard(entityId).offers.find(offer=>offer.professionId==='paramedic');assert.ok(offer);ok(await realm.command(captain,'professionAction',{action:'accept',jobId:offer.id,entityId}));
  const job=captain.game.state.professions.active;await land(realm,captain,job.targetBody);const pickup=`quest:profession-desk:${job.targetBody}`;walk(realm,captain,pickup);
  ok(await realm.command(captain,'professionAction',{action:'pickupPatient',jobId:job.id,entityId:pickup}));
 }
 await launch(realm,captain);
 assert.equal(kind==='fare'?captain.game.narrativeBerths():captain.game.professionBerths(),1);
}
function rendezvous(vessels){vessels.forEach((vessel,index)=>Object.assign(vessel.ship,{x:index*55,y:500,vx:0,vy:0,angularVelocity:0}));}

test('a shared physical distress choice creates visible people on its carrier and survives a restart once',async t=>{
 clock(t);const f=await fixture(1),{realm,captains:[captain],vessels:[carrier]}=f,group=await admit(f);
 const names=group.members.map(member=>member.name),ids=group.members.map(member=>member.id),paid=captain.game.state.credits;
 assert.equal(group.shipId,carrier.id);assert.equal(rescuedBerthCount(carrier.ship),2);assert.equal(captain.game.freeBerths,1);
 assert.equal((await realm.command(captain,'applyChoice',{encounterId:'lifeboat',choice:'rescue'})).ok,false);assert.equal(captain.game.state.credits,paid);assert.equal(carrier.ship.rescueGroups.length,1);
 ok(await realm.command(captain,'enterCabin'));
 assert.deepEqual(visibleGuests(realm,captain).map(entity=>entity.data.guestId),ids);assert.deepEqual(visibleGuests(realm,captain).map(entity=>entity.name),names);
 const view=realm.snapshotFor(captain,{drainEvents:false});assert.equal(view.state.ship.id,carrier.id);assert.deepEqual(view.state.interior.location.guests.map(person=>person.id),ids);
 assert.ok(view.state.interior.location.guests.every(person=>person.pirates===undefined&&person.revealAfter===undefined));
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence}),returned=restored.captains.get(captain.id),saved=restored.vessels.get(carrier.id);
 assert.equal(saved.ship.rescueGroups[0].shipId,carrier.id);assert.deepEqual(saved.ship.rescueGroups[0].members.map(member=>member.id),ids);
 assert.deepEqual(visibleGuests(restored,returned).map(entity=>entity.data.guestId),ids);assert.equal(restored.captains.get(captain.id).game.state.credits,paid);
});

for(const routes of [['traffic','signal'],['signal','traffic'],['traffic','traffic']])test(`a stale ${routes[0]} rescue cannot collect a hull already evacuated through ${routes[1]}`,async t=>{
 clock(t);const f=await fixture(2),{realm,captains:[waiting,rescuer],vessels:[empty,carrier],room}=f,signal=putDistress(f,carrier);
 for(const [index,route] of routes.entries()){
  const captain=f.captains[index],opened=route==='signal'?await realm.command(captain,'scan',{id:sourceId}):await realm.command(captain,'triggerEncounter',{sourceId:contactId,sourceType:'traffic'});
  assert.equal(ok(opened).encounter.id,'lifeboat');assert.equal(captain.game.state.pendingEncounter.sourceId,sourceId);assert.equal(captain.game.state.pendingEncounter.vesselId,contactId);
 }
 const before={credits:waiting.game.state.credits,fuel:empty.ship.fuel,decisions:waiting.game.state.stats.decisions};
 ok(await realm.command(rescuer,'applyChoice',{encounterId:'lifeboat',choice:'rescue'}));
 const group=carrier.ship.rescueGroups[0],expected=rescueDisposition(realm.seed,'hearth',sourceId,'lifeboat');
 assert.equal(group.sourceId,sourceId);assert.equal(group.pirates,expected.pirates);assert.equal(group.revealAfter,expected.revealAfter);assert.equal(rescuedBerthCount(carrier.ship),2);
 const stale=await realm.command(waiting,'applyChoice',{encounterId:'lifeboat',choice:'rescue'});assert.equal(stale.ok,false);
 assert.deepEqual({credits:waiting.game.state.credits,fuel:empty.ship.fuel,decisions:waiting.game.state.stats.decisions},before);assert.equal(rescuedBerthCount(empty.ship),0);assert.equal(empty.ship.rescueGroups.length,0);assert.equal(carrier.ship.rescueGroups.length,1);
 const hull=room.runtime.traffic.find(contact=>contact.id===contactId);assert.ok(hull,'The empty physical vessel stays in space.');assert.equal(hull.resolved,true);assert.equal(hull.evacuated,true);assert.equal(signal.resolved,true);
 ok(await realm.command(waiting,'dismissEncounter'));assert.equal((await realm.command(waiting,'triggerEncounter',{sourceId:contactId,sourceType:'traffic'})).ok,false);assert.equal((await realm.command(waiting,'scan',{id:sourceId})).ok,false);
});

test('a permitted helmsman rescues into the ship being flown and every person on that deck sees the same guests',async t=>{
 clock(t);const f=await fixture(2),{realm,captains:[pilot,owner],vessels:[parked,carrier]}=f;
 await permission(realm,owner,pilot);ok(await realm.command(owner,'enterCabin'));ok(await realm.command(pilot,'boardShip',{vesselId:carrier.id}));ok(await takeHelm(realm,pilot));
 const group=await admit(f,pilot,carrier),ids=group.members.map(member=>member.id);
 assert.equal(pilot.ownedVesselId,parked.id);assert.equal(pilot.game.state.ship,parked.ship);assert.equal(rescuedBerthCount(parked.ship),0);assert.equal(rescuedBerthCount(carrier.ship),2);
 assert.deepEqual(visibleGuests(realm,owner).map(entity=>entity.data.guestId),ids);
 ok(await realm.command(pilot,'enterCabin'));assert.deepEqual(visibleGuests(realm,pilot).map(entity=>entity.data.guestId),ids);
 for(const captain of [pilot,owner])assert.deepEqual(realm.snapshotFor(captain,{drainEvents:false}).state.interior.location.guests.map(person=>person.id),ids);
});

test('rescue reveal advances once per physical hull with one or ten connected captains',async t=>{
 const time=clock(t),single=await fixture(1,{pirates:true}),full=await fixture(10,{pirates:true}),one=await admit(single),ten=await admit(full);
 assert.equal(one.pirates,true);assert.equal(ten.pirates,true);assert.equal(one.revealAfter,ten.revealAfter);single.realm.snapshotFor(single.captains[0]);full.realm.snapshotFor(full.captains[0]);
 let frames=0;
 while(!single.vessels[0].boarding&&frames<800){tick([single.realm,full.realm],time);frames++;assert.ok(Math.abs(one.elapsed-ten.elapsed)<1e-9);}
 assert.ok(frames*.1>=one.revealAfter&&frames*.1<one.revealAfter+.11);
 for(const f of [single,full]){
  const boarding=f.vessels[0].boarding,group=f.vessels[0].ship.rescueGroups[0];assert.equal(boarding?.source,'rescued-pirates');assert.equal(boarding.phase,'active');
  assert.equal(group.status,'hostile');assert.equal(group.combatId,boarding.id);assert.deepEqual(boarding.enemies.map(enemy=>enemy.id),group.members.map(member=>member.id));
  assert.equal(f.realm.snapshotFor(f.captains[0]).events.filter(event=>event.type==='boarding'&&event.boarding?.source==='rescued-pirates').length,1);
 }
 const id=one.combatId;tick([single.realm,full.realm],time,10);assert.equal(one.combatId,id);assert.equal(single.vessels[0].ship.rescueGroups.length,1);
 assert.equal(single.realm.snapshotFor(single.captains[0]).events.filter(event=>event.type==='boarding'&&event.boarding?.source==='rescued-pirates').length,0);
});

test('a rescue hijack stays on the original hull when its owner visits another ship',async t=>{
 const time=clock(t),f=await fixture(2,{pirates:true}),{realm,captains:[owner,friend],vessels:[carrier,visited]}=f,group=await admit(f);
 await permission(realm,owner);await permission(realm,friend);ok(await realm.command(friend,'boardShip',{vesselId:carrier.id}));
 assert.deepEqual(visibleGuests(realm,friend).map(entity=>entity.data.guestId),group.members.map(member=>member.id));
 ok(await realm.command(owner,'boardShip',{vesselId:visited.id}));const visit={aboard:owner.aboard,location:owner.game.state.locationId,x:owner.game.state.person.x,y:owner.game.state.person.y};
 assert.equal(visibleGuests(realm,owner).length,0);
 for(let frames=0;frames<800&&!carrier.boarding;frames++)tick(realm,time);
 assert.equal(carrier.boarding?.source,'rescued-pirates');assert.equal(carrier.boarding.vesselId,carrier.id);assert.equal(visited.boarding,null);
 assert.deepEqual({aboard:owner.aboard,location:owner.game.state.locationId,x:owner.game.state.person.x,y:owner.game.state.person.y},visit,'a hull-local hijack must not teleport its owner from a different deck');
 assert.equal(friend.aboard,carrier.id);assert.equal(realm.snapshotFor(friend,{drainEvents:false}).state.boarding.id,carrier.boarding.id);assert.equal(realm.snapshotFor(owner,{drainEvents:false}).state.boarding,null);
 assert.equal(rescuedBerthCount(visited.ship),0);assert.equal(carrier.ship.rescueGroups[0].shipId,carrier.id);
});

test('the rescued people become the actual combat actors, take real sidearm damage, and cannot respawn after defeat',async t=>{
 const time=clock(t),f=await fixture(1,{pirates:true}),{realm,captains:[captain],vessels:[carrier]}=f,group=await admit(f),ids=group.members.map(member=>member.id);
 for(let frames=0;frames<800&&!carrier.boarding;frames++)tick(realm,time);
 const boarding=carrier.boarding;assert.equal(boarding.source,'rescued-pirates');assert.deepEqual(boarding.enemies.map(enemy=>enemy.id),ids);assert.equal(captain.game.state.mode,'person');assert.equal(visibleGuests(realm,captain).length,0);
 const enemy=boarding.enemies[0],point=cabinLayout(carrier.ship.classId).spawn;Object.assign(captain.game.state.person,point);Object.assign(enemy,{x:point.x+20,y:point.y,cooldown:0,speed:0});
 const health=captain.game.state.person.health;tick(realm,time);assert.ok(captain.game.state.person.health<health,'an armed rescued passenger must deal damage through real deck combat');
 for(const target of boarding.enemies){
  while(target.health>0){
   Object.assign(captain.game.state.person,{x:target.x,y:target.y});captain.game._boardingShotTimer=0;const before=target.health;
   ok(await realm.command(captain,'attackBoarder',{enemyId:target.id}));assert.equal(target.health,Math.max(0,before-SIDEARM.damage));
  }
 }
 tick(realm,time);assert.equal(boarding.phase,'won');assert.equal(group.status,'defeated');assert.ok(group.members.every(member=>member.health===0));assert.equal(rescuedBerthCount(carrier.ship),0);
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence}),returned=restored.captains.get(captain.id),saved=restored.vessels.get(carrier.id);
 assert.equal(saved.ship.rescueGroups[0].status,'defeated');assert.equal(rescueOccupants(saved.ship).length,0);assert.equal(visibleGuests(restored,returned).length,0);
 assert.deepEqual(saved.boarding.enemies.map(target=>target.id),ids);assert.ok(saved.boarding.enemies.every(target=>target.health===0));
});

test('rescued passengers consume shared berths, disembark only with their hull, and cannot be collected by a second captain',async t=>{
 clock(t);const f=await fixture(3),{realm,captains:[owner,friend,third],vessels:[carrier]}=f,group=await admit(f),ids=group.members.map(member=>member.id);
 await permission(realm,owner);ok(await realm.command(friend,'boardShip',{vesselId:carrier.id}));
 assert.equal((await realm.command(third,'boardShip',{vesselId:carrier.id})).code,'capacity');assert.equal((await realm.command(third,'scan',{id:sourceId})).ok,false);
 const port=realm._room('hearth').runtime.bodies.find(body=>body.id==='kettle');
 assert.equal((await realm.command(owner,'dock',{id:port.id})).ok,false,'a remote port cannot transfer passengers');assert.deepEqual(group.members.map(member=>member.id),ids);assert.equal(rescuedBerthCount(carrier.ship),2);
 Object.assign(carrier.ship,{x:port.x,y:port.y+port.radius+60,vx:0,vy:0});ok(await realm.command(owner,'dock',{id:port.id}));
 assert.equal(carrier.dockedAt,port.id);assert.equal(rescuedBerthCount(carrier.ship),0);assert.equal(carrier.ship.rescueGroups.length,0);assert.equal(carrier.ship.rescueHistory.filter(entry=>entry.id===group.id&&entry.outcome==='delivered').length,1);
 assert.equal(visibleGuests(realm,friend).length,0);const paid=owner.game.state.credits;assert.equal((await realm.command(owner,'applyChoice',{encounterId:'lifeboat',choice:'rescue'})).ok,false);assert.equal(owner.game.state.credits,paid);
});

for(const kind of ['fare','patient'])test(`a guest helmsman respects the carrier owner's ${kind} reservation without inheriting either captain's quests`,async t=>{
 clock(t);const f=await fixture(4),{realm,captains:[owner,pilot,third,fourth],vessels:[carrier,parked]}=f;
 await bookOccupant(realm,owner,kind);await bookOccupant(realm,pilot,kind);rendezvous(f.vessels);
 const ownership=[owner,pilot].map(captain=>({captain,narrative:captain.game.state.narrative,professions:captain.game.state.professions,saved:JSON.stringify([captain.game.state.narrative,captain.game.state.professions])}));
 await permission(realm,owner);await permission(realm,owner,pilot);ok(await realm.command(owner,'enterCabin'));ok(await realm.command(pilot,'boardShip',{vesselId:carrier.id}));ok(await takeHelm(realm,pilot));
 const signal=putDistress(f,carrier);ok(await realm.command(pilot,'scan',{id:signal.id}));const credits=pilot.game.state.credits,fuel=carrier.ship.fuel;
 const rejected=await realm.command(pilot,'applyChoice',{encounterId:'lifeboat',choice:'rescue'});
 assert.equal(rejected.ok,false);assert.equal(rejected.code,'requirements');assert.equal(carrier.ship.humanOccupants,2);
 assert.equal(rescuedBerthCount(carrier.ship),0);assert.equal(rescuedBerthCount(parked.ship),0);assert.equal(pilot.game.state.credits,credits);assert.equal(carrier.ship.fuel,fuel);assert.equal(signal.resolved,false);
 assert.equal(pilot.game.state.ship,parked.ship);assert.equal(owner.game.state.ship,carrier.ship);
 for(const {captain,narrative,professions,saved} of ownership){
  assert.equal(captain.game.state.narrative,narrative);assert.equal(captain.game.state.professions,professions);assert.equal(JSON.stringify([narrative,professions]),saved);
  assert.equal(kind==='fare'?captain.game.narrativeBerths():captain.game.professionBerths(),1);
  assert.equal(Object.hasOwn(captain.game,'narrativeBerths'),false);assert.equal(Object.hasOwn(captain.game,'professionBerths'),false);
 }
 ok(await realm.command(third,'boardShip',{vesselId:carrier.id}));
 assert.equal((await realm.command(fourth,'boardShip',{vesselId:carrier.id})).code,'capacity','three human crew plus this carrier’s existing passenger fill all four berths');
 assert.equal(realm.tick,0,'capacity is correct without a simulation step');
});

test('a visiting pilot leaves their fare and patient on their original hull when rescuing aboard another ship',async t=>{
 clock(t);const f=await fixture(2),{realm,captains:[owner,pilot],vessels:[carrier,parked]}=f;
 await bookOccupant(realm,pilot,'fare');await bookOccupant(realm,pilot,'patient');rendezvous(f.vessels);
 const fare=pilot.game.state.narrative.passenger,patient=pilot.game.state.professions.active,before=JSON.stringify([fare,patient]);
 await permission(realm,owner,pilot);ok(await realm.command(owner,'enterCabin'));ok(await realm.command(pilot,'boardShip',{vesselId:carrier.id}));ok(await takeHelm(realm,pilot));
 await admit(f,pilot,carrier);
 assert.equal(carrier.ship.humanOccupants,2);assert.equal(rescuedBerthCount(carrier.ship),2);assert.equal(rescuedBerthCount(parked.ship),0);
 assert.equal(pilot.game.state.narrative.passenger,fare);assert.equal(pilot.game.state.professions.active,patient);assert.equal(JSON.stringify([fare,patient]),before);
 assert.equal(fare.shipId,parked.id);assert.equal(patient.shipId,parked.id);assert.equal(pilot.game.narrativeBerths(),1);assert.equal(pilot.game.professionBerths(),1);
 assert.equal(owner.game.narrativeBerths(),0);assert.equal(owner.game.professionBerths(),0);assert.equal(owner.game.freeBerths,0);
});

test('same-tick boarding and return update rescue capacity on the actual carrier immediately',async t=>{
 clock(t);const f=await fixture(3),{realm,captains:[owner,pilot,third],vessels:[carrier]}=f;rendezvous(f.vessels);
 await permission(realm,owner);await permission(realm,owner,pilot);ok(await realm.command(owner,'enterCabin'));
 ok(await realm.command(pilot,'boardShip',{vesselId:carrier.id}));ok(await realm.command(third,'boardShip',{vesselId:carrier.id}));ok(await takeHelm(realm,pilot));
 putDistress(f,carrier);ok(await realm.command(pilot,'scan',{id:sourceId}));const credits=pilot.game.state.credits,fuel=carrier.ship.fuel;
 assert.equal((await realm.command(pilot,'applyChoice',{encounterId:'lifeboat',choice:'rescue'})).ok,false);
 assert.equal(carrier.ship.humanOccupants,3);assert.equal(rescuedBerthCount(carrier.ship),0);assert.equal(pilot.game.state.credits,credits);assert.equal(carrier.ship.fuel,fuel);
 Object.assign(third.game.state.person,cabinLayout(carrier.ship.classId).spawn);ok(await realm.command(third,'returnToOwnShip'));
 ok(await realm.command(pilot,'applyChoice',{encounterId:'lifeboat',choice:'rescue'}));
 assert.equal(realm.tick,0);assert.equal(carrier.ship.humanOccupants,2);assert.equal(rescuedBerthCount(carrier.ship),2);assert.equal(pilot.game.state.credits,credits+45);assert.equal(carrier.ship.fuel,fuel-3);
 assert.equal(carrier.ship.rescueGroups.length,1);assert.equal(third.aboard,third.ownedVesselId);
});

test('a captain already inside a freighter sees its survivor leave when another ship completes the rescue',async t=>{
 clock(t);const f=await fixture(2),{realm,captains:[rescuer,visitor],vessels:[carrier],room}=f;
 const signal=putDistress(f,carrier,{encounterId:'ghost_freighter'});ok(await realm.command(visitor,'boardDerelict',{id:signal.id}));
 const before=realm._surface(visitor),locationId=visitor.game.state.locationId;assert.equal(before.entities.filter(entity=>entity.role==='survivor').length,1);
 const encounter=ok(await realm.command(rescuer,'scan',{id:signal.id}));assert.equal(encounter.encounter.id,'ghost_freighter');
 ok(await realm.command(rescuer,'applyChoice',{encounterId:'ghost_freighter',choice:'board'}));
 assert.equal(rescuedBerthCount(carrier.ship),3);assert.equal(room.record.encounterContacts[contactId].evacuated,true);
 const after=realm._surface(visitor);assert.notEqual(after,before,'a changed evacuation state invalidates the already-open deck');assert.equal(after.entities.filter(entity=>entity.role==='survivor').length,0);
 const view=realm.snapshotFor(visitor,{drainEvents:false});assert.equal(view.state.interior.location.evacuated,true);assert.equal(view.state.locationId,locationId);assert.equal(view.state.interior.kind,'derelict');
});
