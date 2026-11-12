import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';
import {gunneryOrigin} from '../../dist/gunnery.mjs';
import {MILITARY_RECRUITER,militaryBranch,militaryMission} from '../../dist/military-content.mjs';
import {militaryServiceRank} from '../../dist/military-ranks.mjs';

const persistence=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const tick=realm=>{const now=Date.now();realm.step(.1,realm.tick+1,now,now);};
function recruiter(realm,captain){
 const npc=realm._surface(captain).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);assert.ok(npc);
 Object.assign(captain.game.state.person,{x:npc.x,y:npc.y});captain.game.state.pendingEncounter=null;return npc.id;
}
async function recruit(realm,name){
 const {captain}=await realm.createCaptain(name,{startMode:'hardcore'});ok(realm.attach(captain,{close(){}}));
 ok(realm._command(captain,'militaryCareerAction',{action:'join',branchId:'navy',entityId:recruiter(realm,captain)}));return captain;
}
async function fixture(seed='navy-shared-restart'){
 const realm=new Realm({id:'NAVYOPS1',seed,persistence:persistence()}),leader=await recruit(realm,'Senior'),junior=await recruit(realm,'New arrival');
 leader.game.state.professions.careers.military.completed=8;
 leader.game.state.militaryCareer.completed=militaryBranch('freewake','navy').missions.map(mission=>mission.id);
 const started=ok(realm._command(leader,'militaryCareerAction',{action:'createOperation',missionId:'freewake-navy-border-watch',entityId:recruiter(realm,leader)})),id=started.operationId;
 ok(realm._command(junior,'militaryCareerAction',{action:'joinOperation',operationId:id,entityId:recruiter(realm,junior)}));
 assert.equal(realm._command(junior,'militaryCareerAction',{action:'launchOperation',operationId:id}).code,'military-command');
 ok(realm._command(leader,'militaryCareerAction',{action:'launchOperation',operationId:id}));
 const operation=realm.militaryOperations.operations[id],vessel=realm.vessels.get(operation.vesselId),contract=operation.contract;
 for(const c of [leader,junior])Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).stations.security);
 return{realm,leader,junior,operation,vessel,contract};
}
function aim(realm,captain,contract,vessel,{fire=true}={}){
 if(!captain.session)return;
 if(!contract.dockedAt&&['outbound','working','returning'].includes(contract.phase)&&captain.game.state.stationView!=='gunnery')ok(realm._command(captain,'enterGunnery',{}));
 const target=realm._room(vessel.systemId).runtime.enemies.find(enemy=>contract.navy.targetIds.includes(enemy.id)&&enemy.hp>0&&!enemy.disabled),origin=gunneryOrigin(vessel.ship);
 let input={};
 if(target){const travel=Math.hypot(target.x-origin.x,target.y-origin.y)/650,dx=target.x+(target.vx||0)*travel-origin.x,dy=target.y+(target.vy||0)*travel-origin.y,len=Math.hypot(dx,dy);input={fire,aiming:true,aimX:dx/len,aimY:dy/len};}
 realm.acceptInput(captain,captain.inputSeq+1,input);
}
function runUntil(state,predicate,{seconds=260,observe=()=>{},fire=true}={}){
 for(let i=0;i<seconds*10&&!predicate();i++){
  for(const c of [state.leader,state.junior])aim(state.realm,c,state.contract,state.vessel,{fire});
  tick(state.realm);observe();
 }
 assert.ok(predicate(),JSON.stringify({phase:state.contract.phase,system:state.vessel.systemId,work:state.contract.work,participants:state.contract.military.participants}));
}
async function observer(realm,systemId='meridian'){
 const {captain}=await realm.createCaptain('Civilian observer',{startMode:'regular'});ok(realm.attach(captain,{close(){}}));
 const ship=realm.vessels.get(captain.ownedVesselId);
 ship.systemId=systemId;ship.dockedAt=null;ship.helmOwner=captain.id;Object.assign(ship.ship,{x:5500,y:0,vx:0,vy:0});
 captain.aboard=ship.id;captain.crewRole='helm';captain.game.state.systemId=systemId;captain.game.state.mode='ship';captain.game.state.interior=null;captain.game.state.locationId=null;
 realm._bindCaptain(captain);return captain;
}

