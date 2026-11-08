import { advanceShip } from './fleet.mjs';

export const MULTIPLAYER_PROTOCOL = 1;
export const PASSPORT_STORAGE_KEY = 'farwake.multiplayer.passport.v1';
const copy = value => structuredClone(value);
const bounded = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const defaultStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };

export function readPassports(storage = defaultStorage()) {
  try { return JSON.parse(storage?.getItem(PASSPORT_STORAGE_KEY) || '{}'); } catch { return {}; }
}
export function savePassport(passport, storage = defaultStorage()) {
  const passports = readPassports(storage);
  passports[passport.realmCode] = passport; passports.lastRealm = passport.realmCode;
  try { storage?.setItem(PASSPORT_STORAGE_KEY, JSON.stringify(passports)); } catch { /* The caller may still export the returned passport. */ }
  return passport;
}
export function readPassport(realmCode, storage = defaultStorage()) {
  const passports = readPassports(storage); return passports[realmCode || passports.lastRealm] || null;
}

/** Reconstructs the public full-snapshot contract from a compact motion packet. */
export function mergeSnapshot(previous, packet) {
  if (!packet.partial || !previous?.state || previous.room?.id !== packet.room?.id) return packet;
  const world = { ...previous.world, ...packet.world };
  if (packet.world?.asteroidStates) {
    const states = new Map(packet.world.asteroidStates.map(values => [values[0], values]));
    world.asteroids = (previous.world?.asteroids || []).map(rock => { const values = states.get(rock.id); return values ? { ...rock, angle: values[1], hp: values[2], ore: values[3], crystal: values[4] } : rock; });
    delete world.asteroidStates;
  }
  return { ...previous, ...packet, partial: false, state: { ...previous.state, ...packet.state }, world };
}

/** Bounded render delay. One peer's late packets never affect another peer's clock. */
export class RemoteInterpolator {
  constructor({ delayMs = 100, maxDelayMs = 220 } = {}) { this.delayMs = delayMs; this.maxDelayMs = maxDelayMs; this.jitter = 0; this.lastArrival = null; this.frames = []; }
  push(snapshot, arrival = Date.now()) {
    if (this.lastArrival !== null) { this.jitter += (Math.abs(arrival - this.lastArrival - 100) - this.jitter) * .1; this.delayMs = Math.min(this.maxDelayMs, Math.max(100, 100 + this.jitter * 1.6)); }
    this.lastArrival = arrival;
    this.frames.push({ at: snapshot.serverTime, remoteShips: copy(snapshot.remoteShips || []), players: copy(snapshot.players || []), roomId: snapshot.room?.id });
    if (this.frames.length > 24) this.frames.shift();
  }
  reset() { this.frames.length = 0; this.lastArrival = null; }
  sample(serverNow = Date.now()) {
    if (!this.frames.length) return { remoteShips: [], players: [] };
    const target = serverNow - this.delayMs;
    const latest = this.frames.at(-1);
    let a = this.frames[0], b = a;
    for (const frame of this.frames) { if (frame.at <= target) a = frame; if (frame.at >= target) { b = frame; break; } b = frame; }
    const sameRoom = a.roomId === latest.roomId && b.roomId === latest.roomId;
    if (!sameRoom) return { remoteShips: copy(latest.remoteShips), players: copy(latest.players) };
    const blend = (kind, idKey) => latest[kind].map(current => {
      const left = a[kind].find(v => v[idKey] === current[idKey]) || current;
      const right = b[kind].find(v => v[idKey] === current[idKey]) || left;
      if (b.at > a.at) {
        const t = bounded((target - a.at) / (b.at - a.at), 0, 1), value = { ...current };
        for (const key of ['x', 'y']) value[key] = (left[key] || 0) + ((right[key] || 0) - (left[key] || 0)) * t;
        if (typeof left.angle === 'number') value.angle = left.angle + Math.atan2(Math.sin((right.angle || 0) - left.angle), Math.cos((right.angle || 0) - left.angle)) * t;
        return value;
      }
      const seconds = bounded((target - a.at) / 1000, 0, .25);
      return { ...current, x: (left.x || 0) + (left.vx || 0) * seconds, y: (left.y || 0) + (left.vy || 0) * seconds, angle: (left.angle || 0) + (left.angularVelocity || 0) * seconds };
    });
    return { remoteShips: blend('remoteShips', 'id'), players: blend('players', 'captainId') };
  }
}

