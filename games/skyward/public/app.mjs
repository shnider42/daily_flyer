import {AIRCRAFT,MISSIONS,SPECIAL_MISSIONS,getMission,getAircraft} from './campaign.mjs';
import {FlightSimulation,terrainHeight,terrainClearance} from './sim.mjs';
import {lineOfSight} from './terrain.mjs';
import {createArenaMission,normalizeArenaConfig,prepareMissionStarts,spawnForPlayer,carrierCompatibility} from './arena.mjs';
import {formatRoundTime,scoreboardMarkup,chooseSpectator,spectatorCandidates,aircraftLoadoutNote} from './multiplayer-ui.mjs';
import {FlightRenderer} from './renderer.mjs';
import {SoftwareFlightRenderer} from './software.mjs';
import {SquadronClient} from './network.mjs';
import {FlightControls} from './controls.mjs';
import {GunnerControls} from './gunner-controls.mjs';
import {GUNSHIP_STATIONS,GUNSHIP_AIM_LIMITS,getGunshipStation} from './gunship.mjs';
import {FixedStepClock,FlightPresentation} from './presentation.mjs';
import {BINDING_ACTIONS,DEFAULT_KEY_BINDINGS,GUNNER_BINDING_ACTIONS,DEFAULT_GUNNER_BINDINGS,formatKeyCode,isBindableKey} from './keybindings.mjs';
import {FlightAudio} from './audio.mjs';
import {CombatFeedback} from './combat-feedback.mjs';
import {DEFAULTS,VERSION,loadSettings,saveSettings,loadProgress,saveProgress,applySettings,normalizeSettings} from './settings.mjs';

const $=id=>document.getElementById(id),$$=q=>Array.from(document.querySelectorAll(q));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const setText=(id,value)=>{const el=$(id),text=String(value);if(el.textContent!==text)el.textContent=text;};
const setMarkup=(id,value)=>{const el=$(id);if(el.innerHTML!==value)el.innerHTML=value;};
const touchLayout=matchMedia('(pointer:coarse), (max-width:1000px)');
const isTouchLayout=()=>touchLayout.matches;
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Math.max(0,Math.round(Number.isFinite(n)?n:0));
const dist=(p,q)=>Math.hypot((p.x||0)-(q.x||0),(p.y||0)-(q.y||0),(p.z||0)-(q.z||0));
const impactMarker=document.createElement('div');impactMarker.id='impact-marker';impactMarker.className='impact-marker';impactMarker.hidden=true;impactMarker.setAttribute('aria-hidden','true');impactMarker.innerHTML='<i></i><span>IMPACT</span><small></small>';$('flight-screen').appendChild(impactMarker);
const hasImpactMarker=()=>!!(sim&&sim.player.bombs>0&&!sim.player.onGround&&sim.mission.kind!=='nuclear'&&sim.bombAim&&[sim.bombAim.x,sim.bombAim.y,sim.bombAim.z].every(Number.isFinite));
let settings=loadSettings(),progress=loadProgress();applySettings(settings);
let screen='home',sim=null,renderer=null,paused=false,remotePaused=false,coop=false,settingsTab=isTouchLayout()?'controls':'keyboard',resumeAfterSettings=false,ready=false;
let bindingCapture=null,settingsSaved=true,crewRole=null,lastCrewSnapshot=0;
let scoreboardOpen=false,spectatedId=null,spectatorView=null,lastLifeId=0,lastCrashNotice=0,activeStart=null;
let lobbyAircraft='f16',lobbyStart='airborne';
const isCrewFlight=()=>coop&&sim?.mission.kind==='gunship';
const isGunner=()=>isCrewFlight()&&crewRole==='gunner';
const isArenaFlight=()=>coop&&['freeflight','dogfight'].includes(activeStart?.mode||team.mode);
const isSpectating=()=>!!(coop&&!isCrewFlight()&&sim&&(sim.localParticipant?.alive===false||sim.player.crashed||sim.player.health<=0));
const participantList=()=>typeof sim?.participants?.values==='function'?[...sim.participants.values()]:Array.isArray(sim?.participants)?sim.participants:[];
const sharedWorldPaused=()=>!!(coop&&team.isHost&&paused&&!isArenaFlight()&&!isSpectating());
const currentAircraft=()=>sim?.aircraft||aircraftOf(sim?.mission||selectedMission);
const instrumentPlayer=()=>isSpectating()&&spectatorView?spectatorView:sim.player;
let selectedMission=MISSIONS.find(m=>m.id===progress.lastMission)||MISSIONS[0],selectedAircraft=Object.values(AIRCRAFT)[0],eraFilter='all';
let lastFrame=performance.now(),lastRoundFrame=performance.now(),lastHud=0,lastWorld=0,lastRemoteFire=0,lastCaption=0,toastTimeout=null,hintDismissed=false;
const flightClock=new FixedStepClock(),presentation=new FlightPresentation();
let renderView=null,markerBounds=[],markerBoundsDirty=true;
const frameStats={fps:0,renderMs:0,frames:0,elapsed:0,work:0,lastFlightFps:0};
let crewShotsSeen={},seenEvents=new Set(),lastStatus='flying',endHandled=false,settingsFromPause=false;
const audio=new FlightAudio(settings);
const combatFeedback=new CombatFeedback();
let destructionAt=null,audioPreviewUntil=0;

function paintCombatFeedback(state){
  const active=screen==='flight'&&state;
  $('combat-feedback').hidden=!active;
  $('hit-vignette').style.opacity=active?state.hit:0;
  $('blast-wash').style.opacity=active?state.blast:0;
  $('damage-bearing').hidden=!active||!state.bearing;
  $('damage-bearing').style.transform=`translate(-50%,-50%) rotate(${active?state.angle:0}deg)`;
  $('damage-notice').hidden=!active||!state.visible;
  if(active&&state.visible){setText('damage-title',state.title);setText('damage-detail',state.detail);}
  $('hud-health').classList.toggle('taking-damage',!!(active&&state.hit>.08));
  $('hud-health').classList.toggle('critical-damage',!!(active&&state.critical));
}

function toast(text,ms=3400){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,ms);}
function showScreen(name){screen=name;document.body.dataset.screen=name;$$('.screen[data-screen]').forEach(el=>el.hidden=el.dataset.screen!==name);$('main-header').hidden=name==='flight'||name==='debrief';$('loading').hidden=true;if(name!=='flight'){impactMarker.hidden=true;paintCombatFeedback(null);setAircraftTray(false);setScoreboard(false);}setFlightInputs(name==='flight'&&!paused&&!remotePaused);audio.setActive(name==='flight'&&!paused&&!remotePaused);window.scrollTo(0,0);}
function refreshHome(){const complete=Object.keys(progress.completed).length;const next=MISSIONS.find(m=>!progress.completed[m.id])||MISSIONS[0];$('continue-button').innerHTML=(complete?'Continue your logbook':'Begin your logbook')+' <span>→</span>';$('continue-note').textContent=complete?`${complete} of ${MISSIONS.length} sorties logged. Next: ${next.title}.`:'Your first aircraft is waiting on the runway.';}
function goHome(){stopGunnerFire();coop=false;team.leave();closeDialogs();paused=remotePaused=false;crewRole=null;sim=null;activeStart=null;spectatedId=spectatorView=null;endHandled=false;syncCrewUI();refreshHome();showScreen('home');}
function closeDialogs(){cancelBindingCapture();setAircraftTray(false);settingsFromPause=resumeAfterSettings=false;for(const d of [$('pause-dialog'),$('settings-dialog')])if(d.open)d.close();}
function setAircraftTray(open){
  const expanded=Boolean(open&&screen==='flight'&&!paused&&!remotePaused);
  $('flight-screen').classList.toggle('aircraft-controls-open',expanded);
  $('aircraft-controls-toggle')?.setAttribute('aria-expanded',String(expanded));
  markerBoundsDirty=true;
}
function aircraftOf(m){return getAircraft?.(m.aircraft)||AIRCRAFT[m.aircraft]||Object.values(AIRCRAFT)[0];}
function missionOf(id){return getMission?.(id)||MISSIONS.find(m=>m.id===id)||MISSIONS[0];}

const controls=new FlightControls({stick:$('flight-stick'),knob:$('stick-knob'),yawStick:$('yaw-thrust-stick'),yawKnob:$('yaw-thrust-knob'),fire:$('fire-button'),throttle:$('throttle'),settings,onAction:handleAction,onPause:pauseFlight,onAnyGesture:()=>audio.unlock()});
const gunnerControls=new GunnerControls({surface:$('gunner-aim-surface'),pad:$('gunner-aim-pad'),knob:$('gunner-aim-knob'),fire:$('gunner-fire'),settings,onPause:pauseFlight,onAnyGesture:()=>audio.unlock(),onRelease:releaseGunnerFire,onCancel:stopGunnerFire,onPress(){if(screen==='flight'&&isGunner()&&team.connected&&!paused&&!remotePaused)team.sendCrewInput(gunnerControls.read(0));},onAction(name){
  if(name==='target')selectCrewTarget();
  if(sim)updateCrewHUD();
}});
function setFlightInputs(active){active=!!active&&screen==='flight'&&sim?.status==='flying'&&!isSpectating()&&!scoreboardOpen;controls.setActive(active&&!isGunner());gunnerControls.setActive(active&&isGunner());}
function releaseGunnerFire(){if(isGunner()&&team.connected)team.sendCrewInput({...gunnerControls.read(0),fire:false});}
function stopGunnerFire(){if(!isCrewFlight())return;if(team.isHost&&sim?.crew)sim.applyCrewInput({...sim.crew,fire:false},sim.crew.gunnerId,{reset:true});else if(team.connected)team.sendCrewInput({...gunnerControls.read(0),fire:false},{reset:true});}
function selectCrewTarget(){
  if(!sim)return;const targets=sim.targets.filter(t=>t.health>0&&!t.friendly&&!t.narrative);if(!targets.length)return;
  sim.targetId=targets[(targets.findIndex(t=>t.id===sim.targetId)+1)%targets.length].id;
}
function syncCrewUI(){
  $('flight-screen').dataset.crewRole=isCrewFlight()?crewRole:'';
  $('gunner-interface').hidden=!isGunner();$('crew-status').hidden=!isCrewFlight();
  $('camera-button').hidden=isGunner();
}
const team=new SquadronClient({
  onStatus(status,message){$('network-status').textContent=message||status;const offline=['error','disconnected','closed','failed'].includes(status);if(offline&&coop&&screen==='flight')toast(message||'Squadron connection interrupted.');if(status==='error'){setConnectBusy(false);toast(message||'Could not connect.');}updateRoom();},
  onRoster(roster){const self=roster.find(p=>p.id===team.id);if(self){ready=!!self.ready;if(self.aircraft)lobbyAircraft=self.aircraft;if(self.startMode)lobbyStart=self.startMode;}sim?.updateRoster?.(roster);updateRoom(roster);setConnectBusy(false);},
  onStart(data){closeDialogs();coop=true;const self=(data.players||team.roster||[]).find(p=>p.id===team.id);const mission=['freeflight','dogfight'].includes(data.mode)?createArenaMission(data.config||{mode:data.mode,mapId:data.missionId==='arena-islands'?'islands':'canyon'},self?.aircraft||'f16'):missionOf(data.missionId);startMission(mission,{cooperative:true,role:data.mode==='crew'?data.role:null,startData:data});},
  onLobby(){stopGunnerFire();closeDialogs();sim=null;activeStart=null;paused=remotePaused=false;crewRole=null;spectatorView=null;syncCrewUI();updateRoom();showScreen('squadron');},
  onWorld(snapshot){
    if(!coop||team.isHost||!sim)return;
    if(isGunner())presentation.capture(sim);
    sim.applySnapshot(snapshot);lastCrewSnapshot=performance.now();syncLifeState();
    const was=remotePaused;remotePaused=!!snapshot.teamPaused;
    if(remotePaused!==was){setFlightInputs(!paused&&!remotePaused);audio.setActive(screen==='flight'&&!paused&&!remotePaused);toast(remotePaused?'Pilot paused the sortie.':'Pilot resumed.',remotePaused?5000:3400);}
  },
  onCrewInput(data){if(isCrewFlight()&&team.isHost&&sim&&(data.reset||(!paused&&!remotePaused)))sim.applyCrewInput(data.input,data.playerId,{reset:!!data.reset});},
  onAction(data){if(!coop||!team.isHost||!sim)return;sim.applyRemoteAction?.(data.action,{...data.player,id:data.playerId,playerId:data.playerId},data);if(['respawn','crash'].includes(typeof data.action==='string'?data.action:data.action?.name))team.sendWorld({...sim.getSnapshot(),teamPaused:sharedWorldPaused()});},
  onEnd(message){
    if(!coop)return;const crew=isCrewFlight(),arena=isArenaFlight();stopGunnerFire();coop=false;remotePaused=false;crewRole=null;
    if(crew||arena||sim?.participants?.size){closeDialogs();sim=null;activeStart=null;paused=false;syncCrewUI();updateRoom();showScreen('squadron');}
    else if(screen==='flight'){closeDialogs();sim.worldAuthority=true;paused=true;setFlightInputs(false);audio.setActive(false);$('pause-note').textContent=(message||'The squadron sortie ended.')+' You can continue solo or restart the sortie.';if(!$('pause-dialog').open)$('pause-dialog').showModal();}
    else updateRoom();toast(message||'Squadron closed.',5000);
  }
});

