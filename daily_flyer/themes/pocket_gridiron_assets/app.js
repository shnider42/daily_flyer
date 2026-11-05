import {roleFor,defenseBoard,offenseBoard} from './huddle.js?v=32';
import {bindHuddleSwipe} from './huddle-input.js?v=32';
import {OFFENSIVE_SYSTEMS} from './offensive-systems.js?v=32';
import {DECADE_TEAMS,decadeTeam} from './decades.js?v=32';
import {commercialFor,paintCommercial} from './commercials.js?v=32';
import {injurySummary} from './injuries.js?v=32';
import {WEATHER,createWeather,weatherLabel,weatherAdvice,windFor,windArrow,kickConditions} from './weather.js?v=32';
import {weatherSurface,weatherParticles,weatherFeet} from './weather-presentation.js?v=32';
import {runLandmark} from './rushing.js?v=32';
import {CLASSICS,HISTORIC_TEAMS,historicTeam} from './history.js?v=32';
import {ChallengeGame,DRILLS,guideText,saveProgress} from './challenges.js?v=32';
import {SPECIAL_SLOTS,RETURN_PLANS,kickHeight} from './special-teams.js?v=32';
import {FORMATIONS,PERSONNEL,packageOf,personnelLabel,supportsPersonnel} from './packages.js?v=32';
import {uniformFor} from './uniforms.js?v=32';
import {goalWindow} from './placekicks.js?v=32';
import {clockText,matchLength} from './match.js?v=32';
import {HalftimeShow} from './halftime.js?v=32';
import {pregameReport,halftimeBroadcast,postgameReport} from './broadcast.js?v=32';
import {passPlacement,passAim} from './passing.js?v=32';
import {ReplayTape} from './replay.js?v=32';
import {BoothVoices,giveBoothVoice} from './booth-lines.js?v=32';
import {FAMILY_NAMES} from './music.js?v=32';
import {showOffensiveRoutes,suggestions,kickOptions,coachText,hitDefender,BOOK_FILTERS,bookPage} from './presentation.js?v=32';
import {teamStrengths,withOffensiveSystem} from './teams.js?v=32';
import {RATING_LABELS,visibleRatings} from './ratings.js?v=32';
import {bindAudioActivation} from './device-audio.js?v=32';
import {StadiumAudio} from './audio.js?v=32';
import {bindGameButton, protectGameSurface, setGameButtonEnabled,primaryCommand,stickInput,movementInput} from './controls.js?v=32';
import {Game,PLAYS,DEFENSE,clamp} from './engine.js?v=32';
import {TEAMS,buildTeam,fetchFreshRoster,validateRoster} from './roster.js?v=32';
const $=id=>document.getElementById(id);const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
let viewFloor=460,defenderHits=[],bookFilter='all',bookIndex=0,bookPages=1,bookSide='',bookSession=null;
const replay=new ReplayTape();let autoReplays=safeRead('pg-replays',true)!==false,audition=false,lastMusicStatus='';
let guidance='moderate',duel=null;
let weatherSeed=Date.now()>>>0,forecast=null,forecastKey='';
let mode='exhibition',progress=safeRead('pg-campaign-progress',{}),challengeConfig=null;
const modeLabels={exhibition:'Pick a team and make your own football story.',training:'Four skills. Three stages each. Repetition without a whole game.',campaign:'The Sunday Scrapbook · four chapters, twelve stars. Play in order or jump to a favorite.',classic:'The original opponents. Real game-day players. A new result is up to you.'};
$('gameLength').value=['quick','extended','showcase'].includes(safeRead('pg-length','quick'))?safeRead('pg-length','quick'):'quick';
function setLength(){const m=matchLength($('gameLength').value);safeWrite('pg-length',$('gameLength').value);$('lengthInfo').textContent=`${m.quarterSeconds*4/60} minutes of game clock. Menus and replays add time.${m.halftimeShow?' Includes pregame, halftime and postgame shows.':''}`;}
$('gameLength').onchange=()=>{setLength();renderMode();};setLength();
let roster,game=null,custom=safeRead('pg-lineups',{}),rafTime=0,toastUntil=0,keys={},stick={x:0,y:0},joyPointer=null,selectedPlay='slants',hudTimer=0,endShown=false,lastPhase='';
const field=$('field'),ctx=field.getContext('2d'),attract=$('attract'),atx=attract.getContext('2d');
const quick=el('div',undefined,'quickcall');quick.append(el('span','CALL YOUR PLAY','eyebrow'));const quickButtons=el('div',undefined,'plays');const quickHelp=el('p',undefined,'quickhelp');quick.append(quickHelp,quickButtons);document.querySelector('.fieldwrap').append(quick);
const quickKicks=el('div',undefined,'kicks');quickKicks.hidden=true;
const quickPunt=el('button','Punt'),quickFieldGoal=el('button','Field goal');quickKicks.append(quickPunt,quickFieldGoal);quick.append(quickKicks);
const aimCue=el('div','','aimcue');aimCue.hidden=true;document.querySelector('.fieldwrap').append(aimCue);
const fieldWrap=document.querySelector('.fieldwrap');
// Match the drawing surface to the space actually left by Safari's browser bars.
// Changing the buffer's aspect ratio reveals more field instead of shrinking it.
const compactGame=window.matchMedia('(max-width:600px), (max-width:1000px) and (max-height:600px)');
function resizeField(){const r=fieldWrap.getBoundingClientRect();if(!r.width||!r.height)return;const h=compactGame.matches?Math.max(1,Math.round(360*r.height/r.width)):460;if(field.height!==h)field.height=h;}
new ResizeObserver(resizeField).observe(fieldWrap);
protectGameSurface(document.querySelector('.controls'));
protectGameSurface(fieldWrap);
const boothVoices=new BoothVoices(safeRead('pg-booth-rotation',{}));
function openBroadcast(report){halftimeShow.open(giveBoothVoice(report,boothVoices));safeWrite('pg-booth-rotation',boothVoices.snapshot());}
const halftimeShow=new HalftimeShow($('halftimeDialog'),mode=>{keys={};resetStick();if(!game)return;if(mode==='postgame'){$('endDialog').showModal();return;}if(duel){duel.resume();return;}if(mode==='pregame')game.paused=false;else if(!game.resumeHalftime())return;renderPlaybook();updateHUD();audioUnlock();maybeLesson();},()=>stadium.chatter.stop());
$('pauseMotion').value=halftimeShow.motion;$('pauseMotion').onchange=()=>{$('halfMotion').value=$('pauseMotion').value;$('halfMotion').onchange();};$('halfMotion').addEventListener('change',()=>{$('pauseMotion').value=halftimeShow.motion;});
function showHalftime(){keys={};resetStick();toastUntil=0;$('message').replaceChildren();openBroadcast(halftimeBroadcast(game.halftime,replay.highlights));}
const stadium=new StadiumAudio(safeRead('pg-audio',{}));
function sound(freq=440,dur=.1,type='square',volume=.025){stadium.tone(freq,dur,type,volume);}
function audioUnlock(){if(stadium.settings.effects||stadium.settings.music||stadium.settings.scoringMusic||stadium.settings.boothChatter)return stadium.unlock();return Promise.resolve();}
bindAudioActivation(audioUnlock,{enabled:()=>stadium.settings.effects||stadium.settings.music||stadium.settings.scoringMusic||stadium.settings.boothChatter});
function syncAudio(){stadium.apply();for(const id of ['halfChatter','pauseBoothChatter'])$(id).checked=stadium.settings.boothChatter;safeWrite('pg-audio',stadium.settings);for(const id of ['sound','pauseSound']){$(id).textContent=stadium.settings.effects?'EFFECTS ON':'EFFECTS OFF';$(id).setAttribute('aria-pressed',String(stadium.settings.effects));$(id).setAttribute('aria-label',stadium.settings.effects?'Mute effects':'Enable effects');}$('effects').checked=stadium.settings.effects;for(const id of ['contactFx','passWhistle'])$(id).checked=stadium.settings[id];$('music').checked=stadium.settings.music;$('audioVolume').value=stadium.settings.volume;$('scoringMusic').checked=stadium.settings.scoringMusic;$('station').value=stadium.settings.station;$('musicVolume').value=stadium.settings.musicVolume;$('jukeboxMusic').checked=stadium.settings.music;for(const id of ['musicMode','jukeboxMode'])$(id).value=stadium.settings.musicMode;}
for(const id of ['halfChatter','pauseBoothChatter'])$(id).onchange=()=>{stadium.settings.boothChatter=$(id).checked;syncAudio();audioUnlock();};
function toggleSound(){stadium.settings.effects=!stadium.settings.effects;audioUnlock();syncAudio();}
$('sound').onclick=$('pauseSound').onclick=toggleSound;
for(const id of ['contactFx','passWhistle'])$(id).onchange=()=>{stadium.settings[id]=$(id).checked;audioUnlock();syncAudio();};
$('effects').onchange=()=>{stadium.settings.effects=$('effects').checked;audioUnlock();syncAudio();};
for(const id of ['musicMode','jukeboxMode'])$(id).onchange=()=>{stadium.settings.musicMode=$(id).value;syncAudio();audioUnlock();};
$('music').onchange=()=>{stadium.settings.music=$('music').checked;audioUnlock();syncAudio();};
$('audioVolume').oninput=()=>{stadium.settings.volume=Number($('audioVolume').value);syncAudio();};syncAudio();
$('scoringMusic').onchange=()=>{stadium.settings.scoringMusic=$('scoringMusic').checked;audioUnlock();syncAudio();};
$('autoReplays').checked=autoReplays;$('autoReplays').onchange=()=>{autoReplays=$('autoReplays').checked;safeWrite('pg-replays',autoReplays);if(!autoReplays){replay.skipAll();keys={};resetStick();updateHUD();}};
$('station').onchange=()=>{stadium.settings.station=$('station').value;syncAudio();audioUnlock();renderTracks();};
$('musicVolume').oninput=()=>{stadium.settings.musicVolume=Number($('musicVolume').value);syncAudio();};
$('jukeboxMusic').onchange=()=>{stadium.settings.music=$('jukeboxMusic').checked;syncAudio();audioUnlock();};
$('nextTrack').onclick=()=>{stadium.settings.music=true;syncAudio();audioUnlock();stadium.soundtrack.next();};
function openSoundtrack(){if(game)pause();audition=true;showDialog('soundtrackDialog');audioUnlock();renderTracks();}
$('showSoundtrack').onclick=$('pauseSoundtrack').onclick=openSoundtrack;
$('soundtrackDialog').addEventListener('close',()=>{audition=false;});
function renderTracks(){const tracks=stadium.soundtrack.list({browse:true});$('trackList').replaceChildren(...tracks.map(t=>{const b=el('button',undefined,'trackchoice');b.append(el('b',t.title),el('small',`${FAMILY_NAMES[t.family]} · ${t.bpm} BPM · ${Math.round(t.duration)} sec`),el('span',t.description));b.onclick=()=>{stadium.settings.music=true;syncAudio();audioUnlock();stadium.soundtrack.choose(t.id);};return b;}));}
stadium.soundtrack.loadCatalog().then(renderTracks);
function auditionScore(play){stadium.settings.scoringMusic=true;syncAudio();audioUnlock().then(()=>{stadium.soundtrack.update({blocked:false});play();});}
for(const [id,team] of [['previewNE','NE'],['previewNYJ','NYJ'],['previewGB','GB'],['previewOther','BUF']])$(id).onclick=()=>auditionScore(()=>stadium.soundtrack.score(team));
for(const [id,take] of [['previewGB63','gb63'],['previewGB112','gb112']])$(id).onclick=()=>auditionScore(()=>stadium.soundtrack.previewScore(take));
function skipReplay(){if(game?.paused)return;replay.skip();keys={};resetStick();updateHUD();}
bindGameButton($('skipReplay'),skipReplay);
function replayHUD(){
 $('replayBar').hidden=false;$('replayTitle').textContent=replay.active.clip.kind;$('replayCount').textContent=replay.clips.length?`${replay.clips.length} more highlight${replay.clips.length===1?'':'s'}`:'SLOW MOTION';
 for(const id of ['readiness','flagNotice','penaltyPanel','kickPanel','coach','contactCue','changePlay'])$(id).hidden=true;quick.hidden=true;
 $('down').textContent='REPLAY';$('spot').textContent='CLOCK HELD';$('playName').textContent=replay.active.clip.kind;$('playerLabel').textContent='PGI INSTANT REPLAY · RECORDED ACTION';
 for(let i=0;i<3;i++)$('pass'+i).hidden=true;$('controlHint').hidden=false;$('controlHint').textContent='WATCH IT AGAIN';setGameButtonEnabled($('burst'),true);$('burst').replaceChildren(document.createTextNode('SKIP REPLAY'),el('span','SPACE'));
}
function setGuidance(value){guidance=['simple','moderate','expert'].includes(value)?value:'moderate';safeWrite('pg-guidance',guidance);$('guidance').value=$('pauseGuidance').value=guidance;document.body.dataset.guidance=guidance;$('guidanceInfo').textContent={simple:'Four suggested calls, short lessons. Swipe through the full team book.',moderate:'Four calls per page, with situation hints. Tap a diagram to call it.',expert:'The same four-card book, detailed ratings and minimal coaching prompts.'}[guidance];resetPlaybook();if(game){if(game.challenge)game.challenge.guidance=guidance;renderPlaybook();updateHUD();}if(roster){updateLobby();renderMode();}}
const personnelOptions=Object.entries(PERSONNEL).map(([id,p])=>`<option value="${id}">${p.name} · ${p.label}</option>`).join('');
for(const id of ['defensePackage','pauseDefensePackage']){const select=$(id);select.innerHTML=personnelOptions;select.value=safeRead('pg-defense-package','base');if(!PERSONNEL[select.value])select.value='base';select.onchange=()=>{safeWrite('pg-defense-package',select.value);for(const other of ['defensePackage','pauseDefensePackage'])$(other).value=select.value;if(game)game.defensePreference=select.value;updateSystemInfo();};}
$('guidance').onchange=()=>setGuidance($('guidance').value);$('pauseGuidance').onchange=()=>setGuidance($('pauseGuidance').value);setGuidance(safeRead('pg-guidance','moderate'));
for(const id of ['offenseSystem','awayOffenseSystem']){const select=$(id);select.replaceChildren(...[['team','Team identity'],...Object.entries(OFFENSIVE_SYSTEMS).map(([key,s])=>[key,s.name])].map(([key,name])=>{const o=el('option',name);o.value=key;return o;}));const saved=safeRead('pg-'+id,'team');select.value=OFFENSIVE_SYSTEMS[saved]?saved:'team';select.onchange=()=>{safeWrite('pg-'+id,select.value);updateLobby();updateSystemInfo();};}
function updateSystemInfo(){const s=OFFENSIVE_SYSTEMS[$('offenseSystem').value];$('offenseSystemInfo').textContent=s?`${s.strength}. Watch for: ${s.weakness.toLowerCase()}. ${s.plays.length} system calls in ${FORMATIONS[s.formation].name}.`:'Use this team’s identity and era book. Choose a named system to try its calls plus supporting plays.';for(const [select,note] of [['defensePackage','defenseSystemInfo'],['pauseDefensePackage','pauseDefenseInfo']]){$(note).textContent=PERSONNEL[$(select).value].hint+' Players stay on for the whole defensive possession. Changes apply next series.';}}
function teamFor(id){const team=DECADE_TEAMS.some(t=>t.id===id)?decadeTeam(id,custom[id]||{}):HISTORIC_TEAMS.some(t=>t.id===id)?historicTeam(id):buildTeam(id,roster,window.PGI_DUEL?{}:custom[id]||{});return window.PGI_DUEL||['training','campaign'].includes(mode)?team:withOffensiveSystem(team,$(id===$('homeTeam').value?'offenseSystem':'awayOffenseSystem').value);}
updateSystemInfo();
for(const t of TEAMS){for(const id of ['homeTeam','awayTeam']){const option=el('option',t.city);option.value=t.abbr;$(id).append(option);}}
const prefs=safeRead('pg-prefs',{});$('homeTeam').value=TEAMS.some(t=>t.abbr===prefs.home)?prefs.home:'NE';$('awayTeam').value=TEAMS.some(t=>t.abbr===prefs.away)?prefs.away:'BUF';
function ensureDifferent(changed){if($('homeTeam').value===$('awayTeam').value){const other=changed==='homeTeam'?'awayTeam':'homeTeam';$(other).value=[...$(other).options].find(o=>o.value!==$(changed).value).value;}}
function updateLobby(){if(!roster)return;for(const side of ['home','away']){const t=teamFor($(side+'Team').value);const a=t.offense;$(`${side}Stars`).replaceChildren(el('div',`QB ${a[0].name}`),el('div',`RB ${a[1].name}`));}const when=new Date(roster.fetchedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});renderIdentity();$('rosterStamp').textContent=`${roster.season} roster · ${roster.players.length.toLocaleString()} active players · checked ${when}. Refresh in the locker room.`;$('start').disabled=false;$('start').replaceChildren(document.createTextNode(window.PGI_DUEL?'CREATE A 1V1 ROOM':'LET’S PLAY FOOTBALL'),el('span','↗'));safeWrite('pg-prefs',{home:$('homeTeam').value,away:$('awayTeam').value});if(teamFor($('homeTeam').value).decade)$('rosterStamp').textContent='PGI All-Decade selections · individual arcade ratings · era-inspired books. 2020s is a selection so far.';if(teamFor($('homeTeam').value).historic)$('rosterStamp').textContent='Throwback vault · curated real game-day players · arcade ratings. Open the locker room to see the lineup.';renderMode();}
$('homeTeam').onchange=()=>{ensureDifferent('homeTeam');updateLobby();};$('awayTeam').onchange=()=>{ensureDifferent('awayTeam');updateLobby();};
function showDialog(id){$(id).showModal();}document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('pauseHelp').onclick=()=>showDialog('helpDialog');
$('showHelp').onclick=()=>showDialog('helpDialog');$('gameHelp').onclick=()=>{pause();showDialog('helpDialog');};
$('showRoster').onclick=()=>{if(roster){renderRoster();showDialog('rosterDialog');}};
function renderRoster(){const team=teamFor($('homeTeam').value),curated=!!(team.decade||team.historic);$('refreshRoster').hidden=curated;$('refreshStatus').hidden=curated;$('rosterListLabel').textContent=curated?'Full curated roster':'Full active roster';$('rosterSource').href=curated?(team.source||'https://www.profootballhof.com/news/nfl-s-all-decade-teams'):'https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html';$('rosterProvenance').textContent=team.historic?'Curated game-day recreation with estimated arcade ratings. The classic lineup is fixed. Injury events describe this simulated game only.':team.decade?'Curated PGI selections, not an official all-decade roster. Playbooks and player ratings are authored arcade interpretations. Injury events describe this simulated game only. The 2020s selection is a work in progress.':'Names, numbers and team assignments: nflverse. Active-roster snapshot, not official depth charts or game-day injury status. Lineups and ratings are our arcade choices. Roster refresh needs an internet connection.';if(team.historic){$('rosterTitle').textContent=team.city;$('rosterInfo').textContent='Curated game-day roster · real names and numbers · arcade ratings. The classic lineup is fixed.';$('lineupEditor').replaceChildren();renderRatings();$('rosterList').replaceChildren(...team.roster.map(p=>el('p',`#${p.number} ${p.name} · ${p.pos}`)));return;}renderRatings();$('rosterTitle').textContent=`${team.city}.`;$('rosterInfo').textContent=team.decade?`${team.roster.length} curated legends · estimated arcade ratings · ${team.decade}s${team.decade===2020?' so far':''}. Choose your starters below.`:`${team.roster.length} active players · ${roster.season} snapshot checked ${new Date(roster.fetchedAt).toLocaleDateString()}. Choose your arcade starters below.`;const editor=$('lineupEditor');editor.replaceChildren();const slots=[['qb','QB',['QB']],['rb','RB',['RB','FB']],['wr1','WR · A',['WR']],['wr2','WR · B',['WR']],['te','TE · C',['TE']],...SPECIAL_SLOTS];slots.forEach(([key,label,positions],i)=>{const row=el('label',label);const select=el('select');select.setAttribute('aria-label',label+' starter');for(const p of team.roster.filter(p=>positions.includes(p.pos)&&(key!=='gunner2'||p.id!==team.specialists.gunner1.id)).sort((a,b)=>a.name.localeCompare(b.name))){const option=el('option',`#${p.number} ${p.name}`);option.value=p.id;select.append(option);}select.value=(i<5?team.offense[i]:team.specialists[key]).id;select.onchange=()=>{custom[team.abbr]??={};custom[team.abbr][key]=select.value;if(key==='gunner1'&&team.specialists.gunner2.id===select.value)custom[team.abbr].gunner2=team.specialists.gunner1.id;if(key==='wr1'&&custom[team.abbr].wr2===select.value)delete custom[team.abbr].wr2;if(key==='wr2'&&team.offense[2].id===select.value){custom[team.abbr].wr1=team.offense[3].id;}safeWrite('pg-lineups',custom);renderRoster();updateLobby();};row.append(select);editor.append(row);});$('rosterList').replaceChildren(...team.roster.sort((a,b)=>a.pos.localeCompare(b.pos)||a.number-b.number).map(p=>{const row=el('div',undefined,'rosterrow');row.append(el('span',p.pos),el('span','#'+p.number),el('span',p.name));return row;}));}
function renderIdentity(){const team=teamFor($('homeTeam').value),opponent=teamFor($('awayTeam').value),p=team.profile;const ranks=Object.entries(teamStrengths(team)).sort((a,b)=>b[1]-a[1]);const box=$('teamIdentity');box.replaceChildren(el('b',`${team.abbr} · ${p.offense.name} / ${p.defense.name}`),el('p',`Strength: ${p.offense.strength}. Watch for: ${p.offense.weakness.toLowerCase()}.`),el('p',`Opponent identity: ${opponent.profile.defense.name}. ${opponent.profile.defense.weakness}.`));if(guidance==='expert')box.append(el('p',Object.entries(teamStrengths(team)).map(([k,v])=>`${k} ${v}`).join(' · ')));box.append(el('p',`Personnel edge: ${ranks[0][0].toLowerCase()}. Lowest unit rating: ${ranks.at(-1)[0].toLowerCase()}.`));box.append(el('small',`Arcade profiles and ratings · reviewed ${p.reviewed}`));}
function renderRatings(){const t=teamFor($('homeTeam').value);$('starterRatings').replaceChildren(el('h3','Player ratings · arcade estimates'),el('p','Speed sets top pace; acceleration sets first steps. Endurance controls sustained effort, durability reduces the chance of a short simulated absence. Blocking, tackling, agility and balance decide contact.'),...[...t.offense,...t.defense,...t.roster.filter(p=>![...t.offense,...t.defense].some(q=>q.id===p.id))].map(p=>{const row=el('details',undefined,'ratingrow');row.append(el('summary',`#${p.number} ${p.name} · ${p.pos}`),el('p',visibleRatings(p).map(k=>`${RATING_LABELS[k]} ${p[k]}`).join(' · ')),el('small',`${p.ratingSource} · ${p.ratingDate}`));return row;}));}
let refreshing=false;
async function refreshRoster(automatic=false){if(refreshing)return;refreshing=true;$('refreshRoster').disabled=true;const old=roster;$('refreshStatus').textContent='Checking the latest active rosters…';try{const data=await fetchFreshRoster();for(const t of TEAMS)buildTeam(t.abbr,data);roster=data;const stored=safeWrite('pg-rosters',data);if(!game){updateLobby();renderRoster();}$('refreshStatus').textContent=`Updated ${new Date(data.fetchedAt).toLocaleString()}. ${data.players.length.toLocaleString()} active players.${stored?'':' Browser storage unavailable; this update lasts for this visit.'}`;}catch(err){roster=old;$('refreshStatus').textContent=`Couldn’t reach a complete roster update. Keeping the working ${new Date(old.fetchedAt).toLocaleDateString()} snapshot. Try again later.`;}finally{refreshing=false;$('refreshRoster').disabled=false;}}
$('refreshRoster').onclick=()=>refreshRoster();
async function boot(){try{const res=await fetch('./rosters.json');if(!res.ok)throw Error('Roster unavailable');const bundled=await res.json();const cached=window.PGI_DUEL?null:safeRead('pg-rosters',null);roster=validateRoster(cached)&&Date.parse(cached.fetchedAt)>Date.parse(bundled.fetchedAt)?cached:bundled;if(!Array.isArray(roster.players)||roster.players.length<1200)throw Error('Incomplete roster');for(const t of TEAMS)buildTeam(t.abbr,roster);ensureDifferent('homeTeam');updateLobby();renderMode();if(!window.PGI_DUEL&&Date.now()-Date.parse(roster.fetchedAt)>86400000)refreshRoster(true);}catch(e){$('rosterStamp').textContent='The roster could not load. Check your connection, then reload.';$('start').textContent='RELOAD ROSTERS ↻';$('start').disabled=false;$('start').onclick=()=>location.reload();}}
// Suggested is page zero. The rest of the deck is the full eligible team book.
function resetPlaybook(){bookIndex=0;bookFilter='all';}
function turnBookPage(delta,{keyboard=false,deck=null}={}){
 const next=Math.max(0,Math.min(bookPages-1,bookIndex+delta));if(next===bookIndex)return false;
 bookIndex=next;if(!next)bookFilter='all';renderPlaybook();
 if(keyboard)deck?.querySelector('.playcards')?.focus({preventScroll:true});
 return true;
}
for(const deck of [$('plays'),quickButtons])bindHuddleSwipe(deck,(delta,options={})=>turnBookPage(delta,{...options,deck}));
function bindBookButton(button,action){button.onclick=event=>{if(!button.disabled)action(event);};}
function kickDiagram(type){
 const marks=type==='fieldgoal'
  ? '<path d="M70 12V36H130V12 M100 36V50" stroke="#f9d56f" stroke-width="4"/><path d="M100 97Q145 62 100 22" stroke="#ecae77" stroke-width="3" stroke-dasharray="5 4"/><ellipse cx="100" cy="97" rx="6" ry="3" fill="#f4d2a4" transform="rotate(-25 100 97)"/>'
  : '<ellipse cx="100" cy="21" rx="24" ry="8" fill="#8fc9ed" fill-opacity=".25" stroke="#8fc9ed"/><path d="M100 96Q145 52 100 21 M95 30L100 21L109 24" fill="none" stroke="#ecae77" stroke-width="3"/><ellipse cx="100" cy="97" rx="6" ry="3" fill="#f4d2a4"/>';
 return `<svg viewBox="0 0 200 112" aria-hidden="true"><path d="M15 50H185 M15 76H185" stroke="#41594e" stroke-dasharray="4 5"/>${marks}</svg>`;
}
function callPlay(play){
 if(play.kickType){if(kick(play.kickType))sound(330,.05);return;}
 if(!game.choose(play.id))return;
 renderPlaybook();updateHUD();field.focus({preventScroll:true});audioUnlock();sound(330,.05);
}
function renderPlaybook(){
 if(!game)return;
 if(game.challenge?.mode==='campaign'){$('plays').replaceChildren();quickButtons.replaceChildren();$('kicks').hidden=true;$('specialTeamsUnit').hidden=true;$('callTitle').textContent=game.item.name;$('callHint').textContent=guideText(game.item,guidance);quick.hidden=true;return;}
 const special=Boolean(game.special),turnover=Boolean(game.returnInfo||game.isLoose||game.phase==='penalty');
 const book=game.userOffense?game.humanPlays:[...game.humanPlays].sort((a,b)=>Number(!!b.system)-Number(!!a.system)),side=game.userOffense?'offense':'defense';
 if(side!==bookSide||!duel&&bookSession!==game){bookSide=side;bookSession=game;resetPlaybook();}
 const kicks=kickOptions(game),fullBook=[...book,...kicks];
 const page=bookPage(bookFilter==='kick'?kicks:fullBook,bookFilter==='kick'?'all':bookFilter,Math.max(0,bookIndex-1),4);
 bookPages=1+page.pages;if(bookIndex>0)bookIndex=page.page+1;
 const suggested=bookIndex===0,plays=special||turnover?[]:suggested?suggestions(game,book):page.plays;
 for(const box of [$('plays'),quickButtons]){
  box.replaceChildren();box.hidden=special||turnover;box.dataset.side=side;box.dataset.page=String(bookIndex);box.dataset.suggested=String(suggested);
  box.setAttribute('role','group');box.setAttribute('aria-label',`${game.userOffense?'Offensive':'Defensive'} play selection`);
  if(special||turnover)continue;
  const mast=el('div',undefined,'bookmast'),home=el('button','★ SUGGESTED','bookhome'),filter=el('select',undefined,'bookselect');
  home.setAttribute('aria-pressed',String(suggested));home.setAttribute('aria-label','Show four suggested plays');
  bindBookButton(home,event=>{resetPlaybook();renderPlaybook();if(event.detail===0)box.querySelector('.playcards')?.focus({preventScroll:true});});
  filter.setAttribute('aria-label',`Browse ${side} playbook`);
  const placeholder=el('option','FULL PLAYBOOK');placeholder.value='';placeholder.disabled=true;placeholder.hidden=true;filter.append(placeholder);
  const labels={all:'All plays',new:'New plays',run:'Runs',quick:'Quick passes',deep:'Deep passes',pa:'Play action',zone:'Zone coverage',man:'Man coverage',pressure:'Pressure',kick:'Kicking'};
  for(const [id] of [...BOOK_FILTERS[side],...(kicks.length?[['kick']]:[])]){
   if(id==='new'&&!book.some(p=>p.edition===31))continue;
   const option=el('option',labels[id]);option.value=id;filter.append(option);
  }
  filter.value=suggested?'':bookFilter;
  filter.onchange=()=>{bookFilter=filter.value;bookIndex=1;renderPlaybook();};
  mast.append(home,filter);box.append(mast);
  if(!game.userOffense)box.append(el('p',`${game.formation.name} set · ${PERSONNEL[game.personnel].name} unit`,'bookmatchup'));
  const cards=el('div',undefined,'playcards');cards.tabIndex=0;cards.setAttribute('role','group');cards.setAttribute('aria-label',`${suggested?'Suggested plays':'Playbook page '+bookIndex}. Tap a card to call it; swipe or use arrow keys for more.`);
  for(const p of plays){
   const button=el('button',undefined,'play playcard'),signature=game.teams[game.humanTeam??0].profile?.[side]?.signature?.includes(p.id);
   let diagram,meta;
   if(p.kickType){diagram=kickDiagram(p.kickType);meta=p.kickType==='fieldgoal'?`${Math.round(117-game.spot)} YD · FIELD GOAL`:'SPECIAL TEAMS · PUNT';button.classList.add('kickcard');}
   else if(game.userOffense){
    diagram=offenseBoard(p,game.format);
    if(p.kind==='run')diagram=diagram.replace('viewBox="0 0 238 126"','viewBox="0 44 238 82"');
    const type=p.playAction?'PA':p.kind==='run'?'RUN':p.group==='deep'?'DEEP PASS':'QUICK PASS';
    meta=`${type} · ${FORMATIONS[packageOf(p)]?.name||'Special look'}`;
   }else{
    const focus=p.group==='pressure'?'Rush':p.group==='man'?'Man':'Zone',board=defenseBoard(game,p,focus);
    // Tiny jersey labels obscure the shape at card size; the field retains the
    // selected defender's complete assignment once the call is made.
    diagram=board.diagram.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g,'');
    meta=Object.entries(board.counts).map(([kind,count])=>`${count} ${kind.toLowerCase()}`).join(' · ');
   }
   const chalk=el('div',undefined,'playchalk');chalk.innerHTML=diagram;
   const reason=suggested?(p.reason||p.hint):p.hint;
   button.append(el('b',(signature?'★ ':'')+p.name),el('span',meta,'playmeta'),chalk,el('small',reason||'Tap to call','playreason'));
   button.dataset.play=p.id;if(p.kickType)button.dataset.kick=p.kickType;
   if(p.playAction)button.classList.add('playaction');
   button.setAttribute('aria-label',`Call ${p.name}. ${meta}. ${reason||''}`);button.title=p.hint||p.name;
   bindBookButton(button,()=>callPlay(p));button.disabled=!['call','ready'].includes(game.phase);
   if(!p.kickType&&(game.userOffense?game.play:game.defense)===p.id&&game.phase==='ready')button.classList.add('active');
   cards.append(button);
  }
  // Keep the last partial page in the same two-by-two geometry.
  for(let i=plays.length;i<4;i++){const empty=el('div',undefined,'playempty');empty.setAttribute('aria-hidden','true');cards.append(empty);}
  const nav=el('div',undefined,'booknav'),prev=el('button','←','bookprev'),next=el('button','→','booknext'),status=el('span',undefined,'bookstatus');
  prev.setAttribute('aria-label','Previous page of plays');next.setAttribute('aria-label','Next page of plays');prev.disabled=bookIndex===0;next.disabled=bookIndex===bookPages-1;
  bindBookButton(prev,event=>turnBookPage(-1,{keyboard:event.detail===0,deck:box}));bindBookButton(next,event=>turnBookPage(1,{keyboard:event.detail===0,deck:box}));
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.append(el('b',`${suggested?'SUGGESTED':labels[bookFilter].toUpperCase()} · ${bookIndex+1} / ${bookPages}`),el('small',suggested?'Swipe for the full playbook':'Swipe to browse · tap to call'));
  nav.append(prev,status,next);box.append(cards,nav);
 }
 const unit=$('specialTeamsUnit');unit.hidden=!game.special;
 if(game.special){const s=game.special;unit.replaceChildren(el('b','THE THIRD PHASE'),el('p',s.goal?`${game.players[0].name} · ${s.distance}-yard ${s.type==='extra'?'extra point':'field goal'}`:`${game.carrier.name} · returner`));if(!s.goal)unit.append(el('p',`${game.defenders[6].name} · ${s.type==='punt'?'punter':'kicker'}`),el('small',`Gunners: ${game.defenders[0].name} · ${game.defenders[1].name}`));}
 $('sideTag').textContent=game.phase==='penalty'?'PENALTY':game.isLoose?'LOOSE BALL':turnover?'RETURN':special?'SPECIAL TEAMS':game.userOffense?'OFFENSE':'DEFENSE';
 $('callTitle').textContent=game.phase==='penalty'?'Make the decision.':game.isLoose?'Chase the ball.':turnover?(game.userOffense?'Take it all the way.':'Make the stop.'):special?(game.userKicking?'Win the field.':'Find your lane.'):game.userOffense?'Make the call.':'Make the stop.';
 $('callHint').textContent=game.special?.goal?'Tap START METER, lock power in green, then time the accuracy marker.':game.phase==='penalty'?'Accept the enforcement or decline and keep the play result. Use the buttons below.':game.isLoose?'The ball is live. Move toward it to recover; either team can take possession.':turnover?(game.userOffense?'Run upfield with the stick. Burst through a gap; contact can still cause a fumble.':'Possession changed. Switch to the closest defender, then chase and dive to stop the return.'):special?'Kicks travel downscreen. Returns go upfield. Aim with the stick or A/B/C; tap twice to set power. On an incoming punt, B calls a fair catch.':game.userOffense?'Tap a diagram to call the play. Swipe through four calls at a time; Suggested adapts to the situation. Formation is included on each card.':(duel?'Choose coverage privately. Both players must call a play before the offense can snap. Position your defender, switch, shed blocks or dive.':`${game.formation.name} is set. Choose coverage with your ${PERSONNEL[game.personnel].name.toLowerCase()} personnel; the CPU then snaps. Its play stays hidden.`);
 quick.firstChild.textContent=game.userOffense?'CHOOSE YOUR PLAY':'CHOOSE YOUR DEFENSE';
}
function start(){if(!roster)return;if(!duel&&['training','campaign'].includes(mode)){startChallenge();return;}if(duel){audioUnlock();if(duel.room?.status==='final'){duel.ready();$('resultTitle').textContent='Rematch requested · waiting for your friend';return;}duel.create({home:$('homeTeam').value,away:$('awayTeam').value,length:$('gameLength').value});return;}replay.reset();stadium.soundtrack.stopScore();audioUnlock().then(()=>stadium.soundtrack.warmScores([$('homeTeam').value,$('awayTeam').value]));ensureDifferent('homeTeam');game=new Game(teamFor($('homeTeam').value),teamFor($('awayTeam').value),$('difficulty').value,Math.random,{length:$('gameLength').value,defensePackage:$('defensePackage').value,format:Number($('fieldFormat').value),playClock:$('playClockSetting').checked,tvTimeouts:$('tvTimeoutSetting').checked,weather:forecast});resetPlaybook();bookSide='';endShown=false;lastPhase=game.phase;keys={};resetStick();$('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');$('footer').hidden=true;for(const d of document.querySelectorAll('dialog'))d.close();$('lastPlay').textContent='Opening kickoff. Get ready to return.';renderPlaybook();updateHUD();resizeField();window.scrollTo(0,0);game.paused=true;openBroadcast(pregameReport(game.teams,game.match,game.weather));}
$('start').onclick=start;$('rematch').onclick=start;
function menu(){if(duel?.room)duel.leave();replay.reset();stadium.soundtrack.stopScore();game=null;keys={};resetStick();document.body.classList.remove('playing');$('lobby').hidden=false;$('game').hidden=true;$('footer').hidden=false;for(const d of document.querySelectorAll('dialog'))d.close();updateLobby();renderMode();window.scrollTo(0,0);}
$('quit').onclick=menu;$('newTeams').onclick=menu;
function pause(){if(!game||game.phase==='final')return;if(halftimeShow.openNow||game.phase==='halftime'||$('challengeBrief').open||$('challengeResult').open){keys={};resetStick();return;}for(const id of ['defenderDialog','lessonDialog'])if($(id).open)$(id).close();if(duel)duel.pause();else game.paused=true;keys={};resetStick();if(!$('pauseDialog').open)showDialog('pauseDialog');}
$('pause').onclick=pause;$('resume').onclick=()=>{if(duel){duel.resume();$('resume').textContent='READY · WAITING FOR FRIEND';return;}game.paused=false;$('pauseDialog').close();updateHUD();audioUnlock();};$('pauseDialog').addEventListener('cancel',e=>{e.preventDefault();$('resume').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stadium.chatter.stop();pause();}});window.addEventListener('blur',()=>{if(game&&!duel)pause();});
function snap(){if(game&&!game.paused&&game.userOffense&&game.snap(0)){toastUntil=0;$('message').replaceChildren();updateHUD();renderPlaybook();audioUnlock();}}
bindGameButton($('changePlay'),()=>{if(game&&!game.paused&&game.phase==='ready'&&!duel){game.phase='call';renderPlaybook();updateHUD();}});
function primaryAction(){if(game?.phase==='tv_timeout'){game.resumeTV();updateHUD();return;}if(game instanceof ChallengeGame&&game.phase.startsWith('moment')){game.momentAction();updateHUD();audioUnlock();return;}if(duel&&game?.phase==='penalty'&&game.penaltyReview?.beneficiary!==duel.team)return;if(duel&&['kick_ready','kick_charge','kick_accuracy'].includes(game?.phase)&&!game.userKicking)return;if(replay.active){skipReplay();return;}const action=primaryCommand(game);if(action==='snap')snap();else if(action==='kick')game.kickAction();else if(action==='accept')game.resolvePenalty(true);else if(action==='break')game.breakTackle();else if(action==='burst')game.burst();updateHUD();audioUnlock();}
function receiverAction(i){if(replay.active||!game||game.paused)return;if(game.phase==='penalty'){if(duel&&game.penaltyReview?.beneficiary!==duel.team)return;if(i===0)game.resolvePenalty(false);updateHUD();return;}if(game.special?.goal)return;
 if(game.userOffense&&i===1&&game.canKneel){game.takeKnee();updateHUD();return;}
 if(game.phase==='kick_ready'&&game.userKicking&&game.special.type==='kickoff'){game.chooseKickStyle(['deep','squib','onside'][i]);updateHUD();return;}
 if(!duel&&game.phase==='kick_ready'&&game.userOffense){game.chooseReturnPlan(['left','middle','right'][i]);updateHUD();return;}if(['kick_ready','kick_charge','kick_accuracy'].includes(game.phase)&&game.userKicking){if(duel)duel.command('aim',[[-.68,0,.68][i]]);else game.special.aim=[-.68,0,.68][i];}else if(game.phase==='kick_flight'&&game.userOffense&&i===1)game.fairCatch();else if(game.userOffense)game.throwTo(i,movementInput(stick,keys));else if(i===0)game.switchDefender();else if(i===1)game.switchDefender('cycle');else openDefenders();updateHUD();}
