import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { MILITARY_RECRUITER, militaryBranch } from '../../dist/military-content.mjs';
import { isWalkable } from '../../dist/surface.mjs';
import { navyOperationStatus } from '../../dist/navy-operations.mjs';
import { navyDutyRoles } from '../../dist/navy-duty.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const tick=(realm,seconds=.1)=>{for(let n=0;n<Math.round(seconds*10);n++){const at=Date.now();realm.step(.1,realm.tick+1,at,at);}};
function recruiter(realm,captain){
 const entity=realm._surface(captain).entities.find(item=>item.id===MILITARY_RECRUITER.id);assert.ok(entity);
 Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});captain.game.state.pendingEncounter=null;return entity.id;
}
async function recruit(realm,name,completed=0){
 const {captain}=await realm.createCaptain(name,{startMode:'hardcore'});ok(realm.attach(captain,{close(){}}));
 ok(realm._command(captain,'militaryCareerAction',{action:'join',branchId:'navy',entityId:recruiter(realm,captain)}));
 Object.assign(captain.game.state.professions.careers.military,{completed,rankVersion:1,legacyRankFloor:0});return captain;
}
async function fixture({count=2,missionId='freewake-navy-battery',seed='navy-working-ship'}={}){
 const realm=new Realm({id:'NAVYWORK',seed,persistence:storage()}),captains=[];
 for(let index=0;index<count;index++)captains.push(await recruit(realm,index?'New recruit '+index:'Chief',index?0:16));
 const leader=captains[0];
 if(missionId!=='freewake-navy-battery')leader.game.state.militaryCareer.completed=militaryBranch('freewake','navy').missions.map(mission=>mission.id);
 const {operationId}=ok(realm._command(leader,'militaryCareerAction',{action:'createOperation',missionId,entityId:recruiter(realm,leader)}));
 for(const captain of captains.slice(1))ok(realm._command(captain,'militaryCareerAction',{action:'joinOperation',operationId,entityId:recruiter(realm,captain)}));
 ok(realm._command(leader,'militaryCareerAction',{action:'launchOperation',operationId}));
 const operation=realm.militaryOperations.operations[operationId],vessel=realm.vessels.get(operation.vesselId);
 return{realm,captains,leader,junior:captains[1],operation,vessel,contract:operation.contract};
}
const company=state=>state.vessel.inventory.crew.filter(member=>member.serviceCrew);
const crewPoses=surface=>surface.entities.filter(entity=>entity.type==='crew').map(entity=>({id:entity.data.crewId,x:entity.x,y:entity.y}));
function until(state,predicate,seconds=180){for(let n=0;n<seconds*10&&!predicate();n++)tick(state.realm);assert.ok(predicate(),JSON.stringify({phase:state.contract.phase,operation:state.contract.navy.operation}));}
const orderStatus=(state,captain=state.junior)=>navyOperationStatus(state.realm._actor(state.vessel),state.contract,{worker:captain.game});
function approachOrder(state,captain=state.junior){const task=orderStatus(state,captain).activeTask;assert.ok(task);Object.assign(captain.game.state.person,{x:task.target.x,y:task.target.y});return task;}
function order(state,taskId,choiceId,captain=state.junior,extra={}){return state.realm._command(captain,'npcContractAction',{action:'navyOrder',taskId,choiceId,...extra});}

