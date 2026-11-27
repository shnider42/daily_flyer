import { MISSIONS, createGame, step, issueOrder, placePing, requestFieldSupport, getFieldSupportStatus, requestArmorOrder, selectSquadMember, getObjective, hasLineOfSight, chooseStoryOption, getStoryInteraction, getStoryLeaderId, getMissionInteraction, getNextCampaignMission, campaignOutcome, normalizeCampaignCarry } from './sim.mjs';
import { Renderer } from './renderer.mjs';
import { GameAudio } from './audio.mjs';
import { stickVector, touchIntent, touchFireThresholds, TOUCH_AIM_DEAD_ZONE, GroundOrderTap, ThrowableDrag, touchGroundAction, thumbOrigin, thumbDisplayOrigin } from './touch-input.mjs?v=1.20.0';
import { touchControlLayout } from './touch-layout.mjs?v=1.20.0';
import { CoopClient } from './coop-client.mjs';
import { coopServerURL } from './network-config.mjs';
import { clientToCanvasPoint } from './desktop-input.mjs';
import { createDefaults, normalizePreferences, renderDensity } from './settings.mjs';
import { FramePacer, FrameMeter } from './performance.mjs';
import { buildingAt } from './building-geometry.mjs';
import { roleProfile, SQUAD_ROLES, DEFAULT_SQUAD_ROLES, normalizeSquadRoles, canObserve, observationBlocksFire, isSquadCommander } from './squad-roles.mjs';
import { HAND_GRENADES, flashIntensity } from './hand-grenades.mjs';
import { eventToken, bindingLabel, actionLabel, actionsForToken, actionHeld } from './control-bindings.mjs';
import { ControlsEditor } from './controls-editor.mjs';
import { GuidanceSession, guidanceDescription, explainObjective, contextualGuidance } from './guidance.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const renderer = new Renderer(canvas);
const audio = new GameAudio();
const STORAGE = 'dfe-chalk-v1';
const OPERATION_STORAGE = 'dfe-chalk-operation-v1';
const GUIDANCE_STORAGE = 'dfe-chalk-guidance-v1';
const defaults = createDefaults({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
let preferences = normalizePreferences({}, defaults);
try { preferences = normalizePreferences(JSON.parse(localStorage.getItem(STORAGE) || '{}'), defaults); } catch { /* Gameplay works when storage is unavailable. */ }
let savedGuidance = {};
try { savedGuidance = JSON.parse(localStorage.getItem(GUIDANCE_STORAGE) || '{}'); } catch {}
const guidanceSession = new GuidanceSession(savedGuidance);
let savedGuidanceKey = JSON.stringify(guidanceSession.snapshot());
let tutorialRequested = false;
let tutorialManual = false;
let controlsEditor;
const framePacer = new FramePacer();
const frameMeter = new FrameMeter();

const touchQuery = matchMedia('(pointer: coarse)');
let touch = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0);
const squadRosterHome = $('squadRoster').parentElement;
let selectedMission = 0;
let operationPlan = null;
let missionCarry = null;
try {
  const saved = JSON.parse(localStorage.getItem(OPERATION_STORAGE) || 'null');
  if (saved && Number.isInteger(saved.nextMission) && saved.nextMission > 0 && saved.nextMission < MISSIONS.length && saved.carry && typeof saved.carry === 'object') {
    const carry = normalizeCampaignCarry(saved.carry);
    if (carry && getNextCampaignMission(carry.fromMission) === saved.nextMission) { operationPlan = { nextMission: saved.nextMission, carry }; selectedMission = saved.nextMission; }
  }
} catch { /* A fresh mission remains available without saved operation data. */ }
let game = null;
let menuScene = createGame({ mission: 1, role: 'leader', difficulty: 'story', seed: 19931003 });
let mode = 'menu';
let paused = false;
let showMap = false;
let placingOrder = false;
let placingPing = false;
let supportRequest = null;
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
let gearOpen = false;
let objectiveExpanded = false;
let observing = false;
let quickOrder = null;
let storyDecisionId = '';
let storyCardOpen = false;
let storyRenderKey = '';
const groundOrderTap = new GroundOrderTap();
const throwableDrag = new ThrowableDrag();
const throwableTypes = ['frag', 'flashbang', 'smoke'];
const throwableLabels = { frag: 'Frag', flashbang: 'Flash', smoke: 'Smoke' };
let selectedThrowable = 'frag';
let dragThrowable = 'frag';
let throwAim = null;
let coop = null;
let onlineEpoch = null;
let onlineRole = null;
let onlineConnection = 'idle';
let coopDialogMode = 'create';
let coopBusy = false;
let coopCommandEpoch = null;
let soldierSelectionPending = false;
let soldierSelectionCheck = null;
let lastRoomRoster = '';
const neutralInput = () => ({ moveX:0,moveY:0,aimX:null,aimY:null,fire:false,interact:false,reload:false,smoke:false,grenade:false,frag:false,flashbang:false,observe:false,sprint:false });
const online = () => !!coop?.active || !!game?.coop;
const keys = new Set();
const pointer = { x: 0, y: 0, valid: false, fire: false };
let desktopPointerId = null;
const touchInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimStrength: 0, wasFiring: false, interact: false };
const actions = { reload: false, smoke: false, grenade: false, frag: false, flashbang: false };
const activeSticks = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const player = () => game?.squad.find(s => s.id === game.playerId);
const held = action => actionHeld(action, keys, preferences.keyBindings);
const bind = action => { const token = preferences.keyBindings[action]?.find(Boolean); return token ? bindingLabel(token) : action === 'pause' ? 'Esc' : 'Unbound'; };
const orderConfirmButton = () => [0, 2, 1].find(button => !actionsForToken(`Mouse${button}`, preferences.keyBindings).includes('ping'));
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function save() { try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch { /* Gameplay works without persistent storage. */ } }
function saveOperation() { try { if (operationPlan) localStorage.setItem(OPERATION_STORAGE, JSON.stringify(operationPlan)); else localStorage.removeItem(OPERATION_STORAGE); } catch { /* Continue works for this session even without storage. */ } }
function text(id, value) { const node = typeof id === 'string' ? $(id) : id, content = String(value ?? ''); if (node && node.textContent !== content) node.textContent = content; }
function attr(node, name, value) { value = String(value); if (node.getAttribute(name) !== value) node.setAttribute(name, value); }
function style(node, name, value) { if (node.style[name] !== value) node.style[name] = value; }
function flag(node, name, enabled) { if (node.classList.contains(name) !== !!enabled) node.classList.toggle(name, !!enabled); }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3400); }
function syncTouchLayout(rect) {
  if (!touch) return 'desktop';
  const padding = getComputedStyle($('touchControls'));
  const landscape = rect.width > rect.height && rect.height <= 600;
  const layout = touchControlLayout({ width: rect.width, height: rect.height,
    moveScale: preferences.touchMoveSize, aimScale: preferences.touchAimSize, landscape,
    left: parseFloat(padding.paddingLeft) || 8, right: parseFloat(padding.paddingRight) || 8,
    bottom: parseFloat(padding.paddingBottom) || 14 });
  const values = {
    '--move-stick-size': layout.move.size, '--aim-stick-size': layout.aim.size,
    '--move-knob-size': layout.move.knob, '--aim-knob-size': layout.aim.knob,
    '--move-pad-width': layout.move.padWidth, '--move-pad-height': layout.move.padHeight,
    '--aim-pad-width': layout.aim.padWidth, '--aim-pad-height': layout.aim.padHeight,
    '--move-pad-left': layout.move.left, '--aim-pad-right': layout.aim.right, '--stick-bottom': layout.move.bottom,
    '--dock-left': layout.dock.left, '--dock-bottom': layout.dock.bottom, '--dock-width': layout.dock.width,
    '--move-actions-left': layout.moveActions.left, '--move-actions-bottom': layout.moveActions.bottom,
    '--aim-status-right': layout.aimStatus.right, '--aim-status-bottom': layout.aimStatus.bottom,
    '--assist-left': layout.assist.left, '--assist-bottom': layout.assist.bottom, '--assist-width': layout.assist.width,
    '--tray-left': layout.tray.left, '--tray-width': layout.tray.width, '--tray-bottom': layout.tray.bottom,
    '--tray-max-height': layout.tray.maxHeight, '--resolved-control-height': layout.controlHeight,
    '--mobile-stick-height': Math.max(layout.move.padHeight, layout.aim.padHeight), '--touch-height': layout.controlHeight,
  };
  for (const [key, value] of Object.entries(values)) {
    const px = `${value}px`;
    if (document.body.style.getPropertyValue(key) !== px) document.body.style.setProperty(key, px);
  }
  return JSON.stringify(values);
}
function syncSquadRoster() {
  const host = touch ? $('touchSquadRosterHost') : squadRosterHome;
  if ($('squadRoster').parentElement !== host) host.appendChild($('squadRoster'));
}
function fit() {
  document.body.classList.toggle('touch', touch && mode !== 'menu');
  syncSquadRoster();
  const rect = $('battlefield').getBoundingClientRect();
  const size = `${Math.round(rect.width)}:${Math.round(rect.height)}:${touch}:${syncTouchLayout(rect)}`;
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
  const topbarBounds = document.querySelector('.topbar').getBoundingClientRect();
  const nextStoryTop = `${Math.round((touch ? objectiveBounds.bottom : topbarBounds.bottom) - (canvasRect?.top || 0) + 16)}px`;
  if ($('hud').style.getPropertyValue('--story-top') !== nextStoryTop) $('hud').style.setProperty('--story-top', nextStoryTop);
  if (!touch || mode === 'menu') {
    safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const next = [];
    if (!touch && mode === 'playing' && !$('hud').hidden) {
      const origin = canvasRect || { left: 0, top: 0 };
      const orderBounds = document.querySelector('.orders').getBoundingClientRect();
      const weaponBounds = document.querySelector('.weapon-panel').getBoundingClientRect();
      style($('storyCard'), 'maxHeight', `${Math.max(120, Math.min(380, weaponBounds.top - topbarBounds.bottom - 80))}px`);
      const stack = document.querySelector('.squad-status-stack');
      // Text can grow with guidance, bindings and the size slider. Anchor these
      // panels to their actual edges instead of assuming a fixed line count.
      if (orderBounds.height && !showMap) style(stack, 'bottom', `${Math.max(0, renderer.height - (orderBounds.top - origin.top) + 12)}px`);
      const stackBounds = stack.getBoundingClientRect();
      const gapLeft = Math.max(orderBounds.right, stackBounds.right) + 16;
      const gapRight = weaponBounds.left - 16;
      const hint = $('contextHint');
      if (gapRight - gapLeft >= 190) {
        style(hint, 'left', `${(gapLeft + gapRight) / 2 - origin.left}px`);
        style(hint, 'maxWidth', `${Math.min(450, gapRight-gapLeft)}px`);
      } else { style(hint, 'left', '50%'); style(hint, 'maxWidth', '280px'); }
      for (const selector of ['.topbar', '.objective-panel', '.story-radio', '.squad-status-stack', '.orders', '.weapon-panel', '.guidance-coach', '.context-hint']) {
        const el = document.querySelector(selector), r = el.getBoundingClientRect();
        if (r.width && r.height) next.push({ left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top });
      }
    }
    const key = JSON.stringify(next);
    if (key !== desktopObstacleKey) { desktopObstacleKey = key; desktopObstacles = next; }
    return;
  }
  desktopObstacles = []; desktopObstacleKey = '';
  // Desktop's measured inline position must not override the touch stylesheet
  // after switching controls on a convertible device or in Settings.
  style($('contextHint'), 'left', ''); style($('contextHint'), 'maxWidth', '');
  const rect = canvas.getBoundingClientRect();
  const controlsRect = $('touchControls').getBoundingClientRect();
  const topElements = showMap ? [document.querySelector('.topbar'), ...(placingOrder || placingPing ? [$('orderHint'), $('cancelOrder')] : [])] : [document.querySelector('.topbar'), document.querySelector('.objective-panel'), $('storyRadio'), $('radio')];
  const top = Math.max(...topElements.map(el => el?.getBoundingClientRect().bottom || rect.top)) - rect.top + 10;
  const hintRect = $('contextHint').getBoundingClientRect();
  const controlsTop = hintRect.width && hintRect.height ? Math.min(controlsRect.top, hintRect.top) : controlsRect.top;
  safeInsets = { top: Math.min(rect.height * .43, top), right: 20, bottom: showMap ? 58 : Math.min(rect.height * .43, rect.bottom - controlsTop + 10), left: 20 };
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
  audio.setLevels({ master: preferences.masterVolume, effects: preferences.effectsVolume, ambience: preferences.ambienceVolume, distress: preferences.distressVolume, reflections: preferences.reflectionsVolume, squad: preferences.squadVoiceVolume, ringing: preferences.flashRingingVolume });
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
    if (field.type === 'range') text(`${field.id}Value`, field.id === 'cameraLookahead' && !Number(value) ? 'Off' : `${Math.round(Number(value) * 100)}%${field.id === 'fogDensity' && Number(value) === .25 ? ' · Original' : ''}`);
  }
  $('guidance').value = preferences.guidance;
  controlsEditor?.sync();
}
function applySettings(key) {
  if (!key || key === 'touchControls') {
    const next = preferences.touchControls ?? (touchQuery.matches || navigator.maxTouchPoints > 0);
    if (next !== touch) { clearInput(); closeOrders(); touch = next; }
    $('touchControls').hidden = !touch || mode === 'menu';
  }
  document.body.dataset.hudDetail = preferences.hudDetail;
  document.body.dataset.mobileHudDetail = preferences.mobileHudDetail;
  document.body.dataset.guidance = preferences.guidance;
  text('guidanceSummary', guidanceDescription(preferences.guidance));
  text('hudGuidance', `${preferences.guidance[0].toUpperCase() + preferences.guidance.slice(1)} help`);
  syncControlHints();
  document.documentElement.style.setProperty('--hud-scale', String(preferences.hudScale));
  document.documentElement.style.setProperty('--mobile-hud-scale', String(preferences.mobileHudScale));
  const { start: fireThreshold } = touchFireThresholds(preferences.touchFireThreshold);
  $('aimStick').style.setProperty('--fire-threshold', String(fireThreshold));
  $('aimStick').style.setProperty('--fire-boundary-size', `${68 * (fireThreshold - TOUCH_AIM_DEAD_ZONE) / (1 - TOUCH_AIM_DEAD_ZONE)}%`);
  $('performanceStats').hidden = !preferences.showFPS;
  soundUI(); syncSettings(); renderLoadouts('solo', preferences.squadRoles, true);
  if (!key || ['graphicsQuality','renderScale','hudScale','hudDetail','mobileHudScale','mobileHudDetail','touchControls','touchMoveSize','touchAimSize','guidance'].includes(key)) fit();
  if (!key || ['graphicsQuality','renderScale','frameLimit'].includes(key)) { framePacer.reset(); frameMeter.reset(); }
  if (game) {
    if (['guidance','touchControls'].includes(key) && preferences.guidance === 'simple' && !touch && !guidanceSession.active) guidanceSession.start({ role: game.role });
    if (!key || ['guidance','keyBindings','touchControls'].includes(key)) updateOrders();
    updateHUD();
  }
}
function changeSetting(key, value) {
  if (['keyBindings','touchFireThreshold','touchMoveSize','touchAimSize'].includes(key)) { clearInput(); storyRenderKey = ''; }
  if (key === 'guidance') tutorialManual = false;
  preferences = normalizePreferences({ ...preferences, [key]: value }, defaults);
  applySettings(key); save();
}
function syncControlHints() {
  for (const node of document.querySelectorAll('[data-control]')) text(node, bind(node.dataset.control));
  const movement = ['moveUp','moveLeft','moveDown','moveRight'].map(bind).join(' ');
  text('desktopHint', `${movement} move · ${bind('fire')} fire · ${bind('interact')} help · ${bind('reload')} reload · ${bind('ping')} ping · ${bind('map')} map · ${bind('pause')} menu`);
  attr(canvas, 'aria-label', `Battlefield. Move with ${movement}. Aim with the mouse. Hold ${bind('fire')} to fire, ${bind('interact')} to help. ${bind('ping')} places a marker without moving the squad. Escape opens the mission menu.`);
  attr($('mapToggle'), 'title', `Map (${actionLabel('map', preferences.keyBindings)})`);
  attr($('pauseButton'), 'title', `Mission menu (${actionLabel('pause', preferences.keyBindings)})`);
  syncMapControlHints();
  text('soloSwitchHint', touch ? 'Tap an available soldier below, or open Squad / Radio during play to switch.' : 'Click a soldier below or on the battlefield HUD to take control. Each soldier also has a shortcut in Settings → Aim & controls.');
  controlsEditor?.sync();
}
function persistGuidance() {
  const value = JSON.stringify(guidanceSession.snapshot());
  if (value === savedGuidanceKey) return;
  savedGuidanceKey = value;
  try { localStorage.setItem(GUIDANCE_STORAGE, value); } catch {}
}
function startGuidance() {
  if (!game || touch) return;
  if (tutorialRequested) { guidanceSession.replay({ role: game.role }); tutorialManual = true; tutorialRequested = false; }
  else if (preferences.guidance === 'simple') guidanceSession.start({ role: game.role });
  updateGuidance(); measureSafeInsets();
}
function updateGuidance() {
  const visible = mode === 'playing' && !paused && !touch && !document.querySelector('dialog[open]') &&
    !game?.story?.activeDecision && preferences.guidance !== 'expert' && (preferences.guidance === 'simple' || tutorialManual);
  if (visible) guidanceSession.observe({ player: player(), showMap, canAct: canAct() });
  const card = visible ? guidanceSession.view({ bind, objective: game && getObjective(game), guidance: preferences.guidance }) : null;
  $('guidanceCoach').hidden = !card;
  flag(document.body, 'coaching', !!card);
  document.body.dataset.coachFocus = card?.focus || '';
  if (card) {
    attr($('guidanceCoach'), 'data-step', card.id);
    text('coachProgress', `GETTING STARTED · ${card.index} / ${card.total}`);
    text('coachTitle', card.title); text('coachBody', card.body); text('coachTask', card.task);
    $('coachBack').disabled = !card.canBack;
    text('coachNext', card.final ? 'Ready to go' : 'Skip step');
  }
  persistGuidance();
}
function recordGuidance(action, evidence) {
  if (mode !== 'playing' || touch || paused || $('guidanceCoach').hidden || preferences.guidance === 'expert' || preferences.guidance !== 'simple' && !tutorialManual) return;
  if (guidanceSession.record(action, evidence)) { updateGuidance(); measureSafeInsets(); }
}
function replayGuidance() {
  if (touch) { toast('The desktop introduction is available with touch controls switched off.'); return; }
  if (preferences.guidance === 'expert') changeSetting('guidance', 'simple');
  tutorialManual = true;
  if (game && mode === 'playing') {
    guidanceSession.replay({ role: game.role });
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    pause(false); updateGuidance(); measureSafeInsets();
  } else {
    tutorialRequested = true;
    toast('Introduction ready. Deploy to a mission to begin.');
  }
}
$('coachBack').addEventListener('click', () => { clearInput(); guidanceSession.back(); updateGuidance(); canvas.focus({preventScroll:true}); });
$('coachNext').addEventListener('click', () => { clearInput(); if (guidanceSession.step === 'objective') guidanceSession.complete(); else guidanceSession.skip(); updateGuidance(); measureSafeInsets(); canvas.focus({preventScroll:true}); });
$('coachDismiss').addEventListener('click', () => { clearInput(); guidanceSession.dismiss(); updateGuidance(); measureSafeInsets(); canvas.focus({preventScroll:true}); });
for (const id of ['helpReplayTutorial','settingsReplayTutorial']) $(id).addEventListener('click', replayGuidance);
$('hudGuidance').addEventListener('click', () => { openInfo('settingsDialog'); selectSettingsTab('interface'); });
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

