import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { createSiteState, explorationLocation, stepSiteEncounter } from '../dist/exploration.mjs';
import { sidearmAim } from '../dist/combat.mjs';
import { MILITARY_RECRUITER, militaryMission, militaryBranch } from '../dist/military-content.mjs';
import { militarySiteLocation } from '../dist/military-sites.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const copy=value=>JSON.parse(JSON.stringify(value));
function entity(game,predicate){const surface=game._expeditionSurface()||generateSurface(game.currentBody,game.state.seed),value=surface.entities.find(predicate);assert.ok(value);Object.assign(game.state.person,{x:value.x,y:value.y});return value;}
function recruit(game){return entity(game,item=>item.id===MILITARY_RECRUITER.id);}
function recruitGame(seed='field-deployment',completed=3){
 const game=new Game(seed,{startMode:'hardcore'});recruit(game);ok(game.militaryCareerAction({action:'join',branchId:'army',entityId:MILITARY_RECRUITER.id}));
 // A saved service record supplies the rank fixture. The actual deployment,
 // field combat, transport, proof, debrief and subsequent save all run below.
 Object.assign(game.state.professions.careers.military,{completed,xp:completed,rankVersion:1,legacyRankFloor:0});return game;
}
function enter(game,mission){entity(game,item=>item.type==='siteEntrance'&&item.data.siteId===mission.siteId);ok(game.enterSite(mission.siteId));}
function firingPosition(game,target){
 const surface=game._expeditionSurface();
 for(const radius of [96,120,144,72])for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,position={x:target.x+Math.cos(angle)*radius,y:target.y+Math.sin(angle)*radius},input={fire:true,aiming:true,aimX:-Math.cos(angle),aimY:-Math.sin(angle)};
  if(isWalkable(surface,position.x,position.y)&&sidearmAim(position,game.state.exploration.encounter.monsters,input,surface.combatLayout).targetId===target.id){Object.assign(game.state.person,position);return input;}
 }
 assert.fail('No physical firing position for the field target.');
}
function clear(game){for(let i=0;i<400;i++){const target=game.state.exploration.encounter.monsters.find(enemy=>enemy.health>0);if(!target)break;game.stepExploration(.1,firingPosition(game,target));}assert.ok(game.state.exploration.encounter.monsters.every(enemy=>enemy.health<=0));}
function objective(game){return entity(game,item=>item.type==='siteRecord'&&item.data.recordId===game.currentBody.site.objectiveId);}
function exit(game){entity(game,item=>item.type==='siteExit');ok(game.exitSite());}
function landing(game){const surface=generateSurface(game.currentBody,game.state.seed);Object.assign(game.state.person,surface.spawn);}

test('a real rival-system infantry deployment transports a shipless recruit, requires field combat, and pays once after returning',()=>{
 let game=recruitGame(),mission=militaryMission('freewake-army-condenser');const credits=game.state.credits;
 ok(game.militaryCareerAction({action:'startDeployment',missionId:mission.id,entityId:MILITARY_RECRUITER.id}));
 assert.equal(game.state.systemId,'meridian');assert.equal(game.currentBody.id,'serein');assert.equal(game.ownsShip,false);assert.equal(game.state.professions.careers.military.completed,3);
 const operationId=game.state.militaryCareer.active.operationId;enter(game,mission);
 assert.equal(game.state.interior.location.site.operationId,operationId);assert.equal(game.state.exploration.encounter.monsters.length,3);
 const terminal=objective(game);assert.equal(game.siteAction(terminal.id).code,'military-threat');clear(game);ok(game.siteAction(objective(game).id));assert.equal(game.state.militaryCareer.active.phase,'debrief');
 game=Game.fromSave(game.save());assert.equal(game.state.militaryCareer.active.operationId,operationId);assert.equal(game.state.militaryCareer.active.phase,'debrief');
 assert.equal(game.militaryCareerAction({action:'returnTransport'}).code,'location');exit(game);
 assert.equal(game.militaryCareerAction({action:'returnTransport'}).code,'distance');landing(game);ok(game.militaryCareerAction({action:'returnTransport'}));
 assert.equal(game.state.systemId,'hearth');assert.equal(game.currentBody.id,'morrow');assert.equal(game.state.credits,credits);recruit(game);
 const result=ok(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}));assert.equal(result.paid,mission.reward);assert.equal(game.state.credits,credits+mission.reward);assert.equal(game.state.professions.careers.military.completed,4);assert.equal(game.state.militaryCareer.deploymentsCompleted,1);
 assert.deepEqual(game.state.militaryCareer.completed,[],'a veteran field assignment does not skip the captain’s own qualification story');
 assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).ok,false);
 game=Game.fromSave(game.save());recruit(game);ok(game.militaryCareerAction({action:'startDeployment',missionId:mission.id,entityId:MILITARY_RECRUITER.id}));assert.notEqual(game.state.militaryCareer.active.operationId,operationId);assert.equal(game.state.militaryCareer.active.phase,'active');
});

