import { MISSIONS, createGame, step, issueOrder, selectSquadMember, getObjective, hasLineOfSight, chooseStoryOption, getStoryInteraction, getStoryLeaderId, campaignOutcome, normalizeCampaignCarry } from './sim.mjs';
import { Renderer } from './renderer.mjs';
import { GameAudio } from './audio.mjs';
import { stickVector, touchIntent, GroundOrderTap } from './touch-input.mjs';
import { CoopClient } from './coop-client.mjs';
import { coopServerURL } from './network-config.mjs';
import { clientToCanvasPoint } from './desktop-input.mjs';
import { createDefaults, normalizePreferences, renderDensity } from './settings.mjs';
import { FramePacer, FrameMeter } from './performance.mjs';
import { buildingAt } from './building-geometry.mjs';
import { roleProfile } from './squad-roles.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const renderer = new Renderer(canvas);
const audio = new GameAudio();
const STORAGE = 'dfe-chalk-v1';
const OPERATION_STORAGE = 'dfe-chalk-operation-v1';
const defaults = createDefaults({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
let preferences = normalizePreferences({}, defaults);
try { preferences = normalizePreferences(JSON.parse(localStorage.getItem(STORAGE) || '{}'), defaults); } catch { /* Gameplay works when storage is unavailable. */ }
const framePacer = new FramePacer();
const frameMeter = new FrameMeter();

const touchQuery = matchMedia('(pointer: coarse)');
let touch = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0);
let selectedMission = 0;
let operationPlan = null;
let missionCarry = null;
try {
  const saved = JSON.parse(localStorage.getItem(OPERATION_STORAGE) || 'null');
  if (saved && Number.isInteger(saved.nextMission) && saved.nextMission > 0 && saved.nextMission < MISSIONS.length && saved.carry && typeof saved.carry === 'object') {
    const carry = normalizeCampaignCarry(saved.carry);
    if (carry && carry.fromMission === saved.nextMission - 1) { operationPlan = { nextMission: saved.nextMission, carry }; selectedMission = saved.nextMission; }
  }
} catch { /* A fresh mission remains available without saved operation data. */ }
let game = null;
let menuScene = createGame({ mission: 1, role: 'leader', difficulty: 'story', seed: 19931003 });
let mode = 'menu';
let paused = false;
let showMap = false;
let placingOrder = false;
let accumulator = 0;
let hudTimer = 0;
let lastRadio = '';
let toastTimer;
let previousDialogFocus = null;
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let desktopObstacles = [];
let desktopObstacleKey = '';
let viewportSize = '';
let canvasRect = null;
let statsAt = 0;
let statsMode = '';
let squadRowsKey = '';
let squadRows = [];
let interiorNotice = { scene: '', id: '', at: 0 };
let touchAim = null;
let interactionPointer = null;
let observing = false;
let quickOrder = null;
let storyDecisionId = '';
let storyCardOpen = false;
let storyRenderKey = '';
const groundOrderTap = new GroundOrderTap();
let coop = null;
let onlineEpoch = null;
let onlineRole = null;
let onlineConnection = 'idle';
let coopDialogMode = 'create';
let coopBusy = false;
let coopCommandEpoch = null;
let lastRoomRoster = '';
const neutralInput = () => ({ moveX:0,moveY:0,aimX:null,aimY:null,fire:false,interact:false,reload:false,smoke:false,grenade:false,observe:false,sprint:false });
const online = () => !!coop?.active || !!game?.coop;
const keys = new Set();
const pointer = { x: 0, y: 0, valid: false, fire: false };
const touchInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimStrength: 0, interact: false };
const actions = { reload: false, smoke: false, grenade: false };
const activeSticks = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const player = () => game?.squad.find(s => s.id === game.playerId);
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function save() { try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch { /* Gameplay works without persistent storage. */ } }
function saveOperation() { try { if (operationPlan) localStorage.setItem(OPERATION_STORAGE, JSON.stringify(operationPlan)); else localStorage.removeItem(OPERATION_STORAGE); } catch { /* Continue works for this session even without storage. */ } }
function text(id, value) { const node = typeof id === 'string' ? $(id) : id, content = String(value ?? ''); if (node && node.textContent !== content) node.textContent = content; }
function attr(node, name, value) { value = String(value); if (node.getAttribute(name) !== value) node.setAttribute(name, value); }
function style(node, name, value) { if (node.style[name] !== value) node.style[name] = value; }
function flag(node, name, enabled) { if (node.classList.contains(name) !== !!enabled) node.classList.toggle(name, !!enabled); }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3400); }
function fit() {
  document.body.classList.toggle('touch', touch && mode !== 'menu');
  const rect = $('battlefield').getBoundingClientRect();
  const size = `${Math.round(rect.width)}:${Math.round(rect.height)}:${touch}`;
  if (viewportSize && size !== viewportSize) clearInput();
  viewportSize = size;
  renderer.resize(rect.width, rect.height, renderDensity(rect.width, rect.height, devicePixelRatio || 1, preferences.renderScale, preferences.graphicsQuality));
  const bounds = canvas.getBoundingClientRect();
  canvasRect = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  text('renderInfo', `Canvas 2D · ${canvas.width} × ${canvas.height} render pixels · ${renderer.width} × ${renderer.height} viewport`);
  measureSafeInsets();
}
function measureSafeInsets() {
  const objectiveBounds = document.querySelector('.objective-panel').getBoundingClientRect();
  const nextStoryTop = `${Math.round(objectiveBounds.bottom - (canvasRect?.top || 0) + 8)}px`;
  if ($('hud').style.getPropertyValue('--story-top') !== nextStoryTop) $('hud').style.setProperty('--story-top', nextStoryTop);
  if (!touch || mode === 'menu') {
    safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const next = [];
    if (!touch && mode === 'playing' && !$('hud').hidden) {
      const origin = canvasRect || { left: 0, top: 0 };
      for (const selector of ['.topbar', '.objective-panel', '.story-radio', '.squad-status-stack', '.orders', '.weapon-panel']) {
        const el = document.querySelector(selector), r = el.getBoundingClientRect();
        if (r.width && r.height) next.push({ left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top });
      }
    }
    const key = JSON.stringify(next);
    if (key !== desktopObstacleKey) { desktopObstacleKey = key; desktopObstacles = next; }
    return;
  }
  desktopObstacles = []; desktopObstacleKey = '';
  const rect = canvas.getBoundingClientRect();
  const controlsRect = $('touchControls').getBoundingClientRect();
  const topElements = showMap ? [document.querySelector('.topbar'), ...(placingOrder ? [$('orderHint'), $('cancelOrder')] : [])] : [document.querySelector('.topbar'), document.querySelector('.objective-panel'), $('squad'), $('storyRadio')];
  const top = Math.max(...topElements.map(el => el?.getBoundingClientRect().bottom || rect.top)) - rect.top + 10;
  safeInsets = { top: Math.min(rect.height * .43, top), right: 20, bottom: showMap ? 58 : Math.min(rect.height * .43, rect.bottom - controlsRect.top + 10), left: 20 };
}
new ResizeObserver(fit).observe($('battlefield'));
window.addEventListener('resize', fit);
touchQuery.addEventListener('change', () => { clearInput(); touch = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0); $('touchControls').hidden = !touch || mode === 'menu'; fit(); soundUI(); });

