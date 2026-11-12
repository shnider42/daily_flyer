import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { MilitaryCareerRules } from '../dist/military-career.mjs';
import { MILITARY_MISSIONS, MILITARY_RECRUITER, militaryBranch, militaryCampaign, militaryMission } from '../dist/military-content.mjs';
import { personalGearProgress } from '../dist/personal-gear.mjs';

// These tests exercise the personal rules boundary. Physical Army combat and
// carrier flight produce the trusted hooks in their own integration suites.
Object.assign(Game.prototype,MilitaryCareerRules);
const copy=value=>JSON.parse(JSON.stringify(value));
const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
function recruiter(game){
 game.state.mode='person';game.state.systemId='hearth';game._loadSystem('hearth');game.state.locationId='morrow';game.state.interior=null;game.state.exploration=null;
 const body=game.system.bodies.find(body=>body.id==='morrow'),entity=generateSurface(body,game.state.seed,game.state.flags).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);
 assert.ok(entity,'the real Morrow surface contains the recruiter');Object.assign(game.state.person,{x:entity.x,y:entity.y,health:game.state.person.maxHealth,down:false});return entity.id;
}
function make(seed='military-career'){
 const game=new Game(seed,{startMode:'hardcore'});game.initializeMilitaryCareer();recruiter(game);
 game._startMilitaryMission=()=>({ok:true});return game;
}
function join(game,branchId='army'){return ok(game.militaryCareerAction({action:'join',branchId,entityId:recruiter(game)}));}
function start(game,action='start'){return ok(game.militaryCareerAction({action,entityId:recruiter(game)}));}
function field(game,objectiveId,token,amount=1,extra={}){
 const active=game.state.militaryCareer.active,mission=militaryMission(active.missionId),objective=mission.objectives.find(objective=>objective.id===objectiveId);
 return game.observeMilitaryEvent(objective?.event||'ground-objective',{operationId:active.operationId,siteId:mission.siteId,objectiveId,token,amount,...extra});
}
function finishField(game){
 const active=game.state.militaryCareer.active,mission=militaryMission(active.missionId);
 for(const objective of mission.objectives){
  if(objective.distinct)for(let i=0;i<objective.required;i++)ok(field(game,objective.id,`${active.operationId}:target:${i}`));
  else ok(field(game,objective.id,`${active.operationId}:${objective.id}`,objective.required));
 }
 assert.equal(game.state.militaryCareer.active.phase,'debrief');
}
function receipt(game,overrides={}){
 const active=game.state.militaryCareer.active,mission=militaryMission(active.missionId),contract={employeeId:game.playerId,military:{branchId:'navy',missionId:mission.id,operationId:active.operationId}};
 const result={completed:true,returned:true,outcome:'complete',wages:0,shots:10,damage:mission.navy.targetCount*mission.navy.requiredDamage,targets:Array.from({length:mission.navy.targetCount},(_,i)=>({id:`${active.operationId}:target:${i}`,damage:mission.navy.requiredDamage,neutralized:true,maxHull:mission.navy.targetHull})),destination:{systemId:'hearth',bodyId:'morrow',name:'Morrow'},...overrides};
 return{contract,result};
}
function reload(game){const restored=Game.fromSave(game.save());restored.initializeMilitaryCareer();restored._startMilitaryMission=()=>({ok:true});return restored;}

test('Freewake keeps four qualification chapters per branch, with fourteen Navy and six Army deployments',()=>{
 assert.equal(militaryCampaign('meridian'),null);assert.equal(militaryCampaign('__proto__'),null);
 assert.equal(MILITARY_MISSIONS.length,28);assert.equal(new Set(MILITARY_MISSIONS.map(mission=>mission.id)).size,28);
 for(const branchId of ['army','navy']){
  const branch=militaryBranch('freewake',branchId);assert.equal(branch.missions.length,4);assert.ok(branch.description.length>60);
  assert.equal(branch.deployments.length,branchId==='navy'?14:6);assert.ok(branch.deployments.every(mission=>mission.repeatable&&mission.deployment.systemId));assert.ok(branch.deployments.some(mission=>mission.deployment.systemId==='meridian'));
  assert.equal(branch.missions.reduce((sum,mission)=>sum+mission.xp,0),8);
  for(const mission of branch.missions){assert.ok(Object.isFrozen(mission));assert.ok(mission.objectives.length>=2);assert.ok(mission.reward>0);}
 }
 assert.deepEqual(militaryBranch('freewake','army').missions.map(mission=>mission.siteId),['service-range','service-relay','service-rescue','service-line']);
});

