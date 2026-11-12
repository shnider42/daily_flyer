import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { MILITARY_RECRUITER, militaryBranch } from '../../dist/military-content.mjs';
import { militaryServiceRank } from '../../dist/military-ranks.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';

const ok=value=>{assert.equal(value?.ok,true,value?.reason||JSON.stringify(value));return value;};
const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const session=()=>({close(){}});
function atRecruiter(realm,captain){const entity=realm._surface(captain).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);assert.ok(entity);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});captain.game.state.pendingEncounter=null;return entity.id;}
async function member(realm,name,{branch='army',completed=0}={}){
 const{captain}=await realm.createCaptain(name,{startMode:'hardcore'});ok(realm.attach(captain,session()));
 ok(await realm.command(captain,'militaryCareerAction',{action:'join',branchId:branch,entityId:atRecruiter(realm,captain)}));
 // Older members' personal completed records are fixture inputs; actual promotion
 // and duplicate-payout paths are exercised in military-ranks.test.mjs.
 captain.game.state.professions.careers.military.completed=completed;
 return captain;
}
const orders=(realm,captain,action,args={},requestId='')=>realm.command(captain,'militaryCareerAction',{action,...args},requestId);
const create=async(realm,captain,missionId)=>ok(await orders(realm,captain,'createOperation',{missionId})).operationId;
const field=()=>new Realm({id:'RANK014',seed:'rank-authority',persistence:storage()});

test('higher-ranked members take operation leadership while each new recruit retains their own rank and permissions',async()=>{
 const realm=field(),first=await member(realm,'First recruit'),senior=await member(realm,'Senior',{completed:8}),second=await member(realm,'Second recruit');
 const id=await create(realm,first,'freewake-army-range');const original=realm.militaryOperations.operations[id];assert.equal(original.leaderId,first.id);
 ok(await orders(realm,senior,'joinOperation',{operationId:id,captainId:first.id,rankIndex:0}));
 ok(await orders(realm,second,'joinOperation',{operationId:id,captainId:senior.id,role:'leader',rankIndex:4}));
 assert.equal(original.leaderId,senior.id);assert.equal(first.game.state.militaryCareer.active.leaderId,senior.id);assert.equal(second.game.state.militaryCareer.active.role,'member');
 assert.equal((await orders(realm,first,'launchOperation',{operationId:id,captainId:senior.id,rankIndex:4})).code,'military-command');
 assert.equal((await orders(realm,second,'launchOperation',{operationId:id,leaderId:second.id})).code,'military-command');
 const snapshot=realm.snapshotFor(second,{drainEvents:false}),roster=snapshot.state.militaryOperationsView.operation.roster;
 assert.deepEqual(roster.map(person=>person.rankIndex),[0,2,0]);assert.equal(roster.find(person=>person.captainId===senior.id).role,'Operation leader');
 assert.equal(snapshot.presence.find(person=>person.captainId===first.id).military.rank,'Recruit');assert.equal(snapshot.presence.find(person=>person.captainId===senior.id).military.rank,'Corporal');
 ok(await orders(realm,senior,'launchOperation',{operationId:id}));assert.equal(original.phase,'active');
 assert.equal(first.game.state.militaryCareer.active.operationId,second.game.state.militaryCareer.active.operationId);
 assert.equal((await orders(realm,first,'leaveOperation',{operationId:id})).code,'military-departed');
 const late=await member(realm,'Late recruit');assert.equal(militaryServiceRank(late.game).rankIndex,0);
 assert.equal((await orders(realm,late,'joinOperation',{operationId:id})).code,'military-departed');assert.equal(late.game.state.militaryCareer.active,null);
 assert.equal(militaryServiceRank(senior.game).completed,8);assert.equal(militaryServiceRank(first.game).completed,0);assert.ok(!realm.failed);
});

