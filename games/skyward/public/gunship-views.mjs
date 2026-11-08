import * as THREE from './vendor/three.module.js';
import {getGunshipStation} from './gunship.mjs';

const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const color={shell:'#101b22',edge:'#50616a',rim:'#a3aea9',panel:'#24343c',shade:'#0a141a',ink:'#acc9bd',amber:'#d8b16b',green:'#89c9ab'};

// The optical head and its gun mount move together. The physical station frame
// stays at the edge of the view; the shared camera helper supplies the complete
// airframe attitude. No horizon stabilisation or separate world aim is applied.
// Pixel coordinates are shared by the WebGL interior and compatibility canvas.
export function gunshipStationLayout(seat,width=1280,height=720){
  const station=getGunshipStation(seat),w=Math.max(1,width),h=Math.max(1,height),portrait=w<h;
  const scale=Math.max(.38,Math.min(w/1280,h/720)),edge=Math.max(12,Math.min(w,h)*.035),top=Math.max(24,h*.065),bottom=h*.83,cut=Math.min(w,h)*.046;
  const opening=[[edge+cut,top],[w-edge-cut,top],[w-edge,top+cut],[w-edge,bottom-cut],[w-edge-cut,bottom],[edge+cut,bottom],[edge,bottom-cut],[edge,top+cut]];
  const panels=[[[0,0],[w,0],...opening.slice(0,3).reverse(),opening[7],[0,0]],
    [[0,0],opening[0],opening[7],opening[6],opening[5],[0,h]],
    [[w,0],[w,h],opening[4],opening[3],opening[2],opening[1]],
    [[0,h],opening[5],opening[4],[w,h]]];
  const heavy=station.id==='105mm',medium=station.id==='40mm';
  const muzzle={x:w*.51,y:h*(heavy?.625:medium?.65:.665)},base={x:w*(portrait?.64:.62),y:h*1.04};
  const barrelWidth=Math.min(w,h)*(heavy?.038:medium?.023:.027),housingWidth=Math.min(w,h)*(heavy?.16:medium?.125:.105);
  const barrel=[[muzzle.x-barrelWidth,muzzle.y],[muzzle.x+barrelWidth,muzzle.y],[base.x+housingWidth*.52,base.y],[base.x-housingWidth*.60,base.y]];
  const breech=[[base.x-housingWidth,h*.865],[base.x-housingWidth*.75,h*.805],[base.x+housingWidth*.55,h*.805],[base.x+housingWidth,h*.91],[base.x+housingWidth,h],[base.x-housingWidth,h]];
  return {seat:station.id,station,w,h,portrait,scale,edge,opening,panels,barrel,breech,muzzle,base,barrelWidth,housingWidth,
    console:{x:w*.07,y:h*.862,w:w*(portrait?.30:.26),h:h*.105}};
}

