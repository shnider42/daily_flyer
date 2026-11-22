import { MISSIONS, createGame, step, issueOrder, setRole, getObjective, hasLineOfSight } from './sim.mjs';
import { Renderer } from './renderer.mjs';
import { GameAudio } from './audio.mjs';
import { stickVector, touchIntent } from './touch-input.mjs';
import { CoopClient } from './coop-client.mjs';
import { coopServerURL } from './network-config.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const renderer = new Renderer(canvas);
const audio = new GameAudio();
const STORAGE = 'dfe-chalk-v1';
const defaults = { role: 'leader', difficulty: 'standard', guidance: 'simple', sound: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, completed: {} };
let preferences = { ...defaults };
try { preferences = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE) || '{}') }; } catch { /* Storage can be unavailable in a private browsing session. */ }
if (!['leader', 'member'].includes(preferences.role)) preferences.role = 'leader';
if (!['story', 'standard', 'veteran'].includes(preferences.difficulty)) preferences.difficulty = 'standard';
if (!['simple', 'moderate', 'expert'].includes(preferences.guidance)) preferences.guidance = 'simple';
if (!preferences.completed || typeof preferences.completed !== 'object') preferences.completed = {};

const touchQuery = matchMedia('(pointer: coarse)');
let touch = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0);
let selectedMission = 0;
let game = null;
let menuScene = createGame({ mission: 1, role: 'leader', difficulty: 'story', seed: 19931003 });
let mode = 'menu';
let paused = false;
let showMap = false;
let placingOrder = false;
let lastTime = 0;
let accumulator = 0;
let hudTimer = 0;
let lastRadio = '';
let toastTimer;
let previousDialogFocus = null;
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let viewportSize = '';
let touchAim = null;
let interactionPointer = null;
let coop = null;
let onlineEpoch = null;
let onlineRole = null;
let onlineConnection = 'idle';
let coopDialogMode = 'create';
let coopBusy = false;
let lastRoomRoster = '';
const neutralInput = () => ({ moveX:0,moveY:0,aimX:null,aimY:null,fire:false,interact:false,reload:false,smoke:false,sprint:false });
const online = () => !!coop?.active || !!game?.coop;
const keys = new Set();
const pointer = { x: 0, y: 0, valid: false, fire: false };
const touchInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimStrength: 0, interact: false };
const actions = { reload: false, smoke: false };
const activeSticks = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const player = () => game?.squad.find(s => s.id === game.playerId);
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function save() { try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch { /* Gameplay works without persistent storage. */ } }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3400); }
function fit() {
  document.body.classList.toggle('touch', touch && mode !== 'menu');
  const rect = $('battlefield').getBoundingClientRect();
  const size = `${Math.round(rect.width)}:${Math.round(rect.height)}:${touch}`;
  if (viewportSize && size !== viewportSize) clearInput();
  viewportSize = size;
  renderer.resize(rect.width, rect.height, Math.min(devicePixelRatio || 1, 2));
  measureSafeInsets();
}
function measureSafeInsets() {
  if (!touch || mode === 'menu') { safeInsets = { top: 0, right: 0, bottom: 0, left: 0 }; return; }
  const rect = canvas.getBoundingClientRect();
  const controlsRect = $('touchControls').getBoundingClientRect();
  const topElements = showMap ? [document.querySelector('.topbar'), ...(placingOrder ? [$('orderHint'), $('cancelOrder')] : [])] : [document.querySelector('.topbar'), document.querySelector('.objective-panel'), $('squad')];
  const top = Math.max(...topElements.map(el => el?.getBoundingClientRect().bottom || rect.top)) - rect.top + 10;
  safeInsets = { top: Math.min(rect.height * .43, top), right: 20, bottom: showMap ? 58 : Math.min(rect.height * .43, rect.bottom - controlsRect.top + 10), left: 20 };
}
new ResizeObserver(fit).observe($('battlefield'));
window.addEventListener('resize', fit);
touchQuery.addEventListener('change', () => { clearInput(); touch = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0); $('touchControls').hidden = !touch || mode === 'menu'; fit(); soundUI(); });

