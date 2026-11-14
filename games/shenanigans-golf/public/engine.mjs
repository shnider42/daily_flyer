import { HOLES, obstaclePose } from './holes.mjs';

export const COLORS = ['#f5c65b','#6fc9df','#f08d8c','#b1a0e6'];
export const MAX_STROKES = 12;
export const HOLE_SECONDS = 150;
export const BALL_RADIUS = .22;
export const MAX_SHOT_SPEED = 18;
const STEP = 1/120, BASE_FRICTION = 2.7;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const inside=(p,r,pad=0)=>Math.abs(p.x-r.x)<=r.w/2+pad&&Math.abs(p.z-r.z)<=r.d/2+pad;
const supported=(hole,p,pad=0)=>hole.platforms.some(r=>inside(p,r,pad));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clone=v=>JSON.parse(JSON.stringify(v));
let gameCounter=0;

function ballAt(point) {
  return {x:point.x,y:BALL_RADIUS,z:point.z,vx:0,vy:0,vz:0,moving:false,holed:false,
    safe:{x:point.x,z:point.z},locks:[],portalUntil:0,penaltyTime:0,flightTime:0,rollTime:0};
}
function hitVelocity(ball,nx,nz,restitution=.78,ovx=0,ovz=0,kick=0) {
  const rel=(ball.vx-ovx)*nx+(ball.vz-ovz)*nz;
  if(rel<0) { ball.vx-=(1+restitution)*rel*nx; ball.vz-=(1+restitution)*rel*nz; }
  if(kick) {ball.vx+=nx*kick;ball.vz+=nz*kick;}
  const speed=Math.hypot(ball.vx,ball.vz);
  if(speed>24){ball.vx*=24/speed;ball.vz*=24/speed;}
}
function collideSegment(ball,rail) {
  const dx=rail.bx-rail.ax,dz=rail.bz-rail.az,den=dx*dx+dz*dz;
  const t=den?clamp(((ball.x-rail.ax)*dx+(ball.z-rail.az)*dz)/den,0,1):0;
  const qx=rail.ax+t*dx,qz=rail.az+t*dz;
  let nx=ball.x-qx,nz=ball.z-qz,d=Math.hypot(nx,nz);
  const r=BALL_RADIUS+.07;
  if(d>=r)return false;
  if(d<1e-7){const m=Math.hypot(dx,dz)||1;nx=-dz/m;nz=dx/m;d=0;}else{nx/=d;nz/=d;}
  ball.x+=nx*(r-d+.001);ball.z+=nz*(r-d+.001);
  hitVelocity(ball,nx,nz,.78);
  return true;
}
function collideObstacle(ball,o,time) {
  if(ball.y-BALL_RADIUS>(o.height??.8))return false;
  const pose=obstaclePose(o,time),dx=ball.x-pose.x,dz=ball.z-pose.z;
  let nx=0,nz=0,penetration=0;
  if(o.type==='post'||o.type==='bumper') {
    const d=Math.hypot(dx,dz),r=(o.r||1)+BALL_RADIUS;
    if(d>=r)return false;
    nx=d>1e-8?dx/d:1;nz=d>1e-8?dz/d:0;penetration=r-d;
  } else {
    const c=Math.cos(pose.angle),s=Math.sin(pose.angle),lx=dx*c+dz*s,lz=-dx*s+dz*c;
    const hw=(o.w||4)/2,hd=(o.d||.6)/2;
    const cx=clamp(lx,-hw,hw),cz=clamp(lz,-hd,hd);
    let ax=lx-cx,az=lz-cz,d=Math.hypot(ax,az);
    if(d>=BALL_RADIUS)return false;
    if(d>1e-8){ax/=d;az/=d;penetration=BALL_RADIUS-d;}
    else if(hw-Math.abs(lx)<hd-Math.abs(lz)){ax=lx>=0?1:-1;az=0;penetration=BALL_RADIUS+hw-Math.abs(lx);}
    else {ax=0;az=lz>=0?1:-1;penetration=BALL_RADIUS+hd-Math.abs(lz);}
    nx=ax*c-az*s;nz=ax*s+az*c;
  }
  ball.x+=nx*(penetration+.002);ball.z+=nz*(penetration+.002);
  let ovx=0,ovz=0;
  if(o.type==='gate'){
    const speed=(o.speed||0)*(o.travel||0)*Math.cos(time*(o.speed||0)+(o.phase||0));
    if(o.axis==='z')ovz=speed;else ovx=speed;
  }else if(o.type==='spinner'||o.type==='windmill'){ovx=-(o.speed||0)*dz;ovz=(o.speed||0)*dx;}
  hitVelocity(ball,nx,nz,o.type==='bumper'?1.05:.78,ovx,ovz,o.type==='bumper'?2.2:0);
  return true;
}
function groundHeight(hole,ball){
  let height=0;
  for(const z of hole.zones) if(z.type==='ramp'&&inside(ball,z)) {
    const along=(ball.x-z.x)*Math.sin(z.angle||0)-(ball.z-z.z)*Math.cos(z.angle||0);
    height=Math.max(height,(z.height||.6)*clamp(along/z.d+.5,0,1));
  }
  return height;
}
function penalty(ball,kind='water') {
  ball.vx=ball.vy=ball.vz=0;ball.y=-.25;ball.penaltyTime=.62;ball.moving=true;
  return {kind,penalty:true};
}

