import test from 'node:test';
import assert from 'node:assert/strict';
import { clipDepth } from '../dist/software3d.mjs';

test('geometry crossing the camera near plane is clipped with finite interpolated texture coordinates',()=>{
  const polygon=clipDepth([{x:-1,y:1,z:-2,u:0,v:1},{x:1,y:1,z:-2,u:1,v:1},{x:0,y:-1,z:.5,u:.5,v:0}],.1);
  assert.equal(polygon.length,4);
  for(const vertex of polygon){assert(vertex.z<=-.1);for(const value of Object.values(vertex))assert(Number.isFinite(value));assert(vertex.u>=0&&vertex.u<=1);assert(vertex.v>=0&&vertex.v<=1);}
  assert.equal(polygon.filter(v=>v.z===-.1).length,2);
});

test('objects behind the camera disappear while fully visible polygons retain their vertices',()=>{
  const behind=[{x:0,y:0,z:1,u:0,v:0},{x:1,y:0,z:2,u:1,v:0},{x:0,y:1,z:1,u:0,v:1}];
  assert.deepEqual(clipDepth(behind,.1),[]);
  const visible=behind.map(v=>({...v,z:-v.z}));assert.deepEqual(clipDepth(visible,.1),visible);
});

test('the far plane also clips faces that cross the view distance',()=>{
  const polygon=clipDepth([{x:0,y:0,z:-1,u:0,v:0},{x:1,y:0,z:-10,u:1,v:0},{x:0,y:1,z:-1,u:0,v:1}],5,false);
  assert.equal(polygon.length,4);assert(polygon.every(v=>v.z>=-5));
});
