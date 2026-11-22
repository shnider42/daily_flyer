// CHALK — deterministic, browser-independent solo and authoritative co-op simulation.
// Fictional squad and compressed mission geography inspired by October 1993.
export const MISSIONS = [
  { id:'cordon', title:'Cordon', subtitle:'A short operation', time:'3 OCT 1993 · AFTERNOON', description:'Take up the cordon, hold the collection point, and get your squad to the convoy.', briefing:['A brief operation is becoming a long afternoon. Your four-person chalk has landed several blocks from the objective.','Move together. Secure the collection point, then meet the waiting convoy. Civilians are still in the streets.'], goals:['Reach the first rally point','Hold the collection point','Regroup at the convoy'] },
  { id:'first-crash', title:'First Crash', subtitle:'The mission has changed', time:'3 OCT 1993 · LATE AFTERNOON', description:'Reach a downed helicopter, stabilize its crew, and bring them to the collection point.', briefing:['A helicopter is down. Smoke marks the site beyond the market. The crew need help before they can move.','Stay close while the medic works. Recovered crew will follow the squad. Bring them to the casualty collection point.'], goals:['Reach the crash site','Stabilize both crew members','Escort the crew to safety'] },
  { id:'night-relief', title:'Night Relief', subtitle:'A way through the city', time:'3–4 OCT 1993 · OVERNIGHT', description:'Accompany the relief vehicles, clear two obstructions, and cover casualty loading.', briefing:['A relief force is working its way through the city. Malaysian and Pakistani forces were part of the historical rescue effort alongside U.S. troops.','In this condensed mission, accompany the convoy and clear its blocked route. Vehicles wait when the squad falls behind.'], goals:['Meet the relief convoy','Clear the blocked route','Hold while casualties board'] },
  { id:'dawn-mile', title:'Dawn Mile', subtitle:'Get the survivors through', time:'4 OCT 1993 · DAWN', description:'Move through the city to the aid station. Keep the squad together; there is no need to clear every street.', briefing:['The night is ending. Casualties fill the transport, and your chalk is moving out on foot.','Follow the rally points to the stadium medical station. Help anyone who goes down and get every surviving squad member inside.'], goals:['Reach three rally positions','Keep the squad together','Extract at the aid station'] },
];

export const DIFFICULTIES = { story:{enemyDamage:7,enemyHp:54,maxEnemies:8,spawnDelay:17,playerHp:140}, standard:{enemyDamage:10,enemyHp:72,maxEnemies:12,spawnDelay:12,playerHp:120}, veteran:{enemyDamage:15,enemyHp:92,maxEnemies:16,spawnDelay:9,playerHp:100} };
const W=2400,H=1900,CELL=40,COLS=W/CELL,ROWS=Math.ceil(H/CELL);
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sq=(x)=>x*x;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
function random(s){s.rngState=(Math.imul(s.rngState,1664525)+1013904223)>>>0;return s.rngState/4294967296;}
function range(s,a,b){return a+(b-a)*random(s);}
function radio(s,speaker,text){s.radio.push({id:++s.nextId,time:s.time,speaker,text});if(s.radio.length>10)s.radio.shift();}
function effect(s,type,x,y,ttl=.2,angle=0,metadata={}){s.effects.push({type,x,y,ttl,maxTtl:ttl,angle,...metadata});if(s.effects.length>220)s.effects.shift();}
function weaponFor(a){return a.team==='enemy'?'hostile':a.role==='support'?'support':'rifle';}
function soundEvent(s,type,a,extra={}){
  // Audio reads a separate event ring: a brief muzzle flash may expire between
  // render frames while catch-up simulation still needs to produce its sound.
  const event={id:++s.nextId,time:s.time,type,x:a.x,y:a.y,team:a.team,actorId:a.id,weapon:weaponFor(a),...extra};
  s.soundEvents.push(event);
  if(s.soundEvents.length>128)s.soundEvents.splice(0,s.soundEvents.length-128);
}
function rectContains(r,x,y,pad=0){return x>=r.x-pad&&x<=r.x+r.w+pad&&y>=r.y-pad&&y<=r.y+r.h+pad;}
export function segmentRectEntry(a,b,r,pad=0){
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x+pad],[dx,r.x+r.w+pad-a.x],[-dy,a.y-r.y+pad],[dy,r.y+r.h+pad-a.y]]){
    if(Math.abs(p)<1e-8){if(q<0)return Infinity;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return Infinity;}
  }return lo;
}
function segmentRect(a,b,r,pad=0){return Number.isFinite(segmentRectEntry(a,b,r,pad));}
export function hasLineOfSight(s,a,b){return !s.world.buildings.some(r=>segmentRect(a,b,r));}
function walkLine(s,a,b,r=15){return !s.world.buildings.some(ob=>segmentRect(a,b,ob,r));}
function free(s,x,y,r=15){return x>=r&&y>=r&&x<=W-r&&y<=H-r&&!s.world.buildings.some(b=>rectContains(b,x,y,r));}
function nearbyFree(s,x,y){
  x=clamp(x,25,W-25);y=clamp(y,25,H-25);if(free(s,x,y))return{x,y};
  for(let ring=1;ring<15;ring++)for(let i=0;i<ring*8;i++){const a=TAU*i/(ring*8),p={x:x+Math.cos(a)*ring*24,y:y+Math.sin(a)*ring*24};if(free(s,p.x,p.y))return p;}
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
  for(let i=0;i<80;i++){const p=nearbyFree(s,range(s,70,W-70),range(s,70,H-70));world.props.push({type:i%3===0?'crate':'debris',x:p.x,y:p.y,w:range(s,5,16),h:range(s,5,13),angle:range(s,0,TAU)});}
  world.props.push({type:'stadium',x:2180,y:12,w:200,h:115});
  s.grid=new Uint8Array(COLS*ROWS);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(!free(s,x*CELL+CELL/2,y*CELL+CELL/2,17))s.grid[y*COLS+x]=1;
}