/** A single small physical step, used unchanged by gameplay and CPU forecasts. */
function stepBall(ball,hole,time,dt) {
  if(ball.holed)return null;
  if(ball.penaltyTime>0){
    ball.penaltyTime-=dt;
    if(ball.penaltyTime<=0){ball.x=ball.safe.x;ball.z=ball.safe.z;ball.y=BALL_RADIUS;ball.vx=ball.vy=ball.vz=0;ball.moving=false;ball.rollTime=0;ball.locks=[];}
    return null;
  }
  const wasMoving=ball.moving,oldX=ball.x,oldZ=ball.z,oldY=ball.y;
  const floor=groundHeight(hole,ball)+BALL_RADIUS;
  const onGround=supported(hole,ball,.05)&&ball.y<=floor+.035&&ball.vy<=.05;
  let friction=BASE_FRICTION,ax=0,az=0;
  if(wasMoving&&onGround)for(const z of hole.zones)if(inside(ball,z)){
    if(z.type==='ice')friction=.65;
    if(z.type==='sand')friction=8.2;
    if(z.type==='conveyor'||z.type==='wind'){ax+=Math.sin(z.angle||0)*(z.strength||2);az-=Math.cos(z.angle||0)*(z.strength||2);}
    if(z.type==='magnet'){
      const dx=z.x-ball.x,dz=z.z-ball.z,d=Math.hypot(dx,dz);
      if(d>.01){const strength=(z.strength||4)*clamp(d/2,.15,1);ax+=dx/d*strength;az+=dz/d*strength;}
    }
  }
  if(wasMoving) {
    const speed=Math.hypot(ball.vx,ball.vz),deceleration=onGround?friction:.055;
    const after=Math.max(0,speed-deceleration*dt);
    if(speed>0){ball.vx=ball.vx/speed*after;ball.vz=ball.vz/speed*after;}
    ball.vx+=ax*dt;ball.vz+=az*dt;
    ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;
    if(onGround){ball.y=floor;ball.vy=0;}
    else {ball.vy-=(hole.gravity||12)*dt;ball.y+=ball.vy*dt;}
    ball.rollTime+=dt;
  }
  let hit=false;
  if(ball.y-BALL_RADIUS<.38) for(const rail of hole.rails)hit=collideSegment(ball,rail)||hit;
  for(const o of hole.obstacles)hit=collideObstacle(ball,o,time)||hit;
  if(hit&&Math.hypot(ball.vx,ball.vz)>.09)ball.moving=true;
  // An unsupported ball falls. Airborne balls may cross gaps and land on another island.
  const afterFloor=groundHeight(hole,ball)+BALL_RADIUS;
  if(supported(hole,ball,.015)&&ball.y<afterFloor&&ball.vy<=0){
    ball.y=afterFloor;
    if(ball.vy< -2.3){ball.vy=-ball.vy*.18;ball.vx*=.93;ball.vz*=.93;}
    else ball.vy=0;
  }else if(!supported(hole,ball,.04)&&onGround){ball.vy=-.1;ball.y-=.01;ball.moving=true;}
  if(ball.y< -2.2||Math.abs(ball.x)>100||Math.abs(ball.z)>100)return penalty(ball,'water');
  ball.locks=ball.locks.filter(id=>hole.zones.some(z=>z.id===id&&inside(ball,z,.15)));
  if(ball.moving)for(const z of hole.zones) {
    if(!inside(ball,z))continue;
    if((z.type==='water'||z.type==='lava')&&ball.y<BALL_RADIUS+.13)return penalty(ball,z.type);
    if(z.type==='portal'&&z.to&&ball.y<.85&&time>=ball.portalUntil&&!ball.locks.includes(z.id)){
      ball.x=z.to.x;ball.z=z.to.z;ball.y=BALL_RADIUS;ball.vy=0;ball.portalUntil=time+1;ball.locks.push(z.id);
      ball.safe={x:ball.x,z:ball.z};return {kind:'portal'};
    }
    if(z.type==='boost'&&onGround&&!ball.locks.includes(z.id)){
      const speed=Math.max(Math.hypot(ball.vx,ball.vz),z.strength||10);
      ball.vx=Math.sin(z.angle||0)*speed;ball.vz=-Math.cos(z.angle||0)*speed;ball.locks.push(z.id);
    }
    if(z.type==='ramp'&&!ball.locks.includes(z.id)&&onGround){
      const sx=Math.sin(z.angle||0),sz=-Math.cos(z.angle||0),along=(ball.x-z.x)*sx+(ball.z-z.z)*sz;
      if(along>z.d*.18&&ball.vx*sx+ball.vz*sz>1.2){
        const speed=Math.max(7.5,Math.hypot(ball.vx,ball.vz));
        ball.vx=sx*speed;ball.vz=sz*speed;ball.vy=z.strength||5.2;ball.y=BALL_RADIUS+(z.height||.6);ball.locks.push(z.id);
      }
    }
  }
  const speed=Math.hypot(ball.vx,ball.vz);
  if(ball.y<.65&&ball.vy<=.3&&speed<5.2){
    const dx=ball.x-oldX,dz=ball.z-oldZ,den=dx*dx+dz*dz;
    const t=den?clamp(((hole.cup.x-oldX)*dx+(hole.cup.z-oldZ)*dz)/den,0,1):0;
    const nearest=Math.hypot(oldX+dx*t-hole.cup.x,oldZ+dz*t-hole.cup.z);
    if(nearest<(hole.cup.r||.48)*.86){ball.x=hole.cup.x;ball.z=hole.cup.z;ball.y=.035;ball.vx=ball.vy=ball.vz=0;ball.moving=false;ball.holed=true;return {kind:'cup'};}
    const d=distance(ball,hole.cup);
    if(d<.72&&speed<1.25&&wasMoving){ball.vx+=(hole.cup.x-ball.x)*1.4*dt;ball.vz+=(hole.cup.z-ball.z)*1.4*dt;}
  }
  if(ball.moving&&supported(hole,ball)&&ball.y<=afterFloor+.04&&Math.abs(ball.vy)<.1&&speed<.095){ball.vx=ball.vy=ball.vz=0;ball.y=afterFloor;ball.moving=false;}
  // Physical belts/spinners can trap a rolling ball. A bounded shot settles at its actual location.
  if(ball.rollTime>18&&ball.y<=afterFloor+.06){ball.vx=ball.vy=ball.vz=0;ball.moving=false;ball.rollTime=0;}
  return hit&&wasMoving&&speed>1?{kind:'hit'}:null;
}

