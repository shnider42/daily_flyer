import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';
import {Game} from '../../dist/engine.mjs';
import {isWalkable} from '../../dist/surface.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
async function fixture(count=1){
 const realm=new Realm({id:'CREWREC1',seed:'named-survivor-authority',persistence:storage()}),captains=[];
 for(let index=0;index<count;index++){
  const{captain}=await realm.createCaptain(`Recovery captain ${index}`,{startMode:'casual',casualCrewCount:8});ok(realm.attach(captain,{close(){}}));
  // Earned civilian hulls are available after departure in a shared galaxy.
  captain.game.state.fleet.owned.push('osprey');captain.game._activateClass('osprey',true);
  const vessel=realm.vessels.get(captain.ownedVesselId);realm._syncCasualCrew(vessel);vessel.allowCrew=true;
  Object.assign(vessel.ship,{x:index*80,y:250,vx:0,vy:0});captains.push(captain);
 }
 return{realm,captains,vessels:captains.map(captain=>realm.vessels.get(captain.ownedVesselId))};
}
const survivorIds=crew=>crew.map(member=>member.id).sort();
function recoveredAt(game,destination=game.state.medicalRecovery?.destination){return game.recoveredCrewAt(destination.bodyId,destination.systemId);}
function enlisted(c){Object.assign(c.game.state.professions.careers.military,{enlisted:true,factionId:'freewake',completed:1});Object.assign(c.game.state.militaryCareer,{factionId:'freewake',branchId:'navy'});}
function crosswindLoss(realm,c,vessel){
 const room=realm._room('crosswind'),body=room.runtime.bodies.find(body=>body.id==='crosswind-vey');vessel.systemId='crosswind';Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60});for(const captain of realm.captains.values())if(captain.aboard===vessel.id)realm._bindCaptain(captain);
 // This test follows transport and records; the boarding and damage suites
 // independently exercise the battle. Keep new fleet waves out of this route.
 room.runtime.enemies=[];room.runtime.warzone.nextPhaseAt=1e9;room.runtime.warzone.nextDecisionAt=1e9;for(const faction of room.runtime.warzone.factions)room.runtime.warzone.nextWaveAt[faction]=1e9;
 realm._destroyVessel(vessel);c.game.state.stats.time+=8;
}
function arrive(realm,c){for(let index=0;index<4000&&c.game.state.npcContract?.phase!=='docked';index++)realm.step(.1,realm.tick+1);assert.equal(c.game.state.npcContract?.phase,'docked');}

test('physical hull loss preserves living named crew and injuries without reviving a confirmed casualty or retaining duplicate people in the wreck',async()=>{
 const{realm,captains:[c],vessels:[vessel]}=await fixture();
 assert.equal(c.game.state.crew.length,8);
 const wounded=c.game.state.crew[0],dead=c.game.state.crew[1];wounded.health=37;wounded.status='injured';
 c.game._damageCrew(dead.id,9999,'Confirmed boarding casualty');realm._syncCasualCrew(vessel);
 const survivors=structuredClone(c.game.state.crew.filter(member=>member.health>0&&!member.dead));
 assert.equal(survivors.length,7);realm._destroyVessel(vessel);
 const report=c.game.recoveryReport(),receipt=structuredClone(c.game.state.medicalRecovery),recovered=recoveredAt(c.game);
 assert.ok(report?.id);assert.deepEqual(survivorIds(recovered),survivorIds(survivors));
 assert.equal(recovered.find(member=>member.id===wounded.id).health,37);
 assert.ok(!recovered.some(member=>member.id===dead.id));assert.ok(c.game.state.memorial.some(entry=>entry.crewId===dead.id));
 assert.equal(vessel.ship.casualCrew,undefined);assert.ok(realm._crewFor(vessel).every(member=>member.health<=0||member.dead));
 assert.equal(c.ownedVesselId,null);assert.equal(c.game.ownsShip,false);
 assert.equal(realm._command(c,'rejoinRecoveredCrew',{groupId:c.game.state.voyageMemory.recoveredCrews[0].id}).code,'incapacitated');
 const surface=realm._surface(c),people=surface.entities.filter(entity=>entity.data?.recoveredCrew);
 assert.deepEqual(people.map(entity=>entity.data.crewId).sort(),survivorIds(survivors));
 for(const entity of people)assert.ok(isWalkable(surface,entity.x,entity.y),entity.name);
 Object.assign(c.game.state.person,{x:people[0].x,y:people[0].y});const talk=ok(realm._command(c,'surfaceAction',{entityId:people[0].id,action:'talk'}));assert.equal(talk.entity.id,people[0].id);
 const incidentCount=c.game.state.voyageMemory.incidents.length;realm._destroyVessel(vessel);
 assert.equal(c.game.state.voyageMemory.incidents.length,incidentCount);assert.equal(c.game.state.medicalRecovery.id,receipt.id);
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),patient=restored.captains.get(c.id);ok(restored.attach(patient,{close(){}}));
 assert.equal(patient.game.recoveryReport().id,report.id);assert.equal(patient.game.state.medicalRecovery.id,receipt.id);
 assert.deepEqual(survivorIds(recoveredAt(patient.game)),survivorIds(survivors));assert.equal(recoveredAt(patient.game).find(member=>member.id===wounded.id).health,37);
 assert.ok(!restored.failed);
});

