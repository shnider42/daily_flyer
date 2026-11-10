/** A single, persisted clock for local crises. DOM-free; authority advances it once. */
import { enemyHullProfile } from './fleet.mjs';

const finite=(n,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const factions=['concord','freewake','meridian','lantern','cinder'];
const rival={concord:'cinder',freewake:'meridian',meridian:'freewake',lantern:'cinder',cinder:'concord'};
const hasPort=body=>body&&body.landable!==false&&!['blackhole','site','ship'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome)));
const validPlayer=id=>typeof id==='string'&&id.length>0&&id.length<=160&&!['__proto__','constructor','prototype'].includes(id);
const token=value=>String(value??'').slice(0,200);

export const WORLD_DIRECTOR_RULES=Object.freeze({version:1,tickSeconds:5,intervalSeconds:180,warningSeconds:45,eventSeconds:540,maxCatchupCycles:32,maxEvents:8,maxHistory:24,maxConditions:48,maxContributors:32});
const types=['rescue','raid','outbreak','clash'];
const descriptions={
 rescue:{title:'Distress dispatch',text:'An independent shuttle has lost its life-support reserve. Local crews are evacuating its passengers; the clinic needs additional transport.',objective:'Bring patients to a clinic before the dispatch closes.',required:2},
 raid:{title:'Convoy under attack',text:'Raiding cutters are approaching a civilian convoy. The watch will defend it, but cannot hold indefinitely.',objective:'Disable the marked raiders, or carry the injured to safety.',required:2},
 outbreak:{title:'Clinic overload',text:'A sealed habitat is reporting an unfamiliar fever. Its clinic is improvising isolation berths while supply ships are delayed.',objective:'Complete clinic triage shifts or transport patients from this port.',required:3},
 clash:{title:'Border standoff',text:'Two patrols claim the same shipping lane. Civilian freighters are caught between them; a warning exchange is turning into live fire.',objective:'Stop the attacking patrol or evacuate the people in its path.',required:2}
};

function eventFor(seed,cycle,startedAt,systems){
 const inhabited=systems.filter(system=>system?.bodies?.some(hasPort));
 if(!inhabited.length)return null;
 // The opening signals are accessible without a fold drive. Later dispatches spread.
 const near=inhabited.filter(system=>Math.hypot(finite(system.gx),finite(system.gy))<=14);
 const authored=inhabited.filter(system=>!String(system.id).startsWith('sector-')&&!String(system.id).startsWith('frontier-'));
 const pool=cycle<12?(near.length?near:inhabited):(cycle%4===0?inhabited:(authored.length?authored:inhabited));
 const h=hash(`${seed}:world-director:${cycle}`),system=cycle<2?(inhabited.find(system=>system.id==='hearth')||pool[h%pool.length]):pool[h%pool.length];
 const bodies=system.bodies.filter(hasPort),body=bodies[(h>>>8)%bodies.length],type=types[cycle%types.length],definition=descriptions[type];
 const startAt=startedAt+cycle*WORLD_DIRECTOR_RULES.intervalSeconds;
 const factionId=factions.includes(body.faction)?body.faction:factions.includes(system.faction)?system.faction:'freewake';
 const id=`world:${hash(seed).toString(36)}:${cycle}`;
 return{id,cycle,type,title:definition.title,text:definition.text,objective:definition.objective,systemId:system.id,systemName:system.name,bodyId:body.id,bodyName:body.name,factionId,rivalFactionId:rival[factionId],startAt,activeAt:startAt+WORLD_DIRECTOR_RULES.warningSeconds,expiresAt:startAt+WORLD_DIRECTOR_RULES.eventSeconds,status:'warning',required:definition.required,progress:0,neutralized:[],contributors:{},spawnIds:['raid','clash'].includes(type)?[`${id}:hostile:0`,`${id}:hostile:1`]:[],outcome:null};
}