test('new recruits cannot authorize senior deployments by supplying a rank or a reward',()=>{
 const game=recruitGame('rank-boundary',0),credits=game.state.credits;
 const answer=game.militaryCareerAction({action:'startDeployment',missionId:'freewake-army-switchyard',entityId:MILITARY_RECRUITER.id,rankIndex:4,completed:100,reward:999999});
 assert.equal(answer.ok,false);assert.equal(answer.code,'military-rank');assert.equal(game.state.systemId,'hearth');assert.equal(game.state.militaryCareer.active,null);assert.equal(game.state.credits,credits);assert.equal(game.state.professions.careers.military.completed,0);
});

test('watch postings begin quietly, have both uneventful and delayed hostile outcomes, and keep their decision across restoration',()=>{
 const game=recruitGame('watch-outcomes'),mission=militaryMission('freewake-army-border-watch');
 game.state.systemId=mission.systemId;game._loadSystem(mission.systemId);game.state.locationId=mission.bodyId;
 const body=game.currentBody,outcomes=new Set();
 for(let attempt=1;attempt<=48&&outcomes.size<2;attempt++){
  game.state.militaryCareer.active=null;
  ok(game.beginMilitaryAssignment(mission,{operationId:`military:freewake:army:watch_fixture:${attempt}`}));
  const context=militarySiteLocation(game,body,explorationLocation(body,mission.siteId,game.state.seed)),site=context.location.site,surface=generateSurface(context.location,game.state.seed);
  let state=createSiteState(site);const actor={id:'watch-recruit',person:{...surface.spawn,health:100,maxHealth:100},input:{}};
  assert.equal(state.monsters.length,0);assert.equal(state.cleared,false);assert.equal(state.watch.attackOccurred,false);
  for(let n=0;n<(mission.watch.attackDelay-.5)*4;n++)stepSiteEncounter(state,[actor],.25,surface);
  assert.equal(state.monsters.length,0,'no precognition through an immediately spawned enemy');
  const restored=createSiteState(site,copy(state));
  for(let n=0;n<4;n++){stepSiteEncounter(state,[actor],.25,surface);stepSiteEncounter(restored,[{...actor,person:copy(actor.person)}],.25,surface);}
  assert.equal(restored.watch.attackOccurred,state.watch.attackOccurred);assert.deepEqual(restored.monsters.map(enemy=>enemy.id),state.monsters.map(enemy=>enemy.id));outcomes.add(state.watch.attackOccurred?'hostile':'quiet');
  if(state.watch.attackOccurred){assert.ok(state.monsters.length>=2);assert.equal(state.cleared,false);}
  else{for(let n=0;n<mission.watch.seconds*4;n++)stepSiteEncounter(state,[actor],.25,surface);assert.equal(state.monsters.length,0);assert.equal(state.cleared,true);assert.equal(state.watch.completed,true);}
 }
 assert.deepEqual([...outcomes].sort(),['hostile','quiet']);
});

test('quiet service requires the full physical watch, and an early return cannot earn pay or a promotion',()=>{
 const game=recruitGame('early-return'),mission=militaryMission('freewake-army-border-watch'),credits=game.state.credits;
 ok(game.militaryCareerAction({action:'startDeployment',missionId:mission.id,entityId:MILITARY_RECRUITER.id}));enter(game,mission);
 const log=objective(game);assert.equal(game.siteAction(log.id).code,'military-watch');
 for(let n=0;n<20;n++)game.stepExploration(.25,{});
 assert.equal(game.state.militaryCareer.active.evidence.watch.value,5);assert.equal(game.state.militaryCareer.active.phase,'active');
 exit(game);landing(game);ok(game.militaryCareerAction({action:'returnTransport'}));recruit(game);
 assert.equal(game.state.militaryCareer.active.phase,'failed');assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).ok,false);assert.equal(game.state.credits,credits);assert.equal(game.state.professions.careers.military.completed,3);
 const oldId=game.state.militaryCareer.active.operationId;ok(game.militaryCareerAction({action:'retry',entityId:MILITARY_RECRUITER.id}));assert.notEqual(game.state.militaryCareer.active.operationId,oldId);assert.equal(game.state.systemId,'meridian');
});

