import{Voyage,PROTOCOL,SHIPS,WEAPONS,ITEMS,ISLANDS,W,H,normalizeProfile,buy,bank,dist,landAt,nearIsland,sail,walk,angleDelta,clamp}from'./core.mjs';
import{SeaRenderer}from'./render.mjs';import{SeaAudio}from'./audio.mjs';
import { CampaignLog, charterInfo } from './campaign.mjs';
import { CHAPTERS, STATIONS } from './catalog.mjs';
import { campaignShelf, difficultyOptions, orders, StationControls } from './crew-ui.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
let storageOK=true;const save=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v));}catch{storageOK=false;}};
let profile=normalizeProfile(read('saltbound.profile',{})),settings={name:'Captain',difficulty:'normal',guidance:'simple',sound:true,music:true,touch:false,zoom:1,stick:106,button:1,effects:!matchMedia('(prefers-reduced-motion: reduce)').matches,...read('saltbound.settings',{})};
const renderer=new SeaRenderer($('sea')),audio=new SeaAudio();let game=new Voyage({seed:1789}),id='solo',inPort=true,paused=false,online=false,net=null,networkReady=false,seq=0,retries=0,packetAt=0,netInfo=null,joining=false,ended=false,modalType='',waypoint=null,keys={},mouse={x:0,y:0,active:false,fire:false},move={x:0,y:0},aim={x:0,y:0,active:false},renderState=null,predicted=null,lastEvent=0,lastMessage='',toastUntil=0,frameTime=performance.now(),acc=0,lastSend=0,lastUI=0,ping=0,lastPing=0;
const coarse=()=>settings.touch||matchMedia('(pointer:coarse)').matches;game.addPlayer(id,'Captain');
function applySettings(){document.body.classList.toggle('touch',settings.touch||matchMedia('(pointer:coarse)').matches);document.documentElement.style.setProperty('--pad',clamp(settings.stick,70,150)+'px');document.documentElement.style.setProperty('--button',clamp(settings.button,.7,1.3));audio.set(settings.sound,settings.music);save('saltbound.settings',settings);}
let browserStore;
try {browserStore=window.localStorage;} catch {}
const campaignLog=new CampaignLog(browserStore);
const stationControls=new StationControls(action);
let lastCampaignReceipt=null;
applySettings();
function portBank(){ $('bankGold').textContent=profile.gold.toLocaleString()+' ◈';}portBank();
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');toastUntil=performance.now()+3500;}
function showModal(type,html){resetInput();modalType=type;$('modalBody').innerHTML=html;if(!$('modal').open)$('modal').showModal();if(!online&&!inPort)paused=true;}
function closeModal(){if(modalType==='result')return;modalType='';$('modal').close();paused=false;resetInput();}
$('closeModal').onclick=closeModal;$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
function resetInput(){keys={};move={x:0,y:0};aim={x:0,y:0,active:false};mouse.fire=false;for(const el of document.querySelectorAll('.stick i'))el.style.transform='';send({type:'inactive'});}
function send(m){if(net?.readyState===1)net.send(JSON.stringify(m));}
function input(){const p=game.player(id);let x=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+move.x,y=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+move.y;const m=Math.max(1,Math.hypot(x,y));x/=m;y/=m;let a=p?.a||game.ship.a,aiming=false;if(aim.active&&Math.hypot(aim.x,aim.y)>.2){a=Math.atan2(aim.y,aim.x);aiming=true;}else if(mouse.active&&!coarse()){const loc=renderer.screen(p?.aboard?game.ship:p||game.ship);a=Math.atan2(mouse.y-loc.y,mouse.x-loc.x);aiming=true;}return{x,y,aim:a,aiming,fire:mouse.fire||(aim.active&&Math.hypot(aim.x,aim.y)>.35),sprint:!!(keys.ShiftLeft||keys.ShiftRight)||(coarse()&&Math.hypot(move.x,move.y)>.92)};}
function action(command) {
  if(inPort||ended||$('modal').open||online&&!networkReady)return;
  if(command.startsWith('station:'))resetInput();
  audio.start();
  if(online)send({type:'action',action:command});
  else game.action(id,command);
}
function startSolo(){disconnect();profile=normalizeProfile(read('saltbound.profile',{}));id='solo';game=new Voyage({profile,difficulty:settings.difficulty});game.addPlayer(id,settings.name,profile);begin(false);}
function begin(isOnline){online=isOnline;inPort=false;ended=false;paused=false;waypoint=null;renderState=null;predicted=null;lastEvent=0;lastMessage='';acc=0;frameTime=performance.now();$('port').hidden=true;$('hud').hidden=false;$('crewInfo').hidden=!online;modalType='';$('modal').close();renderer.cam={x:game.ship.x,y:game.ship.y};audio.start();applySettings();resetInput();stationControls.close();toast(online?'Crew aboard. Stations are ready.':'Sail northeast to Palmwater Cay.');}
$('solo').onclick=startSolo;$('crew').onclick=openCampaigns;$('join').onclick=()=>connect(false,$('crewcode').value);$('crewcode').onkeydown=e=>{if(e.key==='Enter')connect(false,$('crewcode').value);};
function disconnect(){if(net){send({type:'leave'});net.onclose=null;net.close();net=null;}networkReady=false;netInfo=null;joining=false;online=false;try{sessionStorage.removeItem('saltbound.crew');}catch{}}
function openCampaigns() {
  let previous;
  try { previous=JSON.parse(sessionStorage.getItem('saltbound.crew')); } catch {}
  campaignShelf({
    log:campaignLog,showModal,difficulty:settings.difficulty,shop:outfitter,
    launch:charter=>connect(true,'',null,charter),
    resume:previous?.token && previous.pirateId===campaignLog.pirateId ? ()=>connect(false,previous.code,previous) : null
  });
}
async function connect(create,code='',resume=null,selected=null) {
  if(joining)return;
  const roomCode=code.trim().toUpperCase();
  if(!create && !/^[A-F0-9]{10}$/.test(roomCode)){
    showModal('notice','<h2>Check the crew code</h2><p>Enter the ten-character code from the current voyage.</p>');
    return;
  }
  audio.start();joining=true;networkReady=false;
  if(!resume)showModal('connection','<h2>Joining the voyage…</h2><p>Opening your campaign log.</p>');
  let entry;
  try {
    if(create)entry=campaignLog.remember(selected);
    else{
      const response=await fetch('/api/crew/'+roomCode,{cache:'no-store'});
      if(!response.ok)throw Error('Voyage not found. Ask the crew for their latest code.');
      const charter=charterInfo(await response.json());
      if(!charter)throw Error('This invite did not return a valid campaign.');
      const stored=campaignLog.get(charter.id);
      entry={charter:{...charter,chapter:Math.max(charter.chapter,stored?.charter.chapter||0)}};
    }
  }catch(error){
    joining=false;
    showModal('connection','<h2>Couldn’t open the voyage</h2><p>'+esc(error.message)+'</p>');return;
  }
  if(net){net.onclose=null;net.close();}
  const socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/crew');
  net=socket;
  let welcomed=false;
  const timeout=setTimeout(()=>{
    if(socket!==net || welcomed)return;
    socket.close();joining=false;
    showModal('connection','<h2>Connection timed out</h2><p>Return to the campaign log and try the voyage again.</p>');
  },20000);
  socket.onopen=()=>send({
    type:'hello',protocol:PROTOCOL,create,code:roomCode,token:resume?.token,
    campaign:entry.charter,pirateId:campaignLog.pirateId,loadout:campaignLog.envelope(entry.charter.id),name:settings.name
  });
  socket.onmessage=event=>{
    if(socket!==net)return;
    let m;try{m=JSON.parse(event.data);}catch{return;}
    if(m.type==='welcome'){
      welcomed=true;clearTimeout(timeout);id=m.id;
      const charter=campaignLog.remember(m.campaign).charter;
      netInfo={code:m.code,token:m.token,campaignId:charter.id,pirateId:campaignLog.pirateId};
      seq=m.seq||0;networkReady=true;joining=false;retries=0;
      try{sessionStorage.setItem('saltbound.crew',JSON.stringify(netInfo));}catch{}
      if(resume && ['disconnect','connection'].includes(modalType))closeModal();
      $('copyCrew').textContent='CREW '+m.code+' ⧉';
      return;
    }
    if(m.type==='state'){
      const first=!online||inPort;
      const previousChapter=first?null:game.campaign?.chapter;
      game=Object.assign(Object.create(Voyage.prototype),m.state);
      if(!netInfo || game.campaign?.id!==netInfo.campaignId)return;
      if(game.receipt)settleCrewReceipt();
      else if(game.campaign.chapter!==previousChapter)campaignLog.remember(game.campaign);
      packetAt=performance.now();
      if(first)begin(true);
      if(!renderState)renderState=structuredClone(m.state);
      const p=game.player(id),target=p?.aboard?game.ship:p;
      if(target){
        if(!predicted||predicted.aboard!==p.aboard||dist(predicted,target)>180)predicted={...target,aboard:p.aboard};
        else{predicted.x+=(target.x-predicted.x)*.45;predicted.y+=(target.y-predicted.y)*.45;
          predicted.a+=angleDelta(predicted.a,target.a)*.5;predicted.speed=game.ship.speed;predicted.aboard=p.aboard;}
      }
      return;
    }
    if(m.type==='station'){toast(m.ok?'Station · '+STATIONS[m.role].name:'That station is occupied. Choose an open station or Holding.');return;}
    if(m.type==='pong'){ping=Math.round(performance.now()-m.at);return;}
    if(m.type==='error'){
      clearTimeout(timeout);joining=false;toast(m.message);
      if(!welcomed)showModal('connection','<h2>Couldn’t join this voyage</h2><p>'+esc(m.message)+'</p>');
    }
  };
  socket.onclose=e=>{
    clearTimeout(timeout);joining=false;networkReady=false;
    if(net!==socket||!online||ended)return;
    if(netInfo&&e.code!==4001&&retries<5){
      retries++;toast('Connection lost. Rejoining your crew…');
      const stored={...netInfo};
      setTimeout(()=>{if(!inPort&&!networkReady)connect(false,stored.code,stored);},Math.min(8000,1000*2**retries));
    }else{
      showModal('disconnect','<h2>Connection lost</h2><p>Your place is reserved for 90 seconds.</p><div class="panelbuttons"><button id="retryNet">Reconnect</button><button id="returnPort">Return to port</button></div>');
      $('retryNet').onclick=()=>{if(netInfo){retries=0;connect(false,netInfo.code,netInfo);}};
      $('returnPort').onclick=toPort;
    }
  };
  socket.onerror=()=>{};
}
function toPort(){disconnect();inPort=true;paused=false;ended=false;modalType='';stationControls.close();$('modal').close();$('hud').hidden=true;$('port').hidden=false;game=new Voyage({seed:1789});game.addPlayer('solo');id='solo';portBank();}
$('copyCrew').onclick=async()=>{const link=location.origin+'/?crew='+netInfo.code;try{await navigator.clipboard.writeText(link);toast('Crew invite copied.');}catch{showModal('invite','<h2>Invite your crew</h2><p>Send this code to your friends:</p><input id="invitecode" readonly value="'+esc(netInfo.code)+'"><p class="hintnote">Open this same game and enter the code under “Have a crew code?”</p>');$('invitecode').select();}};
function outfitter(campaignId=null) {
  const entry=campaignId?campaignLog.get(campaignId):null;
  const wallet=entry?entry.profile:normalizeProfile(read('saltbound.profile',{}));
  const scope=entry?entry.charter.name+' · Campaign vault':'Solo vault';
  const ships=Object.entries(SHIPS).map(([key,v])=>shopCard(key,v,'ships',
    v.desc+' '+v.hp+' hull · '+v.capacity+' slots · '+v.cannons+' guns per side · '+v.reload+' s reload',wallet));
  const weapons=Object.entries(WEAPONS).map(([key,v])=>shopCard(key,v,'weapons',v.damage+' damage × '+v.pellets+' · '+v.range+' yd',wallet));
  const items=Object.entries(ITEMS).map(([key,v])=>shopCard(key,v,'items',v.desc,wallet));
  showModal('shop','<p class="eyebrow">'+esc(scope)+'</p><h2>Outfitter</h2><p>'+wallet.gold+' doubloons · '+wallet.extractions+' extractions</p>'+
    (entry?'<button id="backCharters">Campaign log</button>':'')+'<div class="shopgrid">'+[...ships,...weapons,...items].join('')+'</div>');
  if(entry)$('backCharters').onclick=openCampaigns;
  function changeWallet(change) {
    const current=entry ? campaignLog.get(entry.charter.id).profile : normalizeProfile(read('saltbound.profile',{}));
    if(change(current)){
      if(entry)campaignLog.storeProfile(entry.charter.id,current);
      else{profile=current;save('saltbound.profile',current);portBank();}
    }
    outfitter(campaignId);
  }
  for(const b of document.querySelectorAll('[data-buy]'))b.onclick=()=>changeWallet(current=>{
    const bought=buy(current,b.dataset.buy);
    if(bought)audio.event({type:'loot'});
    return bought;
  });
  for(const b of document.querySelectorAll('[data-equip]'))b.onclick=()=>changeWallet(current=>{
    const key=b.dataset.equip;
    const category=SHIPS[key]?'ships':'weapons';
    if(!current[category].includes(key))return false;
    current[category==='ships'?'ship':'weapon']=key;
    return true;
  });
}
function shopCard(key,spec,category,description,wallet){
  const owned=wallet[category].includes(key);
  const equipped=wallet.ship===key||wallet.weapon===key||(owned&&category==='items');
  const control=equipped?'<button disabled>Equipped ✓</button>':owned?'<button data-equip="'+key+'">Equip</button>':
    '<button data-buy="'+key+'" '+(wallet.gold<spec.price?'disabled':'')+'>'+spec.price+' ◈ · Purchase</button>';
  return '<article class="shopitem '+(equipped?'equipped':'')+'"><span class="eyebrow">'+category+'</span><h4>'+spec.name+'</h4><p>'+description+'</p>'+control+'</article>';
}
$('outfit').onclick=()=>outfitter();
function handbook(){showModal('guide',`<p class="eyebrow">THE CAPTAIN’S HANDBOOK</p><h2>A fortune is only yours<br>when you get home.</h2><div class="guidegrid"><div><h3>01 / Make landfall</h3><p>You spawn aboard your ship southwest of Palmwater Cay. Sail northeast toward the gold marker. Stop near the beach and choose <b>Go ashore</b>.</p></div><div><h3>02 / Fill the hold</h3><p>Approach gold treasure markers and collect booty. Use your gun and cutlass against raiders, marksmen, crabs, and captains. Purple chests hold permanent gear. Dropped supply crates replenish planks and medicine.</p></div><div><h3>03 / Know when to leave</h3><p>Return to the anchor marker and <b>Board ship</b>. Sail into a green passage on the chart. Choose <b>Extract haul</b> and hold position for ten seconds. Hull damage resets the timer. All surviving crewmates must be aboard.</p></div><div><h3>04 / Come back stronger</h3><p>Spend secured doubloons at the outfitter. Purchased gear stays yours; unextracted loot is lost on defeat. Deeper islands hold richer loot and tougher enemies. The storm closes the sea after 18 minutes.</p></div><div><h3>Mobile</h3><p>Left stick steers the ship or walks; push fully to sprint on land. Drag and hold the right stick to aim and shoot. On the ship, it fires the broadside facing your aim. Use PORT / STARBOARD for explicit sides. Gold button interacts. Repair or heal with the small utility button.</p></div><div><h3>Desktop</h3><p><b>WASD / arrows</b> move. <b>Mouse</b> aims, hold <b>left click</b> fires. <b>Q / E</b> fire ship sides. <b>F</b> interacts, <b>R</b> repairs or heals, <b>Space</b> swings the cutlass, <b>Shift</b> sprints, <b>1</b> cycles owned weapons, <b>M</b> opens the chart, <b>Esc</b> opens settings.</p></div><div><h3>Bring a crew</h3><p>Create a crew and share its code or invite link. Up to four pirates share a ship and haul. The first four pirates take Helm, Guns, Damage control, and Mast. Open Stations to move straight to a free station or choose Holding to free yours. The damage-control pirate patches leaks, treats wounded crewmates, and scoops and throws buckets. Throw when the needle enters the green band. The lookout scans for distant ships and broadcasts their bearing. Each charter has six orders and a separate personal vault. Two connected pirates are required.</p></div><div><h3>Mind the broadsides</h3><p>Cannons fire to the ship’s left and right, not over its bow. Turn alongside an enemy, volley, and use your three-second reload to maneuver. Green firing lanes in Simple guidance help line up your shots. Shipwrecks automatically salvage a strongbox if the hold has space.</p></div></div><p class="hintnote">Small ships let the helmsman fire when Guns is vacant. Gunboats, brigs, frigates, and galleons rely on their gunner in crew voyages. Each hull has its own draft, turn rate, mast range, reload, and bucket capacity.</p>`);}
$('how').onclick=handbook;
function settingsPanel(){showModal('settings',`<p class="eyebrow">${inPort?'CAPTAIN’S PREFERENCES':online?'YOUR CREW KEEPS SAILING':'VOYAGE PAUSED'}</p><h2>Make yourself at home.</h2><div class="settingsgrid"><label>Captain’s name<input id="nameSetting" maxlength="18" value="${esc(settings.name)}"></label><label>Difficulty · next voyage<select id="difficultySetting">${difficultyOptions(settings.difficulty)}</select></label><label>Guidance<select id="guidanceSetting"><option value="simple">Simple · navigation + firing lanes</option><option value="moderate">Moderate · contextual hints</option><option value="expert">Expert · chart and instincts</option></select></label><label>Camera zoom<input id="zoomSetting" type="range" min="0.7" max="1.6" step="0.05" value="${settings.zoom}"></label><label>Thumbstick size<input id="stickSetting" type="range" min="70" max="150" step="2" value="${settings.stick}"></label><label>Action button size<input id="buttonSetting" type="range" min="0.7" max="1.3" step="0.05" value="${settings.button}"></label><label>Sea ambience and effects<input id="soundSetting" type="checkbox" ${settings.sound?'checked':''}></label><label>Music<input id="musicSetting" type="checkbox" ${settings.music?'checked':''}></label><label>Always show thumb controls<input id="touchSetting" type="checkbox" ${settings.touch?'checked':''}></label><label>Water motion and effects<input id="effectsSetting" type="checkbox" ${settings.effects?'checked':''}></label></div><div class="panelbuttons"><button id="resumeButton" class="primary">${inPort?'Save & close':'Return to voyage'}</button><button id="guideButton">Handbook</button>${inPort?'':'<button id="abandonButton">Abandon voyage</button>'}</div><p class="hintnote">${online?'Opening a panel releases your controls; it does not pause your crewmates.':'Solo pauses in menus and when the tab goes into the background.'}</p>`);$('difficultySetting').value=settings.difficulty;$('guidanceSetting').value=settings.guidance;for(const k of['name','difficulty','guidance','zoom','stick','button','sound','music','touch','effects'])$(k+'Setting').onchange=e=>{settings[k]=['sound','music','touch','effects'].includes(k)?e.target.checked:['zoom','stick','button'].includes(k)?Number(e.target.value):e.target.value;applySettings();};$('resumeButton').onclick=closeModal;$('guideButton').onclick=handbook;if(!inPort)$('abandonButton').onclick=()=>showAbandon();}
function showAbandon(){showModal('abandon',`<p class="eyebrow">LEAVE THIS VOYAGE</p><h2>Return empty-handed?</h2><p>${online?'You will leave your crew and receive no extraction reward.':'The current unextracted haul will be lost.'} Your secured doubloons and purchased gear stay safe.</p><div class="panelbuttons"><button id="stayButton" class="primary">Keep sailing</button><button id="leaveButton">Return to port</button></div>`);$('stayButton').onclick=closeModal;$('leaveButton').onclick=toPort;}
$('settingsBtn').onclick=settingsPanel;$('homeBtn').onclick=settingsPanel;$('portsettings').onclick=settingsPanel;
function chart(){showModal('map',`<p class="eyebrow">THE SALTBOUND ARCHIPELAGO</p><h2>Choose your next risk.</h2><canvas id="bigchart" class="chartcanvas" width="1200" height="907" aria-label="Sea chart: tap to set a waypoint"></canvas><div class="maplegend"><span>◯ Green: extraction</span><span>◆ More diamonds: more danger</span><span>● Red: pirate ships</span></div><p class="hintnote">Tap the chart to set a course marker. Tap “Sail this course” to return. You still steer the ship.</p><div class="panelbuttons"><button id="sailCourse" class="primary">Sail this course</button><button id="clearCourse">Clear marker</button></div>`);const cv=$('bigchart');renderer.map(cv,game,id,waypoint,true);cv.onpointerdown=e=>{const r=cv.getBoundingClientRect();waypoint={x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};renderer.map(cv,game,id,waypoint,true);};$('sailCourse').onclick=closeModal;$('clearCourse').onclick=()=>{waypoint=null;renderer.map(cv,game,id,null,true);};}
$('mapBtn').onclick=chart;$('minimap').onclick=chart;
function personalReceipt() {
  const receipt=game.receipt;
  if(game.campaign && game.player(id)?.down)return {...receipt,success:false,gold:0,items:[]};
  return receipt;
}
function settleCrewReceipt() {
  if(!game.receipt || !game.campaign || !game.player(id) || lastCampaignReceipt===game.receipt.id)return;
  campaignLog.settle(game.campaign,personalReceipt(),game.player(id).watch);
  lastCampaignReceipt=game.receipt.id;
}
function endVoyage(){if(ended)return;ended=true;resetInput();const receipt=personalReceipt(),p=game.player(id);let wallet;
 if(game.campaign){
   settleCrewReceipt();
   wallet=campaignLog.get(game.campaign.id).profile;
 }else{
   profile=normalizeProfile(read('saltbound.profile',{}));bank(profile,receipt);save('saltbound.profile',profile);wallet=profile;
 }
 portBank();showModal('result',`<p class="eyebrow">${receipt.success?'PASSAGE SECURED':'LOST AT SEA'}</p><h2>${receipt.success?'The fortune is yours.':'The sea keeps its share.'}</h2><p>${esc(receipt.success?game.message:p?.down?'You were down when the crew extracted. Your share was lost.':game.message)}</p><div class="stats"><div>SECURED<strong>${receipt.gold} ◈</strong></div><div>ISLANDS RAIDED<strong>${receipt.islands}</strong></div><div>PIRATES DEFEATED<strong>${receipt.kills}</strong></div></div>${receipt.items.length?'<p>Recovered gear: '+receipt.items.map(k=>esc((WEAPONS[k]||ITEMS[k]).name)).join(', ')+'</p>':''}${receipt.chapterWon?'<p>Order completed · '+esc(receipt.chapterWon)+'</p>':''}<p>${game.campaign?esc(game.campaign.name):'Solo'} vault · <b>${wallet.gold} doubloons</b>${storageOK?'':' · Saving is unavailable in this browser session.'}</p><div class="panelbuttons"><button id="resultPort" class="primary">Return to port</button><button id="resultAgain">${online?'Next campaign voyage':'Another voyage'}</button></div>`);$('resultPort').onclick=toPort;$('resultAgain').onclick=()=>{const charter=game.campaign;toPort();charter?connect(true,'',null,charter):startSolo();};}