test('recruiter enrollment requires a real living captain at the physical Morrow contact',()=>{
 const game=make(),entityId=MILITARY_RECRUITER.id;
 game.state.person.x+=100;assert.equal(game.militaryCareerAction({action:'join',branchId:'army',entityId}).code,'distance');
 recruiter(game);assert.equal(game.militaryCareerAction({action:'join',branchId:'army',entityId:'quest:profession-desk:morrow'}).code,'entity');
 game.state.person.down=true;assert.equal(game.militaryCareerAction({action:'join',branchId:'army',entityId}).code,'incapacitated');
 recruiter(game);game.state.person.x=NaN;assert.equal(game.militaryCareerAction({action:'join',branchId:'army',entityId}).code,'incapacitated');
 recruiter(game);game.state.locationId='kettle';assert.equal(game.militaryCareerAction({action:'join',branchId:'army',entityId}).code,'location');
 recruiter(game);assert.equal(game.militaryCareerAction({action:'join',branchId:'__proto__',entityId}).code,'branch');
 assert.equal(game.state.professions.careers.military.enlisted,false);
 const credits=game.state.credits,ship=copy(game.state.ship),flags=copy(game.state.flags),rep=game.state.rep.meridian;
 join(game);assert.equal(game.state.credits,credits);assert.deepEqual(game.state.ship,ship);assert.deepEqual(game.state.flags,flags);assert.equal(game.state.rep.meridian,rep-3);
 assert.equal(game.militaryCareerAction({action:'join',branchId:'navy',entityId}).code,'duplicate');assert.equal(game.state.rep.meridian,rep-3);
 assert.equal(game.militaryCareerStatus().status,'ready');assert.equal(game.militaryCareerStatus().guidanceActive,true);assert.equal(game.state.militaryCareer.active,null);
});

test('old Freewake enlistments choose a branch without losing rank, pay, commissions, or unrelated work',()=>{
 let game=make('existing-military');const military=game.state.professions.careers.military;
 Object.assign(military,{enlisted:true,factionId:'freewake',xp:13,completed:9,earned:1900,serviceShips:['sparrow','marten']});game.initializeMilitaryCareer();
 const before=copy(military),rep=copy(game.state.rep);assert.equal(game.militaryCareerStatus().status,'choose-branch');
 game.state.flags.push('existing-story-step');join(game,'navy');assert.deepEqual(military,before);assert.deepEqual(game.state.rep,rep);
 game=reload(game);assert.deepEqual(game.state.professions.careers.military,before);assert.equal(game.state.militaryCareer.branchId,'navy');assert.ok(game.state.flags.includes('existing-story-step'));
 game.state.professions.careers.military.factionId='meridian';game.initializeMilitaryCareer();const foreign=copy(game.state.professions.careers.military);
 assert.equal(game.militaryCareerStatus().status,'unavailable');assert.equal(game.militaryCareerStatus().actions.length,0);
 assert.equal(game.militaryCareerAction({action:'join',branchId:'army',entityId:recruiter(game)}).code,'faction');assert.deepEqual(game.state.professions.careers.military,foreign);
});

