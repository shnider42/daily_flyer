/* A world-aligned, disjoint terrain mesh for the Canvas renderer. Adjacent
 * detail levels share every boundary vertex, so no larger face covers a
 * smaller face and no T-junction exposes the background between them. */
export function buildSoftwareTerrain({x=0,z=0,cell=160,radius=21000,sampleHeight}) {
  const root=cell*32, anchorX=Math.round(x/cell)*cell, anchorZ=Math.round(z/cell)*cell;
  const tiles=[], horizontal=new Map(), vertical=new Map(),samples=new Map();
  const sample=(vx,vz)=>{const key=vx+','+vz;if(!samples.has(key)){const value=sampleHeight(vx,vz);samples.set(key,Number.isFinite(value)?value:-8);}return samples.get(key);};
  const addEdge=(map,key,value)=>{let values=map.get(key);if(!values){values=new Set();map.set(key,values);}values.add(value);};
  const split=(tx,tz,size)=>{
    const distance=Math.max(Math.abs(tx+size*.5-anchorX)-size*.5,Math.abs(tz+size*.5-anchorZ)-size*.5,0);
    const corners=[sample(tx,tz),sample(tx+size,tz),sample(tx,tz+size),sample(tx+size,tz+size)],center=sample(tx+size*.5,tz+size*.5);
    const mixedCoast=Math.min(...corners,center)<0&&Math.max(...corners,center)>=0;
    const hiddenIsland=center>=0&&corners.every(y=>y<0);
    // Keep coastlines finer than the far-land mesh and retain an island that
    // falls inside a coarse cell even when all four corners are open water.
    if(size>cell&&(distance<size*2||(size>cell*4&&mixedCoast)||hiddenIsland)){const half=size*.5;split(tx,tz,half);split(tx+half,tz,half);split(tx,tz+half,half);split(tx+half,tz+half,half);return;}
    tiles.push({x:tx,z:tz,size});
    for(const xx of [tx,tx+size])for(const zz of [tz,tz+size]){addEdge(horizontal,zz,xx);addEdge(vertical,xx,zz);}
  };
  const minX=Math.floor((anchorX-radius)/root)*root,minZ=Math.floor((anchorZ-radius)/root)*root;
  const maxX=Math.ceil((anchorX+radius)/root)*root,maxZ=Math.ceil((anchorZ+radius)/root)*root;
  for(let tz=minZ;tz<maxZ;tz+=root)for(let tx=minX;tx<maxX;tx+=root)split(tx,tz,root);
  for(const [key,values] of horizontal)horizontal.set(key,[...values].sort((a,b)=>a-b));
  for(const [key,values] of vertical)vertical.set(key,[...values].sort((a,b)=>a-b));
  const vertices=[],vertexByPoint=new Map();
  const vertex=(vx,vz)=>{
    const key=vx+','+vz;let index=vertexByPoint.get(key);
    if(index===undefined){index=vertices.length;const h=sample(vx,vz);vertices.push([vx,Math.max(-.4,h),vz,h]);vertexByPoint.set(key,index);}
    return index;
  };
  for(const tile of tiles){
    const {x:tx,z:tz,size}=tile,ex=tx+size,ez=tz+size;
    // Follow the perimeter counterclockwise when viewed from above. Every
    // smaller neighbor's corner is also a vertex on this tile's perimeter.
    const ring=[];
    for(const zz of vertical.get(tx))if(zz>=tz&&zz<ez)ring.push(vertex(tx,zz));
    for(const xx of horizontal.get(ez))if(xx>=tx&&xx<ex)ring.push(vertex(xx,ez));
    for(const zz of [...vertical.get(ex)].reverse())if(zz>tz&&zz<=ez)ring.push(vertex(ex,zz));
    for(const xx of [...horizontal.get(tz)].reverse())if(xx>tx&&xx<=ex)ring.push(vertex(xx,tz));
    tile.boundary=ring;tile.indices=[];
    const centerHeight=sample(tx+size*.5,tz+size*.5),island=centerHeight>=0&&ring.every(i=>vertices[i][3]<0);
    if(ring.length===4&&!island)tile.indices.push(ring[0],ring[1],ring[3],ring[3],ring[1],ring[2]);
    else{const center=vertex(tx+size*.5,tz+size*.5);for(let i=0;i<ring.length;i++)tile.indices.push(center,ring[i],ring[(i+1)%ring.length]);}
    const ys=tile.indices.map(i=>vertices[i][1]);tile.minY=Math.min(...ys);tile.maxY=Math.max(...ys);
    tile.water=tile.indices.every(i=>vertices[i][3]<0);
  }
  return {anchorX,anchorZ,cell,radius,vertices,tiles,bounds:{minX,minZ,maxX,maxZ}};
}