function renderLoadouts(kind, values, editable) {
  const root = $(`${kind}Loadouts`), roles = normalizeSquadRoles(values);
  if (!root.children.length) {
    root.innerHTML = ['Hale', 'Mercer', 'Ames', 'Webb'].map((name, i) => `<label class="loadout-row" for="${kind}Loadout${i}"><span>${name}${i === 0 ? '<small>Squad commander</small>' : ''}</span><select id="${kind}Loadout${i}" data-loadout="${i}" aria-describedby="${kind}LoadoutHelp${i}">${Object.entries(SQUAD_ROLES).map(([id, profile]) => `<option value="${id}">${escape(profile.label)}</option>`).join('')}</select><small id="${kind}LoadoutHelp${i}" class="loadout-help"></small></label>`).join('');
  }
  roles.forEach((role, i) => {
    const profile = roleProfile(role), select = $(`${kind}Loadout${i}`);
    select.value = role; select.disabled = !editable;
    text(`${kind}LoadoutHelp${i}`, `${profile.advantage} ${profile.tradeoff}`);
  });
  if (kind === 'solo') text('loadoutSummary', roles.every((role, i) => role === DEFAULT_SQUAD_ROLES[i]) ? 'Balanced squad' : 'Custom squad');
}
$('soloLoadouts').addEventListener('change', event => {
  const slot = Number(event.target.dataset.loadout);
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) return;
  const roles = [...preferences.squadRoles]; roles[slot] = event.target.value;
  preferences = normalizePreferences({ ...preferences, squadRoles: roles }, defaults);
  renderLoadouts('solo', preferences.squadRoles, true); save();
});
$('coopLoadouts').addEventListener('change', event => {
  const slot = Number(event.target.dataset.loadout);
  if (!coop?.isHost || coop.room?.status !== 'lobby' || !Number.isInteger(slot) || slot < 0 || slot > 3) return;
  const squadRoles = normalizeSquadRoles(coop.room.squadRoles); squadRoles[slot] = event.target.value;
  runCoopAction(() => coop.configure({ squadRoles }));
});
function missionMenu() {
  $('campaignCount').textContent = `${MISSIONS.filter(mission => preferences.completed[mission.id]).length} / ${MISSIONS.length} COMPLETE`;
  $('missionList').innerHTML = MISSIONS.map((mission, i) => `${mission.category === 'side' && MISSIONS[i-1]?.category !== 'side' ? '<p class="mission-group-label">STANDALONE FIELD OPERATIONS</p>' : ''}<button type="button" class="mission-choice ${i === selectedMission ? 'selected' : ''}" data-mission="${i}" aria-pressed="${i === selectedMission}" aria-label="${escape(mission.title)}${mission.category === 'side' ? ', standalone operation' : ', campaign chapter '+(i+1)}${preferences.completed[mission.id] ? ', completed' : ''}"><span class="mission-number">${String(i + 1).padStart(2,'0')}</span><span class="mission-name">${escape(mission.title)}</span>${preferences.completed[mission.id] ? '<span class="mission-completed" aria-label="Completed">✓</span>' : ''}</button>`).join('');
  const mission = MISSIONS[selectedMission];
  $('briefTime').textContent = mission.time || mission.subtitle;
  $('briefTitle').textContent = mission.title;
  $('briefDescription').textContent = mission.description;
  $('briefGoal').textContent = mission.goals?.[0] || mission.briefing?.[0] || '';
  text('briefCategory', mission.category === 'side' ? 'Standalone operation · Fictional scenario' : `Campaign chapter ${selectedMission + 1} of 4`);
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
  const capturedDesktop = desktopPointerId;
  desktopPointerId = null;
  if (capturedDesktop !== null) { try { canvas.releasePointerCapture(capturedDesktop); } catch {} }
  document.body.classList.remove('desktop-aim');
  touchInput.moveX = 0; touchInput.moveY = 0; touchInput.aimX = 0; touchInput.aimY = 0; touchInput.aimStrength = 0; touchInput.wasFiring = false; touchInput.interact = false; touchAim = null;
  actions.reload = false; actions.smoke = false; actions.grenade = false; actions.frag = false; actions.flashbang = false; throwAim = null; observing = false;
  const throwPointer = throwableDrag.pending?.id;
  throwableDrag.cancel();
  if (throwPointer !== undefined) { try { $('touchThrow').releasePointerCapture(throwPointer); } catch {} }
  $('touchThrow').classList.remove('working'); document.body.classList.remove('throwing');
  const tapId = groundOrderTap.pending?.id;
  groundOrderTap.cancel();
  if (tapId !== undefined) { try { canvas.releasePointerCapture(tapId); } catch {} }
  for (const [id, record] of [...activeSticks]) { try { record.element.releasePointerCapture(id); } catch {} }
  activeSticks.clear();
  if (interactionPointer !== null) { try { $('touchInteract').releasePointerCapture(interactionPointer); } catch {} interactionPointer = null; }
  document.querySelectorAll('.stick-knob').forEach(knob => knob.style.transform = 'translate(0, 0)');
  document.querySelectorAll('.joystick').forEach(el => { el.classList.remove('active', 'aiming', 'firing', 'sprinting'); el.style.removeProperty('--stick-origin-x'); el.style.removeProperty('--stick-origin-y'); });
  text('aimStickLabel', 'AIM / FIRE');
  $('touchInteract').classList.remove('working');
  if (online()) coop.clearInput();
}
function startMission(index = selectedMission, { restart = false, fresh = false } = {}) {
  if (online()) coop.leave();
  onlineEpoch = null; onlineRole = null; document.body.classList.remove('online'); $('coopBadge').hidden = true;
  selectedMission = clamp(index, 0, MISSIONS.length - 1);
  missionCarry = restart ? missionCarry : !fresh && operationPlan?.nextMission === selectedMission ? normalizeCampaignCarry(operationPlan.carry) : null;
  game = createGame({ mission: selectedMission, role: preferences.role, squadRoles: preferences.squadRoles, difficulty: preferences.difficulty, seed: Date.now() >>> 0, campaign: missionCarry });
  resetStoryUI();
  mode = 'playing'; paused = false; accumulator = 0; showMap = false; placingOrder = false; placingPing = false; lastRadio = ''; hudTimer = 0;
  clearInput();
  document.body.classList.remove('in-menu', 'orders-open', 'gear-open', 'map-open', 'placing-order', 'placing-ping', 'objective-expanded');
  objectiveExpanded = false; syncObjectiveDetails();
  $('menu').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
  $('mapLegend').hidden = true; $('orderHint').hidden = true;
  $('missionName').textContent = game.mission.title.toUpperCase();
  updateOrders(); audio.setScene('mission'); audio.unlock(); audio.setEnabled(preferences.sound); fit(); updateHUD();
  canvas.focus({ preventScroll: true });
  syncMapUI(); closeOrders();
  clearTimeout(toastTimer); $('toast').hidden = true;
  startGuidance();
  if (touch && preferences.guidance === 'simple') toast(`${game.role === 'leader' ? 'Tap ground to move the squad.' : 'Stay near Hale.'} Light drag: aim. Outer ring: fire.`);
}
function returnToMenu() {
  if (online()) coop.leave();
  coopCommandEpoch = null;
  onlineEpoch = null; onlineRole = null; $('coopOverlay').hidden = true; $('coopBadge').hidden = true;
  mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; placingPing = false; clearInput(); audio.setScene('menu');
  resetStoryUI();
  document.body.classList.add('in-menu'); document.body.classList.remove('orders-open', 'touch', 'map-open', 'placing-order', 'placing-ping', 'gear-open', 'objective-expanded', 'online');
  $('menu').hidden = false; $('hud').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true; $('touchControls').hidden = true;
  updateGuidance(); missionMenu(); fit(); $('deploy').focus({ preventScroll: true });
}
function pause(value = true) {
  if (mode !== 'playing') return;
  paused = value; accumulator = 0; clearInput(); closeOrders();
  $('pauseOverlay').hidden = !value;
  updatePauseUI(); updateGuidance();
  audio.setScene(value ? 'paused' : 'mission');
  if (value) { $('resume').focus(); } else { audio.unlock(); audio.setEnabled(preferences.sound); canvas.focus({ preventScroll: true }); }
}
function updateOrders() {
  const leader = game.role === 'leader';
  const leaderPeer = online() ? coop.room?.players.find(p => p.role === 'leader' && p.connected) : null;
  $('orderLabel').textContent = leader ? 'SQUAD ORDERS' : leaderPeer ? `REQUESTS TO ${leaderPeer.name.toUpperCase()}` : 'REQUESTS TO HALE';
  const items = leader ? [['move', 'moveOrder', 'Move', 'Send the squad to a point'], ['follow', 'regroup', 'Regroup', 'Bring the squad back to you'], ['hold', 'hold', 'Hold', 'Keep the squad here'], ['assist', 'assist', 'Assist', 'Help the wounded']] : [['ready', 'regroup', 'Ready', 'Tell Hale you can move'], ['wait', 'hold', 'Wait', 'Ask Hale to wait'], ['help', 'assist', 'Need help', 'Ask for help']];
  $('orderButtons').innerHTML = items.map(([type, action, label, detail]) => `<button data-order="${type}" title="${escape(detail)} (${escape(actionLabel(action, preferences.keyBindings))})"><span><kbd>${escape(bind(action))}</kbd>${label}</span><small class="order-explanation">${detail}</small></button>`).join('');
  ($('touchOrderLabel') || $('touchOrder')).textContent = leader ? 'Squad' : 'Radio';
  $('touchOrder').setAttribute('aria-label', leader ? 'Squad: soldiers, orders, support, and ping' : 'Radio: soldiers, requests, support, and ping');
  $('touchOrder').setAttribute('aria-controls', 'squadOrders');
  text('touchRegroupLabel', leader ? 'Regroup' : 'Ready');
  attr($('touchRegroup'), 'aria-label', leader ? 'Regroup: bring the squad back to you' : 'Ready: tell the leader you can move');
  syncControlHints();
}
function doOrder(type, point) {
  if (mode !== 'playing' || paused || soldierSelectionPending || !player()?.alive || player()?.downed || online() && !coop.connected) return;
  if (type === 'move' && !point) {
    if (game.role !== 'leader') return;
    clearInput(); closeOrders(); placingOrder = true; placingPing = false;
    syncMapUI();
    return;
  }
  const scene = game, epoch = onlineEpoch, actor = game.playerId, wasOnline = online();
  const accepted = () => {
    if (mode !== 'playing' || game?.playerId !== actor || (wasOnline ? !online() || onlineEpoch !== epoch : game !== scene)) return;
    recordGuidance('order', { accepted: true, order: type });
    if (placingOrder || showMap) clearInput();
    placingOrder = false; placingPing = false; closeOrders();
    if (touch && type === 'move') showMap = false;
    if (type === 'move' && point) quickOrder = { point: { ...point }, until: performance.now()+1050 };
    syncMapUI(); audio.click(); updateHUD();
  };
  if (wasOnline) coop.order(type, point).then(accepted).catch(() => {});
  else if (issueOrder(game, type, point)) accepted();
}
function closeGear() {
  gearOpen = false; document.body.classList.remove('gear-open', 'throwing'); $('touchGearTray').hidden = true;
  attr($('touchGear'), 'aria-expanded', false);
}
function closeOrders() { document.body.classList.remove('orders-open'); $('touchOrder').setAttribute('aria-expanded', 'false'); closeGear(); }
function syncObjectiveDetails() {
  flag(document.body, 'objective-expanded', objectiveExpanded);
  attr($('objectiveToggle'), 'aria-expanded', objectiveExpanded);
  attr($('objectiveToggle'), 'aria-label', objectiveExpanded ? 'Hide objective details' : 'Show objective details');
}
function beginTouchPing() {
  if (mode !== 'playing' || paused || !player()?.alive || player()?.downed || soldierSelectionPending || online() && !coop.connected) return;
  clearInput(); closeOrders(); placingOrder = false; placingPing = true; syncMapUI();
}
function fieldSupportState() { return online() ? game?.support : getFieldSupportStatus(game); }
function beginFieldSupport() {
  if (mode !== 'playing' || paused || supportRequest || !player()?.alive || player()?.downed || soldierSelectionPending || online() && !coop.connected) return;
  const support = fieldSupportState();
  if (!support?.available) { toast(support?.text || 'No relief team is available in this mission.'); return; }
  clearInput(); closeOrders(); placingPing = false; placingOrder = 'support'; showMap = true;
  syncMapUI(); canvas.focus({ preventScroll: true });
}
function requestSupportLocation(point) {
  if (mode !== 'playing' || paused || supportRequest || soldierSelectionPending || document.querySelector('dialog[open]') || !player()?.alive || player()?.downed || online() && !coop.connected || !point) return;
  const request = { scene: game, epoch: onlineEpoch, actor: game.playerId, online: online() };
  const current = () => mode === 'playing' && game?.playerId === request.actor && (request.online ? online() && onlineEpoch === request.epoch : game === request.scene);
  const accepted = () => {
    if (!current()) return;
    clearInput(); placingOrder = false; placingPing = false; closeOrders(); showMap = false;
    syncMapUI(); audio.click(); updateHUD(); toast('Support request accepted. Watch the radio for the relief report.');
  };
  if (request.online) {
    supportRequest = request;
    coop.requestSupport(point).then(accepted).catch(error => { if (current()) toast(error.message || 'Support could not reach that location.'); })
      .finally(() => { if (supportRequest === request) supportRequest = null; });
  } else if (requestFieldSupport(game, point, request.actor)) accepted();
  else toast(fieldSupportState()?.text || 'Support could not reach that location.');
}
function syncMapControlHints() {
  const support = placingOrder === 'support';
  text('orderHint', support ? (touch ? 'Tap a place for the relief team to cover.' : `${bindingLabel(`Mouse${orderConfirmButton()}`)}: choose a support location. Escape cancels.`) : touch ? (placingPing ? 'Tap a place to ping. Orders stay the same.' : 'Tap a destination for the squad.') : `${bindingLabel(`Mouse${orderConfirmButton()}`)}: choose a destination for the squad. ${bind('ping')} only pings. Escape cancels.`);
  text('mapInstructions', support ? (touch ? 'Tap to request support · Cancel: keep reserve' : 'Choose a support location · Escape: cancel') : touch ? (placingOrder ? 'Tap a destination · Map: close' : 'Tap to ping · Map: close') : `${bind('ping')}: ping · ${bind('map')}: close map`);
}
function syncMapUI() {
  document.body.classList.toggle('map-open', showMap);
  document.body.classList.toggle('placing-order', placingOrder);
  document.body.classList.toggle('placing-ping', placingPing);
  $('mapLegend').hidden = !showMap;
  $('orderHint').hidden = !placingOrder && !placingPing;
  syncMapControlHints();
  ($('mapToggleLabel') || $('mapToggle')).textContent = showMap ? 'Close' : 'Map';
  $('mapToggle').setAttribute('aria-pressed', String(showMap));
  $('mapToggle').setAttribute('aria-label', showMap ? 'Close battlefield map' : 'Toggle battlefield map');
  measureSafeInsets();
}
function toggleMap() {
  if (mode !== 'playing' || paused) return;
  clearInput(); closeOrders(); showMap = !showMap; placingOrder = false; placingPing = false; syncMapUI(); updateGuidance();
}
function cancelOrder() { clearInput(); placingOrder = false; placingPing = false; if (touch) showMap = false; syncMapUI(); }
function canAct() { return mode === 'playing' && !paused && !soldierSelectionPending && !document.querySelector('dialog[open]') && (!online() || coop.connected) && !showMap && !placingOrder && !placingPing && !document.body.classList.contains('orders-open') && player()?.alive && !player()?.downed; }

