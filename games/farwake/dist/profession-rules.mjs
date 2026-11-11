/** Repeatable civilian and faction work, shared by solo and the multiplayer authority. */
import { FACTIONS } from './content.mjs';
import { generateSurface } from './surface.mjs';
import { liveInteractionSurface } from './live-surface.mjs';
import { enemyHullProfile, getShipClass } from './fleet.mjs';
import { directorBoard, directorEvent, recordDirectorAid } from './world-director.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const integer=(value,max=1e8)=>clamp(Math.floor(finite(value)),0,max);
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const time=game=>Math.max(0,finite(game.state.stats?.time));
const stateFor=game=>game.state.professions||game.initializeProfessions();
const port=body=>body&&body.portServices!==false&&body.landable!==false&&!['blackhole','site','ship','derelict'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome)));
const faction=id=>FACTIONS.find(value=>value.id===id);
const rival={concord:'cinder',freewake:'meridian',meridian:'freewake',lantern:'cinder',cinder:'concord'};
const deskId=bodyId=>`quest:profession-desk:${bodyId}`;
const currentBody=game=>!game.state.interior&&game.system.bodies.find(body=>body.id===game.state.locationId);
const target=(systemId,bodyId)=>({systemId,bodyId,entityId:deskId(bodyId)});
const phaseSets={paramedic:['pickup','admit'],doctor:['triage'],law:['investigate','decision','intercept','report'],military:['patrol','report']};
const rankNames={paramedic:['Probationary responder','Flight paramedic','Senior responder','Rescue lead'],doctor:['Clinic associate','Duty physician','Senior physician','Clinic lead'],law:['Community auxiliary','Patrol officer','Investigator','Watch commander'],military:['Volunteer','Fleet specialist','Veteran','Section leader']};
const rankAt=xp=>xp>=16?3:xp>=8?2:xp>=3?1:0;
const rankBonus=[1,1.10,1.20,1.35];

export const MILITARY_ESCORT_PATROLS=3;
export const MILITARY_HOSTILE_STANDING=-25;

/** Clearance belongs to the serving captain, never to a painted hull or a guest's claim. */
export function militaryPortAccess(game,factionId){
 const employer=faction(factionId),career=game.state.professions?.careers?.military;
 if(!employer)return{ok:false,code:'military-clearance',reason:'This base has not issued a recognized landing clearance.'};
 if(!career?.enlisted||career.factionId!==factionId)return{ok:false,code:'military-clearance',reason:`${employer.name} service clearance required. Enlist for military duty at one of its public-services desks.`};
 if(finite(game.state.rep?.[factionId])<=MILITARY_HOSTILE_STANDING)return{ok:false,code:'military-standing',reason:`${employer.name} has suspended your base clearance while your standing is hostile.`};
 return{ok:true,factionId,reason:null};
}

export const PROFESSIONS=Object.freeze([
 Object.freeze({id:'paramedic',name:'Paramedic',description:'Fly to another port, collect one patient, and return them to the dispatching hospital. One real spare berth is required.',cost:18,reward:150}),
 Object.freeze({id:'doctor',name:'Doctor',description:'Work a clinic shift through three scanner and isolation puzzles. No ship is needed.',cost:20,reward:100}),
 Object.freeze({id:'law',name:'Law enforcement',description:'Investigate a complaint at another port. Decide whether to enforce the order or protect a civilian; arrest requires a disabled ship to surrender.',cost:12,reward:165}),
 Object.freeze({id:'military',name:'Military',description:'Serve a faction on patrol or answer a live distress call. Pay requires an actual combat contribution; service affects rival standing.',cost:25,reward:225})
]);
const profession=id=>PROFESSIONS.find(value=>value.id===id);