const bind=(id,act)=>$(id).onclick=()=>action(act);bind('useBtn','interact');bind('leftBtn','left');bind('rightBtn','right');bind('meleeBtn','sword');bind('weaponBtn','weapon');$('repairBtn').onclick=()=>action(game.player(id)?.aboard?'repair':'heal');
function stick(el,isAim){let pointer=null;const knob=el.querySelector('i');const update=e=>{const b=el.getBoundingClientRect(),radius=b.width*.36;let x=(e.clientX-b.left-b.width/2)/radius,y=(e.clientY-b.top-b.height/2)/radius;const len=Math.max(1,Math.hypot(x,y));x/=len;y/=len;knob.style.transform=`translate(${x*radius*.65}px,${y*radius*.65}px)`;if(isAim)aim={x,y,active:true};else move={x,y};};el.onpointerdown=e=>{if(inPort||$('modal').open)return;e.preventDefault();audio.start();pointer=e.pointerId;el.setPointerCapture(pointer);update(e);};el.onpointermove=e=>{if(e.pointerId===pointer){e.preventDefault();update(e);}};const end=e=>{if(e.pointerId!==pointer)return;pointer=null;knob.style.transform='';if(isAim)aim={x:0,y:0,active:false};else move={x:0,y:0};};el.onpointerup=end;el.onpointercancel=end;el.onlostpointercapture=end;}
stick($('movePad'),false);stick($('aimPad'),true);
$('sea').onpointermove=e=>{mouse.x=e.clientX;mouse.y=e.clientY;mouse.active=e.pointerType==='mouse';};$('sea').onpointerdown=e=>{if(inPort||$('modal').open)return;if(e.pointerType==='mouse'&&e.button===0){e.preventDefault();mouse.fire=true;mouse.active=true;mouse.x=e.clientX;mouse.y=e.clientY;audio.start();$('sea').setPointerCapture(e.pointerId);}};$('sea').onpointerup=()=>mouse.fire=false;$('sea').onpointercancel=()=>mouse.fire=false;window.addEventListener('pointerup',()=>mouse.fire=false);window.addEventListener('blur',resetInput);
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Escape'){e.preventDefault();if($('modal').open)closeModal();else settingsPanel();return;}if(inPort)return;if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if($('modal').open){if(e.code==='KeyM'&&modalType==='map')closeModal();return;}keys[e.code]=true;if(!e.repeat){if(e.code==='KeyV')stationControls.toggle();
 if(e.code==='KeyB')action('bucket');if(e.code==='KeyT')action('treat');if(e.code==='KeyG')action('scan');
 if(e.code==='KeyF')action('interact');if(e.code==='KeyQ')action('left');if(e.code==='KeyE')action('right');if(e.code==='KeyR')action(game.player(id)?.aboard?'repair':'heal');if(e.code==='Space')action('sword');if(e.code==='Digit1')action('weapon');if(e.code==='KeyM'||e.code==='Tab')chart();}});window.addEventListener('keyup',e=>delete keys[e.code]);