function soundUI() {
  $('menuSound').textContent = preferences.sound ? 'Sound on' : 'Sound off';
  $('soundToggle').checked = preferences.sound;
  $('motionToggle').checked = preferences.reducedMotion;
  $('touchToggle').checked = touch;
  audio.setEnabled(preferences.sound);
}
function chooseRole(role) {
  preferences.role = role;
  document.querySelectorAll('[data-role]').forEach(button => { const chosen = button.dataset.role === role; button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen)); });
  $('roleExplanation').textContent = role === 'leader' ? 'Control Hale. Move your squad, call a hold, and send help to the wounded.' : 'Control Mercer. Hale sets the pace, calls the objectives, and waits when you fall behind.';
  save();
}
function missionMenu() {
  $('campaignCount').textContent = `${Object.keys(preferences.completed).filter(key => preferences.completed[key]).length} / ${MISSIONS.length} COMPLETE`;
  $('missionList').innerHTML = MISSIONS.map((mission, i) => `<button type="button" class="mission-choice ${i === selectedMission ? 'selected' : ''}" data-mission="${i}" aria-pressed="${i === selectedMission}"><span class="mission-number">0${i + 1}</span><span class="mission-name">${escape(mission.title)}</span>${preferences.completed[mission.id] ? '<span class="mission-completed">COMPLETE</span>' : ''}</button>`).join('');
  const mission = MISSIONS[selectedMission];
  $('briefTime').textContent = mission.time || mission.subtitle;
  $('briefTitle').textContent = mission.title;
  $('briefDescription').textContent = mission.description;
  $('briefGoal').textContent = mission.goals?.[0] || mission.briefing?.[0] || '';
  $('deploy').textContent = `DEPLOY TO ${mission.title.toUpperCase()}`;
}
function clearInput() {
  keys.clear(); pointer.fire = false; pointer.valid = false;
  touchInput.moveX = 0; touchInput.moveY = 0; touchInput.aimX = 0; touchInput.aimY = 0; touchInput.aimStrength = 0; touchInput.interact = false; touchAim = null;
  actions.reload = false; actions.smoke = false;
  for (const [id, record] of [...activeSticks]) { try { record.element.releasePointerCapture(id); } catch {} }
  activeSticks.clear();
  if (interactionPointer !== null) { try { $('touchInteract').releasePointerCapture(interactionPointer); } catch {} interactionPointer = null; }
  document.querySelectorAll('.stick-knob').forEach(knob => knob.style.transform = 'translate(0, 0)');
  document.querySelectorAll('.joystick').forEach(el => { el.classList.remove('active', 'firing', 'sprinting'); el.style.removeProperty('--stick-origin-x'); el.style.removeProperty('--stick-origin-y'); });
  $('touchInteract').classList.remove('working');
  if (online()) coop.clearInput();
}
function startMission(index = selectedMission) {
  if (online()) coop.leave();
  onlineEpoch = null; onlineRole = null; document.body.classList.remove('online'); $('coopBadge').hidden = true;
  selectedMission = clamp(index, 0, MISSIONS.length - 1);
  game = createGame({ mission: selectedMission, role: preferences.role, difficulty: preferences.difficulty, seed: Date.now() >>> 0 });
  mode = 'playing'; paused = false; accumulator = 0; showMap = false; placingOrder = false; lastRadio = ''; hudTimer = 0;
  clearInput();
  document.body.classList.remove('in-menu', 'orders-open', 'map-open', 'placing-order');
  $('menu').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
  $('mapLegend').hidden = true; $('orderHint').hidden = true;
  $('missionName').textContent = game.mission.title.toUpperCase();
  updateOrders(); audio.unlock(); audio.setEnabled(preferences.sound); fit(); updateHUD();
  canvas.focus({ preventScroll: true });
  syncMapUI(); closeOrders();
  toast(touch ? 'Left: move · Right: aim, push farther to fire' : 'WASD to move. Follow the amber objective marker.');
}
function returnToMenu() {
  if (online()) coop.leave();
  onlineEpoch = null; onlineRole = null; $('coopOverlay').hidden = true; $('coopBadge').hidden = true;
  mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; clearInput(); audio.stop();
  document.body.classList.add('in-menu'); document.body.classList.remove('orders-open', 'touch', 'map-open', 'placing-order', 'online');
  $('menu').hidden = false; $('hud').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = true;
  missionMenu(); fit(); $('deploy').focus({ preventScroll: true });
}
function pause(value = true) {
  if (mode !== 'playing') return;
  paused = value; accumulator = 0; clearInput(); closeOrders();
  $('pauseOverlay').hidden = !value;
  updatePauseUI();
  if (value) { audio.stop(); $('resume').focus(); } else { audio.unlock(); audio.setEnabled(preferences.sound); canvas.focus({ preventScroll: true }); }
}
function updateOrders() {
  const leader = game.role === 'leader';
  const leaderPeer = online() ? coop.room?.players.find(p => p.role === 'leader' && p.connected) : null;
  $('orderLabel').textContent = leader ? 'SQUAD ORDERS' : leaderPeer ? `REQUESTS TO ${leaderPeer.name.toUpperCase()}` : 'REQUESTS TO HALE';
  const items = leader ? [['move', '', 'Move'], ['follow', 'Q', 'Regroup'], ['hold', 'H', 'Hold'], ['assist', 'F', 'Assist']] : [['ready', 'Q', 'Ready'], ['wait', 'H', 'Wait'], ['help', 'F', 'Need help']];
  $('orderButtons').innerHTML = items.map(([type, key, label]) => `<button data-order="${type}">${key ? `<kbd>${key}</kbd>` : ''}${label}</button>`).join('');
  ($('touchOrderLabel') || $('touchOrder')).textContent = leader ? 'Squad' : 'Radio';
  $('touchOrder').setAttribute('aria-label', leader ? 'Squad orders' : 'Radio requests');
  $('touchOrder').setAttribute('aria-controls', 'orderButtons');
  $('desktopHint').textContent = leader ? 'WASD move · Mouse fire · E assist · R reload · G smoke · Right click order' : 'WASD move · Mouse fire · E assist · R reload · Q ready · H wait · F help';
}
function doOrder(type, point) {
  if (mode !== 'playing' || paused) return;
  if (type === 'move' && !point) {
    clearInput(); closeOrders(); placingOrder = true;
    if (touch) showMap = true;
    syncMapUI();
    return;
  }
  if (online()) coop.order(type, point).catch(() => {});
  else issueOrder(game, type, point);
  clearInput(); placingOrder = false; closeOrders();
  if (touch && type === 'move') showMap = false;
  syncMapUI();
  audio.click(); updateHUD();
}
function closeOrders() { document.body.classList.remove('orders-open'); $('touchOrder').setAttribute('aria-expanded', 'false'); }
function syncMapUI() {
  document.body.classList.toggle('map-open', showMap);
  document.body.classList.toggle('placing-order', placingOrder);
  $('mapLegend').hidden = !showMap;
  $('orderHint').hidden = !placingOrder;
  $('orderHint').textContent = touch ? 'Tap a destination for the squad.' : 'Choose a destination on the battlefield. Escape cancels.';
  ($('mapToggleLabel') || $('mapToggle')).textContent = showMap ? 'Close' : 'Map';
  $('mapToggle').setAttribute('aria-pressed', String(showMap));
  $('mapToggle').setAttribute('aria-label', showMap ? 'Close battlefield map' : 'Toggle battlefield map');
  measureSafeInsets();
}
function toggleMap() {
  if (mode !== 'playing' || paused) return;
  clearInput(); closeOrders(); showMap = !showMap; placingOrder = false; syncMapUI();
}
function cancelOrder() { clearInput(); placingOrder = false; if (touch) showMap = false; syncMapUI(); }
function canAct() { return mode === 'playing' && !paused && (!online() || coop.connected) && !showMap && !placingOrder && !document.body.classList.contains('orders-open') && player()?.alive && !player()?.downed; }

