import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {createSiteState,explorationLocation,stepSiteEncounter} from '../dist/exploration.mjs';
import {sidearmAim,clearSidearmSight} from '../dist/combat.mjs';
import {MILITARY_RECRUITER,militaryBranch} from '../dist/military-content.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const point=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
function atEntity(game,predicate){const surface=game._expeditionSurface()||generateSurface(game.currentBody,game.state.seed),entity=surface.entities.find(predicate);assert.ok(entity);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity;}
function recruit(game){return atEntity(game,entity=>entity.id===MILITARY_RECRUITER.id);}
function begin(game){recruit(game);ok(game.militaryCareerAction({action:'start',entityId:MILITARY_RECRUITER.id}));const mission=militaryBranch('freewake','army').missions[game.state.militaryCareer.completed.length];atEntity(game,entity=>entity.data?.siteId===mission.siteId&&entity.type==='siteEntrance');ok(game.enterSite(mission.siteId));return mission;}
function firingPosition(game,target){
 const surface=game._expeditionSurface();
 for(const radius of [96,120,144,72])for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,position={x:target.x+Math.cos(angle)*radius,y:target.y+Math.sin(angle)*radius},input={fire:true,aiming:true,aimX:-Math.cos(angle),aimY:-Math.sin(angle)};
  if(isWalkable(surface,position.x,position.y)&&sidearmAim(position,game.state.exploration.encounter.monsters,input,surface.combatLayout).targetId===target.id){Object.assign(game.state.person,position);return input;}
 }
 assert.fail('The target has no valid firing position.');
}
function clear(game){for(let i=0;i<300;i++){const target=game.state.exploration.encounter.monsters.find(enemy=>enemy.health>0);if(!target)break;game.stepExploration(.1,firingPosition(game,target));}assert.ok(game.state.exploration.encounter.cleared);}
function fieldObjective(game){const objective=atEntity(game,entity=>entity.type==='siteRecord'&&entity.data.recordId===game.currentBody.site.objectiveId);return ok(game.siteAction(objective.id));}
function leave(game){atEntity(game,entity=>entity.type==='siteExit');ok(game.exitSite());}

test('the full Army campaign requires shots, physical objectives and recruiter debriefs, retaining progress across a save',()=>{
 let game=new Game('infantry-full-arc',{startMode:'hardcore'});const credits=game.state.credits;
 recruit(game);ok(game.militaryCareerAction({action:'join',branchId:'army',entityId:MILITARY_RECRUITER.id}));
 const missions=militaryBranch('freewake','army').missions;
 for(const [index,mission]of missions.entries()){
  begin(game);assert.equal(game.state.militaryCareer.active.missionId,mission.id);const operationId=game.state.militaryCareer.active.operationId;
  const console=game._expeditionSurface().entities.find(entity=>entity.data?.recordId===game.currentBody.site.objectiveId);
  assert.equal(game.siteAction(console.id).code,'distance');Object.assign(game.state.person,console);assert.equal(game.siteAction(console.id).code,'military-threat');
  if(index===0){
   const target=game.state.exploration.encounter.monsters[0];game.stepExploration(.1,firingPosition(game,target));
   assert.equal(game.state.militaryCareer.active.evidence.hits.value,1);
   game=Game.fromSave(game.save());assert.equal(game.state.militaryCareer.active.operationId,operationId);assert.equal(game.state.militaryCareer.active.evidence.hits.value,1);assert.equal(game.state.exploration.encounter.monsters[0].health,0);
  }
  clear(game);assert.equal(game.state.militaryCareer.active.phase,'active','combat alone does not file a field objective');
  if(index===0)assert.equal(game.state.stats.personKills||0,0,'harmless target frames are not kills');
  if(index===2)assert.equal(game._expeditionSurface().entities.filter(entity=>entity.data?.militaryCivilian).length,2);
  fieldObjective(game);assert.equal(game.state.militaryCareer.active.phase,'debrief');
  if(index===2){assert.equal(game._expeditionSurface().entities.filter(entity=>entity.data?.militaryCivilian).length,0);game=Game.fromSave(game.save());assert.equal(game._expeditionSurface().entities.filter(entity=>entity.data?.militaryCivilian).length,0);}
  assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).ok,false,'no remote recruiter pay');
  leave(game);recruit(game);const before=game.state.credits;ok(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}));assert.equal(game.state.credits,before+mission.reward);
  assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).ok,false);assert.equal(game.state.credits,before+mission.reward);
 }
 assert.equal(game.militaryCareerStatus().status,'completed');assert.equal(game.state.professions.careers.military.completed,4);assert.equal(game.state.professions.careers.military.xp,8);assert.equal(game.state.credits,credits+1050);assert.equal(game.ownsShip,false,'infantry service never grants an unclaimed vessel');
 assert.equal(game.militaryCareerAction({action:'start',entityId:MILITARY_RECRUITER.id}).ok,false);
});

