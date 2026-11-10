/** Encounters are conversations with a place or a physical contact, never a view-change roll. */
import { systemContext } from './encounter-context.mjs';
import { enemyHullProfile } from './fleet.mjs';

const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=value=>JSON.parse(JSON.stringify(value));
const physical=new Set(['lifeboat','ghost_freighter','cinder_toll','signal_imposter','patrol','cinder_sanctuary']);
const signalKinds={lifeboat:'distress',ghost_freighter:'derelict',cinder_toll:'standoff',signal_imposter:'suspicion',survey_echo:'anomaly',dueling_beacons:'relay'};
const contactNames={lifeboat:'Unpowered lifeboat',ghost_freighter:'Silent freighter',cinder_toll:'Cinder toll cutter',signal_imposter:'False-call cutter'};

export function contextualSignals(system,signals,seed){
 const context=systemContext(system);
 return signals.map(signal=>{
  if(signal.story)return signal;
  const value=hash(`${seed}:${signal.id}:local-contact`)/4294967296;
  if(signal.kind==='distress'){
   // The starting metropolitan lanes have a staffed rescue service. Remote
   // distress is a rare physical discovery, not a guaranteed marker per system.
   if(context.region!=='core'&&value<context.rescueSignalChance/2)return {...signal,name:'Weak lifeboat transponder',encounterId:'lifeboat'};
   return {...signal,kind:'beacon',name:'Lane navigation beacon'};
  }
  if(signal.kind==='derelict'){
   if(context.region!=='core'&&value<context.derelictSignalChance/2)return {...signal,name:'Silent freighter',encounterId:'ghost_freighter'};
   if(context.region!=='core'&&context.backgroundHostileCount>0&&value>.965)return {...signal,kind:'standoff',name:'Cutter holding the lane',encounterId:'cinder_toll'};
   if(context.region==='deep'&&value>.935&&value<=.965)return {...signal,kind:'suspicion',name:'Repeating distress code',encounterId:'signal_imposter'};
   return {...signal,kind:'survey',name:'Survey marker'};
  }
  if(signal.kind==='beacon'&&['frontier','deep'].includes(context.region)&&value<.025)return {...signal,kind:'relay',name:'Remote emergency relay',encounterId:'dueling_beacons'};
  return signal;
 });
}

/** Put the hull behind a distress or standoff marker into the same space world. */
export function materializeEncounterContacts(game){
 const world=game._record(),runtime=game.system;
 world.encounterContacts||={};
 for(const signal of runtime.signals){
  if(!signal.encounterId||!physical.has(signal.encounterId))continue;
  const id=`contact:${signal.id}`;
  signal.vesselId=id;
  if(runtime.enemies.some(e=>e.id===id)||world.defeated.includes(id))continue;
  const prior=world.encounterContacts[id];
  if(signal.resolved&&!prior)continue;
  const contact=prior?clone(prior):{id,signalId:signal.id,encounterId:signal.encounterId,name:contactNames[signal.encounterId],faction:['cinder_toll','signal_imposter'].includes(signal.encounterId)?'cinder':'freewake',...enemyHullProfile(signal.encounterId==='ghost_freighter'?'hauler':signal.encounterId==='lifeboat'?'kestrel':'sparrow'),x:signal.x,y:signal.y,angle:.45,speed:0,contact:true};
  if(!runtime.traffic.some(t=>t.id===id))runtime.traffic.push(contact);
  world.encounterContacts[id]=clone(contact);
 }
}

export function encounterSource(game,source={},id=null){
 const sh=game.state.ship;
 const sources=[];
 if(source.sourceType==='signal'||!source.sourceType){
  for(const signal of game.system.signals){
   if(signal.resolved||source.sourceId&&signal.id!==source.sourceId||distance(signal,sh)>sh.scanRange)continue;
   if(id&&signalKinds[id]&&signal.kind!==signalKinds[id])continue;
   if(signal.encounterId&&id&&signal.encounterId!==id)continue;
   sources.push({sourceType:'signal',sourceId:signal.id,kind:signal.kind,tag:signal.kind.toUpperCase(),encounterId:signal.encounterId||null,vesselId:signal.vesselId||null,x:signal.x,y:signal.y,distance:distance(signal,sh)});
  }
 }
 if(source.sourceType==='traffic'||!source.sourceType){
  for(const contact of game.system.traffic){
   if(contact.resolved||source.sourceId&&contact.id!==source.sourceId&&contact.signalId!==source.sourceId||source.vesselId&&contact.id!==source.vesselId||distance(contact,sh)>220)continue;
   const signal=contact.signalId?game.system.signals.find(signal=>signal.id===contact.signalId):null;
   if(contact.signalId&&(!signal||signal.resolved||signal.vesselId!==contact.id||signal.encounterId!==contact.encounterId))continue;
   // Hailing and scanning a distress hull refer to the same people and outcome.
   // The evacuated hull can remain visible, but its resolved source cannot reopen.
   const origin={sourceType:'traffic',sourceId:signal?.id||contact.id,kind:'traffic',encounterId:contact.encounterId||null,vesselId:contact.id,faction:contact.faction,x:contact.x,y:contact.y,distance:distance(contact,sh)};
   if(id&&!encounterFitsPlace(game,{id,mode:'ship'},origin))continue;
   sources.push(origin);
  }
 }
 return sources.sort((a,b)=>a.distance-b.distance)[0]||null;
}

