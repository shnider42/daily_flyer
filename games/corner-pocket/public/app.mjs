import { TABLE, FIXED_DT, createGame, shoot, step, placeCue, canPlaceCue, legalTargets } from './engine.mjs';
import { createRenderer } from './renderer.mjs';
import { OnlineRoom } from './online.mjs';
import { PoolAudio } from './audio.mjs';

const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const storageKey = 'corner-pocket-preferences';
const colors = ['#eee4c8','#dba62a','#315cac','#b93b30','#754b9e','#e07826','#30765a','#7f2631','#111712','#dba62a','#315cac','#b93b30','#754b9e','#e07826','#30765a','#7f2631'];
const pocketNames = ['Far left', 'Far middle', 'Far right', 'Near right', 'Near middle', 'Near left'];
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
if (typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
const cleanName = (name, fallback = 'Player') => [...String(name || '').replace(/[\p{Cc}\p{Cf}<>]/gu,'').trim()].slice(0,22).join('') || fallback;
function savePreferences() { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch {} }

let renderer;
try {
  renderer = createRenderer($('table'));
  $('loading').hidden = true;
  $('rendererLabel').textContent = renderer.kind === 'canvas' ? 'CLASSIC TABLE VIEW' : '3D EIGHT-BALL';
} catch (error) {
  $('loading').querySelector('p').textContent = 'The table could not load. Please refresh this page.';
  throw error;
}
const canvas = renderer.canvas || $('table');
canvas.addEventListener('pool-renderer-fallback', () => {
  $('rendererLabel').textContent = 'CLASSIC TABLE VIEW';
  syncControls();
  toast('Switched to the classic table view. Your game is still running.',5000);
});
let mode = 'menu', screen = 'menu', game = createGame({names:['Player 1','Player 2'],seed:71});
let aim = 0, power = .80, spin = 0, calledPocket = null;
let view = preferences.view === 'overhead' ? 'overhead' : 'table';
let guide = preferences.guide !== false, placing = false, placement = null;
let snapshot = null, connection = 'offline', pending = false, menuBusy = false, uiFlow = 0;
let localScores = [0,0], localBreaker = 0, scoredRack = null;
let frames = [], lastStateKey = '', lastUI = 0, aimDirty = false, lastAimSent = 0;
let pointerId = null, pointerMode = null, fineTimer = null, fineStart = null;
let toastTimer = null, lastResultId = null, lastHint = null;
const keys = new Set(), audio = new PoolAudio(preferences.sound === true);

const online = new OnlineRoom({
  onSnapshot: receiveSnapshot,
  onStatus(status, message) {
    connection = status;
    if (status === 'offline' && message && mode === 'online' && online.session) toast(message,7000);
    renderUI();
  },
  onError(error) { if (error.code !== 'cancelled') toast(error.message); }
});

function showScreen(next) {
  const changed = screen !== next;
  screen = next;
  document.body.classList.toggle('at-menu', next === 'menu');
  $('menu').hidden = next !== 'menu';
  $('lobby').hidden = next !== 'lobby';
  $('scoreboard').hidden = next !== 'game';
  $('statusBar').hidden = next !== 'game';
  $('controls').hidden = next !== 'game';
  $('inviteButton').hidden = mode !== 'online' || !online.session;
  $('tableHint').hidden = next !== 'game';
  if (next !== 'game') $('result').hidden = true;
  if (changed) requestAnimationFrame(() => renderer.resize());
}
function toast(message, duration = 3600) {
  if (!message) return;
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}
function showDialog(id) {
  keys.clear(); stopFineAim();
  if (!$(id).open) $(id).showModal();
}
function closeDialogs() { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); }
function dialogOpen() { return !!document.querySelector('dialog[open]'); }
function myTurn() { return mode !== 'online' || online.session?.seatIndex === game.turn; }
function bothConnected() { return mode !== 'online' || connection === 'online' && snapshot?.seats.every(seat => seat.connected && seat.occupied); }
function canAct() { return screen === 'game' && game.phase === 'aiming' && myTurn() && bothConnected() && !pending && !dialogOpen(); }
function onEight() { const targets = legalTargets(game); return !game.breakShot && targets.length === 1 && targets[0] === 8; }
function cueBall() { return game.balls.find(ball => ball.id === 0); }
function defaultAim() {
  if (game.breakShot) return 0;
  const cue = cueBall(), targets = new Set(legalTargets(game));
  const balls = game.balls.filter(ball => targets.has(ball.id) && !ball.pocketed);
  balls.sort((a,b) => Math.hypot(a.x-cue.x,a.z-cue.z)-Math.hypot(b.x-cue.x,b.z-cue.z));
  return balls.length ? Math.atan2(balls[0].z-cue.z, balls[0].x-cue.x) : 0;
}
function resetShotControls() {
  aim = defaultAim(); power = game.breakShot ? .80 : .38; spin = 0; calledPocket = null;
  placing = !!game.ballInHand && !game.cuePlaced;
  placement = null; aimDirty = true;
  $('spinPanel').hidden = true;
  $('spinButton').setAttribute('aria-expanded','false');
  syncControls();
}
function observeState() {
  const key = `${game.id}/${game.shotNumber}/${game.phase}/${game.turn}`;
  if (key !== lastStateKey) {
    lastStateKey = key;
    if (game.phase === 'aiming') resetShotControls();
    if (game.phase === 'rolling') { placement = null; placing = false; keys.clear(); }
    if (game.phase === 'finished') {
      placing = false; placement = null; keys.clear();
      if (mode !== 'online' && scoredRack !== game.id) {
        if (Number.isInteger(game.winner)) localScores[game.winner]++;
        scoredRack = game.id;
      }
    }
    renderUI();
  }
}
function receiveSnapshot(next) {
  const wasRack = game?.id;
  snapshot = next;
  mode = 'online';
  if (next.game) {
    game = next.game;
    if (wasRack !== game.id) { frames = []; lastStateKey = ''; }
    frames.push({time:performance.now(),game});
    if (frames.length > 8) frames.shift();
    showScreen('game');
    observeState();
  } else {
    showScreen('lobby');
  }
  if (next.closed) {
    connection = 'offline';
    toast(next.reason || 'This table has ended. Start a new room.',7000);
  }
  renderUI();
}
function syncControls() {
  $('power').value = Math.round(power*100);
  $('powerValue').value = `${Math.round(power*100)}%`;
  $('spin').value = Math.round(spin*100);
  $('spinValue').value = Math.abs(spin)<.025 ? 'Center' : `${Math.round(Math.abs(spin)*100)}% ${spin<0?'draw':'follow'}`;
  $('cameraButton').textContent = renderer.kind === 'canvas' || view === 'table' ? 'Overhead view' : 'Angled view';
  $('cameraButton').disabled = renderer.kind === 'canvas';
  $('guideButton').textContent = guide ? 'Guide on' : 'Guide off';
  $('guideButton').setAttribute('aria-pressed',String(guide));
  $('soundButton').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  $('soundButton').setAttribute('aria-pressed',String(audio.enabled));
  renderer.setView(view);
}
function updateTray(index) {
  const player = game.players[index], tray = $(`player${index}`).querySelector('.ball-tray');
  const ids = player.group === 'solids' ? [1,2,3,4,5,6,7] : player.group === 'stripes' ? [9,10,11,12,13,14,15] : [];
  const key = game.breakShot + '/' + player.group + '/' + game.balls.filter(b=>b.pocketed).map(b=>b.id).join(',');
  if (tray.dataset.key === key) return;
  tray.dataset.key = key; tray.replaceChildren();
  if (!ids.length) {
    const caption = document.createElement('span');caption.className='tray-caption';
    caption.textContent = game.breakShot ? 'Solids or stripes · break to begin' : 'Groups decided by the next legal pot';
    tray.append(caption); return;
  }
  const clear = ids.every(id => game.balls.find(b=>b.id===id)?.pocketed);
  for (const id of clear ? [8] : ids) {
    const sunk = game.balls.find(b=>b.id===id)?.pocketed;
    const chip = document.createElement('span'); chip.className=`ball-chip${id>8?' stripe':''}${sunk?' sunk':''}`;
    chip.style.setProperty('--ball',colors[id]); chip.title = `Ball ${id}${sunk?' · pocketed':''}`;
    chip.setAttribute('aria-label',`Ball ${id}${sunk?' pocketed':' remaining'}`);
    const number = document.createElement('span');number.textContent=id;chip.append(number);tray.append(chip);
  }
  if (clear) { const caption=document.createElement('span');caption.className='tray-caption';caption.textContent='On the 8-ball';tray.append(caption); }
}
function renderUI() {
  $('resumeButton').hidden = !OnlineRoom.saved();
  $('inviteButton').hidden = mode !== 'online' || !online.session;
  if (screen === 'menu') return;
  if (screen === 'lobby') {
    $('lobbyCode').textContent = snapshot?.code || '—';
    const seats = snapshot?.seats || [];
    const key = seats.map(seat=>`${seat.name}/${seat.occupied}/${seat.connected}`).join('|');
    if ($('lobbySeats').dataset.key !== key) {
      $('lobbySeats').dataset.key=key; $('lobbySeats').replaceChildren();
      for (const seat of seats) {
        const row=document.createElement('div');row.className='lobby-seat';
        const name=document.createElement('strong'), status=document.createElement('span');
        name.textContent=seat.occupied?seat.name:'Your friend';status.textContent=seat.connected?'At the table':seat.occupied?'Connecting…':'Empty seat';row.append(name,status);$('lobbySeats').append(row);
      }
    }
    const host = online.session?.seatIndex===snapshot?.hostIndex;
    $('startButton').disabled = pending || !host || !bothConnected();
    $('startButton').textContent = host ? bothConnected() ? 'Rack ’em up' : 'Waiting for your friend…' : 'Waiting for the host to start';
    updateConnection(); return;
  }
  const active = canAct(), local = mode !== 'online';
  for (let i=0;i<2;i++) {
    const card=$(`player${i}`), player=game.players[i];
    card.classList.toggle('active',game.turn===i&&game.phase!=='finished');
    card.querySelector('.player-name').textContent=player.name+(mode==='online'&&online.session?.seatIndex===i?' · you':'');
    card.querySelector('.player-group').textContent=player.group ? player.group==='solids'?'Solids':'Stripes' : 'Open table';
    updateTray(i);
  }
  const scores = mode==='online' ? snapshot.seats.map(s=>s.score) : localScores;
  $('rackScore').textContent = scores.join(' : ');
  $('modeLabel').textContent = mode==='practice'?'PRACTICE':mode==='online'?'ONLINE · 8-BALL':'8-BALL';
  const name = game.players[game.turn].name;
  let title = game.phase==='finished'?'Rack over.':game.phase==='rolling'?'Balls in motion.':myTurn()?(local?`${name}’s turn.`:'Your turn.'):`${name}’s turn.`;
  if (game.phase==='aiming' && game.breakShot) title = myTurn()?(local?`${name} to break.`:'Your break.'):`${name} to break.`;
  if (game.phase==='aiming' && game.ballInHand) title = myTurn()?'Ball in hand.':`${name} has ball in hand.`;
  $('turnLabel').textContent=title;
  $('statusMessage').textContent=game.message;
  $('statusBar').classList.toggle('foul',game.ballInHand);
  let hint;
  if (game.phase==='rolling') hint='Watch the angles.';
  else if (game.phase==='finished') hint='';
  else if (!myTurn()) hint='Your opponent is lining up a shot';
  else if (placing) hint='Tap clear felt to place the cue ball';
  else if (game.ballInHand&&!game.cuePlaced) hint='Place the cue ball before shooting';
  else if (onEight()&&calledPocket===null) hint='Choose your 8-ball pocket below or tap a pocket';
  else hint=matchMedia('(pointer:coarse)').matches?'Touch the cloth to aim · set power · shoot':'Click the cloth to aim · arrows to fine tune';
  if(lastHint!==hint){lastHint=hint;$('tableHint').textContent=hint;}
  $('tableHint').hidden=!hint;
  const callNeeded = onEight() && game.phase==='aiming' && myTurn();
  $('pocketCall').hidden=!callNeeded;
  for (const button of $('pocketButtons').children) {
    button.classList.toggle('selected',Number(button.dataset.pocket)===calledPocket);
    button.setAttribute('aria-pressed',String(Number(button.dataset.pocket)===calledPocket));
    button.disabled=!active;
  }
  $('shootButton').disabled=!active || placing || (game.ballInHand&&!game.cuePlaced) || (onEight()&&calledPocket===null);
  $('shootLabel').textContent=pending?'Sending…':game.phase==='rolling'?'Rolling…':!myTurn()?'Their turn':placing?'Place cue':callNeeded&&calledPocket===null?'Call pocket':game.breakShot?'Break':'Shoot';
  for (const id of ['power','aimLeft','aimRight','spin','resetSpinButton']) $(id).disabled=!active||placing;
  $('spinButton').disabled=!active||placing;
  $('placeButton').hidden=!(game.phase==='aiming' && myTurn() && (game.ballInHand||mode==='practice'));
  $('placeButton').disabled=!active;
  $('placeButton').textContent=placing?'Place cue…':'Move cue ball';
  $('result').hidden=game.phase!=='finished';
  if(game.phase==='finished') {
    $('winnerTitle').textContent=Number.isInteger(game.winner)?`${game.players[game.winner].name} wins.`:'Rack finished.';
    $('resultReason').textContent=game.message;
    $('resultScore').textContent=`${scores[0]} — ${scores[1]}`;
    const voted=mode==='online'&&snapshot?.rematchVotes.includes(online.session?.seatIndex);
    const otherVoted=mode==='online'&&snapshot?.rematchVotes.includes(1-online.session?.seatIndex);
    $('rematchButton').disabled=pending||voted||!bothConnected();
    $('rematchButton').textContent=voted?'Waiting for your friend…':otherVoted?'Accept rematch':'Rack ’em again';
    if(lastResultId!==game.id){lastResultId=game.id;closeDialogs();}
  }
  updateConnection();
}
function updateConnection() {
  const show = mode==='online' && (!!online.session || !!snapshot);
  let message='';
  if (show && (snapshot?.closed || !online.alive)) message='This table has ended. Open Menu to start a new room.';
  else if (show && connection==='reconnecting') message='Reconnecting… your place and the table are saved.';
  else if (show && connection!=='online') message='Connecting to your table…';
  else if (show && screen==='game' && !snapshot.seats.every(s=>s.connected&&s.occupied)) {
    const other=snapshot.seats[1-online.session.seatIndex];
    message=other.occupied?`${other.name} disconnected. Waiting for them to return…`:`${other.name} left the table.`;
  }
  $('connectionBanner').hidden=!message;
  $('connectionText').textContent=message;
  $('claimButton').hidden=!(show && snapshot?.claimAvailable?.[online.session?.seatIndex] && game.phase!=='rolling');
}
function rememberName() {
  const name=cleanName($('playerName').value,'Player 1');preferences.name=name;savePreferences();return name;
}
function setMenuBusy(value,label='') {
  menuBusy=value;
  for(const id of ['hostButton','joinButton','localButton','practiceButton','resumeButton']) $(id).disabled=value;
  $('hostButton').querySelector('span').textContent=value&&label?label:'Play a friend online';
}
async function openRoom(action) {
  if(menuBusy)return;
  const flow=++uiFlow;
  $('menuError').hidden=true;audio.unlock();
  setMenuBusy(true,action==='create'?'Opening your table…':'Connecting…');
  try {
    const name=rememberName();
    if(action==='create')await online.create(name);
    else if(action==='resume')await online.resume();
    else {
      const code=$('roomCode').value.trim().toUpperCase();
      const saved=OnlineRoom.saved();
      if(saved?.code===code)await online.resume();else await online.join(code,name);
    }
    if(flow===uiFlow&&online.session) {
      const url=new URL(location.href);url.searchParams.set('room',online.session.code);
      history.replaceState(null,'',url);
      $('inviteLink').value=url.href;
    }
  } catch(error) {
    if(flow===uiFlow&&error.code!=='cancelled'){
      $('menuError').textContent=error.message||'Could not open a table. Try again.';$('menuError').hidden=false;
      if(screen!=='menu')toast(error.message);
    }
  } finally { if(flow===uiFlow){setMenuBusy(false);renderUI();} }
}
function startLocal(practice=false) {
  uiFlow++;pending=false;setMenuBusy(false);
  online.destroy(false);
  snapshot=null;connection='offline';frames=[];
  mode=practice?'practice':'local';
  const names=practice?[rememberName(),'Practice partner']:[cleanName($('localName0').value,'Player 1'),cleanName($('localName1').value,'Player 2')];
  preferences.name=names[0];preferences.secondName=names[1];savePreferences();
  localScores=[0,0];localBreaker=0;scoredRack=null;
  game=createGame({names,mode,seed:Date.now()>>>0,breaker:0});
  lastStateKey='';closeDialogs();showScreen('game');observeState();audio.unlock();
  if(practice)toast('You control both sides. Move the cue ball or re-rack any time.',5000);
}
async function command(action,payload={}) {
  if(pending)return false;
  const flow=uiFlow;
  pending=true;renderUI();
  try{await online.command(action,payload);return flow===uiFlow;}
  catch(error){if(flow===uiFlow&&error.code!=='cancelled')toast(error.message);return false;}
  finally{if(flow===uiFlow){pending=false;renderUI();}}
}
async function takeShot() {
  if(!canAct()||placing)return;
  audio.unlock();
  if(onEight()&&calledPocket===null){toast('Call a pocket for the 8-ball first.');return;}
  const shot={angle:aim,power,spin,calledPocket};
  if(mode==='online')await command('shoot',shot);
  else {
    const result=shoot(game,shot);
    if(!result.ok)toast(result.error);
    observeState();
  }
}
async function placeAt(point) {
  if(!canAct()||!placing)return;
  if(!canPlaceCue(game,point.x,point.z)){toast('Choose clear felt, away from balls and pockets.');return;}
  if(mode==='online') {
    if(await command('place',point)){placing=false;placement=null;aim=defaultAim();aimDirty=true;}
  } else {
    const result=placeCue(game,point);
    if(result.ok){placing=false;placement=null;aim=defaultAim();aimDirty=true;}else toast(result.error);
  }
  renderUI();
}
function selectPocket(id) {
  if(!canAct()||!onEight())return;
  calledPocket=id;aimDirty=true;renderUI();
  toast(`Pocket ${id+1} called. Now line up the 8-ball.`,2200);
}
function setAimFromPoint(point) {
  const cue=cueBall();if(!cue||cue.pocketed)return;
  if(Math.hypot(point.x-cue.x,point.z-cue.z)>.025){aim=Math.atan2(point.z-cue.z,point.x-cue.x);aimDirty=true;}
}
function tablePoint(event) { return renderer.screenToTable(event.clientX,event.clientY); }
function stopFineAim() { clearInterval(fineTimer);clearTimeout(fineStart);fineTimer=null;fineStart=null; }
function nudge(direction,tiny=false) {
  if(!canAct()||placing)return;
  aim+=direction*(tiny?.0007:.0035);aim=Math.atan2(Math.sin(aim),Math.cos(aim));aimDirty=true;
}
function toggleCamera() {
  if(renderer.kind==='canvas'){toast('The classic table uses an overhead view.');return;}
  view=view==='table'?'overhead':'table';preferences.view=view;savePreferences();syncControls();
}
function toggleGuide() {guide=!guide;preferences.guide=guide;savePreferences();syncControls();}
async function copyInvite() {
  if(!online.session)return;
  const url=new URL(location.href);url.searchParams.set('room',online.session.code);url.hash='';
  try{await navigator.clipboard.writeText(url.href);toast('Invite link copied. Send it to your friend.');}
  catch{
    $('inviteLink').value=url.href;$('inviteLink').hidden=false;
    if(screen==='lobby'){$('inviteLink').focus();$('inviteLink').select();}
    toast(`Room ${online.session.code} · share the address in your browser.`,6000);
  }
}
async function leaveGame() {
  const flow=++uiFlow;
  closeDialogs();
  const wasOnline=mode==='online';mode='menu';showScreen('menu');
  placing=false;placement=null;pending=false;keys.clear();stopFineAim();setMenuBusy(false);
  snapshot=null;frames=[];connection='offline';
  game=createGame({names:['Player 1','Player 2'],seed:71});lastStateKey='';renderUI();
  $('connectionBanner').hidden=true;
  const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);
  if(wasOnline){try{await online.leave();}catch(error){if(flow===uiFlow)toast('Left the table. The other player will see the disconnect.');}}
  if(flow===uiFlow)renderUI();
}
function rerack() {
  if(mode==='online'){command('rematch');return;}
  localBreaker=1-localBreaker;
  game=createGame({names:game.players.map(p=>p.name),mode,seed:Date.now()>>>0,breaker:localBreaker});
  lastStateKey='';frames=[];closeDialogs();observeState();
}

