/** Sol is reachable. Its quarantine is enforced by physical, persistent defenses. */
import {enemyHullProfile} from './fleet.mjs';
import {solClearance} from './sol-access.mjs';

export const SOL_CORDON_VERSION=1;
export const SOL_CHALLENGE_SECONDS=8;
const CORDON_SPREAD=[-.09,-.045,0,.045,.09];
const CORDON_PROJECTILE_SPEED=620;
const CORDON_PROJECTILE_TTL=2;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const copy=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const safeId=value=>typeof value==='string'&&value.length<=160?value:null;
export const solCordonVesselId=game=>game?.netVesselId||game?.state?.multiplayer?.aboardVesselId||game?.state?.ship?.id;

export function installSolCordon(world,record={}) {
  if(world?.id!=='sol')return null;
  if(world.solCordon)return world.solCordon;
  const earth=world.bodies.find(body=>body.id==='earth');
  if(!earth)return null;
  const saved=record.solCordon?.version===SOL_CORDON_VERSION?record.solCordon:{};
  const visits={};
  for(const [id,visit] of Object.entries(saved.visits||{}).slice(-64)){
    if(!safeId(id)||!visit||typeof visit!=='object')continue;
    visits[id]={originSystemId:safeId(visit.originSystemId),elapsed:clamp(finite(visit.elapsed),0,3600),approach:visit.approach===true,aggressive:visit.aggressive===true};
  }
  const batteryIds=Array.from({length:6},(_,index)=>`sol:cordon:battery:${index+2}`);
  world.solCordon={version:SOL_CORDON_VERSION,earthId:'earth',arrival:{x:earth.x,y:earth.y+640},outerRadius:1450,innerRadius:480,visits,
    destroyedBatteryIds:batteryIds.filter(id=>(record.defeated||[]).includes(id))};
  world.enemies||=[];world.bullets||=[];
  const defeated=new Set(record.defeated||[]);
  for(let index=0;index<8;index++){
    const role=index<2?'interceptor':'battery',id=`sol:cordon:${role}:${index}`;
    if(defeated.has(id)||world.enemies.some(enemy=>enemy.id===id))continue;
    const angle=(index-2)*Math.PI/3+Math.PI/6;
    const origin=role==='interceptor'?{x:earth.x+(index?440:-440),y:earth.y+650}:{x:earth.x+Math.cos(angle)*370,y:earth.y+Math.sin(angle)*370};
    const prior=saved.actors?.find(actor=>actor.id===id),maxHp=role==='battery'?5000:3200;
    const hp=clamp(finite(record.enemyHealth?.[id],finite(prior?.hp,maxHp)),0,maxHp);
    if(!hp)continue;
    const state=prior?.cordonState||{},phase=['idle','windup','recovery'].includes(state.phase)?state.phase:'idle';
    world.enemies.push({...enemyHullProfile(role==='battery'?'needle':'judicator'),id,
      name:role==='battery'?`Earth orbital battery ${index-1}`:`Quarantine interceptor ${index+1}`,faction:'concord',
      x:clamp(finite(prior?.x,origin.x),earth.x-2200,earth.x+2200),y:clamp(finite(prior?.y,origin.y),earth.y-2200,earth.y+2200),
      vx:finite(prior?.vx),vy:finite(prior?.vy),angle:finite(prior?.angle),hp,maxHp,
      speed:role==='battery'?0:210,damage:role==='battery'?44:28,reward:0,noLoot:true,boardable:false,
      solCordon:true,cordonRole:role,cordonOrigin:origin,cordonRange:role==='battery'?1100:950,
      active:prior?.active===true,disabled:false,color:role==='battery'?'#ca9988':'#9bb5d1',
      cordonState:{phase,aimAngle:finite(state.aimAngle),remaining:clamp(finite(state.remaining),0,1.2),
        targetVesselId:safeId(state.targetVesselId),targetId:safeId(state.targetId),clock:clamp(finite(state.clock),0,1e12),serial:Math.max(0,Math.floor(finite(state.serial)))}});
  }
  return world.solCordon;
}

