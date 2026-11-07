import * as THREE from './vendor/three.module.js';
import {orientationOf} from './orientation.mjs';

const TAU = Math.PI * 2;
const sharedMaterials = new Map();
const prototypes = new Map();

function mat(color, roughness = 0.82, metalness = 0.05, extra = {}) {
  const key = JSON.stringify([color, roughness, metalness, extra]);
  if (!sharedMaterials.has(key)) sharedMaterials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra }));
  return sharedMaterials.get(key);
}

function mesh(group, geometry, material, x = 0, y = 0, z = 0, rotation) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (rotation) m.rotation.set(...rotation);
  group.add(m);
  return m;
}

function box(group, dims, material, pos = [0, 0, 0], rotation) {
  return mesh(group, new THREE.BoxGeometry(...dims), material, ...pos, rotation);
}

function ellipsoid(group, dims, material, pos = [0, 0, 0], detail = 1) {
  const m = mesh(group, new THREE.IcosahedronGeometry(1, detail), material, ...pos);
  m.scale.set(...dims);
  return m;
}

function cylinder(group, top, bottom, height, material, pos, rotation = [Math.PI / 2, 0, 0], sides = 10) {
  return mesh(group, new THREE.CylinderGeometry(top, bottom, height, sides), material, ...pos, rotation);
}

