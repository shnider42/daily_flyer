/* Same page and motion renderer, separate game state and storage namespace. */
'use strict';
(()=>{
 const byId=id=>document.getElementById(id),root=byId('empires'),svg=byId('empMap');
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const se=(tag,attrs={},text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const hexCenter=(x,y)=>center(x,y); // The same projection used by DSL and its motion renderer.
 const same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1],posKey=p=>p.join(','),coord=p=>`${hexColumn(p[0])}${p[1]+1}`;
 const symbols={scout:'⌖',spearman:'⚔',archer:'↗',builder:'⚒',settler:'⚑',galley:'⚓'};
 const labels={found:'Found city · 2 AP',farm:'Farm · 2 AP',mine:'Mine · 2 AP',road:'Road · 2 AP',rally:'Rally · 1 AP',rest:'Rest · remaining AP',fortify:'Fortify · 2 AP'};
 const experience=()=>window.ww2Experience?.level||'simple';
 const depth=(simple,moderate,expert=moderate)=>({simple,moderate,expert})[experience()];
 const levelName=()=>experience()[0].toUpperCase()+experience().slice(1);
 const signed=n=>`${n>=0?'+':''}${n}`;
 const ruleExpansion=new Map();
 function ruleDetail(key,title,text){
  const n=el('details',undefined,'emp-rule-detail'),savedKey=`${game?.code||'home'}:${chosen}:${tab}:${key}`;
  n.dataset.rule=key;n.open=ruleExpansion.get(savedKey)??experience()==='expert';
  const summary=el('summary',title);summary.onclick=()=>ruleExpansion.set(savedKey,!n.open);
  n.append(summary,el('p',text));return n;
 }
 const actionHelp={
  found:['Turn these settlers into a new city.','Consumes settlers; 4-hex city spacing; up to 4 cities.'],
  farm:['Grow more food on this grass hex.','Adds 2 food, or 3 with Agriculture, when this tile is worked.'],
  mine:['Add production on this hill hex.','Adds 2 production, or 3 with Engineering, when this tile is worked.'],
  road:['Connect this hex for faster travel.','One paid road-to-road move per turn earns an immediate free road step.'],
  rally:['Recover so this unit can act again.','Removes shaken for 1 AP; moving and attacking require recovery first.'],
  rest:['Heal near one of your cities.','Heals 1 strength within two hexes of a friendly city; spends all remaining AP.'],
  fortify:['Take cover until this unit moves or is hit.','Adds 1 cover; moving or taking a hit clears fortification.']
 };
 function actionReason(unit,kind){
  if(working)return 'Wait for the current order to save.';
  if(game.winner)return 'This campaign is complete.';
  if(!game.ready)return 'Waiting for your opponent to join.';
  if(game.turn!==game.side)return 'Available on your turn.';
  if(kind==='fortify'&&unit.fortified)return 'Already fortified; no more AP needed.';
  if(unit.shaken&&kind!=='rally')return 'Rally before giving another order.';
  const cost=['rally','rest'].includes(kind)?1:2;
  if(unit.ap<cost)return `Needs ${cost} AP; this unit has ${unit.ap}.`;
  if(game.legal[unit.id]?.actions.includes(kind))return '';
  return {found:'Needs grass, woods or hills, at least 4 hexes from every city, and fewer than 4 owned cities.',farm:'Needs unimproved grass near your city, outside a city hex or rival territory.',mine:'Needs an unimproved hill near your city, outside a city hex or rival territory.',road:'Needs land without a road near your city, outside a city hex or rival territory.',rest:'Needs missing strength and a friendly city within two hexes.'}[kind]||'Unavailable in this position.';
 }
 function unitMeta(u){
  const stats=game.unit_types[u.kind],status=`${u.shaken?' · shaken':''}${u.fortified?' · fortified':''}`;
  return `${u.hp}${experience()==='expert'?'/'+stats.hp:''} HP · ${u.ap} AP${experience()==='simple'?'':' · '+coord(u.pos)}${status}`;
 }
 function turnSummary(){
  if(working)return 'Saving order…';
  if(game.winner)return 'Campaign complete.';
  if(!game.ready)return 'Waiting for your invited opponent.';
  if(game.turn!==game.side)return `${game.factions[game.turn].name} is taking its turn.`;
  return depth('Your turn. Explore, build, then End turn.','Your turn. Cities and research resolve at turn end.','Your turn · production, growth and research resolve on End turn.');
 }
 let game=null,seat=null,saves=[],chosen=null,target=null,inspected=null,tab='orders',working=false,polling=false,active=false,detail=innerWidth<700,confirmAction=null,requestGeneration=0;
 let rememberedMode='dsl',noticeTimer;
 try{saves=JSON.parse(localStorage.getItem('empires-sessions')||'[]');if(!Array.isArray(saves))saves=[];saves=saves.filter(s=>s&&typeof s.code==='string');rememberedMode=localStorage.getItem('dfe-game-mode')||'dsl';}catch{}
 function auth(){try{return JSON.parse(localStorage.getItem('ww2-commander')||'null');}catch{return null;}}
 function notice(text,persist=false){
  clearTimeout(noticeTimer);byId('empMessage').textContent=text;
  root.querySelectorAll('.emp-sheet-notice').forEach(n=>n.remove());
  const sheet=root.querySelector('.emp-sheet[open]');
  if(sheet){const n=el('p',text,'emp-sheet-notice');n.setAttribute('role','status');sheet.querySelector('.emp-sheet-heading').after(n);}
  if(!persist)noticeTimer=setTimeout(()=>{byId('empMessage').textContent='';root.querySelectorAll('.emp-sheet-notice').forEach(n=>n.remove());},8000);
 }
 function saveSeat(value){
  const old=saves.find(s=>s.code===value.code)||{};seat={...old,...value};saves=[seat,...saves.filter(s=>s.code!==seat.code)].slice(0,50);
  try{localStorage.setItem('empires-sessions',JSON.stringify(saves));}catch{notice('Browser storage is unavailable. Link this campaign to a commander before closing the tab.',true);}
 }
 async function request(path,body,credential=seat){
  const player=auth(),response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(credential?.token?{Authorization:`Bearer ${credential.token}`} : {}),...(player?.token?{'X-Commander-Token':player.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok){const e=new Error(data.error||'Could not complete that order.');e.status=response.status;throw e;}return data;
 }
 const myTurn=()=>game&&game.ready&&!game.winner&&game.turn===game.side&&!working;
 function button(text,fn,disabled=false,cls){const b=el('button',text,cls);b.type='button';b.disabled=disabled;b.addEventListener('click',fn);return b;}
 function confirm(title,text,action){closeMobileSheets();confirmAction=action;byId('empConfirmTitle').textContent=title;byId('empConfirmText').textContent=text;byId('empConfirm').showModal();}
 byId('empConfirmCancel').onclick=()=>byId('empConfirm').close();
 byId('empConfirmYes').onclick=()=>{const action=confirmAction;confirmAction=null;byId('empConfirm').close();action?.();};
 byId('empManualOpen').onclick=()=>{closeMobileSheets();byId('empManual').showModal();};byId('empManualClose').onclick=()=>byId('empManual').close();
 function mode(value){
  if(working)return;
  if(value==='empires'&&!byId('game').hidden)return;
  active=value==='empires';root.hidden=!active;document.body.classList.toggle('empires-active',active);
  byId('modeDSL').setAttribute('aria-pressed',String(!active));byId('modeEmpires').setAttribute('aria-pressed',String(active));
  document.title=active?'Empires · The Riverlands':'DSL · Tactical Command';
  const brand=document.querySelector('header .brand');brand.firstChild.textContent=active?'EMPIRES ':'DSL ';brand.querySelector('span').textContent=active?'THE RIVERLANDS':'TACTICAL COMMAND';
  try{localStorage.setItem('dfe-game-mode',value);}catch{}
  if(active)loadCampaigns();else window.ww2Motion?.clear(svg);
  syncSwitch();syncPalette();
 }
 function syncSwitch(){byId('gameModeSwitch').hidden=active?!byId('empPlay').hidden:!byId('game').hidden;syncMobile();}
 byId('modeDSL').onclick=()=>mode('dsl');byId('modeEmpires').onclick=()=>mode('empires');
 new MutationObserver(syncSwitch).observe(byId('game'),{attributes:true,attributeFilter:['hidden']});
 byId('empBack').onclick=()=>{
  if(working)return;requestGeneration++;game=null;chosen=target=inspected=null;window.ww2Motion?.clear(svg);byId('empPlay').hidden=true;byId('empHome').hidden=false;syncSwitch();loadCampaigns();window.scrollTo(0,0);
 };
 function identity(){
  const a=auth();byId('empIdentity').textContent=a?`Commander ${a.name} · shared with Squad Leader`:'Play as a guest, or use your existing Squad Leader commander.';
  byId('empSignIn').textContent=a?`Sign out ${a.name}`:'Sign in with your commander';
 }
 byId('empSignIn').onclick=()=>byId(auth()?'commanderSignOut':'commanderSignIn').click();
 document.addEventListener('ww2:commander',()=>{
  const a=auth();saves=saves.filter(s=>!s.commander||s.commander===a?.name);
  try{localStorage.setItem('empires-sessions',JSON.stringify(saves));}catch{}
  if(seat?.commander&&seat.commander!==a?.name){seat=null;byId('empBack').click();}
  identity();if(active)loadCampaigns();
 });
 async function loadCampaigns(){
  identity();const list=byId('empCampaigns');
  try{
   const data=await request('/api/empires/games',undefined,null),all=new Map(saves.map(s=>[s.code,s]));
   for(const s of data.games)all.set(s.code,{...all.get(s.code),...s});
   list.replaceChildren();
   if(!all.size){list.append(el('p','Your first campaign starts here.','emp-small'));return;}
   for(const s of all.values()){
    const b=button(s.side==='highland'?'Highland Compact':'River League',()=>open(s));
    b.append(el('span',`${s.round?`Round ${s.round} · `:''}${s.winner?'Finished · ':''}${s.code}`));list.append(b);
   }
  }catch(e){list.replaceChildren(el('p',e.message,'emp-small'));}
 }
 byId('empRefreshList').onclick=loadCampaigns;
 byId('empMode').onchange=()=>{const hidden=byId('empMode').value!=='solo';byId('empDifficulty').hidden=hidden;byId('empDifficultyLabel').hidden=hidden;};
 async function enter(data,newSeat){
  requestGeneration++;saveSeat(newSeat);game=data;chosen=game.cities.find(c=>c.side===game.side)?.id;target=inspected=null;tab='orders';
  byId('empHome').hidden=true;byId('empPlay').hidden=false;byId('empMapWrap').classList.toggle('emp-detail',detail);syncSwitch();render();
  requestAnimationFrame(focusSelection);window.scrollTo(0,0);
 }
 async function open(s){
  if(working)return;working=true;
  try{const data=await request(`/api/empires/games/${s.code}`,undefined,s);await enter(data,s);}catch(e){notice(e.message);}finally{working=false;render();}
 }
 byId('empCreate').onclick=async()=>{
  if(working)return;working=true;byId('empCreate').disabled=true;
  try{const result=await request('/api/empires/games',{faction:byId('empFaction').value,mode:byId('empMode').value,difficulty:byId('empDifficulty').value},null);await enter(result.game,result.seat);}
  catch(e){notice(e.message);}finally{working=false;byId('empCreate').disabled=false;render();}
 };
 byId('empJoinForm').onsubmit=async e=>{
  e.preventDefault();if(working)return;const code=byId('empJoinCode').value.trim().toUpperCase();working=true;
  try{const result=await request(`/api/empires/games/${code}/join`,{},saves.find(s=>s.code===code));await enter(result.game,{...result.seat,commander:result.seat.commander||auth()?.name});byId('empJoinCode').value='';}
  catch(err){notice(err.message);}finally{working=false;render();}
 };
 async function refresh(){
  if(!game||working||polling||!active)return;polling=true;const generation=requestGeneration,code=game.code;
  try{const data=await request(`/api/empires/games/${code}`);if(generation===requestGeneration&&game?.code===code&&(data.revision!==game.revision||data.ready!==game.ready)){game=data;render();}}
  catch(e){notice(e.message);}finally{polling=false;}
 }
 byId('empReload').onclick=refresh;
 setInterval(()=>{if(active&&game?.mode==='human'&&!document.hidden&&!working)refresh();},2500);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 async function order(command){
  if(!myTurn())return;working=true;requestGeneration++;const before=game.revision;
  const id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body={...command,revision:before,command_id:id};
  let marker;
  if(command.kind==='move'){
   const u=game.units.find(u=>u.id===command.unit),move=game.legal[u?.id]?.moves.find(m=>same(m.pos,command.pos));
   if(u)window.ww2Motion?.submitted(svg,u,move);
   const [cx,cy]=hexCenter(...command.pos);marker=se('circle',{cx,cy,r:24,class:'emp-order-pending'});svg.append(marker);
  }
  byId('empTurn').textContent=command.kind==='end'?'Resolving the turn…':'Order sent…';renderPanel();renderMobile();byId('empEnd').disabled=true;
  try{
   const data=await request(`/api/empires/games/${game.code}`,body);game=data;target=null;
   saveSeat({...seat,round:game.round,winner:game.winner,mode:game.mode});
  }catch(e){
   // Recover with a read, never a blind retry of an uncertain attack/end turn.
   notice(e.message+' Refreshing the saved campaign.',true);
   try{game=await request(`/api/empires/games/${game.code}`);}catch{notice('Connection lost. Your last order may have saved. Use Refresh before trying another order.',true);}
  }finally{marker?.remove();working=false;render();window.ww2Motion?.clearSubmitted(svg);}
 }
 byId('empEnd').onclick=()=>{
  if(!myTurn())return;
  const idle=game.units.filter(u=>u.side===game.side&&u.ap>1).length;
  if(idle)confirm('End your turn?',`${idle} unit${idle===1?' has':'s have'} more than 1 AP left. ${depth('Each can save only 1 unused AP for next turn.','Each can bank at most 1 AP.','Next-turn AP = base AP + min(1, unused AP).')} City production, growth and research will resolve.`,()=>order({kind:'end'}));
  else order({kind:'end'});
 };
 byId('empConcede').onclick=()=>confirm('Concede this campaign?','The other civilization wins. Your completed chronicle stays saved.',()=>order({kind:'resign'}));
 byId('empLink').onclick=async()=>{
  if(!auth()){closeMobileSheets();byId('commanderSignIn').click();notice('After signing in, choose Link to commander again.');return;}
  try{await request(`/api/empires/games/${game.code}/link`,{});saveSeat({...seat,commander:auth().name});notice('Campaign linked. Sign in as this commander to resume on another device.');}catch(e){notice(e.message);}
 };
 byId('empCopyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(game.code);notice('Campaign code copied.');}catch{byId('empInviteCode').select();notice('Select and copy the campaign code.');}};
 for(const b of root.querySelectorAll('[data-emp-tab]'))b.onclick=()=>{tab=b.dataset.empTab;renderPanel();};
 function select(id){
  const u=game.units.find(u=>u.id===id),c=game.cities.find(c=>c.id===id);
  if(u?.side!==game.side&&!c?.side){target=id;}else if((u||c)?.side!==game.side){target=id;}else{chosen=id;target=null;}
  inspected=(u||c)?.pos||null;tab='orders';renderMap();renderPanel();renderRoster();renderMobile();
  if(mobile&&(c||target))openPanel('orders');
 }
 function chooseHex(pos){
  if(working)return;
  const move=game.legal[chosen]?.moves.find(m=>same(m.pos,pos));
  if(move&&myTurn()){order({kind:'move',unit:chosen,pos});return;}
  const c=game.cities.find(c=>same(c.pos,pos)),units=game.units.filter(u=>same(u.pos,pos));
  if(units.length){const own=units.find(u=>u.side===game.side);select((own||units[0]).id);return;}
  if(c){select(c.id);return;}
  inspected=pos;target=null;tab='orders';renderMap();renderPanel();renderMobile();
 }
 function activate(n,action){n.addEventListener('click',e=>{e.stopPropagation();action();});n.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();action();}});}
 function motionValue(){return {...game,fog_of_war:true,visible_hexes:game.visible.map(p=>p.split(',').map(Number))};}
 function renderMap(){
  if(!game)return;window.ww2Motion?.capture(svg);
  const seen=new Set(game.visible),moves=new Map((game.legal[chosen]?.moves||[]).map(m=>[posKey(m.pos),m]));
  if(svg.dataset.campaign!==game.code){
   window.ww2Motion?.clear(svg);svg.replaceChildren();svg.dataset.campaign=game.code;svg._terrain=se('g');svg._roads=se('g');svg._cities=se('g');svg._units=se('g');svg.append(svg._terrain,svg._roads,svg._cities,svg._units);svg._tiles=new Map();
   for(let y=0;y<game.height;y++)for(let x=0;x<game.width;x++){
    const [cx,cy]=hexCenter(x,y),g=se('g'),p=se('polygon',{points:[[0,-32],[26,-16],[26,16],[0,32],[-26,16],[-26,-16]].map(([a,b])=>`${cx+a},${cy+b}`).join(' '),tabindex:0,role:'button'}),decor=se('g');
    g.append(p,decor);svg._terrain.append(g);activate(p,()=>chooseHex([x,y]));svg._tiles.set(`${x},${y}`,{g,p,decor,cx,cy});
   }
  }
  for(let y=0;y<game.height;y++)for(let x=0;x<game.width;x++){
   const k=`${x},${y}`,t=game.map[y][x],n=svg._tiles.get(k),m=moves.get(k),current=seen.has(k);
   n.p.setAttribute('class',`emp-tile ${t?.terrain||'unknown'}${t&&!current?' remembered':''}${m?' can-move':''}${same(inspected,[x,y])?' chosen':''}`);
   n.p.setAttribute('aria-label',`${coord([x,y])}: ${t?.terrain||'unexplored'}${t&&!current?', last seen':''}${m?`, move for ${m.cost} AP`:''}`);
   const signature=JSON.stringify([t,current,m?.cost]);if(signature===n.signature)continue;n.signature=signature;n.decor.replaceChildren();if(!t)continue;
   const {cx,cy}=n;
   if(t.terrain==='woods')for(const dx of [-10,3,13])n.decor.append(se('path',{d:`M${cx+dx} ${cy-12}l-6 14h12Z M${cx+dx} ${cy+2}v6`,class:'emp-terrain-mark'}));
   if(t.terrain==='hill'||t.terrain==='mountain')n.decor.append(se('path',{d:`M${cx-17} ${cy+8}l12 -20 10 18 M${cx-1} ${cy+7}l11 -24 12 24`,class:'emp-terrain-mark'}));
   if(t.terrain==='water')n.decor.append(se('path',{d:`M${cx-16} ${cy}q8 -5 16 0t16 0 M${cx-10} ${cy+8}q8 -5 16 0`,class:'emp-terrain-mark'}));
   if(t.terrain==='bridge')n.decor.append(se('path',{d:`M${cx-18} ${cy-7}h36m-36 14h36`,class:'emp-terrain-mark'}));
   const mark=t.improvement==='farm'?'▤':t.improvement==='mine'?'◆':t.resource==='grain'?'♧':t.resource==='iron'?'◆':t.resource==='ruins'?'⌂':'';
   if(mark)n.decor.append(se('text',{x:cx+11,y:cy-12,'text-anchor':'middle',class:'emp-resource'},mark));
   n.decor.append(se('text',{x:cx,y:cy+23,'text-anchor':'middle',class:m?'emp-move-cost':'emp-coordinate'},m?`${m.cost} AP`:coord([x,y])));
   n.decor.setAttribute('opacity',current?1:.5);
  }
  svg._roads.replaceChildren();
  for(let y=0;y<game.height;y++)for(let x=0;x<game.width;x++)if(game.map[y][x]?.road){
   const [cx,cy]=hexCenter(x,y);svg._roads.append(se('circle',{cx,cy,r:3,fill:'#ead7aa'}));
   for(const [nx,ny] of [[x+1,y],[x+(y%2),y+1],[x-1+(y%2),y+1]])if(game.map[ny]?.[nx]?.road){const [xx,yy]=hexCenter(nx,ny);svg._roads.append(se('line',{x1:cx,y1:cy,x2:xx,y2:yy,class:'emp-road'}));}
  }
  svg._cities.replaceChildren();
  for(const c of game.cities){
   const [cx,cy]=hexCenter(...c.pos),g=se('g',{class:`emp-city ${c.side}${c.visible?'':' stale'}`,role:'button',tabindex:0,'aria-label':`${c.name}, ${c.side===game.side?'your city':c.visible?'rival city':'last reported city'}, population ${c.population}`});
   g.append(se('rect',{x:cx-21,y:cy-20,width:42,height:36,rx:3}),se('path',{d:`M${cx-13} ${cy+4}v-17h7v6h12v-6h7v17Z`,fill:'#53674e'}),se('text',{x:cx,y:cy+31,'text-anchor':'middle'},`${c.capital?'★ ':''}${c.name}`));activate(g,()=>select(c.id));svg._cities.append(g);
  }
  // Keep the same counter nodes so a second selection does not cancel motion.
  const existing=new Map([...svg._units.children].map(n=>[n.dataset.unitId,n]));
  for(const u of game.units){
   const [cx,cy]=hexCenter(...u.pos),stack=game.units.filter(v=>same(v.pos,u.pos)),index=stack.indexOf(u),offset=stack.length>1?(index?12:-12):0;
   let g=existing.get(u.id);existing.delete(u.id);
   const signature=JSON.stringify([u,chosen===u.id,offset]);
   if(g?._key===signature)continue;
   if(!g){g=se('g');g.dataset.unitId=u.id;svg._units.append(g);activate(g,()=>select(u.id));}
   g._key=signature;g._unitPos=u.pos.slice();g.setAttribute('class',`unit ${u.side}${chosen===u.id?' selected':''}`);g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('transform',`translate(${offset},0)`);
   g.setAttribute('aria-label',`${game.unit_types[u.kind].name}, ${u.side===game.side?'yours':game.factions[u.side].name}, ${u.hp} strength${u.ap!==undefined?`, ${u.ap} AP`:''}${u.shaken?', shaken':''}`);
   g.replaceChildren(se('circle',{cx,cy,r:24,fill:'transparent',class:'unit-hit-target'}),se('rect',{x:cx-16,y:cy-17,width:32,height:32}),se('text',{x:cx,y:cy,'text-anchor':'middle',class:'emp-unit-symbol'},symbols[u.kind]),se('text',{x:cx,y:cy+11,'text-anchor':'middle',class:'emp-strength'},`${u.hp} HP${u.ap!==undefined?' · '+u.ap:''}`));
   if(u.shaken)g.append(se('text',{x:cx+14,y:cy-17,class:'emp-shaken'},'!'));
   if(u.fortified)g.append(se('text',{x:cx-20,y:cy-17},'▰'));
  }
  for(const g of existing.values())g.remove();
  const value=motionValue();window.ww2Motion?.finish(svg,value,{key:`empires:${game.code}`,context:value});
 }
 function renderRoster(){
  const roster=byId('empRoster');roster.replaceChildren();
  for(const c of game.cities.filter(c=>c.side===game.side)){
   const b=button(`♜ ${c.name}`,()=>{closeMobileSheets();select(c.id);focusSelection();});b.setAttribute('aria-pressed',String(chosen===c.id));b.append(el('small',`Population ${c.population} · ${c.project?c.projects[c.project]?.name||c.project:'Choose production'}${experience()==='expert'?' · '+coord(c.pos):''}`));roster.append(b);
  }
  for(const u of game.units.filter(u=>u.side===game.side)){
   const b=button(`${symbols[u.kind]} ${game.unit_types[u.kind].name}`,()=>{closeMobileSheets();select(u.id);focusSelection();});b.setAttribute('aria-pressed',String(chosen===u.id));b.append(el('small',unitMeta(u)));roster.append(b);
  }
 }
 function unitOptions(unit){
  const options=unit.kind==='settler'?['found']:unit.kind==='builder'?['farm','mine','road']:['fortify'];
  if(unit.shaken)options.unshift('rally');if(unit.hp<game.unit_types[unit.kind].hp)options.push('rest');return options;
 }
 function unitAction(unit,kind){
  const fortified=kind==='fortify'&&unit.fortified;
  const b=button(fortified?'Fortified':labels[kind],()=>order({kind,unit:unit.id}),fortified||!myTurn()||!game.legal[unit.id]?.actions.includes(kind));
  b.dataset.empAction=kind;b.title=actionReason(unit,kind)||depth(actionHelp[kind][0],actionHelp[kind][1]);return b;
 }
 function renderPanel(){
  if(!game)return;const panel=byId('empPanel');panel.replaceChildren();for(const b of root.querySelectorAll('[data-emp-tab]'))b.setAttribute('aria-pressed',String(b.dataset.empTab===tab));
  if(!myTurn())panel.append(el('p',turnSummary(),'emp-warning'));
  if(tab==='research'){
   panel.append(el('h3',depth('Choose what to discover','A new understanding','Research & prerequisites')),el('p',depth(`Knowledge unlocks discoveries. You have ${game.player.knowledge} and gain ${game.economy.knowledge} each turn. Choose a benefit below.`,`${game.player.knowledge} knowledge stored · +${game.economy.knowledge} each turn. Knowledge carries over when you change research.`,`Stored ${game.player.knowledge} knowledge; income +${game.economy.knowledge}/turn. One selected technology can complete per turn; excess knowledge carries over.`)));
   for(const [k,t] of Object.entries(game.technologies)){
    const done=game.player.techs.includes(k),available=t.requires.every(r=>game.player.techs.includes(r)),selected=game.player.research===k;
    const b=button(`${done?'✓ ':selected?'→ ':''}${t.name} · ${t.cost} knowledge`,()=>order({kind:'research',tech:k}),!myTurn()||done||!available,'emp-tech');b.setAttribute('aria-pressed',String(selected));b.dataset.empTech=k;
    const missing=Math.max(0,t.cost-game.player.knowledge),timing=missing?`${Math.ceil(missing/Math.max(1,game.economy.knowledge))} turns at current income`:'Can finish at turn end';
    b.append(el('small',t.benefit+(done?' · Discovered':!available?` · Requires ${t.requires.map(r=>game.technologies[r].name).join(', ')}`:selected?' · Researching':'')));
    if(!done&&available&&experience()!=='simple')b.append(el('small',timing));
    if(experience()==='expert')b.append(el('small',`Prerequisites: ${t.requires.map(r=>game.technologies[r].name).join(', ')||'none'}. ${done?'Completed.':missing+' knowledge remaining.'}`));
    panel.append(b);
   }
   panel.append(ruleDetail('research','Research rules','Knowledge carries over between discoveries and when changing research. At turn end, income is added, then the selected technology completes if its cost is met. Only one technology completes per turn; excess knowledge stays stored.'));return;
  }
  if(tab==='diplomacy'){
   const d=game.diplomacy;panel.append(el('h3',d.met?game.factions[game.side==='river'?'highland':'river'].name:'Beyond the horizon'));
   if(!d.met){panel.append(el('p',depth('Send a scout across the valley to meet your neighbor. Then you can talk about trade or war.','Diplomacy becomes available after spotting a rival unit or city.','Contact requires a rival unit or city in your visible hexes. Unexplored territory reveals no current rival information.')));return;}
   panel.append(el('p',d.war?'At war. Military units may attack visible enemies.':d.trade?'At peace, with open trade. Both civilizations earn +3 gold each turn.':'At peace. Explore and develop, or negotiate a trade agreement.'));
   panel.append(el('p',depth('Offers need your neighbor to agree. Declaring war ends trade and puts both capitals at risk.','Trade adds +3 gold per side per turn. Offers need acceptance; declaring war ends trade immediately.','Trade: +3 gold/side/turn. Peace and trade offers require acceptance on the recipient’s turn. War cancels trade and enables legal military attacks; capital capture ends the campaign.')));
   if(d.offer){panel.append(el('p',`${d.offer.side===game.side?'You offered':'Your neighbor offered'} ${d.offer.kind}.`));if(d.offer.side!==game.side)panel.append(button('Accept offer',()=>order({kind:'diplomacy',action:'accept'}),!myTurn()),button('Decline',()=>order({kind:'diplomacy',action:'decline'}),!myTurn()));}
   const actions=el('div',undefined,'emp-actions');
   if(!d.war&&!d.trade)actions.append(button('Offer trade',()=>order({kind:'diplomacy',action:'trade'}),!myTurn()));
   if(d.war)actions.append(button('Offer peace',()=>order({kind:'diplomacy',action:'peace'}),!myTurn()));
   else actions.append(button('Declare war',()=>confirm('Declare war?','Trade will end. Both armies may attack, and either capital can be captured.',()=>order({kind:'diplomacy',action:'war'})),!myTurn()));
   panel.append(actions);return;
  }
  const unit=game.units.find(u=>u.id===chosen),city=game.cities.find(c=>c.id===chosen);
  if(target){
   const enemy=game.units.find(u=>u.id===target)||game.cities.find(c=>c.id===target),attack=game.legal[chosen]?.attacks.find(a=>a.id===target);
   if(enemy){panel.append(el('h3',enemy.name||game.unit_types[enemy.kind].name),el('p',`${game.factions[enemy.side].name} · ${enemy.hp} strength${enemy.visible===false?' · last reported':''}`));
    if(attack){
     const odds=Math.round((7-attack.threshold)/6*100),risk=odds<50?'Risky shot':'Even chance';
     panel.append(el('p',depth(`${risk}: ${odds}% chance to hit. A hit removes ${attack.damage} strength. Cost: 2 AP.`,`${unit?game.unit_types[unit.kind].name:''}: ${odds}% chance to hit · ${attack.damage} damage · 2 AP. Cover makes hits harder.`,`Hit on ${attack.threshold}+ on a six-sided die (${odds}%). Damage ${attack.damage}; cost 2 AP.`),'emp-attack-preview'));
     panel.append(ruleDetail('attack','Attack rules',`Successful die faces: ${attack.threshold}–6. Chance = (7 − ${attack.threshold}) / 6. A surviving unit hit becomes shaken and loses fortification. Woods, hills, fortification and city defenses increase the required roll, up to 6.`));
     panel.append(button('Confirm attack · 2 AP',()=>order({kind:'attack',unit:chosen,target}),!myTurn(),'emp-primary'));
    }
    else panel.append(el('p',!game.diplomacy.war?'You are at peace. Use Diplomacy to change relations.':'Select your military unit first. A legal attack needs AP, range and a clear line of sight.'));
    panel.append(button('Back to selection',()=>{target=null;renderPanel();renderMobile();}));return;
   }target=null;
  }
  if(city?.side===game.side){
   panel.append(el('h3',city.name+(city.capital?' ★':'')),el('p',`Population ${city.population} · ${city.hp} city strength${experience()==='simple'?'':' · '+coord(city.pos)}`));
   const stats=el('div',undefined,'emp-stats');for(const [k,v] of Object.entries(city.yields))if(k!=='worked')stats.append(el('span',`${k} ${signed(v)}/turn`));panel.append(stats);
   const growth=6+city.population*4;
   panel.append(el('p',depth('Food grows your city. Production builds the project you choose below.',`Growth: ${city.food} / ${growth} food${city.population>=6?' · population cap reached':''}. Food is already after consumption.`,`Growth: ${city.food} / (6 + 4 × ${city.population}) = ${growth} food; population cap 6. Working ${city.yields.worked.map(coord).join(', ')||'the city center'}.`)));
   if(city.population>=6&&experience()==='simple')panel.append(el('p','This city has reached its population limit of 6.'));
   if(game.economy.shortage)panel.append(el('p',`Upkeep shortfall: ${game.economy.shortage} production across your cities will pay for your units this turn.`, 'emp-warning'));
   const label=el('label','Production project');label.htmlFor='empProject';const selectEl=el('select');selectEl.id='empProject';selectEl.append(new Option('Choose a project…',''));
   for(const [k,p] of Object.entries(city.projects))selectEl.append(new Option(`${p.name} · ${p.cost} production`,k));selectEl.value=city.project||'';selectEl.disabled=!myTurn();selectEl.onchange=()=>{if(selectEl.value)order({kind:'produce',city:city.id,project:selectEl.value});};panel.append(label,selectEl);
   if(city.project){const p=city.projects[city.project];if(p){
    const missing=Math.max(0,p.cost-city.production),cost=missing*3;
    const timing=!missing?'Production ready; resolves at turn end if placement is possible':game.economy.shortage?'Timing depends on upkeep payments':`${Math.ceil(missing/Math.max(1,city.yields.production))} turns at current output`;
    panel.append(el('p',depth(`${p.name}: ${timing}.`,`${city.production} / ${p.cost} production · ${timing}.`,`Stored ${city.production}; cost ${p.cost}; remaining ${missing}. ${timing}.`)),el('p',p.benefit||p.role||''));
    panel.append(button(`Rush project · ${cost} gold`,()=>order({kind:'rush',city:city.id}),!myTurn()||!cost||game.player.gold<cost));
    if(cost&&game.player.gold<cost)panel.append(el('p',`Rush needs ${cost} gold; you have ${game.player.gold}.`,'emp-unavailable'));
   }}
   else panel.append(el('p',`${city.production} production stored. Choose your next project.`));
   if(city.buildings.length)panel.append(el('p','Built: '+city.buildings.map(k=>k[0].toUpperCase()+k.slice(1)).join(', ')));
   panel.append(ruleDetail('city','Growth & production rules',`Food stored: ${city.food}/${growth}. Each citizen automatically works a nearby tile. Growth threshold = 6 + 4 × population; population cap 6. Food shown is net of consumption. Production carries over; rush cost = 3 gold × missing production. Completed units need a free city or adjacent hex.`));
   if(experience()==='simple')panel.append(el('p','Use Units & cities to find another city, including one under a unit.'));return;
  }
  if(unit?.side===game.side){
   const stats=game.unit_types[unit.kind];panel.append(el('h3',stats.name),el('div',unitMeta(unit),'emp-stats'),el('p',stats.role));
   if(experience()==='simple')panel.append(el('p','HP is remaining strength. AP pays for moves and orders.'));
   panel.append(el('p',unit.shaken?'Shaken: rally before moving or attacking.':unit.road_bonus?'Your next adjacent road hex is free. Another action forfeits it.':'Tap a highlighted neighboring hex to move. Labels show the AP cost.'));
   if(unit.charges!==undefined)panel.append(el('p',`${unit.charges} building charges remaining. Improvements need a friendly city within two hexes.`));
   const actions=el('div',undefined,'emp-actions');for(const k of unitOptions(unit))actions.append(unitAction(unit,k));panel.append(actions);
   const explanations=el('div',undefined,'emp-action-help');
   for(const k of unitOptions(unit)){const reason=actionReason(unit,k),p=el('p',undefined,reason?'emp-unavailable':'');p.dataset.empActionHelp=k;p.append(el('strong',`${labels[k].split(' · ')[0]}${reason?' unavailable':''}: `),document.createTextNode(reason||depth(actionHelp[k][0],actionHelp[k][1])));explanations.append(p);}panel.append(explanations);
   if(unit.kind==='settler')panel.append(el('p','Cities must be at least 4 hexes apart. Founding consumes the settlers. Maximum: 4 cities.'));
   if(stats.reach)panel.append(el('p',`Attack range ${stats.reach} · cost 2 AP. Tap a visible enemy to inspect the shot before confirming.`));
   panel.append(ruleDetail('unit','Unit numbers & movement rules',`Base ${stats.ap} AP; bank at most 1 unused AP. Base sight ${stats.sight}${game.player.techs.includes('cartography')?' + 1 from Cartography':''} hexes; upkeep ${stats.upkeep} gold/turn; attack range ${stats.reach}. Open land costs 1 AP; hills and woods cost 2, except scouts cross woods for 1. Two friendly units per hex. One road bonus per turn: a paid road-to-road move earns an immediate free road step.`));
  }else panel.append(el('h3','Your next decision'),el('p','Select a city to build, or a unit to explore. The Research and Diplomacy tabs shape your civilization beyond the battlefield.'));
  if(inspected){const t=game.map[inspected[1]]?.[inspected[0]],stale=t&&!game.visible.includes(posKey(inspected));panel.append(el('p',`${experience()==='simple'?'Terrain':coord(inspected)} · ${t?.terrain||'Unexplored'}${t?.resource?' · '+t.resource:''}${t?.improvement?' · '+t.improvement:''}${t?.road?' · road':''}${stale?' · last seen; current activity unknown':''}`));}
 }
 function render(){
  if(!game)return;byId('empNation').textContent=game.factions[game.side].name;
  const resource=byId('empResources');resource.replaceChildren();
  const currentTech=game.player.research?game.technologies[game.player.research].name:'Choose research';
  for(const [label,value,extra] of [['Gold',game.player.gold,depth('Pays for units and rush projects',`${signed(game.economy.gold)}/turn`,`${signed(game.economy.gold)}/turn · ${game.economy.upkeep} upkeep`)],['Knowledge',game.player.knowledge,depth('Unlocks discoveries',`+${game.economy.knowledge}/turn`)],['Score',game.score,depth('Grow cities and make discoveries','Cities + people + discoveries','4/city + population + 3/tech + ruins')],['Round',`${game.round} / ${game.last_round}`,currentTech]]){
   const block=el('div');block.append(el('small',label),el('strong',String(value)),el('span',extra));resource.append(block);
  }
  const turn=turnSummary();
  byId('empTurn').textContent=turn+(game.economy.shortage?` Upkeep shortfall: ${game.economy.shortage} production will be used.`:'');
  byId('empInvitation').hidden=game.ready;byId('empInviteCode').value=game.code;
  byId('empResult').hidden=!game.winner;byId('empResult').textContent=game.winner?`${game.winner==='draw'?'A shared legacy':game.winner===game.side?'Victory':'Defeat'} · ${game.result} ${game.scores?Object.entries(game.scores).map(([k,v])=>`${game.factions[k].name}: ${v}`).join(' · '):''}`:'';
  byId('empEnd').disabled=!myTurn();byId('empConcede').disabled=!myTurn();byId('empLink').disabled=working;
  byId('empLatest').textContent=journalText(game.journal.at(-1)?.text||'');
  byId('empJournal').replaceChildren(...game.journal.slice().reverse().map((v,i)=>{
   const text=journalText(v.text),row=el('li',`${experience()==='expert'?'R':'Round '}${v.round} · ${text}`);
   if(text!==v.text)row.append(ruleDetail('journal-'+i,'Dice details',v.text));return row;
  }));
  renderMap();renderRoster();renderPanel();renderMobile();byId('empZoom').textContent=detail?'Fit map':'Detail ＋';byId('empZoom').setAttribute('aria-pressed',String(detail));
 }
 function journalText(text){
  if(experience()==='expert')return text;
  const shot=text.match(/^(.+): rolled ([1-6]), needed ([1-6])\+\. (?:(\d+) damage\.|Missed\.)$/);
  if(!shot)return text;
  return `${shot[1]}: ${shot[4]?'hit for '+shot[4]+' strength':'missed'}.${experience()==='moderate'?' Hit chance: '+Math.round((7-Number(shot[3]))/6*100)+'%.':''}`;
 }
 function focusSelection(){
  if(!game)return;const item=game.units.find(u=>u.id===chosen)||game.cities.find(c=>c.id===chosen)||game.cities.find(c=>c.side===game.side);if(!item)return;
  const wrap=byId('empMapWrap'),[x,y]=hexCenter(...item.pos),scale=svg.getBoundingClientRect().width/861;
  wrap.scrollTo({left:Math.max(0,x*scale-wrap.clientWidth/2),top:Math.max(0,y*scale-wrap.clientHeight/2),behavior:'instant'});
 }
 byId('empFind').onclick=focusSelection;
 byId('empZoom').onclick=()=>{detail=!detail;window.ww2Motion?.clear(svg);byId('empMapWrap').classList.toggle('emp-detail',detail);byId('empZoom').textContent=detail?'Fit map':'Detail ＋';byId('empZoom').setAttribute('aria-pressed',String(detail));focusSelection();};
 // DSL's phone pattern: one viewport, persistent map/orders, secondary sheets.
 // Move the existing controls, preserving handlers and a single source of state.
 let mobile=false;
 const mobileNodes=['empMapWrap','empResources','empTurn','empZoom','empFind','empEnd','empSidebar','empRoster','empInvitation','empResult','empChronicle','empAccountTools','empManualOpen','empReload','empExperienceControl'];
 const anchors=new Map(mobileNodes.map(id=>{const anchor=document.createComment(id+' home');byId(id).before(anchor);return [id,anchor];}));
 const sheets=['empOrdersSheet','empRosterSheet','empMenu'];
 const sheetButtons={empOrdersSheet:'empOrdersOpen',empRosterSheet:'empRosterOpen',empMenu:'empMenuOpen'};
 function closeMobileSheets(){for(const id of sheets)if(byId(id).open)byId(id).close();}
 function openSheet(id){
  if(!mobile)return;closeMobileSheets();byId(id).showModal();byId(sheetButtons[id]).setAttribute('aria-expanded','true');
 }
 function openPanel(value){tab=value;renderPanel();openSheet('empOrdersSheet');}
 for(const id of sheets){
  const dialog=byId(id);dialog.addEventListener('close',()=>{const opener=byId(sheetButtons[id]);opener.setAttribute('aria-expanded','false');if(mobile)opener.focus({preventScroll:true});});
  dialog.querySelector('[data-emp-close]').onclick=()=>dialog.close();
 }
 byId('empOrdersOpen').onclick=()=>openPanel('orders');
 byId('empResearchOpen').onclick=()=>openPanel('research');
 byId('empDiplomacyOpen').onclick=()=>openPanel('diplomacy');
 byId('empRosterOpen').onclick=()=>openSheet('empRosterSheet');
 byId('empMenuOpen').onclick=()=>openSheet('empMenu');
 byId('empMobileHome').onclick=()=>byId('empBack').click();
 byId('empAppearance').onclick=()=>byId('appearanceToggle').click();
 function syncPalette(){
  const dark=document.documentElement.dataset.theme!=='light';
  byId('empAppearance').textContent=dark?'Night colors · switch to daylight':'Daylight colors · switch to night';
  byId('empAppearance').setAttribute('aria-pressed',String(dark));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',active?(dark?'#131c2b':'#edf0f4'):(dark?'#171e1b':'#f4f1e8'));
 }
 new MutationObserver(syncPalette).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 function syncMobile(){
  const next=active&&!!game&&!byId('empPlay').hidden&&innerWidth<1100;
  if(next===mobile)return;
  closeMobileSheets();mobile=next;document.body.classList.toggle('empires-mobile',mobile);byId('empMobileScreen').hidden=!mobile;
  if(mobile){
   byId('empMobileScreen').append(byId('empResources'),byId('empMapWrap'));
   byId('empMobileStatus').append(byId('empTurn'));
   byId('empUnitNav').append(byId('empZoom'),byId('empFind'));byId('empFind').textContent='Center';
   byId('empOrderHead').append(byId('empEnd'));byId('empOrdersSheet').append(byId('empSidebar'));
   byId('empRosterSheet').append(byId('empRoster'));
   byId('empMenu').append(byId('empInvitation'),byId('empResult'),byId('empChronicle'),byId('empAccountTools'));
   byId('empMenuTools').append(byId('empManualOpen'),byId('empReload'));
   byId('empMenuExperience').append(byId('empExperienceControl'));
  }else{
   for(const [id,anchor] of anchors)anchor.after(byId(id));byId('empFind').textContent='Find selection';
  }
  renderMobile();
 }
 function cycleUnit(step){
  if(!game||working)return;
  const own=game.units.filter(u=>u.side===game.side),ready=own.filter(u=>u.ap>0),pool=ready.length?ready:own;if(!pool.length)return;
  const index=pool.findIndex(u=>u.id===chosen),next=index<0?(step>0?0:pool.length-1):(index+step+pool.length)%pool.length;
  select(pool[next].id);focusSelection();
 }
 byId('empPrevious').onclick=()=>cycleUnit(-1);byId('empNext').onclick=()=>cycleUnit(1);
 function renderMobile(){
  if(!game)return;
  const unit=game.units.find(u=>u.id===chosen&&u.side===game.side),city=game.cities.find(c=>c.id===chosen&&c.side===game.side);
  const ready=game.units.filter(u=>u.side===game.side&&u.ap>0).length;
  byId('empMobileTitle').textContent=`Empires · ${game.factions[game.side].name}`;
  byId('empEconomySummary').textContent=depth(
   `Grow cities, explore and discover technologies to improve your score. Gold pays for units and rush projects; knowledge unlocks discoveries. You have ${game.player.gold} gold (${signed(game.economy.gold)}/turn) and ${game.player.knowledge} knowledge (+${game.economy.knowledge}/turn).`,
   `${game.factions[game.side].name} · Round ${game.round} of ${game.last_round}. Gold ${game.player.gold} (${signed(game.economy.gold)}/turn). Knowledge ${game.player.knowledge} (+${game.economy.knowledge}/turn). Upkeep ${game.economy.upkeep} gold/turn.`,
   `R${game.round}/${game.last_round} · Gold ${game.player.gold}; net ${signed(game.economy.gold)}/turn after ${game.economy.upkeep} upkeep. Knowledge ${game.player.knowledge}; +${game.economy.knowledge}/turn. Score ${game.score} = 4/city + population + 3/technology + ruins.`
  )+` ${game.player.research?'Research: '+game.technologies[game.player.research].name+'.':'Choose your next research.'}${game.economy.shortage?' Upkeep shortfall: '+game.economy.shortage+' production.':''}`;
  byId('empMenuOpen').textContent=game.winner?'Result':!game.ready?'Invite':`Menu · ${levelName()}`;
  byId('empMenuOpen').setAttribute('aria-label',`Campaign menu and Experience: ${levelName()}${!game.ready?' · invitation code':game.winner?' · result':''}`);
  byId('empSelectedName').textContent=(unit?game.unit_types[unit.kind].name:city?.name||'Select a unit or city')+' · Orders';
  byId('empSelectedMeta').textContent=unit?unitMeta(unit):city?`Population ${city.population} · ${city.project?city.projects[city.project]?.name||city.project:'Choose production'}${experience()==='expert'?' · '+coord(city.pos):''}`:'Tap the map to select';
  byId('empRosterOpen').textContent=`Units & cities · ${ready} ready`;
  byId('empPrevious').disabled=byId('empNext').disabled=working||!game.units.some(u=>u.side===game.side);
  for(const id of ['empPrevious','empNext'])byId(id).setAttribute('aria-label',`${id==='empNext'?'Next':'Previous'} ${ready?'unit with AP':'unit'}`);
  byId('empMobileHint').textContent=working?'Saving order…':game.winner?byId('empResult').textContent:!game.ready?'Open Invite to share your campaign code.':!myTurn()?'Waiting for the other civilization.':target?'Open Orders to review your target.':unit?.shaken?'Rally before moving or attacking.':unit?.road_bonus?'Your next road hex is free.':unit?depth(`Tap a highlighted hex to move · ${unit.ap} AP left`,`Move costs are on the map · bank up to 1 AP`,`${coord(unit.pos)} · ${unit.ap} AP · range ${game.unit_types[unit.kind].reach} · bank ≤1 AP`):city?depth('Choose production in Orders; cities build at turn end.',`Production ${signed(city.yields.production)}/turn · food ${signed(city.yields.food)}/turn`,`${coord(city.pos)} · production ${city.production} · food ${city.food}/${6+4*city.population}`):'Select a unit to explore, or a city to build.';
  const quick=byId('empQuickOrders');quick.replaceChildren();
  if(unit&&!target)for(const k of unitOptions(unit))quick.append(unitAction(unit,k));
  else quick.append(button(target?'Review target':'Production',()=>openPanel('orders'),!city&&!target));
  if(quick.children.length<3)quick.append(button('Research',()=>openPanel('research')));
 }
 window.addEventListener('resize',()=>{const before=mobile;syncMobile();if(before!==mobile&&game)requestAnimationFrame(focusSelection);});
 // A pan must never also issue the click-to-move order at its release point.
 let mapPointer=null,mapDragged=false;
 byId('empMapWrap').addEventListener('pointerdown',e=>{mapDragged=!!mapPointer;mapPointer={x:e.clientX,y:e.clientY,id:e.pointerId};},{passive:true});
 byId('empMapWrap').addEventListener('pointermove',e=>{if(mapPointer&&Math.hypot(e.clientX-mapPointer.x,e.clientY-mapPointer.y)>10)mapDragged=true;},{passive:true});
 byId('empMapWrap').addEventListener('pointerup',()=>{mapPointer=null;},{passive:true});
 byId('empMapWrap').addEventListener('pointercancel',()=>{mapPointer=null;mapDragged=true;},{passive:true});
 byId('empMapWrap').addEventListener('click',e=>{if(mapDragged&&e.detail){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 // One Experience preference, owned by DSL's existing preference controller.
 // Updating presentation never issues an order or recenters the map.
 let manualExpansion=null;
 byId('empRulebook').querySelector('summary').onclick=()=>{manualExpansion=!byId('empRulebook').open;};
 function renderGuide(){
  byId('empGuideTitle').textContent=depth('Your first turns','Planning your civilization','Empires rules reference');
  const steps=depth([
   ['Explore','Select a scout, then tap a highlighted neighboring hex. AP means action points; the number on the hex is the move cost.'],
   ['Build','Open Units & cities, choose a city, then choose its production project. Builders improve nearby land; settlers found new cities.'],
   ['Discover','Open Research and choose a useful benefit. Knowledge builds up when you end your turn.'],
   ['Finish your turn','Use your units, then End turn. Cities grow and build, research advances, and your rival gets a turn.'],
  ],[
   ['Plan around AP','Terrain changes movement costs. Keep up to 1 unused AP for next turn. A road-to-road move can earn an immediate free road step.'],
   ['Grow the economy','Food drives population; production builds projects; gold pays upkeep; knowledge funds research. Check city yields and project timing.'],
   ['Read the odds','Attack previews show hit chance, damage and AP cost. Cover lowers the chance of a hit. Rally shaken units before moving or attacking.'],
   ['Choose your relationship','Accepted trade earns both sides +3 gold each turn. War cancels trade and puts both capitals at risk.'],
   ['Use the chronicle','Menu contains the full saved event history. Dim terrain and rival cities are last reports, not current information.']
  ],[
   ['Inspect exact rules','Map coordinates, full unit numbers, growth arithmetic, research prerequisites and die thresholds are shown. Expand the reference below for every rule.'],
   ['Keep uncertainty visible','Legal actions and odds come from the current campaign snapshot. Fog hides current rival activity; last reports are marked. Experience changes no rules or difficulty.']
  ]);
  byId('empGuideSteps').replaceChildren(el('p','Win with the highest development score after 40 rounds, or capture the rival capital. War is optional.'),...steps.map(([title,text])=>{const section=el('section');section.append(el('h3',title),el('p',text));return section;}));
  byId('empRulebook').open=manualExpansion??experience()==='expert';
 }
 function syncExperience(){
  root.dataset.experience=experience();byId('empManual').dataset.experience=experience();
  byId('empMapHint').textContent=depth('Select a unit, then a highlighted hex','Move labels show AP cost; dim tiles are last reports','Coordinates · move AP · dim = last seen');
  const note=depth('Short instructions and one decision at a time. Full rules are available when you want them.','Useful numbers, timing and tactical explanations beside your decisions.','Exact unit statistics, map coordinates, formulas and die thresholds.');
  for(const n of document.querySelectorAll('[data-emp-experience-note]'))n.textContent=note;
  const positions=['empMapWrap','empOrdersSheet','empRosterSheet','empMenu','empManual','empRoster'].map(id=>[byId(id),byId(id).scrollLeft,byId(id).scrollTop]);
  renderGuide();if(game&&active)render();
  for(const [n,left,top] of positions){n.scrollLeft=left;n.scrollTop=top;}
 }
 document.addEventListener('ww2:experience',syncExperience);
 // A small illustrated atlas is generated from the same offset grid, not a screenshot.
 const atlas=byId('empAtlas');
 for(let y=0;y<7;y++)for(let x=0;x<9;x++){
  const cx=25+x*48+(y%2)*24,cy=25+y*43,water=x===4||y===6,forest=!water&&(x+y*3)%5===0;
  atlas.append(se('polygon',{points:[[0,-27],[23,-13],[23,13],[0,27],[-23,13],[-23,-13]].map(([a,b])=>`${cx+a},${cy+b}`).join(' '),fill:water?'#5a8a91':forest?'#718f68':'#adb88a',stroke:'#3b5a47','stroke-width':.8}));
  if(forest)atlas.append(se('path',{d:`M${cx} ${cy-13}l-9 19h18Z`,fill:'#3c6244'}));
 }
 for(const [x,y,name] of [[115,155,'HEARTHFORD'],[340,135,'STONEWATCH']])atlas.append(se('rect',{x:x-9,y:y-12,width:18,height:21,fill:'#e7d3a8',stroke:'#384c3a','stroke-width':2}),se('text',{x,y:y+29,'text-anchor':'middle',fill:'#21392c','font-size':10,'font-family':'system-ui','font-weight':700},name));
 identity();syncExperience();mode(new URLSearchParams(location.search).get('join')?'dsl':rememberedMode);
 window.empiresUI={get state(){return game;},get selection(){return chosen;},open,mode,order,refresh};
})();
