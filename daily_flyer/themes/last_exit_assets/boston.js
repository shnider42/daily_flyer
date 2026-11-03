import {drawArchitecture} from './architecture.js';
// An original two-bank city: a connected, irregular street graph and one cable-stayed crossing.
// Map coordinates and all visible surfaces are shared with driving, walking and route planning.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const length=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
export const BOSTON_NODES={
 b_bridge:{x:-42,z:70},b_wharf:{x:42,z:76},b_east:{x:184,z:114},b_south:{x:114,z:200},b_square:{x:-24,z:168},b_corner:{x:-92,z:110},b_hill:{x:-166,z:170},b_west:{x:-190,z:70},b_quay:{x:-138,z:43},
 c_bridge:{x:42,z:-70},c_lock:{x:140,z:-46},c_east:{x:198,z:-96},c_tech:{x:126,z:-154},c_square:{x:20,z:-185},c_green:{x:-58,z:-125},c_west:{x:-147,z:-164},c_yard:{x:-198,z:-96},c_quay:{x:-100,z:-76}
};
function edge(id,from,to,controls=[],bridge=false){const a=BOSTON_NODES[from],b=BOSTON_NODES[to],c=controls.length===2?controls[0]:controls[0]||a,d=controls.length===2?controls[1]:controls[0]||b,approx=length(a,c)+length(c,d)+length(d,b),n=Math.max(2,Math.ceil(approx/5)),points=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;points.push({x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,z:u*u*u*a.z+3*u*u*t*c.z+3*u*t*t*d.z+t*t*t*b.z});}return{id,from,to,points,width:20,...(bridge?{bridge:true}:{})};}
export const BOSTON_EDGES=[
 edge('zakim','b_bridge','c_bridge',[],true),
 edge('b_approach','b_square','b_bridge',[{x:-8,z:132},{x:-31,z:106}]),
 edge('b_embankment','b_bridge','b_wharf',[{x:-1,z:53},{x:20,z:59}]),
 edge('b_harbor','b_wharf','b_east',[{x:96,z:63},{x:154,z:86}]),
 edge('b_east_loop','b_east','b_south',[{x:218,z:157},{x:174,z:198}]),
 edge('b_market','b_south','b_square',[{x:67,z:180},{x:12,z:198}]),
 edge('b_chapel','b_square','b_corner',[{x:-72,z:162},{x:-88,z:133}]),
 edge('b_shortcut','b_corner','b_bridge',[{x:-72,z:82}]),
 edge('b_west_street','b_corner','b_west',[{x:-139,z:102},{x:-173,z:83}]),
 edge('b_hill_loop','b_west','b_hill',[{x:-214,z:124},{x:-203,z:160}]),
 edge('b_hill_crest','b_hill','b_square',[{x:-121,z:218},{x:-65,z:195}]),
 edge('b_riverside_west','b_west','b_quay',[{x:-172,z:47}]),
 edge('b_riverside','b_quay','b_bridge',[{x:-105,z:36},{x:-72,z:49}]),
 edge('c_bridge_street','c_bridge','c_lock',[{x:82,z:-47},{x:110,z:-43}]),
 edge('c_east_river','c_lock','c_east',[{x:182,z:-46}]),
 edge('c_foundry','c_east','c_tech',[{x:193,z:-146}]),
 edge('c_college','c_tech','c_square',[{x:90,z:-190}]),
 edge('c_green_street','c_square','c_green',[{x:-20,z:-173}]),
 edge('c_garden','c_green','c_bridge',[{x:-20,z:-85},{x:14,z:-88}]),
 edge('c_west_avenue','c_green','c_west',[{x:-107,z:-133}]),
 edge('c_yard_loop','c_west','c_yard',[{x:-202,z:-146}]),
 edge('c_riverside_west','c_yard','c_quay',[{x:-159,z:-83}]),
 edge('c_riverside','c_quay','c_bridge',[{x:-51,z:-61},{x:-4,z:-61}]),
 edge('c_outer_park','c_west','c_square',[{x:-103,z:-218},{x:-47,z:-213}]),
 edge('c_tech_link','c_tech','c_bridge',[{x:87,z:-106}])
];
const SEGMENTS=BOSTON_EDGES.flatMap(e=>e.points.slice(1).map((b,i)=>{const a=e.points[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);return{a,b,dx,dz,l,edge:e,index:i};}));
export const bostonSide=p=>p.z>.15*p.x?'boston':'cambridge';
export function bridgePosition(x,z){const dx=84,dz=-140,L=Math.hypot(dx,dz),u=((x+42)*dx+(z-70)*dz)/(L*L),cross=((x+42)*(-dz)+(z-70)*dx)/L;return{u,cross};}
const landHeight=(x,z)=>3+3.8*Math.exp(-(((x+151)/70)**2+((z-150)/74)**2));
export function bostonHeight(x,z){const {u,cross}=bridgePosition(x,z);if(u>=0&&u<=1&&Math.abs(cross)<14.3){const y0=landHeight(-42,70),y1=landHeight(42,-70),s=Math.sin(Math.PI*clamp((u-.17)/.66,0,1));return y0*(1-u)+y1*u+6.8*s*s;}return Math.abs(z-.15*x)<35?-2:landHeight(x,z);}
export function nearestBostonRoad(p){let best=null,bestD=Infinity;for(const s of SEGMENTS){const t=clamp(((p.x-s.a.x)*s.dx+(p.z-s.a.z)*s.dz)/(s.l*s.l||1),0,1),x=s.a.x+s.dx*t,z=s.a.z+s.dz*t,d=(p.x-x)**2+(p.z-z)**2;if(d<bestD){bestD=d;best={x,z,a:Math.atan2(s.dx,s.dz),edge:s.edge.id,t:(s.index+t)/(s.edge.points.length-1),segment:s.index};}}best.distance=Math.sqrt(bestD);return best;}
export const roadDistance=(x,z)=>nearestBostonRoad({x,z}).distance;
// Wheel contacts only need the nearest shoulder within 13 m, so a small spatial hash
// avoids scanning every road segment four times per vehicle each simulation step.
const shoulderCells=new Map();for(const s of SEGMENTS)for(let x=Math.floor((Math.min(s.a.x,s.b.x)-14)/32);x<=Math.floor((Math.max(s.a.x,s.b.x)+14)/32);x++)for(let z=Math.floor((Math.min(s.a.z,s.b.z)-14)/32);z<=Math.floor((Math.max(s.a.z,s.b.z)+14)/32);z++){const key=x+','+z;if(!shoulderCells.has(key))shoulderCells.set(key,[]);shoulderCells.get(key).push(s);}
export function bostonPavement(x,z){let d=Infinity;for(const s of shoulderCells.get(Math.floor(x/32)+','+Math.floor(z/32))||[]){const t=clamp(((x-s.a.x)*s.dx+(z-s.a.z)*s.dz)/(s.l*s.l||1),0,1),dx=x-s.a.x-s.dx*t,dz=z-s.a.z-s.dz*t;d=Math.min(d,dx*dx+dz*dz);}return d>100.4004&&d<169?.16:0;}
const features=[
 {name:'LANTERN HILL',kind:'hill',x:-138,z:132,entrance:{x:-154,z:96}},
 {name:'NORTH END YARD',kind:'market',x:14,z:119,entrance:{x:-18,z:132}},
 {name:'HARBOR WORKS',kind:'industrial',x:143,z:137,entrance:{x:189,z:125}},
 {name:'CAMBRIDGE COMMON',kind:'park',x:-67,z:-171,entrance:{x:-40,z:-161}},
 {name:'COLLEGE COURT',kind:'college',x:46,z:-132,entrance:{x:82,z:-108}},
 {name:'RIVER FOUNDRY',kind:'industrial',x:151,z:-96,entrance:{x:177,z:-131}}
];
function orientedBarrier(a,b,width=.5,h=1.05){return{x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:width,d:length(a,b)+.04,h,a:Math.atan2(b.x-a.x,b.z-a.z),landmark:true,barrier:true};}
function bankBarriers(){const result=[];for(const side of[-1,1]){const center=-side*35*.514495755/.934667287;const gap=15.3;for(const [left,right]of[[-240,center-gap],[center+gap,240]]){const n=Math.ceil((right-left)/7);for(let i=0;i<n;i++){const x=left+(right-left)*i/n,X=left+(right-left)*(i+1)/n;result.push({...orientedBarrier({x,z:.15*x+side*35},{x:X,z:.15*X+side*35}),bank:side});}}}const B=BOSTON_NODES.b_bridge,C=BOSTON_NODES.c_bridge,dx=C.x-B.x,dz=C.z-B.z,L=Math.hypot(dx,dz),rx=-dz/L,rz=dx/L;for(const side of[-1,1])for(let i=0;i<32;i++){const u=.18+.64*i/32,v=.18+.64*(i+1)/32,a={x:B.x+dx*u+rx*12.8*side,z:B.z+dz*u+rz*12.8*side},b={x:B.x+dx*v+rx*12.8*side,z:B.z+dz*v+rz*12.8*side};result.push({...orientedBarrier(a,b,.45,1.05),bridgeRail:true});}return result;}
function footprint(b){const c=Math.cos(b.a||0),s=Math.sin(b.a||0);return[-1,0,1].flatMap(x=>[-1,0,1].map(z=>({x:b.x+x*b.w/2*c+z*b.d/2*s,z:b.z+z*b.d/2*c-x*b.w/2*s})));}
function isRoadClear(b,margin=13.7){return footprint(b).every(p=>Math.abs(p.x)<231&&Math.abs(p.z)<231&&roadDistance(p.x,p.z)>=margin&&Math.abs(p.z-.15*p.x)>39);}
function intersects(a,b,gap=.65){const aa=a.a||0,ba=b.a||0,axes=[[Math.cos(aa),-Math.sin(aa)],[Math.sin(aa),Math.cos(aa)],[Math.cos(ba),-Math.sin(ba)],[Math.sin(ba),Math.cos(ba)]],dx=a.x-b.x,dz=a.z-b.z;for(const q of axes){const r=(o,t)=>o.w/2*Math.abs(q[0]*Math.cos(t)-q[1]*Math.sin(t))+o.d/2*Math.abs(q[0]*Math.sin(t)+q[1]*Math.cos(t));if(Math.abs(dx*q[0]+dz*q[1])>=r(a,aa)+r(b,ba)+gap)return false;}return true;}
export function makeBostonCity(){
 const buildings=[],random=(()=>{let seed=711;return()=>((seed=(Math.imul(seed,1664525)+1013904223)|0)>>>0)/4294967296;})();
 const common={x:-67,z:-171,w:45,d:36},reserves=[common];
 const add=b=>{if(!isRoadClear(b)||buildings.some(o=>intersects(b,o))||reserves.some(o=>intersects(b,o,1.2)))return false;buildings.push(b);return true;};
 // Give landmarks their lots first. Smaller street frontage then fills around them.
 for(const b of[
  {x:-140,z:132,w:13,d:26,h:12,style:'church',color:0},
  {x:15,z:116,w:26,d:17,h:9,style:'shop',color:1,sign:true},
  {x:145,z:135,w:25,d:22,h:13,style:'warehouse',color:1,sign:true},
  {x:40,z:-134,w:27,d:17,h:14,style:'college',color:0},
  {x:151,z:-96,w:22,d:21,h:11,style:'factory',color:1,sign:true}
 ])add(b);
 // Narrow frontage lots rotate along every curve, making terraces rather than isolated cubes.
 for(const e of BOSTON_EDGES){if(e.bridge)continue;let walked=0;for(let i=1;i<e.points.length;i++){const a=e.points[i-1],p=e.points[i],d=length(a,p);walked+=d;if(walked<12.5)continue;walked=0;const nx=(p.z-a.z)/d,nz=-(p.x-a.x)/d,heading=Math.atan2(p.x-a.x,p.z-a.z);for(const side of[-1,1]){
  const w=8+random()*3.8,depth=10+random()*7,offset=14.3+depth/2,b={x:p.x+nx*side*offset,z:p.z+nz*side*offset,w,d:depth,a:heading-side*Math.PI/2,color:Math.floor(random()*5),sign:random()>.6};
  const bank=bostonSide(p),r=random(),industrial=b.x>115&&Math.abs(b.z)<160;
  b.style=industrial?(r<.3?'factory':r<.75?'warehouse':'shop'):bank==='boston'?(r<.36?'brownstone':r<.68?'tenement':r<.83?'shop':r<.93?'apartments':'diner'):(r<.28?'tenement':r<.5?'apartments':r<.7?'shop':r<.84?'office':'college');
  b.h=b.style==='diner'?4.6:b.style==='shop'?6.5+random()*4:industrial?8+random()*8:b.style==='office'?21+random()*16:10+random()*12;
  add(b);
 }}}
 // Backland infill creates layered blocks and narrow passages while keeping the common open.
 for(let z=-218;z<=218;z+=12.5)for(let x=-219;x<=219;x+=12.5){if(buildings.length>=200)break;const p={x:x+(random()-.5)*2,z:z+(random()-.5)*2},road=nearestBostonRoad(p);if(road.distance<20||road.distance>52)continue;const bank=bostonSide(p),b={...p,a:road.a-Math.PI/2,w:7.6+random()*3,d:8.5+random()*3.5,h:10+random()*12,style:bank==='boston'?'tenement':'apartments',color:Math.floor(random()*5)};if(b.x>115){b.style='warehouse';b.h=7+random()*4;}else if(road.distance>31&&random()>.72){b.style='office';b.h=26+random()*16;}add(b);}
 const barriers=bankBarriers();buildings.push(...barriers);
 const fs=features.map(f=>({...f,entrance:{...nearestBostonRoad(f.entrance)},colliders:[],walkSurfaces:[]}));
 const spawnRoad=nearestBostonRoad({x:-30,z:123}),spawn={x:spawnRoad.x-Math.cos(spawnRoad.a)*4.2,z:spawnRoad.z+Math.sin(spawnRoad.a)*4.2,a:spawnRoad.a};
 const parkedSpawns=[{x:-153,z:104,kind:'wagon',paint:'#6b7969'},{x:25,z:104,kind:'coupe',paint:'#895b46'},{x:155,z:-123,kind:'van',paint:'#858d8c'}].map(p=>{const n=nearestBostonRoad(p);return{...p,x:n.x+Math.cos(n.a)*8,z:n.z-Math.sin(n.a)*8,a:n.a};});
 const pedestrianRoutes=BOSTON_EDGES.filter(e=>!e.bridge&&e.points.length>9).map((e,index)=>{const side=index%2?1:-1;return e.points.slice(3,-3).map((p,i,array)=>{const prev=e.points[i+2],next=e.points[i+4],dx=next.x-prev.x,dz=next.z-prev.z,L=Math.hypot(dx,dz);return{x:p.x+dz/L*11.6*side,z:p.z-dx/L*11.6*side};});}).filter(route=>route.length>2).map(route=>[...route,...route.slice(1,-1).reverse()]);
 return{id:'boston',name:'BOSTON TO CAMBRIDGE',buildings,palms:[],features:fs,walkSurfaces:[],signals:[],roads:BOSTON_EDGES,nodes:BOSTON_NODES,spawn,parkedSpawns,pedestrianRoutes};
}
function tree(m,x,z,r=2.6){const y=landHeight(x,z);m.tube([x,y,z],[x+.13,y+4.5,z],.16,'#675f4c',5);const top=[x,y+7,z],bottom=[x,y+3,z];for(let k=0;k<7;k++){const a=k/7*Math.PI*2,b=(k+1)/7*Math.PI*2,A=[x+Math.cos(a)*r,y+4.8,z+Math.sin(a)*r],B=[x+Math.cos(b)*r,y+4.8,z+Math.sin(b)*r];m.tri(top,A,B,k%2?'#6d7754':'#77815b');m.tri(bottom,B,A,'#58684f');}}
function ribbon(m,e,half,slot,y=0,color='#ffffff'){const pts=e.points;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+2)],da=Math.hypot(b.x-prev.x,b.z-prev.z),db=Math.hypot(next.x-a.x,next.z-a.z),ax=(b.z-prev.z)/da*half,az=-(b.x-prev.x)/da*half,bx=(next.z-a.z)/db*half,bz=-(next.x-a.x)/db*half,P=(p,x,z)=>[p.x+x,bostonHeight(p.x+x,p.z+z)+y,p.z+z];if(slot===2){const r=10/half;for(const sign of[-1,1]){const x=(a.x+b.x)/2+(ax+bx)/2*(1+r)/2*sign,z=(a.z+b.z)/2+(az+bz)/2*(1+r)/2*sign;if(roadDistance(x,z)<10.2)continue;m.surface(P(a,ax*r*sign,az*r*sign),P(a,ax*sign,az*sign),P(b,bx*sign,bz*sign),P(b,bx*r*sign,bz*r*sign),slot,1,length(a,b)/3,color);}}else m.surface(P(a,-ax,-az),P(a,ax,az),P(b,bx,bz),P(b,-bx,-bz),slot,half*2/3,length(a,b)/3,color);}}
function bridgeWorld(m){const B=BOSTON_NODES.b_bridge,C=BOSTON_NODES.c_bridge,dx=C.x-B.x,dz=C.z-B.z,L=Math.hypot(dx,dz),rx=-dz/L,rz=dx/L,P=(u,s,y)=>[B.x+dx*u+rx*s,y,B.z+dz*u+rz*s];
 // White inverted-Y towers split above the carriageway; no pillar blocks a lane.
 for(const u of[.3,.7]){const center=P(u,0,0),deck=bostonHeight(center[0],center[2]);for(const side of[-1,1]){m.tube(P(u,side*15,-2),P(u,side*14,deck+3),1.1,'#c8c9b7',6);m.tube(P(u,side*14,deck+3),P(u,side*2,deck+27),.85,'#d8d8c5',6);m.tube(P(u,side*2,deck+27),P(u,0,deck+37),.72,'#e0dfce',6);}for(let k=-8;k<=8;k++){if(!k)continue;const at=clamp(u+k*.027,.025,.975),q=P(at,0,0),yy=bostonHeight(q[0],q[2]);for(const side of[-1,1])m.tube(P(u,0,deck+34-Math.abs(k)*.3),P(at,side*11.8,yy+.6),.065,'#c3c8ba',4);}}
 for(let i=0;i<35;i++){const u=i/35,v=(i+1)/35,a=P(u,0,0),b=P(v,0,0),ya=bostonHeight(a[0],a[2]),yb=bostonHeight(b[0],b[2]);for(const side of[-1,1])m.quad(P(u,side*13.1,ya-.9),P(v,side*13.1,yb-.9),P(v,side*13.1,yb),P(u,side*13.1,ya),'#757d78');}
}
export function drawBostonWorld(m,city){const oldHeight=m.heightSampler,oldTransform=m.transform;m.heightSampler=null;m.transform=null;
 // Two land meshes stop exactly at the river retaining walls. Water is a true gap.
 m.flat(0,0,1500,1500,'#627d86',-1.9);for(const side of[-1,1])for(let x=-240;x<240;x+=8)for(let d=35;d<280;d+=8){const z=.15*x+side*d,X=x+8,D=d+8,points=[[x,landHeight(x,z)-.06,z],[X,landHeight(X,.15*X+side*d)-.06,.15*X+side*d],[X,landHeight(X,.15*X+side*D)-.06,.15*X+side*D],[x,landHeight(x,.15*x+side*D)-.06,.15*x+side*D]];if(points.every(p=>Math.abs(p[2])>240))continue;m.quad(...points,side===1?'#939486':'#909a84');}
 // Wide sidewalk base, then a narrower road ribbon, with consistent physical heights.
 for(const e of BOSTON_EDGES){ribbon(m,e,13,2,.15);ribbon(m,e,10,1,.005);}
 for(const n of Object.values(BOSTON_NODES)){const yy=bostonHeight(n.x,n.z);m.disc(n.x,yy+.012,n.z,10.15,'#555957',24);}
 for(const e of BOSTON_EDGES){let traveled=0;for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i],l=length(a,b);traveled+=l;if(traveled<8)continue;traveled=0;const dx=(b.x-a.x)/l,dz=(b.z-a.z)/l;for(const s of[-.2,.2]){const P=(along,offset)=>{const x=b.x+dx*along+dz*offset,z=b.z+dz*along-dx*offset;return[x,bostonHeight(x,z)+.028,z];};m.quad(P(-2,s-.055),P(2,s-.055),P(2,s+.055),P(-2,s+.055),'#c8b579');}}}
 for(const b of city.buildings){if(b.barrier){const co=Math.cos(b.a),si=Math.sin(b.a),base=b.bridgeRail?bostonHeight(b.x,b.z):landHeight(b.x,b.z);m.transform={x:b.x,y:base,z:b.z,c:co,s:si};m.box(0,0,0,b.w,b.h,b.d,b.bridgeRail?'#c2c4b4':'#8a9285');m.box(0,.95,0,b.w+.1,.12,b.d,'#bec1ad');m.transform=null;}else{const base=Math.max(...footprint(b).map(p=>landHeight(p.x,p.z)));drawArchitecture(m,b,{mapId:'boston',base,low:Math.min(...footprint(b).map(p=>landHeight(p.x,p.z))),index:city.buildings.indexOf(b)});}}
 bridgeWorld(m);
 // The common's grass and diagonal footpaths are deliberately off the street network.
 const common=features.find(f=>f.kind==='park');m.heightSampler=landHeight;m.flat(common.x,common.z,43,34,'#738569',.015);m.surface([common.x-20,.02,common.z+11],[common.x-20,.02,common.z+13],[common.x+20,.02,common.z-11],[common.x+20,.02,common.z-13],2,1,10,'#c4bfaa');m.heightSampler=null;
 for(const [x,z]of[[-84,-180],[-82,-161],[-54,-181],[-49,-165],[-176,123],[-120,156],[12,136],[80,143],[169,169],[77,-129],[-174,-120],[-115,-192]])if(roadDistance(x,z)>14)tree(m,x,z);
 // Boats sit below the crossing; street furniture is now simulated separately.
 for(const x of[-148,130]){const z=.15*x+8;m.box(x,-1.7,z,11,.9,3.3,'#b3b8ac');m.box(x-1,-.8,z,4.1,1.6,2.6,'#c5c6b2');m.box(x-1,.1,z+1.32,2.6,.7,.06,'#48636a');}
 m.heightSampler=oldHeight;m.transform=oldTransform;return m;
}