async function selectCoopSoldier(id) {
  if (!coop?.connected || soldierSelectionPending) return;
  const soldier = coop.room?.soldiers?.find(item => String(item.id) === String(id));
  if (!soldier || soldier.claimedBy === coop.session?.playerId) return;
  if (soldier.claimedBy) { toast('That soldier is already assigned to your squad mate. Choose a free soldier.'); return; }
  if (!soldier.alive || soldier.downed) { toast('Choose a soldier who can still move and fight.'); return; }
  if (!coop.game) { toast('Waiting for the squad state. Try again in a moment.'); return; }
  const origin = { code: coop.room.code, playerId: coop.session.playerId, epoch: coop.room.epoch,
    mission: coop.room.mission, status: coop.room.status, difficulty: coop.room.difficulty, seed: coop.game.seed };
  const sameContext = () => coop?.session?.playerId === origin.playerId && coop.room?.code === origin.code &&
    coop.room.mission === origin.mission && coop.room.status === origin.status && coop.room.difficulty === origin.difficulty;
  const sameState = state => state?.seed === origin.seed && state.missionIndex === origin.mission;
  let timer, check;
  const confirmed = new Promise((resolve, reject) => {
    check = (state = coop?.game) => {
      if (!sameContext() || !coop.connected || !sameState(state)) { reject(new Error('The squad changed before selection was confirmed.')); return; }
      if (coop.room.epoch > origin.epoch && coop.localPlayer?.actorId === soldier.id && state.playerId === soldier.id) resolve();
    };
    timer = setTimeout(() => reject(Object.assign(new Error('Soldier selection is taking too long. Check the squad cards or try again.'), { selectionNotice: true })), 6000);
    soldierSelectionCheck = check;
  });
  soldierSelectionPending = true; clearInput(); closeOrders();
  if (game) updateHUD();
  if (coop.room) renderCoopRoom(coop.room);
  try {
    // The command result precedes its snapshot. Both must arrive before controls
    // or the success message can refer to the newly selected soldier.
    await Promise.all([coop.selectSoldier(soldier.id), confirmed]);
    if (!sameContext() || !sameState(coop.game) || coop.localPlayer?.actorId !== soldier.id || coop.game.playerId !== soldier.id) return;
    if (mode === 'playing') { if (paused) pause(false); canvas.focus({ preventScroll: true }); }
    toast(`You control ${soldier.name}.`);
  } catch (error) {
    // Server and connection errors are already shown by the client's onError.
    if (error.selectionNotice && sameContext()) toast(error.message);
  }
  finally {
    clearTimeout(timer);
    if (soldierSelectionCheck === check) soldierSelectionCheck = null;
    if (sameContext()) clearInput();
    soldierSelectionPending = false;
    if (coop.room) renderCoopRoom(coop.room);
    if (game) updateHUD();
    if (paused) updatePauseUI();
  }
}
function switchSoldier(id) {
  if (mode !== 'playing' || !game) return;
  if (online()) { selectCoopSoldier(id); return; }
  const next = game.squad.find(soldier => String(soldier.id) === String(id));
  if (!next || next.id === game.playerId || !selectSquadMember(game, next.id)) return;
  clearInput(); closeOrders(); placingOrder = false; placingPing = false; showMap = false; quickOrder = null;
  chooseRole(game.role); syncMapUI(); updateOrders(); updateHUD(); updatePauseUI();
  if (paused) pause(false); else canvas.focus({ preventScroll: true });
  // The selected card, equipment and radio line already identify the new soldier.
}
function toggleObservation() {
  if (!canAct() || !canObserve(player())) return;
  observing = !observing; pointer.fire = false;
  if (observing) actions.grenade = false;
  touchInput.wasFiring = false; updateTouchIntent();
  audio.click(); updateHUD();
}
function launchGrenade() {
  const p = player();
  if (canAct() && roleProfile(p).grenades > 0 && p.grenades > 0 && !(p.grenadeCooldown > 0) && !(p.reloadTimer > 0) && !observing) actions.grenade = true;
}