function menuSoundLabel() {
  text('menuSound', !preferences.sound ? 'Sound off' : audio.context?.state === 'running' ? 'Sound on' : 'Enable sound');
}
function soundUI() {
  menuSoundLabel();
  $('soundToggle').checked = preferences.sound;
  $('motionToggle').checked = preferences.reducedMotion;
  $('touchToggle').checked = touch;
  audio.setEnabled(preferences.sound);
  audio.setLevels({ master: preferences.masterVolume, effects: preferences.effectsVolume, ambience: preferences.ambienceVolume, distress: preferences.distressVolume });
}
function wakeAudio(event) {
  if (!preferences.sound || event?.target?.closest?.('#menuSound') || audio.context?.state === 'running') return;
  void audio.unlock().then(menuSoundLabel);
}
document.addEventListener('pointerdown', wakeAudio, { passive: true });
document.addEventListener('keydown', wakeAudio);

function syncSettings() {
  for (const field of document.querySelectorAll('[data-setting]')) {
    const value = field.dataset.setting === 'touchControls' ? touch : preferences[field.dataset.setting];
    if (field.type === 'checkbox') field.checked = !!value;
    else field.value = String(value);
    if (field.type === 'range') text(`${field.id}Value`, field.id === 'cameraLookahead' && !Number(value) ? 'Off' : `${Math.round(Number(value) * 100)}%`);
  }
  $('guidance').value = preferences.guidance;
}
function applySettings(key) {
  if (!key || key === 'touchControls') {
    const next = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0);
    if (next !== touch) { clearInput(); closeOrders(); touch = next; }
    $('touchControls').hidden = !touch || mode === 'menu';
  }
  document.body.dataset.hudDetail = preferences.hudDetail;
  document.body.dataset.mobileHudDetail = preferences.mobileHudDetail;
  document.documentElement.style.setProperty('--hud-scale', String(preferences.hudScale));
  document.documentElement.style.setProperty('--mobile-hud-scale', String(preferences.mobileHudScale));
  $('performanceStats').hidden = !preferences.showFPS;
  soundUI(); syncSettings();
  if (!key || ['graphicsQuality','renderScale','hudScale','hudDetail','mobileHudScale','mobileHudDetail','touchControls'].includes(key)) fit();
  if (!key || ['graphicsQuality','renderScale','frameLimit'].includes(key)) { framePacer.reset(); frameMeter.reset(); }
  if (game) updateHUD();
}
function changeSetting(key, value) {
  preferences = normalizePreferences({ ...preferences, [key]: value }, defaults);
  applySettings(key); save();
}
function selectSettingsTab(name, focus = false) {
  for (const button of document.querySelectorAll('[data-settings-tab]')) {
    const selected = button.dataset.settingsTab === name;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  }
  for (const panel of document.querySelectorAll('[data-settings-panel]')) panel.hidden = panel.dataset.settingsPanel !== name;
}
for (const field of document.querySelectorAll('[data-setting]')) {
  field.addEventListener(field.type === 'range' ? 'input' : 'change', () => {
    const value = field.type === 'checkbox' ? field.checked : field.type === 'range' || field.dataset.setting === 'frameLimit' ? Number(field.value) : field.value;
    changeSetting(field.dataset.setting, value);
  });
}
for (const button of document.querySelectorAll('[data-settings-tab]')) {
  button.addEventListener('click', () => selectSettingsTab(button.dataset.settingsTab));
  button.addEventListener('keydown', event => {
    const tabs = ['video','controls','audio','interface'];
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(button.dataset.settingsTab);
    selectSettingsTab(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4], true);
  });
}
$('settingsReset').addEventListener('click', () => {
  const { role, difficulty, completed, callsign } = preferences;
  preferences = normalizePreferences({ ...defaults, role, difficulty, completed, callsign }, defaults);
  applySettings(); save(); toast('Settings reset. Mission progress kept.');
});
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
  const continuing = operationPlan?.nextMission === selectedMission;
  $('operationStatus').hidden = !operationPlan;
  text('operationDetail', continuing ? 'Continuing your operation. Earlier supply costs, fatigue, and civilian consequences carry into this mission.' : operationPlan ? `Operation saved at ${MISSIONS[operationPlan.nextMission].title}. This selection starts independently.` : '');
  $('operationResume').hidden = !operationPlan || continuing;
  $('operationFresh').hidden = !continuing;
  if (continuing) text('deploy', `CONTINUE TO ${mission.title.toUpperCase()}`);
}
function clearInput() {
  keys.clear(); pointer.fire = false; pointer.valid = false;
  document.body.classList.remove('desktop-aim');
  touchInput.moveX = 0; touchInput.moveY = 0; touchInput.aimX = 0; touchInput.aimY = 0; touchInput.aimStrength = 0; touchInput.interact = false; touchAim = null;
  actions.reload = false; actions.smoke = false; actions.grenade = false; observing = false;
  const tapId = groundOrderTap.pending?.id;
  groundOrderTap.cancel();
  if (tapId !== undefined) { try { canvas.releasePointerCapture(tapId); } catch {} }
  for (const [id, record] of [...activeSticks]) { try { record.element.releasePointerCapture(id); } catch {} }
  activeSticks.clear();
  if (interactionPointer !== null) { try { $('touchInteract').releasePointerCapture(interactionPointer); } catch {} interactionPointer = null; }
  document.querySelectorAll('.stick-knob').forEach(knob => knob.style.transform = 'translate(0, 0)');
  document.querySelectorAll('.joystick').forEach(el => { el.classList.remove('active', 'firing', 'sprinting'); el.style.removeProperty('--stick-origin-x'); el.style.removeProperty('--stick-origin-y'); });
  $('touchInteract').classList.remove('working');
  if (online()) coop.clearInput();
}
function startMission(index = selectedMission, { restart = false, fresh = false } = {}) {
  if (online()) coop.leave();
  onlineEpoch = null; onlineRole = null; document.body.classList.remove('online'); $('coopBadge').hidden = true;
  selectedMission = clamp(index, 0, MISSIONS.length - 1);
  missionCarry = restart ? missionCarry : !fresh && operationPlan?.nextMission === selectedMission ? normalizeCampaignCarry(operationPlan.carry) : null;
  game = createGame({ mission: selectedMission, role: preferences.role, difficulty: preferences.difficulty, seed: Date.now() >>> 0, campaign: missionCarry });
  resetStoryUI();
  mode = 'playing'; paused = false; accumulator = 0; showMap = false; placingOrder = false; lastRadio = ''; hudTimer = 0;
  clearInput();
  document.body.classList.remove('in-menu', 'orders-open', 'map-open', 'placing-order');
  $('menu').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
  $('mapLegend').hidden = true; $('orderHint').hidden = true;
  $('missionName').textContent = game.mission.title.toUpperCase();
  updateOrders(); audio.setScene('mission'); audio.unlock(); audio.setEnabled(preferences.sound); fit(); updateHUD();
  canvas.focus({ preventScroll: true });
  syncMapUI(); closeOrders();
  clearTimeout(toastTimer); $('toast').hidden = true;
  if (touch) toast(game.role === 'leader' ? 'Tap ground to move the squad · Tap a soldier to take control' : 'Tap a soldier to take control · Right stick: aim and fire');
}
function returnToMenu() {
  if (online()) coop.leave();
  coopCommandEpoch = null;
  onlineEpoch = null; onlineRole = null; $('coopOverlay').hidden = true; $('coopBadge').hidden = true;
  mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; clearInput(); audio.setScene('menu');
  resetStoryUI();
  document.body.classList.add('in-menu'); document.body.classList.remove('orders-open', 'touch', 'map-open', 'placing-order', 'online');
  $('menu').hidden = false; $('hud').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = true;
  missionMenu(); fit(); $('deploy').focus({ preventScroll: true });
}
function pause(value = true) {
  if (mode !== 'playing') return;
  paused = value; accumulator = 0; clearInput(); closeOrders();
  $('pauseOverlay').hidden = !value;
  updatePauseUI();
  audio.setScene(value ? 'paused' : 'mission');
  if (value) { $('resume').focus(); } else { audio.unlock(); audio.setEnabled(preferences.sound); canvas.focus({ preventScroll: true }); }
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
  text('touchRegroup', leader ? 'Regroup' : 'Ready'); text('touchHold', leader ? 'Hold' : 'Wait');
  attr($('touchRegroup'), 'aria-label', leader ? 'Regroup the squad now' : 'Tell the leader you are ready');
  attr($('touchHold'), 'aria-label', leader ? 'Hold the squad here' : 'Ask the leader to wait');
  $('desktopHint').textContent = (leader ? 'WASD move · Mouse fire · E assist · R reload · G smoke · Right click order' : 'WASD move · Mouse fire · E assist · R reload · Q ready · H wait') + (online() ? '' : ' · 1–4 soldier');
}
function doOrder(type, point) {
  if (mode !== 'playing' || paused || !player()?.alive || player()?.downed || online() && !coop.connected) return;
  if (type === 'move' && !point) {
    if (game.role !== 'leader') return;
    clearInput(); closeOrders(); placingOrder = true;
    syncMapUI();
    return;
  }
  if (online()) coop.order(type, point).catch(() => {});
  else issueOrder(game, type, point);
  if (placingOrder || showMap) clearInput();
  placingOrder = false; closeOrders();
  if (touch && type === 'move') showMap = false;
  if (type === 'move' && point) quickOrder = { point: { ...point }, until: performance.now()+1050 };
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

function switchSoldier(id) {
  if (mode !== 'playing' || online() || !game) return;
  const next = game.squad.find(soldier => String(soldier.id) === String(id));
  if (!next || next.id === game.playerId || !selectSquadMember(game, next.id)) return;
  clearInput(); closeOrders(); placingOrder = false; showMap = false; quickOrder = null;
  chooseRole(game.role); syncMapUI(); updateOrders(); updateHUD(); updatePauseUI();
  if (paused) pause(false); else canvas.focus({ preventScroll: true });
  // The selected card, equipment and radio line already identify the new soldier.
}
function toggleObservation() {
  if (!canAct() || player()?.role !== 'grenadier') return;
  observing = !observing; pointer.fire = false;
  if (observing) actions.grenade = false;
  flag($('aimStick'), 'firing', !observing && touchInput.aimStrength >= .56);
  flag($('moveStick'), 'sprinting', !observing && Math.hypot(touchInput.moveX,touchInput.moveY) >= .92 && touchInput.aimStrength <= .12);
  audio.click(); updateHUD();
}
function launchGrenade() {
  const p = player();
  if (canAct() && p?.role === 'grenadier' && p.grenades > 0 && !(p.grenadeCooldown > 0) && !(p.reloadTimer > 0) && !observing) actions.grenade = true;
}

function assistAction() {
  const p = player(); if (!p || !p.alive || p.downed || !game) return null;
  const down = [...game.squad, ...(game.survivors || []).filter(s => s.stabilized)].filter(s => s.alive && s.downed && s.id !== p.id && Math.hypot(s.x - p.x, s.y - p.y) < 70 && hasLineOfSight(game, p, s)).sort((a,b) => Math.hypot(a.x-p.x,a.y-p.y) - Math.hypot(b.x-p.x,b.y-p.y))[0];
  if (down) return { label: 'Revive', detail: `Hold to help ${down.name}`, progress: (down.reviveProgress || 0) / 4 };
  const objective = getObjective(game), distance = objective ? Math.hypot(p.x-objective.x,p.y-objective.y) : Infinity;
  if (objective?.kind === 'rescue' && distance < objective.radius && hasLineOfSight(game, p, objective)) return { label: 'Rescue', detail: 'Hold to stabilize the crew', progress: objective.progress || 0 };
  if (objective?.kind === 'barricade' && distance < 85 && hasLineOfSight(game, p, objective)) return { label: 'Clear', detail: 'Hold to clear the route', progress: objective.progress || 0 };
  const fieldAction = getStoryInteraction(game, p.id);
  if (fieldAction) return { ...fieldAction, detail: `Hold to aid resident · ${fieldAction.detail.replace(/^Hold to use /, 'uses ')}` };
  if (p.hp < p.maxHp && p.medkits > 0 && !['rescue','barricade'].includes(objective?.kind)) return { label: 'Bandage', detail: 'Hold to bandage yourself', progress: (p.bandageProgress || 0) / 3 };
  return null;
}
function resetStoryUI() {
  storyDecisionId = ''; storyCardOpen = false; storyRenderKey = '';
  $('storyRadio').hidden = true; $('storyCard').hidden = true;
  attr($('storyToggle'), 'aria-expanded', false);
  document.body.classList.remove('story-open');
}
function updateStoryUI() {
  const decision = game?.story?.activeDecision;
  const available = mode === 'playing' && !paused && !showMap && !placingOrder && !!decision;
  $('storyRadio').hidden = !available;
  flag(document.body, 'story-open', available && storyCardOpen);
  if (!decision) { if (storyDecisionId) resetStoryUI(); return; }
  if (storyDecisionId !== decision.id) { storyDecisionId = decision.id; storyCardOpen = false; storyRenderKey = ''; }
  const leader = getStoryLeaderId(game) === game.playerId;
  text('storyTeaser', `Radio · ${decision.title}`);
  text('storyToggleHint', storyCardOpen ? 'CLOSE' : touch ? 'OPEN' : 'C');
  attr($('storyToggle'), 'aria-expanded', storyCardOpen);
  attr($('storyToggle'), 'aria-label', `${storyCardOpen ? 'Close' : 'Open'} radio decision: ${decision.title}`);
  $('storyCard').hidden = !storyCardOpen;
  flag(document.body, 'story-open', available && storyCardOpen);
  const key = `${game.seed}:${decision.id}:${leader}:${touch}:${JSON.stringify(decision.options)}`;
  if (key !== storyRenderKey) {
    text('storyAuthority', leader ? 'YOUR CALL · MISSION CONTINUES' : 'YOUR RECOMMENDATION · THE LEADER DECIDES');
    text('storyTitle', decision.title); text('storyDetail', decision.detail);
    $('storyOptions').innerHTML = decision.options.map((option, i) => `<button type="button" data-story-option="${escape(option.id)}"><strong>${!touch ? `<kbd>${['Z','X'][i] || ''}</kbd>` : ''}${escape(option.label)}</strong><span>${escape(option.available === false ? option.disabledReason || option.detail : option.detail)}</span></button>`).join('');
    storyRenderKey = key;
  }
  for (const button of $('storyOptions').querySelectorAll('button')) button.disabled = !canAct() || decision.options.find(option => option.id === button.dataset.storyOption)?.available === false;
  const recommendation = decision.recommendation;
  const suggested = recommendation && decision.options.find(option => option.id === recommendation.optionId);
  $('storyRecommendation').hidden = !suggested;
  text('storyRecommendation', suggested ? `${recommendation.speaker || 'Squad mate'} recommends: ${suggested.label.toLowerCase()}.` : '');
  const fallback = decision.options.find(option => option.id === decision.defaultOption);
  const remaining = Math.max(0, Math.ceil(decision.deadline - game.time));
  text('storyTiming', Number.isFinite(remaining) && fallback ? `No reply: ${fallback.label.toLowerCase()} · ${remaining}s` : 'The mission continues while you read.');
  attr($('storyRadio'), 'data-decision', decision.id);
}
async function selectStoryOption(optionId) {
  const decision = game?.story?.activeDecision;
  if (!decision || !canAct() || !decision.options.some(option => option.id === optionId && option.available !== false)) return;
  const leader = getStoryLeaderId(game) === game.playerId;
  try {
    const accepted = online() ? await coop.storyChoice(decision.id, optionId) : chooseStoryOption(game, decision.id, optionId, game.playerId);
    if (accepted === false) { toast('That decision is no longer available.'); return; }
    storyCardOpen = false; updateStoryUI(); updateHUD();
    if (!leader) toast('Recommendation sent to the squad leader.');
    if (!touch) canvas.focus({ preventScroll: true });
  } catch (error) { toast(error.message || 'The radio choice could not be sent.'); }
}
function continueOperation() {
  if (!game) return;
  const nextMission = game.missionIndex + 1;
  if (online()) {
    runCoopAction(() => game.status === 'won' && nextMission < MISSIONS.length ? coop.continueOperation() : coop.returnToLobby());
    return;
  }
  if (game.status === 'won' && nextMission < MISSIONS.length) {
    const carry = campaignOutcome(game);
    if (carry) { operationPlan = { nextMission, carry }; saveOperation(); }
    selectedMission = nextMission;
  } else if (game.status === 'won' && operationPlan?.nextMission === game.missionIndex) { operationPlan = null; saveOperation(); }
  returnToMenu();
}
function openInfo(id) {
  previousDialogFocus = document.activeElement;
  if (mode === 'playing' && !paused) pause(true);
  if (id === 'settingsDialog') syncSettings();
  $(id).showModal();
}
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
  const target = paused && !$('pauseOverlay').contains(previousDialogFocus) ? $('resume') : previousDialogFocus;
  target?.focus?.();
}));
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.role) chooseRole(button.dataset.role);
  if (button.dataset.mission !== undefined) { selectedMission = Number(button.dataset.mission); missionMenu(); }
  if (button.dataset.dialog) openInfo(button.dataset.dialog);
  if (button.dataset.order) doOrder(button.dataset.order);
  if (button.dataset.soldier) switchSoldier(button.dataset.soldier);
  if (button.dataset.storyOption) selectStoryOption(button.dataset.storyOption);
});
$('difficulty').value = preferences.difficulty;
$('guidance').value = preferences.guidance;
$('difficulty').addEventListener('change', event => { preferences.difficulty = event.target.value; save(); });
$('guidance').addEventListener('change', event => changeSetting('guidance', event.target.value));
$('deploy').addEventListener('click', () => startMission());
$('menuSound').addEventListener('click', () => {
  preferences.sound = !preferences.sound || audio.context?.state !== 'running';
  soundUI(); if (preferences.sound) void audio.unlock().then(menuSoundLabel); save();
});
$('soundToggle').addEventListener('change', event => { preferences.sound = event.target.checked; soundUI(); if (preferences.sound) void audio.unlock().then(menuSoundLabel); save(); });
$('motionToggle').addEventListener('change', event => changeSetting('reducedMotion', event.target.checked));
$('touchToggle').addEventListener('change', event => changeSetting('touchControls', event.target.checked));
$('pauseButton').addEventListener('click', () => pause());
$('resume').addEventListener('click', () => pause(false));
$('switchRole').addEventListener('click', () => {
  if (online()) { clearInput(); runCoopAction(() => coop.swapRoles()); return; }
  const next = game.squad.find(s => s.alive && !s.downed && s.id !== game.playerId); if (next) switchSoldier(next.id);
});
$('restart').addEventListener('click', () => online() ? runCoopAction(() => coop.restart()) : startMission(selectedMission, { restart: true }));
$('returnMenu').addEventListener('click', returnToMenu);
$('resultMenu').addEventListener('click', returnToMenu);
$('replay').addEventListener('click', () => online() ? runCoopAction(() => coop.restart()) : startMission(selectedMission, { restart: true }));
$('nextMission').addEventListener('click', continueOperation);
$('operationResume').addEventListener('click', () => { if (operationPlan) { selectedMission = operationPlan.nextMission; missionMenu(); } });
$('operationFresh').addEventListener('click', () => { operationPlan = null; saveOperation(); missionMenu(); toast('Fresh mission selected. Earlier operation carryover cleared.'); });
$('storyToggle').addEventListener('click', () => { storyCardOpen = !storyCardOpen; updateStoryUI(); measureSafeInsets(); });
$('storyClose').addEventListener('click', () => { storyCardOpen = false; updateStoryUI(); if (!touch) canvas.focus({ preventScroll: true }); });
$('mapToggle').addEventListener('click', toggleMap);
$('touchOrder').addEventListener('click', () => {
  if (mode !== 'playing' || paused || showMap || placingOrder) return;
  clearInput(); const open = document.body.classList.toggle('orders-open'); $('touchOrder').setAttribute('aria-expanded', String(open));
});
$('orderClose')?.addEventListener('click', closeOrders);
$('cancelOrder')?.addEventListener('click', cancelOrder);
$('touchReload').addEventListener('click', () => { if (canAct()) actions.reload = true; });
$('touchSmoke').addEventListener('click', () => { if (canAct()) actions.smoke = true; });
$('touchRegroup').addEventListener('click', () => doOrder(game?.role === 'leader' ? 'follow' : 'ready'));
$('touchHold').addEventListener('click', () => doOrder(game?.role === 'leader' ? 'hold' : 'wait'));
$('touchObserve').addEventListener('click', toggleObservation);
$('touchGrenade').addEventListener('click', launchGrenade);
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
    element.classList.toggle('firing', kind === 'aim' && strength >= .56 && !observing);
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

