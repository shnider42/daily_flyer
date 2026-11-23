// CHALK — deterministic, browser-independent solo and authoritative co-op simulation.
// Fictional squad and compressed mission geography inspired by October 1993.
import { getSolidWalls, prepareBuildingInteriors, buildingAt } from './building-geometry.mjs';
import { roleProfile, movementSpeed, visionRange, AI_FIRE_DISCIPLINE } from './squad-roles.mjs';
import { varyWorldLayout } from './world-variation.mjs';
import { recordDeadActors, recordBloodHit } from './bodies.mjs';
import { initializeStory, updateStory, finalizeStory, chooseOption, storyInteraction } from './story.mjs';
import { WORLD_UNITS_PER_METRE, ballisticProfile, enemyProfile, encounterBudget, canAddEnemy } from './combat-profiles.mjs';
import { squadCanSeePoint } from './visibility.mjs';
import { createDestructionState, breachAtBlast } from './destruction.mjs';
import { seedCivilianShelters, updateCivilianBehavior } from './civilian-behavior.mjs';
export { campaignOutcome, normalizeCampaignCarry } from './story.mjs';
export { getSolidWalls, buildingAt } from './building-geometry.mjs';
import { MISSIONS, stagesFor, getNextCampaignMission, nightMission } from './mission-definitions.mjs';
import { initializeOperations, updateOperations, operationWork, missionInteraction, missionActionTarget, operationItem } from './operations.mjs';
import { initializeEncounters, updateEncounters } from './encounters.mjs';
import { HAND_GRENADES, flashIntensity, flashExposure, applyFlashStatus } from './hand-grenades.mjs';
export { MISSIONS, getNextCampaignMission } from './mission-definitions.mjs';

export const DIFFICULTIES = { story:{enemyDamage:7,enemyHp:54,maxEnemies:10,spawnDelay:17,playerHp:140}, standard:{enemyDamage:10,enemyHp:72,maxEnemies:16,spawnDelay:18,playerHp:120}, veteran:{enemyDamage:15,enemyHp:92,maxEnemies:20,spawnDelay:14,playerHp:100} };
const W=2400,H=1900,CELL=40,COLS=W/CELL,ROWS=Math.ceil(H/CELL);
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sq=(x)=>x*x;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
function random(s){s.rngState=(Math.imul(s.rngState,1664525)+1013904223)>>>0;return s.rngState/4294967296;}
function range(s,a,b){return a+(b-a)*random(s);}
function radio(s,speaker,text){const who=s.squad.find(a=>a.name.toUpperCase()===speaker);s.radio.push({id:++s.nextId,time:s.time,speaker,text,...(who?{actorId:who.id,x:who.x,y:who.y}:{})});if(s.radio.length>10)s.radio.shift();}
function effect(s,type,x,y,ttl=.2,angle=0,metadata={}){s.effects.push({type,x,y,ttl,maxTtl:ttl,angle,...metadata});if(s.effects.length>220)s.effects.shift();}
function weaponFor(a){return a.team==='enemy'?enemyProfile(a).weapon:roleProfile(a).weapon;}
function soundEvent(s,type,a,extra={}){
  // Audio reads a separate event ring: a brief muzzle flash may expire between
  // render frames while catch-up simulation still needs to produce its sound.
  const event={id:++s.nextId,time:s.time,type,x:a.x,y:a.y,team:a.team,actorId:a.id,weapon:weaponFor(a),...extra};
  s.soundEvents.push(event);
  if(s.soundEvents.length>128)s.soundEvents.splice(0,s.soundEvents.length-128);
}
function rectContains(r,x,y,pad=0){return x>=r.x-pad&&x<=r.x+r.w+pad&&y>=r.y-pad&&y<=r.y+r.h+pad;}
export function segmentRectEntry(a,b,r,pad=0){
  // Most rays are local. Reject distant rectangles before allocating clip pairs.
  if(Math.max(a.x,b.x)<r.x-pad||Math.min(a.x,b.x)>r.x+r.w+pad||Math.max(a.y,b.y)<r.y-pad||Math.min(a.y,b.y)>r.y+r.h+pad)return Infinity;
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x+pad],[dx,r.x+r.w+pad-a.x],[-dy,a.y-r.y+pad],[dy,r.y+r.h+pad-a.y]]){
    if(Math.abs(p)<1e-8){if(q<0)return Infinity;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return Infinity;}
  }return lo;
}
function segmentRect(a,b,r,pad=0){return Number.isFinite(segmentRectEntry(a,b,r,pad));}
export function hasLineOfSight(s,a,b){return !getSolidWalls(s.world).some(r=>segmentRect(a,b,r));}
function walkLine(s,a,b,r=15){return !getSolidWalls(s.world).some(ob=>segmentRect(a,b,ob,r));}
function free(s,x,y,r=15){return x>=r&&y>=r&&x<=W-r&&y<=H-r&&!getSolidWalls(s.world).some(b=>rectContains(b,x,y,r));}
function nearbyFree(s,x,y,radius=15){
  x=clamp(x,25,W-25);y=clamp(y,25,H-25);if(free(s,x,y,radius))return{x,y};
  for(let ring=1;ring<15;ring++)for(let i=0;i<ring*8;i++){const a=TAU*i/(ring*8),p={x:x+Math.cos(a)*ring*24,y:y+Math.sin(a)*ring*24};if(free(s,p.x,p.y,radius))return p;}
  return{x:200,y:1720};
}
function makeWorld(s){
  const world={width:W,height:H,buildings:[],props:[],roads:[]};s.world=world;
  const xs=[200,680,1160,1640,2120],ys=[200,580,960,1340,1720];
  xs.forEach(x=>world.roads.push({x:x-69,y:0,w:138,h:H}));ys.forEach(y=>world.roads.push({x:0,y:y-65,w:W,h:130}));
  // Narrow alleys split city blocks without obstructing the main mission routes.
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    const bx=xs[col]+90,by=ys[row]+86,bw=300,bh=205;
    if((row+col+s.missionIndex)%3===0){
      world.buildings.push({id:`b${row}${col}a`,x:bx,y:by,w:130+range(s,-8,8),h:bh,tone:random(s)});
      world.buildings.push({id:`b${row}${col}b`,x:bx+184,y:by+range(s,-5,8),w:116,h:bh-12,tone:random(s)});
    }else{
      world.buildings.push({id:`b${row}${col}`,x:bx,y:by,w:bw,h:bh,tone:random(s)});
    }
    const cx=xs[col]+80,cy=ys[row]+48;
    world.props.push({type:'rubble',x:cx,y:cy,w:22,h:15,angle:range(s,0,TAU)});
    if((row+col)%2===0)world.props.push({type:'car',x:xs[col]+43,y:ys[row]+140,w:27,h:55,angle:0});
    if(row===2&&col<3)for(let k=0;k<3;k++)world.props.push({type:'stall',x:xs[col]+95+k*61,y:ys[row+1]-48,w:48,h:28,angle:0});
  }
  varyWorldLayout(world,s.seed,s.missionIndex);
  prepareBuildingInteriors(world);
  for(let i=0;i<80;i++){const p=nearbyFree(s,range(s,70,W-70),range(s,70,H-70));world.props.push({type:i%3===0?'crate':'debris',x:p.x,y:p.y,w:range(s,5,16),h:range(s,5,13),angle:range(s,0,TAU)});}
  world.props.push({type:'stadium',x:2180,y:12,w:200,h:115});
  rebuildNavigationGrid(s);
}

/** Geometry changes are rare; rebuild this small grid once, never per frame. */
export function rebuildNavigationGrid(s){
  s.grid ||= new Uint8Array(COLS*ROWS);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)s.grid[y*COLS+x]=free(s,x*CELL+CELL/2,y*CELL+CELL/2,17)?0:1;
}
export function applyBreach(s,impact){
  s.destruction ||= createDestructionState();
  const result=breachAtBlast(s.world,s.destruction,impact);if(!result.changed)return result;
  rebuildNavigationGrid(s);
  for(const a of [...s.squad,...s.enemies,...s.civilians,...s.survivors]){
    a.path=[];a.pathTarget=null;a.pathTimer=0;
    if(a.team==='enemy'){a.senseTimer=0;a.flankGoal=null;a.nextFlankAt=0;}
  }
  s.visibilityTimer=0;
  for(const opening of result.created)effect(s,'breach',opening.x,opening.y,.7,opening.angle,{seen:squadCanSeePoint(s,opening)});
  return result;
}

// Per-world edge clearance is cached outside snapshots. Thin walls may sit
// between two free grid centres, so node occupancy alone is insufficient.
const navigationEdges=new WeakMap();
function navigationEdge(s,from,to,dx,dy,radius=13){
  const walls=getSolidWalls(s.world),revision=s.world.geometryRevision||0;
  let cache=navigationEdges.get(s.world);
  if(!cache||cache.walls!==walls||cache.wallCount!==walls.length||cache.revision!==revision||cache.grid!==s.grid){
    cache={walls,wallCount:walls.length,revision,grid:s.grid,edges:new Map()};navigationEdges.set(s.world,cache);
  }
  if(!cache.edges.has(radius))cache.edges.set(radius,new Uint8Array(s.grid.length*9));
  const edges=cache.edges.get(radius),key=from*9+(dy+1)*3+dx+1;
  if(!edges[key]){
    const clear=walkLine(s,nodePoint(from),nodePoint(to),radius);edges[key]=clear?1:2;
    edges[to*9+(1-dy)*3+1-dx]=edges[key];
  }
  return edges[key]===1;
}
function nodeFor(s,p,radius=13){
  const gx=clamp(Math.floor(p.x/CELL),0,COLS-1),gy=clamp(Math.floor(p.y/CELL),0,ROWS-1);
  const reachable=id=>!s.grid[id]&&walkLine(s,p,nodePoint(id),radius);
  if(reachable(gy*COLS+gx))return gy*COLS+gx;
  for(let r=1;r<12;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;const x=gx+dx,y=gy+dy;
    if(x>=0&&y>=0&&x<COLS&&y<ROWS&&reachable(y*COLS+x))return y*COLS+x;
  }return -1;
}
const nodePoint=(id)=>({x:(id%COLS)*CELL+CELL/2,y:Math.floor(id/COLS)*CELL+CELL/2});
// Bounded A*; coordinates are world pixels. Useful for AI and deterministic tests.
export function findPath(s,from,to){
  const radius=clamp(Math.ceil(from.radius||13),9,17),end=nearbyFree(s,to.x,to.y,radius);if(walkLine(s,from,end,radius))return[end];
  const start=nodeFor(s,from,radius),goal=nodeFor(s,end,radius);if(start<0||goal<0)return[];
  if(start===goal){const middle=nodePoint(start);return walkLine(s,from,middle,radius)&&walkLine(s,middle,end,radius)?[middle,end]:[];}
  const g=new Float32Array(s.grid.length).fill(Infinity),prev=new Int32Array(s.grid.length).fill(-1),closed=new Uint8Array(s.grid.length),heap=[];
  const goalX=goal%COLS,goalY=Math.floor(goal/COLS);
  function push(id,cost){const n={id,cost};heap.push(n);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].cost<=cost)break;heap[i]=heap[p];i=p;}heap[i]=n;}
  function pop(){const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(heap[c].cost>=last.cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out.id;}
  g[start]=0;push(start,0);let iterations=0;
  while(heap.length&&iterations++<4000){const n=pop();if(closed[n])continue;if(n===goal)break;closed[n]=1;const x=n%COLS,y=Math.floor(n/COLS);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx===0&&dy===0)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;const id=ny*COLS+nx;
      if(s.grid[id]||closed[id]||(dx&&dy&&(s.grid[y*COLS+nx]||s.grid[ny*COLS+x]))||!navigationEdge(s,n,id,dx,dy,radius))continue;
      const cost=g[n]+(dx&&dy?1.4142:1);if(cost<g[id]){g[id]=cost;prev[id]=n;push(id,cost+Math.hypot(nx-goalX,ny-goalY));}
    }
  }
  if(prev[goal]===-1)return[];
  const route=[];for(let n=goal;n!==start&&n!==-1;n=prev[n])route.push(nodePoint(n));route.push(nodePoint(start));route.reverse();route.push(end);
  // Keep the start attachment and every corner until a complete, radius-expanded
  // shortcut clears it. A skipped threshold must never turn into a wall crossing.
  const short=[];let at=from,index=0;
  while(index<route.length){let far=index;for(let j=index+1;j<route.length;j++){if(walkLine(s,at,route[j],radius))far=j;else break;}if(!walkLine(s,at,route[far],radius))return[];short.push(route[far]);at=route[far];index=far+1;}
  return short;
}
function move(s,a,dx,dy){
  const r=a.radius||13;const nx=clamp(a.x+dx,r,W-r),ny=clamp(a.y+dy,r,H-r);
  if(free(s,nx,a.y,r))a.x=nx;if(free(s,a.x,ny,r))a.y=ny;
}

