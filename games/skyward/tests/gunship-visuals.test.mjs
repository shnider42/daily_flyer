import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {makeAircraft,aircraftKind,animateAircraft,disposeModelCache} from '../public/models.mjs';
import {aircraftGeometryStats} from '../public/model-batching.mjs';
import {cockpitFamily} from '../public/cockpit-models.mjs';
import {FlightRenderer} from '../public/renderer.mjs';
import {SoftwareFlightRenderer} from '../public/software.mjs';
import {AIRCRAFT,getMission} from '../public/campaign.mjs';
import {FlightSimulation,terrainHeight} from '../public/sim.mjs';
import {orientationFromEuler} from '../public/orientation.mjs';
import {GUNSHIP_STATIONS,gunshipStationPose,createGunshipCrewState} from '../public/gunship.mjs';
import {gunshipStationLayout,makeGunshipStation,fitGunshipStation,updateGunshipStation} from '../public/gunship-views.mjs';
import {gunshipTargetParts,GUNSHIP_ROAD_TILES} from '../public/gunship-scenery.mjs';

const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} vs ${b}`);
const vector=p=>new THREE.Vector3(p.x,p.y,p.z);
const closeVector=(a,b,message)=>close(a.distanceTo(b),0,message);
function canvas(width=1280,height=720){
  const noop=()=>{},ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(target,key)=>target[key]??noop});
  return {width,height,getContext:()=>ctx,getBoundingClientRect:()=>({width,height})};
}
function webRenderer(){
  const r=Object.create(FlightRenderer.prototype);
  Object.assign(r,{width:1280,height:720,settings:{},time:0,mission:getMission('gunship-nightwatch'),camera:new THREE.PerspectiveCamera(59,1280/720,.35,95000),_plane:new THREE.Group(),_cockpit:new THREE.Group(),_visualGearOffset:0,_cameraInitialized:false});
  r._plane.userData.length=29.8;return r;
}
function softwareRenderer(){const r=new SoftwareFlightRenderer(canvas(),{quality:'medium'});r.loadMission(getMission('gunship-nightwatch'),AIRCRAFT.ac130);return r;}

test('AC-130 has its transport proportions, four independent props and three correctly positioned port weapons',()=>{
  for(const name of['AC-130U','ac130','Spooky gunship'])assert.equal(aircraftKind(name),'ac130');
  assert.equal(cockpitFamily('ac130'),'heavy');
  const plane=makeAircraft('ac130'),other=makeAircraft('ac130'),data=plane.userData,size=new THREE.Box3().setFromObject(plane).getSize(new THREE.Vector3());
  close(data.span,40.4,'span');close(data.length,29.8,'length');assert.ok(size.x>40&&size.x<41&&size.y>11&&size.y<12&&size.z>29&&size.z<30);
  assert.equal(data.propellers.length,4);assert.equal(data.exhausts.length,0,'turboprops have no afterburner');
  plane.updateMatrixWorld(true);const propX=data.propellers.map(prop=>prop.getWorldPosition(new THREE.Vector3()).x).sort((a,b)=>a-b);
  assert.deepEqual(propX,[-10.5,-5,5,10.5]);
  for(const station of GUNSHIP_STATIONS){const port=plane.getObjectByName('gun-port-'+station.id);assert.ok(port);closeVector(port.position,vector(station.mount),'gun mount follows shared station');assert.ok(port.position.x>0,'all weapons are port-side');}
  animateAircraft(plane,{engine:true,gear:false,throttle:.75},.1);assert.ok(data.propellers.every(prop=>prop.rotation.z>0));assert.ok(other.userData.propellers.every(prop=>prop.rotation.z===0));assert.equal(data.gear.visible,false);assert.equal(other.userData.gear.visible,true);
  assert.ok(data.geometryStats.triangles<23000&&data.geometryStats.drawCalls<=30,'same detailed-aircraft geometry and draw budget');
  assert.ok(makeAircraft('ac130','enemy').userData.geometryStats.triangles<data.geometryStats.triangles*.82,'reduced distant model');
  plane.traverse(part=>{if(part.geometry)for(const attribute of Object.values(part.geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value),'finite surface data');});
});

test('WebGL and compatibility gunner views share exact airframe-relative position, attitude and zoom',()=>{
  const web=webRenderer(),software=softwareRenderer();
  for(const orientation of[orientationFromEuler(.4,.15,.6),orientationFromEuler(.8,Math.PI/2,.3),orientationFromEuler(.1,-Math.PI/2,-1),orientationFromEuler(0,0,Math.PI)]){
    for(const station of GUNSHIP_STATIONS)for(const zoom of[false,true]){
      const p={x:20,y:1100,z:-600,orientation,speed:100},gunner={seat:station.id,yaw:.31,pitch:-.13,zoom},view=gunshipStationPose(p,station.id,gunner);
      web._updateCamera(p,1/60,{camera:'gunner',gunner});software._camera(p,1/60,{camera:'gunner',gunner});
      for(const renderer of[web,software]){
        closeVector(renderer.camera.position,vector(view.position),'eye follows airframe');closeVector(renderer.camera.getWorldDirection(new THREE.Vector3()),vector(view.direction),'sight follows body-relative gun ray');closeVector(renderer.camera.up,vector(view.up),'gunner inherits aircraft roll');
        assert.equal(renderer.camera.fov,zoom?station.zoomFov:station.fov);
      }
      assert.equal(web._plane.visible,false);assert.equal(web._cockpit.visible,false);assert.equal(web._gunshipStation.visible,true);assert.equal(web._gunshipStation.userData.layout.seat,station.id);assert.equal(software._gunshipPanel.layout.seat,station.id);
    }
  }
  const p={x:0,y:1000,z:0,speed:90};web._updateCamera(p,1/60,{camera:'cockpit'});software._camera(p,1/60,{camera:'cockpit'});
  assert.equal(web._gunshipStation.visible,false);assert.equal(web._cockpit.visible,true);assert.equal(web.camera.fov,59);assert.equal(software.camera.fov,59);
  web._updateCamera(p,1/60,{camera:'chase'});assert.equal(web._plane.visible,true);software.dispose();
});

test('the initial port sight contains the mission depot and the world ray projects onto the reticle center',()=>{
  const r=softwareRenderer(),mission=getMission('gunship-nightwatch'),sim=new FlightSimulation(mission),target=sim.targets.find(t=>t.id==='nightwatch-depot');
  for(const station of GUNSHIP_STATIONS){
    const gunner={seat:station.id,yaw:0,pitch:0,zoom:true};r._camera(sim.player,1/60,{camera:'gunner',gunner});
    const view=gunshipStationPose(sim.player,station.id,gunner),point=r.project(view.eye.x+view.direction.x*2000,view.eye.y+view.direction.y*2000,view.eye.z+view.direction.z*2000);
    close(point.x,r.width/2,'centered sight ray x');close(point.y,r.height/2,'centered sight ray y');
    const depot=r.project(target.x,target.y+10,target.z);assert.ok(depot.visible);assert.ok(Math.abs(depot.x-r.width/2)<r.width*.03&&Math.abs(depot.y-r.height/2)<r.height*.08,'depot starts near reticle, including zoom');
  }
  r.dispose();
});

function inside(point,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
test('station frames and all three breeches leave a clear center on desktop, portrait and landscape phones',()=>{
  for(const [width,height]of[[1280,720],[390,844],[844,390]])for(const station of GUNSHIP_STATIONS){
    const layout=gunshipStationLayout(station.id,width,height),model=makeGunshipStation(station.id,width,height),camera=new THREE.PerspectiveCamera(station.zoomFov,width/height,.35,95000);
    fitGunshipStation(model,camera);assert.ok(model.scale.x>0&&Number.isFinite(model.scale.x));
    for(const x of[.35,.5,.65])for(const y of[.35,.5,.59]){
      const point=[width*x,height*y];assert.ok(inside(point,layout.opening));for(const polygon of[...layout.panels,layout.barrel,layout.breech])assert.equal(inside(point,polygon),false,'physical frame leaves center visible');
    }
    model.traverse(part=>{if(part.geometry)for(const v of part.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
  }
});

test('shared shot counts recoil only the active gun model while the sight remains fixed',()=>{
  const crew=createGunshipCrewState(),station=makeGunshipStation('105mm'),camera=new THREE.PerspectiveCamera(50,16/9,.35,95000);fitGunshipStation(station,camera);
  const before=station.position.clone();updateGunshipStation(station,crew,1);crew.stations['25mm'].shots++;updateGunshipStation(station,crew,1.02);close(station.userData.gun.position.y,0,'other station has no recoil');
  crew.stations['105mm'].shots++;updateGunshipStation(station,crew,1.03);updateGunshipStation(station,crew,1.06);assert.ok(station.userData.gun.position.y<0);closeVector(station.position,before,'station/camera stays steady');
  updateGunshipStation(station,crew,2);close(station.userData.gun.position.y,0,'recoil settles');
});

test('Nightwatch target assets include a lit relay, tracked armor, cargo trucks and flak instead of one generic target',()=>{
  const r=webRenderer(),mission=getMission('gunship-nightwatch');
  assert.ok(GUNSHIP_ROAD_TILES.length>30);for(const tile of GUNSHIP_ROAD_TILES)assert.ok([tile.x,tile.z,tile.width,tile.depth,tile.heading].every(Number.isFinite));
  const relay=mission.targets.find(t=>t.id.includes('relay'));assert.ok(gunshipTargetParts(relay).some(p=>p.kind==='dish'));
  const armor=gunshipTargetParts(mission.targets.find(t=>t.type==='armor')),truck=gunshipTargetParts(mission.targets.find(t=>t.type==='truck'));
  assert.ok(armor.some(p=>p.kind==='beam'));assert.ok(!truck.some(p=>p.kind==='beam'));
  for(const target of mission.targets){const model=r._makeTarget(target),stats=aircraftGeometryStats(model);assert.ok(stats.drawCalls<=9,'batched ground-target materials');assert.ok(stats.triangles<3000);assert.ok(gunshipTargetParts(target).filter(p=>p.kind==='lamp').length>=2);assert.ok(Number.isFinite(terrainHeight(target.x,target.z,mission)));}
});

test('compatibility gunner renders every station with world targets, finite geometry and shell effects',()=>{
  const mission=getMission('gunship-nightwatch'),sim=new FlightSimulation(mission),r=softwareRenderer();
  const ownAircraft=r._aircraft;r._aircraft=()=>assert.fail('exterior player must be hidden in first-person gun stations');
  for(const station of GUNSHIP_STATIONS){
    const view=gunshipStationPose(sim.player,station.id),p={x:view.origin.x+view.direction.x*150,y:view.origin.y+view.direction.y*150,z:view.origin.z+view.direction.z*150,vx:view.direction.x*900,vy:view.direction.y*900,vz:view.direction.z*900,type:'shell',seat:station.id,life:1};
    sim.projectiles=[p];r.render(sim,1/60,{camera:'gunner',gunner:{seat:station.id,zoom:true}});assert.ok(r.stats.triangles>200);assert.ok(r._drawPool.slice(0,r._poolIndex).every(item=>item.points.every(Number.isFinite)));
  }
  r._aircraft=ownAircraft;r.dispose();
});

test.after(()=>disposeModelCache());
