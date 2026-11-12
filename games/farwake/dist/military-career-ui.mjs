/** One optional service track, with one current objective rather than a work catalog. */
import { escapeHtml as esc } from './ui.mjs';
import { MILITARY_RECRUITER, MILITARY_RECRUITER_TARGET } from './military-content.mjs';
import { militaryServiceRank, militaryDialogue } from './military-ranks.mjs';
import { FACTIONS } from './content.mjs';

export const MILITARY_RECRUITER_ID=MILITARY_RECRUITER.id;
export { MILITARY_RECRUITER_TARGET };

export function militaryCareerGuided(status){
 return status?.guidanceActive===true;
}

export function militaryCareerPrompt(status,{mode='person',nearby=null,gunnery=false,touch=false}={}){
 if(!militaryCareerGuided(status))return null;
 const targetId=status.target?.entityId,near=!!targetId&&(nearby?.id===targetId||nearby?.id?.endsWith(':'+targetId));
 const body=gunnery?'Keep watch through the gun display. Aim and fire at assigned contacts. The NPC captain flies; Back to deck leaves this view.':near?`${touch?'Tap the highlighted action':'Press E'} to continue your assignment.`:status.objective;
 return{id:`service:${status.branchId}:${status.active?.operationId||'briefing'}:${status.active?.phase||status.status}:${near?'near':gunnery?'gunnery':mode}`,title:status.title||status.branchName||'Your service assignment',body,compactBody:body,flow:'route',controlTarget:gunnery?'fireButton':near?'contextButton':'stick'};
}

const branchName=id=>({navy:'Navy',army:'Army'})[id]||'service';
const factionName=id=>FACTIONS.find(faction=>faction.id===id)?.name||id||'Freewake';
const rosterStatus=person=>({ready:'Ready at the recruiter',waiting:'Not ready at the recruiter',offline:'Offline',aboard:'Aboard',field:'In the field',ashore:'Ashore',returned:'Back for debrief',debriefed:'Debrief filed'})[person.status]||(person.online===false?'Offline':'On this roster');
const phaseName=phase=>({muster:'Gathering at Morrow',forming:'Gathering at Morrow',active:'Under way',returned:'Back for debrief',debrief:'Back for debrief',closed:'Complete',completed:'Complete',cancelled:'Muster closed',failed:'Returned without completion'})[phase]||phase||'Gathering at Morrow';
const operationsFor=view=>[...(view.operation?[view.operation]:[]),...(view.operations||[]).filter(operation=>operation.id!==view.operation?.id)];

/** A friend's current public record wins over an old operation ID in a button. */
export function militaryTogetherState(view,snapshot={},context={}){
 const operations=operationsFor(view),friend=context.captainId?(snapshot.presence||[]).find(person=>person.captainId===context.captainId):null;
 const operationId=context.captainId?friend?.military?.operationId:context.operationId;
 const operation=operations.find(value=>value.id===operationId&&(!context.captainId||value.roster?.some(person=>person.captainId===context.captainId)))||null;
 const service=friend?.military||(operation?{factionId:operation.factionId,branchId:operation.branchId}:null);
 const own=view.serviceRank||{},factionId=own.factionId||view.factionId,branchId=own.branchId||view.branchId;
 const mismatch=service&&own.enlisted&&factionId!==service.factionId?'faction':service&&!own.enlisted&&service.factionId!==MILITARY_RECRUITER.factionId?'recruiter-faction':service&&branchId&&service.branchId&&branchId!==service.branchId?'branch':null;
 return{friend,operation,service,mismatch,sameOperation:!!operation&&operation.id===view.operation?.id,friendMissing:!!context.captainId&&!friend};
}

