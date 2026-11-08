/**
 * Same-origin private squadron transport. Physics are never delayed by this module.
 * Remote planes render 100ms behind the relay; extrapolation stops after 150ms.
 * The host owns the mission world. The relay validates identity and message bounds,
 * not the honesty of host-authored combat. Rooms last 90 minutes and live in RAM.
 */
import {orientationOf,deriveEuler,slerp,multiplyOrientations,isOrientation} from './orientation.mjs';
import { GUNSHIP_SEATS, GUNSHIP_AIM_LIMITS } from './gunship.mjs';

const VERSION = 1;
const INTERPOLATION_MS = 100;
const EXTRAPOLATION_MS = 150;
const ACTIONS = new Set(['fire', 'missile', 'payload', 'countermeasure', 'radar', 'target', 'abort']);
const lerp = (a, b, t) => a + (b - a) * t;
const now = () => performance.now();

function crewInput(value) {
  if (!value || !GUNSHIP_SEATS.includes(value.seat) || typeof value.fire !== 'boolean' ||
      !Number.isFinite(value.yaw) || value.yaw < GUNSHIP_AIM_LIMITS.yawMin || value.yaw > GUNSHIP_AIM_LIMITS.yawMax ||
      !Number.isFinite(value.pitch) || value.pitch < GUNSHIP_AIM_LIMITS.pitchMin || value.pitch > GUNSHIP_AIM_LIMITS.pitchMax) return null;
  return { seat: value.seat, yaw: value.yaw, pitch: value.pitch, fire: value.fire };
}

function predictOrientation(previous, latest, fraction) {
  const from=orientationOf(previous),to=orientationOf(latest);
  const delta=multiplyOrientations({x:-from.x,y:-from.y,z:-from.z,w:from.w},to);
  if(delta.w<0)for(const key of ['x','y','z','w'])delta[key]=-delta[key];
  const angle=2*Math.acos(Math.max(-1,Math.min(1,delta.w)));
  if(angle<1e-8)return to;
  // Keep prediction bounded as before, but advance one physical rotation rather
  // than three Euler values that can change branches when the nose is vertical.
  const advance=Math.min(.3,angle*fraction),scale=Math.sin(advance/2)/Math.sin(angle/2);
  return multiplyOrientations(to,{x:delta.x*scale,y:delta.y*scale,z:delta.z*scale,w:Math.cos(advance/2)});
}

