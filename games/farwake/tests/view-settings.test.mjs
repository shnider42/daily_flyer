import test from 'node:test';
import {displayMode} from '../dist/gunnery-view.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readSettings, applySettings } from '../dist/ui.mjs';
import { CameraProfile } from '../dist/camera-profile.mjs';
import { normalizeCameraPreferences, normalizeModeZoom, zoomLimits } from '../dist/camera-preferences.mjs';

const SETTINGS_KEY = 'dfe.farwake.settings.v1', SAVE_KEY = 'dfe.farwake.save.v1';

function settingsBoundary(initial = null) {
  const entries = new Map([[SAVE_KEY, 'normal-voyage-to-preserve'], ['dfe.farwake.action-guide.v1', 'learned-actions-to-preserve']]);
  if (initial !== null) entries.set(SETTINGS_KEY, typeof initial === 'string' ? initial : JSON.stringify(initial));
  const writes = [], removals = [], selectors = new Map(), classNames = new Set(), properties = new Map();
  const original = new Map(['window', 'document', 'localStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const storage = { getItem: key => entries.get(key) ?? null, setItem(key, value) { writes.push([key, value]); entries.set(key, value); }, removeItem(key) { removals.push(key); entries.delete(key); } };
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      body: { classList: { toggle(name, on) { if (on) classNames.add(name); else classNames.delete(name); }, add(...names) { names.forEach(name => classNames.add(name)); }, remove(...names) { names.forEach(name => classNames.delete(name)); }, contains: name => classNames.has(name) } },
      documentElement: { style: { setProperty(name, value) { properties.set(name, value); } } },
      querySelector: selector => selectors.get(selector) ?? null,
    },
    localStorage: storage,
  });
  return { entries, writes, removals, selectors, classNames, properties, storage, restore() { for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } } };
}

test('view defaults provide separate cameras without changing text or control scale', () => {
  const boundary = settingsBoundary();
  try {
    const settings = readSettings();
    assert.deepEqual(normalizeCameraPreferences(settings), { shipZoom: .25, personZoom: .8 });
    assert.equal('worldZoom' in settings, false);
    for (const key of ['immersiveHud', 'translucentHud', 'compactTips']) assert.equal(settings[key], true);
    assert.equal(settings.textScale, 1); assert.equal(settings.controlScale, 1);
    assert.equal(boundary.writes.length, 0, 'Reading preferences does not write browser storage.');
  } finally { boundary.restore(); }
});

test('legacy world zoom migrates once into independent camera values while retaining device preferences', () => {
  const boundary = settingsBoundary({ worldZoom: .8, guidance: 'moderate', textScale: 1.45, controlScale: 1.15, leftHanded: true, sound: false, flightAssist: false });
  try {
    const settings = readSettings();
    assert.deepEqual(normalizeCameraPreferences(settings), { shipZoom: .8, personZoom: .8 });
    assert.equal('worldZoom' in settings, false);
    applySettings(settings);
    const migrated = JSON.parse(boundary.entries.get(SETTINGS_KEY));
    assert.equal('worldZoom' in migrated, false);
    Object.assign(settings, { shipZoom: .35, personZoom: 1.4 }); applySettings(settings);
    const restored = readSettings();
    assert.deepEqual(normalizeCameraPreferences(restored), { shipZoom: .35, personZoom: 1.4 });
    for (const [key, value] of Object.entries({ guidance: 'moderate', textScale: 1.45, controlScale: 1.15, leftHanded: true, sound: false, flightAssist: false })) assert.equal(restored[key], value);
    boundary.storage.setItem(SETTINGS_KEY, JSON.stringify({ ...restored, worldZoom: 1.6 }));
    assert.deepEqual(normalizeCameraPreferences(readSettings()), { shipZoom: .35, personZoom: 1.4 }, 'Explicit mode values win over any stale legacy value.');
    assert.equal(boundary.entries.get(SAVE_KEY), 'normal-voyage-to-preserve');
  } finally { boundary.restore(); }
});

