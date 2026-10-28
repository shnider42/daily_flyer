/* Public forecasts and factual, army-specific post-battle accounting. */
'use strict';
(()=>{
 const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const experience=()=>window.ww2Experience?.level||'simple';
 const weatherBox=node('section',undefined,'weather-brief');weatherBox.id='weatherBrief';weatherBox.hidden=true;weatherBox.setAttribute('aria-label','Weather and confirmed forecast');
 $('missionHint').after(weatherBox);
 const forecast=node('p'),effect=node('p'),details=node('details'),summary=node('summary','Weather rules');
 details.append(summary,node('p','The opening two rounds are clear. Later conditions vary; rain lasts at most two rounds, followed by a clear interval. Both armies get the same conditions and a confirmed two-round forecast. Weather does not reroll when reconnecting or undoing.'),node('p','Haze and rain reduce visual spotting by 2 hexes, to a minimum of 1; radar retains its range. Rain shortens flight legs by 1 hex (minimum 1), raises bomber hit thresholds by 1, and permits one launch per airfield/carrier per own turn. Landing, service, ship movement and fuel costs keep their normal rules.'));
 weatherBox.append(forecast,effect,details);
 const open=node('button','After-battle debrief');open.id='openDebrief';open.type='button';open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-controls','debriefDialog');$('battleReport').append(open);
 const resultOpen=node('button','After-battle debrief');resultOpen.id='resultDebrief';resultOpen.type='button';resultOpen.setAttribute('aria-haspopup','dialog');resultOpen.setAttribute('aria-controls','debriefDialog');$('resultReview').before(resultOpen);
 const dialog=node('dialog');dialog.id='debriefDialog';dialog.setAttribute('aria-labelledby','debriefTitle');
 const close=node('button','Back to battle'),title=node('h2','After-battle debrief'),content=node('div');title.id='debriefTitle';content.id='debriefContent';close.type='button';close.onclick=()=>dialog.close();
 const levelControl=node('div',undefined,'experience-control debrief-experience');levelControl.innerHTML='<label for="debriefExperience">Your guidance</label><select id="debriefExperience" data-experience-select><option value="simple">Simple</option><option value="moderate">Moderate</option><option value="expert">Expert</option></select><p id="debriefExperienceNote"></p>';
 dialog.append(close,title,levelControl,content);document.body.append(dialog);
 let dialogKey=null,detailKey='',lastLevel='';
 const key=()=>`${state?.code}:${state?.battle_number||1}:${state?.revision}`;
 function metric(list,label,value){list.append(node('dt',label),node('dd',String(value)));}
 function table(headers,rows){const wrap=node('div',undefined,'debrief-table-wrap'),t=node('table'),head=node('thead'),h=node('tr'),body=node('tbody');for(const value of headers){const th=node('th',value);th.scope='col';h.append(th);}head.append(h);for(const values of rows){const row=node('tr');values.forEach(v=>row.append(node('td',String(v))));body.append(row);}t.append(head,body);wrap.append(t);return wrap;}
 function fill(){
  const level=experience(),nextKey=key()+':'+level,oldOpen=content.querySelector('#debriefFullRecord')?.open;
  content.replaceChildren();const report=state.debrief;
  title.textContent=level==='simple'?'Your battle review':`${sideLabel(state.side)} · battle debrief`;
  dialog.dataset.experience=level;$('debriefExperience').value=level;
  $('debriefExperienceNote').textContent={simple:'The result, your surviving force, and what to review next.',moderate:'Losses, useful activity and resources, with the complete record below.',expert:'The complete recorded force, resource, objective and event accounting.'}[level];
  const reason=state.resigned_by?(state.resigned_by===state.side?'You resigned this battle.':'Your opponent resigned this battle.'):(state.battle_result?.reason||'The battle has ended.');
  content.append(node('p',reason),node('p',report?.scope||'Your army and public mission progress.'));
  if(!report){content.append(node('p','Detailed recording is unavailable for this saved battle.'));return;}
  const counts=node('dl',undefined,'debrief-metrics');metric(counts,'Units still on the battlefield',report.surviving_units);if(level!=='simple')metric(counts,'Remaining strength',report.surviving_strength);if(report.evacuated)metric(counts,'Safely evacuated',report.evacuated);
  if(report.available)metric(counts,'Recorded unit losses',Object.values(report.statistics.losses).reduce((sum,n)=>sum+n,0));content.append(counts);
  if(!report.available){content.append(node('p',report.note));return;}
  content.append(node('p',report.complete?(report.preparation_excluded?'Recorded from the start of active play, after pre-battle preparation.':'Recorded from the start of this battle.'):`Partial record: detailed accounting began in round ${report.start_round}. Earlier orders and losses are not reconstructed.`,'debrief-record-note'));
  const s=report.statistics,losses=s.losses;
  const progress=report.progress||[],last=progress[progress.length-1];
  if(last){const final=node('p',`${last.label}: `+Object.entries(last.values).map(([side,n])=>`${sideLabel(side)} ${n} / ${last.target}`).join(' · '),'debrief-objective');final.id='debriefObjective';content.append(final);}
  if(level!=='expert')content.append(node('p',level==='simple'?'Review the final battlefield to connect this result with the objective. The full record is available below.':'Compare the objective progress with the actions and resources you used. A successful attack roll does not necessarily destroy a unit.','debrief-next'));
  const labels={air_stores:'Service stores',supply_packs:'Supply packs',shells:'Mortar shells',repair_kits:'Repair kits',bombs:'Bomb loads',torpedoes:'Torpedoes',fuel:'Fuel',medical_supplies:'Medical supplies',demolition_charges:'Demolition charges'};
  const used=Object.entries(s.resources).filter(([,n])=>n>0);
  if(level==='moderate'){
   const activity=node('section');activity.id='debriefActivity';activity.append(node('h3','Actions and costs'));
   const values=node('dl',undefined,'debrief-metrics');
   for(const [label,value] of [['Combat losses',losses.combat],['Other recorded losses',losses.fuel+losses.aboard+losses.other],['Aircraft launches',s.launches],['Aircraft landings',s.landings],['Services',s.services],['Strength restored',s.strength_restored]])if(value)metric(values,label,value);
   if(s.attack_rolls)metric(values,'Successful attack rolls',`${s.successful_rolls} of ${s.attack_rolls}`);
   activity.append(values);if(!values.children.length)activity.append(node('p','No attacks, losses or services were recorded.'));
   if(used.length)activity.append(table(['Resource spent','Amount'],used.map(([k,n])=>[labels[k]||k,n])));
   if(s.events.length){activity.append(node('h3','Recent highlights'));const highlights=node('ul');for(const e of s.events.slice(-5))highlights.append(node('li',`Round ${e.round} · ${e.text}`));activity.append(highlights);}
   content.append(activity);
  }
  const full=node('details');full.id='debriefFullRecord';full.open=detailKey===nextKey?!!oldOpen:level==='expert';detailKey=nextKey;
  full.append(node('summary','Complete battle record'),node('h3','Force and operations'));
  const operations=node('dl',undefined,'debrief-metrics');
  for(const [label,value] of [['Units when recording began',s.starting_units],['Remaining strength',report.surviving_strength],['Combat losses',losses.combat],['Fuel exhaustion losses',losses.fuel],['Lost aboard destroyed bases / transports',losses.aboard],['Other losses',losses.other],['Aircraft lost (all causes)',s.aircraft_lost],['Launches',s.launches],['Successful landings',s.landings],['Aircraft services',s.services],['Strength restored',s.strength_restored],['Attack rolls meeting the threshold',`${s.successful_rolls} / ${s.attack_rolls}`]])metric(operations,label,value);
  for(const [key,label] of [['field_aid','Field aid treatments'],['cave_move','Cave relocations'],['seal_cave','Cave entrances sealed']])if(s[key])metric(operations,label,s[key]);
  full.append(operations,node('p','Counts refer to unit counters, not individual soldiers or aircraft. Successful attack rolls do not necessarily mean a unit was destroyed.'));
  full.append(node('h3','Resources consumed'),used.length?table(['Resource','Used'],used.map(([k,n])=>[labels[k]||k,n])):node('p','No tracked consumables were spent during the recorded period.'));
  if(progress.length){
   full.append(node('h3',progress[0].label+' over time'));
   const teams=Object.keys(progress[0].values);full.append(table(['Round / checkpoint',...teams.map(sideLabel)],progress.map((p,i)=>[`${p.round} · ${i===0?'recording began':sideLabel(p.side)+' order'}`,...teams.map(t=>`${p.values[t]??0} / ${p.target}`)])));
  }
  if(report.weather?.length)full.append(node('h3','Weather changes'),node('p',report.weather.map(w=>`R${w.round}: ${w.name}`).join(' · ')));
  full.append(node('h3','Recorded highlights'));
  if(!s.events.length)full.append(node('p','No unit losses or objective-score changes were recorded.'));
  else{
   if(s.events_total>s.events.length)full.append(node('p',`Showing the latest ${s.events.length} of ${s.events_total} recorded highlights.`));
   const events=node('ol');for(const e of s.events)events.append(node('li',`Round ${e.round} · ${e.text}`));full.append(events);
  }
  content.append(full);
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
  const level=experience();
  // In Command center this panel shares the map column. Keep its geometry and
  // user-controlled disclosure stable when only explanation depth changes.
  const simple=level==='simple'&&!!menu;
  forecast.textContent=`${playbackSession?'REPLAY · ':''}${simple?'Weather now':'WEATHER · R'+w.current.round}: ${w.current.name}`+(w.forecast.length?' → '+w.forecast.map(f=>`${simple?'Round ': 'R'}${f.round}: ${f.name}`).join(' → '):' · final round');
  effect.textContent=simple?({clear:'Clear weather. Units use their normal sight and flight rules.',haze:'Haze makes it harder to see distant units. Radar keeps its normal reach.',rain:'Rain reduces sight, flight distance and bombing accuracy. Each airfield or carrier can launch one flight this turn; landing and service remain available.'}[w.current.condition]||w.current.description):w.current.description;
  summary.textContent=level==='expert'?'Weather rules and timing':'How weather affects your orders';
  for(const id of ['britainAirfieldContent','carrierAirGroupContent']){
   const parent=$(id);if(!parent)continue;parent.querySelector('.weather-launch-note')?.remove();
   const u=state.units.find(u=>u.id===selected);if(!u||!['airfield','carrier'].includes(u.kind)||u.side!==state.side)continue;
   if(w.current.launch_limit!==null)parent.prepend(node('p',`RAIN · ${u.weather_launches||0}/${w.current.launch_limit} launches used this turn. Landing and service still use normal cycles.`,'weather-launch-note'));
  }
 }
 function sync(){
  renderWeather();open.hidden=!state?.winner;resultOpen.hidden=!state?.winner;
  open.textContent=resultOpen.textContent={simple:'Review what happened',moderate:'Battle debrief',expert:'Full battle debrief'}[experience()];
  if(dialog.open&&(!state?.winner||playbackSession||$('game').hidden||lobbyMode||dialogKey!==key()))dialog.close();
  else if(dialog.open&&lastLevel!==experience())fill();
  lastLevel=experience();
 }
 // Keep our panel outside the layout modules' disposable containers while
 // they restore anchors during resizing or changing layout preferences.
 document.addEventListener('ww2:before-layout',()=>document.body.append(weatherBox));
 for(const event of ['ww2:render','ww2:playback','ww2:layout','ww2:experience'])document.addEventListener(event,sync);
 window.ww2Debrief={open:show};
})();
