import {drawArchitecture} from './architecture.js';
import {drawStreetProp} from './street-models.js';
import {solidBuildings} from './spatial.js';
import {drawBostonWorld} from './boston.js';
import {terrainHeight,groundHeight,speedBumps,vehicleSurface} from './terrain.js';
import {ROADS,clamp,random,safeCamera,safeFootCamera,signalAt,onDiagonal} from './engine.js';
import {createAtlas,ATLAS} from './textures.js';
import {drawBaycrestLandmarks,drawBaycrestHorizon} from './baycrest-landmarks.js';
import {drawLandmarks} from './landmarks.js';
import {drawCar,drawPerson,drawVehicleFire} from './models.js';
const FOG=[.65,.66,.63],STRIDE=9;
const rgb=c=>typeof c==='string'?[parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255]:c;
export class Mesh{
 constructor(){this.v=[];this.transform=null;this.material=0;}
 tri(a,b,c,color,shade=1,uv=[[.5,.5],[.5,.5],[.5,.5]]){
  const pts=[a,b,c].map(p=>{const t=this.transform;let q=p;if(t){const roll=t.roll||0,pitch=t.pitch||0,x=p[0]*Math.cos(roll)-p[1]*Math.sin(roll),y=p[0]*Math.sin(roll)+p[1]*Math.cos(roll),Y=y*Math.cos(pitch)+p[2]*Math.sin(pitch),z=p[2]*Math.cos(pitch)-y*Math.sin(pitch);q=[t.x+x*t.c+z*t.s,Y+(t.y||0),t.z+z*t.c-x*t.s];}return this.heightSampler?[q[0],q[1]+this.heightSampler(q[0],q[2]),q[2]]:q;});
  const A=pts[0],B=pts[1],C=pts[2],u=B.map((v,i)=>v-A[i]),v=C.map((v,i)=>v-A[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;
  const light=.66+.25*Math.abs(n[1]/len)+.1*Math.abs(n[0]/len),col=rgb(color).map(v=>v*shade*light);
  for(let j=0;j<3;j++)this.v.push(...pts[j],...col,...uv[j],this.material);
 }
 quad(a,b,c,d,color,shade=1,uv=[[0,0],[1,0],[1,1],[0,1]]){this.tri(a,b,c,color,shade,[uv[0],uv[1],uv[2]]);this.tri(a,c,d,color,shade,[uv[0],uv[2],uv[3]]);}
 surface(a,b,c,d,slot,u=1,v=1,color='#ffffff'){const old=this.material;this.material=slot;this.quad(a,b,c,d,color,1,[[0,v],[u,v],[u,0],[0,0]]);this.material=old;}
 box(x,y,z,w,h,d,col){let X=x-w/2,Z=z-d/2,xx=x+w/2,zz=z+d/2,Y=y+h;this.quad([X,y,Z],[xx,y,Z],[xx,Y,Z],[X,Y,Z],col);this.quad([xx,y,zz],[X,y,zz],[X,Y,zz],[xx,Y,zz],col);this.quad([X,y,zz],[X,y,Z],[X,Y,Z],[X,Y,zz],col);this.quad([xx,y,Z],[xx,y,zz],[xx,Y,zz],[xx,Y,Z],col);this.quad([X,Y,Z],[xx,Y,Z],[xx,Y,zz],[X,Y,zz],col);}
 flat(x,z,w,d,col,y=.025){this.quad([x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],col);}
 disc(x,y,z,r,col,n=20){for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;this.tri([x,y,z],[x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],col);}}
 ring(x,y,z,r,col){for(let i=0;i<48;i++){const a=i/24*Math.PI,b=(i+1)/24*Math.PI;this.quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*(r-.22),y,z+Math.sin(b)*(r-.22)],[x+Math.cos(a)*(r-.22),y,z+Math.sin(a)*(r-.22)],col);}}
 tube(a,b,r,col,n=6){const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d)||1,f=d.map(v=>v/length),tmp=Math.abs(f[1])<.95?[0,1,0]:[1,0,0],right=[f[1]*tmp[2]-f[2]*tmp[1],f[2]*tmp[0]-f[0]*tmp[2],f[0]*tmp[1]-f[1]*tmp[0]],l=Math.hypot(...right);for(let i=0;i<3;i++)right[i]/=l;const up=[f[1]*right[2]-f[2]*right[1],f[2]*right[0]-f[0]*right[2],f[0]*right[1]-f[1]*right[0]],p=(v,t)=>v.map((c,j)=>c+r*(Math.cos(t)*right[j]+Math.sin(t)*up[j]));for(let i=0;i<n;i++){const t=i/n*Math.PI*2,T=(i+1)/n*Math.PI*2;this.quad(p(a,t),p(a,T),p(b,T),p(b,t),col);}}
}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function lookAt(e,t){let z=e.map((v,i)=>v-t[i]),len=Math.hypot(...z)||1;z=z.map(v=>v/len);let x=[z[2],0,-z[0]],l=Math.hypot(...x)||1;x=x.map(v=>v/l);const y=[z[1]*x[2],z[2]*x[0]-z[0]*x[2],-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*e[i],0),-y.reduce((s,v,i)=>s+v*e[i],0),-z.reduce((s,v,i)=>s+v*e[i],0),1]);}
export class Renderer{
 constructor(canvas,city){
  this.canvas=canvas;this.city=city;this.atlas=createAtlas();this.cam=[0,5,190];this.target=[5,1,164];this.mode=0;this.frames=0;this.lastActor=null;this.particles=[];this.hitSerial=new WeakMap();this.smokeClock=0;
  this.gl=canvas.getContext('webgl',{alpha:true,antialias:false,powerPreference:'high-performance'});this.software=!this.gl;
  const world=this.makeWorld(city).v;
  if(this.software){this.ctx=canvas.getContext('2d',{alpha:true});this.static={v:world};return;}
  const gl=this.gl;
  const vs=`attribute vec3 aPosition;attribute vec3 aColor;attribute vec2 aUV;attribute float aTile;uniform mat4 uMatrix;uniform vec3 uEye;varying vec3 vColor;varying vec2 vUV;varying float vTile;varying float vDistance;void main(){vColor=aColor;vUV=aUV;vTile=aTile;vDistance=distance(uEye,aPosition);gl_Position=uMatrix*vec4(aPosition,1.0);}`;
  const fs=`precision highp float;uniform sampler2D uAtlas;varying vec3 vColor;varying vec2 vUV;varying float vTile;varying float vDistance;void main(){float tile=floor(vTile+.5);vec2 base=vec2(mod(tile,4.0),floor(tile/4.0));vec2 uv=(base*256.0+1.5+fract(vUV)*253.0)/1024.0;vec4 texel=texture2D(uAtlas,uv);if(texel.a<.01)discard;vec3 color=texel.rgb*vColor;float fog=smoothstep(65.0,240.0,1.0/gl_FragCoord.w);color=mix(color,vec3(.65,.66,.63),fog*.96);gl_FragColor=vec4(color,texel.a);}`;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Graphics shader: '+gl.getShaderInfoLog(s));return s;};this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  this.attributes=[['aPosition',3,0],['aColor',3,12],['aUV',2,24],['aTile',1,32]].map(([name,size,offset])=>({location:gl.getAttribLocation(this.program,name),size,offset}));this.matrix=gl.getUniformLocation(this.program,'uMatrix');this.eye=gl.getUniformLocation(this.program,'uEye');
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.atlas.canvas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);gl.uniform1i(gl.getUniformLocation(this.program,'uAtlas'),0);
  gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);this.static=this.upload(world);this.dynamic=gl.createBuffer();
 }
 upload(v){const g=this.gl,b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array(v),g.STATIC_DRAW);return{buffer:b,count:v.length/STRIDE};}
 setCity(city){this.city=city;const world=this.makeWorld(city).v;if(this.gl){this.gl.deleteBuffer(this.static.buffer);this.static=this.upload(world);}else this.static={v:world};this.particles=[];this.hitSerial=new WeakMap();this.lastActor=null;this.explosionSerialSeen=0;this.propSerialSeen=0;}
 makeWorld(city){
  if(city.id==='boston')return drawBostonWorld(new Mesh(),city);
  const height=(x,z)=>terrainHeight(x,z,city.id),bay=city.id==='baycrest';const m=new Mesh();m.heightSampler=height;const rnd=random(813),pavement=(x,z,w,d,y=.16)=>m.surface([x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],2,w/3,d/3);
  // One road plane removes coplanar intersection flicker.
  const step=bay?6:8;for(let x=-240;x<240;x+=step)for(let z=-240;z<240;z+=step)m.surface([x,-.03,z],[x+step,-.03,z],[x+step,-.03,z+step],[x,-.03,z+step],1,step/2.5,step/2.5);
  // Finer mesh across narrow speed humps preserves wheel/contact and visible surface agreement.
  for(const b of speedBumps(city.id))for(let z=b.z-b.d/2;z<b.z+b.d/2-.01;z+=.2){for(let x=b.x-b.w/2;x<b.x+b.w/2;x+=1)m.surface([x,-.017,z],[x+1,-.017,z],[x+1,-.017,z+.2],[x,-.017,z+.2],1,.4,.08);
   for(let x=b.x-b.w/2+.7;x<b.x+b.w/2;x+=2)m.flat(x,z+.1,.85,.18,'#bbb079',-.008);
  }
  m.heightSampler=null;m.flat(650,0,820,1400,bay?'#667e87':'#77858a',bay?-2:-.12);if(bay){m.flat(0,-650,1300,820,'#667e87',-2);drawBaycrestHorizon(m);}m.heightSampler=height;
  for(let ix=0;ix<6;ix++)for(let iz=0;iz<6;iz++){
   const x=ROADS[ix]+36,z=ROADS[iz]+36,square=[[x-24.5,z-24.5],[x+24.5,z-24.5],[x+24.5,z+24.5],[x-24.5,z+24.5]];
   if(bay||!((x===-108&&z===108)||(x===-36&&z===180))){if(!bay)m.box(x,0,z,49,.15,49,'#9c9a8d');if(bay){for(let a=-24.5;a<24.5;a+=7)for(let b=-24.5;b<24.5;b+=7)pavement(x+a+3.5,z+b+3.5,7,7);}else pavement(x,z,49,49);continue;}
   for(const side of[-1,1]){const poly=[],f=p=>side*(p[1]-p[0]-216)-11.3;
    for(let i=0;i<4;i++){const a=square[i],b=square[(i+1)%4],fa=f(a),fb=f(b);if(fa>=0)poly.push(a);if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);poly.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
    m.material=2;for(let i=1;i<poly.length-1;i++){const tri=[poly[0],poly[i],poly[i+1]];m.tri(...tri.map(p=>[p[0],.16,p[1]]),'#ffffff',1,tri.map(p=>[p[0]/3,p[1]/3]));}m.material=0;
    for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];m.quad([a[0],0,a[1]],[b[0],0,b[1]],[b[0],.16,b[1]],[a[0],.16,a[1]],'#9c9a8d');}
   }
  }
  if(!bay){m.transform={x:-144,z:72,c:Math.SQRT1_2,s:Math.SQRT1_2};for(let q=12;q<198;q+=9)for(const x of[-.2,.2])m.flat(x,q,.1,4,'#c9b575',.008);m.transform=null;}
  if(bay)drawBaycrestLandmarks(m,city.features||[]);else drawLandmarks(m,city.features||[]);
  for(const r of ROADS)for(let v=-232;v<233;v+=9){if(ROADS.some(k=>Math.abs(k-v)<15))continue;for(const offset of[-.24,.24]){m.flat(r+offset,v,.10,4,'#c9b575',.065);m.flat(v,r+offset,4,.10,'#c9b575',.066);}}
  for(const x of ROADS)for(const z of ROADS)for(let q=-8;q<9;q+=2.5){m.flat(x+q,z+10.1,1.1,2,'#c8c5b0',.072);m.flat(x+10.1,z+q,2,1.1,'#c8c5b0',.073);}
  city.buildings.forEach((b,index)=>{if(!b.landmark)drawArchitecture(m,b,{mapId:city.id,index});});
  // Traffic-signal gantries remain fixed; street lamps and furniture are simulated.
  for(const light of city.signals||[])for(const a of[0,Math.PI/2,Math.PI,-Math.PI/2]){
   m.transform={x:light.x,z:light.z,c:Math.cos(a),s:Math.sin(a)};m.tube([10.5,.1,-12],[10.5,5.6,-12],.08,'#707a72');m.tube([10.5,5.6,-12],[5.4,5.6,-12],.07,'#707a72');m.box(5.4,4.55,-12,.36,.95,.3,'#303b36');
  }m.transform=null;
  for(let z=-220;z<240;z+=18){m.tube([234,0,z],[234,1.2,z],.07,'#8c9384');m.tube([234,.85,z],[234,.85,z+18],.045,'#969a89');}
  for(const x of[-156,-132])for(const z of[-195,-165]){m.box(x,0,z,.4,7.9,.4,'#545c54');m.tube([x,1,z],[x+(x===-156?24:-24),7.8,z],.09,'#737a68');}
  m.box(-144,8,-180,29,.45,35,'#586057');for(const x of[-155,-133])m.box(x,8.5,-180,.2,.9,35,'#778071');
  for(let i=0;i<10;i++){let x=-270+i*60,z=-270,h=20+rnd()*45;m.box(x,-1,z,24,h,25,'#92998f');m.box(x,h-1,z,18,3,18,'#91988e');}
  for(const p of city.palms){m.tube([p.x,0,p.z],[p.x+.35,p.h,p.z+.2],.13,'#8e8468',7);for(let k=0;k<8;k++){const a=k*Math.PI/4,ex=p.x+Math.sin(a)*3,ez=p.z+Math.cos(a)*3;m.tri([p.x,p.h,p.z],[ex,p.h-1.3,ez],[p.x+Math.cos(a)*.55,p.h-.1,p.z-Math.sin(a)*.55],'#4e6751');}}
  if(bay){
   for(const x of[-.8,.8])for(let z=-214;z<216;z+=4)m.flat(x,z,.09,4,'#acb1a5',.078);
   for(let z=-232;z<233;z+=8){m.heightSampler=null;const h=height(237,z);m.box(238,-2,z,4,h+2,8,'#7a8984');}m.heightSampler=height;
  }
  return m;
 }
 drawBuffer(buffer,count){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,buffer);for(const a of this.attributes){g.enableVertexAttribArray(a.location);g.vertexAttribPointer(a.location,a.size,g.FLOAT,false,36,a.offset);}g.drawArrays(g.TRIANGLES,0,count);}
 drawSoftware(vp,dynamic,w,h,transparent=[]){
  const ctx=this.ctx;if(!this.pixels||this.pixels.width!==w||this.pixels.height!==h){this.pixels=ctx.createImageData(w,h);this.depths=new Float32Array(w*h);this.colors=new Uint32Array(this.pixels.data.buffer);}const depths=this.depths,colors=this.colors,tex=this.atlas.pixels;depths.fill(0);colors.fill(0);
  for(const vertices of[this.static.v,dynamic,transparent])for(let i=0;i<vertices.length;i+=27){
   const tile=vertices[i+8];let poly=[];
   for(let j=0;j<27;j+=9){const x=vertices[i+j],y=vertices[i+j+1],z=vertices[i+j+2];poly.push([vp[0]*x+vp[4]*y+vp[8]*z+vp[12],vp[1]*x+vp[5]*y+vp[9]*z+vp[13],vp[3]*x+vp[7]*y+vp[11]*z+vp[15],vertices[i+j+6],vertices[i+j+7]]);}
   // Clip against near plane while preserving texture coordinates.
   let clipped=[];for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],ina=a[2]>.22,inb=b[2]>.22;if(ina)clipped.push(a);if(ina!==inb){const f=(.22-a[2])/(b[2]-a[2]);clipped.push(a.map((v,k)=>v+(b[k]-v)*f));}}if(clipped.length<3)continue;
   let points=clipped.map(p=>[(p[0]/p[2]*.5+.5)*w,(-p[1]/p[2]*.5+.5)*h,1/p[2],p[3]/p[2],p[4]/p[2]]);if(points.every(p=>p[0]<0)||points.every(p=>p[0]>w)||points.every(p=>p[1]<0)||points.every(p=>p[1]>h))continue;
   const col=[vertices[i+3],vertices[i+4],vertices[i+5]],tx=(tile%4)*256,ty=Math.floor(tile/4)*256;
   for(let j=1;j<points.length-1;j++){
    let a=points[0],b=points[j],c=points[j+1],area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<.03)continue;if(area<0){[b,c]=[c,b];area=-area;}
    const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    const e0x=b[1]-c[1],e0y=c[0]-b[0],e1x=c[1]-a[1],e1y=a[0]-c[0],e2x=a[1]-b[1],e2y=b[0]-a[0];
    let row0=(c[0]-b[0])*(minY+.5-b[1])-(c[1]-b[1])*(minX+.5-b[0]),row1=(a[0]-c[0])*(minY+.5-c[1])-(a[1]-c[1])*(minX+.5-c[0]),row2=(b[0]-a[0])*(minY+.5-a[1])-(b[1]-a[1])*(minX+.5-a[0]);
    const az=a.slice(2).map(v=>v/area),bz=b.slice(2).map(v=>v/area),cz=c.slice(2).map(v=>v/area);
    for(let y=minY;y<=maxY;y++){let e0=row0,e1=row1,e2=row2,k=y*w+minX;for(let x=minX;x<=maxX;x++,k++){if(e0>=0&&e1>=0&&e2>=0){const d=e0*az[0]+e1*bz[0]+e2*cz[0];if(d>depths[k]){const U=(e0*az[1]+e1*bz[1]+e2*cz[1])/d,V=(e0*az[2]+e1*bz[2]+e2*cz[2])/d,source=tex[(ty+1+Math.floor((V-Math.floor(V))*253))*ATLAS+tx+1+Math.floor((U-Math.floor(U))*253)];const alpha=source>>>24;if(alpha<3){e0+=e0x;e1+=e1x;e2+=e2x;continue;}if(vertices!==transparent)depths[k]=d;let fog=clamp((1/d-65)/175,0,1);fog=fog*fog*(3-2*fog)*.96;const rr=((source&255)*col[0]*(1-fog)+FOG[0]*255*fog)|0,gg=(((source>>>8)&255)*col[1]*(1-fog)+FOG[1]*255*fog)|0,bb=(((source>>>16)&255)*col[2]*(1-fog)+FOG[2]*255*fog)|0;if(alpha<255){const old=colors[k]||0xffaaa9a6,a=alpha/255;colors[k]=(255<<24)|((((old>>>16&255)*(1-a)+bb*a)|0)<<16)|((((old>>>8&255)*(1-a)+gg*a)|0)<<8)|(((old&255)*(1-a)+rr*a)|0);}else colors[k]=(255<<24)|(Math.min(255,bb)<<16)|(Math.min(255,gg)<<8)|Math.min(255,rr);}}e0+=e0x;e1+=e1x;e2+=e2x;}row0+=e0y;row1+=e1y;row2+=e2y;}
   }
  }ctx.putImageData(this.pixels,0,0);
 }
 updateParticles(game,dt){
  for(const e of game.street?.events||[]){if(e.serial<=(this.propSerialSeen||0))continue;this.propSerialSeen=e.serial;if(Math.hypot(e.x-game.actor.x,e.z-game.actor.z)>70)continue;for(let i=0;i<6;i++)this.particles.push({x:e.x,y:e.y,z:e.z,vx:Math.sin(i*2.4)*2,vz:Math.cos(i*2.4)*2,vy:1+i%3,life:.3+i*.04,age:0,size:.04,spark:true});}
  const vehicles=[game.car,...game.parked,...game.traffic,...game.cops];this.smokeClock+=dt;
  for(const e of game.explosions||[]){if(e.serial<=(this.explosionSerialSeen||0))continue;this.explosionSerialSeen=e.serial;for(let i=0;i<32;i++){const a=i*2.4,v=2+i%7;this.particles.push({x:e.x,y:e.y+1,z:e.z,vx:Math.sin(a)*v,vz:Math.cos(a)*v,vy:2+i%5,life:.7+i%5*.18,age:0,size:i%3===0?.7:.23,spark:true,blast:true});}}
  for(const c of vehicles){if(Math.hypot(c.x-game.actor.x,c.z-game.actor.z)>150)continue;if(c.lastImpact&&this.hitSerial.get(c)!==c.lastImpact){this.hitSerial.set(c,c.lastImpact);const h=c.lastImpact;for(let i=0;i<Math.min(16,h.power);i++)this.particles.push({x:h.x,y:(c.y||0)+.55,z:h.z,vx:h.nx*(1+i%4)+Math.sin(i*7)*2,vz:h.nz*(1+i%4)+Math.cos(i*7)*2,vy:1.4+i%3,life:.38+i%4*.1,age:0,size:.04,spark:true});}
   if((c.fire>0||c.burnTime>0||c.damage>60||(c.panelDamage?.front||0)>35)&&this.smokeClock>.14){const f=c.panelDamage?.front||0,rate=c.damage>75?.6:.3;this.particles.push({x:c.x+Math.sin(c.a)*1.5,y:(c.y||0)+.95,z:c.z+Math.cos(c.a)*1.5,vx:.15,vz:.15,vy:.6+rate,life:2.5,age:0,size:c.damage>75?.23:.13,spark:false,dark:c.fire>0||c.exploded||c.damage>75});}
  }
  if(this.smokeClock>.14)this.smokeClock=0;
  for(const p of this.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.spark)p.vy-=dt*6;}
  this.particles=this.particles.filter(p=>p.age<p.life&&p.y>0).slice(-180);
 }
 particlesMesh(m){
  const sorted=[...this.particles].sort((a,b)=>Math.hypot(b.x-this.cam[0],b.z-this.cam[2])-Math.hypot(a.x-this.cam[0],a.z-this.cam[2]));
  for(const p of sorted){const fade=Math.sin(Math.PI*p.age/p.life),s=p.size+(p.blast?p.age*.7:p.spark?0:p.age*.24),color=p.blast?(p.age<.3?'#f4ca71':'#ce633e'):p.spark?'#e5b977':p.dark?'#61655f':'#a3a69b',dx=this.cam[0]-p.x,dz=this.cam[2]-p.z,l=Math.hypot(dx,dz)||1,rx=dz/l*s,rz=-dx/l*s,points=[[p.x-rx,p.y-s,p.z-rz],[p.x+rx,p.y-s,p.z+rz],[p.x+rx,p.y+s,p.z+rz],[p.x-rx,p.y+s,p.z-rz]];m.surface(...points,p.spark&&!p.blast?0:15,1,1,color);}
 }

 render(game,dt,attract=false,t=0,brake=false){
  const canvas=this.canvas,gl=this.gl,portrait=innerWidth<innerHeight,renderHeight=this.software?(portrait?480:360):(portrait?720:540),w=Math.floor(innerWidth/innerHeight*renderHeight),h=renderHeight;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h);}
  const c=game.actor,forward=[Math.sin(c.a),Math.cos(c.a)],speed=Math.abs(c.speed||0);let eye,target;
  if(Number.isFinite(this.orbit)){eye=[c.x+Math.sin(this.orbit)*8,3.1,c.z+Math.cos(this.orbit)*8];target=[c.x,.8,c.z];}
  else if(attract){const a=game.car.a+.65+Math.sin(t*.045)*.13;eye=[c.x-Math.sin(a)*9.5,3.6,c.z-Math.cos(a)*9.5];target=[c.x,1,c.z];}
  else{
   const a=Number.isFinite(game.viewYaw)?game.viewYaw:game.onFoot?game.walkHeading:c.a,pitch=Number.isFinite(game.viewPitch)?game.viewPitch:.28,gap=game.onFoot?5.6:this.mode===1?14:10.4;
   const radius=gap+(game.onFoot?0:speed*.035),height=game.onFoot?1.25:1.05;
   eye=[c.x-Math.sin(a)*radius*Math.cos(pitch),Math.max(.8,height+Math.sin(pitch)*radius),c.z-Math.cos(a)*radius*Math.cos(pitch)];
   const ahead=game.onFoot?.35:2.5;target=[c.x+Math.sin(a)*ahead,game.onFoot?1.25:1.05,c.z+Math.cos(a)*ahead];
  }
  const actorHeight=Number.isFinite(c.y)?c.y:groundHeight(c.x,c.z,this.city.id);eye[1]+=actorHeight;target[1]+=actorHeight;
  const cameraCars=[game.car,...game.parked,...game.traffic,...game.cops].filter(v=>v!==c);eye=safeFootCamera(c,eye,cameraCars);eye=safeCamera(c,eye,solidBuildings(this.city.buildings));eye[1]=Math.max(eye[1],groundHeight(eye[0],eye[2],this.city.id)+.65);const blend=1-Math.exp(-dt*(game.onFoot?14:9));if(this.lastActor!==c||Math.hypot(c.x-this.cam[0],c.z-this.cam[2])>60){this.cam=[...eye];this.target=[...target];this.lastActor=c;}
  for(let i=0;i<3;i++){this.cam[i]+=(eye[i]-this.cam[i])*blend;this.target[i]+=(target[i]-this.target[i])*blend;}
  this.cam=safeCamera(c,this.cam,solidBuildings(this.city.buildings));
  this.cam=safeFootCamera(c,this.cam,cameraCars);
  const vp=multiply(perspective((portrait?68:58)*Math.PI/180,w/h,.2,650),lookAt(this.cam,this.target));if(gl){gl.uniformMatrix4fv(this.matrix,false,vp);gl.uniform3fv(this.eye,this.cam);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.drawBuffer(this.static.buffer,this.static.count);}
  const m=new Mesh();for(const s of game.skids){if(s.t>25)continue;m.transform={x:s.x,y:groundHeight(s.x,s.z,this.city.id),z:s.z,c:Math.cos(s.a),s:Math.sin(s.a)};for(const x of[-.88,.88])m.flat(x,-1.6,.18,.7,'#303632',.018);}m.transform=null;
  const nearby=v=>Math.hypot(v.x-c.x,v.z-c.z)<180;
  for(const p of game.props||[]){const d=Math.hypot(p.x-c.x,p.z-c.z);if(d<115)drawStreetProp(m,p,{lod:d>36});}
  // Full detail stays near the camera; far traffic keeps its vehicle silhouette cheaply.
  const cars=[...game.traffic,...game.parked].filter(nearby).sort((a,b)=>Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z));
  for(const [index,v]of cars.entries())drawCar(m,v,{time:t,brake:v.braking,lod:index>11||Math.hypot(v.x-c.x,v.z-c.z)>45,door:game.door?.car===v?game.door:null});
  for(const p of game.cops)if(nearby(p))drawCar(m,p,{police:true,time:t,lod:Math.hypot(p.x-c.x,p.z-c.z)>70});drawCar(m,game.car,{brake,time:t,door:game.door?.car===game.car?game.door:null});
  if(game.onFoot){const pavement=!onDiagonal(c.x,c.z)&&ROADS.every(r=>Math.abs(c.x-r)>11.5)&&ROADS.every(r=>Math.abs(c.z-r)>11.5);drawPerson(m,{...game.person,ground:game.person.y??groundHeight(c.x,c.z,this.city.id)});}
  for(const p of [...(game.pedestrians||[]),...(game.officers||[])])if(Math.hypot(p.x-c.x,p.z-c.z)<75)drawPerson(m,p);
  m.heightSampler=(x,z)=>terrainHeight(x,z,this.city.id);for(const light of this.city.signals||[]){if(!nearby(light))continue;const state=signalAt(light.x,light.z,game.elapsed);
   for(let i=0;i<4;i++){const a=i*Math.PI/2,green=i%2===0?state.vertical:state.horizontal;m.transform={x:light.x,z:light.z,c:Math.cos(a),s:Math.sin(a)};
    for(let k=0;k<3;k++)m.box(5.4,4.67+k*.25,-12.16,.17,.14,.025,k===0&&green?'#96c174':k===2&&!green?'#d9654c':'#414b41');
   }
  }m.transform=null;m.heightSampler=null;
  for(const v of [game.car,...game.parked,...game.traffic,...game.cops])if(nearby(v)&&(v.fire>0||v.burnTime>0))drawVehicleFire(m,v,t);
  const targetPoint=game.target||game.waypoint;if(targetPoint&&!attract){const p=targetPoint;m.ring(p.x,groundHeight(p.x,p.z,this.city.id)+.04,p.z,8,'#c0aa65');const y=groundHeight(p.x,p.z,this.city.id)+4+Math.sin(t*2)*.16;m.tri([p.x-.7,y+1,p.z],[p.x+.7,y+1,p.z],[p.x,y,p.z],'#d5be7c');}
  if(game.elapsed<(this.lastElapsed||0)){this.particles=[];this.hitSerial=new WeakMap();this.explosionSerialSeen=0;this.propSerialSeen=0;}this.lastElapsed=game.elapsed;this.updateParticles(game,dt);const smoke=new Mesh();this.particlesMesh(smoke);
  if(this.software)this.drawSoftware(vp,m.v,w,h,smoke.v);else{gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(m.v),gl.DYNAMIC_DRAW);this.drawBuffer(this.dynamic,m.v.length/STRIDE);if(smoke.v.length){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(smoke.v),gl.DYNAMIC_DRAW);this.drawBuffer(this.dynamic,smoke.v.length/STRIDE);gl.depthMask(true);gl.disable(gl.BLEND);}}this.frames++;
 }
}
