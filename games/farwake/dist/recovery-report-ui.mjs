/** Personal voyage records. Presentation never invents a casualty or moves a crew. */
import { escapeHtml as esc, fmt } from './ui.mjs';
import { CREW_ROLES } from './fleet.mjs';

const people = rows => Array.isArray(rows) ? rows : [];
const placeName = place => place?.name || place?.bodyName || 'Location not recorded';
const roleName = person => CREW_ROLES[person.role]?.name || person.roleLabel || person.role || 'Crew';
const statusNames = {aboard:'Aboard',waiting:'Waiting',recovered:'Recovered ashore',dead:'Died',unknown:'Not accounted for'};
const shipStatusNames = {lost:'Lost',destroyed:'Destroyed',occupied:'Occupied by hostiles',intact:'Intact',parked:'Berthed',berthed:'Berthed',survived:'Survived',aboard:'In service',unknown:'Condition not recorded',unowned:'No personal ship'};
const serviceOutcomes = {'in-progress':'Operation in progress',interrupted:'Operation interrupted',completed:'Operation completed',success:'Operation completed',failed:'Operation failed',aborted:'Operation ended early'};
const textOf = value => typeof value === 'string' ? value : value?.text || value?.summary || '';
const shipTime = value => `${Math.floor((Number(value)||0)/60)}:${String(Math.floor(Number(value)||0)%60).padStart(2,'0')}`;
function arrivalCrewSummary(report){
 const own=people(report.crew).filter(person=>person.personal!==false),rows=own.length?own:people(report.crew),living=rows.filter(person=>!['dead','unknown'].includes(person.status)&&person.health>0),injured=living.filter(person=>Number.isFinite(person.maxHealth)&&person.health<person.maxHealth),dead=rows.filter(person=>person.status==='dead'),unknown=rows.filter(person=>person.status==='unknown');
 if(!rows.length)return 'You made it back. No named crew outcomes were recorded for this incident.';
 return `You made it back. ${own.length?'Your personal crew':'The ship’s company'}: ${living.length} alive and accounted for${injured.length?`, ${injured.length} still injured`:''}${dead.length?`; ${dead.length} died`:''}${unknown.length?`; ${unknown.length} not yet accounted for`:''}.`;
}

export function crewOutcomeMarkup(rows,{empty='No named crew are recorded for this incident.'}={}){
 const crew=people(rows);
 if(!crew.length)return `<p class="mini muted">${esc(empty)}</p>`;
 return `<ul class="recovery-crew-list">${crew.map(person=>`<li data-outcome="${esc(person.status||'unknown')}"><div><strong>${esc(person.name||'Unnamed crew')}</strong><span>${esc(roleName(person))}${person.participated?' · Boarding party':''}</span></div><div><strong>${esc(person.duty==='reserve'&&person.status!=='dead'?'In reserve':statusNames[person.status]||person.status||'Not accounted for')}</strong><span>${esc(placeName(person.location))}${person.status!=='dead'&&person.duty!=='reserve'&&Number.isFinite(person.health)&&Number.isFinite(person.maxHealth)?` · Health ${Math.ceil(person.health)}/${person.maxHealth}`:''}</span>${person.status==='dead'&&person.cause?`<span>${esc(person.cause)}</span>`:''}</div></li>`).join('')}</ul>`;
}

