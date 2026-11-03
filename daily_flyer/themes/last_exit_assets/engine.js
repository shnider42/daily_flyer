// LAST EXIT: deterministic, browser-independent driving simulation.
export const ROADS = [-216,-144,-72,0,72,144,216];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function random(seed=78){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
export function makeCity(){
 const rnd=random(), buildings=[], palms=[];
 for(let ix=0;ix<6;ix++)for(let iz=0;iz<6;iz++){
  const x=ROADS[ix]+36,z=ROADS[iz]+36;
  // The waterfront district has low warehouses; downtown has taller towers.
  const downtown=ix<3&&iz<3;
  for(let a=-1;a<=1;a+=2)for(let b=-1;b<=1;b+=2){
   if(ix===5&&iz===4&&a===1)continue;
   buildings.push({x:x+a*11.5,z:z+b*11.5,w:16+rnd()*3,d:16+rnd()*3,h:downtown?18+rnd()*28:8+rnd()*14,color:Math.floor(rnd()*6),sign:rnd()>.65,style:ix<3?'brick':'stucco'});
  }
  for(let k=0;k<(ix>3?3:0);k++)palms.push({x:ROADS[ix]+15,z:ROADS[iz]+20+k*15,h:8+rnd()*3});
 }
 return{buildings,palms};
}
export const JOBS=[
 {id:'free',name:'Free drive',tag:'NO CLOCK. NO PRESSURE.',desc:'Get to know Port Meridian. Find your line, throw the tail out, and take the long way home.',time:0,targets:[]},
 {id:'pickup',name:'The pickup',tag:'01 / FIRST NIGHT',desc:'A contact is waiting at the motel. Pick them up, shake the tail, and get to the waterfront garage.',time:180,targets:[{x:72,z:72,label:'Pick up at the motel',stop:true},{x:216,z:-144,label:'Reach the waterfront garage',stop:true}]},
 {id:'heat',name:'Heat check',tag:'02 / LOSE THE TAIL',desc:'Two cruisers have your number. Break their line of sight, stay out of view, and get back to the garage.',time:150,targets:[{x:-144,z:-144,label:'Lose the police, then reach the garage',stop:true}]},
 {id:'courier',name:'Last delivery',tag:'03 / AGAINST THE CLOCK',desc:'Four checkpoints across the city. Keep moving, watch the traffic, and bring the car home in one piece.',time:110,targets:[{x:144,z:144,label:'Checkpoint 1 · Coast Road'},{x:144,z:-144,label:'Checkpoint 2 · Marina'},{x:-144,z:-144,label:'Checkpoint 3 · Downtown'},{x:-144,z:72,label:'Checkpoint 4 · Old Quarter'}]}
];
export function makeCar(x=5.7,z=174,a=Math.PI){return{x,z,a,vx:0,vz:0,speed:0,steer:0,damage:0,panelDamage:{front:0,rear:0,left:0,right:0},lastImpact:null,hit:0,slip:0,distance:0,top:0};}
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
export function boxContact(a,b,aw=1.1,al=2.65,bw=1.1,bl=2.65){
 const aa=a.a||0,ba=b.a||0,ar=[Math.cos(aa),-Math.sin(aa)],af=[Math.sin(aa),Math.cos(aa)],br=[Math.cos(ba),-Math.sin(ba)],bf=[Math.sin(ba),Math.cos(ba)],delta=[a.x-b.x,a.z-b.z];let depth=Infinity,normal=null;
 for(const axis of[ar,af,br,bf]){const dot=(v,w)=>v[0]*w[0]+v[1]*w[1],ra=aw*Math.abs(dot(ar,axis))+al*Math.abs(dot(af,axis)),rb=bw*Math.abs(dot(br,axis))+bl*Math.abs(dot(bf,axis)),d=dot(delta,axis),overlap=ra+rb-Math.abs(d);if(overlap<=0)return null;if(overlap<depth){depth=overlap;const sign=d<0?-1:1;normal={x:axis[0]*sign,z:axis[1]*sign};}}
 return{...normal,depth};
}
export function applyDamage(c,power,nx,nz){
 if(power<=3||c.hit>0)return false;
 const amount=power*.72;c.damage=clamp((c.damage||0)+amount,0,100);c.panelDamage??={front:0,rear:0,left:0,right:0};
 const localX=-nx*Math.cos(c.a)+nz*Math.sin(c.a),localZ=-nx*Math.sin(c.a)-nz*Math.cos(c.a),side=Math.abs(localZ)>Math.abs(localX)?(localZ>0?'front':'rear'):(localX>0?'right':'left');
 c.panelDamage[side]=clamp(c.panelDamage[side]+amount*2.1,0,100);c.hit=.38;
 c.lastImpact={x:c.x-nx*1.7,z:c.z-nz*1.7,nx,nz,power,side,serial:(c.lastImpact?.serial||0)+1};return true;
}
export function collideVehicle(c,buildings){
 let strongest=0;
 for(const b of buildings){if(Math.abs(c.x-b.x)>b.w/2+3||Math.abs(c.z-b.z)>b.d/2+3)continue;const contact=boxContact(c,{...b,a:0},1.1,2.65,b.w/2,b.d/2);if(!contact)continue;const {x:nx,z:nz,depth}=contact;c.x+=nx*(depth+.002);c.z+=nz*(depth+.002);const inward=c.vx*nx+c.vz*nz;if(inward<0){const power=-inward;c.vx-=inward*1.12*nx;c.vz-=inward*1.12*nz;applyDamage(c,power,nx,nz);strongest=Math.max(strongest,power);}}
 for(const key of['x','z'])if(Math.abs(c[key])>232.3){const sign=Math.sign(c[key]),vk=key==='x'?'vx':'vz';c[key]=sign*232.3;const power=Math.abs(c[vk]);applyDamage(c,power,key==='x'?-sign:0,key==='z'?-sign:0);c[vk]*=-.12;strongest=Math.max(strongest,power);}
 return strongest;
}
// Retract the chase camera along its ray instead of teleporting overhead.
export function safeCamera(actor,eye,buildings){
 let fraction=1;
 for(const b of buildings){let lo=0,hi=1;for(const [k,j,size]of[['x',0,'w'],['z',2,'d']]){const delta=eye[j]-actor[k],min=b[k]-b[size]/2-.55,max=b[k]+b[size]/2+.55;if(Math.abs(delta)<1e-7){if(actor[k]<min||actor[k]>max){lo=2;break;}}else{let near=(min-actor[k])/delta,far=(max-actor[k])/delta;if(near>far)[near,far]=[far,near];lo=Math.max(lo,near);hi=Math.min(hi,far);}}if(lo<=hi&&lo>=0&&lo<1)fraction=Math.min(fraction,Math.max(0,lo-.025));}
 return[actor.x+(eye[0]-actor.x)*fraction,eye[1],actor.z+(eye[2]-actor.z)*fraction];
}
export function stepCar(c,input,dt,buildings,handling='street'){
 dt=clamp(dt,0,1/30);c.hit=Math.max(0,c.hit-dt);
 const fx=Math.sin(c.a),fz=Math.cos(c.a),rx=Math.cos(c.a),rz=-Math.sin(c.a);
 let forward=c.vx*fx+c.vz*fz,side=c.vx*rx+c.vz*rz;
 c.steer+=(clamp(input.steer||0,-1,1)-c.steer)*Math.min(1,dt*8);
 const brake=clamp(input.brake||0,0,1),gas=clamp(input.gas||0,0,1),hb=!!input.handbrake;
 let acc=gas*(c.damage>=100?0:forward<-.8?22:13.8*Math.max(.4,1-c.damage*.004))-brake*(forward>.8?25:7.8);
 if(!gas&&!brake){acc-=Math.sign(forward)*Math.min(Math.abs(forward)/dt,1.25);}
 forward=clamp(forward+(acc-forward*Math.abs(forward)*.006)*dt,-10,44);
 if(hb)forward*=Math.exp(-dt*1.05);
 const traction=hb?1.25:handling==='raw'?4.2:7;
 side*=Math.exp(-dt*traction);
 // Steering authority drops with speed. Handbrake releases rear grip.
 const authority=(1.9/(1+Math.abs(forward)*.055))*(hb?1.7:1);
 const turn=c.steer*authority*clamp(forward/8,-1,1);
 // Positive input means screen-right; our forward basis is sin(a), cos(a).
 c.a=angle(c.a-turn*dt);
 c.vx=fx*forward+rx*side;c.vz=fz*forward+rz*side;
 c.x+=c.vx*dt;c.z+=c.vz*dt;
 const hit=collideVehicle(c,buildings);
 c.speed=c.vx*Math.sin(c.a)+c.vz*Math.cos(c.a);
 c.slip=Math.abs(c.vx*Math.cos(c.a)-c.vz*Math.sin(c.a));
 c.distance+=Math.hypot(c.vx,c.vz)*dt;c.top=Math.max(c.top,Math.abs(c.speed)*2.237);
 return hit;
}
const nearest=v=>ROADS.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);
export function nearestRoad(p){const x=nearest(p.x),z=nearest(p.z);return Math.abs(x-p.x)<Math.abs(z-p.z)?{x,z:clamp(p.z,-216,216)}:{x:clamp(p.x,-216,216),z};}
export function resetCar(c){const p=nearestRoad(c);c.x=p.x;c.z=p.z;c.vx=0;c.vz=0;c.a=Math.abs(p.x-nearest(p.x))<.1?Math.PI:Math.PI/2;c.hit=1;}
function segmentBox(a,b,box){let lo=0,hi=1;for(const [k,s]of[['x','w'],['z','d']]){const d=b[k]-a[k],min=box[k]-box[s]/2,max=box[k]+box[s]/2;if(Math.abs(d)<1e-6){if(a[k]<min||a[k]>max)return false;}else{let t1=(min-a[k])/d,t2=(max-a[k])/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}}return true;}
export function visible(a,b,buildings){return !buildings.some(v=>segmentBox(a,b,v));}
export class Game{
 constructor(city=makeCity()){this.city=city;this.rnd=random(101);this.start('free');}
 start(id,handling='street'){
  this.job=JOBS.find(j=>j.id===id)||JOBS[0];this.handling=handling;this.car=makeCar();this.car.kind='sedan';this.car.paint='#898c90';this.car.name='Regent sedan';this.onFoot=false;this.person={x:0,z:0,a:Math.PI,walk:0,speed:0};this.walkHeading=Math.PI;this.door=null;this.walkDistance=0;this.elapsed=0;this.time=this.job.time;this.stage=0;this.heat=0;this.hidden=0;this.busted=0;this.hold=0;this.done=null;this.message='';this.messageTime=0;this.cops=[];this.traffic=[];this.parked=[{...makeCar(11.3,159,Math.PI),kind:'coupe',paint:'#784137',name:'Marlow coupe'},{...makeCar(-11.3,183,0),kind:'wagon',paint:'#65735b',name:'Estate wagon'},{...makeCar(83.3,39,Math.PI),kind:'sedan',paint:'#8b8673',name:'Regent sedan'},{...makeCar(155.3,-107,Math.PI),kind:'coupe',paint:'#425b71',name:'Marlow coupe'}];this.skids=[];this.resetCount=0;
  for(let i=0;i<22;i++){let r=ROADS[i%7],vertical=i%2===0,dir=i%3===0?-1:1;let v={kind:['sedan','coupe','wagon'][i%3],paint:['#858477','#6c8b87','#7e4036','#b5a57a','#53637a'][i%5],x:vertical?r-dir*5.4:-210+this.rnd()*420,z:vertical?-210+this.rnd()*420:r+dir*5.4,a:vertical?(dir===1?0:Math.PI):(dir===1?Math.PI/2:-Math.PI/2),speed:8+this.rnd()*5,vertical,dir,color:i%5,hit:0};if(dist(v,this.car)<20)v.z-=40;this.traffic.push(v);}
  if(id==='heat')this.raiseHeat(2);
 }
 say(m){this.message=m;this.messageTime=5;}
 get actor(){return this.onFoot?this.person:this.car;}
 nearbyCar(){return [this.car,...this.parked].filter(c=>dist(c,this.person)<5.4&&visible(c,this.person,this.city.buildings)).sort((a,b)=>dist(a,this.person)-dist(b,this.person))[0]||null;}
 interact(){
  if(this.done)return false;
  if(!this.onFoot){
   if(Math.hypot(this.car.vx,this.car.vz)>1.5){this.say('Stop the car before getting out.');return false;}
   const c=this.car,side=[Math.cos(c.a),-Math.sin(c.a)];
   for(const sign of[1,-1]){
    const candidate={x:c.x+side[0]*2.25*sign,z:c.z+side[1]*2.25*sign,vx:0,vz:0};const initial={...candidate};collide(candidate,this.city.buildings,.45);
    const blocked=[...this.parked,...this.traffic].some(v=>dist(v,candidate)<2.2);
    if(dist(initial,candidate)>.2||blocked||!visible(c,candidate,this.city.buildings))continue;
    c.vx=c.vz=c.speed=0;this.onFoot=true;this.person={x:candidate.x,z:candidate.z,a:c.a,walk:0,speed:0};this.walkHeading=c.a;this.door={car:c,side:sign,time:.8};this.say('ON FOOT · Move with the left stick. Find a parked car.');return true;
   }
   this.say('The doors are blocked. Move away from the wall.');return false;
  }
  const next=this.nearbyCar();if(!next){this.say('Move closer to a parked car to get in.');return false;}
  if(next!==this.car){this.parked=this.parked.filter(c=>c!==next);this.parked.push(this.car);this.car=next;}
  this.car.vx=this.car.vz=this.car.speed=0;this.onFoot=false;this.door=null;this.say('IN VEHICLE · '+(this.car.name||'Sedan'));return true;
 }
 stepPerson(input,dt){
  const p=this.person,h=Number.isFinite(input.viewHeading)?input.viewHeading:this.walkHeading;
  let right=clamp(input.moveX||0,-1,1),forward=clamp(input.moveY||0,-1,1),len=Math.hypot(right,forward);if(len>1){right/=len;forward/=len;}
  const speed=input.run?5.7:3.1,vx=(-Math.cos(h)*right+Math.sin(h)*forward)*speed,vz=(Math.sin(h)*right+Math.cos(h)*forward)*speed;
  const before={x:p.x,z:p.z};p.x+=vx*dt;p.z+=vz*dt;p.vx=vx;p.vz=vz;collide(p,this.city.buildings,.45);
  for(const c of[this.car,...this.parked]){const dx=p.x-c.x,dz=p.z-c.z,co=Math.cos(c.a),si=Math.sin(c.a),lx=dx*co-dz*si,lz=dx*si+dz*co;const qx=clamp(lx,-1.35,1.35),qz=clamp(lz,-2.9,2.9),d=Math.hypot(lx-qx,lz-qz);if(d<.48){let nx,nz;if(d<.001){if(1.35-Math.abs(lx)<2.9-Math.abs(lz)){nx=Math.sign(lx)||1;nz=0;}else{nx=0;nz=Math.sign(lz)||1;}}else{nx=(lx-qx)/d;nz=(lz-qz)/d;}p.x+=(nx*co+nz*si)*(.48-d);p.z+=(nz*co-nx*si)*(.48-d);}}
  p.speed=dist(before,p)/dt;this.walkDistance+=dist(before,p);if(p.speed>.05){p.a=angle(p.a+angle(Math.atan2(vx,vz)-p.a)*Math.min(1,dt*12));p.walk+=p.speed*dt*3;}
 }

