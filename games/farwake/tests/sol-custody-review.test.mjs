import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {enemyHullProfile} from '../dist/fleet.mjs';
import {findFactionSupercapital,supercapitalTractorAnchor} from '../dist/faction-supercapitals.mjs';

test('a hull secured by the tractor leaves ordinary space-combat targets in the same simulation pass',()=>{
 const game=new Game('custody-transition-review',{startMode:'casual'});
 game.state.upgrades.fold_3=1;game._updateStats();game.state.systemId='witness';game._loadSystem('witness');
 game.state.pendingEncounter=null;game.state.ship.fuel=game.state.ship.maxFuel;
 assert.equal(game.travel('sol').ok,true);
 for(let i=0;i<82;i++)game.step(.1,{});
 const ship=game.state.ship,anchor=supercapitalTractorAnchor(findFactionSupercapital(game.system,'concord'));
 Object.assign(ship,{x:anchor.x,y:anchor.y,vx:0,vy:0,shield:0,hull:.2});
 const visit=game.system.solCordon.visits[ship.id];
 assert.ok(visit.tractor);
 Object.assign(visit.tractor,{phase:'towing',remainingSeconds:0});
 // A normal raider remains outside the hangar when the tow reaches it. The
 // pre-capture target list must not allow one last collision through its door.
 game.system.enemies.push({...enemyHullProfile('sparrow'),id:'review:nearby-raider',faction:'cinder',
  x:ship.x,y:ship.y,angle:0,speed:0,hp:100,maxHp:100,cooldown:999,active:true,damage:1,radius:30});
 game.stepWorld(.1,[game]);
 assert.equal(game.state.custody?.phase,'detained');
 assert.equal(game.state.interior?.kind,'brig');
 assert.equal(game.state.ship,ship);
 assert.equal(ship.hull,.2);
 assert.notEqual(ship.destroyed,true);
 assert.equal(game.state.stats.rescues,0);
 assert.equal(game.state.shipRecovery,undefined);
 const events=game.drainEvents();
 assert.ok(events.some(event=>event.type==='sol-tractor-captured'));
 assert.equal(events.some(event=>event.type==='vessel-destroyed'),false);
});

test('real hostile and permitted player projectiles hit the long bow of a commissioned supercapital',()=>{
 const victim=new Game('player-supercapital-impact',{startMode:'casual'});victim._activateClass('bastion',true);const ship=victim.state.ship;Object.assign(ship,{x:1000,y:1000,angle:0});
 const shooter=new Game('permitted-bow-shot',{startMode:'casual'});shooter._runtime=victim.system;shooter.state.systemId=victim.state.systemId;shooter.netCanDamage=target=>target===victim;
 for(const owner of ['review:raider','player']){
  const shield=ship.shield;victim.system.bullets=[{id:`review:${owner}`,x:ship.x+900,y:ship.y,vx:100,vy:0,ttl:1,radius:4,damage:7,owner,ownerId:shooter.playerId,vesselId:shooter.state.ship.id}];
  victim._worldGames=[victim,shooter];victim._updateBullets(.1,[victim,shooter]);assert.equal(ship.shield,shield-7,owner);assert.equal(victim.system.bullets.length,0);
 }
});
