import * as T from './vendor/three.module.js';
import {SoftwareRenderer} from './software-renderer.mjs';
import {WINDOWS,OBSTACLES,STATIONS,WEAPONS} from './core.mjs';
const COLORS=[0xeebc65,0x6dd4c0,0xef839c,0x98aaff];
export class HouseRenderer {
  constructor(canvas){
    this.canvas=canvas;try{this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch{this.renderer=new SoftwareRenderer(canvas);}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.scene=new T.Scene();this.scene.background=new T.Color(0x142a35);this.scene.fog=new T.FogExp2(0x142a35,.022);
    this.camera=new T.PerspectiveCamera(73,1,.06,95);this.scene.add(this.camera);
    this.scene.add(new T.HemisphereLight(0xa8d0d8,0x4b332d,2));
    const moon=new T.DirectionalLight(0xa5d3ef,2.3);moon.position.set(-16,22,-8);this.scene.add(moon);
    this.materials=new Map();this.enemies=new Map();this.mates=new Map();this.boards=new Map();this.particles=[];this.clock=0;this.kick=0;this.flash=0;this.menu=true;
    this.buildWorld();this.buildGun();this.resize();
  }
  mat(color){if(!this.materials.has(color))this.materials.set(color,new T.MeshStandardMaterial({color,roughness:.9,flatShading:true}));return this.materials.get(color);}
  box(x,y,z,w,h,d,color,parent=this.scene,rotation=0){const m=new T.Mesh(new T.BoxGeometry(w,h,d),this.mat(color));m.position.set(x,y,z);m.rotation.y=rotation;parent.add(m);return m;}
  cylinder(x,y,z,r,h,color,parent=this.scene,segments=6){const m=new T.Mesh(new T.CylinderGeometry(r,r,h,segments),this.mat(color));m.position.set(x,y,z);parent.add(m);return m;}
  label(text,color='#f7dca6',background='#1b373c',w=2.2,h=.8){
    const c=document.createElement('canvas');c.width=512;c.height=192;const g=c.getContext('2d');g.fillStyle=background;g.fillRect(0,0,512,192);g.strokeStyle=color;g.lineWidth=5;g.strokeRect(12,12,488,168);g.fillStyle=color;g.textAlign='center';
    const lines=text.split('\n');lines.forEach((line,i)=>{g.font=(i===0?'bold 36px':'25px')+' monospace';g.fillText(line,256,lines.length===1?110:75+i*49);});
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));return m;
  }
  buildWorld(){
    this.box(0,-.22,0,80,.3,80,0x263f3b);
    this.box(0,-.04,0,18,.22,14,0x95674d);
    for(let i=-17;i<18;i++)this.box(i*.5,.08,0,.014,.008,14,0x684c3d);
    for(let z=-6;z<=6;z+=2)for(let x=-8;x<9;x+=3)this.box(x+((z%4)?1.5:0),.084,z,.014,.008,2,0x684c3d);
    this.box(-4.4,.094,.6,5,.01,4.4,0x5a7773);this.box(-4.4,.102,.6,4.65,.01,4.05,0x344f56);
    for(let i=0;i<7;i++)this.box(-6.4+i*.65,.11,.6,.035,.01,3.7,0xa08260);
    // Continuous exterior walls with real openings for each window.
    for(const side of [{axis:'x',v:7,windows:[-5,5]},{axis:'x',v:-7,windows:[-5,5]},{axis:'z',v:-9,windows:[0]},{axis:'z',v:9,windows:[0]}]){
      const horizontal=side.axis==='x',edge=horizontal?9:7;let cursor=-edge;
      const part=(a,b,y,h,col)=>horizontal?this.box((a+b)/2,y,side.v,b-a,h,.3,col):this.box(side.v,y,(a+b)/2,.3,h,b-a,col);
      for(const pos of side.windows){part(cursor,pos-1.25,1.7,3.4,0x6c8277);part(pos-1.25,pos+1.25,.4,.8,0x6c8277);part(pos-1.25,pos+1.25,3.04,.78,0x6c8277);cursor=pos+1.25;}
      part(cursor,edge,1.7,3.4,0x6c8277);part(-edge,edge,.2,.3,0x304b4b);part(-edge,edge,3.2,.17,0xe4c89b);
    }
    for(const w of WINDOWS){
      const group=new T.Group();group.position.set(w.x,0,w.z);group.rotation.y=w.nx?Math.PI/2:0;this.scene.add(group);
      this.box(-1.32,1.73,0,.12,2.05,.46,0xe0c6a0,group);this.box(1.32,1.73,0,.12,2.05,.46,0xe0c6a0,group);
      this.box(0,.8,0,2.8,.15,.6,0xe0c6a0,group);this.box(0,2.7,0,2.8,.15,.48,0xe0c6a0,group);
      const boards=[];for(let i=0;i<3;i++){const b=this.box(0,1.04+i*.52,0,2.55,.26,.13,i===1?0xaf8157:0xc09361,group);b.rotation.z=(i-1)*.08;boards.push(b);for(const x of [-1.05,1.05])this.box(x,0,.075,.035,.045,.02,0x434447,b);}
      this.boards.set(w.id,boards);
      const sign=this.label(w.name.toUpperCase(),'#d3d1a7','#334e50',1.7,.42);sign.position.set(w.x-w.nx*.3,2.96,w.z-w.nz*.3);sign.rotation.y=w.nz===1?Math.PI:w.nx===1?-Math.PI/2:w.nx===-1?Math.PI/2:0;this.scene.add(sign);
    }
    for(const o of OBSTACLES){
      if(o.kind==='wall'){this.box(o.x,o.h/2,o.z,o.w,o.h,o.d,0x788578);this.box(o.x,3.2,o.z,.4,.18,o.d,0xe4c89b);continue;}
      if(o.kind==='sofa'){
        this.box(o.x,.38,o.z,o.w,.5,o.d,0xb67548);this.box(o.x,.78,o.z-.28,o.w,.55,.23,0xa0603e);
        for(const dx of [-o.w/2+.15,o.w/2-.15])this.box(o.x+dx,.65,o.z,.3,.55,o.d,0xb8794d);
        for(let i=-1;i<=1;i++)this.box(o.x+i*1.1,.65,o.z+.03,1,.08,.54,0xd09a67);
      }else{
        this.box(o.x,o.h,o.z,o.w,.13,o.d,o.kind==='counter'?0xe1d0a4:0xa27349);
        for(const dx of [-1,1])for(const dz of [-1,1])this.box(o.x+dx*(o.w/2-.12),o.h/2,o.z+dz*(o.d/2-.12),.13,o.h,.13,0x4c514b);
        if(o.kind==='counter')this.box(o.x,.5,o.z,o.w,.9,o.d,0x597f7e);
        else {const book=this.box(o.x,.14+o.h,o.z,.6,.1,.4,0xd9b482);book.rotation.y=.2;this.cylinder(o.x+.5,.23+o.h,o.z,.09,.22,0xead2ad);}
      }
    }
    // Ceiling beams, lamps, picture frames, appliances and household clutter.
    this.ceiling=this.box(0,3.58,0,18.4,.2,14.4,0x454f4a);
    this.roof=new T.Group();this.scene.add(this.roof);for(const side of [-1,1]){const roof=this.box(0,4.65,side*3.8,19.3,.18,8.1,0x314951,this.roof);roof.rotation.x=side*.32;}this.box(5,5.8,-2,1.1,2,1.2,0x8b7666,this.roof);
    for(const x of [-9,9]){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([x,3.5,-7.7,x,3.5,7.7,x,5.9,0],3));geo.computeVertexNormals();const mat=new T.MeshStandardMaterial({color:0x788578,side:T.DoubleSide,flatShading:true});this.roof.add(new T.Mesh(geo,mat));}
    for(let z=-6;z<=6;z+=3)this.box(0,3.35,z,18,.22,.15,0x614e3c);
    for(const x of [-4.5,4.5])for(const z of [-3,3]){
      this.cylinder(x,3.1,z,.025,.4,0x463e33);this.cylinder(x,2.86,z,.3,.15,0xe3bd76);
      const lamp=new T.PointLight(0xffcd83,16,10,2);lamp.position.set(x,2.55,z);this.scene.add(lamp);
    }
    this.box(-8,1.2,-2.6,1.3,2.1,.55,0x544d3c);
    for(let i=0;i<5;i++)for(let j=0;j<5;j++)this.box(-8.5+j*.2,.4+i*.36,-2.27,.14,.28,.14,[0xc7a36d,0x547b73,0x995844][(i+j)%3]);
    this.box(8,1.1,-2.7,1,2,.9,0xc0d0bb);this.box(7.45,1.3,-2.5,.08,.3,.06,0x586a64);
    this.box(-1.2,.4,5.5,1.8,.7,.6,0x715d44);this.box(-1.2,1.05,5.5,1.2,.7,.26,0x263637);
    const tv=this.label('PLEASE HOLD.\nYOUR CALL MATTERS.','#79ccba','#173b3b',1.06,.52);tv.position.set(-1.2,1.05,5.34);tv.rotation.y=Math.PI;this.scene.add(tv);
    for(const st of STATIONS){
      this.box(st.x,.6,st.z,1.05,1.2,.65,st.id==='health'?0xd6d0b0:0x3c5354);
      const sign=this.label(st.id==='ammo'?'AMMUNITION\n120 CREDITS':st.id==='health'?'FIRST AID\n200 CREDITS':st.id==='shotgun'?'SEVERANCE\n600 CREDITS':'COUNTEROFFER\n1000 CREDITS',st.id==='health'?'#273e3b':'#edca80',st.id==='health'?'#ded6ac':'#1c3e44',1.5,.6);
      sign.position.set(st.x,1.65,st.z);sign.rotation.y=st.x>0?-Math.PI/2:Math.PI/2;this.scene.add(sign);
      if(st.id==='health'){this.box(st.x,1.23,st.z,.65,.06,.17,0x974733);this.box(st.x,1.23,st.z,.17,.065,.5,0x974733);}
    }
    // Neighborhood: no sci-fi corridors. Blue-hour street, crooked trees, pickets.
    this.box(0,-.035,17,70,.05,5.5,0x22333d);this.box(0,.02,13.9,70,.1,1,0x657d7b);
    for(let x=-30;x<30;x+=5)this.box(x,.01,17,2,.015,.1,0xc8b77a);
    for(let x=-28;x<29;x+=14)for(const z of [-25,28]){
      this.box(x,2,z,8,4,7,[0x4c6b6c,0x43535f,0x826d66][Math.abs(x/14)%3|0]);
      const roof=new T.Mesh(new T.ConeGeometry(6.5,2.6,4),this.mat(0x283c47));roof.rotation.y=Math.PI/4;roof.position.set(x,5.1,z);this.scene.add(roof);
      for(const dx of [-2,2])this.box(x+dx,2.2,z+(z<0?3.51:-3.51),1,1.3,.03,0xd0ac65);
    }
    for(let i=0;i<28;i++){
      const a=i*2.399,r=24+(i%5)*2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      this.cylinder(x,2,z,.25,4,0x374642);const crown=new T.Mesh(new T.IcosahedronGeometry(2.7,0),this.mat(i%2?0x2d5550:0x3b6053));crown.position.set(x,4.5,z);crown.scale.y=1.5;this.scene.add(crown);
    }
    for(const x of [-12,12]){
      this.cylinder(x,2.4,13,.08,4.8,0x243e42);this.box(x,4.85,13,.5,.6,.5,0xe4c48b);const light=new T.PointLight(0xffda9b,25,12,2);light.position.set(x,4.4,13);this.scene.add(light);
    }
    for(let i=0;i<32;i++){const x=-15+i;this.box(x,.6,-14,.13,1.3,.1,0x7c9892);}
    for(const y of [.35,.9])this.box(0,y,-14,31,.08,.13,0x7c9892);
    this.box(-5,.12,10,3,.18,6,0x697f7b);
    const sign=this.label('EVERWELL ASSURANCE\nWE NEVER LET GO.','#d4c7a2','#2c4c52',4,1.4);sign.position.set(12,3,9);sign.rotation.y=-.55;this.scene.add(sign);this.box(12,1.5,9,.17,3,.17,0x566b67);
    this.moon=new T.Mesh(new T.SphereGeometry(2,12,8),new T.MeshBasicMaterial({color:0xd0dfbc}));this.moon.position.set(-22,28,-35);this.scene.add(this.moon);
    const count=650,positions=new Float32Array(count*3);for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*60;positions[i*3+1]=Math.random()*18;positions[i*3+2]=(Math.random()-.5)*60;}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));this.rain=new T.Points(geo,new T.PointsMaterial({color:0xa0c6c9,size:.035,transparent:true,opacity:.6}));this.scene.add(this.rain);
  }
  figure(type,color){
    const g=new T.Group(),big=type==='chairman',heavy=type==='auditor';const suit=color||(big?0x5c3d63:heavy?0x647777:type==='runner'?0x62495f:0x304a61),skin=color?0xd6b795:0x9fbaa0;
    this.box(0,1.1,0,.58,.78,.33,suit,g);this.box(0,1.4,-.18,.24,.26,.03,0xe4d0ac,g);
    const tie=this.box(0,1.2,-.21,.08,.43,.03,big?0xe5ba57:0xa3554c,g);tie.rotation.z=.15;
    this.box(0,1.85,-.015,.42,.47,.4,skin,g);this.box(0,2.09,.025,.44,.12,.39,0x394d49,g);
    this.box(-.105,1.91,-.225,.11,.045,.025,color?0x283938:0xe7d46e,g);this.box(.105,1.91,-.225,.11,.045,.025,color?0x283938:0xe7d46e,g);
    this.box(.04,1.72,-.225,.19,.045,.02,0x3b5551,g);
    const limbs=[];for(const side of [-1,1]){
      const leg=new T.Group();leg.position.set(side*.17,.75,0);g.add(leg);this.box(0,-.34,0,.21,.7,.24,suit,leg);this.box(0,-.7,-.06,.24,.15,.38,0x233337,leg);limbs.push(leg);
      const arm=new T.Group();arm.position.set(side*.4,1.45,0);g.add(arm);this.box(0,-.28,0,.18,.57,.2,suit,arm);this.box(0,-.6,0,.16,.16,.17,skin,arm);limbs.push(arm);
      if(side===1&&!color){this.box(.03,-.85,0,.38,.35,.15,big?0xb7a063:0x594c38,arm);this.box(.03,-.65,0,.17,.08,.06,0x9c976c,arm);}
    }
    if(heavy)this.box(0,1.32,-.23,.44,.55,.09,0x84968c,g);
    if(big){const crown=this.label('CEO','#fff0b3','#67486c',.36,.2);crown.position.set(0,1.36,-.215);crown.rotation.y=Math.PI;g.add(crown);g.scale.set(1.45,1.28,1.45);}
    g.userData={limbs,baseScale:g.scale.clone()};return g;
  }
  buildGun(){
    this.gun=new T.Group();this.camera.add(this.gun);this.gun.position.set(.31,-.31,-.6);
    this.box(.04,-.14,.06,.13,.3,.17,0x3c4c4c,this.gun);this.box(0,0,-.16,.17,.16,.5,0x637c80,this.gun);
    this.barrel=this.box(0,.035,-.42,.085,.085,.2,0x263c43,this.gun);this.box(0,.11,-.31,.035,.06,.045,0xc6b187,this.gun);
    this.box(.06,-.2,.18,.18,.17,.32,0xd6ae84,this.gun);this.box(.07,-.3,.37,.22,.21,.3,0x546d65,this.gun);
    this.flashMesh=new T.Mesh(new T.ConeGeometry(.13,.4,5),new T.MeshBasicMaterial({color:0xffd98b}));this.flashMesh.rotation.x=-Math.PI/2;this.flashMesh.position.set(0,.02,-.67);this.flashMesh.visible=false;this.gun.add(this.flashMesh);
    this.flashLight=new T.PointLight(0xffbb66,0,5);this.flashLight.position.set(0,0,-.4);this.gun.add(this.flashLight);
  }
  resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=w<h?85:73;this.camera.updateProjectionMatrix();}
  event(events,selfId){for(const e of events){
    if(e.type==='shot'&&e.playerId===selfId){this.kick=.09;this.flash=.055;}
    if(e.type==='kill'){for(let i=0;i<12;i++){const m=this.box(e.x,1+Math.random(),e.z,.15,.015,.2,i%3?0xd6c7a1:0x6da69e);this.particles.push({mesh:m,life:1.5,vx:(Math.random()-.5)*3,vy:2+Math.random(),vz:(Math.random()-.5)*3});}}
  }}
  render(dt,state,selfId='p1',view={}){
    this.clock+=dt;this.kick=Math.max(0,this.kick-dt*.8);this.flash=Math.max(0,this.flash-dt);
    const p=state.players.find(p=>p.id===selfId)||state.players[0];
    this.menu=!!view.menu;this.ceiling.visible=!this.menu;this.roof.visible=this.menu;this.gun.visible=!this.menu&&!p.down&&!p.dead;
    if(this.menu){const t=this.clock*.025;this.camera.position.set(Math.sin(t)*4-16,12,22);this.camera.lookAt(0,.5,0);}
    else {const cam=p.dead?(state.players.find(q=>!q.dead&&!q.down)||p):p;const alpha=view.remote?1-Math.exp(-dt*20):1;
      if(this.lastMenu!==false)this.camera.position.set(cam.x,cam.down?.65:1.6,cam.z);
      this.camera.position.x+=(cam.x-this.camera.position.x)*alpha;this.camera.position.z+=(cam.z-this.camera.position.z)*alpha;this.camera.position.y=cam.down?.65:1.6;
      this.camera.rotation.set(cam===p?(view.pitch??p.pitch):cam.pitch,-(cam===p?(view.angle??p.angle):cam.angle),0,'YXZ');
    }this.lastMenu=this.menu;
    this.gun.position.y=-.31+Math.sin(this.clock*7)*.006-this.kick;this.gun.rotation.x=this.kick*1.8+(p.reloading>0?-.5:0);this.gun.scale.z=p.weapon==='pistol'?1:p.weapon==='shotgun'?1.45:1.25;
    this.flashMesh.visible=this.flash>0;this.flashLight.intensity=this.flash>0?8:0;
    for(const w of state.windows){const boards=this.boards.get(w.id);boards.forEach((b,i)=>b.visible=w.health>i*40);}
    const ids=new Set();for(const e of state.enemies){ids.add(e.id);let m=this.enemies.get(e.id);if(!m){m=this.figure(e.type);m.position.set(e.x,0,e.z);this.scene.add(m);this.enemies.set(e.id,m);}
      const alpha=view.remote?1-Math.exp(-dt*18):1;m.position.x+=(e.x-m.position.x)*alpha;m.position.z+=(e.z-m.position.z)*alpha;m.position.y=e.phase==='climb'?Math.sin(e.climb*Math.PI)*.55:0;m.rotation.y=-e.angle;
      const walk=e.phase==='hunt'||e.phase==='approach';m.userData.limbs.forEach((l,i)=>{l.rotation.x=walk?Math.sin(this.clock*(e.type==='runner'?10:4)+i*Math.PI)*.35:e.phase==='barricade'&&i%2?-.8-Math.sin(this.clock*5)*.4:0;});
      m.scale.copy(m.userData.baseScale).multiplyScalar(e.hit>0?1.05:1);
    }
    for(const [id,m] of this.enemies)if(!ids.has(id)){this.scene.remove(m);m.traverse(o=>o.geometry?.dispose());this.enemies.delete(id);}
    for(const [id,m] of this.mates)if(!state.players.some(q=>q.id===id&&q.id!==selfId)){this.scene.remove(m);m.traverse(o=>o.geometry?.dispose());this.mates.delete(id);}
    for(const [i,q] of state.players.entries())if(q.id!==selfId){let m=this.mates.get(q.id);if(!m){m=this.figure('survivor',COLORS[i]);this.scene.add(m);this.mates.set(q.id,m);}m.visible=!q.dead;m.position.set(q.x,0,q.z);m.rotation.y=-q.angle;m.scale.y=q.down?.35:1;}
    const rain=this.rain.geometry.attributes.position;for(let i=0;i<rain.count;i++){let y=rain.getY(i)-dt*9;const x=rain.getX(i),z=rain.getZ(i);if(y<0)y=18;if(Math.abs(x)<9.4&&Math.abs(z)<7.4&&y<4)y=18;rain.setY(i,y);}rain.needsUpdate=true;
    for(const part of this.particles){part.life-=dt;part.mesh.position.x+=part.vx*dt;part.mesh.position.y+=part.vy*dt;part.mesh.position.z+=part.vz*dt;part.vy-=dt*4;part.mesh.rotation.z+=dt*4;}
    this.particles=this.particles.filter(p=>{if(p.life>0)return true;this.scene.remove(p.mesh);p.mesh.geometry.dispose();return false;});
    this.renderer.render(this.scene,this.camera);
  }
}
