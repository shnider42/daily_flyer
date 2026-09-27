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
 const halftrackHelp=document.createElement('p');halftrackHelp.textContent='German half-tracks: two on-map mobile support sections replace airborne reserves in new operations. Each has 3 strength, 3 base AP (bank 1), range 5 and light armor. Suppress infantry on 3+ within 5 hexes for 2 AP. No anti-tank penetration, air drop, water crossing, woods/building entry or passenger loading. US retains two airborne reserves. Existing saved operations keep their original roster.';section.append(halftrackHelp);
 for(const li of $('rules').querySelectorAll('li'))if(li.textContent.startsWith('Open information.'))li.textContent='Visibility: the original battlefields use open information. Operation Long Reach uses fog of war and combined arms, described below. Solo opponents use the same legal actions and dice; their replays show only observed activity in fog.';
 const old=$('dslManual').lastElementChild;
 old.textContent='Classic preserves the previous rules. ASL-inspired play remains separate. Choose Operation Long Reach for commanders, asymmetric combined arms and fog of war.';
 const drop=document.createElement('button');drop.id='airdrop';drop.hidden=true;drop.textContent='Airborne landing · 2 AP';$('nextUnit').before(drop);
 let landingUnit=null;
 drop.onclick=()=>{landingUnit=landingUnit===selected?null:selected;render();};
 function points(x,y){const [cx,cy]=center(x,y);return Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');}
 window.drawFog=(svg,snapshot)=>{
  svg.querySelectorAll('.fog-layer,.contact-marker').forEach(n=>n.remove());
  if(!state.fog_of_war)return;
  const seen=new Set((snapshot.visible_hexes||[]).map(p=>p.join(','))),layer=element('g',{class:'fog-layer','aria-hidden':'true'});
  state.map.forEach((row,y)=>row.forEach((_,x)=>{if(!seen.has(`${x},${y}`))layer.append(element('polygon',{points:points(x,y)}));}));
  svg.insertBefore(layer,svg.querySelector('.unit'));
  for(const contact of snapshot.contacts||[]){
   const [cx,cy]=center(...contact.pos),g=element('g',{class:'contact-marker'});
   g.append(element('title',{},`Last seen ${kinds[contact.kind]} · round ${contact.last_seen_round} · ${sideLabel(contact.last_seen_turn)} turn. Current location unknown.`),element('rect',{x:cx-19,y:cy-16,width:38,height:32,rx:3}),element('text',{x:cx,y:cy-2,'text-anchor':'middle'},`${unitCodes[contact.kind]} ?`),element('text',{x:cx,y:cy+10,'text-anchor':'middle',class:'contact-age'},`R${contact.last_seen_round}`));svg.append(g);
  }
  const own=snapshot.units.filter(u=>u.side===state.side&&u.hp>0).length,enemy=snapshot.units.filter(u=>u.side!==state.side&&u.hp>0).length;
  $('armyCount').textContent=`Your forces ${own} · Enemy spotted ${enemy} · Last seen ${snapshot.contacts?.length||0}`;
 };
 const roles={
  halftrack:'HALF-TRACK · 3 AP, light armor, range 5. Suppress infantry on 3+ for 2 AP. Mobile ground support; no air drop, water crossing, anti-tank attack or passenger loading.',
  commander:'COMMANDER · 3 AP, bank 2. Rally radius 2 across platoons. On your feet: 2 AP to grant nearby non-officers +1 AP, once per turn.',
  scout:'RECON · 3 AP. Sight 9; spot concealed infantry within 4 hexes. Small team—use cover.',
  engineer:'ENGINEERS · Two smoke and two frag grenades. Clear infantry from cover; small arms cannot hurt tanks.',
  at_team:'ANTI-TANK · Can penetrate tank armor; a hit deals 2 damage to vehicles. Small, vulnerable crew.',
  tank:'ARMOR · 2 damage against armor, 1 against infantry. Immune to small arms. Roads and open ground only; no water, woods or buildings.',
  at_gun:'FIXED GUN · Cannot move. Long-range anti-tank fire deals 2 damage to armor. Starts dug in; protect its flanks.',
  amphibious:'AMPHIBIOUS SECTION · 3 AP. Cross water and open land with its own troops. Light armor; vulnerable to AT weapons. No passenger loading.',
  paratrooper:'AIRBORNE · Select a spotted clear landing hex for 2 AP. Landing can trigger overwatch. Once deployed, fights as infantry with 3 base AP.'
 };
 window.renderCombined=(unit,legal,svg)=>{
  drop.hidden=true;
  if(!state.dsl_expansion){landingUnit=null;return;}
  $('rulesetBadge').textContent='DSL · Combined arms playtest · Fog of war';
  $('manualAP').textContent='Combined arms: unit details show base AP, banking cap, strength and range. Officers bank 2 AP; others bank 1. Armored vehicles cannot enter woods/buildings. Fixed guns cannot move. See Operation Long Reach below for the complete rules.';
  window.drawFog(svg,state);
  if(unit){
   $('roleBrief').textContent=roles[unit.kind]|| (unit.kind==='mg'?`MG · Suppress within ${unit.side==='de'?6:4} hexes on ${unit.side==='de'?3:5}+. 2 AP; no damage.`:unit.kind==='leader'?'LIEUTENANT · Rally adjacent platoon members for 1 AP. On your feet grants eligible adjacent non-officers +1 AP for 2 AP.':'RIFLES · US accuracy advantage; German suppression advantage. Use scouts to find concealed enemies.');
   $('selection').textContent=`${unitName(unit)} · ${unit.hp}/${unit.max_hp} strength · ${unit.ap} AP`;
   $('unitMechanics').prepend(uiNode('p','mechanics-caption',`${unit.personnel} personnel at full strength · armor ${unit.armor} · range ${unit.range}${unit.reserve?' · AIRBORNE RESERVE':''}`));
   if(unit.reserve){
    drop.hidden=!legal?.drops?.length||busy;drop.textContent=landingUnit===unit.id?'Cancel landing':'Airborne landing · 2 AP';
    $('hint').textContent='Airborne reserve · choose Airborne landing, then a marked clear hex. Scout farther ahead to unlock more landing zones.';
   }
  }
  for(const b of $('roster').children){const u=state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter))[Array.from($('roster').children).indexOf(b)];if(u)b.textContent=`${unitCodes[u.kind]} ${u.platoon}${u.number} · ${u.hp<=0?'Lost':u.reserve?'Airborne reserve':u.pinned?'Pinned':u.ap+' AP'}`;}
  if(landingUnit!==selected||!unit?.reserve)landingUnit=null;
  if(landingUnit){
   $('hint').textContent='Tap a marked landing zone · 2 AP · enemy overwatch can react.';
   for(const pos of legal.drops){const tile=element('polygon',{points:points(...pos),class:'landing-zone',role:'button',tabindex:0,'aria-label':`Land paratroopers at ${String.fromCharCode(65+pos[0])}${pos[1]+1}`});activate(tile,()=>{if(confirm('Land here for 2 AP? Enemy overwatch may fire on arrival.')){landingUnit=null;act({kind:'drop',unit:unit.id,pos});}});svg.append(tile);}
  }
 };
})();
