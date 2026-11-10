/**
 * Contextual teaching, independent of the DOM, storage and game authority.
 *
 * A controller belongs to exactly one save/captain and one scope. The app stores
 * exportState() under that identity, and supplies confirmed successful uses as
 * {action, id, success:true}. Input durations, dismissal and the passage of time
 * never earn progress. Use an ID for a completed gesture/action, not each frame.
 *
 * update(context) returns at most one inert prompt. Its action is a highlight
 * descriptor, never a game command. Moderate only answers requestHelp(); Expert
 * never produces a tutorial. Isolated exercises may explicitly force Simple.
 */
export const GUIDANCE_VERSION=1;
export const GUIDANCE_LIMIT=2;
export const GUIDANCE_ACTIONS=Object.freeze([
  'flight-thrust','flight-turn','flight-strafe','flight-brake','ship-fire','dock',
  'person-move','person-use','job-accept','work','job-turn-in','mine','salvage',
  'person-aim','person-fire','person-hit','board-enemy','return-airlock','take-helm',
  'crew-permission','board-friend'
]);
export const GUIDANCE_CONTROL_TARGETS=Object.freeze({
  move:'stick',flight:'stick',strafe:'aimStick',aim:'aimStick',fire:'fireButton',
  brake:'brakeButton',mine:'mineButton',use:'contextButton',crew:'onlineButton',weapon:'weaponState',perspective:'modePill'
});
const ACTIONS=new Set(GUIDANCE_ACTIONS);
const CONTROL_ACTIONS=new Set(['flight-thrust','flight-turn','flight-strafe','flight-brake','ship-fire','person-move','person-aim','person-fire','person-hit']);
const INTERACTIONS=new Set(['dock','person-use','job-accept','work','job-turn-in','mine','salvage','board-enemy','return-airlock','take-helm','crew-permission','board-friend']);
const FLOW_ACTIONS=Object.freeze({
  flight:['flight-thrust','flight-turn','flight-strafe','flight-brake'],
  person:['person-move','person-use'],combat:['person-aim','person-fire','person-hit'],
  docking:['dock'],work:['job-accept','work','job-turn-in'],mining:['mine','salvage'],
  boarding:['board-enemy','return-airlock','take-helm'],crew:['crew-permission','board-friend']
});
const mode=value=>['simple','moderate','expert'].includes(value)?value:'simple';
const device=value=>['touch','mobile','phone','tablet'].includes(value)?'touch':'keyboard';
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const count=value=>Math.max(0,Math.min(GUIDANCE_LIMIT,Math.floor(finite(value))));
const text=(value,fallback='')=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,180):fallback;
const copy=value=>JSON.parse(JSON.stringify(value));
const control=(ctx,kind)=>{
  const touch=device(ctx.device)==='touch',primary=ctx.leftHanded?'right':'left',secondary=ctx.leftHanded?'left':'right';
  const labels=touch?{
    thrust:`the ${primary} flight stick`,turn:`the ${primary} flight stick`,strafe:`the ${secondary} stick`,
    brake:'BRAKE',fire:'FIRE',mine:'MINE',walk:`the ${primary} WALK stick`,aim:`the ${secondary} AIM stick`,use:'USE',dock:'DOCK',crew:'CREW'
  }:{thrust:'W',turn:'← / →',strafe:'A / D',brake:'S or X',fire:'Space',mine:'R',walk:'WASD',aim:'the mouse or arrow keys',use:'E',dock:'E',crew:'CREW'};
  return labels[kind];
};
const useInstruction=(ctx,fallback='USE',label=null)=>ctx.device==='touch'?`Tap ${text(label||ctx.nearby?.controlLabel||ctx.controlLabel,fallback)}`:'Press E';

/** Use public save/captain identifiers, never passport tokens, in a storage key. */
export function guidanceProfileKey({seed='local',captainId=null,realmId=null,testId=null}={}) {
  return JSON.stringify(testId!==null?['test',String(testId)]:captainId?['captain',String(realmId||''),String(captainId)]:['solo',String(seed)]);
}

