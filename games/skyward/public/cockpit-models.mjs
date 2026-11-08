import * as THREE from './vendor/three.module.js';
import {aircraftKind} from './models.mjs';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const themes={
  open:{body:'#60462e',face:'#89623b',edge:'#33271f',trim:'#ad9363',dial:'#1c2423',ink:'#e7ddbc',needle:'#f3c479',glass:'#b3d5cd'},
  fighter:{body:'#222c28',face:'#39463c',edge:'#15201d',trim:'#8b9787',dial:'#121b1a',ink:'#dce1c6',needle:'#f4c77a',glass:'#b1d4cb'},
  heavy:{body:'#2d3832',face:'#4c5849',edge:'#202a25',trim:'#96a08a',dial:'#17201d',ink:'#e3e4c8',needle:'#edbb79',glass:'#bad9cb'},
  jet:{body:'#171f25',face:'#303a40',edge:'#10171a',trim:'#76868b',dial:'#10191c',ink:'#d4e1d9',needle:'#f0c486',glass:'#8dd7ba'},
  glass:{body:'#101a21',face:'#253038',edge:'#0b141a',trim:'#697d85',dial:'#09181a',ink:'#a6e1cc',needle:'#e3edb8',glass:'#8be2b9'},
};

export function cockpitFamily(profile){
  const kind=aircraftKind(profile);
  return /^(avro504|camel)$/.test(kind)?'open':/^(spitfire|hellcat|bf109)$/.test(kind)?'fighter':/^(b17|c47|he111)$/.test(kind)?'heavy':/^(f4|harrier|a10|mig21)$/.test(kind)?'jet':'glass';
}

// One layout supplies both renderers. All opaque panel surfaces stay below
// 75% of the view; the central aiming area contains no decorative instrument.
export function cockpitLayout(profile,width=1280,height=720){
  const w=Math.max(1,finite(width,1280)),h=Math.max(1,finite(height,720));
  const kind=aircraftKind(profile),family=cockpitFamily(kind),theme=themes[family];
  const compact=w<600||h<430,scale=clamp(Math.min(w/1000,h/600),.48,1.45);
  const radius=clamp(Math.min(w*.044,h*.052),11,34),cy=h*.874;
  const gauges=[],screens=[],frames=[],screws=[];
  const addGauge=(id,x,y,r=radius,label=id.toUpperCase())=>gauges.push({id,x,y,r,label});
  const panel=family==='open'?[[0,h],[w*.035,h*.90],[w*.19,h*.815],[w*.34,h*.785],[w*.66,h*.785],[w*.81,h*.815],[w*.965,h*.90],[w,h]]:
    [[0,h],[0,h*.91],[w*.16,h*.84],[w*.31,h*.775],[w*.42,h*.76],[w*.58,h*.76],[w*.69,h*.775],[w*.84,h*.84],[w,h*.91],[w,h]];
  const coaming=panel.slice(1,-1);
  if(family==='glass'){
    const screenW=Math.min(w*.20,h*.28),screenH=Math.min(h*.15,w*.16),gap=Math.max(12,scale*18);
    screens.push({id:'flight',x:w*.5-gap-screenW,y:h*.825,w:screenW,h:screenH},{id:'systems',x:w*.5+gap,y:h*.825,w:screenW,h:screenH});
    if(!compact)addGauge('fuel',w*.5,h*.89,Math.min(radius*.67,gap*.72),'FUEL');
    if(!compact){addGauge('speed',w*.5-screenW-gap-radius*1.7,h*.91,radius*.72,'KNOTS');addGauge('altitude',w*.5+screenW+gap+radius*1.7,h*.91,radius*.72,'ALT FT');}
  }else{
    for(const [i,id,label]of [[-1,'speed','KNOTS'],[0,'altitude','ALT FT'],[1,'fuel','FUEL']])addGauge(id,w*.5+i*radius*2.75,cy,radius,label);
    if(family==='jet'&&!compact){
      const side=radius*6.15,size=radius*2.3;
      screens.push({id:'flight',x:w*.5-side-size*.5,y:cy-size*.5,w:size,h:size});
      addGauge('throttle',w*.5+side,cy,radius*.75,'THRUST');
    }else if(family!=='open'&&!compact){
      for(const side of[-1,1])addGauge(side<0?'throttle':'climb',w*.5+side*radius*5.1,cy+radius*.14,radius*.70,side<0?'THRUST':'V/S');
    }
  }
  if(family==='open'){
    // The biplanes have a small windscreen, not a closed fighter canopy.
    const half=Math.min(w*.20,h*.26),top=h*.635;
    frames.push({points:[[w*.5-half,h*.795],[w*.5-half*.77,top],[w*.5+half*.77,top],[w*.5+half,h*.795]],width:2.3*scale});
  }else if(family==='heavy'){
    frames.push({points:[[w*.04,h*.86],[w*.12,h*.24],[w*.26,h*.10],[w*.74,h*.10],[w*.88,h*.24],[w*.96,h*.86]],width:7*scale});
    frames.push({points:[[w*.5,0],[w*.5,h*.10]],width:9*scale});
    for(const s of[-1,1])frames.push({points:[[w*(.5+s*.24),h*.10],[w*(.5+s*.34),h*.80]],width:5*scale});
  }else{
    frames.push({points:[[w*.045,h*.88],[w*.105,h*.39],[w*.20,h*.16],[w*.36,h*.06],[w*.64,h*.06],[w*.80,h*.16],[w*.895,h*.39],[w*.955,h*.88]],width:(family==='fighter'?5.5:4)*scale});
    if(family==='fighter')for(const s of[-1,1])frames.push({points:[[w*(.5+s*.16),h*.07],[w*(.5+s*.24),h*.78]],width:3.5*scale});
  }
  const hud=family==='jet'||family==='glass'?{x:w*.5,y:h*.565,w:Math.min(w*.38,h*.32),h:h*.27}:null;
  const sight=family==='fighter'?{x:w*.5,y:h*.5,r:Math.min(w*.025,h*.027)}:null;
  for(const x of[.22,.35,.65,.78])screws.push({x:w*x,y:h*(x===.35||x===.65?.805:.86)});
  return {kind,family,theme,w,h,compact,scale,panel,coaming,gauges,screens,frames,screws,hud,sight};
}

