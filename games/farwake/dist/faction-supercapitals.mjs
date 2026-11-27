/** One persistent physical flagship per faction, installed in ordinary system traffic. */
import {getShipClass,enemyHullProfile} from './fleet.mjs';
import {FACTION_SUPERCAPITALS,SUPERCAPITAL_OUTLINES} from './faction-supercapital-content.mjs';
export {FACTION_SUPERCAPITALS} from './faction-supercapital-content.mjs';

export const FACTION_SUPERCAPITAL_VERSION=1;
export const SOL_FLAGSHIP_ID='sol:supercapital:concord';
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>{let result=2166136261;for(const c of String(value))result=Math.imul(result^c.charCodeAt(0),16777619);return result>>>0;};
const safeId=value=>typeof value==='string'&&value.length>0&&value.length<=160?value:null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const serial=value=>clamp(Math.floor(finite(value)),0,Number.MAX_SAFE_INTEGER);

export function factionSupercapitalPlan(seed='farwake'){
 return FACTION_SUPERCAPITALS.map(spec=>{const systemId=spec.systems[hash(`${seed}:faction-supercapital:${spec.faction}`)%spec.systems.length];return{faction:spec.faction,classId:spec.classId,name:spec.name,systemId,id:`${systemId}:supercapital:${spec.faction}`};});
}
export const isFactionSupercapital=actor=>actor?.factionSupercapital===true&&FACTION_SUPERCAPITALS.some(spec=>spec.classId===actor.classId&&spec.faction===actor.faction);
export const findFactionSupercapital=(world,factionId)=>world?.traffic?.find(actor=>isFactionSupercapital(actor)&&actor.faction===factionId)||null;

/** The same physical outline applies to commissioned hulls and faction contacts. */
export function supercapitalHullHit(actor,fromX,fromY,toX,toY,projectileRadius=4){
 if(!actor||!Object.hasOwn(SUPERCAPITAL_OUTLINES,actor.classId)||actor.destroyed||finite(actor.hull,finite(actor.hp))<=0||![actor.x,actor.y,fromX,fromY,toX,toY].every(Number.isFinite))return false;
 const c=Math.cos(finite(actor.angle)),s=Math.sin(finite(actor.angle)),local=(x,y)=>({x:(x-actor.x)*c+(y-actor.y)*s,y:-(x-actor.x)*s+(y-actor.y)*c}),a=local(fromX,fromY),b=local(toX,toY),points=SUPERCAPITAL_OUTLINES[actor.classId],padding=Math.max(0,finite(projectileRadius));
 const inside=p=>{let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const q=points[i],r=points[j];if((q[1]>p.y)!==(r[1]>p.y)&&p.x<(r[0]-q[0])*(p.y-q[1])/(r[1]-q[1])+q[0])yes=!yes;}return yes;};
 if(inside(a)||inside(b))return true;
 const lineDistance=(p,q,r)=>{const x=r.x-q.x,y=r.y-q.y,t=clamp(((p.x-q.x)*x+(p.y-q.y)*y)/(x*x+y*y||1),0,1);return Math.hypot(p.x-q.x-x*t,p.y-q.y-y*t);};
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const q={x:points[j][0],y:points[j][1]},r={x:points[i][0],y:points[i][1]},dx=b.x-a.x,dy=b.y-a.y,ex=r.x-q.x,ey=r.y-q.y,cross=dx*ey-dy*ex;
  if(Math.abs(cross)>1e-9){const t=((q.x-a.x)*ey-(q.y-a.y)*ex)/cross,u=((q.x-a.x)*dy-(q.y-a.y)*dx)/cross;if(t>=0&&t<=1&&u>=0&&u<=1)return true;}
  if(Math.min(lineDistance(a,q,r),lineDistance(b,q,r),lineDistance(q,a,b),lineDistance(r,a,b))<=padding)return true;
 }
 return false;
}

/** Only canonical faction contacts use the traffic actor damage/retaliation path. */
export function factionSupercapitalHit(actor,fromX,fromY,toX,toY,projectileRadius=4){
 return isFactionSupercapital(actor)&&actor.hp>0&&supercapitalHullHit(actor,fromX,fromY,toX,toY,projectileRadius);
}

