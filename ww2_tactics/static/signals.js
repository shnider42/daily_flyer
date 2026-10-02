/* Optional platoon intelligence. Only server-filtered information enters a view. */
'use strict';
(()=>{
 Object.assign(kinds,{radioman:'Radio team',commando:'Commando section',mountain:'Mountain infantry',partisan:'Patriot fighters',askari:'Colonial infantry',mortar:'Mortar team'});
 Object.assign(unitCodes,{radioman:'RAD',commando:'CMD',mountain:'MTN',partisan:'PAT',askari:'ASC',mortar:'MTR'});
 let lastAlert=null,mode=null,armyView=false,cachedState=null,cachedGroup=null,cachedView=null;
 const choices=[['radioUpdate','radio_update','Radio update'],['observe','observe','Observe'],['conceal','conceal','Camouflage'],['mortarFire','mortar_fire','Mortar fire'],['demolition','demolition','Demolition']];
 const controls={};
 const descriptions={radio_update:'Send dated contact reports to other platoons. Reports last through the following round and never follow an enemy.',observe:'Gain 2 sight, not weapon range, until moving, attacking or your next turn. Costs 1 AP.',conceal:'Reduce enemy spotting distance by 1 hex in cover. Adjacent enemies and recon planes still reveal you. Movement or attack cancels camouflage.',mortar_fire:'Range 2–8: local sight or a received radio report. One shell and 2 AP; once per round. Delayed impact gives the enemy a turn to move. Friendly infantry can be hit.',demolition:'Adjacent spotted armor only. Spend 2 AP and one charge: 4+ to hit for 2 damage.'};
 for(const [id,kind,label] of choices){const b=uiNode('button');b.id=id;b.hidden=true;b.dataset.help=descriptions[kind];$('nextUnit').before(b);controls[kind]=b;
  b.onclick=()=>{if(['mortar_fire','demolition'].includes(kind)){const cancel=mode?.kind===kind;document.dispatchEvent(new Event('ww2:cancel-targeting'));smokeMode=false;barrageMode=false;combatMode=null;target=null;mode=cancel?null:{kind,unit:selected,revision:state.revision};render();}else act({kind,unit:selected});};
 }
 document.addEventListener('ww2:cancel-targeting',()=>mode=null);
 window.signalsPicking=legal=>{if(mode&&(mode.unit!==selected||mode.revision!==state.revision||smokeMode||barrageMode||combatMode||!legal?.[mode.kind]?.length))mode=null;return !!mode;};
 const toggle=uiNode('button');toggle.id='intelligenceView';toggle.type='button';toggle.hidden=true;$('playTools').append(toggle);
 toggle.onclick=()=>{armyView=!armyView;cachedState=null;target=null;render();};
 const notice=uiNode('div');notice.id='signalNotice';notice.setAttribute('role','status');notice.hidden=true;$('incoming').after(notice);
 window.signalSnapshot=s=>{
  if(!s.signals_version||armyView)return s;
  const u=s.units.find(u=>u.id===selected&&u.side===s.side),group=u?.platoon||(platoonFilter!=='all'?platoonFilter:'HQ'),v=s.platoon_views?.[group];
  if(!v)return s;if(cachedState===s&&cachedGroup===group)return cachedView;
  const ids=new Set(v.enemy_ids),hexes=new Set(v.visible_hexes.map(p=>p.join(',')));
  cachedState=s;cachedGroup=group;cachedView={...s,units:s.units.filter(u=>u.side===s.side||ids.has(u.id)),contacts:v.contacts,visible_hexes:v.visible_hexes,smoke:(s.smoke||[]).filter(c=>hexes.has(c.pos.join(',')))};
  if(s.joint_ops_version)cachedView.visible_air_hexes=v.visible_air_hexes;
  return cachedView;
 };
 window.signalRole=u=>u.carrier_id?null:u.weapon==='at_rifle'?'Anti-tank rifle · light vehicles and infantry only · cannot penetrate heavy tank armor':u.display_name==='Italian L3 tankette'?'Light tankette · machine guns · infantry support; no anti-tank gun':state?.signals_version?({radioman:'Wireless · 1 AP to relay reports from this platoon · Observe for +2 sight',commando:'Raider · 3 AP · camouflage, grenades and one anti-armor charge',mountain:'Mountain-trained · 1 AP on mountains, ridges and wadis · Observe',partisan:'Patriot fighters · 3 AP · mountain mobility and camouflage; short rifle range',askari:'Colonial infantry · mountain mobility · rifles and grenades',mortar:`Mortar crew · ${u.shells||0} shells · range 2–8 · delayed fire; overwatch uses short-range rifles`,commander:'HQ · 2 AP to share platoon reports; artillery and recon depend on this force'}[u.kind]||null):null;
 window.renderSignals=(u,legal,svg)=>{
  for(const b of Object.values(controls))b.hidden=true;
  toggle.hidden=!state.signals_version;toggle.textContent=armyView?'Intelligence: army overview':'Intelligence: selected platoon';toggle.setAttribute('aria-pressed',String(!armyView));
  const alerts=state.signal_alerts||[];notice.hidden=!alerts.length;notice.textContent=alerts.slice(-2).map(a=>`${a.kind==='recon'?'✈ Enemy recon':a.kind==='airlift'?'Enemy airlift':'Enemy wireless'} · ${a.sector} sector · R${a.round} · exact position unknown`).join(' | ');
  if(alerts.length){const a=alerts.at(-1),key=state.code+':'+state.battle_number+':'+a.revision+':'+a.kind;if(key!==lastAlert){lastAlert=key;notify(`${a.kind==='recon'?'Enemy recon aircraft':a.kind==='airlift'?'Enemy transport aircraft':'Enemy wireless traffic'} · ${a.sector} sector · R${a.round}. Exact positions unknown.`);}}
  if(!state.signals_version)return;
  window.signalsPicking(legal);
  for(const [id,kind,label] of choices){const b=controls[kind],available=Array.isArray(legal?.[kind])?legal[kind].length:legal?.[kind];b.hidden=!available;b.disabled=busy||state.turn!==state.side;b.textContent=mode?.kind===kind?'Cancel '+label.toLowerCase():`${label} · ${kind==='radio_update'?(u?.kind==='radioman'?1:2):kind==='observe'?1:2} AP`;}
  if(u){if(!u.carrier_id)$('roleBrief').textContent=window.signalRole(u)||`${unitTypeName(u)} · ${u.base_ap} base AP · range ${u.range} · suppression ${u.suppression}+. ${state.scenario.doctrine?.[state.side]||''}`;$('unitMechanics').append(uiNode('p','mechanics-caption',`${armyView?'Army overview':'Platoon '+(u.platoon||'HQ')+' intelligence'}: direct fire uses local spotting. Radio markers are old reports, never live targets. ${state.scenario.doctrine?.[state.side]||''}`));}
  if(mode){
   const label=choices.find(c=>c[1]===mode.kind)[2];$('hint').textContent=descriptions[mode.kind];svg.querySelectorAll('.move-beacon').forEach(n=>n.remove());
   const points=mode.kind==='mortar_fire'?legal.mortar_fire.map(pos=>({pos})):legal.demolition.map(id=>state.units.find(u=>u.id===id));
   for(const item of points){const [cx,cy]=center(...item.pos),points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
    const tile=element('polygon',{points,class:'signal-choice',role:'button',tabindex:0,'aria-label':`${label} at ${hexColumn(item.pos[0])}${item.pos[1]+1}`});
    activate(tile,()=>{if(!mode||busy)return;const kind=mode.kind;if(kind==='mortar_fire'&&!confirm('Shell this area after the enemy turn? Friendly infantry can also be hit.'))return;mode=null;act({kind,unit:selected,...(kind==='mortar_fire'?{pos:item.pos}:{target:item.id})});});svg.append(tile);
   }
  }
 };
 const manual=uiNode('section');manual.id='signalsManual';manual.innerHTML='<h3>Platoon intelligence & specialist teams</h3><p>The Italy, North Africa, Ethiopia and Iron Lantern battles use experimental communications rules. Each platoon spots for its own direct fire. The selected-platoon view shows that live picture and dated contacts; Army overview combines your own forces’ observations. These are still two-player battles, one commander per army.</p><p><strong>Radio update:</strong> a commander spends 2 AP to broadcast recent platoon contacts; a radio team spends 1 AP to relay its platoon. Once per round. Reports show only role, last position and observation round; they last through the following round. Radio reports permit mortar aiming, not direct fire on unseen units. Enemy wireless alerts disclose only a broad sector.</p><p><strong>Observe · 1 AP:</strong> scouts, Pathfinders, radio teams and mountain infantry gain +2 sight, never extra weapon range. Moving, attacking or your next turn ends it. <strong>Camouflage · 2 AP:</strong> Commandos and Patriots in cover reduce normal spotting reach by one hex. Adjacent enemies and recon planes still find them; movement and attack break it.</p><p><strong>Mortar fire · 2 AP + shell:</strong> range 2–8, once per round, based on local sight or a received report. The impact area is public and resolves after the enemy turn. It harms all infantry there, including friendly units; armor is immune. Mortar crew overwatch uses their rifles, not indirect fire.</p><p><strong>Demolition · 2 AP + charge:</strong> engineers and Commandos can attack adjacent spotted armor: 4+ for 2 damage. One charge per team; Iron Lantern’s German Pioneers carry two. Dice cannot be rerolled with undo.</p><p><strong>Warnings:</strong> orange moves in these theaters mean a spotted enemy could cover the lane, not that it is secretly on overwatch. An unmarked hex is never guaranteed safe. Recon aircraft give the opponent a broad nine-sector direction, never the exact search circle.</p><p>Fictional engagements: Italy 1944; North Africa 1942; Ethiopian Patriots against Italian occupation forces in 1941. Equipment and role differences are playtest assumptions. Existing saves keep their rule version.</p>';
 $('rules').append(manual);
})();
