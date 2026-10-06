/* Ground occupancy playtest. Only public units and legal orders enter this UI. */
'use strict';
(()=>{
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const picker=node('dialog');picker.id='groundStack';picker.setAttribute('aria-labelledby','groundStackTitle');
 const back=node('button','Back to map');back.id='groundStackClose';back.onclick=()=>picker.close();
 const title=node('h2');title.id='groundStackTitle';const list=node('div');list.className='ground-stack-options';
 const help=node('p','Units keep separate AP and player assignments. Sharing a hex does not transfer control. Explosives can hit both occupants.');
 picker.append(back,title,help,list);document.body.append(picker);
 let revision=null,battle=null;
 const active=u=>u.hp>0&&!u.reserve&&!u.carrier_id;
 const air=u=>['fighter','bomber'].includes(u.kind);
 const snapshot=()=>window.signalSnapshot?.(state)||state;
 const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
 function owner(u){
  if(u.side!==state.side)return sideLabel(u.side);
  if(!state.coop)return 'Your command';
  const id=state.coop.controllers[u.id];
  return id===state.coop.me?'Your command':id?`Controlled by ${state.coop.players.find(p=>p.id===id)?.name||'teammate'}`:'Computer controlled';
 }
 function entry(u,action){
  const button=node('button');button.type='button';button.dataset.unitId=u.id;
  const portrait=window.makeUnitPortrait?.(u);if(portrait)button.append(portrait);
  const text=node('span');text.append(node('strong',unitName(u)),node('small',`${owner(u)}${state.layered_occupancy_version?' · '+(air(u)?'Air':'Ground / surface')+' layer':''} · Platoon ${u.platoon||'HQ'} · ${u.hp} strength · ${u.ap} AP`));button.append(text);
  button.onclick=()=>{picker.close();if(state.revision===revision&&!busy&&!playbackSession)action(u);};return button;
 }
 function open(pos,units,caption,choose){
  revision=state.revision;battle=state.code+':'+state.battle_number;
  title.textContent=`Hex ${hexColumn(pos[0])}${pos[1]+1} · ${caption}`;
  list.replaceChildren(...units.map(u=>entry(u,choose)));picker.showModal();
 }
 window.chooseGroundTarget=(pos,units,choose)=>open(pos,units,'choose target',choose);
 function picking(){const legal=state.legal?.[selected];return smokeMode||barrageMode||combatMode||window.airbornePicking?.(legal)||window.operationsPicking?.(legal)||window.fieldworksPicking?.(legal)||window.signalsPicking?.(legal)||$('map').classList.contains('transport-picking');}
 function intercept(event){
  if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
  if(!state?.ground_stack_version||busy||playbackSession||picking())return;
  const counter=event.target.closest('.unit'),visible=snapshot().units.filter(active),u=counter&&visible.find(v=>v.id===counter.dataset.unitId);if(!u)return;
  const layer=state.joint_ops_version?window.fubarLayer?.()||'both':'both';
  const units=visible.filter(v=>same(v.pos,u.pos)&&(layer==='both'||air(v)===(layer==='air'))),mover=state.units.find(v=>v.id===selected);
  const move=mover&&controlsUnit(mover)&&state.turn===state.side&&!state.winner?state.legal[selected]?.moves?.find(m=>same(m.pos,u.pos)):null;
  if(units.length<2&&!move)return;
  event.preventDefault();event.stopImmediatePropagation();open(u.pos,units,'choose a unit',chooseUnit);
  if(move){const button=node('button',`${air(mover)?'Fly '+unitName(mover)+' above this hex':'Move '+unitName(mover)+' here'} · ${move.cost} AP · share hex`);button.id='groundStackMove';button.className='primary';button.onclick=()=>{picker.close();if(state.revision===revision&&!busy&&!playbackSession)moveUnit(move);};list.append(button);}
 }
 $('map').addEventListener('click',intercept,true);$('map').addEventListener('keydown',intercept,true);
 function paint(svg,value){
  if(!svg)return;svg.querySelectorAll('.ground-stack-count').forEach(n=>n.remove());
  const layer=state.joint_ops_version?window.fubarLayer?.()||'both':'both';
  const groups=new Map();for(const u of value.units.filter(v=>active(v)&&(layer==='both'||air(v)===(layer==='air')))){const key=u.pos.join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u);}
  for(const units of groups.values()){
   units.sort((a,b)=>a.id.localeCompare(b.id));const shared=units.length>1;
   units.forEach((u,i)=>{const g=svg.querySelector(`.unit[data-unit-id="${u.id}"]`);if(!g)return;g.classList.toggle('ground-shared',shared);
    if(shared){const [x,y]=center(...u.pos),offset=units.length===3?[[-12,8],[11,8],[0,-13]][i]:[[ -10,-8],[10,8]][i];g.setAttribute('transform',`translate(${x+offset[0]} ${y+offset[1]}) scale(.78) translate(${-x} ${-y})`);}else g.removeAttribute('transform');
    if(svg.id==='map')g.setAttribute('aria-label',`${sideLabel(u.side)} ${unitName(u)}. ${u.hp} strength, ${u.ap} AP.${shared?' Shared hex: choose a unit.':''}`);
   });
   if(shared){const [x,y]=center(...units[0].pos),planes=units.filter(air).length;svg.append(element('text',{x:x+21,y:y-20,class:'ground-stack-count','aria-hidden':'true'},planes?`${units.length-planes}+AIR`:String(units.length)));}
  }
 }
 const manual=node('section');manual.id='groundStackManual';manual.hidden=true;manual.append(node('h3','Belfry Valley · two units per hex'),node('p','Up to two friendly ground units can share a hex, with at most one vehicle or fixed gun. Click a friendly counter and choose Move here to share it. Click a shared hex to choose a unit or an enemy target. Each unit pays its own movement cost, keeps its AP and stays under its assigned player or computer.'),node('p','Sharing a hex does not board a vehicle or merge platoon intelligence. Supply and repairs also work in the same hex. A flag scores once, regardless of the number of occupants. Assaults advance only after the last defender is cleared.'),node('p','Direct fire and sniper shots target one selected unit. Explosive splash and mortars can hit both; artillery and Aim at hex check all occupants with the weapon’s normal protection rules. A shell damages a structure once, but a collapse kills every ground occupant. Spreading out remains safer.'));
 $('rules').append(manual);
 document.addEventListener('ww2:render',()=>{
  const on=!!state?.ground_stack_version;manual.hidden=!on;
  if(picker.open&&(!on||busy||playbackSession||revision!==state.revision||battle!==state.code+':'+state.battle_number))picker.close();
  if(!on)return;
  manual.querySelector('h3').textContent=state.edition==='current'?'Current DSL · shared ground hexes':'Belfry Valley · two units per hex';
  $('manualAP').textContent=(state.edition==='current'?'Current DSL':'Belfry Valley')+': up to two friendly ground units per hex, at most one vehicle/fixed gun. Each keeps its own AP and owner. Aircraft use a separate slot; ships and boats stay separate. Select a friendly counter, then Move here to share; click a shared hex to choose a unit. Explosives can hit both.';
  paint($('map'),snapshot());
 });
 document.addEventListener('ww2:playback',()=>{if(state?.ground_stack_version&&playbackSession)paint($('playbackMap'),playbackSession.frames[playbackSession.index][playbackSession.phase]);});
})();
