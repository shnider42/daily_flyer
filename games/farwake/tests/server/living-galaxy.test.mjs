import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {Game} from '../../dist/engine.mjs';
import {WORLD_DIRECTOR_RULES,directorEvent} from '../../dist/world-director.mjs';
import {questThread} from '../../dist/quest-content.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function clock(t){let value=1_800_000_000_000;t.mock.method(Date,'now',()=>value);return{now:()=>value,advance(seconds){value+=seconds*1000;return value;}};}
function storage(){return{kind:'memory',snapshot:null,version:0,async save(id,version,snapshot){this.snapshot=structuredClone(snapshot);this.version=version+1;return{version:this.version};}};}
async function fixture(count=2,options={}){
 const persistence=storage(),realm=new Realm({id:'LIVING01',seed:options.seed||'living-authority',persistence}),captains=[];
 for(let index=0;index<count;index++){const{captain}=await realm.createCaptain(`Captain ${index+1}`,options.starterShip?{starterShip:options.starterShip}:{});ok(realm.attach(captain,{close(){}}));captains.push(captain);}
 const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];room.runtime.signals=[];
 return{realm,captains,persistence};
}
function step(realm,clock,seconds=0){clock.advance(seconds);realm.step(1/30,realm.tick+1,clock.now());}
function nextIncident(realm,time,type=null){
 for(let tries=0;tries<2880;tries++){
  step(realm,time,30);const incident=realm.director.events.find(event=>(!type||event.type===type)&&event.status==='active');
  if(incident)return incident;
 }
 assert.fail(`No active ${type||'incident'} occurred during a simulated day`);
}
function reachIncident(realm,captains,incident){
 for(const captain of captains){const vessel=realm.vessels.get(captain.ownedVesselId);vessel.systemId=incident.systemId;captain.game.state.systemId=incident.systemId;realm._bindCaptain(captain);}
 return realm._room(incident.systemId);
}
function walk(realm,captain,id){const entity=realm._surface(captain).entities.find(entity=>entity.id===id);assert.ok(entity,`${id} must exist at the current port`);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
async function launch(realm,captain){if(captain.game.state.mode==='ship')return;const exit=realm._surface(captain).entities.find(entity=>entity.type==='exit');assert.ok(exit);walk(realm,captain,exit.id);ok(await realm.command(captain,'launch'));}
async function land(realm,captain,bodyId='kettle'){
 await launch(realm,captain);const vessel=realm.vessels.get(captain.ownedVesselId),body=realm._room(vessel.systemId).runtime.bodies.find(body=>body.id===bodyId);assert.ok(body,bodyId);
 Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0,angularVelocity:0});ok(await realm.command(captain,'dock',{id:bodyId}));return realm._surface(captain);
}
async function enroll(realm,captain,professionId){const entityId=`quest:profession-desk:${captain.game.state.locationId}`;walk(realm,captain,entityId);if(!captain.game.state.professions.careers[professionId].enlisted)ok(await realm.command(captain,'enlistProfession',{professionId,entityId}));return entityId;}
async function startJob(realm,captain,professionId){const entityId=await enroll(realm,captain,professionId),offer=captain.game.professionBoard(entityId).offers.find(offer=>offer.professionId===professionId);assert.ok(offer);ok(await realm.command(captain,'professionAction',{action:'accept',jobId:offer.id,entityId}));return captain.game.state.professions.active;}
async function acceptStory(realm,captain,threadId,contactId){const entityId=`quest:${contactId}`;walk(realm,captain,entityId);return ok(await realm.command(captain,'threadAction',{threadId,action:'accept',entityId}));}
async function acceptFare(realm,captain){const entityId=`quest:passage-desk:${captain.game.state.locationId}`;walk(realm,captain,entityId);const offer=captain.game.passengerOffers()[0];assert.ok(offer);ok(await realm.command(captain,'acceptPassenger',{offerId:offer.id,entityId}));return captain.game.state.narrative.passenger;}
function triageOrder(puzzle){
 const clue=puzzle.clues.join(' '),names=/unstable cells/.test(clue)?['Aster','Celia','Bram']:/violet/.test(clue)?['Eli','Fenn','Daro']:['Iris','Gita','Holl'];
 return names.map(name=>{const option=puzzle.inputs[0].options.find(option=>option.label===name);assert.ok(option,name);return option.id;});
}
async function finishClinic(realm,captain,job){
 const entityId=`quest:profession-desk:${job.originBody}`;walk(realm,captain,entityId);
 for(let round=0;round<3;round++){const board=captain.game.professionBoard(entityId);assert.equal(board.active.puzzle.solution,undefined);ok(await realm.command(captain,'professionAction',{action:'triage',jobId:job.id,entityId,solution:triageOrder(board.active.puzzle)}));}
}
function fire(realm,captain,enemy,count=1){
 const vessel=realm.vessels.get(captain.ownedVesselId),actor=realm._actor(vessel),room=realm._room(vessel.systemId);
 Object.assign(vessel.ship,{x:enemy.x-155,y:enemy.y,angle:0,vx:0,vy:0,energy:vessel.ship.maxEnergy});
 for(let index=0;index<count;index++){actor._shotTimer=0;ok(actor.fireWeapons(captain.id));room.coordinator._updateBullets(.25,[actor]);}
}
async function bountyReady(realm,captain){
 await land(realm,captain,'kettle');await acceptStory(realm,captain,'paper_bounty','orin-dax');await land(realm,captain,'morrow');walk(realm,captain,'morrow:site:orchard-pump');ok(await realm.command(captain,'enterSite',{siteId:'orchard-pump'}));
 const stage=questThread('paper_bounty').stages[1];walk(realm,captain,stage.at.entityId);ok(await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'solve',entityId:stage.at.entityId,solution:stage.puzzle.solution}));
 walk(realm,captain,'morrow:site:orchard-pump:exit');ok(await realm.command(captain,'exitSite'));await launch(realm,captain);
 const record=captain.game.state.narrative.quests.paper_bounty,enemy=captain.game.system.enemies.find(enemy=>enemy.id===record.targetId);assert.ok(enemy);return enemy;
}