test('a refused deployment does not consume an attempt or overwrite an unrelated encounter',()=>{
 const game=make();join(game);const pending={kind:'transmission',id:'story:pending',title:'An unfinished conversation'};game.state.pendingEncounter=pending;
 assert.equal(game.militaryCareerAction({action:'start',entityId:MILITARY_RECRUITER.id}).code,'encounter');assert.equal(game.state.pendingEncounter,pending);
 assert.equal(game.state.militaryCareer.attemptSerial,0);game.state.pendingEncounter=null;
 game._startMilitaryMission=()=>({ok:false,reason:'No berth is available.',code:'capacity'});
 assert.equal(game.militaryCareerAction({action:'start',entityId:MILITARY_RECRUITER.id}).code,'capacity');assert.equal(game.state.militaryCareer.active,null);assert.equal(game.state.militaryCareer.attemptSerial,0);
 game._startMilitaryMission=(mission,active)=>{assert.equal(mission.id,'freewake-army-range');assert.equal(game.state.militaryCareer.active,null);assert.match(active.operationId,/^[-a-zA-Z0-9_:]{1,240}$/);return{ok:true};};
 start(game);assert.equal(game.state.militaryCareer.attemptSerial,1);
 assert.equal(game.militaryCareerAction({action:'start',entityId:MILITARY_RECRUITER.id}).code,'active');
 assert.equal(game.militaryCareerAction({action:'retry',entityId:MILITARY_RECRUITER.id}).code,'active');
});

test('range qualification needs three distinct verified targets and its real terminal objective',()=>{
 const game=make();join(game);start(game);const active=game.state.militaryCareer.active;
 assert.equal(field(game,'hits','foreign-target',1,{operationId:active.operationId+':other'}).ok,false);
 assert.equal(field(game,'hits','wrong-site',1,{siteId:'service-line'}).ok,false);
 assert.equal(field(game,'unknown','unknown').ok,false);
 assert.equal(game.observeMilitaryEvent('ground-objective',{operationId:active.operationId,siteId:'service-range',objectiveId:'hits',token:'wrong-type',amount:99}).ok,false);
 ok(field(game,'hits','left',999));ok(field(game,'hits','left'));assert.equal(active.evidence.hits.value,1);
 ok(field(game,'hits','middle'));ok(field(game,'hits','right'));assert.equal(active.phase,'active');
 assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).code,'evidence');
 ok(field(game,'drill','range-terminal'));assert.equal(active.phase,'debrief');assert.ok(game.militaryCareerStatus().active.objectives.every(objective=>objective.done));
 assert.equal(field(game,'drill','range-terminal').ok,false);
});

test('pause and reload preserve the same operation while genuine field evidence continues',()=>{
 let game=make();join(game);start(game);ok(field(game,'hits','left'));
 const operation=game.state.militaryCareer.active.operationId,serial=game.state.militaryCareer.attemptSerial;
 ok(game.militaryCareerAction({action:'pause'}));assert.equal(game.militaryCareerStatus().guidanceActive,false);
 ok(field(game,'hits','middle'));game=reload(game);assert.equal(game.militaryCareerStatus().status,'paused');
 assert.equal(game.state.militaryCareer.active.operationId,operation);assert.equal(game.state.militaryCareer.active.evidence.hits.value,2);
 ok(field(game,'hits','right'));ok(field(game,'drill','terminal'));assert.equal(game.state.militaryCareer.active.phase,'paused');assert.equal(game.state.militaryCareer.active.pausedPhase,'debrief');
 game.state.person.health=0;assert.equal(game.militaryCareerAction({action:'resume'}).code,'incapacitated');
 game.state.person.health=game.state.person.maxHealth;ok(game.militaryCareerAction({action:'resume'}));assert.equal(game.militaryCareerStatus().status,'debrief');
 assert.equal(game.state.militaryCareer.active.operationId,operation);assert.equal(game.state.militaryCareer.attemptSerial,serial);
});

test('physical debrief pays authored rewards exactly once and counts one personal service assignment',()=>{
 let game=make();join(game);start(game);finishField(game);game=reload(game);
 const credits=game.state.credits,jobs=game.state.stats.jobs;game.state.person.x+=100;
 assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).code,'distance');assert.equal(game.state.credits,credits);
 recruiter(game);const result=ok(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id,reward:999999,xp:999999}));
 assert.equal(result.paid,100);assert.equal(game.state.credits,credits+100);assert.equal(game.state.stats.jobs,jobs);assert.equal(game.state.professions.careers.military.completed,1);assert.equal(game.state.professions.careers.military.xp,1);
 assert.equal(personalGearProgress(game).completed,jobs+1);assert.equal(game.militaryCareerStatus().title,'Restore the Rainline relay');
 assert.equal(game.militaryCareerAction({action:'debrief',entityId:MILITARY_RECRUITER.id}).ok,false);
 game=reload(game);assert.equal(game.state.credits,credits+100);assert.equal(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}).ok,false);
});

