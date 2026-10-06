/* Joint-domain presentation. Only public snapshots reach the layer picker. */
'use strict';
(()=>{
 const air=u=>['fighter','bomber'].includes(u.kind);
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 let layer='both',battle=null,pickerRevision=null,positionFrame=null;
 function schedulePosition(){if(positionFrame===null)positionFrame=requestAnimationFrame(()=>{positionFrame=null;position();});}
 window.fubarLayer=()=>layer;
 const bar=node('nav');bar.id='fubarLayers';bar.hidden=true;bar.setAttribute('aria-label','Battlefield layers');
 const buttons=new Map();
 for(const [id,label,help] of [['both','Both','Show observed aircraft and surface units. Tap stacked counters to choose.'],['surface','Surface','Show troops and ships. Aircraft remain in the battle, hidden only from this view.'],['air','Air','Show aircraft and air visibility. This does not reveal the ground below.']]){
  const b=node('button',label);b.type='button';b.dataset.layer=id;b.title=help;b.dataset.help=help;
  b.onclick=()=>{if(busy||playbackSession)return;document.dispatchEvent(new Event('ww2:cancel-targeting'));combatMode=null;smokeMode=false;barrageMode=false;target=null;layer=id;const u=state.units.find(v=>v.id===selected);if(u&&id!=='both'&&air(u)!==(id==='air'))selected=null;render();};buttons.set(id,b);bar.append(b);
 }
 document.body.append(bar);
 const picker=node('dialog');picker.id='fubarStack';picker.setAttribute('aria-labelledby','fubarStackTitle');
 const close=node('button','Back to map');close.id='fubarStackClose';close.onclick=()=>picker.close();
 const title=node('h2');title.id='fubarStackTitle';const options=node('div');options.className='fubar-stack-options';picker.append(close,title,options);document.body.append(picker);
 function visible(){return (window.signalSnapshot?.(state)||state).units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id);}
 function position(){
  const on=!!state?.joint_ops_version&&!lobbyMode&&!$('game').hidden;
  bar.hidden=!on;if(!on){picker.close();return;}
  const r=$('mapWrap').getBoundingClientRect();
  bar.hidden=r.bottom<44||r.top>innerHeight||!!playbackSession;
  bar.style.left=`${Math.max(6,r.left+8)}px`;bar.style.top=`${Math.max(6,r.top+8)}px`;
 }
 new ResizeObserver(schedulePosition).observe($('mapWrap'));
 new MutationObserver(schedulePosition).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',schedulePosition);window.addEventListener('scroll',schedulePosition,{passive:true});
 function paint(svg,snapshot){
  const units=snapshot.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id),counts=new Map();
  for(const u of units)counts.set(u.pos.join(','),(counts.get(u.pos.join(','))||0)+1);
  for(const u of units){
   const g=svg.querySelector(`.unit[data-unit-id="${u.id}"]`);if(!g)continue;
   const flying=air(u),hidden=layer==='air'&&!flying||layer==='surface'&&flying,stacked=layer==='both'&&counts.get(u.pos.join(','))>1;
   g.classList.toggle('joint-air',flying);g.classList.toggle('joint-hidden',hidden);
   if(hidden){g.setAttribute('aria-hidden','true');g.setAttribute('tabindex','-1');}
   else{g.removeAttribute('aria-hidden');if(svg.id==='map')g.setAttribute('tabindex','0');}
   if(stacked)g.setAttribute('transform',flying?'translate(-9 -11)':'translate(6 7)');else g.removeAttribute('transform');
   let badge=g.querySelector('.joint-air-badge');
   if(flying&&stacked&&state.ground_stack_version){badge?.remove();}
   else if(flying&&!badge){const [x,y]=center(...u.pos);badge=element('text',{x:x+17,y:y-18,'text-anchor':'middle',class:'joint-air-badge','aria-hidden':'true'},'AIR');g.append(badge);}
   if(svg.id==='map')g.setAttribute('aria-label',`${sideLabel(u.side)} ${unitName(u)}. ${flying?'Air':'Surface'} layer. ${u.hp} strength, ${u.ap} AP.${stacked?' Shared hex: choose a unit.':''}`);
  }
  for(const g of svg.querySelectorAll('.contact-marker'))g.classList.toggle('joint-hidden',layer==='air'&&!air({kind:g.dataset.kind})||layer==='surface'&&air({kind:g.dataset.kind}));
  svg.querySelectorAll('.joint-objective').forEach(n=>n.remove());
  for(const p of snapshot.joint_control||[]){
   const [x,y]=center(...p.pos),g=element('g',{class:'joint-objective','aria-hidden':'true'});
   g.append(element('circle',{cx:x,cy:y,r:p.domain==='sea'?49:26,class:`joint-objective-ring ${p.owner||'neutral'}`}));
   g.append(element('text',{x,y:y+42,'text-anchor':'middle'},`${p.domain==='sea'?'SEA':'LAND'} +1${p.contested?' · contested':''}`));
   svg.append(g);
  }
 }
 window.renderFubar=(unit,legal,svg)=>{
  if(!state.joint_ops_version)return;
  const key=state.code+':'+state.battle_number;if(battle!==key){battle=key;layer='both';picker.close();}
  if(picker.open&&pickerRevision!==state.revision)picker.close();
  for(const [id,b] of buttons){b.setAttribute('aria-pressed',String(id===layer));b.disabled=busy||!!playbackSession;}
  $('rulesetBadge').textContent='DSL · Fubar · Joint operations playtest';
  $('objectiveName').textContent='FUBAR · THREE OBJECTIVES';$('objective').textContent=`Allies ${state.joint_score.us}/10 · Axis ${state.joint_score.de}/10`;
  $('missionHint').textContent='Ships take the sea lane; infantry take land flags. Each held flag: +1 at your turn end. First to 10 wins.';
  $('manualAP').textContent='Fubar: one aircraft and one surface unit may share a hex. Aircraft ignore terrain but check interception along every flight leg. Unit cards show AP and weapon roles. End turn refreshes the entire coalition together.';
  if(unit&&['fighter','bomber','aa_gun','radar','airfield','carrier','battleship','cruiser','destroyer','flak'].includes(unit.kind)){
   $('roleBrief').textContent=unitRoleSummary(unit)+(unit.kind==='flak'?' Anti-aircraft bursts reach 4 hexes; Overwatch can intercept a flight.':'');
   if(air(unit)&&!target&&!combatMode&&!smokeMode&&!barrageMode)$('hint').textContent=`AIR · fly up to ${unit.flight} hexes for 1 AP. Surface units do not block flight. ${unit.kind==='bomber'?`${unit.bombs} bomb loads; select a visible surface target.`:'Select a visible aircraft to attack.'}`;
  }
  const snapshot=window.signalSnapshot?.(state)||state;paint(svg,snapshot);schedulePosition();
 };
 function picking(){return smokeMode||barrageMode||combatMode||window.airbornePicking?.(state.legal[selected])||window.operationsPicking?.(state.legal[selected])||window.fieldworksPicking?.(state.legal[selected])||window.signalsPicking?.(state.legal[selected])||$('map').classList.contains('transport-picking')||$('map').querySelector('.landing-zone,.recon-choice');}
 function openStack(u){
  const units=visible().filter(v=>v.pos[0]===u.pos[0]&&v.pos[1]===u.pos[1]&&(layer==='both'||air(v)===(layer==='air')));
  const selectedUnit=state.units.find(v=>v.id===selected);
  const move=selectedUnit&&air(selectedUnit)!==air(u)&&state.turn===state.side&&!state.winner?state.legal[selected]?.moves.find(m=>m.pos[0]===u.pos[0]&&m.pos[1]===u.pos[1]):null;
  if(units.length<2&&!move)return false;
  title.textContent=`Hex ${hexColumn(u.pos[0])}${u.pos[1]+1} · choose a layer`;options.replaceChildren();pickerRevision=state.revision;
  for(const v of units){
   const b=node('button');b.type='button';b.dataset.unitId=v.id;const portrait=window.makeUnitPortrait?.(v);if(portrait)b.append(portrait);
   const text=node('span');text.append(node('strong',unitName(v)),node('small',`${air(v)?'Air':'Surface'} · ${sideLabel(v.side)} · ${v.hp} strength · ${v.ap} AP`));b.append(text);
   b.onclick=()=>{picker.close();if(state.revision!==pickerRevision)return;chooseUnit(v);};options.append(b);
  }
  if(move){const b=node('button',`${air(selectedUnit)?'Fly above this hex':'Move into this hex'} · ${move.cost} AP`);b.id='fubarLayerMove';b.type='button';b.onclick=()=>{picker.close();if(state.revision===pickerRevision)moveUnit(move);};options.append(b);}
  picker.showModal();return true;
 }
 function stackEvent(e){
  if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
  if(!state?.joint_ops_version||state.ground_stack_version||busy||playbackSession||picking())return;
  const counter=e.target.closest('.unit'),u=counter&&visible().find(v=>v.id===counter.dataset.unitId);
  if(u&&openStack(u)){e.preventDefault();e.stopImmediatePropagation();}
 }
 $('map').addEventListener('click',stackEvent,true);$('map').addEventListener('keydown',stackEvent,true);
 document.addEventListener('ww2:selection',()=>{
  if(!state?.joint_ops_version)return;const u=state.units.find(u=>u.id===(target||selected));
  if(u&&layer!=='both'&&air(u)!==(layer==='air')){layer='both';render();}
 });
 document.addEventListener('ww2:render',schedulePosition);document.addEventListener('ww2:layout',schedulePosition);
 document.addEventListener('ww2:playback',()=>{if(state?.joint_ops_version&&playbackSession){paint($('playbackMap'),playbackSession.frames[playbackSession.index][playbackSession.phase]);position();}});
 const manual=node('section');manual.id='fubarManual';manual.append(node('h3','Fubar · joint operations playtest'),node('p','A deliberately fictional coalition battle containing the original 31 unit types. The 36×32 map links an ocean flank, landing coast, bridged river and inland town. The mission panel explains the three scoring zones. Existing battles keep their original rules.'),node('p','Both / Surface / Air changes only the view. At most one aircraft and one surface unit may share a hex; same-layer stacking is forbidden. Aircraft fly above ground cover and smoke; radar does not reveal ground troops. Bombing and artillery affect the surface only. Tap a shared hex to choose a counter by its full name.'),node('p','Movable fighters and bombers are separate from the carrier’s abstract search / strike sorties. Airfields service movable aircraft; carrier sorties retain their existing per-turn limits and cruiser escort penalty. Fixed AA, Flak and fighter overwatch react along actual flight paths. Aircraft cannot capture objectives. This is a balance sandbox, not a historical order of battle.'));
 $('rules').append(manual);
})();
