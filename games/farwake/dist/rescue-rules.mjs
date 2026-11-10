/** Physical rescued passengers belong to a hull, never to a camera mode. */
import { cabinLayout, isCabinWalkable, CREW_ROLES, getShipClass } from './fleet.mjs';
import { ensureSidearm } from './combat.mjs';

const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const text=(value,max=160)=>String(value??'').replace(/[<>\x00-\x1f]/g,'').slice(0,max);
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const copy=value=>JSON.parse(JSON.stringify(value));
const names=['Ari Vale','Sena Marr','Tomas Reed','Jori Venn','Iris Pell','Niko Ash','Meri Sol','Lea Farrow','Daro Fen','Celia Noon','Holl Rho','Eli Kest'];
const colors=['#bea698','#9dbab1','#c3b27f','#9eacca','#b2a0b9','#90b5c1'];
const statuses=new Set(['aboard','hostile','defeated','hijacked']);
const hasPort=body=>body&&body.landable!==false&&!['blackhole','site','ship','derelict'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome)));
const activeMember=member=>member.health>0&&member.status!=='dead';
const allGroups=ship=>Array.isArray(ship?.rescueGroups)?ship.rescueGroups:[];

export const RESCUE_RULES=Object.freeze({version:1,pirateChance:.1,minRevealSeconds:30,maxRevealSeconds:75,maxGroups:4,maxPeople:9,maxHistory:16});
const specs={
 'lifeboat/rescue':Object.freeze({count:2,label:'Lifeboat survivors',origin:'lifeboat'}),
 'ghost_freighter/board':Object.freeze({count:3,label:'Freighter survivors',origin:'freighter'})
};
export const rescueSpec=(encounterId,choiceId)=>specs[`${encounterId}/${choiceId}`]||null;
/** Keeping the boundary explicit makes the ten-percent rule independently testable. */
export const pirateRescueRoll=roll=>Number.isFinite(roll)&&roll>=0&&roll<RESCUE_RULES.pirateChance;
export function rescueDisposition(seed,systemId,sourceId,encounterId){
 const key=`${seed}:rescue:${systemId}:${sourceId}:${encounterId}`;
 return{pirates:pirateRescueRoll(hash(key+':intent')/4294967296),revealAfter:RESCUE_RULES.minRevealSeconds+hash(key+':patience')/4294967296*(RESCUE_RULES.maxRevealSeconds-RESCUE_RULES.minRevealSeconds)};
}

/** Display views intentionally omit the concealed intent and reveal timer. */
export function rescueOccupants(ship){
 return allGroups(ship).flatMap(group=>(group.members||[]).filter(activeMember).map(member=>({
  id:member.id,groupId:group.id,shipId:ship.id,name:member.name,color:member.color,health:member.health,maxHealth:member.maxHealth,
  x:member.x,y:member.y,berthIndex:member.berthIndex,status:group.status==='hostile'||group.status==='hijacked'?'hostile':'aboard',role:'rescued passenger',
  greeting:group.status==='hostile'||group.status==='hijacked'?'An armed hijacker is trying to seize this deck.':`“Thank you for opening the airlock. A berth and a safe port are all we need.”`,
  origin:group.label
 })));
}
export const rescuedBerthCount=ship=>allGroups(ship).reduce((count,group)=>count+(group.members||[]).filter(activeMember).length,0);

