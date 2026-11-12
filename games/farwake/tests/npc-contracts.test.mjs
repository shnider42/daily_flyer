import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { cabinLayout, isCabinWalkable } from '../dist/interior-layouts.mjs';
import { ensureDamageControl } from '../dist/interior-damage.mjs';
import { createNpcContract, npcContractPilot, performNpcContractWork, settleNpcContract } from '../dist/npc-contracts.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function atPort(seed='npc-watch',options={}){
 const game=new Game(seed,options),body=game.system.bodies.find(body=>body.id==='kettle');
 if(game.state.mode==='ship'){Object.assign(game.state.ship,{x:body.x+body.radius+70,y:body.y,vx:0,vy:0});ok(game.dock(body.id));}
 return game;
}
function tick(game,seconds,input={}){for(let i=0;i<Math.ceil(seconds*10);i++)game.step(.1,input);}
function until(game,predicate,seconds=100){
 for(let i=0;i<seconds*10&&!predicate();i++)game.step(.1,{});
 assert.ok(predicate(),`Timed out: ${JSON.stringify(game.npcContractStatus())}`);
}
function working(role,options={}){
 const game=atPort(`npc-${role}`,options);ok(game.acceptNpcContract(role));
 until(game,()=>game.state.npcContract.phase==='working');return game;
}
function finishReturn(game){until(game,()=>game.state.npcContract.phase==='docked');return ok(game.completeNpcContract());}

test('regular and Hardcore captains can hire onto an actual employer hull without buying it',()=>{
 for(const startMode of ['regular','hardcore']){
  const game=atPort(`hire-${startMode}`,{startMode}),ship=game.state.ship,owned=[...game.state.fleet.owned],credits=game.state.credits;
  const offers=game.npcContractOffers();assert.equal(offers.length,8);assert.ok(offers.every(offer=>offer.available&&offer.cost===0&&offer.offerId));
  ok(game.acceptNpcContract('medic'));
  assert.notEqual(game.state.ship,ship);assert.equal(game.state.ship.id,game.state.npcContract.vesselId);
  assert.equal(game.state.npcContract.personal.ship,ship);assert.deepEqual(game.state.fleet.owned,owned);assert.equal(game.state.credits,credits);
  assert.equal(game.state.mode,'person');assert.equal(game.state.interior.location.vesselId,game.state.ship.id);
  assert.equal(game.state.ship.berths,3);assert.equal(game.state.crew.length,2);assert.equal(game.state.ship.npcEmployer,true);
  assert.equal(game.acceptNpcContract('gunner').code,'contract');
  assert.equal(game.quickHelm().ok,false,'Hired crew cannot take their employer’s helm.');
 }
});

test('NPC physically flies while the worker stays on deck and the employee controls cannot redirect it',()=>{
 const game=atPort(),ownPosition={x:game.state.ship.x,y:game.state.ship.y};ok(game.acceptNpcContract('medic'));
 const start={x:game.state.ship.x,y:game.state.ship.y},neutral=Game.fromSave(game.save());
 tick(game,7,{thrust:-1,turn:1,strafe:1});
 tick(neutral,7,{});
 assert.ok(Math.hypot(game.state.ship.x-start.x,game.state.ship.y-start.y)>10);
 assert.equal(game.state.mode,'person');
 for(const key of ['x','y','vx','vy','angle','angularVelocity'])assert.ok(Math.abs(game.state.ship[key]-neutral.state.ship[key])<1e-9,`NPC controls own ${key}`);
 assert.deepEqual({x:game.state.npcContract.personal.ship.x,y:game.state.npcContract.personal.ship.y},ownPosition);
 until(game,()=>game.state.npcContract.phase==='working');
 assert.ok(Math.hypot(game.state.ship.x-start.x,game.state.ship.y-start.y)>450);
});