// Sparse, physical cover edges are shared by the whole district. Only nearby
// candidates are scored, and route searches run on a staggered planning clock.
// The cache stays outside authoritative snapshots and follows real breaches.
const coverCache=new WeakMap();
function coverCandidates(s){
  const walls=getSolidWalls(s.world),revision=s.world.geometryRevision||0;
  let cached=coverCache.get(s.world);
  if(cached&&cached.walls===walls&&cached.count===walls.length&&cached.revision===revision)return cached.points;
  const points=[],seen=new Set(),padding=24;
  for(const wall of walls){
    if(wall.w<3||wall.h<3)continue;
    const left=wall.x-padding,right=wall.x+wall.w+padding,top=wall.y-padding,bottom=wall.y+wall.h+padding;
    const middleX=wall.x+wall.w/2,middleY=wall.y+wall.h/2;
    for(const [x,y] of [[left,top],[right,top],[left,bottom],[right,bottom],[left,middleY],[right,middleY],[middleX,top],[middleX,bottom]]){
      if(x<25||y<25||x>W-25||y>H-25)continue;
      const key=`${Math.round(x/8)}:${Math.round(y/8)}`;if(seen.has(key))continue;seen.add(key);points.push({x,y});
    }
  }
  cached={walls,count:walls.length,revision,points};coverCache.set(s.world,cached);return points;
}
function approachPositions(s,base,kind){
  // Keep the authored sniper's long sightline. Other members begin beside a
  // real wall or parked vehicle overlooking their own approach, when possible.
  if(kind==='sniper')return [base];
  return coverCandidates(s).filter(p=>distance(p,base)<115&&free(s,p.x,p.y,15)&&!buildingAt(s.world,p)&&hasLineOfSight(s,p,base))
    .sort((a,b)=>distance(a,base)-distance(b,base)).slice(0,8);
}
function planCover(s,a,threat,anchor=a.home||a,maxTravel=170,leash=220){
  const revision=s.world.geometryRevision||0;
  if(s.time<(a.nextCoverPlanAt||0)&&a.coverRevision===revision&&a.coverAnchor&&distance(a.coverAnchor,anchor)<70)return;
  a.nextCoverPlanAt=s.time+2.5+(a.id%5)*.19;a.coverRevision=revision;a.coverAnchor={x:anchor.x,y:anchor.y};
  const allies=a.team==='enemy'?s.enemies:s.squad;
  const candidates=coverCandidates(s).filter(p=>distance(a,p)<=maxTravel&&distance(anchor,p)<=leash&&free(s,p.x,p.y,a.radius||13)&&
    (!a.defensive||distance(a.home,p)<(a.defenseRadius||310))&&
    !allies.some(other=>other!==a&&other.alive&&!other.downed&&(distance(other,p)<42||other.coverPoint&&distance(other.coverPoint,p)<46)))
    .sort((p,q)=>distance(a,p)+distance(anchor,p)*.3-distance(a,q)-distance(anchor,q)*.3).slice(0,22);
  const visible=[],sheltered=[];
  for(const point of candidates){
    const score=distance(a,point)*.65+distance(anchor,point)*.35-(a.coverPoint&&distance(point,a.coverPoint)<8?35:0);
    if(combatLOS(s,point,threat))visible.push({point,score});
    else{
      const len=Math.max(1,distance(point,threat)),dx=-(point.y-threat.y)/len*17,dy=(point.x-threat.x)/len*17;
      if(!hasLineOfSight(s,{x:point.x+dx,y:point.y+dy},threat)&&!hasLineOfSight(s,{x:point.x-dx,y:point.y-dy},threat))sheltered.push({point,score});
    }
  }
  const reachable=list=>{
    for(const {point} of list.sort((p,q)=>p.score-q.score).slice(0,3)){
      const path=findPath(s,a,point);if(!path.length)continue;
      let length=0,previous=a;for(const next of path){length+=distance(previous,next);previous=next;}
      if(length<=maxTravel*1.8)return{x:point.x,y:point.y};
    }return null;
  };
  a.coverPoint=reachable(visible);
  // A reload/suppression refuge must be a nearby step off the firing edge,
  // rather than a long unexplained retreat into a different building.
  a.coverShelter=reachable(sheltered.filter(({point})=>distance(point,a.coverPoint||a)<115));
}
function navigate(s,a,target,speed,dt,stop=12){
  if(flashIntensity(a,s.time)>.25){a.moving=false;return false;}
  const radius=a.radius||13,remaining=distance(a,target);
  // An exterior formation slot can be close to a doorway. Do not finish at
  // its usual arrival radius while the follower's body is still across that
  // threshold; clearing the footprint also leaves the door usable by others.
  if(remaining<=stop&&!buildingAt(s.world,target)&&(s.world.buildings||[]).some(b=>b.enterable&&rectContains(b,a.x,a.y,radius+1)))stop=Math.min(stop,6);
  // A nearby point may be in another room. Proximity only counts when the
  // actor can reach the target on its own side of the wall.
  if(remaining<=stop&&walkLine(s,a,target,radius)){a.moving=false;a.navStalled=0;return true;}
  a.pathTimer=(a.pathTimer||0)-dt;
  const shifted=!a.pathTarget||distance(target,a.pathTarget)>65;
  if(!a.path||a.pathTimer<=0||shifted){a.path=findPath(s,a,target);a.pathTarget={x:target.x,y:target.y};a.pathTimer=.9+(a.id%7)*.045;}
  // Once the final leg is clear, track a moving leader smoothly instead of
  // waiting at their old position for the next scheduled path refresh.
  if(a.path.length===1&&walkLine(s,a,target,radius)){a.path[0]={x:target.x,y:target.y};a.pathTarget={x:target.x,y:target.y};}
  // The old 18px pop radius could discard the final destination outside its
  // 12/15px completion radius, or skip a turn while still beside the door frame.
  while(a.path.length>1&&distance(a,a.path[0])<18&&walkLine(s,a,a.path[1],radius))a.path.shift();
  const dest=a.path[0];if(!dest){a.moving=false;return false;}
  const dx=dest.x-a.x,dy=dest.y-a.y,len=Math.hypot(dx,dy),amount=Math.min(speed*dt,len);
  const beforeX=a.x,beforeY=a.y;
  if(len){move(s,a,dx/len*amount,dy/len*amount);if(!a.target)a.angle=Math.atan2(dy,dx);}
  const moved=Math.hypot(a.x-beforeX,a.y-beforeY);a.moving=moved>.01;
  a.navStalled=moved<amount*.12?(a.navStalled||0)+dt:0;
  if(a.path.length>1&&distance(a,dest)<.6)a.path.shift();
  if(a.navStalled>.45){a.path=[];a.pathTimer=0;a.navStalled=0;}
  const finalDistance=distance(a,target);
  if(finalDistance>stop)return false;
  // A move can cross into the arrival band this tick. Flankers use the return
  // value to settle, so apply the same doorway rule after movement as before it.
  if(stop>6&&!buildingAt(s.world,target)&&(s.world.buildings||[]).some(b=>b.enterable&&rectContains(b,a.x,a.y,radius+1)))stop=6;
  return finalDistance<=stop&&walkLine(s,a,target,radius);
}
function actor(s,team,name,kind,x,y,extra={}){return{id:++s.nextId,team,name,kind,x,y,angle:-Math.PI/2,hp:100,maxHp:100,alive:true,downed:false,radius:13,cooldown:range(s,.1,.8),suppression:0,reloadTimer:0,ammo:30,magSize:30,reserve:180,path:[],pathTimer:0,reviveProgress:0,bleed:0,visible:team!=='enemy',...extra};}
export function createGame({mission=0,role='leader',difficulty='standard',seed=19931003,campaign=null}={}){
  const missionIndex=clamp(Math.floor(finite(mission)),0,MISSIONS.length-1);if(!DIFFICULTIES[difficulty])difficulty='standard';role=role==='member'?'member':'leader';
  const s={missionIndex,mission:MISSIONS[missionIndex],role,difficulty,seed,rngState:(seed>>>0)||1,time:0,status:'playing',endReason:'',nextId:0,world:null,squad:[],enemies:[],civilians:[],survivors:[],vehicles:[],bullets:[],grenades:[],effects:[],soundEvents:[],smokes:[],bodies:[],bloodstains:[],objective:null,stageIndex:0,stageCount:0,progress:0,radio:[],stats:{shots:0,hits:0,squadDowns:0,rescued:0,civilianHarm:0,objectives:0,elapsed:0},order:{type:'follow',x:200,y:1720,label:'Regroup on you'},leaderOrder:'Move to the first rally point',playerId:null,waitUntil:0,spawnTimer:16,visibilityTimer:0,aidTimer:0,maxEnemies:DIFFICULTIES[difficulty].maxEnemies,convoyIndex:0,convoyClear:0,convoyCleared:[],lastLeaderState:'',lastCommand:-20,lastSniperAt:-100,lastFearAt:-100,phaseTime:0};
  s.pings=[];s.nextPingId=0;
  s.destruction=createDestructionState();
  makeWorld(s);
  const hp=DIFFICULTIES[difficulty].playerHp;
  s.squad=[['Hale','leader',200,1720],['Mercer','grenadier',260,1768],['Ames','medic',140,1768],['Webb','support',200,1824]].map(([name,role,x,y])=>{
    const loadout=roleProfile(role);
    return actor(s,'squad',name,role,x,y,{role,hp,maxHp:hp,smokes:role==='leader'||role==='grenadier'?3:2,medkits:loadout.medkits,ammo:loadout.magSize,magSize:loadout.magSize,reserve:loadout.reserve,grenades:role==='grenadier'?4:0,grenadeCooldown:0,frags:2,flashbangs:2,handThrowCooldown:0,observing:false});
  });
  s.playerId=role==='leader'?s.squad[0].id:s.squad[1].id;
  player(s).cooldown=0;
  s.stages=stagesFor(missionIndex);s.stageCount=s.stages.length;
  if(missionIndex===1){
    s.vehicles.push({id:++s.nextId,x:1160,y:960,angle:.65,w:150,h:60,hp:0,maxHp:100,kind:'helicopter',active:false,name:'Downed helicopter'});
    s.survivors.push(actor(s,'survivor','Crew 1','crew',1110,950,{hp:40,maxHp:70,downed:true,stabilized:false,radius:12}),actor(s,'survivor','Crew 2','crew',1215,1020,{hp:40,maxHp:70,downed:true,stabilized:false,radius:12}));
  }
  if(missionIndex===0){s.convoyRoute=[{x:1160,y:960},{x:680,y:960},{x:680,y:580},{x:1160,y:580},{x:1640,y:580}];s.vehicles.push({id:++s.nextId,x:1160,y:960,angle:Math.PI,w:72,h:35,hp:180,maxHp:180,kind:'truck',active:false,name:'Collection transport'},{id:++s.nextId,x:1265,y:960,angle:Math.PI,w:72,h:35,hp:180,maxHp:180,kind:'truck',active:false,name:'Collection transport'});}
  if(missionIndex===2){
    s.convoyRoute=[{x:200,y:1340},{x:680,y:1340},{x:1160,y:1340,blocked:true},{x:1160,y:960},{x:1640,y:960,blocked:true,repair:true},{x:2120,y:960},{x:2120,y:580}];
    s.vehicles.push({id:++s.nextId,x:200,y:1340,angle:-Math.PI/2,w:80,h:41,hp:220,maxHp:220,kind:'apc',active:true,waiting:true,name:'Relief lead'},{id:++s.nextId,x:200,y:1455,angle:-Math.PI/2,w:80,h:41,hp:220,maxHp:220,kind:'apc',active:true,name:'Relief carrier'},{id:++s.nextId,x:200,y:1570,angle:-Math.PI/2,w:72,h:36,hp:180,maxHp:180,kind:'truck',active:true,name:'Casualty transport'});
    s.convoyRoute.filter(p=>p.blocked&&!p.repair).forEach(p=>s.world.props.push({type:'barricade',x:p.x,y:p.y,w:82,h:23,cleared:false}));
  }
  if(missionIndex===7){
    s.convoyRoute=[{x:680,y:1720},{x:740,y:1720,blocked:true,repair:true},{x:1160,y:1720},{x:1640,y:1720},{x:1640,y:1340,blocked:true},{x:2120,y:1340},{x:2120,y:960}];
    s.vehicles.push({id:++s.nextId,x:680,y:1720,angle:0,w:72,h:36,hp:180,maxHp:180,kind:'truck',active:true,waiting:true,name:'Stranded transport'},
      {id:++s.nextId,x:560,y:1720,angle:0,w:72,h:36,hp:180,maxHp:180,kind:'truck',active:true,waiting:true,name:'Following transport'});
    s.convoyRoute.filter(p=>p.blocked&&!p.repair).forEach(p=>s.world.props.push({type:'barricade',x:p.x,y:p.y,w:82,h:23,cleared:false}));
  }
  for(let i=0;i<10;i++){
    const x=[680,1160,1640,2120][i%4]+range(s,-45,45),y=[580,960,1340][i%3]+range(s,-40,40);
    s.civilians.push(actor(s,'civilian',`Civilian ${i+1}`,'civilian',x,y,{hp:45,maxHp:45,radius:11,shelter:nearbyFree(s,x+range(s,-130,130),y+range(s,-130,130)),panicked:0}));
  }
  seedCivilianShelters(s,{free,hasLineOfSight,findPath,walkLine,navigate,soundEvent});
  initializeOperations(s,operationHooks);
  seedEnemies(s);
  initializeStory(s,campaign,storyHooks);
  updateObjective(s);
  radio(s,'RADIO','Chalk, stay together. Watch for civilians.');
  radio(s,'HALE',role==='member'?'On me, Mercer. I will call our route.':'Chalk ready. We are following your lead.');
  return s;
}