function path(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
function polygon(ctx,points,fill,stroke,width=1){path(ctx,points);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function label(ctx,text,x,y,size,fill=color.ink,align='left'){ctx.fillStyle=fill;ctx.textAlign=align;ctx.textBaseline='middle';ctx.font=`600 ${Math.round(size)}px ui-monospace, SFMono-Regular, Menlo, monospace`;ctx.fillText(text,x,y);}
function circle(ctx,x,y,r,fill){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}

export function paintGunshipStationStatic(ctx,l,{surfaces=true}={}){
  if(!ctx)return;const {w,h,scale:s,edge:e,console:c}=l;ctx.save();ctx.lineJoin='round';
  if(surfaces){
    for(const panel of l.panels)polygon(ctx,panel,color.shell);
    ctx.strokeStyle='#080f14';ctx.lineWidth=Math.max(9,14*s);path(ctx,l.opening);ctx.stroke();
    ctx.strokeStyle=color.edge;ctx.lineWidth=Math.max(4,6*s);path(ctx,l.opening);ctx.stroke();
    ctx.strokeStyle='#7b8b90';ctx.lineWidth=Math.max(1,1.6*s);path(ctx,l.opening);ctx.stroke();
  }
  // Rivets, ribs and the side handle give a recognisable interior even when a
  // phone's action controls cover the lower console.
  for(const side of[0,1]){
    const x=side?w-e*.46:e*.46;
    for(const fraction of[.18,.32,.46,.60,.74]){circle(ctx,x,h*fraction,Math.max(1.2,2.7*s),'#0a1015');circle(ctx,x-.3,h*fraction-.3,Math.max(.7,1.3*s),'#697b81');}
    if(!l.portrait){ctx.strokeStyle='#52646e';ctx.lineWidth=3*s;ctx.strokeRect(side?w-e*2.1:e*1.2,h*.32,e*.65,h*.15);}
  }
  polygon(ctx,[[c.x-7*s,c.y-8*s],[c.x+c.w+7*s,c.y-8*s],[c.x+c.w+7*s,c.y+c.h+8*s],[c.x-7*s,c.y+c.h+8*s]],color.panel,color.edge,Math.max(1,1.5*s));
  ctx.fillStyle='#081a1c';ctx.fillRect(c.x,c.y,c.w,c.h);
  const fs=Math.max(l.portrait?8:10,13*s);
  label(ctx,'PORT / '+l.station.shortLabel,c.x+8*s,c.y+c.h*.24,fs,color.green);
  label(ctx,l.station.id==='25mm'?'ROTARY CANNON':l.station.id==='40mm'?'MEDIUM CANNON':'HEAVY CANNON',c.x+8*s,c.y+c.h*.54,Math.max(6.5,fs*.68),'#73998b');
  for(let i=0;i<12;i++){ctx.fillStyle=i<9?'#6a9d88':'#263f37';ctx.fillRect(c.x+8*s+i*(c.w-16*s)/12,c.y+c.h*.77,Math.max(1,(c.w-16*s)/12-2*s),Math.max(2,3*s));}
  // The red guard and paired status lamps sit beyond the clear aiming window.
  const right=w*.89;circle(ctx,right,h*.91,Math.max(2,4*s),'#6cc8a1');circle(ctx,right+Math.max(8,16*s),h*.91,Math.max(2,4*s),color.amber);
  if(!l.portrait){label(ctx,'GUN CONTROL',right,h*.875,Math.max(8,11*s),'#859890','center');label(ctx,'AIRFRAME / PORT',w*.5,h*.032,Math.max(8,10*s),'#7f939a','center');}
  ctx.restore();
}

function paintGun(ctx,l,recoil=0){
  ctx.save();ctx.translate(0,recoil*Math.min(l.w,l.h)*.018);const s=l.scale;
  const metal=ctx.createLinearGradient(l.muzzle.x-l.barrelWidth,0,l.base.x+l.housingWidth*.6,0);
  metal.addColorStop(0,'#24353e');metal.addColorStop(.22,'#71818a');metal.addColorStop(.42,'#50616b');metal.addColorStop(.72,'#2d3e47');metal.addColorStop(1,'#14252d');
  polygon(ctx,l.barrel,metal,'#809099',Math.max(1,2*s));
  // Lengthwise gun tubes converge below the reticle and leave the center clear.
  const count=l.seat==='25mm'?5:l.seat==='40mm'?2:1;
  for(let i=0;i<count;i++){
    const offset=(i-(count-1)/2)*l.barrelWidth*.37;ctx.strokeStyle=i%2?'#16272f':'#728087';ctx.lineWidth=Math.max(1.5,l.barrelWidth*(l.seat==='25mm'?.19:.32));ctx.beginPath();ctx.moveTo(l.muzzle.x+offset,l.muzzle.y+3*s);ctx.lineTo(l.base.x+offset*2,l.base.y);ctx.stroke();
  }
  for(const t of[.18,.60]){
    const x=l.muzzle.x+(l.base.x-l.muzzle.x)*t,y=l.muzzle.y+(l.base.y-l.muzzle.y)*t,r=l.barrelWidth*(1-t)+l.housingWidth*.54*t;
    ctx.strokeStyle='#182b35';ctx.lineWidth=Math.max(2,4*s);ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.stroke();
    ctx.strokeStyle='#88959a';ctx.lineWidth=Math.max(.8,1.2*s);ctx.beginPath();ctx.moveTo(x-r,y-2*s);ctx.lineTo(x+r,y-2*s);ctx.stroke();
  }
  if(l.seat!=='25mm'){
    ctx.beginPath();ctx.ellipse(l.muzzle.x,l.muzzle.y,l.barrelWidth,Math.max(2,l.barrelWidth*.24),0,0,Math.PI*2);ctx.fillStyle='#0b1a21';ctx.fill();ctx.strokeStyle='#9ba7aa';ctx.lineWidth=Math.max(1.2,2*s);ctx.stroke();
  }
  const housing=ctx.createLinearGradient(l.base.x-l.housingWidth,0,l.base.x+l.housingWidth,0);housing.addColorStop(0,'#40525b');housing.addColorStop(.28,'#283b45');housing.addColorStop(1,'#172a34');
  polygon(ctx,l.breech,housing,'#5b6c73',Math.max(1,2*s));
  const x=l.base.x,y=l.h*.879;ctx.fillStyle='#111e25';ctx.fillRect(x-l.housingWidth*.5,y,l.housingWidth,Math.max(8,l.h*.052));
  label(ctx,l.station.shortLabel,x,y+l.h*.026,Math.max(9,16*s),'#b1b7ac','center');
  if(l.seat==='25mm')for(let i=0;i<7;i++){const xx=x+l.housingWidth*(.7+i*.12),yy=l.h*(.91+i*.008);ctx.fillStyle=i%2?'#b7a37a':'#766d54';ctx.fillRect(xx,yy,l.housingWidth*.1,l.h*.035);}
  if(l.seat==='40mm')for(let i=0;i<3;i++){ctx.fillStyle='#93876d';ctx.fillRect(x+l.housingWidth*(.68+i*.21),l.h*.85,l.housingWidth*.12,l.h*.11);}
  if(l.seat==='105mm'){ctx.strokeStyle='#819098';ctx.lineWidth=Math.max(2,4*s);ctx.beginPath();ctx.moveTo(x-l.housingWidth*.72,l.h*.88);ctx.lineTo(x-l.housingWidth*.72,l.h*.97);ctx.lineTo(x-l.housingWidth*.44,l.h*.97);ctx.stroke();}
  ctx.restore();
}

function makeCanvas(width,height){
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):globalThis.document?.createElement?.('canvas');
  if(!canvas)return null;canvas.width=width;canvas.height=height;return canvas.getContext?.('2d')?canvas:null;
}

function recoilOf(state,crew,time){
  const shots=finite(crew?.stations?.[state.layout.seat]?.shots);
  if(state.shots!==undefined&&shots>state.shots)state.firedAt=time;
  state.shots=shots;
  const age=time-finite(state.firedAt,-100),duration=state.layout.seat==='105mm'?.42:.18;
  return age>=0&&age<duration?Math.sin(Math.min(1,age/.035)*Math.PI/2)*Math.exp(-age/(duration*.3)):0;
}

export function makeSoftwareGunshipStation(seat,width,height){
  const layout=gunshipStationLayout(seat,width,height),canvas=makeCanvas(Math.ceil(layout.w),Math.ceil(layout.h));
  if(canvas)paintGunshipStationStatic(canvas.getContext('2d'),layout);
  return {layout,canvas};
}
export function drawSoftwareGunshipStation(ctx,station,crew,time=0){
  if(station.canvas)ctx.drawImage(station.canvas,0,0,station.layout.w,station.layout.h);else paintGunshipStationStatic(ctx,station.layout);
  paintGun(ctx,station.layout,recoilOf(station,crew,time));
}

function material(value,extra={}){return new THREE.MeshBasicMaterial({color:value,fog:false,toneMapped:false,...extra});}
function point(l,x,y,z=0){return new THREE.Vector3(x-l.w/2,l.h/2-y,z);}
function shape(l,points){const result=new THREE.Shape();points.forEach(([x,y],i)=>{const p=point(l,x,y);i?result.lineTo(p.x,p.y):result.moveTo(p.x,p.y);});result.closePath();return result;}
function add(root,geometry,mat,x=0,y=0,z=0){const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);object.renderOrder=1100;object.frustumCulled=false;root.add(object);return object;}
function beam(root,l,a,b,width,mat,z=0){const aa=point(l,...a,z),bb=point(l,...b,z),direction=bb.clone().sub(aa),object=add(root,new THREE.CylinderGeometry(width,width,direction.length(),8),mat);object.position.copy(aa.add(bb).multiplyScalar(.5));object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;}

