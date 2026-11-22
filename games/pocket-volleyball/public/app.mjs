import { createMatch, step, predictLanding, controllerPlayer, TEAM_NAMES } from './sim.mjs';
import { Renderer } from './renderer.mjs';
import { AudioEngine } from './audio.mjs';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const neutral = () => ({ mx: 0, my: 0, pass: false, spike: false, dive: false, switch: false });
const renderer = new Renderer($('court'));
const audio = new AudioEngine();
const keys = new Set();
const touch = [neutral(), neutral()];
const pointerResetters = [];
const pulses = [{}, {}];
const panels = ['home', 'local-panel', 'online-panel', 'lobby-panel'];
const dialogs = ['pause-dialog', 'help-dialog', 'result-dialog'];
const coarse = matchMedia('(pointer: coarse)');
let preferences = { difficulty: 'club', target: 11, guidance: 'simple', sound: true };
try {
  const saved = JSON.parse(localStorage.getItem('pocket-volleyball-options') || '{}');
  if (['chill', 'club', 'pro'].includes(saved.difficulty)) preferences.difficulty = saved.difficulty;
  if ([11, 21].includes(saved.target)) preferences.target = saved.target;
  if (['simple', 'moderate', 'expert'].includes(saved.guidance)) preferences.guidance = saved.guidance;
  if (typeof saved.sound === 'boolean') preferences.sound = saved.sound;
} catch {}
let state = createMatch({ aiOnly: true, difficulty: 'club', seed: 1948 });
let playing = false, localTwo = false, online = false, paused = false, helpWasPaused = false;
let panel = 'home', netMode = 'versus', currentMode = 'solo', lastFrame = 0, accumulator = 0;
let lastHud = 0, lastSend = 0, lastPing = 0, lastEvent = -1, resultShown = false;
let ws = null, wsGeneration = 0, intentionalClose = false, netBusy = false;
let room = null, snapshots = [], sequence = 0, rtt = 0, reconnectTimer, connectTimer;
let reconnectAttempts = 0, lastNetPacket = 0, toastTimer, pauseRequested = false;
let inputNow = [neutral(), neutral()], lastDirection = [{mx: 0,my: 0}, {mx: 0,my: 0}];