test('view layout and both camera values persist without scaling text or thumb controls', () => {
  const boundary = settingsBoundary({ textScale: 1.4, controlScale: 1.2, leftHanded: true });
  try {
    const settings = readSettings();
    Object.assign(settings, { shipZoom: .25, personZoom: .5, immersiveHud: false, translucentHud: false, compactTips: false }); applySettings(settings);
    let restored = readSettings();
    assert.deepEqual(normalizeCameraPreferences(restored), { shipZoom: .25, personZoom: .5 });
    for (const name of ['immersive-hud', 'translucent-hud', 'compact-tips']) assert.equal(boundary.classNames.has(name), false);
    Object.assign(settings, { shipZoom: 1.6, personZoom: 1.25, immersiveHud: true, translucentHud: true, compactTips: true }); applySettings(settings);
    restored = readSettings();
    assert.deepEqual(normalizeCameraPreferences(restored), { shipZoom: 1.6, personZoom: 1.25 });
    for (const name of ['immersive-hud', 'translucent-hud', 'compact-tips']) assert.equal(boundary.classNames.has(name), true);
    assert.equal(boundary.properties.get('--font-scale'), '1.4'); assert.equal(boundary.properties.get('--control-scale'), '1.2'); assert.equal(restored.leftHanded, true);
    assert.deepEqual(boundary.writes.map(([key]) => key), [SETTINGS_KEY, SETTINGS_KEY]);
    assert.equal(boundary.entries.get(SAVE_KEY), 'normal-voyage-to-preserve');
    assert.equal(boundary.entries.get('dfe.farwake.action-guide.v1'), 'learned-actions-to-preserve');
  } finally { boundary.restore(); }
});

test('shared or practice settings saves retain this browser’s local camera preferences', () => {
  const boundary = settingsBoundary({ shipZoom: .4, personZoom: 1.15 });
  try {
    const settings = readSettings(), localCameraPreferences = normalizeCameraPreferences(settings);
    for (const active of [{ shipZoom: .25, personZoom: 1.6 }, { shipZoom: 1.5, personZoom: .5 }]) {
      Object.assign(settings, active, { textScale: 1.3, controlScale: 1.1, leftHanded: true });
      applySettings(settings, { cameraPreferences: localCameraPreferences });
      assert.deepEqual(normalizeCameraPreferences(settings), active, 'The active camera stays on its own scope.');
      const restored = readSettings(); assert.deepEqual(normalizeCameraPreferences(restored), localCameraPreferences);
      assert.equal(restored.textScale, 1.3); assert.equal(restored.controlScale, 1.1); assert.equal(restored.leftHanded, true);
    }
    assert.equal(boundary.entries.get(SAVE_KEY), 'normal-voyage-to-preserve');
  } finally { boundary.restore(); }
});

test('invalid mode zoom values recover finite ranges and malformed storage retains defaults', () => {
  const boundary = settingsBoundary();
  try {
    const settings = readSettings();
    for (const [value, ship, person] of [[.1, .25, .5], [20, 1.6, 1.6], ['1.35', 1.35, 1.35], ['invalid', .25, .8], [NaN, .25, .8], [Infinity, .25, .8]]) {
      settings.shipZoom = value; settings.personZoom = value; applySettings(settings);
      assert.equal(settings.shipZoom, ship, String(value)); assert.equal(settings.personZoom, person, String(value));
      assert.equal(settings.textScale, 1); assert.equal(settings.controlScale, 1);
    }
    boundary.storage.setItem(SETTINGS_KEY, '{broken-json'); const beforeWrites = boundary.writes.length, recovered = readSettings();
    assert.deepEqual(normalizeCameraPreferences(recovered), { shipZoom: .25, personZoom: .8 });
    for (const key of ['immersiveHud', 'translucentHud', 'compactTips']) assert.equal(recovered[key], true);
    assert.equal(boundary.writes.length, beforeWrites); assert.equal(boundary.entries.get(SAVE_KEY), 'normal-voyage-to-preserve');
  } finally { boundary.restore(); }
});

