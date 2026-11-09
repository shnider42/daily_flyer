import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {FlightRenderer} from '../public/renderer.mjs';
import {setAircraftPose} from '../public/models.mjs';
import {orientationFromEuler,basis,integrateBodyRotation} from '../public/orientation.mjs';

// Exercise renderer scene/camera code with the exact bundled Three objects.
// These tests do not create a GL context or claim to validate GPU compilation.
function rendererFixture(){
  const r=Object.create(FlightRenderer.prototype);
  Object.assign(r,{
    settings:{},time:0,width:800,height:600,pixelRatio:1,stats:{fps:60},
    camera:new THREE.PerspectiveCamera(62,1,.35,95000),scene:new THREE.Scene(),
    sky:new THREE.Object3D(),_world:new THREE.Group(),effectsRoot:new THREE.Group(),
    _plane:new THREE.Group(),_cockpit:new THREE.Group(),_needles:[new THREE.Group(),new THREE.Group(),new THREE.Group()],
    _cameraInitialized:false,_visualGearOffset:0,mission:{},_sceneryAnimations:[],
    _fogNear:1300,_fogFar:19000,_cloudBase:1000,_cloudTop:1400,
    palette:{water:'#477f8c'},worldCenter:{x:0,z:0},worldSize:52000,
  });
  r.scene.fog=new THREE.Fog('#c8d2c5',1300,19000);r._plane.userData.length=8;
  return r;
}
const point=p=>new THREE.Vector3(p.x,p.y,p.z);
const closeVector=(actual,expected,message)=>assert.ok(actual.distanceTo(expected)<1e-8,`${message}: ${actual.toArray()} vs ${expected.toArray()}`);
const pose={x:0,y:500,z:0,heading:0,pitch:0,roll:0,speed:80,fuel:70};

test('cockpit rebuilds select the aircraft family and release the previous camera-attached model',()=>{
  const r=rendererFixture();r._buildCockpit({id:'avro504'});const original=r._cockpit;
  const geometry=original.children.find(o=>o.isMesh).geometry;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
  assert.equal(original.userData.layout.family,'open');original.visible=true;
  r._buildCockpit({id:'f22'});assert.equal(r._cockpit.userData.layout.family,'glass');assert.equal(r._cockpit.visible,true);
  assert.equal(original.parent,null);assert.equal(disposed,1);assert.equal(r.camera.children.filter(o=>o.name.startsWith('cockpit-')).length,1);
});

test('the WebGL player and cockpit use the active airframe ground offset',()=>{
  const r=rendererFixture(),p={...pose,onGround:true,y:103};r._plane.userData.groundOffset=.6;r._visualGearOffset=.6;
  r._updateEntities=()=>{};r._updatePools=()=>{};r._updateWeather=()=>{};r._rings=[];r.renderer={render(){},info:{render:{calls:0,triangles:0}}};
  r.render({player:p},1/60,{camera:'cockpit'});
  assert.ok(Math.abs(r._plane.position.y-102.4)<1e-8);assert.ok(Math.abs(r.camera.position.y-103.25)<1e-8);
});

test('chase camera follows aircraft translation without adding another world-position lag',()=>{
  const r=rendererFixture();r._updateCamera(pose,1/60,{camera:'chase'});
  const offset=r.camera.position.clone().sub(point(pose)),direction=r.camera.getWorldDirection(new THREE.Vector3());
  const moved={...pose,x:350,z:1000};r._updateCamera(moved,1/60,{camera:'chase'});
  closeVector(r.camera.position.clone().sub(point(moved)),offset,'steady-flight camera offset');
  closeVector(r.camera.getWorldDirection(new THREE.Vector3()),direction,'steady-flight view direction');
});

