/** A private two-seat table. The server alone accepts shots and resolves rules. */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createGame, shoot, placeCue, step } from './public/engine.mjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIONS = new Set(['start', 'shoot', 'place', 'rematch', 'leave', 'claim']);
const copy = value => structuredClone(value);

export class RoomError extends Error {
  constructor(status, message, code = 'request_rejected') {
    super(message); this.name = 'RoomError'; this.status = status; this.code = code;
  }
}
const fail = (status, message, code) => { throw new RoomError(status, message, code); };
export function cleanName(value) {
  if (typeof value !== 'string') return 'Player';
  return [...value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()].slice(0, 22).join('') || 'Player';
}
function sameToken(value, expected) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) &&
    typeof expected === 'string' && expected.length === value.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
function seatAt(index) {
  return { index, name: `Player ${index + 1}`, occupied: false, token: null, connected: false,
    stream: null, disconnectedAt: null, score: 0, lastSeq: 0, lastAimSeq: 0,
    responses: new Map(), rate: { at: 0, count: 0 }, aimRate: { at: 0, count: 0 } };
}

export class RoomHub {
  constructor({ now = () => Date.now(), maxRooms = 48, claimAfterMs = 60000,
    orphanMs = 5 * 60000, idleMs = 60 * 60000, maxAgeMs = 6 * 3600000,
    broadcastMs = 1000 / 20, gameFactory = createGame, shootGame = shoot,
    placeGame = placeCue, stepGame = step } = {}) {
    Object.assign(this, { now, maxRooms, claimAfterMs, orphanMs, idleMs, maxAgeMs,
      broadcastMs, gameFactory, shootGame, placeGame, stepGame });
    this.rooms = new Map(); this.closed = false;
  }
  _code() {
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); }
    while (this.rooms.has(code));
    return code;
  }
  _claimSeat(room, seat, name) {
    seat.name = cleanName(name); seat.occupied = true; seat.token = randomBytes(32).toString('hex');
    seat.connected = false; seat.disconnectedAt = this.now(); seat.lastSeq = 0; seat.lastAimSeq = 0;
    seat.responses.clear(); seat.rate = { at: this.now(), count: 0 }; seat.score = 0;
    room.touchedAt = this.now();
  }
  create(input = {}) {
    if (this.closed) fail(503, 'The table server is restarting. Try again shortly.', 'restarting');
    this.prune();
    if (this.rooms.size >= this.maxRooms) fail(503, 'All tables are in use. Try again shortly.', 'capacity');
    const now = this.now();
    const room = { code: this._code(), seats: [seatAt(0), seatAt(1)], hostIndex: 0,
      game: null, rackId: null, rackNumber: 0, breaker: 0, scoredRack: null,
      aim: null, rematchVotes: new Set(), revision: 1, createdAt: now,
      touchedAt: now, lastBroadcastAt: now, lastConnectedAt: now, closed: false };
    this._claimSeat(room, room.seats[0], input.name);
    this.rooms.set(room.code, room);
    return this.credentials(room, room.seats[0]);
  }
  room(code) {
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/i.test(code))
      fail(404, 'Enter the six-character room code from your friend.', 'room_missing');
    const room = this.rooms.get(code.toUpperCase());
    if (!room || room.closed) fail(404, 'That room has ended. Create a new table.', 'room_missing');
    return room;
  }
  auth(code, token) {
    const room = this.room(code);
    const seat = room.seats.find(candidate => candidate.occupied && sameToken(token, candidate.token));
    if (!seat) fail(401, 'Your place at this table is no longer available. Join a new room.', 'seat_missing');
    return { room, seat };
  }
  credentials(room, seat) {
    return { ok: true, code: room.code, token: seat.token, seatIndex: seat.index,
      lastSeq: seat.lastSeq, lastAimSeq: seat.lastAimSeq, snapshot: this.snapshot(room) };
  }
  join(code, input = {}) {
    if (this.closed) fail(503, 'The table server is restarting. Try again shortly.', 'restarting');
    const room = this.room(code);
    const seat = room.seats.find(candidate => !candidate.occupied);
    if (!seat) fail(409, 'Both seats are taken. This is a two-player table.', 'room_full');
    if (room.game) fail(409, 'This match has ended. Create a new table to play with someone else.', 'match_started');
    this._claimSeat(room, seat, input.name); this.broadcast(room);
    return this.credentials(room, seat);
  }
  rejoin(code, token) {
    const { room, seat } = this.auth(code, token);
    room.touchedAt = this.now();
    return this.credentials(room, seat);
  }
  snapshot(room) {
    const now = this.now();
    return { code: room.code, phase: !room.game ? 'lobby' : room.game.phase === 'finished' ? 'finished' : 'playing',
      game: room.game ? copy(room.game) : null, rackId: room.rackId, rackNumber: room.rackNumber,
      hostIndex: room.hostIndex, breaker: room.breaker,
      seats: room.seats.map(seat => ({ index: seat.index, name: seat.name, occupied: seat.occupied,
        connected: seat.connected, ready: seat.occupied && seat.connected, score: seat.score,
        disconnectedAt: seat.occupied && !seat.connected ? seat.disconnectedAt : null })),
      aim: room.aim ? { ...room.aim } : null, rematchVotes: [...room.rematchVotes],
      claimAfterMs: this.claimAfterMs, claimAvailable: room.seats.map((seat, index) => {
        const other = room.seats[1 - index];
        return !!room.game && room.game.phase !== 'finished' && seat.connected && other.occupied &&
          !other.connected && other.disconnectedAt !== null && now - other.disconnectedAt >= this.claimAfterMs;
      }), revision: room.revision, serverTime: now };
  }
  connect(code, token, stream) {
    if (typeof stream !== 'function') fail(400, 'A room stream is required.', 'bad_stream');
    const { room, seat } = this.auth(code, token), previous = seat.stream;
    seat.stream = stream; seat.connected = true; seat.disconnectedAt = null;
    room.lastConnectedAt = room.touchedAt = this.now();
    if (previous && previous !== stream) { try { previous.close?.(); } catch {} }
    this.broadcast(room);
    return () => this.disconnect(room, seat, stream);
  }
  disconnect(room, seat, stream) {
    if (room.closed || seat.stream !== stream) return;
    seat.stream = null; seat.connected = false; seat.disconnectedAt = this.now();
    room.rematchVotes.delete(seat.index); room.touchedAt = this.now();
    this.broadcast(room);
  }
  _rate(seat, aim = false) {
    const field = aim ? 'aimRate' : 'rate', now = this.now();
    if (now - seat[field].at >= 1000) seat[field] = { at: now, count: 0 };
    if (++seat[field].count > (aim ? 20 : 30)) fail(429, 'Give that action a moment before trying again.', 'rate_limited');
  }
  _rack(room) {
    if (room.rackNumber > 0) room.breaker = 1 - room.breaker;
    room.game = this.gameFactory({ names: room.seats.map(seat => seat.name), mode: 'online',
      seed: randomBytes(4).readUInt32LE(0), breaker: room.breaker });
    room.rackId = randomBytes(12).toString('hex'); room.rackNumber++;
    room.scoredRack = null; room.aim = null; room.rematchVotes.clear(); room.touchedAt = this.now();
    for (const seat of room.seats) seat.lastAimSeq = 0;
  }
  _bothConnected(room) {
    if (!room.seats.every(seat => seat.occupied && seat.connected))
      fail(409, 'Waiting for both players to be connected. Your table is saved.', 'opponent_absent');
  }
  _rackMatches(room, input) {
    if (input.rackId !== room.rackId) fail(409, 'That action belongs to an earlier rack.', 'stale_rack');
    if (room.game && input.shotNumber !== room.game.shotNumber)
      fail(409, 'The table has moved on. Aim again before taking your shot.', 'stale_shot');
  }
  _currentPlayer(room, seat) {
    if (!room.game || room.game.phase === 'finished') fail(409, 'Start a rack before playing a shot.', 'wrong_phase');
    this._bothConnected(room);
    if (room.game.turn !== seat.index) fail(403, 'It is your opponent’s turn.', 'wrong_turn');
    if (room.game.phase !== 'aiming') fail(409, 'Wait for every ball to stop.', 'balls_moving');
  }
  _shotInput(input) {
    if (typeof input.angle !== 'number' || !Number.isFinite(input.angle) || Math.abs(input.angle) > 1e6 ||
      typeof input.power !== 'number' || !Number.isFinite(input.power) || input.power < .05 || input.power > 1 ||
      (input.spin !== undefined && (typeof input.spin !== 'number' || !Number.isFinite(input.spin) || Math.abs(input.spin) > 1)) ||
      (input.calledPocket !== undefined && input.calledPocket !== null &&
        (!Number.isInteger(input.calledPocket) || input.calledPocket < 0 || input.calledPocket > 5)))
      fail(400, 'Choose a valid aim, power and pocket. Power is 5–100%.', 'bad_shot');
    return { angle: Math.atan2(Math.sin(input.angle), Math.cos(input.angle)), power: input.power,
      spin: input.spin ?? 0, calledPocket: input.calledPocket ?? null };
  }
  input(code, token, envelope = {}) {
    if (this.closed) fail(503, 'The table server is restarting. Try again shortly.', 'restarting');
    const { room, seat } = this.auth(code, token);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) fail(400, 'Send a table action.', 'bad_input');
    if (envelope.action === 'aim') return this._aim(room, seat, envelope);
    const seq = envelope.seq;
    if (!Number.isSafeInteger(seq) || seq < 1 || seq > 0x7fffffff) fail(400, 'A valid input sequence is required.', 'bad_sequence');
    if (seq <= seat.lastSeq) {
      const cached = seat.responses.get(seq);
      if (cached) return { ...cached, duplicate: true, snapshot: this.snapshot(room) };
      fail(409, 'That input is too old. Reconnect to recover your place.', 'stale_sequence');
    }
    this._rate(seat);
    let result;
    try { result = this._apply(room, seat, envelope); }
    catch (error) {
      if (!(error instanceof RoomError)) throw error;
      result = { ok: false, error: error.message, code: error.code, status: error.status };
    }
    seat.lastSeq = seq; room.touchedAt = this.now(); result = { ...result, seq };
    seat.responses.set(seq, result);
    if (seat.responses.size > 64) seat.responses.delete(seat.responses.keys().next().value);
    this._recordResult(room); this.broadcast(room);
    const response = { ...result, snapshot: this.snapshot(room) };
    if (!room.seats.some(candidate => candidate.occupied)) this.closeRoom(room, 'Both players have left the table.');
    return response;
  }
  _apply(room, seat, input) {
    if (!ACTIONS.has(input.action)) fail(400, 'Choose a valid table action.', 'bad_action');
    if (input.action === 'leave') { this._leave(room, seat); return { ok: true }; }
    if (!seat.connected) fail(409, 'Reconnect before taking another action.', 'not_connected');
    this._rackMatches(room, input);
    if (input.action === 'start') {
      if (seat.index !== room.hostIndex) fail(403, 'The host starts the first rack.', 'host_only');
      if (room.game) fail(409, 'This match has already started.', 'already_started');
      this._bothConnected(room); this._rack(room); return { ok: true };
    }
    if (input.action === 'rematch') {
      if (room.game?.phase !== 'finished') fail(409, 'Finish this rack before requesting another.', 'wrong_phase');
      this._bothConnected(room); room.rematchVotes.add(seat.index);
      if (room.rematchVotes.size === 2) this._rack(room);
      return { ok: true };
    }
    if (input.action === 'claim') {
      if (!room.game || room.game.phase === 'finished') fail(409, 'There is no unfinished rack to claim.', 'wrong_phase');
      const other = room.seats[1 - seat.index];
      if (other.connected || !other.occupied || other.disconnectedAt === null ||
        this.now() - other.disconnectedAt < this.claimAfterMs)
        fail(409, 'Your opponent has sixty seconds to reconnect before you can claim the rack.', 'claim_too_soon');
      if (room.game.phase === 'rolling') fail(409, 'Let this shot finish before claiming the rack.', 'balls_moving');
      this._forfeit(room, seat.index, `${other.name} did not reconnect. ${seat.name} wins this rack.`);
      return { ok: true };
    }
    this._currentPlayer(room, seat);
    let result;
    if (input.action === 'shoot') {
      result = this.shootGame(room.game, this._shotInput(input)); room.aim = null;
    } else {
      if (typeof input.x !== 'number' || !Number.isFinite(input.x) || typeof input.z !== 'number' || !Number.isFinite(input.z))
        fail(400, 'Choose a valid position on the table.', 'bad_position');
      result = this.placeGame(room.game, { x: input.x, z: input.z });
    }
    if (!result?.ok) fail(409, result?.error || 'The table cannot accept that action yet.', 'action_rejected');
    return { ok: true };
  }
  _aim(room, seat, input) {
    this._rate(seat, true); this._rackMatches(room, input); this._currentPlayer(room, seat);
    if (!Number.isSafeInteger(input.aimSeq) || input.aimSeq < 1) fail(400, 'A valid aim sequence is required.', 'bad_sequence');
    if (input.aimSeq <= seat.lastAimSeq) return { ok: true, ignored: true };
    room.aim = { ...this._shotInput(input), seatIndex: seat.index };
    seat.lastAimSeq = input.aimSeq; room.touchedAt = this.now();
    if (this.now() - room.lastBroadcastAt >= this.broadcastMs) this.broadcast(room);
    return { ok: true };
  }
  _forfeit(room, winner, message) {
    room.game.phase = 'finished'; room.game.winner = winner; room.game.reason = 'forfeit'; room.game.message = message;
    for (const ball of room.game.balls || []) { ball.vx = 0; ball.vz = 0; }
    room.aim = null; room.rematchVotes.clear(); this._recordResult(room);
  }
  _leave(room, seat) {
    if (room.game && room.game.phase !== 'finished') {
      const other = room.seats[1 - seat.index];
      this._forfeit(room, other.index, `${seat.name} left the table. ${other.name} wins this rack.`);
    }
    const stream = seat.stream;
    seat.stream = null; seat.connected = false; seat.occupied = false; seat.token = null;
    seat.disconnectedAt = null; room.rematchVotes.delete(seat.index);
    if (!room.game && room.hostIndex === seat.index)
      room.hostIndex = room.seats.find(candidate => candidate.occupied)?.index ?? 0;
    try { stream?.close?.(); } catch {}
  }
  _recordResult(room) {
    if (!room.game || room.game.phase !== 'finished' || room.scoredRack === room.rackId) return;
    room.scoredRack = room.rackId;
    if (Number.isInteger(room.game.winner) && room.game.winner >= 0 && room.game.winner <= 1)
      room.seats[room.game.winner].score++;
  }
  broadcast(room) {
    if (room.closed) return;
    room.revision++; room.lastBroadcastAt = this.now();
    const packet = { snapshot: this.snapshot(room) };
    for (const seat of room.seats) if (seat.stream) {
      const stream = seat.stream;
      try { stream(packet); }
      catch {
        if (seat.stream === stream) {
          seat.stream = null; seat.connected = false; seat.disconnectedAt = this.now();
          room.rematchVotes.delete(seat.index);
        }
        try { stream.close?.(); } catch {}
      }
    }
  }
  tick(dt) {
    if (this.closed) return;
    const now = this.now(), elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .25)) : 0;
    for (const room of this.rooms.values()) {
      if (room.seats.some(seat => seat.connected)) room.lastConnectedAt = now;
      // A disconnected browser never cancels an accepted shot. No new shots start
      // until both players are back, and there is deliberately no turn clock.
      if (room.game?.phase === 'rolling') this.stepGame(room.game, elapsed);
      this._recordResult(room);
      const interval = room.game?.phase === 'rolling' ? this.broadcastMs : 500;
      if (now - room.lastBroadcastAt >= interval) this.broadcast(room);
    }
    this.prune();
  }
  prune() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      const orphaned = !room.seats.some(seat => seat.connected) && now - room.lastConnectedAt > this.orphanMs;
      const idleLobby = !room.game && now - room.touchedAt > this.idleMs;
      if (orphaned || idleLobby || now - room.createdAt > this.maxAgeMs)
        this.closeRoom(room, 'This room expired. Create a new table.');
    }
  }
  closeRoom(room, reason = 'This room has ended.') {
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
    for (const room of this.rooms.values()) this.closeRoom(room, 'The table server is restarting. Create a new room shortly.');
  }
}