export function recoveryReportMarkup(report){
 if(!report)return '<p>No recovery has been recorded on this voyage.</p>';
 const own=people(report.crew).filter(person=>person.personal!==false),service=people(report.crew).filter(person=>person.personal===false),ship=report.ship;
 const cause=textOf(report.cause)||'The available record does not establish what caused the loss of consciousness.';
 const unknowns=people(report.unknowns).map(textOf).filter(Boolean);
 const losses=report.losses||{},cargo=typeof losses.cargo==='number'?losses.cargo:Object.values(losses.cargo||{}).reduce((sum,value)=>sum+(Number(value)||0),0),upgrades=Array.isArray(losses.upgrades)?losses.upgrades.length:typeof losses.upgrades==='number'?losses.upgrades:Object.keys(losses.upgrades||{}).length;
 const lost=[cargo?`${fmt(cargo)} cargo`:null,upgrades?`${fmt(upgrades)} installed upgrade${upgrades===1?'':'s'}`:null,losses.credits?`${fmt(losses.credits)} CR`:null].filter(Boolean);
 return `<div class="recovery-record">
  <section><h3>What happened</h3><p>${esc(cause)}</p><p class="mini">${report.boarding?.targetName?`Boarding target: ${esc(report.boarding.targetName)}<br>`:''}${esc(report.source?.vesselName||placeName(report.source))} → ${esc(placeName(report.recoveryDestination))}</p>${report.legacy?'<p class="mini muted">This report was recovered from an older save. Only recorded facts are included.</p>':''}${unknowns.length?`<p class="mini muted">${unknowns.map(esc).join(' ')}</p>`:''}</section>
  <section><h3>${ship?.personal===false?'Incident vessel':'Your ship'}</h3>${ship?`<p><strong>${esc(ship.name||'Recorded vessel')}</strong> · ${esc(shipStatusNames[ship.status]||ship.status||'Condition not recorded')}<br>${esc(placeName(ship.location))}</p>`:'<p>No vessel is listed in this record.</p>'}${lost.length?`<p class="mini">Recorded losses: ${esc(lost.join(' · '))}.</p>`:''}</section>
  <section><h3>Your crew · ${own.length} named</h3>${crewOutcomeMarkup(own)}${report.reserveCount?`<p class="mini muted">${fmt(report.reserveCount)} departure crew in reserve. They are not listed as people on this boarding party.</p>`:''}</section>
  ${service.length?`<section><h3>Service company</h3>${crewOutcomeMarkup(service)}</section>`:''}
  ${report.service?`<section><h3>Service record</h3><p>${esc([report.service.title,report.service.rank].filter(Boolean).join(' · ')||'Military service')}${report.service.outcome?`<br>${esc(serviceOutcomes[report.service.outcome]||textOf(report.service.outcome)||report.service.outcome)}`:''}</p></section>`:''}
 </div>`;
}

/** The same next step appears on the HUD and at the top of the full report. */
export function recoveryNextStep(report,passage=null){
 const r=report?.evacuation;
 if(report?.arrival?.arrived&&!report.arrival.acknowledged)return {kind:'arrival',label:'Read your return debrief',title:`You’re back at ${placeName(report.home||report.recoveryDestination)}`,detail:arrivalCrewSummary(report)};
 if(r?.detained)return {kind:'detained',label:'Custody & return orders',title:'Military custody',detail:`Release is automatic. Your service covers passage to ${placeName(r.home)} afterward.`};
 if(r?.passage)return {kind:passage?.canFinish?'disembark':'passage',label:passage?.canFinish?`Disembark at ${placeName(passage.destination||r.home)}`:'Your passage home',title:`Passage to ${placeName(r.home)} · 0 CR`,detail:passage?.task||'The transport captain has the helm.'};
 if(r&&!r.arrived){
  if(r.canBook)return {kind:'board',label:`Board for ${placeName(r.home)} · Free`,title:`Evacuation to ${placeName(r.home)} · 0 CR`,detail:r.pickup?`Depart from ${r.pickup.name}. You travel as a passenger.`:'Your service covers this passenger berth.'};
  if(r.evacuation&&r.pickup&&!r.nearPickup)return {kind:'pickup',label:'Show evacuation pickup',title:`Evacuation to ${placeName(r.home)} · 0 CR`,detail:`${r.pickup.name}${Number.isFinite(r.pickup.distance)?` · ${Math.ceil(r.pickup.distance)} m away`:''}. Follow the marked route to board.`};
  return {kind:'report',label:'Review return orders',title:`Passage to ${placeName(r.home)} · 0 CR`,detail:r.reason||'Your service covers a passenger berth home.'};
 }
 return {kind:'report',label:'Review recovery report',title:report?.arrival?.arrived?'Return recorded':'Recovery report',detail:`${placeName(report?.recoveryDestination)} · Ship and named crew outcomes are recorded.`};
}

/** Exact current boarding allies, rather than the size of a private reserve. */
export function hostileBoardingBrief(game,enemy){
 const crew=people(game.livingCrew).filter(person=>person.health>0&&person.status!=='dead'),ship=game.state.ship;
 const aboard=crew.length?`You and ${crew.length} allied NPC${crew.length===1?'':'s'} will cross to ${enemy.name||'the target'}.`:`You will cross to ${enemy.name||'the target'} without allied NPC crew.`;
 return {allyCount:crew.length,names:crew.map(person=>person.name),text:aboard,exposure:`${ship.name||'Your current ship'} stays alongside with ${Math.max(0,Math.ceil(ship.hull||0))}/${Math.ceil(ship.maxHull||0)} hull. Both ships remain exposed to outside fire during boarding.`,exit:'Return through the entry airlock while your origin ship is intact and within tether reach. Clear the defenders before taking the target’s helm.'};
}

