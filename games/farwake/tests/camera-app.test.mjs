import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.mjs';
import { CameraProfile } from '../dist/camera-profile.mjs';
import { normalizeCameraPreferences } from '../dist/camera-preferences.mjs';

const source = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declarations = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration = name => {
  const index = declarations.findIndex(match => match[1] === name);
  assert.ok(index >= 0, `Application declares ${name}`);
  return source.slice(declarations[index].index, declarations[index + 1]?.index ?? source.length);
};
const code = ['activateLocalCamera', 'readCameraDraft', 'persistCameraDraft', 'reportCameraSaveFailure', 'receiveCameraPreferences', 'applyCameraState', 'start', 'saveNow', 'openSavePanel', 'connectGalaxy', 'disconnectGalaxy'].map(declaration).join('\n');
const prefs = (shipZoom = 1, personZoom = 1) => ({ shipZoom, personZoom });
const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));
const passport = { realmCode: 'GALAXY', captainId: 'captain-one', token: 'test-only-private-token' };
const draftKey = 'dfe.farwake.camera-pending.v1:GALAXY:captain-one';

// Execute the actual app save and connection handlers. Only their browser UI,
// transport, and rendering boundaries are replaced; camera coordination and
// voyage serialization are real.
function fixture({ local = prefs(.8, 1.2), server = prefs(.4, .75), revision = 5 } = {}) {
  let timerId = 0, context;
  const timers = new Map(), elements = new Map(), entries = new Map(), saves = [], downloads = [], notices = [], commands = [], instances = [];
  const authority = { preferences: { ...server }, revision };
  const faults = { save: false, connect: false };
  const solo = new Game('camera-local-voyage');
  solo.state.cameraPreferences = { ...local };
  const shared = new Game('camera-shared-galaxy');
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, focus() {}, click() {}, setAttribute() {} });
    return elements.get(id);
  };
  const schedule = callback => { timers.set(++timerId, callback); return timerId; };
  const cancel = id => timers.delete(id);
  class NetworkBoundary {
    constructor(callbacks) { this.callbacks = callbacks; this.connected = false; this.passport = null; instances.push(this); }
    packet() { return { state: shared.save(), cameraPreferences: { ...authority.preferences }, cameraRevision: authority.revision }; }
    welcome() {
      this.connected = true;
      const packet = this.packet();
      this.callbacks.onSnapshot(packet);
      this.cameraAtWelcome = context.cameraProfile.preferences;
      this.callbacks.onStatus({ state: 'connected' });
      return packet;
    }
    async connect(options) {
      if (faults.connect) throw new Error('network unavailable');
      this.passport = options.passport ?? passport;
      return this.welcome();
    }
    async command(name, args) {
      commands.push({ name, args: copy(args) });
      assert.equal(name, 'setCameraPreferences', 'view changes never call a gameplay command');
      assert.equal(args.expectedRevision, authority.revision);
      authority.preferences = normalizeCameraPreferences(args, authority.preferences);
      authority.revision++;
      return { result: { ok: true, cameraPreferences: { ...authority.preferences }, cameraRevision: authority.revision } };
    }
    setInput() {}
    disconnect() { this.connected = false; }
  }
  const dialog = {
    opened: false, kind: null,
    open(title, kind) { this.opened = true; this.kind = kind; },
    html() {}, choices() {},
    close() { if (this.opened) { this.opened = false; context.saveNow(); } },
  };
  context = vm.createContext({
    Game, CameraProfile, normalizeCameraPreferences, structuredClone, Blob,
    settings: { ...local, textScale: 1.4, controlScale: 1.1 }, localCameraPreferences: { ...local },
    game: solo, stored: solo.state, playing: true, testSession: null,
    cameraScope: 'local', cameraKey: null, cameraSaveTimer: null, cameraProfile: null,
    network: null, onlineSnapshot: null, connectionState: 'offline',
    personPredictedAt: null, personVisualAt: null, personVisualOffset: { x: 0, y: 0 },
    surface: null, surfaceKey: '', labelLayoutDirty: false, hudDirty: false, touchLayout: true, tracked: 'kettle',
    $: element, dialog, FarwakeNetwork: NetworkBoundary, SERVER_URL: 'https://test-authority.invalid',
    localStorage: { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) },
    document: { body: { classList: { add() {}, remove() {} } }, createElement: () => ({ click() {} }) },
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    canvas: { focus() {} }, audio: { unlock() {} }, worldPresentation: { reset() {} },
    setTimeout: schedule, clearTimeout: cancel,
    applySettings(settings, { cameraPreferences }) { entries.set('device-settings', JSON.stringify({ ...settings, ...cameraPreferences })); },
    syncViewControls() {}, clearPointerAim() {}, queueResize() {}, resize() {}, ensureSurface() {}, updateHUD() {}, updateConnectionHUD() {},
    openTestControls() { assert.fail('test controls not expected'); }, openPassport() { assert.fail('solo save panel should not become a passport dialog'); },
    openEncounter() {}, esc: String, readPassport: () => passport,
    toast: message => notices.push(message), hudText: (target, value) => { target.textContent = value; },
    saveGame(game) { if (faults.save) return false; saves.push(JSON.parse(game.serialize())); return true; },
    receiveSnapshot(packet) { context.game = Game.fromSave(packet.state); context.onlineSnapshot = packet; context.receiveCameraPreferences(packet); },
  });
  vm.runInContext(code, context);
  context.cameraProfile = new CameraProfile({ onChange: context.applyCameraState, schedule, cancel });
  context.activateLocalCamera(local);
  return { context, timers, entries, saves, downloads, notices, commands, instances, authority, faults, element };
}

