import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as world from '../public/world.mjs';
import {movementVector,FirstPersonControls} from '../public/controls.js';
import * as settingsApi from '../public/settings.js';
import {annexCase} from '../public/annex.mjs';

const controller=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\r?\n/gm,'');
const controlsSource=(await readFile(new URL('../public/controls.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const markup=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
function harness(options = {}) {
  const elements = new Map(), nodes = new Set(), timers = new Map();
  const storage = options.storage || new Map(), writes = [], events = { window: new Map(), document: new Map() };
  let transport, audio, control, document, timerId = 0, clock = 100;
  const addListener = (map, type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };
  const removeListener = (map, type, fn) => map.set(type, (map.get(type) || []).filter(item => item !== fn));
  const emit = (surface, type, extra = {}) => {
    const event = { type, target: surface === 'window' ? document.activeElement || document.body : document, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...extra };
    for (const fn of [...(events[surface].get(type) || [])]) fn(event);
    return event;
  };
  const style = () => ({ setProperty(key, value) { this[key] = String(value); }, getPropertyValue(key) { return this[key] || ''; } });
  class Element {
    constructor(id = '', tagName = 'div') {
      this.id = id; this.tagName = tagName.toUpperCase(); this.hidden = false; this.disabled = false; this.checked = false; this.value = '';
      this.style = style(); this.dataset = {}; this.attributes = new Map(); this.listeners = {}; this.children = []; this.childNodes = [];
      const classes = new Set();
      this.classList = {
        add(...items) { items.forEach(item => classes.add(item)); },
        remove(...items) { items.forEach(item => classes.delete(item)); },
        contains(item) { return classes.has(item); },
        toggle(item, force) { const enabled = force === undefined ? !classes.has(item) : !!force; if (enabled) classes.add(item); else classes.delete(item); return enabled; },
      };
      nodes.add(this);
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); }
    emit(type, extra = {}) {
      const event = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const fn of this.listeners[type] || []) fn(event);
      return event;
    }
    click() { if (!this.disabled) this.emit('click'); }
    setAttribute(name, value = '') {
      value = String(value); this.attributes.set(name, value);
      if (name === 'id') { this.id = value; elements.set(value, this); }
      else if (name === 'class') { this.className = value; this.classList.add(...value.split(/\s+/).filter(Boolean)); }
      else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      else if (['hidden', 'disabled', 'checked'].includes(name)) this[name] = true;
      else this[name] = value;
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); if (['hidden', 'disabled', 'checked'].includes(name)) this[name] = false; }
    toggleAttribute(name, enabled = !this.hasAttribute(name)) { if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name); return !!enabled; }
    focus() { if (document) document.activeElement = this; }
    set innerHTML(value) {
      this.html = String(value);
      const remove = node => { node.childNodes.forEach(remove); nodes.delete(node); if (node.id && elements.get(node.id) === node) elements.delete(node.id); };
      this.childNodes.forEach(remove);
      this.childNodes = parse(this.html); this.children = this.childNodes;
      this.childNodes.forEach(node => { node.parentNode = this; });
    }
    get innerHTML() { return this.html || ''; }
    insertBefore(element) { nodes.add(element); if (element.id) elements.set(element.id, element); this.childNodes.push(element); this.children = this.childNodes; element.parentNode = this; }
    querySelectorAll(selector) { return this.childNodes.filter(node => matches(node, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 428, bottom: 926, width: 428, height: 926 }; }
  }
  function parse(html) {
    const result = [];
    for (const tag of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
      const element = new Element('', tag[1]);
      for (const attr of tag[2].matchAll(/([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
      }
      result.push(element);
    }
    return result;
  }
  function matches(element, selector) {
    return selector.split(',').some(part => {
      let simple = part.trim().split(/\s+/).at(-1);
      if (simple.startsWith('#')) return element.id === simple.slice(1);
      if (simple.startsWith('.')) return element.classList.contains(simple.slice(1));
      const tag = /^([a-z][a-z0-9-]*)/i.exec(simple)?.[1];
      if (tag && element.tagName !== tag.toUpperCase()) return false;
      const attributes = [...simple.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
      return attributes.length > 0 && attributes.every(([, name, value]) => element.hasAttribute(name) && (value === undefined || element.getAttribute(name) === value));
    });
  }
  parse(markup);
  document = {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: selector => [...nodes].filter(node => matches(node, selector)),
    querySelector: selector => [...nodes].find(node => matches(node, selector)) || null,
    body: new Element('body'), documentElement: new Element('html'), hidden: false,
    addEventListener: (type, fn) => addListener(events.document, type, fn),
    removeEventListener: (type, fn) => removeListener(events.document, type, fn),
    createElement: tag => new Element('', tag),
  };
  const nativeLock = {
    requests: 0, exits: 0,
    release() { document.pointerLockElement = null; emit('document', 'pointerlockchange'); },
  };
  if (options.realControls) {
    elements.get('world').requestPointerLock = () => {
      nativeLock.requests++; document.pointerLockElement = elements.get('world'); emit('document', 'pointerlockchange'); return Promise.resolve();
    };
    document.exitPointerLock = () => { nativeLock.exits++; nativeLock.release(); };
  }
  class FirstPersonControls {
    constructor(config) {
      this.options = config; this.pose = { x: 0, z: 3.2, yaw: 0, pitch: 0, crouch: false }; this.enabled = false;
      this.mouseLookEnabled = true; this.mouseLookLocked = false; this.mouseLookRequests = 0; this.mouseLookReleases = 0;
      this.mouseLookReason = options.mouseLookSupported === false ? 'unsupported' : 'ready';
      control = this;
    }
    setPose(pose) { this.pose = { ...pose, pitch: pose.pitch || 0, crouch: !!pose.crouch }; }
    setEnabled(value) { this.enabled = !!value; if (!this.enabled) this.releaseMouseLook(); this.mouseLookStatus(); }
    setMouseLookEnabled(value) {
      if (this.mouseLookEnabled === !!value) { this.mouseLookStatus(); return; }
      this.mouseLookEnabled = !!value;
      if (!value) this.releaseMouseLook();
      this.mouseLookStatus(!value ? 'disabled' : options.mouseLookSupported === false ? 'unsupported' : 'ready');
    }
    mouseLookStatus(reason = this.mouseLookReason) { this.mouseLookReason = reason; this.options.onMouseLook?.({ supported: options.mouseLookSupported !== false, enabled: this.mouseLookEnabled, locked: this.mouseLookLocked, pending: false, reason }); }
    requestMouseLook() {
      this.mouseLookRequests++;
      if (!this.enabled || !this.mouseLookEnabled || options.touch) return Promise.resolve(false);
      const allowed = options.mouseLookSupported !== false && options.mouseLookDenied !== true;
      this.mouseLookLocked = allowed; document.pointerLockElement = allowed ? this.options.canvas : null;
      this.mouseLookStatus(allowed ? 'locked' : options.mouseLookSupported === false ? 'unsupported' : 'denied');
      return Promise.resolve(allowed);
    }
    releaseMouseLook() { const active = this.mouseLookLocked; this.mouseLookReleases++; this.mouseLookLocked = false; document.pointerLockElement = null; if (active) this.mouseLookStatus(this.mouseLookEnabled ? 'released' : 'disabled'); }
    update() { return false; }
    toggleCrouch() { if (this.enabled) { this.pose.crouch = !this.pose.crouch; this.options.onCrouch?.(this.pose.crouch); } }
  }
  class PrisonAudio {
    constructor(config = {}) {
      this.options = config; this.enabled = config.enabled ?? false; this.volume = config.volume ?? 0.6; this.atmosphere = config.atmosphere ?? 0.55;
      this.active = false; this.unlocked = false; this.room = 'holding'; this.unlocks = 0; this.cues = []; this.updates = []; this.signals = []; this.signalStops = []; audio = this;
    }
    getStatus() {
      const supported = options.audioSupported !== false;
      const ready = this.unlocked && supported && options.audioUnlock !== false;
      const playing = this.enabled && this.active && !document.hidden && ready && this.volume > 0;
      return { enabled: this.enabled, volume: this.volume, atmosphere: this.atmosphere, active: this.active, hidden: document.hidden, supported, unlocked: this.unlocked, ready, playing, state: ready ? 'running' : supported ? 'locked' : 'unavailable', needsGesture: this.enabled && supported && !ready, message: !this.enabled ? 'Sound off.' : !supported ? 'Sound unavailable.' : ready ? 'Sound on.' : 'Tap Sound to start or resume audio.' };
    }
    emit() { this.options.onStatus?.(this.getStatus()); }
    setEnabled(value) { this.enabled = !!value; this.emit(); }
    setVolume(value) { this.volume = value; this.emit(); }
    setAtmosphere(value) { this.atmosphere = value; this.emit(); }
    setRoom(value) { this.room = value; }
    setActive(value) { this.active = !!value; this.emit(); }
    unlock() { this.unlocks++; this.unlocked = this.enabled && options.audioSupported !== false && options.audioUnlock !== false; this.emit(); return Promise.resolve(this.unlocked); }
    update(value) { this.updates.push(value); return 0; }
    cue(kind) { if (!this.getStatus().playing) return false; this.cues.push(kind); return true; }
    playPuzzleSignal(packets, callbacks = {}) { this.signals.push({packets, callbacks}); return options.signalPromise || Promise.resolve(options.signalResult || {ok:true,duration:8.08}); }
    playPuzzleTone(tone, callbacks = {}) { this.signals.push({tone, callbacks}); return options.signalPromise || Promise.resolve(options.signalResult || {ok:true,duration:.48}); }
    stopPuzzleSignal(reason) { this.signalStops.push(reason); this.signals.at(-1)?.callbacks.onEnded?.({reason}); }
    dispose() { this.active = false; }
  }
  class CoopClient {
    constructor(callbacks) { this.callbacks = callbacks; this.actions = []; this.active = false; this.connected = false; this.leaves = 0; this.presences = []; transport = this; }
    get session() { return { id: 'self', code: 'ABC234', name: 'Test' }; }
    get serverNow() { return Date.now(); }
    get resumeInfo() { return null; }
    create() { this.active = true; this.callbacks.onStatus('connecting', 'Opening…'); }
    join() { this.create(); }
    presence(value) { this.presences.push(value); }
    samplePoses() { return []; }
    leave() { this.active = this.connected = false; this.leaves++; this.callbacks.onStatus('disconnected', 'Left'); }
    sendAction(action) { if (!this.connected) return null; const id = `action-${this.actions.length}`; this.actions.push({ id, action: structuredClone(action) }); return id; }
    welcome(state) { this.active = this.connected = true; this.callbacks.onStatus('connected', 'Ready'); this.callbacks.onRoster([{ id: 'self', name: 'Test', connected: true, room: 'holding' }]); this.callbacks.onState(state, { initial: true }); }
  }
  const scene = { brightness: [], loads: [], presentations: [], loadRoom(room, objects) { this.loads.push(room.id); this.presentations.push(objects); }, setCamera() {}, canMove() { return true; }, resize() {}, setBrightness(value) { this.brightness.push(value); }, render() {}, getTarget() { return null; } };
  const localStorage = {
    getItem(key) { if (options.blockStorage) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (options.blockStorage) throw new Error('Storage blocked'); storage.set(key, String(value)); writes.push(key); },
  };
  const media = query => ({ matches: query.includes('reduced-motion') ? !!options.reduced : query.includes('coarse') ? !!options.touch : query.includes('fine') || query.includes('hover: hover') ? !options.touch : false, addEventListener() {}, removeEventListener() {} });
  const window = { innerWidth: options.touch ? 428 : 1280, innerHeight: options.touch ? 926 : 720, devicePixelRatio: options.touch ? 3 : 1, addEventListener: (type, fn) => addListener(events.window, type, fn), removeEventListener: (type, fn) => removeListener(events.window, type, fn), matchMedia: media };
  const context = vm.createContext({ ...world, ...settingsApi, FirstPersonControls, CoopClient, PrisonAudio, createScene: () => scene, document, window, localStorage, matchMedia: media, requestAnimationFrame: () => 1, setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), URL, Date, Math, console, structuredClone, performance: { now: () => clock }, location: { href: 'https://night-transfer.example/', origin: 'https://night-transfer.example', pathname: '/' }, navigator: { maxTouchPoints: options.touch ? 5 : 0 } });
  vm.runInContext((options.realControls ? controlsSource + '\n' : '') + controller + '\nglobalThis.app={startSolo,returnToMenu,showCoop,showSettings,showPause,showNotebook,showGuidance,showAnnexSetup,closeModal,dispatch,useFocused,openObject,saveSolo,changeSetting,toggleSound,previewSound,syncAudioActivity,refreshFocus,animate,getControls:()=>controls,snapshot:()=>({mode,state,roomId,dialogKind,selected,teamIntent,settings:{...settings},settingsTab,lookUsed,moveUsed,pending:[...pending.keys()],drafts:Object.fromEntries(puzzleDrafts),workingNotes})};', context);
  control = context.app.getControls();
  assert.equal(elements.get('fatal').hidden, true, 'controller startup must not fall into the fatal screen');
  return {
    app: context.app, transport, audio, control, scene, elements, storage, writes, document, window, nativeLock,
    input(id, value) { const element = elements.get(id); assert.ok(element, `input ${id} exists`); element.value = String(value); element.emit('input'); },
    toggle(id, checked) { const element = elements.get(id); assert.ok(element, `toggle ${id} exists`); element.checked = checked; element.emit('change'); },
    emit,
    advance(ms) { clock += ms; },
    flush() { for (let count = 0; timers.size; count++) { assert.ok(count < 100, 'timers should settle'); const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); } },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
const settlePromises = () => new Promise(resolve => setImmediate(resolve));
function join(h){h.app.showCoop();h.elements.get('create-team').click();h.transport.welcome(world.newGame());h.app.closeModal();}
const firstAct=[{type:'interact',id:'bunkPocket'},{type:'interact',id:'holdingDoor'},{type:'solve',id:'routeCabinet',value:['gate','eye','lamp','moon']},{type:'interact',id:'recordsDoor'},{type:'interact',id:'transferDesk'},{type:'interact',id:'transferExit'}];
const ANNEX_SLOT='night-transfer.annex.solo.v1';
function annexFixture(stage=0, extra={}){
  let state=world.newGame({campaign:'annex',seed:41});const data=annexCase(state);
  const rooms=['annexArchive','annexRelay','annexListening','annexRelease'];
  const steps=[['annexRouteLock',data.route,'annexRelayDoor'],['annexRelayBoard',data.switches,'annexListeningDoor'],['annexReceiver',data.code,'annexReleaseDoor']];
  const take=action=>{const result=world.reduce(state,action);assert.equal(result.ok,true,result.message);state=result.state;};
  for(let i=0;i<=stage;i++){
    for(const object of world.getObjects(state,rooms[i]).filter(o=>o.clue))take({type:'interact',id:object.id,room:rooms[i]});
    if(i<stage){take({type:'solve',id:steps[i][0],value:steps[i][1],room:rooms[i]});take({type:'interact',id:steps[i][2],room:rooms[i]});}
  }
  return {version:1,state,room:rooms[stage],pose:world.ROOMS[rooms[stage]].spawn,elapsedSeconds:53,owner:'fixture',savedAt:1,...extra};
}
function annexHarness(stage=0,options={}){
  const storage=options.storage||new Map();storage.set(ANNEX_SLOT,JSON.stringify(annexFixture(stage,options.saved)));
  const h=harness({...options,storage});h.app.startSolo(true,'annex');return h;
}

test('first-person inspection does not collect an item until the player searches',()=>{
  const h=harness();h.app.startSolo();h.app.closeModal();h.app.useFocused({id:'bunkPocket',distance:1.2});
  assert.equal(h.app.snapshot().dialogKind,'object');assert.equal(h.app.snapshot().state.inventory.length,0);
  h.elements.get('object-action').click();assert(h.app.snapshot().state.inventory.includes('holdingKey'));assert.equal(h.app.snapshot().dialogKind,'result');
});

test('Dead Air launches from its own chapter card and resumes without replacing the original solo run',()=>{
  const h=harness();h.app.startSolo();h.app.closeModal();h.app.dispatch(firstAct[0]);h.app.returnToMenu();
  const classic=h.storage.get('night-transfer.solo.v1');h.elements.get('annex-btn').click();
  h.elements.get('guidance-expert').click();h.elements.get('annex-play').click();
  assert.equal(h.app.snapshot().state.campaign,'annex');assert.equal(h.app.snapshot().state.level,3);
  assert.equal(h.app.snapshot().settings.guidance,'expert');assert.match(h.elements.get('dialog-content').innerHTML,/listening-only/);
  assert.equal(h.storage.get('night-transfer.solo.v1'),classic);const seed=h.app.snapshot().state.seed;
  h.app.returnToMenu();h.elements.get('annex-btn').click();assert.match(h.elements.get('dialog-content').innerHTML,/CONTINUE DEAD AIR/);
  h.elements.get('annex-play').click();assert.equal(h.app.snapshot().state.seed,seed);assert.equal(h.app.snapshot().dialogKind,'');
  h.app.returnToMenu();h.app.startSolo(true);assert(h.app.snapshot().state.inventory.includes('holdingKey'));assert.equal(h.app.snapshot().state.campaign,'escape');
});

test('guidance switches preserve hints and partial combinations and refresh both scene and receiver presentation',()=>{
  const h=annexHarness(2);h.app.dispatch({type:'hint'});h.app.openObject(world.OBJECTS.annexReceiver);
  for(const key of ['2','7'])h.emit('window','keydown',{key});const revision=h.app.snapshot().state.revision;
  h.elements.get('signal-guidance').click();h.elements.get('guidance-expert').click();h.elements.get('guidance-done').click();
  assert.equal(h.app.snapshot().state.revision,revision);assert.equal(h.app.snapshot().state.hintsUsed[3],1);
  assert.equal(h.elements.get('puzzle-readout').textContent,'27———');
  assert.match(h.elements.get('dialog-content').innerHTML,/TWO TONES · LISTEN/);assert.doesNotMatch(h.elements.get('dialog-content').innerHTML,/Raw digit:|LOW →|MID →|HIGH →/);
  const receiver=h.scene.presentations.at(-1).find(o=>o.id==='annexReceiver');assert(receiver.puzzle.packets.every(p=>!('tones'in p)&&!('rawDigit'in p)));
  h.elements.get('signal-guidance').click();h.elements.get('guidance-simple').click();h.elements.get('guidance-done').click();
  assert.match(h.elements.get('dialog-content').innerHTML,/Raw digit:/);assert.equal(h.elements.get('puzzle-readout').textContent,'27———');
  assert.equal(h.app.snapshot().state.revision,revision);assert.equal(h.app.snapshot().state.hintsUsed[3],1);
});

test('private working notes, relay drafts and inspected records survive a reload and a return from the notebook',()=>{
  const h=annexHarness(1);h.app.openObject(world.OBJECTS.annexRelayBoard);
  h.document.querySelectorAll('[data-switch]')[2].click();h.document.querySelectorAll('[data-switch]')[4].click();
  h.elements.get('puzzle-notes').click();h.input('working-notes','Route: compare all four rules.\nKeep the sealed checksum.');
  const evidence=h.document.querySelectorAll('[data-note]').find(button=>button.dataset.note==='annexCorrections');assert(evidence);evidence.click();
  assert.match(h.elements.get('dialog-content').innerHTML,/SEALED CASE CHECKSUM/);h.elements.get('back-notes').click();h.elements.get('notebook-return').click();
  assert.equal(h.elements.get('switch-state-2').textContent,'ON');assert.equal(h.elements.get('switch-state-4').textContent,'ON');
  const reloaded=harness({storage:h.storage});reloaded.app.startSolo(true,'annex');reloaded.app.openObject(world.OBJECTS.annexRelayBoard);
  assert.equal(reloaded.elements.get('switch-state-2').textContent,'ON');assert.equal(reloaded.elements.get('switch-state-4').textContent,'ON');
  assert.equal(reloaded.app.snapshot().workingNotes,'Route: compare all four rules.\nKeep the sealed checksum.');
  assert.equal(reloaded.app.snapshot().state.seed,41);assert.equal(reloaded.app.snapshot().roomId,'annexRelay');
});

test('untrusted saved drafts cannot unlock inaccessible puzzles or inject markup into working notes',()=>{
  const h=annexHarness(0,{saved:{drafts:{annexReceiver:'99999',annexInterlock:[9,9,9,9],annexRouteLock:['delta','<script>','wave',{},null]},workingNotes:'<img src=x onerror=alert(1)>'.repeat(200)}});
  assert.deepEqual(plain(h.app.snapshot().drafts),{annexRouteLock:['delta','wave']});assert.equal(h.app.snapshot().workingNotes.length,3000);
  h.app.showNotebook();assert.match(h.elements.get('dialog-content').innerHTML,/&lt;img/);assert.doesNotMatch(h.elements.get('dialog-content').innerHTML,/<img/);
  assert.equal(h.app.snapshot().state.flags.annexRouteSolved,undefined);
});

test('receiver keyboard entry submits on the puzzle surface and leaves focused buttons and notes usable',()=>{
  const h=annexHarness(2);h.app.openObject(world.OBJECTS.annexReceiver);const code=annexCase(h.app.snapshot().state).code;
  for(const key of code)h.emit('window','keydown',{key});assert.equal(h.elements.get('puzzle-readout').textContent,code);
  const before=h.app.snapshot().state.revision;h.elements.get('signal-play').focus();const buttonEnter=h.emit('window','keydown',{key:'Enter'});
  assert.equal(buttonEnter.defaultPrevented,false,'Enter must activate the focused playback button through the browser');assert.equal(h.app.snapshot().state.revision,before);
  h.elements.get('dialog').focus();h.emit('window','keydown',{key:'Backspace'});assert.equal(h.elements.get('puzzle-readout').textContent,code.slice(0,4)+'—');
  h.emit('window','keydown',{key:code[4]});h.emit('window','keydown',{key:'Enter'});assert.equal(h.app.snapshot().state.flags.annexSignalSolved,true);
  assert.equal(h.app.snapshot().drafts.annexReceiver,undefined);assert.equal(h.app.snapshot().dialogKind,'result');
  h.app.showNotebook();h.elements.get('working-notes').focus();const noteKey=h.emit('window','keydown',{key:'7'});assert.equal(noteKey.defaultPrevented,false);
});

test('receiver playback enables audio explicitly, uses the shared signal and never discloses Expert tones in status',async()=>{
  const h=annexHarness(2);h.app.changeSetting('guidance','expert');h.app.openObject(world.OBJECTS.annexReceiver);
  h.elements.get('signal-play').click();await settlePromises();assert.equal(h.app.snapshot().settings.sound,true);
  assert.deepEqual(plain(h.audio.signals.at(-1).packets),world.annexSignal(h.app.snapshot().state).packets);
  const callbacks=h.audio.signals.at(-1).callbacks;callbacks.onProgress({playing:true,packetIndex:2,toneIndex:0,phase:'tone'});
  assert.equal(h.elements.get('signal-status').textContent,'Packet 3 of 5 · listening');assert(h.elements.get('signal-packet-2').classList.contains('playing'));
  callbacks.onEnded({reason:'completed'});assert.match(h.elements.get('signal-status').textContent,/Playback complete/);
  h.document.querySelectorAll('[data-tone]')[0].click();await settlePromises();assert.equal(h.audio.signals.at(-1).tone,'low');
  h.elements.get('signal-stop').click();assert.equal(h.audio.signalStops.at(-1),'stopped');assert.match(h.elements.get('signal-status').textContent,/Playback stopped/);
});

test('closing a receiver cancels playback and stale asynchronous results cannot write into a reopened receiver',async()=>{
  let resolvePlay;const signalPromise=new Promise(resolve=>resolvePlay=resolve);const h=annexHarness(2,{signalPromise});h.app.openObject(world.OBJECTS.annexReceiver);
  h.elements.get('signal-play').click();const old=h.audio.signals.at(-1).callbacks;
  h.app.showNotebook('annexReceiver');assert.equal(h.audio.signalStops.at(-1),'panel-closed');h.elements.get('notebook-return').click();
  const fresh=h.elements.get('signal-status').textContent;old.onProgress({playing:true,packetIndex:1,toneIndex:1});old.onEnded({reason:'completed'});
  resolvePlay({ok:false,reason:'unavailable',message:'stale failure'});await settlePromises();assert.equal(h.elements.get('signal-status').textContent,fresh);
  assert.equal(h.app.snapshot().dialogKind,'object');assert.equal(h.app.snapshot().selected,'annexReceiver');
});

test('a silent receiver reports the remedy and the visual tier remains available with the same run',async()=>{
  const h=annexHarness(2,{signalResult:{ok:false,reason:'volume-zero'}});h.app.changeSetting('guidance','expert');h.app.openObject(world.OBJECTS.annexReceiver);
  h.elements.get('signal-play').click();await settlePromises();assert.match(h.elements.get('signal-status').textContent,/Master volume is at zero/);
  h.elements.get('signal-guidance').click();h.elements.get('guidance-moderate').click();h.elements.get('guidance-done').click();
  assert.match(h.elements.get('dialog-content').innerHTML,/(LOW|MID|HIGH) → (LOW|MID|HIGH)/);assert.doesNotMatch(h.elements.get('dialog-content').innerHTML,/Raw digit:/);
  assert.equal(h.app.snapshot().state.seed,41);assert.equal(h.app.snapshot().state.hintsUsed[3],0);
});

test('a delayed co-op hint acknowledgement cannot replace or stop a receiver the player has since opened',async()=>{
  const h=harness();h.app.showCoop('annex');h.elements.get('create-team').click();h.transport.welcome(annexFixture(2).state);h.app.closeModal();
  h.elements.get('hint-btn').click();h.elements.get('reveal-hint').click();const sent=h.transport.actions.at(-1);
  h.app.openObject(world.OBJECTS.annexReceiver);h.elements.get('signal-play').click();await settlePromises();const stops=h.audio.signalStops.length;
  const result=world.reduce(h.app.snapshot().state,sent.action);h.transport.callbacks.onState(result.state);h.transport.callbacks.onMessage({...result,type:'action-result',actionId:sent.id});
  assert.equal(h.app.snapshot().dialogKind,'object');assert.equal(h.app.snapshot().selected,'annexReceiver');assert.equal(h.audio.signalStops.length,stops);
  assert.equal(h.app.snapshot().state.hintsUsed[3],1);assert.equal(h.app.snapshot().pending.length,0);assert.match(h.elements.get('toast').textContent,/hint log/);
});
test('objects out of reach do not open or mutate the escape',()=>{
  const h=harness();h.app.startSolo();h.app.closeModal();h.app.useFocused({id:'bunkPocket',distance:4});
  assert.equal(h.app.snapshot().dialogKind,'');assert.equal(h.app.snapshot().state.inventory.length,0);
});
test('cancelled joins cannot reopen the game when a late welcome arrives',()=>{
  const h=harness();h.app.showCoop();h.elements.get('create-team').click();assert.equal(h.transport.active,true);
  h.elements.get('close-dialog').click();assert.equal(h.transport.active,false);h.transport.welcome(world.newGame());assert.equal(h.app.snapshot().mode,'menu');assert.equal(h.app.snapshot().teamIntent,false);
});
test('a co-op acknowledgement keeps its original object even after another panel opens',()=>{
  const h=harness();join(h);h.app.openObject(world.OBJECTS.bunkPocket);h.elements.get('object-action').click();const sent=h.transport.actions[0];h.app.closeModal();h.app.openObject(world.OBJECTS.routeMarks);
  const result=world.reduce(h.app.snapshot().state,sent.action);h.transport.callbacks.onState(result.state);h.transport.callbacks.onMessage({...result,type:'action-result',actionId:sent.id});
  assert.equal(h.app.snapshot().selected,'routeMarks');assert.equal(h.app.snapshot().dialogKind,'object');assert.equal(h.app.snapshot().pending.length,0);
});
test('team progress and act transitions never overwrite the solo slot',()=>{
  const h=harness();h.app.startSolo();h.app.dispatch(firstAct[0]);h.app.returnToMenu();const before=h.storage.get('night-transfer.solo.v1');join(h);
  let state=world.newGame();for(const action of firstAct){state=world.reduce(state,action).state;h.transport.callbacks.onState(state,{initial:false});}
  assert.equal(h.app.snapshot().state.level,1);assert.equal(h.app.snapshot().roomId,'laundry');h.app.saveSolo();assert.equal(h.storage.get('night-transfer.solo.v1'),before);
});
test('a delayed door acknowledgement cannot drag a player back into a finished act',()=>{
  const h=harness();join(h);let state=world.newGame();state=world.reduce(state,firstAct[0]).state;h.transport.callbacks.onState(state);
  h.app.dispatch(firstAct[1],{kind:'door',object:world.OBJECTS.holdingDoor});const sent=h.transport.actions[0];const delayed=world.reduce(state,sent.action);state=delayed.state;
  for(const action of firstAct.slice(2))state=world.reduce(state,action).state;
  h.transport.callbacks.onState(state);h.transport.callbacks.onMessage({...delayed,type:'action-result',actionId:sent.id});h.flush();
  assert.equal(h.app.snapshot().state.level,1);assert.equal(h.app.snapshot().roomId,'laundry');assert.equal(h.app.snapshot().dialogKind,'intro');
});
test('an old or hidden tab cannot overwrite the newly claimed solo session',()=>{
  const h=harness();h.app.startSolo();const previous=JSON.parse(h.storage.get('night-transfer.solo.v1'));const newer=JSON.stringify({...previous,owner:'another-tab',savedAt:Date.now()+100});h.storage.set('night-transfer.solo.v1',newer);h.app.dispatch(firstAct[0]);assert.equal(h.storage.get('night-transfer.solo.v1'),newer);
  h.app.startSolo(true);const saved=h.storage.get('night-transfer.solo.v1');h.document.hidden=true;h.app.dispatch(firstAct[0]);assert.equal(h.storage.get('night-transfer.solo.v1'),saved);
});
test('movement is frame-bounded, diagonal-normalized and follows first-person yaw',()=>{
  const forward=movementVector(0,1,0,2,.02),diagonal=movementVector(0,1,1,2,.02);assert.equal(forward.x,0);assert.equal(forward.z,-.04);assert(Math.abs(Math.hypot(diagonal.x,diagonal.z)-.04)<1e-12);
  const left=movementVector(Math.PI/2,1,0,2,.02);assert(Math.abs(left.x+.04)<1e-12);assert(Math.abs(left.z)<1e-12);assert(Math.hypot(...Object.values(movementVector(0,1,0,2,10)))<=.1);
});
test('slow graphics frames retain walking speed through small collision-checked steps',()=>{
  const control={enabled:true,keys:new Set(['w']),stick:{x:0,y:0},sensitivity:1,pose:{x:0,z:0,yaw:0,crouch:false}};let checks=0;
  FirstPersonControls.prototype.update.call(control,.2,()=>{checks++;return true;});
  assert(Math.abs(control.pose.z+.49)<1e-12);assert.equal(checks,8);
});

test('mobile settings apply through real slider and toggle handlers and survive a fresh controller', () => {
  const h = harness({ touch: true });
  h.elements.get('menu-settings').click();
  h.input('buttonScale', 1.2); h.input('stickSize', 112); h.input('sensitivity', 1.7); h.input('controlOpacity', 0.55);
  h.toggle('leftHanded', true); h.toggle('lookGuide', false); h.toggle('invert', true);
  const chosen = h.app.snapshot().settings;
  assert.equal(chosen.buttonScale, 1.2); assert.equal(chosen.stickSize, 112); assert.equal(chosen.sensitivity, 1.7);
  assert.equal(h.control.sensitivity, 1.7); assert.equal(h.control.invert, true);
  assert.equal(h.document.body.style.getPropertyValue('--button-scale'), '1.2');
  assert.equal(h.document.body.style.getPropertyValue('--stick-size'), '112px');
  assert.equal(h.document.body.style.getPropertyValue('--control-opacity'), '0.55');
  assert.equal(h.document.body.classList.contains('left-handed'), true);
  assert.equal(h.document.body.classList.contains('hide-look-guide'), true);
  assert.equal(h.elements.get('look-nudge').textContent, 'LEFT THUMB · DRAG');
  assert.equal(h.document.querySelector('.touch-tip').textContent, 'RIGHT PAD TO MOVE · LEFT PAD TO LOOK');
  assert.equal(h.elements.get('stickSize-value').textContent, '112 px');
  assert.equal(h.elements.get('sensitivity-value').textContent, '1.7×');
  assert.deepEqual(JSON.parse(h.storage.get(settingsApi.SETTINGS_KEY)), plain(chosen));
  const reopened = harness({ touch: true, storage: h.storage });
  assert.deepEqual(plain(reopened.app.snapshot().settings), plain(chosen));
  reopened.elements.get('menu-settings').click();
  assert.equal(reopened.elements.get('stickSize').value, '112');
  assert.equal(reopened.elements.get('leftHanded').checked, true);
  assert.equal(reopened.elements.get('lookGuide').checked, false);
  assert.equal(reopened.control.enabled, false, 'settings do not start movement behind the title screen');
});

test('unusable saved values and slider values are normalized before reaching rendering, controls or sound', () => {
  const storage = new Map([[settingsApi.SETTINGS_KEY, JSON.stringify({ brightness: -9, sensitivity: 'fast', buttonScale: 20, stickSize: 1, controlOpacity: null, sound: 'true', volume: 50, atmosphere: -2 })]]);
  const h = harness({ storage, reduced: true });
  assert.equal(h.scene.brightness.at(-1), 0.8);
  assert.equal(h.control.sensitivity, 1);
  assert.equal(h.audio.enabled, false, 'a non-boolean stored value cannot enable sound');
  assert.equal(h.audio.volume, 1); assert.equal(h.audio.atmosphere, 0);
  assert.equal(h.app.snapshot().settings.reduced, true);
  h.app.showSettings('controls');
  h.input('buttonScale', 99); h.input('stickSize', -1); h.input('sensitivity', 'invalid'); h.input('controlOpacity', 99);
  h.elements.get('tab-view').click(); h.input('brightness', -100);
  h.elements.get('tab-sound').click(); h.input('volume', 100); h.input('atmosphere', -100);
  const saved = JSON.parse(h.storage.get(settingsApi.SETTINGS_KEY));
  for (const [key, [min, max]] of Object.entries(settingsApi.SETTING_RANGES)) {
    assert.equal(Number.isFinite(saved[key]) && saved[key] >= min && saved[key] <= max, true, key);
  }
  assert.equal(saved.buttonScale, 1.35); assert.equal(saved.stickSize, 84); assert.equal(saved.sensitivity, 1);
  assert.equal(h.scene.brightness.every(value => Number.isFinite(value) && value >= 0.8 && value <= 1.8), true);
  assert.equal(h.audio.volume, 1); assert.equal(h.audio.atmosphere, 0);
});

test('title-screen settings and sound preserve the existing solo save and never enable movement', () => {
  const h = harness({ touch: true });
  h.app.startSolo(); h.app.closeModal(); h.app.dispatch(firstAct[0]); h.app.dispatch({ type: 'hint' }); h.app.returnToMenu();
  const before = h.storage.get('night-transfer.solo.v1');
  const savedState = JSON.parse(before).state;
  h.elements.get('menu-settings').click();
  assert.equal(h.app.snapshot().mode, 'menu'); assert.equal(h.control.enabled, false);
  h.input('stickSize', 96); h.elements.get('tab-sound').click(); h.toggle('sound-enabled', true); h.input('volume', 0.25);
  assert.equal(h.audio.active, false, 'enabling sound in the title menu does not start game ambience');
  h.elements.get('settings-done').click();
  assert.equal(h.app.snapshot().dialogKind, ''); assert.equal(h.control.enabled, false);
  h.elements.get('menu-settings').click(); h.elements.get('close-dialog').click();
  assert.equal(h.app.snapshot().mode, 'menu'); assert.equal(h.control.enabled, false);
  assert.equal(h.storage.get('night-transfer.solo.v1'), before);
  assert.equal(h.transport.actions.length, 0);
  h.app.startSolo(true);
  assert.deepEqual(plain(h.app.snapshot().state), savedState);
  assert.equal(h.app.snapshot().state.inventory.includes('holdingKey'), true);
  assert.equal(h.app.snapshot().state.hintsUsed[0], 1);
});

test('resetting controls leaves audio, view choices and escape progress intact', () => {
  const h = harness(); h.app.startSolo(); h.app.closeModal(); h.app.dispatch(firstAct[0]);
  const before = h.storage.get('night-transfer.solo.v1'), state = plain(h.app.snapshot().state);
  h.app.showSettings('view'); h.input('brightness', 1.6); h.toggle('reduced', true);
  h.elements.get('tab-sound').click(); h.toggle('sound-enabled', true); h.input('volume', 0.3); h.input('atmosphere', 0.1);
  h.elements.get('tab-controls').click(); h.input('buttonScale', 1.3); h.input('stickSize', 120); h.input('sensitivity', 1.8);
  h.toggle('leftHanded', true); h.toggle('lookGuide', false); h.toggle('invert', true); h.toggle('desktopMouseLook', false);
  h.elements.get('reset-controls').click();
  const settings = h.app.snapshot().settings;
  for (const key of ['buttonScale', 'stickSize', 'sensitivity', 'controlOpacity', 'leftHanded', 'lookGuide', 'invert', 'desktopMouseLook']) assert.equal(settings[key], settingsApi.DEFAULT_SETTINGS[key], key);
  assert.equal(settings.brightness, 1.6); assert.equal(settings.reduced, true);
  assert.equal(settings.sound, true); assert.equal(settings.volume, 0.3); assert.equal(settings.atmosphere, 0.1);
  assert.deepEqual(plain(h.app.snapshot().state), state);
  assert.equal(h.storage.get('night-transfer.solo.v1'), before);
});

test('the phone controller receives distinct move/look pads and onboarding responds to both inputs', () => {
  const h = harness({ touch: true });
  assert.strictEqual(h.control.options.joystick, h.elements.get('touch-move'));
  assert.strictEqual(h.control.options.lookPad, h.elements.get('touch-look'));
  assert.strictEqual(h.control.options.canvas, h.elements.get('world'));
  h.app.startSolo(); h.app.closeModal();
  const before = plain(h.app.snapshot().state);
  h.control.options.onMove({ source: 'joystick', forward: 1, side: 0 });
  assert.equal(h.app.snapshot().moveUsed, true); assert.equal(h.app.snapshot().lookUsed, false);
  h.control.options.onLook({ source: 'look-pad', deltaYaw: 0.2, deltaPitch: 0 });
  assert.equal(h.app.snapshot().lookUsed, true);
  assert.equal(h.document.body.classList.contains('look-learned'), true);
  h.app.refreshFocus(101);
  assert.equal(h.elements.get('control-tip').style.opacity, '0');
  assert.deepEqual(plain(h.app.snapshot().state), before, 'learning the controls does not consume hints or alter the escape');
});

test('sound is opt-in and the quick mute preserves volume, atmosphere and escape state', async () => {
  const h = harness({ touch: true });
  assert.equal(h.audio.enabled, false); assert.equal(h.audio.unlocks, 0);
  assert.equal(h.elements.get('menu-audio').getAttribute('aria-pressed'), 'false');
  h.app.startSolo(); h.app.closeModal(); h.app.dispatch(firstAct[0]);
  const state = plain(h.app.snapshot().state), save = h.storage.get('night-transfer.solo.v1');
  h.elements.get('audio-btn').click(); await Promise.resolve();
  assert.equal(h.audio.enabled, true); assert.equal(h.audio.unlocks, 1); assert.equal(h.audio.active, true);
  assert.equal(h.elements.get('audio-btn').getAttribute('aria-pressed'), 'true');
  h.app.changeSetting('volume', 0.25); h.app.changeSetting('atmosphere', 0.15);
  h.elements.get('audio-btn').click();
  assert.equal(h.audio.enabled, false); assert.equal(h.audio.volume, 0.25); assert.equal(h.audio.atmosphere, 0.15);
  assert.equal(h.elements.get('audio-btn').getAttribute('aria-label'), 'Enable prison sound');
  assert.deepEqual(plain(h.app.snapshot().state), state);
  assert.equal(h.storage.get('night-transfer.solo.v1'), save);
  assert.equal(h.transport.actions.length, 0);
  h.elements.get('audio-btn').click();
  assert.equal(h.audio.enabled, true); assert.equal(h.audio.volume, 0.25); assert.equal(h.audio.atmosphere, 0.15);
});

test('settings and mute do not drop an in-flight co-op discovery or touch the solo slot', () => {
  const h = harness(); h.app.startSolo(); h.app.dispatch(firstAct[0]); h.app.returnToMenu();
  const solo = h.storage.get('night-transfer.solo.v1'); join(h);
  const team = world.reduce(world.newGame(), { type: 'hint' }).state;
  h.transport.callbacks.onState(team);
  h.app.useFocused({ id: 'bunkPocket', distance: 1.2 }); h.elements.get('object-action').click();
  const sent = h.transport.actions[0], leaves = h.transport.leaves, before = plain(h.app.snapshot().state);
  h.app.showSettings('controls'); h.input('buttonScale', 1.25); h.toggle('leftHanded', true); h.toggle('desktopMouseLook', false);
  h.elements.get('tab-sound').click(); h.toggle('sound-enabled', true); h.input('volume', 0.2); h.toggle('sound-enabled', false);
  assert.equal(h.transport.actions.length, 1, 'settings do not send authoritative puzzle actions');
  assert.equal(h.transport.leaves, leaves); assert.equal(h.transport.connected, true);
  assert.equal(h.app.snapshot().pending.includes(sent.id), true);
  assert.deepEqual(plain(h.app.snapshot().state), before);
  const result = world.reduce(team, sent.action);
  h.transport.callbacks.onState(result.state);
  h.transport.callbacks.onMessage({ ...result, type: 'action-result', actionId: sent.id });
  assert.equal(h.app.snapshot().dialogKind, 'settings');
  assert.equal(h.app.snapshot().pending.length, 0);
  assert.equal(h.app.snapshot().state.inventory.includes('holdingKey'), true);
  assert.equal(h.app.snapshot().state.hintsUsed[0], 1);
  assert.equal(h.storage.get('night-transfer.solo.v1'), solo);
});

test('unsupported or gesture-blocked audio cannot prevent visual play', async () => {
  for (const options of [{ audioSupported: false }, { audioUnlock: false }]) {
    const h = harness(options);
    h.app.showSettings('sound'); h.toggle('sound-enabled', true); await Promise.resolve();
    assert.equal(h.audio.getStatus().playing, false);
    assert.equal(h.elements.get('fatal').hidden, true);
    h.app.startSolo(); h.app.closeModal(); h.app.useFocused({ id: 'bunkPocket', distance: 1.2 });
    h.elements.get('object-action').click();
    assert.equal(h.app.snapshot().state.inventory.includes('holdingKey'), true);
    assert.equal(h.app.snapshot().dialogKind, 'result');
    assert.equal(h.elements.get('fatal').hidden, true);
    assert.equal(h.audio.cues.length, 0);
  }
});

test('the sound preview is temporary and closing it prevents a late door cue', async () => {
  const h = harness(); const state = plain(h.app.snapshot().state);
  h.app.showSettings('sound'); h.elements.get('test-audio').click(); await settlePromises();
  assert.equal(h.app.snapshot().mode, 'menu'); assert.equal(h.control.enabled, false);
  assert.equal(h.audio.enabled, true); assert.equal(h.audio.active, true);
  assert.deepEqual(h.audio.cues, ['door']);
  h.flush(); assert.equal(h.audio.active, false);
  assert.deepEqual(plain(h.app.snapshot().state), state);
  assert.equal(h.storage.has('night-transfer.solo.v1'), false);
  h.elements.get('test-audio').click(); h.elements.get('settings-done').click(); await settlePromises();
  assert.deepEqual(h.audio.cues, ['door'], 'a preview cannot play after its settings panel was closed');
  assert.equal(h.audio.active, false); assert.equal(h.control.enabled, false);
});

test('blocked preference storage leaves live controls and escape progress usable', () => {
  const h = harness({ blockStorage: true });
  assert.equal(h.elements.get('fatal').hidden, true);
  h.elements.get('menu-settings').click(); h.input('sensitivity', 1.4); h.toggle('leftHanded', true); h.elements.get('settings-done').click();
  assert.equal(h.control.sensitivity, 1.4); assert.equal(h.document.body.classList.contains('left-handed'), true);
  assert.equal(h.control.enabled, false);
  h.app.startSolo(); h.app.closeModal(); h.app.useFocused({ id: 'bunkPocket', distance: 1.2 }); h.elements.get('object-action').click();
  assert.equal(h.app.snapshot().state.inventory.includes('holdingKey'), true);
  assert.equal(h.elements.get('fatal').hidden, true);
});

test('desktop panel shortcuts release mouse look and H opens hints without spending one', async () => {
  const h = harness(); h.app.startSolo(); h.elements.get('intro-go').click();
  const state = plain(h.app.snapshot().state), save = h.storage.get('night-transfer.solo.v1');
  assert.equal(typeof h.control.options.onShortcut, 'function');
  for (const [shortcut, dialog] of [['notes', 'notebook'], ['pockets', 'inventory'], ['hints', 'hints'], ['settings', 'settings']]) {
    h.app.closeModal(); await h.control.requestMouseLook();
    assert.equal(h.control.mouseLookLocked, true);
    h.control.options.onShortcut(shortcut);
    assert.equal(h.app.snapshot().dialogKind, dialog, shortcut);
    assert.equal(h.control.mouseLookLocked, false, `${shortcut} frees the cursor`);
    assert.equal(h.control.enabled, false, `${shortcut} prevents movement behind the panel`);
    assert.strictEqual(h.document.activeElement, h.elements.get('dialog'));
    assert.equal(h.elements.get('desktop-controls').hidden, true);
    assert.deepEqual(plain(h.app.snapshot().state), state, `${shortcut} preserves progress and hint quota`);
    assert.equal(h.storage.get('night-transfer.solo.v1'), save);
  }
  h.app.closeModal(); h.control.options.onShortcut('hints');
  assert.equal(h.app.snapshot().state.hintsUsed[0], 0);
  h.elements.get('reveal-hint').click();
  assert.equal(h.app.snapshot().state.hintsUsed[0], 1, 'only the explicit reveal button spends a hint');
  assert.equal(h.app.snapshot().dialogKind, 'hints');
  assert.equal(h.control.mouseLookLocked, false);
});

test('the M shortcut changes sound without releasing mouse look or changing the escape', () => {
  const h = harness(); h.app.startSolo(); h.elements.get('intro-go').click();
  h.app.changeSetting('volume', 0.35); h.app.changeSetting('atmosphere', 0.25);
  const state = plain(h.app.snapshot().state), save = h.storage.get('night-transfer.solo.v1');
  const captures = h.control.mouseLookRequests;
  h.control.options.onShortcut('sound');
  assert.equal(h.audio.enabled, true); assert.equal(h.audio.unlocks, 1);
  assert.equal(h.control.mouseLookLocked, true); assert.equal(h.app.snapshot().dialogKind, '');
  h.control.options.onShortcut('sound');
  assert.equal(h.audio.enabled, false); assert.equal(h.audio.volume, 0.35); assert.equal(h.audio.atmosphere, 0.25);
  assert.equal(h.control.mouseLookLocked, true); assert.equal(h.control.mouseLookRequests, captures);
  assert.deepEqual(plain(h.app.snapshot().state), state);
  assert.equal(h.storage.get('night-transfer.solo.v1'), save);
  assert.equal(h.transport.actions.length, 0);
});

test('desktop capture resumes only from explicit gestures and remains released in menus', () => {
  const h = harness(); h.app.startSolo();
  assert.equal(h.control.mouseLookRequests, 0, 'opening the introduction does not capture');
  h.elements.get('intro-go').click();
  assert.equal(h.control.mouseLookLocked, true);
  assert.equal(h.elements.get('desktop-controls').dataset.state, 'locked');
  assert.equal(h.document.body.classList.contains('mouse-captured'), true);
  h.control.options.onShortcut('notes');
  const captures = h.control.mouseLookRequests;
  h.elements.get('close-dialog').click();
  assert.equal(h.control.mouseLookRequests, captures, 'closing a clue panel leaves capture to a new gesture');
  assert.equal(h.control.mouseLookLocked, false); assert.equal(h.control.enabled, true);
  assert.equal(h.elements.get('desktop-controls').hidden, false);
  assert.equal(h.elements.get('mouse-look-btn').hidden, false);
  h.elements.get('mouse-look-btn').click();
  assert.equal(h.control.mouseLookLocked, true);
  h.control.options.onPause();
  assert.equal(h.app.snapshot().dialogKind, 'pause'); assert.equal(h.control.mouseLookLocked, false);
  const pausedCaptures = h.control.mouseLookRequests;
  h.emit('window', 'keydown', { key: 'Escape', repeat: true });
  assert.equal(h.app.snapshot().dialogKind, 'pause', 'a held Escape cannot immediately dismiss the menu');
  h.emit('window', 'keydown', { key: 'Escape', defaultPrevented: true });
  assert.equal(h.app.snapshot().dialogKind, 'pause', 'an Escape already handled by controls is not handled twice');
  h.emit('window', 'keydown', { key: 'Escape' });
  assert.equal(h.app.snapshot().dialogKind, '');
  assert.equal(h.control.mouseLookRequests, pausedCaptures, 'Escape never immediately recaptures the cursor');
  assert.strictEqual(h.document.activeElement, h.elements.get('world'), 'closing a panel returns keyboard focus to the room');
  h.app.showPause(); h.elements.get('resume-btn').click();
  assert.equal(h.control.mouseLookLocked, true, 'the explicit Return button can capture again');
  h.app.returnToMenu();
  assert.equal(h.control.mouseLookLocked, false); assert.equal(h.control.enabled, false);
  assert.equal(h.elements.get('desktop-controls').hidden, true);
  const menuCaptures = h.control.mouseLookRequests;
  h.elements.get('menu-settings').click(); h.elements.get('settings-done').click();
  assert.equal(h.control.mouseLookRequests, menuCaptures);
  assert.equal(h.control.enabled, false, 'closing Setup never enables the game behind the title screen');
});

test('disabled, denied or unavailable mouse capture leaves a usable drag-look escape', () => {
  for (const options of [{ mouseLookDenied: true }, { mouseLookSupported: false }, { storage: new Map([[settingsApi.SETTINGS_KEY, JSON.stringify({ desktopMouseLook: false })]]) }]) {
    const h = harness(options); h.app.startSolo(); h.elements.get('intro-go').click();
    assert.equal(h.control.mouseLookLocked, false);
    assert.equal(h.control.enabled, true);
    assert.equal(h.elements.get('desktop-controls').dataset.state, 'drag');
    assert.match(h.elements.get('mouse-look-status').textContent, /drag/i);
    assert.equal(h.elements.get('fatal').hidden, true);
    h.app.useFocused({ id: 'bunkPocket', distance: 1.2 }); h.elements.get('object-action').click();
    assert.equal(h.app.snapshot().state.inventory.includes('holdingKey'), true);
    assert.equal(h.app.snapshot().dialogKind, 'result');
  }
});

test('a denied capture can be retried without inspecting or mutating an object', () => {
  const options = { mouseLookDenied: true }, h = harness(options);
  h.app.startSolo(); h.elements.get('intro-go').click();
  assert.match(h.elements.get('mouse-look-btn').innerHTML, /RETRY/);
  const state = plain(h.app.snapshot().state), save = h.storage.get('night-transfer.solo.v1');
  options.mouseLookDenied = false;
  h.elements.get('mouse-look-btn').click();
  assert.equal(h.control.mouseLookLocked, true); assert.equal(h.app.snapshot().dialogKind, '');
  assert.equal(h.elements.get('mouse-look-btn').hidden, true);
  assert.deepEqual(plain(h.app.snapshot().state), state);
  assert.equal(h.storage.get('night-transfer.solo.v1'), save);
});

test('mouse-look preference applies immediately, persists, and leaves phone intros uncaptured', () => {
  const h = harness(); h.app.startSolo(); h.elements.get('intro-go').click();
  const state = plain(h.app.snapshot().state), save = h.storage.get('night-transfer.solo.v1');
  h.control.options.onShortcut('settings'); h.toggle('desktopMouseLook', false); h.elements.get('settings-done').click();
  assert.equal(h.control.mouseLookEnabled, false); assert.equal(h.control.mouseLookLocked, false);
  assert.equal(h.elements.get('desktop-controls').dataset.state, 'drag');
  assert.equal(h.elements.get('mouse-look-btn').hidden, true);
  assert.equal(JSON.parse(h.storage.get(settingsApi.SETTINGS_KEY)).desktopMouseLook, false);
  assert.deepEqual(plain(h.app.snapshot().state), state); assert.equal(h.storage.get('night-transfer.solo.v1'), save);
  const reopened = harness({ storage: h.storage });
  assert.equal(reopened.app.snapshot().settings.desktopMouseLook, false);
  assert.equal(reopened.control.mouseLookEnabled, false);
  const phone = harness({ touch: true }); phone.app.startSolo(); phone.elements.get('intro-go').click();
  assert.equal(phone.control.mouseLookRequests, 0, 'touch users are not asked to capture a mouse');
  phone.app.showPause(); phone.elements.get('resume-btn').click();
  assert.equal(phone.control.mouseLookRequests, 0);
});

test('remote act introductions and the completed escape release mouse look without touching the solo save', async () => {
  const h = harness(); h.app.startSolo(); h.app.dispatch(firstAct[0]); h.app.returnToMenu();
  const solo = h.storage.get('night-transfer.solo.v1'); join(h); await h.control.requestMouseLook();
  let state = world.newGame({ now: 0 });
  const run = action => { const result = world.reduce(state, action, { now: 6000 }); assert.equal(result.ok, true, result.message); state = result.state; };
  firstAct.forEach(run); h.transport.callbacks.onState(state);
  assert.equal(h.app.snapshot().dialogKind, 'intro'); assert.equal(h.control.mouseLookLocked, false); assert.equal(h.control.enabled, false);
  const secondAct = [{ type: 'interact', id: 'laundryCart' }, { type: 'interact', id: 'watchroomDoor' }, { type: 'solve', id: 'authorisationPanel', value: '846' }, { type: 'interact', id: 'dispatchShutter' }, { type: 'interact', id: 'dispatchDesk' }, { type: 'interact', id: 'dispatchExit' }];
  secondAct.forEach(run); h.transport.callbacks.onState(state); h.elements.get('intro-go').click();
  assert.equal(h.control.mouseLookLocked, true);
  const finalAct = [{ type: 'interact', id: 'toolChest' }, { type: 'interact', id: 'sluiceDoor' }, { type: 'solve', id: 'valveBank', value: [2, 4, 1] }, { type: 'interact', id: 'quayDoor' }, { type: 'interact', id: 'keeperBox' }, { type: 'interact', id: 'quayExit' }];
  finalAct.forEach(run); h.transport.callbacks.onState(state); h.flush();
  assert.equal(h.app.snapshot().dialogKind, 'win'); assert.equal(h.app.snapshot().state.won, true);
  assert.equal(h.control.mouseLookLocked, false); assert.equal(h.control.enabled, false);
  assert.equal(h.elements.get('desktop-controls').hidden, true);
  assert.equal(h.storage.get('night-transfer.solo.v1'), solo);
  h.emit('window', 'keydown', { key: 'Escape', repeat: true });
  assert.equal(h.app.snapshot().dialogKind, 'win');
  h.emit('window', 'keydown', { key: 'Escape' });
  assert.equal(h.app.snapshot().mode, 'menu', 'Escape on completion returns to the title instead of trapping a disabled room');
  assert.equal(h.app.snapshot().dialogKind, '');
  assert.equal(h.control.enabled, false); assert.equal(h.control.mouseLookLocked, false);
  assert.equal(h.storage.get('night-transfer.solo.v1'), solo);
});

test('real pointer-lock and Escape event ordering leaves Pause open until a deliberate next press', () => {
  for (const order of ['unlock-first', 'keydown-first', 'browser-consumed-key']) {
    const h = harness({ realControls: true }); h.app.startSolo(); h.elements.get('intro-go').click();
    assert.equal(h.control.mouseLookLocked, true, `${order}: the real controls own the canvas lock`);
    if (order === 'keydown-first') {
      const first = h.emit('window', 'keydown', { key: 'Escape' });
      assert.equal(first.defaultPrevented, true);
      h.nativeLock.release();
    } else {
      h.nativeLock.release();
      assert.equal(h.app.snapshot().dialogKind, 'pause');
      if (order === 'unlock-first') {
        const followup = h.emit('window', 'keydown', { key: 'Escape' });
        assert.equal(followup.defaultPrevented, true, 'the same browser Escape is consumed before the app dismissal listener');
      }
    }
    assert.equal(h.app.snapshot().dialogKind, 'pause', `${order}: one Escape cannot both open and close Pause`);
    assert.equal(h.control.enabled, false); assert.equal(h.control.mouseLookLocked, false);
    assert.equal(h.nativeLock.requests, 1, 'unlocking never requests capture again');
    if (order === 'browser-consumed-key') h.advance(300);
    else h.emit('window', 'keyup', { key: 'Escape' });
    h.emit('window', 'keydown', { key: 'Escape' });
    assert.equal(h.app.snapshot().dialogKind, '', `${order}: the next deliberate Escape can close the menu`);
    assert.equal(h.control.enabled, true); assert.equal(h.control.mouseLookLocked, false);
    assert.strictEqual(h.document.activeElement, h.elements.get('world'));
    assert.equal(h.nativeLock.requests, 1);
  }
});
