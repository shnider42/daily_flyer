import { MISSIONS, createGame, step, issueOrder, setRole, getObjective, hasLineOfSight } from './sim.mjs';
import { Renderer } from './renderer.mjs';
import { GameAudio } from './audio.mjs';

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
let touch = touchQuery.matches || navigator.maxTouchPoints > 0 || preferences.touchControls === true;
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
const keys = new Set();
const pointer = { x: 0, y: 0, valid: false, fire: false };
const touchInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, interact: false };
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
  renderer.resize(rect.width, rect.height, Math.min(devicePixelRatio || 1, 2));
}
new ResizeObserver(fit).observe($('battlefield'));
window.addEventListener('resize', fit);
touchQuery.addEventListener('change', () => { touch = touchQuery.matches || navigator.maxTouchPoints > 0; $('touchControls').hidden = !touch || mode === 'menu'; fit(); });

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
  touchInput.moveX = 0; touchInput.moveY = 0; touchInput.aimX = 0; touchInput.aimY = 0; touchInput.interact = false;
  actions.reload = false; actions.smoke = false;
  for (const [id, record] of activeSticks) { try { record.element.releasePointerCapture(id); } catch {} }
  activeSticks.clear();
  document.querySelectorAll('.stick-knob').forEach(knob => knob.style.transform = 'translate(0, 0)');
}
function startMission(index = selectedMission) {
  selectedMission = clamp(index, 0, MISSIONS.length - 1);
  game = createGame({ mission: selectedMission, role: preferences.role, difficulty: preferences.difficulty, seed: Date.now() >>> 0 });
  mode = 'playing'; paused = false; accumulator = 0; showMap = false; placingOrder = false; lastRadio = ''; hudTimer = 0;
  clearInput();
  document.body.classList.remove('in-menu', 'orders-open');
  $('menu').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
  $('mapLegend').hidden = true; $('orderHint').hidden = true;
  $('missionName').textContent = game.mission.title.toUpperCase();
  updateOrders(); audio.unlock(); audio.setEnabled(preferences.sound); fit(); updateHUD();
  canvas.focus({ preventScroll: true });
  toast(touch ? 'Left stick moves. Right stick aims and fires.' : 'WASD to move. Follow the amber objective marker.');
}
function returnToMenu() {
  mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; clearInput(); audio.stop();
  document.body.classList.add('in-menu'); document.body.classList.remove('orders-open', 'touch');
  $('menu').hidden = false; $('hud').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = true;
  missionMenu(); fit(); $('deploy').focus({ preventScroll: true });
}
function pause(value = true) {
  if (mode !== 'playing') return;
  paused = value; accumulator = 0; clearInput();
  $('pauseOverlay').hidden = !value;
  $('switchRole').textContent = game.role === 'leader' ? 'Switch to squad member' : 'Take command of the squad';
  if (value) { audio.stop(); $('resume').focus(); } else { audio.unlock(); audio.setEnabled(preferences.sound); canvas.focus({ preventScroll: true }); }
}
function updateOrders() {
  const leader = game.role === 'leader';
  $('orderLabel').textContent = leader ? 'SQUAD ORDERS' : 'REQUESTS TO HALE';
  const items = leader ? [['move', '', 'Move'], ['follow', 'Q', 'Regroup'], ['hold', 'H', 'Hold'], ['assist', 'F', 'Assist']] : [['ready', 'Q', 'Ready'], ['wait', 'H', 'Wait'], ['help', 'F', 'Need help']];
  $('orderButtons').innerHTML = items.map(([type, key, label]) => `<button data-order="${type}">${key ? `<kbd>${key}</kbd>` : ''}${label}</button>`).join('');
  $('touchOrder').textContent = leader ? 'SQUAD ORDERS' : 'RADIO REQUESTS';
  $('desktopHint').textContent = leader ? 'WASD move · Mouse fire · E assist · R reload · G smoke · Right click order' : 'WASD move · Mouse fire · E assist · R reload · Q ready · H wait · F help';
}
function doOrder(type, point) {
  if (mode !== 'playing' || paused) return;
  if (type === 'move' && !point) {
    placingOrder = true; $('orderHint').hidden = false;
    if (touch) { showMap = true; $('mapLegend').hidden = false; }
    return;
  }
  issueOrder(game, type, point);
  placingOrder = false; $('orderHint').hidden = true;
  document.body.classList.remove('orders-open');
  if (touch && type === 'move') { showMap = false; $('mapLegend').hidden = true; }
  audio.click(); updateHUD();
}
function toggleMap() { if (mode !== 'playing' || paused) return; showMap = !showMap; $('mapLegend').hidden = !showMap; $('mapToggle').textContent = showMap ? 'CLOSE' : 'MAP'; pointer.fire = false; }
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
$('touchToggle').addEventListener('change', event => { touch = event.target.checked; preferences.touchControls = touch; $('touchControls').hidden = !touch || mode === 'menu'; save(); fit(); });
$('pauseButton').addEventListener('click', () => pause());
$('resume').addEventListener('click', () => pause(false));
$('switchRole').addEventListener('click', () => { const role = game.role === 'leader' ? 'member' : 'leader'; setRole(game, role); chooseRole(role); updateOrders(); pause(false); toast(role === 'leader' ? 'You have command of the squad.' : 'Hale has command. Stay with the squad.'); });
$('restart').addEventListener('click', () => startMission());
$('returnMenu').addEventListener('click', returnToMenu);
$('resultMenu').addEventListener('click', returnToMenu);
$('replay').addEventListener('click', () => startMission());
$('nextMission').addEventListener('click', () => { if (selectedMission + 1 < MISSIONS.length) { selectedMission++; returnToMenu(); } else returnToMenu(); });
$('mapToggle').addEventListener('click', toggleMap);
$('touchOrder').addEventListener('click', () => document.body.classList.toggle('orders-open'));
$('touchReload').addEventListener('click', () => actions.reload = true);
$('touchSmoke').addEventListener('click', () => actions.smoke = true);
for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) $('touchInteract').addEventListener(type, event => {
  event.preventDefault(); touchInput.interact = type === 'pointerdown';
  if (type === 'pointerdown') { $('touchInteract').setPointerCapture(event.pointerId); audio.unlock(); }
});

