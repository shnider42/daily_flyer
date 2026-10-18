/* Role presentation follows the saved server capabilities. No rule simulation. */
'use strict';
(()=>{
 const has=(u,kind)=>u.role_orders?.includes(kind);
 window.groundRoleRecovery=u=>has(u,'rally')?'Self-rally: 1 AP, or receive an officer’s rally.':
  'Officer rally preserves this team’s AP. Otherwise, a team that spends a full own turn pinned recovers when that turn ends.';
 window.groundRoleSummary=u=>{
  const reach=has(u,'fire')?`Fire 1–${u.range}`:has(u,'suppress')?`Suppress ${u.suppress_min}–${u.suppress_range} · ${u.suppression}+ · no damage`:`Mortar 2–${u.mortar_range}`;
  return `${u.role_label} · ${reach} · base sight ${u.sight}`;
 };
 window.groundRoleHelp=(id,u)=>{
  if(state?.ground_roles_version!==1||!u)return '';
  const radius=u.command_radius||1,group=u.kind==='commander'?'any friendly platoon':'own platoon';
  return {
   suppress:`2 AP · range ${u.suppress_min}–${u.suppress_range} · ${u.suppression}+ to pin · no strength damage. Needs a clear firing lane and a target spotted by this platoon.`,
   inspire:`1 officer AP · rallies all pinned allies within ${radius} hex${radius===1?'':'es'} · ${group}. Their AP is preserved.`,
   command:`2 officer AP · gives 1 AP to eligible unpinned teams within ${radius} hex${radius===1?'':'es'} · ${group}. Once per command group per turn; normal AP caps apply.`,
   rally:'1 AP · removes this unit’s pin. Officers and recon can self-rally on this operation.',
   spotFire:'Observe, then mark a visible hex for 1 AP. Your own platoon’s mortar hits on 4+ instead of 5+ while direction is active.',
   areaFire:`2 AP + 1 shell · range 2–${u.mortar_range} · once per round. Needs platoon sight; the blast lands after the enemy turn and can hit friendlies.`,
   grenade:`2 AP · range 1–2 · ${u.grenades} frags left · 2 damage and pin on a hit.`,
   smoke:`1 AP · own or adjacent hex · ${u.smoke} smoke grenades left. Blocks sight through the following enemy turn.`,
   bridgeGap:'3 AP + one bridge kit · build across an adjacent one-hex water gap with firm banks. Permanent; either army can use it.'
  }[id]||'';
 };
 const manual=uiNode('section');manual.id='groundRolesManual';manual.hidden=true;
 manual.append(uiNode('h3','','Compact 2.0 · specialist infantry'),uiNode('p','',
  'Each team has a limited set of orders. Rifle sections carry frags and can fire, assault and overwatch. Recon carries smoke, observes farther and can self-rally. Engineers carry both grenade types and clear collapsed buildings; Stonebridge engineers also carry one bridge kit. Mortars use Aim at hex with three shells and range 2–6; they have no rifle attack or overwatch.'),uiNode('p','',
  'Captains rally their own platoon within 1 hex; the major rallies any friendly platoon within 2. Rally allies costs 1 officer AP and preserves the recipients’ AP. Give actions costs 2 officer AP, once per command group per turn, and gives eligible unpinned teams +1 AP within the same radius. Officers and recon can self-rally for 1 AP. Other teams recover after a full own turn spent pinned, even if their officers are lost.'),uiNode('p','',
  'The MG 42 is a suppression-only playtest role: 2 AP, range 2–6, 3+ to pin, zero damage. It cannot fire at range 0–1, overwatch, assault or self-rally. Base sight is 4; its platoon can spot farther targets, but a clear firing lane is still required. The Browning can fire and overwatch at range 1–5, or suppress at range 1–4 on 5+. Terrain still affects sight. These are balance choices inspired by equipment, not a simulation of every historical capability.'),uiNode('p','',
  'Each unit pays its own AP. Unspent AP can bank within the normal cap; officer orders cannot bypass that cap. Platoons share live spotting locally. Smoke and frag stocks never refill on these maps. Capture the marked objective at two consecutive American turn endings, or eliminate the enemy army; Germany wins by holding out to the deadline.'));
 manual.append(uiNode('p','',
  'Movement costs 1 AP in open ground or on roads, 2 in woods or buildings. A paid road move grants one connected road/bridge step for free, once per unit per turn. Water needs a bridge. Two friendly ground teams may share a hex; each keeps its own AP, and explosions can hit both. Engineers clear adjacent collapsed buildings for 2 AP. A field bridge costs 3 AP and one kit, with firm banks on opposite sides of a single water hex.'),uiNode('p','',
  'Fire costs 2 AP. The target preview shows the required die roll and damage. Cover, range, nearby officers and digging in can affect the threshold. A suppression roll may pin infantry even if a damaging shot misses. Frag grenades cost 2 AP, reach 2 hexes and need 4+ (5+ in cover) for 2 damage and a pin. Smoke costs 1 AP in your own or an adjacent hex; it blocks sight through the enemy turn. Dig in costs 2 AP for +1 incoming-fire protection until movement; it does not protect against assault.'),uiNode('p','',
  'Close assault costs 2 AP against adjacent spotted infantry, including through smoke: 4+ normally, 3+ against a pinned defender. Success deals 2 damage and pins; advance requires clearing the defending hex. Failure costs the attacker 1 strength and pins it. Rifle sections and the Browning team may take Overwatch for 2 AP: one reaction shot at +1 to the normal threshold, until their next turn. Pinning cancels overwatch. Orange movement warnings show known enemy coverage, not secret readiness.'),uiNode('p','',
  'Fog and local spotting apply. Base sight is listed on each unit; woods and buildings conceal distant infantry and block intervening sight, as does smoke. Observe costs recon 1 AP for +2 sight until it moves, attacks or starts its next turn. A recon patrol with a mortar in its platoon can then Spot for fire for 1 AP, improving that mortar’s landing roll from 5+ to 4+. Mortars cost 2 AP and a shell, once per round; their radius-1 blast lands after the enemy turn. A hit deals 1 damage and pins all infantry in the blast, including friendlies. Buildings have a separate 5+ damage check. Takebacks preserve rolled results and cannot erase newly learned information.'));
 $('rules').querySelector('h2').after(manual);
 const legend=uiNode('details','unit-badge-legend');legend.id='unitBadgeLegend';legend.append(uiNode('summary','','Read the unit insignia'),uiNode('p','',
  'The upper-right badge identifies the unit’s role while keeping its artwork. Officer bars and the major’s leaf identify command; other symbols identify equipment or duties. These shared gameplay symbols are consistent across armies. Team colors and counter shapes still identify the side.'));
 const grid=uiNode('div','unit-badge-grid');legend.append(grid);manual.before(legend);
 let legendKey='';
 window.renderGroundRoles=(u,legal)=>{
  const enabled=state.ground_roles_version===1;manual.hidden=!enabled;$('rules').classList.toggle('specialist-manual',enabled);
  const keys=new Map();for(const unit of state.units){const label=window.unitBadgeLabel(unit);if(label&&!keys.has(label))keys.set(label,unit);}
  const key=[...keys.keys()].join('|');if(key!==legendKey){legendKey=key;grid.replaceChildren();for(const [label,unit] of keys){const item=uiNode('span','unit-badge-key');item.append(window.makeUnitRoleBadge(unit),uiNode('span','',label));grid.append(item);}}
  legend.hidden=!keys.size;
  if(!enabled||!u)return;
  $('roleBrief').textContent=window.groundRoleSummary(u);
  if(u.kind==='commander'&&!target&&!u.pinned)$('hint').textContent=`Company command · rally and give actions within ${u.command_radius} hexes across friendly platoons.`;
  if(u.role_profile==='suppression_mg')$('unitMechanics').querySelector('.weapon-summary').textContent='Suppression only · infantry';
  if(u.kind==='mortar')$('unitMechanics').querySelector('.weapon-summary').textContent='Indirect mortar · infantry';
  const supplies=[];if(has(u,'grenade'))supplies.push(`${u.grenades} frag${u.grenades===1?'':'s'}`);if(has(u,'smoke'))supplies.push(`${u.smoke} smoke`);if(has(u,'area_fire'))supplies.push(`${u.shells}/${u.max_shells} shells`);if(has(u,'bridge_gap'))supplies.push(`${u.bridge_kits} bridge kit`);
  const info=uiNode('p','mechanics-caption role-loadout',supplies.length?'Loadout · '+supplies.join(' · '):'Role · '+u.role_label);
  $('unitMechanics').append(info,uiNode('p','mechanics-caption role-recovery',window.groundRoleRecovery(u)));
  if(u.side===state.side&&u.pinned&&!has(u,'rally'))$('hint').textContent='PINNED · '+(u.role_pinned_start?'Officer rally to act now, or recover when this army turn ends.':'Use an officer’s rally, or spend the next full own turn pinned to recover.');
  else if(u.role_profile==='suppression_mg'&&target&&!smokeMode&&!combatMode&&!barrageMode)$('hint').textContent=legal?.suppress?.includes(target)?'Suppress · 2 AP · 3+ to pin · zero strength damage.':'MG 42 needs an unpinned infantry target at range 2–6, platoon sight, a clear lane and 2 AP.';
 };
})();
