/** Crosswind's ground war. One bounded encounter is stepped by the shared room,
 * while relief work and its rewards belong to the captain who actually does it. */
import { ensureSidearm, getPersonalWeapon, personalWeaponDamage, sidearmAim, clearSidearmSight } from './combat.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';

export const WARZONE_GROUND_SITE_ID='ashfall-front';
export const WARZONE_GROUND_KEY='crosswind-vey:site:ashfall-front';
export const WARZONE_GROUND_FACTIONS=Object.freeze(['freewake','meridian']);
export const WARZONE_GROUND_LIMIT=18;
const T=24,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const serial=v=>Math.floor(clamp(finite(v),0,1e9)),point=(x,y)=>({x:(x+.5)*T,y:(y+.5)*T}),range=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const faction=v=>WARZONE_GROUND_FACTIONS.includes(v)?v:null;
const colors={freewake:'#9eae93',meridian:'#97a6b7'},stripes={freewake:'#87b9a8',meridian:'#c4ae80'};
const lanes=[20,34,48],roles=['leader','medic','support','rifle','rifle','rifle'];
const PHASES=[
 {id:'crossfire',name:'Contested streets',duration:[32,52],text:'Both lines are holding. Rifle fire crosses the rail yards; the southern aid passage remains open.'},
 {id:'freewake-push',name:'Union advance',duration:[25,44],text:'Union squad leaders call an advance through the rail yards. Combine troops fall back between the loading bays.'},
 {id:'barrage',name:'Artillery exchange',duration:[19,32],text:'Incoming artillery. Red ground markers show impact zones. Leave the open streets and use the covered passages.'},
 {id:'meridian-push',name:'Combine counterattack',duration:[25,44],text:'Combine reserves enter the industrial lane. Union medics are dragging casualties behind the retaining walls.'},
 {id:'resupply',name:'Uneasy lull',duration:[16,30],text:'The firing slackens while both sides replace their losses. Stretchers move; the battle has not ended.'}
];
const choice=(id,name,x,y,text)=>({id,name,x,y,text,options:[]});
const site={
 id:WARZONE_GROUND_SITE_ID,name:'Ashfall Front',kind:'warzone',warzone:true,cols:96,rows:68,tileX:56,tileY:41,hostile:false,atmosphere:'ashfall',
 summary:'Three streets under continuous fire. A southern aid passage links the landing gate, clinic and civilian shelter.',
 story:'Vey’s freight district has become a front line. Union cloth strips and Combine pale-amber shoulder bars disappear into dust between the warehouses. Nobody here calls the next reinforcement a victory. The southern passage is sheltered: find Dr Elian, evacuation coordinator Asha and the missing-persons desk there. The rail yard, central works and tram street are active combat lanes. Neither army deliberately targets an unaligned captain until that captain opens fire; stray shots and artillery still hurt.',
 records:[
  {id:'district-map',name:'Evacuation route and front map',x:10,y:61,text:'WEST: Union approach. EAST: Combine approach. Three parallel fronts cross the RAIL YARD (north), CENTRAL WORKS and TRAM STREET (south). Gaps at the east and west loading roads connect them. SOUTHERN AID PASSAGE: landing gate → clinic → service underpass → apartment shelter. This covered passage is outside the scheduled artillery grid. A red expanding ground marker warns of an incoming shell. Do not treat a lull as a ceasefire.'},
  {id:'ward-log',name:'Clinic casualty board',x:16,y:57,text:'The admission columns say civilian, Union and Combine. The discharge column only says alive. A nurse has washed the last clean blanket three times. Beneath the next-of-kin list: no photographs of patients, and no weapons fired in the ward.'},
  {id:'school-wall',name:'School wall',x:61,y:42,text:'A child’s height marks remain on the one wall still standing. Someone has moved the class register into the shelter. The date of the last lesson is weeks old; the date of the next evacuation has been erased twice.'}
 ],
 choices:[
  choice('hospital','Dr Elian · emergency power',20,60,'Dr Elian is keeping the ward open with a failing generator.'),
  choice('depot','Tram depot · sealed regulator',25,45,'A replacement regulator is bolted into the tram depot’s emergency cabinet.'),
  choice('generator','Clinic generator · power allocation',25,56,'There is enough replacement capacity for one urgent circuit.'),
  choice('evacuation','Asha · civilian evacuation',13,63,'Asha has a transport space for three tenants trapped at the eastern shelter.'),
  choice('shelter','Apartment shelter · waiting tenants',80,58,'Three tenants are waiting for someone who can walk them to the clinic.'),
  choice('names','Nera · missing-persons desk',22,63,'Nera is trying to replace the word missing with something a family can use.'),
  choice('registry','School registry · damaged records',59,41,'The sealed school register lies under a collapsed noticeboard.'),
  choice('tags','Rail aid post · recovered identity tags',41,17,'The abandoned rail aid post holds two identification packets and a medic’s account.')
 ],
 residents:[
  {id:'elian',name:'Dr Elian',role:'medic',roleLabel:'Civilian trauma surgeon',x:19,y:60,color:'#b4c3b6',text:'Use my emergency-power desk beside me. I need a regulator from the tram depot, not another account of who fired first.',data:{fixedPost:true,warzoneResident:'elian',socialOnly:true}},
  {id:'asha',name:'Asha Ren',role:'courier',roleLabel:'Evacuation coordinator',x:12,y:63,color:'#c2ad8a',text:'The evacuation desk has the exact route. Stay close to the tenants when you bring them back. A sprinting escort is just another person leaving.',data:{fixedPost:true,warzoneResident:'asha',socialOnly:true}},
  {id:'nera',name:'Nera Pell',role:'settler',roleLabel:'Missing-persons recorder',x:21,y:63,color:'#b6a9b8',text:'Use the records desk. I need the school register and the rail-post identification packets together before I can give anyone an answer.',data:{fixedPost:true,warzoneResident:'nera',socialOnly:true}},
  ...['Siv','Oren','Mara'].map((name,i)=>({id:'tenant-'+i,name,role:'settler',roleLabel:i?'Displaced tenant':'Tenant representative',x:78+i*2,y:60,color:['#a7bba6','#bba994','#9baeb7'][i],text:i?'We are ready. Please keep us together.':'Speak at the shelter sign to escort us. We can walk; we cannot cross the gunfire alone.',data:{fixedPost:true,warzoneResident:'tenant',tenantIndex:i,socialOnly:true}})),
  ...[0,1,2].map(i=>({id:'wounded-'+i,name:['Wounded tram worker','Wounded Union private','Wounded Combine sapper'][i],role:'settler',roleLabel:'Clinic patient',x:12+i*3,y:58,color:['#aa9987',colors.freewake,colors.meridian][i],text:['My sister thinks I am still at the depot. Tell the desk I am here.','They brought me in beside the person who shot me. The doctor treated him first. He was bleeding faster.','Please turn my radio off. They keep calling our section.'][i],data:{fixedPost:true,warzoneResident:'patient',patientIndex:i,socialOnly:true}}))
 ]
};
const refugeSite={
 id:'thawline-reception',name:'Thawline Refuge Reception',kind:'clinic',crosswindSupport:'refuge',tileX:55,tileY:42,cols:44,rows:32,atmosphere:'clinic',
 summary:'A heated reception hall for people arriving from Vey. The board keeps individual names, not a victory count.',
 story:'The outer airlock opens onto disinfectant, damp coats and soup. One reception clerk checks shuttle manifests while another leaves people asleep. Relief boats arriving from Vey are expected here regardless of the uniforms that brought them.',
 choices:[choice('refuge-arrivals','Thawline arrivals board',12,8,'Read the verified arrivals and the hall’s current heating allocation.')],
 records:[{id:'refuge-policy',name:'A reception rule',x:32,y:16,text:'No faction queues. No recruitment beside a bed. Do not publish a passenger’s destination without asking them. The empty spaces on the arrivals board are people still expected, not people presumed dead.'}],
 residents:[
  {id:'refuge-clerk',name:'Tavi Esher',role:'settler',roleLabel:'Refuge reception clerk',x:11,y:8,color:'#aabdae',text:'Vey’s escorts end at a real reception desk. The arrivals board beside me records who reached us.',data:{fixedPost:true,crosswindResident:'reception',socialOnly:true}},
  ...['Siv','Oren','Mara'].map((name,i)=>({id:'returned-tenant-'+i,name,role:'settler',roleLabel:'Evacuated Vey tenant',x:10+i*4,y:24,color:['#a7bba6','#bba994','#9baeb7'][i],text:['The first night I kept counting the beds. Now I count the people at breakfast. All three of us made it.','I kept the empty carrier. Our neighbour found the cat before the next transport; she is bringing him here.','Asha’s list got us seats. You staying close got us to Asha. I remember the difference.'][i],data:{fixedPost:true,crosswindResident:'rescued-tenant',tenantIndex:i,socialOnly:true}})),
  {id:'heating-worker',name:'Bren Lo',role:'mechanic',roleLabel:'Hall maintenance worker',x:35,y:25,color:'#b3ad93',text:'We are heating one sleeping bay at a time. Lorn has a spare cell shipment, but its dispatcher has another urgent civilian claim on it.',data:{fixedPost:true,crosswindResident:'heating',socialOnly:true}}
 ]
};
const dispatchSite={
 id:'fuel-dispatch',name:'Cistern Nine Dispatch',kind:'pump',crosswindSupport:'dispatch',tileX:55,tileY:42,cols:36,rows:28,atmosphere:'machinery',
 summary:'Civilian dispatchers choose which essential loads move while the fleets consume most of Lorn’s fuel.',
 story:'The pumps still run, but each convoy departure is written in pencil. The civilian dispatcher has one unassigned power-cell shipment: refuge heating on Orsa needs it, and a stranded cooperative hauler needs it to get six driver families back to work. The military requisition line already takes the rest.',
 choices:[choice('fuel-dispatch','Civilian priority ledger',17,9,'Assign the one uncommitted cell shipment. The destination will remain on the ledger.')],
 records:[{id:'requisition',name:'Three columns of fuel',x:12,y:19,text:'FLEET REQUISITION: protected quota. CIVILIAN HEAT: minimum supply. INDEPENDENT HAULERS: postponed. Beside the last two columns are six household addresses and the capacity of a crowded Orsa refuge. The dispatcher has refused to erase either list.'}],
 residents:[
  {id:'dispatcher',name:'Edda Kest',role:'broker',roleLabel:'Civilian fuel dispatcher',x:16,y:9,color:'#bcae8f',text:'Use the priority ledger. I can release one shipment to either civilian claim. I cannot promise both, and I will not hide which one waited.',data:{fixedPost:true,crosswindResident:'dispatcher',socialOnly:true}},
  {id:'driver',name:'Rafi Senn',role:'courier',roleLabel:'Cooperative hauler driver',x:10,y:18,color:'#a9b5a1',text:'Six families work our hauler. I understand why the refuge needs heat. It does not make our empty pay packets disappear.',data:{fixedPost:true,crosswindResident:'driver',socialOnly:true}}
 ]
};
export function warzoneGroundSites(body){return({'crosswind-vey':[site],'crosswind-orsa':[refugeSite],'crosswind-lorn':[dispatchSite]})[body?.id||body]||[];}

