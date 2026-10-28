/* Linked operations use saved server outcomes. The browser never earns a
   consequence, advances a mission on a read, or receives future enemy setups. */
'use strict';
(()=>{
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const infantry=new Set(['squad','mg','leader','commander','scout','engineer','at_team','paratrooper','sniper','radioman','commando','mountain','partisan','askari','mortar','pathfinder']);
 const isOperation=()=>state?.operation?.id==='greybridge';
 const hex=p=>p?`${hexColumn(p[0])}${p[1]+1}`:'';
 const text=value=>Array.isArray(value)?value.filter(Boolean).join(' '):String(value||'');
 const experience=()=>window.ww2Experience?.level||'simple';
 const seen=new Set();let operationKey='',remoteRuns=[],listIdentity=null,listRequest=0,syncTimer=null,detailKey='';

 const home=node('section',undefined,'greybridge-home');home.id='greybridgeHome';home.setAttribute('aria-labelledby','greybridgeHomeTitle');
 home.innerHTML='<div class="greybridge-home-copy"><p class="eyebrow">CURRENT DSL · LINKED OPERATION</p><h2 id="greybridgeHomeTitle">Operation Greybridge</h2><p>Raid the relay. Seize the crossing. Hold the corridor—or bring your force home.</p><p class="greybridge-home-meta">3 connected missions · compact 10×12 and 12×14 maps · solo Allied command</p></div><div class="greybridge-home-actions"><button id="greybridgeStart" class="primary" type="button">Start Greybridge →</button><p>Your decisions carry into the next battle. A setback still lets the operation continue.</p></div><section id="greybridgeSaved" class="greybridge-saved" hidden aria-label="Saved Greybridge operations"><h3>Continue an operation</h3><p id="greybridgeSavedStatus" role="status"></p><div id="greybridgeSavedRuns"></div></section>';
 $('operationSetup').before(home);

 const panel=node('section',undefined,'greybridge-panel');panel.id='greybridgePanel';panel.hidden=true;panel.setAttribute('aria-label','Linked operation');
 panel.innerHTML='<div><p class="eyebrow" id="greybridgeStage"></p><p id="greybridgeSituation"></p></div><button id="greybridgeOpen" type="button">Operation briefing & record</button>';
 $('missionHint').after(panel);

 const dialog=node('dialog');dialog.id='greybridgeDialog';dialog.setAttribute('aria-labelledby','greybridgeTitle');
 dialog.innerHTML='<button id="greybridgeClose" class="dialog-back" type="button">Back to battlefield</button><p class="eyebrow" id="greybridgeDialogEyebrow">LINKED OPERATION</p><h2 id="greybridgeTitle">Operation Greybridge</h2><ol id="greybridgePath" aria-label="Operation progress"></ol><h3 id="greybridgeMissionTitle"></h3><p id="greybridgeBrief"></p><p id="greybridgeGoal" class="greybridge-goal"></p><section id="greybridgeOutcome" hidden><h3 id="greybridgeOutcomeTitle"></h3><dl id="greybridgeOutcomeDetails"></dl></section><p id="greybridgeRecovery" class="greybridge-recovery">The whole operation travels with its SAVE or MOVE code. Completed mission records remain available below.</p><p id="greybridgeActionStatus" role="status"></p><div class="greybridge-dialog-actions"><button id="greybridgeContinue" class="primary" type="button" hidden>Continue operation →</button><button id="greybridgeRetry" type="button" hidden>Retry this mission</button><button id="greybridgeReviewCurrent" type="button">Review battlefield</button><button id="greybridgeHomeButton" class="quiet" type="button">Back to operations</button></div><section class="greybridge-record"><h3>Operation record</h3><p id="greybridgeHistoryEmpty">Your first mission is underway. Accomplishments and their consequences will be recorded here.</p><ol id="greybridgeHistory"></ol></section>';
 document.body.append(dialog);
 const levelControl=node('div',undefined,'experience-control greybridge-experience');
 levelControl.innerHTML='<label for="greybridgeExperience">Your guidance</label><select id="greybridgeExperience" data-experience-select><option value="simple">Simple</option><option value="moderate">Moderate</option><option value="expert">Expert</option></select><p id="greybridgeExperienceNote"></p>';
 $('greybridgeTitle').after(levelControl);
 // Lead with the required goal before narrative or an optional mission benefit.
 $('greybridgeBrief').before($('greybridgeGoal'));
 const next=node('section');next.id='greybridgeNext';next.innerHTML='<h3>What to do next</h3><p id="greybridgeNextText"></p><ul id="greybridgeDecisions"></ul><button id="greybridgeFind" type="button">Find the objective</button>';
 $('greybridgeGoal').after(next);
 const full=node('details');full.id='greybridgeFullDetails';full.innerHTML='<summary id="greybridgeFullSummary">Optional objective and full rules</summary><ul id="greybridgeRules"></ul>';
 full.append($('greybridgeRecovery'));dialog.querySelector('.greybridge-dialog-actions').after(full);
 const recordDetails=node('details');recordDetails.id='greybridgeRecordDetails';const recordSummary=node('summary','Operation record');recordSummary.id='greybridgeRecordSummary';recordDetails.append(recordSummary);
 const recordSection=dialog.querySelector('.greybridge-record');recordSection.before(recordDetails);recordDetails.append(recordSection);

 const review=node('dialog');review.id='greybridgeReviewDialog';review.setAttribute('aria-labelledby','greybridgeReviewTitle');
 review.innerHTML='<button id="greybridgeReviewClose" class="dialog-back" type="button">Back to operation record</button><p class="eyebrow">COMPLETED MISSION · READ ONLY</p><h2 id="greybridgeReviewTitle"></h2><p id="greybridgeReviewSummary"></p><p id="greybridgeReviewForce" class="greybridge-force-record"></p><p>Final battlefield as your army saw it. Unseen enemies remain concealed. Dashed counters are dated contacts.</p><div class="greybridge-review-tools"><button id="greybridgeReviewZoom" type="button" aria-pressed="false">Enlarge map</button><p id="greybridgeReviewSelection" role="status">Select a visible counter to inspect it.</p></div><div id="greybridgeReviewMapWrap"><svg id="greybridgeReviewMap" role="group" aria-label="Completed mission battlefield"></svg></div><div id="greybridgeReviewRoster"></div>';
 document.body.append(review);
 const missionOpen=node('button','Operation briefing & record');missionOpen.id='greybridgeFromMission';missionOpen.type='button';missionOpen.hidden=true;$('missionDialog').append(missionOpen);
 const resultOpen=node('button','Operation result & next mission');resultOpen.id='greybridgeFromResult';resultOpen.type='button';resultOpen.hidden=true;$('battleReport').append(resultOpen);

 const sabotage=node('button','Disable relay · 2 AP');sabotage.id='greybridgeSabotage';sabotage.type='button';sabotage.hidden=true;
 const extract=node('button','Extract unit · 1 AP');extract.id='greybridgeExtract';extract.type='button';extract.hidden=true;
 const orderReason=node('p','','greybridge-order-reason');orderReason.id='greybridgeOrderReason';orderReason.hidden=true;
 for(const b of [sabotage,extract]){b.setAttribute('aria-describedby',orderReason.id);$('nextUnit').before(b);}
 $('orders').append(orderReason);

 function commander(){
  // The lobby owns sign-in, including when browser storage is unavailable.
  return window.ww2Commander?.name?{name:window.ww2Commander.name}:null;
 }
 async function operationRequest(path,body,seat){
  if(window.ww2Commander?.request)return window.ww2Commander.request(path,body,seat);
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(seat?{Authorization:`Bearer ${seat.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw new Error((data.error||'The operation could not be loaded.')+(data.request_id?` Reference: ${data.request_id}`:''));return data;
 }
 function updateSaved(){
  const local=savedSessions.filter(s=>s.operation==='greybridge'&&(!s.commander||s.commander===window.ww2Commander?.name));
  const runs=new Map(local.map(s=>[s.code,{...s,local:true}]));
  for(const r of remoteRuns)runs.set(r.code,{...runs.get(r.code),...r});
  $('greybridgeSaved').hidden=!runs.size&&!commander();
  $('greybridgeSavedRuns').replaceChildren(...[...runs.values()].map(r=>{
   const row=node('div',undefined,'greybridge-saved-row'),copy=node('div');
   copy.append(node('strong',r.mission_title||r.label||'Operation Greybridge'),node('small',r.completed?(r.outcome_label||'Operation complete'):`Mission ${r.stage||1} / 3${r.local?' · saved on this browser':''}`));
   const b=node('button',r.completed?'Review operation':'Resume operation');b.type='button';b.disabled=busy;b.dataset.operationCode=r.code;b.onclick=()=>resume(r.code);
   row.append(copy,b);return row;
  }));
 }
 async function loadSaved(){
  const identity=commander()?.name||null,request=++listRequest;listIdentity=identity;remoteRuns=[];updateSaved();
  if(!identity){$('greybridgeSavedStatus').textContent='';return;}
  $('greybridgeSavedStatus').textContent='Loading your operations…';
  try{
   const data=await operationRequest('/api/operations/greybridge');
   if(request!==listRequest||identity!==commander()?.name)return;
   remoteRuns=Array.isArray(data.operations)?data.operations:[];
   $('greybridgeSavedStatus').textContent=remoteRuns.length?'Your operation progress follows your commander sign-in.':'Your new Greybridge operations will follow your commander sign-in.';updateSaved();
  }catch(error){if(request===listRequest)$('greybridgeSavedStatus').textContent=error.message;}
 }
 async function loadSeat(seat){
  let next=await apiWithSession(seat),code=seat.code;const visited=new Set([code]);
  // A saved old mission remains readable, and points to its accepted successor.
  // Follow only authenticated reads; never repeat Continue to recover a reply.
  for(let i=0;next.operation?.next_code&&i<32;i++){
   const successor=next.operation.next_code;if(visited.has(successor))break;
   visited.add(successor);code=successor;next=await apiWithSession({...seat,code});
  }
  remember({...seat,code,operation:'greybridge'});state=next;render();
 }
 async function resume(code){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  await run(async()=>{
   const saved=savedSessions.find(s=>s.code===code);let seat=saved||(isOperation()&&state.operation.next_code===code?{...session,code}:null);
   if(!seat){seat=await operationRequest(`/api/match/${code}/resume`,{});if(commander())seat.commander=commander().name;}
   await loadSeat(seat);
  });
 }
 async function start(){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  await run(async()=>{
   const seat=await operationRequest('/api/operations/greybridge',{});if(commander())seat.commander=commander().name;
   await loadSeat(seat);
  });
  if(isOperation()){open();if(commander())loadSaved();}
 }
 async function transition(action){
  if(!isOperation()||busy||playbackSession)return;
  const current=session,revision=state.revision;
  if(action==='retry'&&!confirm('Retry this mission from its original starting situation? This attempt’s result will be replaced. Earlier mission consequences stay the same.'))return;
  $('greybridgeActionStatus').textContent=action==='retry'?'Preparing a fresh attempt…':'Recording the result and preparing the next mission…';
  let accepted=false;
  await run(async()=>{
   const next=await api(`/api/match/${current.code}/operation`,{action,revision,request_id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`});
   const seat={...current,code:next.code,operation:'greybridge'};
   // Keep one browser shortcut for this continuation. The server retains the
   // previous board, and the operation record includes its safe review copy.
   await loadSeat(seat);
   savedSessions=savedSessions.filter(s=>s.code!==current.code);persistSessions();renderSessions();accepted=true;
  });
  if(accepted){open();if(commander())loadSaved();}
  else{
   $('greybridgeActionStatus').textContent='The next mission is not confirmed on this screen. Reopen the operation to read its saved status before trying again.';
   // A failed response might follow a committed transition. A read can recover
   // the successor and exposes no second mutation or duplicate rewards.
   try{const next=await apiWithSession(current);if(session?.code===current.code){state=next;render();fill();}}catch{}
  }
 }

 function mission(s){
  const g=s.greybridge||{},stage=g.stage,limit=s.scenario.rounds,round=Math.min(s.round,limit),required=g.required||0;
  let goal,compact,progress,rules,focus=s.scenario.objective;
  if(stage==='raid'){
   goal=`Extract ${required} infantry units by the end of round ${limit}. Disabling the relay is an optional objective.`;
   compact=`1/3 · Extract ${g.extracted||0}/${required}`;
   progress=`Extracted ${g.extracted||0}/${required} · Relay ${g.relay_disabled?'disabled':'intact'} · Round ${round}/${limit}`;
   rules=[s.scenario.brief,'Disable relay costs 2 AP. An unpinned Allied infantry unit must be on or adjacent to the marked relay. It can only be disabled once.',
    'Extract unit costs 1 AP on a marked extraction hex. Extracted units leave the battlefield and cannot return during this mission.',
    'A disabled relay delays the German reserve in the crossing assault from round 4 to round 6. That accomplishment carries forward even if the raid is defeated.',
    `Extract ${required} units before the deadline to complete the raid. The operation can continue after either result.`];
   focus=s.scenario.greybridge_relay||focus;
  }else if(stage==='crossing'){
   goal=`Secure the crossing with infantry for two consecutive Allied turn endings by round ${limit}.`;
   compact=`2/3 · Crossing ${g.hold||0}/2 holds`;
   progress=`Crossing held ${g.hold||0}/2 · German reserve round ${g.reserve_round||4} · Round ${round}/${limit}`;
   rules=[s.scenario.brief,'Infantry must garrison the objective at consecutive turn endings. Losing the required control resets the hold.',
    g.relay_disabled?'Your raid disabled the relay. The scheduled German reserve is delayed until round 6.':'The relay remained intact. The scheduled German reserve is due in round 4.',
    'Capture the crossing to defend the bridgehead in the final mission. If the assault fails, the final mission becomes a fighting withdrawal.'];
  }else if(stage==='hold'){
   goal=`Hold the north-bank depot with infantry for ${required} consecutive Allied turn endings by round ${limit}.`;
   compact=`3/3 · Bridgehead ${g.hold||0}/${required} holds`;
   progress=`Bridgehead held ${g.hold||0}/${required} · Round ${round}/${limit}`;
   rules=[s.scenario.brief,`Infantry must occupy the depot at the end of ${required} consecutive Allied turns. Losing control resets the hold; retaking it starts a new count.`,
    'Winning this defense secures the corridor and completes the operation’s strategic objective.'];
  }else{
   goal=`Extract ${required} infantry units by the end of round ${limit}.`;
   compact=`3/3 · Withdraw ${g.extracted||0}/${required}`;
   progress=`Extracted ${g.extracted||0}/${required} · Round ${round}/${limit}`;
   rules=[s.scenario.brief,'Extract unit costs 1 AP on a marked exit. Use the rear guard to buy time for the rest of the force.',
    'A successful withdrawal brings the formation out in good order. The crossing objective has still been lost; the operation records both outcomes honestly.'];
   focus=s.scenario.greybridge_exits?.[0]||focus;
  }
  rules.push('Each mission starts with a viable, replenished force. The operation carries mission accomplishments and loss records between battles.',
   'Eliminating defenders does not bypass an extraction or hold objective. Fog of war remains in effect.');
  return {goal,compact,progress,rules:rules.filter(Boolean),focus};
 }
 function missionGuidance(s){
  const g=s.greybridge,limit=s.scenario.rounds,required=g.required;
  if(g.stage==='raid')return {
   goal:`Get ${required} infantry teams to a marked exit and extract them by the end of round ${limit}.`,
   next:'Select one of your infantry teams. Move toward an EXTRACT exit. On that hex, choose Extract unit and spend 1 action point (AP).',
   why:g.relay_disabled?'The relay is disabled. You have earned two extra rounds before enemy reserves arrive in the next battle.':'Disabling the relay is optional. It gives you two extra rounds before enemy reserves arrive in the next battle.',
   notes:['Save 1 AP to extract a team once it reaches an exit. A pinned team must recover first.',
    g.relay_disabled?'The reserve delay carries forward even if this raid ends in defeat.':'Relay sabotage costs 2 AP from the relay hex or an adjacent hex. Decide whether the detour is worth the time.',
    'Choose cover along the route. Night sight is short, so an apparently empty route can still contain unseen enemies.'],focus:s.scenario.greybridge_exits?.[0]};
  if(g.stage==='crossing')return {
   goal:`Keep infantry on the north-bank depot when ending two turns in a row, by round ${limit}.`,
   next:'Find the depot, then choose an infantry team to approach it using either bridge. Keep infantry there when you press End turn.',
   why:g.relay_disabled?'Your raid delayed the enemy reserves until round 6. Use that time to reach the depot.':'Enemy reserves are due in round 4. You can approach the depot by either bridge.',
   notes:[`The reserve arrives in round ${g.reserve_round||4}. Compare the two routes before committing your teams.`,
    'The depot must remain occupied at two consecutive Allied turn endings. Losing control resets the count.',
    'Securing the crossing leads to its defense. A setback leads to a withdrawal.'],focus:s.scenario.objective};
  if(g.stage==='hold')return {
   goal:`Keep infantry on the depot when ending ${required} turns in a row, by round ${limit}.`,
   next:'Keep an infantry team on the depot. Use your other teams to protect its approaches, then end your turn when ready.',
   why:'The hold counter advances at the end of your turns. Losing the depot resets it.',
   notes:[`Protect the depot through ${required} consecutive Allied turn endings. Retaking it starts a new count.`,
    'A team that leaves the depot may break the hold. Check the progress counter before ending your turn.',
    'Winning this defense secures the bridge and completes the operation.'],focus:s.scenario.objective};
  return {
   goal:`Get ${required} infantry teams to a marked exit and extract them by the end of round ${limit}.`,
   next:'Choose one team to head toward a south-edge EXTRACT exit. On that hex, choose Extract unit and spend 1 action point (AP).',
   why:'Bring the force home. A successful withdrawal saves the teams, while the bridge objective remains lost.',
   notes:['Save 1 AP for extraction. Pinned teams must recover before they can leave.',
    'Use some teams to cover the withdrawal while others move toward either exit.',
    'Extraction removes a team from this battle. It is recorded as saved, not lost.'],focus:s.scenario.greybridge_exits?.[0]};
 }
 function guidance(s){
  const guide=missionGuidance(s);
  if(playbackSession)guide.next='Finish or skip the replay, then choose a team for your next order.';
  else if(s.computer_work?.pending||s.turn!==s.side)guide.next='Review the objective and plan a route while the other army finishes its turn.';
  else if(s.order_history?.redo_required)guide.next='Use Redo to restore the recorded result before choosing a new order.';
  return guide;
 }
 function addDetail(dl,label,value){if(!value)return;dl.append(node('dt',label),node('dd',text(value)));}
 function forceRecordText(record){
  if(!record)return 'Loss record unavailable.';
  const losses=record.units_lost==null?'Loss record unavailable':`Teams lost: ${record.units_lost}`;
  return `${losses} · Still on battlefield: ${record.units_remaining} · Extracted: ${record.units_extracted}${record.complete?'':' · Partial record'}`;
 }
 function fill(){
  if(!isOperation())return;const op=state.operation,g=state.greybridge,m=mission(state),level=experience(),guide=guidance(state);
  dialog.dataset.experience=level;$('greybridgeExperience').value=level;
  $('greybridgeExperienceNote').textContent={simple:'One task at a time. Optional tasks and full rules are below.',moderate:'Plan the route, action costs and consequences. Full rules remain available.',expert:'Complete mission rules, inherited outcomes and operation records.'}[level];
  $('greybridgeDialogEyebrow').textContent=op.completed?'OPERATION COMPLETE':`LINKED OPERATION · MISSION ${op.stage} / 3`;
  $('greybridgeTitle').textContent=op.name||'Operation Greybridge';
  $('greybridgePath').replaceChildren(...['Night Raid','Dawn Crossing',g.stage==='withdrawal'?'Fighting Withdrawal':g.stage==='hold'?'Hold the Bridgehead':'Hold or Withdraw'].map((title,i)=>{
   const li=node('li',undefined,i+1<op.stage?'past':i+1===op.stage?'active':'');li.append(node('span',String(i+1)),node('strong',title));if(i+1===op.stage)li.setAttribute('aria-current','step');return li;
  }));
  $('greybridgeMissionTitle').textContent=op.mission_title||state.scenario.name;
  $('greybridgeBrief').textContent=level==='simple'?guide.why:text(op.briefing)||state.scenario.brief;
  $('greybridgeGoal').textContent=level==='simple'?guide.goal:m.goal;
  next.hidden=!!state.winner;$('greybridgeNextText').textContent=guide.next;
  $('greybridgeDecisions').hidden=level==='simple';$('greybridgeDecisions').replaceChildren(...guide.notes.map(t=>node('li',t)));
  $('greybridgeFind').textContent=['raid','withdrawal'].includes(g.stage)?'Find an extraction exit':'Find the depot';
  $('greybridgeRules').replaceChildren(...m.rules.map(t=>node('li',t)));
  $('greybridgeFullSummary').textContent=level==='expert'?'Complete mission rules and saving':g.stage==='raid'?'Optional relay objective and full rules':'Full mission rules and saving';
  const newDetailKey=`${session.code}:${level}`;
  if(detailKey!==newDetailKey){full.open=level==='expert';recordDetails.open=level==='expert'||level==='moderate'&&!!op.history?.length;detailKey=newDetailKey;}
  const finished=!!state.winner;
  $('greybridgeOutcome').hidden=!finished;
  $('greybridgeOutcomeTitle').textContent=op.completed?(op.outcome_label||'Operation complete'):(state.winner===state.side?'Mission accomplished':'Mission setback');
  const details=$('greybridgeOutcomeDetails');details.replaceChildren();
  addDetail(details,'What happened',op.what_happened||state.battle_result?.reason);
  if(finished)addDetail(details,'Your force',forceRecordText(op.force_record));
  addDetail(details,'What changes',op.what_changes);
  addDetail(details,'Your next task',op.next_task);
  dialog.dataset.result=op.completed?(op.outcome==='operation_success'?'victory':'defeat'):finished?(state.winner===state.side?'victory':'defeat'):'briefing';
  $('greybridgeContinue').hidden=!op.can_continue&&!op.next_code;
  $('greybridgeContinue').textContent=op.next_code?'Resume operation →':'Continue operation →';
  $('greybridgeContinue').disabled=busy||!!playbackSession;
  $('greybridgeRetry').hidden=!op.can_retry||!!op.next_code;
  $('greybridgeRetry').disabled=busy||!!playbackSession;
  $('greybridgeReviewCurrent').textContent=finished?'Review final battlefield':'Return to battlefield';
  const history=op.history||[];$('greybridgeHistoryEmpty').hidden=!!history.length;
  recordSummary.textContent=`Operation record · ${history.length} completed mission${history.length===1?'':'s'}`;
  $('greybridgeHistory').replaceChildren(...history.map((r,i)=>{
   const row=node('li'),copy=node('div');copy.append(node('h4',`${r.stage||i+1}. ${r.title}`),node('p',text(r.what_happened)),node('p',forceRecordText(r.force_record),'greybridge-force-record'),node('p',text(r.what_changes),'greybridge-history-change'));
   const b=node('button','Review mission');b.type='button';b.dataset.historyIndex=String(r.index??i);b.disabled=busy;b.onclick=()=>showHistory(r.index??i);
   row.append(copy,b);return row;
  }));
 }
 function open(){
  if(!isOperation()||busy||playbackSession||$('game').hidden||lobbyMode)return;
  fill();$('greybridgeActionStatus').textContent='';
  for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
  if(!dialog.open)dialog.showModal();operationKey=session.code;
  if(state.winner){const k=`${session.code}:${state.winner}`;seen.add(k);try{sessionStorage.setItem('ww2-operation-result:'+k,'seen');}catch{}}
 }
 function maybeResult(){
  if(!isOperation()||!state.winner||busy||playbackSession||lobbyMode||$('game').hidden)return;
  const k=`${session.code}:${state.winner}`;let shown=seen.has(k);
  try{shown=shown||sessionStorage.getItem('ww2-operation-result:'+k)==='seen';}catch{}
  if(!shown&&!document.querySelector('dialog[open]'))open();
 }
 function paintMarkers(svg,snapshot=state){
  svg.querySelectorAll('.greybridge-marker').forEach(n=>n.remove());
  if(!snapshot.greybridge)return;
  for(const mark of snapshot.scenario?.greybridge_markers||[]){
   const [x,y]=center(...mark.pos),g=element('g',{class:`greybridge-marker greybridge-${mark.kind}`,'aria-hidden':'true'});
   const label=mark.kind==='relay'?(snapshot.greybridge.relay_disabled?'RELAY DISABLED':'RELAY'):mark.kind==='exit'?'EXTRACT':mark.kind==='reserve'?'RESERVE ENTRY':mark.label;
   g.append(element('circle',{cx:x,cy:y,r:28}),element('text',{x,y:mark.pos[1]===0?y+43:y-34,'text-anchor':'middle'},label));svg.append(g);
  }
 }
 function orderUnavailable(kind,u){
  if(busy)return 'An order is being confirmed.';
  if(playbackSession)return 'Finish the replay before issuing orders.';
  if(state.winner)return 'This mission has ended.';
  if(state.turn!==state.side)return 'Wait for your turn.';
  if(state.order_history?.redo_required)return 'Redo the recorded order first.';
  if(u.reserve||u.evacuated)return 'This unit has left the battlefield.';
  if(u.carrier_id)return 'Disembark before giving this order.';
  if(u.pinned)return 'This unit is pinned.';
  if(kind==='sabotage_relay'&&state.greybridge.relay_disabled)return 'The relay is already disabled.';
  if(u.ap<(kind==='extract'?1:2))return `Needs ${kind==='extract'?1:2} AP.`;
  return kind==='extract'?`Move onto a marked extraction hex (${(state.scenario.greybridge_exits||[]).map(hex).join(' or ')}).`:`Move onto or adjacent to the relay at ${hex(state.scenario.greybridge_relay)}.`;
 }
 function renderOrders(){
  const u=state?.units?.find(u=>u.id===selected),g=state?.greybridge,eligible=!!g&&u?.side===state.side&&u.hp>0&&infantry.has(u.kind)&&!u.reserve&&!u.carrier_id&&!u.evacuated;
  sabotage.hidden=!eligible||g.stage!=='raid';extract.hidden=!eligible||!['raid','withdrawal'].includes(g.stage);
  const explanations=[];
  for(const [b,kind] of [[sabotage,'sabotage_relay'],[extract,'extract']]){
   const why=b.hidden?'':state.legal?.[u.id]?.[kind]?'':orderUnavailable(kind,u);
   b.disabled=busy||!!playbackSession;b.setAttribute('aria-disabled',String(!!why));b.classList.toggle('order-unavailable',!!why);b.dataset.unavailableReason=why;
   if(!b.hidden&&why)explanations.push(`${kind==='extract'?'Extract':'Relay'}: ${why}`);
  }
  orderReason.hidden=!explanations.length;orderReason.textContent=explanations.join(' ');
 }
 function performOrder(kind,button){
  if(button.getAttribute('aria-disabled')==='true'){notify(button.dataset.unavailableReason);return;}
  if(!selected||busy||playbackSession)return;
  if(kind==='extract'&&!confirm('Extract this unit for 1 AP? It leaves the battlefield for the rest of this mission.'))return;
  act({kind,unit:selected});
 }

 async function showHistory(index){
  if(!isOperation()||busy||playbackSession)return;
  const code=session.code;let loaded;
  await run(async()=>{loaded=await api(`/api/match/${code}/operation/history/${index}`);});
  if(!loaded||session?.code!==code)return;
  fillReview(loaded.state,loaded.record);dialog.close();review.showModal();
 }
 function fillReview(snapshot,record){
  $('greybridgeReviewTitle').textContent=record.title;
  $('greybridgeReviewSummary').textContent=`${text(record.what_happened)} ${text(record.what_changes)}`.trim();
  $('greybridgeReviewForce').textContent=forceRecordText(record.force_record);
  $('greybridgeReviewSelection').textContent='Select a visible counter to inspect it.';
  $('greybridgeReviewMapWrap').classList.remove('enlarged');$('greybridgeReviewZoom').textContent='Enlarge map';$('greybridgeReviewZoom').setAttribute('aria-pressed','false');
  const svg=$('greybridgeReviewMap'),board=snapshot.scenario;svg.replaceChildren();
  svg.setAttribute('viewBox',`0 0 ${board.width*52+36} ${board.height*49+29}`);svg.setAttribute('aria-label',`${record.title}. Final battlefield as your army saw it. Read only.`);
  const visible=new Set((snapshot.visible_hexes||[]).map(p=>p.join(',')));
  for(let y=0;y<snapshot.map.length;y++)for(let x=0;x<snapshot.map[y].length;x++){
   const [cx,cy]=center(x,y),type=snapshot.map[y][x];
   const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
   const g=element('g');g.append(element('polygon',{points,class:`hex ${type}`}));
   if(snapshot.fog_of_war&&!visible.has(`${x},${y}`))g.append(element('polygon',{points,class:'greybridge-review-fog'}));
   if(type==='objective')g.append(element('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'objective-icon'},'★'));
   if(x===0||y===board.height-1)g.append(element('text',{x:cx,y:cy+24,'text-anchor':'middle',class:'greybridge-review-coordinate'},hex([x,y])));
   svg.append(g);
  }
  paintMarkers(svg,snapshot);
  const roster=$('greybridgeReviewRoster');roster.replaceChildren();
  const inspect=(u,contact=false)=>{
   $('greybridgeReviewSelection').textContent=`${contact?'Last seen contact: ':''}${snapshot.factions?.[u.side]||names[u.side]} · ${unitTypeName(u)} · ${hex(u.pos)}${contact?` · round ${u.last_seen_round||'unknown'}`:` · ${u.hp} strength${u.pinned?' · pinned':''}`}`;
  };
  for(const contact of snapshot.contacts||[]){
   if(!contact.pos)continue;const [x,y]=center(...contact.pos),g=element('g',{class:`greybridge-review-contact ${contact.side}`,tabindex:0,role:'button','aria-label':`Last known ${unitTypeName(contact)} at ${hex(contact.pos)}, round ${contact.last_seen_round||'unknown'}.`});
   g.append(element('rect',{x:x-20,y:y-17,width:40,height:34,rx:3}),element('text',{x,y:y+5,'text-anchor':'middle'},'?'));activate(g,()=>inspect(contact,true));svg.append(g);
  }
  for(const u of snapshot.units||[]){
   if(u.hp<=0||u.reserve||u.carrier_id||u.evacuated||!u.pos)continue;
   const [x,y]=center(...u.pos),g=element('g',{class:`unit greybridge-review-unit ${u.side}`,tabindex:0,role:'button','aria-label':`${snapshot.factions?.[u.side]||names[u.side]} ${unitTypeName(u)} at ${hex(u.pos)}, ${u.hp} strength.`});
   g.append(element('rect',{x:x-21,y:y-18,width:42,height:36,rx:u.side==='us'?8:2}),element('text',{x,y:y-2,'text-anchor':'middle',class:'unit-name'},unitCodes[u.kind]||'SQ'),element('text',{x,y:y+12,'text-anchor':'middle',class:'strength'},String(u.hp)));
   const portrait=window.makeUnitPortrait?.(u),art=portrait?.querySelector('.unit-art');if(art)g.append(art.cloneNode(true));
   activate(g,()=>inspect(u));svg.append(g);
   const item=node('button',`${snapshot.factions?.[u.side]||names[u.side]} · ${unitTypeName(u)} · ${hex(u.pos)} · ${u.hp} strength`);item.type='button';item.onclick=()=>inspect(u);roster.append(item);
  }
 }
 function sync(){
  const level=experience();home.dataset.experience=level;
  home.querySelector('.greybridge-home-meta').textContent=level==='simple'?'Three connected battles · play solo':level==='moderate'?'3 connected missions · small infantry forces · solo Allied command':'3 connected missions · 10×12 and 12×14 maps · solo Allied command';
  home.querySelector('.greybridge-home-copy > p:not(.eyebrow):not(.greybridge-home-meta)').textContent=level==='simple'?'Lead a small force through a raid, a river crossing and a final battle.':level==='moderate'?'Raid the relay to delay reserves, then seize the crossing. Your result decides the final mission.':'Raid the relay. Seize the crossing. Hold the corridor—or bring your force home.';
  const enabled=isOperation()&&!lobbyMode&&!$('game').hidden;
  panel.hidden=!enabled;missionOpen.hidden=!enabled;resultOpen.hidden=!enabled||!state.winner;
  if(!enabled){sabotage.hidden=true;extract.hidden=true;orderReason.hidden=true;document.querySelectorAll('.greybridge-menu-status').forEach(n=>n.remove());if(dialog.open)dialog.close();if(review.open)review.close();updateSaved();return;}
  const op=state.operation,m=mission(state);
  const menu=$('mobileBattleMenu')||$('experimentalBattle');
  const anchor=menu?menu.querySelector('.game-title'):document.querySelector('.desktop-battlefield .mission')||$('missionHint');
  if(anchor&&panel.previousElementSibling!==anchor)anchor.after(panel);
  $('greybridgeStage').textContent=`GREYBRIDGE · MISSION ${op.stage} / 3`;
  $('greybridgeSituation').textContent=state.winner?(op.completed?op.outcome_label:text(op.what_changes)||state.battle_result?.reason):m.progress;
  $('greybridgeOpen').textContent=state.winner?(op.completed?'Operation result & record':'Result & next mission'):'Operation briefing & record';
  $('greybridgeOpen').disabled=busy||!!playbackSession;
  for(const id of ['rematchButton','reset','soloButton'])$(id).hidden=true;
  $('seriesScore').textContent='Operation Greybridge · outcomes carry between missions';
  $('missionHint').textContent=m.goal;
  $('objective').textContent=m.progress;
  if(state.winner)$('hint').textContent='Review the battlefield, then open the operation result to continue or retry.';
  for(const buttonId of ['mobileMenuOpen','experimentalBattleOpen']){
   const b=$(buttonId);if(!b)continue;b.querySelector('.greybridge-menu-status')?.remove();b.append(node('span',`Greybridge ${op.stage}/3`,'greybridge-menu-status'));
  }
  const metadata={operation:'greybridge',stage:op.stage,mission_title:op.mission_title,completed:op.completed,outcome_label:op.outcome_label};
  if(Object.entries(metadata).some(([k,v])=>session[k]!==v)){Object.assign(session,metadata);savedSessions=savedSessions.map(s=>s.code===session.code?session:s);persistSessions();}
  renderOrders();
  const shown=playbackSession?.frames[playbackSession.index]?.[playbackSession.phase];
  if(!playbackSession)paintMarkers($('map'));
  else if($('playbackMap'))paintMarkers($('playbackMap'),{...state,...shown,scenario:state.scenario});
  if(dialog.open){if(operationKey!==session.code)dialog.close();else fill();}
  if(review.open&&operationKey!==session.code)review.close();
  if(commander()?.name!==listIdentity)loadSaved();else updateSaved();
  clearTimeout(syncTimer);syncTimer=setTimeout(maybeResult,0);
 }
 $('greybridgeStart').onclick=start;
 $('greybridgeOpen').onclick=missionOpen.onclick=resultOpen.onclick=open;
 $('greybridgeClose').onclick=$('greybridgeReviewCurrent').onclick=()=>dialog.close();
 $('greybridgeHomeButton').onclick=()=>{dialog.close();$('leave').click();loadSaved();};
 $('greybridgeContinue').onclick=()=>state.operation.next_code?resume(state.operation.next_code):transition('continue');
 $('greybridgeRetry').onclick=()=>transition('retry');
 $('greybridgeReviewClose').onclick=()=>{review.close();open();};
 $('greybridgeReviewZoom').onclick=()=>{const enlarged=$('greybridgeReviewMapWrap').classList.toggle('enlarged');$('greybridgeReviewZoom').textContent=enlarged?'Fit map':'Enlarge map';$('greybridgeReviewZoom').setAttribute('aria-pressed',String(enlarged));};
 $('greybridgeFind').onclick=()=>{const point=guidance(state).focus;if(point){dialog.close();focusMapUnit({pos:point});}};
 sabotage.onclick=()=>performOrder('sabotage_relay',sabotage);extract.onclick=()=>performOrder('extract',extract);
 const ordinarySave=$('saveButton').onclick;
 $('saveButton').onclick=()=>{
  if(!isOperation())return ordinarySave();
  return run(async()=>{
   const data=await api(`/api/match/${session.code}/save`,{revision:state.revision});
   showAccess('Operation checkpoint saved',`Mission ${state.operation.stage} of 3, round ${data.round}. This SAVE code includes the operation history, inherited consequences, and current battlefield. Loading it on this same site creates an independent operation at this checkpoint; its later choices do not change this run. Keep the code to return on another device.`,data.save_code);
  });
 };
 const ordinaryResign=$('resignButton').onclick;
 $('resignButton').onclick=()=>{
  if(!isOperation())return ordinaryResign();
  const next=state.operation.stage<3?'You can continue with the accomplishments already earned, or retry this mission from its original setup.':'You can review the operation or retry this final mission.';
  if(confirm(`Concede this mission? The Germans will win this battle. ${next}`)){
   for(const d of document.querySelectorAll('dialog[open]'))d.close();act({kind:'resign'});
  }
 };
 const ordinaryRecover=$('recoverForm').onsubmit;
 $('recoverForm').onsubmit=async event=>{
  const code=$('recoveryCode').value.trim(),prefix=code.replace(/[\s-]/g,'').toUpperCase(),player=commander();
  if(!player||!prefix.startsWith('SAVE'))return ordinaryRecover(event);
  event.preventDefault();
  await run(async()=>{
   const seat=await operationRequest('/api/restore',{code}),next=await apiWithSession(seat);
   // The restore endpoint binds a signed-in Greybridge run atomically. Normal
   // solo checkpoints retain their established, independent recovery behavior.
   if(next.operation?.id==='greybridge')seat.commander=player.name;
   remember(seat);state=next;render();$('recoveryCode').value='';
  });
  loadSaved();
 };
 document.addEventListener('ww2:before-layout',()=>document.body.append(panel));
 for(const event of ['ww2:render','ww2:playback','ww2:layout','ww2:busy','ww2:experience'])document.addEventListener(event,sync);
 document.addEventListener('ww2:commander',loadSaved);
 new MutationObserver(sync).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('close',()=>{clearTimeout(syncTimer);syncTimer=setTimeout(maybeResult,0);},true);
 window.ww2LinkedOperations={open,mission,guidance,sync,start,resume};
  updateSaved();if(window.ww2Commander?.ready)loadSaved();
})();