test('one director advances at wall-clock cadence with one or ten active captains',async t=>{
 const time=clock(t),small=await fixture(1),full=await fixture(10),initial=small.realm.director.revision;
 for(const seconds of[1,4,40,135,45,720,390,200,600,3600]){
  time.advance(seconds);for(const {realm}of[small,full])realm.step(1/30,realm.tick+1,time.now());
  assert.deepEqual(full.realm.director,small.realm.director,'adding pilots must not accelerate the event clock');
  for(const captain of full.captains)assert.equal(captain.game.worldDirector,full.realm.director);
 }
 assert.equal(full.realm.director.revision,initial+9);assert.ok(full.realm.director.cycle>=0);assert.ok(full.realm.director.events.length+full.realm.director.history.length>0);assert.ok([...full.realm.director.events,...full.realm.director.history].every(event=>event.systemId!=='hearth'||!['raid','clash'].includes(event.type)));
 const revision=full.realm.director.revision;for(let tick=0;tick<40;tick++)full.realm.step(1/30,full.realm.tick+1,time.now());assert.equal(full.realm.director.revision,revision,'render/simulation frequency does not advance the wall clock');
 for(const vessel of full.realm.vessels.values())if(vessel.actor)assert.equal(vessel.actor.worldDirector,full.realm.director);
});

