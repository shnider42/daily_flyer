import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { cabinLayout } from '../dist/fleet.mjs';
import { MILITARY_DETENTION_SECONDS } from '../dist/military-recovery.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function at(game,systemId,bodyId){if(game.state.systemId!==systemId){game._persistRuntime();game.state.systemId=systemId;game._loadSystem(systemId);}game._arriveAsPassenger(game.system.bodies.find(body=>body.id===bodyId));}
function captain({military=true,factionId='freewake',systemId='hearth',bodyId='kettle',startMode='hardcore'}={}){const game=new Game('military-recovery',{startMode});if(military){Object.assign(game.state.professions.careers.military,{enlisted:true,factionId});Object.assign(game.state.militaryCareer,{factionId,branchId:'army'});}at(game,systemId,bodyId);return game;}
function recover(game,faction=game.currentSystem.faction){return game.applyMilitaryRecovery({systemId:game.state.systemId,originFactionId:faction,nearestBody:{systemId:game.state.systemId,bodyId:game.state.locationId}});}
function tick(game,seconds){for(let i=0;i<Math.round(seconds*10);i++)game.step(.1,{});}
function arrive(game){for(let i=0;i<4000&&game.state.npcContract?.phase!=='docked';i++)game.step(.1,{});assert.equal(game.state.npcContract?.phase,'docked');}

test('only enlisted opposing military becomes a prisoner; neutral civilians receive no military clearance',()=>{
 const civilian=captain({military:false,systemId:'meridian',bodyId:'ledger'});assert.equal(recover(civilian),null);assert.equal(civilian.militaryRecoveryStatus(),null);assert.equal(civilian.startMilitaryPassage().ok,false);
 const ally=captain({systemId:'vesper',bodyId:'listening'});recover(ally);assert.equal(ally.militaryRecoveryStatus().detained,false);assert.equal(ally.militaryRecoveryStatus().canBook,true);
 const enemy=captain({systemId:'meridian',bodyId:'ledger'});recover(enemy);assert.equal(enemy.militaryRecoveryStatus().detained,true);assert.equal(enemy.state.interior.kind,'detention');assert.equal(generateSurface(enemy.currentBody,enemy.state.seed).entities.length,0);
});

test('a five-minute sentence survives save/load and releases to the holding station only after time served',()=>{
 let game=captain({systemId:'meridian',bodyId:'ledger'});recover(game);assert.equal(game.militaryRecoveryStatus().remainingSeconds,MILITARY_DETENTION_SECONDS);
 tick(game,73);const remaining=game.state.militaryRecovery.detention.remainingSeconds;game=Game.fromSave(game.serialize());assert.equal(game.state.interior.kind,'detention');assert.equal(game.state.militaryRecovery.detention.remainingSeconds,remaining);
 for(const name of ['launch','travel','takePassengerTransit','startMilitaryPassage','acceptNpcContract','militaryCareerAction','surfaceAction','leaveInterior','useWeapon'])assert.equal(game.militaryRecoveryAccess(name).code,'military-detention');
 assert.equal(game.takePassengerTransit('serein').ok,false);assert.equal(game.startMilitaryPassage().ok,false);
 tick(game,226.9);assert.equal(game.militaryRecoveryStatus().detained,true);tick(game,.1);assert.equal(game.state.interior,null);assert.equal(game.state.locationId,'ledger');assert.equal(game.militaryRecoveryStatus().canBook,true);assert.ok(game.drainEvents().some(event=>event.type==='military-released'));
});

test('capture records the actual opposing faction across reload, even when the nearest berth belongs elsewhere',()=>{
 let game=captain();recover(game,'meridian');assert.equal(game.militaryRecoveryStatus().captorFaction,'Meridian Combine');game=Game.fromSave(game.serialize());assert.equal(game.militaryRecoveryStatus().captorFaction,'Meridian Combine');
});

test('free repatriation flies a physical local shuttle and does not grant its passenger a hull or weapons',()=>{
 const game=captain();game.state.credits=0;recover(game);const rank=structuredClone(game.state.professions.careers.military),personalId=game.state.ship.id;
 ok(game.startMilitaryPassage());const carrierId=game.state.ship.id,origin={x:game.state.ship.x,y:game.state.ship.y};assert.notEqual(carrierId,personalId);assert.equal(game.ownsShip,false);assert.equal(game.gunneryStatus().available,false);assert.equal(game.npcContractAction('fire').ok,false);
 tick(game,6);assert.equal(game.state.npcContract.phase,'outbound');assert.ok(Math.hypot(game.state.ship.x-origin.x,game.state.ship.y-origin.y)>0);assert.equal(game.completeNpcContract().ok,false);
 arrive(game);ok(game.completeNpcContract());assert.equal(game.state.locationId,'morrow');assert.equal(game.state.ship.id,personalId);assert.equal(game.ownsShip,false);assert.equal(game.state.credits,0);assert.deepEqual(game.state.professions.careers.military,rank);assert.equal(game.militaryRecoveryStatus().arrived,true);assert.equal(game.state.npcContractHistory.at(-1).fare,0);
});

