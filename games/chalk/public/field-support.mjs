// A finite Cordon relief element and limited casualty care. All movement, cover,
// treatment and ammunition belong to real actors; reports reveal no enemy state.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const standing=a=>a.alive&&!a.downed;
export const FIELD_AID=Object.freeze({bleedDuration:70,aidRange:70,buddyRange:240,ordinaryDuration:4.5,medicDuration:3,recoveredHealth:.52});

export function initializeFieldSupport(s){
  const reserve=s.fieldSquads?.groups.find(g=>g.id==='field-relief');
  s.fieldSupport={version:1,enabled:!!reserve,reserveId:reserve?.id||null,remaining:reserve?1:0,
    status:reserve?'available':'unavailable',text:reserve?'Relief standing by. One support deployment available.':'No relief detachment assigned to this operation.',
    updatedAt:s.time,request:null,nextId:0,nextReplyAt:0};
}

/** This is the entire public radio report. Never include a hidden position,
 * route, medical inventory, target, or other squad's private order. */
export function fieldSupportStatus(s){
  const support=s.fieldSupport;
  if(!support)return{enabled:false,available:false,remaining:0,status:'unavailable',callsign:'Relief',text:'No relief assigned.',updatedAt:0,requestId:null};
  const group=Array.isArray(s.fieldSquads?.groups)?s.fieldSquads.groups.find(g=>g.id===support.reserveId):null;
  const members=group?(s.allies||[]).filter(a=>a.fieldSquadId===group.id&&standing(a)):[];
  const ready=members.length>=2&&!members.some(a=>a.hp<a.maxHp*.4)&&!group?.withdrawing;
  const recovering=support.enabled&&support.remaining>0&&!support.request&&!ready;
  return{enabled:!!support.enabled,available:support.enabled&&support.remaining>0&&!support.request&&ready,
    remaining:support.remaining,status:recovering?'recovering':support.status,callsign:'Relief',
    text:recovering?'Relief cannot deploy safely. The detachment is recovering.':support.text,updatedAt:support.updatedAt,
    requestId:support.request?.id??null};
}

function report(s,status,text,hooks){
  const support=s.fieldSupport;
  if(support.status===status&&support.text===text)return;
  support.status=status;support.text=text;support.updatedAt=s.time;
  hooks.radio(s,'RELIEF',text);
}
function reject(s,text,hooks){
  const support=s.fieldSupport;if(s.time<support.nextReplyAt)return false;
  support.nextReplyAt=s.time+3;support.text=text;support.updatedAt=s.time;
  hooks.radio(s,'RELIEF',text);return false;
}

export function beginFieldSupport(s,point,hooks,{actorId=null,groupId=null}={}){
  const support=s.fieldSupport;
  if(s.status!=='playing'||!support?.enabled)return false;
  if(support.request)return reject(s,'Relief is already committed. Current request remains active.',hooks);
  if(support.remaining<=0)return reject(s,'Relief has completed its deployment. No fresh detachment available.',hooks);
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return false;
  if(point.x<20||point.y<20||point.x>s.world.width-20||point.y>s.world.height-20)return reject(s,'That support position is outside the district.',hooks);
  const group=s.fieldSquads.groups.find(g=>g.id===support.reserveId);
  const members=(s.allies||[]).filter(a=>a.fieldSquadId===group?.id&&standing(a));
  if(members.length<2||members.some(a=>a.hp<a.maxHp*.4)||group?.withdrawing)
    return reject(s,'Relief cannot deploy safely. The detachment is recovering.',hooks);
  const leader=members.find(a=>a.id===group.leaderId)||members[0],requested=hooks.nearbyFree(s,point.x,point.y);
  // Nearby real cover is useful even without a known threat. Its position is a
  // route target, not permission to see or fire at anything outside actual sight.
  const candidates=[...hooks.coverCandidates(s).filter(p=>distance(p,requested)<125&&hooks.free(s,p.x,p.y,15))
    .sort((a,b)=>distance(a,requested)-distance(b,requested)).slice(0,6),requested];
  let destination=null;
  for(const p of candidates)if(hooks.findPath(s,leader,p).length){destination={x:p.x,y:p.y};break;}
  if(!destination)return reject(s,'Relief cannot reach that position. Choose another approach.',hooks);
  const request={id:++support.nextId,actorId,groupId,destination,requested:{...requested},startedAt:s.time,
    phase:'moving',lastProgressAt:s.time,bestDistance:distance(leader,destination),arrivedAt:null};
  support.request=request;support.remaining--;group.supportTask=request.id;group.assignment=groupId?'Moving to assist a friendly squad':'Moving to cover the requested position';
  group.holdUntil=0;group.fieldJobDone=false;
  report(s,'moving',groupId?'Relief moving to assist the wounded squad.':'Relief moving to your requested position.',hooks);
  return true;
}

