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