function freshState(now){return{version:1,startedAt:now,time:now,nextTickAt:now,cycle:-1,revision:0,skippedCycles:0,events:[],history:[],conditions:{},factionPressure:Object.fromEntries(factions.map(id=>[id,0]))};}
function validEvent(event){return event&&typeof event.id==='string'&&types.includes(event.type)&&typeof event.systemId==='string'&&typeof event.bodyId==='string'&&Number.isFinite(event.expiresAt)&&Number.isFinite(event.startAt);}
function normalizeState(raw,now){
 if(!raw||raw.version!==1||!Number.isFinite(raw.startedAt))return freshState(now);
 const state=clone(raw);
 state.time=Math.max(state.startedAt,finite(state.time,state.startedAt));state.cycle=Math.max(-1,Math.floor(finite(state.cycle,-1)));
 state.revision=Math.max(0,Math.floor(finite(state.revision)));state.skippedCycles=Math.max(0,Math.floor(finite(state.skippedCycles)));
 state.events=(Array.isArray(state.events)?state.events:[]).filter(validEvent).slice(-WORLD_DIRECTOR_RULES.maxEvents);
 state.history=(Array.isArray(state.history)?state.history:[]).filter(validEvent).slice(-WORLD_DIRECTOR_RULES.maxHistory);
 state.conditions=Object.fromEntries(Object.entries(object(state.conditions)).filter(([key,value])=>key.length<200&&value&&Number.isFinite(value.until)).slice(-WORLD_DIRECTOR_RULES.maxConditions));
 state.factionPressure=Object.fromEntries(factions.map(id=>[id,clamp(finite(state.factionPressure?.[id]),-100,100)]));
 for(const event of [...state.events,...state.history]){
  event.contributors=Object.fromEntries(Object.entries(object(event.contributors)).filter(([id])=>validPlayer(id)).slice(0,WORLD_DIRECTOR_RULES.maxContributors).map(([id,c])=>[id,{damage:clamp(finite(c.damage),0,1e6),aid:clamp(finite(c.aid),0,20),neutralized:clamp(finite(c.neutralized),0,2),claimed:!!c.claimed,actions:(Array.isArray(c.actions)?c.actions:[]).filter(v=>typeof v==='string').slice(-16),lastAt:finite(c.lastAt)}]));
  event.neutralized=[...new Set((Array.isArray(event.neutralized)?event.neutralized:[]).filter(id=>event.spawnIds?.includes(id)))].slice(0,2);
  event.progress=clamp(finite(event.progress),0,20);event.required=descriptions[event.type].required;
 }
 return state;
}

function closeEvent(state,event,at,transitions){
 if(event.status==='resolved')return;
 const success=event.progress>=event.required;
 event.status='resolved';event.resolvedAt=at;event.outcome=success?'stabilized':'unassisted';
 const detail={rescue:success?'The last evacuees reached a clinic.':'The local rescue crew saved who it could; the port is sheltering displaced passengers.',raid:success?'The convoy escaped while its attackers were forced back.':'The watch withdrew. Stolen supplies have left the port short of essentials.',outbreak:success?'Additional clinic shifts contained the surge.':'The clinic imposed a temporary quarantine and exhausted its reserve supplies.',clash:success?'Civilian passage reopened after the attack was stopped.':'Both patrols withdrew damaged. The lane now operates under armed inspections.'};
 event.resultText=detail[event.type];
 const key=`${event.systemId}:${event.bodyId}`,prior=state.conditions[key]||{};
 state.conditions[key]={systemId:event.systemId,bodyId:event.bodyId,title:success?'Relief secured':event.type==='outbreak'?'Clinic under strain':event.type==='raid'?'Supply shortage':event.type==='clash'?'Armed inspections':'Displaced passengers',text:event.resultText,security:clamp(finite(prior.security)+(success?1:['raid','clash'].includes(event.type)?-2:0),-5,5),health:clamp(finite(prior.health)+(success?1:['outbreak','rescue'].includes(event.type)?-2:0),-5,5),serviceMultiplier:success?.96:1.08,until:at+1800,eventId:event.id};
 state.factionPressure[event.factionId]=clamp((state.factionPressure[event.factionId]||0)+(success?2:-2),-100,100);
 state.factionPressure[event.rivalFactionId]=clamp((state.factionPressure[event.rivalFactionId]||0)+(success?-1:1),-100,100);
 state.history.push(event);state.history=state.history.slice(-WORLD_DIRECTOR_RULES.maxHistory);
 transitions.push({type:'world-resolved',eventId:event.id,systemId:event.systemId,bodyId:event.bodyId,outcome:event.outcome,text:`${event.bodyName}: ${event.resultText}`});
}

function expire(state,at,transitions){
 for(const event of state.events){
  if(event.status==='warning'&&at>=event.activeAt){event.status='active';transitions.push({type:'world-active',eventId:event.id,systemId:event.systemId,bodyId:event.bodyId,text:`${event.title} · ${event.bodyName}`});}
  if(event.progress>=event.required||at>=event.expiresAt)closeEvent(state,event,Math.min(at,event.expiresAt),transitions);
 }
 state.events=state.events.filter(event=>event.status!=='resolved');
 for(const[key,condition]of Object.entries(state.conditions))if(condition.until<=at)delete state.conditions[key];
 const keys=Object.keys(state.conditions);for(const key of keys.slice(0,Math.max(0,keys.length-WORLD_DIRECTOR_RULES.maxConditions)))delete state.conditions[key];
}

