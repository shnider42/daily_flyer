import {AIRCRAFT,MISSIONS,getMission,getAircraft} from './campaign.mjs';
import {FlightSimulation,terrainHeight} from './sim.mjs';
import {FlightRenderer} from './renderer.mjs';
import {SoftwareFlightRenderer} from './software.mjs';
import {SquadronClient} from './network.mjs';
import {FlightControls} from './controls.mjs';
import {FlightAudio} from './audio.mjs';
import {DEFAULTS,VERSION,loadSettings,saveSettings,loadProgress,saveProgress,applySettings,normalizeSettings} from './settings.mjs';

const $=id=>document.getElementById(id),$$=q=>Array.from(document.querySelectorAll(q));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Math.max(0,Math.round(Number.isFinite(n)?n:0));
const dist=(p,q)=>Math.hypot((p.x||0)-(q.x||0),(p.y||0)-(q.y||0),(p.z||0)-(q.z||0));
const impactMarker=document.createElement('div');impactMarker.id='impact-marker';impactMarker.className='impact-marker';impactMarker.hidden=true;impactMarker.setAttribute('aria-hidden','true');impactMarker.innerHTML='<i></i><span>IMPACT</span><small></small>';$('flight-screen').appendChild(impactMarker);
const hasImpactMarker=()=>!!(sim&&sim.player.bombs>0&&!sim.player.onGround&&sim.mission.kind!=='nuclear'&&sim.bombAim&&[sim.bombAim.x,sim.bombAim.y,sim.bombAim.z].every(Number.isFinite));
let settings=loadSettings(),progress=loadProgress();applySettings(settings);
let screen='home',sim=null,renderer=null,paused=false,remotePaused=false,coop=false,settingsTab='controls',resumeAfterSettings=false,ready=false;
let selectedMission=MISSIONS.find(m=>m.id===progress.lastMission)||MISSIONS[0],selectedAircraft=Object.values(AIRCRAFT)[0],eraFilter='all';
let lastFrame=performance.now(),accumulator=0,lastHud=0,lastWorld=0,lastRemoteFire=0,lastCaption=0,toastTimeout=null,hintDismissed=false;
let seenEvents=new Set(),lastStatus='flying',endHandled=false,settingsFromPause=false;
const audio=new FlightAudio(settings);

function toast(text,ms=3400){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,ms);}
function showScreen(name){screen=name;document.body.dataset.screen=name;$$('[data-screen]').forEach(el=>el.hidden=el.dataset.screen!==name);$('main-header').hidden=name==='flight'||name==='debrief';$('loading').hidden=true;if(name!=='flight')impactMarker.hidden=true;controls?.setActive(name==='flight'&&!paused&&!remotePaused);audio.setActive(name==='flight'&&!paused&&!remotePaused);window.scrollTo(0,0);}
function refreshHome(){const complete=Object.keys(progress.completed).length;const next=MISSIONS.find(m=>!progress.completed[m.id])||MISSIONS[0];$('continue-button').innerHTML=(complete?'Continue your logbook':'Begin your logbook')+' <span>→</span>';$('continue-note').textContent=complete?`${complete} of ${MISSIONS.length} sorties logged. Next: ${next.title}.`:'Your first aircraft is waiting on the runway.';}
function goHome(){coop=false;team.leave();closeDialogs();paused=remotePaused=false;sim=null;endHandled=false;refreshHome();showScreen('home');}
function closeDialogs(){for(const d of [$('pause-dialog'),$('settings-dialog')])if(d.open)d.close();}
function aircraftOf(m){return getAircraft?.(m.aircraft)||AIRCRAFT[m.aircraft]||Object.values(AIRCRAFT)[0];}
function missionOf(id){return getMission?.(id)||MISSIONS.find(m=>m.id===id)||MISSIONS[0];}

const controls=new FlightControls({stick:$('flight-stick'),knob:$('stick-knob'),look:$('look-pad'),fire:$('fire-button'),throttle:$('throttle'),settings,onAction:handleAction,onPause:pauseFlight,onAnyGesture:()=>audio.unlock()});
const team=new SquadronClient({
  onStatus(status,message){$('network-status').textContent=message||status;const offline=['error','disconnected','closed','failed'].includes(status);if(offline&&coop&&screen==='flight')toast(message||'Squadron connection interrupted.');if(status==='error'){setConnectBusy(false);toast(message||'Could not connect.');}updateRoom();},
  onRoster(roster){const self=roster.find(p=>p.id===team.id);if(self)ready=!!self.ready;updateRoom(roster);setConnectBusy(false);},
  onStart(data){closeDialogs();coop=true;startMission(missionOf(data.missionId),{cooperative:true});},
  onWorld(snapshot){if(!coop||team.isHost||!sim)return;sim.applySnapshot(snapshot);const was=remotePaused;remotePaused=!!snapshot.teamPaused;if(remotePaused!==was){controls.setActive(!paused&&!remotePaused);audio.setActive(!paused&&!remotePaused);if(remotePaused)toast('Flight lead paused the sortie.',5000);else toast('Flight lead resumed.');}},
  onAction(data){if(!coop||!team.isHost||!sim)return;sim.applyRemoteAction?.(data.action,{...data.player,id:data.playerId,playerId:data.playerId});},
  onEnd(message){if(!coop)return;coop=false;remotePaused=false;if(screen==='flight'){sim.worldAuthority=true;paused=true;controls.setActive(false);audio.setActive(false);$('pause-note').textContent=(message||'The squadron sortie ended.')+' You can continue solo or restart the sortie.';if(!$('pause-dialog').open)$('pause-dialog').showModal();}else updateRoom();toast(message||'Squadron closed.',5000);}
});