test('a voyage exported immediately after a zoom edit includes both current modes before debounce', async () => {
  const f = fixture();
  f.context.cameraProfile.set('ship', .3);
  f.context.cameraProfile.set('person', .65);
  assert.equal(f.saves.length, 0, 'the durable local debounce has not fired');
  f.context.openSavePanel();
  await f.element('downloadSave').onclick();
  const exported = JSON.parse(await f.downloads[0].text());
  assert.deepEqual(exported.cameraPreferences, prefs(.3, .65));

  const other = fixture({ local: prefs(1.1, 1.4) });
  other.context.openSavePanel();
  other.element('saveText').value = JSON.stringify(exported);
  await other.element('importSave').onclick();
  assert.deepEqual(other.context.cameraProfile.preferences, prefs(.3, .65));
  assert.deepEqual(other.saves[0].cameraPreferences, prefs(.3, .65));
  assert.deepEqual(JSON.parse(other.entries.get('device-settings')), { shipZoom: .3, personZoom: .65, textScale: 1.4, controlScale: 1.1 });
});

test('failed voyage import cannot change the active voyage or camera profile', async () => {
  const f = fixture(), before = f.context.game;
  const imported = new Game('another-voyage').save();
  imported.cameraPreferences = prefs(.25, .5);
  f.faults.save = true;
  f.context.openSavePanel();
  f.element('saveText').value = JSON.stringify(imported);
  await f.element('importSave').onclick();
  assert.equal(f.context.game, before);
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.8, 1.2));
  assert.match(f.element('saveFeedback').textContent, /could not store/i);

  f.faults.save = false;
  f.element('saveText').value = JSON.stringify({ cameraPreferences: prefs(.25, .5) });
  await f.element('importSave').onclick();
  assert.equal(f.context.game, before);
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.8, 1.2));
  assert.match(f.element('saveFeedback').textContent, /does not look like a Farwake save/i);
});

test('shared welcome uses saved captain cameras, and sign-off restores the separate solo cameras', async () => {
  const f = fixture();
  await f.context.connectGalaxy({ passport });
  assert.deepEqual(f.instances[0].cameraAtWelcome, prefs(.4, .75));
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.4, .75));
  assert.equal(f.commands.length, 0, 'existing captain preferences do not receive browser defaults');
  assert.deepEqual(f.saves[0].cameraPreferences, prefs(.8, 1.2), 'solo saved before entering shared mode');
  f.context.cameraProfile.set('ship', .35);
  await f.context.cameraProfile.flush();
  assert.deepEqual(f.commands, [{ name: 'setCameraPreferences', args: { expectedRevision: 5, shipZoom: .35 } }]);
  assert.deepEqual(JSON.parse(f.entries.get('device-settings')), { shipZoom: .8, personZoom: 1.2, textScale: 1.4, controlScale: 1.1 });
  await f.context.disconnectGalaxy();
  assert.equal(f.context.network, null);
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.8, 1.2));
  assert.equal(f.context.cameraProfile.status, 'local');
  await f.context.connectGalaxy({ passport });
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.35, .75));
});