export function eventSpawnDescriptors(event){
 if(!event||event.status!=='active'||!['raid','clash'].includes(event.type))return[];
 return event.spawnIds.filter(id=>!event.neutralized.includes(id)).map((id,index)=>({id,eventId:event.id,systemId:event.systemId,bodyId:event.bodyId,classId:index?'sparrow':'kestrel',faction:event.rivalFactionId,name:event.type==='raid'?`Convoy raider ${index+1}`:`${event.rivalFactionId==='meridian'?'Combine':'Border'} interdiction ${index+1}`,index}));
}

/** Pure, monotonic advancement. Old unresolved events finish even after a long absence. */
export function advanceWorldDirector(raw,absoluteSeconds,{seed='farwake',systems=[]}={}){
 const now=Math.max(0,finite(absoluteSeconds));
 if(raw?.version===1&&Number.isFinite(raw.time)&&(now<raw.nextTickAt||now<raw.time))return{state:raw,transitions:[],spawns:[]};
 const state=normalizeState(raw,now),transitions=[];
 const target=Math.max(0,Math.floor((now-state.startedAt)/WORLD_DIRECTOR_RULES.intervalSeconds));
 let first=state.cycle+1;
 if(target-first>=WORLD_DIRECTOR_RULES.maxCatchupCycles){
  expire(state,now,transitions);const skip=target-first-WORLD_DIRECTOR_RULES.maxCatchupCycles+1;
  state.skippedCycles+=skip;first+=skip;
 }
 for(let cycle=first;cycle<=target;cycle++){
  const at=state.startedAt+cycle*WORLD_DIRECTOR_RULES.intervalSeconds;
  expire(state,at,transitions);
  const event=eventFor(seed,cycle,state.startedAt,systems);
  if(event){state.events.push(event);transitions.push({type:'world-warning',eventId:event.id,systemId:event.systemId,bodyId:event.bodyId,text:`${event.title} · ${event.bodyName}. ${WORLD_DIRECTOR_RULES.warningSeconds}s warning.`});}
 }
 state.cycle=target;expire(state,now,transitions);
 state.time=now;state.nextTickAt=now+WORLD_DIRECTOR_RULES.tickSeconds;state.revision++;
 return{state,transitions:transitions.slice(-WORLD_DIRECTOR_RULES.maxHistory*3),spawns:state.events.flatMap(eventSpawnDescriptors)};
}

function contributor(event,playerId){
 if(!validPlayer(playerId))return null;
 if(Object.hasOwn(event.contributors,playerId))return event.contributors[playerId];
 if(Object.keys(event.contributors).length>=WORLD_DIRECTOR_RULES.maxContributors)return null;
 const value={damage:0,aid:0,neutralized:0,claimed:false,actions:[],lastAt:0};
 Object.defineProperty(event.contributors,playerId,{value,writable:true,enumerable:true,configurable:true});return value;
}
export const directorEvent=(director,eventId)=>[...(director?.events||[]),...(director?.history||[])].find(event=>event.id===eventId)||null;

/** Call only from authoritative projectile collision, after subtracting actual hull damage. */
export function recordDirectorDamage(director,enemy,playerId,damage){
 if(enemy?.professionJobId&&validPlayer(playerId)&&finite(damage)>0){
  enemy.professionContributors||={};
  if(Object.hasOwn(enemy.professionContributors,playerId)||Object.keys(enemy.professionContributors).length<WORLD_DIRECTOR_RULES.maxContributors){
   Object.defineProperty(enemy.professionContributors,playerId,{value:clamp(finite(enemy.professionContributors[playerId])+Math.min(finite(damage),Math.max(1,finite(enemy.maxHp))),0,1e6),writable:true,enumerable:true,configurable:true});
  }
 }
 const event=director?.events?.find(event=>event.id===enemy?.directorEventId);
 if(!event||event.status!=='active'||!event.spawnIds.includes(enemy.id)||finite(damage)<=0)return false;
 const value=contributor(event,playerId);if(!value)return false;
 value.damage=clamp(value.damage+Math.min(finite(damage),Math.max(1,finite(enemy.maxHp))),0,1e6);value.lastAt=director.time;
 if((enemy.hp<=enemy.maxHp*.4||enemy.disabled)&&!event.neutralized.includes(enemy.id)){
  event.neutralized.push(enemy.id);event.progress++;value.neutralized++;
 }
 director.revision++;return true;
}

/** A completed physical care action, never a client-provided progress number. */
export function recordDirectorAid(director,eventId,playerId,actionToken){
 const event=director?.events?.find(event=>event.id===eventId);
 if(!event||event.status!=='active')return false;
 const value=contributor(event,playerId),key=token(actionToken);
 if(!value||!key||value.actions.includes(key)||value.actions.length>=16)return false;
 value.actions.push(key);value.aid++;value.lastAt=director.time;event.progress++;director.revision++;return true;
}