function assistAction() {
  const p = player(); if (!p || !p.alive || p.downed || !game) return null;
  const down = [...game.squad, ...(game.survivors || []).filter(s => s.stabilized)].filter(s => s.alive && s.downed && s.id !== p.id && Math.hypot(s.x - p.x, s.y - p.y) < 70).sort((a,b) => Math.hypot(a.x-p.x,a.y-p.y) - Math.hypot(b.x-p.x,b.y-p.y))[0];
  if (down) return { label: 'Revive', detail: `Hold to help ${down.name}`, progress: (down.reviveProgress || 0) / 4 };
  const objective = getObjective(game), distance = objective ? Math.hypot(p.x-objective.x,p.y-objective.y) : Infinity;
  if (objective?.kind === 'rescue' && distance < objective.radius) return { label: 'Rescue', detail: 'Hold to stabilize the crew', progress: objective.progress || 0 };
  if (objective?.kind === 'barricade' && distance < 85) return { label: 'Clear', detail: 'Hold to clear the route', progress: objective.progress || 0 };
  if (p.hp < p.maxHp && p.medkits > 0 && !['rescue','barricade'].includes(objective?.kind)) return { label: 'Bandage', detail: 'Hold to bandage yourself', progress: (p.bandageProgress || 0) / 3 };
  return null;
}
function openInfo(id) {
  previousDialogFocus = document.activeElement;
  if (mode === 'playing' && !paused) pause(true);
  $(id).showModal();
}
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => previousDialogFocus?.focus?.()));
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.role) chooseRole(button.dataset.role);
  if (button.dataset.mission !== undefined) { selectedMission = Number(button.dataset.mission); missionMenu(); }
  if (button.dataset.dialog) openInfo(button.dataset.dialog);
  if (button.dataset.order) doOrder(button.dataset.order);
});
$('difficulty').value = preferences.difficulty;
$('guidance').value = preferences.guidance;
$('difficulty').addEventListener('change', event => { preferences.difficulty = event.target.value; save(); });
$('guidance').addEventListener('change', event => { preferences.guidance = event.target.value; save(); });
$('deploy').addEventListener('click', () => startMission());
$('menuSound').addEventListener('click', () => { preferences.sound = !preferences.sound; soundUI(); if (preferences.sound) audio.unlock(); save(); });
$('soundToggle').addEventListener('change', event => { preferences.sound = event.target.checked; soundUI(); save(); });
$('motionToggle').addEventListener('change', event => { preferences.reducedMotion = event.target.checked; save(); });
$('touchToggle').addEventListener('change', event => { clearInput(); closeOrders(); touch = event.target.checked; preferences.touchControls = touch; $('touchControls').hidden = !touch || mode === 'menu'; save(); fit(); updateHUD(); });
$('pauseButton').addEventListener('click', () => pause());
$('resume').addEventListener('click', () => pause(false));
$('switchRole').addEventListener('click', () => {
  if (online()) { clearInput(); runCoopAction(() => coop.swapRoles()); return; }
  const role = game.role === 'leader' ? 'member' : 'leader'; clearInput(); closeOrders(); placingOrder = false; showMap = false; syncMapUI(); setRole(game, role); chooseRole(role); updateOrders(); pause(false); updateHUD(); toast(role === 'leader' ? 'You have command of the squad.' : 'Hale has command. Stay with the squad.');
});
$('restart').addEventListener('click', () => online() ? runCoopAction(() => coop.restart()) : startMission());
$('returnMenu').addEventListener('click', returnToMenu);
$('resultMenu').addEventListener('click', returnToMenu);
$('replay').addEventListener('click', () => online() ? runCoopAction(() => coop.restart()) : startMission());
$('nextMission').addEventListener('click', () => { if (online()) { runCoopAction(() => coop.returnToLobby()); return; } if (selectedMission + 1 < MISSIONS.length) { selectedMission++; returnToMenu(); } else returnToMenu(); });
$('mapToggle').addEventListener('click', toggleMap);
$('touchOrder').addEventListener('click', () => {
  if (mode !== 'playing' || paused || showMap || placingOrder) return;
  clearInput(); const open = document.body.classList.toggle('orders-open'); $('touchOrder').setAttribute('aria-expanded', String(open));
});
$('orderClose')?.addEventListener('click', closeOrders);
$('cancelOrder')?.addEventListener('click', cancelOrder);
$('touchReload').addEventListener('click', () => { if (canAct()) actions.reload = true; });
$('touchSmoke').addEventListener('click', () => { if (canAct()) actions.smoke = true; });
$('touchInteract').addEventListener('pointerdown', event => {
  if (!canAct() || !assistAction() || interactionPointer !== null) return;
  event.preventDefault(); interactionPointer = event.pointerId; touchInput.interact = true;
  $('touchInteract').setPointerCapture(event.pointerId); $('touchInteract').classList.add('working'); audio.unlock();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touchInteract').addEventListener(type, event => {
  if (interactionPointer !== event.pointerId) return;
  event.preventDefault(); interactionPointer = null; touchInput.interact = false; $('touchInteract').classList.remove('working');
});

