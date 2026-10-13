/* Clear, persistent results from the server's public reports. No dice or rules run here. */
'use strict';
(()=>{
 const panel=uiNode('section','battle-feedback');panel.id='battleFeedback';panel.hidden=true;
 window.ww2ResultFeedback={enabled:true};
 panel.setAttribute('aria-label','Latest battle result');
 const announced=uiNode('span','battle-result-announcement');announced.id='battleResultAnnouncement';
 announced.setAttribute('role','status');announced.setAttribute('aria-live','polite');announced.setAttribute('aria-atomic','true');
 const die=uiNode('div','battle-result-die'),copy=uiNode('div','battle-result-copy'),label=uiNode('p','battle-result-label'),title=uiNode('strong','battle-result-title'),detail=uiNode('p','battle-result-detail'),cargo=uiNode('p','battle-result-cargo');
 const close=uiNode('button','battle-result-dismiss','×');close.type='button';close.setAttribute('aria-label','Dismiss battle result');close.title='Dismiss this result; it remains in Battle reports';
 panel.append(die,copy,close,announced);copy.append(label,title,detail,cargo);$('game').append(panel);
 let battle=null,current=null,dismissed=null,announcedKey=null,frame=null;
 const hex=pos=>`${hexColumn(pos[0])}${pos[1]+1}`;
 function cargoText(snapshot,report){
  const troop=snapshot.units?.find(u=>u.id===report.unit),transport=troop?.drop_transport;
  if(transport){
   const plane=snapshot.units.find(u=>u.id===transport),squads=snapshot.units.filter(u=>u.drop_transport===transport);
   return `${plane?unitName(plane):'Assigned Dakota'} · ${squads.filter(u=>u.reserve&&u.hp>0).length}/${squads.length} squads aboard`;
  }
  const count=(snapshot.units||[]).filter(u=>u.side===state.side&&u.kind==='paratrooper'&&u.reserve&&u.hp>0).length;
  return `${count} airborne squad${count===1?'':'s'} in reserve`;
 }
 function dropResult(snapshot,report){
  let heading,description,tone='lost';
  if(report.roll===1){heading='SQUAD LOST · ROLLED 1';description='Paratroopers did not reach the ground. No sight established.';}
  else if(!report.landed){
   heading=/approach/i.test(report.result)?'SQUAD LOST ON APPROACH':/outside/i.test(report.result)?'SCATTERED OFF MAP':'NO SAFE LANDING';
   description=report.result||'The squad was lost before establishing sight.';
  }else if(report.survived===false){heading='SQUAD LOST AFTER LANDING';description=`Landed at ${hex(report.pos)}, then destroyed by reaction fire.`;}
  else{
   heading='PARATROOPERS LANDED';tone='hit';
   const landing=report.diverted?'Landing diverted':report.scatter?`Scattered ${report.scatter} hex${report.scatter===1?'':'es'}`:'Exact drop';
   description=`${hex(report.pos)} · 1 AP on arrival · ${landing}${report.guided?' · guided':''}.`;
   if(report.rough)description+=' Rough landing: −1 strength.';
   if(report.afloat)description+=' In water: −2 strength each own turn until ashore.';
  }
  return {key:`drop:${report.revision}:${report.unit}`,roll:report.roll,label:`Airborne drop · round ${report.round}`,title:heading,detail:description,cargo:cargoText(snapshot,report),tone};
 }
 function combatResult(event){
  const damageMiss=/^(?:miss|no damage)/i.test(event.result||''),suppressed=/^suppressed/i.test(event.result||''),success=event.roll!==undefined&&event.threshold!==undefined&&event.roll>=event.threshold;
  const outcome=event.roll!==undefined&&event.threshold!==undefined?(success?'HIT':suppressed?'PINNED · NO DAMAGE':'MISS'):damageMiss?'MISS':'RESULT';
  return {key:`combat:${event.sequence??event.revision}:${event.kind}`,roll:event.roll,label:`${event.kind}${event.round?` · round ${event.round}`:''}`,title:outcome,
   detail:`${event.roll!==undefined?`Rolled ${event.roll}${event.threshold!==undefined?` · needed ${event.threshold}+`:''}. `:''}${event.result||'Order resolved.'}`,cargo:'',tone:success||suppressed?'hit':damageMiss||outcome==='MISS'?'miss':'neutral'};
 }
 function latest(snapshot,events=null){
  const report=snapshot.airlift_report,event=events?events.at(-1):snapshot.last_combat;
  if(report&&(!event||report.revision>=(event.revision||0)))return dropResult(snapshot,report);
  return event?combatResult(event):null;
 }
 function place(){
  const screen=$('mobileBattleScreen')||$('experimentalDesktopScreen');
  if(screen){if(panel.parentElement!==screen)screen.append(panel);return;}
  const column=document.querySelector('.desktop-command-column');
  if(column){if(panel.parentElement!==column)column.prepend(panel);return;}
  if(panel.parentElement!==$('game'))$('mapWrap').after(panel);
 }
 function paint(result){
  const visible=!!result&&result.key!==dismissed&&!$('game').hidden;
  panel.hidden=!visible;document.body.classList.toggle('battle-result-visible',visible);
  fitMobileResult(visible);
  if(!visible)return;
  panel.dataset.tone=result.tone;label.textContent=result.label;title.textContent=result.title;detail.textContent=result.detail;cargo.textContent=result.cargo;cargo.hidden=!result.cargo;
  die.replaceChildren();die.hidden=result.roll===undefined;
  if(result.roll!==undefined){die.append(dieFace(result.roll),uiNode('span','battle-result-roll',`D6 · ${result.roll}`));}
  if(announcedKey!==result.key){announcedKey=result.key;announced.textContent=`${result.label}. ${result.roll!==undefined?'Rolled '+result.roll+'. ':''}${result.title}. ${result.detail} ${result.cargo}`;}
 }
 function fitMobileResult(visible){
  const screen=$('mobileBattleScreen');if(!screen)return;
  // The mobile surface has several portrait, landscape and Dad layouts.
  // Start with that layout's existing rows, then reserve a result row without
  // changing its navigation, command capacity or responsive breakpoints.
  screen.style.removeProperty('grid-template-areas');screen.style.removeProperty('grid-template-rows');
  panel.hidden=true;
  if(!visible)return;
  const css=getComputedStyle(screen),areas=[...css.gridTemplateAreas.matchAll(/"([^"]+)"/g)].map(match=>match[1]),rows=css.gridTemplateRows.split(' ');
  if(areas.length<3){panel.hidden=false;return;}
  const columns=areas[0].trim().split(/\s+/).length,rightOrders=areas[1].includes('orders'),index=rightOrders?1:2,height=innerHeight<680?88:104;
  const original=rows.slice(0,areas.length);original[1]='minmax(0,1fr)';
  areas.splice(index,0,rightOrders?'map result':Array(columns).fill('result').join(' '));original.splice(index,0,`${height}px`);
  screen.style.gridTemplateAreas=areas.map(area=>`"${area}"`).join(' ');screen.style.gridTemplateRows=original.join(' ');panel.hidden=false;
 }
 function sync(){
  if(!state||$('game').hidden){paint(null);return;}
  const key=`${state.code}:${state.battle_number||1}`;
  if(key!==battle){battle=key;current=dismissed=announcedKey=null;}
  if(playbackSession){
   const entry=playbackSession.frames[playbackSession.index];
   current=playbackSession.phase==='after'&&entry?latest(entry.after,entry.combat):null;
  }else current=latest(state);
  place();paint(current);
  // Other presentation layers may mount later in the same render event.
  cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{place();paint(current);});
 }
 close.onclick=()=>{dismissed=current?.key;paint(current);};
 for(const event of ['ww2:render','ww2:playback','ww2:layout','ww2:experience'])document.addEventListener(event,sync);
 window.addEventListener('resize',sync);
 new MutationObserver(()=>{if($('game').hidden)paint(null);}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 sync();
})();
