/** Persistent captain stories. The same guarded actions run locally and on the authority. */
import { FACTIONS } from './content.mjs';
import { QUEST_CONTACTS, QUEST_OBJECTS, QUEST_THREADS, FACTION_RELATIONS, PASSENGER_NAMES, PASSENGER_TYPES, questContact, questObject, questThread } from './quest-content.mjs';
import { generateSurface } from './surface.mjs';
import { liveInteractionSurface, interactionInRange } from './live-surface.mjs';
import { enemyHullProfile } from './fleet.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const integer=(value,min=0,max=1e9)=>clamp(Math.floor(finite(value)),min,max);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const knownFaction=id=>FACTIONS.some(value=>value.id===id);
const hasPort=body=>body&&body.portServices!==false&&body.landable!==false&&!['blackhole','site','ship','derelict'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome)));
const rank=value=>value>=40?'Trusted':value>=15?'Welcomed':value<=-35?'Unwelcome':value<=-15?'Distrusted':'Uncommitted';
const attitude=value=>value>=8?'Trusts you':value>=3?'Warmer toward you':value<=-6?'Keeps their distance':value<=-2?'Wary of you':'Getting to know you';
const time=game=>Math.max(0,finite(game.state.stats?.time));
const genericId=(kind,bodyId)=>`quest:${kind}:${bodyId}`;
const contactIdFrom=value=>String(value||'').replace(/^quest:/,'');
const usable=game=>game.state.mode==='person'&&game.state.person.health>0&&!game.state.person.down;
const bodyFor=game=>game.state.interior?.kind==='site'?game.system.bodies.find(body=>body.id===game.state.exploration?.bodyId):game.system.bodies.find(body=>body.id===game.state.locationId);
const contactTarget=contact=>({systemId:contact.systemId,bodyId:contact.bodyId,...(contact.siteId?{siteId:contact.siteId}:{}),entityId:`quest:${contact.id}`,contactId:contact.id});
const nstate=game=>game.state.narrative||game.initializeNarrative();
const safeText=value=>String(value??'').replace(/[\u0000-\u001f<>]/g,'').slice(0,300);

function normalizeQuest(definition,raw){
 const value=object(raw),completed=value.status==='completed',stage=integer(value.stage,0,definition.stages.length);
 if(!completed&&stage>=definition.stages.length)return null;
 const choices={};
 for(const step of definition.stages){if(step.options?.some(option=>option.id===value.choices?.[step.id]))choices[step.id]=value.choices[step.id];}
 return{status:completed?'completed':'active',stage:completed?definition.stages.length:stage,choices,
  solved:[...new Set((Array.isArray(value.solved)?value.solved:[]).filter(id=>definition.stages.some(step=>step.id===id&&step.kind==='puzzle')))],
  rewardQuote:integer(value.rewardQuote,0,Math.ceil(definition.reward*1.5)),startedAt:Math.max(0,finite(value.startedAt)),finishedAt:completed?Math.max(0,finite(value.finishedAt)):null,
  targetId:typeof value.targetId==='string'&&value.targetId.startsWith('quest-bounty:')?value.targetId.slice(0,180):null,
  huntOutcome:['captured','destroyed'].includes(value.huntOutcome)?value.huntOutcome:null,
  shipId:typeof value.shipId==='string'?value.shipId.slice(0,160):null,
  evacuated:!!value.evacuated,outcome:typeof value.outcome==='string'?safeText(value.outcome):null};
}

export function occupiedNarrativeBerths(game){
 const state=game?.state?.narrative;if(!state)return 0;
 const shipId=game.state.ship?.id;
 let count=state.passenger&&state.passenger.shipId===shipId?1:0;
 const fare=state.quests?.last_fare;
 if(fare?.status==='active'&&fare.stage>=1&&fare.stage<=2&&fare.shipId===shipId)count++;
 const bounty=state.quests?.paper_bounty;
 if(bounty?.status==='active'&&bounty.huntOutcome==='captured'&&bounty.shipId===shipId)count++;
 return count;
}

