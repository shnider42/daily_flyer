import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { enemyHullProfile } from '../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function changeSystem(game,id){
 game._persistRuntime();game.state.mode='ship';game.state.locationId=null;game.state.interior=null;game.state.systemId=id;game._loadSystem(id);
}
function dock(game,bodyId){const body=game.system.bodies.find(body=>body.id===bodyId);assert.ok(body);Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+70,vx:0,vy:0});ok(game.dock(body.id));}
function defeatWithPulse(game,enemy){
 game.system.bullets.push({id:`pulse:${enemy.id}`,x:enemy.x,y:enemy.y,vx:1,vy:0,ttl:1,damage:enemy.maxHp+20,owner:'player',ownerId:game.playerId,vesselId:game.state.ship.id,radius:4});
 game._updateBullets(.05,[game]);assert.ok(game._record().defeated.includes(enemy.id));
}

test('protected ports offer ordinary work without creating an impossible ambient-kill bounty',()=>{
 const game=new Game('core-bounty');dock(game,'kettle');const before=game.system.enemies.length,jobs=game.availableJobs();
 assert.equal(before,0);assert.ok(!jobs.some(job=>job.type==='bounty'));assert.ok(jobs.some(job=>job.type==='work'));assert.ok(jobs.some(job=>job.type==='delivery'));assert.ok(jobs.some(job=>job.type==='survey'));
 assert.equal(game.system.enemies.length,before);assert.equal(game.acceptJob('hearth:kettle:jobs:0:bounty').ok,false);
 for(const [systemId,bodyId]of[['brindle','orchard'],['vesper','listening']]){
  changeSystem(game,systemId);dock(game,bodyId);assert.ok(!game.availableJobs().some(job=>job.type==='bounty'));assert.equal(game.system.enemies.length,0);
 }
});

test('a new local bounty is offered only while two real ordinary hostile hulls remain',()=>{
 const game=new Game('frontier-bounty');changeSystem(game,'cinder');dock(game,'patchwork');
 const targets=game.system.enemies.filter(enemy=>enemy.id.startsWith('cinder:raider:'));assert.ok(targets.length>=2);
 const offer=game.availableJobs().find(job=>job.type==='bounty');assert.ok(offer);assert.equal(offer.bountyScope,'local');assert.match(offer.description,/Defeat two hostile ships in this system/);
 ok(game.launch());for(const enemy of targets.slice(1))defeatWithPulse(game,enemy);dock(game,'patchwork');
 assert.equal(game.system.enemies.filter(enemy=>enemy.hp>0&&enemy.id.startsWith('cinder:raider:')).length,1);assert.ok(!game.availableJobs().some(job=>job.type==='bounty'));assert.equal(game.acceptJob(offer.id).ok,false);
});

test('an accepted frontier bounty keeps its local scope and remains payable after its targets are gone',()=>{
 const game=new Game('accepted-frontier-bounty');changeSystem(game,'cinder');dock(game,'patchwork');const offer=game.availableJobs().find(job=>job.type==='bounty'),mission=ok(game.acceptJob(offer.id)).job;
 changeSystem(game,'sable');const foreign=game.system.enemies.find(enemy=>enemy.hp>0);assert.ok(foreign);defeatWithPulse(game,foreign);assert.equal(mission.progress,0);
 changeSystem(game,'cinder');for(const enemy of game.system.enemies.filter(enemy=>enemy.id.startsWith('cinder:raider:')).slice(0,2))defeatWithPulse(game,enemy);
 assert.equal(mission.progress,2);assert.equal(mission.status,'ready');dock(game,'patchwork');
 assert.equal(game.availableJobs().find(job=>job.id===offer.id).status,'ready');const before=game.state.credits;ok(game.turnInJob(mission.id));assert.equal(game.state.credits,before+offer.reward);
 assert.equal(game.turnInJob(mission.id).ok,false);assert.equal(game.state.credits,before+offer.reward);
});

test('an accepted legacy core contract preserves pay and progress and finishes through real frontier defeats',()=>{
 let game=new Game('legacy-core-bounty');dock(game,'kettle');
 const id='hearth:kettle:jobs:0:bounty',oldToken='hearth:raider:legacy';
 game.state.missions.push({id,type:'bounty',title:'Keep the lanes clear',description:'Disable two hostile ships. The port will pay when you return.',goal:2,reward:242,oreCost:0,targetBody:'kettle',targetSystem:'hearth',originBody:'kettle',originSystem:'hearth',faction:'freewake',icon:'target',status:'active',progress:1,tokens:[oldToken],acceptedAt:12,startedStats:{kills:0,scans:0}});
 game=Game.fromSave(game.save());game.availableJobs();let mission=game.state.missions.find(job=>job.id===id);
 assert.equal(mission.bountyScope,'frontier');assert.equal(mission.reward,242);assert.equal(mission.progress,1);assert.deepEqual(mission.tokens,[oldToken]);assert.match(mission.description,/frontier routes/);assert.match(mission.description,/Kettle Station/);
 assert.equal(game.system.enemies.length,0,'migration must not populate the core with arbitrary raiders');
 game=Game.fromSave(game.save());mission=game.state.missions.find(job=>job.id===id);assert.equal(mission.bountyScope,'frontier');
 const coreEnemy={id:'old-core-pursuer',name:'Old pursuer',...enemyHullProfile('sparrow'),x:1000,y:1000,hp:30,maxHp:30,reward:0,active:true,faction:'cinder'};game.system.enemies.push(coreEnemy);defeatWithPulse(game,coreEnemy);assert.equal(mission.progress,1,'the revised contract concerns frontier routes');
 changeSystem(game,'cinder');dock(game,'patchwork');ok(game.recordActivity('surface-combat',{token:'wildlife-victory'}));assert.equal(mission.progress,1,'person-mode activity is not a ship defeat');
 ok(game.launch());const enemy=game.system.enemies.find(value=>value.hp>0);assert.ok(enemy);game.progressJob('bounty',1,{token:enemy.id});assert.equal(mission.progress,1,'a live target is not a confirmed kill');
 defeatWithPulse(game,enemy);assert.equal(mission.progress,2);assert.equal(mission.status,'ready');assert.ok(mission.tokens.includes(enemy.id));
 game.progressJob('bounty',1,{token:enemy.id});assert.equal(mission.tokens.filter(token=>token===enemy.id).length,1);
 dock(game,'patchwork');assert.equal(game.turnInJob(id).code,'location');changeSystem(game,'hearth');dock(game,'kettle');const before=game.state.credits;ok(game.turnInJob(id));assert.equal(game.state.credits,before+242);assert.equal(game.turnInJob(id).ok,false);
});
