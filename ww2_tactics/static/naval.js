'use strict';
(()=>{
 let reconUnit=null;
 const terrainLegend=document.querySelector('.terrain-legend'),landLegend=terrainLegend.innerHTML;
 for(const id of ['scenarioSelect','soloScenario','rematchScenario']){
  const option=document.createElement('option');option.value='midway';option.textContent='Midway · 26×30 · US vs Japan · naval DSL';$(id).append(option);
  $(id).addEventListener('change',()=>{if($(id).value==='midway')$(id==='scenarioSelect'?'rulesetSelect':id==='soloScenario'?'soloRuleset':'rematchRuleset').value='dsl';});
 }
 $('soloDialog').querySelector('h2 + p').textContent='Choose an operation. You start on the first-listed side; swap sides when arranging the next battle.';
 const buttons={};
 for(const id of ['recon','airstrike','torpedo','repair']){
  const b=document.createElement('button');b.id=id;b.hidden=true;$('nextUnit').before(b);buttons[id]=b;
 }
 buttons.recon.onclick=()=>{reconUnit=reconUnit===selected?null:selected;combatMode=null;smokeMode=false;barrageMode=false;render();};
 document.addEventListener('ww2:cancel-targeting',()=>{reconUnit=null;});
 for(const id of ['airstrike','torpedo'])buttons[id].onclick=()=>act({kind:id,unit:selected,target});
 buttons.repair.onclick=()=>act({kind:'repair',unit:selected});
 const manual=uiNode('section','naval-manual');manual.id='navalManual';
 manual.innerHTML='<h3>Midway · naval sandbox</h3><p>A fictional US–Japan operation, 26×30 hexes. Each fleet has two aircraft carriers, two battleships, four cruisers and six destroyers. Islands block surface sight and movement. Ships move one water hex per AP and bank one unused AP. There are no infantry pins or road bonuses.</p><p><strong>Win:</strong> sink both enemy carriers, or reach 6 sea-control points. End your turn with a ship within two hexes of ★ and no enemy ship in that zone to earn one point. At round 30, higher control score wins, then surviving hull; an exact tie goes to Japan. The zone and score are public information.</p><p><strong>Guns · 2 AP:</strong> battleships have 8 hull and deal 3 damage before armor, at range 9 US / 10 Japan. Cruisers have 5 hull, range 6 and 2 damage. Destroyers have 3 hull, range 4 and 1 damage. Carriers have 6 hull and weak range-3 defensive guns. Long-range fire and small destroyer targets each add +1 to the base 4+ roll. Battleship armor reduces gun damage by 1, minimum 1. Smoke and islands block guns and torpedoes.</p><p><strong>Carriers:</strong> Search costs 1 AP, once per carrier per turn. Select a hex within 16 (US) or 14 (Japan); aircraft reveal a radius of 3 until the enemy turn ends. Air strike costs 2 AP, once per carrier per turn, against a spotted ship: US range 12, 3+ hit, 2 hull damage; Japan range 14, 4+ hit, 3 hull damage. A spotted defending cruiser within 2 hexes adds +1 to the strike threshold; escorts do not stack. Aircraft are abstract sorties, not separate movable units.</p><p><strong>Destroyers:</strong> US speed 4 AP versus Japan 3 AP. Torpedoes cost 2 AP and hit on 4+, once per turn. US: range 3, damage 3, two salvos. Japan: range 5, damage 4, three salvos. Torpedoes ignore armor. Two smoke screens per destroyer, 1 AP each, placed in its own hex.</p><p><strong>Cruisers:</strong> screening and anti-aircraft support; sight 9 US / 8 Japan. Other ships see 7 hexes. Keep escorts within 2 hexes of valuable carriers. Damage control costs 2 AP, once per turn, two uses per ship: US repairs 2 hull, Japan 1. Sunk ships cannot be repaired.</p><p>Fog, last-known contacts, save codes and replays work as on land. Balance is experimental. Blue is US; red is Japan. Choose a ship, scout, then select a spotted enemy to see legal attacks.</p>';
 $('rules').append(manual);
 manual.querySelector('p').textContent='A fictional US–Japan island campaign, 26×30 hexes. Each side has 14 warships and four amphibious infantry sections. Four larger islands provide beaches, jungle and two flagged outposts. Existing saves keep their original map and roster; start a new Midway battle for the islands.';
 manual.querySelectorAll('p')[1].textContent='Win: sink both enemy carriers or reach 6 control points. End your turn as the only fleet within two hexes of ★ for +1. Each flagged island outpost occupied by your amphibious section grants another +1 at turn end. At round 30, higher control score wins, then surviving hull/strength; an exact tie goes to Japan. Scores are public.';
 const landingHelp=uiNode('p','');landingHelp.textContent='Landing sections: 4 strength, 3 AP, bank 1, range 2, 1 damage, one smoke screen. Enter a beach directly to disembark; re-enter water to board your craft. Jungle and buildings cost 2 AP; all other moves cost 1. Land targets in jungle/buildings add +1 to the hit roll. Sections cannot repair, and torpedoes target warships only. Infantry use the naval damage model without pins. A section and its craft are one unit, not separate passengers.';manual.querySelectorAll('p')[1].after(landingHelp);
 function hexPoints(x,y){const [cx,cy]=center(x,y);return Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');}
 function gap(a,b){const cube=([x,y])=>{const q=x-(y-(y&1))/2;return [q,-q-y,y];},ac=cube(a),bc=cube(b);return Math.max(...ac.map((v,i)=>Math.abs(v-bc[i])));}
 function zone(svg,snapshot){
  if(!svg._seaControl?.isConnected){
  svg.querySelectorAll('.sea-control').forEach(e=>e.remove());
  const group=element('g',{class:'sea-control','aria-hidden':'true'});
  state.map.forEach((row,y)=>row.forEach((tile,x)=>{if(['water','objective'].includes(tile)&&gap([x,y],state.scenario.objective)<=2)group.append(element('polygon',{points:hexPoints(x,y)}));}));
  svg.insertBefore(group,svg.querySelector('.unit'));
  svg._seaControl=group;
  svg.querySelectorAll('.island-marker').forEach(e=>e.remove());
  for(const [i,pos] of (state.scenario.island_objectives||[]).entries()){
   const [x,y]=center(...pos);svg.append(element('text',{x,y:y+24,class:'island-marker'},`⚑ ${i+1} · +1`));
  }
  }
  const score=snapshot.sea_score||state.sea_score;$('objective').textContent=`US ${score.us}/6 · Japan ${score.de}/6`;
 }
 window.renderNaval=(unit,legal,svg)=>{
  document.body.classList.toggle('naval-battle',!!state.naval_version);
  terrainLegend.innerHTML=state.naval_version?'<span>🟩 Bright hex + arrow: legal move</span><span>★ Sea control</span><span>⚑ Island outpost</span><span>Blue: US · Red: Japan</span>':landLegend;
  for(const b of Object.values(buttons))b.hidden=true;
  for(const side of ['us','de']){const key=document.querySelector(`.team-legend .${side}-key`);key.replaceChildren();const dot=document.createElement('i');dot.className=side+'-dot';key.append(dot,document.createTextNode(sideLabel(side)));}
  $('waiting').querySelector('p').textContent=`Send this invitation to the other player. You command the ${names.us}; they command the ${names.de}.`;
  if(!state.ready)$('turnBanner').textContent=`Waiting for the ${names.de}…`;
  $('seriesScore').textContent=`Victories · ${names.us} ${state.victories?.us||0} / ${names.de} ${state.victories?.de||0}`;
  if(!state.naval_version){reconUnit=null;return;}
  $('rulesetBadge').textContent='DSL · Midway · US vs Japan · Fog of war';
  $('supportStatus').hidden=true;$('guideToggle').hidden=true;
  $('missionHint').textContent=state.winner?`${names[state.winner]} win the naval operation.`:`Sink both enemy carriers OR earn 6 control points. Sea zone: +1/turn.${state.scenario.island_objectives?.length?' Land a section on each ⚑ outpost: +1/turn.':''}`;
  window.drawFog(svg,state);zone(svg,state);
  if(selected!==reconUnit||smokeMode)reconUnit=null;
  if(unit&&!smokeMode&&!barrageMode&&!reconUnit&&state.turn===state.side){
   for(const move of legal?.moves||[]){const [x,y]=center(...move.pos);svg.append(element('text',{x,y:y+5,class:'move-beacon'},`↗ ${move.cost}`));}
  }
  const myTurn=state.turn===state.side&&!state.winner&&state.ready;
  for(const id of ['recon','repair']){buttons[id].hidden=!myTurn||!legal?.[id]||(id==='recon'&&!legal.recon.length);buttons[id].disabled=busy;}
  buttons.recon.textContent=reconUnit?'Cancel search':'Search aircraft · 1 AP';
  buttons.repair.textContent=`Damage control +${unit?.repair_amount||1} · 2 AP`;
  for(const [id,key,label] of [['airstrike','airstrikes','Air strike'],['torpedo','torpedoes','Torpedoes']]){
   const shot=legal?.[key]?.find(s=>s.id===target);buttons[id].hidden=!myTurn||!shot||!!reconUnit;buttons[id].disabled=busy;
   buttons[id].textContent=`${label} · 2 AP`;
   if(shot&&!reconUnit){$('odds').hidden=false;$('odds').append(chanceRow(label,shot.threshold,null,(shot.effect_text||`Hit: ${shot.damage} hull damage.`)+(shot.aa?' Cruiser AA cover adds +1 to the roll.':'')));}
  }
  if(unit){
   const roles={carrier:`CARRIER · Search radius 3 within ${unit.recon_range} hexes. Air strike range ${unit.strike_range}, ${unit.strike_damage} hull damage. One search and one strike per turn.`,battleship:`BATTLESHIP · Range ${unit.range}; heavy guns deal 3 hull before armor. Armor reduces incoming gun damage by 1.`,cruiser:'CRUISER · Range 6; 2 gun damage before armor. AA cover makes air strikes against ships within 2 hexes harder to hit.',destroyer:`DESTROYER · ${unit.base_ap} base AP. Torpedoes: range ${unit.torpedo_range}, ${unit.torpedo_damage} hull damage, ${unit.torpedoes} salvos left. ${unit.smoke} smoke screens.`};
   const landing=unit.kind==='amphibious',ashore=landing&&!['water','objective'].includes(state.map[unit.pos[1]][unit.pos[0]]),health=landing?'Strength':'Hull';
   roles.amphibious='LANDING SECTION · Move directly from sea to beach to disembark; move back to water to re-embark. Open ground costs 1 AP; jungle/outposts cost 2. Range 2; 1 damage. Hold a flagged outpost to score +1 each turn. One smoke screen.';
   $('roleBrief').textContent=roles[unit.kind];
   $('selection').textContent=`${unitName(unit)}${landing?(ashore?' · Ashore':' · Embarked'):''} · ${health} ${unit.hp}/${unit.max_hp} · ${unit.ap} AP`;
   $('hint').textContent=target?'Choose an available naval attack. Search or close the range if no attack appears.':`Hull ${unit.hp}/${unit.max_hp} · guns ${unit.range} hexes · select an enemy to attack.`;
   if(smokeMode)$('hint').textContent='Tap your unit’s hex to lay smoke · 1 AP.';
   if(landing)$('hint').textContent=`${ashore?'Infantry ashore':'Troops in landing craft'} · bright hexes show legal moves and AP cost. Select a visible enemy for fire.`;
   const meters=$('unitMechanics').querySelector('.unit-meters');$('unitMechanics').replaceChildren();if(meters){meters.querySelector('strong').textContent=`${health} ${unit.hp}/${unit.max_hp}`;$('unitMechanics').append(meters);}
   $('unitMechanics').append(uiNode('p','mechanics-caption',`Base ${unit.base_ap} AP · bank 1 · received ${unit.ap_received}/${unit.base_ap+1}. Damage control: ${unit.repairs} uses left, +${unit.repair_amount} hull for 2 AP. Ships never suffer infantry pins.`));
   if(landing)$('unitMechanics').lastElementChild.textContent=`Base 3 AP · bank 1. One smoke screen; no repair or pinning. Beach: 1 AP. Jungle/outpost: 2 AP. Embark and disembark by moving between land and water.`;
   if(unit.kind==='carrier')$('unitMechanics').append(uiNode('p','mechanics-caption',`Search ${unit.recon_used?'used':'ready'} · air strike ${unit.air_used?'used':'ready'}. Both reset next turn. Escort with a cruiser for AA protection.`));
  }
  const troops=state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter));
  [...$('roster').children].forEach((b,i)=>{const u=troops[i];b.textContent=`${unitCodes[u.kind]} ${u.platoon}${u.number} · ${u.hp>0?`${u.hp}/${u.max_hp} ${u.kind==='amphibious'?'troops':'hull'} · ${u.ap} AP`:'Lost'}`;});
  if(reconUnit){
   $('hint').textContent='Choose a sea hex to search · reveals radius 3 until the enemy turn ends.';
   for(const pos of legal.recon){const tile=element('polygon',{points:hexPoints(...pos),class:'recon-choice',role:'button',tabindex:0,'aria-label':`Search ${String.fromCharCode(65+pos[0])}${pos[1]+1}`});activate(tile,()=>{reconUnit=null;act({kind:'recon',unit:unit.id,pos});});svg.append(tile);}
  }
 };
 document.addEventListener('ww2:playback',()=>{if(state?.naval_version&&playbackSession)zone($('playbackMap'),playbackSession.frames[playbackSession.index][playbackSession.phase]);});
})();