function screenPoint(event) { return clientToCanvasPoint(event.clientX, event.clientY, canvasRect, { width: renderer.width, height: renderer.height }); }
canvas.addEventListener('pointermove', event => {
  groundOrderTap.move(event.pointerId,event.clientX,event.clientY);
  const point = screenPoint(event); if (!point) return;
  pointer.x = point.x; pointer.y = point.y; pointer.valid = !touch && event.pointerType !== 'touch' && (point.inside || pointer.fire);
});
canvas.addEventListener('pointerleave', () => { if (!pointer.fire) pointer.valid = false; });
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'playing' || paused) return;
  event.preventDefault(); canvas.focus({ preventScroll: true }); audio.unlock();
  const point = screenPoint(event); if (!point) return; pointer.x = point.x; pointer.y = point.y; pointer.valid = true;
  if (placingOrder || event.button === 2) {
    if (game.role === 'leader') doOrder('move', renderer.screenToWorld(point.x, point.y));
    return;
  }
  if (touch || event.pointerType === 'touch') {
    pointer.valid = false;
    if (game.role === 'leader' && point.inside && (canAct() || showMap) && event.button <= 0 && groundOrderTap.begin(event.pointerId,event.clientX,event.clientY,event.timeStamp)) canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (showMap || event.pointerType === 'touch' || !canAct()) { pointer.valid = false; return; }
  if (event.button === 0) { pointer.fire = true; canvas.setPointerCapture(event.pointerId); }
});
canvas.addEventListener('pointerup', event => {
  pointer.fire = false;
  if (groundOrderTap.end(event.pointerId,event.clientX,event.clientY,event.timeStamp) && game?.role === 'leader' && (canAct() || showMap && !paused)) {
    const point = screenPoint(event);
    if (point?.inside) doOrder('move', renderer.screenToWorld(point.x,point.y));
  }
});
for (const type of ['pointercancel','lostpointercapture']) canvas.addEventListener(type,event => { pointer.fire=false; groundOrderTap.cancel(event.pointerId); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (event.code === 'F3') { event.preventDefault(); if (!event.repeat) changeSetting('showFPS', !preferences.showFPS); return; }
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
    if (storyCardOpen) { storyCardOpen = false; updateStoryUI(); canvas.focus({ preventScroll: true }); return; }
    pause(!paused); return;
  }
  if (paused) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyC' && game?.story?.activeDecision && !showMap && !placingOrder) { event.preventDefault(); storyCardOpen = !storyCardOpen; updateStoryUI(); measureSafeInsets(); return; }
  if (['KeyZ', 'KeyX'].includes(event.code) && storyCardOpen && game?.story?.activeDecision) { event.preventDefault(); const option = game.story.activeDecision.options[event.code === 'KeyZ' ? 0 : 1]; if (option) selectStoryOption(option.id); return; }
  if (/^Digit[1-4]$/.test(event.code) && !online()) { event.preventDefault(); const soldier = game.squad[Number(event.code.slice(-1))-1]; if (soldier) switchSoldier(soldier.id); return; }
  if (event.code === 'KeyR' && canAct()) actions.reload = true;
  if (event.code === 'KeyG' && canAct()) actions.smoke = true;
  if (event.code === 'KeyB') toggleObservation();
  if (event.code === 'KeyV') launchGrenade();
  if (event.code === 'KeyM') toggleMap();
  if (event.code === 'KeyQ') doOrder(game.role === 'leader' ? 'follow' : 'ready');
  if (event.code === 'KeyH') doOrder(game.role === 'leader' ? 'hold' : 'wait');
  if (event.code === 'KeyF') doOrder(game.role === 'leader' ? 'assist' : 'help');
  if (event.code === 'KeyT' && game.role === 'leader') doOrder('move', pointer.valid ? renderer.screenToWorld(pointer.x, pointer.y) : undefined);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); if (mode === 'playing' && !paused) pause(); });