test('released prisoners with zero credits can cross systems as passengers using their own clearance',()=>{
 let game=captain({systemId:'meridian',bodyId:'ledger'});game.state.credits=0;recover(game);tick(game,300);ok(game.startMilitaryPassage());tick(game,8);const id=game.state.ship.id;game=Game.fromSave(game.serialize());assert.equal(game.state.npcContract.repatriation,true);assert.equal(game.state.ship.id,id);assert.equal(game.ownsShip,false);
 arrive(game);assert.equal(game.state.systemId,'hearth');assert.equal(game.state.npcContract.route.jumped,true);ok(game.completeNpcContract());assert.equal(game.currentBody.id,'morrow');assert.equal(game.state.credits,0);assert.equal(game.ownsShip,false);
});

test('free passage is bound to personal faction clearance and its own home, not a chosen client destination',()=>{
 const game=captain();recover(game);game.state.rep.freewake=-30;assert.equal(game.startMilitaryPassage().ok,false);game.state.rep.freewake=0;
 game.state.professions.careers.military.factionId='meridian';assert.equal(game.startMilitaryPassage().ok,false);game.state.professions.careers.military.factionId='freewake';
 ok(game.startMilitaryPassage({systemId:'sol',bodyId:'earth'}));assert.deepEqual(game.state.npcContract.destination,{systemId:'hearth',bodyId:'morrow',name:'Morrow'});
});

test('leaving before the shuttle casts off preserves the unused personal warrant',()=>{
 const game=captain();recover(game);ok(game.startMilitaryPassage());Object.assign(game.state.person,cabinLayout(game.state.ship.classId).spawn);ok(game.leaveInterior());assert.equal(game.state.locationId,'kettle');assert.equal(game.militaryRecoveryStatus().canBook,true);assert.equal(game.ownsShip,false);
});

test('interior incapacitation in enemy territory captures the solo soldier without destroying an intact owned ship',()=>{
 const game=captain({startMode:'regular',systemId:'meridian',bodyId:'ledger'}),shipId=game.state.ship.id;game.state.mode='ship';game.state.locationId=null;game._enterInterior(game._cabinLocation(),'ship');Object.assign(game.state.person,{health:0,down:true,interiorDown:{vesselId:shipId,elapsed:4.95}});
 game._stepInteriorRecovery(.1);assert.equal(game.militaryRecoveryStatus().detained,true);assert.equal(game.ownsShip,true);assert.equal(game.state.ship.id,shipId);assert.ok(game.state.ship.hull>0);
});

test('an Army casualty in a rival planetary interior is captured rather than returned outside free to leave',()=>{
 const game=captain({systemId:'meridian',bodyId:'serein'}),outdoors=generateSurface(game.currentBody,game.state.seed,game.state.flags),entrance=outdoors.entities.find(entity=>entity.type==='siteEntrance'&&entity.data?.siteKind!=='military');assert.ok(entrance);
 Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite(entrance.data.siteId));game.state.person.health=0;game.state.person.down=true;ok(game._returnFromSite(true));assert.equal(game.militaryRecoveryStatus().detained,true);assert.equal(game.state.militaryRecovery.detention.bodyId,'ledger');assert.equal(game.ownsShip,false);
});


test('a coincident coordinate never moves an intact ship parked in another system onto a repatriation berth',()=>{
 const game=captain({startMode:'regular',systemId:'vesper',bodyId:'listening'}),origin=game.system.bodies.find(body=>body.id==='listening'),own=game.state.ship;
 Object.assign(own,{x:origin.x,y:origin.y});game.state.livelihoods.parkedShip={...structuredClone(own),systemId:'hearth',bodyId:'morrow',vesselId:own.id};
 const berth=structuredClone(game.state.livelihoods.parkedShip);recover(game);ok(game.startMilitaryPassage());assert.deepEqual(game.state.livelihoods.parkedShip,berth);
 game.state.ship.shield=0;game._damageShip(99999);assert.deepEqual(game.state.livelihoods.parkedShip,berth);assert.equal(game.ownsShip,true);assert.equal(game.state.ship.id,own.id);assert.equal(game.canUseOwnShipHere(),false);
});
