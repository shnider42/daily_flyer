/** Persistent, local consequences of real hits on a physical hull. No camera rules. */
import { cabinLayout, isCabinWalkable, nearestCabinPoint } from './interior-layouts.mjs';
import { getHullSystems } from './hull-systems.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const layouts=new Map(),normalized=new WeakMap();
const layoutFor=ship=>{const key=ship?.classId||'sparrow';if(!layouts.has(key))layouts.set(key,cabinLayout(key));return layouts.get(key);};
const hullMaximum=ship=>Math.max(1,finite(ship?.maxHull,finite(ship?.maxHp,100)));
const hullHealth=ship=>finite(ship?.hull,finite(ship?.hp,hullMaximum(ship)));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const living=person=>person&&finite(person.health)>0&&person.status!=='dead';
export const DAMAGE_CONTROL_RULES=Object.freeze({version:1,range:72,cooldown:1.2,impactRadius:78,fireRadius:76,breachRadius:96,maxImpacts:6});
export const DAMAGE_CONTROL_ACTIONS=Object.freeze({
 suppress:Object.freeze({label:'Suppress fire',field:'fire',energy:2,ore:0,amount:35,cooldown:1.2,range:72}),
 patch:Object.freeze({label:'Patch breach',field:'breach',energy:3,ore:1,amount:45,cooldown:1.2,range:72}),
 repair:Object.freeze({label:'Repair compartment',field:'damage',energy:4,ore:1,amount:30,cooldown:1.2,range:72})
});

/** Useful for one-time migration after a deck geometry revision. */
export function safeCabinPoint(layout,point){return nearestCabinPoint(layout,finite(point?.x,layout.spawn.x),finite(point?.y,layout.spawn.y),6);}
export function relocateHullOccupants(ship){
 if(!ship)return;const layout=layoutFor(ship);
 for(const person of ship.deck?.enemies||[])Object.assign(person,safeCabinPoint(layout,person));
 for(const group of ship.rescueGroups||[])for(const person of group.members||[])Object.assign(person,safeCabinPoint(layout,person));
}

