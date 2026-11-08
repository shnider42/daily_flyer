/**
 * Reusable authoritative turn-based rooms for DailyFlyer.
 *
 * Carries forward DFE's room-code / per-seat reconnect-token model, but turns are
 * revision-checked transactions rather than a real-time input stream. Rules are
 * supplied by a pure adapter; no vineyard or football mechanics live here.
 */
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual,
} from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import {deflateRawSync, inflateRawSync} from 'node:zlib';

export class RoomError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message); this.status = status; this.code = code;
  }
}
const fail = (message, status, code) => { throw new RoomError(message, status, code); };
const hashToken = token => createHash('sha256').update(token).digest('hex');
const equalHash = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const clone = value => structuredClone(value);
const VERSION = 1;
const ROOM_TTL = 14 * 86400000;
const MAX_BACKUP_BYTES = 900000;
const CODE_RE = /^[A-F0-9]{8}$/;
const REQUEST_RE = /^[A-Za-z0-9_-]{8,100}$/;
const BOT_NAMES = ['Casa Luna', 'Poggio Rosso', 'Villa Oliva', 'Colle d’Oro', 'La Quercia'];

export function validateName(value) {
  if (typeof value !== 'string') fail('Please enter a name for your estate.');
  const name = value.trim();
  if (!name || name.length > 32 || /[\u0000-\u001f\u007f]/u.test(name)) {
    fail('Use an estate name between 1 and 32 characters.');
  }
  return name;
}
export function normalizeCode(code) {
  if (typeof code !== 'string') fail('Enter the eight-character room code.');
  const result = code.trim().toUpperCase();
  if (!CODE_RE.test(result)) fail('Enter the eight-character room code.');
  return result;
}
function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

/** AES-GCM protects hidden hands and verifies that recovery data is server-made. */
export class RecoveryCodec {
  constructor(secret) {
    if (typeof secret !== 'string' || secret.length < 24) {
      throw new Error('The recovery secret must contain at least 24 characters.');
    }
    this.key = createHash('sha256').update(`DFE-tabletop-recovery-v${VERSION}:${secret}`).digest();
  }
  encode(room) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('DFE-tabletop-room-v2'));
    const body = Buffer.from(JSON.stringify({schema: VERSION, room}));
    if (body.length > MAX_BACKUP_BYTES) throw new Error('Room snapshot exceeds the recovery limit.');
    const encrypted = Buffer.concat([cipher.update(deflateRawSync(body)), cipher.final()]);
    return ['vt2', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }
  decode(token) {
    if (typeof token !== 'string' || token.length > 1250000) {
      fail('That recovery file is too large or is not a valid game backup.', 400, 'INVALID_RECOVERY');
    }
    try {
      const parts = token.split('.');
      if (parts.length !== 4 || !['vt1','vt2'].includes(parts[0])) throw new Error();
      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const encrypted = Buffer.from(parts[3], 'base64url');
      if (iv.length !== 12 || tag.length !== 16 || encrypted.length > MAX_BACKUP_BYTES) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(`DFE-tabletop-room-v${parts[0] === 'vt2' ? 2 : 1}`));
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const body = parts[0] === 'vt2' ? inflateRawSync(decrypted, {maxOutputLength:MAX_BACKUP_BYTES}) : decrypted;
      const decoded = JSON.parse(body.toString('utf8'));
      if (decoded.schema !== VERSION || !decoded.room || !CODE_RE.test(decoded.room.code)) throw new Error();
      return decoded.room;
    } catch {
      fail('This backup is damaged or belongs to a different game server.', 400, 'INVALID_RECOVERY');
    }
  }
}