test('mixed ranks share one actual remote carrier battle, civilians can see it, and another galaxy cannot',async()=>{
 const state=await fixture();let {realm,leader,junior,operation,vessel,contract}=state;
 const initialRanks=[militaryServiceRank(leader.game).rankIndex,militaryServiceRank(junior.game).rankIndex];assert.deepEqual(initialRanks,[2,0]);
 assert.equal(leader.aboard,junior.aboard);assert.equal(leader.game.state.npcContract,junior.game.state.npcContract);
 assert.ok(vessel.grants[leader.id].roles.includes('engineering'));assert.equal(vessel.grants[junior.id].roles.includes('engineering'),false);
 assert.equal(realm._command(junior,'quickHelm',{}).ok,false);assert.equal(realm._command(junior,'cancelNpcContract',{}).ok,false);
 const spectator=await observer(realm),foreign=new Realm({id:'NAVYOPS2',seed:realm.seed,persistence:persistence()}),foreignSpectator=await observer(foreign);
 assert.equal(contract.navy.attackPlanned,true);
 runUntil(state,()=>contract.phase==='working');assert.equal(vessel.systemId,'meridian');assert.equal(leader.game.state.systemId,'meridian');assert.equal(junior.game.state.systemId,'meridian');
 let sawTargets=false,sawBullets=false;
 runUntil(state,()=>contract.phase==='docked',{observe:()=>{
  if(vessel.systemId!=='meridian')return;
  for(const compact of [false,true]){
   const view=realm.snapshotFor(spectator,{compact,drainEvents:false});assert.ok(view.remoteShips.some(ship=>ship.id===vessel.id));
   if(view.world.enemies.some(enemy=>enemy.militaryOperationId===operation.id))sawTargets=true;
   if(view.world.bullets.some(bullet=>bullet.vesselId===vessel.id))sawBullets=true;
  }
 }});
 assert.equal(sawTargets,true);assert.equal(sawBullets,true);assert.equal(vessel.systemId,'hearth');
 for(const compact of [false,true]){
  const view=foreign.snapshotFor(foreignSpectator,{compact,drainEvents:false});assert.equal(view.remoteShips.some(ship=>ship.id===vessel.id),false);assert.equal(view.world.enemies.some(enemy=>enemy.militaryOperationId===operation.id),false);assert.equal(view.world.bullets.some(bullet=>bullet.vesselId===vessel.id),false);
 }
 assert.ok(contract.military.participants[leader.id].watchSeconds>=55);assert.ok(contract.military.participants[junior.id].watchSeconds>=55);
 assert.ok(contract.military.participants[leader.id].shots>0);assert.ok(contract.military.participants[junior.id].shots>0);
 const juniorWatch=contract.military.participants[junior.id].watchSeconds;
 Object.assign(leader.game.state.person,cabinLayout(vessel.ship.classId).spawn);ok(realm._command(leader,'disembark',{}));
 assert.equal(leader.aboard,null);assert.equal(junior.aboard,vessel.id);assert.equal(contract.active,true);assert.equal(leader.game.state.npcContract,null);assert.equal(junior.game.state.npcContract,contract);
 tick(realm);assert.equal(junior.game.state.npcContract,contract);assert.equal(contract.military.participants[junior.id].watchSeconds,juniorWatch);
 // A restart after the binding owner has gone ashore must not discard the
 // remaining crew's canonical carrier or turn it into an unpayable watch.
 const ids={leader:leader.id,junior:junior.id,vessel:vessel.id,operation:operation.id},document=realm.document();
 realm=new Realm({id:realm.id,persistence:persistence(),snapshot:document});leader=realm.captains.get(ids.leader);junior=realm.captains.get(ids.junior);operation=realm.militaryOperations.operations[ids.operation];vessel=realm.vessels.get(ids.vessel);contract=operation.contract;
 ok(realm.attach(leader,{close(){}}));ok(realm.attach(junior,{close(){}}));
 assert.equal(leader.game.state.npcContract,null);assert.equal(junior.game.state.npcContract,contract);assert.equal(junior.aboard,vessel.id);assert.equal(contract.active,true);
 Object.assign(junior.game.state.person,cabinLayout(vessel.ship.classId).spawn);ok(realm._command(junior,'disembark',{}));
 assert.equal(junior.aboard,null);assert.equal(contract.active,false);
 const mission=militaryMission(operation.missionId);
 for(const captain of [leader,junior]){
  assert.equal(captain.game.state.militaryCareer.active.phase,'debrief');const credits=captain.game.state.credits;
  ok(realm._command(captain,'militaryCareerAction',{action:'debrief',entityId:recruiter(realm,captain)}));assert.equal(captain.game.state.credits,credits+mission.reward);
  assert.equal(realm._command(captain,'militaryCareerAction',{action:'debrief',entityId:recruiter(realm,captain)}).ok,false);
 }
 assert.equal(leader.game.state.professions.careers.military.completed,9);assert.equal(junior.game.state.professions.careers.military.completed,1);assert.deepEqual([militaryServiceRank(leader.game).rankIndex,militaryServiceRank(junior.game).rankIndex],[2,0]);
});

