import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const sharedMaterials = new Map();

export function mat(color, roughness = 0.82, metalness = 0.05, extra = {}) {
  const key = JSON.stringify([color, roughness, metalness, extra]);
  if (!sharedMaterials.has(key)) sharedMaterials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: false, dithering: true, ...extra }));
  return sharedMaterials.get(key);
}

export function mesh(group, geometry, material, x = 0, y = 0, z = 0, rotation) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (rotation) m.rotation.set(...rotation);
  group.add(m);
  return m;
}

export function box(group, dims, material, pos = [0, 0, 0], rotation) {
  return mesh(group, new THREE.BoxGeometry(...dims), material, ...pos, rotation);
}

export function ellipsoid(group, dims, material, pos = [0, 0, 0], detail = 1) {
  const m = mesh(group, new THREE.SphereGeometry(1, detail>1?24:16, detail>1?14:10), material, ...pos);
  m.scale.set(...dims);
  return m;
}

export function cylinder(group, top, bottom, height, material, pos, rotation = [Math.PI / 2, 0, 0], sides = 10) {
  return mesh(group, new THREE.CylinderGeometry(top, bottom, height, sides), material, ...pos, rotation);
}

export function beam(group, a, b, width, material) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const m = box(group, [width, d.length(), width], material);
  m.position.copy(va.add(vb).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function loft(group, stations, material, sides = 24) {
  const points=[],indices=[],uv=[],ringSize=sides+1;
  const zMin=stations[0][0],zRange=Math.max(.001,stations.at(-1)[0]-zMin);
  for(const [z,width,height,cy=0,cx=0]of stations){
    for(let i=0;i<=sides;i++){
      const theta=TAU*i/sides;
      points.push(Math.cos(theta)*width*.5+cx,Math.sin(theta)*height*.5+cy,z);
      uv.push(i/sides,(z-zMin)/zRange);
    }
  }
  for(let row=0;row<stations.length-1;row++)for(let col=0;col<sides;col++){
    const a=row*ringSize+col,b=a+1,c=a+ringSize,d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  // End-cap vertices are separate so flat caps cannot crease a curved skin.
  for(const end of [0,stations.length-1]){
    const [z,width,height,cy=0,cx=0]=stations[end],start=points.length/3;
    points.push(cx,cy,z);uv.push(.5,.5);
    for(let i=0;i<sides;i++){const theta=TAU*i/sides;points.push(Math.cos(theta)*width*.5+cx,Math.sin(theta)*height*.5+cy,z);uv.push(.5+Math.cos(theta)*.5,.5+Math.sin(theta)*.5);}
    for(let i=0;i<sides;i++){const a=start+1+i,b=start+1+(i+1)%sides;indices.push(...(end===0?[start,b,a]:[start,a,b]));}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  for(let row=0;row<stations.length;row++){
    const a=row*ringSize,b=a+sides,n=new THREE.Vector3(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
  return mesh(group,geometry,material);
}

// Sample a curved airfoil through the complete planform. Leading/trailing
// edges are thin, the upper skin is cambered, and tips taper with the chord.
export function wing(group,polygon,thickness,material,y=0,z=0){
  const baseX=[...new Set(polygon.map(p=>p[0]))].sort((a,b)=>a-b),xs=[];
  for(let i=0;i<baseX.length-1;i++)for(let j=0;j<3;j++)xs.push(baseX[i]+(baseX[i+1]-baseX[i])*j/3);
  xs.push(baseX.at(-1));
  function chordAt(x){const values=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if(Math.abs(a[0]-b[0])<1e-8){if(Math.abs(x-a[0])<1e-7)values.push(a[1],b[1]);continue;}if(x>=Math.min(a[0],b[0])-1e-7&&x<=Math.max(a[0],b[0])+1e-7)values.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}return[Math.min(...values),Math.max(...values)];}
  const chords=xs.map(chordAt),maxChord=Math.max(...chords.map(v=>v[1]-v[0]),.01);
  const ts=[0,.035,.09,.17,.28,.42,.58,.74,.88,1],loop=[...ts.map(t=>[t,1]),...ts.slice(1,-1).reverse().map(t=>[t,-1])];
  const points=[],uv=[],indices=[],count=loop.length;
  for(let i=0;i<xs.length;i++){
    const[trailing,leading]=chords[i],chord=leading-trailing,scale=Math.sqrt(Math.max(.035,chord/maxChord));
    for(const[t,side]of loop){const profile=(.2969*Math.sqrt(t)-.126*t-.3516*t*t+.2843*t*t*t-.1036*t*t*t*t)/.10003;
      points.push(xs[i],side*Math.max(0,profile)*thickness*.5*scale+Math.sin(Math.PI*t)*thickness*.07,leading-t*chord);
      uv.push((xs[i]-baseX[0])/Math.max(.001,baseX.at(-1)-baseX[0]),t);
    }
  }
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<count;j++){const a=i*count+j,b=i*count+(j+1)%count,c=a+count,d=b+count;indices.push(a,c,b,b,c,d);}
  for(const end of[0,xs.length-1])for(let j=1;j<count-1;j++){const a=end*count;indices.push(...(end===0?[a,a+j,a+j+1]:[a,a+j+1,a+j]));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return mesh(group,geometry,material,0,y,z);
}

export function tailFin(group, length, height, material, x = 0, y = 0, z = -3) {
  const f = wing(group, [[0, 0.7], [height, -0.2], [height * 0.85, -length * 0.72], [0, -length]], 0.15, material);
  f.rotation.z = Math.PI / 2;
  f.position.set(x, y, z);
  return f;
}

export function roundel(group, x, y, z, radius = 0.48, enemy = false) {
  const colors = enemy ? ['#e7dcc2', '#4b4741'] : ['#264659', '#efeee1', '#b84f36'];
  colors.forEach((c, i) => mesh(group, new THREE.CircleGeometry(radius * (1 - i * .28), 20), mat(c), x, y + i * .008, z, [-Math.PI / 2, 0, 0]));
}

export function propeller(group,x,y,z,size,material,data,blades=2){
  const prop=new THREE.Group();prop.position.set(x,y,z);prop.userData.animated=true;
  const shape=new THREE.Shape();shape.moveTo(-.07,.10);
  shape.quadraticCurveTo(-size*.15,size*.26,-size*.12,size*.64);
  shape.quadraticCurveTo(-size*.08,size*.98,.015,size);
  shape.quadraticCurveTo(size*.08,size*.96,size*.075,size*.72);
  shape.quadraticCurveTo(size*.10,size*.35,.075,.12);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:1,curveSegments:data.detail===false?3:5,steps:1});
  geometry.translate(0,0,-.0225);
  for(let i=0;i<blades;i++){const blade=mesh(prop,geometry.clone(),material);blade.rotation.z=TAU*i/blades;blade.name='prop-blade';}
  geometry.dispose();
  cylinder(prop,.15,.21,.24,mat('#aeb6b3',.35,.55),[0,0,.09],undefined,20);
  const disc=mesh(prop,new THREE.CircleGeometry(size,data.detail===false?20:32),mat('#b8b8aa',.5,0,{transparent:true,opacity:.065,side:THREE.DoubleSide,depthWrite:false}),0,0,.045);
  disc.name='prop-disc';disc.userData.animated=true;
  group.add(prop);data.propellers.push(prop);return prop;
}

export function gear(group,points,data,fixed=false){
  const g=new THREE.Group();g.userData.animated=true;g.name='gear';
  const metal=mat('#77858a',.36,.62),rubber=mat('#20272a',.93,.01),dark=mat('#34434a',.6,.3);
  for(const[x,z,size=.4,legHeight=1.35]of points){
    beam(g,[x*.75,-.1,z-.2],[x,-legHeight+size*.5,z],.10,metal);
    beam(g,[x*.45,-.25,z-.6],[x,-legHeight+.25,z],.055,dark);
    cylinder(g,size,size,.26,rubber,[x,-legHeight,z],[0,0,Math.PI/2],24);
    for(const side of[-1,1]){
      cylinder(g,size*.53,size*.53,.03,metal,[x+side*.145,-legHeight,z],[0,0,Math.PI/2],16);
      cylinder(g,size*.2,size*.2,.04,dark,[x+side*.166,-legHeight,z],[0,0,Math.PI/2],12);
    }
  }
  group.add(g);data.gear=g;data.fixedGear=fixed;
  return g;
}

export function exhaust(group, x, y, z, size, data) {
  cylinder(group, size, size * 1.03, .65, mat('#313b3e', .4, .6), [x, y, z]);
  const fire = mesh(group, new THREE.ConeGeometry(size * .82, 2.5, 9), mat('#ff9c46', .6, 0, { emissive: '#e45119', emissiveIntensity: 1.6, transparent: true, opacity: .65, depthWrite: false }), x, y, z - 1.35, [-Math.PI / 2, 0, 0]);
  fire.userData.animated = true; data.exhausts.push(fire);
}

export function cockpit(group,x,y,z,dims,material,options={}){
  const canopy=new THREE.Group();canopy.position.set(x,y,z);group.add(canopy);
  const geometry=new THREE.SphereGeometry(1,24,10,0,TAU,0,Math.PI/2);
  const shell=mesh(canopy,geometry,material);shell.scale.set(...dims);
  const frame=options.frame||mat('#53636a',.55,.28),width=options.width||.035;
  const hoops=options.hoops||[-.6,.55];
  for(const along of hoops){const radius=Math.sqrt(1-along*along);let previous=null;for(let i=0;i<=12;i++){const angle=Math.PI*i/12,p=[Math.cos(angle)*dims[0]*radius,Math.sin(angle)*dims[1]*radius,along*dims[2]];if(previous)beam(canopy,previous,p,width,frame);previous=p;}}
  for(const side of[-1,1]){let previous=null;for(let i=0;i<=16;i++){const angle=Math.PI*i/16,p=[Math.sin(angle)*dims[0]*side,0,Math.cos(angle)*dims[2]];if(previous)beam(canopy,previous,p,width,frame);previous=p;}}
  if(options.spine){let previous=null;for(let i=0;i<=12;i++){const angle=Math.PI*i/12,p=[0,Math.sin(angle)*dims[1],Math.cos(angle)*dims[2]];if(previous)beam(canopy,previous,p,width,frame);previous=p;}}
  if(options.seat!==false){const seat=mat('#253039',.9,.03);box(canopy,[dims[0]*.9,dims[1]*.65,dims[2]*.45],seat,[0,dims[1]*.2,-dims[2]*.25]);box(canopy,[dims[0]*.52,dims[1]*.28,dims[2]*.17],seat,[0,dims[1]*.55,-dims[2]*.43]);}
  return canopy;
}

export function ring(group,outer,inner,material,pos=[0,0,0],rotation=[0,0,0],segments=24){return mesh(group,new THREE.RingGeometry(inner,outer,segments),material,...pos,rotation);}

export function tube(group,outer,inner,length,material,pos=[0,0,0],rotation=[0,0,0],segments=24){const g=new THREE.Group();g.position.set(...pos);g.rotation.set(...rotation);group.add(g);mesh(g,new THREE.CylinderGeometry(outer,outer,length,segments,1,true),material,0,0,0,[Math.PI/2,0,0]);mesh(g,new THREE.CylinderGeometry(inner,inner,length,segments,1,true),mat('#17242b',.85,.1,{side:THREE.BackSide}),0,0,0,[Math.PI/2,0,0]);ring(g,outer,inner,material,[0,0,length/2]);ring(g,outer,inner,material,[0,0,-length/2],[0,Math.PI,0]);return g;}

export function disposeModelMaterials(){for(const material of sharedMaterials.values())material.dispose();sharedMaterials.clear();}