test('a recruit may join a senior Navy deployment but cannot authorize departure, take senior stations, cancel the carrier, or grant a visitor access',async()=>{
 const realm=field(),leader=await member(realm,'Petty officer',{branch:'navy',completed:8}),recruit=await member(realm,'Recruit',{branch:'navy'}),soldier=await member(realm,'Infantry',{branch:'army'}),visitor=await member(realm,'Visitor',{branch:'navy'});
 const denied=await orders(realm,recruit,'createOperation',{missionId:'freewake-navy-sable-watch',rankIndex:4,completed:999,captainId:leader.id});assert.equal(denied.code,'military-rank');assert.equal(recruit.game.state.militaryCareer.active,null);
 const id=await create(realm,leader,'freewake-navy-sable-watch');
 assert.equal((await orders(realm,soldier,'joinOperation',{operationId:id,branchId:'navy'})).code,'military-branch');
 recruit.game.state.person.x+=120;assert.equal((await orders(realm,recruit,'joinOperation',{operationId:id})).code,'distance');atRecruiter(realm,recruit);
 ok(await orders(realm,recruit,'joinOperation',{operationId:id,role:'leader',rankIndex:4}));
 assert.equal(militaryServiceRank(recruit.game).rankIndex,0);assert.equal(recruit.game.state.militaryCareer.active.missionId,'freewake-navy-sable-watch');
 realm.detach(recruit,recruit.session);assert.equal((await orders(realm,leader,'launchOperation',{operationId:id})).code,'military-muster');
 ok(realm.attach(recruit,session()));atRecruiter(realm,recruit);recruit.game.state.rep.freewake=-25;
 assert.equal((await orders(realm,leader,'launchOperation',{operationId:id})).code,'military-muster');recruit.game.state.rep.freewake=0;
 recruit.game.state.person.down=true;assert.equal((await orders(realm,leader,'launchOperation',{operationId:id})).code,'military-muster');recruit.game.state.person.down=false;
 ok(await orders(realm,leader,'launchOperation',{operationId:id}));const operation=realm.militaryOperations.operations[id],carrier=realm.vessels.get(operation.vesselId);
 assert.equal(leader.aboard,recruit.aboard);assert.equal(recruit.game.state.npcContract,operation.contract);assert.deepEqual(carrier.grants[recruit.id].roles,['weapons']);assert.deepEqual(carrier.grants[leader.id].roles,['weapons','scanner','engineering']);
 for(const [captain,rank]of[[leader,'Petty officer'],[recruit,'Recruit']]){
  const commander=realm._surface(captain).entities.find(entity=>entity.name==='Commander Isen');assert.ok(commander);Object.assign(captain.game.state.person,{x:commander.x,y:commander.y});
  const spoken=ok(await realm.command(captain,'surfaceAction',{entityId:commander.id,action:'talk'}));assert.ok(spoken.dialogue.greeting.startsWith(`${rank},`),spoken.dialogue.greeting);
 }
 // The NPC's employer comes from the carrier, never the viewer's own faction.
 const commander=realm._surface(recruit).entities.find(entity=>entity.name==='Commander Isen');
 recruit.game.state.professions.careers.military.factionId='meridian';recruit.game.state.militaryCareer.factionId='meridian';
 const foreignSpeech=ok(await realm.command(recruit,'surfaceAction',{entityId:commander.id,action:'talk'}));assert.equal(foreignSpeech.dialogue.militaryRank,null);assert.ok(!foreignSpeech.dialogue.greeting.startsWith('Recruit,'));
 recruit.game.state.professions.careers.military.factionId='freewake';recruit.game.state.militaryCareer.factionId='freewake';
 assert.equal((await realm.command(recruit,'cancelNpcContract',{captainId:leader.id,role:'leader'})).code,'military-command');
 Object.assign(recruit.game.state.person,cabinLayout(carrier.ship.classId).stations.engineering);
 assert.equal((await realm.command(recruit,'takeStation',{role:'engineering'})).code,'permission');
 assert.equal((await realm.command(leader,'quickHelm',{})).ok,false);assert.equal((await realm.command(recruit,'quickHelm',{})).ok,false);
 assert.equal((await realm.command(recruit,'setCrewAccess',{vesselId:carrier.id,captainId:visitor.id,allowed:true,roles:['helm','weapons']})).ok,false);
 assert.equal((await realm.command(visitor,'boardShip',{vesselId:carrier.id,operationId:id,employeeId:leader.id})).ok,false);
 ok(await realm.command(leader,'cancelNpcContract',{}));assert.equal(operation.contract.aborted,true);assert.equal(operation.contract.phase,'docked');
 assert.equal(militaryServiceRank(recruit.game).completed,0);assert.equal(militaryServiceRank(leader.game).completed,8);assert.ok(!realm.failed);
});

