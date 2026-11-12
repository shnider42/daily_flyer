/** Orders and ship's company for an NPC-commanded Navy vessel. */
import { escapeHtml as esc } from './ui.mjs';
import { flowGuidanceLevel, guidanceFlowMarkup } from './guidance-flows.mjs';

const phases={boarding:'Before departure',outbound:'Under way',working:'On station',returning:'Homeward',docked:'Moored',failed:'Operation interrupted'};
const seconds=value=>Math.max(0,Math.ceil(Number(value)||0));

export function navyOrderMatchesEntity(status,entity){
 const target=status?.navyOperation?.activeTask?.target;if(!target||!entity)return false;
 if(target.entityId)return entity.id===target.entityId;
 const role=({weapons:'security',scanner:'navigation'})[target.stationRole]||target.stationRole;
 return !!role&&entity.data?.stationRole===role;
}

export function navyOrderPrompt(status,{gunnery=false,touch=false}={}){
 const operation=status?.navyOperation,task=operation?.activeTask;
 if(!operation)return null;
 const ready=task?.ready&&!task.running;
 const body=status.canFinish?'Use the entry airlock, then report to Sergeant Venn for debrief.':status.phase!=='working'?status.task:task?.combatFirst?`${task.reason} ${gunnery?touch?'Tap a battery button to cover the contact’s firing arc.':'Use the battery buttons or 1–4 to cover each firing arc.':'Return to the gunnery console to defend the transfer.'}`:gunnery&&task&&task.stationRole!=='weapons'?`${operation.rulesOfEngagement||'Maintain fire discipline.'} Return to the deck for ${task.title.toLowerCase()}.`:task?.running?`${task.title}: ${seconds(task.elapsed)} / ${seconds(task.duration)}s. Stay at ${task.stationName||'your assigned station'}.`:ready?`${touch?'Tap':'Open'} Crew duty to carry out the current order. ${task.brief}`:status.task||task?.brief||operation.brief;
 const compactBody=status.canFinish?'Go ashore through the entry airlock, then debrief at Morrow.':status.phase!=='working'?status.task:task?.combatFirst?body:gunnery&&task&&task.stationRole!=='weapons'?`${operation.rulesOfEngagement||'Maintain fire discipline.'} Return to ${task.stationName||'the assigned station'} on deck.`:task?.running?`Stay at ${task.stationName||'your station'} · ${seconds(task.elapsed)} / ${seconds(task.duration)}s.`:ready?`Crew duty: respond to ${task.title.toLowerCase()}.`:task?.reason||status.task||task?.brief||operation.brief;
 const successAction=status.canFinish?'disembark':status.phase==='working'&&task?.combatFirst?gunnery?'gunnery-fire':'gunnery-enter':status.phase==='working'&&ready?'navy-order':null;
 return{id:`navy-order:${status.id}:${status.phase}:${task?.id||'watch'}:${ready?'ready':task?.running?'running':'approach'}:${gunnery?'gun':'deck'}`,title:task?.title||status.title,body,compactBody,flow:'route',learningFlow:'service',topicId:`navy-order:${status.phase}:${task?.stationRole||'watch'}:${ready?'ready':task?.running?'running':'approach'}:${gunnery?'gun':'deck'}`,...(successAction?{successAction}:{}),controlTarget:status.canFinish?'modePill':task?.combatFirst?(gunnery?'fireButton':'stick'):ready?'objectiveDetails':gunnery?'viewButton':'stick'};
}

