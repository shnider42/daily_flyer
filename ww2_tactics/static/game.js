'use strict';
const $ = id => document.getElementById(id);
let session = null, state = null, selected = null, target = null, busy = false, polling = false, toastTimer, smokeMode = false, lobbyMode = false, renderedBattle = null, scenarios = [];
let barrageMode = false;
try { session = JSON.parse(localStorage.getItem('ww2-session')); } catch (_) {}
const names = {us:'Americans',de:'Germans'}, kinds={squad:'Rifle squad',leader:'Leader',mg:'Machine gun'};
function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('message').hidden=true,6500);}
async function api(path, body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'The server could not complete that action.');return data;
}
function remember(data){session=data;localStorage.setItem('ww2-session',JSON.stringify(data));selected=null;target=null;state=null;smokeMode=false;lobbyMode=false;history.replaceState(null,'','/');}
function invitation(){return `${location.origin}/?join=${session.code}`;}
async function refresh(){
 if(!session||busy||polling||lobbyMode)return;polling=true;const requestedCode=session.code;
 try{const next=await api(`/api/match/${requestedCode}`);if(session?.code!==requestedCode)return;$('connection').textContent='● Connected';if(!state||next.revision>state.revision||next.code!==state.code){state=next;render();}}
 catch(e){$('connection').textContent='○ Reconnecting';if(!state)notify(e.message);}finally{polling=false;}
}
async function run(task){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){notify(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(state)render();await refresh();}}
async function act(body){await run(async()=>{state=await api(`/api/match/${session.code}`,{...body,revision:state.revision});target=null;smokeMode=false;barrageMode=false;render();});}
function element(tag,attrs={},text){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e;}
function center(x,y){return [27+x*52+(y%2)*26,30+y*49];}
function activate(e,callback){e.addEventListener('click',callback);e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();callback();}});}
function chooseUnit(u){if(busy)return;if(barrageMode){placeBarrage(u.pos);return;}if(smokeMode){placeSmoke(u.pos);return;}if(u.side===state.side){selected=u.id;target=null;}else{target=u.id;}render();}
function placeBarrage(pos){if(state.legal[selected]?.barrage?.some(p=>p[0]===pos[0]&&p[1]===pos[1])&&confirm(`Call your army's only mortar barrage at ${String.fromCharCode(65+pos[0])}${pos[1]+1}? The marked hex and its neighbors will be hit at the end of your opponent's turn. ALL units there will be pinned and lose dug-in cover, including yours. No strength damage.`))act({kind:'barrage',unit:selected,pos});}
function placeSmoke(pos){if(state.legal[selected]?.smoke?.some(p=>p[0]===pos[0]&&p[1]===pos[1]))act({kind:'smoke',unit:selected,pos});}
function chance(threshold){return Math.max(0,Math.min(100,Math.round((7-threshold)/6*100)));}
function moveUnit(move){if(!move.threats||confirm(`${move.threats} enemy unit${move.threats===1?' is':'s are'} watching this hex. Move and risk reaction fire?`))act({kind:'move',unit:selected,pos:move.pos});}
function scenarioPreview(){
 const board=scenarios.find(s=>s.id===$('scenarioSelect').value);if(!board)return;
 $('scenarioBrief').textContent=board.brief;
 const svg=$('scenarioPreview');svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${board.width*52+36} ${board.height*49+29}`);svg.setAttribute('aria-label',`${board.name}, ${board.width} by ${board.height} hex battlefield`);
 board.map.forEach((row,y)=>row.forEach((type,x)=>{const [cx,cy]=center(x,y);const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');svg.append(element('polygon',{points,class:`hex ${type}`}));if(type==='objective')svg.append(element('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'objective-icon'},'★'));}));
}
async function rematchRequest(body){await run(async()=>{state=await api(`/api/match/${session.code}/rematch`,{...body,revision:state.revision});render();});}
function render(){
 if(!state||lobbyMode)return;$('lobby').hidden=true;$('game').hidden=false;
 const myTurn=state.ready&&!state.winner&&state.turn===state.side;
 const board=state.scenario||{id:'village',name:'Village Crossing',objective_name:'Village square',rounds:8};
 const battleKey=`${state.code}:${state.battle_number||1}`;
 if(renderedBattle!==battleKey){selected=null;target=null;smokeMode=false;barrageMode=false;renderedBattle=battleKey;$('mapWrap').scrollTo?.(0,0);}
 $('battleTitle').textContent=board.name;document.title=`${board.name} · WWII Tactics`;
 $('battleNumber').textContent=`BATTLE ${String(state.battle_number||1).padStart(2,'0')}`;
 $('objectiveName').textContent=`★ ${board.objective_name.toUpperCase()}`;
 $('round').textContent=`${state.round} / ${board.rounds}`;$('side').textContent=`You command the ${names[state.side]}`;
 $('game').dataset.side=state.side;
 $('turnBanner').dataset.side=state.winner||state.turn;
 $('soloButton').hidden=!!state.ai_side;
 $('computerReview').hidden=!state.computer_orders?.length;
 $('computerOrders').replaceChildren(...(state.computer_orders||[]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('waiting').hidden=state.ready;$('invite').value=invitation();$('matchCode').textContent=`MATCH CODE · ${session.code}`;
 $('turnBanner').textContent=state.winner?`${names[state.winner]} win. ${state.winner===state.side?'Mission accomplished.':'The battle is over.'}`:!state.ready?'Waiting for the German commander…':myTurn?'Your turn · select a unit':`${names[state.turn]} are giving orders…`;
 if(state.ai_side&&!state.winner)$('turnBanner').textContent=`Your turn · vs computer (${names[state.ai_side]})`;
 $('objective').textContent=`Hold: ${state.hold} / 2`;
 $('legacyNotice').hidden=(state.rules_version||1)>=4;
 $('missionHint').textContent=state.winner?`Battle complete in round ${state.round}.`:state.hold?'Americans hold the objective. Germans must dislodge them before the next American turn ends.':state.side==='us'?`Capture ★ and hold through two American turn endings. You have ${board.rounds-state.round+1} rounds left.`:`Keep the Americans from holding ★ through round ${board.rounds}.`;
 $('armyCount').textContent=['us','de'].map(s=>`${names[s]} ${state.units.filter(u=>u.side===s&&u.hp>0).length}/5`).join(' · ');
 const unit=state.units.find(u=>u.id===selected&&u.hp>0);
 if(!unit)selected=null;
 const legal=unit?state.legal[unit.id]:null, enemy=state.units.find(u=>u.id===target&&u.hp>0);
 const shot=enemy&&legal?.targets.find(t=>t.id===enemy.id);
 const assault=enemy&&legal?.assaults?.find(t=>t.id===enemy.id);
 const grenade=enemy&&legal?.grenades?.find(t=>t.id===enemy.id);
 const suppress=enemy&&legal?.suppress?.includes(enemy.id);
 if(!myTurn||!legal?.smoke?.length)smokeMode=false;
 if(!myTurn||!legal?.barrage?.length)barrageMode=false;
 const picking=smokeMode||barrageMode;
 $('supportStatus').hidden=(state.rules_version||1)<4;
 $('supportStatus').textContent=`Mortar calls left · US ${state.support?.us||0} / DE ${state.support?.de||0}`;
 $('incoming').hidden=!state.barrages?.length;
 $('incoming').textContent=(state.barrages||[]).map(b=>`INCOMING at ${String.fromCharCode(65+b.pos[0])}${b.pos[1]+1} + neighboring hexes. ${b.ttl===1?'Impact at the end of this turn':'Impact at the end of the next turn'}. Move clear—even friendly troops!`).join(' ');
 const svg=$('map');svg.replaceChildren();
 svg.setAttribute('viewBox',`0 0 ${state.map[0].length*52+36} ${state.map.length*49+29}`);
 svg.setAttribute('aria-label',`${board.name} battlefield. Select your unit then a highlighted hex to move.`);
 for(let y=0;y<state.map.length;y++)for(let x=0;x<state.map[y].length;x++){
  const [cx,cy]=center(x,y),type=state.map[y][x],move=myTurn&&legal?.moves.find(m=>m.pos[0]===x&&m.pos[1]===y);
  const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
  const smokeHere=smokeMode&&legal.smoke.some(p=>p[0]===x&&p[1]===y);
  const barrageHere=barrageMode&&legal.barrage.some(p=>p[0]===x&&p[1]===y);
  const tile=element('polygon',{points,class:`hex ${type}${move&&!picking?' move':''}${move?.threats&&!picking?' threatened':''}${smokeHere?' smoke-choice':''}${barrageHere?' barrage-choice':''}`,...(barrageHere?{tabindex:0,role:'button','aria-label':`Mortar at ${String.fromCharCode(65+x)}${y+1}`} :smokeHere?{tabindex:0,role:'button','aria-label':`Smoke at ${String.fromCharCode(65+x)}${y+1}`} :move&&!picking?{tabindex:0,role:'button','aria-label':`Move to ${String.fromCharCode(65+x)}${y+1}, ${type}, ${move.cost} action${move.cost>1?'s':''}${move.threats?', exposed to overwatch':''}`}:{})});
  if(barrageHere)activate(tile,()=>placeBarrage([x,y]));else if(smokeHere)activate(tile,()=>placeSmoke([x,y]));else if(move&&!picking)activate(tile,()=>moveUnit(move));svg.append(tile);
  svg.append(element('text',{x:cx-18,y:cy-16,class:'tile-label'},`${String.fromCharCode(65+x)}${y+1}`));
  if(type==='woods')svg.append(element('path',{d:`M${cx-9} ${cy+9}l9 -20l9 20z M${cx} ${cy+9}v5`,class:'terrain-icon'}));
  if(type==='building')svg.append(element('path',{d:`M${cx-12} ${cy-5}l12 -8l12 8v19h-24z M${cx-12} ${cy-5}h24`,class:'building-icon'}));
  if(type==='objective')svg.append(element('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'objective-icon'},'★'));
  if(type==='bridge')svg.append(element('path',{d:`M${cx-15} ${cy-15}v30m30 -30v30m-30 -24h30m-30 18h30`,class:'bridge-icon'}));
  if(state.smoke?.some(s=>s.pos[0]===x&&s.pos[1]===y))svg.append(element('ellipse',{cx,cy,rx:25,ry:22,class:'smoke-cloud'}));
  if(state.barrages?.some(b=>b.area.some(p=>p[0]===x&&p[1]===y))){svg.append(element('path',{d:`M${points.split(' ').join(' L')} Z`,class:'barrage-zone'}));svg.append(element('text',{x:cx+16,y:cy+23,class:'incoming-mark'},'!'));}
 }
 if(unit&&enemy){const [x1,y1]=center(...unit.pos),[x2,y2]=center(...enemy.pos);svg.append(element('line',{x1,y1,x2,y2,class:`aim-line${shot?' clear':''}`}));}
 for(const u of state.units.filter(u=>u.hp>0)){
  const [cx,cy]=center(...u.pos),g=element('g',{class:`unit ${u.side}${selected===u.id?' selected':''}${target===u.id?' target':''}`,role:'button',tabindex:0,'aria-label':`${names[u.side]} ${kinds[u.kind]}, ${u.hp} strength, ${u.ap} actions${u.pinned?', pinned':''}`});
  // Transparent hit area is larger than the counter for comfortable phone taps.
  g.append(element('circle',{cx,cy,r:23,fill:'transparent'}));
  g.append(element('rect',{x:cx-20,y:cy-16,width:40,height:33,rx:u.side==='us'?9:1}));
  g.append(element('text',{x:cx,y:cy-3,'text-anchor':'middle',class:'unit-name'},`${u.side==='us'?'US':'DE'} ${u.kind==='mg'?'MG':u.kind==='leader'?'LT':'SQ'}`));
  g.append(element('text',{x:cx,y:cy+10,'text-anchor':'middle',class:'strength'},'●'.repeat(u.hp)+' · '+u.ap));
  if(u.pinned)g.append(element('text',{x:cx+17,y:cy-13,'text-anchor':'middle',class:'pin'},'!'));
  if(u.entrenched)g.append(element('path',{d:`M${cx-22} ${cy+19}h44`,class:'dug-marker'}));
  if(u.overwatch)g.append(element('text',{x:cx-17,y:cy-13,'text-anchor':'middle',class:'watch-marker'},'◎'));
  activate(g,()=>chooseUnit(u));svg.append(g);
 }
 $('selection').textContent=unit?`${kinds[unit.kind]} · ${unit.hp} strength · ${unit.ap} actions${unit.pinned?' · PINNED':''}`:'Tap one of your units to see its orders.';
 $('hint').textContent=state.winner?'Start a new match for another battle.':!myTurn?'You can inspect units while you wait.':smokeMode?'Tap a blue-outlined hex to throw smoke, or tap Cancel smoke.':shot?`Fire at ${kinds[enemy.kind]}: ${shot.threshold}+ to hit (${chance(shot.threshold)}%).`:assault?'Enemy adjacent: a close assault is available.':enemy?'No clear shot: check range, sight lines, smoke, or actions.':unit?.pinned?'Rally to remove the pin. It costs 1 action.':unit?`${state.map[unit.pos[1]][unit.pos[0]]}${unit.entrenched?' · dug in':''} · range ${unit.range} · ${unit.smoke||0} smoke grenades`:'Counters show strength dots and remaining actions.';
 if(barrageMode)$('hint').textContent='Choose a marked hex for mortar support. It and its neighbors will be hit after your opponent gets a turn to escape.';
 $('roleBrief').hidden=!unit||(state.rules_version||1)<4;
 $('roleBrief').textContent=unit?.kind==='squad'?`ASSAULT TROOPS · ${unit.grenades||0} frag grenade left. Range 2; 2 damage on a hit. Tap an enemy to see available attacks.`:unit?.kind==='mg'?'FIRE SUPPORT · Suppress a visible enemy within 4 hexes: guaranteed pin, no damage. Cancels overwatch. Tap an enemy.':'COMMAND · Rally all adjacent pinned allies for 1 action. Call one delayed mortar barrage per army for 2 actions.';
 $('grenade').hidden=!myTurn||!grenade||picking;$('grenade').disabled=busy;$('grenade').textContent=grenade?`Frag · ${chance(grenade.threshold)}% · 2 actions`:'Frag';
 $('suppress').hidden=!myTurn||!suppress||picking;$('suppress').disabled=busy;
 $('inspire').hidden=!myTurn||!legal?.inspire?.length||picking;$('inspire').disabled=busy;$('inspire').textContent=`Rally nearby (${legal?.inspire?.length||0}) · 1 action`;
 $('barrage').hidden=!myTurn||!legal?.barrage?.length;$('barrage').disabled=busy;$('barrage').textContent=barrageMode?'Cancel mortar':'Call mortars · 2 actions';
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
 $('roster').replaceChildren(...state.units.filter(u=>u.side===state.side).map((u,i)=>{const b=document.createElement('button');b.className=`roster-unit${u.id===selected?' active':''}`;b.disabled=u.hp<=0||busy;b.textContent=`${u.kind==='leader'?'LT':u.kind==='mg'?'MG':'SQ'} ${i+1} · ${u.hp<=0?'Lost':u.pinned?'Pinned':u.overwatch?'Watching':u.ap+' AP'}`;b.setAttribute('aria-label',`${kinds[u.kind]} ${i+1}, ${u.hp<=0?'eliminated':u.hp+' strength, '+u.ap+' actions'}`);b.onclick=()=>{smokeMode=false;barrageMode=false;chooseUnit(u);};return b;}));
 $('nextUnit').disabled=busy||!state.units.some(u=>u.side===state.side&&u.hp>0);
 $('battleReport').hidden=!state.winner;
 if(state.winner){$('reportTitle').textContent=`${names[state.winner]} take the field.`;$('reportBody').textContent=['us','de'].map(s=>{const alive=state.units.filter(u=>u.side===s&&u.hp>0);return `${names[s]}: ${alive.length} surviving units, ${alive.reduce((n,u)=>n+u.hp,0)} strength`;}).join(' · ');}
 $('seriesScore').textContent=`Army victories this session · Americans ${state.victories?.us||0} / Germans ${state.victories?.de||0}`;
 $('rematchButton').hidden=!state.ready;$('rematchButton').disabled=busy||!!state.rematch;
 $('rematchProposal').hidden=!state.rematch;
 if(state.rematch){const p=state.rematch,mine=p.by===state.side;$('proposalText').textContent=`${mine?'You proposed':names[p.by]+' propose'} ${p.name}${p.swap?' with armies swapped':' with the same armies'}. ${mine?'Waiting for the other commander.':'Accept to replace the current battle.'}`;$('acceptRematch').hidden=mine;$('acceptRematch').disabled=busy;$('declineRematch').disabled=busy;$('declineRematch').textContent=mine?'Cancel proposal':'Decline';}
}
$('create').onclick=()=>run(async()=>{remember(await api('/api/match',{scenario:$('scenarioSelect').value}));});
$('joinForm').onsubmit=e=>{e.preventDefault();run(async()=>{remember(await api(`/api/match/${$('code').value.trim().toUpperCase()}/join`,{}));});};
$('fire').onclick=()=>act({kind:'fire',unit:selected,target});$('rally').onclick=()=>act({kind:'rally',unit:selected});
$('assault').onclick=()=>{if(confirm('Assault? Success deals 2 damage; failure costs your unit 1 strength and pins it.'))act({kind:'assault',unit:selected,target});};
$('dig').onclick=()=>act({kind:'dig',unit:selected});$('smoke').onclick=()=>{barrageMode=false;smokeMode=!smokeMode;target=null;render();};
$('grenade').onclick=()=>{if(confirm('Use this squad’s only fragmentation grenade? It deals 2 damage and pins on a hit, without advancing.'))act({kind:'grenade',unit:selected,target});};
$('suppress').onclick=()=>act({kind:'suppress',unit:selected,target});
$('inspire').onclick=()=>act({kind:'inspire',unit:selected});
$('barrage').onclick=()=>{smokeMode=false;barrageMode=!barrageMode;target=null;render();};
$('overwatch').onclick=()=>act({kind:'overwatch',unit:selected});
$('nextUnit').onclick=()=>{const alive=state.units.filter(u=>u.side===state.side&&u.hp>0);const ready=alive.filter(u=>u.ap>0);const units=ready.length?ready:alive;smokeMode=false;barrageMode=false;chooseUnit(units[(units.findIndex(u=>u.id===selected)+1)%units.length]);};
$('zoom').onclick=()=>{const enlarged=$('mapWrap').classList.toggle('enlarged');$('zoom').setAttribute('aria-pressed',String(enlarged));$('zoom').textContent=enlarged?'Fit map −':'Enlarge map ＋';};
$('end').onclick=()=>{const count=state.units.filter(u=>u.side===state.side&&u.hp>0&&u.ap>0).length;const exposed=state.units.filter(u=>u.side===state.side&&u.hp>0&&state.barrages?.some(b=>b.ttl===1&&b.area.some(p=>p[0]===u.pos[0]&&p[1]===u.pos[1]))).length;if(confirm(`End your turn? ${count} unit${count===1?' has':'s have'} unused actions.${exposed?` WARNING: ${exposed} of your units will be caught in the incoming barrage.`:''}`))act({kind:'end'});};
$('reset').onclick=()=>{if(confirm('Replace this match? Progress and the old invitation will be lost. Your opponent will need the new invitation.'))run(async()=>{remember(await api(`/api/match/${session.code}/reset`,{}));});};
$('refresh').onclick=refresh;
$('share').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'Village Crossing',text:'Command the Germans. Join my WWII tactics match.',url:invitation()});}else{await navigator.clipboard.writeText(invitation());notify('Invitation copied. Send it to the other player.');}}catch(e){if(e.name!=='AbortError'){ $('invite').select();notify('Copy the invitation from the field below.');}}};
$('leave').onclick=()=>{if(confirm('Show the invitation screen? Your saved player key is kept; reload to return to this match.')){lobbyMode=true;$('game').hidden=true;$('lobby').hidden=false;}};
$('rulesButton').onclick=()=>$('rules').showModal();$('closeRules').onclick=()=>$('rules').close();
$('scenarioSelect').onchange=scenarioPreview;
$('rematchButton').onclick=()=>{$('rematchScenario').value=state.scenario?.id||'village';$('rematchDialog').querySelector('h2').textContent=state.ai_side?'Another round?':'Stay connected. Fight again.';$('rematchDialog').querySelector('h2 + p').textContent=state.ai_side?'Start immediately against the computer. An unfinished battle will be abandoned without awarding a win.':'Your opponent must accept. An unfinished battle will be abandoned without awarding a win.';$('proposeRematch').textContent=state.ai_side?'Start next battle':'Send proposal';$('rematchDialog').showModal();};
$('closeRematch').onclick=()=>$('rematchDialog').close();
$('proposeRematch').onclick=()=>{const settings={operation:'propose',scenario:$('rematchScenario').value,swap:$('swapArmies').checked};$('rematchDialog').close();rematchRequest(settings);};
$('acceptRematch').onclick=()=>rematchRequest({operation:'accept'});
$('declineRematch').onclick=()=>rematchRequest({operation:'decline'});
function openSolo(){ $('soloScenario').value=state?.scenario?.id||$('scenarioSelect').value;$('soloReplace').textContent=session?'Starting solo replaces the current shared match and invitation. Both players’ progress in that match will be lost.':'Choose a battlefield and start playing immediately.';$('soloDialog').showModal(); }
$('createSolo').onclick=openSolo;$('soloButton').onclick=openSolo;$('closeSolo').onclick=()=>$('soloDialog').close();
$('startSolo').onclick=()=>{const body={opponent:'computer',scenario:$('soloScenario').value};$('soloDialog').close();run(async()=>{remember(await api(session?`/api/match/${session.code}/reset`:'/api/match',body));});};
api('/api/scenarios').then(data=>{scenarios=data.scenarios;scenarioPreview();}).catch(()=>{notify('Map preview unavailable. You can still choose a battlefield and try to create a match.');});
const invited=new URLSearchParams(location.search).get('join');
if(invited){$('code').value=invited.toUpperCase();if(session&&session.code!==invited.toUpperCase()){notify('Joining this invitation will replace your saved player key. Keep your original browser if you need the old seat.');session=null;}}
if(session)refresh();
setInterval(()=>{if(!document.hidden&&!$('game').hidden)refresh();},1800);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
