/** Authored fleet procedures. The authority owns contacts, timings and completed orders. */
import { cabinLayout } from './interior-layouts.mjs';
import { getShipClass } from './fleet.mjs';
import { navyDutyAccess } from './navy-duty.mjs';
import { navyMember } from './navy-service.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clone=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fail=(reason,code='navy-order')=>({ok:false,reason,message:reason,code});
const choice=(id,label)=>({id,label});
const stage=(id,title,station,duration,brief,choices,answer)=>({id,title,station,duration,brief,choices,answer});
const definitions={
 rescue:{title:'Search and rescue',brief:'A civilian tender has lost drive power. Establish its position, prepare the receiving ward, then recover its people. Keep the damaged ship intact.',roe:'Protect the tender. Fire only on positively identified attackers.',contact:{name:'Survey tender Little Lantern',classId:'mender',status:'Distress beacon · crew aboard',hull:.42},stages:[
  stage('locate','Resolve the distress bearing','security',12,'The beacon repeats two short pulses and one long pulse. The second return is debris, with no life-sign response. Send the live beacon to the bridge.',[choice('live-beacon','Report the repeating live beacon'),choice('debris','Report the silent debris return')],'live-beacon'),
  stage('triage','Prepare the casualty reception','medical',18,'The tender reports two walking wounded and one person with breathing difficulty. The ship’s medic needs the urgent patient called forward first; you are assisting the receiving team.',[choice('urgent-first','Relay: breathing casualty first'),choice('walking-first','Relay: walking wounded first')],'urgent-first'),
  stage('recover','Recover the remaining crew','airlock',18,'The rescue boat is alongside. Check the tether and receive the full manifest before releasing it. The coxswain will carry out the transfer while you keep the receiving watch.',[choice('account','Check tether and account for everyone'),choice('release','Release the boat without a headcount')],'account')
 ]},
 inspection:{title:'Traffic identification',brief:'An incomplete transponder is not proof of hostile intent. Compare the contact report, issue a challenge, and record its verified disposition.',roe:'Hold fire until the contact is identified. A bad transponder alone is not a hostile act.',contact:{name:'Unidentified freight contact',classId:'hauler',status:'Identity unconfirmed'},stages:[
  stage('compare','Compare the contact report','security',12,'The hull is following the declared freight lane. Its cargo beacon is valid, but its registry reply is incomplete. Report an identification problem, not a confirmed enemy.',[choice('unverified','Report: identity unverified'),choice('hostile','Declare it hostile immediately')],'unverified'),
  stage('challenge','Relay the identification challenge','manifest',18,'Signals has prepared a registry challenge and a safe holding position. Relay both and allow the civilian bridge time to answer. The signals officer handles the authenticated channel.',[choice('challenge','Relay challenge and holding position'),choice('threaten','Threaten fire without a challenge')],'challenge'),
  stage('disposition','Record the verified disposition','security',18,'Read the bridge’s identification result above. A compliant ship is released; a confirmed armed interceptor is reported for defensive action.',[choice('release','Log the compliant contact and release it'),choice('interceptor','Report the confirmed armed interceptor')],null)
 ]},
 survey:{title:'Navigation safety survey',brief:'A civilian lane has unreliable approach markers. Cross-check two independent fixes and publish a verified correction without disturbing the traffic.',roe:'This is a survey watch. Keep weapons safe unless the ship is attacked.',contact:{name:'Navigation tender Sounding Bell',classId:'tern',status:'Survey tender on station'},stages:[
  stage('reference','Take the independent reference','security',12,'The first range return is a bright moving freighter. The fixed navigation reflector is the correct reference. Send its steady return to the navigator.',[choice('fixed','Report the fixed reflector'),choice('moving','Use the moving freighter')],'fixed'),
  stage('cross-check','Cross-check the plotted correction','manifest',18,'The navigator’s independent fixes agree on the revised route. The old beacon disagrees. Record the two matching fixes; do not copy the faulty beacon into the new notice.',[choice('two-fixes','Log both independent fixes'),choice('old-beacon','Keep the old beacon value')],'two-fixes'),
  stage('publish','Transmit the navigation notice','security',18,'Traffic control is ready for the verified correction. Send the corrected approach and its hazard warning together so civilian crews can use it safely.',[choice('notice','Transmit correction and hazard warning'),choice('partial','Transmit the correction alone')],'notice')
 ]},
 repair:{title:'Engineering assistance',brief:'A disabled service vessel needs a controlled power transfer. Help the engineering team isolate the damaged feed, deliver the stores, and confirm a stable restart.',roe:'Protect the disabled vessel and its repair team. Do not fire at the tender.',contact:{name:'Service cutter Worklight',classId:'tern',status:'Power fault · repair team requested',hull:.56},stages:[
  stage('isolate','Relay the isolation check','manifest',12,'Engineering reports a damaged live feed and an intact reserve bus. Relay the order to isolate the damaged feed before the chief connects reserve power.',[choice('isolate','Relay: isolate the damaged feed'),choice('energize','Energize both feeds at once')],'isolate'),
  stage('stores','Pass the repair stores','airlock',18,'The chief has ordered a sealed coupling and insulating sleeve. Account for both on the transfer manifest before sending the team’s supply case.',[choice('complete-kit','Transfer coupling and insulating sleeve'),choice('coupling','Transfer only the coupling')],'complete-kit'),
  stage('restart','Witness the controlled restart','security',18,'The engineering officer will increase power in stages while the remote crew checks the repaired coupling. Keep the test report open for the whole load cycle.',[choice('staged','Monitor the staged load test'),choice('full','Order immediate full power')],'staged')
 ]},
 replenishment:{title:'Fleet replenishment',brief:'The carrier will take stores from a fleet auxiliary. Confirm the manifest, keep the transfer watch, and verify all lines are clear before separation.',roe:'The auxiliary is friendly. Weapons remain on defensive standby.',contact:{name:'Fleet auxiliary Long Table',classId:'hauler',status:'Replenishment rendezvous'},stages:[
  stage('manifest','Check the receiving manifest','manifest',12,'The signal sheet calls for medical packs and drive coolant. The spare ammunition pallet belongs to the next ship. Accept only the stores assigned to this carrier.',[choice('assigned','Accept medical packs and drive coolant'),choice('all','Accept every pallet')],'assigned'),
  stage('transfer','Keep the transfer station watch','airlock',18,'The deck crew has rigged the stores line. Confirm the receiving area is clear, then supervise the counted transfer. The deck officer controls the line.',[choice('clear','Confirm clear deck and count the stores'),choice('leave','Leave the line unattended')],'clear'),
  stage('separate','Confirm safe separation','security',18,'The auxiliary asks permission to widen the gap. Wait for the deck officer’s all-lines-clear report and relay it to the bridge before separation.',[choice('lines-clear','Relay the all-lines-clear report'),choice('separate','Order separation before the deck report')],'lines-clear')
 ]},
 evacuation:{title:'Civilian evacuation',brief:'A transport is collecting displaced civilians from a contested port. Establish the movement list, receive urgent casualties, and cover the final departure count.',roe:'Protect the evacuation transport. Identify armed threats before firing.',contact:{name:'Evacuation transport Open Door',classId:'hauler',status:'Civilian embarkation in progress'},stages:[
  stage('register','Verify the movement list','manifest',12,'The departure list separates checked passengers from people still awaiting a berth. Relay the checked list to the transport; do not report people ashore as safely aboard.',[choice('verified','Relay the verified boarding list'),choice('everyone','Mark everyone as already aboard')],'verified'),
  stage('casualties','Receive the urgent casualties','medical',18,'Medical reports one stretcher case and several walking passengers. Assist the medic by routing the stretcher case to the receiving ward first.',[choice('stretcher','Route the stretcher case first'),choice('queue','Keep the stretcher in the ordinary queue')],'stretcher'),
  stage('departure','Close the evacuation manifest','security',18,'The transport’s final count must match the checked movement list. Maintain the covering watch while the last shuttle docks and the counts are reconciled.',[choice('reconcile','Reconcile the final count and cover departure'),choice('guess','Approve departure from the estimate')],'reconcile')
 ]},
 exercise:{title:'Fleet readiness exercise',brief:'A controlled exercise tests identification, compartment response, and safe completion. Training contacts cannot hurt you; the procedures still need a real watch.',roe:'Only marked practice hulls are authorized targets. No live fire on the exercise tender.',contact:{name:'Exercise control Quiet Measure',classId:'tern',status:'Exercise control · friendly'},stages:[
  stage('identify','Confirm the exercise boundary','security',12,'Control marks the practice hulls with amber range codes. The white-beacon tender is the exercise staff. Acknowledge the amber targets only.',[choice('amber','Acknowledge amber range targets'),choice('white','Select the white-beacon tender')],'amber'),
  stage('muster','Report the simulated compartment muster','manifest',18,'The drill card specifies a simulated loss of ventilation. The chief is running the isolation drill; take the compartment headcount and relay it before the reset.',[choice('headcount','Relay the complete compartment headcount'),choice('reset','Reset the drill without a headcount')],'headcount'),
  stage('clearance','Close the range safety check','security',18,'Control needs the practice contacts disabled and all firing stations safe. Keep the gun watch while the final range check is recorded.',[choice('safe','Record the final range safety check'),choice('leave','Leave the exercise without a safety check')],'safe')
 ]},
 standoff:{title:'Border de-escalation',brief:'Two patrols dispute a relief ship’s route. Maintain separation, pass the bridge’s challenge, and respond to verified conduct. Rival colors alone do not authorize fire.',roe:'Hold fire unless an armed contact commits a hostile act. Leave the civilian relief ship a clear departure lane.',contact:{name:'Relief ship Common Ground',classId:'hauler',status:'Holding outside the disputed lane'},stages:[
  stage('separation','Report the separation picture','security',12,'The relief ship is inside the traffic corridor and the rival patrol is outside it. Report both positions accurately; the bridge needs space to negotiate.',[choice('positions','Report both positions and the open exit'),choice('enemy','Report every rival contact as an attacker')],'positions'),
  stage('signal','Relay the bridge’s measured signal','manifest',18,'The commander has authorized a clear route request and a separation limit. Send that message unchanged; threats or invented orders can turn a disagreement into a fight.',[choice('measured','Relay the route request and separation limit'),choice('ultimatum','Invent an ultimatum')],'measured'),
  stage('response','Report the patrol’s actual response','security',18,'Read the bridge’s verified response above. Record a withdrawal if the patrol yields; report a hostile act only if it actually opens fire.',[choice('withdrawal','Log the patrol’s withdrawal'),choice('hostile-act','Report the confirmed hostile act')],null)
 ]}
};
// Routine orders are work to carry out, not a repeated multiple-choice quiz.
// Identification and de-escalation retain a real choice based on the observed reply.
for(const value of Object.values(definitions)){for(const s of value.stages){if(s.answer)s.choices=s.choices.filter(choice=>choice.id===s.answer);s.choices.forEach(Object.freeze);Object.freeze(s.choices);Object.freeze(s);}Object.freeze(value.stages);Object.freeze(value.contact);Object.freeze(value);}
export const NAVY_OPERATION_DEFINITIONS=Object.freeze(definitions);
const definitionFor=contract=>definitions[contract?.navy?.operation?.kind];
const actorId=worker=>String(worker?.state?.multiplayer?.captainId||worker?.playerId||'');
const log=(game,contract,text)=>{const op=contract.navy.operation;op.comms.push({at:Math.round(contract.clock),text});op.comms=op.comms.slice(-12);game._event?.('crew-duty',{text,contractId:contract.id});};
const pointFor=(contract,station)=>{const layout=cabinLayout(contract.classId);return station==='airlock'?layout.spawn:station==='manifest'?layout.manifest:layout.stations[station];};
const stationName=station=>({security:'Gunnery console',manifest:'Crew manifest',medical:'Medical station',airlock:'Entry airlock'})[station]||station;
const stationRole=station=>({security:'weapons',medical:'medical'})[station]||null;