function setConnectBusy(busy){$('create-room').disabled=busy;$('join-room').disabled=busy;}
function roomConfig(){return normalizeArenaConfig({mode:$('room-mode').value||'dogfight',mapId:$('room-map').value||'canyon',durationSeconds:Number($('room-duration').value)||600,lives:Number($('room-lives').value)||3});}
function roomMissionId(config=roomConfig()){return config.mode==='crew'?'gunship-nightwatch':['dogfight','freeflight'].includes(config.mode)?'arena-'+config.mapId:$('room-mission').value;}
function roomMission(config=roomConfig()){return ['dogfight','freeflight'].includes(config.mode)?createArenaMission(config,lobbyAircraft):missionOf(roomMissionId(config));}
function syncRoomConfiguration(){
  if(team.code&&team.config){const c=team.config;$('room-mode').value=team.mode||c.mode;$('room-map').value=c.mapId;$('room-duration').value=String(c.durationSeconds);$('room-lives').value=String(c.lives);if(team.mode==='squadron')$('room-mission').value=team.missionId;}
  else if(team.code&&team.mode==='crew')$('room-mode').value='crew';
  const editable=!team.code||team.isHost&&team.roomState==='lobby';
  for(const id of ['room-mode','room-map','room-duration','room-lives','room-mission'])$(id).disabled=!editable;
  const loadoutEditable=!team.code||team.roomState==='lobby';
  $('room-aircraft').disabled=$('room-start').disabled=!loadoutEditable;
  $('room-aircraft').value=lobbyAircraft;$('room-start').value=lobbyStart;
  $('room-config-note').textContent=team.code&&team.roomState!=='lobby'?'Your flight lead can regroup everyone in this room to change aircraft and the flight plan.':team.code&&!team.isHost?'Your flight lead sets the flight plan. Choose your aircraft below.':'The flight lead sets the mission. Everyone chooses their own aircraft.';
  previewRoomMission();
}
function updateRoom(roster=team.roster||[]){
  const joined=!!team.code;$('squadron-connect').hidden=joined;$('squadron-room').hidden=!joined;syncRoomConfiguration();if(!joined)return;
  const crew=team.mode==='crew',arena=['dogfight','freeflight'].includes(team.mode),mission=roomMission(team.config||roomConfig());
  $('room-code-display').textContent=team.code;
  $('room-role').textContent=crew?(team.isHost?'You are the pilot. Invite one gunner, then launch when they are ready.':'You are the gunner. Mark yourself ready to board the shared AC-130.'):(team.isHost?'You are flight lead. Each pilot chooses an aircraft and starting point. Launch when everyone is ready.':'Choose your aircraft and starting point, then mark yourself ready.');
  $('room-brief').innerHTML='<strong>'+escapeHTML(mission.title)+'</strong><p>'+escapeHTML(crew?'Two crew · one AC-130. Pilot: keep targets on the left. Gunner: switch first-person stations, aim and fire.':team.mode==='dogfight'?`${(team.config?.durationSeconds||600)/60} minute dogfight · unlimited respawns · kills / deaths / K/D. Terrain blocks radar tracks and missiles.`:team.mode==='freeflight'?'No timer. No player damage. Explore together in any aircraft, with unlimited replacement aircraft.':`${team.config?.lives||3} lives per pilot. When your lives run out, watch a wingmate continue the mission.`)+'</p>';
  $('roster').innerHTML=roster.map((p,i)=>`<div class="roster-person"><strong>${String(i+1).padStart(2,'0')} &nbsp; ${escapeHTML(p.name||'Pilot')}${p.id===team.id?' · YOU':''}<span class="crew-seat-label">${crew?(p.role==='gunner'?'GUNNER · 25 / 40 / 105 MM':'PILOT · FLIGHT CONTROLS'):escapeHTML(getAircraft(p.aircraft||mission.aircraft).name)+' · '+escapeHTML(p.startMode==='carrier'?'CARRIER':p.startMode==='runway'?'RUNWAY':'AIRBORNE')}</span></strong><small>${p.connected===false?'Reconnecting':p.ready?'✓ Ready':'Preparing'}</small></div>`).join('');
  $('start-room').hidden=!team.isHost;$('start-room').textContent=crew?'Launch AC-130 crew →':team.mode==='dogfight'?'Start dogfight →':team.mode==='freeflight'?'Open the sky →':'Launch squadron →';
  $('start-room').disabled=roster.length<2||roster.some(p=>!p.ready||p.connected===false);
  $('ready-room').hidden=team.isHost;$('ready-room').disabled=team.roomState!=='lobby';$('ready-room').textContent=ready?'✓ Ready · tap to stand down':crew?'Ready for the gunner seat':'Ready to fly';
  if(isCrewFlight())updateCrewHUD();
}
function previewRoomMission(){
  const c=roomConfig(),crew=c.mode==='crew',arena=['dogfight','freeflight'].includes(c.mode),mission=roomMission(c),a=getAircraft($('room-aircraft').value||lobbyAircraft);
  $('room-map-field').hidden=!arena;$('room-duration-field').hidden=c.mode!=='dogfight';$('room-lives-field').hidden=c.mode!=='squadron';$('room-mission-field').hidden=c.mode!=='squadron';$('room-loadout').hidden=crew;$('room-crew-note').hidden=!crew;
  $('room-mission-preview').textContent=crew?'Nightwatch Basin · one shared AC-130, eight ground objectives.':c.mode==='dogfight'?(c.mapId==='canyon'?'Deep ravines, steep ridges and branching valleys. Duck behind solid terrain to break a radar track; incoming missiles can strike the rock.':'Open water, mountainous islands and a carrier. Room for fast turns and long pursuits.')+' Every aircraft keeps its own flight performance and weapons.':c.mode==='freeflight'?'No timer and no player damage. Fly the same landscape together, from canvas wings to modern jets.':mission.description+' Lives are per pilot; the sortie continues after the flight lead loses an aircraft.';
  $('room-aircraft-note').textContent=aircraftLoadoutNote(a,c.mode,mission);
  updateCarrierWarning('room-carrier-warning',a,$('room-start').value==='carrier',mission);
}
function updateCarrierWarning(id,aircraft,visible,mission=null){
  const el=$(id);el.hidden=!visible;if(!visible)return;const carrier=mission?prepareMissionStarts(mission,[{startMode:'carrier'}]).runways.find(r=>r.carrier):undefined;const risk=carrierCompatibility(aircraft,carrier);el.dataset.risk=risk.level;el.textContent=risk.label+'. '+risk.warning;
}
function submitRoomConfiguration(){
  previewRoomMission();if(!team.code||!team.isHost)return;const c=roomConfig();team.configure({...c,missionId:roomMissionId(c)});
}
function setScoreboard(open){
  scoreboardOpen=!!open&&screen==='flight'&&coop&&!isCrewFlight();$('scoreboard-panel').hidden=!scoreboardOpen;$('scoreboard-button').setAttribute('aria-expanded',String(scoreboardOpen));
  if(scoreboardOpen){controls.clear();updateMultiplayerHUD();}setFlightInputs(screen==='flight'&&!paused&&!remotePaused);
}
function syncLifeState(){
  if(!sim||!coop||isCrewFlight())return;
  const life=sim.player.lifeId||1;
  if(life!==lastLifeId){lastLifeId=life;controls.clear();controls.setThrottle(sim.player.throttle||0);presentation.reset(sim);spectatedId=spectatorView=null;lastCrashNotice=0;}
}
function spectatorPose(remote=[]){
  if(!isSpectating()){spectatorView=null;return null;}
  const person=chooseSpectator(participantList(),team.id,spectatedId);spectatedId=person?.id||null;
  spectatorView=person?{...(remote.find(p=>p.id===person.id)||person.pose||person.spawn),id:person.id,aircraft:person.aircraft,health:person.health,alive:true}:null;
  return spectatorView;
}
function cycleSpectator(step){const person=chooseSpectator(participantList(),team.id,spectatedId,step);spectatedId=person?.id||null;spectatorPose(team.samplePlayers());updateMultiplayerHUD();}
function updateMultiplayerHUD(){
  const active=coop&&!isCrewFlight(),dead=active&&isSpectating(),self=sim?.localParticipant;
  $('flight-screen').dataset.multiplayer=String(active);$('flight-screen').classList.toggle('spectating',dead);
  if(sim)setText('flight-aircraft',(dead&&spectatorView?getAircraft(spectatorView.aircraft).name+' · SPECTATING':currentAircraft().name).toUpperCase());
  $('scoreboard-button').hidden=!active;$('round-readout').hidden=!active;$('spectator-panel').hidden=!dead;
  if(!active){$('scoreboard-panel').hidden=true;return;}
  const pilots=participantList(),dogfight=team.mode==='dogfight';
  setText('round-mode',dogfight?'DOGFIGHT':team.mode==='freeflight'?'FREE FLIGHT':'LIVES');
  setText('round-clock',dogfight?formatRoundTime(sim.round?.remaining??team.config?.durationSeconds??600):team.mode==='freeflight'?'OPEN SKY':String(self?.livesRemaining??team.config?.lives??3));
  setText('round-personal-score',number(self?.kills)+' K / '+number(self?.deaths)+' D');
  $('round-readout').dataset.ending=String(dogfight&&(sim.round?.remaining??Infinity)<=60);
  if(scoreboardOpen){setText('scoreboard-title',dogfight?'Live standings':'Squadron log');setMarkup('scoreboard-table',scoreboardMarkup(pilots,team.id));setText('scoreboard-note',team.mode==='squadron'?'Mission kills count hostile aircraft. Ground objectives add team mission points. K/D is kills ÷ deaths; — means no deaths yet.':'Ranked by kills, then fewer deaths. K/D is kills ÷ deaths; — means no deaths yet.');}
  if(dead){
    const available=self?.livesRemaining===null||(self?.livesRemaining||0)>0,wait=Math.max(0,(self?.respawnAt||0)-sim.time),confirmed=self?.alive===false;
    const person=pilots.find(p=>p.id===spectatedId),watchable=spectatorCandidates(pilots,team.id);
    setText('spectator-status',available?'AIRCRAFT LOST':'NO LIVES REMAINING');setText('spectator-title',available?'Take another flight.':'Stay with your squadron.');
    setText('spectator-note',!confirmed?'Confirming your aircraft loss with the flight lead…':available?self?.livesRemaining===null?'Your score stays with you. Choose when to return in a fresh aircraft.':`${self.livesRemaining} ${self.livesRemaining===1?'life':'lives'} remaining. Your squadron keeps flying while you regroup.`:'Your wingmates can finish the mission. Watch any surviving pilot; the shared world keeps running.');
    setText('spectator-name',person?.name||'Waiting for a pilot');setText('spectator-aircraft',person?getAircraft(person.aircraft).name:'No surviving aircraft in view');
    $('spectate-previous').disabled=$('spectate-next').disabled=watchable.length<2;
    $('respawn-button').hidden=!available;$('respawn-button').disabled=!confirmed||wait>0||sim.status!=='flying';
    setText('respawn-button',!confirmed?'Awaiting flight lead':wait>0?'Fresh aircraft in '+Math.ceil(wait)+'s':'Return to the sky →');
  }
}
function respawnLocal(){
  if(!isSpectating()||!sim||sim.status!=='flying')return;
  if(team.isHost){sim.requestRespawn(team.id);syncLifeState();team.sendWorld({...sim.getSnapshot(),teamPaused:sharedWorldPaused()});}
  else team.sendAction({name:'respawn',lifeId:sim.player.lifeId});
  updateMultiplayerHUD();
}


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
function renderFree(){const list=Object.values(AIRCRAFT);$('aircraft-list').innerHTML=list.map(a=>`<button class="aircraft-card ${a.id===selectedAircraft.id?'selected':''}" data-aircraft="${escapeHTML(a.id)}" aria-pressed="${a.id===selectedAircraft.id}"><small>${escapeHTML(a.era||a.role||'FLIGHT COLLECTION')}</small><strong>${escapeHTML(a.name)}</strong><span>${escapeHTML(a.role||a.summary?.split('.')[0]||'Aircraft')}</span></button>`).join('');$('free-aircraft-name').textContent=selectedAircraft.name;$('free-aircraft-summary').textContent=selectedAircraft.summary||'Get familiar with the aircraft, and bring it home.';updateCarrierWarning('free-carrier-warning',selectedAircraft,$('free-start').value==='carrier',$('free-start').value==='carrier'?buildFreeMission():null);}
function buildFreeMission(){
  const a=selectedAircraft,base=MISSIONS.find(m=>m.aircraft===a.id)||MISSIONS[0],startMode=$('free-start').value,biome=$('free-biome').value,w=$('free-weather').value;
  let m=biome==='canyon'?createArenaMission({mode:'freeflight',mapId:'canyon'},a.id):{...structuredClone(base),id:'freeflight',number:0,title:'Open Sky',year:'FREE FLIGHT',location:'Your own horizon',aircraft:a.id,kind:'free',biome,description:'Get to know your aircraft. Fly anywhere, then return to the runway when you feel ready.',briefing:['Explore the landscape.','Practise takeoff, turns and landings.'],lesson:'No timer. No enemies. Just your aircraft.',enemies:[],targets:[],waypoints:[],goal:{},runways:[{x:0,z:0,y:4,length:1600,width:90,heading:0,label:'HOME',carrier:false}],start:{x:0,y:450,z:-1700,heading:0,speed:a.cruise,airborne:true}};
  m.weather={wind:{x:w==='cloudy'?9:2,z:0},cloudBase:w==='cloudy'?480:biome==='canyon'?2800:1400,cloudTop:w==='cloudy'?1100:biome==='canyon'?3800:1900,fog:w==='cloudy'?.00022:.000045,timeOfDay:w==='night'?'night':w==='sunset'?'dusk':'day'};
  m=prepareMissionStarts(m,[{startMode}]);m.start=spawnForPlayer(m,a.id,0,startMode);m.start.cold=startMode==='runway';return m;
}