test('a visitor’s medical receipt identifies the occupied ship while preserving both captains’ separate living personal manifests',async()=>{
 const{realm,captains:[host,guest],vessels:[carrier,parked]}=await fixture(2);
 const hostIds=survivorIds(host.game.state.crew),guestCrew=structuredClone(guest.game.state.crew);
 ok(realm._command(guest,'boardShip',{vesselId:carrier.id}));guest.game.state.person.health=0;guest.game.state.person.down=true;
 realm._recoverCaptain(guest,'The visiting captain was evacuated after a deck injury.',{sourceKind:'interior-casualty'});
 assert.equal(guest.game.state.shipRecovery.vesselId,carrier.id);assert.equal(guest.ownedVesselId,parked.id);assert.equal(host.ownedVesselId,carrier.id);
 assert.deepEqual(survivorIds(host.game.state.crew),hostIds);assert.deepEqual(guest.game.state.crew,guestCrew);
 assert.equal(recoveredAt(guest.game).length,0,'The host’s company does not become a guest’s personal rescue party.');
 assert.equal(host.game.recoveryReport(),null);
 const report=guest.game.recoveryReport();assert.ok(report?.id);
 assert.equal(report.losses.shipLost,false);assert.ok(report.crew.filter(member=>hostIds.includes(member.id)).every(member=>member.status==='aboard'));
 const hostView=realm.snapshotFor(host,{drainEvents:false}),guestView=realm.snapshotFor(guest,{drainEvents:false});
 assert.ok(!JSON.stringify(hostView.state.voyageMemory).includes(report.id));assert.ok(JSON.stringify(guestView.state.voyageMemory).includes(report.id));
 assert.equal(realm._command(host,'acknowledgeRecoveryReport',{id:report.id,captainId:guest.id}).ok,false);
 assert.equal(guest.game.recoveryReport().arrival.acknowledged,false);
});

test('loss of an unattended personal hull preserves its survivors at the real recovery port without moving its absent captain',async()=>{
 const{realm,captains:[owner,host],vessels:[lost,safe]}=await fixture(2),crew=structuredClone(owner.game.state.crew);
 ok(realm._command(owner,'boardShip',{vesselId:safe.id}));
 const pose=structuredClone(owner.game.state.person),locationId=owner.game.state.locationId;
 realm._destroyVessel(lost);
 assert.equal(owner.aboard,safe.id);assert.equal(owner.game.state.locationId,locationId);assert.deepEqual(owner.game.state.person,pose);
 assert.equal(owner.game.state.medicalRecovery,undefined);assert.equal(owner.game.state.shipRecovery,undefined);
 assert.equal(owner.ownedVesselId,null);assert.equal(host.ownedVesselId,safe.id);
 const report=owner.game.recoveryReport();assert.ok(report?.id);
 const groups=owner.game.state.voyageMemory.recoveredCrews;
 assert.equal(groups.length,1);assert.deepEqual(survivorIds(groups[0].crew),survivorIds(crew));
 assert.ok(realm._crewFor(lost).every(member=>member.health<=0||member.dead));
 const before=owner.game.state.voyageMemory.incidents.length;realm._detachLostVessel(owner,lost);assert.equal(owner.game.state.voyageMemory.incidents.length,before);
});