// Run the actual app handlers and CameraProfile. Only browser DOM, transport,
// storage, and scheduling boundaries are replaced; gameplay commands must not run.
const appSource = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declarations = [...appSource.matchAll(/^(?:async )?function (\w+)\(/gm)];
const appDeclaration = name => {
  const index = declarations.findIndex(match => match[1] === name); assert.ok(index >= 0, `The application declares ${name}.`);
  return appSource.slice(declarations[index].index, declarations[index + 1]?.index ?? appSource.length);
};
const viewCode = ['activateLocalCamera', 'readCameraDraft', 'persistCameraDraft', 'reportCameraSaveFailure', 'receiveCameraPreferences', 'applyCameraState', 'syncViewControls', 'setModeZoom', 'setViewPreference', 'resetView', 'setViewPanel', 'closeContacts', 'setToolTray', 'saveNow'].map(appDeclaration).join('\n');
const gameplayState = game => JSON.stringify(Object.fromEntries(Object.entries(game.state).filter(([key]) => key !== 'cameraPreferences')));

function viewFixture(boundary, { practice = false } = {}) {
  const elements = new Map(), effects = [], voyageWrites = [], timers = new Map(), settings = readSettings(); let timerSerial = 0;
  Object.assign(settings, { textScale: 1.4, controlScale: 1.2, leftHanded: true, guidance: 'moderate' });
  const game = { state: { mode: 'ship', credits: 623, ship: Object.freeze({ x: 120, y: 350, vx: 40, vy: 16, angle: 1.2 }), seed: practice ? 'isolated-practice' : 'normal-voyage', flags: Object.freeze(['earned-story-progress']) } };
  const schedule = (callback, delay) => { const id = ++timerSerial; timers.set(id, { callback, delay }); return id; }, cancel = id => timers.delete(id);
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { hidden: id === 'viewPanel', value: '', textContent: '', checked: false, disabled: false, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, focus(options) { effects.push(['focus', id, options]); } });
    return elements.get(id);
  };
  const context = vm.createContext({
    displayMode,
    $: getElement, settings, game, testSession: practice ? { game } : null, playing: false, stored: null, dialog: { opened: false }, viewPanelOpen: false, toolTrayOpen: true, coachExpanded: true, labelLayoutDirty: false, hudDirty: false,
    cameraScope: 'local', cameraKey: null, cameraSaveTimer: null, localCameraPreferences: normalizeCameraPreferences(settings), network: null,
    document: globalThis.document, localStorage: boundary.storage, normalizeCameraPreferences, normalizeModeZoom, zoomLimits, applySettings, setTimeout: schedule, clearTimeout: cancel, hudText: (target, text) => { target.textContent = text; }, toast: (...args) => effects.push(['toast', ...args]),
    controls: { clear() { effects.push(['clear-controls']); } }, clearPointerAim() { effects.push(['clear-aim']); }, hideCoach() { effects.push(['hide-coach']); },
    resize() { effects.push(['resize']); }, queueResize() { effects.push(['resize-queued']); }, updatePerformanceHUD() { effects.push(['performance']); },
    saveGame(value) { const saved = JSON.stringify(value.state); voyageWrites.push(saved); boundary.storage.setItem(SAVE_KEY, saved); return true; },
    invoke() { throw new Error('Changing a view must not invoke a gameplay command.'); },
  });
  vm.runInContext(viewCode, context);
  const profile = new CameraProfile({ onChange: (...args) => context.applyCameraState(...args), schedule, cancel }); context.cameraProfile = profile;
  context.activateLocalCamera(context.localCameraPreferences, { practice }); context.playing = true;
  boundary.writes.length = 0; effects.length = 0;
  return { context, profile, elements, effects, settings, game, voyageWrites, timers, getElement, call: (name, ...args) => context[name](...args),
    runTimers() { const ready = [...timers]; for (const [id, task] of ready) if (timers.delete(id)) task.callback(); },
  };
}