function startMission(m,{cooperative=false,role=null,startData=null}={}){
  if(!cooperative){coop=false;team.leave();}
  const players=startData?.players||team.roster||[],self=players.find(p=>p.id===team.id);
  if(cooperative&&m.kind!=='gunship'){m=prepareMissionStarts(m,players);m.aircraft=self?.aircraft||m.aircraft;}
  audio.unlock();closeDialogs();coop=cooperative;activeStart=cooperative?startData:null;crewRole=cooperative&&m.kind==='gunship'?(role||team.role):null;paused=remotePaused=false;endHandled=false;hintDismissed=false;crewShotsSeen={};seenEvents.clear();lastStatus='flying';flightClock.reset();lastWorld=0;scoreboardOpen=false;spectatedId=spectatorView=null;lastCrashNotice=0;
  sim=new FlightSimulation(m,{...settings,playerId:cooperative?team.id:'local'});
  sim.player.id=cooperative?team.id:'local';sim.worldAuthority=!cooperative||team.isHost;
  if(coop&&!isCrewFlight()&&startData)sim.configureMultiplayer({...startData,players,playerId:team.id,hostId:startData.hostId||team.hostId});
  else if(coop&&!isCrewFlight()){const slot=Math.max(0,players.findIndex(p=>p.id===team.id));if(sim.player.onGround){sim.player.x+=(slot%2?1:-1)*Math.ceil(slot/2)*8;sim.player.z+=slot*14;}else{sim.player.x+=(slot%2?1:-1)*slot*23;sim.player.z-=slot*36;}}
  m=sim.mission;lastLifeId=sim.player.lifeId||1;destructionAt=null;combatFeedback.reset(sim);paintCombatFeedback(null);
  presentation.reset(sim);renderView=presentation.sample(1);markerBoundsDirty=true;lastCrewSnapshot=performance.now();gunnerControls.reset();syncCrewUI();
  if(isCrewFlight())sim.targetId=sim.targets.find(t=>t.health>0&&!t.friendly)?.id||null;
  renderer.loadMission(m,currentAircraft());controls.settings=settings;controls.setThrottle(sim.player.throttle||0);controls.lookX=controls.lookY=0;
  $('flight-mission-number').textContent=m.kind==='gunship'?'CREW':team.mode==='dogfight'&&coop?'VS':m.number?String(m.number).padStart(2,'0')+' / '+MISSIONS.length:'FREE';$('flight-title').textContent=m.title.toUpperCase();$('flight-aircraft').textContent=currentAircraft().name.toUpperCase();$('radio-caption').hidden=true;$('flight-warning').hidden=true;$('flight-network').hidden=!coop;
  if(m.number){progress.lastMission=m.id;saveProgress(progress);}
  showScreen('flight');updateHUD();
  if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:false});
  lastFrame=lastRoundFrame=performance.now();frameStats.frames=frameStats.elapsed=frameStats.work=frameStats.lastFlightFps=0;
  if(window.matchMedia('(pointer:coarse)').matches&&innerHeight>innerWidth)toast('Portrait works. Turn sideways for a wider view.',4000);
}

function handleAction(name){
  if(isGunner()){if(name==='target')selectCrewTarget();return;}
  if(name==='camera'){settings.camera=settings.camera==='chase'?'cockpit':settings.camera==='cockpit'?'cinematic':'chase';saveSettings(settings);toast(settings.camera==='chase'?'Chase camera':settings.camera==='cockpit'?'Cockpit view':'Cinematic view');return;}
  if(!sim||isSpectating()||scoreboardOpen||paused||remotePaused||(coop&&(!team.connected||team.paused||(!team.isHost&&team.hostStale))))return;
  if(coop&&!team.isHost&&sim.mission.kind==='nuclear'&&['payload','abort'].includes(name)){toast('The flight lead makes the final decision for the squadron.');return;}
  audio.unlock();setAircraftTray(false);const weapon=['missile','payload','countermeasure'].includes(name);
  if(coop&&!team.isHost&&weapon){const targetId=sim.targetId;const result=sim.action(name);if(result)team.sendAction({name,targetId});if(result?.message)toast(result.message);}
  else {const result=sim.action(name);if(result?.message)toast(result.message);}
  if(name==='startup'){audio.cue('click');if(sim.player.engine){controls.setThrottle(Math.max(controls.throttleValue,.12));if(isTouchLayout()){setAircraftTray(true);toast('Engine running. Tap BRAKE to release the wheels, then add thrust.',5500);}else toast('Engine running. Release the brake, then add throttle.');}}
  if(name==='hover')controls.setThrottle(sim.player.throttle);
  if(name==='level')toast('Level recovery engaged.');if(name==='countermeasure')audio.cue('missile');updateHUD();
}
function pauseFlight(){
  if(screen!=='flight'||!sim)return;setScoreboard(false);stopGunnerFire();paused=true;setAircraftTray(false);setFlightInputs(false);audio.setActive(false);
  $('pause-note').textContent=isArenaFlight()?'The round keeps running while this menu is open. Your aircraft continues on its current course.':isSpectating()?'Your squadron keeps flying while you spectate or change settings.':isCrewFlight()?(team.isHost?'The shared aircraft and mission are paused for both crew members.':'Your guns are safe. Your pilot continues flying the shared aircraft.'):coop?(team.isHost?'The squadron mission is paused while you are here.':'Your aircraft is holding. The squadron mission continues.'):'Your flight is paused.';
  $('pause-restart').textContent=coop?(team.isHost?'Restart with squadron':'Return to squadron room'):'Restart sortie';
  $('pause-restart').hidden=coop&&!team.isHost&&!isCrewFlight()&&sim.status==='flying';$('pause-room').hidden=!coop||!team.isHost;
  if(!$('pause-dialog').open)$('pause-dialog').showModal();if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:sharedWorldPaused()});
}
function resumeFlight(){if($('pause-dialog').open)$('pause-dialog').close();paused=false;setFlightInputs(screen==='flight'&&!remotePaused);audio.unlock();audio.setActive(screen==='flight'&&!remotePaused);lastFrame=performance.now();flightClock.reset();if(sim)presentation.reset(sim);}


