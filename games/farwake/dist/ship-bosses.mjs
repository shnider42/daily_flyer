/** Rare, physical space encounters. One authority steps this state once per occupied world. */
import {enemyHullProfile} from './fleet.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const copy=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const serial=value=>clamp(Math.floor(finite(value)),0,Number.MAX_SAFE_INTEGER);
const safeId=value=>typeof value==='string'&&value.length<=160?value:null;
const segmentDistance=(point,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t);};

export const SHIP_BOSS_VERSION=1;
export const SHIP_BOSS_ARCHETYPES=freeze({
 'siege-monitor':{id:'siege-monitor',name:'Deadweight',classId:'judicator',faction:'cinder',health:880,reward:720,color:'#d0a17d',engageRange:1050,leashRange:1750,speed:44,windup:2.2,recovery:3.1,
  objective:'Move across the marked firing lane. Its armor opens while the cannon cools.',warning:'Cannon locked. Move sideways out of the marked lane.',recoveryText:'Cannon cooling. The armor is open.',systems:['sable','sirius','brassfall']},
 'ram-tug':{id:'ram-tug',name:'Breakwater',classId:'leviathan',faction:'cinder',health:690,reward:640,color:'#c2aa77',engageRange:1000,leashRange:1750,speed:72,windup:1.7,recovery:2.7,dashSpeed:430,dashDuration:1.6,
  objective:'Move clear of the marked charge, then attack while the tug brakes.',warning:'Engines charging. Move out of its path.',recoveryText:'The tug is braking. Its drive housing is exposed.',systems:['cinder','ravel','epsilon-eridani']},
 'screen-carrier':{id:'screen-carrier',name:'Second Crown',classId:'ark',faction:'cinder',health:760,reward:820,color:'#bba4cb',engageRange:1050,leashRange:1750,speed:38,windup:1.65,recovery:2.8,
  objective:'Destroy both screen relays, then damage the carrier. Gaps remain between its volleys.',warning:'A spread is charging. Fly through a gap between the marked lanes.',recoveryText:'The carrier is recharging its guns.',systems:['witness','cairnsea','umbra','lacuna']}
});

/** Exactly one optional location per archetype, never a per-visit spawn roll. */
export function shipBossPlan(seed='farwake'){
 return Object.values(SHIP_BOSS_ARCHETYPES).map(spec=>({archetype:spec.id,systemId:spec.systems[hash(`${seed}:ship-boss-location:${spec.id}`)%spec.systems.length]}));
}

export const isShipBossActor=enemy=>enemy?.shipBoss===true&&!!SHIP_BOSS_ARCHETYPES[enemy?.bossState?.archetype];

function placement(world,seed,id){
 const radius=Math.max(1800,finite(world.radius,8100)),start=hash(`${seed}:${id}:position`)/4294967296*Math.PI*2;
 let best=null;
 // Keep these optional encounters outside arrival corridors and a full battle
 // radius from inhabited bodies. No player's position participates in placement.
 for(let i=0;i<96;i++){
  const angle=start+i*2.399963229728653,radiusHere=radius*(.7+(i%4)*.035),point={x:Math.cos(angle)*radiusHere,y:Math.sin(angle)*radiusHere};
  let clearance=radius-radiusHere;
  for(const body of world.bodies||[]){
   clearance=Math.min(clearance,distance(point,body)-finite(body.radius)-950);
   clearance=Math.min(clearance,segmentDistance(point,{x:0,y:0},body)-700);
  }
  if(!best||clearance>best.clearance)best={...point,clearance};
 }
 return {x:best.x,y:best.y};
}