test('local events resolve while everybody is offline and restart catches up with bounded state',async t=>{
 const time=clock(t),{realm,captains,persistence}=await fixture(2),firstId=nextIncident(realm,time).id;
 for(const captain of captains)realm.detach(captain,captain.session);assert.equal(realm.onlineCount,0);
 step(realm,time,WORLD_DIRECTOR_RULES.eventSeconds+10);
 assert.equal(directorEvent(realm.director,firstId).outcome,'unassisted');assert.ok(realm.director.cycle>=0);assert.equal(realm.onlineCount,0);
 realm.markDirty();await realm.flush();const saved=structuredClone(persistence.snapshot),priorCycle=saved.director.cycle;
 time.advance(365*24*3600);const restored=new Realm({id:realm.id,snapshot:saved,persistence,version:persistence.version});
 assert.equal(restored.director.time,time.now()/1000);assert.ok(restored.director.cycle>priorCycle+20000);assert.ok(restored.director.skippedCycles>0);
 assert.ok(restored.director.events.length<=WORLD_DIRECTOR_RULES.maxEvents);assert.ok(restored.director.history.length<=WORLD_DIRECTOR_RULES.maxHistory);assert.ok(Object.keys(restored.director.conditions).length<=WORLD_DIRECTOR_RULES.maxConditions);
 assert.equal(new Set([...restored.director.events,...restored.director.history].map(event=>event.id)).size,restored.director.events.length+restored.director.history.length);
 const current=structuredClone(restored.director);restored.step(1/30,1,time.now());assert.deepEqual(restored.director,current);assert.equal(restored.onlineCount,0);
});

test('physical clinic shifts contribute once to one event shared by all captains and persist relief payments',async t=>{
 const time=clock(t),{realm,captains:[one,two],persistence}=await fixture(2);
 const incident=nextIncident(realm,time,'rescue');reachIncident(realm,[one,two],incident);
 for(const captain of[one,two])await land(realm,captain,incident.bodyId);
 for(const captain of[one,two]){
  const job=await startJob(realm,captain,'doctor');assert.equal(job.eventId,incident.id);const entityId=`quest:profession-desk:${incident.bodyId}`,before=captain.game.state.credits;
  assert.equal((await realm.command(captain,'professionAction',{action:'triage',jobId:job.id,entityId,solution:['invented','invented','invented']})).code,'puzzle');assert.equal(captain.game.state.credits,before);assert.equal(job.round,0);
  await finishClinic(realm,captain,job);assert.equal((await realm.command(captain,'professionAction',{action:'triage',jobId:job.id,entityId,solution:[]})).ok,false);assert.equal(directorEvent(realm.director,incident.id).contributors[captain.id].aid,1);
 }
 assert.equal(directorEvent(realm.director,incident.id).progress,2);
 const before=realm.snapshotFor(one,{drainEvents:false}).state.worldDirector;assert.deepEqual(before,realm.snapshotFor(two,{drainEvents:false}).state.worldDirector);before.events.find(event=>event.id===incident.id).progress=999;assert.equal(directorEvent(realm.director,incident.id).progress,2);
 step(realm,time,5);const resolved=directorEvent(realm.director,incident.id);assert.equal(resolved.outcome,'stabilized');assert.equal(resolved.status,'resolved');
 for(const captain of[one,two]){
  const entityId=`quest:profession-desk:${incident.bodyId}`,before=captain.game.state.credits;walk(realm,captain,entityId);const paid=ok(await realm.command(captain,'professionAction',{action:'claimRelief',eventId:incident.id,entityId}));assert.equal(paid.paid,45);assert.equal(captain.game.state.credits,before+45);assert.equal((await realm.command(captain,'professionAction',{action:'claimRelief',eventId:incident.id,entityId})).code,'contribution');
 }
 await realm.flush();const restored=new Realm({id:realm.id,snapshot:structuredClone(persistence.snapshot),persistence,version:persistence.version});
 const recovered=directorEvent(restored.director,incident.id);assert.equal(recovered.progress,2);for(const captain of[one,two])assert.equal(recovered.contributors[captain.id].claimed,true);
});

