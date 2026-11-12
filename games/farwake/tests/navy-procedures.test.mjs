import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {cabinLayout} from '../dist/interior-layouts.mjs';
import {gunneryOrigin} from '../dist/gunnery.mjs';
import {MILITARY_RECRUITER,militaryMission,militaryBranch} from '../dist/military-content.mjs';
import {NAVY_OPERATION_DEFINITIONS} from '../dist/navy-operations.mjs';
import {navyDutyAccess} from '../dist/navy-duty.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
function veteran(seed='navy-procedure'){
 const game=new Game(seed,{startMode:'hardcore'}),recruiter=generateSurface(game.currentBody,game.state.seed).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);
 Object.assign(game.state.person,{x:recruiter.x,y:recruiter.y});ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter.id}));
 Object.assign(game.state.professions.careers.military,{completed:16,xp:16,rankVersion:1,legacyRankFloor:0});
 game.state.militaryCareer.completed=militaryBranch('freewake','navy').missions.map(mission=>mission.id);return game;
}
function embark(id,seed='navy-procedure'){
 const game=veteran(seed);ok(game.militaryCareerAction({action:'startDeployment',missionId:`freewake-navy-${id}`,entityId:MILITARY_RECRUITER.id}));return game;
}
function until(game,predicate,seconds=280){for(let i=0;i<seconds*10&&!predicate();i++)game.step(.1,{});assert.ok(predicate(),`Timed out: ${game.state.npcContract?.phase}`);}
function goToOrder(game){
 if(game.state.stationView==='gunnery')ok(game.leaveGunnery());const order=game.npcContractStatus().navyOperation.activeTask;assert.ok(order);
 Object.assign(game.state.person,{x:order.target.x,y:order.target.y});return game.npcContractStatus().navyOperation.activeTask;
}
function beginOrder(game,choiceId){const task=goToOrder(game);ok(game.npcContractAction({action:'navyOrder',taskId:task.id,choiceId:choiceId||task.choices[0].id}));return task;}
function finishOrder(game,choiceId){const task=beginOrder(game,choiceId);until(game,()=>game.state.npcContract.navy.operation.stageIndex>game.state.npcContract.navy.operation.tasks.findIndex(item=>item.id===task.id),task.duration+1);}
function fireAtContact(game){
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);if(!game.gunneryStatus().active&&game.gunneryStatus().available)ok(game.enterGunnery());
 const contract=game.state.npcContract,target=game.system.enemies.find(enemy=>contract.navy.targetIds.includes(enemy.id)&&!enemy.disabled&&enemy.hp>0);if(!target)return{};
 const origin=gunneryOrigin(game.state.ship),travel=distance(target,origin)/650,dx=target.x+(target.vx||0)*travel-origin.x,dy=target.y+(target.vy||0)*travel-origin.y,length=Math.hypot(dx,dy);
 return{aiming:true,aimX:dx/length,aimY:dy/length,fire:true};
}

test('eight additional fleet procedures have distinct physical work and preserve the original qualification IDs',()=>{
 const branch=militaryBranch('freewake','navy');assert.equal(branch.deployments.length,14);
 assert.deepEqual(branch.missions.map(mission=>mission.id),['freewake-navy-battery','freewake-navy-escort','freewake-navy-distress','freewake-navy-patrol']);
 const orders=branch.deployments.filter(mission=>NAVY_OPERATION_DEFINITIONS[mission.navy.kind]);assert.equal(orders.length,8);
 assert.equal(new Set(orders.map(mission=>mission.navy.kind)).size,8);
 for(const mission of orders){const definition=NAVY_OPERATION_DEFINITIONS[mission.navy.kind];assert.equal(definition.stages.length,3);assert.ok(new Set(definition.stages.map(stage=>stage.station)).size>=2);assert.ok(definition.stages.every(stage=>stage.duration>=12));}
 assert.equal(militaryMission('freewake-navy-escort').navy.escort,true);assert.equal(militaryMission('freewake-navy-distress').navy.procedureKind,'rescue');
});

test('a full quiet replenishment performs real attended transfers, returns and pays exactly once',()=>{
 let game=embark('fleet-replenishment','replenishment-proof'),contract=game.state.npcContract,credits=game.state.credits;
 until(game,()=>contract.phase==='working');const contact=game.system.parkedShips.find(ship=>ship.militaryObjective);assert.ok(contact);assert.equal(contact.name,'Fleet auxiliary Long Table');
 // A long gun watch cannot substitute for the posted deck orders.
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);ok(game.enterGunnery());for(let i=0;i<500;i++)game.step(.1,{});
 assert.equal(contract.work.done,false);assert.equal(contract.navy.operation.stageIndex,0);assert.equal(contract.navy.spawned,false);
 finishOrder(game);finishOrder(game);finishOrder(game);until(game,()=>contract.phase==='docked');assert.equal(contract.work.done,true);assert.equal(contract.work.shots,0);
 const id=contract.id;game=Game.fromSave(game.save());contract=game.state.npcContract;assert.equal(contract.id,id);assert.equal(contract.navy.operation.tasks.every(task=>task.done),true);
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).spawn);ok(game.disembark());assert.equal(game.state.militaryCareer.active.phase,'debrief');
 const recruiter=generateSurface(game.currentBody,game.state.seed).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);Object.assign(game.state.person,recruiter);
 const result=ok(game.militaryCareerAction({action:'debrief',entityId:recruiter.id}));assert.equal(result.paid,260);assert.equal(game.state.credits,credits+260);assert.equal(game.militaryCareerAction({action:'debrief',entityId:recruiter.id}).ok,false);
});