/** Atomic encrypted disk snapshots. A browser recovery envelope survives lost disks. */
export class SnapshotStore {
  constructor(directory, codec) {
    this.directory = directory; this.codec = codec;
    mkdirSync(directory, {recursive: true, mode: 0o700});
  }
  load() {
    const rooms = [];
    for (const name of readdirSync(this.directory)) {
      if (!/^[A-F0-9]{8}\.room$/.test(name)) continue;
      try { rooms.push(this.codec.decode(readFileSync(join(this.directory, name), 'utf8'))); }
      catch { /* A damaged snapshot never prevents the other rooms from starting. */ }
    }
    return rooms;
  }
  save(room) {
    const dest = join(this.directory, `${room.code}.room`);
    const temp = `${dest}.${randomBytes(6).toString('hex')}.tmp`;
    writeFileSync(temp, this.codec.encode(room), {mode: 0o600});
    renameSync(temp, dest);
  }
  remove(code) {
    const dest = join(this.directory, `${code}.room`);
    if (existsSync(dest)) unlinkSync(dest);
  }
}

/** Resolve a stable local secret for development; Render should provide ROOM_SECRET. */
export function localRecoverySecret(directory) {
  mkdirSync(directory, {recursive: true, mode: 0o700});
  const secretPath = join(directory, 'recovery.key');
  if (existsSync(secretPath)) return readFileSync(secretPath, 'utf8').trim();
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(secretPath, secret, {mode: 0o600, flag: 'wx'});
  return secret;
}

