'use strict';
window.orderHelp=(id,u,legal,simple)=>{
 const shot=legal?.targets?.find(s=>s.id===target),frag=legal?.grenades?.find(s=>s.id===target),assault=legal?.assaults?.find(s=>s.id===target);
 const strike=legal?.airstrikes?.find(s=>s.id===target),torpedo=legal?.torpedoes?.find(s=>s.id===target);
 const descriptions={
  breach:['Open a vehicle route','Adjacent bocage / 2 AP / opens sight'],
  clearWreck:['Reopen a ruined hex','Adjacent collapse / 2 AP / leaves cover'],
  bridgeGap:['Create a crossing',`3 AP / one-hex gap / ${u?.bridge_kits||0} kits`],
  areaFire:['Aim anywhere marked','5+ lands / outer fringe 6 / friendly fire'],
  repairTank:[`Heal tank · ${u?.repair_kits||0} kits`,`+1 strength & tracks / ${u?.repair_kits||0} kits`],
  snipe:[u?.ap<3?'Bank AP for aimed shot':'Accurate shot · exposes you','3+ base / 1 damage + pin / exposed'],
  loadAP:['Pierce armor','2 vs tanks / 3 vs light armor'],loadHE:['Blast infantry · splash','2 vs infantry / 1 adjacent'],
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
 if(state?.air_version){descriptions.overwatch=['Cover flight paths',`1 reaction / ${u?.kind==='aa_gun'?'normal hit roll':'hit roll +1'}`];if(u?.kind==='bomber')descriptions.fire=['Bomb ground target',`${shot?.threshold||3}+ / 2 damage / 1 load`];}
 if(simple&&id==='suppress'&&!state?.dsl_expansion&&!state?.combat_version)return 'Pin enemy';
 return descriptions[id]?.[simple?0:1]||'';
};
(()=>{
 const tip=document.createElement('div');tip.id='battleTooltip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
 const historyHelp=document.createElement('p');historyHelp.id='historyHelp';$('battleOptions').append(historyHelp);
 let anchor=null,point=null;
 const simple=()=>document.body.classList.contains('simple-play');
 function hide(){tip.hidden=true;if(anchor)anchor.removeAttribute('aria-describedby');anchor=null;}
 function place(){if(tip.hidden||!anchor)return;const r=anchor.getBoundingClientRect(),x=point?.x??r.left+r.width/2,y=point?.y??r.bottom;
  const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,x+12))+'px';tip.style.top=Math.max(8,y+18+h>innerHeight?y-h-14:y+18)+'px';}
 function content(n){
  if(!state||lobbyMode||playbackSession)return null;
  const id=n.dataset.unitId;
  if(id){const u=state.units.find(u=>u.id===id);if(!u)return null;
   const status=[u.hp<=0?'Lost':`${u.hp}${u.max_hp?'/'+u.max_hp:''} ${state.naval_version&&u.kind!=='amphibious'?'hull':'strength'}`,`${u.ap} AP`,u.pinned?'Pinned':'',u.immobilized?'Tracks disabled · gun operational':'',u.ammo?u.ammo.toUpperCase()+' loaded':'',u.entrenched?'Dug in':'',u.overwatch?'Overwatch':'',u.reserve?'Reserve':'',u.carrier_id?'Aboard transport':''].filter(Boolean).join(' · ');
   const base=u.base_ap??(state.ruleset==='dsl'&&['leader','commander'].includes(u.kind)?3:2),bank=base&&state.ruleset==='dsl'?(['leader','commander'].includes(u.kind)?2:1):0;
   return [unitName(u),`${sideLabel(u.side)} · ${status}`,unitRoleSummary(u),simple()?'':`Range ${u.range} hexes · ${base} base AP · bank up to ${bank}${u.armor!==undefined?` · armor ${u.armor}`:''}.`,simple()?'':[u.smoke!==undefined?`${u.smoke} smoke`:null,u.grenades!==undefined?`${u.grenades} grenades`:null,u.torpedoes!==undefined?`${u.torpedoes} torpedo salvos`:null].filter(Boolean).join(' · ')];
  }
  if(n.matches('#map > .hex')){
   const x=+n.dataset.x,y=+n.dataset.y,type=state.map[y][x],u=state.units.find(u=>u.id===selected),move=state.legal[selected]?.moves?.find(m=>m.pos[0]===x&&m.pos[1]===y);
   const condition=buildingCondition(state,[x,y]);
   if(state.air_version)return [`Airspace · ${hexColumn(x)}${y+1}`,move?`Fly here: 1 AP · ${move.path.length} hexes.`:u&&['fighter','bomber'].includes(u.kind)?'Not a legal flight destination right now.':'Select an aircraft to fly.','Terrain does not block flight or provide cover.',move?.threats?'Known interception covers this flight path.':'Unseen interceptors may still react.'];
   if(window.fieldworksTerrainHelp&&state.fieldworks_version){const help=window.fieldworksTerrainHelp(type,u,move,condition,[x,y]);if(help)return help;}
   const blocked=condition==='destroyed'||u&&(state.naval_version?u.kind!=='amphibious'&&!['water','objective'].includes(type):u.kind==='at_gun'||type==='water'&&u.kind!=='amphibious'||['tank','halftrack','amphibious'].includes(u.kind)&&['woods','building','tower'].includes(type));
   const cover=['woods','building','tower',...(state.naval_version?[]:['objective'])].includes(type)&&condition!=='damaged',cost=move?.cost??(['woods','building','tower'].includes(type)?2:1);
   const name={field:state.naval_version?'Beach / open ground':'Open ground',woods:state.naval_version?'Jungle':'Woods',building:state.naval_version?'Island outpost':'Buildings',tower:'Clock / church tower',objective:state.naval_version?'Sea-control objective':'Objective',road:'Road',bridge:'Bridge',water:state.naval_version?'Open sea':'Water'}[type]||type;
   let movement=condition==='destroyed'?'Collapsed · ground entry blocked.':u?.immobilized?'Tracks disabled. Repair for 2 AP to move again.':blocked?'Selected unit cannot enter.':move?`Move here: ${cost} AP${move.road_bonus?' · road bonus':''}.`:`Entry cost: ${cost} AP${u?' · not a legal move right now':''}.`;
   if(type==='water'&&!state.naval_version&&!u)movement='Amphibious units only · 1 AP.';
   const coverText=simple()?(cover?'Provides cover.':'No terrain cover.'):(cover?'Cover adds +1 to the required hit roll.':'Cover modifier: +0.');
   return [`${name}${condition?' · '+condition:''} · ${hexColumn(x)}${y+1}`,movement,condition?buildingHelp(condition,simple()):coverText,
    type==='tower'?(simple()?'High ground: see farther; enemies see you farther too.': 'Recon/sniper sight 12; other occupants 8. Concealment spotting 6. Occupants visible from up to 12. Looks over one low obstacle, never smoke; direct shots still need clear lanes. Sniper aimed range +2, no recon weapon bonus.'):'',
    ['woods','building'].includes(type)?(simple()?'Blocks sight through this hex.':`Blocks intervening sight.${state.fog_of_war&&!state.naval_version?' Concealed infantry: spot within 2 hexes, or 4 with recon teams.':''}`):'',
    condition&&state.fog_of_war?'Last observed condition; unseen damage stays unknown.':'',
    move?.threats?'Enemy overwatch threatens this move.':''];
  }
  if(n.id==='undoOrder'||n.id==='redoOrder')return [n.id==='undoOrder'?'Undo order':'Redo order',n.getAttribute('aria-label'),state.order_history?.reason||''];
  if(n.dataset.help)return [n.getAttribute('aria-label')||n.textContent,n.dataset.help];
  if(n.matches('.tactical-action')){const u=state.units.find(u=>u.id===selected),id=n.closest('#commandOrders')?'command':n.id;
   const details={dig:'Stacks with terrain cover. Lost when moving or assaulting.',smoke:'Choose a marked hex. Smoke blocks shots into, out of, and through it.',overwatch:'Wait for a visible enemy to move in range. Pinning cancels overwatch.',assault:'Adjacent infantry only. A failed assault damages your own unit.',barrage:'Friendly units in the marked area are affected too.',command:`Costs 2 AP. ${u?.kind==='commander'?'Radius 2, across platoons':'Adjacent eligible troops in your platoon'}. Once per command group per turn; banking caps apply.`,load:'The passenger pays the action, not the half-track.',unload:'The passenger pays the action. Enemy overwatch may react.',recon:'Search commits earlier orders; discovered contacts cannot be undone.'};
   if(state.air_version){details.overwatch='Checks every intervening hex, not just the destination. One reaction per watcher; terrain does not block it.';details.rearm='Beside a living friendly airfield. Once per turn, 2 AP. No service from enemy or destroyed airfields.';}
   if(state.combat_version)Object.assign(details,{fire:state.legal[selected]?.targets?.find(s=>s.id===target)?.effect_text||'',command:`Costs 2 AP. Radius ${u?.command_radius||1}; Commander affects all platoons. Banking caps apply.`,loadAP:'Changes ammunition for 1 AP and cancels overwatch. Anti-tank shells penetrate armor; no adjacent splash.',loadHE:'Changes ammunition for 1 AP and cancels overwatch. Hits splash adjacent infantry, including friendlies; cannot damage tanks or ships.',repairTracks:'Restores movement for 2 AP. Does not heal strength. A disabled tank can still fire before repair.',bombard:'2 AP, no sight required. A natural 6 hits the aimed hex; all other rolls miss. Primary infantry is destroyed; adjacent infantry takes 1 damage and pins. Friendly fire applies.',artillery:'2 AP, range 12, two calls per battle. Lands after the enemy turn on 4+. Penetrating high hits can damage tracks. Marked neighbors contain infantry splash; friendly fire applies.',fieldRecon:'2 AP, range 12, two sorties per battle. Reveals radius 3 through the enemy turn, including concealed units. Commits earlier orders.'});
   Object.assign(details,{areaFire:'2 AP. Heavy rounds damage the aimed structure. A damaged structure collapses and kills all ground occupants. Surface shots cannot pass through intervening obstacles; the extra one-hex fringe needs 6. Hidden casualties stay hidden.',repairTank:'Adjacent friendly tank only, once per tank per round. Costs 2 engineer AP and one kit. Restores 1 strength and fixes tracks; no overhealing or reviving wrecks.',snipe:'Visible infantry only, clear firing lane, 3 AP. Hits on 3+ before cover; 1 damage and pin. Misses do not pin. Firing exposes your team through the enemy turn.'});
   if(state.tactics_version&&['artillery','fieldRecon'].includes(id))details[id]+=' Independent cooldown: skip your next turn before reusing this ability.';
   return [n.dataset.orderLabel||n.textContent,orderHelp(id,u,state.legal[selected],simple()),n.dataset.orderReason?'Unavailable: '+n.dataset.orderReason+'.':'Ready to order.',simple()?'':details[id]||''];
  }
  return null;
 }
 function show(n){const lines=content(n);if(!lines){hide();return;}if(anchor!==n)hide();anchor=n;n.setAttribute('aria-describedby',tip.id);tip.replaceChildren(...lines.filter(Boolean).map((s,i)=>{const e=document.createElement(i?'p':'strong');e.textContent=s;return e;}));if(window.ww2Dad?.enabled&&n.dataset.unitId){const u=state.units.find(u=>u.id===n.dataset.unitId);if(u&&window.makeUnitPortrait)tip.prepend(makeUnitPortrait(u));}tip.hidden=false;place();}
 const selector='#map > .hex,#map .unit,#roster [data-unit-id],.tactical-action,#undoOrder,#redoOrder,[data-help]';
 document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse'||!matchMedia('(hover:hover)').matches)return;const n=e.target.closest(selector);point={x:e.clientX,y:e.clientY};if(n)show(n);else hide();});
 document.addEventListener('pointermove',e=>{if(!tip.hidden&&e.pointerType==='mouse'){point={x:e.clientX,y:e.clientY};place();}});
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hide();});
 document.addEventListener('focusin',e=>{const n=e.target.closest(selector);if(n&&matchMedia('(hover:hover)').matches){point=null;show(n);}else hide();});
 document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide);document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});window.addEventListener('scroll',hide,true);
 for(const kind of ['undo','redo'])$(kind+'Order').onclick=()=>act({kind});
 function sync(){
  hide();if(!state)return;const h=state.order_history||{};
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