$('playerName').value=cleanName(preferences.name,'Player 1');
$('localName0').value=cleanName(preferences.name,'Player 1');
$('localName1').value=cleanName(preferences.secondName,'Player 2');
const initialCode=new URL(location.href).searchParams.get('room');
if(initialCode){$('roomCode').value=initialCode.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);$('menu').querySelector('.intro').textContent='Your friend has a table waiting. Enter your name and press Join.';}
$('resumeButton').hidden=!OnlineRoom.saved();
for(const pocket of TABLE.pockets){
  const button=document.createElement('button');button.type='button';button.dataset.pocket=pocket.id;button.textContent=pocket.id+1;
  button.title=`Pocket ${pocket.id+1} · ${pocketNames[pocket.id]}`;button.setAttribute('aria-label',button.title);
  button.addEventListener('click',()=>selectPocket(pocket.id));$('pocketButtons').append(button);
}
$('hostButton').addEventListener('click',()=>openRoom('create'));
$('joinButton').addEventListener('click',()=>openRoom('join'));
$('resumeButton').addEventListener('click',()=>openRoom('resume'));
$('roomCode').addEventListener('input',()=>{$('roomCode').value=$('roomCode').value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);});
$('roomCode').addEventListener('keydown',event=>{if(event.key==='Enter')openRoom('join');});
$('localButton').addEventListener('click',()=>{$('localName0').value=rememberName();showDialog('localDialog');});
$('localForm').addEventListener('submit',event=>{event.preventDefault();startLocal(false);});
$('practiceButton').addEventListener('click',()=>startLocal(true));
$('startButton').addEventListener('click',()=>command('start'));
for(const id of ['copyInviteButton','inviteButton'])$(id).addEventListener('click',copyInvite);
for(const id of ['leaveLobbyButton','resultMenuButton','leaveGameButton'])$(id).addEventListener('click',leaveGame);
$('rematchButton').addEventListener('click',rerack);
$('rerackButton').addEventListener('click',rerack);
$('claimButton').addEventListener('click',()=>command('claim'));
$('shootButton').addEventListener('click',takeShot);
$('power').addEventListener('input',()=>{power=clamp(Number($('power').value)/100,.05,1);aimDirty=true;syncControls();});
$('spin').addEventListener('input',()=>{spin=clamp(Number($('spin').value)/100,-1,1);aimDirty=true;syncControls();});
$('resetSpinButton').addEventListener('click',()=>{spin=0;aimDirty=true;syncControls();});
$('spinButton').addEventListener('click',()=>{$('spinPanel').hidden=!$('spinPanel').hidden;$('spinButton').setAttribute('aria-expanded',String(!$('spinPanel').hidden));renderer.resize();});
$('cameraButton').addEventListener('click',toggleCamera);
$('guideButton').addEventListener('click',toggleGuide);
$('placeButton').addEventListener('click',()=>{
  if(!canAct())return;
  if(mode==='practice'&&!game.ballInHand){game.ballInHand=true;game.cuePlaced=true;}
  placing=!placing;placement=null;renderUI();
});
$('soundButton').addEventListener('click',()=>{audio.setEnabled(!audio.enabled);preferences.sound=audio.enabled;savePreferences();syncControls();});
$('helpButton').addEventListener('click',()=>showDialog('helpDialog'));
$('menuHelpButton').addEventListener('click',()=>{$('gameMenuDialog').close();showDialog('helpDialog');});
$('gameMenuButton').addEventListener('click',()=>{
  $('rerackButton').hidden=mode!=='practice';
  $('leaveNote').textContent=mode==='online'?'Leaving an unfinished rack awards it to your opponent. Your friend can wait for you if you simply close this menu or reconnect.':'Your rack will end if you leave the table.';
  showDialog('gameMenuDialog');
});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>{$(button.dataset.close).close();renderUI();});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{keys.clear();renderUI();});
$('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Use your browser’s full screen or add this game to your home screen.');}catch{toast('Full screen is unavailable in this browser.');}});
document.querySelector('.brand').addEventListener('click',event=>{if(screen!=='menu'){event.preventDefault();if(screen==='lobby')toast('Use Leave table to close this room.');else $('gameMenuButton').click();}});
for(const [id,direction] of [['aimLeft',-1],['aimRight',1]]){
  $(id).addEventListener('pointerdown',event=>{if(!canAct())return;event.preventDefault();audio.unlock();stopFineAim();nudge(direction,event.shiftKey);fineStart=setTimeout(()=>{fineTimer=setInterval(()=>nudge(direction,event.shiftKey),40);},250);});
  $(id).addEventListener('click',event=>{if(event.detail===0)nudge(direction);});
}
window.addEventListener('pointerup',stopFineAim);
window.addEventListener('pointercancel',stopFineAim);
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||!canAct()||pointerId!==null)return;
  const point=tablePoint(event);if(!point)return;
  audio.unlock();event.preventDefault();canvas.focus({preventScroll:true});
  if(onEight()&&!placing){const pocket=TABLE.pockets.find(p=>Math.hypot(p.x-point.x,p.z-point.z)<.115);if(pocket){selectPocket(pocket.id);return;}}
  pointerId=event.pointerId;pointerMode=placing?'place':'aim';canvas.setPointerCapture?.(pointerId);
  if(placing)placement={...point,valid:canPlaceCue(game,point.x,point.z)};else setAimFromPoint(point);
});
canvas.addEventListener('pointermove',event=>{
  if(!canAct())return;
  const point=tablePoint(event);if(!point)return;
  if(placing){placement={...point,valid:canPlaceCue(game,point.x,point.z)};}
  else if(pointerId===event.pointerId&&pointerMode==='aim')setAimFromPoint(point);
});
canvas.addEventListener('pointerup',event=>{
  if(event.pointerId!==pointerId)return;
  const point=tablePoint(event),operation=pointerMode;pointerId=null;pointerMode=null;
  try{canvas.releasePointerCapture?.(event.pointerId);}catch{}
  if(operation==='place'&&point)placeAt(point);
});
canvas.addEventListener('pointercancel',()=>{pointerId=null;pointerMode=null;});
canvas.addEventListener('pointerleave',()=>{if(pointerId===null)placement=null;});
window.addEventListener('keydown',event=>{
  if(screen!=='game'||dialogOpen()||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName))return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(event.code))event.preventDefault();
  if(event.code==='Space'){if(!event.repeat)takeShot();return;}
  if(event.code==='KeyC'&&!event.repeat){toggleCamera();return;}
  if(event.code==='KeyG'&&!event.repeat){toggleGuide();return;}
  if(event.code.startsWith('Arrow')||event.code.startsWith('Shift'))keys.add(event.code);
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{keys.clear();stopFineAim();pointerId=null;pointerMode=null;});
document.addEventListener('visibilitychange',()=>{keys.clear();stopFineAim();});
window.addEventListener('resize',()=>renderer.resize());
if(globalThis.ResizeObserver)new ResizeObserver(()=>renderer.resize()).observe($('tableArea'));