export function createRecoveryReportUI({getGame,dialog,invoke,acceptResult,onChange=()=>{},openPassage=()=>{},openDuty=()=>{},openCompany=null,openCrewManagement=null,openPort=()=>{},markEntity=()=>{}}){
 let owner=null,seen=new Set(),pending=false;
 const game=()=>getGame();
 const reports=()=>game().recoveryReports?.()||[game().recoveryReport?.()].filter(Boolean);
 function resetOwner(){const current=game(),identity=current.state.seed+':'+(current.state.multiplayer?.captainId||'solo');if(owner!==identity){owner=identity;seen=new Set();}}
 function presentationKey(report){return report.id+':'+(report.arrival?.arrived?'arrival':'recovery');}
 function markSeen(report){resetOwner();seen.add(presentationKey(report));}
 function sync({enabled=true,blocked=false,report=game().recoveryReport?.()}={}){
  resetOwner();if(!enabled||blocked||game().medicalRecoveryActive?.()||!report||report.arrival?.acknowledged||seen.has(presentationKey(report)))return false;
  open(report.id);return true;
 }
 async function run(name,args={},after=null){
  if(pending)return false;
  const current=game(),captain=current.state.multiplayer?.captainId||current.state.seed,revision=dialog.revision;pending=true;
  try{
   const answer=await invoke(name,args);
   if(game()!==current||(game().state.multiplayer?.captainId||game().state.seed)!==captain)return false;
   if(dialog.revision!==revision){onChange();return false;}
   if(!acceptResult(answer)){if(dialog.revision===revision)dialog.body.insertAdjacentHTML('beforeend',`<p class="recovery-feedback" role="status">${esc(answer?.reason||'That action is not available here yet.')}</p>`);return false;}
   if(dialog.revision===revision)dialog.close();onChange();if(!dialog.opened)after?.();return true;
  }finally{pending=false;}
 }
 function stepChoices(report){
  const g=game(),passage=g.npcContractStatus?.(),next=recoveryNextStep(report,passage),r=report.evacuation;
  if(next.kind==='arrival')return [{label:`Acknowledge return to ${placeName(report.home||report.recoveryDestination)}`,disabled:report.canAcknowledge===false,detail:report.acknowledgmentReason||'Keep this report in your voyage log.',action:()=>run('acknowledgeRecoveryReport',{id:report.id})}];
  if(next.kind==='board')return [{label:next.label,detail:`Fare 0 CR · Destination ${placeName(r.home)}`,action:()=>run('startMilitaryPassage')}];
  if(next.kind==='disembark')return [{label:next.label,detail:'Complete the free passage and step ashore.',action:()=>run('completeNpcContract')}];
  if(next.kind==='passage')return [{label:'Open passenger orders',detail:next.detail,action:openDuty}];
  if(next.kind==='pickup')return [{label:next.label,detail:next.detail,action:()=>{dialog.close();markEntity(r.pickup);}}];
  if(next.kind==='detained')return [{label:'Return to the cell',detail:next.detail,action:()=>dialog.close()}];
  return [];
 }
 function routeMarkup(report){
  const next=recoveryNextStep(report,game().npcContractStatus?.()),r=report.evacuation;
  if(next.kind==='arrival')return `<div class="recovery-arrival" role="status"><strong>You’re back at ${esc(placeName(report.home||report.recoveryDestination))}.</strong><p>${esc(arrivalCrewSummary(report))}</p><p class="mini">Check your crew’s locations below, or open the roster to meet survivors waiting here. This account stays in your voyage log.</p></div>`;
  if(r&&!r.arrived)return `<div class="recovery-route"><strong>${esc(next.title)}</strong><p>${esc(next.detail)}</p>${r.reason&&r.reason!==next.detail&&next.kind!=='pickup'?`<p class="mini">${esc(r.reason)}</p>`:''}${r.evacuation?'<p class="mini">The shuttle is free. Ship condition and crew locations are listed below.</p>':''}</div>`;
  return '';
 }
 function open(id){
  const saved=game().recoveryReport?.(id);if(!saved){openHistory();return;}
  const current=game().recoveryReport?.()?.id===saved.id,report=current?saved:{...saved,evacuation:null};
  markSeen(report);const arrived=report.arrival?.arrived;
  dialog.open(arrived?`Return to ${placeName(report.home||report.recoveryDestination)}`:report.title||'Recovery report','recovery-report',{contextKey:'recovery:'+report.id,eyebrow:arrived?'RETURN DEBRIEF / PERSONAL RECORD':'MEDICAL RECOVERY / PERSONAL RECORD'});
  dialog.html(current?routeMarkup(report):'<p class="mini muted">An earlier recovery record. Your current crew locations are available below.</p>');if(current)dialog.choices(stepChoices(report));
  dialog.body.insertAdjacentHTML('beforeend',recoveryReportMarkup(report));
  dialog.choices([{label:'Where is my crew now?',detail:'Personal crew, current ship’s company, and recovered survivors.',action:openCrew},...(reports().length>1?[{label:'Earlier recovery reports',action:openHistory}]:[]),{label:'Back to the world',detail:'You can review this report from Crew or your voyage log.',action:()=>dialog.close()}]);
 }
 function primary(){
  const report=game().recoveryReport?.();if(!report){openPassage();return;}
  const next=recoveryNextStep(report,game().npcContractStatus?.());
  if(['board','disembark','pickup','passage'].includes(next.kind)){const choice=stepChoices(report)[0];return choice?.action();}
  open(report.id);
 }
 function openCrew(){
  const g=game(),where=g.crewWhereabouts?.()||{groups:[]},groups=people(where.groups);
  dialog.open('Your crew & their whereabouts','crew-whereabouts',{eyebrow:'PERSONAL ROSTER / CURRENT LOCATIONS'});
  dialog.html('<p class="section-note">Your personal crew and the company on a service ship are listed separately. A location tells you where to meet each person.</p>');
  if(!groups.length)dialog.body.insertAdjacentHTML('beforeend','<p>No named crew are currently recorded.</p>');
  for(const group of groups){
   const samePlace=group.location?.systemId===g.state.systemId&&group.location?.bodyId===g.state.locationId&&!g.state.interior;
   dialog.body.insertAdjacentHTML('beforeend',`<section class="recovery-crew-group"><h3>${esc(group.label||({personal:'Your personal crew',service:'Current service company',recovered:'Recovered survivors'}[group.kind])||'Crew')}</h3><p class="mini">${esc(placeName(group.location))}</p>${crewOutcomeMarkup(group.crew,{empty:'No named crew in this group.'})}${group.reserveCount?`<p class="mini muted">${fmt(group.reserveCount)} departure crew in reserve. Only the active watch appears on deck.</p>`:''}</section>`);
   if(group.kind==='recovered'&&people(group.crew).some(person=>person.health>0&&person.status!=='dead'))dialog.choices([
    ...(samePlace?[{label:'Show these survivors',detail:'Meet them beside the clinic or aid post.',action:()=>{dialog.close();markEntity({crewId:group.crew.find(person=>person.health>0&&person.status!=='dead').id});}}]:[]),
    {label:'Bring survivors aboard your ship',disabled:!group.canRejoin,detail:group.reason||'Your ship must be at this port with room for them.',action:()=>run('rejoinRecoveredCrew',{groupId:group.id},openCrew)}
   ]);
  }
  const report=g.recoveryReport?.();
  dialog.choices([...(report?[{label:'Recovery & return report',detail:report.title||'Ship condition, named outcomes, and passage home.',action:()=>open(report.id)}]:[]),...(g.state.npcContract?.active?[{label:g.state.npcContract.repatriation?'Your passage home':'Current ship duty',action:openDuty},...(g.state.npcContract.military?.branchId==='navy'&&openCompany?[{label:'Current Navy ship’s company',action:openCompany}]:[])]:openCrewManagement?[{label:'Crew hiring & alliances',action:openCrewManagement}]:[]),{label:'Back to the world',action:()=>dialog.close()}]);
 }
 function openHistory(){
  const entries=reports();dialog.open('Recovery & return records','recovery-history',{eyebrow:'CAPTAIN’S VOYAGE LOG'});
  dialog.html(entries.length?'<p>Recorded ship and crew outcomes remain here after you acknowledge your return.</p>':'<p>No recovery has been recorded on this voyage.</p>');
  dialog.choices([...entries.map(report=>({label:report.title||'Recovery report',detail:`Shiptime ${shipTime(report.at)} · ${placeName(report.recoveryDestination)}${report.arrival?.arrived?' · Returned':''}`,action:()=>open(report.id)})),{label:'Your crew & whereabouts',action:openCrew},{label:'Back to the world',action:()=>dialog.close()}]);
 }
 function appendLogEntry(parent){
  if(!reports().length)return;
  const button=document.createElement('button');button.type='button';button.className='recovery-log-link';button.textContent='Recovery & return records';button.onclick=openHistory;parent.append(button);
 }
 return {open,openCrew,openHistory,primary,sync,appendLogEntry};
}