export function captureSolCordon(world) {
  if(!world?.solCordon)return null;
  return {...copy(world.solCordon),actors:world.enemies.filter(enemy=>enemy.solCordon&&enemy.hp>0).map(enemy=>({
    id:enemy.id,hp:enemy.hp,x:enemy.x,y:enemy.y,vx:enemy.vx,vy:enemy.vy,angle:enemy.angle,active:enemy.active,cordonState:copy(enemy.cordonState)}))};
}

function visitFor(game,create=false,originSystemId=null) {
  const cordon=game?.system?.solCordon,id=solCordonVesselId(game);
  if(!cordon||!id)return null;
  if(!cordon.visits[id]&&create){
    const ids=Object.keys(cordon.visits);if(ids.length>=64)delete cordon.visits[ids[0]];
    cordon.visits[id]={originSystemId:safeId(originSystemId),elapsed:0,approach:false,aggressive:false};
  }
  const visit=cordon.visits[id];
  if(visit&&originSystemId)visit.originSystemId=safeId(originSystemId);
  return visit||null;
}

export function beginSolVisit(game,originSystemId) {
  if(game?.state?.systemId!=='sol')return null;
  const visit=visitFor(game,true,originSystemId);
  if(!visit)return null;
  if(!solClearance(game).entry){
    game._event?.('sol-cordon-warning',{systemId:'sol',targetVesselId:solCordonVesselId(game),
      text:visit.elapsed>=SOL_CHALLENGE_SECONDS?'Sol cordon: your ship is still unauthorized. Turn away or jump back now.':`Sol cordon: unidentified ship. Turn away now. Interceptors will open fire in ${Math.ceil(SOL_CHALLENGE_SECONDS-visit.elapsed)} seconds.`});
    if(!game.hasFlag?.('observed_sol_cordon')){
      game._flag?.('observed_sol_cordon');
      game._log?.('Earth from the quarantine line','Dark bands cross Earth beneath broken orbital traffic. A few isolated landing lights remain. The cordon orders your ship to withdraw. These are observations from orbit; the cause and the condition of individual settlements are still unknown.','discovery');
    }
  }
  return visit;
}

export function beginEarthApproach(game) {
  const visit=visitFor(game,true);
  if(!visit)return {ok:false,code:'target',reason:'Earth is not in this system.'};
  const already=visit.approach;
  visit.approach=true;visit.elapsed=Math.max(visit.elapsed,SOL_CHALLENGE_SECONDS-2);
  if(!already)game._event?.('sol-cordon-warning',{systemId:'sol',targetVesselId:solCordonVesselId(game),
    text:'Earth approach started. Orbital batteries are acquiring your ship. Break away from Earth or jump back.'});
  return {ok:true,approach:true,text:'Approaching Earth under orbital fire. The batteries control the descent; your flight controls remain active.'};
}

export function solCordonRetreat(game,destinationId) {
  const visit=visitFor(game);
  return game?.state?.systemId==='sol'&&!!visit?.originSystemId&&visit.originSystemId===destinationId&&(!solClearance(game).entry||visit.approach||visit.aggressive);
}