function emptyState(profileId,scope) {
  return {version:GUIDANCE_VERSION,profileId,scope,counts:{},controls:{keyboard:{},touch:{}},flows:{lastAction:null,lastUses:{}},recent:[]};
}
function restoredState(raw,profileId,scope) {
  const state=emptyState(profileId,scope);
  if(!raw||raw.version!==GUIDANCE_VERSION||raw.profileId!==profileId||raw.scope!==scope)return state;
  for(const action of GUIDANCE_ACTIONS){
    if(count(raw.counts?.[action]))state.counts[action]=count(raw.counts[action]);
    for(const input of ['keyboard','touch'])if(CONTROL_ACTIONS.has(action)&&count(raw.controls?.[input]?.[action]))state.controls[input][action]=count(raw.controls[input][action]);
    const use=raw.flows?.lastUses?.[action];
    if(INTERACTIONS.has(action)&&typeof use?.target==='string')state.flows.lastUses[action]={target:text(use.target),needsExit:!!use.needsExit};
  }
  state.flows.lastAction=ACTIONS.has(raw.flows?.lastAction)?raw.flows.lastAction:null;
  state.recent=Array.isArray(raw.recent)?[...new Set(raw.recent.filter(id=>typeof id==='string'&&id.length<=400))].slice(-96):[];
  return state;
}

function targetKey(action,ctx) {
  if(action==='dock')return text(ctx.docking?.id||ctx.nearby?.id||ctx.docking?.name||ctx.nearby?.name);
  if(['board-friend','crew-permission'].includes(action))return text(ctx.shared?.id||ctx.nearby?.id||ctx.shared?.name);
  if(['return-airlock','take-helm'].includes(action))return text(ctx.boarding?.id||ctx.vesselId||ctx.locationId);
  if(action==='mine')return text(ctx.mining?.id||ctx.nearby?.id);
  return text(ctx.nearby?.id||ctx.job?.id||ctx.locationId);
}
function episodeKey(ctx) {
  return JSON.stringify([ctx.mode,device(ctx.device),ctx.systemId,ctx.locationId,ctx.vesselId,ctx.boarding?.id,ctx.boarding?.phase,
    ctx.nearby?.id,ctx.nearby?.type,ctx.nearby?.completed||ctx.nearby?.done,ctx.intent,ctx.docking?.inRange,
    ctx.docking?.id,ctx.job?.id,ctx.job?.ready,ctx.shared?.id,ctx.shared?.canBoard,
    ctx.boarding?.atAirlock,ctx.boarding?.atHelm,ctx.boarding?.canReturn,ctx.boarding?.canTakeHelm,
    ctx.helm?.available,ctx.combat?.active,ctx.combat?.blocked,ctx.combat?.targetVisible]);
}
function descriptor(action,title,body,short,kind,{id=action,flow=null,...extra}={}) {
  return {id,title,body,short,successAction:action,controlTarget:GUIDANCE_CONTROL_TARGETS[kind]||kind,flow:flow||Object.keys(FLOW_ACTIONS).find(key=>FLOW_ACTIONS[key].includes(action))||'flight',...extra};
}

