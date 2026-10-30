import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CoopGame } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { WEAPONS } from '../daily_flyer/themes/breach_assets/core.mjs';

export const PROTOCOL = 2;
export const COOP_MISSIONS = ['crosslink-11', 'underworks-13', 'glasshouse-17'];
// Older clients may still use the original two maps. A new-map handshake must
// advertise its local level data before we attach it to a shared simulation.
const supportsMission = (message, mission) => message.supportedMissions === undefined
  ? ['crosslink-11', 'underworks-13'].includes(mission)
  : Array.isArray(message.supportedMissions) && message.supportedMissions.includes(mission);
const DIFFICULTIES = new Set(['relaxed', 'standard', 'hard']);
const NEUTRAL = { forward: 0, strafe: 0, fire: false };
const safeName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) : '';
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{32}$/.test(b) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Transport-independent room lifecycle. A peer supplies send(message) and close(). */
export class BreachRooms {
  constructor({ now = Date.now, GameClass = CoopGame, maxRooms = 4, reconnectMs = 60_000, idleMs = 600_000, maxLifeMs = 7_200_000 } = {}) {
    this.now = now; this.GameClass = GameClass; this.maxRooms = maxRooms;
    this.reconnectMs = reconnectMs; this.idleMs = idleMs; this.maxLifeMs = maxLifeMs;
    this.rooms = new Map(); this.tick = 0; this.shuttingDown = false;
  }

  error(peer, code, message) { peer.send({ type: 'error', code, message }); }

