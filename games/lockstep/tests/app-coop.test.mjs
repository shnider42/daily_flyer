import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as W from '../public/world.mjs';

// Exercise the shipped controller's connection lifecycle without a browser or
// drawing implementation. The socket transport has separate real-socket tests.
const controller = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
  .replace(/^import .+;\n/gm, '');
const markup = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
function harness() {
  const elements = new Map(), storage = new Map(), intervals = [];
  let document;
  class Element {
    constructor(id) {
      this.id = id; this.hidden = id === 'overlay'; this.dataset = {}; this.style = {};
      this.value = ''; this.disabled = false; this.isConnected = true; this.childrenIds = [];
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    set innerHTML(value) {
      this.html = value;
      for (const id of this.childrenIds) { const old = elements.get(id); if (old) old.isConnected = false; elements.delete(id); }
      this.childrenIds = [];
      for (const match of value.matchAll(/\bid="([^"]+)"/g)) {
        this.childrenIds.push(match[1]); elements.set(match[1], new Element(match[1]));
      }
    }
    get innerHTML() { return this.html || ''; }
    setAttribute(name, value) { this[name] = value; }
    focus() { document.activeElement = this; }
    contains(element) { return element === this || this.childrenIds.includes(element?.id); }
    getBoundingClientRect() { return { width: 390, height: 600, x: 0, y: 0 }; }
    querySelector() { return null; }
  }
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element(match[1]));
  document = {
    querySelector: selector => /^#[\w-]+$/.test(selector) ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: () => [], body: new Element('body'), activeElement: null,
    hidden: false, addEventListener() {},
  };
  let transport;
  class CoopClient {
    constructor(callbacks) { this.callbacks = callbacks; this.connected = false; this.active = false; this.actions = []; this.leaves = 0; transport = this; }
    create() { this.active = true; this.callbacks.onStatus('connecting', 'Connecting'); }
    join() { this.create(); return true; }
    reconnect() { this.create(); }
    leave() { this.active = this.connected = false; this.leaves++; this.callbacks.onRoster([]); this.callbacks.onStatus('disconnected', 'Left the team.'); }
    sendAction(action) { if (!this.connected) return false; this.actions.push(action); return true; }
    presence() {}
    get roomCode() { return 'ABC234'; }
    get playerId() { return 'self'; }
    get serverNow() { return Date.now(); }
    get resumeInfo() { return null; }
    welcome(state) {
      this.active = this.connected = true;
      this.callbacks.onStatus('connected', 'Connected');
      this.callbacks.onState(state, { initial: true });
    }
  }
  class SceneArt { constructor() {} setRoom() {} resize() {} render() {} project() { return { x: 0, y: 0 }; } }
  const context = vm.createContext({
    W, SceneArt, CoopClient, document, window: { addEventListener() {} },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    matchMedia: () => ({ matches: false }), requestAnimationFrame() {},
    setInterval(fn, delay) { intervals.push({ fn, delay }); }, setTimeout() {}, clearTimeout() {}, URL, Date, console,
    location: { href: 'https://lockstep.example/' }, navigator: {},
  });
  vm.runInContext(controller + '\nglobalThis.app = {startSolo,showCoop,closeDialog,openObject,dispatch,goMenu,persist,snapshot:()=>({state,mode,playing,modal})};', context);
  return { app: context.app, transport, elements, storage, document, intervals };
}

const firstWing = [
  { type: 'interact', id: 'bunk' }, { type: 'interact', id: 'cellDoor' },
  { type: 'solve', id: 'laundryLocker', value: '714' },
  { type: 'interact', id: 'intakeDoor' }, { type: 'interact', id: 'transferDesk' },
  { type: 'interact', id: 'transferDoor' },
];

test('closing an inspection cannot transfer an outstanding co-op acknowledgement to another action', () => {
  const { app, transport } = harness();
  const initial = W.newGame(); transport.welcome(initial); app.closeDialog();
  app.openObject('bunk'); app.dispatch({ type: 'interact', id: 'bunk' }); app.closeDialog();
  app.dispatch({ type: 'hint' }); assert.equal(transport.actions.length, 1);
  const result = W.reduce(initial, transport.actions[0]);
  transport.callbacks.onState(result.state, { initial: false, actorId: 'self', event: result.event });
  transport.callbacks.onMessage({ type: 'action-result', ...result });
  app.dispatch({ type: 'hint' });
  assert.equal(transport.actions.length, 2); assert.equal(transport.actions[1].type, 'hint');
});