function placement(world,seed,selection){
 if(selection.id===SOL_FLAGSHIP_ID){const earth=world.bodies?.find(body=>body.id==='earth');return{x:finite(earth?.x)+2100,y:finite(earth?.y)+850,angle:Math.PI};}
 const hull=getShipClass(selection.classId),footprint=Math.hypot(hull.stats.renderLength,hull.stats.renderWidth)/2,radius=Math.max(4000,finite(world.radius,8100));
 const first=hash(`${seed}:${selection.id}:anchorage`)/4294967296*Math.PI*2;let best=null;
 for(let i=0;i<128;i++){
  const angle=first+i*2.399963229728653,ring=radius*(.45+(i%5)*.055),point={x:Math.cos(angle)*ring,y:Math.sin(angle)*ring,angle:angle+Math.PI};
  let clearance=radius-ring-footprint;
  for(const body of world.bodies||[])clearance=Math.min(clearance,distance(point,body)-finite(body.gravityRadius,finite(body.radius,70))-footprint-220);
  // The ordinary jump berth sits just beyond the first station. Keep the whole
  // capital clear of that approach without changing any civilian traffic lane.
  const port=world.bodies?.find(body=>body.kind==='station')||world.bodies?.[0];
  if(port)clearance=Math.min(clearance,distance(point,{x:port.x,y:port.y+port.radius+95})-footprint-500);
  if(!best||clearance>best.clearance)best={...point,clearance};
 }
 return{x:best.x,y:best.y,angle:best.angle};
}

function restoreState(raw={}){
 const phase=['idle','windup','recovery'].includes(raw.phase)?raw.phase:'idle';
 return{clock:clamp(finite(raw.clock),0,1e12),phase,remaining:clamp(finite(raw.remaining),0,phase==='windup'?1.8:2.8),
  attackSerial:serial(raw.attackSerial),targetVesselId:safeId(raw.targetVesselId),targetId:safeId(raw.targetId),aimX:finite(raw.aimX),aimY:finite(raw.aimY),
  hitRemaining:clamp(finite(raw.hitRemaining),0,10),hostileVesselIds:[...new Set((Array.isArray(raw.hostileVesselIds)?raw.hostileVesselIds:[]).map(safeId).filter(Boolean))].slice(-32)};
}

/** Traffic is the canonical object store. No invisible copy is created for the renderer or tractor. */
export function installFactionSupercapitals(world,{seed='farwake',record={}}={}){
 if(!world)return[];world.traffic||=[];
 const selections=factionSupercapitalPlan(seed).filter(entry=>entry.systemId===world.id),saved=record.factionSupercapitals?.version===FACTION_SUPERCAPITAL_VERSION?record.factionSupercapitals:null;
 for(const selection of selections){
  if(world.traffic.some(actor=>actor.id===selection.id))continue;
  const spec=FACTION_SUPERCAPITALS.find(value=>value.faction===selection.faction),hull=getShipClass(selection.classId),pose=placement(world,seed,selection),prior=saved?.actors?.find(actor=>actor.id===selection.id);
  const destroyed=(record.defeated||[]).includes(selection.id)||prior?.destroyed===true||prior?.hp===0;
  const hp=destroyed?0:clamp(finite(prior?.hp,hull.stats.maxHull),0,hull.stats.maxHull),state=restoreState(prior?.supercapitalState),limit=Math.max(4000,finite(world.radius,8100));
  const actor={...hull.stats,...enemyHullProfile(hull.id),id:selection.id,name:spec.name,faction:spec.faction,color:spec.color,
   factionSupercapital:true,supercapital:true,boardable:false,noLoot:true,reward:0,trafficRole:'flagship',trafficStatus:hp>0?'Holding fleet anchorage':'Flagship wreck',
   originId:world.id,destinationId:world.id,originName:world.name||world.id,destinationName:spec.purpose,homeSystemId:world.id,hail:spec.hail,
   x:clamp(finite(prior?.x,pose.x),-limit,limit),y:clamp(finite(prior?.y,pose.y),-limit,limit),angle:finite(prior?.angle,pose.angle),vx:0,vy:0,angularVelocity:0,
   hp,maxHp:hull.stats.maxHull,hull:hp,shield:clamp(finite(prior?.shield,hull.stats.maxShield),0,hull.stats.maxShield),energy:hull.stats.maxEnergy,
   active:hp>0&&state.phase!=='idle',disabled:!hp,destroyed:!hp,supercapitalState:state};
  actor.targetVesselId=state.targetVesselId;actor.targetId=state.targetId;world.traffic.push(actor);
 }
 return world.traffic.filter(isFactionSupercapital);
}