export function makeGunshipStation(seat,width=1280,height=720){
  const l=gunshipStationLayout(seat,width,height),root=new THREE.Group(),s=l.scale;root.name='gunship-station-'+l.seat;
  const shell=material(color.shell),edge=material(color.edge),dark=material(color.shade),steel=material('#51616a'),trim=material('#a0a9a5');
  for(const panel of l.panels)add(root,new THREE.ExtrudeGeometry(shape(l,panel),{depth:8*s,bevelEnabled:true,bevelSize:2*s,bevelThickness:2*s,bevelSegments:1,steps:1}),shell,0,0,-10*s);
  for(let i=0;i<l.opening.length;i++){
    const a=l.opening[i],b=l.opening[(i+1)%l.opening.length];beam(root,l,a,b,Math.max(4,7*s),dark,-2*s);beam(root,l,a,b,Math.max(2,3*s),edge,1*s);
  }
  const face=makeCanvas(Math.ceil(l.w),Math.ceil(l.h));
  if(face){
    paintGunshipStationStatic(face.getContext('2d'),l,{surfaces:false});const texture=new THREE.CanvasTexture(face);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    add(root,new THREE.PlaneGeometry(l.w,l.h),material('#fff',{map:texture,transparent:true,depthWrite:false}),0,0,3*s);
  }
  const gun=new THREE.Group();gun.name='station-gun';root.add(gun);
  add(gun,new THREE.ExtrudeGeometry(shape(l,l.barrel),{depth:12*s,bevelEnabled:true,bevelSize:2*s,bevelThickness:2*s,bevelSegments:1,steps:1}),steel,0,0,5*s);
  add(gun,new THREE.ExtrudeGeometry(shape(l,l.breech),{depth:19*s,bevelEnabled:true,bevelSize:4*s,bevelThickness:3*s,bevelSegments:1,steps:1}),edge,0,0,7*s);
  const count=l.seat==='25mm'?5:l.seat==='40mm'?2:1;
  for(let i=0;i<count;i++){
    const offset=(i-(count-1)/2)*l.barrelWidth*.37;
    beam(gun,l,[l.muzzle.x+offset,l.muzzle.y+3*s],[l.base.x+offset*2,l.base.y],Math.max(1.1,l.barrelWidth*(count===5?.095:.16)),i%2?dark:trim,19*s);
  }
  const gunFace=makeCanvas(Math.ceil(l.w),Math.ceil(l.h));
  if(gunFace){
    paintGun(gunFace.getContext('2d'),l);const texture=new THREE.CanvasTexture(gunFace);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    add(gun,new THREE.PlaneGeometry(l.w,l.h),material('#fff',{map:texture,transparent:true,depthWrite:false}),0,0,30*s);
  }
  root.userData={layout:l,gun};return root;
}

export function fitGunshipStation(station,camera){
  const l=station?.userData?.layout;if(!l)return;
  const distance=1.3,scale=2*distance*Math.tan(camera.fov*Math.PI/360)/l.h;
  station.scale.setScalar(scale);station.position.set(0,0,-distance);
}
export function updateGunshipStation(station,crew,time=0){
  const data=station?.userData;if(!data?.layout)return;
  data.gun.position.y=-recoilOf(data,crew,time)*Math.min(data.layout.w,data.layout.h)*.018;
}
