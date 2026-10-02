/* Combined-arms presentation. Hidden enemy state never reaches this client. */
'use strict';
(()=>{
 for(const id of ['scenarioSelect','soloScenario','rematchScenario']){
  const option=document.createElement('option');option.value='frontier';option.textContent='Operation Long Reach · 24×24 · combined arms · DSL';$(id).append(option);
  $(id).addEventListener('change',()=>{if($(id).value==='frontier')$(id==='scenarioSelect'?'rulesetSelect':id==='soloScenario'?'soloRuleset':'rematchRuleset').value='dsl';});
 }
 const section=document.createElement('section');section.id='combinedManual';
 section.innerHTML='<h3>Operation Long Reach · DSL combined arms</h3><p>24×24 hexes, 20 units per army, 36 rounds. Available in the battlefield picker. Alpha and Bravo have rifle, scout, engineer, anti-tank, MG and lieutenant teams. Command & support contains your commander, two tanks, two fixed guns, an amphibious section and two airborne reserves.</p><p><strong>US:</strong> infantry hits with a −1 die threshold; rifle squads have 4 strength (12 personnel). Tanks: 3 base AP, range 6, strength 4. <strong>Germany:</strong> infantry suppression on 3+ versus US 5+, using the same fire die even when damage misses. Rifle squads: 3 strength (9 personnel). Tanks: 2 base AP, range 8, strength 5. MG suppression costs 2 AP, rolls 3+ German / 5+ US, and reaches 6 / 4 hexes.</p><p><strong>Commanders:</strong> 3 AP, bank 2. Rally any allies within 2 hexes for 1 AP. On your feet costs 2 AP and gives eligible non-officers within 2 hexes +1 AP across platoons, once per turn. LTs affect adjacent members of their own platoon. Nobody can receive more than base AP plus their banking limit.</p><p><strong>Armor:</strong> small arms and frag grenades cannot harm armor. AT teams, tanks and stationary guns deal 2 damage to armor on a hit. Armored vehicles cannot enter woods or buildings. Fixed AT guns cannot move: US range 9, German 10. Amphibious sections include their own troops and cross water and open land; they are a single fighting unit, without passenger loading. Strength is staying power, not a soldier count.</p><p><strong>Specialists:</strong> scouts have 3 base AP, sight 9 and spot concealed infantry at 4 hexes. Engineers carry two smoke and two frag grenades. Airborne reserves start off-map: select them under Command & support, then tap a marked clear landing hex spotted by your army. Landing costs 2 AP and can trigger overwatch. They then fight as infantry.</p><p><strong>Fog:</strong> ordinary sight is 6 hexes. Tank/gun sight reaches at least weapon range. Infantry in woods or buildings is concealed beyond 2 hexes (4 for scouts). Woods, buildings and smoke block intervening sight; adjacent units are always detected. Dim terrain is outside current sight. Dashed ? contacts preserve only the last seen role, hex and round—never current strength or movements. Search the old hex to clear a stale contact. Replays and AI obey visibility too. The objective hold and incoming mortar areas remain public.</p><p>Existing battlefields and saved games retain their original rules. This is an initial balance playtest.</p>';
 $('rules').append(section);
 section.innerHTML=section.innerHTML.replace('and two airborne reserves.','and either two US airborne reserves or two German half-track sections.').replace('Airborne reserves start off-map:','US airborne reserves start off-map:');
 const halftrackHelp=document.createElement('p');halftrackHelp.textContent='German half-tracks: 3 strength, 3 base AP (bank 1), range 5. Each paid road-to-road step grants another connected road/bridge step free: 6 road hexes with 3 AP, or 8 with 4 AP. Leaving the road or taking another action cancels the pending free step. Carry one friendly infantry unit, including MGs, specialists and officers. Select the half-track, then Load infantry and tap an adjacent unpinned unit. Boarding and unloading each cost the infantry 1 AP, not the vehicle. A unit may board only once per turn. Passengers cannot attack, spot, command or hold objectives; they travel with the vehicle. Unload onto an empty adjacent land hex, including woods; enemy overwatch can fire. Rifle/MG fire and frag grenades cannot damage light armor. Tanks and AT guns ignore its armor bonus and deal 3 damage: one hit destroys a full-strength half-track. AT teams deal 2. If destroyed, passengers lose 1 strength and survivors bail out in its hex, pinned with 0 AP. Half-tracks retain suppression on 3+ for 2 AP; no water, woods/building entry, air drop or anti-tank attack. These half-track abilities also apply to existing combined-arms saves; rosters are unchanged.';section.append(halftrackHelp);
 for(const li of $('rules').querySelectorAll('li'))if(li.textContent.startsWith('Open information.'))li.textContent='Visibility: the original battlefields use open information. Operation Long Reach uses fog of war and combined arms, described below. Solo opponents use the same legal actions and dice; their replays show only observed activity in fog.';
 const old=$('dslManual').lastElementChild;
 old.textContent='Classic preserves the previous rules. ASL-inspired play remains separate. Choose Operation Long Reach for commanders, asymmetric combined arms and fog of war.';
 const drop=document.createElement('button');drop.id='airdrop';drop.hidden=true;drop.textContent='Airborne landing · 2 AP';$('nextUnit').before(drop);
 let landingUnit=null;
 drop.onclick=()=>{landingUnit=landingUnit===selected?null:selected;render();};
 const transportButtons={};let transportMode=null;
 for(const [id,label] of [['load','Load infantry'],['unload','Unload infantry'],['viewTransport','View half-track']]){
  const b=document.createElement('button');b.id=id;b.hidden=true;b.textContent=label;transportButtons[id]=b;$('nextUnit').before(b);
  b.onclick=()=>{
   const unit=state.units.find(u=>u.id===selected);
   if(id==='viewTransport'){const carrier=state.units.find(u=>u.id===unit?.carrier_id);if(carrier)chooseUnit(carrier);return;}
   transportMode=transportMode?.kind===id?null:{kind:id,unit:selected,revision:state.revision};
   smokeMode=false;barrageMode=false;landingUnit=null;render();
  };
 }
 function points(x,y){const [cx,cy]=center(x,y);return Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');}
 window.drawFog=(svg,snapshot)=>{
  if(state.fog_of_war){const own=snapshot.units.filter(u=>u.side===state.side&&u.hp>0).length,enemy=snapshot.units.filter(u=>u.side!==state.side&&u.hp>0).length;$('armyCount').textContent=`Your forces ${own} · Enemy spotted ${enemy} · Last seen ${snapshot.contacts?.length||0}`;}
  const sky=!!state.joint_ops_version&&window.fubarLayer?.()==='air';
  if(svg._fogSnapshot===snapshot&&svg._fogSky===sky&&svg.querySelector('.fog-layer'))return;
  svg._fogSky=sky;
  svg._fogSnapshot=snapshot;
  svg.querySelectorAll('.contact-marker,.passenger-marker').forEach(n=>n.remove());
  if(!state.fog_of_war){svg.querySelector('.fog-layer')?.remove();return;}
  const seen=new Set(((sky?snapshot.visible_air_hexes:snapshot.visible_hexes)||[]).map(p=>p.join(',')));
  let layer=svg.querySelector('.fog-layer');
  if(!layer){layer=element('g',{class:'fog-layer','aria-hidden':'true'});layer._cells=new Map();svg.insertBefore(layer,svg.querySelector('.unit'));}
  // Every cell is still checked against the authoritative public footprint.
  // Only polygons whose visibility changed are inserted/removed.
  state.map.forEach((row,y)=>row.forEach((_,x)=>{
   const key=`${x},${y}`,tile=layer._cells.get(key);
   if(seen.has(key)){if(tile){tile.remove();layer._cells.delete(key);}}
   else if(!tile){const next=element('polygon',{points:points(x,y)});layer._cells.set(key,next);layer.append(next);}
  }));
  for(const contact of snapshot.contacts||[]){
   const [cx,cy]=center(...contact.pos),g=element('g',{class:'contact-marker'});
   g.dataset.kind=contact.kind;
   if(state.joint_ops_version){const layer=window.fubarLayer?.(),air=['fighter','bomber'].includes(contact.kind);g.classList.toggle('joint-hidden',layer==='air'&&!air||layer==='surface'&&air);}
   g.append(element('title',{},`${contact.source==='radio'?'Radio report':'Last seen'} ${kinds[contact.kind]} · round ${contact.last_seen_round} · ${sideLabel(contact.last_seen_turn)} turn. Current location unknown.`),element('rect',{x:cx-19,y:cy-16,width:38,height:32,rx:3}),element('text',{x:cx,y:cy-2,'text-anchor':'middle'},`${unitCodes[contact.kind]} ?`),element('text',{x:cx,y:cy+10,'text-anchor':'middle',class:'contact-age'},`${contact.source==='radio'?'RAD · ':''}R${contact.last_seen_round}`));svg.append(g);
  }
  for(const troop of snapshot.units.filter(u=>u.side===state.side&&u.hp>0&&u.carrier_id)){
   const counter=svg.querySelector(`.unit[data-unit-id="${troop.carrier_id}"]`);if(!counter)continue;
   const [cx,cy]=center(...troop.pos),badge=element('g',{class:'passenger-marker','aria-hidden':'true'});
   badge.append(element('title',{},`${unitName(troop)} aboard`),element('rect',{x:cx-25,y:cy-23,width:16,height:13,rx:3}),element('text',{x:cx-17,y:cy-13,'text-anchor':'middle'},'1'));counter.append(badge);
  }
 };
 const roles={
  halftrack:'HALF-TRACK · 3 AP, range 5. Two connected road hexes per AP. Carries one infantry unit; load/unload costs the infantry 1 AP each. Passengers cannot fire or spot. Rifle/MG-proof; tanks and AT guns deal 3 damage (one-hit kill). AT teams deal 2. Destroyed transport: passengers lose 1 strength and bail out pinned, 0 AP. Suppress on 3+ for 2 AP.',
  landing_craft:'LANDING CRAFT · 3 AP, water only. Carries one infantry unit; infantry spends 1 AP to unload onto adjacent land. Two smoke screens. No weapons. If sunk away from shore, passengers are lost; beside free land they bail out with 1 less strength, pinned, 0 AP.',
  commander:'COMMANDER · 3 AP, bank 2. Rally radius 2 across platoons. On your feet: 2 AP to grant nearby non-officers +1 AP, once per turn.',
  scout:'RECON · 3 AP. Sight 9; spot concealed infantry within 4 hexes. Small team—use cover.',
  engineer:'ENGINEERS · Two smoke and two frag grenades. Clear infantry from cover; small arms cannot hurt tanks.',
  at_team:'ANTI-TANK · Can penetrate tank armor; a hit deals 2 damage to vehicles. Small, vulnerable crew.',
  tank:'ARMOR · 3 damage against half-tracks, 2 against other armor, 1 against infantry. Immune to small arms. Roads and open ground only; no water, woods or buildings.',
  at_gun:'FIXED GUN · Cannot move. Long-range anti-tank fire: 3 damage to half-tracks, 2 to other armor. Starts dug in; protect its flanks.',
  amphibious:'AMPHIBIOUS SECTION · 3 AP. Cross water and open land with its own troops. Light armor; vulnerable to AT weapons. No passenger loading.',
  paratrooper:'AIRBORNE · Select a spotted clear landing hex for 2 AP. Landing can trigger overwatch. Once deployed, fights as infantry with 3 base AP.'
 };
 window.renderCombined=(unit,legal,svg)=>{
  drop.hidden=true;
  for(const b of Object.values(transportButtons))b.hidden=true;
  svg.classList.remove('transport-picking');
  if(!state.dsl_expansion){landingUnit=null;transportMode=null;return;}
  if(transportMode&&(transportMode.unit!==selected||transportMode.revision!==state.revision||smokeMode||barrageMode))transportMode=null;
  $('rulesetBadge').textContent='DSL · Combined arms playtest · Fog of war';
  $('manualAP').textContent='Combined arms: unit details show base AP, banking cap, strength and range. Officers bank 2 AP; others bank 1. Armored vehicles cannot enter woods/buildings. Fixed guns cannot move. See Operation Long Reach below for the complete rules.';
  window.drawFog(svg,window.signalSnapshot?.(state)||state);
  if(unit){
   $('roleBrief').textContent=roles[unit.kind]|| (unit.kind==='mg'?`MG · Suppress within ${unit.side==='de'?6:4} hexes on ${unit.side==='de'?3:5}+. 2 AP; no damage.`:unit.kind==='leader'?'LIEUTENANT · Rally adjacent platoon members for 1 AP. On your feet grants eligible adjacent non-officers +1 AP for 2 AP.':'RIFLES · US accuracy advantage; German suppression advantage. Use scouts to find concealed enemies.');
   $('selection').textContent=`${unitName(unit)} · ${unit.hp}/${unit.max_hp} strength · ${unit.ap} AP`;
   $('unitMechanics').prepend(uiNode('p','mechanics-caption',`${unit.personnel} personnel at full strength · armor ${unit.armor} · range ${unit.range}${unit.reserve?(unit.arrival_round?' · REINFORCEMENTS R'+unit.arrival_round:' · AIRBORNE RESERVE'):''}`));
   if(unit.reserve&&!unit.arrival_round){
    drop.hidden=!legal?.drops?.length||busy;drop.textContent=landingUnit===unit.id?'Cancel landing':'Airborne landing · 2 AP';
    $('hint').textContent='Airborne reserve · choose Airborne landing, then a marked clear hex. Scout farther ahead to unlock more landing zones.';
   }
   if(unit.carrier_id){
    transportButtons.viewTransport.hidden=false;
    const carrier=state.units.find(u=>u.id===unit.carrier_id);
    $('hint').textContent=`Aboard ${carrier?unitName(carrier):'transport'}. Select it to unload · 1 infantry AP.`;
    transportButtons.viewTransport.textContent='Select transport';
    $('roleBrief').textContent='PASSENGER · Cannot fire, spot or use abilities while aboard. AP still refreshes each turn. Unloading costs this unit 1 AP and can trigger overwatch.';
   }
   if(['halftrack','landing_craft'].includes(unit.kind)){
    const troop=state.units.find(u=>u.hp>0&&u.carrier_id===unit.id);
    if(!target)$('hint').textContent=troop?`Aboard: ${unitName(troop)} · ${troop.ap} AP. Unload costs infantry 1 AP.`:unit.kind==='landing_craft'?'Empty · water only · load adjacent infantry for 1 infantry AP.':'Empty · carries 1 infantry unit. Roads: 2 hexes/AP.';
    for(const id of ['load','unload']){const b=transportButtons[id];b.hidden=!legal?.[id]?.length;b.disabled=busy;b.textContent=transportMode?.kind===id?`Cancel ${id}`:`${id==='load'?'Load':'Unload'} infantry · 1 AP`;}
   }
  }
  for(const b of $('roster').children){const u=state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter))[Array.from($('roster').children).indexOf(b)];if(u)b.textContent=`${unitCodes[u.kind]} ${u.platoon}${u.number} · ${u.hp<=0?'Lost':u.reserve?(u.arrival_round?'Arrives R'+u.arrival_round:'Airborne reserve'):u.pinned?'Pinned':u.ap+' AP'}`;}
  if(landingUnit!==selected||!unit?.reserve)landingUnit=null;
  if(landingUnit){
   $('hint').textContent='Tap a marked landing zone · 2 AP · enemy overwatch can react.';
   for(const pos of legal.drops){const tile=element('polygon',{points:points(...pos),class:'landing-zone',role:'button',tabindex:0,'aria-label':`Land paratroopers at ${hexColumn(pos[0])}${pos[1]+1}`});activate(tile,()=>{if(confirm('Land here for 2 AP? Enemy overwatch may fire on arrival.')){landingUnit=null;act({kind:'drop',unit:unit.id,pos});}});svg.append(tile);}
  }
  if(transportMode&&!legal?.[transportMode.kind]?.length)transportMode=null;
  if(transportMode){
   const loading=transportMode.kind==='load';svg.classList.add('transport-picking');
   $('hint').textContent=loading?'Tap a marked friendly infantry unit to board · 1 infantry AP.':'Tap a marked land hex to unload · 1 infantry AP. Overwatch may fire.';
   const choices=loading?legal.load.map(id=>{const u=state.units.find(u=>u.id===id);return {pos:u.pos,id,label:`Board ${unitName(u)}`};}):legal.unload.map(m=>({...m,label:`Unload infantry at ${hexColumn(m.pos[0])}${m.pos[1]+1}`}));
   for(const choice of choices){
    const tile=element('polygon',{points:points(...choice.pos),class:'transport-choice',role:'button',tabindex:0,'aria-label':`${choice.label} · 1 infantry AP`});
    tile.append(element('title',{},`${choice.label} · 1 infantry AP`));
    activate(tile,()=>{if(choice.threats&&!confirm(state.signals_version?'A spotted enemy could cover this hex. Actual overwatch is unknown. Unload and risk fire?':'Enemy overwatch covers this hex. Unload and risk fire?'))return;transportMode=null;act(loading?{kind:'load',unit:unit.id,target:choice.id}:{kind:'unload',unit:unit.id,pos:choice.pos});});svg.append(tile);
   }
  }
 };
})();
