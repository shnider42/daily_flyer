import {queryStatic} from './spatial.js';
import {groundHeight} from './terrain.js';
import {vehicleSpec} from './vehicles.js';
import {propSpec} from './street-models.js';
import {nearestBostonRoad} from './boston.js';
import {roadFrame,edgeLength} from './navigation.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),CELL=16,MAX_ACTIVE=32;
const roads=[-216,-144,-72,0,72,144,216];
// Positions use the same local roll/pitch/yaw order as Mesh. Physics rotates
// around the centre of mass; the drawing origin remains the foot of the object.
function basis(p){const r=p.roll||0,t=p.pitch||0,a=p.a||0,cr=Math.cos(r),sr=Math.sin(r),cp=Math.cos(t),sp=Math.sin(t),c=Math.cos(a),s=Math.sin(a);return[
 [cr*c-sr*sp*s,sr*cp,-sr*sp*c-cr*s],[-sr*c-cr*sp*s,cr*cp,-cr*sp*c+sr*s],[cp*s,sp,cp*c]
 ];}
export function propBounds(p){const s=propSpec(p),b=basis(p),half=[s.w/2,s.h/2,s.d/2],offset=b[1].map(v=>v*s.h/2),extent=[0,1,2].map(k=>b.reduce((n,v,i)=>n+Math.abs(v[k])*half[i],0));return{x:p.x+offset[0],y:p.y+offset[1],z:p.z+offset[2],hx:extent[0],hy:extent[1],hz:extent[2]};}
function setOrigin(p){const s=propSpec(p),b=basis(p)[1];p.x=p.cx-b[0]*s.h/2;p.y=p.cy-b[1]*s.h/2;p.z=p.cz-b[2]*s.h/2;}
function body(p){if(!p.broken){const s=propSpec(p);return{x:p.x,z:p.z,a:p.a,w:s.baseW||s.w,d:s.baseD||s.d,y:p.y,h:s.h};}const b=propBounds(p);return{x:b.x,z:b.z,a:0,w:b.hx*2,d:b.hz*2,y:b.y-b.hy,h:b.hy*2};}
function contact(a,b){const axes=[[Math.cos(a.a||0),-Math.sin(a.a||0)],[Math.sin(a.a||0),Math.cos(a.a||0)],[Math.cos(b.a||0),-Math.sin(b.a||0)],[Math.sin(b.a||0),Math.cos(b.a||0)]],dx=b.x-a.x,dz=b.z-a.z;let depth=Infinity,normal;
 for(const n of axes){const radius=o=>o.w/2*Math.abs(n[0]*Math.cos(o.a||0)-n[1]*Math.sin(o.a||0))+o.d/2*Math.abs(n[0]*Math.sin(o.a||0)+n[1]*Math.cos(o.a||0)),delta=dx*n[0]+dz*n[1],overlap=radius(a)+radius(b)-Math.abs(delta);if(overlap<=0)return null;if(overlap<depth){depth=overlap;const sign=Math.sign(delta)||1;normal={x:n[0]*sign,z:n[1]*sign};}}
 return{...normal,depth};
}
function cells(b){const out=[];for(let x=Math.floor((b.x-b.w/2)/CELL);x<=Math.floor((b.x+b.w/2)/CELL);x++)for(let z=Math.floor((b.z-b.d/2)/CELL);z<=Math.floor((b.z+b.d/2)/CELL);z++)out.push(x+','+z);return out;}
function indexProp(state,p){for(const k of p.cells||[])state.cells.get(k)?.delete(p);const b=body(p),c=Math.abs(Math.cos(b.a)),s=Math.abs(Math.sin(b.a));p.cells=cells({...b,w:b.w*c+b.d*s,d:b.d*c+b.w*s});for(const k of p.cells){if(!state.cells.has(k))state.cells.set(k,new Set());state.cells.get(k).add(p);}}
function nearby(state,x,z,r){const result=new Set();for(const k of cells({x,z,w:r*2,d:r*2}))for(const p of state.cells.get(k)||[])result.add(p);return result;}
export function makeStreetState(props=[],city={}){const state={props,city,cells:new Map(),active:new Set(),serial:0,events:[]};for(const p of props)indexProp(state,p);return state;}
export function createProp(kind,x,z,a=0,mapId='meridian'){return{kind,x,z,a,mapId,y:groundHeight(x,z,mapId),pitch:0,roll:0,vx:0,vy:0,vz:0,spin:0,vp:0,vr:0,broken:false,active:false,age:0,quiet:0,cooldown:0};}
export function makeStreetProps(city,vehicles=[]){
 if(!city.id)return[];const props=[],kinds=['lamp','bin','bench','sign','lamp','newsbox','hydrant','bench','cone','bollard'];let index=0;
 const add=(kind,x,z,a)=>{if(Math.abs(x)>229||Math.abs(z)>229)return;const p=createProp(kind,x,z,a,city.id),b=body(p);if(city.buildings.some(v=>contact({...b,w:b.w+.8,d:b.d+.8},v)))return;if((city.walkSurfaces||[]).some(v=>contact({...b,w:b.w+1.2,d:b.d+1.2},v)))return;if(vehicles.some(v=>Math.hypot(v.x-x,v.z-z)<4.8)||(city.features||[]).some(f=>f.entrance&&Math.hypot(f.entrance.x-x,f.entrance.z-z)<4))return;if(props.some(q=>Math.hypot(q.x-x,q.z-z)<3.4))return;props.push(p);};
 if(city.roads){for(const edge of city.roads){if(edge.bridge)continue;for(let d=18;d<edgeLength(edge)-17;d+=19)for(const side of[-1,1]){const f=roadFrame(edge,d,false,0),x=f.x+Math.cos(f.a)*12.45*side,z=f.z-Math.sin(f.a)*12.45*side;if(nearestBostonRoad({x,z}).distance<11.9||Object.values(city.nodes).some(n=>Math.hypot(x-n.x,z-n.z)<17))continue;add(kinds[index++%kinds.length],x,z,f.a-side*Math.PI/2);}}}
 else for(const vertical of[true,false])for(const road of roads)for(let segment=0;segment<6;segment++)for(const offset of[22,49])for(const side of[-1,1]){const along=roads[segment]+offset,x=vertical?road+side*12.45:along,z=vertical?along:road+side*12.45;if(city.id!=='baycrest'&&x>=-155&&x<=11&&z>=61&&z<=227&&Math.abs(z-x-216)<15)continue;add(kinds[index++%kinds.length],x,z,vertical?-side*Math.PI/2:side<0?0:Math.PI);}
 // Small, intentionally placed park groups make walking destinations feel occupied.
 for(const f of city.features||[])if(f.kind==='park'||/GARDEN|COMMON|COURT/.test(f.name)){for(const side of[-1,1]){add('bench',f.x+side*8,f.z+7,Math.PI);add('bin',f.x+side*10,f.z+7,0);}}
 return props;
}
function rest(state,p){p.active=false;p.vx=p.vy=p.vz=p.vp=p.vr=p.spin=0;state.active.delete(p);indexProp(state,p);}
function wake(state,p,nx,nz,power){
 if(!p.active&&state.active.size>=MAX_ACTIVE){const oldest=[...state.active].sort((a,b)=>b.age-a.age)[0];stablePose(oldest,1);land(oldest,state.city,true);rest(state,oldest);}
 const b=propBounds(p),s=propSpec(p);if(!p.active){p.cx=b.x;p.cy=b.y;p.cz=b.z;p.age=0;}
 p.active=true;p.broken=true;p.quiet=0;state.active.add(p);p.vx=clamp(p.vx+nx*power,-20,20);p.vz=clamp(p.vz+nz*power,-20,20);p.vy=Math.min(6,Math.max(p.vy,power*.18+.65));const localX=nx*Math.cos(p.a)-nz*Math.sin(p.a),localZ=nx*Math.sin(p.a)+nz*Math.cos(p.a),turn=Math.min(6,1.6+power*.25)/(s.h>3?1.6:1);p.fallAxis=Math.abs(localZ)>=Math.abs(localX)?'pitch':'roll';p.vp+=localZ*turn;p.vr-=localX*turn;p.spin=clamp(p.spin+(nx+nz)*.9,-3,3);p.cooldown=.14;
 state.events.push({x:b.x,y:b.y,z:b.z,kind:p.kind,power,serial:++state.serial});if(state.events.length>12)state.events.shift();indexProp(state,p);
}
function stablePose(p,blend){const quarter=Math.PI/2;for(const key of['pitch','roll']){const target=propSpec(p).h>2&&key===p.fallAxis?Math.round((p[key]-quarter)/Math.PI)*Math.PI+quarter:Math.round(p[key]/quarter)*quarter;p[key]+=(target-p[key])*blend;}}
function land(p,city,force=false){const b=propBounds(p),y=groundHeight(p.cx,p.cz,city.id||p.mapId);if(force||p.cy-b.hy<y){p.cy=y+b.hy;setOrigin(p);}}
// Swept point against the expanded vehicle footprint catches thin poles at speed.
function swept(c,b,spec){if(!Number.isFinite(c.previousX)||Math.hypot(c.x-c.previousX,c.z-c.previousZ)>20)return null;const co=Math.cos(c.a),si=Math.sin(c.a),local=(x,z)=>({x:x*co-z*si,z:x*si+z*co}),A=local(b.x-c.previousX,b.z-c.previousZ),B=local(b.x-c.x,b.z-c.z),angle=(b.a||0)-c.a,hw=spec.w+Math.abs(Math.cos(angle))*b.w/2+Math.abs(Math.sin(angle))*b.d/2,hl=spec.l+Math.abs(Math.sin(angle))*b.w/2+Math.abs(Math.cos(angle))*b.d/2;let enter=0,leave=1;
 if(Math.abs(A.x)<=hw&&Math.abs(A.z)<=hl)return null;
 for(const [k,size]of[['x',hw],['z',hl]]){const d=B[k]-A[k];if(Math.abs(d)<1e-8){if(Math.abs(A[k])>size)return null;continue;}let n=(-size-A[k])/d,f=(size-A[k])/d;if(n>f)[n,f]=[f,n];enter=Math.max(enter,n);leave=Math.min(leave,f);if(enter>leave)return null;}if(enter<0||enter>1)return null;const speed=Math.hypot(c.vx||0,c.vz||0);return speed>.01?{x:c.vx/speed,z:c.vz/speed,depth:Math.hypot(c.x-c.previousX,c.z-c.previousZ)*(1-enter)}:null;
}
export function hitStreetVehicle(state,c,dt){let strongest=null;const spec=vehicleSpec(c),travel=Number.isFinite(c.previousX)?Math.hypot(c.x-c.previousX,c.z-c.previousZ):0;
 for(const p of nearby(state,c.x,c.z,5+Math.min(travel,20))){if(p.cooldown>0)continue;const s=propSpec(p),b=body(p);if((c.y||0)+2.4<b.y||c.y>b.y+b.h+.3)continue;const hit=swept(c,b,spec)||contact({...c,w:spec.w*2,d:spec.l*2},b);if(!hit)continue;const closing=(c.vx-(p.vx||0))*hit.x+(c.vz-(p.vz||0))*hit.z;
  if(closing<=.1)continue;
  if(closing>=s.breakSpeed||p.broken){wake(state,p,hit.x,hit.z,Math.min(18,closing*.78));const loss=clamp(s.mass/(spec.mass*1300)*closing*1.3,0,3.5);c.vx-=hit.x*loss;c.vz-=hit.z*loss;const damage=closing*Math.min(.65,.12+s.mass/260);if(!strongest||damage>strongest.power)strongest={power:damage,nx:-hit.x,nz:-hit.z,p};}
  else{c.x-=hit.x*(hit.depth+.002);c.z-=hit.z*(hit.depth+.002);c.vx-=hit.x*closing;c.vz-=hit.z*closing;}
  c.speed=c.vx*Math.sin(c.a)+c.vz*Math.cos(c.a);
 }
 return strongest;
}
export function blastStreet(state,at,power=23,canSee=()=>true){for(const p of nearby(state,at.x,at.z,13)){const b=propBounds(p),d=Math.hypot(b.x-at.x,b.z-at.z);if(d>=13||!canSee(at,p))continue;const f=(1-d/13)*power;if(f<propSpec(p).breakSpeed)continue;wake(state,p,(b.x-at.x)/(d||1),(b.z-at.z)/(d||1),Math.min(18,f));}}
export function stepStreet(state,dt){dt=Math.min(dt,1/30);for(const p of state.props)if(p.cooldown>0)p.cooldown-=dt;
 for(const p of [...state.active]){const s=propSpec(p);p.age+=dt;p.vy-=9.81*dt;p.cx+=p.vx*dt;p.cy+=p.vy*dt;p.cz+=p.vz*dt;p.pitch+=p.vp*dt;p.roll+=p.vr*dt;p.a+=p.spin*dt;setOrigin(p);let b=propBounds(p),ground=groundHeight(p.cx,p.cz,state.city.id||p.mapId),touch=p.cy-b.hy<=ground+.025;
  if(touch){p.cy=ground+b.hy;if(p.vy<0)p.vy=Math.abs(p.vy)<.7?0:-p.vy*s.restitution;const drag=Math.exp(-dt*s.friction*5);p.vx*=drag;p.vz*=drag;p.vp*=Math.exp(-dt*3);p.vr*=Math.exp(-dt*3);p.spin*=Math.exp(-dt*3);if(Math.hypot(p.vx,p.vz)<1.6){stablePose(p,Math.min(1,dt*6));}setOrigin(p);land(p,state.city);}
  // Debris collides with buildings and retaining walls, so it cannot slide through a facade.
  b=propBounds(p);for(const wall of queryStatic(state.city.buildings||[],b.x-b.hx,b.z-b.hz,b.x+b.hx,b.z+b.hz)){if(Math.abs(b.x-wall.x)>b.hx+Math.max(wall.w,wall.d)/2+1||Math.abs(b.z-wall.z)>b.hz+Math.max(wall.w,wall.d)/2+1)continue;const base=groundHeight(wall.x,wall.z,state.city.id);if(b.y-b.hy>base+(wall.h||1))continue;const hit=contact({x:b.x,z:b.z,a:0,w:b.hx*2,d:b.hz*2},wall);if(!hit)continue;p.cx-=hit.x*(hit.depth+.002);p.cz-=hit.z*(hit.depth+.002);const into=p.vx*hit.x+p.vz*hit.z;if(into>0){p.vx-=hit.x*into*1.2;p.vz-=hit.z*into*1.2;p.vp*=.65;p.vr*=.65;}setOrigin(p);b=propBounds(p);}
  p.cx=clamp(p.cx,-231,231);p.cz=clamp(p.cz,-231,231);setOrigin(p);land(p,state.city);indexProp(state,p);
  if(touch&&Math.hypot(p.vx,p.vz,p.vy)<.22&&Math.abs(p.vp)+Math.abs(p.vr)+Math.abs(p.spin)<.18)p.quiet+=dt;else p.quiet=0;
  if(p.quiet>.6||p.age>12){stablePose(p,1);land(p,state.city,true);rest(state,p);}
 }
}
export function personStreetContact(state,person){let struck=null;
 for(const p of nearby(state,person.x,person.z,4)){const b=body(p),s=propSpec(p);if(person.y>b.y+b.h+.25||(person.y||0)+1.7<b.y)continue;const co=Math.cos(b.a||0),si=Math.sin(b.a||0),dx=person.x-b.x,dz=person.z-b.z,x=dx*co-dz*si,z=dx*si+dz*co,qx=x-clamp(x,-b.w/2,b.w/2),qz=z-clamp(z,-b.d/2,b.d/2),d=Math.hypot(qx,qz);if(d>=.3)continue;let nx,nz,depth;if(d>.001){nx=qx/d;nz=qz/d;depth=.3-d;}else{const wx=b.w/2+.3-Math.abs(x),wz=b.d/2+.3-Math.abs(z);if(wx<wz){nx=Math.sign(x)||1;nz=0;depth=wx;}else{nx=0;nz=Math.sign(z)||1;depth=wz;}}const X=nx*co+nz*si,Z=nz*co-nx*si;
  if(!p.active&&s.mass<30&&Math.hypot(person.vx||0,person.vz||0)>1&&p.cooldown<=0){wake(state,p,-X,-Z,.85);continue;}
  person.x+=X*depth;person.z+=Z*depth;const speed=Math.hypot(p.vx,p.vz);if(p.active&&speed>3.5&&!person.contactCooldown){person.knockVX=X*Math.min(6,speed*.5);person.knockVZ=Z*Math.min(6,speed*.5);person.stun=speed>7?1.2:.4;person.knockdown=speed>7?1.2:0;person.contactCooldown=1;struck=p;}
 }return struck;
}