const startupCopy=[['Fuel on.','Open the fuel valve so the engine has something to run on.','Open fuel valve'],['Ignition ready.','Switch on the magnetos. They provide the spark.','Switch on magnetos'],['A little encouragement.','Prime the engine before turning the propeller.','Prime the engine'],['Bring it to life.','Turn the propeller. Listen as the engine catches.','Start the engine']];
function updateHUD(){
  if(!sim||screen!=='flight')return;const p=instrumentPlayer(),m=sim.mission,a=isSpectating()&&spectatorView?getAircraft(spectatorView.aircraft):currentAircraft(),aviation=settings.units==='aviation';
  const clearance=terrainClearance(p,m),alt=Math.max(0,clearance.agl);
  const danger=!p.onGround&&clearance.pullUp,caution=!p.onGround&&alt<Math.max(70,p.speed*.7);
  document.querySelector('.instrument.altitude').dataset.clearance=danger?'danger':caution?'caution':'clear';$('clearance-fill').style.width=clamp(alt/250*100,0,100)+'%';setText('terrain-clearance-label',danger?'TERRAIN AHEAD':isSpectating()?'WATCHED PILOT AGL':'GROUND CLEARANCE');
  setText('hud-speed',number(p.speed*(aviation?1.94384:3.6)));setText('speed-unit',aviation?'KNOTS':'KM/H');setText('hud-altitude',number(alt*(aviation?3.28084:1)));setText('altitude-unit',aviation?'FEET AGL':'METRES AGL');
  const deg=((-p.heading*180/Math.PI)%360+360)%360;setMarkup('hud-heading',String(Math.round(deg)%360).padStart(3,'0')+'<span>°</span>');setText('hud-compass',['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8]);
  const wind=typeof m.weather?.wind==='number'?m.weather.wind:Math.hypot(m.weather?.wind?.x||0,m.weather?.wind?.z||0);setText('hud-wind','WIND '+number(wind*1.944)+' KT →');
  setText('objective-text',sim.objective||'Follow your flight orders');const percent=number((sim.progress||0)*100);setText('mission-progress',m.kind==='free'?'FREE':percent+'%');$('objective-progress').style.width=clamp(percent,0,100)+'%';setText('objective-label',sim.phase?String(sim.phase).replace(/_/g,' ').toUpperCase():'FLIGHT ORDERS');
  setMarkup('hud-health','AIRFRAME <b>'+number(p.health/(a.health||100)*100)+'%</b>');setMarkup('hud-fuel','FUEL <b>'+number(p.fuel)+'%</b>');
  setText('hud-stores',a.gun?'GUN '+number(p.ammo)+(p.missiles?' · MSL '+p.missiles:'')+(p.bombs?' · BMB '+p.bombs:''):p.troopers?'TROOPS '+p.troopers:p.bombs?'PAYLOAD '+p.bombs:'UNARMED');
  setText('throttle-output',number(controls.throttleValue*100)+'%');setText('touch-throttle-output',number(controls.throttleValue*100)+'%');$('touch-throttle-fill').style.width=number(controls.throttleValue*100)+'%';setText('gear-state',a.fixedGear?'FIXED':p.gear?'DOWN':'UP');document.querySelector('[data-action=gear]').disabled=!!a.fixedGear;setText('flaps-state',p.flaps?'DOWN':'UP');document.querySelector('[data-action=flaps]').hidden=a.hasFlaps===false;setText('brake-state',p.brake?'ON':'OFF');setText('hover-state',p.hover?'ON':'OFF');
  for(const [act,state] of [['gear',p.gear],['flaps',p.flaps],['brake',p.brake],['hover',p.hover]])$$(`[data-action="${act}"]`).forEach(b=>b.classList.toggle('active',!!state));
  $('hover-action').hidden=!a.vtol;$('fire-button').hidden=!a.gun;$('missile-action').hidden=!a.missiles;$('payload-action').hidden=!(a.bombs||p.troopers||m.kind==='drop'||m.kind==='nuclear');$('countermeasure-action').hidden=!(a.missiles||a.radar);$('radar-action').hidden=!a.radar;
  $('weapon-actions').hidden=!(a.gun||a.bombs||a.missiles||p.troopers);$('crosshair').hidden=!(a.gun||a.missiles);
  const lock=sim.lockProgress||0;setText('lock-state',lock>=1?'LOCKED':lock>0?'LOCKING '+number(lock*100)+'%':sim.lockReason==='Terrain masks the contact'?'TERRAIN MASKED':'NO LOCK');$('missile-action').classList.toggle('ready',lock>=1);setText('radar-state',sim.radarOn?'ON':'OFF');setText('radar-label',a.radar?(sim.radarOn?'RADAR · CONTACTS':'RADAR SILENT'):'NAVIGATION');
  setText('payload-state',p.troopers?'PARATROOPERS':m.kind==='nuclear'?'FINAL RELEASE':'BOMB');
  $('abort-finale').hidden=m.kind!=='nuclear'||sim.status!=='flying'||(coop&&!team.isHost);
  $('startup-panel').hidden=!!p.engine||!p.onGround||m.start?.airborne;const step=clamp(p.startupStep||0,0,3),copy=startupCopy[step];setText('startup-title',copy[0]);setText('startup-hint',copy[1]);setMarkup('startup-button',copy[2]+' <span>→</span>');Array.from($('startup-steps').children).forEach((e,i)=>{e.classList.toggle('done',i<step);e.classList.toggle('current',i===step);});
  const hint=flightHint(sim.hint);setText('hint-text',hint);$('flight-hint').hidden=hintDismissed||settings.guidance==='minimal'||(!p.engine&&p.onGround);$('objective-box').hidden=settings.guidance==='minimal'&&m.kind==='free';
  let warning='';if(coop&&(team.paused||team.hostStale||!team.connected))warning='SQUADRON CONNECTION · HOLDING';else if(remotePaused)warning='FLIGHT LEAD PAUSED';else if(danger)warning='PULL UP · TERRAIN AHEAD'+(Number.isFinite(clearance.timeToImpact)?' · '+clearance.timeToImpact.toFixed(1)+'s':'');else if(p.stalled)warning='STALL · LOWER THE NOSE';else if(p.health<(a.health||100)*.25)warning='AIRFRAME CRITICAL';else if(sim.threatWarning)warning=sim.threatWarning;else if(sim.threat)warning=typeof sim.threat==='string'?sim.threat:'THREAT · CHECK RADAR';else if(alt<35&&!p.onGround&&p.speed>a.stallSpeed*1.2)warning='LOW ALTITUDE';
  $('flight-warning').hidden=!warning;setText('flight-warning',warning);
  if(coop)setText('flight-network',(team.connected?'● ':'○ ')+Math.round(team.latency||0)+' MS'+(team.isHost?' · LEAD':''));
  if(isCrewFlight())updateCrewHUD();updateMultiplayerHUD();drawRadar();processEvents();
}
function updateCrewHUD(){
  if(!isCrewFlight()||!sim.crew)return;
  const input=isGunner()?gunnerControls.read(0):sim.crew,station=getGunshipStation(input.seat),state=sim.crew.stations[station.id];
  const gunner=(team.roster||[]).find(p=>p.role==='gunner'),connected=Boolean(gunner?.connected);
  setText('crew-role-badge',isGunner()?'GUNNER':'PILOT');
  setText('crew-station-status',(isGunner()?'SHARED AIRCRAFT':'GUNNER')+' · '+station.shortLabel);
  setText('crew-contact-status',!connected?(gunner?'Gunner reconnecting · guns safe':'Waiting for a gunner · guns safe'):isGunner()?'Pilot flies · you control the guns':sim.crew.fire?'Gunner firing · hold a steady bank':'Keep the targets to your left');
  setText('flight-network',(team.connected?'● ':'○ ')+Math.round(team.latency||0)+' MS · '+(isGunner()?'GUNNER':'PILOT'));
  if(!isGunner()){setText('hud-stores','CREW · '+GUNSHIP_STATIONS.map(s=>s.shortLabel+' '+number(sim.crew.stations[s.id].ammo)).join(' / '));return;}
  const index=GUNSHIP_STATIONS.findIndex(s=>s.id===station.id),cooldown=Math.max(0,state?.cooldown||0),rounds=state?.ammo||0;
  setText('gunner-seat-number','STATION '+String(index+1).padStart(2,'0'));setText('gunner-weapon-name',station.shortLabel);setText('gunner-weapon-role',station.role.toUpperCase());setText('gunner-ammo',number(rounds));
  setText('gunner-ready',rounds<=0?'EMPTY':cooldown>.1?'RELOAD '+cooldown.toFixed(1)+'s':'READY');
  $('gunner-reload-fill').style.width=clamp((1-cooldown*station.rate)*100,0,100)+'%';
  for(const button of $$('[data-gun-seat]'))button.setAttribute('aria-pressed',String(button.dataset.gunSeat===station.id));
  for(const output of $$('[data-seat-ammo]'))setSeatAmmo(output,sim.crew.stations[output.dataset.seatAmmo]?.ammo||0);
  $('gunner-zoom').setAttribute('aria-pressed',String(input.zoom));$('gunner-zoom').querySelector('span').textContent=input.zoom?(station.fov/station.zoomFov).toFixed(1)+'×':'1×';
  const limits=GUNSHIP_AIM_LIMITS,limited=Math.abs(input.yaw-limits.yawMin)<.004||Math.abs(input.yaw-limits.yawMax)<.004||Math.abs(input.pitch-limits.pitchMin)<.004||Math.abs(input.pitch-limits.pitchMax)<.004;
  setText('gunner-aim-warning',limited?'AIM LIMIT · ASK PILOT TO TURN':rounds<=0?'EMPTY · SWITCH STATION':'');
  $('gunner-reticle').classList.toggle('hit',Number.isFinite(sim.crew.lastHit?.at)&&sim.time-sim.crew.lastHit.at<.25);
}
function setSeatAmmo(output,value){const text=number(value)+' RDS';if(output.textContent!==text)output.textContent=text;}
function processEvents(){if(!sim)return;for(const [i,e] of (sim.events||[]).entries()){const id=e.id??`${sim.time}:${i}:${e.text}`;if(seenEvents.has(id))continue;seenEvents.add(id);if(e.kind&&!['damage','hit','destroyed','explosion'].includes(e.kind))audio.cue(e.kind);if(e.text&&settings.captions&&!['gun','hit','damage'].includes(e.kind)){$('radio-caption').querySelector('p').textContent=e.text;$('radio-caption').hidden=false;lastCaption=performance.now();audio.cue('radio');}}if(seenEvents.size>1000)seenEvents=new Set([...seenEvents].slice(-400));if(performance.now()-lastCaption>6500)$('radio-caption').hidden=true;}
function drawRadar(){
  const c=$('radar'),ctx=c.getContext('2d'),size=c.width,mid=size/2;ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(mid,mid);
  ctx.strokeStyle='rgba(198,222,190,.24)';ctx.lineWidth=1;for(const r of [36,72,109]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(-108,0);ctx.lineTo(108,0);ctx.moveTo(0,-108);ctx.lineTo(0,108);ctx.stroke();
  const p=instrumentPlayer(),a=isSpectating()&&spectatorView?getAircraft(spectatorView.aircraft):currentAircraft(),range=isCrewFlight()?5200:a.radar?Math.max(3500,a.cruise*24):2100;
  ctx.fillStyle='#f6edcc';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-5,6);ctx.lineTo(0,3);ctx.lineTo(5,6);ctx.closePath();ctx.fill();
  const pos=t=>{let dx=t.x-p.x,dz=t.z-p.z;return {x:-(dx*Math.cos(p.heading)-dz*Math.sin(p.heading))/range*102,y:-(dx*Math.sin(p.heading)+dz*Math.cos(p.heading))/range*102};};
  const point=(t,type)=>{const q=pos(t),len=Math.hypot(q.x,q.y);if(len>104)return;ctx.fillStyle=type==='friend'?'#97d6e2':type==='enemy'?'#f49a78':type==='ground'?'#e8bc75':'#f1dfac';ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();if(type==='waypoint'){ctx.moveTo(q.x,q.y-5);ctx.lineTo(q.x+4,q.y);ctx.lineTo(q.x,q.y+5);ctx.lineTo(q.x-4,q.y);ctx.closePath();ctx.stroke();}else if(type==='ground'){ctx.rect(q.x-3,q.y-3,6,6);ctx.fill();}else{ctx.arc(q.x,q.y,3.5,0,Math.PI*2);ctx.fill();}};
  if(isCrewFlight()&&sim.mission.orbit){const orbit=sim.mission.orbit,q=pos(orbit);ctx.save();ctx.beginPath();ctx.arc(0,0,105,0,Math.PI*2);ctx.clip();ctx.strokeStyle='#c9deb04d';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(q.x,q.y,orbit.radius/range*102,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#e4c38c';ctx.beginPath();ctx.moveTo(q.x-5,q.y);ctx.lineTo(q.x+5,q.y);ctx.moveTo(q.x,q.y-5);ctx.lineTo(q.x,q.y+5);ctx.stroke();ctx.restore();}
  for(const r of sim.mission.runways||[])point(r,'ground');const wp=sim.navigationTarget||sim.mission.waypoints?.[sim.waypointIndex];if(wp)point(wp,'waypoint');
  if(!a.radar||sim.radarOn){for(const e of sim.enemies||[])if(e.health>0&&e.detected!==false)point(e,e.friendly?'friend':'enemy');for(const t of sim.targets||[])if(t.health>0)point(t,'ground');}
  if(hasImpactMarker()){const q=pos(sim.bombAim);if(Math.hypot(q.x,q.y)<102){ctx.strokeStyle='#d8ffe5';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.moveTo(q.x-9,q.y);ctx.lineTo(q.x+9,q.y);ctx.moveTo(q.x,q.y-9);ctx.lineTo(q.x,q.y+9);ctx.stroke();}}
  for(const r of sim.remotePlayers||[]){if(r.alive===false||r.health<=0||r.connected===false||r.id===p.id)continue;const enemy=coop&&team.mode==='dogfight';if(!enemy||(!a.radar||sim.radarOn)&&lineOfSight(p,r,sim.mission))point(r,enemy?'enemy':'friend');}
  ctx.fillStyle='#bccfb8';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText((range/1000).toFixed(1)+' KM',0,101);ctx.restore();
}
function updateMarkers(view=sim){
  if(!sim||screen!=='flight'){impactMarker.hidden=true;return;}if(isSpectating()){$('target-marker').hidden=$('waypoint-pointer').hidden=impactMarker.hidden=true;return;}const target=(view.enemies||[]).find(e=>e.id===sim.targetId&&e.health>0)||(view.targets||[]).find(t=>t.id===sim.targetId&&t.health>0)||(sim.remotePlayers||[]).find(p=>p.id===sim.targetId&&p.alive!==false&&p.health>0);const marker=$('target-marker');
  if(target&&target.detected!==false&&lineOfSight(sim.player,target,sim.mission)){const q=renderer.project(target.x,target.y,target.z);marker.hidden=!q?.visible;if(q?.visible){marker.style.left=q.x+'px';marker.style.top=q.y+'px';$('target-name').textContent=target.label||target.type||'CONTACT';$('target-distance').textContent=(dist(sim.player,target)/1000).toFixed(1)+' KM';marker.classList.toggle('locked',(sim.lockProgress||0)>=1);}}else marker.hidden=true;
  const wp=sim.navigationTarget||sim.mission.waypoints?.[sim.waypointIndex],ptr=$('waypoint-pointer');if(wp&&settings.guidance!=='minimal'){
    const q=renderer.project(wp.x,wp.y,wp.z),distance=dist(sim.player,wp);ptr.hidden=false;const label=(wp.label||'WAYPOINT')+' · '+(distance/1000).toFixed(1)+' KM';
    if(q?.visible&&q.x>35&&q.x<innerWidth-100&&q.y>120&&q.y<innerHeight-200){ptr.style.left=q.x+'px';ptr.style.top=(q.y-40)+'px';ptr.style.transform='translateX(-50%)';ptr.textContent=label;}
    else{const camera=renderer.camera,e=camera?.matrixWorld?.elements,origin=camera?.position||sim.player,dx=wp.x-origin.x,dy=wp.y-origin.y,dz=wp.z-origin.z;const side=e?dx*e[0]+dy*e[1]+dz*e[2]:-(dx*Math.cos(sim.player.heading)-dz*Math.sin(sim.player.heading)),right=side>=0;ptr.style.left=right?'calc(100% - 15px)':'15px';ptr.style.top='45%';ptr.style.transform=right?'translateX(-100%)':'none';ptr.textContent=right?label+' →':'← '+label;}
  }else ptr.hidden=true;
  impactMarker.hidden=true;
  if(hasImpactMarker()){
    const aim=sim.bombAim,q=renderer.project(aim.x,aim.y,aim.z);
    const inFront=Number.isFinite(q?.depth)?q.depth>-1&&q.depth<1:q?.visible;
    if(q&&inFront&&Number.isFinite(q.x)&&Number.isFinite(q.y)){
      const top=Math.min(150,innerHeight*.3);let bottom=innerHeight-105;
      if(markerBoundsDirty){markerBounds=['.flight-actions','.weapon-actions','#flight-hint','#radio-caption','#flight-stick','#yaw-thrust-stick','#fire-button','#aircraft-controls-toggle','#level-quick'].map(selector=>document.querySelector(selector)).filter(el=>el&&!el.hidden).map(el=>el.getBoundingClientRect());markerBoundsDirty=false;}
      for(const r of markerBounds){if(r.top>innerHeight*.35&&q.x>r.left-42&&q.x<r.right+42)bottom=Math.min(bottom,r.top-70);}
      bottom=Math.max(top+45,bottom);
      const onScreen=q.visible&&q.x>40&&q.x<innerWidth-40&&q.y>top&&q.y<bottom;
      const aligned=(sim.targets||[]).some(t=>t.health>0&&!t.friendly&&!t.narrative&&t.type!=='balloon'&&Math.hypot(t.x-aim.x,t.z-aim.z)<(currentAircraft().bombRadius||300)*.65);
      impactMarker.hidden=false;impactMarker.style.left=clamp(q.x,40,innerWidth-40)+'px';impactMarker.style.top=clamp(q.y,top,bottom)+'px';impactMarker.classList.toggle('offscreen',!onScreen);impactMarker.classList.toggle('ready',aligned);
      impactMarker.querySelector('span').textContent=aligned?'IMPACT · ON TARGET':onScreen?'IMPACT':q.y>bottom?'IMPACT ↓':q.y<top?'IMPACT ↑':q.x<40?'← IMPACT':'IMPACT →';
      impactMarker.querySelector('small').textContent=(onScreen?'':'NAV CROSS · ')+Math.max(0,aim.timeToImpact||0).toFixed(1)+'s';
    }
  }
}
function finishFlight(){
  if(endHandled||!sim)return;closeDialogs();if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:false});endHandled=true;setFlightInputs(false);audio.cue(sim.status==='success'?'success':'warning');const won=sim.status==='success',m=sim.mission,a=currentAircraft(),dogfight=coop&&team.mode==='dogfight';const health=number(sim.player.health/(a.health||100)*100),minutes=formatRoundTime(dogfight?sim.round?.elapsed:sim.time);
  if(won&&m.number){const previous=progress.completed[m.id];progress.completed[m.id]={score:Math.max(sim.score||0,previous?.score||0),time:sim.time,ending:sim.ending||null};progress.totalTime+=sim.time;if(!saveProgress(progress))toast('This browser could not save your logbook. Keep this tab open.',7500);}
  $('debrief-kicker').textContent=dogfight?'FINAL STANDINGS':won?(m.kind==='gunship'?'OPERATION COMPLETE':'SORTIE LOGGED'):'FLIGHT INTERRUPTED';$('debrief-insignia').textContent=won?'✦':'↺';$('debrief-title').textContent=dogfight?'Round complete.':sim.ending==='abort'?'A different way home.':sim.ending==='strike'?'The sky falls silent.':won?(m.kind==='gunship'?'Crew mission complete.':'One for the logbook.'):'Every pilot learns.';
  $('debrief-description').textContent=dogfight?`${m.title} · ${Math.round((sim.round?.duration||600)/60)} minutes complete. Every aircraft, every kill and every loss is recorded below. Regroup with the same squadron for another flight.`:sim.endingText||(won?`${m.title} complete. ${sim.score?Math.round(sim.score)+' points earned. ':''}${m.kind==='gunship'?'All eight ground objectives cleared. Your crew can launch again.':'Your next aircraft is waiting.'}`:sim.objective||sim.hint||'The flight ended before you completed your orders. Try assisted flight, or restart and take it one step at a time.');
  $('debrief-stats').innerHTML=dogfight?`<span>${minutes}<small>ROUND TIME</small></span><span>${number(sim.localParticipant?.kills)}<small>YOUR KILLS</small></span><span>${number(sim.localParticipant?.deaths)}<small>YOUR DEATHS</small></span>`:`<span>${minutes}<small>FLIGHT TIME</small></span><span>${health}%<small>AIRFRAME</small></span><span>${won?'✓':number((sim.progress||0)*100)+'%'}<small>OBJECTIVE</small></span>`;
  $('debrief-scoreboard').hidden=$('debrief-score-note').hidden=!coop||isCrewFlight();setText('debrief-score-note',team.mode==='squadron'?'Kills count hostile aircraft. Ground objectives add team mission points. K/D is kills ÷ deaths; — means no deaths yet.':'K/D is kills ÷ deaths; — means no deaths yet.');if(coop&&!isCrewFlight())setMarkup('debrief-scoreboard',scoreboardMarkup(participantList(),team.id));
  $('next-mission').hidden=!won||!m.number||m.number>=MISSIONS.length||coop;$('retry-mission').textContent=coop?(team.isHost?'Fly again with squadron':'Return to squadron room'):'Fly again';$('debrief-room').hidden=!coop||!team.isHost;showScreen('debrief');
}

function openSettings(){
  audio.unlock();setAircraftTray(false);settingsFromPause=$('pause-dialog').open;resumeAfterSettings=screen==='flight'&&!paused;
  if(resumeAfterSettings){paused=true;setFlightInputs(false);audio.setActive(false);if(coop&&team.isHost)team.sendWorld({...sim.getSnapshot(),teamPaused:sharedWorldPaused()});}
  if(settingsFromPause)$('pause-dialog').close();renderSettings();$('settings-dialog').showModal();
}
function closeSettings(){cancelBindingCapture();controls.clear();if($('settings-dialog').open)$('settings-dialog').close();if(settingsFromPause){settingsFromPause=false;$('pause-dialog').showModal();}else if(resumeAfterSettings){resumeAfterSettings=false;resumeFlight();}}
function bindingInfo(id){const gunner=id.startsWith('gunner:');return {id:gunner?id.slice(7):id,scope:gunner?'gunnerBindings':'keyBindings',actions:gunner?GUNNER_BINDING_ACTIONS:BINDING_ACTIONS};}
function bindingLabel(id){const info=bindingInfo(id);return formatKeyCode(settings[info.scope][info.id]);}
function bindingFeedback(message){const el=$('keybinding-feedback');if(el)el.textContent=message;}
function refreshBindingButtons(){
  for(const button of $$('[data-binding]')){
    const info=bindingInfo(button.dataset.binding),action=info.actions.find(a=>a.id===info.id),listening=bindingCapture===button.dataset.binding;
    button.classList.toggle('listening',listening);button.setAttribute('aria-pressed',String(listening));
    button.textContent=listening?'Press a key…':bindingLabel(button.dataset.binding);
    button.setAttribute('aria-label',listening?`Choose a key for ${action.label}. Escape cancels.`:`${action.label}: ${bindingLabel(button.dataset.binding)}. Change key`);
  }
  if($('cancel-binding'))$('cancel-binding').hidden=!bindingCapture;
}
function cancelBindingCapture(message=''){
  bindingCapture=null;refreshBindingButtons();if(message)bindingFeedback(message);
}
function keyboardSettings(){
  const groups=[...new Set(BINDING_ACTIONS.map(a=>a.group))];
  return `<section class="keyboard-settings"><h3>Desktop flight controls</h3><p class="small-note">Choose a button, then press its new key. A key already in use swaps the two assignments. Escape always pauses your flight.</p><p class="small-note">Default layout: ↓ pitches up; ↑ pitches down. Each direction can be reassigned below.</p><div class="keybinding-feedback" id="keybinding-feedback" role="status" aria-live="polite">${settingsSaved?'Changes save on this device.':'Browser storage is unavailable. Changes apply for this tab.'}</div><button id="cancel-binding" class="secondary" hidden>Cancel key change</button>${groups.map(group=>`<fieldset class="keybinding-group"><legend>${escapeHTML(group)}</legend>${BINDING_ACTIONS.filter(a=>a.group===group).map(a=>`<div class="keybinding-row"><span>${escapeHTML(a.label)}</span><button type="button" class="keybinding-button" data-binding="${a.id}" aria-pressed="false" aria-label="${escapeHTML(a.label)}: ${escapeHTML(bindingLabel(a.id))}. Change key">${escapeHTML(bindingLabel(a.id))}</button></div>`).join('')}</fieldset>`).join('')}<button id="reset-keybindings" class="secondary wide">Restore pilot keys</button><h3 class="gunner-keyboard-heading">AC-130 gunner controls</h3><p class="small-note">Mouse motion aims the station; hold the primary button to fire. These keys apply only in the gunner seat, so they can also be used by your pilot controls.</p>${[...new Set(GUNNER_BINDING_ACTIONS.map(a=>a.group))].map(group=>`<fieldset class="keybinding-group"><legend>${escapeHTML(group)}</legend>${GUNNER_BINDING_ACTIONS.filter(a=>a.group===group).map(a=>`<div class="keybinding-row"><span>${escapeHTML(a.label)}</span><button type="button" class="keybinding-button" data-binding="gunner:${a.id}" aria-pressed="false" aria-label="${escapeHTML(a.label)}: ${escapeHTML(bindingLabel('gunner:'+a.id))}. Change key">${escapeHTML(bindingLabel('gunner:'+a.id))}</button></div>`).join('')}</fieldset>`).join('')}<button id="reset-gunner-bindings" class="secondary wide">Restore gunner keys</button></section>`;
}
function refreshKeyboardHints(){
  const pair=(a,b)=>`${escapeHTML(bindingLabel(a))} / ${escapeHTML(bindingLabel(b))}`;
  $('desktop-controls').innerHTML=`${pair('pitchUp','pitchDown')} <span>pitch up / down</span> · ${pair('rollLeft','rollRight')} <span>roll</span> · ${pair('yawLeft','yawRight')} <span>yaw</span> · ${pair('throttleUp','throttleDown')} <span>thrust + / −</span> · ESC <span>pause & setup</span>`;
  for(const button of $$('[data-action]')){const action=BINDING_ACTIONS.find(a=>a.id===button.dataset.action);if(action)button.title=`${action.label} · ${bindingLabel(action.id)}`;}
  $('camera-button').title=`Change camera · ${bindingLabel('camera')}`;$('pause-button').title=`Pause · Esc / ${bindingLabel('pause')}`;
  $('startup-button').title=`Next engine-start step · ${bindingLabel('startup')}`;$('fire-button').title=`Hold guns · ${bindingLabel('fire')}`;
  $('gunner-fire').title='Hold guns · '+bindingLabel('gunner:fire');
  $('gunner-zoom').title='Toggle sight zoom · '+bindingLabel('gunner:zoom');
  $('gunner-centre').title='Centre gun sight · '+bindingLabel('gunner:recenter');
  $('gunner-target').title='Mark next target · '+bindingLabel('gunner:target');
  for(const [index,button] of $$('[data-gun-seat]').entries())button.title=GUNSHIP_STATIONS[index].label+' · '+bindingLabel('gunner:'+['seat25','seat40','seat105'][index]);
  setText('gunner-controls-hint',isTouchLayout()?(settings.leftHanded?'RIGHT AIM · LEFT FIRE':'LEFT AIM · RIGHT FIRE'):'Mouse to aim · hold click / '+bindingLabel('gunner:fire')+' to fire · '+['seat25','seat40','seat105'].map(id=>bindingLabel('gunner:'+id)).join(' / ')+' stations · '+bindingLabel('gunner:zoom')+' zoom');
}
function touchSides(){return {power:settings.leftHanded?'Right':'Left',flight:settings.leftHanded?'Left':'Right'};}
function refreshTouchHints(){
  const sides=touchSides(),pull=settings.touchPitch!=='push';
  $('flight-stick').setAttribute('aria-label',`${sides.flight} thumb: pitch and roll. Drag ${pull?'down':'up'} to raise the nose; ${pull?'up':'down'} to lower it. Drag left or right to roll.`);
  $('yaw-thrust-stick').setAttribute('aria-label',`${sides.power} thumb: yaw and thrust. Drag left or right to yaw; up to add thrust, down to reduce it. Release to hold thrust.`);
  setText('pitch-top-cue',pull?'NOSE DOWN':'NOSE UP');setText('pitch-bottom-cue',pull?'NOSE UP':'NOSE DOWN');
  $('fire-button').setAttribute('aria-label',`Hold to fire guns with your ${sides.power.toLowerCase()} thumb while the other thumb flies.`);
  $('gunner-aim-pad').setAttribute('aria-label',`${settings.leftHanded?'Right':'Left'} thumb: drag to aim the gun; release to hold the sight.`);$('gunner-fire').setAttribute('aria-label',`Hold to fire selected gun with your ${settings.leftHanded?'left':'right'} thumb.`);
}
function flightHint(hint){
  if(sim?.player.onGround&&sim.player.engine&&!isTouchLayout()){const a=currentAircraft();if(sim.player.brake)return `Release BRAKE (${bindingLabel('brake')}), then add thrust (${bindingLabel('throttleUp')}). ${sim.player.carrierLaunch?'Carrier launch assistance is ready.':''}`;if(sim.mission.runways?.some(r=>r.carrier&&Math.hypot(r.x-sim.player.x,r.z-sim.player.z)<r.length))return a.vtol?`Use HOVER (${bindingLabel('hover')}) and add thrust for a vertical departure.`:`Short deck: watch airspeed and wing clearance. Pull ${bindingLabel('pitchUp')} to raise the nose when you have flying speed.`;}
  if(isCrewFlight()&&!isGunner())return 'Keep the ground targets on your left. Bank gently left around the marked basin while your gunner works the stations.';
  if(isTouchLayout()){
    const sides=touchSides();
    if(sim?.player.stalled&&hint)return hint;
    if(sim?.player.engine&&sim.player.onGround&&sim.player.brake)return `AIRCRAFT → BRAKE releases the wheels. Then push the ${sides.power.toLowerCase()} pad up to add thrust.`;
    if(sim?.player.hover)return `HOVER · ${sides.power}: yaw + thrust; half thrust holds height when upright. ${sides.flight}: pitch and roll tilt the aircraft to move across the ground.`;
    if(sim?.player.onGround&&hint)return hint;
    if(!hint||sim?.mission.kind==='free')return `${sides.power}: yaw + thrust. ${sides.flight}: pitch + roll. ${settings.touchPitch==='push'?'Push up':'Pull down'} to pitch up. Release the thrust pad to hold power.`;
    return hint;
  }
  if(!hint)return `${bindingLabel('pitchUp')} / ${bindingLabel('pitchDown')}: pitch up / down. ${bindingLabel('yawLeft')} / ${bindingLabel('yawRight')}: yaw. ${bindingLabel('throttleUp')} / ${bindingLabel('throttleDown')}: thrust.`;
  const actions={START:'startup',LEVEL:'level',PAYLOAD:'payload',FIRE:'fire'};
  return hint.replace(/\b(START|LEVEL|PAYLOAD|FIRE)\b/g,label=>`${label} (${bindingLabel(actions[label])})`);
}
function touchSettings(){
  const sides=touchSides();
  return `<div class="controls-diagram"><span class="mini-yaw">${sides.power.toUpperCase()}<small>YAW + THRUST</small></span><p>Two thumbs.<br>All four flight axes.</p><span class="mini-flight">${sides.flight.toUpperCase()}<small>PITCH + ROLL</small></span></div><p class="small-note">${sides.power} thumb: move sideways to yaw, up to add thrust, down to reduce it. Release to hold your thrust setting. ${sides.flight} thumb: pitch and roll. The camera follows your aircraft.</p><p class="small-note">To shoot, lift your ${sides.power.toLowerCase()} thumb and hold FIRE. Your ${sides.flight.toLowerCase()} thumb can keep flying. AIRCRAFT opens gear, flaps, brakes and hover controls.</p>`
    +selectSetting('touchPitch','Pitch direction',[['pull','Pull down to pitch up — like the desktop arrows'],['push','Push up to pitch up']],'Changes only the touch pad. Your desktop key assignments keep their named directions.')
    +toggleSetting('leftHanded','Swap the two thumbs','Move pitch and roll to the left; yaw, thrust and FIRE to the right.')
    +rangeSetting('stickSize','Size of both thumb pads',80,152,2,' px')
    +rangeSetting('buttonSize','Action button size',44,76,2,' px')
    +rangeSetting('offsetX','Distance from screen edges',12,80,2,' px','Pads stay inside the usable screen and cannot overlap.')
    +rangeSetting('offsetY','Height above bottom edge',12,90,2,' px')
    +rangeSetting('sensitivity','Pitch, roll & gunner sensitivity',.4,1.8,.1,'×')
    +rangeSetting('deadZone','Thumb-pad dead zone',0,30,1,'%','A larger quiet centre helps avoid unintended yaw or thrust changes.')
    +rangeSetting('controlOpacity','Control visibility',35,100,5,'%')
    +'<p class="small-note">AC-130 gunner: one thumb aims, the other holds FIRE. Use the buttons to switch stations or zoom. Swap the two thumbs also applies here.</p>'
    +'<button id="reset-touch-controls" class="secondary wide">Restore touch defaults</button>';
}
function rangeSetting(key,label,min,max,step=1,suffix='',help=''){return `<div class="setting-row"><label><span class="setting-top"><span>${label}</span><output data-output="${key}">${settings[key]}${suffix}</output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-label="${label}">${help?`<p>${help}</p>`:''}</label></div>`;}
function toggleSetting(key,label,help=''){return `<div class="setting-row"><label class="setting-toggle"><span>${label}</span><input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''} aria-label="${label}"></label>${help?`<p>${help}</p>`:''}</div>`;}
function selectSetting(key,label,opts,help=''){return `<div class="setting-row"><label>${label}<select data-setting="${key}">${opts.map(([v,t])=>`<option value="${v}" ${settings[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>${help?`<p>${help}</p>`:''}</div>`;}
function renderSettings(){
  cancelBindingCapture();
  $$('[data-settings-tab]').forEach(b=>{const active=b.dataset.settingsTab===settingsTab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});let html='';
  if(settingsTab==='keyboard')html=keyboardSettings()+rangeSetting('sensitivity','Control sensitivity',.4,1.8,.1,'×','Applies to pitch, roll and gunner aiming.');
  if(settingsTab==='controls')html=touchSettings();
  if(settingsTab==='flight')html=selectSetting('assist','Flight handling',[['assisted','Assisted — forgiving and coordinated'],['standard','Standard — watch your energy'],['expert','Expert — more demanding handling']],'Start assisted. Each aircraft still has its own speed, inertia and stall limits.')+selectSetting('guidance','On-screen guidance',[['guided','Guided — flight orders and useful hints'],['standard','Standard — objectives with hints'],['minimal','Minimal — fewer overlays']])+toggleSetting('autoLevel','Auto-level when you release flight controls','Acts only with no pitch, roll or yaw input. Turn it off to stop automatic leveling after release. LEVEL remains available for recovery.')+selectSetting('units','Instrument units',[['metric','Metric — km/h and metres'],['aviation','Aviation — knots and feet']])+`<div class="setting-row"><p>Pitch, roll and yaw rotate around your aircraft’s own axes, including when banked or inverted. These are approachable flight models with game-scale distances and simplified aircraft systems. The opening sortie teaches startup, takeoff, weather and landing.</p></div>`;
  if(settingsTab==='display')html=selectSetting('theme','Interface appearance',[['night','Night — dark menus and background'],['day','Day — light menus and background']],'Choose the appearance of the hangar, menus and panels. Mission lighting follows the sortie.')+toggleSetting('sound','Flight audio','Engine, wind, weapons and warning tones. Every essential warning also appears on screen.')+rangeSetting('volume','Master volume',0,100,5,'%')+rangeSetting('engineVolume','Engine & wind',0,100,5,'%')+rangeSetting('effectsVolume','Effects & warnings',0,100,5,'%')+toggleSetting('captions','Radio captions')+toggleSetting('reducedMotion','Reduced motion','Steadier cameras and fewer visual effects.')+toggleSetting('highContrast','High-contrast instruments')+toggleSetting('largeText','Larger flight guidance')+selectSetting('quality','Graphics quality',[['auto','Automatic — balanced for this device'],['low','Low — favour a steadier frame rate'],['high','High — sharper detail']])+selectSetting('camera','Camera',[['chase','Chase — see your aircraft'],['cockpit','Cockpit — pilot view'],['cinematic','Cinematic — a wider following view']])+`<button id="test-audio" class="secondary wide">Test hit &amp; explosion sounds</button><p class="small-note">On iPhone, sound begins after a tap. Device volume and the browser’s audio output still apply.</p>`;
  if(settingsTab==='display')html+=`<p id="graphics-status" class="small-note">${graphicsStatus()}</p>`;
  $('settings-content').innerHTML=html;$('settings-content').scrollTop=0;
  $('test-audio')?.addEventListener('click',async()=>{await audio.unlock();audioPreviewUntil=performance.now()+2400;audio.setActive(true);audio.cue('hit',{intensity:.9,weapon:'gun',pan:-.35});setTimeout(()=>audio.cue('explosion',{intensity:.9,distance:90,radius:85,pan:.25}),550);setTimeout(()=>audio.setActive(screen==='flight'&&!paused&&!remotePaused),2400);});
}
function updateSettings(){
  markerBoundsDirty=true;
  settings=normalizeSettings(settings);applySettings(settings);settingsSaved=saveSettings(settings);controls.settings=settings;gunnerControls.settings=settings;audio.setSettings(settings);renderer?.setSettings(settings);if(sim)sim.settings=settings;
  $('sound-button').querySelector('.sound-label').textContent=settings.sound?'Sound on':'Sound off';$('sound-glyph').textContent=settings.sound?'◖':'⊘';$('sound-button').setAttribute('aria-label',settings.sound?'Mute sound':'Enable sound');
  const night=settings.theme==='night';$('theme-label').textContent=night?'Night':'Day';$('theme-button').setAttribute('aria-pressed',String(night));$('theme-button').setAttribute('aria-label',night?'Switch to day mode':'Switch to night mode');$('theme-button').title=night?'Switch to day mode':'Switch to night mode';
  refreshKeyboardHints();refreshTouchHints();return settingsSaved;
}

$('continue-button').onclick=()=>openCampaign(MISSIONS.find(m=>!progress.completed[m.id])||MISSIONS[0]);$('campaign-button').onclick=()=>openCampaign();$('home-button').onclick=goHome;$$('[data-home]').forEach(b=>b.onclick=goHome);
$('free-button').onclick=()=>{renderFree();showScreen('free');};$('launch-free').onclick=()=>startMission(buildFreeMission());
$('squadron-button').onclick=()=>{updateRoom();showScreen('squadron');};
$('era-filters').onclick=e=>{const b=e.target.closest('[data-era]');if(b){eraFilter=b.dataset.era;renderCampaign();}};
$('mission-list').onclick=e=>{const b=e.target.closest('[data-mission]');if(b){selectedMission=missionOf(b.dataset.mission);renderCampaign();}};
$('aircraft-list').onclick=e=>{const b=e.target.closest('[data-aircraft]');if(b){selectedAircraft=AIRCRAFT[b.dataset.aircraft];renderFree();}};
$('room-mission').innerHTML=MISSIONS.map(m=>`<option value="${escapeHTML(m.id)}">${String(m.number).padStart(2,'0')} · ${escapeHTML(m.title)}</option>`).join('');
$('room-aircraft').innerHTML=Object.values(AIRCRAFT).map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}${a.id==='ac130'?' · crew guns':!a.gun&&!a.missiles&&!a.bombs?' · unarmed':''}</option>`).join('');
$('room-aircraft').value=lobbyAircraft;$('room-start').value=lobbyStart;
for(const id of ['room-mode','room-map','room-duration','room-lives','room-mission'])$(id).onchange=submitRoomConfiguration;
$('room-aircraft').onchange=()=>{lobbyAircraft=$('room-aircraft').value;previewRoomMission();if(team.code)team.setLoadout(lobbyAircraft,lobbyStart);};
$('room-start').onchange=()=>{lobbyStart=$('room-start').value;previewRoomMission();if(team.code)team.setLoadout(lobbyAircraft,lobbyStart);};
$('free-start').onchange=()=>updateCarrierWarning('free-carrier-warning',selectedAircraft,$('free-start').value==='carrier',$('free-start').value==='carrier'?buildFreeMission():null);previewRoomMission();
$('create-room').onclick=async()=>{setConnectBusy(true);ready=false;try{const config=roomConfig();await team.create($('callsign').value.trim()||'Pilot',roomMissionId(config),{...config,aircraft:lobbyAircraft,startMode:lobbyStart});updateRoom();}catch(e){toast(e.message||'Could not create squadron.');}finally{setConnectBusy(false);}};
$('join-room').onclick=async()=>{const code=$('room-code').value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){toast('Enter the six-character squadron code.');return;}setConnectBusy(true);ready=false;try{await team.join(code,$('callsign').value.trim()||'Pilot',{aircraft:lobbyAircraft,startMode:lobbyStart});updateRoom();}catch(e){toast(e.message||'Could not join squadron.');}finally{setConnectBusy(false);}};
$('ready-room').onclick=()=>{ready=!ready;team.ready(ready);updateRoom();};$('start-room').onclick=()=>team.start(team.missionId||roomMissionId());$('leave-room').onclick=()=>{coop=false;team.leave();ready=false;sim=null;activeStart=null;updateRoom();};
$('scoreboard-button').onclick=()=>setScoreboard(!scoreboardOpen);$('close-scoreboard').onclick=()=>setScoreboard(false);$('spectate-previous').onclick=()=>cycleSpectator(-1);$('spectate-next').onclick=()=>cycleSpectator(1);$('respawn-button').onclick=respawnLocal;
$('debrief-room').onclick=()=>{if(team.isHost){team.returnToLobby();return;}closeDialogs();paused=false;updateRoom();showScreen('squadron');};
$('copy-room').onclick=async()=>{const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('squadron',team.code);try{if(navigator.share&&matchMedia('(pointer:coarse)').matches)await navigator.share({title:'Fly with me · SKYWARD',url:String(url)});else{await navigator.clipboard.writeText(String(url));toast('Invite link copied.');}}catch{toast('Squadron code: '+team.code,7000);}};
$$('[data-open-settings]').forEach(b=>b.onclick=openSettings);$('close-settings').onclick=closeSettings;$('done-settings').onclick=closeSettings;
$$('[data-settings-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.settingsTab;renderSettings();});
$('settings-content').addEventListener('click',e=>{
  const button=e.target.closest('[data-binding]');
  if(button){bindingCapture=button.dataset.binding;controls.clear();gunnerControls.clear();refreshBindingButtons();const info=bindingInfo(bindingCapture),action=info.actions.find(a=>a.id===info.id);bindingFeedback(`Press a key for ${action.label}. Escape cancels.`);return;}
  if(e.target.closest('#cancel-binding')){cancelBindingCapture('Key change cancelled.');return;}
  if(e.target.closest('#reset-keybindings')){cancelBindingCapture();controls.clear();settings.keyBindings={...DEFAULT_KEY_BINDINGS};updateSettings();refreshBindingButtons();bindingFeedback('Default keyboard controls restored. '+(settingsSaved?'Saved.':'Applied for this tab; this browser could not save the change.'));}
  if(e.target.closest('#reset-gunner-bindings')){cancelBindingCapture();gunnerControls.clear();settings.gunnerBindings={...DEFAULT_GUNNER_BINDINGS};updateSettings();refreshBindingButtons();bindingFeedback('Default gunner keys restored. '+(settingsSaved?'Saved.':'Applied for this tab.'));}
  if(e.target.closest('#reset-touch-controls')){controls.clear();for(const key of ['stickSize','buttonSize','offsetX','offsetY','sensitivity','deadZone','controlOpacity','leftHanded','touchPitch'])settings[key]=DEFAULTS[key];updateSettings();renderSettings();toast('Touch controls restored.');}
});
window.addEventListener('keydown',e=>{
  if(screen==='flight'&&!$('settings-dialog').open&&!$('pause-dialog').open&&(scoreboardOpen||isSpectating())){if(e.repeat)return;if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(scoreboardOpen)setScoreboard(false);else pauseFlight();return;}if(isSpectating()&&e.code===settings.keyBindings.camera){e.preventDefault();handleAction('camera');return;}}
  if(!bindingCapture||!$('settings-dialog').open)return;
  if(e.ctrlKey||e.metaKey||e.altKey){cancelBindingCapture('Key change cancelled. Choose a single key without Control, Command or Alt.');return;}
  e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
  if(e.code==='Escape'){cancelBindingCapture('Key change cancelled.');return;}
  if(!isBindableKey(e.code)){bindingFeedback('That key is reserved for the browser. Choose another key, or press Escape to cancel.');return;}
  const info=bindingInfo(bindingCapture),action=info.actions.find(a=>a.id===info.id),previous=settings[info.scope][action.id],bindingId=bindingCapture;
  const conflict=info.actions.find(a=>a.id!==action.id&&settings[info.scope][a.id]===e.code);
  settings[info.scope]={...settings[info.scope],[action.id]:e.code};
  if(conflict)settings[info.scope][conflict.id]=previous;
  controls.clear();gunnerControls.clear();bindingCapture=null;updateSettings();refreshBindingButtons();
  bindingFeedback(`${action.label}: ${bindingLabel(bindingId)}.${conflict?` ${conflict.label} moved to ${formatKeyCode(settings[info.scope][conflict.id])}.`:''} ${settingsSaved?'Saved.':'Applied for this tab; this browser could not save the change.'}`);
},true);
document.addEventListener('pointerdown',e=>{if(bindingCapture&&!e.target.closest('[data-binding],#cancel-binding'))cancelBindingCapture('Key change cancelled.');if($('flight-screen').classList.contains('aircraft-controls-open')&&!e.target.closest('#flight-actions,#aircraft-controls-toggle'))setAircraftTray(false);},true);
window.addEventListener('blur',()=>{if(bindingCapture)cancelBindingCapture('Key change cancelled.');});
$('settings-content').addEventListener('input',e=>{const t=e.target,k=t.dataset.setting;if(!k)return;settings[k]=t.type==='checkbox'?t.checked:t.type==='range'?Number(t.value):t.value;updateSettings();const o=$('settings-content').querySelector(`[data-output="${k}"]`);if(o)o.textContent=settings[k]+(k.includes('Size')||k.startsWith('offset')?' px':k.toLowerCase().includes('sensitivity')?'×':'%');if(k==='sound'&&settings.sound)audio.unlock();if(k==='leftHanded'||k==='touchPitch'){controls.clear();renderSettings();}});
$('reset-settings').onclick=()=>{cancelBindingCapture();controls.clear();settings=normalizeSettings(DEFAULTS);updateSettings();renderSettings();toast('Preferences reset. Your logbook is unchanged.');};
$('settings-dialog').addEventListener('cancel',e=>{e.preventDefault();if(bindingCapture)cancelBindingCapture('Key change cancelled.');else closeSettings();});$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeFlight();});
$('aircraft-controls-toggle').onclick=()=>{audio.unlock();setAircraftTray(!$('flight-screen').classList.contains('aircraft-controls-open'));};
$('pause-room').onclick=()=>{if(coop&&team.isHost)team.returnToLobby();};
$('pause-button').onclick=pauseFlight;$('resume-button').onclick=resumeFlight;$('pause-home').onclick=goHome;$('pause-restart').onclick=retryFlight;
$('theme-button').onclick=()=>{settings.theme=settings.theme==='night'?'day':'night';updateSettings();};
$('sound-button').onclick=()=>{settings.sound=!settings.sound;updateSettings();audio.unlock();};$('camera-button').onclick=()=>handleAction('camera');$('startup-button').onclick=()=>handleAction('startup');$$('[data-action]').forEach(b=>b.onclick=()=>handleAction(b.dataset.action));
$('dismiss-hint').onclick=()=>{hintDismissed=true;$('flight-hint').hidden=true;};$('abort-finale').onclick=()=>handleAction('abort');
$('retry-mission').onclick=retryFlight;$('next-mission').onclick=()=>{const next=MISSIONS[(sim?.mission.number||1)];if(next)openCampaign(next);else goHome();};
for(const button of $$('[data-gun-seat]'))button.onclick=()=>{if(isGunner()&&!paused&&!remotePaused)gunnerControls.selectSeat(button.dataset.gunSeat);};
$('gunner-zoom').onclick=()=>gunnerControls.toggleZoom();$('gunner-centre').onclick=()=>gunnerControls.recenter();$('gunner-target').onclick=selectCrewTarget;
function retryFlight(){
  if(!sim)return;
  if(coop){
    if(team.isHost){team.start(team.missionId||sim.mission.id);return;}
    if(!isCrewFlight()&&sim.status==='flying'){toast('Your flight lead can regroup the squadron in the room.');return;}
    closeDialogs();paused=false;setFlightInputs(false);updateRoom();showScreen('squadron');return;
  }
  startMission(sim.mission);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&bindingCapture)cancelBindingCapture('Key change cancelled.');if(document.hidden&&screen==='flight'&&!paused){pauseFlight();}if(!document.hidden){lastFrame=performance.now();flightClock.reset();if(sim)presentation.reset(sim);}});