test('range targets are harmless frames and authored combat restores only the assigned infantry',()=>{
 const body={id:'morrow',kind:'planet'},location=explorationLocation(body,'service-range'),surface=generateSurface(location),state=createSiteState(location.site),person={...point(17,10),health:100,maxHealth:100};
 const before=state.monsters.map(enemy=>({id:enemy.id,x:enemy.x,y:enemy.y,damage:enemy.damage}));
 for(let i=0;i<80;i++)assert.ok(!stepSiteEncounter(state,[{id:'recruit',person,input:{}}],.1,surface).length);
 assert.deepEqual(state.monsters.map(enemy=>({id:enemy.id,x:enemy.x,y:enemy.y,damage:enemy.damage})),before);assert.equal(person.health,100);assert.ok(state.monsters.every(enemy=>enemy.trainingTarget));
 const restored=createSiteState(location.site,{monsters:[{...state.monsters[0],damage:1000,speed:200,stationary:false,attackKind:'ranged'}]});assert.equal(restored.monsters[0].damage,0);assert.equal(restored.monsters[0].stationary,true);assert.equal(restored.monsters[0].attackKind,'none');
});

test('infantry shots have a locked tell, can be dodged, and stop at walls',()=>{
 const location=explorationLocation({id:'morrow',kind:'planet'},'service-relay'),surface=generateSurface(location),state=createSiteState(location.site),enemy=state.monsters[0];
 state.monsters.slice(1).forEach(other=>other.health=0);Object.assign(enemy,point(15,23),{cooldown:0,alert:true});
 const person={...point(18,23),health:100,maxHealth:100},actor={id:'recruit',name:'Recruit',person,input:{}};
 stepSiteEncounter(state,[actor],.1,surface);assert.ok(enemy.windup>0);const angle=enemy.aimAngle;
 person.y+=48;const events=[];for(let i=0;i<7;i++)events.push(...stepSiteEncounter(state,[actor],.1,surface));
 const miss=events.find(event=>event.type==='person-shot'&&event.team==='hostile');assert.ok(miss);assert.equal(miss.angle,angle);assert.equal(miss.hit,false);assert.equal(person.health,100);
 Object.assign(enemy,point(15,23),{cooldown:0,windup:0});Object.assign(person,point(18,23));
 const hit=[];for(let i=0;i<8;i++)hit.push(...stepSiteEncounter(state,[actor],.1,surface));assert.equal(hit.filter(event=>event.type==='person-hit').length,1);assert.equal(person.health,94);
 Object.assign(enemy,point(20,7),{cooldown:0,windup:.1,aimAngle:0});Object.assign(person,point(24,7));assert.equal(clearSidearmSight(surface.combatLayout,enemy,person),false);
 const blocked=stepSiteEncounter(state,[actor],.1,surface).find(event=>event.type==='person-shot');assert.ok(blocked.blocked);assert.equal(blocked.hit,false);assert.equal(person.health,94);
});

test('military entrances reject unassigned or different operations and ordinary sites remain available',()=>{
 const game=new Game('infantry-orders',{startMode:'hardcore'});atEntity(game,entity=>entity.type==='siteEntrance'&&entity.data.siteId==='service-range');assert.equal(game.enterSite('service-range').code,'military-orders');
 atEntity(game,entity=>entity.type==='siteEntrance'&&entity.data.siteId==='chalkfold');ok(game.enterSite('chalkfold'));leave(game);
 recruit(game);ok(game.militaryCareerAction({action:'join',branchId:'army',entityId:MILITARY_RECRUITER.id}));begin(game);const operationId=game.state.militaryCareer.active.operationId;leave(game);
 atEntity(game,entity=>entity.type==='siteEntrance'&&entity.data.siteId==='service-relay');assert.equal(game.enterSite('service-relay').code,'military-orders');
 assert.equal(game.state.militaryCareer.active.operationId,operationId);assert.equal(game.state.exploration,null);
});
