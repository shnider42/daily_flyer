import * as THREE from './vendor/three.module.js';
import { terrainHeight } from './sim.mjs';
import { makeAircraft, animateAircraft, setAircraftPose, aircraftKind, disposeModelCache } from './models.mjs';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const number=(v,f=0)=>Number.isFinite(v)?v:f;
const scratchV=new THREE.Vector3(), scratchD=new THREE.Vector3(), scratchUp=new THREE.Vector3(0,1,0);
const tempObject=new THREE.Object3D(), tempColor=new THREE.Color();
const axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);

function seedOf(text){let a=2166136261;for(const c of String(text))a=Math.imul(a^c.charCodeAt(0),16777619);return a>>>0;}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function lerp(a,b,t){return a+(b-a)*t;}
function color(value){return new THREE.Color(value);}
function worldMaterial(value,more={}){return new THREE.MeshStandardMaterial({color:value,roughness:.94,metalness:0,flatShading:true,...more});}
function basic(value,more={}){return new THREE.MeshBasicMaterial({color:value,...more});}
function box(parent,x,y,z,sx,sy,sz,material){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);m.position.set(x,y,z);parent.add(m);return m;}
function sphere(parent,x,y,z,r,material,detail=1){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,detail),material);m.position.set(x,y,z);parent.add(m);return m;}
function cylinder(parent,x,y,z,r,h,material,sides=8){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,sides),material);m.position.set(x,y,z);parent.add(m);return m;}
function height(x,z,mission){try{return number(terrainHeight(x,z,mission),-8);}catch{return 0;}}

const palettes={
  countryside:{top:'#7dabad',horizon:'#d6d7bc',fog:'#c9d2bd',ground:['#71856b','#829476','#a1a784','#647e65'],water:'#477f8c',light:'#fff0cf'},
  channel:{top:'#779fae',horizon:'#cdd5c7',fog:'#bccbd0',ground:['#6a7f6a','#859477','#aaa88b','#587b67'],water:'#427585',light:'#f8e6c6'},
  coast:{top:'#739da9',horizon:'#ddd1ba',fog:'#c9d0c1',ground:['#647f66','#87997b','#b1ac87','#769178'],water:'#3d8490',light:'#ffe7c6'},
  pacific:{top:'#6ba6b9',horizon:'#d0e4d5',fog:'#b5d8d6',ground:['#4c856d','#659572','#b8b38b','#4b7560'],water:'#2e8b9a',light:'#ffedc8'},
  jungle:{top:'#6d9698',horizon:'#bfccb3',fog:'#a5bcb2',ground:['#3b7057','#5c8260','#75825a','#4b6c50'],water:'#4d8b8a',light:'#e9e0b3'},
  south_atlantic:{top:'#7b969f',horizon:'#c3c8c4',fog:'#a8b8ba',ground:['#708075','#87907a','#a0a491','#566b63'],water:'#3c697e',light:'#ebdfc4'},
  desert:{top:'#88abb2',horizon:'#e1caaa',fog:'#d9c3a4',ground:['#bb9b72','#cbae84','#ddc59a','#ac8e68'],water:'#548391',light:'#fff0ce'},
  mountains:{top:'#8fabb4',horizon:'#d3d1c3',fog:'#bbc8ca',ground:['#687d70','#7c8a7a','#aaad9b','#506b60'],water:'#4d7d8d',light:'#f2e7ce'},
  night:{top:'#071426',horizon:'#34475c',fog:'#273d52',ground:['#263f40','#364c45','#4a584b','#22373a'],water:'#172e43',light:'#a4bbd0'},
};

export class FlightRenderer {
  constructor(canvas,settings={}){
    this.canvas=canvas;this.settings={...settings};this.time=0;this._cameraInitialized=false;this._mode=null;this._world=null;
    this._plane=null;this._actors=new Map();this._targets=new Map();this._remote=new Map();this._rings=[];this._sceneryAnimations=[];
    this.width=1;this.height=1;this.contextLost=false;this.stats={fps:60,drawCalls:0,triangles:0,pixelRatio:1};
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.renderer.setClearColor('#cdd4c6',1);
    this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog('#c8d2c5',1000,19000);
    this.camera=new THREE.PerspectiveCamera(62,1,.15,95000);this.scene.add(this.camera);
    this.hemi=new THREE.HemisphereLight('#f1f2e0','#4a5954',2.0);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight('#ffe9c6',2.5);this.sun.position.set(-8000,6500,3000);this.scene.add(this.sun);
    this.actorsRoot=new THREE.Group();this.scene.add(this.actorsRoot);
    this.effectsRoot=new THREE.Group();this.scene.add(this.effectsRoot);
    this._buildSky();this._buildPools();this._buildCockpit();
    this._lost=e=>{e.preventDefault();this.contextLost=true;};this._restored=()=>{this.contextLost=false;this._cameraInitialized=false;};
    canvas.addEventListener('webglcontextlost',this._lost,false);canvas.addEventListener('webglcontextrestored',this._restored,false);
    this.setSettings(settings);
  }

  setSettings(settings={}){
    this.settings={...this.settings,...settings};
    const quality=this.settings.quality||this.settings.graphics||'auto';
    const mobile=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
    const cap=quality==='low'?1:quality==='high'?1.8:quality==='medium'?1.3:(mobile?1.25:1.5);
    this.pixelRatio=Math.min(number(globalThis.devicePixelRatio,1),cap);
    if(Number.isFinite(this.settings.resolution))this.pixelRatio=clamp(this.settings.resolution,.65,2);
    this.renderer.setPixelRatio(this.pixelRatio);this.resize();
    this.renderer.toneMappingExposure=number(this.settings.brightness,1)>2?1.12:number(this.settings.brightness,1)*1.12;
    if(this._explosions)this._explosions.material.opacity=this.settings.reducedMotion?.28:.57;
    if(this._clouds)this._clouds.count=Math.min(this._cloudCapacity||225,quality==='low'?140:this._cloudCapacity||225);
    this.stats.pixelRatio=this.pixelRatio;
  }

  resize(){
    const rect=this.canvas.getBoundingClientRect();this.width=Math.max(1,Math.round(rect.width||globalThis.innerWidth||1));this.height=Math.max(1,Math.round(rect.height||globalThis.innerHeight||1));
    this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;
    this.camera.fov=clamp(number(this.settings.fov,this.width<this.height?67:59),45,90);this.camera.updateProjectionMatrix();
  }