function roomPoint(layout,room,target){
 let best=null,score=Infinity;
 for(let y=room.y+1;y<room.y+room.h-1;y++)for(let x=room.x+1;x<room.x+room.w-1;x++){
  const point={x:(x+.5)*layout.tile,y:(y+.5)*layout.tile};
  if(!isCabinWalkable(layout,point.x,point.y,6))continue;
  const d=dist(point,target);if(d<score){best=point;score=d;}
 }
 return best||safeCabinPoint(layout,target);
}
function sectionFor(layout,room,prior={}){
 const center={x:(room.x+room.w/2)*layout.tile,y:(room.y+room.h/2)*layout.tile};
 const point=roomPoint(layout,room,{x:finite(prior.x,center.x),y:finite(prior.y,center.y)});
 return{id:room.id,name:room.name,...point,damage:clamp(finite(prior.damage),0,100),fire:clamp(finite(prior.fire),0,100),breach:clamp(finite(prior.breach),0,100)};
}
export function ensureDamageControl(ship){
 if(!ship)return null;
 if(ship.hp!==undefined&&ship.energy===undefined)ship.energy=30;
 const layout=layoutFor(ship),old=ship.damageControl,seen=normalized.get(ship),revision=layout.revision||1;
 if(old&&seen?.state===old&&seen.classId===layout.shipClass&&seen.revision===revision)return old;
 const prior=old&&typeof old==='object'?old:null,sections=Array.isArray(prior?.sections)?prior.sections:[];
 const state={version:1,layoutRevision:revision,clock:Math.max(0,finite(prior?.clock)),serial:Math.max(0,Math.floor(finite(prior?.serial))),
  sections:layout.rooms.map(room=>sectionFor(layout,room,sections.find(value=>value?.id===room.id))),impacts:[]};
 // A compacted deck can merge several old compartments into one room. Keep
 // their strongest recorded hazards instead of repairing them during loading
 // or adding their severities together into a new, more dangerous emergency.
 const migratedIds=new Map();
 for(const orphan of sections){
  if(!orphan||typeof orphan.id!=='string'||state.sections.some(section=>section.id===orphan.id))continue;
  const target=safeCabinPoint(layout,orphan);
  const candidates=layout.rooms.map(room=>({room,point:roomPoint(layout,room,target)})).sort((a,b)=>dist(a.point,target)-dist(b.point,target));
  const destination=candidates[0],section=state.sections.find(section=>section.id===destination?.room.id);if(!section)continue;
  const values=Object.fromEntries(['damage','fire','breach'].map(key=>[key,clamp(finite(orphan[key]),0,100)]));
  const previousSeverity=Math.max(section.damage,section.fire,section.breach);
  if(Math.max(...Object.values(values))>previousSeverity)Object.assign(section,destination.point);
  for(const key of ['damage','fire','breach'])section[key]=Math.max(section[key],values[key]);
  migratedIds.set(orphan.id,section.id);
 }
 // Existing saves gain scars, never surprise fires or retroactive casualties.
 if(!prior){const missing=clamp(1-hullHealth(ship)/hullMaximum(ship),0,1)*100;if(missing>1){const section=state.sections.find(value=>value.id==='engineering')||state.sections[0];if(section)section.damage=missing;}}
 state.impacts=(Array.isArray(prior?.impacts)?prior.impacts:[]).filter(value=>value&&Number.isFinite(value.serial)&&Number.isFinite(value.at)&&value.at<=state.clock&&state.clock-value.at<=4).slice(-6).map(value=>{
  const sectionId=migratedIds.get(value.sectionId)||value.sectionId,section=state.sections.find(item=>item.id===sectionId)||state.sections[0];
  const point=safeCabinPoint(layout,{x:finite(value.x,section?.x),y:finite(value.y,section?.y)});
  return{serial:Math.max(0,Math.floor(value.serial)),at:Math.max(0,value.at),...point,strength:clamp(finite(value.strength),0,1),shieldOnly:!!value.shieldOnly,sectionId:section?.id,hullDamage:Math.max(0,finite(value.hullDamage))};
 });
 ship.damageControl=state;normalized.set(ship,{state,classId:layout.shipClass,revision});return state;
}
export function interiorDamageSummary(ship){
 const state=ship?.damageControl,sections=Array.isArray(state?.sections)?state.sections:[];
 const fireCount=sections.filter(section=>section.fire>.1).length,breachCount=sections.filter(section=>section.breach>.1).length;
 return{sections,fireCount,breachCount,damagedCount:sections.filter(section=>section.damage>1).length,worstDamage:Math.max(0,...sections.map(section=>finite(section.damage))),alarm:fireCount>0||breachCount>0,recentImpact:state?.impacts?.at(-1)||null,clock:finite(state?.clock)};
}
export function impactSection(ship,details={}){
 const layout=layoutFor(ship),state=ensureDamageControl(ship),angle=finite(ship.angle),bullet=details.bullet;
 let dx,dy;
 if(Number.isFinite(details.sourceX)&&Number.isFinite(details.sourceY)){dx=details.sourceX-finite(ship.x);dy=details.sourceY-finite(ship.y);}
 else if(bullet&&Math.hypot(finite(bullet.vx),finite(bullet.vy))>1){dx=-bullet.vx;dy=-bullet.vy;}
 else if(Number.isFinite(details.hitX)&&Number.isFinite(details.hitY)){dx=details.hitX-finite(ship.x);dy=details.hitY-finite(ship.y);}
 else{dx=Math.cos(angle);dy=Math.sin(angle);}
 const length=Math.max(.001,Math.hypot(dx,dy)),forward=(dx*Math.cos(angle)+dy*Math.sin(angle))/length,right=(-dx*Math.sin(angle)+dy*Math.cos(angle))/length;
 const target={x:layout.width*(.5+right*.48),y:layout.height*(.5-forward*.48)};
 const room=layout.rooms.slice().sort((a,b)=>dist({x:(a.x+a.w/2)*layout.tile,y:(a.y+a.h/2)*layout.tile},target)-dist({x:(b.x+b.w/2)*layout.tile,y:(b.y+b.h/2)*layout.tile},target))[0];
 const point=roomPoint(layout,room,target);return{section:state.sections.find(section=>section.id===room.id),point};
}
export function registerShipImpact(ship,{hullDamage=0,shieldDamage=0,...details}={}){
 const total=Math.max(0,finite(hullDamage))+Math.max(0,finite(shieldDamage));if(total<=0)return null;
 const state=ensureDamageControl(ship),{section,point}=impactSection(ship,details),ratio=Math.max(0,hullDamage)/hullMaximum(ship);
 const impact={serial:++state.serial,at:state.clock,...point,strength:clamp(total/hullMaximum(ship)*5,.08,1),shieldOnly:hullDamage<=0,sectionId:section.id,hullDamage:Math.max(0,hullDamage)};
 if(hullDamage>0){
  Object.assign(section,point);section.damage=clamp(section.damage+ratio*180,0,100);
  // Repeated penetrations or a substantial hit may rupture this compartment.
  if(ratio>=.10||section.damage>=30)section.fire=clamp(Math.max(section.fire,18+ratio*160),0,70);
  if(ratio>=.18||section.damage>=52)section.breach=clamp(section.breach+14+ratio*120,0,85);
 }
 state.impacts.push(impact);state.impacts=state.impacts.slice(-6);return impact;
}
export function stepShipDamage(ship,delta){
 const state=ensureDamageControl(ship),dt=clamp(finite(delta),0,.1);if(!state||!dt)return state;
 state.clock+=dt;state.impacts=state.impacts.filter(impact=>state.clock-impact.at<=4);
 // Fires stay local and eventually exhaust their fuel. No random chain reactions.
 for(const section of state.sections)if(section.fire>0)section.fire=Math.max(0,section.fire-dt*.18);
 return state;
}
function openBlastPath(layout,a,b){
 const length=dist(a,b),steps=Math.ceil(length/8);
 for(let i=1;i<steps;i++){const x=Math.floor((a.x+(b.x-a.x)*i/steps)/layout.tile),y=Math.floor((a.y+(b.y-a.y)*i/steps)/layout.tile);if(!layout.floor[y*layout.cols+x])return false;}
 return true;
}
function recoveryPoint(ship){
 const layout=layoutFor(ship),preferred=[layout.stations.medical,layout.spawn].filter(Boolean);
 for(const point of preferred)if(interiorExposure(ship,point,{delta:.1})===0)return point;
 let safest=preferred[0]||layout.spawn,exposure=Infinity;
 for(let i=0;i<layout.walkable.length;i++)if(layout.walkable[i]){
  const point={x:(i%layout.cols+.5)*layout.tile,y:(Math.floor(i/layout.cols)+.5)*layout.tile};
  if(!isCabinWalkable(layout,point.x,point.y,6))continue;
  const danger=interiorExposure(ship,point,{delta:.1});if(!danger)return point;if(danger<exposure){safest=point;exposure=danger;}
 }
 return safest;
}
export function interiorExposure(ship,point,{impact=null,delta=0}={}){
 const state=ship?.damageControl;if(!state||!point)return 0;const layout=layoutFor(ship);
 if(impact){const d=dist(point,impact);return !impact.shieldOnly&&d<DAMAGE_CONTROL_RULES.impactRadius&&openBlastPath(layout,impact,point)?Math.min(26,impact.hullDamage*.7)*(1-d/DAMAGE_CONTROL_RULES.impactRadius):0;}
 let exposure=0;
 for(const section of state.sections){
  if(!section.fire&&!section.breach)continue;const d=dist(point,section);if(!openBlastPath(layout,section,point))continue;
  if(d<DAMAGE_CONTROL_RULES.fireRadius)exposure+=(section.fire/100)*5*(1-d/DAMAGE_CONTROL_RULES.fireRadius);
  if(d<DAMAGE_CONTROL_RULES.breachRadius)exposure+=(section.breach/100)*3.5*(1-d/DAMAGE_CONTROL_RULES.breachRadius);
 }
 return Math.min(7,exposure)*clamp(finite(delta),0,.1);
}
export function repairDamageSection(ship,sectionId,action){
 const spec=DAMAGE_CONTROL_ACTIONS[action],state=ensureDamageControl(ship),section=state?.sections.find(section=>section.id===sectionId);
 if(!spec||!section)return false;section[spec.field]=Math.max(0,section[spec.field]-spec.amount*(getHullSystems(ship.classId).damageControlMultiplier||1));return true;
}
export function clearInteriorDamage(ship){
 const state=ensureDamageControl(ship);for(const section of state.sections){section.damage=0;section.fire=0;section.breach=0;}state.impacts=[];return state;
}