export function initializeNavyOperation(game,contract){
 const kind=contract.navy.procedureKind||contract.navy.kind,definition=definitions[kind];if(!definition)return;
 // Only authored new operations receive procedures. Older patrol and escort saves keep their earned progress.
 if(!contract.navy.operation)contract.navy.operation={version:1,kind,stageIndex:0,completed:false,identified:false,contacts:[],comms:[],tasks:definition.stages.map(s=>({id:s.id,done:false,running:false,elapsed:0,startedBy:null}))};
 const op=contract.navy.operation;
 op.comms=Array.isArray(op.comms)?op.comms:[];op.contacts=Array.isArray(op.contacts)?op.contacts:[];
}

function taskAccess(game,contract,worker,task){
 const access=navyDutyAccess(game,'weapons',{worker,requireStation:false});if(!access.ok)return access;
 if(typeof game._navyCanDuty==='function'&&!game._navyCanDuty(worker,'weapons'))return fail('Your current service assignment does not grant duty on this carrier.','permission');
 if(contract.phase!=='working')return fail('The commander will open these orders after the ship reaches its assigned station.','phase');
 if(!task)return fail('All procedure orders are recorded. Keep your remaining watch until the commander orders the return.','completed');
 if(contract.navy.operation?.kind==='rescue'&&task.id!=='locate'&&contract.navy.spawned&&(contract.work.targets||[]).some(target=>!target.neutralized))return fail('Clear the marked attackers before exposing the medical transfer team. Take the gunnery watch first.','navy-threat');
 const point=pointFor(contract,task.station),person=worker.state.person;
 if(!point||!Number.isFinite(person.x)||!Number.isFinite(person.y)||distance(person,point)>46)return fail(`Reach the ${stationName(task.station).toLowerCase()} aboard this carrier.`,'distance');
 return{ok:true};
}