function segmentSafe(hole,a,b) {
  const d=distance(a,b),steps=Math.max(2,Math.ceil(d/.65));
  for(let k=1;k<=steps;k++){
    const t=k/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
    if(!supported(hole,p,-.3))return false;
    for(const z of hole.zones)if((z.type==='water'||z.type==='lava')&&inside(p,z,.3))return false;
    for(const o of hole.obstacles){
      if(o.type==='gate'||o.type==='spinner'||o.type==='windmill')continue;
      if(o.type==='post'||o.type==='bumper'){if(distance(p,o)<(o.r||1)+.4)return false;}
      else {const c=Math.cos(o.angle||0),s=Math.sin(o.angle||0),dx=p.x-o.x,dz=p.z-o.z;if(Math.abs(dx*c+dz*s)<(o.w||4)/2+.35&&Math.abs(-dx*s+dz*c)<(o.d||.6)/2+.35)return false;}
    }
  }
  return true;
}

/** Forecasts are the same physics and never mutate the real ball or the score. */
export function simulateShot(hole,ball,{angle,power},time=0,maxSeconds=10) {
  const b=clone(ball);b.vx=Math.sin(angle)*power*MAX_SHOT_SPEED;b.vz=-Math.cos(angle)*power*MAX_SHOT_SPEED;
  b.vy=0;b.moving=true;b.holed=false;b.rollTime=0;b.safe={x:b.x,z:b.z};b.penaltyTime=0;
  let penaltyHit=false,portal=false;
  for(let elapsed=0;elapsed<maxSeconds;elapsed+=STEP){
    const event=stepBall(b,hole,time+elapsed,STEP);
    if(event?.penalty){penaltyHit=true;break;}
    if(event?.kind==='portal')portal=true;
    if(!b.moving||b.holed)break;
  }
  return {ball:b,penalty:penaltyHit,portal};
}
function routeTarget(hole,player) {
  const route=[...hole.waypoints,hole.cup];
  let index=clamp(player.routeIndex||0,0,route.length-1);
  for(let i=index;i<route.length-1;i++)if(distance(player.ball,route[i])<2.7)index=i+1;
  // Teleportation can skip a physical island. Start planning from the arrival island.
  if(player.teleported) {
    let nearest=index,best=Infinity;
    for(let i=index;i<route.length;i++){const d=distance(player.ball,route[i]);if(d<best){best=d;nearest=i;}}
    index=nearest;player.teleported=false;
  }
  for(let i=route.length-1;i>index;i--)if(segmentSafe(hole,player.ball,route[i])){index=i;break;}
  // A missed shortcut can leave a golfer beside a hazard. Rejoin the safe route
  // from any visible waypoint instead of repeatedly aiming through that hazard.
  if(!segmentSafe(hole,player.ball,route[index])){
    let best=Infinity;
    for(let i=0;i<route.length;i++){
      if(distance(player.ball,route[i])<2.7||!segmentSafe(hole,player.ball,route[i]))continue;
      let cost=distance(player.ball,route[i]);
      for(let j=i;j<route.length-1;j++)cost+=distance(route[j],route[j+1]);
      if(cost<best){best=cost;index=i;}
    }
  }
  player.routeIndex=index;
  return {target:route[index],index,route};
}