function normalizeShip(ship){
 if(!ship)return;
 const seen=new Set();
 ship.rescueGroups=allGroups(ship).filter(group=>group&&typeof group.id==='string'&&group.shipId===ship.id&&Array.isArray(group.members)).slice(0,RESCUE_RULES.maxGroups).map(group=>{
  const members=group.members.slice(0,RESCUE_RULES.maxPeople).filter(member=>member&&typeof member.id==='string'&&!seen.has(member.id)&&(seen.add(member.id),true)).map((member,index)=>{
   const maxHealth=clamp(finite(member.maxHealth,68),1,100),health=clamp(finite(member.health,maxHealth),0,maxHealth);
   return{id:text(member.id),name:text(member.name||names[index%names.length],50),color:/^#[0-9a-f]{6}$/i.test(member.color)?member.color:colors[index%colors.length],
    health,maxHealth,status:health<=0?'dead':member.status==='hostile'?'hostile':'aboard',berthIndex:clamp(Math.floor(finite(member.berthIndex,index+1)),0,9),x:finite(member.x),y:finite(member.y)};
  });
  return{id:text(group.id),shipId:ship.id,encounterId:text(group.encounterId),sourceId:text(group.sourceId),systemId:text(group.systemId),sourceX:finite(group.sourceX),sourceY:finite(group.sourceY),label:text(group.label||'Rescued passengers',60),
   boardedAt:Math.max(0,finite(group.boardedAt)),elapsed:Math.max(0,finite(group.elapsed)),revealAfter:clamp(finite(group.revealAfter,75),30,75),pirates:group.pirates===true,
   status:statuses.has(group.status)?group.status:'aboard',combatId:typeof group.combatId==='string'?text(group.combatId):null,historyRecorded:!!group.historyRecorded,members};
 });
 ship.rescueHistory=(Array.isArray(ship.rescueHistory)?ship.rescueHistory:[]).filter(item=>item&&typeof item.id==='string').slice(-RESCUE_RULES.maxHistory).map(item=>({
  id:text(item.id),label:text(item.label,60),outcome:text(item.outcome,40),people:clamp(Math.floor(finite(item.people)),0,9),systemId:text(item.systemId),bodyId:text(item.bodyId),at:Math.max(0,finite(item.at))
 }));
}
function remember(game,group,outcome,bodyId=null){
 const ship=game.state.ship;ship.rescueHistory||=[];
 if(!ship.rescueHistory.some(item=>item.id===group.id&&item.outcome===outcome))ship.rescueHistory.push({id:group.id,label:group.label,outcome,people:group.members.filter(activeMember).length,systemId:game.state.systemId,bodyId,at:game.state.stats.time});
 ship.rescueHistory=ship.rescueHistory.slice(-RESCUE_RULES.maxHistory);
}
function positions(game,count){
 const layout=cabinLayout(game.state.ship.classId),used=[layout.spawn,layout.archive,layout.manifest,...Object.values(layout.stations),...layout.bunks,...(game.livingCrew||[]).map((_,index)=>layout.crewSpawns[index%layout.crewSpawns.length]),...rescueOccupants(game.state.ship)],points=[];
 const candidates=[...layout.crewSpawns.slice((game.livingCrew||[]).length)];
 for(const room of [...layout.rooms].reverse())for(let y=room.y+1;y<room.y+room.h-1;y++)for(let x=room.x+1;x<room.x+room.w-1;x++)candidates.push({x:(x+.5)*layout.tile,y:(y+.5)*layout.tile});
 for(const point of candidates){if(!isCabinWalkable(layout,point.x,point.y,6)||[...used,...points].some(other=>Math.hypot(other.x-point.x,other.y-point.y)<layout.tile*.9))continue;points.push({x:point.x,y:point.y});if(points.length===count)break;}
 return points;
}