test('medic must actually heal the named worker at the medical station before full wages',()=>{
 const game=working('medic'),contract=game.state.npcContract,patient=game.state.crew.find(crew=>crew.id===contract.work.crewId),before=game.state.credits;
 assert.equal(patient.health,38);assert.equal(game.state.interior.location.crew.find(crew=>crew.id===patient.id).health,38);
 Object.assign(game.state.person,{x:-100,y:-100});assert.equal(game.npcContractAction('heal').code,'distance');
 assert.equal(game.completeNpcContract().code,'docking');assert.equal(game.state.credits,before);
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.medical);
 for(let i=0;i<15&&!contract.work.done;i++){ok(game.npcContractAction('heal'));if(!contract.work.done)tick(game,6.2);}
 assert.ok(contract.work.done);assert.ok(patient.health>=90);assert.ok(contract.work.healed>=40);
 const result=finishReturn(game);assert.equal(result.wages,contract.reward);assert.equal(game.state.credits,before+contract.reward);
 assert.equal(game.state.npcContract,null);assert.equal(game.state.interior,null);assert.equal(game.state.locationId,contract.origin.bodyId);
 assert.equal(game.completeNpcContract().ok,false);assert.equal(game.state.credits,before+contract.reward);
});

test('normal physical damage-control actions count; passive fire exhaustion does not',()=>{
 const game=working('firehand'),contract=game.state.npcContract,section=ensureDamageControl(game.state.ship).sections.find(section=>section.id===contract.work.sectionId);
 assert.ok(section.fire>60);assert.ok(section.damage>=32);assert.equal(contract.work.progress,0);
 const hull=game.state.ship.hull;tick(game,4);assert.equal(contract.work.fireRemoved,0);assert.equal(contract.work.damageRepaired,0);
 Object.assign(game.state.person,section);
 ok(game.damageControl(section.id,'suppress'));tick(game,1.3);ok(game.damageControl(section.id,'suppress'));tick(game,1.3);
 ok(game.damageControl(section.id,'repair'));tick(game,.1);
 assert.ok(contract.work.done);assert.equal(section.fire,0);assert.ok(section.damage<=2);assert.equal(game.state.ship.hull,hull,'Compartment work does not invent exterior hull repair.');
 assert.equal(finishReturn(game).wages,contract.reward);
});

test('medic progress also observes ordinary medical-station treatment of real crew',()=>{
 const game=working('medic'),contract=game.state.npcContract;
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.medical);
 ok(game.medicalFromStation());tick(game,.1);
 assert.ok(contract.work.healed>0);assert.ok(contract.work.progress>0);assert.ok(contract.work.progress<1);
});

test('gunner hold-fire launches actual projectiles, damages the real raider, and earns through contribution',()=>{
 const game=working('gunner'),contract=game.state.npcContract,enemy=game.system.enemies.find(enemy=>enemy.id===contract.work.enemyId);
 assert.ok(enemy);assert.equal(enemy.hp,60);assert.equal(game.system.enemies.filter(enemy=>enemy.crewContractId===contract.id).length,1);
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);
 let sawShot=false,sawFiringStatus=false;
 for(let i=0;i<400&&contract.phase==='working';i++){
  game.step(.1,{fire:true});if(game.system.bullets.some(bullet=>bullet.ownerId===game.playerId&&bullet.vesselId===contract.vesselId))sawShot=true;
  if(game.npcContractStatus().firing&&/Ship guns firing/.test(game.npcContractStatus().task))sawFiringStatus=true;
 }
 assert.ok(sawShot);assert.ok(sawFiringStatus);assert.ok(enemy.hp<60);assert.ok(enemy.disabled||enemy.hp<=0);
 assert.ok(contract.work.damage>=12);assert.ok(contract.work.done);assert.equal(contract.phase,'returning');
 const announcements=game.drainEvents().filter(event=>event.type==='crew-duty');
 assert.equal(announcements.filter(event=>event.text.startsWith('Ship guns firing.')).length,1);
 assert.equal(announcements.filter(event=>event.text.startsWith('Gunner: confirmed hit.')).length,1);
 assert.match(game.npcContractStatus().task,/Target disabled/);
 assert.equal(finishReturn(game).wages,contract.reward);
});

test('gunner cannot fire the employer guns from a remote deck position or different role',()=>{
 const game=working('gunner'),before=game.system.bullets.length;
 Object.assign(game.state.person,{x:-80,y:-80});tick(game,.3,{fire:true});
 assert.equal(game.system.bullets.filter(bullet=>bullet.ownerId===game.playerId).length,0);assert.equal(game.npcContractAction('fire').code,'distance');
 const medic=working('medic');assert.equal(medic.npcContractAction('fire').code,'role');
 assert.ok(before>=0);
});