export function directorBoard(director,{systemId=null,playerId=null}={}){
 if(!director)return{events:[],history:[],conditions:[],factionPressure:{},time:0};
 const view=event=>({id:event.id,type:event.type,title:event.title,text:event.text,objective:event.objective,systemId:event.systemId,systemName:event.systemName,bodyId:event.bodyId,bodyName:event.bodyName,factionId:event.factionId,rivalFactionId:event.rivalFactionId,status:event.status,outcome:event.outcome,resultText:event.resultText||null,startsIn:Math.max(0,Math.ceil(event.activeAt-director.time)),remaining:Math.max(0,Math.ceil(event.expiresAt-director.time)),progress:event.progress,required:event.required,participants:Object.keys(event.contributors).length,contribution:playerId?clone(event.contributors[playerId]||null):null,target:{systemId:event.systemId,bodyId:event.bodyId,entityId:`quest:profession-desk:${event.bodyId}`}});
 return{time:director.time,revision:director.revision,events:director.events.filter(event=>!systemId||event.systemId===systemId).map(view),history:director.history.filter(event=>!systemId||event.systemId===systemId).slice(-12).reverse().map(view),conditions:Object.values(director.conditions).filter(condition=>(!systemId||condition.systemId===systemId)&&condition.until>director.time).map(clone),factionPressure:{...director.factionPressure}};
}

/** Append real raid/patrol hulls once per room. A boarded/captured/damaged hull persists. */
export function syncDirectorWorld(game,director){
 if(!game?.system||!director)return false;
 const world=game._record(),runtime=game.system;
 world.spawned||=[];world.enemyHealth||={};world.enemyStates||={};world.defeated||=[];
 const active=new Set(director.events.filter(event=>event.systemId===game.state.systemId&&event.status==='active').map(event=>event.id));
 const occupied=enemy=>enemy.promotedVesselId||enemy.canonicalVesselId||enemy.capturedBy||enemy.boardingTargetId||enemy.deck?.occupation||enemy.disabled||enemy.hp<enemy.maxHp||game.state.boarding?.targetId===enemy.id||game._worldGames?.some(captain=>captain.state.boarding?.targetId===enemy.id);
 const prune=enemy=>!enemy.directorEventId||active.has(enemy.directorEventId)||occupied(enemy);
 let changed=false;
 const oldCount=runtime.enemies.length;runtime.enemies=runtime.enemies.filter(prune);if(oldCount!==runtime.enemies.length)changed=true;
 const liveIds=new Set(runtime.enemies.map(enemy=>enemy.id));
 world.spawned=world.spawned.filter(enemy=>!enemy.directorEventId||active.has(enemy.directorEventId)||liveIds.has(enemy.id)||occupied({...enemy,...world.enemyStates[enemy.id],hp:world.enemyHealth[enemy.id]??enemy.hp}));
 runtime.traffic=(runtime.traffic||[]).filter(ship=>!ship.directorEventId||active.has(ship.directorEventId));
 for(const event of director.events.filter(event=>event.systemId===game.state.systemId&&event.status==='active')){
  const body=runtime.bodies.find(body=>body.id===event.bodyId);if(!body)continue;
  for(const descriptor of eventSpawnDescriptors(event)){
   if(liveIds.has(descriptor.id)||world.defeated.includes(descriptor.id))continue;
   const prior=world.spawned.find(enemy=>enemy.id===descriptor.id),saved=world.enemyStates[descriptor.id];
   const angle=.7+descriptor.index*.8,offset=finite(body.radius,80)+450;
   const enemy=prior?{...clone(prior),...clone(saved||{}),hp:world.enemyHealth[descriptor.id]??prior.hp}:{id:descriptor.id,directorEventId:event.id,name:descriptor.name,faction:descriptor.faction,...enemyHullProfile(descriptor.classId),x:clamp(body.x+Math.cos(angle)*offset,-2200,2200),y:clamp(body.y+Math.sin(angle)*offset,-2200,2200),vx:0,vy:0,angle:angle+Math.PI,hp:descriptor.index?84:65,maxHp:descriptor.index?84:65,speed:72,damage:5,cooldown:1.7,reward:0,active:false};
   runtime.enemies.push(enemy);if(!prior)world.spawned.push(clone(enemy));liveIds.add(enemy.id);changed=true;
  }
  if(event.spawnIds.length&&!runtime.traffic.some(ship=>ship.id===`${event.id}:watch`)){
   runtime.traffic.push({id:`${event.id}:watch`,directorEventId:event.id,name:`${event.bodyName} watch`,faction:event.factionId,x:clamp(body.x+320,-2200,2200),y:clamp(body.y-240,-2200,2200),angle:.5,speed:26,...enemyHullProfile('sparrow')});changed=true;
  }
 }
 return changed;
}