function bindStick(element, kind) {
  const update = event => {
    const record = activeSticks.get(event.pointerId); if (!record || record.element !== element) return;
    if (Math.hypot(event.clientX-record.startX,event.clientY-record.startY) > 4) record.dragged = true;
    const vector = stickVector(event.clientX-record.x,event.clientY-record.y,record.radius);
    // A tap on the aim pad never fires; an intentional drag controls aim strength.
    const strength = kind === 'aim' && !record.dragged ? 0 : vector.magnitude;
    const x = strength ? vector.x : 0, y = strength ? vector.y : 0;
    element.querySelector('.stick-knob').style.transform = `translate(${x*record.radius}px,${y*record.radius}px)`;
    touchInput[`${kind}X`] = x; touchInput[`${kind}Y`] = y;
    if (kind === 'aim') touchInput.aimStrength = strength;
    element.classList.toggle('firing', kind === 'aim' && strength >= .56);
    element.classList.toggle('sprinting', kind === 'move' && Math.hypot(x,y) >= .92 && touchInput.aimStrength <= .12);
  };
  element.addEventListener('pointerdown', event => {
    if (!canAct() || event.button > 0 || [...activeSticks.values()].some(record => record.kind === kind)) return;
    event.preventDefault(); pointer.fire = false; pointer.valid = false;
    const rect = element.getBoundingClientRect(), base = element.querySelector('.stick-base')?.getBoundingClientRect() || rect;
    const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const x = kind === 'move' ? clamp(event.clientX,cx-22,cx+22) : cx;
    const y = kind === 'move' ? clamp(event.clientY,cy-22,cy+22) : cy;
    element.style.setProperty('--stick-origin-x',`${x-cx}px`); element.style.setProperty('--stick-origin-y',`${y-cy}px`);
    element.setPointerCapture(event.pointerId); element.classList.add('active');
    activeSticks.set(event.pointerId,{element,kind,x,y,radius:Math.min(base.width,base.height)*.34,startX:event.clientX,startY:event.clientY,dragged:false});
    update(event); audio.unlock();
  });
  element.addEventListener('pointermove', event => { if (!activeSticks.has(event.pointerId)) return; event.preventDefault(); update(event); });
  const release = event => {
    const record = activeSticks.get(event.pointerId); if (!record || record.element !== element) return;
    activeSticks.delete(event.pointerId); touchInput[`${kind}X`] = 0; touchInput[`${kind}Y`] = 0;
    if (kind === 'aim') { touchInput.aimStrength = 0; touchAim = null; }
    element.querySelector('.stick-knob').style.transform = 'translate(0,0)'; element.classList.remove('active','firing','sprinting');
    element.style.removeProperty('--stick-origin-x'); element.style.removeProperty('--stick-origin-y');
  };
  element.addEventListener('pointerup', release); element.addEventListener('pointercancel', release); element.addEventListener('lostpointercapture', release);
}
bindStick($('moveStick'), 'move'); bindStick($('aimStick'), 'aim');

function screenPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
canvas.addEventListener('pointermove', event => { const point = screenPoint(event); pointer.x = point.x; pointer.y = point.y; pointer.valid = event.pointerType !== 'touch'; });
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'playing' || paused) return;
  event.preventDefault(); canvas.focus({ preventScroll: true }); audio.unlock();
  const point = screenPoint(event); pointer.x = point.x; pointer.y = point.y; pointer.valid = true;
  if (placingOrder || event.button === 2) {
    if (game.role === 'leader') doOrder('move', renderer.screenToWorld(point.x, point.y));
    return;
  }
  if (showMap || event.pointerType === 'touch' || !canAct()) { pointer.valid = false; return; }
  if (event.button === 0) { pointer.fire = true; canvas.setPointerCapture(event.pointerId); }
});
canvas.addEventListener('pointerup', () => pointer.fire = false);
canvas.addEventListener('pointercancel', () => pointer.fire = false);
canvas.addEventListener('lostpointercapture', () => pointer.fire = false);
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  const overlay = !$('coopOverlay').hidden ? $('coopOverlay') : !$('pauseOverlay').hidden ? $('pauseOverlay') : !$('resultOverlay').hidden ? $('resultOverlay') : null;
  if (overlay && event.code === 'Tab') {
    const focusable = [...overlay.querySelectorAll('button, input, select')].filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  if (overlay === $('coopOverlay') && event.code === 'Escape') { event.preventDefault(); returnToMenu(); return; }
  if (mode !== 'playing') return;
  if (event.code === 'Escape') {
    event.preventDefault();
    if (paused) { pause(false); return; }
    if (placingOrder) { cancelOrder(); return; }
    if (showMap) { toggleMap(); return; }
    if (document.body.classList.contains('orders-open')) { clearInput(); closeOrders(); return; }
    pause(!paused); return;
  }
  if (paused) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyR' && canAct()) actions.reload = true;
  if (event.code === 'KeyG' && canAct()) actions.smoke = true;
  if (event.code === 'KeyM') toggleMap();
  if (event.code === 'KeyQ') doOrder(game.role === 'leader' ? 'follow' : 'ready');
  if (event.code === 'KeyH') doOrder(game.role === 'leader' ? 'hold' : 'wait');
  if (event.code === 'KeyF') doOrder(game.role === 'leader' ? 'assist' : 'help');
  if (event.code === 'KeyT' && game.role === 'leader') doOrder('move', pointer.valid ? renderer.screenToWorld(pointer.x, pointer.y) : undefined);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); if (mode === 'playing' && !paused) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing' && !paused) pause(); });

