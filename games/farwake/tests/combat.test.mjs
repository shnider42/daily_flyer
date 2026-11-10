import test from 'node:test';
import assert from 'node:assert/strict';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import { Game } from '../dist/engine.mjs';
import { SIDEARM, sidearmAim, clearSidearmSight } from '../dist/combat.mjs';
import { enemyHullProfile, enemyShipState, getShipClass } from '../dist/fleet.mjs';
import { cabinLayout, isCabinWalkable } from '../dist/interior-layouts.mjs';
import { cleanInput } from '../server/protocol.mjs';

function firingPoint(game) {
 const layout=cabinLayout(game.state.boarding.shipClass),target=layout.combatSpawns[0];
 const point={x:(layout.spawn.x+target.x)/2,y:(layout.spawn.y+target.y)/2};
 assert.ok(isCabinWalkable(layout,point.x,point.y));assert.ok(clearSidearmSight(layout,point,target));
 return point;
}
function bulkheadShot(layout) {
 for(let row=0;row<layout.rows;row++)for(let col=0;col<layout.cols;col++){
  const from={x:(col+.5)*layout.tile,y:(row+.5)*layout.tile};
  if(!isCabinWalkable(layout,from.x,from.y))continue;
  for(let offset=2;offset*layout.tile<SIDEARM.range;offset++){
   const to={x:from.x+offset*layout.tile,y:from.y};
   if(isCabinWalkable(layout,to.x,to.y)&&!clearSidearmSight(layout,from,to))return {from,to};
  }
 }
 assert.fail('The combat fixture needs two walkable positions separated by an in-range bulkhead.');
}

function boarded(seed='sidearm-test') {
 const game=new Game(seed),enemy=placeRaider(game);game.system.enemies=[enemy];
 Object.assign(enemy,{x:game.state.ship.x+80,y:game.state.ship.y,hp:14,disabled:true,cooldown:999,speed:0});
 assert.equal(game.boardEnemy(enemy.id).ok,true);game.drainEvents();
 for(const hostile of game.state.boarding.enemies)hostile.cooldown=999;
 return {game,enemy};
}

test('a standard sidearm is explicit in starter equipment and migrates older captains',()=>{
 const game=new Game('kit');assert.equal(game.state.person.weapon,SIDEARM.id);assert.equal(game.state.person.weaponDrawn,false);
 const save=game.save();delete save.person.weapon;delete save.person.aimAngle;
 const restored=Game.fromSave(save);assert.equal(restored.state.person.weapon,SIDEARM.id);assert.ok(Number.isFinite(restored.state.person.aimAngle));
 const {game:combat}=boarded();assert.equal(combat.state.person.weaponDrawn,true);
});

test('captains never fire without an explicit input and crew-free foes cannot die mysteriously',()=>{
 const {game}=boarded();Object.assign(game.state.person,firingPoint(game));
 const health=game.state.boarding.enemies.map(e=>e.health);
 for(let n=0;n<60;n++)game.step(1/60,{});
 assert.deepEqual(game.state.boarding.enemies.map(e=>e.health),health);
 assert.equal(game.drainEvents().some(e=>e.type==='person-shot'),false);
 assert.equal(game.state.stats.personShots||0,0);
});

test('aim assist preview and fired damage agree, with explicit shot and hit attribution',()=>{
 const {game}=boarded();Object.assign(game.state.person,firingPoint(game));
 const aim=sidearmAim(game.state.person,game.state.boarding.enemies,{},game.state.boarding.shipClass);
 const target=game.state.boarding.enemies.find(e=>e.id===aim.targetId),health=target.health;
 const result=game.attackBoarder();assert.equal(result.ok,true);assert.equal(result.targetId,aim.targetId);assert.equal(target.health,health-SIDEARM.damage);
 const events=game.drainEvents(),shot=events.find(e=>e.type==='person-shot'),hit=events.find(e=>e.type==='person-hit');
 assert.equal(shot.weaponId,SIDEARM.id);assert.equal(shot.team,'player');assert.equal(shot.attackerId,game.playerId);assert.equal(shot.hit,true);
 assert.equal(hit.targetId,target.id);assert.equal(hit.health,target.health);assert.equal(hit.damage,SIDEARM.damage);assert.equal(hit.id,shot.id+':hit');
 assert.equal(game.attackBoarder().code,'cooldown');
});