export function cockpitTelemetry(pose={}){
  return {speed:Math.max(0,finite(pose.speed))*1.943844,altitude:Math.max(0,finite(pose.y))*3.28084,fuel:clamp(finite(pose.fuel,100),0,100),throttle:clamp(finite(pose.throttle),0,1),climb:finite(pose.verticalSpeed,finite(pose.vy))};
}

function gaugeFraction(id,t){
  return id==='altitude'?(t.altitude%10000)/10000:id==='fuel'?t.fuel/100:id==='throttle'?t.throttle:clamp(.5+t.climb/80,0,1);
}

function dialAngle(g,t,layout){
  // Period airspeed scales keep a slow biplane from looking like zero speed.
  const maxSpeed=layout.family==='open'?140:layout.family==='fighter'?500:layout.family==='heavy'?350:900;
  const f=g.id==='speed'?clamp(t.speed/maxSpeed,0,1):gaugeFraction(g.id,t);
  return -Math.PI*.76+f*Math.PI*1.52;
}

function path(ctx,points,close=false){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);if(close)ctx.closePath();}
function circle(ctx,x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function label(ctx,text,x,y,size,color,align='center'){ctx.fillStyle=color;ctx.font=`600 ${Math.max(6,size)}px ui-monospace, SFMono-Regular, Consolas, monospace`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y);}

function drawFrames(ctx,l){
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const frame of l.frames){path(ctx,frame.points);ctx.lineWidth=frame.width+2*l.scale;ctx.strokeStyle=l.theme.edge;ctx.stroke();ctx.lineWidth=Math.max(1,frame.width*.48);ctx.strokeStyle=l.theme.trim;ctx.stroke();}
  if(l.family==='open'){
    const points=l.frames[0].points;path(ctx,points,true);ctx.fillStyle='rgba(189,225,211,.035)';ctx.fill();
  }
}

