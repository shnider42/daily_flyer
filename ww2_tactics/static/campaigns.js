/* Theater-specific presentation. Existing games retain their own versioned rules. */
'use strict';
(()=>{
 const operations=[['tidal_gate','Operation Tidal Gate · 36×44 · combined-arms operation'],['stalingrad','Stalingrad · 18×20 · street fighting'],['britain','Battle of Britain · 22×18 · air playtest'],['omaha','Omaha Beach · 18×20 · landing craft'],['carentan','Carentan · 18×22 · airborne causeways'],['market_garden','Market Garden · 22×28 · river corridor']];
 for(const id of ['scenarioSelect','soloScenario','rematchScenario']){
  for(const [value,label] of operations){const option=document.createElement('option');option.value=value;option.textContent=label+' · DSL';$(id).append(option);}
  $(id).addEventListener('change',()=>{if(operations.some(([value])=>value===$(id).value))$(id==='scenarioSelect'?'rulesetSelect':id==='soloScenario'?'soloRuleset':'rematchRuleset').value='dsl';});
 }
 const manual=document.createElement('section');manual.id='campaignManual';
 manual.innerHTML='<h3>Three new theaters · fictional tactical layouts</h3><p><strong>Stalingrad:</strong> Soviets counterattack through dense factory blocks. Soviet engineers have three smoke and three frag grenades; Soviet small arms suppress on 4+, German on 3+. Neither receives the US accuracy bonus. Tanks need the streets. Capture the factory post and hold for two Soviet turn endings; Germans defend for 22 rounds.</p><p><strong>Omaha Beach:</strong> four landing craft each carry a separate infantry unit. Craft have 5 strength, 3 AP, two smoke screens and no weapons; water only. Load or unload costs the passenger 1 AP. Unload onto empty adjacent land, risking overwatch. Passengers cannot shoot, spot or command while aboard. If sunk beside unoccupied land, passengers escape with 1 less strength, pinned and 0 AP; otherwise they are lost. Amphibious sections are separate self-contained units that move directly onto land. German MGs and guns begin watching the approach. Capture the beach exit and hold for two American turn endings within 24 rounds.</p><h3>Battle of Britain · air playtest v1</h3><p><strong>Mission:</strong> the Luftwaffe must destroy both RAF sector stations. RAF wins by destroying every bomber, or by keeping at least one station at the end of round 18. Station locations and destruction are public; current enemy strength is not. The central star is a geographic reference, not a capture objective.</p><p><strong>Flight:</strong> spend 1 AP to fly a straight leg up to 3 hexes for fighters or 2 for bombers. Terrain never changes flight cost or blocks aircraft sight. You may fly over ground units, but cannot finish on another unit or pass through another aircraft. Each intervening hex can trigger interception. RAF fighters have 4 base AP; German fighters and bombers 3. Bank 1 unused AP. This first sandbox has no altitude, fuel, facing or mandatory forward movement.</p><p><strong>Weapons:</strong> attacks cost 2 AP. Fighters have range 3: hit bombers on 4+, fighters on 5+, for 1 damage. Fixed AA has range 5: 4+ versus bombers, 5+ versus fighters, for 2 damage. Fighters and AA cannot attack ground targets. Bombers hit ground targets within 1 hex on 3+ for 2 damage; two bomb loads. Aircraft never suffer infantry pins or terrain cover penalties.</p><p><strong>Interception:</strong> spend 2 AP on Intercept / AA cover to reserve one reaction along a visible enemy flight path until your next turn. Fighter reactions add +1 to the hit roll; AA does not. Multiple watchers may react, but each fires once. Initial RAF AA is already covering the Channel. Orange destinations warn only of known threats along the full leg; unseen AA may still react.</p><p><strong>Radar and service:</strong> radar spots aircraft within 10 hexes, even across terrain, but does not reveal distant ground targets. Planes spot ground installations within 4 hexes. Alongside a surviving friendly airfield, Service costs 2 AP to repair 1 strength and refill a bomber to two loads, once per turn. Losing radar removes its spotting; destroying an airfield removes its service. Fog, last-known contacts, replays, saves and locked-dice redo remain enabled.</p>';
 $('rules').append(manual);
 const airborne=uiNode('section');airborne.id='airborneManual';
 airborne.innerHTML='<h3>Carentan & Market Garden · fictional tactical layouts</h3><p><strong>Carentan · 18×22 · 24 rounds.</strong> Americans advance south over flooded causeways into a defended town, with deployed paratroopers, airborne reserves and an armored linkup. Germans defend with rifle troops, longer-range MGs, a half-track and a fixed AT gun. Towers overlook the street approaches. Capture the road junction and hold for two American turn endings.</p><p><strong>Market Garden · 22×28 · 34 rounds.</strong> US and British airborne groups begin forward of a British armored relief column. Two river belts and three bridge routes funnel movement; an amphibious section offers a risky alternative. Link the pockets and hold the northern command post for two Allied turn endings. Germans can counterattack with armor and a half-track; they have no airborne drop action.</p><p><strong>Asymmetry:</strong> US infantry accuracy and German suppression advantages remain. British infantry has no US accuracy bonus and suppresses on 4+, between US 5+ and German 3+. One British Firefly-style tank trades the usual Allied 3 AP / range 6 for 2 AP / range 8; German tanks retain their greater strength. Both sides have vulnerable sniper teams. This is a balance playtest, not a historical order of battle.</p><p><strong>Existing maps:</strong> new Stalingrad battles now have a sniper team per army and two observation towers. Shared support, repair and explosive area-fire rules apply wherever a unit has that capability, including naval and air maps. Ongoing saves are unchanged.</p>';
 manual.after(airborne);
 const service=document.createElement('button');service.id='rearm';service.hidden=true;service.textContent='Service · 2 AP';$('nextUnit').before(service);service.onclick=()=>act({kind:'rearm',unit:selected});
 const roles={fighter:'FIGHTER · Fly up to 3 hexes per AP. Attack aircraft only, range 3. Intercept reserves one reaction along an enemy flight path.',bomber:'BOMBER · Fly up to 2 hexes per AP. Bomb ground targets within 1 hex: 2 AP, one bomb load. Return beside a friendly airfield to reload.',aa_gun:'ANTI-AIRCRAFT GUN · Fixed position, range 5, 2 damage. AA cover reserves one reaction along an enemy flight path.',radar:'RADAR · Automatically spots aircraft within 10 hexes. No actions or weapons. Does not reveal distant ground installations.',airfield:'AIRFIELD · Adjacent friendly aircraft may spend 2 AP to repair 1 strength and reload, once per turn. RAF sector stations are the bombing objectives.'};
 window.renderCampaign=(unit,legal,svg)=>{
  const air=!!state.air_version,city=state.scenario.id==='stalingrad',beach=state.scenario.id==='omaha';
  document.body.classList.toggle('air-battle',air);document.body.classList.toggle('city-battle',city);document.body.classList.toggle('beach-battle',beach);
  service.hidden=true;svg.querySelectorAll('.flight-trail').forEach(n=>n.remove());
  if((air||beach)&&unit&&!smokeMode&&!barrageMode&&state.turn===state.side)for(const m of legal?.moves||[]){const [x,y]=center(...m.pos);svg.append(element('text',{x,y:y+5,class:'move-beacon'},`↗ ${m.cost}`));}
  if(city&&unit&&!unit.carrier_id){
   if(unit.kind==='squad')$('roleBrief').textContent=`RIFLES · No US accuracy bonus in this theater. Suppress on ${unit.suppression}+ using the fire die. Buildings conceal infantry beyond 2 hexes; scouts spot within 4.`;
   if(unit.kind==='engineer')$('roleBrief').textContent=`ENGINEERS · ${unit.smoke} smoke and ${unit.grenades} frag grenades remaining. Use smoke to cross streets and grenades to attack infantry in cover.`;
   if(unit.kind==='mg')$('roleBrief').textContent=`MG · Suppress on ${unit.suppression}+ for 2 AP, no damage. Range ${unit.side==='de'?6:4} hexes.`;
  }
  if(!air)return;
  window.drawFog(svg,state);
  $('rulesetBadge').textContent='DSL · Battle of Britain · Air playtest v1';$('supportStatus').hidden=true;
  $('objectiveName').textContent='RAF SECTOR STATIONS';$('objective').textContent=`Stations lost: ${state.raid_destroyed?.length||0} / 2`;
  $('missionHint').textContent=state.winner?`${names[state.winner]} win the air battle.`:state.side==='us'?'Protect at least one station through round 18, or shoot down every bomber.':'Destroy both RAF sector stations before round 18 ends. Escort your bombers.';
  $('manualAP').textContent='Aircraft: fighters fly up to 3 hexes per AP; bombers 2. All attacks cost 2 AP. No terrain cover, altitude or fuel. Full air-playtest rules below.';
  document.querySelector('.terrain-legend').textContent='Bright hex: flight destination · Orange: known interception along route · Terrain does not block flight';
  service.hidden=!legal?.rearm;service.disabled=busy;service.textContent='Service · 2 AP';
  if(unit){
   const flying=['fighter','bomber'].includes(unit.kind);
   $('roleBrief').textContent=roles[unit.kind];
   $('selection').textContent=`${unitName(unit)} · ${unit.hp}/${unit.max_hp} strength · ${unit.ap} AP${unit.kind==='bomber'?` · ${unit.bombs} bombs`:''}`;
   if(!target)$('hint').textContent=flying?`Tap a bright destination · up to ${unit.flight} hexes for 1 AP. ${unit.kind==='bomber'?`${unit.bombs} bomb loads remaining.`:'Select an enemy aircraft to attack.'}`:unit.kind==='aa_gun'?'Select an enemy aircraft to fire, or set AA cover.':roles[unit.kind];
   const meters=$('unitMechanics').querySelector('.unit-meters');$('unitMechanics').replaceChildren();if(meters)$('unitMechanics').append(meters);
   $('unitMechanics').append(uiNode('p','mechanics-caption',`Base ${unit.base_ap} AP · bank ${unit.base_ap?1:0} · range ${unit.range}. ${flying?'Terrain does not add cover or block flight.':'Fixed installation; cannot move.'}${unit.kind==='bomber'?` Bomb loads ${unit.bombs}/2.`:''}${unit.overwatch?' Interception ready.':''}`));
  }
  if(!svg.querySelector('.station-mark'))for(const [i,pos] of state.scenario.airfields.us.entries()){
   const [x,y]=center(...pos),lost=(state.raid_destroyed||[]).some(p=>p[0]===pos[0]&&p[1]===pos[1]);
   svg.append(element('text',{x,y:y+43,class:'station-mark','text-anchor':'middle'},`STATION ${i+1}${lost?' · LOST':''}`));
  }
 };
 function previewPath(e){
  if(!state?.air_version)return;const svg=$('map');svg.querySelector('.flight-trail')?.remove();
  const hex=e.target.closest('.hex.move'),u=state.units.find(u=>u.id===selected);if(!hex||!u)return;
  const move=state.legal[selected]?.moves.find(m=>m.pos[0]===+hex.dataset.x&&m.pos[1]===+hex.dataset.y);if(!move)return;
  svg.append(element('polyline',{points:[u.pos,...move.path].map(p=>center(...p).join(',')).join(' '),class:'flight-trail','aria-hidden':'true'}));
 }
 $('map').addEventListener('pointerover',e=>{if(e.pointerType==='mouse')previewPath(e);});$('map').addEventListener('focusin',previewPath);
 $('map').addEventListener('pointerleave',()=>$('map').querySelector('.flight-trail')?.remove());
})();
