'use strict';
window.orderHelp=(id,u,legal,simple,depthOverride)=>{
 const level=depthOverride||(simple?'simple':window.ww2Experience?.level||'expert');
 const roleHelp=window.groundRoleHelp?.(id,u);if(roleHelp&&level==='expert')return roleHelp;
 const shot=legal?.targets?.find(s=>s.id===target),frag=legal?.grenades?.find(s=>s.id===target),assault=legal?.assaults?.find(s=>s.id===target);
 const strike=legal?.airstrikes?.find(s=>s.id===target),torpedo=legal?.torpedoes?.find(s=>s.id===target);
 const ap=u?.weapon_overrides?.ap||{},he=u?.weapon_overrides?.he||{};
 const descriptions={
  resupply:['Deliver shells or repair kits',`2 AP + 1 pack / adjacent ally / ${u?.supply_packs||0} packs left`],
  evacuate:['Rescue the passenger','Top sea edge / 1 boat AP / marked infantry aboard'],
  radioUpdate:['Share old sightings, not live tracking',`${u?.kind==='radioman'?1:2} AP / dated reports / once per round`],
  observe:[u?.observing?'Observing: +2 sight active':'Look farther: +2 sight',`${legal?.observation?.sight??'Current'} sight / weapon range ${u?.range??'unchanged'} / 1 AP`],
  spotFire:['Direct platoon fire','Observe first, then mark one visible hex for 1 AP. Same-platoon guns gain -1 to hit; mortars need 4+ instead of 5+.'],
  mortarFire:[`Delayed blast · ${u?.shells||0} shells left`,`2 AP + 1 shell / range 2–${u?.mortar_range||8} / once per round`],
  conceal:['Hide in cover, not invisibility','2 AP / concealment −1 hex / moving or firing ends it'],
  demolition:['Charge adjacent armor','2 AP + 1 charge / 4+ hit / 2 damage'],
  callAirborne:['Risk a reserve drop anywhere','3 AP / 1 lift per round / natural 1 loses squad'],
  markLZ:['Reduce drop scatter','2 AP / one beacon / aims within 2 hexes'],
  breach:['Open a vehicle route','Adjacent bocage / 2 AP / opens sight'],
  clearWreck:['Reopen a ruined hex','Adjacent collapse / 2 AP / leaves cover'],
  bridgeGap:['Create a crossing',`3 AP / one-hex gap / ${u?.bridge_kits||0} kits`],
  areaFire:['Aim anywhere marked','5+ lands / outer fringe 6 / friendly fire'],
  repairTank:[`Heal tank · ${u?.repair_kits||0} kits`,`+1 strength & tracks / ${u?.repair_kits||0} kits`],
  snipe:[u?.ap<3?'Bank AP for aimed shot':'Accurate shot · exposes you','3+ base / 1 damage + pin / exposed'],
  loadAP:['Pierce armor',`${ap.damage??2} vs tanks / ${ap.light_damage??3} vs light armor`],loadHE:[he.splash===0?'Target infantry · no splash':'Blast infantry · splash',`${he.infantry_damage??2} vs infantry / ${he.splash===0?'no splash':'1 adjacent'}`],
  repairTracks:['Restore movement','Fix tracks / no strength healed'],
  bombard:['Aim beyond sight','6 hits / gun range +3'],
  artillery:['Delayed heavy strike',`4+ / range 12 / ${u?.artillery_charges||0} calls`],
  fieldRecon:['Reveal hidden troops',`Sight radius 3 / ${u?.field_recon_charges||0} sorties`],
  dig:['Extra cover','Enemy hit roll +1'],smoke:['Block sight','Blocks sight / 1 enemy turn'],
  overwatch:['React to movement','1 reaction shot / hit roll +1'],rally:['Remove pin','Unpin this unit / 1 AP'],
  fire:['Shoot a visible target',shot?`${shot.threshold}+ to hit${shot.damage?` / ${shot.damage} damage`:''}`:`Weapon range ${u?.range||0} / select target for odds`],
  assault:['Risky close attack',`${assault?.threshold||4}+ / hit 2, fail lose 1`],
  grenade:['Blast and pin',`${frag?.threshold||4}+ / 2 damage + pin`],
  suppress:['Try to pin enemy',state?.dsl_expansion||state?.combat_version?`${u?.suppression??(u?.side==='de'?3:5)}+ to pin / no damage`:'Automatic pin / no damage'],
  inspire:['Unpin nearby allies',`Unpin allies / radius ${u?.command_radius??(u?.kind==='commander'?2:1)}`],
  barrage:state?.combat_version?['Blast infantry later','1 damage + pin / radius 1']:['Delayed area pin','Pin radius 1 / after enemy turn'],
  command:['Give troops actions','+1 AP each / eligible troops'],
  load:['Board infantry','1 passenger / 1 infantry AP'],unload:['Put infantry ashore','Adjacent land / 1 infantry AP'],
  airdrop:['Land airborne troops','Spotted open hex / 2 AP'],
  recon:['Reveal sea contacts','Sight radius 3 / 1 enemy turn'],
  airstrike:['Bomb a spotted ship',strike?`${strike.threshold}+ / ${strike.damage} damage`:`Range ${u?.strike_range||0} / select target for odds`],
  torpedo:['Heavy ship attack',torpedo?`${torpedo.threshold}+ / ${torpedo.damage} damage`:`Range ${u?.torpedo_range||0} / select target for odds`],
  repair:['Restore hull',`+${u?.repair_amount||1} hull / once per turn`],
  rearm:['Repair and reload','+1 strength / bomber loads → 2']
 };
 if(state?.air_version||state?.joint_ops_version&&['fighter','bomber','aa_gun'].includes(u?.kind)){descriptions.overwatch=['Cover flight paths',`1 reaction / ${u?.kind==='aa_gun'?'normal hit roll':'hit roll +1'}`];if(u?.kind==='bomber')descriptions.fire=['Bomb surface target',`${shot?.threshold||3}+ / ${shot?.damage||2} damage / 1 load`];}
 if(state?.joint_ops_version&&u?.kind==='flak')descriptions.overwatch=['Guard ground and air','1 reaction / air range 4 / ground range '+u.range];
 if(state?.air_support_version===1){
  descriptions.rearm=['Use a supplied friendly field','+1 strength / full bombs / 1 finite store'];
  if(u?.ship_aa_range)descriptions.overwatch=['Guard flight paths',`1 reaction / range ${u.ship_aa_range} / 1 damage / aircraft only`];
 }
 if(state?.scenario?.fleet_battle_version){
  if(u?.ship_aa_range)descriptions.overwatch=['Guard flight paths',`1 reaction / range ${u.ship_aa_range} / aircraft only`];
  descriptions.rearm=['Service at own carrier',`+1 strength${u?.kind==='bomber'?` / loads → ${u.max_bombs}`:''} / 1 finite store`];
  if(u?.naval_strike)descriptions.fire=[u.variant==='torpedo_bomber'?'Torpedo spotted ship':'Dive-bomb spotted ship',`${shot?.threshold||u.attack_threshold}+ / ${shot?.damage||(u.variant==='torpedo_bomber'?4:3)} hull / 1 load`];
 }
 if(state?.scenario?.night_ops_version){
  descriptions.spotlightAim=['Reveal an air corridor','1 AP / aim range 8 / emitter becomes visible'];
  descriptions.pathfinderFlare=['Light both armies’ view','2 AP / radius 2 / guides drops and helps enemy AA'];
  descriptions.nightDrop=['Drop near this Dakota','3 AP / aim within 1 hex / one finite squad / scatter die'];
  descriptions.rearm=['Use own platoon field',`+1 strength / full ordnance / one finite store`];
 }
 if(state?.joint_ops_version)descriptions.airstrike[0]='Carrier sortie · surface target';
 if(simple&&id==='suppress'&&!state?.dsl_expansion&&!state?.combat_version)return 'Pin enemy';
 if(level==='moderate'){
  const chance=s=>s?`${Math.round(Math.max(0,Math.min(6,7-s.threshold))/6*100)}% hit${s.damage?' · '+s.damage+' damage':''}`:null;
  const tactical={fire:chance(shot)||`Range ${u?.range||0} · select a visible target for odds`,grenade:chance(frag)||'Close blast · finite grenade supply',assault:assault?`${chance(assault)} · a miss hurts your team`:'Adjacent attack · a miss hurts your team',airstrike:chance(strike)||`Strike range ${u?.strike_range||0} · needs a spotted ship`,torpedo:chance(torpedo)||`Range ${u?.torpedo_range||0} · finite torpedoes`,overwatch:'Spend AP now · one possible reaction later',dig:'Protection while stationary · ends on movement',smoke:'Blocks both armies’ sight · finite supply',suppress:'Pinning denies actions · no strength damage',rally:'Remove pin · 1 AP · does not heal',inspire:'Officer removes eligible nearby pins',command:'Give eligible troops 1 AP · check recipients',bombard:'Attack beyond sight · low accuracy · friendly fire',artillery:'Delayed area strike · finite calls · friendly fire',areaFire:'Hex attack · check area and friendly-fire risk',snipe:'Accurate infantry shot · 3 AP · reveals your team',demolition:'Adjacent armor · finite charge · can miss',spotFire:'Observe first · helps same-platoon fire',rearm:'Repair and reload · needs a suitable supplied base'};
  return tactical[id]||descriptions[id]?.[0]||(roleHelp?roleHelp.split(/(?<=\.)\s/)[0]:'');
 }
 return descriptions[id]?.[level==='simple'?0:1]||(roleHelp?roleHelp.split(/(?<=\.)\s/)[0]:'');
};
(()=>{
 const tip=document.createElement('div');tip.id='battleTooltip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
 const historyHelp=document.createElement('p');historyHelp.id='historyHelp';$('battleOptions').append(historyHelp);
 let anchor=null,point=null;
 const simple=()=>window.ww2Experience?.level==='simple';
 function hide(){tip.hidden=true;if(anchor)anchor.removeAttribute('aria-describedby');anchor=null;}
 function place(){if(tip.hidden||!anchor)return;const r=anchor.getBoundingClientRect(),x=point?.x??r.left+r.width/2,y=point?.y??r.bottom;
  const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,x+12))+'px';tip.style.top=Math.max(8,y+18+h>innerHeight?y-h-14:y+18)+'px';}
 function content(n){
  if(!state||lobbyMode||playbackSession)return null;
  const id=n.dataset.unitId;
  if(id){const u=state.units.find(u=>u.id===id);if(!u)return null;
   const status=[u.hp<=0?'Lost':`${u.hp}${u.max_hp?'/'+u.max_hp:''} ${state.naval_version&&u.kind!=='amphibious'?'hull':'strength'}`,`${u.ap} AP`,u.pinned?'Pinned':'',u.immobilized?'Tracks disabled · gun operational':'',u.ammo?u.ammo.toUpperCase()+' loaded':'',u.entrenched?'Dug in':'',u.overwatch?'Overwatch':'',u.reserve?'Reserve':'',u.carrier_id?'Aboard transport':''].filter(Boolean).join(' · ');
   const base=u.base_ap??(state.ruleset==='dsl'&&['leader','commander'].includes(u.kind)?3:2),bank=base&&state.ruleset==='dsl'&&!u.landing_limited?(['leader','commander'].includes(u.kind)?2:1):0;
   return [unitName(u),`${sideLabel(u.side)} · ${status}`,unitRoleSummary(u),simple()?'':`Range ${u.range} hexes · ${base} base AP · bank up to ${bank}${u.armor!==undefined?` · armor ${u.armor}`:''}.`,simple()?'':[u.smoke!==undefined?`${u.smoke} smoke`:null,u.grenades!==undefined?`${u.grenades} grenades`:null,u.torpedoes!==undefined?`${u.torpedoes} torpedo salvos`:null].filter(Boolean).join(' · ')];
  }
  if(n.matches('#map > .hex')){
   const x=+n.dataset.x,y=+n.dataset.y,type=state.map[y][x],u=state.units.find(u=>u.id===selected),move=state.legal[selected]?.moves?.find(m=>m.pos[0]===x&&m.pos[1]===y);
   const condition=buildingCondition(state,[x,y]);
   if(state.air_version||state.joint_ops_version&&(['fighter','bomber'].includes(u?.kind)||window.fubarLayer?.()==='air'))return [`Airspace · ${hexColumn(x)}${y+1}`,move?.path?`Fly here: 1 AP${state.britain_ops_version?' + 1 fuel':''} · ${move.path.length} hexes.`:u&&['fighter','bomber'].includes(u.kind)?'Not a legal flight destination right now.':'Select an aircraft to fly.','Terrain does not block flight or provide cover.',move?.threats?'Spotted anti-aircraft threat along this path; readiness unknown.':'Unseen interceptors may still react.'];
   if(state.joint_ops_version&&['carrier','battleship','cruiser','destroyer'].includes(u?.kind))return [`Surface · ${hexColumn(x)}${y+1}`,move?`Sail here: ${move.cost} AP.`:type==='water'?'Water · not a legal destination right now.':'Warships cannot enter land or bridges.','Aircraft above this hex do not block movement.'];
   if(window.fieldworksTerrainHelp&&state.fieldworks_version){const help=window.fieldworksTerrainHelp(type,u,move,condition,[x,y]);if(help)return help;}
   const blocked=condition==='destroyed'||u&&(state.naval_version?u.kind!=='amphibious'&&!['water','objective'].includes(type):u.kind==='at_gun'||type==='water'&&u.kind!=='amphibious'||['tank','halftrack','amphibious'].includes(u.kind)&&['woods','building','tower','church'].includes(type));
   const cover=['woods','building','tower','church',...(state.naval_version?[]:['objective'])].includes(type)&&condition!=='damaged',cost=move?.cost??(['woods','building','tower','church'].includes(type)?2:1);
   const name={field:state.naval_version?'Beach / open ground':'Open ground',woods:state.naval_version?'Jungle':'Woods',building:state.naval_version?'Island outpost':'Buildings',tower:'Clock tower',church:'Church & bell tower',objective:state.naval_version?'Sea-control objective':'Objective',road:'Road',bridge:'Bridge',water:state.naval_version?'Open sea':'Water'}[type]||type;
   let movement=condition==='destroyed'?'Collapsed · ground entry blocked.':u?.immobilized?'Tracks disabled. Repair for 2 AP to move again.':blocked?'Selected unit cannot enter.':move?`Move here: ${cost} AP${move.road_bonus?' · road bonus':''}.`:`Entry cost: ${cost} AP${u?' · not a legal move right now':''}.`;
   if(type==='water'&&!state.naval_version&&!u)movement='Amphibious units only · 1 AP.';
   const coverText=simple()?(cover?'Provides cover.':'No terrain cover.'):(cover?'Cover adds +1 to the required hit roll.':'Cover modifier: +0.');
   return [`${name}${condition?' · '+condition:''} · ${hexColumn(x)}${y+1}`,movement,condition?buildingHelp(condition,simple()):coverText,
    ['tower','church'].includes(type)?(simple()?'High ground: see farther; enemies see you farther too.': 'Recon/sniper sight 12; other occupants 8. Concealment spotting 6. Occupants visible from up to 12. Looks over one low obstacle, never smoke; direct shots still need clear lanes. Sniper aimed range +2, no recon weapon bonus.'):'',
    ['woods','building'].includes(type)?(simple()?'Blocks sight through this hex.':`Blocks intervening sight.${state.fog_of_war&&!state.naval_version?' Concealed infantry: spot within 2 hexes, or 4 with recon teams.':''}`):'',
    condition&&state.fog_of_war?'Last observed condition; unseen damage stays unknown.':'',
    move?.threats?(state.signals_version?'Spotted enemy firing lane; actual overwatch readiness is unknown.':'Enemy overwatch threatens this move.'):'Hidden threats may still exist.'];
  }
  if(n.id==='undoOrder'||n.id==='redoOrder')return [n.id==='undoOrder'?'Undo order':'Redo order',n.getAttribute('aria-label'),state.order_history?.reason||''];
  if(n.dataset.help)return [n.getAttribute('aria-label')||n.textContent,n.dataset.help];
  if(n.matches('.tactical-action')){const u=state.units.find(u=>u.id===selected),id=n.closest('#commandOrders')?'command':n.id;
   const details={dig:'Stacks with terrain cover. Lost when moving or assaulting.',smoke:'Choose a marked hex. Smoke blocks shots into, out of, and through it.',overwatch:'Wait for a visible enemy to move in range. Pinning cancels overwatch.',assault:'Adjacent infantry only. A failed assault damages your own unit.',barrage:'Friendly units in the marked area are affected too.',command:`Costs 2 AP. ${u?.kind==='commander'?'Radius 2, across platoons':'Adjacent eligible troops in your platoon'}. Once per command group per turn; banking caps apply.`,load:'The passenger pays the action, not the half-track.',unload:'The passenger pays the action. Enemy overwatch may react.',recon:'Search commits earlier orders; discovered contacts cannot be undone.'};
   if(state.air_version||state.joint_ops_version&&['fighter','bomber','aa_gun'].includes(u?.kind)){details.overwatch='Checks every intervening hex, not just the destination. One reaction per watcher; terrain does not block it.';details.rearm='Beside a living friendly airfield. Once per turn, 2 AP. No service from enemy or destroyed airfields.';}
   if(state.scenario.fleet_battle_version){
    details.rearm='Within one hex of your own platoon’s living carrier. Once per aircraft per turn, 2 aircraft AP. Consumes one of six finite carrier stores; restores 1 strength and that bomber’s full ordnance capacity.';
    if(u?.ship_aa_range)details.overwatch=`One aircraft reaction along a flight path within ${u.ship_aa_range} hexes. Moving or firing this ship cancels it. Does not react to surface movement.`;
   }
   if(state.combat_version)Object.assign(details,{fire:state.legal[selected]?.targets?.find(s=>s.id===target)?.effect_text||'',command:`Costs 2 AP. Radius ${u?.command_radius||1}; Commander affects all platoons. Banking caps apply.`,loadAP:'Changes ammunition for 1 AP and cancels overwatch. Anti-tank shells penetrate armor; no adjacent splash.',loadHE:'Changes ammunition for 1 AP and cancels overwatch. Hits splash adjacent infantry, including friendlies; cannot damage tanks or ships.',repairTracks:'Restores movement for 2 AP. Does not heal strength. A disabled tank can still fire before repair.',bombard:'2 AP, no sight required. A natural 6 hits the aimed hex; all other rolls miss. Primary infantry is destroyed; adjacent infantry takes 1 damage and pins. Friendly fire applies.',artillery:'2 AP, range 12, two calls per battle. Lands after the enemy turn on 4+. Penetrating high hits can damage tracks. Marked neighbors contain infantry splash; friendly fire applies.',fieldRecon:'2 AP, range 12, two sorties per battle. Reveals radius 3 through the enemy turn, including concealed units. Commits earlier orders.'});
   Object.assign(details,{areaFire:'2 AP. Heavy rounds damage the aimed structure. A damaged structure collapses and kills all ground occupants. Surface shots cannot pass through intervening obstacles; the extra one-hex fringe needs 6. Hidden casualties stay hidden.',repairTank:'Adjacent friendly tank only, once per tank per round. Costs 2 engineer AP and one kit. Restores 1 strength and fixes tracks; no overhealing or reviving wrecks.',snipe:'Visible infantry only, clear firing lane, 3 AP. Hits on 3+ before cover; 1 damage and pin. Misses do not pin. Firing exposes your team through the enemy turn.'});
   if(state.tactics_version&&['artillery','fieldRecon'].includes(id))details[id]+=' Independent cooldown: skip your next turn before reusing this ability.';
   return [n.dataset.orderLabel||n.textContent,orderHelp(id,u,state.legal[selected],simple()),n.dataset.orderReason?'Unavailable: '+n.dataset.orderReason+'.':'Ready to order.',simple()?'':details[id]||''];
  }
  return null;
 }
 function show(n){const lines=content(n);if(!lines){hide();return;}if(anchor!==n)hide();anchor=n;n.setAttribute('aria-describedby',tip.id);tip.replaceChildren(...lines.filter(Boolean).map((s,i)=>{const e=document.createElement(i?'p':'strong');e.textContent=s;return e;}));if(window.ww2Dad?.enabled&&n.dataset.unitId){const u=state.units.find(u=>u.id===n.dataset.unitId);if(u&&window.makeUnitPortrait)tip.prepend(makeUnitPortrait(u));}tip.hidden=false;place();}
 const make=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text!==undefined)n.textContent=text;return n;};
 const inspectButton=make('button','hexInspectOpen','Inspect hex');inspectButton.type='button';inspectButton.setAttribute('aria-pressed','false');inspectButton.setAttribute('aria-describedby','hexInspectExplanation');$('guideToggle').after(inspectButton);
 const inspectStatus=make('button','hexInspectStatus','Inspecting hexes · Done');inspectStatus.type='button';inspectStatus.hidden=true;document.body.append(inspectStatus);
 const inspectDialog=make('dialog','hexInspectDialog');inspectDialog.setAttribute('aria-labelledby','hexInspectTitle');
 const inspectClose=make('button','hexInspectClose','Inspect another hex'),inspectDone=make('button','hexInspectDone','Return to orders'),inspectTitle=make('h2','hexInspectTitle','Inspect a hex'),inspectBody=make('div','hexInspectBody');inspectClose.type=inspectDone.type='button';
 inspectDialog.append(inspectClose,inspectTitle,make('p','hexInspectExplanation','Inspection spends no AP and gives no order. Dragging still pans the map.'),inspectBody,inspectDone);document.body.append(inspectDialog);
 let inspecting=false,inspected=null,inspectBattle='',inspectFrame=0;
 const terrainPurpose={field:'Open ground is easy to cross but offers little protection.',woods:'Woods can protect infantry and block sight through the hex. They can slow movement.',building:'Buildings protect infantry but can be damaged by heavy weapons.',tower:'High ground helps observation, while making its occupants easier to spot.',church:'This high building helps observation, but also exposes its occupants to detection.',road:'A road can help ground units move efficiently. Check the highlighted move cost.',bridge:'A bridge provides a route across water. Check that the next hex is legal for this unit.',water:'Ships, boats and amphibious troops use water differently. Check the selected unit’s legal destinations.',mountain:'Mountains protect infantry and block sight. Mountain-trained troops cross them more easily; vehicles cannot enter.',ridge:'Ridges protect infantry and block sight. They can slow troops and block vehicles.',desert:'Open desert offers no cover. Think about exposure before crossing.',dune:'Dunes can slow vehicles without providing cover.',wadi:'A wadi gives infantry cover without blocking sight through it. Vehicles cannot enter.',oasis:'Palm cover protects infantry and blocks sight; vehicles cannot enter.',beach:'A beach is open landing ground with no cover.',marsh:'Flooded ground slows ordinary infantry and blocks most vehicles.',bocage:'Hedgerows provide infantry cover and block sight. Vehicles need an engineer to open a gap.',bunker:'A strongpoint protects infantry, but heavy weapons can damage and collapse it.',causeway:'A causeway is a road across flooded ground. It offers no cover.',rubble:'Cleared rubble slows movement and offers cover without blocking sight.',objective:'This is a marked objective. Read the mission before assuming that reaching it is enough to win.'};
 function positionInspect(){
  if(inspectStatus.hidden||inspectFrame)return;inspectFrame=requestAnimationFrame(()=>{inspectFrame=0;if(inspectStatus.hidden)return;const r=$('mapWrap').getBoundingClientRect();inspectStatus.style.left=Math.max(8,r.left+8)+'px';inspectStatus.style.top=Math.max(r.top+8,Math.min(innerHeight-52,r.bottom-52))+'px';inspectStatus.style.maxWidth=Math.max(100,Math.min(230,r.width-24))+'px';});
 }
 function stopInspect(){inspecting=false;inspected=null;inspectDialog.close();inspectStatus.hidden=true;inspectButton.setAttribute('aria-pressed','false');$('mapWrap').classList.remove('inspecting-hexes');document.dispatchEvent(new Event('ww2:inspection'));}
 function beginInspect(){
  if(!state||$('game').hidden||lobbyMode||playbackSession)return;
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  inspecting=true;inspectBattle=state.code+':'+state.battle_number;inspectStatus.hidden=false;inspectButton.setAttribute('aria-pressed','true');$('mapWrap').classList.add('inspecting-hexes');positionInspect();hide();document.dispatchEvent(new Event('ww2:inspection'));notify('Inspect hex: tap a space to read it. No move or attack will be issued. Choose Done to return to orders.');
 }
 function fillInspection(pos){
  const [x,y]=pos,n=$('map').querySelector(`.hex[data-x="${x}"][data-y="${y}"]`);if(!n)return;
  const full=content(n)||[],level=window.ww2Experience?.level||'simple',u=state.units.find(v=>v.id===selected),move=state.legal?.[selected]?.moves?.find(m=>m.pos[0]===x&&m.pos[1]===y),type=state.map[y][x],condition=buildingCondition(state,pos);
  const visible=!state.fog_of_war||(state.visible_hexes||[]).some(p=>Array.isArray(p)?p[0]===x&&p[1]===y:p===x+','+y);
  const own=state.units.filter(v=>v.hp>0&&!v.reserve&&!v.carrier_id&&v.pos[0]===x&&v.pos[1]===y&&(v.side===state.side||visible));
  inspectTitle.textContent=full[0]||'Hex '+hexColumn(x)+(y+1);inspectBody.replaceChildren();inspectDialog.dataset.experience=level;
  inspectBody.append(make('p',null,visible?'Currently observed terrain.':'Outside current sight. This is your map information; unseen changes and enemy occupancy are unconfirmed.'));
  const legalText=move?`For ${unitName(u)}: this is a legal move costing ${move.cost} AP${move.road_bonus?' with a road bonus':''}.`:u?'This is not a legal destination for the selected unit right now.':'Select a unit after inspection to see its legal moves.';
  inspectBody.append(make('p','hexInspectMove',legalText));
  if(level==='simple'){
   inspectBody.append(make('p',null,full[0]?.startsWith('Airspace')?'Aircraft fly above terrain. Check flight paths and visible interception warnings.':terrainPurpose[type]||'Terrain can affect movement, protection and sight. Open the full explanation below for this hex.'));
   if(condition==='damaged'||condition==='destroyed')inspectBody.append(make('p',null,buildingHelp(condition,true)));
  }else for(const line of full.slice(1).filter(Boolean))inspectBody.append(make('p',null,line));
  inspectBody.append(make('p','hexInspectOccupants',own.length?'Visible occupants: '+own.map(unitName).join(', ')+'.':visible?'No currently visible unit occupies this hex. Concealed enemies may still be present.':'Enemy occupancy is unknown here.'));
  if(move?.threats)inspectBody.append(make('p',null,'This move has a known threat warning. Inspection does not reveal hidden enemies or secret readiness.'));
  if(level!=='expert'){const more=make('details','hexInspectRules');more.append(make('summary',null,'Full terrain explanation'),...full.slice(1).filter(Boolean).map(line=>make('p',null,line)));inspectBody.append(more);}
 }
 function inspectTap(event){
  if(!inspecting||playbackSession)return;
  if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
  const n=event.target.closest('#map .hex,#map .unit');
  event.preventDefault();event.stopImmediatePropagation();
  let pos;if(n?.matches('.hex'))pos=[+n.dataset.x,+n.dataset.y];else if(n?.dataset.unitId)pos=state.units.find(v=>v.id===n.dataset.unitId)?.pos;
  if(!pos){notify('Tap a hex to inspect its terrain. Choose Done to return to orders.');return;}
  inspected=pos.slice();fillInspection(inspected);if(!inspectDialog.open)inspectDialog.showModal();
 }
 // These run after the existing desktop and touch drag guards on mapWrap.
 // A completed drag is suppressed before it can become an inspection tap.
 $('mapWrap').addEventListener('click',inspectTap,true);$('mapWrap').addEventListener('keydown',inspectTap,true);
 inspectButton.onclick=()=>inspecting?stopInspect():beginInspect();inspectStatus.onclick=inspectDone.onclick=stopInspect;inspectClose.onclick=()=>inspectDialog.close();
 window.ww2BattleHelp={inspect:beginInspect,stopInspect,get inspecting(){return inspecting;}};
 new ResizeObserver(positionInspect).observe($('mapWrap'));window.addEventListener('resize',positionInspect);window.addEventListener('scroll',positionInspect,{passive:true});
 document.addEventListener('ww2:selection',()=>{if(inspecting)stopInspect();});document.addEventListener('ww2:before-layout',()=>{if(inspecting)stopInspect();});
 document.addEventListener('ww2:experience',()=>{hide();if(inspectDialog.open&&inspected)fillInspection(inspected);});
 const selector='#map > .hex,#map .unit,#roster [data-unit-id],.tactical-action,#undoOrder,#redoOrder,[data-help]';
 document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse'||!matchMedia('(hover:hover)').matches)return;const n=e.target.closest(selector);point={x:e.clientX,y:e.clientY};if(n)show(n);else hide();});
 document.addEventListener('pointermove',e=>{if(!tip.hidden&&e.pointerType==='mouse'){point={x:e.clientX,y:e.clientY};place();}});
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hide();});
 document.addEventListener('focusin',e=>{const n=e.target.closest(selector);if(n&&matchMedia('(hover:hover)').matches){point=null;show(n);}else hide();});
 document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide);document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});window.addEventListener('scroll',hide,true);
 for(const kind of ['undo','redo'])$(kind+'Order').onclick=()=>act({kind});
 function sync(){
  hide();inspectButton.disabled=!state||!!playbackSession;inspectButton.hidden=!state||$('game').hidden||lobbyMode;
  if(inspecting&&(!state||$('game').hidden||lobbyMode||playbackSession||inspectBattle!==state.code+':'+state.battle_number))stopInspect();
  if(inspecting&&inspectDialog.open&&inspected)fillInspection(inspected);
  if(!state)return;const h=state.order_history||{};
  historyHelp.textContent='Undo / redo: up to 20 recent orders this turn. New sightings, searches and End turn commit earlier orders. Combat redo keeps the exact dice; different orders are blocked until those results are restored. '+(h.reason||'');
  document.querySelectorAll('#map .unit-art-title').forEach(n=>n.remove());
  document.querySelectorAll('#roster [title]').forEach(n=>n.removeAttribute('title'));
  for(const kind of ['undo','redo']){const b=$(kind+'Order');b.disabled=busy||!!playbackSession||!h['can_'+kind];b.setAttribute('aria-label',`${kind==='undo'?'Undo':'Redo'}${h[kind+'_label']?' '+h[kind+'_label']:' order'}. ${h.reason||'No recent order.'}`);}
  if(h.redo_required&&!playbackSession){$('hint').textContent='Dice already revealed: redo to keep the same result before giving new orders.';$('end').disabled=true;}
 }
 document.addEventListener('ww2:render',sync);document.addEventListener('ww2:playback',sync);
 document.addEventListener('ww2:dad-mode',hide);
 new MutationObserver(()=>{if($('game').hidden)hide();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
})();
