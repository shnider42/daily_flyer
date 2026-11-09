import {orientationFromPose,basisFromOrientation} from './orientation.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=(v,f=0)=>Number.isFinite(v)?v:f;
const point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const blankKick=()=>({pitch:0,yaw:0,roll:0,x:0,y:0});

// Direction belongs to the view, including an inverted cockpit or a side gun
// station. Never infer it from world north or from the aircraft's Euler roll.
export function combatDirection(source,listener,camera){
  if(!point(source)||!point(listener))return {known:false,angle:0,pan:0,label:''};
  const dx=source.x-listener.x,dy=source.y-listener.y,dz=source.z-listener.z;
  const length=Math.hypot(dx,dy,dz);if(length<.1)return {known:false,angle:0,pan:0,label:''};
  const e=camera?.matrixWorld?.elements;
  const basis=e?.length===16?{
    right:{x:e[0],y:e[1],z:e[2]},up:{x:e[4],y:e[5],z:e[6]},forward:{x:-e[8],y:-e[9],z:-e[10]},
  }:basisFromOrientation(orientationFromPose(listener));
  const dot=v=>(dx*v.x+dy*v.y+dz*v.z)/length;
  const side=dot(basis.right),above=dot(basis.up),ahead=dot(basis.forward);
  let angle=Math.atan2(side,ahead)*180/Math.PI,label;
  if(Math.abs(above)>.72&&Math.abs(above)>Math.max(Math.abs(side),Math.abs(ahead))){label=above>0?'ABOVE':'BELOW';angle=above>0?0:180;}
  else if(Math.abs(side)>.5&&Math.abs(side)>Math.abs(ahead)*.8)label=side>0?'RIGHT':'LEFT';
  else label=ahead>=0?'AHEAD':'BEHIND';
  return {known:true,angle,pan:clamp(side,-1,1),label};
}

export function explosionStrength(effect,listener){
  if(!point(effect)||!point(listener))return {intensity:0,distance:Infinity,proximity:0};
  const d=distance(effect,listener),r=clamp(number(effect.radius,60),1,3200);
  const reach=Math.max(210,r*6),size=clamp(.45+r/160,.45,1.3);
  return {intensity:clamp(size/(1+(d/reach)**1.6),0,1),distance:d,
    proximity:clamp(1-d/Math.max(150,r*5),0,1)};
}

