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
function isRoadClear(b,margin=14){for(const x of[b.x-b.w/2,b.x,b.x+b.w/2])for(const z of[b.z-b.d/2,b.z,b.z+b.d/2])if(roadDistance(x,z)<margin||Math.abs(z-.15*x)<39)return false;return true;}
const intersects=(a,b,gap=2)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+gap&&Math.abs(a.z-b.z)<(a.d+b.d)/2+gap;
export function makeBostonCity(){
 const buildings=[],random=(()=>{let seed=711;return()=>((seed=(Math.imul(seed,1664525)+1013904223)|0)>>>0)/4294967296;})();
 // Frontage follows curved roads. No regular block stencil is used.
 for(const e of BOSTON_EDGES){if(e.bridge)continue;let walked=0;for(let i=1;i<e.points.length;i++){const a=e.points[i-1],p=e.points[i],d=length(a,p);walked+=d;if(walked<22)continue;walked=0;const nx=(p.z-a.z)/d,nz=-(p.x-a.x)/d;for(const side of[-1,1]){const w=12+random()*7,depth=12+random()*7,b={x:p.x+nx*side*25,z:p.z+nz*side*25,w,d:depth,h:8+random()*10,style:bostonSide(p)==='boston'?'brick':'college',color:Math.floor(random()*4),sign:random()>.7};if(Math.abs(b.x)>220-w/2||Math.abs(b.z)>220-depth/2||!isRoadClear(b)||buildings.some(o=>intersects(b,o))||features.some(f=>Math.hypot(f.x-b.x,f.z-b.z)<26))continue;buildings.push(b);}}}
 // Landmark footprints are chosen from the same clear ground as their visible geometry.
 const add=(b)=>{if(isRoadClear(b,13.5)&&!buildings.some(o=>intersects(b,o,.5)))buildings.push(b);};
 add({x:-140,z:132,w:13,d:26,h:12,style:'church',color:0,sign:false});
 add({x:15,z:116,w:26,d:17,h:9,style:'market',color:1,sign:true});
 add({x:145,z:135,w:25,d:22,h:13,style:'warehouse',color:1,sign:true});
 add({x:40,z:-134,w:27,d:17,h:14,style:'college',color:0,sign:true});
 add({x:151,z:-96,w:22,d:21,h:11,style:'factory',color:1,sign:true});
 const barriers=bankBarriers();buildings.push(...barriers);
 const fs=features.map(f=>({...f,entrance:{...nearestBostonRoad(f.entrance)},colliders:[],walkSurfaces:[]}));
 const spawnRoad=nearestBostonRoad({x:-30,z:123}),spawn={x:spawnRoad.x-Math.cos(spawnRoad.a)*4.2,z:spawnRoad.z+Math.sin(spawnRoad.a)*4.2,a:spawnRoad.a};
 const parkedSpawns=[{x:-153,z:104,kind:'wagon',paint:'#6b7969'},{x:25,z:104,kind:'coupe',paint:'#895b46'},{x:155,z:-123,kind:'van',paint:'#858d8c'}].map(p=>{const n=nearestBostonRoad(p);return{...p,x:n.x+Math.cos(n.a)*8,z:n.z-Math.sin(n.a)*8,a:n.a};});
 const pedestrianRoutes=BOSTON_EDGES.filter(e=>!e.bridge&&e.points.length>9).map((e,index)=>{const side=index%2?1:-1;return e.points.slice(3,-3).map((p,i,array)=>{const prev=e.points[i+2],next=e.points[i+4],dx=next.x-prev.x,dz=next.z-prev.z,L=Math.hypot(dx,dz);return{x:p.x+dz/L*11.6*side,z:p.z-dx/L*11.6*side};});}).filter(route=>route.length>2).map(route=>[...route,...route.slice(1,-1).reverse()]);
 return{id:'boston',name:'BOSTON TO CAMBRIDGE',buildings,palms:[],features:fs,walkSurfaces:[],signals:[],roads:BOSTON_EDGES,nodes:BOSTON_NODES,spawn,parkedSpawns,pedestrianRoutes};
}
function wall(m,b){const base=Math.max(...[-1,1].flatMap(s=>[-1,1].map(t=>landHeight(b.x+s*b.w/2,b.z+t*b.d/2)))),X=b.x-b.w/2,x=b.x+b.w/2,Z=b.z-b.d/2,z=b.z+b.d/2,h=b.h,slot=b.style==='college'?6:b.style==='warehouse'?14:3+b.color%3,color=b.style==='college'?'#c2b9a3':'#c2aa96';
 m.surface([X,base,Z],[x,base,Z],[x,base+h,Z],[X,base+h,Z],slot,b.w/7,h/7,color);m.surface([x,base,z],[X,base,z],[X,base+h,z],[x,base+h,z],slot,b.w/7,h/7,color);m.surface([X,base,z],[X,base,Z],[X,base+h,Z],[X,base+h,z],slot,b.d/7,h/7,color);m.surface([x,base,Z],[x,base,z],[x,base+h,z],[x,base+h,Z],slot,b.d/7,h/7,color);
 m.box(b.x,base+h,b.z,b.w+.35,.32,b.d+.35,'#a8a18f');m.flat(b.x,b.z,b.w,b.d,'#56605a',base+h+.33);m.box(b.x,base-.45,b.z,b.w,.48,b.d,'#9a9484');
 if(b.style==='church'){m.box(b.x,base+h,b.z+7,4,11,4,'#c4b99b');m.tri([b.x-2.4,base+h+11,b.z+9.4],[b.x+2.4,base+h+11,b.z+9.4],[b.x,base+h+19,b.z+7],'#777b6f');m.tri([b.x+2.4,base+h+11,b.z+9.4],[b.x+2.4,base+h+11,b.z+4.6],[b.x,base+h+19,b.z+7],'#56635c');m.tri([b.x+2.4,base+h+11,b.z+4.6],[b.x-2.4,base+h+11,b.z+4.6],[b.x,base+h+19,b.z+7],'#777b6f');m.tri([b.x-2.4,base+h+11,b.z+4.6],[b.x-2.4,base+h+11,b.z+9.4],[b.x,base+h+19,b.z+7],'#65736b');}
 if(b.style==='college'){for(const dx of[-8,-4,0,4,8]){m.box(b.x+dx,base,b.z+b.d/2+.5,.75,4,.8,'#c7c4b0');}m.box(b.x,base+4,b.z+b.d/2+.5,b.w+.6,.7,1.4,'#d2cbb6');m.tri([X,base+h+.3,z],[x,base+h+.3,z],[b.x,base+h+4.5,z],'#b8b59f');}
 if(b.style==='factory'){m.box(b.x+b.w*.32,base+h,b.z-5,3,21,3,'#89735d');for(let y=base+h+2;y<base+h+21;y+=3)m.box(b.x+b.w*.32,y,b.z-5,3.2,.2,3.2,'#b19b7c');}
 if(b.sign){const zz=z+.045;m.surface([b.x-4,base+3.2,zz],[b.x+4,base+3.2,zz],[b.x+4,base+4.6,zz],[b.x-4,base+4.6,zz],10+b.color%4);}
 if(b.style!=='warehouse'&&b.style!=='factory')for(const zz of[Z-.035,z+.035]){m.surface([X+.5,base+.4,zz],[x-.5,base+.4,zz],[x-.5,base+2.7,zz],[X+.5,base+2.7,zz],9,Math.max(1,Math.floor(b.w/4)),1,'#b6bba8');m.box(b.x,base+2.85,zz,b.w,.2,.25,'#a59e89');}
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
 for(const b of city.buildings){if(b.barrier){const co=Math.cos(b.a),si=Math.sin(b.a),base=b.bridgeRail?bostonHeight(b.x,b.z):landHeight(b.x,b.z);m.transform={x:b.x,y:base,z:b.z,c:co,s:si};m.box(0,0,0,b.w,b.h,b.d,b.bridgeRail?'#c2c4b4':'#8a9285');m.box(0,.95,0,b.w+.1,.12,b.d,'#bec1ad');m.transform=null;}else wall(m,b);}
 bridgeWorld(m);
 // The common's grass and diagonal footpaths are deliberately off the street network.
 const common=features.find(f=>f.kind==='park');m.heightSampler=landHeight;m.flat(common.x,common.z,43,34,'#738569',.015);m.surface([common.x-20,.02,common.z+11],[common.x-20,.02,common.z+13],[common.x+20,.02,common.z-11],[common.x+20,.02,common.z-13],2,1,10,'#c4bfaa');m.heightSampler=null;
 for(const [x,z]of[[-84,-180],[-82,-161],[-54,-181],[-49,-165],[-176,123],[-120,156],[12,136],[80,143],[169,169],[77,-129],[-174,-120],[-115,-192]])if(roadDistance(x,z)>14)tree(m,x,z);
 // Low quay furniture, mooring posts and boats below the bridge.
 for(const side of[-1,1])for(let x=-217;x<225;x+=24){const z=.15*x+side*42;if(roadDistance(x,z)<14)continue;const y=landHeight(x,z);m.tube([x,y,z],[x,y+5,z],.065,'#46594f',6);m.box(x,y+4.6,z,.5,.5,.5,'#c6c0a2');}
 for(const x of[-148,130]){const z=.15*x+8;m.box(x,-1.7,z,11,.9,3.3,'#b3b8ac');m.box(x-1,-.8,z,4.1,1.6,2.6,'#c5c6b2');m.box(x-1,.1,z+1.32,2.6,.7,.06,'#48636a');}
 m.heightSampler=oldHeight;m.transform=oldTransform;return m;
}
