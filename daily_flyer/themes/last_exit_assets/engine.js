import {vehicleSpec,TRAFFIC_TYPES,driveAcceleration} from './vehicles.js';
import {terrainHeight,groundHeight,walkHeight,vehicleSurface,settleVehicle} from './terrain.js';
import {baycrestFeatures} from './baycrest-landmarks.js';
import {districtFeatures} from './landmarks.js';
// LAST EXIT: deterministic, browser-independent driving simulation.
export const ROADS = [-216,-144,-72,0,72,144,216];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function random(seed=78){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
export function makeCity(id='meridian'){
 const rnd=random(), buildings=[], palms=[],features=id==='baycrest'?baycrestFeatures():districtFeatures();
 for(let ix=0;ix<6;ix++)for(let iz=0;iz<6;iz++){
  const x=ROADS[ix]+36,z=ROADS[iz]+36;
  if(features.some(f=>f.x===x&&f.z===z))continue;
  if(id!=='baycrest'&&((x===-108&&z===108)||(x===-36&&z===180))){
   for(const sign of[-1,1])buildings.push({x:x+15*sign,z:z-15*sign,w:9,d:9,h:10+rnd()*7,color:2,sign:true,style:'brick'});continue;
  }
  // The waterfront district has low warehouses; downtown has taller towers.
  const downtown=id==='baycrest'?ix>3&&iz<3:ix<3&&iz<3;
  for(let a=-1;a<=1;a+=2)for(let b=-1;b<=1;b+=2){
   if(id!=='baycrest'&&ix===5&&iz===4&&a===1)continue;
   buildings.push({x:x+a*11.5,z:z+b*11.5,w:16+rnd()*3,d:16+rnd()*3,h:downtown?18+rnd()*24:id==='baycrest'?7+rnd()*4:8+rnd()*14,color:Math.floor(rnd()*6),sign:rnd()>.65,style:id==='baycrest'&&!downtown?'rowhouse':ix<3?'brick':'stucco'});
  }
  for(let k=0;k<(id!=='baycrest'&&ix>3?3:0);k++)palms.push({x:ROADS[ix]+15,z:ROADS[iz]+20+k*15,h:8+rnd()*3});
 }
 const walkSurfaces=features.flatMap(f=>f.walkSurfaces||[]);buildings.push(...features.flatMap(f=>f.colliders),...walkSurfaces.map(s=>({...s,h:s.height+.18,landmark:true,walkable:true})));
 return{id,name:id==='baycrest'?'BAYCREST':'PORT MERIDIAN',buildings,palms,features,walkSurfaces,signals:ROADS.slice(1,-1).flatMap(x=>ROADS.slice(1,-1).map(z=>({x,z})))};
}
// The diagonal avenue cuts two blocks, with actual pavement openings and clear collision space.
export function onDiagonal(x,z,margin=0){return x>=-152&&x<=8&&z>=64&&z<=224&&Math.abs(z-x-216)<11.3+margin;}
export function districtAt(p,city){if(city.id==='baycrest'){const f=city.features.find(f=>dist(p,f)<42);return f?.name||(p.x>130?'EAST BAY':p.z<-130?'FORT RIDGE':p.x<-115?'LAUREL HEIGHTS':p.z>70?'SOUTH SLOPES':'TELEGRAPH HILL');}const f=(city.features||[]).find(f=>dist(p,f)<40);return f?.name||(onDiagonal(p.x,p.z,8)?'MERIDIAN AVENUE':p.x>150?'HARBOR ROAD':p.z<0?'DOWNTOWN':'OLD QUARTER');}
export function signalAt(x,z,time){const phase=((time+(x+z)/72*1.2)%22+22)%22;return{vertical:phase<9.5,horizontal:phase>=11&&phase<20.5};}
export const JOBS=[
 {id:'free',name:'Free drive',tag:'NO CLOCK. NO PRESSURE.',desc:'Get to know Port Meridian. Find your line, throw the tail out, and take the long way home.',time:0,targets:[]},
 {id:'pickup',name:'The pickup',tag:'01 / FIRST NIGHT',desc:'A contact is waiting at the motel. Pick them up, shake the tail, and get to the waterfront garage.',time:180,targets:[{x:72,z:72,label:'Pick up at the motel',stop:true},{x:216,z:-144,label:'Reach the waterfront garage',stop:true}]},
 {id:'heat',name:'Heat check',tag:'02 / LOSE THE TAIL',desc:'Two cruisers have your number. Break their line of sight, stay out of view, and get back to the garage.',time:150,targets:[{x:-144,z:-144,label:'Lose the police, then reach the garage',stop:true}]},
 {id:'courier',name:'Last delivery',tag:'03 / AGAINST THE CLOCK',desc:'Four checkpoints across the city. Keep moving, watch the traffic, and bring the car home in one piece.',time:110,targets:[{x:144,z:144,label:'Checkpoint 1 · Coast Road'},{x:144,z:-144,label:'Checkpoint 2 · Marina'},{x:-144,z:-144,label:'Checkpoint 3 · Downtown'},{x:-144,z:72,label:'Checkpoint 4 · Old Quarter'}]}
];
export const BAY_JOBS=[
 {...JOBS[0],desc:'Climb the ridge streets, explore the waterfront and look for uncommon cars tucked into the neighborhoods.'},
 {id:'pickup',name:'The pickup',tag:'01 / FERRY CONTACT',desc:'Meet a contact at the ferry market, then lose the tail on the way to Fort Point.',time:230,targets:[{x:180,z:72,label:'Stop at Ferry Market',stop:true},{x:108,z:-144,label:'Reach Fort Point',stop:true}]},
 {id:'heat',name:'Heat check',tag:'02 / HILL COUNTRY',desc:'Lose two cruisers among the hill crests and reach the cable yard.',time:185,targets:[{x:108,z:144,label:'Lose the police, then reach Cable Yard',stop:true}]},
 {id:'courier',name:'Ridge runner',tag:'03 / CROSS-TOWN',desc:'Carry four deliveries across Baycrest. The downhill sections are faster; the junctions still need braking.',time:180,targets:[{x:-108,z:144,label:'Painted Steps delivery'},{x:-36,z:0,label:'Telegraph Terrace delivery'},{x:-180,z:-72,label:'Laurel Park delivery'},{x:180,z:72,label:'Ferry Market delivery'}]}
];
export function makeCar(x=5.7,z=174,a=Math.PI,mapId='meridian'){return{x,z,a,mapId,vx:0,vz:0,y:groundHeight(x,z,mapId),verticalSpeed:0,pitch:0,roll:0,yawRate:0,speed:0,steer:0,damage:0,engineDamage:0,wheelDamage:0,motorClock:0,panelDamage:{front:0,rear:0,left:0,right:0},dents:[],lastImpact:null,hit:0,slip:0,distance:0,top:0};}
export function collide(car,buildings,radius=1.45){
 let impact=0;
 for(const b of buildings){
  const dx=car.x-clamp(car.x,b.x-b.w/2,b.x+b.w/2),dz=car.z-clamp(car.z,b.z-b.d/2,b.z+b.d/2);let d=Math.hypot(dx,dz),nx,nz;
  if(d>=radius)continue;
  if(d<.001){const ox=b.w/2+radius-Math.abs(car.x-b.x),oz=b.d/2+radius-Math.abs(car.z-b.z);if(ox<oz){nx=car.x>b.x?1:-1;nz=0;car.x+=nx*ox;}else{nx=0;nz=car.z>b.z?1:-1;car.z+=nz*oz;}}
  else{nx=dx/d;nz=dz/d;car.x+=nx*(radius-d);car.z+=nz*(radius-d);}
  const v=car.vx*nx+car.vz*nz;if(v<0){car.vx-=v*1.25*nx;car.vz-=v*1.25*nz;impact=Math.max(impact,-v);}
 }
 for(const key of ['x','z']){if(Math.abs(car[key])>235){car[key]=clamp(car[key],-235,235);const vk=key==='x'?'vx':'vz';impact=Math.max(impact,Math.abs(car[vk]));car[vk]*=-.22;}}
 return impact;
}
// Separating-axis contact for the actual full-length vehicle footprint.
export function boxContact(a,b,aw=vehicleSpec(a).w,al=vehicleSpec(a).l,bw=vehicleSpec(b).w,bl=vehicleSpec(b).l){
 const aa=a.a||0,ba=b.a||0,ar=[Math.cos(aa),-Math.sin(aa)],af=[Math.sin(aa),Math.cos(aa)],br=[Math.cos(ba),-Math.sin(ba)],bf=[Math.sin(ba),Math.cos(ba)],delta=[a.x-b.x,a.z-b.z];let depth=Infinity,normal=null;
 for(const axis of[ar,af,br,bf]){const dot=(v,w)=>v[0]*w[0]+v[1]*w[1],ra=aw*Math.abs(dot(ar,axis))+al*Math.abs(dot(af,axis)),rb=bw*Math.abs(dot(br,axis))+bl*Math.abs(dot(bf,axis)),d=dot(delta,axis),overlap=ra+rb-Math.abs(d);if(overlap<=0)return null;if(overlap<depth){depth=overlap;const sign=d<0?-1:1;normal={x:axis[0]*sign,z:axis[1]*sign};}}
 return{...normal,depth};
}
export function applyDamage(c,power,nx,nz,point=null){
 if(power<=3||c.hit>0)return false;
 const amount=power*.72;c.damage=clamp((c.damage||0)+amount,0,100);c.panelDamage??={front:0,rear:0,left:0,right:0};
 const localX=-nx*Math.cos(c.a)+nz*Math.sin(c.a),localZ=-nx*Math.sin(c.a)-nz*Math.cos(c.a),side=Math.abs(localZ)>Math.abs(localX)?(localZ>0?'front':'rear'):(localX>0?'right':'left');
 c.panelDamage[side]=clamp(c.panelDamage[side]+amount*2.1,0,100);
 // Body condition is cosmetic. A coupe's front-mounted cooling system is more vulnerable.
 if(side==='front'){
  const vulnerability=vehicleSpec(c).cooling;
  c.engineDamage=clamp((c.engineDamage||0)+Math.max(0,power-10)*vulnerability*(c.panelDamage.front>50?1:.12),0,100);
 }
 if((side==='left'||side==='right')&&power>18)c.wheelDamage=clamp((c.wheelDamage||0)+(power-18)*.65,0,75);
 const spec=vehicleSpec(c),px=point?point.x-c.x:-nx*spec.l,pz=point?point.z-c.z:-nz*spec.l;
 const dent={x:clamp(px*Math.cos(c.a)-pz*Math.sin(c.a),-spec.w,spec.w),z:clamp(px*Math.sin(c.a)+pz*Math.cos(c.a),-spec.l,spec.l),depth:Math.min(.35,power*.012),radius:Math.min(1.5,.7+power*.025)};
 c.dents??=[];const old=c.dents.find(d=>Math.hypot(d.x-dent.x,d.z-dent.z)<.65);if(old){old.depth=Math.min(.5,old.depth+dent.depth*.6);old.radius=Math.max(old.radius,dent.radius);}else{if(c.dents.length>=10)c.dents.shift();c.dents.push(dent);}
 c.hit=.38;
 c.lastImpact={x:c.x-nx*1.7,z:c.z-nz*1.7,nx,nz,power,side,serial:(c.lastImpact?.serial||0)+1};return true;
}
export function vehicleCollision(a,b){
 if(dist(a,b)>7)return 0;const contact=boxContact(a,b);if(!contact)return 0;const {x:nx,z:nz,depth}=contact;
 const ma=vehicleSpec(a).mass,mb=vehicleSpec(b).mass,total=ma+mb;
 a.x+=nx*(depth+.002)*mb/total;a.z+=nz*(depth+.002)*mb/total;b.x-=nx*(depth+.002)*ma/total;b.z-=nz*(depth+.002)*ma/total;
 const avx=a.vx||0,avz=a.vz||0,bvx=b.vx??Math.sin(b.a)*(b.speed||0),bvz=b.vz??Math.cos(b.a)*(b.speed||0),closing=-((avx-bvx)*nx+(avz-bvz)*nz);
 if(closing<=0)return 0;const impulse=closing*1.12/(1/ma+1/mb),ix=nx*impulse,iz=nz*impulse;
 a.vx=avx+ix/ma;a.vz=avz+iz/ma;b.vx=bvx-ix/mb;b.vz=bvz-iz/mb;
 if(b.occupied){b.knockVX=(b.knockVX||0)-ix/mb;b.knockVZ=(b.knockVZ||0)-iz/mb;}
 const armX=(b.x-a.x)*.5,armZ=(b.z-a.z)*.5,twist=clamp((armZ*ix-armX*iz)/4.8,-1.5,1.5);
 a.yawRate=clamp((a.yawRate||0)+twist/ma,-2,2);b.yawRate=clamp((b.yawRate||0)+twist/mb,-2,2);
 const point={x:(a.x+b.x)/2,z:(a.z+b.z)/2};applyDamage(a,closing,nx,nz,point);applyDamage(b,closing,-nx,-nz,point);if(b.occupied)b.hit=Math.max(b.hit||0,.6);return closing;
}
export function personVehicleContact(p,c,impactEnabled=true){
 const travel=impactEnabled&&Number.isFinite(c.previousX)?Math.hypot(c.x-c.previousX,c.z-c.previousZ):0;
 if(Math.abs(p.x-c.x)>3.6+Math.min(travel,20)||Math.abs(p.z-c.z)>3.6+Math.min(travel,20))return 0;
 const spec=vehicleSpec(c),radius=.38,co=Math.cos(c.a),si=Math.sin(c.a);
 if(Math.abs((p.y??groundHeight(p.x,p.z,p.mapId))-(c.y??groundHeight(c.x,c.z,c.mapId)))>1.7)return 0;
 const local=(x,z)=>({x:x*co-z*si,z:x*si+z*co}),q=local(p.x-c.x,p.z-c.z),nearestX=clamp(q.x,-spec.w,spec.w),nearestZ=clamp(q.z,-spec.l,spec.l),dx=q.x-nearestX,dz=q.z-nearestZ,d=Math.hypot(dx,dz);let nx=0,nz=0,penetration=0;
 if(d<radius){if(d>.0001){nx=dx/d;nz=dz/d;penetration=radius-d;}else{const side=spec.w-Math.abs(q.x),end=spec.l-Math.abs(q.z);if(side<end){nx=Math.sign(q.x)||1;penetration=side+radius;}else{nz=Math.sign(q.z)||1;penetration=end+radius;}}}
 else if(impactEnabled&&Number.isFinite(c.previousX)&&Math.hypot(c.x-c.previousX,c.z-c.previousZ)<20){
  const a=local(p.x-c.previousX,p.z-c.previousZ),delta={x:q.x-a.x,z:q.z-a.z};let enter=0,leave=1,axis=null,sign=0;
  for(const [key,size]of[['x',spec.w+radius],['z',spec.l+radius]]){if(Math.abs(delta[key])<1e-7){if(Math.abs(a[key])>size)return 0;continue;}let near=(-size-a[key])/delta[key],far=(size-a[key])/delta[key],n=-1;if(near>far){[near,far]=[far,near];n=1;}if(near>enter){enter=near;axis=key;sign=n;}leave=Math.min(leave,far);if(enter>leave)return 0;}
  if(!axis||enter<0||enter>1)return 0;nx=axis==='x'?sign:0;nz=axis==='z'?sign:0;penetration=axis==='x'?spec.w+radius-q.x*nx:spec.l+radius-q.z*nz;
 }else return 0;
 const worldX=nx*co+nz*si,worldZ=nz*co-nx*si;p.x+=worldX*(penetration+.003);p.z+=worldZ*(penetration+.003);
 const cvx=c.vx??Math.sin(c.a)*(c.speed||0),cvz=c.vz??Math.cos(c.a)*(c.speed||0),closing=(cvx-(p.vx||0))*worldX+(cvz-(p.vz||0))*worldZ;
 if(!impactEnabled||Math.hypot(cvx,cvz)<2.5||closing<2.5||p.contactCooldown>0)return 0;
 const force=clamp(closing*.65,1.5,12);p.knockVX=worldX*force;p.knockVZ=worldZ*force;p.stun=closing>7?1.65:.5;p.knockdown=closing>7?1.65:0;p.contactCooldown=1;p.lastVehicleImpact=closing;
 c.vx=cvx*.97;c.vz=cvz*.97;if(c.occupied)c.speed*=.9;return closing;
}
export function collideVehicle(c,buildings){
 let strongest=0;
 for(const b of buildings){if(Math.abs(c.x-b.x)>b.w/2+3.2||Math.abs(c.z-b.z)>b.d/2+3.2)continue;const contact=boxContact(c,{...b,a:0},vehicleSpec(c).w,vehicleSpec(c).l,b.w/2,b.d/2);if(!contact)continue;const {x:nx,z:nz,depth}=contact;c.x+=nx*(depth+.002);c.z+=nz*(depth+.002);const inward=c.vx*nx+c.vz*nz;if(inward<0){const power=-inward;c.vx-=inward*1.12*nx;c.vz-=inward*1.12*nz;applyDamage(c,power,nx,nz,{x:clamp(c.x,b.x-b.w/2,b.x+b.w/2),z:clamp(c.z,b.z-b.d/2,b.z+b.d/2)});strongest=Math.max(strongest,power);}}
 for(const key of['x','z'])if(Math.abs(c[key])>232.3){const sign=Math.sign(c[key]),vk=key==='x'?'vx':'vz';c[key]=sign*232.3;const power=Math.abs(c[vk]);applyDamage(c,power,key==='x'?-sign:0,key==='z'?-sign:0);c[vk]*=-.12;strongest=Math.max(strongest,power);}
 return strongest;
}
// Retract the chase camera along its ray instead of teleporting overhead.
export function safeCamera(actor,eye,buildings){
 let fraction=1;
 for(const b of buildings){let lo=0,hi=1;for(const [k,j,size]of[['x',0,'w'],['z',2,'d']]){const delta=eye[j]-actor[k],min=b[k]-b[size]/2-.55,max=b[k]+b[size]/2+.55;if(Math.abs(delta)<1e-7){if(actor[k]<min||actor[k]>max){lo=2;break;}}else{let near=(min-actor[k])/delta,far=(max-actor[k])/delta;if(near>far)[near,far]=[far,near];lo=Math.max(lo,near);hi=Math.min(hi,far);}}if(lo<=hi&&lo>=0&&lo<1)fraction=Math.min(fraction,Math.max(0,lo-.025));}
 return[actor.x+(eye[0]-actor.x)*fraction,eye[1],actor.z+(eye[2]-actor.z)*fraction];
}
// On foot, a manual orbit must not put the camera inside a nearby vehicle.
export function safeFootCamera(actor,eye,vehicles){
 const start=[actor.x,(actor.y||0)+1.25,actor.z];let fraction=1;
 for(const c of vehicles){if(dist(actor,c)>18)continue;const spec=vehicleSpec(c),co=Math.cos(c.a),si=Math.sin(c.a),height=c.kind==='van'?2.55:c.kind==='pickup'?2.05:1.7;
  const local=p=>[(p[0]-c.x)*co-(p[2]-c.z)*si,p[1]-(c.y||0),(p[0]-c.x)*si+(p[2]-c.z)*co],a=local(start),b=local(eye),mins=[-spec.w-.12,.12,-spec.l-.12],maxs=[spec.w+.12,height,spec.l+.12];let lo=0,hi=1;
  for(let k=0;k<3;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-7){if(a[k]<mins[k]||a[k]>maxs[k]){lo=2;break;}}else{let n=(mins[k]-a[k])/d,f=(maxs[k]-a[k])/d;if(n>f)[n,f]=[f,n];lo=Math.max(lo,n);hi=Math.min(hi,f);}}
  if(lo<=hi&&lo>0&&lo<1)fraction=Math.min(fraction,Math.max(.05,lo-.035));
 }
 return eye.map((v,i)=>start[i]+(v-start[i])*fraction);
}
export function stepCar(c,input,dt,buildings,handling='street'){
 dt=clamp(dt,0,1/30);c.hit=Math.max(0,c.hit-dt);
 const fx=Math.sin(c.a),fz=Math.cos(c.a),rx=Math.cos(c.a),rz=-Math.sin(c.a);
 let forward=c.vx*fx+c.vz*fz,side=c.vx*rx+c.vz*rz;
 c.steer+=(clamp((input.steer||0)+(c.wheelDamage||0)*.0015*Math.sign((c.panelDamage.right||0)-(c.panelDamage.left||0)),-1,1)-c.steer)*Math.min(1,dt*8);
 const brake=clamp(input.brake||0,0,1),gas=clamp(input.gas||0,0,1),hb=!!input.handbrake;
 c.motorClock=(c.motorClock||0)+dt;const mechanical=c.engineDamage||0,sputter=mechanical>55&&Math.sin(c.motorClock*11)>1-(mechanical-55)/50;
 let acc=gas*(mechanical>=100?0:forward<-.8?8:driveAcceleration(c,forward)*Math.max(.22,1-mechanical*.0065)*(sputter?.22:1))-brake*(forward>.8?8:3.2);
 if(!gas&&!brake){acc-=Math.sign(forward)*Math.min(Math.abs(forward)/dt,1.25);}
 const surface=vehicleSurface(c);if(gas||brake||Math.abs(forward)>.3)acc-=9.81*Math.sin(surface.pitch);
 forward=clamp(forward+(acc-forward*Math.abs(forward)*.0012)*dt,-10,vehicleSpec(c).maxSpeed);
 if(hb)forward*=Math.exp(-dt*1.05);
 const traction=c.airborne?.15:hb?1.25:handling==='raw'?4.2:7;
 side*=Math.exp(-dt*traction);
 // Steering authority drops with speed. Handbrake releases rear grip.
 const authority=(1.9/(1+Math.abs(forward)*.055))*(hb?1.7:1);
 const turn=c.steer*authority*clamp(forward/8,-1,1);
 // Positive input means screen-right; our forward basis is sin(a), cos(a).
 c.a=angle(c.a-turn*dt+(c.yawRate||0)*dt);c.yawRate=(c.yawRate||0)*Math.exp(-dt*3.5);
 c.vx=fx*forward+rx*side;c.vz=fz*forward+rz*side;
 c.x+=c.vx*dt;c.z+=c.vz*dt;
 const hit=collideVehicle(c,buildings);
 c.speed=c.vx*Math.sin(c.a)+c.vz*Math.cos(c.a);
 c.slip=Math.abs(c.vx*Math.cos(c.a)-c.vz*Math.sin(c.a));
 c.distance+=Math.hypot(c.vx,c.vz)*dt;c.top=Math.max(c.top,Math.abs(c.speed)*2.237);
 settleVehicle(c,dt);return hit;
}
const nearest=v=>ROADS.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);
export function nearestRoad(p){const x=nearest(p.x),z=nearest(p.z);return Math.abs(x-p.x)<Math.abs(z-p.z)?{x,z:clamp(p.z,-216,216)}:{x:clamp(p.x,-216,216),z};}
export function resetCar(c){const p=nearestRoad(c);c.x=p.x;c.z=p.z;c.vx=0;c.vz=0;c.a=Math.abs(p.x-nearest(p.x))<.1?Math.PI:Math.PI/2;c.hit=1;c.y=groundHeight(c.x,c.z,c.mapId);c.verticalSpeed=0;c.pitch=c.roll=c.yawRate=0;}
function segmentBox(a,b,box){let lo=0,hi=1;for(const [k,s]of[['x','w'],['z','d']]){const d=b[k]-a[k],min=box[k]-box[s]/2,max=box[k]+box[s]/2;if(Math.abs(d)<1e-6){if(a[k]<min||a[k]>max)return false;}else{let t1=(min-a[k])/d,t2=(max-a[k])/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}}return true;}
export function visible(a,b,buildings){
 if(buildings.some(v=>segmentBox(a,b,v)))return false;const id=a.mapId||b.mapId;if(id!=='baycrest')return true;
 const ay=(a.y??groundHeight(a.x,a.z,id))+1.7,by=(b.y??groundHeight(b.x,b.z,id))+1.7,n=Math.max(2,Math.ceil(dist(a,b)/5));
 for(let i=1;i<n;i++){const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(terrainHeight(x,z,id)>ay+(by-ay)*t)return false;}return true;
}
export class Game{
 constructor(city=makeCity()){this.city=city;this.rnd=random(101);this.start('free');}
 makeCar(x,z,a){return makeCar(x,z,a,this.city.id);}
 start(id,handling='street'){
  this.job=(this.city.id==='baycrest'?BAY_JOBS:JOBS).find(j=>j.id===id)||JOBS[0];this.handling=handling;this.car=this.makeCar();this.car.kind=id==='courier'?'compact':id==='pickup'?'wagon':'sedan';this.car.paint=this.city.id==='baycrest'?'#b2a17c':'#898c90';this.car.name=vehicleSpec(this.car).name;this.onFoot=false;this.person={mapId:this.city.id,x:0,z:0,a:Math.PI,walk:0,speed:0};this.walkHeading=Math.PI;this.door=null;this.takeover=null;this.waypoint=null;this.pedestrians=[];this.walkDistance=0;
  for(let i=0;i<36;i++){const bx=ROADS[i%6]+36,bz=ROADS[(i*3+Math.floor(i/6))%6]+36,route=[{x:bx-22.6,z:bz-22.6},{x:bx+22.6,z:bz-22.6},{x:bx+22.6,z:bz+22.6},{x:bx-22.6,z:bz+22.6}],point=route[i%4];this.pedestrians.push({mapId:this.city.id,...point,y:walkHeight(point.x,point.z,this.city),a:0,walk:i,speed:1.2+(i%3)*.2,life:Infinity,route,waypoint:(i+1)%4,coat:['#747f85','#746358','#586b65'][i%3]});}
  // Crosswalk routes add street activity where drivers and people actually meet.
  for(let i=0;i<8;i++){const x=ROADS[1+i%5],z=ROADS[2+Math.floor(i/5)]+10.1,route=[{x:x-16,z},{x:x+16,z}];this.pedestrians.push({mapId:this.city.id,x:route[i%2].x,z,a:Math.PI/2,walk:i,y:walkHeight(route[i%2].x,z,this.city),speed:1.4,life:Infinity,route,waypoint:(i+1)%2,coat:i%2?'#7d6856':'#566f73'});}
  this.elapsed=0;this.time=this.job.time;this.stage=0;this.heat=0;this.hidden=0;this.busted=0;this.pursuitStarted=0;this.hold=0;this.done=null;this.message='';this.messageTime=0;this.cops=[];this.traffic=[];this.parked=[{...this.makeCar(11.3,159,Math.PI),kind:'coupe',paint:'#784137',name:'Marlow coupe'},{...this.makeCar(-11.3,183,0),kind:'wagon',paint:'#65735b',name:'Estate wagon'},{...this.makeCar(83.3,39,Math.PI),kind:'sedan',paint:'#8b8673',name:'Regent sedan'},{...this.makeCar(155.3,-107,Math.PI),kind:'coupe',paint:'#425b71',name:'Marlow coupe'}];this.skids=[];this.resetCount=0;
  let index=0;
  for(const vertical of[true,false])for(const road of ROADS)for(const dir of[-1,1])for(let slot=0;slot<4;slot++){
   const along=-198+slot*108+((index*17)%31),x=vertical?road-dir*5.4:along,z=vertical?along:road+dir*5.4,a=vertical?(dir===1?0:Math.PI):(dir===1?Math.PI/2:-Math.PI/2),kind=TRAFFIC_TYPES[index%TRAFFIC_TYPES.length];
   const cruiseSpeed=(kind==='van'?8:kind==='taxi'?13:10)+this.rnd()*3;
   const v={...this.makeCar(x,z,a),kind,name:vehicleSpec({kind}).name,paint:kind==='taxi'?'#b99d53':['#858477','#6c8b87','#7e4036','#b5a57a','#53637a','#d0c8af','#544b45','#859398'][index%8],speed:cruiseSpeed,cruiseSpeed,vertical,dir,occupied:true,nextTurnAt:4+(index%9)*2};
   if(dist(v,this.car)<10){v[vertical?'z':'x']+=dir*18;v.y=groundHeight(v.x,v.z,this.city.id);}this.traffic.push(v);index++;
  }
  // A nearby occupied car makes the street takeover discoverable from the first drive.
  this.traffic.push({...this.makeCar(-5.4,166,0),kind:'sedan',name:'Regent sedan',paint:'#6c8b87',speed:0,cruiseSpeed:9,vertical:true,dir:1,occupied:true,yieldUntil:7});
  if(this.city.id==='baycrest'){this.parked.push({...this.makeCar(-110,119,Math.PI),kind:'sport',name:'Vela GT',paint:'#a8533e',rare:true},{...this.makeCar(108,-175,Math.PI/2),kind:'muscle',name:'Braddock V8',paint:'#3e6460',rare:true});}
  this.discoveries=new Set();if(id==='heat')this.raiseHeat(2);
 }
 say(m){this.message=m;this.messageTime=5;}
 get actor(){return this.onFoot?this.person:this.car;}
 nearbyCar(){return this.interactionInfo()?.car||null;}
 interactionInfo(){
  const p=this.person,candidates=[];
  for(const c of[this.car,...this.parked,...this.traffic]){
   if(dist(c,p)>5.4||Math.abs((p.y??walkHeight(p.x,p.z,this.city))-(c.y??groundHeight(c.x,c.z,c.mapId)))>1.4||!visible(c,p,this.city.buildings))continue;
   const dx=p.x-c.x,dz=p.z-c.z,lx=dx*Math.cos(c.a)-dz*Math.sin(c.a),side=lx>=0?1:-1;
   const door={x:c.x+Math.cos(c.a)*2.15*side,z:c.z-Math.sin(c.a)*2.15*side};
   const occupied=this.traffic.includes(c),close=dist(p,door)<2.1,slow=Math.abs(c.speed)<2.2;
   candidates.push({car:c,kind:occupied?'hijack':'enter',ready:!occupied||(close&&slow),reason:!slow?'WAIT FOR TRAFFIC TO STOP':!close?'APPROACH A SIDE DOOR':'',side,door,distance:dist(p,door)});
  }
  return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
 }
 enterCar(next,stolen=false,info=null){
  if(next!==this.car){this.parked=this.parked.filter(c=>c!==next);this.parked.push(this.car);this.car=next;}
  this.traffic=this.traffic.filter(c=>c!==next);next.vx=next.vz=next.speed=0;next.occupied=false;next.stolen=stolen||next.stolen;this.onFoot=false;this.takeover=null;
  this.door={car:next,side:info?.side||1,time:.55};
  if(stolen){const d=info.door;this.pedestrians.push({mapId:this.city.id,x:d.x,z:d.z,a:next.a+info.side*Math.PI/2,walk:0,speed:3.2,life:14,y:walkHeight(d.x,d.z,this.city),coat:'#747f85'});this.raiseHeat(Math.max(1,this.heat));this.say('DISPATCH · Driver reported a stolen car. Get moving.');}
  else{if(next.rare)this.discoveries.add(next.kind);this.say((next.rare?'RARE FIND · ':'IN VEHICLE · ')+(next.name||'Sedan'));}
 }
 stepTakeover(input,dt){
  const t=this.takeover;if(!t)return;
  if(Math.hypot(input.moveX||0,input.moveY||0)>.15||dist(this.person,t.door)>2.7||!this.traffic.includes(t.car)){
   this.takeover=null;this.door=null;this.say('Takeover cancelled.');return;
  }
  t.elapsed+=dt;t.car.speed=t.car.vx=t.car.vz=0;this.person.a=Math.atan2(t.car.x-this.person.x,t.car.z-this.person.z);
  this.door={car:t.car,side:t.side,time:1};if(t.elapsed>=1.1)this.enterCar(t.car,true,t);
 }
 interact(){
  if(this.done||this.onFoot&&this.person.stun>0)return false;
  if(!this.onFoot){
   if(Math.hypot(this.car.vx,this.car.vz)>1.5){this.say('Stop the car before getting out.');return false;}
   const c=this.car,side=[Math.cos(c.a),-Math.sin(c.a)];
   for(const sign of[1,-1]){
    const candidate={x:c.x+side[0]*2.25*sign,z:c.z+side[1]*2.25*sign,vx:0,vz:0};const initial={...candidate};collide(candidate,this.city.buildings,.45);
    const blocked=[...this.parked,...this.traffic].some(v=>dist(v,candidate)<2.2);
    if(dist(initial,candidate)>.2||blocked||!visible(c,candidate,this.city.buildings))continue;
    c.vx=c.vz=c.speed=0;this.onFoot=true;this.person={mapId:this.city.id,x:candidate.x,z:candidate.z,a:c.a,walk:0,speed:0,y:walkHeight(candidate.x,candidate.z,this.city),verticalSpeed:0};this.walkHeading=c.a;this.door={car:c,side:sign,time:.8};this.say('ON FOOT · Left thumb moves. Right thumb looks. Approach a stopped car.');return true;
   }
   this.say('The doors are blocked. Move away from the wall.');return false;
  }
  if(this.takeover){this.takeover=null;this.door=null;this.say('Takeover cancelled.');return false;}
  const info=this.interactionInfo();if(!info){this.say('Approach a parked car or a slow traffic car.');return false;}
  if(!info.ready){this.say(info.reason);return false;}
  if(info.kind==='hijack'){this.takeover={...info,elapsed:0};info.car.speed=info.car.vx=info.car.vz=0;this.say('TAKING VEHICLE · Move to cancel.');return true;}
  this.enterCar(info.car);return true;
 }

