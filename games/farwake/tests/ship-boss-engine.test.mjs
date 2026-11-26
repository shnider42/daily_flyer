import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {shipBossPlan,captureShipBosses} from '../dist/ship-bosses.mjs';
import {musicContext} from '../dist/music-context.mjs';

const seed='boss-game-integration';
function fixture(archetype){
 const systemId=shipBossPlan(seed).find(entry=>entry.archetype===archetype).systemId;
 const game=new Game(seed,{startMode:'casual',startSystemId:systemId});
 const enemy=game.system.enemies.find(actor=>actor.shipBoss&&!actor.shipBossPart);assert.ok(enemy);
 game.system.enemies=game.system.enemies.filter(actor=>actor.shipBoss);game.system.traffic=[];game.system.signals=[];
 game.state.mode='ship';game.state.locationId=null;game.state.interior=null;
 Object.assign(game.state.ship,{x:enemy.x+600,y:enemy.y,vx:0,vy:0});
 return{game,enemy};
}
function hit(game,enemy,damage){
 game.system.bullets.push({id:`test-pulse:${enemy.id}:${enemy.hp}`,owner:'player',ownerId:game.playerId,vesselId:game.state.ship.id,
  x:enemy.x-enemy.radius-10,y:enemy.y,vx:300,vy:0,ttl:1,damage,radius:4});
 game._updateBullets(.1,[game]);
}

test('Game saves and reloads the real boss actor during its warning without generic AI or boarding conversion',()=>{
 for(const archetype of ['siege-monitor','ram-tug','screen-carrier']){
  const {game,enemy}=fixture(archetype);
  game.stepWorld(.1,[game]);assert.equal(enemy.bossState.phase,'windup');
  const angle=enemy.bossState.aimAngle;
  game.state.ship.y+=120;game.stepWorld(.1,[game]);assert.equal(enemy.angle,angle,'ordinary chasing AI cannot rotate a committed boss');
  enemy.hp=enemy.maxHp*.38;
  hit(game,enemy,1);assert.equal(enemy.disabled,false,'a low-health boss keeps its attack rules');assert.equal(enemy.boardable,false);
  assert.equal(game.boardEnemy(enemy.id).ok,false);
  const before=captureShipBosses(game.system),restored=Game.fromSave(game.serialize());
  assert.deepEqual(captureShipBosses(restored.system),before);
  const restoredEnemy=restored.system.enemies.find(actor=>actor.id===enemy.id);assert.equal(restoredEnemy.bossState.aimAngle,angle);
  assert.equal(restoredEnemy.disabled,false);assert.equal(restoredEnemy.boardable,false);
 }
});

test('the actual bullet pipeline respects shield objectives, pays no relay bounty, and keeps defeats permanent',()=>{
 const {game,enemy}=fixture('screen-carrier'),kills=game.state.stats.kills;
 hit(game,enemy,1000);assert.equal(enemy.hp,enemy.maxHp,'the shield is enforced at damage resolution');
 const relays=game.system.enemies.filter(actor=>actor.shipBossPart);
 for(const relay of relays)hit(game,relay,1000);
 assert.equal(game.state.stats.kills,kills);assert.equal(game.system.pickups.length,0);
 assert.equal(game.system.enemies.filter(actor=>actor.shipBossPart).length,0);
 const partial=Game.fromSave(game.serialize());assert.equal(partial.system.enemies.filter(actor=>actor.shipBossPart).length,0);
 const primary=partial.system.enemies.find(actor=>actor.id===enemy.id);hit(partial,primary,2000);
 assert.equal(partial.state.stats.kills,kills+1);assert.equal(partial._record().defeated.filter(id=>id===enemy.id).length,1);
 const loot=partial.system.pickups.filter(pickup=>pickup.credits===enemy.reward);assert.equal(loot.length,1);
 const restored=Game.fromSave(partial.serialize());assert.ok(!restored.system.enemies.some(actor=>actor.shipBoss));
 assert.equal(restored.system.pickups.filter(pickup=>pickup.credits===enemy.reward).length,1);
});

test('a real ship-boss engagement stops scoring for a down observer or a destroyed occupied hull',()=>{
 const {game}=fixture('siege-monitor');game.stepWorld(.1,[game]);
 const read=()=>musicContext({game,playing:true}),live=read();assert.ok(live.bossEncounterKey);assert.equal(live.bossObserved,true);
 const hull=game.state.ship.hull;
 for(const change of [()=>{game.state.person.down=true;},()=>{game.state.person.health=0;},()=>{game.state.ship.hull=0;}]){
  Object.assign(game.state.person,{health:100,down:false});game.state.ship.hull=hull;change();
  assert.equal(read().bossEncounterKey,null);assert.equal(read().bossObserved,false);
 }
 Object.assign(game.state.person,{health:100,down:false});game.state.ship.hull=hull;
 assert.equal(read().bossEncounterKey,live.bossEncounterKey,'The ongoing physical engagement remains available to a recovered observer.');
});
