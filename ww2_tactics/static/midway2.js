/* Finite carrier manifests and deck orders, driven only by public legal state. */
'use strict';
(()=>{
 const air=u=>['fighter','bomber'].includes(u.kind);
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let launching=null;
 const dialog=node('dialog');dialog.id='carrierAirGroupDialog';dialog.setAttribute('aria-labelledby','carrierAirGroupTitle');
 const close=node('button','Back to map');close.id='carrierAirGroupClose';close.onclick=()=>dialog.close();
 const title=node('h2','Carrier air group');title.id='carrierAirGroupTitle';
 const content=node('div');content.id='carrierAirGroupContent';dialog.append(close,title,content);document.body.append(dialog);
 const open=node('button','Carrier air group');open.id='carrierGroupOpen';open.hidden=true;$('nextUnit').before(open);
 open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-controls','carrierAirGroupDialog');
 open.dataset.help='Open the finite aircraft manifest to launch, land or service. These use shared carrier deck cycles.';
 open.onclick=()=>{const u=state.units.find(u=>u.id===selected),cv=u?.carrier_id&&state.units.find(c=>c.id===u.carrier_id);if(cv)chooseUnit(cv);for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();if(!dialog.open)dialog.showModal();};
 const limit=cv=>cv.hp*2<=cv.max_hp?1:2;
 const aboard=cv=>state.units.filter(u=>u.hp>0&&u.carrier_id===cv.id);
 function blocked(){return busy||!!playbackSession||!state.ready||!!state.winner||state.turn!==state.side||!!state.coop?.done||!!state.order_history?.redo_required;}
 function button(text,attr,id,handler,disabled=false,reason=''){
  const b=node('button',text);b.type='button';b.dataset[attr]=id;b.disabled=disabled;b.title=reason||text;
  b.onclick=handler;return b;
 }
 function readyReason(cv,p,service=false){
  if(!controlsUnit(cv))return 'This carrier belongs to another commander';
  if(blocked())return state.turn!==state.side?'Opponent’s turn':'Orders unavailable right now';
  if(cv.deck_used>=limit(cv))return 'All deck cycles used this turn';
  if(cv.ap<1)return 'Carrier needs 1 AP';
  if(service)return !cv.air_stores?'No service stores left':p.service_used?'Serviced this turn':'Fully repaired and loaded';
  return p.deck_cooldown?'Ready at your next turn':p.ap<1?'Aircraft needs 1 AP':'Launch airspace must be clear';
 }
 window.midwayRole=u=>{
  if(u.kind==='carrier')return `${u.display_name} · ${u.air_capacity} aircraft berths · ${u.air_stores??'private'} service stores · ${limit(u)} deck cycles/turn${u.hp*2<=u.max_hp?' · damaged deck':''}`;
  if(air(u))return u.carrier_id?'ABOARD · select the carrier to launch or service. Cannot spot or fight in the hangar.':
   u.kind==='fighter'?`${u.flight} hexes/flight AP · fighter interception · land within 1 hex of a friendly carrier`:
   `${u.variant==='torpedo_bomber'?'Torpedo':'Dive-bomb'} attack · range ${u.range} · ${u.attack_threshold}+${u.variant==='torpedo_bomber'?' (+1 vs destroyers)':''} · ${u.weapon_overrides[u.weapon].damage} hull damage · ${u.bombs}/1 load · land to service`;
  return u.kind==='cruiser'?`Escort AA: ${u.ship_aa_range} hexes · ${u.weapon_overrides.flak.damage} aircraft damage · ${u.torpedo_launcher?'Japanese long-range torpedoes':'US fleet screen'}`:
   `Destroyer screen · ${u.base_ap} AP · ${u.torpedoes} torpedo salvos · ${u.ship_aa_range}-hex AA`;
 };
 document.addEventListener('ww2:cancel-targeting',()=>{launching=null;});
 window.renderMidway=(unit,legal,svg)=>{
  svg.querySelectorAll('.midway-launch-choice,.midway-deck-badge').forEach(n=>n.remove());
  open.hidden=true;content.replaceChildren();
  const backport=state.carrier_decks_version===1;
  if(!state.midway_ops_version&&!backport){launching=null;dialog.close();return;}
  $('viewTransport').hidden=true; // Aircraft use the carrier panel, not half-track controls.
  if(unit&&unit.hp>0&&(unit.kind==='carrier'||air(unit))){
   open.hidden=false;open.disabled=busy||!!playbackSession;
   open.textContent=unit.kind==='carrier'?`Air group · ${aboard(unit).length}/${unit.air_capacity} aboard`:unit.carrier_id?'Open carrier air group':'Land / carrier recovery';
   title.textContent=unit.kind==='carrier'?unit.display_name+' · air group':'Carrier recovery';
  }else dialog.close();
  if(!backport){
  const score=state.joint_score;
  $('rulesetBadge').textContent='DSL · Midway 2.0 · daytime carrier battle';
  $('objectiveName').textContent='MIDWAY 2.0 · CARRIERS & SEA CONTROL';
  $('objective').textContent=`US ${score.us}/12 · Japan ${score.de}/12`;
  $('missionHint').textContent='Sink all enemy carriers OR reach 12 points. Ships hold three sea lanes; each uncontested lane scores +1 at your turn end. Aircraft cannot capture.';
  $('manualAP').textContent='Daytime sight, fixed starting positions, one ship and one airborne flight per hex. Aircraft in hangars do not spot, attack or occupy airspace. Deck cycles are separate from AP and refresh on your own turn.';
  $('supportStatus').hidden=true;
  const manual=$('fubarManual'),paragraphs=manual?.querySelectorAll('p');
  if(manual){manual.querySelector('h3').textContent='Midway 2.0 · finite carrier air groups';paragraphs[0].textContent=state.scenario.historical_note;paragraphs[1].textContent=state.scenario.brief;paragraphs[2].textContent=state.scenario.reinforcement_brief;}
  }
  if(launching&&(launching.unit!==selected||launching.revision!==state.revision||blocked()))launching=null;
  if(unit){
   $('roleBrief').textContent=backport?(unit.kind==='carrier'?`${unit.display_name} · ${unit.air_capacity} aircraft berths · ${unit.air_stores??'private'} service stores · ${limit(unit)} deck cycles/turn`:air(unit)&&unit.carrier_id?'ABOARD · open the carrier air group to launch or service':unitRoleSummary(unit)):midwayRole(unit);
   if(air(unit)&&unit.carrier_id){
    const cv=state.units.find(u=>u.id===unit.carrier_id);
    $('selection').textContent=`${unitName(unit)} · Aboard ${cv?.display_name||'carrier'} · ${unit.hp}/${unit.max_hp} strength`;
    $('hint').textContent='Aircraft aboard do not spot or fight. Open the carrier’s air group to launch or service.';
    if(cv)content.append(button(`Open ${cv.display_name} air group`,'midwayCarrier',cv.id,()=>chooseUnit(cv)));
   }else if(air(unit)){
    const section=node('section');section.className='midway-recovery';section.append(node('h4','Carrier recovery'));
    for(const uid of legal?.recover||[]){const cv=state.units.find(u=>u.id===uid);section.append(button(`Land on ${cv.display_name} · 1 aircraft AP + 1 deck cycle`,'recoverCarrier',uid,()=>act({kind:'recover',unit:unit.id,target:uid}),blocked()));}
    if(!legal?.recover?.length)section.append(node('p',unit.ap<1?'Needs 1 aircraft AP to land.':'Fly within 1 hex of a friendly carrier in your command group. It needs a free berth, unused deck cycle and clear airspace.'));
    content.append(section);
   }
   if(unit.kind==='carrier'){
    const panel=node('section');panel.id='carrierAirGroup';panel.className='midway-air-group';panel.setAttribute('aria-label',unit.display_name+' air group');
    panel.append(node('h4',unit.display_name+' · air group'));
    const privateDeck=backport&&unit.side!==state.side;
    if(privateDeck)panel.append(node('p','Enemy deck readiness, service stores and aircraft manifest are private.'));
    else{
    const available=Math.max(0,limit(unit)-unit.deck_used);
    panel.append(node('p',`${aboard(unit).length}/${unit.air_capacity} aboard · ${available}/${limit(unit)} deck cycles remaining · ${unit.air_stores}/${unit.max_air_stores} service stores${limit(unit)===1?' · HALF-HULL: reduced deck throughput':''}`));
    panel.append(node('p','Launch: 1 carrier AP + 1 flight AP. Land: 1 flight AP. Service: 1 carrier AP + 1 store. Each uses one deck cycle; land/service means ready next turn.'));
    const flights=state.units.filter(p=>air(p)&&(p.home_carrier===unit.id||p.carrier_id===unit.id));
    for(const p of flights){
     const row=node('div');row.className='midway-flight';row.dataset.flightId=p.id;
     const onBoard=p.carrier_id===unit.id&&p.hp>0,location=state.units.find(c=>c.id===p.carrier_id);
     const status=p.hp<=0?'LOST':onBoard?(p.deck_cooldown?'ABOARD · ready next turn':'ABOARD · ready'):p.carrier_id?`Diverted to ${location?.display_name||'carrier'}`:'AIRBORNE';
     const heading=node('div');heading.className='midway-flight-heading';
     const portrait=window.makeUnitPortrait?.(p);if(portrait)heading.append(portrait);
     const summary=node('div');summary.className='midway-flight-summary';
     summary.append(node('strong',unitName(p)),node('small',`${status} · ${p.hp}/${p.max_hp} strength${p.kind==='bomber'?` · ${p.bombs}/${p.max_bombs} load`:''}`));
     heading.append(summary);row.append(heading);row.classList.toggle('midway-flight-lost',p.hp<=0);
     const actions=node('div');actions.className='midway-flight-actions';
     if(onBoard){
      const launch=legal?.launch?.find(c=>c.id===p.id),service=legal?.deck_service?.includes(p.id);
      const launchReason=readyReason(unit,p),serviceReason=readyReason(unit,p,true);
      actions.append(button(launching?.plane===p.id?'Cancel launch':'Launch · 1 + 1 AP','launchPlane',p.id,()=>{launching=launching?.plane===p.id?null:{unit:unit.id,plane:p.id,revision:state.revision};dialog.close();target=null;combatMode=null;smokeMode=false;barrageMode=false;render();},!launch||blocked(),launch?'Choose a highlighted launch hex':launchReason));
      actions.append(button('Service · 1 AP + store','servicePlane',p.id,()=>act({kind:'deck_service',unit:unit.id,target:p.id}),!service||blocked(),service?'Repair, reload, and prepare for next turn':serviceReason));
      if(!launch)row.append(node('small',launchReason));
     }else if(p.hp>0)actions.append(button('Select aircraft','selectPlane',p.id,()=>{dialog.close();chooseUnit(p);},busy||!!playbackSession));
     row.append(actions);panel.append(row);
    }
    }
    content.append(panel);
    $('hint').textContent='Choose a flight in the air group to launch or service. Return aircraft to the deck to reload; no replacements.';
   }
  }
  const own=state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter));
  [...$('roster').children].forEach((b,i)=>{const u=own[i];if(!u)return;b.textContent=`${unitCodes[u.kind]} ${u.platoon}${u.number} · ${u.hp<=0?'Lost':air(u)?u.carrier_id?'Aboard':'Airborne':`${u.hp}/${u.max_hp} hull`} · ${u.hp>0?u.ap+' AP':''}`;});
  for(const cv of state.units.filter(u=>u.side===state.side&&u.kind==='carrier'&&u.hp>0)){
   const counter=svg.querySelector(`.unit[data-unit-id="${cv.id}"]`);if(!counter)continue;
   const [x,y]=center(...cv.pos);counter.append(element('text',{x,y:y+30,'text-anchor':'middle',class:'midway-deck-badge','aria-hidden':'true'},`${aboard(cv).length}/${cv.air_capacity} aboard`));
  }
  if(launching){
   const choice=legal?.launch?.find(c=>c.id===launching.plane);
   if(!choice){launching=null;return;}
   $('hint').textContent='Tap a highlighted launch hex · 1 carrier AP + 1 aircraft AP + 1 deck cycle. Enemy interception may fire.';
   for(const d of choice.destinations){
    const [x,y]=center(...d.pos),points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${x+30*Math.cos(a)},${y+30*Math.sin(a)}`;}).join(' ');
    const tile=element('polygon',{points,class:'recon-choice midway-launch-choice',role:'button',tabindex:0,'aria-label':`Launch at ${hexColumn(d.pos[0])}${d.pos[1]+1}`});
    activate(tile,async()=>{const flight=launching;launching=null;await act({kind:'launch',unit:flight.unit,target:flight.plane,pos:d.pos});const plane=state.units.find(u=>u.id===flight.plane);if(plane?.hp>0&&!plane.carrier_id)chooseUnit(plane);});svg.append(tile);
   }
  }
 };
 // The shared manual refreshes after render; restore this map's own briefing.
 document.addEventListener('ww2:render',()=>{
  if(!state?.midway_ops_version)return;const manual=$('fubarManual'),p=manual.querySelectorAll('p');
  manual.querySelector('h3').textContent='Midway 2.0 · finite carrier air groups';
  p[0].textContent=state.scenario.historical_note;p[1].textContent=state.scenario.brief;p[2].textContent=state.scenario.reinforcement_brief;
 });
})();
