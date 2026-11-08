import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {terrainHeight,surfaceHeight,lineOfSight,carrierIslandParts,carrierLaunchLane} from '../public/terrain.mjs';
import {buildSceneTerrain,packTerrainGeometry,terrainColor,groundDetails,aircraftGroundShadow} from '../public/terrain-visuals.mjs';
import {sampleCombatEffects,EFFECT_BUDGET} from '../public/combat-visuals.mjs';
import {TerrainStream} from '../public/terrain-stream.mjs';
import {FlightRenderer} from '../public/renderer.mjs';
import {SoftwareFlightRenderer} from '../public/software.mjs';
import {makeAircraft} from '../public/models.mjs';
const canyon={id:'visual-canyon',biome:'canyon',runways:[],weather:{cloudBase:2600,cloudTop:3000,fog:.00003},waypoints:[],targets:[],start:{x:0,y:300,z:0,airborne:true}};
const palette=['#998b69','#a97e5c','#5e7565','#b2a17b'];
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} vs ${b}`);
function canvas(){const noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(object,key)=>object[key]??noop});return{width:800,height:600,getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600})};}

test('both canyon terrain budgets retain the authoritative 64 m near-surface triangles',()=>{
  for(const software of[false,true]){
    const mesh=buildSceneTerrain({x:150,z:-380,mission:canyon,software,radius:22000,sampleHeight:(x,z)=>terrainHeight(x,z,canyon)});
    assert.ok(mesh.triangles<(software?20000:40000),'bounded full terrain mesh');let exact=0;
    for(const tile of mesh.tiles){
      if(Math.hypot(tile.x-150,tile.z+380)>500)continue;
      assert.equal(tile.size,64);assert.equal(tile.boundary.length,4);
      for(let i=0;i<tile.indices.length;i+=3){
        const [a,b,c]=tile.indices.slice(i,i+3).map(index=>mesh.vertices[index]);
        const x=a[0]*.2+b[0]*.35+c[0]*.45,z=a[2]*.2+b[2]*.35+c[2]*.45,y=a[1]*.2+b[1]*.35+c[1]*.45;
        near(y+.12,terrainHeight(x,z,canyon));exact++;
      }
    }
    assert.ok(exact>300,'test covers floor, slopes and multiple canyon cells');
  }
});

test('shared visual terrain has no overlap or open internal LOD edge and packs finite GPU attributes',()=>{
  const mesh=buildSceneTerrain({x:-730,z:810,mission:canyon,software:true,radius:7200,sampleHeight:(x,z)=>terrainHeight(x,z,canyon)}),edges=new Map();let area=0;
  for(const tile of mesh.tiles)for(let i=0;i<tile.indices.length;i+=3){
    const ids=tile.indices.slice(i,i+3),[a,b,c]=ids.map(index=>mesh.vertices[index]),triangle=((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]))*.5;
    assert.ok(triangle>0);area+=triangle;
    for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}
  }
  const {minX,minZ,maxX,maxZ}=mesh.bounds;near(area,(maxX-minX)*(maxZ-minZ));
  for(const [key,count]of edges){assert.ok(count<=2);if(count===2)continue;const [a,b]=key.split(':').map(i=>mesh.vertices[Number(i)]);assert.ok(a[0]===minX&&b[0]===minX||a[0]===maxX&&b[0]===maxX||a[2]===minZ&&b[2]===minZ||a[2]===maxZ&&b[2]===maxZ,'only perimeter edges may remain open');}
  const packed=packTerrainGeometry(mesh,canyon,palette);
  for(const data of Object.values(packed))assert.ok([...data].every(Number.isFinite));
  assert.equal(packed.positions.length,mesh.vertices.length*3);assert.equal(packed.normals.length,packed.positions.length);assert.equal(packed.colors.length,packed.positions.length);
  assert.ok([...packed.colors].every(c=>c>=0&&c<=1));
});

test('canyon colors distinguish walls and floor and preserve a cooler readable night surface',()=>{
  const wall=terrainColor(420,700,0,1.5,'canyon',palette),floor=terrainColor(0,90,0,.02,'canyon',palette),night=terrainColor(420,700,0,1.5,'canyon',['#2c4446']);
  assert.ok(wall[0]>wall[1]&&floor[1]>floor[0],'warm cliffs and cool floor');
  assert.ok(night.every(v=>v>25&&v<100));assert.ok(night.reduce((a,b)=>a+b)<wall.reduce((a,b)=>a+b)*.6);
});

test('terrain streaming coalesces rapid movement and falls back cleanly when a worker fails',()=>{
  class Worker{constructor(){this.sent=[];}postMessage(job){this.sent.push(job);}terminate(){this.stopped=true;}}
  const stream=new TerrainStream(Worker),worker=stream.worker;
  stream.request({key:'a'});stream.request({key:'b'});stream.request({key:'c'});stream.request({key:'c'});
  assert.deepEqual(worker.sent.map(job=>job.key),['a']);
  worker.onmessage({data:{key:'a',mesh:{anchorX:0}}});assert.deepEqual(worker.sent.map(job=>job.key),['a','c']);assert.equal(stream.take().key,'a');assert.equal(stream.take(),null);
  worker.onmessage({data:{key:'c',mesh:{anchorX:512}}});assert.equal(stream.take().mesh.anchorX,512);
  worker.onerror();assert.equal(stream.request({key:'d'}),false);assert.equal(worker.stopped,true);stream.dispose();
});

test('explosions advance from a hot core through fire and debris into rising smoke without mutating simulation',()=>{
  const effect=Object.freeze({id:'stable-burst',type:'explosion',x:10,y:100,z:-50,radius:70,age:.1,life:2.4}),initial=sampleCombatEffects([effect]);
  assert.ok(initial.some(p=>p.kind==='glow'));assert.ok(initial.filter(p=>p.kind==='fire').length>=4);assert.ok(initial.some(p=>p.kind==='ember'));assert.ok(initial.some(p=>p.kind==='ring'));
  assert.deepEqual(sampleCombatEffects([effect]),initial,'identical id/time yields identical image geometry');
  const late=sampleCombatEffects([{...effect,age:1.7}]);assert.ok(late.every(p=>p.kind==='smoke'));assert.ok(late.every(p=>p.y>effect.y));assert.equal(sampleCombatEffects([{...effect,age:effect.life}]).length,0);
  const reduced=sampleCombatEffects([effect],{reducedMotion:true});assert.ok(reduced.find(p=>p.kind==='glow').alpha<initial.find(p=>p.kind==='glow').alpha);
  const many=sampleCombatEffects(Array.from({length:500},(_,i)=>({...effect,id:i})));assert.ok(many.length<=EFFECT_BUDGET.layers);assert.ok(many.every(p=>p.alpha>0&&p.alpha<=1&&Number.isFinite(p.x+p.y+p.z+p.radius)));
});

test('GPU explosion instances fade independently and shockwaves stay within fixed buffers',()=>{
  const r=Object.create(FlightRenderer.prototype);Object.assign(r,{settings:{},mission:canyon,camera:new THREE.PerspectiveCamera(),effectsRoot:new THREE.Group(),time:0});r._buildPools();
  const effects=[{id:'burst',type:'explosion',x:0,y:200,z:-500,radius:80,age:.15,life:2.4}];r._updatePools({effects});
  assert.ok(r._explosions.count>8);assert.equal(r._shockwaves.count,1);
  const opacity=r._explosions.geometry.attributes.effectOpacity;assert.ok(new Set([...opacity.array.slice(0,r._explosions.count)]).size>2,'fire, debris and smoke have separate fades');
  const version=r._explosions.instanceMatrix.version;r._updatePools({});assert.equal(r._explosions.count,0);assert.equal(r._shockwaves.count,0);assert.equal(r._explosions.instanceMatrix.version,version);
});

test('ground scale details stay deterministic and a low shadow conforms to terrain and carrier decks',()=>{
  const details=groundDetails(0,0,canyon,(x,z)=>terrainHeight(x,z,canyon));assert.deepEqual(details,groundDetails(0,0,canyon,(x,z)=>terrainHeight(x,z,canyon)));assert.ok(details.length>20&&details.length<=384);
  const carrier={biome:'pacific',runways:[{x:0,y:12,z:0,heading:0,width:60,length:300,carrier:true}]},surface=(x,z)=>surfaceHeight(x,z,carrier),meta={span:13,length:10};
  const low=aircraftGroundShadow({x:0,y:15,z:0,heading:0},meta,surface),high=aircraftGroundShadow({x:0,y:180,z:0,heading:0},meta,surface);
  assert.ok(low.alpha>high.alpha);for(const v of low.ring)near(v[1],surface(v[0],v[2])+.2);assert.ok(low.ring.every(v=>v[1]>12));
  assert.equal(aircraftGroundShadow({x:0,y:500,z:0},meta,surface),null);assert.equal(aircraftGroundShadow({x:0,y:15,z:0,health:0},meta,surface),null);
});

test('both carrier renderers use the collider island boxes and the chosen launch lane',()=>{
  const runway={x:0,z:0,y:28,heading:.37,width:40,length:310,carrier:true,launchLaneX:-5.5},parts=carrierIslandParts(runway),mission={biome:'pacific',aircraft:'hellcat',arena:true,runways:[runway]};
  const web=Object.create(FlightRenderer.prototype);Object.assign(web,{_world:new THREE.Group(),_sceneryAnimations:[],_label:()=>new THREE.Object3D()});web._buildRunway(runway,mission);
  const group=web._world.children[0],colors={body:'74878a',bridge:'809193',glass:'233e48',mast:'8c9b98'};
  for(const part of parts.filter(part=>part.material!=='paint')){
    const model=group.children.find(node=>node.isMesh&&node.material.color.getHexString()===colors[part.material]);assert.ok(model,part.id);
    const bounds=model.geometry.boundingBox,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    near(center.x,part.x,1e-5);near(center.y,part.y,1e-5);near(center.z,part.z,1e-5);near(size.x,part.width,1e-5);near(size.y,part.height,1e-5);near(size.z,part.length,1e-5);
  }
  const software=Object.create(SoftwareFlightRenderer.prototype),boxes=[],surfaces=[];Object.assign(software,{mission,time:0,camera:new THREE.PerspectiveCamera(),_terrainHides:()=>false,_box:(...args)=>boxes.push(args),_surface:(...args)=>surfaces.push(args),_disc:()=>{}});software._runways();
  const c=Math.cos(runway.heading),s=Math.sin(runway.heading);
  for(const part of parts){const x=part.x*c+part.z*s,z=part.z*c-part.x*s;assert.ok(boxes.some(box=>Math.abs(box[0]-x)<1e-7&&Math.abs(box[1]-runway.y-part.y)<1e-7&&Math.abs(box[2]-z)<1e-7&&box[3]===part.width&&box[4]===part.height&&box[5]===part.length),part.id);}
  const lane=carrierLaunchLane(runway),centerline=surfaces.filter(surface=>surface[3]===1.3&&surface[4]===10);assert.ok(centerline.length>5);for(const surface of centerline)near(surface[0]*c-surface[2]*s,lane);
  assert.ok(group.children.filter(child=>child.isMesh).length<20,'carrier details are batched instead of adding a draw per light/stripe');
});

test('spectator focus changes exterior and cockpit once while leaving the local pilot untouched',()=>{
  const local=Object.freeze({aircraft:'camel',x:0,y:200,z:0,health:0}),target=Object.freeze({aircraft:'f22',x:50,y:900,z:200,heading:.4,pitch:.1,roll:.3,health:100,speed:250,fuel:70});
  const web=Object.create(FlightRenderer.prototype);Object.assign(web,{width:800,height:600,settings:{},aircraft:{id:'camel'},_focusAircraftKey:JSON.stringify(['camel',undefined]),_focusId:null,_plane:makeAircraft('camel'),_cockpit:new THREE.Group(),camera:new THREE.PerspectiveCamera(),actorsRoot:new THREE.Group(),_cameraInitialized:true});web.actorsRoot.add(web._plane);
  web._focusPlayer(target,{playerId:'wingmate'});assert.equal(web._plane.userData.kind,'f22');assert.equal(web._cockpit.userData.layout.family,'glass');assert.equal(web._cameraInitialized,false);
  const plane=web._plane,cockpit=web._cockpit;web._cameraInitialized=true;web._focusPlayer(target,{playerId:'wingmate'});assert.equal(web._plane,plane);assert.equal(web._cockpit,cockpit);assert.equal(web._cameraInitialized,true);assert.equal(web.actorsRoot.children.length,1);
  const software=new SoftwareFlightRenderer(canvas());software.loadMission({...canyon,biome:'countryside'},'camel');
  for(const key of['_terrain','_groundReadability','_runways','_gunshipSite','_environment','_entities','_waypoints','_effects','_cloudLayer'])software[key]=()=>{};
  const sim={player:local};software.render(sim,1/60,{camera:'cockpit',player:target,playerId:'wingmate'});assert.equal(sim.player,local);assert.equal(software._planeMeta.kind,'f22');assert.equal(software._cockpitPanel.layout.family,'glass');assert.ok(software.camera.position.distanceTo(new THREE.Vector3(target.x,target.y,target.z))<5);
  software.dispose();
});

test('software terrain cover uses the same exact canyon visibility test as weapons',()=>{
  const r=Object.create(SoftwareFlightRenderer.prototype);r.mission=canyon;r.camera=new THREE.PerspectiveCamera();r.camera.position.set(0,190,0);
  for(const target of[{x:900,y:190,z:0},{x:-1500,y:2200,z:400},{x:60,y:200,z:40}])assert.equal(r._terrainHides(target.x,target.y,target.z,7),!lineOfSight(r.camera.position,{...target,y:target.y+7},canyon,.1));
  assert.equal(r._terrainHides(500,190,0),true,'near wall hides an aircraft even inside the old 650 m shortcut');assert.equal(r._terrainHides(60,200,40),false);
});
