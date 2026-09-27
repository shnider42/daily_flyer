'use strict';
window.orderHelp=(id,u,legal,simple)=>{
 const shot=legal?.targets?.find(s=>s.id===target),frag=legal?.grenades?.find(s=>s.id===target),assault=legal?.assaults?.find(s=>s.id===target);
 const strike=legal?.airstrikes?.find(s=>s.id===target),torpedo=legal?.torpedoes?.find(s=>s.id===target);
 const descriptions={
  dig:['Extra cover','Enemy hit roll +1'],smoke:['Block sight','Blocks sight / 1 enemy turn'],
  overwatch:['React to movement','1 reaction shot / hit roll +1'],rally:['Remove pin','Unpin this unit / 1 AP'],
  fire:['Shoot the target',`${shot?.threshold||4}+ to hit${shot?.damage?` / ${shot.damage} damage`:''}`],
  assault:['Risky close attack',`${assault?.threshold||4}+ / hit 2, fail lose 1`],
  grenade:['Blast and pin',`${frag?.threshold||4}+ / 2 damage + pin`],
  suppress:['Try to pin enemy',state?.dsl_expansion?`${u?.side==='de'?3:5}+ to pin / no damage`:'Automatic pin / no damage'],
  inspire:['Unpin nearby allies',`Unpin allies / radius ${u?.kind==='commander'?2:1}`],
  barrage:['Delayed area pin','Pin radius 1 / after enemy turn'],
  command:['Give troops actions','+1 AP each / eligible troops'],
  load:['Board infantry','1 passenger / 1 infantry AP'],unload:['Put infantry ashore','Adjacent land / 1 infantry AP'],
  airdrop:['Land airborne troops','Spotted open hex / 2 AP'],
  recon:['Reveal sea contacts','Sight radius 3 / 1 enemy turn'],
  airstrike:['Bomb a spotted ship',`${strike?.threshold||3}+ / ${strike?.damage||u?.strike_damage||0} damage`],
  torpedo:['Heavy ship attack',`${torpedo?.threshold||4}+ / ${torpedo?.damage||u?.torpedo_damage||0} damage`],
  repair:['Restore hull',`+${u?.repair_amount||1} hull / once per turn`]
 };
 if(simple&&id==='suppress'&&!state?.dsl_expansion)return 'Pin enemy';
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
   const status=[u.hp<=0?'Lost':`${u.hp}${u.max_hp?'/'+u.max_hp:''} ${state.naval_version&&u.kind!=='amphibious'?'hull':'strength'}`,`${u.ap} AP`,u.pinned?'Pinned':'',u.entrenched?'Dug in':'',u.overwatch?'Overwatch':'',u.reserve?'Reserve':'',u.carrier_id?'Aboard transport':''].filter(Boolean).join(' · ');
   const base=u.base_ap||(state.ruleset==='dsl'&&['leader','commander'].includes(u.kind)?3:2),bank=state.ruleset==='dsl'?(['leader','commander'].includes(u.kind)?2:1):0;
   return [unitName(u),`${sideLabel(u.side)} · ${status}`,unitRoleSummary(u),simple()?'':`Range ${u.range} hexes · ${base} base AP · bank up to ${bank}${u.armor!==undefined?` · armor ${u.armor}`:''}.`,simple()?'':[u.smoke!==undefined?`${u.smoke} smoke`:null,u.grenades!==undefined?`${u.grenades} grenades`:null,u.torpedoes!==undefined?`${u.torpedoes} torpedo salvos`:null].filter(Boolean).join(' · ')];
  }
  if(n.matches('#map > .hex')){
   const x=+n.dataset.x,y=+n.dataset.y,type=state.map[y][x],u=state.units.find(u=>u.id===selected),move=state.legal[selected]?.moves?.find(m=>m.pos[0]===x&&m.pos[1]===y);
   const blocked=u&&(state.naval_version?u.kind!=='amphibious'&&!['water','objective'].includes(type):u.kind==='at_gun'||type==='water'&&u.kind!=='amphibious'||['tank','halftrack','amphibious'].includes(u.kind)&&['woods','building'].includes(type));
   const cover=['woods','building',...(state.naval_version?[]:['objective'])].includes(type),cost=move?.cost??(['woods','building'].includes(type)?2:1);
   const name={field:state.naval_version?'Beach / open ground':'Open ground',woods:state.naval_version?'Jungle':'Woods',building:state.naval_version?'Island outpost':'Buildings',objective:state.naval_version?'Sea-control objective':'Objective',road:'Road',bridge:'Bridge',water:state.naval_version?'Open sea':'Water'}[type]||type;
   let movement=blocked?'Selected unit cannot enter.':move?`Move here: ${cost} AP${move.road_bonus?' · road bonus':''}.`:`Entry cost: ${cost} AP${u?' · not a legal move right now':''}.`;
   if(type==='water'&&!state.naval_version&&!u)movement='Amphibious units only · 1 AP.';
   const coverText=simple()?(cover?'Provides cover.':'No terrain cover.'):(cover?'Cover adds +1 to the required hit roll.':'Cover modifier: +0.');
   return [`${name} · ${String.fromCharCode(65+x)}${y+1}`,movement,coverText,
    ['woods','building'].includes(type)?(simple()?'Blocks sight through this hex.':`Blocks intervening sight.${state.fog_of_war&&!state.naval_version?' Concealed infantry: spot within 2 hexes, or 4 with recon teams.':''}`):'',
    move?.threats?'Enemy overwatch threatens this move.':''];
  }
  if(n.id==='undoOrder'||n.id==='redoOrder')return [n.id==='undoOrder'?'Undo order':'Redo order',n.getAttribute('aria-label'),state.order_history?.reason||''];
  if(n.matches('.tactical-action')){const u=state.units.find(u=>u.id===selected),id=n.closest('#commandOrders')?'command':n.id;
   const details={dig:'Stacks with terrain cover. Lost when moving or assaulting.',smoke:'Choose a marked hex. Smoke blocks shots into, out of, and through it.',overwatch:'Wait for a visible enemy to move in range. Pinning cancels overwatch.',assault:'Adjacent infantry only. A failed assault damages your own unit.',barrage:'Friendly units in the marked area are affected too.',command:`Costs 2 AP. ${u?.kind==='commander'?'Radius 2, across platoons':'Adjacent eligible troops in your platoon'}. Once per command group per turn; banking caps apply.`,load:'The passenger pays the action, not the half-track.',unload:'The passenger pays the action. Enemy overwatch may react.',recon:'Search commits earlier orders; discovered contacts cannot be undone.'};
   return [n.dataset.orderLabel||n.textContent,orderHelp(id,u,state.legal[selected],simple()),simple()?'':details[id]||''];
  }
  return null;
 }
 function show(n){const lines=content(n);if(!lines){hide();return;}if(anchor!==n)hide();anchor=n;n.setAttribute('aria-describedby',tip.id);tip.replaceChildren(...lines.filter(Boolean).map((s,i)=>{const e=document.createElement(i?'p':'strong');e.textContent=s;return e;}));tip.hidden=false;place();}
 const selector='#map > .hex,#map .unit,#roster [data-unit-id],.tactical-action,#undoOrder,#redoOrder';
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
 new MutationObserver(()=>{if($('game').hidden)hide();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
})();