/** An authored street network: every block has a route around it, and all three
 * lanes connect at the loading roads and central service spine. */
export function buildWarzoneGroundInterior(m,_site,{rect,prop,label,point:pt,TILE}){
 m.warzone=true;m.palette={ground:'#42454a',ground2:'#494a4d',floor:'#4c4e4d',floor2:'#454847',edge:'#737b76',wall:'#2e3439',wallTop:'#777c77',path:'#61625c',water:'#293b44',light:'#c5c5aa',accent:'#b1b8a1'};
 rect(m,3,3,90,62,TILE.FLOOR);
 for(const y of lanes)rect(m,4,y-3,88,7,TILE.PATH);
 for(const x of[6,30,47,69,89])rect(m,x-2,4,5,59,TILE.PATH);
 // Ruined blocks create cover without closing the streets into isolated rooms.
 for(const[x,y,w,h]of[[8,6,15,9],[31,6,12,9],[53,6,12,9],[75,6,14,9],[10,25,15,5],[33,25,10,5],[54,25,12,5],[76,25,13,5],[10,39,14,5],[33,39,10,5],[53,39,12,5],[76,39,13,5]]){
  rect(m,x,y,w,h,TILE.WALL);rect(m,x+1,y+1,w-2,h-2,TILE.RUBBLE);rect(m,x+Math.floor(w/2),y+h-1,2,1,TILE.FLOOR);rect(m,x,y+2,1,2,TILE.FLOOR);
  prop(m,'debris',x+2,y+1,w-4,1,'#777567',false);prop(m,'window',x+2,y-1,4,1,'#4d5a61',false);
 }
 // Cover islands are staggered along each lane: several routes remain open.
 for(const y of lanes)for(const[x,dy]of[[17,-2],[29,1],[39,-2],[56,1],[67,-2],[81,1]])prop(m,'cargo',x,y+dy,2,1,'#737c72',true);
 for(const[x,y]of[[27,12],[46,28],[70,42]]){prop(m,'cargo',x,y,3,2,'#494b4c',true);prop(m,'debris',x-1,y+2,5,1,'#7b7061',false);}
 // A heavy retaining wall screens a continuous southern aid passage. Openings
 // into the fighting are deliberate, wide and marked, never required to leave.
 rect(m,5,53,24,1,TILE.WALL);rect(m,34,53,35,1,TILE.WALL);rect(m,74,53,16,1,TILE.WALL);
 rect(m,4,54,87,11,TILE.FLOOR);rect(m,4,61,87,3,TILE.PATH);
 for(const x of[11,14,17])prop(m,'bed',x,57,1,2,'#a6aea1',true);
 prop(m,'console',24,55,3,1,'#8c9e93',true);prop(m,'table',18,59,2,1,'#8f8571',true);prop(m,'books',22,62,1,1,'#b4b1a0',false);
 prop(m,'awning',9,55,18,1,'#a1b4a3',false);prop(m,'banner',9,55,1,3,'#c6d0b9',false);
 for(const x of[76,80,84])prop(m,'bed',x,55,2,2,'#969a8b',true);
 prop(m,'table',81,62,4,1,'#9b8f7c',true);prop(m,'bowls',81,62,4,1,'#c3bca6',false);
 prop(m,'fence',35,57,31,.3,'#78877c',false);prop(m,'floorarrows',37,61,5,1,'#b3c6a6',false);
 for(let i=0;i<8;i++){prop(m,'debris',38+i*3,8+(i%3),1,1,'#817765',false);prop(m,'bones',70+i%3,15+Math.floor(i/3),1,1,'#96917f',false);}
 for(const[x,y,c]of[[8,19,stripes.freewake],[8,33,stripes.freewake],[8,47,stripes.freewake],[87,19,stripes.meridian],[87,33,stripes.meridian],[87,47,stripes.meridian]])prop(m,'banner',x,y,2,.4,c,false);
 m.spawn=pt(7,61);m.exit=pt(5,61);
 label(m,'LANDING GATE ←',5,64,'#c9d4b7');label(m,'NEUTRAL CLINIC',11,55,'#b9cfbd');label(m,'COVERED AID PASSAGE',36,60,'#c0c9b0');label(m,'APARTMENT SHELTER',75,54,'#c9c1a3');
 label(m,'RAIL YARD',43,18,'#c8bca3');label(m,'CENTRAL WORKS',42,32,'#c8bca3');label(m,'TRAM STREET',43,46,'#c8bca3');label(m,'DEPOT',24,44,'#c0b99d');label(m,'SCHOOL RECORDS',55,40,'#c4baa4');
 m.warzoneFires=[[19,8],[35,27],[61,8],[79,40],[46,28],[70,42]].map(([x,y])=>pt(x,y));
 m.warzoneMemorial=pt(29,62);
}

