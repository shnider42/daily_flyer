import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {Game,distance} from '../../dist/engine.mjs';
import {cabinLayout} from '../../dist/fleet.mjs';
import {gunneryOrigin} from '../../dist/gunnery.mjs';
import {MILITARY_RECRUITER} from '../../dist/military-content.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const copy=value=>structuredClone(value);
function tick(realm,count=1){for(let i=0;i<count;i++){const time=Date.now();realm.step(.1,realm.tick+1,time,time);}}
function until(realm,predicate,seconds=160){for(let i=0;i<seconds*10&&!predicate();i++)tick(realm);assert.ok(predicate());}
function approachRecruiter(realm,c){
 const entity=realm._surface(c).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);assert.ok(entity);
 Object.assign(c.game.state.person,{x:entity.x,y:entity.y});c.game.state.pendingEncounter=null;return entity.id;
}
async function fixture({startMode='hardcore',seed='navy-authority'}={}){
 const realm=new Realm({id:'NAVY123',seed,persistence:storage()});
 const{captain:c}=await realm.createCaptain('Gunner',{startMode});ok(realm.attach(c,{close(){}}));
 if(c.ownedVesselId){const ship=realm.vessels.get(c.ownedVesselId).ship,body=realm._room('hearth').runtime.bodies.find(body=>body.id==='morrow');Object.assign(ship,{x:body.x+body.radius+80,y:body.y,vx:0,vy:0});ok(realm._command(c,'dock',{id:'morrow'}));}
 ok(realm._command(c,'militaryCareerAction',{action:'join',branchId:'navy',entityId:approachRecruiter(realm,c)}));
 const ownId=c.ownedVesselId,ownShip=copy(c.game.state.ship),ownCargo=copy(c.game.state.cargo);
 ok(realm._command(c,'militaryCareerAction',{action:'start',entityId:approachRecruiter(realm,c)}));
 const contract=c.game.state.npcContract,vessel=realm.vessels.get(c.aboard);
 Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).stations.security);
 return{realm,c,contract,vessel,ownId,ownShip,ownCargo};
}
function enter(realm,c,contract){until(realm,()=>contract.phase==='outbound');ok(realm._command(c,'enterGunnery',{}));}
function aim(realm,c,vessel,contract,extra={}){
 const target=realm._room(vessel.systemId).runtime.enemies.find(enemy=>contract.navy.targetIds.includes(enemy.id)&&enemy.hp>0&&!enemy.disabled),origin=gunneryOrigin(vessel.ship);
 if(!target){realm.acceptInput(c,c.inputSeq+1,extra);return;}
 const travel=distance(target,origin)/650,dx=target.x+(target.vx||0)*travel-origin.x,dy=target.y+(target.vy||0)*travel-origin.y,length=Math.hypot(dx,dy);
 realm.acceptInput(c,c.inputSeq+1,{...extra,fire:true,aiming:true,aimX:dx/length,aimY:dy/length});
}
function finish(realm,c,vessel,contract){
 for(let i=0;i<1800&&contract.phase!=='docked'&&contract.active;i++){
  if(['outbound','working'].includes(contract.phase)&&c.game.state.stationView!=='gunnery')ok(realm._command(c,'enterGunnery',{}));
  aim(realm,c,vessel,contract);tick(realm);
 }
 assert.equal(contract.phase,'docked',JSON.stringify(contract.work));assert.equal(contract.work.done,true);
}