export const InteriorDamageRules={
 initializeInteriorDamage(){
  ensureDamageControl(this.state.ship);
  for(const ship of this.system?.parkedShips||[])ensureDamageControl(ship);
  for(const enemy of this.system?.enemies||[])if(enemy.damageControl||enemy.deck)ensureDamageControl(enemy);
  this.relocateCabinOccupants();
 },
 currentDamageHull(){
  if(this._damageHullOverride)return this._damageHullOverride;
  if(this.state.multiplayer?.aboardVesselId)return this.state.ship;
  if(this.state.interior?.kind==='enemy')return this.system?.enemies?.find(enemy=>enemy.id===(this.state.boarding?.targetId||this.state.interior?.signalId))||null;
  return this.state.ship;
 },
 relocateCabinOccupants(){
  const hull=this.currentDamageHull();if(!hull)return;const layout=layoutFor(hull),interior=this.state.interior;
  if(this.state.mode==='person'&&['ship','enemy'].includes(interior?.kind))Object.assign(this.state.person,safeCabinPoint(layout,this.state.person));
  const boarding=this.state.boarding;if(boarding){const deck=layoutFor({classId:boarding.shipClass});for(const actor of [...(boarding.enemies||[]),...(boarding.allies||[])])Object.assign(actor,safeCabinPoint(deck,actor));}
  for(const ship of [this.state.ship,...(this.system?.parkedShips||[]),...(this.system?.enemies||[])])relocateHullOccupants(ship);
 },
 _interiorOccupants(ship){
  const layout=layoutFor(ship),result=[],seen=new Set(),add=(id,person,point,hurt)=>{if(!living(person)||seen.has(id))return;seen.add(id);result.push({id,person,point,hurt});};
  const actual=this.currentDamageHull(),onDeck=this.state.mode==='ship'||['ship','enemy'].includes(this.state.interior?.kind),humans=this._damageHumans!==undefined?this._damageHumans:actual?.id===ship.id&&onDeck?[this]:[];
  // Restored sleeping games may not yet have a bound network playerId.
  for(const[index,game]of humans.entries()){const p=game.state.person,point=game.state.mode==='ship'?layout.stations.helm:p;
   add(`human:${game.playerId}:${index}`,p,point,amount=>{p.health=Math.max(0,p.health-amount);p.hitUntil=game.state.stats.time+.24;if(p.health<=0){p.down=true;p.interiorDown={vesselId:ship.id,elapsed:0};game._event('person-down',{vesselId:ship.id,text:'You were downed by damage inside the ship. Your emergency medical beacon is active.'});}});
  }
  const boarding=this.state.boarding,aboardBoarding=boarding&&((boarding.vesselId||boarding.targetId)===ship.id||boarding.kind==='defense'&&ship===this.state.ship);
  const crewHere=ship===this.state.ship&&boarding?.kind!=='assault'||aboardBoarding;
  if(crewHere)for(const[index,crew]of(this.state.crew||[]).entries()){
   const actor=this._damageCrewPositions?.find(actor=>actor.crewId===crew.id)||(aboardBoarding?boarding.allies?.find(actor=>actor.crewId===crew.id):null);
   const point=actor||layout.crewSpawns[index%layout.crewSpawns.length];
   add(`crew:${crew.id}`,crew,point,amount=>this._damageCrew(crew.id,amount,'An impact, fire, or pressure leak inside the ship'));
  }
  const enemies=aboardBoarding?boarding.enemies||[]:ship.deck?.enemies||[];
  for(const actor of enemies)add(`person:${actor.rescueGuestId||actor.id}`,actor,actor,amount=>{actor.health=Math.max(0,actor.health-amount);if(!actor.health)actor.status='dead';});
  for(const group of ship.rescueGroups||[])for(const member of group.members||[]){
   const actor=enemies.find(actor=>actor.rescueGuestId===member.id||actor.id===member.id);
   if(actor){member.health=actor.health;member.status=actor.health>0?member.status:'dead';continue;}
   add(`person:${member.id}`,member,member,amount=>{member.health=Math.max(0,member.health-amount);if(!member.health){member.status='dead';this._event('passenger-injured',{vesselId:ship.id,text:`${member.name} died from damage inside ${ship.name||'the ship'}.`});}});
  }
  return result;
 },
 _hurtInteriorOccupants(ship,options){
  for(const occupant of this._interiorOccupants(ship)){
   if(!options.impact&&occupant.person.interiorProtectedUntil>this.state.stats.time)continue;
   const damage=interiorExposure(ship,occupant.point,options);if(damage>0)occupant.hurt(damage);
  }
  if(ship===this.state.ship)this.syncRescueCombat?.();
 },
 _registerInteriorHit(ship,hullDamage,shieldDamage,details={}){
  const impact=registerShipImpact(ship,{...details,hullDamage,shieldDamage});if(!impact)return null;
  if(hullDamage>0)this._hurtInteriorOccupants(ship,{impact});
  return impact;
 },
 stepInteriorDamage(delta){
  const ship=this.state.ship;stepShipDamage(ship,delta);if(ship.hull>0&&!ship.destroyed)this._hurtInteriorOccupants(ship,{delta});
  this._stepInteriorRecovery(delta);
 },
 _stepInteriorRecovery(delta){
  const games=this._damageHumans===undefined?[this]:this._damageHumans;
  for(const game of games){
   const person=game.state.person,casualty=person.interiorDown;if(!casualty)continue;
   if(person.health>0&&!person.down){delete person.interiorDown;continue;}
   if(!this.netOnInteriorCasualty&&game.state.boarding?.phase==='active')continue;
   casualty.elapsed=Math.max(0,finite(casualty.elapsed))+clamp(finite(delta),0,.1);if(casualty.elapsed<5)continue;
   delete person.interiorDown;
   if(this.netOnInteriorCasualty){this.netOnInteriorCasualty(game);continue;}
   const hull=game.currentDamageHull();if(!hull||hull.id!==casualty.vesselId)continue;
   if(game.recoverMilitaryCasualty?.({position:hull,sourceKind:'interior-casualty'}))continue;
   if(game.state.mode==='ship')game._enterInterior(game._cabinLocation(),'ship');
   const recovered=game.state.person,point=recoveryPoint(hull);
   Object.assign(recovered,point,{health:25,down:false,weaponDrawn:false,moving:false});
   if(interiorExposure(hull,point,{delta:.1})>0)recovered.interiorProtectedUntil=game.state.stats.time+5;
   game._event('rescue',{vesselId:hull.id,text:'Emergency medical systems stabilized you in a safer compartment. The ship still needs damage control.'});
  }
 },
 damageControl(sectionId,action){
  const s=this.state,ship=this.currentDamageHull(),spec=DAMAGE_CONTROL_ACTIONS[action];
  if(s.mode!=='person'||!['ship','enemy'].includes(s.interior?.kind)||!ship)return this._fail('Work on damage from inside its actual ship.','mode');
  if(s.person.health<=0||s.person.down)return this._fail('You are incapacitated. Another crew member can help.','incapacitated');
  if(s.pendingEncounter)return this._fail('Close the conversation before starting damage control.','encounter');
  if(!spec)return this._fail('Choose suppression, a breach patch, or a compartment repair.','action');
  const state=ensureDamageControl(ship),section=state.sections.find(section=>section.id===sectionId);
  if(!section||section[spec.field]<=.1)return this._fail('This compartment does not need that treatment.','full');
  if(dist(s.person,section)>DAMAGE_CONTROL_RULES.range)return this._fail('Move within 72 metres of the damaged compartment marker.','distance');
  if(!openBlastPath(layoutFor(ship),s.person,section))return this._fail('A bulkhead blocks the damaged compartment. Move through its doorway first.','blocked');
  if(this._damageControlTimer>0)return this._fail('Let the damage-control tool recharge.','cooldown');
  if(finite(ship.energy)<spec.energy||s.cargo.ore<spec.ore)return this._fail(`${spec.label} needs ${spec.energy} energy${spec.ore?` and ${spec.ore} ore`:''}. You have ${Math.floor(finite(ship.energy))} energy and ${s.cargo.ore} ore.`,'cost');
  ship.energy-=spec.energy;s.cargo.ore-=spec.ore;repairDamageSection(ship,sectionId,action);this._damageControlTimer=DAMAGE_CONTROL_RULES.cooldown;
  this._event('damage-control',{vesselId:ship.id,sectionId,action,text:`${spec.label} · ${section.name}`});
  return this._ok({vesselId:ship.id,sectionId,action,energy:spec.energy,ore:spec.ore,text:`${spec.label} · ${section.name}`});
 }
};
