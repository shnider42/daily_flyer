'use strict';
function hexColumn(x){let value='';for(;x>=0;x=Math.floor(x/26)-1)value=String.fromCharCode(65+x%26)+value;return value;}
const $ = id => document.getElementById(id);
let session = null, state = null, selected = null, target = null, busy = false, polling = false, toastTimer, smokeMode = false, lobbyMode = true, renderedBattle = null, scenarios = [];
let barrageMode = false, platoonFilter = 'all', savedSessions = [], combatMode = null;
try {
 session = JSON.parse(localStorage.getItem('ww2-session'));
 const saved = JSON.parse(localStorage.getItem('ww2-sessions')||'[]');
 savedSessions = Array.isArray(saved)?saved.filter(s=>s&&typeof s.code==='string'&&typeof s.token==='string'):[];
 if(session&&typeof session.code==='string'&&typeof session.token==='string'){
  if(!savedSessions.some(s=>s.code===session.code))savedSessions.unshift(session);
 }else session=null;
} catch (_) {}
const names = {us:'Americans',de:'Germans'}, kinds={squad:'Rifle squad',leader:'Lieutenant',mg:'Machine gun',commander:'Commander',scout:'Scout team',engineer:'Engineers',at_team:'Anti-tank team',tank:'Tank',at_gun:'Anti-tank gun',amphibious:'Amphibious section',paratrooper:'Paratroopers'};
const unitCodes={squad:'SQ',leader:'LT',mg:'MG',commander:'CO',scout:'SC',engineer:'EN',at_team:'AT',tank:'TK',at_gun:'AG',amphibious:'AM',paratrooper:'PA'};
kinds.halftrack='Half-track section';unitCodes.halftrack='HT';
kinds.scout='Recon team';
kinds.sniper='Sniper team';unitCodes.sniper='SN';
Object.assign(kinds,{carrier:'Aircraft carrier',battleship:'Battleship',cruiser:'Cruiser',destroyer:'Destroyer'});
Object.assign(unitCodes,{carrier:'CV',battleship:'BB',cruiser:'CA',destroyer:'DD'});
Object.assign(kinds,{fighter:'Fighter',bomber:'Bomber',aa_gun:'Anti-aircraft gun',radar:'Radar station',airfield:'Airfield',landing_craft:'Landing craft'});
Object.assign(unitCodes,{fighter:'FTR',bomber:'BMR',aa_gun:'AA',radar:'RAD',airfield:'AF',landing_craft:'LC'});
function sideLabel(side){return state?.factions?.[side]||names[side];}
function strengthLabel(u){return state?.naval_version?`${u.hp}/${u.max_hp} · ${u.ap}`:'●'.repeat(u.hp)+' · '+u.ap;}
function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('message').hidden=true,6500);}
async function api(path, body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw new Error((data.error||'The server could not complete that action.')+(data.request_id?` Reference: ${data.request_id}`:''));return data;
}
function persistSessions(){
 try{localStorage.setItem('ww2-session',JSON.stringify(session));localStorage.setItem('ww2-sessions',JSON.stringify(savedSessions));}
 catch(_){notify(session?.commander?'Browser storage is unavailable. Sign in as your commander to return to multiplayer games.':'Browser storage is unavailable. Link multiplayer to a commander, or keep a SAVE / MOVE code before leaving.');}
}
function remember(data){
 session=data;savedSessions=[data,...savedSessions.filter(s=>s.code!==data.code)];persistSessions();
 selected=null;target=null;state=null;smokeMode=false;barrageMode=false;platoonFilter='all';renderedBattle=null;lobbyMode=false;
 history.replaceState(null,'','/');renderSessions();
}
function renderSessions(){
 const shortcuts=savedSessions.filter(s=>!s.commander||s.commander!==window.ww2Commander?.name);
 $('savedSessions').hidden=!shortcuts.length;
 $('sessionList').replaceChildren(...shortcuts.map(saved=>{
  const button=document.createElement('button');button.className='saved-session';
  const row=document.createElement('div');row.className='session-row';
  const title=document.createElement('strong');title.textContent=saved.label||'Saved battle';
  const meta=document.createElement('span');meta.textContent=`Resume · ${saved.code} · last viewed status`;
  button.append(title,meta);
  button.onclick=()=>run(async()=>{const next=await apiWithSession(saved);remember(saved);state=next;render();});
  const forget=document.createElement('button');forget.className='quiet';forget.textContent='Forget';forget.setAttribute('aria-label',`Forget saved battle ${saved.code} on this browser`);
  forget.onclick=()=>{if(confirm('Remove this shortcut from this browser? The battle is not deleted. Keep a MOVE or SAVE code if you want to return.')){savedSessions=savedSessions.filter(s=>s.code!==saved.code);if(session?.code===saved.code){session=null;state=null;}persistSessions();renderSessions();}};
  row.append(button,forget);return row;
 }));
}
async function apiWithSession(saved){
 const response=await fetch(`/api/match/${saved.code}`,{headers:{Authorization:`Bearer ${saved.token}`}});
 const data=await response.json();if(!response.ok)throw new Error((data.error||'Battle unavailable.')+(data.request_id?` Reference: ${data.request_id}`:''));return data;
}
function invitation(){return `${location.origin}/?join=${session.code}`;}
async function refresh(){
 if(!session||busy||polling||lobbyMode||playbackSession)return;polling=true;const requestedCode=session.code;
 try{const since=state?.code===requestedCode?`?since=${state.revision}`:'';const next=await api(`/api/match/${requestedCode}${since}`);if(session?.code!==requestedCode)return;$('connection').textContent='● Connected';if(!next.unchanged&&(!state||next.revision>state.revision||next.code!==state.code)){const oldKey=playbackKey(state),hadState=!!state;state=next;render();if(hadState&&playbackKey(state)&&oldKey!==playbackKey(state))startPlayback();}}
 catch(e){$('connection').textContent='○ Reconnecting';if(!state)notify(e.message);}finally{polling=false;}
}
async function run(task){if(busy||playbackSession)return;const oldPlayback=playbackKey(state),oldCode=session?.code,oldState=state;busy=true;document.dispatchEvent(new Event('ww2:busy'));document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){notify(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(state)render();if(!state||state===oldState)await refresh();if(session?.code===oldCode&&playbackKey(state)&&oldPlayback!==playbackKey(state))startPlayback();}}
async function act(body){await run(async()=>{state=await api(`/api/match/${session.code}`,{...body,revision:state.revision});target=null;smokeMode=false;barrageMode=false;});}
function element(tag,attrs={},text){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e;}
function center(x,y){return [27+x*52+(y%2)*26,30+y*49];}
function unitTypeName(u){if(u.display_name)return u.display_name;return state?.naval_version&&u.kind==='amphibious'?'Landing section':kinds[u.kind];}
function unitName(u){return unitTypeName(u)+(u.platoon?` ${u.platoon}${u.number}`:'');}
function unitRoleSummary(u){
 if(window.airborneRole?.(u))return window.airborneRole(u);
 if(window.signalRole?.(u))return window.signalRole(u);
 if(u.carrier_id)return 'Aboard transport · select it to unload';
 if(state?.tactics_version&&['scout','sniper'].includes(u.kind)){
  const g=state.legal?.[u.id]?.range_guide;
  return g?`Sight ${g.sight_range} · ${u.kind==='sniper'?'Snipe '+g.snipe_range+' / 3 AP':'Rifle '+g.fire_range}${g.tower?' · tower exposes occupants':''}${u.exposed_turns?' · position exposed':''}`:u.kind==='sniper'?'Precision infantry fire · bank actions for a 3 AP aimed shot':'Observe farther than you can shoot';
 }
 if(state?.tactics_version&&u.kind==='engineer')return `Smoke, grenades & tank repairs · ${u.repair_kits||0} repair kits`;
 if(state?.combat_version&&u.kind==='commander')return 'Command radius 4 · long-range artillery · recon planes';
 if(state?.combat_version&&u.kind==='tank')return `${u.immobilized?'IMMOBILIZED · gun operational · ':''}${u.ammo==='he'?'High explosive loaded · infantry blast':'Armor piercing loaded · hunt armor'}`;
 if(state?.combat_version&&u.kind==='battleship')return 'Heavy guns · bombard unseen hexes beyond sight';
 if(u.kind==='landing_craft')return 'Carry one infantry unit to shore · water movement only';
 if(state?.air_version)return {fighter:'Intercept aircraft · 3 hexes per flight action',bomber:'Bomb ground sites · 2 hexes per flight action · 2 bomb loads',aa_gun:'Anti-aircraft overwatch · range 5 · fixed position',radar:'Spot aircraft within 10 hexes · no ground spotting or attacks',airfield:'Rearm and repair aircraft in adjacent hexes'}[u.kind];
 if(u.kind==='halftrack'){const troop=state.units.find(t=>t.hp>0&&t.carrier_id===u.id);return troop?`Carrying ${unitName(troop)} · roads: 2 hexes/AP`:'Transport 1 infantry unit · roads: 2 hexes/AP';}
 const roles={squad:'Capture and hold ground with rifle infantry',leader:state?.ruleset==='dsl'?'Rally platoon members and grant extra actions':'Rally troops and call mortar support',mg:'Suppress enemy infantry with sustained fire',commander:'Rally and support nearby troops',scout:'Spot concealed enemies ahead of your squads',engineer:'Use smoke and grenades to clear cover',at_team:'Hunt armored vehicles with anti-tank weapons',tank:'Armored direct fire against troops and vehicles',at_gun:'Long-range anti-tank fire; cannot move',halftrack:'Mobile armored support; suppress infantry',amphibious:state?.naval_version?'Cross water and land troops at island outposts':'Move your troops across water and open land',paratrooper:u.reserve?'Airborne reserve; choose a landing zone':'Airborne infantry; capture and hold ground',carrier:'Scout with aircraft and launch air strikes',battleship:'Armored warship with heavy long-range guns',cruiser:'Escort ships with guns and aircraft defense',destroyer:'Fast warship with torpedoes and smoke'};
 return roles[u.kind]||'Select a highlighted move or available action';
}
function renderUnitClarity(unit){
 if($('unitPurpose'))$('unitPurpose').textContent=unit?unitRoleSummary(unit):'Select a unit to see its name and role';
 const troops=state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter));
 [...$('roster').children].forEach((button,i)=>{
  const u=troops[i];if(!u)return;
  const title=document.createElement('strong');title.className='roster-unit-name';title.textContent=unitTypeName(u);
  const meta=document.createElement('span');meta.className='roster-unit-state';
  meta.textContent=`${u.platoon?u.platoon+u.number:i+1} · ${u.hp<=0?'Lost':u.carrier_id?`Aboard · ${u.ap} AP`:u.reserve?'Airborne reserve':u.immobilized?`Tracks damaged · ${u.ap} AP`:u.pinned?`Pinned · ${u.ap} AP`:u.overwatch?`Watching · ${u.ap} AP`:`${u.ap} AP`}`;
  button.replaceChildren(title,meta);button.dataset.unitId=u.id;
  button.title=`${unitName(u)} — ${unitRoleSummary(u)}`;button.setAttribute('aria-label',`${unitName(u)}. ${meta.textContent}. ${unitRoleSummary(u)}`);
 });
}
function holdMobileMap(){
 if(matchMedia('(min-width:1100px)').matches||$('game').hidden)return ()=>{};
 const wrap=$('mapWrap'),rect=wrap.getBoundingClientRect(),left=wrap.scrollLeft,top=wrap.scrollTop;
 const visible=rect.bottom>0&&rect.top<innerHeight;
 return ()=>{wrap.scrollLeft=left;wrap.scrollTop=top;if(visible)window.scrollTo({top:window.scrollY+wrap.getBoundingClientRect().top-rect.top,left:window.scrollX,behavior:'instant'});};
}
function focusMapUnit(u,svg=$('map')){
 if(window.ww2Desktop?.active){window.ww2Desktop.focus(u,svg);return;}
 if(window.ww2Mobile?.active){window.ww2Mobile.focus(u);return;}
 if(!u||!$('mapWrap').classList.contains('enlarged'))return;
 const [x,y]=center(...u.pos),wrap=$('mapWrap'),scale=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
 wrap.scrollTo({left:x*scale-wrap.clientWidth/2,top:y*scale-wrap.clientHeight/2,behavior:'auto'});
}
function renderPlatoons(board){
 const nav=$('platoonFilters');nav.hidden=!board.platoons;nav.replaceChildren();if(!board.platoons)return;
 for(const p of [{id:'all',name:'All'},...board.platoons]){
  const button=document.createElement('button');button.dataset.platoon=p.id;const units=state.units.filter(u=>u.side===state.side&&(p.id==='all'||u.platoon===p.id));
  button.textContent=`${p.side_names?.[state.side]||p.name} · ${units.filter(u=>u.hp>0).length}`;button.setAttribute('aria-pressed',String(platoonFilter===p.id));
  button.onclick=()=>{if(busy||playbackSession)return;platoonFilter=p.id;target=null;smokeMode=false;barrageMode=false;selected=null;render();focusMapUnit(units.find(u=>u.hp>0&&u.ap>0)||units.find(u=>u.hp>0));};nav.append(button);
 }
}
function activate(e,callback){e.addEventListener('click',callback);e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();callback();}});}
function chooseUnit(u){if(busy||playbackSession)return;if(combatMode){window.pickCombatHex(u.pos);return;}if(barrageMode){placeBarrage(u.pos);return;}if(smokeMode){placeSmoke(u.pos);return;}const restore=holdMobileMap();if(u.side===state.side){selected=u.id;target=null;if(u.platoon&&platoonFilter!=='all')platoonFilter=u.platoon;}else{target=u.id;}render();document.dispatchEvent(new Event('ww2:selection'));restore();if(u.side===state.side&&window.ww2Desktop?.active)window.ww2Desktop.ensureVisible(u);}
function placeBarrage(pos){const effect=state.combat_version?'Infantry there takes 1 damage, pins and loses dug-in cover, including yours. Armor, vehicles and ships are unaffected.':'ALL units there will be pinned and lose dug-in cover, including yours. No strength damage.';if(state.legal[selected]?.barrage?.some(p=>p[0]===pos[0]&&p[1]===pos[1])&&confirm(`Call your army's only mortar barrage at ${hexColumn(pos[0])}${pos[1]+1}? The marked hex and its neighbors will be hit at the end of your opponent's turn. ${effect}`))act({kind:'barrage',unit:selected,pos});}
function placeSmoke(pos){if(state.legal[selected]?.smoke?.some(p=>p[0]===pos[0]&&p[1]===pos[1]))act({kind:'smoke',unit:selected,pos});}
function chance(threshold){return Math.max(0,Math.min(100,Math.round((7-threshold)/6*100)));}
function moveUnit(move){if(!move.threats||confirm(state.signals_version?'This hex crosses a spotted enemy firing lane. It does not reveal whether they are on overwatch; hidden threats remain possible. Move?':`${move.threats} enemy unit${move.threats===1?' is':'s are'} watching ${state.air_version?'this flight path':'this hex'}. Move and risk reaction fire?`))act({kind:'move',unit:selected,pos:move.pos});}
function scenarioPreview(){
 const board=scenarios.find(s=>s.id===$('scenarioSelect').value);if(!board)return;
 $('scenarioBrief').textContent=board.brief;
 const svg=$('scenarioPreview');svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${board.width*52+36} ${board.height*49+29}`);svg.setAttribute('aria-label',`${board.name}, ${board.width} by ${board.height} hex battlefield`);
 board.map.forEach((row,y)=>row.forEach((type,x)=>{const [cx,cy]=center(x,y);const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');svg.append(element('polygon',{points,class:`hex ${type}`}));if(type==='objective')svg.append(element('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'objective-icon'},'★'));}));
 document.dispatchEvent(new Event('ww2:preview'));
}
async function rematchRequest(body){await run(async()=>{state=await api(`/api/match/${session.code}/rematch`,{...body,revision:state.revision});render();});}
function render(){
 if(!state||lobbyMode)return;const restoreMap=holdMobileMap();$('lobby').hidden=true;$('game').hidden=false;
 Object.assign(names,state.factions||{us:'Americans',de:'Germans'});
 const myTurn=state.ready&&!state.winner&&state.turn===state.side&&!state.order_history?.redo_required;
 const board=state.scenario||{id:'village',name:'Village Crossing',objective_name:'Village square',rounds:8};
 const large=!!board.platoons;
 const dsl=state.ruleset==='dsl';
 $('rulesetBadge').hidden=!dsl;$('rulesetBadge').textContent='DSL v1 · Double Secret Probation Squad Leader';
 $('dslManual').hidden=!dsl;$('classicCommandManual').hidden=dsl;
 $('manualAP').textContent=dsl?'DSL: rifles/MGs get 2 AP, LTs get 3. Bank up to 1 AP (LT: 2). Total AP received per turn is capped at 3 (LT: 5). Woods/buildings cost 2 AP to enter. No stacking.':'2 actions per unit each turn. One adjacent hex costs 1; entering woods or buildings costs 2. No stacking.';
 $('manualOrders').textContent=dsl?'Tap your unit, then a highlighted hex to move or an enemy to preview an attack. Gold dashed road hexes cost 0 AP. End turn banks unused AP up to each unit’s limit.':'Tap your unit. Green hexes are legal moves. Tap an enemy in range to preview a shot, then confirm Fire. End turn when ready; unused actions are lost.';
 const battleKey=`${state.code}:${state.battle_number||1}`;
 const newBattle=renderedBattle!==battleKey;
 if(newBattle){platoonFilter=large?'A':'all';$('mapWrap').classList.toggle('enlarged',large);selected=null;target=null;smokeMode=false;barrageMode=false;renderedBattle=battleKey;$('mapWrap').scrollTo?.(0,0);}
 $('mapWrap').classList.toggle('large-map',large);$('zoom').textContent=large?($('mapWrap').classList.contains('enlarged')?'Overview':'Detail'):($('mapWrap').classList.contains('enlarged')?'Fit map −':'Enlarge map +');$('zoom').setAttribute('aria-pressed',String($('mapWrap').classList.contains('enlarged')));
 $('battleTitle').textContent=state.match_name||board.name;if(!window.ww2Briefing)document.title=`${state.match_name||board.name} · WWII Tactics`;
 $('battleNumber').textContent=`${state.ai_side?'SOLO · COMPUTER':board.name+' · TWO PLAYER'} · ${state.code} · BATTLE ${state.battle_number||1}`;
 $('homeBattles').hidden=false;
 $('objectiveName').textContent=`★ ${board.objective_name.toUpperCase()}`;
 $('round').textContent=`${state.round} / ${board.rounds}`;$('side').textContent=`You command the ${names[state.side]}`;
 $('game').dataset.side=state.side;document.body.dataset.battleSide=state.side;
 $('turnBanner').dataset.side=state.winner||state.turn;
 $('soloButton').hidden=!!state.ai_side;
 $('saveButton').hidden=!state.ai_side;
 const phase=state.winner?'Finished':!state.ready?'Waiting for opponent':state.turn===state.side?'Your turn':'Opponent’s turn';
 const label=`${state.match_name||state.scenario.name} · ${state.ai_side?'Solo':'Two player'} · ${names[state.side]} · Round ${state.round} · ${phase}`;
 if(session.label!==label){session.label=label;savedSessions=savedSessions.map(s=>s.code===session.code?session:s);persistSessions();}
 $('computerReview').hidden=!state.computer_orders?.length;
 $('computerOrders').replaceChildren(...(state.computer_orders||[]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('waiting').hidden=state.ready;$('invite').value=invitation();$('matchCode').textContent=`MATCH CODE · ${session.code}`;
 if(!window.ww2Briefing)$('turnBanner').textContent=state.winner?`${names[state.winner]} win. ${state.winner===state.side?'Mission accomplished.':'The battle is over.'}`:!state.ready?'Waiting for the German commander…':myTurn?'Your turn · select a unit':`${names[state.turn]} are giving orders…`;
 if(!window.ww2Briefing&&state.ai_side&&!state.winner)$('turnBanner').textContent=`Your turn · vs computer (${names[state.ai_side]})`;
 $('objective').textContent=`Hold: ${state.hold} / 2`;
 $('legacyNotice').hidden=(state.rules_version||1)>=4;
 $('missionHint').textContent=state.winner?`Battle complete in round ${state.round}.`:state.hold?`${names.us} hold the objective. ${names.de} must dislodge them before the next turn ends.`:state.side==='us'?`Capture ★ and hold through two of your turn endings. ${board.rounds-state.round+1} rounds left.`:`Keep the ${names.us} from holding ★ through round ${board.rounds}.`;
 $('armyCount').textContent=['us','de'].map(s=>`${names[s]} ${state.units.filter(u=>u.side===s&&u.hp>0).length}/${state.units.filter(u=>u.side===s).length}`).join(' · ');
 const unit=state.units.find(u=>u.id===selected&&u.hp>0);
 if(!unit)selected=null;
 const display=window.signalSnapshot?.(state)||state;
 if(target&&!display.units.some(u=>u.id===target))target=null;
 const legal=unit?state.legal[unit.id]:null, enemy=display.units.find(u=>u.id===target&&u.hp>0);
 const shot=enemy&&legal?.targets.find(t=>t.id===enemy.id);
 const assault=enemy&&legal?.assaults?.find(t=>t.id===enemy.id);
 const grenade=enemy&&legal?.grenades?.find(t=>t.id===enemy.id);
 const suppress=enemy&&legal?.suppress?.includes(enemy.id);
 if(!myTurn||!legal?.smoke?.length)smokeMode=false;
 if(!myTurn||!legal?.barrage?.length)barrageMode=false;
 if(combatMode&&(combatMode.unit!==selected||combatMode.revision!==state.revision||!myTurn||smokeMode||barrageMode||!legal?.[combatMode.kind]?.length))combatMode=null;
 const airliftPicking=!!window.airbornePicking?.(legal);
 const picking=airliftPicking||smokeMode||barrageMode||!!combatMode||!!window.operationsPicking?.(legal)||!!window.fieldworksPicking?.(legal)||!!window.signalsPicking?.(legal);
 $('supportStatus').hidden=(state.rules_version||1)<4;
 $('supportStatus').textContent=`Off-map mortar calls · ${names.us} ${state.support?.us||0} / ${names.de} ${state.support?.de||0}`;
 $('incoming').hidden=!state.barrages?.length;
 $('incoming').textContent=(state.barrages||[]).map(b=>`INCOMING at ${hexColumn(b.pos[0])}${b.pos[1]+1} + neighboring hexes. ${b.ttl===1?'Impact at the end of this turn':'Impact at the end of the next turn'}. Move clear—even friendly troops!`).join(' ');
 // Keep the geography across server revisions; only orders and counters change.
 const svg=$('map'),sameState=svg._state===state,sameUnits=sameState&&svg._unitView===display;
 svg._unitView=display;
 const mapKey=sameState?svg._mapKey:battleKey+JSON.stringify([state.map,state.buildings]);
 const reuse=svg._mapKey===mapKey;
 if(!reuse){svg.replaceChildren();svg._tiles=[];svg._counters=new Map();svg._mapKey=mapKey;}
 else svg.querySelectorAll('.aim-line,.landing-zone,.transport-choice,.recon-choice,.move-beacon,.range-guide,.support-choice,.engineering-choice,.signal-choice').forEach(n=>n.remove());
 if(!sameUnits){svg.querySelectorAll('.unit,.smoke-cloud,.barrage-zone,.incoming-mark,.station-mark').forEach(n=>n.remove());svg._counters=new Map();}
 svg._state=state;
 if(!reuse){svg.setAttribute('viewBox',`0 0 ${state.map[0].length*52+36} ${state.map.length*49+29}`);
 svg.setAttribute('aria-label',`${board.name} battlefield. Select your unit then a highlighted hex to move.`);}
 const width=state.map[0].length,activeHexes=new Set();
 if(myTurn&&legal){
  if(airliftPicking)for(let i=0;i<width*state.map.length;i++)activeHexes.add(i);
  if(!picking)for(const m of legal.moves)activeHexes.add(m.pos[1]*width+m.pos[0]);
  for(const pos of smokeMode?legal.smoke:barrageMode?legal.barrage:combatMode?legal[combatMode.kind]:[])activeHexes.add(pos[1]*width+pos[0]);
 }
 const changedHexes=reuse?new Set([...(svg._activeHexes||[]),...activeHexes]):Array.from({length:width*state.map.length},(_,i)=>i);
 svg._activeHexes=activeHexes;
 for(const index of changedHexes){
  const x=index%width,y=Math.floor(index/width);
  const [cx,cy]=center(x,y),type=state.map[y][x],move=myTurn&&legal?.moves.find(m=>m.pos[0]===x&&m.pos[1]===y);
  const points=reuse?null:Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
  const smokeHere=smokeMode&&legal.smoke.some(p=>p[0]===x&&p[1]===y);
  const barrageHere=barrageMode&&legal.barrage.some(p=>p[0]===x&&p[1]===y);
  const combatHere=combatMode&&legal[combatMode.kind].some(p=>p[0]===x&&p[1]===y);
  const tile=reuse?svg._tiles[y*state.map[0].length+x]:element('polygon',{points});
  const condition=buildingCondition(state,[x,y]);
  const tileClass=`hex ${type}${airliftPicking?' airdrop-aim':''}${condition?' building-'+condition:''}${move&&!picking?' move':''}${move?.threats&&!picking?' threatened':''}${move?.road_bonus&&!picking?' road-bonus':''}${smokeHere?' smoke-choice':''}${barrageHere?' barrage-choice':''}`;
  if(tile.getAttribute('class')!==tileClass)tile.setAttribute('class',tileClass);
  if(!reuse){tile.dataset.x=x;tile.dataset.y=y;if(condition)tile.dataset.buildingState=condition;}
  const label=airliftPicking?`Call airborne at ${hexColumn(x)}${y+1}, ${type}; safety unknown`:combatHere?`${combatMode.kind.replaceAll('_',' ')} at ${hexColumn(x)}${y+1}`:barrageHere?`Mortar at ${hexColumn(x)}${y+1}`:smokeHere?`Smoke at ${hexColumn(x)}${y+1}`:move&&!picking?`Move to ${hexColumn(x)}${y+1}, ${type}, ${move.cost} action${move.cost!==1?'s':''}${move.road_bonus?', road bonus':''}${move.threats?(state.signals_version?', spotted enemy firing lane; overwatch unknown':', exposed to overwatch'):''}`:null;
  if(tile.getAttribute('aria-label')!==label){
   for(const attr of ['tabindex','role','aria-label'])tile.removeAttribute(attr);
   if(label){tile.setAttribute('tabindex','0');tile.setAttribute('role','button');tile.setAttribute('aria-label',label);}
  }
  tile.classList.toggle('combat-choice',!!combatHere);tile.classList.toggle('combat-search',!!combatHere&&combatMode.kind==='field_recon');
  tile._order=airliftPicking?()=>window.pickAirborneHex([x,y]):combatHere?()=>window.pickCombatHex([x,y]):barrageHere?()=>placeBarrage([x,y]):smokeHere?()=>placeSmoke([x,y]):move&&!picking?()=>moveUnit(move):null;
  if(!reuse){activate(tile,()=>tile._order?.());svg._tiles.push(tile);svg.append(tile);}
  if(reuse)continue;
  svg.append(element('text',{x:cx-18,y:cy-16,class:'tile-label'},`${hexColumn(x)}${y+1}`));
  if(type==='woods')svg.append(element('path',{d:`M${cx-9} ${cy+9}l9 -20l9 20z M${cx} ${cy+9}v5`,class:'terrain-icon'}));
  if(type==='building'&&!condition)svg.append(element('path',{d:`M${cx-12} ${cy-5}l12 -8l12 8v19h-24z M${cx-12} ${cy-5}h24`,class:'building-icon'}));
  if(type==='objective')svg.append(element('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'objective-icon'},'★'));
  if(type==='bridge')svg.append(element('path',{d:`M${cx-15} ${cy-15}v30m30 -30v30m-30 -24h30m-30 18h30`,class:'bridge-icon'}));
 }
 if(!sameUnits){
  for(const smoke of display.smoke||[]){const [cx,cy]=center(...smoke.pos);svg.append(element('ellipse',{cx,cy,rx:25,ry:22,class:'smoke-cloud'}));}
  const marked=new Set();
  for(const barrage of state.barrages||[])for(const [x,y] of barrage.area){
   const index=y*width+x;if(marked.has(index)||!svg._tiles[index])continue;marked.add(index);
   const [cx,cy]=center(x,y),points=svg._tiles[index].getAttribute('points');
   svg.append(element('path',{d:`M${points.split(' ').join(' L')} Z`,class:'barrage-zone'}),element('text',{x:cx+16,y:cy+23,class:'incoming-mark'},'!'));
  }
 }
 if(unit&&enemy){const [x1,y1]=center(...unit.pos),[x2,y2]=center(...enemy.pos);svg.append(element('line',{x1,y1,x2,y2,class:`aim-line${shot?' clear':''}`}));}
 for(const u of display.units.filter(u=>u.hp>0&&!u.reserve&&!u.carrier_id)){
  if(sameUnits&&reuse){const g=svg._counters.get(u.id);for(const [name,on] of [['selected',selected===u.id],['target',target===u.id]])if(g.classList.contains(name)!==on)g.classList.toggle(name,on);if(g._platoonFilter!==platoonFilter){g.querySelector('.platoon-halo')?.remove();if(u.side===state.side&&u.platoon===platoonFilter){const [x,y]=center(...u.pos);g.prepend(element('path',{d:`M${x-24} ${y-20}h48v41h-48z`,class:'platoon-halo'}));}g._platoonFilter=platoonFilter;}continue;}
  const [cx,cy]=center(...u.pos),g=element('g',{class:`unit ${u.side} platoon-${u.platoon||'none'}${selected===u.id?' selected':''}${target===u.id?' target':''}`,role:'button',tabindex:0,'aria-label':`${names[u.side]} ${unitName(u)}, ${u.hp} strength, ${u.ap} actions${u.pinned?', pinned':''}`});
  g.dataset.unitId=u.id;
  svg._counters.set(u.id,g);g._platoonFilter=platoonFilter;
  // Transparent hit area is larger than the counter for comfortable phone taps.
  g.append(element('circle',{cx,cy,r:23,fill:'transparent'}));
  if(u.side===state.side&&u.platoon===platoonFilter)g.append(element('path',{d:`M${cx-24} ${cy-20}h48v41h-48z`,class:'platoon-halo'}));
  g.append(element('rect',{x:cx-20,y:cy-16,width:40,height:33,rx:u.side==='us'?9:1}));
  g.append(element('text',{x:cx,y:cy-3,'text-anchor':'middle',class:'unit-name'},unitCodes[u.kind]||'SQ'));
  g.append(element('text',{x:cx,y:cy+10,'text-anchor':'middle',class:'strength',textLength:Math.min(34,11+7*u.hp),lengthAdjust:'spacingAndGlyphs'},strengthLabel(u)));
  if(u.platoon)g.append(element('text',{x:cx,y:cy+28,'text-anchor':'middle',class:'platoon-marker'},`${u.platoon}${u.number}`));
  if(u.pinned)g.append(element('text',{x:cx+17,y:cy-13,'text-anchor':'middle',class:'pin'},'!'));
  if(u.immobilized)g.append(element('text',{x:cx,y:cy-23,'text-anchor':'middle',class:'track-marker'},'TRACKS'));
  if(u.entrenched)g.append(element('path',{d:`M${cx-22} ${cy+19}h44`,class:'dug-marker'}));
  if(u.overwatch)g.append(element('text',{x:cx-17,y:cy-13,'text-anchor':'middle',class:'watch-marker'},'◎'));
  activate(g,()=>{if(window.airbornePicking?.(state.legal[selected]))window.pickAirborneHex(u.pos);else chooseUnit(u);});svg.append(g);
 }
 $('selection').textContent=unit?`${unitName(unit)} · ${unit.hp} strength · ${unit.ap} actions${unit.pinned?' · PINNED':''}`:'Tap one of your units to see its orders.';
 $('hint').textContent=state.winner?'Start a new match for another battle.':!myTurn?'You can inspect units while you wait.':smokeMode?'Tap a blue-outlined hex to throw smoke, or tap Cancel smoke.':shot?`Fire at ${kinds[enemy.kind]}: ${shot.threshold}+ to hit (${chance(shot.threshold)}%).`:assault?'Enemy adjacent: a close assault is available.':enemy?'No clear shot: check range, sight lines, smoke, or actions.':unit?.pinned?'Rally to remove the pin. It costs 1 action.':unit?`${state.map[unit.pos[1]][unit.pos[0]]}${unit.entrenched?' · dug in':''} · range ${unit.range} · ${unit.smoke||0} smoke grenades`:'Counters show strength dots and remaining actions.';
 if(dsl&&unit?.road_pending&&!unit.pinned&&!picking)$('hint').textContent+=' · ROAD BONUS: your next connected road hex costs 0 AP.';
 if(barrageMode)$('hint').textContent='Choose a marked hex for mortar support. It and its neighbors will be hit after your opponent gets a turn to escape.';
 $('roleBrief').hidden=!unit||(state.rules_version||1)<4;
 $('roleBrief').textContent=unit?.kind==='squad'?`ASSAULT TROOPS · ${unit.grenades||0} frag grenade left. Range 2; 2 damage on a hit. Tap an enemy to see available attacks.`:unit?.kind==='mg'?'FIRE SUPPORT · Suppress a visible enemy within 4 hexes: guaranteed pin, no damage. Cancels overwatch. Tap an enemy.':unit?.platoon?`PLATOON ${unit.platoon} COMMAND · Rally adjacent pinned members of this platoon for 1 action. On your feet: spend 2 actions to restore 1 to an adjacent, unpinned squad or MG (max 2); once per platoon per turn. Mortars remain shared by the army.`:'COMMAND · Rally all adjacent pinned allies for 1 action. Call one delayed mortar barrage per army for 2 actions.';
 if(dsl&&unit?.kind==='leader')$('roleBrief').textContent=`DSL COMMAND · 3 base AP, bank up to 2. On your feet: 2 AP grants 1 to each eligible adjacent squad/MG in your platoon; once per platoon per turn. A unit that has already received 3 AP cannot gain more this turn. Rally: 1 AP. Mortars: 2 AP.`;
 $('grenade').hidden=!myTurn||!grenade||picking;$('grenade').disabled=busy;$('grenade').textContent=grenade?`Frag · ${chance(grenade.threshold)}% · 2 actions`:'Frag';
 $('suppress').hidden=!myTurn||!suppress||picking;$('suppress').disabled=busy;
 $('inspire').hidden=!myTurn||!legal?.inspire?.length||picking;$('inspire').disabled=busy;$('inspire').textContent=`Rally ${unit?.platoon?'platoon':'nearby'} (${legal?.inspire?.length||0}) · 1 action`;
 $('barrage').hidden=!myTurn||!legal?.barrage?.length;$('barrage').disabled=busy;$('barrage').textContent=barrageMode?'Cancel mortar':'Call mortars · 2 actions';
 $('commandOrders').replaceChildren();$('commandOrders').hidden=!myTurn||picking||!legal?.command?.length;
 if(dsl&&legal?.command?.length){const b=document.createElement('button');b.textContent=`On your feet → ${legal.command.length} units · 2 AP`;b.disabled=busy;b.onclick=()=>act({kind:'command',unit:unit.id});$('commandOrders').append(b);const p=document.createElement('p');p.className='mechanics-caption';p.textContent='Recipients: '+legal.command.map(id=>unitName(state.units.find(u=>u.id===id))).join(', ');$('commandOrders').append(p);}
 for(const id of (dsl?[]:legal?.command||[])){const recipient=state.units.find(u=>u.id===id),b=document.createElement('button');b.textContent=`On your feet → ${unitName(recipient)} · 2 actions`;b.disabled=busy;b.onclick=()=>act({kind:'command',unit:unit.id,target:id});$('commandOrders').append(b);}
 renderOdds(shot,assault,grenade,picking);renderUnitMechanics(state,unit);renderCombat(state);
 $('fire').hidden=!myTurn||!shot;$('fire').disabled=busy;$('fire').textContent=shot?`Fire · ${shot.threshold}+ · 2 actions`:'Fire';
 $('fire').disabled=busy||!!shot&&chance(shot.threshold)===0;
 $('assault').hidden=!myTurn||!assault;$('assault').disabled=busy;$('assault').textContent=assault?`Assault · ${chance(assault.threshold)}% · 2 actions`:'Assault';
 $('dig').hidden=!myTurn||!legal?.dig;$('dig').disabled=busy;
 $('overwatch').hidden=!myTurn||!legal?.overwatch;$('overwatch').disabled=busy;
 $('smoke').hidden=!myTurn||!legal?.smoke?.length;$('smoke').disabled=busy;$('smoke').textContent=smokeMode?'Cancel smoke':'Smoke · 1 action';
 $('rally').hidden=!myTurn||!legal?.rally;$('rally').disabled=busy;$('end').disabled=!myTurn||busy;$('reset').hidden=state.side!=='us';
 if(state.ai_side)$('reset').hidden=false;
 $('latest').textContent=state.log.at(-1);$('log').replaceChildren(...state.log.slice().reverse().map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('roster').replaceChildren(...state.units.filter(u=>u.side===state.side&&(platoonFilter==='all'||u.platoon===platoonFilter)).map((u,i)=>{const b=document.createElement('button');b.dataset.platoon=u.platoon||'none';b.className=`roster-unit${u.id===selected?' active':''}`;b.disabled=u.hp<=0||busy;b.textContent=`${u.kind==='leader'?'LT':u.kind==='mg'?'MG':'SQ'} ${u.platoon?u.platoon+u.number:i+1} · ${u.hp<=0?'Lost':u.pinned?'Pinned':u.overwatch?'Watching':u.ap+' AP'}`;b.setAttribute('aria-label',`${unitName(u)}${u.platoon?'':' '+(i+1)}, ${u.hp<=0?'eliminated':u.hp+' strength, '+u.ap+' actions'}`);b.onclick=()=>{smokeMode=false;barrageMode=false;combatMode=null;chooseUnit(u);};return b;}));
 $('nextUnit').disabled=busy||!state.units.some(u=>u.side===state.side&&u.hp>0&&(platoonFilter==='all'||u.platoon===platoonFilter));
 $('battleReport').hidden=!state.winner;
 if(state.winner){$('reportTitle').textContent=state.resigned_by?`${names[state.resigned_by]} resigned. ${names[state.winner]} win.`:`${names[state.winner]} take the field.`;$('reportBody').textContent=['us','de'].map(s=>{const alive=state.units.filter(u=>u.side===s&&u.hp>0);return `${names[s]}: ${alive.length} surviving units, ${alive.reduce((n,u)=>n+u.hp,0)} strength`;}).join(' · ');}
 $('seriesScore').textContent=`Army victories this session · ${names.us} ${state.victories?.us||0} / ${names.de} ${state.victories?.de||0}`;
 $('resignButton').hidden=!state.ready||!!state.winner;$('resignButton').disabled=busy;
 $('rematchButton').hidden=!state.ready;$('rematchButton').disabled=busy||!!state.rematch;
 $('rematchProposal').hidden=!state.rematch;
 if(state.rematch){const p=state.rematch,mine=p.by===state.side;$('proposalText').textContent=`${mine?'You proposed':names[p.by]+' propose'} ${p.name} · ${p.ruleset==='dsl'?'DSL v1':'Classic'}${p.swap?' with armies swapped':' with the same armies'}. ${mine?'Waiting for the other commander.':'Accept to replace the current battle.'}`;$('acceptRematch').hidden=mine;$('acceptRematch').disabled=busy;$('declineRematch').disabled=busy;$('declineRematch').textContent=mine?'Cancel proposal':'Decline';}
 renderPlatoons(board);$('findUnit').hidden=!selected||!(large||$('mapWrap').classList.contains('enlarged'));if(newBattle&&large)focusMapUnit(state.units.find(u=>u.side===state.side&&u.platoon==='A'&&u.kind===(state.naval_version?'carrier':'leader')));
 syncPlayback();renderBattleEffects(state,svg);
 if(window.renderCombined)window.renderCombined(unit,legal,svg);
 if(window.renderNaval)window.renderNaval(unit,legal,svg);
 if(window.renderCampaign)window.renderCampaign(unit,legal,svg);
 if(window.renderWeaponRules)window.renderWeaponRules(unit,legal,svg);
 if(window.renderOperations)window.renderOperations(unit,legal,svg);
 if(window.renderFieldworks)window.renderFieldworks(unit,legal,svg);
 if(window.renderSignals)window.renderSignals(unit,legal,svg);
 if(window.renderAirborne)window.renderAirborne(unit,legal,svg);
 if(window.renderOrderCapabilities)window.renderOrderCapabilities(unit);
 const buildingWarning=unit&&unit.hp>0&&!unit.reserve&&!unit.carrier_id&&buildingCondition(state,unit.pos)==='damaged'&&!picking&&!target;
 $('hint').classList.toggle('building-warning',!!buildingWarning);
 if(buildingWarning)$('hint').textContent='Damaged building · reduced cover. Explosive hits can collapse it and kill the occupants.';
 renderUnitClarity(unit);
 document.dispatchEvent(new Event('ww2:render'));
 if(!newBattle)restoreMap();
}
$('create').onclick=()=>run(async()=>{remember(await api('/api/match',{scenario:$('scenarioSelect').value,ruleset:$('rulesetSelect').value}));});
$('joinForm').onsubmit=e=>{e.preventDefault();run(async()=>{const code=$('code').value.trim().toUpperCase(),saved=savedSessions.find(s=>s.code===code);if(saved){const next=await apiWithSession(saved);remember(saved);state=next;render();}else remember(await api(`/api/match/${code}/join`,{}));});};
$('fire').onclick=()=>act({kind:'fire',unit:selected,target});$('rally').onclick=()=>act({kind:'rally',unit:selected});
$('assault').onclick=()=>{if(confirm('Assault? Success deals 2 damage; failure costs your unit 1 strength and pins it.'))act({kind:'assault',unit:selected,target});};
$('dig').onclick=()=>act({kind:'dig',unit:selected});$('smoke').onclick=()=>{barrageMode=false;smokeMode=!smokeMode;target=null;render();};
$('grenade').onclick=()=>{if(confirm('Use this squad’s only fragmentation grenade? It deals 2 damage and pins on a hit, without advancing.'))act({kind:'grenade',unit:selected,target});};
$('suppress').onclick=()=>act({kind:'suppress',unit:selected,target});
$('inspire').onclick=()=>act({kind:'inspire',unit:selected});
$('barrage').onclick=()=>{smokeMode=false;barrageMode=!barrageMode;target=null;render();};
$('overwatch').onclick=()=>act({kind:'overwatch',unit:selected});
$('nextUnit').onclick=()=>{const alive=state.units.filter(u=>u.side===state.side&&u.hp>0&&(platoonFilter==='all'||u.platoon===platoonFilter));const ready=alive.filter(u=>u.ap>0||state.legal[u.id]?.moves.some(m=>m.road_bonus));const units=ready.length?ready:alive;smokeMode=false;barrageMode=false;combatMode=null;chooseUnit(units[(units.findIndex(u=>u.id===selected)+1)%units.length]);};
$('zoom').onclick=()=>{const enlarged=$('mapWrap').classList.toggle('enlarged');$('zoom').setAttribute('aria-pressed',String(enlarged));$('zoom').textContent=state.scenario?.platoons?(enlarged?'Overview':'Detail'):(enlarged?'Fit map −':'Enlarge map +');if(playbackSession){drawPlayback();return;}if(enlarged)focusMapUnit(state.units.find(u=>u.id===selected)||state.units.find(u=>u.side===state.side&&u.hp>0&&(platoonFilter==='all'||u.platoon===platoonFilter)));};
$('end').onclick=()=>{const count=state.units.filter(u=>u.side===state.side&&u.hp>0&&u.ap>0).length;const exposed=state.units.filter(u=>u.side===state.side&&u.hp>0&&state.barrages?.some(b=>b.ttl===1&&b.area.some(p=>p[0]===u.pos[0]&&p[1]===u.pos[1]))).length;if(confirm(`End your turn? ${count} unit${count===1?' has':'s have'} unused actions.${state.ruleset==='dsl'?' Unused AP carries over up to 1 per unit, or 2 per LT; excess is lost.':''}${exposed?` WARNING: ${exposed} of your units will be caught in the incoming barrage.`:''}`))act({kind:'end'});};
$('reset').onclick=()=>{if(confirm('Replace this match? Progress and the old invitation will be lost. Your opponent will need the new invitation.'))run(async()=>{const old=session.code;const next=await api(`/api/match/${old}/reset`,{ruleset:state.ruleset||'classic'});savedSessions=savedSessions.filter(s=>s.code!==old);remember(next);});};
$('refresh').onclick=refresh;
$('findUnit').onclick=()=>focusMapUnit(state.units.find(u=>u.id===selected));
$('share').onclick=async()=>{try{if(navigator.share){await navigator.share({title:state.scenario?.name||'Village Crossing',text:`Command the ${sideLabel('de')}. Join my WWII tactics match.`,url:invitation()});}else{await navigator.clipboard.writeText(invitation());notify('Invitation copied. Send it to the other player.');}}catch(e){if(e.name!=='AbortError'){ $('invite').select();notify('Copy the invitation from the field below.');}}};
$('leave').onclick=()=>{if(playbackSession)stopPlayback();lobbyMode=true;$('game').hidden=true;$('lobby').hidden=false;$('homeBattles').hidden=true;document.body.classList.remove('naval-battle');renderSessions();window.scrollTo(0,0);};
$('homeBattles').onclick=()=>$('leave').click();
$('rulesButton').onclick=()=>$('rules').showModal();$('closeRules').onclick=()=>$('rules').close();
$('scenarioSelect').onchange=scenarioPreview;
$('resignButton').onclick=()=>{if(confirm(`Resign this battle? ${sideLabel(state.side==='us'?'de':'us')} will win. This cannot be undone; you can still arrange a rematch.`)){for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();act({kind:'resign'});}};
$('rematchButton').onclick=()=>{$('rematchRuleset').value=state.ruleset||'classic';$('rematchScenario').value=state.scenario?.id||'village';$('rematchDialog').querySelector('h2').textContent=state.ai_side?'Another round?':'Stay connected. Fight again.';$('rematchDialog').querySelector('h2 + p').textContent=state.ai_side?'Start immediately against the computer. An unfinished battle will be abandoned without awarding a win.':'Your opponent must accept. An unfinished battle will be abandoned without awarding a win.';$('proposeRematch').textContent=state.ai_side?'Start next battle':'Send proposal';$('rematchDialog').showModal();};
$('closeRematch').onclick=()=>$('rematchDialog').close();
$('proposeRematch').onclick=()=>{const settings={operation:'propose',scenario:$('rematchScenario').value,ruleset:$('rematchRuleset').value,swap:$('swapArmies').checked};$('rematchDialog').close();rematchRequest(settings);};
$('acceptRematch').onclick=()=>rematchRequest({operation:'accept'});
$('declineRematch').onclick=()=>rematchRequest({operation:'decline'});
function openSolo(){ $('soloRuleset').value=$('rulesetSelect').value; $('soloScenario').value=lobbyMode?$('scenarioSelect').value:(state?.scenario?.id||$('scenarioSelect').value);$('soloReplace').textContent=session?'This starts a separate solo battle. Your current battle stays available under Battles / load code.':'Choose a battlefield and start playing immediately.';$('soloDialog').showModal(); }
$('createSolo').onclick=openSolo;$('soloButton').onclick=openSolo;$('closeSolo').onclick=()=>$('soloDialog').close();
$('startSolo').onclick=()=>{const body={opponent:'computer',scenario:$('soloScenario').value,ruleset:$('soloRuleset').value};$('soloDialog').close();run(async()=>{remember(await api('/api/match',body));});};
api('/api/scenarios').then(data=>{scenarios=data.scenarios;scenarioPreview();}).catch(()=>{notify('Map preview unavailable. You can still choose a battlefield and try to create a match.');});
const invited=new URLSearchParams(location.search).get('join');
if(invited){$('code').value=invited.toUpperCase();$('entryStatus').textContent=`Invitation to battle ${invited.toUpperCase()}. Press Join below to join or resume your seat. Other battles stay separate.`;$('joinForm').classList.add('invited-battle');}
session=null;
renderSessions();
setInterval(()=>{if(!document.hidden&&!$('game').hidden)refresh();},1800);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

function showAccess(title,help,code){
 $('accessTitle').textContent=title;$('accessHelp').textContent=help;$('accessCode').value=code;$('copyStatus').textContent='';$('accessDialog').showModal();
}
$('closeAccess').onclick=()=>$('accessDialog').close();
$('transferButton').onclick=()=>run(async()=>{
 const data=await api(`/api/match/${session.code}/transfer`,{});
 showAccess('Continue on another device','Open this same site on the other device and paste this code into Load code. It reconnects to your live army, including in multiplayer. Valid for 15 minutes, once only. This device remains connected.',data.transfer_code);
});
$('saveButton').onclick=()=>run(async()=>{
 const data=await api(`/api/match/${session.code}/save`,{revision:state.revision});
 showAccess('Your checkpoint is saved',`Round ${data.round}, saved now. Copy this code into Notes. Load it on this same site from any browser to open a separate solo battle at this exact moment. It preserves units, actions, dice history, and the latest computer playback. The code does not expire and can be reused; later moves do not change it. It relies on this server’s saved data.`,data.save_code);
});
$('copyAccess').onclick=async()=>{
 try{await navigator.clipboard.writeText($('accessCode').value);$('copyStatus').textContent='Copied. Keep it in your notes.';}
 catch(_){$('accessCode').focus();$('accessCode').select();$('copyStatus').textContent='Select and copy the code above.';}
};
$('recoverForm').onsubmit=e=>{
 e.preventDefault();const code=$('recoveryCode').value.trim();
 const prefix=code.replace(/[\s-]/g,'').toUpperCase();
 if(!prefix.startsWith('MOVE')&&!prefix.startsWith('SAVE')){notify('Paste a MOVE transfer code or SAVE checkpoint code.');return;}
 run(async()=>{remember(await api(prefix.startsWith('MOVE')?'/api/transfer':'/api/restore',{code}));$('recoveryCode').value='';});
};