function rng(w){w.rng=(Math.imul(w.rng,1664525)+1013904223)>>>0;return w.rng/4294967296;}
const roll=(w,a,b)=>a+rng(w)*(b-a);
function unitTemplate(key,side,slot,generation=0){
 const role=roles[slot%6],squad=Math.floor(slot/6),west=side==='freewake',hp=role==='support'?88:role==='leader'?80:64;
 return{id:`${key}:infantry:${side}:${slot}:${generation}`,slot,generation,factionId:side,squadId:`${side}:${squad}`,lane:squad,role,name:`${west?'Union':'Combine'} ${['Rail','Works','Tram'][squad]} ${role==='rifle'?'rifleman':role}`,
  species:'human',warzoneUnit:true,team:side,hostile:false,...point((west?35:60)+(slot%3-1)*2,lanes[squad]+(slot%2?1:-1)),health:hp,maxHealth:hp,armor:role==='support'?8:4,damage:role==='support'?14:10,speed:role==='support'?43:53,range:240,sightRange:330,radius:6,hitRadius:9,color:colors[side],stripeColor:stripes[side],attackKind:'ranged',weapon:'field-carbine',ownedWeapons:['pulse-sidearm','field-carbine'],status:'alive',facing:west?'right':'left',weaponDrawn:true,cooldown:.7+(slot%6)*.2,windup:0,aimAngle:west?0:Math.PI,targetId:null,alert:true,moving:false,healCooldown:0};
}
const restoredPoint=(raw,fallback)=>({x:clamp(finite(raw?.x,fallback.x),3*T,92*T),y:clamp(finite(raw?.y,fallback.y),3*T,65*T)});
/** Slot IDs, profiles and counts are authored; save data restores outcomes only. */
export function createWarzoneGroundState(site,saved={}){
 const prior=saved&&typeof saved==='object'?saved:{},raw=prior.warzoneGround||{},time=clamp(finite(prior.time),0,1e12),valid=raw.version===1;
 const phase=PHASES.some(p=>p.id===raw.phase)?raw.phase:'crossfire';
 const w={version:1,rng:Math.floor(clamp(finite(raw.rng,0x97fa321),0,4294967295))>>>0,phase,phaseUntil:clamp(finite(raw.phaseUntil,time+38),time,time+60),cycle:serial(raw.cycle),lastSoloAt:typeof raw.lastSoloAt==='number'?clamp(finite(raw.lastSoloAt),0,1e12):null,lastActiveAt:clamp(finite(raw.lastActiveAt),0,8e15),decisionAt:time,fronts:Array.from({length:3},(_,i)=>clamp(finite(raw.fronts?.[i],48),35,61)),nextWave:{},waves:{},casualties:{},nextShell:clamp(finite(raw.nextShell,time+9),time,time+20),shells:[],scars:[],radio:PHASES.find(p=>p.id===phase).text};
 for(const side of WARZONE_GROUND_FACTIONS){w.nextWave[side]=clamp(finite(raw.nextWave?.[side],time+15+(side==='meridian'?6:0)),time,time+50);w.waves[side]=serial(raw.waves?.[side]);w.casualties[side]=serial(raw.casualties?.[side]);}
 w.shells=(Array.isArray(raw.shells)?raw.shells:[]).slice(-6).filter(s=>finite(s.until)<=time+4&&finite(s.until)>time).map((s,i)=>({id:`${site.key}:shell:restored:${i}`, ...restoredPoint(s,point(48,34)),radius:clamp(finite(s.radius,48),32,66),impactAt:clamp(finite(s.impactAt),time-2,time+2.2),until:clamp(finite(s.until),time,time+4),impacted:s.impacted===true}));
 w.scars=(Array.isArray(raw.scars)?raw.scars:[]).slice(-32).map(s=>({...restoredPoint(s,point(48,34)),type:s.type==='casualty'?'casualty':'crater',factionId:faction(s.factionId),at:clamp(finite(s.at),0,time)}));
 const monsters=WARZONE_GROUND_FACTIONS.flatMap(side=>Array.from({length:WARZONE_GROUND_LIMIT},(_,slot)=>{
  const old=valid&&(Array.isArray(prior.monsters)?prior.monsters:[]).find(u=>u?.factionId===side&&u.slot===slot),base=unitTemplate(site.key,side,slot,serial(old?.generation)),health=clamp(finite(old?.health,base.maxHealth),0,base.maxHealth);
  return{...base,...restoredPoint(old,base),health,status:health>0?'alive':'dead',cooldown:clamp(finite(old?.cooldown,base.cooldown),0,4),healCooldown:clamp(finite(old?.healCooldown),0,3),lastHitBy:typeof old?.lastHitBy==='string'?old.lastHitBy.slice(0,90):null};
 }));
 return{id:site.key,siteId:site.id,warzone:true,warzoneGround:w,time,visited:serial(prior.visited),shotSerial:serial(prior.shotSerial),monsters,collected:[],choices:{},actorCooldowns:{},cleared:false};
}
function allegiance(value={}){return typeof value==='string'?{factionId:faction(value),hostileFactions:[]}:{factionId:faction(value?.factionId||value?.side),hostileFactions:(value?.hostileFactions||[]).filter(faction)};}
export function warzoneGroundHostiles(encounter,viewer={}){const a=allegiance(viewer);return(encounter?.monsters||[]).filter(u=>u.health>0&&faction(u.factionId)&&(a.hostileFactions.includes(u.factionId)||!!a.factionId&&u.factionId!==a.factionId));}
export function warzoneGroundView(encounter,viewer={}){
 if(!encounter?.warzoneGround)return encounter;
 const a=allegiance(viewer),hostiles=new Set(warzoneGroundHostiles(encounter,a).map(u=>u.id)),w=encounter.warzoneGround;
 const publicWar={version:1,phase:w.phase,cycle:w.cycle,fronts:[...w.fronts],waves:{...w.waves},casualties:{...w.casualties},radio:w.radio,shells:w.shells.map(s=>({...s})),scars:w.scars.map(s=>({...s}))};
 return{...encounter,warzoneGround:publicWar,actorCooldowns:{},monsters:encounter.monsters.map(u=>({...u,team:hostiles.has(u.id)?'hostile':u.factionId===a.factionId?'ally':'neutral',hostile:hostiles.has(u.id)})),groundStatus:{phase:PHASES.find(p=>p.id===encounter.warzoneGround.phase)?.name||'Contested streets',radio:encounter.warzoneGround.radio,freewake:encounter.monsters.filter(u=>u.factionId==='freewake'&&u.health>0).length,meridian:encounter.monsters.filter(u=>u.factionId==='meridian'&&u.health>0).length,casualties:{...encounter.warzoneGround.casualties}}};
}

