/** Personal campaign progression. Only authoritative field hooks record evidence. */
import { FACTIONS } from './content.mjs';
import { generateSurface } from './surface.mjs';
import { liveInteractionSurface, interactionInRange } from './live-surface.mjs';
import { MILITARY_RECRUITER, MILITARY_RECRUITER_TARGET, militaryCampaign, militaryBranch, militaryMission } from './military-content.mjs';

const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,max)=>Math.min(max,Math.max(0,finite(value)));
const integer=(value,max=1e8)=>Math.floor(clamp(value,max));
const clone=value=>JSON.parse(JSON.stringify(value));
const word=(value,max=240)=>typeof value==='string'?value.slice(0,max):'';
const validOperation=(value,factionId,branchId)=>typeof value==='string'&&value.length<=240&&new RegExp(`^military:${factionId}:${branchId}:[-a-zA-Z0-9_]+:[1-9][0-9]{0,8}$`).test(value)&&Number(value.split(':').at(-1))<=1e8;
const time=game=>Math.max(0,finite(game.state.stats?.time));
const stateFor=game=>game.state.militaryCareer||game.initializeMilitaryCareer();
const enlistedFor=game=>game.state.professions?.careers?.military;
const nextMission=state=>militaryBranch(state.factionId,state.branchId)?.missions[state.completed.length]||null;
const effectivePhase=active=>active?.phase==='paused'?active.pausedPhase||'active':active?.phase;
const ranks=['Volunteer','Fleet specialist','Veteran','Section leader'];
const rank=xp=>ranks[xp>=16?3:xp>=8?2:xp>=3?1:0];
const failure=(reason,code='military-orders')=>({ok:false,reason,message:reason,code});
// Invalid old watches and missing shared vessels can be recovered at the
// recruiter without inventing a settlement receipt or replacing a live watch.
function orphanedNavy(game,state,mission){
 if(!mission?.navy||!state.active||effectivePhase(state.active)!=='active')return false;
 const contract=game.state.npcContract,owner=game.state.multiplayer?.captainId||game.playerId;
 return !contract?.active||contract.employeeId!==owner||contract.military?.operationId!==state.active.operationId||contract.military?.missionId!==mission.id;
}

function recruiterAccess(game,entityId){
 const s=game.state,p=s.person;
 if(s.mode!=='person'||!p||!Number.isFinite(p.health)||p.health<=0||p.down||!Number.isFinite(p.x)||!Number.isFinite(p.y))return failure('Meet the recruiter on foot after recovering.','incapacitated');
 if(s.interior||s.exploration||s.systemId!==MILITARY_RECRUITER.systemId||s.locationId!==MILITARY_RECRUITER.bodyId)return failure('Meet Sergeant Sera Venn at Morrow’s landing in Hearth.','location');
 const body=game.system.bodies.find(body=>body.id===MILITARY_RECRUITER.bodyId);
 if(!body||body.portServices===false||(body.faction||game.currentSystem.faction)!==MILITARY_RECRUITER.factionId)return failure('This recruiter cannot issue orders from this port.','faction');
 if(entityId!==MILITARY_RECRUITER.id)return failure('Speak with Sergeant Sera Venn at the landing.','entity');
 const key=`${s.systemId}:${body.id}:${s.flags.length}`;
 if(game._militarySurfaceCache?.key!==key)game._militarySurfaceCache={key,surface:generateSurface(body,s.seed,s.flags)};
 const surface=liveInteractionSurface(game,game._militarySurfaceCache.surface),entity=surface.entities.find(entity=>entity.id===MILITARY_RECRUITER.id&&entity.type==='npc'&&entity.data?.militaryRecruiter&&entity.data.factionId===MILITARY_RECRUITER.factionId&&!entity.hidden);
 if(!entity||!interactionInRange(game,surface,entity,46))return failure('Move closer to Sergeant Sera Venn.','distance');
 return{ok:true,body,entity};
}