function setText(id, value) { const e = $(id); if (e.textContent !== value) e.textContent = value; }
function persistOptions() { try { localStorage.setItem('pocket-volleyball-options', JSON.stringify(preferences)); } catch {} }
function saveSession(value) { try { value ? sessionStorage.setItem('pocket-volleyball-room', JSON.stringify(value)) : sessionStorage.removeItem('pocket-volleyball-room'); } catch {} }
function readSession() { try { return JSON.parse(sessionStorage.getItem('pocket-volleyball-room') || 'null'); } catch { return null; } }
function showToast(message) { clearTimeout(toastTimer); setText('toast', message); $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3300); }
function closeDialogs() { for (const id of dialogs) if ($(id).open) $(id).close(); }
function clearInput() {
  keys.clear();
  for (const reset of pointerResetters) reset();
  pulses[0] = {}; pulses[1] = {};
  touch[0] = neutral(); touch[1] = neutral(); inputNow = [neutral(), neutral()];
  document.querySelectorAll('.action.down').forEach(e => e.classList.remove('down'));
  document.querySelectorAll('.stick-knob').forEach(e => { e.style.transform = ''; });
  if (online && room?.started) send({ type: 'input', seq: sequence++, input: neutral() });
}
function updateTouchMode() { document.body.classList.toggle('touch', coarse.matches || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).get('controls') === 'touch'); }
updateTouchMode(); coarse.addEventListener?.('change', updateTouchMode);
function setPlayUI(on) {
  document.body.classList.toggle('playing', on);
  document.body.classList.toggle('local-two', on && localTwo);
  for (const id of ['hud', 'rally-strip', 'play-hint', 'keyboard-hint']) $(id).hidden = !on;
  $('touch-controls').hidden = !(on && document.body.classList.contains('touch'));
  if (!on) $('point-call').hidden = true;
}
function showPanel(id) {
  panel = id;
  for (const p of panels) $(p).hidden = p !== id;
  setPlayUI(false);
  setText('online-settings', `${preferences.difficulty[0].toUpperCase() + preferences.difficulty.slice(1)} · sets to ${preferences.target}`);
}
function dismissPanels() { panel = null; for (const id of panels) $(id).hidden = true; setPlayUI(true); }
function activateAudio() { audio.unlock(); }
function startLocal(mode) {
  activateAudio(); disconnect(true); clearInput(); closeDialogs();
  currentMode = mode; localTwo = mode !== 'solo'; online = false; playing = true; paused = false;
  state = createMatch({ mode, difficulty: preferences.difficulty, target: preferences.target,
    assist: preferences.guidance !== 'expert', seed: Math.floor(Math.random() * 0x7fffffff) });
  lastEvent = -1; resultShown = false; accumulator = 0;
  dismissPanels(); setText('latency', '');
  setText('mode-label', mode === 'solo' ? 'SOLO DOUBLES' : mode === 'coop' ? 'LOCAL CO-OP' : 'LOCAL VERSUS');
  if (localTwo) {
    $('keyboard-hint').innerHTML = '<span><b>P1</b> WASD · J K L Q</span><span><b>P2</b> Arrows · , . / Right Shift</span><span>Gamepads: A pass · B spike · X dive · Y switch</span>';
    if (document.body.classList.contains('touch') && innerWidth < 740) showToast('For more court space, turn your device sideways.');
  } else {
    $('keyboard-hint').innerHTML = '<span><kbd>W A S D</kbd> move</span><span><kbd>J</kbd> pass / set</span><span><kbd>K</kbd> spike</span><span><kbd>L</kbd> dive / block</span><span><kbd>Q</kbd> switch</span>';
  }
  updateHUD();
}
function goHome() {
  disconnect(true); closeDialogs(); clearInput();
  playing = false; online = false; localTwo = false; paused = false; resultShown = false;
  state = createMatch({ aiOnly: true, difficulty: 'club', seed: 1948 + Math.floor(Math.random() * 999) });
  showPanel('home');
  history.replaceState(null, '', location.pathname);
}
function pauseMatch(reason = '') {
  if (!playing || state.phase === 'match') return;
  clearInput(); paused = true;
  if (online) { pauseRequested = true; send({ type: 'pause' }); }
  setText('pause-title', online ? 'Time out.' : 'Take a breather.');
  setText('pause-message', reason || (online ? 'Both players must be ready before the rally continues.' : 'The match is paused.'));
  $('resume').disabled = online && ws?.readyState !== WebSocket.OPEN;
  $('resume').querySelector('strong').textContent = online ? 'I’m ready' : 'Resume play';
  if (!$('help-dialog').open && !$('result-dialog').open && !$('pause-dialog').open) $('pause-dialog').showModal();
}
function resumeMatch() {
  activateAudio(); clearInput();
  if (online) {
    if (ws?.readyState !== WebSocket.OPEN) return showToast('Reconnecting to the court…');
    send({ type: 'ready', ready: true });
    $('resume').disabled = true;
    setText('pause-message', 'You’re ready. Waiting for the other player.');
  } else { paused = false; accumulator = 0; $('pause-dialog').close(); }
}
function showHelp() {
  helpWasPaused = paused;
  if (playing && state.phase !== 'match') pauseMatch();
  if ($('pause-dialog').open) $('pause-dialog').close();
  $('help-dialog').showModal();
}
function hideHelp() {
  $('help-dialog').close();
  if (playing && state.phase !== 'match') {
    if (online || helpWasPaused) pauseMatch();
    else { paused = false; accumulator = 0; clearInput(); }
  }
}