test('cockpit position and look direction both follow the current interpolated pose',()=>{
  const r=rendererFixture();r._updateCamera(pose,1/60,{camera:'cockpit'});
  const p={...pose,x:45,y:620,z:280,heading:.9,pitch:.2,roll:.4};
  const options={camera:'cockpit',lookX:.2,lookY:-.1};r._updateCamera(p,1/60,options);
  const body=new THREE.Quaternion().setFromEuler(new THREE.Euler(-p.pitch,p.heading,-p.roll,'YXZ'));
  const look=body.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-options.lookY,-options.lookX,0,'YXZ')));
  const direction=new THREE.Vector3(0,0,1).applyQuaternion(look);
  closeVector(r.camera.up,new THREE.Vector3(0,1,0).applyQuaternion(look),'head look stays in aircraft axes');
  closeVector(r.camera.position,new THREE.Vector3(0,.85,2).applyQuaternion(body).add(point(p)),'eye offset follows the airframe');
  closeVector(r.camera.getWorldDirection(new THREE.Vector3()),direction,'cockpit view must not aim at a stale world target');
  assert.equal(r._plane.visible,false);assert.equal(r._cockpit.visible,true);
});

test('changing camera mode resets the orbit instead of carrying over the previous camera lag',()=>{
  const changed=rendererFixture(),fresh=rendererFixture();
  changed._updateCamera(pose,1/60,{camera:'chase'});
  const p={...pose,heading:.7,pitch:.15};
  changed._updateCamera(p,1/60,{camera:'cinematic'});fresh._updateCamera(p,1/60,{camera:'cinematic'});
  closeVector(changed.camera.position,fresh.camera.position,'camera-mode transition');
  closeVector(changed._cameraTarget,fresh._cameraTarget,'camera-mode target');
});

test('orbit damping is consistent across 30 Hz and 120 Hz render rates',()=>{
  const slow=rendererFixture(),fast=rendererFixture(),turned={...pose,heading:.8,pitch:.12};
  for(const r of [slow,fast])r._updateCamera(pose,1/60,{camera:'chase'});
  for(let i=0;i<30;i++)slow._updateCamera(turned,1/30,{camera:'chase'});
  for(let i=0;i<120;i++)fast._updateCamera(turned,1/120,{camera:'chase'});
  closeVector(slow.camera.position,fast.camera.position,'orbit damping');
  closeVector(slow._cameraTarget,fast._cameraTarget,'target damping');
});

test('unchanged settings and size do not reset the drawing buffer or projection',()=>{
  const r=rendererFixture(),size={width:800,height:600};let bufferChanges=0,projectionChanges=0;
  r.canvas={getBoundingClientRect:()=>size};
  r.renderer={setDrawingBufferSize(){bufferChanges++;}};
  const update=r.camera.updateProjectionMatrix.bind(r.camera);r.camera.updateProjectionMatrix=()=>{projectionChanges++;update();};
  r.setSettings({resolution:1.2,fov:64});
  assert.equal(bufferChanges,1);assert.equal(projectionChanges,1);
  r.setSettings({theme:'day',keyBindings:{pitchUp:'KeyI'}});r.resize();r.setSettings({sound:false});
  assert.equal(bufferChanges,1);assert.equal(projectionChanges,1);
  r.setSettings({fov:70});assert.equal(bufferChanges,1);assert.equal(projectionChanges,2);
  size.width=1000;r.resize();assert.equal(bufferChanges,2);assert.equal(projectionChanges,3);
  r.setSettings({resolution:1.5});assert.equal(bufferChanges,3);assert.equal(projectionChanges,3);
  r._mode='menu';r._setProjection(46);const before=projectionChanges;
  r.setSettings({theme:'night'});assert.equal(r.camera.fov,46);assert.equal(projectionChanges,before);
});

test('runway and apron meet without overlapping coplanar top surfaces',()=>{
  const r=rendererFixture();r._buildWindsock=()=>{};r._runwayNumber=()=>{};r._label=()=>new THREE.Object3D();
  const runway={x:0,y:12,z:0,heading:.5,length:1100,width:48};r._buildRunway(runway,{biome:'countryside'});
  const group=r._world.children[0];
  const surfaces=group.children.filter(o=>o.geometry?.type==='BoxGeometry'&&o.material.color.getHexString()==='626c65');
  assert.equal(surfaces.length,2);
  const strip=surfaces.find(o=>o.geometry.parameters.depth===runway.length),apron=surfaces.find(o=>o!==strip);
  const runwayEdge=strip.position.x+strip.geometry.parameters.width/2,apronEdge=apron.position.x-apron.geometry.parameters.width/2;
  assert.ok(Math.abs(apronEdge-runwayEdge)<1e-8,'apron must adjoin, not overlap, the runway');
  for(const mesh of surfaces)assert.equal(mesh.position.y+mesh.geometry.parameters.height/2,0);
});

