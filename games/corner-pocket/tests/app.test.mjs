import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../public/engine.mjs';

// Exercise the shipped event handlers and real engine without requiring WebGL or
// a browser process. This is a deliberately small DOM adapter, not a layout test.
const source = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
const markup = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.attributes = new Map(); this.children = []; this.parentElement = null;
    this.dataset = {}; this.style = { setProperty() {} }; this.listeners = new Map();
    this.hidden = false; this.disabled = false; this.open = false; this.value = '';
    this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !classes.has(name) : !!force;
        if (enabled) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' '); return enabled;
      }
    };
  }
  setAttribute(name, value = '') {
    value = String(value); this.attributes.set(name, value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
    if (name === 'value') this.value = value;
    if (name === 'open') this.open = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get id() { return this.getAttribute('id') || ''; }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.attributes.set('class', value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) {
    for (const child of children) { child.parentElement = this; this.children.push(child); }
  }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  matches(selector) {
    const attribute = selector.match(/\[([^\]]+)\]/)?.[1];
    if (attribute === 'open' && !this.open) return false;
    if (attribute && attribute !== 'open' && !this.attributes.has(attribute)) return false;
    const base = selector.replace(/\[[^\]]+\]/, '');
    if (!base) return true;
    if (base.startsWith('.')) return this.classList.contains(base.slice(1));
    if (base.startsWith('#')) return this.id === base.slice(1);
    return this.tagName === base.toUpperCase();
  }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, extra = {}) {
    if (type === 'click' && this.disabled) return [];
    const event = { target: this, currentTarget: this, button: 0, pointerId: 1, detail: 1,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    return (this.listeners.get(type) || []).map(listener => listener(event));
  }
  click() { this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatch('close'); } }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function makeDocument(html) {
  const document = new Element('document', null); document.ownerDocument = document;
  document.createElement = tag => new Element(tag, document);
  document.getElementById = id => document.querySelector(`#${id}`);
  const stack = [document], voidTags = new Set(['meta', 'link', 'input', 'br', 'hr', 'img', 'source']);
  for (const token of html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g) || []) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (!token.startsWith('<')) { stack.at(-1)._text += token; continue; }
    const tag = token.match(/^<([^\s/>]+)/)[1].toLowerCase(), node = document.createElement(tag);
    const attributes = token.slice(tag.length + 1, token.endsWith('/>') ? -2 : -1);
    for (const match of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
      node.setAttribute(match[1], match[2] ?? match[3] ?? match[4] ?? '');
    stack.at(-1).append(node);
    if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
  }
  document.body = document.querySelector('body'); document.documentElement = document.querySelector('html');
  document.hidden = false; document.fullscreenElement = null;
  return document;
}

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const drain = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