export function updateFieldSupport(s,hooks){
  const support=s.fieldSupport,request=support?.request;if(!request)return;
  const group=s.fieldSquads.groups.find(g=>g.id===support.reserveId);
  const members=(s.allies||[]).filter(a=>a.fieldSquadId===group?.id&&standing(a));
  if(!members.length){report(s,'lost','Relief is no longer able to respond.',hooks);support.request=null;return;}
  if(group.withdrawing){
    group.supportTask=null;support.request=null;
    report(s,'withdrawn','Relief is breaking contact to recover its people.',hooks);return;
  }
  const leader=members.find(a=>a.id===group.leaderId)||members[0],range=distance(leader,request.destination);
  if(request.phase==='moving'){
    if(range<request.bestDistance-24){request.bestDistance=range;request.lastProgressAt=s.time;
      if(support.status==='delayed')report(s,'moving','Relief is moving again.',hooks);}
    if(range<90&&members.filter(a=>distance(a,request.destination)<200).length>=Math.min(2,members.length)){
      request.phase='covering';request.arrivedAt=s.time;
      report(s,'covering','Relief in position. Covering this area and helping nearby wounded.',hooks);
    }else if(s.time-request.lastProgressAt>14&&support.status!=='delayed'){
      report(s,'delayed',s.time-group.lastContactAt<6?'Relief delayed by contact on the approach.':'Relief delayed on the approach. The request remains active.',hooks);
    }
    if(s.time-request.startedAt>100){
      group.supportTask=null;group.fieldJobDone=true;request.phase='returning';
      report(s,'returning','Relief could not reach the position in time. Returning to the staging area.',hooks);
    }
  }else if(request.phase==='covering'){
    const aiding=members.some(a=>a.fieldAidTargetId!=null);
    if(s.time-request.arrivedAt>35&&!aiding||s.time-request.arrivedAt>55){
      request.phase='returning';group.supportTask=null;group.fieldJobDone=true;
      report(s,'returning','Relief assignment complete. Returning to the staging area.',hooks);
    }
  }else if(request.phase==='returning'&&members.every(a=>distance(a,group.staging)<185)){
    support.request=null;group.supportTask=null;group.fieldJobDone=true;
    report(s,'complete','Relief back at staging. This operation’s support deployment is complete.',hooks);
  }
}

export function knownFieldThreats(s,members){
  const points=[];
  for(const a of members)if(a.lastKnown&&s.time-a.lastSeenAt<7&&!points.some(p=>distance(p,a.lastKnown)<45))points.push(a.lastKnown);
  return points;
}

/** Fallback candidates are actual geometry and reached stops. Never use the
 * next route objective as a supposedly safe position. Path exposure is scored
 * against only recent observations; these checks grant the player no sight. */
export function chooseFieldRefuge(s,group,members,hooks){
  const leader=members.find(a=>a.id===group.leaderId)||members[0],threats=knownFieldThreats(s,members);
  const history=group.reachedStops||[],home=group.staging||group.posts[0];
  const candidates=[...history,home,...hooks.coverCandidates(s).filter(p=>distance(p,leader)<350)];
  const exposure=p=>threats.reduce((sum,t)=>sum+(hooks.hasLineOfSight(s,p,t)?1:0),0);
  const scored=candidates.filter(p=>hooks.free(s,p.x,p.y,15)&&distance(p,leader)>30)
    .map(p=>({point:p,score:exposure(p)*1600+distance(p,leader)*.65+distance(p,home)*.08-
      (threats.length?Math.min(...threats.map(t=>distance(t,p)))*.12:0)}))
    .sort((a,b)=>a.score-b.score).slice(0,10);
  let best=null,bestScore=Infinity;
  for(const {point,score} of scored){
    const path=hooks.findPath(s,leader,point);if(!path.length)continue;
    const pathExposure=path.slice(0,-1).reduce((sum,p)=>sum+exposure(p),0);
    const value=score+pathExposure*80;
    if(value<bestScore){bestScore=value;best={x:point.x,y:point.y};}
  }
  return best||{x:leader.x,y:leader.y};
}

export function fieldAidSafe(s,helper,target,members,hooks){
  if(!hooks.hasLineOfSight(s,helper,target)||helper.suppression>.55)return false;
  return !knownFieldThreats(s,members).some(threat=>hooks.combatLOS(s,target,threat));
}

/** Treatment consumes one real supply at completion. Recovered field troops
 * withdraw with their group instead of being added to CHALK or its objectives. */
export function treatFieldCasualty(s,target,helper,dt,hooks){
  if(!target?.alive||!target.downed||target.team!=='allied'||!standing(helper)||helper.medkits<=0)return false;
  if(distance(helper,target)>FIELD_AID.aidRange||!hooks.hasLineOfSight(s,helper,target))return false;
  if(target.fieldAidAt===s.time)return true;
  target.fieldAidAt=s.time;
  const duration=helper.role==='medic'?FIELD_AID.medicDuration:FIELD_AID.ordinaryDuration;
  target.reviveProgress=Math.min(4,(target.reviveProgress||0)+dt*4/duration);
  if(target.reviveProgress>=4){
    helper.medkits--;target.downed=false;target.hp=Math.round(target.maxHp*FIELD_AID.recoveredHealth);
    target.bleed=0;target.reviveProgress=0;target.suppression=.15;target.fieldRecovered=true;target.path=[];target.pathTimer=0;
    hooks.effect(s,'heal',target.x,target.y,1);
    hooks.radio(s,helper.team==='squad'?helper.name.toUpperCase():target.callsign?.split(' ')[0]?.toUpperCase()||'FIELD',`${target.name} stabilized. Withdrawing to recover.`);
  }
  return true;
}

export function advanceFieldCasualties(s,dt,hooks){
  for(const a of s.allies||[]){
    if(!a.alive||!a.downed)continue;
    // Care remains a bounded opportunity, even if a helper is interrupted.
    a.bleed=(a.bleed||0)+dt;
    if(a.fieldAidAt==null||s.time-a.fieldAidAt>.2)a.reviveProgress=Math.max(0,(a.reviveProgress||0)-dt*.3);
    if(a.bleed>=FIELD_AID.bleedDuration){a.alive=false;a.deathTime=s.time;a.reviveProgress=0;
      if(a.visible)hooks.radio(s,'FIELD',`${a.name} could not be recovered.`);}
  }
}