export function createNavyDutyUI({getGame,getGuidance=()=> 'simple',dialog,invoke,acceptResult,refreshWorld,markEntity,openGunnery=null,openService=null,document:doc=globalThis.document}){
 let pending=false;
 const status=()=>getGame().npcContractStatus?.();
 const naval=()=>getGame().state.npcContract?.military?.branchId==='navy';
 const guidance=()=>flowGuidanceLevel(getGuidance());
 const identity=()=>{const game=getGame();return{game,captain:game.state.multiplayer?.captainId||game.playerId||game.state.seed,contract:game.state.npcContract?.id};};
 const same=(owner,command)=>{const now=identity();return now.game===owner.game&&now.captain===owner.captain&&(now.contract===owner.contract||command==='completeNpcContract'&&!now.contract);};
 const mark=target=>{dialog.close();markEntity(target||status()?.target||{});};
 async function act(command,args){
  if(pending)return;
  pending=true;const owner=identity(),revision=dialog.revision;
  try{
   const answer=await invoke(command,args);
   if(!same(owner,command))return;
   if(dialog.revision!==revision){refreshWorld();return;}
   if(!acceptResult(answer))return;
   dialog.close();refreshWorld();
  }finally{pending=false;}
 }
 function watchGuide(view){
  const task=view.navyOperation?.activeTask,level=guidance(),gunnery=getGame().state.stationView==='gunnery';
  let steps=[],notes=[],next,title='How to stand this watch';
  if(view.canFinish){
   steps=[{text:'Use Disembark for debrief to leave through the entry airlock.',done:false},{text:'Meet Sergeant Venn on Morrow and file your personal debrief.',done:false}];
   notes=['The docked airlock does not need Helm permission. A friend’s debrief does not collect your pay or promotion credit.'];
  }else if(view.phase==='failed'){
   steps=[{text:'Leave the interrupted operation using the available action, then review your service record.',done:false}];
   notes=['An unfinished operation earns no completion credit. Your current recovery or transport orders explain the route back.'];
  }else if(view.phase==='boarding'){
   steps=[{text:'Check the muster roster and departure orders before the ship leaves.',done:false},{text:'After departure, follow your assigned station marker on the crew deck.',done:false},{text:'Open Current ship orders when you reach your post.',done:false}];
   notes=['The NPC commander flies the ship. Your rank and roster role determine your own duty permissions. Gunnery opens after departure.'];
  }else if(view.phase==='returning'){
   steps=[{text:'Remain aboard while the NPC commander returns to Morrow.',done:false},{text:'Once moored, use the entry airlock and report to Sergeant Venn for debrief.',done:false}];
   notes=['The operation is not settled until you file your own debrief. You do not have to pilot or buy a passage home from this carrier.'];
  }else if(task?.combatFirst){
   steps=[{text:'Reach the security / gunnery console and open the exterior gun view.',done:gunnery},{text:'Select the battery whose direction covers the marked attacker, then aim within its arc and fire.',done:false},{text:'After the armed threat is cleared, return to the deck and read the next order.',done:false}];
   notes=['Fore, port, starboard, and aft batteries cover different directions. Selecting a new battery changes the arc you can aim within.','The NPC commander controls the hull. Back to deck leaves the gun view without leaving the ship.'];
  }else if(task){
   steps=[
    {text:`Follow Show my assigned station to ${task.stationName||'your assigned post'}.`,done:!!(task.ready||task.running)},
    {text:'Read the current order and verified bridge report, then choose your response in Crew duty.',done:!!task.running},
    {text:task.running?`Stay at ${task.stationName||'your post'} until this task finishes. Watch for the next order.`:'Carry out the task at its station. Follow the next order when the task finishes.',done:false}
   ];
   next=task.running?`Stay at ${task.stationName||'your post'} · ${Math.min(seconds(task.duration),Math.floor(task.elapsed||0))} / ${seconds(task.duration)}s.`:task.ready?'Read the bridge report and choose your response below.':task.reason||`Reach ${task.stationName||'your assigned station'}.`;
   notes=['Use the current report to decide your response. Guidance explains the controls without choosing an answer for you.','Fire orders apply throughout the operation. A contact is not automatically a target, and a quiet watch still counts when you do your assigned work.'];
  }else{
   steps=[{text:'Follow your assigned station marker to the gun console.',done:gunnery},{text:'Open the exterior view and select a battery that covers the contact.',done:false},{text:'Keep watch and fire only as your orders permit. Return with the carrier for debrief.',done:false}];
   notes=['The NPC commander flies; you control the selected gun battery. Battery buttons choose direction and firing arc. Back to deck restores the interior view.','Your own time and contribution at the duty station are recorded. Remaining aboard while someone else works does not replace your duty.'];
  }
  return guidanceFlowMarkup({id:'navy-watch',title,level,steps,notes,next});
 }
 function open(){
  if(!naval())return false;
  const view=status();if(!view?.active)return false;
  const operation=view.navyOperation,task=operation?.activeTask,work=view.work||{},stages=operation?.stages||[];
  dialog.open(view.title||'Fleet orders','navy-orders',{eyebrow:`${view.shipName||'NAVY VESSEL'} · ${phases[view.phase]||view.phase}`});
  const heading=view.canFinish?'Report ashore for debrief':view.phase!=='working'?view.task:task?.title||view.task||'Keep your station';
  const watch=`${Math.min(seconds(work.requiredWatchSeconds),Math.floor(work.watchSeconds||0))} / ${seconds(work.requiredWatchSeconds)}s of personal duty`;
  const background=operation?.brief?guidance()==='simple'?`<p>${esc(operation.brief)}</p>`:`<details class="thread-history"><summary>Operation briefing</summary><p>${esc(operation.brief)}</p></details>`:'';
  dialog.html(`<div class="duty-current"><span>${view.canFinish?'RETURN TO MORROW':task?'CURRENT ORDER':'YOUR WATCH'}</span><strong>${esc(heading)}</strong>${task?.brief?`<p>${esc(task.brief)}</p>`:''}</div>${background}${operation?.report?`<div class="guide-card"><strong>Verified bridge report</strong><p>${esc(operation.report)}</p></div>`:''}${operation?.rulesOfEngagement?`<div class="navy-fire-order"><strong>Fire orders</strong><p>${esc(operation.rulesOfEngagement)}</p></div>`:''}<p class="duty-route">${esc(view.routeName||'Morrow service circuit')}</p><p class="mini">${esc(watch)} · Service pay and promotion credit are recorded at debrief.</p>${task?`<p class="navy-task-station"><strong>${esc(task.stationName||'Assigned station')}</strong> · ${task.running?`${Math.min(seconds(task.duration),Math.floor(task.elapsed||0))} / ${seconds(task.duration)}s — stay at your post`:task.ready?'Ready for your response':esc(task.reason||'Follow the station marker.')}</p>`:''}${stages.length?`<details class="thread-history"><summary>Operation sequence · ${stages.filter(stage=>stage.done).length} / ${stages.length}</summary><ol class="duty-checklist">${stages.map(stage=>`<li class="${stage.done?'done':stage.id===task?.id?'current':''}"><span aria-hidden="true">${stage.done?'✓':stage.id===task?.id?'→':'·'}</span>${esc(stage.title)}</li>`).join('')}</ol></details>`:''}${operation?.contacts?.length?`<details class="thread-history"><summary>Reported contacts</summary>${operation.contacts.map(contact=>`<p><strong>${esc(contact.name)}</strong> · ${esc(contact.status)}</p>`).join('')}</details>`:''}${operation?.comms?.length?`<details class="thread-history"><summary>Bridge log</summary>${operation.comms.slice(-6).map(entry=>`<p>${esc(typeof entry==='string'?entry:entry.text)}</p>`).join('')}</details>`:''}`);
  const choices=[];
  if(view.canFinish)choices.push({label:'Disembark for debrief',detail:'Your personal duty record follows you ashore.',action:()=>act('completeNpcContract',{})});
  else if(view.phase==='failed')choices.push({label:'Leave the interrupted operation',action:()=>act('completeNpcContract',{})});
  else{
   for(const choice of task?.choices||[])choices.push({label:choice.label,disabled:!task.ready||task.running,detail:!task.ready?task.reason:choice.detail,action:()=>{
    const current=status()?.navyOperation?.activeTask;
    if(!current?.ready||current.running||current.id!==task.id||!current.choices?.some(item=>item.id===choice.id)){open();return;}
    return act('npcContractAction',{action:'navyOrder',taskId:task.id,choiceId:choice.id});
   }});
   if(!view.done)choices.push({label:'Show my assigned station',detail:task?.stationName||'Follow the marker on deck.',action:()=>mark(view.target)});
   if(openGunnery)choices.push({label:'Gun batteries',detail:'Open the exterior display from the gunnery console. Observe the current fire orders.',action:openGunnery});
  }
  choices.push({label:'Ship’s company',detail:'The sailors and specialists serving aboard this vessel.',action:openCompany});
  if(openService)choices.push({label:view.military?.awaitDeparture?'Muster & departure orders':'Your service record',action:openService});
  if(!view.canFinish&&!['returning','failed'].includes(view.phase))choices.push({label:view.phase==='boarding'?'Cancel this watch':'Request early return',detail:'An unfinished operation does not earn completion credit.',action:()=>act('cancelNpcContract',{})});
  choices.push({label:'Back to the deck',action:()=>dialog.close()});dialog.choices(choices);
  if(doc?.createElement&&dialog.body?.append){const guide=doc.createElement('div');guide.className='guidance-flow-container';guide.innerHTML=watchGuide(view);dialog.body.append(guide);}
  return true;
 }
 function openCompany(){
  if(!naval())return false;
  const game=getGame(),view=status(),crew=(game.currentBody?.crew||game.state.crew||[]).filter(person=>person.serviceCrew),living=crew.filter(person=>person.health>0&&person.status!=='dead');
  dialog.open('Ship’s company','navy-company',{eyebrow:`${view?.shipName||'NAVY VESSEL'} · ${living.length} CREW PRESENT`});
  const departments=[...new Set(crew.map(person=>person.department||'Ship services'))];
  dialog.html(`<p>The ship’s permanent company operates the vessel. Your own rank determines which duties and controls you can use.</p>${departments.map(department=>`<section class="navy-department"><h3>${esc(department)}</h3>${crew.filter(person=>(person.department||'Ship services')===department).map(person=>`<p><strong>${esc(person.name)}</strong> · ${esc(person.dutyLabel||person.role)}<br><span class="mini muted">${person.health<=0||person.status==='dead'?'Lost in service':esc(person.activity||person.life?.label||'On duty')}</span></p>`).join('')}</section>`).join('')||'<p>The company roster is being updated.</p>'}`);
  dialog.choices([{label:'Current orders',action:open},{label:'Back to the deck',action:()=>dialog.close()}]);return true;
 }
 return{open,openCompany};
}
