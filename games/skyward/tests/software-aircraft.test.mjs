import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {SoftwareAircraftRasterizer} from '../public/software-aircraft.mjs';

class PixelCanvas{
  constructor(width,height){this.width=width;this.height=height;this.ctx={createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};}
  getContext(){return this.ctx;}
}
function raster(fn){const old=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=PixelCanvas;try{fn(new SoftwareAircraftRasterizer());}finally{if(old===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=old;}}
const options={viewMatrix:new THREE.Matrix4(),width:128,height:128,focal:64,pixelRatio:1,sun:{x:0,y:1,z:0},up:{x:0,y:1,z:0},fogColor:[100,120,130],fogFar:10000};
function triangle(color,depths,opacity=1){
  const xy=[[20,20],[108,20],[64,108]],positions=xy.flatMap(([x,y],i)=>[(x-64)*depths[i]/64,(64-y)*depths[i]/64,-depths[i]]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex([0,2,1]);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide}));
}
function render(r,model,settings=options){model.updateMatrixWorld(true);return r.render(model,settings);}
function pixel(r,result,x,y){const px=Math.floor((x-result.x)*result.sourceWidth/result.width),py=Math.floor((y-result.y)*result.sourceHeight/result.height),offset=(py*r.bufferWidth+px)*4;return [...r.pixels.slice(offset,offset+4)];}

test('aircraft depth resolves intersecting surfaces independently of mesh submission order',()=>raster(r=>{
  const group=new THREE.Group(),sloped=triangle('#ff0000',[2,8,5]),flat=triangle('#0000ff',[5,5,5]);group.add(sloped,flat);
  let result=render(r,group);assert.deepEqual(pixel(r,result,40,40),[255,0,0,255]);assert.deepEqual(pixel(r,result,90,40),[0,0,255,255]);
  group.remove(sloped);group.add(sloped);result=render(r,group);assert.deepEqual(pixel(r,result,40,40),[255,0,0,255]);assert.deepEqual(pixel(r,result,90,40),[0,0,255,255]);
}));

test('glass blends only where it is in front of opaque aircraft surfaces',()=>raster(r=>{
  const group=new THREE.Group();group.add(triangle('#ff0000',[2,8,5]),triangle('#0000ff',[5,5,5]),triangle('#00ff00',[3,3,3],.5));
  const result=render(r,group);assert.deepEqual(pixel(r,result,40,40),[255,0,0,255],'near opaque skin occludes the glass');
  const p=pixel(r,result,90,40);assert.equal(p[0],0);assert.ok(p[1]>=127&&p[1]<=128);assert.ok(p[2]>=127&&p[2]<=128);assert.equal(p[3],255);
}));

test('adjacent transparent triangles share coverage without a darker diagonal seam',()=>raster(r=>{
  const group=new THREE.Group(),glass=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:'#00ff00',transparent:true,opacity:.5}));glass.position.z=-2;group.add(glass);
  const result=render(r,group),center=pixel(r,result,64,64),offDiagonal=pixel(r,result,60,65);
  assert.ok(center[3]>=127&&center[3]<=128);assert.deepEqual(center,offDiagonal);
}));

test('explicitly faceted materials keep face lighting while ordinary skins interpolate normals',()=>raster(r=>{
  const group=new THREE.Group(),surface=triangle('#808080',[5,5,5]);surface.material=new THREE.MeshStandardMaterial({color:'#808080',side:THREE.DoubleSide});
  surface.geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,1,0,0,1,0],3));group.add(surface);
  const lighting={...options,sun:{x:0,y:0,z:1},up:{x:0,y:0,z:1}};
  let result=render(r,group,lighting);assert.ok(Math.abs(pixel(r,result,40,40)[0]-pixel(r,result,90,40)[0])>15);
  surface.material.flatShading=true;result=render(r,group,lighting);assert.ok(Math.abs(pixel(r,result,40,40)[0]-pixel(r,result,90,40)[0])<=1);
}));

test('near-plane clipping remains finite and hidden animated assemblies are omitted',()=>raster(r=>{
  const group=new THREE.Group(),gear=new THREE.Group();gear.add(triangle('#ff0000',[2,2,2]));gear.visible=false;group.add(gear,triangle('#0000ff',[.2,3,3]));
  const result=render(r,group);assert.ok(result&&result.triangles>0);assert.ok(result.x>=0&&result.y>=0&&result.x+result.width<=128&&result.y+result.height<=128);
  for(let i=0;i<r.pixels.length;i+=4)if(r.pixels[i+3])assert.equal(r.pixels[i],0,'hidden gear never contributes red');
  group.visible=false;assert.equal(render(r,group),null);
}));

test('aircraft image and depth storage stay bounded and are reused across frames',()=>raster(r=>{
  const group=new THREE.Group(),plane=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshBasicMaterial({color:'#fff'}));plane.position.z=-2;group.add(plane);
  const result=render(r,group,{...options,width:3840,height:2160,focal:1000});
  assert.ok(result.sourceWidth*result.sourceHeight<605000);assert.ok(r.depth.length<=600000*1.15);assert.ok(r.pixels.length<=600000*1.15*4);
  const depth=r.depth,pixels=r.pixels;render(r,group,{...options,width:3840,height:2160,focal:1000});assert.equal(r.depth,depth);assert.equal(r.pixels,pixels);
  r.dispose();assert.equal(r.depth,null);assert.equal(r.surface,null);
}));
