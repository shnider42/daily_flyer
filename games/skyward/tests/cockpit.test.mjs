import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {cockpitFamily,cockpitLayout,cockpitTelemetry,makeCockpit,fitCockpit,updateCockpit,makeSoftwareCockpit,drawSoftwareCockpit} from '../public/cockpit-models.mjs';

function canvasFactory(){
  const canvases=[];
  class Canvas{
    constructor(width,height){this.width=width;this.height=height;this.calls={images:0,clears:0,text:[]};const calls=this.calls;this.ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),drawImage(){calls.images++;},clearRect(){calls.clears++;},fillText(text){calls.text.push(text);}},{get:(o,key)=>o[key]??(()=>{})});canvases.push(this);}
    getContext(){return this.ctx;}
  }
  return {Canvas,canvases};
}
function withCanvas(fn){const old=globalThis.OffscreenCanvas,{Canvas,canvases}=canvasFactory();globalThis.OffscreenCanvas=Canvas;try{fn(canvases);}finally{if(old===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=old;}}

test('aircraft select distinct period cockpit families',()=>{
  for(const [family,kinds]of Object.entries({open:['avro504','camel'],fighter:['spitfire','hellcat','bf109'],heavy:['b17','c47','he111'],jet:['f4','harrier','a10','mig21'],glass:['f15','f16','f22','b2']}))for(const kind of kinds)assert.equal(cockpitFamily({model:kind}),family);
  assert.equal(cockpitLayout('avro504').screens.length,0);
  assert.ok(cockpitLayout('f22').screens.length>=2);
  assert.equal(cockpitLayout('c47').sight,null,'unarmed transport has no fighter gunsight');
});

test('cockpit panels preserve the forward view and instruments fit phone portrait and landscape',()=>{
  for(const [width,height]of [[320,568],[390,844],[844,390],[1280,720],[1920,1080]])for(const kind of ['avro504','spitfire','c47','f4','f22']){
    const l=cockpitLayout(kind,width,height);
    assert.ok(Math.min(...l.panel.map(p=>p[1]))>=height*.75,'opaque panel stays below the flight view');
    for(const g of l.gauges){assert.ok(g.x-g.r>=0&&g.x+g.r<=width);assert.ok(g.y-g.r>=height*.75&&g.y+g.r<=height);}
    for(const s of l.screens){assert.ok(s.x>=0&&s.x+s.w<=width);assert.ok(s.y>=height*.75&&s.y+s.h<=height);}
    if(l.sight)assert.equal(l.sight.y,height*.5,'reflector gunsight shares the real aiming centre');
    if(l.hud)assert.ok(l.hud.y-l.hud.h*.5<height*.5&&l.hud.y+l.hud.h*.5>height*.5,'combiner surrounds the existing reticle');
  }
});

test('instruments use finite real airspeed, altitude, fuel, throttle and climb values',()=>{
  const t=cockpitTelemetry({speed:100,y:1000,fuel:73,throttle:.72,verticalSpeed:-8,vy:999});
  assert.ok(Math.abs(t.speed-194.3844)<1e-6);assert.ok(Math.abs(t.altitude-3280.84)<1e-6);assert.equal(t.fuel,73);assert.equal(t.throttle,.72);assert.equal(t.climb,-8);
  for(const value of Object.values(cockpitTelemetry({speed:NaN,y:Infinity,fuel:NaN,throttle:Infinity})))assert.ok(Number.isFinite(value));
  assert.equal(cockpitTelemetry({fuel:-5,throttle:4}).fuel,0);assert.equal(cockpitTelemetry({fuel:400,throttle:4}).throttle,1);
});

test('3D cockpit fits the actual projection and gauge hands animate without replacing geometry',()=>{
  for(const [width,height]of [[390,844],[844,390],[1280,720]]){
    const model=makeCockpit('spitfire',width,height),camera=new THREE.PerspectiveCamera(67,width/height,.35,95000);fitCockpit(model,camera);
    assert.ok(model.scale.x>0);assert.equal(model.scale.x,model.scale.y);assert.equal(model.position.z,-1.15);
    const topLeft=new THREE.Vector3();
    model.updateMatrix();topLeft.set(-width*.5,height*.5,0).applyMatrix4(model.matrix).project(camera);
    assert.ok(Math.abs(topLeft.x+1)<1e-6&&Math.abs(topLeft.y-1)<1e-6,'pixel layout spans the same projected viewport');
    const hand=model.userData.needles.find(n=>n.gauge.id==='speed').object,geometry=hand.children[0].geometry;
    updateCockpit(model,{speed:10,y:0,fuel:10});const before=hand.rotation.z;updateCockpit(model,{speed:100,y:2000,fuel:80});
    assert.notEqual(hand.rotation.z,before);assert.equal(hand.children[0].geometry,geometry);
    model.traverse(o=>{if(o.geometry)for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));});
  }
});

test('small jet displays refresh at most ten times per second while needles remain responsive',()=>withCanvas(()=>{
  const model=makeCockpit('f22',1280,720),pose={speed:100,y:1000,fuel:70,throttle:.6};
  updateCockpit(model,pose,1);const versions=model.userData.displays.map(d=>d.texture.version);
  updateCockpit(model,{...pose,speed:150},1.05);assert.deepEqual(model.userData.displays.map(d=>d.texture.version),versions);
  updateCockpit(model,{...pose,speed:150},1.11);assert.ok(model.userData.displays.every((d,i)=>d.texture.version===versions[i]+1));
  const stable=model.userData.displays.map(d=>d.texture.version);updateCockpit(model,{...pose,speed:150},1.25);assert.deepEqual(model.userData.displays.map(d=>d.texture.version),stable,'unchanged values do not upload a texture');
}));

test('software cockpit caches static detail while readings update from the current pose',()=>withCanvas(canvases=>{
  const cockpit=makeSoftwareCockpit('f22',390,844),destination=new globalThis.OffscreenCanvas(390,844),cached=cockpit.canvas;
  drawSoftwareCockpit(destination.ctx,cockpit,{speed:100,y:1000,fuel:70,throttle:.5});drawSoftwareCockpit(destination.ctx,cockpit,{speed:200,y:2000,fuel:30,throttle:.8});
  assert.equal(cockpit.canvas,cached);assert.equal(destination.calls.images,2);assert.equal(destination.calls.clears,0,'HUD readings must not erase the flight scene underneath');assert.ok(destination.calls.text.includes('194 KT'));assert.ok(destination.calls.text.includes('389 KT'));assert.ok(destination.calls.text.includes('30%'));assert.equal(canvases.length,2,'no canvas allocation per rendered frame');
}));
