import { advanceShip } from './fleet.mjs';
import { InputTimeline, MAX_PREDICTION_MS, correctedPose, poseCorrection, decayCorrection } from './prediction.mjs';

export const MULTIPLAYER_PROTOCOL = 1;
export const PASSPORT_STORAGE_KEY = 'farwake.multiplayer.passport.v1';
const copy = value => structuredClone(value);
const bounded = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const defaultStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const zeroCorrection = () => ({ x: 0, y: 0, angle: 0 });
const resetEvents = new Set(['jump', 'dock', 'launch', 'ship-class', 'rescue']);
const aboardIdentity = state => state?.multiplayer?.aboardVesselId || state?.interior?.vesselId || state?.interior?.location?.vesselId || state?.ship?.id || null;
const hullClass = value => value?.classId || value?.shipClassId || value?.shipClass || null;
const sameRemoteContext = (a, b) => (a?.roomId ?? null) === (b?.roomId ?? null) && (a?.systemId ?? null) === (b?.systemId ?? null) &&
  (a?.vesselId ?? null) === (b?.vesselId ?? null) && (a?.mode ?? null) === (b?.mode ?? null) &&
  hullClass(a?.ship || a) === hullClass(b?.ship || b) && (a?.ship?.id ?? null) === (b?.ship?.id ?? null);

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
  // Compact ship, multiplayer and interior values are complete replacements.
  // In particular, null clears a departed deck and false clears old permissions.
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
      // One captain can change decks or take another hull without the observer
      // changing rooms. Never interpolate that transition through empty space.
      if (!sameRemoteContext(left, current) || !sameRemoteContext(right, current) || current.down || current.health <= 0 ||
        Math.hypot((left.x || 0) - (current.x || 0), (left.y || 0) - (current.y || 0)) >= 250 ||
        Math.hypot((right.x || 0) - (current.x || 0), (right.y || 0) - (current.y || 0)) >= 250) return copy(current);
      const value = copy(current);
      if (b.at > a.at) {
        const t = bounded((target - a.at) / (b.at - a.at), 0, 1);
        for (const key of ['x', 'y']) value[key] = (left[key] || 0) + ((right[key] || 0) - (left[key] || 0)) * t;
        for (const key of ['angle', 'aimAngle']) if (typeof left[key] === 'number' && typeof right[key] === 'number') value[key] = left[key] + Math.atan2(Math.sin(right[key] - left[key]), Math.cos(right[key] - left[key])) * t;
        return value;
      }
      const seconds = bounded((target - a.at) / 1000, 0, .25);
      return { ...value, x: (left.x || 0) + (left.vx || 0) * seconds, y: (left.y || 0) + (left.vy || 0) * seconds, angle: (left.angle || 0) + (left.angularVelocity || 0) * seconds };
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
  constructor({ url, onSnapshot = () => {}, onStatus = () => {}, fetchImpl = globalThis.fetch?.bind(globalThis), WebSocketImpl = globalThis.WebSocket, storage = defaultStorage(), autoReconnect = true, now = monotonicNow, wallNow = () => Date.now() } = {}) {
    this.url = String(url || globalThis.FARWAKE_SERVER_URL || globalThis.location?.origin || '').replace(/\/$/, '');
    this.onSnapshot = onSnapshot; this.onStatus = onStatus; this.fetch = fetchImpl; this.WebSocket = WebSocketImpl; this.storage = storage; this.autoReconnect = autoReconnect;
    this.socket = null; this.passport = null; this.input = {}; this.seq = 0; this.pending = new Map(); this.unacknowledged = []; this.interpolator = new RemoteInterpolator();
    this.connected = false; this.manualClose = false; this.clockOffset = 0; this.rtt = 0; this.predictedShip = null; this.renderedShip = null; this.visualOffset = zeroCorrection(); this.reconnectAttempt = 0;
    this.now = now; this.wallNow = wallNow; this.inputHistory = new InputTimeline(now()); this.lastInputRecordAt = null;
    this.predictedAt = null; this.visualAt = null; this.authorityAt = null; this.predictionReset = null; this.lastInputSentAt = null;
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
      let welcomed = false, helloAt = this.now(), helloWall = this.wallNow();
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Timed out while connecting to the realm.')); }, 15000);
      socket.addEventListener('open', () => { helloAt = this.now(); helloWall = this.wallNow(); socket.send(JSON.stringify({ type: 'hello', protocol: MULTIPLAYER_PROTOCOL, passport: this.passport })); });
      socket.addEventListener('message', event => {
        let packet; try { packet = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)); } catch { return; }
        if (packet.type === 'welcome') {
          welcomed = true; clearTimeout(timeout); this.connected = true; this.reconnectAttempt = 0; this.seq = packet.ack || 0; this.unacknowledged = [];
          this.rtt = Math.max(0, this.now() - helloAt);
          this.clockOffset = packet.serverTime - (helloWall + this.rtt / 2);
          this.lastInputSentAt = null; this.interpolator.reset(); this._snapshot(packet, true); this._startTimers(); this.onStatus({ state: 'connected', realm: packet.realm }); resolve(packet);
        } else if (packet.type === 'snapshot') this._snapshot(packet);
        else if (packet.type === 'result') {
          if (packet.state) this._snapshot(packet);
          const request = this.pending.get(packet.id); if (request) { clearTimeout(request.timer); this.pending.delete(packet.id); request.resolve(packet); }
        } else if (packet.type === 'pong') {
          const now = this.wallNow(); this.rtt = Math.max(0, now - packet.sentAt); this.clockOffset += (packet.serverTime - (packet.sentAt + now) / 2 - this.clockOffset) * .25;
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
    this.pingTimer = setInterval(() => this._send({ type: 'ping', sentAt: this.wallNow() }), 3000);
  }
  _clearTimers() { clearInterval(this.inputTimer); clearInterval(this.pingTimer); }
  _send(packet) { if (this.socket?.readyState === 1) { this.socket.send(JSON.stringify(packet)); return true; } return false; }
  setInput(input = {}, frameSeconds) {
    const now = this.now(); this.input = { ...input };
    const elapsed = Number.isFinite(frameSeconds) ? bounded(frameSeconds * 1000, 0, MAX_PREDICTION_MS) : 0;
    this.inputHistory.record(this.input, now - elapsed, now); this.lastInputRecordAt = now;
  }
  _sendInput() {
    if (!this.connected) return;
    const frame = { type: 'input', seq: ++this.seq, input: this.input };
    if (this._send(frame)) {
      const now = this.now(), elapsed = this.lastInputSentAt === null ? 0 : Math.max(0, now - this.lastInputSentAt);
      this.unacknowledged.push({ seq: frame.seq, input: { ...this.input }, at: now, dt: elapsed / 1000 }); this.lastInputSentAt = now;
      if (this.unacknowledged.length > 80) this.unacknowledged.shift();
    }
  }
  /** Convert an authority pose timestamp into the local monotonic timeline. */
  snapshotTime(packet = this.latest, now = this.now()) {
    if (packet === this.latest && this.authorityAt !== null) return this.authorityAt;
    const stamp = Number(packet?.simulatedAt ?? packet?.serverTime);
    if (!Number.isFinite(stamp)) return now;
    return now - Math.max(0, this.wallNow() + this.clockOffset - stamp);
  }
  clampPredictionTime(now = this.now()) { return this.authorityAt === null ? now : Math.min(now, this.authorityAt + MAX_PREDICTION_MS); }
  inputFrames(fromMonoMs, toMonoMs = this.now()) { return this.inputHistory.frames(fromMonoMs, this.clampPredictionTime(toMonoMs)); }
  predictionFrames(packet = this.latest, now = this.now()) {
    if (packet === this.latest && this.predictionReset) return [];
    const start = this.snapshotTime(packet, now);
    return this.inputHistory.frames(start, Math.min(now, start + MAX_PREDICTION_MS));
  }
  _predictsShip() { return this.state?.mode === 'ship' && this.room?.kind === 'system'; }
  _radius() { const radius = Number(this.world?.radius); return Number.isFinite(radius) && radius > 0 ? radius : 2700; }
  _advancePrediction(now) {
    if (!this.predictedShip) return;
    const target = this.clampPredictionTime(now);
    if (this._predictsShip() && this.predictedAt !== null) for (const frame of this.inputFrames(this.predictedAt, target)) this.predictedShip = advanceShip(this.predictedShip, frame.dt, frame.input, { worldRadius: this._radius() });
    this.predictedAt = Math.max(this.predictedAt ?? target, target);
    this.visualOffset = decayCorrection(this.visualOffset, now - (this.visualAt ?? now)); this.visualAt = now;
    this.renderedShip = correctedPose(this.predictedShip, this.visualOffset, this._radius());
  }
  _snapshot(packet, reset = false) {
    if (!packet.state) return;
    if (!reset && this.latest && packet.tick < this.latest.tick) return;
    packet = mergeSnapshot(this.latest, packet);
    const now = this.now(); this._advancePrediction(now);
    const previous = this.predictedShip, displayed = this.renderedShip;
    const changedRoom = this.lastRoomId !== packet.room?.id || this.state?.systemId !== packet.state.systemId || this.state?.mode !== packet.state.mode;
    const changedClass = hullClass(this.state?.ship) !== hullClass(packet.state.ship);
    const changedVessel = this.state?.ship?.id !== packet.state.ship?.id || aboardIdentity(this.state) !== aboardIdentity(packet.state);
    const transition = packet.resetPrediction || packet.teleport || packet.events?.some(event => resetEvents.has(event.type));
    const authorityAt = this.snapshotTime(packet, now);
    this.latest = packet; this.state = packet.state; this.world = packet.world; this.room = packet.room;
    this.authorityAt = authorityAt;
    this.unacknowledged = this.unacknowledged.filter(frame => frame.seq > (packet.ack || 0));
    let predicted = { ...packet.state.ship };
    const explicitReset = reset || !previous || changedRoom || changedClass || changedVessel || transition;
    if (!explicitReset && this._predictsShip()) for (const frame of this.inputHistory.frames(authorityAt, Math.min(now, authorityAt + MAX_PREDICTION_MS))) predicted = advanceShip(predicted, frame.dt, frame.input, { worldRadius: this._radius() });
    const error = previous ? Math.hypot(previous.x - predicted.x, previous.y - predicted.y) : Infinity;
    this.predictionReset = reset || !previous ? 'welcome' : changedRoom ? 'room' : changedClass ? 'class' : changedVessel ? 'vessel' : transition || error >= 250 ? 'teleport' : null;
    if (this.predictionReset) {
      this.visualOffset = zeroCorrection(); this.input = {}; this.inputHistory.reset(now); this.authorityAt = now;
      this.unacknowledged = []; this.lastInputSentAt = null; this.lastInputRecordAt = now;
    } else this.visualOffset = poseCorrection(displayed, predicted);
    this.lastRoomId = packet.room?.id; this.predictedShip = predicted; this.predictedAt = this.clampPredictionTime(now); this.visualAt = now;
    this.renderedShip = correctedPose(predicted, this.visualOffset, this._radius());
    this.interpolator.push(packet); this.onSnapshot(packet);
  }
  predictShip(dt, input = this.input) {
    if (!this.predictedShip) return this.state?.ship || null;
    const now = this.now();
    // Standalone callers can supply a frame directly; the app records both ship
    // and walking input through setInput(input, rawDt) before advancing either.
    if (this.lastInputRecordAt === null || Math.abs(now - this.lastInputRecordAt) > .5) this.setInput(input, dt);
    this._advancePrediction(now);
    return this.renderedShip;
  }
  sampleRemotes() { return this.interpolator.sample(this.wallNow() + this.clockOffset); }
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