window.addEventListener('resize',()=>{renderer?.resize();setAircraftTray(false);markerBoundsDirty=true;refreshKeyboardHints();refreshTouchHints();});

function graphicsStatus(){
  const mode=renderer?.backend==='software'?'Compatibility graphics · hardware 3D was unavailable.':'Hardware 3D graphics.';
  return mode+(frameStats.lastFlightFps?` Last flight: ${Math.round(frameStats.lastFlightFps)} FPS.`:'');
}
function recordFrame(elapsed,work,running){
  if(document.hidden||elapsed<=0)return;
  frameStats.frames++;frameStats.elapsed+=elapsed;frameStats.work+=work;
  if(frameStats.elapsed<1)return;
  frameStats.fps=frameStats.frames/frameStats.elapsed;frameStats.renderMs=frameStats.work/frameStats.frames;
  if(running)frameStats.lastFlightFps=frameStats.fps;
  const canvas=renderer.canvas;canvas.dataset.renderer=renderer.backend;canvas.dataset.fps=frameStats.fps.toFixed(1);canvas.dataset.frameWorkMs=frameStats.renderMs.toFixed(1);canvas.dataset.version=VERSION;
  const label=$('graphics-status');if(label)label.textContent=graphicsStatus();
  frameStats.frames=frameStats.elapsed=frameStats.work=0;
}