test('a third party disabling the target cannot earn a gunner the full wage',()=>{
 const game=working('gunner'),contract=game.state.npcContract,enemy=game.system.enemies.find(enemy=>enemy.id===contract.work.enemyId);
 enemy.professionContributors.friend=40;enemy.hp=20;enemy.disabled=true;tick(game,.2);
 assert.equal(contract.work.done,false);assert.equal(contract.work.damage,0);
 ok(game.cancelNpcContract());const result=finishReturn(game);assert.equal(result.wages,0);
});

test('early return flies home, pays only actual completed work, and restores exact owned inventory',()=>{
 const game=atPort('crew-return');game.state.cargo={ore:17,crystal:3};game.state.upgrades.shield_1=1;
 const own=game.state.ship,position={x:own.x,y:own.y},cargo=game.state.cargo,upgrades=game.state.upgrades;
 game.state.livelihoods.parkedShip={...structuredClone(own),systemId:'vesper',bodyId:'remote-port',vesselId:own.id};
 const parked=structuredClone(game.state.livelihoods.parkedShip);ok(game.acceptNpcContract('medic'));until(game,()=>game.state.npcContract.phase==='working');
 const contract=game.state.npcContract;Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.medical);ok(game.npcContractAction('heal'));
 ok(game.cancelNpcContract());assert.equal(game.state.npcContract.phase,'returning');assert.equal(game.state.ship.id,contract.vesselId);
 const result=finishReturn(game);assert.ok(result.wages>0&&result.wages<contract.reward);
 assert.equal(game.state.ship,own);assert.equal(game.state.cargo,cargo);assert.equal(game.state.upgrades,upgrades);
 assert.deepEqual({x:own.x,y:own.y},position);assert.deepEqual(game.state.livelihoods.parkedShip,parked);
});

test('save and restore keep employer, damaged compartment, actual patient, and personal ownership separate',()=>{
 const game=working('medic',{startMode:'hardcore'}),contract=game.state.npcContract,owned=[...game.state.fleet.owned];
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.medical);ok(game.npcContractAction('heal'));
 const saved=game.save(),restored=Game.fromSave(saved),next=restored.state.npcContract;
 assert.equal(next.id,contract.id);assert.equal(next.work.healed,contract.work.healed);assert.equal(restored.state.ship.id,next.vesselId);
 assert.equal(restored.state.crew.find(crew=>crew.id===next.work.crewId).health,game.state.crew.find(crew=>crew.id===contract.work.crewId).health);
 assert.deepEqual(restored.state.fleet.owned,owned);assert.equal(restored.ownsShip,false);assert.equal(next.personal.ship.unowned,true);
 ok(restored.cancelNpcContract());finishReturn(restored);assert.equal(restored.ownsShip,false);assert.deepEqual(restored.state.fleet.owned,owned);
});

test('emergency recovery never grants the employer hull or destroys the parked personal ship',()=>{
 for(const startMode of ['regular','hardcore']){
  const game=atPort(`rescue-${startMode}`,{startMode}),ship=game.state.ship,owned=[...game.state.fleet.owned],credits=game.state.credits;
  ok(game.acceptNpcContract('firehand'));const employerId=game.state.ship.id;game._rescue('Watch evacuation');
  assert.equal(game.state.ship,ship);assert.notEqual(game.state.ship.id,employerId);assert.deepEqual(game.state.fleet.owned,owned);assert.equal(game.state.credits,credits);
  assert.equal(game.state.mode,'person');assert.equal(game.state.locationId,'kettle');assert.equal(game.state.npcContract,null);
  assert.equal(game.state.npcContractHistory.at(-1).wages,0);assert.equal(game.state.npcContractHistory.at(-1).outcome,'interrupted');
 }
});

