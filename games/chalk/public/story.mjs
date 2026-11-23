// Fictional, compressed decisions within a historically grounded setting.
// This module holds no moral score: costs are supplies, time, routes and people.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const count=(value,max)=>clamp(Number.isFinite(value)?Math.floor(value):0,0,max);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const standing=a=>a?.alive&&!a.downed;
const chapterNames=['A short operation','The mission has changed','Room in the vehicles','The road on foot'];
const briefings=[
  ['Ground transport is assigned for the withdrawal. Form the cordon while the collection point is prepared.','The collection point is taking longer than expected. Reports of blocked streets are revising the pickup plan.','A helicopter is down. Orders are changing; first get this chalk to the assigned vehicles.'],
  ['A helicopter is down. Reach the reported crash location; the crew’s condition is not yet confirmed.','The crew cannot move without treatment. The pickup route is still being checked.','One crew member is ready. Keep the other covered while treatment continues.','The collection point has answered. Escort the crew there; a route report is not a guarantee of a clear street.'],
  ['A relief column is approaching. Reports mention Malaysian carriers and Pakistani armor with U.S. troops; the route is still being checked.','The column has met obstructions. Clear the route and stay close; casualty capacity is limited.','Casualty loading is underway. Keep everyone inside the perimeter until the vehicles are ready.'],
  ['The transports are full. Your chalk is among those withdrawing on foot; keep to the current rally instructions.','Route reports disagree at the next junction. Choose an approach while keeping the chalk together.','Regroup before the final approach. The aid station has acknowledged the column, but the intervening streets are not secured.','The aid station is in reach. Account for the surviving chalk before entering.'],
];

