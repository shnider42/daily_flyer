// Static geometry is indexed once per city. Small test/custom worlds stay simple.
const indexes=new WeakMap(),solids=new WeakMap(),SIZE=24;
export function solidBuildings(buildings){let c=solids.get(buildings);if(!c||c.length!==buildings.length){c={length:buildings.length,value:buildings.filter(b=>!b.walkable)};solids.set(buildings,c);}return c.value;}
export function queryStatic(buildings,minX,minZ,maxX,maxZ){
 if(buildings.length<32)return buildings;let index=indexes.get(buildings);
 if(!index||index.length!==buildings.length){const cells=new Map();buildings.forEach((b,i)=>{const c=Math.abs(Math.cos(b.a||0)),s=Math.abs(Math.sin(b.a||0)),w=(b.w*c+b.d*s)/2,d=(b.d*c+b.w*s)/2;for(let x=Math.floor((b.x-w)/SIZE);x<=Math.floor((b.x+w)/SIZE);x++)for(let z=Math.floor((b.z-d)/SIZE);z<=Math.floor((b.z+d)/SIZE);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}});index={length:buildings.length,cells};indexes.set(buildings,index);}
 const found=new Set();for(let x=Math.floor(minX/SIZE);x<=Math.floor(maxX/SIZE);x++)for(let z=Math.floor(minZ/SIZE);z<=Math.floor(maxZ/SIZE);z++)for(const i of index.cells.get(x+','+z)||[])found.add(i);
 return [...found].sort((a,b)=>a-b).map(i=>buildings[i]);
}