document.addEventListener('visibilitychange', () => { framePacer.reset(); frameMeter.reset(); if (document.hidden && mode === 'playing' && !paused) pause(); });

function controls() {
  const p = player();
  if (!canAct()) { touchAim = null; return neutralInput(); }
  const observe = observing && p?.role === 'grenadier';
  const intent = touchIntent(touchInput);
  let moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + intent.moveX;
  let moveY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + intent.moveY;
  let aim = pointer.valid && !showMap ? renderer.screenToWorld(pointer.x, pointer.y) : null;
  let fire = pointer.fire && !showMap && !placingOrder;
  if (p && intent.aiming) {
    const stickLength = Math.hypot(touchInput.aimX,touchInput.aimY);
    aim = { x: p.x + touchInput.aimX/stickLength * 600, y: p.y + touchInput.aimY/stickLength * 600 }; fire = intent.firing;
    if (preferences.guidance === 'simple' && !observe) {
      const direction = Math.atan2(touchInput.aimY, touchInput.aimX);
      let closest = null, score = Infinity;
      for (const enemy of game.enemies) {
        if (!enemy.alive || enemy.downed || !enemy.visible) continue;
        const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        const angle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        const difference = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
        if (distance < 480 && difference < .22 && distance * difference < score && hasLineOfSight(game, p, enemy)) { closest = enemy; score = distance * difference; }
      }
      if (closest) aim = { x: closest.x, y: closest.y };
    }
  }
  if (observe) fire = false;
  touchAim = intent.aiming && aim ? { ...aim, firing: fire } : null;
  if (touchInput.interact && !assistAction()) { touchInput.interact = false; $('touchInteract').classList.remove('working'); }
  const interact = keys.has('KeyE') || touchInput.interact;
  const sprint = !interact && !observe && (keys.has('ShiftLeft') || keys.has('ShiftRight') || intent.sprint);
  if (touch) flag($('moveStick'), 'sprinting', !!intent.sprint && !interact && !observe);
  const autoReload = preferences.autoReload && p?.ammo === 0 && p.reserve > 0 && p.reloadTimer <= 0;
  return { moveX, moveY, aimX: aim?.x ?? null, aimY: aim?.y ?? null, fire: fire && !interact, interact, reload: actions.reload || autoReload, smoke: actions.smoke, grenade: actions.grenade && !interact, observe, sprint };
}