// Both keyboard maps use screen directions. The renderer rotates them with the court.
function keyboardInput(seat) {
  let left, right, up, down, pass, spike, dive, change;
  if (seat === 0) {
    left = keys.has('KeyA') || !localTwo && keys.has('ArrowLeft');
    right = keys.has('KeyD') || !localTwo && keys.has('ArrowRight');
    up = keys.has('KeyW') || !localTwo && keys.has('ArrowUp');
    down = keys.has('KeyS') || !localTwo && keys.has('ArrowDown');
    pass = keys.has('KeyJ') || keys.has('Space'); spike = keys.has('KeyK'); dive = keys.has('KeyL'); change = keys.has('KeyQ') || keys.has('KeyI');
  } else {
    left = keys.has('ArrowLeft'); right = keys.has('ArrowRight'); up = keys.has('ArrowUp'); down = keys.has('ArrowDown');
    pass = keys.has('Comma') || keys.has('Numpad1'); spike = keys.has('Period') || keys.has('Numpad2'); dive = keys.has('Slash') || keys.has('Numpad3'); change = keys.has('ShiftRight') || keys.has('Numpad0');
  }
  return { mx: Number(right) - Number(left), my: Number(down) - Number(up), pass, spike, dive, switch: change };
}
function collectInputs() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  return [0, 1].map(seat => {
    if (seat === 1 && !localTwo) return neutral();
    const k = keyboardInput(seat), t = touch[seat], p = pads[seat];
    let mx = k.mx + t.mx, my = k.my + t.my;
    const down = index => p?.buttons[index]?.pressed === true;
    if (p) { mx += Math.abs(p.axes[0] || 0) > .17 ? p.axes[0] : 0; my += Math.abs(p.axes[1] || 0) > .17 ? p.axes[1] : 0; }
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    const world = renderer.screenDirection(mx, my);
    const pulse = action => (pulses[seat][action] || 0) > performance.now();
    return { ...world, pass: k.pass || t.pass || down(0) || pulse('pass'), spike: k.spike || t.spike || down(1) || pulse('spike'),
      dive: k.dive || t.dive || down(2) || pulse('dive'), switch: k.switch || t.switch || down(3) || pulse('switch') };
  });
}
const gameKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyJ','KeyK','KeyL','KeyQ','KeyI','Space','Comma','Period','Slash','ShiftRight','Numpad0','Numpad1','Numpad2','Numpad3']);
addEventListener('keydown', e => {
  if (e.code === 'Escape' && playing) {
    e.preventDefault();
    if ($('help-dialog').open) return hideHelp();
    if ($('result-dialog').open) return;
    return paused ? resumeMatch() : pauseMatch();
  }
  if (!playing || paused || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || dialogs.some(id => $(id).open)) return;
  if (gameKeys.has(e.code)) {
    e.preventDefault(); keys.add(e.code); activateAudio();
    if (!e.repeat) {
      const actions0 = { KeyJ:'pass', Space:'pass', KeyK:'spike', KeyL:'dive', KeyQ:'switch', KeyI:'switch' };
      const actions1 = { Comma:'pass', Numpad1:'pass', Period:'spike', Numpad2:'spike', Slash:'dive', Numpad3:'dive', ShiftRight:'switch', Numpad0:'switch' };
      if (actions0[e.code]) pulses[0][actions0[e.code]] = performance.now() + 130;
      if (localTwo && actions1[e.code]) pulses[1][actions1[e.code]] = performance.now() + 130;
    }
  }
});
addEventListener('keyup', e => { keys.delete(e.code); if (playing && gameKeys.has(e.code)) e.preventDefault(); });
addEventListener('blur', () => { clearInput(); if (playing && !paused) pauseMatch(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (playing) pauseMatch(); } });
addEventListener('resize', () => { clearInput(); renderer.resize(); });
new ResizeObserver(() => renderer.resize()).observe($('game-stage'));
for (const id of dialogs) $(id).addEventListener('cancel', e => { e.preventDefault(); if (id === 'help-dialog') hideHelp(); else if (id === 'pause-dialog') resumeMatch(); });

