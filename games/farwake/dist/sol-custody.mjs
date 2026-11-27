/** Physical quarantine capture and a bounded, playable stay aboard its actual flagship. */
import {getShipClass} from './fleet.mjs';
import {findFactionSupercapital,supercapitalTractorAnchor,supercapitalBrig} from './faction-supercapitals.mjs';

export const SOL_TRACTOR_RANGE=2600;
export const SOL_INSPECTION_SECONDS=120;
const finite=(n,d=0)=>Number.isFinite(n)?n:d;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const copy=n=>JSON.parse(JSON.stringify(n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const vesselId=game=>game.netVesselId||game.state.multiplayer?.aboardVesselId||game.state.ship.id;
const visitFor=game=>game.system.solCordon?.visits?.[vesselId(game)];
const crewAlive=member=>member.health>0&&member.status!=='dead'&&member.status!=='reserve';
const fail=reason=>({ok:false,code:'custody',reason});

/** Read only: the authority supplies actual operators, never an absent owner's advantages. */
export function solCaptureProfile(game){
 const ship=game.state.ship,hull=getShipClass(ship.classId),context=game._solInterceptionContext?.()||{},upgrades=game.state.upgrades||{};
 const crew=(game.state.crew||[]).filter(crewAlive),roles=[...crew.map(c=>c.role),...(context.humanRoles||[])];
 const engineers=Math.min(2,roles.filter(r=>['engineer','engineering'].includes(r)).length),navigators=Math.min(2,roles.filter(r=>['navigator','navigation','scanner'].includes(r)).length);
 const standing=clamp(finite(context.standing,finite(game.state.rep?.concord)), -100,100),affiliated=context.affiliated??(game.state.alliance==='concord'||game.state.militaryCareer?.factionId==='concord');
 const mass=finite(ship.mass,hull.stats.mass)+Math.max(0,finite(game.state.cargo?.ore)+finite(game.state.cargo?.crystal))*.012;
 const engineGrade=(upgrades.thrusters_1?1:0)+(upgrades.thrusters_2?2:0),shieldGrade=(upgrades.shield_1?1:0)+(upgrades.shield_2?2:0);
 const shieldFraction=ship.maxShield>0?clamp(ship.shield/ship.maxShield,0,1):0;
 const resistance=clamp(engineGrade*12+engineers*10+navigators*5+shieldGrade*3*shieldFraction+(ship.powerPriority==='thrusters'?15:0)+Math.min(12,mass*2),0,85);
 const aggressive=visitFor(game)?.aggressive===true||context.aggressive===true||findFactionSupercapital(game.system,'concord')?.supercapitalState.hostileVesselIds.includes(vesselId(game))===true;
 const eligible=hull.stats.renderLength<=160&&mass<=7&&!aggressive&&context.captureSafe!==false;
 const inspectionSeconds=clamp(SOL_INSPECTION_SECONDS+(standing< -20?60:0)-(affiliated?30:0)-(standing>=30?20:0),60,180);
 return{eligible,aggressive,resistance,mass,engineers,navigators,standing,affiliated,inspectionSeconds,
  lockSeconds:5+resistance*.035,towSpeed:225-resistance*.65,breakSeconds:3+resistance*.085,counterCost:60,
  factors:[{label:'Hull',value:eligible?`${hull.name} fits the secure hangar`:`${hull.name}${aggressive?' · armed resistance':' · armed interception'}`},
   {label:'Drive and power',value:`${engineGrade?`Drive grade ${engineGrade}`:'Standard drive'} · ${ship.powerPriority==='thrusters'?'thruster priority':'balanced or other priority'}`},
   {label:'Working crew',value:`${engineers} engineering · ${navigators} navigation`},
   {label:'Shield',value:`${Math.round(shieldFraction*100)}% · ${shieldGrade?'reinforced':'standard'}`},
   {label:'Concord standing',value:`${standing}${affiliated?' · affiliated':''}`}]};
}

export function restoreSolTractor(raw){
 if(!raw||!['locking','towing'].includes(raw.phase)||typeof raw.sourceId!=='string')return null;
 const point=p=>({x:clamp(finite(p?.x),-50000,50000),y:clamp(finite(p?.y),-50000,50000)});
 return{phase:raw.phase,sourceId:raw.sourceId.slice(0,160),source:point(raw.source),target:point(raw.target),targetVesselId:String(raw.targetVesselId||'').slice(0,160),remainingSeconds:clamp(finite(raw.remainingSeconds),0,12),progress:clamp(finite(raw.progress),0,1),range:SOL_TRACTOR_RANGE,complied:raw.complied===true};
}

/** Returns true while this hull is handled by the nonlethal interception. */
export function stepSolTractor(world,participant,visit,dt,{onEvent,onCapture}={}){
 const suppressed=visit.tractorSuppressed>0;visit.tractorSuppressed=Math.max(0,finite(visit.tractorSuppressed)-dt);
 const game=participant.game,ship=participant.ship,profile=solCaptureProfile(game),captor=findFactionSupercapital(world,'concord');
 if(!profile.eligible||!captor||captor.hp<=0){visit.tractor=null;return false;}
 const anchor=supercapitalTractorAnchor(captor),gap=distance(ship,anchor);
 if(gap>SOL_TRACTOR_RANGE){if(visit.tractor)onEvent?.('sol-tractor-escaped',{systemId:'sol',targetVesselId:participant.vesselId,text:'Tractor range cleared. Keep clear of Earth or jump back.'});visit.tractor=null;return false;}
 if(suppressed)return true;
 if(!visit.tractor){
  visit.tractor={phase:'locking',sourceId:captor.id,source:{x:anchor.x,y:anchor.y},target:{x:ship.x,y:ship.y},targetVesselId:participant.vesselId,remainingSeconds:profile.lockSeconds,progress:0,range:SOL_TRACTOR_RANGE,complied:false};
  onEvent?.('sol-tractor-warning',{systemId:'sol',targetVesselId:participant.vesselId,hostVesselId:captor.id,text:`${captor.name}: tractor acquisition. Burn away, counterpulse, or jump back. Compliance leads to inspection aboard this ship.`});
 }
 const beam=visit.tractor;beam.source={x:anchor.x,y:anchor.y};beam.target={x:ship.x,y:ship.y};beam.remainingSeconds=Math.max(0,beam.remainingSeconds-dt);
 if(beam.phase==='locking'){
  beam.progress=clamp(1-beam.remainingSeconds/profile.lockSeconds,0,1);
  if(beam.remainingSeconds>0)return true;
  beam.phase='towing';beam.progress=0;
 }
 const angle=Math.atan2(anchor.y-ship.y,anchor.x-ship.x),speed=profile.towSpeed*(beam.complied?1.45:1),response=1-Math.exp(-2.2*dt);
 ship.vx=finite(ship.vx)+(Math.cos(angle)*speed-finite(ship.vx))*response;
 ship.vy=finite(ship.vy)+(Math.sin(angle)*speed-finite(ship.vy))*response;
 // Flight integrates once in stepPilot. This small field correction also makes
 // the tow continue for an unpiloted physical hull without teleporting it.
 ship.x+=Math.cos(angle)*Math.min(gap,45*dt);ship.y+=Math.sin(angle)*Math.min(gap,45*dt);
 beam.target={x:ship.x,y:ship.y};beam.remainingSeconds=Math.max(0,(gap-anchor.radius)/speed);beam.progress=clamp(1-gap/SOL_TRACTOR_RANGE,0,1);
 if(gap<=anchor.radius+ship.radius){
  const details={captor,profile,complied:beam.complied,targetVesselId:participant.vesselId};
  visit.tractor=null;
  if(onCapture?.(participant,details)!==false){world.bullets=world.bullets.filter(b=>b.targetVesselId!==participant.vesselId||!b.solCordon&&!b.factionSupercapital);}
 }
 return true;
}

export function quarantineBrigSurface(location,seed){
 const cols=14,rows=22,tileSize=24,tiles=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>x>0&&x<cols-1&&y>0&&y<rows-1?(x===1||x===cols-2||y===1||y===rows-2?2:1):0));
 const entity=(id,type,name,x,y,data,text)=>({id:`${location.id}:${id}`,type,name,x,y,radius:12,role:type==='npc'?'custody':'repair',data:{fixedPost:true,...data},text});
 return{id:location.id,name:location.name,kind:'station',biome:'ship',faction:location.faction,systemId:location.systemId,hostVesselId:location.hostVesselId,seed,cols,rows,tileSize,width:cols*tileSize,height:rows*tileSize,pixelWidth:cols*tileSize,pixelHeight:rows*tileSize,tiles,solids:[],spawn:{...location.cell},exit:null,
  entities:[entity('clerk','npc','Quarantine liaison',156,252,{custodyAction:'petition'},'Your ship is secured in this vessel’s hangar. Inspection ends at Threshold, not on Earth. A recognized service record or a processing bond can shorten the wait.'),
   entity('service','work','Ventilation service panel',252,348,{custodyAction:'service'},'Clear a blocked intake under the deck engineer’s supervision to complete part of the inspection.'),
   entity('release','terminal','Escorted transfer desk',252,444,{custodyAction:'release'},'The desk lists the remaining inspection time. Your same ship, crew, and cargo will be returned at Threshold.'),
   entity('detainee','npc','Waiting courier',84,324,{custodyDialogue:true},'“I got a look at home through their docking glass. Dark coastlines. A few landing lights. That’s all I saw. Anything beyond that would be a guess.”')],
  palette:{floor:'#283840',floor2:'#2a3b45',edge:'#425862',wall:'#15222d',wallTop:'#617789',path:'#354b52',accent:'#c6b07c',light:'#d0b885',ground:'#283840',ground2:'#2a3b45'},
  decor:[{kind:'bed',x:60,y:84,w:72,h:24,color:'#718b99'},{kind:'bed',x:204,y:84,w:72,h:24,color:'#718b99'},{kind:'label',x:66,y:58,w:24,h:24,color:'#d0b885',text:'SECURE HOLDING DECK'},{kind:'label',x:66,y:205,w:24,h:24,color:'#a6c0cd',text:'INSPECTION & TRANSFER'},{kind:'equipment',x:252,y:348,w:24,h:24,color:'#83b9ab'},{kind:'airlock',x:144,y:480,w:48,h:24,color:'#b6886d'}]};
}