test('muster membership, leader changes and individual service records persist across restart without duplicate operations',async()=>{
 let realm=field();let junior=await member(realm,'Junior',{completed:3}),senior=await member(realm,'Senior',{completed:16}),recruit=await member(realm,'Recruit');
 const made=ok(await orders(realm,junior,'createOperation',{missionId:'freewake-army-border-watch'},'make-watch')),id=made.operationId;
 ok(await orders(realm,junior,'createOperation',{missionId:'freewake-army-border-watch'},'make-watch'));assert.equal(Object.keys(realm.militaryOperations.operations).length,1);
 ok(await orders(realm,senior,'joinOperation',{operationId:id}));ok(await orders(realm,recruit,'joinOperation',{operationId:id}));
 assert.equal((await orders(realm,recruit,'joinOperation',{operationId:id})).code,'duplicate');
 const ids=[junior.id,senior.id,recruit.id],snapshot=realm.document();realm=new Realm({id:realm.id,snapshot,persistence:storage()});[junior,senior,recruit]=ids.map(id=>realm.captains.get(id));
 for(const person of [junior,senior,recruit]){ok(realm.attach(person,session()));atRecruiter(realm,person);}
 const operation=realm.militaryOperations.operations[id];assert.equal(operation.leaderId,senior.id);assert.deepEqual([junior,senior,recruit].map(person=>militaryServiceRank(person.game).rankIndex),[1,3,0]);
 assert.equal(realm.snapshotFor(recruit,{drainEvents:false}).state.militaryOperationsView.operation.id,id);
 ok(await orders(realm,senior,'leaveOperation',{operationId:id}));assert.equal(operation.leaderId,junior.id);assert.equal(senior.game.state.militaryCareer.active,null);
 assert.equal((await orders(realm,recruit,'launchOperation',{operationId:id,captainId:junior.id})).code,'military-command');
 ok(await orders(realm,junior,'leaveOperation',{operationId:id}));assert.equal(operation.leaderId,recruit.id);
 assert.equal((await orders(realm,recruit,'launchOperation',{operationId:id})).code,'military-rank');
 ok(await orders(realm,recruit,'leaveOperation',{operationId:id}));assert.equal(operation.phase,'cancelled');
 assert.deepEqual([junior,senior,recruit].map(person=>militaryServiceRank(person.game).completed),[3,16,0]);assert.ok(!realm.failed);
});

test('operation IDs and forged identity fields cannot cross galaxy authority or enlist a rival faction',async()=>{
 const a=new Realm({id:'FIRST014',seed:'same-galaxy-seed',persistence:storage()}),b=new Realm({id:'OTHER014',seed:'same-galaxy-seed',persistence:storage()});
 const first=await member(a,'First'),second=await member(b,'Second'),intruder=await member(a,'Rival');
 const firstId=await create(a,first,'freewake-army-range'),secondId=await create(b,second,'freewake-army-range');assert.notEqual(firstId,secondId);
 assert.equal((await orders(a,intruder,'joinOperation',{operationId:secondId,realmId:b.id,captainId:second.id})).code,'military-operation');assert.equal(intruder.game.state.militaryCareer.active,null);
 Object.assign(intruder.game.state.professions.careers.military,{factionId:'meridian'});intruder.game.state.militaryCareer.factionId='meridian';
 assert.equal((await orders(a,intruder,'joinOperation',{operationId:firstId,factionId:'freewake'})).code,'military-faction');
 for(const action of ['launchOperation','leaveOperation'])assert.equal((await orders(a,intruder,action,{operationId:firstId,captainId:first.id,leaderId:intruder.id})).code,'military-member');
 for(const command of ['beginMilitaryAssignment','observeMilitaryEvent','recordMilitarySortie'])assert.equal((await a.command(intruder,command,{operationId:firstId,completed:999,rankIndex:4})).code,'command');
 assert.equal(Object.keys(a.militaryOperations.operations[firstId].members).length,1);assert.equal(Object.keys(b.militaryOperations.operations[secondId].members).length,1);
 assert.ok(!a.failed);assert.ok(!b.failed);
});