function throwableCount(p, type = selectedThrowable) { return p?.[type === 'smoke' ? 'smokes' : HAND_GRENADES[type]?.inventory] || 0; }
function canThrow(type = selectedThrowable) {
  const p = player();
  return canAct() && !observing && !touchInput.interact && !held('interact') && !(p?.reloadTimer > 0) &&
    (type === 'smoke' || !(p?.handThrowCooldown > 0)) && throwableCount(p, type) > 0;
}
function selectThrowable(type) {
  if (!canAct() || throwableDrag.pending) return;
  selectedThrowable = throwableTypes.includes(type) ? type : throwableTypes[(throwableTypes.indexOf(selectedThrowable) + 1) % throwableTypes.length];
  audio.click(); updateHUD();
}
function targetForThrow(vector, type = selectedThrowable) {
  const p = player(); if (!p || !vector) return null;
  const profile = HAND_GRENADES[type], range = profile ? profile.minimumRange + (profile.range - profile.minimumRange) * vector.strength : 145;
  return { x: p.x + vector.x * range, y: p.y + vector.y * range };
}
function throwSelected(type = selectedThrowable, aim = null) {
  if (!canThrow(type)) return;
  actions[type] = true; throwAim = aim; pointer.fire = false;
}

function assistAction() {
  const p = player(); if (!p || !p.alive || p.downed || !game) return null;
  const down = [...game.squad, ...(game.survivors || []).filter(s => s.stabilized), ...(game.allies || []).filter(s => s.visible && p.medkits > 0)].filter(s => s.alive && s.downed && s.id !== p.id && Math.hypot(s.x - p.x, s.y - p.y) < 70 && hasLineOfSight(game, p, s)).sort((a,b) => Math.hypot(a.x-p.x,a.y-p.y) - Math.hypot(b.x-p.x,b.y-p.y))[0];
  if (down) return { label: down.team === 'allied' ? 'Aid ally' : 'Revive', detail: `Hold to help ${down.name}`, progress: (down.reviveProgress || 0) / 4 };
  const objective = getObjective(game), distance = objective ? Math.hypot(p.x-objective.x,p.y-objective.y) : Infinity;
  if (objective?.kind === 'rescue' && distance < objective.radius && hasLineOfSight(game, p, objective)) return { label: 'Rescue', detail: 'Hold to stabilize the wounded', progress: objective.progress || 0 };
  if (objective?.kind === 'barricade' && distance < 85 && hasLineOfSight(game, p, objective)) return { label: 'Clear', detail: 'Hold to clear the route', progress: objective.progress || 0 };
  const missionAction = getMissionInteraction(game, p.id);
  if (missionAction && missionAction.available !== false) return missionAction;
  const fieldAction = getStoryInteraction(game, p.id);
  if (fieldAction) return { ...fieldAction, detail: `Hold to aid resident · ${fieldAction.detail.replace(/^Hold to use /, 'uses ')}` };
  if (p.hp < p.maxHp && p.medkits > 0 && !['rescue','barricade','repair'].includes(objective?.kind)) return { label: 'Bandage', detail: 'Hold to bandage yourself', progress: (p.bandageProgress || 0) / 3 };
  return null;
}
function resetStoryUI() {
  supportRequest = null;
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
  text('storyToggleHint', storyCardOpen ? 'CLOSE' : touch ? 'OPEN' : bind('radio'));
  attr($('storyToggle'), 'aria-expanded', storyCardOpen);
  attr($('storyToggle'), 'aria-label', `${storyCardOpen ? 'Close' : 'Open'} radio decision: ${decision.title}`);
  $('storyCard').hidden = !storyCardOpen;
  flag(document.body, 'story-open', available && storyCardOpen);
  const key = `${game.seed}:${decision.id}:${leader}:${touch}:${JSON.stringify(decision.options)}`;
  if (key !== storyRenderKey) {
    text('storyAuthority', leader ? 'YOUR CALL · MISSION CONTINUES' : 'YOUR RECOMMENDATION · THE LEADER DECIDES');
    text('storyTitle', decision.title); text('storyDetail', decision.detail);
    $('storyOptions').innerHTML = decision.options.map((option, i) => `<button type="button" data-story-option="${escape(option.id)}"><strong>${!touch ? `<kbd>${escape(bind(i === 0 ? 'reply1' : 'reply2'))}</kbd>` : ''}${escape(option.label)}</strong><span>${escape(option.available === false ? option.disabledReason || option.detail : option.detail)}</span></button>`).join('');
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
  const nextMission = getNextCampaignMission(game.missionIndex);
  if (online()) {
    runCoopAction(() => game.status === 'won' && nextMission !== null ? coop.continueOperation() : coop.returnToLobby());
    return;
  }
  if (game.status === 'won' && nextMission !== null) {
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
  if (id === 'helpDialog') syncControlHints();
  $(id).showModal();
}
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
  controlsEditor?.cancel(false);
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
  if (button.dataset.coopSoldier) selectCoopSoldier(button.dataset.coopSoldier);
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
$('storyToggle').addEventListener('click', () => { if (touch) { clearInput(); closeOrders(); } storyCardOpen = !storyCardOpen; updateStoryUI(); measureSafeInsets(); });
$('storyClose').addEventListener('click', () => { storyCardOpen = false; updateStoryUI(); if (!touch) canvas.focus({ preventScroll: true }); });
$('mapToggle').addEventListener('click', toggleMap);
$('touchOrder').addEventListener('click', () => {
  if (mode !== 'playing' || paused || showMap || placingOrder || placingPing) return;
  clearInput(); closeGear(); if (storyCardOpen) { storyCardOpen = false; updateStoryUI(); } const open = document.body.classList.toggle('orders-open'); $('touchOrder').setAttribute('aria-expanded', String(open));
  updateHUD();
});
$('touchRegroup').addEventListener('click', () => {
  if (mode !== 'playing' || paused || showMap || placingOrder || placingPing || document.querySelector('dialog[open]')) return;
  clearInput(); closeOrders(); doOrder(game.role === 'leader' ? 'follow' : 'ready');
});
$('orderClose')?.addEventListener('click', closeOrders);
$('touchGear').addEventListener('click', () => {
  if (mode !== 'playing' || paused || showMap || placingOrder || placingPing || !player()?.alive || player()?.downed) return;
  const next = !gearOpen, wasObserving = observing; if (storyCardOpen) { storyCardOpen = false; updateStoryUI(); } clearInput(); observing = wasObserving; closeOrders(); gearOpen = next;
  $('touchGearTray').hidden = !next; flag(document.body, 'gear-open', next); attr($('touchGear'), 'aria-expanded', next);
  updateHUD();
});
$('touchGearClose').addEventListener('click', () => { clearInput(); closeGear(); updateHUD(); });
$('touchPing').addEventListener('click', beginTouchPing);
$('fieldSupportButton').addEventListener('click', beginFieldSupport);
for (const [id, order] of [['armorHold', 'hold'], ['armorAdvance', 'advance']]) $(id).addEventListener('click', () => {
  if (mode !== 'playing' || paused || !player()?.alive || player()?.downed || online() && !coop.connected) return;
  clearInput(); closeOrders();
  if (online()) runCoopAction(() => coop.armorOrder(order));
  else if (!requestArmorOrder(game, order)) toast('Only the acting commander can order available armor.');
  updateHUD();
});
$('objectiveToggle').addEventListener('click', () => { objectiveExpanded = !objectiveExpanded; syncObjectiveDetails(); measureSafeInsets(); });
$('cancelOrder')?.addEventListener('click', cancelOrder);
$('touchReload').addEventListener('click', () => { if (canAct()) actions.reload = true; });
$('touchSmoke').addEventListener('click', () => selectThrowable());
document.querySelectorAll('button[data-throwable]').forEach(button => button.addEventListener('click', () => selectThrowable(button.dataset.throwable)));
$('touchThrow').addEventListener('pointerdown', event => {
  if (event.button > 0 || !canThrow() || !throwableDrag.begin(event.pointerId, event.clientX, event.clientY)) return;
  event.preventDefault(); event.stopPropagation(); dragThrowable = selectedThrowable; pointer.fire = false; groundOrderTap.cancel();
  $('touchThrow').setPointerCapture(event.pointerId); $('touchThrow').classList.add('working'); document.body.classList.add('throwing'); audio.unlock();
  text('touchThrowLabel', 'Drag');
});
$('touchThrow').addEventListener('pointermove', event => {
  if (throwableDrag.pending?.id !== event.pointerId) return;
  event.preventDefault(); throwableDrag.move(event.pointerId, event.clientX, event.clientY);
  text('touchThrowLabel', throwableDrag.vector() ? 'Release' : 'Drag');
});
$('touchThrow').addEventListener('pointerup', event => {
  if (throwableDrag.pending?.id !== event.pointerId) return;
  event.preventDefault(); event.stopPropagation();
  const vector = throwableDrag.end(event.pointerId, event.clientX, event.clientY);
  if (vector) { throwSelected(dragThrowable, targetForThrow(vector, dragThrowable)); closeGear(); }
  document.body.classList.remove('throwing'); $('touchThrow').classList.remove('working'); text('touchThrowLabel', 'Drag throw');
});
for (const type of ['pointercancel', 'lostpointercapture']) $('touchThrow').addEventListener(type, event => {
  if (throwableDrag.pending?.id !== event.pointerId) return;
  throwableDrag.cancel(event.pointerId); document.body.classList.remove('throwing'); $('touchThrow').classList.remove('working'); text('touchThrowLabel', 'Drag throw');
});
// Keyboard and assistive button activation uses the soldier's current aim.
$('touchThrow').addEventListener('click', event => { if (event.detail === 0) throwSelected(); });
$('touchObserve').addEventListener('click', () => { toggleObservation(); closeGear(); measureSafeInsets(); });
$('touchGrenade').addEventListener('click', () => { launchGrenade(); closeGear(); measureSafeInsets(); });
$('touchInteract').addEventListener('pointerdown', event => {
  if (!canAct() || !assistAction() || interactionPointer !== null) return;
  event.preventDefault(); interactionPointer = event.pointerId; touchInput.interact = true;
  $('touchInteract').setPointerCapture(event.pointerId); $('touchInteract').classList.add('working'); audio.unlock();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touchInteract').addEventListener(type, event => {
  if (interactionPointer !== event.pointerId) return;
  event.preventDefault(); interactionPointer = null; touchInput.interact = false; $('touchInteract').classList.remove('working');
});

function updateTouchIntent() {
  const intent = touchIntent({ ...touchInput, fireThreshold: preferences.touchFireThreshold, blocked: !canAct() });
  const scanning = observing && observationBlocksFire(player());
  const suppressFire = scanning || !!throwableDrag.pending || actions.frag || actions.flashbang || actions.smoke || touchInput.interact || held('interact');
  if (suppressFire) intent.firing = false;
  touchInput.wasFiring = intent.firing;
  flag($('aimStick'), 'aiming', intent.aiming && !intent.firing);
  flag($('aimStick'), 'firing', intent.firing);
  flag($('moveStick'), 'sprinting', intent.sprint && !suppressFire);
  text('aimStickLabel', scanning ? 'SCAN' : intent.firing ? 'FIRE' : intent.aiming ? 'AIM' : 'AIM / FIRE');
  return intent;
}
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
    updateTouchIntent();
  };
  element.addEventListener('pointerdown', event => {
    if (!canAct() || event.button > 0 || [...activeSticks.values()].some(record => record.kind === kind)) return;
    event.preventDefault(); pointer.fire = false; pointer.valid = false;
    const rect = element.getBoundingClientRect(), base = element.querySelector('.stick-base')?.getBoundingClientRect() || rect;
    const knob = element.querySelector('.stick-knob').getBoundingClientRect();
    const radius = Math.min(base.width, base.height) * .34;
    const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const origin = thumbOrigin(kind, event.clientX, event.clientY, cx, cy);
    // Account for the knob at full deflection as well as the resting circle.
    const footprint = { width: Math.max(base.width, radius * 2 + knob.width), height: Math.max(base.height, radius * 2 + knob.height) };
    const display = thumbDisplayOrigin(event.clientX, event.clientY, rect, footprint, canvasRect);
    if (!origin || !display) return;
    const { x, y } = origin;
    element.style.setProperty('--stick-origin-x',`${display.x-cx}px`); element.style.setProperty('--stick-origin-y',`${display.y-cy}px`);
    element.setPointerCapture(event.pointerId); element.classList.add('active');
    activeSticks.set(event.pointerId,{element,kind,x,y,radius,startX:event.clientX,startY:event.clientY,dragged:false});
    update(event); audio.unlock();
  });
  element.addEventListener('pointermove', event => { if (!activeSticks.has(event.pointerId)) return; event.preventDefault(); update(event); });
  const release = event => {
    const record = activeSticks.get(event.pointerId); if (!record || record.element !== element) return;
    activeSticks.delete(event.pointerId); touchInput[`${kind}X`] = 0; touchInput[`${kind}Y`] = 0;
    if (kind === 'aim') { touchInput.aimStrength = 0; touchInput.wasFiring = false; touchAim = null; }
    element.querySelector('.stick-knob').style.transform = 'translate(0,0)'; element.classList.remove('active','aiming','firing','sprinting');
    element.style.removeProperty('--stick-origin-x'); element.style.removeProperty('--stick-origin-y');
    updateTouchIntent();
  };
  element.addEventListener('pointerup', release); element.addEventListener('pointercancel', release); element.addEventListener('lostpointercapture', release);
}
bindStick($('moveStick'), 'move'); bindStick($('aimStick'), 'aim');

