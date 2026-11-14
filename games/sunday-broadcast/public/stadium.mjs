import * as T from './vendor/three.module.js';
import {TEAMS,WIDTH,clamp} from './football.mjs';
const materials=new Map();
function material(color,roughness=.82){
  const key=color+':'+roughness;
  if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness}));
  return materials.get(key);
}
const boxGeo=new T.BoxGeometry(1,1,1);
const ovalGeo=new T.SphereGeometry(1,12,9);
const numberGeo=new T.PlaneGeometry(.43,.34);
const shadowGeo=new T.CircleGeometry(.76,18);
const playerShadow=new T.MeshBasicMaterial({color:0x092118,opacity:.38,transparent:true,depthWrite:false});
const numbers=new Map();
function jerseyNumber(num){
  if(!numbers.has(num)){
    const map=canvasTexture(64,64,(g,w,h)=>{
      g.fillStyle='#fff1d4';g.font='900 43px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(num,w/2,h/2);
    });
    numbers.set(num,new T.MeshBasicMaterial({map,transparent:true,depthWrite:false}));
  }
  return numbers.get(num);
}
function box(parent,mat,x,y,z,w,h,d){
  const m=new T.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;
}
function oval(parent,mat,x,y,z,w,h,d){
  const m=new T.Mesh(ovalGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;
}
function canvasTexture(w,h,paint){
  const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;
}
function seeded(){
  let n=458;
  return ()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296};
}
function turfTexture(){
  return canvasTexture(1024,2048,(g,w,h)=>{
    const X=x=>w*(x+33)/66,Y=y=>h*(110-y)/120;
    const rng=seeded();
    g.fillStyle='#244f36';g.fillRect(0,0,w,h);
    for(let y=0;y<100;y+=5){
      g.fillStyle=y%10?'#47794b':'#3e7045';g.fillRect(X(-WIDTH/2),Y(y+5),X(WIDTH/2)-X(-WIDTH/2),h/24);
    }
    for(const [start,end,shade,name] of [[-10,0,'#163b5c','BOSTON'],[100,110,'#733820','CHICAGO']]){
      g.fillStyle=shade;g.fillRect(X(-WIDTH/2),Y(end),X(WIDTH/2)-X(-WIDTH/2),h/12);
      g.font='900 italic 133px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#eed7ad';
      g.fillText(name,w/2,Y((start+end)/2),w*.73);
    }
    for(let i=0;i<65000;i++){
      g.fillStyle=rng()<.5?'#132a1f28':'#e0e2a021';
      g.fillRect(rng()*w,rng()*h,1+rng()*3,1+rng()*4);
    }
    g.strokeStyle='#e6e3c9';g.lineWidth=5;g.strokeRect(X(-WIDTH/2),3,X(WIDTH/2)-X(-WIDTH/2),h-6);
    for(let y=0;y<=100;y++){
      g.beginPath();
      if(y%5===0){g.moveTo(X(-WIDTH/2),Y(y));g.lineTo(X(WIDTH/2),Y(y))}
      else for(const x of [-23,-3.1,3.1,23]){g.moveTo(X(x-.45),Y(y));g.lineTo(X(x+.45),Y(y))}
      g.lineWidth=y%5===0?4:2;g.stroke();
      if(y%10===0&&y>0&&y<100&&y!==50)for(const [x,rot] of [[-19,Math.PI/2],[19,-Math.PI/2]]){
        g.save();g.translate(X(x),Y(y));g.rotate(rot);
        g.fillStyle='#e6e3c9';g.font='bold 43px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(Math.min(y,100-y),0,0);g.restore();
      }
    }
    g.save();g.translate(w/2,Y(50));g.fillStyle='#163751';g.strokeStyle='#eab763';g.lineWidth=5;
    g.beginPath();g.moveTo(-108,-58);g.lineTo(108,-58);g.lineTo(100,32);g.lineTo(0,69);g.lineTo(-100,32);g.closePath();g.fill();g.stroke();
    g.fillStyle='#f2e7cf';g.font='900 italic 52px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('DFE',0,-4);g.restore();
  });
}
function crowdTexture(){
  return canvasTexture(512,128,(g,w,h)=>{
    const rng=seeded(),colors=['#aeb0a7','#b7987e','#a54e31','#c8a764','#435f80','#626a74','#3b4550','#d8d3c6'];
    g.fillStyle='#202a37';g.fillRect(0,0,w,h);
    for(let y=3;y<h;y+=8){
      g.fillStyle='#465059';g.fillRect(0,y+5,w,1);
      for(let x=3;x<w;x+=7){
        if(rng()<.1)continue;
        const j=(rng()-.5)*4;
        g.fillStyle=colors[Math.floor(rng()*colors.length)];g.fillRect(x+j,y+1,5,4);
        g.fillStyle=rng()<.7?'#bf947d':'#76533e';g.fillRect(x+1+j,y-1,2,3);
      }
    }
  });
}
function billboard(){
  return canvasTexture(1024,128,(g,w,h)=>{
    g.fillStyle='#101d29';g.fillRect(0,0,w,h);g.fillStyle='#e4ae5f';g.fillRect(0,0,w,5);g.fillRect(0,h-5,w,5);
    g.font='900 italic 62px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#e5e3d7';g.fillText('HARBOR STADIUM',w/2,h/2);
  });
}
function playerModel(p){
  const team=TEAMS[p.team],big=p.i<5?1.15:.96;
  const root=new T.Group(),body=new T.Group();
  root.add(body);
  const uniform=material(team.color),pants=material(team.pants),trim=material(team.trim),helmet=material(team.helmet,.38);
  const dark=material(0x192029),skin=material([0x855338,0xc49069,0x6f4534][p.num%3]),metal=material(0xb1b6b6);
  oval(body,uniform,0,1.19,0,.33*big,.40,.23*big);
  oval(body,uniform,0,1.41,0,.48*big,.22,.25);
  oval(body,pants,0,.87,0,.27*big,.22,.19);
  oval(body,helmet,0,1.74,-.01,.22,.24,.23);
  box(body,trim,0,1.93,-.01,.045,.023,.28);
  oval(body,skin,0,1.69,-.155,.142,.132,.084);
  box(body,dark,0,1.753,-.215,.26,.051,.05);
  for(const y of [1.618,1.666])box(body,metal,0,y,-.229,.27,.023,.025);
  for(const side of [-1,1]){
    box(body,metal,side*.134,1.65,-.21,.022,.125,.035);
    box(body,trim,side*.183,1.77,.015,.059,.046,.19);
    box(body,trim,side*.166,.813,.161,.068,.33,.036);
  }
  for(const side of [1,-1]){
    const patch=new T.Mesh(numberGeo,jerseyNumber(p.num));
    patch.position.set(0,1.33,side*.239);patch.rotation.y=side===1?0:Math.PI;body.add(patch);
  }
  const legs=[],arms=[];
  for(const sign of [-1,1]){
    const leg=new T.Group();leg.position.set(sign*.16,.88,0);body.add(leg);legs.push(leg);
    oval(leg,pants,0,-.19,0,.126,.245,.13);
    const shin=new T.Group();shin.position.y=-.36;leg.add(shin);leg.userData.shin=shin;
    oval(shin,trim,0,-.16,0,.089,.19,.087);
    oval(shin,dark,0,-.34,-.06,.103,.068,.17);
    const arm=new T.Group();arm.position.set(sign*.38*big,1.39,0);body.add(arm);arms.push(arm);
    arm.rotation.z=sign*.17;
    oval(arm,uniform,0,-.05,0,.135,.175,.14);
    box(arm,trim,0,-.12,.119,.16,.037,.035);
    oval(arm,skin,0,-.26,-.045,.088,.18,.085);
    oval(arm,dark,0,-.39,-.09,.077,.085,.089);
  }
  const shadow=new T.Mesh(shadowGeo,playerShadow);
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;shadow.scale.set(1,.66,1);root.add(shadow);
  const solids=[];
  root.traverse(mesh=>{
    if(mesh.geometry===boxGeo||mesh.geometry===ovalGeo){solids.push(mesh);mesh.visible=false}
  });
  return {root,body,arms,legs,solids};
}