export function botShot(hole,player,time=0,difficulty='club',random=()=>.5) {
  const {target,index,route}=routeTarget(hole,player),b=player.ball;
  const dx=target.x-b.x,dz=target.z-b.z,dist=Math.hypot(dx,dz),angle=Math.atan2(dx,-dz);
  let friction=BASE_FRICTION;
  const middle={x:(b.x+target.x)/2,z:(b.z+target.z)/2};
  for(const z of hole.zones){if(z.type==='ice'&&inside(middle,z))friction=1.05;if(z.type==='sand'&&inside(middle,z))friction=5.4;}
  const nominal=clamp(Math.sqrt(2*friction*dist+.2)/MAX_SHOT_SPEED,.055,1);
  const offsets=[0,-.12,.12,-.32,.32];
  const powers=[...new Set([1,.82,1.2,.65,1.45].map(k=>clamp(nominal*k,.05,1)))];
  if(dist<2)powers.push(clamp((Math.sqrt(2*BASE_FRICTION*dist)+.15)/MAX_SHOT_SPEED,.05,1));
  let best={angle,power:nominal},bestCost=Infinity;
  const portalTarget=hole.zones.find(z=>z.type==='portal'&&distance(z,target)<2);
  search: for(const offset of offsets)for(const power of powers){
    const forecast=simulateShot(hole,b,{angle:angle+offset,power},time,8.5),end=forecast.ball;
    let cost=distance(end,target);
    if(end.holed)cost=-1000;
    else if(forecast.penalty)cost+=45;
    else if(forecast.portal&&portalTarget)cost=-15+distance(end,route[Math.min(index+1,route.length-1)])*.12;
    else {
      if(!segmentSafe(hole,end,target))cost+=3;
      if(end.moving)cost+=Math.hypot(end.vx,end.vz)*.65;
      cost+=power*.04;
      // Finishing beside a safe downstream waypoint is useful even after a rebound.
      for(let i=index+1;i<route.length;i++)if(segmentSafe(hole,end,route[i]))cost=Math.min(cost,distance(end,route[i])*.9+(route.length-i-1)*1.7);
    }
    if(cost<bestCost){bestCost=cost;best={angle:angle+offset,power};}
    if(end.holed)break search;
  }
  const skill=difficulty==='expert'?.025:difficulty==='casual'?.20:.08;
  const personality=player.botIndex===1?.7:player.botIndex===2?1.25:1;
  return {angle:best.angle+(random()-.5)*skill*personality,power:clamp(best.power*(1+(random()-.5)*skill*1.7*personality),.05,1)};
}