test('an assigned gunner receives exterior full and motion snapshots while remaining on the real cabin deck',async()=>{
 const{realm,c,contract,vessel,ownId,ownShip}=await fixture({startMode:'regular'});
 assert.notEqual(vessel.id,ownId);assert.equal(vessel.ship.classId,'leviathan');assert.deepEqual(c.game.state.ship,ownShip);
 assert.equal(realm._command(c,'enterGunnery',{}).ok,false);assert.equal(realm._command(c,'quickHelm',{}).ok,false);
 enter(realm,c,contract);until(realm,()=>contract.phase==='working');
 const position={x:c.game.state.person.x,y:c.game.state.person.y};
 for(const compact of [false,true]){
  const view=realm.snapshotFor(c,{compact,drainEvents:false});
  assert.equal(view.room.kind,'ship');assert.equal(view.state.mode,'person');assert.equal(view.state.stationView,'gunnery');assert.equal(view.state.multiplayer.aboardVesselId,vessel.id);
  assert.equal(view.state.ship.id,vessel.id);assert.equal(view.state.militaryCareer.active.operationId,contract.id);
  assert.equal(view.world.enemies.filter(enemy=>contract.navy.targetIds.includes(enemy.id)).length,2);assert.ok(view.world.traffic.length>0);
  if(!compact){const client=Game.fromSave(view.state);client.state=view.state;assert.equal(client.gunneryStatus().active,true);assert.equal(client.gunneryStatus().assigned,true);}
 }
 realm.acceptInput(c,c.inputSeq+1,{x:1,y:1,turn:1,thrust:-1,strafe:1,boost:true,mine:true});tick(realm,12);
 assert.deepEqual({x:c.game.state.person.x,y:c.game.state.person.y},position);assert.equal(c.appliedInput.thrust,0);assert.equal(c.appliedInput.mine,false);assert.equal(vessel.helmOwner,null);
 ok(realm._command(c,'leaveGunnery',{}));const view=realm.snapshotFor(c,{drainEvents:false});assert.equal(view.world.enemies.length,0);assert.equal(view.world.traffic.length,0);assert.equal(view.room.kind,'ship');
 assert.deepEqual(c.game.state.ship,ownShip);assert.equal(c.ownedVesselId,ownId);
});

test('shared gunnery rejects remote, foreign, incapacitated, withdrawn, and disconnected station grants',async()=>{
 const{realm,c,contract,vessel}=await fixture();enter(realm,c,contract);
 c.game.state.person.x+=80;assert.equal(realm.snapshotFor(c,{drainEvents:false}).state.stationView,null);assert.equal(realm._command(c,'enterGunnery',{}).ok,false);
 Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).stations.security);c.game.state.person.down=true;assert.equal(realm._command(c,'enterGunnery',{}).ok,false);c.game.state.person.down=false;
 ok(realm._command(c,'enterGunnery',{}));vessel.grants[c.id].roles=[];assert.equal(realm.snapshotFor(c,{drainEvents:false}).state.stationView,null);vessel.grants[c.id].roles=['weapons'];
 const{captain:other}=await realm.createCaptain('Visitor',{startMode:'hardcore'});ok(realm.attach(other,{close(){}}));
 assert.equal(realm._command(other,'boardShip',{vesselId:vessel.id}).ok,false);assert.equal(realm._command(other,'enterGunnery',{}).ok,false);
 ok(realm._command(c,'enterGunnery',{}));realm.detach(c,c.session);assert.equal(c.game.state.stationView,null);assert.equal(realm.snapshotFor(c,{drainEvents:false}).world.enemies.length,0);
 ok(realm.attach(c,{close(){}}));assert.equal(c.game.state.stationView,null);assert.equal(c.game.state.mode,'person');
});

