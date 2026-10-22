/* Night geometry and controls use only the server's fog-filtered snapshot. */
'use strict';
(()=>{
 let mode=null,modeUnit=null,modeRevision=null;
 const distance=(a,b)=>{const dy=a[1]-b[1],dq=a[0]-(a[1]-(a[1]&1))/2-b[0]+(b[1]-(b[1]&1))/2;return Math.max(Math.abs(dq),Math.abs(dy),Math.abs(dq+dy));};
 const designs=[['spotlightAim','spotlight','Aim spotlight',1],['pathfinderFlare','flare','Drop flare',2],['nightDrop','airborne_drop','Drop paratroopers',3]];
 const sightBrief='Night sight replaces daylight ranges. Fighters see 4–5 air hexes; other aircraft usually see 2. Spotlights reveal a narrow air corridor, flares a radius of 2. Dakotas must fly near the aim before dropping.';
 for(const [id,kind,label,cost] of designs){
  const b=uiNode('button');b.id=id;b.type='button';b.hidden=true;b.textContent=`${label} · ${cost} AP`;$('nextUnit').before(b);
  b.onclick=()=>{const cancel=mode===kind;document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=false;barrageMode=false;combatMode=null;target=null;mode=cancel?null:kind;modeUnit=selected;modeRevision=state.revision;render();};
 }
 document.addEventListener('ww2:cancel-targeting',()=>mode=null);
 window.nightPicking=legal=>{
  if(mode&&(modeUnit!==selected||modeRevision!==state.revision||state.turn!==state.side||state.winner||!state.ready||!legal?.[mode]?.length&&!legal?.[mode]))mode=null;
  return !!mode;
 };
 window.nightRole=u=>{
  if(u.reserve&&u.drop_transport)return 'Airborne squad aboard its assigned Dakota · fly the transport near the drop zone first';
  if(u.kind==='transport_aircraft')return u.side===state.side?`Dakota · ${state.units.filter(t=>t.drop_transport===u.id&&t.reserve&&t.hp>0).length}/2 squads aboard · fly within 1 hex of aim · drop costs 3 AP`:'Dakota troop transport · carries airborne infantry';
  if(u.kind==='spotlight')return 'Fixed Spotlight · aim within 8 hexes for 1 AP · reveals an air corridor and its own position';
  if(u.kind==='aa_gun')return `Flak · range ${u.range} · harder to hit in darkness · illumination improves accuracy`;
  if(u.kind==='radar')return 'Mission radar site · detects aircraft within 6 hexes · Allies must destroy both';
  if(u.kind==='airfield')return `Service field · ${u.air_stores}/6 finite stores · services its own platoon’s aircraft`;
  if(u.kind==='fighter')return `Night fighter · air sight ${u.night_air_sight} · flight ${u.flight} hexes per AP · protect or intercept aircraft`;
  if(u.kind==='bomber')return `${u.display_name} · ${u.bombs}/${u.max_bombs} bomb loads · range ${u.range}${u.max_flares?` · ${u.flares}/${u.max_flares} flares`:''}`;
  if(u.kind==='paratrooper')return `${u.landing_limited?'Just landed · 1 AP this turn':'Airborne infantry'} · seize the signals station after both radar sites are destroyed`;
  return 'Night garrison · defend the signals station and hunt landed airborne troops';
 };
 function points(x,y){const [cx,cy]=center(x,y);return Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');}
 window.renderNight=(u,legal,svg)=>{
  const on=!!state.scenario.night_ops_version,war=!!state.war_version;document.body.classList.toggle('night-battle',on&&(!war||state.war_status?.dark));
  for(const [id] of designs)$(id).hidden=true;
  if(!on){mode=null;return;}
  if(!war){
  const progress=state.night_status||{radars_destroyed:0,hold:0};
  $('rulesetBadge').textContent=`Current DSL · ${state.scenario.name} · Night raid`;
  $('objectiveName').textContent=state.scenario.name.toUpperCase();$('objective').textContent=`Radar ${progress.radars_destroyed}/2 · Station ${progress.hold}/2 turns`;
  $('missionHint').textContent=(state.scenario.night_randomized_version?'Search the two marked sectors to find the concealed radar sites, then bomb both. ':'Bomb both radar sites. ')+'Land paratroopers to hold the signals station for two Allied turn endings. Darkness, Spotlights and flares control sight.';
  $('supportStatus').hidden=true;$('rangeGuideToggle').hidden=true;
  $('manualAP').textContent=sightBrief;
  $('callAirborne').hidden=true;
  }
  if(u){
   if(!war)$('roleBrief').textContent=nightRole(u);
   if(u.reserve&&u.drop_transport)$('hint').textContent='Aboard the assigned Dakota. Select that aircraft, fly near the landing zone, then Drop paratroopers.';
   if(u.kind==='spotlight')$('selection').textContent=`Spotlight ${u.platoon}${u.number} · ${u.hp}/${u.max_hp} strength · ${u.ap} AP${u.beam?' · beam active':''}`;
   if(!war&&['fighter','bomber','transport_aircraft'].includes(u.kind)&&!target&&!mode)$('hint').textContent=`AIR · ${u.flight} hexes per 1 AP · ${nightRole(u)}`;
   for(const [id,kind,label,cost] of designs){const b=$(id),allowed=Array.isArray(legal?.[kind])?legal[kind].length:legal?.[kind];b.hidden=!allowed;b.disabled=busy;b.textContent=mode===kind?`Cancel ${label.toLowerCase()}`:`${label} · ${cost} AP`;}
  }
  paintLights(svg,state);
  if(mode&&u){
   const positions=mode==='airborne_drop'?state.map.flatMap((row,y)=>row.map((_,x)=>[x,y])).filter(p=>distance(u.pos,p)<=1):legal[mode];
   $('hint').textContent=mode==='airborne_drop'?'Choose a drop aim within 1 hex of this Dakota. Roll 1 loses the squad; 2–5 scatter; 6 is exact if legal. Hidden terrain hazards and Flak still apply.':mode==='spotlight'?'Aim a narrow air search within 8 hexes. Switching it on reveals the Spotlight.':'Aim a radius-2 flare within 5 hexes. It helps both armies see and reduces friendly drop scatter by 1.';
   for(const pos of positions){const tile=element('polygon',{points:points(...pos),class:'night-choice',role:'button',tabindex:0,'data-x':pos[0],'data-y':pos[1],'aria-label':`${mode==='airborne_drop'?'Drop':'Illuminate'} ${hexColumn(pos[0])}${pos[1]+1}`});activate(tile,()=>{const kind=mode;mode=null;act({kind,unit:u.id,pos});});svg.append(tile);}
  }
 };
 function paintLights(svg,snapshot){
  svg.querySelectorAll(state.war_version?'.night-light,.night-choice':'.night-light,.night-choice,.joint-objective').forEach(n=>n.remove());
  for(const light of snapshot.night_lights||[]){
   const [x,y]=center(...light.pos),[a,b]=center(...light.aim),len=Math.hypot(a-x,b-y)||1,dx=-(b-y)/len*25,dy=(a-x)/len*25;
   const g=element('g',{class:'night-light','aria-hidden':'true'});
   g.append(element('polygon',{points:`${x},${y} ${a+dx},${b+dy} ${a-dx},${b-dy}`,class:'searchlight-beam'}),element('circle',{cx:a,cy:b,r:48,class:'searchlight-focus'}));svg.append(g);
  }
  for(const f of snapshot.night_flares||[]){const [x,y]=center(...f.pos);const g=element('g',{class:'night-light','aria-hidden':'true'});g.append(element('circle',{cx:x,cy:y,r:102,class:'night-flare'}),element('text',{x,y:y-106,class:'night-label','text-anchor':'middle'},'FLARE · BOTH ARMIES'));svg.append(g);}
  for(const p of state.scenario.night_targets||[]){const [x,y]=center(...p.pos);const g=element('g',{class:'night-light','aria-hidden':'true'});g.append(element('circle',{cx:x,cy:y,r:32,class:'night-target'}),element('text',{x,y:y+44,class:'night-label','text-anchor':'middle'},'RADAR TARGET'));svg.append(g);}
  for(const sector of state.scenario.night_search_sectors||[]){const [x,y]=center(...sector.pos);const g=element('g',{class:'night-light','aria-hidden':'true'});g.append(element('circle',{cx:x,cy:y,r:152,class:'night-search-sector'}),element('text',{x,y:y-160,class:'night-label','text-anchor':'middle'},`${sector.id==='A'?'WEST':'EAST'} · SEARCH SECTOR`));for(const pos of sector.sites){const [cx,cy]=center(...pos);g.append(element('circle',{cx,cy,r:12,class:'night-possible-site'}));}svg.append(g);}
  if(!state.war_version){const [x,y]=center(...state.scenario.objective);const objective=element('g',{class:'night-light','aria-hidden':'true'});objective.append(element('circle',{cx:x,cy:y,r:35,class:'night-station'}),element('text',{x,y:y+47,class:'night-label','text-anchor':'middle'},'AIRBORNE OBJECTIVE'));svg.append(objective);}
 }
 document.addEventListener('ww2:playback',()=>{if(state?.scenario.night_ops_version&&playbackSession)paintLights($('playbackMap'),playbackSession.frames[playbackSession.index][playbackSession.phase]);});
 document.addEventListener('ww2:render',()=>{
  if(!state?.scenario.night_ops_version||state.war_version)return;
  $('manualAP').textContent=sightBrief;
  const manual=$('fubarManual');manual.querySelector('h3').textContent=`${state.scenario.name} · nighttime air and airborne raid`;
  const paragraphs=manual.querySelectorAll('p');paragraphs[0].textContent=state.scenario.brief;
  paragraphs[1].textContent=state.scenario.doctrine[state.side];paragraphs[2].textContent=state.scenario.reinforcement_brief;
 });
})();