function bindStick(element, kind) {
  const update = (event) => {
    const record = activeSticks.get(event.pointerId); if (!record) return;
    const rect = element.getBoundingClientRect(); const radius = rect.width * .32;
    let dx = (event.clientX - rect.left - rect.width / 2) / radius, dy = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(dx, dy); if (length > 1) { dx /= length; dy /= length; }
    if (length < .13) dx = dy = 0;
    element.querySelector('.stick-knob').style.transform = `translate(${dx * radius}px,${dy * radius}px)`;
    touchInput[`${kind}X`] = dx; touchInput[`${kind}Y`] = dy;
  };
  element.addEventListener('pointerdown', event => { if (paused || mode !== 'playing') return; event.preventDefault(); element.setPointerCapture(event.pointerId); activeSticks.set(event.pointerId, { element, kind }); update(event); audio.unlock(); });
  element.addEventListener('pointermove', event => { event.preventDefault(); update(event); });
  const release = event => { if (!activeSticks.has(event.pointerId)) return; activeSticks.delete(event.pointerId); touchInput[`${kind}X`] = 0; touchInput[`${kind}Y`] = 0; element.querySelector('.stick-knob').style.transform = 'translate(0,0)'; };
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
  if (showMap) return;
  if (event.button === 0) { pointer.fire = true; canvas.setPointerCapture(event.pointerId); }
});
canvas.addEventListener('pointerup', () => pointer.fire = false);
canvas.addEventListener('pointercancel', () => pointer.fire = false);
canvas.addEventListener('lostpointercapture', () => pointer.fire = false);
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  const overlay = !$('pauseOverlay').hidden ? $('pauseOverlay') : !$('resultOverlay').hidden ? $('resultOverlay') : null;
  if (overlay && event.code === 'Tab') {
    const focusable = [...overlay.querySelectorAll('button, input')].filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  if (mode !== 'playing') return;
  if (event.code === 'Escape') {
    event.preventDefault();
    if (placingOrder) { placingOrder = false; $('orderHint').hidden = true; return; }
    pause(!paused); return;
  }
  if (paused) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyR') actions.reload = true;
  if (event.code === 'KeyG') actions.smoke = true;
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
  let moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touchInput.moveX;
  let moveY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + touchInput.moveY;
  let aim = pointer.valid && !showMap ? renderer.screenToWorld(pointer.x, pointer.y) : null;
  let fire = pointer.fire && !showMap && !placingOrder;
  const stickLength = Math.hypot(touchInput.aimX, touchInput.aimY);
  if (p && stickLength > .15) {
    aim = { x: p.x + touchInput.aimX * 600, y: p.y + touchInput.aimY * 600 }; fire = !showMap && !placingOrder;
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
  if (showMap || placingOrder) { fire = false; }
  return { moveX, moveY, aimX: aim?.x ?? null, aimY: aim?.y ?? null, fire, interact: keys.has('KeyE') || touchInput.interact, reload: actions.reload, smoke: actions.smoke, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') };
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
  if (p) {
    const health = clamp(Math.round(p.hp / p.maxHp * 100), 0, 100);
    $('playerName').textContent = p.name.toUpperCase(); $('healthText').textContent = `${health}%`; $('healthBar').style.width = `${health}%`;
    $('healthBar').style.background = health < 35 ? 'var(--danger)' : '';
    $('ammo').textContent = p.ammo ?? 0; $('reserve').textContent = `/ ${p.reserve ?? 0}`;
    $('reloadLabel').textContent = p.reloadTimer > 0 ? 'RELOADING' : p.ammo === 0 ? 'RELOAD' : '';
    $('smokeCount').textContent = `SMOKE × ${p.smokes ?? 0}`;
    $('touchSmoke').textContent = `SMOKE ${p.smokes ?? 0}`;
    $('downedBanner').hidden = !p.downed;
    $('touchReload').disabled = p.reloadTimer > 0 || !p.reserve;
    $('touchSmoke').disabled = !p.smokes;
  }
  const messages = game.radio.slice(-3); const radioKey = messages.map(m => `${m.id}:${m.text}`).join('|');
  if (lastRadio !== radioKey) { $('radio').innerHTML = messages.map(m => `<div class="radio-line"><strong>${escape(m.speaker)}</strong>${escape(m.text)}</div>`).join(''); lastRadio = radioKey; }
  const interactText = typeof game.interactionPrompt === 'string' ? game.interactionPrompt : '';
  let hint = interactText;
  if (!hint && p && objective?.interaction && Math.hypot(p.x - objective.x, p.y - objective.y) < (objective.radius || 60) + 20) hint = touch ? 'Hold ASSIST to work on the objective.' : 'Hold E to work on the objective.';
  if (!hint && !touch && preferences.guidance === 'simple' && game.time < 13) hint = game.role === 'leader' ? (touch ? 'Follow the amber marker. Your squad follows you.' : 'Follow the amber marker. Right click to send your squad.') : 'Stay near Hale. He will lead you to the objective.';
  if (touch) hint = hint.replace(/\bHold E\b/gi, 'Hold ASSIST').replace(/\bPress E\b/gi, 'Hold ASSIST');
  $('contextHint').textContent = hint;
  $('desktopHint').style.visibility = preferences.guidance === 'expert' ? 'hidden' : 'visible';
  $('hud').dataset.stage = String(game.stageIndex); $('hud').dataset.status = game.status;
}

function finishMission() {
  mode = 'result'; clearInput(); audio.stop();
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
  $('resultOverlay').hidden = false;
  (won ? $('nextMission') : $('replay')).focus();
}

function frame(now) {
  const dt = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0;
  lastTime = now;
  if (game && mode === 'playing' && !paused && !document.querySelector('dialog[open]')) {
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
  renderer.render(game || menuScene, { time: now / 1000, menu: mode === 'menu', paused, pointer: pointer.valid ? pointer : null, showMap, guidance: preferences.guidance, reducedMotion: preferences.reducedMotion });
  requestAnimationFrame(frame);
}

chooseRole(preferences.role); soundUI(); missionMenu(); fit(); requestAnimationFrame(frame);
