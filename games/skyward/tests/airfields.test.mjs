import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {AIRCRAFT,MISSIONS} from '../public/campaign.mjs';
import {describeAirfield,airfieldPoint,windsockSegments,landingApproach,roofTriangles,airfieldSurfaceColor,AIRFIELD_BUDGET,AIRPORT_BUDGET} from '../public/airfield-scenery.mjs';
import {airportGroundBounds} from '../public/airfield-layout.mjs';
import {runwayCoordinates,terrainHeight} from '../public/terrain.mjs';
import {sceneryClearance,terrainColor} from '../public/terrain-visuals.mjs';
import {orientationFromEuler} from '../public/orientation.mjs';
import {FlightRenderer} from '../public/renderer.mjs';
import {SoftwareFlightRenderer} from '../public/software.mjs';

const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} versus ${b}`);
const runway={x:1300,y:45,z:-700,heading:.72,length:1900,width:105};
const mission={id:'airfield-test',aircraft:'f16',biome:'countryside',weather:{wind:{x:7,z:-3},timeOfDay:'night'},runways:[runway],start:{x:0,y:600,z:0,airborne:true}};

test('airfield profiles vary with the era and keep every tall fitting clear of the runway',()=>{
  const profiles=new Set();
  for(const aircraft of ['avro504','c47','f16']){
    const m={...mission,aircraft},scene=describeAirfield(runway,m);profiles.add(scene.profile);
    assert.ok(scene.parts.length<=AIRFIELD_BUDGET.parts);assert.ok(scene.lights.length<=AIRFIELD_BUDGET.lights);
    for(const part of scene.parts){
      assert.ok([...part.position,...part.size].every(Number.isFinite));
      if(part.size[1]>1)assert.ok(Math.abs(part.position[0])-part.size[0]/2>runway.width/2+10,`${part.id} leaves the landing surface clear`);
    }
  }
  assert.equal(profiles.size,3);
  const roof=describeAirfield(runway,mission).parts.find(part=>part.kind==='roof');
  for(const [a,b,c] of roofTriangles(roof).slice(2)){const ab=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),ac=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));assert.ok(ab.cross(ac).y>0,'roof winding remains visible from above with normal GPU culling');}
  const carrier=describeAirfield({...runway,carrier:true,width:40,length:310},mission);
  assert.equal(carrier.profile,'carrier');assert.equal(carrier.windsock,null);
  assert.ok(carrier.parts.every(part=>part.size[1]<.2),'new deck fittings are paint, not unmodeled obstacles');
});

test('campaign airfield generation remains finite and bounded across authored terrain',()=>{
  for(const m of MISSIONS)for(const r of m.runways||[]){
    const scene=describeAirfield(r,m);assert.ok(scene.parts.length<=AIRFIELD_BUDGET.parts);assert.ok(scene.lights.length<=AIRFIELD_BUDGET.lights);
    for(const part of scene.parts)assert.ok([...part.position,...part.size].every(Number.isFinite),m.id);
    for(const lamp of scene.lights)assert.ok([...lamp.position,lamp.radius].every(Number.isFinite),m.id);
    assert.deepEqual(scene,describeAirfield(r,m),'geometry does not change between clients');
  }
});

test('windsocks follow the actual world wind on rotated strips and hang in calm weather',()=>{
  const scene=describeAirfield(runway,mission),sock=scene.windsock;
  for(const heading of [0,.72,Math.PI,-Math.PI/2]){
    const r={...runway,heading},segments=windsockSegments(r,sock,mission.weather,0,true),origin=airfieldPoint(r,...segments[0].from),tip=airfieldPoint(r,...segments.at(-1).to);
    const dx=tip.x-origin.x,dz=tip.z-origin.z;near(dx/dz,7/-3);assert.ok(dx>0&&dz<0);
    assert.deepEqual(segments,windsockSegments(r,sock,mission.weather,20,true),'reduced motion removes cloth flutter');
  }
  const calm=windsockSegments(runway,sock,{wind:{x:0,z:0}},4),tip=calm.at(-1).to;
  near(tip[0],sock.x);near(tip[2],sock.z);assert.ok(tip[1]<sock.y-3);
});

test('landing guidance follows the selected strip and stays on terrain or the real carrier deck',()=>{
  const m={...mission,runways:[runway,{...runway,x:5000,carrier:true,width:40,length:310,y:28}]};
  const player={...airfieldPoint(runway,0,150,-1600),onGround:false};
  const sim={mission:m,player,status:'flying',phase:'landing',navigationTarget:{runwayIndex:0}};
  const cue=landingApproach(sim,m,{});assert.equal(cue.index,0);assert.equal(cue.bars.length,AIRFIELD_BUDGET.approachBars);
  for(const bar of cue.bars){const q=runwayCoordinates(bar.x,bar.z,runway);near(q.across,0);assert.ok(q.along<-runway.length/2);near(bar.y,Math.max(0,terrainHeight(bar.x,bar.z,m))+.45);}
  assert.equal(landingApproach({...sim,phase:'combat'},m,{}),null);
  assert.equal(landingApproach(sim,m,{guidance:'minimal'}),null);
  assert.equal(landingApproach({...sim,player:{...player,onGround:true}},m,{}),null);
  const carrier=m.runways[1],deck=landingApproach({...sim,player:airfieldPoint(carrier,0,80,-500),navigationTarget:{runwayIndex:1}},m,{});
  for(const bar of deck.bars){const q=runwayCoordinates(bar.x,bar.z,carrier);assert.ok(Math.abs(q.along)<carrier.length/2);assert.ok(Math.abs(q.across)+bar.width/2<carrier.width/2);near(bar.y,carrier.y+.4);}
});

test('WebGL fittings batch by material while light instances retain shared local coordinates',()=>{
  const r=Object.create(FlightRenderer.prototype),parent=new THREE.Group();
  Object.assign(r,{mission,settings:{reducedMotion:true},time:0,_sceneryAnimations:[]});r._buildAirfieldScenery(parent,runway,mission);
  const scene=describeAirfield(runway,mission),lights=parent.getObjectByName('airfield-lights'),staticRoot=parent.getObjectByName('airfield-airbase');
  assert.ok(staticRoot.children.filter(node=>node.isMesh).length<=14,'many buildings use a fixed small material batch');
  assert.equal(lights.count,scene.lights.length);
  const matrix=new THREE.Matrix4();scene.lights.forEach((lamp,i)=>{lights.getMatrixAt(i,matrix);near(matrix.elements[12],lamp.position[0],1e-4);near(matrix.elements[13],lamp.position[1],1e-4);near(matrix.elements[14],lamp.position[2],1e-4);});
  assert.equal(r._sceneryAnimations.length,1);assert.equal(r._sceneryAnimations[0].meshes.length,5);
});

test('free-flight arrival cues appear only for a low aligned approach to the selected field',()=>{
  const m={...mission,kind:'free'},player={...airfieldPoint(runway,20,180,-runway.length/2-900),onGround:false,orientation:orientationFromEuler(runway.heading,0,0)};
  const sim={mission:m,player,status:'flying',phase:'flight',navigationTarget:{x:runway.x,y:runway.y+35,z:runway.z,runwayIndex:0}};
  assert.ok(landingApproach(sim,m,{}),'an aligned inbound pilot gets the existing ground cue');
  const replace=changes=>({...sim,player:{...player,...changes}});
  assert.equal(landingApproach(replace({y:runway.y+6500}),m,{}),null,'high B-2 cruising does not show landing bars');
  assert.equal(landingApproach(replace({orientation:orientationFromEuler(runway.heading+Math.PI,0,0)}),m,{}),null,'outbound aircraft does not get arrival cues');
  assert.equal(landingApproach(replace({orientation:orientationFromEuler(runway.heading+Math.PI/2,0,0)}),m,{}),null,'flying across the field does not count as an approach');
  assert.equal(landingApproach(replace(airfieldPoint(runway,900,150,-runway.length/2-900)),m,{}),null,'large cross-track offset keeps the scene clear');
  assert.equal(landingApproach(replace(airfieldPoint(runway,0,150,0)),m,{}),null,'overflying the runway does not count as an approach');
  assert.equal(landingApproach(replace(airfieldPoint(runway,0,150,-runway.length/2-3100)),m,{}),null,'free-flight cues have a short approach range');
  assert.equal(landingApproach(sim,m,{guidance:'minimal'}),null);
  const reverse={...sim,player:{...airfieldPoint(runway,0,150,runway.length/2+900),orientation:orientationFromEuler(runway.heading+Math.PI,0,0)}};
  assert.equal(landingApproach(reverse,m,{}).end,1,'either runway end can be approached');
});

test('software airfield lamps render above runway paint and scenery uses the same rotated positions',()=>{
  const noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(o,key)=>o[key]??noop});
  const canvas={width:800,height:600,getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600})};
  const r=new SoftwareFlightRenderer(canvas,{quality:'low'});r.loadMission(mission,AIRCRAFT.f16);
  const eye=airfieldPoint(runway,-100,100,-1300);r.camera.position.set(eye.x,eye.y,eye.z);r.camera.lookAt(runway.x,runway.y,runway.z);r._view();
  const boxes=[],original=r._box;r._box=(...args)=>boxes.push(args);r._drawAirfield(runway,1200);r._box=original;
  const scene=describeAirfield(runway,mission);for(const part of scene.parts.filter(part=>part.kind==='box')){
    const p=airfieldPoint(runway,...part.position);assert.ok(boxes.some(box=>Math.abs(box[0]-p.x)<1e-7&&Math.abs(box[1]-p.y)<1e-7&&Math.abs(box[2]-p.z)<1e-7&&box[3]===part.size[0]),part.id);
  }
  const lamps=r._queue.filter(item=>item.type==='disc');assert.ok(lamps.length>10);assert.ok(lamps.every(item=>item.layer===4),'lamps cannot be overpainted by the runway surface');r.dispose();
});

test('passenger airports have a connected terminal layout and bounded scenery clear of the strip',()=>{
  const r={...runway,width:150,length:3200,airport:true},m={...mission,aircraft:'b767',runways:[r]},scene=describeAirfield(r,m);
  assert.equal(scene.profile,'airport');assert.ok(scene.parts.length<AIRPORT_BUDGET.parts);assert.ok(scene.lights.length<AIRPORT_BUDGET.lights);
  for(const id of ['parallel-taxiway','passenger-apron','terminal-main','concourse','terminal-connector','terminal-road','carpark','town-spine','maintenance-hangar'])assert.ok(scene.parts.some(part=>part.id===id),id);
  assert.equal(new Set(scene.parts.filter(part=>part.kind==='airliner').map(part=>part.id.match(/airliner-(\d)/)[1])).size,AIRPORT_BUDGET.parkedAircraft);
  for(const part of scene.parts){
    assert.ok([...part.position,...part.size].every(Number.isFinite));
    assert.ok((part.triangles||[]).flat(2).every(Number.isFinite));
    if(part.size[1]>1)assert.ok(Math.abs(part.position[0])-part.size[0]/2>r.width/2+10,`${part.id} stays outside the flight corridor`);
  }
  const total=scene.parts.reduce((count,part)=>count+(part.triangles?.length||(part.kind==='roof'?6:12)),0);assert.ok(total<5000,'airport buildings, grounds and parked jets stay within the shared geometry budget');
  assert.notEqual(describeAirfield({...r,airport:false},m).profile,'airport','a large aircraft alone does not turn a small field into a passenger terminal');
  assert.deepEqual(scene,describeAirfield({...r,airport:false,airfieldType:'airport'},m));
});

test('the airport platform is shared with terrain physics and has a bounded smooth shoulder',()=>{
  const r={...runway,width:150,length:3200,airport:true,y:55},m={...mission,runways:[r]},bounds=airportGroundBounds(r);
  for(const across of[0,200,600,1000])for(const along of[-600,0,600]){
    const p=airfieldPoint(r,across,0,along);near(terrainHeight(p.x,p.z,m),r.y);
    assert.equal(sceneryClearance(p.x,p.z,m),false,'procedural trees do not grow through aprons and terminal lots');
  }
  const unmodified={...m,runways:[{...r,airport:false}]},far=airfieldPoint(r,bounds.acrossMax+bounds.maxBlend+20,0,0);
  near(terrainHeight(far.x,far.z,m),terrainHeight(far.x,far.z,unmodified));
  for(const biome of['countryside','mountains']){
    const site={...m,biome};let previous=null;
    for(let x=bounds.acrossMax-2;x<bounds.acrossMax+bounds.maxBlend+2;x+=2){const p=airfieldPoint(r,x,0,0),height=terrainHeight(p.x,p.z,site);if(previous!==null)assert.ok(Math.abs(height-previous)<8,'airport shoulder has no abrupt cliff step');previous=height;}
  }
  const ordinary={...mission,runways:[{...r,airport:false}]},point=airfieldPoint(r,600,0,0);assert.equal(sceneryClearance(point.x,point.z,ordinary),true,'ordinary fields retain their smaller clearing');
});

test('airport WebGL scenery batches and software caches shared ground meshes',()=>{
  const strip={...runway,width:150,length:3200,airport:true},m={...mission,aircraft:'b767',runways:[strip]};
  const web=Object.create(FlightRenderer.prototype);Object.assign(web,{mission:m,_world:new THREE.Group(),settings:{},_sceneryAnimations:[],_label:()=>new THREE.Object3D(),_runwayNumber(){},time:0});web._buildRunway(strip,m);
  let calls=0,triangles=0;web._world.traverse(node=>{if(node.isMesh){calls++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);}});
  assert.ok(calls<=36,`airport uses ${calls} geometry batches`);assert.ok(triangles<7500,`airport uses ${triangles} triangles including runway and lamps`);
  const noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(o,key)=>o[key]??noop});
  const canvas={width:800,height:600,getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600})};
  const software=new SoftwareFlightRenderer(canvas,{quality:'low'});software.loadMission(m,AIRCRAFT.b767||AIRCRAFT.f16);
  const eye=airfieldPoint(strip,-300,300,-1400);software.camera.position.set(eye.x,eye.y,eye.z);software.camera.lookAt(strip.x,strip.y,strip.z);software._view();software._drawAirfield(strip,1400);
  const first=software._airfields.get(strip).drawParts;assert.ok(first.some(part=>part.kind==='ground'&&part.worldTriangles.length));software._queue.length=0;software._drawAirfield(strip,1400);assert.equal(software._airfields.get(strip).drawParts,first,'static airport triangles do not get rebuilt every frame');software.dispose();
});

test('surrounding land color is continuous across the former checkerboard boundaries and farmland darkens at night',()=>{
  const palette=['#71856b','#829476','#a1a784','#647e65'];
  for(const boundary of[-2560,-1280,0,1280,2560]){
    const a=terrainColor(boundary-.001,30,718,0,'countryside',palette),b=terrainColor(boundary+.001,30,718,0,'countryside',palette);
    assert.ok(a.every((value,i)=>Math.abs(value-b[i])<.01),'world tint stays continuous across a former tile edge');
  }
  const brightness=hex=>[1,3,5].reduce((sum,offset)=>sum+parseInt(hex.slice(offset,offset+2),16),0);
  assert.ok(brightness(airfieldSurfaceColor('stubble',true))<brightness(airfieldSurfaceColor('stubble'))*.4,'unlit fields cannot glow like concrete at night');
});