export function captureFactionSupercapitals(world){
 const actors=(world?.traffic||[]).filter(isFactionSupercapital);if(!actors.length)return null;
 return{version:FACTION_SUPERCAPITAL_VERSION,actors:actors.map(actor=>({id:actor.id,x:actor.x,y:actor.y,angle:actor.angle,hp:actor.hp,shield:actor.shield,destroyed:actor.destroyed===true||actor.hp<=0,supercapitalState:copy(actor.supercapitalState)}))};
}

/** Coordinates are attached to this actual hull, including a restored heading. */
export function supercapitalTractorAnchor(actor){
 if(!isFactionSupercapital(actor))return null;
 const length=actor.renderLength,width=actor.renderWidth,forward=actor.classId==='crucible'?-.16*length:.2*length,side=-.28*width,c=Math.cos(actor.angle),s=Math.sin(actor.angle);
 return{x:actor.x+c*forward-s*side,y:actor.y+s*forward+c*side,angle:actor.angle,hostVesselId:actor.id,systemId:actor.homeSystemId,radius:80};
}

/** A small secured section of this same flagship, never the prisoner's own deck. */
export function supercapitalBrig(actor){
 if(!isFactionSupercapital(actor))return null;
 return{id:`${actor.id}:brig`,name:`${actor.name} · holding deck`,kind:'brig',biome:'ship',hostVesselId:actor.id,vesselId:actor.id,shipClass:actor.classId,shipClassId:actor.classId,
  faction:actor.faction,systemId:actor.homeSystemId,supercapital:true,cols:14,rows:22,tile:24,
  cell:{x:84,y:132},release:{x:252,y:444},console:{x:156,y:252},medical:{x:252,y:132},
  hooks:{cell:`${actor.id}:brig:cell`,release:`${actor.id}:brig:release`,console:`${actor.id}:brig:console`}};
}

export function recordFactionSupercapitalAggression(actor,vesselId){
 if(!isFactionSupercapital(actor)||actor.hp<=0||!safeId(vesselId))return false;
 const ids=actor.supercapitalState.hostileVesselIds;if(!ids.includes(vesselId)){ids.push(vesselId);if(ids.length>32)ids.shift();}return true;
}

/** The collision authority supplies the confirmed attacker; mere proximity does nothing. */
export function damageFactionSupercapital(actor,amount,{sourceVesselId=null}={}){
 if(!isFactionSupercapital(actor)||actor.hp<=0)return{damage:0,shieldDamage:0,hullDamage:0,destroyed:actor?.hp<=0};
 const damage=Math.max(0,finite(amount)),shieldDamage=Math.min(actor.shield,damage),hullDamage=Math.min(actor.hp,damage-shieldDamage);
 actor.shield-=shieldDamage;actor.hp-=hullDamage;actor.hull=actor.hp;
 if(damage>0){actor.supercapitalState.hitRemaining=10;recordFactionSupercapitalAggression(actor,sourceVesselId);}
 if(actor.hp<=0){actor.destroyed=true;actor.disabled=true;actor.active=false;actor.trafficStatus='Flagship wreck';actor.supercapitalState.phase='idle';actor.supercapitalState.targetVesselId=null;actor.supercapitalState.targetId=null;actor.targetVesselId=null;actor.targetId=null;}
 return{damage:shieldDamage+hullDamage,shieldDamage,hullDamage,destroyed:actor.destroyed===true};
}