test('a failed personal watch can be closed at the recruiter without changing another member’s active duty or granting pay',async()=>{
 const realm=field(),leader=await member(realm,'Leader',{branch:'navy',completed:3}),recruit=await member(realm,'Recruit',{branch:'navy'});
 const id=await create(realm,leader,'freewake-navy-battery');ok(await orders(realm,recruit,'joinOperation',{operationId:id}));ok(await orders(realm,leader,'launchOperation',{operationId:id}));
 const operation=realm.militaryOperations.operations[id],carrier=realm.vessels.get(operation.vesselId),credits=recruit.game.state.credits;
 ok(await realm.command(leader,'cancelNpcContract',{}));Object.assign(recruit.game.state.person,cabinLayout(carrier.ship.classId).spawn);ok(await realm.command(recruit,'disembark',{}));
 assert.equal(recruit.game.state.militaryCareer.active.phase,'failed');assert.equal(recruit.game.state.npcContract,null);assert.equal(recruit.aboard,null);assert.equal(leader.aboard,carrier.id);
 atRecruiter(realm,recruit);ok(await orders(realm,recruit,'leaveOperation',{operationId:id}));
 assert.equal(recruit.game.state.militaryCareer.active,null);assert.equal(recruit.game.state.credits,credits);assert.equal(militaryServiceRank(recruit.game).completed,0);
 assert.equal(leader.game.state.militaryCareer.active.operationId,id);assert.equal(leader.game.state.npcContract.id,id);
 const retry=await create(realm,recruit,'freewake-navy-battery');assert.notEqual(retry,id);assert.equal(leader.aboard,carrier.id);
});

test('simultaneous default musters share one Navy or Army roster while an explicit separate muster remains possible',async()=>{
 for(const branch of ['navy','army']){
  const realm=field(),senior=await member(realm,'Veteran',{branch,completed:8}),recruit=await member(realm,'Recruit',{branch});
  const first=senior.game.militaryCareerStatus().actions.find(action=>action.action==='createOperation'&&!action.separate),second=recruit.game.militaryCareerStatus().actions.find(action=>action.action==='createOperation'&&!action.separate);
  assert.equal(first.joinExisting,true);assert.equal(second.joinExisting,true);
  const answers=await Promise.all([realm.command(senior,'militaryCareerAction',first),realm.command(recruit,'militaryCareerAction',second)]);answers.forEach(ok);
  assert.equal(answers[0].operationId,answers[1].operationId);assert.equal(Object.keys(realm.militaryOperations.operations).length,1);
  const operation=realm.militaryOperations.operations[answers[0].operationId];assert.equal(operation.leaderId,senior.id);assert.deepEqual(Object.keys(operation.members),[senior.id,recruit.id]);assert.equal(militaryServiceRank(recruit.game).rankIndex,0);assert.equal(militaryServiceRank(senior.game).rankIndex,2);
  const third=await member(realm,'Separate unit',{branch}),separate=third.game.militaryCareerStatus().actions.find(action=>action.separate);
  assert.equal(separate.joinExisting,false);const independent=ok(await realm.command(third,'militaryCareerAction',separate));assert.notEqual(independent.operationId,operation.id);assert.equal(Object.keys(realm.militaryOperations.operations).length,2);
  assert.equal(realm._militaryOperationView(recruit,operation).roster.every(person=>person.status==='ready'),true);
  recruit.game.state.person.x+=120;
  const waiting=realm.snapshotFor(senior,{drainEvents:false}).state.militaryOperationsView.operation;
  assert.equal(waiting.roster.find(person=>person.captainId===recruit.id).status,'waiting');assert.equal(waiting.actions.find(action=>action.action==='launchOperation').available,false);
  atRecruiter(realm,recruit);ok(await orders(realm,senior,'launchOperation',{operationId:operation.id}));
  const deployed=realm.snapshotFor(recruit,{drainEvents:false}).state.militaryOperationsView.operation;assert.equal(deployed.phase,'active');assert.equal(deployed.roster.every(person=>person.status===(branch==='navy'?'aboard':'field')),true);
  if(branch==='navy'){assert.equal(senior.aboard,recruit.aboard);assert.deepEqual(realm.vessels.get(recruit.aboard).grants[recruit.id].roles,['weapons']);}
  assert.ok(!realm.failed);
 }
});