test('actual mode controls preserve gameplay and debounce solo metadata while practice remains unsaved', () => {
  for (const practice of [false, true]) {
    const boundary = settingsBoundary();
    try {
      const f = viewFixture(boundary, { practice }), before = gameplayState(f.game);
      const shipSettingTitle = { textContent: '' }, personSettingTitle = { textContent: '' };
      boundary.selectors.set('label[for="setting-shipZoom"] strong', shipSettingTitle); boundary.selectors.set('label[for="setting-personZoom"] strong', personSettingTitle);
      f.call('setModeZoom', 'ship', .5);
      f.call('setModeZoom', 'ship', .25);
      assert.equal(f.getElement('shipZoomValue').textContent, '25%'); assert.equal(f.getElement('shipZoom').attributes['aria-valuetext'], '25 percent ship zoom');
      assert.equal(f.getElement('setting-shipZoom').value, '0.25'); assert.equal(shipSettingTitle.textContent, 'Ship zoom · 25%');
      assert.equal(f.getElement('shipZoomOut').disabled, true); assert.equal(f.getElement('shipZoomIn').disabled, false); assert.equal(f.settings.personZoom, .8);
      f.call('setModeZoom', 'person', .5);
      assert.equal(f.getElement('personZoomValue').textContent, '50%'); assert.equal(f.getElement('personZoomOut').disabled, true); assert.equal(f.settings.shipZoom, .25);
      assert.equal(f.getElement('setting-personZoom').value, '0.5'); assert.equal(personSettingTitle.textContent, 'Person zoom · 50%');
      f.call('setModeZoom', 'ship', 1.6); f.call('setModeZoom', 'person', 1.6);
      for (const mode of ['ship', 'person']) { assert.equal(f.getElement(mode + 'ZoomValue').textContent, '160%'); assert.equal(f.getElement(mode + 'ZoomOut').disabled, false); assert.equal(f.getElement(mode + 'ZoomIn').disabled, true); }
      assert.equal(f.settings.textScale, 1.4); assert.equal(f.settings.controlScale, 1.2); assert.equal(f.settings.leftHanded, true); assert.equal(f.settings.guidance, 'moderate');
      assert.equal(f.context.playing, true); assert.equal(f.context.dialog.opened, false); assert.equal(gameplayState(f.game), before);
      assert.ok(f.effects.some(([effect]) => effect === 'clear-aim')); assert.ok(f.effects.some(([effect]) => effect === 'resize-queued')); assert.equal(f.context.labelLayoutDirty, true);
      assert.equal(f.voyageWrites.length, 0, 'Slider input does not synchronously serialize a voyage.');
      f.runTimers();
      if (practice) {
        assert.equal(f.voyageWrites.length, 0); assert.equal('cameraPreferences' in f.game.state, false); assert.equal(boundary.entries.get(SAVE_KEY), 'normal-voyage-to-preserve');
        assert.deepEqual(normalizeCameraPreferences(readSettings()), { shipZoom: .25, personZoom: .8 }); assert.match(f.getElement('cameraSaveStatus').textContent, /Practice only/);
      } else {
        assert.equal(f.voyageWrites.length, 1, 'A burst of camera edits creates one debounced local voyage save.');
        assert.deepEqual(JSON.parse(f.voyageWrites[0]).cameraPreferences, { shipZoom: 1.6, personZoom: 1.6 });
        assert.deepEqual(normalizeCameraPreferences(readSettings()), { shipZoom: 1.6, personZoom: 1.6 });
      }
      assert.equal(gameplayState(f.game), before);
    } finally { boundary.restore(); }
  }
});

test('actual shared camera controls send only camera preferences and preserve local voyage cameras', async () => {
  const boundary = settingsBoundary({ shipZoom: .6, personZoom: 1.2 });
  try {
    const f = viewFixture(boundary), before = gameplayState(f.game), calls = []; let revision = 4, preferences = { shipZoom: .4, personZoom: .9 };
    f.context.network = { connected: true, passport: { realmCode: 'CAMERA01', captainId: 'self' }, async command(name, args) {
      assert.equal(name, 'setCameraPreferences', 'No gameplay command is issued by a camera control.'); calls.push({ name, args });
      assert.equal(args.expectedRevision, revision); preferences = normalizeCameraPreferences(args, preferences); revision++;
      const current = { cameraPreferences: preferences, cameraRevision: revision }; return { ok: true, ...current, result: { ok: true, ...current } };
    } };
    f.call('receiveCameraPreferences', { cameraPreferences: preferences, cameraRevision: revision });
    f.call('setModeZoom', 'ship', .25); f.call('setModeZoom', 'person', 1.3);
    const draftKey = 'dfe.farwake.camera-pending.v1:CAMERA01:self';
    assert.deepEqual(JSON.parse(boundary.entries.get(draftKey)), { key: 'CAMERA01:self', revision: 4, fields: { shipZoom: .25, personZoom: 1.3 } });
    assert.equal(await f.profile.flush(), true); assert.equal(calls.length, 1); assert.deepEqual(normalizeCameraPreferences(calls[0].args), { shipZoom: .25, personZoom: 1.3 });
    assert.equal(boundary.entries.has(draftKey), false, 'The pending browser draft clears only after its camera command is acknowledged.');
    assert.deepEqual(normalizeCameraPreferences(f.settings), { shipZoom: .25, personZoom: 1.3 }); assert.deepEqual(normalizeCameraPreferences(readSettings()), { shipZoom: .6, personZoom: 1.2 });
    assert.equal(f.voyageWrites.length, 0); assert.equal(boundary.entries.get(SAVE_KEY), 'normal-voyage-to-preserve'); assert.equal(gameplayState(f.game), before);
    assert.match(f.getElement('cameraSaveStatus').textContent, /Saved with your captain/);
  } finally { boundary.restore(); }
});

