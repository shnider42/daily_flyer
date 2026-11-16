import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {FIELD_HOSPITALS} from '../dist/medical-recovery.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function navy(side='freewake',{startMode='regular'}={}){
 const game=new Game(`field-evacuation-${side}`,{startMode});
 Object.assign(game.state.professions.careers.military,{enlisted:true,factionId:side,completed:8,xp:8});
 Object.assign(game.state.militaryCareer,{factionId:side,branchId:'navy'});
 game.state.systemId='crosswind';game._loadSystem('crosswind');
 game._arriveAsPassenger(game.system.bodies.find(body=>body.id==='crosswind-vey'));
 return game;
}
function loseShip(game){
 game.releaseWarzoneSurface();Object.assign(game.state,{mode:'ship',locationId:null,interior:null});
 game._damageShip(99999);
}
function recoverWake(game){for(let i=0;i<70;i++)game.step(.1,{});}
function arrive(game){
 for(let i=0;i<1200&&game.state.npcContract&&game.state.npcContract.phase!=='docked';i++)game.step(.1,{});
 assert.equal(game.state.npcContract?.phase,'docked');
}

for(const side of ['freewake','meridian'])test(`${side} Navy ship-loss survivors can leave Vey on real free transport after waking`,()=>{
 let game=navy(side);game.state.credits=0;const rank=structuredClone(game.state.professions.careers.military);
 loseShip(game);const recoveryId=game.state.medicalRecovery.id;
 assert.equal(game.state.locationId,'crosswind-vey');assert.equal(game.militaryRecoveryStatus().detained,false);
 assert.equal(game.militaryRecoveryStatus().evacuation,true);assert.equal(game.militaryRecoveryStatus().pickup.factionId,side);
 assert.equal(game.atInhabitedPort,false);assert.deepEqual(game.passengerRoutes(),[]);
 assert.equal(game.service('refuel').ok,false);assert.equal(game.startMilitaryPassage().ok,false,'Cannot board during the waking transition.');
 recoverWake(game);assert.equal(game.militaryRecoveryStatus().canBook,true);
 const medic=game._expeditionSurface().entities.find(entity=>entity.id===game.militaryRecoveryStatus().pickup.entityId);
 assert.ok(medic);Object.assign(game.state.person,{x:medic.x,y:medic.y});assert.equal(game.militaryRecoveryStatus().canBook,true,'The visible medic marker is inside the pickup area.');
 const history=structuredClone(game.state.fleet.history),personalId=game.state.ship.id;
 ok(game.startMilitaryPassage());const carrierId=game.state.ship.id,start={x:game.state.ship.x,y:game.state.ship.y};
 assert.notEqual(carrierId,personalId);assert.equal(game.ownsShip,false);assert.equal(game.state.exploration,null);
 for(let i=0;i<80;i++)game.step(.1,{});
 assert.equal(game.state.npcContract.phase,'outbound');assert.ok(Math.hypot(game.state.ship.x-start.x,game.state.ship.y-start.y)>0);
 game=Game.fromSave(game.save());assert.equal(game.state.ship.id,carrierId);assert.equal(game.militaryRecoveryStatus().passage,true);
 arrive(game);ok(game.completeNpcContract());
 assert.equal(game.state.locationId,side==='freewake'?'morrow':'serein');assert.equal(game.state.ship.id,personalId);
 assert.equal(game.ownsShip,false);assert.equal(game.state.credits,0);assert.equal(game.state.medicalRecovery.id,recoveryId);
 assert.deepEqual(game.state.professions.careers.military,rank);assert.deepEqual(game.state.fleet.history,history);
 assert.equal(game.state.npcContractHistory.at(-1).fare,0);
});

test('old stranded field survivors receive one warrant on reload without moving or resetting their captain',()=>{
 let game=navy('meridian');const own=structuredClone(game.state.ship);
 game.state.livelihoods.parkedShip={...own,systemId:'hearth',bodyId:'morrow',vesselId:own.id};
 game.state.person.health=0;game.state.person.down=true;ok(game.recoverOnFoot());recoverWake(game);
 game.state.militaryRecovery=null;game.state.person.x+=180;game.state.credits=317;
 const saved={position:{x:game.state.person.x,y:game.state.person.y},ship:structuredClone(game.state.ship),berth:structuredClone(game.state.livelihoods.parkedShip),rank:structuredClone(game.state.professions.careers.military),receipt:structuredClone(game.state.medicalRecovery),history:structuredClone(game.state.fleet.history)};
 game=Game.fromSave(game.save());const first=structuredClone(game.state.militaryRecovery),logCount=game.state.journal.length;
 assert.equal(game.militaryRecoveryStatus().evacuation,true);assert.equal(game.militaryRecoveryStatus().nearPickup,false);assert.equal(game.militaryRecoveryStatus().canBook,false);
 assert.match(game.militaryRecoveryStatus().reason,/Combine field hospital/);
 assert.deepEqual({x:game.state.person.x,y:game.state.person.y},saved.position);assert.equal(game.state.credits,317);
 assert.deepEqual(game.state.ship,saved.ship);assert.deepEqual(game.state.livelihoods.parkedShip,saved.berth);assert.deepEqual(game.state.professions.careers.military,saved.rank);
 assert.deepEqual(game.state.medicalRecovery,saved.receipt);assert.deepEqual(game.state.fleet.history,saved.history);
 game.initializeMilitaryRecovery();assert.deepEqual(game.state.militaryRecovery,first);assert.equal(game.state.journal.length,logCount);
 game=Game.fromSave(game.save());assert.deepEqual(game.state.militaryRecovery,first);assert.equal(game.state.journal.length,logCount);
 Object.assign(game.state.person,FIELD_HOSPITALS.meridian);ok(game.startMilitaryPassage());arrive(game);ok(game.completeNpcContract());
 assert.equal(game.ownsShip,true);assert.equal(game.state.ship.id,own.id);assert.deepEqual(game.state.livelihoods.parkedShip,saved.berth);
});

test('field evacuation rescues suspended naval casualties without restoring their service clearance',()=>{
 const game=navy();loseShip(game);recoverWake(game);game.state.rep.freewake=-30;
 assert.equal(game.militaryRecoveryStatus().canBook,true);ok(game.startMilitaryPassage());arrive(game);ok(game.completeNpcContract());
 assert.equal(game.state.rep.freewake,-30);assert.equal(game.state.professions.careers.military.enlisted,true);
 game._arriveAsPassenger(game.system.bodies.find(body=>body.id==='kettle'));game.applyMilitaryRecovery({nearestBody:game.currentBody});
 assert.equal(game.startMilitaryPassage().ok,false,'Ordinary repatriation still requires service clearance.');
});

test('a voluntary Vey visit does not create a casualty warrant and civilians gain no military ship or clearance',()=>{
 const visiting=navy();visiting.initializeMilitaryRecovery();assert.equal(visiting.militaryRecoveryStatus(),null);assert.equal(visiting.startMilitaryPassage().ok,false);
 const civilian=navy();civilian.state.professions.careers.military.enlisted=false;loseShip(civilian);recoverWake(civilian);
 assert.equal(civilian.militaryRecoveryStatus(),null);assert.equal(civilian.startMilitaryPassage().ok,false);assert.equal(civilian.ownsShip,false);
});
