import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {Game,distance} from '../../dist/engine.mjs';
import {cabinLayout} from '../../dist/interior-layouts.mjs';

const persistence=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function tick(realm){const at=Date.now();realm.step(.1,realm.tick+1,at,at);}
async function addWorker(realm,index,systemId='hearth'){
 const {captain}=await realm.createCaptain(`Worker ${index}`,{startMode:'hardcore'});realm.attach(captain,{close(){}});
 const room=realm._room(systemId),body=room.runtime.bodies.find(body=>body.kind==='station'&&body.landable!==false)||room.runtime.bodies.find(body=>body.kind==='planet'&&body.landable!==false&&body.id!=='earth');
 realm._landCharacter(captain,systemId,body.id);
 for(const field of ['enemies','bullets','signals','pickups'])room.runtime[field]=[];
 return captain;
}
function doWork(realm,captain){
 const contract=captain.game.state.npcContract,vessel=realm.vessels.get(contract.vesselId),layout=cabinLayout(vessel.ship.classId);
 if(contract.phase!=='working')return;
 if(contract.roleId==='medic'){
  Object.assign(captain.game.state.person,layout.stations.medical);realm._command(captain,'npcContractAction',{action:'heal'});
 }else if(contract.roleId==='firehand'){
  const section=vessel.ship.damageControl.sections.find(section=>section.id===contract.work.sectionId);
  Object.assign(captain.game.state.person,{x:section.x,y:section.y});realm._command(captain,'npcContractAction',{action:section.fire>.1?'suppress':'repair',sectionId:section.id});
 }else{
  Object.assign(captain.game.state.person,layout.stations.security);realm.acceptInput(captain,captain.inputSeq+1,{fire:true});
 }
}

test('ten NPC watches in ten systems advance and pay independently without any human helm',async()=>{
 const realm=new Realm({id:'TENWATCH',seed:'independent-work',persistence:persistence()}),captains=[],roles=['gunner','medic','firehand'];
 const systems=realm.galaxy.filter(system=>system.bodies.some(body=>body.kind==='station'&&body.landable!==false)).slice(0,10);
 assert.equal(systems.length,10);
 for(let index=0;index<10;index++){
  const captain=await addWorker(realm,index,systems[index].id);ok(realm._command(captain,'acceptNpcContract',{roleId:roles[index%3]}));captains.push(captain);
 }
 assert.equal(realm.onlineCount,10);assert.equal(realm.vessels.size,10);
 assert.equal(new Set(captains.map(captain=>captain.aboard)).size,10);
 const start=captains.map(captain=>({x:realm.vessels.get(captain.aboard).ship.x,y:realm.vessels.get(captain.aboard).ship.y}));
 // A worker without fresh input must never stall the nine other simulations.
 captains[1].inputAt=0;
 for(let frame=0;frame<100;frame++)tick(realm);
 for(let index=0;index<10;index++){
  const vessel=realm.vessels.get(captains[index].aboard);assert.equal(vessel.helmOwner,null);assert.ok(distance(vessel.ship,start[index])>5);assert.equal(captains[index].ownedVesselId,null);
 }
 for(let frame=0;frame<2500&&captains.some(captain=>captain.game.state.npcContract.phase!=='docked');frame++){
  for(const captain of captains)doWork(realm,captain);tick(realm);
 }
 for(const captain of captains){
  const contract=captain.game.state.npcContract;assert.equal(contract.phase,'docked',`${captain.name}: ${JSON.stringify(contract.work)}`);assert.equal(contract.work.done,true);
  const result=ok(await realm.command(captain,'completeNpcContract',{},'paid-watch'));assert.equal(result.wages,contract.reward);assert.equal(captain.game.state.credits,180+contract.reward);
  ok(await realm.command(captain,'completeNpcContract',{},'paid-watch'));assert.equal(captain.game.state.credits,180+contract.reward);assert.equal(captain.ownedVesselId,null);
 }
 assert.equal(realm.vessels.size,0);
});

test('ten same-system employer decks keep injuries, supplies, poses and wages on the correct hull across restart',async()=>{
 let realm=new Realm({id:'TENDECKS',seed:'parallel-clinics',persistence:persistence()});
 const captains=[];
 for(let index=0;index<10;index++){
  const captain=await addWorker(realm,index);ok(realm._command(captain,'acceptNpcContract',{roleId:'medic'}));captains.push(captain);
 }
 assert.equal(new Set(captains.map(captain=>{const ship=realm.vessels.get(captain.aboard).ship;return `${ship.x}:${ship.y}`;})).size,10);
 for(let frame=0;frame<800&&captains.some(captain=>captain.game.state.npcContract.phase!=='working');frame++)tick(realm);
 for(const captain of captains)assert.equal(captain.game.state.npcContract.phase,'working');
 const first=captains[0],firstContract=first.game.state.npcContract,firstVessel=realm.vessels.get(first.aboard);
 Object.assign(first.game.state.person,cabinLayout(firstVessel.ship.classId).stations.medical);ok(realm._command(first,'npcContractAction',{action:'heal'}));
 for(const captain of captains.slice(1)){
  const vessel=realm.vessels.get(captain.aboard),patient=vessel.inventory.crew.find(crew=>crew.id===captain.game.state.npcContract.work.crewId);
  assert.equal(patient.health,38);assert.equal(captain.game.state.npcContract.work.healed,0);
 }
 const impostor=captains[1];assert.equal(realm._canBoard(impostor,firstVessel),false);assert.equal(realm._canRole(first,firstVessel,'helm'),false);
 const snapshot=realm.snapshotFor(first,{drainEvents:false}),client=Game.fromSave(snapshot.state);assert.equal(client.state.ship.id,firstVessel.id);assert.equal(client.ownsShip,false);assert.ok(client.state.crew.some(crew=>crew.id===firstContract.work.crewId&&crew.health>38));
 const ids=captains.map(captain=>captain.id),ownedById=new Map(captains.map(captain=>[captain.id,captain.aboard]));
 realm=new Realm({id:realm.id,persistence:persistence(),snapshot:realm.document()});
 const restored=ids.map(id=>realm.captains.get(id));
 for(const captain of restored){realm.attach(captain,{close(){}});assert.equal(captain.aboard,ownedById.get(captain.id));assert.equal(captain.ownedVesselId,null);}
 for(let frame=0;frame<2500&&restored.some(captain=>captain.game.state.npcContract.phase!=='docked');frame++){
  for(const captain of restored)doWork(realm,captain);tick(realm);
 }
 for(const captain of restored){
  const contract=captain.game.state.npcContract;assert.equal(contract.phase,'docked',captain.name);assert.equal(contract.work.done,true);
  ok(realm._command(captain,'completeNpcContract',{}));assert.equal(captain.game.state.credits,180+contract.reward);assert.equal(captain.game.state.npcContractHistory.length,1);
 }
 assert.equal(realm.vessels.size,0);
});