function seedEnemies(s){initializeEncounters(s,encounterHooks);}
const encounterHooks={nearbyFree,canAddEnemy,squadCanSeePoint,spawnEnemy,approachPositions};
function spawnEnemy(s,p,allowSniper=false,preferredKind=null){
  if(!canAddEnemy(s,'rifleman'))return false;
  const hp=DIFFICULTIES[s.difficulty].enemyHp,sniper=allowSniper&&s.time-s.lastSniperAt>90&&canAddEnemy(s,'sniper')&&random(s)<.08;
  let kind=preferredKind||(sniper?'sniper':null);
  if(!kind){const roll=random(s);kind=roll<.17?'gunner':roll<.36?'flanker':'rifleman';}
  if(!canAddEnemy(s,kind))kind='rifleman';
  const profile=enemyProfile(kind);
  if(kind==='sniper')s.lastSniperAt=s.time;
  s.enemies.push(actor(s,'enemy',profile.name,kind,p.x,p.y,{hp,maxHp:hp,home:{...p},ammo:profile.magazine,magSize:profile.magazine,reserve:profile.reserve,
    alert:false,accuracy:range(s,...profile.spread),aimCharge:0,aimTargetId:null,braceProgress:0,braced:false,
    senseTimer:(s.nextId%5)*.04,perceivedTargetId:null,lastKnown:null,lastSeenAt:-100,flankSide:random(s)<.5?-1:1,nextFlankAt:0,tactic:'watch'}));
  return true;
}
function aliveSquad(s){return s.squad.filter(a=>a.alive&&!a.downed);}
function player(s){return s.squad.find(a=>a.id===s.playerId);}
function controlled(s,a){return !!a&&(s.coop?(s.humanIds||[]).includes(a.id):a.id===s.playerId);}
function humans(s){return s.squad.filter(a=>controlled(s,a));}
function inputFor(s,a,inputs){
  if(!controlled(s,a))return{};
  const input=s.coop?(inputs instanceof Map?inputs.get(a.id):inputs?.[a.id]):inputs;
  return input&&typeof input==='object'?input:{};
}
function currentLeader(s){return s.squad.find(a=>a.role==='leader'&&a.alive&&!a.downed)||(s.coop?humans(s).find(a=>a.alive&&!a.downed):null)||s.squad.find(a=>a.alive&&!a.downed&&a.id!==s.playerId)||player(s);}
const storyHooks={radio,controlled,currentLeader,hasLineOfSight,combatLOS,nearbyFree,soundEvent,inputFor};
const operationHooks={...storyHooks,free,findPath,actor,advance};
export function getMissionInteraction(s,actorId=s.playerId){
  const action=missionInteraction(s,actorId,operationHooks);if(action)return action;
  const a=s.squad.find(a=>a.id===actorId),o=s.objective;
  if(o?.kind==='repair'&&a?.alive&&!a.downed&&controlled(s,a)&&distance(a,o)<85&&hasLineOfSight(s,a,o))return{id:o.id,label:'Restart carrier',detail:'Hold to restart the stalled carrier · 8 seconds',progress:s.convoyClear/8,x:o.x,y:o.y,radius:85,available:true};
  return null;
}
/** A member recommends; the current human squad leader keeps the final order. */
export function chooseStoryOption(s,decisionId,optionId,actorId=s.playerId){
  const accepted=chooseOption(s,decisionId,optionId,actorId,storyHooks);
  if(accepted)updateObjective(s);
  return accepted;
}
export function getStoryInteraction(s,actorId=s.playerId){return storyInteraction(s,actorId,storyHooks);}
export function getStoryLeaderId(s){return currentLeader(s)?.id??null;}
function syncCoopControl(s){
  const owned=humans(s);
  const canonical=owned.find(a=>a.role==='leader'&&a.alive)||owned.find(a=>a.alive)||owned[0]||s.squad.find(a=>a.role==='leader')||s.squad[0];
  s.playerId=canonical.id;
  s.role=controlled(s,currentLeader(s))?'leader':'member';
}
/** Set server-owned human slots; any vacant soldier immediately returns to AI. */
export function setHumanPlayers(s,actorIds=[]){
  const previous=new Set(s.coop?s.humanIds:[]),previousRole=s.role;
  const allowed=new Set(s.squad.map(a=>a.id));
  s.coop=true;s.humanIds=[...new Set(Array.isArray(actorIds)?actorIds:[])].filter(id=>allowed.has(id)).slice(0,2);
  for(const a of s.squad){
    a.human=s.humanIds.includes(a.id);
    if(a.human!==previous.has(a.id)){a.path=[];a.pathTimer=0;a.moving=false;a.bandageProgress=0;a.observing=false;}
  }
  syncCoopControl(s);
  if(previousRole!==s.role){s.waitUntil=0;s.order={type:'follow',x:player(s).x,y:player(s).y,label:'Regroup on the leader'};}
  return [...s.humanIds];
}
function describeLeader(s,text){if(s.leaderOrder===text)return;s.leaderOrder=text;}
function phase(s){return s.stages[s.stageIndex];}
function checkpointSupplies(s){if(s.difficulty==='story')for(const a of s.squad)if(a.alive&&!a.downed)a.hp=Math.min(a.maxHp,a.hp+12);}
function advance(s){
  s.stats.objectives++;s.stageIndex++;s.phaseTime=0;s.progress=0;checkpointSupplies(s);
  if(s.stageIndex>=s.stages.length){s.status='won';s.stats.rescued=s.survivors.filter(a=>a.alive&&a.stabilized).length;s.endReason='Chalk accounted for. Mission complete.';radio(s,'RADIO','You are inside the collection point. Stand down.');return;}
  const p=phase(s);radio(s,'HALE',`${p.title}. ${p.description}`);s.order={type:'follow',x:player(s).x,y:player(s).y,label:s.coop?'Regroup on the leader':'Regroup on you'};if(s.coop&&s.role==='leader')describeLeader(s,s.order.label);updateObjective(s);
}
export function getObjective(s){return s.objective;}
function updateObjective(s){
  const p=phase(s);if(!p)return;let x=p.x,y=p.y,kind=p.kind,interaction=['rescue','interact','deliver'].includes(kind),detail='',actionTarget=missionActionTarget(s);
  if(actionTarget){x=actionTarget.x;y=actionTarget.y;}
  if(kind==='convoy'){
    const lead=s.vehicles[0],next=s.convoyRoute[s.convoyIndex+1];x=lead.x;y=lead.y;
    if(next?.blocked&&!s.convoyCleared.includes(s.convoyIndex+1)&&distance(lead,next)<110){x=next.repair?lead.x:next.x;y=next.repair?lead.y:next.y;interaction=true;kind=next.repair?'repair':'barricade';detail=`${next.repair?'Restart carrier':'Clear obstruction'} · ${Math.ceil(Math.max(0,(next.repair?8:6)-s.convoyClear))} sec`;}
    else detail=lead.waiting?'Convoy waiting · stay near the lead vehicle':`Convoy moving · ${s.convoyIndex+1}/${s.convoyRoute.length}`;
  }else if(kind==='rescue'){const c=s.survivors[p.crew];x=c.x;y=c.y;detail=`Treatment · ${Math.round(s.phaseTime/p.duration*100)}%`;}
  else if(kind==='recon')detail=`Face the marked approach · ${Math.round(s.phaseTime/p.duration*100)}% observed`;
  else if(kind==='interact')detail=`${p.interior?'Enter the house · ':''}${p.interactionLabel} · hold Assist nearby`;
  else if(kind==='deliver'){
    const item=operationItem(s,p.itemId),carrier=s.squad.find(a=>a.id===item?.carrierId);
    detail=item?.status==='ground'?`Recover the dropped ${item.label.toLowerCase()} · hold Assist nearby`:`${carrier?.name||'Squad'} carries ${item?.label?.toLowerCase()||'the item'} · hand it over nearby`;
  }else if(kind==='hold'){
    detail=`${p.holdLabel||'Cover loading'} · ${Math.ceil(Math.max(0,p.duration-s.phaseTime))} sec`;
    if(s.stageIndex===s.stages.length-1){const living=s.squad.filter(a=>a.alive),present=living.filter(a=>!a.downed&&distance(a,p)<p.radius).length;detail+=` · Squad ${present}/${living.length}`;}
  }else if(kind==='extract'||kind==='escort'){
    const living=s.squad.filter(a=>a.alive),inZone=living.filter(a=>!a.downed&&distance(a,p)<p.radius).length,crew=s.survivors.filter(a=>a.alive&&a.stabilized&&!a.missionWait),crewIn=crew.filter(a=>distance(a,p)<p.radius).length;
    detail=`Squad ${inZone}/${living.length}${crew.length?` · People ${crewIn}/${crew.length}`:''}`;
    if(p.requiresTransmission&&!s.operation?.transmission?.complete)detail+=` · Report ${Math.ceil(s.operation?.transmission?.remaining||0)} sec`;
  }else detail=s.phaseTime>0?'Account for the chalk':'Bring the chalk to this street';
  s.objective={id:p.id,x,y,radius:p.radius,title:kind==='repair'?'Restart the stalled carrier':kind==='barricade'?'Clear the obstruction':actionTarget?.recovery?actionTarget.label:p.title,description:kind==='repair'?'Hold Assist beside the stalled lead carrier to restart it.':kind==='barricade'?'Hold Assist near the barrier, or let your AI leader clear it.':p.description,kind,progress:kind==='repair'?s.convoyClear/8:kind==='barricade'?s.convoyClear/6:clamp(s.phaseTime/(actionTarget?.recovery?2:p.duration||1),0,1),detail,interaction,interactionLabel:kind==='repair'?'Restart carrier':actionTarget?.label||p.interactionLabel||null,actionTarget,lookAt:p.lookAt||null};
}
export const PING_DURATION = 8;
export const PING_COOLDOWN = .6;