test('a full human Navy roster shares one working ship company without consuming its service berths',async()=>{
 const state=await fixture({count:10}),{realm,captains,vessel}=state;
 assert.ok(company(state).length>=12,'A capital ship carries a real company across departments.');
 assert.equal(new Set(company(state).map(member=>member.id)).size,company(state).length);
 assert.equal(realm._berthsUsed(vessel),captains.length,'The Navy complement has its own accommodation; it does not displace the enlisted player roster.');
 for(const captain of captains){assert.equal(captain.aboard,vessel.id);assert.equal(realm._hasBerth(captain,vessel),true);assert.deepEqual(captain.game.state.crew,[],'The company never becomes a recruit’s personal hired crew.');}
 tick(realm,10);
 const surface=realm._surface(captains[0]),initial=crewPoses(surface),snapshot=realm.snapshotFor(captains[0],{compact:false,drainEvents:false});
 assert.equal(initial.length,company(state).length);
 assert.deepEqual(snapshot.state.crew.filter(member=>member.serviceCrew).map(member=>member.id),company(state).map(member=>member.id));
 tick(realm,5);
 assert.equal(realm._surface(captains[0]),surface,'Walking sailors reuse the existing capital-ship map.');
 const later=crewPoses(surface);
 assert.ok(later.some((pose,index)=>Math.hypot(pose.x-initial[index].x,pose.y-initial[index].y)>2),'Crew actually move on duty.');
 for(const captain of captains){
  const deck=realm._surface(captain);
  assert.deepEqual(crewPoses(deck),later,'Every crewmate sees the same canonical NPC positions.');
  for(const person of crewPoses(deck))assert.ok(isWalkable(deck,person.x,person.y),person.id+' stands on open deck.');
 }
 for(const compact of [false,true]){
  const packet=realm.snapshotFor(captains[1],{compact,drainEvents:false});
  assert.deepEqual(packet.state.interior.location.crew.filter(member=>member.serviceCrew).map(({id,x,y})=>({id,x,y})),company(state).map(({id,x,y})=>({id,x,y})));
 }
});

test('the ship company keeps injuries and identity through a realm restart without spawning replacements',async()=>{
 const state=await fixture(),{realm,vessel,contract,captains}=state;
 tick(realm,12);
 const crew=company(state);assert.ok(crew.length>=12);
 const injured=crew.find(member=>member.id!==contract.id+':pilot'),lost=crew.find(member=>member!==injured&&member.id!==contract.id+':pilot');
 injured.health=37;lost.health=0;lost.status='dead';lost.dead=true;
 const before=crew.map(({id,health,status})=>({id,health,status})),document=realm.document();
 const resumed=new Realm({id:realm.id,persistence:storage(),snapshot:document}),restored=resumed.vessels.get(vessel.id);
 for(const captain of captains)ok(resumed.attach(resumed.captains.get(captain.id),{close(){}}));
 tick(resumed,.1);
 assert.deepEqual(restored.inventory.crew.filter(member=>member.serviceCrew).map(({id,health,status})=>({id,health,status})),before);
 assert.equal(new Set(restored.inventory.crew.map(member=>member.id)).size,restored.inventory.crew.length);
 for(const captain of captains){
  const restoredCaptain=resumed.captains.get(captain.id);assert.deepEqual(restoredCaptain.game.state.crew,[],'Loading a captain keeps the employer company on its own vessel.');
  const entities=resumed._surface(restoredCaptain).entities.filter(entity=>entity.type==='crew');
  assert.ok(entities.some(entity=>entity.data.crewId===injured.id&&entity.data.health===37));
  assert.equal(entities.some(entity=>entity.data.crewId===lost.id),false);
 }
});

