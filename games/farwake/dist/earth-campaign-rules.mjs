/** Shared-world Earth operations. Clients submit intentions; physical state decides progress. */
import { EARTH_CAMPAIGN, EARTH_CAMPAIGN_ID } from './earth-campaign-content.mjs';
import { enemyHullProfile } from './fleet.mjs';
import { systemBodyPosition } from './system-space.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const integer=(value,max=1e6)=>clamp(Math.floor(finite(value)),0,max);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),c.charCodeAt(0)+16777619);return(h>>>0).toString(36);};
const flightKind=kind=>['earth-scan','earth-rescue','earth-defense'].includes(kind);
const recordFor=game=>game.state.narrative?.quests?.[EARTH_CAMPAIGN_ID];
const currentStep=record=>record?.status==='active'?EARTH_CAMPAIGN.stages[record.stage]:null;
const rescueSteps=EARTH_CAMPAIGN.stages.filter(step=>step.kind==='earth-rescue');
const defenseSteps=EARTH_CAMPAIGN.stages.filter(step=>step.kind==='earth-defense');
const survivorIds=new Set(rescueSteps.map(step=>step.passenger.id));
const fail=(reason,code='requirements')=>({ok:false,reason,code});
const conscious=game=>game.state.person?.health>0&&!game.state.person.down;
const operationPrefix=(earth,step)=>`earth:${earth.key}:${step.id}:`;
const operationId=(earth,step)=>`${operationPrefix(earth,step)}${earth.operation?.attempt??earth.attempts[step.id]??0}`;
const enemyId=(earth,step,wave,index)=>`${operationId(earth,step)}:wave:${wave}:${index}`;
const markerId=(earth,step)=>`earth-marker:${earth.key}:${step.id}`;
const expectedTargets=(earth,step)=>step.waves.flatMap((wave,w)=>Array.from({length:wave.count},(_,i)=>enemyId(earth,step,w,i)));

export function normalizeEarthCampaignRecord(raw,stage,status='active'){
 const value=object(raw),step=status==='active'?EARTH_CAMPAIGN.stages[stage]:null,attempts={};
 for(const definition of defenseSteps)attempts[definition.id]=integer(value.attempts?.[definition.id],10000);
 const result={key:typeof value.key==='string'&&/^[a-z0-9-]{1,70}$/.test(value.key)?value.key:null,delivered:[...new Set((Array.isArray(value.delivered)?value.delivered:[]).filter(id=>survivorIds.has(id)))],failures:integer(value.failures,10000),recoveries:integer(value.recoveries,10000),attempts,passenger:null,operation:null};
 const passenger=object(value.passenger),pickup=rescueSteps.find(s=>s.passenger.id===passenger.id),pickupIndex=EARTH_CAMPAIGN.stages.findIndex(s=>s.id===pickup?.id),dropIndex=EARTH_CAMPAIGN.stages.findIndex(s=>s.kind==='earth-deliver'&&s.rescueId===pickup?.id);
 if(status==='active'&&pickup&&stage>pickupIndex&&stage<=dropIndex&&!result.delivered.includes(passenger.id)&&typeof passenger.shipId==='string'&&passenger.shipId.length&&passenger.shipId.length<=160)result.passenger={...pickup.passenger,shipId:passenger.shipId,pickupId:pickup.id,pickupStage:pickupIndex};
 const operation=object(value.operation);
 if(step?.kind==='earth-defense'&&operation.stepId===step.id&&operation.started===true){
  const maxIntegrity=step.integrity+result.delivered.length*24;
  result.operation={stepId:step.id,shipId:typeof operation.shipId==='string'?operation.shipId.slice(0,160):null,started:true,attempt:integer(operation.attempt,10000),elapsed:clamp(finite(operation.elapsed),0,step.deadline),held:clamp(finite(operation.held),0,step.duration),integrity:clamp(finite(operation.integrity,maxIntegrity),0,maxIntegrity),maxIntegrity,waves:[...new Set((Array.isArray(operation.waves)?operation.waves:[]).filter(index=>Number.isInteger(index)&&index>=0&&index<step.waves.length))],failed:['integrity','timeout','ship-loss'].includes(operation.failed)?operation.failed:null};
  result.attempts[step.id]=Math.max(result.attempts[step.id],result.operation.attempt);
 }
 return result;
}
function ensureEarth(game,record=recordFor(game)){
 if(!record)return null;
 record.earth||=normalizeEarthCampaignRecord(null,record.stage,record.status);
 record.earth.key||=`${hash(game.playerId||'solo')}-${hash(`${game.state.seed}:${game.state.ship?.id}:${record.startedAt}`)}`;
 return record.earth;
}
export function earthCampaignBerths(game){const passenger=recordFor(game)?.earth?.passenger;return passenger&&passenger.shipId===game.state.ship?.id?1:0;}