/** A point of interest, never an order or a source of squad sight. */
export function placePing(s,point,actorId=s?.playerId){
  if(s?.status!=='playing'||!Number.isFinite(s.time)||!point||
    !Number.isFinite(point.x)||!Number.isFinite(point.y)||
    !Number.isFinite(s.world?.width)||!Number.isFinite(s.world?.height)||
    point.x<0||point.y<0||point.x>s.world.width||point.y>s.world.height)return false;
  const owner=s.squad.find(a=>a.id===actorId);
  if(!owner?.alive||owner.downed)return false;
  const pings=s.pings||[],previous=pings.find(p=>p.actorId===actorId);
  if(previous&&s.time-previous.createdAt<PING_COOLDOWN)return false;
  const ping={id:++s.nextPingId,actorId:owner.id,name:String(owner.name||'Squad').slice(0,24),
    x:point.x,y:point.y,createdAt:s.time,expiresAt:s.time+PING_DURATION};
  s.pings=[...pings.filter(p=>p.actorId!==actorId&&p.expiresAt>s.time).slice(-3),ping];
  return true;
}

export function issueOrder(s,type,point){
  if(s.status!=='playing')return false;const pl=player(s);
  if(s.role==='member'){
    if(type==='wait'){s.waitUntil=s.time+12;radio(s,pl.name.toUpperCase(),'Hold up. Give me a moment.');describeLeader(s,'Holding for you · 12 seconds');return true;}
    if(type==='ready'){s.waitUntil=0;radio(s,pl.name.toUpperCase(),'Ready. Moving with you.');return true;}
    if(type==='help'||type==='assist'){s.helpRequested=true;s.helpTargetId=pl.id;s.aidTimer=0;radio(s,pl.name.toUpperCase(),'Medic, I need help.');return true;}
    return false;
  }
  if(!['follow','move','hold','assist'].includes(type))return false;
  let dest=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)?nearbyFree(s,point.x,point.y):{x:pl.x,y:pl.y};
  if(type==='assist'){const wounded=[...s.squad,...s.survivors.filter(a=>a.stabilized)].find(a=>a.alive&&a.downed);if(wounded)dest={x:wounded.x,y:wounded.y};}
  const labels={follow:'Regroup on you',move:'Move to your marker',hold:'Hold this position',assist:'Help the wounded'};
  s.order={type,x:dest.x,y:dest.y,label:labels[type]};for(const a of s.squad){a.path=[];a.pathTimer=0;}
  if(s.time-s.lastCommand>.7){radio(s,'HALE',labels[type]+'.');s.lastCommand=s.time;}return true;
}
/** A peer may command only its assigned actor; room ownership does not grant command. */
export function issueCoopOrder(s,actorId,type,point){
  const actor=s.squad.find(a=>a.id===actorId);
  if(!s.coop||s.status!=='playing'||!controlled(s,actor)||!actor.alive)return false;
  if(actor.role!=='leader'){
    if(type==='wait'){s.waitUntil=s.time+12;radio(s,actor.name.toUpperCase(),'Hold up. Give me a moment.');describeLeader(s,s.role==='member'?'Holding for the squad · 12 seconds':`${actor.name} requests a hold`);return true;}
    if(type==='ready'){s.waitUntil=0;radio(s,actor.name.toUpperCase(),'Ready. Moving with you.');if(s.role==='leader')describeLeader(s,s.order.label);return true;}
    if(type==='help'){s.helpRequested=true;s.helpTargetId=actor.id;s.aidTimer=0;radio(s,actor.name.toUpperCase(),'Medic, I need help.');return true;}
    return false;
  }
  if(!['follow','move','hold','assist'].includes(type))return false;
  let dest=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)?nearbyFree(s,point.x,point.y):{x:actor.x,y:actor.y};
  if(type==='assist'){
    const wounded=[...s.squad,...s.survivors.filter(a=>a.stabilized)].find(a=>a.alive&&a.downed);
    if(wounded)dest={x:wounded.x,y:wounded.y};
    else if(actor.hp<actor.maxHp){s.helpRequested=true;s.helpTargetId=actor.id;s.aidTimer=0;}
  }
  const labels={follow:'Regroup on the leader',move:'Move to the marker',hold:'Hold this position',assist:'Help the wounded'};
  s.order={type,x:dest.x,y:dest.y,label:labels[type]};
  describeLeader(s,labels[type]);
  for(const a of s.squad)if(!controlled(s,a)){a.path=[];a.pathTimer=0;}
  if(s.time-s.lastCommand>.7){radio(s,actor.name.toUpperCase(),labels[type]+'.');s.lastCommand=s.time;}
  return true;
}
/** Transfer solo control without creating a new soldier or resetting the mission. */
export function selectSquadMember(s,actorId){
  if(s.coop||s.status!=='playing')return false;
  const desired=s.squad.find(a=>a.id===actorId&&a.alive&&!a.downed);
  if(!desired)return false;
  if(s.playerId===desired.id)return true;
  const previous=player(s);if(previous){previous.observing=false;previous.bandageProgress=0;previous.moving=false;}
  s.playerId=desired.id;s.role=desired.role==='leader'?'leader':'member';s.waitUntil=0;
  s.order={type:'follow',x:desired.x,y:desired.y,label:s.role==='leader'?'Regroup on you':'Regroup on the leader'};
  for(const a of s.squad){a.path=[];a.pathTimer=0;a.target=null;}
  s.visibilityTimer=0;
  radio(s,'RADIO',s.role==='leader'?'Hale selected. You have command of the chalk.':`${desired.name} selected. ${currentLeader(s).name} has the chalk.`);
  return true;
}
export function setRole(s,role){
  if(role!=='leader'&&role!=='member')return false;
  const desired=s.squad.find(a=>a.role===(role==='leader'?'leader':'grenadier')&&a.alive&&!a.downed);
  return desired?selectSquadMember(s,desired.id):false;
}
export function combatLOS(s,a,b){
  if(!hasLineOfSight(s,a,b))return false;
  for(const smoke of s.smokes){if(smoke.ttl<1)continue;const len=distance(a,b),steps=Math.ceil(len/40);let inside=0;for(let i=0;i<=steps;i++){const t=i/Math.max(1,steps);if(Math.hypot(a.x+(b.x-a.x)*t-smoke.x,a.y+(b.y-a.y)*t-smoke.y)<smoke.radius)inside++;}if(inside>2)return false;}
  return true;
}
function targetFor(s,a,targets,maxRange){
  let best=null,bestDist=maxRange;for(const t of targets){if(!t.alive||t.downed)continue;const d=distance(a,t);if(d<bestDist&&combatLOS(s,a,t)){best=t;bestDist=d;}}return best;
}
function tryReload(s,a){if(a.reloadTimer<=0&&a.ammo<a.magSize&&a.reserve>0){a.reloadTimer=a.team==='enemy'?enemyProfile(a).reload:roleProfile(a).reloadDuration;soundEvent(s,'reload_start',a);}}
function shoot(s,a,angle,isPlayer=false,sourceTime=s.time){
  if(a.downed||!a.alive||a.observing||a.cooldown>0||a.reloadTimer>0)return;
  const dazzle=flashIntensity(a,s.time);if(!isPlayer&&dazzle>.25)return;
  if(a.ammo<=0){tryReload(s,a);return;}
  a.ammo--;
  if(a.kind==='sniper'){a.cooldown=range(s,...enemyProfile(a).recovery);a.aimCharge=0;}
  else if(a.team==='enemy'){const profile=enemyProfile(a);a.burst=(a.burst||0)+1;a.cooldown=a.burst%profile.burst===0?range(s,...profile.recovery):profile.interval;}
  else if(isPlayer)a.cooldown=roleProfile(a).fireInterval;
  else{const discipline=AI_FIRE_DISCIPLINE[a.role]||AI_FIRE_DISCIPLINE.leader;a.burst=(a.burst||0)+1;a.cooldown=a.burst%discipline.burst===0?range(s,...discipline.recovery):roleProfile(a).fireInterval;}
  const spread=a.team==='enemy'?a.accuracy+(a.suppression||0)*.07+(a.moving?.04:0):isPlayer?.018+.045*(a.suppression||0)+(a.moving?.02:0):(a.role==='support'?.065:.045)+(a.moving?.045:0);
  const shotAngle=angle+range(s,-spread-dazzle*.13,spread+dazzle*.13);
  // Projectile dispersion should not pull a human's aim away from the cursor.
  // Preserve the same random draw and projectile trajectory as before.
  if(!isPlayer)a.angle=shotAngle;
  let x=a.x+Math.cos(shotAngle)*20,y=a.y+Math.sin(shotAngle)*20;
  // The visible barrel can overlap a wall when a soldier hugs cover. Keep
  // that shot on this side of the wall so a thin partition cannot be skipped.
  if(!hasLineOfSight(s,a,{x,y})){x=a.x;y=a.y;}
  const metadata={team:a.team,actorId:a.id,weapon:weaponFor(a)};
  const sniper=a.kind==='sniper',ballistics=ballisticProfile(metadata.weapon),speed=ballistics.speedMps*WORLD_UNITS_PER_METRE;
  s.bullets.push({id:++s.nextId,x,y,px:x,py:y,vx:Math.cos(shotAngle)*speed,vy:Math.sin(shotAngle)*speed,team:a.team,owner:a.id,weapon:metadata.weapon,
    damage:a.team==='enemy'?DIFFICULTIES[s.difficulty].enemyDamage*(sniper?2.5:1):24,ttl:ballistics.range/speed,
    speedMps:ballistics.speedMps,rangeRemaining:ballistics.range,firedAt:sourceTime,originX:x,originY:y,travelled:0,nearPassIds:[]});
  effect(s,'muzzle',x,y,.075,shotAngle,metadata);soundEvent(s,'shot',a,{x,y,sourceTime,sourceActorId:a.id,speedMps:ballistics.speedMps,angle:shotAngle});s.lastShot=s.time;if(isPlayer)s.stats.shots++;
}
function throwAim(a,input,type,reach){
  const point=input.throwTargets?.[type];
  if(Number.isFinite(point?.x)&&Number.isFinite(point?.y))return point;
  if(Number.isFinite(input.throwAimX)&&Number.isFinite(input.throwAimY))return{x:input.throwAimX,y:input.throwAimY};
  if(Number.isFinite(input.aimX)&&Number.isFinite(input.aimY))return{x:input.aimX,y:input.aimY};
  return{x:a.x+Math.cos(a.angle)*reach,y:a.y+Math.sin(a.angle)*reach};
}
function launchGrenade(s,a,input,sourceTime=s.time){
  if(a.role!=='grenadier'||a.grenades<=0||a.grenadeCooldown>0||a.reloadTimer>0||a.observing)return false;
  // Manual launcher use only: the human chooses where a blast is safe.
  const aim=throwAim(a,input,'grenade',280);
  const direction=Math.atan2(aim.y-a.y,aim.x-a.x),reach=clamp(distance(a,aim),90,360);
  const targetX=clamp(a.x+Math.cos(direction)*reach,12,W-12),targetY=clamp(a.y+Math.sin(direction)*reach,12,H-12);
  a.grenades--;a.grenadeCooldown=3;a.cooldown=Math.max(a.cooldown,.45);
  s.grenades.push({id:++s.nextId,x:a.x,y:a.y,px:a.x,py:a.y,startX:a.x,startY:a.y,targetX,targetY,progress:0,duration:.55+reach/850,owner:a.id,team:a.team,weapon:'grenade',firedAt:sourceTime});
  soundEvent(s,'grenade_launch',a,{weapon:'grenade',sourceTime});s.stats.shots++;s.lastShot=s.time;
  return true;
}
function throwHandGrenade(s,a,input,weapon,sourceTime=s.time){
  const config=HAND_GRENADES[weapon];
  if(!config||!(a[config.inventory]>0)||a.handThrowCooldown>0||a.reloadTimer>0||a.observing||!a.alive||a.downed)return false;
  const aim=throwAim(a,input,weapon,config.defaultRange);
  const direction=Math.atan2(aim.y-a.y,aim.x-a.x),reach=clamp(distance(a,aim),config.minimumRange,config.range);
  const targetX=clamp(a.x+Math.cos(direction)*reach,12,W-12),targetY=clamp(a.y+Math.sin(direction)*reach,12,H-12);
  a[config.inventory]--;a.handThrowCooldown=config.cooldown;a.cooldown=Math.max(a.cooldown,.45);
  s.grenades.push({id:++s.nextId,kind:'hand',weapon,x:a.x,y:a.y,px:a.x,py:a.y,startX:a.x,startY:a.y,targetX,targetY,
    progress:0,duration:.42+reach/700,owner:a.id,team:a.team,firedAt:sourceTime,fuseUntil:sourceTime+config.fuse,landed:false,detonated:false});
  soundEvent(s,'grenade_throw',a,{weapon,sourceTime});
  radio(s,a.name.toUpperCase(),weapon==='frag'?'Frag out.':'Flashbang out.');
  s.stats.shots++;return true;
}
function explodeGrenade(s,g,sourceTime=s.time){
  const weapon=g.weapon||'grenade';
  if(weapon==='flashbang'){
    const radius=HAND_GRENADES.flashbang.radius;
    for(const a of [...s.enemies,...s.squad,...s.civilians,...s.survivors]){
      if(!a.alive||a.evacuated)continue;
      const strength=flashExposure(s.world,g,a);if(!applyFlashStatus(a,strength,sourceTime))continue;
      if(a.team==='civilian')a.lastDanger={x:g.x,y:g.y,type:'flashbang',time:s.time};
    }
    effect(s,'flashbang',g.x,g.y,.3,0,{radius,team:g.team,actorId:g.owner,weapon});
    soundEvent(s,'flashbang',{id:g.owner,x:g.x,y:g.y,team:g.team},{weapon,radius,sourceTime,sourceActorId:g.owner});
    return;
  }
  const radius=weapon==='frag'?HAND_GRENADES.frag.radius:76;
  effect(s,'explosion',g.x,g.y,.6,0,{radius,team:g.team,actorId:g.owner,weapon});
  for(const a of [...s.enemies,...s.squad,...s.civilians,...s.survivors]){
    if(!a.alive||a.downed)continue;
    const d=distance(a,g);if(d>=radius||!hasLineOfSight(s,g,a))continue;
    damage(s,a,Math.round((weapon==='frag'?96:74)*(1-d/radius)+14),g.owner,'blast',Math.atan2(a.y-g.y,a.x-g.x),sourceTime);
  }
  // The original wall shields this blast. The resulting opening changes only
  // subsequent sight, movement and projectiles.
  // Fragments harm exposed actors but do not punch new doors through masonry.
  // The existing 40 mm round retains CHALK's structural breaching behavior.
  const breach=weapon==='frag'?{changed:false,created:[]}:applyBreach(s,{x:g.x,y:g.y,radius,wallId:g.impactWallId});
  soundEvent(s,'explosion',{id:g.owner,x:g.x,y:g.y,team:g.team},{weapon,radius,sourceTime,sourceActorId:g.owner,breached:breach.changed,breachCount:breach.created.length});
}
function updateGrenades(s,dt,frameStart=s.time-dt){
  for(const g of s.grenades){
    if(g.kind==='hand'&&g.landed){
      if(s.time>=g.fuseUntil){explodeGrenade(s,g,g.fuseUntil);g.detonated=true;}
      continue;
    }
    const travelTime=Math.min(dt,(1-g.progress)*g.duration);
    g.px=g.x;g.py=g.y;g.progress=Math.min(1,g.progress+travelTime/g.duration);
    const origin={x:g.x,y:g.y},next={x:g.startX+(g.targetX-g.startX)*g.progress,y:g.startY+(g.targetY-g.startY)*g.progress};
    let collision=Infinity;for(const wall of getSolidWalls(s.world)){const entry=segmentRectEntry(origin,next,wall);if(entry<collision){collision=entry;g.impactWallId=wall.id;}}
    if(Number.isFinite(collision)){
      // Stop before the obstruction so its far side remains shielded. Hand
      // grenades settle here until their fuse; 40 mm rounds explode on impact.
      const length=distance(origin,next),t=Math.max(0,collision-.75/Math.max(1,length));
      g.x=origin.x+(next.x-origin.x)*t;g.y=origin.y+(next.y-origin.y)*t;g.progress=1;
    }else{g.x=next.x;g.y=next.y;}
    if(g.progress>=1){
      if(g.kind==='hand'){
        g.landed=true;
        if(s.time>=g.fuseUntil){explodeGrenade(s,g,g.fuseUntil);g.detonated=true;}
      }else explodeGrenade(s,g,frameStart+travelTime*(Number.isFinite(collision)?collision:1));
    }
  }
  s.grenades=s.grenades.filter(g=>g.kind==='hand'?!g.detonated:g.progress<1);
}
function safeShot(s,a,t){
  const dx=t.x-a.x,dy=t.y-a.y,len2=dx*dx+dy*dy,spread=(a.role==='support'?.065:.045)+(a.moving?.045:0)+flashIntensity(a,s.time)*.13;
  return !s.civilians.some(c=>{if(!c.alive||c.downed)return false;const f=((c.x-a.x)*dx+(c.y-a.y)*dy)/len2;if(f<=0||f>=1)return false;return Math.hypot(c.x-a.x-f*dx,c.y-a.y-f*dy)<24+f*Math.sqrt(len2)*spread;});
}
function damage(s,a,amount,source,cause='bullet',angle,sourceTime=s.time){
  if(!a.alive||a.downed||!Number.isFinite(amount)||amount<=0)return;
  const applied=Math.min(a.hp,amount);a.hp=Math.max(0,a.hp-amount);a.suppression=clamp((a.suppression||0)+.3,0,1);
  if(a.team==='civilian'&&!a.harmed){a.harmed=true;s.stats.civilianHarm++;radio(s,'RADIO','Civilian hurt. Check your fire.');}
  if((s.coop?s.humanIds.includes(source):source===s.playerId)&&a.team==='enemy')s.stats.hits++;
  if(a.hp<=0){
    a.downed=true;a.bleed=0;a.reviveProgress=0;a.path=[];
    if(a.team==='squad'){s.stats.squadDowns++;radio(s,a.name.toUpperCase(),`${a.name} down. Need help here.`);}
    else if(a.team==='enemy'){a.alive=false;a.deathTime=s.time;}
    else if(a.team==='civilian'){a.alive=false;}
  }
  recordBloodHit(s,a,{cause,damage:applied,sourceId:source,angle});
  soundEvent(s,'victim_hit',a,{victimId:a.id,damage:applied,cause,alive:a.alive,downed:a.downed,sourceId:source,sourceActorId:source,sourceTime});
}
function segmentActor(a,b,p,r){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,f=len?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/len,0,1):0;return Math.hypot(p.x-a.x-dx*f,p.y-a.y-dy*f)<=r;}
function segmentActorEntry(a,b,p,r){
  const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-p.x,oy=a.y-p.y,c=ox*ox+oy*oy-r*r;
  if(c<=0)return 0;
  const len=dx*dx+dy*dy;if(len<1e-12)return Infinity;
  const projection=ox*dx+oy*dy,disc=projection*projection-len*c;
  if(disc<0)return Infinity;
  const t=(-projection-Math.sqrt(disc))/len;
  return t>=0&&t<=1?t:Infinity;
}
function nearPasses(s,b,origin,end,hitActor,sourceTime,speed){
  if(b.team!=='enemy'||speed/WORLD_UNITS_PER_METRE<=343)return;
  const dx=end.x-origin.x,dy=end.y-origin.y,length=Math.hypot(dx,dy);if(length<1e-8)return;
  b.nearPassIds ||= [];
  for(const listener of s.squad){
    if(!listener.alive||listener.downed||listener.id===hitActor?.id||b.nearPassIds.includes(listener.id))continue;
    // The actual projection must have been passed. A nearby stopped endpoint
    // is not a passing bullet, especially on the far side of a wall.
    const along=((listener.x-origin.x)*dx+(listener.y-origin.y)*dy)/length;
    if(along<0||along>length)continue;
    const closest={x:origin.x+dx/length*along,y:origin.y+dy/length*along},miss=distance(listener,closest);
    if(miss<=listener.radius+2||miss>34||!hasLineOfSight(s,closest,listener))continue;
    b.nearPassIds.push(listener.id);
    soundEvent(s,'near_pass',listener,{x:closest.x,y:closest.y,victimId:listener.id,sourceActorId:b.owner,sourceId:b.owner,bulletId:b.id,
      weapon:b.weapon||'hostile',speedMps:speed/WORLD_UNITS_PER_METRE,firedAt:b.firedAt??sourceTime,sourceTime:sourceTime+along/speed,
      originX:b.originX??origin.x,originY:b.originY??origin.y,directionX:b.vx/speed,directionY:b.vy/speed,
      closestX:closest.x,closestY:closest.y,missDistance:miss,segmentStart:{...origin},segmentEnd:{x:end.x,y:end.y}});
  }
}
function updateBullets(s,dt,frameStart=s.time-dt){
  for(const b of s.bullets){
    const speed=Math.hypot(b.vx,b.vy);if(!Number.isFinite(speed)||speed<=0){b.ttl=0;continue;}
    const travelTime=Math.min(dt,Math.max(0,b.ttl),Number.isFinite(b.rangeRemaining)?Math.max(0,b.rangeRemaining)/speed:Infinity);
    b.px=b.x;b.py=b.y;
    const origin={x:b.x,y:b.y},end={x:b.x+b.vx*travelTime,y:b.y+b.vy*travelTime};
    let hitTime=Infinity,hitActor=null,hitWall=null;
    for(const wall of getSolidWalls(s.world)){const entry=segmentRectEntry(origin,end,wall);if(entry<hitTime){hitTime=entry;hitWall=wall;}}
    const targets=b.team==='enemy'?[...s.squad,...s.survivors]:[...s.enemies,...s.civilians];
    for(const a of targets){
      if(!a.alive||a.downed)continue;
      const t=segmentActorEntry(origin,end,a,a.radius+2);
      if(t<hitTime){hitTime=t;hitActor=a;}
    }
    if(Number.isFinite(hitTime)){
      b.x=origin.x+(end.x-origin.x)*hitTime;b.y=origin.y+(end.y-origin.y)*hitTime;
      const sourceTime=frameStart+travelTime*hitTime;
      if(hitActor)damage(s,hitActor,b.damage,b.owner,'bullet',Math.atan2(b.vy,b.vx),sourceTime);
      else{effect(s,'dust',b.x,b.y,.25);soundEvent(s,'impact',{id:b.owner,x:b.x,y:b.y,team:b.team},{weapon:b.weapon||(b.team==='enemy'?'hostile':'rifle'),material:hitWall?.material||'concrete',propId:hitWall?.propId,sourceActorId:b.owner,sourceTime});}
    }else{b.x=end.x;b.y=end.y;}
    nearPasses(s,b,origin,b,hitActor,frameStart,speed);
    const travelled=distance(origin,b);b.travelled=(b.travelled||0)+travelled;
    if(Number.isFinite(b.rangeRemaining))b.rangeRemaining=Math.max(0,b.rangeRemaining-travelled);
    b.ttl=Number.isFinite(hitTime)||b.rangeRemaining<=1e-7?0:b.ttl-dt;
    for(const a of targets){
      if(a.alive&&!a.downed&&segmentActor(origin,b,a,b.weapon==='support'||b.weapon==='hostile_support'?62:43)){
        if(a.team==='squad')a.suppression=Math.min(1,a.suppression+(b.weapon==='hostile_support'?.16:.1));
        else if(a.team==='enemy'&&b.weapon==='support')a.suppression=Math.min(1,a.suppression+.23);
      }
    }
  }s.bullets=s.bullets.filter(b=>b.ttl>0&&b.x>0&&b.y>0&&b.x<W&&b.y<H);
}
function revive(s,target,helper,dt){
  target.reviveProgress+=dt*4/roleProfile(helper).reviveDuration;if(target.reviveProgress>=4){target.downed=false;target.hp=Math.round(target.maxHp*.65);target.bleed=0;target.reviveProgress=0;target.suppression=0;radio(s,helper.name.toUpperCase(),`${target.name} is back up. Stay close.`);effect(s,'heal',target.x,target.y,1);}
}
function aiTarget(s){
  const p=phase(s),leader=currentLeader(s);
  if(!p)return{x:leader.x,y:leader.y};
  const down=[...s.squad,...s.survivors.filter(a=>a.stabilized)].find(a=>a.alive&&a.downed);
  if(down){describeLeader(s,`Helping ${down.name} · hold the squad together`);return{x:down.x,y:down.y};}
  if(s.waitUntil>s.time){describeLeader(s,`Holding for you · ${Math.ceil(s.waitUntil-s.time)} seconds`);return{x:leader.x,y:leader.y};}
  const lagging=s.survivors.find(c=>c.alive&&c.stabilized&&!c.downed&&!c.missionWait&&distance(leader,c)>210);
  if(lagging){describeLeader(s,`Waiting for ${lagging.name} · keep the escort together`);return{x:leader.x,y:leader.y};}
  if(humans(s).some(a=>a.alive&&!a.downed&&distance(leader,a)>290)){describeLeader(s,'Waiting for you · regroup on Hale');return{x:leader.x,y:leader.y};}
  if(['barricade','repair'].includes(s.objective.kind)){describeLeader(s,'Clearing the route · cover the convoy');return{x:s.objective.x,y:s.objective.y};}
  if(p.kind==='convoy'){const v=s.vehicles[0];describeLeader(s,v.waiting?'Regroup on the lead vehicle':'Accompanying the relief convoy');return{x:v.x,y:v.y};}
  if(['interact','deliver'].includes(p.kind)){const target=missionActionTarget(s)||p;describeLeader(s,target.label||p.title);return{x:target.x,y:target.y};}
  if(p.kind==='recon'){describeLeader(s,'Checking the next approach');return{x:p.x,y:p.y};}
  if(p.kind==='rescue'){describeLeader(s,'Protect the medic · crew recovery in progress');return{x:s.objective.x,y:s.objective.y};}
  if(p.kind==='hold'&&distance(leader,p)<p.radius){describeLeader(s,'Hold this area · watch your squad');return{x:p.x,y:p.y};}
  describeLeader(s,`Moving · ${p.title}`);return{x:p.x,y:p.y};
}
function formationPoint(s,anchor,offset,heading=-Math.PI/2){
  // Open streets use a broad formation. Rooms and thresholds naturally compress
  // it so soldiers can take the same doorway without crowding its frame.
  const room=buildingAt(s.world,anchor),scale=room?.34:!anchor.team&&Number.isFinite(anchor.radius)?Math.min(1,Math.max(28,anchor.radius-28)/150):1;
  // Formation follows travel, never the player's mouse aim. In a room it
  // compresses to the same doorway-safe footprint as the previous formation.
  if(room)heading=-Math.PI/2;
  let x=anchor.x+(-Math.sin(heading)*offset[0]-Math.cos(heading)*offset[1])*scale;
  let y=anchor.y+(Math.cos(heading)*offset[0]-Math.sin(heading)*offset[1])*scale;
  if(room){x=clamp(x,room.interior.x+18,room.interior.x+room.interior.w-18);y=clamp(y,room.interior.y+18,room.interior.y+room.interior.h-18);}
  else{
    // A broad street slot must not send a follower through an unrelated house
    // just because its mathematical offset landed beyond the kerb. Compress at
    // narrow corners and parked cars, then open back out at the next junction.
    for(const compression of [1,.84,.68,.52,.36,.2]){
      const point={x:anchor.x+(x-anchor.x)*compression,y:anchor.y+(y-anchor.y)*compression};
      if(!buildingAt(s.world,point)&&free(s,point.x,point.y,15))return point;
    }
  }
  return nearbyFree(s,x,y);
}
function updateSquad(s,inputs,dt,frameStart=s.time-dt){
  const pl=player(s),leader=currentLeader(s),dest=s.role==='member'?aiTarget(s):null,anchorPlayer=s.coop?leader:pl;
  const followAnchor=s.role==='member'?leader:anchorPlayer,previous=s.formationAnchor;
  if(previous?.id===followAnchor.id&&distance(previous,followAnchor)>1){
    const direction=Math.atan2(followAnchor.y-previous.y,followAnchor.x-previous.x),old=s.formationHeading??-Math.PI/2;
    s.formationHeading=old+Math.atan2(Math.sin(direction-old),Math.cos(direction-old))*Math.min(1,dt*7);
  }
  s.formationAnchor={id:followAnchor.id,x:followAnchor.x,y:followAnchor.y};
  const following=s.squad.filter(a=>a.alive&&!a.downed&&!controlled(s,a)&&a!==leader),covering=following[Math.floor(s.time/1.55)%Math.max(1,following.length)];
  const casualties=[...s.squad,...s.survivors.filter(a=>a.stabilized)].filter(a=>a.alive&&a.downed),helper=s.squad.find(a=>a.role==='medic'&&a.alive&&!a.downed&&!controlled(s,a))||s.squad.find(a=>a.alive&&!a.downed&&!controlled(s,a));
  const aidTarget=s.squad.find(a=>a.id===s.helpTargetId&&a.alive&&!a.downed)||pl;
  for(const a of s.squad){
    if(!a.alive)continue;
    if(a.downed){a.observing=false;a.bleed+=dt;if(a.bleed>85){a.alive=false;radio(s,'RADIO',`${a.name} could not be recovered in time.`);if(!s.coop&&a.id===s.playerId){const replacement=s.squad.find(other=>other.alive&&!other.downed);if(replacement)selectSquadMember(s,replacement.id);}}continue;}
    a.target=null;
    if(controlled(s,a)){
      const input=inputFor(s,a,inputs);
      a.observing=a.role==='grenadier'&&input.observe===true;
      let mx=finite(input.moveX),my=finite(input.moveY);const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;}
      a.moving=len>.05;const speed=movementSpeed(a,input.sprint);move(s,a,mx*speed*dt,my*speed*dt);
      if(Number.isFinite(input.aimX)&&Number.isFinite(input.aimY)&&Math.hypot(input.aimX-a.x,input.aimY-a.y)>2)a.angle=Math.atan2(input.aimY-a.y,input.aimX-a.x);else if(len>.05&&!input.fire)a.angle=Math.atan2(my,mx);
      if(input.reload)tryReload(s,a);if(input.grenade&&!input.sprint)launchGrenade(s,a,input,frameStart);if(input.fire&&!input.sprint)shoot(s,a,a.angle,true,frameStart);
      if(!input.sprint){if(input.frag)throwHandGrenade(s,a,input,'frag',frameStart);else if(input.flashbang)throwHandGrenade(s,a,input,'flashbang',frameStart);}
      if(input.smoke&&a.smokes>0){a.smokes--;const target=throwAim(a,input,'smoke',145),angle=Math.atan2(target.y-a.y,target.x-a.x),aim={x:a.x+Math.cos(angle)*145,y:a.y+Math.sin(angle)*145},p=nearbyFree(s,aim.x,aim.y);s.smokes.push({...p,radius:105,ttl:14});effect(s,'smoke',p.x,p.y,1);soundEvent(s,'smoke',a,{x:p.x,y:p.y});radio(s,a.name.toUpperCase(),'Smoke out. Keep moving.');}
      if(input.interact){const down=casualties.filter(c=>distance(a,c)<70&&hasLineOfSight(s,a,c)).sort((c,d)=>distance(a,c)-distance(a,d))[0];if(down){revive(s,down,a,dt);s.interactionPrompt=`Helping ${down.name} · ${Math.round(down.reviveProgress/4*100)}%`;}
        else if(a.hp<a.maxHp&&a.medkits>0&&!getStoryInteraction(s,a.id)&&s.objective?.kind!=='rescue'&&s.objective?.kind!=='barricade'&&s.objective?.kind!=='repair'&&!getMissionInteraction(s,a.id)){a.bandageProgress=(a.bandageProgress||0)+dt*(a.role==='medic'?1.35:1);if(a.bandageProgress>=3){a.medkits--;a.hp=Math.min(a.maxHp,a.hp+55);a.bandageProgress=0;effect(s,'heal',a.x,a.y,1);radio(s,a.name.toUpperCase(),'Bandaged. Ready to move.');}s.interactionPrompt=`Bandaging · ${Math.round(a.bandageProgress/3*100)}%`;}}
      else a.bandageProgress=0;
      continue;
    }
    a.observing=false;
    if(flashIntensity(a,s.time)>.25){a.moving=false;a.tactic='disoriented';continue;}
    const enemy=targetFor(s,a,s.enemies,nightMission(s)?350:440);a.target=enemy?.id||null;
    let work=false;
    if(a===helper&&casualties.length){const wounded=casualties.sort((b,c)=>distance(a,b)-distance(a,c))[0];navigate(s,a,wounded,movementSpeed(a)*128/112,dt,40);if(distance(a,wounded)<65&&hasLineOfSight(s,a,wounded)){revive(s,wounded,a,dt);work=true;}a.medicTarget=wounded.id;}
    else if(a.role==='medic'&&s.helpRequested&&aidTarget.alive&&!aidTarget.downed&&aidTarget.hp<aidTarget.maxHp&&a.medkits>0){navigate(s,a,aidTarget,128,dt,55);if(distance(a,aidTarget)<72&&hasLineOfSight(s,a,aidTarget)){s.aidTimer+=dt*1.35;work=true;if(s.aidTimer>3){aidTarget.hp=Math.min(aidTarget.maxHp,aidTarget.hp+55);a.medkits--;s.helpRequested=false;s.helpTargetId=null;s.aidTimer=0;radio(s,'AMES','You are patched. Stay with us.');}}}
    else if(phase(s)?.kind==='deliver'&&operationItem(s,phase(s).itemId)?.carrierId===a.id){navigate(s,a,phase(s),movementSpeed(a),dt,22);work=distance(a,phase(s))<phase(s).radius;}
    else if(a.role==='medic'&&phase(s)?.kind==='rescue'&&humanNear(s,s.survivors[phase(s).crew],220)){const crew=s.survivors[phase(s).crew];navigate(s,a,crew,122,dt,42);work=distance(a,crew)<70&&hasLineOfSight(s,a,crew);}
    else{
      let target;
      if(s.role==='member'&&a===leader)target=dest;
      else if(s.role==='member'){const idx=s.squad.indexOf(a),off=[[0,0],[92,76],[-102,62],[12,148]][idx],p=phase(s),anchor=p&&p.kind!=='convoy'&&distance(leader,p)<p.radius+15?p:leader;target=formationPoint(s,anchor,off,s.formationHeading);}
      else if(s.order.type==='follow'){const idx=s.squad.indexOf(a),off=[[0,0],[92,76],[-102,62],[12,148]][idx],p=phase(s),anchor=p&&p.kind!=='convoy'&&distance(anchorPlayer,p)<p.radius+15?p:anchorPlayer;target=formationPoint(s,anchor,off,s.formationHeading);}
      else{const idx=s.squad.indexOf(a),off=[[-78,-70],[78,-70],[-78,70],[78,70]][idx];target=formationPoint(s,s.order,off);}
      if(a!==leader){
        // Each soldier reacts on a slightly different clock instead of tracing
        // the same moving point every frame. Fresh orders bypass that delay.
        const orderKey=`${s.role}:${s.order.type}:${s.order.x}:${s.order.y}:${s.playerId}:${s.stageIndex}`;
        if(!a.formationGoal||a.formationOrderKey!==orderKey||s.time>=(a.nextFormationAt||0)||distance(target,a.formationGoal)>70){
          a.formationGoal=target;a.formationOrderKey=orderKey;a.nextFormationAt=s.time+.28+(a.id%3)*.09;
        }
        target=a.formationGoal;
      }
      const mayCover=enemy&&a!==leader&&(s.role==='member'||s.order.type==='follow')&&distance(a,followAnchor)<235&&!buildingAt(s.world,a)&&!buildingAt(s.world,followAnchor);
      if(mayCover){
        planCover(s,a,enemy,target,145,105);
        const shelter=(a.reloadTimer>0||a.suppression>.72)&&a.coverShelter;
        const edge=shelter||a.coverPoint;if(edge&&distance(edge,followAnchor)<235)target=edge;
      }else{a.coverPoint=null;a.coverShelter=null;}
      const coveringNow=mayCover&&a===covering&&s.time%1.55<1.15&&distance(a,followAnchor)<190&&distance(a,target)>32&&a.reloadTimer<=0&&s.time-s.lastCommand>1&&safeShot(s,a,enemy);
      if(coveringNow){a.moving=false;a.tactic='covering';}
      else{
        const catchup=distance(a,followAnchor)>220?1.18:1,pace=a.role==='medic'?1.03:a.role==='grenadier'?.98:1;
        navigate(s,a,target,movementSpeed(a)*116/112*catchup*pace,dt,s.role==='member'&&a===leader?(['interact','deliver'].includes(phase(s)?.kind)?6:26):20);
        a.tactic=mayCover?(a.moving?'bound':'covering'):(a.moving?'follow':'watch');
      }
    }
    if(enemy){a.angle=Math.atan2(enemy.y-a.y,enemy.x-a.x);if(!work&&combatLOS(s,a,enemy)&&safeShot(s,a,enemy))shoot(s,a,a.angle,false,frameStart);}
    if(a.ammo<=0)tryReload(s,a);
  }
  // Gentle separation prevents identical stacked silhouettes without blocking paths.
  const units=s.squad.filter(a=>a.alive&&!a.downed);
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
    const a=units[i],b=units[j],d=distance(a,b),gap=buildingAt(s.world,a)||buildingAt(s.world,b)?28:40;
    if(d>0&&d<gap){const n=(gap-d)*.25,dx=(a.x-b.x)/d*n,dy=(a.y-b.y)/d*n;if(!controlled(s,a))move(s,a,dx,dy);if(!controlled(s,b))move(s,b,-dx,-dy);}
  }
}
function perceiveEnemy(s,a,targets,dt){
  const profile=enemyProfile(a),limit=nightMission(s)?profile.nightRange:profile.range;
  a.senseTimer=(a.senseTimer||0)-dt;
  let target=targets.find(candidate=>candidate.id===a.perceivedTargetId)||null;
  if(a.senseTimer<=0||a.perceivedTargetId!=null&&!target){
    // Stagger the costly candidate/LOS search. A shot still checks current sight
    // immediately, so cached perception never permits firing through fresh cover.
    a.senseTimer=.18+(a.id%3)*.016;a.sensedAt=s.time;
    target=targetFor(s,a,targets,limit);a.perceivedTargetId=target?.id??null;
    if(target){a.lastKnown={x:target.x,y:target.y};a.lastSeenAt=s.time;}
    else{
      const heard=s.soundEvents.findLast(event=>(event.type==='shot'||event.type==='explosion')&&event.team==='squad'&&s.time-event.time<.3&&distance(a,event)<(hasLineOfSight(s,a,event)?700:320));
      if(heard){a.lastKnown={x:heard.x,y:heard.y};a.lastSeenAt=s.time;}
      // A nearby member can react to its own group's fresh contact. Copy the
      // original observation time: reports cannot refresh one another forever
      // or reveal a player's new position through a wall.
      const report=a.encounterId&&s.enemies.find(other=>other!==a&&other.alive&&other.encounterId===a.encounterId&&other.perceivedTargetId!=null&&
        other.lastKnown&&s.time-other.lastSeenAt<.3&&other.lastSeenAt>a.lastSeenAt&&distance(a,other)<430);
      if(report){a.lastKnown={...report.lastKnown};a.lastSeenAt=report.lastSeenAt;}
    }
  }
  return target;
}
function chooseFlankGoal(s,a){
  const known=a.lastKnown;if(!known)return false;
  const dx=a.x-known.x,dy=a.y-known.y,len=Math.max(1,Math.hypot(dx,dy)),nx=dx/len,ny=dy/len,side=a.flankSide||1;
  const candidates=[side,-side].map(sign=>nearbyFree(s,known.x+nx*205-ny*sign*210,known.y+ny*205+nx*sign*210));
  // At most two bounded route searches per plan, never one per render frame.
  for(const goal of candidates){
    if(distance(a,goal)<60||distance(known,goal)<150||a.defensive&&distance(a.home,goal)>(a.defenseRadius||500))continue;
    const path=findPath(s,a,goal);if(!path.length)continue;
    a.flankGoal=goal;a.path=path;a.pathTarget={...goal};a.pathTimer=1.1;
    a.flankReached=false;a.flankHoldUntil=0;a.flankExpiresAt=s.time+8;
    a.nextFlankAt=s.time+enemyProfile(a).flankInterval;a.flankPlannedAt=s.time;
    return true;
  }
  a.nextFlankAt=s.time+enemyProfile(a).flankInterval;a.flankGoal=null;return false;
}
function updateFlanker(s,a,target,dt,frameStart){
  const profile=enemyProfile(a),remembered=a.lastKnown&&s.time-a.lastSeenAt<=profile.memorySeconds;
  if(!remembered){a.tactic='search';a.moving=false;a.flankGoal=null;a.settleTime=0;return;}
  if((!a.flankGoal||a.flankReached&&s.time>=a.flankHoldUntil||s.time>=a.flankExpiresAt)&&s.time>=(a.nextFlankAt||0))chooseFlankGoal(s,a);
  if(a.flankGoal&&a.suppression<.7){
    const arrived=navigate(s,a,a.flankGoal,profile.speed*(1-a.suppression*.25),dt,22);
    if(arrived&&!a.flankReached){a.flankReached=true;a.flankHoldUntil=s.time+1.2;}
    a.tactic=arrived?'watch':'flank';
  }else{a.tactic='cover';a.moving=false;}
  a.settleTime=a.moving?0:(a.settleTime||0)+dt;
  if(target){
    a.angle=Math.atan2(target.y-a.y,target.x-a.x);
    if(a.settleTime>=.25&&a.cooldown<=0&&distance(a,target)<(nightMission(s)?profile.nightRange:profile.range)&&combatLOS(s,a,target))shoot(s,a,a.angle,false,frameStart);
  }
}
function enemyAdvance(s,a,point,speed,dt,stop){
  if(!point){a.moving=false;return;}
  let goal=point;
  if(a.defensive&&a.home){const dx=point.x-a.home.x,dy=point.y-a.home.y,d=Math.hypot(dx,dy),r=a.defenseRadius||300;if(d>r)goal=nearbyFree(s,a.home.x+dx/d*r,a.home.y+dy/d*r);}
  navigate(s,a,goal,speed,dt,stop);
}
function updateEnemies(s,dt,frameStart=s.time-dt){
  const targets=aliveSquad(s);
  for(const a of s.enemies){
    if(!a.alive)continue;
    if(flashIntensity(a,s.time)>.25){a.moving=false;a.alert=false;a.target=null;a.perceivedTargetId=null;a.senseTimer=0;a.tactic='disoriented';continue;}
    const profile=enemyProfile(a),target=perceiveEnemy(s,a,targets,dt),limit=nightMission(s)?profile.nightRange:profile.range;
    const remembered=a.lastKnown&&s.time-a.lastSeenAt<=6;
    a.alert=!!(target||remembered);a.target=target?.id||null;
    if(!a.alert){
      a.aimCharge=0;a.aimTargetId=null;a.braced=false;a.braceProgress=0;a.tactic=a.kind==='flanker'?'search':'watch';
      if(a.defensive&&a.home&&distance(a,a.home)>35)enemyAdvance(s,a,a.home,profile.speed*.75,dt,25);else a.moving=false;
      continue;
    }
    if((a.kind==='rifleman'||a.kind==='gunner')&&remembered)planCover(s,a,a.lastKnown);
    const shelter=(a.reloadTimer>0||a.suppression>.68)&&a.coverShelter;
    if(shelter&&a.kind!=='sniper'){
      navigate(s,a,shelter,profile.speed*(1-a.suppression*.15),dt,6);
      a.tactic=a.reloadTimer>0?'reload':'cover';a.braceProgress=0;a.braced=false;
      if(target)a.angle=Math.atan2(target.y-a.y,target.x-a.x);
    }else if(a.kind==='sniper'){
      a.moving=false;
      if(target&&distance(a,target)<limit&&combatLOS(s,a,target)){
        a.angle=Math.atan2(target.y-a.y,target.x-a.x);
        if(a.aimTargetId!==target.id){a.aimCharge=0;a.aimTargetId=target.id;}
        if(a.cooldown<=0&&a.reloadTimer<=0&&a.ammo>0){
          a.aimCharge=Math.min(1,(a.aimCharge||0)+dt/(profile.braceDuration+(a.suppression||0)*.9));
          if(a.aimCharge>=1){
            const ammo=a.ammo;shoot(s,a,a.angle,false,frameStart);
            if(a.ammo<ammo&&!a.reportedShot){
              a.reportedShot=true;const dx=a.x-target.x,dy=a.y-target.y,direction=Math.abs(dx)>Math.abs(dy)?dx>0?'east':'west':dy>0?'south':'north';
              radio(s,target.name.toUpperCase(),`Long rifle report from the ${direction}. Get off the open street and check the far approach.`);
            }
          }
        }else a.aimCharge=0;
      }else{a.aimCharge=0;a.aimTargetId=null;}
    }else if(a.kind==='gunner'){
      const sight=target&&distance(a,target)<limit&&combatLOS(s,a,target);
      if(sight){
        a.angle=Math.atan2(target.y-a.y,target.x-a.x);
        if(a.coverPoint)navigate(s,a,a.coverPoint,profile.speed,dt,18);
        else if(distance(a,target)>profile.stop+20)enemyAdvance(s,a,target,profile.advanceSpeed,dt,profile.stop);else a.moving=false;
        if(a.moving||a.reloadTimer>0||a.suppression>.65)a.braceProgress=0;
        else a.braceProgress=Math.min(1,(a.braceProgress||0)+dt/(profile.braceDuration*(1+a.suppression*.8)));
        a.braced=a.braceProgress>=1;a.tactic=a.braced?'support':'brace';
        if(a.braced&&a.cooldown<=0)shoot(s,a,a.angle,false,frameStart);
      }else{
        a.braceProgress=0;a.braced=false;a.tactic='search';
        if(remembered&&a.coverPoint)navigate(s,a,a.coverPoint,profile.speed,dt,18);
        else if(remembered)enemyAdvance(s,a,a.lastKnown,profile.speed,dt,profile.stop);else a.moving=false;
      }
    }else if(a.kind==='flanker')updateFlanker(s,a,target,dt,frameStart);
    else if(target){
      a.angle=Math.atan2(target.y-a.y,target.x-a.x);
      if(a.coverPoint)navigate(s,a,a.coverPoint,profile.speed,dt,18);
      else if(distance(a,target)>profile.stop+20)enemyAdvance(s,a,target,profile.advanceSpeed,dt,profile.stop);else a.moving=false;
      a.tactic=a.moving?'reposition':'fire';
      if(a.cooldown<=0&&distance(a,target)<limit&&combatLOS(s,a,target))shoot(s,a,a.angle,false,frameStart);
    }else if(remembered){a.tactic='search';if(a.coverPoint)navigate(s,a,a.coverPoint,profile.speed,dt,18);else enemyAdvance(s,a,a.lastKnown,profile.speed,dt,230);}else a.moving=false;
    if(a.ammo<=0)tryReload(s,a);
  }
  updateEncounters(s,dt,encounterHooks);
}