function frame(now){
  requestAnimationFrame(frame);const elapsed=Math.max(0,(now-lastFrame)/1000),roundElapsed=Math.max(0,(now-lastRoundFrame)/1000),dt=Math.min(elapsed,.1);lastFrame=lastRoundFrame=now;
  if(!renderer)return;
  const workStart=performance.now();let running=false;
  if(screen==='flight'&&sim){
    const remote=coop?team.samplePlayers():[];
    if(sim.setRemotePlayers)sim.setRemotePlayers(remote);else sim.remotePlayers=remote;
    const connectionHold=coop&&(team.paused||team.hostStale||!team.connected);
    setFlightInputs(!paused&&!remotePaused&&!connectionHold);
    audio.setActive((!paused&&!remotePaused&&!connectionHold)||now<audioPreviewUntil);
    running=(!paused||isArenaFlight()||isSpectating())&&!remotePaused&&!connectionHold&&sim.status==='flying';
    if(running){
      if(coop&&team.isHost&&isArenaFlight())sim.advanceRoundTime(roundElapsed);
      if(isGunner()){
        const input=gunnerControls.read(dt);team.sendCrewInput(input);
      }else{
        let input={roll:0,pitch:0,yaw:0,throttle:sim.player.throttle,fire:false};
        flightClock.advance(elapsed,step=>{input=!paused&&!scoreboardOpen&&!isSpectating()?controls.read(step):{roll:0,pitch:0,yaw:0,throttle:sim.player.throttle,fire:false};presentation.capture(sim);sim.step(step,input);});
        if(input.fire&&sim.aircraft.gun&&sim.player.ammo>0&&sim.player.gunHeat<1){audio.cue('gun');if(coop&&!team.isHost&&now-lastRemoteFire>110){team.sendAction({name:'fire',targetId:sim.targetId,lifeId:sim.player.lifeId});lastRemoteFire=now;}}
      }
      syncLifeState();
      if(isCrewFlight())for(const station of GUNSHIP_STATIONS){const count=sim.crew.stations[station.id].shots;if(count>(crewShotsSeen[station.id]||0))audio.cue(station.id==='105mm'?'heavycannon':station.id==='40mm'?'cannon':'gun');crewShotsSeen[station.id]=count;}
    }else {flightClock.reset();if(!isGunner())presentation.capture(sim);}
    if(sim.status!=='flying')setFlightInputs(false);
    if(coop&&team.connected){
      if(!isGunner())team.sendPose(sim.player);
      if(!team.isHost&&!isCrewFlight()&&(sim.player.crashed||sim.player.health<=0)&&sim.localParticipant?.alive!==false&&now-lastCrashNotice>=500){team.sendAction({name:'crash',lifeId:sim.player.lifeId});lastCrashNotice=now;}
      if(team.isHost&&now-lastWorld>=100){team.sendWorld({...sim.getSnapshot(),teamPaused:sharedWorldPaused()});lastWorld=now;}
    }
    renderView=presentation.sample(isGunner()?clamp((now-lastCrewSnapshot)/100,0,1):running&&sim.status==='flying'?flightClock.alpha:1);
    if(isGunner()&&!connectionHold){const pilot=team.samplePilot();if(pilot)Object.assign(renderView.player,pilot);}
    const watch=spectatorPose(remote),visibleRemote=remote.filter(p=>sim.participants?.get?.(p.id)?.alive!==false&&p.health!==0);
    const feedback=combatFeedback.update(sim,dt,{listener:watch||sim.player,camera:renderer.camera,reducedMotion:settings.reducedMotion,suspended:paused||remotePaused||connectionHold,spectating:isSpectating()});
    paintCombatFeedback(feedback);for(const cue of feedback.cues)audio.cue(cue.kind,cue.details);
    audio.update(watch?{player:watch,mission:sim.mission,aircraft:getAircraft(watch.aircraft)}:sim,dt);
    const destroyed=sim.status==='failed'&&(sim.player.health<=0||sim.player.crashed);
    if(destroyed&&destructionAt===null)destructionAt=now;
    if(destructionAt!==null)for(const effect of renderView.effects||[])effect.age+=Math.max(0,(now-destructionAt)/1000);
    renderer.render(renderView,dt,{camera:isGunner()?'gunner':settings.camera,gunner:isGunner()?gunnerControls.read(0):null,lookX:controls.lookX,lookY:controls.lookY,combatKick:feedback.kick,remotePlayers:visibleRemote,...(watch?{player:watch,playerId:watch.id}:{})});
    if(now-lastHud>90){updateHUD();lastHud=now;markerBoundsDirty=true;}
    updateMarkers(renderView);
    if(sim.status!=='flying'&&!endHandled&&(!destroyed||now-destructionAt>=1250))finishFlight();
  }else if(screen==='debrief'&&sim){if(coop&&team.isHost&&team.connected&&now-lastWorld>=100){team.sendWorld({...sim.getSnapshot(),teamPaused:false});lastWorld=now;}renderView=presentation.sample(1);if(destructionAt!==null)for(const effect of renderView.effects||[])effect.age+=Math.max(0,(now-destructionAt)/1000);renderer.render(renderView,dt,{camera:'cinematic',lookX:0,lookY:0,remotePlayers:[]});}
  else {renderer.renderMenu(now/1000,screen==='free'?selectedAircraft:Object.values(AIRCRAFT)[0]);}
  recordFrame(elapsed,performance.now()-workStart,running);
}

