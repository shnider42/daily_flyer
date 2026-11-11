import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {cabinLayout} from '../dist/fleet.mjs';
import {clampGunneryAim,gunneryOrigin} from '../dist/gunnery.mjs';
import {MILITARY_RECRUITER,militaryMission} from '../dist/military-content.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const copy=value=>structuredClone(value);
function recruiter(game){
 const body=game.system.bodies.find(body=>body.id==='morrow');
 const entity=generateSurface(body,game.state.seed,game.state.flags).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);
 Object.assign(game.state.person,{x:entity.x,y:entity.y});game.state.pendingEncounter=null;return entity.id;
}
function captain(seed='navy-flight',startMode='hardcore'){
 const game=new Game(seed,{startMode});
 if(game.state.mode==='ship'){
  const body=game.system.bodies.find(body=>body.id==='morrow');Object.assign(game.state.ship,{x:body.x+body.radius+80,y:body.y,vx:0,vy:0});ok(game.dock('morrow'));
 }
 ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter(game)}));return game;
}
function embark(game){
 ok(game.militaryCareerAction({action:'start',entityId:recruiter(game)}));
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);return game.state.npcContract;
}
function tick(game,seconds,input={}){for(let i=0;i<Math.ceil(seconds*10);i++)game.step(.1,input);}
function until(game,predicate,seconds=150){
 for(let i=0;i<seconds*10&&!predicate();i++)game.step(.1,{});
 assert.ok(predicate(),`Timed out in ${game.state.npcContract?.phase}`);
}
function aim(game){
 const contract=game.state.npcContract,target=game.system.enemies.find(enemy=>contract.navy.targetIds.includes(enemy.id)&&enemy.hp>0&&!enemy.disabled),origin=gunneryOrigin(game.state.ship);
 if(!target)return{};
 const travel=distance(target,origin)/650,dx=target.x+(target.vx||0)*travel-origin.x,dy=target.y+(target.vy||0)*travel-origin.y,length=Math.hypot(dx,dy);
 return{aiming:true,aimX:dx/length,aimY:dy/length,fire:true};
}
function finish(game){
 const contract=game.state.npcContract;
 for(let i=0;i<1800&&contract.phase!=='docked'&&contract.active;i++){
  const status=game.gunneryStatus();if(status.available&&!status.active)ok(game.enterGunnery());
  game.step(.1,aim(game));
 }
 assert.equal(contract.phase,'docked',JSON.stringify(contract.work));assert.equal(contract.work.done,true);return contract;
}

test('a Navy posting preserves the personal hull and gives only a physical gunnery station on the Leviathan',()=>{
 for(const startMode of ['regular','hardcore']){
  const game=captain(`navy-${startMode}`,startMode),ship=game.state.ship,inventory=game.state.cargo,owned=copy(game.state.fleet.owned),pose={x:ship.x,y:ship.y};
  const contract=embark(game),status=game.gunneryStatus();
  assert.equal(game.state.ship.classId,'leviathan');assert.equal(game.state.ship.name,'FWS Steadfast');assert.equal(game.state.mode,'person');
  assert.equal(contract.personal.ship,ship);assert.equal(contract.personal.cargo,inventory);assert.equal(game.state.ship.npcEmployer,true);
  assert.deepEqual(game.state.fleet.owned,owned);assert.equal(status.assigned,true);assert.equal(status.available,false);assert.match(status.reason,/moored/);
  assert.equal(game.enterGunnery().ok,false);assert.equal(game.quickHelm().ok,false);
  const neutral=Game.fromSave(game.save());tick(game,9,{thrust:-1,turn:1,strafe:1,boost:true});tick(neutral,9);
  for(const key of ['x','y','vx','vy','angle','angularVelocity'])assert.ok(Math.abs(game.state.ship[key]-neutral.state.ship[key])<1e-8,key);
  assert.deepEqual({x:ship.x,y:ship.y},pose);assert.equal(game.state.mode,'person');
  ok(game.enterGunnery());assert.equal(game.gunneryStatus().active,true);assert.equal(game.state.interior.location.vesselId,contract.vesselId);
  game.state.person.x+=80;assert.equal(game.validateGunnery(),false);assert.equal(game.state.stationView,null);
  Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);game.state.person.down=true;assert.equal(game.enterGunnery().ok,false);
 }
});