function access(game,entityId,where=null){
 if(game.state.mode!=='person'||game.state.person.health<=0||game.state.person.down||game.state.interior)return{ok:false,reason:'Visit an outdoor public-services desk on foot.',code:'mode'};
 const body=currentBody(game);if(!port(body))return{ok:false,reason:'This place has no public-services desk.',code:'location'};
 if(where&&(where.systemId!==game.state.systemId||where.bodyId!==body.id))return{ok:false,reason:'Visit the port named in this assignment.',code:'location'};
 const id=deskId(body.id);if(entityId!==id)return{ok:false,reason:'Use the clinic and public-services contact.',code:'entity'};
 const key=`${game.state.systemId}:${body.id}:${game.state.flags.length}`;
 if(game._professionSurfaceCache?.key!==key)game._professionSurfaceCache={key,surface:generateSurface(body,game.state.seed,game.state.flags)};
 const entity=liveInteractionSurface(game,game._professionSurfaceCache.surface).entities.find(entity=>entity.id===id&&entity.type==='npc'&&entity.data?.professionDesk&&!entity.hidden);
 if(!entity||distance(entity,game.state.person)>46)return{ok:false,reason:'Move closer to the public-services contact.',code:'distance'};
 return{ok:true,body,entity};
}
function ownShipHere(game,job){
 const body=currentBody(game),ship=game.state.ship;
 return !!(game.ownsShip!==false&&!game.state.npcContract?.active&&game.canUseOwnShipHere?.()!==false&&body&&ship.id===job.shipId&&ship.hull>0&&distance(ship,body)<=body.radius+160);
}
function spareBerths(game){
 if(game.ownsShip===false||game.state.npcContract?.active||game.atInhabitedPort&&game.canUseOwnShipHere?.()===false)return 0;
 const humans=Math.max(1,finite(game.state.ship.humanOccupants,1)),crew=(game.livingCrew||[]).length,narrative=game.narrativeBerths?.()||0;
 return Math.max(0,finite(game.state.ship.berths,1)-humans-crew-narrative-game.professionBerths()-finite(game.rescuedBerths?.()));
}
function atName(game,where){const system=game.galaxy.find(s=>s.id===where?.systemId),body=system?.bodies.find(b=>b.id===where?.bodyId);return body?`${body.name} · ${system.name}`:'The named service desk';}
function employerAt(game,body){return body?.faction||game.currentSystem.faction||'freewake';}
function wrongEmployer(game,definition,body){const career=stateFor(game).careers[definition.id];return ['law','military'].includes(definition.id)&&career.enlisted&&career.factionId!==employerAt(game,body)?`Your employer is ${faction(career.factionId)?.name}. Take this shift at one of its ports.`:null;}
function rep(game,id,amount){if(faction(id))game.state.rep[id]=clamp(finite(game.state.rep[id])+amount,-100,100);}
function activeEventFor(game,bodyIds,types=null){return game.worldDirector?.events?.find(event=>event.status==='active'&&event.systemId===game.state.systemId&&bodyIds.includes(event.bodyId)&&(!types||types.includes(event.type)))||null;}
function qualifiedCombat(event,playerId){const evidence=event?.contributors?.[playerId];return !!(evidence&&!evidence.claimed&&evidence.damage>=12);}

function serviceShipOffer(game,entityId){
 const state=stateFor(game),career=state.careers.military,issued=career.serviceShips||[],completed=career.completed;
 const classId=!game.ownsShip&&!issued.includes('sparrow')?'sparrow':completed>=MILITARY_ESCORT_PATROLS&&!issued.includes('marten')?'marten':null;
 const progress=issued.includes('marten')?'Escort commission received.':`${Math.min(completed,MILITARY_ESCORT_PATROLS)} / ${MILITARY_ESCORT_PATROLS} patrols toward an escort commission.`;
 if(!career.enlisted)return{progress:'Enlist to receive base clearance. Shipless recruits can request a patrol cutter.',action:null};
 if(!classId)return{progress,action:null};
 const check=access(game,entityId),clearance=militaryPortAccess(game,career.factionId);
 let reason=!check.ok?check.reason:!clearance.ok?clearance.reason:employerAt(game,check.body)!==career.factionId?'Collect service equipment from your own faction’s public-services desk.':state.active?'Finish or return your current assignment before changing hulls.':game.state.npcContract?.active?'Finish your crew contract before collecting a service hull.':null;
 if(!reason&&game.ownsShip){const location=game.ownShipAccess({atPort:true});if(!location.ok)reason=location.reason;}
 if(!reason&&!game.state.fleet.owned.includes(classId)){const capacity=game._canActivateClass(getShipClass(classId));if(!capacity.ok)reason=capacity.reason;}
 const label=classId==='sparrow'?'Collect patrol cutter · 0 cr':'Collect earned escort · 0 cr';
 return{progress,classId,action:{action:'claimServiceShip',entityId,label,available:!reason,reason}};
}