/** Only these finite, visible consequences can cross into the next chapter. */
export function normalizeCampaignCarry(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||!Number.isInteger(raw.fromMission)||raw.fromMission<0||raw.fromMission>3)return null;
  return {version:1,fromMission:raw.fromMission,medicalDebt:count(raw.medicalDebt,3),smokeDebt:count(raw.smokeDebt,3),fatigue:count(raw.fatigue,3),civilianHarm:count(raw.civilianHarm,8),aided:count(raw.aided,4)};
}
function log(s,hooks,text,kind='update',speaker='RADIO'){
  const entry={id:`story-${s.missionIndex}-${s.story.nextLogId++}`,time:s.time,speaker,text,kind};
  s.story.log.push(entry);if(s.story.log.length>24)s.story.log.shift();
  hooks.radio(s,speaker,text);return entry;
}
function summary(s,text){if(!s.story.summary.includes(text))s.story.summary.push(text);}
function reduceSupply(s,key,amount,preferredRole){
  const actors=[...s.squad].sort((a,b)=>(b.role===preferredRole)-(a.role===preferredRole));
  for(const actor of actors){const used=Math.min(actor[key]||0,amount);actor[key]-=used;amount-=used;if(!amount)break;}
}
export function initializeStory(s,campaign,hooks){
  const carry=normalizeCampaignCarry(campaign);
  // A carry is tied to the next chronological chapter. Selecting a different
  // mission deliberately starts a fresh operation rather than applying old debt.
  s.campaign=carry&&carry.fromMission===s.missionIndex-1?carry:null;
  s.story={chapter:chapterNames[s.missionIndex],briefing:briefings[s.missionIndex][0],activeDecision:null,opportunities:[],log:[],summary:[],
    consequences:{medicalSpent:0,smokeSpent:0,fatigueAdded:0,assisted:0,additionalLoaded:0,loadingSeconds:0,holdSeconds:0,localCallsQuiet:!!s.campaign?.civilianHarm},
    resolved:{},nextLogId:1,observedStage:0,finalized:false};
  if(s.campaign){
    const c=s.campaign;
    reduceSupply(s,'medkits',c.medicalDebt,'medic');reduceSupply(s,'smokes',c.smokeDebt,'leader');
    if(c.fatigue)for(const stage of s.stages)if(stage.kind==='rally')stage.duration+=2*c.fatigue;
    const changes=[];
    if(c.medicalDebt)changes.push(`${c.medicalDebt} fewer medical ${c.medicalDebt===1?'supply':'supplies'}`);
    if(c.smokeDebt)changes.push(`${c.smokeDebt} fewer smoke ${c.smokeDebt===1?'round':'rounds'}`);
    if(c.fatigue)changes.push(`regrouping takes ${2*c.fatigue} extra seconds`);
    if(c.civilianHarm)changes.push('nearby residents call out only at close range after earlier civilian harm');
    log(s,hooks,changes.length?`Continuing the operation: ${changes.join('; ')}.`:'Continuing the operation with the previous chapter accounted for.','carry');
    if(changes.length)summary(s,`From the previous chapter: ${changes.join('; ')}.`);
  }
  const points=[{x:680,y:1515,closeStage:2},{x:1160,y:1155,closeStage:3},{x:680,y:1385,closeStage:2},{x:1160,y:1115,closeStage:3}];
  const position=points[s.missionIndex],resident=s.civilians.at(-1);
  if(resident){
    const point=hooks.nearbyFree(s,position.x,position.y),id=`resident-${s.missionIndex}`;
    Object.assign(resident,point,{name:'Injured resident',hp:26,needsAid:true,storyOpportunityId:id,path:[],pathTimer:0,
      shelter:hooks.nearbyFree(s,point.x+42,point.y-82)});
    s.story.opportunities.push({id,actorId:resident.id,title:'Injured resident',detail:'Give first aid and help them reach cover. Uses one medical supply and takes six seconds; no route information is promised.',
      x:point.x,y:point.y,radius:64,progress:0,status:'available',revealed:false,closeStage:position.closeStage});
  }
  if(s.missionIndex===2)for(const [i,resident] of s.civilians.slice(6,8).entries()){
    const point={x:2120+i*34,y:630};
    Object.assign(resident,point,{name:'Waiting casualty',transportWaiting:true,needsAid:true,hp:26,path:[],shelter:{...point}});
  }
}
function decisionFor(s){
  if(s.missionIndex===0)return {id:'cordon-pickup',title:'The pickup is being revised',
    detail:'Ground transport has a plan, but one reported approach is blocked. The vehicles can reposition while you hold. Neither route is confirmed clear.',
    options:[{id:'original',label:'Keep the original pickup',detail:'No extra hold. Withdraw farther to the original street; continuing the operation adds one fatigue step (+2 seconds at each later regroup).'},
      {id:'reposition',label:'Bring the pickup closer',detail:'Hold the collection point 8 seconds longer while trucks reposition. The pickup moves one street closer, shortening your withdrawal.'}],
    defaultOption:'original',window:24};
  if(s.missionIndex===1)return {id:'crash-smoke',title:'Smoke at the wreck',
    detail:'Treatment needs cover. A smoke screen will hide movement around the wreck for a short time, including your own view of the street.',
    options:[{id:'reserve',label:'Keep smoke for withdrawal',detail:'Continue treatment without an extra screen. Preserve the remaining smoke for moving the crew.'},
      {id:'screen',label:'Screen the crew now',detail:'Use 1 squad smoke round for a 20-second screen at the wreck. Continued chapters start with 1 fewer smoke round.'}],
    defaultOption:'reserve',window:24};
  if(s.missionIndex===2)return {id:'relief-capacity',title:'Room in the vehicles',
    detail:'The collection point requests space for two more wounded residents. The aid team remains there if you cannot take them; its next transport is uncertain.',
    options:[{id:'manifest',label:'Keep the assigned load',detail:'Keep the current loading schedule. The two residents stay with the aid team, awaiting another transport.'},
      {id:'extra',label:'Make room for the two',detail:'Add 12 seconds of exposed loading and one fatigue step (+2 seconds per later regroup). If they survive, the two residents leave in this convoy.'}],
    defaultOption:'manifest',window:30};
  return {id:'dawn-approach',title:'Choose the next approach',
    detail:'The direct market junction has more turns and nearby cover. The eastern avenue is a longer, open approach. Radio reports cannot say which is clear now.',
    options:[{id:'market',label:'Use the market junction',detail:'Keep the next rally at the market junction. Shorter streets and more corners; you still have to check each approach.',point:{x:1640,y:580}},
      {id:'east',label:'Take the eastern avenue',detail:'Move the next rally to the eastern avenue. A longer open leg, followed by a direct road toward the aid station.',point:{x:2120,y:960}}],
    defaultOption:'market',window:32};
}
function shouldOpen(s){
  if(s.missionIndex===0)return s.time>=8||s.stageIndex>=1;
  if(s.missionIndex===1)return s.stageIndex>=1||s.time>=5&&s.squad.some(a=>standing(a)&&distance(a,{x:1160,y:960})<250);
  return s.stageIndex>=1;
}
function decisionExpiredByStage(s){return s.stageIndex>[1,2,2,1][s.missionIndex];}
function smokeCarrier(s){return s.squad.find(a=>standing(a)&&a.smokes>0&&distance(a,{x:1160,y:960})<340);}
function updateAvailability(s){
  const decision=s.story.activeDecision;if(decision?.id!=='crash-smoke')return;
  const option=decision.options.find(o=>o.id==='screen');option.available=!!smokeCarrier(s);
  option.disabledReason=option.available?'':'A standing squad member with smoke must be near the wreck.';
}
function resolve(s,optionId,actor,hooks,reason='order'){
  const decision=s.story.activeDecision,option=decision?.options.find(o=>o.id===optionId);
  if(!decision||!option||option.available===false)return false;
  const consequences=s.story.consequences;
  let report='';
  if(decision.id==='cordon-pickup'){
    if(optionId==='reposition'){
      s.stages[1].duration+=8;consequences.holdSeconds+=8;
      Object.assign(s.stages[2],{x:1640,y:960,title:'Reach the revised pickup',description:'The trucks have repositioned to the closer street. Bring every surviving squad member.'});
      for(const [i,vehicle] of s.vehicles.entries())if(vehicle.kind==='truck'){vehicle.x=1610+i*105;vehicle.y=960;}
      report='Trucks are repositioning to the closer street. We hold eight seconds longer; that approach is still unconfirmed.';
      summary(s,'Pickup moved one street closer; the collection-point hold increased by 8 seconds.');
    }else{
      consequences.fatigueAdded++;report='Keep the original pickup. We have farther to move when the hold ends; keep the chalk together.';
      summary(s,'Kept the original pickup and its longer withdrawal; continuing adds 1 fatigue step.');
    }
  }else if(decision.id==='crash-smoke'){
    if(optionId==='screen'){
      const carrier=smokeCarrier(s);if(!carrier)return false;carrier.smokes--;consequences.smokeSpent++;
      const point={x:1160,y:980};s.smokes.push({...point,radius:145,ttl:20});hooks.soundEvent(s,'smoke',carrier,point);
      report='Smoke on the wreck. Treatment continues; remember we have one less round for the withdrawal.';
      summary(s,'Used 1 smoke round for 20 seconds of cover at the wreck; 1 fewer smoke round carries forward.');
    }else{report='Keep that smoke for the withdrawal. Cover the medic from here.';summary(s,'Reserved smoke for the withdrawal; crew treatment continued without the extra screen.');}
  }else if(decision.id==='relief-capacity'){
    if(optionId==='extra'){
      s.stages[2].duration+=12;consequences.loadingSeconds+=12;consequences.fatigueAdded++;
      // Existing residents become collection-point casualties; no extra enemy
      // spawns, magic intelligence or escort dependency is introduced as a reward.
      for(const resident of s.civilians)if(resident.transportWaiting&&resident.alive)resident.transportCandidate=true;
      report='Make room for the two residents. Loading needs twelve more seconds. The aid team will bring them to the vehicles.';
      summary(s,'Accepted two additional wounded residents; loading increased by 12 seconds and continuing adds 1 fatigue step.');
    }else{report='Keep the assigned load. Tell the aid team we cannot confirm the next vehicle for their two residents.';summary(s,'Kept the assigned load. Two residents remained with the aid team; their later transport is unconfirmed.');}
  }else if(optionId==='east'){
    Object.assign(s.stages[2],{x:2120,y:960,title:'Regroup on the eastern avenue',description:'Account for the chalk before the open northbound approach.'});
    report='Use the eastern avenue. Longer in the open; regroup before turning toward the aid station.';
    summary(s,'Used the eastern avenue: a longer open leg and a different final rally point.');
  }else{report='Keep to the market junction. Check the corners; the report is not a promise of a clear route.';summary(s,'Kept the market route and its covered corners; the next rally remained at the original junction.');}
  s.story.resolved[decision.id]={optionId,actorId:actor?.id??null,time:s.time,reason};
  s.story.activeDecision=null;
  log(s,hooks,`${reason==='default'?'No new order; following the standing plan. ':reason==='recommendation'?'Agreed with the recommendation. ':''}${report}`,'decision',actor?.name?.toUpperCase()||'HALE');
  return true;
}
export function chooseOption(s,decisionId,optionId,actorId,hooks){
  if(s.status!=='playing'||typeof decisionId!=='string'||typeof optionId!=='string')return false;
  const decision=s.story?.activeDecision,actor=s.squad.find(a=>a.id===actorId);
  if(!decision||decision.id!==decisionId||s.time>=decision.deadline||decisionExpiredByStage(s)||!standing(actor)||!hooks.controlled(s,actor))return false;
  updateAvailability(s);
  const option=decision.options.find(o=>o.id===optionId);if(!option||option.available===false)return false;
  const leader=hooks.currentLeader(s);
  if(leader?.id===actor.id)return resolve(s,optionId,actor,hooks);
  if(decision.recommendation?.actorId===actor.id&&decision.recommendation.optionId===optionId)return true;
  decision.recommendation={actorId:actor.id,optionId,time:s.time,speaker:actor.name};
  log(s,hooks,`Recommend: ${option.label.toLowerCase()}.`,'recommendation',actor.name.toUpperCase());
  if(standing(leader)&&!hooks.controlled(s,leader))return resolve(s,optionId,leader,hooks,'recommendation');
  return true;
}
function aidOpportunity(s,actor,hooks){
  if(s.status!=='playing'||!standing(actor)||!hooks.controlled(s,actor))return null;
  return s.story?.opportunities.find(op=>op.status==='available'&&distance(actor,op)<op.radius&&hooks.hasLineOfSight(s,actor,op)&&standing(s.civilians.find(c=>c.id===op.actorId)))||null;
}
export function storyInteraction(s,actorId,hooks){
  const actor=s.squad.find(a=>a.id===actorId),op=aidOpportunity(s,actor,hooks);
  if(!op||actor.medkits<=0)return null;
  return {id:op.id,label:'Aid resident',detail:`Hold to use 1 medical supply · ${actor.role==='medic'?'4.5':'6'} seconds`,progress:op.progress,x:op.x,y:op.y,radius:op.radius,available:true};
}
function updateOpportunities(s,inputs,dt,hooks){
  for(const op of s.story.opportunities){
    if(op.status!=='available')continue;
    const resident=s.civilians.find(c=>c.id===op.actorId);if(!resident)continue;
    if(!resident.alive){op.status='lost';if(op.revealed)summary(s,'The injured resident died before reaching cover.');continue;}
    if(s.stageIndex>=op.closeStage){
      op.status='passed';resident.needsAid=false;
      if(op.revealed){summary(s,'Passed the injured resident without completing aid; their later condition is unconfirmed.');log(s,hooks,'We have moved beyond the resident’s position. Their later condition is not confirmed.','consequence');}
      continue;
    }
    if(!op.revealed&&s.squad.some(a=>standing(a)&&distance(a,op)<(s.story.consequences.localCallsQuiet?145:310)&&hooks.combatLOS(s,a,op))){
      op.revealed=true;log(s,hooks,'Injured resident near our route. First aid needs one medical supply and a few seconds here.','opportunity','AMES');
    }
    const helper=s.squad.find(a=>a.medkits>0&&aidOpportunity(s,a,hooks)?.id===op.id&&hooks.inputFor(s,a,inputs).interact&&
      ![...s.squad,...s.survivors.filter(c=>c.stabilized)].some(c=>c.alive&&c.downed&&distance(a,c)<70&&hooks.hasLineOfSight(s,a,c))&&
      !(['rescue','barricade'].includes(s.objective?.kind)&&distance(a,s.objective)<(s.objective.kind==='barricade'?85:s.objective.radius)));
    if(!helper)continue;
    op.progress=clamp(op.progress+dt/(helper.role==='medic'?4.5:6),0,1);helper.bandageProgress=0;
    s.interactionPrompt=`Aiding resident · ${Math.round(op.progress*100)}%`;
    if(op.progress>=1){
      helper.medkits--;resident.hp=resident.maxHp;resident.needsAid=false;resident.panicked=0;op.status='assisted';op.revealed=true;
      s.story.consequences.medicalSpent++;s.story.consequences.assisted++;
      summary(s,'Gave the injured resident first aid so they could move to cover; used 1 medical supply, which also carries forward.');
      log(s,hooks,'Resident is moving to cover. One medical supply used. We still have no update on transport.','consequence',helper.name.toUpperCase());
    }
  }
}
export function updateStory(s,inputs,dt,hooks){
  if(!s.story||s.status!=='playing')return;
  if(s.story.observedStage!==s.stageIndex){
    s.story.observedStage=s.stageIndex;s.story.briefing=briefings[s.missionIndex][s.stageIndex]||s.story.briefing;
    log(s,hooks,s.story.briefing,'briefing');
  }
  if(s.stats.civilianHarm>0&&!s.story.consequences.localCallsQuiet){
    s.story.consequences.localCallsQuiet=true;
    summary(s,'Civilian harm quieted nearby calls for help. Field aid can still be found at close range.');
    log(s,hooks,'After that civilian was hit, nearby voices have fallen quiet. We will have to check close by for anyone needing help.','consequence');
  }
  const definition=decisionFor(s);
  if(!s.story.activeDecision&&!s.story.resolved[definition.id]&&shouldOpen(s)){
    const {window,...decision}=definition;s.story.activeDecision={...decision,openedAt:s.time,deadline:s.time+window};
    updateAvailability(s);log(s,hooks,decision.detail,'request');
  }
  updateAvailability(s);
  if(s.story.activeDecision&&(s.time>=s.story.activeDecision.deadline||decisionExpiredByStage(s))){
    resolve(s,s.story.activeDecision.defaultOption,hooks.currentLeader(s),hooks,'default');
  }
  // Walking onto the eastern approach can itself communicate a route request.
  // A human leader retains the final call if a member is the one who moves there.
  if(s.story.activeDecision?.id==='dawn-approach'){
    const actor=s.squad.find(a=>standing(a)&&hooks.controlled(s,a)&&distance(a,{x:2120,y:960})<95);
    if(actor)chooseOption(s,'dawn-approach','east',actor.id,hooks);
  }
  updateOpportunities(s,inputs,dt,hooks);
}
export function finalizeStory(s,hooks){
  if(!s.story||s.story.finalized||s.status==='playing')return;
  s.story.finalized=true;
  if(s.story.activeDecision){summary(s,'A radio decision remained unresolved when the chapter ended.');s.story.activeDecision=null;}
  for(const op of s.story.opportunities)if(op.status==='available'){
    op.status='passed';if(op.revealed)summary(s,'Aid to the injured resident was not completed; their later condition is unconfirmed.');
  }
  if(s.status==='won'&&s.story.resolved['relief-capacity']?.optionId==='extra'){
    const boarded=s.civilians.filter(c=>c.transportCandidate&&c.alive);for(const c of boarded){c.evacuated=true;c.needsAid=false;}
    s.story.consequences.additionalLoaded=boarded.length;
    summary(s,`${boarded.length} of the two additional residents survived to board the relief vehicles.`);
  }
  if(s.stats.civilianHarm&&!s.story.summary.some(text=>text.includes('Civilian harm')))summary(s,'Civilian harm quieted nearby calls; close observation remains possible in a continued chapter.');
  if(!s.story.summary.length)summary(s,'No optional field decision was completed. The fate of people left outside the chalk is not fully known.');
}
/** A new chapter starts with fresh actors and these explicitly bounded effects. */
export function campaignOutcome(s){
  if(s?.status!=='won'||!s.story)return null;
  const prior=normalizeCampaignCarry(s.campaign),c=s.story.consequences;
  return normalizeCampaignCarry({version:1,fromMission:s.missionIndex,medicalDebt:(prior?.medicalDebt||0)+c.medicalSpent,
    smokeDebt:(prior?.smokeDebt||0)+c.smokeSpent,fatigue:(prior?.fatigue||0)+c.fatigueAdded,
    civilianHarm:(prior?.civilianHarm||0)+s.stats.civilianHarm,aided:(prior?.aided||0)+c.assisted});
}