function updateHUD() {
  if (!game) return;
  const p = player(), objective = getObjective(game), shared = online();
  text('objectiveTitle', objective?.title || 'Stay with the squad');
  text('objectiveDetail', objective?.detail || objective?.description || '');
  style($('objectiveProgress'), 'width', `${Math.round(clamp(Number(objective?.progress) || 0, 0, 1) * 100)}%`);
  text('stageNumber', `${Math.min(game.stageIndex + 1, game.stageCount)}/${game.stageCount}`);
  text('missionClock', clock(game.time));
  text('leaderIntent', game.role === 'member' ? `HALE / ${game.leaderOrder || 'Stay together.'}` : game.order?.label || '');
  const rowKey = game.squad.map(s => s.id).join('|');
  if (rowKey !== squadRowsKey) {
    $('squad').innerHTML = game.squad.map(() => '<button type="button" class="squad-member"><strong></strong><small></small><span class="squad-health"><span></span></span></button>').join('');
    squadRows = [...$('squad').children].map(root => ({ root, name: root.querySelector('strong'), role: root.querySelector('small'), health: root.querySelector('.squad-health span') }));
    squadRowsKey = rowKey;
  }
  const peers = shared ? coop.room?.players || [] : [];
  game.squad.forEach((soldier, i) => {
    const row = squadRows[i], peer = peers.find(peer => peer.actorId === soldier.id && peer.connected), mine = soldier.id === game.playerId;
    const profile = roleProfile(soldier);
    flag(row.root, 'active', mine); flag(row.root, 'downed', soldier.downed || !soldier.alive);
    row.root.disabled = shared || !soldier.alive || soldier.downed;
    attr(row.root, 'data-soldier', soldier.id); attr(row.root, 'aria-pressed', mine);
    attr(row.root, 'data-human', !!peer); attr(row.root, 'title', `${soldier.name} · ${profile.label} · ${shared ? peer?.name || 'Computer controlled' : mine ? 'You' : `Take control (${i+1})`}`);
    attr(row.root, 'aria-label', `${soldier.name}, ${profile.label}${mine ? ', controlling' : shared ? ', '+(peer?.name || 'AI') : ', select soldier '+(i+1)}${!soldier.alive ? ', lost' : soldier.downed ? ', down' : ''}`);
    text(row.name, soldier.name + (mine ? ' ·' : ''));
    text(row.role, !soldier.alive ? 'LOST' : soldier.downed ? 'DOWN' : profile.shortLabel + (shared && !peer ? ' · AI' : ''));
    style(row.health, 'width', `${Math.round(clamp(soldier.hp / soldier.maxHp, 0, 1) * 100)}%`);
  });
  if (p) {
    const profile = roleProfile(p), heavy = p.role === 'grenadier', usingBinos = heavy && observing;
    const health = clamp(Math.round(p.hp / p.maxHp * 100), 0, 100), reloading = p.reloadTimer > 0;
    text('playerName', p.name.toUpperCase()); text('healthText', `${health}%`); style($('healthBar'), 'width', `${health}%`);
    style($('healthBar'), 'background', health < 35 ? 'var(--danger)' : '');
    text('ammo', p.ammo ?? 0); text('reserve', `/ ${p.reserve ?? 0}`);
    text('reloadLabel', reloading ? 'RELOADING' : p.ammo === 0 ? 'RELOAD' : '');
    text('smokeCount', `SMOKE × ${p.smokes ?? 0}`); text('touchSmokeQty', p.smokes ?? 0);
    text('weaponName', profile.weaponLabel);
    text('specialtyText', heavy ? `${usingBinos ? 'BINOCULARS · ' : ''}40 mm × ${p.grenades ?? 0}${p.grenadeCooldown > 0 ? ' · Loading' : touch ? '' : ' · B scan / V launch'}` : p.role === 'medic' ? `MEDIC · AID × ${p.medkits ?? 0}` : p.role === 'support' ? 'SAW · SUSTAINED FIRE' : touch ? 'LEAD · TAP GROUND TO COMMAND' : 'LEAD · RIGHT CLICK TO COMMAND');
    $('touchSpecialty').hidden = !heavy;
    text('touchGrenadeQty', p.grenades ?? 0); $('touchGrenade').disabled = !p.grenades || p.grenadeCooldown > 0 || reloading || usingBinos || !p.alive || p.downed;
    attr($('touchGrenade'), 'aria-label', `Launch 40 mm grenade toward your aim, ${p.grenades ?? 0} remaining${p.grenadeCooldown > 0 ? ', reloading' : ''}`);
    $('touchObserve').disabled = !p.alive || p.downed;
    attr($('touchObserve'), 'aria-pressed', usingBinos); attr($('touchObserve'), 'aria-label', usingBinos ? 'Lower binoculars' : 'Use binoculars'); text('touchObserveLabel', usingBinos ? 'Lower' : 'Binos');
    text($('aimStick').querySelector('.stick-label'), usingBinos ? 'SCAN' : 'AIM / FIRE');
    attr($('aimStick'), 'aria-label', usingBinos ? 'Scan with binoculars thumbstick' : 'Aim and fire thumbstick');
    flag(document.body, 'observing', usingBinos);
    for (const id of ['touchRegroup','touchHold','touchOrder']) $(id).disabled = !p.alive || p.downed;
    attr($('touchSmoke'), 'aria-label', `Smoke, ${p.smokes ?? 0} remaining`);
    text('touchReloadLabel', reloading ? 'Loading' : 'Reload');
    attr($('touchReload'), 'aria-label', reloading ? 'Reloading' : 'Reload weapon'); flag($('touchReload'), 'reloading', reloading);
    $('downedBanner').hidden = !p.downed && p.alive;
    text('downedTitle', p.alive ? 'YOU ARE DOWN' : 'SOLDIER LOST');
    text('downedDetail', !shared && game.squad.some(s => s.id !== p.id && s.alive && !s.downed) ? touch ? 'Tap another soldier above to take control.' : 'Press 1–4 or click another soldier to take control.' : p.alive ? 'Your squad is coming to help. Stay with them.' : shared ? 'Your partner is still in the mission. Stay with the squad.' : 'Your squad could not recover you.');
    $('touchReload').disabled = reloading || !p.reserve || p.ammo === p.magSize; $('touchSmoke').disabled = !p.smokes;
  }
  const assist = assistAction();
  $('touchInteract').disabled = !assist; flag($('touchInteract'), 'available', !!assist);
  const assistProgress = `${Math.round(clamp(assist?.progress || 0, 0, 1) * 100)}%`;
  if ($('touchInteract').style.getPropertyValue('--assist-progress') !== assistProgress) $('touchInteract').style.setProperty('--assist-progress', assistProgress);
  text('touchInteractLabel', assist?.label || 'Assist');
  attr($('touchInteract'), 'aria-label', assist?.detail || 'Assist — move near someone who needs help');
  const messages = game.radio.filter(m => game.time - m.time < (touch ? 8 : 14)).slice(touch || preferences.hudDetail === 'compact' ? -1 : -2);
  const radioKey = messages.map(m => `${m.id}:${m.text}`).join('|');
  if (lastRadio !== radioKey) { $('radio').innerHTML = messages.map(m => `<div class="radio-line"><strong>${escape(m.speaker)}</strong>${escape(m.text)}</div>`).join(''); lastRadio = radioKey; }
  const interactText = shared ? (assist ? `${touch ? 'Hold ASSIST' : 'Hold E'} to ${assist.detail.replace(/^Hold to /,'')}.` : '') : typeof game.interactionPrompt === 'string' ? game.interactionPrompt : '';
  let hint = interactText || (assist ? `${touch ? 'Hold ASSIST' : 'Hold E'} to ${assist.detail.replace(/^Hold to /,'')}.` : '');
  if (!hint && p && objective?.interaction && Math.hypot(p.x - objective.x, p.y - objective.y) < (objective.radius || 60) + 20 && hasLineOfSight(game, p, objective)) hint = touch ? 'Hold ASSIST to work on the objective.' : 'Hold E to work on the objective.';
  if (!hint && !touch && preferences.guidance === 'simple' && game.time < 13) hint = game.role === 'leader' ? 'Follow the amber marker. Right click to send your squad.' : 'Stay near Hale. He will lead you to the objective.';
  if (touch) hint = assist ? assist.detail : game.role === 'leader' && game.time < 18 ? shared ? 'Tap ground: move squad · Regroup / Hold act immediately' : 'Tap ground: move squad · Tap soldier: take control' : '';
  if (!hint && observing) hint = touch ? 'Binoculars · Aim stick scans · Tap Lower to fight' : 'Binoculars · Mouse to scan · B to lower';
  const house = p ? buildingAt(game.world, p) : null;
  const scene = `${game.seed}:${game.missionIndex}:${game.playerId}`;
  if (interiorNotice.scene !== scene || interiorNotice.id !== (house?.id || '')) interiorNotice = { scene, id: house?.id || '', at: game.time };
  if (!hint && p?.alive && !p.downed && preferences.guidance !== 'expert' && !showMap && !placingOrder) {
    if (house && game.time - interiorNotice.at < 4) hint = 'Inside · Doorways stay exposed';
    else if (!house && game.world.buildings.some(b => b.enterable && b.doors?.some(d => Math.hypot(p.x - d.x, p.y - d.y) < 65))) hint = 'Open doorway · Walk inside';
  }
  attr($('hud'), 'data-building', house?.id || '');
  text('contextHint', hint); style($('desktopHint'), 'visibility', preferences.guidance === 'expert' ? 'hidden' : 'visible');
  updateStoryUI();
  for (const [key,value] of Object.entries({ stage: game.stageIndex, status: game.status, role: game.role, online: shared, room: shared ? coop.room?.code || '' : '', humans: shared ? game.humanIds?.length || 0 : 1, player: game.playerId, specialty: p?.role || '', observing: observing && p?.role === 'grenadier', grenades: p?.grenades ?? 0, seed: game.seed, order: game.order?.type || '', 'order-x': Math.round(game.order?.x || 0), 'order-y': Math.round(game.order?.y || 0) })) attr($('hud'), `data-${key}`, value);
  measureSafeInsets();
}