export class GuidanceController {
  constructor({profileId='local',state=null,mode:guidance='simple',testMode=false,force=false}={}) {
    this.profileId=String(profileId);this.testMode=!!testMode;this.scope=this.testMode?'test':'voyage';
    this.mode=mode(guidance);this.force=!!force&&this.testMode;
    this.state=restoredState(state,this.profileId,this.scope);this.revision=0;
    this._context=null;this._prompt=null;this._lastPrompt=null;this._lastPromptEpisode=null;this._episode=null;this._dismissed=new Set();this._help=false;this._helpEpisode=null;this._repeatAction=null;
    this._syncFlows();
  }
  get prompt(){return this._prompt?copy(this._prompt):null;}
  count(action,context=this._context||{}) {
    return CONTROL_ACTIONS.has(action)?count(this.state.controls[device(context.device)]?.[action]):count(this.state.counts[action]);
  }
  _effectiveMode(ctx=this._context||{}) {return this.force?'simple':mode(ctx.guidance??this.mode);}
  setMode(value) {
    const next=mode(value);if(next!==this.mode){this.mode=next;this._help=false;this._repeatAction=null;this._prompt=null;this._dismissed.clear();}
    return this._context?this.update({...this._context,guidance:next}):null;
  }
  _validScope(value) {
    return value?.profileId!==undefined&&String(value.profileId)!==this.profileId?false:
      value?.testMode!==undefined&&!!value.testMode!==this.testMode?false:true;
  }
  _syncFlows() {
    for(const [name,actions]of Object.entries(FLOW_ACTIONS)){
      const summary=input=>{
        const counts=actions.map(action=>this.count(action,{device:input})),round=Math.min(...counts),step=round>=2?actions.length:counts.findIndex(n=>n===round);
        return {round,step,complete:round>=2};
      };
      this.state.flows[name]={keyboard:summary('keyboard'),touch:summary('touch')};
    }
  }
  /** Only confirmed, local, distinct successful uses can advance the guide. */
  record(event,context=this._context||{}) {
    if(!event||event.local===false||event.success!==true&&event.ok!==true||!this._validScope(event)||!this._validScope(context))return false;
    const action=event.action||event.type;if(!ACTIONS.has(action))return false;
    const id=typeof event.id==='number'&&Number.isFinite(event.id)?String(event.id):text(event.id||event.useId);
    if(!id)return false;
    const input=device(event.device||context.device),dedupe=`${action}:${CONTROL_ACTIONS.has(action)?input:'shared'}:${id}`;
    if(this.state.recent.includes(dedupe)||this.count(action,{device:input})>=GUIDANCE_LIMIT)return false;
    this.state.counts[action]=count((this.state.counts[action]||0)+1);
    if(CONTROL_ACTIONS.has(action))this.state.controls[input][action]=count((this.state.controls[input][action]||0)+1);
    this.state.recent.push(dedupe);if(this.state.recent.length>96)this.state.recent.shift();
    this.state.flows.lastAction=action;
    if(INTERACTIONS.has(action))this.state.flows.lastUses[action]={target:targetKey(action,context),needsExit:true};
    this.revision++;this._syncFlows();this._help=false;this._repeatAction=null;
    if(this._prompt?.successAction===action){this._prompt=null;this._dismissed.clear();}
    return true;
  }
  dismiss(id=this._prompt?.id) {
    if(!id)return false;
    this._dismissed.add(id);this._lastPrompt=this._prompt||this._lastPrompt;this._prompt=null;this._help=false;this._repeatAction=null;return true;
  }
  requestHelp(context=this._context) {
    if(!context||!this._validScope(context)||this._effectiveMode(context)==='expert')return null;
    this._help=true;this._helpEpisode=episodeKey(context);this._repeatAction=null;this._dismissed.clear();return this.update(context);
  }
  repeat(context=this._context) {
    if(!context||!this._validScope(context)||this._effectiveMode(context)==='expert')return null;
    const episode=episodeKey(context);
    this._help=true;this._helpEpisode=episode;this._repeatAction=this._lastPromptEpisode===episode?(this._prompt||this._lastPrompt)?.successAction:null;
    this._dismissed.clear();return this.update(context);
  }
  resetProgress(flow='all') {
    const actions=flow==='all'?GUIDANCE_ACTIONS:FLOW_ACTIONS[flow];if(!actions)return false;
    for(const action of actions){delete this.state.counts[action];delete this.state.controls.keyboard[action];delete this.state.controls.touch[action];delete this.state.flows.lastUses[action];}
    this.state.recent=this.state.recent.filter(id=>!actions.some(action=>id.startsWith(action+':')));
    this.state.flows.lastAction=null;this.revision++;this._syncFlows();this._help=false;this._repeatAction=null;this._dismissed.clear();this._prompt=null;this._lastPrompt=null;this._lastPromptEpisode=null;return true;
  }
  exportState(){return copy(this.state);}
  _rearm(ctx) {
    for(const [action,last]of Object.entries(this.state.flows.lastUses)){
      if(!last.needsExit)continue;
      const key=targetKey(action,ctx),outOfRange=action==='dock'&&ctx.mode==='ship'&&ctx.docking?.inRange===false||action==='mine'&&ctx.mining?.inRange===false;
      // Being on foot immediately after docking is not a second arrival.
      if(action==='dock'&&ctx.mode==='person')continue;
      if(!key||key!==last.target||outOfRange){last.needsExit=false;this.revision++;}
    }
  }
  _eligible(action,ctx,forced=false) {
    if(forced)return true;
    if(this.count(action,ctx)>=GUIDANCE_LIMIT)return false;
    const last=this.state.flows.lastUses[action];return !(last?.needsExit&&last.target===targetKey(action,ctx));
  }
  _next(actions,ctx,forced=false) {
    const lowest=Math.min(...actions.map(action=>this.count(action,ctx)));
    if(lowest>=GUIDANCE_LIMIT)return forced?actions[0]:null;
    return actions.find(action=>this.count(action,ctx)===lowest);
  }
  update(context={}) {
    if(!this._validScope(context))return null;
    const ctx={...context,device:device(context.device)},nextEpisode=episodeKey(ctx);
    if(nextEpisode!==this._episode){
      this._dismissed.clear();
      if(this._helpEpisode!==nextEpisode){this._help=false;this._repeatAction=null;}
      this._episode=nextEpisode;
    }
    this._context=ctx;this._rearm(ctx);
    const selectedMode=this._effectiveMode(ctx);
    if(ctx.playing===false||ctx.blocked||ctx.paused||ctx.person?.down||ctx.person?.health!==undefined&&finite(ctx.person.health)<=0||selectedMode==='expert'||selectedMode==='moderate'&&!this._help){this._prompt=null;return null;}
    const candidate=this._choose(ctx,this._help,this._repeatAction);
    if(!candidate||this._dismissed.has(candidate.id)){this._prompt=null;return null;}
    const completed=this.count(candidate.successAction,ctx),requested=this._help;
    const prompt={...candidate,compactBody:candidate.short,body:selectedMode==='moderate'?candidate.short:candidate.body,attempt:Math.min(GUIDANCE_LIMIT,completed+1),completed,limit:GUIDANCE_LIMIT,
      repeated:completed>0,requested,action:{type:'highlight',target:candidate.controlTarget},profileId:this.profileId,scope:this.scope};
    delete prompt.short;this._prompt=prompt;this._lastPrompt=prompt;this._lastPromptEpisode=nextEpisode;return copy(prompt);
  }
  _choose(ctx,forced,preferred=null) {
    const touch=ctx.device==='touch',near=ctx.nearby||{},name=text(near.name),intent=ctx.intent;
    if(ctx.mode==='person'){
      // The first lesson on a new input layout is locomotion, before consoles
      // and conversation prompts can take over the arrival screen.
      if(!this.count('person-move',ctx))return this._walk(ctx);
      if(ctx.combat?.active||ctx.boarding?.phase==='active'){
        if(intent==='return'&&ctx.boarding?.kind==='assault'&&ctx.boarding.canReturn!==false)return this._return(ctx,forced);
        return this._combat(ctx,forced,preferred);
      }
      if(ctx.boarding?.kind==='assault'&&ctx.boarding.phase==='won'){
        if((intent==='helm'||ctx.boarding.atHelm)&&ctx.boarding.canTakeHelm!==false)return this._helm(ctx,forced);
        if(ctx.boarding.canReturn!==false&&this._eligible('return-airlock',ctx,forced))return this._return(ctx,forced);
        if(ctx.boarding.canTakeHelm!==false)return this._helm(ctx,forced);
      }
      const job=ctx.job||{};
      if(job.ready&&this._eligible('job-turn-in',ctx,forced)){
        const at=job.nearBoard||near.type==='jobboard',inMenu=ctx.menu==='jobs'||ctx.dialogKind==='jobs';
        return descriptor('job-turn-in',inMenu?'Collect your payment':at?'Open the contract exchange':'Return to the contract exchange',
          inMenu?'Choose Turn in on the completed contract. Payment is awarded when the exchange confirms it.':at?`${useInstruction(ctx)} to open the exchange. Your completed contract is ready to turn in.`:'Walk back to the contract exchange marked in this place. The job pays when you turn it in there.',
          inMenu?'Turn in the completed contract.':at?`${control(ctx,'use')} · Open the exchange to turn in your work.`:'Return to the contract exchange for payment.',at?'use':'move',{id:inMenu?'job-turn-in:confirm':at?'job-turn-in:use':'job-turn-in:approach'});
      }
      if((near.type==='work'||job.nearWork)&&!near.completed&&!near.done&&!job.workCompleted&&this._eligible('work',ctx,forced))return descriptor('work','Work this relay',
        ['work','repair'].includes(ctx.menu)||['work','repair'].includes(ctx.dialogKind)?'Rotate each conductor to match its reference arrow, then choose Reconnect relay. A successful calibration advances your work.':`${useInstruction(ctx)} at ${name||'this workstation'} to open its task. The task counts when you finish it successfully.`,
        ['work','repair'].includes(ctx.menu)||['work','repair'].includes(ctx.dialogKind)?'Match all reference arrows, then Reconnect relay.':`${control(ctx,'use')} · Open this unfinished relay.`,'use');
      if((near.type==='jobboard'||job.nearBoard)&&!job.accepted&&!job.ready&&this._eligible('job-accept',ctx,forced))return descriptor('job-accept','Choose a local job',
        ctx.menu==='jobs'||ctx.dialogKind==='jobs'?'Choose a local contract and select Accept. Its objective will show what to do next.':`${useInstruction(ctx)} to open the contract exchange and see the work available here.`,
        ctx.menu==='jobs'||ctx.dialogKind==='jobs'?'Accept a local contract.':`${control(ctx,'use')} · Open the contract exchange.`,'use');
      if((ctx.helm?.available||near.data?.stationRole==='helm'||near.stationRole==='helm')&&(ctx.helm?.quick||ctx.helm?.near||near.data?.stationRole==='helm'||near.stationRole==='helm'||intent==='helm'))return this._helm(ctx,forced);
      if(['npc','crew','mechanic','medic','merchant'].includes(near.type)&&this._eligible('person-use',ctx,forced))return descriptor('person-use',`Talk to ${name||'this person'}`,
        `${useInstruction(ctx,'TALK')} while standing close to ${name||'them'}. Choose a reply in the conversation.`,`${touch?text(near.controlLabel,'TALK'):control(ctx,'use')} · Talk to ${name||'this person'}.`,'use');
      if(['siteEntrance','siteExit','siteRecord','siteCache','siteChoice'].includes(near.type)&&this._eligible('person-use',ctx,forced))return descriptor('person-use',text(near.controlLabel,'Explore this place'),
        `${useInstruction(ctx,'USE',near.controlLabel)} while close to ${name||'this place'}. Entrances lead inside; records, supplies, and equipment have their own actions.`,`${touch?text(near.controlLabel,'USE'):control(ctx,'use')} · Use this place while standing close.`,'use');
      if(job.accepted&&!job.ready&&(!job.type||job.type==='work')&&(this._eligible('work',ctx,forced)||(near.completed||near.done)&&this.count('work',ctx)<GUIDANCE_LIMIT))return descriptor('work','Find an unfinished workstation',
        'Walk to a workstation marked for your active job. Use it to begin the task; finished relays do not need repeating.','Walk to an unfinished workstation for this job.','move',{id:'work:approach'});
      return this._eligible('person-move',ctx,forced)?this._walk(ctx):null;
    }
    if(ctx.mode!=='ship')return null;
    // Docking can interrupt advanced flight drills, but the first departure
    // still explains thrust and turning before introducing another interaction.
    if(!this.count('flight-thrust',ctx))return this._flight('flight-thrust',ctx);
    if(!this.count('flight-turn',ctx))return this._flight('flight-turn',ctx);
    if((near.type==='board'||intent==='boarding'&&near.id&&(near.canBoard===true||near.disabled===true))&&near.canBoard!==false&&near.disabled!==false&&near.hostile!==false&&this._eligible('board-enemy',ctx,forced))return descriptor('board-enemy',near.inRange===false?'Close to the disabled vessel':'Board the disabled vessel',
      near.inRange===false?'Fly closer to the disabled contact until Board is offered. Its crew deck belongs to that physical hull.':`${touch?'Tap BOARD':'Press E'} to review the target and cross its tether. Your ship stays outside; your sidearm is included.`,
      near.inRange===false?'Approach until Board is available.':`${touch?'BOARD':'E'} · Cross to this disabled vessel.` ,near.inRange===false?'flight':'use',{id:near.inRange===false?'board-enemy:approach':'board-enemy'});
    const shared=ctx.shared;
    if(shared&&(intent==='crew'||near.type==='shared-ship'||shared.permissionNeeded)){
      if(shared.permissionNeeded&&!shared.canBoard&&this._eligible('crew-permission',ctx,forced))return descriptor('crew-permission',shared.canManageCrew?'Choose crew access':'Crew access is required',
        shared.canManageCrew?`Open ${touch?'Menu → Crew':'CREW'}, choose the captain you want aboard, and review their access before granting it.`:`Ask ${text(shared.ownerName,'the captain')} for permission to board ${text(shared.name,'that ship')}. ${touch?'Menu → Crew':'CREW'} shows the current access; boarding becomes available after approval.`,
        shared.canManageCrew?`${touch?'Menu → Crew':'CREW'} · Review access for the intended captain.`:'Ask the owner for boarding permission.','crew');
      if(shared.canBoard===true&&this._eligible('board-friend',ctx,forced))return descriptor('board-friend',shared.inRange===false?'Meet your crew’s ship':'Board with permission',
        shared.inRange===false?`Approach ${text(shared.name,'the permitted ship')} slowly, or meet it at the same port.`:`${touch?'Tap the ship contact':'Press E at the ship contact'} and choose Board with permission. Your own hull remains behind.`,
        shared.inRange===false?'Approach the permitted ship at low speed.':'Open this contact and choose Board with permission.',shared.inRange===false?'flight':'use',{id:shared.inRange===false?'board-friend:approach':'board-friend'});
    }
    if((ctx.docking&&(ctx.docking.inRange||intent==='dock')||near.type==='dock')&&this._eligible('dock',ctx,forced))return this._dock(ctx);
    if((ctx.ship?.threat||intent==='combat'||near.hostile===true&&near.disabled!==true)&&this._eligible('ship-fire',ctx,forced))return this._flight('ship-fire',ctx);
    if(near.type==='salvage'&&this._eligible('salvage',ctx,forced))return descriptor('salvage','Collect the loose salvage',
      `${touch?'Tap COLLECT':'Press E'} near the salvage, or fly close enough to draw it into your hold. The pickup confirms what you recovered.`,`${touch?'COLLECT':'E'} · Recover this salvage.`,'use');
    if(ctx.mining&&(intent==='mining'||ctx.mining.inRange)&&!ctx.mining.holdFull&&this._eligible('mine',ctx,forced))return descriptor('mine',ctx.mining.inRange?'Hold the mining beam':'Approach an asteroid',
      ctx.mining.inRange?`${touch?'Hold MINE':'Hold R'} near the asteroid until it breaks. The ore pickup confirms extraction; releasing early leaves the rock partly mined.`:'Fly close to a visible asteroid. The mining beam needs a nearby rock and room in your hold.',
      ctx.mining.inRange?`${control(ctx,'mine')} · Hold until the rock yields ore.`:'Approach a visible asteroid with room in the hold.',ctx.mining.inRange?'mine':'flight',{id:ctx.mining.inRange?'mine':'mine:approach'});
    const next=forced&&FLOW_ACTIONS.flight.includes(preferred)?preferred:this._next(FLOW_ACTIONS.flight,ctx,forced);if(!next)return null;
    if(next==='flight-brake'&&finite(ctx.ship?.speed)<=6)return descriptor('flight-brake','Build a little speed',
      `${touch?`Push ${control(ctx,'thrust')}`:'Hold W briefly'} to begin moving. Then you can feel the brake slow your ship.`,`${control(ctx,'thrust')} · Start moving before practising the brake.`,'flight',{id:'flight-brake:prepare'});
    return this._flight(next,ctx);
  }
  _walk(ctx) {return descriptor('person-move','Walk on foot',
    ctx.device==='touch'?`Push ${control(ctx,'walk')} toward an open passage. You move the person now; walk close to people or consoles to use them.`:'Use WASD to walk into an open passage. You move the person now; approach people or consoles before pressing E.',
    `${control(ctx,'walk')} · Walk into an open passage.`,'move');}
  _flight(action,ctx) {
    const touch=ctx.device==='touch',heavy=ctx.ship?.heavy?' This larger hull takes longer to respond.':'';
    const prompts={
      'flight-thrust':['Start your ship moving',touch?`Push ${control(ctx,'thrust')} toward where you want to fly. The ship turns toward it and builds thrust; it keeps drifting after release.`:'Hold W to add forward thrust. Your ship carries momentum when you release it.',touch?`Push the ${ctx.leftHanded?'right':'left'} stick to fly.`:`${control(ctx,'thrust')} · Add thrust.`,'flight'],
      'flight-turn':['Turn the ship’s nose',touch?`Move ${control(ctx,'turn')} toward the direction you want the nose to face. Give the turn time to develop.${heavy}`:`Hold ← or → to rotate. The nose turns gradually and keeps a little angular momentum after release.${heavy}`,touch?`Point the ${ctx.leftHanded?'right':'left'} stick to turn the nose.`:`${control(ctx,'turn')} · Turn gradually.`,'flight'],
      'flight-strafe':['Slide beside your heading',touch?`Move ${control(ctx,'strafe')} left or right to slide sideways relative to the nose. The flight stick still controls your heading.`:'Hold A or D to strafe sideways relative to the ship’s nose. The arrow keys still control heading.',touch?`Slide the ${ctx.leftHanded?'left':'right'} stick sideways.`:`${control(ctx,'strafe')} · Slide sideways.`,'strafe'],
      'flight-brake':['Bring your speed down',touch?`Hold BRAKE and watch your speed fall.${heavy}`:`Hold S or X and watch your speed fall.${heavy}`,`${control(ctx,'brake')} · Slow the ship.`,'brake'],
      'ship-fire':['Fire a ship pulse',touch?'Point the ship’s nose at the hostile, then press FIRE. A flash and pulse confirm the shot.':'Point the ship’s nose at the hostile, then press Space. A flash and pulse confirm the shot.',`${control(ctx,'fire')} · Fire toward the hostile.`,'fire']
    },p=prompts[action];return p?descriptor(action,...p):null;
  }
  _dock(ctx) {
    const d=ctx.docking||{},near=ctx.nearby||{},name=text(d.name||near.name,'the port'),touch=ctx.device==='touch',inRange=d.inRange??near.inRange??near.type==='dock',speed=finite(d.speed,finite(ctx.ship?.speed)),label=text(d.controlLabel||near.controlLabel,'DOCK'),landing=/^land$/i.test(label);
    if(!inRange)return descriptor('dock',`Approach ${name}`,touch?`Push ${control(ctx,'thrust')} toward ${name}. Close the distance until the ${label} option appears.`:`Turn toward ${name} with ← / →, then use W to approach until ${label} appears.`,
      `Approach ${name} until ${label} is available.`,'flight',{id:'dock:approach'});
    if(speed>finite(d.safeSpeed,35))return descriptor('dock','Slow beside the port',`${touch?'Hold BRAKE':'Hold S or X'} until your speed drops. You are close enough to ${name}; leave space for your inertia.`,`${control(ctx,'brake')} · Slow before docking.`,'brake',{id:'dock:slow'});
    return descriptor('dock',`${landing?'Land on':'Dock at'} ${name}`,`${useInstruction(ctx,'DOCK',label)} to ${landing?'land':'dock'}. You will leave ship mode and walk ${landing?'on':'inside'} ${name}.`,`${touch?label:control(ctx,'dock')} · ${landing?'Land':'Dock'} and enter person mode.`,'use');
  }
  _combat(ctx,forced,preferred=null) {
    const next=forced&&FLOW_ACTIONS.combat.includes(preferred)?preferred:this._next(FLOW_ACTIONS.combat,ctx,forced);if(!next)return null;
    const touch=ctx.device==='touch',c=ctx.combat||{};
    if(c.blocked||c.targetVisible===false)return descriptor(next,c.blocked?'Find a clear shot':'Move toward a visible hostile',
      c.blocked?`Move around the wall until you have a clear line to a hostile. Your pulses stop at walls.`:'Walk into a position where a hostile can be seen. Your sight marks an enemy within sidearm range.',
      c.blocked?'Move around the wall for a clear shot.':'Move into sight of a hostile.','move',{id:'combat:clear-shot',flow:'combat'});
    if(next==='person-aim')return descriptor(next,'Your sidearm is equipped',
      touch?`Move ${control(ctx,'aim')} toward a hostile. Your standard Pulse sidearm is ready; pushing that stick also fires.`:'Move the mouse over a hostile or hold an arrow key to aim. Your standard Pulse sidearm is ready; WASD still walks.',
      `${control(ctx,'aim')} · Aim your equipped sidearm.`,'aim');
    if(next==='person-fire')return descriptor(next,'Fire your sidearm',
      touch?'Press FIRE when the weapon panel says READY. Without manual aim, it shoots toward the marked aim-assist target.':'Press Space or left-click when the weapon panel says READY. Without manual aim, the bracket marks the assisted target.',
      `${control(ctx,'fire')} · Fire when READY.`,'fire');
    return descriptor(next,'Confirm a hit',
      'Fire at the marked hostile. A damage number confirms a hit; a DOWN label names who landed the final shot. A pulse into empty space can miss.',
      'Fire at the marked hostile; look for the damage number.','fire');
  }
  _return(ctx,forced) {
    if(!this._eligible('return-airlock',ctx,forced)||ctx.boarding?.canReturn===false)return null;
    const at=ctx.boarding?.atAirlock;
    return descriptor('return-airlock',at?'Cross back to your ship':'Find the entry airlock',
      at?`${useInstruction(ctx,'AIRLOCK')} at the entry airlock to return across the tether. Your original hull must be intact and close enough.`:'Walk to the entry airlock where you arrived. Both ships remain outside, and this airlock returns to your original vessel.',
      at?`${ctx.device==='touch'?text(ctx.nearby?.controlLabel,'AIRLOCK'):control(ctx,'use')} · Return across the tether.`:'Walk back to the entry airlock.',at?'use':'move',{id:at?'return-airlock':'return-airlock:approach'});
  }
  _helm(ctx,forced) {
    if(!this._eligible('take-helm',ctx,forced)||ctx.boarding?.phase==='active'||ctx.boarding?.canTakeHelm===false||ctx.helm?.available===false)return null;
    if(ctx.helm?.quick){const label=text(ctx.helm.label,'Take helm');return descriptor('take-helm','Return to ship view',
      `${ctx.device==='touch'?'Tap':'Click'} ${label} at the top of the screen. You will pilot this same ship with its current motion, crew, and damage.`,
      `${ctx.device==='touch'?'Tap':'Click'} ${label} at the top to fly this ship.`,'perspective',{id:'take-helm'});}
    const at=ctx.boarding?.atHelm||ctx.helm?.near||ctx.nearby?.stationRole==='helm'||ctx.nearby?.data?.stationRole==='helm';
    return descriptor('take-helm',at?'Take this ship’s helm':'Walk to the bridge',
      at?`${useInstruction(ctx,'USE HELM')} at the helm and choose Take the helm. You will pilot this physical hull with its existing damage.`:'Walk to the bridge helm. A secured deck gives you a place to take command of this hull.',
      at?`${ctx.device==='touch'?text(ctx.nearby?.controlLabel,'USE HELM'):control(ctx,'use')} · Open the helm and take command.`:'Walk to the bridge helm.',at?'use':'move',{id:at?'take-helm':'take-helm:approach'});
  }
}

export default GuidanceController;
