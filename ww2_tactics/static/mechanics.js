'use strict';
function buildingCondition(value,pos){return value?.building_version&&['building','tower','bunker'].includes(value.map?.[pos[1]]?.[pos[0]])?(value.buildings?.[pos.join(',')]||'intact'):null;}
function buildingHelp(condition,simple=false){
 return {intact:simple?'Solid building · good cover.':'Intact building · 2 AP entry · +1 cover. A heavy explosive hit damages it.',
 damaged:simple?'Damaged building · explosive hits can collapse it.':'Damaged building · 2 AP entry · +0 terrain cover. A structural hit collapses it and eliminates all ground occupants, including friendlies.',
 destroyed:simple?'Collapsed building · cannot enter.':'Destroyed building · impassable to ground units. Still blocks sight and retains building concealment.'}[condition]||'';
}
const modifierNames={precision:'Aimed shot',cover:'Terrain cover',distance:'Long range',leader:'Nearby leader',machine_gun:'Machine gun',dug_in:'Dug in',reaction:'Reaction shot',pinned_target:'Pinned defender'};
function uiNode(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function dieFace(value,cls=''){
 const die=uiNode('span',`die-face ${cls}`);die.setAttribute('role','img');die.setAttribute('aria-label',`Die ${value}`);
 const spots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[value]||[];
 for(let i=0;i<9;i++)die.append(uiNode('i',spots.includes(i)?'pip on':'pip'));
 return die;
}
function rollFormula(modifiers,threshold){
 if(!modifiers)return `Needs ${threshold}+ on one six-sided die.`;
 const parts=['Base 4'];
 for(const [key,value] of Object.entries(modifiers))if(value)parts.push(`${value>0?'+':'−'}${Math.abs(value)} ${modifierNames[key]||key}`);
 const raw=4+Object.entries(modifiers).filter(([key])=>key!=='reaction').reduce((total,[,v])=>total+v,0);
 return parts.join(' · ')+(raw<2?' · normal fire minimum 2+':'')+` → needs ${threshold}+`;
}
function chanceRow(label,threshold,modifiers,effect){
 const row=uiNode('div','chance-row');
 const count=Math.max(0,Math.min(6,7-threshold));
 const heading=uiNode('strong','',`${label} · ${Math.round(count/6*100)}%`);heading.append(uiNode('span','mechanics-expert',` · needs ${threshold}+`));row.append(heading);
 const faces=uiNode('div','dice-options');faces.setAttribute('aria-label',`${count} of 6 die faces succeed`);
 for(let v=1;v<=6;v++)faces.append(dieFace(v,v>=threshold?'winning-face':'losing-face'));
 faces.classList.add('mechanics-expert');
 row.append(faces,uiNode('p','mechanics-caption mechanics-expert',`${count}/6 faces succeed · green faces hit`),uiNode('p','mechanics-caption mechanics-expert',rollFormula(modifiers,threshold)),uiNode('p','mechanics-caption',effect));
 return row;
}
function renderOdds(shot,assault,grenade,picking){
 const panel=document.getElementById('odds');panel.replaceChildren();panel.hidden=picking||!(shot||assault||grenade);
 if(panel.hidden)return;
 if(shot)panel.append(chanceRow(shot.weapon_label||'Fire',shot.threshold,shot.modifiers,shot.effect_text?`${shot.effect_text}. Costs 2 AP.${shot.suppression_threshold?' The same die also pins infantry on '+shot.suppression_threshold+'+, even if damage misses.':''}`:shot.air?`Hit: −${shot.damage} strength. Costs 2 AP. No pinning or terrain cover.`:shot.naval?`Hit: −${shot.damage} hull. Costs 2 AP. Ships do not suffer pins.`:`Hit: −${shot.damage||1} strength and pinned. Costs 2 actions.${shot.suppression_threshold?' The same die also pins infantry on '+shot.suppression_threshold+'+, even if the damage roll misses.':''}`));
 const alternatives=[];
 if(grenade)alternatives.push(chanceRow('Frag',grenade.threshold,{cover:grenade.threshold-4},'Hit: −2 strength and pinned. Costs 2 actions and one frag.'));
 if(assault)alternatives.push(chanceRow('Assault',assault.threshold,{pinned_target:assault.threshold===3?-1:0},'Hit: −2 strength; advance if eliminated. Miss: attacker loses 1 strength and is pinned. Costs 2 actions.'));
 if(shot&&alternatives.length){const more=uiNode('details','attack-alternatives');more.append(uiNode('summary','','Compare other attacks'),...alternatives);panel.append(more);}else panel.append(...alternatives);
}
function renderUnitMechanics(state,unit){
 const panel=document.getElementById('unitMechanics');panel.hidden=!unit;panel.replaceChildren();if(!unit)return;
 const meters=uiNode('div','unit-meters');
 const base=unit.base_ap??(unit.kind==='leader'?3:2),bank=base?(['leader','commander'].includes(unit.kind)?2:1):0;
 for(const [label,current,max] of [['Strength',Math.max(0,unit.hp),unit.max_hp||(unit.kind==='leader'?2:3)],['Actions',unit.ap,state.ruleset==='dsl'?base+bank:2]]){
  const meter=uiNode('span','unit-meter');meter.append(uiNode('strong','',`${label} ${current}/${max}`));
  const marks=uiNode('span','meter-marks');marks.setAttribute('aria-hidden','true');
  for(let i=0;i<max;i++)marks.append(uiNode('i',i<current?'filled':''));meter.append(marks);meters.append(meter);
 }
 panel.append(meters);
 if(state.ruleset==='dsl')panel.append(uiNode('p','mechanics-caption',`Base ${base} AP · carried ${unit.carried_ap||0} · received ${unit.ap_received}/${base+bank} this turn. ${unit.side===state.turn?'End now to bank '+Math.min(unit.ap,bank):'Banked: '+(unit.banked_ap||0)} AP. Spending actions does not reset the received limit.`));
 const details=uiNode('details','unit-explanation');details.append(uiNode('summary','','Terrain & status explained'));
 const type=state.map[unit.pos[1]][unit.pos[0]],condition=buildingCondition(state,unit.pos),cover=['woods','building','tower',...(state.naval_version?[]:['objective'])].includes(type)&&condition!=='damaged';
 const terrainCopy=window.fieldworksTerrainHelp?.(type,unit,null,condition,unit.pos)?.[1];
 const items=[terrainCopy|| (condition?buildingHelp(condition):`${type[0].toUpperCase()+type.slice(1)}: ${cover?'incoming fire needs +1 on the die':'no terrain cover bonus'}. Entering this terrain costs ${['woods','building','tower'].includes(type)?2:1} action(s).`),
  `Range ${unit.range} hexes. Intervening woods, buildings and smoke block direct fire. Strength is remaining health; zero removes the unit.`,
  state.ruleset==='dsl'?`DSL: ${base} base AP plus up to ${bank} banked AP. A paid road-to-road move earns one free connected road hex, once per turn. Firing costs 2 AP.`:`Actions refresh to 2 at the start of this army’s turn. Moving on open ground costs 1; firing costs 2.`];
 if(unit.pinned)items.push('PINNED: cannot move or attack. Rally costs 1 action. Pins remain until rallied; pinned units can still hold the objective.');
 if(unit.immobilized)items.push('IMMOBILIZED: cannot move, but can still fire or take overwatch. Repair tracks costs 2 AP and restores movement without restoring strength.');
 if(unit.entrenched)items.push('DUG IN: incoming fire needs another +1. Moving or assaulting removes this protection.');
 if(unit.overwatch)items.push('OVERWATCH: one automatic reaction shot, with +1 to the normal hit threshold. Expires at your next turn or when pinned.');
 const smoke=state.smoke?.find(s=>s.pos[0]===unit.pos[0]&&s.pos[1]===unit.pos[1]);
 if(smoke)items.push(`SMOKE: blocks shots into, out of and through this hex. Clears after ${smoke.ttl} turn ending(s).`);
 for(const text of items)details.append(uiNode('p','mechanics-caption',text));panel.append(details);
}
function combatCard(event,compact=false){
 const card=uiNode('div',compact?'combat-entry compact':'combat-entry');
 card.append(uiNode('p','combat-heading',`${event.kind}${event.round?` · round ${event.round}`:''}`));
 if(event.attacker_label)card.append(uiNode('p','mechanics-caption',event.attacker_label+(event.target_label?` → ${event.target_label}`:'')));
 if(event.roll!==undefined&&event.threshold!==undefined){
  const hit=event.roll>=event.threshold,row=uiNode('div','roll-result');row.append(dieFace(event.roll,hit?'winning-face':'miss-face'));
  const suppressed=event.result?.startsWith('suppressed');
  const text=uiNode('div');text.append(uiNode('strong','',`Rolled ${event.roll} · needed ${event.threshold}+`),uiNode('span',hit||suppressed?'result-hit':'result-miss',hit?'SUCCESS':suppressed?'PINNED · NO DAMAGE':'MISS'));row.append(text);card.append(row);
  card.append(uiNode('p','mechanics-caption',rollFormula(event.modifiers,event.threshold)));
 }else if(event.roll!==undefined)card.append(uiNode('strong','automatic-result',`Rolled ${event.roll} · target unobserved`));
 else card.append(uiNode('strong','automatic-result',event.structure_roll!==undefined?'Infantry fragments · automatic effect':'Automatic effect · no dice roll'));
 if(event.structure_roll!==undefined)card.append(uiNode('p','combat-effect',`Building damage: rolled ${event.structure_roll} · needed ${event.structure_threshold}+${event.structure_roll>=event.structure_threshold?' · structural hit':' · no structural damage'}`));
 card.append(uiNode('p','combat-effect',event.result));
 for(const change of event.terrain_changes||[])card.append(uiNode('p','combat-impact',`${hexColumn(change.pos[0])}${change.pos[1]+1} · building ${change.after==='destroyed'?'collapsed — ground entry blocked':'damaged — reduced cover'}`));
 for(const hit of event.impacts||[])if(hit.id!==event.target)card.append(uiNode('p','combat-impact',`${kinds[hit.kind]||hit.kind} · ${hexColumn(hit.pos[0])}${hit.pos[1]+1}: ${hit.result}`));
 if(event.note)card.append(uiNode('p','mechanics-caption',event.note));
 return card;
}
function renderCombat(state){
 const panel=document.getElementById('combat');panel.hidden=!state.last_combat;if(panel.hidden)return;
 document.getElementById('latestCombat').replaceChildren(combatCard(state.last_combat));
 const history=(state.combat_history||[]).slice(0,-1).reverse();
 document.getElementById('combatHistory').hidden=!history.length;
 document.getElementById('combatHistoryLabel').textContent=`Earlier combat · ${history.length} result${history.length===1?'':'s'}`;
 document.getElementById('combatHistoryEntries').replaceChildren(...history.map(e=>combatCard(e,true)));
}