test('real shared fire credits the employee, docks once, preserves the owned hull, and returns progress to the actual personal career',async()=>{
 const{realm,c,contract,vessel,ownId,ownShip,ownCargo}=await fixture({startMode:'regular',seed:'navy-receipt'});finish(realm,c,vessel,contract);
 assert.equal(c.game.state.stationView,null);assert.equal(vessel.dockedAt,'morrow');assert.equal(c.game.state.militaryCareer.active.phase,'active');
 assert.ok(contract.work.targets.every(target=>target.damage>=28&&target.neutralized));assert.equal(c.game.state.credits,180);
 Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).spawn);
 const result=ok(await realm.command(c,'disembark',{},'navy-disembark'));assert.equal(result.wages,0);
 assert.equal(c.game.state.militaryCareer.active.phase,'debrief');assert.equal(c.game.state.militaryCareer.active.receipt.returned,true);
 assert.equal(c.ownedVesselId,ownId);assert.deepEqual(c.game.state.ship,ownShip);assert.deepEqual(c.game.state.cargo,ownCargo);assert.equal(c.game.state.locationId,'morrow');assert.equal(c.aboard,null);
 const credits=c.game.state.credits;ok(await realm.command(c,'disembark',{},'navy-disembark'));assert.equal(c.game.state.credits,credits);assert.equal(c.game.state.npcContractHistory.filter(entry=>entry.id===contract.id).length,1);
 const entityId=approachRecruiter(realm,c);assert.equal(ok(realm._command(c,'militaryCareerAction',{action:'debrief',entityId})).paid,100);assert.equal(c.game.state.credits,credits+100);
 assert.equal(realm._command(c,'militaryCareerAction',{action:'debrief',entityId}).ok,false);assert.equal(realm.vessels.has(vessel.id),false);assert.equal(realm.vessels.has(ownId),true);
});

test('restart keeps one carrier and its real damaged targets, but needs a fresh station-view grant',async()=>{
 let{realm,c,contract,vessel,ownId,ownShip}=await fixture({startMode:'regular',seed:'navy-persist'});enter(realm,c,contract);until(realm,()=>contract.phase==='working');
 for(let i=0;i<80&&!contract.work.targets.some(target=>target.damage>0);i++){aim(realm,c,vessel,contract);tick(realm);}
 assert.ok(contract.work.targets.some(target=>target.damage>0));const before=copy(contract.work.targets),ids=[...contract.navy.targetIds],vesselId=vessel.id,document=realm.document();
 realm=new Realm({id:realm.id,persistence:storage(),snapshot:document});c=realm.captains.get(c.id);ok(realm.attach(c,{close(){}}));vessel=realm.vessels.get(vesselId);contract=c.game.state.npcContract;
 assert.equal(c.game.state.stationView,null);assert.equal(c.aboard,vesselId);assert.equal(c.ownedVesselId,ownId);assert.deepEqual(c.game.state.ship,ownShip);assert.equal([...realm.vessels.values()].filter(value=>value.npcContractId===contract.id).length,1);
 assert.deepEqual(contract.navy.targetIds,ids);assert.deepEqual(contract.work.targets,before);assert.equal(realm.snapshotFor(c,{drainEvents:false}).world.enemies.length,0);
 Object.assign(c.game.state.person,cabinLayout(vessel.ship.classId).stations.security);ok(realm._command(c,'enterGunnery',{}));tick(realm);
 const targets=realm._room('hearth').runtime.enemies.filter(enemy=>ids.includes(enemy.id));assert.equal(new Set(targets.map(enemy=>enemy.id)).size,targets.length);assert.ok(targets.length<=2);
 finish(realm,c,vessel,contract);ok(realm._command(c,'completeNpcContract',{}));assert.equal(c.game.state.militaryCareer.active.phase,'debrief');
});

test('carrier loss produces a failed zero-pay attempt without granting or moving a personal hull',async()=>{
 const{realm,c,contract,vessel,ownId,ownShip}=await fixture({startMode:'regular',seed:'navy-loss'});enter(realm,c,contract);realm._destroyVessel(vessel);
 assert.equal(c.game.state.npcContract,null);assert.equal(c.game.state.stationView,null);assert.equal(c.game.state.militaryCareer.active.phase,'failed');assert.equal(c.game.state.credits,180);
 assert.equal(c.ownedVesselId,ownId);assert.deepEqual(realm.vessels.get(ownId).ship,ownShip);assert.equal(c.game.state.npcContractHistory.at(-1).wages,0);assert.equal(vessel.destroyed,true);
 assert.equal(c.game.state.npcContractHistory.at(-1).id,contract.id);
});
