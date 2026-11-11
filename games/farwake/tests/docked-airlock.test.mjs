import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {cabinLayout} from '../dist/interior-layouts.mjs';
import {crewTaskDefinition,createWorkAssignment} from '../dist/crew-work.mjs';
import {settleNpcContract} from '../dist/npc-contracts.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const atAirlock=game=>Object.assign(game.state.person,cabinLayout(game.state.interior.location.shipClass).spawn);
const until=(game,predicate,seconds=130)=>{
 for(let n=0;n<seconds*10&&!predicate();n++)game.step(.1,{});
 assert.ok(predicate(),`Timed out in ${game.state.npcContract?.phase}`);
};
function watch({startMode='regular',family='freight'}={}){
 for(let n=0;n<80;n++){
  const game=new Game(`docked-airlock:${n}`,{openingMission:true,startMode});
  const offer=game.npcContractOffers().find(offer=>offer.familyId===family);
  if(!offer||createWorkAssignment(offer,'sample').complication.type)continue;
  ok(game.acceptNpcContract(offer.roleId,{offerId:offer.offerId}));atAirlock(game);
  return game;
 }
 throw new Error(`No ordinary ${family} watch`);
}
function doTask(game){
 const task=crewTaskDefinition(game.state.npcContract);
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations[task.station]);
 return ok(game.npcContractAction('task',{taskId:task.id,solution:task.solution}));
}
function arrive(game){doTask(game);until(game,()=>game.state.npcContract.phase==='working');atAirlock(game);}

test('the docked employer airlock releases regular and shipless captains without work or a helm grant',()=>{
 for(const startMode of ['regular','hardcore']){
  const game=watch({startMode}),contract=game.state.npcContract,personal=contract.personal;
  const own=personal.ship,position={x:own.x,y:own.y},credits=game.state.credits,owned=[...game.state.fleet.owned];
  const port=game.dockedPortInfo();assert.equal(port.id,contract.origin.bodyId);
  assert.equal(game.currentBody.dockedAt,port.id);assert.equal(game.currentBody.dockedName,port.name);
  assert.equal(game.quickHelm().code,'contract');
  // A conversation cannot hold the physical exit shut.
  game.state.pendingEncounter={id:'union_strike'};
  const result=ok(game.disembark());assert.equal(result.wages,0);assert.match(result.text,/Watch ended.*0 cr earned/);
  assert.equal(game.state.mode,'person');assert.equal(game.state.locationId,port.id);assert.equal(game.state.interior,null);
  assert.equal(game.state.npcContract,null);assert.equal(game.state.ship,own);
  assert.deepEqual({x:own.x,y:own.y},position);assert.equal(game.state.cargo,personal.cargo);
  assert.equal(game.state.upgrades,personal.upgrades);assert.equal(game.state.crew,personal.crew);
  assert.deepEqual(game.state.fleet.owned,owned);assert.equal(game.ownsShip,startMode==='regular');
  assert.equal(game.state.credits,credits);assert.equal(game.state.npcContractHistory.length,1);
  assert.equal(game.disembark().ok,false);assert.equal(game.completeNpcContract().ok,false);
  assert.equal(game.state.credits,credits);
 }
});

test('docked exits require a conscious person at the real airlock and never infer a berth from proximity',()=>{
 const game=watch(),contract=game.state.npcContract,spawn=cabinLayout(game.state.ship.classId).spawn,credits=game.state.credits;
 Object.assign(game.state.person,{x:spawn.x+71,y:spawn.y});assert.equal(game.disembark().code,'distance');
 game.state.person.x=NaN;assert.equal(game.disembark().code,'distance');
 atAirlock(game);game.state.person.down=true;assert.equal(game.disembark().code,'incapacitated');game.state.person.down=false;
 game.state.person.health=0;assert.equal(game.disembark().code,'incapacitated');game.state.person.health=100;
 contract.dockedAt=null;assert.equal(game.dockedPortInfo(),null);assert.equal(game.disembark().code,'docking');
 assert.equal(game.currentBody.dockedAt,contract.origin.bodyId,'Old cabin metadata must not invent a dock.');
 contract.dockedAt=contract.origin.bodyId;game.state.ship.x+=2000;
 assert.equal(game.dockedPortInfo(),null);assert.equal(game.disembark().code,'docking');
 assert.equal(contract.active,true);assert.equal(game.state.credits,credits);assert.equal(game.state.npcContractHistory.length,0);
});

