import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {Game} from '../../dist/engine.mjs';
import {cabinLayout,getShipClass} from '../../dist/fleet.mjs';
import {MILITARY_RECRUITER} from '../../dist/military-content.mjs';
import {mergeSnapshot} from '../../dist/network.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const tick=realm=>{const now=Date.now();realm.step(.1,realm.tick+1,now,now);};
function recruiter(realm,c){
 const npc=realm._surface(c).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);assert.ok(npc);
 Object.assign(c.game.state.person,{x:npc.x,y:npc.y});c.game.state.pendingEncounter=null;return npc.id;
}
async function fixture(){
 const realm=new Realm({id:'BATTERY1',seed:'capital-batteries-authority',persistence:storage()}),crew=[];
 for(const name of ['Senior gunner','New gunner']){
  const {captain}=await realm.createCaptain(name,{startMode:'hardcore'});ok(realm.attach(captain,{close(){}}));
  ok(realm._command(captain,'militaryCareerAction',{action:'join',branchId:'navy',entityId:recruiter(realm,captain)}));crew.push(captain);
 }
 const [leader,junior]=crew;leader.game.state.professions.careers.military.completed=8;
 const started=ok(realm._command(leader,'militaryCareerAction',{action:'createOperation',entityId:recruiter(realm,leader)}));
 ok(realm._command(junior,'militaryCareerAction',{action:'joinOperation',operationId:started.operationId,entityId:recruiter(realm,junior)}));
 ok(realm._command(leader,'militaryCareerAction',{action:'launchOperation',operationId:started.operationId}));
 const vessel=realm.vessels.get(leader.aboard),contract=leader.game.state.npcContract;
 for(const captain of crew)Object.assign(captain.game.state.person,cabinLayout(vessel.ship.classId).stations.security);
 for(let n=0;n<1500&&contract.phase!=='working';n++)tick(realm);
 assert.equal(contract.phase,'working');
 for(const captain of crew)ok(realm._command(captain,'enterGunnery',{}));
 return{realm,crew,leader,junior,vessel,contract};
}

test('two ranked Navy crew can fire different canonical batteries during the same authority tick',async()=>{
 const {realm,leader,junior,vessel,contract}=await fixture(),world=realm._room(vessel.systemId).runtime;
 ok(realm._command(leader,'selectGunneryBattery',{batteryId:'port'}));ok(realm._command(junior,'selectGunneryBattery',{batteryId:'aft'}));
 world.bullets=[];
 for(const captain of [leader,junior])realm.acceptInput(captain,captain.inputSeq+1,{fire:true});
 tick(realm);
 const shots=world.bullets.filter(bullet=>bullet.vesselId===vessel.id);
 assert.deepEqual(new Set(shots.map(shot=>shot.batteryId)),new Set(['port','aft']));assert.equal(shots.length,2);
 assert.equal(shots.find(shot=>shot.batteryId==='port').shooterId,leader.id);assert.equal(shots.find(shot=>shot.batteryId==='aft').shooterId,junior.id);
 assert.equal(contract.military.participants[leader.id].shots,1);assert.equal(contract.military.participants[junior.id].shots,1);
 assert.equal(vessel.helmOwner,null);assert.equal(leader.aboard,junior.aboard);
 assert.equal(realm._command(junior,'quickHelm',{}).ok,false);
});

test('one physical gun cycle is shared even across players with different personal clocks',async()=>{
 const {realm,leader,junior,vessel}=await fixture();
 for(const c of [leader,junior])ok(realm._command(c,'selectGunneryBattery',{batteryId:'starboard'}));
 ok(realm._command(leader,'npcContractAction',{action:'fire'}));
 junior.game.state.stats.time+=1000;
 assert.equal(realm._command(junior,'npcContractAction',{action:'fire'}).code,'cooldown');
 ok(realm._command(junior,'selectGunneryBattery',{batteryId:'port'}));ok(realm._command(junior,'npcContractAction',{action:'fire'}));
 assert.ok(vessel.ship.gunneryCooldowns.starboard>0);assert.ok(vessel.ship.gunneryCooldowns.port>0);
 const baseline=realm.snapshotFor(junior,{drainEvents:false});
 for(const compact of [false,true]){
  const snapshot=mergeSnapshot(baseline,realm.snapshotFor(junior,{compact,drainEvents:false})),client=Game.fromSave(snapshot.state);client.state=snapshot.state;
  const status=client.gunneryStatus();assert.equal(status.active,true,JSON.stringify({compact,reason:status.reason,view:snapshot.state.stationView}));assert.equal(status.selectedBatteryId,'port');assert.equal(status.batteries.length,4);assert.ok(status.cooldownRemaining>0);
 }
});