function spawnContact(game,contract){
 const op=contract.navy.operation,definition=definitionFor(contract);if(op.contacts.length)return;
 const hull=getShipClass(definition.contact.classId),angle=contract.navy.heading,side=320;
 const contact={...hull.stats,id:`${contract.id}:procedure-contact`,classId:hull.id,name:definition.contact.name,ownerId:`fleet-procedure:${contract.id}`,faction:contract.factionId,militaryOperationId:contract.id,militaryObjective:true,npcEmployer:true,
  x:contract.workPoint.x+Math.cos(angle)*380-Math.sin(angle)*side,y:contract.workPoint.y+Math.sin(angle)*380+Math.cos(angle)*side,angle,vx:0,vy:0,hull:hull.stats.maxHull*(definition.contact.hull||1),maxHull:hull.stats.maxHull,shield:0,maxShield:hull.stats.maxShield};
 game.system.parkedShips||=[];game.system.parkedShips.push(contact);op.contacts.push(contact);log(game,contract,`${contact.name}: ${definition.contact.status}.`);
}

function activeTask(contract){const op=contract?.navy?.operation,definition=definitionFor(contract);return op&&definition?{task:definition.stages[op.stageIndex]||null,record:op.tasks[op.stageIndex]||null}:{};}
function expectedAnswer(contract,task){
 if(task.answer)return task.answer;
 if(contract.navy.operation.kind==='inspection')return contract.navy.attackPlanned?'interceptor':'release';
 if(contract.navy.operation.kind==='standoff')return contract.navy.attackPlanned?'hostile-act':'withdrawal';
 return null;
}

