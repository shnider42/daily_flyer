'use strict';
let playbackSession=null, playbackTimer=null;
function playbackCount(value){return value?.computer_playback?.count??value?.computer_playback?.frames?.length??0;}
function playbackKey(value){return !value?.computer_work?.pending&&!value?.coop?.resolving&&playbackCount(value)?`${value.code}:${value.battle_number||1}:${value.computer_playback.id}`:null;}
function shouldAutoPlayback(value){return !!playbackKey(value)&&playbackCount(value)<=20;}
function syncPlayback(){
 const button=document.getElementById('replayTurn');
 button.hidden=!playbackKey(state);button.disabled=busy||!!playbackSession;
}
function startPlayback(){
 if(busy||playbackSession||!playbackKey(state))return;
 playbackSession={frames:state.computer_playback.frames||new Array(playbackCount(state)),movie:state.computer_playback,
  code:session.code,token:session.token,index:0,phase:'before',paused:false,loadedStart:0,loading:null,
  focus:document.activeElement,scroll:{left:document.getElementById('mapWrap').scrollLeft,top:document.getElementById('mapWrap').scrollTop}};
 document.getElementById('playbackPanel').hidden=false;
 document.getElementById('map').setAttribute('hidden','');
 document.getElementById('missionHint').hidden=true;
 document.getElementById('battleReport').hidden=true;
 document.getElementById('findUnit').hidden=true;
 for(const el of document.querySelectorAll('#orders,#roster,#platoonFilters,#combat,#incoming,.journal'))el.hidden=true;
 for(const el of document.querySelectorAll('#orders,#roster,#platoonFilters,.match-tools,#rematchProposal'))el.inert=true;
 document.getElementById('turnBanner').textContent='Watching the computer’s turn · orders paused';
 syncPlayback();drawPlayback();
 if(!window.ww2Desktop?.active)document.getElementById('playbackPanel').scrollIntoView({block:'start',behavior:'auto'});
 document.getElementById('pausePlayback').focus({preventScroll:true});
 schedulePlayback();
}
function schedulePlayback(){
 clearTimeout(playbackTimer);
 if(playbackSession&&!playbackSession.paused&&!playbackSession.loading)playbackTimer=setTimeout(advancePlayback,playbackSession.phase==='before'?250:650);
}
function advancePlayback(){
 if(!playbackSession||playbackSession.loading)return;
 if(playbackSession.phase==='before')playbackSession.phase='after';
 else{playbackSession.index++;playbackSession.phase='before';}
 if(playbackSession.index>=playbackSession.frames.length){stopPlayback();return;}
 drawPlayback();schedulePlayback();
}
function stopPlayback(){
 clearTimeout(playbackTimer);const focus=playbackSession?.focus,scroll=playbackSession?.scroll;playbackSession=null;
 document.getElementById('playbackPanel').hidden=true;
 document.getElementById('playbackMap')?.remove();document.getElementById('map').removeAttribute('hidden');
 document.getElementById('missionHint').hidden=false;
 for(const el of document.querySelectorAll('#orders,#roster,#platoonFilters,.journal'))el.hidden=false;
 for(const el of document.querySelectorAll('#orders,#roster,#platoonFilters,.match-tools,#rematchProposal'))el.inert=false;
 if(state)render();
 if(scroll)document.getElementById('mapWrap').scrollTo(scroll);
 if(focus?.isConnected&&!focus.disabled)focus.focus({preventScroll:true});
 refresh();
}
function loadPlaybackPage(p){
 if(p.loading)return;
 document.getElementById('playbackStep').textContent=`Loading action ${p.index+1} / ${p.frames.length}…`;
 p.loading=(async()=>{
  const response=await fetch(`/api/match/${p.code}/replay/${p.movie.stream}?start=${p.index}`,{headers:{Authorization:`Bearer ${p.token}`}});
  const page=await response.json();if(!response.ok||!page.checkpoint||!page.events.length)throw new Error(page.error||'Replay page unavailable.');
  if(playbackSession!==p)return;
  for(let i=p.loadedStart;i<p.loadedStart+12;i++)delete p.frames[i];
  let snapshot=page.checkpoint;
  page.events.forEach((event,index)=>{const before=applyStateChanges(snapshot,event.before_patch),after=applyStateChanges(before,event.after_patch);const frame={...event,before,after};delete frame.before_patch;delete frame.after_patch;p.frames[page.start+index]=frame;snapshot=after;});
  p.loadedStart=page.start;
 })().then(()=>{p.loading=null;if(playbackSession===p){drawPlayback();schedulePlayback();}}).catch(error=>{p.loading=null;if(playbackSession===p){stopPlayback();notify(`${error.message} The live battle is unchanged.`);}});
}
function drawPlayback(){
 if(!playbackSession)return;
 if(!playbackSession.frames[playbackSession.index]){loadPlaybackPage(playbackSession);return;}
 const p=playbackSession,frame=p.frames[p.index],snapshot=frame[p.phase],action=frame.action;
 const actor=frame.before.units.find(u=>u.id===action.unit),targetUnit=frame.before.units.find(u=>u.id===action.target);
 const labels={resupply:'delivers supplies',evacuate:'evacuates infantry',move:'moves',fire:'fires',grenade:'throws a frag',assault:'assaults',suppress:'suppresses',inspire:'rallies nearby troops',command:'orders On your feet',rally:'rallies',dig:'digs in',smoke:'throws smoke',overwatch:'takes overwatch',barrage:'calls mortars',end:'ends the turn'};
 labels.load='boards infantry';labels.unload='unloads infantry';labels.rearm='services aircraft';
 Object.assign(labels,{load_ammo:'changes ammunition',repair_tracks:'repairs tracks',bombard:'bombards an area',artillery:'calls artillery',field_recon:'launches recon'});
 Object.assign(labels,{airborne_drop:'calls airborne reserves',mark_lz:'marks a landing zone',radio_update:'broadcasts radio reports',observe:'observes',conceal:'camouflages',mortar_fire:'calls mortar fire',demolition:'places a demolition charge'});
 Object.assign(labels,{breach:'breaches a hedge',clear_wreck:'clears collapsed rubble',bridge_gap:'builds a bridge'});
 Object.assign(labels,{area_fire:'fires at a hex',repair_tank:'repairs a tank',snipe:'takes an aimed sniper shot'});
 const loc=pos=>`${hexColumn(pos[0])}${pos[1]+1}`;
 const description=actor?`${sideLabel(actor.side)} ${unitName(actor)} at ${loc(actor.pos)} ${labels[action.kind]||action.kind}${action.pos?' → '+loc(action.pos):targetUnit?' → '+sideLabel(targetUnit.side)+' '+unitName(targetUnit)+' at '+loc(targetUnit.pos):''}`:action.kind==='end'?'Computer ends its turn':'Contact update · movement outside sight is concealed';
 document.getElementById('playbackStep').textContent=`Action ${p.index+1} / ${p.frames.length} · ${p.phase==='before'?'Before':'Result'}`;
 document.getElementById('playbackDescription').textContent=description;
 document.getElementById('round').textContent=`${snapshot.round} / ${state.scenario?.rounds||8}`;
 document.getElementById('objective').textContent=state.front_mode==='armored_control'?`Soviets ${snapshot.front_score?.us||0}/10 · Germans ${snapshot.front_score?.de||0}/10`:state.front_mode==='evacuation'?`Rescued ${snapshot.evacuated_count||0}/6`:state.air_version?`Stations lost: ${snapshot.raid_destroyed?.length||0} / 2`:`Hold: ${snapshot.hold} / 2`;
 document.getElementById('armyCount').textContent=['us','de'].map(side=>`${names[side]} ${snapshot.units.filter(u=>u.side===side&&u.hp>0).length}/${snapshot.units.filter(u=>u.side===side).length}`).join(' · ');
 document.getElementById('pausePlayback').textContent=p.paused?'Resume':'Pause';
 const result=document.getElementById('playbackResult');result.replaceChildren();
 if(p.phase==='after'){
  for(const event of frame.combat)result.append(combatCard(event,true));
  const changes=[];
  for(const u of frame.after.units){
   const old=frame.before.units.find(v=>v.id===u.id);if(!old)continue;
   const details=[];
   if(u.hp!==old.hp)details.push(u.hp<=0?'eliminated':`strength ${old.hp} → ${u.hp}`);
   if(u.pinned!==old.pinned)details.push(u.pinned?'pinned':'rallied');
   if(!!u.immobilized!==!!old.immobilized)details.push(u.immobilized?'tracks disabled; gun operational':'tracks repaired');
   if(u.ammo!==old.ammo)details.push(`${u.ammo?.toUpperCase()} ammunition loaded`);
   if(u.ap!==old.ap)details.push(`actions ${old.ap} → ${u.ap}`);
   if(u.entrenched!==old.entrenched)details.push(u.entrenched?'dug in':'dug-in cover removed');
   if(u.overwatch!==old.overwatch)details.push(u.overwatch?'watching':'overwatch ended');
   if(u.carrier_id!==old.carrier_id)details.push(u.carrier_id?'boarded transport':'left transport');
   if(u.bombs!==old.bombs)details.push(`bomb loads ${old.bombs} → ${u.bombs}`);
   for(const [key,label] of [['shells','mortar shells'],['supply_packs','supply packs'],['repair_kits','repair kits']])if(u[key]!==old[key])details.push(`${label} ${old[key]||0} → ${u[key]||0}`);
   if(!!u.observing!==!!old.observing)details.push(u.observing?'observation active: +2 sight':'observation ended');
   if(details.length)changes.push(`${sideLabel(u.side)} ${unitName(u)} · ${loc(u.pos)}: ${details.join(', ')}`);
  }
  if(frame.after.hold!==frame.before.hold)changes.push(`Objective hold: ${frame.before.hold} → ${frame.after.hold} / 2`);
  if(frame.after.evacuated_count!==undefined&&frame.after.evacuated_count!==frame.before.evacuated_count)changes.push(`Rescued units: ${frame.before.evacuated_count||0} → ${frame.after.evacuated_count} / 6`);
  if(frame.after.front_score&&JSON.stringify(frame.after.front_score)!==JSON.stringify(frame.before.front_score))changes.push(`Flag score: Soviets ${frame.after.front_score.us}/10 · Germans ${frame.after.front_score.de}/10`);
  if(frame.after.winner)changes.push(`${sideLabel(frame.after.winner)} win.`);
  if(!frame.combat.length)result.append(uiNode('p','mechanics-caption',changes.join(' · ')||'Order complete.'));
  else if(changes.length){const more=uiNode('details');more.append(uiNode('summary','','Unit changes'),uiNode('p','mechanics-caption',changes.join(' · ')));result.append(more);}
 }
 const previousMap=document.getElementById('playbackMap');window.ww2Motion?.capture(previousMap);
 const svg=document.getElementById('map').cloneNode(true);svg.id='playbackMap';svg.hidden=false;svg.removeAttribute('hidden');svg.setAttribute('aria-label',`Turn playback: ${description}`);
 svg._motionBefore=previousMap?._motionBefore;
 svg._motionForward=previousMap?._playbackIndex===p.index&&previousMap?._playbackPhase==='before'&&p.phase==='after';
 svg._playbackIndex=p.index;svg._playbackPhase=p.phase;
 svg.classList.remove('transport-picking','support-picking');
 svg.querySelectorAll('.range-guide,.support-choice,.engineering-choice,.signal-choice,.beacon-mark,.linked-marker,.front-objectives').forEach(e=>e.remove());
 svg.querySelectorAll('.unit,.smoke-cloud,.barrage-zone,.incoming-mark,.aim-line,.battle-effect,.fog-layer,.contact-marker,.landing-zone,.transport-choice,.recon-choice,.sea-control,.move-beacon,.island-marker,.flight-trail,.station-mark').forEach(e=>e.remove());
 svg.querySelectorAll('[tabindex]').forEach(e=>{e.removeAttribute('tabindex');e.removeAttribute('role');e.removeAttribute('aria-label');});
 svg.querySelectorAll('.hex').forEach(e=>e.classList.remove('move','threatened','smoke-choice','barrage-choice','combat-choice','combat-search','airdrop-aim','selected'));
 if(state.fieldworks_version){
  const grid=state.scenarioBaseMap||state.battlefield.map;
  const known=grid.map(row=>row.slice());
  for(const [coord,tile] of Object.entries(snapshot.fieldworks||{})){const [x,y]=coord.split(',').map(Number);known[y][x]=tile;}
  svg.querySelectorAll(':scope > .hex').forEach(e=>{e.setAttribute('class','hex '+known[+e.dataset.y][+e.dataset.x]);});svg._grid=known;
 }

 for(const smoke of snapshot.smoke||[]){const [cx,cy]=center(...smoke.pos);svg.append(element('ellipse',{cx,cy,rx:25,ry:22,class:'smoke-cloud'}));}
 for(const barrage of snapshot.barrages||[])for(const pos of barrage.area){const [cx,cy]=center(...pos);svg.append(element('circle',{cx,cy,r:24,class:'replay-danger'}));}
 const destination=action.pos||targetUnit?.pos;
 if(actor&&destination){const [x1,y1]=center(...actor.pos),[x2,y2]=center(...destination);svg.append(element('line',{x1,y1,x2,y2,class:'replay-line'}));svg.append(element('circle',{cx:x2,cy:y2,r:23,class:'replay-destination'}));}
 for(const u of snapshot.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id)){
  const [cx,cy]=center(...u.pos),g=element('g',{class:`unit ${u.side} platoon-${u.platoon||'none'}${u.id===action.unit?' selected':''}${u.id===action.target?' target':''}`});
  g.dataset.unitId=u.id;
  g._unitPos=u.pos.slice();
  g.append(element('rect',{x:cx-20,y:cy-16,width:40,height:33,rx:u.side==='us'?9:1}));
  g.append(element('text',{x:cx,y:cy-3,'text-anchor':'middle',class:'unit-name'},unitCodes[u.kind]||'SQ'));
  g.append(element('text',{x:cx,y:cy+10,'text-anchor':'middle',class:'strength',textLength:Math.min(34,11+7*u.hp),lengthAdjust:'spacingAndGlyphs'},strengthLabel(u)));
  if(u.platoon)g.append(element('text',{x:cx,y:cy+28,'text-anchor':'middle',class:'platoon-marker'},`${u.platoon}${u.number}`));
  if(u.pinned)g.append(element('text',{x:cx+17,y:cy-13,class:'pin'},'!'));
  if(u.immobilized)g.append(element('text',{x:cx,y:cy-23,'text-anchor':'middle',class:'track-marker'},'TRACKS'));
  if(u.entrenched)g.append(element('path',{d:`M${cx-22} ${cy+19}h44`,class:'dug-marker'}));
  if(u.overwatch)g.append(element('text',{x:cx-17,y:cy-13,class:'watch-marker'},'◎'));
  svg.append(g);
 }
 document.getElementById('playbackMap')?.remove();document.getElementById('mapWrap').append(svg);renderPlaybackEffects(state,frame,svg,p);document.dispatchEvent(new Event('ww2:playback'));if(window.drawFog)window.drawFog(svg,snapshot);
 // Keep the camera fixed while the result animates. Reveal a new actor only
 // when beginning its action, instead of re-centering before and after it.
 if(state.scenario?.platoons&&actor&&p._focusedFrame!==p.index){
  p._focusedFrame=p.index;
  if(window.ww2Desktop?.active)window.ww2Desktop.ensureVisible(actor);
  else{
   const [x,y]=center(...actor.pos),matrix=svg.getScreenCTM(),view=$('mapWrap').getBoundingClientRect(),point=matrix&&new DOMPoint(x,y).matrixTransform(matrix);
   if(point&&(point.x<view.left+30||point.x>view.right-30||point.y<view.top+30||point.y>view.bottom-30))focusMapUnit(actor,svg);
  }
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('replayTurn').onclick=startPlayback;
 document.getElementById('skipPlayback').onclick=stopPlayback;
 document.getElementById('pausePlayback').onclick=()=>{if(!playbackSession)return;playbackSession.paused=!playbackSession.paused;drawPlayback();schedulePlayback();};
 document.getElementById('stepPlayback').onclick=()=>{if(!playbackSession)return;playbackSession.paused=true;advancePlayback();};
});