function screenPoint(event) { return clientToCanvasPoint(event.clientX, event.clientY, canvasRect, { width: renderer.width, height: renderer.height }); }
canvas.addEventListener('pointermove', event => {
  groundOrderTap.move(event.pointerId,event.clientX,event.clientY);
  const point = screenPoint(event); if (!point) return;
  pointer.x = point.x; pointer.y = point.y; pointer.valid = !touch && event.pointerType !== 'touch' && (point.inside || held('fire'));
  if (pointer.valid) recordGuidance('aim', { x: point.x, y: point.y, canAct: canAct() });
});
canvas.addEventListener('pointerleave', () => { if (!held('fire')) pointer.valid = false; });
function pingLocation(point) {
  if (mode !== 'playing' || paused || soldierSelectionPending || document.querySelector('dialog[open]') || !player()?.alive || player()?.downed || online() && !coop.connected || !point) return;
  const scene = game, epoch = onlineEpoch;
  const accepted = () => {
    if (game !== scene && (!online() || onlineEpoch !== epoch)) return;
    recordGuidance('ping', { accepted: true });
    toast(preferences.guidance === 'simple' ? 'Ping placed. Your squad keeps its current orders.' : 'Location pinged.');
    updateHUD();
  };
  if (online()) coop.ping(point).then(accepted).catch(error => toast(error.message || 'Ping could not be placed.'));
  else if (placePing(game, point)) accepted();
}
function dispatchControl(action) {
  if (action === 'fps') { changeSetting('showFPS', !preferences.showFPS); return; }
  if (mode !== 'playing') return;
  if (action === 'pause') {
    if (paused) { pause(false); return; }
    if (placingOrder || placingPing) { cancelOrder(); return; }
    if (showMap) { toggleMap(); return; }
    if (document.body.classList.contains('orders-open') || gearOpen) { clearInput(); closeOrders(); return; }
    if (storyCardOpen) { storyCardOpen = false; updateStoryUI(); canvas.focus({ preventScroll: true }); return; }
    pause(true); return;
  }
  if (paused) return;
  if (action === 'ping') { if (pointer.valid) pingLocation(renderer.screenToWorld(pointer.x, pointer.y)); else toast('Point at a location, then ping.'); return; }
  if (action === 'map') { toggleMap(); return; }
  if (action === 'radio' && game?.story?.activeDecision && !showMap && !placingOrder) { storyCardOpen = !storyCardOpen; updateStoryUI(); measureSafeInsets(); return; }
  if (['reply1', 'reply2'].includes(action) && storyCardOpen && game?.story?.activeDecision) { const option = game.story.activeDecision.options[action === 'reply1' ? 0 : 1]; if (option) selectStoryOption(option.id); return; }
  if (/^soldier[1-4]$/.test(action)) { const soldier = game.squad[Number(action.slice(-1))-1]; if (soldier) switchSoldier(soldier.id); return; }
  if (action === 'moveOrder' && game.role === 'leader') { doOrder('move', pointer.valid ? renderer.screenToWorld(pointer.x, pointer.y) : undefined); return; }
  if (action === 'regroup') { doOrder(game.role === 'leader' ? 'follow' : 'ready'); return; }
  if (action === 'hold') { doOrder(game.role === 'leader' ? 'hold' : 'wait'); return; }
  if (action === 'assist') { doOrder(game.role === 'leader' ? 'assist' : 'help'); return; }
  if (!canAct()) return;
  if (action === 'reload') actions.reload = true;
  if (action === 'smoke') actions.smoke = true;
  if (action === 'cycleThrowable') selectThrowable();
  if (action === 'throwThrowable') throwSelected();
  if (action === 'observe') toggleObservation();
  if (action === 'launcher') launchGrenade();
}
canvas.addEventListener('pointerdown', event => {
  const point = screenPoint(event); if (!point?.inside || mode !== 'playing' || paused || document.querySelector('dialog[open]')) return;
  pointer.x = point.x; pointer.y = point.y; pointer.valid = true;
  if (event.pointerType === 'touch') {
    // Ground taps are handled here; do not generate a second mouse action.
    event.preventDefault();
    pointer.valid = false;
    if (gearOpen) { clearInput(); closeGear(); return; }
    const action = touchGroundAction({ role: game.role, map: showMap, order: placingOrder, ping: placingPing, active: canAct() || showMap || placingOrder || placingPing });
    if (action && event.button <= 0 && groundOrderTap.begin(event.pointerId,event.clientX,event.clientY,event.timeStamp)) canvas.setPointerCapture(event.pointerId);
    return;
  }
  desktopPointerId = event.pointerId;
  // Keep position tracking when a held button leaves the canvas. Do not cancel
  // this pointerdown: desktop button changes are handled by mousedown below.
  if (canAct()) canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('mousedown', event => {
  if (event.sourceCapabilities?.firesTouchEvents) return;
  const point = screenPoint(event); if (!point?.inside || mode !== 'playing' || paused || document.querySelector('dialog[open]')) return;
  pointer.x = point.x; pointer.y = point.y; pointer.valid = true;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  const token = eventToken(event), mapped = actionsForToken(token, preferences.keyBindings);
  // A ping always wins over destination placement; it never becomes a move order.
  if (mapped.includes('ping')) { dispatchControl('ping'); return; }
  if (placingOrder && event.button === orderConfirmButton()) {
    const target = renderer.screenToWorld(point.x, point.y);
    if (placingOrder === 'support') requestSupportLocation(target); else doOrder('move', target);
    return;
  }
  if (!token) return;
  keys.add(token);
  pointer.fire = held('fire');
  for (const action of mapped) dispatchControl(action);
});
canvas.addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch') return;
  if (!groundOrderTap.end(event.pointerId,event.clientX,event.clientY,event.timeStamp) || paused) return;
  const action = touchGroundAction({ role: game?.role, map: showMap, order: placingOrder, ping: placingPing, active: canAct() || showMap || placingOrder || placingPing });
  const point = screenPoint(event);
  if (!point?.inside || !action) return;
  const target = renderer.screenToWorld(point.x, point.y);
  if (action === 'ping') { placingPing = false; syncMapUI(); pingLocation(target); }
  else if (action === 'support') requestSupportLocation(target);
  else doOrder('move', target);
});
// Mouse events describe every button transition. Pointer events only describe
// the first press and last release, which would miss a ping while firing.
window.addEventListener('mouseup', event => { keys.delete(`Mouse${event.button}`); pointer.fire = held('fire'); });
window.addEventListener('pointerup', event => { if (event.pointerId === desktopPointerId) desktopPointerId = null; });
for (const type of ['pointercancel','lostpointercapture']) canvas.addEventListener(type,event => {
  if (event.pointerType !== 'touch') {
    for (const key of [...keys]) if (key.startsWith('Mouse')) keys.delete(key);
    desktopPointerId = null; pointer.fire = held('fire');
  }
  groundOrderTap.cancel(event.pointerId);
});
for (const type of ['contextmenu', 'auxclick']) canvas.addEventListener(type, event => event.preventDefault());
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
  if (mode === 'playing' && event.code === 'Escape') { event.preventDefault(); if (!event.repeat) dispatchControl('pause'); return; }
  if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  if (event.target.closest?.('button') && ['Space','Enter'].includes(event.code)) return;
  const token = eventToken(event), mapped = actionsForToken(token, preferences.keyBindings);
  if (!mapped.length) return;
  if (mode !== 'playing' && !mapped.includes('fps')) return;
  event.preventDefault();
  if (!paused && mode === 'playing') keys.add(token);
  if (!event.repeat) for (const action of mapped) dispatchControl(action);
});
// Clear physical tokens even if a modifier changed while they were held.
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); if (mode === 'playing' && !paused) pause(); });
document.addEventListener('visibilitychange', () => { framePacer.reset(); frameMeter.reset(); if (document.hidden && mode === 'playing' && !paused) pause(); });