export function earthStageTarget(game,step,record=recordFor(game)){
 if(!step)return{};
 if(!flightKind(step.kind))return{...step.at};
 const system=game.galaxy.find(system=>system.id===step.at.systemId),runtime=game.system?.id===step.at.systemId?game.system:null;
 const index=system?.bodies.findIndex(body=>body.id===step.at.anchorBody)??-1,definition=system?.bodies[index];
 const anchor=runtime?.bodies.find(body=>body.id===step.at.anchorBody)||(definition?systemBodyPosition(definition,index,system.id):{x:0,y:0});
 let x=finite(anchor?.x)+finite(step.at.offsetX),y=finite(anchor?.y)+finite(step.at.offsetY);
 const operation=record?.earth?.operation;
 if(step.escort&&operation?.stepId===step.id){const travel=Math.min(step.duration,operation.held)/step.duration;x+=travel*1800;y-=travel*760;}
 return{systemId:step.at.systemId,anchorBody:step.at.anchorBody,x,y,...(record?.earth?.key?{signalId:markerId(record.earth,step)}:{}),label:step.title.replace(/^\d+ · /,''),missionRole:step.kind.replace('earth-','')};
}
function missionEnemy(game,id){return game.system.enemies.find(enemy=>enemy.id===id);}
function neutralized(game,id){const enemy=missionEnemy(game,id);return game._record().defeated.includes(id)||!!enemy&&(enemy.hp<=0||enemy.disabled||enemy.capturedBy||enemy.promotedVesselId||enemy.canonicalVesselId);}
function defenseReady(game,earth,step){const op=earth.operation;return!!op&&!op.failed&&op.held+1e-6>=step.duration&&op.waves.length===step.waves.length&&expectedTargets(earth,step).every(id=>neutralized(game,id));}
function flightAccess(game,step,record,{near=420}={}){
 if(game.hasActiveVessel===false||!game.state.ship||game.state.npcContract?.active)return fail('Take the helm of a physical ship with permission to operate it. An assigned NPC-service ship is committed to its own orders.','no-ship');
 if(game.state.mode!=='ship'||!conscious(game)||game.state.ship.hull<=0||game.state.ship.destroyed)return fail('Operate this mission from the ship’s helm while conscious.','mode');
 if(game.state.systemId!==step.at.systemId)return fail('Travel to the system named in this mission.','location');
 if(distance(game.state.ship,earthStageTarget(game,step,record))>near)return fail(`Approach the marked mission contact within ${Math.round(near)} m.`, 'distance');
 return{ok:true};
}
export function earthStageAccess(game,record,step,action,{nearEntity,capacity},entityId){
 if(step.requiresFlags?.some(flag=>!game.hasFlag(flag)))return fail(step.requirementText||step.objective,'requirements');
 if(!step.kind.startsWith('earth-'))return null;
 const earth=ensureEarth(game,record);
 if(step.kind==='earth-gate')return nearEntity(game,entityId||step.at.entityId,step.at);
 if(step.kind==='earth-deliver'){
  const access=nearEntity(game,entityId||step.at.entityId,step.at);if(!access.ok)return access;
  const pickup=rescueSteps.find(s=>s.id===step.rescueId);
  if(!earth.passenger||earth.passenger.id!==pickup?.passenger.id)return fail('The survivor is not aboard. Return to the marked rescue site after recovery.','passenger');
  if(earth.passenger.shipId!==game.state.ship.id)return fail('Bring the actual ship carrying this survivor to the marked receiving bay. Your own passage ticket cannot move a passenger on another ship.','vessel');
  // The solo game exposes a real docked own hull. The authority supplies the
  // permitted carrying hull with _withShip after validating its docking state.
  if(!game.state.multiplayer?.serverAuthoritative&&game.canUseOwnShipHere?.()===false)return fail('Dock the carrying ship at this receiving bay before disembarking the survivor.','vessel');
  return{ok:true};
 }
 const access=flightAccess(game,step,record,{near:step.kind==='earth-defense'?900:step.kind==='earth-rescue'?180:Math.max(140,Math.min(420,game.state.ship.scanRange||235))});if(!access.ok)return access;
 if(step.kind==='earth-rescue'){
  if(earth.passenger)return fail('Deliver the survivor already aboard before another pickup.','capacity');
  if(capacity(game)<1)return fail('This survivor needs one free physical berth, shared with crew, other captains, patients, and passengers.','capacity');
 }
 if(step.kind==='earth-defense'){
  const op=earth.operation;
  if(action==='beginDefense'){if(op?.started)return fail('This defense has already begun. Monitor the current operation or retry after a failure.','duplicate');return{ok:true};}
  if(action==='retryDefense'){if(!op?.failed)return fail('Only a failed defense can be restarted.','action');return{ok:true};}
  if(!op)return fail('Reach the marked point and begin the defense first.','requirements');
  if(op.failed)return fail(op.failed==='integrity'?'The protected contact was lost. Regroup at the marker and retry the defense.':op.failed==='timeout'?'The transfer window closed. Return to the marker to arrange another attempt.':'Your ship was lost. Return with a working ship and retry the defense.','failed');
  if(!defenseReady(game,earth,step))return fail('Keep the protected contact intact, remain on watch, and neutralize every marked attacking wave before confirming success.','requirements');
 }
 return{ok:true};
}
function cleanOperation(game,earth,step){
 const prefix=operationPrefix(earth,step),world=game.state.worlds[step.at.systemId]||(game.state.systemId===step.at.systemId?game._record():null);
 if(!world)return;
 const retain=enemy=>!enemy.id.startsWith(prefix)||enemy.promotedVesselId||enemy.canonicalVesselId;
 if(game.system.id===step.at.systemId)game.system.enemies=game.system.enemies.filter(retain);
 world.spawned=(world.spawned||[]).filter(retain);
 for(const key of Object.keys(world.enemyHealth||{}))if(key.startsWith(prefix))delete world.enemyHealth[key];
 for(const key of Object.keys(world.enemyStates||{}))if(key.startsWith(prefix))delete world.enemyStates[key];
 if(game.system.id===step.at.systemId)game.system.bullets=(game.system.bullets||[]).filter(bullet=>!String(bullet.ownerId||bullet.owner||'').startsWith(prefix));
}
function startDefense(game,record,step,retry){
 const earth=ensureEarth(game,record);cleanOperation(game,earth,step);
 const attempt=(earth.attempts[step.id]||0)+(retry?1:0);earth.attempts[step.id]=attempt;
 const maxIntegrity=step.integrity+earth.delivered.length*24;
 earth.operation={stepId:step.id,shipId:game.state.ship.id,started:true,attempt,elapsed:0,held:0,integrity:maxIntegrity,maxIntegrity,waves:[],failed:null};
 game._event('earth-defense',{threadId:EARTH_CAMPAIGN_ID,stageId:step.id,text:retry?'A fresh relief window is open. Protect the contact and finish the transfer.':'Relief operation begun. Protect the marked contact; attackers are visible to everyone in this system.'});
 syncEarthCampaignWorld(game);
 return game._ok({text:'Operation begun. Keep the marked contact intact and remain within 900 m. Open Stories → Earth: The Long Silence to monitor progress.',campaign:earthCampaignStatus(game)});
}