/**
 * Browser transport; server authority is never replaced by local state uploads.
 * connect({create,realmCode,name,realmName,passport}) -> authoritative welcome.
 * command(name,args) -> {ok,result,state,world,room,events,...}.
 * setInput(input) supplies the next independent 20 Hz input frame.
 */
export class FarwakeNetwork {
  constructor({ url, onSnapshot = () => {}, onStatus = () => {}, fetchImpl = globalThis.fetch?.bind(globalThis), WebSocketImpl = globalThis.WebSocket, storage = defaultStorage(), autoReconnect = true } = {}) {
    this.url = String(url || globalThis.FARWAKE_SERVER_URL || globalThis.location?.origin || '').replace(/\/$/, '');
    this.onSnapshot = onSnapshot; this.onStatus = onStatus; this.fetch = fetchImpl; this.WebSocket = WebSocketImpl; this.storage = storage; this.autoReconnect = autoReconnect;
    this.socket = null; this.passport = null; this.input = {}; this.seq = 0; this.pending = new Map(); this.unacknowledged = []; this.interpolator = new RemoteInterpolator();
    this.connected = false; this.manualClose = false; this.clockOffset = 0; this.rtt = 0; this.predictedShip = null; this.visualOffset = { x: 0, y: 0 }; this.reconnectAttempt = 0;
  }
  async connect({ create = false, realmCode, name, realmName, passport } = {}) {
    this.manualClose = false;
    this.passport = passport || (!create ? readPassport(realmCode, this.storage) : null);
    const response = await this.fetch(`${this.url}/api/realms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: create ? 'create' : this.passport ? 'resume' : 'join', realmCode: realmCode || this.passport?.realmCode, name, realmName, passport: this.passport }) });
    const registration = await response.json();
    if (!response.ok || !registration.ok) throw new Error(registration.reason || 'The realm could not be joined.');
    this.passport = savePassport(registration.passport || this.passport, this.storage);
    return this._open();
  }
  _open() {
    clearTimeout(this.reconnectTimer); this._clearTimers();
    return new Promise((resolve, reject) => {
      const endpoint = new URL('/ws', this.url); endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = this.socket = new this.WebSocket(endpoint.href);
      let welcomed = false;
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Timed out while connecting to the realm.')); }, 15000);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', protocol: MULTIPLAYER_PROTOCOL, passport: this.passport })));
      socket.addEventListener('message', event => {
        let packet; try { packet = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)); } catch { return; }
        if (packet.type === 'welcome') {
          welcomed = true; clearTimeout(timeout); this.connected = true; this.reconnectAttempt = 0; this.seq = packet.ack || 0; this.unacknowledged = [];
          this.clockOffset = packet.serverTime - Date.now(); this.interpolator.reset(); this._snapshot(packet, true); this._startTimers(); this.onStatus({ state: 'connected', realm: packet.realm }); resolve(packet);
        } else if (packet.type === 'snapshot') this._snapshot(packet);
        else if (packet.type === 'result') {
          if (packet.state) this._snapshot(packet);
          const request = this.pending.get(packet.id); if (request) { clearTimeout(request.timer); this.pending.delete(packet.id); request.resolve(packet); }
        } else if (packet.type === 'pong') {
          const now = Date.now(); this.rtt = Math.max(0, now - packet.sentAt); this.clockOffset += (packet.serverTime - (packet.sentAt + now) / 2 - this.clockOffset) * .25;
        } else if (packet.type === 'error') {
          this.onStatus({ state: 'error', reason: packet.reason, code: packet.code });
          if (!welcomed) { clearTimeout(timeout); reject(new Error(packet.reason || 'The connection was rejected.')); }
        } else if (packet.type === 'status') this.onStatus(packet);
      });
      socket.addEventListener('error', () => { if (!welcomed) { clearTimeout(timeout); reject(new Error('The multiplayer server is unavailable.')); } });
      socket.addEventListener('close', event => {
        if (socket !== this.socket) return;
        clearTimeout(timeout); this.connected = false; this._clearTimers();
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Connection lost before the server confirmed this action.')); } this.pending.clear();
        this.onStatus({ state: this.manualClose ? 'disconnected' : 'reconnecting', code: event.code, reason: event.reason });
        if (!welcomed) reject(new Error(event.reason || 'Connection closed.'));
        if (!this.manualClose && this.autoReconnect && ![4001, 4003, 4009].includes(event.code)) this._scheduleReconnect();
      });
    });
  }
  _scheduleReconnect() {
    const delay = Math.min(12000, 500 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => this._open().catch(() => {}), delay);
  }
  _startTimers() {
    this.inputTimer = setInterval(() => this._sendInput(), 50);
    this.pingTimer = setInterval(() => this._send({ type: 'ping', sentAt: Date.now() }), 3000);
  }
  _clearTimers() { clearInterval(this.inputTimer); clearInterval(this.pingTimer); }
  _send(packet) { if (this.socket?.readyState === 1) { this.socket.send(JSON.stringify(packet)); return true; } return false; }
  setInput(input = {}) { this.input = { ...input }; }
  _sendInput() {
    if (!this.connected) return;
    const frame = { type: 'input', seq: ++this.seq, input: this.input };
    if (this._send(frame)) { this.unacknowledged.push({ seq: frame.seq, input: { ...this.input }, dt: .05 }); if (this.unacknowledged.length > 80) this.unacknowledged.shift(); }
  }
  _snapshot(packet, reset = false) {
    if (!packet.state) return;
    if (!reset && this.latest && packet.tick < this.latest.tick) return;
    packet = mergeSnapshot(this.latest, packet);
    const previous = this.predictedShip;
    this.latest = packet; this.state = packet.state; this.world = packet.world; this.room = packet.room;
    this.unacknowledged = this.unacknowledged.filter(frame => frame.seq > (packet.ack || 0));
    let predicted = { ...packet.state.ship };
    if (packet.state.mode === 'ship' && packet.room?.kind === 'system') for (const frame of this.unacknowledged) predicted = advanceShip(predicted, frame.dt, frame.input);
    const changedRoom = this.lastRoomId !== packet.room?.id;
    const error = previous ? Math.hypot(previous.x - predicted.x, previous.y - predicted.y) : Infinity;
    if (!reset && !changedRoom && error < 250) this.visualOffset = { x: previous.x - predicted.x, y: previous.y - predicted.y };
    else this.visualOffset = { x: 0, y: 0 };
    this.lastRoomId = packet.room?.id; this.predictedShip = predicted;
    this.interpolator.push(packet); this.onSnapshot(packet);
  }
  predictShip(dt, input = this.input) {
    if (!this.predictedShip) return this.state?.ship || null;
    this.predictedShip = advanceShip(this.predictedShip, Math.min(.25, Math.max(0, dt)), input);
    const decay = Math.exp(-Math.max(0, dt) * 14); this.visualOffset.x *= decay; this.visualOffset.y *= decay;
    return { ...this.predictedShip, x: this.predictedShip.x + this.visualOffset.x, y: this.predictedShip.y + this.visualOffset.y };
  }
  sampleRemotes() { return this.interpolator.sample(Date.now() + this.clockOffset); }
  command(name, args = {}, { requestId, timeoutMs = 20000 } = {}) {
    if (!this.connected) return Promise.reject(new Error('Connect to the realm before issuing an action.'));
    const id = requestId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The server has not confirmed this action yet. Reconnect before retrying if the connection was lost.')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer }); this._send({ type: 'command', id, name, args });
    });
  }
  disconnect() {
    this.manualClose = true; this.setInput({}); this._send({ type: 'goodbye' }); clearTimeout(this.reconnectTimer); this._clearTimers(); this.socket?.close(1000, 'Captain disconnected'); this.connected = false;
  }
  exportPassport() { return JSON.stringify(this.passport, null, 2); }
  get latency() { return { rtt: this.rtt, interpolationMs: this.interpolator.delayMs, unacknowledgedInputs: this.unacknowledged.length }; }
}