function capacity(game){
 if(game.ownsShip===false||game.state.npcContract?.active||game.atInhabitedPort&&game.canUseOwnShipHere?.()===false)return 0;
 // Do not use Game.freeBerths: the application subtracts this module's occupants there.
 const crew=(game.livingCrew||[]).length,humans=Math.max(1,finite(game.state.ship.humanOccupants,1));
 return Math.max(0,finite(game.state.ship.berths,game.shipClass?.berths||1)-crew-humans-occupiedNarrativeBerths(game)-finite(game.professionBerths?.())-finite(game.rescuedBerths?.()));
}
function requirements(game,definition){
 const state=nstate(game),need=definition.requires||{},complete=id=>state.quests[id]?.status==='completed';
 if(need.completed?.some(id=>!complete(id)))return false;
 if(need.anyCompleted&&!need.anyCompleted.some(complete))return false;
 if(Object.entries(need.minTrust||{}).some(([id,value])=>(state.relations[id]?.trust||0)<value))return false;
 return true;
}
function locationName(game,target){
 const system=game.galaxy.find(system=>system.id===target?.systemId),body=system?.bodies.find(body=>body.id===target?.bodyId);
 return body?`${body.name} · ${system.name}`:system?.name||'Charted destination';
}
function definitionContact(game,id){
 const known=questContact(id);if(known)return known;
 const body=bodyFor(game);if(!body||!hasPort(body)||game.state.interior)return null;
 if(id===`passage-desk:${body.id}`)return{id,name:'Passage desk',roleLabel:'Local passenger service',systemId:game.state.systemId,bodyId:body.id,text:'Short passages keep this system connected. The passenger travels aboard your own ship; each booking needs one spare berth.',generic:'passage'};
 if(id===`liaison:${body.id}`)return{id,name:'Faction liaison',roleLabel:'Local affiliation office',systemId:game.state.systemId,bodyId:body.id,text:FACTION_RELATIONS[body.faction||game.currentSystem.faction]?.pitch||'Represent a community and carry its obligations with you.',generic:'liaison',factionId:body.faction||game.currentSystem.faction};
 return null;
}
function nearEntity(game,id,target){
 if(!usable(game))return{ok:false,reason:'You must be conscious and on foot to use this contact.',code:'mode'};
 const inSite=game.state.interior?.kind==='site',body=bodyFor(game);
 const wrongPlace=game.state.systemId!==target.systemId||body?.id!==target.bodyId;
 const wrongInterior=target.siteId?(!inSite||game.state.exploration?.siteId!==target.siteId):!!game.state.interior;
 if(wrongPlace||wrongInterior)return{ok:false,reason:'Reach the named place before continuing.',code:'location'};
 if(id!==target.entityId)return{ok:false,reason:'Use the person or object named in this step.',code:'entity'};
 const location=game.state.interior?.location||body,key=`${game.state.systemId}:${game.state.locationId}:${game.state.flags.length}`;
 if(game._narrativeSurfaceCache?.key!==key)game._narrativeSurfaceCache={key,surface:generateSurface(location,game.state.seed,game.state.flags)};
 const surface=liveInteractionSurface(game,game._narrativeSurfaceCache.surface),entity=surface.entities.find(entity=>entity.id===id&&!entity.hidden);
 if(!entity||!interactionInRange(game,surface,entity,46))return{ok:false,reason:'Move closer to that person or object.',code:'distance'};
 return{ok:true,entity};
}
function canPay(game,cost={}){
 if(game.state.credits<(cost.credits||0))return`You need ${cost.credits} cr; you have ${Math.floor(game.state.credits)} cr.`;
 if(game.state.cargo.ore<(cost.ore||0))return`You need ${cost.ore} ore; you have ${game.state.cargo.ore}.`;
 if(game.state.ship.fuel<(cost.fuel||0))return`You need ${cost.fuel} fuel; you have ${Math.floor(game.state.ship.fuel)}.`;
 return null;
}
function remember(game,id,text,trust=0){
 const state=nstate(game);if(!questContact(id))return;
 if(!state.met.includes(id))state.met.push(id);
 const relation=state.relations[id]||={trust:0,memories:[]};
 relation.trust=clamp(relation.trust+trust,-20,20);
 if(text&&relation.memories.at(-1)?.text!==text)relation.memories.push({text:safeText(text),at:Math.round(time(game))});
 relation.memories=relation.memories.slice(-6);
}
function applyEffects(game,effects={},cost={},fallbackContact){
 game.state.credits-=cost.credits||0;game.state.cargo.ore-=cost.ore||0;game.state.ship.fuel-=cost.fuel||0;
 game.state.credits+=effects.credits||0;
 for(const[id,value]of Object.entries(effects.rep||{}))if(knownFaction(id))game.state.rep[id]=clamp((game.state.rep[id]||0)+value,-100,100);
 for(const[id,value]of Object.entries(effects.trust||{}))remember(game,id,effects.memory,value);
 if(effects.memory&&fallbackContact&&!Object.hasOwn(effects.trust||{},fallbackContact))remember(game,fallbackContact,effects.memory,0);
 for(const flag of effects.flags||[])game._flag(`thread:${flag}`);
}
function aliveBounty(game,record){return game.system.enemies.find(enemy=>enemy.id===record.targetId&&enemy.hp>0);}
function choiceForRecord(definition,record,choice){
 if(definition.id!=='paper_bounty'||record.huntOutcome!=='destroyed')return choice;
 const dead={hearing:{label:'Require an independent inquest',detail:'Accept a smaller immediate fee. Rook cannot answer the charge, but the injured worker and unaltered evidence can still be heard.'},employer:{label:'Hand the death record to the employer',detail:'Earn a 70 cr supplement. The employer controls which account of Rook’s death becomes public.'},release:{label:'Publish the forgery and close the warrant',detail:'The false evidence becomes public. It cannot bring Rook back or settle the alleged assault.'}}[choice.id];
 return{...choice,...dead};
}
function stageAccess(game,definition,record,step,action,entityId){
 if((definition.id==='last_fare'&&step.id==='arrival'||definition.id==='paper_bounty'&&step.id==='judgment'&&record.huntOutcome==='captured')&&game.canUseOwnShipHere?.()===false)return{ok:false,reason:'Bring the actual ship carrying this person to this port. A passenger-ferry ticket does not move your ship or its occupants.',code:'vessel'};
 if(definition.id==='last_fare'&&step.id==='arrival'&&record.shipId!==game.state.ship.id)return{ok:false,reason:'Nessa is aboard the ship that accepted this passage. Bring that ship to Morrow.',code:'vessel'};
 if(definition.id==='paper_bounty'&&step.id==='judgment'&&record.huntOutcome==='captured'&&record.shipId!==game.state.ship.id)return{ok:false,reason:'Bring the ship carrying Rook to Kettle before settling the warrant.',code:'vessel'};
 if(step.kind==='hunt'){
  if(game.ownsShip===false||game.state.npcContract?.active)return{ok:false,reason:'This interception requires command of your own physical ship.',code:'no-ship'};
  if(game.state.systemId!==step.at.systemId)return{ok:false,reason:'The target was last sighted in Hearth.',code:'location'};
  if(action==='confirmKill'){
   if(!record.targetId||!game._record().defeated.includes(record.targetId))return{ok:false,reason:'There is no confirmed wreck for this target.',code:'requirements'};
   if(game.state.mode==='ship'&&game.state.ship.hull>0&&game.state.person.health>0&&!game.state.person.down)return{ok:true};
   return nearEntity(game,entityId||'quest:orin-dax',contactTarget(questContact('orin-dax')));
  }
  if(game.state.mode!=='ship'||game.state.ship.hull<=0||game.state.person.health<=0||game.state.person.down)return{ok:false,reason:'Hail the target from the helm of your own ship.',code:'mode'};
  const enemy=aliveBounty(game,record);
  if(!enemy)return{ok:false,reason:'Find the named ship. If it was destroyed, recover the transponder record.',code:'target'};
  if(enemy.promotedVesselId||enemy.canonicalVesselId||enemy.boardingTargetId||enemy.deck?.occupation?.contested)return{ok:false,reason:'The target is occupied or being boarded. Resolve that boarding before transferring a prisoner.',code:'occupied'};
  if(!enemy.disabled)return{ok:false,reason:'Disable the target’s engines before demanding surrender.',code:'requirements'};
  if(distance(game.state.ship,enemy)>220)return{ok:false,reason:'Approach within 220 m to receive the surrender.',code:'distance'};
  if(capacity(game)<1)return{ok:false,reason:'A living prisoner needs one free berth on your own ship.',code:'capacity'};
  return{ok:true,enemy};
 }
 if(step.kind==='ship-scan'){
  if(game.hasActiveVessel===false||game.state.npcContract?.active)return{ok:false,reason:'This reading requires command of an actual survey ship.',code:'no-ship'};
  if(game.state.mode!=='ship'||game.state.systemId!==step.at.systemId||game.state.ship.hull<=0||game.state.person.health<=0||game.state.person.down)return{ok:false,reason:'Take this reading from your ship in Umbra.',code:'location'};
  if(distance(game.state.ship,step.at)>Math.max(140,Math.min(420,game.state.ship.scanRange||235)))return{ok:false,reason:'Fly to the marked outer-contour reading point. You do not need to approach the dark center.',code:'distance'};
  return{ok:true};
 }
 return nearEntity(game,entityId||step.at.entityId,step.at);
}
function view(game,definition,record){
 const status=record?.status||'available',step=definition.stages[record?.stage||0],contact=questContact(definition.offeredBy),target=clone(step?.at||contactTarget(contact));
 if(step?.kind==='hunt'){
  const enemy=record&&aliveBounty(game,record);target.enemyId=record?.targetId||null;target.x=enemy?.x??1460;target.y=enemy?.y??760;
 }
 target.label=locationName(game,target);
 const result={id:definition.id,title:definition.title,category:definition.category,summary:definition.summary,status,stageId:step?.id||null,stageTitle:step?.title||'Recorded',text:status==='completed'?(record.outcome||'This part of your voyage is recorded.'):step?.responses?.[record?.choices?.[step.respondTo]]||step?.text||definition.summary,objective:step?.objective||'Complete',target,actions:[],reward:record?.rewardQuote??Math.round(definition.reward*(game.characterEffects?.jobRewards||1)),contactId:definition.offeredBy};
 if(definition.id==='paper_bounty'&&step?.id==='judgment'&&record?.huntOutcome==='destroyed')result.text='Rook is dead. Orin puts the forged warrant beside the wreck record. You cannot undo the encounter, but you can still decide whether the employer gets to write its only public account.';
 if(definition.id==='borrowed_voice'&&step?.id==='intercom'){
  const answer=nstate(game).quests.nine_knocks?.choices.disposition;
  result.text+=answer==='cut'?' It asks why you cut the Northwatch transmitter.':answer==='broadcast'?' It repeats the exact words you used to open the Northwatch channel.':answer==='seal'?' It thanks you for leaving the Northwatch receiver intact.':'';
 }
 if(definition.id==='rusk_ledger'&&step?.id==='welcome'){
  const answer=nstate(game).quests.salt_debt?.choices.distribution;
  result.text+=answer==='clinic'?' “Silas told me where my medicine went,” she adds. “I hear the patients are doing well. We still need to discuss the invoice.”':answer==='contract'?' “Silas says you honor a contract. That makes this conversation simpler.”':answer==='buyout'?' “You paid a stranger’s debt,” she says. “A generous habit. An expensive one.”':'';
 }
 if(status==='completed'){result.choices=clone(record.choices);result.outcome=record.outcome||definition.summary;return result;}
 if(status==='available'){
  const access=nearEntity(game,target.entityId,target),full=definition.id==='last_fare'&&capacity(game)<1;
  result.actions=[{action:'accept',label:definition.category==='Passing moment'?'Hear them out':'Take this on',available:access.ok&&!full,reason:full?'You need one spare berth for Nessa.':access.reason||null}];return result;
 }
 const access=stageAccess(game,definition,record,step,step.kind==='hunt'?'capture':'advance',target.entityId);
 if(step.kind==='choice')result.actions=step.options.map(raw=>{const option=choiceForRecord(definition,record,raw);return{action:'choose',choiceId:option.id,label:option.label,detail:option.detail,cost:clone(option.cost||{}),available:access.ok&&!canPay(game,option.cost),reason:access.reason||canPay(game,option.cost)};});
 else if(step.kind==='hunt'){
  const dead=stageAccess(game,definition,record,step,'confirmKill');
  result.actions=[{action:'capture',label:'Accept Rook’s surrender',available:access.ok,reason:access.reason},{action:'confirmKill',label:'Recover the wreck’s transponder record',available:dead.ok,reason:dead.reason}];
 }else result.actions=[{action:step.kind==='puzzle'?'solve':'advance',label:step.actionLabel||'Continue',available:access.ok,reason:access.reason}];
 if(step.puzzle){const{solution,...publicPuzzle}=step.puzzle;result.puzzle=clone(publicPuzzle);}
 return result;
}
function finishStep(game,definition,record,text){
 record.stage++;
 if(record.stage>=definition.stages.length){
  record.status='completed';record.finishedAt=time(game);record.outcome=record.outcome||text||definition.summary;
  game.state.credits+=record.rewardQuote;game.state.stats.storyThreads=(game.state.stats.storyThreads||0)+1;
  game._flag(`thread:complete:${definition.id}`);
  game._log(definition.title,`${record.outcome}${record.rewardQuote?` · ${record.rewardQuote} cr paid.`:''}`,'thread');
  game._event('thread-complete',{threadId:definition.id,text:`${definition.title}${record.rewardQuote?` · +${record.rewardQuote} cr`:''}`});
 }else{
  game._event('thread-progress',{threadId:definition.id,text:definition.stages[record.stage].objective});
 }
 game._refreshJobs?.();game.syncNarrativeWorld();
 return game._ok({text:text||definition.stages[Math.min(record.stage,definition.stages.length-1)].text,thread:view(game,definition,record),completed:record.status==='completed',paid:record.status==='completed'?record.rewardQuote:0});
}
function passengerOffer(game,origin,serial){
 if(!origin||!hasPort(origin))return null;
 const choices=game.system.bodies.filter(body=>body.id!==origin.id&&hasPort(body)&&body.id!=='earth');
 if(!choices.length)return null;
 const h=hash(`${game.state.seed}:${game.state.systemId}:${origin.id}:passenger:${serial}`),destination=choices[h%choices.length],type=PASSENGER_TYPES[(h>>>4)%PASSENGER_TYPES.length],faction=origin.faction||game.currentSystem.faction||'freewake';
 const pledgeBonus=nstate(game).pledge===faction?1.12:1,standingBonus=(game.state.rep[faction]||0)>=30?1.05:1;
 const fare=Math.round((type.base+Math.ceil(distance(origin,destination)/100)*2)*pledgeBonus*standingBonus*(game.characterEffects?.jobRewards||1));
 return{id:`passenger:${game.state.systemId}:${origin.id}:${serial}`,serial,name:PASSENGER_NAMES[(h>>>8)%PASSENGER_NAMES.length],type:type.id,title:type.label,text:type.text,comfort:type.comfort,conditions:type.comfort,faction,
  originSystem:game.state.systemId,originBody:origin.id,targetSystem:game.state.systemId,targetBody:destination.id,targetName:destination.name,sourceEntityId:genericId('passage-desk',origin.id),targetEntityId:genericId('passage-desk',destination.id),fare,bonus:type.bonus,berths:1};
}

