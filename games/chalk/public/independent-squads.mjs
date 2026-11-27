// Finite background units have their own assignments. They use the same world,
// doors, ammunition and projectiles as the playable chalk. No offscreen dice
// damage, reinforcements behind the player, or omniscient destination tracking.
import { roleProfile } from './squad-roles.mjs';
import { enemyProfile, ballisticProfile } from './combat-profiles.mjs';
import { initializeFieldSupport, beginFieldSupport, updateFieldSupport, chooseFieldRefuge, knownFieldThreats, fieldAidSafe, FIELD_AID } from './field-support.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const alive=a=>a.alive&&!a.downed;
const mix=(seed,salt)=>{let n=(seed^Math.imul(salt+1,2654435761))>>>0;n=Math.imul(n^(n>>>16),2246822507);return(n^(n>>>13))>>>0;};
export const FIELD_SQUAD_LIMITS=Object.freeze({allies:8,baseAllies:5,hostiles:6,groups:5,planningInterval:.4});
const FIELD_LINES=Object.freeze({
  contact:['Contact on our route. Find a firing position.','Shots ahead. Watch the far corner.','Contact across the street. Cover the others.','Take the wall. Keep that doorway covered.'],
  moving:['Moving to the next junction.','Keep your spacing. We have another crossing.','Route is clear here. Keep moving.','Watch the upper windows as we move.'],
  hold:['Hold the crossing. Watch the doors.','Set here. Cover the other side.','This is our stop. Keep the street open.','Holding this corner. Check the side alley.'],
  regroup:['Close the gap. Stay together.','Wait for the rear. Nobody crosses alone.','Bring it back in. We move together.','Last man is catching up. Hold a moment.'],
  withdraw:['We need support. Falling back to our last stop.','Pull back together. Cover the crossing.','Too exposed here. Back to the last junction.','We have lost people. Fall back under cover.'],
});

