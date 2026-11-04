import * as T from './vendor/three.module.js';
// Merge immovable, untextured props by material. Keep actors, boards, roof,
// ceiling and labeled signs separate so their visibility stays independent.
export function batchStaticGeometry(scene,excluded=new Set()){
 const groups=new Map();
 for(const mesh of [...scene.children]){
  if(!mesh.isMesh||excluded.has(mesh)||!mesh.material.isMeshStandardMaterial||mesh.material.map)continue;
  if(!groups.has(mesh.material))groups.set(mesh.material,[]);groups.get(mesh.material).push(mesh);
 }
 for(const [material,meshes] of groups){
  if(meshes.length<2)continue;
  const parts=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);return geometry;});
  const merged=new T.BufferGeometry();
  for(const name of ['position','normal','uv']){
   if(!parts.every(p=>p.attributes[name]))continue;
   const size=parts[0].attributes[name].itemSize,total=parts.reduce((n,p)=>n+p.attributes[name].array.length,0),array=new Float32Array(total);let offset=0;
   for(const p of parts){array.set(p.attributes[name].array,offset);offset+=p.attributes[name].array.length;}
   merged.setAttribute(name,new T.BufferAttribute(array,size));
  }
  for(const mesh of meshes){scene.remove(mesh);mesh.geometry.dispose();}for(const p of parts)p.dispose();
  merged.computeBoundingSphere();scene.add(new T.Mesh(merged,material));
 }
}