export class CombatFeedback {
  constructor(){this.reset();}
  reset(sim){
    this.sim=sim;this.identity=sim?this._identity(sim):null;this.seenHits=new Set();this.seenEffects=new Set();
    this.age=0;this.hit=0;this.blast=0;this.noticeTime=0;this.notice=null;this.direction={known:false,angle:0,pan:0,label:''};
    this.jolt=0;this.joltAge=0;this.joltSide=1;this.cues=[];
    return this;
  }
  _identity(sim){return `${sim.multiplayer?.runId||sim.mission?.id||''}:${sim.player.id}:${sim.player.lifeId||1}`;}
  _trim(set){if(set.size>600){const keep=[...set].slice(-300);set.clear();for(const id of keep)set.add(id);}}
  _hitKey(e){return `${e.targetId}:${e.targetLifeId||1}:${e.eventId??e.id??e.damageId??e.at}`;}
  update(sim,elapsed,options={}){
    if(sim!==this.sim)this.reset(sim);
    const identity=this._identity(sim);
    if(identity!==this.identity){this.reset(sim);}
    const dt=clamp(number(elapsed),0,.2),p=sim.player,listener=options.listener||p;
    const reduced=!!options.reducedMotion,suspended=!!options.suspended;
    this.age+=dt;this.joltAge+=dt;this.hit*=Math.exp(-dt*5.8);this.blast*=Math.exp(-dt*7);
    this.jolt*=Math.exp(-dt*6.8);this.noticeTime=Math.max(0,this.noticeTime-dt);this.cues.length=0;
    const latest=sim.localParticipant?.lastDamage||p.lastDamage;
    const candidates=[...(sim.events||[]).filter(e=>e.kind==='damage'),...(latest?[latest]:[])];
    let received=null,totalDamage=0;
    for(const event of candidates){
      const key=this._hitKey(event);if(this.seenHits.has(key))continue;this.seenHits.add(key);
      if(event.targetId!==p.id||number(event.targetLifeId,1)!==number(p.lifeId,1)||number(event.damage)<=0)continue;
      // A reconnect or delayed previous-life snapshot must not replay an old hit.
      if(number(sim.time)-number(event.at,sim.time)>1.5||suspended)continue;
      totalDamage+=event.damage;
      if(!received||number(event.at)>=number(received.at))received=event;
    }
    if(received){
      const maxHealth=Math.max(1,number(received.maxHealth,sim.aircraft?.health||100));
      const strength=clamp(.3+totalDamage/maxHealth*2.4,.3,1);
      this.direction=combatDirection(received.source,p,options.camera);
      this.hit=Math.max(this.hit,strength);this.jolt=Math.max(this.jolt,strength);this.joltAge=0;
      this.joltSide=this.direction.known?(this.direction.pan<0?-1:1):(this.age%2<1?-1:1);
      this.noticeTime=1.7;this.notice={weapon:received.weapon,health:Math.max(0,number(received.health,p.health)),maxHealth};
      this.cues.push({kind:'hit',details:{intensity:strength,pan:this.direction.pan,weapon:received.weapon}});
    }
    const fresh=[];
    for(const effect of sim.effects||[]){
      if(effect.type!=='explosion')continue;
      const key=effect.id??`${effect.x}:${effect.y}:${effect.z}:${effect.life}`;
      if(this.seenEffects.has(key))continue;this.seenEffects.add(key);
      if(suspended||number(effect.age)>.75)continue;
      let listenerPose=listener;
      // Hear your own destruction even when this frame switches to a wingmate.
      if(received&&received.health<=0&&point(effect)&&distance(effect,p)<number(effect.radius,80)*2)listenerPose=p;
      const strength=explosionStrength(effect,listenerPose);if(strength.intensity<.035)continue;
      const overlapping=fresh.find(f=>distance(f.effect,effect)<Math.max(number(f.effect.radius),number(effect.radius))*.65);
      const blast={effect,...strength,direction:combatDirection(effect,listenerPose,options.camera)};
      if(overlapping){if(blast.intensity>overlapping.intensity)Object.assign(overlapping,blast);}
      else fresh.push(blast);
    }
    fresh.sort((a,b)=>b.intensity-a.intensity);
    for(const blast of fresh.slice(0,3)){
      this.cues.push({kind:'explosion',details:{intensity:blast.intensity,pan:blast.direction.pan,distance:blast.distance,radius:blast.effect.radius}});
      this.blast=Math.max(this.blast,blast.proximity*.65);
      if(blast.proximity>.05){this.jolt=Math.max(this.jolt,blast.proximity*.6);this.joltAge=0;}
    }
    this._trim(this.seenHits);this._trim(this.seenEffects);
    if(suspended){this.hit=this.blast=this.jolt=this.noticeTime=0;}
    const kick=blankKick(),jolt=options.spectating?0:this.jolt;
    if(!reduced&&!suspended&&jolt>.005){
      const t=this.joltAge;
      kick.pitch=Math.sin(t*39+.8)*jolt*.014;
      kick.yaw=Math.sin(t*31)*jolt*.009*this.joltSide;
      kick.roll=Math.cos(t*34)*jolt*.017*this.joltSide;
      kick.x=Math.sin(t*41)*jolt*.075; kick.y=Math.cos(t*36)*jolt*.065;
    }
    const visible=this.noticeTime>0&&!!this.notice;
    const health=visible?Math.round(this.notice.health/this.notice.maxHealth*100):Math.round(number(p.health)/Math.max(1,sim.aircraft?.health||100)*100);
    const weapon=String(this.notice?.weapon||'').toLowerCase();
    const title=health<=0?'AIRCRAFT DESTROYED':weapon.includes('missile')?'MISSILE HIT':weapon.includes('flak')?'FLAK HIT':weapon.includes('bomb')?'BLAST DAMAGE':'AIRFRAME HIT';
    return {hit:this.hit*(reduced?.42:1),blast:this.blast*(reduced?.2:1),visible,
      title,detail:`${this.direction.known?'FROM '+this.direction.label+' · ':''}${health}% AIRFRAME`,
      bearing:visible&&this.direction.known,angle:this.direction.angle,
      critical:!options.spectating&&p.health>0&&p.health<(sim.aircraft?.health||100)*.25,
      kick,cues:this.cues};
  }
}
