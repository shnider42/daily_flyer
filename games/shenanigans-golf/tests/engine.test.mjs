import test from 'node:test';
import assert from 'node:assert/strict';
import { GolfGame, BALL_RADIUS, MAX_STROKES, HOLE_SECONDS, simulateShot } from '../public/engine.mjs';
import { HOLES, COURSE_PAR, obstaclePose } from '../public/holes.mjs';

const humans=()=>[0,1,2,3].map(i=>({id:`p${i+1}`,name:`Player ${i+1}`,isBot:false}));
const bots=()=>humans().map(p=>({...p,isBot:true}));
function runUntil(g,predicate,seconds=30,dt=1/30){for(let t=0;t<seconds&&!predicate();t+=dt)g.update(dt);assert.ok(predicate(),'Condition reached before the time limit');}
function at(player,x,z){player.ball.x=x;player.ball.z=z;player.ball.y=BALL_RADIUS;player.ball.safe={x,z};}

test('the authored course has 18 complete, varied and correctly bounded playable holes',()=>{
  assert.equal(HOLES.length,18);assert.equal(new Set(HOLES.map(h=>h.name)).size,18);assert.equal(COURSE_PAR,62);
  for(const [i,h] of HOLES.entries()){
    assert.equal(h.id,i+1);assert.ok(h.par>=2&&h.par<=5);assert.ok(h.tip&&h.blurb&&h.chapter);
    for(const p of [h.tee,h.cup])assert.ok(h.platforms.some(r=>Math.abs(p.x-r.x)<=r.w/2&&Math.abs(p.z-r.z)<=r.d/2),`${h.name}: tee and cup on a platform`);
    assert.ok(h.rails.length>=4);assert.ok(h.bounds.maxX>h.bounds.minX&&h.bounds.maxZ>h.bounds.minZ);
  }
  assert.ok(HOLES.filter(h=>h.platforms.length>1).length>=5);
  assert.ok(new Set(HOLES.flatMap(h=>h.zones.map(z=>z.type))).size>=9);
});

test('a genuine physical putt sinks on the opening hole and records one stroke',()=>{
  const g=new GolfGame({players:humans()});
  assert.deepEqual(g.shoot('p1',{angle:0,power:Math.sqrt(2*2.7*16)/18}),{ok:true});
  runUntil(g,()=>g.state.players[0].ball.holed,12);
  assert.equal(g.state.players[0].scores[0],1);
  assert.ok(g.state.events.some(e=>e.kind==='cup'&&e.playerId==='p1'));
});

test('illegal power, nonfinite aim, second shots in motion and unknown golfers cannot alter the score',()=>{
  const g=new GolfGame({players:humans()}),p=g.state.players[0];
  for(const shot of [{angle:NaN,power:.5},{angle:Infinity,power:.5},{angle:0,power:1.1},{angle:0,power:0},{angle:'0',power:.5}])assert.equal(g.shoot('p1',shot).ok,false);
  assert.equal(g.shoot('nobody',{angle:0,power:.5}).ok,false);assert.equal(p.strokes,0);
  assert.equal(g.shoot('p1',{angle:1,power:.3}).ok,true);assert.equal(g.shoot('p1',{angle:0,power:.5}).ok,false);assert.equal(p.strokes,1);
});

test('rails physically rebound a ball without tunnelling through the edge',()=>{
  const g=new GolfGame({players:humans()}),p=g.state.players[0];
  g.shoot('p1',{angle:Math.PI/2,power:.7});
  runUntil(g,()=>p.ball.vx< -1,2);
  assert.ok(p.ball.x<HOLES[0].bounds.maxX-BALL_RADIUS);
  assert.equal(p.strokes,1);
});

test('a water entry costs exactly one penalty and returns to the real previous lie',()=>{
  const g=new GolfGame({players:humans(),holeIndex:3}),p=g.state.players[0];at(p,-3.5,0);
  g.shoot('p1',{angle:0,power:.4});
  runUntil(g,()=>g.state.events.some(e=>e.kind==='water'),4);
  runUntil(g,()=>!p.ball.moving,2);
  assert.equal(p.strokes,2);assert.equal(p.ball.x,-3.5);assert.equal(p.ball.z,0);assert.equal(p.ball.holed,false);
});

test('a ramp launches into real vertical flight and clears its pond',()=>{
  const g=new GolfGame({players:humans(),holeIndex:5}),p=g.state.players[0];at(p,-3,7.2);
  g.shoot('p1',{angle:0,power:.6});let highest=0;
  for(let t=0;t<5;t+=1/120){g.update(1/120);highest=Math.max(highest,p.ball.y);}
  assert.ok(highest>1.5);assert.ok(p.ball.z< -3);assert.equal(p.strokes,1);
  assert.ok(!g.state.events.some(e=>e.kind==='water'));
});

