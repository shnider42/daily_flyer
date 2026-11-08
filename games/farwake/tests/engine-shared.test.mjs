import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
const bind=(count,seed)=>{const games=Array.from({length:count},()=>new Game(seed)),runtime=games[0].system,record=games[0]._record();games.forEach((g,i)=>g.bindSharedWorld(runtime,record,`pilot-${i}`));return games;};

test('ten pilots step independently while NPCs, traffic and projectiles advance exactly once per room',()=>{
  const games=bind(10,'ten-pilot-room'),world=games[0].system;games.forEach((g,i)=>Object.assign(g.state.ship,{x:-2000,y:-1800+i*50}));
  world.bullets.push({x:0,y:0,vx:100,vy:0,ttl:10,damage:1,owner:'player',ownerId:'pilot-0',radius:4});
  const enemy={x:world.enemies[0].x,y:world.enemies[0].y},traffic={x:world.traffic[0].x,y:world.traffic[0].y};
  for(const game of games)game.stepPilot(1/30,{});
  assert.equal(world.bullets[0].x,0);assert.equal(world.enemies[0].x,enemy.x);assert.equal(world.traffic[0].x,traffic.x);
  games[0].stepWorld(1/30,games);
  assert.ok(Math.abs(world.bullets[0].x-100/30)<1e-10);assert.ok(Math.abs(world.bullets[0].ttl-(10-1/30))<1e-10);
  assert.ok(Math.hypot(world.enemies[0].x-enemy.x,world.enemies[0].y-enemy.y)<2);assert.ok(Math.hypot(world.traffic[0].x-traffic.x,world.traffic[0].y-traffic.y)<3);
});

test('shared hostiles target the nearest eligible vessel and damage the intersected hull',()=>{
  const [host,near,parked]=bind(3,'target-room'),world=host.system,enemy=world.enemies[0];world.enemies=[enemy];
  Object.assign(enemy,{x:0,y:0,speed:0,cooldown:999});Object.assign(host.state.ship,{x:650,y:0});Object.assign(near.state.ship,{x:100,y:0});Object.assign(parked.state.ship,{x:10,y:0});parked.netTargetEligible=false;
  const shield=near.state.ship.shield,hostShield=host.state.ship.shield;
  world.bullets.push({x:65,y:0,vx:300,vy:0,ttl:1,damage:6,owner:enemy.id,radius:4});host.stepWorld(.1,[host,near,parked]);
  assert.equal(enemy.targetId,near.playerId);assert.equal(near.state.ship.shield,shield-6);assert.equal(host.state.ship.shield,hostShield);assert.equal(parked.state.ship.shield,35);
});

test('a crew gunner receives kill credit while their parked hull is not a physical participant',()=>{
  const [host,gunner]=bind(2,'gunner-credit'),world=host.system,enemy=world.enemies[0];world.enemies=[enemy];
  Object.assign(host.state.ship,{x:0,y:0,angle:0,vx:0,vy:0});Object.assign(enemy,{x:100,y:0,hp:16,speed:0,cooldown:999});
  assert.ok(host.fireWeapons(gunner.playerId).ok);assert.equal(world.bullets[0].ownerId,gunner.playerId);assert.equal(world.bullets[0].vesselId,host.state.ship.id);
  for(let i=0;i<6;i++)host.stepWorld(1/30,[host],{recipients:[gunner]});
  assert.equal(gunner.state.stats.kills,1);assert.equal(host.state.stats.kills,0);assert.equal(host._record().defeated.filter(id=>id===enemy.id).length,1);
});

test('two miners share one deposit and cannot duplicate its ore or depletion record',()=>{
  const [a,b]=bind(2,'shared-mining'),rock=a.system.asteroids[0];a.system.asteroids=[rock];rock.hp=.1;rock.ore=3;rock.crystal=0;
  for(const g of [a,b])Object.assign(g.state.ship,{x:rock.x,y:rock.y,vx:0,vy:0});
  a.stepPilot(1/30,{mine:true});b.stepPilot(1/30,{mine:true});
  assert.equal(a.state.cargo.ore+b.state.cargo.ore,3);assert.equal(a._record().depleted.filter(id=>id===rock.id).length,1);assert.equal(a._record(),b._record());
});

test('a shared cabin preserves live vessel movement when its owner returns to the helm',()=>{
  const [host]=bind(1,'live-cabin');Object.assign(host.state.ship,{x:500,y:-700,vx:30,vy:0,angle:0});
  assert.ok(host.enterCabin().ok);assert.equal(host.state.interior.liveVessel,true);
  const before=host.state.ship.x;for(let i=0;i<30;i++)host.stepPilot(1/30,{thrust:1},{operateShip:true,boardingParticipants:[]});
  assert.ok(host.state.ship.x>before+50);const actual=host.state.ship.x;assert.ok(host.exitCabin().ok);assert.equal(host.state.ship.x,actual);
});