function controls() {
  const p = player();
  if (!canAct() && (activeSticks.size || touchInput.wasFiring || touchInput.interact)) clearInput();
  const intent = updateTouchIntent();
  if (!canAct()) { touchAim = null; return neutralInput(); }
  const observe = observing && canObserve(p);
  let moveX = (held('moveRight') ? 1 : 0) - (held('moveLeft') ? 1 : 0) + intent.moveX;
  let moveY = (held('moveDown') ? 1 : 0) - (held('moveUp') ? 1 : 0) + intent.moveY;
  let aim = pointer.valid && !showMap ? renderer.screenToWorld(pointer.x, pointer.y) : null;
  let fire = held('fire') && !showMap && !placingOrder;
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
  const throwing = actions.frag || actions.flashbang || actions.smoke;
  if (throwAim && throwing) aim = throwAim;
  if (observe && observationBlocksFire(p) || throwableDrag.pending || throwing) fire = false;
  touchAim = intent.aiming && aim ? { ...aim, firing: fire } : null;
  if (touchInput.interact && !assistAction()) { touchInput.interact = false; $('touchInteract').classList.remove('working'); }
  const interact = held('interact') || touchInput.interact;
  const sprint = !interact && !observe && !throwing && !throwableDrag.pending && (held('sprint') || intent.sprint);
  if (touch) flag($('moveStick'), 'sprinting', !!intent.sprint && !interact && !observe);
  const autoReload = preferences.autoReload && p?.ammo === 0 && p.reserve > 0 && p.reloadTimer <= 0;
  return { moveX, moveY, aimX: aim?.x ?? null, aimY: aim?.y ?? null, fire: fire && !interact, interact, reload: !throwing && (actions.reload || autoReload), smoke: actions.smoke, grenade: actions.grenade && !interact, frag: actions.frag && !interact, flashbang: actions.flashbang && !interact, observe, sprint };
}