test('manual battery shots use the real muzzle, clamp the traverse, and never snap toward a nearby target',()=>{
 const game=captain('navy-manual');embark(game);until(game,()=>game.state.npcContract.phase==='working');ok(game.enterGunnery());
 const ship=game.state.ship,angle=ship.angle,origin=gunneryOrigin(ship),target=game.system.enemies.find(enemy=>enemy.trainingTarget);
 Object.assign(target,{x:origin.x+Math.cos(angle+.08)*250,y:origin.y+Math.sin(angle+.08)*250});
 ok(game.npcContractAction('fire',{input:{aiming:true,aimX:Math.cos(angle),aimY:Math.sin(angle)}}));
 const shot=game.system.bullets.find(bullet=>bullet.ownerId===game.playerId);
 assert.equal(shot.x,origin.x);assert.equal(shot.y,origin.y);
 assert.ok(Math.abs(Math.atan2(shot.vy-ship.vy*.3,shot.vx-ship.vx*.3)-angle)<1e-9);
 assert.equal(game.npcContractAction('fire',{input:{}}).code,'cooldown');
 const restored=Game.fromSave(game.save());assert.equal(restored.state.stationView,null);ok(restored.enterGunnery());assert.equal(restored.npcContractAction('fire').code,'cooldown');
 tick(restored,.4);const extreme=restored.state.ship.angle+Math.PI;
 ok(restored.npcContractAction('fire',{input:{aiming:true,aimX:Math.cos(extreme),aimY:Math.sin(extreme)}}));
 const last=restored.system.bullets.at(-1),actual=Math.atan2(last.vy-restored.state.ship.vy*.3,last.vx-restored.state.ship.vx*.3),wanted=clampGunneryAim(extreme,restored.state.ship.angle,Math.PI/3);
 assert.ok(Math.abs(Math.atan2(Math.sin(actual-wanted),Math.cos(actual-wanted)))<1e-9);
 ok(restored.leaveGunnery());assert.equal(restored.state.mode,'person');assert.equal(restored.npcContractAction('fire').code,'gunnery');
});

test('four real Navy sorties fly home, require each target contribution, and pay only one authored recruiter debrief',()=>{
 const game=captain('navy-four'),own=game.state.ship,cargo=game.state.cargo,initial=game.state.credits;
 let reward=0;
 for(let index=0;index<4;index++){
  const contract=embark(game),mission=militaryMission(contract.military.missionId),before=game.state.credits,kills=game.state.stats.kills;
  finish(game);assert.equal(game.state.stationView,null);assert.deepEqual(game.npcContractStatus().target,{type:'exit'});
  assert.ok(contract.work.targets.every(target=>target.neutralized&&target.damage>=mission.navy.requiredDamage));
  assert.equal(new Set(contract.work.targets.map(target=>target.id)).size,mission.navy.targetCount);
  assert.ok(contract.work.shots>0);assert.equal(game.state.credits,before);assert.ok(distance(game.state.ship,contract.dockPoint)<60);
  if(index===0){assert.equal(game.state.stats.kills,kills);assert.equal(game.system.pickups.some(item=>contract.navy.targetIds.some(id=>item.id.startsWith(id))),false);}
  Object.assign(game.state.person,cabinLayout(game.state.ship.classId).spawn);const exit=ok(game.disembark());assert.equal(exit.wages,0);
  assert.equal(game.state.ship,own);assert.equal(game.state.cargo,cargo);assert.equal(game.state.locationId,'morrow');assert.equal(game.state.militaryCareer.active.phase,'debrief');
  assert.equal(game.system.enemies.some(enemy=>contract.navy.targetIds.includes(enemy.id)),false);
  const result=ok(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}));assert.equal(result.paid,mission.reward);reward+=mission.reward;
  assert.equal(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}).ok,false);assert.equal(game.state.credits,initial+reward);
 }
 assert.equal(game.state.militaryCareer.completed.length,4);assert.equal(game.state.professions.careers.military.xp,8);assert.equal(game.militaryCareerStatus().status,'completed');
});

