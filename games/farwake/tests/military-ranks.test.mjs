import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { militaryServiceRank, militaryPermission, militaryRankFor, militaryDialogue } from '../dist/military-ranks.mjs';

const ok=value=>{assert.equal(value?.ok,true,value?.reason||JSON.stringify(value));return value;};
function desk(game){const entity=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.find(value=>value.data?.professionDesk);assert.ok(entity);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity.id;}
function dock(game,bodyId){const body=game.system.bodies.find(value=>value.id===bodyId);Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});game.state.pendingEncounter=null;ok(game.dock(bodyId));return desk(game);}
function shoot(game,enemy,damage,ownerId=game.playerId){game.system.bullets.push({id:`shot:${ownerId}:${game.state.stats.time}`,x:enemy.x,y:enemy.y,vx:1,vy:0,ttl:1,damage,owner:'player',ownerId,vesselId:game.state.ship.id,radius:4});game._updateBullets(.05,[game]);}
const roster=(game,completed,branchId='army')=>{Object.assign(game.state.professions.careers.military,{enlisted:true,factionId:'freewake',completed});Object.assign(game.state.militaryCareer,{factionId:'freewake',branchId});return game;};

test('three physically completed patrols earn the first promotion; cancellation, other combat and duplicate reports do not',()=>{
 let game=new Game('promotion-patrol',{startMode:'hardcore'}),entityId=desk(game);ok(game.enlistProfession({professionId:'military',entityId}));ok(game.professionAction({action:'claimServiceShip',entityId}));
 let offer=game.professionBoard(entityId).offers.find(value=>value.professionId==='military');ok(game.professionAction({action:'accept',jobId:offer.id,entityId}));ok(game.professionAction({action:'cancel',jobId:offer.id,entityId}));
 assert.equal(militaryServiceRank(game).completed,0);
 for(let i=0;i<3;i++){
  game.state.stats.time+=60;offer=game.professionBoard(entityId).offers.find(value=>value.professionId==='military');ok(game.professionAction({action:'accept',jobId:offer.id,entityId}));
  const job=game.state.professions.active;ok(game.launch());const enemy=game.system.enemies.find(value=>value.id===job.targetId);assert.ok(enemy);
  Object.assign(enemy,{x:1200,y:-1600+i*250});Object.assign(game.state.ship,{x:enemy.x-70,y:enemy.y});
  shoot(game,enemy,60,'another-captain');assert.equal(game.professionAction({action:'confirmPatrol',jobId:job.id}).ok,false);
  shoot(game,enemy,14);ok(game.professionAction({action:'confirmPatrol',jobId:job.id}));entityId=dock(game,job.originBody);
  const report=ok(game.professionAction({action:'report',jobId:job.id,entityId}));assert.equal(militaryServiceRank(game).rankIndex,i===2?1:0);
  assert.equal(Boolean(report.promotion),i===2);assert.equal(militaryServiceRank(game).completed,i+1);
  const before=game.state.credits;assert.equal(game.professionAction({action:'report',jobId:job.id,entityId}).ok,false);assert.equal(game.state.credits,before);
  game=Game.fromSave(game.save());entityId=desk(game);assert.equal(militaryServiceRank(game).rankIndex,i===2?1:0);
 }
 assert.equal(militaryServiceRank(game).nextRank,8);assert.equal(militaryServiceRank(game).remaining,5);
 const recruit=new Game('promotion-patrol',{startMode:'hardcore'});ok(recruit.enlistProfession({professionId:'military',entityId:desk(recruit)}));
 assert.equal(militaryServiceRank(recruit).rankIndex,0);assert.equal(militaryServiceRank(game).rankIndex,1);
});

test('later promotion intervals count completed assignments rather than XP payouts or membership',()=>{
 const game=roster(new Game('rank-milestones'),0,'navy'),career=game.state.professions.careers.military;career.xp=999;
 for(const [completed,expected]of[[0,0],[1,0],[2,0],[3,1],[4,1],[7,1],[8,2],[15,2],[16,3],[27,3],[28,4],[29,4]]){
  career.completed=completed;assert.equal(militaryServiceRank(game).rankIndex,expected,`${completed} completed`);
 }
 assert.equal(militaryServiceRank(game).rank,'Lieutenant');assert.equal(militaryServiceRank(game).nextRank,null);
 assert.equal(militaryRankFor({enlisted:false,completed:100,rankVersion:1,legacyRankFloor:3}).rankIndex,0);
 assert.equal(militaryRankFor({enlisted:true,completed:Infinity,rankVersion:1,legacyRankFloor:0}).rankIndex,0);
});