test('Navy procedures use the acting recruit’s identity, position and clearance, and pause when nobody is attending',async()=>{
 const state=await fixture({missionId:'freewake-navy-rescue-watch'}),{realm,leader,junior,vessel,contract}=state;
 contract.navy.attackPlanned=false;
 until(state,()=>contract.phase==='working');
 const op=contract.navy.operation;assert.equal(op.kind,'rescue');assert.equal(op.stageIndex,0);
 const task=orderStatus(state).activeTask;
 assert.equal(order(state,task.id,'live-beacon',junior,{x:task.target.x,y:task.target.y}).ok,false,'Client coordinates cannot replace the physical crew position.');
 approachOrder(state);const pose={x:junior.game.state.person.x,y:junior.game.state.person.y};
 const denied=[
  {name:'wrong deck',change:()=>{junior.game.state.interior.location.vesselId='different-ship';},restore:()=>{junior.game.state.interior.location.vesselId=vessel.id;}},
  {name:'downed',change:()=>{junior.game.state.person.down=true;},restore:()=>{junior.game.state.person.down=false;}},
  {name:'suspended',change:()=>{junior.game.state.rep.freewake=-25;},restore:()=>{junior.game.state.rep.freewake=0;}},
  {name:'revoked grant',change:()=>{vessel.grants[junior.id].allowed=false;},restore:()=>{vessel.grants[junior.id].allowed=true;}}
 ];
 for(const scenario of denied){scenario.change();assert.equal(order(state,task.id,'live-beacon').ok,false,scenario.name);assert.equal(op.tasks[0].running,false);assert.equal(op.stageIndex,0);scenario.restore();}
 assert.equal(order(state,'future-task','live-beacon').code,'task');
 assert.equal(order(state,task.id,{id:'live-beacon'}).code,'choice');
 assert.equal(order(state,task.id,'invented-order').code,'choice');
 ok(order(state,task.id,'live-beacon',junior,{playerId:leader.id,rank:99,progress:1}));
 assert.equal(op.tasks[0].startedBy,junior.id);assert.equal(contract.military.participants[junior.id].ordersIssued,1);assert.equal(contract.military.participants[leader.id].ordersIssued||0,0);
 assert.deepEqual(navyDutyRoles(junior.game),['weapons'],'A supervised task does not grant engineering or scanner clearance.');
 tick(realm,5);const served=op.tasks[0].elapsed;assert.ok(served>=4.99&&served<task.duration);
 realm.detach(junior,junior.session);tick(realm,4);assert.equal(op.tasks[0].elapsed,served);
 assert.equal(order(state,task.id,'live-beacon').ok,false,'An offline captain cannot issue orders.');
 ok(realm.attach(junior,{close(){}}));Object.assign(junior.game.state.person,pose);
 until(state,()=>op.stageIndex===1,12);
 assert.equal(op.tasks[0].done,true);assert.equal(order(state,task.id,'live-beacon').code,'task','A repeated completed order cannot duplicate credit.');
 const ids={leader:leader.id,junior:junior.id,vessel:vessel.id,operation:contract.id},document=realm.document();
 const restored=new Realm({id:realm.id,persistence:storage(),snapshot:document}),newLeader=restored.captains.get(ids.leader),newJunior=restored.captains.get(ids.junior),operation=restored.militaryOperations.operations[ids.operation];
 ok(restored.attach(newLeader,{close(){}}));ok(restored.attach(newJunior,{close(){}}));
 const resumed={realm:restored,leader:newLeader,junior:newJunior,vessel:restored.vessels.get(ids.vessel),operation,contract:operation.contract};
 assert.equal(newLeader.game.state.npcContract,newJunior.game.state.npcContract);assert.equal(operation.contract.navy.operation.stageIndex,1);
 assert.equal(operation.contract.navy.operation.tasks[0].startedBy,ids.junior);
 const next=approachOrder(resumed);assert.equal(next.id,'triage');ok(order(resumed,next.id,'urgent-first'));
 until(resumed,()=>operation.contract.navy.operation.stageIndex===2,22);
 assert.equal(operation.contract.military.participants[ids.leader].ordersIssued||0,0);
 assert.equal(operation.contract.military.participants[ids.junior].ordersIssued,2);
 assert.deepEqual(navyDutyRoles(newJunior.game),['weapons']);
});

