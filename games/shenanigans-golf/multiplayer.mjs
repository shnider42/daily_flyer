/** Four permanent golf seats. Only this process owns shots, scores and bot play. */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { GolfGame } from './public/engine.mjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Mulligan', 'Birdie', 'Chip', 'Bogey'];
const COLORS = ['#f8c854', '#67d9d0', '#ed827a', '#b9a0ee'];
const ACTIONS = new Set(['start', 'shot', 'next', 'rematch', 'leave']);

export class RoomError extends Error {
  constructor(status, message, code = 'request_rejected') {
    super(message); this.name = 'RoomError'; this.status = status; this.code = code;
  }
}
const fail = (status, message, code) => { throw new RoomError(status, message, code); };
export function cleanName(value) {
  if (typeof value !== 'string') return 'Golfer';
  return [...value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()].slice(0, 22).join('') || 'Golfer';
}
function validToken(value, expected) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) &&
    typeof expected === 'string' && expected.length === value.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
function freshSeat(index) {
  return { id: `p${index + 1}`, index, human: false, name: BOT_NAMES[index], token: null,
    connected: false, disconnectedAt: null, joinedAt: 0, lastSeen: 0, stream: null,
    pendingReclaim: false, lastSeq: 0, responses: new Map(), rate: { at: 0, count: 0 } };
}

