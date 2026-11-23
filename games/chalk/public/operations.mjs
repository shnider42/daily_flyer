// Small, authoritative field tasks shared by all six operations.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const standing=a=>a&&a.alive&&!a.downed;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angularDifference=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const current=s=>{const stage=s.stages?.[s.stageIndex],object=stage&&s.operation?.objects.find(o=>o.stageId===stage.id);return object&&['interact','deliver'].includes(stage.kind)?{...stage,x:object.x,y:object.y}:stage;};
function insidePoint(s,near,hooks){
  const buildings=[...s.world.buildings].filter(b=>b.enterable).sort((a,b)=>distance({x:a.x+a.w/2,y:a.y+a.h/2},near)-distance({x:b.x+b.w/2,y:b.y+b.h/2},near));
  for(const b of buildings)for(const room of b.rooms||[b.interior]){
    const p={x:b.doors[0].x,y:room.y+room.h/2};
    if(hooks.free(s,p.x,p.y,17)&&hooks.findPath(s,s.squad[0],p).length)return {...p,buildingId:b.id};
  }
  return hooks.nearbyFree(s,near.x,near.y);
}
export function initializeOperations(s,hooks){
  s.operation={version:1,items:[],objects:[],completed:[],observed:[],transmission:null};
  for(const stage of s.stages){
    if(stage.interior)Object.assign(stage,insidePoint(s,stage,hooks));
    if(stage.kind==='interact'||stage.kind==='deliver'){
      const object={id:stage.id,kind:stage.objectKind||stage.itemKind||'radio',label:stage.title,x:stage.x,y:stage.y,stageId:stage.id,completed:false};
      s.operation.objects.push(object);
      if(stage.action==='pickup')s.operation.items.push({id:stage.itemId,kind:stage.itemKind,label:stage.itemLabel,x:stage.x,y:stage.y,status:'ground',carrierId:null});
    }
  }
  if(s.missionIndex===3)for(let i=0;i<2;i++)s.survivors.push(hooks.actor(s,'survivor',`Straggler ${i+1}`,'crew',160+i*70,1830,{hp:45,maxHp:70,downed:false,stabilized:true,radius:12,escortSpeed:42}));
  if(s.missionIndex===1)for(const c of s.survivors)c.escortSpeed=42;
  if(s.missionIndex===5)for(const stage of s.stages.filter(p=>p.kind==='rescue')){
    s.survivors.push(hooks.actor(s,'survivor',stage.crew===0?'Resident 1':'Resident 2','resident',stage.x,stage.y,{hp:35,maxHp:65,downed:true,stabilized:false,radius:11,missionWait:true,escortSpeed:38}));
    s.operation.objects.push({id:stage.id,kind:'evac',label:stage.title,x:stage.x,y:stage.y,stageId:stage.id,completed:false});
  }
}
export function operationItem(s,id){return s.operation?.items.find(item=>item.id===id)||null;}
export function missionActionTarget(s){
  const p=current(s);if(!p)return null;
  const item=operationItem(s,p.itemId);
  if(p.kind==='deliver'&&item?.status==='ground')return {id:item.id,kind:item.kind,label:`Recover ${item.label.toLowerCase()}`,x:item.x,y:item.y,recovery:true};
  if(['interact','deliver'].includes(p.kind))return {id:p.id,kind:p.objectKind||p.itemKind||'radio',label:p.interactionLabel||p.title,x:p.x,y:p.y};
  return null;
}
export function updateOperations(s,dt,hooks){
  if(!s.operation)return;
  for(const item of s.operation.items){
    if(item.status!=='carried')continue;
    const carrier=s.squad.find(a=>a.id===item.carrierId);
    if(carrier){item.x=carrier.x;item.y=carrier.y;}
    if(!standing(carrier)){
      item.status='ground';item.carrierId=null;
      hooks.radio(s,'RADIO',`${item.label} is down at the casualty position. Another standing soldier can recover it.`);
    }
  }
  const transmission=s.operation.transmission;
  if(transmission&&!transmission.complete){
    transmission.remaining=Math.max(0,transmission.remaining-dt);
    if(!transmission.remaining){transmission.complete=true;hooks.radio(s,'RADIO','Route report received. The chalk can withdraw to the pickup street.');}
  }
}
function hasPriorityCasualty(s,a,hooks){return [...s.squad,...s.survivors.filter(c=>c.stabilized)].some(c=>c.alive&&c.downed&&distance(a,c)<70&&hooks.hasLineOfSight(s,a,c));}
function reachable(s,a,target,radius,hooks){return standing(a)&&distance(a,target)<radius&&hooks.hasLineOfSight(s,a,target)&&!hasPriorityCasualty(s,a,hooks);}
export function missionInteraction(s,actorId,hooks){
  const a=s.squad.find(a=>a.id===actorId),p=current(s);
  if(s.status!=='playing'||!p||!standing(a)||!hooks.controlled(s,a))return null;
  if(p.kind==='recon'){
    const target=p.lookAt;
    if(!reachable(s,a,target,p.observeRange||520,hooks)||!hooks.combatLOS(s,a,target))return null;
    return {id:p.id,label:'Observe approach',detail:'Hold to observe the marked approach while facing it · binoculars also work',progress:clamp(s.phaseTime/p.duration,0,1),x:target.x,y:target.y,radius:p.observeRange,available:true};
  }
  if(!['interact','deliver'].includes(p.kind))return null;
  const target=missionActionTarget(s),item=operationItem(s,p.itemId);
  if(!target)return null;
  if(p.kind==='deliver'&&!target.recovery&&item?.carrierId!==a.id){
    const carrier=s.squad.find(c=>c.id===item?.carrierId);
    if(!standing(carrier)||hooks.controlled(s,carrier)||!reachable(s,carrier,target,p.radius||65,hooks)||!reachable(s,a,target,160,hooks))return null;
    return {id:target.id,label:target.label,detail:`Hold to signal ${carrier.name} to hand over ${item.label.toLowerCase()} · ${p.duration} seconds`,progress:clamp(s.phaseTime/p.duration,0,1),x:target.x,y:target.y,radius:160,available:true,helperCarrierId:carrier.id};
  }
  if(!reachable(s,a,target,p.radius||65,hooks))return null;
  return {id:target.id,label:target.label,detail:`Hold to ${target.recovery?'recover the dropped item':(p.interactionLabel||'work').toLowerCase()} · ${target.recovery?'2':p.duration} seconds`,progress:clamp(s.phaseTime/(target.recovery?2:p.duration),0,1),x:target.x,y:target.y,radius:p.radius,available:true};
}
function humanWorker(s,p,inputs,hooks){
  for(const actor of s.squad){
    if(!hooks.controlled(s,actor)||!hooks.inputFor(s,actor,inputs).interact)continue;
    const action=missionInteraction(s,actor.id,hooks);if(!action)continue;
    return action.helperCarrierId?s.squad.find(a=>a.id===action.helperCarrierId):actor;
  }
  return null;
}
export function operationWork(s,inputs,dt,hooks){
  const p=current(s);if(!p||!['interact','deliver','recon'].includes(p.kind))return false;
  let worker=humanWorker(s,p,inputs,hooks);
  const leader=hooks.currentLeader(s),target=missionActionTarget(s)||p.lookAt||p;
  const aiAllowed=standing(leader)&&!hooks.controlled(s,leader)&&s.waitUntil<=s.time&&s.squad.some(a=>hooks.controlled(s,a)&&standing(a)&&distance(a,leader)<260);
  if(p.kind==='recon'){
    worker=s.squad.find(a=>standing(a)&&hooks.controlled(s,a)&&reachable(s,a,p.lookAt,p.observeRange||520,hooks)&&hooks.combatLOS(s,a,p.lookAt)&&
      angularDifference(a.angle,Math.atan2(p.lookAt.y-a.y,p.lookAt.x-a.x))<.62&&
      (hooks.inputFor(s,a,inputs).interact||a.role==='grenadier'&&hooks.inputFor(s,a,inputs).observe));
    if(!worker&&aiAllowed&&reachable(s,leader,p.lookAt,p.observeRange||520,hooks)&&hooks.combatLOS(s,leader,p.lookAt)){worker=leader;leader.angle=Math.atan2(p.lookAt.y-leader.y,p.lookAt.x-leader.x);}
  }else if(!worker&&aiAllowed&&reachable(s,leader,target,p.radius||65,hooks)){
    const item=operationItem(s,p.itemId);
    if(p.kind!=='deliver'||target.recovery||item?.carrierId===leader.id)worker=leader;
  }
  // An AI soldier carrying the item can hand it over while the human holds
  // Assist nearby. The item still has to reach the receiving point physically.
  if(!worker&&p.kind==='deliver'&&!target.recovery){
    const item=operationItem(s,p.itemId),carrier=s.squad.find(a=>a.id===item?.carrierId);
    if(standing(carrier)&&!hooks.controlled(s,carrier)&&reachable(s,carrier,p,p.radius,hooks)&&
      s.squad.some(a=>standing(a)&&hooks.controlled(s,a)&&distance(a,p)<160&&hooks.inputFor(s,a,inputs).interact))worker=carrier;
  }
  if(!worker)return true;
  s.phaseTime+=dt;const duration=target.recovery?2:p.duration;
  s.progress=clamp(s.phaseTime/duration,0,1);s.interactionPrompt=`${p.kind==='recon'?'Observing approach':target.label} · ${Math.round(s.progress*100)}%`;
  if(s.phaseTime<duration)return true;
  const item=operationItem(s,p.itemId);
  if(target.recovery){item.status='carried';item.carrierId=worker.id;s.phaseTime=0;hooks.radio(s,worker.name.toUpperCase(),`${item.label} recovered. Moving it to the receiving point.`);return true;}
  if(p.action==='pickup'&&item){item.status='carried';item.carrierId=worker.id;hooks.radio(s,worker.name.toUpperCase(),`${item.label} secured. I am carrying it.`);}
  if(p.kind==='deliver'&&item){if(item.kind==='medical')for(const c of s.survivors)if(standing(c)&&distance(c,p)<220)c.hp=Math.min(c.maxHp,c.hp+25);item.status='delivered';item.carrierId=null;item.x=p.x;item.y=p.y;hooks.radio(s,worker.name.toUpperCase(),p.transmission?'Battery connected. The report is transmitting; move toward pickup.':`${item.label} handed over.`);}
  if(p.kind==='recon'){
    s.operation.observed.push(p.id);hooks.radio(s,worker.name.toUpperCase(),'Approach checked from here. Blind corners remain; move together.');
  }
  if(p.transmission)s.operation.transmission={remaining:p.transmission,complete:false};
  const object=s.operation.objects.find(o=>o.id===p.id);if(object)object.completed=true;
  s.operation.completed.push(p.id);hooks.advance(s);return true;
}