async function harness({ url = 'https://pool.example/', savedSession = null } = {}) {
  const document = makeDocument(markup), window = new Element('window', document);
  let now = 0, serial = 0, raf = [], saved = savedSession;
  const timers = new Map(), storage = new Map(), onlineInstances = [], renders = [];
  const location = { href: url };
  const renderer = { kind: 'webgl', canvas: document.getElementById('table'), resize() {},
    setView(value) { this.view = value; }, screenToTable(x, z) { return { x, z }; },
    render(game, options) { renders.push({ game: structuredClone(game), options: { ...options } }); } };
  class OnlineStub {
    static saved() { return saved; }
    constructor(callbacks) {
      this.callbacks = callbacks; this.session = null; this.snapshot = null;
      this.alive = false; this.connected = false; this.commands = []; this.revision = 0;
      onlineInstances.push(this);
    }
    emit(snapshot) { this.snapshot = structuredClone(snapshot); this.callbacks.onSnapshot(this.snapshot); }
    status(status, message = '') {
      this.connected = status === 'online'; this.callbacks.onStatus(status, message);
    }
    lobby(name = 'Player 1', seatIndex = 0) {
      this.alive = true; this.session = { code: 'ABC234', token: 'a'.repeat(64), seatIndex };
      saved = { ...this.session };
      this.emit({ code: 'ABC234', phase: 'lobby', game: null, rackId: null,
        seats: [{ index: 0, name, occupied: true, connected: true, ready: true, score: 0 },
          { index: 1, name: 'Friend', occupied: false, connected: false, ready: false, score: 0 }],
        hostIndex: 0, rematchVotes: [], claimAvailable: [false, false], revision: ++this.revision });
      this.status('online');
    }
    async create(name) {
      if (this.createGate) await this.createGate.promise;
      this.lobby(name); return { ok: true };
    }
    async join(code, name) { this.joinedCode = code; this.lobby(name, 1); return { ok: true }; }
    async resume() { this.lobby('Returning player', saved?.seatIndex || 0); return { ok: true }; }
    addFriend() {
      const state = structuredClone(this.snapshot);
      state.seats[1] = { ...state.seats[1], occupied: true, connected: true, ready: true };
      state.revision = ++this.revision; this.emit(state);
    }
    async command(action, payload = {}) {
      this.commands.push({ action, payload });
      if (action === 'aim') return { ok: true };
      if (this.commandGate) { const gate = this.commandGate; this.commandGate = null; return gate.promise; }
      const state = structuredClone(this.snapshot);
      if (action === 'start') {
        state.game = engine.createGame({ names: state.seats.map(seat => seat.name), mode: 'online', seed: 9 });
        state.rackId = state.game.id; state.phase = 'playing';
      } else if (action === 'shoot') {
        const result = engine.shoot(state.game, payload); if (!result.ok) throw new Error(result.error);
      } else if (action === 'place') {
        const result = engine.placeCue(state.game, payload); if (!result.ok) throw new Error(result.error);
      } else if (action === 'rematch') state.rematchVotes.push(this.session.seatIndex);
      state.revision = ++this.revision; this.emit(state); return { ok: true };
    }
    async leave() { this.destroy(); if (this.leaveGate) await this.leaveGate.promise; }
    destroy(clear = true) { this.alive = false; this.connected = false; this.session = null; this.snapshot = null; if (clear) saved = null; }
  }
  class AudioStub {
    constructor(enabled) { this.enabled = enabled; }
    unlock() {}
    setEnabled(value) { this.enabled = value; }
    process() {}
  }
  const context = vm.createContext({ ...engine, document, window, location,
    createRenderer: () => renderer, OnlineRoom: OnlineStub, PoolAudio: AudioStub,
    performance: { now: () => now }, URL, Date, console, structuredClone,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    history: { replaceState(_state, _title, next) { location.href = String(next); } },
    navigator: { clipboard: { async writeText() {} } }, matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) { raf.push(callback); return ++serial; },
    setTimeout(callback) { timers.set(++serial, callback); return serial; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) { timers.set(++serial, callback); return serial; },
    clearInterval(id) { timers.delete(id); },
    ResizeObserver: class { observe() {} }
  });
  vm.runInContext(source.replace(/^import .*;\s*$/gm, '') + `
globalThis.__inspect = () => ({ mode, screen, game, pending, menuBusy, placing, placement, aim, power, spin, calledPocket, snapshot, connection });
`, context, { filename: 'public/app.mjs' });
  await drain();
  const get = id => document.getElementById(id);
  return { document, window, get, online: onlineInstances[0], renderer, renders, context,
    state: () => context.__inspect(),
    async fire(id, type = 'click', event = {}) { const node = typeof id === 'string' ? get(id) : id; await Promise.all(node.dispatch(type, event)); await drain(); },
    async pointer(x, z) {
      await this.fire('table', 'pointerdown', { clientX: x, clientY: z });
      await this.fire('table', 'pointerup', { clientX: x, clientY: z });
    },
    async frame(milliseconds = 16) {
      now += milliseconds; const callbacks = raf; raf = [];
      for (const callback of callbacks) callback(now);
      await drain();
    },
    async settle() {
      for (let i = 0; i < 1000 && this.state().game.phase === 'rolling'; i++) await this.frame(60);
      assert.notEqual(this.state().game.phase, 'rolling', 'the rendered local game should settle');
    }
  };
}