function controls() {
  const p = player();
  if (!canAct()) { touchAim = null; return { moveX:0, moveY:0, aimX:null, aimY:null, fire:false, interact:false, reload:false, smoke:false, sprint:false }; }
  const intent = touchIntent(touchInput);
  let moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + intent.moveX;
  let moveY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + intent.moveY;
  let aim = pointer.valid && !showMap ? renderer.screenToWorld(pointer.x, pointer.y) : null;
  let fire = pointer.fire && !showMap && !placingOrder;
  if (p && intent.aiming) {
    const stickLength = Math.hypot(touchInput.aimX,touchInput.aimY);
    aim = { x: p.x + touchInput.aimX/stickLength * 600, y: p.y + touchInput.aimY/stickLength * 600 }; fire = intent.firing;
    if (preferences.guidance === 'simple') {
      const direction = Math.atan2(touchInput.aimY, touchInput.aimX);
      let closest = null, score = Infinity;
      for (const enemy of game.enemies) {
        if (!enemy.alive || enemy.downed) continue;
        const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        const angle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        const difference = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
        if (distance < 480 && difference < .22 && distance * difference < score && hasLineOfSight(game, p, enemy)) { closest = enemy; score = distance * difference; }
      }
      if (closest) aim = { x: closest.x, y: closest.y };
    }
  }
  touchAim = intent.aiming && aim ? { ...aim, firing: fire } : null;
  const assist = assistAction();
  if (touchInput.interact && !assist) { touchInput.interact = false; $('touchInteract').classList.remove('working'); }
  const interact = keys.has('KeyE') || touchInput.interact;
  const sprint = !interact && (keys.has('ShiftLeft') || keys.has('ShiftRight') || intent.sprint);
  $('moveStick').classList.toggle('sprinting', !!intent.sprint && !interact);
  const autoReload = touch && p?.ammo === 0 && p.reserve > 0 && p.reloadTimer <= 0;
  return { moveX, moveY, aimX: aim?.x ?? null, aimY: aim?.y ?? null, fire: fire && !interact, interact, reload: actions.reload || autoReload, smoke: actions.smoke, sprint };
}

function updateHUD() {
  if (!game) return;
  const p = player(); const objective = getObjective(game);
  $('objectiveTitle').textContent = objective?.title || 'Stay with the squad';
  $('objectiveDetail').textContent = objective?.detail || objective?.description || '';
  $('objectiveProgress').style.width = `${clamp(Number(objective?.progress) || 0, 0, 1) * 100}%`;
  $('stageNumber').textContent = `${Math.min(game.stageIndex + 1, game.stageCount)}/${game.stageCount}`;
  $('missionClock').textContent = clock(game.time);
  $('leaderIntent').textContent = game.role === 'member' ? `HALE / ${game.leaderOrder || 'Stay together.'}` : game.order?.label || '';
  $('squad').innerHTML = game.squad.map(s => `<div class="squad-member ${s.id === game.playerId ? 'active' : ''} ${s.downed || !s.alive ? 'downed' : ''}"><strong>${escape(s.name)}${s.id === game.playerId ? ' ·' : ''}</strong><small>${s.downed ? 'DOWN' : !s.alive ? 'LOST' : escape(s.role || s.kind)}</small><div class="squad-health"><span style="width:${clamp(s.hp / s.maxHp, 0, 1) * 100}%"></span></div></div>`).join('');
  if (online()) {
    const peers = coop.room?.players || [];
    $('squad').innerHTML = game.squad.map(s => { const peer=peers.find(p=>p.actorId===s.id && p.connected); return `<div class="squad-member ${s.id===game.playerId?'active':''} ${s.downed||!s.alive?'downed':''}" data-human="${!!peer}" title="${escape(peer?peer.name:'Computer controlled')}"><strong>${escape(s.name)}${s.id===game.playerId?' ·':''}</strong><small>${s.downed?'DOWN':!s.alive?'LOST':peer?escape(peer.name):'AI · '+escape(s.role)}</small><div class="squad-health"><span style="width:${clamp(s.hp/s.maxHp,0,1)*100}%"></span></div></div>`; }).join('');
  }
  if (p) {
    const health = clamp(Math.round(p.hp / p.maxHp * 100), 0, 100);
    $('playerName').textContent = p.name.toUpperCase(); $('healthText').textContent = `${health}%`; $('healthBar').style.width = `${health}%`;
    $('healthBar').style.background = health < 35 ? 'var(--danger)' : '';
    $('ammo').textContent = p.ammo ?? 0; $('reserve').textContent = `/ ${p.reserve ?? 0}`;
    $('reloadLabel').textContent = p.reloadTimer > 0 ? 'RELOADING' : p.ammo === 0 ? 'RELOAD' : '';
    $('smokeCount').textContent = `SMOKE × ${p.smokes ?? 0}`;
    if ($('touchSmokeQty')) $('touchSmokeQty').textContent = p.smokes ?? 0;
    else $('touchSmoke').textContent = `Smoke ${p.smokes ?? 0}`;
    $('touchSmoke').setAttribute('aria-label', `Smoke, ${p.smokes ?? 0} remaining`);
    ($('touchReloadLabel') || $('touchReload')).textContent = p.reloadTimer > 0 ? 'Loading' : 'Reload';
    $('touchReload').setAttribute('aria-label', p.reloadTimer > 0 ? 'Reloading' : 'Reload weapon');
    $('touchReload').classList.toggle('reloading', p.reloadTimer > 0);
    $('downedBanner').hidden = !p.downed && p.alive;
    $('downedTitle').textContent = p.alive ? 'YOU ARE DOWN' : 'SOLDIER LOST';
    $('downedDetail').textContent = p.alive ? 'Your squad is coming to help. Stay with them.' : online() ? 'Your partner is still in the mission. Stay with the squad.' : 'Your squad could not recover you.';
    $('touchReload').disabled = p.reloadTimer > 0 || !p.reserve || p.ammo === p.magSize;
    $('touchSmoke').disabled = !p.smokes;
  }
  const assist = assistAction();
  $('touchInteract').disabled = !assist;
  $('touchInteract').classList.toggle('available', !!assist);
  $('touchInteract').style.setProperty('--assist-progress', `${clamp(assist?.progress || 0,0,1)*100}%`);
  ($('touchInteractLabel') || $('touchInteract')).textContent = assist?.label || 'Assist';
  $('touchInteract').setAttribute('aria-label', assist?.detail || 'Assist — move near someone who needs help');
  const messages = touch ? game.radio.filter(m => game.time-m.time < 8).slice(-1) : game.radio.slice(-3); const radioKey = messages.map(m => `${m.id}:${m.text}`).join('|');
  if (lastRadio !== radioKey) { $('radio').innerHTML = messages.map(m => `<div class="radio-line"><strong>${escape(m.speaker)}</strong>${escape(m.text)}</div>`).join(''); lastRadio = radioKey; }
  const interactText = online() ? (assist ? `${touch ? 'Hold ASSIST' : 'Hold E'} to ${assist.detail.replace(/^Hold to /,'')}.` : '') : typeof game.interactionPrompt === 'string' ? game.interactionPrompt : '';
  let hint = interactText;
  if (!hint && p && objective?.interaction && Math.hypot(p.x - objective.x, p.y - objective.y) < (objective.radius || 60) + 20) hint = touch ? 'Hold ASSIST to work on the objective.' : 'Hold E to work on the objective.';
  if (!hint && !touch && preferences.guidance === 'simple' && game.time < 13) hint = game.role === 'leader' ? (touch ? 'Follow the amber marker. Your squad follows you.' : 'Follow the amber marker. Right click to send your squad.') : 'Stay near Hale. He will lead you to the objective.';
  if (touch) hint = assist ? assist.detail : '';
  $('contextHint').textContent = hint;
  $('desktopHint').style.visibility = preferences.guidance === 'expert' ? 'hidden' : 'visible';
  $('hud').dataset.stage = String(game.stageIndex); $('hud').dataset.status = game.status;
  $('hud').dataset.role = game.role;
  $('hud').dataset.online = String(online());
  if (online()) { $('hud').dataset.room = coop.room?.code || ''; $('hud').dataset.humans = String(game.humanIds?.length || 0); }
  measureSafeInsets();
}

