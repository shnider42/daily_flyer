/* Shared terrain presentation: world-aligned cells, closed LOD seams, stable
 * surface colors and small scale references. Heights always come from physics. */
import {isPassengerAirport,airportGroundDistance} from './airfield-layout.mjs';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const mix=(a,b,t)=>a+(b-a)*t;
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const TAU=Math.PI*2;
function hash(x,z){let a=Math.imul(x,73856093)^Math.imul(z,19349663);a=Math.imul(a^(a>>>13),1274126177);return((a^(a>>>16))>>>0)/4294967296;}
function groundNoise(x,z,scale){
  const gx=Math.floor(x/scale),gz=Math.floor(z/scale),fx=x/scale-gx,fz=z/scale-gz,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
  return mix(mix(hash(gx,gz),hash(gx+1,gz),sx),mix(hash(gx,gz+1),hash(gx+1,gz+1),sx),sz);
}
function rgb(value){if(Array.isArray(value))return value;const n=parseInt(String(value).replace('#',''),16);return[(n>>16)&255,(n>>8)&255,n&255];}

export function terrainMeshSettings(mission={},quality='medium',software=false){
  const canyon=mission.biome==='canyon',low=quality==='low';
  return {cell:canyon?64:software?(low?192:160):128,focusStep:canyon?256:software?(low?192:160):384,
    near:canyon?(software?(low?640:896):(low?1152:1664)):software?320:640,
    middle:canyon?(software?2304:4096):software?1600:3000,
    far:canyon?(software?6144:9216):software?4800:9000};
}

/** A disjoint quadtree mesh. Its finest faces use the exact h00,h01,h10 /
 * h10,h01,h11 diagonal used by canyon collision. LOD transitions add shared
 * boundary vertices instead of overlapping skirts or floating detail patches. */
export function buildSceneTerrain({x=0,z=0,mission={},quality='medium',software=false,radius=21000,sampleHeight}){
  const settings=terrainMeshSettings(mission,quality,software),{cell,focusStep}=settings;
  const anchorX=Math.round(x/focusStep)*focusStep,anchorZ=Math.round(z/focusStep)*focusStep,root=cell*64;
  const tiles=[],horizontal=new Map(),vertical=new Map(),samples=new Map();
  const sample=(vx,vz)=>{const key=vx+','+vz;if(!samples.has(key))samples.set(key,finite(sampleHeight(vx,vz),-8));return samples.get(key);};
  const edge=(map,key,value)=>{let row=map.get(key);if(!row){row=new Set();map.set(key,row);}row.add(value);};
  const split=(tx,tz,size)=>{
    const distance=Math.max(Math.abs(tx+size*.5-anchorX)-size*.5,Math.abs(tz+size*.5-anchorZ)-size*.5,0);
    let target=distance<settings.near?cell:distance<settings.middle?cell*2:distance<settings.far?cell*4:cell*8;
    if(distance>settings.far*1.7)target=cell*16;
    const corners=[sample(tx,tz),sample(tx+size,tz),sample(tx,tz+size),sample(tx+size,tz+size)],center=sample(tx+size*.5,tz+size*.5);
    const coast=Math.min(...corners,center)<0&&Math.max(...corners,center)>=0,hiddenPeak=center>=0&&corners.every(y=>y<0);
    if(size>cell&&(size>target||(coast&&size>cell*4)||hiddenPeak)){
      const half=size*.5;split(tx,tz,half);split(tx+half,tz,half);split(tx,tz+half,half);split(tx+half,tz+half,half);return;
    }
    tiles.push({x:tx,z:tz,size});for(const xx of[tx,tx+size])for(const zz of[tz,tz+size]){edge(horizontal,zz,xx);edge(vertical,xx,zz);}
  };
  const minX=Math.floor((anchorX-radius)/root)*root,minZ=Math.floor((anchorZ-radius)/root)*root,maxX=Math.ceil((anchorX+radius)/root)*root,maxZ=Math.ceil((anchorZ+radius)/root)*root;
  for(let tz=minZ;tz<maxZ;tz+=root)for(let tx=minX;tx<maxX;tx+=root)split(tx,tz,root);
  for(const [k,v]of horizontal)horizontal.set(k,[...v].sort((a,b)=>a-b));
  for(const [k,v]of vertical)vertical.set(k,[...v].sort((a,b)=>a-b));
  const vertices=[],byPoint=new Map();
  const vertex=(vx,vz)=>{const key=vx+','+vz;let i=byPoint.get(key);if(i===undefined){
    i=vertices.length;const h=sample(vx,vz);let y=Math.max(-.4,h)-.12;
    // The airfield is a separate physical deck. Keep a coarse distant terrain
    // face below its paint rather than letting it interpolate across the strip.
    for(const r of mission.runways||[]){if(r.carrier)continue;const dx=vx-r.x,dz=vz-r.z,c=Math.cos(r.heading||0),s=Math.sin(r.heading||0);if(Math.abs(dx*c-dz*s)<(r.width||45)*.5+cell*1.2&&Math.abs(dx*s+dz*c)<(r.length||1000)*.5+cell*1.2)y=Math.min(y,finite(r.y,12)-.4);}
    vertices.push([vx,y,vz,h]);byPoint.set(key,i);
  }return i;};
  let triangles=0;
  for(const tile of tiles){
    const {x:tx,z:tz,size}=tile,ex=tx+size,ez=tz+size,ring=[];
    for(const zz of vertical.get(tx))if(zz>=tz&&zz<ez)ring.push(vertex(tx,zz));
    for(const xx of horizontal.get(ez))if(xx>=tx&&xx<ex)ring.push(vertex(xx,ez));
    for(const zz of [...vertical.get(ex)].reverse())if(zz>tz&&zz<=ez)ring.push(vertex(ex,zz));
    for(const xx of [...horizontal.get(tz)].reverse())if(xx>tx&&xx<=ex)ring.push(vertex(xx,tz));
    tile.boundary=ring;tile.indices=[];
    const cy=sample(tx+size*.5,tz+size*.5),island=cy>=0&&ring.every(i=>vertices[i][3]<0);
    if(ring.length===4&&!island)tile.indices.push(ring[0],ring[1],ring[3],ring[3],ring[1],ring[2]);
    else{const center=vertex(tx+size*.5,tz+size*.5);for(let i=0;i<ring.length;i++)tile.indices.push(center,ring[i],ring[(i+1)%ring.length]);}
    const ys=tile.indices.map(i=>vertices[i][1]);tile.minY=Math.min(...ys);tile.maxY=Math.max(...ys);tile.water=tile.indices.every(i=>vertices[i][3]<0);triangles+=tile.indices.length/3;
  }
  return {anchorX,anchorZ,cell,focusStep,radius,vertices,tiles,triangles,bounds:{minX,minZ,maxX,maxZ}};
}

