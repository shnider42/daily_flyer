import{ROADS,clamp}from'./engine.js';
const palette=['#b7a88a','#b97961','#638a89','#d1b68c','#887879','#a3aa92'];
const rgb=c=>typeof c==='string'?[parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255]:c;
class Mesh{
 constructor(){this.v=[];this.transform=null;}
 tri(a,b,c,col,shade=1){col=rgb(col);for(let p of[a,b,c]){if(this.transform){const t=this.transform,x=p[0],z=p[2];p=[t.x+x*t.c+z*t.s,p[1],t.z+z*t.c-x*t.s];}this.v.push(...p,col[0]*shade,col[1]*shade,col[2]*shade);}}
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
  this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:true,antialias:false,powerPreference:'high-performance'});this.software=!this.gl;if(this.software){this.ctx=canvas.getContext('2d',{alpha:true});this.static={v:this.makeWorld(city).v};this.cam=[0,7,190];this.target=[5,1,164];this.mode=0;this.frames=0;return;}const gl=this.gl;
  const vs=`attribute vec3 aPosition;attribute vec3 aColor;uniform mat4 uMatrix;uniform vec3 uEye;varying vec3 vColor;varying float vDistance;void main(){vColor=aColor;vDistance=distance(uEye,aPosition);gl_Position=uMatrix*vec4(aPosition,1.0);}`;
  const fs=`precision mediump float;varying vec3 vColor;varying float vDistance;void main(){float fog=smoothstep(90.0,370.0,vDistance);vec3 c=mix(vColor,vec3(0.71,0.62,0.52),fog*0.92);gl_FragColor=vec4(c,1.0);}`;
  const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);this.p=gl.getAttribLocation(this.program,'aPosition');this.c=gl.getAttribLocation(this.program,'aColor');this.matrix=gl.getUniformLocation(this.program,'uMatrix');this.eye=gl.getUniformLocation(this.program,'uEye');gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  this.static=this.upload(this.makeWorld(city).v);this.dynamic=gl.createBuffer();this.cam=[0,7,190];this.target=[5,1,164];this.mode=0;this.frames=0;
 }
 upload(v){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);return{buffer:b,count:v.length/6};}
 makeWorld(city){const m=new Mesh();m.flat(0,0,1000,1000,'#728174',-.12);m.flat(650,0,820,1400,'#518b8b',-.06);
  // Wide boulevards, two traffic lanes and pale concrete sidewalks.
  for(const r of ROADS){m.flat(r,0,30,478,'#b5af9b');m.flat(0,r,478,30,'#b5af9b');}
  for(const r of ROADS){m.flat(r,0,23,478,'#414c50',.04);m.flat(0,r,478,23,'#414c50',.04);}
  for(const r of ROADS)for(let v=-232;v<233;v+=9){if(ROADS.some(k=>Math.abs(k-v)<15))continue;m.flat(r-.35,v,.14,4,'#d1b36a',.055);m.flat(r+.35,v,.14,4,'#d1b36a',.055);m.flat(v,r-.35,4,.14,'#d1b36a',.056);m.flat(v,r+.35,4,.14,'#d1b36a',.056);}
  for(const x of ROADS)for(const z of ROADS){for(let s=-8;s<9;s+=3){m.flat(x+s,z+10.4,1.6,2,'#a7aaa0',.06);m.flat(x+10.4,z+s,2,1.6,'#a7aaa0',.06);}}
  for(const b of city.buildings){m.flat(b.x+2.5,b.z+3.5,b.w+6,b.d+5,'#535c55',.065);m.box(b.x,0,b.z,b.w,b.h,b.d,palette[b.color]);m.box(b.x,b.h,b.z,b.w+.6,.55,b.d+.6,'#dbceb2');m.box(b.x,b.h+.55,b.z,b.w*.35,1.6,b.d*.3,'#7b827c');
   for(let h=3;h<b.h-1;h+=4){const col=(Math.floor(h)%3===0)?'#b9b69a':'#566c70';m.box(b.x,h,b.z-b.d/2-.035,b.w*.82,1.25,.07,col);m.box(b.x,h,b.z+b.d/2+.035,b.w*.82,1.25,.07,col);m.box(b.x-b.w/2-.035,h,b.z,.07,1.25,b.d*.78,col);m.box(b.x+b.w/2+.035,h,b.z,.07,1.25,b.d*.78,col);}
   if(b.sign){m.box(b.x,2.5,b.z+b.d/2+.25,b.w*.6,1.3,.5,'#cb653e');for(let k=-3;k<4;k++)m.box(b.x+k*.8,2.8,b.z+b.d/2+.53,.32,.7,.06,'#edd29a');}
  }
  for(const p of city.palms){m.box(p.x,0,p.z,.4,p.h,.4,'#806952');for(let j=0;j<6;j++){const a=j*Math.PI/3,ex=p.x+Math.sin(a)*5,ez=p.z+Math.cos(a)*5;m.tri([p.x,p.h+.4,p.z],[ex,p.h-1.8,ez],[p.x+Math.cos(a)*1.4,p.h-.2,p.z-Math.sin(a)*1.4],j%2?'#365c4f':'#50705a');}}
  for(let z=-220;z<240;z+=18){m.box(234,0,z,.35,1.4,.35,'#d3c7a6');m.box(234,.8,z, .2,.15,18,'#b5b29e');}
  for(let z=-210;z<230;z+=72)for(let x=-210;x<230;x+=72){m.box(x-19,0,z-19,.3,8,.3,'#55605c');m.box(x-17.7,7.8,z-19,2.9,.25,.4,'#79817b');m.box(x-16.5,7.65,z-19,1,.15,.7,'#ffdc91');}
  // Distinctive marina sheds and a few distant sailboats.
  for(let z=-150;z<190;z+=90){m.flat(252,z,30,6,'#a98d66',.12);m.box(270,.1,z+6,3,1.1,8,'#d4c9a8');m.box(270,1,z+6,.14,10,.14,'#7c7466');m.tri([270,10,z+6],[270,2,z+6],[274,2,z+6],'#e8ddc3');}
  return m;
 }
 car(m,c,color,police=false,brake=false,t=0){
  m.transform={x:c.x,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a)};
  m.flat(.5,.6,3.3,6.6,'#303e3c',.09);
  m.box(0,.56,0,2.65,.66,5.65,color);m.box(0,1.22,1.75,2.58,.16,2.1,color);
  m.box(0,1.22,-1.93,2.58,.18,1.4,color);
  // Tapered cabin, dark glass and the long hood of a seventies coupe.
  m.quad([-1.22,1.22,.75],[1.22,1.22,.75],[.98,2.08,.12],[-.98,2.08,.12],'#4c7074',.85);
  m.quad([-1.22,1.22,-1.22],[-.98,2.08,-.85],[.98,2.08,-.85],[1.22,1.22,-1.22],'#375760');
  m.quad([-1.22,1.22,-1.22],[-1.22,1.22,.75],[-.98,2.08,.12],[-.98,2.08,-.85],'#375760',.82);
  m.quad([1.22,1.22,.75],[1.22,1.22,-1.22],[.98,2.08,-.85],[.98,2.08,.12],'#49636a');
  m.box(0,2.06,-.36,2.03,.1,1.06,color);
  for(const x of[-1.29,1.29]){m.box(x,1.17,-.12,.08,.12,2.4,'#ccbfa0');for(const z of[-1.76,1.75]){m.box(x,.24,z,.33,.91,.96,'#263234');m.box(x+Math.sign(x)*.17,.44,z,.04,.44,.5,'#a0a69c');}}
  m.box(0,.65,2.85,2.7,.23,.18,'#b7beb5');m.box(0,.65,-2.85,2.7,.23,.18,'#b7beb5');m.box(0,.94,2.84,1.3,.19,.05,'#26383b');
  for(const x of[-.91,.91]){m.box(x,.94,2.86,.48,.25,.06,'#ffe3a0');m.box(x,.97,-2.86,.55,.24,.06,brake?'#ff6642':'#9a3d32');}
  m.box(0,.64,-2.96,.62,.22,.03,'#efe3bd');
  if(police){m.box(0,1.3,1.9,2.4,.1,1.7,'#e3deca');m.box(0,2.18,-.35,1.6,.13,.35,'#333e43');m.box(-.5,2.3,-.35,.6,.27,.35,Math.sin(t*13)>0?'#ff574b':'#793c3b');m.box(.5,2.3,-.35,.6,.27,.35,Math.sin(t*13)<0?'#76b7ee':'#3b5c79');}
  else{for(const x of[-.56,.56])m.box(x,1.39,1.7,.3,.02,1.9,'#3d4541');}
  m.transform=null;
 }
 drawSoftware(vp,dynamic,w,h){
  const ctx=this.ctx,faces=[];
  for(const v of[this.static.v,dynamic])for(let i=0;i<v.length;i+=18){
   const center=[(v[i]+v[i+6]+v[i+12])/3,(v[i+1]+v[i+7]+v[i+13])/3,(v[i+2]+v[i+8]+v[i+14])/3];
   const distance=Math.hypot(center[0]-this.cam[0],center[2]-this.cam[2]);
   // Giant ground and road triangles must not be culled by their centers.
   if(distance>235&&Math.abs(v[i]-v[i+6])+Math.abs(v[i+2]-v[i+8])<150)continue;
   let poly=[];for(let j=0;j<18;j+=6){const x=v[i+j],y=v[i+j+1],z=v[i+j+2];poly.push([vp[0]*x+vp[4]*y+vp[8]*z+vp[12],vp[1]*x+vp[5]*y+vp[9]*z+vp[13],vp[3]*x+vp[7]*y+vp[11]*z+vp[15]]);}
   let clip=[];for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],ina=a[2]>.35,inb=b[2]>.35;if(ina)clip.push(a);if(ina!==inb){const f=(.35-a[2])/(b[2]-a[2]);clip.push(a.map((v,k)=>v+(b[k]-v)*f));}}if(clip.length<3)continue;
   let points=clip.map(p=>[(p[0]/p[2]*.5+.5)*w,(-p[1]/p[2]*.5+.5)*h,1/p[2]]);if(points.every(p=>p[0]<0)||points.every(p=>p[0]>w)||points.every(p=>p[1]<0)||points.every(p=>p[1]>h))continue;
   let f=clamp((distance-90)/280,0,.85),col=[.71,.62,.52].map((fog,k)=>Math.round(clamp(v[i+3+k]*(1-f)+fog*f,0,1)*255));
   const flat=Math.max(v[i+1],v[i+7],v[i+13])<.2;const area=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);if(v===this.static.v&&!flat&&area<0)continue;let depth=flat?1e6-center[1]*1000:poly.reduce((s,p)=>s+p[2],0)/3;faces.push({points,depth,color:(255<<24)|(col[2]<<16)|(col[1]<<8)|col[0]});
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
   for(let y=minY;y<=maxY;y++){let e0=row0,e1=row1,e2=row2,k=y*w+minX;for(let x=minX;x<=maxX;x++,k++){if(e0>=0&&e1>=0&&e2>=0){const d=e0*za+e1*zb+e2*zc;if(d>depths[k]){depths[k]=d;colors[k]=face.color;}}e0+=e0x;e1+=e1x;e2+=e2x;}row0+=e0y;row1+=e1y;row2+=e2y;}
  }ctx.putImageData(this.pixels,0,0);
 }
 drawBuffer(buffer,count,dynamic=false){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,buffer);g.enableVertexAttribArray(this.p);g.vertexAttribPointer(this.p,3,g.FLOAT,false,24,0);g.enableVertexAttribArray(this.c);g.vertexAttribPointer(this.c,3,g.FLOAT,false,24,12);g.drawArrays(g.TRIANGLES,0,count);}
 render(game,dt,attract=false,t=0,brake=false){const gl=this.gl,canvas=this.canvas;const dpr=this.software?Math.min(1,640/innerWidth):Math.min(window.devicePixelRatio||1,1.5),w=Math.floor(innerWidth*dpr),h=Math.floor(innerHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h);}
  const c=game.car,speed=Math.abs(c.speed),forward=[Math.sin(c.a),Math.cos(c.a)];let eye,target;
  if(attract){const a=c.a+.65+Math.sin(t*.08)*.16;eye=[c.x-Math.sin(a)*14,6.5,c.z-Math.cos(a)*14];target=[c.x+3,1.2,c.z-2];}
  else{const gap=this.mode===1?23:12.8;eye=[c.x-forward[0]*(gap+speed*.09),this.mode===1?13:5.8,c.z-forward[1]*(gap+speed*.09)];target=[c.x+forward[0]*7,1.3,c.z+forward[1]*7];}
  let blend=attract?Math.min(1,dt*3):1-Math.exp(-dt*7);for(let i=0;i<3;i++){this.cam[i]+=(eye[i]-this.cam[i])*blend;this.target[i]+=(target[i]-this.target[i])*blend;}
  const vp=multiply(perspective((innerWidth<innerHeight?68:58)*Math.PI/180,w/h,.3,850),lookAt(this.cam,this.target));if(gl){gl.uniformMatrix4fv(this.matrix,false,vp);gl.uniform3fv(this.eye,this.cam);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.drawBuffer(this.static.buffer,this.static.count);}
  const m=new Mesh();for(const s of game.skids){if(s.t>25)continue;m.transform={x:s.x,z:s.z,c:Math.cos(s.a),s:Math.sin(s.a)};for(const x of[-1,1])m.flat(x,-1.8,.25,.8,'#303b3c',.075);}m.transform=null;
  for(const v of game.traffic)this.car(m,v,['#b07659','#d3cbb2','#789594','#7a756a','#a3ac86'][v.color]);
  for(const p of game.cops)this.car(m,p,'#354c55',true,false,t);
  this.car(m,c,'#db9e3f',false,brake,t);
  const targetPoint=game.target;if(targetPoint&&!attract){const p=targetPoint;m.ring(p.x,.1,p.z,8,'#e6bc63');m.ring(p.x,.11,p.z,7.6+Math.sin(t*3)*.2,'#f0cb77');const y=4.5+Math.sin(t*3)*.4;m.tri([p.x-1.3,y+2,p.z],[p.x+1.3,y+2,p.z],[p.x,y,p.z],'#ffd57d');m.tri([p.x,y+2,p.z-1.3],[p.x,y+2,p.z+1.3],[p.x,y,p.z],'#ffd57d');}
  if(this.software){this.drawSoftware(vp,m.v,w,h);this.frames++;return;}gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(m.v),gl.DYNAMIC_DRAW);this.drawBuffer(this.dynamic,m.v.length/6);this.frames++;
 }
}