 stepPerson(input,dt){
  const p=this.person,h=Number.isFinite(input.viewHeading)?input.viewHeading:this.walkHeading;
  p.stun=Math.max(0,(p.stun||0)-dt);p.knockdown=Math.max(0,(p.knockdown||0)-dt);p.contactCooldown=Math.max(0,(p.contactCooldown||0)-dt);
  let right=p.stun?0:clamp(input.moveX||0,-1,1),forward=p.stun?0:clamp(input.moveY||0,-1,1),len=Math.hypot(right,forward);if(len>1){right/=len;forward/=len;}
  const slope=vehicleSurface({...p,a:h}).pitch,speed=(input.run?5.7:3.1)*(1-Math.min(.35,Math.abs(slope)*1.4)),vx=(-Math.cos(h)*right+Math.sin(h)*forward)*speed,vz=(Math.sin(h)*right+Math.cos(h)*forward)*speed;
  const before={x:p.x,z:p.z},oldGround=walkHeight(p.x,p.z,this.city);p.x+=(vx+(p.knockVX||0))*dt;p.z+=(vz+(p.knockVZ||0))*dt;p.knockVX=(p.knockVX||0)*Math.exp(-dt*4);p.knockVZ=(p.knockVZ||0)*Math.exp(-dt*4);
  if(walkHeight(p.x,p.z,this.city)-oldGround>.26){p.x=before.x;p.z=before.z;}
  p.vx=vx;p.vz=vz;collide(p,this.city.buildings.filter(b=>!b.walkable),.45);
  const ground=walkHeight(p.x,p.z,this.city);if(!Number.isFinite(p.y))p.y=oldGround;p.verticalSpeed=(p.verticalSpeed||0)-9.81*dt;
  if(p.y<=ground+.26){p.y=ground;p.verticalSpeed=0;}else p.y=Math.max(ground,p.y+p.verticalSpeed*dt);
  for(const c of[this.car,...this.parked,...this.traffic,...this.cops])personVehicleContact(p,c,false);
  p.speed=dist(before,p)/dt;this.walkDistance+=dist(before,p);if(p.speed>.05&&Math.hypot(vx,vz)>.05){p.a=angle(p.a+angle(Math.atan2(vx,vz)-p.a)*Math.min(1,dt*12));p.walk+=p.speed*dt*3;}
 }