export const NarrativeRules={
 initializeNarrative(){
  const raw=object(this.state.narrative),quests={};
  for(const definition of QUEST_THREADS){if(!raw.quests?.[definition.id])continue;const record=normalizeQuest(definition,raw.quests[definition.id]);if(record)quests[definition.id]=record;}
  const relations={};
  for(const contact of QUEST_CONTACTS){const saved=raw.relations?.[contact.id];if(!saved)continue;relations[contact.id]={trust:integer(saved.trust,-20,20),memories:(Array.isArray(saved.memories)?saved.memories:[]).slice(-6).map(memory=>({text:safeText(memory.text),at:Math.max(0,finite(memory.at))}))};}
  const state={version:1,quests,relations,met:[...new Set((Array.isArray(raw.met)?raw.met:[]).filter(id=>!!questContact(id)))],pledge:knownFaction(raw.pledge)?raw.pledge:null,pledgeAt:Math.max(0,finite(raw.pledgeAt)),passenger:null,
   passengerSerial:integer(raw.passengerSerial,0,100000),passengerCompleted:integer(raw.passengerCompleted,0,100000),passengerHistory:(Array.isArray(raw.passengerHistory)?raw.passengerHistory:[]).slice(-12).map(item=>({name:safeText(item.name),destination:safeText(item.destination),paid:integer(item.paid,0,500),at:Math.max(0,finite(item.at))}))};
  const prior=object(raw.passenger),originSystem=this.galaxy.find(system=>system.id===prior.originSystem),targetSystem=this.galaxy.find(system=>system.id===prior.targetSystem),origin=originSystem?.bodies.find(body=>body.id===prior.originBody),target=targetSystem?.bodies.find(body=>body.id===prior.targetBody),type=PASSENGER_TYPES.find(type=>type.id===prior.type);
  if(hasPort(origin)&&hasPort(target)&&origin.id!==target.id&&originSystem.id===targetSystem.id&&typeof prior.shipId==='string'&&type)state.passenger={...Object.fromEntries(['id','type','originSystem','originBody','targetSystem','targetBody','shipId'].map(key=>[key,safeText(prior[key])])),faction:knownFaction(prior.faction)?prior.faction:originSystem.faction,name:safeText(prior.name),title:type.label,text:type.text,comfort:type.comfort,conditions:type.comfort,targetName:target.name,sourceEntityId:genericId('passage-desk',origin.id),targetEntityId:genericId('passage-desk',target.id),fare:integer(prior.fare,0,500),bonus:integer(prior.bonus,0,30),hullAtPickup:clamp(finite(prior.hullAtPickup,1),1,10000),damageTaken:clamp(finite(prior.damageTaken),0,10000),pickedAt:Math.max(0,finite(prior.pickedAt)),serial:integer(prior.serial,0,100000),berths:1};
  this.state.narrative=state;return state;
 },
 narrativeBerths(){return occupiedNarrativeBerths(this);},
 narrativeBoard(){
  const state=nstate(this),active=[],available=[],completed=[];
  for(const definition of QUEST_THREADS){const record=state.quests[definition.id];if(record?.status==='completed'){completed.push(view(this,definition,record));continue;}if(record){active.push(view(this,definition,record));continue;}const contact=questContact(definition.offeredBy);if(requirements(this,definition)&&(state.met.includes(contact.id)||(this.state.systemId===contact.systemId&&bodyFor(this)?.id===contact.bodyId&&!this.state.interior)))available.push(view(this,definition,null));}
  const contacts=state.met.map(id=>{const contact=questContact(id),relation=state.relations[id];return{...contact,trust:relation?.trust||0,attitude:attitude(relation?.trust||0),lastMemory:relation?.memories.at(-1)?.text||'You have met, but have not shared much history yet.'};});
  const factions=FACTIONS.map(faction=>{
   const standing=this.state.rep[faction.id]||0,pledged=state.pledge===faction.id,pledgeCost=state.pledge&&!pledged?75:0,cooldownRemaining=state.pledge&&!pledged?Math.max(0,Math.ceil(180-(time(this)-state.pledgeAt))):0;
   const pledgeReason=pledged?'You already represent this faction.':standing<-15?'Repair your standing to at least -15 before asking to represent this faction.':cooldownRemaining?`You can change affiliation in ${cooldownRemaining} seconds of voyage time.`:this.state.credits<pledgeCost?`Changing affiliation costs ${pledgeCost} cr; you have ${Math.floor(this.state.credits)} cr.`:null;
   return{id:faction.id,name:faction.name,color:faction.color,standing,rank:rank(standing),pledged,pledgeCost,cooldownRemaining,pledgeAvailable:!pledgeReason,pledgeReason,...FACTION_RELATIONS[faction.id]};
  });
  return{active,available,completed,contacts,factions,pledge:state.pledge,passenger:state.passenger?clone(state.passenger):null,passengerCompleted:state.passengerCompleted};
 },
 contactThreads(contactId){
  const state=nstate(this),contact=definitionContact(this,contactId);if(!contact)return[];
  return QUEST_THREADS.flatMap(definition=>{const record=state.quests[definition.id];if(record?.status==='completed')return[];if(record){const step=definition.stages[record.stage];return step?.at?.contactId===contactId||(step?.kind==='hunt'&&definition.offeredBy===contactId)?[view(this,definition,record)]:[];}return definition.offeredBy===contactId&&requirements(this,definition)?[view(this,definition,null)]:[];});
 },
 inspectContact(entityId){
  const id=contactIdFrom(entityId),contact=definitionContact(this,id);if(!contact)return this._fail('That contact is not here.','target');
  const access=nearEntity(this,entityId,contactTarget(contact));if(!access.ok)return this._fail(access.reason,access.code);
  const dialogue=this.conversation?.(access.entity,{time:this._npcTime?.()??this.state.npcLife?.time??this.state.stats.time});
  const state=nstate(this);if(!contact.generic){if(!state.met.includes(id)){state.met.push(id);this.recordActivity?.('talk',{role:'contact',token:entityId});}remember(this,id,null,0);}
  const relation=state.relations[id],board=this.narrativeBoard();
  return this._ok({dialogue,contact:{...contact,greeting:dialogue?.greeting||contact.text,activity:dialogue?.activity,relationship:dialogue?.relationship,trust:relation?.trust||0,attitude:attitude(relation?.trust||0),lastMemory:relation?.memories.at(-1)?.text||null},threads:this.contactThreads(id),passengers:contact.generic==='passage'?this.passengerOffers():[],passenger:contact.generic==='passage'&&state.passenger?clone(state.passenger):null,factions:contact.generic==='liaison'?board.factions.filter(faction=>faction.id===contact.factionId):[],pledge:state.pledge});
 },
 inspectQuestObject(entityId){
  const id=contactIdFrom(entityId),definition=questObject(id);if(!definition)return this._fail('That object is not part of this place.','target');
  const access=nearEntity(this,entityId,{...definition,entityId});if(!access.ok)return this._fail(access.reason,access.code);
  const state=nstate(this),threads=QUEST_THREADS.flatMap(thread=>{const record=state.quests[thread.id];return record?.status==='active'&&thread.stages[record.stage]?.at?.objectId===id?[view(this,thread,record)]:[];});
  return this._ok({object:clone(definition),threads});
 },
 threadAction({threadId,action='advance',choiceId,entityId,solution}={}){
  const definition=questThread(threadId),state=nstate(this);if(!definition)return this._fail('That story is not available.','target');
  let record=state.quests[threadId];
  if(action==='accept'){
   if(record)return this._fail('You have already taken this on.','duplicate');
   if(!requirements(this,definition))return this._fail('This person is not ready to bring you into that matter.','requirements');
   const target=contactTarget(questContact(definition.offeredBy)),access=nearEntity(this,entityId||target.entityId,target);if(!access.ok)return this._fail(access.reason,access.code);
   if(Object.values(state.quests).filter(q=>q.status==='active').length>=8)return this._fail('Finish some of your current commitments before taking on another.','capacity');
   if(threadId==='last_fare'&&capacity(this)<1)return this._fail('Nessa needs one spare berth on your own ship.','capacity');
   record={status:'active',stage:0,choices:{},solved:[],rewardQuote:Math.round(definition.reward*(this.characterEffects?.jobRewards||1)),startedAt:time(this),finishedAt:null,targetId:null,huntOutcome:null,shipId:this.state.ship.id,evacuated:false,outcome:null};state.quests[threadId]=record;
   remember(this,definition.offeredBy,`You agreed to help with “${definition.title}”.`,1);this._log(definition.title,definition.summary,'thread');
   // Acceptance does not silently choose a moral outcome or solve an opening puzzle.
   if(definition.stages[0].kind==='talk')return finishStep(this,definition,record,definition.stages[0].text);
   return this._ok({text:definition.stages[0].text,thread:view(this,definition,record)});
  }
  if(!record||record.status!=='active')return this._fail('There is no unfinished step in that story.','duplicate');
  const step=definition.stages[record.stage];
  const expected=step.kind==='choice'?'choose':step.kind==='puzzle'?'solve':step.kind==='hunt'?null:'advance';
  if(expected&&action!==expected||step.kind==='hunt'&&!['capture','confirmKill'].includes(action))return this._fail('That action does not belong to the current step.','action');
  const access=stageAccess(this,definition,record,step,action,entityId);if(!access.ok)return this._fail(access.reason,access.code);
  if(step.kind==='choice'){
   const rawChoice=step.options.find(option=>option.id===choiceId);if(!rawChoice)return this._fail('Choose one of this person’s actual offers.','choice');
   const choice=choiceForRecord(definition,record,rawChoice);
   const missing=canPay(this,choice.cost);if(missing)return this._fail(missing,'cost');
   record.choices[step.id]=choice.id;record.outcome=choice.effects.memory||choice.detail;
   applyEffects(this,choice.effects,choice.cost,step.at.contactId);this._log(step.title,`${choice.label}. ${choice.detail}`,'decision');
   return finishStep(this,definition,record,`${choice.label}. ${choice.detail}`);
  }
  if(step.kind==='puzzle'){
   if(!Array.isArray(solution)||solution.length!==step.puzzle.solution.length||solution.some((value,index)=>String(value)!==step.puzzle.solution[index]))return this._fail('The evidence does not fit that arrangement. Review the clues and try again.','puzzle');
   record.solved.push(step.id);this._event('thread-puzzle',{threadId,text:'The pattern holds. The result is recorded.'});
  }
  if(step.kind==='hunt'){
   record.huntOutcome=action==='capture'?'captured':'destroyed';record.shipId=this.state.ship.id;
   if(action==='capture'){
    const target=access.enemy,world=this._record();world.defeated.push(target.id);world.spawned=world.spawned.filter(enemy=>enemy.id!==target.id);delete world.enemyHealth[target.id];delete world.enemyStates[target.id];
    const index=this.system.enemies.indexOf(target);if(index>=0)this.system.enemies.splice(index,1);
    this._event('bounty-surrender',{targetId:target.id,text:'Rook surrendered. One berth is occupied until the warrant is settled.'});
   }
   remember(this,'orin-dax',action==='capture'?'You took Rook alive after disabling the ship.':'Rook’s ship was destroyed before the warrant could be heard.',action==='capture'?2:-1);
  }
  const response=step.responses?.[record.choices[step.respondTo]];
  if(step.at.contactId)remember(this,step.at.contactId,response||`You discussed ${step.title.toLowerCase()}.`,0);
  return finishStep(this,definition,record,step.kind==='hunt'?(action==='capture'?'Rook is aboard. Return to Orin at Kettle.':'The wreck’s transponder and unaltered camera evidence are ready for Orin.'):response||step.text);
 },
 syncNarrativeWorld(){
  const state=this.state.narrative,record=state?.quests?.paper_bounty;if(!record||record.status!=='active'||record.stage!==2||this.state.systemId!=='hearth')return;
  record.targetId||=`quest-bounty:${this.playerId}:${this.state.ship.id}`.slice(0,180);
  const world=this._record();if(world.defeated.includes(record.targetId)||this.system.enemies.some(enemy=>enemy.id===record.targetId))return;
  // Restored records are loaded by Game._loadSystem. Never mint a second target.
  const prior=world.spawned.find(enemy=>enemy.id===record.targetId);
  const enemy=prior?{...clone(prior),...(world.enemyStates?.[record.targetId]||{}),hp:world.enemyHealth?.[record.targetId]??prior.hp}:{id:record.targetId,name:'Rook · Borrowed Luck',faction:'cinder',...enemyHullProfile('kestrel'),x:1460,y:760,vx:0,vy:0,angle:-2.8,hp:72,maxHp:72,cooldown:1.7,speed:92,damage:6,reward:0,active:false,questTarget:true,questOwner:this.playerId};
  if(!prior)world.spawned.push(clone(enemy));
  this.system.enemies.push(enemy);
 },
 passengerOffers(){
  const state=nstate(this);if(!this.atInhabitedPort||state.passenger)return[];
  const offer=passengerOffer(this,bodyFor(this),state.passengerSerial);return offer?[{...offer,available:capacity(this)>=1&&!(this.state.rep[offer.faction]<-35),reason:capacity(this)<1?'A passenger needs one free berth.':this.state.rep[offer.faction]<-35?'The local dispatch office will not book your ship at this standing.':null}]:[];
 },
 acceptPassenger(offerId,entityId){
  const vesselAccess=this.ownShipAccess?.({atPort:true});if(vesselAccess&&!vesselAccess.ok)return vesselAccess;
  const state=nstate(this);if(state.passenger)return this._fail('Deliver your current passenger before taking another fare.','capacity');
  const origin=bodyFor(this),target={systemId:this.state.systemId,bodyId:origin?.id,entityId:genericId('passage-desk',origin?.id)},access=nearEntity(this,entityId,target);if(!access.ok)return this._fail(access.reason,access.code);
  if(!this.atInhabitedPort)return this._fail('Passenger bookings require an inhabited port.','mode');
  const offer=this.passengerOffers().find(value=>value.id===offerId);if(!offer)return this._fail('That fare is no longer waiting here.','target');
  if(!offer.available)return this._fail(offer.reason,'capacity');
  state.passenger={...offer,shipId:this.state.ship.id,hullAtPickup:this.state.ship.hull,damageTaken:0,pickedAt:time(this)};state.passengerSerial++;
  this._log('Passenger aboard',`${offer.name} · ${offer.targetName}. Agreed fare ${offer.fare} cr, plus up to ${offer.bonus} cr for a smooth passage.`,'passage');
  this._event('passenger-boarded',{text:`${offer.name} is aboard · ${offer.targetName} · ${offer.fare} cr fare`});
  return this._ok({passenger:clone(state.passenger),text:`${offer.name} is aboard. Deliver them to the passage desk at ${offer.targetName}.`});
 },
 recordPassengerDamage(amount){const passenger=this.state.narrative?.passenger;if(passenger&&passenger.shipId===this.state.ship.id)passenger.damageTaken+=Math.max(0,finite(amount));},
 narrativeRescue(){
  const state=this.state.narrative;if(!state)return;
  if(state.passenger){this._log('Passenger evacuated',`${state.passenger.name} reached rescue transport. The interrupted passage pays no fare.`,'passage');state.passenger=null;}
  for(const id of ['last_fare','paper_bounty']){const record=state.quests[id];if(!record||record.status!=='active')continue;
   if(id==='last_fare'&&record.stage>=1&&record.stage<=2||id==='paper_bounty'&&record.huntOutcome==='captured'){
    record.shipId=this.state.ship.id;record.evacuated=true;
    this._log('A berth on the recovery ship',id==='last_fare'?'Nessa survived in the rescue capsule. Her passage continues aboard your recovery ship.':'Rook survived the evacuation in custody. The warrant still needs a hearing.','passage');
   }
  }
 },
 deliverPassenger(entityId){
  const state=nstate(this),passenger=state.passenger;if(!passenger)return this._fail('There is no passenger to deliver.','target');
  const target={systemId:passenger.targetSystem,bodyId:passenger.targetBody,entityId:passenger.targetEntityId},access=nearEntity(this,entityId,target);if(!access.ok)return this._fail(access.reason,access.code);
  if(this.canUseOwnShipHere?.()===false)return this._fail('Bring the actual ship carrying this passenger to this port. Your own ferry ticket does not deliver them.','vessel');
  if(this.state.ship.id!==passenger.shipId)return this._fail('Bring the ship carrying this passenger to their destination.','vessel');
  const safe=passenger.damageTaken===0&&this.state.ship.hull>=passenger.hullAtPickup,tip=safe?passenger.bonus:0,paid=passenger.fare+tip;
  this.state.credits+=paid;state.passengerCompleted++;this.state.stats.passengers=(this.state.stats.passengers||0)+1;
  if(knownFaction(passenger.faction)){this.state.rep[passenger.faction]=clamp((this.state.rep[passenger.faction]||0)+2,-100,100);if(state.pledge===passenger.faction){const rival=FACTION_RELATIONS[passenger.faction].rivalId;this.state.rep[rival]=clamp((this.state.rep[rival]||0)-1,-100,100);}}
  state.passengerHistory.push({name:passenger.name,destination:passenger.targetName,paid,at:Math.round(time(this))});state.passengerHistory=state.passengerHistory.slice(-12);state.passenger=null;
  this._log('Passage complete',`${passenger.name} reached ${passenger.targetName}. ${passenger.fare} cr fare${tip?` + ${tip} cr smooth-passage tip`:'. Hull damage cost the optional tip'}.`,'passage');
  this._event('passenger-delivered',{text:`Passage complete · +${paid} cr`});return this._ok({paid,tip,text:`${passenger.name} is safely ashore. ${paid} cr paid${tip?' including the smooth-passage tip':''}.`});
 },
 abandonPassenger(){
  const state=nstate(this),passenger=state.passenger;if(!passenger)return this._fail('There is no passenger booking to end.','target');
  if(!this.atInhabitedPort)return this._fail('Reach an inhabited passage desk to arrange a safe end to the booking.','mode');
  if(this.canUseOwnShipHere?.()===false)return this._fail('Bring the passenger’s ship to this port before arranging their disembarkation.','vessel');
  const body=bodyFor(this),access=nearEntity(this,genericId('passage-desk',body.id),{systemId:this.state.systemId,bodyId:body.id,entityId:genericId('passage-desk',body.id)});if(!access.ok)return this._fail(access.reason,access.code);
  state.passenger=null;this._log('Booking ended',`${passenger.name} disembarked at ${body.name}. No fare was paid.`,'passage');return this._ok({text:'The passenger has disembarked safely. No fare was paid.'});
 },
 pledgeFaction(factionId,entityId){
  const state=nstate(this),body=bodyFor(this),faction=body?.faction||this.currentSystem.faction;
  if(!knownFaction(factionId)||factionId!==faction)return this._fail('This liaison represents the local faction only.','faction');
  const access=nearEntity(this,entityId,{systemId:this.state.systemId,bodyId:body?.id,entityId:genericId('liaison',body?.id)});if(!access.ok)return this._fail(access.reason,access.code);
  if(!this.atInhabitedPort)return this._fail('Visit an inhabited faction office to pledge support.','mode');
  if(state.pledge===factionId)return this._fail('You already represent this faction.','duplicate');
  if((this.state.rep[factionId]||0)<-15)return this._fail('Repair your reputation with this faction before asking to represent it.','reputation');
  const switching=!!state.pledge,cost=switching?75:0;
  if(switching&&time(this)-state.pledgeAt<180)return this._fail('Give your current commitment three minutes of voyage time before changing allegiance.','cooldown');
  if(this.state.credits<cost)return this._fail(`Changing affiliation costs ${cost} cr; you have ${Math.floor(this.state.credits)} cr.`,'cost');
  this.state.credits-=cost;
  if(switching)this.state.rep[state.pledge]=clamp((this.state.rep[state.pledge]||0)-8,-100,100);
  state.pledge=factionId;state.pledgeAt=time(this);
  const rival=FACTION_RELATIONS[factionId].rivalId;this.state.rep[rival]=clamp((this.state.rep[rival]||0)-4,-100,100);
  const name=FACTIONS.find(f=>f.id===factionId).name;
  this._log('A public commitment',`You pledged support to ${name}. ${FACTION_RELATIONS[factionId].benefit}`,'faction');
  this._event('faction-pledged',{factionId,text:`Now representing ${name}`});return this._ok({factionId,cost,text:`You now represent ${name}. ${FACTION_RELATIONS[factionId].benefit} Its rival has noticed.`});
 }
};
