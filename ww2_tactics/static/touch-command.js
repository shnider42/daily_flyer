/* Current DSL interaction presentation. Never mutates the battle or orders.
 * Animations are decoration on confirmed public events, not speculative rules.
 */
'use strict';
(()=>{
 if(window.ww2TouchCommand)return;
 const get=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const enabled=()=>!!state&&state.ruleset==='dsl'&&state.edition==='current'&&!lobbyMode&&!get('game').hidden&&!document.body.classList.contains('empires-active');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1];
 let frame=0,before=null,previousSelection=null,previousBattle=null,resultKey='',effectTimer=0,portraitKey='',intentKey='',effectFrame=0;
 const preview=make('section',undefined,'touch-target-card');preview.id='touchTargetCard';preview.hidden=true;preview.setAttribute('aria-label','Selected target and legal attacks');
 const targetHeading=make('p','TARGET PREVIEW','touch-eyebrow'),targetName=make('h3'),targetText=make('p'),targetShots=make('div',undefined,'touch-target-shots');preview.append(targetHeading,targetName,targetText,targetShots);document.body.append(preview);
 function clearEffects(){clearTimeout(effectTimer);cancelAnimationFrame(effectFrame);get('touchConfirmedTrail')?.remove();}
 function ownUnit(){return state?.units.find(u=>u.id===selected&&u.side===state.side&&u.hp>0);}
 function portrait(){
  const button=get('mobileOrderToggle'),u=ownUnit();if(!button)return;
  // Dad mode already renders its own enlarged portrait, sometimes of a target.
  if(!enabled()||window.ww2Dad?.enabled||!u){get('touchUnitPortrait')?.remove();button.classList.remove('touch-has-portrait');portraitKey='';return;}
  const signature=JSON.stringify([state.code,u.id,u.hp,u.kind,window.ww2UnitStyle?.style||window.ww2UnitStyle?.value||'',button.querySelector('.selected-unit-name')?.textContent]);
  if(signature!==portraitKey||!get('touchUnitPortrait')){
   get('touchUnitPortrait')?.remove();const art=window.makeUnitPortrait?.(u);
   if(art){const wrap=make('span',undefined,'touch-unit-portrait');wrap.id='touchUnitPortrait';wrap.setAttribute('aria-hidden','true');wrap.append(art);button.prepend(wrap);button.classList.add('touch-has-portrait');}portraitKey=signature;
  }
 }
 function targetPreview(){
  const u=ownUnit(),enemy=enabled()&&target&&(window.signalSnapshot?.(state)||state).units.find(v=>v.id===target&&v.side!==state.side&&v.hp>0);
  const parent=get('dadOrders')||get('mobileUnitDetails')||get('experimentalUnitDetails');
  if(!enabled()||playbackSession||!u||!enemy||!parent){preview.hidden=true;intentKey='';return;}
  // This is only another view of the SAME public legal options; never enables
  // an attack, shows hidden units or computes a hypothetical future shot.
  const l=state.legal?.[u.id]||{},shots=[];
  for(const [field,label]of [['targets',u.kind==='bomber'?'Bomb':'Fire'],['torpedoes','Torpedo'],['airstrikes','Carrier strike'],['grenades','Grenade'],['assaults','Assault']]){
   const s=l[field]?.find(x=>x.id===enemy.id);if(s)shots.push({label,threshold:s.threshold,damage:s.damage});
  }
  const sig=JSON.stringify([state.code,state.revision,u.id,enemy.id,shots,window.ww2Experience?.level]);
  if(sig!==intentKey){intentKey=sig;targetName.textContent=unitName(enemy);targetText.textContent=shots.length?'Selected, not fired. Choose the order below when ready.':'No legal attack from this unit’s current position. Check range, sight, AP and the weapon’s target type.';
   targetShots.replaceChildren(...shots.map(s=>{const item=make('div');item.append(make('strong',s.label),make('span',Number.isFinite(s.threshold)?`${Math.round(Math.max(0,Math.min(6,7-s.threshold))/6*100)}% hit`:'See order details'),make('small',`${s.damage!==undefined?s.damage+' damage · ':''}2 AP${window.ww2Experience?.level==='expert'&&Number.isFinite(s.threshold)?' · '+s.threshold+'+':''}`));return item;}));
  }
  if(preview.parentNode!==parent){const heading=parent.querySelector('.mobile-sheet-heading')||get('unitDetailTitle');heading?heading.after(preview):parent.prepend(preview);}preview.hidden=false;
 }
 function selection(){
  const u=ownUnit(),id=u?.id||null,battle=state?.code+':'+state?.battle_number;
  if(battle!==previousBattle){previousBattle=battle;previousSelection=null;resultKey='';clearEffects();}
  if(id!==previousSelection){
   previousSelection=id;
   if(enabled()&&!reduced.matches&&!playbackSession){const counter=[...get('map').querySelectorAll('.unit[data-unit-id]')].find(n=>n.dataset.unitId===id),frame=counter?.querySelector('rect');if(frame)frame.animate([{strokeWidth:5},{strokeWidth:2.5}],{duration:220,easing:'ease-out'});}
  }
 }
 function feedback(){
  const panel=get('battleFeedback');if(!enabled()||!panel||panel.hidden)return;
  // The existing panel already distinguishes hits, misses, pins and drops.
  // Animate only its border/receipt; do not animate a pretend random dice roll.
  const sig=[state.code,playbackSession?.index,playbackSession?.phase,panel.querySelector('.battle-result-title')?.textContent,panel.querySelector('.battle-result-detail')?.textContent].join('|');
  if(sig===resultKey)return;resultKey=sig;
  if(!reduced.matches)panel.animate([{boxShadow:'inset 0 0 0 2px rgba(226,198,138,.65)'},{boxShadow:'inset 0 0 0 0 rgba(226,198,138,0)'}],{duration:450,easing:'ease-out'});
 }
 function paint(){frame=0;const on=enabled();document.body.classList.toggle('dsl-touch-command',on);
  if(!on){preview.hidden=true;clearEffects();get('touchUnitPortrait')?.remove();get('mobileOrderToggle')?.classList.remove('touch-has-portrait');portraitKey='';return;}
  document.body.dataset.dslTheater=state.air_version?'air':state.naval_version?'naval':'ground';portrait();targetPreview();selection();feedback();
  // Status text is retained; only the action surface is reorganized by CSS.
  const end=get('end');if(end)end.setAttribute('title',state.coop?'Finish only your assigned orders; teammates can continue.':'Finish the whole army’s turn, not only this unit.');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
 function capture(){
  if(!enabled())return null;const u=ownUnit();return u?{code:state.code,battle:state.battle_number||1,revision:state.revision,id:u.id,kind:u.kind,pos:u.pos.slice(),moves:(state.legal?.[u.id]?.moves||[]).map(m=>({pos:m.pos.slice(),path:m.path?.map(p=>p.slice())}))}:null;
 }
 function moveTrail(b){
  clearEffects();if(!enabled()||reduced.matches||!b||state.code!==b.code||(state.battle_number||1)!==b.battle||state.revision<=b.revision||playbackSession)return;
  const u=state.units.find(v=>v.id===b.id&&v.side===state.side&&v.hp>0&&!v.carrier_id);if(!u||same(b.pos,u.pos))return;
  const legal=b.moves.find(m=>same(m.pos,u.pos));if(!legal)return;
  const coordinates=[b.pos,...(legal.path?.length?legal.path:[u.pos])];
  if(coordinates.length>40||!same(coordinates.at(-1),u.pos))return;
  const code=state.code,revision=state.revision;
  effectFrame=requestAnimationFrame(()=>{
   if(!enabled()||state.code!==code||state.revision!==revision||playbackSession||reduced.matches)return;
   const svg=get('map'),g=document.createElementNS(svg.namespaceURI,'g');g.id='touchConfirmedTrail';g.setAttribute('aria-hidden','true');g.setAttribute('pointer-events','none');
   const air=['fighter','bomber','transport_aircraft'].includes(b.kind),sea=['carrier','cruiser','battleship','destroyer','landing_craft'].includes(b.kind);
   g.setAttribute('class',air?'touch-flight-trail':sea?'touch-wake-trail':'touch-ground-trail');
   const points=coordinates.map(p=>center(...p)),path=document.createElementNS(svg.namespaceURI,'path');
   path.setAttribute('d',points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' '));path.setAttribute('class','touch-movement-path');g.append(path);
   if(sea){const [x,y]=points.at(-1);for(const radius of [16,24,32]){const wave=document.createElementNS(svg.namespaceURI,'circle');wave.setAttribute('cx',x);wave.setAttribute('cy',y);wave.setAttribute('r',radius);wave.setAttribute('class','touch-wake');g.append(wave);}}
   // Under counters, never changing their transform or obstructing map input.
   svg.insertBefore(g,svg.querySelector('.unit'));effectTimer=setTimeout(()=>g.remove(),850);
  });
 }
 document.addEventListener('ww2:busy',()=>{if(busy)before=capture();schedule();});
 document.addEventListener('ww2:order',e=>{if(e.detail?.kind==='move'&&e.detail.code===state?.code&&e.detail.battle===(state?.battle_number||1))moveTrail(before);schedule();});
 for(const event of ['ww2:render','ww2:selection','ww2:layout','ww2:experience','ww2:unit-style','ww2:dad-mode'])document.addEventListener(event,schedule);
 document.addEventListener('ww2:playback',()=>{clearEffects();schedule();});document.addEventListener('ww2:before-layout',()=>{preview.hidden=true;document.body.append(preview);clearEffects();});
 new MutationObserver(schedule).observe(get('game'),{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('close',schedule,true);window.addEventListener('resize',schedule);reduced.addEventListener('change',()=>{clearEffects();schedule();});
 window.ww2TouchCommand={sync:schedule};schedule();
})();