export function earthThreadAction(game,record,step,{action,entityId},helpers){
 if(!step.kind.startsWith('earth-'))return null;
 const valid=step.kind==='earth-defense'?['beginDefense','advance','retryDefense']:['advance'];
 if(!valid.includes(action))return game._fail('That action does not belong to the current Earth mission.','action');
 const access=earthStageAccess(game,record,step,action,helpers,entityId);if(!access.ok)return game._fail(access.reason,access.code);
 const earth=ensureEarth(game,record);
 if(step.kind==='earth-defense'&&action!=='advance')return startDefense(game,record,step,action==='retryDefense');
 if(step.kind==='earth-rescue'){
  earth.passenger={...step.passenger,shipId:game.state.ship.id,pickupId:step.id,pickupStage:record.stage};
  game._event('earth-rescue',{threadId:EARTH_CAMPAIGN_ID,text:`${step.passenger.name} is aboard ${game.state.ship.name||'this ship'}. One berth is occupied until the named drop zone.`});
 }
 if(step.kind==='earth-deliver'){
  const passenger=earth.passenger;if(!earth.delivered.includes(passenger.id)){earth.delivered.push(passenger.id);game.state.credits+=100;game._flag(`thread:earth_rescued:${passenger.id}`);}
  earth.passenger=null;game._event('earth-delivery',{threadId:EARTH_CAMPAIGN_ID,text:`${passenger.name} is safely ashore. Relief stipend +100 cr. Survivor support improves later defense integrity.`});
 }
 if(step.kind==='earth-scan'){
  if(game.state.ship.energy<8)return game._fail('Wait for at least 8 scanner energy before recording this evidence.','energy');
  game.state.ship.energy-=8;game._event('scan',{x:game.state.ship.x,y:game.state.ship.y,text:'Earth campaign evidence verified'});
 }
 return helpers.finish(step.text);
}
export function finishEarthCampaignStage(game,record,step){
 const earth=ensureEarth(game,record);if(!earth)return;
 if(step.kind==='earth-defense'){cleanOperation(game,earth,step);earth.operation=null;}
 game.system.signals=(game.system.signals||[]).filter(signal=>signal.id!==markerId(earth,step));
 if(record.stage===EARTH_CAMPAIGN.stages.length-1){record.outcome=`${record.outcome||step.text} ${earth.delivered.length} named survivors reached their receiving bays; the signed fleet recall is public evidence. ${earth.failures?`${earth.failures} relief attempt${earth.failures===1?'':'s'} had to be rebuilt along the way.`:'Every relief operation reached its intended window.'}`;game._flag('thread:earth_long_silence_resolved');}
}
function spawnWave(game,earth,step,index){
 const wave=step.waves[index],point=earthStageTarget(game,step,recordFor(game)),world=game._record();
 for(let i=0;i<wave.count;i++){
  const id=enemyId(earth,step,index,i);if(world.defeated.includes(id)||missionEnemy(game,id))continue;
  const prior=world.spawned.find(enemy=>enemy.id===id),angle=(index*1.7+i*2.4)+.5;
  const enemy=prior?{...clone(prior),...(world.enemyStates?.[id]||{}),hp:world.enemyHealth?.[id]??prior.hp}:{id,name:`Legacy enforcer · ${step.mission}.${index+1}.${i+1}`,faction:'old-earth',...enemyHullProfile('kestrel'),x:point.x+Math.cos(angle)*480,y:point.y+Math.sin(angle)*480,vx:0,vy:0,angle:angle+Math.PI,hp:wave.hp,maxHp:wave.hp,cooldown:1.8,speed:76+step.mission*2,damage:5+Math.floor(step.mission/4),reward:0,noLoot:true,active:false,questTarget:true,questOwner:game.playerId,earthCampaign:true,campaignKey:earth.key,campaignStep:step.id,campaignAttempt:earth.operation.attempt};
  if(!prior)world.spawned.push(clone(enemy));game.system.enemies.push(enemy);
 }
}
export function syncEarthCampaignWorld(game){
 const record=recordFor(game),step=currentStep(record);if(!record)return;
 const earth=ensureEarth(game,record);
 // Keep other captains’ markers untouched. The same physical battle is shared.
 game.system.signals=(game.system.signals||[]).filter(signal=>signal.campaignKey!==earth.key||step&&signal.campaignStep===step.id&&game.state.systemId===step.at.systemId);
 if(!step||!flightKind(step.kind)||game.state.systemId!==step.at.systemId)return;
 const point=earthStageTarget(game,step,record),id=markerId(earth,step),op=earth.operation;
 let marker=game.system.signals.find(signal=>signal.id===id);
 if(!marker){marker={id,kind:'survey',radius:22,resolved:false,scanned:false,earthCampaign:true,threadId:EARTH_CAMPAIGN_ID,campaignOwner:game.playerId,campaignKey:earth.key,campaignStep:step.id,missionRole:step.kind.replace('earth-',''),escort:!!step.escort};game.system.signals.push(marker);}
 Object.assign(marker,{x:point.x,y:point.y,name:step.kind==='earth-rescue'?`${step.passenger.name} · rescue capsule`:step.escort?'Relief tug · escort corridor':step.title.replace(/^\d+ · /,''),...(op?.stepId===step.id?{integrity:op.integrity,maxIntegrity:op.maxIntegrity,failed:!!op.failed}:{})});
 if(step.kind==='earth-defense'&&op?.started&&!op.failed){
  for(let index=0;index<step.waves.length;index++)if(op.elapsed+1e-6>=step.waves[index].at){if(!op.waves.includes(index))op.waves.push(index);spawnWave(game,earth,step,index);}
 }
}
export function stepEarthCampaignWorld(coordinator,delta,participants=[coordinator]){
 const dt=clamp(finite(delta),0,.1);if(!dt)return;
 const seen=new Set();
 for(const game of participants){
  if(!game?.state||game.state.systemId!==coordinator.state.systemId)continue;
  const record=recordFor(game),step=currentStep(record);if(!record||!step)continue;
  const earth=ensureEarth(game,record);if(seen.has(earth.key))continue;seen.add(earth.key);
  syncEarthCampaignWorld(game);
  const op=earth.operation;if(step.kind!=='earth-defense'||step.at.systemId!==game.state.systemId||!op?.started||op.failed)continue;
  const context=game._earthFlightContext?.(op.shipId)||{ship:game.state.ship.id===op.shipId?game.state.ship:null,operating:game.state.mode==='ship'},carrier=context.ship;
  if(!carrier)continue;
  if(carrier.hull<=0||carrier.destroyed){op.failed='ship-loss';earth.failures++;continue;}
  const point=earthStageTarget(game,step,record),ids=expectedTargets(earth,step),threats=game.system.enemies.filter(enemy=>ids.includes(enemy.id)&&enemy.hp>0&&!neutralized(game,enemy.id)&&distance(enemy,point)<720);
  op.elapsed=Math.min(step.deadline,op.elapsed+dt);
  if(context.operating&&conscious(game)&&distance(carrier,point)<=900)op.held=Math.min(step.duration,op.held+dt);
  op.integrity=Math.max(0,op.integrity-threats.length*.9*dt);
  if(op.integrity<=0||op.elapsed>=step.deadline&&!defenseReady(game,earth,step)){
   op.failed=op.integrity<=0?'integrity':'timeout';earth.failures++;cleanOperation(game,earth,step);
   game._event('earth-defense-failed',{threadId:EARTH_CAMPAIGN_ID,stageId:step.id,text:op.failed==='integrity'?'The protected contact was lost. Regroup at the marker and arrange another attempt.':'The relief window closed. Regroup at the marker to retry.'});
  }
  syncEarthCampaignWorld(game);
 }
}
export function earthCampaignStatus(game){
 const record=recordFor(game),step=currentStep(record),earth=record?.earth,op=earth?.operation;
 if(!record)return{threadId:EARTH_CAMPAIGN_ID,stageId:EARTH_CAMPAIGN.stages[0].id,missionNumber:1,missionCount:16,status:'available',rescues:0,failures:0,carriedPassenger:null};
 const status={threadId:EARTH_CAMPAIGN_ID,stageId:step?.id||null,missionNumber:step?.mission||16,missionCount:16,status:record.status,rescues:earth?.delivered?.length||0,failures:earth?.failures||0,recoveries:earth?.recoveries||0,carriedPassenger:earth?.passenger?{name:earth.passenger.name,shipId:earth.passenger.shipId}:null};
 if(step?.kind==='earth-defense'){
  const present=game.state.systemId===step.at.systemId,ids=earth?.key?expectedTargets(earth,step):[];
  Object.assign(status,{operationId:earth?.key?operationId(earth,step):null,status:op?.failed?'failed':!op?'waiting':present&&defenseReady(game,earth,step)?'ready':'defending',held:op?.held||0,requiredHold:step.duration,integrity:op?.integrity??step.integrity+(earth?.delivered?.length||0)*24,maxIntegrity:op?.maxIntegrity??step.integrity+(earth?.delivered?.length||0)*24,elapsed:op?.elapsed||0,deadline:step.deadline,waves:op?.waves.length||0,totalWaves:step.waves.length,neutralized:present?ids.filter(id=>neutralized(game,id)).length:0,targets:step.waves.reduce((sum,wave)=>sum+wave.count,0),reason:op?.failed||null});
 }
 return status;
}
export function earthStageActions(game,record,step,helpers){
 if(!step.kind.startsWith('earth-'))return null;
 const earth=ensureEarth(game,record),action=step.kind==='earth-defense'?earth.operation?.failed?'retryDefense':earth.operation?'advance':'beginDefense':'advance';
 const access=earthStageAccess(game,record,step,action,helpers,step.at.entityId);
 const label=action==='retryDefense'?'Regroup and retry this defense':action==='beginDefense'?'Begin the relief defense':step.actionLabel;
 return[{action,label,available:access.ok,reason:access.reason||null}];
}
export function earthCarrierLost(game,shipId){
 const record=recordFor(game);if(record?.status!=='active'||!shipId)return{affected:false};
 const earth=ensureEarth(game,record),step=currentStep(record),passenger=earth.passenger?.shipId===shipId?earth.passenger:null;
 const operationLost=step?.kind==='earth-defense'&&earth.operation?.shipId===shipId;
 if(!passenger&&!operationLost)return{affected:false};
 if(operationLost){cleanOperation(game,earth,step);if(!earth.operation.failed)earth.failures++;earth.operation.failed='ship-loss';}
 if(passenger){
  // No phantom delivery or survivor transfer to a replacement hull. The relief
  // network returns this named survivor to the same rendezvous for a retry.
  if(step?.kind==='earth-defense'){earth.attempts[step.id]=Math.max(earth.attempts[step.id]||0,(earth.operation?.attempt||0)+1);earth.operation=null;}
  record.stage=passenger.pickupStage;earth.passenger=null;earth.recoveries++;
  game._log('Relief passage interrupted',`${passenger.name} reached a rescue capsule. The relief network has arranged another pickup at the original rendezvous. No delivery or stipend has been recorded.`,'thread');
 }
 syncEarthCampaignWorld(game);
 return{affected:true,campaignKey:earth.key,operationStep:operationLost?step.id:null,operationSystemId:operationLost?step.at.systemId:null};
}
export function earthCampaignRescue(game){return earthCarrierLost(game,game.state.ship?.id);}

export function earthSignalAction(game,signalId){
 const signal=game.system.signals.find(signal=>signal.id===signalId),record=recordFor(game),step=currentStep(record);
 if(!signal?.earthCampaign||!record||!step||signal.campaignKey!==record.earth?.key||signal.campaignStep!==step.id)return game._fail('That contact belongs to another captain’s relief operation. You may help protect it, but their investigation remains theirs.','mission');
 if(step.kind==='earth-defense')return game._ok({text:'Open Stories → Earth: The Long Silence to begin, monitor, or confirm this defense. Disable the marked attackers and protect the contact until the transfer is complete.',threadId:EARTH_CAMPAIGN_ID,campaign:earthCampaignStatus(game)});
 return game.threadAction({threadId:EARTH_CAMPAIGN_ID,action:'advance'});
}
