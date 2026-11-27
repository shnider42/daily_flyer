/** An on-demand crew and communications desk. It only displays public local state. */
const text=value=>String(value??'');
const number=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const phases=new Set(['locking','towing','detained']);
const clock=seconds=>{const value=Math.max(0,Math.ceil(number(seconds)));return value>=60?`${Math.floor(value/60)}m ${value%60}s`:`${value}s`;};

export function custodyPresentation(game){
 const status=game?.custodyStatus?.();if(!status||!phases.has(status.phase))return null;
 const detained=status.phase==='detained',title=status.title||(detained?'In custody':status.phase==='towing'?'Tractor attached':'Tractor lock');
 const countdown=Number.isFinite(status.remainingSeconds)?clock(status.remainingSeconds):'';
 const actions=(status.actions||[]).filter(action=>typeof action?.id==='string').map(action=>({id:action.id,label:text(action.label||action.id),detail:text(action.detail),enabled:action.enabled!==false,reason:text(action.reason)}));
 return{...status,title,detained,countdown,actions,identity:countdown?`${title} · ${countdown}`:title,
  compact:detained?'Find the liaison or service panel. Tap for release conditions.':status.phase==='locking'?'Boost out of range. Open tractor status for options.':'Your ship is being towed. Open tractor status for options.',
  tone:'warning'};
}

export function custodyGuidePrompt(game){
 const status=custodyPresentation(game);if(!status)return null;
 return{id:`route:custody:${status.phase}`,topicId:'custody',flow:'route',critical:true,title:status.title,
  body:status.detail||status.compact,compactBody:status.compact,controlTarget:'situationButton',highlight:false};
}