test('custom ocean shader participates in the same logarithmic depth convention as terrain',()=>{
  const r=rendererFixture();r._buildWater();const material=r.waterMaterial;
  for(const name of ['common','logdepthbuf_pars_vertex','logdepthbuf_vertex']){
    assert.ok(THREE.ShaderChunk[name],`bundled Three must supply ${name}`);
    assert.ok(material.vertexShader.includes(`#include <${name}>`),`ocean vertex shader needs ${name}`);
  }
  for(const name of ['logdepthbuf_pars_fragment','logdepthbuf_fragment']){
    assert.ok(THREE.ShaderChunk[name]);assert.ok(material.fragmentShader.includes(`#include <${name}>`));
  }
  assert.equal(material.depthWrite,true);assert.equal(material.depthTest,true);
  assert.equal(material.extensions.derivatives,true,'screen-space water filtering needs derivatives on WebGL 1');
});

test('water and terrain receive cloud visibility changes in the same frame',()=>{
  const r=rendererFixture();r._buildWater();r._updateWeather({y:1200},1/60);
  assert.ok(r.scene.fog.far<r._fogFar,'test must enter reduced cloud visibility');
  assert.equal(r.waterMaterial.uniforms.fogNear.value,r.scene.fog.near);
  assert.equal(r.waterMaterial.uniforms.fogFar.value,r.scene.fog.far);
});

test('instanced cloud lobes use depth occlusion instead of an unsorted transparent batch',()=>{
  const r=rendererFixture();r.settings.quality='low';r._buildClouds({id:'cloud-test',weather:{}});
  assert.equal(r._clouds.material.transparent,false);assert.equal(r._clouds.material.depthWrite,true);
  assert.equal(r._clouds.renderOrder,0);assert.ok(r._clouds.boundingSphere.radius>0);
});

test('transparent effects sort back-to-front without changing simulation order',()=>{
  const r=rendererFixture();r._buildPools();
  const near={type:'smoke',x:0,y:0,z:-10,age:.2,life:2},far={type:'impact',x:0,y:0,z:-100,age:.2,life:2};
  const effects=[near,far];r._updatePools({effects});
  const matrix=new THREE.Matrix4(),depths=()=>Array.from({length:r._explosions.count},(_,i)=>{r._explosions.getMatrixAt(i,matrix);return matrix.elements[14];});
  const forward=depths();assert.ok(forward.length>2,'an impact contains its spark fragments');
  assert.ok(forward[0]<-90);assert.equal(forward.at(-1),-10);
  for(let i=1;i<forward.length;i++)assert.ok(forward[i]>=forward[i-1],'all transparent fragment depths are ordered');
  assert.deepEqual(effects,[near,far]);
  r.camera.rotation.y=Math.PI;r._updatePools({effects});
  const backward=depths();assert.equal(backward[0],-10,'ordering follows camera direction');
  for(let i=1;i<backward.length;i++)assert.ok(backward[i]<=backward[i-1]);
});

test('empty effect pools do not upload buffers; active tracers retain their positions',()=>{
  const r=rendererFixture();r._buildPools();r._updatePools({});
  for(const pool of [r._tips,r._explosions,r._canopies,r._troopers]){
    assert.equal(pool.instanceMatrix.version,0);assert.equal(pool.instanceMatrix.usage,THREE.DynamicDrawUsage);
  }
  assert.equal(r._tracers.geometry.attributes.position.version,0);
  r._updatePools({projectiles:[{x:1,y:2,z:3,vx:10,vy:20,vz:30,life:1,type:'bullet'}],paratroopers:[{x:10,y:20,z:30,life:1}]});
  assert.equal(r._tips.count,1);assert.equal(r._troopers.count,1);assert.equal(r._tracers.geometry.drawRange.count,6);
  const expected=[1,2,3,.65,1.3,1.95];
  for(let i=0;i<expected.length;i++)assert.ok(Math.abs(r._linePositions[i]-expected[i])<1e-6);
});