try{
  try {renderer=new FlightRenderer($('view'),settings);renderer.backend='webgl';}
  catch(graphicsError){console.warn('WebGL unavailable; using software 3D.',graphicsError.message);const view=$('view'),replacement=view.cloneNode(false);view.replaceWith(replacement);renderer=new SoftwareFlightRenderer(replacement,settings);}
  renderer.resize();updateSettings();refreshHome();showScreen('home');
  const invite=new URL(location.href).searchParams.get('squadron');if(invite){$('room-code').value=invite.slice(0,6).toUpperCase();showScreen('squadron');}
  requestAnimationFrame(frame);
}catch(e){console.error('Skyward renderer startup',e);$('loading').hidden=true;$('render-error').hidden=false;$('render-error-text').textContent='The 3D renderer could not start. Reload this page, or open the link directly in Safari or Chrome. '+(e.message||'');}

// Read-only status for diagnostics and automated smoke checks; no gameplay bypass.
globalThis.SKYWARD={version:VERSION,get status(){return {screen,mission:sim?.mission.id,phase:sim?.phase,status:sim?.status,player:sim?{x:sim.player.x,y:sim.player.y,z:sim.player.z,speed:sim.player.speed,engine:sim.player.engine,onGround:sim.player.onGround,health:sim.player.health}:null,renderer:!!renderer,backend:renderer?.backend,fps:frameStats.fps,frameWorkMs:frameStats.renderMs,coop,crewRole,station:isGunner()?gunnerControls.seat:sim?.crew?.seat,paused,completed:Object.keys(progress.completed).length};}};