function restoreState(spec,origin,role,raw={}){
 const phases=role==='relay'?['screen']:['idle','approach','windup','dash','recovery','return'];
 const phase=phases.includes(raw.phase)?raw.phase:role==='relay'?'screen':'idle';
 const maxRemaining=phase==='windup'?spec.windup:phase==='dash'?(spec.dashDuration||0):phase==='recovery'?spec.recovery:0;
 return {version:SHIP_BOSS_VERSION,archetype:spec.id,role,originX:origin.x,originY:origin.y,phase,
  clock:clamp(finite(raw.clock),0,1e12),remaining:clamp(finite(raw.remaining),0,maxRemaining),attackSerial:serial(raw.attackSerial),attempt:serial(raw.attempt),
  aimAngle:finite(raw.aimAngle),targetId:safeId(raw.targetId),targetVesselId:safeId(raw.targetVesselId),
  hitVesselIds:[...new Set((Array.isArray(raw.hitVesselIds)?raw.hitVesselIds:[]).map(safeId).filter(Boolean))].slice(0,32),
  relayIndex:clamp(Math.floor(finite(raw.relayIndex)),0,1),engagedVesselIds:[...new Set((Array.isArray(raw.engagedVesselIds)?raw.engagedVesselIds:[]).map(safeId).filter(Boolean))].slice(0,32)};
}

function actorFor(spec,id,origin,role,prior,record,index=0){
 const hull=enemyHullProfile(role==='relay'?'needle':spec.classId),health=role==='relay'?112:spec.health;
 const state=restoreState(spec,origin,role,{...prior?.bossState,relayIndex:index});
 const savedHealth=record.enemyHealth?.[id]??prior?.hp;
 const x=finite(prior?.x,origin.x+(role==='relay'?Math.cos(index*Math.PI)*220:0)),y=finite(prior?.y,origin.y);
 return {id,name:role==='relay'?`Screen relay ${index+1}`:spec.name,faction:spec.faction,...hull,
  x:clamp(x,origin.x-spec.leashRange-600,origin.x+spec.leashRange+600),y:clamp(y,origin.y-spec.leashRange-600,origin.y+spec.leashRange+600),
  vx:finite(prior?.vx),vy:finite(prior?.vy),angle:finite(prior?.angle),hp:clamp(finite(savedHealth,health),0,health),maxHp:health,
  speed:spec.speed,damage:0,cooldown:0,reward:role==='relay'?0:spec.reward,color:role==='relay'?'#a5c8d2':spec.color,
  shipBoss:true,shipBossPart:role==='relay',boardable:false,trainingTarget:role==='relay',noLoot:role==='relay',
  active:prior?.active===true&&state.phase!=='idle'&&state.phase!=='return',disabled:false,bossState:state,
  bossObjective:spec.objective,targetId:state.targetId,targetVesselId:state.targetVesselId};
}

/** Install only the seed's authored boss, and restore only its known actor IDs. */
export function installShipBossEncounter(world,{seed='farwake',system=world,record={}}={}){
 const selection=shipBossPlan(seed).find(entry=>entry.systemId===(system?.id||world?.id));
 if(!selection||!world||system?.warzone)return null;
 const spec=SHIP_BOSS_ARCHETYPES[selection.archetype],id=`${selection.systemId}:ship-boss:${spec.id}`;
 if(world.shipBossEncounter?.id===id)return world.shipBossEncounter;
 const prior=record.shipBosses?.version===SHIP_BOSS_VERSION&&record.shipBosses.id===id?record.shipBosses:null;
 const origin=placement(world,seed,id),actorIds=[id,...(spec.id==='screen-carrier'?[`${id}:relay:0`,`${id}:relay:1`]:[])];
 const defeated=new Set([...(record.defeated||[]),...(Array.isArray(prior?.defeated)?prior.defeated:[])]);
 world.shipBossEncounter={version:SHIP_BOSS_VERSION,id,systemId:selection.systemId,archetype:spec.id,originX:origin.x,originY:origin.y,actorIds,defeated:actorIds.filter(actorId=>defeated.has(actorId))};
 if(defeated.has(id))return world.shipBossEncounter;
 world.enemies||=[];world.bullets||=[];
 for(let i=0;i<actorIds.length;i++){
  const actorId=actorIds[i];if(defeated.has(actorId)||world.enemies.some(enemy=>enemy.id===actorId))continue;
  const saved=prior?.actors?.find(actor=>actor.id===actorId),actor=actorFor(spec,actorId,origin,i?'relay':'primary',saved,record,Math.max(0,i-1));
  if(actor.hp>0)world.enemies.push(actor);else world.shipBossEncounter.defeated.push(actorId);
 }
 return world.shipBossEncounter;
}

