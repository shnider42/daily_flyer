/* Same page and motion renderer, separate game state and storage namespace. */
'use strict';
(()=>{
 const byId=id=>document.getElementById(id),root=byId('empires'),svg=byId('empMap');
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const se=(tag,attrs={},text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const hexCenter=(x,y)=>center(x,y); // The same projection used by DSL and its motion renderer.
 const same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1],posKey=p=>p.join(','),coord=p=>`${hexColumn(p[0])}${p[1]+1}`;
 const art=window.empiresArt,learning=window.empiresLearning,terrain=window.empiresTerrain;
 const labels={found:'Found city · 2 AP',farm:'Farm · 2 AP',mine:'Mine · 2 AP',road:'Road · 2 AP',rally:'Rally · 1 AP',rest:'Rest · remaining AP',fortify:'Fortify · 2 AP'};
 const experience=()=>window.ww2Experience?.level||'simple';
 const depth=(simple,moderate,expert=moderate)=>({simple,moderate,expert})[experience()];
 const levelName=()=>experience()[0].toUpperCase()+experience().slice(1);
 const experienceMarker=topic=>el('p',`${levelName()} · ${topic}`,'emp-experience-context');
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
 let rememberedMode='dsl',noticeTimer,pendingResearch=null,uncertainResearch=null;
 let inspectMode=false,mapLens=null,welcomeScheduled=false;
 try{const v=localStorage.getItem('empires-map-lens');if(['land','yields'].includes(v))mapLens=v;}catch{}
 const landLens=()=>mapLens||(experience()==='simple'?'yields':'land');
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
  syncSwitch();syncPalette();if(active)syncArt();renderLearning();
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
  byId('empResearchNotice').textContent='';uncertainResearch=null;inspectMode=false;
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
  try{
   const data=await request(`/api/empires/games/${code}`);
   if(generation===requestGeneration&&game?.code===code){
    const changed=data.revision!==game.revision||data.ready!==game.ready;game=data;
    if(uncertainResearch){reconcileResearch(uncertainResearch);uncertainResearch=null;}
    if(changed)render();
   }
  }
  catch(e){notice(e.message);}finally{polling=false;}
 }
 byId('empReload').onclick=refresh;
 setInterval(()=>{if(active&&game?.mode==='human'&&!document.hidden&&!working)refresh();},2500);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 async function order(command){
  if(!myTurn()||(command.kind==='research'&&game.player.research===command.tech))return;
  working=true;requestGeneration++;const previousGame=game,before=game.revision,previousResearch=game.player.research;
  if(command.kind==='research'){
   pendingResearch=command.tech;uncertainResearch=null;byId('empResearchNotice').textContent=`Saving research choice: ${game.technologies[command.tech]?.name||command.tech}…`;
  }
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
   learning.record(command,previousGame,game);
   if(command.kind==='research')researchConfirmation(command.tech);
   if(command.kind==='end'&&previousResearch&&game.player.techs.includes(previousResearch)){
    const tech=game.technologies[previousResearch],message=`${tech.name} discovered. ${tech.benefit}. ${game.player.techs.length===Object.keys(game.technologies).length?'All discoveries are complete.':'Choose your next research.'}`;
    byId('empResearchNotice').textContent=message;notice(message);
   }else if(command.kind==='end')byId('empResearchNotice').textContent='';
  }catch(e){
   // Recover with a read, never a blind retry of an uncertain attack/end turn.
   if(command.kind!=='research')notice(e.message+' Refreshing the saved campaign.',true);
   if(command.kind==='research')byId('empResearchNotice').textContent='Research choice not confirmed yet. Checking the saved campaign…';
   try{
    game=await request(`/api/empires/games/${game.code}`);
    learning.record(command,previousGame,game);
    if(command.kind==='research')reconcileResearch(command.tech);
   }catch{
    const message='Connection lost. Your last order may have saved. Use Refresh before trying another order.';
    if(command.kind==='research'){uncertainResearch=command.tech;byId('empResearchNotice').textContent=message;}else notice(message,true);
   }
  }finally{
   marker?.remove();working=false;pendingResearch=null;render();window.ww2Motion?.clearSubmitted(svg);
   if(command.kind==='research'&&tab==='research'&&byId('empOrdersSheet').open)byId('empOrdersSheet').scrollTo({top:0,behavior:'instant'});
  }
 }
 function researchConfirmation(tech){
  if(game.player.research!==tech)return;
  byId('empResearchNotice').textContent=`Research saved: ${game.technologies[tech].name}. Progress advances when you End turn. No unit AP was spent.`;
 }
 function reconcileResearch(tech){
  if(game.player.research===tech)researchConfirmation(tech);
  else byId('empResearchNotice').textContent=game.player.techs.includes(tech)?`${game.technologies[tech].name} has already been discovered.`:`Research did not change. ${game.player.research?game.technologies[game.player.research].name+' is still selected.':'Choose a technology to begin.'}`;
 }
 function researchTiming(tech){
  const remaining=Math.max(0,tech.cost-game.player.knowledge),income=game.economy.knowledge;
  if(game.winner)return 'Campaign complete; research will not advance further.';
  if(remaining>0&&income<=0)return 'No knowledge income yet; increase it to make progress.';
  const turns=Math.max(1,Math.ceil(remaining/Math.max(1,income)));
  return turns===1?'Completes when you next End turn, at current income.':`About ${turns} of your turns remaining at current income.`;
 }
 function currentResearch(){
  const box=el('section',undefined,'emp-current-research'),tech=game.technologies[game.player.research];box.id='empCurrentResearch';
  box.setAttribute('aria-labelledby','empCurrentResearchTitle');
  box.append(el('p','CIVILIZATION RESEARCH','emp-kicker'));
  const title=el('h3',tech?`Current research: ${tech.name}`:game.player.techs.length===Object.keys(game.technologies).length?'All discoveries complete':'Choose your next research');title.id='empCurrentResearchTitle';box.append(title);
  if(tech){
   box.append(el('p',`${game.player.knowledge} / ${tech.cost} knowledge · +${game.economy.knowledge} each turn`,'emp-research-progress-text'));
   const bar=el('progress');bar.max=tech.cost;bar.value=Math.min(game.player.knowledge,tech.cost);bar.setAttribute('aria-label',`${tech.name}: ${game.player.knowledge} of ${tech.cost} knowledge stored`);box.append(bar);
   box.append(el('p',researchTiming(tech),'emp-research-timing'),el('p',tech.benefit));
  }else box.append(el('p',`${game.player.knowledge} knowledge stored. ${game.player.techs.length===Object.keys(game.technologies).length?'Your discoveries are listed below.':'Choose an available technology below; stored knowledge carries over.'}`));
  box.append(el('p',depth('Research belongs to your whole civilization. It uses knowledge, not a unit’s AP. It advances when you End turn, not while you wait.','One civilization-wide technology at a time. Knowledge is added at your turn end; unit AP is unaffected.','At your turn end: add knowledge income, then complete the selected technology if its cost is met. Excess knowledge carries over; no unit AP cost.')));
  if(tech&&!game.winner)box.append(el('p','You can switch to another available discovery below. Your stored knowledge is kept.','emp-small'));
  return box;
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
  inspectMode=false;
  const u=game.units.find(u=>u.id===id),c=game.cities.find(c=>c.id===id);
  if(u?.side!==game.side&&!c?.side){target=id;}else if((u||c)?.side!==game.side){target=id;}else{chosen=id;target=null;}
  inspected=(u||c)?.pos||null;tab='orders';renderMap();renderPanel();renderRoster();renderMobile();
  if(mobile&&(c||target))openPanel('orders');
 }
 function chooseHex(pos){
  if(working)return;
  if(inspectMode){showHex(pos);return;}
  const move=game.legal[chosen]?.moves.find(m=>same(m.pos,pos));
  if(move&&myTurn()){order({kind:'move',unit:chosen,pos});return;}
  const c=game.cities.find(c=>same(c.pos,pos)),units=game.units.filter(u=>same(u.pos,pos));
  if(units.length){const own=units.find(u=>u.side===game.side);select((own||units[0]).id);return;}
  if(c){select(c.id);return;}
  showHex(pos);
 }
 function activate(n,action){n.addEventListener('click',e=>{e.stopPropagation();action();});n.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();action();}});}
 function motionValue(){return {...game,fog_of_war:true,visible_hexes:game.visible.map(p=>p.split(',').map(Number))};}
 function renderMap(){
  if(!game)return;window.ww2Motion?.capture(svg);
  const seen=new Set(game.visible),moves=new Map((game.legal[chosen]?.moves||[]).map(m=>[posKey(m.pos),m]));
  if(svg.dataset.campaign!==game.code){
   window.ww2Motion?.clear(svg);svg.replaceChildren();svg.dataset.campaign=game.code;terrain.install(svg);svg._terrain=se('g');svg._roads=se('g',{class:'emp-land-roads'});svg._outlines=se('g',{class:'emp-land-outlines'});svg._labels=se('g',{class:'emp-land-labels'});svg._cities=se('g');svg._units=se('g');svg.append(svg._terrain,svg._roads,svg._outlines,svg._labels,svg._cities,svg._units);svg._tiles=new Map();
   for(let y=0;y<game.height;y++)for(let x=0;x<game.width;x++){
    const [cx,cy]=hexCenter(x,y),g=se('g'),shape=terrain.points.map(([a,b])=>`${cx+a},${cy+b}`).join(' '),p=se('polygon',{points:shape,tabindex:0,role:'button'}),land=se('g',{transform:`translate(${cx} ${cy})`,'aria-hidden':'true'}),outline=se('polygon',{points:shape,'aria-hidden':'true'}),decor=se('g',{'aria-hidden':'true'});
    g.append(p,land);svg._terrain.append(g);svg._outlines.append(outline);svg._labels.append(decor);activate(p,()=>chooseHex([x,y]));
    p.addEventListener('focus',()=>outline.classList.add('key-focus'));p.addEventListener('blur',()=>outline.classList.remove('key-focus'));svg._tiles.set(`${x},${y}`,{g,p,land,outline,decor,cx,cy});
   }
  }
  for(let y=0;y<game.height;y++)for(let x=0;x<game.width;x++){
   const k=`${x},${y}`,t=game.map[y][x],n=svg._tiles.get(k),m=moves.get(k),current=seen.has(k);
   n.p.setAttribute('class',`emp-tile ${t?.terrain||'unknown'}${t&&!current?' remembered':''}${m?' can-move':''}${same(inspected,[x,y])?' chosen':''}`);
   n.outline.setAttribute('class',n.p.getAttribute('class').replace('emp-tile','emp-land-outline')+(document.activeElement===n.p?' key-focus':''));
   n.land.setAttribute('class',`emp-landscape${t&&!current?' remembered':''}`);
   const landscape=terrain.descriptor(game.map,x,y);
   if(n.landKey!==landscape?.key){terrain.draw(n.land,landscape);n.landKey=landscape?.key;}
   const worked=current?game.cities.find(c=>c.side===game.side&&c.yields.worked.some(p=>same(p,[x,y]))):null,value=game.land_yields?.[k];
   n.p.setAttribute('aria-label',`${coord([x,y])}: ${t?.terrain||'unexplored'}${t&&!current?', last seen':''}${m?`, move for ${m.cost} AP`:''}${value?`, potential food ${value.food}, production ${value.production}, gold ${value.gold}`:''}${worked?', worked by '+worked.name:''}${inspectMode?', tap to inspect':''}`);
   const signature=JSON.stringify([t,current,m?.cost,landLens(),value,worked?.id]);if(signature===n.signature)continue;n.signature=signature;n.decor.replaceChildren();if(!t)continue;
   const {cx,cy}=n;
   for(const [i,kind]of [t.resource,t.improvement].filter(Boolean).entries()){
    n.decor.append(se('circle',{cx:cx+15.5-i*17,cy:cy-13.5,r:8,class:'emp-resource-disc'}));
    const icon=learning.icon(kind);icon.setAttribute('x',cx+9-i*17);icon.setAttribute('y',cy-20);icon.setAttribute('width',13);icon.setAttribute('height',13);icon.classList.add('emp-map-resource');n.decor.append(icon);
   }
   if(landLens()==='yields'&&value&&!game.cities.some(c=>same(c.pos,[x,y]))){
    const yields=Object.entries(value).filter(([,v])=>v>0);
    if(yields.length)n.decor.append(se('rect',{x:cx-yields.length*9-3,y:cy,width:yields.length*18+5,height:12,rx:5,class:'emp-yield-plaque'}));
    for(const [i,[kind,amount]]of yields.entries()){
     const left=cx-yields.length*9+i*18,icon=learning.icon(kind);icon.setAttribute('x',left);icon.setAttribute('y',cy+1);icon.setAttribute('width',10);icon.setAttribute('height',10);icon.classList.add('emp-map-yield');n.decor.append(icon,se('text',{x:left+11,y:cy+10,class:'emp-yield-number'},String(amount)));
    }
    if(worked){n.decor.append(se('circle',{cx:cx-16.5,cy:cy-14.5,r:7.5,class:'emp-resource-disc'}));const icon=learning.icon('worker');icon.setAttribute('x',cx-22);icon.setAttribute('y',cy-20);icon.setAttribute('width',11);icon.setAttribute('height',11);icon.classList.add('emp-worked-mark');n.decor.append(icon);}
   }
   n.decor.append(se('text',{x:cx,y:cy+(m?26:23),'text-anchor':'middle',class:m?'emp-move-cost':'emp-coordinate'},m?`${m.cost} AP`:coord([x,y])));
   n.decor.setAttribute('opacity',current?1:.5);
  }
  terrain.roads(svg._roads,game,hexCenter);
  svg._cities.replaceChildren();
  for(const c of game.cities){
   const [cx,cy]=hexCenter(...c.pos),g=se('g',{class:`emp-city ${c.side}${c.visible?'':' stale'}${chosen===c.id?' selected':''}`,role:'button',tabindex:0,'aria-label':`${c.name}, ${c.side===game.side?'your city':c.visible?'rival city':'last reported city'}, population ${c.population}${c.capital?', capital':''}`});
   const drawing=art.counter(c,{stats:false});drawing.setAttribute('transform',`translate(${cx} ${cy})`);
   g.append(se('circle',{cx,cy,r:25,fill:'transparent'}),drawing,se('text',{x:cx,y:cy+33,'text-anchor':'middle'},`${c.capital?'★ ':''}${c.name}`));activate(g,()=>inspectMode?showHex(c.pos):select(c.id));svg._cities.append(g);
  }
  // Keep the same counter nodes so a second selection does not cancel motion.
  const existing=new Map([...svg._units.children].map(n=>[n.dataset.unitId,n]));
  for(const u of game.units){
   const [cx,cy]=hexCenter(...u.pos),stack=game.units.filter(v=>same(v.pos,u.pos)),index=stack.indexOf(u),offset=stack.length>1?(index?12:-12):0;
   let g=existing.get(u.id);existing.delete(u.id);
   const signature=JSON.stringify([u,chosen===u.id,offset,art.style]);
   if(g?._key===signature)continue;
   if(!g){g=se('g');g.dataset.unitId=u.id;svg._units.append(g);activate(g,()=>inspectMode?showHex(game.units.find(v=>v.id===u.id).pos):select(u.id));}
   g._key=signature;g._unitPos=u.pos.slice();g.setAttribute('class',`unit ${u.side}${chosen===u.id?' selected':''}`);g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('transform',`translate(${offset},0)`);
   g.setAttribute('aria-label',`${game.unit_types[u.kind].name}, ${u.side===game.side?'yours':game.factions[u.side].name}, ${u.hp} strength${u.ap!==undefined?`, ${u.ap} AP`:''}${u.shaken?', shaken':''}${u.fortified?', fortified':''}`);
   const drawing=art.counter(u);drawing.setAttribute('transform',`translate(${cx} ${cy}) scale(${stack.length>1?.85:1})`);
   g.replaceChildren(se('title',{},g.getAttribute('aria-label')),se('circle',{cx,cy,r:24,fill:'transparent',class:'unit-hit-target'}),drawing);
  }
  for(const g of existing.values())g.remove();
  const value=motionValue();window.ww2Motion?.finish(svg,value,{key:`empires:${game.code}`,context:value});
 }
 function renderRoster(){
  const roster=byId('empRoster');roster.replaceChildren();
  for(const c of game.cities.filter(c=>c.side===game.side)){
   const b=button('',()=>{closeMobileSheets();select(c.id);focusSelection();}),copy=el('span',c.name,'emp-roster-copy');b.setAttribute('aria-pressed',String(chosen===c.id));copy.append(el('small',`Population ${c.population} · ${c.project?c.projects[c.project]?.name||c.project:'Choose production'}${experience()==='expert'?' · '+coord(c.pos):''}`));b.append(art.portrait(c),copy);roster.append(b);
  }
  for(const u of game.units.filter(u=>u.side===game.side)){
   const b=button('',()=>{closeMobileSheets();select(u.id);focusSelection();}),copy=el('span',game.unit_types[u.kind].name,'emp-roster-copy');b.setAttribute('aria-pressed',String(chosen===u.id));copy.append(el('small',unitMeta(u)));b.append(art.portrait(u),copy);roster.append(b);
  }
 }
 function selectionHeading(item,title,description){
  const header=el('div',undefined,'emp-selection-heading'),copy=el('div');copy.append(el('h3',title),el('p',description));header.append(art.portrait(item),copy);return header;
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
 function decisionCard(){
  if(experience()==='expert'||!myTurn()||target)return null;
  const unit=game.units.find(u=>u.id===chosen&&u.side===game.side),city=game.cities.find(c=>c.id===chosen&&c.side===game.side);
  let title,copy;
  if(tab==='research'){
   const tech=game.technologies[game.player.research];
   if(!tech&&game.player.techs.length===Object.keys(game.technologies).length)return null;
   title=tech?'Your research is already running':'Choose a useful discovery';
   copy=tech?depth(`${tech.name} advances when you End turn. Use your units while your civilization researches.`,`${tech.name}: ${researchTiming(tech)} Compare another benefit below before switching; all stored knowledge is kept.`):depth('Choose a benefit below. Research uses knowledge and advances at End turn; it spends no unit action points.',`You have ${game.player.knowledge} knowledge stored and earn ${game.economy.knowledge} each turn. Compare benefits and completion times below.`);
  }else if(tab==='diplomacy'){
   if(!game.diplomacy.met)return null;
   title=game.diplomacy.war?'Choose whether to keep fighting':'Consider trade before war';
   copy=depth(game.diplomacy.war?'You can offer peace below. Your neighbor must accept before fighting stops.':'Trade helps both civilizations earn gold. War enables attacks and puts capitals at risk.',game.diplomacy.war?'Peace needs the recipient’s acceptance on their turn. An offer alone does not end the war.':'Accepted trade adds 3 gold per side each turn. Declaring war cancels trade immediately; it does not require acceptance.');
  }else if(city){
   const project=city.projects[city.project],missing=project?Math.max(0,project.cost-city.production):0;
   title=project?depth('Your city already has a job','Compare production with gold'):'Choose what this city builds';
   copy=project?depth(`${city.name} is building ${project.name}. Its production is resolved when you End turn. You can use your units while it builds.`,`${project.name}: ${city.production} / ${project.cost} production, ${signed(city.yields.production)} per turn. ${missing?`Rush costs ${missing*3} gold and completes the project immediately if there is room. Gold also pays unit upkeep.`:'Production is funded; completion waits for turn end and any required unit space.'}`):depth('Choose a project below. Your city saves production and uses it when you End turn.',`${city.production} production is stored. Compare project benefits and costs; changing a project keeps that production.`);
  }else if(unit){
   const legal=game.legal[unit.id]||{moves:[],actions:[],attacks:[]};
   if(unit.shaken){title='Recover this unit first';copy=actionReason(unit,'rally')||'Rally costs 1 AP. Once recovered, this unit can move or attack again.';}
   else if(!unit.ap){title='This unit has used its actions';copy='Choose another unit, or End turn when you are ready. Its action points refresh for its next turn.';}
   else if(unit.kind==='builder'){
    const improvements=legal.actions.filter(k=>['farm','mine','road'].includes(k));
    title=improvements.length?'Choose how to improve this hex':'Find useful land for these Builders';
    copy=depth(improvements.length?'Use an available improvement below. It costs 2 AP and one building charge. Farms and mines help income when a city works this land; roads help travel.':'Inspect nearby land to find where your city works. Move the Builders onto an eligible hex before improving it.',`${unit.ap} AP · ${unit.charges} charges. ${improvements.length?'Available here: '+improvements.map(k=>labels[k].split(' · ')[0]).join(', ')+'.':'No improvement is available here.'} Compare an income improvement on worked land with a road for movement. Each uses 2 AP and one charge.`);
   }else if(unit.kind==='settler'){
    title=legal.actions.includes('found')?'Choose whether to found here':'Find room for another city';
    copy=depth('Found city uses these Settlers and costs 2 AP. Inspect the nearby land before choosing the city’s permanent home.',`${unit.ap} AP. Founding costs 2 AP and consumes this unit; cities must be at least 4 hexes apart. Compare nearby yields and space before committing.`);
   }else{
    title=depth('Choose one useful move','Budget this unit’s actions');
    copy=depth(unit.kind==='scout'?'Tap a highlighted neighboring hex to explore. The number on it is the AP cost; Inspect hex explains the land without moving.':'Tap a highlighted hex to move, or a visible rival to review an attack. An attack happens only after you confirm it.',`${unit.ap} AP available. ${legal.attacks.length?'A legal attack costs 2 AP; compare its odds with moving into cover.':'Compare movement costs with keeping AP for another order.'} At most 1 unused AP carries into the next turn.`);
   }
  }else{return null;}
  const box=el('section',undefined,'emp-decision-card');box.id='empDecision';box.append(el('h3',title),el('p',copy));return box;
 }
 function renderPanel(){
  if(!game)return;const panel=byId('empPanel');panel.replaceChildren();for(const b of root.querySelectorAll('[data-emp-tab]'))b.setAttribute('aria-pressed',String(b.dataset.empTab===tab));
  panel.append(experienceMarker(depth('Next step and what it does','Choices, costs and timing','Full rules and exact values')));
  byId('empResearchNotice').hidden=tab!=='research';
  if(!myTurn())panel.append(el('p',turnSummary(),'emp-warning'));
  const decision=decisionCard();if(decision)panel.append(decision);
  if(tab==='research'){
   panel.append(currentResearch(),el('h3',depth('Discoveries','Discoveries & timing','Discoveries & prerequisites')));
   for(const [k,t] of Object.entries(game.technologies)){
    const done=game.player.techs.includes(k),available=t.requires.every(r=>game.player.techs.includes(r)),selected=game.player.research===k;
    const b=button(`${done?'✓ ':''}${t.name} · ${t.cost} knowledge`,()=>order({kind:'research',tech:k}),!myTurn()||done||!available||selected,'emp-tech');b.setAttribute('aria-pressed',String(selected));b.dataset.empTech=k;
    b.dataset.researchState=pendingResearch===k?'pending':selected?'active':done?'complete':available?'available':'locked';
    if(selected)b.setAttribute('aria-current','true');
    const missing=Math.max(0,t.cost-game.player.knowledge);
    b.append(el('span',pendingResearch===k?'Saving choice…':selected?'✓ Active research':done?'Discovered':available?game.player.research?'Switch research':'Start research':'Requires discovery','emp-research-badge'));
    b.append(el('small',t.benefit+(available?'':` · Requires ${t.requires.map(r=>game.technologies[r].name).join(', ')}`)));
    if(selected)b.append(el('small',`${game.player.knowledge} / ${t.cost} knowledge · progress at End turn`));
    if(!done&&available&&(selected||experience()!=='simple'))b.append(el('small',researchTiming(t)));
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
   if(enemy){panel.append(selectionHeading(enemy,enemy.name||game.unit_types[enemy.kind].name,`${game.factions[enemy.side].name} · ${enemy.hp} strength${enemy.visible===false?' · last reported':''}`));
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
   panel.append(selectionHeading(city,city.name+(city.capital?' ★':''),`Population ${city.population} · ${city.hp} city strength${experience()==='simple'?'':' · '+coord(city.pos)}`));
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
   const stats=game.unit_types[unit.kind];panel.append(selectionHeading(unit,stats.name,stats.role),el('div',unitMeta(unit),'emp-stats'));
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
  renderMap();renderRoster();renderPanel();renderMobile();renderLearning();if(byId('empHexSheet').open)renderHex();byId('empZoom').textContent=detail?'Fit map':'Zoom in';byId('empZoom').setAttribute('aria-pressed',String(detail));
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
 byId('empZoom').onclick=()=>{detail=!detail;window.ww2Motion?.clear(svg);byId('empMapWrap').classList.toggle('emp-detail',detail);byId('empZoom').textContent=detail?'Fit map':'Zoom in';byId('empZoom').setAttribute('aria-pressed',String(detail));focusSelection();};
 // DSL's phone pattern: one viewport, persistent map/orders, secondary sheets.
 // Move the existing controls, preserving handlers and a single source of state.
 let mobile=false;
 const mobileNodes=['empMapWrap','empResources','empTurn','empZoom','empFind','empEnd','empSidebar','empRoster','empInvitation','empResult','empChronicle','empAccountTools','empManualOpen','empReload','empExperienceControl','empArtToggle','empMapTools'];
 const anchors=new Map(mobileNodes.map(id=>{const anchor=document.createComment(id+' home');byId(id).before(anchor);return [id,anchor];}));
 const sheets=['empOrdersSheet','empRosterSheet','empMenu','empLearnSheet','empHexSheet'];
 const sheetButtons={empOrdersSheet:'empOrdersOpen',empRosterSheet:'empRosterOpen',empMenu:'empMenuOpen',empLearnSheet:'empLearnOpen',empHexSheet:'empInspectToggle'};
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
   byId('empMobileScreen').append(byId('empResources'),byId('empMapWrap'),byId('empMapTools'));
   byId('empMobileStatus').append(byId('empTurn'));
   byId('empUnitNav').append(byId('empZoom'),byId('empFind'));byId('empFind').textContent='Center';
   byId('empOrderHead').append(byId('empEnd'));byId('empOrdersSheet').append(byId('empSidebar'));
   byId('empRosterSheet').append(byId('empRoster'));
   byId('empMenu').append(byId('empInvitation'),byId('empResult'),byId('empChronicle'),byId('empAccountTools'));
   byId('empMenuTools').append(byId('empManualOpen'),byId('empReload'),byId('empArtToggle'));
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
  const research=game.technologies[game.player.research];
  byId('empResearchOpen').replaceChildren('Research',el('small',research?`${research.name} · ${game.player.knowledge}/${research.cost} knowledge`:game.player.techs.length===Object.keys(game.technologies).length?'All discoveries complete':'Choose your next discovery'));
  byId('empMenuOpen').textContent=game.winner?'Result':!game.ready?'Invite':`Menu · ${levelName()}`;
  byId('empMenuOpen').setAttribute('aria-label',`Campaign menu and Experience: ${levelName()}${!game.ready?' · invitation code':game.winner?' · result':''}`);
  byId('empSelectedName').textContent=(unit?game.unit_types[unit.kind].name:city?.name||'Select a unit or city')+' · Orders';
  byId('empSelectedPortrait').replaceChildren(...(unit||city?[art.portrait(unit||city)]:[]));
  byId('empSelectedMeta').textContent=unit?unitMeta(unit):city?`Population ${city.population} · ${city.project?city.projects[city.project]?.name||city.project:'Choose production'}${experience()==='expert'?' · '+coord(city.pos):''}`:'Tap the map to select';
  byId('empRosterOpen').textContent=`Units & cities · ${ready} ready`;
  byId('empPrevious').disabled=byId('empNext').disabled=working||!game.units.some(u=>u.side===game.side);
  for(const id of ['empPrevious','empNext'])byId(id).setAttribute('aria-label',`${id==='empNext'?'Next':'Previous'} ${ready?'unit with AP':'unit'}`);
  byId('empMobileHint').textContent=working?'Saving order…':game.winner?byId('empResult').textContent:!game.ready?'Open Invite to share your campaign code.':!myTurn()?'Waiting for the other civilization.':target?'Open Orders to review your target.':unit?.shaken?'Rally before moving or attacking.':unit?.road_bonus?'Your next road hex is free.':unit?depth(`Tap a highlighted hex to move · ${unit.ap} AP left`,`Move costs are on the map · bank up to 1 AP`,`${coord(unit.pos)} · ${unit.ap} AP · range ${game.unit_types[unit.kind].reach} · bank ≤1 AP`):city?depth('Choose production in Orders; cities build at turn end.',`Production ${signed(city.yields.production)}/turn · food ${signed(city.yields.food)}/turn`,`${coord(city.pos)} · production ${city.production} · food ${city.food}/${6+4*city.population}`):'Select a unit to explore, or a city to build.';
  const quick=byId('empQuickOrders');quick.replaceChildren();
  if(unit&&!target)for(const k of unitOptions(unit))quick.append(unitAction(unit,k));
  else quick.append(button(target?'Review target':'Production',()=>openPanel('orders'),!city&&!target));
  if(quick.children.length<3)quick.append(button('Research',()=>openPanel('research')));
  if(inspectMode)byId('empMobileHint').textContent='Inspect mode: tap any hex to learn about it. No move or AP spent. Turn Inspect off to move.';
  syncMapTools();
 }
 function syncMapTools(){
  byId('empMapHint').textContent=inspectMode?'Inspect mode · tap a hex; no order is issued':depth('Select a unit, then a highlighted hex','Move labels show AP cost; dim tiles are last reports','Coordinates · move AP · dim = last seen');
  byId('empInspectToggle').textContent=inspectMode?'Inspect: on':'Inspect hex';byId('empInspectToggle').setAttribute('aria-pressed',String(inspectMode));
  byId('empMapView').textContent=`Map: ${landLens()}`;byId('empMapView').setAttribute('aria-pressed',String(landLens()==='yields'));
  byId('empMapView').title='Yields show potential food, production and gold. Inspect a hex for plain-language explanations.';
  svg.classList.toggle('emp-inspecting',inspectMode);
 }
 function showHex(pos){
  if(!game)return;inspected=pos.slice();target=null;closeMobileSheets();renderMap();renderHex();byId('empHexSheet').showModal();
  byId('empInspectToggle').setAttribute('aria-expanded','true');
  if(game.map[pos[1]]?.[pos[0]])learning.mark(game,'land','You inspected land. Potential yield becomes income only when a citizen works that hex.');
  renderLearning();
 }
 function movementReason(unit,pos,t,current){
  if(!current)return 'This is outside your current sight. Explore closer before moving here; unseen activity is unknown.';
  if(!unit||unit.side!==game.side)return 'Select one of your units to see its legal moves. Units move; cities stay in place.';
  if(same(unit.pos,pos))return `${game.unit_types[unit.kind].name} is already here. Its orders act from this hex.`;
  if(game.winner)return 'This campaign is finished.';
  if(!game.ready||game.turn!==game.side)return 'Movement is available on your turn, after your opponent has joined.';
  if(unit.shaken)return 'This unit is shaken. Rally before moving or attacking.';
  if(t.terrain==='mountain')return 'Mountains are impassable to every unit.';
  if(unit.kind==='galley'&&t.terrain!=='water')return 'A Galley travels on water, not land or bridges.';
  if(unit.kind!=='galley'&&t.terrain==='water')return 'This is a land unit. Only a Galley can enter water; use a bridge to cross on land.';
  if(learning.distance(unit.pos,pos)>1)return 'Move one neighboring hex at a time. Choose a highlighted neighbor first.';
  if(game.cities.some(c=>c.side!==game.side&&same(c.pos,pos)))return 'A rival city blocks movement. At war, Spearmen can attack and capture it after its garrison is defeated.';
  const occupants=game.units.filter(u=>same(u.pos,pos));
  if(occupants.some(u=>u.side!==game.side))return 'A visible rival unit occupies this hex. Moving onto it is not an attack; attacks require war and a legal target.';
  if(occupants.length>=2)return 'This hex already holds two units. Make room before moving here.';
  const road=t.road&&game.map[unit.pos[1]]?.[unit.pos[0]]?.road,cost=road?(unit.road_bonus?0:1):['woods','hill'].includes(t.terrain)&&!(unit.kind==='scout'&&t.terrain==='woods')?2:1;
  if(unit.ap<cost)return `This step needs ${cost} AP; the unit has ${unit.ap}. End a turn to refresh AP.`;
  return 'This move is not in the current legal orders. Refresh if the campaign has changed.';
 }
 function yieldRow(values,city=false){
  const row=el('div',undefined,'emp-hex-yields');
  for(const key of ['food','production','gold']){
   const cell=el('div'),copy=el('span'),name=city&&key==='food'?'Food surplus':key[0].toUpperCase()+key.slice(1);
   copy.append(el('strong',String(values[key])),el('small',name));cell.append(learning.icon(key),copy);row.append(cell);
  }
  return row;
 }
 function renderHex(){
  if(!game||!inspected)return;
  const pos=inspected,t=game.map[pos[1]]?.[pos[0]],current=game.visible.includes(posKey(pos)),panel=byId('empHexContent');panel.replaceChildren();
  byId('empHexTitle').textContent=`${coord(pos)} · ${t?learning.terrain[t.terrain]?.[0]||t.terrain:'Unexplored'}`;
  panel.append(experienceMarker(depth('What this hex helps you do','Yield, movement and tradeoffs','Terrain and current legal orders')));
  if(!t){panel.append(el('p','You have not seen this land yet. Its terrain, resources and occupants are unknown.'),el('p','Move a Scout toward the edge of visible land. You can only enter currently visible neighboring hexes.'));return;}
  panel.append(el('p',current?'Currently visible · inspection spends no AP.':'Last-seen land · these are remembered features, not a live report. Current occupants and changes are unknown.',current?'emp-small':'emp-warning'));
  panel.append(el('p',learning.terrain[t.terrain][1]));
  const city=game.cities.find(c=>same(c.pos,pos)),ownCity=city?.side===game.side,value=game.land_yields?.[posKey(pos)];
  if(city){
   panel.append(el('h3',`${city.name}${city.visible===false?' · last reported':''}`));
   if(ownCity){
    const full=`City totals per turn, including worked land and buildings. Food is after population consumption. This city also produces ${city.yields.knowledge} knowledge. The center provides base income; it is not another citizen-worked tile.`;
    panel.append(yieldRow(city.yields,true),el('p',depth(`These are this city’s totals each turn. Food helps it grow; production builds its project. It also earns ${city.yields.knowledge} knowledge.`,`Net food is after population consumption. These totals include worked land and buildings, plus ${city.yields.knowledge} knowledge per turn.`,full)));
    if(experience()!=='expert')panel.append(ruleDetail('hex-city-'+coord(pos),'How city income is counted',full));
   }
   else panel.append(el('p','This rival city’s economy and production choices are private. Its visible or last-reported public details can be inspected.'));
   panel.append(button(ownCity?'Open city production':'Inspect city',()=>{closeMobileSheets();select(city.id);if(!mobile)openPanel('orders');}));
  }else if(value){
   panel.append(el('h3',current?'Potential yield when worked':'Potential from remembered land'),yieldRow(value),el('p',depth('A city can collect these amounts each turn when a citizen works this hex. A unit standing here does not collect them.','Per-turn potential with your discoveries: food grows population, production builds projects, and gold pays upkeep or rushes a project. A citizen must work the hex.','Food grows population. Production builds projects. Gold pays upkeep or rushes production. These values are per turn, using your discoveries. A unit standing here does not collect them.')));
   const worked=current?game.cities.find(c=>c.side===game.side&&c.yields.worked.some(p=>same(p,pos))):null;
   const nearby=game.cities.filter(c=>c.side===game.side&&learning.distance(c.pos,pos)<=2);
   const workingRule=worked?`Worked by ${worked.name} now. This yield is included in that city’s output and collected at your turn end.`:!current?'We cannot treat remembered land as a current activity report.':nearby.length?`Not currently worked. Within range of ${nearby.map(c=>c.name).join(', ')}. Each citizen automatically works one nearby hex; only the nearest city can use it. More population or a better improvement can change the choice.`:'Outside the working range of your cities. A city must be within two hexes to use this land. Settlers can found a city, subject to spacing and terrain rules.';
   panel.append(el('p',experience()==='simple'&&current&&!worked?(nearby.length?'Your city is not working this hex now. It may become useful as the city grows or the land improves.':'This land is too far from your cities to earn income. A city must be within two hexes.'):workingRule,'emp-hex-working'));
   if(experience()==='simple'&&current&&!worked)panel.append(ruleDetail('hex-working-'+coord(pos),'Why this land is not earning income',workingRule));
  }
  const features=[];
  if(t.resource==='grain')features.push('Grain adds +1 food; it is already included in the potential shown.');
  if(t.resource==='iron')features.push('Iron adds +1 production; it is already included in the potential shown.');
  if(t.resource==='ruins')features.push('Ruins give +8 gold and +1 development point once when a unit enters. This is a one-time exploration reward, not a recurring city yield.');
  if(t.improvement==='farm')features.push(`Farm: +${game.player.techs.includes('agriculture')?3:2} food when worked, included above.`);
  if(t.improvement==='mine')features.push(`Mine: +${game.player.techs.includes('engineering')?3:2} production when worked, included above.`);
  if(t.road)features.push('Road: a road-to-road step costs 1 AP and can unlock one free road step that turn. Roads add no food, production or gold.');
  if(features.length){panel.append(el('h3','What is on this hex'));for(const text of features)panel.append(el('p',text));}
  panel.append(el('h3','Movement and defense'));
  panel.append(el('p',t.terrain==='mountain'?'Mountains cannot be entered and block sight through them.':t.terrain==='water'?'Only galleys enter water; a normal water step costs 1 AP. Water gives no terrain cover.':`${['woods','hill'].includes(t.terrain)?'Normally 2 AP to enter; '+(t.terrain==='woods'?'Scouts pay only 1 AP. ':'')+'This terrain adds defensive cover.':'Normally 1 AP to enter. This terrain gives no defensive cover.'}${t.terrain==='woods'?' Woods block sight through the hex.':''}${t.road?' Road-to-road bonuses can reduce that cost.':''}`));
  const unit=game.units.find(u=>u.id===chosen&&u.side===game.side),move=game.legal[chosen]?.moves.find(m=>same(m.pos,pos));
  if(move&&myTurn())panel.append(button(`Move ${game.unit_types[unit.kind].name} here · ${move.cost} AP`,()=>{const destination=pos.slice();closeMobileSheets();inspectMode=false;order({kind:'move',unit:unit.id,pos:destination});},false,'emp-primary'));
  else panel.append(el('p',movementReason(unit,pos,t,current),'emp-unavailable'));
  if(current){
   const units=game.units.filter(u=>same(u.pos,pos));
   if(units.length){panel.append(el('h3','Units here'));for(const u of units)panel.append(button(`${u.side===game.side?'Select':'Inspect'} ${game.unit_types[u.kind].name}`,()=>{closeMobileSheets();select(u.id);if(u.side===game.side)openPanel('orders');}));}
   if(unit?.kind==='builder'&&same(unit.pos,pos)){
    panel.append(el('h3','Builder orders on this hex'));
    for(const kind of ['farm','mine','road']){panel.append(unitAction(unit,kind));const reason=actionReason(unit,kind);panel.append(el('p',reason||actionHelp[kind][0],reason?'emp-unavailable':''));}
   }else panel.append(el('p',t.terrain==='grass'?'Builders standing on eligible grass can build a Farm. It costs 2 AP and one charge.':t.terrain==='hill'?'Builders standing on eligible hills can build a Mine. It costs 2 AP and one charge.':'Builders can make roads on eligible grass, woods or hills. Improvements need nearby friendly cities and cannot be made in city centers or rival territory.'));
  }
  const legend=el('details',undefined,'emp-map-symbols');legend.append(el('summary','Map symbol key'));
  for(const [kind,text]of [['food','Food: grows cities'],['production','Production: builds projects'],['gold','Gold: upkeep and rushing'],['worker','Citizen: your city works this hex now'],['grain','Grain resource: +1 food'],['iron','Iron resource: +1 production'],['ruins','Ruins: one-time exploration reward'],['farm','Farm improvement'],['mine','Mine improvement']]){const row=el('p');row.append(learning.icon(kind),document.createTextNode(text));legend.append(row);}panel.append(legend);
 }
 function openLearning(resume=false){
  if(resume)learning.resume();learning.welcome();closeMobileSheets();byId('empManual').close();renderLearning();byId('empLearnSheet').showModal();byId('empLearnOpen').setAttribute('aria-expanded','true');
 }
 function lessonAction(lesson){
  if(working)return;
  if(lesson.id==='goal'&&game)learning.mark(game,'goal');
  if(lesson.review&&game)learning.mark(game,lesson.id,`You reviewed your ${lesson.id==='city'?'city project':'active research'}. It advances at End turn.`);
  closeMobileSheets();
  if(lesson.action==='setup'){byId('empSetup').scrollIntoView({block:'start'});byId('empFaction').focus();}
  if(lesson.action==='inspect'){inspectMode=true;mapLens='yields';renderMap();renderMobile();}
  if(['unit','builder','city'].includes(lesson.action)&&lesson.entity){select(lesson.entity);focusSelection();if(lesson.action!=='unit')openPanel('orders');}
  if(lesson.action==='research')openPanel('research');
  if(lesson.action==='end')byId('empEnd').click();
  if(lesson.action==='chronicle'){if(mobile)openSheet('empMenu');byId('empChronicle').open=true;byId('empChronicle').scrollIntoView({block:'nearest'});}
  renderLearning();
 }
 function renderLearning(){
  const guided=experience()==='simple'&&!learning.ignored,lesson=learning.lesson(game);
  const homeGuide=byId('empHomeLearning');homeGuide.hidden=!guided&&experience()!=='moderate';byId('empLearnOpen').hidden=!guided;
  homeGuide.querySelector('h2').textContent=depth('Simple · Your first turns','Moderate · Plan your civilization','Expert · Rules reference');
  homeGuide.querySelector('p').textContent=depth('Start with one city and one useful move. The guide explains your goal, what to do next, and when the result happens.','Compare city output, project timing, research benefits and movement costs. The planning guide helps you connect those choices across turns.','Review exact formulas, unit values and turn timing in the full rulebook.');
  homeGuide.querySelector('.emp-small').textContent=depth('Simple includes guided lessons by default. Ignore tutorial keeps Simple selected.','Useful numbers and tradeoffs beside your decisions. All actions and the full rulebook stay available.','The full reference is available from How to play.');
  byId('empHomeLearn').textContent=depth('Teach me how to play','Open the planning guide','Open full rules');
  byId('empLearningMenu').textContent=learning.ignored?'Resume tutorial':'Guided tutorial';
  byId('empLearnLabel').textContent=lesson.complete?'Next decision':`Learn${game?' · '+learning.done(game).length+'/'+learning.steps.length:''}`;
  byId('empLearnNext').textContent=lesson.title;
  const panel=byId('empLesson');panel.replaceChildren(experienceMarker(depth('One decision at a time','Costs, tradeoffs and results','Rules and interactions')),el('p',game&&!lesson.complete?`Guided first turns · ${learning.done(game).length} of ${learning.steps.length} lessons reviewed or practiced`:'A guide to Empires','emp-kicker'),el('h3',lesson.title));
  if(game&&learning.feedback(game))panel.append(el('p',learning.feedback(game),'emp-lesson-feedback'));
  const planning={
   goal:'Choose a development plan before committing to war. Cities, population, discoveries and ruins contribute to the final score; capturing the rival capital can end the campaign earlier.',
   land:'Compare potential yield with land your cities actually work. An improvement on worked land affects the next turn’s income; unused land is a future opportunity.',
   explore:'Compare the AP cost of each legal step. Scouts pay 1 AP for woods and 2 for hills. Keep the next move in mind; only 1 unused AP can carry over.',
   city:'Compare the project’s benefit with its completion time. Turn-end production keeps gold available for upkeep. Rushing spends gold and completes the project immediately when placement is possible.',
   improve:'Each improvement uses 2 AP and one building charge. Farms and mines improve income when worked; roads improve movement. Check the hex before spending a charge.',
   research:'Compare benefits and estimated turns. Switching preserves stored knowledge and uses no unit AP; progress happens at your turn end.',
   turn:'Check the projects and research you expect to advance, then review the actual result. Unused AP carries over only up to 1 per unit; your rival acts between your turns.'
  };
  const shown=experience()==='simple'?lesson.facts.slice(0,2):experience()==='moderate'&&planning[lesson.id]?lesson.facts.slice(0,1):lesson.facts;
  for(const fact of shown)panel.append(el('p',fact));
  if(experience()==='moderate'&&planning[lesson.id])panel.append(el('p',planning[lesson.id],'emp-lesson-planning'));
  if(shown.length<lesson.facts.length)panel.append(ruleDetail('lesson-'+lesson.id,'More about this decision',lesson.facts.slice(shown.length).join(' ')));
  if(game&&(!game.ready||game.turn!==game.side)&&!game.winner)panel.append(el('p','You can inspect and learn now. Orders wait until your turn and your opponent has joined.','emp-warning'));
  panel.append(button(lesson.label,()=>lessonAction(lesson),working||lesson.action==='end'&&!myTurn(),'emp-primary'));
  if(game&&lesson.id&&learning.steps.includes(lesson.id)&&lesson.id!=='goal')panel.append(button('I’ve read this · next lesson',()=>{learning.mark(game,lesson.id,`Reviewed: ${lesson.title}. You can practice this later.`);renderLearning();},false,'emp-lesson-review'));
  if(game){const checklist=el('details');checklist.append(el('summary','Your learning path'));const list=el('ol'),titles=['Your civilization and goal','Read the land','Explore with a scout','City production','Improve land','Civilization research','End turn and see results'];for(const [i,id]of learning.steps.entries())list.append(el('li',`${learning.done(game).includes(id)?'✓ ':''}${titles[i]}`));checklist.append(list);panel.append(checklist);}
  byId('empRestartTutorial').hidden=!game;
  if(!guided&&byId('empLearnSheet').open&&learning.ignored)byId('empLearnSheet').close();
  if(active&&game&&guided&&!learning.welcomed&&!welcomeScheduled){
   welcomeScheduled=true;requestAnimationFrame(()=>{welcomeScheduled=false;if(active&&game&&experience()==='simple'&&!learning.ignored&&!learning.welcomed)openLearning();});
  }
 }
 byId('empInspectToggle').onclick=()=>{inspectMode=!inspectMode;renderMap();renderMobile();};
 byId('empMapView').onclick=()=>{mapLens=landLens()==='yields'?'land':'yields';try{localStorage.setItem('empires-map-lens',mapLens);}catch{}renderMap();syncMapTools();};
 byId('empLearnOpen').onclick=()=>openLearning();byId('empHomeLearn').onclick=()=>{if(experience()==='simple')openLearning();else{closeMobileSheets();byId('empManual').showModal();}};
 byId('empLearningMenu').onclick=()=>openLearning(true);byId('empManualTutorial').onclick=()=>openLearning(true);
 byId('empIgnoreTutorial').onclick=()=>{learning.ignore();byId('empLearnSheet').close();renderLearning();};
 byId('empRestartTutorial').onclick=()=>{learning.restart(game);renderLearning();};
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
  const positions=['empMapWrap','empOrdersSheet','empRosterSheet','empMenu','empManual','empRoster','empHexSheet','empLearnSheet'].map(id=>[byId(id),byId(id).scrollLeft,byId(id).scrollTop]);
  renderGuide();if(game&&active)render();renderLearning();
  for(const [n,left,top] of positions){n.scrollLeft=left;n.scrollTop=top;}
 }
 document.addEventListener('ww2:experience',syncExperience);
 function syncArt(){
  byId('empArtToggle').textContent=`Units: ${art.style} · switch to ${art.style==='detailed'?'basic':'detailed'}`;
  byId('empArtToggle').setAttribute('aria-pressed',String(art.style==='detailed'));
  byId('empArtToggle').title='Shared with Squad Leader. Artwork only; Experience and game rules stay the same.';
  if(!active)return; // Do not load the Empires atlas for a DSL-only visit.
  const guide=byId('empUnitGuideList');guide.replaceChildren();
  const descriptions={scout:'Cloak and lookout pose · explores quickly',spearman:'Spear and shield · holds ground and captures cities',archer:'Bow and quiver · ranged fire',builder:'Shovel · farms, mines and roads',settler:'Loaded cart · founds a new city',galley:'Sail and oars · naval movement and coastal fire'};
  for(const [kind,text]of Object.entries(descriptions)){
   const row=el('div',undefined,'emp-unit-guide-item'),copy=el('div');copy.append(el('strong',art.names[kind]),el('p',text));row.append(art.portrait({kind,side:'river'}),copy);guide.append(row);
  }
  const positions=['empMapWrap','empOrdersSheet','empRosterSheet','empMenu','empManual','empRoster'].map(id=>[byId(id),byId(id).scrollLeft,byId(id).scrollTop]);
  if(game&&active)render();
  for(const [n,left,top]of positions){n.scrollLeft=left;n.scrollTop=top;}
 }
 byId('empArtToggle').onclick=()=>window.ww2UnitStyle.set(art.style==='detailed'?'basic':'detailed');
 document.addEventListener('ww2:unit-style',syncArt);syncArt();
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