export class GolfGame {
  constructor({players=[],difficulty='club',mode='stroke',seed=123,holeIndex=0,practice=false}={}) {
    this.rng=(Number(seed)>>>0)||123;this.accumulator=0;this.eventId=0;this.practice=Boolean(practice);this.hitTimes=new Map();
    this.state={phase:'playing',holeIndex:clamp(Math.floor(Number(holeIndex)||0),0,17),time:0,holeTime:0,intermission:0,
      roundId:`local-${this.rng.toString(16)}-${++gameCounter}`,mode:mode==='points'?'points':'stroke',difficulty:['club','casual','expert'].includes(difficulty)?difficulty:'club',players:[],events:[],practice:this.practice};
    const names=['You','Birdie','Chip','Bogey'];
    for(let i=0;i<4;i++){
      const source=players[i]||{};
      this.state.players.push({id:String(source.id||`p${i+1}`),name:String(source.name||names[i]).slice(0,24),isBot:source.isBot??i>0,color:source.color||COLORS[i],botIndex:i,
        strokes:0,scores:Array(18).fill(null),points:0,ball:ballAt(HOLES[this.state.holeIndex].tee),routeIndex:0,botThinkAt:.65+i*.35,capped:false});
    }
    this.startHole();
  }
  random(){let x=this.rng;x^=x<<13;x^=x>>>17;x^=x<<5;this.rng=x>>>0;return this.rng/4294967296;}
  emit(kind,playerId,text){const e={id:++this.eventId,kind,playerId:playerId||null,text,time:this.state.time};this.state.events.push(e);if(this.state.events.length>28)this.state.events.shift();}
  startHole(){
    const s=this.state,hole=HOLES[s.holeIndex];s.phase='playing';s.holeTime=0;s.intermission=0;
    for(const p of s.players){p.ball=ballAt(hole.tee);p.strokes=0;p.routeIndex=0;p.capped=false;p.teleported=false;p.botThinkAt=s.time+.7+p.botIndex*.32;}
    this.emit('hole',null,`Hole ${hole.id}: ${hole.name}`);
  }
  shoot(playerId,shot={}) {
    const p=this.state.players.find(p=>p.id===playerId),s=this.state;
    if(!p)return {ok:false,error:'That golfer is not in this round.'};
    if(s.phase!=='playing')return {ok:false,error:'Wait for the next hole.'};
    if(p.ball.holed||p.capped)return {ok:false,error:'This hole is complete.'};
    if(p.ball.moving||p.ball.penaltyTime>0)return {ok:false,error:'Let the ball come to rest.'};
    if(!finite(shot.angle)||!finite(shot.power)||Math.abs(shot.angle)>Math.PI*1e5||shot.power<.05||shot.power>1)return {ok:false,error:'Choose a valid direction and power.'};
    if(p.strokes>=MAX_STROKES)return {ok:false,error:'The stroke limit has been reached.'};
    p.strokes++;p.ball.safe={x:p.ball.x,z:p.ball.z};p.ball.vx=Math.sin(shot.angle)*shot.power*MAX_SHOT_SPEED;p.ball.vz=-Math.cos(shot.angle)*shot.power*MAX_SHOT_SPEED;
    p.ball.vy=0;p.ball.moving=true;p.ball.rollTime=0;p.botThinkAt=s.time+1.1;
    this.emit('shot',p.id,`${p.name} · stroke ${p.strokes}`);return {ok:true};
  }
  finishPlayer(p,capped=false){
    if(p.scores[this.state.holeIndex]!==null)return;
    if(capped){p.strokes=MAX_STROKES;p.capped=true;p.ball.moving=false;p.ball.holed=true;p.ball.vx=p.ball.vy=p.ball.vz=0;}
    p.scores[this.state.holeIndex]=p.strokes;
  }
  finishHole(){
    const s=this.state,ranked=[...s.players].sort((a,b)=>a.strokes-b.strokes);
    for(let i=0;i<ranked.length;){let j=i;while(j+1<ranked.length&&ranked[j+1].strokes===ranked[i].strokes)j++;const points=4-(i+j)/2;for(let k=i;k<=j;k++)ranked[k].points+=points;i=j+1;}
    s.phase='holeComplete';s.intermission=8;this.emit('hole',null,`Hole ${s.holeIndex+1} complete`);
  }
  nextHole(){
    if(this.state.phase!=='holeComplete')return false;
    if(this.practice||this.state.holeIndex>=17){this.state.phase='finished';this.state.intermission=0;this.emit('finish',null,'The round is complete.');return true;}
    this.state.holeIndex++;this.startHole();return true;
  }
  update(dt) {
    if(!finite(dt)||dt<=0||this.state.phase==='finished')return;
    this.accumulator+=Math.min(dt,.5);
    while(this.accumulator>=STEP){this.accumulator-=STEP;this.step(STEP);}
    const s=this.state;
    if(s.phase==='playing')for(const p of s.players){
      if(p.isBot&&!p.ball.moving&&!p.ball.holed&&!p.capped&&s.time>=p.botThinkAt){
        const shot=botShot(HOLES[s.holeIndex],p,s.time,s.difficulty,()=>this.random());
        const result=this.shoot(p.id,shot);p.botThinkAt=s.time+(result.ok?1:.5)+this.random()*.5;
      }
    }
  }
  step(dt){
    const s=this.state;s.time+=dt;
    if(s.phase==='holeComplete'){s.intermission=Math.max(0,s.intermission-dt);if(s.intermission<=0)this.nextHole();return;}
    if(s.phase!=='playing')return;
    s.holeTime+=dt;const hole=HOLES[s.holeIndex];
    for(const p of s.players){
      if(p.ball.holed||p.capped)continue;
      const wasMoving=p.ball.moving,event=stepBall(p.ball,hole,s.time,dt);
      if(event?.penalty){p.strokes=Math.min(MAX_STROKES,p.strokes+1);this.emit(event.kind,p.id,`${p.name} · ${event.kind==='lava'?'lava':'hazard'}, +1 stroke`);}
      else if(event?.kind==='portal'){p.teleported=true;this.emit('portal',p.id,`${p.name} took the portal`);}
      else if(event?.kind==='cup'){this.finishPlayer(p);const diff=p.strokes-hole.par;this.emit('cup',p.id,`${p.name} · ${p.strokes===1?'hole in one':diff<=-2?'eagle':diff===-1?'birdie':diff===0?'par':`${p.strokes} strokes`}`);}
      else if(event?.kind==='hit'&&s.time-(this.hitTimes.get(p.id)||-10)>.28){this.hitTimes.set(p.id,s.time);this.emit('hit',p.id,'');}
      if(wasMoving&&!p.ball.moving)p.botThinkAt=Math.max(p.botThinkAt,s.time+.72+this.random()*.45);
      if(p.strokes>=MAX_STROKES&&!p.ball.moving)this.finishPlayer(p,true);
    }
    if(s.holeTime>=HOLE_SECONDS){for(const p of s.players)if(!p.ball.holed)this.finishPlayer(p,true);this.emit('hole',null,'Time limit · unfinished balls score 12');}
    if(s.players.every(p=>p.ball.holed||p.capped))this.finishHole();
  }
  snapshot(){return clone(this.state);}
}
