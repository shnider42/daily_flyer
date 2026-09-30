/* The server supplies legal orders and effects; this file only presents them. */
'use strict';
(()=>{
 const labels={loadAP:'Load anti-tank',loadHE:'Load explosive',repairTracks:'Repair tracks',bombard:'Bombard area',artillery:'Call artillery',fieldRecon:'Recon plane',areaFire:'Aim at hex'};
 const buttons={};
 for(const [id,label] of Object.entries(labels)){
  const b=document.createElement('button');b.id=id;b.hidden=true;b.textContent=label;buttons[id]=b;$('nextUnit').before(b);
 }
 for(const [id,ammo] of [['loadAP','ap'],['loadHE','he']])buttons[id].onclick=()=>act({kind:'load_ammo',unit:selected,ammo});
 buttons.repairTracks.onclick=()=>act({kind:'repair_tracks',unit:selected});
 for(const [id,kind] of [['bombard','bombard'],['artillery','artillery'],['fieldRecon','field_recon'],['areaFire','area_fire']])buttons[id].onclick=()=>{
  const cancel=combatMode?.kind===kind;
  document.dispatchEvent(new Event('ww2:cancel-targeting'));
  smokeMode=false;barrageMode=false;target=null;
  combatMode=cancel?null:{kind,unit:selected,revision:state.revision};render();
 };
 window.pickCombatHex=pos=>{
  if(!combatMode||busy||playbackSession||!state.legal[selected]?.[combatMode.kind]?.some(p=>p[0]===pos[0]&&p[1]===pos[1]))return;
  const kind=combatMode.kind,hex=String.fromCharCode(65+pos[0])+(pos[1]+1);
  const help={bombard:'Fire now for 2 AP? A 6 hits this hex. Infantry there is destroyed; adjacent infantry takes 1 damage and pins. Friendly fire applies. Hidden results remain unknown.',
   artillery:'Call artillery for 2 AP? It arrives at the end of the enemy turn. A 4+ hits for 2 damage at this hex; adjacent infantry takes 1 damage and pins. Penetrating hits on 5–6 can disable tracks. Friendly fire applies.',
   field_recon:'Launch a recon plane for 2 AP? Reveals a 3-hex radius through the enemy turn, including concealed troops. This commits earlier orders.'};
  if(kind==='area_fire'){
   const shot=state.legal[selected].area_fire_details.find(s=>s.pos[0]===pos[0]&&s.pos[1]===pos[1]),u=state.units.find(u=>u.id===selected);
   help.area_fire=`Fire ${u.ammo?.toUpperCase()||'explosive'} at this hex for 2 AP? ${shot.fringe?'Speculative fringe: needs 6.':'Needs 5+ to land.'} Unit cover and armor still apply. Heavy rounds damage buildings; damaged buildings collapse and kill everyone inside. Splash may hit friendly troops. Hidden results stay unknown.`;
  }
  if(!confirm(`${hex} · ${help[kind]}`))return;
  combatMode=null;act({kind,unit:selected,pos});
 };
 const manual=uiNode('section','weapon-manual');manual.id='weaponManual';
 manual.innerHTML='<h3>DSL · weapons & command</h3><p>New DSL battles on every map share these effects. An ongoing battle keeps the combat rules saved when it began. Rolls remain one six-sided die; undo/redo preserves the result.</p><p><strong>Protection matters.</strong> Rifle and machine-gun fire cannot damage tanks, armored half-tracks or warships. Only infantry can be pinned. AT rockets and armor-piercing shells deal 2 damage to tanks. AP shells and fixed AT guns deal 3 to light armor; rockets deal 2. A penetrating hit on 5–6 also immobilizes a surviving tracked tank: it cannot move, but it can still fire or overwatch. Repair tracks costs 2 AP, restores movement and does not heal strength.</p><p><strong>Tank ammunition.</strong> Tanks begin with armor-piercing rounds: 2 damage to tanks, 3 to light armor, 1 to infantry or ships. Change to high explosive, or back, for 1 AP. HE deals 2 to the primary infantry target, 1 to light armor and nothing to tanks or warships. A hit also deals 1 damage and pins adjacent infantry, including friendlies. Changing ammunition cancels overwatch. Fire costs 2 AP.</p><p><strong>Mortars.</strong> The marked hex and its neighbors take 1 damage, pin and lose dug-in cover when the delayed barrage lands—but only infantry is affected. Vehicles, tanks, ships and aircraft are immune to mortar fragments. Friendly infantry is affected too.</p><p><strong>Naval fire.</strong> Heavy ship guns need a 6 against infantry; that perfect hit destroys the primary infantry unit and splashes adjacent infantry for 1 damage and a pin. Ships are never pinned. Battleships can also bombard any hex within gun range +3, through fog and terrain, for 2 AP. A 6 hits the aimed hex; other rolls miss. Armor uses normal naval shell damage; adjacent armor takes no fragment damage. Hidden hit results are not revealed.</p><p><strong>Commander.</strong> 3 base AP, bank 2. Rally allies within 4 hexes across platoons for 1 AP. Give eligible non-officers within 4 hexes +1 AP each for 2 AP, once per turn; normal banking caps apply. Each Commander also has two artillery calls and two recon sorties for the whole battle.</p><p><strong>Artillery · 2 AP.</strong> Aim anywhere within 12 hexes, without sight. The marked area warns both players. Impact follows the enemy turn, even if the Commander is lost. A 4+ hits: 2 damage at the aimed hex (1 to ships), plus 1 damage and a pin to adjacent infantry. A penetrating hit on 5–6 also damages tank tracks. Friendly fire applies.</p><p><strong>Recon plane · 2 AP.</strong> Choose a hex within 12. Reveals enemies in a radius of 3, including concealed infantry, through the end of the enemy turn. It does not attack. Recon commits earlier orders; old sightings become last-known contacts when sight expires.</p>';
 $('dslManual').after(manual);
 const structures=uiNode('section','building-manual');structures.id='buildingManual';
 structures.innerHTML='<h3>Buildings · cover or risk?</h3><p><strong>Intact:</strong> solid roof, 2 AP entry, +1 terrain cover. <strong>Damaged:</strong> cracked roof and amber warning, 2 AP entry, +0 terrain cover. <strong>Destroyed:</strong> rubble and ×, no ground entry. Every state still blocks sight and retains building concealment. Dug-in cover remains a separate bonus.</p><p>A successful tank shell, AT shell/rocket, heavy naval shell, bomb or artillery hit takes the primary building down one state. A damaged building collapses, eliminating <strong>every ground unit inside, including friendlies</strong>. Aircraft overhead survive. Adjacent fragments, rifle fire, MGs, flak and hand grenades do not damage structures.</p><p>Mortars roll one extra die when the marked area includes buildings: <strong>5+</strong> damages each building in that area by one state. Infantry fragment damage still happens automatically. Heavy artillery damages only its aimed building; surrounding fragments do not collapse buildings.</p><p>New Stalingrad battles start with roughly 60% intact, 30% damaged and 10% destroyed buildings, randomized once. Other maps start intact. Your map remembers the last observed condition: shelling into fog does not reveal collapses or casualties. Saves and exact-result redo preserve every building state.</p>';
 manual.after(structures);
 const structureKey=uiNode('span','building-condition-key','Buildings: solid roof · cracked ⚠ reduced cover · rubble × blocked');
 document.querySelector('.terrain-legend').append(structureKey);
 const replacements=[
  ['Overwatch · 2 actions','Overwatch · 2 AP. Reserve one reaction shot until your next turn. It uses the loaded weapon and its normal effects, with +1 to the hit threshold. Armored units cannot be pinned; an immobilized tank can still watch and shoot.'],
  ['Machine guns: suppress','Machine guns: suppress · 2 AP. Pin visible infantry on 3+ for Germans or 5+ for Americans (unit details show faction overrides). No strength damage. Armor and ships cannot be suppressed.'],
  ['Leaders: call mortars','Leaders: call mortars · 2 AP. One shared call per army; a marked hex within 6 and its neighbors are struck after the enemy turn. Infantry takes 1 damage, pins and loses dug-in cover. Armor and vehicles are unaffected. Commanders instead have separate long-range artillery.'],
  ['A hit removes 1 strength and pins.','Weapon effects depend on protection. Only infantry can be pinned. Armor can lose strength to penetrating weapons; tracked tanks may be immobilized while retaining their guns. The attack preview shows damage and additional effects.'],
  ['Commanders:','Commanders: 3 AP, bank 2. Rally and grant AP across platoons within 4 hexes. Two long-range artillery calls and two recon sorties per Commander per battle. See Weapons & command above.'],
  ['Armor:','Armor: small arms and mortar fragments cannot damage tanks or armored vehicles. Use armor-piercing shells or AT rockets; tank HE rounds are for infantry and light armor. Penetrating hits on 5–6 can disable tank movement without disabling its gun.'],
  ['Landing sections:','Landing sections: 4 strength, 3 AP, bank 1, range 2 small arms. Move between water and beach to embark/disembark. Jungle and buildings cost 2 AP. They are infantry: they can be pinned, must rally for 1 AP, and cannot damage armor or warships. Heavy naval shells can destroy them on a perfect hit.'],
 ];
 const legacy=[];
 for(const n of $('rules').querySelectorAll('p,li')){
  if(n.closest('#weaponManual'))continue;
  const match=replacements.find(([start])=>n.textContent.startsWith(start));
  if(match)legacy.push({node:n,html:n.innerHTML,text:match[1]});
 }
 let manualVersion=null;
 function manualRules(current){
  if(manualVersion===current)return;manualVersion=current;
  manual.hidden=!current;
  for(const item of legacy){if(current)item.node.textContent=item.text;else item.node.innerHTML=item.html;}
 }
 manualRules(true);
 window.renderWeaponRules=(u,legal,svg)=>{
  structures.hidden=structureKey.hidden=!state.building_version;
  const current=!!state.combat_version;manualRules(current);
  for(const b of Object.values(buttons))b.hidden=true;
  if(!current){combatMode=null;if(state.ruleset==='dsl'){$('legacyNotice').hidden=false;$('rulesetBadge').textContent+=' · Original combat';}return;}
  $('rulesetBadge').textContent+=' · Weapons & armor';
  if(!u)return;
  const available={loadAP:legal?.ammo?.includes('ap'),loadHE:legal?.ammo?.includes('he'),repairTracks:legal?.repair_tracks,
   bombard:legal?.bombard?.length,artillery:legal?.artillery?.length,fieldRecon:legal?.field_recon?.length,areaFire:legal?.area_fire?.length};
  for(const [id,on] of Object.entries(available)){
   const b=buttons[id];b.hidden=!on;b.disabled=busy;
   const kind={fieldRecon:'field_recon',areaFire:'area_fire'}[id]||id;
   b.textContent=combatMode?.kind===kind?'Cancel '+labels[id].toLowerCase():`${labels[id]} · ${id.startsWith('load')?1:2} AP`;
  }
  if(u.ammo){
   $('selection').textContent+=` · ${u.ammo==='he'?'HE':'AP'} loaded${u.immobilized?' · IMMOBILIZED':''}`;
   $('roleBrief').textContent=u.ammo==='he'?'HIGH EXPLOSIVE · 2 damage to infantry, 1 to light armor. A hit splashes adjacent infantry, including yours. Cannot hurt tanks or warships.':'ARMOR PIERCING · 2 damage to tanks, 3 to light armor, 1 to infantry/ships. Penetrating hits on 5–6 can damage tracks.';
   if(u.immobilized)$('hint').textContent='Tracks disabled · can still fire. Repair tracks restores movement for 2 AP.';
  }
  if(u.kind==='commander'){
   $('roleBrief').textContent=`COMMANDER · Support radius ${u.command_radius}. Artillery ${u.artillery_charges}/2 · recon sorties ${u.field_recon_charges}/2. Both reach 12 hexes and cost 2 AP.`;
   if(!target)$('hint').textContent=`Command radius 4 · ${u.artillery_charges} artillery / ${u.field_recon_charges} recon calls left.`;
   if(state.tactics_version)for(const [id,kind] of [['artillery','artillery'],['fieldRecon','field_recon']]){
    const b=buttons[id],ready=u.cooldowns?.[kind]||0,left=u[kind+'_charges']||0;
    b.hidden=false;b.disabled=busy||!available[id];
    if(!available[id])b.textContent=`${labels[id]} · ${!left?'No calls left':ready>state.round?'Ready R'+ready:'Needs 2 AP'}`;
   }
  }
  if(u.kind==='battleship'&&!target)$('hint').textContent=`Guns ${u.range} · bombard ${u.bombard_range} hexes, including unseen positions. Friendly fire applies.`;
  if(state.naval_version&&u.kind==='amphibious'){
   if(u.pinned)$('hint').textContent='Infantry pinned · Rally costs 1 AP.';
   $('unitMechanics').querySelector('.mechanics-caption').textContent='Infantry · small arms cannot damage armor or warships. Can be pinned; rally for 1 AP. Beaches cost 1 AP; jungle/outposts cost 2.';
  }
  const weapon={ap:'Armor piercing',he:'High explosive',small_arms:'Small arms',machine_gun:'Machine-gun fire',rocket:'Anti-tank rockets',at_shell:'Anti-tank shells',naval_shell:'Naval shells',air_gun:'Aircraft guns',flak:'Anti-aircraft fire',bomb:'Aerial bombs',none:'Unarmed'}[u.ammo||u.weapon]||u.weapon;
  $('unitMechanics').prepend(uiNode('p','weapon-summary',`${weapon} · ${(u.protection||'infantry').replaceAll('_',' ')}${u.immobilized?' · tracks disabled; gun operational':''}`));
  if(combatMode){
   const descriptions={bombard:'Tap a marked hex · blind bombardment · 6 hits · friendly fire.',artillery:'Tap a marked hex · artillery lands after enemy turn · friendly fire.',field_recon:'Tap a marked hex · recon reveals radius 3 through the enemy turn.',area_fire:'Tap a marked hex · 5+ to land, 6 on the outer fringe · friendly fire.'};
   $('hint').textContent=descriptions[combatMode.kind];
   svg.querySelectorAll('.move-beacon').forEach(n=>n.remove());
  }
 };
})();