function muzzlePoints(actor){const c=Math.cos(actor.angle),s=Math.sin(actor.angle);return getShipClass(actor.classId).systems.pulseMuzzles.map(([x,y])=>({x:actor.x+c*x-s*y,y:actor.y+s*x+c*y}));}
export function supercapitalTelegraphs(actor){
 if(!isFactionSupercapital(actor)||actor.hp<=0||actor.supercapitalState.phase!=='windup')return[];
 return muzzlePoints(actor).map(origin=>{const angle=Math.atan2(actor.supercapitalState.aimY-origin.y,actor.supercapitalState.aimX-origin.x);return{origin,angle,length:2600,seconds:actor.supercapitalState.remaining,targetVesselId:actor.supercapitalState.targetVesselId};});
}

/** Defensive fire is provoked, hull-targeted and telegraphed. No background attacks are introduced. */
export function stepFactionSupercapitals(world,delta,{participants=[],onEvent}={}){
 const dt=clamp(finite(delta),0,.1);if(!dt)return;
 const byHull=new Map();for(const p of participants){const id=p.vesselId||p.ship?.id;if(id&&p.ship?.hull>0&&!p.parked&&p.targetEligible!==false&&!p.ship.dockedAt&&!p.ship.destroyed&&!p.ship.unowned&&!byHull.has(id))byHull.set(id,{...p,vesselId:id});}
 for(const actor of (world?.traffic||[]).filter(isFactionSupercapital)){
  if(actor.hp<=0)continue;const state=actor.supercapitalState;state.clock+=dt;state.hitRemaining=Math.max(0,state.hitRemaining-dt);
  if(!state.hitRemaining)actor.shield=Math.min(actor.maxShield,actor.shield+getShipClass(actor.classId).systems.shieldRecharge*dt);
  const eligible=[...byHull.values()].filter(p=>state.hostileVesselIds.includes(p.vesselId)&&distance(actor,p.ship)<3200),target=eligible.find(p=>p.vesselId===state.targetVesselId)||eligible.sort((a,b)=>distance(actor,a.ship)-distance(actor,b.ship))[0];
  if(!target){state.phase='idle';state.remaining=0;state.targetVesselId=null;state.targetId=null;actor.targetVesselId=null;actor.targetId=null;actor.active=false;continue;}
  if(state.targetVesselId&&state.targetVesselId!==target.vesselId&&state.phase==='windup'){state.phase='idle';state.remaining=0;}
  actor.active=true;actor.targetVesselId=state.targetVesselId=target.vesselId;actor.targetId=state.targetId=target.id||target.vesselId;
  state.remaining=Math.max(0,state.remaining-dt);
  if(state.phase==='windup'&&state.remaining===0){
   const serial=++state.attackSerial;world.bullets||=[];
   for(const [index,origin] of muzzlePoints(actor).entries()){const angle=Math.atan2(state.aimY-origin.y,state.aimX-origin.x);world.bullets.push({id:`${actor.id}:defense:${serial}:${index}`,...origin,vx:Math.cos(angle)*650,vy:Math.sin(angle)*650,ttl:4,radius:5,damage:actor.damage*.22,owner:actor.id,ownerId:actor.id,vesselId:actor.id,team:'hostile',targetId:state.targetId,targetVesselId:target.vesselId,factionSupercapital:true});}
   onEvent?.('enemy-shot',{id:`${actor.id}:defense:${serial}`,systemId:world.id,attackerId:actor.id,sourceVesselId:actor.id,targetId:state.targetId,targetVesselId:target.vesselId,x:actor.x,y:actor.y,factionSupercapital:true});state.phase='recovery';state.remaining=2.8;
  }else if(state.phase!=='windup'&&state.remaining===0){
   state.aimX=target.ship.x+finite(target.ship.vx)*.65;state.aimY=target.ship.y+finite(target.ship.vy)*.65;state.phase='windup';state.remaining=1.8;
   onEvent?.('supercapital-warning',{systemId:world.id,targetVesselId:target.vesselId,targetId:state.targetId,hostVesselId:actor.id,text:`${actor.name}: batteries are acquiring your ship. Break away from the marked firing lanes.`});
  }
 }
}