test('server selection rejects invented batteries, remote bodies, revoked permission and incapacitation without changing the chosen mount',async()=>{
 const {realm,leader,vessel}=await fixture();ok(realm._command(leader,'selectGunneryBattery',{batteryId:'aft'}));
 assert.equal(realm._command(leader,'selectGunneryBattery',{batteryId:'omnidirectional',arcHalfAngle:Math.PI,energyCost:0}).code,'battery');
 leader.game.state.person.x+=100;assert.equal(realm._command(leader,'selectGunneryBattery',{batteryId:'fore'}).ok,false);assert.equal(leader.game.state.person.gunneryBatteryId,'aft');
 Object.assign(leader.game.state.person,cabinLayout(vessel.ship.classId).stations.security);ok(realm._command(leader,'enterGunnery',{}));
 vessel.grants[leader.id].roles=[];assert.equal(realm._command(leader,'selectGunneryBattery',{batteryId:'fore'}).ok,false);assert.equal(leader.game.state.person.gunneryBatteryId,'aft');
 vessel.grants[leader.id].roles=['weapons'];ok(realm._command(leader,'enterGunnery',{}));leader.game.state.person.down=true;
 assert.equal(realm._command(leader,'selectGunneryBattery',{batteryId:'fore'}).ok,false);
});

test('restart preserves the selected mount and shared gun cycle while requiring a fresh station view grant',async()=>{
 const {realm:before,leader:old,vessel:oldVessel}=await fixture();
 ok(before._command(old,'selectGunneryBattery',{batteryId:'aft'}));ok(before._command(old,'npcContractAction',{action:'fire'}));
 const realm=new Realm({id:before.id,persistence:storage(),snapshot:before.document()}),leader=realm.captains.get(old.id),vessel=realm.vessels.get(oldVessel.id);
 ok(realm.attach(leader,{close(){}}));assert.equal(leader.game.state.stationView,null);assert.equal(leader.game.state.person.gunneryBatteryId,'aft');
 assert.ok(vessel.ship.gunneryCooldowns.aft>0);ok(realm._command(leader,'enterGunnery',{}));
 assert.equal(realm._command(leader,'npcContractAction',{action:'fire'}).code,'cooldown');
});

test('ordinary capital crew receive the same selectable guns only through their own weapons grant',async()=>{
 const realm=new Realm({id:'BATTERY2',seed:'civilian-capital-gunner',persistence:storage()}),{captain:owner}=await realm.createCaptain('Owner',{startMode:'regular'}),{captain:guest}=await realm.createCaptain('Guest',{startMode:'hardcore'});
 for(const c of [owner,guest])ok(realm.attach(c,{close(){}}));
 const vessel=realm.vessels.get(owner.ownedVesselId),hull=getShipClass('judicator');
 Object.assign(vessel.ship,hull.stats,{classId:hull.id,hull:hull.stats.maxHull,energy:300,dockedAt:null});vessel.dockedAt=null;vessel.helmOwner=null;
 vessel.grants[guest.id]={allowed:true,roles:['weapons']};
 for(const c of [owner,guest]){realm._cabin(c,vessel);Object.assign(c.game.state.person,cabinLayout(hull.id).stations.security);ok(realm._command(c,'enterGunnery',{}));}
 ok(realm._command(guest,'selectGunneryBattery',{batteryId:'aft'}));realm.acceptInput(guest,1,{fire:true,aiming:true,aimX:-1,aimY:0});tick(realm);
 assert.equal(realm._room(vessel.systemId).runtime.bullets.filter(bullet=>bullet.shooterId===guest.id&&bullet.batteryId==='aft').length,2);
 const view=realm.snapshotFor(guest,{drainEvents:false}),client=Game.fromSave(view.state);client.state=view.state;
 assert.equal(client.gunneryStatus().npcPilot,false);assert.equal(client.gunneryStatus().active,true);
 vessel.grants[guest.id].roles=[];assert.equal(realm.snapshotFor(guest,{drainEvents:false}).state.stationView,null);
 assert.equal(realm._command(guest,'enterGunnery',{}).ok,false);
});