test('the actual View popup clears held actions and returns focus without pausing gameplay', () => {
  for (const mode of ['ship', 'person']) {
    const boundary = settingsBoundary();
    try {
      const f = viewFixture(boundary); f.game.state.mode = mode; const before = gameplayState(f.game);
      f.call('setViewPanel', true);
      assert.equal(f.context.viewPanelOpen, true); assert.equal(f.getElement('viewPanel').hidden, false); assert.equal(f.getElement('viewButton').attributes['aria-expanded'], 'true');
      assert.equal(f.getElement('contactsPanel').hidden, true); assert.equal(f.getElement('toolTray').hidden, true); assert.equal(f.context.toolTrayOpen, false);
      for (const needed of ['clear-controls', 'clear-aim', 'hide-coach']) assert.ok(f.effects.some(([effect]) => effect === needed));
      assert.deepEqual(f.effects.filter(([effect]) => effect === 'focus').map(([, id]) => id), [mode + 'Zoom']);
      assert.equal(f.getElement(mode + 'ZoomActive').hidden, false); assert.equal(f.getElement((mode === 'ship' ? 'person' : 'ship') + 'ZoomActive').hidden, true);
      assert.equal(f.context.playing, true); assert.equal(f.context.dialog.opened, false);
      f.call('setViewPanel', false); assert.equal(f.getElement('viewPanel').hidden, true); assert.equal(f.getElement('viewButton').attributes['aria-expanded'], 'false');
      assert.deepEqual(f.effects.filter(([effect]) => effect === 'focus').map(([, id]) => id), [mode + 'Zoom', 'viewButton']);
      assert.equal(gameplayState(f.game), before); assert.equal(boundary.writes.length, 0);
    } finally { boundary.restore(); }
  }
});

test('the View popup respects title and dialog guards without stealing focus during close', () => {
  const boundary = settingsBoundary();
  try {
    const f = viewFixture(boundary);
    f.context.playing = false; f.call('setViewPanel', true); assert.equal(f.context.viewPanelOpen, false); assert.equal(f.getElement('viewPanel').hidden, true);
    f.context.playing = true; f.context.dialog.opened = true; f.call('setViewPanel', true); assert.equal(f.context.viewPanelOpen, false); assert.equal(f.effects.length, 0);
    f.context.dialog.opened = false; f.call('setViewPanel', true); f.call('setViewPanel', false, { restoreFocus: false });
    assert.equal(f.context.viewPanelOpen, false); assert.deepEqual(f.effects.filter(([effect]) => effect === 'focus').map(([, id]) => id), ['shipZoom']); assert.equal(boundary.writes.length, 0);
  } finally { boundary.restore(); }
});

test('view layout reset preserves accessibility, gameplay, tutorials, and saved cameras during practice', () => {
  const boundary = settingsBoundary({ shipZoom: .6, personZoom: 1.2 });
  try {
    const f = viewFixture(boundary, { practice: true }), before = gameplayState(f.game);
    for (const key of ['immersiveHud', 'translucentHud', 'compactTips']) f.call('setViewPreference', key, false);
    f.call('setModeZoom', 'ship', 1.6); f.call('setModeZoom', 'person', .5);
    for (const id of ['viewImmersive', 'viewTranslucent', 'viewCompactTips']) assert.equal(f.getElement(id).checked, false);
    assert.ok(f.effects.some(([effect]) => effect === 'resize'));
    const writesBefore = boundary.writes.length; f.call('setViewPreference', 'textScale', 1); assert.equal(boundary.writes.length, writesBefore);
    f.call('resetView'); f.runTimers();
    assert.deepEqual(normalizeCameraPreferences(f.settings), { shipZoom: .25, personZoom: .8 });
    for (const key of ['immersiveHud', 'translucentHud', 'compactTips']) assert.equal(f.settings[key], true);
    assert.equal(f.getElement('shipZoomValue').textContent, '25%'); assert.equal(f.getElement('personZoomValue').textContent, '80%');
    assert.equal(f.settings.textScale, 1.4); assert.equal(f.settings.controlScale, 1.2); assert.equal(f.settings.leftHanded, true); assert.equal(f.settings.guidance, 'moderate');
    assert.equal(gameplayState(f.game), before); assert.equal(f.voyageWrites.length, 0); assert.ok(boundary.writes.every(([key]) => key === SETTINGS_KEY));
    assert.deepEqual(normalizeCameraPreferences(readSettings()), { shipZoom: .6, personZoom: 1.2 });
    assert.equal(boundary.entries.get('dfe.farwake.action-guide.v1'), 'learned-actions-to-preserve');
  } finally { boundary.restore(); }
});