function displayState(now) {
  if(mode!=='online'||frames.length<2||game.phase!=='rolling')return game;
  const target=now-80;
  let a=frames[0],b=frames[1];
  for(let i=1;i<frames.length;i++){a=frames[i-1];b=frames[i];if(b.time>=target)break;}
  if(a.game.id!==b.game.id||a.game.shotNumber!==b.game.shotNumber)return game;
  const t=clamp((target-a.time)/(b.time-a.time||1),0,1);
  return {...game,balls:b.game.balls.map(ball=>{
    const old=a.game.balls.find(other=>other.id===ball.id);
    if(!old||old.pocketed||ball.pocketed)return ball;
    return {...ball,x:old.x+(ball.x-old.x)*t,z:old.z+(ball.z-old.z)*t};
  })};
}
let previous=performance.now(),accumulator=0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt=Math.min(.06,Math.max(0,(now-previous)/1000));previous=now;
  if(document.hidden)return;
  if(screen==='game'&&mode!=='online'&&!dialogOpen()&&game.phase==='rolling'){
    accumulator+=dt;
    while(accumulator>=FIXED_DT){step(game,FIXED_DT);accumulator-=FIXED_DT;}
  } else accumulator=0;
  if(canAct()&&!placing){
    const finer=keys.has('ShiftLeft')||keys.has('ShiftRight');
    const direction=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    if(direction){aim+=direction*dt*(finer?.045:.32);aim=Math.atan2(Math.sin(aim),Math.cos(aim));aimDirty=true;}
    const powerChange=Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'));
    if(powerChange){power=clamp(power+powerChange*dt*.35,.05,1);aimDirty=true;syncControls();}
  }
  observeState();
  if(screen==='game')audio.process(game);
  if(mode==='online'&&canAct()&&aimDirty&&now-lastAimSent>120){lastAimSent=now;aimDirty=false;online.command('aim',{angle:aim,power,spin,calledPocket}).catch(()=>{});}
  if(now-lastUI>200){lastUI=now;renderUI();}
  const watching=mode==='online'&&!myTurn();
  const opponentAim=watching?snapshot?.aim:null;
  const currentAim=opponentAim?.angle??aim;
  renderer.render(displayState(now),{
    aim:currentAim,power:opponentAim?.power??power,spin:opponentAim?.spin??spin,
    showGuide:screen==='game'&&guide&&game.phase==='aiming'&&!placing&&(!game.ballInHand||game.cuePlaced)&&(!watching||!!opponentAim),
    showCue:screen==='game'&&!placing&&(!watching||!!opponentAim)&&(!game.ballInHand||game.cuePlaced),
    placement:placing?placement:null,calledPocket:watching?opponentAim?.calledPocket:calledPocket,
    selectingPocket:screen==='game'&&onEight()&&game.phase==='aiming'&&myTurn(),view
  },dt);
}
syncControls();showScreen('menu');renderUI();requestAnimationFrame(animate);
// A refresh reclaims the same seat; a shared invite never contains its credential.
const savedSession=OnlineRoom.saved();
if(savedSession&&(!initialCode||initialCode.toUpperCase()===savedSession.code))openRoom('resume');