test('acknowledgement is personal, durable, awards no duplicate reward, and cannot forge a new incident',async()=>{
 const{realm,captains:[c,other],vessels:[lost]}=await fixture(2);realm._destroyVessel(lost);
 const report=c.game.recoveryReport(),economy={credits:c.game.state.credits,rep:structuredClone(c.game.state.rep),rescues:c.game.state.stats.rescues},count=c.game.state.voyageMemory.incidents.length;
 const invalid=realm._command(c,'acknowledgeRecoveryReport',{id:'invented-incident',report:{destination:{systemId:'hearth',bodyId:'morrow'},reward:99999}});assert.equal(invalid.ok,false);
 assert.equal(realm._command(other,'acknowledgeRecoveryReport',{id:report.id,captainId:c.id}).ok,false);
 c.game.state.stats.time+=8;
 ok(await realm.command(c,'acknowledgeRecoveryReport',{id:report.id},'ack-once'));
 ok(await realm.command(c,'acknowledgeRecoveryReport',{id:report.id},'ack-once'));
 assert.equal((await realm.command(c,'acknowledgeRecoveryReport',{id:report.id},'ack-repeat')).ok,false);
 assert.deepEqual({credits:c.game.state.credits,rep:c.game.state.rep,rescues:c.game.state.stats.rescues},economy);
 assert.equal(c.game.state.voyageMemory.incidents.length,count);
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()}),patient=restored.captains.get(c.id);
 assert.equal(patient.game.recoveryReport(report.id).arrival.acknowledged,true);
 assert.equal(realm.snapshotFor(c,{compact:true,drainEvents:false}).state.medicalRecovery.id,c.game.state.medicalRecovery.id);
});

test('private whereabouts distinguish a remote personal berth from the occupied service deck on the reconstructed client',async()=>{
 const{realm,captains:[host,guest],vessels:[carrier,parked]}=await fixture(2);
 ok(realm._command(guest,'boardShip',{vesselId:carrier.id}));
 parked.systemId='hearth';parked.dockedAt='kettle';carrier.systemId='crosswind';realm._bindCaptain(guest);realm._bindCaptain(host);
 const snapshot=realm.snapshotFor(guest,{drainEvents:false}),client=Game.fromSave(snapshot.state),groups=client.crewWhereabouts().groups;
 assert.equal(snapshot.state.ship.id,carrier.id);assert.deepEqual(survivorIds(snapshot.state.crew),survivorIds(host.game.state.crew));
 const own=groups.find(group=>group.kind==='personal'),company=groups.find(group=>group.kind==='service');
 assert.equal(own.ship.id,parked.id);assert.equal(own.location.systemId,'hearth');assert.equal(own.location.bodyId,'kettle');assert.deepEqual(survivorIds(own.crew),survivorIds(guest.game.state.crew));
 assert.equal(company.ship.id,carrier.id);assert.equal(company.location.systemId,'crosswind');assert.deepEqual(survivorIds(company.crew),survivorIds(host.game.state.crew));
 const hostView=realm.snapshotFor(host,{drainEvents:false});assert.ok(!hostView.state.voyageView.crewWhereabouts.groups.some(group=>group.ship?.id===parked.id));
 assert.equal(realm.document().captains[guest.id].game.voyageView,undefined);
});