export class TabletopRooms {
  constructor({engine, secret, store = null, now = () => Date.now(), maxRooms = 128, botLimit = 1200}) {
    for (const method of ['createGame', 'applyAction', 'publicView', 'chooseBotAction']) {
      if (typeof engine?.[method] !== 'function') throw new Error(`Missing engine adapter: ${method}`);
    }
    this.engine = engine;
    this.codec = new RecoveryCodec(secret);
    this.store = store;
    this.now = now;
    this.maxRooms = maxRooms;
    this.botLimit = botLimit;
    this.rooms = new Map();
    this.recoveries = new Map();
    this.shuttingDown = false;
    for (const room of store?.load() || []) {
      if (this.validSnapshot(room) && now() - room.updatedAt < ROOM_TTL && this.rooms.size < maxRooms) {
        this.rooms.set(room.code, room);
      }
    }
  }
  validSnapshot(room) {
    return room && CODE_RE.test(room.code) && Number.isSafeInteger(room.version) && room.version > 0 &&
      Array.isArray(room.players) && room.players.length >= 1 && room.players.length <= 6 &&
      room.players.some(p => p.id === room.hostId && !p.bot) &&
      room.players.every(p => typeof p.id === 'string' && typeof p.name === 'string' &&
        (p.bot || /^[a-f0-9]{64}$/.test(p.tokenHash))) &&
      ['lobby', 'playing', 'finished'].includes(room.status) &&
      (room.status === 'lobby' || room.game && Array.isArray(room.game.players)) &&
      [12, 20].includes(room.target) && Number.isFinite(room.updatedAt);
  }
  writable() {
    if (this.shuttingDown) fail('The game server is restarting. Your saved seat will reconnect shortly.', 503, 'RESTARTING');
  }
  cleanup() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (now - room.updatedAt > ROOM_TTL) {
        this.rooms.delete(code); this.recoveries.delete(code); this.store?.remove(code);
      }
    }
  }
  find(code) {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) fail('This room is not on the server. Restore the saved game on this device, or ask the host for a new code.', 404, 'ROOM_MISSING');
    return room;
  }
  authenticate(room, token, touch = true) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 128) {
      fail('Your saved seat key is missing. Rejoin using the device that created your seat.', 401, 'UNAUTHORIZED');
    }
    const digest = hashToken(token);
    const player = room.players.find(p => !p.bot && equalHash(p.tokenHash, digest));
    if (!player) fail('That seat key does not belong to this room.', 403, 'UNAUTHORIZED');
    if (touch) player.lastSeen = this.now();
    return player;
  }
  requireHost(room, player) {
    if (room.hostId !== player.id) fail('Only the host can do that.', 403, 'HOST_REQUIRED');
  }
  commit(room) {
    room.updatedAt = this.now();
    // Persist before publishing so an I/O failure cannot acknowledge a lost turn.
    this.store?.save(room);
    this.rooms.set(room.code, room);
    this.recoveries.delete(room.code);
  }
  snapshot(room, player) {
    let recovery = this.recoveries.get(room.code);
    if (!recovery) { recovery = this.codec.encode(room); this.recoveries.set(room.code, recovery); }
    const game = room.game ? clone(this.engine.publicView(room.game, player.id)) : null;
    if (game) game.version = room.version; // One monotonic revision includes lobbies/rematches.
    return {
      room: {
        code: room.code, status: room.status, hostId: room.hostId, youId: player.id,
        version: room.version, target: room.target, mode: room.mode,
        players: room.players.map(p => ({id: p.id, name: p.name, bot: !!p.bot,
          connected: !!p.bot || this.now() - (p.lastSeen || 0) < 25000})),
      },
      game,
      recovery,
    };
  }
  newHuman(name, id) {
    const token = randomBytes(32).toString('base64url');
    return {token, player: {id, name, bot: false, tokenHash: hashToken(token), lastSeen: this.now()}};
  }
  withBots(players, count) {
    return [...players, ...Array.from({length: count}, (_, i) => ({
      id: `b${i + 1}`, name: BOT_NAMES[i], bot: true, lastSeen: this.now(),
    }))];
  }
  runBots(room) {
    let steps = 0;
    while (room.game && room.game.status !== 'finished' && room.game.status !== 'over') {
      const current = room.game.players.find(p => p.id === room.game.activePlayerId);
      if (!current?.bot) break;
      if (++steps > this.botLimit) throw new Error('Computer turns exceeded the safe turn limit.');
      const choice = this.engine.chooseBotAction(room.game, current.id);
      const key = typeof choice === 'string' ? choice : choice?.key;
      if (typeof key !== 'string') throw new Error('The computer has no legal move.');
      room.game = this.engine.applyAction(room.game, current.id, key);
    }
    if (room.game && ['finished', 'over'].includes(room.game.status)) room.status = 'finished';
  }
  create(input = {}) {
    this.writable(); this.cleanup();
    if (this.rooms.size >= this.maxRooms) fail('All tables are in use. Please try again later.', 503, 'ROOM_LIMIT');
    const name = validateName(input.name);
    const mode = input.mode ?? 'solo';
    if (!['solo', 'online'].includes(mode)) fail('Choose solo or online play.');
    const target = input.target ?? 20;
    if (![12, 20].includes(target)) fail('Choose a 12-point short game or a 20-point full game.');
    const botCount = integer(input.bots ?? 1, mode === 'solo' ? 1 : 0, 5, 'Computer opponents');
    let code;
    do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const {token, player} = this.newHuman(name, 'p1');
    const room = {schema: VERSION, code, mode, target, hostId: player.id, version: 1,
      status: 'lobby', createdAt: this.now(), updatedAt: this.now(), players: [player],
      game: null, accepted: [], match: 0};
    if (mode === 'solo') this.initializeGame(room, botCount);
    this.commit(room);
    return {...this.snapshot(room, player), token};
  }
  initializeGame(room, botCount) {
    const humans = room.players.filter(p => !p.bot);
    if (humans.length + botCount < 2 || humans.length + botCount > 6) {
      fail('A table needs between two and six estates, including computers.');
    }
    room.players = this.withBots(humans, botCount);
    room.match = (room.match || 0) + 1;
    room.game = this.engine.createGame({
      players: room.players.map(({id, name, bot}) => ({id, name, bot})),
      target: room.target, seed: randomBytes(4).readUInt32LE(),
    });
    room.status = 'playing';
    this.runBots(room);
  }
  join(code, input = {}) {
    this.writable();
    const original = this.find(code);
    if (original.status !== 'lobby') fail('This game has already started. Reconnect with your saved seat on the original device.', 409, 'GAME_STARTED');
    if (original.players.length >= 6) fail('This table already has six estates.', 409, 'ROOM_FULL');
    const name = validateName(input.name);
    const room = clone(original);
    const {token, player} = this.newHuman(name, `p${room.players.length + 1}`);
    room.players.push(player); room.version++;
    this.commit(room);
    return {...this.snapshot(room, player), token};
  }
  get(code, token) {
    const room = this.find(code);
    const player = this.authenticate(room, token);
    return this.snapshot(room, player);
  }
  start(code, token, input = {}) {
    this.writable();
    const original = this.find(code);
    const actor = this.authenticate(original, token);
    this.requireHost(original, actor);
    // A retry after a lost response returns the already-started table.
    if (original.status !== 'lobby') return this.snapshot(original, actor);
    const bots = integer(input.bots ?? 0, 0, 5, 'Computer opponents');
    const room = clone(original);
    this.initializeGame(room, bots); room.version++;
    this.commit(room);
    return this.snapshot(room, room.players.find(p => p.id === actor.id));
  }
  action(code, token, input = {}) {
    this.writable();
    const original = this.find(code);
    const actor = this.authenticate(original, token);
    if (typeof input.requestId !== 'string' || !REQUEST_RE.test(input.requestId)) {
      fail('This turn needs a request ID. Refresh the page and try again.');
    }
    if (typeof input.key !== 'string' || !input.key || input.key.length > 4000) fail('Choose one of the available actions.');
    const fingerprint = createHash('sha256').update(JSON.stringify([input.key, input.version])).digest('hex');
    const old = original.accepted.find(x => x.playerId === actor.id && x.id === input.requestId);
    if (old) {
      if (old.fingerprint !== fingerprint) fail('That request ID was already used for a different turn.', 409, 'REQUEST_REUSED');
      return {...this.snapshot(original, actor), duplicate: true};
    }
    if (!Number.isSafeInteger(input.version) || input.version !== original.version) {
      fail('The table changed before that move arrived. Review the latest board and choose again.', 409, 'STALE_VERSION');
    }
    if (original.status !== 'playing') fail('The game is not accepting moves right now.', 409, 'NOT_PLAYING');
    if (original.game.activePlayerId !== actor.id) fail('It is another estate’s turn.', 409, 'NOT_YOUR_TURN');
    const room = clone(original);
    try { room.game = this.engine.applyAction(room.game, actor.id, input.key); }
    catch (error) { fail(error.message || 'That action is no longer available.', 400, 'ILLEGAL_ACTION'); }
    this.runBots(room);
    room.version++;
    room.accepted.push({playerId: actor.id, id: input.requestId, fingerprint});
    // Preserve deduplication across rematches. Revision checks protect older IDs.
    room.accepted = room.accepted.slice(-2048);
    this.commit(room);
    return this.snapshot(room, room.players.find(p => p.id === actor.id));
  }
  rematch(code, token) {
    this.writable();
    const original = this.find(code);
    const actor = this.authenticate(original, token);
    this.requireHost(original, actor);
    if (original.status !== 'finished') fail('Finish this game before starting a rematch.', 409, 'GAME_NOT_FINISHED');
    const room = clone(original);
    this.initializeGame(room, room.players.filter(p => p.bot).length);
    room.version++;
    this.commit(room);
    return this.snapshot(room, room.players.find(p => p.id === actor.id));
  }
  restore(token, recovery) {
    this.writable();
    const saved = this.codec.decode(recovery);
    if (!this.validSnapshot(saved)) fail('This backup uses an unsupported game format.', 400, 'INVALID_RECOVERY');
    this.authenticate(saved, token, false);
    const existing = this.rooms.get(saved.code);
    if (existing) {
      const player = this.authenticate(existing, token);
      return {...this.snapshot(existing, player), restored: false};
    }
    this.cleanup();
    if (this.rooms.size >= this.maxRooms) fail('All tables are in use. Keep your backup and try again later.', 503, 'ROOM_LIMIT');
    if (this.now() - saved.updatedAt > ROOM_TTL) fail('This saved table is more than 14 days old. Please start a new game.', 410, 'RECOVERY_EXPIRED');
    const room = clone(saved);
    const player = this.authenticate(room, token);
    this.runBots(room);
    this.commit(room);
    return {...this.snapshot(room, player), restored: true};
  }
  shutdown() {
    this.shuttingDown = true;
    for (const room of this.rooms.values()) this.store?.save(room);
  }
}