test('a portal transports a rolling ball between disconnected islands and preserves its stroke',()=>{
  const g=new GolfGame({players:humans(),holeIndex:10}),p=g.state.players[0];
  g.shoot('p1',{angle:0,power:.6});
  runUntil(g,()=>g.state.events.some(e=>e.kind==='portal'),4);
  assert.equal(p.strokes,1);assert.ok(p.ball.x>0&&p.ball.z<0);assert.ok(p.ball.moving);assert.ok(p.ball.portalUntil>g.state.time);
});

test('moving obstacles use one deterministic pose contract',()=>{
  const gate={type:'gate',x:1,z:3,angle:0,speed:2,travel:4,phase:0,axis:'x'};
  assert.deepEqual(obstaclePose(gate,0),{x:1,z:3,angle:0});
  assert.ok(Math.abs(obstaclePose(gate,Math.PI/4).x-5)<1e-9);
  const bar={type:'spinner',x:0,z:0,angle:.2,speed:1.1,phase:.4};assert.ok(Math.abs(obstaclePose(bar,2).angle-2.8)<1e-9);
});

test('per-hole points split tied places; the next hole retains scores and resets balls',()=>{
  const g=new GolfGame({players:humans(),mode:'points'});
  g.state.players.forEach((p,i)=>{at(p,HOLES[0].cup.x,HOLES[0].cup.z+.8);p.strokes=[1,1,2,3][i];g.shoot(p.id,{angle:0,power:.12});});
  runUntil(g,()=>g.state.phase==='holeComplete',4);
  assert.deepEqual(g.state.players.map(p=>p.scores[0]),[2,2,3,4]);assert.deepEqual(g.state.players.map(p=>p.points),[3.5,3.5,2,1]);
  assert.equal(g.nextHole(),true);assert.equal(g.state.holeIndex,1);assert.equal(g.state.phase,'playing');
  for(const p of g.state.players){assert.equal(p.strokes,0);assert.equal(p.ball.holed,false);assert.equal(p.scores[1],null);}
  assert.equal(g.nextHole(),false);
});

test('a stroke cap resolves the hole without fabricated cup events',()=>{
  const g=new GolfGame({players:humans()}),p=g.state.players[0];p.strokes=11;
  g.shoot('p1',{angle:Math.PI,power:.08});
  runUntil(g,()=>p.capped,4);
  assert.equal(p.strokes,MAX_STROKES);assert.equal(p.scores[0],MAX_STROKES);assert.equal(p.ball.holed,true);
  assert.ok(!g.state.events.some(e=>e.kind==='cup'&&e.playerId==='p1'));
});

test('the visible hole deadline caps unfinished golfers and cannot stall a round',()=>{
  const g=new GolfGame({players:humans()});
  for(let t=0;t<HOLE_SECONDS+.5;t+=.5)g.update(.5);
  assert.equal(g.state.phase,'holeComplete');assert.deepEqual(g.state.players.map(p=>p.scores[0]),[12,12,12,12]);
  assert.deepEqual(g.state.players.map(p=>p.points),[2.5,2.5,2.5,2.5]);
});

test('a simulation forecast never mutates the real ball or scores',()=>{
  const g=new GolfGame({players:humans()}),before=JSON.stringify(g.state);
  const prediction=simulateShot(HOLES[0],g.state.players[0].ball,{angle:0,power:.52});
  assert.ok(prediction.ball.holed);assert.equal(JSON.stringify(g.state),before);
});

test('four real CPU golfers play all 18 holes to completion, using no automatic stroke caps',()=>{
  const g=new GolfGame({players:bots(),difficulty:'club',seed:42});
  runUntil(g,()=>g.state.phase==='finished',2000,.1);
  for(const p of g.state.players){assert.equal(p.scores.length,18);assert.ok(p.scores.every(n=>Number.isInteger(n)&&n>0&&n<MAX_STROKES));}
  assert.equal(g.state.holeIndex,17);assert.equal(g.state.players.reduce((n,p)=>n+p.points,0),180);
  assert.ok(g.state.players.some(p=>p.scores.some(n=>n>3)),'CPU golfers make imperfect shots');
});

test('practice finishes only the selected hole and does not invent scores on other holes',()=>{
  const g=new GolfGame({players:bots(),holeIndex:10,practice:true,seed:5});
  runUntil(g,()=>g.state.phase==='finished',200,.1);
  assert.equal(g.state.holeIndex,10);
  for(const p of g.state.players){assert.equal(p.scores.filter(v=>v!==null).length,1);assert.ok(p.scores[10]>0);}
});