test('cockpit follows authoritative body attitude through vertical and inverted flight even with reduced motion',()=>{
  const r=rendererFixture();r.settings={reducedMotion:true,horizonLock:true};
  for(const [heading,pitch,roll] of [[.3,0,Math.PI],[.8,Math.PI/2,.7],[-.4,-Math.PI/2,1.1],[.2,Math.PI*.7,-.9]]){
    const orientation=orientationFromEuler(heading,pitch,roll),p={...pose,heading:0,pitch:0,roll:0,orientation};
    const axes=basis(orientation);r._updateCamera(p,1/60,{camera:'cockpit'});
    closeVector(r.camera.getWorldDirection(new THREE.Vector3()),point(axes.forward),'cockpit forward');
    closeVector(new THREE.Vector3(0,1,0).applyQuaternion(r.camera.quaternion),point(axes.up),'cockpit up');
    closeVector(new THREE.Vector3(1,0,0).applyQuaternion(r.camera.quaternion),point(axes.right),'pilot right');
    assert.ok(r.camera.quaternion.toArray().every(Number.isFinite));
  }
});

test('named pitch, yaw and roll inputs have pilot-relative screen directions at any bank',()=>{
  const origin=new THREE.Vector3(0,1000,0),r=rendererFixture();
  for(const orientation of [orientationFromEuler(0,0,0),orientationFromEuler(.5,.2,Math.PI/2),orientationFromEuler(-.7,0,Math.PI),orientationFromEuler(.3,Math.PI/2,.2)]){
    const p={...pose,x:origin.x,y:origin.y,z:origin.z,orientation};r._updateCamera(p,1/60,{camera:'cockpit'});r.camera.updateMatrixWorld(true);
    const before=basis(orientation),project=(v)=>point(v).multiplyScalar(100).add(origin).project(r.camera);
    const nose=project(before.forward),pitched=project(basis(integrateBodyRotation(orientation,{pitch:1},.1)).forward),yawed=project(basis(integrateBodyRotation(orientation,{yaw:1},.1)).forward);
    assert.ok(pitched.y>nose.y+.01,'pitch-up raises the nose in the pilot view');
    assert.ok(yawed.x>nose.x+.01,'right yaw moves the nose to screen right');
    const rightWing=(axes)=>point(axes.forward).multiplyScalar(100).addScaledVector(point(axes.right),20).add(origin).project(r.camera);
    assert.ok(rightWing(basis(integrateBodyRotation(orientation,{roll:1},.1))).y<rightWing(before).y-.01,'right roll lowers the pilot-right wing');
  }
});

test('aircraft meshes prefer quaternion attitude and retain the legacy Euler fallback',()=>{
  const plane=new THREE.Group(),q=orientationFromEuler(.4,Math.PI*.6,1.2);
  setAircraftPose(plane,{...pose,heading:0,pitch:0,roll:0,orientation:q});
  closeVector(new THREE.Vector3(0,0,1).applyQuaternion(plane.quaternion),point(basis(q).forward),'authoritative mesh nose');
  closeVector(new THREE.Vector3(0,1,0).applyQuaternion(plane.quaternion),point(basis(q).up),'authoritative mesh up');
  const legacy={...pose,heading:.7,pitch:.2,roll:-.3};setAircraftPose(plane,legacy);
  const expected=new THREE.Quaternion().setFromEuler(new THREE.Euler(-legacy.pitch,legacy.heading,-legacy.roll,'YXZ'));
  assert.ok(1-Math.abs(plane.quaternion.dot(expected))<1e-12);
  setAircraftPose(plane,{...legacy,orientation:{x:NaN,y:0,z:0,w:1}});assert.ok(1-Math.abs(plane.quaternion.dot(expected))<1e-12,'malformed attitude falls back safely');
});
