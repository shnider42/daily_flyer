import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createCoopGame, addCoopPlayer, removeCoopPlayer, setCoopHost, setCoopConnected,
  stepCoopGame, coopAction, projectCoopGame, serializeCoopGame } from '../public/coop-game.mjs';
import { PROTOCOL, SIMULATION_HZ, SNAPSHOT_HZ, MAX_PLAYERS, INPUT_TIMEOUT_MS,
  DISCONNECT_GRACE_MS, HOST_PROMOTION_MS, EMPTY_INPUT, cleanInput, normalizeRoomCode, validRoomCode } from '../public/coop-protocol.mjs';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = () => [...randomBytes(6)].map(value => alphabet[value % alphabet.length]).join('');
const tokenHash = value => createHash('sha256').update(value).digest();
const validToken = (value, hash) => typeof value === 'string' && value.length <= 100 && timingSafeEqual(tokenHash(value), hash);
const playerName = value => String(value || 'Driver').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Driver';
const resultOK = result => result !== false && result?.ok !== false;

/** One room owns one simulation. Transport membership never supplies gameplay state. */
export class RoomManager {
  constructor({ now = () => Date.now(), maxRooms = 24, idleMs = 15 * 60000,
    emptyMs = 2 * 60000, graceMs = DISCONNECT_GRACE_MS, hostPromotionMs = HOST_PROMOTION_MS } = {}) {
    this.now = now; this.maxRooms = maxRooms; this.idleMs = idleMs; this.emptyMs = emptyMs;
    this.graceMs = graceMs; this.hostPromotionMs = hostPromotionMs; this.rooms = new Map();
    this.metrics = { ticks: 0, snapshots: 0, snapshotBytes: 0, skippedSnapshots: 0 }; this.closed = false;
  }
  publicRoom(room) {
    return { code: room.code, hostId: room.hostId, maxPlayers: MAX_PLAYERS,
      players: [...room.players.values()].map(player => ({ id: player.id, name: player.name, connected: !!player.peer })),
      expiresInMs: this.graceMs, persistence: 'session', checkpointHostOnly: true };
  }
  reject(peer, reason, code = 'ACTION_REJECTED', fatal = false) {
    peer.send({ type: 'error', reason, code, fatal });
    if (fatal) peer.close?.(code === 'PROTOCOL' ? 4009 : 4003, reason.slice(0, 110)); return false;
  }
  makePlayer(name) {
    const token = randomBytes(32).toString('base64url');
    return { token, player: { id: `p_${randomBytes(12).toString('hex')}`, name: playerName(name), tokenHash: tokenHash(token),
      peer: null, disconnectedAt: null, input: { ...EMPTY_INPUT }, lastInput: -Infinity,
      receivedSeq: 0, appliedSeq: 0, firePending: false, commands: new Map() } };
  }
  fields(room, player) {
    return { protocol: PROTOCOL, tick: room.tick, serverTime: this.now(), ack: player.appliedSeq,
      selfId: player.id, room: this.publicRoom(room), state: projectCoopGame(room.world, player.id) };
  }
  attach(room, player, peer, token) {
    const oldPeer = player.peer;
    if (oldPeer && oldPeer !== peer) {
      oldPeer.roomCode = null; oldPeer.playerId = null; oldPeer.close?.(4001, 'This driver reconnected in another tab.');
    }
    player.peer = peer; player.disconnectedAt = null; player.input = { ...EMPTY_INPUT };
    player.lastInput = -Infinity; player.receivedSeq = 0; player.appliedSeq = 0; player.firePending = false;
    peer.roomCode = room.code; peer.playerId = player.id; room.emptySince = null; room.lastActivity = this.now();
    setCoopConnected(room.world, player.id, true);
    peer.send({ type: 'joined', session: { code: room.code, playerId: player.id, token }, ...this.fields(room, player) });
    this.snapshot(room); return true;
  }
  create(peer, message) {
    if (this.rooms.size >= this.maxRooms) return this.reject(peer, 'The city service is busy. Try again in a moment.', 'CAPACITY');
    let code;
    for (let attempt = 0; attempt < 12; attempt++) { code = roomCode(); if (!this.rooms.has(code)) break; code = null; }
    if (!code) return this.reject(peer, 'Could not allocate a crew code. Try again.', 'CAPACITY');
    const { player, token } = this.makePlayer(message.name); let world;
    try { world = createCoopGame({ hostId: player.id, name: player.name, ...(message.save ? { save: message.save } : {}) }); }
    catch (error) { return this.reject(peer, error?.message || 'That crew checkpoint could not be restored.', 'INVALID_SAVE'); }
    const room = { code, hostId: player.id, world, players: new Map([[player.id, player]]), tick: 0,
      broadcastTick: 0, createdAt: this.now(), lastActivity: this.now(), emptySince: null };
    this.rooms.set(code, room); return this.attach(room, player, peer, token);
  }
  join(peer, message, resume = false) {
    const code = normalizeRoomCode(message.code), room = this.rooms.get(code);
    if (!validRoomCode(code) || !room) return this.reject(peer, 'That crew is no longer available. Check the code or create a crew.', 'ROOM_NOT_FOUND', resume);
    this.expireReservations(room);
    if (resume) {
      const player = room.players.get(message.playerId);
      if (!player || !validToken(message.token, player.tokenHash)) return this.reject(peer, 'Your reserved driver has expired. Join again with the crew code.', 'SESSION_EXPIRED', true);
      return this.attach(room, player, peer, message.token);
    }
    if (room.players.size >= MAX_PLAYERS) return this.reject(peer, 'This crew has four drivers. A disconnected driver keeps their place for one minute.', 'ROOM_FULL');
    const { player, token } = this.makePlayer(message.name);
    try { const added = addCoopPlayer(room.world, { id: player.id, name: player.name });
      if (!resultOK(added)) return this.reject(peer, added?.error || 'The crew could not add another driver.', 'ROOM_FULL');
    } catch { return this.reject(peer, 'The crew could not add another driver.', 'JOIN_FAILED'); }
    room.players.set(player.id, player); return this.attach(room, player, peer, token);
  }
  handle(peer, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
    if (message.type === 'ping') { peer.send({ type: 'pong', sentAt: Number.isFinite(message.sentAt) ? message.sentAt : 0, serverTime: this.now() }); return; }
    if (this.closed) return this.reject(peer, 'The city service is restarting. Rejoin shortly.', 'RESTARTING', true);
    if (['create', 'join', 'resume'].includes(message.type)) {
      if (peer.roomCode) return this.reject(peer, 'Leave your current crew before joining another.');
      if (message.protocol !== PROTOCOL) return this.reject(peer, 'Refresh the game to use the current multiplayer version.', 'PROTOCOL', true);
      return message.type === 'create' ? this.create(peer, message) : this.join(peer, message, message.type === 'resume');
    }
    const room = this.rooms.get(peer.roomCode), player = room?.players.get(peer.playerId);
    if (!room || player?.peer !== peer) return;
    if (message.type === 'leave') { this.leave(peer); return; }
    if (message.type === 'resync') { this.snapshot(room, peer); return; }
    if (message.type === 'input') {
      if (!Number.isSafeInteger(message.seq) || message.seq <= player.receivedSeq || message.seq > Number.MAX_SAFE_INTEGER - 1000) return;
      player.receivedSeq = message.seq; player.lastInput = this.now(); player.input = cleanInput(message.input);
      if (message.cancelActions === true) { player.input = { ...EMPTY_INPUT, brake: true }; player.firePending = false; }
      else player.firePending ||= player.input.fire;
      room.lastActivity = this.now(); return;
    }
    if (message.type !== 'action') return this.reject(peer, 'Unknown crew message.', 'UNKNOWN_MESSAGE');
    if (typeof message.id !== 'string' || message.id.length < 1 || message.id.length > 80) return this.reject(peer, 'This action needs a valid request identifier.', 'INVALID_ACTION');
    if (player.commands.has(message.id)) { peer.send(player.commands.get(message.id)); return; }
    const action = message.action;
    if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string') return this.reject(peer, 'Choose an available action.', 'INVALID_ACTION');
    let result;
    try {
      if (action.type === 'checkpoint') result = player.id === room.hostId ? { ok: true, save: serializeCoopGame(room.world) } : { ok: false, error: 'Only the crew host can save the shared checkpoint.' };
      else result = coopAction(room.world, player.id, action);
    } catch { result = { ok: false, error: 'That action could not be completed. Try again after the city updates.' }; }
    const packet = { type: 'result', id: message.id, ok: resultOK(result), reason: result?.error || result?.reason || '', ...(result?.save ? { save: result.save } : {}) };
    player.commands.set(message.id, packet);
    if (packet.save) for (const [id, cached] of player.commands) if (id !== message.id && cached.save) player.commands.delete(id);
    while (player.commands.size > 64) player.commands.delete(player.commands.keys().next().value);
    room.lastActivity = this.now(); peer.send(packet); this.snapshot(room); return packet.ok;
  }
  snapshot(room, only = null) {
    for (const player of room.players.values()) {
      const peer = player.peer; if (!peer || only && peer !== only) continue;
      // Skip obsolete updates before projection so congestion never multiplies work.
      if (peer.bufferedAmount > 0) { this.metrics.skippedSnapshots++; continue; }
      const bytes = peer.send({ type: 'snapshot', ...this.fields(room, player) });
      if (bytes !== false) { this.metrics.snapshots++; this.metrics.snapshotBytes += typeof bytes === 'number' ? bytes : 0; }
    }
  }
  promote(room, immediately = false) {
    const previous = room.players.get(room.hostId); if (previous?.peer) return false;
    if (!immediately && previous && previous.disconnectedAt !== null && this.now() - previous.disconnectedAt < this.hostPromotionMs) return false;
    const next = [...room.players.values()].find(player => player.peer); if (!next || next.id === room.hostId) return false;
    room.hostId = next.id; setCoopHost(room.world, next.id); return true;
  }
  expireReservations(room) {
    let changed = false;
    for (const player of [...room.players.values()]) {
      if (player.peer || player.disconnectedAt === null || this.now() - player.disconnectedAt < this.graceMs) continue;
      removeCoopPlayer(room.world, player.id); room.players.delete(player.id); changed = true;
    }
    if (changed) this.promote(room, true); return changed;
  }
  disconnect(peer) {
    const room = this.rooms.get(peer.roomCode), player = room?.players.get(peer.playerId); if (!room || player?.peer !== peer) return;
    player.peer = null; player.disconnectedAt = this.now(); player.input = { ...EMPTY_INPUT }; player.lastInput = -Infinity; player.firePending = false;
    peer.roomCode = null; peer.playerId = null; setCoopConnected(room.world, player.id, false);
    if (![...room.players.values()].some(member => member.peer)) room.emptySince = this.now(); this.snapshot(room);
  }
  leave(peer) {
    const room = this.rooms.get(peer.roomCode), player = room?.players.get(peer.playerId); if (!room || player?.peer !== peer) return;
    peer.send({ type: 'left', reason: 'You left the crew. Your solo save is unchanged.' });
    player.peer = null; peer.roomCode = null; peer.playerId = null;
    removeCoopPlayer(room.world, player.id); room.players.delete(player.id); this.promote(room, true); peer.close?.(1000, 'Left crew');
    if (![...room.players.values()].some(member => member.peer)) {
      if (!room.players.size) { this.rooms.delete(room.code); return; } room.emptySince = this.now();
    }
    this.snapshot(room);
  }
  end(room, reason) {
    this.rooms.delete(room.code);
    for (const player of room.players.values()) if (player.peer) {
      const peer = player.peer; peer.send({ type: 'error', code: 'ROOM_ENDED', reason, fatal: true });
      peer.roomCode = null; peer.playerId = null; peer.close?.(4003, reason.slice(0, 110));
    }
  }
  step(dt = 1 / SIMULATION_HZ) {
    if (this.closed) return; this.metrics.ticks++;
    for (const room of [...this.rooms.values()]) {
      if (this.now() - room.lastActivity > this.idleMs || room.emptySince !== null && this.now() - room.emptySince > this.emptyMs) {
        this.end(room, 'This crew session expired. Create a crew or restore its checkpoint.'); continue;
      }
      const expired = this.expireReservations(room), changed = this.promote(room) || expired;
      if (![...room.players.values()].some(player => player.peer)) continue;
      const inputs = {};
      for (const player of room.players.values()) {
        inputs[player.id] = player.peer && this.now() - player.lastInput <= INPUT_TIMEOUT_MS ? { ...player.input, fire: player.input.fire || player.firePending } : { ...EMPTY_INPUT, brake: true };
        player.firePending = false;
        if (player.peer) player.appliedSeq = player.receivedSeq;
      }
      try { stepCoopGame(room.world, inputs, dt); room.tick++; }
      catch (error) { console.error('SUNCOAST room simulation failed:', error?.message); this.end(room, 'This crew stopped unexpectedly. Restore the last crew checkpoint.'); continue; }
      room.broadcastTick++;
      if (changed || room.broadcastTick % Math.round(SIMULATION_HZ / SNAPSHOT_HZ) === 0) this.snapshot(room);
    }
  }
  summary() {
    return { rooms: this.rooms.size, connected: [...this.rooms.values()].reduce((total, room) => total + [...room.players.values()].filter(player => player.peer).length, 0), ...this.metrics };
  }
  shutdown() { this.closed = true; for (const room of [...this.rooms.values()]) this.end(room, 'The city service restarted. Restore the last crew checkpoint.'); }
}
