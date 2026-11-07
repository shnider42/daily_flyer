/* Canvas 2D compatibility renderer. All flight geometry is projected in 3D;
 * gameplay and collision remain the same simulation as the WebGL renderer. */
import * as THREE from './vendor/three.module.js';
import { terrainHeight } from './sim.mjs';
import {orientationOf,basis,deriveEuler} from './orientation.mjs';
import {cockpitView} from './camera-pose.mjs';
import { buildSoftwareTerrain } from './software-terrain.mjs';
import { makeAircraft, animateAircraft, setAircraftPose, aircraftKind } from './models.mjs';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const n=(v,f=0)=>Number.isFinite(v)?v:f;
const mix=(a,b,t)=>a+(b-a)*t;
const V=new THREE.Vector3(),D=new THREE.Vector3(),Q=new THREE.Quaternion(),M=new THREE.Matrix4(),MV=new THREE.Matrix4(),S=new THREE.Vector3(1,1,1);
const materials=new WeakMap(),vertexBuffers=new WeakMap(),simpleCache=new Map(),colorCache=new Map();
const colors={
  countryside:{sky:'#85aeb6',haze:'#d6d8bd',water:'#63909a',land:['#7b9272','#95a17a','#a6ac87','#718969']},
  channel:{sky:'#81a5b3',haze:'#c9d3cc',water:'#527f8e',land:['#708c70','#899c7d','#aaa98b','#64816d']},
  coast:{sky:'#81a6b0',haze:'#d6d6bd',water:'#578b94',land:['#698866','#91a17b','#aca882','#7a9876']},
  pacific:{sky:'#74abba',haze:'#cee2d5',water:'#428b98',land:['#558769','#6e9c77','#b1b58b','#4f7e64']},
  jungle:{sky:'#789e9e',haze:'#bdcfba',water:'#5b9290',land:['#497558','#5f865c','#7c8f67','#507155']},
  south_atlantic:{sky:'#819ca7',haze:'#c5d1ca',water:'#4d7b89',land:['#718775','#8e997e','#a2ac92','#62786a']},
  desert:{sky:'#93afb6',haze:'#dfccb1',water:'#618d98',land:['#bea078','#cdb38c','#ddc69f','#b39470']},
  mountains:{sky:'#8daab4',haze:'#ccd2c6',water:'#598490',land:['#778675','#8b957f','#a3a58c','#677c6b']},
  night:{sky:'#0c1b2d',haze:'#3b4d60',water:'#263e51',land:['#2c4446','#3c514d','#4d5f53','#273d43']},
};
const skyStars=Array.from({length:180},(_,i)=>{
  const azimuth=((i*173.17)%997)/997*TAU,y=.04+((i*113.43)%641)/641*.94,horizontal=Math.sqrt(1-y*y);
  return {x:Math.sin(azimuth)*horizontal,y,z:Math.cos(azimuth)*horizontal,alpha:.25+(i%4)*.15,size:i%7===0?2:1};
});
function rgb(value){if(!colorCache.has(value)){const c=new THREE.Color(value);c.convertLinearToSRGB();colorCache.set(value,[c.r*255,c.g*255,c.b*255]);}return colorCache.get(value);}
function hash(value){let s=2166136261;for(const c of String(value))s=Math.imul(s^c.charCodeAt(0),16777619);return s>>>0;}
function random(seed){let a=seed;return()=>{a+=0x6d2b79f5;let t=Math.imul(a^a>>>15,a|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function height(x,z,mission){return n(terrainHeight(x,z,mission),-8);}

// A distant aircraft is a silhouette made from closed 3D solids and wing faces.
function simpleModel(profile){
  const kind=aircraftKind(profile);if(simpleCache.has(kind))return simpleCache.get(kind);
  const jet=/f4|f15|f16|f22|mig|harrier|a10/.test(kind),heavy=/b17|c47|he111/.test(kind),stealth=kind==='b2';
  const half=stealth?8:heavy?11:jet?8:4.2,span=stealth?26:heavy?15:jet?6.5:5.4;
  const triangles=[],add=(a,b,c,shade=1)=>triangles.push({p:[...a,...b,...c],shade});
  const quad=(a,b,c,d,shade=1)=>{add(a,b,c,shade);add(a,c,d,shade);};
  if(stealth){
    const p=[[0,.2,8],[-26,0,-4],[-19,0,-6],[-14,0,-4],[-9,0,-6],[-4,0,-4],[0,0,-6],[4,0,-4],[9,0,-6],[14,0,-4],[19,0,-6],[26,0,-4]];
    for(let i=1;i<p.length-1;i++)add(p[0],p[i],p[i+1]);
    add([-3,0,2],[0,1.2,6],[3,0,2],1.18);simpleCache.set(kind,triangles);return triangles;
  }
  const w=heavy?1.2:jet?1.1:.65,h=heavy?1.2:.65;
  const nose=[0,0,half],tail=[0,.1,-half],l=[-w,0,0],r=[w,0,0],t=[0,h,0],b=[0,-h,0];
  for(const [a,c,shade]of[[l,t,1],[t,r,1.1],[r,b,.7],[b,l,.7]]){add(nose,a,c,shade);add(tail,c,a,shade);}
  const sweep=jet?2.8:.5,root=heavy?3:1.5;
  const wing=(yy)=>quad([-span,yy,-sweep],[0,yy,-root],[span,yy,-sweep],[0,yy,root]);
  wing(-.2);if(kind==='avro504'||kind==='camel')wing(1.3);
  quad([-span*.32,.2,-half*.82],[0,.2,-half*.65],[span*.32,.2,-half*.82],[0,.2,-half]);
  add([0,.1,-half*.48],[0,heavy?3:2,-half*.79],[0,.1,-half]);
  if(heavy)for(const side of[-1,1]){
    const x=side*4.8;quad([x-.65,-.6,-1],[x+.65,-.6,-1],[x+.65,.6,4],[x-.65,.6,4],.75);
    if(kind==='b17'){const xx=side*10;quad([xx-.55,-.5,-1.5],[xx+.55,-.5,-1.5],[xx+.55,.5,2.5],[xx-.55,.5,2.5],.75);}
  }
  simpleCache.set(kind,triangles);return triangles;
}

export class SoftwareFlightRenderer{
  constructor(canvas,settings={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});if(!this.ctx)throw new Error('This browser could not create a canvas renderer.');
    this.backend='software';this.settings={...settings};this.camera=new THREE.PerspectiveCamera(60,1,.6,70000);
    this.width=1;this.height=1;this.time=0;this._mode=null;this._plane=null;this._queue=[];this._drawPool=[];this._poolIndex=0;this._clipBuffer=[];this._pointBuffer=[];this._terrainCache=new Map();this._terrainMesh=null;
    this._cameraReady=false;this._cameraTarget=new THREE.Vector3();this._cameraOffset=new THREE.Vector3();this._cameraLookOffset=new THREE.Vector3();this._sunView=new THREE.Vector3();this._upView=new THREE.Vector3();
    this.stats={fps:60,triangles:0,drawCalls:0,pixelRatio:1};this.contextLost=false;this.setSettings(settings);
  }
  setSettings(settings={}){this.settings={...this.settings,...settings};this.pixelRatio=Math.min(n(globalThis.devicePixelRatio,1),this.settings.quality==='high'?1.4:1);this.resize();}
  resize(){
    const r=this.canvas.getBoundingClientRect(),width=Math.max(1,Math.round(r.width||globalThis.innerWidth||1)),height=Math.max(1,Math.round(r.height||globalThis.innerHeight||1));
    const backingWidth=Math.round(width*this.pixelRatio),backingHeight=Math.round(height*this.pixelRatio),changed=width!==this.width||height!==this.height;
    // Assigning either dimension clears the canvas and resets the entire 2D
    // context, even when its value is unchanged (for example a key remap).
    if(this.canvas.width!==backingWidth)this.canvas.width=backingWidth;
    if(this.canvas.height!==backingHeight)this.canvas.height=backingHeight;
    this.width=width;this.height=height;this.ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    if(changed){this.camera.aspect=width/height;this.camera.fov=width<height?67:59;this.camera.updateProjectionMatrix();}
    this.stats.pixelRatio=this.pixelRatio;
  }
  loadMission(mission,aircraft){
    this.mission=mission;this.aircraft=typeof aircraft==='string'?{id:aircraft}:aircraft||{id:mission.aircraft};this._mode='flight';this._plane=makeAircraft(this.aircraft);this._planeMeta=this._plane.userData;
    this._cameraReady=false;this._terrainCache.clear();this._terrainMesh=null;this._groundOffset=mission.start?.airborne===false?1.3:0;this.camera.fov=this.width<this.height?67:59;this.camera.updateProjectionMatrix();
    this._configureAtmosphere(mission);const rand=random(hash(mission.id));this._clouds=[];
    for(let i=0;i<28;i++){const x=(rand()-.5)*27000,z=(rand()-.15)*27000,y=this._cloudBase+rand()*(this._cloudTop-this._cloudBase);for(let k=0;k<3;k++)this._clouds.push({x:x+k*200,y:y+Math.sin(k)*30,z:z+(rand()-.5)*180,r:170+rand()*180});}
    this._scenery=[];
    for(let i=0;i<75;i++){const x=(rand()-.5)*18000,z=(rand()-.15)*21000,y=this._height(x,z);if(y>5)this._scenery.push({x,y,z,size:10+rand()*12,kind:i%7===0?'house':'tree'});}
    this._city=[];if(mission.aircraft==='b2'){const site=mission.targets?.find(t=>t.type==='city')||{x:0,z:15000};for(let i=0;i<65;i++){const x=site.x+(rand()-.5)*1700,z=site.z+(rand()-.5)*1700;this._city.push({x,y:Math.max(0,this._height(x,z)),z,w:25+rand()*75,h:30+rand()*230,d:25+rand()*65});}}
  }
  _configureAtmosphere(mission){
    this.palette=colors[mission.biome]||colors.countryside;this._night=mission.biome==='night'||/night/.test(mission.weather?.timeOfDay||'');if(this._night)this.palette=colors.night;
    this._sunset=/dawn|dusk|sunset/.test(mission.weather?.timeOfDay||'');this._fogColor=rgb(this._sunset&&!this._night?'#d7ccb0':this.palette.haze);
    this._landColors=this.palette.land.map(rgb);const fog=n(mission.weather?.fog);this._fogFar=fog>100?clamp(fog,1800,35000):fog>0&&fog<.01?clamp(.55/fog,5000,35000):21000;
    this._cloudBase=n(mission.weather?.cloudBase,850);this._cloudTop=n(mission.weather?.cloudTop,this._cloudBase+450);this._visibilityFar=this._fogFar;
  }
  _height(x,z){const key=x+','+z;if(this._terrainCache.has(key))return this._terrainCache.get(key);const y=height(x,z,this.mission);this._terrainCache.set(key,y);if(this._terrainCache.size>22000)this._terrainCache.delete(this._terrainCache.keys().next().value);return y;}
  _view(){
    this.camera.updateMatrixWorld(true);this._viewElements=this.camera.matrixWorldInverse.elements;this._focal=this.height/(2*Math.tan(this.camera.fov*Math.PI/360));
    this._sunView.set(-.55,.8,.22).normalize().transformDirection(this.camera.matrixWorldInverse);this._upView.set(0,1,0).transformDirection(this.camera.matrixWorldInverse);
  }
  _toView(x,y,z){const e=this._viewElements;return[e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]];}
  _primitive(type){
    let item=this._drawPool[this._poolIndex];if(!item){item={points:[]};this._drawPool[this._poolIndex]=item;}this._poolIndex++;
    item.type=type;item.layer=this._layer||0;this._queue.push(item);return item;
  }
  _triangle(a,b,c,base,alpha=1,double=false,unlit=false){this._triangleXYZ(...a,...b,...c,base,alpha,double,unlit);}
  _triangleXYZ(ax,ay,az,bx,by,bz,cx,cy,cz,base,alpha=1,double=false,unlit=false,coverEdges=false){
    const depth=-(az+bz+cz)/3;if(depth>this._visibilityFar*1.1||(az>-.6&&bz>-.6&&cz>-.6))return;
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const facing=nx*ax+ny*ay+nz*az;if(!double&&facing>=0)return;
    if(double&&facing>0){nx=-nx;ny=-ny;nz=-nz;}
    const polygon=this._clipBuffer;polygon.length=0;
    if(az<=-.6&&bz<=-.6&&cz<=-.6)polygon.push(ax,ay,az,bx,by,bz,cx,cy,cz);
    else{
      const clip=(px,py,pz,qx,qy,qz)=>{const pin=pz<=-.6,qin=qz<=-.6;if(pin)polygon.push(px,py,pz);if(pin!==qin){const t=(-.6-pz)/(qz-pz);polygon.push(mix(px,qx,t),mix(py,qy,t),-.6);}};
      clip(ax,ay,az,bx,by,bz);clip(bx,by,bz,cx,cy,cz);clip(cx,cy,cz,ax,ay,az);
    }
    if(polygon.length<9)return;
    const points=this._pointBuffer;points.length=0;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,clippedDepth=0;
    for(let i=0;i<polygon.length;i+=3){const d=-polygon[i+2],x=this.width*.5+polygon[i]*this._focal/d,y=this.height*.5-polygon[i+1]*this._focal/d;points.push(x,y);clippedDepth+=d;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    if(maxX<0||minX>this.width||maxY<0||minY>this.height)return;
    const area=(points[2]-points[0])*(points[5]-points[1])-(points[3]-points[1])*(points[4]-points[0]);if(Math.abs(area)<.035)return;
    const len=Math.hypot(nx,ny,nz);if(len<1e-8)return;nx/=len;ny/=len;nz/=len;
    // Shading and color strings are only needed for a visible triangle.
    const light=unlit?1:(this._night?.7:.65)+Math.max(0,nx*this._sunView.x+ny*this._sunView.y+nz*this._sunView.z)*.38+Math.max(0,nx*this._upView.x+ny*this._upView.y+nz*this._upView.z)*.12;
    const fog=clamp((depth-1200)/Math.max(100,this._visibilityFar-1200),0,.97),f=fog*fog;
    const rr=Math.round(clamp(mix(base[0]*light,this._fogColor[0],f),0,255)),gg=Math.round(clamp(mix(base[1]*light,this._fogColor[1],f),0,255)),bb=Math.round(clamp(mix(base[2]*light,this._fogColor[2],f),0,255));
    const item=this._primitive('triangle');item.points.length=points.length;for(let i=0;i<points.length;i++)item.points[i]=points[i];
    item.depth=clippedDepth/(polygon.length/3);item.fill=`rgb(${rr},${gg},${bb})`;item.alpha=alpha;item.coverEdges=coverEdges;
  }
  _worldTri(a,b,c,base,alpha=1,double=false,unlit=false){
    const e=this._viewElements,ax=a[0],ay=a[1],az=a[2],bx=b[0],by=b[1],bz=b[2],cx=c[0],cy=c[1],cz=c[2];
    this._triangleXYZ(e[0]*ax+e[4]*ay+e[8]*az+e[12],e[1]*ax+e[5]*ay+e[9]*az+e[13],e[2]*ax+e[6]*ay+e[10]*az+e[14],e[0]*bx+e[4]*by+e[8]*bz+e[12],e[1]*bx+e[5]*by+e[9]*bz+e[13],e[2]*bx+e[6]*by+e[10]*bz+e[14],e[0]*cx+e[4]*cy+e[8]*cz+e[12],e[1]*cx+e[5]*cy+e[9]*cz+e[13],e[2]*cx+e[6]*cy+e[10]*cz+e[14],base,alpha,double,unlit);
  }
  _worldQuad(a,b,c,d,base,alpha=1,double=false,unlit=false){this._worldTri(a,b,c,base,alpha,double,unlit);this._worldTri(a,c,d,base,alpha,double,unlit);}
  _box(x,y,z,w,h,l,base,heading=0){
    const cs=Math.cos(heading),sn=Math.sin(heading),v=[[-w,-h,-l],[w,-h,-l],[w,h,-l],[-w,h,-l],[-w,-h,l],[w,-h,l],[w,h,l],[-w,h,l]].map(p=>{const xx=p[0]*.5,zz=p[2]*.5;return[x+xx*cs+zz*sn,y+p[1]*.5,z+zz*cs-xx*sn];});
    for(const face of[[4,5,6,7],[1,0,3,2],[5,1,2,6],[0,4,7,3],[3,7,6,2],[0,1,5,4]])this._worldQuad(v[face[0]],v[face[1]],v[face[2]],v[face[3]],base);
  }
  _surface(x,y,z,w,l,base,heading=0,alpha=1){const c=Math.cos(heading),s=Math.sin(heading),p=[[-w/2,-l/2],[-w/2,l/2],[w/2,l/2],[w/2,-l/2]].map(([xx,zz])=>[x+xx*c+zz*s,y,z+zz*c-xx*s]);this._worldQuad(...p,base,alpha,true);}
  _line(a,b,stroke,width=1.5,alpha=1){const av=this._toView(...a),bv=this._toView(...b);if(av[2]>-.6&&bv[2]>-.6)return;let aa=av,bb=bv;if(aa[2]>-.6||bb[2]>-.6){const t=(-.6-aa[2])/(bb[2]-aa[2]),cut=[mix(aa[0],bb[0],t),mix(aa[1],bb[1],t),-.6];if(aa[2]>-.6)aa=cut;else bb=cut;}const p=[this.width*.5+aa[0]*this._focal/-aa[2],this.height*.5-aa[1]*this._focal/-aa[2],this.width*.5+bb[0]*this._focal/-bb[2],this.height*.5-bb[1]*this._focal/-bb[2]];if(Math.max(p[0],p[2])<0||Math.min(p[0],p[2])>this.width||Math.max(p[1],p[3])<0||Math.min(p[1],p[3])>this.height)return;this._queue.push({type:'line',points:p,depth:-(aa[2]+bb[2])*.5,stroke,width,alpha});}
  _disc(x,y,z,r,fill,alpha=1,ratio=1){const p=this._toView(x,y,z),depth=-p[2];if(depth<.6||depth>this._visibilityFar*1.08)return;const sx=this.width*.5+p[0]*this._focal/depth,sy=this.height*.5-p[1]*this._focal/depth,sr=clamp(r*this._focal/depth,.5,this.width*2);if(sx+sr<0||sx-sr>this.width||sy+sr<0||sy-sr>this.height)return;this._queue.push({type:'disc',x:sx,y:sy,r:sr,ratio,depth,fill,alpha});}
  _skyPoint(x,y,z){
    const e=this._viewElements,depth=-(e[2]*x+e[6]*y+e[10]*z);if(depth<=.001)return null;
    return {x:this.width*.5+(e[0]*x+e[4]*y+e[8]*z)*this._focal/depth,y:this.height*.5-(e[1]*x+e[5]*y+e[9]*z)*this._focal/depth};
  }
  _background(){
    const ctx=this.ctx;ctx.globalAlpha=1;ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    // A screen ray's world elevation is linear in its screen coordinates.
    // Project world-up into the camera, so the horizon and sea rotate with a
    // banked cockpit and correctly exchange screen halves when inverted.
    const up=this._upView,length=Math.hypot(up.x,up.y),cx=this.width*.5,cy=this.height*.5;
    const sky=rgb(this._night?'#0c1b2d':this._sunset?'#91aab2':this.palette.sky),haze=rgb(this._sunset&&!this._night?'#e2d1b2':this.palette.haze),water=rgb(this.palette.water);
    const band=this.height*.5,shade=elevation=>{const end=elevation>=0?sky:water,t=clamp(Math.abs(elevation)/band,0,1);return `rgb(${haze.map((v,i)=>Math.round(mix(v,end[i],t))).join(',')})`;};
    if(length<1e-6)ctx.fillStyle=shade(-up.z*this._focal);
    else{
      const nx=up.x/length,ny=-up.y/length,extent=Math.abs(nx)*cx+Math.abs(ny)*cy;
      const top=extent*length-up.z*this._focal,bottom=-extent*length-up.z*this._focal;
      const gradient=ctx.createLinearGradient(cx+nx*extent,cy+ny*extent,cx-nx*extent,cy-ny*extent);
      gradient.addColorStop(0,shade(top));
      for(const elevation of [band,0,-band])if(elevation<top&&elevation>bottom)gradient.addColorStop((top-elevation)/(top-bottom),shade(elevation));
      gradient.addColorStop(1,shade(bottom));ctx.fillStyle=gradient;
    }
    ctx.fillRect(0,0,this.width,this.height);
    // Celestial points live in world directions rather than following a fixed
    // screen position while the aircraft pitches, yaws or rolls around them.
    if(!this._night){const sun=this._skyPoint(-.45,.14,.9);if(sun&&sun.x>-26&&sun.x<this.width+26&&sun.y>-26&&sun.y<this.height+26){ctx.globalAlpha=.35;ctx.fillStyle='#ffedc8';ctx.beginPath();ctx.arc(sun.x,sun.y,26,0,TAU);ctx.fill();ctx.globalAlpha=1;}}
    else{ctx.fillStyle='#c7d5df';for(const star of skyStars){const point=this._skyPoint(star.x,star.y,star.z);if(point&&point.x>=0&&point.x<this.width&&point.y>=0&&point.y<this.height){ctx.globalAlpha=star.alpha;ctx.fillRect(point.x,point.y,star.size,1);}}ctx.globalAlpha=1;}
    if(this._visibilityFar<this._fogFar*.35){ctx.globalAlpha=.82*(1-this._visibilityFar/this._fogFar);ctx.fillStyle=this._night?'#526172':'#dedfce';ctx.fillRect(0,0,this.width,this.height);ctx.globalAlpha=1;}
  }
  _terrain(player){
    const cell=this.settings.quality==='low'?192:160,anchorX=Math.round(player.x/cell)*cell,anchorZ=Math.round(player.z/cell)*cell;
    if(!this._terrainMesh||this._terrainMesh.anchorX!==anchorX||this._terrainMesh.anchorZ!==anchorZ||this._terrainMesh.cell!==cell){
      const mesh=buildSoftwareTerrain({x:player.x,z:player.z,cell,radius:this._fogFar*1.1,sampleHeight:(x,z)=>this._height(x,z)});
      for(const tile of mesh.tiles){const field=Math.abs(Math.imul(Math.floor((tile.x+tile.size*.5)/1280),73856093)^Math.imul(Math.floor((tile.z+tile.size*.5)/1280),19349663))%4;const snow=clamp(((tile.minY+tile.maxY)*.5-1900)/1600,0,.8);tile.color=snow?this._landColors[field].map(v=>mix(v,216,snow)):this._landColors[field];}
      mesh.view=new Float64Array(mesh.vertices.length*3);this._terrainMesh=mesh;
    }
    const mesh=this._terrainMesh,e=this._viewElements,view=mesh.view;
    for(let i=0;i<mesh.vertices.length;i++){const p=mesh.vertices[i],x=p[0],y=p[1],z=p[2],k=i*3;view[k]=e[0]*x+e[4]*y+e[8]*z+e[12];view[k+1]=e[1]*x+e[5]*y+e[9]*z+e[13];view[k+2]=e[2]*x+e[6]*y+e[10]*z+e[14];}
    for(const tile of mesh.tiles){
      if(tile.water)continue;
      const center=this._toView(tile.x+tile.size*.5,(tile.minY+tile.maxY)*.5,tile.z+tile.size*.5),radius=Math.hypot(tile.size*.71,(tile.maxY-tile.minY)*.5),depth=-center[2];
      if(depth+radius<.6||depth-radius>this._visibilityFar*1.1||Math.abs(center[0])>(depth+radius)*this.width/(2*this._focal)+radius||Math.abs(center[1])>(depth+radius)*this.height/(2*this._focal)+radius)continue;
      const indices=tile.indices;for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;this._triangleXYZ(view[a],view[a+1],view[a+2],view[b],view[b+1],view[b+2],view[c],view[c+1],view[c+2],tile.color,1,false,false,true);}
    }
  }
  _runways(){
    const asphalt=rgb('#69736b'),paint=rgb('#ebe5ce'),shoulder=rgb(this.mission.biome==='desert'?'#c4a97f':'#8b9c79'),navy=rgb('#586d75');
    for(const r of this.mission.runways||[]){
      const distance=Math.hypot(this.camera.position.x-r.x,this.camera.position.z-r.z);if(distance>14000||this._terrainHides(r.x,n(r.y,12)+12,r.z))continue;const h=n(r.heading),w=n(r.width,60),l=n(r.length,1000),y=n(r.y,12),c=Math.cos(h),s=Math.sin(h);
      const place=(x,z)=>[r.x+x*c+z*s,r.z+z*c-x*s];
      this._layer=1;
      if(r.carrier){this._box(r.x,y-7.5,r.z,w*.94,15,l*.95,navy,h);const [ix,iz]=place(w*.38,-l*.12);this._box(ix,y+7,iz,w*.22,14,l*.18,rgb('#8c9b9c'),h);}
      else this._surface(r.x,y-.15,r.z,w+105,l+100,shoulder,h);
      this._layer=2;this._surface(r.x,y+.08,r.z,w,l,asphalt,h);this._layer=3;
      for(const side of[-1,1]){const [x,z]=place(side*w*.45,0);this._surface(x,y+.15,z,.7,l*.94,paint,h);}
      if(distance<6500){
        for(let zz=-l*.4;zz<l*.42;zz+=r.carrier?23:55){const [x,z]=place(0,zz);this._surface(x,y+.22,z,1.3,r.carrier?10:24,paint,h);}
        for(const end of[-1,1])for(let i=-3;i<=3;i++){const [x,z]=place(i*w*.087,end*l*.46);this._surface(x,y+.23,z,w*.045,r.carrier?7:24,paint,h);}
        this._layer=4;
        if(!r.carrier){for(let i=0;i<3;i++){const [x,z]=place(w*1.65,-l*.28+i*68);this._box(x,y+9,z,47,18,44,rgb('#9ca28a'),h);this._box(x,y+19,z,49,3,46,rgb('#6b7d70'),h);}}
        else if(this.mission.aircraft==='harrier'){const a=place(-w*.38,l*.36),b=place(-w*.38,l*.5),cc=place(w*.23,l*.5),d=place(w*.23,l*.36);this._worldQuad([a[0],y+.1,a[1]],[b[0],y+4.5,b[1]],[cc[0],y+4.5,cc[1]],[d[0],y+.1,d[1]],asphalt,1,true);}
      }
    }
    this._layer=0;
  }
  _terrainHides(x,y,z,radius=0){
    const eye=this.camera.position,dx=x-eye.x,dz=z-eye.z,distance=Math.hypot(dx,dz);if(distance<650)return false;
    const count=clamp(Math.ceil(distance/450),4,24);
    for(let i=1;i<count;i++){const t=i/count;if(height(eye.x+dx*t,eye.z+dz*t,this.mission)>eye.y+(y+radius-eye.y)*t+8)return true;}
    return false;
  }
  _aircraft(model,pose,dt,full=true,enemy=false){
    if(full){
      setAircraftPose(model,pose);if(pose.onGround)model.position.y-=1.3;animateAircraft(model,pose,dt,this.time);model.updateMatrixWorld(true);
      model.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.visible)return;let ancestor=mesh.parent;while(ancestor&&ancestor!==model){if(!ancestor.visible)return;ancestor=ancestor.parent;}
        const geometry=mesh.geometry,material=mesh.material;if(!geometry||!material||Array.isArray(material))return;const position=geometry.attributes.position;
        let buffer=vertexBuffers.get(mesh);if(!buffer||buffer.length!==position.count*3){buffer=new Float32Array(position.count*3);vertexBuffers.set(mesh,buffer);}
        MV.multiplyMatrices(this.camera.matrixWorldInverse,mesh.matrixWorld);const e=MV.elements,p=position.array;
        for(let i=0;i<position.count;i++){const k=i*3,x=p[k],y=p[k+1],z=p[k+2];buffer[k]=e[0]*x+e[4]*y+e[8]*z+e[12];buffer[k+1]=e[1]*x+e[5]*y+e[9]*z+e[13];buffer[k+2]=e[2]*x+e[6]*y+e[10]*z+e[14];}
        if(!materials.has(material)){const c=material.color?.clone()||new THREE.Color('#c8c3a2');c.convertLinearToSRGB();materials.set(material,[c.r*255,c.g*255,c.b*255]);}
        const base=materials.get(material),index=geometry.index?.array,total=index?index.length:position.count;for(let j=0;j<total;j+=3){const ia=(index?index[j]:j)*3,ib=(index?index[j+1]:j+1)*3,ic=(index?index[j+2]:j+2)*3;this._triangleXYZ(buffer[ia],buffer[ia+1],buffer[ia+2],buffer[ib],buffer[ib+1],buffer[ib+2],buffer[ic],buffer[ic+1],buffer[ic+2],base,n(material.opacity,1),material.side===THREE.DoubleSide,material.isMeshBasicMaterial);}
      });
    }else{
      const q=orientationOf(pose);Q.set(q.x,q.y,q.z,q.w);M.compose(V.set(pose.x,pose.y,pose.z),Q,S);MV.multiplyMatrices(this.camera.matrixWorldInverse,M);const e=MV.elements;
      const base=rgb(enemy?'#8c7964':'#a8b5a8');for(const tri of simpleModel(pose.aircraft||this.aircraft)){const transformed=[];for(let k=0;k<9;k+=3){const x=tri.p[k],y=tri.p[k+1],z=tri.p[k+2];transformed.push([e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]]);}this._triangle(...transformed,base.map(v=>v*tri.shade),1,true);}
    }
  }
  _entities(sim,dt,remote){
    for(const p of sim.enemies||[])if(p.alive!==false&&p.active!==false&&n(p.health,1)>0&&!this._terrainHides(p.x,p.y,p.z,7))this._aircraft(null,p,dt,false,!p.friendly);
    for(const other of remote||[]){const p=other.pose||other.player||other;if(Number.isFinite(p.x)&&n(p.health,1)>0&&!this._terrainHides(p.x,p.y,p.z,7))this._aircraft(null,p,dt,false,false);}
    for(const t of sim.targets||[]){
      if(t.alive===false||t.active===false||n(t.health,1)<=0)continue;const x=n(t.x),z=n(t.z),y=n(t.y,this._height(x,z)),base=rgb(t.friendly?'#72988c':'#8a8d69');if(this._terrainHides(x,y+15,z))continue;
      if(t.type==='balloon'){this._disc(x,y,z,22,'#b8ae89',1,.7);this._box(x,y-27,z,6,5,6,rgb('#7f674f'));this._line([x,y-10,z],[x,y-27,z],'#6e7060',1);}
      else if(t.type==='dropzone'){this._surface(x,y+.8,z,n(t.radius,600)*1.5,n(t.radius,600)*1.5,rgb('#b9c99a'),0,.25);this._surface(x,y+1,z,200,20,rgb('#ede5ba'));this._surface(x,y+1,z-70,20,140,rgb('#ede5ba'));}
      else if(t.type==='city'){continue;}
      else if(t.type==='depot'||t.type==='practice'){this._box(x,y+10,z,48,20,40,base);this._box(x,y+22,z,51,4,43,rgb('#b1ad87'));}
      else if(t.type==='sam'||t.type==='flak'){this._box(x,y+3,z,9,5,12,base);for(const xx of[-2,0,2])this._line([x+xx,y+5,z],[x+xx,y+14,z+6],'#c5c5a5',3);}
      else{this._box(x,y+2.5,z,6,5,12,base);this._box(x,y+5,z+3.5,6,3,4,rgb('#a9a78a'));}
    }
    for(const b of this._city)if(!this._terrainHides(b.x,b.y+b.h*.75,b.z))this._box(b.x,b.y+b.h*.5,b.z,b.w,b.h,b.d,rgb('#667887'));
  }
  _environment(){
    const wind=this.mission.weather?.wind||{};for(const cloud of this._clouds){const dx=Math.sin(this.time*.0003)*n(wind.x,3)*1800,dz=Math.sin(this.time*.0003)*n(wind.z)*1800;this._disc(cloud.x+dx,cloud.y,cloud.z+dz,cloud.r,this._night?'#8596a6':this._sunset?'#eee5d0':'#e7ecdf',.59,.4);}
    for(const s of this._scenery){if(Math.hypot(this.camera.position.x-s.x,this.camera.position.z-s.z)>6500)continue;if(s.kind==='house'){this._box(s.x,s.y+9,s.z,22,18,30,rgb('#a6a68d'));}else{const base=rgb(this.mission.biome==='desert'?'#ab9272':'#4b7057');const r=s.size*.3;this._worldTri([s.x-r,s.y,s.z],[s.x,s.y+s.size,s.z],[s.x+r,s.y,s.z],base,1,true);this._worldTri([s.x,s.y,s.z-r],[s.x,s.y+s.size,s.z],[s.x,s.y,s.z+r],base,1,true);}}
  }
  _waypoints(sim){
    if(this.settings.guidance==='minimal'||this.settings.gates===false)return;const index=n(sim.waypointIndex),wps=this.mission.waypoints||[],limit=this.settings.guidance==='standard'?1:2;
    for(let i=index;i<Math.min(wps.length,index+limit);i++){
      const wp=wps[i],prev=i?wps[i-1]:(this.mission.start||{x:0,y:0,z:wp.z-100});const normal=new THREE.Vector3(wp.x-n(prev.x),wp.y-n(prev.y),wp.z-n(prev.z)).normalize();const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal).normalize();if(right.lengthSq()<.01)right.set(1,0,0);const up=new THREE.Vector3().crossVectors(normal,right).normalize();const r=clamp(n(wp.radius,180),55,700);let last=null;
      for(let k=0;k<=32;k++){const a=k/32*TAU,p=[wp.x+(right.x*Math.cos(a)+up.x*Math.sin(a))*r,wp.y+(right.y*Math.cos(a)+up.y*Math.sin(a))*r,wp.z+(right.z*Math.cos(a)+up.z*Math.sin(a))*r];if(last)this._line(last,p,i===index?'#e9bb72':'#d1dfc5',i===index?2:1,i===index?.85:.3);last=p;}
    }
  }
  _effects(sim){
    for(const p of sim.projectiles||[]){if(p.life<=0)continue;const missile=p.type==='missile',bomb=p.type==='bomb';if(!bomb)this._line([p.x,p.y,p.z],[p.x-n(p.vx)*(missile?.16:.035),p.y-n(p.vy)*(missile?.16:.035),p.z-n(p.vz)*(missile?.16:.035)],missile?'#ffd894':'#ffe2a5',missile?2.5:1.5,.9);else this._disc(p.x,p.y,p.z,1.1,'#535c54');}
    for(const e of sim.effects||[]){const t=clamp(n(e.age)/Math.max(.1,n(e.life,2)),0,1);if(t>=1)continue;const flash=e.type==='flash';this._disc(e.x,e.y,e.z,n(e.radius,15)*(1+t*1.2),e.type==='smoke'?'#7b857d':flash?'#fff1cc':t>.6?'#8a8975':'#efb46c',(1-t)*(this.settings.reducedMotion?.3:.66));}
    for(const p of sim.paratroopers||[]){if(p.landed||p.life<=0)continue;this._disc(p.x,p.y+4,p.z,4.5,'#e8e2c6',1,.55);this._line([p.x-3,p.y+4,p.z],[p.x,p.y,p.z],'#c8cbb2',1);this._line([p.x+3,p.y+4,p.z],[p.x,p.y,p.z],'#c8cbb2',1);this._disc(p.x,p.y,p.z,.9,'#5b6b51',1,1.4);}
  }
  _paint(){
    const ctx=this.ctx;this._queue.sort((a,b)=>(a.layer||0)-(b.layer||0)||b.depth-a.depth);
    let triangles=0;for(const item of this._queue){ctx.globalAlpha=item.alpha??1;
      if(item.type==='triangle'){ctx.fillStyle=item.fill;ctx.beginPath();ctx.moveTo(item.points[0],item.points[1]);for(let i=2;i<item.points.length;i+=2)ctx.lineTo(item.points[i],item.points[i+1]);ctx.closePath();ctx.fill();
        // Canvas antialiases each adjacent fill separately. Cover the shared
        // ground edges with the same color, in physical pixels, so sky cannot
        // leak through them. Aircraft and translucent surfaces keep exact edges.
        if(item.coverEdges&&item.alpha===1){ctx.strokeStyle=item.fill;ctx.lineWidth=1.25/this.pixelRatio;ctx.lineJoin='round';ctx.stroke();}
        triangles++;}
      else if(item.type==='line'){ctx.strokeStyle=item.stroke;ctx.lineWidth=item.width;ctx.beginPath();ctx.moveTo(item.points[0],item.points[1]);ctx.lineTo(item.points[2],item.points[3]);ctx.stroke();}
      else{ctx.fillStyle=item.fill;ctx.beginPath();ctx.ellipse(item.x,item.y,item.r,item.r*item.ratio,0,0,TAU);ctx.fill();}
    }
    ctx.globalAlpha=1;this.stats.triangles+=triangles;this.stats.drawCalls+=this._queue.length;this._queue.length=0;
  }
  _cockpit(p){
    const ctx=this.ctx;ctx.save();ctx.strokeStyle='#6f817b';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(this.width*.5,this.height*.55,this.width*.43,this.height*.47,0,Math.PI,TAU);ctx.stroke();ctx.fillStyle='#27393b';ctx.beginPath();ctx.moveTo(0,this.height);ctx.lineTo(this.width*.09,this.height*.84);ctx.quadraticCurveTo(this.width*.5,this.height*.75,this.width*.91,this.height*.84);ctx.lineTo(this.width,this.height);ctx.fill();
    const radius=clamp(this.width*.043,17,40),cy=this.height*.9;
    for(let i=0;i<3;i++){const cx=this.width*.5+(i-1)*radius*2.7;ctx.fillStyle='#c8c8ae';ctx.beginPath();ctx.arc(cx,cy,radius,0,TAU);ctx.fill();ctx.fillStyle='#203438';ctx.beginPath();ctx.arc(cx,cy,radius*.89,0,TAU);ctx.fill();ctx.strokeStyle='#c9d0b8';ctx.lineWidth=1;for(let k=0;k<10;k++){const a=k/10*TAU;ctx.beginPath();ctx.moveTo(cx+Math.sin(a)*radius*.7,cy+Math.cos(a)*radius*.7);ctx.lineTo(cx+Math.sin(a)*radius*.83,cy+Math.cos(a)*radius*.83);ctx.stroke();}const a=(i===0?n(p.speed)*.018:i===1?n(p.y)*.004:n(p.fuel,100)*.05)-Math.PI;ctx.strokeStyle='#eeb46a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(a)*radius*.7,cy+Math.cos(a)*radius*.7);ctx.stroke();}
    ctx.restore();
  }
  _camera(p,dt,options){
    const mode=options.camera||'chase',lookX=n(options.lookX),lookY=clamp(n(options.lookY),-1.15,1.15),originY=p.y-(p.onGround?1.3:0);
    const orientation=orientationOf(p),{heading,pitch}=deriveEuler(orientation),{forward}=basis(orientation),f=[forward.x,forward.y,forward.z],length=this._planeMeta?.length||9;
    let pos,target,up={x:0,y:1,z:0};
    if(mode==='cockpit'){const view=cockpitView(p,options,p.onGround?1.3:0);pos=[view.position.x,view.position.y,view.position.z];target=[view.target.x,view.target.y,view.target.z];up=view.up;}
    else{const distance=clamp(length*2.35+n(p.speed)*.055,23,84),angle=heading+lookX+(mode==='cinematic'?.68:0),elev=clamp(length*.4+n(p.speed)*.012,5.4,20)+Math.sin(lookY)*distance;pos=[p.x-Math.sin(angle)*distance*Math.cos(lookY),originY+elev-pitch*distance*.24,p.z-Math.cos(angle)*distance*Math.cos(lookY)];const ahead=Math.abs(lookX)>.05||Math.abs(lookY)>.05||mode==='cinematic'?length*.2:95;target=[p.x+f[0]*ahead,originY+f[1]*ahead+length*.18,p.z+f[2]*ahead];}
    const reset=!this._cameraReady||this._cameraMode!==mode,cockpit=mode==='cockpit';
    const t=reset||cockpit?1:1-Math.exp(-dt*(this.settings.reducedMotion?12:mode==='cinematic'?3.2:10));
    // Track interpolated translation exactly and damp only the orbit around the
    // aircraft. World-position lag made chase distance depend on speed/FPS.
    this._cameraOffset.lerp(V.set(pos[0]-p.x,pos[1]-p.y,pos[2]-p.z),t);
    this._cameraLookOffset.lerp(D.set(target[0]-p.x,target[1]-p.y,target[2]-p.z),t);
    V.set(p.x,p.y,p.z);this.camera.position.copy(this._cameraOffset).add(V);this._cameraTarget.copy(this._cameraLookOffset).add(V);
    if(!cockpit)this.camera.position.y=Math.max(height(this.camera.position.x,this.camera.position.z,this.mission)+3.4,this.camera.position.y);
    this.camera.up.set(up.x,up.y,up.z);
    this.camera.lookAt(this._cameraTarget);this._cameraReady=true;this._cameraMode=mode;this._view();
  }
  _weather(p){let factor=1;if(p.y>this._cloudBase-55&&p.y<this._cloudTop+55){const inside=Math.min(clamp((p.y-this._cloudBase+55)/130,0,1),clamp((this._cloudTop+55-p.y)/130,0,1));factor=1-inside*.92;}this._visibilityFar=mix(850,this._fogFar,factor);}
  render(sim,dt=1/60,options={}){
    if(!sim?.player||!this._plane)return;dt=clamp(n(dt,1/60),0,.1);this.time+=dt;this._queue.length=0;this._poolIndex=0;this.stats.triangles=this.stats.drawCalls=0;this._camera(sim.player,dt,options);this._weather(sim.player);this._background();
    this._terrain(sim.player);this._paint();this._runways();this._paint();
    this._environment();this._entities(sim,dt,options.remotePlayers||[]);this._waypoints(sim);this._effects(sim);if(options.camera!=='cockpit')this._aircraft(this._plane,sim.player,dt,true);this._paint();if(options.camera==='cockpit')this._cockpit(sim.player);this.stats.fps=mix(this.stats.fps,dt?1/dt:60,.03);
  }
  renderMenu(time=0,aircraft={id:'avro504'}){
    const profile=typeof aircraft==='string'?{id:aircraft}:aircraft,key=JSON.stringify([profile.id,profile.color]);
    if(this._mode!=='menu'||this._menuKey!==key){this.loadMission({id:'skyward-menu',biome:'countryside',aircraft:profile.id||'avro504',weather:{wind:{x:4,z:0},cloudBase:980,cloudTop:1400,timeOfDay:'sunset',fog:.000025},runways:[{x:-1700,z:3600,y:12,length:1100,width:44,heading:.45}],waypoints:[],targets:[],start:{x:0,y:420,z:0,airborne:true}},profile);this._mode='menu';this._menuKey=key;}
    const seconds=n(time),dt=clamp(seconds-n(this._lastMenuTime,seconds-1/60),.001,.06);this._lastMenuTime=seconds;this.time=seconds;const motion=this.settings.reducedMotion?0:1;
    const p={x:70*Math.sin(seconds*.012)*motion,y:440+Math.sin(seconds*.31)*1.5*motion,z:Math.sin(seconds*.008)*1600*motion,heading:-.32,pitch:.025+Math.sin(seconds*.22)*.01*motion,roll:.04+Math.sin(seconds*.27)*.025*motion,throttle:.62,engine:true,gear:/avro|camel/.test(this._planeMeta.kind)};
    const span=this._planeMeta.span||11,distance=Math.max(23,span*2.7),portrait=this.width<this.height;this.camera.fov=portrait?53:46;this.camera.updateProjectionMatrix();this.camera.position.set(p.x+distance*.68,p.y+distance*.23,p.z+distance*.72);const shift=portrait?0:span*.76;this.camera.up.set(0,1,0);this.camera.lookAt(p.x-.727*shift,p.y+(portrait?-span*.48:span*.05),p.z+.687*shift);this._view();this._visibilityFar=19000;this._queue.length=0;this._poolIndex=0;this.stats.triangles=this.stats.drawCalls=0;this._background();this._terrain(p);this._paint();this._runways();this._paint();this._environment();this._aircraft(this._plane,p,dt,true);this._paint();
  }
  project(x,y,z){this.camera.updateMatrixWorld(true);const p=V.set(x,y,z).project(this.camera);return{x:(p.x*.5+.5)*this.width,y:(-.5*p.y+.5)*this.height,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.12&&Math.abs(p.y)<1.12,depth:p.z};}
  dispose(){this._queue=[];this._drawPool=[];this._terrainMesh=null;this._terrainCache.clear();this._plane=null;}
}