export class SquadronClient {
  constructor({ onStatus, onRoster, onStart, onWorld, onAction, onCrewInput, onEnd, url } = {}) {
    this.callbacks = { onStatus, onRoster, onStart, onWorld, onAction, onCrewInput, onEnd };
    this.url = url || (typeof location !== 'undefined' ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws` : '');
    this.code = ''; this.id = ''; this.isHost = false; this.connected = false;
    this.mode = 'squadron'; this.role = 'pilot'; this.maxPlayers = 4; this.hostId = ''; this.missionId = '';
    this.latency = null; this.roster = []; this.paused = false; this.hostStale = false; this.roomState = 'offline';
    this._lastWorldReceived = 0;
    this._ws = null; this._token = null; this._intent = null; this._manual = true;
    this._connectResolve = null; this._pendingWorld = null; this._worldTimer = null;
    this._generation = 0; this._attempt = 0; this._retry = null; this._pingTimer = null;
    this._reconnectUntil = 0; this._graceMs = 20000; this._clockOffset = 0;
    this._poseSeq = 0; this._worldSeq = 0; this._lastWorldSeq = -1;
    this._lastPose = -Infinity; this._lastWorld = -Infinity; this._lastActions = new Map();
    this._histories = new Map(); this._runId = null; this._pings = new Map();
    this._crewSeq = 0; this._lastCrew = -Infinity; this._lastCrewInput = null;
    this._crewTimer = null; this._pendingCrew = null; this._pendingCrewReset = false; this._crewWorldPaused = false; this._crewNeedsRelease = false;
  }

  _call(name, ...args) {
    try { this.callbacks[name]?.(...args); }
    catch (error) { console.error(`Squadron ${name} callback failed`, error); }
  }
  _status(status, message) { this._call('onStatus', status, message); }
  _send(message) {
    if (this._ws?.readyState !== 1 || this._ws.bufferedAmount > 96 * 1024) return false;
    this._ws.send(JSON.stringify(message));
    return true;
  }
  _clearTimers() {
    clearTimeout(this._retry); clearInterval(this._pingTimer); clearTimeout(this._worldTimer);
    this._worldTimer = null; this._pendingWorld = null;
    this._retry = null; this._pingTimer = null; this._pings.clear();
    this._clearCrew();
  }
  _clearCrew() {
    clearTimeout(this._crewTimer); this._crewTimer = null; this._pendingCrew = null; this._pendingCrewReset = false;
    this._lastCrewInput = null; this._lastCrew = -Infinity;
  }
  _roomInfo(msg) {
    this.mode = msg.mode === 'crew' ? 'crew' : 'squadron';
    this.role = this.mode === 'crew' && !this.isHost ? 'gunner' : 'pilot';
    this.maxPlayers = this.mode === 'crew' ? 2 : 4;
    if (msg.missionId) this.missionId = msg.missionId;
    if (msg.hostId) this.hostId = msg.hostId;
  }
  _settleConnect(connected) {
    const resolve = this._connectResolve; this._connectResolve = null; resolve?.(connected);
  }
  _begin(intent) {
    this.leave(false);
    if (!this.url) { this._status('error', 'Private squadrons need this game’s hosted page.'); return Promise.resolve(false); }
    this._intent = intent; this._manual = false; this._attempt = 0;
    const result = new Promise(resolve => { this._connectResolve = resolve; });
    this._status('connecting', 'Connecting to the squadron hangar…');
    this._open();
    return result;
  }
  create(name = 'Pilot', missionId) { return this._begin({ type: 'create', name, missionId }); }
  join(code, name = 'Pilot') { return this._begin({ type: 'join', code: String(code || '').trim().toUpperCase(), name }); }

  _open() {
    if (this._manual) return;
    const generation = ++this._generation;
    let socket;
    try { socket = new WebSocket(this.url); }
    catch { this._finish('Could not connect. Open the hosted game and try again.'); return; }
    this._ws = socket;
    socket.onmessage = event => {
      if (generation !== this._generation) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      this._message(msg);
    };
    socket.onerror = () => {};
    socket.onclose = event => {
      if (generation !== this._generation || this._manual) return;
      this.connected = false;
      this._clearCrew(); this._crewNeedsRelease = true;
      clearInterval(this._pingTimer); this._pingTimer = null;
      clearTimeout(this._worldTimer); this._worldTimer = null; this._pendingWorld = null;
      if (event.code === 4001) { this._finish('This pilot reconnected in another tab.'); return; }
      if (event.code === 1008 || event.code === 1009) {
        this._finish(event.code === 1009 ? 'A mission update was too large. Rejoin a fresh squadron.' : 'The session closed. Reload the game and join a new squadron.');
        return;
      }
      if (this._token) {
        this.paused = this.isHost || this.paused;
        if (!this._reconnectUntil) this._reconnectUntil = Date.now() + this._graceMs - 1000;
        if (Date.now() < this._reconnectUntil) {
          this._status('reconnecting', 'Connection interrupted. Reconnecting to your squadron…');
          const delay = Math.min(700 + this._attempt++ * 400, 3000);
          this._retry = setTimeout(() => this._open(), delay);
          return;
        }
        this._finish('The connection could not recover in time. Create or join a new squadron.');
      } else this._finish('Could not reach the squadron hangar. Check your connection and try again.');
    };
  }

  _message(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'hello':
        if (msg.version !== VERSION) { this._finish('The squadron server uses a newer game version. Reload to continue.'); return; }
        this._clockOffset = msg.time - Date.now();
        this._send({ type: 'hello', version: VERSION });
        break;
      case 'welcome':
        if (this._token) this._send({ type: 'resume', code: this.code, playerId: this.id, token: this._token });
        else this._send(this._intent);
        break;
      case 'session':
        this.id = msg.id; this.code = msg.code; this._token = msg.token;
        this.isHost = msg.isHost; this.connected = true; this.roomState = msg.state;
        this._roomInfo(msg);
        this.paused = msg.state === 'paused'; this._graceMs = msg.reconnectGraceMs || 20000;
        this._poseSeq = Math.max(this._poseSeq, (msg.poseSeq ?? -1) + 1);
        this._worldSeq = Math.max(this._worldSeq, (msg.worldSeq ?? -1) + 1);
        this._crewSeq = Math.max(this._crewSeq, (msg.crewSeq ?? -1) + 1);
        this._reconnectUntil = 0; this._attempt = 0;
        this._settleConnect(true);
        this._status(this.paused ? 'paused' : msg.state, msg.state === 'lobby'
          ? (this.mode === 'crew' ? `AC-130 crew ${this.code} · one pilot and one gunner.` : `Squadron ${this.code} · invite up to three wingmates.`) : 'Squadron connected.');
        this._ping(); clearInterval(this._pingTimer);
        this._pingTimer = setInterval(() => this._ping(), 2000);
        break;
      case 'roster': {
        this._roomInfo(msg);
        this.roster = msg.players || []; this.roomState = msg.state;
        this.paused = msg.state === 'paused';
        const liveIds = new Set(this.roster.filter(p => p.connected).map(p => p.id));
        for (const id of this._histories.keys()) if (!liveIds.has(id)) this._histories.delete(id);
        this._call('onRoster', this.roster);
        break;
      }
      case 'start': {
        const isNew = this._runId !== msg.runId;
        this._runId = msg.runId; this.roomState = 'flying'; this.paused = false; this.hostStale = false;
        this._roomInfo(msg);
        this._lastWorldReceived = now();
        if (isNew) {
          this._histories.clear(); this._poseSeq = 0; this._worldSeq = 0; this._lastWorldSeq = -1;
          this._lastPose = this._lastWorld = -Infinity; this._lastActions.clear();
          clearTimeout(this._worldTimer); this._worldTimer = null; this._pendingWorld = null;
          this._clearCrew(); this._crewSeq = 0; this._crewWorldPaused = false; this._crewNeedsRelease = false;
          this._call('onStart', { missionId: msg.missionId, seed: msg.seed, mode: this.mode, role: this.role });
        }
        this._status('flying', msg.resumed ? 'Reconnected to the mission.' : 'Squadron airborne.');
        break;
      }
      case 'pose': {
        if (msg.playerId === this.id || !msg.player) break;
        if (this.mode === 'crew' && msg.playerId !== this.hostId) break;
        const history = this._histories.get(msg.playerId) || [];
        if (history.length && msg.seq <= history[history.length - 1].seq) break;
        history.push({ player: msg.player, at: msg.at, seq: msg.seq });
        if (history.length > 24) history.shift();
        this._histories.set(msg.playerId, history);
        break;
      }
      case 'world':
        if (msg.seq > this._lastWorldSeq) {
          this._lastWorldSeq = msg.seq;
          this._lastWorldReceived = now();
          this._crewWorldPaused = !!msg.snapshot?.teamPaused;
          if (this._crewWorldPaused) { this._clearCrew(); this._crewNeedsRelease = true; }
          if (this.hostStale) { this.hostStale = false; this._status('flying', 'The host’s mission updates have resumed.'); }
          this._call('onWorld', msg.snapshot);
        }
        break;
      case 'action':
        if (this.isHost) this._call('onAction', { action: msg.action, playerId: msg.playerId, player: msg.player });
        break;
      case 'crew-input':
        if (this.isHost && this.mode === 'crew') {
          const input = crewInput(msg.input);
          if (input) this._call('onCrewInput', { playerId: msg.playerId, input, seq: msg.seq, reset: !!msg.reset });
        }
        break;
      case 'pong': {
        const sent = this._pings.get(msg.nonce);
        if (sent === undefined) break;
        const rtt = now() - sent;
        this._pings.delete(msg.nonce);
        this.latency = this.latency === null ? Math.round(rtt) : Math.round(this.latency * 0.7 + rtt * 0.3);
        const offset = msg.time + rtt / 2 - Date.now();
        this._clockOffset = lerp(this._clockOffset, offset, 0.25);
        break;
      }
      case 'pause':
        this.paused = true; this.roomState = 'paused';
        this._clearCrew(); this._crewNeedsRelease = true;
        this._status('paused', msg.message);
        break;
      case 'resume-play':
        this.paused = false; this.roomState = msg.state;
        this._status(msg.state, msg.message);
        break;
      case 'error':
        this._status('error', msg.message);
        if (['resume_denied', 'version_mismatch'].includes(msg.code)) this._finish(msg.message);
        else if (!this._token) this.leave(false);
        break;
      case 'end': case 'replaced':
        this._finish(msg.message);
        break;
    }
  }

  _ping() {
    if (!this.isHost && this.roomState === 'flying' && !this.paused && !this.hostStale && this._lastWorldReceived && now() - this._lastWorldReceived > 5000) {
      this.hostStale = true;
      this._status('waiting', 'The host’s updates are delayed. Their tab may be paused; mission progress resumes when they return.');
    }
    const nonce = Math.floor(now() * 1000);
    this._pings.set(nonce, now());
    if (this._pings.size > 6) this._pings.delete(this._pings.keys().next().value);
    this._send({ type: 'ping', nonce });
  }
  ready(value = true) { return this.connected && this._send({ type: 'ready', ready: !!value }); }
  setMission(missionId) { return this.connected && this.isHost && this.roomState === 'lobby' && this._send({ type: 'mission', missionId }); }
  start(missionId) { return this.connected && this.isHost && this._send({ type: 'start', missionId }); }

  sendPose(player) {
    const time = now();
    if (!this.connected || this.paused || this.roomState !== 'flying' || (this.mode === 'crew' && !this.isHost) || time - this._lastPose < 1000 / 15) return false;
    // Copy fields only; never serialize a simulation or Three.js object graph.
    const pose = {};
    for (const key of ['x', 'y', 'z', 'heading', 'pitch', 'roll', 'speed', 'throttle', 'health', 'fuel', 'gear', 'flaps', 'engine', 'startupStep', 'onGround', 'aircraft', 'verticalSpeed', 'stalled', 'ammo', 'missiles', 'bombs']) {
      if (player[key] !== undefined) pose[key] = player[key];
    }
    // Preserve the existing validated wire format. Euler angles encode a pose;
    // clients reconstruct its quaternion before interpolating the remote plane.
    if(isOrientation(player.orientation))Object.assign(pose,deriveEuler(player.orientation));
    const sent = this._send({ type: 'pose', seq: this._poseSeq++, player: pose });
    if (sent) this._lastPose = time;
    return sent;
  }
  sendWorld(snapshot) {
    if (!this.connected || !this.isHost || this.paused || this.roomState !== 'flying') return false;
    // Retain the latest snapshot even between ticks. A final or pause update must
    // survive switching screens, when the caller may stop sending every frame.
    this._pendingWorld = snapshot;
    if (now() - this._lastWorld >= 100) return this._flushWorld();
    if (!this._worldTimer) this._worldTimer = setTimeout(() => this._flushWorld(), Math.ceil(100 - (now() - this._lastWorld)));
    return true;
  }
  _flushWorld() {
    clearTimeout(this._worldTimer); this._worldTimer = null;
    if (!this.connected || !this.isHost || this.paused || this.roomState !== 'flying') { this._pendingWorld = null; return false; }
    if (this._pendingWorld === null) return false;
    const time = now();
    if (time - this._lastWorld < 100) {
      this._worldTimer = setTimeout(() => this._flushWorld(), Math.ceil(100 - (time - this._lastWorld)));
      return true;
    }
    const sent = this._send({ type: 'world', seq: this._worldSeq++, snapshot: this._pendingWorld });
    if (sent) { this._lastWorld = time; this._pendingWorld = null; }
    else this._worldTimer = setTimeout(() => this._flushWorld(), 100);
    return sent;
  }
  sendAction(action) {
    const time = now(), name = typeof action === 'string' ? action : action?.name;
    if (!ACTIONS.has(name) || !this.connected || this.isHost || this.mode === 'crew' || this.paused || this.roomState !== 'flying') return false;
    // Holding the gun must not swallow a one-shot missile/payload command.
    if (time - (this._lastActions.get(name) ?? -Infinity) < (name === 'fire' ? 100 : 200)) return false;
    const sent = this._send({ type: 'action', action });
    if (sent) this._lastActions.set(name, time);
    return sent;
  }

  sendCrewInput(value, { reset = false } = {}) {
    if (!this.connected || this.mode !== 'crew' || this.isHost || this.paused || this.hostStale || this._crewWorldPaused || this.roomState !== 'flying') return false;
    const input = crewInput(value);
    if (!input || typeof reset !== 'boolean' || reset && input.fire) return false;
    // A trigger held through a disconnect/pause cannot resume shooting by itself.
    if (this._crewNeedsRelease) {
      if (!input.fire) this._crewNeedsRelease = false;
      input.fire = false;
    }
    // Preserve an unsent cancellation through backpressure and later frame
    // updates. Cancelling can only stop weapons, never create a firing command.
    this._pendingCrewReset = reset || this._pendingCrewReset;
    if (this._pendingCrewReset) input.fire = false;
    this._pendingCrew = input;
    return this._flushCrew();
  }
  _flushCrew() {
    clearTimeout(this._crewTimer); this._crewTimer = null;
    if (!this.connected || this.mode !== 'crew' || this.isHost || this.paused || this.hostStale || this._crewWorldPaused || this.roomState !== 'flying') { this._pendingCrew = null; this._pendingCrewReset = false; return false; }
    if (!this._pendingCrew) return false;
    const time = now(), interval = 1000 / 15;
    const triggerEdge = this._lastCrewInput && this._pendingCrew.fire !== this._lastCrewInput.fire;
    // Edges are immediate so a brief click cannot disappear between two ticks.
    // Sustained aim/fire renews a short host-side lease at a bounded 15 Hz.
    if (!triggerEdge && !this._pendingCrewReset && time - this._lastCrew < interval) {
      this._crewTimer = setTimeout(() => this._flushCrew(), Math.ceil(interval - (time - this._lastCrew)));
      return true;
    }
    const sent = this._send({ type: 'crew-input', runId: this._runId, seq: this._crewSeq++, input: this._pendingCrew, reset: this._pendingCrewReset });
    if (sent) { this._lastCrew = time; this._lastCrewInput = this._pendingCrew; this._pendingCrew = null; this._pendingCrewReset = false; }
    else this._crewTimer = setTimeout(() => this._flushCrew(), Math.ceil(interval));
    return sent;
  }

  samplePlayers() {
    return this.mode === 'crew' ? [] : this._samplePlanes();
  }
  samplePilot() {
    if (this.mode !== 'crew' || this.isHost) return null;
    return this._samplePlanes().find(player => player.id === this.hostId) || null;
  }
  _samplePlanes() {
    const serverNow = Date.now() + this._clockOffset;
    const target = serverNow - INTERPOLATION_MS;
    const result = [];
    for (const [id, samples] of this._histories) {
      if (!samples.length) continue;
      const member = this.roster.find(p => p.id === id);
      if (!member?.connected) continue;
      let a = samples[0], b = samples[0];
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].at > target) { b = samples[i]; break; }
        a = samples[i]; b = a;
      }
      const latest = samples[samples.length - 1];
      const player = { ...a.player };
      let orientation=orientationOf(a.player);
      let extrapolated = false;
      if (a !== b) {
        const fraction = Math.max(0, Math.min(1, (target - a.at) / Math.max(1, b.at - a.at)));
        for (const key of ['x', 'y', 'z', 'speed', 'throttle', 'verticalSpeed']) {
          if (Number.isFinite(a.player[key]) && Number.isFinite(b.player[key])) player[key] = lerp(a.player[key], b.player[key], fraction);
        }
        orientation=slerp(orientationOf(a.player),orientationOf(b.player),fraction);
      } else if (target > latest.at && samples.length > 1) {
        const previous = samples[samples.length - 2];
        const sampleDt = Math.max(1, latest.at - previous.at);
        const ahead = Math.min(EXTRAPOLATION_MS, target - latest.at);
        const dx = latest.player.x - previous.player.x, dy = latest.player.y - previous.player.y, dz = latest.player.z - previous.player.z;
        const length = Math.hypot(dx, dy, dz);
        // A teleported/corrected position does not turn into a huge prediction.
        const maxDistance = ((latest.player.speed || 0) * 1.5 + 15) * sampleDt / 1000;
        const scale = length > maxDistance && length > 0 ? maxDistance / length : 1;
        player.x += dx * ahead / sampleDt * scale;
        player.y += dy * ahead / sampleDt * scale;
        player.z += dz * ahead / sampleDt * scale;
        orientation=predictOrientation(previous.player,latest.player,ahead/sampleDt);
        extrapolated = true;
      }
      player.orientation=orientation;Object.assign(player,deriveEuler(orientation));
      result.push({ ...player, id, playerId: id, name: member.name, isHost: member.isHost, stale: serverNow - latest.at > 400, ageMs: Math.max(0, serverNow - latest.at), extrapolated });
    }
    return result;
  }

  _finish(message) {
    this.leave(false);
    this._status('ended', message);
    this._call('onEnd', message);
  }
  leave(announce = true) {
    this._settleConnect(false);
    this._manual = true;
    if (this._ws?.readyState === 1) this._send({ type: 'leave' });
    ++this._generation;
    this._clearTimers();
    if (this._ws && this._ws.readyState < 2) this._ws.close(1000, 'Leaving squadron');
    this._ws = null; this._token = null; this._intent = null; this._runId = null;
    this.connected = false; this.paused = false; this.hostStale = false; this.roomState = 'offline';
    this.id = ''; this.code = ''; this.isHost = false; this.latency = null;
    this.mode = 'squadron'; this.role = 'pilot'; this.maxPlayers = 4; this.hostId = ''; this.missionId = '';
    this._crewSeq = 0; this._crewWorldPaused = false; this._crewNeedsRelease = false;
    this.roster = []; this._histories.clear(); this._reconnectUntil = 0;
    if (announce) { this._call('onRoster', []); this._status('offline', 'Left the squadron.'); }
  }
}