test('the Army arc advances in order to a real promotion without granting a ship or double-counting jobs',()=>{
 let game=make();join(game);const credits=game.state.credits,jobs=game.state.stats.jobs,owned=copy(game.state.fleet.owned);
 for(const mission of militaryBranch('freewake','army').missions){
  start(game);assert.equal(game.state.militaryCareer.active.missionId,mission.id);finishField(game);
  ok(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}));game=reload(game);
 }
 assert.equal(game.militaryCareerStatus().status,'completed');assert.equal(game.militaryCareerStatus().guidanceActive,false);assert.equal(game.state.credits,credits+1050);
 assert.equal(game.state.professions.careers.military.completed,4);assert.equal(game.state.professions.careers.military.xp,8);assert.equal(game.state.professions.careers.military.earned,1050);
 assert.equal(game.state.stats.jobs,jobs);assert.deepEqual(game.state.fleet.owned,owned);assert.equal(game.ownsShip,false);
 assert.equal(game.militaryCareerStatus().serviceRank.rank,'Private');assert.equal(game.militaryCareerStatus().serviceRank.rankIndex,1);assert.equal(game.militaryCareerStatus().deployments.length,6);assert.equal(game.militaryCareerAction({action:'start',entityId:recruiter(game)}).code,'completed');
});

test('Navy credit requires each marked target, this employee, the matching attempt, and the real Morrow return',()=>{
 const game=make();join(game,'navy');start(game);const active=game.state.militaryCareer.active,{contract,result}=receipt(game),credits=game.state.credits;
 assert.equal(game.recordMilitarySortie({...contract,employeeId:'another-captain'},result).ok,false);assert.equal(active.phase,'active');
 assert.equal(game.recordMilitarySortie({...contract,military:{...contract.military,operationId:active.operationId+':other'}},result).ok,false);
 const incomplete=copy(result);incomplete.targets[1].damage=0;ok(game.recordMilitarySortie(contract,incomplete));assert.equal(active.phase,'failed');assert.equal(game.state.credits,credits);assert.equal(game.state.professions.careers.military.completed,0);
 assert.equal(game.recordMilitarySortie(contract,result).ok,false);assert.equal(active.phase,'failed');
 start(game,'retry');const next=receipt(game);next.result.destination.bodyId='kettle';ok(game.recordMilitarySortie(next.contract,next.result));assert.equal(game.state.militaryCareer.active.phase,'failed');
 start(game,'retry');const final=receipt(game);ok(game.recordMilitarySortie(final.contract,final.result));assert.equal(game.state.militaryCareer.active.phase,'debrief');assert.equal(game.state.credits,credits);
 ok(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}));assert.equal(game.state.credits,credits+100);assert.equal(game.state.professions.careers.military.completed,1);
});

test('a Navy retry gets a new operation only after the old watch is ended and a new launch succeeds',()=>{
 const game=make();join(game,'navy');start(game);const old=receipt(game),oldId=game.state.militaryCareer.active.operationId;
 ok(game.recordMilitarySortie(old.contract,{...old.result,completed:false,returned:false}));
 game.state.npcContract={active:true,id:oldId};assert.equal(game.militaryCareerAction({action:'retry',entityId:MILITARY_RECRUITER.id}).code,'crew-duty');delete game.state.npcContract;
 game._startMilitaryMission=()=>({ok:false,reason:'Carrier unavailable.',code:'carrier'});assert.equal(game.militaryCareerAction({action:'retry',entityId:MILITARY_RECRUITER.id}).code,'carrier');assert.equal(game.state.militaryCareer.active.operationId,oldId);assert.equal(game.state.militaryCareer.attemptSerial,1);
 game._startMilitaryMission=()=>({ok:true});start(game,'retry');assert.notEqual(game.state.militaryCareer.active.operationId,oldId);assert.equal(game.state.militaryCareer.attemptSerial,2);
 assert.equal(game.recordMilitarySortie(old.contract,old.result).ok,false);assert.equal(game.state.militaryCareer.active.phase,'active');
});