function drawDialFace(ctx,g,l){
  const {x,y,r}=g,t=l.theme;
  circle(ctx,x,y,r+2*l.scale,t.edge,t.trim,1.2*l.scale);
  const face=ctx.createLinearGradient(x-r,y-r,x+r,y+r);face.addColorStop(0,l.family==='open'?'#3a3d2e':'#27322e');face.addColorStop(1,t.dial);circle(ctx,x,y,r,face);
  for(let i=0;i<=12;i++){
    const a=-Math.PI*.76+i/12*Math.PI*1.52,major=i%3===0;
    const x1=x+Math.sin(a)*r*(major?.68:.77),y1=y-Math.cos(a)*r*(major?.68:.77);
    path(ctx,[[x1,y1],[x+Math.sin(a)*r*.87,y-Math.cos(a)*r*.87]]);ctx.strokeStyle=t.ink;ctx.lineWidth=Math.max(.7,l.scale*(major?1.3:.8));ctx.stroke();
  }
  label(ctx,g.label,x,y+r*.39,r*.20,t.ink);
  if(r>19){label(ctx,g.id==='climb'?'-40':'0',x-r*.63,y+r*.53,r*.18,t.ink);label(ctx,g.id==='fuel'||g.id==='throttle'?'100':g.id==='speed'?(l.family==='open'?'140':l.family==='fighter'?'500':l.family==='heavy'?'350':'900'):g.id==='altitude'?'10K':'+40',x+r*.6,y+r*.53,r*.17,t.ink);}
  for(const s of[-1,1])circle(ctx,x+s*r*.77,y-r*.77,Math.max(.65,l.scale*.7),t.trim);
}

function drawHud(ctx,l){
  const {hud,sight}=l;
  if(sight){
    const {x,y,r}=sight;ctx.fillStyle='rgba(162,200,174,.05)';ctx.fillRect(x-r*1.5,y-r*1.5,r*3,r*3);
    circle(ctx,x,y,r,null,'rgba(225,191,123,.65)',Math.max(1,l.scale));
    ctx.strokeStyle='rgba(225,191,123,.65)';ctx.lineWidth=Math.max(1,l.scale);
    path(ctx,[[x-r*1.5,y],[x-r*.6,y]]);ctx.stroke();path(ctx,[[x+r*.6,y],[x+r*1.5,y]]);ctx.stroke();
  }
  if(!hud)return;
  const {x,y,w,h}=hud,points=[[x-w*.5,y+h*.5],[x-w*.43,y-h*.5],[x+w*.43,y-h*.5],[x+w*.5,y+h*.5]];
  for(const side of[-1,1]){path(ctx,[[x+side*w*.46,y+h*.5],[x+side*w*.5,l.h*.77]]);ctx.lineWidth=3*l.scale;ctx.strokeStyle=l.theme.edge;ctx.stroke();}
  path(ctx,points,true);ctx.fillStyle='rgba(107,190,154,.045)';ctx.fill();ctx.lineWidth=Math.max(1,l.scale*.85);ctx.strokeStyle='rgba(154,214,183,.37)';ctx.stroke();
  // The gameplay reticle already marks camera centre. Keep the combiner clear
  // there; a second, lower decorative crosshair would give a false aiming cue.
}

