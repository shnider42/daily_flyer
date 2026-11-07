import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightPresentation} from '../public/presentation.mjs';
import {orientationFromEuler,deriveEuler,basis} from '../public/orientation.mjs';

const scene=()=>({
  player:{id:'pilot',x:0,y:300,z:0,heading:0,pitch:0,roll:0,speed:120,health:100,gear:true,engine:true},
  enemies:[],targets:[],projectiles:[],effects:[],paratroopers:[],mission:{id:'test'},status:'flying',
});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('render poses fill frames between fixed steps without changing authoritative state',()=>{
  const sim=scene(),presentation=new FlightPresentation(sim);
  sim.player.z=2;sim.player.roll=.1;
  for(const alpha of [0,.25,.5,.75,1]){
    const view=presentation.sample(alpha);
    close(view.player.z,2*alpha);close(view.player.roll,.1*alpha);
    assert.equal(sim.player.z,2);assert.equal(sim.player.roll,.1);
    assert.equal(view.player.health,100);assert.equal(view.mission,sim.mission);
    assert.equal({...view.player}.engine,true,'render models can spread the complete pose');
  }
  presentation.capture(sim);sim.player.z=4;
  close(presentation.sample(.5).player.z,3);
});

test('heading and roll interpolate through the wrap without a full-spin camera jump',()=>{
  const sim=scene();sim.player.heading=sim.player.roll=Math.PI-.02;
  const presentation=new FlightPresentation(sim);
  sim.player.heading=sim.player.roll=-Math.PI+.02;
  const view=presentation.sample(.5);
  close(Math.abs(view.player.heading),Math.PI);close(Math.abs(view.player.roll),Math.PI);
});

test('new and removed entities do not interpolate from unrelated objects or linger',()=>{
  const sim=scene();sim.enemies=[{id:'one',x:0,y:300,z:20,heading:0,health:10}];
  const presentation=new FlightPresentation(sim);
  sim.enemies[0].z=22;
  sim.projectiles.push({id:'shot',x:0,y:300,z:5,life:.5,type:'bullet'});
  let view=presentation.sample(.5);
  close(view.enemies[0].z,21);close(view.projectiles[0].z,5);
  sim.enemies=[];sim.projectiles=[];
  view=presentation.sample(.7);
  assert.equal(view.enemies.length,0);assert.equal(view.projectiles.length,0);
  presentation.capture(sim);
  assert.equal(presentation.records.enemies.size,0);
  assert.equal(presentation.records.projectiles.size,0);
});

test('snapshot replacements keep current health and model flags while smoothing positions',()=>{
  const sim=scene();sim.enemies=[{id:'one',x:0,y:300,z:20,heading:0,health:10,engine:true}];
  const presentation=new FlightPresentation(sim);
  sim.enemies=[{id:'one',x:0,y:300,z:22,heading:0,health:4,gear:false}];
  const view=presentation.sample(.5);
  close(view.enemies[0].z,21);assert.equal(view.enemies[0].health,4);
  assert.equal(view.enemies[0].gear,false);assert.equal(view.enemies[0].engine,undefined);
});

test('teleports and mission resets snap immediately rather than flying through terrain',()=>{
  const sim=scene(),presentation=new FlightPresentation(sim);
  sim.player.x=4000;
  close(presentation.sample(.2).player.x,4000);
  const next=scene();next.player.z=8000;presentation.reset(next);
  close(presentation.sample(0).player.z,8000);
  assert.equal(presentation.sample(.5).mission,next.mission);
});


test('attitude interpolation crosses vertical flight on the short body arc, not Euler branches',()=>{
  const sim=scene(),before=orientationFromEuler(.3,89*Math.PI/180,.7),after=orientationFromEuler(.3,91*Math.PI/180,.7);
  Object.assign(sim.player,deriveEuler(before),{orientation:{...before}});const presentation=new FlightPresentation(sim);
  Object.assign(sim.player,deriveEuler(after));Object.assign(sim.player.orientation,after);const authoritative=structuredClone(sim.player);
  const halfway=presentation.sample(.5).player,expected=basis(orientationFromEuler(.3,Math.PI/2,.7)),actual=basis(halfway.orientation);
  for(const axis of ['forward','up','right'])for(const component of ['x','y','z'])close(actual[axis][component],expected[axis][component]);
  assert.deepEqual(sim.player,authoritative);assert.notEqual(halfway.orientation,sim.player.orientation);
  halfway.orientation.w=123;assert.deepEqual(sim.player,authoritative,'render pose cannot mutate authoritative attitude');
  close(Math.hypot(...Object.values(presentation.sample(.5).player.orientation)),1);
});

test('equivalent quaternion signs and inverted poses never cause a full spin between frames',()=>{
  const sim=scene(),q=orientationFromEuler(-.6,.4,Math.PI);Object.assign(sim.player,deriveEuler(q),{orientation:q});
  const presentation=new FlightPresentation(sim);sim.player.orientation=Object.fromEntries(Object.entries(q).map(([k,v])=>[k,-v]));
  for(const alpha of [0,.1,.5,.9,1]){const rendered=basis(presentation.sample(alpha).player.orientation),expected=basis(q);for(const axis of ['forward','up','right'])for(const key of ['x','y','z'])close(rendered[axis][key],expected[axis][key]);}
  sim.player.x=1000;sim.player.orientation=orientationFromEuler(1.2,.2,-.3);assert.deepEqual(presentation.sample(.1).player.orientation,sim.player.orientation,'teleport snaps orientation with position');
});