function nodeFor(s,p){
  const gx=clamp(Math.floor(p.x/CELL),0,COLS-1),gy=clamp(Math.floor(p.y/CELL),0,ROWS-1);
  if(!s.grid[gy*COLS+gx])return gy*COLS+gx;
  for(let r=1;r<12;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;const x=gx+dx,y=gy+dy;
    if(x>=0&&y>=0&&x<COLS&&y<ROWS&&!s.grid[y*COLS+x])return y*COLS+x;
  }return gy*COLS+gx;
}
const nodePoint=(id)=>({x:(id%COLS)*CELL+CELL/2,y:Math.floor(id/COLS)*CELL+CELL/2});
// Bounded A*; coordinates are world pixels. Useful for AI and deterministic tests.
export function findPath(s,from,to){
  const end=nearbyFree(s,to.x,to.y);if(walkLine(s,from,end))return[end];
  const start=nodeFor(s,from),goal=nodeFor(s,end);if(start===goal)return[end];
  const g=new Float32Array(s.grid.length).fill(Infinity),prev=new Int32Array(s.grid.length).fill(-1),closed=new Uint8Array(s.grid.length),heap=[];
  const goalX=goal%COLS,goalY=Math.floor(goal/COLS);
  function push(id,cost){const n={id,cost};heap.push(n);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].cost<=cost)break;heap[i]=heap[p];i=p;}heap[i]=n;}
  function pop(){const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(heap[c].cost>=last.cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out.id;}
  g[start]=0;push(start,0);let iterations=0;
  while(heap.length&&iterations++<4000){const n=pop();if(closed[n])continue;if(n===goal)break;closed[n]=1;const x=n%COLS,y=Math.floor(n/COLS);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx===0&&dy===0)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;const id=ny*COLS+nx;
      if(s.grid[id]||closed[id]||(dx&&dy&&(s.grid[y*COLS+nx]||s.grid[ny*COLS+x])))continue;
      const cost=g[n]+(dx&&dy?1.4142:1);if(cost<g[id]){g[id]=cost;prev[id]=n;push(id,cost+Math.hypot(nx-goalX,ny-goalY));}
    }
  }
  if(prev[goal]===-1)return[];
  const route=[];for(let n=goal;n!==start&&n!==-1;n=prev[n])route.push(nodePoint(n));route.reverse();route.push(end);
  // String-pull only when a radius-expanded segment really clears all walls.
  const short=[];let at=from,index=0;
  while(index<route.length){let far=index;for(let j=index+1;j<route.length;j++){if(walkLine(s,at,route[j]))far=j;else break;}short.push(route[far]);at=route[far];index=far+1;}
  return short;
}
function move(s,a,dx,dy){
  const r=a.radius||13;const nx=clamp(a.x+dx,r,W-r),ny=clamp(a.y+dy,r,H-r);
  if(free(s,nx,a.y,r))a.x=nx;if(free(s,a.x,ny,r))a.y=ny;
}
function navigate(s,a,target,speed,dt,stop=12){
  if(distance(a,target)<=stop){a.moving=false;return true;}
  a.pathTimer=(a.pathTimer||0)-dt;
  if(!a.path||!a.path.length||a.pathTimer<=0||!a.pathTarget||distance(target,a.pathTarget)>65){a.path=findPath(s,a,target);a.pathTarget={...target};a.pathTimer=.9+random(s)*.3;}
  while(a.path.length&&distance(a,a.path[0])<18)a.path.shift();
  const dest=a.path[0];if(!dest){a.moving=false;return false;}
  const dx=dest.x-a.x,dy=dest.y-a.y,len=Math.hypot(dx,dy),amount=Math.min(speed*dt,len);
  if(len){move(s,a,dx/len*amount,dy/len*amount);if(!a.target)a.angle=Math.atan2(dy,dx);a.moving=true;}
  return false;
}
function actor(s,team,name,kind,x,y,extra={}){return{id:++s.nextId,team,name,kind,x,y,angle:-Math.PI/2,hp:100,maxHp:100,alive:true,downed:false,radius:13,cooldown:range(s,.1,.8),suppression:0,reloadTimer:0,ammo:30,magSize:30,reserve:180,path:[],pathTimer:0,reviveProgress:0,bleed:0,visible:team!=='enemy',...extra};}
function stagesFor(m){
  if(m===0)return[
    {kind:'rally',x:680,y:1340,radius:100,title:'Form the cordon',description:'Get the squad to the first rally point.',duration:2},
    {kind:'hold',x:1160,y:960,radius:125,title:'Hold the collection point',description:'Keep at least two squad members inside the marked area.',duration:55},
    {kind:'extract',x:1640,y:580,radius:150,title:'Regroup at the convoy',description:'Bring every surviving squad member to the vehicles.',duration:3},
  ];
  if(m===1)return[
    {kind:'rally',x:1160,y:960,radius:130,title:'Reach the crash site',description:'Follow the smoke and regroup near the downed helicopter.',duration:2},
    {kind:'rescue',x:1110,y:950,radius:75,title:'Stabilize the first crew member',description:'Hold Interact nearby, or protect the medic while they work.',duration:13,crew:0},
    {kind:'rescue',x:1215,y:1020,radius:75,title:'Stabilize the second crew member',description:'The crew need help before they can follow you.',duration:13,crew:1},
    {kind:'extract',x:2120,y:580,radius:165,title:'Escort the crew to safety',description:'Keep the recovered crew close and bring everyone to the collection point.',duration:3},
  ];
  if(m===2)return[
    {kind:'rally',x:200,y:1340,radius:130,title:'Meet the relief convoy',description:'Rally with the vehicles. The convoy moves when your squad is close.',duration:2},
    {kind:'convoy',x:200,y:1340,radius:190,title:'Accompany the relief convoy',description:'Stay close to the lead vehicle. Clear the route when it stops.',duration:1},
    {kind:'hold',x:2120,y:580,radius:160,title:'Cover casualty loading',description:'Bring every surviving squad member to the convoy and cover casualty loading.',duration:42},
  ];
  return[
    {kind:'rally',x:680,y:1340,radius:130,title:'Leave the collection point',description:'Rally the squad here before moving to the next street.',duration:8},
    {kind:'rally',x:1160,y:960,radius:130,title:'Cross the market district',description:'Hold for a head count. You do not need to clear every street.',duration:10},
    {kind:'rally',x:1640,y:580,radius:130,title:'Reach the final junction',description:'Rally everyone here. The aid station is beyond the next block.',duration:12},
    {kind:'extract',x:2120,y:200,radius:170,title:'Reach the aid station',description:'Bring every surviving squad member inside the extraction area.',duration:3},
  ];
}
export function createGame({mission=0,role='leader',difficulty='standard',seed=19931003}={}){
  const missionIndex=clamp(Math.floor(finite(mission)),0,MISSIONS.length-1);if(!DIFFICULTIES[difficulty])difficulty='standard';role=role==='member'?'member':'leader';
  const s={missionIndex,mission:MISSIONS[missionIndex],role,difficulty,seed,rngState:(seed>>>0)||1,time:0,status:'playing',endReason:'',nextId:0,world:null,squad:[],enemies:[],civilians:[],survivors:[],vehicles:[],bullets:[],effects:[],soundEvents:[],smokes:[],objective:null,stageIndex:0,stageCount:0,progress:0,radio:[],stats:{shots:0,hits:0,squadDowns:0,rescued:0,civilianHarm:0,objectives:0,elapsed:0},order:{type:'follow',x:200,y:1720,label:'Regroup on you'},leaderOrder:'Move to the first rally point',playerId:null,waitUntil:0,spawnTimer:16,visibilityTimer:0,aidTimer:0,maxEnemies:DIFFICULTIES[difficulty].maxEnemies,convoyIndex:0,convoyClear:0,convoyCleared:[],lastLeaderState:'',lastCommand:-20,phaseTime:0};
  makeWorld(s);
  const hp=DIFFICULTIES[difficulty].playerHp;
  s.squad=[actor(s,'squad','Hale','leader',200,1720,{role:'leader',hp,maxHp:hp,smokes:3,medkits:2}),actor(s,'squad','Mercer','rifleman',240,1756,{role:'rifleman',hp,maxHp:hp,smokes:3,medkits:2}),actor(s,'squad','Ames','medic',160,1754,{role:'medic',hp,maxHp:hp,smokes:2,medkits:5}),actor(s,'squad','Webb','support',200,1800,{role:'support',hp,maxHp:hp,smokes:2,medkits:2,ammo:60,magSize:60,reserve:240})];
  s.playerId=role==='leader'?s.squad[0].id:s.squad[1].id;
  player(s).cooldown=0;
  s.stages=stagesFor(missionIndex);s.stageCount=s.stages.length;
  if(missionIndex===1){
    s.vehicles.push({id:++s.nextId,x:1160,y:960,angle:.65,w:150,h:60,hp:0,maxHp:100,kind:'helicopter',active:false,name:'Downed helicopter'});
    s.survivors.push(actor(s,'survivor','Crew 1','crew',1110,950,{hp:40,maxHp:70,downed:true,stabilized:false,radius:12}),actor(s,'survivor','Crew 2','crew',1215,1020,{hp:40,maxHp:70,downed:true,stabilized:false,radius:12}));
  }
  if(missionIndex===0)s.vehicles.push({id:++s.nextId,x:1610,y:580,angle:0,w:72,h:35,hp:180,maxHp:180,kind:'truck',active:false,name:'Extraction transport'},{id:++s.nextId,x:1715,y:580,angle:0,w:72,h:35,hp:180,maxHp:180,kind:'truck',active:false,name:'Extraction transport'});
  if(missionIndex===2){
    s.convoyRoute=[{x:200,y:1340},{x:680,y:1340},{x:1160,y:1340,blocked:true},{x:1160,y:960},{x:1640,y:960,blocked:true},{x:2120,y:960},{x:2120,y:580}];
    s.vehicles.push({id:++s.nextId,x:200,y:1340,angle:-Math.PI/2,w:80,h:41,hp:220,maxHp:220,kind:'apc',active:true,waiting:true,name:'Relief lead'},{id:++s.nextId,x:200,y:1455,angle:-Math.PI/2,w:80,h:41,hp:220,maxHp:220,kind:'apc',active:true,name:'Relief carrier'},{id:++s.nextId,x:200,y:1570,angle:-Math.PI/2,w:72,h:36,hp:180,maxHp:180,kind:'truck',active:true,name:'Casualty transport'});
    s.convoyRoute.filter(p=>p.blocked).forEach(p=>s.world.props.push({type:'barricade',x:p.x,y:p.y,w:82,h:23,cleared:false}));
  }
  for(let i=0;i<10;i++){
    const x=[680,1160,1640,2120][i%4]+range(s,-45,45),y=[580,960,1340][i%3]+range(s,-40,40);
    s.civilians.push(actor(s,'civilian',`Civilian ${i+1}`,'civilian',x,y,{hp:45,maxHp:45,radius:11,shelter:nearbyFree(s,x+range(s,-130,130),y+range(s,-130,130)),panicked:0}));
  }
  seedEnemies(s);
  updateObjective(s);
  radio(s,'RADIO','Chalk, stay together. Watch for civilians.');
  radio(s,'HALE',role==='member'?'On me, Mercer. I will call our route.':'Chalk ready. We are following your lead.');
  return s;
}