test('eight recovered people travel on a fitting real transport, retain wounds through restart, receive one return record, and rejoin with human roles first',async()=>{
 let{realm,captains:[c,one,two],vessels:[lost]}=await fixture(3);enlisted(c);
 const originalIds=survivorIds(c.game.state.crew),woundedId=c.game.state.crew[0].id;c.game.state.crew[0].health=37;c.game.state.crew[0].status='injured';
 crosswindLoss(realm,c,lost);const incidentId=c.game.recoveryReport().id,groupId=c.game.state.voyageMemory.recoveredCrews[0].id;
 assert.equal(c.game.state.medicalRecovery.destination.bodyId,'crosswind-vey');assert.equal(c.game.militaryRecoveryStatus().canBook,true);
 const economy={credits:c.game.state.credits,career:structuredClone(c.game.state.professions.careers.military)};
 ok(realm._command(c,'startMilitaryPassage',{systemId:'sol',bodyId:'earth',captainId:one.id}));
 let transport=realm.vessels.get(c.aboard),company=realm._crewFor(transport);const transportId=transport.id,passageId=c.game.state.npcContract.id;
 assert.equal(transport.ship.classId,'osprey');assert.equal(company.length,9);assert.deepEqual(survivorIds(company.filter(member=>member.recoveredPassenger)),originalIds);
 assert.equal(company.find(member=>member.id===woundedId).health,37);assert.equal(c.game.state.npcContract.destination.bodyId,'morrow');assert.equal(c.crewRole,'passenger');
 assert.equal(Boolean(realm._canBoard(one,transport)),false);assert.equal(realm._command(c,'takeStation',{role:'helm'}).ok,false);
 assert.equal(realm._command(c,'startMilitaryPassage',{}).ok,false);assert.equal(recoveredAt(c.game).length,0);
 const additionallyWounded=company.find(member=>member.recoveredPassenger&&member.id!==woundedId);additionallyWounded.health=22;additionallyWounded.status='injured';const additionallyWoundedId=additionallyWounded.id;
 for(let index=0;index<80;index++)realm.step(.1,realm.tick+1);
 const ids=[c.id,one.id,two.id],restored=new Realm({id:realm.id,persistence:storage(),snapshot:realm.document()});realm=restored;[c,one,two]=ids.map(id=>realm.captains.get(id));for(const captain of [c,one,two])ok(realm.attach(captain,{close(){}}));
 assert.equal(c.aboard,transportId);transport=realm.vessels.get(transportId);assert.equal(realm._crewFor(transport).find(member=>member.id===additionallyWoundedId).health,22);
 arrive(realm,c);Object.assign(c.game.state.person,cabinLayout(transport.ship.classId).spawn);ok(realm._command(c,'disembark',{}));
 assert.equal(c.game.state.systemId,'hearth');assert.equal(c.game.state.locationId,'morrow');assert.equal(c.ownedVesselId,null);
 const home={systemId:'hearth',bodyId:'morrow'},survivors=recoveredAt(c.game,home);assert.deepEqual(survivorIds(survivors),originalIds);
 assert.equal(survivors.find(member=>member.id===woundedId).health,37);assert.equal(survivors.find(member=>member.id===additionallyWoundedId).health,22);
 assert.equal(c.game.state.npcContractHistory.filter(entry=>entry.id===passageId).length,1);
 assert.equal(c.game.recoveryReport(incidentId).arrival.arrived,true);const returns=c.game.state.journal.filter(entry=>entry.title==='Returned after evacuation').length;
 assert.equal(returns,1);realm._landCharacter(c,'hearth','morrow');assert.equal(c.game.state.journal.filter(entry=>entry.title==='Returned after evacuation').length,returns);
 ok(realm._command(c,'acknowledgeRecoveryReport',{id:incidentId}));assert.equal(realm._command(c,'acknowledgeRecoveryReport',{id:incidentId}).ok,false);
 assert.deepEqual({credits:c.game.state.credits,career:c.game.state.professions.careers.military},economy);
 // Supply an earned replacement at the actual port. Rejoining never issues
 // the hull or relaxes its berths, access, or the other captains' stations.
 c.game.state.fleet.owned.push('osprey');c.game._activateClass('osprey',true);c.game.claimFirstShip();const replacement=realm._createVessel(c);replacement.allowCrew=true;
 for(const guest of [one,two]){realm._landCharacter(guest,'hearth','morrow');ok(realm._command(guest,'boardShip',{vesselId:replacement.id}));}
 assert.equal(realm._command(c,'rejoinRecoveredCrew',{groupId}).code,'capacity');
 Object.assign(two.game.state.person,cabinLayout(replacement.ship.classId).spawn);ok(realm._command(two,'disembark',{}));
 const station=realm._surface(one).entities.find(entity=>entity.data?.stationRole==='engineering');assert.ok(station);Object.assign(one.game.state.person,{x:station.x,y:station.y});ok(realm._command(one,'takeStation',{role:'engineering',entityId:station.id}));
 ok(realm._command(c,'rejoinRecoveredCrew',{groupId}));assert.equal(realm._command(c,'rejoinRecoveredCrew',{groupId}).ok,false);
 assert.equal(one.aboard,replacement.id);assert.equal(one.crewRole,'engineering');assert.ok(c.game.state.crew.every(member=>member.role!=='engineer'));
 assert.deepEqual(survivorIds(c.game.state.ship.casualCrew.records.filter(member=>member.health>0)),originalIds);assert.equal(c.game.state.ship.casualCrew.records.find(member=>member.id===woundedId).health,37);
 assert.equal(c.game.recoveredCrewAt('morrow','hearth').length,0);assert.ok(!realm._surface(c).entities.some(entity=>entity.data?.recoveredCrew));assert.ok(!realm.failed);
});

