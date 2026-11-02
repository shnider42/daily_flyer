import {bindGameButton, protectGameSurface, setGameButtonEnabled,primaryCommand,stickInput} from './controls.js?v=6';
import {Game,PLAYS,DEFENSE,clamp} from './engine.js?v=6';
import {TEAMS,buildTeam,fetchFreshRoster,validateRoster} from './roster.js';
const $=id=>document.getElementById(id);const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
let viewFloor=460;
let roster,game=null,custom=safeRead('pg-lineups',{}),muted=true,audio=null,rafTime=0,toastUntil=0,keys={},stick={x:0,y:0},joyPointer=null,selectedPlay='slants',hudTimer=0,endShown=false,lastPhase='';
const field=$('field'),ctx=field.getContext('2d'),attract=$('attract'),atx=attract.getContext('2d');
const quick=el('div',undefined,'quickcall');quick.append(el('span','CALL YOUR PLAY','eyebrow'));const quickButtons=el('div',undefined,'plays');quick.append(quickButtons);document.querySelector('.fieldwrap').append(quick);
const quickKicks=el('div',undefined,'kicks');quickKicks.hidden=true;
const quickPunt=el('button','Punt'),quickFieldGoal=el('button','Field goal');quickKicks.append(quickPunt,quickFieldGoal);quick.append(quickKicks);
const fieldWrap=document.querySelector('.fieldwrap');
// Match the drawing surface to the space actually left by Safari's browser bars.
// Changing the buffer's aspect ratio reveals more field instead of shrinking it.
const compactGame=window.matchMedia('(max-width:600px), (max-width:1000px) and (max-height:600px)');
function resizeField(){const r=fieldWrap.getBoundingClientRect();if(!r.width||!r.height)return;const h=compactGame.matches?Math.max(1,Math.round(360*r.height/r.width)):460;if(field.height!==h)field.height=h;}
new ResizeObserver(resizeField).observe(fieldWrap);
protectGameSurface(document.querySelector('.controls'));
protectGameSurface(fieldWrap);
function sound(freq=440,dur=.1,type='square',volume=.025){if(muted||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur);}
function audioUnlock(){if(!muted){audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}}
function toggleSound(){muted=!muted;audioUnlock();for(const id of ['sound','pauseSound']){$(id).textContent=muted?'SOUND OFF':'SOUND ON';$(id).setAttribute('aria-pressed',String(!muted));$(id).setAttribute('aria-label',muted?'Enable sound':'Mute sound');}sound();}
$('sound').onclick=$('pauseSound').onclick=toggleSound;
function teamFor(id){return buildTeam(id,roster,custom[id]||{});}
for(const t of TEAMS){for(const id of ['homeTeam','awayTeam']){const option=el('option',t.city);option.value=t.abbr;$(id).append(option);}}
const prefs=safeRead('pg-prefs',{});$('homeTeam').value=TEAMS.some(t=>t.abbr===prefs.home)?prefs.home:'NE';$('awayTeam').value=TEAMS.some(t=>t.abbr===prefs.away)?prefs.away:'BUF';
function ensureDifferent(changed){if($('homeTeam').value===$('awayTeam').value){const other=changed==='homeTeam'?'awayTeam':'homeTeam';$(other).value=TEAMS.find(t=>t.abbr!==$(changed).value).abbr;}}
function updateLobby(){if(!roster)return;for(const side of ['home','away']){const t=teamFor($(side+'Team').value);const a=t.offense;$(`${side}Stars`).replaceChildren(el('div',`QB ${a[0].name}`),el('div',`RB ${a[1].name}`));}const when=new Date(roster.fetchedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});$('rosterStamp').textContent=`${roster.season} roster · ${roster.players.length.toLocaleString()} active players · checked ${when}. Refresh in the locker room.`;$('start').disabled=false;$('start').replaceChildren(document.createTextNode('LET’S PLAY FOOTBALL'),el('span','↗'));safeWrite('pg-prefs',{home:$('homeTeam').value,away:$('awayTeam').value});}
$('homeTeam').onchange=()=>{ensureDifferent('homeTeam');updateLobby();};$('awayTeam').onchange=()=>{ensureDifferent('awayTeam');updateLobby();};
function showDialog(id){$(id).showModal();}document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('pauseHelp').onclick=()=>showDialog('helpDialog');
$('showHelp').onclick=()=>showDialog('helpDialog');$('gameHelp').onclick=()=>{pause();showDialog('helpDialog');};
$('showRoster').onclick=()=>{if(roster){renderRoster();showDialog('rosterDialog');}};
function renderRoster(){const team=teamFor($('homeTeam').value);$('rosterTitle').textContent=`${team.city}.`;$('rosterInfo').textContent=`${team.roster.length} active players · ${roster.season} snapshot checked ${new Date(roster.fetchedAt).toLocaleDateString()}. Choose your arcade starters below.`;const editor=$('lineupEditor');editor.replaceChildren();const slots=[['qb','QB',['QB']],['rb','RB',['RB','FB']],['wr1','WR · A',['WR']],['wr2','WR · B',['WR']],['te','TE · C',['TE']]];slots.forEach(([key,label,positions],i)=>{const row=el('label',label);const select=el('select');select.setAttribute('aria-label',label+' starter');for(const p of team.roster.filter(p=>positions.includes(p.pos)).sort((a,b)=>a.name.localeCompare(b.name))){const option=el('option',`#${p.number} ${p.name}`);option.value=p.id;select.append(option);}select.value=team.offense[i].id;select.onchange=()=>{custom[team.abbr]??={};custom[team.abbr][key]=select.value;if(key==='wr1'&&custom[team.abbr].wr2===select.value)delete custom[team.abbr].wr2;if(key==='wr2'&&team.offense[2].id===select.value){custom[team.abbr].wr1=team.offense[3].id;}safeWrite('pg-lineups',custom);renderRoster();updateLobby();};row.append(select);editor.append(row);});$('rosterList').replaceChildren(...team.roster.sort((a,b)=>a.pos.localeCompare(b.pos)||a.number-b.number).map(p=>{const row=el('div',undefined,'rosterrow');row.append(el('span',p.pos),el('span','#'+p.number),el('span',p.name));return row;}));}
let refreshing=false;
async function refreshRoster(automatic=false){if(refreshing)return;refreshing=true;$('refreshRoster').disabled=true;const old=roster;$('refreshStatus').textContent='Checking the latest active rosters…';try{const data=await fetchFreshRoster();for(const t of TEAMS)buildTeam(t.abbr,data);roster=data;const stored=safeWrite('pg-rosters',data);if(!game){updateLobby();renderRoster();}$('refreshStatus').textContent=`Updated ${new Date(data.fetchedAt).toLocaleString()}. ${data.players.length.toLocaleString()} active players.${stored?'':' Browser storage unavailable; this update lasts for this visit.'}`;}catch(err){roster=old;$('refreshStatus').textContent=`Couldn’t reach a complete roster update. Keeping the working ${new Date(old.fetchedAt).toLocaleDateString()} snapshot. Try again later.`;}finally{refreshing=false;$('refreshRoster').disabled=false;}}
$('refreshRoster').onclick=()=>refreshRoster();
async function boot(){try{const res=await fetch('./rosters.json');if(!res.ok)throw Error('Roster unavailable');const bundled=await res.json();const cached=safeRead('pg-rosters',null);roster=validateRoster(cached)&&Date.parse(cached.fetchedAt)>Date.parse(bundled.fetchedAt)?cached:bundled;if(!Array.isArray(roster.players)||roster.players.length<1200)throw Error('Incomplete roster');for(const t of TEAMS)buildTeam(t.abbr,roster);ensureDifferent('homeTeam');updateLobby();if(Date.now()-Date.parse(roster.fetchedAt)>86400000)refreshRoster(true);}catch(e){$('rosterStamp').textContent='The roster could not load. Check your connection, then reload.';$('start').textContent='RELOAD ROSTERS ↻';$('start').disabled=false;$('start').onclick=()=>location.reload();}}
function playIcon(id){const run=PLAYS.find(p=>p.id===id)?.kind==='run',paths={dive:'M24 40 L24 8',sweep:'M24 40 L48 28 L48 8',slants:'M8 40 L8 28 L29 8 M48 40 L48 28 L29 8',verts:'M10 40 L10 5 M46 40 L46 5',counter:'M34 40 L38 30 L12 22 L12 6',curls:'M8 40 L8 10 L16 17 M48 40 L48 10 L40 17',flood:'M8 40 L8 28 L40 15 M46 40 L46 5 M30 40 L48 31',mesh:'M8 40 V27 H47 M47 40 V21 H8',smash:'M8 40 V26 L14 30 M46 40 V26 L40 30 M30 40 V18 L49 5',draw:'M26 40 V31 H31 V7',press:'M7 34 V10 M48 34 V10 M22 9 H34',robber:'M8 38 V10 M48 38 V10 M16 24 H39 M24 8 H34',prevent:'M5 6 H18 M22 6 H35 M39 6 H52 M10 17 H46',zone:'M7 14 L49 14 M12 30 L44 30',man:'M10 40 L10 12 M45 40 L45 12',blitz:'M8 10 L27 37 M47 10 L27 37',cover2:'M6 12 H23 M33 12 H50 M10 30 H45',cover3:'M4 10 H15 M23 10 H34 M42 10 H53 M15 30 H40',commit:'M7 8 L18 35 M19 8 L25 35 M37 8 L31 35 M49 8 L38 35'};return `<svg viewBox="0 0 56 46" aria-hidden="true"><path d="M0 36H56" stroke="#51665b" stroke-dasharray="2 3"/><path d="${paths[id]}" stroke="${run?'#f6b071':'#bce3a5'}" stroke-width="2" fill="none"/><rect x="22" y="36" width="5" height="5" fill="#f3ecd8"/><rect x="6" y="36" width="4" height="4" fill="#f3ecd8"/><rect x="46" y="36" width="4" height="4" fill="#f3ecd8"/></svg>`;}
function renderPlaybook(){
 if(!game)return;const special=Boolean(game.special),turnover=Boolean(game.returnInfo||game.isLoose||game.phase==='penalty'),plays=game.userOffense?PLAYS:DEFENSE;
 for(const box of [$('plays'),quickButtons]){box.replaceChildren();box.hidden=special||turnover;box.dataset.side=game.userOffense?'offense':'defense';for(const p of plays){const b=el('button',undefined,'play');b.innerHTML=playIcon(p.id);b.append(el('b',p.name),el('small',p.hint));b.dataset.play=p.id;bindGameButton(b,()=>{game.choose(p.id);renderPlaybook();updateHUD();sound(330,.05);});b.disabled=!['call','ready'].includes(game.phase);if((game.userOffense?game.play:game.defense)===p.id&&game.phase==='ready')b.classList.add('active');box.append(b);}}
 $('sideTag').textContent=game.phase==='penalty'?'PENALTY':game.isLoose?'LOOSE BALL':turnover?'RETURN':special?'SPECIAL TEAMS':game.userOffense?'OFFENSE':'DEFENSE';
 $('callTitle').textContent=game.phase==='penalty'?'Make the decision.':game.isLoose?'Chase the ball.':turnover?(game.userOffense?'Take it all the way.':'Make the stop.'):special?(game.userKicking?'Win the field.':'Find your lane.'):game.userOffense?'Make the call.':'Make the stop.';
 $('callHint').textContent=game.phase==='penalty'?'Accept the enforcement or decline and keep the play result. Use the buttons below.':game.isLoose?'The ball is live. Move toward it to recover; either team can take possession.':turnover?(game.userOffense?'Run upfield with the stick. Burst through a gap; contact can still cause a fumble.':'Possession changed. Switch to the closest defender, then chase and dive to stop the return.'):special?'Kicks travel downscreen. Returns go upfield. Aim with the stick or A/B/C; tap twice to set power. On an incoming punt, B calls a fair catch.':game.userOffense?'Pick a play, then snap when you’re ready.':'Choose coverage; the CPU snaps after its cadence. Position your defender behind the blue line. Switch, shed blocks or dive.';
 quick.firstChild.textContent=game.userOffense?'CHOOSE YOUR PLAY':'CHOOSE YOUR DEFENSE';
}
function start(){if(!roster)return;audioUnlock();ensureDifferent('homeTeam');game=new Game(teamFor($('homeTeam').value),teamFor($('awayTeam').value),$('difficulty').value);endShown=false;lastPhase=game.phase;keys={};resetStick();$('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');$('footer').hidden=true;for(const d of document.querySelectorAll('dialog'))d.close();$('lastPlay').textContent='Opening kickoff. Get ready to return.';renderPlaybook();updateHUD();resizeField();window.scrollTo(0,0);}
$('start').onclick=start;$('rematch').onclick=start;
function menu(){game=null;keys={};resetStick();document.body.classList.remove('playing');$('lobby').hidden=false;$('game').hidden=true;$('footer').hidden=false;for(const d of document.querySelectorAll('dialog'))d.close();updateLobby();window.scrollTo(0,0);}
$('quit').onclick=menu;$('newTeams').onclick=menu;
function pause(){if(!game||game.phase==='final')return;game.paused=true;keys={};resetStick();if(!$('pauseDialog').open)showDialog('pauseDialog');}
$('pause').onclick=pause;$('resume').onclick=()=>{game.paused=false;$('pauseDialog').close();audioUnlock();};$('pauseDialog').addEventListener('cancel',e=>{e.preventDefault();$('resume').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>{if(game)pause();});
function snap(){if(game&&!game.paused&&game.userOffense&&game.snap(0)){toastUntil=0;$('message').replaceChildren();updateHUD();renderPlaybook();audioUnlock();}}
bindGameButton($('changePlay'),()=>{if(game&&!game.paused&&game.phase==='ready'){game.phase='call';renderPlaybook();updateHUD();}});
function primaryAction(){const action=primaryCommand(game);if(action==='snap')snap();else if(action==='kick')game.kickAction();else if(action==='accept')game.resolvePenalty(true);else if(action==='burst')game.burst();updateHUD();audioUnlock();}
function receiverAction(i){if(!game||game.paused)return;if(game.phase==='penalty'){if(i===0)game.resolvePenalty(false);updateHUD();return;}if(['kick_ready','kick_charge'].includes(game.phase)&&game.userKicking)game.special.aim=[-.68,0,.68][i];else if(game.phase==='kick_flight'&&game.userOffense&&i===1)game.fairCatch();else if(game.userOffense)game.throwTo(i);else if(i===0)game.switchDefender();updateHUD();}
bindGameButton($('burst'),primaryAction);
for(let i=0;i<3;i++)bindGameButton($('pass'+i),()=>receiverAction(i));
function kick(type){if(game&&!game.paused){game.kick(type);updateHUD();renderPlaybook();}}
for(const b of [$('punt'),quickPunt])bindGameButton(b,()=>kick('punt'));
for(const b of [$('fieldGoal'),quickFieldGoal])bindGameButton(b,()=>kick('fieldgoal'));
window.addEventListener('keydown',e=>{if(!game||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','1','2','3','w','a','s','d','p'].includes(e.key))e.preventDefault();if(e.repeat)return;keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='p'){if(game.paused)$('resume').click();else pause();}if(game.paused)return;if(e.key===' ')primaryAction();if('123'.includes(e.key))receiverAction(Number(e.key)-1);});
window.addEventListener('keyup',e=>{delete keys[e.key.toLowerCase()];});
const joy=$('joystick'),moveZone=$('moveZone');function resetStick(){stick={x:0,y:0};joyPointer=null;$('stick').style.transform='translate(0px, 0px)';}
function joyMove(e){if(e.pointerId!==joyPointer)return;e.preventDefault();const r=joy.getBoundingClientRect(),v=stickInput(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,r.width*.32);stick={x:v.x,y:v.y};$('stick').style.transform=`translate(${v.px}px, ${v.py}px)`;}
moveZone.onpointerdown=e=>{if(joyPointer!==null||e.pointerType==='mouse'&&e.button!==0)return;joyPointer=e.pointerId;moveZone.setPointerCapture(e.pointerId);joyMove(e);};moveZone.onpointermove=joyMove;moveZone.onpointerup=e=>{if(e.pointerId===joyPointer)resetStick();};moveZone.onpointercancel=moveZone.onlostpointercapture=()=>resetStick();
window.addEventListener('orientationchange',resetStick);
function updateHUD(){
 if(!game)return;
 const g=game,ready=['call','ready'].includes(g.phase),s=g.special,kickSetup=['kick_ready','kick_charge'].includes(g.phase),flight=['kick_flight','kick_loose'].includes(g.phase);
 $('homeAbbr').textContent=g.teams[0].abbr;$('awayAbbr').textContent=g.teams[1].abbr;$('homeScore').textContent=g.scores[0];$('awayScore').textContent=g.scores[1];$('quarter').textContent=g.quarter>4?'OT':`Q${g.quarter}`;$('clock').textContent=g.quarter>4?'SD':`0:${String(Math.ceil(g.clock)).padStart(2,'0')}`;
 $('possession').textContent=kickSetup||flight?(g.userKicking?'YOU KICK ↓':'YOU RETURN ↑'):g.userOffense?'YOUR BALL ↑':'DEFEND ↑';
 $('down').textContent=g.phase==='penalty'?'FLAG':g.isLoose?'FUMBLE':g.returnInfo?'RETURN':s?s.type.toUpperCase():`${['1ST','2ND','3RD','4TH'][g.down-1]} & ${g.target===100?'GOAL':Math.max(1,Math.ceil(g.target-g.spot))}`;
 $('spot').textContent=s&&kickSetup?`KICK FROM ${s.kickSpot}`:g.spot<50?`OWN ${Math.round(g.spot)}`:`OPP ${Math.round(100-g.spot)}`;
 $('playName').textContent=g.phase==='penalty'?'ACCEPT OR DECLINE':g.isLoose?'CHASE THE BALL':g.returnInfo?(g.userOffense?'RUN UPFIELD ↑':'STOP THE RETURN'):s?(flight?'TRACK THE BALL':g.isReturn?(g.userOffense?'RUN UPFIELD ↑':'STOP THE RETURN'):'SPECIAL TEAMS'):g.phase==='call'?'PICK A PLAY':g.userOffense?g.playDefinition.name.toUpperCase():DEFENSE.find(p=>p.id===g.defense).name.toUpperCase();
 quick.hidden=g.phase!=='call';$('changePlay').hidden=g.phase!=='ready';
 $('kicks').hidden=quickKicks.hidden=!(ready&&g.userOffense&&g.down===4);
 for(const b of [$('fieldGoal'),quickFieldGoal]){b.disabled=117-g.spot>55;b.textContent=`Field goal · ${Math.round(117-g.spot)} yd`;}
 const burstLabel=g.phase==='penalty'?'ACCEPT':g.phase==='ready'?(g.userOffense?'SNAP THE BALL':`CPU SNAP · ${Math.max(1,Math.ceil(g.cpuSnapIn))}`):g.phase==='call'?'CHOOSE A PLAY':g.phase==='dead'?'PLAY OVER':kickSetup?(g.userKicking?(g.phase==='kick_charge'?'KICK!':'START METER'):'READY TO RETURN'):g.isLoose?'LOOSE BALL':g.userOffense?(g.pass?'PASS IN AIR':'BURST'):g.controlled.blocked?'SHED BLOCK':'DIVE';
 setGameButtonEnabled($('burst'),Boolean(primaryCommand(g)));$('burst').dataset.action=primaryCommand(g)||'wait';
 $('burst').replaceChildren(document.createTextNode(burstLabel),el('span',primaryCommand(g)?'SPACE':''));
 for(let i=0;i<3;i++){
  const button=$('pass'+i);let label='—',name='',enabled=false;button.hidden=true;
  if(g.phase==='penalty'){if(i===0){label='DECLINE';name='KEEP THE PLAY';enabled=true;}}
  else if(kickSetup&&g.userKicking){label=['↙','↓','↘'][i];name=['LEFT','CENTER','RIGHT'][i];enabled=true;}
  else if(flight&&g.userOffense){if(i===1&&s.type==='punt'){label=s.fair?'✓':'B';name=s.fair?'CALLED':'FAIR';enabled=g.phase==='kick_flight'&&!s.fair;}}
  else if(g.userOffense&&!s&&!g.returnInfo&&!g.isLoose&&g.playDefinition.kind==='pass'&&['call','ready','live'].includes(g.phase)&&!g.passed){label='ABC'[i];name=g.players[i+2].name.split(' ').slice(-1)[0];enabled=g.canPass;}
  else if(!g.userOffense&&i===0){label='↻';name='SWITCH';enabled=g.isLive||g.isLoose||flight||g.phase==='ready';}
  button.hidden=label==='—'||!enabled&&!g.userOffense;button.firstChild.textContent=label;button.lastChild.textContent=name;setGameButtonEnabled(button,enabled);
 }
 const shown=[0,1,2].some(i=>!$('pass'+i).hidden);$('controlHint').hidden=shown;
 $('controlHint').textContent=g.isLoose?'CHASE THE LOOSE BALL':g.phase==='ready'&&!g.userOffense?'WATCH THE SNAP':g.phase==='call'?'CHOOSE A PLAY ABOVE':g.phase==='dead'?'NEXT PLAY COMING':g.pass?'TRACK THE PASS':g.userOffense?'FOLLOW YOUR BLOCKS ↑':'GET READY TO DEFEND';
 $('readiness').hidden=g.phase!=='ready';
 const across=!g.userOffense&&g.controlled.y<g.spot+.45;
 $('readiness').classList.toggle('warning',across);
 $('readiness').textContent=g.userOffense?'SNAP WITH YOUR RIGHT THUMB ↘':across?'GET BACK BEHIND THE BLUE LINE!':`${g.teams[g.offense].abbr} IS SET · POSITION YOUR DEFENDER`;
 $('flagNotice').hidden=!g.flags.length||g.phase==='penalty';$('flagNotice').textContent=g.flags.length?`⚑ FLAG · ${g.teams[g.flags[0].team].abbr}`:'';
 $('penaltyPanel').hidden=g.phase!=='penalty';
 if(g.penaltyReview){const r=g.penaltyReview;$('penaltyName').textContent=r.description||r.accept.title;$('penaltyAccept').textContent=`ACCEPT: ${r.accept.detail}`;$('penaltyDecline').textContent=`DECLINE: ${r.decline?.title||''} · ${r.decline?.detail||''}`;}
 $('kickPanel').hidden=!kickSetup;$('kickMeter').hidden=!(kickSetup&&g.userKicking);
 if(kickSetup){
  $('kickTitle').textContent=`${g.teams[s.kickingTeam].abbr} ${s.type.toUpperCase()}`;
  $('kickHint').textContent=g.userKicking?(g.phase==='kick_charge'?'Tap KICK to stop the meter. Aim with stick or arrows.':'Aim with stick or arrows. Tap START METER, then KICK.'):s.type==='punt'?'Tap READY. Track the ring; B signals a fair catch.':'Tap READY. The returner tracks the ring until you steer.';
  const target=g.kickTarget(g.phase==='kick_charge'?s.power:.7,s.aim);
  $('kickAim').textContent=g.userKicking?`${s.aim<-.15?'LEFT':s.aim>.15?'RIGHT':'CENTER'} · ${target.y<=0?'END ZONE':`landing near receiving ${Math.round(target.y)}`} · ${target.x<1||target.x>52?'OUT OF BOUNDS RISK':'more power = more distance'}`:'After the catch: run upfield ↑ and BURST through a gap.';
  $('kickFill').style.width=`${s.power*100}%`;$('kickReading').textContent=`${Math.round(s.power*100)}%`;$('kickPower').setAttribute('aria-valuenow',String(Math.round(s.power*100)));
 }
 const player=g.controlled;$('playerLabel').textContent=player?`#${player.number} ${player.name.toUpperCase()}${g.userOffense?'':' · YOU CONTROL'}`:'';
 $('energyFill').style.width=`${kickSetup?100:100*(1-(g.userOffense?g.burstCooldown/3:g.diveCooldown/1.7))}%`;
}
function toast(text,detail='',seconds=1.5){$('message').replaceChildren(el('span',text));if(detail)$('message').append(el('small',detail));toastUntil=performance.now()+seconds*1000;}
function processEvents(){for(const e of game.events.splice(0)){if(e.type==='result'){$('lastPlay').textContent=game.lastResult;toast(e.text,e.detail,2.1);sound(e.text==='TOUCHDOWN!'?660:160,.22);if(e.text==='TOUCHDOWN!'){setTimeout(()=>sound(880,.18),130);setTimeout(()=>sound(1320,.3),260);}}else if(['ball','turnover','handoff','shed','flag'].includes(e.type)){toast(e.text,e.detail,e.type==='turnover'?1.5:.8);sound(e.type==='turnover'?190:340,.12);}else if(e.type==='penalty'){toastUntil=0;$('message').replaceChildren();sound(280,.18);}else if(e.type==='special'){if(!['kick_ready','kick_charge'].includes(game.phase))toast(e.text,e.detail,1.1);}else if(e.type==='kick'){sound(170,.13,'triangle');}else if(e.type==='catch'){sound(740,.06);}else if(e.type==='throw'){sound(260,.07,'triangle');}else if(e.type==='snap'){sound(110,.08);}else if(e.type==='juke'){toast(e.text,'',.6);sound(420,.07);}else if(e.type==='call'){/* Phase transition below updates the playbook once. */}else if(['overtime','quarter'].includes(e.type))toast(e.text,e.detail,1.4);else if(e.type==='final')finishGame();}if(game.phase!==lastPhase){lastPhase=game.phase;renderPlaybook();updateHUD();}}
function finishGame(){if(endShown)return;endShown=true;$('resultTitle').textContent=game.scores[0]>game.scores[1]?'That’s a win.':'One more game?';$('resultScore').textContent=`${game.teams[0].city} ${game.scores[0]} — ${game.scores[1]} ${game.teams[1].city}`;$('resultStats').textContent=`${game.stats.yards} offensive yards · ${game.stats.completions}/${game.stats.attempts} passing · ${game.stats.tackles} team tackles · ${game.stats.returnYards} return yards · ${game.stats.takeaways} takeaways · ${game.stats.interceptions} INT thrown · ${game.stats.fumblesLost} fumbles lost · ${game.stats.penalties} penalties / ${Math.round(game.stats.penaltyYards)} yd`;$('endDialog').showModal();}
// Original pixel sprites and stadium graphics, drawn at a fixed internal resolution.
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function txt(c,text,x,y,size=10,color='#e4edd4',align='center'){c.fillStyle=color;c.font=`bold ${size}px monospace`;c.textAlign=align;c.fillText(text,Math.round(x),Math.round(y));}
function sprite(c,x,y,color,accent,number,phase=0,controlled=false,ball=false,scale=1){c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);rect(c,-8,5,17,5,'#092d2b66');if(controlled){c.strokeStyle='#f9da7d';c.lineWidth=2;c.strokeRect(-11,-12,22,27);rect(c,-3,17,6,3,'#f9da7d');}const step=Math.sin(phase)>0?2:-2;rect(c,-5,5,4,7+step,'#e7e9ce');rect(c,2,5,4,7-step,'#e7e9ce');rect(c,-6,10+step,5,3,'#15252b');rect(c,2,10-step,5,3,'#15252b');rect(c,-8,-4,16,11,'#132e32');rect(c,-7,-5,14,11,color);rect(c,-10,-3,3,7,'#dcae80');rect(c,8,-3,3,7,'#dcae80');rect(c,-5,-11,10,7,'#12242b');rect(c,-4,-12,8,7,accent);rect(c,-1,-12,2,8,color);rect(c,-4,-5,8,2,'#93aaa0');txt(c,String(number),0,4,7,'#fff5da');if(ball){rect(c,7,1,5,7,'#a95b34');rect(c,8,3,3,1,'#f2d9ad');}c.restore();}
function drawField(c,canvas,camera,home,away,time=0){const h=canvas.height,w=canvas.width,scale=5.65;const py=y=>h*.60-(y-camera)*scale;const px=x=>29+x*5.65;rect(c,0,0,w,h,'#162e2c');
 for(let x=0;x<w;x+=6){for(let y=3;y<h;y+=12){if(x>14&&x<w-14)continue;const v=(x*17+y*7)%29;rect(c,x,y,3,3,v<10?'#c9ca9d':v<20?'#4f7d67':'#7b6f4d');rect(c,x,y+3,3,4,'#294d43');}}
 rect(c,22,0,316,h,'#c9d5b6');rect(c,28,0,304,h,'#366d4f');
 for(let yard=-10;yard<=110;yard+=5){const y=py(yard),y2=py(yard+5);if(y<h+40&&y>-40){rect(c,29,y2,302,y-y2,yard%10===0?'#356e50':'#397655');}}
 for(const [y1,y2,t] of [[100,110,away],[-10,0,home]]){const top=py(y2),bottom=py(y1);if(bottom>0&&top<h){rect(c,29,top,302,bottom-top,t?.color||'#245443');for(let x=32;x<329;x+=12)rect(c,x,top+3,5,3,t?.accent||'#d4da9a');txt(c,t?.city?.toUpperCase()||'POCKET GRIDIRON',180,(top+bottom)/2+5,18,'#efe8cd');}}
 for(let yard=0;yard<=100;yard++){const y=py(yard);if(y<0||y>h)continue;if(yard%5===0){rect(c,29,y,302,yard%10===0?2:1,'#bdcda6');if(yard>0&&yard<100&&yard%10===0){const n=yard<=50?yard:100-yard;txt(c,n,55,y+16,13,'#cbd6ac');txt(c,n,306,y+16,13,'#cbd6ac');}}else{for(const x of [31,143,211,325])rect(c,x,y,4,1,'#9fbb8c');}}
 rect(c,23,0,3,h,'#6c8770');rect(c,334,0,3,h,'#6c8770');return {px,py,scale};}
function drawGame(){if(!game)return;
 // Short landscape screens zoom the drawing out uniformly, keeping the QB and
 // downfield routes in view. Portrait uses every available pixel of field.
 viewFloor+=((game.phase.startsWith('kick_')?460:360)-viewFloor)*.12;
 const fit=Math.min(1,field.height/viewFloor),view={width:360,height:field.height/fit};
 ctx.save();rect(ctx,0,0,field.width,field.height,'#162e2c');ctx.translate((360-360*fit)/2,0);ctx.scale(fit,fit);
 const g=game,{px,py}=drawField(ctx,view,g.cameraY,g.teams[g.offense],g.teams[1-g.offense],g.time);if(!g.special&&!g.returnInfo){const lineY=py(g.spot),targetY=py(g.target);rect(ctx,29,lineY,302,2,'#70c5ee');rect(ctx,29,targetY,302,2,'#efc65b');txt(ctx,'1ST',322,targetY-5,8,'#f8dc86');}
 if(['call','ready'].includes(g.phase)){
  ctx.setLineDash([4,4]);ctx.lineWidth=2;ctx.strokeStyle='#c2e59a99';
  if(g.playDefinition.kind==='pass')for(const p of g.players.slice(2,5)){ctx.beginPath();ctx.moveTo(px(p.x),py(p.y));for(let t=0;t<=4;t+=.2){const r=g.route(p,t);ctx.lineTo(px(r.x),py(r.y));}ctx.stroke();}
  else{const p=g.players[1],x=g.play==='counter'?12:g.play==='sweep'?45:27;ctx.beginPath();ctx.moveTo(px(p.x),py(p.y));ctx.lineTo(px(x),py(g.spot+2));ctx.lineTo(px(x),py(g.spot+14));ctx.stroke();}
  ctx.setLineDash([]);
 }
 const special=g.special;
 if(special&&g.phase.startsWith('kick_')){
  const b=special.ball,target=b?{x:b.tx,y:b.ty}:g.kickTarget(g.phase==='kick_charge'?special.power:.7,special.aim),kicker=g.defenders[6];
  ctx.strokeStyle=target.y<=0||target.x<1||target.x>52?'#ed9b75':'#f6de88';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(px(target.x),py(target.y),10,5,0,0,Math.PI*2);ctx.stroke();
  rect(ctx,px(target.x)-2,py(target.y)-2,4,4,'#f8e6a8');
  if(!b){ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(px(kicker.x),py(kicker.y));ctx.lineTo(px(target.x),py(target.y));ctx.stroke();ctx.setLineDash([]);}
 }
 for(const b of g.blocks){const p=g.players[b.p],d=g.defenders[b.d];ctx.strokeStyle=b.held?'#ffd15b':'#d7dcab';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(p.x),py(p.y)-3);ctx.lineTo(px(d.x),py(d.y)-3);ctx.stroke();}
 const drawables=[...g.players.map(p=>({p,team:g.teams[g.offense],off:true})),...g.defenders.map(p=>({p,team:g.teams[1-g.offense],off:false}))].sort((a,b)=>b.p.y-a.p.y);
 for(const {p,team,off} of drawables){const x=px(p.x),y=py(p.y);if(y<-25||y>view.height+25)continue;const color=off?team.color:'#ece7cc',accent=off?team.accent:team.color;sprite(ctx,x,y,color,accent,p.number,p.phase,p===g.controlled,p===g.carrier&&!g.pass&&!g.isLoose&&(!special||g.isReturn),1);if(off&&!special&&!g.returnInfo&&!g.isLoose&&p.slot>=2&&p.slot<=4&&!g.passed&&g.playDefinition.kind==='pass'){rect(ctx,x-7,y-29,14,12,'#142e2b');txt(ctx,'ABC'[p.slot-2],x,y-20,10,'#f7e9b9');}if(p.stun>.4)txt(ctx,'✦',x,y-19,10,'#ebcc82');}
 for(const f of g.flags){const flipped=g.offense!==g.playStart.offense;rect(ctx,px(flipped?53-f.x:f.x)-3,py(flipped?100-f.y:f.y)-20,7,5,'#ffd15b');}
 if(g.pass||g.loose||special?.ball){const b=g.pass||g.loose||special.ball,arc=g.isLoose?Math.abs(Math.sin(b.elapsed*15))*5:g.phase==='kick_loose'?Math.abs(Math.sin(special.looseTime*12))*3:Math.sin(clamp(b.elapsed/b.duration,0,1)*Math.PI)*(special?38:25);rect(ctx,px(b.x)-3,py(b.y),7,3,'#152a2866');rect(ctx,px(b.x)-2,py(b.y)-arc-3,5,8,'#d9965e');rect(ctx,px(b.x)-1,py(b.y)-arc,3,1,'#fff4d1');}
 if(g.burstLeft>0){const p=g.carrier;rect(ctx,px(p.x)-3,py(p.y)+18,2,7,'#f8d67b');rect(ctx,px(p.x)+3,py(p.y)+21,2,6,'#f8d67b');}
 ctx.restore();
}
function drawAttract(t){const a=roster?teamFor($('homeTeam').value):TEAMS[21],b=roster?teamFor($('awayTeam').value):TEAMS[3];const {px,py}=drawField(atx,attract,65,a,b,t);const phase=t*.002;const runnerX=25+Math.sin(phase)*6;const others=[[15,70,55],[39,71,72],[12,83,24],[44,86,30],[27,91,4]];for(const [x,y,n] of others)sprite(atx,px(x),py(y)+Math.sin(phase+x)*3,'#e5e6cb',b.color,n,phase+x,false,false,1.25);for(const [x,y,n] of [[21,76,66],[33,77,76]])sprite(atx,px(x),py(y),a.color,a.accent,n,phase,false,false,1.25);sprite(atx,px(runnerX),py(68),a.color,a.accent,a.offense?.[1].number||32,phase*4,true,true,1.5);rect(atx,44,30,272,45,'#173b2edd');txt(atx,'SUNDAY IS A STATE OF MIND.',180,49,10,'#c8dda8');txt(atx,'PRESS PLAY. BREAK AWAY.',180,64,9,'#f2d49b');}
function frame(now){let dt=rafTime?(now-rafTime)/1000:0;rafTime=now;if(game){let x=stick.x+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),y=stick.y+(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);const n=Math.hypot(x,y);if(n>1){x/=n;y/=n;}const elapsed=Math.min(dt,.25),steps=Math.max(1,Math.ceil(elapsed/.05));for(let i=0;i<steps;i++)game.tick(elapsed/steps,{x,y});processEvents();drawGame();hudTimer+=dt;if(hudTimer>(game.phase==='kick_charge'?.035:.09)){updateHUD();hudTimer=0;}if(toastUntil&&now>toastUntil){$('message').replaceChildren();toastUntil=0;}}else if(!document.hidden){drawAttract(window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:now);}requestAnimationFrame(frame);}
boot();requestAnimationFrame(frame);
