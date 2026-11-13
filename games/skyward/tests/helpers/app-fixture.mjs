import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as campaign from '../../public/campaign.mjs';
import * as settingsModule from '../../public/settings.mjs';
import * as keybindings from '../../public/keybindings.mjs';
import * as gunship from '../../public/gunship.mjs';
import * as arena from '../../public/arena.mjs';
import * as terrain from '../../public/terrain.mjs';
import * as multiplayerUI from '../../public/multiplayer-ui.mjs';
import * as payloads from '../../public/payloads.mjs';
import * as operations from '../../public/operations.mjs';
import * as logbook from '../../public/logbook.mjs';
import * as operationsUI from '../../public/operations-ui.mjs';
import { FlightSimulation } from '../../public/sim.mjs';
import { terrainHeight } from '../../public/sim.mjs';
import { FlightControls } from '../../public/controls.mjs';
import { GunnerControls } from '../../public/gunner-controls.mjs';
import { FixedStepClock, FlightPresentation } from '../../public/presentation.mjs';
import { CombatFeedback } from '../../public/combat-feedback.mjs';

// Execute the actual application with small browser adapters. These are boundary
// substitutes for DOM/graphics/transport, not a second implementation of its
// lifecycle. Real input, physics, snapshots and presentation modules are retained.
class Element {
  constructor(tagName = 'DIV', attributes = {}) {
    this.tagName = tagName.toUpperCase(); this.attributes = attributes;
    this.id = attributes.id || ''; this.handlers = {}; this.children = [];
    this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value]));
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.value = attributes.value || ''; this.textContent = ''; this.hidden = 'hidden' in attributes;
    this.captures = new Set(); this.open = false; this.childQueries = new Map();
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, force) { const enabled = force ?? !classes.has(name); if (enabled) classes.add(name); else classes.delete(name); return enabled; } };
  }
  set innerHTML(value) {
    this._html = value;
    if (this.tagName === 'SELECT' && !this.value) this.value = /<option value="([^"]+)"/.exec(value)?.[1] || '';
  }
  get innerHTML() { return this._html || ''; }
  addEventListener(name, callback, capture = false) { (this.handlers[name] ||= []).push({ callback, capture: capture === true }); }
  removeEventListener(name, callback) { this.handlers[name] = (this.handlers[name] || []).filter(handler => handler.callback !== callback); }
  dispatch(name, fields = {}) {
    const event = { target: this, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; }, ...fields };
    for (const handler of [...(this.handlers[name] || [])].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      handler.callback(event); if (event.stopped) break;
    }
    return event;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  appendChild(element) { this.children.push(element); this.onAppend?.(element); return element; }
  querySelector(selector) {
    if (!this.childQueries.has(selector)) this.childQueries.set(selector, new Element());
    return this.childQueries.get(selector);
  }
  querySelectorAll() { return []; }
  closest(selector) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) && selector.includes('input,select,textarea')) return this;
    if (selector.startsWith('#') && selector.slice(1) === this.id) return this;
    return null;
  }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  blur() {}
  getContext() { return new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } }); }
}

