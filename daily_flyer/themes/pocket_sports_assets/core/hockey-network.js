import { Match } from "./engine.js";
import { SPORTS } from "../sports/rules.js";
import { movePlayer } from "./movement.js";

export const HOCKEY_PROTOCOL = 1;
const PREFIX = "/api/v1/hockey/rooms";
const POLL_MS = 75;
const MAX_HISTORY_SECONDS = 1.2;
const neutral = () => ({ x: 0, y: 0, sprint: false, shotHeld: false, dumpHeld: false, fightHeld: false });
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function networkVector(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  const x = clamp(finite(value.x), -1, 1), y = clamp(finite(value.y), -1, 1);
  const n = Math.max(1, Math.hypot(x, y));
  return { x: x / n, y: y / n, sprint: value.sprint === true,
    shotHeld: value.shotHeld === true, dumpHeld: value.dumpHeld === true,
    fightHeld: value.fightHeld === true };
}
export class HockeyNetworkError extends Error {
  constructor(message, code = "NETWORK_ERROR", status = 0) {
    super(message); this.name = "HockeyNetworkError"; this.code = code; this.status = status;
  }
}

// Scores, collisions, puck possession, penalties and fights stay authoritative.
// Only the local skater's movement is predicted; other skaters and the free puck
// ease toward the latest server positions without advancing their game logic.
export class HockeyNetwork {
  constructor({ onUpdate = () => {}, onError = () => {}, fetchImpl = (...args) => fetch(...args),
    now = () => performance.now(), storage = null } = {}) {
    this.onUpdate = onUpdate; this.onError = onError; this.fetchImpl = fetchImpl; this.now = now;
    try { this.storage = storage || globalThis.sessionStorage; } catch { this.storage = null; }
    this.room = null; this.game = null; this.seatId = null; this.token = null;
    this.connected = false; this.rtt = null; this.input = neutral();
    this.inputSeq = 0; this.actionSeq = 0; this.actions = []; this.history = [];
    this.targets = new Map(); this.ballTarget = null; this.correction = null;
    this.lastReply = -1; this.lastReceived = 0; this.matchId = null;
    this.timer = null; this.inflight = false; this.running = false; this.errorShown = false;
    this.generation = 0;
  }
  state() { return { room: this.room, game: this.game, seatId: this.seatId,
    rtt: this.rtt == null ? null : Math.round(this.rtt), connected: this.connected }; }
  notify() { this.onUpdate(this.state()); }
  saved(code) {
    try { return JSON.parse(this.storage?.getItem(`dfe.hockey.room.${code}`) || "null"); } catch { return null; }
  }
  static savedRoom(storage = null) {
    try { return (storage || globalThis.sessionStorage)?.getItem("dfe.hockey.room.active") || null; } catch { return null; }
  }
  save() {
    if (!this.room || !this.token) return;
    try {
      this.storage?.setItem(`dfe.hockey.room.${this.room.code}`, JSON.stringify({ token: this.token, seatId: this.seatId }));
      this.storage?.setItem("dfe.hockey.room.active", this.room.code);
    } catch {}
  }
  forget(code = this.room?.code) {
    try {
      this.storage?.removeItem(`dfe.hockey.room.${code}`);
      if (this.storage?.getItem("dfe.hockey.room.active") === code) this.storage.removeItem("dfe.hockey.room.active");
    } catch {}
  }
  async request(path, payload) {
    const begin = this.now();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), 6500);
    try {
      const response = await this.fetchImpl(PREFIX + path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocol: HOCKEY_PROTOCOL, ...payload }),
        cache: "no-store", credentials: "same-origin", signal: controller?.signal,
      });
      let data;
      try { data = await response.json(); } catch { throw new HockeyNetworkError("The hockey server did not answer. Try reconnecting."); }
      if (!response.ok || !data.ok) throw new HockeyNetworkError(data.error || "The hockey room could not complete that action.", data.code, response.status);
      const roundTrip = this.now() - begin;
      this.rtt = this.rtt == null ? roundTrip : this.rtt * 0.8 + roundTrip * 0.2;
      return data;
    } finally { clearTimeout(timer); }
  }
  async create(options) {
    if (this.running) throw new HockeyNetworkError("Leave the current room before creating another.");
    const result = await this.request("/create", options);
    this.attach(result); return this.state();
  }
  async join(code, options = {}) {
    if (this.running) throw new HockeyNetworkError("Leave the current room before joining another.");
    const normalized = String(code || "").trim().toUpperCase();
    const saved = this.saved(normalized);
    const result = await this.request("/join", { ...options, code: normalized,
      ...(options.token || saved?.token ? { token: options.token || saved.token } : {}) });
    this.attach(result); return this.state();
  }
  attach(result) {
    this.generation++; this.running = true; this.connected = true;
    this.token = result.token; this.seatId = result.seatId;
    this.inputSeq = finite(result.inputSeq, -1) + 1;
    this.actionSeq = finite(result.actionAck, -1) + 1;
    this.lastReply = -1; this.actions = []; this.history = [];
    this.accept(result); this.save(); this.schedule(0);
  }
  async command(op, options = {}) {
    if (!this.room || !this.token) throw new HockeyNetworkError("Join a hockey room first.");
    const generation = this.generation;
    const result = await this.request(`/${this.room.code}`, { ...options, op, token: this.token });
    if (generation === this.generation && this.running) this.accept(result);
    return this.state();
  }
  configure(options) { return this.command("configure", options); }
  ready(ready = true) { return this.command("ready", { ready }); }
  start() { return this.command("start"); }
  pause() { this.clearInput(); return this.command("pause"); }
  resume() { this.clearInput(); return this.command("resume"); }
  async leave() {
    const room = this.room, token = this.token;
    this.stop(); this.forget(room?.code);
    this.room = null; this.game = null; this.seatId = null; this.token = null; this.connected = false;
    this.notify();
    if (room && token) {
      try { await this.request(`/${room.code}`, { op: "leave", token }); } catch {}
    }
  }
  stop() {
    this.running = false; this.generation++; clearTimeout(this.timer); this.timer = null;
    this.clearInput();
  }
  clearInput() {
    this.input = neutral(); this.actions = []; this.history = []; this.correction = null;
    if (this.running) this.schedule(0);
  }
  setInput(vector) {
    const next = networkVector(vector);
    const holdChanged = ["shotHeld", "dumpHeld", "fightHeld"].some(key => next[key] !== this.input[key]);
    this.input = next;
    if (holdChanged && this.running && this.room?.status === "playing") this.schedule(0);
  }
  action(name, vector, power, details = {}) {
    if (!this.running || this.room?.status !== "playing") return;
    if (name === "hockey-fight") return; // Fight intent is the server-timed held Y input.
    this.setInput(vector); // Release edges must travel with their action, not a later render frame.
    this.actions.push({ seq: this.actionSeq++, name, input: networkVector(vector),
      power: clamp(finite(power, 0.22), 0, 1), details: { heldSeconds: clamp(finite(details.heldSeconds), 0, 4) } });
    if (this.actions.length > 12) this.actions.splice(0, this.actions.length - 12);
    this.schedule(0);
  }
  schedule(delay = POLL_MS) {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }
  async flush() {
    if (!this.running || !this.room) return;
    if (this.inflight) { this.schedule(20); return; }
    this.inflight = true;
    const generation = this.generation, begin = this.now();
    try {
      const result = await this.request(`/${this.room.code}`, { op: "poll", token: this.token,
        seq: this.inputSeq++, input: this.input, actions: this.actions.slice(0, 6) });
      if (!this.running || generation !== this.generation) return;
      this.connected = true; this.errorShown = false; this.accept(result);
    } catch (error) {
      if (!this.running || generation !== this.generation) return;
      this.connected = false; this.history = []; this.correction = null;
      if (["ROOM_ENDED", "INVALID_TOKEN", "VERSION_MISMATCH"].includes(error.code)) {
        this.stop(); this.forget();
        if (this.room) this.room = { ...this.room, status: "closed", reason: error.message };
      }
      if (!this.errorShown) { this.errorShown = true; this.onError(error); }
      this.notify();
    } finally {
      this.inflight = false;
      if (this.running && generation === this.generation)
        this.schedule(this.connected ? Math.max(0, POLL_MS - (this.now() - begin)) : 1000);
    }
  }
  accept(result) {
    if (result.closed) return;
    if (Number.isFinite(result.replySeq) && result.replySeq < this.lastReply) return;
    this.lastReply = finite(result.replySeq, this.lastReply + 1);
    this.lastReceived = this.now(); this.connected = true;
    this.room = result.room; this.seatId = result.seatId;
    if (result.token) this.token = result.token;
    this.actions = this.actions.filter(action => action.seq > result.actionAck);
    const changedMatch = result.matchId !== this.matchId;
    if (changedMatch) { this.matchId = result.matchId; this.game = null; this.history = []; this.targets.clear(); this.correction = null; }
    if (result.state) this.hydrate(result.state, result.ack);
    else this.game = null;
    this.notify();
  }
  hydrate(state, ack) {
    const first = !this.game;
    const game = this.game || Object.create(Match.prototype);
    const priorControlled = game.controlled, priorPhase = game.phase, priorOwner = game.ball?.owner;
    const oldPlayers = game.players || [], oldBall = game.ball || {};
    const { players, ball, ...rest } = state;
    Object.assign(game, rest);
    game.rules = SPORTS.hockey; game.network = true; game.localControllerId = this.seatId;
    const controller = game.controllers?.find(c => c.id === this.seatId);
    game.controlled = controller?.playerId ?? -1;
    game.localSide = controller?.side ?? this.room?.players.find(p => p.id === this.seatId)?.side ?? 0;
    game.step = () => {}; // Only the Node authority advances a network Match.
    const reset = first || priorControlled !== game.controlled || priorPhase !== state.phase || priorOwner !== ball.owner || this.room.status !== "playing";
    this.history = reset ? [] : this.history.filter(frame => frame.seq > ack);
    this.targets.clear();
    game.players = players.map(snapshot => {
      const p = oldPlayers.find(old => old.id === snapshot.id) || {};
      const previous = { x: p.x, y: p.y };
      Object.assign(p, snapshot);
      this.targets.set(p.id, { ...snapshot });
      if (!reset && Number.isFinite(previous.x) && Math.hypot(previous.x - snapshot.x, previous.y - snapshot.y) < 180) {
        p.x = previous.x; p.y = previous.y;
      }
      return p;
    });
    Object.assign(oldBall, ball);
    game.ball = oldBall; this.ballTarget = { ...ball };
    this.game = game;
    const actor = game.user;
    if (actor && !reset) {
      const predicted = { ...players.find(p => p.id === actor.id) };
      for (const frame of this.history)
        movePlayer(predicted, game.rules, frame.dt, frame.input, ball.owner === actor.id);
      const dx = predicted.x - actor.x, dy = predicted.y - actor.y;
      if (Math.hypot(dx, dy) > 100) { actor.x = predicted.x; actor.y = predicted.y; this.correction = null; }
      else this.correction = { x: dx, y: dy };
      actor.vx = predicted.vx; actor.vy = predicted.vy;
    } else this.correction = null;
    if (priorOwner !== ball.owner || reset) this.history = [];
  }
  step(dt) {
    const game = this.game;
    if (!game) return null;
    const seconds = clamp(finite(dt), 0, 0.05);
    const live = this.connected && this.room.status === "playing" && game.phase === "play" && this.now() - this.lastReceived < 800;
    const actor = game.user;
    const age = clamp((this.now() - this.lastReceived) / 1000, 0, 0.1);
    const ease = 1 - Math.exp(-seconds * 15);
    for (const p of game.players) {
      const target = this.targets.get(p.id);
      if (!target) continue;
      if (p === actor && live && !p.keeper && game.isPlayerActive(p) && !p.fighting) {
        movePlayer(p, game.rules, seconds, this.input, game.ball.owner === p.id);
        this.history.push({ seq: this.inputSeq, dt: seconds, input: { ...this.input } });
        let total = this.history.reduce((sum, frame) => sum + frame.dt, 0);
        while (total > MAX_HISTORY_SECONDS && this.history.length) total -= this.history.shift().dt;
        if (this.correction) {
          p.x += this.correction.x * ease; p.y += this.correction.y * ease;
          this.correction.x *= 1 - ease; this.correction.y *= 1 - ease;
        }
      } else if (live) {
        p.x += (target.x + finite(target.vx) * age - p.x) * ease;
        p.y += (target.y + finite(target.vy) * age - p.y) * ease;
      }
    }
    const b = game.ball, target = this.ballTarget;
    if (live && target) {
      if (b.owner !== null && game.players[b.owner]) {
        const owner = game.players[b.owner];
        const len = Math.hypot(owner.fx, owner.fy) || 1;
        b.x = owner.x + owner.fx / len * 16; b.y = owner.y + owner.fy / len * 16;
      } else {
        b.x += (target.x + finite(target.vx) * age - b.x) * ease;
        b.y += (target.y + finite(target.vy) * age - b.y) * ease;
      }
    }
    return game;
  }
}
