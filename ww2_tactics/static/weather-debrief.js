/* Public forecasts and factual, army-specific post-battle accounting. */
'use strict';
(()=>{
 const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const weatherBox=node('section',undefined,'weather-brief');weatherBox.id='weatherBrief';weatherBox.hidden=true;weatherBox.setAttribute('aria-label','Weather and confirmed forecast');
 $('missionHint').after(weatherBox);
 const forecast=node('p'),effect=node('p'),details=node('details'),summary=node('summary','Weather rules');
 details.append(summary,node('p','The opening two rounds are clear. Later conditions vary; rain lasts at most two rounds, followed by a clear interval. Both armies get the same conditions and a confirmed two-round forecast. Weather does not reroll when reconnecting or undoing.'),node('p','Haze and rain reduce visual spotting by 2 hexes, to a minimum of 1; radar retains its range. Rain shortens flight legs by 1 hex (minimum 1), raises bomber hit thresholds by 1, and permits one launch per airfield/carrier per own turn. Landing, service, ship movement and fuel costs keep their normal rules.'));
 weatherBox.append(forecast,effect,details);
 const open=node('button','After-battle debrief');open.id='openDebrief';open.type='button';open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-controls','debriefDialog');$('battleReport').append(open);
 const resultOpen=node('button','After-battle debrief');resultOpen.id='resultDebrief';resultOpen.type='button';resultOpen.setAttribute('aria-haspopup','dialog');resultOpen.setAttribute('aria-controls','debriefDialog');$('resultReview').before(resultOpen);
 const dialog=node('dialog');dialog.id='debriefDialog';dialog.setAttribute('aria-labelledby','debriefTitle');
 const close=node('button','Back to battle'),title=node('h2','After-battle debrief'),content=node('div');title.id='debriefTitle';content.id='debriefContent';close.type='button';close.onclick=()=>dialog.close();dialog.append(close,title,content);document.body.append(dialog);
 let dialogKey=null;
 const key=()=>`${state?.code}:${state?.battle_number||1}:${state?.revision}`;
 function metric(list,label,value){list.append(node('dt',label),node('dd',String(value)));}
 function table(headers,rows){const wrap=node('div',undefined,'debrief-table-wrap'),t=node('table'),head=node('thead'),h=node('tr'),body=node('tbody');for(const value of headers){const th=node('th',value);th.scope='col';h.append(th);}head.append(h);for(const values of rows){const row=node('tr');values.forEach(v=>row.append(node('td',String(v))));body.append(row);}t.append(head,body);wrap.append(t);return wrap;}
 function fill(){
  content.replaceChildren();const report=state.debrief;
  title.textContent=`${sideLabel(state.side)} · battle debrief`;
  content.append(node('p',state.battle_result?.reason||'The battle has ended.'),node('p',report?.scope||'Your army and public mission progress.'));
  if(!report){content.append(node('p','Detailed recording is unavailable for this saved battle.'));return;}
  const counts=node('dl',undefined,'debrief-metrics');metric(counts,'Surviving units',report.surviving_units);metric(counts,'Remaining strength',report.surviving_strength);if(report.evacuated)metric(counts,'Safely evacuated',report.evacuated);content.append(counts);
  if(!report.available){content.append(node('p',report.note));return;}
  content.append(node('p',report.complete?(report.preparation_excluded?'Recorded from the start of active play, after pre-battle preparation.':'Recorded from the start of this battle.'):`Partial record: detailed accounting began in round ${report.start_round}. Earlier orders and losses are not reconstructed.`,'debrief-record-note'));
  const s=report.statistics,losses=s.losses;
  content.append(node('h3','Force and operations'));
  const operations=node('dl',undefined,'debrief-metrics');
  for(const [label,value] of [['Units when recording began',s.starting_units],['Combat losses',losses.combat],['Fuel exhaustion losses',losses.fuel],['Lost aboard destroyed bases / transports',losses.aboard],['Other losses',losses.other],['Aircraft lost (all causes)',s.aircraft_lost],['Launches',s.launches],['Successful landings',s.landings],['Aircraft services',s.services],['Strength restored',s.strength_restored],['Attack rolls meeting the threshold',`${s.successful_rolls} / ${s.attack_rolls}`]])metric(operations,label,value);
  content.append(operations,node('p','Counts refer to unit counters, not individual soldiers or aircraft. Successful attack rolls do not necessarily mean a unit was destroyed.'));
  const labels={air_stores:'Service stores',supply_packs:'Supply packs',shells:'Mortar shells',repair_kits:'Repair kits',bombs:'Bomb loads',torpedoes:'Torpedoes',fuel:'Fuel'};
  const used=Object.entries(s.resources).filter(([,n])=>n>0);
  content.append(node('h3','Resources consumed'),used.length?table(['Resource','Used'],used.map(([k,n])=>[labels[k]||k,n])):node('p','No tracked consumables were spent during the recorded period.'));
  const progress=report.progress||[];
  if(progress.length){
   content.append(node('h3',progress[0].label+' over time'));
   const teams=Object.keys(progress[0].values);content.append(table(['Round / checkpoint',...teams.map(sideLabel)],progress.map((p,i)=>[`${p.round} · ${i===0?'recording began':sideLabel(p.side)+' order'}`,...teams.map(t=>`${p.values[t]??0} / ${p.target}`)])));
  }
  if(report.weather?.length)content.append(node('h3','Weather changes'),node('p',report.weather.map(w=>`R${w.round}: ${w.name}`).join(' · ')));
  content.append(node('h3','Recorded highlights'));
  if(!s.events.length)content.append(node('p','No unit losses or objective-score changes were recorded.'));
  else{
   if(s.events_total>s.events.length)content.append(node('p',`Showing the latest ${s.events.length} of ${s.events_total} recorded highlights.`));
   const events=node('ol');for(const e of s.events)events.append(node('li',`Round ${e.round} · ${e.text}`));content.append(events);
  }
  if(playbackKey(state)){
   const replay=node('button','Replay the latest computer turn');replay.type='button';replay.onclick=()=>{dialog.close();startPlayback();};content.append(replay,node('p','The replay covers the retained computer turn. The statistics above cover the recorded battle.'));
  }
 }
 function show(){if(!state?.winner||busy||playbackSession)return;for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();fill();dialogKey=key();dialog.showModal();}
 open.onclick=show;resultOpen.onclick=show;
 function renderWeather(){
  const snapshot=playbackSession?.frames[playbackSession.index]?.[playbackSession.phase],w=snapshot?snapshot.weather:state?.weather;
  const menu=$('mobileBattleMenu')||$('experimentalBattle');
  const anchor=menu?menu.querySelector('.game-title'):document.querySelector('.desktop-battlefield .mission')||$('missionHint');
  if(anchor&&weatherBox.previousElementSibling!==anchor)anchor.after(weatherBox);
  weatherBox.hidden=!w||$('game').hidden||lobbyMode;
  for(const id of ['mobileMenuOpen','experimentalBattleOpen']){
   const button=$(id);if(!button)continue;button.querySelector('.weather-status')?.remove();
   if(w){button.append(node('span',w.current.name,'weather-status'));button.title='Weather and battle reports';button.setAttribute('aria-label',`Battle reports and weather. Now ${w.current.name}. ${w.forecast.map(f=>`Round ${f.round}: ${f.name}`).join('. ')}. Open for forecast and effects.`);}
   else{button.removeAttribute('title');button.removeAttribute('aria-label');}
  }
  if(!w)return;
  weatherBox.dataset.condition=w.current.condition;
  forecast.textContent=`${playbackSession?'REPLAY · ':''}WEATHER · R${w.current.round}: ${w.current.name}`+(w.forecast.length?' → '+w.forecast.map(f=>`R${f.round}: ${f.name}`).join(' → '):' · final round');
  effect.textContent=w.current.description;
  for(const id of ['britainAirfieldContent','carrierAirGroupContent']){
   const parent=$(id);if(!parent)continue;parent.querySelector('.weather-launch-note')?.remove();
   const u=state.units.find(u=>u.id===selected);if(!u||!['airfield','carrier'].includes(u.kind)||u.side!==state.side)continue;
   if(w.current.launch_limit!==null)parent.prepend(node('p',`RAIN · ${u.weather_launches||0}/${w.current.launch_limit} launches used this turn. Landing and service still use normal cycles.`,'weather-launch-note'));
  }
 }
 function sync(){
  renderWeather();open.hidden=!state?.winner;resultOpen.hidden=!state?.winner;
  if(dialog.open&&(!state?.winner||playbackSession||$('game').hidden||lobbyMode||dialogKey!==key()))dialog.close();
 }
 // Keep our panel outside the layout modules' disposable containers while
 // they restore anchors during resizing or changing layout preferences.
 document.addEventListener('ww2:before-layout',()=>document.body.append(weatherBox));
 for(const event of ['ww2:render','ww2:playback','ww2:layout'])document.addEventListener(event,sync);
 window.ww2Debrief={open:show};
})();