test('welcome initializes both legacy cameras before connected flush, without exporting shared state locally', async () => {
  const f = fixture({ revision: 0, server: prefs() });
  await f.context.connectGalaxy({ passport });
  assert.deepEqual(f.instances[0].cameraAtWelcome, prefs(.8, 1.2));
  await f.context.cameraProfile.flush();
  assert.deepEqual(f.commands, [{ name: 'setCameraPreferences', args: { expectedRevision: 0, shipZoom: .8, personZoom: 1.2 } }]);
  assert.ok(f.saves.every(save => save.seed === 'camera-local-voyage'));
  assert.equal(f.context.cameraProfile.status, 'saved');
});

test('offline camera changes survive sign-off and retry on the matching captain, then clear their draft', async () => {
  const f = fixture();
  await f.context.connectGalaxy({ passport });
  f.context.network.connected = false;
  f.context.cameraProfile.set('person', .6);
  assert.equal(await f.context.cameraProfile.flush(), false);
  assert.deepEqual(JSON.parse(f.entries.get(draftKey)), { key: 'GALAXY:captain-one', revision: 5, fields: { personZoom: .6 } });
  await f.context.disconnectGalaxy();
  assert.ok(f.entries.has(draftKey));
  assert.ok(f.notices.some(message => /Camera changes/.test(message)), 'sign-off reports the unsaved camera outcome');
  await f.context.connectGalaxy({ passport });
  await f.context.cameraProfile.flush();
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.4, .6));
  assert.deepEqual(f.commands, [{ name: 'setCameraPreferences', args: { expectedRevision: 5, personZoom: .6 } }]);
  assert.equal(f.entries.has(draftKey), false);
});

test('connected callback retries pending camera changes after an interrupted connection', async () => {
  const f = fixture();
  await f.context.connectGalaxy({ passport });
  const network = f.context.network;
  network.connected = false;
  f.context.cameraProfile.set('ship', .55);
  assert.equal(await f.context.cameraProfile.flush(), false);
  network.welcome();
  await turn();
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.55, .75));
  assert.equal(f.context.cameraProfile.status, 'saved');
  assert.equal(f.entries.has(draftKey), false);
});

test('failed shared connection restores the solo voyage and its camera profile', async () => {
  const f = fixture({ local: prefs(.7, 1.3) }), before = f.context.game;
  f.faults.connect = true;
  await f.context.connectGalaxy({ passport });
  assert.equal(f.context.game, before);
  assert.equal(f.context.network, null);
  assert.equal(f.context.playing, true);
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.7, 1.3));
  assert.equal(f.context.cameraProfile.status, 'local');
  assert.equal(f.context.dialog.kind, 'connection-error');
});

test('title export after sign-off uses the solo voyage and the latest camera edit survives immediate Continue', async () => {
  const f = fixture();
  await f.context.connectGalaxy({ passport });
  await f.context.disconnectGalaxy();
  assert.equal(f.context.playing, false);
  assert.equal(f.context.game.state.seed, 'camera-local-voyage');
  f.context.cameraProfile.set('ship', .6);
  f.context.cameraProfile.set('person', .9);
  f.context.openSavePanel();
  await f.element('downloadSave').onclick();
  const exported = JSON.parse(await f.downloads[0].text());
  assert.equal(exported.seed, 'camera-local-voyage');
  assert.deepEqual(exported.cameraPreferences, prefs(.6, .9));
  f.context.dialog.close();
  // Continue before any debounce callback gets a chance to save.
  f.context.start(false);
  assert.deepEqual(f.context.cameraProfile.preferences, prefs(.6, .9));
  assert.deepEqual(f.saves.at(-1).cameraPreferences, prefs(.6, .9));
});

test('title edits durably update an existing solo save without creating a voyage on a fresh title screen', () => {
  const existing = fixture();
  existing.context.playing = false;
  existing.context.cameraProfile.set('ship', .55);
  const callback = existing.timers.get(existing.context.cameraSaveTimer);
  assert.equal(typeof callback, 'function');
  callback();
  assert.deepEqual(existing.saves.at(-1).cameraPreferences, prefs(.55, 1.2));
  assert.equal(existing.context.playing, false);

  const fresh = fixture();
  fresh.context.playing = false;
  fresh.context.stored = null;
  fresh.context.cameraProfile.set('ship', .55);
  assert.equal(fresh.saves.length, 0);
  assert.equal(fresh.context.cameraSaveTimer, null);
  assert.deepEqual(copy(fresh.context.game.state.cameraPreferences), prefs(.55, 1.2));
});