for (const stick of document.querySelectorAll('.joystick')) {
  let pointer = null;
  const seat = Number(stick.dataset.seat), knob = stick.querySelector('.stick-knob');
  pointerResetters.push(() => {
    const old = pointer; pointer = null;
    if (old !== null && stick.hasPointerCapture(old)) stick.releasePointerCapture(old);
    knob.style.transform = '';
  });
  const move = e => {
    if (e.pointerId !== pointer || paused || !playing) return;
    const box = stick.getBoundingClientRect(), radius = box.width * .34;
    let dx = e.clientX - box.left - box.width / 2, dy = e.clientY - box.top - box.height / 2;
    const distance = Math.hypot(dx, dy); if (distance > radius) { dx *= radius / distance; dy *= radius / distance; }
    touch[seat].mx = dx / radius; touch[seat].my = dy / radius;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    e.preventDefault();
  };
  const release = e => { if (pointer !== e.pointerId) return; pointer = null; touch[seat].mx = 0; touch[seat].my = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerdown', e => { if (pointer !== null || paused) return; e.preventDefault(); pointer = e.pointerId; stick.setPointerCapture(pointer); activateAudio(); move(e); });
  stick.addEventListener('pointermove', move); stick.addEventListener('pointerup', release); stick.addEventListener('pointercancel', release); stick.addEventListener('lostpointercapture', release);
}
for (const button of document.querySelectorAll('.action')) {
  let pointer = null;
  const seat = Number(button.dataset.seat), action = button.dataset.action;
  pointerResetters.push(() => {
    const old = pointer; pointer = null;
    if (old !== null && button.hasPointerCapture(old)) button.releasePointerCapture(old);
    button.classList.remove('down');
  });
  button.addEventListener('pointerdown', e => { if (paused || !playing || pointer !== null) return; e.preventDefault(); pointer = e.pointerId; button.setPointerCapture(pointer); touch[seat][action] = true; pulses[seat][action] = performance.now() + 130; button.classList.add('down'); activateAudio(); });
  const release = e => { if (pointer !== e.pointerId) return; pointer = null; touch[seat][action] = false; button.classList.remove('down'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', e => e.preventDefault());
}

function send(data) {
  if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 64000) return false;
  try { ws.send(JSON.stringify(data)); return true; } catch { return false; }
}
function setNetworkBusy(busy, message = '') {
  netBusy = busy; $('create-room').disabled = busy; $('join-room').disabled = busy;
  if (message) setText('online-status', message);
}
function disconnect(leave = false) {
  intentionalClose = true; clearTimeout(reconnectTimer); clearTimeout(connectTimer); wsGeneration++;
  if (leave) { send({ type: 'leave' }); saveSession(null); }
  if (ws) ws.close(); ws = null; room = null; snapshots = []; setNetworkBusy(false);
  reconnectAttempts = 0; pauseRequested = false;
}
function connect(request, restoring = false) {
  activateAudio();
  if (!restoring && netBusy) return;
  if (!restoring) disconnect(false);
  intentionalClose = false; const generation = ++wsGeneration;
  setNetworkBusy(true, restoring ? 'Reconnecting to your court…' : 'Opening the court…');
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try { ws = new WebSocket(`${scheme}//${location.host}/ws`); }
  catch { setNetworkBusy(false, 'The connection could not be opened. Please try again.'); return; }
  const socket = ws;
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (generation !== wsGeneration || ws?.readyState === WebSocket.OPEN) return;
    setText('online-status', 'The court is taking a moment to wake up. Still connecting…');
  }, 8000);
  socket.addEventListener('open', () => { if (generation !== wsGeneration) return; sequence = 0; lastNetPacket = performance.now(); socket.send(JSON.stringify(request)); });
  socket.addEventListener('message', event => {
    if (generation !== wsGeneration) return;
    let message; try { message = JSON.parse(event.data); } catch { return; }
    lastNetPacket = performance.now();
    if (message.type === 'welcome') {
      clearTimeout(connectTimer); reconnectAttempts = 0; setNetworkBusy(false, '');
      room = { code: message.code, seat: message.seat, token: message.token, isHost: message.isHost,
        mode: message.mode, started: message.started, paused: message.paused, players: [] };
      online = true; currentMode = message.mode; state = message.state; snapshots = [];
      saveSession({ code: room.code, token: room.token });
      history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(room.code)}`);
      if (message.started) beginOnline(message); else showLobby();
      return;
    }
    if (message.type === 'lobby' && room) {
      room = { ...room, ...message, isHost: room.seat === message.host };
      if (!message.started) updateLobby();
      else if (playing && message.paused) {
        paused = true; pauseRequested = true;
        setText('pause-message', message.reason || 'Both players must be ready to continue.');
        const ready = message.players.find(p => p.seat === room.seat)?.ready;
        $('resume').disabled = !!ready;
        if (ready) setText('pause-message', 'You’re ready. Waiting for the other player.');
        else $('resume').querySelector('strong').textContent = 'I’m ready';
        if (!$('help-dialog').open && !$('result-dialog').open && !$('pause-dialog').open) $('pause-dialog').showModal();
      }
      return;
    }
    if ((message.type === 'state' || message.type === 'started') && room) {
      if (!playing || message.type === 'started') beginOnline(message);
      state = message.state;
      if (!message.paused) {
        paused = false; pauseRequested = false;
        if ($('pause-dialog').open) $('pause-dialog').close();
        $('resume').disabled = false;
      } else { paused = true; pauseRequested = true; }
      snapshots.push({ state: message.state, at: performance.now() }); if (snapshots.length > 6) snapshots.shift();
      return;
    }
    if (message.type === 'pong' && Number.isFinite(message.sent)) {
      rtt = Math.max(0, Math.round(performance.now() - message.sent)); setText('latency', `${rtt} ms`); return;
    }
    if (message.type === 'error') {
      setNetworkBusy(false, message.message || 'Could not join this court.');
      setText('lobby-status', message.message || 'Try again.');
      if (['RECONNECT_EXPIRED','ROOM_NOT_FOUND'].includes(message.code) && restoring) {
        saveSession(null); intentionalClose = true; socket.close();
        playing = false; online = false; closeDialogs(); showPanel('online-panel');
      } else if (playing) showToast(message.message || 'That action could not be completed.');
      return;
    }
  });
  socket.addEventListener('error', () => { if (generation === wsGeneration && !room) setText('online-status', 'Could not connect yet. The server may be waking up. Try again in a moment.'); });
  socket.addEventListener('close', event => {
    if (generation !== wsGeneration || intentionalClose) return;
    clearTimeout(connectTimer); setNetworkBusy(false);
    if (event.code === 4001) {
      intentionalClose = true; saveSession(null);
      if (playing) { paused = true; pauseRequested = true; pauseMatch('This player’s seat is now open in another tab. Return to the menu here.'); $('resume').disabled = true; }
      else setText('lobby-status', 'This player’s seat is now open in another tab.');
      return;
    }
    const session = readSession();
    if (session && reconnectAttempts < 18) {
      if (playing) { paused = true; pauseRequested = true; pauseMatch('Connection interrupted. Reconnecting to your court…'); }
      else setText('lobby-status', 'Connection interrupted. Reconnecting…');
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => connect({ type: 'reconnect', ...session }, true), Math.min(1000 + reconnectAttempts * 450, 4500));
    } else {
      setText('online-status', 'Connection closed. Create or join a room to try again.');
      if (playing) { paused = true; pauseRequested = true; pauseMatch('The connection ended. Return to the menu and join again.'); $('resume').disabled = true; }
      else setText('lobby-status', 'Connection closed. Leave this room and join again.');
    }
  });
}
function showLobby() {
  playing = false; localTwo = false; paused = false; closeDialogs(); showPanel('lobby-panel'); updateLobby();
}
function updateLobby() {
  if (!room) return;
  setText('room-code', room.code);
  setText('lobby-mode', room.mode === 'coop' ? 'ONLINE / SAME TEAM' : 'ONLINE / VERSUS');
  $('invite-link').value = `${location.origin}${location.pathname}?room=${room.code}`;
  for (let seat = 0; seat < 2; seat++) {
    const member = room.players?.find(p => p.seat === seat);
    $(`seat-${seat}`).querySelector('strong').textContent = member?.connected ? (seat === room.seat ? 'You’re here' : 'Friend joined') : member ? 'Reconnecting…' : 'Waiting…';
  }
  const both = room.players?.filter(p => p.connected).length === 2;
  $('start-online').disabled = !room.isHost || !both;
  $('start-online').querySelector('strong').textContent = room.isHost ? 'Start match' : 'Waiting for Player 1';
  $('start-online').querySelector('span').textContent = both ? (room.mode === 'coop' ? 'You two vs. the CPU' : 'One team each. Let’s play.') : 'Waiting for a friend';
  setText('lobby-status', both ? (room.isHost ? 'Both players are here. Start when you’re ready.' : 'Player 1 will start the match.') : 'Send the link or share the code.');
}
function beginOnline(message) {
  playing = true; online = true; localTwo = false; room.started = true;
  paused = message.paused === true; pauseRequested = paused;
  state = message.state; clearInput(); closeDialogs(); resultShown = false; lastEvent = -1;
  snapshots = [{ state, at: performance.now() }]; dismissPanels();
  setText('mode-label', `${room.mode === 'coop' ? 'ONLINE CO-OP' : 'ONLINE VERSUS'} · P${room.seat + 1}`);
  $('keyboard-hint').innerHTML = '<span><kbd>W A S D</kbd> move</span><span><kbd>J</kbd> pass / set</span><span><kbd>K</kbd> spike</span><span><kbd>L</kbd> dive / block</span><span><kbd>Q</kbd> switch</span>';
  if (paused) pauseMatch(message.reason || 'Both players must be ready to continue.');
  updateHUD();
}

function visualState(now) {
  if (!online || !playing || paused || snapshots.length < 2) return state;
  const newest = snapshots.at(-1), desired = newest.state.time + Math.min((now - newest.at) / 1000, .12) - .055;
  let before = snapshots[0], after = newest;
  for (let i = 1; i < snapshots.length; i++) if (snapshots[i].state.time >= desired) { before = snapshots[i - 1]; after = snapshots[i]; break; }
  if (before.state.phase !== after.state.phase || desired >= newest.state.time) return state;
  const blend = clamp((desired - before.state.time) / Math.max(.001, after.state.time - before.state.time), 0, 1);
  const mix = (a, b) => ({ ...b, x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * blend });
  const visual = { ...state, players: state.players.map((p, i) => mix(before.state.players[i], after.state.players[i])), ball: mix(before.state.ball, after.state.ball) };
  // Only the local sprite is predicted; the ball, contacts and scores stay authoritative.
  const activeId = state.controls[room.seat], active = visual.players[activeId];
  const source = state.players[activeId], input = inputNow[0];
  if (active && source && state.phase === 'rally' && source.action !== 'dive' && source.action !== 'block') {
    const lead = Math.min(.09, (now - newest.at) / 1000 + rtt / 2000);
    active.x = clamp(source.x + input.mx * 4.75 * lead, source.team === 0 ? -9.2 : .42, source.team === 0 ? -.42 : 9.2);
    active.y = clamp(source.y + input.my * 4.75 * lead, -5.1, 5.1);
  }
  return visual;
}
function layoutPadding() {
  const width = innerWidth, height = innerHeight;
  if (!playing && panel) {
    const box = $(panel).getBoundingClientRect();
    if (width > 740 || height < 600 && width >= 650) return { top: 85, bottom: 35, left: box.right + 30, right: 30 };
    return { top: Math.max(68, $('topbar').getBoundingClientRect().bottom + 5), bottom: height - box.top + 15, left: 16, right: 16 };
  }
  const hudBottom = $('rally-strip').getBoundingClientRect().bottom;
  if (document.body.classList.contains('touch') && height < 600 && width >= 650 && !localTwo) {
    return { top: hudBottom + 9, bottom: 20, left: 132, right: 210 };
  }
  const controls = !$('touch-controls').hidden ? $('touch-controls').getBoundingClientRect().height : (height < 600 ? 49 : 80);
  return { top: hudBottom + 12, bottom: controls + (height < 600 ? 7 : 23), left: 18, right: 18 };
}
function updateHUD() {
  if (!playing) return;
  setText('score-0', String(state.score[0])); setText('score-1', String(state.score[1]));
  setText('set-label', `SET ${state.setNumber}`); setText('match-label', `FIRST TO ${state.target || preferences.target}`);
  for (let team = 0; team < 2; team++) {
    const html = [0,1].map(i => `<i class="${i < state.sets[team] ? 'won' : ''}"></i>`).join('');
    if ($(`sets-${team}`).innerHTML !== html) $(`sets-${team}`).innerHTML = html;
    $(`sets-${team}`).setAttribute('aria-label', `${state.sets[team]} sets won`);
  }
  const myController = online ? room.seat : 0, player = controllerPlayer(state, myController);
  const landingTeam = state.phase === 'rally' ? (predictLanding(state.ball).x < 0 ? 0 : 1) : state.possession;
  const displayedTouches = landingTeam === state.possession ? state.touches : 0;
  setText('team-0-name', 'TIDELINE'); setText('team-1-name', 'SUNBREAK');
  let message = state.message || 'Play on';
  if (state.phase === 'serve') message = state.serverId === player?.id ? 'YOUR SERVE' : `${TEAM_NAMES[state.servingTeam].toUpperCase()} TO SERVE`;
  else if (state.phase === 'rally') message = `${TEAM_NAMES[landingTeam].toUpperCase()} · ${['RECEIVE','SET IT UP','ATTACK','OVER THE NET'][Math.min(displayedTouches, 3)]}`;
  setText('rally-message', message);
  [...$('touch-count').children].forEach((e,i) => e.classList.toggle('used', i < displayedTouches));
  const point = state.phase === 'point' || state.phase === 'set';
  $('point-call').hidden = !point;
  if (point) { $('point-call').querySelector('strong').textContent = state.phase === 'set' ? 'SET WON' : 'POINT'; $('point-call').querySelector('span').textContent = state.message; }
  const touchMode = document.body.classList.contains('touch');
  const passName = touchMode ? 'Pass / Set' : 'J or Space';
  const hints = state.phase === 'serve' ? (state.serverId === player?.id ? `Hold ${passName} to serve. Move sideways to place it.` : 'Get ready. Watch the landing ring.')
    : state.phase === 'rally' ? (landingTeam === player?.team ? (displayedTouches >= 2 ? 'Get under the set. Hold Spike for the finish.' : `Move to the landing ring. Hold ${touchMode ? 'Pass / Set' : 'J'} to meet the ball.`) : 'Cover the open sand. A dive can save a low ball.')
    : point ? 'Next rally coming up.' : '';
  setText('play-hint', preferences.guidance === 'simple' ? hints : '');
  if (state.phase === 'match' && !resultShown) {
    resultShown = true; clearInput(); closeDialogs();
    const won = state.winner === player?.team;
    setText('result-title', localTwo && currentMode === 'versus' ? `${TEAM_NAMES[state.winner]} wins.` : won ? 'That’s your match.' : 'Good game.');
    setText('result-score', `${state.sets[0]} — ${state.sets[1]}`);
    const stats = state.stats;
    setText('result-description', `${TEAM_NAMES[state.winner]} takes the match.${stats ? ` ${stats.rallies} rallies. Longest rally: ${stats.longestRally} touches.` : ''}`);
    $('rematch').disabled = online && !room.isHost;
    $('rematch').querySelector('strong').textContent = online && !room.isHost ? 'Player 1 can start a rematch' : 'Play again';
    $('result-dialog').showModal();
  }
}

function frame(now) {
  const dt = Math.min((now - (lastFrame || now)) / 1000, .08); lastFrame = now;
  inputNow = playing && !paused ? collectInputs() : [neutral(), neutral()];
  if ((!playing || !paused) && !online) {
    accumulator = Math.min(accumulator + dt, .1);
    while (accumulator >= 1 / 60) { step(state, 1 / 60, playing ? inputNow : [neutral(), neutral()]); accumulator -= 1 / 60; }
    if (!playing && state.phase === 'match') state = createMatch({ aiOnly: true, difficulty: 'club', seed: Math.floor(Math.random() * 999999) });
  }
  if (online && playing && room?.started && now - lastSend > 1000 / 30) {
    send({ type: 'input', seq: sequence++, input: inputNow[0] }); lastSend = now;
    if (!paused && lastNetPacket && now - lastNetPacket > 1800) { pauseRequested = true; pauseMatch('Waiting for the connection. The match will resume when both players are ready.'); send({ type: 'pause' }); }
  }
  if (online && now - lastPing > 2000) { send({ type: 'ping', sent: now }); lastPing = now; }
  renderer.draw(visualState(now), { time: now / 1000, menu: !playing, localSeat: online ? room?.seat || 0 : 0, online,
    guidance: preferences.guidance, padding: layoutPadding(), showLanding: playing && preferences.guidance !== 'expert' });
  if (playing && state.lastEvent.id !== lastEvent) { lastEvent = state.lastEvent.id; audio.event(state.lastEvent); }
  if (now - lastHud > 80) { updateHUD(); lastHud = now; }
  requestAnimationFrame(frame);
}

for (const key of ['difficulty','target','guidance']) {
  $(key).value = String(preferences[key]);
  $(key).addEventListener('change', () => { preferences[key] = key === 'target' ? Number($(key).value) : $(key).value; document.body.classList.toggle('expert', preferences.guidance === 'expert'); persistOptions(); });
}
document.body.classList.toggle('expert', preferences.guidance === 'expert');
audio.setEnabled(preferences.sound); setText('sound', preferences.sound ? 'Sound on' : 'Sound off'); $('sound').setAttribute('aria-pressed', String(preferences.sound));
$('sound').addEventListener('click', () => { preferences.sound = !preferences.sound; activateAudio(); audio.setEnabled(preferences.sound); setText('sound', preferences.sound ? 'Sound on' : 'Sound off'); $('sound').setAttribute('aria-pressed', String(preferences.sound)); persistOptions(); });
$('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { showToast('Use your browser’s full-screen option.'); } });
$('quick-match').addEventListener('click', () => startLocal('solo'));
$('local-choice').addEventListener('click', () => { activateAudio(); showPanel('local-panel'); });
$('online-choice').addEventListener('click', () => { activateAudio(); showPanel('online-panel'); setText('online-status',''); });
document.querySelectorAll('.back-home').forEach(b => b.addEventListener('click', goHome));
$('local-versus').addEventListener('click', () => startLocal('versus'));
$('local-coop').addEventListener('click', () => startLocal('coop'));
function onlineMode(mode) { netMode = mode; $('net-versus').setAttribute('aria-pressed', String(mode === 'versus')); $('net-coop').setAttribute('aria-pressed', String(mode === 'coop')); }
$('net-versus').addEventListener('click', () => onlineMode('versus'));
$('net-coop').addEventListener('click', () => onlineMode('coop'));
$('create-room').addEventListener('click', () => connect({ type: 'create', mode: netMode, difficulty: preferences.difficulty, target: preferences.target }));
function joinRoom() {
  const code = $('room-input').value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (code.length !== 6) { setText('online-status', 'Enter the six-character room code.'); return; }
  connect({ type: 'join', code });
}
$('join-room').addEventListener('click', joinRoom);
$('room-input').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
$('room-input').addEventListener('input', () => { $('room-input').value = $('room-input').value.toUpperCase().replace(/[^A-Z0-9]/g,''); });
$('leave-room').addEventListener('click', goHome);
$('copy-link').addEventListener('click', async () => { if (!room) return; const url = `${location.origin}${location.pathname}?room=${room.code}`; try { await navigator.clipboard.writeText(url); showToast('Invite link copied. Send it to your friend.'); } catch { $('invite-link').hidden = false; $('invite-link').value = url; $('invite-link').select(); showToast('Select and copy the invite link.'); } });
$('start-online').addEventListener('click', () => { activateAudio(); send({ type: 'start' }); });
$('pause').addEventListener('click', () => pauseMatch()); $('resume').addEventListener('click', resumeMatch);
$('exit-match').addEventListener('click', goHome); $('result-menu').addEventListener('click', goHome);
$('help').addEventListener('click', showHelp); $('pause-help').addEventListener('click', showHelp);
$('close-help').addEventListener('click', hideHelp); $('help-done').addEventListener('click', hideHelp);
$('rematch').addEventListener('click', () => { activateAudio(); if (online) send({ type: 'rematch' }); else startLocal(currentMode); });
addEventListener('gamepadconnected', () => showToast('Gamepad ready. A pass / set · B spike · X dive · Y switch.'));

renderer.resize(); showPanel('home'); $('loading').hidden = true;
const requestedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g,'');
const savedRoom = readSession();
if (savedRoom?.code && savedRoom?.token && (!requestedRoom || requestedRoom === savedRoom.code)) {
  showPanel('online-panel'); connect({ type: 'reconnect', ...savedRoom }, true);
} else if (requestedRoom?.length === 6) {
  showPanel('online-panel'); $('room-input').value = requestedRoom; setText('online-status', 'Your friend shared this court. Tap Join to take your place.');
}
requestAnimationFrame(frame);