bindGameButton($('burst'),primaryAction);
for(let i=0;i<3;i++)bindGameButton($('pass'+i),()=>receiverAction(i));
function openDefenders(){if(!game||game.userOffense||game.paused||!['call','ready'].includes(game.phase))return;if(!duel)game.paused=true;resetStick();keys={};$('defenderList').replaceChildren(...game.defenders.map((p,i)=>{const b=el('button',`#${p.number} ${p.name} · ${p.pos}${i===game.selected?' · SELECTED':''}`,'defenderchoice');b.append(el('small',guidance==='expert'?`Tackle ${p.tackling} · Coverage ${p.coverage} · Reads ${p.recognition}`:p.slot<2?'Defensive front':p.slot<4?'Linebacker':'Secondary'));b.onclick=()=>{if(!duel)game.paused=false;game.selectDefender(i);$('defenderDialog').close();updateHUD();};return b;}));$('defenderDialog').showModal();}
function closeDefenders(){if(game&&!duel)game.paused=false;$('defenderDialog').close();updateHUD();}
$('closeDefenders').onclick=closeDefenders;$('defenderDialog').addEventListener('cancel',e=>{e.preventDefault();closeDefenders();});
field.addEventListener('pointerdown',e=>{if(replay.active||!game||game.userOffense||game.paused||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();const r=field.getBoundingClientRect(),index=hitDefender(defenderHits,e.clientX-r.left,e.clientY-r.top,28);if(index!==null){game.selectDefender(index);updateHUD();}});
const seenLessons=safeRead('pg-lessons',{});
function maybeLesson(){if(duel||game instanceof ChallengeGame)return;if(!game||game.paused||guidance!=='simple')return;let key='';if(game.phase==='kick_ready')key='kick';else if(game.phase==='call')key=game.userOffense?'offense':'defense';if(!key||seenLessons[key])return;const lessons={kick:['Track, then return.','Tap READY TO RETURN. Steer to the landing ring with your left thumb, then turn upfield. BURST is bottom right.'],offense:['Four downs. One gold line.','Tap one of four diagram cards to call it. Swipe left or right for more plays; the first page adapts to the situation. SNAP is bottom right. Pass with A, B or C. Hold the left stick to place the pass in that direction; center it for assisted placement. Near a tackler, the action becomes BREAK TACKLE; a move costs stamina and may expose the ball.'],defense:['Choose the defender you want.','The opponent’s play is hidden. Choose coverage, then tap a defender on the field or open PICK. NEAREST selects near the ball, NEXT cycles. Stay behind the blue line: the CPU snaps automatically.']};[$('lessonTitle').textContent,$('lessonText').textContent]=lessons[key];$('lessonDialog').dataset.lesson=key;game.paused=true;resetStick();$('lessonDialog').showModal();}
function dismissLesson(){seenLessons[$('lessonDialog').dataset.lesson]=true;safeWrite('pg-lessons',seenLessons);$('lessonDialog').close();if(game)game.paused=false;updateHUD();audioUnlock();}
$('lessonDone').onclick=dismissLesson;$('lessonDialog').addEventListener('cancel',e=>{e.preventDefault();dismissLesson();});
function kick(type){if(!game||game.paused||!game.kick(type))return false;updateHUD();renderPlaybook();field.focus({preventScroll:true});audioUnlock();return true;}
for(const b of [$('punt'),quickPunt])bindGameButton(b,()=>kick('punt'));
for(const b of [$('fieldGoal'),quickFieldGoal])bindGameButton(b,()=>kick('fieldgoal'));
window.addEventListener('keydown',e=>{if(!game||halftimeShow.openNow||game.phase==='halftime'||e.target.closest?.('.plays')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','1','2','3','w','a','s','d','p'].includes(e.key))e.preventDefault();if(e.repeat)return;if(replay.active&&e.key.toLowerCase()!=='p'){if(e.key===' '||e.key==='Escape')skipReplay();return;}keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='p'){if(document.querySelector('dialog[open]')&&!$('pauseDialog').open)return;if(game.paused)$('resume').click();else pause();}if(game.paused)return;if(e.key===' ')primaryAction();if('123'.includes(e.key))receiverAction(Number(e.key)-1);});
window.addEventListener('keyup',e=>{delete keys[e.key.toLowerCase()];});
const joy=$('joystick'),moveZone=$('moveZone');function resetStick(){stick={x:0,y:0};joyPointer=null;$('stick').style.transform='translate(0px, 0px)';}
function joyMove(e){if(e.pointerId!==joyPointer)return;e.preventDefault();const r=joy.getBoundingClientRect(),v=stickInput(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,r.width*.32);stick={x:v.x,y:v.y};$('stick').style.transform=`translate(${v.px}px, ${v.py}px)`;}
moveZone.onpointerdown=e=>{if(replay.active||joyPointer!==null||e.pointerType==='mouse'&&e.button!==0)return;joyPointer=e.pointerId;moveZone.setPointerCapture(e.pointerId);joyMove(e);};moveZone.onpointermove=joyMove;moveZone.onpointerup=e=>{if(e.pointerId===joyPointer)resetStick();};moveZone.onpointercancel=moveZone.onlostpointercapture=()=>resetStick();
window.addEventListener('orientationchange',resetStick);
function updateHUD(){
 if(!game)return;
 if(replay.active){aimCue.hidden=true;replayHUD();return;}$('replayBar').hidden=true;
 const g=game;updateExtrasHUD();updateWeatherHUD();const ready=['call','ready'].includes(g.phase),s=g.special,kickSetup=['kick_ready','kick_charge','kick_accuracy'].includes(g.phase),flight=['kick_flight','kick_loose'].includes(g.phase);
 fieldWrap.classList.toggle('choosing',g.phase==='call');
 const aim=passAim(movementInput(stick,keys));aimCue.hidden=!(g.userOffense&&g.canPass&&!g.paused);aimCue.textContent=aim.amount?`PLACE ${aim.y>.25?'↑':aim.y<-.25?'↓':''}${aim.x>.25?'→':aim.x<-.25?'←':''} · ${Math.round(aim.amount*100)}%`:'CENTERED · ASSISTED PASS';$('joystick').lastElementChild.textContent=g.canPass&&g.userOffense?'MOVE + LEAD':'MOVE';
 $('homeAbbr').textContent=g.teams[0].abbr;$('awayAbbr').textContent=g.teams[1].abbr;$('homeScore').textContent=g.scores[0];$('awayScore').textContent=g.scores[1];$('quarter').textContent=g.phase==='halftime'?'HALF':g.quarter>4?'OT':`Q${g.quarter}`;$('clock').textContent=g.quarter>4?'SD':clockText(g.clock);
 $('possession').textContent=kickSetup||flight?(s?.goal?(g.userKicking?'YOUR KICK ↑':'OPPONENT KICK ↑'):(g.userKicking?'YOU KICK ↓':'YOU RETURN ↑')):g.userOffense?'YOUR BALL ↑':'DEFEND ↑';
 $('down').textContent=g.phase==='penalty'?'FLAG':g.isLoose?'FUMBLE':g.returnInfo?'RETURN':s?s.type.toUpperCase():`${['1ST','2ND','3RD','4TH'][g.down-1]} & ${g.target===100?'GOAL':Math.max(1,Math.ceil(g.target-g.spot))}`;
 const settledKick=g.phase==='dead'&&s?.settled&&!s.goal;
 const yard=settledKick?s.settled.spot:g.isReturn?g.carrier.y:g.spot;
 $('spot').textContent=s&&kickSetup?`KICK FROM ${s.kickSpot}`:yard<=0?'OWN END ZONE':yard>=100?'END ZONE':yard<50?`OWN ${Math.round(yard)}`:`OPP ${Math.round(100-yard)}`;
 $('playName').textContent=settledKick?s.settled.reason.toUpperCase():g.canKneel&&g.userOffense?'RETURN OR KNEEL':g.phase==='penalty'?'ACCEPT OR DECLINE':g.isLoose?'CHASE THE BALL':g.returnInfo?(g.userOffense?'RUN UPFIELD ↑':'STOP THE RETURN'):s?(flight?'TRACK THE BALL':g.isReturn?(g.userOffense?'RUN UPFIELD ↑':'STOP THE RETURN'):'SPECIAL TEAMS'):g.phase==='call'?'PICK A PLAY':g.userOffense?g.playDefinition.name.toUpperCase():DEFENSE.find(p=>p.id===g.defense).name.toUpperCase();
 quick.hidden=g.phase!=='call';$('changePlay').hidden=!!duel||g.phase!=='ready'||g.challenge?.mode==='campaign';
 // Kicks are cards in the deck, including the situation-aware first page.
 $('kicks').hidden=quickKicks.hidden=true;
 for(const b of [$('fieldGoal'),quickFieldGoal]){b.disabled=117-g.spot>65;b.textContent=`Field goal · ${Math.round(117-g.spot)} yd`;}
 const burstLabel=g.phase==='tv_timeout'?'BACK TO FOOTBALL':g.phase==='moment_ready'?'START THE MOMENT':g.phase==='moment'?(g.moment.stage==='intro'?'TRACK THE BALL':g.moment.stage==='bump'?'BUMP FORWARD':g.moment.stage==='dive'?'DIVE ON IT':g.moment.id==='immaculate'?'SCOOP IT':'CATCH IT'):g.phase==='penalty'?'ACCEPT':g.phase==='ready'?(g.userOffense?'SNAP THE BALL':(duel?'OPPONENT WILL SNAP':`CPU SNAP · ${Math.max(1,Math.ceil(g.cpuSnapIn))}`)):g.phase==='call'?'CHOOSE A PLAY':g.phase==='dead'?'PLAY OVER':kickSetup?(g.userKicking?(g.phase==='kick_accuracy'?'KICK!':g.phase==='kick_charge'?(s.goal?'SET POWER':'KICK!'):'START METER'):s.goal?'OPPONENT KICKS':'READY TO RETURN'):g.isLoose?'LOOSE BALL':g.userOffense&&g.fakeActive?'SELL THE FAKE':g.userOffense?(g.pass?'PASS IN AIR':g.breakArm?'MOVE SET':g.breakAvailable?'BREAK TACKLE':g.contact?'CONTACT':'BURST'):g.controlled.blocked?'SHED BLOCK':'DIVE';
 setGameButtonEnabled($('burst'),Boolean(primaryCommand(g)||g.phase==='tv_timeout'||g.phase.startsWith('moment')));$('burst').dataset.action=primaryCommand(g)||'wait';
 $('burst').replaceChildren(document.createTextNode(burstLabel),el('span',primaryCommand(g)?'SPACE':''));
 for(let i=0;i<3;i++){
  const button=$('pass'+i);let label='—',name='',enabled=false;button.hidden=true;
  if(g.phase==='penalty'){if(i===0){label='DECLINE';name='KEEP THE PLAY';enabled=true;}}
  else if(!duel&&g.phase==='kick_ready'&&g.userOffense&&!s.goal){label=['↖','↑','↗'][i];name=['RETURN L','MIDDLE','RETURN R'][i];enabled=true;}
  else if(g.phase==='kick_ready'&&g.userKicking&&s.type==='kickoff'){label=['A','B','C'][i];name=['DEEP','SQUIB','ONSIDE'][i];enabled=true;}
  else if(g.userOffense&&g.canKneel&&i===1){label='B';name='TAKE KNEE';enabled=true;}
  else if(kickSetup&&g.userKicking&&!s.goal){label=['↙','↓','↘'][i];name=['LEFT','CENTER','RIGHT'][i];enabled=true;}
  else if(flight&&g.userOffense){if(i===1&&s.type==='punt'){label=s.fair?'✓':'B';name=s.fair?'CALLED':'FAIR';enabled=g.phase==='kick_flight'&&!s.fair;}}
  else if(g.userOffense&&!s&&!g.returnInfo&&!g.isLoose&&g.playDefinition.kind==='pass'&&['call','ready','live'].includes(g.phase)&&!g.passed){label='ABC'[i];name=g.players[i+2].name.split(' ').slice(-1)[0];enabled=g.canPass;}
  else if(!g.userOffense&&!s?.goal){label=['◎','↻','☷'][i];name=['NEAREST','NEXT','PICK'][i];enabled=i===2?['call','ready'].includes(g.phase):g.isLive||g.isLoose||flight||['call','ready'].includes(g.phase);}
  button.hidden=label==='—'||!enabled&&!g.userOffense;button.firstChild.textContent=label;button.lastChild.textContent=name;button.classList.toggle('returnselected',!duel&&g.phase==='kick_ready'&&g.userOffense&&!s?.goal&&s?.returnPlan===['left','middle','right'][i]||g.phase==='kick_ready'&&g.userKicking&&s?.type==='kickoff'&&s.kickStyle===['deep','squib','onside'][i]);setGameButtonEnabled(button,enabled);
 }
 const advice=coachText(g,guidance);$('coach').hidden=!advice||g.phase==='call'||g.phase==='penalty'||kickSetup;$('coach').textContent=advice;quick.dataset.guidance=guidance;quickHelp.hidden=true;
 $('contactCue').hidden=!g.contact||!g.userOffense;$('contactCue').textContent=g.offBalance>0?'OFF BALANCE · BREAK TACKLE?':'CONTACT · BREAK TACKLE';
 const shown=[0,1,2].some(i=>!$('pass'+i).hidden);$('controlHint').hidden=shown;
 $('controlHint').textContent=s?.goal?(g.phase==='kick_accuracy'?'STOP THE MARKER IN GREEN':g.phase==='kick_charge'?'SET POWER IN GREEN':'POWER · THEN ACCURACY'):g.fakeActive?'SELL THE FAKE · THEN THROW':g.pitch?'FOLLOW THE EXCHANGE':g.isLoose?'CHASE THE LOOSE BALL':g.phase==='ready'&&!g.userOffense?'WATCH THE SNAP':g.phase==='call'?'CHOOSE A PLAY ABOVE':g.phase==='dead'?'NEXT PLAY COMING':g.pass?'TRACK THE PASS':g.userOffense?'FOLLOW YOUR BLOCKS ↑':'GET READY TO DEFEND';
 $('readiness').hidden=g.phase!=='ready';
 const across=!g.userOffense&&g.controlled.y<g.spot+.45;
 $('readiness').classList.toggle('warning',across);
 $('readiness').textContent=g.userOffense?'SNAP WITH YOUR RIGHT THUMB ↘':across?'GET BACK BEHIND THE BLUE LINE!':`${g.formation.name.toUpperCase()} · ${PERSONNEL[g.personnel].name.toUpperCase()} D`;
 $('flagNotice').hidden=!g.flags.length||g.phase==='penalty';$('flagNotice').textContent=g.flags.length?`⚑ FLAG · ${g.teams[g.flags[0].team].abbr}`:'';
 $('penaltyPanel').hidden=g.phase!=='penalty';
 if(g.penaltyReview){const r=g.penaltyReview;$('penaltyName').textContent=r.description||r.accept.title;$('penaltyAccept').textContent=`ACCEPT: ${r.accept.detail}`;$('penaltyDecline').textContent=`DECLINE: ${r.decline?.title||''} · ${r.decline?.detail||''}`;}
 $('kickPanel').hidden=!kickSetup;$('kickMeter').hidden=!(kickSetup&&g.userKicking);
 $('kickPanel').classList.toggle('goalpanel',!!s?.goal);
 if(kickSetup&&s.goal){
  const w=goalWindow(g.players[0],s.distance,kickConditions(g)),accuracy=g.phase==='kick_accuracy',value=accuracy?s.accuracy:s.power;
  $('kickTitle').textContent=`${g.teams[s.kickingTeam].abbr} · ${s.type==='extra'?'EXTRA POINT':'FIELD GOAL'} · ${s.distance} YD`;
  $('kickHint').textContent=!g.userKicking?'Opponent lining up the kick…':accuracy?'Tap KICK when the moving marker reaches the green zone.':g.phase==='kick_charge'?'Tap SET POWER in the green range. Then time your accuracy.':'Tap START METER → SET POWER → KICK. Three taps, all with your right thumb.';
  $('kickAim').textContent=accuracy?`POWER LOCKED ${Math.round(s.power*100)}% · AIM FOR GREEN`:`${s.distance>w.range?'BEYOND KICKER RANGE':`NEED ${Math.ceil(w.minPower*100)}% POWER`} · wind-adjusted green zone`;
  $('kickPower').classList.add('goalbar');$('kickPower').style.setProperty('--zone-left',`${(accuracy?w.low:w.minPower)*100}%`);$('kickPower').style.setProperty('--zone-width',`${(accuracy?w.high-w.low:1-w.minPower)*100}%`);$('kickPower').style.setProperty('--marker',`${value*100}%`);
  $('kickPower').setAttribute('aria-label',accuracy?'Kick accuracy: stop in green':'Kick power: stop in green');$('kickPower').setAttribute('aria-valuenow',String(Math.round(value*100)));$('kickFill').style.width='100%';$('kickReading').textContent=`${Math.round(value*100)}%`;
 }else if(kickSetup){
  $('kickPower').classList.remove('goalbar');$('kickPower').setAttribute('aria-label','Kick power');
  $('kickTitle').textContent=`${s.type.toUpperCase()} · ${g.userKicking&&s.type==='kickoff'?s.kickStyle.toUpperCase()+' · ':''}${g.defenders[6].name}`;
  $('kickHint').textContent=g.userKicking?(g.phase==='kick_charge'?'Tap KICK to stop the meter. Aim with stick or arrows.':(s.type==='kickoff'?'Choose Deep, Squib or Onside. Aim with the stick, then start the meter.':'Aim with stick or arrows. Tap START METER, then KICK.')):`${g.carrier.name} returns · ${RETURN_PLANS[s.returnPlan]?.name||'Return middle'}. Choose a lane below, then READY.${s.type==='punt'?' B calls a fair catch in flight.':''}`;
  const target=g.kickTarget(g.phase==='kick_charge'?s.power:.7,s.aim);
  $('kickAim').textContent=g.userKicking?`${s.aim<-.15?'LEFT':s.aim>.15?'RIGHT':'CENTER'} · ${target.y<=0?'END ZONE':`landing near receiving ${Math.round(target.y)}`} · ${target.x<1||target.x>52?'OUT OF BOUNDS RISK':'more power = more distance'}`:'Steer to the landing ring. In your end zone, B takes a knee after the catch.';
  if(g.userKicking&&s.kickStyle==='onside')$('kickAim').textContent=`FIRST HOP · ${Math.round(100-s.kickSpot-target.y)} YD FROM TEE · RECOVER AFTER 10`;
  $('kickFill').style.width=`${s.power*100}%`;$('kickReading').textContent=`${Math.round(s.power*100)}%`;$('kickPower').setAttribute('aria-valuenow',String(Math.round(s.power*100)));
 }
 if(duel){if(g.phase==='call'&&g.calls?.[duel.team]){$('readiness').hidden=false;$('readiness').textContent='YOUR PLAY IS SET · WAITING FOR OPPONENT';}if(g.phase==='penalty'&&g.penaltyReview?.beneficiary!==duel.team){setGameButtonEnabled($('burst'),false);$('burst').firstChild.textContent='OPPONENT DECIDES';for(let i=0;i<3;i++)$('pass'+i).hidden=true;}if(kickSetup&&!g.userKicking){setGameButtonEnabled($('burst'),false);$('burst').firstChild.textContent='OPPONENT KICKS';} }
 const player=g.controlled,role=s?.goal?'KICKER':s?(g.userOffense?'RETURNER':g.phase==='kick_ready'||g.phase==='kick_charge'?(s.type==='punt'?'PUNTER':'KICKER'):g.selected<2?'GUNNER':'COVERAGE'):null;$('playerLabel').textContent=player?`#${player.number} ${player.name.toUpperCase()}${role?' · '+role:g.userOffense?'':` · ${player.pos} · SELECTED`}`:'';
 $('energyFill').parentElement.setAttribute('aria-label',g.userOffense?'Runner stamina':'Defensive action recovery');$('energyFill').parentElement.setAttribute('aria-valuenow',String(Math.round(g.userOffense?g.stamina:100*(1-g.diveCooldown/1.7))));
 $('energyFill').style.width=`${kickSetup?100:g.userOffense?g.stamina:100*(1-g.diveCooldown/1.7)}%`;
 if(g.challenge?.mode==='campaign'){$('coach').hidden=true;quickHelp.hidden=true;$('playName').textContent={catch:'THE CATCH',immaculate:'SCOOP & RUN',roller:'HOLY ROLLER',edelman:'KEEP IT OFF GRASS'}[g.challenge.id];if(g.phase.startsWith('moment')){$('controlHint').hidden=false;$('controlHint').textContent='TRACK · MOVE · TIME THE CATCH';$('burst').lastElementChild.textContent='SPACE';}}
}
function toast(text,detail='',seconds=1.5){$('message').replaceChildren(el('span',text));if(detail)$('message').append(el('small',detail));toastUntil=performance.now()+seconds*1000;}
function processEvents(){let healthUpdate=null,newCall=false;for(const e of game.events.splice(0)){stadium.event(e);if(e.type==='call'){resetPlaybook();newCall=true;}if(e.type==='challenge'){finishChallenge();continue;}if(e.type==='result'){$('lastPlay').textContent=game.lastResult;toast(e.text,e.detail,2.1);}else if(e.type==='injury'){healthUpdate=e;}else if(['ball','turnover','handoff','shed','flag','escape'].includes(e.type))toast(e.text,e.detail,e.type==='turnover'?1.5:.8);else if(e.type==='penalty'){toastUntil=0;$('message').replaceChildren();}else if(e.type==='special'&&!['kick_ready','kick_charge','kick_accuracy'].includes(game.phase))toast(e.text,e.detail,1.1);else if(['overtime','quarter'].includes(e.type))toast(e.text,e.detail,1.4);else if(e.type==='halftime')showHalftime();else if(e.type==='final')finishGame();}if(game.phase!==lastPhase||newCall){lastPhase=game.phase;renderPlaybook();updateHUD();maybeLesson();}if(healthUpdate){toast(healthUpdate.text,healthUpdate.detail,4);$('lastPlay').textContent=healthUpdate.detail;}}
function finishGame(){if(endShown)return;endShown=true;$('resultTitle').textContent=game.scores[game.humanTeam??0]>game.scores[1-(game.humanTeam??0)]?'That’s a win.':'One more game?';$('resultScore').textContent=`${game.teams[0].city} ${game.scores[0]} — ${game.scores[1]} ${game.teams[1].city}`;$('resultStats').textContent=`${game.stats.yards} offensive yards · ${game.stats.completions}/${game.stats.attempts} passing · ${game.stats.tackles} team tackles · ${game.stats.returnYards} return yards · ${game.stats.takeaways} takeaways · ${game.stats.interceptions} INT thrown · ${game.stats.fumblesLost} fumbles lost · ${game.stats.brokenTackles} broken tackles · ${game.stats.penalties} penalties / ${Math.round(game.stats.penaltyYards)} yd`;if(duel){const b=game.box[duel.team];$('resultStats').textContent=`${game.teams[duel.team].abbr} · ${b.rushYards+b.passYards} offensive yards · ${b.completions}/${b.attempts} passing · ${b.returnYards} return yards · ${b.takeaways} takeaways · ${b.interceptions} INT thrown · ${b.fumblesLost} fumbles lost`;}openBroadcast(postgameReport(game,replay.fullHighlights));}
// Original pixel sprites and stadium graphics, drawn at a fixed internal resolution.
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function txt(c,text,x,y,size=10,color='#e4edd4',align='center'){c.fillStyle=color;c.font=`bold ${size}px monospace`;c.textAlign=align;c.fillText(text,Math.round(x),Math.round(y));}
function sprite(c,x,y,color,accent,number,phase=0,controlled=false,ball=false,scale=1,kit=null){color=kit?.jersey||color;accent=kit?.helmet||accent;c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);rect(c,-8,5,17,5,'#092d2b66');if(controlled){c.strokeStyle='#f9da7d';c.lineWidth=2;c.strokeRect(-11,-12,22,27);rect(c,-3,17,6,3,'#f9da7d');}const step=Math.sin(phase)>0?2:-2;rect(c,-5,5,4,7+step,kit?.pants||'#e7e9ce');rect(c,2,5,4,7-step,kit?.pants||'#e7e9ce');rect(c,-6,10+step,5,3,'#15252b');rect(c,2,10-step,5,3,'#15252b');rect(c,-8,-4,16,11,'#132e32');rect(c,-7,-5,14,11,color);rect(c,-10,-3,3,7,'#dcae80');rect(c,8,-3,3,7,'#dcae80');rect(c,-5,-11,10,7,'#12242b');rect(c,-4,-12,8,7,accent);rect(c,-1,-12,2,8,kit?.stripe||color);rect(c,-4,-5,8,2,'#93aaa0');txt(c,String(number),0,4,7,kit?.number||'#fff5da');if(ball){rect(c,7,1,5,7,'#a95b34');rect(c,8,3,3,1,'#f2d9ad');}c.restore();}
function drawField(c,canvas,camera,home,away,time=0,full=false){const h=canvas.height,w=canvas.width,scale=full?4.35:5.65;const py=y=>h*.60-(y-camera)*scale;const px=x=>29+x*5.65;rect(c,0,0,w,h,'#162e2c');
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
 const g=game,{px,py}=drawField(ctx,view,g.cameraY,g.teams[g.offense],g.teams[1-g.offense],g.time,g.format===11);weatherSurface(ctx,view,{px,py},g.weather);if(!g.special&&!g.returnInfo){const lineY=py(g.spot),targetY=py(g.target);rect(ctx,29,lineY,302,2,'#70c5ee');rect(ctx,29,targetY,302,2,'#efc65b');txt(ctx,'1ST',322,targetY-5,8,'#f8dc86');}
 if(showOffensiveRoutes(g)){
  ctx.setLineDash([4,4]);ctx.lineWidth=2;ctx.strokeStyle='#c2e59a99';
  if(g.playDefinition.kind==='pass')for(const p of g.players.slice(2,5)){ctx.beginPath();ctx.moveTo(px(p.x),py(p.y));for(let t=0;t<=4;t+=.2){const r=g.route(p,t);ctx.lineTo(px(r.x),py(r.y));}ctx.stroke();}
  else{const p=g.players[g.playDefinition.carrier??1],x=g.playDefinition.lane;ctx.beginPath();ctx.moveTo(px(p.x),py(p.y));ctx.lineTo(px(x),py(g.spot+2));ctx.lineTo(px(x),py(g.spot+14));ctx.stroke();}
  ctx.setLineDash([]);
 }
 if(g.userOffense&&g.isLive&&!g.special&&!g.receivedPass&&g.playDefinition.kind==='run'&&guidance!=='expert'&&g.carrier.y<g.spot+5){
  const mark=runLandmark(g);ctx.strokeStyle='#e7cf87aa';ctx.lineWidth=2;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(px(g.carrier.x),py(g.carrier.y));ctx.lineTo(px(mark.x),py(mark.y));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.ellipse(px(mark.x),py(mark.y),8,4,0,0,Math.PI*2);ctx.stroke();
 }
 if(g.userOffense&&g.canPass&&!g.paused&&passAim(movementInput(stick,keys)).amount){
  for(const p of g.players.slice(2,5)){const aim=passPlacement(g,p,movementInput(stick,keys));ctx.strokeStyle=aim.inBounds&&aim.reachable?'#f8da7d':'#f28f79';ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(px(p.x),py(p.y));ctx.lineTo(px(aim.x),py(aim.y));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.ellipse(px(aim.x),py(aim.y),6,3,0,0,Math.PI*2);ctx.stroke();}
 }
 if(g.userOffense&&g.pass&&!g.pass.tipped){ctx.strokeStyle='#f8da7d';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(px(g.pass.tx),py(g.pass.ty),7,4,0,0,Math.PI*2);ctx.stroke();}
 if(!g.userOffense&&guidance==='expert'&&['call','ready'].includes(g.phase)){const d=g.controlled,t=g.coverageTarget(d);ctx.strokeStyle='#f7d77999';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(px(d.x),py(d.y));ctx.lineTo(px(t.x),py(t.y));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(px(t.x),py(t.y),6,0,Math.PI*2);ctx.stroke();}
 if(!g.userOffense&&!g.special&&['call','ready'].includes(g.phase)){
  const d=g.controlled,role=roleFor(g.defenseDefinition,d.slot,g.format,g.personnel);
  txt(ctx,role.label.toUpperCase(),clamp(px(d.x),62,298),Math.max(13,py(d.y)-15),8,'#ffe58c');
 }
 const bounds=field.getBoundingClientRect();defenderHits=g.defenders.map((d,index)=>({index,x:((360-360*fit)/2+px(d.x)*fit)*bounds.width/360,y:py(d.y)*fit*bounds.height/field.height})).filter(p=>p.x>=0&&p.x<=bounds.width&&p.y>=0&&p.y<=bounds.height);
 const special=g.special;
 if(special&&!special.goal&&g.phase.startsWith('kick_')){
  const b=special.ball,target=b?{x:b.tx,y:b.ty}:g.kickTarget(g.phase==='kick_charge'?special.power:.7,special.aim),kicker=g.defenders[6];
  ctx.strokeStyle=target.y<=0||target.x<1||target.x>52?'#ed9b75':'#f6de88';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(px(target.x),py(target.y),10,5,0,0,Math.PI*2);ctx.stroke();
  rect(ctx,px(target.x)-2,py(target.y)-2,4,4,'#f8e6a8');
  if(!b){ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(px(kicker.x),py(kicker.y));ctx.lineTo(px(target.x),py(target.y));ctx.stroke();ctx.setLineDash([]);}
 }
 if(special?.goal){const y=py(110);rect(ctx,px(23.4),y-26,3,52,'#f9d25e');rect(ctx,px(29.6)-3,y-26,3,52,'#f9d25e');rect(ctx,px(23.4),y+23,px(29.6)-px(23.4),3,'#f9d25e');rect(ctx,px(26.5)-1,y+26,3,14,'#f9d25e');}
 if(g.pitch?.released){const b=g.pitch,arc=Math.sin(clamp((b.elapsed-b.release)/b.flight,0,1)*Math.PI)*10;rect(ctx,px(b.x)-2,py(b.y)-arc,5,7,'#d9965e');}
 for(const b of g.blocks){const p=g.players[b.p],d=g.defenders[b.d];ctx.strokeStyle=b.held?'#ffd15b':'#d7dcab';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(p.x),py(p.y)-3);ctx.lineTo(px(d.x),py(d.y)-3);ctx.stroke();if(b.help!==undefined){const h=g.players[b.help];ctx.beginPath();ctx.moveTo(px(h.x),py(h.y)-3);ctx.lineTo(px(d.x),py(d.y)-3);ctx.stroke();}}
 const drawables=[...g.players.map(p=>({p,team:g.teams[g.offense],off:true})),...g.defenders.map(p=>({p,team:g.teams[1-g.offense],off:false}))].sort((a,b)=>b.p.y-a.p.y);
 for(const {p,team,off} of drawables){const x=px(p.x),y=py(p.y);if(y<-25||y>view.height+25)continue;const color=team.color,accent=team.accent,kit=uniformFor(team,off?g.offense:1-g.offense);if(p===g.carrier&&g.moveAnimation){ctx.save();ctx.translate(x,y);if(g.moveAnimation.move==='spin')ctx.rotate((.45-g.moveAnimation.left)*Math.PI*5);else if(g.moveAnimation.move==='truck')ctx.translate(0,-3);else rect(ctx,8,-9,12,4,'#f4dcaa');sprite(ctx,0,0,color,accent,p.number,p.phase,p===g.controlled,p===g.carrier&&!g.pitch,1,kit);ctx.restore();}else sprite(ctx,x,y,color,accent,p.number,p.phase,p===g.controlled,p===g.carrier&&!g.fakeActive&&!g.pitch&&!g.pass&&!g.isLoose&&!g.momentBall&&(!special||g.isReturn),g.format===11?.88:1,kit);if(g.userOffense&&off&&!special&&!g.returnInfo&&!g.isLoose&&p.slot>=2&&p.slot<=4&&!g.passed&&g.playDefinition.kind==='pass'){rect(ctx,x-7,y-29,14,12,'#142e2b');txt(ctx,'ABC'[p.slot-2],x,y-20,10,'#f7e9b9');}if(p===g.controlled&&!g.userOffense){ctx.strokeStyle='#f9dc78';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+8,12,5,0,0,Math.PI*2);ctx.stroke();}if(p.stun>.4)txt(ctx,'✦',x,y-19,10,'#ebcc82');weatherFeet(ctx,p,x,y,g.weather,g.time);}
 if(g.fakeActive){const qb=g.players[0],rb=g.players[1],u=Math.sin(clamp(g.liveTime/g.playAction.duration,0,1)*Math.PI)*.65;const x=px(qb.x+(rb.x-qb.x)*u),y=py(qb.y+(rb.y-qb.y)*u);rect(ctx,x-2,y-8,5,7,'#d9965e');rect(ctx,x-1,y-6,3,1,'#fff4d1');if(g.userOffense)txt(ctx,'FAKE',px(qb.x),py(qb.y)-23,8,'#f9dc78');}
 for(const f of g.flags){const flipped=g.offense!==g.playStart.offense;rect(ctx,px(flipped?53-f.x:f.x)-3,py(flipped?100-f.y:f.y)-20,7,5,'#ffd15b');}
 if(g.pass||g.loose||special?.ball){const b=g.pass||g.loose||special.ball,arc=g.isLoose?Math.abs(Math.sin(b.elapsed*15))*5:special?.ball?kickHeight(special,g.phase):Math.sin(clamp(b.elapsed/b.duration,0,1)*Math.PI)*25;rect(ctx,px(b.x)-3,py(b.y),7,3,'#152a2866');rect(ctx,px(b.x)-2,py(b.y)-arc-3,5,8,'#d9965e');rect(ctx,px(b.x)-1,py(b.y)-arc,3,1,'#fff4d1');}
 if(g.practice&&!g.special){const target=30+g.goal;ctx.strokeStyle='#f5d57a';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(px(2),py(target));ctx.lineTo(px(51),py(target));ctx.stroke();ctx.setLineDash([]);txt(ctx,'TRAINING TARGET',180,py(target)-7,8,'#f3de9d');for(const x of [3,50])for(const y of [30,target]){rect(ctx,px(x)-3,py(y)-4,6,5,'#ee9551');rect(ctx,px(x)-4,py(y)+1,8,2,'#ffcb89');}}
 if(g.momentBall){const b=g.momentBall;ctx.strokeStyle='#f5d57a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(px(b.x),py(b.y),12,6,0,0,Math.PI*2);ctx.stroke();rect(ctx,px(b.x)-2,py(b.y)-b.arc-5,5,8,'#e0a36e');}
 if(g.challenge?.id==='catch'){ctx.strokeStyle='#e6c66e';ctx.setLineDash([3,3]);ctx.strokeRect(px(40),py(106),px(48)-px(40),py(100)-py(106));ctx.setLineDash([]);}
 if(g.burstLeft>0){const p=g.carrier;rect(ctx,px(p.x)-3,py(p.y)+18,2,7,'#f8d67b');rect(ctx,px(p.x)+3,py(p.y)+21,2,6,'#f8d67b');}
 weatherParticles(ctx,view,g.weather,g.time,{reduced:!halftimeShow.motionEnabled,wind:windFor(g)});
 ctx.restore();
}
function drawReplay(f){
 if(!f)return;const flip=f.anchor===1,xy=p=>({x:flip?53-p.x:p.x,y:flip?100-p.y:p.y});
 const ball=xy(f.ball),fit=Math.min(1,field.height/360),view={width:360,height:field.height/fit};
 ctx.save();rect(ctx,0,0,field.width,field.height,'#162e2c');ctx.translate((360-360*fit)/2,0);ctx.scale(fit,fit);
 const {px,py}=drawField(ctx,view,clamp(ball.y+12,13,93),game.teams[f.anchor],game.teams[1-f.anchor],0,game.format===11);weatherSurface(ctx,view,{px,py},f.weather||game.weather);
 if(!f.returning){for(const [yard,color] of [[f.spot,'#70c5ee'],[f.target,'#efc65b']])rect(ctx,29,py(flip?100-yard:yard),302,2,color);}
 const people=f.people.map(p=>({...p,...xy(p)})).sort((a,b)=>b.y-a.y);
 for(const p of people){const team=game.teams[p.team];sprite(ctx,px(p.x),py(p.y),team.color,team.accent,p.number,p.phase,p.carrier,p.carrier&&!f.airborne&&!f.loose,1,uniformFor(team,p.team));if(p.stun>.4)txt(ctx,'✦',px(p.x),py(p.y)-19,10,'#ebcc82');}
 if(f.airborne||f.loose){rect(ctx,px(ball.x)-3,py(ball.y),7,3,'#152a2866');rect(ctx,px(ball.x)-2,py(ball.y)-f.arc-3,5,8,'#d9965e');rect(ctx,px(ball.x)-1,py(ball.y)-f.arc,3,1,'#fff4d1');}
 const replayWind=f.weatherWind?{...f.weatherWind,x:f.weatherWind.x*(f.anchor===1?-1:1),y:f.weatherWind.y*(f.anchor===1?-1:1)}:null;
 $('weatherHUD').textContent=weatherLabel(f.weather||game.weather);$('windHUD').textContent=replayWind?.mph>.5?`${windArrow(replayWind)} ${Math.round(replayWind.mph)} MPH · REPLAY`:'REPLAY · CALM';
 weatherParticles(ctx,view,f.weather||game.weather,f.weatherTime||0,{reduced:!halftimeShow.motionEnabled,wind:f.weatherWind?{...f.weatherWind,x:f.weatherWind.x*(f.anchor===1?-1:1),y:f.weatherWind.y*(f.anchor===1?-1:1)}:undefined});
 if(f.flag)txt(ctx,'FLAG ON PLAY',180,view.height-34,9,'#ffd15b');
 ctx.restore();
}
function drawAttract(t){const a=roster?teamFor($('homeTeam').value):TEAMS[21],b=roster?teamFor($('awayTeam').value):TEAMS[3];const {px,py}=drawField(atx,attract,65,a,b,t);const phase=t*.002;const runnerX=25+Math.sin(phase)*6;const others=[[15,70,55],[39,71,72],[12,83,24],[44,86,30],[27,91,4]];for(const [x,y,n] of others)sprite(atx,px(x),py(y)+Math.sin(phase+x)*3,b.color,b.accent,n,phase+x,false,false,1.25,uniformFor(b,1));for(const [x,y,n] of [[21,76,66],[33,77,76]])sprite(atx,px(x),py(y),a.color,a.accent,n,phase,false,false,1.25,uniformFor(a,0));sprite(atx,px(runnerX),py(68),a.color,a.accent,a.offense?.[1].number||32,phase*4,true,true,1.5,uniformFor(a,0));rect(atx,44,30,272,45,'#173b2edd');txt(atx,'SUNDAY IS A STATE OF MIND.',180,49,10,'#c8dda8');txt(atx,'PRESS PLAY. BREAK AWAY.',180,64,9,'#f2d49b');}
function frame(now){
 halftimeShow.tick(now,document.hidden);
 let dt=rafTime?(now-rafTime)/1000:0;rafTime=now;
 stadium.update(game,document.hidden,{audition,broadcast:halftimeShow.openNow?halftimeShow.report.mode:false,replay:!!replay.active,speech:halftimeShow.speech});
 const musicStatus=stadium.soundtrack.scorer?'Scoring · '+stadium.soundtrack.scorer.track.title:stadium.soundtrack.status;if(lastMusicStatus!==musicStatus){lastMusicStatus=musicStatus;$('nowPlaying').textContent=lastMusicStatus;$('pauseTrack').textContent=lastMusicStatus;}
 if(game){
  if(duel){duel.drive(dt,movementInput(stick,keys));if(!game.paused)replay.observe(game,Math.min(dt,.05),game.events);processEvents();drawGame();}
  else if(replay.active){if(!game.paused&&!document.hidden){const was=replay.active;replay.advance(dt);if(was!==replay.active){keys={};resetStick();updateHUD();}}if(replay.active)drawReplay(replay.view());else{updateHUD();drawGame();}}
  else{
   const {x,y}=movementInput(stick,keys);
   const elapsed=Math.min(dt,.25),steps=Math.max(1,Math.ceil(elapsed/.05));let observed=0;
   for(let i=0;i<steps;i++){game.tick(elapsed/steps,{x,y});if(!game.paused)replay.observe(game,elapsed/steps,game.events.slice(observed));observed=game.events.length;}
   processEvents();if(autoReplays&&!(game instanceof ChallengeGame)&&replay.start(game)){keys={};resetStick();toastUntil=0;$('message').replaceChildren();updateHUD();}else if(!autoReplays)replay.skipAll();
   if(replay.active)drawReplay(replay.view());else drawGame();
  }
  hudTimer+=dt;if(hudTimer>(['kick_charge','kick_accuracy'].includes(game.phase)?.016:.09)){updateHUD();hudTimer=0;}if(toastUntil&&now>toastUntil){$('message').replaceChildren();toastUntil=0;}
 }else if(!document.hidden)drawAttract(halftimeShow.motionEnabled?now:0);
 requestAnimationFrame(frame);
}

function setMode(value){
 mode=['exhibition','training','campaign','classic'].includes(value)?value:'exhibition';document.body.dataset.mode=mode;
 for(const b of document.querySelectorAll('[data-mode]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
 const choices=mode==='training'?DRILLS:CLASSICS,selected=$('challengePick').value;
 $('challengePick').replaceChildren(...choices.map((c,i)=>{const o=el('option',`${i+1} · ${c.name}`);o.value=c.id;return o;}));
 if(choices.some(c=>c.id===selected))$('challengePick').value=selected;
 renderMode();
}
function renderMode(){
 if(window.PGI_DUEL){if(roster)$('start').textContent='CREATE A 1V1 ROOM';return;}
 $('modeIntro').textContent=modeLabels[mode];$('challengeSetup').hidden=mode==='exhibition';$('drillLevelRow').hidden=mode!=='training';$('challengePickLabel').textContent=mode==='training'?'DRILL':mode==='classic'?'FAMOUS MATCHUP':'CHAPTER';
 $('matchOptions').hidden=mode==='training'||mode==='campaign';$('matchupChoices').hidden=mode==='campaign'||mode==='classic';$('eraRow').hidden=mode!=='exhibition';$('historicDetails').hidden=mode==='training'||mode==='exhibition';
 if(!roster)return;
 const item=(mode==='training'?DRILLS:CLASSICS).find(c=>c.id===$('challengePick').value)||CLASSICS[0];
 if(['campaign','classic'].includes(mode)){setTeamOptions('historic');$('homeTeam').value=item.home;$('awayTeam').value=item.away;}
 $('challengeStory').replaceChildren(el('b',item.name),el('p',guideText(item,guidance)),el('small',mode==='training'?`Target: ${item.goals[Number($('drillLevel').value)]}${item.id==='fieldgoal'?' yards through the posts':item.id==='punting'?' · opponent starts inside this yard line':' yards gained'}`:`${item.date} · ${item.venue}`));
 const key=mode==='training'?`training:${item.id}:${$('drillLevel').value}`:item.id;
 $('campaignProgress').textContent=mode==='classic'?'Full game from kickoff · curated game-day rosters · modern PGI arcade rules.':`Best: ${'★'.repeat(Math.min(3,progress[key]?.stars||0))}${'☆'.repeat(3-Math.min(3,progress[key]?.stars||0))} · ${progress[key]?.attempts||0} attempts${mode==='campaign'?` · Scrapbook ${CLASSICS.reduce((n,c)=>n+(progress[c.id]?.stars||0),0)}/12 stars`:''}`;
 if(mode==='classic'||mode==='campaign'){
  const box=$('historicLineups');box.replaceChildren(el('p',item.story));
  for(const id of [item.home,item.away]){const t=historicTeam(id);box.append(el('b',`${t.city} · ${t.roster.length} players`),el('p',t.roster.map(p=>`#${p.number} ${p.name}`).join(' · ')));const a=el('a','Roster record ↗');a.href=t.source;a.target='_blank';a.rel='noopener';box.append(a);}
  const source=el('a','Read about the original play ↗');source.href=item.source;source.target='_blank';source.rel='noopener';box.append(source,el('p','Real players, estimated arcade ratings. Formations and interactive checkpoints are PGI interpretations.'));
 }
 const full=$('fieldFormat').value==='11';$('matchOptionsTitle').textContent=`MATCH SETUP · ${full?'11 VS 11':'7 VS 7'} · ${matchLength($('gameLength').value).name||$('gameLength').selectedOptions[0].textContent.split(' · ')[0]}`;for(const id of ['defensePackage','pauseDefensePackage']){for(const o of $(id).options){const format=full&&!['training','campaign'].includes(mode)?11:7;o.textContent=PERSONNEL[o.value].name+' · '+personnelLabel(o.value,format);o.disabled=!supportsPersonnel(teamFor($('homeTeam').value),o.value,format);}if($(id).selectedOptions[0]?.disabled)$(id).value='base';}updateSystemInfo();
 refreshWeather();
 $('start').textContent={exhibition:'LET’S PLAY FOOTBALL ↗',training:'TAKE IT TO PRACTICE ↗',campaign:'MAKE THE MOMENT ↗',classic:'PLAY THE CLASSIC ↗'}[mode];
}
function setTeamOptions(era){
 const historic=HISTORIC_TEAMS.map(t=>({abbr:t.id,city:t.city})),decades=DECADE_TEAMS.map(t=>({abbr:t.id,city:t.city})),list=era==='historic'?historic:era==='decades'?decades:era==='all'?[...TEAMS,...decades,...historic]:TEAMS;
 for(const id of ['homeTeam','awayTeam']){const old=$(id).value;$(id).replaceChildren(...list.map(t=>{const o=el('option',t.city);o.value=t.abbr;return o;}));$(id).value=list.some(t=>t.abbr===old)?old:list[id==='homeTeam'?0:1].abbr;}
 $('rosterEra').value=era;
}
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{setMode(b.dataset.mode);updateLobby();renderMode();};
$('rosterEra').onchange=()=>{setTeamOptions($('rosterEra').value);updateLobby();renderMode();};
$('challengePick').onchange=()=>{renderMode();updateLobby();renderMode();};$('drillLevel').onchange=renderMode;
for(const id of ['fieldFormat','playClockSetting','tvTimeoutSetting']){const value=safeRead('pg-'+id,id==='fieldFormat'?'11':true);if(id==='fieldFormat')$(id).value=value==='7'?'7':'11';else $(id).checked=value!==false;$(id).onchange=()=>{safeWrite('pg-'+id,id==='fieldFormat'?$(id).value:$(id).checked);renderMode();};}
function startChallenge(retry=false){
 if(!retry)challengeConfig={mode,id:$('challengePick').value,level:Number($('drillLevel').value),guidance,difficulty:$('difficulty').value,home:$('homeTeam').value,away:$('awayTeam').value,weather:forecast};
 challengeConfig.guidance=guidance;const c=challengeConfig,item=(c.mode==='training'?DRILLS:CLASSICS).find(d=>d.id===c.id);
 game=new ChallengeGame(teamFor(c.home),teamFor(c.away),c);game.paused=true;replay.reset();stadium.soundtrack.stopScore();audioUnlock();endShown=false;lastPhase='';keys={};resetStick();
 for(const d of document.querySelectorAll('dialog'))d.close();$('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');$('footer').hidden=true;
 $('briefEyebrow').textContent=c.mode==='training'?`TRAINING · STAGE ${c.level+1}`:'THE SUNDAY SCRAPBOOK';$('briefTitle').textContent=item.name;$('briefGuide').textContent=guideText(item,guidance);
 $('briefGoal').textContent=c.mode==='training'?`${c.id==='fieldgoal'?'Make a':c.id==='punting'?'Pin the opponent inside the':'Gain at least'} ${game.goal}${c.id==='fieldgoal'?' yard field goal':c.id==='punting'?' yard line':' yards'}.`:c.id==='catch'?'Finish with a Clark touchdown.':c.id==='immaculate'?'Scoop with Harris, then reach the end zone.':c.id==='roller'?'Banaszak bumps it. Casper recovers it.':'Secure Edelman’s 23-yard catch.';
 $('briefWeather').textContent=weatherLabel(game.weather)+' · '+weatherAdvice(game.weather,guidance);
 $('briefNote').textContent=c.mode==='training'?'Three stars: complete the goal, finish within 20 seconds, then within 12. No play clock. Retry as often as you like.':`${item.date}. Playable interpretation; the timed checkpoints are slowed for control. Three stars: complete the goal, finish within 20 seconds, and make a clean catch or recovery.`;
 renderPlaybook();updateHUD();resizeField();window.scrollTo(0,0);$('challengeBrief').showModal();
}
$('beginChallenge').onclick=()=>{$('challengeBrief').close();game.paused=false;audioUnlock();updateHUD();};$('leaveChallenge').onclick=$('challengeMenu').onclick=menu;
$('challengeBrief').addEventListener('cancel',e=>{e.preventDefault();menu();});$('challengeResult').addEventListener('cancel',e=>{e.preventDefault();menu();});
$('retryChallenge').onclick=()=>startChallenge(true);
$('nextChallenge').onclick=()=>{const c=challengeConfig;if(c.mode==='training'){if(c.level<2)$('drillLevel').value=c.level+1;else{$('drillLevel').value=0;$('challengePick').value=DRILLS[(DRILLS.findIndex(d=>d.id===c.id)+1)%DRILLS.length].id;}}else $('challengePick').value=CLASSICS[(CLASSICS.findIndex(d=>d.id===c.id)+1)%CLASSICS.length].id;renderMode();startChallenge();};
function finishChallenge(){
 const g=game,c=g.challenge,key=c.mode==='training'?`training:${c.id}:${c.level}`:c.id;
 progress=saveProgress(progress,key,g.result);const saved=safeWrite('pg-campaign-progress',progress);
 $('challengeResultLabel').textContent=c.mode==='training'?'PRACTICE MAKES SUNDAYS':'THE SUNDAY SCRAPBOOK';$('challengeResultTitle').textContent=g.result.success?'That one belongs on film.':'Another rep. You’ve got this.';
 $('challengeStars').textContent='★'.repeat(g.result.stars)+'☆'.repeat(3-g.result.stars);$('challengeFeedback').textContent=g.result.detail;
 const completed=CLASSICS.every(item=>(progress[item.id]?.stars||0)>0);if(c.mode==='campaign'&&completed)$('challengeResultLabel').textContent=`SCRAPBOOK COMPLETE · ${CLASSICS.reduce((n,item)=>n+(progress[item.id]?.stars||0),0)}/12 STARS`;
 $('challengeLesson').textContent=(c.mode==='training'?guideText(g.item,guidance):g.item.story)+(saved?'':' Progress could not be saved in this browser.');
 $('nextChallenge').textContent=c.mode==='training'?'NEXT TRAINING STAGE ↗':'NEXT CHAPTER ↗';$('challengeResult').showModal();
}
function updateExtrasHUD(){
 const g=game,clock=g.playClockEnabled&&(['call','ready'].includes(g.phase)||g.special?.type!=='kickoff'&&['kick_ready','kick_charge','kick_accuracy'].includes(g.phase));
 $('playClockDisplay').hidden=!clock;$('playClockDisplay').textContent=`PLAY ${Math.ceil(g.playClock)}`;$('playClockDisplay').classList.toggle('urgent',g.playClock<=5);
 $('tvBreak').hidden=g.phase!=='tv_timeout';if(g.phase==='tv_timeout'){const ad=commercialFor(g.quarter,g.weather?.kind);$('tvBrand').textContent=ad.brand;$('tvSlogan').textContent=ad.line;$('tvTag').textContent=ad.tag;$('tvCopy').textContent=`Back in ${Math.ceil(g.tvLeft)} · game clock held`;paintCommercial($('tvArt'),ad,6-g.tvLeft,halftimeShow.motionEnabled);}
 $('challengeCue').hidden=!(g instanceof ChallengeGame)||g.paused||['call','ready','kick_ready','kick_charge','kick_accuracy','kick_flight','kick_loose'].includes(g.phase);if(g instanceof ChallengeGame)$('challengeCue').textContent=g.phase.startsWith('moment')?(g.phase==='moment_ready'?'Tap START THE MOMENT.':g.moment.stage==='intro'?'Follow the ball. Get to the gold ring.':g.moment.stage==='bump'?'Banaszak · move to the ring, then BUMP.':g.moment.stage==='dive'?'Casper · run up, then DIVE on the ball.':`Move to the ring, then ${g.moment.id==='immaculate'?'SCOOP':'CATCH'}!`):g.challenge.id==='catch'?'Roll right. A is Clark. Find him in the gold end-zone box.':g.moment?.stage==='run'?'Harris has it! Run upfield to the end zone.':`${g.item.name} · ${g.challenge.id==='punting'?`pin inside the ${g.goal}`:`target ${g.goal} yards`}`;
}
bindGameButton($('skipTV'),()=>{if(game?.resumeTV()){renderPlaybook();updateHUD();}});

function refreshWeather(){
 if(!roster||window.PGI_DUEL){$('weatherOptions').hidden=true;$('weatherSummary').hidden=true;return;}
 const c=CLASSICS.find(c=>c.id===$('challengePick').value),chapter=mode==='campaign',classic=mode==='classic',home=$('homeTeam').value;
 const venue=(chapter||classic)?{catch:'SF81',immaculate:'PIT72',roller:'SD78',edelman:'SBLI'}[c?.id]:undefined;
 const season=(chapter||classic)?(c?.id==='roller'?'early':'winter'):$('weatherSeason').value;
 const selection=chapter?'clear':mode==='training'&&$('weatherChoice').value==='auto'?'clear':$('weatherChoice').value;
 const key=[home,venue,season,selection,weatherSeed,mode].join(':');
 if(key!==forecastKey){forecast=createWeather(teamFor(home),{selection,season,seed:weatherSeed,venue,practice:mode==='training',source:chapter?'chapter':'simulated'});forecastKey=key;}
 if($('weatherChoice').value!=='auto'&&forecast.kind!==selection&&!chapter){$('weatherChoice').value='auto';safeWrite('pg-weatherChoice','auto');forecastKey='';refreshWeather();return;}
 const v=forecast.venue,w=windFor({weather:forecast,offense:0,quarter:1,time:0});
 $('weatherSummary').hidden=false;$('weatherSummary').textContent=`${chapter?'CHAPTER PRESET · ':''}${weatherLabel(forecast)} · ${v.name}${w.mph>.5?` · wind ${Math.round(w.mph)} mph`:''}`;
 $('weatherOptions').hidden=chapter;$('weatherSeason').disabled=classic;$('newForecast').hidden=selection!=='auto'||forecast.roofClosed;
 for(const option of $('weatherChoice').options)option.disabled=option.value!=='auto'&&option.value!=='clear'&&(forecast.roofClosed||v.roof==='canopy'&&['snow','rain'].includes(option.value));
 $('weatherVenue').textContent=`${v.city} · ${forecast.roofClosed?'roof closed':v.roof==='canopy'?'covered field · open sides':'outdoor field'}${classic?' · original game venue and season':''}`;
 $('weatherAdvice').textContent=weatherAdvice(forecast,guidance);
}
function updateWeatherHUD(){
 const g=game,w=g.weather;$('pauseInjuries').textContent=g.injuries?injurySummary(g):'';if(!w){$('weatherHUD').textContent='';$('windHUD').textContent='';return;}
 const k=g.special,wind=k?.weatherWind?{...k.weatherWind,x:k.goal?k.weatherWind.x:-k.weatherWind.x,y:k.goal?k.weatherWind.y:-k.weatherWind.y}:windFor(g);
 $('weatherHUD').textContent=weatherLabel(w);$('windHUD').textContent=wind.mph>.5?`${windArrow(wind)} ${Math.round(wind.mph)} MPH${k?.weatherWind?' · LOCKED':''}`:w.roofClosed?'ROOF CLOSED':'CALM';
 $('windHUD').title='Arrow shows where wind pushes the ball on this field view.';
 $('pauseWeather').textContent=`${w.venue.name} · ${weatherLabel(w)}. ${weatherAdvice(w,guidance)}`;
}
for(const id of ['weatherChoice','weatherSeason']){const fallback=id==='weatherChoice'?'auto':'autumn',value=safeRead('pg-'+id,fallback);if([...$(id).options].some(o=>o.value===value))$(id).value=value;$(id).onchange=()=>{safeWrite('pg-'+id,$(id).value);forecastKey='';refreshWeather();};}
$('newForecast').onclick=()=>{weatherSeed=(weatherSeed+104729)>>>0;forecastKey='';refreshWeather();};

setMode('exhibition');if(window.PGI_DUEL){$('matchOptions').querySelector('.gamepace').hidden=true;document.querySelector('.modehub').hidden=true;$('eraRow').hidden=true;$('fieldFormat').parentElement.hidden=true;for(const id of ['offenseSystem','awayOffenseSystem','defensePackage','pauseDefensePackage'])$(id).parentElement.hidden=true;for(const id of ['offenseSystemInfo','defenseSystemInfo','pauseDefenseInfo'])$(id).hidden=true;}

if(window.PGI_DUEL){
 const {setupDuel}=await import('./duel-ui.js?v=32');
 duel=setupDuel({
  state(view,fresh){
   // Preserve already received events until the next paint drains them.
   const queued=fresh?[]:game?.events||[];game=view;game.events=[...queued,...view.events];
   if(fresh){replay.reset();resetPlaybook();bookSide='';endShown=false;lastPhase='';keys={};resetStick();$('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');$('footer').hidden=true;for(const d of document.querySelectorAll('dialog'))d.close();$('lastPlay').textContent='Private 1v1 · you play '+game.teams[duel.team].abbr;renderPlaybook();updateHUD();resizeField();window.scrollTo(0,0);audioUnlock();if(duel.room?.status==='pregame')openBroadcast(pregameReport(game.teams,game.match,game.weather));else if(duel.room?.status==='paused')$('pauseDialog').showModal();else if(duel.room?.status==='halftime')showHalftime();else if(duel.room?.status==='final')finishGame();}
   updateHUD();
  },
  room(room){
   if(!game)return;
   if(room.status==='playing'){for(const id of ['pauseDialog','defenderDialog'])$(id).close();if(halftimeShow.openNow){halftimeShow.dialog.close();halftimeShow.report=null;}$('resume').textContent='RESUME GAME ↗';}
   if(room.status==='paused'){if(halftimeShow.openNow){halftimeShow.dialog.close();halftimeShow.report=null;}if(!$('pauseDialog').open)$('pauseDialog').showModal();}
  },
  leave:menu,
  closed(){if(game)game.paused=true;}
 });
 $('autoReplays').disabled=true;$('autoReplays').checked=false;
 $('quit').textContent='LEAVE THE 1V1 ROOM';
}
boot();requestAnimationFrame(frame);
