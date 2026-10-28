/* Airfield manifests and fuel planning; orders remain server-authoritative. */
'use strict';
(()=>{
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const level=()=>window.ww2Experience?.level||'simple';
 const depth=(simple,moderate,expert=moderate)=>({simple,moderate,expert})[level()];
 const rulesOpen=new Map();
 function runwayRules(unit){
  const rules=node('details');rules.id='airfieldRunwayRules';rules.open=rulesOpen.get(unit.id)??level()==='expert';
  const heading=node('summary','Full runway costs and readiness');heading.onclick=()=>rulesOpen.set(unit.id,!rules.open);
  rules.append(heading,node('p','Launch, land and service each use one cycle. Leave capacity for returning flights. Repairs restore runway capacity.'),node('p','Launch costs 1 field AP, 1 flight AP and 1 fuel. Land costs 1 flight AP and does not refuel or reload. Service costs 1 field AP and 1 store; it repairs, refuels and reloads. A landed or serviced flight is ready next own turn. Repair station costs 2 field AP, 1 store and 1 runway cycle.'));
  return rules;
 }
 const air=u=>['fighter','bomber','transport_aircraft'].includes(u.kind),limit=f=>f.hp*2<=f.max_hp?1:3;
 const grounded=f=>state.units.filter(u=>u.hp>0&&u.carrier_id===f.id);
 let launching=null;
 const dialog=node('dialog');dialog.id='britainAirfieldDialog';dialog.setAttribute('aria-labelledby','britainAirfieldTitle');
 const close=node('button','Back to map');close.type='button';close.onclick=()=>dialog.close();
 const title=node('h2','Airfield operations');title.id='britainAirfieldTitle';
 const content=node('div');content.id='britainAirfieldContent';dialog.append(close,title,content);document.body.append(dialog);
 const open=node('button','Airfield operations');open.id='airfieldGroupOpen';open.type='button';open.hidden=true;
 open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-controls',dialog.id);
 open.dataset.help='Launch finite flights, land, refuel, rearm and repair. Check runway cycles and service stores.';
 $('nextUnit').before(open);
 open.onclick=()=>{
  const u=state.units.find(u=>u.id===selected),field=u?.carrier_id&&state.units.find(f=>f.id===u.carrier_id&&f.kind==='airfield');
  if(!(state.britain_ops_version||state.field_ops_version)||!u||u.hp<=0||!(u.kind==='airfield'||air(u)))return;
  if(field)chooseUnit(field);
  for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
  if(!dialog.open)dialog.showModal();
 };
 const manual=node('section');manual.id='britain2Manual';manual.hidden=true;$('rules').append(manual);
 const warning=node('p');warning.id='britainFuelWarning';warning.hidden=true;warning.setAttribute('role','status');$('hint').after(warning);
 function blocked(){return busy||!!playbackSession||!state.ready||!!state.winner||state.turn!==state.side||!!state.coop?.done||!!state.order_history?.redo_required;}
 function button(label,key,id,fn,disabled=false,reason=''){
  const b=node('button',label);b.type='button';b.dataset[key]=id;b.disabled=disabled;b.title=reason||label;b.onclick=fn;return b;
 }
 function reason(f,p){
  if(!controlsUnit(f))return 'Another commander controls this airfield';
  if(blocked())return state.turn!==state.side?'Opponent’s turn':'Orders unavailable';
  if(state.weather?.current.launch_limit!==null&&state.weather?.current.launch_limit!==undefined&&(f.weather_launches||0)>=state.weather.current.launch_limit)return 'Rain: launch limit reached this turn';
  if(f.runway_used>=limit(f))return 'No runway cycles left this turn';
  if(f.ap<1)return 'Airfield needs 1 AP';
  if(p.sortie_cooldown)return 'Ready next own turn';
  if(p.fuel<2)return 'Refuel before takeoff';
  return p.ap<1?'Flight needs 1 AP':'Clear a takeoff hex';
 }
 window.britainRole=u=>{
  if(u.kind==='airfield')return `${limit(u)} runway cycles/turn · ${u.air_stores??'private'} service stores · six berths · open Airfield operations`;
  if(u.kind==='radar')return 'CHAIN HOME · detects aircraft within 7 hexes. RAF fighters within 8 hexes of a surviving sector station gain −1 to hit against radar-tracked targets.';
  if(u.kind==='aa_gun')return 'Fixed AA · range 3 · 2 damage · 2 AP to fire or prepare one interception';
  if(u.carrier_id)return 'ON THE GROUND · open Airfield operations to launch or service. No spotting or fighting until airborne.';
  const specialty={spitfire:'Fighter interception · base 4+ against aircraft',hurricane:'Bomber interception · base 3+ vs bombers, 5+ vs fighters',bf109:'Fast escort · base 4+ · 2 damage · protects bombers within 2 hexes · shorter endurance'}[u.britain_role];
  return `${u.flight} hexes/leg · ${u.fuel??'private'}/${u.max_fuel} fuel · ${specialty||`Bombing · 3+ · ${u.weapon_overrides?.bomb?.damage} damage · ${u.bombs}/${u.max_bombs} loads`}`;
 };
 document.addEventListener('ww2:cancel-targeting',()=>{launching=null;});
 window.renderBritain=(unit,legal,svg)=>{
  svg.querySelectorAll('.britain-launch-choice').forEach(n=>n.remove());open.hidden=true;warning.hidden=true;content.replaceChildren();
  manual.hidden=!state.britain_ops_version;
  $('campaignManual').hidden=!!state.britain_ops_version;
  if(!state.britain_ops_version&&!state.field_ops_version){launching=null;dialog.close();return;}
  const war=!!state.war_version;
  if(!war||unit&&(air(unit)||unit.kind==='airfield')){$('viewTransport').hidden=true;$('rearm').hidden=true;}
  if(!war){
  $('objectiveName').textContent='NO. 11 GROUP · AIR DEFENSE NETWORK';
  $('objective').textContent=`Raid damage ${state.raid_score}/9 · stations lost ${state.raid_destroyed.length}/2`;
  $('missionHint').textContent=state.side==='us'?'Keep raid damage below 9 through round 18, or destroy every bomber. Protect your stations and radar.':'Inflict 9 new damage on RAF stations/radar, or destroy both stations, before round 18 ends.';
  $('manualAP').textContent='Flight: 1 AP + 1 fuel per leg; attacks/interception: 2 AP. Launch: 1 field AP + 1 flight AP + 1 fuel. Land: 1 flight AP. Service: 1 field AP + 1 store. Launch, land and service share runway cycles. Airborne own-turn end burns 1 fuel; zero then loses the flight.';
  manual.replaceChildren(node('h3','Battle of Britain 2.0 · defend the network'),node('p',state.scenario.historical_note),node('p',state.scenario.doctrine.us),node('p',state.scenario.doctrine.de),node('p',state.scenario.reinforcement_brief));
  for(const [i,mark] of [...svg.querySelectorAll('.station-mark')].entries()){
   const name=i===0?'RAF KENLEY':'RAF BIGGIN HILL',pos=state.scenario.airfields.us[i];
   mark.textContent=name+(state.raid_destroyed.some(p=>p[0]===pos[0]&&p[1]===pos[1])?' · LOST':'');
  }
  }
  if(launching&&(launching.unit!==selected||launching.revision!==state.revision||blocked()))launching=null;
  if(unit?.hp>0&&(unit.kind==='airfield'||air(unit)&&(!unit.carrier_id||state.units.some(f=>f.id===unit.carrier_id&&f.kind==='airfield')))){
   open.hidden=false;open.disabled=busy||!!playbackSession;
   open.textContent=unit.kind==='airfield'?'Airfield · launch & service':unit.carrier_id?'Open home airfield':'Land / airfield recovery';
   title.textContent=unit.kind==='airfield'?unit.display_name:'Return to an airfield';
  }else dialog.close();
  if(unit){
   if(!war)$('roleBrief').textContent=britainRole(unit);
   if(air(unit)){
    const own=unit.side===state.side;
    $('selection').textContent=`${unitName(unit)} · ${unit.hp}/${unit.max_hp} strength · ${unit.ap} AP${own?` · Fuel ${unit.fuel}/${unit.max_fuel}`:''}${unit.carrier_id?' · On ground':''}`;
    if(!target)$('hint').textContent=unit.carrier_id?'Open the airfield to launch or service this flight.':`Fly up to ${unit.flight} hexes for 1 AP + 1 fuel. Save 1 AP to land within one hex of your field.`;
    const meters=$('unitMechanics').querySelector('.unit-meters');$('unitMechanics').replaceChildren();if(meters)$('unitMechanics').append(meters);
    if(!war)$('unitMechanics').append(node('p',britainRole(unit)));
    $('unitMechanics').append(node('p','Each airborne own-turn ending burns 1 fuel. A flight reaching zero then is lost. Landing itself uses no fuel; service restores it.'));
    if(own&&!unit.carrier_id&&unit.fuel<=3){warning.hidden=false;warning.textContent=unit.fuel<=1?'FUEL CRITICAL · land before ending this turn or this flight will be lost.':`LOW FUEL · ${unit.fuel} left. Plan your return now; reserve 1 AP and a runway cycle for landing.`;}
    if(unit.carrier_id){
     const field=state.units.find(f=>f.id===unit.carrier_id);
     if(field?.kind==='airfield')content.append(button(`Open ${field.display_name}`,'britainField',field.id,()=>chooseUnit(field)));
    }else{
     content.append(node('p','Land within one hex: 1 flight AP + one field runway cycle. Landing does not refuel or reload. Service after landing; take off next own turn.'));
     const fields=state.units.filter(f=>f.kind==='airfield'&&f.side===state.side&&f.hp>0);
     for(const f of fields)content.append(button(`Land at ${f.display_name}`,'landField',f.id,()=>act({kind:'land',unit:unit.id,target:f.id}),blocked()||!legal?.land?.includes(f.id),'Needs 1 flight AP, nearby clear airspace, a free berth, runway cycle and your command group.'));
     if(!legal?.land?.length)content.append(node('p','No landing currently available. Fly within one hex, keep 1 AP and leave a runway cycle free. In co-op, use your own command group’s field.'));
    }
   }
   if(unit.kind==='airfield'){
    if(unit.side!==state.side){content.append(node('p','Enemy aircraft manifests, runway use and service stores are private.'));}
    else{
     const available=Math.max(0,limit(unit)-unit.runway_used);
     const decision=node('p',depth('Simple · Choose a ready flight to launch, or service one that needs repair, fuel or bombs. Each uses one runway action. Keep an action free for returning flights; takeoff also uses 1 fuel.','Moderate · Plan the runway before launching. A returning flight needs 1 flight AP and a free runway cycle. Landing does not refuel or reload; service is separate and makes the flight ready next own turn.','Expert · Finite flights, fuel, runway cycles, service stores and next-turn readiness.'));decision.id='airfieldDecision';content.append(decision);
     content.append(node('p',depth(`${grounded(unit).length} aircraft on the ground. ${available} runway actions left this turn; ${unit.air_stores} service stores.${limit(unit)===1?' Damaged runway: only one action per turn.':''}`,`${grounded(unit).length}/${unit.air_capacity} on ground · ${available}/${limit(unit)} runway cycles · ${unit.air_stores}/${unit.max_air_stores} service stores${limit(unit)===1?' · DAMAGED RUNWAY':''}`)));
     content.append(runwayRules(unit));
     content.append(button('Repair station · 2 AP + store','repairStation',unit.id,()=>act({kind:'station_repair',unit:unit.id}),blocked()||!legal?.station_repair,'Requires damage, 2 field AP, one store and one unused runway cycle.'));
     const flights=state.units.filter(p=>air(p)&&(p.home_field===unit.id||p.carrier_id===unit.id));
     for(const p of flights){
      const row=node('section');row.className='britain-flight';row.dataset.flightId=p.id;
      const here=p.hp>0&&p.carrier_id===unit.id;
      const status=p.hp<=0?'LOST':here?(p.sortie_cooldown?'ON GROUND · ready next turn':'ON GROUND'):p.carrier_id?'DIVERTED':'AIRBORNE';
      row.append(node('strong',p.display_name),node('small',`${status} · ${p.hp}/${p.max_hp} strength · Fuel ${p.fuel}/${p.max_fuel}${p.kind==='bomber'?` · Bombs ${p.bombs}/${p.max_bombs}`:''}`));
      const actions=node('div');actions.className='britain-flight-actions';
      if(here){
       const canLaunch=legal?.scramble?.some(c=>c.id===p.id),canService=legal?.field_service?.includes(p.id);
       actions.append(button(launching?.plane===p.id?'Cancel takeoff':depth('Launch · 1 field + 1 flight AP','Launch · 1 + 1 AP'),'scrambleFlight',p.id,()=>{launching=launching?.plane===p.id?null:{unit:unit.id,plane:p.id,revision:state.revision};dialog.close();target=null;combatMode=null;smokeMode=false;barrageMode=false;render();},blocked()||!canLaunch,canLaunch?'Choose a highlighted takeoff hex':reason(unit,p)));
       const serviceReason=!unit.air_stores?'No stores left':p.service_used?'Already serviced this turn':'Requires damage, spent fuel or bombs, 1 field AP and a runway cycle';
       actions.append(button(depth('Service · 1 field AP + 1 store','Service · 1 AP + store'),'serviceFlight',p.id,()=>act({kind:'field_service',unit:unit.id,target:p.id}),blocked()||!canService,canService?'Repair, refuel and reload; ready next own turn':serviceReason));
       if(!canLaunch)row.append(node('small',reason(unit,p)));
       if(!canService)row.append(node('small','Service: '+serviceReason));
      }else if(p.hp>0)actions.append(button('Select flight','selectFlight',p.id,()=>{dialog.close();chooseUnit(p);},busy||!!playbackSession));
      row.append(actions);content.append(row);
     }
     if(!target)$('hint').textContent='Open Airfield operations to launch, service or repair. Runway cycles also cover landing; leave room for returning flights.';
    }
   }
  }
  if(launching){
   const choice=legal?.scramble?.find(c=>c.id===launching.plane);if(!choice){launching=null;return;}
   $('hint').textContent='Tap a highlighted takeoff hex · 1 field AP + 1 flight AP + 1 fuel + one runway cycle. Interception may fire.';
   for(const dest of choice.destinations){
    const [x,y]=center(...dest.pos),points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${x+30*Math.cos(a)},${y+30*Math.sin(a)}`;}).join(' ');
    const tile=element('polygon',{points,class:'recon-choice britain-launch-choice',role:'button',tabindex:0,'aria-label':`Take off at ${hexColumn(dest.pos[0])}${dest.pos[1]+1}`});
    activate(tile,async()=>{const flight=launching;launching=null;await act({kind:'scramble',unit:flight.unit,target:flight.plane,pos:dest.pos});const p=state.units.find(u=>u.id===flight.plane);if(p?.hp>0&&!p.carrier_id)chooseUnit(p);});svg.append(tile);
   }
  }
 };
})();