export function paintCockpitStatic(ctx,l,{frames=true}={}){
  ctx.save();ctx.globalAlpha=1;const t=l.theme;
  if(frames)drawFrames(ctx,l);
  path(ctx,l.panel,true);const gradient=ctx.createLinearGradient(0,l.h*.77,0,l.h);gradient.addColorStop(0,t.face);gradient.addColorStop(1,t.body);ctx.fillStyle=gradient;ctx.fill();
  ctx.save();path(ctx,l.panel,true);ctx.clip();
  if(l.family==='open'){
    ctx.lineWidth=Math.max(.65,l.scale*.7);for(let i=0;i<15;i++){const y=l.h*.79+i*l.h*.018;path(ctx,[[0,y],[l.w*.26,y-Math.sin(i)*3*l.scale],[l.w*.59,y+Math.cos(i*1.7)*3*l.scale],[l.w,y-2*l.scale]]);ctx.strokeStyle=i%3?'rgba(40,24,14,.19)':'rgba(209,171,104,.13)';ctx.stroke();}
  }else{
    ctx.strokeStyle='rgba(0,0,0,.22)';ctx.lineWidth=Math.max(1,l.scale);for(const side of[-1,1]){const x=l.w*(.5+side*.32);path(ctx,[[x,l.h*.83],[x-side*8*l.scale,l.h]]);ctx.stroke();}
  }
  ctx.restore();
  path(ctx,l.coaming);ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=t.edge;ctx.lineWidth=(l.family==='open'?12:9)*l.scale;ctx.stroke();
  ctx.strokeStyle=l.family==='open'?'#9b7552':'#536056';ctx.lineWidth=1.1*l.scale;ctx.stroke();
  for(const screw of l.screws){circle(ctx,screw.x,screw.y,2*l.scale,t.trim,t.edge,.8*l.scale);ctx.strokeStyle=t.edge;ctx.lineWidth=.8*l.scale;path(ctx,[[screw.x-l.scale,screw.y],[screw.x+l.scale,screw.y]]);ctx.stroke();}
  for(const g of l.gauges)drawDialFace(ctx,g,l);
  for(const screen of l.screens){ctx.fillStyle=t.edge;ctx.fillRect(screen.x-5*l.scale,screen.y-5*l.scale,screen.w+10*l.scale,screen.h+10*l.scale);ctx.strokeStyle=t.trim;ctx.lineWidth=l.scale;ctx.strokeRect(screen.x-3*l.scale,screen.y-3*l.scale,screen.w+6*l.scale,screen.h+6*l.scale);ctx.fillStyle='#071919';ctx.fillRect(screen.x,screen.y,screen.w,screen.h);for(let i=1;i<5;i++){ctx.fillStyle='#65796e';ctx.fillRect(screen.x+screen.w*i/5-1.5*l.scale,screen.y+screen.h+2.4*l.scale,3*l.scale,1.3*l.scale);}}
  if(!l.compact){
    const y=l.h*.966;if(l.family!=='glass')label(ctx,l.family==='open'?'AIR SPEED  ·  ALTITUDE  ·  FUEL':'FLIGHT INSTRUMENTS',l.w*.5,y,7.5*l.scale,t.trim);
    for(const side of[-1,1])for(let i=0;i<3;i++){const x=l.w*(.5+side*.34)+i*9*l.scale;circle(ctx,x,y,2.8*l.scale,t.edge,t.trim,.65*l.scale);ctx.fillStyle=i===0?'#9c623d':'#8b9c8b';ctx.fillRect(x-l.scale*.6,y-3.6*l.scale,l.scale*1.2,3*l.scale);}
  }
  drawHud(ctx,l);ctx.restore();
}

function paintScreen(ctx,s,t,l,clear=false){
  const {x,y,w,h}=s,pad=Math.max(3,w*.055),ink=l.theme.ink;
  if(s.id==='hud'){
    if(clear)ctx.clearRect(x,y,w,h);const size=Math.max(7,Math.min(w*.075,h*.075)),yy=y+h*.82;
    label(ctx,`${Math.round(t.speed)}`,x+w*.18,yy,size,'#a4e2b8');label(ctx,'KT',x+w*.18,yy+size*1.25,size*.65,'#91bc9e');
    label(ctx,`${Math.round(t.altitude)}`,x+w*.82,yy,size,'#a4e2b8');label(ctx,'FT',x+w*.82,yy+size*1.25,size*.65,'#91bc9e');return;
  }
  ctx.fillStyle='#081b1d';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#25483f';ctx.lineWidth=1;
  path(ctx,[[x+pad,y+h*.22],[x+w-pad,y+h*.22]]);ctx.stroke();
  const font=Math.max(7.2,Math.min(h*.12,w*.075));label(ctx,s.id==='systems'?'ENGINE / FUEL':'FLIGHT',x+pad,y+h*.12,font,ink,'left');
  if(s.id==='systems'){
    for(const [i,name,value]of [[0,'THR',t.throttle],[1,'FUEL',t.fuel/100]]){
      const yy=y+h*(.40+i*.28);label(ctx,name,x+pad,yy,font,ink,'left');label(ctx,`${Math.round(value*100)}%`,x+w-pad,yy,font,ink,'right');
      ctx.fillStyle='#193c33';ctx.fillRect(x+pad,yy+h*.08,w-pad*2,h*.07);ctx.fillStyle=i?'#adc6a1':'#79c6a7';ctx.fillRect(x+pad,yy+h*.08,(w-pad*2)*value,h*.07);
    }
  }else{
    label(ctx,`${Math.round(t.speed)} KT`,x+pad,y+h*.43,font*1.45,ink,'left');label(ctx,`${Math.round(t.altitude).toLocaleString('en-US')} FT`,x+pad,y+h*.69,font*1.1,ink,'left');
    if(h>52)label(ctx,'AIR DATA',x+w-pad,y+h*.9,font*.7,'#769e89','right');
  }
}