function setConnectBusy(busy){$('create-room').disabled=busy;$('join-room').disabled=busy;}
function updateRoom(roster=team.roster||[]){const joined=!!team.code;$('squadron-connect').hidden=joined;$('squadron-room').hidden=!joined;if(!joined)return;$('room-code-display').textContent=team.code;$('room-role').textContent=team.isHost?'You are flight lead. Launch when your squadron is ready.':'Waiting for your flight lead. Mark yourself ready.';$('roster').innerHTML=roster.map((p,i)=>`<div class="roster-person"><strong>${String(i+1).padStart(2,'0')} &nbsp; ${escapeHTML(p.name||'Pilot')}${p.id===team.id?' · YOU':''}</strong><small>${p.connected===false?'Reconnecting':p.ready?'✓ Ready':'Preparing'}</small></div>`).join('');$('start-room').hidden=!team.isHost;$('start-room').disabled=roster.length<2||roster.some(p=>!p.ready||p.connected===false);$('ready-room').hidden=team.isHost;$('ready-room').textContent=ready?'✓ Ready · tap to stand down':'Ready to fly';}

function renderCampaign(){
  const groups=[['all','ALL SORTIES'],['early','1917–18'],['ww2','1938–44'],['jets','1972–82'],['modern','1991+']];
  $('era-filters').innerHTML=groups.map(([id,label])=>`<button class="${eraFilter===id?'active':''}" data-era="${id}" aria-pressed="${eraFilter===id}">${label}</button>`).join('');
  const group=m=>m.number<=5?'early':m.number<=10?'ww2':m.number<=13?'jets':'modern';
  const list=MISSIONS.filter(m=>eraFilter==='all'||group(m)===eraFilter);
  $('mission-list').innerHTML=list.map(m=>`<button class="mission-card ${m.id===selectedMission.id?'selected':''}" data-mission="${escapeHTML(m.id)}" aria-pressed="${m.id===selectedMission.id}"><span class="num">${String(m.number).padStart(2,'0')}</span><span><strong>${escapeHTML(m.title)}</strong><small>${escapeHTML(m.year)} / ${escapeHTML(aircraftOf(m).shortName||aircraftOf(m).name)}</small></span><span class="mission-state">${progress.completed[m.id]?'✓':'→'}</span></button>`).join('');
  renderBrief();
}
function renderBrief(){const m=selectedMission,a=aircraftOf(m),completed=progress.completed[m.id];$('mission-detail').innerHTML=`<span class="mission-date">SORTIE ${String(m.number).padStart(2,'0')} / ${escapeHTML(m.year)} · ${escapeHTML(m.location)}</span><h2>${escapeHTML(m.title)}</h2><p class="mission-deck">${escapeHTML(m.description)}</p><div class="mission-specs"><span><small>YOUR AIRCRAFT</small>${escapeHTML(a.name)}</span><span><small>FLIGHT TIME</small>${escapeHTML(m.duration||'3–6 minutes')}</span></div><p class="eyebrow">FLIGHT ORDERS</p><ol class="brief-objectives">${(Array.isArray(m.briefing)?m.briefing:[m.briefing||m.description]).map(t=>`<li>${escapeHTML(t)}</li>`).join('')}</ol><p class="mission-lesson">${escapeHTML(m.lesson||a.summary)}</p><button id="launch-mission" class="primary wide">${completed?'Fly this sortie again':'Take the controls'} <span>→</span></button><p class="small-note">${completed?'✓ Logged in your campaign.':'Progress saves on this device.'} ${escapeHTML(settings.assist==='assisted'?'Assisted flight is on. You can change it in Setup.':settings.assist==='expert'?'Expert handling is on.':'Standard handling is on.')}</p><details class="historical-note"><summary>From the historical logbook</summary><p>${escapeHTML(m.historicalNote||'Historical aircraft and settings, with compressed distances and simplified game systems.')}</p>${(m.sources||[]).map((u,i)=>`<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">Source ${i+1} →</a>`).join('')}<p>Flight performance, weapons and radar are simplified game systems.</p></details>`;$('launch-mission').onclick=()=>startMission(m);}
function openCampaign(mission){if(mission)selectedMission=mission;eraFilter='all';renderCampaign();showScreen('campaign');}
function renderFree(){const list=Object.values(AIRCRAFT);$('aircraft-list').innerHTML=list.map(a=>`<button class="aircraft-card ${a.id===selectedAircraft.id?'selected':''}" data-aircraft="${escapeHTML(a.id)}" aria-pressed="${a.id===selectedAircraft.id}"><small>${escapeHTML(a.era||a.role||'FLIGHT COLLECTION')}</small><strong>${escapeHTML(a.name)}</strong><span>${escapeHTML(a.role||a.summary?.split('.')[0]||'Aircraft')}</span></button>`).join('');$('free-aircraft-name').textContent=selectedAircraft.name;$('free-aircraft-summary').textContent=selectedAircraft.summary||'Get familiar with the aircraft, and bring it home.';}
function buildFreeMission(){const a=selectedAircraft,base=MISSIONS.find(m=>m.aircraft===a.id)||MISSIONS[0],airborne=$('free-start').value==='airborne',biome=$('free-biome').value,w=$('free-weather').value;const m={...structuredClone(base),id:'freeflight',number:0,title:'Open Sky',year:'FREE FLIGHT',location:'Your own horizon',aircraft:a.id,kind:'free',biome,description:'Get to know your aircraft. Fly anywhere, then return to the runway when you feel ready.',briefing:['Explore the landscape.','Practise takeoff, turns and landings.'],lesson:'No timer. No enemies. Just your aircraft.',enemies:[],targets:[],waypoints:[],goal:{},runways:[{x:0,z:0,y:4,length:1600,width:90,heading:0,label:'HOME',carrier:false}],weather:{wind:{x:w==='cloudy'?9:2,z:0},cloudBase:w==='cloudy'?480:1400,cloudTop:w==='cloudy'?1100:1900,fog:w==='cloudy'?.00022:.000045,timeOfDay:w==='sunset'?'dusk':'day'},start:{x:0,y:airborne?450:6,z:airborne?-1700:-600,heading:0,speed:airborne?a.cruise:0,airborne,cold:!airborne}};m.start.y=airborne?Math.max(450,terrainHeight(m.start.x,m.start.z,m)+350):m.runways[0].y+2;return m;}

function startMission(m,{cooperative=false}={}){
  if(!cooperative){coop=false;team.leave();}
  audio.unlock();closeDialogs();coop=cooperative;paused=remotePaused=false;endHandled=false;hintDismissed=false;seenEvents.clear();lastStatus='flying';accumulator=0;lastWorld=0;
  sim=new FlightSimulation(m,{...settings,playerId:cooperative?team.id:'local'});
  sim.player.id=cooperative?team.id:'local';sim.worldAuthority=!cooperative||team.isHost;
  if(coop){const roster=team.roster||[],slot=Math.max(0,roster.findIndex(p=>p.id===team.id));if(sim.player.onGround){sim.player.x+=(slot%2?1:-1)*Math.ceil(slot/2)*8;sim.player.z+=slot*14;}else{sim.player.x+=(slot%2?1:-1)*slot*23;sim.player.z-=slot*36;}}
  renderer.loadMission(m,aircraftOf(m));controls.settings=settings;controls.setThrottle(sim.player.throttle||0);controls.lookX=controls.lookY=0;
  $('flight-mission-number').textContent=m.number?String(m.number).padStart(2,'0')+' / '+MISSIONS.length:'FREE';$('flight-title').textContent=m.title.toUpperCase();$('flight-aircraft').textContent=aircraftOf(m).name.toUpperCase();$('radio-caption').hidden=true;$('flight-warning').hidden=true;$('flight-network').hidden=!coop;
  if(m.id!=='freeflight'){progress.lastMission=m.id;saveProgress(progress);}
  showScreen('flight');updateHUD();
  if(window.matchMedia('(pointer:coarse)').matches&&innerHeight>innerWidth)toast('Portrait works. Turn sideways for a wider view.',4000);
}

function handleAction(name){
  if(name==='camera'){settings.camera=settings.camera==='chase'?'cockpit':settings.camera==='cockpit'?'cinematic':'chase';saveSettings(settings);toast(settings.camera==='chase'?'Chase camera':settings.camera==='cockpit'?'Cockpit view':'Cinematic view');return;}
  if(!sim||paused||remotePaused||(coop&&(!team.connected||team.paused||(!team.isHost&&team.hostStale))))return;
  if(coop&&!team.isHost&&sim.mission.kind==='nuclear'&&['payload','abort'].includes(name)){toast('The flight lead makes the final decision for the squadron.');return;}
  audio.unlock();const weapon=['missile','payload','countermeasure'].includes(name);
  if(coop&&!team.isHost&&weapon){const targetId=sim.targetId;const result=sim.action(name);if(result)team.sendAction({name,targetId});if(result?.message)toast(result.message);}
  else {const result=sim.action(name);if(result?.message)toast(result.message);}
  if(name==='startup'){audio.cue('click');if(sim.player.engine){controls.setThrottle(Math.max(controls.throttleValue,.12));toast('Engine running. Release the brake, then add throttle.');}}
  if(name==='hover')controls.setThrottle(sim.player.throttle);
  if(name==='level')toast('Wings level.');if(name==='countermeasure')audio.cue('missile');updateHUD();
}
function pauseFlight(){if(screen!=='flight'||!sim)return;paused=true;controls.setActive(false);audio.setActive(false);$('pause-note').textContent=coop?(team.isHost?'The squadron mission is paused while you are here.':'Your aircraft is holding. The squadron mission continues.'):'Your flight is paused.';if(!$('pause-dialog').open)$('pause-dialog').showModal();if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:true});}
function resumeFlight(){if($('pause-dialog').open)$('pause-dialog').close();paused=false;controls.setActive(screen==='flight'&&!remotePaused);audio.unlock();audio.setActive(screen==='flight'&&!remotePaused);lastFrame=performance.now();accumulator=0;}