function batchStadiumBoxes(scene){
  const groups=new Map();
  for(const mesh of scene.children){
    if(mesh.geometry!==boxGeo)continue;
    const list=groups.get(mesh.material)||[];
    list.push(mesh);groups.set(mesh.material,list);
  }
  for(const [mat,meshes] of groups){
    if(meshes.length<2)continue;
    const batch=new T.InstancedMesh(boxGeo,mat,meshes.length);
    for(let i=0;i<meshes.length;i++){
      meshes[i].updateMatrix();
      batch.setMatrixAt(i,meshes[i].matrix);
    }
    batch.computeBoundingSphere();
    scene.remove(...meshes);
    scene.add(batch);
  }
}
function flatRing(scene,radius,width,color){
  const ring=new T.Mesh(new T.RingGeometry(radius-width,radius,32),new T.MeshBasicMaterial({color,side:T.DoubleSide}));
  ring.rotation.x=-Math.PI/2;
  ring.position.y=.055;
  scene.add(ring);
  return ring;
}
function routeGeometry(){
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(3*3*96),3));
  geometry.setDrawRange(0,0);
  return geometry;
}
function routeStrip(vertices,offset,points,width){
  const triangle=(x1,y1,x2,y2,x3,y3)=>{
    vertices.set([x1,.062,-y1,x2,.062,-y2,x3,.062,-y3],offset*3);
    offset+=3;
  };
  const used=[points[0]];
  for(const point of points.slice(1)){
    const [x,y]=used.at(-1);
    if(Math.hypot(point[0]-x,point[1]-y)>.25)used.push(point);
  }
  for(let i=1;i<used.length;i++){
    const [x1,y1]=used[i-1],[x2,y2]=used[i];
    const length=Math.hypot(x2-x1,y2-y1),dx=(x2-x1)/length,dy=(y2-y1)/length;
    const ax=-dy*width,ay=dx*width;
    triangle(x1+ax,y1+ay,x1-ax,y1-ay,x2-ax,y2-ay);
    triangle(x1+ax,y1+ay,x2-ax,y2-ay,x2+ax,y2+ay);
    if(i===used.length-1){
      const back=Math.min(1.35,length*.8),spread=width*3.7;
      triangle(x2,y2,x2-dx*back-dy*spread,y2-dy*back+dx*spread,x2-dx*back+dy*spread,y2-dy*back-dx*spread);
    }
  }
  return offset;
}
export class Stadium {
  constructor(container){
    this.container=container;
    this.scene=new T.Scene();
    this.scene.background=new T.Color(0x506b83);
    this.scene.fog=new T.FogExp2(0x668096,.0048);
    this.camera=new T.PerspectiveCamera(48,1,.1,460);
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.maxPixelRatio=matchMedia('(pointer: coarse)').matches?1.35:1.6;
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.42;
    container.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight(0xd6eaff,0x67835d,2.1));
    const sun=new T.DirectionalLight(0xffe1b0,2.6);sun.position.set(-34,69,-56);this.scene.add(sun);
    const fill=new T.DirectionalLight(0xb7dbff,.8);fill.position.set(45,20,50);this.scene.add(fill);
    this.stadium();
    batchStadiumBoxes(this.scene);
    this.players=new Map();
    this.playerBatches=new Map();
    this.ball=oval(this.scene,material(0x884625),0,0,0,.14,.13,.27);
    box(this.ball,new T.MeshBasicMaterial({color:0xf2e3c1}),0,.94,0,.24,.16,1.08);
    this.line=box(this.scene,new T.MeshBasicMaterial({color:0x72ccf7,transparent:true,opacity:.62}),0,.035,0,WIDTH,.014,.18);
    this.first=box(this.scene,new T.MeshBasicMaterial({color:0xffc142,transparent:true,opacity:.78}),0,.04,0,WIDTH,.014,.18);
    this.ring=flatRing(this.scene,.99,.22,0xffd17a);
    this.ringBorder=flatRing(this.scene,1.08,.13,0x272126);
    this.ringBorder.position.y=.053;
    this.landing=flatRing(this.scene,1.03,.13,0xffe7a0);
    this.routeMesh=new T.Mesh(routeGeometry(),new T.MeshBasicMaterial({
      color:0x96edff,side:T.DoubleSide,transparent:true,opacity:.74,depthWrite:false
    }));
    this.routeMesh.frustumCulled=false;
    this.scene.add(this.routeMesh);
    this.ballShadow=new T.Mesh(shadowGeo,new T.MeshBasicMaterial({color:0x10261e,transparent:true,opacity:.55,depthWrite:false}));
    this.ballShadow.rotation.x=-Math.PI/2;
    this.scene.add(this.ballShadow);
    this.trail=Array.from({length:4},(_,i)=>oval(this.scene,new T.MeshBasicMaterial({
      color:0xffde96,transparent:true,depthWrite:false,opacity:.52-i*.1
    }),0,0,0,.096-i*.011,.096-i*.011,.096-i*.011));
    const chain=material(0xe67424);
    this.chains=[box(this.scene,chain,-27.16,1,-25,.15,1.95,.15),box(this.scene,chain,-27.16,1,-35,.15,1.95,.15)];
    for(const marker of this.chains)box(marker,new T.MeshBasicMaterial({color:0xffca69}),0,.44,0,2.6,.14,3.4);
    this.target=new T.Vector3();this.goal=new T.Vector3();this.goalTarget=new T.Vector3();
    this.projected=new T.Vector3();
    this.menuTime=0;
    new ResizeObserver(()=>this.resize()).observe(container);this.resize();
  }
  resize(){
    const w=this.container.clientWidth||1,h=this.container.clientHeight||1;
    this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.maxPixelRatio,Math.sqrt(2300000/(w*h))));
    this.renderer.setSize(w,h,false);
  }
  stadium(){
    const scene=this.scene;
    const field=new T.Mesh(new T.PlaneGeometry(66,120),new T.MeshStandardMaterial({map:turfTexture(),roughness:.93}));
    field.rotation.x=-Math.PI/2;field.position.z=-50;scene.add(field);
    this.turf=field.material.map;
    this.turf.center.set(.5,.5);
    box(scene,material(0x293b43),0,-.65,-50,204,1,220);
    const concrete=material(0x536071),rail=material(0xadb7bf),dark=material(0x202b38),light=new T.MeshBasicMaterial({color:0xfff5d7});
    const crowd=new T.MeshStandardMaterial({map:crowdTexture(),roughness:1});
    const sign=new T.MeshBasicMaterial({map:billboard()});
    for(const side of [-1,1]){
      box(scene,dark,side*34,1.2,-50,1.5,2.4,133);
      box(scene,rail,side*34,2.55,-50,.3,.13,131);
      for(let tier=0;tier<3;tier++){
        const x=side*(40+tier*13),y=4+tier*7;
        box(scene,concrete,x,y-2.2,-50,15,3.3,143);
        for(let section=0;section<8;section++){
          const bank=new T.Mesh(new T.PlaneGeometry(16.5,13.6),crowd);
          bank.rotation.order='YXZ';bank.rotation.y=-side*Math.PI/2;bank.rotation.x=-.98;
          bank.position.set(x,y,-109+section*16.9);scene.add(bank);
        }
        box(scene,tier===1?sign:dark,x-side*6,y-1.8,-50,.6,.85,137);
        if(tier===1){
          const banner=new T.Mesh(new T.PlaneGeometry(24,3),sign);banner.rotation.y=-side*Math.PI/2;
          banner.position.set(x-side*6.5,y-1.6,-50);scene.add(banner);
        }
      }
      for(const z of [20,-50,-121]){
        box(scene,concrete,side*59,20,z,.55,38,.65);
        box(scene,dark,side*57,39,z,2,3.3,9);
        for(let i=0;i<6;i++)for(let j=0;j<2;j++)box(scene,light,side*55.9,38.4+j*1.2,z-3.75+i*1.5,.12,.7,.95);
      }
      for(let i=0;i<11;i++)box(scene,i%2?dark:rail,side*29.8,.42,-14-i*6,.66,.62,1.35);
    }
    for(const end of [1,-1]){
      const z=end===1?13:-113;
      for(let i=0;i<3;i++){
        box(scene,concrete,0,2.5+i*6,z+end*i*11,75,3,14);
        const bank=new T.Mesh(new T.PlaneGeometry(73,13),crowd);
        bank.rotation.x=end===1?-2.25:-.89;bank.material.side=T.DoubleSide;
        bank.position.set(0,5+i*6,z+end*i*11);scene.add(bank);
      }
      const board=new T.Mesh(new T.PlaneGeometry(29,3.625),sign);
      board.position.set(0,15,z+end*12);board.rotation.y=end===1?Math.PI:0;scene.add(board);
      const goal=material(0xf0c246),post=end===1?9.9:-109.9;
      box(scene,goal,0,1.5,post,.32,3,.32);
      box(scene,goal,0,3.1,post,6.2,.21,.21);
      for(const x of [-3.1,3.1])box(scene,goal,x,7.1,post,.17,8,.17);
      for(const x of [-26.25,26.25])for(const offset of [0,9.5])box(scene,material(0xf76735),x,.28,end===1?offset:-100-offset,.24,.55,.24);
    }
    const rng=seeded();
    for(let i=0;i<33;i++){
      const x=-170+i*10,z=-156-rng()*35,h=6+rng()*25;
      box(scene,material(i%2?0x435261:0x384958),x,h/2-1,z,5+rng()*6,h,8+rng()*11);
    }
  }
  updateRoutes(frame,play){
    const key=play?[play.name,frame.spot,...frame.off.slice(7).map(p=>p.x)].join('/'):'';
    this.routeMesh.visible=Boolean(play&&(play.routes||Number.isFinite(play.lane)));
    if(!this.routeMesh.visible||key===this.routeKey)return;
    this.routeKey=key;
    const geometry=this.routeMesh.geometry,position=geometry.getAttribute('position');
    const location=(x,y)=>[clamp(x,-WIDTH/2+.2,WIDTH/2-.2),clamp(y,-9.8,109.8)];
    let count=0;
    if(play.routes){
      play.routes.forEach((route,i)=>{
        const p=frame.off[7+i];
        if(!p)return;
        const points=[[p.x,p.y],...route.map(([x,y])=>location(p.x+x,frame.spot+y))];
        count=routeStrip(position.array,count,points,.21);
      });
    }else{
      const p=frame.off[6],lane=play.lane;
      const points=[[p.x,p.y],location(lane*.48,frame.spot-3),location(lane,frame.spot+3),location(lane*.94,frame.spot+11)];
      count=routeStrip(position.array,count,points,.26);
    }
    geometry.setDrawRange(0,count);
    position.needsUpdate=true;
  }
  updatePlayers(frame,menu){
    const phase=frame.phase??frame.state;
    const lineupKey=menu?'menu':phase==='pre'?[frame.possession,frame.spot,frame.active].join(':'):null;
    if(lineupKey!==null&&lineupKey===this.lineupKey)return;
    this.lineupKey=lineupKey;
    const players=[...frame.off,...frame.def],visible=new Set();
    for(const shapes of this.playerBatches.values())for(const batch of shapes.values())batch.count=0;
    for(const p of players){
      const key=p.team+':'+p.role+':'+p.i;
      visible.add(key);
      let model=this.players.get(key);
      if(menu&&!model)continue;
      if(!model){model=playerModel(p);this.players.set(key,model);this.scene.add(model.root)}
      model.root.visible=!menu;
      if(menu)continue;
      model.root.position.set(p.x,0,-p.y);
      model.root.rotation.y=-p.facing;
      const speed=Math.hypot(p.vx,p.vy),stride=Math.min(speed/8,1.25),swing=Math.sin(frame.t*12+p.i*1.9);
      const crouch=frame.t===0&&(p.i<5||p.role==='LB');
      const offense=p.team===frame.possession;
      const dive=!offense&&p.i===frame.control&&frame.dive>0;
      const handsUp=!offense&&p.i===frame.control&&frame.playBall>0;
      const release=p.role==='QB'&&frame.flight&&!frame.flight.kick&&frame.flight.elapsed<.23;
      const receiving=offense&&frame.flight&&p.i===7+frame.flight.index&&frame.flight.duration-frame.flight.elapsed<.23;
      const carrying=offense&&p.i===frame.carrierIndex&&!frame.flight&&frame.t>0;
      model.body.position.y=p.down?.09:dive?.31:crouch?-.20:Math.abs(swing)*stride*.07;
      model.body.rotation.x=p.down?-1.51:dive?-1.08:crouch?-.48:-stride*.16;
      model.body.rotation.z=p.down?.16:0;
      for(let i=0;i<2;i++){
        const step=swing*stride*(i?1:-1);
        model.legs[i].rotation.x=dive?.32:step*.84-(crouch?.34:0);
        model.legs[i].userData.shin.rotation.x=p.down?.12:Math.max(0,step)*.87+(crouch?.59:.12);
        let arm=-step*.72+(crouch?.36:.18);
        if(dive||handsUp||receiving)arm=1.56;
        else if(release&&i===1)arm=2.1-frame.flight.elapsed*6;
        else if(carrying&&i===1)arm=.82;
        model.arms[i].rotation.x=arm;
      }
      model.root.updateMatrixWorld(true);
      for(const mesh of model.solids){
        let shapes=this.playerBatches.get(mesh.material);
        if(!shapes){shapes=new Map();this.playerBatches.set(mesh.material,shapes)}
        let batch=shapes.get(mesh.geometry);
        if(!batch){
          batch=new T.InstancedMesh(mesh.geometry,mesh.material,160);
          batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
          batch.frustumCulled=false;
          batch.count=0;
          shapes.set(mesh.geometry,batch);
          this.scene.add(batch);
        }
        batch.setMatrixAt(batch.count++,mesh.matrixWorld);
      }
    }
    for(const [key,m] of this.players)if(!visible.has(key))m.root.visible=false;
    for(const shapes of this.playerBatches.values())for(const batch of shapes.values()){
      batch.visible=batch.count>0;
      if(batch.visible)batch.instanceMatrix.needsUpdate=true;
    }
  }
  render(frame,mode,dt,menu=false,replay=false,presentation={}){
    const active=(frame.offenseHuman?frame.off:frame.def)[frame.active];
    this.updatePlayers(frame,menu);
    this.updateRoutes(frame,menu||replay?null:presentation.play);
    const orientation=!menu&&frame.possession===1?Math.PI:0;
    if(orientation!==this.turf.rotation)this.turf.rotation=orientation;
    this.line.visible=this.first.visible=this.ball.visible=!menu;
    this.ring.visible=this.ringBorder.visible=!menu&&!!active&&!replay;
    this.line.position.z=-frame.spot;this.first.position.z=-frame.marker;
    this.chains.forEach((chain,i)=>{
      chain.visible=!menu;
      chain.position.z=-(i?frame.marker:frame.spot);
    });
    if(active){
      for(const ring of [this.ring,this.ringBorder]){ring.position.x=active.x;ring.position.z=-active.y}
    }
    this.ball.position.set(frame.ball.x,frame.ball.h,-frame.ball.y);
    const flight=frame.flight;
    this.ball.scale.set(flight?.kick?.22:.18,flight?.kick?.19:.16,flight?.kick?.34:.29);
    this.ball.rotation.set(.3,flight?Math.atan2(flight.from.x-flight.to.x,flight.to.y-flight.from.y):0,flight?frame.t*20:0);
    this.ballShadow.visible=!menu&&Boolean(flight);
    this.ballShadow.position.set(frame.ball.x,.05,-frame.ball.y);
    this.ballShadow.scale.setScalar(.5+frame.ball.h*.07);
    this.landing.visible=!menu&&!replay&&Boolean(flight&&!flight.kick);
    if(this.landing.visible)this.landing.position.set(flight.to.x,.057,-flight.to.y);
    this.trail.forEach((dot,i)=>{
      dot.visible=!menu&&Boolean(flight&&flight.elapsed>(i+1)*.033);
      if(!dot.visible)return;
      const seconds=(i+1)*.033,step=seconds/flight.duration,progress=flight.elapsed/flight.duration;
      const arc=flight.kick?13:flight.bullet?1.6:4.4;
      const drop=(frame.ball.h-flight.from.h-Math.sin(Math.PI*progress)*arc)/progress;
      dot.position.set(frame.ball.x-(flight.to.x-flight.from.x)*step,
        frame.ball.h+Math.sin(Math.PI*(progress-step))*arc-Math.sin(Math.PI*progress)*arc-drop*step,
        -frame.ball.y+(flight.to.y-flight.from.y)*step);
    });
    const aspect=this.camera.aspect,portrait=aspect<1.1;
    const pin=menu||replay?null:presentation.pin;
    const fieldY=clamp(frame.ball.y,2,99);
    const zoom=menu||replay?1:clamp(presentation.zoom??1,.7,1.45);
    const canSeeRoutes=Boolean(presentation.play||presentation.showReceivers);
    const x=pin?.x??(active&&!frame.offenseHuman?active.x*.38+frame.ball.x*.62:frame.ball.x*.63);
    const y=pin?.y??(active&&!frame.offenseHuman?clamp(active.y*.35+fieldY*.65,2,99):fieldY);
    const fit=canSeeRoutes||mode===1?Math.max(1,1.27/aspect):Math.max(1,.78/aspect);
    if(menu){
      this.menuTime+=dt;
      this.goal.set(43+Math.sin(this.menuTime*.22)*4,22,15);this.goalTarget.set(-4,2,-52);
    } else if(replay){
      this.goal.set(30,10,-fieldY+14);this.goalTarget.set(frame.ball.x*.7,1.1,-fieldY-1);
    } else if(mode===1){
      this.goal.set(x,38*fit,-y+22*fit);this.goalTarget.set(x,0,-y-(pin?0:8));
    } else if(mode===2){
      this.goal.set(x,(portrait?25:16)*fit,-y+19*fit);this.goalTarget.set(x,1,-y-(pin?0:9));
    } else {
      this.goal.set((portrait?4:11)+x,(portrait?37:31)*fit,-y+25*fit);this.goalTarget.set(x,0,-y-(pin?0:8));
    }
    this.goal.lerp(this.goalTarget,1-1/zoom);
    const changedPossession=this.lastPossession!==frame.possession;
    const snap=!this.initialized||this.wasMenu!==menu||(!pin&&!replay&&changedPossession&&Math.abs(this.target.z-this.goalTarget.z)>39);
    this.lastPossession=frame.possession;
    this.initialized=true;this.wasMenu=menu;
    const blend=snap?1:1-Math.exp(-dt*5.4);
    this.camera.position.lerp(this.goal,blend);this.target.lerp(this.goalTarget,blend);
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene,this.camera);
  }
  screen(p){
    const v=this.projected.set(p.x,2.5,-p.y).project(this.camera);
    return {x:(v.x+1)*50,y:(1-v.y)*50,visible:Math.abs(v.x)<.95&&Math.abs(v.y)<.96&&v.z<1};
  }
}