  _buildSky(){
    this.skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,
      uniforms:{top:{value:color('#84aeb8')},horizon:{value:color('#e0d8be')},sunColor:{value:color('#ffe6b6')},sunDirection:{value:new THREE.Vector3(-.7,.36,-.4).normalize()},night:{value:0}},
      vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 top;uniform vec3 horizon;uniform vec3 sunColor;uniform vec3 sunDirection;uniform float night;varying vec3 vDirection;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.12,.78,d.y);vec3 c=mix(horizon,top,h);float s=max(0.0,dot(d,sunDirection));c+=sunColor*(pow(s,58.0)*.16+pow(s,1500.0)*.63)*(1.0-night*.85);float star=step(.9971,hash(floor(vec2(atan(d.z,d.x)*220.0,asin(d.y)*280.0))));c+=star*night*smoothstep(.05,.4,d.y)*.9;gl_FragColor=vec4(c,1.0);\n#include <colorspace_fragment>\n}',
    });
    // Preprocessor chunks must begin on a new line on strict mobile GLSL compilers.
    this.skyMaterial.fragmentShader=this.skyMaterial.fragmentShader.replace('#include','\n#include');
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(82000,24,16),this.skyMaterial);this.sky.renderOrder=-100;this.sky.frustumCulled=false;this.scene.add(this.sky);
  }

  _setAtmosphere(mission,menu=false){
    const biome=mission.biome||'countryside';let palette=palettes[biome]||palettes.countryside;
    const tod=String(mission.weather?.timeOfDay||'day').toLowerCase();const night=biome==='night'||/night|midnight/.test(tod);const sunset=menu||/dawn|dusk|sunset|evening/.test(tod);
    if(night)palette=palettes.night;
    this.palette=palette;this._night=night;this._sunset=sunset;
    this.skyMaterial.uniforms.top.value.set(night?palette.top:sunset?'#91a9af':palette.top);
    this.skyMaterial.uniforms.horizon.value.set(night?palette.horizon:sunset?'#e5cfaa':palette.horizon);
    this.skyMaterial.uniforms.night.value=night?1:0;
    this.skyMaterial.uniforms.sunColor.value.set(sunset?'#ffd6a0':palette.light);
    this.skyMaterial.uniforms.sunDirection.value.set(-.75,sunset?.19:.52,-.5).normalize();
    this.scene.fog.color.set(sunset?'#d1cbb5':palette.fog);
    this.sun.color.set(palette.light);this.sun.intensity=night?.75:sunset?2.5:2.8;
    this.sun.position.copy(this.skyMaterial.uniforms.sunDirection.value).multiplyScalar(12000);
    this.hemi.color.set(night?'#7089a7':palette.horizon);this.hemi.groundColor.set(night?'#17242a':'#526254');this.hemi.intensity=night?1.3:2.0;
    let fog=number(mission.weather?.fog,0);
    this._fogFar=fog>100?clamp(fog,1700,35000):fog>0&&fog<.01?clamp(.55/fog,5000,35000):lerp(21000,6000,clamp(fog,0,1));
    if(menu)this._fogFar=19000;
    this._fogNear=Math.min(1300,this._fogFar*.09);
    this.scene.fog.near=this._fogNear;this.scene.fog.far=this._fogFar;
  }

  _clearWorld(){
    if(this._world){
      this.scene.remove(this._world);const geometries=new Set(),materials=new Set(),textures=new Set();
      this._world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material])){materials.add(m);if(m.map)textures.add(m.map);}});
      for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
    }
    for(const target of this._targets.values())this._disposeUnique(target);
    this.actorsRoot.clear();this._actors.clear();this._targets.clear();this._remote.clear();this._plane=null;this._rings=[];this._sceneryAnimations=[];this._clouds=null;
    this._world=new THREE.Group();this.scene.add(this._world);
    this._cameraInitialized=false;
  }

  loadMission(mission,aircraft){
    this._clearWorld();this.mission=mission;this.aircraft=aircraft||{id:mission.aircraft};this._mode='flight';
    this._setAtmosphere(mission);
    this._buildWorld(mission);
    this._plane=makeAircraft(this.aircraft);this.actorsRoot.add(this._plane);
    const start=mission.start||{x:0,y:14,z:0,heading:0};setAircraftPose(this._plane,start);
    this._targetProfile=aircraftKind(this.aircraft);
    this._cockpit.visible=false;this._visualGearOffset=start.airborne===false?1.3:0;
    this.camera.up.set(0,1,0);this.camera.fov=clamp(number(this.settings.fov,this.width<this.height?67:59),45,90);this.camera.updateProjectionMatrix();
  }

  _buildWorld(mission){
    const points=[...(mission.runways||[]),...(mission.waypoints||[]),...(mission.targets||[]),mission.start||{}];
    let minX=-6000,maxX=6000,minZ=-6000,maxZ=16000;
    for(const p of points){minX=Math.min(minX,number(p.x));maxX=Math.max(maxX,number(p.x));minZ=Math.min(minZ,number(p.z));maxZ=Math.max(maxZ,number(p.z));}
    this.worldCenter={x:(minX+maxX)*.5,z:(minZ+maxZ)*.5};
    this.worldSize=Math.max(52000,maxX-minX+18000,maxZ-minZ+18000);
    this._buildTerrain(mission);this._buildWater(mission);this._buildClouds(mission);this._buildScenery(mission);
    for(const r of mission.runways||[])this._buildRunway(r,mission);
    this._buildWaypoints(mission);
  }

  _buildTerrain(mission){
    const quality=this.settings.quality||this.settings.graphics;const steps=quality==='low'?118:162;
    const geometry=new THREE.PlaneGeometry(this.worldSize,this.worldSize,steps,steps);geometry.rotateX(-Math.PI/2);
    const positions=geometry.attributes.position,colors=new Float32Array(positions.count*3);const shades=this.palette.ground.map(color);
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i)+this.worldCenter.x,z=positions.getZ(i)+this.worldCenter.z;let y=height(x,z,mission);
      // A coarse distant triangle must never interpolate over the airfield.
      // This rendering skirt leaves the simulation's collision terrain intact.
      for(const runway of mission.runways||[]){if(runway.carrier)continue;const dx=x-runway.x,dz=z-runway.z,c=Math.cos(runway.heading||0),s=Math.sin(runway.heading||0),pad=this.worldSize/steps*1.2;
        if(Math.abs(dx*c-dz*s)<number(runway.width,45)*.5+pad&&Math.abs(dx*s+dz*c)<number(runway.length,1000)*.5+pad)y=Math.min(y,number(runway.y,12)-.4);
      }
      positions.setXYZ(i,x,y-.12,z);
      const field=Math.abs(Math.imul(Math.floor(x/300),73856093)^Math.imul(Math.floor(z/260),19349663))%4;
      tempColor.copy(shades[field]);
      const variation=.93+.1*Math.sin(x*.006+z*.007);tempColor.multiplyScalar(variation);
      if(y<9&&mission.biome!=='desert')tempColor.lerp(color('#b3b18a'),.48);
      if(y>1050)tempColor.lerp(color('#8c9690'),clamp((y-1050)/1600,0,.72));
      if(y>2350)tempColor.lerp(color('#e0e3d7'),clamp((y-2350)/950,0,.9));
      colors.set([tempColor.r,tempColor.g,tempColor.b],i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
    const terrain=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));this._world.add(terrain);
  }

  _buildWater(){
    this.waterMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0},waterColor:{value:color(this.palette.water)},fogColor:{value:this.scene.fog.color.clone()},fogNear:{value:this._fogNear},fogFar:{value:this._fogFar},night:{value:this._night?1:0}},
      vertexShader:'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader:'uniform float time;uniform vec3 waterColor;uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;uniform float night;varying vec3 vWorld;void main(){float wave=sin(vWorld.x*.018+vWorld.z*.011+time*.85)*sin(vWorld.z*.031-time*.55);float small=sin(vWorld.z*.16+vWorld.x*.07+time*1.7);float glint=pow(max(0.0,wave*.7+small*.3),9.0);vec3 c=waterColor*(.96+wave*.045)+vec3(.26,.31,.28)*glint*(1.0-night*.7);float fog=smoothstep(fogNear,fogFar,length(cameraPosition-vWorld));c=mix(c,fogColor,fog);gl_FragColor=vec4(c,1.0);\n#include <colorspace_fragment>\n}',
    });
    const ocean=new THREE.Mesh(new THREE.PlaneGeometry(160000,160000),this.waterMaterial);ocean.rotation.x=-Math.PI/2;ocean.position.y=-.65;this._world.add(ocean);
  }

  _buildClouds(mission){
    const random=rng(seedOf(mission.id||'skyward')+761);const count=(this.settings.quality==='low'?28:45)*5;
    const base=number(mission.weather?.cloudBase,1050),top=Math.max(base+120,number(mission.weather?.cloudTop,base+450));
    const material=worldMaterial(this._night?'#8598a5':this._sunset?'#e7deca':'#e2e6d6',{roughness:1,transparent:true,opacity:.85,depthWrite:false});
    const clouds=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),material,count);
    this._cloudBase=base;this._cloudTop=top;
    for(let i=0;i<count;i+=5){
      const cx=this.worldCenter.x+(random()-.5)*this.worldSize*.76,cz=this.worldCenter.z+(random()-.5)*this.worldSize*.8,cy=lerp(base,top,random());
      const size=140+random()*200;
      for(let j=0;j<5;j++){
        tempObject.position.set(cx+(j-2)*size*.66,cy+Math.sin(j*.8)*size*.12,cz+(random()-.5)*size);
        tempObject.scale.set(size*(.8+random()*.6),size*(.28+random()*.22),size*(.65+random()*.45));tempObject.rotation.set(0,random()*TAU,0);tempObject.updateMatrix();clouds.setMatrixAt(i+j,tempObject.matrix);
      }
    }
    clouds.instanceMatrix.needsUpdate=true;clouds.frustumCulled=false;clouds.renderOrder=3;this._world.add(clouds);this._clouds=clouds;this._cloudCapacity=count;
  }

  _clearOfRunways(x,z,padding=150){
    for(const r of this.mission?.runways||[]){const dx=x-r.x,dz=z-r.z,c=Math.cos(r.heading||0),s=Math.sin(r.heading||0);const side=dx*c-dz*s,along=dx*s+dz*c;if(Math.abs(side)<number(r.width,45)/2+padding&&Math.abs(along)<number(r.length,1000)/2+padding)return false;}
    return true;
  }

  _buildScenery(mission){
    const random=rng(seedOf(mission.id||'menu')+338);const desert=mission.biome==='desert';const count=this.settings.quality==='low'?180:480;
    const trees=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,desert?5:7),worldMaterial(desert?'#a78d6c':'#3c6655'),count);
    let written=0;
    for(let i=0;i<count*5&&written<count;i++){
      const x=this.worldCenter.x+(random()-.5)*23000,z=this.worldCenter.z+(random()-.5)*26000,y=height(x,z,mission);
      if(y<5||y>1800||!this._clearOfRunways(x,z,100))continue;
      const size=desert?8+random()*20:10+random()*13;
      tempObject.position.set(x,y+size*.5,z);tempObject.scale.set(size*.38,size,size*.38);tempObject.rotation.set(0,random()*TAU,0);tempObject.updateMatrix();trees.setMatrixAt(written,tempObject.matrix);
      tempColor.set(desert?'#a38b6b':'#3d6755').multiplyScalar(.8+random()*.36);trees.setColorAt(written,tempColor);written++;
    }
    trees.count=written;trees.instanceMatrix.needsUpdate=true;trees.frustumCulled=false;this._world.add(trees);
    const buildingMaterial=worldMaterial(this._night?'#4c5860':'#b8b69d');const roofMaterial=worldMaterial(this._night?'#354651':'#7b8173');
    const towns=mission.biome==='pacific'||mission.biome==='south_atlantic'?3:7;
    const maxBuildings=towns*22;const blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),buildingMaterial,maxBuildings);
    const roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(.72,1,4),roofMaterial,maxBuildings);
    written=0;
    for(let t=0;t<towns;t++){
      let tx=this.worldCenter.x+(random()-.5)*11000,tz=this.worldCenter.z+(random()-.5)*16000;
      const target=(mission.targets||[])[t];if(target){tx=target.x+600;tz=target.z+450;}
      for(let b=0;b<22;b++){
        const x=tx+(b%5)*52+(random()-.5)*12,z=tz+Math.floor(b/5)*64+(random()-.5)*14,y=height(x,z,mission);
        if(y<4||!this._clearOfRunways(x,z,170))continue;
        const sx=14+random()*15,sz=18+random()*18,sy=8+random()*14;
        tempObject.position.set(x,y+sy*.5,z);tempObject.scale.set(sx,sy,sz);tempObject.rotation.set(0,.1,0);tempObject.updateMatrix();blocks.setMatrixAt(written,tempObject.matrix);
        tempColor.set(this._night?'#64707a':'#b8b19a').multiplyScalar(.75+random()*.4);blocks.setColorAt(written,tempColor);
        tempObject.position.y=y+sy+sy*.14;tempObject.scale.set(sx*1.08,sy*.33,sz*1.08);tempObject.rotation.y=Math.PI/4+.1;tempObject.updateMatrix();roofs.setMatrixAt(written,tempObject.matrix);written++;
      }
    }
    blocks.count=written;roofs.count=written;blocks.instanceMatrix.needsUpdate=true;roofs.instanceMatrix.needsUpdate=true;this._world.add(blocks,roofs);
    if(mission.kind==='nuclear'||mission.aircraft==='b2')this._buildCity(mission);
  }

  _buildCity(mission){
    const waypoint=(mission.targets||[])[0]||(mission.waypoints||[]).at(-1)||{x:0,y:0,z:10000};const random=rng(884281);const n=115;
    const buildings=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),worldMaterial('#60707b'),n);
    const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),basic('#c9b68b',{transparent:true,opacity:.75}),n);
    for(let i=0;i<n;i++){
      const x=waypoint.x+(random()-.5)*1900,z=waypoint.z+(random()-.5)*1900,y=Math.max(0,height(x,z,mission));
      const sx=35+random()*75,sz=30+random()*70,sy=35+Math.pow(random(),2)*330;
      tempObject.position.set(x,y+sy*.5,z);tempObject.scale.set(sx,sy,sz);tempObject.rotation.set(0,0,0);tempObject.updateMatrix();buildings.setMatrixAt(i,tempObject.matrix);
      tempColor.set('#667784').multiplyScalar(.65+random()*.55);buildings.setColorAt(i,tempColor);
      tempObject.position.set(x,y+sy*.6,z+sz*.501);tempObject.scale.set(sx*.7,3,1);tempObject.updateMatrix();windows.setMatrixAt(i,tempObject.matrix);
    }
    this._world.add(buildings,windows);
  }

  _buildRunway(runway,mission){
    const carrier=!!runway.carrier;const group=new THREE.Group();group.position.set(runway.x||0,number(runway.y,12),runway.z||0);group.rotation.y=runway.heading||0;this._world.add(group);
    const length=number(runway.length,carrier?270:1100),width=number(runway.width,carrier?40:48);
    const asphalt=worldMaterial(carrier?'#566b70':this._night?'#394449':'#626c65');const paint=basic('#ebe6cf');const amber=basic('#d28c50');
    if(carrier){
      box(group,0,-7.5,0,width*.95,15,length*.91,worldMaterial('#43565d'));
      const bow=new THREE.Mesh(new THREE.ConeGeometry(width*.48,length*.19,4),worldMaterial('#4d6269'));bow.rotation.x=Math.PI/2;bow.rotation.z=Math.PI/4;bow.scale.z=.45;bow.position.set(0,-4,length*.43);group.add(bow);
      box(group,0,-.25,0,width,.5,length,asphalt);
      box(group,width*.37,5,-length*.12,width*.24,10,length*.23,worldMaterial('#74878a'));
      box(group,width*.4,13,-length*.13,width*.2,6,length*.11,worldMaterial('#809193'));
      box(group,width*.4,18,-length*.17,1,10,1,worldMaterial('#8c9b98'));
      box(group,width*.4,21,-length*.17,width*.23,.5,.5,paint);
      if(mission.aircraft==='harrier'){
        const ramp=box(group,-width*.12,1.35,length*.43,width*.61,.4,length*.13,asphalt);ramp.rotation.x=-.17;
        for(const s of[-1,1]){const edge=box(group,-width*.12+s*width*.295,1.7,length*.43,.45,.3,length*.13,paint);edge.rotation.x=-.17;}
      }
      for(let i=0;i<4;i++)box(group,0,.12,-length*.28+i*7,width*.72,.14,.4,paint);
      const wake=box(group,0,-number(runway.y,12)+.2,-length*.8,width*1.3,.15,length*.66,basic('#91a9a4',{transparent:true,opacity:.2}));
      wake.rotation.y=.05;
    }else{
      box(group,0,-.65,0,width+110,1.1,length+110,worldMaterial(mission.biome==='desert'?'#c0a37b':'#7b8b6d'));
      box(group,0,-.12,0,width,.24,length,asphalt);
      box(group,width*.82,-.1,-length*.2,width*.72,.2,length*.32,asphalt);
      for(let i=0;i<3;i++){
        const hx=width*1.65,hz=-length*.28+i*67;box(group,hx,8,hz,47,16,44,worldMaterial('#89958a'));
        const roof=new THREE.Mesh(new THREE.CylinderGeometry(24,24,44,10,1,false,0,Math.PI),worldMaterial('#697c74'));roof.rotation.x=Math.PI/2;roof.rotation.z=Math.PI/2;roof.position.set(hx,14,hz);group.add(roof);
        box(group,hx-23.7,7,hz,.25,13,34,worldMaterial('#405a54'));
      }
      box(group,-width*1.6,12,-length*.28,11,24,11,worldMaterial('#b4b69c'));box(group,-width*1.6,25,-length*.28,16,5,16,worldMaterial('#668385'));
      this._buildWindsock(group,-width*1.55,length*.24);
    }
    const inset=carrier?width*.15:width*.07;
    for(const s of[-1,1])box(group,s*(width*.5-inset),.13,0,.55,.12,length*.95,paint);
    for(let z=-length*.4;z<=length*.4;z+=carrier?23:52)box(group,carrier?-width*.12:0,.15,z,carrier?.7:1.2,.12,carrier?9:22,paint);
    for(const end of[-1,1])for(let i=-3;i<=3;i++)box(group,i*width*.087,.16,end*(length*.46),width*.045,.12,carrier?7:25,paint);
    if(!carrier){
      const strip=new THREE.InstancedMesh(new THREE.BoxGeometry(1.1,1.3,1.1),basic(this._night?'#ffcd75':'#dfce99'),Math.ceil(length/70)*2);let idx=0;
      for(let z=-length/2;z<length/2;z+=70)for(const s of[-1,1]){tempObject.position.set(s*(width/2+4),.75,z);tempObject.scale.set(1,1,1);tempObject.rotation.set(0,0,0);tempObject.updateMatrix();strip.setMatrixAt(idx++,tempObject.matrix);}strip.count=idx;group.add(strip);
      this._runwayNumber(group,runway.heading||0,length,width);
    }
    const label=this._label(runway.label|| (carrier?'CARRIER':'AIRFIELD'),carrier?'#d5d9c9':'#f0e7cb');label.position.set(width*.7,carrier?45:35,-length*.4);label.scale.set(150,24,1);group.add(label);
  }

  _runwayNumber(group,heading,length,width){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#e6e2cc';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 155px sans-serif';const n=((Math.round(heading*180/Math.PI/10)%36)+36)%36||36;ctx.fillText(String(n).padStart(2,'0'),128,128);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const marking=new THREE.Mesh(new THREE.PlaneGeometry(width*.55,width*.55),basic('#ffffff',{map:texture,transparent:true,depthWrite:false}));marking.rotation.x=-Math.PI/2;marking.position.set(0,.23,-length*.39);group.add(marking);
  }

  _buildWindsock(parent,x,z){
    const pole=worldMaterial('#c6c5a9');cylinder(parent,x,9,z,.25,18,pole,6);const pivot=new THREE.Group();pivot.position.set(x,18,z);parent.add(pivot);
    for(let i=0;i<5;i++){
      const part=new THREE.Mesh(new THREE.CylinderGeometry(1.15-i*.16,1.31-i*.16,1.5,8,1,true),worldMaterial(i%2?'#efe4c7':'#cd7144',{side:THREE.DoubleSide}));
      part.rotation.z=Math.PI/2;part.position.set(1.0+i*1.47,-i*.17,0);pivot.add(part);
    }
    this._sceneryAnimations.push({type:'windsock',object:pivot,offset:x*.1});
  }

  _label(text,fill='#f1e7cf'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,512,80);ctx.fillStyle='rgba(24,39,42,.68)';ctx.fillRect(0,3,512,70);ctx.fillStyle=fill;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 29px monospace';ctx.fillText(String(text).slice(0,28).toUpperCase(),256,39);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false}));return sprite;
  }

  _buildWaypoints(mission){
    const waypoints=mission.waypoints||[];let prev=mission.start||{x:0,y:20,z:-100};
    for(let i=0;i<waypoints.length;i++){
      const wp=waypoints[i],r=clamp(number(wp.radius,180),55,700);const group=new THREE.Group();group.position.set(wp.x,wp.y,wp.z);
      const material=basic('#e5b36a',{transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});
      const ring=new THREE.Mesh(new THREE.RingGeometry(r-2.0,r+2.0,64),material);group.add(ring);
      const direction=new THREE.Vector3(wp.x-number(prev.x),wp.y-number(prev.y),wp.z-number(prev.z)).normalize();if(direction.lengthSq()>.1)ring.quaternion.setFromUnitVectors(axisZ,direction);
      const label=this._label(String(i+1).padStart(2,'0')+'  '+(wp.label||'WAYPOINT'));label.position.y=r+40;label.scale.set(220,34,1);group.add(label);
      this._world.add(group);this._rings.push({group,ring,label,radius:r,index:i});prev=wp;
    }
    if(mission.kind==='airdrop'||mission.kind==='paratroopers'||mission.aircraft==='c47'){
      const wp=(mission.targets||[]).find(t=>t.type==='dropzone')||waypoints.at(-1)||(mission.targets||[])[0];if(wp){
        const ground=height(wp.x,wp.z,mission)+.6;const marker=new THREE.Mesh(new THREE.PlaneGeometry(480,600),basic('#afbd79',{transparent:true,opacity:.3,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.set(wp.x,ground,wp.z);this._world.add(marker);
        box(this._world,wp.x,ground+.3,wp.z,190,.2,17,basic('#e7deae'));box(this._world,wp.x,ground+.3,wp.z-70,17,.2,140,basic('#e7deae'));
      }
    }
  }

  _makeTarget(target){
    const group=new THREE.Group(),type=String(target.type||'truck');const olive=worldMaterial('#68755c'),dark=worldMaterial('#374842'),light=worldMaterial('#b5af89');
    if(type==='balloon'){
      const balloon=sphere(group,0,0,0,15,worldMaterial('#b6a883'),2);balloon.scale.set(.8,1.2,2.2);
      box(group,0,-22,0,5,4,5,worldMaterial('#795c43'));
      for(const s of[-1,1]){const wire=box(group,s*2,-14,0,.15,15,.15,dark);wire.rotation.z=s*.1;}
      const fin=box(group,0,0,-26,.8,16,10,light);fin.rotation.x=.4;
    }else if(type==='dropzone'){
      // The broad landing zone is rendered in the terrain layer; its actor is a beacon.
      cylinder(group,0,1,0,2.5,2,light,8);
    }else if(type==='flak'){
      cylinder(group,0,.7,0,4.5,1.4,dark,8);cylinder(group,0,2,0,2,3,olive,8);
      for(const s of[-1,1]){const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.27,.4,8,7),olive);barrel.position.set(s*.65,5,1.5);barrel.rotation.x=.65;group.add(barrel);}
      box(group,0,3,-1,4,2,2,light);
    }else if(type==='sam'){
      box(group,0,2,0,8,3,12,olive);box(group,0,4.1,-1,6,2,7,dark);
      for(const x of[-2,0,2]){const rocket=new THREE.Mesh(new THREE.CylinderGeometry(.38,.5,9,7),light);rocket.position.set(x,7,0);rocket.rotation.x=.7;group.add(rocket);}
      for(const s of[-1,1])box(group,s*4,1.3,0,1.3,2.5,10,dark);
    }else if(type==='depot'||type==='city'||type==='practice'){
      box(group,0,8,0,type==='practice'?16:52,16,type==='practice'?16:42,olive);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(type==='practice'?14:37,12,4),light);roof.rotation.y=Math.PI/4;roof.position.y=21;group.add(roof);
      if(type!=='practice')for(let i=0;i<3;i++)cylinder(group,34,7,(i-1)*14,6,14,worldMaterial('#8b9281'));
      else{const aim=new THREE.Mesh(new THREE.RingGeometry(3,6,20),basic('#e6c391',{side:THREE.DoubleSide}));aim.position.set(0,9,-8.1);group.add(aim);}
    }else if(/ship|boat/.test(type)){
      box(group,0,1.5,0,18,7,68,dark);box(group,0,7,0,12,7,29,olive);box(group,0,14,-6,5,10,8,light);
    }else{
      box(group,0,2,0,5.8,3.2,11,olive);box(group,0,4.1,3.4,5.5,3,3.7,light);box(group,0,4.1,-2,5.2,2.7,6.0,worldMaterial('#8c8d6e'));
      for(const s of[-1,1])for(const z of[-3.2,3.2]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,.8,8),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(s*3,1.2,z);group.add(wheel);}
    }
    return group;
  }

  _updateEntities(sim,dt,remotePlayers){
    const seen=new Set();
    for(const enemy of sim.enemies||[]){
      const id=String(enemy.id);seen.add(id);let actor=this._actors.get(id);
      if(!actor){
        const special=/^he111/.test(id)?'he111':/^bf109/.test(id)?'bf109':/^mig-/.test(id)?'mig21':null;
        actor=makeAircraft(special||enemy.aircraft||(/bomber/.test(enemy.type)?'b17':this._targetProfile),enemy.friendly?'ally':'enemy');this._actors.set(id,actor);this.actorsRoot.add(actor);
      }
      actor.visible=enemy.alive!==false&&number(enemy.health,1)>0&&enemy.active!==false;
      if(actor.visible){setAircraftPose(actor,enemy);animateAircraft(actor,{...enemy,gear:false},dt,this.time);}
    }
    for(const[id,actor]of this._actors)if(!seen.has(id)){actor.removeFromParent();this._actors.delete(id);}
    const targetSeen=new Set();
    for(const target of sim.targets||[]){
      const id=String(target.id);targetSeen.add(id);let model=this._targets.get(id);
      if(!model){model=this._makeTarget(target);this._targets.set(id,model);this.actorsRoot.add(model);}
      model.visible=target.alive!==false&&number(target.health,1)>0&&target.active!==false;
      const yy=number(target.y,height(target.x,target.z,this.mission));model.position.set(number(target.x),yy,number(target.z));model.rotation.y=number(target.heading);
      if(target.type==='balloon')model.position.y+=Math.sin(this.time*.4+number(target.x))*.8;
    }
    for(const[id,model]of this._targets)if(!targetSeen.has(id)){model.removeFromParent();this._disposeUnique(model);this._targets.delete(id);}
    const remoteSeen=new Set();
    for(const remote of remotePlayers||[]){
      const pose=remote.pose||remote.player||remote,id=String(remote.id||pose.id);if(!Number.isFinite(pose.x))continue;remoteSeen.add(id);
      let model=this._remote.get(id);if(!model){model=makeAircraft(pose.aircraft||this.aircraft,'ally');this._remote.set(id,model);this.actorsRoot.add(model);}
      model.visible=number(pose.health,100)>0;setAircraftPose(model,pose);animateAircraft(model,pose,dt,this.time);
    }
    for(const[id,model]of this._remote)if(!remoteSeen.has(id)){model.removeFromParent();this._remote.delete(id);}
  }

  _buildPools(){
    this._linePositions=new Float32Array(320*6);this._lineColors=new Float32Array(320*6);
    const linesGeometry=new THREE.BufferGeometry();linesGeometry.setAttribute('position',new THREE.BufferAttribute(this._linePositions,3).setUsage(THREE.DynamicDrawUsage));linesGeometry.setAttribute('color',new THREE.BufferAttribute(this._lineColors,3).setUsage(THREE.DynamicDrawUsage));
    this._tracers=new THREE.LineSegments(linesGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,depthWrite:false}));this._tracers.frustumCulled=false;this.effectsRoot.add(this._tracers);
    this._tips=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),basic('#f8d68a'),160);this._tips.frustumCulled=false;this.effectsRoot.add(this._tips);
    this._explosions=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),basic('#ffbb66',{transparent:true,opacity:.57,depthWrite:false}),100);this._explosions.frustumCulled=false;this.effectsRoot.add(this._explosions);
    this._canopies=new THREE.InstancedMesh(new THREE.SphereGeometry(4.1,10,5,0,TAU,0,Math.PI*.56),worldMaterial('#e3dec3',{side:THREE.DoubleSide}),80);this._canopies.frustumCulled=false;this.effectsRoot.add(this._canopies);
    this._troopers=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.45,1.5,2,5),worldMaterial('#606c50'),80);this._troopers.frustumCulled=false;this.effectsRoot.add(this._troopers);
    this._tips.count=this._explosions.count=this._canopies.count=this._troopers.count=0;linesGeometry.setDrawRange(0,0);
  }

  _updatePools(sim){
    let lineCount=0,tips=0;const writeLine=(a,b,c1,c2)=>{if(lineCount>=320)return;const o=lineCount*6;this._linePositions.set([a[0],a[1],a[2],b[0],b[1],b[2]],o);this._lineColors.set([...c1,...c2],o);lineCount++;};
    for(const p of sim.projectiles||[]){
      if(p.life<=0||tips>=160)continue;const missile=p.type==='missile',bomb=p.type==='bomb',tail=missile?.18:bomb?.025:.035;
      if(!bomb)writeLine([p.x,p.y,p.z],[p.x-number(p.vx)*tail,p.y-number(p.vy)*tail,p.z-number(p.vz)*tail],missile?[1,.78,.42]:[1,.9,.55],missile?[.65,.75,.75]:[.6,.36,.12]);
      tempObject.position.set(p.x,p.y,p.z);const r=bomb?1.0:missile?1.2:.3;tempObject.scale.set(r,r,r);tempObject.rotation.set(0,0,0);tempObject.updateMatrix();this._tips.setMatrixAt(tips,tempObject.matrix);this._tips.setColorAt(tips,tempColor.set(bomb?'#525a51':missile?'#ffd58a':'#fff1bc'));tips++;
    }
    let ecount=0;
    for(const effect of sim.effects||[]){
      if(ecount>=100)break;const f=clamp(number(effect.age)/Math.max(.1,number(effect.life,2)),0,1);if(f>=1)continue;
      const type=effect.type||effect.kind;let r=number(effect.radius,type==='flash'?100:12)*(1+f*1.3);
      if(type==='smoke')r*=1.8;
      tempObject.position.set(number(effect.x),number(effect.y)+(type==='smoke'?f*12:0),number(effect.z));tempObject.scale.set(r,r*(type==='impact'?.55:1),r);tempObject.rotation.set(f*.8,number(effect.x)*.03,0);tempObject.updateMatrix();this._explosions.setMatrixAt(ecount,tempObject.matrix);
      tempColor.set(type==='smoke'?'#79817b':type==='flash'?'#fff0ca':type==='drop'?'#d9debb':'#f4b762').lerp(color('#7d8072'),f*.9);this._explosions.setColorAt(ecount,tempColor);ecount++;
    }
    let troopCount=0;
    for(const p of sim.paratroopers||[]){
      if(troopCount>=80||p.life<=0||p.landed)continue;
      tempObject.position.set(p.x,p.y+4.1,p.z);tempObject.scale.set(1,1,1);tempObject.rotation.set(.03*Math.sin(this.time+p.x),.1*Math.sin(this.time*.4+p.z),.03*Math.cos(this.time+p.z));tempObject.updateMatrix();this._canopies.setMatrixAt(troopCount,tempObject.matrix);
      tempObject.position.set(p.x,p.y,p.z);tempObject.rotation.set(0,0,0);tempObject.updateMatrix();this._troopers.setMatrixAt(troopCount,tempObject.matrix);
      for(const s of[-1,1])writeLine([p.x+s*.4,p.y+.5,p.z],[p.x+s*3.6,p.y+4,p.z],[.65,.67,.55],[.65,.67,.55]);troopCount++;
    }
    this._tips.count=tips;this._explosions.count=ecount;this._canopies.count=troopCount;this._troopers.count=troopCount;
    for(const m of[this._tips,this._explosions,this._canopies,this._troopers]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
    this._tracers.geometry.setDrawRange(0,lineCount*2);this._tracers.geometry.attributes.position.needsUpdate=true;this._tracers.geometry.attributes.color.needsUpdate=true;
  }

  _buildCockpit(){
    this._cockpit=new THREE.Group();this._cockpit.visible=false;this.camera.add(this._cockpit);
    const black=worldMaterial('#273536'),edge=worldMaterial('#7b8979');
    box(this._cockpit,0,-.52,-.76,1.35,.23,.2,black);
    const arc=new THREE.Mesh(new THREE.TorusGeometry(.57,.012,6,48,Math.PI),edge);arc.position.set(0,-.08,-.86);this._cockpit.add(arc);
    for(const s of[-1,1]){const strut=box(this._cockpit,s*.57,-.34,-.88,.018,.55,.018,edge);strut.rotation.z=s*.08;}
    this._needles=[];
    for(let i=0;i<3;i++){
      const disc=new THREE.Mesh(new THREE.CircleGeometry(.076,28),basic('#e4ddbd'));disc.position.set((i-1)*.2,-.44,-.65);this._cockpit.add(disc);
      const inner=new THREE.Mesh(new THREE.CircleGeometry(.067,28),basic('#22343a'));inner.position.copy(disc.position);inner.position.z+=.002;this._cockpit.add(inner);
      for(let n=0;n<8;n++){const a=TAU*n/8;const tick=box(this._cockpit,disc.position.x+Math.sin(a)*.057,disc.position.y+Math.cos(a)*.057,-.646,.004,.011,.002,basic('#b8c1aa'));tick.rotation.z=-a;}
      const pivot=new THREE.Group();pivot.position.set(disc.position.x,disc.position.y,-.642);box(pivot,0,.023,0,.004,.05,.002,basic('#e5a75e'));this._cockpit.add(pivot);this._needles.push(pivot);
    }
  }

  _updateCamera(p,dt,options){
    const mode=options.camera||'chase';const cockpit=mode==='cockpit';this._cockpit.visible=cockpit;this._plane.visible=!cockpit;
    const heading=number(p.heading),pitch=number(p.pitch),originY=p.y-number(this._visualGearOffset);const forward=scratchV.set(Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),Math.cos(heading)*Math.cos(pitch));
    const lookX=number(options.lookX),lookY=clamp(number(options.lookY),-1.15,1.15);
    let px,py,pz,tx,ty,tz;
    if(cockpit){
      px=p.x+forward.x*2;py=originY+.85+forward.y*2;pz=p.z+forward.z*2;
      const yh=heading+lookX,yp=pitch+lookY;tx=px+Math.sin(yh)*Math.cos(yp)*100;ty=py+Math.sin(yp)*100;tz=pz+Math.cos(yh)*Math.cos(yp)*100;
      if(this.settings.horizonLock===false&&!this.settings.reducedMotion)scratchUp.set(0,1,0).applyEuler(new THREE.Euler(-pitch,heading,-number(p.roll),'YXZ'));else scratchUp.set(0,1,0);
    }else{
      const length=this._plane.userData.length||9;const distance=clamp(length*2.35+number(p.speed)*.055,23,84);
      const side=mode==='cinematic'?.68:0;const a=heading+lookX+side;
      const elev=clamp(length*.4+number(p.speed)*.012,5.4,20)+Math.sin(lookY)*distance;
      px=p.x-Math.sin(a)*distance*Math.cos(lookY);py=originY+elev-pitch*distance*.24;pz=p.z-Math.cos(a)*distance*Math.cos(lookY);
      py=Math.max(height(px,pz,this.mission)+3.4,py);
      const ahead=Math.abs(lookX)>.05||Math.abs(lookY)>.05||mode==='cinematic'?length*.2:95;
      tx=p.x+forward.x*ahead;ty=originY+forward.y*ahead+length*.18;tz=p.z+forward.z*ahead;
      scratchUp.set(0,1,0);
    }
    const alpha=cockpit||!this._cameraInitialized?1:1-Math.exp(-dt*(this.settings.reducedMotion?12:mode==='cinematic'?3.2:7.5));
    scratchD.set(px,py,pz);this.camera.position.lerp(scratchD,alpha);this.camera.up.copy(scratchUp);
    if(!this._cameraTarget)this._cameraTarget=new THREE.Vector3(tx,ty,tz);else this._cameraTarget.lerp(scratchD.set(tx,ty,tz),this._cameraInitialized?1-Math.exp(-dt*10):1);
    this.camera.lookAt(this._cameraTarget);this._cameraInitialized=true;
    if(cockpit){this._needles[0].rotation.z=-number(p.speed)*.017;this._needles[1].rotation.z=-number(p.y)*.004;this._needles[2].rotation.z=-number(p.fuel,100)*.05;}
  }

  _updateWeather(p,dt){
    this.sky.position.copy(this.camera.position);
    if(this.waterMaterial){this.waterMaterial.uniforms.time.value=this.time;this.waterMaterial.uniforms.fogColor.value.copy(this.scene.fog.color);this.waterMaterial.uniforms.fogNear.value=this.scene.fog.near;this.waterMaterial.uniforms.fogFar.value=this.scene.fog.far;}
    let visibility=1;const base=this._cloudBase,top=this._cloudTop;
    if(p.y>base-55&&p.y<top+55){const inside=Math.min(clamp((p.y-base+55)/130,0,1),clamp((top+55-p.y)/130,0,1));visibility=1-inside*.92;}
    this.scene.fog.far=lerp(750,this._fogFar,visibility)*(p.y>3500?Math.min(2.1,1+(p.y-3500)/10000):1);this.scene.fog.near=Math.min(this._fogNear,this.scene.fog.far*.08);
    if(this._clouds){const wind=this.mission.weather?.wind;const wx=typeof wind==='number'?wind:number(wind?.x,4),wz=typeof wind==='number'?0:number(wind?.z,0);this._clouds.position.set(Math.sin(this.time*.0003)*wx*1800,0,Math.sin(this.time*.0003)*wz*1800);}
    for(const item of this._sceneryAnimations)if(item.type==='windsock'){item.object.rotation.y=.6+Math.sin(this.time*.5+item.offset)*.12;item.object.rotation.z=Math.sin(this.time*2+item.offset)*.035;}
  }

  render(sim,dt=1/60,options={}){
    if(this.contextLost||!sim?.player||!this._plane)return;
    dt=clamp(number(dt,1/60),0,.1);this.time+=dt;
    const p=sim.player;setAircraftPose(this._plane,p);this._visualGearOffset=lerp(number(this._visualGearOffset),p.onGround?1.3:0,1-Math.exp(-dt*8));this._plane.position.y-=this._visualGearOffset;animateAircraft(this._plane,p,dt,this.time);
    this._updateEntities(sim,dt,options.remotePlayers||[]);this._updatePools(sim);this._updateCamera(p,dt,options);this._updateWeather(p,dt);
    const active=number(sim.waypointIndex);const guidance=this.settings.guidance||this.settings.assist;
    for(const wp of this._rings){
      const delta=wp.index-active;wp.group.visible=guidance!=='expert'&&guidance!=='minimal'&&this.settings.gates!==false&&delta>=0&&delta<(guidance==='standard'?1:3);
      wp.ring.material.opacity=delta===0?.8:.2;wp.ring.material.color.set(delta===0?'#e2ad60':'#d0dbbe');
      wp.label.visible=delta===0;const distance=this.camera.position.distanceTo(wp.group.position);const scale=clamp(distance*.13,170,520);wp.label.scale.set(scale,scale*.156,1);
    }
    this.renderer.render(this.scene,this.camera);
    this.stats.fps=lerp(this.stats.fps,dt>0?1/dt:60,.025);this.stats.drawCalls=this.renderer.info.render.calls;this.stats.triangles=this.renderer.info.render.triangles;
  }

  renderMenu(time=0,aircraft={id:'avro504'}){
    const profile=typeof aircraft==='string'?{id:aircraft}:aircraft;const key=JSON.stringify([profile?.id,profile?.model,profile?.color]);
    if(this._mode!=='menu'||this._menuAircraftKey!==key){
      const menu={id:'skyward-menu',biome:'countryside',aircraft:profile.id||'avro504',weather:{wind:4,cloudBase:980,cloudTop:1400,timeOfDay:'sunset',fog:.08},runways:[{x:-1700,z:3600,y:12,length:1100,width:44,heading:.45,label:'THE BEGINNING'}],waypoints:[],targets:[],start:{x:0,y:420,z:0}};
      this.loadMission(menu,profile);this._mode='menu';this._menuAircraftKey=key;this._setAtmosphere(menu,true);this._cockpit.visible=false;
    }
    const seconds=number(time);const dt=clamp(seconds-number(this._lastMenuTime,seconds-1/60),.001,.06);this._lastMenuTime=seconds;this.time=seconds;
    const motion=this.settings.reducedMotion?0:1;const p={x:70*Math.sin(seconds*.012)*motion,y:440+Math.sin(seconds*.31)*1.5*motion,z:Math.sin(seconds*.008)*1600*motion,heading:-.32,pitch:.025+Math.sin(seconds*.22)*.01*motion,roll:.04+Math.sin(seconds*.27)*.025*motion,throttle:.62,engine:true,gear:true};
    if(this._plane.userData.kind!=='avro504'&&this._plane.userData.kind!=='camel')p.gear=false;
    setAircraftPose(this._plane,p);animateAircraft(this._plane,p,dt,seconds);this._plane.visible=true;
    const span=this._plane.userData.span||11;const distance=Math.max(23,span*2.7);const portrait=this.width<this.height;
    this.camera.fov=portrait?53:46;this.camera.updateProjectionMatrix();
    this.camera.position.set(p.x+distance*.68,p.y+distance*.23,p.z+distance*.72);
    const right=new THREE.Vector3(.72,0,-.68).normalize();
    const shift=portrait?0:span*.76;
    this.camera.lookAt(p.x-right.x*shift,p.y+(portrait?-span*.48:span*.05),p.z-right.z*shift);
    this.camera.up.set(0,1,0);this.sky.position.copy(this.camera.position);
    this.scene.fog.near=1200;this.scene.fog.far=19000;
    if(this.waterMaterial)this.waterMaterial.uniforms.time.value=seconds;
    if(this._clouds)this._clouds.position.x=Math.sin(seconds*.002)*100;
    this._tips.count=this._explosions.count=this._canopies.count=this._troopers.count=0;this._tracers.geometry.setDrawRange(0,0);
    if(!this.contextLost)this.renderer.render(this.scene,this.camera);
  }

  project(x,y,z){
    this.camera.updateMatrixWorld();scratchV.set(x,y,z).project(this.camera);
    return{x:(scratchV.x*.5+.5)*this.width,y:(-.5*scratchV.y+.5)*this.height,visible:scratchV.z>-1&&scratchV.z<1&&Math.abs(scratchV.x)<1.12&&Math.abs(scratchV.y)<1.12,depth:scratchV.z};
  }

  _disposeUnique(root){const geo=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});for(const g of geo)g.dispose();for(const m of materials){m.map?.dispose();m.dispose();}}

  dispose(){
    this.canvas.removeEventListener('webglcontextlost',this._lost);this.canvas.removeEventListener('webglcontextrestored',this._restored);
    this._clearWorld();this._disposeUnique(this.effectsRoot);this._disposeUnique(this._cockpit);this._disposeUnique(this.sky);disposeModelCache();this.renderer.dispose();
  }
}
