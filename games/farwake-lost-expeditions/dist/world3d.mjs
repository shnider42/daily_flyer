import * as THREE from './vendor/three.module.js';
import { SoftwareRenderer } from './software3d.mjs';
import { availableActions, hydrateState } from './state.mjs';
import { ROOMS, PORTALS, OBSTACLES, sceneAt, portalBetween, canTraverse, movePlayer, findWalkPath, placeTerrainRock } from './world-layout.mjs';

const EYE = 1.62;
const WALK_SPEED = 2.25;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const floorY = (x,z) => z < -14 && x >= -3.5 && x <= 3.5 ? Math.max(-1.2,(z+14)*.4) : 0;

/** Real 3D exploration renderer, independent of the DOM HUD and saved mission state.
 * look() accepts CSS pixel deltas. pick() never activates an object by itself.
 * Paths walk through connected doorways; only restoring a different saved room
 * sets the camera directly to that room's safe entry point.
 */
export class NightglassWorld {
  constructor({canvas,onSceneChange=()=>{},onInteract=()=>{},onFocus=()=>{},onError=()=>{},onWalkingChange=()=>{}}) {
    this.canvas=canvas;this.onSceneChange=onSceneChange;this.onInteract=onInteract;this.onFocus=onFocus;this.onError=onError;this.onWalkingChange=onWalkingChange;this.walking=false;
    this.active=false;this.disposed=false;this.state=null;this.currentScene=null;
    this.motion={forward:0,strafe:0};this.path=[];this.yaw=0;this.pitch=0;this.focus=null;this.lastFocusKey='';
    this.props=new Map();this.propStand=new Map();this.pickMeshes=[];this.doorMeshes=[];this.resources=[];
    this.inspectionLights=[];this.inspectionMaterials=[];this.frameId=0;this.lastTime=0;this.manualLook=false;
    let context=null;try{context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'low-power'});}catch{/* A software canvas remains usable without a GPU. */}
    this.rendererMode=context?'webgl':'basic';
    this.renderer=context?new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'low-power'}):new SoftwareRenderer({canvas});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.25;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x080d14);this.scene.fog=new THREE.FogExp2(0x101820,.012);
    this.camera=new THREE.PerspectiveCamera(68,1,.07,180);this.camera.rotation.order='YXZ';
    this.scene.add(this.camera);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.vector=new THREE.Vector3();
    this._build();
    this._onContextLost=event=>{event.preventDefault();this.setActive(false);this.onError('The 3D view paused. Reload it or continue with the illustrated version.');};
    canvas.addEventListener('webglcontextlost',this._onContextLost);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    this.resize();
  }

  _mat(color,extra={}) {const m=new THREE.MeshStandardMaterial({color,roughness:.88,metalness:.18,...extra});this.resources.push(m);return m;}
  _basic(color,extra={}) {const m=new THREE.MeshBasicMaterial({color,...extra});this.resources.push(m);return m;}
  _mesh(geometry,material,x,y,z,parent=this.scene,{pick=true}={}) {
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);this.resources.push(geometry);
    if(pick)this.pickMeshes.push(mesh);return mesh;
  }
  _box(w,h,d,x,y,z,material,parent=this.scene,options) {return this._mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent,options);}
  _plane(w,h,x,y,z,material,ry=0,parent=this.scene) {const m=this._mesh(new THREE.PlaneGeometry(w,h),material,x,y,z,parent);m.rotation.y=ry;return m;}
  _cylinder(r1,r2,h,x,y,z,material,parent=this.scene,segments=12) {return this._mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material,x,y,z,parent);}
  _line(points,radius,material,parent=this.scene) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return this._mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*5),radius,5,false),material,0,0,0,parent);
  }

  _texture(kind) {
    const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
    ctx.fillStyle=kind==='floor'?'#6b7374':'#7b8280';ctx.fillRect(0,0,256,256);
    let seed=173;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
    for(let i=0;i<5500;i++){const shade=Math.floor(random()*50);ctx.fillStyle=`rgba(${shade},${shade},${shade},${random()*.12})`;ctx.fillRect(random()*256,random()*256,random()*3+1,random()*3+1);}
    ctx.strokeStyle='#283235';ctx.lineWidth=2;ctx.strokeRect(1,1,254,254);
    ctx.strokeStyle='#b0b5a91b';ctx.lineWidth=1;
    if(kind==='floor')for(let i=16;i<256;i+=32){ctx.beginPath();ctx.moveTo(i,8);ctx.lineTo(i,248);ctx.stroke();}
    else {ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(20,256);ctx.moveTo(236,0);ctx.lineTo(236,256);ctx.stroke();}
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(kind==='floor'?2:1,kind==='floor'?2:1);this.resources.push(texture);return texture;
  }

  _label(text,x,y,z,{width=2,height=.48,yaw=0,color='#d1dfd3',sub='',parent=this.scene,background='#162225'}={}) {
    const c=document.createElement('canvas');c.width=768;c.height=sub?230:150;const ctx=c.getContext('2d');
    ctx.fillStyle=background;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#7b9188';ctx.fillRect(0,0,5,c.height);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.font=`600 ${text.length>24?34:text.length>17?42:52}px system-ui, sans-serif`;
    ctx.fillText(text,c.width/2,sub?80:75,c.width-50);
    if(sub){ctx.fillStyle='#a1b2ad';ctx.font='28px system-ui, sans-serif';ctx.fillText(sub,c.width/2,165,c.width-50);}
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;this.resources.push(texture);
    const mesh=this._plane(width,height,x,y,z,this._basic(0xffffff,{map:texture}),yaw,parent);return mesh;
  }

  _register(group,id,stand) {
    group.traverse(obj=>{if(obj.isMesh)obj.userData.actionId=id;});
    this.props.set(id,group);this.propStand.set(id,stand);return group;
  }
  _prop(id,x,y,z,stand) {const group=new THREE.Group();group.position.set(x,y,z);this.scene.add(group);this.props.set(id,group);this.propStand.set(id,stand);return group;}
  _finishProp(group,id) {group.traverse(obj=>{if(obj.isMesh)obj.userData.actionId=id;});}

  _build() {
    const wallMap=this._texture('wall'),floorMap=this._texture('floor');
    this.materials={
      wall:this._mat(0x667473,{map:wallMap}),floor:this._mat(0x555e5d,{map:floorMap}),
      steel:this._mat(0x37464a,{metalness:.7,roughness:.56}),dark:this._mat(0x17252a),
      pale:this._mat(0xa1a79a,{metalness:.25,roughness:.75}),brass:this._mat(0x9b7750,{metalness:.55}),
      rust:this._mat(0x80604b),paper:this._mat(0xd3cbb2,{metalness:0}),black:this._basic(0x03080a),
      green:this._mat(0x8bd8b0,{emissive:0x54b888,emissiveIntensity:1.2}),
      amber:this._mat(0xe6bb7a,{emissive:0xc48136,emissiveIntensity:1.0}),
      white:this._mat(0xc6d1ca,{emissive:0x8da99d,emissiveIntensity:.2})
    };
    this.doorPickMaterial=this._basic(0x000000,{transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    const m=this.materials;
    this.scene.add(new THREE.HemisphereLight(0xb4c4d1,0x27333b,1.45));
    const moonlight=new THREE.DirectionalLight(0xa1b8d0,2.15);moonlight.position.set(-12,35,18);this.scene.add(moonlight);
    const fill=new THREE.DirectionalLight(0xd6b98d,.55);fill.position.set(8,6,-7);this.scene.add(fill);
    const torch=new THREE.PointLight(0xb8cbd2,.8,8,1.2);this.camera.add(torch);
    this._outside();
    for(const [id,r] of Object.entries(ROOMS))this._room(id,r);
    for(const p of PORTALS)this._portal(p);
    this._returnLine();

    const dispatch=this._prop('read-dispatch',2.2,0,8.1,[1.2,9.4]);
    this._box(.14,1.05,.14,0,.52,0,m.steel,dispatch);this._box(.92,.08,.62,0,1.08,0,m.pale,dispatch);
    const dispatchCard=this._box(.73,.025,.49,0,1.14,0,m.paper,dispatch);dispatchCard.rotation.x=.08;
    this._label('RECOVERY ASSIGNMENT',0,1.54,.04,{width:1.45,height:.32,parent:dispatch});
    this._box(.07,.07,.03,.38,1.35,.33,m.amber,dispatch);this._finishProp(dispatch,'read-dispatch');

    const returnBox=this._prop('check-return',-2.25,1.25,3.5,[-1,3.5]);
    this._box(.3,.7,.8,0,0,0,m.dark,returnBox);this._box(.05,.08,.58,.18,.12,0,m.green,returnBox);
    this._label('EXIT LIGHTS',.18,.42,0,{width:1.02,height:.25,yaw:Math.PI/2,parent:returnBox,sub:'INDEPENDENT SUPPLY'});this._finishProp(returnBox,'check-return');
    const finish=this._prop('finish',2.23,1.25,4.4,[1,4.4]);
    this._box(.22,.8,.7,0,0,0,m.steel,finish);this._label('RECOVERY CHECK-IN',-.13,.06,0,{width:.64,height:.42,yaw:-Math.PI/2,parent:finish});this._finishProp(finish,'finish');

    this._survey();this._service();this._shaft();this._lower();this._beacon();
    // A calm navigation marker appears only at the destination of a chosen walk.
    this.walkMarker=this._mesh(new THREE.RingGeometry(.17,.21,24),this._basic(0xb6d5b4,{side:THREE.DoubleSide,transparent:true,opacity:.7}),0,.035,0,this.scene,{pick:false});
    this.walkMarker.rotation.x=-Math.PI/2;this.walkMarker.visible=false;
  }

  _outside() {
    const m=this.materials;
    const lunarMaterial=this._mat(0x62666a,{roughness:1,metalness:0});
    const ground=this._mesh(new THREE.PlaneGeometry(240,240),lunarMaterial,0,-1.35,0);ground.rotation.x=-Math.PI/2;ground.userData.ground=true;
    // The exterior ground does not cover the underground ramp or landing.
    for(const [width,depth,x,z] of [[240,114,0,63],[240,95,0,-72.5],[108,31,-66,-9.5],[108,31,66,-9.5]]){
      const surface=this._mesh(new THREE.PlaneGeometry(width,depth),lunarMaterial,x,-.06,z);surface.rotation.x=-Math.PI/2;surface.userData.ground=true;
    }
    const stars=new Float32Array(600*3);let seed=41;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    for(let i=0;i<600;i++){const az=random()*Math.PI*2,elev=.1+random()*1.4;stars[i*3]=Math.cos(az)*Math.cos(elev)*120;stars[i*3+1]=Math.sin(elev)*120;stars[i*3+2]=Math.sin(az)*Math.cos(elev)*120;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(stars,3));const starMat=new THREE.PointsMaterial({color:0xc3d4de,size:.12,sizeAttenuation:true});this.resources.push(geo,starMat);this.scene.add(new THREE.Points(geo,starMat));
    const rockMat=this._mat(0x515960,{roughness:1,metalness:0});
    const rockGeo=new THREE.IcosahedronGeometry(1,0),rocks=new THREE.InstancedMesh(rockGeo,rockMat,120);this.resources.push(rockGeo);this.scene.add(rocks);const dummy=new THREE.Object3D();
    for(let i=0;i<120;i++){
      const angle=random()*Math.PI*2,r=22+random()*48,scale=1+random()*5,sx=scale*(.7+random()),sy=scale*.6,sz=scale;
      const {x,z}=placeTerrainRock(angle,r,Math.max(sx,sy,sz));
      dummy.position.set(x,scale*.26-1,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(random(),random()*Math.PI,random());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    }
    const earth=this._mesh(new THREE.SphereGeometry(2.5,24,16),this._mat(0x547b9d,{roughness:1,metalness:0}),-35,24,54,this.scene,{pick:false});
    const cloud=this._mesh(new THREE.SphereGeometry(2.52,24,16),this._basic(0xd6e2e2,{transparent:true,opacity:.18}),-35,24,54,this.scene,{pick:false});cloud.rotation.z=.4;
    // Front facade makes the entrance a landmark before the interior is explored.
    this._box(5.2,4.4,.7,-3.8,2.05,5.8,m.steel);this._box(5.2,4.4,.7,3.8,2.05,5.8,m.steel);
    this._box(2.7,1.25,.7,0,3.55,5.8,m.steel);
    this._label('NIGHTGLASS',0,3.64,6.19,{width:3.8,height:.64,color:'#e4dbbd',sub:'LUNAR SURVEY STATION  /  04'});
    this._label('AIRLOCK',0,2.77,6.22,{width:1.8,height:.32});
    this._box(.16,.04,14,-1.38,.025,13,m.green);this._box(.16,.04,14,1.38,.025,13,m.green);
    // Low railings make the compact playable approach boundary physically legible.
    for(const x of [-6.75,6.75])for(let z=7;z<21;z+=2){if(x<0&&z>=12&&z<=16)continue;this._cylinder(.04,.04,.8,x,.4,z,m.steel);}
    this._line([[6.75,.7,7],[6.75,.7,20]],.025,m.steel);this._line([[-6.75,.7,7],[-6.75,.7,12]],.025,m.steel);this._line([[-6.75,.7,16],[-6.75,.7,20]],.025,m.steel);
  }

  _room(id,r) {
    const m=this.materials,w=r.maxX-r.minX,d=r.maxZ-r.minZ,cx=(r.minX+r.maxX)/2,cz=(r.minZ+r.maxZ)/2,base=id==='lower'?-1.2:0;
    const floor=this._mesh(new THREE.PlaneGeometry(w,d),m.floor,cx,base+.005,cz);floor.rotation.x=-Math.PI/2;floor.userData.ground=true;floor.userData.sceneId=id;
    if(id==='shaft'){
      floor.geometry.dispose();floor.geometry=new THREE.PlaneGeometry(w,7);this.resources.push(floor.geometry);floor.position.z=-10.5;
      const ramp=this._mesh(new THREE.PlaneGeometry(w,Math.hypot(3,1.2)),m.floor,0,-.6,-15.5);ramp.rotation.x=-Math.PI/2-Math.atan(.4);ramp.userData.ground=true;ramp.userData.sceneId=id;
    }
    if(r.outdoor)return;
    const height=3.6;
    const ceiling=this._mesh(new THREE.PlaneGeometry(w,d),m.dark,cx,base+height,cz);ceiling.rotation.x=Math.PI/2;
    const edges=[{axis:'x',at:r.minX,min:r.minZ,max:r.maxZ,yaw:Math.PI/2},{axis:'x',at:r.maxX,min:r.minZ,max:r.maxZ,yaw:-Math.PI/2},{axis:'z',at:r.minZ,min:r.minX,max:r.maxX,yaw:0},{axis:'z',at:r.maxZ,min:r.minX,max:r.maxX,yaw:Math.PI}];
    for(const edge of edges){
      const doors=PORTALS.filter(p=>(p.a===id||p.b===id)&&p.axis===edge.axis&&Math.abs(p.at-edge.at)<.01);
      const cuts=[edge.min,...doors.flatMap(p=>[p.center-p.width/2,p.center+p.width/2]),edge.max].sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i++){
        const a=cuts[i],b=cuts[i+1],mid=(a+b)/2,isDoor=doors.some(p=>mid>p.center-p.width/2&&mid<p.center+p.width/2);
        const sectionH=isDoor?height-2.55:height,cy=base+(isDoor?2.55+sectionH/2:height/2);
        const x=edge.axis==='x'?edge.at:mid,z=edge.axis==='z'?edge.at:mid;
        this._plane(b-a,sectionH,x,cy,z,m.wall,edge.yaw);
        if(!isDoor){
          const stripe=this._plane(b-a,.12,x+Math.sin(edge.yaw)*.012,base+.27,z+Math.cos(edge.yaw)*.012,m.steel,edge.yaw);
          const upper=this._plane(b-a,.08,x+Math.sin(edge.yaw)*.013,base+2.85,z+Math.cos(edge.yaw)*.013,m.steel,edge.yaw);
        }
      }
    }
    // Structural ribs and ceiling fixtures give each corridor measurable depth.
    for(let z=r.minZ+1;z<r.maxZ;z+=2.6){
      this._box(.11,.12,w,cx,base+3.36,z,m.steel).rotation.y=Math.PI/2;
      this._box(.18,.04,1.05,cx,base+3.44,z,m.amber);
    }
    const lampMat=m.amber.clone();this.resources.push(lampMat);
    const lamp=this._box(Math.min(w-1,3.1),.055,.13,cx,base+3.4,cz,lampMat);
    const light=new THREE.PointLight(id==='survey'?0xc9cbb5:0xe2b97d,14,12,1.6);light.position.set(cx,base+2.8,cz);this.scene.add(light);
    if(['shaft','lower'].includes(id)){this.inspectionLights.push(light);this.inspectionMaterials.push(lampMat);}
    if(id==='junction')this._label('03  /  SERVICE JUNCTION',0,2.5,.965,{width:2.6,height:.42,yaw:Math.PI});
  }

  _portal(p) {
    const m=this.materials,base=p.b==='lower'?-1.2:0,group=new THREE.Group();this.scene.add(group);
    const x=p.axis==='x'?p.at:p.center,z=p.axis==='z'?p.at:p.center,from=ROOMS[p.a];group.position.set(x,base,z);group.rotation.y=p.axis==='x'?((from.minX+from.maxX)/2>p.at?Math.PI/2:-Math.PI/2):((from.minZ+from.maxZ)/2>p.at?0:Math.PI);
    if(!(ROOMS[p.a].outdoor&&ROOMS[p.b].outdoor)){
      for(const side of [-1,1])this._box(.15,2.7,.24,side*(p.width/2+.025),1.35,0,m.pale,group);
      this._box(p.width+.3,.15,.24,0,2.63,0,m.pale,group);
      this._box(p.width-.2,.045,.04,0,2.47,.14,m.green,group);
      this._box(p.width-.2,.045,.04,0,2.47,-.14,m.green,group);
    }
    const front=this._label(ROOMS[p.b].label,0,2.94,.145,{width:Math.min(p.width+.35,2.7),height:.35,parent:group});
    const back=this._label(ROOMS[p.a].label,0,2.94,-.145,{width:Math.min(p.width+.35,2.7),height:.35,yaw:Math.PI,parent:group});
    // Labels and jambs are selectable exits. The open doorway itself remains open.
    group.traverse(obj=>{if(obj.isMesh){obj.userData.portal=p;this.doorMeshes.push(obj);}});
    const doorTarget=this._plane(p.width,2.5,0,1.25,0,this.doorPickMaterial,0,group);doorTarget.userData.portal=p;
    if(p.b==='shaft'||p.b==='lower'){
      const gate=this._box(p.width-.1,1.05,.1,0,.85,0,m.steel,group);
      this._label(p.b==='shaft'?'INSPECTION LIGHTS OFF':'CHECK THE REPEATED CALL',0,1.03,.065,{width:p.width-.3,height:.32,color:'#e8c993',parent:gate});
      gate.userData.portal=p;this.gates??=[];this.gates.push({mesh:gate,portal:p});
    }
  }

  _returnLine() {
    const m=this.materials;
    for(const [x,z,len,axis] of [[-.98,3.5,5,'z'],[-.98,-3,8,'z'],[-.98,-10.5,7,'z'],[-.98,-21,8,'z'],[-7.5,-2.1,8,'x'],[7.5,-2.1,8,'x'],[-8.4,14,5.7,'x']]){
      this._box(axis==='x'?len:.055,.025,axis==='z'?len:.055,x,floorY(x,z)+.027,z,m.green);
    }
    this._line([[-.98,.035,-14],[-.98,-1.165,-17]],.028,m.green);
    for(let z=-23;z<4;z+=3){const y=floorY(0,z)+.03;const arrow=this._mesh(new THREE.ConeGeometry(.11,.24,3),m.green,-.98,y,z,this.scene,{pick:false});arrow.rotation.x=Math.PI/2;arrow.rotation.z=Math.PI;}
  }

  _survey() {
    const m=this.materials;
    this._box(1.2,.13,3.8,-10.15,.88,-3,m.pale);for(const z of [-4.5,-1.5])this._box(.65,.8,.1,-10.2,.4,z,m.steel);
    this._label('SURVEY RECORDS',-11.48,2.7,-3,{width:3.5,height:.5,yaw:Math.PI/2,sub:'PHOTO  /  LAST SHIFT LOG'});
    const photo=this._prop('take-photo',-11.42,1.84,-4.2,[-9.1,-4.2]);
    const picture=this._plane(1.15,.8,0,0,0,m.paper,Math.PI/2,photo);
    this._label('RECEIVER / BEFORE SERVICE',.01,0,0,{width:1.07,height:.7,yaw:Math.PI/2,parent:photo,sub:'WHITE LEAD: CENTRAL INPUT'});
    this._box(.04,.08,.18,.035,.44,0,m.brass,photo);this._finishProp(photo,'take-photo');
    const log=this._prop('read-survey-log',-9.94,1.02,-2.3,[-8.8,-2.3]);
    this._box(.72,.07,.9,0,0,0,m.dark,log);this._box(.62,.012,.8,0,.045,0,m.paper,log);
    const logLabel=this._label('LAST SHIFT',0,.06,.025,{width:.58,height:.72,parent:log,sub:'SURVEY LOG'});logLabel.rotation.x=-Math.PI/2;logLabel.rotation.z=-Math.PI/2;
    this._box(.07,.07,.07,.4,.08,.34,m.amber,log);this._finishProp(log,'read-survey-log');
    for(let z=-5.2;z<-.5;z+=1.1)this._box(.25,.5,.6,-11.2,.45,z,m.rust);
    this._label('02',-6.5,2.6,-5.98,{width:.65,height:.65,color:'#a1b8ae'});
  }

  _service() {
    const m=this.materials;
    this._box(1.05,1.8,3.8,10.2,.9,-3,m.steel);
    this._label('SERVICE / POWER',11.48,2.7,-3,{width:3.6,height:.5,yaw:-Math.PI/2,sub:'GREEN EXIT SUPPLY IS INDEPENDENT'});
    const card=this._prop('read-maintenance',9.54,1.65,-4.7,[8.2,-4.7]);
    this._label('CIRCUIT CARD',-.02,0,0,{width:.95,height:.7,yaw:-Math.PI/2,parent:card,sub:'RETURN  /  INSPECTION  /  RECEIVER'});this._finishProp(card,'read-maintenance');
    const door=this._prop('open-panel',9.64,1.23,-3.4,[8.2,-3.4]);
    this._box(.06,1.2,1.35,0,0,0,m.pale,door);this._label('LIGHTING PANEL',-.045,.08,0,{width:1.15,height:.5,yaw:-Math.PI/2,parent:door,sub:'OPEN TO INSPECT'});this._finishProp(door,'open-panel');this.panelDoor=door;
    for(const [id,z,label,color] of [['power-inspection',-3.7,'INSPECTION',m.green],['power-receiver',-2.7,'RECEIVER',m.amber]]){
      const button=this._prop(id,9.6,1.26,z,[8.2,z]);
      this._box(.12,.3,.42,0,0,0,m.dark,button);this._box(.14,.1,.24,-.04,0,0,color,button);
      this._label(label,-.08,.32,0,{width:.85,height:.2,yaw:-Math.PI/2,parent:button});this._finishProp(button,id);
    }
    this._line([[11.3,.2,-5.3],[11.3,2.4,-5.3],[9.3,2.4,-5.3],[3.55,2.4,-5.3]],.045,m.green);
    for(const z of [-5.2,-.7]){this._cylinder(.16,.16,2.8,11.15,1.4,z,m.rust);}
  }

  _shaft() {
    const m=this.materials;
    this._label('LISTENING ARRAY',0,2.8,-16.98,{width:3.7,height:.5,sub:'LOWER LANDING  /  RECORDER BELOW'});
    const receiver=this._prop('listen-receiver',-2.3,0,-13.8,[-1.2,-12.1]);
    this._box(1.05,.85,.85,0,.8,0,m.steel,receiver);this._box(.85,.38,.06,0,.94,.46,m.dark,receiver);
    this._label('RECEIVER',0,1.35,.48,{width:1.2,height:.25,parent:receiver});
    for(let i=0;i<6;i++)this._box(.055,.24,.016,-.28+i*.11,.98,.5,m.pale,receiver);
    this._cylinder(.07,.07,.25,0,1.38,0,m.steel,receiver);
    const dish=this._mesh(new THREE.ConeGeometry(.55,.18,24,1,true),m.pale,0,1.67,0,receiver);dish.rotation.x=-Math.PI/2;dish.rotation.z=Math.PI;
    this._cylinder(.045,.045,.55,0,.3,0,m.steel,receiver);this._finishProp(receiver,'listen-receiver');
    const cable=this._prop('inspect-cable',0,0,0,[.7,-13.6]);
    this._line([[-2.3,.38,-13.8],[-1.4,.18,-14.1],[-.4,.12,-14.6],[.5,-.12,-14.8],[2.8,-.25,-15.2]],.043,m.paper,cable);
    this._box(.3,.12,.16,-1.25,.23,-14.12,m.brass,cable);this._finishProp(cable,'inspect-cable');
    const compare=this._prop('compare-signal',-.15,0,-12.9,[.2,-11.7]);
    this._box(.5,.8,.42,0,.4,0,m.steel,compare);this._label('COMPARE CLUES',0,1.02,.24,{width:1.05,height:.32,parent:compare});this._finishProp(compare,'compare-signal');
    const mute=this._prop('mute-receiver',-2.68,1.06,-13.29,[-1.7,-12]);
    this._box(.23,.18,.08,0,0,0,m.green,mute);this._label('MUTE',0,.19,.02,{width:.5,height:.16,parent:mute});this._finishProp(mute,'mute-receiver');
    const redirect=this._prop('redirect-receiver',2.25,.18,-14.15,[1.25,-13]);
    this._box(.7,.9,.65,0,.4,0,m.steel,redirect);this._box(.3,.13,.07,0,.57,.36,m.amber,redirect);
    this._label('SEND TO SIDE SHAFT',0,1.13,.34,{width:1.35,height:.31,parent:redirect});this._finishProp(redirect,'redirect-receiver');
    this._plane(1.8,2.0,3.478,.2,-15.2,m.black,-Math.PI/2);
    this._label('UNUSED SIDE SHAFT',3.46,1.63,-15.2,{width:1.7,height:.28,yaw:-Math.PI/2,color:'#bda27d'});
    this._line([[3.38,-.75,-14.35],[3.38,1.2,-14.35],[3.38,1.2,-16.05],[3.38,-.75,-16.05]],.055,m.rust);
  }

  _lower() {
    const m=this.materials;
    this._box(2.6,.12,1.05,0,-.3,-23.5,m.pale);for(const x of [-1.05,1.05])this._box(.1,.8,.7,x,-.72,-23.5,m.steel);
    this._label('LOWER LANDING',0,1.52,-24.98,{width:3.6,height:.6,sub:'FIELD RECORDER  /  NORTH TEAM'});
    const recorder=this._prop('recover-recorder',0,-.12,-23.35,[0,-21.8]);
    this._box(.9,.22,.62,0,0,0,m.rust,recorder);this._box(.78,.04,.5,0,.13,0,m.pale,recorder);
    for(const x of [-.19,.19]){const reel=this._cylinder(.14,.14,.045,x,.17,0,m.dark,recorder,18);this._cylinder(.045,.045,.05,x,.2,0,m.brass,recorder,12);}
    this._label('FIELD RECORDER',0,.47,.22,{width:1.35,height:.28,parent:recorder,color:'#eed5a8'});this._finishProp(recorder,'recover-recorder');this.recorderMesh=recorder;
    this._box(.3,.15,.28,2.8,-.55,-24.5,m.dark);this._line([[2.8,-.5,-24.5],[2.8,-1.1,-23.5],[.7,-1.1,-23.5]],.026,m.paper);
  }

  _beacon() {
    const m=this.materials;
    const beacon=this._prop('publish-warning',-11.8,0,14,[-10.1,14]);
    this._box(.85,1.3,1.5,0,.65,0,m.steel,beacon);
    this._label('SURFACE BEACON',.45,1.75,0,{width:2,height:.45,yaw:Math.PI/2,parent:beacon,sub:'ACCESS STATUS / RECOVERY UPLINK'});
    this.beaconScreen=this._label('SURVEY ACCESS OPEN',.46,1.06,0,{width:1.2,height:.48,yaw:Math.PI/2,parent:beacon,color:'#e0c289',sub:'CLEARANCE HAS NOT BEEN UPDATED'});
    this.beaconUpdated=this._label('WARNING UPLOADED',.46,1.06,0,{width:1.2,height:.48,yaw:Math.PI/2,parent:beacon,color:'#a8dfb6',sub:'RECORDER ATTACHED / RETURN TO AIRLOCK'});this.beaconUpdated.visible=false;
    this._box(.05,.16,.22,.5,.65,0,m.amber,beacon);this._finishProp(beacon,'publish-warning');
    this._cylinder(.13,.22,6.5,-12.5,3.25,14,m.pale);this._cylinder(.055,.055,1.7,-12.5,7.1,14,m.steel);
    for(const y of [2.5,4,5.5])this._box(2,.06,.06,-12.5,y,14,m.steel);
    const dish=this._mesh(new THREE.ConeGeometry(.95,.25,24,1,true),m.pale,-12.5,6.2,14);dish.rotation.z=-.8;
    this._label('BEACON',-7.8,1.2,12,{width:1.4,height:.32});
  }

  setState(raw) {
    const state=hydrateState(raw),changed=this.currentScene!==state.scene;
    this.state=state;
    if(changed){const r=ROOMS[state.scene];this.currentScene=state.scene;this.camera.position.set(r.spawn[0],EYE+floorY(...r.spawn),r.spawn[1]);this.yaw=r.yaw;this.pitch=0;this.path=[];this._setWalking(false);}
    this.actionMap=new Map(availableActions(state).filter(a=>a.kind!=='move'&&!a.disabled&&!(a.record&&state.records.includes(a.record))&&!(a.id==='check-return'&&state.flags.returnChecked)&&!(a.id==='listen-receiver'&&state.receiverMode)).map(a=>[a.id,a]));
    for(const light of this.inspectionLights)light.intensity=state.flags.inspectionPowered?18:1.5;
    for(const material of this.inspectionMaterials){material.emissiveIntensity=state.flags.inspectionPowered?1:.03;material.color.setHex(state.flags.inspectionPowered?0xe6bb7a:0x3c413e);}
    for(const {mesh,portal} of this.gates||[])mesh.visible=!canTraverse(portal.a,portal.b,state);
    this.panelDoor.visible=!state.flags.panelOpened;
    this.recorderMesh.visible=!state.flags.recorderRecovered;
    this.beaconScreen.visible=!state.flags.warningPublished;this.beaconUpdated.visible=state.flags.warningPublished;
    this.props.get('finish').visible=state.flags.warningPublished;
    this._syncCamera();this._updateFocus(true);this._draw();
  }

  setActive(value) {
    this.active=Boolean(value)&&!this.disposed;
    if(!this.active){this.stop();cancelAnimationFrame(this.frameId);this.frameId=0;this.lastTime=0;return;}
    if(!this.frameId)this.frameId=requestAnimationFrame(time=>this._frame(time));
  }

  setMotion({forward=0,strafe=0}={}) {
    this.motion={forward:clamp(forward,-1,1),strafe:clamp(strafe,-1,1)};
    if(forward||strafe){this.path=[];this.pendingLook=null;this.targetAction=null;this.walkMarker.visible=false;this._setWalking(false);}
  }

  _setWalking(value) {if(this.walking===value)return;this.walking=value;this.onWalkingChange(value);}
  stop() {this.motion={forward:0,strafe:0};this.path=[];this.pendingLook=null;this.targetAction=null;this.walkMarker.visible=false;this._setWalking(false);}
  reset(state) {this.stop();this.currentScene=null;this.setState(state);}

  look(dx,dy) {
    if(!this.active)return;
    this.yaw-=dx*.0035;this.pitch=clamp(this.pitch-dy*.003,-1.12,.95);this.manualLook=true;this.pendingLook=null;this.targetAction=null;this._syncCamera();
  }

  _syncCamera() {this.camera.rotation.set(this.pitch,this.yaw,0);this.camera.updateMatrixWorld();}
  getPosition() {return {x:this.camera.position.x,z:this.camera.position.z,sceneId:this.currentScene};}

  walkTo(sceneId) {
    if(!this.state||!canTraverse(this.currentScene,sceneId,this.state))return false;
    const [x,z]=ROOMS[sceneId].spawn;return this.walkToPoint({x,z});
  }

  walkToPoint(point) {
    if(!this.active||!this.state||!Number.isFinite(point?.x)||!Number.isFinite(point?.z))return false;
    const path=findWalkPath(this.camera.position,point,this.currentScene,this.state);if(!path?.length)return false;
    this.path=path;this.motion={forward:0,strafe:0};this.manualLook=false;
    this.walkMarker.position.set(point.x,floorY(point.x,point.z)+.035,point.z);this.walkMarker.visible=true;this.pendingLook=null;this.targetAction=null;this._setWalking(true);return true;
  }

  focusAction(actionId) {
    if(!this.actionMap?.has(actionId))return false;
    const stand=this.propStand.get(actionId),prop=this.props.get(actionId);if(!stand||!prop)return false;
    const okay=this.walkToPoint({x:stand[0],z:stand[1]});if(okay){const center=this._propCenter(prop);this.pendingLook=center;this.targetAction=actionId;}return okay;
  }

  _propCenter(prop) {const b=new THREE.Box3().setFromObject(prop);return b.getCenter(new THREE.Vector3());}

  pick(clientX,clientY) {
    if(!this.active||!this.state)return null;
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.pickMeshes,false).filter(hit=>this._visible(hit.object));
    for(const hit of hits){
      const data=hit.object.userData;
      if(data.actionId&&this.actionMap.has(data.actionId))return {actionId:data.actionId,distance:hit.distance,reachable:hit.distance<=3.1};
      if(data.portal){const p=data.portal,target=p.a===this.currentScene?p.b:p.b===this.currentScene?p.a:null;if(target)return {sceneId:target,allowed:canTraverse(this.currentScene,target,this.state)};}
      if(data.ground){const id=sceneAt(hit.point.x,hit.point.z,this.currentScene);if(id&&(id===this.currentScene||portalBetween(this.currentScene,id)))return {point:{x:hit.point.x,z:hit.point.z},sceneId:id};}
      // An opaque surface blocks selection of anything behind it.
      if(!hit.object.material.transparent||hit.object.material.opacity>.5)return null;
    }
    return null;
  }

  _visible(object) {for(let obj=object;obj;obj=obj.parent)if(!obj.visible)return false;return true;}

  _updateFocus(force=false) {
    if(!this.state)return;
    const forward=new THREE.Vector3();this.camera.getWorldDirection(forward);
    let best=null,bestScore=Infinity;
    for(const [id,action] of this.actionMap){
      const prop=this.props.get(id);if(!prop||!this._visible(prop))continue;
      const center=this._propCenter(prop),direction=center.clone().sub(this.camera.position),distance=direction.length();
      if(distance>3.35||distance<.1)continue;
      const projected=center.clone().project(this.camera);
      if(Math.abs(projected.x)>.95||Math.abs(projected.y)>.9||projected.z< -1||projected.z>1)continue;
      direction.normalize();const alignment=forward.dot(direction);if(alignment<.35)continue;
      this.raycaster.set(this.camera.position,direction);this.raycaster.far=distance+.2;
      const first=this.raycaster.intersectObjects(this.pickMeshes,false).find(h=>this._visible(h.object)&&(!h.object.material.transparent||h.object.material.opacity>.5));
      this.raycaster.far=Infinity;
      if(first&&first.object.userData.actionId!==id&&first.distance<distance-.3)continue;
      const score=(1-alignment)*3+distance*.12-(id===this.targetAction?3:0);if(score>=bestScore)continue;
      bestScore=score;best={actionId:id,label:action.label,distance:Math.round(distance*10)/10};
    }
    this.focus=best;const key=best?`${best.actionId}:${best.distance}`:'';
    if(force||key!==this.lastFocusKey){this.lastFocusKey=key;this.onFocus(best);}
  }

  _frame(time) {
    this.frameId=0;if(!this.active||this.disposed)return;
    const dt=this.lastTime?Math.min((time-this.lastTime)/1000,this.rendererMode==='basic'?.15:.05):0;this.lastTime=time;
    let dx=0,dz=0;
    if(this.path.length){
      let point=this.path[0],distance=Math.hypot(point.x-this.camera.position.x,point.z-this.camera.position.z);
      if(distance<.09){this.path.shift();point=this.path[0];if(!point){this.walkMarker.visible=false;this._setWalking(false);if(this.pendingLook){const p=this.pendingLook;this.yaw=Math.atan2(-(p.x-this.camera.position.x),-(p.z-this.camera.position.z));this.pitch=clamp(Math.atan2(p.y-this.camera.position.y,Math.hypot(p.x-this.camera.position.x,p.z-this.camera.position.z)),-.7,.6);this.pendingLook=null;}}}
      if(point){
        const vx=point.x-this.camera.position.x,vz=point.z-this.camera.position.z,d=Math.hypot(vx,vz),amount=Math.min(d,WALK_SPEED*dt);dx=vx/d*amount;dz=vz/d*amount;
        if(!this.manualLook){const targetYaw=Math.atan2(-vx,-vz);this.yaw+=angleDelta(this.yaw,targetYaw)*Math.min(1,dt*4.5);this.pitch+=(0-this.pitch)*Math.min(1,dt*2);}
      }
    }else if(this.motion.forward||this.motion.strafe){
      const norm=Math.max(1,Math.hypot(this.motion.forward,this.motion.strafe)),f=this.motion.forward/norm,s=this.motion.strafe/norm;
      dx=(-Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)*WALK_SPEED*dt;dz=(-Math.cos(this.yaw)*f-Math.sin(this.yaw)*s)*WALK_SPEED*dt;
    }
    if((dx||dz)&&this.state){
      const result=movePlayer(this.camera.position,{x:dx,z:dz},this.currentScene,this.state);
      this.camera.position.set(result.x,EYE+floorY(result.x,result.z),result.z);
      if(result.blocked&&this.path.length){this.path=[];this.walkMarker.visible=false;this._setWalking(false);}
      if(result.scene!==this.currentScene){this.currentScene=result.scene;this.onSceneChange(result.scene);}
    }
    this._syncCamera();this._updateFocus();this._draw();this.frameId=requestAnimationFrame(t=>this._frame(t));
  }

  _draw(){if(!this.disposed)this.renderer.render(this.scene,this.camera);}
  resize(){if(this.disposed)return;const rect=this.canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this._draw();}
  dispose(){this.setActive(false);this.disposed=true;this.resizeObserver.disconnect();this.canvas.removeEventListener('webglcontextlost',this._onContextLost);for(const resource of new Set(this.resources))resource.dispose?.();this.renderer.dispose();}
}
