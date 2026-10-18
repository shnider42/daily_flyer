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
 let game=null,seat=null,saves=[],chosen=null,target=null,inspected=null,tab='orders',working=false,polling=false,active=false,detail=innerWidth<700,confirmAction=null,requestGeneration=0;
 let rememberedMode='dsl',noticeTimer;
 try{saves=JSON.parse(localStorage.getItem('empires-sessions')||'[]');if(!Array.isArray(saves))saves=[];saves=saves.filter(s=>s&&typeof s.code==='string');rememberedMode=localStorage.getItem('dfe-game-mode')||'dsl';}catch{}
 function auth(){try{return JSON.parse(localStorage.getItem('ww2-commander')||'null');}catch{return null;}}
 function notice(text,persist=false){clearTimeout(noticeTimer);byId('empMessage').textContent=text;if(!persist)noticeTimer=setTimeout(()=>byId('empMessage').textContent='',8000);}
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
 function confirm(title,text,action){confirmAction=action;byId('empConfirmTitle').textContent=title;byId('empConfirmText').textContent=text;byId('empConfirm').showModal();}
 byId('empConfirmCancel').onclick=()=>byId('empConfirm').close();
 byId('empConfirmYes').onclick=()=>{const action=confirmAction;confirmAction=null;byId('empConfirm').close();action?.();};
 byId('empManualOpen').onclick=()=>byId('empManual').showModal();byId('empManualClose').onclick=()=>byId('empManual').close();
 function mode(value){
  if(working)return;
  if(value==='empires'&&!byId('game').hidden)return;
  active=value==='empires';root.hidden=!active;document.body.classList.toggle('empires-active',active);
  byId('modeDSL').setAttribute('aria-pressed',String(!active));byId('modeEmpires').setAttribute('aria-pressed',String(active));
  document.title=active?'Empires · The Riverlands':'DSL · Tactical Command';
  const brand=document.querySelector('header .brand');brand.firstChild.textContent=active?'EMPIRES ':'DSL ';brand.querySelector('span').textContent=active?'THE RIVERLANDS':'TACTICAL COMMAND';
  try{localStorage.setItem('dfe-game-mode',value);}catch{}
  if(active)loadCampaigns();else window.ww2Motion?.clear(svg);
  syncSwitch();
 }
 function syncSwitch(){byId('gameModeSwitch').hidden=active?!byId('empPlay').hidden:!byId('game').hidden;}
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
  byId('empTurn').textContent=command.kind==='end'?'Resolving the turn…':'Order sent…';renderPanel();byId('empEnd').disabled=true;
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
  if(idle)confirm('End your turn?',`${idle} unit${idle===1?' has':'s have'} more than 1 AP left. Each can bank at most 1 AP. City production, growth and research will resolve.`,()=>order({kind:'end'}));
  else order({kind:'end'});
 };
 byId('empConcede').onclick=()=>confirm('Concede this campaign?','The other civilization wins. Your completed chronicle stays saved.',()=>order({kind:'resign'}));
 byId('empLink').onclick=async()=>{
  if(!auth()){byId('commanderSignIn').click();notice('After signing in, choose Link to commander again.');return;}
  try{await request(`/api/empires/games/${game.code}/link`,{});saveSeat({...seat,commander:auth().name});notice('Campaign linked. Sign in as this commander to resume on another device.');}catch(e){notice(e.message);}
 };
 byId('empCopyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(game.code);notice('Campaign code copied.');}catch{byId('empInviteCode').select();notice('Select and copy the campaign code.');}};
 for(const b of root.querySelectorAll('[data-emp-tab]'))b.onclick=()=>{tab=b.dataset.empTab;renderPanel();};
 function select(id){
  const u=game.units.find(u=>u.id===id),c=game.cities.find(c=>c.id===id);
  if(u?.side!==game.side&&!c?.side){target=id;}else if((u||c)?.side!==game.side){target=id;}else{chosen=id;target=null;}
  inspected=(u||c)?.pos||null;tab='orders';renderMap();renderPanel();renderRoster();
 }
 function chooseHex(pos){
  if(working)return;
  const move=game.legal[chosen]?.moves.find(m=>same(m.pos,pos));
  if(move&&myTurn()){order({kind:'move',unit:chosen,pos});return;}
  const c=game.cities.find(c=>same(c.pos,pos)),units=game.units.filter(u=>same(u.pos,pos));
  if(units.length){const own=units.find(u=>u.side===game.side);select((own||units[0]).id);return;}
  if(c){select(c.id);return;}
  inspected=pos;target=null;tab='orders';renderMap();renderPanel();
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
  for(const u of game.units.filter(u=>u.side===game.side)){
   const b=button(`${symbols[u.kind]} ${game.unit_types[u.kind].name}`,()=>{select(u.id);focusSelection();});b.setAttribute('aria-pressed',String(chosen===u.id));b.append(el('small',`${u.hp} HP · ${u.ap} AP${u.shaken?' · shaken':''}`));roster.append(b);
  }
 }
 function renderPanel(){
  if(!game)return;const panel=byId('empPanel');panel.replaceChildren();for(const b of root.querySelectorAll('[data-emp-tab]'))b.setAttribute('aria-pressed',String(b.dataset.empTab===tab));
  if(tab==='research'){
   panel.append(el('h3','A new understanding'),el('p',`${game.player.knowledge} knowledge stored · +${game.economy.knowledge} each turn. Knowledge carries over when you change research.`));
   for(const [k,t] of Object.entries(game.technologies)){
    const done=game.player.techs.includes(k),available=t.requires.every(r=>game.player.techs.includes(r)),selected=game.player.research===k;
    const b=button(`${done?'✓ ':selected?'→ ':''}${t.name} · ${t.cost}`,()=>order({kind:'research',tech:k}),!myTurn()||done||!available,'emp-tech');b.setAttribute('aria-pressed',String(selected));b.append(el('small',t.benefit+(available?'':` · Requires ${t.requires.map(r=>game.technologies[r].name).join(', ')}`)));panel.append(b);
   }return;
  }
  if(tab==='diplomacy'){
   const d=game.diplomacy;panel.append(el('h3',d.met?game.factions[game.side==='river'?'highland':'river'].name:'Beyond the horizon'));
   if(!d.met){panel.append(el('p','Send a scout across the valley. Diplomacy becomes available when your civilizations meet.'));return;}
   panel.append(el('p',d.war?'At war. Military units may attack visible enemies.':d.trade?'At peace, with open trade. Both civilizations earn +3 gold each turn.':'At peace. Explore and develop, or negotiate a trade agreement.'));
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
    if(attack){panel.append(el('p',`${unit?game.unit_types[unit.kind].name:''}: hit on ${attack.threshold}+ (${Math.round((7-attack.threshold)/6*100)}%). A hit deals ${attack.damage} damage. Cost: 2 AP.`));panel.append(button('Confirm attack · 2 AP',()=>order({kind:'attack',unit:chosen,target}),!myTurn(),'emp-primary'));}
    else panel.append(el('p',!game.diplomacy.war?'You are at peace. Use Diplomacy to change relations.':'Select your military unit first. A legal attack needs AP, range and a clear line of sight.'));
    panel.append(button('Back to selection',()=>{target=null;renderPanel();}));return;
   }target=null;
  }
  if(city?.side===game.side){
   panel.append(el('h3',city.name+(city.capital?' ★':'')),el('p',`Population ${city.population} · ${city.hp} city strength · ${coord(city.pos)}`));
   const stats=el('div',undefined,'emp-stats');for(const [k,v] of Object.entries(city.yields))if(k!=='worked')stats.append(el('span',`${k} +${v}`));panel.append(stats);
   panel.append(el('p',`Growth: ${city.food} / ${6+city.population*4} food. Working ${city.yields.worked.map(coord).join(', ')||'the city center'}.`));
   const label=el('label','Production project');label.htmlFor='empProject';const selectEl=el('select');selectEl.id='empProject';selectEl.append(new Option('Choose a project…',''));
   for(const [k,p] of Object.entries(city.projects))selectEl.append(new Option(`${p.name} · ${p.cost} production`,k));selectEl.value=city.project||'';selectEl.disabled=!myTurn();selectEl.onchange=()=>{if(selectEl.value)order({kind:'produce',city:city.id,project:selectEl.value});};panel.append(label,selectEl);
   if(city.project){const p=city.projects[city.project];if(p){const missing=Math.max(0,p.cost-city.production),cost=missing*3;panel.append(el('p',`${city.production} / ${p.cost} production · ${missing?Math.ceil(missing/Math.max(1,city.yields.production))+' turns at current output':'ready; waiting for a free hex'}. ${p.benefit||p.role||''}`));panel.append(button(`Rush project · ${cost} gold`,()=>order({kind:'rush',city:city.id}),!myTurn()||!cost||game.player.gold<cost));}}
   else panel.append(el('p',`${city.production} production stored. Choose your next project.`));
   if(city.buildings.length)panel.append(el('p','Built: '+city.buildings.map(k=>k[0].toUpperCase()+k.slice(1)).join(', ')));
   panel.append(el('p','Tap another city on the map to manage it.'));return;
  }
  if(unit?.side===game.side){
   const stats=game.unit_types[unit.kind],legal=game.legal[unit.id];panel.append(el('h3',stats.name),el('div',`${unit.hp}/${stats.hp} strength · ${unit.ap} AP · ${coord(unit.pos)}`,'emp-stats'),el('p',stats.role));
   panel.append(el('p',unit.shaken?'Shaken: rally before moving or attacking.':unit.road_bonus?'Your next adjacent road hex is free. Another action forfeits it.':'Tap a highlighted neighboring hex to move. Labels show the AP cost.'));
   if(unit.charges!==undefined)panel.append(el('p',`${unit.charges} building charges remaining. Improvements need a friendly city within two hexes.`));
   const options=unit.kind==='settler'?['found']:unit.kind==='builder'?['farm','mine','road']:['fortify'];
   if(unit.shaken)options.unshift('rally');if(unit.hp<stats.hp)options.push('rest');
   const actions=el('div',undefined,'emp-actions');for(const k of options)actions.append(button(labels[k],()=>order({kind:k,unit:unit.id}),!myTurn()||!legal?.actions.includes(k)));panel.append(actions);
   if(unit.kind==='settler')panel.append(el('p','Cities must be at least 4 hexes apart. Founding consumes the settlers. Maximum: 4 cities.'));
   if(stats.reach)panel.append(el('p',`Attack range ${stats.reach} · cost 2 AP. Tap a visible enemy to inspect the shot before confirming.`));
  }else panel.append(el('h3','Your next decision'),el('p','Select a city to build, or a unit to explore. The Research and Diplomacy tabs shape your civilization beyond the battlefield.'));
  if(inspected){const t=game.map[inspected[1]]?.[inspected[0]];panel.append(el('p',`${coord(inspected)} · ${t?.terrain||'Unexplored'}${t?.resource?' · '+t.resource:''}${t?.improvement?' · '+t.improvement:''}${t?.road?' · road':''}`));}
 }
 function render(){
  if(!game)return;byId('empNation').textContent=game.factions[game.side].name;
  const resource=byId('empResources');resource.replaceChildren();
  const currentTech=game.player.research?game.technologies[game.player.research].name:'Choose research';
  for(const [label,value,extra] of [['Gold',game.player.gold,`${game.economy.gold>=0?'+':''}${game.economy.gold}/turn`],['Knowledge',game.player.knowledge,`+${game.economy.knowledge}/turn`],['Development',game.score,'4/city + population + 3/tech + ruins'],['Round',`${game.round} / ${game.last_round}`,currentTech]]){
   const block=el('div');block.append(el('small',label),el('strong',String(value)),el('span',extra));resource.append(block);
  }
  const turn=game.winner?'Campaign complete.':!game.ready?'Waiting for your invited opponent.':game.turn===game.side?'Your turn. Cities and research resolve when you finish.':`${game.factions[game.turn].name} is taking its turn.`;
  byId('empTurn').textContent=turn+(game.economy.shortage?` Upkeep shortfall: ${game.economy.shortage} production will be used.`:'');
  byId('empInvitation').hidden=game.ready;byId('empInviteCode').value=game.code;
  byId('empResult').hidden=!game.winner;byId('empResult').textContent=game.winner?`${game.winner==='draw'?'A shared legacy':game.winner===game.side?'Victory':'Defeat'} · ${game.result} ${game.scores?Object.entries(game.scores).map(([k,v])=>`${game.factions[k].name}: ${v}`).join(' · '):''}`:'';
  byId('empEnd').disabled=!myTurn();byId('empConcede').disabled=!myTurn();byId('empLink').disabled=working;
  byId('empLatest').textContent=game.journal.at(-1)?.text||'';byId('empJournal').replaceChildren(...game.journal.slice().reverse().map(v=>el('li',`R${v.round} · ${v.text}`)));
  renderMap();renderRoster();renderPanel();byId('empZoom').textContent=detail?'Fit map':'Detail ＋';byId('empZoom').setAttribute('aria-pressed',String(detail));
 }
 function focusSelection(){
  if(!game)return;const item=game.units.find(u=>u.id===chosen)||game.cities.find(c=>c.id===chosen)||game.cities.find(c=>c.side===game.side);if(!item)return;
  const wrap=byId('empMapWrap'),[x,y]=hexCenter(...item.pos),scale=svg.getBoundingClientRect().width/861;
  wrap.scrollTo({left:Math.max(0,x*scale-wrap.clientWidth/2),top:Math.max(0,y*scale-wrap.clientHeight/2),behavior:'instant'});
 }
 byId('empFind').onclick=focusSelection;
 byId('empZoom').onclick=()=>{detail=!detail;window.ww2Motion?.clear(svg);byId('empMapWrap').classList.toggle('emp-detail',detail);byId('empZoom').textContent=detail?'Fit map':'Detail ＋';byId('empZoom').setAttribute('aria-pressed',String(detail));focusSelection();};
 // A small illustrated atlas is generated from the same offset grid, not a screenshot.
 const atlas=byId('empAtlas');
 for(let y=0;y<7;y++)for(let x=0;x<9;x++){
  const cx=25+x*48+(y%2)*24,cy=25+y*43,water=x===4||y===6,forest=!water&&(x+y*3)%5===0;
  atlas.append(se('polygon',{points:[[0,-27],[23,-13],[23,13],[0,27],[-23,13],[-23,-13]].map(([a,b])=>`${cx+a},${cy+b}`).join(' '),fill:water?'#5a8a91':forest?'#718f68':'#adb88a',stroke:'#3b5a47','stroke-width':.8}));
  if(forest)atlas.append(se('path',{d:`M${cx} ${cy-13}l-9 19h18Z`,fill:'#3c6244'}));
 }
 for(const [x,y,name] of [[115,155,'HEARTHFORD'],[340,135,'STONEWATCH']])atlas.append(se('rect',{x:x-9,y:y-12,width:18,height:21,fill:'#e7d3a8',stroke:'#384c3a','stroke-width':2}),se('text',{x,y:y+29,'text-anchor':'middle',fill:'#21392c','font-size':10,'font-family':'system-ui','font-weight':700},name));
 identity();mode(new URLSearchParams(location.search).get('join')?'dsl':rememberedMode);
 window.empiresUI={get state(){return game;},get selection(){return chosen;},open,mode,order,refresh};
})();