function browserDocument(html) {
  const document = new Element('DOCUMENT'), elements = [], ids = new Map();
  for (const [, tag, source] of html.matchAll(/<([a-z][a-z0-9-]*)([^>]*)>/gi)) {
    const attributes = Object.fromEntries([...source.matchAll(/([a-z][a-z0-9-]*)(?:="([^"]*)")?/gi)].map(([, key, value]) => [key, value || '']));
    const element = new Element(tag, attributes); elements.push(element); if (element.id) ids.set(element.id, element);
    element.onAppend = child => { elements.push(child); if (child.id) ids.set(child.id, child); };
  }
  for (const [, id, options] of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected = /<option value="([^"]+)"[^>]* selected/.exec(options)?.[1] || /<option value="([^"]+)"/.exec(options)?.[1];
    if (selected && ids.has(id)) ids.get(id).value = selected;
  }
  document.body = elements.find(element => element.tagName === 'BODY');
  document.documentElement = elements.find(element => element.tagName === 'HTML');
  document.createElement = tag => new Element(tag);
  document.getElementById = id => ids.get(id) || null;
  document.querySelectorAll = selector => elements.filter(element => {
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    const tag = /^[a-z][a-z0-9-]*/i.exec(selector)?.[0];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    for (const [, name] of selector.matchAll(/\.([a-z0-9-]+)/gi)) if (!element.classList.contains(name)) return false;
    for (const [, name, value] of selector.matchAll(/\[([a-z0-9-]+)(?:="([^"]*)")?\]/gi)) {
      if (!(name in element.attributes) || value !== undefined && element.attributes[name] !== value) return false;
    }
    return true;
  });
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  ids.get('startup-steps').children = Array.from({ length: 4 }, () => new Element());
  return document;
}

class RelayAdapter {
  constructor(callbacks) {
    this.callbacks = callbacks; this.code = ''; this.id = ''; this.connected = false; this.isHost = false;
    this.roster = []; this.mode = 'squadron'; this.config = null; this.actions = []; this.roomState = 'lobby'; this.role = 'pilot'; this.sent = []; this.starts = []; this.worlds = []; this.poses = [];
  }
  sendCrewInput(input, { reset = false } = {}) { this.sent.push({ ...input, ...(reset ? { reset: true } : {}) }); return true; }
  sendPose(player) { this.poses.push({ ...player }); return true; }
  sendWorld(snapshot) { this.worlds.push(snapshot); return true; }
  samplePlayers() { return this.remote || []; }
  samplePilot() { return this.pilot || null; }
  start(id) { this.starts.push(id); return true; }
  leave() { this.code = ''; this.id = ''; this.connected = false; this.roster = []; }
  ready() {}
  setMission() {}
  configure(config) { this.config = config; }
  setLoadout(aircraft, startMode, payload) { this.aircraft = aircraft; this.startMode = startMode; this.payload = payload; }
  sendAction(action) { this.actions.push(action); return true; }
  returnToLobby() { this.lobbyRequested = true; }
}
class RendererAdapter {
  constructor(canvas) { this.canvas = canvas; }
  loadMission(mission) { this.mission = mission; }
  resize() {}
  setSettings() {}
  render(view, dt, options) { this.lastRender = { player: structuredClone(view.player), options }; }
  renderMenu() {}
  project() { return { x: 0, y: 0, visible: false }; }
}
class AudioAdapter {
  constructor(){this.cues=[];}
  unlock() { return Promise.resolve(); }
  setSettings() {}
  setActive(value) { this.active = value; }
  cue(kind,details){if(this.active)this.cues.push({kind,details});}
  update() {}
}

export async function appFixture(t) {
  const [html, source] = await Promise.all([
    readFile(new URL('../../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../public/app.mjs', import.meta.url), 'utf8'),
  ]);
  const document = browserDocument(html), window = new Element('WINDOW');
  window.visualViewport = new Element(); window.scrollTo = () => {};
  const matchMedia = () => ({ matches: false, addEventListener() {} }); window.matchMedia = matchMedia;
  const stored = new Map(), localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const replacements = { document, window, localStorage, matchMedia }, previous = {};
  for (const [key, value] of Object.entries(replacements)) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const key of Object.keys(replacements)) if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else delete globalThis[key]; });
  let clock = 1000, timer = 0;
  const context = vm.createContext({ ...campaign, ...settingsModule, ...keybindings, ...gunship, ...arena, ...terrain, ...multiplayerUI, ...payloads, ...operations, ...logbook, ...operationsUI, FlightSimulation, terrainHeight,
    FlightControls, GunnerControls, FixedStepClock, FlightPresentation, CombatFeedback,
    SquadronClient: RelayAdapter, FlightRenderer: RendererAdapter, SoftwareFlightRenderer: RendererAdapter, FlightAudio: AudioAdapter,
    ...replacements, performance: { now: () => clock }, console, URL, structuredClone,
    location: { href: 'https://example.test/', protocol: 'https:', host: 'example.test' }, navigator: {},
    innerWidth: 1200, innerHeight: 800, requestAnimationFrame() {}, setTimeout() { return ++timer; }, clearTimeout() {} });
  // Imports are provided above; the rest of app.mjs runs verbatim. Inspectable
  // bindings are appended only in this test VM, never to the shipped application.
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '') + '\nglobalThis.__app = { get team(){return team}, get sim(){return sim}, get screen(){return screen}, get renderer(){return renderer}, get audio(){return audio}, get paused(){return paused}, get flightLog(){return flightLog}, get flightRecordResult(){return flightRecordResult}, get spectatorView(){return spectatorView}, controls, gunnerControls, frame, startMission, renderOperations, openOperations, openFlightLog };', context);
  const app = context.__app;
  t.after(() => { app.controls.destroy(); app.gunnerControls.destroy(); });
  return { app, document, window, stored, frame: (delta = 17) => { clock += delta; app.frame(clock); } };
}