test('server helpers operate a separate physical employer actor and validate actual employee deck access',()=>{
 const worker=atPort('crew-server'),owned=worker.state.ship,result=ok(createNpcContract(worker,'medic',{employeeId:'employee',shared:true}));
 const actor=Game.fromSave(worker.save());actor._playerId='employee';actor.state.ship=result.ship;Object.assign(actor.state,result.inventory);actor.state.npcContract=result.contract;actor.state.mode='ship';actor.state.interior=null;
 worker._playerId='employee';worker.state.npcContract=result.contract;worker.state.interior={kind:'ship',location:{vesselId:result.ship.id,shipClass:result.ship.classId}};
 until(actor,()=>actor.state.npcContract.phase==='working');
 Object.assign(worker.state.person,cabinLayout(actor.state.ship.classId).stations.medical);
 const patient=actor.state.crew.find(crew=>crew.id===result.contract.work.crewId);
 ok(performNpcContractWork(actor,'heal',{worker,playerId:'employee'}));assert.ok(patient.health>38);assert.equal(worker.state.ship,owned);
 assert.equal(performNpcContractWork(actor,'heal',{worker,playerId:'impostor'}).code,'permission');
 worker.state.interior=null;assert.equal(performNpcContractWork(actor,'heal',{worker,playerId:'employee'}).code,'vessel');
 assert.equal(settleNpcContract(actor).code,'docking');
});

test('restored gunner retains real contribution and does not create duplicate incident contacts',()=>{
 const game=working('gunner'),contract=game.state.npcContract,enemy=game.system.enemies.find(enemy=>enemy.id===contract.work.enemyId);
 enemy.professionContributors[game.playerId]=14;enemy.hp=46;tick(game,.1);
 const restored=Game.fromSave(game.save());assert.equal(restored.state.npcContract.work.damage,14);
 tick(restored,1);assert.equal(restored.system.enemies.filter(enemy=>enemy.id===contract.work.enemyId).length,1);
 assert.equal(restored.state.npcContract.work.damage,14);
});

test('NPC pilot turns with physical angular acceleration and settlement cannot be faked by phase alone',()=>{
 const game=working('medic'),contract=game.state.npcContract;
 ok(game.cancelNpcContract());const angle=game.state.ship.angle,controls=npcContractPilot(game);assert.ok(Math.abs(controls.turn)>0);
 game.step(.1,{});assert.ok(Math.abs(game.state.ship.angle-angle)<.1);assert.notEqual(game.state.ship.angularVelocity,0);
 contract.phase='docked';contract.dockedAt=contract.origin.bodyId;
 assert.equal(settleNpcContract(game).code,'docking');assert.equal(contract.paid,false);
});

test('NPC pilot and patient occupy real walkable positions and a fatality ends the task',()=>{
 const game=working('medic'),contract=game.state.npcContract,layout=cabinLayout(game.state.ship.classId);
 const pilot=game.state.crew.find(crew=>crew.role==='pilot'),patient=game.state.crew.find(crew=>crew.id===contract.work.crewId);
 assert.deepEqual({x:pilot.x,y:pilot.y},{x:layout.stations.helm.x,y:layout.stations.helm.y});
 assert.ok(isCabinWalkable(layout,patient.x,patient.y,6));assert.ok(Math.hypot(patient.x-layout.stations.medical.x,patient.y-layout.stations.medical.y)<=24);
 assert.deepEqual(game._damageCrewPositions.find(crew=>crew.crewId===patient.id),{crewId:patient.id,x:patient.x,y:patient.y});
 patient.health=0;patient.status='dead';tick(game,.1);
 assert.equal(contract.phase,'returning');assert.equal(contract.work.done,false);assert.match(contract.failure,/did not survive/);
 assert.equal(finishReturn(game).wages,0);
});

test('a lost NPC pilot triggers physical emergency return and no successful-watch pay',()=>{
 const game=working('medic'),contract=game.state.npcContract,pilot=game.state.crew.find(crew=>crew.role==='pilot');
 pilot.health=0;pilot.status='dead';tick(game,.1);
 assert.equal(contract.emergency,true);assert.equal(contract.phase,'returning');assert.match(contract.failure,/Emergency navigation/);
 assert.equal(finishReturn(game).wages,0);assert.equal(game.state.npcContractHistory.at(-1).outcome,'interrupted');
});