test('an uneventful watch completes and pays through its actual log, return shuttle and recruiter without firing a shot',()=>{
 let game=recruitGame('completed-quiet-watch'),mission=militaryMission('freewake-army-border-watch'),quiet=false;
 const credits=game.state.credits;
 for(let attempt=0;attempt<24&&!quiet;attempt++){
  const action=attempt?'retry':'startDeployment';recruit(game);ok(game.militaryCareerAction({action,missionId:mission.id,entityId:MILITARY_RECRUITER.id}));enter(game,mission);
  for(let n=0;n<(mission.watch.attackDelay+.5)*4;n++)game.stepExploration(.25,{});
  quiet=!game.state.exploration.encounter.watch.attackOccurred;
  if(!quiet){exit(game);landing(game);ok(game.militaryCareerAction({action:'returnTransport'}));continue;}
  const operationId=game.state.militaryCareer.active.operationId,served=game.state.militaryCareer.active.participation.seconds;
  game=Game.fromSave(game.save());assert.equal(game.state.militaryCareer.active.operationId,operationId);assert.equal(game.state.militaryCareer.active.participation.seconds,served);assert.equal(game.state.exploration.encounter.watch.attackOccurred,false);
  for(let n=0;n<mission.watch.seconds*4;n++)game.stepExploration(.25,{});
  assert.equal(game.state.exploration.encounter.monsters.length,0);assert.equal(game.state.exploration.encounter.cleared,true);assert.equal(game.state.militaryCareer.active.evidence.watch.value,mission.watch.seconds);assert.equal(game.state.militaryCareer.active.phase,'active');
  ok(game.siteAction(objective(game).id));assert.equal(game.state.militaryCareer.active.phase,'debrief');assert.equal(game.state.stats.personShots||0,0);
  exit(game);landing(game);ok(game.militaryCareerAction({action:'returnTransport'}));recruit(game);ok(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}));
 }
 assert.equal(quiet,true);assert.equal(game.state.credits,credits+mission.reward);assert.equal(game.state.professions.careers.military.completed,4);assert.equal(game.state.militaryCareer.deploymentsCompleted,1);
});

test('remote Army transport leaves the captain’s owned hull, cargo, and fuel at its original berth',()=>{
 const game=new Game('owned-field-shuttle');const body=game.system.bodies.find(item=>item.id==='morrow');
 game.state.mode='person';game.state.locationId=body.id;Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+75,vx:0,vy:0});game._arriveAsPassenger(body);recruit(game);
 ok(game.militaryCareerAction({action:'join',branchId:'army',entityId:MILITARY_RECRUITER.id}));Object.assign(game.state.professions.careers.military,{completed:3,xp:3});
 const ship=copy(game.state.ship),cargo=copy(game.state.cargo);ok(game.militaryCareerAction({action:'startDeployment',missionId:'freewake-army-border-watch',entityId:MILITARY_RECRUITER.id}));
 assert.equal(game.state.systemId,'meridian');assert.equal(game.state.livelihoods.parkedShip.systemId,'hearth');assert.equal(game.state.livelihoods.parkedShip.bodyId,'morrow');assert.equal(game.state.livelihoods.parkedShip.vesselId,ship.id);assert.equal(game.canUseOwnShipHere(),false);assert.deepEqual(game.state.cargo,cargo);assert.equal(game.state.ship.fuel,ship.fuel);assert.equal(game.state.ship.hull,ship.hull);
 landing(game);ok(game.militaryCareerAction({action:'returnTransport'}));assert.equal(game.canUseOwnShipHere(),true);assert.equal(game.state.ship.id,ship.id);assert.equal(game.state.ship.fuel,ship.fuel);assert.deepEqual(game.state.cargo,cargo);
});

test('every standing Army posting has a reachable entrance, objective, exit and physical infantry positions',()=>{
 const game=recruitGame('field-geometry');
 function reachable(surface){
  const queue=[[Math.floor(surface.spawn.x/24),Math.floor(surface.spawn.y/24)]],seen=new Set(queue.map(([x,y])=>`${x},${y}`));
  for(let n=0;n<queue.length;n++){const [x,y]=queue[n];for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,key=`${xx},${yy}`;if(!seen.has(key)&&isWalkable(surface,(xx+.5)*24,(yy+.5)*24)){seen.add(key);queue.push([xx,yy]);}}}
  return point=>seen.has(`${Math.floor(point.x/24)},${Math.floor(point.y/24)}`);
 }
 for(const mission of militaryBranch('freewake','army').deployments){
  const body=game.galaxy.find(system=>system.id===mission.systemId).bodies.find(item=>item.id===mission.bodyId),outside=generateSurface(body,game.state.seed),entrance=outside.entities.find(item=>item.data?.siteId===mission.siteId&&item.type==='siteEntrance');
  assert.ok(entrance,mission.title+' has an entrance');assert.equal(reachable(outside)(entrance),true,mission.title+' entrance is reachable from landing');
  const location=explorationLocation(body,mission.siteId,game.state.seed),inside=generateSurface(location,game.state.seed),canReach=reachable(inside);
  for(const target of inside.entities.filter(item=>item.type==='siteExit'||item.type==='siteRecord'&&item.data.recordId===location.site.objectiveId))assert.equal(canReach(target),true,mission.title+' '+target.name+' is reachable');
  for(const enemy of location.site.hostiles)assert.equal(isWalkable(inside,enemy.x,enemy.y),true,mission.title+' '+enemy.name+' starts on real floor');
 }
});
