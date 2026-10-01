/* Aim using public terrain; the server alone resolves scatter, occupancy and Flak. */
'use strict';
(()=>{
 Object.assign(kinds,{pathfinder:'Pathfinder team',flak:'Light Flak team'});Object.assign(unitCodes,{pathfinder:'PF',flak:'FLK'});
 let mode=null,lastReport=null;
 const call=uiNode('button'),beacon=uiNode('button');call.id='callAirborne';beacon.id='markLZ';call.hidden=beacon.hidden=true;
 call.dataset.help='3 commander AP, one lift per round, one finite reserve squad. Aim anywhere. A 1 loses the squad before sight; 6 is exact if clear. Scatter and unseen Flak can defeat a drop.';
 beacon.dataset.help='2 AP and one beacon. Reduce scatter by one hex for aims within 2 hexes. The Pathfinder must stay, survive and remain unpinned. It cannot prevent a natural 1 or Flak interception.';
 $('nextUnit').before(call,beacon);
 call.onclick=()=>{const cancel=!!mode;document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=false;barrageMode=false;combatMode=null;target=null;mode=cancel?null:{unit:selected,revision:state.revision};render();};
 beacon.onclick=()=>act({kind:'mark_lz',unit:selected});
 document.addEventListener('ww2:cancel-targeting',()=>mode=null);
 window.airbornePicking=legal=>{if(mode&&(mode.unit!==selected||mode.revision!==state.revision||!legal?.airborne_drop||smokeMode||barrageMode||combatMode||state.turn!==state.side))mode=null;return !!mode;};
 const cube=p=>{const q=p[0]-(p[1]-(p[1]&1))/2;return [q,-q-p[1],p[1]];};
 const distance=(a,b)=>Math.max(...cube(a).map((n,i)=>Math.abs(n-cube(b)[i])));
 window.pickAirborneHex=pos=>{
  if(!mode||busy||playbackSession||!state.legal[selected]?.airborne_drop)return;
  const guided=state.units.some(u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id&&!u.pinned&&u.beacon_active&&distance(u.pos,pos)<=2);
  const knownFlak=state.units.some(u=>u.side!==state.side&&u.aa_radius&&distance(u.pos,pos)<=u.aa_radius);
  const tile=state.map[pos[1]][pos[0]],hazard=tile==='water'?' WATER: lose 2 strength at each own turn end until ashore.': ['woods','building','bocage','ridge','wadi','oasis','marsh'].includes(tile)?' Rough landing: lose 1 strength.':'';
  const text=`Call one reserve squad to ${hexColumn(pos[0])}${pos[1]+1} for 3 AP?\n1: lost before spotting. 2: scatter 3; 3: scatter 2; 4–5: scatter 1; 6: exact if clear.\n${guided?'Your active beacon reduces scatter by 1. ':''}${knownFlak?'Spotted Flak may cover this area. ':''}Unseen Flak within 4 of the landing hex can intercept on 1–2. Coverage never stacks.\nOccupied or obstructed landings divert adjacent; off-map scatter or no landing space loses the squad.${hazard}\nSurvivors receive 1 AP this turn. The result commits undo history.`;
  if(confirm(text)){mode=null;act({kind:'airborne_drop',unit:selected,pos});}
 };
 const report=uiNode('p');report.id='airliftReport';report.hidden=true;report.setAttribute('role','status');$('signalNotice').after(report);
 window.airborneRole=u=>{
  if(!state?.airborne_version||u.carrier_id)return null;
  if(u.kind==='pathfinder'&&u.side!==state.side)return 'Pathfinder · scout sight · beacon status unknown';
  if(u.afloat)return 'AFLOAT · swim 1 hex per AP or board an adjacent transport · lose 2 strength at each own turn end · no attacks while afloat';
  if(u.airlift_reserve)return 'Airborne reserve · select your commander to call this squad · survivors land with 1 AP';
  if(u.landing_limited)return 'Just landed · maximum 1 AP this turn, no banking or command AP · normal paratrooper AP next turn';
  if(u.airlift_commander)return 'Airborne commander · 3 AP per lift · one squad per round from finite reserves · no sight requirement';
  if(u.kind==='pathfinder')return `Pathfinder · scout sight · ${u.beacon_active?(u.pinned?'beacon disabled while pinned':'beacon active'):(u.beacon_charges||0)+' beacon remaining'} · Mark LZ for 2 AP`;
  if(u.kind==='flak')return 'Fixed 20 mm Flak · intercept drops within 4 on 1–2 · pinning disables air defense · ground fire harms infantry/light vehicles';
  if(u.variant==='tiger')return 'Tiger I · 6 strength · AP shell: 3 damage · 3 AP per move, no free road step · cannot move and fire on its ordinary AP budget';
  if(u.variant==='firefly')return 'Firefly · 17-pounder AP: 3 damage · 4 strength, 2 base AP · weaker HE: 1 infantry damage, no splash';
  if(u.display_name==='German Pioneers')return `Pioneers · ${u.demolition_charges||0} anti-armor charges · smoke, grenades, repairs and engineering`;
  return null;
 };
 window.renderAirborne=(u,legal,svg)=>{
  call.hidden=beacon.hidden=true;report.hidden=true;
  if(!state.airborne_version){mode=null;return;}
  call.hidden=!legal?.airborne_drop;call.disabled=busy;call.textContent=mode?'Cancel airborne drop':'Call airborne · 3 AP';
  beacon.hidden=!legal?.mark_lz;beacon.disabled=busy;beacon.textContent='Mark LZ · 2 AP';
  if(u){const role=window.airborneRole(u);if(role){$('roleBrief').textContent=role;$('unitMechanics').append(uiNode('p','mechanics-caption',role));}
   if(u.airlift_reserve)$('hint').textContent='Awaiting airlift. Select your commander, then Call airborne and choose any hex.';
   if(u.airlift_commander)$('unitMechanics').append(uiNode('p','mechanics-caption',`${state.units.filter(v=>v.side===state.side&&v.airlift_reserve&&v.reserve&&v.hp>0).length} reserve squads remaining. 1 loses the squad; 2–5 scatter; 6 is exact when clear. Flak and unsafe terrain add risk.`));
  }
  if(mode)$('hint').textContent='Choose any hex for the drop. Bright outlines are aim points, not promises of safety. 3 AP · finite reserve · no undo.';
  const r=state.airlift_report;
  if(r){report.hidden=false;report.textContent=`Airlift · R${r.round} · rolled ${r.roll}${r.scatter?' · scatter '+r.scatter:''}${r.guided?' · beacon assisted':''}${r.diverted?' · landing diverted':''}${r.pos?' · '+hexColumn(r.pos[0])+(r.pos[1]+1):''}. ${r.result}${r.survived===false?' Squad destroyed on landing.':''}`;
   const key=state.code+':'+state.battle_number+':'+r.revision;if(lastReport!==key){lastReport=key;notify(report.textContent);}
  }
  svg.querySelectorAll('.beacon-mark').forEach(n=>n.remove());
  for(const p of state.units.filter(v=>v.side===state.side&&v.hp>0&&!v.reserve&&!v.carrier_id&&v.beacon_active)){
   const [x,y]=center(...p.pos),mark=element('g',{class:'beacon-mark','aria-hidden':'true'});
   mark.append(element('circle',{cx:x,cy:y,r:32}),element('text',{x,y:y-34,'text-anchor':'middle'},p.pinned?'LZ OFF':'LZ'));svg.append(mark);
  }
 };
 const manual=uiNode('section');manual.id='airliftManual';manual.innerHTML='<h3>Iron Lantern · commander airlifts</h3><p>A fictional 1944 canal operation: US airborne and British armor versus German defenders. Only this new map enables these rules. Infantry must hold the canal command post and either northern canal exit together for two turn endings; one lucky drop cannot secure the entire mission.</p><p><strong>Call airborne · 3 AP:</strong> a US/British commander calls the next of three reserve squads to any map hex, once per army per round. No sight is required. A natural 1 loses the squad before it can spot. On 2, scatter 3 hexes; on 3, scatter 2; on 4–5, scatter 1; on 6, land exactly if clear. A separate direction die decides the scatter direction. Off-map scatter loses the squad. Occupied hexes, mountains, towers, bunkers and destroyed buildings divert to an available adjacent landing; if none exists the squad is lost. The approach and intended hex never grant sight. Rolls and losses cannot be undone.</p><p><strong>Flak:</strong> one active, unpinned enemy Flak team within 4 hexes of the resolved landing gets an interception chance: 1–2 loses the transport before sight. Coverage does not stack. A gun can attempt once per round; ground fire does not consume its air-defense attempt. No line-of-sight or overwatch order is needed against the transport. Unknown guns and exact gun positions are never disclosed by previews or loss reports. Scout, pin or destroy Flak, or risk another approach.</p><p><strong>Pathfinders · Mark LZ for 2 AP:</strong> one beacon per team. Aims within 2 hexes scatter one hex less while the operator stays active and unpinned. Moving, boarding or attacking switches it off; pinning disables it until rallied. It cannot rescue a natural 1 or stop Flak. Enemy wireless warnings reveal only a sector.</p><p><strong>Landing:</strong> surviving squads get exactly 1 AP, cannot receive command AP or bank it during the arrival turn, and regain normal paratrooper AP at their next turn. Ground overwatch may react at the landing hex. Woods, buildings, bocage, ridges, wadis, oases and marsh cost 1 landing strength. Water landings may swim to adjacent water or accessible land for 1 AP; they cannot attack while afloat. They lose 2 strength at the end of each of their own turns, including the arrival turn, until ashore or aboard a friendly transport.</p><p><strong>Armor:</strong> Germany has one Tiger I: 6 strength, AP shells deal 3 damage, range 9, but every move costs 3 AP with no free road step. British Firefly AP also deals 3 damage, but it has 4 strength and 2 base AP; its HE deals only 1 infantry damage without splash. Normal Shermans are faster. German Pioneers carry two adjacent demolition charges. All values are balance experiments, not historical measurements.</p>';
 $('rules').append(manual);
 const sync=()=>manual.hidden=!state?.airborne_version;document.addEventListener('ww2:render',sync);sync();
})();
