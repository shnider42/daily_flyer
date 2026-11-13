/** Private, ephemeral two-player rooms. The server owns every baseball outcome. */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BaseballGame, PITCHERS } from './public/engine.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_INPUTS = new Set(['pitch', 'swing', 'throw', 'run', 'lead', 'steal', 'pickoff']);
const BAT_INPUTS = new Set(['swing', 'run', 'lead', 'steal']);
const MAX_REWIND = .2;
export const phaseKey = state => `${state.phase}:${state.phaseStartedAt}:${state.inning}:${state.half}:${state.nextPitchId}`;
export const commandPitchId = state => state.phase === 'ready' ? state.nextPitchId : (state.pitch?.id ?? state.nextPitchId);

export class RoomError extends Error {
  constructor(status, message, code = 'request_rejected') { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new RoomError(status, message, code); };

function tokenMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function optionsFor(input = {}) {
  return {
    seed: randomBytes(4).readUInt32LE(0) || 2003,
    mode: 'exhibition', humanSides: [0, 1], localSide: 0, inputWindow: MAX_REWIND,
    innings: [3, 6, 9].includes(+input.innings) ? +input.innings : 3,
    difficulty: ['rookie', 'club', 'pro'].includes(input.difficulty) ? input.difficulty : 'rookie',
    guidance: ['simple', 'moderate', 'expert'].includes(input.guidance) ? input.guidance : 'simple',
    pitcher: PITCHERS[input.pitcher] ? input.pitcher : 'balanced', opponentPitcher: 'balanced',
  };
}
function newPlayer(side, pitcher, now) {
  return { side, pitcher, token: randomBytes(32).toString('hex'), connected: false,
    joinedAt: now, disconnectedAt: null, lastSeen: now, ready: false, stream: null,
    lastSeq: 0, responses: new Map(), rate: { at: now, count: 0 }, rtt: null,
    challenge: null, challengeAt: 0, challengeUntil: 0, lastChallengeAt: 0, lastEventSent: 0 };
}

export class RoomHub {
  constructor({ now = () => Date.now(), maxRooms = 8, reconnectMs = 120000, idleMs = 900000 } = {}) {
    this.now = now; this.maxRooms = maxRooms; this.reconnectMs = reconnectMs; this.idleMs = idleMs;
    this.rooms = new Map(); this.closed = false;
  }
  _code() {
    let code;
    do { code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (this.rooms.has(code));
    return code;
  }
  create(input = {}) {
    if (this.closed) fail(503, 'The ballpark is restarting. Try again shortly.');
    this.prune();
    if (this.rooms.size >= this.maxRooms) fail(503, 'All online fields are in use. Try again in a moment.', 'capacity');
    const now = this.now(), options = optionsFor(input), code = this._code();
    const room = { code, generation: randomBytes(12).toString('hex'), game: new BaseballGame(options),
      players: [newPlayer(0, options.pitcher, now), null], started: false, pauseSides: new Set(),
      createdAt: now, touchedAt: now, lastBroadcastAt: 0, eventId: 0, events: [], revision: 0, closed: false };
    this.rooms.set(code, room);
    return this.credentials(room, room.players[0]);
  }
  room(code) {
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/.test(code.toUpperCase())) fail(404, 'Enter the six-character room code.', 'room_missing');
    const room = this.rooms.get(code.toUpperCase());
    if (!room || room.closed) fail(404, 'That room has closed. Create a new game.', 'room_missing');
    return room;
  }
  join(code, input = {}) {
    const room = this.room(code), now = this.now();
    if (room.started || room.players[1]) fail(409, 'That field already has two players.', 'room_full');
    const pitcher = PITCHERS[input.pitcher] ? input.pitcher : 'balanced';
    room.players[1] = newPlayer(1, pitcher, now);
    room.game.options.opponentPitcher = pitcher; room.game.state.options.opponentPitcher = pitcher;
    room.touchedAt = now; this.broadcast(room);
    return this.credentials(room, room.players[1]);
  }
  auth(code, token) {
    const room = this.room(code), player = room.players.find(p => p && tokenMatches(p.token, token));
    if (!player) fail(401, 'This seat is unavailable. Join with the room code.', 'seat_missing');
    if (player.disconnectedAt !== null && this.now() - player.disconnectedAt > this.reconnectMs) {
      this.closeRoom(room, 'The reconnect window expired. Create a new game.');
      fail(410, 'The reconnect window expired. Create a new game.', 'room_closed');
    }
    return { room, player };
  }
  credentials(room, player) {
    return { code: room.code, generation: room.generation, token: player.token, side: player.side,
      lastSeq: player.lastSeq, packet: this.packet(room, player) };
  }
  rejoin(code, token) { const { room, player } = this.auth(code, token); return this.credentials(room, player); }
  status(room) {
    if (room.closed) return 'closed';
    if (room.game.state.phase === 'final') return 'finished';
    if (!room.started) return 'waiting';
    if (room.pauseSides.size || room.players.some(p => !p?.connected)) return 'paused';
    return 'playing';
  }
  metadata(room) {
    const status = this.status(room);
    const missing = room.players.filter(p => p && !p.connected);
    const deadlines = missing.map(p => (p.disconnectedAt ?? p.joinedAt) + this.reconnectMs);
    const reason = status === 'waiting' ? (!room.players[1] ? 'Share the room code with your opponent.' : 'Both players press READY to start.')
      : status === 'paused' ? (missing.length ? 'Waiting for the other connection. The game is paused.' : 'A player called time. Resume when ready.')
        : status === 'finished' ? 'Final score.' : '';
    return { code: room.code, generation: room.generation, status, started: room.started,
      readySides: room.players.filter(p => p?.ready).map(p => p.side), pauseSides: [...room.pauseSides],
      players: room.players.map((p, side) => p ? { side, pitcher: p.pitcher, connected: p.connected, ready: p.ready } : { side, connected: false, ready: false, pitcher: null }),
      disconnectDeadline: room.started && deadlines.length ? Math.min(...deadlines) : null,
      reason, options: { innings: room.game.options.innings, difficulty: room.game.options.difficulty, guidance: room.game.options.guidance } };
  }
  packet(room, player) {
    return { type: 'state', sentAt: this.now(), revision: room.revision, ack: player?.lastSeq ?? 0,
      room: this.metadata(room), snapshot: room.game.snapshot(), events: room.events.filter(event => event.eventId > (player?.lastEventSent || 0)),
      eventCursor: room.eventId, latencyMs: player?.rtt === null ? null : Math.round(player?.rtt || 0) };
  }
  _events(room) {
    for (const event of room.game.drainEvents()) room.events.push({ ...event, eventId: ++room.eventId });
    if (room.events.length > 96) room.events.splice(0, room.events.length - 96);
  }
  broadcast(room) {
    if (room.closed) return;
    this._events(room); room.revision++; room.lastBroadcastAt = this.now();
    for (const player of room.players) if (player?.stream) {
      try { player.stream(this.packet(room, player)); player.lastEventSent = room.eventId; } catch { this.disconnect(room, player, player.stream); }
    }
  }
  connect(code, token, stream) {
    const { room, player } = this.auth(code, token);
    if (player.stream && player.stream !== stream) {
      const previous = player.stream; player.stream = null;
      try { previous({ type: 'replaced', reason: 'This seat opened in another tab.' }); previous.close?.(); } catch {}
    }
    player.stream = stream; player.connected = true; player.disconnectedAt = null; player.lastSeen = this.now();
    player.lastChallengeAt = 0; room.touchedAt = this.now(); this.broadcast(room);
    this._challenge(room, player);
    return () => this.disconnect(room, player, stream);
  }
  disconnect(room, player, stream) {
    if (room.closed || player.stream !== stream) return;
    player.stream = null; player.connected = false; player.ready = false;
    player.disconnectedAt = this.now(); this.broadcast(room);
  }
  _challenge(room, player) {
    if (!player.stream || player.challenge && this.now() < player.challengeUntil) return;
    const now = this.now(); player.challenge = randomBytes(8).toString('hex'); player.challengeAt = now;
    player.challengeUntil = now + 4000; player.lastChallengeAt = now;
    try { player.stream({ type: 'ping', challenge: player.challenge, serverTime: now }); } catch { this.disconnect(room, player, player.stream); }
  }
  pong(code, token, challenge) {
    const { room, player } = this.auth(code, token), now = this.now();
    if (typeof challenge !== 'string' || challenge !== player.challenge || now > player.challengeUntil) fail(409, 'That connection check expired.', 'ping_expired');
    const sample = Math.max(0, now - player.challengeAt);
    player.rtt = player.rtt === null ? sample : Math.min(player.rtt * .85 + sample * .15, sample + 25);
    player.lastSeen = now; player.challenge = null; return { ok: true, serverTime: now, latencyMs: Math.round(player.rtt) };
  }
  _rate(player) {
    const now = this.now();
    if (now - player.rate.at >= 1000) player.rate = { at: now, count: 0 };
    if (++player.rate.count > 40) fail(429, 'Too many inputs. Give the play a moment.', 'rate_limited');
  }
  input(code, token, envelope = {}) {
    const { room, player } = this.auth(code, token);
    if (envelope.generation !== room.generation) fail(409, 'That input belongs to an earlier game.', 'wrong_game');
    const sequence = envelope.seq;
    if (!Number.isSafeInteger(sequence) || sequence < 1) fail(400, 'An input sequence is required.', 'bad_sequence');
    if (sequence <= player.lastSeq) {
      const response = player.responses.get(sequence);
      if (response) return { ...response, duplicate: true };
      fail(409, 'That input is too old.', 'stale_sequence');
    }
    if (sequence !== player.lastSeq + 1) fail(409, 'Inputs arrived out of order. Reconnect to recover.', 'sequence_gap');
    this._rate(player);
    const input = envelope.command;
    if (!input || typeof input.type !== 'string') fail(400, 'A baseball input is required.', 'bad_input');
    let result;
    try { result = this._apply(room, player, input, envelope); }
    catch (error) {
      if (!(error instanceof RoomError)) throw error;
      result = { ok: false, error: error.message, code: error.code };
    }
    player.lastSeq = sequence; player.lastSeen = this.now(); room.touchedAt = this.now();
    result = { ...result, seq: sequence, serverTime: this.now() };
    player.responses.set(sequence, result);
    if (player.responses.size > 96) player.responses.delete(player.responses.keys().next().value);
    this.broadcast(room); return result;
  }
  _apply(room, player, input, envelope) {
    if (!player.connected && input.type !== 'leave') fail(409, 'Reconnect before playing.', 'not_connected');
    const game = room.game, s = game.state;
    if (input.type === 'leave') {
      this.closeRoom(room, 'A player left the field. Create a new game.'); return { ok: true };
    }
    if (input.type === 'pause') { room.pauseSides.add(player.side); return { ok: true }; }
    if (input.type === 'resume') { room.pauseSides.delete(player.side); return { ok: true }; }
    if (input.type === 'ready') {
      if (room.started) fail(409, 'This game has already started.', 'already_started');
      player.ready = true;
      if (room.players.every(p => p?.connected && p.ready)) {
        room.started = true; room.players.forEach(p => { p.ready = false; });
      }
      return { ok: true };
    }
    if (this.status(room) !== 'playing') fail(409, 'Wait until both players are on the field and the game is resumed.', 'game_paused');
    if (input.type === 'next') {
      if (!['result', 'half'].includes(s.phase)) fail(409, 'There is no completed play to advance.', 'wrong_phase');
      if (envelope.phaseKey !== phaseKey(s)) fail(409, 'That ready signal belongs to the previous play.', 'stale_phase');
      player.ready = true;
      if (room.players.every(p => p.connected && p.ready)) {
        if (!game.command({ type: 'next', side: player.side })) fail(409, game.lastRejection || 'The play cannot advance.');
        room.players.forEach(p => { p.ready = false; });
      }
      return { ok: true };
    }
    if (!GAME_INPUTS.has(input.type)) fail(400, 'Unknown baseball input.', 'bad_input');
    if (BAT_INPUTS.has(input.type) ? player.side !== s.battingSide : player.side === s.battingSide) fail(403, 'That action belongs to your opponent.', 'wrong_side');
    if (!Number.isInteger(input.pitchId) || input.pitchId !== commandPitchId(s)) fail(409, 'That input belongs to a different pitch.', 'stale_pitch');
    const clean = { type: input.type, side: player.side, pitchId: input.pitchId };
    if (input.type === 'pitch') {
      if (typeof input.pitchType !== 'string' || !Number.isFinite(input.quality)) fail(400, 'Choose a pitch and release the meter.', 'bad_pitch');
      clean.pitchType = input.pitchType; clean.quality = clamp(input.quality, 0, 1); clean.aim = this._aim(input.aim);
    }
    if (input.type === 'swing') {
      if (!Number.isFinite(input.time)) fail(400, 'A swing timestamp is required.', 'bad_time');
      const allowance = Math.min(MAX_REWIND, (player.rtt === null ? .07 : player.rtt / 2000) + .08);
      if (input.time < s.time - allowance - 1e-8 || input.time > s.time + .025) fail(409, 'The swing arrived outside the connection timing window.', 'late_input');
      clean.time = input.time; clean.aim = this._aim(input.aim); clean.power = !!input.power;
    }
    if (input.type === 'throw' || input.type === 'pickoff') {
      if (!Number.isInteger(input.base) || input.base < 1 || input.base > (input.type === 'pickoff' ? 3 : 4)) fail(400, 'Choose a valid base.', 'bad_base');
      clean.base = input.base;
    }
    if (['run', 'lead', 'steal'].includes(input.type)) {
      if (!Number.isSafeInteger(input.runnerId) || input.runnerId < 1) fail(400, 'Choose a runner.', 'bad_runner');
      clean.runnerId = input.runnerId;
      if (input.action !== undefined) {
        if (!['advance', 'hold', 'retreat', 'extend', 'shorten', 'cancel'].includes(input.action)) fail(400, 'Choose a runner action.', 'bad_input');
        clean.action = input.action;
      }
      if (input.base !== undefined) {
        if (!Number.isInteger(input.base) || input.base < 1 || input.base > 4) fail(400, 'Choose a valid destination.', 'bad_base');
        clean.base = input.base;
      }
      if (input.amount !== undefined) {
        if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 2) fail(400, 'Choose a lead between zero and two.', 'bad_lead');
        clean.amount = input.amount;
      }
    }
    const accepted = game.command(clean);
    return accepted ? { ok: true } : { ok: false, error: game.lastRejection || 'That action is unavailable now.', code: 'baseball_rejected' };
  }
  _aim(aim) {
    if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) fail(400, 'Aim values must be finite.', 'bad_aim');
    return { x: clamp(aim.x, -1, 1), y: clamp(aim.y, -1, 1) };
  }
  tick(dt) {
    const now = this.now();
    for (const room of this.rooms.values()) {
      for (const player of room.players) if (player?.connected) {
        if (player.challenge && now > player.challengeUntil) {
          const stream = player.stream; this.disconnect(room, player, stream); try { stream?.close?.(); } catch {}
        } else if (now - player.lastChallengeAt >= 1500) this._challenge(room, player);
      }
      const status = this.status(room);
      if (status === 'playing') room.game.update(Math.max(0, Math.min(dt, .25)));
      if (now - room.lastBroadcastAt >= (status === 'playing' ? 50 : 1000)) this.broadcast(room);
    }
    this.prune();
  }
  prune() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      const expiredSeat = room.players.some(p => p && p.disconnectedAt !== null && now - p.disconnectedAt > this.reconnectMs);
      const orphanedLobby = !room.started && now - room.touchedAt > this.idleMs;
      const neverConnected = !room.started && room.players.every(p => !p?.connected) && now - room.touchedAt > this.reconnectMs;
      const excessiveDuration = now - room.createdAt > 4 * 3600000;
      if (expiredSeat || orphanedLobby || neverConnected || excessiveDuration) this.closeRoom(room, 'This field has closed. Create a new game.');
    }
  }
  closeRoom(room, reason) {
    if (room.closed) return;
    room.closed = true;
    for (const player of room.players) if (player?.stream) {
      const stream = player.stream; player.stream = null; player.connected = false;
      try { stream({ type: 'closed', reason }); stream.close?.(); } catch {}
    }
    this.rooms.delete(room.code);
  }
  close() { this.closed = true; for (const room of this.rooms.values()) this.closeRoom(room, 'The ballpark is restarting. Create a new room shortly.'); }
}