function finishMission() {
  mode = 'result'; paused = false; $('pauseOverlay').hidden = true; clearInput(); closeOrders(); audio.stop();
  const won = game.status === 'won';
  const fitSquad = game.squad.filter(s => s.alive && !s.downed).length;
  const harmed = game.stats.civilianHarm || 0;
  if (won) {
    preferences.completed[game.mission.id] = { time: Math.round(game.time), squad: fitSquad, civilianHarm: harmed, role: game.role };
    save();
  }
  $('resultEyebrow').textContent = won ? 'MISSION COMPLETE' : 'MISSION ENDED';
  $('resultTitle').textContent = won ? (harmed ? 'Extraction complete.' : 'Accounted for.') : 'The line went quiet.';
  $('resultDescription').textContent = game.endReason || (won ? 'The squad reached the end of its orders.' : 'Your squad could not complete the mission. Regroup and try again.');
  const stats = [[`${fitSquad} / ${game.squad.length}`, 'Squad standing'], [String(game.stats.rescued || 0), 'People rescued'], [String(harmed), 'Civilians harmed'], [clock(game.time), 'Time in the field']];
  $('resultStats').innerHTML = stats.map(([value,label]) => `<div class="result-stat"><strong>${escape(value)}</strong><span>${escape(label)}</span></div>`).join('');
  $('nextMission').hidden = !won;
  $('nextMission').textContent = selectedMission + 1 < MISSIONS.length ? 'NEXT MISSION BRIEFING' : 'RETURN TO FIELD ORDERS';
  $('replay').disabled = false; $('coopResultWait').hidden = true; $('resultMenu').textContent = 'Back to field orders';
  if (online()) {
    $('nextMission').hidden = !coop.isHost; $('nextMission').textContent = 'SQUAD BRIEFING';
    $('replay').disabled = !coop.isHost; $('replay').textContent = 'Replay with squad';
    $('coopResultWait').hidden = coop.isHost; $('resultMenu').textContent = 'Leave squad';
  } else $('replay').textContent = 'Replay mission';
  $('resultOverlay').hidden = false;
  (online() && !coop.isHost ? $('resultMenu') : won ? $('nextMission') : $('replay')).focus();
}

function updatePauseUI() {
  const shared = online();
  $('pauseTitle').textContent = shared ? 'Field menu.' : 'Paused.';
  $('pauseDescription').textContent = shared ? (coop.connected ? 'The online mission continues while this menu is open.' : onlineConnection === 'error' ? 'The connection ended. Leave this squad to create or join another.' : 'Reconnecting to your squad. Your soldier is covered by AI while disconnected.') : 'The squad is waiting.';
  $('switchRole').textContent = shared ? 'Swap player roles' : game?.role === 'leader' ? 'Switch to squad member' : 'Take command of the squad';
  $('switchRole').disabled = shared && (!coop.isHost || !coop.connected);
  $('restart').textContent = shared ? 'Restart for squad' : 'Restart mission';
  $('restart').disabled = shared && (!coop.isHost || !coop.connected);
  $('returnMenu').textContent = shared ? 'Leave squad' : 'Field orders';
  $('coopLobbyButton').hidden = !shared || !coop.isHost;
  $('coopLobbyButton').disabled = shared && !coop.connected;
  $('coopPauseInfo').hidden = !shared;
  if (shared) {
    const room = coop.room;
    const humans = room?.players.filter(p => p.connected).length || 0;
    $('coopPauseSummary').textContent = `Room ${room?.code || '—'} · ${humans} human${humans === 1 ? '' : 's'} + ${4-humans} AI · You ${game?.role === 'leader' ? 'lead' : 'follow'}.${coop.isHost ? ' You host this room.' : ' The host can swap roles.'}`;
  }
}