test('friends with different qualification progress can join one existing mission without inheriting progress, rank, or departure permission',async()=>{
 for(const branch of ['navy','army']){
  const realm=field(),senior=await member(realm,'Experienced',{branch,completed:8}),recruit=await member(realm,'New arrival',{branch}),missions=militaryBranch('freewake',branch).missions;
  senior.game.state.militaryCareer.completed=[missions[0].id];
  const opened=ok(await realm.command(senior,'militaryCareerAction',senior.game.militaryCareerStatus().actions.find(action=>action.action==='createOperation'&&!action.separate)));
  const before=structuredClone(recruit.game.state.professions.careers.military),view=recruit.game.militaryCareerStatus();
  assert.equal(view.actions.find(action=>action.action==='createOperation').missionId,missions[0].id);
  const friendOperation=view.operations.find(operation=>operation.id===opened.operationId);assert.equal(friendOperation.missionId,missions[1].id);const join=friendOperation.actions.find(action=>action.action==='joinOperation');assert.equal(join.available,true);
  ok(await realm.command(recruit,'militaryCareerAction',join));assert.equal(Object.keys(realm.militaryOperations.operations).length,1);assert.equal(recruit.game.state.militaryCareer.active.missionId,missions[1].id);
  assert.deepEqual(recruit.game.state.professions.careers.military,before);assert.deepEqual(recruit.game.state.militaryCareer.completed,[]);assert.deepEqual(senior.game.state.militaryCareer.completed,[missions[0].id]);
  assert.equal((await orders(realm,recruit,'launchOperation',{operationId:opened.operationId})).code,'military-command');
  assert.ok(!realm.failed);
 }
});

test('public friend rosters explain enlistment, branch, faction, and departure limits without granting a joining bypass',async()=>{
 const realm=field(),leader=await member(realm,'Navy leader',{branch:'navy'}),army=await member(realm,'Army friend',{branch:'army'}),rival=await member(realm,'Rival friend',{branch:'navy'});
 const {captain:civilian}=await realm.createCaptain('Civilian',{startMode:'hardcore'});ok(realm.attach(civilian,session()));atRecruiter(realm,civilian);
 rival.game.state.professions.careers.military.factionId='meridian';rival.game.state.militaryCareer.factionId='meridian';
 const id=await create(realm,leader,'freewake-navy-battery');
 for(const [viewer,code]of[[civilian,'military-enlistment'],[army,'military-branch'],[rival,'military-faction']]){
  const stateBefore=structuredClone(viewer.game.state.militaryCareer),snapshot=realm.snapshotFor(viewer,{drainEvents:false}),operation=snapshot.state.militaryOperationsView.operations.find(operation=>operation.id===id);
  assert.ok(operation);assert.equal(operation.leaderId,leader.id);assert.equal(operation.roster[0].rank,'Recruit');
  const join=operation.actions.find(action=>action.action==='joinOperation');assert.equal(join.available,false);assert.equal(join.reasonCode,code);
  assert.equal((await realm.command(viewer,'militaryCareerAction',{...join,available:true,branchId:'navy',factionId:'freewake',rankIndex:4})).code,code);assert.deepEqual(viewer.game.state.militaryCareer,stateBefore);
 }
 ok(await orders(realm,leader,'launchOperation',{operationId:id}));
 const late=await member(realm,'Late Navy friend',{branch:'navy'}),snapshot=realm.snapshotFor(late,{drainEvents:false}),operation=snapshot.state.militaryOperationsView.operations.find(operation=>operation.id===id);
 assert.equal(operation.phase,'active');assert.equal(operation.roster[0].status,'aboard');assert.equal(snapshot.presence.find(person=>person.captainId===leader.id).military.operationPhase,'active');
 const join=operation.actions.find(action=>action.action==='joinOperation');assert.equal(join.available,false);assert.equal(join.reasonCode,'military-departed');assert.match(join.reason,/next muster at Morrow/);
 assert.equal((await realm.command(late,'militaryCareerAction',join)).code,'military-departed');assert.equal(late.aboard,null);assert.equal(late.game.state.militaryCareer.active,null);assert.equal(Object.keys(realm.militaryOperations.operations).length,1);assert.ok(!realm.failed);
});