function emptyEvidence(mission){return Object.fromEntries(mission.objectives.map(objective=>[objective.id,{value:0,tokens:[]}]));}
function normalizeEvidence(mission,raw){
 const evidence=emptyEvidence(mission);
 for(const objective of mission.objectives){
  const value=raw?.[objective.id],tokens=[...new Set((Array.isArray(value?.tokens)?value.tokens:[]).filter(token=>typeof token==='string'&&token.length>0&&token.length<=320))].slice(0,512);
  evidence[objective.id]={value:objective.distinct?Math.min(tokens.length,objective.required):tokens.length?clamp(value?.value,objective.required):0,tokens};
 }
 return evidence;
}
function allEvidence(mission,active){return mission.objectives.every(objective=>finite(active.evidence?.[objective.id]?.value)>=objective.required);}
function validNavyReceipt(mission,operationId,receipt){
 if(!mission?.navy||!receipt||receipt.completed!==true||receipt.returned!==true||receipt.destination?.systemId!==mission.systemId||receipt.destination?.bodyId!==mission.bodyId)return null;
 const targets=[];
 for(let i=0;i<mission.navy.targetCount;i++){
  const id=`${operationId}:target:${i}`,matches=Array.isArray(receipt.targets)?receipt.targets.filter(target=>target?.id===id):[];
  if(matches.length!==1||matches[0].neutralized!==true||finite(matches[0].damage)<mission.navy.requiredDamage)return null;
  targets.push({id,damage:clamp(matches[0].damage,1e6),neutralized:true,maxHull:clamp(matches[0].maxHull,1e6)});
 }
 return{completed:true,returned:true,outcome:word(receipt.outcome,100),wages:0,damage:clamp(receipt.damage,1e7),shots:integer(receipt.shots,1e7),targets,destination:{systemId:mission.systemId,bodyId:mission.bodyId,name:'Morrow'}};
}
function evidenceReady(mission,active){return mission.branchId==='navy'?!!validNavyReceipt(mission,active.operationId,active.receipt):allEvidence(mission,active);}
function setPhase(state,phase){
 if(state.paused){state.active.phase='paused';state.active.pausedPhase=phase;}
 else{state.active.phase=phase;delete state.active.pausedPhase;}
}
function ready(game,state,mission){
 if(effectivePhase(state.active)!=='active'||!evidenceReady(mission,state.active))return false;
 setPhase(state,'debrief');
 game._event('military-progress',{missionId:mission.id,text:`${mission.title} complete. Return to Sergeant Venn on Morrow for your debrief.`});
 return true;
}
function serviceStanding(game){return finite(game.state.rep?.freewake)>-25?{ok:true}:failure('Freewake has suspended new orders while your standing is hostile.','military-standing');}
function canStart(game,entityId){
 const check=recruiterAccess(game,entityId);if(!check.ok)return check;
 if(game.state.pendingEncounter)return failure('Resolve the current encounter before beginning a deployment.','encounter');
 if(game.state.npcContract?.active)return failure('End your current crew watch before beginning a deployment.','crew-duty');
 return serviceStanding(game);
}
function actionView(action,label,check,extra={}){return{action,label,available:!!check.ok,reason:check.reason||null,...extra};}
function objectiveView(game,state,mission){
 const active=state.active,contract=game.state.npcContract,matched=mission.navy&&contract?.military?.missionId===mission.id&&contract.military.operationId===active.operationId;
 const qualified=matched?(contract.work?.targets||[]).filter((target,index,all)=>target.neutralized&&finite(target.damage)>=mission.navy.requiredDamage&&all.findIndex(other=>other.id===target.id)===index&&Array.from({length:mission.navy.targetCount},(_,i)=>`${active.operationId}:target:${i}`).includes(target.id)).length:0;
 return mission.objectives.map(objective=>{const value=Math.min(objective.required,Math.max(finite(active.evidence?.[objective.id]?.value),objective.id==='targets'?qualified:0));return{id:objective.id,label:objective.label,value,required:objective.required,done:value>=objective.required};});
}
function activeTarget(game,state,mission){
 if(effectivePhase(state.active)!=='active')return{target:clone(MILITARY_RECRUITER_TARGET),objective:effectivePhase(state.active)==='debrief'?`Return to Sergeant Venn on Morrow to debrief ${mission.title.toLowerCase()}.`:'Return to Sergeant Venn on Morrow to request a fresh deployment.'};
 if(mission.branchId==='navy'){
  const contract=game.state.npcContract;
  if(contract?.active&&contract.military?.operationId===state.active.operationId){const duty=game.npcContractStatus?.();return{target:{systemId:game.state.systemId,...(duty?.target||{stationRole:'weapons'})},objective:duty?.task||mission.objective};}
  return{target:clone(MILITARY_RECRUITER_TARGET),objective:'Return to Sergeant Venn. This deployment no longer has an active carrier watch.'};
 }
 const site=game.state.interior?.location?.site,here=site?.operationId===state.active.operationId&&site.id===mission.siteId;
 if(here){
  const goal=mission.objectives.find(objective=>objective.event==='ground-objective'),combatDone=mission.objectives.filter(objective=>objective.event!=='ground-objective').every(objective=>finite(state.active.evidence?.[objective.id]?.value)>=objective.required);
  if(combatDone)return{target:{systemId:mission.systemId,bodyId:mission.bodyId,siteId:mission.siteId,entityId:`record:${goal.id}`,label:goal.label},objective:goal.label+'.'};
  const enemy=game.state.exploration?.encounter?.monsters.find(enemy=>enemy.health>0);
  return{target:{systemId:mission.systemId,bodyId:mission.bodyId,siteId:mission.siteId,...(enemy?{x:enemy.x,y:enemy.y}:{}),label:mission.title},objective:mission.objectives[0].id==='hits'?'Aim and fire at each target frame. Use the cover blocks to practice moving between shots.':'Use cover and your own weapon to clear the armed threat.'};
 }
 return{target:{systemId:mission.systemId,bodyId:mission.bodyId,siteId:mission.siteId,entityId:`site:${mission.siteId}`,label:mission.siteName},objective:mission.objective};
}

