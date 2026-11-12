/** Port travel and paid crew work share one compact, context-aware menu. */
import { escapeHtml as esc, fmt } from './ui.mjs';

export function createLivelihoodUI({getGame,dialog,invoke,acceptResult,refreshWorld,markEntity,openJobs,openShipyard,openProfile,openDamage,openNavyDuty=null}){
 const game=()=>getGame();
 const purse=()=>`${fmt(game().state.credits)} CR AVAILABLE`;
 const finish=async(name,args={})=>{const owner=game(),captain=owner.state.multiplayer?.captainId||owner.state.seed,revision=dialog.revision;const answer=await invoke(name,args);if(game()!==owner||(game().state.multiplayer?.captainId||game().state.seed)!==captain)return false;if(dialog.revision!==revision){refreshWorld();return false;}if(!acceptResult(answer))return false;if(dialog.revision===revision)dialog.close();refreshWorld();return true;};
 function openPort(){
  if(game().militaryRecoveryStatus?.()?.detained){openRecovery();return;}
  if(game().state.npcContract?.active){openDuty();return;}
  const g=game(),port=g.atInhabitedPort,berth=g.state.livelihoods?.parkedShip,recovery=g.militaryRecoveryStatus?.(),lost=g.state.fleet.history?.some(entry=>entry.type==='loss');
  const parked=g.galaxy.find(s=>s.id===berth?.systemId)?.bodies.find(b=>b.id===berth?.bodyId);
  dialog.open(port?(g.currentBody?.name||'Port services'):'Between voyages','port-services',{eyebrow:purse()});
  dialog.html(parked&&!g.canUseOwnShipHere()?`<p class="port-arrival">Your ship is berthed at <strong>${esc(parked.name)}</strong>.</p>`:!g.ownsShip?`<p class="port-arrival">${lost?'Your ship was lost. Passage, crew work and replacement hulls are available here.':'Earn your first ship, one paid shift at a time.'}</p>`:'');
  dialog.choices([
   ...(recovery&&!recovery.arrived?[{label:`Military passage home · ${recovery.home.name}`,detail:`0 CR · Personal ${recovery.factionName} repatriation clearance`,action:openRecovery}]:[]),
   {label:'Passenger tickets',detail:'Choose a destination and fare.',disabled:!port,action:openPassage},
   {label:'Join a paid crew',detail:'Freight, repairs, survey, care and security work.',disabled:!port,action:openCrewJobs},
   {label:'Local jobs',detail:'No ship needed for dockside work.',disabled:!port,action:()=>{dialog.close();markEntity({type:'jobboard'});}},
   {label:g.ownsShip?'Visit the shipwright':lost?'Buy a replacement ship':'Buy your first ship',detail:g.ownsShip?'Hulls, upgrades and repairs.':'Used hulls. Prices at the workshop.',disabled:!port,action:()=>{dialog.close();markEntity({type:'mechanic'});}},
   {label:'Your captain',detail:'Appearance & traits',action:openProfile},
   {label:'Back outside',action:()=>dialog.close()}
  ]);
 }
 function openRecovery(){
  const r=game().militaryRecoveryStatus?.();if(!r){openPort();return;}
  const minutes=Math.floor(r.remainingSeconds/60),seconds=String(r.remainingSeconds%60).padStart(2,'0');
  dialog.open(r.detained?'Military custody':'Your passage home','military-recovery',{eyebrow:r.detained?r.captorFaction:r.factionName});
  dialog.html(r.detained?`<div class="guide-card"><h3>${minutes}:${seconds} remaining</h3><p>You are held as opposing military personnel. The five-minute term counts time in active play and survives saving or reconnecting.</p><p>After release, request a free passenger berth to ${esc(r.home.name)} using your own service clearance.</p></div>`:`<div class="guide-card"><h3>${esc(r.home.name)}</h3><p>${esc(r.rank)} · ${esc(r.factionName)}</p><p>Your repatriation warrant covers the full fare: <strong>0 CR</strong>. Captain Vale flies the service shuttle while you ride as a passenger. Use its entry airlock after docking.</p><p>Your personal ship ownership and rank are unchanged.</p>${r.reason?`<p>${esc(r.reason)}</p>`:''}</div>`);
  dialog.choices([...(!r.detained&&!r.arrived?[{label:'Board free military transport',disabled:!r.canBook,detail:r.reason||'Personal clearance verified before embarkation.',action:()=>finish('startMilitaryPassage')}]:[]),{label:r.detained?'Return to cell':'Port services',action:r.detained?()=>dialog.close():openPort}]);
 }
 function openPassage(){
  const g=game(),routes=g.passengerRoutes(),recovery=g.militaryRecoveryStatus?.();
  dialog.open('Passenger departures','passage',{eyebrow:`${g.currentBody?.name||'PORT'} / ${purse()}`});
  dialog.html(`<p>Pay on departure. ${g.ownsShip?'Your ship and crew stay here.':'You arrive on foot.'}</p>${routes.length?'':'<p>No passenger departures are available at this location.</p>'}`);
  dialog.choices([...(recovery&&!recovery.arrived?[{label:`Military passage · ${recovery.home.name}`,detail:'0 CR · Your service covers the fare.',action:openRecovery}]:[]),...routes.map(route=>({label:route.name||route.bodyName,detail:`Fare ${route.fare} CR · You have ${fmt(g.state.credits)} CR · After ${fmt(Math.max(0,g.state.credits-route.fare))} CR${route.ok?'':` · ${route.reason}`}`,disabled:!route.ok,action:()=>confirmPassage(route.bodyId)})),{label:'Port services',action:openPort}]);
 }
 function confirmPassage(bodyId){
  const g=game(),quote=g.passengerQuote(bodyId);
  dialog.open(`Passage to ${quote.name||'another port'}`,'passage-confirm',{eyebrow:'PAID PASSENGER SERVICE'});
  dialog.html(`<p><strong>${esc(quote.originName)} → ${esc(quote.name)}</strong></p><div class="guide-card"><p>Fare: <strong>${quote.fare} CR</strong><br>You have: <strong>${fmt(g.state.credits)} CR</strong><br>After payment: <strong>${fmt(g.state.credits-quote.fare)} CR</strong></p></div><p>You disembark at the destination landing. ${g.ownsShip?'Your ship is not transported with you.':''}</p>`);
  dialog.choices([{label:`Pay ${quote.fare} CR & travel`,disabled:!quote.ok,action:()=>finish('takePassengerTransit',{bodyId})},{label:'Choose another departure',action:openPassage}]);
 }
 function openCrewJobs(){
  const g=game();if(g.state.npcContract?.active){openDuty();return;}
  const offers=g.npcContractOffers();
  dialog.open('Work the next passage','crew-jobs',{eyebrow:purse()});
  dialog.html('<p class="section-note">Choose your work. The captain handles the flight.</p>');
  dialog.choices([...offers.map(offer=>({label:offer.title||offer.roleName||offer.name,detail:`${offer.roleName||offer.name||'Crew'} · ${offer.reward} CR · ${offer.routeName||'Local round trip'}`,disabled:offer.available===false,action:()=>confirmCrew(offer)})),{label:'Port services',action:openPort}]);
 }
 function confirmCrew(offer){
  const roleId=offer.roleId||offer.id;
  dialog.open(offer.title||offer.roleName||offer.name,'crew-job-confirm',{eyebrow:offer.roleName||offer.name||'PAID CREW'});
  dialog.html(`<p>${esc(offer.description||offer.task)}</p>${offer.routeName?`<p class="duty-route">${esc(offer.routeName)}</p>`:''}<div class="duty-pay"><strong>${offer.reward} CR</strong><span>on completion · no joining fee</span></div><p class="mini">You have ${fmt(game().state.credits)} CR. ${game().ownsShip?'Your own ship stays here.':''}</p><p class="section-note">Prepare your station, do the work, return for pay.</p>`);
  dialog.choices([{label:'Sign on & board',action:()=>finish('acceptNpcContract',{roleId,offerId:offer.offerId})},{label:'Other assignments',action:openCrewJobs}]);
 }
 function markDuty(){
  const status=game().npcContractStatus();dialog.close();markEntity(status?.target||{});
 }
 function openTask(){
  const g=game(),status=g.npcContractStatus(),task=status?.activeTask;if(!task){openDuty();return;}
  dialog.open(task.title,'crew-task',{eyebrow:status.shipName||'ON WATCH'});
  const brief=task.brief||status.task;
  dialog.html(brief&&brief!==task.puzzle?.prompt?`<p>${esc(brief)}</p>`:'');
  if(!task.ready){dialog.body.insertAdjacentHTML('beforeend',`<p class="result-note">${esc(task.reason||'Reach the marked workstation.')}</p>`);dialog.choices([{label:'Show my station',action:markDuty},{label:'Crew duty',action:openDuty}]);return;}
  const puzzle=task.puzzle,values=[],fields=[];
  if(puzzle){
   const panel=document.createElement('fieldset');panel.className='crew-work-panel';
   const legend=document.createElement('legend');legend.textContent=puzzle.type==='manifest'?'CARGO MANIFEST':'WORK PANEL';panel.append(legend);
   if(puzzle.prompt){const p=document.createElement('p');p.textContent=puzzle.prompt;panel.append(p);}
   if(puzzle.clues?.length){const clues=document.createElement('ul');clues.className='crew-clues';for(const clue of puzzle.clues){const li=document.createElement('li');li.textContent=clue;clues.append(li);}panel.append(clues);}
   for(const[inputIndex,input]of(puzzle.inputs||[]).entries()){
    const label=document.createElement('label');label.className='crew-field';const name=document.createElement('span');name.textContent=input.label;label.append(name);
    const select=document.createElement('select');select.setAttribute('aria-label',input.label);const initial=document.createElement('option');initial.value='';initial.textContent='Select…';select.append(initial);
    for(const option of input.options||[]){const item=document.createElement('option');item.value=String(option.id??option.value??option);item.textContent=option.label??String(option);select.append(item);}
    values[inputIndex]='';select.onchange=()=>{values[inputIndex]=select.value;};fields.push(select);label.append(select);panel.append(label);
   }
   dialog.body.append(panel);
  }
  const feedback=document.createElement('p');feedback.className='crew-task-feedback';feedback.setAttribute('role','status');dialog.body.append(feedback);
  let pending=false;const revision=dialog.revision;
  dialog.choices([{label:puzzle?'Confirm settings':'Complete task',action:async()=>{
   if(pending)return;
   if(fields.some(field=>!field.value)){feedback.textContent='Set each control first.';return;}
   pending=true;for(const field of fields)field.disabled=true;
   try{
    const answer=await invoke('npcContractAction',{action:'task',taskId:task.id,solution:fields.map(field=>field.value)});
    if(game()!==g||game().state.npcContract?.id!==status.id)return;
    if(dialog.revision!==revision){refreshWorld();return;}
    if(!answer?.ok){feedback.textContent=answer?.reason||'Check your settings and try again.';return;}
    dialog.close();refreshWorld();
   }finally{pending=false;for(const field of fields)field.disabled=false;}
  }},{label:'Back to the deck',action:()=>dialog.close()}]);
 }
 function openDuty(){
  if(openNavyDuty?.())return;
  const passage=game().npcContractStatus?.();if(passage?.repatriation){
   dialog.open('Your passage home','crew-duty',{eyebrow:'MILITARY PASSENGER / FARE COVERED'});
   dialog.html(`<h3>${esc(passage.shipName)}</h3><p class="duty-route">${esc(passage.routeName)}</p><div class="guide-card"><p>${esc(passage.task)}</p></div><p>Fare: <strong>0 CR</strong>. Captain Vale has the helm. The shuttle belongs to the transport service.</p>`);
   dialog.choices([...(passage.canFinish?[{label:`Disembark at ${passage.destination.name}`,action:()=>finish('completeNpcContract')}]:[]),{label:passage.canFinish?'Show the entry airlock':'Back to the passenger deck',action:()=>{dialog.close();if(passage.canFinish)markEntity({type:'exit'});}}]);return;
  }
  const g=game(),s=g.npcContractStatus();if(!s?.active){openPort();return;}
  const phases={boarding:'Before departure',outbound:'Under way',working:'On station',returning:'Homeward',docked:'Moored',failed:'Run interrupted'};
  dialog.open(s.title||s.roleName||'Your watch','crew-duty',{eyebrow:`${s.shipName||'NPC VESSEL'} · ${phases[s.phase]||s.phase}`});
  const task=s.activeTask;
  dialog.html(`<div class="duty-current"><span>${s.canFinish?'WATCH COMPLETE':'YOUR NEXT TASK'}</span><strong>${esc(s.canFinish?'Collect your pay':task?.title||s.task||'Follow the duty marker')}</strong>${task?.brief?`<p>${esc(task.brief)}</p>`:''}</div>${s.eva?.active?`<div class="eva-oxygen"><span>SUIT AIR</span><strong>${Math.ceil(s.eva.oxygen)}s</strong><meter min="0" max="${s.eva.maxOxygen||120}" value="${s.eva.oxygen}">Suit oxygen</meter></div>`:''}<p class="duty-route">${esc(s.routeName||s.origin?.name||'Local route')}</p><div class="duty-pay"><strong>${fmt(s.earned||0)} / ${s.reward} CR</strong><span>${s.done?'work complete':Math.round((s.progress||0)*100)+'% work complete'}</span></div>`);
  if(s.tasks?.length){const list=document.createElement('ol');list.className='duty-checklist';for(const t of s.tasks){const row=document.createElement('li');row.className=t.done?'done':t.id===task?.id?'current':'';row.innerHTML=`<span aria-hidden="true">${t.done?'✓':t.id===task?.id?'→':'·'}</span>${esc(t.title)}`;list.append(row);}dialog.body.append(list);}
  const lastCall=s.comms?.at(-1);if(lastCall&&['outbound','returning'].includes(s.phase)){const note=document.createElement('p');note.className='duty-comms';note.textContent=typeof lastCall==='string'?lastCall:lastCall.text||'';if(note.textContent)dialog.body.append(note);}
  const choices=[];
  if(s.canFinish)choices.push({label:`Collect ${fmt(s.earned||0)} CR & disembark`,action:()=>finish('completeNpcContract')});
  else if(s.phase==='failed')choices.push({label:'Leave the interrupted run',action:()=>finish('completeNpcContract')});
  else{
   if(s.eva?.active)choices.push({label:'Return through the airlock',detail:s.eva.canExit?'Step back aboard.':'Reach the marked airlock first.',disabled:!s.eva.canExit,action:()=>finish('npcContractAction',{action:'exitEva'})});
   else if(s.eva&&s.eva.canEnter)choices.push({label:'Suit up & go outside',detail:'120 seconds of air. Your tether returns to this airlock.',action:()=>finish('npcContractAction',{action:'enterEva'})});
   if(task?.ready)choices.push({label:task.puzzle?'Work the controls':task.title,action:openTask});
   if(!s.done)choices.push({label:task?.ready?'Mark my workstation':'Show my next task',detail:task?.reason||undefined,action:markDuty});
   // Saved version-one watches keep their existing physical work controls.
   if(!task&&(s.complication?.type==='illness'||s.version!==2&&s.roleId==='medic'))choices.push({label:'Treat the crewmate',disabled:s.version===2?!['outbound','working'].includes(s.phase):s.phase!=='working',action:()=>finish('npcContractAction',{action:'heal'})});
   if(s.work?.sectionId)choices.push({label:'Damage control',action:openDamage});
   if(s.phase!=='returning'&&!s.eva?.active)choices.push({label:s.phase==='boarding'?'Cancel this watch':'Ask to return early',detail:'Pay covers completed work.',action:async()=>{if(await finish('cancelNpcContract'))openDuty();}});
  }
  choices.push({label:'Back to the deck',action:()=>dialog.close()});dialog.choices(choices);
 }
 return {openPort,openRecovery,openPassage,openCrewJobs,openDuty,openTask,markDuty};
}