export function solCordonStatus(game) {
  const world=game?.system,cordon=world?.solCordon,ship=game?.state?.ship;
  if(game?.state?.systemId!=='sol'||!cordon||!ship||ship.unowned||ship.destroyed||ship.dockedAt||game.state.mode!=='ship'&&!['ship','eva'].includes(game.state.interior?.kind))return {active:false};
  const earth=world.bodies.find(body=>body.id==='earth'),permission=solClearance(game),visit=visitFor(game);
  const approach=!!visit?.approach&&!permission.landing,cleared=permission.entry&&!approach&&!visit?.aggressive;
  const outside=!earth||distance(ship,earth)>cordon.outerRadius;
  const seconds=Math.max(0,SOL_CHALLENGE_SECONDS-finite(visit?.elapsed));
  const phase=cleared?'cleared':outside?'outside':approach?'approach':seconds>0?'warning':'interdiction';
  const origin=visit?.originSystemId;
  const returnName=game.galaxy?.find(system=>system.id===origin)?.name||'your previous system';
  const text=cleared?'Cordon clearance recognized. Follow Threshold’s screened landing route.':outside?'Outside the firing perimeter. Keep clear of Earth; Threshold is the screened refuge.':
    seconds>0?`Cordon warning · ${Math.ceil(seconds)}s. Turn away from Earth or jump back to ${returnName}.`:
    approach?`Orbital batteries block descent. Break away or jump back to ${returnName}.`:`Interceptors are firing. Turn away from Earth or jump back to ${returnName}.`;
  return {active:!cleared&&!outside,phase,seconds,originSystemId:origin||null,text,cleared,approach};
}

export function recordSolCordonAggression(world,enemy,game) {
  if(!enemy?.solCordon||!game)return;
  const visit=visitFor(game,true);if(visit){visit.aggressive=true;visit.elapsed=SOL_CHALLENGE_SECONDS;}
}

export function recordSolCordonDefeat(world,enemy) {
  if(!world?.solCordon||!enemy?.solCordon||enemy.cordonRole!=='battery')return;
  const ids=world.solCordon.destroyedBatteryIds||=[];
  if(!ids.includes(enemy.id))ids.push(enemy.id);
}

export function solCordonTelegraph(enemy) {
  if(!enemy?.solCordon||!enemy.active||enemy.hp<=0||enemy.cordonState?.phase!=='windup')return null;
  return {angles:CORDON_SPREAD.map(offset=>enemy.cordonState.aimAngle+offset),muzzleOffset:enemy.radius+10,
    length:CORDON_PROJECTILE_SPEED*CORDON_PROJECTILE_TTL,seconds:enemy.cordonState.remaining,radius:5};
}

function participantsByHull(participants) {
  const result=new Map();
  for(const participant of participants||[]){
    const ship=participant?.ship,id=safeId(participant?.vesselId||ship?.id);
    if(!id||!ship||participant.parked||participant.targetEligible===false||ship.unowned||ship.destroyed||ship.hull<=0||ship.dockedAt)continue;
    if(!result.has(id))result.set(id,{...participant,vesselId:id,id:participant.id||id});
  }
  return [...result.values()].sort((a,b)=>a.vesselId.localeCompare(b.vesselId));
}