function membersOf(s,group){
  const actors=group.team==='allied'?s.allies:s.enemies;
  return actors.filter(a=>a.fieldSquadId===group.id&&alive(a));
}
function clearPlacement(s,p,hooks,used,nearChalk=false){
  return hooks.free(s,p.x,p.y,15)&&(nearChalk||!hooks.squadCanSeePoint(s,p))&&
    s.squad.every(a=>distance(a,p)>(nearChalk?60:550))&&
    ![...s.civilians,...s.survivors].some(a=>a.alive&&distance(a,p)<38)&&
    ![...s.enemies,...s.allies,...used].some(a=>alive(a)&&distance(a,p)<60);
}
function reliefStagingPosts(s,hooks){
  // The reserve starts behind the initial approach, not beside the first
  // defenders. Check real geometry and current hostile positions once at setup;
  // these soldiers receive no protection or teleport after the mission starts.
  const approach=hooks.nearbyFree(s,200,1540),posts=[];
  for(const x of [80,120,200,280])for(const y of [1810,1730,1650,1570]){
    const point={x,y};
    if(posts.some(p=>distance(p,point)<70)||!clearPlacement(s,point,hooks,[],true))continue;
    if(s.enemies.some(a=>alive(a)&&(distance(a,point)<520||
      distance(a,point)<=ballisticProfile(enemyProfile(a).weapon).range&&hooks.hasLineOfSight(s,a,point))))continue;
    if(!hooks.findPath(s,point,approach).length)continue;
    posts.push(point);if(posts.length===3)return posts;
  }
  return posts;
}
function roomPosts(s,anchor,hooks){
  const buildings=s.world.buildings.filter(b=>b.enterable&&b.rooms?.length)
    .sort((a,b)=>distance({x:a.x+a.w/2,y:a.y+a.h/2},anchor)-distance({x:b.x+b.w/2,y:b.y+b.h/2},anchor));
  for(const building of buildings){
    const posts=[];
    // Some guards face through an actual doorway; others occupy a sheltered
    // side of the next room. All posts must connect to an exterior threshold.
    const candidates=[...building.doors.map(door=>({...door.inside})),
      ...building.rooms.flatMap(room=>[{x:room.x+30,y:room.y+room.h/2},{x:room.x+room.w-30,y:room.y+room.h/2}])];
    for(const point of candidates){
      if(posts.some(p=>distance(p,point)<65)||!clearPlacement(s,point,hooks,[])||!hooks.findPath(s,point,building.doors[0].outside).length)continue;
      posts.push({...point,buildingId:building.id});if(posts.length===3)return posts;
    }
  }return[];
}
function addGroup(s,definition,hooks){
  const group={...definition,route:definition.route.map(p=>({...p})),waypoint:0,phase:['garrison','reserve'].includes(definition.order)?'hold':'moving',
    leaderId:null,initialStrength:0,nextPlanAt:0,holdUntil:0,lastContactAt:-100,lastVoiceAt:-100,voiceTurn:0,grenadeUsed:false,
    originalAssignment:definition.assignment,staging:{...definition.posts[0]},reachedStops:[{...definition.posts[0]}],pressureTime:0,smokeUsed:false};
  const names=group.team==='allied'?(group.callsign==='Raven'?['Ortiz','Bell','Price']:group.callsign==='Relief'?['Vega','Brooks','Shah']:['Dunn','Keller']):['Armed fighter','Armed fighter','Armed fighter'];
  for(let i=0;i<definition.posts.length;i++){
    const p=definition.posts[i];if(!clearPlacement(s,p,hooks,[],definition.order==='reserve'))continue;
    let actor;
    if(group.team==='enemy'){
      if(!hooks.spawnEnemy(s,p,false,'rifleman'))continue;
      actor=s.enemies.at(-1);actor.encounterId=group.id;
      actor.defensive=group.order==='garrison';actor.defenseRadius=group.order==='garrison'?145:450;
      // Cohesion differs between groups and seeds, not by a blanket nationality
      // modifier. A steadier hostile cell can hold its doors very effectively.
      actor.accuracy*=.95+(1-group.cohesion)*.15;
    }else{
      const role=i===0?'leader':group.order==='reserve'&&i===2?'medic':i===1&&group.callsign!=='Hammer'?'support':'rifleman',loadout=roleProfile(role);
      actor=hooks.actor(s,'allied',names[i],role,p.x,p.y,{role,hp:96,maxHp:96,ammo:loadout.magSize,
        magSize:loadout.magSize,reserve:loadout.reserve,visible:group.order==='reserve'&&hooks.squadCanSeePoint(s,p),frags:i===0?1:0,medkits:role==='medic'?3:1,smokes:i===0?1:0,
        handThrowCooldown:0,home:{x:p.x,y:p.y},senseTimer:.06*i,perceivedTargetId:null,lastKnown:null,lastSeenAt:-100});
      s.allies.push(actor);
    }
    Object.assign(actor,{fieldSquadId:group.id,fieldSlot:i,callsign:`${group.callsign} ${i+1}`,assignment:group.assignment,
      fieldGoal:{x:p.x,y:p.y},fieldCohesion:group.cohesion,fieldWaiting:false,fieldHome:{x:p.x,y:p.y},
      fieldPost:p.buildingId?{x:p.x,y:p.y,buildingId:p.buildingId}:null,tactic:group.order==='garrison'?'guard':'patrol',
      frags:i===0?1:0,handThrowCooldown:0});
    group.leaderId??=actor.id;group.initialStrength++;
  }
  if(group.initialStrength)s.fieldSquads.groups.push(group);
}
export function initializeIndependentSquads(s,hooks){
  s.allies=[];s.fieldSquads={version:2,enabled:true,groups:[],nextPlanAt:0};
  const variant=mix(s.seed,s.missionIndex),eastward=(variant&1)===0;
  const at=(x,y)=>hooks.nearbyFree(s,x,y);
  addGroup(s,{id:'field-raven',team:'allied',callsign:'Raven',assignment:'Checking the north route',order:'patrol',cohesion:.9,
    route:eastward?[at(200,580),at(680,580),at(680,200),at(1160,200),at(1160,580)]:[at(200,580),at(200,200),at(680,200),at(680,580)],
    posts:[at(200,500),at(200,420),at(200,340)]},hooks);
  addGroup(s,{id:'field-hammer',team:'allied',callsign:'Hammer',assignment:'Relieving the east crossing',order:'relieve',cohesion:.83,
    route:[at(2120,1250),at(2120,960),at(1640,960),at(1640,580)],posts:[at(2120,1450),at(2120,1530)]},hooks);
  addGroup(s,{id:'field-east-patrol',team:'enemy',callsign:'East patrol',assignment:'Moving between eastern approaches',order:'patrol',
    cohesion:.48+(variant%4)*.08,route:[at(2120,1200),at(2120,960),at(1640,960),at(1640,580),at(2120,580)],
    posts:[at(2120,1040),at(2120,960),at(2120,880)]},hooks);
  const posts=roomPosts(s,{x:eastward?920:1400,y:460},hooks);
  if(posts.length)addGroup(s,{id:'field-house-guard',team:'enemy',callsign:'House guard',assignment:'Holding a building approach',order:'garrison',
    cohesion:.68+(variant%3)*.07,route:posts,posts},hooks);
  if(s.missionIndex===0){
    const reservePosts=reliefStagingPosts(s,hooks);
    if(reservePosts.length===3)addGroup(s,{id:'field-relief',team:'allied',callsign:'Relief',assignment:'Standing by at the western staging area',order:'reserve',cohesion:.92,
      route:[{...reservePosts[0]}],posts:reservePosts},hooks);
  }
  initializeFieldSupport(s);
}

