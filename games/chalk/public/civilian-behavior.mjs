// Civilians react to events they can hear nearby and use the same doors and
// collision-safe navigation as the squad. A shelter is a place behind cover,
// not an arbitrary point displaced a few metres into the next street.
import { buildingAt } from './building-geometry.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const shelterCache=new WeakMap();
const HEARING={shot:560,explosion:720,impact:220,victim_hit:200};

function interiorSpots(world){
  let cached=shelterCache.get(world);
  if(cached)return cached;
  cached=[];
  for(const building of world.buildings||[]){
    if(!building.enterable)continue;
    for(const room of building.rooms||[]){
      // Side positions keep the door-to-door lane open and put a wall between
      // the resident and the street. Furnishings are decorative in this game.
      const xs=[room.x+24,room.x+room.w-24],ys=[room.y+27,room.y+room.h-27];
      for(const x of xs)for(const y of ys)if(room.w>48&&room.h>54)cached.push({x,y,buildingId:building.id});
    }
  }
  shelterCache.set(world,cached);return cached;
}

function blockedFrom(s,point,threat,hooks){return Boolean(threat)&&!hooks.hasLineOfSight(s,point,threat);}

function candidates(s,c,threat,hooks){
  const current=buildingAt(s.world,c);
  return interiorSpots(s.world).filter(point=>distance(c,point)<760&&hooks.free(s,point.x,point.y,15)).map(point=>{
    const covered=blockedFrom(s,point,threat,hooks),crowding=s.civilians.reduce((n,other)=>n+(other!==c&&other.alive&&distance(other.shelterAssigned?other.shelter:other,point)<34?75:0),0);
    const nearThreat=threat?Math.max(0,190-distance(point,threat)):0;
    return {...point,score:distance(c,point)+(threat?(covered?-220:200):0)+nearThreat+crowding-(current?.id===point.buildingId?25:0)};
  }).sort((a,b)=>a.score-b.score||a.x-b.x||a.y-b.y);
}

function chooseShelter(s,c,threat,hooks){
  const shortlist=candidates(s,c,threat,hooks);let best=null,bestScore=Infinity,attempts=0;
  for(const candidate of shortlist){
    if(attempts++>=5)break;
    const route=hooks.findPath(s,c,candidate);if(!route.length)continue;
    let length=0,exposure=0,previous=c;
    for(const point of route){length+=distance(previous,point);if(threat&&distance(point,threat)<230&&hooks.hasLineOfSight(s,point,threat))exposure+=75;previous=point;}
    // Score the actual route so a nearby spot with a long walk around its wall
    // does not beat a slightly farther room with a usable door in this street.
    const score=candidate.score+length*.35+exposure;
    if(score<bestScore){bestScore=score;best={x:candidate.x,y:candidate.y,buildingId:candidate.buildingId};}
  }
  if(best)return best;
  // Legacy/custom worlds may have solid footprints with no enterable rooms.
  // Use reachable shadowed ground; never teleport through a wall or run at it.
  if(threat){
    const away=Math.atan2(c.y-threat.y,c.x-threat.x),fallback=[];
    for(const turn of [0,-.65,.65,-1.2,1.2])for(const radius of [105,190]){
      const point={x:c.x+Math.cos(away+turn)*radius,y:c.y+Math.sin(away+turn)*radius};
      if(hooks.free(s,point.x,point.y,15))fallback.push({...point,score:(blockedFrom(s,point,threat,hooks)?-300:0)-distance(point,threat)*.2+radius});
    }
    fallback.sort((a,b)=>a.score-b.score);
    for(const point of fallback.slice(0,3))if(hooks.findPath(s,c,point).length)return{x:point.x,y:point.y};
  }
  return null;
}

/** Some ordinary residents begin indoors; aid setup can reposition its own NPC. */
export function seedCivilianShelters(s,hooks){
  for(let i=0;i<s.civilians.length;i++){
    const c=s.civilians[i];c.civilianState='idle';c.shelterAssigned=false;
    if(i%3!==1||c.needsAid||c.transportWaiting)continue;
    const home=candidates(s,c,null,hooks)[0];if(!home)continue;
    c.x=home.x;c.y=home.y;c.shelter={x:home.x,y:home.y,buildingId:home.buildingId};
    c.shelterAssigned=true;c.shelterRevision=s.world.geometryRevision||0;c.civilianState='sheltered';
  }
}