function offer(game,definition,origin){
 const state=stateFor(game),career=state.careers[definition.id],serial=state.serial;
 if(!origin||!port(origin))return null;
 // A lawful Earth landing may use its clinic. Dispatch never creates a new
 // quarantine-gated destination for a captain who has not earned that landing.
 const other=game.system.bodies.filter(body=>body.id!==origin.id&&body.id!=='earth'&&port(body)&&game.portAccess?.(body)?.ok!==false);
 if(['paramedic','law'].includes(definition.id)&&!other.length)return null;
 const h=hash(`${game.state.seed}:${game.state.systemId}:${origin.id}:${definition.id}:${serial}`),destination=other[h%Math.max(1,other.length)]||origin;
 const rank=rankAt(career?.xp||0),cost=Math.round(definition.cost*(rank>=2?.8:1)),reward=Math.round(definition.reward*rankBonus[rank]*(game.characterEffects?.jobRewards||1));
 const event=definition.id==='military'?game.worldDirector?.events?.find(event=>event.systemId===game.state.systemId&&event.status==='active'&&['raid','clash'].includes(event.type)&&event.factionId===(career?.factionId||origin.faction||game.currentSystem.faction)&&!event.contributors?.[game.playerId]?.claimed):definition.id==='paramedic'?activeEventFor(game,[destination.id,origin.id]):definition.id==='doctor'?activeEventFor(game,[origin.id],['outbreak','rescue']):null;
 return{id:`profession:${definition.id}:${game.playerId}:${serial}`,professionId:definition.id,serial,title:{paramedic:`Patient transfer · ${destination.name}`,doctor:`Clinic shift · ${origin.name}`,law:`Complaint inquiry · ${destination.name}`,military:event?event.title:'Civilian-lane patrol'}[definition.id],text:definition.description,originSystem:game.state.systemId,originBody:origin.id,targetSystem:game.state.systemId,targetBody:event&&definition.id==='military'?event.bodyId:destination.id,factionId:['doctor','paramedic'].includes(definition.id)?employerAt(game,origin):career?.factionId||employerAt(game,origin),cost,reward,eventId:event?.id||null,caseId:h%3,shipId:game.state.ship.id};
}
function triagePuzzle(job){
 const round=integer(job.round,2),rotation=(hash(job.id)+round)%3;
 const cases=[
  {names:['Aster','Bram','Celia'],levels:[3,1,2],clues:['The scanner flags three unstable cells for Aster, one for Bram, and two for Celia.','Assign the first stabilizer pod to the highest scanner count, then work down.']},
  {names:['Daro','Eli','Fenn'],levels:[1,3,2],clues:['Daro’s capsule is green (1), Eli’s is violet (3), and Fenn’s is amber (2).','The clinic controller queues violet before amber, and amber before green.']},
  {names:['Gita','Holl','Iris'],levels:[2,1,3],clues:['Gita’s field battery has 6 ticks remaining. Holl has 12. Iris has 3.','Give the first replacement pod to the lowest remaining battery, then work upward.']}
 ];
 const scenario=cases[(job.caseId+round)%cases.length],items=scenario.names.map((name,index)=>({id:`patient-${index}`,label:name,level:scenario.levels[index]}));
 const options=[...items.slice(rotation),...items.slice(0,rotation)].map(({id,label})=>({id,label}));
 return{public:{type:'sequence',title:'Clinic triage',prompt:`Scanner case ${round+1} of 3 · allocate the stabilizer pods.`,clues:scenario.clues,inputs:[0,1,2].map(index=>({id:`pod-${index}`,label:`Pod ${index+1}`,options}))},solution:[...items].sort((a,b)=>b.level-a.level).map(item=>item.id)};
}
function combatEnemy(game,job){return game.system.enemies.find(enemy=>enemy.id===job.targetId)||game._record().spawned.find(enemy=>enemy.id===job.targetId)||null;}
function ownCombatEvidence(game,job){const enemy=combatEnemy(game,job);return finite(enemy?.professionContributors?.[game.playerId])>=12;}
function nearTarget(game,job){
 if(game.state.mode!=='ship'||game.state.ship.hull<=0||game.state.systemId!==job.targetSystem)return{ok:false,reason:'Take the helm in the marked system.',code:'mode'};
 const enemy=game.system.enemies.find(enemy=>enemy.id===job.targetId&&enemy.hp>0);
 if(!enemy)return{ok:false,reason:'Find the marked ship; its transponder is on your assignment.',code:'target'};
 if(enemy.promotedVesselId||enemy.canonicalVesselId||enemy.boardingTargetId||enemy.deck?.occupation)return{ok:false,reason:'Resolve the boarding before accepting surrender.',code:'occupied'};
 if(!enemy.disabled)return{ok:false,reason:'Disable the named ship, then approach to demand surrender.',code:'requirements'};
 if(distance(game.state.ship,enemy)>220)return{ok:false,reason:'Approach within 220 m of the disabled ship.',code:'distance'};
 if(!ownCombatEvidence(game,job))return{ok:false,reason:'Your patrol must contribute to disabling this ship.',code:'contribution'};
 return{ok:true,enemy};
}
function patrolReady(game,job){
 if(game.state.mode!=='ship'||game.state.systemId!==job.targetSystem||game.state.ship.hull<=0)return{ok:false,reason:'Confirm the patrol from the helm in the assigned system.',code:'mode'};
 if(job.eventId){const event=directorEvent(game.worldDirector,job.eventId);return qualifiedCombat(event,game.playerId)&&(event.progress>=event.required||event.status==='resolved')?{ok:true,event}:{ok:false,reason:'Contribute at least 12 hull damage and help finish the live engagement.',code:'contribution'};}
 const enemy=combatEnemy(game,job),defeated=game._record().defeated.includes(job.targetId);
 return ownCombatEvidence(game,job)&&(defeated||enemy?.disabled||enemy?.hp<=0)?{ok:true,enemy}:{ok:false,reason:'Disable or defeat the marked interdiction ship through real combat.',code:'requirements'};
}
function actionView(game,job,action,label,check,extra={}){return{action,jobId:job.id,eventId:job.eventId||undefined,label,available:!!check.ok,reason:check.reason||null,...extra};}
function jobView(game,job){
 let where=target(job.targetSystem,job.targetBody),objective='',text=job.text,actions=[],puzzle;
 if(job.professionId==='paramedic'){
  where=job.phase==='admit'?target(job.originSystem,job.originBody):where;const check=access(game,where.entityId,where);
  if(check.ok&&!ownShipHere(game,job)){check.ok=false;check.reason='Bring the ship assigned to this patient to the same port.';}
  if(check.ok&&job.phase==='pickup'&&spareBerths(game)<1){check.ok=false;check.reason='The patient needs one free berth.';}
  objective=job.phase==='pickup'?`Collect the patient at ${atName(game,where)}.`:`Return the patient to ${atName(game,where)} for admission.`;
  text=job.phase==='admit'?'The patient is aboard your assigned ship. Their seat stays reserved until hospital admission.':'Dispatch has reserved a patient at the other port. Fly there and meet the services contact before returning to this hospital.';
  actions=[actionView(game,job,job.phase==='pickup'?'pickupPatient':'admitPatient',job.phase==='pickup'?'Collect patient aboard assigned ship':'Admit patient to this hospital',check)];
 }else if(job.professionId==='doctor'){
  where=target(job.originSystem,job.originBody);objective=`Clinic case ${job.round+1} of 3 at ${atName(game,where)}.`;puzzle=triagePuzzle(job).public;
  actions=[actionView(game,job,'triage','Check the pod order',access(game,where.entityId,where))];
 }else if(job.professionId==='law'){
  if(job.phase==='report'){where=target(job.originSystem,job.originBody);objective=`Report your decision at ${atName(game,where)}.`;text=job.outcomeText;actions=[actionView(game,job,'report','File the completed inquiry',access(game,where.entityId,where))];}
  else if(job.phase==='investigate'){objective=`Interview the local clerk at ${atName(game,where)}.`;actions=[actionView(game,job,'interview','Review the witness record',access(game,where.entityId,where))];}
  else if(job.phase==='decision'){
   objective='Choose whose account to place on the official record.';text=job.caseId===0?'The claimant reports stolen coolant. The manifest shows that it was diverted to a nursery after an unpaid delivery failed. Your employer demands the courier’s arrest.':'The witness identifies an armed courier who took a civilian cargo. Its captain claims the cargo was confiscated to repay unpaid wages; the crew deny agreeing to the seizure.';
   const check=access(game,where.entityId,where);actions=[actionView(game,job,'choose','Protect the civilian and challenge the order',check,{choiceId:'protect',detail:'Less pay; civilian favor improves. Your employer may object.'}),actionView(game,job,'choose','Enforce the order and seek a living surrender',check,{choiceId:'detain',detail:'Find and disable the courier’s ship. The local watch receives custody; no prisoner berth is needed.'})];
  }else{objective='Disable the marked courier, approach within 220 m, and request surrender.';const enemy=combatEnemy(game,job);where={...where,enemyId:job.targetId,x:enemy?.x,y:enemy?.y};actions=[actionView(game,job,'demandSurrender','Hail: accept a living surrender',nearTarget(game,job))];if(game._record().defeated.includes(job.targetId))actions.push(actionView(game,job,'confirmPatrol','Record the fatal outcome',patrolReady(game,job)));}
 }else{
  if(job.phase==='report'){where=target(job.originSystem,job.originBody);objective=`Return to ${atName(game,where)} for the patrol debrief.`;text=job.outcomeText;actions=[actionView(game,job,'report','File patrol debrief',access(game,where.entityId,where))];}
  else{const enemy=job.eventId?game.system.enemies.find(e=>e.directorEventId===job.eventId):combatEnemy(game,job);where={...where,enemyId:enemy?.id||job.targetId,x:enemy?.x,y:enemy?.y};objective=job.eventId?'Help stop the marked live engagement. Your actual combat contribution is recorded.':'Disable or defeat the marked interdiction ship, then confirm the patrol.';actions=[actionView(game,job,'confirmPatrol','Confirm the engagement record',patrolReady(game,job))];}
 }
 where.label=atName(game,where);
 const here=access(game,deskId(game.state.locationId));
 if(job.professionId!=='paramedic'||job.phase!=='admit')actions.push(actionView(game,job,'cancel','Return this assignment without pay',here,{entityId:here.entity?.id}));
 return{id:job.id,professionId:job.professionId,title:job.title,text,objective,target:where,status:'active',reward:job.reward,cost:job.cost,eventId:job.eventId,phase:job.phase,actions,...(puzzle?{puzzle}:{})};
}
function finish(game,job,outcome,{factor=1,xp=1}={}){
 const state=stateFor(game),career=state.careers[job.professionId],paid=Math.round(job.reward*factor);
 game.state.credits+=paid;career.xp+=xp;career.completed++;career.earned+=paid;
 rep(game,job.factionId,job.professionId==='military'?3:2);
 if(job.professionId==='military')rep(game,rival[job.factionId],-2);
 state.history.unshift({id:job.id,professionId:job.professionId,title:job.title,outcome,paid,at:time(game)});state.history=state.history.slice(0,16);state.active=null;state.cooldownUntil[job.professionId]=time(game)+45;
 game._log(job.title,`${outcome} · ${paid} cr paid.`,'profession');game._event('profession-complete',{professionId:job.professionId,text:`${profession(job.professionId).name} · +${paid} cr`,paid});
 return game._ok({text:outcome,paid,completed:true,board:game.professionBoard()});
}