function beam(group, a, b, width, material) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const m = box(group, [width, d.length(), width], material);
  m.position.copy(va.add(vb).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function loft(group, stations, material, sides = 10) {
  const points = [], indices = [];
  for (const [z, width, height, cy = 0] of stations) {
    for (let s = 0; s < sides; s++) {
      const a = TAU * s / sides;
      points.push(Math.cos(a) * width * 0.5, Math.sin(a) * height * 0.5 + cy, z);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) for (let s = 0; s < sides; s++) {
    const a = i * sides + s, b = i * sides + (s + 1) % sides, c = a + sides, d = b + sides;
    indices.push(a, b, c, b, d, c);
  }
  for (let s = 1; s < sides - 1; s++) {
    indices.push(0, s + 1, s);
    const end = (stations.length - 1) * sides;
    indices.push(end, end + s, end + s + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return mesh(group, g, material);
}

// A genuinely three-dimensional wing, with a separate upper and lower skin.
function wing(group, polygon, thickness, material, y = 0, z = 0) {
  const points = [], indices = [], n = polygon.length;
  for (const yy of [thickness * 0.5, -thickness * 0.5]) for (const p of polygon) points.push(p[0], yy, p[1]);
  const faces = THREE.ShapeUtils.triangulateShape(polygon.map(p => new THREE.Vector2(p[0], p[1])), []);
  for (const [a, b, c] of faces) indices.push(a, c, b, a + n, b + n, c + n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(i, j, i + n, j, j + n, i + n); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return mesh(group, g, material, 0, y, z);
}

function tailFin(group, length, height, material, x = 0, y = 0, z = -3) {
  const f = wing(group, [[0, 0.7], [height, -0.2], [height * 0.85, -length * 0.72], [0, -length]], 0.15, material);
  f.rotation.z = Math.PI / 2;
  f.position.set(x, y, z);
  return f;
}

function roundel(group, x, y, z, radius = 0.48, enemy = false) {
  const colors = enemy ? ['#e7dcc2', '#4b4741'] : ['#264659', '#efeee1', '#b84f36'];
  colors.forEach((c, i) => mesh(group, new THREE.CircleGeometry(radius * (1 - i * .28), 20), mat(c), x, y + i * .008, z, [-Math.PI / 2, 0, 0]));
}

function propeller(group, x, y, z, size, material, data, blades = 2) {
  const p = new THREE.Group(); p.position.set(x, y, z); p.userData.animated = true;
  for (let i = 0; i < blades; i++) {
    const a = TAU * i / blades;
    const b = box(p, [.18, size * 0.98, .065], material, [Math.sin(a) * size * .47, Math.cos(a) * size * .47, 0]);
    b.rotation.z = -a;
  }
  cylinder(p, .16, .19, .24, mat('#c3bcb0', .4, .5), [0, 0, .1]);
  const disc = mesh(p, new THREE.CircleGeometry(size, 28), mat('#c1bda4', .5, 0, { transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0.04);
  disc.name = 'prop-disc';
  group.add(p); data.propellers.push(p);
  return p;
}

function gear(group, points, data, fixed = false) {
  const g = new THREE.Group(); g.userData.animated = true; g.name = 'gear';
  const metal = mat('#514e47', .55, .35), rubber = mat('#262b2c');
  for (const [x, z, size = .4] of points) {
    beam(g, [x * .7, -.2, z - .2], [x, -1.1, z], .11, metal);
    cylinder(g, size, size, .22, rubber, [x, -1.15, z], [0, 0, Math.PI / 2], 12);
    cylinder(g, size * .3, size * .3, .24, metal, [x, -1.15, z], [0, 0, Math.PI / 2], 8);
  }
  group.add(g); data.gear = g; data.fixedGear = fixed;
}

function exhaust(group, x, y, z, size, data) {
  cylinder(group, size, size * 1.03, .65, mat('#313b3e', .4, .6), [x, y, z]);
  const fire = mesh(group, new THREE.ConeGeometry(size * .82, 2.5, 9), mat('#ff9c46', .6, 0, { emissive: '#e45119', emissiveIntensity: 1.6, transparent: true, opacity: .65, depthWrite: false }), x, y, z - 1.35, [-Math.PI / 2, 0, 0]);
  fire.userData.animated = true; data.exhausts.push(fire);
}

function cockpit(group, x, y, z, dims, material) {
  const c = ellipsoid(group, dims, material, [x, y, z], 2);
  box(group, [dims[0] * .08, dims[1] * 1.5, dims[2] * 1.7], mat('#6d7770'), [x, y, z]);
  return c;
}

function biplane(group, kind, palette, data) {
  const camel = kind === 'camel';
  const tan = mat(palette.body), fabric = mat(palette.wing), dark = mat('#514b3f'), red = mat(palette.accent);
  loft(group, [[-4.1,.12,.2,0],[-3.3,.4,.5,0],[-1.1,.9,.85,0],[1.1,1.23,1.2,0],[2.6,1.15,1.13,0],[3.2,.9,1.0,0]], tan, 10);
  const span = camel ? 4.65 : 5.35;
  const poly = [[-span,.9],[-span-.1,-.65],[-span+.3,-.9],[span-.3,-.9],[span+.1,-.65],[span,.9]];
  wing(group, poly, .13, fabric, 1.38, .6);
  wing(group, poly.map(([x,z])=>[x*.96,z]), .13, fabric, -.25, .3);
  for (const s of [-1,1]) {
    beam(group,[s*3.6,-.21,1.15],[s*3.6,1.38,1.37],.095,dark);
    beam(group,[s*3.6,-.21,-.23],[s*3.6,1.38,-.18],.095,dark);
    beam(group,[s*.48,.5,.9],[s*.9,1.38,1.18],.09,dark);
    beam(group,[s*.48,.5,-.1],[s*.9,1.38,-.1],.09,dark);
    beam(group,[s*1.0,1.32,1.2],[s*3.6,-.18,-.1],.022,mat('#9b9785'));
    roundel(group,s*(span-.95),1.46,.7,.5,palette.enemy);
  }
  wing(group,[[-1.7,.45],[-1.9,-.25],[-1.5,-.8],[1.5,-.8],[1.9,-.25],[1.7,.45]],.12,fabric,.1,-3.25);
  tailFin(group,1.25,1.15,red,0,.05,-3.1);
  cylinder(group,.58,.6,.72,mat(camel?'#596160':'#cf7744',.5,.25),[0,0,2.94]);
  cylinder(group,.37,.46,.3,dark,[0,0,3.44]);
  for (let i=0;i<7;i++) {
    const a=TAU*i/7;
    cylinder(group,.10,.13,.3,mat('#3a3d38',.7,.3),[Math.cos(a)*.37,Math.sin(a)*.37,3.59]);
  }
  propeller(group,0,0,3.82,1.43,mat('#705442'),data,2);
  ellipsoid(group,[.35,.08,.48],mat('#303e3d'),[0,.55,-.6]);
  ellipsoid(group,[.22,.23,.23],mat('#b79a72'),[0,.84,-.65],1);
  ellipsoid(group,[.19,.13,.22],mat('#573e30'),[0,.99,-.66],1);
  box(group,[.43,.36,.04],mat('#9ab8b8',.3,.2,{transparent:true,opacity:.55}),[0,.83,-.06],[-.23,0,0]);
  gear(group,[[-.95,1.1,.42],[.95,1.1,.42],[0,-3.3,.18]],data,true);
  beam(group,[-.95,-1.15,1.1],[.95,-1.15,1.1],.11,dark);
  if (camel) for (const s of [-1,1]) cylinder(group,.07,.09,1.45,mat('#343b3b'),[s*.22,.62,1.55]);
  data.span = span*2; data.length = 8;
}

function propFighter(group, kind, palette, data) {
  const spit = kind === 'spitfire', bf109 = kind === 'bf109';
  const body=mat(palette.body), wings=mat(palette.wing), dark=mat('#344345'), trim=mat(palette.accent);
  loft(group,[[-4.8,.15,.25,.2],[-3.1,.6,.8,.25],[-.6,1.4,1.4,.15],[2.4,1.6,1.5,.05],[3.6,1.25,1.25,.02],[4.35,.62,.7,.03]],body,12);
  const poly=spit?[[-.6,1.8],[-2.5,1.45],[-4.7,.7],[-5.6,-.12],[-5.7,-.55],[-4.9,-1.15],[-3.1,-1.4],[0,-1.5],[3.1,-1.4],[4.9,-1.15],[5.7,-.55],[5.6,-.12],[4.7,.7],[2.5,1.45],[.6,1.8]]:bf109?[[-.6,1.4],[-4.8,.3],[-5,-.9],[-4.6,-1.4],[0,-1.1],[4.6,-1.4],[5,-.9],[4.8,.3],[.6,1.4]]:[[-.7,1.3],[-5.7,.5],[-6.1,-1.6],[-5.7,-1.95],[0,-1.3],[5.7,-1.95],[6.1,-1.6],[5.7,.5],[.7,1.3]];
  wing(group,poly,.22,wings,-.34,.1);
  wing(group,[[-.3,.9],[-2.0,.1],[-2.15,-.9],[0,-.6],[2.15,-.9],[2.0,.1],[.3,.9]],.15,wings,.27,-3.8);
  tailFin(group,1.7,1.7,trim,0,.2,-3.65);
  cockpit(group,0,1.0,-.7,[.53,.49,1.15],mat('#507476',.28,.25,{transparent:true,opacity:.8}));
  for(const s of [-1,1]) {
    roundel(group,s*4.2,-.205,.0,.57,palette.enemy);
    for(let i=0;i<2;i++) cylinder(group,.055,.055,.8,dark,[s*(2.5+i*.45),-.28,1.1]);
    if(spit) box(group,[.45,.35,1.15],dark,[s*2.2,-.63,-.15]);
  }
  cylinder(group,.5,.65,.5,trim,[0,.03,4.3]);
  propeller(group,0,.03,4.62,1.55,mat('#343c37'),data,spit||bf109?3:4);
  gear(group,[[-1.6,.25,.43],[1.6,.25,.43],[0,-3.9,.22]],data);
  data.span=spit?11.4:bf109?10:12.2;data.length=9.5;
}

function multiEngine(group, kind, palette, data) {
  const bomber=kind==='b17';
  const body=mat(palette.body),wingmat=mat(palette.wing),metal=mat('#89958c',.5,.4),dark=mat('#343e3d');
  const len=bomber?11.4:10.0,span=bomber?15.7:14.4;
  loft(group,[[-len,.25,.45,.2],[-len*.7,1.0,1.3,.4],[-2,2.4,2.7,.2],[4.4,2.5,2.6,.15],[len*.75,2.0,2.0,.1],[len,1.0,1.25,.0]],body,12);
  wing(group,[[-.5,3.6],[-span,.0],[-span,-1.5],[-3.0,-2.6],[3.0,-2.6],[span,-1.5],[span,.0],[.5,3.6]],.33,wingmat,-.2,.6);
  wing(group,[[-.5,1.1],[-5.6,-1],[-5.2,-2.6],[0,-1.8],[5.2,-2.6],[5.6,-1],[.5,1.1]],.2,wingmat,.6,-len*.76);
  tailFin(group,3.4,3.6,mat(palette.accent),0,.4,-len*.71);
  cockpit(group,0,1.15,len*.64,[1.03,.78,1.75],mat('#47646a',.25,.25));
  const engines=bomber?[-10.3,-5.2,5.2,10.3]:[-4.7,4.7];
  for(const x of engines){
    const z=3.3-Math.abs(x)*.12;
    cylinder(group,.8,.7,2.8,metal,[x,-.12,z]);
    cylinder(group,.69,.8,.9,dark,[x,-.12,z+1.5]);
    propeller(group,x,-.12,z+2.0,bomber?1.9:2.05,mat('#2f3836'),data,3);
  }
  if(bomber){
    ellipsoid(group,[.75,.68,.85],mat('#44666d',.3,.3),[0,1.65,1.25]);
    cylinder(group,.06,.06,2.0,dark,[0,1.92,2.0]);
    ellipsoid(group,[.73,.75,1.2],mat('#6b8a86',.3,.2,{transparent:true,opacity:.7}),[0,.0,len]);
  } else if(kind==='he111')ellipsoid(group,[.94,.94,1.65],mat('#6b8a86',.3,.2,{transparent:true,opacity:.78}),[0,.08,len]);
  else for(let i=0;i<7;i++) for(const s of[-1,1]) box(group,[.03,.43,.58],mat('#425b5c'),[s*1.22,.5,3.2-i*1.3]);
  for(const s of[-1,1]) roundel(group,s*11.8,.01,-.6,.9,palette.enemy);
  gear(group,[[-4.7,1.4,.72],[4.7,1.4,.72],[0,-len*.82,.32]],data);
  data.span=span*2; data.length=len*2;
}

function jet(group, kind, palette, data) {
  const body=mat(palette.body,.65,.18),wingmat=mat(palette.wing,.68,.15),dark=mat('#303e45',.65,.2),trim=mat(palette.accent,.6,.2);
  const stealth=kind==='f22',mig=kind==='mig21',small=kind==='f16'||mig,harrier=kind==='harrier',f4=kind==='f4';
  const half=harrier?6.6:small?7.8:f4?9.3:9.4;
  loft(group,[[-half,stealth?2.6:1.55,1.2,.0],[-half*.5,2.2,1.85,0],[0,2.4,2.0,.0],[half*.49,1.55,1.6,.03],[half*.84,.75,.8,.03],[half,0.04,.06,.05]],body,stealth?6:10);
  const span=harrier?4.0:small?5.2:f4?6.2:stealth?6.9:6.7;
  const shape=harrier?[[-.7,2.4],[-span,.7],[-span,-1.5],[-1.0,-1.0],[1.0,-1.0],[span,-1.5],[span,.7],[.7,2.4]]:stealth?[[-1.0,4.1],[-span,-1.4],[-span,-3.3],[-1.1,-3.2],[1.1,-3.2],[span,-3.3],[span,-1.4],[1.0,4.1]]:mig?[[-.7,3.2],[-4.2,-2.8],[4.2,-2.8],[.7,3.2]]:[[-1.0,2.5],[-span,-1.6],[-span,-2.9],[-1.0,-2.4],[1.0,-2.4],[span,-2.9],[span,-1.6],[1.0,2.5]];
  wing(group,shape,.15,wingmat,harrier?.6:-.1,.2);
  wing(group,[[-.8,.8],[-3.8,-1.1],[-3.6,-2.7],[-.6,-1.9],[.6,-1.9],[3.6,-2.7],[3.8,-1.1],[.8,.8]],.15,wingmat,.1,-half*.68);
  if(stealth||kind==='f15') for(const s of[-1,1]) {const fin=tailFin(group,3.1,3.2,trim,s*1.4,.2,-half*.55);fin.rotation.y=s*.14;fin.rotation.z=Math.PI/2-s*.18;}
  else tailFin(group,harrier?2.4:3.0,harrier?2.7:3.3,trim,0,.1,-half*.56);
  cockpit(group,0,1.08,half*.39,[.65,.64,f4?2.1:1.55],mat('#375c68',.2,.35,{transparent:true,opacity:.9}));
  if(f4) box(group,[1.3,.12,.16],dark,[0,1.6,half*.34]);
  for(const s of[-1,1]){
    if(!small){box(group,[.75,.9,2.0],dark,[s*1.2,-.2,1.4]);box(group,[.78,.17,2.2],body,[s*1.2,.3,1.5]);}
    const tipx=s*(span-.35);
    if(!stealth){
      cylinder(group,.13,.17,2.4,mat('#e5e4d8'),[tipx,-.27,-.65]);
      wing(group,[[tipx-.35,-1.35],[tipx+.35,-1.35],[tipx+.35,-1.7],[tipx-.35,-1.7]],.05,dark,-.27);
      for(let n=0;n<2;n++){box(group,[.12,.55,.8],dark,[s*(2.2+n*.9),-.45,-.3]);cylinder(group,.19,.25,2.2,mat('#bcc3bc'),[s*(2.2+n*.9),-.9,-.2]);}
    }
    mesh(group,new THREE.SphereGeometry(.12,5,4),mat(s<0?'#d45b37':'#83c5a6',.5,0,{emissive:s<0?'#c44a24':'#51a980',emissiveIntensity:1.0}),tipx,.01,-1.6);
  }
  if(small){if(mig){cylinder(group,.49,.55,.3,dark,[0,.05,half*.86]);cylinder(group,.14,.4,.9,body,[0,.05,half*.94]);}else box(group,[1.2,.85,1.6],dark,[0,-.93,2.5]);exhaust(group,0,.0,-half*.96,.62,data);}
  else if(harrier){
    for(const s of[-1,1]) for(const z of[-1.0,1.7]){cylinder(group,.28,.32,.6,dark,[s*1.25,-.4,z],[0,0,Math.PI/2]);}
    exhaust(group,0,-.1,-half*.92,.43,data);
  } else for(const s of[-1,1]) exhaust(group,s*.76,-.1,-half*.93,stealth?.46:.55,data);
  gear(group,[[-1.1,-.9,.38],[1.1,-.9,.38],[0,half*.45,.29]],data);
  data.span=span*2;data.length=half*2;
}

function a10(group,palette,data){
  const body=mat(palette.body),wingmat=mat(palette.wing),dark=mat('#303f42'),trim=mat(palette.accent);
  loft(group,[[-7.4,.3,.6,.2],[-4.3,1.25,1.4,.1],[.5,1.6,1.8,0],[5.5,1.4,1.5,.0],[7.7,.65,.8,-.15]],body,10);
  wing(group,[[-.6,1.9],[-8.6,1.3],[-8.8,-1.2],[-1,-1.5],[1,-1.5],[8.8,-1.2],[8.6,1.3],[.6,1.9]],.22,wingmat,-.4,.0);
  wing(group,[[-.3,1],[-3.1,.1],[-3.1,-1.3],[3.1,-1.3],[3.1,.1],[.3,1]],.17,wingmat,.15,-6.1);
  for(const s of[-1,1]){
    cylinder(group,1.03,1.03,3.35,body,[s*1.8,1.0,-3.2]);
    cylinder(group,.82,.95,.18,dark,[s*1.8,1.0,-1.45]);
    cylinder(group,.3,.3,.2,mat('#8d9995',.45,.5),[s*1.8,1,-1.32]);
    tailFin(group,1.75,2.3,trim,s*2.4,.1,-5.7);
    for(let i=0;i<3;i++){const x=s*(2.6+i*1.65);box(group,[.13,.4,1.0],dark,[x,-.72,.05]);cylinder(group,.22,.23,2.2,mat('#d2d6c8'),[x,-1.05,.1]);}
  }
  cockpit(group,0,1.15,3.5,[.65,.62,1.55],mat('#456973',.25,.3));
  cylinder(group,.2,.23,1.25,dark,[-.16,-.25,7.6]);
  for(let i=0;i<7;i++){const a=TAU*i/7;cylinder(group,.035,.035,.12,mat('#a1a7a0'),[-.16+Math.sin(a)*.11,-.25+Math.cos(a)*.11,8.27]);}
  gear(group,[[-2.5,.5,.46],[2.5,.5,.46],[0,5,.32]],data);
  data.span=17.6;data.length=16.6;
}

function b2(group,palette,data){
  const body=mat(palette.body||'#454f55',.75,.2),dark=mat('#29363d');
  const poly=[[0,8.7],[-26.2,-4.2],[-19.2,-6.0],[-14.0,-3.8],[-9.0,-6.2],[-4.0,-3.9],[0,-6.1],[4.0,-3.9],[9.0,-6.2],[14.0,-3.8],[19.2,-6.0],[26.2,-4.2]];
  wing(group,poly,.45,body,0,0);
  loft(group,[[-6.0,2.2,.55,.35],[-2.2,9.8,1.4,.5],[3.5,6.7,2.0,.48],[8.7,.1,.2,.02]],body,8);
  for(const s of[-1,1]){
    box(group,[2.3,.13,2.3],dark,[s*3.3,1.27,.8],[-.15,0,0]);
    box(group,[3.4,.1,1.6],dark,[s*3.5,.85,-3.8]);
  }
  wing(group,[[-1.15,.6],[-.75,1.45],[.75,1.45],[1.15,.6],[.8,-.2],[-.8,-.2]],.05,mat('#56717b',.18,.4),1.17,4.0);
  gear(group,[[-3.2,-1.0,.7],[3.2,-1.0,.7],[0,4.9,.45]],data);
  data.span=52.4;data.length=15;
}

function mergedStatic(group) {
  // Aircraft are made from many simple shapes, but issued in a handful of draws.
  const buckets=new Map(),remove=[];
  group.updateMatrixWorld(true);
  group.traverse(o=>{
    if(!o.isMesh||Array.isArray(o.material))return;
    let p=o;while(p&&p!==group){if(p.userData.animated)return;p=p.parent;}
    const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    if(!g.attributes.normal)g.computeVertexNormals();
    const key=o.material.uuid;
    if(!buckets.has(key))buckets.set(key,{material:o.material,parts:[]});
    buckets.get(key).parts.push(g);remove.push(o);
  });
  for(const o of remove){o.removeFromParent();o.geometry.dispose();}
  for(const {material,parts} of buckets.values()){
    let count=0;for(const g of parts)count+=g.attributes.position.count;
    const position=new Float32Array(count*3),normal=new Float32Array(count*3),uv=new Float32Array(count*2);
    let offset=0;
    for(const g of parts){position.set(g.attributes.position.array,offset*3);normal.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,offset*2);offset+=g.attributes.position.count;g.dispose();}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeBoundingSphere();
    mesh(group,geometry,material);
  }
}

export function aircraftKind(profile) {
  const value=String(typeof profile==='string'?profile:(profile?.model||profile?.id||profile?.name||'avro504')).toLowerCase().replace(/[^a-z0-9]/g,'');
  if(/b2|spirit/.test(value))return'b2';
  if(/a10|thunderbolt|warthog/.test(value))return'a10';
  if(/f22|raptor/.test(value))return'f22';
  if(/f16|falcon/.test(value))return'f16';
  if(/f15|eagle/.test(value))return'f15';
  if(/harrier/.test(value))return'harrier';
  if(/mig/.test(value))return'mig21';
  if(/f4|phantom|jet/.test(value))return'f4';
  if(/he111|heinkel|junkers|ju88/.test(value))return'he111';
  if(/b17|bomber|lancaster/.test(value))return'b17';
  if(/c47|dakota|transport/.test(value))return'c47';
  if(/bf109|messerschmitt/.test(value))return'bf109';
  if(/spitfire/.test(value))return'spitfire';
  if(/hellcat|corsair|zero|wildcat|pacific/.test(value))return'hellcat';
  if(/camel|fokker|albatros|armed/.test(value))return'camel';
  return'avro504';
}

export function makeAircraft(profile='avro504', faction='player') {
  const kind=aircraftKind(profile),enemy=faction==='enemy';
  const p=typeof profile==='object'?profile:{};
  const defaults={avro504:['#b4763e','#ddc898','#b25739'],camel:['#69745a','#9a9b73','#bf6b42'],spitfire:['#607769','#798673','#b5b697'],hellcat:['#365b70','#486e80','#b3c5bf'],b17:['#7a8b75','#96a28a','#9caa90'],c47:['#78826c','#8f9984','#ebe4c5'],f4:['#89958c','#a4aea2','#657a73'],harrier:['#687c80','#849593','#b0bbb0'],a10:['#889489','#a8b2a1','#677e73'],f15:['#9aa9ae','#b3bec0','#748d94'],f16:['#879a9f','#aebbbd','#617b86'],f22:['#87959c','#b7bfc1','#637982'],b2:['#485961','#60707a','#40515b']};
  const colors=defaults[kind]||defaults.f4;
  const palette={body:enemy?'#806f60':(p.color||colors[0]),wing:enemy?'#92846e':colors[1],accent:enemy?'#a95439':(p.accent||colors[2]),enemy};
  const key=JSON.stringify([kind,palette]);
  if(!prototypes.has(key)){
    const group=new THREE.Group();const data={kind,propellers:[],exhausts:[],gear:null,fixedGear:false,span:10,length:8};
    if(kind==='avro504'||kind==='camel')biplane(group,kind,palette,data);
    else if(kind==='spitfire'||kind==='hellcat'||kind==='bf109')propFighter(group,kind,palette,data);
    else if(kind==='b17'||kind==='c47'||kind==='he111')multiEngine(group,kind,palette,data);
    else if(kind==='a10')a10(group,palette,data);
    else if(kind==='b2')b2(group,palette,data);
    else jet(group,kind,palette,data);
    data.propellers.forEach((o,i)=>o.name='prop-'+i);data.exhausts.forEach((o,i)=>o.name='exhaust-'+i);
    mergedStatic(group);
    group.userData={kind,span:data.span,length:data.length,fixedGear:data.fixedGear};
    prototypes.set(key,group);
  }
  const result=prototypes.get(key).clone(true);
  result.userData={...result.userData,propellers:[],exhausts:[],gear:null};
  result.traverse(o=>{if(o.name.startsWith('prop-')&&o.isGroup)result.userData.propellers.push(o);if(o.name.startsWith('exhaust-'))result.userData.exhausts.push(o);if(o.name==='gear')result.userData.gear=o;});
  return result;
}

export function animateAircraft(plane, pose, dt, time=0) {
  if(!plane)return;
  const data=plane.userData,throttle=Number.isFinite(pose?.throttle)?pose.throttle:.65,engine=pose?.engine!==false;
  for(const p of data.propellers||[]){p.rotation.z+=(engine?(26+throttle*78):0)*dt;const disc=p.getObjectByName('prop-disc');if(disc)disc.visible=engine;}
  if(data.gear)data.gear.visible=data.fixedGear||pose?.gear!==false;
  for(const e of data.exhausts||[]){e.visible=engine&&throttle>.16;e.scale.set(1,Math.max(.2,throttle*(.85+Math.sin(time*37)*.06)),1);}
}

export function setAircraftPose(plane,pose) {
  plane.position.set(pose.x||0,pose.y||0,pose.z||0);
  const q=orientationOf(pose);plane.quaternion.set(q.x,q.y,q.z,q.w);
}

export function disposeModelCache(){
  const geometries=new Set();for(const g of prototypes.values())g.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const g of geometries)g.dispose();
  for(const m of sharedMaterials.values())m.dispose();prototypes.clear();sharedMaterials.clear();
}