document.addEventListener('visibilitychange',()=>{resetInput();if(document.hidden){if(!online&&!inPort&&!ended)paused=true;}else{frameTime=performance.now();acc=0;if(!online&&!inPort&&!ended&&paused)settingsPanel();}});document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});window.addEventListener('resize',()=>renderer.resize());
function ui(now){const p=game.player(id);if(!p)return;const s=game.ship,entity=p.aboard?s:p;$('healthLabel').textContent=p.aboard?'SHIP HULL':p.down?'PIRATE DOWN':'HEALTH';$('healthBar').style.width=clamp(entity.hp/entity.maxHp*100,0,100)+'%';$('healthBar').style.background=entity.hp/entity.maxHp<.3?'#e58f74':'var(--teal)';$('healthNum').textContent=Math.ceil(entity.hp);const gold=game.cargo.reduce((v,l)=>v+l.value,0);$('haulGold').textContent=gold+' ◈';$('hold').textContent=game.cargo.length+' / '+s.capacity;const left=Math.max(0,Math.ceil(game.limit-game.time));$('clock').textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');$('clock').style.color=left<120?'#ffa884':'';const ni=nearIsland(s);$('region').textContent=p.aboard?(dist(ni.point,s)<600?ni.i.name.toUpperCase()+' APPROACH':'THE SALTBOUND SEA'):(landAt(p.x,p.y)?.name||'SHORE').toUpperCase();$('missionText').textContent=game.message;$('missionText').hidden=settings.guidance==='expert';const ctx=game.context(id);$('contextLabel').textContent=ctx.label;$('contextHint').textContent=ctx.hint;$('contextHint').hidden=settings.guidance!=='simple';$('useBtn').innerHTML=esc(ctx.label)+' <kbd>F</kbd>';$('useBtn').hidden=p.aboard&&!ctx.action;$('useBtn').disabled=!ctx.action||p.down||game.waiting||online&&!networkReady;$('modeLabel').textContent=p.down?'CREW REVIVAL NEEDED':p.aboard?(s.helm===id?'AT THE HELM':'GUNNER · F TO TAKE HELM'):'ON FOOT';$('movePad').querySelector('span').textContent=p.aboard?'STEER':'MOVE';$('aimPad').querySelector('span').textContent=p.aboard?'CANNONS':'AIM + FIRE';$('weaponBtn').textContent=WEAPONS[p.weapon].name;$('weaponBtn').hidden=p.aboard;$('supplies').textContent=s.planks+' planks · '+s.meds+' medicine';$('repairBtn').innerHTML=(p.aboard?'Repair':'Heal')+' <kbd>R</kbd>';$('repairBtn').disabled=p.down||(p.aboard?s.planks<1||s.hp>=s.maxHp:s.meds<1||p.hp>=p.maxHp);$('meleeBtn').hidden=p.aboard;$('broadside').hidden=!p.aboard;for(const side of['left','right']){$(side+'Ready').textContent=s[side]>.1?s[side].toFixed(1)+' s':'READY';$(side+'Btn').disabled=s[side]>.1||game.waiting;}$('extractBox').hidden=!game.extracting||game.status!=='sailing';$('extractTime').textContent=Math.max(0,Math.ceil(10-game.exitProgress));$('extractBar').style.width=game.exitProgress*10+'%';renderer.map($('minimap'),game,id,waypoint);if(online){$('netStatus').textContent=networkReady?(ping?ping+' ms':'CONNECTED'):'RECONNECTING…';$('crewList').textContent=game.players.map(p=>p.name+(p.down?' †':p.connected?'':' (away)')).join(' · ');if(now-packetAt>5000&&networkReady){networkReady=false;net?.close(4002,'Stalled connection');}}
 if(game.message!==lastMessage){if(lastMessage)toast(game.message);lastMessage=game.message;}if(now>toastUntil)$('toast').classList.remove('show');for(const ev of game.events)if(ev.id>lastEvent){if(dist(ev,entity)<1400)audio.event(ev);lastEvent=Math.max(lastEvent,ev.id);}stationControls.update(game,p);
 if(p.aboard){
   $('modeLabel').textContent=p.down?'WOUNDED':STATIONS[p.station].name.toUpperCase();
   $('supplies').textContent=s.planks+' planks · '+s.meds+' meds · '+Math.ceil(s.water)+'% water';
 }
 $('orderBtn').hidden=!game.campaign;
 if(game.campaign){
   $('orderBtn').textContent='Orders · '+Math.min(CHAPTERS.length,game.campaign.chapter+1)+'/'+CHAPTERS.length;
   $('crewList').textContent=game.players.map(q=>q.name+' · '+(q.down?'Down':!q.connected?'Away':q.aboard?STATIONS[q.station].name:'Ashore')).join('  /  ');
   if(game.waiting){$('missionText').hidden=false;$('missionText').textContent='Waiting for a second pirate. Tap the crew code to invite a friend.';}
   else if(game.message==='Make landfall at Palmwater Cay.'){$('missionText').textContent=CHAPTERS[game.campaign.chapter]?.brief || 'Charter complete. Sail for treasure.';}
 }
 if(game.status!=='sailing')endVoyage();}