test('shipped local UI plays two shots, pauses for help and requires ball-in-hand placement', async () => {
  const h = await harness();
  assert.equal(h.get('menu').hidden, false); assert.equal(h.get('pocketButtons').children.length, 6);
  h.get('playerName').value = 'Chris'; await h.fire('localButton');
  assert.equal(h.get('localDialog').open, true);
  h.get('localName1').value = 'Guest'; await h.fire('localForm', 'submit');
  assert.equal(h.state().screen, 'game'); assert.equal(h.state().mode, 'local');
  assert.equal(h.state().game.players[0].name, 'Chris'); assert.equal(h.get('shootButton').disabled, false);
  // A soft sideways break deliberately misses the rack and grants ball in hand.
  h.get('power').value = '5'; await h.fire('power', 'input');
  await h.pointer(-.635, .35); await h.fire('shootButton');
  assert.equal(h.state().game.shotNumber, 1); assert.equal(h.state().game.phase, 'rolling');
  await h.fire('helpButton');
  const paused = h.state().game.balls[0].z; await h.frame(60); await h.frame(60);
  assert.equal(h.state().game.balls[0].z, paused);
  await h.fire(h.document.querySelector('[data-close]'));
  await h.settle();
  assert.equal(h.state().game.turn, 1); assert.equal(h.state().game.ballInHand, true);
  assert.equal(h.get('shootButton').disabled, true); assert.equal(h.state().placing, true);
  await h.pointer(-.7, -.2);
  assert.equal(h.state().game.cuePlaced, true); assert.equal(h.state().placing, false);
  assert.equal(h.get('shootButton').disabled, false);
  await h.pointer(.635, 0); await h.fire('shootButton');
  assert.equal(h.state().game.shotNumber, 2); assert.equal(h.state().game.phase, 'rolling');
  await h.settle(); assert.equal(h.state().game.phase, 'aiming');
});

test('practice exposes free cue placement, re-racking and working camera, guide, spin and power controls', async () => {
  const h = await harness(); await h.fire('practiceButton');
  assert.equal(h.state().mode, 'practice'); assert.equal(h.get('placeButton').hidden, false);
  await h.fire('placeButton'); assert.equal(h.state().placing, true);
  await h.pointer(-.5, .2); assert.equal(h.state().game.balls[0].x, -.5);
  await h.fire('cameraButton'); assert.equal(h.renderer.view, 'overhead');
  await h.fire('guideButton'); assert.equal(h.get('guideButton').getAttribute('aria-pressed'), 'false');
  await h.fire('spinButton'); assert.equal(h.get('spinPanel').hidden, false);
  h.get('spin').value = '-50'; await h.fire('spin', 'input'); assert.equal(h.state().spin, -.5);
  h.get('power').value = '52'; await h.fire('power', 'input'); assert.equal(h.state().power, .52);
  await h.fire('resetSpinButton'); assert.equal(h.state().spin, 0);
  const firstRack = h.state().game.id; await h.fire('gameMenuButton');
  assert.equal(h.get('rerackButton').hidden, false); await h.fire('rerackButton');
  assert.notEqual(h.state().game.id, firstRack); assert.equal(h.get('gameMenuDialog').open, false);
  await h.fire('gameMenuButton'); await h.fire('leaveGameButton');
  assert.equal(h.state().screen, 'menu'); assert.equal(h.get('menu').hidden, false);
});