/** Nearby entries are supplied by the same proximity/visibility rule as E/Use. */
export function createCrewCommsUI({getGame,getNetwork=()=>null,getAwareness=()=>null,getContacts=()=>[],dialog,invoke,acceptResult,
 openCrew,openOnline,openRecentMessages,onChange=()=>{}}){
 let revision=0,pending=false,view=null,signature='';
 const element=(tag,className='',value='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text(value);return node;};
 const append=(parent,tag,className,value)=>{const node=element(tag,className,value);parent.append(node);return node;};
 const context=()=>({game:getGame(),captainId:getGame()?.state?.multiplayer?.captainId,revision,kind:dialog.kind});
 const current=owner=>owner.game===getGame()&&owner.captainId===getGame()?.state?.multiplayer?.captainId&&owner.revision===revision&&dialog.opened&&owner.kind===dialog.kind;
 const publicContacts=()=>(getContacts()||[]).filter(contact=>contact?.id&&contact.available!==false&&typeof contact.open==='function').slice(0,4);
 const snapshot=()=>{const status=custodyPresentation(getGame());return JSON.stringify({custody:status&&{phase:status.phase,title:status.title,countdown:status.countdown,detail:status.detail,captorName:status.captorName,vesselName:status.vesselName,factors:status.factors,actions:status.actions},contacts:publicContacts().map(({id,label,detail})=>({id,label,detail})),crew:getGame()?.livingCrew?.map(({id,name,health,status})=>({id,name,health,status})),awareness:getAwareness(),connected:getNetwork()?.connected});};
 function begin(title,kind,eyebrow){revision++;dialog.open(title,kind,{eyebrow});const root=append(dialog.body,'div','crew-comms');view=kind;return root;}
 function message(root,heading,detail,{warning=false}={}){
  const card=append(root,'section',`comms-status${warning?' comms-warning':''}`);append(card,'strong','',heading);if(detail)append(card,'p','',detail);return card;
 }
 function row(root,{id,label,detail,action,disabled=false}){
  const button=append(root,'button','comms-row');button.type='button';button.disabled=disabled;button.dataset.dialogKey=id;
  const copy=append(button,'span','comms-row-copy');append(copy,'strong','',label);if(detail)append(copy,'small','',detail);append(button,'span','comms-arrow','›').setAttribute('aria-hidden','true');
  const owner=context();button.onclick=()=>{if(!button.disabled&&current(owner))return action();};return button;
 }
 function open(){
  const game=getGame(),network=getNetwork(),awareness=getAwareness(),status=custodyPresentation(game),contacts=publicContacts();
  const root=begin('Crew & comms','crew-comms',network?'SHARED GALAXY · LIVE COMMUNICATIONS':'SHIP COMPUTER · PEOPLE & MESSAGES');
  if(status)row(root,{id:'custody',label:status.identity,detail:status.compact,action:openCustody});
  const crew=game?.livingCrew||[],names=crew.slice(0,2).map(member=>member.name).filter(Boolean).join(', ');
  row(root,{id:'manifest',label:'Crew manifest',detail:crew.length?`${crew.length} living crewmate${crew.length===1?'':'s'}${names?' · '+names:''}${crew.length>2?' +'+(crew.length-2):''}`:'Crew, berths, health and hiring',action:openCrew});
  row(root,{id:'shared-crew',label:network?'Shared crew & boarding':'Play together',detail:network?.connected?awareness?.detail||'Captains, invitations and ship permissions':network?'Reconnecting to your galaxy':'Create or join a shared galaxy',action:openOnline});
  if(contacts.length){append(root,'h3','comms-section-title','Within reach');for(const contact of contacts)row(root,{id:'contact:'+contact.id,label:contact.label||'Open channel',detail:contact.detail,action:()=>{
   const fresh=publicContacts().find(value=>value.id===contact.id);if(fresh)return fresh.open();open();
  }});}
  row(root,{id:'recent-messages',label:'Recent messages',detail:'Read the complete notices from this visit',action:openRecentMessages});
  if(network)append(root,'p','comms-live-note','The shared galaxy keeps moving while this panel is open.');
  dialog.choices([{label:'Return to the world',action:()=>dialog.close()}]);signature=snapshot();return root;
 }
 function openCustody(){
  const game=getGame(),status=custodyPresentation(game),root=begin(status?.detained?'Custody & release':'Tractor status','custody',status?.captorName||'CURRENT SITUATION');
  if(!status){message(root,'No active custody','Your current position and ship status are shown in the world.');dialog.choices([{label:'Crew & comms',action:open},{label:'Return to the world',action:()=>dialog.close()}]);signature=snapshot();return root;}
  message(root,status.identity,status.detail||status.compact,{warning:true});
  if(status.vesselName)append(root,'p','comms-location',`Your ship · ${status.vesselName}`);
  if(status.factors?.length){const details=append(root,'details','comms-factors');details.dataset.dialogKey='custody-factors';append(details,'summary','','What affects your position');const list=append(details,'dl','');for(const factor of status.factors){append(list,'dt','',factor.label);append(list,'dd','',factor.value);}}
  const owner=context();
  dialog.choices(status.actions.map(action=>({id:action.id,label:action.label,detail:action.enabled?action.detail:action.reason||action.detail,disabled:pending||!action.enabled,
   action:()=>act(action.id,owner,status.phase,status.captorName)})));
  if(pending)append(root,'p','comms-pending','Waiting for acknowledgement…').setAttribute('role','status');
  if(getNetwork())append(root,'p','comms-live-note','Time and ship movement continue in this shared galaxy.');
  dialog.choices([{label:status.detained?'Return to the brig':'Return to flight',action:()=>dialog.close()},{label:'Crew & comms',action:open}]);signature=snapshot();return root;
 }
 async function act(id,owner,phase,captor){
  if(pending||!current(owner))return;
  const status=custodyPresentation(getGame()),action=status?.actions.find(value=>value.id===id);
  if(!status||status.phase!==phase||status.captorName!==captor||!action?.enabled){openCustody();return;}
  pending=true;openCustody();const waiting=context();
  try{const answer=await invoke('custodyAction',{action:id});if(!current(waiting))return;acceptResult(answer);if(answer?.ok)onChange(answer);}
  finally{pending=false;if(current(waiting))openCustody();}
 }
 function refresh(){
  if(pending||!dialog.opened||dialog.kind!==view||!['crew-comms','custody'].includes(view))return false;
  const next=snapshot();if(next===signature)return false;
  if(view==='custody')openCustody();else open();return true;
 }
 return{open,openCustody,refresh};
}
