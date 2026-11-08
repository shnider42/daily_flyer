import * as THREE from './vendor/three.module.js';
import {mat,mesh,box,ellipsoid,cylinder,beam,loft,wing,propeller,gear,tube} from './model-parts.mjs';
import {GUNSHIP_STATIONS} from './gunship.mjs';

// Original game art, with the broad AC-130U proportions: four turboprops,
// high wing, tall tail and three port-side weapons. The station arrangement
// deliberately shares the gameplay mounts rather than implying a simulator.
// Reference: https://www.af.mil/About-Us/Fact-Sheets/Display/article/104486/ac-130u/
// Body axes: nose +Z, up +Y, port +X.
const TAU=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;

function smoothSkin(group,stations,material,detailed,sides=24){
  const sampled=[],steps=detailed?4:2;
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<steps;j++){
    const t=j/steps,a=stations[Math.max(0,i-1)],b=stations[i],c=stations[i+1],d=stations[Math.min(stations.length-1,i+2)],point=[mix(b[0],c[0],t)];
    for(let k=1;k<4;k++){
      const v=.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
      point.push(k<3?Math.max(.03,v):v);
    }
    sampled.push(point);
  }
  sampled.push(stations.at(-1));return loft(group,sampled,material,detailed?sides:14);
}

function pane(group,points,material){
  const geometry=new THREE.BufferGeometry(),indices=[];
  for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return mesh(group,geometry,material);
}

function fin(group,outline,thickness,material){
  const shape=new THREE.Shape();outline.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:1,steps:1});
  geometry.translate(0,0,-thickness/2);return mesh(group,geometry,material,0,0,0,[0,Math.PI/2,0]);
}

function gunPort(group,station,m,detailed){
  const mount=station.mount,port=new THREE.Group();port.name='gun-port-'+station.id;port.position.set(mount.x,mount.y,mount.z);
  port.userData.station=station.id;port.userData.barrelLength=station.barrelLength;group.add(port);
  // A recessed oval and its reinforced ring remain visible in the exterior.
  ellipsoid(port,[.10,.65,.59],m.dark,[.34,0,0]);
  for(const z of[-.62,.62])beam(port,[.38,-.58,z],[.38,.59,z],.075,m.metal);
  for(const y of[-.59,.59])beam(port,[.38,y,-.62],[.38,y,.62],.075,m.metal);
  const gun=new THREE.Group();gun.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(Math.cos(-.43),Math.sin(-.43),0));port.add(gun);
  const length=station.barrelLength;
  if(station.id==='25mm'){
    cylinder(gun,.24,.32,.60,m.dark,[0,0,.35]);
    for(let i=0;i<5;i++){
      const a=TAU*i/5,x=Math.sin(a)*.15,y=Math.cos(a)*.15;
      tube(gun,.052,.031,length-.3,m.metal,[x,y,(length+.3)/2],[0,0,0],detailed?10:6);
    }
    cylinder(gun,.225,.225,.10,m.dark,[0,0,length-.15]);
  }else{
    const heavy=station.id==='105mm',radius=heavy?.22:.13;
    tube(gun,radius,radius*.65,length,m.metal,[0,0,length/2],[0,0,0],detailed?20:10);
    cylinder(gun,radius*1.55,radius*1.75,length*.38,m.dark,[0,0,length*.28]);
    if(detailed){for(const side of[-1,1])cylinder(gun,.065,.065,length*.60,m.metal,[side*radius*1.5,.12,length*.39]);}
    if(heavy)tube(gun,.28,.17,.30,m.dark,[0,0,length-.1],[0,0,0],detailed?16:8);
  }
}