 raiseHeat(n=2){
  const was=this.heat;this.heat=clamp(Math.max(this.heat,n),1,3);this.hidden=0;if(!was)this.pursuitStarted=this.elapsed;
  const actor=this.actor;
  while(this.cops.filter(p=>p.engineDamage<100).length<this.heat){
   const options=ROADS.flatMap(x=>ROADS.map(z=>({x,z}))).filter(p=>dist(p,actor)>80&&dist(p,actor)<170&&!this.cops.some(c=>dist(c,p)<25));
   options.sort((a,b)=>(visible(a,actor,this.city.buildings)?50:0)+Math.abs(dist(a,actor)-105)-((visible(b,actor,this.city.buildings)?50:0)+Math.abs(dist(b,actor)-105)));
   const at=options[0]||{x:216,z:216},a=Math.atan2(actor.x-at.x,actor.z-at.z),p={...this.makeCar(at.x,at.z,a),kind:'sedan',police:true,goal:null,last:{x:actor.x,z:actor.z},seen:false,pursuitState:'search',sirens:true};
   this.cops.push(p);if(this.cops.length>6)break;
  }
  if(!was||this.heat>was)this.say(was?'DISPATCH · Additional unit joining the pursuit.':'DISPATCH · Units are on your tail. Break line of sight.');
 }
 get target(){return this.job.targets[this.stage]||null;}
 recover(){if(this.onFoot){this.onFoot=false;this.interact();this.say('Returned to your car.');return;}resetCar(this.car);this.resetCount++;if(this.job.id==='free'){this.car.damage=0;this.car.engineDamage=0;this.car.wheelDamage=0;this.car.panelDamage={front:0,rear:0,left:0,right:0};this.car.lastImpact=null;this.car.dents=[];}else this.time=Math.max(0,this.time-8);this.say(this.job.id==='free'?'Back on the road. Car repaired.':'Back on the road. 8-second recovery penalty.');}
 tick(dt,input={}){
  if(this.done)return;dt=clamp(dt,0,1/30);for(const v of[this.car,...this.traffic,...this.parked,...this.cops]){v.previousX=v.x;v.previousZ=v.z;}this.elapsed+=dt;this.messageTime=Math.max(0,this.messageTime-dt);if(this.door){this.door.time-=dt;if(this.door.time<=0)this.door=null;}
  this.stepTakeover(input,dt);const c=this.car;if(this.onFoot&&!this.takeover)this.stepPerson(input,dt);const hit=this.onFoot?0:stepCar(c,input,dt,this.city.buildings,this.handling);this.impact=hit;const actor=this.actor;
  if(hit>8&&this.job.id==='free'&&!this.heat)this.say('Bent the fender? R or Recover puts you back on the road.');
  this.stepTraffic(dt);
  for(const p of this.pedestrians){
   p.life-=dt;p.contactCooldown=Math.max(0,(p.contactCooldown||0)-dt);p.stun=Math.max(0,(p.stun||0)-dt);p.knockdown=Math.max(0,(p.knockdown||0)-dt);if(p.route&&!p.stun){const goal=p.route[p.waypoint];if(dist(p,goal)<.5)p.waypoint=(p.waypoint+1)%p.route.length;p.a=Math.atan2(goal.x-p.x,goal.z-p.z);}
   const nearCar=!this.onFoot&&dist(p,c)<6&&Math.abs(c.speed)>4;if(nearCar)p.a=Math.atan2(p.x-c.x,p.z-c.z);
   const speed=p.stun?0:nearCar?3.8:p.speed;p.vx=Math.sin(p.a)*speed;p.vz=Math.cos(p.a)*speed;p.x+=(p.vx+(p.knockVX||0))*dt;p.z+=(p.vz+(p.knockVZ||0))*dt;p.knockVX=(p.knockVX||0)*Math.exp(-dt*4);p.knockVZ=(p.knockVZ||0)*Math.exp(-dt*4);collide(p,this.city.buildings.filter(b=>!b.walkable),.35);p.y=walkHeight(p.x,p.z,this.city);p.walk+=dt*speed*3;
  }this.pedestrians=this.pedestrians.filter(p=>p.life>0);
  if(c.slip>2&&Math.abs(c.speed)>5&&this.elapsed%0.065<dt){this.skids.push({x:c.x,z:c.z,a:c.a,t:0});if(this.skids.length>180)this.skids.shift();}
  for(const v of(this.onFoot?[this.car,...this.parked]:this.parked)){v.hit=Math.max(0,v.hit-dt);v.x+=(v.vx||0)*dt;v.z+=(v.vz||0)*dt;v.vx*=Math.exp(-dt*2.5);v.vz*=Math.exp(-dt*2.5);v.a=angle(v.a+(v.yawRate||0)*dt);v.yawRate=(v.yawRate||0)*Math.exp(-dt*3);v.speed=0;collideVehicle(v,this.city.buildings);settleVehicle(v,dt);this.carCollision(v,dt);}
  for(const s of this.skids)s.t+=dt;
  let spotted=false;
  for(const [index,p] of this.cops.entries()){
   p.hit=Math.max(0,(p.hit||0)-dt);p.seen=!!this.heat&&p.engineDamage<100&&dist(p,actor)<112&&visible(p,actor,this.city.buildings);
   p.pursuitState=p.engineDamage>=100?'disabled':!this.heat?'patrol':p.seen?'pursuit':'search';p.sirens=!!this.heat&&p.engineDamage<100;
   if(p.seen){p.last={x:actor.x,z:actor.z};spotted=true;}
   const target=this.heat?p.last:{x:index%2?144:-144,z:Math.sin(this.elapsed*.025+index)>0?144:-144};
   if(!p.goal||dist(p,p.goal)<4){
    const gx=nearest(p.x),gz=nearest(p.z),options=[];
    if(Math.abs(p.x-gx)>9||Math.abs(p.z-gz)>9)p.goal={x:gx,z:gz};
    else{
     for(const[dx,dz]of[[72,0],[-72,0],[0,72],[0,-72]])if(Math.abs(gx+dx)<=216&&Math.abs(gz+dz)<=216)options.push({x:gx+dx,z:gz+dz});
     options.sort((a,b)=>dist(a,target)-dist(b,target));p.goal=options[0]||{x:gx,z:gz};
    }
   }
   // A second unit leads a visible moving car; unseen units only know the last sighting.
   let goal=p.goal;if(p.seen&&dist(p,actor)<48&&visible(p,actor,this.city.buildings))goal={x:actor.x+(!this.onFoot&&index%2?(c.vx||0)*.7:0),z:actor.z+(!this.onFoot&&index%2?(c.vz||0)*.7:0)};
   const desiredHeading=Math.atan2(goal.x-p.x,goal.z-p.z),delta=angle(desiredHeading-p.a);if(p.engineDamage<100)p.a=angle(p.a+clamp(delta,-dt*1.9,dt*1.9)+(p.yawRate||0)*dt);p.yawRate=(p.yawRate||0)*Math.exp(-dt*3);
   let desired=p.engineDamage>=100?0:Math.abs(delta)>.65?8:p.seen?24+this.heat*2:this.heat?16:11;
   desired*=Math.max(.22,1-(p.engineDamage||0)*.007);if(this.onFoot&&dist(p,actor)<6)desired=0;
   for(const v of[...this.traffic,...this.parked]){const dx=v.x-p.x,dz=v.z-p.z,ahead=dx*Math.sin(p.a)+dz*Math.cos(p.a),side=Math.abs(dx*Math.cos(p.a)-dz*Math.sin(p.a));if(ahead>0&&ahead<22&&side<2.2)desired=Math.min(desired,Math.sqrt(Math.max(0,ahead-6)*12));}
   p.speed+=clamp(desired-p.speed,-dt*12,dt*5);p.vx=Math.sin(p.a)*p.speed;p.vz=Math.cos(p.a)*p.speed;p.x+=p.vx*dt;p.z+=p.vz*dt;
   const wall=collideVehicle(p,this.city.buildings);if(wall>0){p.speed=Math.max(0,p.vx*Math.sin(p.a)+p.vz*Math.cos(p.a));p.goal={x:nearest(p.x),z:nearest(p.z)};}
   settleVehicle(p,dt);this.carCollision(p,dt);for(const v of[...this.traffic,...this.parked])vehicleCollision(p,v);
  }
  // Resolve after every vehicle has moved, including moving traffic against a stationary person.
  const people=this.onFoot?[this.person,...this.pedestrians]:this.pedestrians,vehicles=[this.car,...this.traffic,...this.parked,...this.cops];
  for(const person of people)for(const vehicle of vehicles){const impact=personVehicleContact(person,vehicle,true);if(impact>3){
   this.impact=Math.max(this.impact||0,impact*.35);if(person===this.person){this.takeover=null;this.door=null;this.say(impact>7?'Knocked down. Getting back up…':'Hit by a car. Watch the traffic.');}
   else if(vehicle===this.car&&!this.onFoot){this.raiseHeat(Math.max(1,this.heat));this.say('DISPATCH · Pedestrian collision reported.');}
  }}
  for(const person of people){collide(person,this.city.buildings.filter(b=>!b.walkable),.38);person.y=Math.max(person.y||0,walkHeight(person.x,person.z,this.city));}
  if(this.heat){
   this.hidden=spotted?0:this.hidden+dt;
   if(this.hidden>8){this.heat=0;for(const p of this.cops){p.sirens=false;p.goal=null;p.pursuitState=p.engineDamage>=100?'disabled':'patrol';}this.say('DISPATCH · They lost you. Keep it clean.');}
   else if(spotted&&this.heat<3&&this.elapsed-this.pursuitStarted>45*this.heat)this.raiseHeat(this.heat+1);
   const close=this.heat&&this.cops.some(p=>p.engineDamage<100&&dist(p,actor)<7&&visible(p,actor,this.city.buildings));this.busted=close&&(this.onFoot||Math.abs(c.speed)<2)?this.busted+dt:Math.max(0,this.busted-dt*2);
   if(this.busted>=5)this.finish(false,'Boxed in.');
  }
  for(const v of this.parked)if(v.rare&&!this.discoveries.has(v.kind)&&dist(this.actor,v)<16){this.discoveries.add(v.kind);this.say('FOUND · '+v.name+'. Stop and approach a door to take it.');}
  if(this.waypoint&&dist(this.actor,this.waypoint)<9){this.say('Arrived at '+this.waypoint.label+'.');this.waypoint=null;}
  if(this.job.id!=='free'){
   this.time=Math.max(0,this.time-dt);if(this.time<=0)this.finish(false,'Out of time.');if(c.engineDamage>=100)this.finish(false,'Engine disabled.');
   const target=this.target;
   if(target&&!this.onFoot&&dist(c,target)<10){
    if(target.stop&&Math.abs(c.speed)>2.5)this.say('Ease off. Stop inside the marker.');
    else if(this.heat&&this.stage===this.job.targets.length-1)this.say('Lose the tail before leading them to the garage.');
    else{this.hold+=dt;if(this.hold>(target.stop?.7:.04)){this.stage++;this.hold=0;if(this.stage>=this.job.targets.length)this.finish(true,'Job complete.');else{if(this.job.id==='pickup')this.raiseHeat(2);this.say(this.job.id==='pickup'?'CONTACT · Go, go! Lose them and head to the garage.':'Checkpoint cleared. Keep moving.');}}}
   }else this.hold=0;
  }else if(c.engineDamage>=100){if(!this.onFoot)this.say('ENGINE STALLED · Get out, change cars, or Recover to repair.');}
 }
 stepTraffic(dt){
  const pedestrians=new Set(this.onFoot?[this.person,...this.pedestrians]:this.pedestrians),obstacles=[this.car,...this.parked,...this.traffic,...pedestrians];
  for(const t of this.traffic){
   t.hit=Math.max(0,t.hit-dt);let desired=t.hit||t.engineDamage>=100?0:t.cruiseSpeed*Math.max(.3,1-(t.engineDamage||0)*.006)*(this.city.id==='baycrest'?Math.max(.55,1-Math.max(0,vehicleSurface(t).pitch)*1.4):1);
   const along=t.vertical?'z':'x',across=t.vertical?'x':'z';
   // Red lights have a shared all-red clearance phase. Stop before the crossing.
   for(const light of this.city.signals||[]){if(t.turn||Math.abs(t[across]-light[across])>8)continue;const ahead=(light[along]-t[along])*t.dir-12;
    if(ahead>=-1&&!signalAt(light.x,light.z,this.elapsed)[t.vertical?'vertical':'horizontal'])desired=Math.min(desired,Math.sqrt(Math.max(0,ahead)*8));
   }
   for(const p of obstacles){if(p===t)continue;const dx=p.x-t.x,dz=p.z-t.z;if(Math.abs(dx)>40||Math.abs(dz)>40)continue;const ahead=dx*Math.sin(t.a)+dz*Math.cos(t.a),lateral=Math.abs(dx*Math.cos(t.a)-dz*Math.sin(t.a)),person=pedestrians.has(p);
    if(ahead>0&&ahead<40&&lateral<(person?2.5:2.15))desired=Math.min(desired,Math.sqrt(Math.max(0,ahead-(person?4.5:vehicleSpec(t).l+vehicleSpec(p).l+1.5))*9));
    if(person&&dist(t,p)<3.3)desired=0;
   }
   if(this.takeover?.car===t||this.elapsed<(t.yieldUntil||0))desired=0;
   const previous=t.speed;t.speed+=clamp(desired-t.speed,-dt*7,dt*2.5);t.braking=t.speed<previous-.001||t.speed<.3;
   if(!t.turn&&t.speed>2&&this.elapsed>t.nextTurnAt){
    const light=(this.city.signals||[]).find(l=>Math.abs(t[across]-l[across])<8&&(l[along]-t[along])*t.dir>=12&&(l[along]-t[along])*t.dir<15&&signalAt(l.x,l.z,this.elapsed)[t.vertical?'vertical':'horizontal']);
    if(light){const out=angle(t.a+(this.rnd()>.5?1:-1)*Math.PI/2),fx=Math.sin(t.a),fz=Math.cos(t.a),ox=Math.sin(out),oz=Math.cos(out),end={x:light.x+ox*14-oz*5.4,z:light.z+oz*14+ox*5.4};t.turn={start:{x:t.x,z:t.z},end,p1:{x:t.x+fx*14,z:t.z+fz*14},p2:{x:end.x-ox*14,z:end.z-oz*14},out,progress:0};t.nextTurnAt=this.elapsed+18+this.rnd()*20;}
   }
   if(t.turn){const q=t.turn;q.progress=Math.min(1,q.progress+t.speed*dt/27);const u=q.progress,v=1-u,position=k=>v*v*v*q.start[k]+3*v*v*u*q.p1[k]+3*v*u*u*q.p2[k]+u*u*u*q.end[k],derivative=k=>3*v*v*(q.p1[k]-q.start[k])+6*v*u*(q.p2[k]-q.p1[k])+3*u*u*(q.end[k]-q.p2[k]);t.x=position('x');t.z=position('z');t.a=Math.atan2(derivative('x'),derivative('z'));if(u>=1){t.a=q.out;t.vertical=Math.abs(Math.cos(q.out))>.5;t.dir=t.vertical?Math.sign(Math.cos(q.out)):Math.sign(Math.sin(q.out));t.turn=null;}}
   else{t[along]+=t.dir*t.speed*dt;const lane=nearest(t[across])+(t.vertical?-1:1)*t.dir*5.4;if(!t.hit)t[across]+=(lane-t[across])*Math.min(1,dt*.6);}
   t.x+=(t.knockVX||0)*dt;t.z+=(t.knockVZ||0)*dt;t.knockVX=(t.knockVX||0)*Math.exp(-dt*2);t.knockVZ=(t.knockVZ||0)*Math.exp(-dt*2);
   const roadHeading=t.vertical?(t.dir===1?0:Math.PI):(t.dir===1?Math.PI/2:-Math.PI/2);if(!t.turn)t.a=angle(t.a+(t.yawRate||0)*dt+angle(roadHeading-t.a)*dt*1.2);t.yawRate=(t.yawRate||0)*Math.exp(-dt*3);
   t.vx=Math.sin(t.a)*t.speed+(t.knockVX||0);t.vz=Math.cos(t.a)*t.speed+(t.knockVZ||0);collideVehicle(t,this.city.buildings);settleVehicle(t,dt);
   if(Math.abs(t.x)>231){t.x=-Math.sign(t.x)*230;t.previousX=t.x;}if(Math.abs(t.z)>231){t.z=-Math.sign(t.z)*230;t.previousZ=t.z;}
   this.carCollision(t,dt);
  }
  for(let i=0;i<this.traffic.length;i++){const a=this.traffic[i];for(const b of[...this.traffic.slice(i+1),...this.parked]){const impact=vehicleCollision(a,b);if(impact>0){a.knockVX=a.vx-Math.sin(a.a)*a.speed;a.knockVZ=a.vz-Math.cos(a.a)*a.speed;}}}
 }
 carCollision(t,dt){
  if(t===this.car)return;const impact=vehicleCollision(this.car,t);if(impact>3){this.impact=impact;if(!this.onFoot&&this.job.id==='free'&&impact>12&&!this.heat)this.raiseHeat(1);}
 }
 finish(win,reason){if(!this.done)this.done={win,reason,elapsed:this.elapsed,distance:this.car.distance,top:this.car.top,damage:this.car.damage};}
}