export function paintCockpitDynamic(ctx,l,pose){
  const t=cockpitTelemetry(pose);ctx.save();ctx.lineCap='round';
  for(const g of l.gauges){const a=dialAngle(g,t,l),dx=Math.sin(a),dy=-Math.cos(a);ctx.strokeStyle=l.theme.needle;ctx.lineWidth=Math.max(1.3,l.scale*1.7);path(ctx,[[g.x-dx*g.r*.17,g.y-dy*g.r*.17],[g.x+dx*g.r*.69,g.y+dy*g.r*.69]]);ctx.stroke();circle(ctx,g.x,g.y,Math.max(1.7,l.scale*2.2),l.theme.trim);}
  for(const screen of l.screens)paintScreen(ctx,screen,t,l);
  if(l.hud)paintScreen(ctx,{id:'hud',x:l.hud.x-l.hud.w*.5,y:l.hud.y-l.hud.h*.5,w:l.hud.w,h:l.hud.h},t,l);
  ctx.restore();
}

function makeCanvas(w,h){
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):globalThis.document?.createElement?.('canvas');
  if(!canvas)return null;canvas.width=w;canvas.height=h;return canvas.getContext?.('2d')?canvas:null;
}

// Canvas fallback caches the wood grain, bezel faces, labels and canopy frame;
// only instrument needles and small displays are painted each frame.
export function makeSoftwareCockpit(profile,width,height){
  const layout=cockpitLayout(profile,width,height),canvas=makeCanvas(Math.ceil(layout.w),Math.ceil(layout.h));
  if(canvas)paintCockpitStatic(canvas.getContext('2d'),layout);
  return {layout,canvas};
}
export function drawSoftwareCockpit(ctx,cockpit,pose){
  if(cockpit.canvas)ctx.drawImage(cockpit.canvas,0,0,cockpit.layout.w,cockpit.layout.h);else paintCockpitStatic(ctx,cockpit.layout);
  paintCockpitDynamic(ctx,cockpit.layout,pose);
}