function finishMission() {
  mode = 'result'; paused = false; $('pauseOverlay').hidden = true; clearInput(); closeOrders(); audio.setScene('paused');
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
  resetStoryUI();
  const summary = (game.story?.summary || []).filter(item => typeof item === 'string').slice(-8);
  const log = (game.story?.log || []).filter(item => item && typeof item.text === 'string').slice(-10);
  $('storyDebrief').hidden = !summary.length && !log.length;
  $('storySummary').innerHTML = summary.map(item => `<li>${escape(item)}</li>`).join('');
  $('storyLog').innerHTML = log.map(item => `<li><time>${clock(Number(item.time) || 0)}</time><span><strong>${escape(item.speaker || 'FIELD')}</strong> ${escape(item.text)}</span></li>`).join('');
  text('operationCarryHint', won && game.missionIndex + 1 < MISSIONS.length ? 'Continue operation to carry supply costs, fatigue, and civilian consequences into the next mission. Each chapter assembles a new squad state.' : 'These decisions belong to this playthrough. Replay to take a different approach.');
  $('nextMission').hidden = !won;
  $('nextMission').textContent = selectedMission + 1 < MISSIONS.length ? 'CONTINUE OPERATION' : 'RETURN TO FIELD ORDERS';
  $('replay').disabled = false; $('nextMission').disabled = false; $('coopResultWait').hidden = true; $('resultMenu').textContent = 'Back to field orders';
  if (online()) {
    $('nextMission').hidden = !coop.isHost; $('nextMission').textContent = won && game.missionIndex + 1 < MISSIONS.length ? 'CONTINUE WITH SQUAD' : 'SQUAD BRIEFING';
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
  $('switchRole').disabled = shared && (!coop.isHost || !coop.connected || coopCommandEpoch !== null);
  $('switchRole').hidden = !shared;
  $('soloSquadPicker').hidden = shared; $('soloSwitchHint').hidden = shared;
  if (!shared && game) $('soloSquadPicker').innerHTML = game.squad.map((soldier,i) => `<button type="button" data-soldier="${escape(soldier.id)}" aria-pressed="${soldier.id === game.playerId}" ${!soldier.alive || soldier.downed ? 'disabled' : ''}><strong>${escape(soldier.name)}</strong><small>${escape(roleProfile(soldier).label)}${!soldier.alive ? ' · Lost' : soldier.downed ? ' · Down' : !touch ? ` · ${i+1}` : ''}</small></button>`).join('');
  $('restart').textContent = shared ? 'Restart for squad' : 'Restart mission';
  $('restart').disabled = shared && (!coop.isHost || !coop.connected || coopCommandEpoch !== null);
  $('returnMenu').textContent = shared ? 'Leave squad' : 'Field orders';
  $('coopLobbyButton').hidden = !shared || !coop.isHost;
  $('coopLobbyButton').disabled = shared && (!coop.connected || coopCommandEpoch !== null);
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
  if (coopCommandEpoch !== null) return;
  const epoch = coop.room?.epoch ?? -1;
  coopCommandEpoch = epoch; coopMessage('');
  if (coop.room) renderCoopRoom(coop.room);
  try { await action(); }
  catch { coopCommandEpoch = null; /* The client's onError keeps the failure visible. */ }
  finally {
    // A command acknowledgement can arrive before its new state. Keep host
    // controls locked until that state carries the current epoch.
    if (coop.room?.epoch !== epoch) coopCommandEpoch = null;
    if (coop.room) renderCoopRoom(coop.room);
    if (paused) updatePauseUI();
  }
}
function updateCoopStatus(status) {
  onlineConnection = status.state;
  if (status.state !== 'connected') coopCommandEpoch = null;
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
  if (coopCommandEpoch !== null && room.epoch !== coopCommandEpoch) coopCommandEpoch = null;
  const connected = room.players.filter(p => p.connected);
  $('coopBadge').hidden = false;
  $('coopBadge').textContent = onlineConnection === 'connected' ? `${connected.length}/2 CO-OP` : onlineConnection === 'error' ? 'OFFLINE' : 'REJOINING';
  $('coopBadge').setAttribute('aria-label', `Online squad ${room.code}, ${connected.length} player${connected.length === 1 ? '' : 's'}. Open squad details`);
  $('coopRoomCode').textContent = room.code;
  const rosterKey = JSON.stringify([room.players,coop.session?.playerId]);
  if (lastRoomRoster !== rosterKey) {
    $('coopRoster').innerHTML = [['Hale','Squad lead'],['Mercer','Grenadier'],['Ames','Medic'],['Webb','Machine gunner · SAW']].map(([name,role],slot) => {
      const peer = room.players.find(p => p.slot === slot), mine = peer?.id === coop.session?.playerId;
      const occupant = peer ? `${peer.name}${mine?' · You':''}${peer.connected?'':' · Reconnecting'}` : slot < 2 ? 'Open for friend · AI controls' : 'Computer controlled';
      return `<div class="coop-roster-row ${mine?'mine':''}"><div><strong>${escape(name)} <small>${escape(role)} · ${escape(occupant)}</small></strong></div><span class="coop-seat ${peer?.connected?'human':peer?'offline':''}">${peer?.connected?'HUMAN':'AI'}</span></div>`;
    }).join(''); lastRoomRoster = rosterKey;
    if (game?.coop) updateOrders();
  }
  $('coopMission').value = room.mission; $('coopDifficulty').value = room.difficulty;
  const canManage = coop.connected && coop.isHost && coopCommandEpoch === null;
  $('coopMission').disabled = !canManage; $('coopDifficulty').disabled = !canManage;
  $('coopSwapLobby').disabled = !canManage; $('coopStart').disabled = !canManage;
  $('coopLobbyHint').textContent = coop.isHost ? `You host the room. ${connected.length === 1 ? 'Your friend can join now or during the mission. AI holds the other positions.' : 'Both players are connected. You can swap who leads before deploying.'}` : 'The host chooses the mission and deploys the squad. You can move and fight independently once deployed.';
  if (room.status === 'lobby') {
    const entering = $('coopLobby').hidden || mode !== 'menu';
    mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; onlineEpoch = null; onlineRole = null;
    clearInput(); closeOrders(); audio.setScene('menu');
    document.body.classList.add('in-menu','online'); document.body.classList.remove('touch','map-open','placing-order');
    $('menu').hidden = false; $('hud').hidden = true; $('touchControls').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true;
    $('coopOverlay').hidden = false; $('coopConnectForm').hidden = true; $('coopLobby').hidden = false;
    $('coopTitle').textContent = 'Squad briefing.'; $('coopDescription').textContent = 'Hale and Mercer are player positions. Ames and Webb stay with you as AI.';
    fit(); if (entering) $('coopStart').disabled ? $('coopCopyLink').focus() : $('coopStart').focus();
  }
  if (paused) updatePauseUI();
  if (mode === 'result') { $('replay').disabled = !canManage; $('nextMission').disabled = !canManage; $('nextMission').hidden = !coop.isHost; $('coopResultWait').hidden = coop.isHost; }
}
function receiveCoopState(state) {
  const room = coop?.room; if (!room || room.status === 'lobby' || !state) return;
  const fresh = onlineEpoch !== room.epoch || !game?.coop;
  const changedRole = onlineRole !== null && onlineRole !== state.role;
  const keepMenu = paused && changedRole && game?.coop && game.seed === state.seed && game.missionIndex === state.missionIndex;
  game = state;
  if (fresh) {
    resetStoryUI();
    onlineEpoch = room.epoch; selectedMission = state.missionIndex;
    mode = 'playing'; paused = !!keepMenu; accumulator = 0; showMap = false; placingOrder = false; lastRadio = ''; hudTimer = 0;
    clearInput(); closeOrders(); audio.setScene(paused ? 'paused' : 'mission');
    document.body.classList.remove('in-menu','orders-open','map-open','placing-order'); document.body.classList.add('online');
    $('menu').hidden = true; $('coopOverlay').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = !paused; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
    $('missionName').textContent = game.mission.title.toUpperCase();
    syncMapUI(); if (!paused) { audio.unlock(); audio.setEnabled(preferences.sound); } fit();
    if (!document.querySelector('dialog[open]')) (paused ? $('resume') : canvas).focus({preventScroll:true});
  }
  if (fresh || changedRole) {
    clearInput(); closeOrders(); placingOrder = false; showMap = false; syncMapUI(); updateOrders();
    if (changedRole) toast(state.role === 'leader' ? 'You now lead the squad.' : 'You now play as Mercer, the grenadier.');
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
  $('coopMission').addEventListener('change',event=>{ const mission=Number(event.target.value); runCoopAction(()=>coop.configure({mission})); });
  $('coopDifficulty').addEventListener('change',event=>{ const difficulty=event.target.value; runCoopAction(()=>coop.configure({difficulty})); });
  const invite = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  const hasInvite = /^[A-Z0-9]{6}$/.test(invite);
  if (url && coop.session && (!hasInvite || coop.session.code === invite)) {
    $('coopOverlay').hidden=false; $('coopConnectForm').hidden=true; $('coopLobby').hidden=true;
    $('coopTitle').textContent='Rejoining your squad.'; $('coopDescription').textContent='Recovering your room and player position.';
    coop.resume().catch(()=>{
      if ($('coopOverlay').hidden) return;
      coopDialogMode='create'; $('coopConnectForm').hidden=false; $('coopConnect').textContent='CREATE SQUAD'; $('coopName').value=preferences.callsign||'Player';
      $('coopTitle').textContent='Start a fresh squad.'; $('coopDescription').textContent='The previous room could not be recovered. You can create another squad here.';
      $('coopCodeLabel').hidden=true; $('coopCode').required=false;
      $('coopConnectBrief').textContent=`${MISSIONS[selectedMission].title} · ${preferences.difficulty}`;
    });
  } else if (hasInvite) openCoop('join',invite);
}

function renderView(now) {
  const followActorId = game?.coop && player()?.alive === false ? game.squad.find(s => s.alive && !s.downed)?.id : null;
  const aimActive = !touch && pointer.valid && canAct() && !document.querySelector('dialog[open]');
  flag(document.body, 'desktop-aim', aimActive);
  return { time: now / 1000, menu: mode === 'menu', paused, pointer: aimActive ? pointer : null, showMap, placingOrder,
    observing: observing && player()?.role === 'grenadier' && canAct(), quickOrder: quickOrder?.until > now ? { point: quickOrder.point, active: true } : null,
    guidance: preferences.guidance, reducedMotion: preferences.reducedMotion, bloodEffects: preferences.bloodEffects, touch: touch && mode !== 'menu', safeInsets, desktopObstacles, aim: touchAim, followActorId,
    quality: preferences.graphicsQuality, zoom: touch ? preferences.mobileCameraZoom : preferences.cameraZoom, lookahead: preferences.cameraLookahead,
    crosshair: preferences.crosshairStyle, crosshairScale: preferences.crosshairScale, aimColor: preferences.aimColor, aimLine: preferences.aimLine };
}
function updatePerformance(now) {
  if (now - statsAt < 500) return;
  statsAt = now;
  if (!preferences.showFPS) return;
  const stats = frameMeter.sample();
  const label = stats.samples > 2 ? `${Math.round(stats.fps)} FPS · ${stats.frameMS.toFixed(1)} ms · p95 ${stats.p95.toFixed(1)} ms` : 'Measuring frame rate…';
  text('performanceStats', `${label} · Canvas 2D · ${canvas.width} × ${canvas.height}`);
  $('performanceStats').dataset.report = JSON.stringify({ ...stats, backend: 'Canvas 2D', width: renderer.width, height: renderer.height, bufferWidth: canvas.width, bufferHeight: canvas.height, quality: preferences.graphicsQuality, mode, paused, mission: game?.missionIndex ?? null });
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const blocked = paused || !!document.querySelector('dialog[open]');
  const audioScene = mode === 'menu' ? 'menu' : mode === 'playing' && !blocked && (!online() || coop.connected) ? 'mission' : 'paused';
  if (audio.scene !== audioScene) audio.setScene(audioScene);
  const cap = mode === 'playing' && !blocked ? preferences.frameLimit : 30;
  const dt = framePacer.next(now, cap);
  if (dt === null) return;
  const began = performance.now();
  const timingMode = `${mode}:${blocked}:${game?.missionIndex}:${preferences.graphicsQuality}:${canvas.width}:${canvas.height}`;
  if (statsMode !== timingMode) { frameMeter.reset(); statsMode = timingMode; statsAt = -Infinity; }
  const view = renderView(now);
  // Input and drawing share exactly one camera transform for this frame.
  renderer.updateCamera(game || menuScene, view);
  if (game?.coop && mode === 'playing') {
    coop.input(!blocked ? controls() : neutralInput());
    game = coop.getState(dt) || game;
    actions.reload = false; actions.smoke = false; actions.grenade = false;
    if (!blocked && coop.connected) audio.tick(game, dt);
    hudTimer += dt;
    if (hudTimer >= .1) { updateHUD(); hudTimer %= .1; }
    if (game.status !== 'playing') finishMission();
  } else if (game && mode === 'playing' && !blocked) {
    accumulator += dt;
    const input = controls();
    let count = 0;
    while (accumulator >= 1 / 60 && count++ < 6) {
      const controlledBefore = game.playerId;
      step(game, input, 1 / 60);
      if (game.playerId !== controlledBefore) {
        clearInput(); Object.assign(input, neutralInput()); closeOrders(); placingOrder = false; showMap = false; quickOrder = null;
        syncMapUI(); updateOrders(); updateHUD();
        toast(`${player().name} selected · ${roleProfile(player()).label}`);
      }
      input.reload = false; input.smoke = false; input.grenade = false; actions.reload = false; actions.smoke = false; actions.grenade = false;
      accumulator -= 1 / 60;
      if (game.status !== 'playing') { finishMission(); break; }
    }
    if (mode === 'playing') audio.tick(game, dt);
    hudTimer += dt;
    if (hudTimer >= .1) { updateHUD(); hudTimer %= .1; }
  }
  renderer.render(game || menuScene, { ...view, aim: touchAim, cameraPrepared: true });
  frameMeter.record(now, performance.now() - began);
  updatePerformance(now);
}

chooseRole(preferences.role); applySettings(); missionMenu(); audio.setScene('menu');
initializeCoop();
for (const id of ['deploy','coopCreate','coopJoinOpen']) $(id).disabled = false;
requestAnimationFrame(frame);