test('a second evacuation captures transport casualties before contract settlement and never duplicates passengers or adopts the service pilot',async()=>{
 const{realm,captains:[c],vessels:[lost]}=await fixture();enlisted(c);crosswindLoss(realm,c,lost);ok(realm._command(c,'startMilitaryPassage',{}));
 const transport=realm.vessels.get(c.aboard),company=realm._crewFor(transport),dead=company.find(member=>member.recoveredPassenger),wounded=company.find(member=>member.recoveredPassenger&&member.id!==dead.id),pilot=company.find(member=>!member.recoveredPassenger);
 dead.health=0;dead.dead=true;dead.status='dead';wounded.health=29;wounded.status='injured';
 realm._destroyVessel(transport);
 const recovered=recoveredAt(c.game);assert.equal(recovered.length,7);assert.equal(recovered.find(member=>member.id===wounded.id).health,29);assert.ok(!recovered.some(member=>member.id===dead.id||member.id===pilot.id));
 assert.ok(c.game.state.memorial.some(member=>member.crewId===dead.id));assert.ok(realm._crewFor(transport).every(member=>member.health<=0||member.dead));
 const archive=realm._inventoryFor(transport).formerCrew;assert.ok(archive.some(member=>member.id===pilot.id&&member.status==='evacuated'));
 assert.equal(c.game.state.voyageMemory.incidents.length,2);assert.equal(c.game.state.voyageMemory.recoveredCrews.length,1);
 const snapshot=realm.document(),restored=new Realm({id:realm.id,persistence:storage(),snapshot}),patient=restored.captains.get(c.id);
 assert.equal(recoveredAt(patient.game).length,7);assert.equal(recoveredAt(patient.game).find(member=>member.id===wounded.id).health,29);assert.ok(!recoveredAt(patient.game).some(member=>member.id===dead.id));assert.ok(!restored.failed);
});

test('one physical loss captures all occupants before evacuation and keeps the company’s hospital separate from a visiting captain’s hospital',async()=>{
 const{realm,captains:[owner,guest],vessels:[carrier,parked]}=await fixture(2);enlisted(owner);
 Object.assign(guest.game.state.professions.careers.military,{enlisted:true,factionId:'meridian',completed:1});Object.assign(guest.game.state.militaryCareer,{factionId:'meridian',branchId:'navy'});
 const companyIds=survivorIds(owner.game.state.crew),guestIds=survivorIds(guest.game.state.crew);ok(realm._command(guest,'boardShip',{vesselId:carrier.id}));
 crosswindLoss(realm,owner,carrier);
 assert.equal(owner.game.state.medicalRecovery.destination.factionId,'freewake');assert.equal(guest.game.state.medicalRecovery.destination.factionId,'meridian');
 const report=guest.game.recoveryReport(),company=report.crew.filter(member=>!member.personal&&companyIds.includes(member.id));
 assert.deepEqual(survivorIds(company),companyIds);assert.ok(company.every(member=>member.status==='recovered'&&member.location.factionId==='freewake'));
 assert.equal(report.recoveryDestination.factionId,'meridian');assert.equal(report.losses.shipLost,false);
 assert.deepEqual(survivorIds(recoveredAt(owner.game)),companyIds);assert.equal(recoveredAt(guest.game).length,0);assert.equal(guest.ownedVesselId,parked.id);assert.deepEqual(survivorIds(guest.game.state.crew),guestIds);
 const parkedRows=report.crew.filter(member=>member.personal);assert.deepEqual(survivorIds(parkedRows),guestIds);assert.ok(parkedRows.every(member=>member.location.systemId==='hearth'));
 assert.equal(owner.game.state.voyageMemory.incidents.length,1);assert.equal(guest.game.state.voyageMemory.incidents.length,1);assert.ok(!realm.failed);
});
