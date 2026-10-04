/* Private preparation. Placement targets come only from the server's own-side view. */
'use strict';
(()=>{
 const el=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 const panel=el('section','deploymentPanel');panel.hidden=true;panel.setAttribute('aria-label','Pre-battle preparation');
 const home=document.createComment('preparation home');$('mapWrap').after(home,panel);
 const head=el('div','deploymentHead'),title=el('strong','deploymentTitle','Prepare your landing'),help=el('button','deploymentHelp','How it works');
 head.append(title,help);
 const tabs=el('div','deploymentTabs'),units=el('button','deploymentUnits','Place units'),plan=el('button','deploymentPlan','Naval fire');tabs.append(units,plan);
 const pickLabel=el('label',null,'Select a unit or boat'),pick=el('select','deploymentUnit');pickLabel.htmlFor=pick.id;
 const instruction=el('p','deploymentInstruction'),status=el('p','deploymentStatus');status.setAttribute('role','status');
 const actions=el('div','deploymentActions'),reset=el('button','deploymentReset','Reset my plan'),lock=el('button','deploymentLock','Review & lock');lock.className='primary';actions.append(reset,lock);
 panel.append(head,tabs,pickLabel,pick,instruction,status,actions);
 const dialog=el('dialog','deploymentDialog');dialog.setAttribute('aria-labelledby','deploymentDialogTitle');
 const close=el('button','deploymentClose','Back to map'),heading=el('h2','deploymentDialogTitle','Plan before the first shot'),body=el('div','deploymentExplanation'),confirm=el('button','deploymentConfirm','Lock my plan');confirm.className='primary';
 close.onclick=()=>dialog.close();dialog.append(close,heading,body,confirm);document.body.append(dialog);
 let mode='units',key='',lastOverlay='',wasActive=false;
 const preparing=()=>state?.coop?.phase!=='lobby'&&state?.deployment?.phase==='planning'&&!state.winner;
 const coord=p=>`${hexColumn(p[0])}${p[1]+1}`;
 function available(){return preparing()&&!state.deployment.locked[state.side]&&!state.coop?.done&&!busy&&!state.rematch;}
 function explain(review=false){
  if(!preparing())return;
  const d=state.deployment,de=state.side==='de';
  heading.textContent=review?'Review your plan':'Plan before the first shot';
  const copy=[
   'Preparation is private. Your opponent cannot see your placements or targets. The terrain is a survey, not live reconnaissance. No AP is spent and round 1 has not started.',
   de?`Place your units in the highlighted inland zone, including fixed guns. Add up to ${d.bunker_budget} bunkers on open ground, leaving at least one hex between them. Roads and the objective stay clear. Bunkers give cover and block sight through them. MGs and anti-tank guns begin on overwatch; troops inside a bunker begin dug in.`:
      `Choose your landing lanes inside the highlighted sea zone. Each boat carries the infantry shown in the selector; passengers move with it. Amphibious sections carry their own troops. All units already have legal starting positions.`,
   `Americans may mark up to ${d.fire_budget} naval aim points inland, at least 3 hexes apart. Tap a marker again to remove it. Both plans lock before any dice are rolled. Each mission rolls a d6: 3–6 lands on target, 1–2 scatters one adjacent hex. The impact and its neighbors are hit.`,
   'Naval fire pins exposed infantry and cancels overwatch, causing 1 strength loss but never killing a unit during preparation. Intact bunkers absorb strength loss; armor is unaffected. There is no casualty confirmation for unseen troops. Empty ground is a valid result.',
   'Locking is final. The other commander can finish independently; then normal fog and American round 1 begin. Existing smoke, movement, unloading, combat and victory rules apply. These two maps are balance playtests.',
   de?`Your bunkers: ${d.bunkers.map(coord).join(', ')||'none'} (${d.bunkers.length}/${d.bunker_budget}).`:`Your naval aim points: ${d.fire.map(coord).join(', ')||'none'} (${d.fire.length}/${d.fire_budget}).`,
  ];
  if(review)copy.push('Use the map and selector to review unit positions before locking. Unused bunker or fire allocations are forfeited.');
  body.replaceChildren(...copy.map(t=>el('p',null,t)));
  confirm.hidden=!review;confirm.disabled=!available();
  for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
  if(!dialog.open)dialog.showModal();
 }
 help.onclick=()=>explain();lock.onclick=()=>explain(true);
 confirm.onclick=()=>{dialog.close();act({kind:'deploy_lock'});};
 reset.onclick=()=>{if(available()&&window.confirm('Reset your placements and clear your bunker or naval-fire plan?'))act({kind:'deploy_reset'});};
 units.onclick=()=>{mode='units';sync();};plan.onclick=()=>{mode='plan';sync();};
 pick.onchange=()=>{mode='units';chooseUnit(state.units.find(u=>u.id===pick.value));focusMapUnit(state.units.find(u=>u.id===pick.value));};
 function draw(){
  const svg=$('map'),d=state.deployment,de=state.side==='de',u=state.units.find(u=>u.id===selected);
  const stamp=[state.code,state.revision,selected,mode,busy,d.locked[state.side]].join(':');
  if(lastOverlay===stamp&&svg.querySelector('.deployment-overlay'))return;
  lastOverlay=stamp;svg.querySelector('.deployment-overlay')?.remove();
  const overlay=element('g',{class:'deployment-overlay'});svg.append(overlay);
  const positions=mode==='units'?d.zone:de?d.bunker_zone:d.fire_zone;
  const occupied=new Set(state.units.filter(t=>!t.carrier_id&&t.id!==selected).map(t=>t.pos.join(',')));
  const chosen=de?d.bunkers:d.fire;
  if(available())for(const pos of positions){
   if(mode==='units'&&(!u||u.carrier_id||occupied.has(pos.join(','))))continue;
   const [x,y]=pos,tile=svg._tiles?.[y*state.map[0].length+x];if(!tile)continue;
   const marked=mode==='plan'&&chosen.some(p=>p[0]===x&&p[1]===y);
   const label=mode==='units'?`Deploy ${unitTypeName(u)} to ${coord(pos)}`:`${marked?'Remove':de?'Place bunker':'Aim naval fire'} at ${coord(pos)}`;
   const target=element('polygon',{points:tile.getAttribute('points'),class:`deployment-choice ${de?'defense':'landing'}${mode==='plan'?' planning-fire':''}${marked?' planned':''}`,role:'button',tabindex:0,'aria-label':label,'data-x':x,'data-y':y});
   target.append(element('title',{},label));
   activate(target,()=>{if(available())act(mode==='units'?{kind:'deploy_unit',unit:selected,pos}:{kind:de?'deploy_bunker':'deploy_fire',pos});});
   overlay.append(target);
  }
  for(const [index,pos] of chosen.entries()){
   const [cx,cy]=center(...pos),marker=element('g',{class:`deployment-marker ${de?'defense':'fire'}`,'aria-hidden':'true'});
   marker.append(element('circle',{cx,cy,r:21}),element('text',{x:cx,y:cy+5,'text-anchor':'middle'},de?'B':String(index+1)));overlay.append(marker);
  }
 }
 function sync(){
  const on=preparing()&&!lobbyMode&&!$('game').hidden;
  document.body.classList.toggle('prebattle-planning',on);panel.hidden=!on;
  if(!on){home.after(panel);$('map').querySelector('.deployment-overlay')?.remove();lastOverlay='';if(wasActive)dialog.close();wasActive=false;return;}
  wasActive=true;
  const dest=$('mobileBattleScreen')||$('experimentalDesktopScreen')||document.querySelector('.desktop-command-column');
  if(dest&&panel.parentNode!==dest)dest.append(panel);else if(!dest&&panel.previousSibling!==home)home.after(panel);
  const battleKey=state.code+':'+state.battle_number;if(key!==battleKey){key=battleKey;mode='units';lastOverlay='';}
  const d=state.deployment,de=state.side==='de',locked=d.locked[state.side],other=de?'us':'de';
  title.textContent=locked?'Plan locked':de?'Prepare your defenses':'Prepare your landing';
  plan.textContent=de?`Bunkers ${d.bunkers.length}/${d.bunker_budget}`:`Naval fire ${d.fire.length}/${d.fire_budget}`;
  units.setAttribute('aria-pressed',String(mode==='units'));plan.setAttribute('aria-pressed',String(mode==='plan'));
  const own=state.units.filter(u=>!u.carrier_id&&u.side===state.side&&controlsUnit(u));
  if(state.coop){reset.hidden=true;plan.hidden=!state.coop.captain;if(!state.coop.captain)mode='units';if(selected&&!own.some(u=>u.id===selected))selected=null;}else{reset.hidden=false;plan.hidden=false;}
  // Selecting a passenger in the regular roster selects its transport here.
  const current=state.units.find(u=>u.id===selected);if(current?.carrier_id)selected=current.carrier_id;
  const options=own.map(u=>{const passenger=state.units.find(t=>t.carrier_id===u.id);return {id:u.id,label:`${unitName(u)} · ${coord(u.pos)}${passenger?' · '+unitTypeName(passenger)+' aboard':''}`};});
  const optionKey=JSON.stringify(options);if(pick.dataset.options!==optionKey){pick.replaceChildren(new Option('Choose unit / boat…',''),...options.map(o=>new Option(o.label,o.id)));pick.dataset.options=optionKey;}
  pick.value=selected||'';pick.disabled=busy||locked||!!state.coop?.done;pick.hidden=pickLabel.hidden=mode!=='units';
  instruction.textContent=locked?'Your plan is final. You can review it while the other commander finishes.':mode==='units'?(selected?'Tap a highlighted hex to reposition. No AP cost.':'Choose a unit, then tap a highlighted hex.'):de?'Tap open ground to add a bunker; tap it again to remove. Keep one hex between bunkers.':'Tap inland hexes to aim; tap a number to remove. Keep two hexes between aim points. Enemy positions are unknown.';
  status.textContent=!state.ready?'You can prepare now. Invite the other commander from Battle.':locked?'Waiting for the other plan.':`${d.locked[other]?'Opponent ready':'Opponent preparing'} · Your plan is private`;
  lock.textContent=state.coop?(state.coop.done?'Waiting for team':'Finish my preparation'):locked?'Plan locked':'Review & lock';
  if(state.coop)status.textContent=state.coop.done?'Your placements are final. Waiting for teammates to finish.':'Place your own units. Your army captain sets bunkers / naval fire. Everyone finishes before the army plan locks.';lock.disabled=reset.disabled=!available();
  $('end').disabled=true;
  draw();
 }
 document.addEventListener('ww2:render',sync);document.addEventListener('ww2:layout',sync);document.addEventListener('ww2:busy',sync);
 // Layout owners may remove their old screen. Rescue this panel first.
 document.addEventListener('ww2:before-layout',()=>home.after(panel));
 window.ww2Deployment={get active(){return preparing();},sync};
})();