test('a real receiving port exit pays recorded work, leaves the private hull behind, and preserves unrelated jobs',()=>{
 const game=watch(),contract=game.state.npcContract,own=contract.personal.ship,ownPosition={x:own.x,y:own.y},before=game.state.credits,jobs=game.state.stats.jobs;
 const mission={id:'independent-local-job',type:'delivery',status:'active',progress:0};game.state.missions.push(mission);
 arrive(game);
 const destination=game.system.bodies.find(body=>body.id===contract.destination.bodyId);
 assert.notEqual(destination.id,contract.origin.bodyId);assert.equal(contract.dockedAt,destination.id);assert.equal(game.currentBody.dockedAt,destination.id);
 const progress=contract.work.progress;assert.ok(progress>0&&progress<1);
 const expected=Math.floor(contract.reward*.35*progress),result=ok(game.leaveInterior());
 assert.equal(result.wages,expected);assert.equal(game.state.credits,before+expected);
 assert.equal(game.state.locationId,destination.id);assert.equal(game.state.lastBodyId,destination.id);
 assert.equal(game.state.npcContractHistory.at(-1).destination.bodyId,destination.id);
 assert.equal(game.state.npcContractHistory.at(-1).outcome,'partial');assert.equal(game.state.stats.jobs,jobs);
 assert.equal(game.hasFlag('crew_watch_completed'),false);assert.ok(game.state.missions.includes(mission));
 assert.equal(game.state.ship,own);assert.deepEqual({x:own.x,y:own.y},ownPosition);
 assert.equal(game.canUseOwnShipHere(),false);assert.equal(game.quickLaunch().code,'ship-location');
 const reloaded=Game.fromSave(game.save());assert.equal(reloaded.state.locationId,destination.id);
 assert.deepEqual({x:reloaded.state.ship.x,y:reloaded.state.ship.y},ownPosition);assert.equal(reloaded.canUseOwnShipHere(),false);
 ok(reloaded.takePassengerTransit(contract.origin.bodyId));assert.equal(reloaded.canUseOwnShipHere(),true);
 ok(reloaded.quickLaunch());assert.equal(reloaded.state.ship.id,own.id);
});

test('completed returned work can be collected through the airlock once, without a duty dialog',()=>{
 const game=watch(),contract=game.state.npcContract,credits=game.state.credits;
 arrive(game);doTask(game);assert.equal(contract.phase,'returning');assert.equal(contract.dockedAt,null);assert.equal(game.dockedPortInfo(),null);
 until(game,()=>contract.phase==='docked');atAirlock(game);
 const result=ok(game.exitCabin());assert.equal(result.wages,contract.reward);
 assert.equal(game.state.credits,credits+contract.reward);assert.equal(game.state.npcContractHistory.at(-1).outcome,'completed');
 assert.equal(game.hasFlag('crew_watch_completed'),true);assert.equal(game.state.locationId,contract.origin.bodyId);
 assert.equal(game.disembark().ok,false);assert.equal(game.state.credits,credits+contract.reward);
});

test('the original medic watch can end at the airlock after an early return with only actual treatment pay',()=>{
 const game=new Game('original-watch-airlock',{openingMission:true});ok(game.acceptNpcContract('medic'));
 const contract=game.state.npcContract;until(game,()=>contract.phase==='working');
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.medical);ok(game.npcContractAction('heal'));
 assert.ok(contract.work.progress>0&&contract.work.progress<1);const expected=Math.floor(contract.reward*.35*contract.work.progress);
 ok(game.cancelNpcContract());until(game,()=>contract.phase==='docked');atAirlock(game);
 assert.equal(ok(game.disembark()).wages,expected);assert.equal(game.state.npcContract,null);
});

test('new airlock settlement cannot mint full completion away from the hiring port and rejects a false berth',()=>{
 const game=watch(),contract=game.state.npcContract;arrive(game);
 const destination=game.system.bodies.find(body=>body.id===contract.destination.bodyId),credits=game.state.credits;
 contract.work.done=true;contract.work.progress=1;
 assert.equal(settleNpcContract(game,{disembarkingAt:game.system.bodies.find(body=>body.id===contract.origin.bodyId)}).code,'docking');
 assert.equal(game.state.credits,credits);assert.equal(contract.active,true);
 const result=ok(settleNpcContract(game,{ship:game.state.ship,disembarkingAt:destination}));
 assert.equal(result.wages,Math.floor(contract.reward*.35));assert.equal(contract.outcome,'partial');
 assert.equal(game.hasFlag('crew_watch_completed'),false);assert.equal(result.destination.bodyId,destination.id);
});

test('emergency and already-settled watch bookkeeping cannot award wages or trap a docked worker',()=>{
 for(const kind of ['emergency','already-paid']){
  const game=watch(),contract=game.state.npcContract,own=contract.personal.ship,credits=game.state.credits;
  contract.work.progress=1;contract.work.done=true;
  if(kind==='emergency')contract.emergency=true;
  else game.state.npcContractHistory.push({id:contract.id,wages:23,outcome:'partial'});
  const result=ok(game.disembark());assert.equal(result.wages,0);assert.equal(game.state.credits,credits);
  assert.equal(game.state.npcContract,null);assert.equal(game.state.ship,own);assert.equal(game.state.locationId,contract.origin.bodyId);
  assert.equal(game.state.npcContractHistory.filter(entry=>entry.id===contract.id).length,1);
 }
});

