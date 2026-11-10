import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {NUCLEAR_PAYLOADS} from '../public/payloads.mjs';
import {sampleCombatEffects,EFFECT_BUDGET} from '../public/combat-visuals.mjs';
import {CombatFeedback} from '../public/combat-feedback.mjs';
import {synthesizeCombatSound,combatCueProfile} from '../public/combat-audio.mjs';
import {FlightRenderer} from '../public/renderer.mjs';
import {SoftwareFlightRenderer} from '../public/software.mjs';

const burst=(payload='atomic',age=0)=>({id:'nuclear-proof',type:'nuclear',payload,x:0,y:20,z:-4000,radius:NUCLEAR_PAYLOADS[payload].blastRadius,age,life:NUCLEAR_PAYLOADS[payload].effectLife});
const finiteLayer=layer=>['x','y','z','radius','alpha','stretch','angle'].every(k=>Number.isFinite(layer[k]));
const zeroKick=kick=>Object.values(kick).every(v=>v===0);
const flight=effect=>({mission:{id:'nuclear-cue'},time:0,aircraft:{health:200},player:{id:'pilot',lifeId:1,health:200,x:0,y:20,z:-2700,heading:0},effects:[effect],events:[]});
const mission={id:'nuclear-render-proof',aircraft:'b2',arena:true,biome:'night',weather:{},runways:[],waypoints:[],targets:[],start:{x:0,y:2000,z:0}};
function canvas(){const noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(object,key)=>object[key]??noop});return {width:800,height:600,getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600})};}

test('each nuclear tier grows from one flash through a fireball into a rising mushroom and fading cloud',()=>{
  const plumeExtents=[];
  for(const id of Object.keys(NUCLEAR_PAYLOADS)){
    const source=Object.freeze(burst(id,.08)),early=sampleCombatEffects([source]);
    assert.ok(early.some(p=>p.kind==='glow'&&p.alpha>.6));assert.ok(early.some(p=>p.kind==='core'));assert.ok(early.filter(p=>p.kind==='fire').length>=12);
    const growing=sampleCombatEffects([{...source,age:3}]);assert.ok(!growing.some(p=>p.kind==='glow'),'one flash only');assert.ok(growing.some(p=>p.kind==='fire'));assert.ok(growing.filter(p=>p.kind==='cloud').length>=45);
    const tall=sampleCombatEffects([{...source,age:12}]),clouds=tall.filter(p=>p.kind==='cloud');assert.ok(clouds.length>=45);assert.ok(!tall.some(p=>['glow','fire','core'].includes(p.kind)));
    const lower=clouds.filter(p=>p.y<source.y+source.radius*.22),upper=clouds.filter(p=>p.y>source.y+source.radius*.3);
    assert.ok(lower.length>0&&upper.length>0);assert.ok(Math.max(...upper.map(p=>Math.abs(p.x)+p.radius))>Math.max(...lower.map(p=>Math.abs(p.x)+p.radius))*1.5,'cap is wider than the stem');
    const upperY=Math.max(...clouds.map(p=>p.y+p.radius));plumeExtents.push(upperY);
    const last=sampleCombatEffects([{...source,age:source.life-.1}]);assert.ok(last.every(p=>p.alpha<.04));assert.equal(sampleCombatEffects([{...source,age:source.life}]).length,0);
    for(const layers of [early,growing,tall,last])assert.ok(layers.every(finiteLayer));
    assert.deepEqual(growing,sampleCombatEffects([{...source,age:3}]),'effect age and id reproduce the same shape');
  }
  assert.ok(plumeExtents[0]<plumeExtents[1]&&plumeExtents[1]<plumeExtents[2],'larger tiers produce a visibly taller plume');
});

test('pressure-front animation tracks the authoritative game wave and is bounded under crowding',()=>{
  for(const profile of Object.values(NUCLEAR_PAYLOADS))for(const age of [.1,1,3,profile.blastRadius/profile.waveSpeed]){
    const layers=sampleCombatEffects([burst(profile.id,age)]),wave=layers.find(p=>p.kind==='wave');
    assert.ok(wave);assert.equal(wave.radius,Math.min(profile.blastRadius,age*profile.waveSpeed));
    assert.ok(layers.some(p=>p.kind==='ground-ring'));assert.ok(layers.some(p=>p.kind==='dust'));
  }
  const effects=Array.from({length:100},(_,i)=>({...burst(i%2?'tsar':'atomic',3),id:`burst-${i}`,x:i*100}));
  const out=[];assert.equal(sampleCombatEffects(effects,{capacity:192},out),out);assert.ok(out.length<=192&&out.every(finiteLayer));
  assert.ok(sampleCombatEffects(effects).length<=EFFECT_BUDGET.layers);
  const normal=sampleCombatEffects([burst('atomic',.08)]),reduced=sampleCombatEffects([burst('atomic',.08)],{reducedMotion:true});
  assert.ok(reduced.find(p=>p.kind==='glow').alpha<normal.find(p=>p.kind==='glow').alpha*.2);
});