export function navyOperationAssist(game,contract,worker){
 const {task,record}=activeTask(contract);return!!(record?.running&&taskAccess(game,contract,worker,task).ok);
}

export function performNavyOrder(game,contract,{worker=game,playerId=actorId(worker),taskId,choiceId}={}){
 const op=contract.navy?.operation,{task,record}=activeTask(contract);
 if(!op||!task||typeof taskId!=='string'||task.id!==taskId)return fail('Use the current order on the Navy duty board.','task');
 if(actorId(worker)!==String(playerId))return fail('The order must use the acting captain’s identity.','permission');
 const access=taskAccess(game,contract,worker,task);if(!access.ok)return access;
 if(record.running)return fail('This order is already under way. Stay at its station until the watch is recorded.','running');
 if(typeof choiceId!=='string'||choiceId.length>40||!task.choices.some(choice=>choice.id===choiceId))return fail('Choose one of the current authored orders.','choice');
 if(choiceId!==expectedAnswer(contract,task))return fail('The chief stops that order: it does not match the verified report. Read the current instructions before trying again.','procedure');
 record.running=true;record.startedBy=String(playerId);record.startedAt=contract.clock;
 const member=navyMember(contract,playerId);if(member)member.ordersIssued=finite(member.ordersIssued)+1;
 log(game,contract,`Chief Nara: ${task.title.toLowerCase()} acknowledged. Hold the ${stationName(task.station).toLowerCase()} for ${task.duration} seconds; I will relay the specialist’s work.`);
 return{ok:true,text:`${task.title} under way. Remain at the ${stationName(task.station).toLowerCase()}.`,taskId:task.id};
}