test('one physical raid and authoritative projectile collisions credit the actual shooters once',async t=>{
 const time=clock(t),{realm,captains:[one,two,observer]}=await fixture(3);
 const raid=nextIncident(realm,time,'raid'),room=reachIncident(realm,[one,two,observer],raid);assert.notEqual(raid.systemId,'hearth');
 const targets=room.runtime.enemies.filter(enemy=>enemy.directorEventId===raid.id);assert.equal(targets.length,2);for(let n=0;n<8;n++)for(const captain of[one,two,observer])realm._bindCaptain(captain);assert.equal(room.runtime.enemies.filter(enemy=>enemy.directorEventId===raid.id).length,2);
 for(const enemy of room.runtime.enemies)Object.assign(enemy,{x:-2000,y:-2000,speed:0,cooldown:999});Object.assign(targets[0],{x:900,y:700});Object.assign(targets[1],{x:1500,y:700});
 fire(realm,one,targets[0]);fire(realm,two,targets[0]);fire(realm,one,targets[0]);assert.equal(targets[0].disabled,true);
 let evidence=directorEvent(realm.director,raid.id);assert.equal(evidence.progress,1);assert.equal(evidence.contributors[one.id].damage,32);assert.equal(evidence.contributors[two.id].damage,16);assert.equal(evidence.contributors[observer.id],undefined);
 fire(realm,one,targets[0]);assert.equal(evidence.progress,1,'hitting an already disabled raider must not count a second ship');fire(realm,two,targets[1],4);assert.equal(evidence.progress,2);
 for(const captain of[one,two,observer])assert.equal(realm.snapshotFor(captain,{drainEvents:false}).state.worldDirector.events.find(event=>event.id===raid.id).progress,2);
 step(realm,time,5);evidence=directorEvent(realm.director,raid.id);assert.equal(evidence.outcome,'stabilized');assert.equal(evidence.neutralized.length,2);assert.equal(evidence.contributors[observer.id],undefined);
 assert.ok(room.runtime.enemies.some(enemy=>enemy.id===targets[1].id&&enemy.disabled),'a damaged physical hull remains after its incident resolves');
});

test('story passengers and patients reserve berths against fares, hired crew and human boarding',async t=>{
 clock(t);const{realm,captains:[captain,friend]}=await fixture(2,{starterShip:'kestrel'});await land(realm,captain,'kettle');await acceptStory(realm,captain,'last_fare','len-vale');
 assert.equal(captain.game.narrativeBerths(),1);const job=await startJob(realm,captain,'paramedic');await land(realm,captain,job.targetBody);const entityId=`quest:profession-desk:${job.targetBody}`;walk(realm,captain,entityId);ok(await realm.command(captain,'professionAction',{action:'pickupPatient',jobId:job.id,entityId}));
 assert.equal(captain.game.professionBerths(),1);assert.equal(captain.game.freeBerths,0);const fareId=`quest:passage-desk:${job.targetBody}`;walk(realm,captain,fareId);const fare=captain.game.passengerOffers()[0];assert.equal(fare.available,false);assert.equal((await realm.command(captain,'acceptPassenger',{offerId:fare.id,entityId:fareId})).code,'capacity');
 assert.equal(captain.game.recruitCrew('engineer').code,'capacity');await launch(realm,captain);ok(await realm.command(captain,'setCrewAccess',{allowed:true}));
 const vessel=realm.vessels.get(captain.ownedVesselId),other=realm.vessels.get(friend.ownedVesselId);Object.assign(other.ship,{x:vessel.ship.x+100,y:vessel.ship.y,vx:0,vy:0});assert.equal((await realm.command(friend,'boardShip',{vesselId:vessel.id})).code,'capacity');assert.equal(friend.aboard,other.id);
 // A reservation does not vanish when its owner reconnects.
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence});const returned=restored.captains.get(captain.id);assert.equal(returned.game.narrativeBerths(),1);assert.equal(returned.game.professionBerths(),1);assert.equal(returned.game.freeBerths,0);
});

test('a paid fare also blocks overbooking a story passenger or medical dispatch',async t=>{
 clock(t);const{realm,captains:[captain]}=await fixture(1,{starterShip:'kestrel'});await land(realm,captain,'kettle');captain.game.state.credits=2000;ok(captain.game.recruitCrew('engineer'));await acceptFare(realm,captain);assert.equal(captain.game.freeBerths,0);
 walk(realm,captain,'quest:len-vale');assert.equal((await realm.command(captain,'threadAction',{threadId:'last_fare',action:'accept',entityId:'quest:len-vale'})).code,'capacity');
 const entityId=await enroll(realm,captain,'paramedic'),offer=captain.game.professionBoard(entityId).offers.find(offer=>offer.professionId==='paramedic'),before=captain.game.state.credits;assert.equal((await realm.command(captain,'professionAction',{action:'accept',jobId:offer.id,entityId})).code,'capacity');assert.equal(captain.game.state.credits,before);assert.equal(captain.game.state.professions.active,null);
});

