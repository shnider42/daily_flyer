/** One optional service track, with one current objective rather than a work catalog. */
import { escapeHtml as esc } from './ui.mjs';
import { MILITARY_RECRUITER, MILITARY_RECRUITER_TARGET } from './military-content.mjs';
import { militaryServiceRank, militaryDialogue } from './military-ranks.mjs';

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

export function createMilitaryCareerUI({getGame,dialog,invoke,acceptResult,track,refreshWorld=()=>{},openOrdinaryWork=null,document:doc=globalThis.document}){
 let busy=false;
 const status=entityId=>getGame().militaryCareerStatus?.(entityId)||{status:'unavailable',actions:[],objective:'The recruiter is preparing the next service briefing.'};
 const identity=()=>{const g=getGame(),s=g.state;return{game:g,key:`${s.seed}:${s.multiplayer?.captainId||'solo'}`};};
 const unchanged=owner=>owner.game===getGame()&&owner.key===identity().key;
 const mark=target=>{dialog.close();track(target||MILITARY_RECRUITER_TARGET);};
 async function act(action,entityId){
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
   }else open(entityId);
  }finally{busy=false;}
 }
 function actionButtons(parent,actions,entityId){
  for(const action of actions||[]){
   if(!action?.action||!action.label)continue;
   const row=doc.createElement('div');row.className='shared-crew-actions';
   const button=doc.createElement('button');button.textContent=action.label;button.disabled=action.available===false;button.onclick=()=>act(action,entityId);row.append(button);
   if(action.reason||action.detail){const note=doc.createElement('p');note.className=action.available===false?'mini action-reason':'mini muted';note.textContent=action.reason||action.detail;row.append(note);}
   parent.append(row);
  }
 }
 function appendOperations(view,entityId){
  const current=view.operation,operations=[...(current?[current]:[]),...(view.operations||[]).filter(operation=>operation.id!==current?.id)];
  if(!operations.length)return;
  const section=doc.createElement('section');section.className='shared-crew-roster';section.innerHTML='<h3>Operations in this galaxy</h3><p class="mini muted">Join the same deployment with other members of your faction and branch. Each member keeps their own rank and duty permissions.</p>';
  const ownId=getGame().state.multiplayer?.captainId||getGame().playerId;
  for(const operation of operations){
   const card=doc.createElement('article');card.className='entry-card';
   const stage={muster:'Gathering crew',forming:'Gathering crew',active:'Deployed',debrief:'Ready for debrief',completed:'Complete',failed:'Returned without completion'}[operation.phase]||operation.phase||'Accepting crew';
   card.innerHTML=`<div class="entry-top"><strong>${esc(operation.title||'Military deployment')}</strong><span class="pill">${esc(stage)}</span></div><p>${[operation.systemName,operation.leaderName?`Led by ${operation.leaderName}`:''].filter(Boolean).map(esc).join(' · ')}</p>${operation.roster?.length?`<ul class="duty-checklist">${operation.roster.map(person=>`<li><strong>${esc(person.name||'Crew member')}${person.captainId===ownId?' · you':''}</strong> · ${esc(person.rank||'Recruit')} · ${esc(person.role||'Assigned crew')}${person.online===false?' · away':''}</li>`).join('')}</ul>`:''}`;
   actionButtons(card,operation.actions,entityId);section.append(card);
  }
  dialog.body.append(section);
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
 function open(entityOrId=null){
  const entityId=typeof entityOrId==='string'?entityOrId:entityOrId?.id||null,view=status(entityId),joins=(view.actions||[]).filter(action=>action.action==='join');
  dialog.open(joins.length?'A place in the service':view.branchName||'Your military service','military-career',{eyebrow:joins.length?'SERGEANT SERA VENN / MORROW':view.factionName||'FREEWAKE SERVICE'});
  if(joins.length){
   dialog.html('<p>“If you want a clear next assignment, I can put you with a crew. Choose the work that suits you. You can return to your own voyage whenever you want.”</p><p class="section-note">Joining is optional. Your existing ship, rank, and unfinished jobs stay with you.</p>');
   if(entityId!==MILITARY_RECRUITER_ID&&joins.every(action=>action.available===false)){
    dialog.choices([{label:'Find the recruiter on Morrow',detail:'Sergeant Sera Venn waits beside the landing. Navy serves aboard a carrier; Army deploys on foot.',action:()=>mark(MILITARY_RECRUITER_TARGET)},{label:'Not now',action:()=>dialog.close()}]);return;
   }
   dialog.choices(joins.map(action=>({...action,detail:action.reason||action.detail||(action.branchId==='navy'?'Serve aboard a carrier. Its captain flies; you work the guns.':'Deploy on foot with a ground unit. Learn your weapon, then carry out field assignments.'),disabled:action.available===false,action:()=>act(action,entityId)})));
   dialog.choices([{label:'Not now',detail:'Keep exploring. The recruiter remains beside Morrow’s landing.',action:()=>dialog.close()}]);
   return;
  }
  const objectives=view.active?.objectives||[];
  const summary=typeof view.summary==='string'?view.summary:'';
  const rank=view.serviceRank||militaryServiceRank(getGame()),greeting=view.dialogue||(rank.enlisted?militaryDialogue(getGame(),{factionId:MILITARY_RECRUITER.factionId,role:'recruiter'}):'');
  const rankText=rank.enlisted?`<div class="entry-top"><strong>${esc(rank.rank)}</strong><span>${rank.completed} completed assignments</span></div><p class="mini">${rank.nextRank!==null?`${rank.completed} / ${rank.nextRank} assignments toward ${esc(rank.nextRankName)}.`:'Senior service rank attained.'} ${esc(rank.permissionLabels?.at(-1)||'Duty permissions suspended.')}</p>`:'';
  dialog.html(`${rankText}${greeting?`<p>“${esc(greeting)}”</p>`:''}<div class="duty-current"><span>${view.status==='paused'?'ON LEAVE':view.status==='completed'?'SERVICE RECORD':'YOUR NEXT TASK'}</span><strong>${esc(view.title||view.objective||'Speak to the recruiter')}</strong><p>${esc(view.objective||'Return to Sergeant Sera Venn on Morrow for your next assignment.')}</p></div>${summary?`<p>${esc(summary)}</p>`:''}${objectives.length?`<ol class="duty-checklist">${objectives.map(objective=>`<li class="${objective.done?'done':'current'}"><span aria-hidden="true">${objective.done?'✓':'·'}</span>${esc(objective.label)}${Number.isFinite(objective.required)&&objective.required>1?` · ${Math.min(objective.required,Math.max(0,Number(objective.value)||0))} / ${objective.required}`:''}</li>`).join('')}</ol>`:''}`);
  appendOperations(view,entityId);appendDeployments(view,entityId);
  if(view.chapters?.length){const record=doc.createElement('details');record.className='thread-history';record.innerHTML=`<summary>Service record · ${view.chapters.filter(chapter=>chapter.status==='completed').length} / ${view.chapters.length} deployments completed</summary>${view.chapters.map(chapter=>`<p><strong>${esc(chapter.title)}</strong> · ${esc(chapter.status==='completed'?'Complete':chapter.status==='active'?'Current assignment':chapter.status==='available'?'Next assignment':'Later in your service')}</p>`).join('')}`;dialog.body.append(record);}
  const actions=(view.actions||[]).filter(action=>action.action!=='join');
  const primary=actions.filter(action=>!['pause'].includes(action.action)),secondary=actions.filter(action=>action.action==='pause');
  const choices=primary.map(action=>({label:action.label,detail:action.reason||action.detail,disabled:action.available===false,action:()=>act(action,entityId)}));
  if(view.target)choices.push({label:'Show my next task',detail:view.objective,action:()=>mark(view.target)});
  else if(view.status!=='completed')choices.push({label:'Find the recruiter on Morrow',action:()=>mark(MILITARY_RECRUITER_TARGET)});
  for(const action of secondary)choices.push({label:action.label,detail:action.reason||action.detail||'Keep your progress and return to your own voyage.',disabled:action.available===false,action:()=>act(action,entityId)});
  if(view.status==='completed'&&openOrdinaryWork)choices.push({label:'Continue with ordinary service work',action:openOrdinaryWork});
  choices.push({label:'Back to the world',action:()=>dialog.close()});dialog.choices(choices);
 }
 function appendEntry(root){
  const view=status();
  const rank=view.serviceRank||militaryServiceRank(getGame());
  const card=doc.createElement('article');card.className='entry-card';
  card.innerHTML=`<span class="eyebrow">${view.branchId?'YOUR SERVICE RECORD':'OPTIONAL / A GUIDED SERVICE CAREER'}</span><h3>${esc(view.branchName||'Serve with Freewake')}</h3>${rank.enlisted?`<p class="mini">${esc(rank.rank)} · ${rank.completed} completed assignments</p>`:''}<p>${esc(view.branchId?view.objective||'Your service record is kept by the recruiter.':'Sergeant Sera Venn on Morrow offers Navy and Army assignments, one at a time.')}</p>`;
  const button=doc.createElement('button');button.textContent=view.branchId?'Review your next assignment':'Find the recruiter on Morrow';button.onclick=view.branchId?()=>open():()=>mark(MILITARY_RECRUITER_TARGET);card.append(button);root.append(card);
 }
 return{open,appendEntry,status};
}