test('online lobby, pending errors, opponent disconnect and ball-in-hand use shipped UI callbacks', async () => {
  const h = await harness(); h.get('playerName').value = 'Chris';
  await h.fire('hostButton'); assert.equal(h.state().screen, 'lobby');
  assert.equal(h.get('lobbyCode').textContent, 'ABC234'); assert.equal(h.get('startButton').disabled, true);
  h.online.addFriend(); assert.equal(h.get('startButton').disabled, false);
  await h.fire('startButton'); assert.equal(h.state().screen, 'game'); assert.equal(h.state().mode, 'online');
  const gate = deferred(); h.online.commandGate = gate;
  const taking = h.fire('shootButton'); await drain();
  assert.equal(h.state().pending, true); assert.equal(h.get('shootButton').disabled, true);
  gate.reject(new Error('The table could not take that shot.')); await taking;
  assert.equal(h.state().pending, false); assert.equal(h.get('shootButton').disabled, false);
  assert.match(h.get('toast').textContent, /could not take/);
  const state = structuredClone(h.online.snapshot);
  state.seats[1].connected = false; h.online.emit(state);
  assert.equal(h.get('shootButton').disabled, true); assert.match(h.get('connectionText').textContent, /disconnected/);
  state.seats[1].connected = true; state.game.shotNumber = 1;
  state.game.ballInHand = true; state.game.cuePlaced = false; h.online.emit(state);
  assert.equal(h.state().placing, true); await h.pointer(-.7, -.2);
  assert.equal(h.state().game.cuePlaced, true); assert.equal(h.get('shootButton').disabled, false);
  await h.fire('shootButton'); assert.equal(h.state().game.phase, 'rolling');
});

test('an 8-ball pocket must be selected and online rematch waits for the other player', async () => {
  const h = await harness(); await h.fire('hostButton'); h.online.addFriend(); await h.fire('startButton');
  const state = structuredClone(h.online.snapshot);
  state.game.breakShot = false; state.game.shotNumber = 2;
  state.game.players[0].group = 'solids'; state.game.players[1].group = 'stripes';
  for (const ball of state.game.balls) if (ball.id > 0 && ball.id < 8) ball.pocketed = true;
  h.online.emit(state);
  assert.equal(h.get('pocketCall').hidden, false); assert.equal(h.get('shootButton').disabled, true);
  await h.fire(h.get('pocketButtons').children[2]);
  assert.equal(h.state().calledPocket, 2); assert.equal(h.get('shootButton').disabled, false);
  state.game.phase = 'finished'; state.game.winner = 0; state.game.message = 'Chris wins the rack.';
  state.seats[0].score = 1; state.phase = 'finished'; h.online.emit(state);
  assert.equal(h.get('result').hidden, false); assert.equal(h.get('rackScore').textContent, '1 : 0');
  await h.fire('rematchButton');
  assert.equal(h.get('rematchButton').disabled, true); assert.match(h.get('rematchButton').textContent, /Waiting/);
  assert.equal(h.state().game.phase, 'finished');
});

test('an invite pre-fills joining and opening failures leave the menu usable', async () => {
  const h = await harness({ url: 'https://pool.example/?room=ABC234' });
  assert.equal(h.get('roomCode').value, 'ABC234');
  assert.match(h.get('menu').querySelector('.intro').textContent, /press Join/);
  const gate = deferred(); h.online.createGate = gate;
  const opening = h.fire('hostButton'); await drain();
  assert.equal(h.get('joinButton').disabled, true); assert.equal(h.get('practiceButton').disabled, true);
  gate.reject(new Error('No table is available.')); await opening;
  assert.equal(h.get('menuError').hidden, false); assert.equal(h.get('hostButton').disabled, false);
  assert.equal(h.state().screen, 'menu');
  h.online.createGate = null; await h.fire('joinButton');
  assert.equal(h.online.joinedCode, 'ABC234'); assert.equal(h.online.session.seatIndex, 1);
  assert.equal(h.get('startButton').disabled, true); assert.match(h.get('startButton').textContent, /host/);
});

test('finishing an older online leave cannot overwrite a newly started practice rack', async () => {
  const h = await harness(); await h.fire('hostButton'); h.online.addFriend(); await h.fire('startButton');
  const gate = deferred(); h.online.leaveGate = gate;
  const leaving = h.fire('leaveGameButton'); await drain();
  assert.equal(h.state().screen, 'menu'); await h.fire('practiceButton');
  const newRack = h.state().game.id; gate.resolve(); await leaving;
  assert.equal(h.state().mode, 'practice'); assert.equal(h.state().game.id, newRack);
});