test('GPU and software render the same nuclear stages without exceeding their fixed effect pools',()=>{
  const web=Object.create(FlightRenderer.prototype);Object.assign(web,{settings:{quality:'low'},mission,camera:new THREE.PerspectiveCamera(),effectsRoot:new THREE.Group(),time:0});web._buildPools();
  const software=new SoftwareFlightRenderer(canvas(),{quality:'low'});software.loadMission(mission,'b2');software.camera.position.set(0,1500,0);software.camera.lookAt(0,1100,-4000);software._view();
  for(const age of [.1,2,7,18]){
    const sim={effects:[burst('tsar',age)],projectiles:[],time:age};web._updatePools(sim);software._queue.length=0;software._effects(sim);
    assert.ok(web._explosions.count>0&&web._explosions.count<=288);assert.ok(web._shockwaves.count<=EFFECT_BUDGET.layers);
    assert.ok(software._queue.some(p=>p.type==='effect'));assert.ok(software._queue.every(p=>Number.isFinite(p.depth)));
    if(age===2){assert.ok(web._explosions.geometry.attributes.effectShade.array.some(v=>v===1));assert.ok(software._queue.some(p=>p.type==='line'),'horizontal wave is projected in world space');}
  }
  assert.equal(web._blastLights.length,2);assert.ok(web._blastLights.every(l=>l.intensity===0));software._paint();software.dispose();
});

test('nuclear flash arrives first, then one boom and concussion at the moving wavefront',()=>{
  const effect=burst('atomic',.05),sim=flight(effect),feedback=new CombatFeedback();
  const first=feedback.update(sim,.016);assert.ok(first.blast>.1);assert.equal(first.cues.length,0);assert.ok(zeroKick(first.kick));
  effect.age=1.9;sim.time=1.9;assert.equal(feedback.update(sim,.05).cues.length,0);
  effect.age=2.01;sim.time=2.01;const arrived=feedback.update(sim,.05);assert.equal(arrived.cues.length,1);assert.equal(arrived.cues[0].kind,'nuclear');assert.ok(!zeroKick(arrived.kick));
  effect.age=2.03;sim.time=2.03;assert.equal(feedback.update(sim,.02).cues.length,0,'same effect is never replayed');
  const late=flight(burst('atomic',10));assert.equal(new CombatFeedback().update(late,.02).cues.length,0,'joining a lingering cloud does not replay the boom');
  const reduced=flight(burst('atomic',2.01));const quietMotion=new CombatFeedback().update(reduced,.02,{reducedMotion:true});assert.ok(zeroKick(quietMotion.kick));assert.equal(quietMotion.cues[0].kind,'nuclear','reduced motion retains audio');
  const paused=flight(burst('atomic',2.01)),pausedFeedback=new CombatFeedback();assert.equal(pausedFeedback.update(paused,.02,{suspended:true}).cues.length,0);assert.equal(pausedFeedback.update(paused,.02).cues.length,0);
});

test('nuclear audio has a longer finite pressure roll and per-tier playback scaling within the existing bus',()=>{
  const rate=12000,pcm=synthesizeCombatSound('nuclear',rate),ordinary=synthesizeCombatSound('explosion',rate);
  assert.ok(pcm.length>ordinary.length*2.5);assert.ok(pcm.every(v=>Number.isFinite(v)&&Math.abs(v)<=.941));
  const rms=(a,b)=>Math.sqrt(pcm.slice(a*rate,b*rate).reduce((sum,x)=>sum+x*x,0)/((b-a)*rate));assert.ok(rms(2,4)>.015,'audible long rolling tail');
  const profiles=['atomic','hydrogen','tsar'].map(payload=>combatCueProfile('nuclear',{payload,intensity:.8,distance:2500}));
  assert.ok(profiles[0].playbackRate>profiles[1].playbackRate&&profiles[1].playbackRate>profiles[2].playbackRate);assert.ok(profiles.every(p=>p.gain<1&&p.duck<.85&&p.sound==='nuclear'));
});