function updateHUD() {
  if (!game) return;
  const p = player(), objective = getObjective(game), shared = online();
  const support = fieldSupportState();
  $('fieldSupport').hidden = !support?.enabled;
  $('fieldSupportButton').disabled = !support?.available || !!supportRequest || !p?.alive || p?.downed || shared && !coop.connected;
  text('fieldSupportStatus', support?.text || 'Relief reserve ready.');
  const armor = (game.vehicles || []).filter(v => v.team !== 'enemy' && v.armored && !v.wreck);
  $('armorSupport').hidden = !armor.length;
  const commandsArmor = mode === 'playing' && !paused && p?.alive && !p?.downed && !soldierSelectionPending && (!shared || coop.connected) && getStoryLeaderId(game) === p?.id;
  $('armorHold').disabled = !commandsArmor || armor.every(v => v.holdPosition);
  $('armorAdvance').disabled = !commandsArmor || armor.every(v => v.repairLocked || v.disabled);
  text('armorSupportStatus', armor.map(v => `${v.name}: ${v.repairLocked ? 'awaiting objective' : v.disabled ? 'needs repair' : v.holdPosition ? 'holding' : v.moving ? 'moving' : 'covering'} · ${Math.round(v.hp / v.maxHp * 100)}%`).join(' / '));
  attr($('fieldSupportButton'), 'aria-label', `Request support here. ${support?.text || ''}`);
  text('objectiveTitle', objective?.title || 'Stay with the squad');
  const objectiveDetail = objective?.detail || objective?.description || '';
  text('objectiveDetail', preferences.guidance === 'simple' ? objectiveDetail.replace(/the chalk/gi, 'the squad').replace(/Account for the squad/gi, 'Bring the squad together') : objectiveDetail);
  const carriedItems = (game.operation?.items || []).filter(item => item.status === 'carried');
  text('missionCargo', carriedItems.map(item => `${item.carrierId === game.playerId ? 'Carrying' : game.squad.find(soldier => soldier.id === item.carrierId)?.name || 'Squad'}: ${item.label}`).join(' · '));
  style($('objectiveProgress'), 'width', `${Math.round(clamp(Number(objective?.progress) || 0, 0, 1) * 100)}%`);
  text('stageNumber', `${preferences.guidance === 'expert' ? '' : 'Step '}${Math.min(game.stageIndex + 1, game.stageCount)}/${game.stageCount}`);
  text('missionClock', clock(game.time));
  text('leaderIntent', game.role === 'member' ? `HALE / ${game.leaderOrder || 'Stay together.'}` : game.order?.label || '');
  const rowKey = game.squad.map(s => s.id).join('|');
  if (rowKey !== squadRowsKey) {
    $('squad').innerHTML = game.squad.map(() => '<button type="button" class="squad-member"><strong></strong><small></small><em class="squad-owner"></em><span class="squad-health"><span></span></span></button>').join('');
    squadRows = [...$('squad').children].map(root => ({ root, name: root.querySelector('strong'), role: root.querySelector('small'), owner: root.querySelector('.squad-owner'), health: root.querySelector('.squad-health span') }));
    squadRowsKey = rowKey;
  }
  const peers = shared ? coop.room?.players || [] : [];
  game.squad.forEach((soldier, i) => {
    const row = squadRows[i], peer = peers.find(peer => peer.actorId === soldier.id), mine = soldier.id === game.playerId;
    const profile = roleProfile(soldier);
    flag(row.root, 'active', mine); flag(row.root, 'downed', soldier.downed || !soldier.alive);
    row.root.disabled = !soldier.alive || soldier.downed || shared && (!coop.connected || soldierSelectionPending || !!peer && !mine);
    attr(row.root, 'data-soldier', soldier.id); attr(row.root, 'aria-pressed', mine);
    const ownership = mine ? 'You' : peer ? `${peer.name}${peer.connected ? ' · Taken' : ' · Reconnecting'}` : touch ? 'Tap to switch' : `Select (${bind('soldier'+(i+1))})`;
    attr(row.root, 'data-human', !!peer?.connected); attr(row.root, 'title', `${soldier.name} · ${profile.label} · ${ownership}`);
    attr(row.root, 'aria-label', `${soldier.name}, ${profile.label}, ${ownership}${!soldier.alive ? ', lost' : soldier.downed ? ', down' : ''}`);
    text(row.name, soldier.name); text(row.owner, !soldier.alive ? 'Lost' : soldier.downed ? 'Needs help' : ownership);
    text(row.role, !soldier.alive ? 'LOST' : soldier.downed ? 'DOWN' : (preferences.guidance === 'simple' ? ({leader:'Leader',grenadier:'Grenades',medic:'Medic',support:'Machine gun'}[soldier.role] || profile.label) : profile.shortLabel) + (shared && !peer && preferences.guidance !== 'simple' ? ' · AI' : ''));
    style(row.health, 'width', `${Math.round(clamp(soldier.hp / soldier.maxHp, 0, 1) * 100)}%`);
  });
  if (p) {
    const profile = roleProfile(p), launcher = profile.grenades > 0;
    const usingOptics = canObserve(p) && observing, usingBinos = usingOptics && observationBlocksFire(p), scoped = profile.observationMode === 'scope';
    const health = clamp(Math.round(p.hp / p.maxHp * 100), 0, 100), reloading = p.reloadTimer > 0;
    text('playerName', p.name.toUpperCase()); text('healthText', `${preferences.guidance === 'simple' ? 'Health ' : ''}${health}%`); style($('healthBar'), 'width', `${health}%`);
    style($('healthBar'), 'background', health < 35 ? 'var(--danger)' : '');
    text('ammo', p.ammo ?? 0); text('reserve', preferences.guidance === 'expert' ? `/ ${p.reserve ?? 0}` : `${p.reserve ?? 0} spare`);
    text('ammoExplanation', preferences.guidance === 'simple' ? 'Large number: bullets ready to fire. Spare: bullets for the next reload.' : 'Loaded / spare ammunition');
    text('reloadLabel', reloading ? 'RELOADING' : p.ammo === 0 ? 'RELOAD' : '');
    text('smokeCount', `${touch ? '' : bind('smoke') + ' · '}SMOKE × ${p.smokes ?? 0}`);
    const throwableHelp = { frag: 'Explodes and can hurt anyone nearby.', flashbang: 'Briefly blinds people who can see the burst, including your squad.', smoke: 'Hides movement for a short time. It does not stop bullets.' };
    text('throwableExplanation', throwableHelp[selectedThrowable]);
    text('touchSmokeQty', throwableCount(p)); text('touchSmokeLabel', throwableLabels[selectedThrowable]);
    text('touchGearHint', `${throwableHelp[selectedThrowable]} Drag Throw to aim; release to throw. Drag back to cancel.`);
    attr($('touchSmoke'), 'aria-label', `${throwableLabels[selectedThrowable]}, ${throwableCount(p)} remaining. Tap to select another grenade type.`);
    attr($('touchThrow'), 'aria-label', `Throw ${throwableLabels[selectedThrowable].toLowerCase()}. Drag to aim, release to throw. Return to the button to cancel.`);
    $('touchThrow').disabled = !canThrow();
    if (!throwableDrag.pending) text('touchThrowLabel', p.handThrowCooldown > 0 && selectedThrowable !== 'smoke' ? 'Ready soon' : 'Drag throw');
    for (const button of document.querySelectorAll('button[data-throwable]')) {
      const type = button.dataset.throwable, count = throwableCount(p, type);
      text(button.querySelector('span'), count); attr(button, 'aria-pressed', selectedThrowable === type);
      attr(button, 'aria-label', `Select ${throwableLabels[type].toLowerCase()}, ${count} remaining`);
      button.disabled = !p.alive || p.downed; flag(button, 'empty', !count);
    }
    const flashed = flashIntensity(p, game.time);
    text('flashStatus', flashed > .05 ? 'VISION RECOVERING' : '');
    attr($('flashStatus'), 'data-strength', flashed.toFixed(2));
    text('weaponName', profile.weaponLabel);
    let specialty = launcher ? `${usingBinos ? 'BINOCULARS · ' : ''}40 mm × ${p.grenades ?? 0}${p.grenadeCooldown > 0 ? ' · Loading' : touch ? '' : ` · ${bind('observe')} scan / ${bind('launcher')} launch`}` : p.role === 'medic' ? `MEDIC · AID × ${p.medkits ?? 0}` : scoped ? `${usingOptics ? 'SCOPED' : touch ? 'GEAR → SCOPE' : `${bind('observe')} SCOPE`} · STEADY TO FIRE` : p.role === 'heavy' ? 'ARMORED ASSAULT · SLOW & PROTECTED' : p.role === 'support' ? 'SAW · SUSTAINED FIRE' : isSquadCommander(p) ? touch ? 'LEAD · TAP GROUND TO COMMAND' : `LEAD · ${bind('moveOrder')} TO COMMAND` : 'RIFLEMAN · FLEXIBLE SUPPORT';
    if (preferences.guidance === 'simple' && !touch) {
      specialty = launcher ? `${bind('observe')}: binoculars · ${bind('launcher')}: launcher (${p.grenades ?? 0} rounds)` : p.role === 'medic' ? `Aid kits: ${p.medkits ?? 0}. Hold ${bind('interact')} to help.` : scoped ? `${bind('observe')}: scope. Stand still for accurate shots; firing stays available.` : p.role === 'heavy' ? 'Extra bullet protection. Slow movement and reload; blasts bypass armor.' : p.role === 'support' ? `Machine gun: ${p.magSize}-round belt; slower reload.` : isSquadCommander(p) ? `${bind('moveOrder')} sends the squad to a point.` : 'Balanced carbine with extra ammunition and smoke.';
    }
    text('specialtyText', specialty);
    $('touchSpecialty').hidden = !canObserve(p) && !launcher;
    attr($('touchSpecialty'), 'aria-label', scoped ? 'Sniper scope' : 'Specialist equipment');
    $('touchGrenade').hidden = !launcher;
    text('touchGrenadeQty', p.grenades ?? 0); $('touchGrenade').disabled = !p.grenades || p.grenadeCooldown > 0 || reloading || usingBinos || !p.alive || p.downed;
    attr($('touchGrenade'), 'aria-label', `Launch 40 mm grenade toward your aim, ${p.grenades ?? 0} remaining${p.grenadeCooldown > 0 ? ', reloading' : ''}`);
    $('touchObserve').hidden = !canObserve(p); $('touchObserve').disabled = !p.alive || p.downed;
    attr($('touchObserve'), 'aria-pressed', usingOptics); attr($('touchObserve'), 'aria-label', `${usingOptics ? 'Lower' : 'Use'} ${scoped ? 'sniper scope' : 'binoculars'}`); text('touchObserveLabel', usingOptics ? 'Lower' : scoped ? 'Scope' : 'Binos');
    updateTouchIntent();
    attr($('aimStick'), 'aria-label', usingBinos ? 'Scan with binoculars thumbstick' : 'Aim thumbstick. Drag lightly to aim; cross the outer ring to fire.');
    flag(document.body, 'observing', usingOptics);
    for (const id of ['touchGear','touchPing','touchRegroup']) $(id).disabled = !p.alive || p.downed || soldierSelectionPending || shared && !coop.connected;
    // Soldier selection remains reachable when the current soldier is wounded.
    $('touchOrder').disabled = false;
    for (const button of $('orderButtons').querySelectorAll('button')) button.disabled = !p.alive || p.downed || soldierSelectionPending || shared && !coop.connected;
    text('touchReloadLabel', reloading ? 'Loading' : 'Reload');
    attr($('touchReload'), 'aria-label', reloading ? 'Reloading' : 'Reload weapon'); flag($('touchReload'), 'reloading', reloading);
    $('downedBanner').hidden = !p.downed && p.alive;
    text('downedTitle', p.alive ? 'YOU ARE DOWN' : 'SOLDIER LOST');
    const freeStandingSoldier = game.squad.some(s => s.id !== p.id && s.alive && !s.downed && (!shared || !peers.some(peer => peer.actorId === s.id)));
    text('downedDetail', freeStandingSoldier ? touch ? `Open ${game.role === 'leader' ? 'Squad' : 'Radio'} to choose a standing soldier.` : 'Click a free standing soldier above to take control.' : p.alive ? 'Your squad is coming to help. Stay with them.' : shared ? 'Your partner is still in the mission. Stay with the squad.' : 'Your squad could not recover you.');
    $('touchReload').disabled = !p.alive || p.downed || reloading || !p.reserve || p.ammo === p.magSize; $('touchSmoke').disabled = !p.alive || p.downed || !!throwableDrag.pending;
  }
  const assist = assistAction();
  $('touchInteract').disabled = !assist; flag($('touchInteract'), 'available', !!assist);
  const assistProgress = `${Math.round(clamp(assist?.progress || 0, 0, 1) * 100)}%`;
  if ($('touchInteract').style.getPropertyValue('--assist-progress') !== assistProgress) $('touchInteract').style.setProperty('--assist-progress', assistProgress);
  text('touchInteractLabel', assist?.label || 'Assist');
  attr($('touchInteract'), 'aria-label', assist?.detail || 'Assist — move near someone who needs help');
  const minimalGuidance = preferences.guidance === 'expert';
  const messages = game.radio.filter(m => game.time - m.time < (minimalGuidance ? 5 : touch ? 8 : 14)).slice(touch || minimalGuidance || preferences.hudDetail === 'compact' ? -1 : -2);
  const radioKey = messages.map(m => `${m.id}:${m.text}`).join('|');
  if (lastRadio !== radioKey) { $('radio').innerHTML = messages.map(m => `<div class="radio-line"><strong>${escape(m.speaker)}</strong>${escape(m.text)}</div>`).join(''); lastRadio = radioKey; }
  const interactionControl = touch ? `Hold ${(assist?.label || 'Assist').toUpperCase()}` : `Hold ${bind('interact')}`;
  const assistHint = assist ? `${interactionControl} to ${assist.detail.replace(/^Hold to /,'').replace(/[.]$/,'')}.` : '';
  const interactText = shared ? assistHint : typeof game.interactionPrompt === 'string' ? game.interactionPrompt : '';
  let hint = interactText || assistHint;
  if (!hint && p && objective?.interaction && Math.hypot(p.x - objective.x, p.y - objective.y) < (objective.radius || 60) + 20 && hasLineOfSight(game, p, objective)) hint = touch ? 'Hold ASSIST to work on the objective.' : `Hold ${bind('interact')} to work on the objective.`;
  if (!hint && !touch && preferences.guidance === 'simple' && game.time < 13) hint = game.role === 'leader' ? `Follow the amber marker. ${bind('moveOrder')} sends the squad there.` : 'Stay near Hale. He will lead you to the objective.';
  if (touch) hint = minimalGuidance ? '' : assist ? assist.detail : preferences.guidance === 'simple' && game.role === 'leader' && game.time < 8 ? 'Tap ground to move the squad · Regroup brings them back' : '';
  if (!hint && observing && !(touch && minimalGuidance)) hint = roleProfile(p).observationMode === 'scope' ? touch ? 'Scope · Aim with the right stick · Outer ring fires' : `Scope · Stand still for accuracy · ${bind('observe')} to lower` : touch ? 'Binoculars · Aim stick scans · Tap Lower to fight' : `Binoculars · Mouse to scan · ${bind('observe')} to lower`;
  const house = p ? buildingAt(game.world, p) : null;
  const scene = `${game.seed}:${game.missionIndex}:${game.playerId}`;
  if (interiorNotice.scene !== scene || interiorNotice.id !== (house?.id || '')) interiorNotice = { scene, id: house?.id || '', at: game.time };
  if (!hint && p?.alive && !p.downed && preferences.guidance !== 'expert' && !showMap && !placingOrder) {
    if (house && game.time - interiorNotice.at < 4) hint = 'Inside · Doorways stay exposed';
    else if (!house && game.world.buildings.some(b => b.enterable && b.doors?.some(d => Math.hypot(p.x - d.x, p.y - d.y) < 65))) hint = 'Open doorway · Walk inside';
  }
  attr($('hud'), 'data-building', house?.id || '');
  const coaching = contextualGuidance({ game, player: p, assist, objective, guidance: preferences.guidance, bind, observing, inside: !!house, touch });
  if (!touch && !showMap && !placingOrder && coaching) hint = `${coaching.title}. ${coaching.body}`;
  if (showMap || placingOrder || placingPing || gearOpen || document.body.classList.contains('orders-open')) hint = '';
  attr($('contextHint'), 'data-tone', coaching?.tone || 'info');
  text('objectiveExplanation', preferences.guidance === 'expert' ? '' : explainObjective(objective, { guidance: preferences.guidance, bind, role: game.role, touch }));
  text('squadExplanation', touch ? (shared ? 'Tap a free soldier to switch. Your partner’s soldier shows their name.' : 'Highlighted soldier: you. Tap another standing soldier to switch.') : shared ? 'Click any free soldier to take control. Your partner’s soldier is labelled with their name.' : 'Highlighted name: you. Click another standing soldier to control them.');
  updateGuidance();
  text('contextHint', hint); style($('desktopHint'), 'visibility', preferences.guidance === 'expert' ? 'hidden' : 'visible');
  updateStoryUI();
  for (const [key,value] of Object.entries({ stage: game.stageIndex, status: game.status, role: game.role, online: shared, room: shared ? coop.room?.code || '' : '', humans: shared ? game.humanIds?.length || 0 : 1, player: game.playerId, specialty: p?.role || '', observing: observing && canObserve(p), grenades: p?.grenades ?? 0, frags: p?.frags ?? 0, flashbangs: p?.flashbangs ?? 0, throwable: selectedThrowable, flash: flashIntensity(p, game.time).toFixed(2), seed: game.seed, order: game.order?.type || '', 'order-x': Math.round(game.order?.x || 0), 'order-y': Math.round(game.order?.y || 0) })) attr($('hud'), `data-${key}`, value);
  measureSafeInsets();
}