export function encounterFitsPlace(game,encounter,source=null){
 const context=systemContext(game.currentSystem);
 if(encounter.mode==='person'){
  if(!game.atInhabitedPort)return !!encounter.conditions?.locationId&&game.state.locationId===encounter.conditions.locationId;
  if(encounter.id==='union_strike')return ['meridian','freewake'].includes(game.currentBody.faction||game.currentSystem.faction);
  if(encounter.id==='new_owner')return game.currentBody.kind==='planet'&&['meridian','freewake'].includes(game.currentBody.faction||game.currentSystem.faction);
  if(encounter.id==='cooling_vote')return game.currentBody.kind==='planet'&&['arid','desert','volcanic','temperate'].includes(game.currentBody.biome);
  return true;
 }
 if(encounter.id==='earth_arrival')return game.state.systemId==='sol';
 if(!source)return false;
 if(source.sourceType==='signal'){
  if(signalKinds[encounter.id]!==source.kind)return false;
  if(physical.has(encounter.id))return source.encounterId===encounter.id&&!!source.vesselId&&game.system.traffic.some(t=>t.id===source.vesselId&&!t.resolved);
  return encounter.id==='survey_echo'||encounter.id==='dueling_beacons';
 }
 if(source.sourceType==='traffic'){
  if(physical.has(encounter.id)&&source.encounterId===encounter.id)return true;
  if(encounter.id==='patrol')return source.faction==='concord'&&context.region!=='core'&&source.encounterId==='patrol';
  if(encounter.id==='cinder_sanctuary')return source.faction==='cinder'&&game.state.ship.hull<game.state.ship.maxHull;
 }
 return false;
}

export function pendingSourceAvailable(game,pending){
 if(!pending||pending.systemId!==game.state.systemId)return false;
 if(pending.shipId&&pending.shipId!==game.state.ship.id)return false;
 if(!pending.sourceType||!['signal','traffic'].includes(pending.sourceType))return true;
 if(game.state.mode!=='ship'&&game.state.interior?.kind!=='ship')return false;
 const origin=encounterSource(game,pending,pending.id);
 return !!origin&&(!pending.vesselId||pending.vesselId===origin.vesselId)&&encounterFitsPlace(game,{id:pending.id,mode:'ship'},origin);
}

/** A refusal can start a real fight. Hull loss is only caused by weapon collision. */
export function resolvePhysicalEncounter(game,pending,choice){
 const id=pending.vesselId;
 if(!id)return;
 const world=game._record(),contact=game.system.traffic.find(t=>t.id===id);
 const hostile=pending.id==='cinder_toll'&&choice.id==='refuse'||pending.id==='signal_imposter'&&choice.id==='warn';
 if(hostile&&contact){
  const enemy={...clone(contact),...enemyHullProfile(contact.classId),hp:72,maxHp:72,vx:0,vy:0,speed:82,damage:6,reward:30,cooldown:1.8,active:true,faction:'cinder',encounterId:pending.id};
  delete enemy.contact;delete enemy.resolved;
  if(!game.system.enemies.some(e=>e.id===id))game.system.enemies.push(enemy);
  if(!world.spawned.some(e=>e.id===id))world.spawned.push(clone(enemy));
  game.system.traffic=game.system.traffic.filter(t=>t.id!==id);
  game._event('hostile-contact',{enemyId:id,x:enemy.x,y:enemy.y,text:`${enemy.name} is arming its weapons. The contact is marked on your scanner.`});
 }else if(contact){
  contact.resolved=true;contact.encounterId=null;
  if(['lifeboat','ghost_freighter'].includes(pending.id)){
   contact.evacuated=choice.id==='rescue'||choice.id==='board';
   contact.name=contact.evacuated?'Evacuated vessel':'Rescue coordinates marked';
  }
 }
 if(contact)world.encounterContacts[id]={...clone(contact),resolved:true};
  if(contact?.signalId){const signal=game.system.signals.find(s=>s.id===contact.signalId);if(signal)signal.resolved=true;if(!world.resolved.includes(contact.signalId))world.resolved.push(contact.signalId);}
  return hostile?game.system.enemies.find(enemy=>enemy.id===id):null;
}