/** Save actor progress separately from ordinary NPC damage/boarding snapshots. */
export function captureShipBosses(world){
 const encounter=world?.shipBossEncounter;if(!encounter)return null;
 const actors=(world.enemies||[]).filter(enemy=>isShipBossActor(enemy)&&encounter.actorIds.includes(enemy.id)&&enemy.hp>0);
 const defeated=encounter.actorIds.filter(id=>!actors.some(actor=>actor.id===id));
 return {...copy(encounter),defeated,actors:actors.map(actor=>({id:actor.id,hp:actor.hp,x:actor.x,y:actor.y,vx:actor.vx,vy:actor.vy,angle:actor.angle,active:actor.active,bossState:copy(actor.bossState)}))};
}

export function shipBossDamage(enemy,rawDamage,world){
 const damage=Math.max(0,finite(rawDamage));if(!isShipBossActor(enemy)||enemy.shipBossPart)return damage;
 const state=enemy.bossState;
 if(state.archetype==='screen-carrier'&&(world?.enemies||[]).some(part=>part.shipBossPart&&part.hp>0&&part.id.startsWith(`${enemy.id}:relay:`)))return 0;
 if(state.archetype==='siege-monitor')return damage*(state.phase==='recovery'?1.35:.55);
 if(state.archetype==='ram-tug')return damage*(state.phase==='recovery'?1.25:state.phase==='dash'?.7:1);
 return damage;
}

function targetsFor(participants){
 const vessels=new Map();
 for(const participant of participants||[]){
  const ship=participant?.ship,id=safeId(participant?.vesselId||ship?.id);
  if(!ship||!id||participant.parked||participant.targetEligible===false||finite(ship.hull,1)<=0||ship.dockedAt||!Number.isFinite(ship.x)||!Number.isFinite(ship.y))continue;
  const normalized={...participant,id:safeId(participant.id)||id,vesselId:id,ship};
  const existing=vessels.get(id);if(!existing||normalized.id<existing.id)vessels.set(id,normalized);
 }
 return [...vessels.values()].sort((a,b)=>a.vesselId.localeCompare(b.vesselId));
}

function event(world,enemy,onEvent,type,text,extra={}){
 const state=enemy.bossState;
 onEvent?.(type,{id:`${enemy.id}:${state.attempt}:${state.attackSerial}:${type}`,systemId:world.id,enemyId:enemy.id,attackerId:enemy.id,sourceVesselId:enemy.id,
  targetId:state.targetId,targetVesselId:state.targetVesselId,x:enemy.x,y:enemy.y,text,shipBoss:true,...extra});
}
function setTarget(enemy,target){
 const state=enemy.bossState;state.targetId=target?.id||null;state.targetVesselId=target?.vesselId||null;enemy.targetId=state.targetId;enemy.targetVesselId=state.targetVesselId;
}
function engage(enemy,target){
 const state=enemy.bossState;
 if(!enemy.active){state.attempt++;state.engagedVesselIds=[];}
 enemy.active=true;
 if(!state.engagedVesselIds.includes(target.vesselId))state.engagedVesselIds.push(target.vesselId);
 setTarget(enemy,target);
}
function moveToward(enemy,point,speed,dt){
 const gap=distance(enemy,point),step=Math.min(gap,speed*dt),angle=Math.atan2(point.y-enemy.y,point.x-enemy.x);
 enemy.angle=angle;enemy.vx=gap?Math.cos(angle)*speed:0;enemy.vy=gap?Math.sin(angle)*speed:0;
 enemy.x+=Math.cos(angle)*step;enemy.y+=Math.sin(angle)*step;
}
function fire(world,enemy,angle,index,{speed=490,damage=15,radius=5,ttl=2.7}={}){
 const state=enemy.bossState,forward=enemy.radius+20;
 world.bullets.push({id:`${enemy.id}:${state.attempt}:${state.attackSerial}:pulse:${index}`,x:enemy.x+Math.cos(angle)*forward,y:enemy.y+Math.sin(angle)*forward,
  vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,ttl,damage,radius,owner:enemy.id,ownerId:enemy.id,vesselId:enemy.id,team:'hostile',targetId:state.targetId,targetVesselId:state.targetVesselId,shipBoss:true});
}