export class RoomHub {
  constructor({ now = () => Date.now(), maxRooms = 32, reconnectMs = 10000,
    orphanMs = 120000, idleMs = 45 * 60000, maxAgeMs = 4 * 3600000,
    broadcastMs = 1000 / 15, gameFactory = options => new GolfGame(options) } = {}) {
    this.now = now; this.maxRooms = maxRooms; this.reconnectMs = reconnectMs;
    this.orphanMs = orphanMs; this.idleMs = idleMs; this.maxAgeMs = maxAgeMs;
    this.broadcastMs = broadcastMs; this.gameFactory = gameFactory;
    this.rooms = new Map(); this.closed = false;
  }
  _code() {
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); }
    while (this.rooms.has(code));
    return code;
  }
  _game(room) {
    const game = this.gameFactory({ ...room.options, seed: randomBytes(4).readUInt32LE(0),
      players: room.seats.map(seat => ({ id: seat.id, name: seat.name,
        isBot: !seat.human || !seat.connected, color: COLORS[seat.index] })) });
    game.state.roundId = randomBytes(12).toString('hex');
    return game;
  }
  _player(room, seat) { return room.game.state.players.find(player => player.id === seat.id); }
  _claim(room, seat, name) {
    const now = this.now();
    seat.human = true; seat.name = cleanName(name); seat.token = randomBytes(32).toString('hex');
    seat.joinedAt = now; seat.lastSeen = now; seat.disconnectedAt = now;
    seat.connected = false; seat.pendingReclaim = false; seat.lastSeq = 0;
    seat.responses = new Map(); seat.rate = { at: now, count: 0 };
    const player = this._player(room, seat);
    if (player) {
      player.name = seat.name;
      // A late join cannot cancel a shot already taken by the computer.
      seat.pendingReclaim = !!player.ball.moving;
      player.isBot = false;
    }
    room.touchedAt = now;
  }
  create(input = {}) {
    if (this.closed) fail(503, 'The clubhouse is restarting. Try again shortly.', 'restarting');
    this.prune();
    if (this.rooms.size >= this.maxRooms) fail(503, 'All courses are in use. Try again shortly.', 'capacity');
    const now = this.now();
    const room = { code: this._code(), seats: Array.from({ length: 4 }, (_, i) => freshSeat(i)),
      hostId: 'p1', started: false, closed: false, revision: 1, createdAt: now,
      touchedAt: now, lastBroadcastAt: now, lastConnectedAt: now, game: null,
      options: { difficulty: ['casual', 'club', 'expert'].includes(input.difficulty) ? input.difficulty : 'club',
        mode: input.mode === 'points' ? 'points' : 'stroke' } };
    room.game = this._game(room);
    this._claim(room, room.seats[0], input.name);
    this.rooms.set(room.code, room);
    return this.credentials(room, room.seats[0]);
  }
  room(code) {
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/i.test(code)) fail(404, 'Enter a six-character room code.', 'room_missing');
    const room = this.rooms.get(code.toUpperCase());
    if (!room || room.closed) fail(404, 'That room has closed. Create a new round.', 'room_missing');
    return room;
  }
  auth(code, token) {
    const room = this.room(code);
    const seat = room.seats.find(candidate => candidate.human && validToken(token, candidate.token));
    if (!seat) fail(401, 'That golfer seat is no longer available. Join with the room code.', 'seat_missing');
    return { room, seat, player: this._player(room, seat) };
  }
  credentials(room, seat) {
    return { code: room.code, token: seat.token, playerId: seat.id,
      lastSeq: seat.lastSeq, snapshot: this.snapshot(room) };
  }
  join(code, input = {}) {
    if (this.closed) fail(503, 'The clubhouse is restarting.', 'restarting');
    const room = this.room(code);
    const seat = room.seats.find(candidate => !candidate.human);
    if (!seat) fail(409, 'All four golfer seats are taken.', 'room_full');
    this._claim(room, seat, input.name);
    if (!room.hostId) room.hostId = seat.id;
    this.broadcast(room);
    return this.credentials(room, seat);
  }
  rejoin(code, token) {
    const { room, seat } = this.auth(code, token);
    seat.lastSeen = this.now(); room.touchedAt = this.now();
    return this.credentials(room, seat);
  }
  snapshot(room) {
    const state = room.game.snapshot();
    state.phase = room.started ? state.phase : 'lobby';
    state.code = room.code; state.hostId = room.hostId; state.revision = room.revision;
    state.serverTime = this.now(); state.started = room.started;
    state.players = state.players.map(player => {
      const seat = room.seats.find(candidate => candidate.id === player.id);
      return { ...player, human: !!seat?.human, connected: !!seat?.connected,
        reconnecting: !!seat?.human && (!seat.connected || seat.pendingReclaim) };
    });
    return state;
  }
  connect(code, token, stream) {
    if (typeof stream !== 'function') fail(400, 'A room stream is required.');
    const { room, seat, player } = this.auth(code, token);
    const previous = seat.stream;
    seat.stream = stream; seat.connected = true; seat.disconnectedAt = null;
    seat.lastSeen = this.now(); room.lastConnectedAt = this.now(); room.touchedAt = this.now();
    seat.pendingReclaim = !!player.ball.moving && (seat.pendingReclaim || player.isBot);
    // Existing motion continues unchanged, but no new CPU shot may begin before
    // the returning human reaches the resting boundary.
    player.isBot = false;
    // Replacing a stream never lets the old close callback detach the new one.
    if (previous && previous !== stream) { try { previous.close?.(); } catch {} }
    this.broadcast(room);
    return () => this.disconnect(room, seat, stream);
  }
  disconnect(room, seat, stream) {
    if (room.closed || seat.stream !== stream) return;
    seat.stream = null; seat.connected = false; seat.disconnectedAt = this.now();
    seat.pendingReclaim = false; room.touchedAt = this.now();
    this.broadcast(room);
  }
  _migrateHost(room) {
    const current = room.seats.find(seat => seat.id === room.hostId);
    if (current?.human && (current.connected || this.now() - (current.disconnectedAt ?? this.now()) < this.reconnectMs)) return;
    room.hostId = room.seats.find(seat => seat.human && seat.connected)?.id ||
      room.seats.find(seat => seat.human)?.id || null;
  }
  _release(room, seat) {
    const stream = seat.stream;
    seat.stream = null; seat.connected = false; seat.human = false; seat.token = null;
    seat.pendingReclaim = false; seat.disconnectedAt = null; seat.name = BOT_NAMES[seat.index];
    const player = this._player(room, seat);
    player.name = seat.name; player.isBot = true;
    this._migrateHost(room);
    try { stream?.close?.(); } catch {}
  }
  _rate(seat) {
    const now = this.now();
    if (now - seat.rate.at >= 1000) seat.rate = { at: now, count: 0 };
    if (++seat.rate.count > 30) fail(429, 'Give the shot a moment before trying again.', 'rate_limited');
  }
  input(code, token, envelope = {}) {
    const { room, seat } = this.auth(code, token);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) fail(400, 'Send a golf action.', 'bad_input');
    const seq = envelope.seq;
    if (!Number.isSafeInteger(seq) || seq < 1 || seq > 0x7fffffff) fail(400, 'A valid input sequence is required.', 'bad_sequence');
    if (seq <= seat.lastSeq) {
      const cached = seat.responses.get(seq);
      if (cached) return { ...cached, duplicate: true, snapshot: this.snapshot(room) };
      fail(409, 'That input is too old. Reconnect to recover.', 'stale_sequence');
    }
    this._rate(seat);
    let result;
    try { result = this._apply(room, seat, envelope); }
    catch (error) {
      if (!(error instanceof RoomError)) throw error;
      result = { ok: false, error: error.message, code: error.code, status: error.status };
    }
    seat.lastSeq = seq; seat.lastSeen = this.now(); room.touchedAt = this.now();
    result = { ...result, seq };
    seat.responses.set(seq, result);
    if (seat.responses.size > 48) seat.responses.delete(seat.responses.keys().next().value);
    this.broadcast(room);
    const response = { ...result, snapshot: this.snapshot(room) };
    if (!room.seats.some(candidate => candidate.human)) this.closeRoom(room, 'Everyone has left this course.');
    return response;
  }
  _apply(room, seat, input) {
    if (!ACTIONS.has(input.action)) fail(400, 'Choose a valid golf action.', 'bad_action');
    if (input.action === 'leave') { this._release(room, seat); return { ok: true }; }
    if (!seat.connected) fail(409, 'Reconnect before taking your next shot.', 'not_connected');
    const state = room.game.state;
    if (input.roundId !== state.roundId) fail(409, 'That action belongs to an earlier round.', 'stale_round');
    if (!Number.isInteger(input.holeIndex) || input.holeIndex !== state.holeIndex) fail(409, 'The group has moved to another hole.', 'stale_hole');
    if (input.action === 'start') {
      if (seat.id !== room.hostId) fail(403, 'The room host starts the round.', 'host_only');
      if (room.started) fail(409, 'This round has already started.', 'already_started');
      room.started = true; return { ok: true };
    }
    if (input.action === 'rematch') {
      if (seat.id !== room.hostId) fail(403, 'The room host starts a rematch.', 'host_only');
      if (!room.started || state.phase !== 'finished') fail(409, 'Finish this round before starting a rematch.', 'wrong_phase');
      room.game = this._game(room); room.started = true;
      for (const member of room.seats) member.pendingReclaim = false;
      return { ok: true };
    }
    if (!room.started) fail(409, 'Wait for the host to start the round.', 'not_started');
    if (input.action === 'next') {
      if (state.phase !== 'holeComplete') fail(409, 'Everyone must finish this hole first.', 'wrong_phase');
      const changed = room.game.nextHole();
      if (changed === false || changed?.ok === false) fail(409, 'This hole cannot advance yet.', 'wrong_phase');
      return { ok: true };
    }
    if (typeof input.angle !== 'number' || !Number.isFinite(input.angle) || Math.abs(input.angle) > 1e6 ||
      typeof input.power !== 'number' || !Number.isFinite(input.power) || input.power < .05 || input.power > 1)
      fail(400, 'Aim and power must be valid numbers. Power must be between 5% and 100%.', 'bad_shot');
    if (seat.pendingReclaim || this._player(room, seat).isBot) fail(409, 'Your computer golfer is finishing a shot. You take over when the ball stops.', 'handoff_pending');
    const outcome = room.game.shoot(seat.id, { angle: Math.atan2(Math.sin(input.angle), Math.cos(input.angle)), power: input.power });
    if (!outcome?.ok) fail(409, outcome?.error || 'Wait until your ball has stopped.', 'shot_rejected');
    return { ok: true };
  }
  broadcast(room) {
    if (room.closed) return;
    room.revision++; room.lastBroadcastAt = this.now();
    const packet = { snapshot: this.snapshot(room) };
    for (const seat of room.seats) if (seat.stream) {
      const stream = seat.stream;
      try { stream(packet); }
      catch {
        // Avoid recursive broadcast when several clients are gone simultaneously.
        if (seat.stream === stream) {
          seat.stream = null; seat.connected = false; seat.disconnectedAt = this.now(); seat.pendingReclaim = false;
        }
        try { stream.close?.(); } catch {}
      }
    }
  }
  tick(dt) {
    if (this.closed) return;
    const now = this.now();
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .25)) : 0;
    for (const room of this.rooms.values()) {
      let changed = false;
      if (room.seats.some(seat => seat.connected)) room.lastConnectedAt = now;
      for (const seat of room.seats) {
        const player = this._player(room, seat);
        if (seat.human && !seat.connected && now - (seat.disconnectedAt ?? seat.joinedAt) >= this.reconnectMs && !player.isBot) {
          player.isBot = true; changed = true;
        }
        if (seat.human && seat.connected && seat.pendingReclaim && !player.ball.moving) {
          seat.pendingReclaim = false; player.isBot = false; changed = true;
        }
      }
      const previousHost = room.hostId; this._migrateHost(room); changed ||= previousHost !== room.hostId;
      if (room.started && room.game.state.phase !== 'finished') room.game.update(step);
      // Catch the exact resting boundary before a bot can take its next shot.
      for (const seat of room.seats) if (seat.connected && seat.pendingReclaim && !this._player(room, seat).ball.moving) {
        seat.pendingReclaim = false; this._player(room, seat).isBot = false; changed = true;
      }
      const interval = room.started && room.game.state.phase !== 'finished' ? this.broadcastMs : 1000;
      if (changed || now - room.lastBroadcastAt >= interval) this.broadcast(room);
    }
    this.prune();
  }
  prune() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      const nobodyConnected = !room.seats.some(seat => seat.connected);
      const orphaned = nobodyConnected && now - room.lastConnectedAt > this.orphanMs;
      const idleLobby = !room.started && now - room.touchedAt > this.idleMs;
      if (orphaned || idleLobby || now - room.createdAt > this.maxAgeMs) this.closeRoom(room, 'This room expired. Create a new round.');
    }
  }
  closeRoom(room, reason = 'This room has closed.') {
    if (room.closed) return;
    room.revision++;
    const snapshot = { ...this.snapshot(room), closed: true, reason };
    room.closed = true; this.rooms.delete(room.code);
    for (const seat of room.seats) if (seat.stream) {
      const stream = seat.stream; seat.stream = null; seat.connected = false;
      try { stream({ snapshot }); stream.close?.(); } catch {}
    }
  }
  close() {
    this.closed = true;
    for (const room of this.rooms.values()) this.closeRoom(room, 'The clubhouse is restarting. Create a new room shortly.');
  }
}