test('remote foot travel cannot deliver a fare or pick up a patient left with the owner’s parked hull',async t=>{
 clock(t);const{realm,captains:[captain]}=await fixture(1);await land(realm,captain,'kettle');await acceptStory(realm,captain,'last_fare','len-vale');walk(realm,captain,'quest:passenger-slip');ok(await realm.command(captain,'threadAction',{threadId:'last_fare',action:'advance',entityId:'quest:passenger-slip'}));
 const fare=await acceptFare(realm,captain),job=await startJob(realm,captain,'paramedic'),owned=realm.vessels.get(captain.ownedVesselId),before=captain.game.state.credits;
 assert.equal(fare.targetBody,job.targetBody);realm._landCharacter(captain,job.targetSystem,job.targetBody);const passDesk=`quest:passage-desk:${fare.targetBody}`;walk(realm,captain,passDesk);
 assert.equal((await realm.command(captain,'deliverPassenger',{entityId:passDesk})).code,'vessel');const medDesk=`quest:profession-desk:${job.targetBody}`;walk(realm,captain,medDesk);assert.equal((await realm.command(captain,'professionAction',{action:'pickupPatient',jobId:job.id,entityId:medDesk})).code,'vessel');
 walk(realm,captain,'quest:mara-reed');assert.equal((await realm.command(captain,'threadAction',{threadId:'last_fare',action:'advance',entityId:'quest:mara-reed'})).code,'vessel');assert.equal(captain.game.state.narrative.quests.last_fare.stage,2);
 assert.equal(owned.dockedAt,'kettle');assert.equal(captain.game.state.credits,before);assert.equal(captain.game.state.narrative.passenger.id,fare.id);assert.equal(job.phase,'pickup');
 realm._landCharacter(captain,'hearth','kettle');await land(realm,captain,job.targetBody);walk(realm,captain,medDesk);ok(await realm.command(captain,'professionAction',{action:'pickupPatient',jobId:job.id,entityId:medDesk}));walk(realm,captain,passDesk);ok(await realm.command(captain,'deliverPassenger',{entityId:passDesk}));
 realm._landCharacter(captain,'hearth',job.originBody);const originDesk=`quest:profession-desk:${job.originBody}`;walk(realm,captain,originDesk);assert.equal((await realm.command(captain,'professionAction',{action:'admitPatient',jobId:job.id,entityId:originDesk})).code,'vessel');assert.equal(job.phase,'admit');
 realm._landCharacter(captain,'hearth',job.targetBody);await land(realm,captain,job.originBody);walk(realm,captain,originDesk);const paid=ok(await realm.command(captain,'professionAction',{action:'admitPatient',jobId:job.id,entityId:originDesk}));assert.ok(paid.paid>0);assert.equal(captain.game.professionBerths(),0);assert.equal((await realm.command(captain,'professionAction',{action:'admitPatient',jobId:job.id,entityId:originDesk})).ok,false);
});

test('destruction closes patient transport before changing the carrier identity and cannot pay the failed dispatch',async t=>{
 clock(t);const{realm,captains:[captain]}=await fixture(1);await land(realm,captain,'kettle');const job=await startJob(realm,captain,'paramedic');await land(realm,captain,job.targetBody);const entityId=`quest:profession-desk:${job.targetBody}`;walk(realm,captain,entityId);ok(await realm.command(captain,'professionAction',{action:'pickupPatient',jobId:job.id,entityId}));
 assert.equal(captain.game.professionBerths(),1);await launch(realm,captain);const originalId=captain.ownedVesselId,vessel=realm.vessels.get(originalId),before=captain.game.state.credits;
 realm._actor(vessel)._damageShip(100000,{sourceId:'test-impact'});
 assert.equal(vessel.destroyed,true);assert.equal(vessel.ship.hull,0);assert.notEqual(captain.ownedVesselId,originalId);assert.equal(captain.game.state.professions.active,null);assert.equal(captain.game.professionBerths(),0);assert.equal(captain.game.state.professions.history[0].id,job.id);assert.equal(captain.game.state.professions.history[0].paid,0);assert.equal(captain.game.state.credits,before);
 const desk=`quest:profession-desk:${captain.game.state.locationId}`;walk(realm,captain,desk);assert.equal((await realm.command(captain,'professionAction',{action:'admitPatient',jobId:job.id,entityId:desk})).ok,false);
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence});const saved=restored.captains.get(captain.id);assert.equal(saved.game.state.professions.active,null);assert.equal(saved.game.state.professions.history[0].paid,0);assert.equal(restored.vessels.get(originalId).destroyed,true);
});