export function stepNavyOperation(game,contract,dt){
 if(!definitionFor(contract)||contract.phase!=='working')return;
 const op=contract.navy.operation;spawnContact(game,contract);
 for(const [index,saved] of op.contacts.entries()){
  const live=game.system.parkedShips?.find(ship=>ship.id===saved.id);
  if(live)op.contacts[index]=live;else if(saved.hull>0){game.system.parkedShips||=[];game.system.parkedShips.push(saved);}
  const contact=live||saved;
  if(contact.hull<=0||contact.destroyed){contract.aborted=true;contract.failure=`The protected vessel ${contact.name} was lost.`;contract.phase='returning';contract.phaseClock=0;contract.dockedAt=null;log(game,contract,'Commander: the protected vessel has been lost. Suspend the operation and return for the inquiry.');return;}
 }
 const {task,record}=activeTask(contract);if(!task||!record?.running)return;
 const workers=game._sharedWorld?(game._navyOnlineWorkers||[]):[game];
 const attending=workers.filter(worker=>taskAccess(game,contract,worker,task).ok);
 if(!attending.length)return; // Disconnection, incapacitation and walking away pause real work.
 record.elapsed=Math.min(task.duration,finite(record.elapsed)+dt);
 if(record.elapsed+1e-6<task.duration)return;
 record.elapsed=task.duration;record.done=true;record.running=false;record.completedAt=contract.clock;op.stageIndex++;
 if(op.stageIndex===2&&['inspection','standoff'].includes(op.kind)){
  op.identified=true;
  const text=op.kind==='inspection'?(contract.navy.attackPlanned?'Signals: the registry challenge exposed a forged reply. An armed interceptor is breaking from cover; the freighter itself remains protected.':'Signals: registry confirmed. The freighter’s damaged transmitter explains the incomplete reply. It is complying with traffic control.'):(contract.navy.attackPlanned?'Commander: the rival patrol has opened fire across the relief lane. Hostile act confirmed; defend the civilian ship.':'Commander: the rival patrol has accepted the separation limit and is withdrawing. Keep the civilian exit open.');
  op.report=text;log(game,contract,text);
 }
 if(op.stageIndex>=definitionFor(contract).stages.length){op.completed=true;log(game,contract,'Chief Nara: procedure complete. Keep your remaining watch and protect the assigned vessels until the commander orders the return.');}
 else log(game,contract,`Chief Nara: ${task.title} recorded. Next: ${definitionFor(contract).stages[op.stageIndex].title.toLowerCase()}.`);
 if(task.id==='restart'&&op.kind==='repair')for(const saved of op.contacts){saved.hull=saved.maxHull;const live=game.system.parkedShips?.find(ship=>ship.id===saved.id);if(live)live.hull=live.maxHull;}
 if(task.id==='recover'&&op.kind==='rescue')op.rescued=3;
 if(task.id==='departure'&&op.kind==='evacuation')op.evacuated=24;
}