export function enterQuarantineCell(game,record,{reset=false}={}){
 game.state.custody=copy(record);game.state.mode='person';game.state.stationView=null;game.state.locationId=record.brig.id;
 if(reset||game.state.interior?.kind!=='brig')game.state.interior={kind:'brig',location:copy(record.brig),vesselId:record.captorId};
 if(reset)Object.assign(game.state.person,record.brig.cell,{vx:0,vy:0,moving:false});
 Object.assign(game.state.person,{weaponDrawn:false,aimManual:false,lastShot:null,attackUntil:0});
 game.state.pendingEncounter=null;game.state.boarding=null;
}

export function makeQuarantineRecord(game,{captor,profile=solCaptureProfile(game),complied=false,targetVesselId=vesselId(game)}={}){
 const remainingSeconds=clamp(profile.inspectionSeconds-(complied?30:0),30,180);
 return{version:1,phase:'detained',vesselId:targetVesselId,vesselName:game.state.ship.name||getShipClass(game.state.ship.classId).name,captorId:captor.id,captorName:captor.name,factionId:captor.faction,systemId:game.state.systemId,
  remainingSeconds,totalSeconds:remainingSeconds,petitionUsed:false,serviceUsed:false,standing:profile.standing,affiliated:profile.affiliated,complied,brig:supercapitalBrig(captor),factors:profile.factors};
}