function smooth(dt,inp){if(!renderState)return game;const rs=renderState;for(const k of['campaign','waiting','time','status','cargo','bullets','loot','events','score','exitProgress','extracting','receipt','message'])rs[k]=game[k];const blend=(out,target)=>{out.x+=(target.x-out.x)*Math.min(1,dt*16);out.y+=(target.y-out.y)*Math.min(1,dt*16);out.a+=angleDelta(out.a,target.a)*Math.min(1,dt*16);for(const key of Object.keys(target))if(!['x','y','a'].includes(key))out[key]=target[key];};blend(rs.ship,game.ship);for(const key of['players','enemies','hostiles']){rs[key]=game[key].map(t=>{const old=rs[key].find(q=>q.id===t.id);if(!old)return{...t};blend(old,t);return old;});}
 const p=game.player(id);if(predicted&&p&&!p.down&&!game.waiting&&networkReady&&!$('modal').open){if(p.aboard&&game.ship.helm===id){predicted.type=game.ship.type;sail(predicted,inp,dt);Object.assign(rs.ship,{x:predicted.x,y:predicted.y,a:predicted.a});}else if(!p.aboard){predicted.stamina=p.stamina;walk(predicted,inp,dt);const out=rs.players.find(q=>q.id===id);if(out)Object.assign(out,{x:predicted.x,y:predicted.y,a:predicted.a});}else predicted={...game.ship};}return rs;}
