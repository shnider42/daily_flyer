/** Orders and ship's company for an NPC-commanded Navy vessel. */
import { escapeHtml as esc } from './ui.mjs';

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
 const body=status.canFinish?'Use the entry airlock, then report to Sergeant Venn for debrief.':status.phase!=='working'?status.task:task?.combatFirst?`${task.reason} ${gunnery?'Use the battery buttons or 1–4 to cover each firing arc.':'Return to the gunnery console to defend the transfer.'}`:gunnery&&task&&task.stationRole!=='weapons'?`${operation.rulesOfEngagement||'Maintain fire discipline.'} Return to the deck for ${task.title.toLowerCase()}.`:task?.running?`${task.title}: ${seconds(task.elapsed)} / ${seconds(task.duration)}s. Stay at ${task.stationName||'your assigned station'}.`:ready?`${touch?'Tap':'Open'} Crew duty to carry out the current order. ${task.brief}`:status.task||task?.brief||operation.brief;
 return{id:`navy-order:${status.id}:${status.phase}:${task?.id||'watch'}:${ready?'ready':task?.running?'running':'approach'}:${gunnery?'gun':'deck'}`,title:task?.title||status.title,body,compactBody:body,flow:'route',controlTarget:status.canFinish?'modePill':task?.combatFirst?(gunnery?'fireButton':'stick'):ready?'objectiveDetails':gunnery?'viewButton':'stick'};
}

export function createNavyDutyUI({getGame,dialog,invoke,acceptResult,refreshWorld,markEntity,openGunnery=null,openService=null}){
 let pending=false;
 const status=()=>getGame().npcContractStatus?.();
 const naval=()=>getGame().state.npcContract?.military?.branchId==='navy';
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
 function open(){
  if(!naval())return false;
  const view=status();if(!view?.active)return false;
  const operation=view.navyOperation,task=operation?.activeTask,work=view.work||{},stages=operation?.stages||[];
  dialog.open(view.title||'Fleet orders','navy-orders',{eyebrow:`${view.shipName||'NAVY VESSEL'} · ${phases[view.phase]||view.phase}`});
  const heading=view.canFinish?'Report ashore for debrief':view.phase!=='working'?view.task:task?.title||view.task||'Keep your station';
  const watch=`${Math.min(seconds(work.requiredWatchSeconds),Math.floor(work.watchSeconds||0))} / ${seconds(work.requiredWatchSeconds)}s of personal duty`;
  dialog.html(`<div class="duty-current"><span>${view.canFinish?'RETURN TO MORROW':task?'CURRENT ORDER':'YOUR WATCH'}</span><strong>${esc(heading)}</strong>${task?.brief?`<p>${esc(task.brief)}</p>`:''}</div>${operation?.brief?`<p>${esc(operation.brief)}</p>`:''}${operation?.report?`<div class="guide-card"><strong>Verified bridge report</strong><p>${esc(operation.report)}</p></div>`:''}${operation?.rulesOfEngagement?`<div class="navy-fire-order"><strong>Fire orders</strong><p>${esc(operation.rulesOfEngagement)}</p></div>`:''}<p class="duty-route">${esc(view.routeName||'Morrow service circuit')}</p><p class="mini">${esc(watch)} · Service pay and promotion credit are recorded at debrief.</p>${task?`<p class="navy-task-station"><strong>${esc(task.stationName||'Assigned station')}</strong> · ${task.running?`${Math.min(seconds(task.duration),Math.floor(task.elapsed||0))} / ${seconds(task.duration)}s — stay at your post`:task.ready?'Ready for your response':esc(task.reason||'Follow the station marker.')}</p>`:''}${stages.length?`<details class="thread-history"><summary>Operation sequence · ${stages.filter(stage=>stage.done).length} / ${stages.length}</summary><ol class="duty-checklist">${stages.map(stage=>`<li class="${stage.done?'done':stage.id===task?.id?'current':''}"><span aria-hidden="true">${stage.done?'✓':stage.id===task?.id?'→':'·'}</span>${esc(stage.title)}</li>`).join('')}</ol></details>`:''}${operation?.contacts?.length?`<details class="thread-history"><summary>Reported contacts</summary>${operation.contacts.map(contact=>`<p><strong>${esc(contact.name)}</strong> · ${esc(contact.status)}</p>`).join('')}</details>`:''}${operation?.comms?.length?`<details class="thread-history"><summary>Bridge log</summary>${operation.comms.slice(-6).map(entry=>`<p>${esc(typeof entry==='string'?entry:entry.text)}</p>`).join('')}</details>`:''}`);
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
  choices.push({label:'Back to the deck',action:()=>dialog.close()});dialog.choices(choices);return true;
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