export function buildGunshipAircraft(group,palette,data){
  const detailed=data.detail!==false;
  const m={
    body:mat(palette.body,.71,.18),wing:mat(palette.wing,.73,.14),belly:mat('#707e84',.76,.13),
    dark:mat('#25343b',.76,.22),metal:mat('#788990',.38,.55),glass:mat('#24424f',.20,.35,{side:THREE.DoubleSide}),
    marking:mat('#b9c4bf',.79,.05,{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
    accent:mat(palette.accent,.73,.12),red:mat('#c25b49',.5,.08,{emissive:'#b33924',emissiveIntensity:.35}),green:mat('#65b5a4',.5,.08,{emissive:'#319c84',emissiveIntensity:.3}),
  };
  data.span=40.4;data.length=29.8;
  const hull=[[-14.9,.12,.26,2],[-13.7,.8,.9,1.9],[-11.8,2.1,1.8,1.5],[-9.2,3.5,3.1,.6],[-5,4.0,4.2,0],[6.7,4.0,4.2,0],[9.0,3.8,4,.1],[11.0,3.1,3.3,.05],[12.8,2.6,2.4,-.2],[14.0,1.7,1.4,-.48],[14.9,.1,.16,-.55]];
  smoothSkin(group,hull,m.body,detailed,28);
  // Raised wing carry-through and the characteristic shoulder-mounted wing.
  ellipsoid(group,[3.25,.58,4.7],m.wing,[0,1.75,.6]);
  wing(group,[[-20.2,1.6],[-11,3.25],[-2.1,4.45],[2.1,4.45],[11,3.25],[20.2,1.6],[20.2,-.55],[11,-2.2],[2.1,-3.15],[-2.1,-3.15],[-11,-2.2],[-20.2,-.55]],.66,m.wing,2.02);
  // Separate trailing-edge flaps and aileron seams are raised only a few cm;
  // they never share a coplanar face with the wing skin.
  if(detailed)for(const s of[-1,1]){
    beam(group,[s*3,2.04,-2.36],[s*10.5,2.04,-1.6],.035,m.dark);
    beam(group,[s*11.2,2.05,-1.56],[s*19.1,2.05,-.45],.035,m.dark);
    beam(group,[s*11.1,2.12,2.9],[s*11.1,2.08,-1.98],.032,m.dark);
  }
  for(const x of[-10.5,-5,5,10.5]){
    const engine=new THREE.Group();engine.position.set(x,.99,0);group.add(engine);
    smoothSkin(engine,[[-1.5,.45,.55,.35],[-.6,1.05,1.25,.1],[2.7,1.40,1.65,0],[5.3,1.30,1.48,0],[6.0,.88,1.08,0]],m.belly,detailed,20);
    cylinder(engine,.53,.60,.22,m.dark,[0,0,6.02],undefined,detailed?24:14);
    cylinder(engine,.49,.18,.64,m.metal,[0,0,6.38],undefined,detailed?24:14);
    propeller(engine,0,0,6.49,2.02,m.dark,data,4);
    // Small dark intake below each spinner, with a raised surrounding lip.
    ellipsoid(engine,[.40,.25,.15],m.dark,[0,-.63,5.55]);
    if(detailed){tube(engine,.22,.15,.72,m.dark,[.48,.18,-.48],[0,.42,0],12);}
  }
  wing(group,[[-8,-10.95],[-1.2,-8.75],[1.2,-8.75],[8,-10.95],[8,-12.65],[1.2,-13.65],[-1.2,-13.65],[-8,-12.65]],.34,m.wing,2.52);
  fin(group,[[-7.7,1.9],[-9.6,7.55],[-12.5,8.05],[-14.4,7.63],[-14.45,2.0]],.28,m.wing);
  if(detailed){
    fin(group,[[-12.8,7.93],[-14.37,7.56],[-14.40,2.2],[-13.1,2.2]],.30,m.body);
    for(const s of[-1,1]){
      // Three pale recognition blocks on the fin are intentionally fictional.
      for(let i=0;i<3;i++)box(group,[.012,.16,1.65-i*.2],m.marking,[s*.19,6.95-i*.35,-11.9]);
      beam(group,[s*1.2,2.54,-12.83],[s*7.6,2.54,-12.15],.028,m.dark);
    }
  }
  // Individual forward and side windscreen panes make a transport flight deck,
  // rather than a fighter's bubble canopy.
  for(const s of[-1,1]){
    pane(group,[[s*.06,1.55,11.58],[s*.78,1.48,11.61],[s*.96,.62,12.55],[s*.06,.76,12.68]],m.glass);
    pane(group,[[s*.90,1.46,11.46],[s*1.43,1.17,10.7],[s*1.49,.49,11.15],[s*1.07,.55,12.25]],m.glass);
    pane(group,[[s*1.48,1.12,10.53],[s*1.65,.9,9.48],[s*1.81,.3,9.55],[s*1.57,.40,10.78]],m.glass);
    if(detailed){
      beam(group,[s*.84,1.50,11.56],[s*1.02,.59,12.44],.068,m.body);
      beam(group,[s*1.45,1.20,10.65],[s*1.56,.44,10.96],.06,m.body);
      for(const z of[7.8,6.9])ellipsoid(group,[.045,.18,.20],m.glass,[s*1.94,.62,z]);
      // Low-profile gear sponsons and door seams maintain the chunky hull.
      ellipsoid(group,[.55,.72,3.25],m.belly,[s*1.87,-1.35,-2.05]);
      for(const z of[-3.9,-1.8])beam(group,[s*2.33,-1.13,z],[s*2.30,-1.72,z],.035,m.dark);
    }
  }
  GUNSHIP_STATIONS.forEach(station=>gunPort(group,station,m,detailed));
  gear(group,[[-1.65,-3.5,.62,2.9],[1.65,-3.5,.62,2.9],[-1.65,-1.9,.62,2.9],[1.65,-1.9,.62,2.9],[-.25,9.4,.46,2.95],[.25,9.4,.46,2.95]],data,false);
  // Under-nose sensor fairing, dorsal equipment and lights are visible from a
  // chase camera without adding texture fetches or transparent stacked skins.
  ellipsoid(group,[.63,.58,.64],m.dark,[0,-1.75,11.7]);
  ellipsoid(group,[.32,.30,.12],m.glass,[0,-1.92,12.23]);
  ellipsoid(group,[.47,.46,1.35],m.body,[0,2.08,7.1]);
  if(detailed){
    beam(group,[0,2.04,-3.5],[0,3.15,-4.25],.10,m.dark);
    beam(group,[0,1.95,4.9],[0,3.04,4.75],.08,m.dark);
    box(group,[.65,.28,1.3],m.accent,[0,2.26,-1]);
    for(const z of[-6.8,-8.2])for(const side of[-1,1])box(group,[.02,.95,.55],m.accent,[side*1.89,.05,z]);
  }
  ellipsoid(group,[.14,.12,.20],m.red,[20.08,2.06,.7]);
  ellipsoid(group,[.14,.12,.20],m.green,[-20.08,2.06,.7]);
  ellipsoid(group,[.13,.12,.18],m.red,[0,2.24,1.9]);
  return group;
}