const startupCopy=[['Fuel on.','Open the fuel valve so the engine has something to run on.','Open fuel valve'],['Ignition ready.','Switch on the magnetos. They provide the spark.','Switch on magnetos'],['A little encouragement.','Prime the engine before turning the propeller.','Prime the engine'],['Bring it to life.','Turn the propeller. Listen as the engine catches.','Start the engine']];
function updateHUD(){
  if(!sim||screen!=='flight')return;const p=sim.player,m=sim.mission,a=aircraftOf(m),aviation=settings.units==='aviation';
  const terrain=terrainHeight(p.x,p.z,m),alt=Math.max(0,p.y-terrain);
  $('hud-speed').textContent=number(p.speed*(aviation?1.94384:3.6));$('speed-unit').textContent=aviation?'KNOTS':'KM/H';$('hud-altitude').textContent=number(alt*(aviation?3.28084:1));$('altitude-unit').textContent=aviation?'FEET AGL':'METRES AGL';
  const deg=((p.heading*180/Math.PI)%360+360)%360;$('hud-heading').innerHTML=String(Math.round(deg)%360).padStart(3,'0')+'<span>°</span>';$('hud-compass').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8];
  const wind=typeof m.weather?.wind==='number'?m.weather.wind:Math.hypot(m.weather?.wind?.x||0,m.weather?.wind?.z||0);$('hud-wind').textContent='WIND '+number(wind*1.944)+' KT →';
  $('objective-text').textContent=sim.objective||'Follow your flight orders';const percent=number((sim.progress||0)*100);$('mission-progress').textContent=m.kind==='free'?'FREE':percent+'%';$('objective-progress').style.width=clamp(percent,0,100)+'%';$('objective-label').textContent=sim.phase?String(sim.phase).replace(/_/g,' ').toUpperCase():'FLIGHT ORDERS';
  $('hud-health').innerHTML='AIRFRAME <b>'+number(p.health/(a.health||100)*100)+'%</b>';$('hud-fuel').innerHTML='FUEL <b>'+number(p.fuel)+'%</b>';
  $('hud-stores').textContent=a.gun?'GUN '+number(p.ammo)+(p.missiles?' · MSL '+p.missiles:'')+(p.bombs?' · BMB '+p.bombs:''):p.troopers?'TROOPS '+p.troopers:p.bombs?'PAYLOAD '+p.bombs:'UNARMED';
  $('throttle-output').textContent=number(controls.throttleValue*100)+'%';$('gear-state').textContent=a.fixedGear?'FIXED':p.gear?'DOWN':'UP';document.querySelector('[data-action=gear]').disabled=!!a.fixedGear;$('flaps-state').textContent=p.flaps?'DOWN':'UP';document.querySelector('[data-action=flaps]').hidden=a.hasFlaps===false;$('brake-state').textContent=p.brake?'ON':'OFF';$('hover-state').textContent=p.hover?'ON':'OFF';
  for(const [act,state] of [['gear',p.gear],['flaps',p.flaps],['brake',p.brake],['hover',p.hover]])$$(`[data-action="${act}"]`).forEach(b=>b.classList.toggle('active',!!state));
  $('hover-action').hidden=!a.vtol;$('fire-button').hidden=!a.gun;$('missile-action').hidden=!a.missiles;$('payload-action').hidden=!(a.bombs||p.troopers||m.kind==='drop'||m.kind==='nuclear');$('countermeasure-action').hidden=!(a.missiles||a.radar);$('radar-action').hidden=!a.radar;
  $('weapon-actions').hidden=!(a.gun||a.bombs||a.missiles||p.troopers);$('crosshair').hidden=!(a.gun||a.missiles);
  const lock=sim.lockProgress||0;$('lock-state').textContent=lock>=1?'LOCKED':lock>0?'LOCKING '+number(lock*100)+'%':'NO LOCK';$('missile-action').classList.toggle('ready',lock>=1);$('radar-state').textContent=sim.radarOn?'ON':'OFF';$('radar-label').textContent=a.radar?(sim.radarOn?'RADAR · CONTACTS':'RADAR SILENT'):'NAVIGATION';
  $('payload-state').textContent=p.troopers?'PARATROOPERS':m.kind==='nuclear'?'FINAL RELEASE':'BOMB';
  $('abort-finale').hidden=m.kind!=='nuclear'||sim.status!=='flying'||(coop&&!team.isHost);
  $('startup-panel').hidden=!!p.engine||!p.onGround||m.start?.airborne;const step=clamp(p.startupStep||0,0,3),copy=startupCopy[step];$('startup-title').textContent=copy[0];$('startup-hint').textContent=copy[1];$('startup-button').innerHTML=copy[2]+' <span>→</span>';Array.from($('startup-steps').children).forEach((e,i)=>{e.classList.toggle('done',i<step);e.classList.toggle('current',i===step);});
  const hint=sim.hint||'Use the left stick or WASD to fly. Throttle changes your speed.';$('hint-text').textContent=hint;$('flight-hint').hidden=hintDismissed||settings.guidance==='minimal'||(!p.engine&&p.onGround);$('objective-box').hidden=settings.guidance==='minimal'&&m.kind==='free';
  let warning='';if(coop&&(team.paused||team.hostStale||!team.connected))warning='SQUADRON CONNECTION · HOLDING';else if(remotePaused)warning='FLIGHT LEAD PAUSED';else if(p.stalled)warning='STALL · LOWER THE NOSE';else if(p.health<(a.health||100)*.25)warning='AIRFRAME CRITICAL';else if(sim.threat)warning=typeof sim.threat==='string'?sim.threat:'THREAT · CHECK RADAR';else if(alt<35&&!p.onGround&&p.speed>a.stallSpeed*1.2)warning='LOW ALTITUDE';
  $('flight-warning').hidden=!warning;$('flight-warning').textContent=warning;
  if(coop)$('flight-network').textContent=(team.connected?'● ':'○ ')+Math.round(team.latency||0)+' MS'+(team.isHost?' · LEAD':'');
  drawRadar();processEvents();
}
function processEvents(){if(!sim)return;for(const [i,e] of (sim.events||[]).entries()){const id=e.id??`${sim.time}:${i}:${e.text}`;if(seenEvents.has(id))continue;seenEvents.add(id);if(e.kind)audio.cue(e.kind);if(e.text&&settings.captions&&!['gun','hit'].includes(e.kind)){$('radio-caption').querySelector('p').textContent=e.text;$('radio-caption').hidden=false;lastCaption=performance.now();audio.cue('radio');}}if(seenEvents.size>1000)seenEvents=new Set([...seenEvents].slice(-400));if(performance.now()-lastCaption>6500)$('radio-caption').hidden=true;}
function drawRadar(){
  const c=$('radar'),ctx=c.getContext('2d'),size=c.width,mid=size/2;ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(mid,mid);
  ctx.strokeStyle='rgba(198,222,190,.24)';ctx.lineWidth=1;for(const r of [36,72,109]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(-108,0);ctx.lineTo(108,0);ctx.moveTo(0,-108);ctx.lineTo(0,108);ctx.stroke();
  const p=sim.player,a=aircraftOf(sim.mission),range=a.radar?Math.max(3500,a.cruise*24):2100;
  ctx.fillStyle='#f6edcc';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-5,6);ctx.lineTo(0,3);ctx.lineTo(5,6);ctx.closePath();ctx.fill();
  const pos=t=>{let dx=t.x-p.x,dz=t.z-p.z;return {x:(dx*Math.cos(p.heading)-dz*Math.sin(p.heading))/range*102,y:-(dx*Math.sin(p.heading)+dz*Math.cos(p.heading))/range*102};};
  const point=(t,type)=>{const q=pos(t),len=Math.hypot(q.x,q.y);if(len>104)return;ctx.fillStyle=type==='friend'?'#97d6e2':type==='enemy'?'#f49a78':type==='ground'?'#e8bc75':'#f1dfac';ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();if(type==='waypoint'){ctx.moveTo(q.x,q.y-5);ctx.lineTo(q.x+4,q.y);ctx.lineTo(q.x,q.y+5);ctx.lineTo(q.x-4,q.y);ctx.closePath();ctx.stroke();}else if(type==='ground'){ctx.rect(q.x-3,q.y-3,6,6);ctx.fill();}else{ctx.arc(q.x,q.y,3.5,0,Math.PI*2);ctx.fill();}};
  for(const r of sim.mission.runways||[])point(r,'ground');const wp=sim.navigationTarget||sim.mission.waypoints?.[sim.waypointIndex];if(wp)point(wp,'waypoint');
  if(!a.radar||sim.radarOn){for(const e of sim.enemies||[])if(e.health>0&&e.detected!==false)point(e,e.friendly?'friend':'enemy');for(const t of sim.targets||[])if(t.health>0)point(t,'ground');}
  if(hasImpactMarker()){const q=pos(sim.bombAim);if(Math.hypot(q.x,q.y)<102){ctx.strokeStyle='#d8ffe5';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.moveTo(q.x-9,q.y);ctx.lineTo(q.x+9,q.y);ctx.moveTo(q.x,q.y-9);ctx.lineTo(q.x,q.y+9);ctx.stroke();}}
  for(const r of team.samplePlayers?.()||[])point(r,'friend');
  ctx.fillStyle='#bccfb8';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText((range/1000).toFixed(1)+' KM',0,101);ctx.restore();
}
function updateMarkers(){
  if(!sim||screen!=='flight'){impactMarker.hidden=true;return;}const target=(sim.enemies||[]).find(e=>e.id===sim.targetId&&e.health>0)||(sim.targets||[]).find(t=>t.id===sim.targetId&&t.health>0);const marker=$('target-marker');
  if(target&&target.detected!==false){const q=renderer.project(target.x,target.y,target.z);marker.hidden=!q?.visible;if(q?.visible){marker.style.left=q.x+'px';marker.style.top=q.y+'px';$('target-name').textContent=target.label||target.type||'CONTACT';$('target-distance').textContent=(dist(sim.player,target)/1000).toFixed(1)+' KM';marker.classList.toggle('locked',(sim.lockProgress||0)>=1);}}else marker.hidden=true;
  const wp=sim.navigationTarget||sim.mission.waypoints?.[sim.waypointIndex],ptr=$('waypoint-pointer');if(wp&&settings.guidance!=='minimal'){
    const q=renderer.project(wp.x,wp.y,wp.z),distance=dist(sim.player,wp);ptr.hidden=false;const label=(wp.label||'WAYPOINT')+' · '+(distance/1000).toFixed(1)+' KM';
    if(q?.visible&&q.x>35&&q.x<innerWidth-100&&q.y>120&&q.y<innerHeight-200){ptr.style.left=q.x+'px';ptr.style.top=(q.y-40)+'px';ptr.style.transform='translateX(-50%)';ptr.textContent=label;}
    else{let bearing=Math.atan2(wp.x-sim.player.x,wp.z-sim.player.z)-sim.player.heading;while(bearing>Math.PI)bearing-=Math.PI*2;while(bearing<-Math.PI)bearing+=Math.PI*2;ptr.style.left=bearing>0?'calc(100% - 15px)':'15px';ptr.style.top='45%';ptr.style.transform=bearing>0?'translateX(-100%)':'none';ptr.textContent=bearing>0?label+' →':'← '+label;}
  }else ptr.hidden=true;
  impactMarker.hidden=true;
  if(hasImpactMarker()){
    const aim=sim.bombAim,q=renderer.project(aim.x,aim.y,aim.z);
    const inFront=Number.isFinite(q?.depth)?q.depth>-1&&q.depth<1:q?.visible;
    if(q&&inFront&&Number.isFinite(q.x)&&Number.isFinite(q.y)){
      const top=Math.min(150,innerHeight*.3);let bottom=innerHeight-105;
      for(const selector of ['.flight-actions','.weapon-actions','#flight-hint','#radio-caption']){const el=document.querySelector(selector);if(!el||el.hidden)continue;const r=el.getBoundingClientRect();if(r.top>innerHeight*.35&&q.x>r.left-42&&q.x<r.right+42)bottom=Math.min(bottom,r.top-70);}
      bottom=Math.max(top+45,bottom);
      const onScreen=q.visible&&q.x>40&&q.x<innerWidth-40&&q.y>top&&q.y<bottom;
      const aligned=(sim.targets||[]).some(t=>t.health>0&&!t.friendly&&!t.narrative&&t.type!=='balloon'&&Math.hypot(t.x-aim.x,t.z-aim.z)<(aircraftOf(sim.mission).bombRadius||300)*.65);
      impactMarker.hidden=false;impactMarker.style.left=clamp(q.x,40,innerWidth-40)+'px';impactMarker.style.top=clamp(q.y,top,bottom)+'px';impactMarker.classList.toggle('offscreen',!onScreen);impactMarker.classList.toggle('ready',aligned);
      impactMarker.querySelector('span').textContent=aligned?'IMPACT · ON TARGET':onScreen?'IMPACT':q.y>bottom?'IMPACT ↓':q.y<top?'IMPACT ↑':q.x<40?'← IMPACT':'IMPACT →';
      impactMarker.querySelector('small').textContent=(onScreen?'':'NAV CROSS · ')+Math.max(0,aim.timeToImpact||0).toFixed(1)+'s';
    }
  }
}
function finishFlight(){
  if(endHandled||!sim)return;if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:false});endHandled=true;controls.setActive(false);audio.cue(sim.status==='success'?'success':'warning');const won=sim.status==='success',m=sim.mission,a=aircraftOf(m);const health=number(sim.player.health/(a.health||100)*100),seconds=number(sim.time),minutes=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  if(won&&m.id!=='freeflight'){const previous=progress.completed[m.id];progress.completed[m.id]={score:Math.max(sim.score||0,previous?.score||0),time:sim.time,ending:sim.ending||null};progress.totalTime+=sim.time;if(!saveProgress(progress))toast('This browser could not save your logbook. Keep this tab open.',7500);}
  $('debrief-kicker').textContent=won?'SORTIE LOGGED':'FLIGHT INTERRUPTED';$('debrief-insignia').textContent=won?'✦':'↺';$('debrief-title').textContent=sim.ending==='abort'?'A different way home.':sim.ending==='strike'?'The sky falls silent.':won?'One for the logbook.':'Every pilot learns.';
  $('debrief-description').textContent=sim.endingText||(won?`${m.title} complete. ${sim.score?Math.round(sim.score)+' points earned. ':''}Your next aircraft is waiting.`:sim.objective||sim.hint||'The flight ended before you completed your orders. Try assisted flight, or restart and take it one step at a time.');
  $('debrief-stats').innerHTML=`<span>${minutes}<small>FLIGHT TIME</small></span><span>${health}%<small>AIRFRAME</small></span><span>${won?'✓':number((sim.progress||0)*100)+'%'}<small>OBJECTIVE</small></span>`;
  $('next-mission').hidden=!won||!m.number||m.number>=MISSIONS.length||coop;$('retry-mission').textContent=coop?'Fly again solo':'Fly again';showScreen('debrief');
}