export function shipBossTelegraph(enemy,world){
 if(!isShipBossActor(enemy)||enemy.hp<=0||enemy.shipBossPart)return null;
 const state=enemy.bossState,spec=SHIP_BOSS_ARCHETYPES[state.archetype];
 if(state.phase==='windup'||state.phase==='dash')return {kind:state.archetype==='ram-tug'?'charge':state.archetype==='siege-monitor'?'lane':'spread',angle:state.aimAngle,
  length:state.archetype==='ram-tug'?spec.dashSpeed*(state.phase==='dash'?state.remaining:spec.dashDuration):state.archetype==='siege-monitor'?1600:1380,
  width:state.archetype==='ram-tug'?enemy.radius*2+16:state.archetype==='siege-monitor'?28:12,
  seconds:state.remaining,text:state.phase==='dash'?'Charge committed. Keep clear.':spec.warning,angles:state.archetype==='screen-carrier'?[-.39,-.24,-.09,.09,.24,.39].map(offset=>state.aimAngle+offset):[state.aimAngle]};
 if(state.archetype==='screen-carrier'){
  const relays=(world?.enemies||[]).filter(part=>part.shipBossPart&&part.hp>0&&part.id.startsWith(`${enemy.id}:relay:`));
  if(relays.length)return{kind:'screen',relays:relays.map(part=>({id:part.id,x:part.x,y:part.y})),text:`Hull screened. Destroy ${relays.length===2?'both relays':'the remaining relay'}.`};
 }
 return {kind:state.phase==='recovery'?'recovery':'objective',text:state.phase==='recovery'?spec.recoveryText:spec.objective};
}