function frame(now){try{const dt=Math.min(.05,(now-frameTime)/1000);frameTime=now;const inp=$('modal').open||document.hidden?{x:0,y:0,fire:false}:input();if(inPort){game.time+=dt;}else if(!online&&!paused&&!ended){acc+=dt;while(acc>=1/60){game.step(1/60,{[id]:inp});acc-=1/60;}}else if(online&&networkReady&&!ended){if(now-lastSend>=33){send({type:'input',seq:++seq,input:inp});lastSend=now;}if(now-lastPing>4000){send({type:'ping',at:now});lastPing=now;}}
 const shown=online?smooth(dt,inp):game;renderer.draw(shown,{id,menu:inPort,zoom:settings.zoom*(game.player(id)?.station==='mast'?.64:1),waypoint,guidance:settings.guidance,effects:settings.effects},dt);audio.update(now/1000,inPort);if(!inPort&&now-lastUI>90){ui(now);lastUI=now;}}finally{requestAnimationFrame(frame);}}
$('orderBtn').onclick=()=>{if(game.campaign)orders(game.campaign,showModal);};
requestAnimationFrame(frame);
const invited=new URL(location.href).searchParams.get('crew');if(invited&&/^[A-F0-9]{10}$/i.test(invited)){$('crewcode').value=invited;}
if(!storageOK)toast('Browser storage is unavailable. Progress cannot be saved.');
