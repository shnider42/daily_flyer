/** SKYBREAK: one authoritative simulation per ten-player room. */
import http from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { WebSocket, WebSocketServer } from './vendor/ws/wrapper.mjs';
import { Match, MAX_PLAYERS, normalizeInput } from './public/engine.mjs';

const compress = promisify(gzip);
const PUBLIC_ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FIXED_STEP = 1 / 30;
const SNAPSHOT_INTERVAL_MS = 1000 / 15;
const ACTIONS = new Set(['interact', 'reload', 'heal', 'shield', 'wall', 'ramp', 'harvest', 'slot0', 'slot1', 'slot2', 'slot3']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textType = type => /^(text\/|application\/(javascript|json)|image\/svg)/.test(type);
const validSequence = value => Number.isSafeInteger(value) && value > 0 && value <= 0x7fffffff;

function cleanName(value) {
  if (typeof value !== 'string') return 'Player';
  return [...value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()].slice(0, 22).join('') || 'Player';
}
function cleanOptions(value) {
  const options = isObject(value) ? value : {};
  return { difficulty: ['casual', 'regular', 'expert'].includes(options.difficulty) ? options.difficulty : 'regular',
    buildEnabled: options.buildEnabled !== false };
}
function tokenMatches(value, expected) {
  return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value) && typeof expected === 'string' &&
    expected.length === value.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
function tokenBucket(tokens, now) { return { tokens, at: now }; }
function take(bucket, perSecond, burst, now) {
  bucket.tokens = Math.min(burst, bucket.tokens + Math.max(0, now - bucket.at) * perSecond / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}

/** Calling this creates an unbound server. Tests and callers decide where to listen. */
export function createGameServer({ now = Date.now, publicRoot = PUBLIC_ROOT,
  maxRooms = 32, maxConnections = 384, reconnectMs = 120000, idleMs = 20 * 60000,
  quickStartMs = 12000, inputExpiryMs = 400, heartbeatMs = 15000,
  automaticTicks = true, matchFactory = options => new Match(options) } = {}) {
  const root = path.resolve(publicRoot);
  const rooms = new Map(), connections = new Set(), upgrades = new Map(), assetCache = new Map();
  let shuttingDown = false, closePromise = null, lastSweep = now();

  function json(res, status, value, head = false) {
    const body = JSON.stringify(value);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(head ? undefined : body);
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    let pathname;
    try {
      // Inspect the raw path before URL normalization can erase traversal segments.
      pathname = decodeURIComponent(String(req.url || '/').split('?')[0]);
      if (!pathname.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(pathname) ||
          pathname.split('/').some(segment => segment === '..' || segment.startsWith('.'))) throw new Error();
    } catch { json(res, 404, { error: 'File not found.' }); return; }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD'); json(res, 405, { error: 'Use GET or HEAD.' }); return;
    }
    if (pathname === '/health') {
      json(res, shuttingDown ? 503 : 200, { ok: !shuttingDown, service: 'skybreak', version: '1.0.0',
        rooms: rooms.size, connectedPlayers: [...connections].filter(c => c.seat).length,
        maxPlayers: MAX_PLAYERS, persistence: 'memory' }, req.method === 'HEAD');
      return;
    }
    if (shuttingDown) { json(res, 503, { error: 'The island is restarting. Try again shortly.' }); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = path.resolve(root, relative), type = MIME[path.extname(target).toLowerCase()];
    if (!type || !target.startsWith(root + path.sep)) { json(res, 404, { error: 'File not found.' }); return; }
    try {
      const resolved = await realpath(target);
      if (!resolved.startsWith(root + path.sep)) throw new Error('File outside public root');
      const info = await stat(resolved);
      if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('Not a game asset');
      let entry = assetCache.get(resolved);
      if (!entry || entry.mtime !== info.mtimeMs || entry.size !== info.size) {
        entry = { mtime: info.mtimeMs, size: info.size, bytes: await readFile(resolved), gzip: null };
        if (assetCache.size >= 128) assetCache.delete(assetCache.keys().next().value);
        assetCache.set(resolved, entry);
      }
      const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', pathname === '/' || type.startsWith('text/html') ? 'no-store'
        : relative.startsWith('vendor/') ? 'public, max-age=86400' : 'no-cache');
      res.setHeader('ETag', etag);
      res.setHeader('Vary', 'Accept-Encoding');
      if (req.headers['if-none-match'] === etag && !type.startsWith('text/html')) { res.writeHead(304); res.end(); return; }
      let bytes = entry.bytes;
      if (bytes.length >= 1024 && textType(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        entry.gzip ||= compress(entry.bytes, { level: 6 });
        bytes = await entry.gzip;
        res.setHeader('Content-Encoding', 'gzip');
      }
      res.writeHead(200, { 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { if (!res.headersSent) json(res, 404, { error: 'File not found.' }); else res.end(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192,
    perMessageDeflate: {
      // Full authoritative snapshots compress well. Small windows and no retained
      // context keep memory bounded even when several ten-player rooms are open.
      serverNoContextTakeover: true, clientNoContextTakeover: true,
      serverMaxWindowBits: 12, clientMaxWindowBits: 12, threshold: 1024,
      concurrencyLimit: 4, zlibDeflateOptions: { level: 1, memLevel: 4 },
    } });

  function send(connection, value) {
    const socket = connection?.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 256 * 1024) { socket.terminate(); return false; }
    try { socket.send(typeof value === 'string' ? value : JSON.stringify(value)); return true; }
    catch { socket.terminate(); return false; }
  }
  function error(connection, message) { send(connection, { type: 'error', message }); }
  function eachConnected(room, callback) {
    for (const seat of room.seats) if (seat.connection) callback(seat.connection);
  }
  function broadcast(room, value) {
    const text = JSON.stringify(value);
    eachConnected(room, connection => send(connection, text));
  }
  function lobby(room) {
    const players = room.match.players || room.match.snapshot().players;
    return { code: room.code, hostId: room.hostId, phase: room.match.phase, public: room.public,
      options: { ...room.options }, startsIn: room.startsAt ? Math.max(0, (room.startsAt - now()) / 1000) : null,
      countdown: room.startsAt ? Math.max(0, Math.ceil((room.startsAt - now()) / 1000)) : null,
      players: room.seats.map((seat, id) => ({ id, name: players[id]?.name || seat.name,
        bot: !seat.human, connected: Boolean(seat.connection), color: players[id]?.color ?? seat.color })) };
  }
  function publishLobby(room) { broadcast(room, { type: 'lobby', lobby: lobby(room) }); }
  function publishSnapshot(room, includeLobby = false, scheduled = false) {
    const value = { type: 'snapshot', snapshot: room.match.snapshot() };
    if (includeLobby) value.lobby = lobby(room);
    broadcast(room, value);
    const time = now();
    room.lastPublishAt = time;
    if (scheduled) {
      // Preserve the 15Hz deadline grid across the 33ms simulation timer's
      // rounding/jitter. Re-basing on each actual send would drift to 10Hz.
      // Skip missed periods after a stall; never queue stale catch-up frames.
      const periods = Math.max(1, Math.floor((time - room.nextPublishAt) / SNAPSHOT_INTERVAL_MS) + 1);
      room.nextPublishAt += periods * SNAPSHOT_INTERVAL_MS;
      if (room.nextPublishAt <= time) room.nextPublishAt = time + SNAPSHOT_INTERVAL_MS;
    } else room.nextPublishAt = time + SNAPSHOT_INTERVAL_MS;
  }
  function chooseHost(room) {
    const current = room.seats[room.hostId];
    if (current?.human && current.connection) return;
    room.hostId = room.seats.find(seat => seat.human && seat.connection)?.id ?? null;
  }
  function clearSeatInput(seat) { seat.input = null; seat.inputAt = -Infinity; }
  function welcome(connection, room, seat) {
    send(connection, { type: 'welcome', code: room.code, token: seat.token, playerId: seat.id,
      hostId: room.hostId, lastSeq: connection.seq, snapshot: room.match.snapshot(), lobby: lobby(room) });
  }
  function attach(connection, room, seat) {
    const old = seat.connection;
    seat.connection = connection; seat.disconnectedAt = null;
    connection.room = room; connection.seat = seat; connection.seq = 0;
    clearSeatInput(seat);
    room.lastActiveAt = now();
    clearTimeout(connection.joinTimeout);
    if (old && old !== connection) {
      old.room = null; old.seat = null;
      error(old, 'This player reconnected in another tab.');
      old.socket.close(4001, 'Player reconnected in another tab');
    }
    chooseHost(room);
    welcome(connection, room, seat);
    publishLobby(room);
  }
  function claim(connection, room, data) {
    const seat = room.seats.find(seat => !seat.human);
    if (!seat) { error(connection, 'All ten player seats are taken.'); return false; }
    seat.human = true; seat.name = cleanName(data.name);
    seat.color = Number.isInteger(data.color) && data.color >= 0 && data.color < 10 ? data.color : seat.id;
    seat.token = randomBytes(24).toString('hex');
    room.match.setHuman(seat.id, seat.name, seat.color);
    attach(connection, room, seat);
    return true;
  }
  function newRoom(connection, data, isPublic) {
    pruneRooms();
    if (rooms.size >= maxRooms) { error(connection, 'All islands are in use. Try again shortly.'); return; }
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); }
    while (rooms.has(code));
    const options = isPublic ? cleanOptions({}) : cleanOptions(data.options);
    const room = { code, public: isPublic, hostId: null, options,
      match: matchFactory({ ...options, seed: randomInt(0x7fffffff) }),
      seats: Array.from({ length: MAX_PLAYERS }, (_, id) => ({ id, human: false, name: '', color: id,
        token: null, connection: null, disconnectedAt: null, input: null, inputAt: -Infinity })),
      createdAt: now(), lastActiveAt: now(), lastPublishAt: 0, nextPublishAt: now() + SNAPSHOT_INTERVAL_MS,
      startsAt: isPublic ? now() + quickStartMs : null, lastLobbyAt: 0, closed: false };
    rooms.set(code, room);
    claim(connection, room, data);
  }
  function closeRoom(room, message) {
    if (room.closed) return;
    room.closed = true; rooms.delete(room.code);
    eachConnected(room, connection => {
      error(connection, message);
      connection.room = null; connection.seat = null;
      connection.socket.close(4000, 'Room closed');
    });
    for (const seat of room.seats) { seat.connection = null; seat.token = null; clearSeatInput(seat); }
  }
  function releaseSeat(room, seat) {
    seat.human = false; seat.token = null; seat.connection = null; seat.disconnectedAt = null;
    clearSeatInput(seat); room.match.removeHuman(seat.id);
    chooseHost(room); publishLobby(room);
    if (!room.seats.some(candidate => candidate.human)) closeRoom(room, 'Everyone has left this island.');
  }
  function detach(connection, voluntary = false) {
    const room = connection.room, seat = connection.seat;
    connection.room = null; connection.seat = null;
    if (!room || room.closed || seat?.connection !== connection) return;
    seat.connection = null; seat.disconnectedAt = now(); clearSeatInput(seat);
    room.lastActiveAt = now();
    if (voluntary) releaseSeat(room, seat);
    else { chooseHost(room); publishLobby(room); }
  }
  function start(room) {
    if (room.match.phase !== 'lobby') return;
    room.match.start(); room.startsAt = null; room.lastActiveAt = now();
    for (const seat of room.seats) clearSeatInput(seat);
    publishSnapshot(room, true);
  }
  function reset(room) {
    room.match = matchFactory({ ...room.options, seed: randomInt(0x7fffffff) });
    for (const seat of room.seats) {
      clearSeatInput(seat);
      if (seat.human) room.match.setHuman(seat.id, seat.name, seat.color);
    }
    room.startsAt = room.public ? now() + quickStartMs : null;
    room.lastActiveAt = now();
    publishSnapshot(room, true);
  }
  function pruneRooms() {
    const time = now();
    for (const room of rooms.values()) {
      let changed = false;
      for (const seat of room.seats) {
        if (seat.human && !seat.connection && seat.disconnectedAt !== null && time - seat.disconnectedAt >= reconnectMs) {
          seat.human = false; seat.token = null; seat.disconnectedAt = null;
          clearSeatInput(seat); room.match.removeHuman(seat.id); changed = true;
        }
      }
      if (changed) { chooseHost(room); publishLobby(room); }
      if (!room.seats.some(seat => seat.human)) { closeRoom(room, 'Everyone has left this island.'); continue; }
      if (time - room.lastActiveAt >= idleMs) closeRoom(room, 'This room expired. Create a new island.');
    }
    if (time - lastSweep > 60000) {
      for (const [key, value] of upgrades) if (time - value.at > 60000) upgrades.delete(key);
      lastSweep = time;
    }
  }
  function handleMessage(connection, data) {
    const time = now();
    if (!isObject(data) || typeof data.type !== 'string') { error(connection, 'Send a valid game message.'); return; }
    if (data.type === 'ping') {
      send(connection, { type: 'pong', at: typeof data.at === 'number' && Number.isFinite(data.at) ? data.at : 0 });
      return;
    }
    if (['create', 'join', 'quick', 'resume'].includes(data.type)) {
      if (connection.seat) { error(connection, 'Leave your current room before joining another.'); return; }
      if (!take(connection.joins, 0.5, 8, time)) { error(connection, 'Wait a moment before trying another room.'); return; }
      if (data.type === 'create') { newRoom(connection, data, data.public === true); return; }
      if (data.type === 'quick') {
        pruneRooms();
        const room = [...rooms.values()].find(room => room.public && room.match.phase === 'lobby' && room.seats.some(seat => !seat.human));
        if (room) claim(connection, room, data); else newRoom(connection, data, true);
        return;
      }
      const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
      if (!/^[A-Z2-9]{6}$/.test(code)) { error(connection, 'Enter the six-character room code.'); return; }
      pruneRooms();
      const room = rooms.get(code);
      if (!room || room.closed) { error(connection, 'That room expired or the code is incorrect.'); return; }
      if (data.type === 'resume') {
        const seat = room.seats.find(seat => seat.human && tokenMatches(data.token, seat.token));
        if (!seat) { error(connection, 'That seat has expired. Join the next round with the room code.'); return; }
        attach(connection, room, seat);
        return;
      }
      if (!room.seats.some(seat => !seat.human)) { error(connection, 'All ten player seats are taken.'); return; }
      if (room.match.phase !== 'lobby') { error(connection, 'This match is already underway. Join when the host opens the next lobby.'); return; }
      claim(connection, room, data);
      return;
    }
    const room = connection.room, seat = connection.seat;
    if (!room || !seat || room.closed || seat.connection !== connection) { error(connection, 'Join an island first.'); return; }
    if (data.type === 'leave') {
      detach(connection, true); send(connection, { type: 'left' }); connection.socket.close(1000, 'Left room'); return;
    }
    if (data.type === 'start' || data.type === 'rematch') {
      if (!take(connection.actions, 12, 24, time)) { error(connection, 'Wait a moment before the next action.'); return; }
      if (room.hostId !== seat.id) { error(connection, 'The room host starts the round.'); return; }
      if (data.type === 'start') {
        if (room.match.phase !== 'lobby') { error(connection, 'This match has already started.'); return; }
        start(room);
      } else {
        if (room.match.phase !== 'finished') { error(connection, 'Finish this round before starting a rematch.'); return; }
        reset(room);
      }
      return;
    }
    if (data.type !== 'input' && data.type !== 'action') { error(connection, 'Choose a valid game action.'); return; }
    if (data.matchId !== room.match.id || !validSequence(data.seq) || data.seq <= connection.seq) return;
    if (data.type === 'input') {
      if (!isObject(data.input)) { error(connection, 'Movement input must be an object.'); return; }
      // Only control intent reaches the engine. Position, health, damage and inventory are never accepted.
      const { moveX, moveZ, yaw, pitch, aimYaw, aimPitch, sprint, jump, fire, aim } = data.input;
      const input = normalizeInput({ moveX, moveZ, yaw, pitch, aimYaw, aimPitch, sprint, jump, fire, aim });
      seat.input = input; seat.inputAt = time;
    } else {
      if (!ACTIONS.has(data.action)) { error(connection, 'Choose a valid game action.'); return; }
      if (!take(connection.actions, 12, 24, time)) { error(connection, 'Wait a moment before the next action.'); return; }
      room.match.action(seat.id, data.action);
    }
    connection.seq = data.seq;
    room.lastActiveAt = time;
  }

  server.on('upgrade', (req, socket, head) => {
    const reject = status => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (shuttingDown || connections.size >= maxConnections) { reject('503 Service Unavailable'); return; }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { reject('400 Bad Request'); return; }
    if (url.pathname !== '/ws') { reject('404 Not Found'); return; }
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { reject('403 Forbidden'); return; }
      const protocol = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https:' : 'http:';
      if (origin.protocol !== protocol || origin.host.toLowerCase() !== String(req.headers.host).toLowerCase()) {
        reject('403 Forbidden'); return;
      }
    }
    const address = req.socket.remoteAddress || 'unknown', time = now();
    let bucket = upgrades.get(address);
    if (!bucket) {
      if (upgrades.size >= 4096) { reject('503 Service Unavailable'); return; }
      bucket = tokenBucket(100, time); upgrades.set(address, bucket);
    }
    if (!take(bucket, 2, 100, time)) { reject('429 Too Many Requests'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', socket => {
    const connection = { socket, room: null, seat: null, seq: 0, alive: true,
      messages: tokenBucket(120, now()), joins: tokenBucket(8, now()), actions: tokenBucket(24, now()),
      joinTimeout: null, lastRateWarning: -Infinity };
    connections.add(connection);
    socket._socket?.setNoDelay(true);
    connection.joinTimeout = setTimeout(() => {
      if (!connection.seat) socket.close(4000, 'Join a room to play');
    }, 30000);
    connection.joinTimeout.unref();
    socket.on('pong', () => { connection.alive = true; });
    socket.on('message', (bytes, binary) => {
      if (binary) { socket.close(1003, 'Text messages only'); return; }
      if (!take(connection.messages, 75, 120, now())) {
        if (now() - connection.lastRateWarning > 1000) {
          error(connection, 'Too many inputs. Slow down for a moment.'); connection.lastRateWarning = now();
        }
        return;
      }
      let data;
      try { data = JSON.parse(bytes.toString('utf8')); }
      catch { error(connection, 'That message was not valid JSON.'); return; }
      try { handleMessage(connection, data); }
      catch (cause) {
        // Keep malformed clients or an isolated room error from taking down every island.
        error(connection, 'That action could not be completed. Please reconnect if it continues.');
        console.error('SKYBREAK message error:', cause?.stack || cause?.message || 'unknown');
      }
    });
    socket.on('close', () => {
      clearTimeout(connection.joinTimeout); connections.delete(connection); detach(connection);
    });
    socket.on('error', () => { /* The close handler owns seat cleanup. */ });
  });

  /** Advance fixed steps; exposed for deterministic integration verification. */
  let accumulated = 0;
  function tick(elapsed = FIXED_STEP) {
    if (shuttingDown) return;
    pruneRooms();
    const time = now();
    accumulated += Math.max(0, Math.min(Number.isFinite(elapsed) ? elapsed : 0, .25));
    const steps = Math.min(8, Math.floor((accumulated + 1e-9) / FIXED_STEP));
    accumulated = Math.max(0, accumulated - steps * FIXED_STEP);
    for (const room of rooms.values()) {
      if (room.closed) continue;
      if (room.public && room.match.phase === 'lobby' && room.startsAt !== null && time >= room.startsAt) {
        if (room.seats.some(seat => seat.connection)) start(room);
        else room.startsAt = time + quickStartMs;
      }
      const previousPhase = room.match.phase;
      if (room.match.phase === 'drop' || room.match.phase === 'active') {
        const inputs = new Map();
        for (const seat of room.seats) if (seat.human && seat.connection && seat.input && time - seat.inputAt <= inputExpiryMs) inputs.set(seat.id, seat.input);
        for (let i = 0; i < steps && room.match.phase !== 'finished'; i++) room.match.step(FIXED_STEP, inputs);
        if (room.match.phase !== previousPhase) publishSnapshot(room, true);
        else if (time >= room.nextPublishAt) publishSnapshot(room, false, true);
      } else if (time - room.lastLobbyAt >= 1000) {
        publishSnapshot(room, true); room.lastLobbyAt = time;
      }
    }
  }
  let previousTick = performance.now();
  const simulationTimer = automaticTicks ? setInterval(() => {
    const time = performance.now(), elapsed = (time - previousTick) / 1000;
    previousTick = time;
    try { tick(elapsed); }
    catch (cause) { console.error('SKYBREAK simulation error:', cause?.stack || cause?.message || 'unknown'); }
  }, 1000 / 30) : null;
  simulationTimer?.unref();
  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) { connection.socket.terminate(); continue; }
      connection.alive = false;
      if (connection.socket.readyState === WebSocket.OPEN) connection.socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();
  async function close() {
    if (closePromise) return closePromise;
    shuttingDown = true;
    if (simulationTimer) clearInterval(simulationTimer);
    clearInterval(heartbeat);
    for (const room of [...rooms.values()]) closeRoom(room, 'The island is restarting. Create a new room shortly.');
    for (const connection of connections) { clearTimeout(connection.joinTimeout); connection.socket.terminate(); }
    closePromise = Promise.all([
      new Promise(resolve => wss.close(() => resolve())),
      new Promise(resolve => {
        if (!server.listening) { resolve(); return; }
        server.close(() => resolve()); server.closeIdleConnections?.();
      }),
    ]).then(() => undefined);
    return closePromise;
  }
  return { server, wss, rooms, close, tick };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = createGameServer(), port = Number(process.env.PORT) || 3000;
  game.server.listen(port, '0.0.0.0', () => console.log(`SKYBREAK listening on ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(0), 5000); deadline.unref();
    game.close().then(() => process.exit(0));
  });
}