test('a patient dispatch also closes when its physical hull is destroyed while the owner is aboard a friend’s ship',async t=>{
 clock(t);const{realm,captains:[captain,friend]}=await fixture(2);await land(realm,captain,'kettle');const job=await startJob(realm,captain,'paramedic');await land(realm,captain,job.targetBody);const entityId=`quest:profession-desk:${job.targetBody}`;walk(realm,captain,entityId);ok(await realm.command(captain,'professionAction',{action:'pickupPatient',jobId:job.id,entityId}));await launch(realm,captain);
 const carrier=realm.vessels.get(captain.ownedVesselId),friendShip=realm.vessels.get(friend.ownedVesselId);Object.assign(friendShip.ship,{x:carrier.ship.x+100,y:carrier.ship.y,vx:0,vy:0});ok(await realm.command(friend,'setCrewAccess',{allowed:true}));ok(await realm.command(captain,'boardShip',{vesselId:friendShip.id}));assert.equal(captain.aboard,friendShip.id);
 const before=captain.game.state.credits;realm._actor(carrier)._damageShip(100000,{sourceId:'test-third-party'});
 assert.equal(carrier.destroyed,true);assert.equal(captain.aboard,friendShip.id,'destroying the separate carrier must not teleport its owner');assert.equal(captain.game.state.professions.active,null,'a patient cannot remain locked to a destroyed hull');assert.equal(captain.game.professionBerths(),0);assert.equal(captain.game.state.professions.history[0].paid,0);assert.equal(captain.game.state.credits,before);
});

test('bounty surrender needs a disabled unoccupied nearby hull and custody settlement needs its actual carrier',async t=>{
 clock(t);const{realm,captains:[captain,friend]}=await fixture(2),enemy=await bountyReady(realm,captain),owned=realm.vessels.get(captain.ownedVesselId),record=captain.game.state.narrative.quests.paper_bounty;
 Object.assign(owned.ship,{x:enemy.x-150,y:enemy.y});assert.equal((await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'capture'})).code,'requirements');fire(realm,captain,enemy,3);assert.equal(enemy.disabled,true);
 enemy.canonicalVesselId=friend.ownedVesselId;assert.equal((await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'capture'})).code,'occupied');delete enemy.canonicalVesselId;
 owned.ship.x=enemy.x-500;assert.equal((await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'capture'})).code,'distance');owned.ship.x=enemy.x-155;
 const original=owned.helmOwner;owned.helmOwner=friend.id;assert.equal((await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'capture'})).code,'helm');owned.helmOwner=original;
 ok(await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'capture'}));assert.equal(record.huntOutcome,'captured');assert.equal(captain.game.narrativeBerths(),1);assert.ok(!realm._room('hearth').runtime.enemies.some(value=>value.id===enemy.id));
 await land(realm,captain,'morrow');realm._landCharacter(captain,'hearth','kettle');walk(realm,captain,'quest:orin-dax');const before=captain.game.state.credits;
 assert.equal((await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'choose',choiceId:'hearing',entityId:'quest:orin-dax'})).code,'vessel');assert.equal(captain.game.state.credits,before);assert.equal(captain.game.narrativeBerths(),1);
 realm._landCharacter(captain,'hearth','morrow');await land(realm,captain,'kettle');walk(realm,captain,'quest:orin-dax');ok(await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'choose',choiceId:'hearing',entityId:'quest:orin-dax'}));assert.equal(captain.game.narrativeBerths(),0);assert.equal(captain.game.state.credits,before+240);
});