function formationGoal(s,leader,goal,slot,cohesion,hooks){
  if(slot===0)return goal;
  const dx=goal.x-leader.x,dy=goal.y-leader.y,angle=Math.atan2(dy,dx),gap=cohesion>.8?62:82;
  const depth=slot*gap,side=slot%2===0?-1:1;
  const candidates=[{x:leader.x-Math.cos(angle)*depth-Math.sin(angle)*side*36,y:leader.y-Math.sin(angle)*depth+Math.cos(angle)*side*36},
    {x:leader.x-Math.cos(angle)*depth,y:leader.y-Math.sin(angle)*depth},leader];
  return candidates.find(p=>hooks.free(s,p.x,p.y,15)&&hooks.walkLine(s,leader,p,13))||leader;
}
function reportGroup(s,group,text,hooks){
  if(s.time-(group.lastReportAt??-100)<8)return;
  hooks.radio(s,group.callsign.toUpperCase(),text);group.lastReportAt=s.time;
}
function planBuddyAid(s,group,members,hooks){
  for(const a of members)a.fieldAidTargetId=null;
  const casualties=(s.allies||[]).filter(a=>a.alive&&a.downed&&
    (a.fieldSquadId===group.id||group.order==='reserve'&&members.some(m=>distance(m,a)<FIELD_AID.buddyRange&&hooks.hasLineOfSight(s,m,a))));
  if(!casualties.length)return;
  const casualty=casualties.sort((a,b)=>b.bleed-a.bleed)[0];
  const helper=members.filter(a=>a.medkits>0&&distance(a,casualty)<FIELD_AID.buddyRange)
    .sort((a,b)=>(a.role==='medic'?-100:0)+distance(a,casualty)-(b.role==='medic'?-100:0)-distance(b,casualty))
    .find(a=>fieldAidSafe(s,a,casualty,members,hooks)&&hooks.findPath(s,a,casualty).length);
  if(helper){helper.fieldAidTargetId=casualty.id;group.phase='aid';}
  else if(!group.smokeUsed&&knownFieldThreats(s,members).length){
    const thrower=members.find(a=>a.smokes>0&&distance(a,casualty)<220&&hooks.hasLineOfSight(s,a,casualty));
    if(thrower&&hooks.throwFieldSmoke(s,thrower,casualty)){group.smokeUsed=true;
      reportGroup(s,group,'Smoke on the casualty. Cover the aid attempt.',hooks);
    }
  }
}
export function updateIndependentOrders(s,dt,hooks){
  if(!s.fieldSquads?.enabled||s.maxEnemies<=0)return;
  s.fieldSquads.nextPlanAt-=dt;if(s.fieldSquads.nextPlanAt>0)return;
  s.fieldSquads.nextPlanAt=FIELD_SQUAD_LIMITS.planningInterval;
  updateFieldSupport(s,hooks);
  for(const group of s.fieldSquads.groups){
    const members=membersOf(s,group);
    if(!members.length){group.phase=(s.allies||[]).some(a=>a.fieldSquadId===group.id&&a.alive&&a.downed)?'casualties':'lost';continue;}
    let leader=members.find(a=>a.id===group.leaderId);
    if(!leader){leader=members[0];group.leaderId=leader.id;group.cohesion=Math.max(.4,group.cohesion-.08);}
    const contacting=members.some(a=>a.target!=null&&a.lastSeenAt!=null&&s.time-a.lastSeenAt<1);
    if(contacting){group.lastContactAt=s.time;group.phase='contact';}
    const regrouping=s.time-group.lastContactAt<5,allied=group.team==='allied';
    const casualty=allied&&(s.allies||[]).some(a=>a.fieldSquadId===group.id&&a.alive&&a.downed);
    const depleted=group.initialStrength>1&&members.length<=group.initialStrength*.5;
    const injured=allied&&members.some(a=>a.hp<=a.maxHp*.4||a.fieldRecovered);
    group.pressureTime=members.some(a=>a.suppression>.7)?(group.pressureTime||0)+FIELD_SQUAD_LIMITS.planningInterval:Math.max(0,(group.pressureTime||0)-.8);
    const underPressure=allied&&group.pressureTime>=2.4;
    if((depleted||injured||casualty||underPressure)&&!['garrison'].includes(group.order)&&!group.withdrawing&&!group.fieldJobDone){
      group.withdrawing=true;group.withdrawAt=s.time;group.withdrawPoint=chooseFieldRefuge(s,group,members,hooks);group.recoverySince=null;
      group.pressureTime=0;
      if(allied)reportGroup(s,group,casualty?'One down. Taking cover to recover our wounded.':injured?'Wounded on the route. Breaking contact to recover.':'Too exposed. Breaking contact toward shelter.',hooks);
    }
    const needsRelief=casualty||depleted||members.some(a=>a.hp<a.maxHp*.25&&a.medkits<=0);
    if(allied&&group.withdrawing&&group.id!=='field-relief'&&!group.supportAsked&&s.time>=25&&
      needsRelief&&s.fieldSupport?.remaining>0&&!s.fieldSupport.request){
      const aidPosition=(s.allies||[]).find(a=>a.fieldSquadId===group.id&&a.alive&&a.downed)||group.withdrawPoint||leader;
      group.supportAsked=beginFieldSupport(s,aidPosition,hooks,{groupId:group.id});
    }
    if(group.withdrawing){
      group.phase='withdraw';group.assignment='Breaking contact toward shelter';
      // Reevaluate if a breach opens this refuge to a current observed threat.
      if(contacting&&s.time-(group.refugeCheckedAt||group.withdrawAt)>6){
        group.refugeCheckedAt=s.time;
        if(knownFieldThreats(s,members).some(t=>hooks.hasLineOfSight(s,group.withdrawPoint,t)))group.withdrawPoint=chooseFieldRefuge(s,group,members,hooks);
      }
      if(!contacting&&!regrouping&&members.every(a=>distance(a,group.withdrawPoint)<175)){
        group.recoverySince??=s.time;group.phase='recover';group.assignment='Recovering at a sheltered stop';
        if(!casualty&&s.time-group.recoverySince>9){
          if(depleted||members.some(a=>a.fieldRecovered)||members.some(a=>a.hp<a.maxHp*.52)){
            group.fieldJobDone=true;group.withdrawing=false;group.assignment='Withdrawing to the staging area';
            if(allied)reportGroup(s,group,'We are leaving the route to recover. Assignment handed back.',hooks);
          }else if(members.every(a=>a.suppression<.3)){
            group.withdrawing=false;group.assignment=group.originalAssignment;group.pressureTime=0;
            if(allied)reportGroup(s,group,'Regrouped. Resuming our assignment.',hooks);
          }
        }
      }else group.recoverySince=null;
    }
    const request=s.fieldSupport?.request,assigned=group.supportTask&&request?.id===group.supportTask&&['moving','covering'].includes(request.phase);
    let goal=group.withdrawing?group.withdrawPoint:group.fieldJobDone?group.staging:assigned?request.destination:group.route[group.waypoint];
    if(!group.withdrawing){
      if(group.fieldJobDone){
        group.phase=members.every(a=>distance(a,group.staging)<185)?'complete':'returning';
        group.assignment=group.phase==='complete'?'Assignment complete. Holding the staging area':'Returning to the staging area';
      }else if(assigned){group.phase=request.phase==='covering'?'support_hold':contacting?'contact':'support_move';}
      else if(group.order==='reserve'){group.phase='reserve';}
      else if(!regrouping&&group.order!=='garrison'){
        const gap=group.cohesion>.8?190:330;
        if(members.some(a=>distance(a,leader)>gap))group.phase='regroup';
        else if(distance(leader,goal)<42){
          if(!group.reachedStops?.some(p=>distance(p,leader)<65)){
            (group.reachedStops||=[]).push({x:leader.x,y:leader.y});if(group.reachedStops.length>6)group.reachedStops.shift();
          }
          group.holdUntil||=s.time+2+(1-group.cohesion)*5;group.phase='hold';
          if(s.time>=group.holdUntil){
            if(group.waypoint<group.route.length-1)group.waypoint++;
            else if(group.order==='patrol'){
              if(allied){group.fieldJobDone=true;group.assignment='Route check complete. Returning to staging';reportGroup(s,group,'Route check complete. Returning to staging.',hooks);}
              else group.waypoint=0;
            }else group.phase='hold';
            group.holdUntil=0;goal=group.fieldJobDone?group.staging:group.route[group.waypoint];
          }
        }else group.phase='moving';
      }else if(group.order==='garrison'&&!regrouping)group.phase='hold';
    }
    const coverers=members.filter(a=>a.target!=null&&a.reloadTimer<=0&&a.ammo>0&&a.suppression<.75);
    // Alternate a short covering interval. It prevents every member from moving
    // together while remaining bounded and independent of render frame rate.
    const covering=coverers.length?coverers[Math.floor(s.time/2.6)%coverers.length]:null;
    const contactMember=members.find(a=>a.target!=null);
    for(let i=0;i<members.length;i++){
      const a=members[i];a.assignment=group.assignment;a.fieldCohesion=group.cohesion;a.fieldRetreat=!!group.withdrawing;
      a.fieldCovering=allied&&a===covering&&members.length>1&&s.time%2.6<1.6;
      a.fieldContactPoint=contactMember?{x:contactMember.x,y:contactMember.y}:null;
      a.fieldWaiting=['hold','recover','complete','reserve','support_hold'].includes(group.phase)||group.phase==='regroup'&&a===leader;
      a.fieldGoal=group.order==='garrison'?{...a.fieldPost}:group.phase==='reserve'?{...a.fieldHome}:formationGoal(s,leader,goal,i,group.cohesion,hooks);
      if(group.order==='garrison'){a.fieldWaiting=false;a.home={x:a.fieldPost.x,y:a.fieldPost.y};}
    }
    if(allied)planBuddyAid(s,group,members,hooks);
    if(allied&&s.time-group.lastVoiceAt>28+(group.id==='field-raven'?4:0)&&!['reserve','complete'].includes(group.phase)){
      const situation=group.withdrawing?'withdraw':contacting?'contact':group.phase==='regroup'?'regroup':['hold','support_hold','recover'].includes(group.phase)?'hold':s.time>10?'moving':null;
      if(situation){
        const lines=FIELD_LINES[situation],text=`${group.callsign}, ${lines[(group.voiceTurn+++(mix(s.seed,leader.id)%lines.length))%lines.length]}`;
        const category=situation==='withdraw'?'backup':['moving','regroup'].includes(situation)?'move':situation;
        hooks.soundEvent(s,'field_voice',leader,{category,text,sourceTime:s.time});group.lastVoiceAt=s.time;
      }
    }
  }
}