test('ordered assistance pauses when a sailor leaves or is downed, survives a save, and rejects forged or repeated orders',()=>{
 let game=embark('approach-survey','survey-attendance');until(game,()=>game.state.npcContract.phase==='working');
 let contract=game.state.npcContract,order=goToOrder(game);
 assert.equal(game.npcContractAction({action:'navyOrder',taskId:'publish',choiceId:'notice'}).code,'task');
 assert.equal(game.npcContractAction({action:'navyOrder',taskId:order.id,choiceId:'invented-order'}).code,'choice');
 beginOrder(game);for(let i=0;i<30;i++)game.step(.1,{});const elapsed=contract.navy.operation.tasks[0].elapsed;assert.ok(elapsed>2.9);
 game.state.person.x+=80;for(let i=0;i<40;i++)game.step(.1,{});assert.equal(contract.navy.operation.tasks[0].elapsed,elapsed);
 game=Game.fromSave(game.save());contract=game.state.npcContract;assert.equal(contract.navy.operation.tasks[0].elapsed,elapsed);
 goToOrder(game);game.state.person.down=true;for(let i=0;i<20;i++)game.stepNpcContract(.1,{});assert.equal(contract.navy.operation.tasks[0].elapsed,elapsed);game.state.person.down=false;
 assert.equal(game.npcContractAction({action:'navyOrder',taskId:order.id,choiceId:order.choices[0].id}).code,'running');
 until(game,()=>contract.navy.operation.stageIndex===1,15);assert.equal(contract.navy.operation.tasks[0].done,true);
 assert.equal(game.npcContractAction({action:'navyOrder',taskId:order.id,choiceId:order.choices[0].id}).code,'task');
});

test('identification preserves both seeded outcomes, withholds fire before the challenge and requires the observed disposition',()=>{
 const outcomes=new Set();
 for(let attempt=0;attempt<24&&outcomes.size<2;attempt++){
  let game=embark('traffic-identification',`inspection-outcome-${attempt}`),contract=game.state.npcContract;
  const planned=contract.navy.attackPlanned;if(outcomes.has(planned))continue;
  until(game,()=>contract.phase==='working');goToOrder(game);ok(game.enterGunnery());assert.equal(game.npcContractAction('fire').code,'rules-of-engagement');assert.equal(contract.navy.operation.identified,false);assert.equal(game.npcContractStatus().navyOperation.report,'');
  finishOrder(game);finishOrder(game);assert.equal(contract.navy.operation.identified,true);const report=game.npcContractStatus().navyOperation.report;assert.ok(report.length>10);
  game=Game.fromSave(game.save());contract=game.state.npcContract;assert.equal(contract.navy.attackPlanned,planned);assert.equal(game.npcContractStatus().navyOperation.report,report);
  const task=goToOrder(game),correct=planned?'interceptor':'release',wrong=planned?'release':'interceptor';
  assert.equal(game.npcContractAction({action:'navyOrder',taskId:task.id,choiceId:wrong}).code,'procedure');ok(game.npcContractAction({action:'navyOrder',taskId:task.id,choiceId:correct}));
  for(let n=0;n<180&&contract.phase==='working';n++)game.step(.1,fireAtContact(game));
  assert.equal(contract.navy.operation.tasks[2].done,true);assert.equal(contract.navy.spawned,planned);outcomes.add(planned);
 }
 assert.equal(outcomes.size,2);
});

test('a real projectile loss of the objective hull fails a procedure and remains lost after restoration',()=>{
 let game=embark('fleet-replenishment','procedure-hull-loss');until(game,()=>game.state.npcContract.phase==='working');
 game=Game.fromSave(game.save());game.step(.1,{});const contract=game.state.npcContract,contact=game.system.parkedShips.find(ship=>ship.militaryObjective),id=contact.id;
 game.system.bullets.push({id:'objective-loss',x:contact.x-12,y:contact.y,vx:200,vy:0,ttl:1,damage:contact.hull+contact.shield+200,owner:'test-attacker',ownerId:'test-attacker',radius:4});
 game.step(.1,{});game.step(.1,{});assert.equal(contract.phase,'returning');assert.equal(contract.aborted,true);assert.equal(contract.work.done,false);assert.equal(contract.navy.operation.contacts[0].hull,0);
 game=Game.fromSave(game.save());for(let i=0;i<30;i++)game.step(.1,{});assert.equal(game.system.parkedShips.some(ship=>ship.id===id),false);assert.equal(game.state.npcContract.navy.operation.contacts[0].hull,0);
});

test('assisted engineering restores the actual cutter without granting the recruit engineering or helm authority',()=>{
 const game=embark('engineering-assist','repair-assistance');game.state.professions.careers.military.completed=0;game.state.professions.careers.military.xp=0;
 until(game,()=>game.state.npcContract.phase==='working');const contract=game.state.npcContract;contract.navy.attackPlanned=false;const contact=game.system.parkedShips.find(ship=>ship.militaryObjective);assert.ok(contact.hull<contact.maxHull);
 finishOrder(game);finishOrder(game);finishOrder(game);assert.equal(contact.hull,contact.maxHull);assert.equal(contract.navy.operation.completed,true);assert.equal(game.quickHelm().ok,false);
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.engineering);assert.equal(navyDutyAccess(game,'engineering').code,'military-rank');
});