test('a story sensor reading uses the actual helm vessel rather than the captain’s parked owned hull',async t=>{
 clock(t);const{realm,captains:[captain,friend]}=await fixture(2),owned=realm.vessels.get(captain.ownedVesselId),shared=realm.vessels.get(friend.ownedVesselId),definition=questThread('borrowed_time'),stageIndex=definition.stages.findIndex(stage=>stage.kind==='ship-scan'),reading=definition.stages[stageIndex].at;
 for(const vessel of[owned,shared]){vessel.systemId='umbra';Object.assign(vessel.ship,{x:reading.x+(vessel===shared?100:0),y:reading.y,vx:0,vy:0});}for(const player of[captain,friend])realm._bindCaptain(player);realm._room('umbra').runtime.enemies=[];
 // A legitimate saved quest at its sensor step isolates authority geometry from
 // the unrelated preceding conversations and their moral choices.
 captain.game.state.narrative.quests.borrowed_time={status:'active',stage:stageIndex,choices:{},solved:[],rewardQuote:definition.reward,startedAt:0,finishedAt:null,targetId:null,huntOutcome:null,shipId:owned.id,outcome:null};
 ok(await realm.command(friend,'setCrewAccess',{captainId:captain.id,allowed:true,roles:['helm']}));ok(await realm.command(friend,'enterCabin'));ok(await realm.command(captain,'boardShip',{vesselId:shared.id}));
 assert.equal((await realm.command(captain,'threadAction',{threadId:'borrowed_time',action:'advance'})).code,'helm','a passenger cannot take a helm-only reading');
 const helm=realm._surface(captain).entities.find(entity=>entity.data?.stationRole==='helm');walk(realm,captain,helm.id);ok(await realm.command(captain,'takeStation',{role:'helm',entityId:helm.id}));
 Object.assign(shared.ship,{x:-1000,y:1000});assert.equal((await realm.command(captain,'threadAction',{threadId:'borrowed_time',action:'advance'})).code,'distance','parking the owned hull at the sensor point cannot satisfy a different ship’s reading');assert.equal(captain.game.state.narrative.quests.borrowed_time.stage,stageIndex);
 Object.assign(owned.ship,{x:-1600,y:-1000});Object.assign(shared.ship,{x:reading.x,y:reading.y});ok(await realm.command(captain,'threadAction',{threadId:'borrowed_time',action:'advance'}));assert.equal(captain.game.state.narrative.quests.borrowed_time.stage,stageIndex+1);assert.equal(captain.game.state.ship,owned.ship,'temporary helm context must restore the owned hull reference');assert.equal(captain.aboard,shared.id);
});

test('black-hole acceleration and damage agree between solo and the canonical shared hull',async t=>{
 const time=clock(t),{realm,captains:[captain]}=await fixture(1),vessel=realm.vessels.get(captain.ownedVesselId);vessel.systemId='umbra';captain.game.state.systemId='umbra';realm._bindCaptain(captain);const room=realm._room('umbra');room.runtime.enemies=[];room.runtime.bullets=[];room.runtime.signals=[];
 const hole=room.runtime.bodies.find(body=>body.kind==='blackhole');assert.ok(hole);const solo=new Game(realm.seed);solo.state.systemId='umbra';solo._loadSystem('umbra');solo.system.enemies=[];solo.system.bullets=[];solo.system.signals=[];
 const pose={x:hole.x+100,y:hole.y,angle:0,vx:0,vy:0,angularVelocity:0,shield:0};Object.assign(vessel.ship,pose);Object.assign(solo.state.ship,structuredClone(vessel.ship));
 for(let frame=0;frame<6;frame++){solo.step(1/30,{});step(realm,time);}
 for(const key of['x','y','vx','vy','hull','shield'])assert.ok(Math.abs(solo.state.ship[key]-vessel.ship[key])<1e-8,`${key}: solo=${solo.state.ship[key]} shared=${vessel.ship[key]}`);
 assert.ok(vessel.ship.hull<vessel.ship.maxHull);assert.ok(vessel.ship.vx<0);assert.equal(realm.snapshotFor(captain,{drainEvents:false}).state.cosmicWarning?.id,hole.id);
});
