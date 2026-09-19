'use strict';
const $ = id => document.getElementById(id);
let session = null, state = null, selected = null, target = null, busy = false, polling = false, toastTimer;
try { session = JSON.parse(localStorage.getItem('ww2-session')); } catch (_) {}
const names = {us:'Americans',de:'Germans'}, kinds={squad:'Rifle squad',leader:'Leader',mg:'Machine gun'};
function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('message').hidden=true,6500);}
async function api(path, body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'The server could not complete that action.');return data;
}
function remember(data){session=data;localStorage.setItem('ww2-session',JSON.stringify(data));selected=null;target=null;state=null;history.replaceState(null,'','/');}
function invitation(){return `${location.origin}/?join=${session.code}`;}
async function refresh(){
 if(!session||busy||polling)return;polling=true;const requestedCode=session.code;
 try{const next=await api(`/api/match/${requestedCode}`);if(session?.code!==requestedCode)return;$('connection').textContent='● Connected';if(!state||next.revision>state.revision||next.code!==state.code){state=next;render();}}
 catch(e){$('connection').textContent='○ Reconnecting';if(!state)notify(e.message);}finally{polling=false;}
}
async function run(task){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){notify(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(state)render();await refresh();}}
async function act(body){await run(async()=>{state=await api(`/api/match/${session.code}`,{...body,revision:state.revision});target=null;render();});}
function element(tag,attrs={},text){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e;}
function center(x,y){return [27+x*52+(y%2)*26,30+y*49];}
function activate(e,callback){e.addEventListener('click',callback);e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();callback();}});}
function chooseUnit(u){if(busy)return;if(u.side===state.side){selected=u.id;target=null;}else{target=u.id;}render();}
function render(){
 if(!state)return;$('lobby').hidden=true;$('game').hidden=false;
 const myTurn=state.ready&&!state.winner&&state.turn===state.side;
 $('round').textContent=`${state.round} / 8`;$('side').textContent=`You command the ${names[state.side]}`;
 $('waiting').hidden=state.ready;$('invite').value=invitation();$('matchCode').textContent=`MATCH CODE · ${session.code}`;
 $('turnBanner').textContent=state.winner?`${names[state.winner]} win. ${state.winner===state.side?'Mission accomplished.':'The battle is over.'}`:!state.ready?'Waiting for the German commander…':myTurn?'Your turn · select a unit':`${names[state.turn]} are giving orders…`;
 $('objective').textContent=`Hold: ${state.hold} / 2`;
 const unit=state.units.find(u=>u.id===selected&&u.hp>0);
 if(!unit)selected=null;
 const legal=unit?state.legal[unit.id]:null, enemy=state.units.find(u=>u.id===target&&u.hp>0);
 const shot=enemy&&legal?.targets.find(t=>t.id===enemy.id);
 const svg=$('map');svg.replaceChildren();
 for(let y=0;y<9;y++)for(let x=0;x<7;x++){
  const [cx,cy]=center(x,y),type=state.map[y][x],move=myTurn&&legal?.moves.find(m=>m.pos[0]===x&&m.pos[1]===y);
  const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
  const tile=element('polygon',{points,class:`hex ${type}${move?' move':''}`,...(move?{tabindex:0,role:'button','aria-label':`Move to ${String.fromCharCode(65+x)}${y+1}, ${type}, ${move.cost} action${move.cost>1?'s':''}`}:{})});
  if(move)activate(tile,()=>act({kind:'move',unit:selected,pos:[x,y]}));svg.append(tile);
  svg.append(element('text',{x:cx-18,y:cy-16,class:'tile-label'},`${String.fromCharCode(65+x)}${y+1}`));
  if(type==='woods')svg.append(element('path',{d:`M${cx-9} ${cy+9}l9 -20l9 20z M${cx} ${cy+9}v5`,class:'terrain-icon'}));
  if(type==='building')svg.append(element('path',{d:`M${cx-12} ${cy-5}l12 -8l12 8v19h-24z M${cx-12} ${cy-5}h24`,class:'building-icon'}));
  if(type==='objective')svg.append(element('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'objective-icon'},'★'));
 }
 for(const u of state.units.filter(u=>u.hp>0)){
  const [cx,cy]=center(...u.pos),g=element('g',{class:`unit ${u.side}${selected===u.id?' selected':''}${target===u.id?' target':''}`,role:'button',tabindex:0,'aria-label':`${names[u.side]} ${kinds[u.kind]}, ${u.hp} strength, ${u.ap} actions${u.pinned?', pinned':''}`});
  // Transparent hit area is larger than the counter for comfortable phone taps.
  g.append(element('circle',{cx,cy,r:23,fill:'transparent'}));
  g.append(element('rect',{x:cx-20,y:cy-16,width:40,height:33,rx:3}));
  g.append(element('text',{x:cx,y:cy-3,'text-anchor':'middle'},u.kind==='mg'?'MG':u.kind==='leader'?'LT':'SQ'));
  g.append(element('text',{x:cx,y:cy+10,'text-anchor':'middle',class:'strength'},'●'.repeat(u.hp)+' · '+u.ap));
  if(u.pinned)g.append(element('text',{x:cx+17,y:cy-13,'text-anchor':'middle',class:'pin'},'!'));
  activate(g,()=>chooseUnit(u));svg.append(g);
 }
 $('selection').textContent=unit?`${kinds[unit.kind]} · ${unit.hp} strength · ${unit.ap} actions${unit.pinned?' · PINNED':''}`:'Tap one of your units to see its orders.';
 $('hint').textContent=state.winner?'Start a new match for another battle.':!myTurn?'You can inspect units while you wait.':shot?`Fire at ${kinds[enemy.kind]}: ${shot.threshold}+ to hit (${Math.round((7-shot.threshold)/6*100)}%).`:enemy?'No clear shot: check range, sight lines, or actions.':unit?.pinned?'Rally to remove the pin. It costs 1 action.':unit?'Tap a green hex to move, or an enemy to preview fire.':'Counters show strength dots and remaining actions.';
 $('fire').hidden=!myTurn||!shot;$('fire').disabled=busy;$('fire').textContent=shot?`Fire · ${shot.threshold}+ · 2 actions`:'Fire';
 $('rally').hidden=!myTurn||!legal?.rally;$('rally').disabled=busy;$('end').disabled=!myTurn||busy;$('reset').hidden=state.side!=='us';
 $('latest').textContent=state.log.at(-1);$('log').replaceChildren(...state.log.slice().reverse().map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
}
$('create').onclick=()=>run(async()=>{remember(await api('/api/match',{}));});
$('joinForm').onsubmit=e=>{e.preventDefault();run(async()=>{remember(await api(`/api/match/${$('code').value.trim().toUpperCase()}/join`,{}));});};
$('fire').onclick=()=>act({kind:'fire',unit:selected,target});$('rally').onclick=()=>act({kind:'rally',unit:selected});
$('end').onclick=()=>{if(confirm('End your turn? Unused actions will be lost.'))act({kind:'end'});};
$('reset').onclick=()=>{if(confirm('Replace this match? Progress and the old invitation will be lost. Your opponent will need the new invitation.'))run(async()=>{remember(await api(`/api/match/${session.code}/reset`,{}));});};
$('refresh').onclick=refresh;
$('share').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'Village Crossing',text:'Command the Germans. Join my WWII tactics match.',url:invitation()});}else{await navigator.clipboard.writeText(invitation());notify('Invitation copied. Send it to the other player.');}}catch(e){if(e.name!=='AbortError'){ $('invite').select();notify('Copy the invitation from the field below.');}}};
$('leave').onclick=()=>{if(confirm('Show the invitation screen? Your saved player key is kept; reload to return to this match.')){$('game').hidden=true;$('lobby').hidden=false;}};
$('rulesButton').onclick=()=>$('rules').showModal();$('closeRules').onclick=()=>$('rules').close();
const invited=new URLSearchParams(location.search).get('join');
if(invited){$('code').value=invited.toUpperCase();if(session&&session.code!==invited.toUpperCase()){notify('Joining this invitation will replace your saved player key. Keep your original browser if you need the old seat.');session=null;}}
if(session)refresh();
setInterval(()=>{if(!document.hidden&&!$('game').hidden)refresh();},1800);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