test('restarting a remote shared watch restores one carrier and lets the online recruit continue when its leader disconnects',async()=>{
 let state=await fixture('navy-shared-border');
 runUntil(state,()=>state.contract.phase==='working');assert.equal(state.contract.navy.attackPlanned,false);
 for(let i=0;i<60;i++){for(const c of [state.leader,state.junior])aim(state.realm,c,state.contract,state.vessel,{fire:false});tick(state.realm);}
 const {realm:before,leader:oldLeader,junior:oldJunior,vessel:oldVessel,contract:oldContract}=state,ids={leader:oldLeader.id,junior:oldJunior.id,vessel:oldVessel.id,operation:oldContract.id};
 const watch=oldContract.military.participants[ids.junior].watchSeconds,document=before.document();
 const realm=new Realm({id:before.id,persistence:persistence(),snapshot:document}),leader=realm.captains.get(ids.leader),junior=realm.captains.get(ids.junior),operation=realm.militaryOperations.operations[ids.operation],vessel=realm.vessels.get(ids.vessel),contract=operation.contract;
 ok(realm.attach(junior,{close(){}}));
 state={realm,leader,junior,operation,vessel,contract};
 assert.equal(leader.session,null);assert.equal(junior.game.state.npcContract,contract);assert.equal(leader.game.state.npcContract,contract);assert.equal(contract.navy.attackPlanned,false);assert.equal(vessel.systemId,'meridian');
 assert.equal([...realm.vessels.values()].filter(ship=>ship.npcContractId===contract.id).length,1);assert.equal(junior.game.state.stationView,null);assert.equal(contract.military.participants[junior.id].watchSeconds,watch);
 const offlineWatch=contract.military.participants[leader.id].watchSeconds;
 Object.assign(junior.game.state.person,cabinLayout(vessel.ship.classId).stations.security);
 runUntil(state,()=>contract.phase==='docked',{fire:false});
 assert.equal(contract.military.participants[leader.id].watchSeconds,offlineWatch);assert.ok(contract.military.participants[junior.id].watchSeconds>=55);
 Object.assign(junior.game.state.person,cabinLayout(vessel.ship.classId).spawn);ok(realm._command(junior,'disembark',{}));
 assert.equal(junior.game.state.militaryCareer.active.phase,'debrief');assert.equal(junior.game.state.militaryCareer.active.receipt.employeeId,junior.id);
});

test('a returning assigned gunner can retake the shared console after disconnect grace expires',async()=>{
 const state=await fixture('navy-shared-border'),{realm,leader,junior,contract,vessel}=state;
 runUntil(state,()=>contract.phase==='working',{fire:false});
 const watch=contract.military.participants[leader.id].watchSeconds;
 realm.detach(leader,leader.session);leader.disconnectUntil=Date.now()-1;
 aim(realm,junior,contract,vessel,{fire:false});tick(realm);
 assert.equal(leader.crewRole,'passenger');assert.equal(contract.military.participants[leader.id].watchSeconds,watch);
 ok(realm.attach(leader,{close(){}}));Object.assign(leader.game.state.person,cabinLayout(vessel.ship.classId).stations.security);
 ok(realm._command(leader,'enterGunnery',{}));assert.equal(leader.crewRole,'weapons');
 assert.equal(junior.crewRole,'weapons');assert.equal(leader.aboard,junior.aboard);
 tick(realm);assert.ok(contract.military.participants[leader.id].watchSeconds>watch);
});