function finishMission() {
  mode = 'result'; paused = false; $('pauseOverlay').hidden = true; clearInput(); closeOrders(); audio.setScene('paused');
  updateGuidance();
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
  const nextChapter = getNextCampaignMission(game.missionIndex);
  text('operationCarryHint', won && nextChapter !== null ? 'Continue operation to carry supply costs, fatigue, and civilian consequences into the next mission. Each chapter assembles a new squad state.' : game.mission.category === 'side' ? 'This standalone operation does not change the four-chapter campaign. Replay to try another approach.' : 'These decisions belong to this playthrough. Replay to take a different approach.');
  $('nextMission').hidden = !won;
  $('nextMission').textContent = nextChapter !== null ? 'CONTINUE OPERATION' : 'RETURN TO FIELD ORDERS';
  $('replay').disabled = false; $('nextMission').disabled = false; $('coopResultWait').hidden = true; $('resultMenu').textContent = 'Back to field orders';
  if (online()) {
    $('nextMission').hidden = !coop.isHost; $('nextMission').textContent = won && nextChapter !== null ? 'CONTINUE WITH SQUAD' : 'SQUAD BRIEFING';
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
  $('switchRole').textContent = shared ? 'Swap our soldiers (host)' : game?.role === 'leader' ? 'Switch to squad member' : 'Take command of the squad';
  $('switchRole').disabled = shared && (!coop.isHost || !coop.connected || coopCommandEpoch !== null);
  $('switchRole').hidden = !shared;
  $('soloSquadPicker').hidden = !game; $('soloSwitchHint').hidden = !game;
  text('soloSwitchHint', shared ? 'Choose any free soldier. Your partner’s soldier stays assigned to them.' : 'Take control of any standing soldier. Your saved shortcuts work here too.');
  if (game) $('soloSquadPicker').innerHTML = game.squad.map((soldier,i) => {
    const peer = shared && coop.room?.players.find(item => item.actorId === soldier.id), mine = soldier.id === game.playerId;
    const disabled = !soldier.alive || soldier.downed || shared && (!coop.connected || soldierSelectionPending || peer && !mine);
    const owner = mine ? 'You' : peer ? peer.name + (peer.connected ? ' · Taken' : ' · Reconnecting') : 'Select';
    return `<button type="button" data-soldier="${escape(soldier.id)}" aria-pressed="${mine}" ${disabled ? 'disabled' : ''}><strong>${escape(soldier.name)} · ${escape(owner)}</strong><small>${escape(roleProfile(soldier).label)}${!soldier.alive ? ' · Lost' : soldier.downed ? ' · Down' : !touch ? ' · '+escape(bind('soldier'+(i+1))) : ''}</small></button>`;
  }).join('');
  $('restart').textContent = shared ? 'Restart for squad' : 'Restart mission';
  $('restart').disabled = shared && (!coop.isHost || !coop.connected || coopCommandEpoch !== null);
  $('returnMenu').textContent = shared ? 'Leave squad' : 'Field orders';
  $('coopLobbyButton').hidden = !shared || !coop.isHost;
  $('coopLobbyButton').disabled = shared && (!coop.connected || coopCommandEpoch !== null);
  $('coopPauseInfo').hidden = !shared;
  if (shared) {
    const room = coop.room;
    const humans = room?.players.filter(p => p.connected).length || 0;
    $('coopPauseSummary').textContent = `Room ${room?.code || '—'} · ${humans} human${humans === 1 ? '' : 's'} + ${4-humans} AI · You ${game?.role === 'leader' ? 'lead' : 'follow'}.${coop.isHost ? ' You host this room.' : ' Choose any free soldier above.'}`;
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
  $('coopConnectBrief').textContent = kind === 'join' ? 'Enter the code your friend shared. Choose a free soldier in the briefing.' : `${MISSIONS[selectedMission].title} · ${preferences.difficulty} · You ${preferences.role === 'leader' ? 'lead as Hale' : 'play as Mercer; your friend can lead'}.`;
  coopMessage(''); $('coopName').focus();
}
function renderCoopRoom(room) {
  soldierSelectionCheck?.();
  if (!room) return;
  if (coopCommandEpoch !== null && room.epoch !== coopCommandEpoch) coopCommandEpoch = null;
  const connected = room.players.filter(p => p.connected);
  $('coopBadge').hidden = false;
  $('coopBadge').textContent = onlineConnection === 'connected' ? `${connected.length}/2 CO-OP` : onlineConnection === 'error' ? 'OFFLINE' : 'REJOINING';
  $('coopBadge').setAttribute('aria-label', `Online squad ${room.code}, ${connected.length} player${connected.length === 1 ? '' : 's'}. Open squad details`);
  $('coopRoomCode').textContent = room.code;
  const rosterKey = JSON.stringify([room.players,room.soldiers,coop.session?.playerId,coop.connected,soldierSelectionPending]);
  if (lastRoomRoster !== rosterKey) {
    $('coopRoster').innerHTML = (room.soldiers || []).map(soldier => {
      const peer = room.players.find(p => p.id === soldier.claimedBy), mine = peer?.id === coop.session?.playerId;
      const available = coop.connected && !soldierSelectionPending && (!peer || mine) && soldier.alive && !soldier.downed;
      const role = `${roleProfile(soldier).label}${isSquadCommander(soldier) ? ' · Commander' : ''}`;
      const occupant = mine ? 'You control this soldier' : peer ? `${peer.name}${peer.connected ? ' is controlling' : ' · Reconnecting'}` : 'Free · computer controlled until selected';
      const badge = mine ? 'YOU' : peer ? peer.connected ? 'TAKEN' : 'RESERVED' : !soldier.alive ? 'LOST' : soldier.downed ? 'DOWN' : 'SELECT';
      return `<button type="button" data-coop-soldier="${escape(soldier.id)}" aria-pressed="${mine}" ${!available ? 'disabled' : ''} class="coop-roster-row ${mine?'mine':''}"><span><strong>${escape(soldier.name)}</strong><small>${escape(role)} · ${escape(occupant)}</small></span><span class="coop-seat ${peer?.connected?'human':peer?'offline':''}">${badge}</span></button>`;
    }).join(''); lastRoomRoster = rosterKey;
    if (game?.coop) updateOrders();
  }
  $('coopMission').value = room.mission; $('coopDifficulty').value = room.difficulty;
  const canManage = coop.connected && coop.isHost && coopCommandEpoch === null;
  renderLoadouts('coop', room.squadRoles, canManage && room.status === 'lobby');
  $('coopMission').disabled = !canManage; $('coopDifficulty').disabled = !canManage;
  $('coopSwapLobby').disabled = !canManage; $('coopStart').disabled = !canManage;
  $('coopLobbyHint').textContent = coop.isHost ? `You host the room. ${connected.length === 1 ? 'Choose any free soldier. Your friend can join now or during play.' : 'Choose any free soldier above. Hale gives orders; other soldiers keep their own jobs.'}` : 'Choose any free soldier above. The host chooses the mission and deploys the squad.';
  if (room.status === 'lobby') {
    const entering = $('coopLobby').hidden || mode !== 'menu';
    mode = 'menu'; paused = false; game = null; showMap = false; placingOrder = false; placingPing = false; onlineEpoch = null; onlineRole = null;
    clearInput(); closeOrders(); audio.setScene('menu');
    document.body.classList.add('in-menu','online'); document.body.classList.remove('touch','map-open','placing-order');
    $('menu').hidden = false; $('hud').hidden = true; $('touchControls').hidden = true; $('pauseOverlay').hidden = true; $('resultOverlay').hidden = true;
    $('coopOverlay').hidden = false; $('coopConnectForm').hidden = true; $('coopLobby').hidden = false;
    $('coopTitle').textContent = 'Squad briefing.'; $('coopDescription').textContent = 'Choose Hale, Mercer, Ames, or Webb. Click any free soldier; the computer controls the rest.';
    fit(); if (entering) $('coopStart').disabled ? $('coopCopyLink').focus() : $('coopStart').focus();
  }
  if (paused) updatePauseUI();
  if (mode === 'result') { $('replay').disabled = !canManage; $('nextMission').disabled = !canManage; $('nextMission').hidden = !coop.isHost; $('coopResultWait').hidden = coop.isHost; }
}
function receiveCoopState(state) {
  soldierSelectionCheck?.(state);
  const room = coop?.room; if (!room || room.status === 'lobby' || !state) return;
  const fresh = onlineEpoch !== room.epoch || !game?.coop;
  const changedRole = onlineRole !== null && onlineRole !== state.role;
  const sameMission = game?.coop && game.seed === state.seed && game.missionIndex === state.missionIndex;
  const keepMenu = paused && sameMission;
  game = state;
  if (fresh) {
    resetStoryUI();
    onlineEpoch = room.epoch; selectedMission = state.missionIndex;
    mode = 'playing'; paused = !!keepMenu; accumulator = 0; showMap = false; placingOrder = false; placingPing = false; lastRadio = ''; hudTimer = 0;
    clearInput(); closeOrders(); audio.setScene(paused ? 'paused' : 'mission');
    document.body.classList.remove('in-menu','orders-open','map-open','placing-order'); document.body.classList.add('online');
    $('menu').hidden = true; $('coopOverlay').hidden = true; $('hud').hidden = false; $('pauseOverlay').hidden = !paused; $('resultOverlay').hidden = true; $('touchControls').hidden = !touch;
    $('missionName').textContent = game.mission.title.toUpperCase();
    syncMapUI(); if (!paused) { audio.unlock(); audio.setEnabled(preferences.sound); } fit();
    if (!document.querySelector('dialog[open]')) (paused ? $('resume') : canvas).focus({preventScroll:true});
  }
  if (fresh || changedRole) {
    clearInput(); closeOrders(); placingOrder = false; placingPing = false; showMap = false; syncMapUI(); updateOrders();
    if (changedRole) toast(state.role === 'leader' ? 'You now lead the squad.' : `You now control ${player()?.name || 'a squad member'}.`);
  }
  onlineRole = state.role;
  if (paused) updatePauseUI();
  if (fresh) { startGuidance(); updateHUD(); }
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
      else await coop.create({name:preferences.callsign,role:preferences.role,squadRoles:preferences.squadRoles,mission:selectedMission,difficulty:preferences.difficulty});
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
    throwableAim: canAct() && throwableDrag.pending ? { ...targetForThrow(throwableDrag.vector(), dragThrowable), type: dragThrowable } : null,
    effectEpoch: online() ? `${coop.room?.code || ''}:${coop.room?.epoch ?? ''}` : null,
    observing: observing && canObserve(player()) && canAct(), quickOrder: quickOrder?.until > now ? { point: quickOrder.point, active: true } : null,
    // The accessible map legend already presents the current bindings and action.
    mapHint: false,
    mapLegend: 'Bright: visible now · Dim: explored · Dark: unseen · Blue: ping',
    guidance: preferences.guidance, reducedMotion: preferences.reducedMotion, bloodEffects: preferences.bloodEffects, touch: touch && mode !== 'menu', safeInsets, desktopObstacles, aim: touchAim, followActorId,
    quality: preferences.graphicsQuality, fogDensity: preferences.fogDensity, zoom: touch ? preferences.mobileCameraZoom : preferences.cameraZoom, lookahead: preferences.cameraLookahead,
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
    actions.reload = false; actions.smoke = false; actions.grenade = false; actions.frag = false; actions.flashbang = false; throwAim = null;
    if (!blocked && coop.connected) {
      const latency = coop.latency;
      audio.tick(game, dt, {
        presentationTime: game.time + clamp(((latency.snapshotAgeMs || 0) + (latency.rtt || 0) / 2) / 1000, 0, .25),
        epoch: `${coop.room?.code || ''}:${coop.room?.epoch ?? ''}`,
      });
    }
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
        clearInput(); Object.assign(input, neutralInput()); closeOrders(); placingOrder = false; placingPing = false; showMap = false; quickOrder = null;
        syncMapUI(); updateOrders(); updateHUD();
        toast(`${player().name} selected · ${roleProfile(player()).label}`);
      }
      input.reload = false; input.smoke = false; input.grenade = false; input.frag = false; input.flashbang = false;
      actions.reload = false; actions.smoke = false; actions.grenade = false; actions.frag = false; actions.flashbang = false; throwAim = null;
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

controlsEditor = new ControlsEditor({ getBindings: () => preferences.keyBindings, onChange: bindings => changeSetting('keyBindings', bindings), onCapture: clearInput });
chooseRole(preferences.role); applySettings(); missionMenu(); audio.setScene('menu');
initializeCoop();
for (const id of ['deploy','coopCreate','coopJoinOpen']) $(id).disabled = false;
requestAnimationFrame(frame);