export function createMilitaryCareerUI({getGame,getSnapshot=()=>({}),dialog,invoke,acceptResult,track,refreshWorld=()=>{},openOrdinaryWork=null,openNavyDuty=null,document:doc=globalThis.document}){
 let busy=false,openedContext=null,renderKey='';
 const status=entityId=>getGame().militaryCareerStatus?.(entityId)||{status:'unavailable',actions:[],objective:'The recruiter is preparing the next service briefing.'};
 const identity=()=>{const g=getGame(),s=g.state;return{game:g,key:`${s.seed}:${s.multiplayer?.captainId||'solo'}`};};
 const unchanged=owner=>owner.game===getGame()&&owner.key===identity().key;
 const guarded=callback=>{const owner=identity(),revision=dialog.revision;return(...args)=>{if(unchanged(owner)&&dialog.opened&&dialog.revision===revision)return callback(...args);};};
 const choices=items=>dialog.choices(items.map(item=>({...item,action:guarded(item.action)})));
 const mark=target=>{dialog.close();track(target||MILITARY_RECRUITER_TARGET);};
 const ownId=()=>getGame().state.multiplayer?.captainId||getGame().playerId;
 const rankFor=view=>view.serviceRank||militaryServiceRank(getGame());
 const currentKey=()=>{const view=status();return JSON.stringify({owner:identity().key,rank:rankFor(view),branch:view.branchId,operation:view.operation,operations:view.operations,actions:view.actions,presence:(getSnapshot()?.presence||[]).map(person=>({captainId:person.captainId,name:person.name,online:person.online,military:person.military}))});};
 const remember=context=>{openedContext={...context,owner:identity(),revision:dialog.revision,root:dialog.body.children[0]};renderKey=currentKey();};
 async function act(action,entityId,after=null){
  if(busy||action.available===false)return;
  busy=true;const owner=identity(),revision=dialog.revision;
  try{
   const answer=await invoke('militaryCareerAction',action);
   if(!unchanged(owner))return;
   if(!acceptResult(answer))return;
   refreshWorld();
   if(revision!==dialog.revision||!dialog.opened)return;
   if(['start','startDeployment','retry','resume','pause','launchOperation'].includes(action.action)){
    dialog.close();const next=status();if(militaryCareerGuided(next)&&next.target)track(next.target,{quiet:true});
   }else if(after)after();else open(entityId);
  }finally{busy=false;}
 }
 function actionButtons(parent,actions,entityId,after=null){
  for(const action of actions||[]){
   if(!action?.action||!action.label)continue;
   const row=doc.createElement('div');row.className='shared-crew-actions';
   const button=doc.createElement('button');button.textContent=action.label;button.disabled=action.available===false;button.onclick=guarded(()=>act(action,entityId,after));row.append(button);
   if(action.reason||action.detail){const note=doc.createElement('p');note.className=action.available===false?'mini action-reason':'mini muted';note.textContent=action.reason||action.detail;row.append(note);}
   parent.append(row);
  }
 }
 function appendOperation(operation,entityId,{after=null,showActions=true}={}){
  const card=doc.createElement('article');card.className='entry-card military-unit';
  const gathering=['muster','forming'].includes(operation.phase),mine=operation.id===status().operation?.id;
  const leader=operation.leaderId===ownId(),count=operation.roster?.length||0;
  const departure=gathering?mine?(leader?`You authorize departure. ${count===1?'You can depart alone, or wait for friends to join this roster.':'Check that everyone is ready before departing.'}`:`${operation.leaderName||'Your operation leader'} authorizes departure. Stay by the Morrow recruiter until the unit is ready.`):'Join this roster at Sergeant Venn on Morrow before its leader departs.':mine?'You share this deployment. Each person completes their own duty and debrief.':'This unit has already departed. Meet at Morrow for its next muster.';
  card.innerHTML=`<div class="entry-top"><strong>${esc(operation.title||'Military deployment')}</strong><span class="pill">${esc(phaseName(operation.phase))}</span></div><p class="mini">${esc(branchName(operation.branchId))} · ${esc(operation.systemName||'Morrow')} · Led by ${esc(operation.leaderName||'the duty officer')}</p>${operation.roster?.length?`<ul class="duty-checklist">${operation.roster.map(person=>`<li><strong>${esc(person.name||'Crew member')}${person.captainId===ownId()?' · you':''}</strong> · ${esc(person.rank||'Recruit')}<br><span class="mini">${esc(person.role||'Assigned crew')} · ${esc(rosterStatus(person))}${person.statusReason&&person.status!=='ready'?` · ${esc(person.statusReason)}`:''}</span></li>`).join('')}</ul>`:''}<p class="mini">${esc(departure)}</p>`;
  if(showActions){
   actionButtons(card,(operation.actions||[]).filter(action=>action.action!=='leaveOperation'),entityId,after);
   const leave=(operation.actions||[]).filter(action=>action.action==='leaveOperation');
   if(leave.length){const options=doc.createElement('details');options.className='thread-history';options.innerHTML='<summary>Unit options</summary>';actionButtons(options,leave,entityId,after);card.append(options);}
  }
  dialog.body.append(card);return card;
 }
 function appendOperations(view,entityId){
  if(view.operation?.phase==='muster')appendOperation(view.operation,entityId);
  else if(view.operation){const unit=doc.createElement('div');unit.className='shared-crew-actions';const button=doc.createElement('button');button.textContent=`Your unit · ${view.operation.roster?.length||1} on this roster`;button.onclick=guarded(()=>openTogether({operationId:view.operation.id}));unit.append(button);dialog.body.append(unit);}
  const operations=(view.operations||[]).filter(operation=>operation.id!==view.operation?.id&&operation.phase==='muster'&&operation.factionId===view.factionId&&operation.branchId===view.branchId);
  if(!operations.length)return;
  const section=doc.createElement('details');section.className='thread-history';section.innerHTML=`<summary>Units gathering · ${operations.length}</summary>`;
  for(const operation of operations){
   const card=doc.createElement('article');card.className='entry-card';card.innerHTML=`<strong>${esc(operation.title||'Military deployment')}</strong><p class="mini">${esc(operation.leaderName||'Duty officer')} · ${operation.roster?.length||0} on the roster</p>`;
   const button=doc.createElement('button');button.textContent='Review this unit';button.onclick=guarded(()=>openTogether({operationId:operation.id}));card.append(button);section.append(card);
  }
  dialog.body.append(section);
 }
 function appendServiceDetails(view,entityId){
  const rank=rankFor(view),greeting=view.dialogue||(rank.enlisted?militaryDialogue(getGame(),{factionId:MILITARY_RECRUITER.factionId,role:'recruiter'}):'');
  const options=doc.createElement('details');options.className='thread-history';
  options.innerHTML=`<summary>Briefing & service record</summary>${greeting?`<p>“${esc(greeting)}”</p>`:''}${view.summary?`<p>${esc(view.summary)}</p>`:''}${rank.enlisted?`<p>${rank.completed||0} completed assignments. ${rank.nextRank!=null?`${rank.completed||0} / ${rank.nextRank} assignments toward ${esc(rank.nextRankName)}.`:'Senior service rank attained.'} ${esc(rank.permissionLabels?.at(-1)||'Duty permissions suspended.')}</p>`:''}${view.chapters?.map(chapter=>`<p><strong>${esc(chapter.title)}</strong> · ${esc(chapter.status==='completed'?'Complete':chapter.status==='active'?'Current assignment':chapter.status==='available'?'Next assignment':'Later in your service')}</p>`).join('')||''}`;
  actionButtons(options,(view.actions||[]).filter(action=>action.action==='pause'||action.separate),entityId);dialog.body.append(options);
 }
 function appendDeployments(view,entityId){
  if(!view.deployments?.length)return;
  const section=doc.createElement('details');section.className='thread-history';section.innerHTML='<summary>Deployment board</summary>';
  for(const deployment of view.deployments){
   const card=doc.createElement('article');card.className='entry-card';
   card.innerHTML=`<strong>${esc(deployment.title||'Service deployment')}</strong>${deployment.systemName?`<p class="mini">${esc(deployment.systemName)}</p>`:''}<p>${esc(deployment.summary||deployment.description||'Report for the operation briefing.')}</p>`;
   actionButtons(card,deployment.actions,entityId);section.append(card);
  }
  dialog.body.append(section);
 }
 function openTogether(context={}){
  const view=status(),rank=rankFor(view),snapshot=getSnapshot()||{};
  const together=militaryTogetherState({...view,serviceRank:rank},snapshot,context),{friend,service,mismatch}=together;
  let operation=together.operation;
  // If the friend has no unit yet, show the viewer's existing roster so the
  // next instruction is to invite the friend, never to open a parallel muster.
  const inviteFriend=!operation&&!!view.operation&&!together.friendMissing;
  if(inviteFriend)operation=view.operation;
  const gathering=operation&&['muster','forming'].includes(operation.phase);
  const differentUnit=operation&&view.operation&&operation.id!==view.operation.id;
  const friendName=friend?.name||'Your friend';
  let heading,message;
  if(together.sameOperation){
   heading=friend?'You are in the same unit':'Your unit';
   message=gathering?(operation.roster?.length>1?'Everyone below is on one roster. Stay at the Morrow recruiter while your operation leader checks the unit and authorizes departure.':'You are on this roster. You can depart alone, or wait at the Morrow recruiter for friends to join.'):'You share this operation. Your rank, station permissions, and debrief remain personal.';
  }else if(mismatch==='faction'){
   heading='You serve different factions';message=`${friendName} serves ${factionName(service.factionId)}. Your enlistment does not grant that faction’s clearance, and the Morrow recruiter cannot transfer it.`;
  }else if(mismatch==='recruiter-faction'){
   heading='This recruiter serves another faction';message=`${friendName} serves ${factionName(service.factionId)}. Sergeant Venn recruits for ${factionName(MILITARY_RECRUITER.factionId)} and cannot enlist you into your friend’s faction. A Freewake branch choice will not join that unit.`;
  }else if(mismatch==='branch'){
   heading='You serve different branches';message=`${friendName} serves in the ${branchName(service.branchId)}; you serve in the ${branchName(view.branchId)}. Existing branch choices cannot be changed at this recruiter. You can still travel on a civilian crew together, but military units require the same branch.`;
  }else if(differentUnit){
   heading='You are in different units';
   message=view.operation.phase==='muster'?`Your current unit is ${view.operation.title}. Leave that muster first, then join the roster below at Sergeant Venn. Your friend’s unit must still be gathering.`:'Finish or close your current deployment before joining another unit. Meet your friend at Morrow for a muster that has not departed.';
  }else if(inviteFriend){
   heading=gathering?'Your unit is ready for a friend':'Your unit is already under way';
   message=gathering?`Ask ${friend?.name||'your friend'} to open Play together, choose Serve together beside your name, then join this roster. Wait until both names appear before departing.`:'Your deployment has departed. Meet your friend at Morrow for the next muster.';
  }else if(operation){
   heading=gathering?`Join ${friend?.name?`${friend.name}’s`:'this'} unit`:'This unit is already under way';
   message=gathering?'Join this exact roster to share the mission. Being on the same ship or in the same branch does not put you in the same unit.':'Joining after departure is unavailable. Meet at Sergeant Venn on Morrow for the next muster.';
  }else if(!friend?.military){
   heading='Meet at the Morrow recruiter';message='Choose the same faction and branch at Sergeant Venn. Then one of you opens a muster and the other joins that roster.';
  }else if(!rank.enlisted||!view.branchId){
   heading='Choose your service branch';message=`${friendName} serves in the ${factionName(service.factionId)} ${branchName(service.branchId)}. Choose that branch at Sergeant Venn if you want to serve in the same unit.`;
  }else{
   heading='Open one muster together';message='Open or join one muster at Sergeant Venn. Your friend then uses Serve together to join it. Check both names before departure; choosing the same branch alone does not join a unit.';
  }
  if(together.friendMissing&&!operation){heading='Captain unavailable';message='That captain is no longer in the current galaxy roster. Return to Play together and choose a captain who is present in this galaxy.';}
  dialog.open('Serve together','military-together',{eyebrow:friend?`${friend.name}${friend.online===false?' · OFFLINE':''}`:'MORROW / UNIT ROSTER'});
  dialog.html(`<p class="mini"><strong>You · ${esc(rank.enlisted?rank.rank:'Not enlisted')}</strong>${view.branchId?` · ${esc(factionName(view.factionId))} ${esc(branchName(view.branchId))}`:''}${friend?.military?`<br>${esc(friendName)} · ${esc(friend.military.rank||'Recruit')} · ${esc(factionName(friend.military.factionId))} ${esc(branchName(friend.military.branchId))}`:''}</p><div class="duty-current"><span>${together.sameOperation?'SAME DEPLOYMENT':'SERVE TOGETHER'}</span><strong>${esc(heading)}</strong><p>${esc(message)}</p></div>`);
  const again=()=>openTogether(context),items=[];
  if(operation)appendOperation(operation,MILITARY_RECRUITER_ID,{after:again,showActions:!mismatch});
  if(differentUnit&&!mismatch){
   const leave=view.operation.phase==='muster'&&(view.operation.actions||[]).find(action=>action.action==='leaveOperation');
   if(leave)items.push({label:'Leave my current muster',detail:view.operation.title,disabled:leave.available===false,action:()=>act(leave,MILITARY_RECRUITER_ID,again)});
   else items.push({label:'Review my current unit',action:()=>openTogether({operationId:view.operation.id})});
  }else if((!rank.enlisted||!view.branchId)&&!mismatch&&!together.friendMissing){
   const joins=(view.actions||[]).filter(action=>action.action==='join');
   if(joins.some(action=>action.available!==false))for(const action of joins)items.push({label:action.label,detail:action.branchId===service?.branchId?`${friendName}’s branch. Enlistment is your choice.`:action.reason||action.detail,disabled:action.available===false,action:()=>act(action,MILITARY_RECRUITER_ID,again)});
  }else if(!operation&&!mismatch&&!together.friendMissing){
   const muster=(view.actions||[]).find(action=>action.action==='createOperation'&&!action.separate);
   if(muster)items.push({label:muster.label,detail:muster.reason||muster.detail,disabled:muster.available===false,action:()=>act(muster,MILITARY_RECRUITER_ID,again)});
  }
  if(together.sameOperation&&!gathering){
   if(openNavyDuty&&getGame().state.npcContract?.military?.branchId==='navy')items.push({label:'Current ship orders',action:openNavyDuty});
   else if(view.target)items.push({label:'Show my assigned task',action:()=>mark(view.target)});
  }else if(!together.friendMissing&&!mismatch)items.push({label:'Find the recruiter on Morrow',detail:'Meet beside the landing to enlist, join a unit, or gather for departure.',action:()=>mark(MILITARY_RECRUITER_TARGET)});
  items.push({label:'Your service details',action:()=>open()},{label:'Back to the world',action:()=>dialog.close()});choices(items);
  remember({mode:'together',context});
 }
 function open(entityOrId=null){
  const entityId=typeof entityOrId==='string'?entityOrId:entityOrId?.id||null,view=status(entityId),joins=(view.actions||[]).filter(action=>action.action==='join');
  dialog.open(joins.length?'A place in the service':view.branchName||'Your military service','military-career',{eyebrow:joins.length?'SERGEANT SERA VENN / MORROW':view.factionName||'FREEWAKE SERVICE'});
  if(joins.length){
   dialog.html('<p>“If you want a clear next assignment, I can put you with a crew. Choose the work that suits you. You can return to your own voyage whenever you want.”</p><p class="section-note">Joining is optional. Your existing ship, rank, and unfinished jobs stay with you.</p>');
   if(entityId!==MILITARY_RECRUITER_ID&&joins.every(action=>action.available===false)){
    choices([{label:'Find the recruiter on Morrow',detail:'Sergeant Sera Venn waits beside the landing. Navy serves aboard a carrier; Army deploys on foot.',action:()=>mark(MILITARY_RECRUITER_TARGET)},{label:'Not now',action:()=>dialog.close()}]);remember({mode:'career',entityId});return;
   }
   choices(joins.map(action=>({...action,detail:action.reason||action.detail||(action.branchId==='navy'?'Serve aboard a carrier. Its captain flies; you work the guns.':'Deploy on foot with a ground unit. Learn your weapon, then carry out field assignments.'),disabled:action.available===false,action:()=>act(action,entityId)})));
   choices([{label:'Not now',detail:'Keep exploring. The recruiter remains beside Morrow’s landing.',action:()=>dialog.close()}]);
   remember({mode:'career',entityId});return;
  }
  const objectives=view.active?.objectives||[];
  const rank=rankFor(view),gathering=view.operation?.phase==='muster';
  const rankText=rank.enlisted?`<p class="mini"><strong>${esc(rank.rank)}</strong> · ${rank.completed||0} completed assignments</p>`:'';
  dialog.html(`${rankText}${gathering?'':`<div class="duty-current"><span>${view.status==='paused'?'ON LEAVE':view.status==='completed'?'SERVICE RECORD':'YOUR NEXT TASK'}</span><strong>${esc(view.title||view.objective||'Speak to the recruiter')}</strong><p>${esc(view.objective||'Return to Sergeant Sera Venn on Morrow for your next assignment.')}</p></div>${objectives.length?`<ol class="duty-checklist">${objectives.map(objective=>`<li class="${objective.done?'done':'current'}"><span aria-hidden="true">${objective.done?'✓':'·'}</span>${esc(objective.label)}${Number.isFinite(objective.required)&&objective.required>1?` · ${Math.min(objective.required,Math.max(0,Number(objective.value)||0))} / ${objective.required}`:''}</li>`).join('')}</ol>`:''}`}`);
  appendOperations(view,entityId);
  const actions=(view.actions||[]).filter(action=>action.action!=='join');
  const primary=actions.filter(action=>action.action!=='pause'&&!action.separate);
  const items=primary.map(action=>({label:action.label,detail:action.reason||action.detail,disabled:action.available===false,action:()=>act(action,entityId)}));
  if(openNavyDuty&&getGame().state.npcContract?.military?.branchId==='navy')items.unshift({label:'Current ship orders',detail:'Read the bridge instructions and carry out your assigned duties.',action:openNavyDuty});
  if(view.target)items.push({label:'Show my next task',detail:view.objective,action:()=>mark(view.target)});
  else if(view.status!=='completed')items.push({label:'Find the recruiter on Morrow',action:()=>mark(MILITARY_RECRUITER_TARGET)});
  if(view.status==='completed'&&openOrdinaryWork)items.push({label:'Continue with ordinary service work',action:openOrdinaryWork});
  choices(items);appendDeployments(view,entityId);appendServiceDetails(view,entityId);
  choices([{label:'Back to the world',action:()=>dialog.close()}]);remember({mode:'career',entityId,watchMuster:gathering});
 }
 function appendEntry(root){
  const view=status();
  const rank=view.serviceRank||militaryServiceRank(getGame());
  const card=doc.createElement('article');card.className='entry-card';
  card.innerHTML=`<span class="eyebrow">${view.branchId?'YOUR SERVICE RECORD':'OPTIONAL / A GUIDED SERVICE CAREER'}</span><h3>${esc(view.branchName||'Serve with Freewake')}</h3>${rank.enlisted?`<p class="mini">${esc(rank.rank)} · ${rank.completed} completed assignments</p>`:''}<p>${esc(view.branchId?view.objective||'Your service record is kept by the recruiter.':'Sergeant Sera Venn on Morrow offers Navy and Army assignments, one at a time.')}</p>`;
  const button=doc.createElement('button');button.textContent=view.branchId?'Review your next assignment':'Find the recruiter on Morrow';button.onclick=view.branchId?()=>open():()=>mark(MILITARY_RECRUITER_TARGET);card.append(button);root.append(card);
 }
 function refresh(){
  if(busy||!dialog.opened||!openedContext)return false;
  const context=openedContext;
  if(dialog.revision!==context.revision||dialog.body.children[0]!==context.root)return false;
  if(context.mode==='together'&&dialog.kind!=='military-together'||context.mode==='career'&&(dialog.kind!=='military-career'||!context.watchMuster))return false;
  if(!unchanged(context.owner)){dialog.close();openedContext=null;return false;}
  const key=currentKey();if(key===renderKey)return false;
  const scroll=dialog.body.scrollTop,expanded=[...(dialog.body.querySelectorAll?.('details[open]')||[])].map(element=>element.querySelector('summary')?.textContent);
  if(context.mode==='together')openTogether(context.context);else open(context.entityId);
  for(const element of dialog.body.querySelectorAll?.('details')||[])if(expanded.includes(element.querySelector('summary')?.textContent))element.open=true;
  if(Number.isFinite(scroll))dialog.body.scrollTop=scroll;return true;
 }
 return{open,openTogether,refresh,appendEntry,status};
}