test('manual aim overrides assistance and firing into empty space still produces a visible pulse',()=>{
 const {game}=boarded();Object.assign(game.state.person,firingPoint(game));
 const health=game.state.boarding.enemies.map(e=>e.health),input={aimX:1,aimY:0,aiming:true};
 const result=game.attackBoarder(null,game,input);assert.equal(result.ok,true);assert.equal(result.hit,false);assert.equal(result.damage,0);
 assert.deepEqual(game.state.boarding.enemies.map(e=>e.health),health);
 const shot=game.drainEvents().find(e=>e.type==='person-shot');assert.ok(shot);assert.equal(shot.hit,false);assert.ok(shot.targetX>shot.x);assert.equal(game.state.person.aimManual,true);
});

test('bulkheads stop a manual shot before an otherwise in-range hostile',()=>{
 const {game}=boarded(),layout=cabinLayout(game.state.boarding.shipClass),{from,to}=bulkheadShot(layout);Object.assign(game.state.person,from);
 const target=game.state.boarding.enemies[0];Object.assign(target,to);for(const other of game.state.boarding.enemies.slice(1))other.health=0;
 assert.ok(isCabinWalkable(layout,game.state.person.x,game.state.person.y));assert.ok(isCabinWalkable(layout,target.x,target.y));
 assert.equal(clearSidearmSight(layout,game.state.person,target),false);
 const health=target.health,result=game.attackBoarder(null,game,{aimX:1,aimY:0,aiming:true});
 assert.equal(result.ok,true);assert.equal(result.shot.blocked,true);assert.equal(result.hit,false);assert.equal(target.health,health);assert.ok(result.shot.targetX<target.x);
});

test('allied kills identify the crew member and do not increment captain kill credit',()=>{
 const {game}=boarded();const b=game.state.boarding,target=b.enemies[0];
 for(const hostile of b.enemies)hostile.health=0;
 Object.assign(target,cabinLayout(b.shipClass).combatSpawns[0],{health:1,cooldown:999});
 const crew={id:'crew-defense',name:'Mara',role:'security',health:140,maxHealth:140,status:'active'};game.state.crew=[crew];
 b.allies=[{id:'guard-mara',crewId:crew.id,name:crew.name,role:'security',...firingPoint(game),health:140,maxHealth:140,team:'friendly',damage:16,cooldown:0,speed:64}];
 game.step(1/60,{});
 const down=game.drainEvents().find(e=>e.type==='boarder-down');assert.ok(down);assert.equal(down.attackerId,'guard-mara');assert.equal(down.actorName,'Mara');assert.equal(down.team,'friendly');
 assert.equal(game.state.stats.personKills||0,0);assert.equal(b.kills.crew,1);
});

test('enemy exterior geometry and captured vessel damage share the same hull class',()=>{
 const game=new Game('enemy-scale');game.state.systemId='cinder';game._loadSystem('cinder');assert.ok(game.system.enemies.length>0);
 for(const enemy of game.system.enemies){const profile=enemyHullProfile(enemy.classId);assert.equal(enemy.radius,profile.radius);assert.equal(enemy.renderLength,profile.renderLength);assert.equal(enemy.renderWidth,profile.renderWidth);assert.equal(enemy.berths,profile.berths);}
 const source={id:'damaged-hauler',name:'Test transport',classId:'hauler',hp:10,maxHp:50,x:700,y:300,angle:.4,disabled:true};
 const ship=enemyShipState(source);assert.equal(ship.classId,'hauler');assert.equal(ship.id,source.id);assert.equal(ship.hull/ship.maxHull,.2);assert.equal(ship.renderLength,getShipClass('hauler').stats.renderLength);assert.equal(ship.x,700);assert.equal(ship.shield,0);
 assert.equal(cleanInput({aimX:20,aimY:-7,aiming:true}).aiming,true);assert.equal(cleanInput({aimX:20}).aimX,1);
});