function meshMaterial(color,extra={}){return new THREE.MeshBasicMaterial({color,toneMapped:false,fog:false,...extra});}
function addMesh(root,geometry,material,x,y,z=0){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.renderOrder=1000;root.add(mesh);return mesh;}
function point(l,x,y,z=0){return new THREE.Vector3(x-l.w*.5,l.h*.5-y,z);}
function beam(root,l,a,b,r,material,z=0){const va=point(l,...a,z),vb=point(l,...b,z),d=vb.clone().sub(va),mesh=addMesh(root,new THREE.CylinderGeometry(r,r,d.length(),6),material,0,0);mesh.position.copy(va.add(vb).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return mesh;}
function shapeFor(l,points){const shape=new THREE.Shape();points.forEach(([x,y],i)=>{const p=point(l,x,y);if(i)shape.lineTo(p.x,p.y);else shape.moveTo(p.x,p.y);});shape.closePath();return shape;}

export function makeCockpit(profile,width=1280,height=720){
  const l=cockpitLayout(profile,width,height),root=new THREE.Group(),needles=[],displays=[];
  root.name=`cockpit-${l.family}`;
  const edge=meshMaterial(l.theme.edge),trim=meshMaterial(l.theme.trim),needle=meshMaterial(l.theme.needle),shell=meshMaterial(l.theme.body);
  addMesh(root,new THREE.ExtrudeGeometry(shapeFor(l,l.panel),{depth:9*l.scale,bevelEnabled:true,bevelSize:2*l.scale,bevelThickness:2*l.scale,bevelSegments:1,steps:1}),shell,0,0,-10*l.scale);
  for(let i=0;i<l.coaming.length-1;i++)beam(root,l,l.coaming[i],l.coaming[i+1],(l.family==='open'?5:3.6)*l.scale,edge,1);
  for(const frame of l.frames)for(let i=0;i<frame.points.length-1;i++)beam(root,l,frame.points[i],frame.points[i+1],frame.width*.5,trim,-2*l.scale);
  if(l.hud)for(const side of[-1,1])beam(root,l,[l.hud.x+side*l.hud.w*.46,l.hud.y+l.hud.h*.5],[l.hud.x+side*l.hud.w*.5,l.h*.77],1.5*l.scale,edge,1);
  const faceCanvas=makeCanvas(Math.ceil(l.w),Math.ceil(l.h));
  if(faceCanvas){
    paintCockpitStatic(faceCanvas.getContext('2d'),l,{frames:false});
    const texture=new THREE.CanvasTexture(faceCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    addMesh(root,new THREE.PlaneGeometry(l.w,l.h),meshMaterial('#ffffff',{map:texture,transparent:true,depthWrite:false}),0,0,2*l.scale);
  }
  for(const g of l.gauges){
    const p=point(l,g.x,g.y,4*l.scale);addMesh(root,new THREE.TorusGeometry(g.r+1.3*l.scale,1.2*l.scale,5,24),trim,p.x,p.y,p.z);
    const pivot=new THREE.Group();pivot.position.copy(point(l,g.x,g.y,5*l.scale));pivot.name=`instrument-${g.id}`;
    const hand=addMesh(pivot,new THREE.BoxGeometry(Math.max(1.3,l.scale*1.7),g.r*.88,l.scale),needle,0,g.r*.25,0);hand.renderOrder=1002;
    root.add(pivot);addMesh(root,new THREE.CircleGeometry(2.2*l.scale,12),trim,p.x,p.y,6*l.scale);needles.push({object:pivot,gauge:g});
  }
  const displaysToBuild=[...l.screens];if(l.hud)displaysToBuild.push({id:'hud',x:l.hud.x-l.hud.w*.5,y:l.hud.y-l.hud.h*.5,w:l.hud.w,h:l.hud.h});
  for(const s of displaysToBuild){
    const textureWidth=256,textureHeight=Math.max(1,Math.round(textureWidth*s.h/s.w)),canvas=makeCanvas(textureWidth,textureHeight);if(!canvas)continue;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    const p=point(l,s.x+s.w*.5,s.y+s.h*.5,4*l.scale);addMesh(root,new THREE.PlaneGeometry(s.w,s.h),meshMaterial('#ffffff',{map:texture,transparent:s.id==='hud',depthWrite:s.id!=='hud'}),p.x,p.y,p.z);
    displays.push({canvas,texture,screen:{...s,x:0,y:0,w:textureWidth,h:textureHeight},key:null});
  }
  root.userData={layout:l,needles,displays};return root;
}

export function fitCockpit(cockpit,camera){
  const layout=cockpit?.userData?.layout;if(!layout)return;
  const distance=1.15,scale=2*distance*Math.tan(camera.fov*Math.PI/360)/layout.h;
  cockpit.scale.setScalar(scale);cockpit.position.set(0,0,-distance);
}

export function updateCockpit(cockpit,pose,time){
  const data=cockpit?.userData;if(!data?.layout)return;
  const t=cockpitTelemetry(pose);
  for(const item of data.needles)item.object.rotation.z=-dialAngle(item.gauge,t,data.layout);
  if(Number.isFinite(time)&&Number.isFinite(data.lastDisplayTime)&&time-data.lastDisplayTime>=0&&time-data.lastDisplayTime<.1)return;
  data.lastDisplayTime=time;
  // Integer telemetry changes refresh only the small display textures, never
  // the viewport-size static panel texture or model geometry.
  const key=[Math.round(t.speed),Math.round(t.altitude/10)*10,Math.round(t.fuel),Math.round(t.throttle*100)].join(':');
  for(const display of data.displays)if(display.key!==key){paintScreen(display.canvas.getContext('2d'),display.screen,t,data.layout,true);display.texture.needsUpdate=true;display.key=key;}
}