test('practice contacts are inert and someone else neutralizing them cannot qualify the gunner',()=>{
 const game=captain('navy-outsider'),contract=embark(game);until(game,()=>contract.phase==='working');
 const targets=game.system.enemies.filter(enemy=>contract.navy.targetIds.includes(enemy.id)),poses=targets.map(enemy=>({x:enemy.x,y:enemy.y}));
 tick(game,4);assert.deepEqual(targets.map(enemy=>({x:enemy.x,y:enemy.y})),poses);assert.equal(game.system.bullets.some(bullet=>contract.navy.targetIds.includes(bullet.ownerId)),false);
 assert.equal(game.boardEnemy(targets[0].id).ok,false);
 const visitor=new Game('navy-practice-visitor');visitor.system.enemies.push({...copy(targets[0]),disabled:true});assert.equal(visitor.boardEnemy(targets[0].id).code,'training-target');
 for(const enemy of targets){enemy.hp=1;enemy.disabled=true;enemy.professionContributors.friend=enemy.maxHp-1;}
 tick(game,.2);assert.equal(contract.work.damage,0);assert.equal(contract.work.done,false);
 ok(game.cancelNpcContract());until(game,()=>contract.phase==='docked');const result=ok(game.completeNpcContract());
 assert.equal(result.wages,0);assert.equal(result.completed,false);assert.equal(game.state.militaryCareer.active.phase,'failed');assert.equal(game.state.credits,180);
 const unrelated=game.system.enemies.map(enemy=>enemy.id);ok(game.militaryCareerAction({action:'retry',entityId:recruiter(game)}));
 const retry=game.state.npcContract;assert.notEqual(retry.id,contract.id);until(game,()=>retry.phase==='working');
 assert.equal(game.system.enemies.filter(enemy=>enemy.militaryOperationId===retry.id).length,retry.navy.targetIds.length);
 assert.equal(game.system.enemies.some(enemy=>enemy.militaryOperationId===contract.id),false);for(const id of unrelated)assert.ok(game.system.enemies.some(enemy=>enemy.id===id));
});

test('an immediate final-hit save retains actual contribution, target identity, and the in-flight carrier',()=>{
 let game=captain('navy-final-save');const contract=embark(game);until(game,()=>contract.phase==='working');game=Game.fromSave(game.save());
 const resumed=game.state.npcContract,target=game.system.enemies.find(enemy=>enemy.id===resumed.navy.targetIds[0]);
 target.hp=20;const record=game._record(),stored=record.spawned.find(enemy=>enemy.id===target.id);target.professionContributors[game.playerId]=35;stored.professionContributors={};
 game.system.bullets.push({x:target.x-10,y:target.y,vx:200,vy:0,ttl:1,damage:30,owner:'player',ownerId:game.playerId,vesselId:game.state.ship.id,radius:4});
 game._updateBullets(.1,[game]);assert.equal(target.hp,0);
 game=Game.fromSave(game.save());tick(game,.1);const work=game.state.npcContract.work.targets.find(value=>value.id===target.id);
 assert.equal(work.damage,55);assert.equal(work.neutralized,true);assert.equal(game.state.npcContract.id,contract.id);assert.equal(game.state.stationView,null);
 assert.equal(game.system.enemies.filter(enemy=>enemy.id===target.id).length,0);assert.equal(game.state.npcContract.navy.targetIds.length,2);
});

test('leaving before departure or losing the carrier never pays or grants its hull',()=>{
 for(const recovery of [false,true]){
  const game=captain(`navy-interrupted-${recovery}`),ship=game.state.ship,contract=embark(game);
  if(recovery){tick(game,6);game._rescue('Emergency return');}
  else{Object.assign(game.state.person,cabinLayout(game.state.ship.classId).spawn);ok(game.disembark());}
  assert.equal(game.state.ship,ship);assert.equal(game.state.npcContract,null);assert.equal(game.state.stationView,null);assert.equal(game.state.credits,180);
  assert.equal(game.state.militaryCareer.active.phase,'failed');assert.equal(game.state.npcContractHistory.at(-1).id,contract.id);assert.equal(game.state.npcContractHistory.at(-1).wages,0);
 }
});
