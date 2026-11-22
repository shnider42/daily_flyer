import test from 'node:test';
import assert from 'node:assert/strict';
import { clientToCanvasPoint, traceAim } from '../public/desktop-input.mjs';
import { createGame, step } from '../public/sim.mjs';

test('pointer coordinates use cached CSS geometry independently of the rendering buffer', () => {
  const rect = { left: 140, top: 80, width: 1280, height: 720 };
  const logicalViewport = { width: 1280, height: 720 };
  const expected = { x: 640, y: 360, inside: true };
  for (const buffer of [{bufferWidth:1280,bufferHeight:720},{bufferWidth:2560,bufferHeight:1440},{bufferWidth:896,bufferHeight:504}]) {
    assert.deepEqual(clientToCanvasPoint(780, 440, rect, {...logicalViewport,...buffer}), expected);
  }
  assert.deepEqual(clientToCanvasPoint(460, 260, {...rect,width:640,height:360}, logicalViewport), expected);
});

test('captured pointers retain out-of-bounds positions and invalid geometry cannot become a valid aim', () => {
  const rect = { left: 20, top: 30, width: 100, height: 50 };
  assert.deepEqual(clientToCanvasPoint(5, 100, rect), {x:-15,y:70,inside:false});
  assert.deepEqual(clientToCanvasPoint(120, 80, rect), {x:100,y:50,inside:true});
  assert.equal(clientToCanvasPoint(NaN, 10, rect), null);
  assert.equal(clientToCanvasPoint(10, 10, {...rect,width:0}), null);
  assert.equal(clientToCanvasPoint(10, 10, null), null);
});

test('aim cover tracing selects the nearest wall regardless of building order', () => {
  const far = {x:250,y:20,w:50,h:80}, near = {x:100,y:20,w:40,h:80};
  const trace = traceAim({buildings:[far,near]}, {x:0,y:60}, {x:400,y:60});
  assert.equal(trace.blocked,true); assert.equal(trace.wall,near);
  assert.deepEqual(trace.point,{x:100,y:60}); assert.equal(trace.fraction,.25); assert.equal(trace.distance,100);
});

test('parallel, grazing, and start-inside aim segments match solid building boundaries', () => {
  const wall={x:100,y:100,w:40,h:80}, world={buildings:[wall]};
  assert.equal(traceAim(world,{x:80,y:99.999},{x:200,y:99.999}).blocked,false);
  assert.deepEqual(traceAim(world,{x:80,y:100},{x:200,y:100}).point,{x:100,y:100});
  assert.deepEqual(traceAim(world,{x:100,y:80},{x:100,y:200}).point,{x:100,y:100});
  const inside=traceAim(world,{x:120,y:140},{x:200,y:140});
  assert.equal(inside.blocked,true); assert.equal(inside.fraction,0); assert.equal(inside.distance,0);
  const stationary=traceAim(world,{x:50,y:50},{x:50,y:50});
  assert.equal(stationary.blocked,false); assert.equal(stationary.distance,0);
});

test('aim tracing stops at the requested endpoint and does not invent a range limit', () => {
  const world={buildings:[{x:-100,y:0,w:20,h:20},{x:1200,y:0,w:20,h:20}]};
  const trace=traceAim(world,{x:0,y:10},{x:1000,y:10});
  assert.equal(trace.blocked,false); assert.deepEqual(trace.point,{x:1000,y:10}); assert.equal(trace.distance,1000);
  assert.equal(traceAim(world,{x:Infinity,y:10},{x:1000,y:10}),null);
  assert.equal(traceAim(world,{x:0,y:10},null),null);
});

test('the visible wall cue agrees with an actual simulated projectile impact', () => {
  const state=createGame({seed:81}); state.enemies=[]; state.civilians=[]; state.maxEnemies=0;
  const wall=state.world.buildings[0], from={x:wall.x-60,y:wall.y+70}, to={x:wall.x+60,y:wall.y+70};
  const trace=traceAim(state.world,from,to);
  state.bullets=[{id:9999,x:from.x,y:from.y,px:from.x,py:from.y,vx:(to.x-from.x)/.05,vy:0,team:'squad',owner:state.playerId,weapon:'rifle',damage:24,ttl:1}];
  step(state,{},.05);
  const impact=state.soundEvents.find(event=>event.type==='impact');
  assert.equal(trace.blocked,true); assert.ok(impact);
  assert.ok(Math.abs(impact.x-trace.point.x)<1e-8); assert.ok(Math.abs(impact.y-trace.point.y)<1e-8);
});

test('human weapon orientation stays on the cursor while the original seeded shot spread remains', () => {
  const state=createGame({seed:33}); state.enemies=[]; state.civilians=[]; state.maxEnemies=0;
  const actor=state.squad.find(actor=>actor.id===state.playerId); actor.cooldown=0; actor.suppression=.5;
  const beforeRandom=state.rngState, dt=1/60, aim={x:actor.x+400,y:actor.y};
  const spread=.018+.045*(actor.suppression-dt*.22);
  const nextRandom=(Math.imul(beforeRandom,1664525)+1013904223)>>>0;
  const expectedShotAngle=-spread+2*spread*(nextRandom/4294967296);
  step(state,{fire:true,aimX:aim.x,aimY:aim.y},dt);
  const bullet=state.bullets.find(bullet=>bullet.owner===actor.id);
  const muzzle=state.effects.find(effect=>effect.type==='muzzle'&&effect.actorId===actor.id);
  assert.equal(actor.angle,0,'dispersion must not move the human away from their exact cursor direction');
  assert.ok(bullet); assert.ok(muzzle);
  assert.ok(Math.abs(bullet.vx-Math.cos(expectedShotAngle)*930)<1e-9);
  assert.ok(Math.abs(bullet.vy-Math.sin(expectedShotAngle)*930)<1e-9);
  assert.ok(Math.abs(muzzle.angle-expectedShotAngle)<1e-12);
  assert.ok(Math.abs(muzzle.x-(actor.x+Math.cos(expectedShotAngle)*20))<1e-9);
  assert.ok(Math.abs(muzzle.y-(actor.y+Math.sin(expectedShotAngle)*20))<1e-9);
});