test('old earned rank migrates once while new recruits cannot gain rank from a high XP value after reload',()=>{
 const game=roster(new Game('legacy-service-rank'),4,'navy'),saved=game.save(),career=saved.professions.careers.military;career.xp=9;delete career.rankVersion;delete career.legacyRankFloor;
 let loaded=Game.fromSave(saved);assert.equal(militaryServiceRank(loaded).rankIndex,2);assert.equal(loaded.state.professions.careers.military.legacyRankFloor,2);
 loaded.state.professions.careers.military.xp=1000;loaded=Game.fromSave(loaded.save());assert.equal(militaryServiceRank(loaded).rankIndex,2);
 const fresh=roster(new Game('new-service-rank'),1,'army');fresh.state.professions.careers.military.xp=1000;
 assert.equal(militaryServiceRank(Game.fromSave(fresh.save())).rankIndex,0);
});

test('rank permissions are personal and bound to a matching branch, faction and current standing',()=>{
 const leader=roster(new Game('shared-rank-permissions'),16,'navy'),recruit=roster(new Game('shared-rank-permissions'),0,'navy');
 const orders={factionId:'freewake',branchId:'navy'};
 assert.equal(militaryPermission(leader,'leadFrontier',orders).ok,true);assert.equal(militaryPermission(recruit,'leadFrontier',orders).code,'military-rank');
 assert.equal(militaryPermission(recruit,'join',orders).ok,true);assert.equal(militaryPermission(leader,'command',orders).ok,true);
 assert.equal(militaryPermission(leader,'command',{...orders,branchId:'army'}).code,'military-branch');
 assert.equal(militaryPermission(leader,'join',{...orders,factionId:'meridian'}).code,'military-faction');
 assert.equal(militaryPermission(leader,'helm',orders).code,'military-permission');
 assert.equal(militaryPermission(leader,'__proto__',orders).code,'military-permission');assert.equal(militaryPermission(leader,'constructor',{...orders,minRank:0}).code,'military-permission');
 leader.state.rep.freewake=-25;assert.equal(militaryPermission(leader,'join',orders).code,'military-standing');
 assert.equal(militaryPermission(recruit,'join',orders).ok,true);assert.equal(militaryServiceRank(recruit).rankIndex,0);
});

test('the same military contact addresses each captain by their own rank without changing a shared NPC or service record',()=>{
 const recruit=roster(new Game('ranked-conversation'),0,'army'),veteran=roster(new Game('ranked-conversation'),8,'army');
 const entity=generateSurface('morrow',recruit.state.seed).entities.find(value=>value.data?.militaryRecruiter),before=structuredClone(entity),records=[structuredClone(recruit.state.professions),structuredClone(veteran.state.professions)];
 const first=recruit.conversation(entity,{record:false}),second=veteran.conversation(entity,{record:false});
 assert.match(first.greeting,/^Recruit,/);assert.match(second.greeting,/^Corporal,/);assert.notEqual(first.greeting,second.greeting);
 assert.match(first.rumor,/3 more completed assignments/);assert.match(second.rumor,/8 more completed assignments/);
 assert.deepEqual(entity,before);assert.deepEqual([recruit.state.professions,veteran.state.professions],records);
 const soldier={id:'common-watch:uniformed',type:'npc',name:'Duty sergeant',role:'warden',data:{militaryFactionId:'freewake',militaryBranchId:'army'}};
 assert.match(veteran.conversation(soldier,{record:false}).greeting,/^Corporal,/);
 const civilian={id:'common-watch:visitor',type:'npc',name:'Visitor',role:'refugee',data:{faction:'freewake'}};
 assert.notEqual(veteran.conversation(civilian,{record:false}).context,'military-service');
 assert.doesNotMatch(militaryDialogue(veteran,{factionId:'meridian'}),/^Corporal,/);
 assert.match(militaryDialogue(veteran,{factionId:'meridian',role:'recruiter'}),/already serve another faction/);
 veteran.state.interior={kind:'ship'};veteran.state.ship.damageControl={sections:[{fire:1}]};
 assert.equal(veteran.conversation(soldier,{record:false}).context,'urgent');
});