/** Broad strata and slope changes are geometry-sized, so the view retains
 * scale at low altitude without high-frequency texture shimmer. */
export function terrainColor(x,y,z,slope,biome,palette){
  if(biome==='canyon'){
    const wall=clamp((slope-.16)/.65,0,1),low=clamp((290-y)/220,0,1);
    const top=[153,139,105],rock=[169,126,92],floor=[94,117,101];
    const band=.86+.12*Math.sin(y*.055+Math.sin(x*.0008+z*.0006)*.45)+.035*Math.sin(y*.14);
    const night=rgb(palette[0])[0]<80;
    return top.map((v,i)=>{const c=mix(mix(v,rock[i]*band,wall),floor[i],low*(1-wall*.65));return night?mix(c*.45,[36,52,65][i],.3):c;});
  }
  const colors=palette.map(rgb),a=colors[0],b=colors[1]||a,c=colors[2]||b,d=colors[3]||a;
  // Continuous land tint removes the former kilometre-wide checkerboard.
  // Authored farm plots near airports supply crisp field boundaries instead.
  const broad=groundNoise(x,z,2300),patch=groundNoise(x+7100,z-3300,950),shade=groundNoise(x-4500,z+2600,4200)*.28;
  const base=a.map((value,i)=>mix(mix(mix(value,b[i],broad),c[i],patch*.35),d[i],shade)),variation=.94+.045*Math.sin(x*.0018+z*.0012)+.025*Math.sin(z*.005);
  const cliff=clamp((slope-.25)*.75,0,.72),snow=biome==='desert'?0:clamp((y-2100)/1100,0,.9);
  return base.map((v,i)=>mix(mix(v*variation,[137,143,130][i],cliff),[225,228,216][i],snow));
}

/** Worker-friendly GPU buffers, including normals and linear vertex colors.
 * Computing slope from the shared mesh avoids another four physics samples
 * per vertex every time the view moves into a new terrain sector. */
