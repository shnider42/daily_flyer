import{ROADS,clamp,random,visible}from'./engine.js';
const palette=['#79665b','#86594a','#757b72','#a29c7e','#706561','#8d806b'];
const rgb=c=>typeof c==='string'?[parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255]:c;
class Mesh{
 constructor(){this.v=[];this.transform=null;this.kind=0;}
 tri(a,b,c,col,shade=1){col=rgb(col);for(let p of[a,b,c]){if(this.transform){const t=this.transform,x=p[0],z=p[2];p=[t.x+x*t.c+z*t.s,p[1],t.z+z*t.c-x*t.s];}this.v.push(...p,col[0]*shade,col[1]*shade,col[2]*shade,this.kind);}}
 quad(a,b,c,d,col,shade=1){this.tri(a,b,c,col,shade);this.tri(a,c,d,col,shade);}
 box(x,y,z,w,h,d,col){const X=x-w/2,Y=y+h,Z=z-d/2,xx=x+w/2,zz=z+d/2;this.quad([X,y,Z],[xx,y,Z],[xx,Y,Z],[X,Y,Z],col,.72);this.quad([xx,y,zz],[X,y,zz],[X,Y,zz],[xx,Y,zz],col,.88);this.quad([X,y,zz],[X,y,Z],[X,Y,Z],[X,Y,zz],col,.64);this.quad([xx,y,Z],[xx,y,zz],[xx,Y,zz],[xx,Y,Z],col,.95);this.quad([X,Y,Z],[xx,Y,Z],[xx,Y,zz],[X,Y,zz],col,1.13);}
 flat(x,z,w,d,col,y=.025){this.quad([x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],col);}
 disc(x,y,z,r,col,n=24){for(let i=0;i<n;i++){let a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;this.tri([x,y,z],[x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],col);}}
 ring(x,y,z,r,col){for(let i=0;i<32;i++){let a=i/16*Math.PI,b=(i+1)/16*Math.PI;this.quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*(r-.6),y,z+Math.sin(b)*(r-.6)],[x+Math.cos(a)*(r-.6),y,z+Math.sin(a)*(r-.6)],col);}}
}
function multiply(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function lookAt(e,t){let z=e.map((v,i)=>v-t[i]),len=Math.hypot(...z);z=z.map(v=>v/len);let x=[z[2],0,-z[0]],l=Math.hypot(...x);x=x.map(v=>v/l);let y=[z[1]*x[2],z[2]*x[0]-z[0]*x[2],-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*e[i],0),-y.reduce((s,v,i)=>s+v*e[i],0),-z.reduce((s,v,i)=>s+v*e[i],0),1]);}
export class Renderer{
 constructor(canvas,city){
  this.city=city;this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:true,antialias:false,powerPreference:'high-performance'});this.software=!this.gl;if(this.software){this.ctx=canvas.getContext('2d',{alpha:true});this.static={v:this.makeWorld(city).v};this.cam=[0,7,190];this.target=[5,1,164];this.mode=0;this.frames=0;return;}const gl=this.gl;
  const vs=`attribute vec3 aPosition;attribute vec3 aColor;attribute float aKind;uniform mat4 uMatrix;uniform vec3 uEye;uniform vec2 uResolution;varying vec3 vColor;varying vec3 vWorld;varying float vKind;varying float vDistance;void main(){vColor=aColor;vWorld=aPosition;vKind=aKind;vDistance=distance(uEye,aPosition);vec4 clip=uMatrix*vec4(aPosition,1.0);if(clip.w>0.3){clip.xy=floor(clip.xy/clip.w*uResolution*0.5+0.5)/(uResolution*0.5)*clip.w;}gl_Position=clip;}`;
  const fs=`precision mediump float;varying vec3 vColor;varying vec3 vWorld;varying float vKind;varying float vDistance;
  float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){vec3 c=vColor;vec3 p=floor(vWorld*12.0)/12.0;float shade=1.0;
   if(vKind>0.5&&vKind<1.5){float row=floor(p.y*3.0);vec2 brick=vec2((p.x+p.z)*1.8+mod(row,2.0)*0.5,p.y*3.0);vec2 f=fract(brick);shade=0.82+noise(floor(brick))*0.26;if(f.x<0.08||f.y<0.13)shade*=0.61;}
   else if(vKind>1.5&&vKind<2.5){shade=0.78+noise(floor(p.xz*9.0))*0.3;float joint=min(fract((p.x+p.z)*.28),fract(p.y*.25));if(joint<.025)shade*=.8;}
   else if(vKind>2.5&&vKind<3.5){shade=.86+noise(floor(p.xz*6.0))*.22;}
   else if(vKind>3.5){shade=.91+noise(floor(vec2(p.x+p.z,p.y)*8.0))*.13;}
   c*=shade;float fog=smoothstep(65.0,210.0,vDistance);c=mix(c,vec3(.48,.51,.53),fog*.97);float d=mod(gl_FragCoord.x+mod(gl_FragCoord.y,2.0)*2.0,4.0)/4.0-.375;c=floor(clamp(c+d/38.0,0.0,1.0)*31.0+.5)/31.0;gl_FragColor=vec4(c,1.0);}`;
  const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);this.p=gl.getAttribLocation(this.program,'aPosition');this.c=gl.getAttribLocation(this.program,'aColor');this.k=gl.getAttribLocation(this.program,'aKind');this.resolution=gl.getUniformLocation(this.program,'uResolution');this.matrix=gl.getUniformLocation(this.program,'uMatrix');this.eye=gl.getUniformLocation(this.program,'uEye');gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  this.static=this.upload(this.makeWorld(city).v);this.dynamic=gl.createBuffer();this.cam=[0,7,190];this.target=[5,1,164];this.mode=0;this.frames=0;
 }
 upload(v){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);return{buffer:b,count:v.length/7};}
 makeWorld(city){const m=new Mesh(),rnd=random(322);m.kind=3;m.flat(0,0,1000,1000,'#696b62',-.12);m.kind=0;m.flat(650,0,820,1400,'#586e78',-.06);
  for(const r of ROADS){m.kind=2;m.flat(r,0,30,478,'#a3a093');m.flat(0,r,478,30,'#a3a093');}
  for(const r of ROADS){m.kind=3;m.flat(r,0,23,478,'#494b4b',.04);m.flat(0,r,478,23,'#494b4b',.04);}
  m.kind=0;for(const r of ROADS)for(let v=-232;v<233;v+=9){if(ROADS.some(k=>Math.abs(k-v)<15))continue;m.flat(r-.3,v,.13,4,'#b3a76e',.055);m.flat(r+.3,v,.13,4,'#b3a76e',.055);m.flat(v,r-.3,4,.13,'#b3a76e',.056);m.flat(v,r+.3,4,.13,'#b3a76e',.056);}
  for(const x of ROADS)for(const z of ROADS){for(let q=-8;q<9;q+=3){m.flat(x+q,z+10.4,1.6,2,'#bdbbad',.06);m.flat(x+10.4,z+q,2,1.6,'#bdbbad',.06);}}
  for(const b of city.buildings){
   m.kind=0;m.flat(b.x+2.2,b.z+3,b.w+5,b.d+4,'#383c39',.065);m.kind=b.style==='brick'?1:2;m.box(b.x,0,b.z,b.w,b.h,b.d,palette[b.color]);
   m.kind=2;m.box(b.x,b.h,b.z,b.w+.65,.6,b.d+.65,'#8b8c80');m.box(b.x,b.h+.6,b.z,b.w*.3,1.3,b.d*.25,'#63675e');
   m.kind=0; // Individual recessed window panes, sills and street-level shops.
   for(let h=4;h<b.h-2;h+=3.6){
    for(let dx=-b.w/2+2;dx<b.w/2-1;dx+=3.2){const col=rnd()>.82?'#aba080':'#3f4a4d';for(const sign of[-1,1]){const zz=b.z+sign*(b.d/2+.03);m.quad([b.x+dx-0.7,h,zz],[b.x+dx+.7,h,zz],[b.x+dx+.7,h+1.8,zz],[b.x+dx-.7,h+1.8,zz],col);m.box(b.x+dx,h-.12,zz,1.65,.14,.24,'#b0aa95');}}
    for(let dz=-b.d/2+2;dz<b.d/2-1;dz+=3.2){for(const sign of[-1,1]){const xx=b.x+sign*(b.w/2+.03);m.quad([xx,h,b.z+dz-.7],[xx,h,b.z+dz+.7],[xx,h+1.8,b.z+dz+.7],[xx,h+1.8,b.z+dz-.7],'#404b4d');}}
   }
   for(const sign of[-1,1]){let z=b.z+sign*(b.d/2+.05);m.box(b.x,0.1,z,2.1,2.8,.1,'#343f42');m.box(b.x+3.4,.6,z,3.5,1.9,.1,'#4b5b5b');m.box(b.x-3.4,.6,z,3.5,1.9,.1,'#465052');m.box(b.x,3,z,b.w*.85,.5,.7,b.color%2?'#5f6654':'#6f3931');}
   if(b.sign){m.box(b.x-b.w/2-.35,4.2,b.z, .65,4,1.5,b.color%2?'#354e55':'#7a3c30');for(let k=0;k<4;k++)m.box(b.x-b.w/2-.7,4.7+k*.8,b.z,.04,.4,.8,'#bcb28d');}
  }
  for(const p of city.palms){m.kind=4;m.box(p.x,0,p.z,.34,p.h,.34,'#726653');m.kind=0;for(let j=0;j<7;j++){const a=j*Math.PI*2/7,ex=p.x+Math.sin(a)*4,ez=p.z+Math.cos(a)*4;m.tri([p.x,p.h+.4,p.z],[ex,p.h-1.6,ez],[p.x+Math.cos(a)*1.2,p.h-.2,p.z-Math.sin(a)*1.2],j%2?'#3e5548':'#56674c');}}
  // Power poles, crossarms, wire runs and traffic-light silhouettes.
  for(let z=-198;z<230;z+=36)for(const x of[-14,130]){m.box(x,0,z,.28,9,.28,'#645d50');m.box(x,7.7,z,3.3,.22,.22,'#777263');m.box(x-1,8,z+18,.045,.045,36,'#343b3a');m.box(x+1,8,z+18,.045,.045,36,'#343b3a');}
  for(const x of[-144,0,144])for(const z of[-144,0,144]){m.box(x+13,0,z+13,.23,5.3,.23,'#727a72');m.box(x+11.5,5.1,z+13,3.3,.2,.2,'#70776f');m.box(x+10,4.4,z+13,.5,.9,.4,'#313a36');m.box(x+10,4.5,z+13.22,.23,.19,.03,'#768c56');}
  for(let z=-220;z<240;z+=18){m.box(234,0,z,.3,1.4,.3,'#939786');m.box(234,.8,z,.16,.12,18,'#939786');}
  // Old industrial water tower and elevated rail girders above the western avenue.
  for(const x of[-156,-132])for(const z of[-195,-165])m.box(x,0,z,.7,8.2,.7,'#535d59');
  m.box(-144,8,-180,29,.7,35,'#4b5552');for(const x of[-155,-133])m.box(x,8.7,-180,.3,1.3,35,'#626b5e');
  m.box(-185,27,-184,7,5,7,'#696957');for(const x of[-188,-182])for(const z of[-187,-181])m.box(x,20,z,.4,7,.4,'#53594e');
  return m;
 }
 car(m,c,color,police=false,brake=false,t=0){
  m.transform={x:c.x,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a)};
  m.flat(.5,.6,3.3,6.6,'#303e3c',.09);
  m.kind=4;m.box(0,.56,0,2.65,.66,5.65,color);m.box(0,1.22,1.75,2.58,.16,2.1,color);
  m.box(0,1.22,-1.93,2.58,.18,1.4,color);
  // Tapered cabin, dark glass and the long hood of a seventies coupe.
  m.quad([-1.22,1.22,.75],[1.22,1.22,.75],[.98,2.08,.12],[-.98,2.08,.12],'#4c7074',.85);
  m.quad([-1.22,1.22,-1.22],[-.98,2.08,-.85],[.98,2.08,-.85],[1.22,1.22,-1.22],'#375760');
  m.quad([-1.22,1.22,-1.22],[-1.22,1.22,.75],[-.98,2.08,.12],[-.98,2.08,-.85],'#375760',.82);
  m.quad([1.22,1.22,.75],[1.22,1.22,-1.22],[.98,2.08,-.85],[.98,2.08,.12],'#49636a');
  m.box(0,2.06,-.36,2.03,.1,c.kind==='wagon'?2.5:1.5,color);if(c.kind==='wagon')m.box(0,1.35,-1.4,2.1,.65,1.1,color);m.kind=0;
  for(const x of[-1.29,1.29]){m.box(x,1.17,-.12,.08,.12,2.4,'#ccbfa0');for(const z of[-1.76,1.75]){m.box(x,.24,z,.33,.91,.96,'#263234');m.box(x+Math.sign(x)*.17,.44,z,.04,.44,.5,'#a0a69c');}}
  m.box(0,.65,2.85,2.7,.23,.18,'#b7beb5');m.box(0,.65,-2.85,2.7,.23,.18,'#b7beb5');m.box(0,.94,2.84,1.3,.19,.05,'#26383b');
  for(const x of[-.91,.91]){m.box(x,.94,2.86,.48,.25,.06,'#ffe3a0');m.box(x,.97,-2.86,.55,.24,.06,brake?'#ff6642':'#9a3d32');}
  m.box(0,.64,-2.96,.62,.22,.03,'#efe3bd');
  if(police){m.box(0,1.3,1.9,2.4,.1,1.7,'#e3deca');m.box(0,2.18,-.35,1.6,.13,.35,'#333e43');m.box(-.5,2.3,-.35,.6,.27,.35,Math.sin(t*13)>0?'#ff574b':'#793c3b');m.box(.5,2.3,-.35,.6,.27,.35,Math.sin(t*13)<0?'#76b7ee':'#3b5c79');}
  else if(c.kind==='coupe'){for(const x of[-.56,.56])m.box(x,1.39,1.7,.3,.02,1.9,'#3d4541');}
  m.transform=null;
 }
 person(m,p){
  const step=p.speed>.1?Math.sin(p.walk)*.28:0;m.transform={x:p.x,z:p.z,c:Math.cos(p.a),s:Math.sin(p.a)};m.kind=0;m.disc(0,.085,0,.53,'#343b37',10);
  m.kind=4;m.box(0,.82,0,.66,.68,.34,'#715f4d');m.box(0,1.27,.18,.21,.22,.04,'#b3a18a');
  for(const side of[-1,1]){const swing=step*side;m.box(side*.19,.13,swing,.26,.72,.26,'#404b57');m.box(side*.19,.04,swing+.1,.29,.17,.43,'#333b3b');m.box(side*.43,.85,-swing,.2,.57,.22,'#6e5e4c');m.box(side*.43,.76,-swing,.18,.18,.2,'#ad9278');}
  m.kind=0;m.box(0,1.5,0,.37,.41,.35,'#b6a089');m.box(0,1.78,-.015,.4,.17,.37,'#4d453c');m.box(0,1.58,.19,.31,.045,.035,'#514941');m.transform=null;
 }
 drawSoftware(vp,dynamic,w,h){
  const ctx=this.ctx,faces=[];
  for(const v of[this.static.v,dynamic])for(let i=0;i<v.length;i+=21){
   const center=[(v[i]+v[i+7]+v[i+14])/3,(v[i+1]+v[i+8]+v[i+15])/3,(v[i+2]+v[i+9]+v[i+16])/3];
   const distance=Math.hypot(center[0]-this.cam[0],center[2]-this.cam[2]);
   // Giant ground and road triangles must not be culled by their centers.
   if(distance>210&&Math.abs(v[i]-v[i+7])+Math.abs(v[i+2]-v[i+9])<150)continue;
   let poly=[];for(let j=0;j<21;j+=7){const x=v[i+j],y=v[i+j+1],z=v[i+j+2];poly.push([vp[0]*x+vp[4]*y+vp[8]*z+vp[12],vp[1]*x+vp[5]*y+vp[9]*z+vp[13],vp[3]*x+vp[7]*y+vp[11]*z+vp[15]]);}
   let clip=[];for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],ina=a[2]>.35,inb=b[2]>.35;if(ina)clip.push(a);if(ina!==inb){const f=(.35-a[2])/(b[2]-a[2]);clip.push(a.map((v,k)=>v+(b[k]-v)*f));}}if(clip.length<3)continue;
   let points=clip.map(p=>[(p[0]/p[2]*.5+.5)*w,(-p[1]/p[2]*.5+.5)*h,1/p[2]]);if(points.every(p=>p[0]<0)||points.every(p=>p[0]>w)||points.every(p=>p[1]<0)||points.every(p=>p[1]>h))continue;
   let f=clamp((distance-65)/145,0,.85),col=[.48,.51,.53].map((fog,k)=>Math.round(clamp(v[i+3+k]*(1-f)+fog*f,0,1)*255));
   const flat=Math.max(v[i+1],v[i+8],v[i+15])<.2;const area=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);let depth=flat?1e6-center[1]*1000:poly.reduce((s,p)=>s+p[2],0)/3;faces.push({points,depth,kind:v[i+6],world:center,color:(255<<24)|(col[2]<<16)|(col[1]<<8)|col[0]});
  }
  if(!this.pixels||this.pixels.width!==w||this.pixels.height!==h){this.pixels=ctx.createImageData(w,h);this.depths=new Float32Array(w*h);this.colors=new Uint32Array(this.pixels.data.buffer);}this.depths.fill(0);this.colors.fill(0);
  const depths=this.depths,colors=this.colors;
  for(const face of faces)for(let j=1;j<face.points.length-1;j++){
   let a=face.points[0],b=face.points[j],c=face.points[j+1];let area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<.01)continue;
   if(area<0){[b,c]=[c,b];area=-area;}
   const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   const e0x=b[1]-c[1],e0y=c[0]-b[0],e1x=c[1]-a[1],e1y=a[0]-c[0],e2x=a[1]-b[1],e2y=b[0]-a[0];
   let row0=(c[0]-b[0])*(minY+.5-b[1])-(c[1]-b[1])*(minX+.5-b[0]),row1=(a[0]-c[0])*(minY+.5-c[1])-(a[1]-c[1])*(minX+.5-c[0]),row2=(b[0]-a[0])*(minY+.5-a[1])-(b[1]-a[1])*(minX+.5-a[0]);
   const za=a[2]/area,zb=b[2]/area,zc=c[2]/area;
   for(let y=minY;y<=maxY;y++){let e0=row0,e1=row1,e2=row2,k=y*w+minX;for(let x=minX;x<=maxX;x++,k++){if(e0>=0&&e1>=0&&e2>=0){const d=e0*za+e1*zb+e2*zc;if(d>depths[k]){depths[k]=d;let color=face.color;if(face.kind>0){const grain=((x*13+y*7+(x^y)*3)&15)-7;let rr=(color&255)+grain,gg=((color>>>8)&255)+grain,bb=((color>>>16)&255)+grain;color=(255<<24)|((bb&248)<<16)|((gg&248)<<8)|(rr&248);}colors[k]=color;}}e0+=e0x;e1+=e1x;e2+=e2x;}row0+=e0y;row1+=e1y;row2+=e2y;}
  }ctx.putImageData(this.pixels,0,0);
 }
 drawBuffer(buffer,count,dynamic=false){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,buffer);g.enableVertexAttribArray(this.p);g.vertexAttribPointer(this.p,3,g.FLOAT,false,28,0);g.enableVertexAttribArray(this.c);g.vertexAttribPointer(this.c,3,g.FLOAT,false,28,12);g.enableVertexAttribArray(this.k);g.vertexAttribPointer(this.k,1,g.FLOAT,false,28,24);g.drawArrays(g.TRIANGLES,0,count);}
 render(game,dt,attract=false,t=0,brake=false){const gl=this.gl,canvas=this.canvas;const renderHeight=innerWidth<innerHeight?360:270,dpr=renderHeight/innerHeight,w=Math.floor(innerWidth*dpr),h=renderHeight;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h);}
  const c=game.actor,speed=Math.abs(c.speed||0),forward=[Math.sin(c.a),Math.cos(c.a)];let eye,target;
  if(attract){const a=c.a+.55+Math.sin(t*.06)*.1;eye=[c.x-Math.sin(a)*12,4.8,c.z-Math.cos(a)*12];target=[c.x+2,1.0,c.z-2];}
  else if(game.onFoot){const a=game.walkHeading;eye=[c.x-Math.sin(a)*7,4.2,c.z-Math.cos(a)*7];target=[c.x,1.25,c.z];}
  else{const gap=this.mode===1?19:11;eye=[c.x-forward[0]*(gap+speed*.07),this.mode===1?9:4.3,c.z-forward[1]*(gap+speed*.07)];target=[c.x+forward[0]*7,1.3,c.z+forward[1]*7];}
  if(!attract&&!visible({x:c.x,z:c.z},{x:eye[0],z:eye[2]},this.city.buildings)){eye=[c.x,game.onFoot?7:12,c.z+.1];}
  let blend=attract?Math.min(1,dt*3):1-Math.exp(-dt*7);for(let i=0;i<3;i++){this.cam[i]+=(eye[i]-this.cam[i])*blend;this.target[i]+=(target[i]-this.target[i])*blend;}
  const vp=multiply(perspective((innerWidth<innerHeight?68:58)*Math.PI/180,w/h,.3,850),lookAt(this.cam,this.target));if(gl){gl.uniform2f(this.resolution,w,h);gl.uniformMatrix4fv(this.matrix,false,vp);gl.uniform3fv(this.eye,this.cam);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.drawBuffer(this.static.buffer,this.static.count);}
  const m=new Mesh();for(const s of game.skids){if(s.t>25)continue;m.transform={x:s.x,z:s.z,c:Math.cos(s.a),s:Math.sin(s.a)};for(const x of[-1,1])m.flat(x,-1.8,.25,.8,'#303b3c',.075);}m.transform=null;
  for(const v of [...game.traffic,...game.parked])this.car(m,v,v.paint||'#8f8876');
  for(const p of game.cops)this.car(m,p,'#354c55',true,false,t);
  this.car(m,game.car,game.car.paint||'#8c8d8b',false,brake,t);if(game.onFoot)this.person(m,game.person);if(game.door){const d=game.door,v=d.car;m.transform={x:v.x,z:v.z,c:Math.cos(v.a),s:Math.sin(v.a)};m.box(d.side*1.7,.65,-.1,1.1,.7,.13,v.paint);m.transform=null;}
  const targetPoint=game.target;if(targetPoint&&!attract){const p=targetPoint;m.ring(p.x,.1,p.z,8,'#e6bc63');m.ring(p.x,.11,p.z,7.6+Math.sin(t*3)*.2,'#f0cb77');const y=4.5+Math.sin(t*3)*.4;m.tri([p.x-1.3,y+2,p.z],[p.x+1.3,y+2,p.z],[p.x,y,p.z],'#ffd57d');m.tri([p.x,y+2,p.z-1.3],[p.x,y+2,p.z+1.3],[p.x,y,p.z],'#ffd57d');}
  if(this.software){this.drawSoftware(vp,m.v,w,h);this.frames++;return;}gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(m.v),gl.DYNAMIC_DRAW);this.drawBuffer(this.dynamic,m.v.length/7);this.frames++;
 }
}