test('a fresh team can complete a wing already completed solo without overwriting the solo save', () => {
  const { app, transport, storage } = harness();
  app.startSolo(); for (const action of firstWing) app.dispatch(action);
  assert.equal(app.snapshot().modal.kind, 'complete');
  app.goMenu(); const soloSave = storage.get('lockstep.solo.v1');
  let teamState = W.newGame(); transport.welcome(teamState); app.closeDialog();
  for (const action of firstWing) {
    const result = W.reduce(teamState, action); teamState = result.state;
    transport.callbacks.onState(teamState, { initial: false, actorId: 'teammate', event: result.event, message: result.message });
  }
  assert.equal(app.snapshot().modal.kind, 'complete');
  app.persist(); assert.equal(storage.get('lockstep.solo.v1'), soloSave);
});

test('canceling a pending join or starting solo cancels the connection attempt', () => {
  const { app, transport, elements } = harness();
  app.showCoop(); elements.get('create-team').onclick();
  assert.equal(transport.active, true); app.closeDialog();
  assert.equal(transport.active, false); assert.equal(transport.leaves, 1);
  app.showCoop(); elements.get('create-team').onclick(); app.startSolo();
  assert.equal(transport.active, false); assert.equal(transport.leaves, 2);
  assert.equal(app.snapshot().mode, 'solo'); assert.equal(app.snapshot().playing, true);
});

test('a reconnect preserves the current inspection and reconciles a level reached while disconnected', () => {
  const { app, transport } = harness();
  let teamState = W.newGame(); transport.welcome(teamState); app.closeDialog();
  app.openObject('bunk'); transport.welcome(teamState);
  assert.equal(app.snapshot().modal.kind, 'object'); assert.equal(app.snapshot().modal.id, 'bunk');
  for (const action of firstWing) teamState = W.reduce(teamState, action).state;
  teamState = W.reduce(teamState, { type: 'advance' }).state;
  transport.welcome(teamState);
  assert.equal(app.snapshot().state.level, 1); assert.equal(app.snapshot().modal, null);
});

test('an older tab cannot overwrite a newer escape and Continue uses the newer saved run', () => {
  const { app, storage } = harness();
  app.startSolo();
  const newer = W.newGame({ now: app.snapshot().state.startedAt + 1000 });
  const latest = JSON.stringify({ state: newer, room: 'cell', elapsed: 17 });
  storage.set('lockstep.solo.v1', latest);
  app.dispatch({ type: 'interact', id: 'bunk' });
  assert.equal(storage.get('lockstep.solo.v1'), latest);
  app.goMenu(); app.startSolo(true);
  assert.equal(app.snapshot().state.startedAt, newer.startedAt);
  assert.equal(app.snapshot().state.inventory.length, 0);
});

test('a stale tab cannot replace a higher revision of the same solo run', () => {
  const { app, storage } = harness();
  app.startSolo(); let newer = app.snapshot().state;
  for (const action of firstWing.slice(0, 3)) newer = W.reduce(newer, action).state;
  const latest = JSON.stringify({ state: newer, room: 'gallery', elapsed: 24 });
  storage.set('lockstep.solo.v1', latest);
  app.dispatch({ type: 'interact', id: 'bunk' });
  assert.equal(storage.get('lockstep.solo.v1'), latest);
  app.goMenu(); app.startSolo(true);
  assert.equal(app.snapshot().state.revision, newer.revision);
  assert.equal(app.snapshot().state.flags.laundryOpen, true);
});

test('the periodic autosave does not run in a hidden tab', () => {
  const { app, storage, document, intervals } = harness();
  app.startSolo(); storage.delete('lockstep.solo.v1');
  const timer = intervals.find(entry => entry.delay === 5000);
  assert(timer);
  document.hidden = true; timer.fn();
  assert.equal(storage.has('lockstep.solo.v1'), false);
  document.hidden = false; timer.fn();
  assert.equal(storage.has('lockstep.solo.v1'), true);
});
