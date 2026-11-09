import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {DamageSmokeTrails,sampleCombatEffects,EFFECT_BUDGET,effectViewAlpha} from '../public/combat-visuals.mjs';
import {applyCombatCameraKick} from '../public/combat-camera.mjs';
import {FlightRenderer} from '../public/renderer.mjs';
import {SoftwareFlightRenderer} from '../public/software.mjs';
const mission={id:'effects-proof',aircraft:'f16',biome:'pacific',weather:{},runways:[],waypoints:[],targets:[],start:{x:0,y:200,z:0}};
function canvas(){const noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(object,key)=>object[key]??noop});return{width:800,height:600,getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600})};}
const epsilon=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`);

test('explosion flashes, fire, fragments and smoke have distinct readable phases',()=>{
  const e=Object.freeze({id:'blast',type:'explosion',x:40,y:100,z:0,radius:80,life:3,age:.05});
  const early=sampleCombatEffects([e]);assert.ok(early.some(p=>p.kind==='glow'&&p.alpha>.5));assert.ok(early.some(p=>p.kind==='core'&&p.radius>20));assert.ok(early.filter(p=>p.kind==='fire').length>=8);assert.ok(early.some(p=>p.kind==='debris'));
  const fire=sampleCombatEffects([{...e,age:.5}]);assert.ok(!fire.some(p=>p.kind==='glow'));assert.ok(fire.some(p=>p.kind==='fire'&&p.alpha>.5));assert.ok(fire.some(p=>p.kind==='smoke'&&p.alpha>.6));
  const smoke=sampleCombatEffects([{...e,age:2.3}]);assert.ok(smoke.length>=5);assert.ok(smoke.every(p=>p.kind==='smoke'&&p.y>e.y));assert.ok(smoke.some(p=>p.alpha>.5));
  const inside={kind:'fire',x:0,y:0,z:0,radius:80,alpha:.98};assert.ok(effectViewAlpha(inside,{x:0,y:0,z:10})<.06,'inside a blast remains transparent');assert.equal(effectViewAlpha(inside,{x:0,y:0,z:400}),inside.alpha);
  const crowded=sampleCombatEffects([...Array.from({length:500},(_,i)=>({id:i,type:'trail',x:0,y:0,z:0,radius:2,age:.6,life:2.4})),e],{capacity:40});assert.ok(crowded.some(p=>p.kind==='glow'),'new hits are not starved by old smoke');assert.ok(crowded.length<=40);
});

test('bullet impacts contain a short hot flash and multiple moving sparks instead of one soft dot',()=>{
  const e={id:'strike',type:'impact',x:0,y:100,z:0,radius:22,age:.025,life:.45};
  const first=sampleCombatEffects([e]);assert.ok(first.some(p=>p.kind==='core'));const sparks=first.filter(p=>p.kind==='ember');assert.equal(sparks.length,8);assert.ok(new Set(sparks.map(p=>p.x)).size>4);
  const later=sampleCombatEffects([{...e,age:.25}]);assert.ok(!later.some(p=>p.kind==='core'));assert.ok(later.some(p=>p.kind==='smoke'));assert.notDeepEqual(later.filter(p=>p.kind==='ember').map(p=>p.x),sparks.map(p=>p.x));
});

test('damage smoke follows actual world positions, uses aircraft health ratios and clears old life trails',()=>{
  const trails=new DamageSmokeTrails(),p={id:'pilot',lifeId:1,aircraft:'b17',health:120,x:0,y:200,z:0,heading:0},sim={time:0,player:p,enemies:[]};
  let first=trails.sample(sim);assert.equal(first.length,1,'120 of 240 is damaged, not fully healthy');const firstPosition={x:first[0].x,y:first[0].y,z:first[0].z};
  sim.time=.2;p.x=60;p.z=20;p.heading=1;const next=trails.sample(sim);assert.equal(next.length,2);assert.deepEqual({x:next[0].x,y:next[0].y,z:next[0].z},firstPosition,'old smoke stays where emitted');assert.ok(next[1].x>40);
  sim.time=.4;p.lifeId=2;p.health=240;assert.equal(trails.sample(sim).length,0,'respawn has no smoke inherited from its old life');
  const remotes=Array.from({length:10},(_,i)=>({id:'remote'+i,lifeId:1,aircraft:'f16',health:15,x:i*30,y:250,z:30,heading:.4}));
  for(let i=0;i<100;i++){sim.time=.5+i*.12;assert.ok(trails.sample(sim,{remotePlayers:remotes}).length<=EFFECT_BUDGET.smoke);}
  const frozen=JSON.stringify(remotes),layers=sampleCombatEffects(trails.sample(sim,{remotePlayers:remotes}),{capacity:50});assert.ok(layers.length>10&&layers.length<=50);assert.equal(JSON.stringify(remotes),frozen);
  sim.time=0;assert.equal(trails.sample(sim).length,0,'new sortie time resets cosmetic history');
});

test('both renderers apply a bounded local camera kick without accumulating it or changing aircraft attitude',()=>{
  const pose=Object.freeze({id:'pilot',aircraft:'f16',x:100,y:900,z:400,heading:.7,pitch:.1,roll:1.4,speed:230,health:100,fuel:80}),kick={pitch:.025,yaw:-.016,roll:.032,x:.15,y:-.1};
  const web=Object.create(FlightRenderer.prototype);Object.assign(web,{settings:{},width:800,height:600,mission,camera:new THREE.PerspectiveCamera(60,4/3,.35,95000),_cockpit:{visible:false,userData:{needles:[]}},_plane:{userData:{length:15}},time:0});
  // The cockpit update is unrelated to camera feedback; use chase with a reset
  // each sample so the normal orbit solve is identical on both calls.
  const software=new SoftwareFlightRenderer(canvas());software.loadMission(mission,'f16');
  for(const [r,call,flag]of[[web,'_updateCamera','_cameraInitialized'],[software,'_camera','_cameraReady']]){
    const solve=options=>{r[flag]=false;r[call](pose,1/60,options);return {position:r.camera.position.clone(),quaternion:r.camera.quaternion.clone()};};
    const normal=solve({camera:'chase'}),hit=solve({camera:'chase',combatKick:kick}),repeat=solve({camera:'chase',combatKick:kick});assert.ok(normal.quaternion.angleTo(hit.quaternion)>.02);assert.ok(normal.position.distanceTo(hit.position)>.1);epsilon(hit.quaternion.angleTo(repeat.quaternion),0);epsilon(hit.position.distanceTo(repeat.position),0);
    r.settings.reducedMotion=true;const reduced=solve({camera:'chase',combatKick:kick});epsilon(normal.quaternion.angleTo(reduced.quaternion),0);epsilon(normal.position.distanceTo(reduced.position),0);
  }
  web._updateCamera({...pose,crashed:true},1/60,{camera:'chase'});assert.equal(web._plane.visible,false,'crashed own aircraft is hidden even before health reconciliation');
  assert.equal(pose.roll,1.4);assert.equal(pose.x,100);software.dispose();
  const bounded=new THREE.PerspectiveCamera();applyCombatCameraKick(bounded,{pitch:100,yaw:-100,roll:NaN,x:Infinity,y:-20});assert.ok(bounded.position.length()<=.31);assert.ok(new THREE.Quaternion().angleTo(bounded.quaternion)<.1);
});

test('GPU blast illumination is capped at two short-lived unshadowed lights',()=>{
  const r=Object.create(FlightRenderer.prototype);Object.assign(r,{settings:{},mission,camera:new THREE.PerspectiveCamera(),effectsRoot:new THREE.Group(),time:0});r._buildPools();const effects=Array.from({length:10},(_,i)=>({type:'explosion',id:i,x:i*100,y:20,z:-150,radius:60,age:.08,life:3}));r._updatePools({effects});assert.equal(r._blastLights.length,2);assert.ok(r._blastLights.every(l=>l.intensity>0&&!l.castShadow));r._updatePools({effects:effects.map(e=>({...e,age:1}))});assert.ok(r._blastLights.every(l=>l.intensity===0));
});