export const RescueRules={
 initializeRescueOccupants(){normalizeShip(this.state.ship);return this.state.ship.rescueGroups;},
 rescuedBerths(ship=this.state.ship){return rescuedBerthCount(ship);},
 rescueManifest(ship=this.state.ship){return rescueOccupants(ship);},
 rescueAdmissionCheck(encounterId,choiceId){
  const spec=rescueSpec(encounterId,choiceId);if(!spec)return this._ok({count:0});
  if(!this.hasActiveVessel||!this.ownsShip&&this._permittedVessel!==this.state.ship||this.state.npcContract?.active)return this._fail('You need command of a real ship with free berths before taking survivors aboard. Call the port rescue service instead.','no-ship');
  const ship=this.state.ship;
  const humans=Math.max(1,Math.floor(finite(ship.humanOccupants,1))),hired=(this.livingCrew||[]).length;
  const occupied=humans+hired+finite(this.narrativeBerths?.())+finite(this.professionBerths?.())+rescuedBerthCount(ship);
  const free=Math.max(0,finite(ship.berths,getShipClass(ship.classId).berths)-occupied);
  if(free<spec.count)return this._fail(`${spec.count} rescued people need ${spec.count} free berths; this ship has ${free}. Call a rescue tug if you cannot carry everyone.`, 'capacity');
  if(allGroups(ship).filter(group=>group.members.some(activeMember)).length>=RESCUE_RULES.maxGroups)return this._fail('Deliver the people already aboard before accepting another rescue group.','capacity');
  if(this.state.boarding?.phase==='active')return this._fail('Clear the hostile boarders before opening the airlock to more passengers.','boarding');
  return this._ok({count:spec.count,free});
 },
 /** Only call after validating the physical encounter/source and its accepted choice. */
 takeRescueOccupants(encounterId,choiceId,source={}){
  const spec=rescueSpec(encounterId,choiceId);if(!spec)return this._fail('This choice does not transfer rescued people.','target');
  const check=this.rescueAdmissionCheck(encounterId,choiceId);if(!check.ok)return check;
  const ship=this.state.ship,systemId=this.state.systemId,sourceId=text(source.sourceId||this.state.pendingEncounter?.sourceId||`${systemId}:${encounterId}`),id=`rescue:${hash(`${systemId}:${sourceId}:${encounterId}`).toString(36)}`;
  ship.rescueGroups||=[];ship.rescueHistory||=[];
  if(ship.rescueGroups.some(group=>group.id===id)||ship.rescueHistory.some(group=>group.id===id))return this._fail('Those people have already left this distress site.','resolved');
  const seats=positions(this,spec.count);if(seats.length<spec.count)return this._fail('There is no clear place to shelter everyone aboard this hull.','capacity');
  const disposition=rescueDisposition(this.state.seed,systemId,sourceId,encounterId),n=hash(`${this.state.seed}:${sourceId}:people`),firstBerth=Math.max(1,Math.floor(finite(ship.humanOccupants,1)))+(this.livingCrew||[]).length+finite(this.narrativeBerths?.())+finite(this.professionBerths?.())+rescuedBerthCount(ship);
  const origin=this.system?.signals?.find(signal=>signal.id===sourceId)||this.system?.traffic?.find(traffic=>traffic.id===sourceId)||ship;
  const group={id,shipId:ship.id,encounterId,sourceId,systemId,sourceX:finite(source.x,origin.x),sourceY:finite(source.y,origin.y),label:spec.label,boardedAt:this.state.stats.time,elapsed:0,...disposition,status:'aboard',combatId:null,historyRecorded:false,
   members:Array.from({length:spec.count},(_,index)=>({id:`${id}:person:${index}`,name:names[(n+index*5)%names.length],color:colors[(n+index)%colors.length],health:68,maxHealth:68,status:'aboard',berthIndex:firstBerth+index,...seats[index]}))};
  ship.rescueGroups.push(group);
  this._log('Passengers rescued',`${spec.count} people crossed the airlock onto ${ship.name||'your ship'}. They are waiting in the cabin for passage to a safe inhabited port.`,'rescue');
  this._event('rescue-passengers',{groupId:id,shipId:ship.id,text:`${spec.count} rescued people are aboard ${ship.name||'your ship'}. You can meet them in the cabin. Dock at an inhabited port to bring them ashore.`});
  return this._ok({groupId:id,count:spec.count,occupants:rescueOccupants(ship).filter(person=>person.groupId===id)});
 },
 /** Called exactly once per simulated hull, including while its captain is on foot. */
 stepRescueOccupants(delta){
  const dt=clamp(finite(delta),0,.25),ship=this.state.ship;if(!dt||!allGroups(ship).length)return;
  this.syncRescueCombat();
  const exposed=this.state.mode==='ship'||!!this.state.interior;
  if(!exposed||ship.destroyed||ship.hull<=0)return;
  for(const group of ship.rescueGroups){
   if(group.status!=='aboard')continue;
   group.elapsed+=dt;
   if(!group.pirates||group.elapsed<group.revealAfter||this.state.boarding?.phase==='active')continue;
   // An on-foot captain on another deck must never be teleported by a rescue.
   // In shared play the actual carrier has its own actor and runs this independently.
   if(this.state.mode!=='ship'&&this.state.interior?.kind!=='ship')continue;
   this._beginRescueHijack(group);break;
  }
 },
 _beginRescueHijack(group){
  if(group.status!=='aboard'||!group.pirates||group.shipId!==this.state.ship.id||this.state.boarding?.phase==='active')return this._fail('That group cannot begin another boarding action.','boarding');
  const ship=this.state.ship;
  if(this.state.mode==='ship'){const entry=this._enterInterior(this._cabinLocation(),'ship');if(!entry.ok)return entry;}
  if(this.state.interior?.kind!=='ship')return this._fail('The hijackers are aboard their carrier, not this deck.','vessel');
  const layout=cabinLayout(ship.classId),id=`boarding:${group.id}:hijack`,vesselId=this.netVesselId||ship.id,leaderId=this._boardingLeaderId||this.playerId;
  const enemies=group.members.filter(activeMember).map(member=>({...copy(member),rescueGuestId:member.id,crewId:member.id,team:'hostile',role:'hijacker',facing:'left',damage:7,cooldown:2.5,speed:52,status:'active'}));
  const allies=(this.livingCrew||[]).map((crew,index)=>({id:`${id}:crew:${crew.id}`,crewId:crew.id,name:crew.name,role:crew.role,...layout.crewSpawns[index%layout.crewSpawns.length],health:crew.health,maxHealth:crew.maxHealth,team:'friendly',color:crew.color,facing:'left',damage:CREW_ROLES[crew.role]?.damage||8,cooldown:.8+index*.15,speed:crew.role==='security'?64:50,status:'active'}));
  group.status='hostile';group.combatId=id;for(const member of group.members)if(activeMember(member))member.status='hostile';
  this.state.boarding={id,kind:'defense',source:'rescued-pirates',rescueGroupId:group.id,phase:'active',shipClass:ship.classId,systemId:this.state.systemId,vesselId,originVesselId:vesselId,targetVesselId:null,locationId:this.state.locationId,targetId:group.id,enemies,allies,elapsed:0,combatTime:this.state.stats.time,unopposedTime:0,startedAt:this.state.stats.time,shotSerial:0,leaderId};
  ensureSidearm(this.state.person);this.state.person.down=false;this.state.person.weaponDrawn=true;this.state.person.lastShot=null;
  this._log('A rescue turns hostile',`${group.members.map(person=>person.name).join(' and ')} drew concealed weapons and moved to seize ${ship.name||'the ship'}. The intruders are already inside the cabin.`,'boarding');
  this._event('boarding',{boarding:this.state.boarding,text:`The rescued passengers have drawn weapons inside ${ship.name||'your ship'}. Stop them before they seize the bridge.`});
  return this._ok({boarding:this.state.boarding});
 },
 syncRescueCombat(){
  const boarding=this.state.boarding;if(!Array.isArray(boarding?.enemies))return;
  for(const group of allGroups(this.state.ship)){
   const matching=group.members.filter(member=>boarding.enemies.some(actor=>actor.rescueGuestId===member.id||actor.id===member.id));
   if(!matching.length)continue;
   for(const member of matching){const actor=boarding.enemies.find(actor=>actor.rescueGuestId===member.id||actor.id===member.id);member.health=clamp(finite(actor.health),0,member.maxHealth);member.x=actor.x;member.y=actor.y;member.status=member.health>0?'hostile':'dead';}
   if(boarding.phase==='won'||boarding.phase==='lost'){
    group.status=boarding.phase==='won'?'defeated':'hijacked';remember(this,group,group.status);group.historyRecorded=true;
   }
  }
 },
 rescueDockCheck(){
  const boarding=this.state.boarding;
  if(boarding?.phase==='active'||allGroups(this.state.ship).some(group=>group.status==='hostile'||group.status==='hijacked'))return this._fail('Armed hijackers still hold the ship. Clear the deck before docking.','boarding');
  const ready=allGroups(this.state.ship).find(group=>group.status==='aboard'&&group.pirates&&group.elapsed>=group.revealAfter);
  if(ready){if(this.state.mode==='ship'||this.state.interior?.kind==='ship')this._beginRescueHijack(ready);return this._fail('The rescued passengers have drawn weapons. Clear the deck before requesting a berth.','boarding');}
  return this._ok();
 },
 /** Docking code must call this for the actual carrier after the physical dock succeeds. */
 disembarkRescuedOccupants(body){
  const ship=this.state.ship,port=this.system?.bodies?.find(candidate=>candidate.id===body?.id);
  if(this.state.mode!=='person'||this.state.interior||this.state.locationId!==port?.id||!hasPort(port))return this._fail('Bring the carrier to an inhabited port before transferring its passengers.','location');
  if(Math.hypot(ship.x-port.x,ship.y-port.y)>finite(port.radius,70)+155)return this._fail('The ship carrying these people has not reached this port.','distance');
  this.syncRescueCombat();
  if(this.state.boarding?.phase==='active'||allGroups(ship).some(group=>group.status==='hostile'||group.status==='hijacked'||group.status==='aboard'&&group.pirates&&group.elapsed>=group.revealAfter))return this._fail('Armed hijackers still hold the ship. Clear the deck before any passenger transfer.','boarding');
  let delivered=0,detained=0;
  for(const group of allGroups(ship)){
   if(group.status==='defeated'){remember(this,group,'defeated',port.id);continue;}
   const count=group.members.filter(activeMember).length;if(!count)continue;
   if(group.pirates){detained+=count;remember(this,group,'detained',port.id);}
   else{delivered+=count;remember(this,group,'delivered',port.id);}
  }
  if(!allGroups(ship).length)return this._ok({delivered:0,detained:0});
  ship.rescueGroups=[];
  if(delivered){this._log('Rescued passengers ashore',`${delivered} rescued people left ${ship.name||'the ship'} at ${port.name}. Their berths are free again.`,'rescue');this._event('rescue-delivered',{text:`${delivered} rescued people are safely ashore at ${port.name}. Their berths are free.`});}
  if(detained){this._log('Concealed weapons at the airlock',`${port.name} security found weapons in the rescued passengers’ belongings during disembarkation. ${detained} would-be hijackers were detained before they could act.`,'rescue');this._event('rescue-detained',{text:`${port.name} security found concealed weapons. The rescued passengers were detained before they could seize your ship.`});}
  return this._ok({delivered,detained});
 }
};