// Flow fields are shared by a small number of lane goals. They never enter a
// save/snapshot, and the 72-entry limit also bounds moving escort destinations.
const fields=new WeakMap();
function flow(layout,goal){
 const gx=clamp(Math.floor(goal.x/T),0,layout.cols-1),gy=clamp(Math.floor(goal.y/T),0,layout.rows-1),key=gy*layout.cols+gx;let cache=fields.get(layout);if(!cache){cache=new Map();fields.set(layout,cache);}if(cache.has(key))return cache.get(key);
 const n=layout.cols*layout.rows,dist=new Int16Array(n);dist.fill(-1);const queue=new Int32Array(n);let head=0,tail=0,start=key;
 if(!layout.walkable[start]){let best=Infinity;for(let i=0;i<n;i++)if(layout.walkable[i]){const d=Math.abs(i%layout.cols-gx)+Math.abs(Math.floor(i/layout.cols)-gy);if(d<best){start=i;best=d;}}}
 dist[start]=0;queue[tail++]=start;
 while(head<tail){const i=queue[head++],x=i%layout.cols;for(const next of[i-layout.cols,i+layout.cols,...(x>0?[i-1]:[]),...(x<layout.cols-1?[i+1]:[])])if(next>=0&&next<n&&layout.walkable[next]&&dist[next]<0){dist[next]=dist[i]+1;queue[tail++]=next;}}
 cache.set(key,dist);while(cache.size>72)cache.delete(cache.keys().next().value);return dist;
}
function walk(unit,goal,dt,layout,speed=unit.speed){
 const dist=flow(layout,goal),cx=Math.floor(unit.x/T),cy=Math.floor(unit.y/T),idx=cy*layout.cols+cx;let best=idx;
 if(dist[idx]!==0)for(const [dx,dy]of[[0,-1],[0,1],[-1,0],[1,0]]){const x=cx+dx,y=cy+dy,i=y*layout.cols+x;if(x>=0&&y>=0&&x<layout.cols&&y<layout.rows&&dist[i]>=0&&(dist[best]<0||dist[i]<dist[best]))best=i;}
 const dest=best===idx&&dist[idx]===0?goal:point(best%layout.cols,Math.floor(best/layout.cols)),dx=dest.x-unit.x,dy=dest.y-unit.y,len=Math.hypot(dx,dy),step=Math.min(len,speed*dt),ox=unit.x,oy=unit.y;
 if(len>.1){const nx=unit.x+dx/len*step,ny=unit.y+dy/len*step;if(isCabinWalkable(layout,nx,unit.y,6))unit.x=nx;if(isCabinWalkable(layout,unit.x,ny,6))unit.y=ny;unit.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';}
 unit.moving=Math.hypot(unit.x-ox,unit.y-oy)>.1;unit.walkTime=(unit.walkTime||0)+(unit.moving?dt:0);
}
function scar(w,entry){w.scars.push(entry);if(w.scars.length>32)w.scars.splice(0,w.scars.length-32);}
function hitUnit(state,unit,damage,attackerId,at,event,shot={}){
 if(unit.health<=0)return;unit.health=Math.max(0,unit.health-damage);unit.hitUntil=at+.24;unit.lastHitBy=attackerId;event('person-hit',{...shot,id:(shot.id||`${state.id}:hit:${++state.shotSerial}`)+':hit',attackerId,targetId:unit.id,targetName:unit.name,x:unit.x,y:unit.y,health:unit.health,maxHealth:unit.maxHealth,damage});
 if(unit.health<=0){unit.status='dead';unit.moving=false;unit.windup=0;unit.targetId=null;state.warzoneGround.casualties[unit.factionId]=Math.min(1e9,state.warzoneGround.casualties[unit.factionId]+1);scar(state.warzoneGround,{x:unit.x,y:unit.y,type:'casualty',factionId:unit.factionId,at});event('boarder-down',{...shot,id:(shot.id||`${state.id}:down:${++state.shotSerial}`)+':down',attackerId,targetId:unit.id,actorId:unit.id,x:unit.x,y:unit.y,text:`${unit.name} fell in the street.`});}
}
function hitCaptain(state,actor,damage,at,event,shot){if(actor.person.health<=0)return;const p=actor.person;p.health=Math.max(0,p.health-damage);p.hitUntil=at+.24;event('person-hit',{...shot,id:shot.id+':hit',targetId:actor.id,targetName:actor.name||'Captain',x:p.x,y:p.y,damage,health:p.health,maxHealth:p.maxHealth||100});if(p.health<=0){p.down=true;event('person-down',{...shot,id:shot.id+':down',targetId:actor.id,text:`${actor.name||'A captain'} is down. A field rescue team is responding.`});}}
function nextPhase(state,event){
 const w=state.warzoneGround,index=PHASES.findIndex(p=>p.id===w.phase),next=(index+1+(rng(w)<.18?1:0))%PHASES.length,p=PHASES[next];w.phase=p.id;w.phaseUntil=state.time+roll(w,...p.duration);w.cycle++;w.radio=p.text;event('warzone-ground-phase',{phase:p.id,text:p.text});
 for(let i=0;i<3;i++)w.fronts[i]=clamp(w.fronts[i]+(p.id==='freewake-push'?3:p.id==='meridian-push'?-3:roll(w,-2,2)),38,58);
}
function reinforce(state,side,event){
 const w=state.warzoneGround,dead=state.monsters.filter(u=>u.factionId===side&&u.health<=0),count=Math.min(dead.length,w.phase==='resupply'?6:3+Math.floor(rng(w)*4));
 for(const old of dead.slice(0,count)){const fresh=unitTemplate(state.id,side,old.slot,Math.min(1e9,old.generation+1));Object.assign(fresh,point(side==='freewake'?9+old.slot%3*2:91-old.slot%3*2,lanes[old.lane]+(old.slot%2?1:-1)));Object.assign(old,fresh);}
 w.nextWave[side]=state.time+roll(w,w.phase==='resupply'?13:19,w.phase==='resupply'?25:43);if(!count)return;w.waves[side]++;w.radio=`${side==='freewake'?'Union':'Combine'} relief squad: ${count} soldiers reached the ${['rail','works','tram'][dead[0].lane]} approach. Casualties are being carried behind the line.`;event('warzone-ground-reinforcements',{factionId:side,count,text:w.radio});
}
function tacticalTargets(state,actors,layout){
 const alive=state.monsters.filter(u=>u.health>0),counts=new Map(),leaders=new Map(alive.filter(u=>u.role==='leader').map(u=>[u.squadId,u]));
 for(const unit of alive){
  const leader=leaders.get(unit.squadId);unit.leaderId=leader?.id||null;unit.squadOrder=state.warzoneGround.phase==='resupply'?'hold':state.warzoneGround.phase===unit.factionId+'-push'?'advance':'cover';
  unit.healTargetId=null;
  if(unit.role==='medic'){const wounded=alive.filter(u=>u.factionId===unit.factionId&&u.id!==unit.id&&u.health<u.maxHealth-9&&range(unit,u)<180).sort((a,b)=>((a.squadId===unit.squadId?0:1)-(b.squadId===unit.squadId?0:1))||(a.health/a.maxHealth-b.health/b.maxHealth)||range(unit,a)-range(unit,b))[0];if(wounded){unit.healTargetId=wounded.id;unit.targetId=null;continue;}}
  let target=alive.filter(u=>u.factionId!==unit.factionId&&range(unit,u)<unit.sightRange&&clearSidearmSight(layout,unit,u)).sort((a,b)=>(range(unit,a)-(a.id===leader?.targetId?45:0))-(range(unit,b)-(b.id===leader?.targetId?45:0)))[0]||null;
  const candidates=actors.filter(a=>a.person.health>0&&(a.hostileFactions?.includes(unit.factionId)||a.factionId&&a.factionId!==unit.factionId)&&(counts.get(a.id)||0)<2&&range(unit,a.person)<240&&clearSidearmSight(layout,unit,a.person)).sort((a,b)=>range(unit,a.person)-range(unit,b.person));
  const actor=candidates[0];if(actor&&(!target||range(unit,actor.person)<range(unit,target)*.72)&&rng(state.warzoneGround)<.45){target={id:actor.id,...actor.person};counts.set(actor.id,(counts.get(actor.id)||0)+1);}
  unit.targetId=target?.id||null;
 }
}
function fireInfantry(state,unit,actors,layout,event){
 const w=state.warzoneGround,angle=unit.aimAngle,dx=Math.cos(angle),dy=Math.sin(angle),candidates=[...state.monsters.filter(u=>u.health>0&&u.factionId!==unit.factionId),...actors.filter(a=>a.person.health>0).map(a=>({...a.person,id:a.id,captain:a}))];
 // Lock the firing direction at the start of the tell. Neutral captains can be
 // caught by a line aimed at a soldier; they are never acquired as targets.
 const aim=sidearmAim(unit,candidates,{aiming:true,aimX:dx,aimY:dy},layout),target=aim.target,at=state.time,id=`${state.id}:shot:${++state.shotSerial}`,damage=target?.captain?unit.role==='support'?6:4:unit.damage;
 const shot={id,team:unit.factionId,attackerId:unit.id,actorName:unit.name,factionId:unit.factionId,weaponId:'field-carbine',angle,from:{...aim.from},to:{...aim.to},x:unit.x,y:unit.y,targetX:aim.to.x,targetY:aim.to.y,targetId:target?.id||null,targetName:target?.name||null,hit:!!target,blocked:aim.blocked,damage:target?damage:0,until:at+.22};unit.lastShot=shot;event('person-shot',shot);
 if(target?.captain)hitCaptain(state,target.captain,damage,at,event,shot);else if(target)hitUnit(state,target,damage,unit.id,at,event,shot);
 unit.cooldown=roll(w,unit.role==='support'?1.1:1.8,unit.role==='support'?1.9:3);unit.windup=0;
}
function shells(state,actors,layout,event){
 const w=state.warzoneGround,at=state.time;
 if(at>=w.nextShell){w.nextShell=at+roll(w,w.phase==='barrage'?2.8:8,w.phase==='barrage'?5:16);if(w.phase!=='resupply'){
  const lane=Math.floor(rng(w)*3),pos=point(w.fronts[lane]+roll(w,-10,10),lanes[lane]+roll(w,-2,2));if(isCabinWalkable(layout,pos.x,pos.y,1)){const s={...pos,id:`${state.id}:shell:${++state.shotSerial}`,radius:roll(w,42,60),impactAt:at+1.8,until:at+3.2,impacted:false};w.shells.push(s);event('warzone-ground-incoming',{id:s.id,x:s.x,y:s.y,radius:s.radius,impactAt:s.impactAt,text:'Incoming shell — leave the marked impact zone.'});}
 }}
 for(const s of w.shells)if(!s.impacted&&at>=s.impactAt){s.impacted=true;scar(w,{x:s.x,y:s.y,type:'crater',at});const shot={id:s.id,team:'environment',weaponId:'artillery',attackerId:'artillery',actorName:'Artillery',x:s.x,y:s.y,to:{x:s.x,y:s.y}};event('warzone-ground-impact',{...shot,radius:s.radius});for(const unit of state.monsters)if(unit.health>0&&range(s,unit)<s.radius&&clearSidearmSight(layout,s,unit))hitUnit(state,unit,44,'artillery',at,event,shot);for(const actor of actors)if(range(s,actor.person)<s.radius&&clearSidearmSight(layout,s,actor.person))hitCaptain(state,actor,26,at,event,shot);}
 w.shells=w.shells.filter(s=>s.until>at).slice(-6);
}
export function stepWarzoneGround(state,participants,delta,surface){
 const dt=clamp(finite(delta),0,.25),layout=surface?.combatLayout,w=state?.warzoneGround;if(!dt||!layout||!w)return[];
 const actors=participants.filter(a=>a?.person&&a.person.health>0&&!a.person.down),events=[];state.time+=dt;const at=state.time,event=(type,details)=>events.push({type,siteId:state.id,at,...details});
 if(at>=w.phaseUntil)nextPhase(state,event);for(const side of WARZONE_GROUND_FACTIONS)if(at>=w.nextWave[side])reinforce(state,side,event);
 for(const id of Object.keys(state.actorCooldowns))if(!actors.some(a=>String(a.id||'local')===id))delete state.actorCooldowns[id];
 for(const actor of actors){
  const person=ensureSidearm(actor.person),id=String(actor.id||'local'),input=actor.input||{};state.actorCooldowns[id]=Math.max(0,finite(state.actorCooldowns[id])-dt);
  const hostile=warzoneGroundHostiles(state,actor),manual=!!input.aiming&&Math.hypot(finite(input.aimX),finite(input.aimY))>.05;
  const targets=manual?state.monsters.filter(u=>u.health>0&&(u.factionId!==actor.factionId||actor.hostileFactions?.includes(u.factionId))):hostile;
  const aim=sidearmAim(person,targets,input,layout);person.weaponDrawn=!!(input.fire||manual||hostile.some(u=>range(person,u)<300));person.aimAngle=aim.angle;person.aimTargetId=aim.targetId;person.aimManual=aim.manual;
  if(!input.fire||state.actorCooldowns[id]>0)continue;
  const weapon=getPersonalWeapon(person),target=aim.target,cooldown=weapon.cooldown*clamp(finite(actor.sidearmCooldownMultiplier,1),.5,2),damage=target?personalWeaponDamage(person,target,clamp(finite(actor.damageMultiplier,1),.4,2)):0;
  state.actorCooldowns[id]=cooldown;person.weaponReadyAt=at+cooldown;person.attackUntil=at+weapon.shotDuration;
  const shot={id:`${state.id}:shot:${++state.shotSerial}`,team:'player',attackerId:id,actorName:actor.name||'Captain',weaponId:weapon.id,angle:aim.angle,from:{...aim.from},to:{...aim.to},x:aim.from.x,y:aim.from.y,targetX:aim.to.x,targetY:aim.to.y,targetId:target?.id||null,targetName:target?.name||null,hit:!!target,blocked:aim.blocked,damage,until:at+weapon.shotDuration};person.lastShot=shot;event('person-shot',shot);
  if(target){if(!actor.hostileFactions?.includes(target.factionId)){actor.hostileFactions=[...(actor.hostileFactions||[]),target.factionId];actor.onWarzoneAggression?.(target.factionId,{source:'ground',ground:true,targetId:target.id});}hitUnit(state,target,damage,id,at,event,shot);}
 }
 if(at>=w.decisionAt){tacticalTargets(state,actors,layout);w.decisionAt=at+.25;}
 for(const unit of state.monsters){
  if(unit.health<=0){unit.moving=false;continue;}if(!isCabinWalkable(layout,unit.x,unit.y,6))Object.assign(unit,point(unit.factionId==='freewake'?9+unit.slot%3*2:91-unit.slot%3*2,lanes[unit.lane]+(unit.slot%2?1:-1)));unit.cooldown=Math.max(0,unit.cooldown-dt);unit.healCooldown=Math.max(0,unit.healCooldown-dt);
  if(unit.windup>0){unit.moving=false;unit.windup=Math.max(0,unit.windup-dt);if(!unit.windup)fireInfantry(state,unit,actors,layout,event);continue;}
  const wounded=unit.healTargetId&&state.monsters.find(u=>u.id===unit.healTargetId&&u.health>0);
  if(wounded&&wounded.health<wounded.maxHealth-2){if(range(unit,wounded)>38)walk(unit,wounded,dt,layout);else{unit.moving=false;if(!unit.healCooldown){wounded.health=Math.min(wounded.maxHealth,wounded.health+12);unit.healCooldown=1.6;unit.healUntil=at+.65;}}continue;}
  const other=state.monsters.find(u=>u.id===unit.targetId&&u.health>0),captain=actors.find(a=>a.id===unit.targetId&&a.person.health>0),target=other||captain?.person;
  if(target&&range(unit,target)<=205&&clearSidearmSight(layout,unit,target)){unit.moving=false;if(!unit.cooldown){unit.aimAngle=Math.atan2(target.y-unit.y,target.x-unit.x)+roll(w,-.035,.035);unit.windup=.55;unit.attackUntil=at+.55;}continue;}
  const side=unit.factionId==='freewake'?1:-1,lane=unit.lane,front=w.fronts[lane],offset=unit.role==='medic'?-side*4:unit.role==='support'?-side*2:side;
  const leader=state.monsters.find(u=>u.id===unit.leaderId&&u.health>0);
  const goal=leader&&range(unit,leader)>180?leader:target&&range(unit,target)<300?target:point(Math.round(front+offset+(unit.slot%3-1)*2),lanes[lane]+(unit.slot%2?1:-1));
  if(range(unit,goal)>18)walk(unit,goal,dt,layout,unit.speed*(unit.role!=='leader'&&!leader ? .85 : 1));else unit.moving=false;
 }
 shells(state,actors,layout,event);
 for(const actor of actors)stepEscort(state,actor,dt,layout,event);
 state.cleared=false;return events;
}

/** Visiting after an absence advances armies only. Catch-up is deliberately
 * capped: reopening a long-idle save cannot run hours of work or complete an escort. */
export function catchUpWarzoneGround(encounter,elapsed,surface){
 if(!encounter?.warzoneGround||!surface?.combatLayout)return 0;
 const seconds=clamp(finite(elapsed),0,90);let left=seconds;
 while(left>1e-8){const dt=Math.min(.25,left);stepWarzoneGround(encounter,[],dt,surface);left-=dt;}
 return seconds;
}

const initialStories=()=>({version:1,revision:0,hospital:{stage:'unasked',allocation:null},evacuation:{stage:'unasked',escort:null},names:{stage:'unasked',registry:false,tags:false,decision:null},dispatch:{decision:null}});
export function normalizeWarzoneGroundStories(raw){
 const s=initialStories();if(!raw||typeof raw!=='object')return s;s.revision=serial(raw.revision);
 const stages={hospital:['unasked','accepted','part','powered','done'],evacuation:['unasked','accepted','escorting','arrived','done'],names:['unasked','accepted','ready','done']};for(const key of Object.keys(stages))if(stages[key].includes(raw[key]?.stage))s[key].stage=raw[key].stage;
 s.hospital.allocation=['theatre','triage'].includes(raw.hospital?.allocation)?raw.hospital.allocation:null;s.names.registry=raw.names?.registry===true;s.names.tags=raw.names?.tags===true;s.names.decision=['public','families'].includes(raw.names?.decision)?raw.names.decision:null;
 s.dispatch.decision=['relief','hauler'].includes(raw.dispatch?.decision)?raw.dispatch.decision:null;
 if(['escorting','arrived','done'].includes(s.evacuation.stage))s.evacuation.escort={...restoredPoint(raw.evacuation?.escort,point(79,59)),moving:false,waiting:false,walkTime:0};return s;
}
function stepEscort(state,actor,dt,layout,event){
 const task=actor.stories?.evacuation;if(task?.stage!=='escorting'||!task.escort)return;const escort=task.escort,at=state.time,clinic=point(15,61),d=range(escort,actor.person);
 if(range(escort,clinic)<66){task.stage='arrived';escort.moving=false;actor.stories.revision++;event('warzone-relief-progress',{actorId:actor.id,text:'All three tenants reached the clinic. Return to Asha’s evacuation desk to arrange their onward passage.'});return;}
 const danger=state.warzoneGround.shells.some(s=>s.until>at&&range(s,escort)<s.radius+30);escort.waiting=d>240||danger;
 if(d>35&&!escort.waiting)walk(escort,actor.person,dt,layout,actor.stories.hospital.allocation==='triage'?58:48);else escort.moving=false;
}
const option=(id,label)=>({id,label});
function storyReply(stories,id){
 const h=stories.hospital,e=stories.evacuation,n=stories.names;
 if(id==='refuge-arrivals')return{text:(e.stage==='done'?'VERIFIED ARRIVALS: Siv, Oren and Mara, escorted out of Ashfall by your captain. Their beds are in the southern bay. Siv left a note: “You can visit us somewhere that is not a battlefield.”':'The Vey tenant manifest has no completed evacuation by your captain yet. Asha’s desk at Ashfall can assign an escort for Siv, Oren and Mara. Other families wait beside the arrivals board.')+(stories.dispatch.decision==='relief'?' HEATING UPDATE: your Lorn shipment has powered the whole sleeping hall. The maintenance worker has put away the rotating-heat schedule.':stories.dispatch.decision==='hauler'?' HEATING UPDATE: the refuge remains on rotating heat while the cooperative hauler returns to service. Reception keeps blankets available and records the outstanding cell request.':' HEATING UPDATE: sleeping bays take turns on the working circuit. Cistern Nine on Lorn has a disputed spare cell shipment.')};
 if(id==='fuel-dispatch'){
  if(stories.dispatch.decision)return{text:stories.dispatch.decision==='relief'?'Edda: “Your cells reached Thawline on Orsa. The whole sleeping hall is heated. Rafi’s cooperative hauler is still waiting, and the ledger keeps that cost visible.”':'Edda: “The cooperative hauler is working again. Six driver households have their next paid run. Thawline still rotates its heating; their request stays at the top of the next civilian batch.”'};
  return{text:'Edda: “These spare cells are released from military quota. Sending them to Orsa heats the whole refuge hall. Restarting the cooperative hauler restores six households’ work and pays your 90-credit dispatch fee. Whichever you choose, I record the unmet request too.”',options:[option('relief','Send the cells to Orsa’s refuge heaters'),option('hauler','Restart the civilian hauler · 90 cr')]};
 }
 if(id==='hospital'){
  if(h.stage==='unasked')return{text:'“The generator will fail before the next surgical shift. A sealed regulator is in the TRAM DEPOT, on the south combat lane. Recover it, bring it to the generator beside this ward, then tell me which circuit you restored. The aid passage gets you close without crossing the central works.”',options:[option('accept','Take the regulator recovery job')]};
  if(h.stage==='accepted')return{text:'Dr Elian: “The regulator is still at the tram depot. Take the marked gap north of the clinic, then the depot cabinet on Tram Street. Bring it to our generator.”'};
  if(h.stage==='part')return{text:'Dr Elian: “You have it. Fit it at the generator beside the ward. You must choose: the operating theatre, or the triage and evacuation lighting. One regulator cannot safely supply both.”'};
  if(h.stage==='powered')return{text:h.allocation==='theatre'?'The operating lights are steady. Elian has stopped doing surgery by hand lamp. “Two patients can be operated on here now. The evacuation team still has to move slowly.”':'The corridor lights come on and the triage oxygen pumps run steadily. “People can get out faster now. We still have to send major surgery off-world.”',options:[option('complete','Hand over the repair log · 180 cr')]};
  return{text:h.allocation==='theatre'?'Dr Elian: “The theatre is still running. The tram worker you saw has survived the operation. We are short of everything else, but that change stayed.”':'Dr Elian: “The triage circuit is still running. Asha’s escorts can move the injured faster. We still transfer the worst cases to Orsa; I tell every family why.”'};
 }
 if(id==='depot')return h.stage==='accepted'?{text:'The cabinet is intact, but its door faces the active tram lane. The labelled regulator matches Elian’s generator. Carry it back to the clinic’s generator; it is relief equipment, not tradable cargo.',options:[option('recover','Recover the sealed regulator')]}:{text:h.stage==='unasked'?'The regulator is reserved for the neutral clinic. Speak to Dr Elian at the emergency-power desk before removing it.':'The regulator you recovered is recorded in the clinic’s repair log. There is no second part to sell.'};
 if(id==='generator')return h.stage==='part'?{text:'The replacement fits. Its rating permits one additional circuit. Theatre power keeps severe casualties here for surgery. Triage power restores oxygen and route lighting, allowing your tenant escort to walk faster. The choice will remain in the clinic.',options:[option('theatre','Power the operating theatre'),option('triage','Power triage and evacuation lighting')]}:{text:['powered','done'].includes(h.stage)?`The ${h.allocation==='theatre'?'operating theatre':'triage and route-lighting'} circuit is live. The other circuit remains limited; the installed regulator cannot be moved without interrupting treatment.`:'The generator needs the sealed tram-depot regulator. Dr Elian can authorize its recovery.'};
 if(id==='evacuation'){
  if(e.stage==='unasked')return{text:'Asha: “Siv, Oren and Mara are at the APARTMENT SHELTER at the east end of the southern passage. Go to their shelter sign, then walk them back here. Keep within ten paving tiles; they will wait if you disappear ahead. The covered passage is safer than the tram street.”',options:[option('accept','Agree to escort the three tenants')]};
  if(e.stage==='accepted')return{text:'Asha: “The shelter sign is at the east end of the southern aid passage. Meet all three tenants there before you bring them back.”'};
  if(e.stage==='escorting')return{text:'Asha: “Bring the whole group to the clinic approach beside me. If they stopped, go back: they wait when the escort is too far ahead or an incoming shell threatens them.”'};
  if(e.stage==='arrived')return{text:'Siv counts the others twice. Mara asks if the transport takes pets; Oren is holding an empty carrier. Asha marks three occupied seats on the Orsa shuttle. They are alive, and they will not be asked to cross the same street tomorrow.',options:[option('complete','Register the three evacuees · 220 cr')]};
  return{text:'Asha: “Their onward passage is registered. Siv left this: ‘Please tell the next tenants where the covered passage is.’ There are new people waiting every day, but these three are no longer on my missing list.”'};
 }
 if(id==='shelter')return e.stage==='accepted'?{text:'Siv: “We can walk together. Use the southern covered passage and keep us close. If you leave the district we will shelter where we are until you return.”',options:[option('escort','Lead the tenants to the clinic')]}:{text:e.stage==='unasked'?'Asha is assigning seats and escorts at the clinic. Ask at her evacuation desk first so this group has somewhere to go.':e.stage==='escorting'?'The tenants are following your last position. Walk close to them; they cannot keep up with a sprint.':'Three bedding spaces are empty. The names Siv, Oren and Mara have been crossed off the shelter’s waiting list.'};
 if(id==='names'){
  if(n.stage==='unasked')return{text:'Nera: “The school register is in the shattered building north of TRAM STREET. Two recovered identity packets are at the RAIL AID POST, near the northern lane. I need both. Without the school list, the soldiers’ packets tell me who died but not who was waiting for them.”',options:[option('accept','Help reconcile the missing-persons list')]};
  if(n.registry&&n.tags&&n.stage!=='done')return{text:'The documents establish two deaths and locate four children already transferred to Orsa. Nera can publish the verified names on the memorial board, or send individual family notices first and keep the public board private for now. Neither choice erases the deaths.',options:[option('public','Publish the verified memorial · 160 cr'),option('families','Send private family notices · 160 cr')]};
  if(n.stage==='done')return{text:n.decision==='public'?'Nera: “The names stay on the board. Two families came here after reading it. One was angry we made it public. I kept their words beside the names; the record includes what this cost.”':'Nera: “The family notices were sent before any announcement. One family returned a photograph; another asked for silence. The public board records the loss without publishing their names.”'};
  return{text:`Nera: “${n.registry?'The school register is safe. Recover the rail-post identity packets in the north.':n.tags?'The identity packets are safe. We still need the school register near Tram Street.':'Recover the school register and the rail-post identity packets. The central service spine connects the three lanes, but there is active fire on each.'}”`};
 }
 if(id==='registry'||id==='tags'){const got=id==='registry'?n.registry:n.tags;return n.stage==='unasked'?{text:'These records belong with the civilian missing-persons desk. Ask Nera at the clinic what must be recovered before you disturb them.'}:got?{text:'Your copy is already secured at the missing-persons desk. The originals stay protected for the next family.'}:{text:id==='registry'?'The register lists children, emergency contacts and the destinations of the last school transport. Copy the legible pages; leave the original in its waterproof case.':'The identity packets hold two service numbers and a civilian medic’s signed account. Both died while carrying the same stretcher. Record the names without taking the personal belongings.',options:[option('recover','Secure a verified copy for Nera')]};}
 return null;
}
/** The caller has already checked physical range to the authored object. */
export function warzoneGroundStoryAction(game,entity,action,optionId){
 const id=entity.data?.choiceId,stories=game.state.warzoneStories||=normalizeWarzoneGroundStories(),reply=id&&storyReply(stories,id);if(!reply)return null;
 if(action==='inspect')return{ok:true,title:entity.name,text:reply.text,...(reply.options?.length?{choice:{id,name:entity.name,text:reply.text,options:reply.options},chosen:null}:{})};
 if(action!=='choose'||!reply.options?.some(o=>o.id===optionId))return game._fail('That relief action is no longer available. Read the desk for the current next step.','warzone-story');
 const h=stories.hospital,e=stories.evacuation,n=stories.names;let credits=0,text='';
 if(id==='hospital'&&optionId==='accept'){h.stage='accepted';text='Elian signs out the tram-depot regulator to you. Recover it on Tram Street, then fit it at the clinic generator.';}
 else if(id==='depot'){h.stage='part';text='You secure the regulator in a padded relief case. Return through the covered aid passage to the clinic generator.';}
 else if(id==='generator'){h.stage='powered';h.allocation=optionId;text=optionId==='theatre'?'The operating theatre lights come on. A patient is moved from the corridor into surgery. Return to Dr Elian’s desk with the repair log.':'The triage pumps and covered-route lamps come on. Evacuees can now walk faster under your escort. Return to Dr Elian’s desk with the repair log.';}
 else if(id==='hospital'&&optionId==='complete'){h.stage='done';credits=180;text=storyReply(stories,id).text;}
 else if(id==='evacuation'&&optionId==='accept'){e.stage='accepted';text='Three shuttle seats are reserved. Meet Siv, Oren and Mara at the apartment-shelter sign, then walk them along the southern passage to the clinic.';}
 else if(id==='shelter'){e.stage='escorting';e.escort={...point(79,59),moving:false,waiting:false,walkTime:0};text='All three tenants stand. They will follow while you stay close. Walk west through the covered southern passage to the clinic; if they wait, return to them.';}
 else if(id==='evacuation'&&optionId==='complete'){e.stage='done';credits=220;text='Siv, Oren and Mara are registered for onward passage to Orsa. Their bedding spaces are cleared and their names stay on the evacuation record.';}
 else if(id==='names'&&optionId==='accept'){n.stage='accepted';text='Nera gives you a waterproof copy sleeve. Recover the school register near Tram Street and identity packets at the northern rail aid post, then return to her desk.';}
 else if(id==='registry'||id==='tags'){n[id]=true;if(n.registry&&n.tags)n.stage='ready';text=n.stage==='ready'?'Both sets of records are secure. Return to Nera’s missing-persons desk to decide how the verified account reaches the families.':id==='registry'?'The school-register copy is secure. The identity packets are still at the northern rail aid post.':'The rail-post account is secure. The school register is still near Tram Street.';}
 else if(id==='names'){n.stage='done';n.decision=optionId;credits=160;text=storyReply(stories,id).text;}
 else if(id==='fuel-dispatch'){stories.dispatch.decision=optionId;credits=optionId==='hauler'?90:0;text=storyReply(stories,id).text;}
 else return game._fail('That relief action cannot be completed here.','warzone-story');
 stories.revision++;game.state.credits+=credits;
 const flag=`warzone:ashfall:${id}:${optionId}`;if(!game.state.flags.includes(flag))game.state.flags.push(flag);
 game.recordActivity?.('explore',{token:flag});game._log(entity.name,text,'exploration');game._event('site-reward',{text,credits,warzoneStory:id});game._refreshJobs?.();return{ok:true,title:entity.name,text,credits};
}

/** A captain's rescued people and ward follow-up never change another captain's
 * progress or the canonical infantry encounter. */
export function warzoneGroundSurfaceView(surface,stories){
 if(!surface?.warzone&&!surface?.site?.crosswindSupport)return surface;const s=stories?.version===1?stories:normalizeWarzoneGroundStories(stories),e=s.evacuation;
 if(surface.site?.crosswindSupport)return{...surface,warzoneStories:s,entities:surface.entities.flatMap(entity=>{
  const role=entity.data?.crosswindResident,spoken=text=>({...entity,text,data:{...entity.data,greeting:text,rumors:[]}});
  if(role==='rescued-tenant')return e.stage==='done'?[entity]:[];
  if(role==='reception')return[spoken(e.stage==='done'?'I have Siv, Oren and Mara registered. They are resting in the south bay. Thank you for bringing three people here instead of three missing-person notices.':'You can check the arrivals board beside me. Asha coordinates escorts at the southern clinic on Vey; we receive the people who reach her.')];
  if(role==='heating')return[spoken(s.dispatch.decision==='relief'?'All sleeping bays have heat now. Those cells from Lorn were delivered on your dispatch authorization. I removed the rotation schedule.':s.dispatch.decision==='hauler'?'We are still rotating the heat. The hauler’s families needed the work too. I will keep our request visible until the next cells come.':entity.text)];
  if(role==='dispatcher')return[spoken(storyReply(s,'fuel-dispatch').text)];
  if(role==='driver')return[{...spoken(s.dispatch.decision==='hauler'?'The hauler is running again. We have six families’ next pay run, and a delivery slot reserved for the refuge as soon as cells become available.':s.dispatch.decision==='relief'?'The refuge has heat. We are still waiting. Edda kept our six names on the next dispatch request; I will hold her to that.':entity.text),...(s.dispatch.decision==='hauler'?{x:point(7,16).x,y:point(7,16).y}:{})}];
  return[entity];
 })};
 return{...surface,warzoneStories:s,entities:surface.entities.flatMap(entity=>{
  const who=entity.data?.warzoneResident;if(!who)return[entity];
  const spoken=text=>({...entity,text,data:{...entity.data,greeting:text,rumors:[]}});
  if(who==='tenant'){
   if(e.stage==='done')return[];
   if(e.stage==='escorting'||e.stage==='arrived'){const base=e.escort||point(15,61),i=entity.data.tenantIndex;return[{...entity,x:base.x+(i-1)*15,y:base.y+(i%2)*12,moving:base.moving,role:'settler',text:e.stage==='arrived'?'We made it. Please register us at Asha’s desk.':base.waiting?'Please wait for us. We need to stay together.':'We are following. Keep to the covered passage.',life:{activity:base.moving?'walking':'waiting',label:base.waiting?'Waiting for your escort':'Walking to the clinic'}}];}
  }
  if(who==='elian')return[spoken(storyReply(s,'hospital').text)];if(who==='asha')return[spoken(storyReply(s,'evacuation').text)];if(who==='nera')return[spoken(storyReply(s,'names').text)];
  if(who==='patient'){const recovered=s.hospital.stage==='done'&&entity.data.patientIndex===0,text=recovered?(s.hospital.allocation==='theatre'?'They operated before the power failed. I am still here. Thank you for bringing that part.':'The oxygen is steady now. They say I can survive the transfer to Orsa.'):entity.text;return[{...spoken(text),data:{...spoken(text).data,health:recovered?65:28,maxHealth:100},life:{activity:recovered?'resting':'sleeping',label:recovered?'Recovering':'Stabilized casualty',restingAt:'bed',restTarget:{x:entity.x,y:entity.y-10}}}];}return[entity];
 })};
}

/** Low-cost pixel effects: bounded persistent scars, shell warnings, burning
 * blocks and a ward/memorial that visibly reflects the captain's relief work. */
export function drawWarzoneGroundEffects(ctx,surface,encounter,{time=0,cameraX=0,cameraY=0,width=800,height=600,reduceMotion=false,layer='floor'}={}){
 if(surface?.site?.crosswindSupport){
  if(layer==='floor'&&surface.site.crosswindSupport==='refuge'&&surface.warzoneStories?.dispatch?.decision==='relief'){ctx.fillStyle='#e4c992';for(const x of[8,20,29])ctx.fillRect(x*T,21*T,24,3);}
  return;
 }
 if(!surface?.warzone)return;const w=encounter?.warzoneGround,at=encounter?.time||0,visible=p=>p.x>cameraX-80&&p.y>cameraY-90&&p.x<cameraX+width+80&&p.y<cameraY+height+80,px=(c,x,y,ww,hh)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),ww,hh);};
 if(layer==='floor'){
  for(const s of w?.scars||[])if(visible(s)){if(s.type==='crater'){px('#282c30',s.x-20,s.y-8,40,16);px('#343435',s.x-14,s.y-12,28,24);px('#786d60',s.x-16,s.y+7,29,3);}else{px('#382e2f',s.x-9,s.y-4,18,8);px(colors[s.factionId]||'#a09d91',s.x-10,s.y-3,18,4);}}
  for(const shell of w?.shells||[])if(!shell.impacted&&visible(shell)){const pulse=reduceMotion?1:.6+Math.sin(time*12)*.25,r=shell.radius;ctx.globalAlpha=pulse;px('#df9a6e',shell.x-r,shell.y-r,r*2,2);px('#df9a6e',shell.x-r,shell.y+r,r*2,2);px('#df9a6e',shell.x-r,shell.y-r,2,r*2);px('#df9a6e',shell.x+r,shell.y-r,2,r*2);px('#edc792',shell.x-5,shell.y-1,10,2);px('#edc792',shell.x-1,shell.y-5,2,10);ctx.globalAlpha=1;}
  const stories=surface.warzoneStories;if(stories?.hospital.allocation){const c=stories.hospital.allocation==='theatre'?'#e4d7a4':'#a8d7c2';for(const x of[11,14,17])px(c,x*T,56*T,20,3);if(stories.hospital.allocation==='triage')for(let x=32;x<76;x+=6)px('#a8d7c2',x*T,62*T,6,2);}
  if(stories?.names.stage==='done'){const p=surface.warzoneMemorial;px('#a6aaa0',p.x-12,p.y-26,24,26);px('#333e40',p.x-9,p.y-23,18,18);for(let i=0;i<3;i++)px(stories.names.decision==='public'?'#d7d0b4':'#9eb9b6',p.x-6,p.y-20+i*5,12,1);px('#c4ae74',p.x-15,p.y,3,5);}
  return;
 }
 for(const [i,p]of(surface.warzoneFires||[]).entries())if(visible(p)){const flicker=reduceMotion?0:Math.sin(time*8+i)*3;px('#302c2c',p.x-11,p.y-4,23,8);px('#a85f3b',p.x-8,p.y-13-flicker,15,15+flicker);px('#d79b53',p.x-3,p.y-9-flicker,6,11+flicker);ctx.globalAlpha=.35;for(let j=0;j<3;j++){const rise=reduceMotion?j*17:(time*13+j*18+i*7)%58;px('#6e6b65',p.x-8+j*3,p.y-21-rise,18+j*6,10+j*4);}ctx.globalAlpha=1;}
 for(const shell of w?.shells||[])if(shell.impacted&&visible(shell)){const age=at-shell.impactAt,r=Math.min(shell.radius,12+age*90);ctx.globalAlpha=Math.max(0,.8-age*.5);px(age<.25?'#e7ca87':'#93816b',shell.x-r,shell.y-r*.5,r*2,r);ctx.globalAlpha=1;}
}