test('save and resume retain an unfinished docked watch and keep its personal hull and inventory distinct',()=>{
 const game=watch(),contract=game.state.npcContract;
 contract.personal.cargo.ore=13;contract.personal.upgrades.shield_1=1;
 const expected=structuredClone(contract.personal),employer=game.state.ship.id,reloaded=Game.fromSave(game.save());
 assert.equal(reloaded.state.ship.id,employer);assert.equal(reloaded.dockedPortInfo().id,contract.origin.bodyId);
 ok(reloaded.disembark());assert.equal(reloaded.state.ship.id,expected.ship.id);assert.notEqual(reloaded.state.ship.id,employer);
 assert.deepEqual(reloaded.state.cargo,expected.cargo);assert.deepEqual(reloaded.state.upgrades,expected.upgrades);
 assert.deepEqual({x:reloaded.state.ship.x,y:reloaded.state.ship.y},{x:expected.ship.x,y:expected.ship.y});
});

test('older receiving saves restore a confirmed mooring without treating a nearby underway ship as docked',()=>{
 const game=watch();arrive(game);const destination=game.state.npcContract.destination.bodyId,saved=game.save();
 saved.npcContract.dockedAt=null;delete saved.ship.dockedAt;delete saved.interior.location.dockedAt;
 const restored=Game.fromSave(saved);assert.equal(restored.dockedPortInfo().id,destination);
 restored.drainEvents();const result=ok(restored.disembark());assert.equal(restored.state.locationId,destination);
 assert.equal(restored.drainEvents().filter(event=>event.text===result.text).length,1,'Earned wages receive one caption.');
 saved.npcContract.assignment.visitedDestination=false;
 const notArrived=Game.fromSave(saved);assert.equal(notArrived.dockedPortInfo(),null);assert.equal(notArrived.disembark().code,'docking');
 saved.npcContract.assignment.visitedDestination=true;saved.npcContract.phase='outbound';
 const underway=Game.fromSave(saved);assert.equal(underway.dockedPortInfo(),null);assert.equal(underway.disembark().code,'docking');
});

test('an exterior fitting hold is still in space and its airlock retains the hull-walk task',()=>{
 const game=watch({family:'hullwork'});arrive(game);
 assert.equal(game.state.npcContract.dockedAt,null);assert.equal(game.dockedPortInfo(),null);
 assert.equal(game.disembark().code,'docking');ok(game.npcContractAction('enterEva'));assert.equal(game.state.interior.kind,'eva');
});

test('the explicit own-ship helm stays separate from the docked airlock',()=>{
 const game=new Game('own-docked-cabin',{openingMission:true}),body=game.currentBody,own=game.state.ship;
 // The same internal cabin entry is used when loading an occupied docked deck.
 own.dockedAt=body.id;ok(game._enterInterior(game._cabinLocation(),'ship'));
 assert.equal(game.dockedPortInfo().id,body.id);ok(game.quickHelm());
 assert.equal(game.state.mode,'ship');assert.equal(game.state.ship,own);assert.equal(game.state.ship.dockedAt,null);
 assert.equal(game.state.interior,null);assert.equal(game.state.locationId,null);
});

test('every docked boarding exit uses the occupied hull despite a stale tether, hostile deck, or destroyed origin',()=>{
 for(const method of ['disembark','leaveInterior','exitCabin','retreatBoarding','returnToOwnShip']){
  const game=new Game(`docked-boarder:${method}`),own=game.state.ship;
  Object.assign(own,{x:0,y:500});
  const enemy=placeRaider(game,{x:80,y:500,hp:14,maxHp:46,disabled:true,active:false});ok(game.boardEnemy(enemy.id));
  const body=game.system.bodies.find(body=>body.id==='morrow'),credits=game.state.credits;
  Object.assign(enemy,{x:body.x,y:body.y+body.radius+70,dockedAt:body.id});
  game.state.returnVesselId=own.id;game.state.interior.returnLocation='kettle';own.hull=0;own.destroyed=true;
  game.portAccess=()=>({ok:false,code:'permission'});game.state.pendingEncounter={id:'union_strike'};
  atAirlock(game);const guards=enemy.deck.enemies.filter(actor=>actor.health>0).length;
  const result=ok(game[method]());assert.equal(result.body.id,body.id,method);assert.equal(game.state.locationId,body.id,method);
  assert.equal(game.state.ship,own);assert.equal(game.state.credits,credits);assert.equal(enemy.deck.cleared,false);
  assert.equal(enemy.deck.enemies.filter(actor=>actor.health>0).length,guards);assert.equal(enemy.capturedBy,undefined);
  assert.equal(game.state.returnVesselId,null);assert.equal(game.state.boarding,null);
 }
});

test('a persisted docked hostile hull keeps its actual berth when the boarding deck resumes',()=>{
 const game=new Game('saved-docked-enemy');Object.assign(game.state.ship,{x:0,y:500});
 const enemy=placeRaider(game,{x:80,y:500,hp:14,maxHp:46,disabled:true,active:false});ok(game.boardEnemy(enemy.id));
 const body=game.system.bodies.find(body=>body.id==='morrow');Object.assign(enemy,{x:body.x,y:body.y+body.radius+70,dockedAt:body.id});atAirlock(game);
 const restored=Game.fromSave(game.save());assert.equal(restored.dockedPortInfo().id,body.id);
 ok(restored.disembark());assert.equal(restored.state.locationId,body.id);
});
