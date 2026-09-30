/* Shared DSL capabilities. All targets and ranges come from the server. */
'use strict';
(()=>{
 let mode=null,showRanges=true;
 function points(x,y){const [cx,cy]=center(x,y);return Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');}
 function boundary(cells){
  const set=new Set(cells.map(p=>p.join(','))),edges=[];
  for(const [x,y] of cells){
   const v=points(x,y).split(' '),odd=y%2,neighbors=[[x+1,y],[x+odd,y+1],[x+odd-1,y+1],[x-1,y],[x+odd-1,y-1],[x+odd,y-1]];
   neighbors.forEach((n,i)=>{if(!set.has(n.join(',')))edges.push(`M${v[i]}L${v[(i+1)%6]}`);});
  }
  return edges.join(' ');
 }
 try{showRanges=localStorage.getItem('ww2-range-guide')!=='off';}catch{}
 const controls={};
 for(const [id,kind,label] of [['repairTank','repair_tank','Repair tank'],['snipe','snipe','Snipe']]){
  const b=uiNode('button');b.id=id;b.hidden=true;controls[kind]=b;$('nextUnit').before(b);
  b.onclick=()=>{const cancel=mode?.kind===kind;document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=false;barrageMode=false;combatMode=null;target=null;mode=cancel?null:{kind,unit:selected,revision:state.revision};render();};
 }
 const toggle=uiNode('button');toggle.id='rangeGuideToggle';toggle.type='button';$('playTools').append(toggle);
 const syncToggle=()=>{toggle.textContent='Sight / fire guide: '+(showRanges?'on':'off');toggle.setAttribute('aria-pressed',String(showRanges));};
 syncToggle();toggle.onclick=()=>{showRanges=!showRanges;syncToggle();try{localStorage.setItem('ww2-range-guide',showRanges?'on':'off');}catch{}if(state)render();};
 document.addEventListener('ww2:cancel-targeting',()=>mode=null);
 window.operationsPicking=legal=>{
  if(mode&&(mode.unit!==selected||mode.revision!==state.revision||smokeMode||barrageMode||combatMode||!legal?.[mode.kind]?.length))mode=null;
  return !!mode;
 };
 const manual=uiNode('section');manual.id='operationsManual';
 manual.innerHTML='<h3>Support & observation · new DSL battles</h3><p><strong>Commander cooldown:</strong> artillery and recon have independent cooldowns. Used in round 1, the same ability is ready again in round 3. Two charges of each per battle still apply. Switching abilities does not reset either timer.</p><p><strong>Engineer repair · 2 AP:</strong> three repair kits per team. Choose an adjacent friendly tank to restore 1 strength and repair its tracks. One repair per tank per round; no overhealing or reviving wrecks. The engineer pays, not the tank. Normal tank track repair remains available without healing.</p><p><strong>Aim at hex · 2 AP:</strong> tanks, AT weapons, naval guns and bombers can aim at empty hexes too. Needs 5+ to land; one hex past direct sight/weapon range needs 6. Terrain and smoke still block surface gunfire. Bombers keep their original one-hex bombing radius and consume a load. Normal unit cover/armor thresholds also apply. Loaded ammunition determines damage and splash; a structural hit damages the aimed building. Collapsing a damaged structure kills all ground occupants, including friendlies. Blind shots never reveal hidden casualties.</p><p><strong>Towers:</strong> 2 AP entry, infantry only. Intact towers give +1 cover; damaged towers lose that cover and may collapse. Recon and sniper teams observe up to 12 hexes from a tower (6 into concealment); other occupants see 8. Observation can look over one intervening wood/building, but not a second, another tower or smoke. Occupants can also be spotted from up to 12 hexes: height works both ways. Guns still need an unobstructed firing lane.</p><p><strong>Sniper team:</strong> 2 strength, two personnel, ordinary rifle range 4, sight 8. US-side teams: 3 base AP, aimed range 6; Germans: 2 base AP, aimed range 7, so bank an AP or receive command support. Both bank 1. Snipe costs 3 AP, hits exposed infantry on 3+ (cover and dug-in each add 1), deals 1 damage and pins. No armor damage, no automatic pin on a miss. Towers add 2 to aimed range, not ordinary rifle range. Any sniper shot exposes its team through the following enemy turn.</p><p><strong>Map guide:</strong> blue dots show observation-only hexes; red bars show rifle lanes for recon or aimed lanes for snipers. Neither guarantees a concealed target is visible or AP is available. Bright filled hexes still mean movement. Turn guides off in Battle options. Saved battles keep their original rules; start a new battle to use this update.</p>';
 $('buildingManual').after(manual);
 window.renderOperations=(u,legal,svg)=>{
  manual.hidden=!state.tactics_version;
  toggle.hidden=!state.tactics_version;
  svg.classList.remove('support-picking');
  for(const b of Object.values(controls))b.hidden=true;
  if(!state.tactics_version||!u){mode=null;return;}
  window.operationsPicking(legal);
  for(const [kind,label,cost,on] of [['repair_tank','Repair tank',2,u.kind==='engineer'&&!u.carrier_id],['snipe','Snipe',3,u.kind==='sniper'&&!u.carrier_id]]){
   const b=controls[kind];b.hidden=!on;b.disabled=busy||!legal?.[kind]?.length;b.textContent=mode?.kind===kind?'Cancel '+label.toLowerCase():`${label} · ${cost} AP`;
  }
  if(u.kind==='engineer'&&!u.carrier_id){
   $('roleBrief').textContent+=` REPAIR · ${u.repair_kits||0} kits. Adjacent tank: +1 strength and fixed tracks for 2 AP, once per tank per round.`;
   $('unitMechanics').append(uiNode('p','mechanics-caption',`Tank repair kits: ${u.repair_kits||0}/3 · select Repair tank, then a marked friendly tank.`));
  }
  const guide=legal?.range_guide;
  if(guide){
   const range=guide.snipe_range||guide.fire_range;
   $('roleBrief').textContent=`${u.kind==='sniper'?'SNIPER':'RECON'} · Sight ${guide.sight_range}${guide.tower?' from tower · exposed high ground':''} · rifle ${guide.fire_range}${guide.snipe_range?` · snipe ${range} for 3 AP`:''}. Observation is not firing range.${u.exposed_turns?' FIRING POSITION EXPOSED.':''}`;
   if(!target&&!combatMode&&!smokeMode&&!barrageMode&&!mode&&!state.order_history?.redo_required){
    $('hint').textContent=`Sight ${guide.sight_range} · ${guide.snipe_range?'Snipe':'Rifle'} ${range} · ${showRanges?'Blue dots: sight only / red bars: shot':'Range guide off'}${u.kind==='sniper'&&u.ap<3?' · bank AP to snipe':''}`;
   }
   if(showRanges&&!mode&&!combatMode&&!smokeMode&&!barrageMode&&!svg.querySelector('.transport-choice,.landing-zone')&&!playbackSession){
    const g=element('g',{class:'range-guide','aria-hidden':'true'});
    const lanes=guide.snipe_range?guide.snipe:guide.fire,armed=new Set(lanes.map(p=>p.join(',')));
    const sight=guide.sight.filter(p=>!armed.has(p.join(','))).map(p=>{const [x,y]=center(...p);return `M${x} ${y+21}h.1`;}).join(' ');
    const fire=lanes.map(p=>{const [x,y]=center(...p);return `M${x-3} ${y+21}h6`;}).join(' ');
    g.append(element('path',{d:boundary(guide.sight),class:'sight-edge'}),element('path',{d:boundary(lanes),class:'fire-edge'}),element('path',{d:sight,class:'range-sight'}),element('path',{d:fire,class:'range-fire'}));svg.append(g);
   }
  }
  if(mode){
   svg.classList.add('support-picking');svg.querySelectorAll('.move-beacon').forEach(n=>n.remove());
   const repair=mode.kind==='repair_tank';
   $('hint').textContent=repair?'Tap a marked friendly tank · +1 strength & repaired tracks · 2 AP + 1 kit.':'Tap a marked enemy infantry unit · aimed shot · 3 AP · exposes your team.';
   const choices=repair?legal.repair_tank.map(id=>({id})):legal.snipe;
   for(const shot of choices){
    const t=state.units.find(t=>t.id===shot.id);if(!t)continue;
    const label=repair?`Repair ${unitName(t)}`:`Snipe ${unitName(t)}, ${shot.threshold}+ to hit`;
    const tile=element('polygon',{points:points(...t.pos),class:'support-choice'+(repair?' repair-choice':' snipe-choice'),role:'button',tabindex:0,'aria-label':label});
    tile.append(element('title',{},label));activate(tile,()=>{
     if(busy||playbackSession||!mode)return;
     const message=repair?`Repair ${unitName(t)} for 2 engineer AP and one kit? Restore 1 strength (up to maximum) and fix tracks.`:`Snipe ${unitName(t)} for 3 AP? Needs ${shot.threshold}+, deals 1 damage and pins. Your team will be exposed through the enemy turn.`;
     if(!confirm(message))return;const kind=mode.kind;mode=null;act({kind,unit:selected,target:t.id});
    });svg.append(tile);
   }
  }
 };
})();