  record(room) {
    return {
      id: room.id, mission: room.mission, difficulty: room.difficulty,
      status: room.status, ownerId: room.ownerId, maxPlayers: 2,
      pauseReason: room.pauseReason,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, connected: !!p.peer, ready: p.ready })),
    };
  }

  broadcast(room, message) { for (const player of room.players.values()) player.peer?.send(message); }
  publishRoom(room) { this.broadcast(room, { type: 'room', room: this.record(room) }); }

  statePacket(room, events = []) {
    return {
      type: 'state', tick: room.tick,
      ackByPlayer: Object.fromEntries([...room.players.values()].map(p => [p.id, p.ack])),
      state: room.game.networkSnapshot(), events,
    };
  }

  publishState(room) {
    if (!room.game) return;
    this.broadcast(room, this.statePacket(room, room.game.drainEvents()));
  }

  attach(room, player, peer, resumed = false) {
    player.peer = peer; player.disconnectedAt = null; player.ready = false;
    player.input = { ...NEUTRAL }; player.pendingFireAt = null; player.lastInputAt = 0; player.seq = -1; player.ack = -1;
    peer.roomId = room.id; peer.playerId = player.id;
    peer.send({ type: 'welcome', protocol: PROTOCOL, roomId: room.id, selfId: player.id, ownerId: room.ownerId, token: player.token, resumed });
    if (resumed && room.status === 'paused') {
      const missing = [...room.players.values()].find(p => !p.peer);
      room.pauseReason = missing ? `Waiting for ${missing.name} to reconnect.` : `${player.name} reconnected. Both players must resume.`;
    }
    this.publishRoom(room);
    if (room.game) peer.send(this.statePacket(room));
  }

  create(peer, message) {
    if (this.rooms.size >= this.maxRooms) return this.error(peer, 'ROOM_CAPACITY', 'All test rooms are in use. Try again after another team finishes.');
    if (!COOP_MISSIONS.includes(message.mission)) return this.error(peer, 'INVALID_MISSION', 'Choose Crosslink, The Underworks, or The Glasshouse for co-op.');
    if (!supportsMission(message, message.mission)) return this.error(peer, 'VERSION_MISMATCH', 'Refresh the game to load this co-op mission.');
    if (!DIFFICULTIES.has(message.difficulty)) return this.error(peer, 'INVALID_DIFFICULTY', 'Choose a valid combat difficulty.');
    const name = safeName(message.name);
    if (!name) return this.error(peer, 'INVALID_NAME', 'Enter a display name to create a room.');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id; do { id = [...randomBytes(8)].map(byte => alphabet[byte & 31]).join(''); } while (this.rooms.has(id));
    const now = this.now();
    const room = { id, mission: message.mission, difficulty: message.difficulty, ownerId: 'p1', status: 'lobby', pauseReason: '', players: new Map(), game: null, tick: 0, createdAt: now, lastActivity: now, statusChangedAt: now };
    const player = this.newPlayer('p1', name);
    room.players.set(player.id, player); this.rooms.set(id, room); this.attach(room, player, peer);
  }

  newPlayer(id, name) {
    return { id, name, token: randomBytes(24).toString('base64url'), peer: null, ready: false, disconnectedAt: null, input: { ...NEUTRAL }, pendingFireAt: null, seq: -1, ack: -1, lastInputAt: 0, lastActionAt: -Infinity };
  }

  join(peer, message) {
    const id = typeof message.roomId === 'string' ? message.roomId.trim().toUpperCase() : '';
    const room = this.rooms.get(id);
    if (!room) return this.error(peer, 'ROOM_NOT_FOUND', 'This room has ended or expired. Ask your friend for a new invite.');
    if (!supportsMission(message, room.mission)) return this.error(peer, 'VERSION_MISMATCH', 'Refresh the game to load this co-op mission.');
    if (message.token) {
      const player = [...room.players.values()].find(p => sameToken(p.token, message.token));
      if (!player) return this.error(peer, 'INVALID_TOKEN', 'This reconnect pass has expired. Create a new room with your friend.');
      if (player.peer) {
        if (message.replace !== true) return this.error(peer, 'ALREADY_CONNECTED', 'This player is already connected. Close the other game tab, then reconnect.');
        // The unguessable per-player token was checked above. Wi-Fi handovers can
        // leave the old socket apparently open; invalidate it BEFORE attaching
        // its replacement so late packets/close callbacks cannot control the slot.
        const old = player.peer;
        old.roomId = null; old.playerId = null;
        player.peer = null; player.ready = false; player.input = { ...NEUTRAL };
        player.disconnectedAt = this.now();
        if (['playing', 'paused'].includes(room.status)) this.pause(room, `${player.name} is reconnecting. Mission progress is held.`);
        old.send({ type: 'closed', message: 'This player reconnected on another connection. The team session continues there.' });
        old.close(1000, 'Connection replaced');
      }
      if (player.disconnectedAt !== null && this.now() - player.disconnectedAt > this.reconnectMs) {
        this.end(room, 'The reconnect window expired. Create a new room to play again.');
        return this.error(peer, 'ROOM_NOT_FOUND', 'The reconnect window expired. Create a new room to play again.');
      }
      this.attach(room, player, peer, true); room.lastActivity = this.now();
      return;
    }
    if (room.players.size >= 2) return this.error(peer, 'ROOM_FULL', 'This room already has two players.');
    if (room.status !== 'lobby') return this.error(peer, 'ROOM_STARTED', 'This run has already started. Ask your friend to create a new room.');
    const name = safeName(message.name);
    if (!name) return this.error(peer, 'INVALID_NAME', 'Enter a display name to join.');
    const player = this.newPlayer('p2', name);
    room.players.set(player.id, player); room.lastActivity = this.now(); this.attach(room, player, peer);
  }

  handle(peer, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return this.error(peer, 'INVALID_MESSAGE', 'That room message could not be read.');
    if (this.shuttingDown) return this.error(peer, 'SERVER_RESTARTING', 'The room service is restarting. Try again shortly.');
    if (message.type === 'ping') { peer.send({ type: 'pong', sentAt: Number.isFinite(message.sentAt) ? message.sentAt : 0 }); return; }
    if (message.type === 'create' || message.type === 'join') {
      if (message.protocol !== PROTOCOL) return this.error(peer, 'VERSION_MISMATCH', 'Refresh the game to use the current room version.');
      if (peer.roomId) return this.error(peer, 'ALREADY_IN_ROOM', 'Leave your current room first.');
      return message.type === 'create' ? this.create(peer, message) : this.join(peer, message);
    }
    const room = this.rooms.get(peer.roomId), player = room?.players.get(peer.playerId);
    if (!room || player?.peer !== peer) return this.error(peer, 'NOT_IN_ROOM', 'Join a room first.');
    if (message.type !== 'input') room.lastActivity = this.now();
    switch (message.type) {
      case 'ready':
        if (room.status !== 'lobby') return;
        player.ready = message.ready === true; this.publishRoom(room); return;
      case 'start':
        if (player.id !== room.ownerId) return this.error(peer, 'OWNER_ONLY', 'The room creator starts the mission.');
        if (room.status !== 'lobby') return;
        if (!this.allReady(room)) return this.error(peer, 'NOT_READY', 'Both players must join and mark Ready.');
        room.game = new this.GameClass({ mission: room.mission, difficulty: room.difficulty, seed: randomBytes(4).readUInt32LE(), players: [...room.players.keys()] });
        room.game.start(); room.status = 'playing'; room.pauseReason = ''; room.statusChangedAt = this.now();
        this.clearInputs(room); this.publishRoom(room); this.publishState(room); return;
      case 'input': return this.input(room, player, message);
      case 'interact':
      case 'weapon':
        if (room.status !== 'playing' || this.now() - player.lastActionAt < 100) return;
        if (message.type === 'weapon' && message.weapon !== undefined && (typeof message.weapon !== 'string' || !Object.hasOwn(WEAPONS, message.weapon))) return this.error(peer, 'INVALID_WEAPON', 'Choose a carried weapon.');
        player.lastActionAt = this.now();
        if (message.type === 'interact') room.game.interact(player.id); else room.game.switchWeapon(player.id, message.weapon);
        this.syncStatus(room); this.publishState(room); return;
      case 'pause':
        if (!['playing', 'paused'].includes(room.status)) return;
        this.pause(room, `${player.name} ${message.reason === 'background' ? 'switched away from the game' : message.reason === 'network' ? 'lost fresh server updates' : 'paused the mission'}. Both players must resume.`); return;
      case 'resume':
        if (room.status !== 'paused') return;
        player.ready = true;
        if (this.allReady(room)) {
          room.game.resume(); room.status = 'playing'; room.pauseReason = ''; room.statusChangedAt = this.now(); this.clearInputs(room);
        }
        this.publishRoom(room); this.publishState(room); return;
      case 'restart':
        if (player.id !== room.ownerId) return this.error(peer, 'OWNER_ONLY', 'The room creator restarts the team.');
        if (!room.game) return;
        if (message.checkpoint !== true || !room.game.restartCheckpoint()) room.game.restart();
        room.game.pause(); room.status = 'paused'; room.statusChangedAt = this.now(); room.pauseReason = message.checkpoint === true ? 'Team checkpoint restored. Both players must resume.' : 'Mission restarted. Both players must resume.';
        for (const p of room.players.values()) p.ready = false;
        this.clearInputs(room); this.publishRoom(room); this.publishState(room); return;
      case 'leave': this.end(room, `${player.name} left the room. Create a new room to play together again.`); return;
      default: this.error(peer, 'UNKNOWN_MESSAGE', 'That action is not supported by this room version.');
    }
  }

  allReady(room) { return room.players.size === 2 && [...room.players.values()].every(p => p.peer && p.ready); }

  input(room, player, message) {
    if (room.status !== 'playing') return;
    if (!Number.isSafeInteger(message.seq) || message.seq < 0 || message.seq <= player.seq || message.seq > 1e12) return;
    if (![message.forward, message.strafe, message.angle].every(Number.isFinite) || Math.abs(message.angle) > 1e6 || typeof message.fire !== 'boolean') return;
    player.seq = message.seq; player.lastInputAt = this.now();
    player.input = { forward: clamp(message.forward, -1, 1), strafe: clamp(message.strafe, -1, 1), angle: message.angle, fire: message.fire, aimAssist: message.aimAssist !== false };
    // A tap and its release may both arrive between fixed simulation steps.
    // Keep one fresh pulse until the next step without extending held fire.
    if (message.fire) player.pendingFireAt = player.lastInputAt;
  }

  clearInputs(room) { for (const p of room.players.values()) { p.input = { ...NEUTRAL }; p.pendingFireAt = null; p.lastInputAt = this.now(); } }

  pause(room, reason) {
    if (room.status !== 'playing' && room.status !== 'paused') return;
    room.game.pause(); room.status = 'paused'; room.pauseReason = reason; room.statusChangedAt = this.now(); room.lastActivity = this.now();
    for (const p of room.players.values()) p.ready = false;
    this.clearInputs(room); this.publishRoom(room); this.publishState(room);
  }

  disconnect(peer) {
    const room = this.rooms.get(peer.roomId), player = room?.players.get(peer.playerId);
    if (!player || player.peer !== peer) return;
    player.peer = null; player.disconnectedAt = this.now(); player.ready = false; player.input = { ...NEUTRAL }; player.pendingFireAt = null; room.lastActivity = this.now();
    peer.roomId = null; peer.playerId = null;
    if (['playing', 'paused'].includes(room.status)) this.pause(room, `${player.name} disconnected. Their place is reserved for 60 seconds.`);
    else this.publishRoom(room);
  }

  syncStatus(room) {
    if (!room.game || !['won', 'dead'].includes(room.game.state.status) || room.status === room.game.state.status) return;
    room.status = room.game.state.status; room.statusChangedAt = this.now(); room.lastActivity = this.now(); this.clearInputs(room); this.publishRoom(room);
  }

  /** Called exactly once per fixed server step. Client packets do not advance time. */
  step(dt = 1 / 30) {
    this.tick++;
    const now = this.now();
    for (const room of this.rooms.values()) {
      const expiredPlayer = [...room.players.values()].find(p => !p.peer && p.disconnectedAt !== null && now - p.disconnectedAt > this.reconnectMs);
      if (expiredPlayer) { this.end(room, `${expiredPlayer.name} could not reconnect in time. Create a new room to try again.`); continue; }
      if (now - room.createdAt > this.maxLifeMs || room.status !== 'playing' && now - room.lastActivity > this.idleMs) {
        this.end(room, 'This room expired after being inactive. Create a new room to play again.'); continue;
      }
      if (room.status !== 'playing') continue;
      const stalled = [...room.players.values()].find(p => p.peer && now - p.lastInputAt > 1500);
      if (stalled) { this.pause(room, `${stalled.name}'s connection stopped sending controls. Both players must resume when the connection returns.`); continue; }
      const inputs = {};
      for (const p of room.players.values()) {
        inputs[p.id] = p.peer && now - p.lastInputAt <= 300
          ? { ...p.input, fire: p.input.fire || p.pendingFireAt !== null && now - p.pendingFireAt <= 300 }
          : NEUTRAL;
        p.pendingFireAt = null;
        p.ack = p.seq;
      }
      room.game.update(dt, inputs); room.tick++; this.syncStatus(room);
      if (room.tick % 3 === 0 || room.status !== 'playing') this.publishState(room);
    }
  }

  end(room, message) {
    if (!this.rooms.has(room.id)) return;
    this.rooms.delete(room.id);
    for (const p of room.players.values()) {
      const peer = p.peer; if (!peer) continue;
      peer.roomId = null; peer.playerId = null;
      peer.send({ type: 'closed', message }); peer.close(1000, 'Room ended');
      p.peer = null;
    }
  }

  shutdown() {
    this.shuttingDown = true;
    for (const room of [...this.rooms.values()]) this.end(room, 'The room service is restarting. Your solo save is safe. Create a new room shortly.');
  }
}