export const MilitaryCareerRules={
 initializeMilitaryCareer(){
  if(!this.state.professions)this.initializeProfessions();
  const enlistment=enlistedFor(this),raw=this.state.militaryCareer&&typeof this.state.militaryCareer==='object'?this.state.militaryCareer:{},factionId=enlistment?.enlisted?enlistment.factionId:'freewake',branch=enlistment?.enlisted?militaryBranch(factionId,raw.branchId):null;
  const state={version:1,factionId,branchId:branch?.id||null,attemptSerial:integer(raw.attemptSerial),completed:[],active:null,paused:!!(branch&&raw.paused)};
  if(branch){
   const completed=new Set((Array.isArray(raw.completed)?raw.completed:[]).filter(id=>typeof id==='string'));
   for(const mission of branch.missions){if(!completed.has(mission.id))break;state.completed.push(mission.id);}
   const mission=nextMission(state),active=raw.active;
   if(mission&&active?.missionId===mission.id&&validOperation(active.operationId,state.factionId,state.branchId)&&['active','debrief','paused','failed'].includes(active.phase)){
    const evidence=normalizeEvidence(mission,active.evidence),receipt=validNavyReceipt(mission,active.operationId,active.receipt),phase=active.phase==='paused'?['active','debrief','failed'].includes(active.pausedPhase)?active.pausedPhase:'active':active.phase;
    state.active={missionId:mission.id,operationId:active.operationId,serial:Number(active.operationId.split(':').at(-1)),phase,startedAt:Math.max(0,finite(active.startedAt)),evidence,receipt,failure:word(active.failure,400)};
    state.attemptSerial=Math.max(state.attemptSerial,state.active.serial);
    if(phase==='debrief'&&!evidenceReady(mission,state.active))state.active.phase='active';
    if(receipt){state.active.evidence.targets={value:mission.navy.targetCount,tokens:receipt.targets.map(target=>target.id)};state.active.evidence.return={value:1,tokens:[active.operationId]};}
    state.paused=state.paused||active.phase==='paused';if(state.paused){state.active.pausedPhase=state.active.phase;state.active.phase='paused';}
   }
   if(!mission)state.paused=false;
  }
  this.state.militaryCareer=state;return state;
 },
 militaryCareerStatus(entityId=null){
  const state=stateFor(this),enlistment=enlistedFor(this),campaign=militaryCampaign(state.factionId),branch=militaryBranch(state.factionId,state.branchId),mission=nextMission(state),id=entityId||MILITARY_RECRUITER.id,check=recruiterAccess(this,id),actions=[];
  let status=!campaign?'unavailable':!enlistment?.enlisted?'unjoined':!branch?'choose-branch':state.paused?'paused':!mission?'completed':orphanedNavy(this,state,mission)?'failed':state.active?state.active.phase:'ready';
  let title=branch?.name||'A place in the service',objective='Meet Sergeant Sera Venn at Morrow’s landing and choose Navy or Army.',target=clone(MILITARY_RECRUITER_TARGET),summary='Joining is optional. Your ship, personal gear, existing rank, and unfinished jobs stay with you.';
  if(status==='unavailable'){objective='This employer has no authored career campaign here.';summary='Your existing enlistment, clearance, and ordinary service assignments remain available.';target=null;}
  else if(!branch){
   for(const offered of campaign.branches){const joinCheck=!check.ok?check:serviceStanding(this);actions.push(actionView('join',`Join the ${offered.name}`,joinCheck,{branchId:offered.id,entityId:id,detail:offered.description}));}
  }else{
   summary=`${state.completed.length} / ${branch.missions.length} deployments debriefed · ${rank(enlistment.xp)}. ${mission?.summary||branch.completion}`;
   if(status==='completed'){title='Your first service campaign is complete';objective=branch.completion;target=null;}
   else if(status==='paused'){title='On leave';objective='Your assignment and field record are saved. Resume when you want to continue.';actions.push(actionView('resume','Resume your service',this.state.person?.health>0&&!this.state.person.down?{ok:true}:failure('Recover before resuming service.','incapacitated')));}
   else if(!state.active){title=mission.title;objective=`Meet Sergeant Venn for ${mission.title.toLowerCase()}.`;actions.push(actionView('start',mission.branchId==='navy'?'Begin the carrier deployment':'Take the field assignment',canStart(this,id),{entityId:id,detail:`${mission.reward} cr after the completed debrief. ${mission.summary}`}));}
   else{
    title=mission.title;({objective,target}=activeTarget(this,state,mission));
    if(status==='debrief')actions.push(actionView('debrief',`File your debrief · ${mission.reward} cr`,check,{entityId:id}));
    if(status==='failed'){summary=state.active.failure||'This deployment ended before its objectives and return were complete.';actions.push(actionView('retry','Request a fresh deployment',canStart(this,id),{entityId:id,detail:'The new attempt starts with a fresh operation record. No pay was awarded for the previous attempt.'}));}
   }
   if(!['completed','paused'].includes(status))actions.push(actionView('pause','Take leave from the guided career',this.state.person?.health>0&&!this.state.person.down?{ok:true}:failure('Recover before changing your service guidance.','incapacitated'),{detail:'Hide service guidance and keep the same assignment. Any live watch continues until you physically leave it.'}));
  }
  return{status,enlisted:!!enlistment?.enlisted,guidanceActive:['ready','active','debrief','failed'].includes(status),factionId:state.factionId,factionName:FACTIONS.find(faction=>faction.id===state.factionId)?.name||state.factionId,branchId:state.branchId,branchName:branch?.name||null,title,objective,target,summary,branches:(campaign?.branches||[]).map(({id,name,description})=>({id,name,description})),active:state.active&&mission?{missionId:mission.id,operationId:state.active.operationId,phase:state.active.phase,objectives:objectiveView(this,state,mission)}:null,chapters:(branch?.missions||[]).map((chapter,index)=>({id:chapter.id,title:chapter.title,summary:chapter.summary,status:state.completed.includes(chapter.id)?'completed':chapter.id===state.active?.missionId?'active':index===state.completed.length?'available':'locked'})),actions};
 },
 militaryCareerAction({action,branchId,entityId}={}){
  const state=stateFor(this),enlistment=enlistedFor(this);
  if(action==='join'){
   const check=recruiterAccess(this,entityId);if(!check.ok)return check;
   const campaign=militaryCampaign(MILITARY_RECRUITER.factionId),branch=militaryBranch(campaign.factionId,branchId);
   if(!branch)return this._fail('Choose an authored Navy or Army branch.','branch');
   if(enlistment?.enlisted&&enlistment.factionId!==campaign.factionId)return this._fail('Your military enlistment belongs to another faction. It remains unchanged.','faction');
   if(state.branchId)return this._fail('Your service branch is already recorded. Resume its current assignment.','duplicate');
   const standing=serviceStanding(this);if(!standing.ok)return standing;
   if(!enlistment.enlisted){enlistment.enlisted=true;enlistment.factionId=campaign.factionId;this.state.rep[campaign.rivalId]=Math.max(-100,finite(this.state.rep[campaign.rivalId])-3);}
   state.factionId=campaign.factionId;state.branchId=branch.id;state.paused=false;
   this._log(`Joined: ${branch.name}`,'Sergeant Venn recorded your branch. Your first deployment begins when you take its briefing.','profession');
   return this._ok({text:`You joined the ${branch.name}. Speak with Sergeant Venn when you are ready for the first assignment.`,status:this.militaryCareerStatus(entityId)});
  }
  const branch=militaryBranch(state.factionId,state.branchId),mission=nextMission(state);
  if(!enlistment?.enlisted||!branch)return this._fail('Choose your military branch with the recruiter first.','requirements');
  if(action==='pause'){
   if(!mission)return this._fail('This career campaign is already complete.','completed');
   if(state.paused)return this._fail('Your guided career is already on leave.','duplicate');
   if(this.state.person.health<=0||this.state.person.down)return this._fail('Recover before changing your service guidance.','incapacitated');
   state.paused=true;if(state.active){state.active.pausedPhase=state.active.phase;state.active.phase='paused';}
   return this._ok({text:'Service guidance paused. Your current assignment and recorded work are kept.'});
  }
  if(action==='resume'){
   if(!state.paused)return this._fail('Your guided career is already active.','duplicate');
   if(this.state.person.health<=0||this.state.person.down)return this._fail('Recover before resuming service.','incapacitated');
   state.paused=false;if(state.active){state.active.phase=state.active.pausedPhase||'active';delete state.active.pausedPhase;}
   return this._ok({text:'Service guidance resumed. Continue the same assignment.'});
  }
  if(state.paused)return this._fail('Resume your service guidance first.','paused');
  if(action==='start'||action==='retry'){
   if(!mission)return this._fail('You have completed this authored service campaign.','completed');
   if(action==='start'&&state.active||action==='retry'&&state.active?.phase!=='failed'&&!orphanedNavy(this,state,mission))return this._fail('Finish the current deployment or return for its debrief.','active');
   const check=canStart(this,entityId);if(!check.ok)return check;
   if(typeof this._startMilitaryMission!=='function')return this._fail('This deployment is not available in this session.','unavailable');
   if(state.attemptSerial>=1e8)return this._fail('The operation ledger has reached its limit.','capacity');
   const serial=state.attemptSerial+1,owner=String(this.playerId||'local').replace(/[^-a-zA-Z0-9_]/g,'_').slice(0,100),operationId=`military:${state.factionId}:${branch.id}:${owner}:${serial}`;
   const active={missionId:mission.id,operationId,serial,phase:'active',startedAt:time(this),evidence:emptyEvidence(mission),receipt:null,failure:''};
   const result=this._startMilitaryMission(mission,active);if(!result?.ok)return result||this._fail('The deployment could not be prepared.','unavailable');
   state.attemptSerial=serial;state.active=active;
   this._log(mission.title,mission.summary,'profession');this._event('military-progress',{missionId:mission.id,text:mission.objective});
   return this._ok({...result,text:result.text||mission.objective,operationId,missionId:mission.id});
  }
  if(action==='debrief'){
   const check=recruiterAccess(this,entityId);if(!check.ok)return check;
   if(!mission||!state.active||state.active.phase!=='debrief'||!evidenceReady(mission,state.active))return this._fail('Complete the assigned field work and return before filing this debrief.','evidence');
   if(this.state.npcContract?.active)return this._fail('Go ashore and end the carrier watch before filing your debrief.','crew-duty');
   const operationId=state.active.operationId,oldRank=rank(enlistment.xp);
   this.state.credits+=mission.reward;enlistment.xp=Math.min(1e4,enlistment.xp+mission.xp);enlistment.completed=Math.min(1e5,enlistment.completed+1);enlistment.earned=Math.min(1e9,enlistment.earned+mission.reward);
   const campaign=militaryCampaign(state.factionId);this.state.rep[state.factionId]=Math.min(100,finite(this.state.rep[state.factionId])+3);this.state.rep[campaign.rivalId]=Math.max(-100,finite(this.state.rep[campaign.rivalId])-2);
   state.completed.push(mission.id);state.active=null;
   const promoted=rank(enlistment.xp)!==oldRank,outcome=state.completed.length===branch.missions.length?branch.completion:mission.branchId==='navy'?'The carrier’s return and your recorded gunnery contribution are confirmed.':'Your field report and completed site objective are confirmed.';
   const text=`${outcome} ${mission.reward} cr paid.${promoted?` Promoted to ${rank(enlistment.xp)}.`:''}`;
   this.state.professions.history.unshift({id:operationId,professionId:'military',title:mission.title,outcome,paid:mission.reward,at:time(this)});this.state.professions.history=this.state.professions.history.slice(0,16);
   this._log(mission.title,text,'profession');this._event('profession-complete',{professionId:'military',missionId:mission.id,paid:mission.reward,text});
   return this._ok({text,paid:mission.reward,completed:true,promoted,rank:rank(enlistment.xp),status:this.militaryCareerStatus(entityId)});
  }
  return this._fail('That career action is not available.','action');
 },
 observeMilitaryEvent(type,{operationId,siteId,objectiveId,amount=1,token}={}){
  const state=stateFor(this),active=state.active,mission=active&&militaryMission(active.missionId);
  if(!active||effectivePhase(active)!=='active'||mission?.branchId!=='army'||active.operationId!==operationId||mission.siteId!==siteId)return failure('This field record belongs to another operation.','operation');
  const objective=mission.objectives.find(objective=>objective.id===objectiveId&&objective.event===type);
  if(!objective||!['ground-hit','ground-clear','ground-objective'].includes(type)||typeof token!=='string'||!token||token.length>320||finite(amount)<=0)return failure('This field record is not part of the assigned objective.','evidence');
  const evidence=active.evidence[objectiveId];if(evidence.tokens.includes(token)||evidence.value>=objective.required)return{ok:true,duplicate:true,ready:false};
  if(evidence.tokens.length>=512)return failure('This objective’s evidence ledger is full.','capacity');
  evidence.tokens.push(token);evidence.value=Math.min(objective.required,evidence.value+(objective.distinct||type!=='ground-hit'?1:amount));
  return{ok:true,progressed:true,ready:ready(this,state,mission)};
 },
 recordMilitarySortie(contract,result={}){
  const state=stateFor(this),active=state.active,mission=active&&militaryMission(active.missionId),binding=contract?.military;
  if(!active||effectivePhase(active)!=='active'||mission?.branchId!=='navy'||binding?.branchId!=='navy'||binding.missionId!==mission.id||binding.operationId!==active.operationId||contract.employeeId!==this.playerId)return failure('This sortie receipt belongs to another captain or operation.','operation');
  const receipt=validNavyReceipt(mission,active.operationId,result);
  if(!receipt){active.receipt=null;active.failure='The carrier watch ended before every marked target and the return to Morrow were complete. Return to Sergeant Venn for a fresh deployment.';setPhase(state,'failed');this._event('military-progress',{missionId:mission.id,text:active.failure});return{ok:true,completed:false,retry:true};}
  active.receipt=receipt;active.evidence.targets={value:mission.navy.targetCount,tokens:receipt.targets.map(target=>target.id)};active.evidence.return={value:1,tokens:[active.operationId]};
  return{ok:true,completed:true,ready:ready(this,state,mission)};
 }
};
