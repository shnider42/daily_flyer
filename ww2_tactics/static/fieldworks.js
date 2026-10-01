/* Shared engineering controls; every destination comes from server legality. */
'use strict';
(()=>{
 let mode=null;
 const definitions=[['breach','breach','Breach hedge',2],['clearWreck','clear_wreck','Clear rubble',2],['bridgeGap','bridge_gap','Build bridge',3]];
 const controls={};
 for(const [id,kind,label,cost] of definitions){
  const b=uiNode('button');b.id=id;b.type='button';b.hidden=true;$('nextUnit').before(b);controls[kind]=b;
  b.onclick=()=>{const cancel=mode?.kind===kind;document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=false;barrageMode=false;combatMode=null;target=null;mode=cancel?null:{kind,unit:selected,revision:state.revision};render();};
 }
 document.addEventListener('ww2:cancel-targeting',()=>mode=null);
 window.fieldworksPicking=legal=>{if(mode&&(mode.unit!==selected||mode.revision!==state.revision||smokeMode||barrageMode||combatMode||!legal?.[mode.kind]?.length))mode=null;return !!mode;};
 function markers(svg,snapshot=state){
  svg.querySelectorAll('.linked-marker').forEach(n=>n.remove());
  for(const p of state.scenario.linked_objectives||[]){
   const [x,y]=center(...p.pos),side=snapshot.objective_control?.[p.id],g=element('g',{class:'linked-marker '+(side||'neutral'),'aria-hidden':'true'});
   g.append(element('circle',{cx:x,cy:y,r:29}),element('text',{x,y:y-32,'text-anchor':'middle'},p.id==='town'?'★ TOWN':p.id==='west'?'W EXIT':'E EXIT'));
   svg.append(g);
  }
 }
 window.renderFieldworks=(u,legal,svg)=>{
  for(const b of Object.values(controls))b.hidden=true;
  if(!state.fieldworks_version)return;
  window.fieldworksPicking(legal);
  for(const [,kind,label,cost] of definitions){const b=controls[kind];b.hidden=u?.kind!=='engineer';b.disabled=busy||!legal?.[kind]?.length;b.textContent=mode?.kind===kind?'Cancel '+label.toLowerCase():`${label} · ${cost} AP`;}
  if(u?.reserve&&u.arrival_round)$('hint').textContent=`Reinforcements arrive at your turn start in round ${u.arrival_round}. The entry hex must be empty; a blocked entry waits. This unit cannot act before arrival.`;
  if(u?.kind==='engineer')$('unitMechanics').append(uiNode('p','mechanics-caption',`Engineering: breach hedges or clear collapsed buildings for 2 AP. A bridge costs 3 AP and one of ${u.bridge_kits||0} remaining kits. Bank 1 AP to build. Both armies can use the route.`));
  if(mode){
   svg.querySelectorAll('.move-beacon').forEach(n=>n.remove());
   const d=definitions.find(d=>d[1]===mode.kind);$('hint').textContent=`${d[2]}: choose a marked adjacent hex · ${d[3]} AP${mode.kind==='bridge_gap'?' + 1 bridge kit':''}.`;
   for(const pos of legal[mode.kind]){
    const [cx,cy]=center(...pos),points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
    const tile=element('polygon',{points,class:'engineering-choice',role:'button',tabindex:0,'aria-label':`${d[2]} at ${hexColumn(pos[0])}${pos[1]+1}`});
    activate(tile,()=>{if(busy||playbackSession||!mode)return;const kind=mode.kind;mode=null;act({kind,unit:selected,pos});});svg.append(tile);
   }
  }
  markers(svg);
  if(state.linked_front_version){
   $('objective').textContent=`Linked hold: ${state.hold}/2`;
   $('objectiveName').textContent='★ TOWN + EITHER EXIT';
   $('missionHint').textContent=state.side==='us'?`Garrison the town and either ${state.scenario.link_label||'beach exit'} with infantry for two turn endings. Vehicles support the attack; they cannot garrison these objectives.`:`Break either link: remove the town garrison or deny both ${state.scenario.link_label||'beach exit'}s. Hold out through round ${state.scenario.rounds}.`;
  }
 };
 window.fieldworksTerrainHelp=(type,u,move,condition,pos)=>{
  const info={mountain:['Mountain','Blocks sight through the hex; +1 cover. Mountain-trained infantry enter for 1 AP, other infantry for 3. Vehicles cannot enter.'],ridge:['Rocky ridge','Blocks sight through the hex; +1 cover. Mountain-trained infantry: 1 AP; other infantry: 2. Vehicles cannot enter.'],desert:['Open desert','1 AP entry. No cover; long exposed approaches.'],dune:['Sand dunes','Infantry: 1 AP; vehicles: 2. No cover or extra sight blocking.'],wadi:['Dry wadi','Covered depression: +1 cover. Mountain-trained infantry: 1 AP; other infantry: 2. Vehicles cannot enter. Does not block sight through it.'],oasis:['Oasis','Palm cover: +1. Infantry enter for 2 AP; vehicles cannot. Blocks intervening sight like woods.'],beach:['Beach','Open landing ground. No cover; 1 AP entry.'],marsh:['Flooded field','Infantry wade for 2 AP. Amphibious sections cross for 1. Tanks, half-tracks and landing craft cannot enter. No cover.'],bocage:['Bocage hedgerow','Infantry: 2 AP and +1 cover. Blocks sight through the hex. Vehicles need an engineer to breach a gap.'],bunker:['Concrete strongpoint',`Infantry only, 2 AP. ${condition==='destroyed'?'Collapsed; entry blocked until engineers clear it.':condition==='damaged'?'Damaged: +1 cover; another structural hit collapses it.':'Intact: +2 cover. Blocks sight through the hex; heavy weapons damage it.'}`],causeway:['Raised causeway','Firm road across flooded ground. Road bonuses apply; no cover.'],rubble:['Cleared rubble','2 AP for infantry or vehicles; +1 cover. No longer blocks sight.']};
  if(!info[type])return null;
  return [info[type][0]+' · '+hexColumn(pos[0])+(pos[1]+1),info[type][1],move?`Legal move: ${move.cost} AP${move.road_bonus?' · road bonus':''}.`:u?'Not a legal move for this unit right now.':'Select a unit to see legal moves.','Movement previews never reveal unobserved enemy firing opportunities.'];
 };
 const manual=uiNode('section');manual.id='fieldworksManual';manual.innerHTML='<h3>Engineers & terrain</h3><p><strong>Breach hedge · 2 AP:</strong> open an adjacent bocage hex into exposed ground. Vehicles can use the gap and fire can pass through it.</p><p><strong>Clear rubble · 2 AP:</strong> reopen an adjacent collapsed building or bunker. The rubble costs 2 AP to enter, provides +1 cover and does not block sight.</p><p><strong>Build bridge · 3 AP + one kit:</strong> span one water hex with firm ground directly opposite on both banks. Each engineer starts with one kit. Bank an AP or receive officer support. Cannot cross open sea or fill a broad flooded belt. Both armies can use completed work.</p><p>Terrain changes outside sight stay unknown until observed. New sightings commit undo. These engineering orders are available in new DSL ground battles on every map; older saves keep their original capabilities.</p>';
 $('operationsManual').after(manual);
 const sectorButton=uiNode('button');sectorButton.id='sectorNavigator';sectorButton.type='button';sectorButton.textContent='Sectors';sectorButton.hidden=true;$('playTools').append(sectorButton);
 sectorButton.onclick=()=>window.ww2Briefing?.open();
 function sync(){manual.hidden=!state?.fieldworks_version;sectorButton.hidden=!state?.scenario.sectors?.length;}
 document.addEventListener('ww2:render',sync);
 document.addEventListener('ww2:playback',()=>{const svg=$('playbackMap'),snapshot=playbackSession?.frames[playbackSession.index]?.[playbackSession.phase];if(svg&&snapshot)markers(svg,snapshot);});
 sync();
})();