export function packTerrainGeometry(mesh,mission,palette){
  const positions=new Float32Array(mesh.vertices.length*3),normals=new Float32Array(positions.length),colors=new Float32Array(positions.length),faces=[];
  for(let i=0;i<mesh.vertices.length;i++)positions.set(mesh.vertices[i].slice(0,3),i*3);
  for(const tile of mesh.tiles)if(!tile.water)faces.push(...tile.indices);
  const indices=mesh.vertices.length>65535?new Uint32Array(faces):new Uint16Array(faces);
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    for(const k of[a,b,c]){normals[k]+=nx;normals[k+1]+=ny;normals[k+2]+=nz;}
  }
  const linear=v=>{v=clamp(v/255,0,1);return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};
  for(let i=0;i<mesh.vertices.length;i++){
    const k=i*3,len=Math.hypot(normals[k],normals[k+1],normals[k+2])||1,slope=Math.hypot(normals[k],normals[k+2])/Math.max(.01,Math.abs(normals[k+1]));
    normals[k]/=len;normals[k+1]/=len;normals[k+2]/=len;
    const tint=terrainColor(positions[k],positions[k+1],positions[k+2],slope,mission.biome,palette);colors[k]=linear(tint[0]);colors[k+1]=linear(tint[1]);colors[k+2]=linear(tint[2]);
  }
  return {positions,normals,colors,indices};
}

export function colorSoftwareTerrain(mesh,mission,palette){
  for(const tile of mesh.tiles)tile.color=terrainColor(tile.x+tile.size*.5,(tile.minY+tile.maxY)*.5,tile.z+tile.size*.5,(tile.maxY-tile.minY)/tile.size,mission.biome,palette);
  return mesh;
}

export function sceneryClearance(x,z,mission,padding=65){
  for(const r of mission.runways||[]){const dx=x-r.x,dz=z-r.z,c=Math.cos(r.heading||0),s=Math.sin(r.heading||0);const across=dx*c-dz*s,along=dx*s+dz*c;if(Math.abs(across)<(r.width||45)*.5+padding&&Math.abs(along)<(r.length||1000)*.5+padding)return false;if(isPassengerAirport(r)&&airportGroundDistance(across,along,r)<padding+400)return false;}
  if(mission.kind==='gunship')for(const t of mission.targets||[])if(Math.hypot(x-t.x,z-t.z)<100)return false;
  return true;
}

/** Stable small objects provide optic flow and a familiar scale near the
 * ground. They are decoration, never a substitute for a terrain wall. */
export function groundDetails(x,z,mission,sampleHeight,limit=384){
  const cell=144,ax=Math.round(x/288)*288,az=Math.round(z/288)*288,out=[],canyon=mission.biome==='canyon',dry=canyon||mission.biome==='desert';
  for(let iz=-8;iz<=8;iz++)for(let ix=-8;ix<=8;ix++){
    const gx=Math.round(ax/cell)+ix,gz=Math.round(az/cell)+iz,px=gx*cell+(hash(gx,gz)-.5)*cell*.7,pz=gz*cell+(hash(gz+71,gx-13)-.5)*cell*.7;
    if(Math.hypot(px-x,pz-z)>1300||!sceneryClearance(px,pz,mission))continue;
    const y=sampleHeight(px,pz);if(y<2||y>2400)continue;
    const slope=Math.max(Math.abs(sampleHeight(px+12,pz)-y),Math.abs(sampleHeight(px,pz+12)-y))/12;
    if(slope>.42)continue;
    const seed=hash(gx-71,gz+93),size=(dry?3.1:4.5)+seed*(dry?4.8:7);
    out.push({x:px,y,z:pz,size,kind:dry||slope>.25?'rock':'tree',angle:seed*TAU,color:dry?'#867d65':'#496d54'});
  }
  out.sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));return out.slice(0,limit);
}

/** A conformed low-altitude silhouette. Every vertex samples the actual ground
 * or carrier deck; opacity/softness make height changes visible at a glance. */
export function aircraftGroundShadow(p,meta,sampleSurface){
  if(finite(p.health,100)<=0)return null;
  const ground=sampleSurface(p.x,p.z),agl=Math.max(0,p.y-ground);if(agl>330)return null;
  const span=finite(meta?.span,11),length=finite(meta?.length,9),blur=1+agl*.008,heading=finite(p.heading),c=Math.cos(heading),s=Math.sin(heading);
  const cx=p.x+agl*.72,cz=p.z+agl*.48,ring=[],alpha=.26*Math.pow(1-agl/330,1.2);
  // Crossed wings/fuselage, rather than an altitude-independent floating disc.
  const outline=[[-.07,.5],[.07,.5],[.1,.08],[.5,-.09],[.5,-.17],[.08,-.07],[.08,-.34],[.2,-.42],[.2,-.47],[0,-.43],[-.2,-.47],[-.2,-.42],[-.08,-.34],[-.08,-.07],[-.5,-.17],[-.5,-.09],[-.1,.08]];
  for(const [xx,zz]of outline){const lx=xx*span*blur,lz=zz*length*blur,x=cx+lx*c+lz*s,z=cz+lz*c-lx*s;ring.push([x,sampleSurface(x,z)+.2,z]);}
  const center=[cx,sampleSurface(cx,cz)+.2,cz];
  return {center,ring,alpha,agl};
}