export const ProfessionRules={
 initializeProfessions(){
  const raw=this.state.professions&&typeof this.state.professions==='object'?this.state.professions:{},careers={};
  for(const definition of PROFESSIONS){const value=raw.careers?.[definition.id]||{};careers[definition.id]={enlisted:!!value.enlisted,factionId:faction(value.factionId)?value.factionId:'freewake',xp:integer(value.xp,1e4),completed:integer(value.completed,1e5),earned:integer(value.earned,1e9),...(definition.id==='military'?{serviceShips:[...new Set((Array.isArray(value.serviceShips)?value.serviceShips:[]).filter(id=>['sparrow','marten'].includes(id)))].slice(0,2)}:{})};}
  const state={version:1,careers,serial:integer(raw.serial),active:null,history:(Array.isArray(raw.history)?raw.history:[]).filter(value=>profession(value?.professionId)&&typeof value.title==='string').slice(0,16).map(value=>({id:String(value.id).slice(0,200),professionId:value.professionId,title:value.title.slice(0,160),outcome:String(value.outcome||'').slice(0,500),paid:integer(value.paid,1000),at:Math.max(0,finite(value.at))})),cooldownUntil:Object.fromEntries(PROFESSIONS.map(def=>[def.id,Math.max(0,finite(raw.cooldownUntil?.[def.id]))]))};
  const job=raw.active,validTarget=where=>this.galaxy.some(system=>system.id===where.system&&system.bodies.some(body=>body.id===where.body&&port(body)));
  if(job&&profession(job.professionId)&&phaseSets[job.professionId].includes(job.phase)&&typeof job.id==='string'&&job.id.startsWith('profession:')&&validTarget({system:job.originSystem,body:job.originBody})&&validTarget({system:job.targetSystem,body:job.targetBody})&&careers[job.professionId].enlisted){
   const originSystem=this.galaxy.find(system=>system.id===job.originSystem),originBody=originSystem.bodies.find(body=>body.id===job.originBody);
   state.active={id:job.id.slice(0,200),professionId:job.professionId,phase:job.phase,serial:integer(job.serial),title:String(job.title||profession(job.professionId).name).slice(0,160),text:String(job.text||profession(job.professionId).description).slice(0,500),originSystem:job.originSystem,originBody:job.originBody,targetSystem:job.targetSystem,targetBody:job.targetBody,factionId:['doctor','paramedic'].includes(job.professionId)?originBody.faction||originSystem.faction||'freewake':careers[job.professionId].factionId,cost:integer(job.cost,50),reward:integer(job.reward,600),caseId:integer(job.caseId,2),shipId:String(job.shipId||'').slice(0,160),eventId:typeof job.eventId==='string'?job.eventId.slice(0,200):null,targetId:typeof job.targetId==='string'?job.targetId.slice(0,240):null,startedAt:Math.max(0,finite(job.startedAt)),round:integer(job.round,2),errors:integer(job.errors,20),decision:['protect','detain'].includes(job.decision)?job.decision:null,outcomeText:String(job.outcomeText||'').slice(0,500),outcomeFactor:clamp(finite(job.outcomeFactor,1),0,1),combatVerified:job.combatVerified===true,dockingsAtStart:integer(job.dockingsAtStart),dockingsAtPickup:integer(job.dockingsAtPickup)};
  }
  this.state.professions=state;return state;
 },
 professionBerths(){const job=this.state.professions?.active;return job?.professionId==='paramedic'&&job.phase==='admit'&&job.shipId===this.state.ship.id?1:0;},
 professionBoard(entityId){
  const state=stateFor(this),body=currentBody(this),id=entityId||body&&deskId(body.id)||null,check=access(this,id),world=directorBoard(this.worldDirector,{playerId:this.playerId});
  const careers=PROFESSIONS.map(def=>{const c=state.careers[def.id],r=rankAt(c.xp),localFaction=body?.faction||this.currentSystem.faction||'freewake',service=def.id==='military'?serviceShipOffer(this,id):null;return{...def,...c,rank:rankNames[def.id][r],rankIndex:r,nextRank:r<3?[3,8,16][r]:null,benefit:`${Math.round((rankBonus[r]-1)*100)}% shift-pay bonus${r>=2?' · 20% fewer supply costs':''}`,...(service?{serviceProgress:service.progress,clearance:c.enlisted?militaryPortAccess(this,c.factionId):null}:{}),actions:c.enlisted?service?.action?[service.action]:[]:[{action:'enlist',professionId:def.id,factionId:localFaction,entityId:id,label:`Join ${def.name}`,available:check.ok,reason:check.reason||null}]};});
  const offers=PROFESSIONS.map(def=>offer(this,def,body)).filter(Boolean).map(value=>{
   const career=state.careers[value.professionId],wait=Math.max(0,Math.ceil(state.cooldownUntil[value.professionId]-time(this)));
   const reason=!check.ok?check.reason:!career.enlisted?'Enroll at this desk first.':wrongEmployer(this,profession(value.professionId),body)|| (state.active?'Complete or return your current assignment.':wait?`Dispatch resets in ${wait}s.`:value.professionId==='military'&&this.canUseOwnShipHere?.()===false?'Bring your own ship to this port. Shipless recruits can request an issued patrol cutter under Military.':this.state.credits<value.cost?`Supplies cost ${value.cost} cr; you have ${Math.floor(this.state.credits)} cr.`:value.professionId==='paramedic'&&spareBerths(this)<1?'A patient requires one free berth.':null);
   return{id:value.id,professionId:value.professionId,title:value.title,text:value.text,objective:`Begin at ${body?.name}.`,target:{...target(value.originSystem,value.originBody),label:atName(this,target(value.originSystem,value.originBody))},reward:value.reward,cost:value.cost,eventId:value.eventId,actions:[{action:'accept',jobId:value.id,eventId:value.eventId,entityId:id,label:`Start shift · ${value.cost} cr supplies`,available:!reason,reason}]};
  });
  const events=world.events.map(event=>({...event,actions:[]}));
  const history=world.history.map(event=>{const contributed=event.contribution&&(event.contribution.aid>0||event.contribution.damage>=12)&&!event.contribution.claimed;const where=target(event.systemId,event.bodyId),at=access(this,where.entityId,where);return{...event,actions:contributed?[{action:'claimRelief',eventId:event.id,entityId:where.entityId,label:'Collect recorded relief stipend · 45 cr',available:at.ok,reason:at.reason||null}]:[]};});
  return{entityId:id,credits:Math.floor(this.state.credits),careers,active:state.active?jobView(this,state.active):null,offers,events,history,conditions:world.conditions,factionPressure:world.factionPressure,workHistory:clone(state.history),available:check.ok,reason:check.reason||null};
 },
 enlistProfession({professionId,factionId,entityId}={}){
  const definition=profession(professionId);if(!definition)return this._fail('That profession is not offered.','target');
  const check=access(this,entityId);if(!check.ok)return this._fail(check.reason,check.code);
  const state=stateFor(this),career=state.careers[professionId];if(career.enlisted)return this._fail('You are already enrolled in this profession.','duplicate');
  const employer=check.body.faction||this.currentSystem.faction||'freewake';
  if(factionId&&factionId!==employer)return this._fail('This desk can enroll you only with its local employer. Visit that faction’s port to join it.','faction');
  career.enlisted=true;career.factionId=employer;if(professionId==='military')rep(this,rival[employer],-3);
  this._log(`Joined: ${definition.name}`,`${faction(employer)?.name||employer} registered your service. Shift supplies are paid only when you accept work.`,'profession');
  return this._ok({text:`You can now take ${definition.name.toLowerCase()} shifts.`,board:this.professionBoard(entityId)});
 },
 professionAction({action,jobId,eventId,entityId,choiceId,solution}={}){
  const state=stateFor(this);
  if(action==='claimServiceShip'){
   const career=state.careers.military,offered=serviceShipOffer(this,entityId);
   if(!offered.action)return this._fail(career.enlisted?offered.progress:'Enroll for military duty before requesting a service hull.','service-commission');
   if(!offered.action.available)return this._fail(offered.action.reason,'service-commission');
   const firstShip=!this.ownsShip,alreadyOwned=this.state.fleet.owned.includes(offered.classId),hull=getShipClass(offered.classId);
   // Entitlement is consumed once; owning this hull already never mints money,
   // spares, fuel, repairs, or another physical vessel.
   career.serviceShips.push(offered.classId);
   if(!alreadyOwned){this.state.fleet.owned.push(offered.classId);this._activateClass(offered.classId,true);if(firstShip)this.claimFirstShip();this._flag(`fleet_${offered.classId}`);}
   const text=alreadyOwned?`${hull.name} service commission recorded. Your existing vessel stays as it is.`:`${faction(career.factionId).name} issued your ${hull.name}. It is waiting at this port.`;
   this._log('Military service issue',text,'profession');this._event('profession-progress',{text});
   this._refreshJobs();return this._ok({text,shipClass:hull,firstShip,alreadyOwned,board:this.professionBoard(entityId)});
  }
  if(action==='accept'){
   const check=access(this,entityId);if(!check.ok)return this._fail(check.reason,check.code);
   if(state.active)return this._fail('Complete or return your current assignment first.','capacity');
   const offered=PROFESSIONS.map(def=>offer(this,def,check.body)).find(value=>value?.id===jobId);
   if(!offered||eventId&&eventId!==offered.eventId)return this._fail('That dispatch has changed. Reopen this desk’s current offers.','target');
   if(!state.careers[offered.professionId].enlisted)return this._fail('Enroll in this profession first.','requirements');
   const employerError=wrongEmployer(this,profession(offered.professionId),check.body);if(employerError)return this._fail(employerError,'faction');
   if(state.cooldownUntil[offered.professionId]>time(this))return this._fail('Dispatch is preparing your next shift.','cooldown');
   if(this.state.credits<offered.cost)return this._fail(`Supplies cost ${offered.cost} cr; you have ${Math.floor(this.state.credits)} cr.`,'cost');
   if(offered.professionId==='paramedic'&&spareBerths(this)<1)return this._fail('A patient needs one spare berth alongside all crew and passengers.','capacity');
   if(offered.professionId==='military'&&this.canUseOwnShipHere?.()===false)return this._fail('Bring your own ship to this port. Shipless recruits can request an issued patrol cutter under Military.','no-ship');
   this.state.credits-=offered.cost;state.serial++;
   state.active={...offered,phase:{paramedic:'pickup',doctor:'triage',law:'investigate',military:'patrol'}[offered.professionId],startedAt:time(this),round:0,errors:0,decision:null,outcomeText:'',outcomeFactor:1,dockingsAtStart:integer(this.state.stats.dockings),dockingsAtPickup:0,targetId:['law','military'].includes(offered.professionId)?`${offered.id}:target`:null};
   this.syncProfessionWorld();this._event('profession-progress',{text:jobView(this,state.active).objective});
   return this._ok({text:'Dispatch recorded. Follow the marked assignment.',active:jobView(this,state.active)});
  }
  if(action==='claimRelief'){
   const event=directorEvent(this.worldDirector,eventId),contribution=event?.contributors?.[this.playerId];
   if(!event||event.status!=='resolved'||!contribution||contribution.claimed||!(contribution.aid>0||contribution.damage>=12))return this._fail('There is no unpaid contribution recorded for you in this incident.','contribution');
   const check=access(this,entityId,target(event.systemId,event.bodyId));if(!check.ok)return this._fail(check.reason,check.code);
   contribution.claimed=true;this.worldDirector.revision++;this.state.credits+=45;rep(this,event.factionId,1);this._log('Relief record',`${event.bodyName} recognized your recorded assistance. · 45 cr paid.`,'profession');return this._ok({paid:45,text:'Your recorded assistance has been paid.'});
  }
  const job=state.active;if(!job||job.id!==jobId)return this._fail('That assignment is no longer active.','target');
  if(action==='cancel'){
   if(job.professionId==='paramedic'&&job.phase==='admit')return this._fail('Admit the patient at the dispatching hospital before ending the shift.','patient');
   const check=access(this,entityId);if(!check.ok)return this._fail(check.reason,check.code);
   state.history.unshift({id:job.id,professionId:job.professionId,title:job.title,outcome:'Assignment returned; supplies were consumed.',paid:0,at:time(this)});state.history=state.history.slice(0,16);state.active=null;state.cooldownUntil[job.professionId]=time(this)+30;return this._ok({text:'Dispatch closed. No wages were claimed.'});
  }
  if(job.professionId==='paramedic'&&((action==='pickupPatient'&&job.phase==='pickup')||(action==='admitPatient'&&job.phase==='admit'))){
   const where=job.phase==='pickup'?target(job.targetSystem,job.targetBody):target(job.originSystem,job.originBody),check=access(this,entityId,where);if(!check.ok)return this._fail(check.reason,check.code);
   if(!ownShipHere(this,job))return this._fail('Bring the assigned ship to this port before transferring its patient.','vessel');
   if(action==='pickupPatient'){
    if(spareBerths(this)<1)return this._fail('The patient needs one free berth; every human, crew member, and passenger counts.','capacity');
    if(this.state.stats.dockings<=job.dockingsAtStart)return this._fail('Fly to the patient’s port before requesting pickup.','travel');
    job.phase='admit';job.dockingsAtPickup=integer(this.state.stats.dockings);this._event('profession-progress',{text:'Patient aboard. Return to the dispatching hospital.'});return this._ok({text:'Patient aboard; one berth reserved.',active:jobView(this,job)});
   }
   if(this.state.stats.dockings<=job.dockingsAtPickup)return this._fail('Complete the return flight before hospital admission.','travel');
   if(job.eventId)recordDirectorAid(this.worldDirector,job.eventId,this.playerId,job.id);
   return finish(this,job,'The hospital received your patient. The assigned berth is free again.');
  }
  if(job.professionId==='doctor'&&job.phase==='triage'&&action==='triage'){
   const check=access(this,entityId,target(job.originSystem,job.originBody));if(!check.ok)return this._fail(check.reason,check.code);
   const expected=triagePuzzle(job).solution;
   if(!Array.isArray(solution)||solution.length!==expected.length||solution.some((value,index)=>value!==expected[index])){job.errors=Math.min(20,job.errors+1);return this._fail('The scanner controller rejected that order. Review its clues; the clinic supervisor keeps the patients safe.','puzzle');}
   if(job.round<2){job.round++;return this._ok({text:'Pod allocation accepted. The next scanner case is ready.',active:jobView(this,job)});}
   if(job.eventId)recordDirectorAid(this.worldDirector,job.eventId,this.playerId,job.id);
   return finish(this,job,'Three clinic cases completed under the duty supervisor.',{factor:job.errors>2?.8:1});
  }
  if(job.professionId==='law'&&job.phase==='investigate'&&action==='interview'){
   const check=access(this,entityId,target(job.targetSystem,job.targetBody));if(!check.ok)return this._fail(check.reason,check.code);
   job.phase='decision';return this._ok({text:'The witness record is open. The choice is yours to make.',active:jobView(this,job)});
  }
  if(job.professionId==='law'&&job.phase==='decision'&&action==='choose'){
   const check=access(this,entityId,target(job.targetSystem,job.targetBody));if(!check.ok)return this._fail(check.reason,check.code);
   if(!['protect','detain'].includes(choiceId))return this._fail('Choose one of the inquiry’s recorded outcomes.','choice');
   job.decision=choiceId;
   if(choiceId==='protect'){job.phase='report';job.outcomeFactor=.7;job.outcomeText='You preserved the civilian’s testimony and challenged the detention order. The employer pays only the inquiry rate.';rep(this,'freewake',3);rep(this,job.factionId,-3);}
   else{job.phase='intercept';job.outcomeText='A living surrender is required. The local watch will take custody.';this.syncProfessionWorld();}
   return this._ok({text:job.outcomeText,active:jobView(this,job)});
  }
  if(job.professionId==='law'&&job.phase==='intercept'&&action==='demandSurrender'){
   const check=nearTarget(this,job);if(!check.ok)return this._fail(check.reason,check.code);
   check.enemy.disabled=true;check.enemy.active=false;check.enemy.surrendered=true;check.enemy.capturedBy=this.playerId;check.enemy.name='Impounded courier';job.phase='report';job.outcomeText='The courier surrendered alive. Local watch officers received the captain; the damaged hull remains in the system.';return this._ok({text:job.outcomeText,active:jobView(this,job)});
  }
  if(action==='confirmPatrol'&&(job.professionId==='military'&&job.phase==='patrol'||job.professionId==='law'&&job.phase==='intercept')){
   const check=patrolReady(this,job);if(!check.ok)return this._fail(check.reason,check.code);
   if(job.professionId==='law'&&!this._record().defeated.includes(job.targetId))return this._fail('Law enforcement requires a living surrender; approach and hail the disabled courier.','requirements');
   if(job.professionId==='law'){job.outcomeFactor=.45;rep(this,job.factionId,-4);job.outcomeText='The courier was killed. Your record acknowledges the fatal outcome; only investigation expenses will be paid.';}
   else{job.outcomeText='Your combat contribution is recorded. Return to the recruiting desk for a debrief.';if(check.event?.status==='resolved'&&check.event.outcome!=='stabilized')job.outcomeFactor=.75;}
   job.phase='report';job.combatVerified=true;return this._ok({text:job.outcomeText,active:jobView(this,job)});
  }
  if(action==='report'&&job.phase==='report'&&['law','military'].includes(job.professionId)){
   const check=access(this,entityId,target(job.originSystem,job.originBody));if(!check.ok)return this._fail(check.reason,check.code);
   if(job.eventId){const event=directorEvent(this.worldDirector,job.eventId),evidence=event?.contributors?.[this.playerId];if(!job.combatVerified||event&&(!evidence||evidence.claimed||evidence.damage<12))return this._fail('That combat contribution has already been paid or is missing.','contribution');if(evidence){evidence.claimed=true;this.worldDirector.revision++;}}
   return finish(this,job,job.outcomeText,{factor:job.outcomeFactor});
  }
  return this._fail('That action does not belong to the assignment’s current step.','action');
 },
 syncProfessionWorld(){
  const job=this.state.professions?.active;if(!job||job.eventId||!['patrol','intercept'].includes(job.phase)||job.targetSystem!==this.state.systemId)return false;
  const world=this._record();world.spawned||=[];
  if(world.defeated.includes(job.targetId))return false;
  const existing=this.system.enemies.find(enemy=>enemy.id===job.targetId);
  if(existing){const index=world.spawned.findIndex(enemy=>enemy.id===job.targetId);if(index>=0)world.spawned[index]=existing;return false;}
  const body=this.system.bodies.find(body=>body.id===job.targetBody);if(!body)return false;
  const prior=world.spawned.find(enemy=>enemy.id===job.targetId),saved=world.enemyStates[job.targetId];
  const enemy=prior?{...clone(prior),...clone(saved||{}),hp:world.enemyHealth[job.targetId]??prior.hp}:{id:job.targetId,professionJobId:job.id,professionOwner:this.playerId,professionContributors:{},name:job.professionId==='law'?'Warrant courier':'Interdiction cutter',faction:rival[job.factionId],...enemyHullProfile('sparrow'),x:clamp(body.x+body.radius+420,-2200,2200),y:clamp(body.y+310,-2200,2200),vx:0,vy:0,angle:2.8,hp:88,maxHp:88,speed:77,damage:5,cooldown:1.7,reward:0,active:false,questTarget:true};
  this.system.enemies.push(enemy);const index=world.spawned.findIndex(e=>e.id===enemy.id);if(index>=0)world.spawned[index]=enemy;else world.spawned.push(enemy);return true;
 },
 professionRescue(){
  const state=this.state.professions,job=state?.active;if(!job||job.shipId!==this.state.ship.id||job.professionId==='doctor'||job.professionId==='law'&&!['intercept','report'].includes(job.phase))return false;
  const outcome=job.professionId==='paramedic'&&job.phase==='admit'?'The rescue crew transferred the patient to emergency care; your dispatch ended without wages.':'Your assigned vessel was lost. Dispatch closed this shift without wages.';
  state.history.unshift({id:job.id,professionId:job.professionId,title:job.title,outcome,paid:0,at:time(this)});state.history=state.history.slice(0,16);state.active=null;state.cooldownUntil[job.professionId]=time(this)+60;this._event('profession-progress',{text:outcome});return true;
 }
};