test('unverified contacts stay under weapons hold, revealed reports survive public snapshots, and civilians see the actual objective ship',async()=>{
 const state=await fixture({missionId:'freewake-navy-traffic-identification'}),{realm,junior,vessel,contract}=state;
 contract.navy.attackPlanned=false;
 until(state,()=>contract.phase==='working');
 const op=contract.navy.operation;assert.equal(op.kind,'inspection');assert.equal(op.identified,false);
 approachOrder(state);ok(realm._command(junior,'enterGunnery',{}));
 assert.equal(realm._command(junior,'npcContractAction',{action:'fire'}).code,'rules-of-engagement');
 const {captain:civilian}=await realm.createCaptain('Uninvolved civilian',{startMode:'regular'});ok(realm.attach(civilian,{close(){}}));
 const observerVessel=realm.vessels.get(civilian.ownedVesselId);observerVessel.systemId=vessel.systemId;observerVessel.dockedAt=null;civilian.game.state.systemId=vessel.systemId;realm._bindCaptain(civilian);
 for(const compact of [false,true]){
  const view=realm.snapshotFor(junior,{compact,drainEvents:false});
  assert.equal(Object.hasOwn(view.state.npcContract.navy,'attackPlanned'),false);assert.equal(Object.hasOwn(view.state.npcContract.navy,'attackAt'),false);
  assert.equal(view.state.npcContract.navy.operation.report||'','');
  const visible=realm.snapshotFor(civilian,{compact,drainEvents:false});assert.ok(visible.world.parkedShips.some(ship=>ship.id===op.contacts[0].id),'The objective hull exists in the shared star system.');
 }
 assert.equal(realm._command(civilian,'npcContractAction',{action:'navyOrder',taskId:'compare',choiceId:'unverified',vesselId:vessel.id,operationId:contract.id}).ok,false);
 ok(order(state,'compare','unverified'));until(state,()=>op.stageIndex===1,16);
 approachOrder(state);ok(order(state,'challenge','challenge'));until(state,()=>op.stageIndex===2,22);
 assert.equal(op.identified,true);assert.ok(op.report);
 for(const compact of [false,true]){
  const view=realm.snapshotFor(junior,{compact,drainEvents:false});
  assert.equal(Object.hasOwn(view.state.npcContract.navy,'attackPlanned'),false);
  assert.equal(view.state.npcContract.navy.operation.report,op.report);
  const client={state:view.state,playerId:junior.id};assert.equal(navyOperationStatus(client,view.state.npcContract).report,op.report,'The visible report does not need the hidden encounter roll.');
 }
 approachOrder(state);assert.equal(order(state,'disposition','interceptor').code,'procedure');ok(order(state,'disposition','release'));
});

test('a protected objective destroyed by a real projectile stays lost across a restart between combat and mission evaluation',async()=>{
 let state=await fixture({missionId:'freewake-navy-rescue-watch',seed:'navy-objective-casualty'});
 state.contract.navy.attackPlanned=false;until(state,()=>state.contract.phase==='working');
 const ids={leader:state.leader.id,junior:state.junior.id,vessel:state.vessel.id,operation:state.contract.id},systemId=state.vessel.systemId;
 function restore(document){
  const realm=new Realm({id:'NAVYWORK',persistence:storage(),snapshot:document}),leader=realm.captains.get(ids.leader),junior=realm.captains.get(ids.junior),operation=realm.militaryOperations.operations[ids.operation];
  ok(realm.attach(leader,{close(){}}));ok(realm.attach(junior,{close(){}}));
  return{realm,leader,junior,operation,vessel:realm.vessels.get(ids.vessel),contract:operation.contract};
 }
 // Loading separates the persisted mission copy from the world hull. The
 // next authority step must bind the order back to that actual physical hull.
 state=restore(state.realm.document());
 const room=state.realm._room(systemId),targetId=state.contract.navy.operation.contacts[0].id,contact=room.runtime.parkedShips.find(ship=>ship.id===targetId);assert.ok(contact);
 room.runtime.bullets.push({id:'navy-objective-loss-shot',x:contact.x-12,y:contact.y,vx:200,vy:0,ttl:1,damage:contact.hull+contact.shield+100,owner:'hostile-test-ship',ownerId:'hostile-test-ship',targetVesselId:targetId,radius:4});
 tick(state.realm);
 assert.equal(contact.hull,0);assert.equal(contact.destroyed,true);assert.equal(room.runtime.parkedShips.some(ship=>ship.id===targetId),false);
 assert.equal(state.contract.navy.operation.contacts[0].hull,0,'The procedure remembers the destroyed physical hull, not its pre-hit saved copy.');
 state=restore(state.realm.document());tick(state.realm);
 assert.equal(state.contract.aborted,true);assert.equal(state.contract.phase,'returning');assert.equal(state.contract.work.done,false);assert.match(state.contract.failure,/lost/);
 assert.equal(state.realm._room(systemId).runtime.parkedShips.some(ship=>ship.id===targetId),false,'Reload cannot replace a destroyed objective.');
 assert.equal(state.contract.navy.operation.contacts[0].hull,0);
});