function survivorFollowPoint(s,c,lead,index){
  const p=phase(s),extracting=p&&['extract','escort'].includes(p.kind)&&distance(lead,p)<p.radius*.85;
  const anchor=extracting?p:lead,room=buildingAt(s.world,anchor),side=index%2===0?-1:1;
  const offsets=extracting?[[side*24,18],[side*18,-18],[0,0]]:[[side*30,68],[side*24,40],[0,32],[side*24,0],[0,0]];
  for(const [dx,dy] of offsets){
    const point={x:anchor.x+dx,y:anchor.y+dy};
    if(extracting&&distance(point,p)>Math.max(0,p.radius-38))continue;
    // Do not move a desired offset to the far side of the next wall. Staying
    // closer to the escort is better than assigning a room they cannot reach.
    if(buildingAt(s.world,point)!==room||!free(s,point.x,point.y,c.radius||12)||!walkLine(s,anchor,point,c.radius||12))continue;
    return point;
  }
  return{x:anchor.x,y:anchor.y};
}
function updateCivilians(s,dt){
  updateCivilianBehavior(s,dt,{free,hasLineOfSight,findPath,walkLine,navigate,soundEvent});
  const lead=currentLeader(s),p=phase(s),extracting=p&&['extract','escort'].includes(p.kind)&&distance(lead,p)<p.radius*.85;
  for(let i=0;i<s.survivors.length;i++){const c=s.survivors[i];if(c.alive&&c.stabilized&&!c.downed&&!c.missionWait){const target=survivorFollowPoint(s,c,lead,i);navigate(s,c,target,c.escortSpeed||119,dt,extracting?12:24);}}
}
function humanNear(s,p,range=p.radius){return humans(s).some(a=>a.alive&&!a.downed&&distance(a,p)<range);}
function allHumansNear(s,p,range=p.radius){
  const living=humans(s).filter(a=>a.alive);
  return living.length>0&&living.every(a=>!a.downed&&distance(a,p)<range);
}
function humanWorking(s,p,inputs,range=p.radius){return humans(s).some(a=>a.alive&&!a.downed&&distance(a,p)<range&&hasLineOfSight(s,a,p)&&inputFor(s,a,inputs).interact);}
function squadIn(s,p){return aliveSquad(s).filter(a=>distance(a,p)<p.radius).length;}
function updateConvoy(s,inputs,dt){
  const v=s.vehicles[0],next=s.convoyRoute[s.convoyIndex+1];
  if(!next){advance(s);return;}
  const blocked=next.blocked&&!s.convoyCleared.includes(s.convoyIndex+1)&&distance(v,next)<110;
  if(blocked){
    v.waiting=true;const worker=currentLeader(s);
    const workPoint=next.repair?v:next,duration=next.repair?8:6;
    if(next.repair&&s.convoyTroubleAt!==s.convoyIndex){s.convoyTroubleAt=s.convoyIndex;radio(s,'DRIVER','Lead carrier stalled at the junction. Cover us and help restart it.');}
    const playerWorking=humanWorking(s,workPoint,inputs,85);
    const leaderWorking=s.role==='member'&&distance(worker,workPoint)<85&&worker.alive&&!worker.downed&&humanNear(s,workPoint,260)&&s.waitUntil<=s.time;
    const canWork=playerWorking||leaderWorking;
    if(canWork){s.convoyClear+=dt;s.interactionPrompt=`${next.repair?'Restarting carrier':'Clearing obstruction'} · ${Math.round(s.convoyClear/duration*100)}%`;}
    if(s.convoyClear>=duration){s.convoyCleared.push(s.convoyIndex+1);s.convoyClear=0;const prop=s.world.props.find(p=>p.type==='barricade'&&distance(p,next)<10);if(prop)prop.cleared=true;radio(s,'HALE',next.repair?'Carrier running. Stay with the vehicles.':'Route is open. Keep up with the vehicles.');}
  }else{
    const close=aliveSquad(s).filter(a=>distance(a,v)<265).length>=2&&allHumansNear(s,v,310)&&s.survivors.filter(c=>c.alive&&c.stabilized&&!c.missionWait).every(c=>!c.downed&&distance(c,v)<300);
    v.waiting=!close;
    if(close){const dx=next.x-v.x,dy=next.y-v.y,d=Math.hypot(dx,dy),amount=Math.min(62*dt,d);v.angle=Math.atan2(dy,dx);v.x+=Math.cos(v.angle)*amount;v.y+=Math.sin(v.angle)*amount;if(d<8)s.convoyIndex++;}
  }
  for(let i=1;i<s.vehicles.length;i++){const a=s.vehicles[i],front=s.vehicles[i-1];if(distance(a,front)>113){const dx=front.x-a.x,dy=front.y-a.y;a.angle=Math.atan2(dy,dx);a.x+=Math.cos(a.angle)*62*dt;a.y+=Math.sin(a.angle)*62*dt;}}
  s.progress=s.convoyIndex/(s.convoyRoute.length-1);
}
function updateMission(s,inputs,dt){
  const p=phase(s);if(!p)return;
  if(p.kind==='convoy'){updateConvoy(s,inputs,dt);return;}
  if(operationWork(s,inputs,dt,operationHooks))return;
  let work=false;
  if(p.kind==='rally')work=allHumansNear(s,p)&&squadIn(s,p)>=Math.min(3,aliveSquad(s).length);
  if(p.kind==='hold'){
    work=squadIn(s,p)>=Math.min(2,aliveSquad(s).length)&&allHumansNear(s,p,p.radius+100);
    if(s.stageIndex===s.stages.length-1)work=work&&s.squad.filter(a=>a.alive).every(a=>!a.downed&&distance(a,p)<p.radius);
  }
  if(p.kind==='rescue'){
    const c=s.survivors[p.crew],medic=s.squad.find(a=>a.role==='medic'&&a.alive&&!a.downed&&!controlled(s,a));
    if(medic&&humanNear(s,c,220)&&distance(medic,c)<70&&hasLineOfSight(s,medic,c))work=true;
    if(humanWorking(s,c,inputs,p.radius))work=true;
    if(work)s.interactionPrompt=`Stabilizing ${c.name} · ${Math.round(s.phaseTime/p.duration*100)}%`;
  }
  if(p.kind==='escort'||p.kind==='extract'){
    const alive=s.squad.filter(a=>a.alive),crew=s.survivors.filter(a=>a.alive&&!a.missionWait);
    work=alive.every(a=>!a.downed&&distance(a,p)<p.radius)&&crew.every(a=>a.stabilized&&!a.downed&&distance(a,p)<p.radius);
    if(p.requiresTransmission&&!s.operation?.transmission?.complete)work=false;
  }
  if(work)s.phaseTime+=dt;
  s.progress=clamp(s.phaseTime/(p.duration||1),0,1);
  if(s.phaseTime>=p.duration){
    if(p.kind==='rescue'){const c=s.survivors[p.crew];c.downed=false;c.stabilized=true;c.missionWait=false;c.hp=c.maxHp;const marker=s.operation?.objects.find(o=>o.id===p.id);if(marker)marker.completed=true;radio(s,'AMES',`${c.name} can move. Keep them with us.`);}
    if(p.id==='collection-hold')radio(s,'RADIO','A helicopter is down. All chalks, stand by for new orders.');
    advance(s);
  }
}
function updateVisibility(s,dt){
  s.visibilityTimer-=dt;if(s.visibilityTimer>0)return;s.visibilityTimer=.12;const eyes=aliveSquad(s).filter(a=>flashIntensity(a,s.time)<.8);
  for(const e of s.enemies)e.visible=eyes.some(a=>{
    const recovery=1-flashIntensity(a,s.time)*.8,range=visionRange(a,s.missionIndex,e)*recovery,glint=e.kind==='sniper'&&e.aimCharge>0?(nightMission(s)?520:760)*recovery:0;
    return distance(a,e)<Math.max(range,glint)&&combatLOS(s,a,e);
  });
}
export function step(s,input={},dt=1/60){
  return advanceSimulation(s,input,dt);
}
/** Step one shared world once, applying both players' latest inputs independently. */
export function stepCoop(s,inputsByActorId={},dt=1/60){
  if(!s.coop)setHumanPlayers(s,[s.playerId]);
  return advanceSimulation(s,inputsByActorId,dt);
}
function advanceSimulation(s,input,dt){
  if(s.status!=='playing')return s;dt=clamp(finite(dt),0,.05);if(!dt)return s;const frameStart=s.time;s.time+=dt;s.stats.elapsed=s.time;s.interactionPrompt='';
  if(s.coop)syncCoopControl(s);
  for(const a of [...s.squad,...s.enemies]){a.cooldown=Math.max(0,(a.cooldown||0)-dt);a.grenadeCooldown=Math.max(0,(a.grenadeCooldown||0)-dt);a.handThrowCooldown=Math.max(0,(a.handThrowCooldown||0)-dt);a.suppression=Math.max(0,(a.suppression||0)-dt*.22);if(a.reloadTimer>0){a.reloadTimer-=dt;if(a.reloadTimer<=0){const add=Math.min(a.magSize-a.ammo,a.reserve);a.ammo+=add;a.reserve-=add;a.reloadTimer=0;soundEvent(s,'reload_end',a);}}}
  updateSquad(s,input,dt,frameStart);updateEnemies(s,dt,frameStart);updateBullets(s,dt,frameStart);updateGrenades(s,dt,frameStart);updateCivilians(s,dt);
  if(!s.squad.some(a=>a.alive&&!a.downed)){s.status='lost';s.endReason='The entire chalk is down. Retry and keep the squad together.';}
  // A human may take over any standing AI squadmate. Losing the two initially
  // selected soldiers must not end a mission while another soldier can continue.
  if(s.status==='playing')updateOperations(s,dt,operationHooks);
  if(s.status==='playing')updateStory(s,input,dt,storyHooks);
  if(s.status==='playing')updateMission(s,input,dt);
  if(s.status==='playing')updateObjective(s);
  else finalizeStory(s,storyHooks);
  updateVisibility(s,dt);
  recordDeadActors(s);
  // Keep permanent bodies before retiring heavyweight enemy AI state.
  s.enemies=s.enemies.filter(a=>a.alive||s.time-(a.deathTime||0)<16);
  for(const e of s.effects)e.ttl-=dt;s.effects=s.effects.filter(e=>e.ttl>0);
  for(const smoke of s.smokes)smoke.ttl-=dt;s.smokes=s.smokes.filter(e=>e.ttl>0);
  s.soundEvents=s.soundEvents.filter(event=>s.time-event.time<=3);
  s.pings=(s.pings||[]).filter(p=>p.expiresAt>s.time);
  return s;
}