/** Participants are eligible physical vessels, not one actor per connected captain. */
export function stepShipBosses(world,delta,{participants=[],onEvent,onPlayerHit}={}){
 const dt=clamp(finite(delta),0,.1);if(!dt||!world?.shipBossEncounter)return;
 const targets=targetsFor(participants),enemies=world.enemies||[],primary=enemies.find(enemy=>isShipBossActor(enemy)&&!enemy.shipBossPart&&enemy.hp>0);
 if(!primary){
  // A destroyed carrier cannot leave immortal objectives behind.
  for(const part of enemies)if(isShipBossActor(part)&&part.shipBossPart){part.hp=0;part.active=false;}
  return;
 }
 const state=primary.bossState,spec=SHIP_BOSS_ARCHETYPES[state.archetype],origin={x:state.originX,y:state.originY};
 state.clock+=dt;
 const within=targets.filter(target=>distance(target.ship,origin)<=spec.leashRange&&distance(target.ship,primary)<=spec.leashRange);
 const current=within.find(target=>target.vesselId===state.targetVesselId);
 const nearest=[...within].sort((a,b)=>distance(a.ship,primary)-distance(b.ship,primary)||a.vesselId.localeCompare(b.vesselId))[0];
 const target=current||(nearest&&(distance(nearest.ship,primary)<=spec.engageRange||primary.active)?nearest:null);
 if(!target){
  if(primary.active)event(world,primary,onEvent,'ship-boss-disengaged','The heavy contact has stopped pursuing.');
  primary.active=false;setTarget(primary,null);state.remaining=0;state.hitVesselIds=[];state.engagedVesselIds=[];
  state.phase=distance(primary,origin)>4?'return':'idle';
  if(state.phase==='return')moveToward(primary,origin,spec.speed*1.6,dt);else{primary.vx=0;primary.vy=0;}
 }else{
  const newlyEngaged=!primary.active;engage(primary,target);
  if(newlyEngaged)event(world,primary,onEvent,'ship-boss-engaged',`${spec.name}: ${spec.objective}`);
  // A committed attack never silently rotates onto a newly selected vessel.
  if(!current&&['windup','dash'].includes(state.phase)){state.phase='recovery';state.remaining=spec.recovery;state.hitVesselIds=[];}
  if(['idle','return'].includes(state.phase))state.phase='approach';
  if(state.phase==='approach'){
   const preferred=state.archetype==='ram-tug'?650:900;
   if(distance(primary,target.ship)>preferred)moveToward(primary,target.ship,spec.speed,dt);
   else{
    state.phase='windup';state.remaining=spec.windup;state.attackSerial++;state.hitVesselIds=[];
    state.aimAngle=Math.atan2(target.ship.y-primary.y,target.ship.x-primary.x);primary.angle=state.aimAngle;primary.vx=0;primary.vy=0;
    event(world,primary,onEvent,'ship-boss-warning',spec.warning,{attackId:`${primary.id}:${state.attackSerial}`,windup:state.remaining});
   }
  }else if(state.phase==='windup'){
   primary.vx=0;primary.vy=0;state.remaining=Math.max(0,state.remaining-dt);
   if(state.remaining<=1e-9){
    if(state.archetype==='ram-tug'){state.phase='dash';state.remaining=spec.dashDuration;}
    else{
     if(state.archetype==='siege-monitor')fire(world,primary,state.aimAngle,0,{speed:730,damage:46,radius:12,ttl:2.3});
     else for(const [index,offset] of [-.39,-.24,-.09,.09,.24,.39].entries())fire(world,primary,state.aimAngle+offset,index);
     event(world,primary,onEvent,'enemy-shot',state.archetype==='siege-monitor'?'The siege cannon fires.':'The carrier releases its spread.',{angle:state.aimAngle});
     state.phase='recovery';state.remaining=spec.recovery;
    }
   }
  }else if(state.phase==='dash'){
   const travel=Math.min(dt,state.remaining),before={x:primary.x,y:primary.y};
   primary.vx=Math.cos(state.aimAngle)*spec.dashSpeed;primary.vy=Math.sin(state.aimAngle)*spec.dashSpeed;
   primary.x+=primary.vx*travel;primary.y+=primary.vy*travel;state.remaining=Math.max(0,state.remaining-dt);
   for(const candidate of within)if(!state.hitVesselIds.includes(candidate.vesselId)&&segmentDistance(candidate.ship,before,primary)<=primary.radius+finite(candidate.ship.radius,21)){
    state.hitVesselIds.push(candidate.vesselId);
    const details={enemyId:primary.id,x:primary.x,y:primary.y,attackId:`${primary.id}:${state.attackSerial}`,targetId:candidate.id,targetVesselId:candidate.vesselId};
    onPlayerHit?.(candidate,58,details);event(world,primary,onEvent,'ship-boss-impact','The tug’s prow strikes the hull.',{...details,damage:58});
   }
   if(state.remaining<=1e-9){state.phase='recovery';state.remaining=spec.recovery;primary.vx=0;primary.vy=0;event(world,primary,onEvent,'ship-boss-opening',spec.recoveryText);}
  }else if(state.phase==='recovery'){
   primary.vx=0;primary.vy=0;state.remaining=Math.max(0,state.remaining-dt);
   if(state.remaining<=1e-9)state.phase='approach';
  }
 }
 // The two relays are physical objectives. Their positions and orbit clock are
 // shared and saved, and destroyed relays never regenerate on retreat.
 for(const part of enemies)if(part.shipBossPart&&isShipBossActor(part)&&part.hp>0&&part.id.startsWith(`${primary.id}:relay:`)){
  const angle=state.clock*.16+part.bossState.relayIndex*Math.PI;
  part.x=primary.x+Math.cos(angle)*220;part.y=primary.y+Math.sin(angle)*220;part.angle=angle+Math.PI/2;
  part.vx=primary.vx-Math.sin(angle)*35.2;part.vy=primary.vy+Math.cos(angle)*35.2;part.active=primary.active;
  part.bossState.clock=state.clock;setTarget(part,target);
 }
}

/** An unrelated captain elsewhere in the same system never receives boss scoring. */
export function bossMusicContext(world,vesselId){
 const primary=(world?.enemies||[]).find(enemy=>isShipBossActor(enemy)&&!enemy.shipBossPart&&enemy.hp>0&&enemy.active&&enemy.bossState.targetVesselId===vesselId&&['approach','windup','dash','recovery'].includes(enemy.bossState.phase));
 return {bossEncounterKey:primary?`${primary.id}:${primary.bossState.attempt}`:null,bossObserved:!!primary};
}