export function moveOnAssignment(s,a,dt,speed,hooks){
  if(!a.fieldSquadId||!s.fieldSquads?.enabled||s.maxEnemies<=0)return false;
  if(a.fieldWaiting){a.moving=false;a.tactic='regroup';return true;}
  if(a.fieldGoal){
    hooks.navigate(s,a,a.fieldGoal,speed*(1-a.suppression*.2),dt,a.fieldPost?6:20);
    a.tactic=a.fieldRetreat?'withdraw':a.moving?'patrol':a.fieldPost?'guard':'hold';return true;
  }return false;
}

/** A finite grenade belongs to the actual actor. Throw only at a current,
 * visible close contact with clear travel and a safe distance from bystanders.
 * No scripted booms are generated merely because the player is far away.
 */
export function tryFieldGrenade(s,a,target,hooks,sourceTime){
  if(!target||!a.fieldSquadId||a.frags<=0||s.time<8||a.moving||a.suppression>.55||a.reloadTimer>0)return false;
  const group=s.fieldSquads?.groups.find(g=>g.id===a.fieldSquadId);
  if(!group||group.grenadeUsed||s.time-group.lastContactAt>2)return false;
  const range=distance(a,target);if(range<145||range>225||!hooks.combatLOS(s,a,target))return false;
  const protectedPeople=a.team==='allied'?[...s.squad,...s.allies,...s.civilians,...s.survivors]:[...s.enemies,...s.civilians];
  if(protectedPeople.some(other=>other.alive&&distance(other,target)<140))return false;
  if(!hooks.throwHandGrenade(s,a,{aimX:target.x,aimY:target.y},'frag',sourceTime))return false;
  group.grenadeUsed=true;return true;
}