export function navyOperationAllowsContacts(contract){
 const op=contract.navy?.operation;if(!op)return true;
 if(['inspection','standoff'].includes(op.kind))return op.identified;
 return op.stageIndex>=1;
}

export function navyOperationFireAccess(game,contract){
 const op=contract.navy?.operation;if(!op||!['inspection','standoff'].includes(op.kind)||op.identified)return{ok:true};
 const incoming=(game.system.bullets||[]).some(shot=>(shot.team==='hostile'||game.system.enemies?.some(enemy=>enemy.id===shot.ownerId||enemy.id===shot.owner))&&(shot.targetVesselId===contract.vesselId||shot.targetId===contract.vesselId||shot.targetId===contract.employeeId)&&distance(shot,game.state.ship)<1600);
 return incoming?{ok:true}:fail('Weapons hold: report and challenge the unverified contact first. The batteries remain available against a confirmed incoming attack.','rules-of-engagement');
}

export function retireNavyOperation(game,contract){
 const ids=new Set((contract.navy?.operation?.contacts||[]).map(contact=>contact.id));if(!ids.size)return;
 game.system.parkedShips=(game.system.parkedShips||[]).filter(ship=>!ids.has(ship.id));
 const record=game._record();record.parkedShips=(record.parkedShips||[]).filter(ship=>!ids.has(ship.id));
}

export function navyOperationStatus(game,contract,{worker=game}={}){
 const definition=definitionFor(contract),op=contract.navy?.operation;if(!definition||!op)return null;
 const {task,record}=activeTask(contract),access=taskAccess(game,contract,worker,task),point=task&&pointFor(contract,task.station);
 const report=op.identified?op.report||'':'';
 return{kind:op.kind,title:definition.title,brief:definition.brief,rulesOfEngagement:contract.navy.spawned&&!contract.navy.training?'Weapons free on the marked attackers. Keep the assigned civilian or friendly vessel safe.':definition.roe,report,stageIndex:op.stageIndex,totalStages:definition.stages.length,completed:!!op.completed,
  activeTask:task?{id:task.id,title:task.title,brief:task.brief,stationName:stationName(task.station),stationRole:stationRole(task.station),target:{...point,...(task.station==='manifest'?{entityId:`ship:${contract.vesselId}:crew-console`}:task.station==='airlock'?{entityId:`ship:${contract.vesselId}:entry-airlock`}:{stationRole:stationRole(task.station)})},ready:access.ok&&!record.running,reason:access.code==='navy-threat'?access.reason:record.running?'Keep this station attended while the crew completes the order.':access.reason||null,combatFirst:access.code==='navy-threat',choices:clone(task.choices),duration:task.duration,elapsed:finite(record.elapsed),running:!!record.running}:null,
  stages:definition.stages.map((value,index)=>({id:value.id,title:value.title,done:!!op.tasks[index]?.done})),comms:clone(op.comms),contacts:op.contacts.map(contact=>({name:contact.name,status:contact.hull<=0?'Lost':op.completed?'Operation recorded':definition.contact.status})),rescued:finite(op.rescued),evacuated:finite(op.evacuated)};
}