function coopMessage(text, error = false) {
  $('coopMessage').textContent = text || '';
  $('coopMessage').classList.toggle('error', error);
}
function coopError(error) {
  const message = error?.message || String(error || 'Could not connect to the squad.');
  coopBusy = false; $('coopConnect').disabled = false;
  if (!$('coopOverlay').hidden) coopMessage(message, true); else toast(message);
  if (game?.coop && !coop?.active) pause(true);
}
async function runCoopAction(action) {
  try { await action(); } catch { /* The client's onError keeps the failure visible. */ }
}
function updateCoopStatus(status) {
  onlineConnection = status.state;
  $('coopBadge').classList.toggle('reconnecting', status.state !== 'connected');
  if (status.state === 'connecting') coopMessage('Connecting to the squad service… The first connection can take a moment.');
  if (status.state === 'reconnecting') { clearInput(); coopMessage('Connection interrupted. Rejoining your squad…'); }
  if (status.state === 'connected') {
    coopBusy = false; $('coopConnect').disabled = false; coopMessage('');
    const current = new URL(location.href);
    if (current.searchParams.has('room')) { current.searchParams.delete('room'); history.replaceState(null,'',current.href); }
  }
  if (status.state === 'error') {
    coopBusy = false; $('coopConnect').disabled = false; $('coopBadge').textContent = 'OFFLINE';
    coopMessage(status.reason || 'The connection ended. Try creating or joining a squad again.', true);
    for (const id of ['coopStart','coopSwapLobby','coopMission','coopDifficulty']) $(id).disabled = true;
  }
  if (coop?.room) renderCoopRoom(coop.room);
  if (paused) updatePauseUI();
}
function openCoop(kind, code = '') {
  if (!coopServerURL()) { toast('The co-op service is not available in this build.'); return; }
  if (online()) returnToMenu();
  coopDialogMode = kind; coopBusy = false;
  $('coopOverlay').hidden = false; $('coopConnectForm').hidden = false; $('coopLobby').hidden = true;
  $('coopTitle').textContent = kind === 'join' ? 'Join your squad.' : 'Stay together.';
  $('coopDescription').textContent = 'Two people. Four soldiers. AI fills the open positions.';
  $('coopCodeLabel').hidden = kind !== 'join'; $('coopCode').required = kind === 'join'; $('coopCode').value = code.toUpperCase();
  $('coopName').value = preferences.callsign || 'Player';
  $('coopConnect').textContent = kind === 'join' ? 'JOIN SQUAD' : 'CREATE SQUAD'; $('coopConnect').disabled = false;
  $('coopConnectBrief').textContent = kind === 'join' ? 'Enter the code your friend shared. You take the other player position.' : `${MISSIONS[selectedMission].title} · ${preferences.difficulty} · You ${preferences.role === 'leader' ? 'lead as Hale' : 'play as Mercer; your friend can lead'}.`;
  coopMessage(''); $('coopName').focus();
}
function renderCoopRoom(room) {
  if (!room) return;
  const connected = room.players.filter(p => p.connected);
  $('coopBadge').hidden = false;
  $('coopBadge').textContent = onlineConnection === 'connected' ? `${connected.length}/2 CO-OP` : onlineConnection === 'error' ? 'OFFLINE' : 'REJOINING';
  $('coopBadge').setAttribute('aria-label', `Online squad ${room.code}, ${connected.length} player${connected.length === 1 ? '' : 's'}. Open squad details`);
  $('coopRoomCode').textContent = room.code;
  const rosterKey = JSON.stringify([room.players,coop.session?.playerId]);
  if (lastRoomRoster !== rosterKey) {
    $('coopRoster').innerHTML = [['Hale','Squad leader'],['Mercer','Squad mate'],['Ames','Medic'],['Webb','Support']].map(([name,role],slot) => {
      const peer = room.players.find(p => p.slot === slot), mine = peer?.id === coop.session?.playerId;
      const occupant = peer ? `${peer.name}${mine?' · You':''}${peer.connected?'':' · Reconnecting'}` : slot < 2 ? 'Open for friend · AI controls' : 'Computer controlled';
      return `<div class="coop-roster-row ${mine?'mine':''}"><div><strong>${escape(name)} <small>${escape(role)} · ${escape(occupant)}</small></strong></div><span class="coop-seat ${peer?.connected?'human':peer?'offline':''}">${peer?.connected?'HUMAN':'AI'}</span></div>`;
    }).join(''); lastRoomRoster = rosterKey;
    if (game?.coop) updateOrders();
  }
  $('coopMission').value = room.mission; $('coopDifficulty').value = room.difficulty;
  const canManage = coop.connected && coop.isHost;
  $('coopMission').disabled = !canManage; $('coopDifficulty').disabled = !canManage;
  $('coopSwapLobby').disabled = !canManage; $('coopStart').disabled = !canManage;
  $('coopLobbyHint').textContent = coop.isHost ? `You host the room. ${connected.length === 1 ? 'Your friend can join now or during the mission. AI holds the other positions.' : 'Both players are connected. You can swap who leads before deploying.'}` : 'The host chooses the mission and deploys the squad. You can move and fight independently once deployed.';
  if (room.status === 'lobby') {
    const entering = $('coopLobby').hidden || mode !== 'menu';
    mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; onlineEpoch = null; onlineRole = null;
    clearInput(); closeOrders(); audio.stop();
    document.body.classList.add('in-menu','online'); document.body.classList.remove('touch','map-open','placing-order');
    $('menu').hidden = false; $('hud').hidden = true; $('touchControls').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true;
    $('coopOverlay').hidden = false; $('coopConnectForm').hidden = true; $('coopLobby').hidden = false;
    $('coopTitle').textContent = 'Squad briefing.'; $('coopDescription').textContent = 'Hale and Mercer are player positions. Ames and Webb stay with you as AI.';
    fit(); if (entering) $('coopStart').disabled ? $('coopCopyLink').focus() : $('coopStart').focus();
  }
  if (paused) updatePauseUI();
  if (mode === 'result') { $('replay').disabled = !canManage; $('nextMission').hidden = !coop.isHost; $('coopResultWait').hidden = coop.isHost; }
}
function receiveCoopState(state) {
  const room = coop?.room; if (!room || room.status === 'lobby' || !state) return;
  const fresh = onlineEpoch !== room.epoch || !game?.coop;
  const changedRole = onlineRole !== null && onlineRole !== state.role;
  const keepMenu = paused && changedRole && game?.coop && game.seed === state.seed && game.missionIndex === state.missionIndex;
  game = state;
  if (fresh) {
    onlineEpoch = room.epoch; selectedMission = state.missionIndex;
    mode = 'playing'; paused = !!keepMenu; accumulator = 0; showMap = false; placingOrder = false; lastRadio = ''; hudTimer = 0;
    clearInput(); closeOrders(); audio.stop();
    document.body.classList.remove('in-menu','orders-open','map-open','placing-order'); document.body.classList.add('online');
    $('menu').hidden = true; $('coopOverlay').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = !paused; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
    $('missionName').textContent = game.mission.title.toUpperCase();
    syncMapUI(); if (!paused) { audio.unlock(); audio.setEnabled(preferences.sound); } fit();
    if (!document.querySelector('dialog[open]')) (paused ? $('resume') : canvas).focus({preventScroll:true});
  }
  if (fresh || changedRole) {
    clearInput(); closeOrders(); placingOrder = false; showMap = false; syncMapUI(); updateOrders();
    if (changedRole) toast(state.role === 'leader' ? 'You now lead the squad.' : 'You now play as the squad mate.');
  }
  onlineRole = state.role;
  if (paused) updatePauseUI();
  if (fresh) updateHUD();
  if (state.status !== 'playing' && mode !== 'result') finishMission();
}
async function copyCoopInvite() {
  if (!coop?.room) return;
  const invite = new URL(location.href); invite.search = ''; invite.hash = ''; invite.searchParams.set('room',coop.room.code);
  try { await navigator.clipboard.writeText(invite.href); toast('Invite link copied.'); }
  catch { toast(`Share room code ${coop.room.code} with your friend.`); }
}
function initializeCoop() {
  const url = coopServerURL();
  coop = new CoopClient({url:url || undefined,onRoom:renderCoopRoom,onState:receiveCoopState,onStatus:updateCoopStatus,onError:coopError});
  $('coopMission').innerHTML = MISSIONS.map((mission,i)=>`<option value="${i}">${escape(mission.title)}</option>`).join('');
  $('coopCreate').addEventListener('click',()=>openCoop('create'));
  $('coopJoinOpen').addEventListener('click',()=>openCoop('join'));
  $('coopConnectForm').addEventListener('submit',async event=>{
    event.preventDefault(); if(coopBusy)return;
    audio.unlock(); audio.setEnabled(preferences.sound);
    coopBusy=true; $('coopConnect').disabled=true;
    preferences.callsign=$('coopName').value.trim().slice(0,20)||'Player'; save();
    try {
      if(coopDialogMode==='join') await coop.join({code:$('coopCode').value.trim().toUpperCase(),name:preferences.callsign});
      else await coop.create({name:preferences.callsign,role:preferences.role,mission:selectedMission,difficulty:preferences.difficulty});
    } catch { /* onError owns the visible message. */ }
    finally { coopBusy=false; $('coopConnect').disabled=false; }
  });
  for(const id of ['coopClose','coopCancelConnect','coopLeave']) $(id).addEventListener('click',returnToMenu);
  for(const id of ['coopCopyLink','coopCopyPause']) $(id).addEventListener('click',copyCoopInvite);
  $('coopBadge').addEventListener('click',()=>pause(true));
  $('coopStart').addEventListener('click',()=>{ audio.unlock(); audio.setEnabled(preferences.sound); runCoopAction(()=>coop.start()); });
  $('coopSwapLobby').addEventListener('click',()=>runCoopAction(()=>coop.swapRoles()));
  $('coopLobbyButton').addEventListener('click',()=>runCoopAction(()=>coop.returnToLobby()));
  $('coopMission').addEventListener('change',()=>runCoopAction(()=>coop.configure({mission:Number($('coopMission').value)})));
  $('coopDifficulty').addEventListener('change',()=>runCoopAction(()=>coop.configure({difficulty:$('coopDifficulty').value})));
  const invite = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  const hasInvite = /^[A-Z0-9]{6}$/.test(invite);
  if (url && coop.session && (!hasInvite || coop.session.code === invite)) {
    $('coopOverlay').hidden=false; $('coopConnectForm').hidden=true; $('coopLobby').hidden=true;
    $('coopTitle').textContent='Rejoining your squad.'; $('coopDescription').textContent='Recovering your room and player position.';
    coop.resume().catch(()=>{ $('coopConnectForm').hidden=false; $('coopConnect').textContent='CREATE SQUAD'; $('coopName').value=preferences.callsign||'Player'; });
  } else if (hasInvite) openCoop('join',invite);
}

