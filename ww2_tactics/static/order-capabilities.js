/* Discoverable orders, not new rules. Only public unit traits and the server's
   current legal orders are used here; never simulate a move or query hidden units. */
'use strict';
(()=>{
 const infantry=new Set(['squad','mg','leader','commander','scout','engineer','at_team','paratrooper','sniper','radioman','commando','mountain','partisan','askari','mortar','pathfinder']);
 const vehicles=new Set(['tank','halftrack','amphibious','landing_craft']);
 const labels={callAirborne:'Call airborne',markLZ:'Mark LZ',resupply:'Resupply',evacuate:'Evacuate',radioUpdate:'Share sightings',observe:'Observe',conceal:'Camouflage',mortarFire:'Mortar fire',demolition:'Demolition',breach:'Breach hedge',clearWreck:'Clear rubble',bridgeGap:'Build bridge',fire:'Fire at unit',areaFire:'Aim at hex',snipe:'Snipe',assault:'Close assault',grenade:'Grenade',suppress:'Suppress',overwatch:'Overwatch',dig:'Dig in',smoke:'Smoke',rally:'Rally self',inspire:'Rally allies',command:'Give actions',barrage:'Call mortars',artillery:'Call artillery',fieldRecon:'Recon plane',loadAP:'Load anti-tank',loadHE:'Load explosive',repairTracks:'Fix own tracks',repairTank:'Repair tank',bombard:'Blind bombard',recon:'Air search',airstrike:'Air strike',torpedo:'Torpedoes',repair:'Repair hull',airdrop:'Land troops',load:'Load troops',unload:'Unload troops',rearm:'Airfield service'};
 const costs={evacuate:1,resupply:2,callAirborne:3,markLZ:2,observe:1,smoke:1,rally:1,inspire:1,loadAP:1,loadHE:1,recon:1,load:1,unload:1,snipe:3,bridgeGap:3};
 const cost=id=>id==='radioUpdate'?(state?.units.find(u=>u.id===selected)?.kind==='radioman'?1:2):costs[id]??2;
 function capabilities(u,s=state){
  if(!u||u.side!==s.side||u.hp<=0||s.ruleset!=='dsl')return [];
  const ids=[],add=(...names)=>ids.push(...names),kind=u.kind,v=s.rules_version||1;
  if(u.range>0&&u.weapon!=='none')add('fire');
  if(s.air_version||s.joint_ops_version&&['fighter','bomber','aa_gun','radar','airfield'].includes(kind)){
   if(['fighter','aa_gun'].includes(kind))add('overwatch');
   if(['fighter','bomber'].includes(kind))add('rearm');
   if(s.combat_version&&u.protection==='infantry')add('rally');
  }else if(s.naval_version||s.joint_ops_version&&['carrier','battleship','cruiser','destroyer'].includes(kind)){
   if(['destroyer','amphibious'].includes(kind))add('smoke');
   if(kind==='amphibious'){if(s.combat_version)add('rally');}
   else add('repair');
   if(kind==='carrier')add('recon','airstrike');
   if(kind==='destroyer')add('torpedo');
  }else{
   if(v>=2){
    if(!vehicles.has(kind))add('dig');
    if(u.smoke>0||kind==='landing_craft'||(s.dsl_expansion?infantry.has(kind)&&!['mg','at_team'].includes(kind):kind==='squad'))add('smoke');
    if(infantry.has(kind)&&kind!=='mg')add('assault');
   }
   if(v>=3&&u.range>0)add('overwatch');
   if(!s.combat_version||u.protection==='infantry')add('rally');
   if(v>=4){
    if(['squad','engineer','paratrooper','commando','mountain','partisan','askari'].includes(kind))add('grenade');
    if(['mg','halftrack'].includes(kind))add('suppress');
    if(['leader','commander'].includes(kind)){
     add('inspire','command');
     if(!s.combat_version||!u.artillery_range)add('barrage');
    }
   }
   if(s.dsl_expansion){
    if(kind==='paratrooper'&&!u.airlift_reserve)add('airdrop');
    if(['halftrack','landing_craft'].includes(kind))add('load','unload');
   }
  }
  if(s.combat_version){
   if(u.ammo_options?.includes('ap'))add('loadAP');
   if(u.ammo_options?.includes('he'))add('loadHE');
   if(u.tracked)add('repairTracks');
   if(u.bombard_range)add('bombard');
   if(u.artillery_range)add('artillery');
   if(u.field_recon_range)add('fieldRecon');
   if(s.tactics_version){
    if(['ap','he','at_shell','rocket','naval_shell','bomb'].includes(u.ammo||u.weapon))add('areaFire');
    if(kind==='engineer')add('repairTank');
    if(u.snipe_range)add('snipe');
   }
  }
  if(s.fieldworks_version&&kind==='engineer')add('breach','clearWreck','bridgeGap');
  if(s.signals_version){if(['commander','radioman'].includes(kind))add('radioUpdate');if(['scout','radioman','mountain','pathfinder'].includes(kind))add('observe');if(u.stealth)add('conceal');if(u.mortar_range)add('mortarFire');if('demolition_charges' in u)add('demolition');}
  if(s.logistics_version&&kind==='supply')add('resupply');
  if(s.front_mode==='evacuation'&&kind==='landing_craft'&&u.side==='us')add('evacuate');
  if(s.airborne_version){if(u.airlift_commander)add('callAirborne');if('beacon_charges' in u)add('markLZ');}
  return [...new Set(ids)];
 }
 function reason(id,u){
  if(busy)return 'Order in progress';
  if(playbackSession)return 'Replay in progress';
  if(state.winner)return 'Battle finished';
  if(state.coop&&!controlsUnit(u))return state.coop.controllers[u.id]?'Another player controls this unit':'Computer controls this unit';
  if(state.coop?.done)return 'Your orders are finished';
  if(!state.ready)return state.coop?'Waiting for host to start':'Waiting for opponent';
  if(state.turn!==state.side)return 'Opponent’s turn';
  if(state.order_history?.redo_required)return 'Redo rolled order first';
  if(u.airlift_reserve)return 'Awaiting commander airlift';
  if(u.afloat&&!['rally','load','unload'].includes(id))return 'Swim ashore first';
  if(id==='markLZ'&&u.beacon_active)return 'Beacon already active';
  if(id==='markLZ'&&!u.beacon_charges)return 'No beacons left';
  if(id==='callAirborne'&&state.airlift_round===state.round)return 'Airlift used this round';
  if(id==='callAirborne'&&!state.units.some(v=>v.side===u.side&&v.hp>0&&v.airlift_reserve&&v.reserve))return 'No airborne reserves left';
  if(u.carrier_id)return 'Aboard transport';
  if(u.reserve&&u.arrival_round)return 'Arrives R'+u.arrival_round+' · entry must be clear';
  if(u.reserve&&id!=='airdrop')return 'Land troops first';
  if(u.pinned&&id!=='rally')return 'Rally this unit first';
  if(id==='resupply'&&!u.supply_packs)return 'No supply packs left';
  if(id==='evacuate'&&!state.units.some(v=>v.carrier_id===u.id&&v.hp>0&&v.evacuee))return 'Load marked infantry first';
  if(id==='evacuate'&&!state.scenario.evacuation_exits?.some(p=>p[0]===u.pos[0]&&p[1]===u.pos[1]))return 'Sail to the top sea edge';
  if(id==='radioUpdate'&&u.radio_round===state.round)return 'Already sent this round';
  if(id==='observe'&&u.observing)return 'Already observing';
  if(id==='conceal'&&u.camouflaged)return 'Already camouflaged';
  if(id==='mortarFire'&&!u.shells)return 'No shells left';
  if(id==='mortarFire'&&u.mortar_round===state.round)return 'Already fired this round';
  if(id==='demolition'&&!u.demolition_charges)return 'No charges left';
  if(id==='rally'&&!u.pinned)return 'Not pinned';
  if(id==='dig'&&u.entrenched)return 'Already dug in';
  if(id==='overwatch'&&u.overwatch)return 'Already watching';
  if(id==='repairTracks'&&!u.immobilized)return 'Tracks operational';
  if(id==='loadAP'&&u.ammo==='ap'||id==='loadHE'&&u.ammo==='he')return 'Already loaded';
  if(id==='airdrop'&&!u.reserve)return 'Already deployed';
  const supply={smoke:'smoke',grenade:'grenades',repairTank:'repair_kits',torpedo:'torpedoes',repair:'repairs',barrage:null,artillery:'artillery_charges',fieldRecon:'field_recon_charges'};
  if(id in supply&&!(id==='barrage'?state.support?.[state.side]:u[supply[id]]))return {smoke:'No smoke left',grenade:'No grenades left',repairTank:'No repair kits left',torpedo:'No torpedoes left',repair:'No repairs left',barrage:'No mortar calls left'}[id]||'No calls left';
  const support={artillery:'artillery',fieldRecon:'field_recon'}[id];
  if(support&&u.cooldowns?.[support]>state.round)return 'Ready R'+u.cooldowns[support];
  if(({recon:u.recon_used,airstrike:u.air_used,torpedo:u.torpedo_used,repair:u.repair_used,rearm:u.rearm_used})[id])return 'Used this turn';
  if(u.kind==='bomber'&&['fire','areaFire'].includes(id)&&!u.bombs)return 'Reload at airfield';
  if(!['load','unload'].includes(id)&&u.ap<cost(id))return `Needs ${cost(id)} AP`;
  if(['fire','grenade','assault','suppress','airstrike','torpedo'].includes(id))return target?'No legal attack on target':'Select a visible enemy';
  if(id==='resupply')return 'Needs adjacent mortar or engineer below capacity';
  if(id==='radioUpdate')return 'No recent reports to share';
  if(id==='conceal')return 'Needs cover terrain';
  if(id==='mortarFire')return `Needs spotted or reported hex at range 2–${u.mortar_range||8}`;
  if(id==='demolition')return 'Needs adjacent spotted armor';
  if(id==='bridgeGap')return u.bridge_kits?'Needs a one-hex gap with firm banks':'No bridge kits left';
  if(id==='breach')return 'Needs adjacent bocage';
  if(id==='clearWreck')return 'Needs adjacent collapsed building';
  if(id==='snipe')return 'Needs a visible firing lane';
  if(id==='repairTank')return 'Needs adjacent damaged tank';
  if(id==='repair')return 'Hull at full strength';
  if(id==='rearm')return u.hp===u.max_hp&&(u.kind!=='bomber'||u.bombs>=2)?'Fully serviced':'Needs friendly airfield';
  if(id==='inspire')return 'No nearby allies pinned';
  if(id==='command')return state.command_used?.includes(u.side+':'+(u.kind==='commander'?'HQ-orders':u.platoon||''))?'Command used this turn':'Needs eligible nearby troops';
  if(id==='load')return state.units.some(p=>p.carrier_id===u.id&&p.hp>0)?'Transport occupied':'Needs ready adjacent infantry';
  if(id==='unload')return state.units.some(p=>p.carrier_id===u.id&&p.hp>0)?'Needs exit & passenger AP':'No troops aboard';
  if(id==='airdrop')return 'Needs spotted open ground';
  return 'No legal hex right now';
 }
 window.unitOrderCapabilities=capabilities;
 window.renderOrderCapabilities=(u)=>{
  for(const b of document.querySelectorAll('[data-order-id]')){b.removeAttribute('aria-disabled');b.classList.remove('order-unavailable');delete b.dataset.orderReason;delete b.dataset.orderId;}
  // Classic retains its original, target-specific command controls.
  if(state.ruleset!=='dsl')return;
  const ids=capabilities(u),command=$('commandOrders');
  if(ids.includes('command')&&!command.querySelector('button')){
   const b=document.createElement('button');b.hidden=true;command.append(b);
   b.onclick=()=>act({kind:'command',unit:selected});
  }
  let activeMode=null;
  for(const id of ids){const b=id==='command'?command.querySelector('button'):$(id);if(b&&!b.hidden&&b.textContent.startsWith('Cancel'))activeMode=id;}
  for(const id of ids){
   const b=id==='command'?command.querySelector('button'):$(id);if(!b)continue;
   const available=!b.hidden&&!b.disabled&&!b.closest('[hidden]');
   const blocked=!!state.order_history?.redo_required||!!activeMode&&activeMode!==id;
   const why=blocked?(state.order_history?.redo_required?'Redo rolled order first':'Finish or cancel targeting'):available?'':reason(id,u);
   const cancel=activeMode===id;
   b.hidden=false;if(id==='command')command.hidden=false;
   b.disabled=busy||!!playbackSession;
   b.dataset.orderReason=why;b.dataset.orderId=id;
   b.setAttribute('aria-disabled',String(!!why));b.classList.toggle('order-unavailable',!!why);
   b.textContent=cancel?'Cancel '+labels[id].toLowerCase():`${labels[id]} · ${cost(id)} AP`;
  }
 };
 // aria-disabled keeps explanations keyboard-accessible. Block mouse, touch and
 // keyboard-generated clicks before any existing order handler can run.
 document.addEventListener('click',e=>{
  const b=e.target.closest('button[data-order-id][aria-disabled="true"]');
  if(!b)return;e.preventDefault();e.stopImmediatePropagation();
  $('hint').textContent=`${labels[b.dataset.orderId]}: ${b.dataset.orderReason}. ${window.orderHelp?.(b.dataset.orderId,state.units.find(u=>u.id===selected),state.legal[selected],true)||''}`;
 },true);
})();
