// Shared island geometry. Server collision and client scenery use the same source.
export const WORLD_RADIUS = 128;
export const WORLD_SEED = 824173;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function seededRandom(seed = WORLD_SEED) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const gaussian = (x, z, cx, cz, r) => Math.exp(-((x-cx)**2+(z-cz)**2)/(r*r));
export const LANDMARKS = [
  {id:'marigold',name:'MARIGOLD',x:0,z:-8,radius:33,kind:'town',color:'#f6b87b'},
  {id:'beacon',name:'BEACON POINT',x:-83,z:-53,radius:20,kind:'lighthouse',color:'#f2d18e'},
  {id:'relay',name:'SKYLINE RELAY',x:57,z:-66,radius:22,kind:'radar',color:'#bebfe5'},
  {id:'harbor',name:'COPPER DOCKS',x:72,z:50,radius:29,kind:'harbor',color:'#f39b75'},
  {id:'grove',name:'FERNWOOD',x:-60,z:54,radius:32,kind:'forest',color:'#b8d97a'},
];
const plateaus = [
  {x:0,z:-8,inner:25,outer:43,y:4.5},
  {x:-83,z:-53,inner:12,outer:25,y:14},
  {x:57,z:-66,inner:14,outer:29,y:22},
  {x:72,z:50,inner:22,outer:36,y:3.1},
  {x:-60,z:54,inner:10,outer:21,y:6},
];
export function terrainHeight(x, z) {
  const angle = Math.atan2(z,x);
  const shore = 128 + 8*Math.sin(angle*3+.9) + 4*Math.cos(angle*7);
  const radial = Math.hypot(x,z*1.04);
  const land = smooth((shore - radial)/18);
  let h = -5 + land*(9 + 1.3*Math.sin(x*.057)*Math.cos(z*.061) + 1.1*Math.sin((x+z)*.032)
    + 22*gaussian(x,z,57,-66,31) + 11*gaussian(x,z,-83,-53,27)
    + 7*gaussian(x,z,-56,59,39) + 7*gaussian(x,z,12,73,28));
  for (const p of plateaus) {
    const weight = 1-smooth((Math.hypot(x-p.x,z-p.z)-p.inner)/(p.outer-p.inner));
    h += (p.y-h)*weight;
  }
  return h;
}
export const BUILDINGS = [
  {id:'casa-1',x:-15,z:-28,w:10,d:9,h:5,yaw:0,color:0xeac891,roof:0xbb6845,kind:'house'},
  {id:'casa-2',x:14,z:-27,w:9,d:10,h:6.3,yaw:0,color:0xe58e6f,roof:0x6b8990,kind:'house'},
  {id:'casa-3',x:-17,z:-6,w:10,d:9,h:5.2,yaw:Math.PI/2,color:0x83b9af,roof:0xc8824b,kind:'house'},
  {id:'casa-4',x:16,z:-5,w:11,d:9,h:5.3,yaw:-Math.PI/2,color:0xf2d8a0,roof:0xa35746,kind:'cafe'},
  {id:'casa-5',x:-16,z:16,w:10,d:8,h:5.8,yaw:Math.PI,color:0xe4a276,roof:0x5c8c91,kind:'house'},
  {id:'casa-6',x:16,z:16,w:10,d:9,h:4.8,yaw:Math.PI,color:0xb4c99b,roof:0xb86c52,kind:'house'},
  {id:'lookout-house',x:-77,z:-39,w:9,d:8,h:4.5,yaw:.15,color:0xf0ddbb,roof:0x9a5951,kind:'house'},
  {id:'relay-house',x:49,z:-65,w:9,d:10,h:4.6,yaw:0,color:0xbdc7c4,roof:0x4c6b7a,kind:'utility'},
  {id:'dock-office',x:61,z:37,w:10,d:9,h:5,yaw:0,color:0xdba17b,roof:0x426f79,kind:'cafe'},
  {id:'boathouse',x:80,z:65,w:16,d:10,h:6.2,yaw:Math.PI/2,color:0x97ada6,roof:0x507a8a,kind:'warehouse'},
  {id:'grove-cabin',x:-64,z:55,w:10,d:8,h:4.8,yaw:.2,color:0xb57d52,roof:0x557c68,kind:'cabin'},
  {id:'hill-cabin',x:7,z:71,w:9,d:8,h:4.5,yaw:-.3,color:0xe1bd88,roof:0xa66b53,kind:'cabin'},
];
export const buildingBase = b => terrainHeight(b.x,b.z);
// Road polylines are shared with the minimap and ground mesh decoration.
export const ROADS = [
  {width:7,points:[[-4,34],[0,16],[0,-9],[0,-35],[-15,-46],[-42,-48],[-63,-49],[-82,-53]]},
  {width:6,points:[[0,-8],[25,-9],[38,-28],[46,-49],[57,-66]]},
  {width:6,points:[[0,13],[26,17],[43,29],[58,45],[78,50],[92,56]]},
  {width:4,points:[[-4,34],[-23,46],[-45,49],[-60,55],[-77,71]]},
  {width:4,points:[[-4,34],[2,51],[9,70],[30,81],[56,76],[73,64]]},
];
function roadDistance(x,z) {
  let best=1e6;
  for(const road of ROADS) for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)-road.width*.5);
  }
  return best;
}
export const distanceToRoad = roadDistance;
export const PROPS = [];
const prop=(id,kind,x,z,w,d,h,yaw=0,color=0x907c62)=>{
  const p={id,kind,x,z,y:terrainHeight(x,z),w,d,h,yaw,color};PROPS.push(p);return p;
};
// Harbor lanes between stacks stay wide enough to maneuver.
for(let row=0;row<3;row++) for(let col=0;col<2;col++) {
  prop(`container-${row}-${col}`,'container',69+col*15,38+row*8,10,3.4,3.1,0,[0xd27742,0x426c7b,0x719784,0x9a6263,0xc9af6c,0x577e86][row*2+col]);
}
prop('port-crane','crane',98,47,4,4,21,0,0xd6a24a);
prop('port-crane-2','crane',100,68,4,4,17,-.25,0xa7c8be);
prop('beacon-tower','lighthouse',-88,-58,6.3,6.3,23,0,0xf3ead6);
prop('relay-tower','radio',63,-72,4.5,4.5,22,0,0xa7b6ba);
prop('town-fountain','fountain',0,-9,4,4,1.1,0,0xdfd2b2);
prop('town-truck','truck',-8,31,2.8,5.8,2.6,-.25,0xe7b854);
prop('harbor-truck','truck',53,58,2.8,5.8,2.6,1.4,0x639f9f);
prop('town-car','car',8,-42,2.4,4.5,1.5,.2,0xce7960);
prop('beacon-car','car',-67,-59,2.4,4.5,1.5,1.3,0x8db8b2);
prop('camp-van','truck',-48,68,2.8,5.8,2.7,-.4,0xc3c596);
for(const [i,x,z] of [[0,32,14],[1,-31,24],[2,-7,-54],[3,43,46],[4,44,-54],[5,-72,46],[6,13,62],[7,-76,-64],[8,84,72]]) {
  prop(`supply-stack-${i}`,'crate',x,z,2.2,2.2,1.6,i*.7,0xb68a55);
  if(i%2===0)prop(`barrel-${i}`,'barrel',x+3,z+1,1,1,1.4,0,0x688b89);
}
for(const b of BUILDINGS) {
  prop(`${b.id}-planter`,'planter',b.x-b.w*.6,b.z+1,1.8,1.8,.9,0,0xbc8063);
}
export const PADS = [
  {id:'jump-town',x:0,z:30,y:terrainHeight(0,30)},
  {id:'jump-port',x:50,z:50,y:terrainHeight(50,50)},
  {id:'jump-grove',x:-44,z:55,y:terrainHeight(-44,55)},
  {id:'jump-relay',x:46,z:-44,y:terrainHeight(46,-44)},
];
export const TREES = [], ROCKS = [];
const random=seededRandom();
function vacant(x,z,margin=3) {
  if(terrainHeight(x,z)<2.3||roadDistance(x,z)<margin)return false;
  for(const b of BUILDINGS) if(Math.hypot(x-b.x,z-b.z)<Math.max(b.w,b.d)*.75+margin)return false;
  for(const p of PROPS)if(Math.hypot(x-p.x,z-p.z)<Math.max(p.w,p.d)*.6+margin)return false;
  return true;
}
for(let attempt=0;attempt<4000&&TREES.length<210;attempt++) {
  const x=(random()-.5)*246,z=(random()-.5)*242;
  if(!vacant(x,z,4)||Math.hypot(x,z*1.04)>118)continue;
  if(Math.hypot(x-72,z-50)<32||Math.hypot(x,z+8)<35||Math.hypot(x-57,z+66)<17)continue;
  const grove=Math.hypot(x+60,z-54)<38;
  if(!grove&&random()<.58)continue;
  if(TREES.some(t=>Math.hypot(x-t.x,z-t.z)<3.8))continue;
  TREES.push({id:`tree-${TREES.length}`,x,z,size:grove?7+random()*5:5.5+random()*5,kind:z<-30?'pine':random()<.35?'pine':'broadleaf',tone:random()});
}
for(let attempt=0;attempt<1000&&ROCKS.length<55;attempt++) {
  const x=(random()-.5)*245,z=(random()-.5)*242;
  if(!vacant(x,z,3)||TREES.some(t=>Math.hypot(x-t.x,z-t.z)<2.5))continue;
  ROCKS.push({id:`rock-${ROCKS.length}`,x,z,size:1.3+random()*2.5,yaw:random()*Math.PI});
}
export const COLLIDERS = [];
function collider(id,x,z,y,w,d,h,yaw=0,kind='solid'){ COLLIDERS.push({id,x,z,y,w,d,h,yaw,kind}); }
function buildingPart(b,suffix,lx,lz,y,w,d,h,kind='wall') {
  const c=Math.cos(b.yaw),s=Math.sin(b.yaw);
  collider(`${b.id}-${suffix}`,b.x+lx*c+lz*s,b.z-lx*s+lz*c,buildingBase(b)+y,w,d,h,b.yaw,kind);
}
for(const b of BUILDINGS) {
  const t=.34,door=2.3,side=(b.w-door)/2;
  buildingPart(b,'back',0,-b.d/2,0,b.w,t,b.h);
  buildingPart(b,'left',-b.w/2,0,0,t,b.d,b.h);
  buildingPart(b,'right',b.w/2,0,0,t,b.d,b.h);
  buildingPart(b,'front-left',-(b.w+door)/4,b.d/2,0,side,t,b.h);
  buildingPart(b,'front-right',(b.w+door)/4,b.d/2,0,side,t,b.h);
  buildingPart(b,'lintel',0,b.d/2,2.65,door,t,b.h-2.65);
  buildingPart(b,'roof',0,0,b.h,b.w+.35,b.d+.35,.25,'roof');
  buildingPart(b,'floor',0,0,-.1,b.w,b.d,.1,'floor');
}
for(const p of PROPS) {
  if(['container','crate','truck','car','barrel','fountain','planter'].includes(p.kind)) collider(p.id,p.x,p.z,p.y,p.w,p.d,p.h,p.yaw,p.kind);
  else if(p.kind==='lighthouse')collider(p.id,p.x,p.z,p.y,5.7,5.7,p.h,0,p.kind);
  else if(p.kind==='crane'||p.kind==='radio')collider(p.id,p.x,p.z,p.y,1.3,1.3,p.h,0,p.kind);
}
for(const t of TREES)collider(t.id,t.x,t.z,terrainHeight(t.x,t.z),.64,.64,t.size*.52,0,'tree');
for(const r of ROCKS)collider(r.id,r.x,r.z,terrainHeight(r.x,r.z),r.size*1.4,r.size*1.2,r.size*.8,r.yaw,'rock');
export const SPAWNS = [
  {x:-4,z:22},{x:26,z:-27},{x:-32,z:-22},{x:-79,z:-29},{x:46,z:-58},
  {x:52,z:41},{x:84,z:57},{x:-51,z:49},{x:-75,z:72},{x:19,z:70},
];
export const LOOT_SPAWNS = [];
function loot(x,z,kind,weapon,rarity=0,y) {
  LOOT_SPAWNS.push({id:`loot-${LOOT_SPAWNS.length}`,x,z,y:y??terrainHeight(x,z)+.2,kind,...(weapon===undefined?{}:{weapon}),rarity});
}
BUILDINGS.forEach((b,i)=>{
  loot(b.x,b.z,'weapon',i%4,1+(i%3===0?1:0));
  loot(b.x+1.5,b.z-1.4,i%2?'shield':'medkit');
  loot(b.x-1.5,b.z-1.4,'ammo');
  if(i%2===0)loot(b.x,b.z,'chest',undefined,2,buildingBase(b)+b.h+.45);
});
for(let i=0;i<SPAWNS.length;i++){
  const s=SPAWNS[i];loot(s.x+1.8,s.z,'weapon',(i+1)%4,1);
  loot(s.x-2,s.z,'shield');loot(s.x,s.z+2.5,'materials');
}
for(const p of PROPS.filter(p=>p.kind==='crate')){
  loot(p.x+3.1,p.z-1.5,'chest',undefined,p.x>40?2:1);
}
for(const [x,z] of [[-20,38],[25,38],[-40,-40],[24,-54],[-42,4],[30,66],[-89,1],[87,3],[0,90]]) {
  loot(x,z,'weapon',Math.floor(random()*4),Math.floor(random()*3));
  loot(x+2,z+2,'ammo');
}
