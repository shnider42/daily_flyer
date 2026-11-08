import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceShip, getShipClass, normaliseFlightInput} from '../dist/fleet.mjs';
import {Game} from '../dist/engine.mjs';

const ship=(id='sparrow',extra={})=>({classId:id,...getShipClass(id).stats,x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,energy:100,...extra});
function run(initial,input,seconds=1,hz=60){let s=initial;for(let i=0;i<Math.round(seconds*hz);i++)s=advanceShip(s,1/hz,input);return s;}

test('translation is body-relative, independent of heading, and leaves the input state untouched',()=>{
  const initial=ship('sparrow',{angle:Math.PI/2}),before=structuredClone(initial);
  const lateral=run(initial,{strafe:1,flightAssist:false});
  assert.ok(lateral.x<-60);assert.ok(Math.abs(lateral.y)<1e-9);assert.equal(lateral.angle,Math.PI/2);
  assert.deepEqual(initial,before);
  const forward=run(initial,{thrust:1});assert.ok(forward.y>60);assert.ok(Math.abs(forward.x)<1e-9);
  const counter=run(initial,{strafe:-1});assert.ok(counter.x>60);assert.equal(counter.angularVelocity,0);
});

test('rotation accelerates and coasts without snapping, with substantially slower heavy-hull response',()=>{
  const start=ship(),first=advanceShip(start,1/60,{turn:1});
  assert.ok(first.angle>0&&first.angle<.01);assert.ok(first.angularVelocity>0&&first.angularVelocity<.1);
  const spinning=run(start,{turn:1},.5),released=run(spinning,{},.25);
  assert.ok(released.angle>spinning.angle);assert.ok(released.angularVelocity>0&&released.angularVelocity<spinning.angularVelocity);
  const heavy=run(ship('capital'),{turn:1},.5);assert.ok(spinning.angularVelocity>heavy.angularVelocity*4);
  assert.equal(run(start,{thrust:1,strafe:1},.5).angle,0);
});

test('negative thrust decelerates forward motion without producing reverse thrust or flipping heading',()=>{
  const initial=ship('sparrow',{vx:180,angle:0}),braking=run(initial,{thrust:-1,flightAssist:false},1);
  assert.ok(braking.vx>0&&braking.vx<5);assert.ok(braking.x>0&&braking.x<initial.vx);
  assert.equal(braking.angle,0);assert.equal(braking.vy,0);
  assert.equal(run(ship(),{thrust:-1},2).vx,0);
  assert.ok(run(initial,{flightAssist:false},1).vx>170);
});

test('ending a boost keeps its momentum instead of snapping back to cruise speed',()=>{
  const boosted=run(ship(),{thrust:1,boost:true,flightAssist:false},2);
  assert.ok(boosted.vx>boosted.speed*1.5);
  const coast=advanceShip(boosted,1/30,{flightAssist:false});
  assert.ok(coast.vx>boosted.vx*.99);assert.ok(coast.vx<=boosted.vx);
  const braking=run(coast,{thrust:-1,flightAssist:false},1);assert.ok(braking.vx<coast.vx*.02);
});

test('mixed thrust, strafe, turn, release and braking agree at 20, 30, 60 and 120 FPS',()=>{
  const stages=[[2,{thrust:1,strafe:.4,turn:.65,flightAssist:false}],[1,{flightAssist:false}],[1,{thrust:-1,turn:-.4}],[2,{thrust:1,turn:.2,boost:true}]];
  for(const id of ['sparrow','capital']){
    const samples=[20,30,60,120].map(hz=>{let s=ship(id);for(const [seconds,input]of stages)s=run(s,input,seconds,hz);return s;});
    for(const sample of samples.slice(1))for(const key of ['x','y','vx','vy','angle','angularVelocity'])assert.ok(Math.abs(sample[key]-samples[0][key])<.005,`${id} ${key}: ${sample[key]} vs ${samples[0][key]}`);
  }
});

test('flight fields and angular momentum persist through save and an offline cabin visit',()=>{
  const g=new Game('spin-save');Object.assign(g.state.ship,{x:520,y:-700,vx:37,vy:-22,angle:1.37,angularVelocity:.62});
  const restored=Game.fromSave(g.serialize());assert.equal(restored.state.ship.angle,1.37);assert.equal(restored.state.ship.angularVelocity,.62);
  const expected=Object.fromEntries(['x','y','vx','vy','angle','angularVelocity'].map(k=>[k,restored.state.ship[k]]));
  assert.ok(restored.enterCabin().ok);const cabin=Game.fromSave(restored.serialize());assert.ok(cabin.exitCabin().ok);
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,cabin.state.ship[k]])),expected);
  assert.equal(cabin.state.ship.classId,'sparrow');assert.equal(cabin.state.ship.berths,4);
});

test('invalid and over-range input is normalized before prediction or authoritative physics',()=>{
  const input=normaliseFlightInput({thrust:Infinity,strafe:100,turn:-9,brake:-3,x:NaN,y:NaN});
  assert.deepEqual([input.thrust,input.strafe,input.turn,input.brake],[0,1,-1,0]);
  const next=advanceShip(ship(),.1,input);for(const k of ['x','y','angle','vx','vy','angularVelocity'])assert.ok(Number.isFinite(next[k]));
});
