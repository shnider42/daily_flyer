/** One optional service track, with one current objective rather than a work catalog. */
import { escapeHtml as esc } from './ui.mjs';
import { MILITARY_RECRUITER, MILITARY_RECRUITER_TARGET } from './military-content.mjs';

export const MILITARY_RECRUITER_ID=MILITARY_RECRUITER.id;
export { MILITARY_RECRUITER_TARGET };

export function militaryCareerGuided(status){
 return status?.guidanceActive===true;
}

export function militaryCareerPrompt(status,{mode='person',nearby=null,gunnery=false,touch=false}={}){
 if(!militaryCareerGuided(status))return null;
 const targetId=status.target?.entityId,near=!!targetId&&(nearby?.id===targetId||nearby?.id?.endsWith(':'+targetId));
 const body=gunnery?'Aim the ship battery and hold FIRE. The NPC captain flies. Back to deck leaves this view.':near?`${touch?'Tap the highlighted action':'Press E'} to continue your assignment.`:status.objective;
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
   if(['start','retry','resume','pause'].includes(action.action)){
    dialog.close();const next=status();if(militaryCareerGuided(next)&&next.target)track(next.target,{quiet:true});
   }else open(entityId);
  }finally{busy=false;}
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
  dialog.html(`<div class="duty-current"><span>${view.status==='paused'?'ON LEAVE':view.status==='completed'?'SERVICE RECORD':'YOUR NEXT TASK'}</span><strong>${esc(view.title||view.objective||'Speak to the recruiter')}</strong><p>${esc(view.objective||'Return to Sergeant Sera Venn on Morrow for your next assignment.')}</p></div>${summary?`<p>${esc(summary)}</p>`:''}${objectives.length?`<ol class="duty-checklist">${objectives.map(objective=>`<li class="${objective.done?'done':'current'}"><span aria-hidden="true">${objective.done?'✓':'·'}</span>${esc(objective.label)}${Number.isFinite(objective.required)&&objective.required>1?` · ${Math.min(objective.required,Math.max(0,Number(objective.value)||0))} / ${objective.required}`:''}</li>`).join('')}</ol>`:''}`);
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
  const card=doc.createElement('article');card.className='entry-card';
  card.innerHTML=`<span class="eyebrow">${view.branchId?'YOUR SERVICE RECORD':'OPTIONAL / A GUIDED SERVICE CAREER'}</span><h3>${esc(view.branchName||'Serve with Freewake')}</h3><p>${esc(view.branchId?view.objective||'Your service record is kept by the recruiter.':'Sergeant Sera Venn on Morrow offers Navy and Army assignments, one at a time.')}</p>`;
  const button=doc.createElement('button');button.textContent=view.branchId?'Review your next assignment':'Find the recruiter on Morrow';button.onclick=view.branchId?()=>open():()=>mark(MILITARY_RECRUITER_TARGET);card.append(button);root.append(card);
 }
 return{open,appendEntry,status};
}