test('a paused Navy watch can settle once without changing the active operation or producing instant pay',()=>{
 let game=make();join(game,'navy');start(game);const operation=game.state.militaryCareer.active.operationId;
 ok(game.militaryCareerAction({action:'pause'}));const proof=receipt(game),credits=game.state.credits;ok(game.recordMilitarySortie(proof.contract,proof.result));
 assert.equal(game.state.militaryCareer.active.phase,'paused');assert.equal(game.state.militaryCareer.active.pausedPhase,'debrief');game=reload(game);
 assert.equal(game.state.militaryCareer.active.operationId,operation);assert.equal(game.state.credits,credits);assert.equal(game.state.militaryCareer.attemptSerial,1);
 ok(game.militaryCareerAction({action:'resume'}));assert.equal(game.militaryCareerStatus().status,'debrief');assert.equal(game.recordMilitarySortie(proof.contract,proof.result).ok,false);
 ok(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}));assert.equal(game.state.credits,credits+100);
});

test('an orphaned saved Navy watch can be retried only at the recruiter, without a wage or replacement of a live watch',()=>{
 let game=make('missing-carrier');join(game,'navy');start(game);const oldId=game.state.militaryCareer.active.operationId,credits=game.state.credits;
 game=reload(game);assert.equal(game.militaryCareerStatus().status,'failed');assert.ok(game.militaryCareerStatus().actions.some(action=>action.action==='retry'));
 game.state.person.x+=150;assert.equal(game.militaryCareerAction({action:'retry',entityId:MILITARY_RECRUITER.id}).code,'distance');assert.equal(game.state.militaryCareer.active.operationId,oldId);
 recruiter(game);game.state.npcContract={active:true,employeeId:game.playerId,id:'another-watch',military:{operationId:'another-operation'}};
 assert.equal(game.militaryCareerAction({action:'retry',entityId:MILITARY_RECRUITER.id}).code,'crew-duty');assert.equal(game.state.militaryCareer.active.operationId,oldId);
 game.state.npcContract=null;start(game,'retry');assert.equal(game.state.militaryCareer.attemptSerial,2);assert.notEqual(game.state.militaryCareer.active.operationId,oldId);
 assert.equal(game.state.credits,credits);assert.equal(game.state.professions.careers.military.completed,0);assert.equal(game.state.militaryCareer.active.receipt,null);
});

test('normalization removes impossible chapter skips and unsupported proof without awarding anything',()=>{
 const game=make();join(game);start(game);const credits=game.state.credits;
 game.state.militaryCareer.completed=['freewake-army-line','not-a-mission'];game.state.militaryCareer.active.phase='debrief';game.state.militaryCareer.active.evidence.hits={value:999,tokens:['same','same']};
 game.initializeMilitaryCareer();assert.deepEqual(game.state.militaryCareer.completed,[]);assert.equal(game.state.militaryCareer.active.phase,'active');assert.equal(game.state.militaryCareer.active.evidence.hits.value,1);assert.equal(game.state.credits,credits);
 game.state.militaryCareer.active.operationId='military:freewake:navy:local:9';game.initializeMilitaryCareer();assert.equal(game.state.militaryCareer.active,null);
 const navy=make('receipt-normalization');join(navy,'navy');start(navy);const proof=receipt(navy);proof.result.targets[1].neutralized=false;
 navy.state.militaryCareer.active.phase='debrief';navy.state.militaryCareer.active.receipt=proof.result;navy.initializeMilitaryCareer();assert.equal(navy.state.militaryCareer.active.phase,'active');assert.equal(navy.state.militaryCareer.active.receipt,null);
});
