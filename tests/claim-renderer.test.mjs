import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../daily_flyer/themes/claim_denied_assets/vendor/three.module.js';
import {HouseRenderer} from '../daily_flyer/themes/claim_denied_assets/renderer.mjs';

test('authored wall trim clears wall faces instead of sharing coplanar surfaces',()=>{
  // Build the actual scene without a GPU or canvas-texture labels.
  const renderer=Object.create(HouseRenderer.prototype);
  Object.assign(renderer,{scene:new T.Scene(),materials:new Map(),boards:new Map()});
  renderer.label=()=>new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial());
  renderer.buildWorld();
  const walls=[],trim=[];
  renderer.scene.traverse(o=>{if(o.userData.houseSurface==='wall')walls.push(o);if(o.userData.houseSurface==='trim')trim.push(o);});
  assert.equal(trim.length,8);assert.ok(walls.length>12);
  for(const strip of trim){
    const axis=Math.abs(strip.position.x)===9?'x':'z';
    const depth=axis==='x'?'width':'depth';
    for(const wall of walls.filter(w=>w.position[axis]===strip.position[axis])){
      assert.ok((strip.geometry.parameters[depth]-wall.geometry.parameters[depth])/2>=.049,'trim must stand proud on both wall faces');
    }
  }
});

import {batchStaticGeometry} from '../daily_flyer/themes/claim_denied_assets/static-geometry.mjs';
import {buildRetreat} from '../daily_flyer/themes/claim_denied_assets/retreat.mjs';
test('static batching preserves world geometry and leaves dynamic surfaces independent',()=>{
 const scene=new T.Scene(),mat=new T.MeshStandardMaterial(),excluded=new T.Mesh(new T.BoxGeometry(1,1,1),mat);scene.add(excluded);
 for(let i=0;i<20;i++){const mesh=new T.Mesh(new T.BoxGeometry(1,2,3),mat);mesh.position.set(i*2,1,0);scene.add(mesh);}
 const before=new T.Box3().setFromObject(scene);batchStaticGeometry(scene,new Set([excluded]));const after=new T.Box3().setFromObject(scene);
 assert.equal(scene.children.length,2);assert.ok(scene.children.includes(excluded));assert.ok(before.min.equals(after.min)&&before.max.equals(after.max));
});
test('retreat renderer builds eight barricades, raised deck and labeled upper supplies',()=>{
 const r=Object.create(HouseRenderer.prototype);Object.assign(r,{scene:new T.Scene(),materials:new Map(),boards:new Map()});const labels=[];
 r.label=text=>{labels.push(text);return new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial());};buildRetreat(r);
 assert.equal(r.boards.size,8);assert.ok(labels.some(t=>t.includes('GALLERY')));assert.ok(labels.some(t=>t.includes('Golden Parachute'.toUpperCase())));
 const count=r.scene.children.length;batchStaticGeometry(r.scene,new Set([r.ceiling]));assert.ok(r.scene.children.length<count/2);assert.ok(r.scene.children.includes(r.ceiling));
});