export const SolCustodyRules={
 initializeSolCustody(){
  const record=this.state.custody;
  if(!record||record.version!==1||record.phase!=='detained'||!record.brig||record.brig.kind!=='brig'||typeof record.vesselId!=='string'){this.state.custody=null;return null;}
  record.remainingSeconds=clamp(finite(record.remainingSeconds,SOL_INSPECTION_SECONDS),0,180);record.totalSeconds=clamp(finite(record.totalSeconds,SOL_INSPECTION_SECONDS),30,180);
  record.petitionUsed=record.petitionUsed===true;record.serviceUsed=record.serviceUsed===true;
  if(this.state.ship.id===record.vesselId){this.state.ship.impoundedBy=record.captorId;this.state.ship.dockedAt=`hangar:${record.captorId}`;this.state.ship.vx=0;this.state.ship.vy=0;}
  enterQuarantineCell(this,record,{reset:this.state.interior?.kind!=='brig'});return record;
 },
 custodyAccess(name){
  if(this.state.custody?.phase!=='detained'||['custodyAction','surfaceAction','setCameraPreferences','renameCaptain','acknowledgeRecoveryReport','dismissEncounter'].includes(name))return{ok:true};
  return fail('You are in the flagship’s brig. Use the liaison, service panel, or transfer desk while inspection completes.');
 },
 custodyStatus(){
  const record=this.state.custody;
  if(record?.phase==='detained'){
   const near=point=>this.state.mode==='person'&&this.state.interior?.kind==='brig'&&distance(this.state.person,point)<=60;
   const petitionFree=record.affiliated||record.standing>=20,petitionReady=!record.petitionUsed&&(petitionFree||this.state.credits>=40);
   return{phase:'detained',title:'Quarantine inspection',captorName:record.captorName,factionId:record.factionId,vesselName:record.vesselName,remainingSeconds:record.remainingSeconds,
    detail:`Aboard ${record.captorName}. Your ship and belongings are secured. Walk to the liaison or service panel to shorten inspection; transfer to Threshold follows.`,factors:record.factors||[],
    actions:[{id:'petition',label:petitionFree?'Request liaison review':'Post processing bond · 40 cr',detail:'Shortens inspection by 45 seconds; once per captured ship.',enabled:petitionReady&&near(record.brig.console),reason:record.petitionUsed?'Review already completed.':!petitionReady?'The processing bond requires 40 cr.':`Approach the quarantine liaison.`},
     {id:'service',label:'Assist ventilation service',detail:'Shortens inspection by 45 seconds; once per captured ship.',enabled:!record.serviceUsed&&near({x:252,y:348}),reason:record.serviceUsed?'Service task completed.':'Approach the ventilation panel.'},
     {id:'release',label:'Escorted transfer to Threshold',detail:'Your original ship, cargo, and crew are returned. This grants no Earth clearance.',enabled:record.remainingSeconds<=0,reason:`Inspection: ${Math.ceil(record.remainingSeconds)} seconds remaining.`}]};
  }
  const visit=visitFor(this),beam=visit?.tractor;if(!beam)return null;
  const profile=solCaptureProfile(this),captor=findFactionSupercapital(this.system,'concord');
  return{phase:beam.phase,title:beam.phase==='locking'?'Tractor lock acquiring':'Being towed to the flagship',captorName:captor?.name||'Quarantine flagship',factionId:'concord',vesselName:this.state.ship.name,remainingSeconds:beam.remainingSeconds,
   detail:'Burn away from the beam’s source, counterpulse, or jump back. Compliance preserves your hull and starts a shorter inspection.',factors:profile.factors,
   actions:[{id:'break-lock',label:'Engine counterpulse · 60 energy',detail:`Interrupts the tractor for ${Math.round(profile.breakSeconds)} seconds. Burn away immediately. One pulse per visit.`,enabled:!visit.counterUsed&&this.state.ship.energy>=profile.counterCost,reason:visit.counterUsed?'Counterpulse already spent this visit.':'Needs 60 reactor energy.'},
    {id:'comply',label:'Comply with inspection',detail:'Allow the tow; reduces inspection by 30 seconds.',enabled:!beam.complied,reason:'Already complying.'}]};
 },
 enterQuarantineCustody(details){
  if(this.state.custody?.phase==='detained')return false;
  const record=makeQuarantineRecord(this,details),ship=this.state.ship;
  ship.impoundedBy=record.captorId;ship.dockedAt=`hangar:${record.captorId}`;ship.vx=0;ship.vy=0;
  enterQuarantineCell(this,record,{reset:true});
  this._log('Taken aboard the quarantine flagship',`${record.captorName} tractored ${record.vesselName} into its secure hangar. The ship and cargo remain intact. You are in the holding deck for inspection; a liaison and supervised service task can shorten the stay. An escorted transfer returns you to Threshold.`, 'discovery');
  this._event('sol-tractor-captured',{systemId:'sol',targetVesselId:record.vesselId,targetCaptainId:this.playerId,hostVesselId:record.captorId,text:`Held aboard ${record.captorName}. Your ship is secured. Approach the liaison or service panel.`});
  return true;
 },
 custodyAction(action){
  const view=this.custodyStatus(),option=view?.actions.find(value=>value.id===action);
  if(!option||!option.enabled)return fail(option?.reason||'No quarantine action is available here.');
  if(view.phase!=='detained'){
   const visit=visitFor(this),beam=visit.tractor,ship=this.state.ship,profile=solCaptureProfile(this);
   if(action==='comply'){beam.complied=true;beam.remainingSeconds=0;return{ok:true,text:'Compliance recorded. The tow continues; inspection will be shorter.'};}
   if(action==='break-lock'){
    ship.energy-=profile.counterCost;visit.counterUsed=true;visit.tractorSuppressed=profile.breakSeconds;
    const angle=Math.atan2(ship.y-beam.source.y,ship.x-beam.source.x);ship.vx+=Math.cos(angle)*260;ship.vy+=Math.sin(angle)*260;visit.tractor=null;
    this._event('sol-tractor-escaped',{systemId:'sol',targetVesselId:vesselId(this),text:`Tractor interrupted for ${Math.round(profile.breakSeconds)} seconds. Burn away or jump back now.`});
    return{ok:true,text:'Counterpulse fired. Burn away from the flagship or jump back.'};
   }
  }
  if(this._quarantineAction)return this._quarantineAction(action);
  const record=this.state.custody;
  if(action==='petition'){
   if(!record.affiliated&&record.standing<20)this.state.credits-=40;
   record.petitionUsed=true;record.remainingSeconds=Math.max(0,record.remainingSeconds-45);
  }else if(action==='service'){record.serviceUsed=true;record.remainingSeconds=Math.max(0,record.remainingSeconds-45);}
  else if(action==='release')return this.releaseQuarantineCustody();
  this._log('Quarantine inspection',action==='petition'?'The liaison accepted your review and shortened the inspection.':'You cleared the intake under supervision. The deck engineer shortened the inspection.','activity');
  if(record.remainingSeconds<=0)this.releaseQuarantineCustody();
  return{ok:true,text:'Inspection shortened by 45 seconds.'};
 },
 stepSolCustody(delta){
  const record=this.state.custody;if(record?.phase!=='detained'||this._sharedWorld)return false;
  const captor=findFactionSupercapital(this.system,record.factionId);
  if(captor?.id===record.captorId&&captor.hp<=0){record.remainingSeconds=0;record.emergencyTransfer=true;}
  record.remainingSeconds=Math.max(0,record.remainingSeconds-clamp(finite(delta),0,.1));
  this.state.person.weaponDrawn=false;
  if(record.remainingSeconds===0)this.releaseQuarantineCustody();return true;
 },
 releaseQuarantineCustody(){
  const record=this.state.custody;if(record?.phase!=='detained')return fail('No inspection is active.');
  if(record.remainingSeconds>0)return fail('Inspection has not finished.');
  const body=this.system.bodies.find(b=>b.id==='threshold');if(!body)return fail('The screened transfer berth is unavailable.');
  const ship=this.state.ship;delete ship.impoundedBy;Object.assign(ship,{x:body.x,y:body.y+body.radius+70,vx:0,vy:0,dockedAt:body.id});
  this.state.custody=null;this.state.interior=null;this.state.mode='person';this.state.locationId=body.id;this.state.lastBodyId=body.id;
  this.state.livelihoods||={};this.state.livelihoods.parkedShip={vesselId:ship.id,systemId:this.state.systemId,bodyId:body.id};
  this._arriveAsPassenger(body,{discovery:false});
  this._event('sol-custody-release',{systemId:'sol',targetVesselId:record.vesselId,targetCaptainId:this.playerId,text:record.emergencyTransfer?'Flagship evacuation. The hangar launched your secured ship and its people to Threshold. Earth landing clearance is unchanged.':'Inspection complete. Your original ship, cargo, and crew are at Threshold. Earth landing clearance is unchanged.'});
  this._log('Returned to Threshold',record.emergencyTransfer?'The damaged flagship’s emergency transfer launched your original ship and its detained people to Threshold. The quarantine still controls Earth’s descent.':'The flagship returned your original ship and belongings to Threshold after inspection. The quarantine still controls Earth’s descent.','discovery');
  return{ok:true,text:'Released at Threshold with your original ship and belongings.'};
 }
};