function openSettings(){
  audio.unlock();settingsFromPause=$('pause-dialog').open;resumeAfterSettings=screen==='flight'&&!paused;
  if(resumeAfterSettings){paused=true;controls.setActive(false);audio.setActive(false);if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:true});}
  if(settingsFromPause)$('pause-dialog').close();renderSettings();$('settings-dialog').showModal();
}
function closeSettings(){if($('settings-dialog').open)$('settings-dialog').close();if(settingsFromPause){settingsFromPause=false;$('pause-dialog').showModal();}else if(resumeAfterSettings){resumeAfterSettings=false;resumeFlight();}}
function rangeSetting(key,label,min,max,step=1,suffix='',help=''){return `<div class="setting-row"><label><span class="setting-top"><span>${label}</span><output data-output="${key}">${settings[key]}${suffix}</output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-label="${label}">${help?`<p>${help}</p>`:''}</label></div>`;}
function toggleSetting(key,label,help=''){return `<div class="setting-row"><label class="setting-toggle"><span>${label}</span><input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''} aria-label="${label}"></label>${help?`<p>${help}</p>`:''}</div>`;}
function selectSetting(key,label,opts,help=''){return `<div class="setting-row"><label>${label}<select data-setting="${key}">${opts.map(([v,t])=>`<option value="${v}" ${settings[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>${help?`<p>${help}</p>`:''}</div>`;}
function renderSettings(){
  $$('[data-settings-tab]').forEach(b=>b.classList.toggle('active',b.dataset.settingsTab===settingsTab));let html='';
  if(settingsTab==='controls')html=`<div class="controls-diagram"><span class="mini-stick">FLY</span><p>Left thumb flies.<br>Right thumb looks.<br>Fire stays separate.</p><span class="mini-look">LOOK</span></div>`+rangeSetting('stickSize','Flight stick size',80,152,2,' px')+rangeSetting('buttonSize','Action button size',44,76,2,' px')+rangeSetting('offsetX','Distance from screen edges',12,80,2,' px')+rangeSetting('offsetY','Height above bottom edge',12,90,2,' px')+rangeSetting('sensitivity','Flight sensitivity',.4,1.8,.1,'×')+rangeSetting('lookSensitivity','Look sensitivity',.4,2,.1,'×')+rangeSetting('deadZone','Stick dead zone',0,30,1,'%','A larger quiet centre helps keep your aircraft steady.')+rangeSetting('controlOpacity','Control visibility',35,100,5,'%')+toggleSetting('leftHanded','Swap thumb controls','Move the flight stick to the right and the look pad to the left.')+toggleSetting('invertPitch','Invert vertical flight control','Default: push up to climb. Inverted: pull down to climb.')+toggleSetting('lookPad','Show look-pad outline')+`<div class="keyboard-guide"><kbd>W A S D / ARROWS</kbd><span>Pitch and bank</span><kbd>SHIFT / CTRL</kbd><span>Increase / decrease throttle</span><kbd>Q / E</kbd><span>Rudder and ground steering</span><kbd>ENTER</kbd><span>Next engine-start step</span><kbd>G / F / B / L</kbd><span>Gear / flaps / brake / level recovery</span><kbd>SPACE / T / M</kbd><span>Guns / change target / missile</span><kbd>V / X / R / H</kbd><span>Payload / flares / radar / hover</span><kbd>C / ESC</kbd><span>Camera / pause</span></div>`;
  if(settingsTab==='flight')html=selectSetting('assist','Flight handling',[['assisted','Assisted — forgiving and coordinated'],['standard','Standard — watch your energy'],['expert','Expert — more demanding handling']],'Start assisted. Each aircraft still has its own speed, inertia and stall limits.')+selectSetting('guidance','On-screen guidance',[['guided','Guided — flight orders and useful hints'],['standard','Standard — objectives with hints'],['minimal','Minimal — fewer overlays']])+toggleSetting('autoLevel','Ease wings level when the stick is released','Use LEVEL at any time for a recovery assist.')+selectSetting('units','Instrument units',[['metric','Metric — km/h and metres'],['aviation','Aviation — knots and feet']])+`<div class="setting-row"><p>These are approachable flight models with game-scale distances and simplified aircraft systems. The opening sortie teaches the startup sequence, takeoff, weather and landing.</p></div>`;
  if(settingsTab==='display')html=toggleSetting('sound','Flight audio','Engine, wind, weapons and warning tones. Every essential warning also appears on screen.')+rangeSetting('volume','Master volume',0,100,5,'%')+rangeSetting('engineVolume','Engine & wind',0,100,5,'%')+rangeSetting('effectsVolume','Effects & warnings',0,100,5,'%')+toggleSetting('captions','Radio captions')+toggleSetting('reducedMotion','Reduced motion','Steadier cameras and fewer visual effects.')+toggleSetting('highContrast','High-contrast instruments')+toggleSetting('largeText','Larger flight guidance')+selectSetting('quality','Graphics quality',[['auto','Automatic — balanced for this device'],['low','Low — favour a steadier frame rate'],['high','High — sharper detail']])+selectSetting('camera','Camera',[['chase','Chase — see your aircraft'],['cockpit','Cockpit — pilot view'],['cinematic','Cinematic — a wider following view']])+`<button id="test-audio" class="secondary wide">Test flight audio</button><p class="small-note">On iPhone, sound begins after a tap. Device volume and the browser’s audio output still apply.</p>`;
  if(settingsTab==='display'&&renderer?.backend==='software')html+='<p class=small-note>Simplified 3D graphics are active because this browser could not start hardware graphics.</p>';
  $('settings-content').innerHTML=html;$('settings-content').scrollTop=0;
  $('test-audio')?.addEventListener('click',async()=>{await audio.unlock();audio.setActive(true);audio.cue('success');setTimeout(()=>audio.setActive(screen==='flight'&&!paused),1000);});
}
function updateSettings(){settings=normalizeSettings(settings);applySettings(settings);saveSettings(settings);controls.settings=settings;audio.setSettings(settings);renderer?.setSettings(settings);if(sim)sim.settings=settings;$('sound-button').querySelector('.sound-label').textContent=settings.sound?'Sound on':'Sound off';$('sound-glyph').textContent=settings.sound?'◖':'⊘';$('sound-button').setAttribute('aria-label',settings.sound?'Mute sound':'Enable sound');}

$('continue-button').onclick=()=>openCampaign(MISSIONS.find(m=>!progress.completed[m.id])||MISSIONS[0]);$('campaign-button').onclick=()=>openCampaign();$('home-button').onclick=goHome;$$('[data-home]').forEach(b=>b.onclick=goHome);
$('free-button').onclick=()=>{renderFree();showScreen('free');};$('launch-free').onclick=()=>startMission(buildFreeMission());
$('squadron-button').onclick=()=>{updateRoom();showScreen('squadron');};
$('era-filters').onclick=e=>{const b=e.target.closest('[data-era]');if(b){eraFilter=b.dataset.era;renderCampaign();}};
$('mission-list').onclick=e=>{const b=e.target.closest('[data-mission]');if(b){selectedMission=missionOf(b.dataset.mission);renderCampaign();}};
$('aircraft-list').onclick=e=>{const b=e.target.closest('[data-aircraft]');if(b){selectedAircraft=AIRCRAFT[b.dataset.aircraft];renderFree();}};
$('room-mission').innerHTML=MISSIONS.map(m=>`<option value="${escapeHTML(m.id)}">${String(m.number).padStart(2,'0')} · ${escapeHTML(m.title)}</option>`).join('');
$('create-room').onclick=async()=>{setConnectBusy(true);ready=false;try{await team.create($('callsign').value.trim()||'Pilot',$('room-mission').value);updateRoom();}catch(e){toast(e.message||'Could not create squadron.');}finally{setConnectBusy(false);}};
$('join-room').onclick=async()=>{const code=$('room-code').value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){toast('Enter the six-character squadron code.');return;}setConnectBusy(true);ready=false;try{await team.join(code,$('callsign').value.trim()||'Pilot');updateRoom();}catch(e){toast(e.message||'Could not join squadron.');}finally{setConnectBusy(false);}};
$('ready-room').onclick=()=>{ready=!ready;team.ready(ready);updateRoom();};$('start-room').onclick=()=>team.start($('room-mission').value);$('leave-room').onclick=()=>{team.leave();ready=false;updateRoom();};
$('copy-room').onclick=async()=>{const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('squadron',team.code);try{if(navigator.share&&matchMedia('(pointer:coarse)').matches)await navigator.share({title:'Fly with me · SKYWARD',url:String(url)});else{await navigator.clipboard.writeText(String(url));toast('Invite link copied.');}}catch{toast('Squadron code: '+team.code,7000);}};
$$('[data-open-settings]').forEach(b=>b.onclick=openSettings);$('close-settings').onclick=closeSettings;$('done-settings').onclick=closeSettings;
$$('[data-settings-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.settingsTab;renderSettings();});
$('settings-content').addEventListener('input',e=>{const t=e.target,k=t.dataset.setting;if(!k)return;settings[k]=t.type==='checkbox'?t.checked:t.type==='range'?Number(t.value):t.value;updateSettings();const o=$('settings-content').querySelector(`[data-output="${k}"]`);if(o)o.textContent=settings[k]+(k.includes('Size')||k.startsWith('offset')?' px':k.toLowerCase().includes('sensitivity')?'×':'%');if(k==='sound'&&settings.sound)audio.unlock();});
$('reset-settings').onclick=()=>{settings={...DEFAULTS};updateSettings();renderSettings();toast('Preferences reset. Your logbook is unchanged.');};
$('settings-dialog').addEventListener('cancel',e=>{e.preventDefault();closeSettings();});$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeFlight();});
$('pause-button').onclick=pauseFlight;$('resume-button').onclick=resumeFlight;$('pause-home').onclick=goHome;$('pause-restart').onclick=()=>{if(!sim)return;const m=sim.mission;if(coop){team.leave();coop=false;}startMission(m);};
$('sound-button').onclick=()=>{settings.sound=!settings.sound;updateSettings();audio.unlock();};$('camera-button').onclick=()=>handleAction('camera');$('startup-button').onclick=()=>handleAction('startup');$$('[data-action]').forEach(b=>b.onclick=()=>handleAction(b.dataset.action));
$('dismiss-hint').onclick=()=>{hintDismissed=true;$('flight-hint').hidden=true;};$('abort-finale').onclick=()=>handleAction('abort');
$('retry-mission').onclick=()=>{const m=sim.mission;if(coop){team.leave();coop=false;}startMission(m);};$('next-mission').onclick=()=>{const next=MISSIONS[(sim?.mission.number||1)];if(next)openCampaign(next);else goHome();};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='flight'&&!paused){pauseFlight();}if(!document.hidden){lastFrame=performance.now();accumulator=0;}});
window.addEventListener('resize',()=>{renderer?.resize();});

function frame(now){
  requestAnimationFrame(frame);let dt=clamp((now-lastFrame)/1000,0,.1);lastFrame=now;
  if(!renderer)return;
  if(screen==='flight'&&sim){
    const remote=coop?team.samplePlayers():[];
    const connectionHold=coop&&(team.paused||team.hostStale||!team.connected);
    controls.setActive(!paused&&!remotePaused&&!connectionHold);
    audio.setActive(!paused&&!remotePaused&&!connectionHold);
    if(!paused&&!remotePaused&&!connectionHold&&sim.status==='flying'){
      accumulator+=dt;const input=controls.read(dt);sim.remotePlayers=remote;
      let steps=0;while(accumulator>=1/60&&steps<6){sim.step(1/60,input);accumulator-=1/60;steps++;}
      if(input.fire&&sim.aircraft.gun&&sim.player.ammo>0&&sim.player.gunHeat<1){audio.cue('gun');if(coop&&!team.isHost&&now-lastRemoteFire>110){team.sendAction({name:'fire',targetId:sim.targetId});lastRemoteFire=now;}}
      audio.update(sim,dt);
    }
    if(coop&&team.connected){team.sendPose(sim.player);if(team.isHost&&now-lastWorld>=100){team.sendWorld({...sim.getSnapshot(),teamPaused:paused});lastWorld=now;}}
    renderer.render(sim,dt,{camera:settings.camera,lookX:controls.lookX,lookY:controls.lookY,remotePlayers:remote});updateMarkers();
    if(now-lastHud>90){updateHUD();lastHud=now;}
    if(sim.status!=='flying'&&!endHandled)finishFlight();
  }else if(screen==='debrief'&&sim){if(coop&&team.isHost&&team.connected&&now-lastWorld>=100){team.sendWorld({...sim.getSnapshot(),teamPaused:false});lastWorld=now;}renderer.render(sim,dt,{camera:'cinematic',lookX:0,lookY:0,remotePlayers:[]});}
  else {renderer.renderMenu(now/1000,screen==='free'?selectedAircraft:Object.values(AIRCRAFT)[0]);}
}

try{
  try {renderer=new FlightRenderer($('view'),settings);renderer.backend='webgl';}
  catch(graphicsError){console.warn('WebGL unavailable; using software 3D.',graphicsError.message);const view=$('view'),replacement=view.cloneNode(false);view.replaceWith(replacement);renderer=new SoftwareFlightRenderer(replacement,settings);}
  renderer.resize();updateSettings();refreshHome();showScreen('home');
  const invite=new URL(location.href).searchParams.get('squadron');if(invite){$('room-code').value=invite.slice(0,6).toUpperCase();showScreen('squadron');}
  requestAnimationFrame(frame);
}catch(e){console.error('Skyward renderer startup',e);$('loading').hidden=true;$('render-error').hidden=false;$('render-error-text').textContent='The 3D renderer could not start. Reload this page, or open the link directly in Safari or Chrome. '+(e.message||'');}

// Read-only status for diagnostics and automated smoke checks; no gameplay bypass.
globalThis.SKYWARD={version:VERSION,get status(){return {screen,mission:sim?.mission.id,phase:sim?.phase,status:sim?.status,player:sim?{x:sim.player.x,y:sim.player.y,z:sim.player.z,speed:sim.player.speed,engine:sim.player.engine,onGround:sim.player.onGround,health:sim.player.health}:null,renderer:!!renderer,backend:renderer?.backend,coop,paused,completed:Object.keys(progress.completed).length};}};