function frame(now) {
  const dt = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0;
  lastTime = now;
  if (game?.coop && mode === 'playing') {
    coop.input(!paused && !document.querySelector('dialog[open]') ? controls() : neutralInput());
    game = coop.getState(dt) || game;
    actions.reload = false; actions.smoke = false;
    if (!paused && coop.connected) audio.tick(game, dt);
    hudTimer += dt;
    if (hudTimer > .1) { updateHUD(); hudTimer = 0; }
    if (game.status !== 'playing') finishMission();
  } else if (game && mode === 'playing' && !paused && !document.querySelector('dialog[open]')) {
    accumulator += dt;
    let count = 0;
    while (accumulator >= 1 / 60 && count++ < 6) {
      step(game, controls(), 1 / 60);
      actions.reload = false; actions.smoke = false;
      accumulator -= 1 / 60;
      if (game.status !== 'playing') { finishMission(); break; }
    }
    if (mode === 'playing') audio.tick(game, dt);
    hudTimer += dt;
    if (hudTimer > .1) { updateHUD(); hudTimer = 0; }
  }
  const followActorId = game?.coop && player()?.alive === false ? game.squad.find(s => s.alive && !s.downed)?.id : null;
  renderer.render(game || menuScene, { time: now / 1000, menu: mode === 'menu', paused, pointer: pointer.valid ? pointer : null, showMap, placingOrder, guidance: preferences.guidance, reducedMotion: preferences.reducedMotion, touch: touch && mode !== 'menu', safeInsets, aim: touchAim, followActorId });
  requestAnimationFrame(frame);
}

chooseRole(preferences.role); soundUI(); missionMenu(); fit();
initializeCoop(); requestAnimationFrame(frame);