function seedEnemies(s){
  const points=[{x:680,y:1100},{x:950,y:960},{x:1370,y:960},{x:1640,y:800},{x:1870,y:580},{x:2120,y:330}];
  for(let i=0;i<Math.min(6,s.maxEnemies);i++){const p=nearbyFree(s,points[i].x+range(s,-35,35),points[i].y+range(s,-35,35));spawnEnemy(s,p);}
}
function spawnEnemy(s,p){const hp=DIFFICULTIES[s.difficulty].enemyHp;s.enemies.push(actor(s,'enemy','Armed fighter',random(s)<.2?'gunner':'rifleman',p.x,p.y,{hp,maxHp:hp,home:{...p},ammo:30,reserve:300,alert:false,accuracy:range(s,.09,.16)}));}
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
function syncCoopControl(s){
  const owned=humans(s);
  const canonical=owned.find(a=>a.role==='leader'&&a.alive)||owned.find(a=>a.alive)||owned[0]||s.squad.find(a=>a.role==='leader')||s.squad[0];
  s.playerId=canonical.id;
  s.role=controlled(s,currentLeader(s))?'leader':'member';
}
/** Set server-owned human slots; any vacant soldier immediately returns to AI. */
export function setHumanPlayers(s,actorIds=[]){
  const previous=new Set(s.coop?s.humanIds:[]),previousRole=s.role;
  const allowed=new Set(s.squad.filter(a=>a.role==='leader'||a.role==='rifleman').map(a=>a.id));
  s.coop=true;s.humanIds=[...new Set(Array.isArray(actorIds)?actorIds:[])].filter(id=>allowed.has(id)).slice(0,2);
  for(const a of s.squad){
    a.human=s.humanIds.includes(a.id);
    if(a.human!==previous.has(a.id)){a.path=[];a.pathTimer=0;a.moving=false;a.bandageProgress=0;}
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
  const p=phase(s);if(!p)return;let x=p.x,y=p.y,kind=p.kind,interaction=kind==='rescue',detail='';
  if(kind==='convoy'){
    const lead=s.vehicles[0],next=s.convoyRoute[s.convoyIndex+1];x=lead.x;y=lead.y;
    if(next?.blocked&&!s.convoyCleared.includes(s.convoyIndex+1)&&distance(lead,next)<110){x=next.x;y=next.y;interaction=true;kind='barricade';detail=`Clear obstruction · ${Math.ceil(Math.max(0,6-s.convoyClear))} sec`;}
    else detail=lead.waiting?'Convoy waiting · stay near the lead vehicle':`Convoy moving · ${s.convoyIndex+1}/${s.convoyRoute.length}`;
  }else if(kind==='rescue'){const c=s.survivors[p.crew];x=c.x;y=c.y;detail=`Stabilizing · ${Math.round(s.phaseTime/p.duration*100)}%`;}
  else if(kind==='hold'){
    detail=`Hold position · ${Math.ceil(Math.max(0,p.duration-s.phaseTime))} sec`;
    if(s.stageIndex===s.stages.length-1){const living=s.squad.filter(a=>a.alive),present=living.filter(a=>!a.downed&&distance(a,p)<p.radius).length;detail+=` · Squad ${present}/${living.length}`;}
  }
  else if(kind==='extract'){
    const living=s.squad.filter(a=>a.alive),inZone=living.filter(a=>!a.downed&&distance(a,p)<p.radius).length,crew=s.survivors.filter(a=>a.alive&&a.stabilized),crewIn=crew.filter(a=>distance(a,p)<p.radius).length;
    detail=`Squad ${inZone}/${living.length}${crew.length?` · Crew ${crewIn}/${crew.length}`:''}`;
  }else detail=s.phaseTime>0?`Rallying the squad · ${Math.ceil(Math.max(0,p.duration-s.phaseTime))} sec`:'Move the squad into the marked area';
  s.objective={x,y,radius:p.radius,title:kind==='barricade'?'Clear the obstruction':p.title,description:kind==='barricade'?'Hold Interact near the barrier, or let your AI leader clear it.':p.description,kind,progress:kind==='barricade'?s.convoyClear/6:clamp(s.phaseTime/(p.duration||1),0,1),detail,interaction};
}
export function issueOrder(s,type,point){
  if(s.status!=='playing')return false;const pl=player(s);
  if(s.role==='member'){
    if(type==='wait'){s.waitUntil=s.time+12;radio(s,'MERCER','Hold up. Give me a moment.');describeLeader(s,'Holding for you · 12 seconds');return true;}
    if(type==='ready'){s.waitUntil=0;radio(s,'MERCER','Ready. Moving with you.');return true;}
    if(type==='help'||type==='assist'){s.helpRequested=true;radio(s,'MERCER','Medic, I need help.');return true;}
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
export function setRole(s,role){
  if(s.coop)return false;
  if(role!=='leader'&&role!=='member')return;s.role=role;
  const desired=s.squad.find(a=>a.role===(role==='leader'?'leader':'rifleman')&&a.alive)||s.squad.find(a=>a.alive);
  if(desired)s.playerId=desired.id;s.waitUntil=0;s.order={type:'follow',x:desired?.x||200,y:desired?.y||1720,label:'Regroup on you'};
  radio(s,'RADIO',role==='leader'?'You have command of the chalk.':'Hale has the chalk. Stay with your squad.');
}
function combatLOS(s,a,b){
  if(!hasLineOfSight(s,a,b))return false;
  for(const smoke of s.smokes){if(smoke.ttl<1)continue;const len=distance(a,b),steps=Math.ceil(len/40);let inside=0;for(let i=0;i<=steps;i++){const t=i/Math.max(1,steps);if(Math.hypot(a.x+(b.x-a.x)*t-smoke.x,a.y+(b.y-a.y)*t-smoke.y)<smoke.radius)inside++;}if(inside>2)return false;}
  return true;
}
function targetFor(s,a,targets,maxRange){
  let best=null,bestDist=maxRange;for(const t of targets){if(!t.alive||t.downed)continue;const d=distance(a,t);if(d<bestDist&&combatLOS(s,a,t)){best=t;bestDist=d;}}return best;
}
function tryReload(s,a){if(a.reloadTimer<=0&&a.ammo<a.magSize&&a.reserve>0){a.reloadTimer=a.role==='support'?3.2:2.2;soundEvent(s,'reload_start',a);}}
function shoot(s,a,angle,isPlayer=false){
  if(a.downed||!a.alive||a.cooldown>0||a.reloadTimer>0)return;
  if(a.ammo<=0){tryReload(s,a);return;}
  a.ammo--;
  if(a.team==='enemy'){a.burst=(a.burst||0)+1;a.cooldown=a.burst%3===0?range(s,1.25,1.75):.19;}
  else a.cooldown=isPlayer?.15:(a.role==='support'?.4:.56);
  const spread=a.team==='enemy'?a.accuracy:isPlayer?.018+.045*(a.suppression||0)+(a.moving?.02:0):.04;
  const shotAngle=angle+range(s,-spread,spread);
  // Projectile dispersion should not pull a human's aim away from the cursor.
  // Preserve the same random draw and projectile trajectory as before.
  if(!isPlayer)a.angle=shotAngle;
  const x=a.x+Math.cos(shotAngle)*20,y=a.y+Math.sin(shotAngle)*20;
  const metadata={team:a.team,actorId:a.id,weapon:weaponFor(a)};
  s.bullets.push({id:++s.nextId,x,y,px:x,py:y,vx:Math.cos(shotAngle)*930,vy:Math.sin(shotAngle)*930,team:a.team,owner:a.id,weapon:metadata.weapon,damage:a.team==='enemy'?DIFFICULTIES[s.difficulty].enemyDamage:24,ttl:.64});
  effect(s,'muzzle',x,y,.075,shotAngle,metadata);soundEvent(s,'shot',a,{x,y});s.lastShot=s.time;if(isPlayer)s.stats.shots++;
}
function safeShot(s,a,t){
  const dx=t.x-a.x,dy=t.y-a.y,len2=dx*dx+dy*dy;
  return !s.civilians.some(c=>{if(!c.alive||c.downed)return false;const f=((c.x-a.x)*dx+(c.y-a.y)*dy)/len2;if(f<=0||f>=1)return false;return Math.hypot(c.x-a.x-f*dx,c.y-a.y-f*dy)<24;});
}
function damage(s,a,amount,source){
  if(!a.alive||a.downed)return;a.hp=Math.max(0,a.hp-amount);a.suppression=clamp((a.suppression||0)+.3,0,1);effect(s,'hit',a.x,a.y,.23);
  if(a.team==='civilian'&&!a.harmed){a.harmed=true;s.stats.civilianHarm++;radio(s,'RADIO','Civilian hurt. Check your fire.');}
  if((s.coop?s.humanIds.includes(source):source===s.playerId)&&a.team==='enemy')s.stats.hits++;
  if(a.hp<=0){
    a.downed=true;a.bleed=0;a.reviveProgress=0;a.path=[];
    if(a.team==='squad'){s.stats.squadDowns++;radio(s,a.name.toUpperCase(),`${a.name} down. Need help here.`);}
    else if(a.team==='enemy'){a.alive=false;a.deathTime=s.time;}
    else if(a.team==='civilian'){a.alive=false;}
  }
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
function updateBullets(s,dt){
  for(const b of s.bullets){
    b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.ttl-=dt;
    const origin={x:b.px,y:b.py},end={x:b.x,y:b.y};
    let hitTime=Infinity,hitActor=null;
    for(const wall of s.world.buildings)hitTime=Math.min(hitTime,segmentRectEntry(origin,end,wall));
    const targets=b.team==='enemy'?[...s.squad,...s.survivors]:[...s.enemies,...s.civilians];
    for(const a of targets){
      if(!a.alive||a.downed)continue;
      const t=segmentActorEntry(origin,end,a,a.radius+2);
      if(t<hitTime){hitTime=t;hitActor=a;}
    }
    if(Number.isFinite(hitTime)){
      b.x=origin.x+(end.x-origin.x)*hitTime;b.y=origin.y+(end.y-origin.y)*hitTime;b.ttl=0;
      if(hitActor)damage(s,hitActor,b.damage,b.owner);
      else{effect(s,'dust',b.x,b.y,.25);soundEvent(s,'impact',{id:b.owner,x:b.x,y:b.y,team:b.team},{weapon:b.weapon||(b.team==='enemy'?'hostile':'rifle'),material:'concrete'});}
    }
    for(const a of targets){
      if(a.alive&&!a.downed&&a.team==='squad'&&segmentActor(origin,b,a,43))a.suppression=Math.min(1,a.suppression+.1);
    }
  }s.bullets=s.bullets.filter(b=>b.ttl>0&&b.x>0&&b.y>0&&b.x<W&&b.y<H);
}
function revive(s,target,helper,dt){
  target.reviveProgress+=dt;if(target.reviveProgress>=4){target.downed=false;target.hp=Math.round(target.maxHp*.65);target.bleed=0;target.reviveProgress=0;target.suppression=0;radio(s,helper.name.toUpperCase(),`${target.name} is back up. Stay close.`);effect(s,'heal',target.x,target.y,1);}
}
function aiTarget(s){
  const p=phase(s),leader=currentLeader(s);
  if(!p)return{x:leader.x,y:leader.y};
  const down=[...s.squad,...s.survivors.filter(a=>a.stabilized)].find(a=>a.alive&&a.downed);
  if(down){describeLeader(s,`Helping ${down.name} · hold the squad together`);return{x:down.x,y:down.y};}
  if(s.waitUntil>s.time){describeLeader(s,`Holding for you · ${Math.ceil(s.waitUntil-s.time)} seconds`);return{x:leader.x,y:leader.y};}
  if(humans(s).some(a=>a.alive&&!a.downed&&distance(leader,a)>290)){describeLeader(s,'Waiting for you · regroup on Hale');return{x:leader.x,y:leader.y};}
  if(s.objective.kind==='barricade'){describeLeader(s,'Clearing the route · cover the convoy');return{x:s.objective.x,y:s.objective.y};}
  if(p.kind==='convoy'){const v=s.vehicles[0];describeLeader(s,v.waiting?'Regroup on the lead vehicle':'Accompanying the relief convoy');return{x:v.x,y:v.y};}
  if(p.kind==='rescue'){describeLeader(s,'Protect the medic · crew recovery in progress');return{x:s.objective.x,y:s.objective.y};}
  if(p.kind==='hold'&&distance(leader,p)<p.radius){describeLeader(s,'Hold this area · watch your squad');return{x:p.x,y:p.y};}
  describeLeader(s,`Moving · ${p.title}`);return{x:p.x,y:p.y};
}
function updateSquad(s,inputs,dt){
  const pl=player(s),leader=currentLeader(s),dest=s.role==='member'?aiTarget(s):null,anchorPlayer=s.coop?leader:pl;
  const casualties=[...s.squad,...s.survivors.filter(a=>a.stabilized)].filter(a=>a.alive&&a.downed),helper=s.squad.find(a=>a.role==='medic'&&a.alive&&!a.downed&&!controlled(s,a))||s.squad.find(a=>a.alive&&!a.downed&&!controlled(s,a));
  const aidTarget=s.squad.find(a=>a.id===s.helpTargetId&&a.alive&&!a.downed)||pl;
  for(const a of s.squad){
    if(!a.alive)continue;
    if(a.downed){a.bleed+=dt;if(a.bleed>85){a.alive=false;radio(s,'RADIO',`${a.name} could not be recovered in time.`);if(!s.coop&&a.id===s.playerId){s.status='lost';s.endReason='You could not be recovered. Retry the mission.';}}continue;}
    a.target=null;
    if(controlled(s,a)){
      const input=inputFor(s,a,inputs);
      let mx=finite(input.moveX),my=finite(input.moveY);const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;}
      a.moving=len>.05;const speed=(input.sprint?166:112)*(1-a.suppression*.22);move(s,a,mx*speed*dt,my*speed*dt);
      if(Number.isFinite(input.aimX)&&Number.isFinite(input.aimY)&&Math.hypot(input.aimX-a.x,input.aimY-a.y)>2)a.angle=Math.atan2(input.aimY-a.y,input.aimX-a.x);else if(len>.05&&!input.fire)a.angle=Math.atan2(my,mx);
      if(input.reload)tryReload(s,a);if(input.fire&&!input.sprint)shoot(s,a,a.angle,true);
      if(input.smoke&&a.smokes>0){a.smokes--;const aim={x:a.x+Math.cos(a.angle)*145,y:a.y+Math.sin(a.angle)*145},p=nearbyFree(s,aim.x,aim.y);s.smokes.push({...p,radius:105,ttl:14});effect(s,'smoke',p.x,p.y,1);soundEvent(s,'smoke',a,{x:p.x,y:p.y});radio(s,a.name.toUpperCase(),'Smoke out. Keep moving.');}
      if(input.interact){const down=casualties.filter(c=>distance(a,c)<70).sort((c,d)=>distance(a,c)-distance(a,d))[0];if(down){revive(s,down,a,dt);s.interactionPrompt=`Helping ${down.name} · ${Math.round(down.reviveProgress/4*100)}%`;}
        else if(a.hp<a.maxHp&&a.medkits>0&&s.objective?.kind!=='rescue'&&s.objective?.kind!=='barricade'){a.bandageProgress=(a.bandageProgress||0)+dt;if(a.bandageProgress>=3){a.medkits--;a.hp=Math.min(a.maxHp,a.hp+55);a.bandageProgress=0;effect(s,'heal',a.x,a.y,1);radio(s,a.name.toUpperCase(),'Bandaged. Ready to move.');}s.interactionPrompt=`Bandaging · ${Math.round(a.bandageProgress/3*100)}%`;}}
      else a.bandageProgress=0;
      continue;
    }
    let work=false;
    if(a===helper&&casualties.length){const wounded=casualties.sort((b,c)=>distance(a,b)-distance(a,c))[0];navigate(s,a,wounded,128,dt,40);if(distance(a,wounded)<65){revive(s,wounded,a,dt);work=true;}a.medicTarget=wounded.id;}
    else if(a.role==='medic'&&s.helpRequested&&aidTarget.alive&&!aidTarget.downed&&aidTarget.hp<aidTarget.maxHp&&a.medkits>0){navigate(s,a,aidTarget,128,dt,55);if(distance(a,aidTarget)<72){s.aidTimer+=dt;work=true;if(s.aidTimer>3){aidTarget.hp=Math.min(aidTarget.maxHp,aidTarget.hp+55);a.medkits--;s.helpRequested=false;s.helpTargetId=null;s.aidTimer=0;radio(s,'AMES','You are patched. Stay with us.');}}}
    else if(a.role==='medic'&&phase(s)?.kind==='rescue'&&humanNear(s,s.survivors[phase(s).crew],220)){const crew=s.survivors[phase(s).crew];navigate(s,a,crew,122,dt,42);work=distance(a,crew)<70;}
    else{
      let target;
      if(s.role==='member'&&a===leader)target=dest;
      else if(s.role==='member'){const idx=s.squad.indexOf(a),off=[[-42,48],[42,48],[-42,-42],[42,-42]][idx];target=nearbyFree(s,leader.x+off[0],leader.y+off[1]);}
      else if(s.order.type==='follow'){const idx=s.squad.indexOf(a),off=[[0,0],[-40,32],[40,32],[0,65]][idx],p=phase(s),anchor=p&&p.kind!=='convoy'&&distance(anchorPlayer,p)<p.radius+15?p:anchorPlayer;target=nearbyFree(s,anchor.x+off[0],anchor.y+off[1]);}
      else{const idx=s.squad.indexOf(a),off=[[-36,-35],[36,-35],[-36,35],[36,35]][idx];target=nearbyFree(s,s.order.x+off[0],s.order.y+off[1]);}
      navigate(s,a,target,116,dt,s.role==='member'&&a===leader?26:20);
    }
    const enemy=targetFor(s,a,s.enemies,s.missionIndex===2?350:440);a.target=enemy?.id||null;
    if(enemy){a.angle=Math.atan2(enemy.y-a.y,enemy.x-a.x);if(!work&&safeShot(s,a,enemy))shoot(s,a,a.angle);}
    if(a.ammo<=0)tryReload(s,a);
  }
  // Gentle separation prevents identical stacked silhouettes without blocking paths.
  const units=s.squad.filter(a=>a.alive&&!a.downed);
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){const a=units[i],b=units[j],d=distance(a,b);if(d>0&&d<25){const n=(25-d)*.45,dx=(a.x-b.x)/d*n,dy=(a.y-b.y)/d*n;if(!controlled(s,a))move(s,a,dx,dy);if(!controlled(s,b))move(s,b,-dx,-dy);}}
}
function updateEnemies(s,dt){
  for(const a of s.enemies){
    if(!a.alive)continue;const targets=aliveSquad(s),near=targets.reduce((best,t)=>!best||distance(a,t)<distance(a,best)?t:best,null);if(!near)continue;
    const d=distance(a,near);if(d<650)a.alert=true;if(!a.alert)continue;
    const target=targetFor(s,a,targets,s.missionIndex===2?370:450);a.target=target?.id||null;
    if(target){a.angle=Math.atan2(target.y-a.y,target.x-a.x);if(distance(a,target)>290)navigate(s,a,target,49,dt,270);else a.moving=false;shoot(s,a,a.angle);}
    else if(d<900)navigate(s,a,near,57,dt,230);
    if(a.ammo<=0)tryReload(s,a);
  }
  s.spawnTimer-=dt;
  if(s.spawnTimer<=0){s.spawnTimer=DIFFICULTIES[s.difficulty].spawnDelay;const live=s.enemies.filter(a=>a.alive).length;
    if(live<s.maxEnemies){const p=s.objective||player(s);for(let n=0;n<18;n++){const angle=range(s,0,TAU),r=range(s,470,680),dest=nearbyFree(s,p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r);
      if(aliveSquad(s).every(a=>distance(a,dest)>360&&(!hasLineOfSight(s,a,dest)||distance(a,dest)>550))){spawnEnemy(s,dest);break;}}}
  }
  s.enemies=s.enemies.filter(a=>a.alive||s.time-(a.deathTime||0)<16);
}
function updateCivilians(s,dt){
  for(const c of s.civilians){if(!c.alive)continue;const near=s.squad.some(a=>a.alive&&distance(a,c)<450);if(near&&s.time-(s.lastShot||-100)<3)c.panicked=10;c.panicked=Math.max(0,c.panicked-dt);
    if(c.panicked>0)navigate(s,c,c.shelter,105,dt,15);
    else if(distance(c,c.shelter)>20&&s.time>12)navigate(s,c,c.shelter,40,dt,15);
  }
  const lead=currentLeader(s);
  for(let i=0;i<s.survivors.length;i++){const c=s.survivors[i];if(c.alive&&c.stabilized&&!c.downed){const target=nearbyFree(s,lead.x-30+i*60,lead.y+74);navigate(s,c,target,119,dt,35);}}
}
function humanNear(s,p,range=p.radius){return humans(s).some(a=>a.alive&&!a.downed&&distance(a,p)<range);}
function allHumansNear(s,p,range=p.radius){
  const living=humans(s).filter(a=>a.alive);
  return living.length>0&&living.every(a=>!a.downed&&distance(a,p)<range);
}
function humanWorking(s,p,inputs,range=p.radius){return humans(s).some(a=>a.alive&&!a.downed&&distance(a,p)<range&&inputFor(s,a,inputs).interact);}
function squadIn(s,p){return aliveSquad(s).filter(a=>distance(a,p)<p.radius).length;}
function updateConvoy(s,inputs,dt){
  const v=s.vehicles[0],next=s.convoyRoute[s.convoyIndex+1];
  if(!next){advance(s);return;}
  const blocked=next.blocked&&!s.convoyCleared.includes(s.convoyIndex+1)&&distance(v,next)<110;
  if(blocked){
    v.waiting=true;const worker=currentLeader(s);
    const playerWorking=humanWorking(s,next,inputs,85);
    const leaderWorking=s.role==='member'&&distance(worker,next)<85&&worker.alive&&!worker.downed&&humanNear(s,next,260)&&s.waitUntil<=s.time;
    const canWork=playerWorking||leaderWorking;
    if(canWork){s.convoyClear+=dt;s.interactionPrompt=`Clearing obstruction · ${Math.round(s.convoyClear/6*100)}%`;}
    if(s.convoyClear>=6){s.convoyCleared.push(s.convoyIndex+1);s.convoyClear=0;const prop=s.world.props.find(p=>p.type==='barricade'&&distance(p,next)<10);if(prop)prop.cleared=true;radio(s,'HALE','Route is open. Keep up with the vehicles.');}
  }else{
    const close=aliveSquad(s).filter(a=>distance(a,v)<265).length>=2&&allHumansNear(s,v,310);
    v.waiting=!close;
    if(close){const dx=next.x-v.x,dy=next.y-v.y,d=Math.hypot(dx,dy),amount=Math.min(62*dt,d);v.angle=Math.atan2(dy,dx);v.x+=Math.cos(v.angle)*amount;v.y+=Math.sin(v.angle)*amount;if(d<8)s.convoyIndex++;}
  }
  for(let i=1;i<s.vehicles.length;i++){const a=s.vehicles[i],front=s.vehicles[i-1];if(distance(a,front)>113){const dx=front.x-a.x,dy=front.y-a.y;a.angle=Math.atan2(dy,dx);a.x+=Math.cos(a.angle)*62*dt;a.y+=Math.sin(a.angle)*62*dt;}}
  s.progress=s.convoyIndex/(s.convoyRoute.length-1);
}
function updateMission(s,inputs,dt){
  const p=phase(s);if(!p)return;
  if(p.kind==='convoy'){updateConvoy(s,inputs,dt);return;}
  let work=false;
  if(p.kind==='rally')work=allHumansNear(s,p)&&squadIn(s,p)>=Math.min(3,aliveSquad(s).length);
  if(p.kind==='hold'){
    work=squadIn(s,p)>=Math.min(2,aliveSquad(s).length)&&allHumansNear(s,p,p.radius+100);
    if(s.stageIndex===s.stages.length-1)work=work&&s.squad.filter(a=>a.alive).every(a=>!a.downed&&distance(a,p)<p.radius);
  }
  if(p.kind==='rescue'){
    const c=s.survivors[p.crew],medic=s.squad.find(a=>a.role==='medic'&&a.alive&&!a.downed&&!controlled(s,a));
    if(medic&&humanNear(s,c,220)&&distance(medic,c)<70)work=true;
    if(humanWorking(s,c,inputs,p.radius))work=true;
    if(work)s.interactionPrompt=`Stabilizing ${c.name} · ${Math.round(s.phaseTime/p.duration*100)}%`;
  }
  if(p.kind==='extract'){
    const alive=s.squad.filter(a=>a.alive),crew=s.survivors.filter(a=>a.alive);
    work=alive.every(a=>!a.downed&&distance(a,p)<p.radius)&&crew.every(a=>a.stabilized&&!a.downed&&distance(a,p)<p.radius);
  }
  if(work)s.phaseTime+=dt;
  s.progress=clamp(s.phaseTime/(p.duration||1),0,1);
  if(s.phaseTime>=p.duration){
    if(p.kind==='rescue'){const c=s.survivors[p.crew];c.downed=false;c.stabilized=true;c.hp=c.maxHp;radio(s,'AMES',`${c.name} can move. Keep them with us.`);}
    if(s.missionIndex===0&&s.stageIndex===1)radio(s,'RADIO','A helicopter is down. All chalks, stand by for new orders.');
    advance(s);
  }
}
function updateVisibility(s,dt){s.visibilityTimer-=dt;if(s.visibilityTimer>0)return;s.visibilityTimer=.12;const eyes=aliveSquad(s);for(const e of s.enemies)e.visible=eyes.some(a=>distance(a,e)<(s.missionIndex===2?390:540)&&combatLOS(s,a,e));}
export function step(s,input={},dt=1/60){
  return advanceSimulation(s,input,dt);
}
/** Step one shared world once, applying both players' latest inputs independently. */
export function stepCoop(s,inputsByActorId={},dt=1/60){
  if(!s.coop)setHumanPlayers(s,[s.playerId]);
  return advanceSimulation(s,inputsByActorId,dt);
}
function advanceSimulation(s,input,dt){
  if(s.status!=='playing')return s;dt=clamp(finite(dt),0,.05);if(!dt)return s;s.time+=dt;s.stats.elapsed=s.time;s.interactionPrompt='';
  if(s.coop)syncCoopControl(s);
  for(const a of [...s.squad,...s.enemies]){a.cooldown=Math.max(0,(a.cooldown||0)-dt);a.suppression=Math.max(0,(a.suppression||0)-dt*.22);if(a.reloadTimer>0){a.reloadTimer-=dt;if(a.reloadTimer<=0){const add=Math.min(a.magSize-a.ammo,a.reserve);a.ammo+=add;a.reserve-=add;a.reloadTimer=0;soundEvent(s,'reload_end',a);}}}
  updateSquad(s,input,dt);updateEnemies(s,dt);updateBullets(s,dt);updateCivilians(s,dt);
  if(!s.squad.some(a=>a.alive&&!a.downed)){s.status='lost';s.endReason='The entire chalk is down. Retry and keep the squad together.';}
  else if(s.coop&&s.squad.filter(a=>a.role==='leader'||a.role==='rifleman').every(a=>!a.alive)){s.status='lost';s.endReason='Neither player soldier could be recovered. Regroup and retry the mission.';}
  if(s.status==='playing')updateMission(s,input,dt);
  if(s.status==='playing')updateObjective(s);
  updateVisibility(s,dt);
  for(const e of s.effects)e.ttl-=dt;s.effects=s.effects.filter(e=>e.ttl>0);
  for(const smoke of s.smokes)smoke.ttl-=dt;s.smokes=s.smokes.filter(e=>e.ttl>0);
  s.soundEvents=s.soundEvents.filter(event=>s.time-event.time<=3);
  return s;
}
