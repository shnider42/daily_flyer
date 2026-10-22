/* Campaign presentation reads saved, public state; it never simulates rules. */
'use strict';
(()=>{
 const strip=uiNode('p','war-status');strip.id='warStatus';strip.hidden=true;strip.setAttribute('role','status');$('missionHint').after(strip);
 const manual=uiNode('section');manual.id='warManual';manual.hidden=true;$('rules').append(manual);
 const air=u=>['fighter','bomber','transport_aircraft'].includes(u.kind);
 function place(){
  if(!state?.war_version)return;
  const anchor=$('weatherBrief');
  if(anchor?.parentNode&&strip.previousElementSibling!==anchor)anchor.after(strip);
 }
 for(const event of ['ww2:render','ww2:layout','ww2:experience'])document.addEventListener(event,()=>queueMicrotask(place));
 window.renderWar=(u,legal,svg)=>{
  const on=state.war_version===1;strip.hidden=manual.hidden=!on;
  svg.querySelectorAll('.war-marker').forEach(n=>n.remove());
  if(!on){if(state.joint_ops_version)$('fubarManual').hidden=false;return;}
  place();
  const status=state.war_status,phase=status.dark?'NIGHT':'DAYLIGHT';
  strip.textContent=`${phase} · ${status.dark?'Daylight':'Night'} returns R${status.next_night} · Four day rounds / two night rounds · Aid ${state.medical_supplies}/8`;
  $('rulesetBadge').textContent='Current DSL · The War 1.0';
  $('objectiveName').textContent='THE WAR 1.0 · EIGHT FRONTS';
  $('objective').textContent=`Allies ${state.joint_score.us}/70 · Axis ${state.joint_score.de}/70`;
  $('missionHint').textContent='Hold zones: city +2, others +1. City + mountain link: +1. Destroy an enemy airfield: +3 once. Rescue a shore team: +2. First to 70.';
  $('rangeGuideToggle').hidden=false;
  $('manualAP').textContent='Use the platoon buttons to focus a front. Every unit keeps its own AP and legal orders. Ground stacking, local spotting, finite supplies and separate aircraft occupancy apply across the campaign.';
  manual.replaceChildren(uiNode('h3','','The War 1.0 · campaign guide'),...ww2Briefing.mission(state).rules.map(t=>uiNode('p','',t)));
  $('fubarManual').hidden=true;
  $('smallFrontManual').hidden=true;
  if(u){
   if(u.kind==='transport_aircraft')$('roleBrief').textContent=`Air bridge · ${state.units.filter(t=>t.drop_transport===u.id&&t.reserve&&t.hp>0).length} squads aboard · fly within 1 hex of aim · drop 3 AP`;
   else if(u.kind==='airfield')$('roleBrief').textContent=`${u.air_capacity} berths · ${u.air_stores??'private'} stores · ${u.hp*2<=u.max_hp?1:3} runway cycles per turn · launch, land, service or repair`;
   else if(u.kind==='radar')$('roleBrief').textContent=`Air search · ${status.dark?u.night_air_sight:u.sight} hexes · does not reveal distant ground. Allied fighters near a surviving field gain radar guidance.`;
   else if(u.kind==='spotlight')$('roleBrief').textContent=status.dark?'Night searchlight · aim 8 hexes for 1 AP · both armies see the lit corridor and emitter':'Searchlight crew · available when night begins';
   if(air(u)&&u.side===state.side){
    const base=state.units.find(b=>b.id===u.carrier_id),where=base?(base.kind==='carrier'?'Aboard carrier':'On airfield'):'Airborne';
    if(u.kind!=='transport_aircraft')$('roleBrief').textContent=base?`${where} · launch and service through ${base.kind==='carrier'?'Carrier air group':'Airfield operations'}`:`${u.display_name} · ${u.flight} hexes per flight leg · fuel ${u.fuel}/${u.max_fuel}${u.kind==='bomber'?` · ${u.bombs}/${u.max_bombs} loads`:''}`;
    $('selection').textContent=`${unitName(u)} · ${u.hp}/${u.max_hp} strength · ${u.ap} AP · Fuel ${u.fuel}/${u.max_fuel} · ${where}`;
    if(base&&!target)$('hint').textContent=`Open ${base.kind==='carrier'?'Carrier air group':'Airfield operations'} to launch or service. ${u.deck_cooldown||u.sortie_cooldown?'Ready next own turn.':''}`;
   }
  }
  for(const [side,positions] of Object.entries(state.scenario.war_evacuation_exits)){
   const [x,y]=center(...positions[0]),g=element('g',{class:'war-marker','aria-hidden':'true'});
   g.append(element('circle',{cx:x,cy:y,r:28,fill:'none',stroke:side==='us'?'#5b8156':'#bd9369','stroke-width':3}),element('text',{x,y:y+43,'text-anchor':'middle',class:'front-marker-label'},side===state.side?'YOUR RESCUE BUOY +2':'ENEMY RESCUE BUOY'));svg.append(g);
  }
 };
})();