/** One clock per physical hull, and one simulation pass per occupied Sol room. */
export function stepSolCordon(world,delta,{participants=[],onEvent}={}) {
  const cordon=world?.solCordon,earth=world?.bodies?.find(body=>body.id==='earth');
  if(!cordon||!earth)return;
  const dt=clamp(finite(delta),0,.1),targets=participantsByHull(participants),intruders=[];
  for(const participant of targets){
    const permission=solClearance(participant.game),visit=visitFor(participant.game,true);
    if(!visit)continue;
    const gap=distance(participant.ship,earth),breach=!permission.landing&&gap<cordon.innerRadius&&(!permission.entry||visit.approach);
    if(breach)visit.approach=true;
    if(permission.landing)visit.approach=false;
    if(gap>cordon.outerRadius){visit.approach=false;visit.aggressive=false;continue;}
    if(permission.entry&&!visit.approach&&!visit.aggressive)continue;
    const before=visit.elapsed;visit.elapsed=Math.min(3600,visit.elapsed+dt);
    if(before<SOL_CHALLENGE_SECONDS&&visit.elapsed>=SOL_CHALLENGE_SECONDS)onEvent?.('sol-cordon-warning',{
      systemId:'sol',targetVesselId:participant.vesselId,targetId:participant.id,text:'Cordon weapons live. Turn away from Earth or jump back now.'});
    if(visit.elapsed>=SOL_CHALLENGE_SECONDS)intruders.push({...participant,visit,permission,gap});
  }
  for(const enemy of world.enemies.filter(actor=>actor.solCordon&&actor.hp>0)){
    const state=enemy.cordonState;state.clock+=dt;
    const eligible=intruders.filter(target=>(!target.permission.entry||target.visit.aggressive||enemy.cordonRole==='battery'&&target.visit.approach)&&distance(enemy,target.ship)<enemy.cordonRange);
    const target=eligible.find(value=>value.vesselId===state.targetVesselId)||eligible.sort((a,b)=>distance(enemy,a.ship)-distance(enemy,b.ship))[0];
    if(!target){
      state.phase='idle';state.remaining=0;state.targetVesselId=null;state.targetId=null;enemy.active=false;enemy.targetVesselId=null;enemy.targetId=null;
      if(enemy.cordonRole==='interceptor'){
        const gap=distance(enemy,enemy.cordonOrigin),step=Math.min(gap,90*dt),angle=Math.atan2(enemy.cordonOrigin.y-enemy.y,enemy.cordonOrigin.x-enemy.x);
        enemy.x+=Math.cos(angle)*step;enemy.y+=Math.sin(angle)*step;enemy.vx=gap>2?Math.cos(angle)*90:0;enemy.vy=gap>2?Math.sin(angle)*90:0;
      }
      continue;
    }
    enemy.active=true;enemy.disabled=false;enemy.targetId=state.targetId=target.id;enemy.targetVesselId=state.targetVesselId=target.vesselId;
    const gap=distance(enemy,target.ship);
    if(enemy.cordonRole==='interceptor'&&state.phase!=='windup'&&gap>330){
      const angle=Math.atan2(target.ship.y-enemy.y,target.ship.x-enemy.x),step=Math.min(gap-330,enemy.speed*dt);
      enemy.x+=Math.cos(angle)*step;enemy.y+=Math.sin(angle)*step;enemy.vx=Math.cos(angle)*enemy.speed;enemy.vy=Math.sin(angle)*enemy.speed;
    }else{enemy.vx=0;enemy.vy=0;}
    state.remaining=Math.max(0,state.remaining-dt);
    if(state.phase==='windup'&&state.remaining===0){
      state.serial++;
      for(let index=0;index<CORDON_SPREAD.length;index++){
        const angle=state.aimAngle+CORDON_SPREAD[index],speed=CORDON_PROJECTILE_SPEED,forward=enemy.radius+10;
        world.bullets.push({id:`${enemy.id}:cordon:${state.serial}:${index}`,x:enemy.x+Math.cos(angle)*forward,y:enemy.y+Math.sin(angle)*forward,
          vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,ttl:CORDON_PROJECTILE_TTL,damage:enemy.damage,radius:5,
          owner:enemy.id,ownerId:enemy.id,vesselId:enemy.id,team:'hostile',targetId:target.id,targetVesselId:target.vesselId,solCordon:true});
      }
      onEvent?.('enemy-shot',{id:`${enemy.id}:cordon:${state.serial}`,systemId:'sol',attackerId:enemy.id,sourceVesselId:enemy.id,targetId:target.id,targetVesselId:target.vesselId,x:enemy.x,y:enemy.y,angle:state.aimAngle,solCordon:true});
      state.phase='recovery';state.remaining=enemy.cordonRole==='battery'?.65:1.1;
    }else if(state.phase!=='windup'&&state.remaining===0){
      const lead=Math.min(.55,gap/620);
      state.aimAngle=Math.atan2(target.ship.y+finite(target.ship.vy)*lead-enemy.y,target.ship.x+finite(target.ship.vx)*lead-enemy.x);
      enemy.angle=state.aimAngle;state.phase='windup';state.remaining=.9;
    }
  }
}