 raiseHeat(n=2){this.heat=n;this.hidden=0;if(!this.cops.length){for(let i=0;i<n;i++)this.cops.push({x:i===0?0:72,z:i===0?216:216,a:Math.PI,speed:0,goal:null,last:{x:this.car.x,z:this.car.z},seen:true});}this.say('DISPATCH · Units are on your tail. Break line of sight.');}
 get target(){return this.job.targets[this.stage]||null;}
 recover(){if(this.onFoot){this.onFoot=false;this.interact();this.say('Returned to your car.');return;}resetCar(this.car);this.resetCount++;if(this.job.id==='free'){this.car.damage=0;this.car.panelDamage={front:0,rear:0,left:0,right:0};this.car.lastImpact=null;}else this.time=Math.max(0,this.time-8);this.say(this.job.id==='free'?'Back on the road. Car repaired.':'Back on the road. 8-second recovery penalty.');}
 tick(dt,input={}){
  if(this.done)return;dt=clamp(dt,0,1/30);this.elapsed+=dt;this.messageTime=Math.max(0,this.messageTime-dt);if(this.door){this.door.time-=dt;if(this.door.time<=0)this.door=null;}
  const c=this.car;if(this.onFoot)this.stepPerson(input,dt);const hit=this.onFoot?0:stepCar(c,input,dt,this.city.buildings,this.handling);this.impact=hit;const actor=this.actor;
  if(hit>8&&this.job.id==='free'&&!this.heat)this.say('Bent the fender? R or Recover puts you back on the road.');
  for(const t of this.traffic){t.hit=Math.max(0,t.hit-dt);const sp=(this.onFoot&&dist(t,this.person)<9)?0:t.hit?2:t.speed;if(t.vertical)t.z+=t.dir*sp*dt;else t.x+=t.dir*sp*dt;if(Math.abs(t.x)>231)t.x=-Math.sign(t.x)*230;if(Math.abs(t.z)>231)t.z=-Math.sign(t.z)*230;this.carCollision(t,dt);}
  if(c.slip>2&&Math.abs(c.speed)>5&&this.elapsed%0.065<dt){this.skids.push({x:c.x,z:c.z,a:c.a,t:0});if(this.skids.length>180)this.skids.shift();}
  for(const v of this.parked){v.hit=Math.max(0,v.hit-dt);this.carCollision(v,dt);}
  for(const s of this.skids)s.t+=dt;
  let spotted=false;
  for(const p of this.cops){
   p.seen=dist(p,actor)<100&&visible(p,actor,this.city.buildings);if(p.seen){p.last={x:actor.x,z:actor.z};spotted=true;}
   // Pursuers navigate the same road graph. They cannot cross buildings.
   if(!p.goal||dist(p,p.goal)<3.2){
    const gx=nearest(p.x),gz=nearest(p.z),opts=[];
    for(const [dx,dz]of[[72,0],[-72,0],[0,72],[0,-72]])if(Math.abs(gx+dx)<=216&&Math.abs(gz+dz)<=216)opts.push({x:gx+dx,z:gz+dz});
    opts.sort((a,b)=>dist(a,p.last)-dist(b,p.last));p.goal=opts[0]||{x:gx,z:gz};
    if(dist(p,actor)<48&&p.seen&&visible(p,actor,this.city.buildings))p.goal={x:actor.x,z:actor.z};
   }
   let desired=Math.atan2(p.goal.x-p.x,p.goal.z-p.z),delta=angle(desired-p.a);p.a=angle(p.a+clamp(delta,-dt*2.2,dt*2.2));
   const speed=this.onFoot&&dist(p,actor)<6?0:Math.abs(delta)>0.8?9:(p.seen?27:19);p.speed+=(speed-p.speed)*dt*2;
   p.x+=Math.sin(p.a)*p.speed*dt;p.z+=Math.cos(p.a)*p.speed*dt;
   const pc={...p,vx:Math.sin(p.a)*p.speed,vz:Math.cos(p.a)*p.speed};if(collide(pc,this.city.buildings)>0){p.x=pc.x;p.z=pc.z;p.goal={x:nearest(p.x),z:nearest(p.z)};p.speed=5;}
   this.carCollision(p,dt);
  }
  if(this.heat){
   this.hidden=spotted?0:this.hidden+dt;
   if(this.hidden>8){this.heat=0;this.cops=[];this.say('DISPATCH · They lost you. Keep it clean.');}
   const close=this.cops.some(p=>dist(p,actor)<7);this.busted=close&&(this.onFoot||Math.abs(c.speed)<2)?this.busted+dt:Math.max(0,this.busted-dt*2);
   if(this.busted>=5)this.finish(false,'Boxed in.');
  }
  if(this.job.id!=='free'){
   this.time=Math.max(0,this.time-dt);if(this.time<=0)this.finish(false,'Out of time.');if(c.damage>=100)this.finish(false,'The car is finished.');
   const target=this.target;
   if(target&&!this.onFoot&&dist(c,target)<10){
    if(target.stop&&Math.abs(c.speed)>2.5)this.say('Ease off. Stop inside the marker.');
    else if(this.heat&&this.stage===this.job.targets.length-1)this.say('Lose the tail before leading them to the garage.');
    else{this.hold+=dt;if(this.hold>(target.stop?.7:.04)){this.stage++;this.hold=0;if(this.stage>=this.job.targets.length)this.finish(true,'Job complete.');else{if(this.job.id==='pickup')this.raiseHeat(2);this.say(this.job.id==='pickup'?'CONTACT · Go, go! Lose them and head to the garage.':'Checkpoint cleared. Keep moving.');}}}
   }else this.hold=0;
  }else if(c.damage>=100){c.vx*=Math.exp(-dt*2);c.vz*=Math.exp(-dt*2);if(!this.onFoot)this.say('ENGINE DISABLED · Get out, change cars, or Recover to repair.');}
 }
 carCollision(t,dt){
  if(this.onFoot)return;const c=this.car;if(dist(c,t)>6)return;const contact=boxContact(c,t);if(!contact)return;
  const {x:nx,z:nz,depth}=contact;c.x+=nx*(depth+.002);c.z+=nz*(depth+.002);
  const tvx=Math.sin(t.a)*(t.hit?0:t.speed||0),tvz=Math.cos(t.a)*(t.hit?0:t.speed||0),impact=-((c.vx-tvx)*nx+(c.vz-tvz)*nz);
  if(impact>0){c.vx+=nx*impact*.95;c.vz+=nz*impact*.95;if(applyDamage(c,impact,nx,nz)){this.impact=impact;applyDamage(t,impact,-nx,-nz);t.hit=1;if(this.job.id==='free'&&impact>12&&!this.heat)this.raiseHeat(1);}}
 }
 finish(win,reason){if(!this.done)this.done={win,reason,elapsed:this.elapsed,distance:this.car.distance,top:this.car.top,damage:this.car.damage};}
}