function heardThreat(s,c,events,hooks){
  let chosen=null,best=Infinity;
  for(const event of events){
    if(event.id<=(c.lastThreatSoundId||0))continue;
    const d=distance(c,event),range=HEARING[event.type];
    // Masonry softens reports; a nearby detonation/impact is still perceptible.
    const audible=hooks.hasLineOfSight(s,c,event)?range:range*.62;
    if(d>audible)continue;
    const urgency=d/(event.type==='explosion'?2:event.type==='impact'?1.6:1);
    if(urgency<best){best=urgency;chosen=event;}
  }
  return chosen;
}

export function updateCivilianBehavior(s,dt,hooks){
  const threats=s.soundEvents.filter(event=>HEARING[event.type]&&s.time-event.time<=.45);
  const latestId=threats.reduce((id,event)=>Math.max(id,event.id),0);
  // A single loud event may alarm the whole street. Spread refuge searches
  // over a few frames rather than running every resident's A* on that tick.
  let plansRemaining=2;
  for(const c of s.civilians){
    if(!c.alive||c.evacuated||c.downed)continue;
    const threat=heardThreat(s,c,threats,hooks);
    if(threat){
      c.lastThreatSoundId=latestId;c.panicked=14;c.lastDanger={x:threat.x,y:threat.y,type:threat.type,time:s.time};
      if(s.time-(c.lastFearAt??-100)>=10&&s.time-(s.lastFearAt??-100)>=4){
        c.lastFearAt=s.time;s.lastFearAt=s.time;
        hooks.soundEvent(s,'civilian_fear',c,{victimId:c.id,cause:threat.type==='explosion'?'blast':'bullet',alive:true,downed:false});
      }
    }
    c.panicked=Math.max(0,(c.panicked||0)-dt);
    if(c.needsAid||c.transportWaiting){c.wasAwaitingAid=true;c.civilianState=c.panicked>0?'cowering':'idle';c.moving=false;continue;}
    const released=c.wasAwaitingAid;c.wasAwaitingAid=false;
    const danger=c.panicked>0?c.lastDanger:null;
    const goal=c.shelter,revision=s.world.geometryRevision||0;
    const unsafe=goal&&danger&&!blockedFrom(s,goal,danger,hooks);
    const invalid=!goal||!hooks.free(s,goal.x,goal.y,15);
    const shouldPlan=released||!c.shelterAssigned&&(c.panicked>0||s.time>12+(c.id%5)*.3)||invalid||c.shelterAssigned&&c.shelterRevision!==revision||unsafe&&Boolean(threat)||c.shelterBlockedFor>1.4;
    if(shouldPlan&&s.time>=(c.nextShelterPlanAt||0)&&plansRemaining>0){
      plansRemaining--;
      c.nextShelterPlanAt=s.time+1.3+(c.id%5)*.12;
      const destination=chooseShelter(s,c,danger,hooks);
      if(destination){c.shelter=destination;c.shelterAssigned=true;c.shelterRevision=revision;c.path=[];c.pathTimer=0;c.shelterBlockedFor=0;}
      else{c.civilianState='cowering';c.moving=false;continue;}
    }
    if(!c.shelterAssigned){c.civilianState=c.panicked>0?'cowering':'idle';c.moving=false;continue;}
    const before=distance(c,c.shelter),arrived=hooks.navigate(s,c,c.shelter,c.panicked>0?108:44,dt,3);
    if(arrived){
      c.shelterBlockedFor=0;c.moving=false;
      c.civilianState=buildingAt(s.world,c)||blockedFrom(s,c,danger,hooks)?'sheltered':'cowering';
    }else{
      c.civilianState='fleeing';
      const progress=before-distance(c,c.shelter);c.shelterBlockedFor=progress>.02||c.moving?0:(c.shelterBlockedFor||0)+dt;
    }
  }
}
