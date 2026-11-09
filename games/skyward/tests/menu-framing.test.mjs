import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {AIRCRAFT} from '../public/campaign.mjs';
import {makeAircraft,setAircraftPose} from '../public/models.mjs';
import {frameMenuAircraft} from '../public/menu-framing.mjs';

test('every hangar airframe fits its stage on desktop, phone and landscape layouts',()=>{
  const layouts=[
    {width:1363,height:936,frame:{x:590,y:180,width:700,height:520}},
    {width:390,height:844,frame:{x:20,y:130,width:350,height:245}},
    {width:320,height:568,frame:{x:16,y:96,width:288,height:180}},
    {width:844,height:390,frame:{x:355,y:75,width:460,height:220}},
    {width:2560,height:1440,frame:{x:1100,y:150,width:1350,height:1000}},
  ];
  for(const aircraft of Object.values(AIRCRAFT)){
    const model=makeAircraft(aircraft),bounds=new THREE.Box3().setFromObject(model);
    for(const layout of layouts)for(const time of [0,9,24]){
      const {width,height,frame}=layout,fov=width<height?53:46;
      const pose={x:70*Math.sin(time*.012),y:440+Math.sin(time*.31)*1.5,z:Math.sin(time*.008)*1600,
        heading:-.32,pitch:.025+Math.sin(time*.22)*.01,roll:.04+Math.sin(time*.27)*.025};
      const fit=frameMenuAircraft({...layout,aircraft,pose,fov});
      assert.ok(fit,aircraft.id+' valid framing');
      const camera=new THREE.PerspectiveCamera(fov,width/height,.35,95000);
      camera.position.set(...fit.position);camera.lookAt(...fit.target);camera.updateMatrixWorld(true);
      setAircraftPose(model,pose);model.updateMatrixWorld(true);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
        const p=new THREE.Vector3(x,y,z).applyMatrix4(model.matrixWorld).project(camera);
        const px=(p.x*.5+.5)*width,py=(-p.y*.5+.5)*height;
        assert.ok(px>frame.x&&px<frame.x+frame.width,`${aircraft.id}: horizontal ${px} in ${JSON.stringify(layout)}`);
        assert.ok(py>frame.y&&py<frame.y+frame.height,`${aircraft.id}: vertical ${py} in ${JSON.stringify(layout)}`);
        assert.ok(p.z>-1&&p.z<1,aircraft.id+' in camera depth');
      }
      assert.equal(camera.view,null,'framing never leaves a projection offset for the flight camera');
    }
  }
});

test('unavailable or offscreen stages use the existing menu composition',()=>{
  const base={width:1280,height:800,fov:46,aircraft:AIRCRAFT.avro504,pose:{}};
  for(const frame of [undefined,null,{x:0,y:0,width:0,height:100},{x:NaN,y:0,width:200,height:200},
    {x:1300,y:0,width:200,height:200},{x:0,y:900,width:200,height:200}]){
    assert.equal(frameMenuAircraft({...base,frame}),null);
  }
});
