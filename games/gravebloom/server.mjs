/** GRAVEBLOOM: one authoritative simulation per private, four-player party. */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, realpath, stat } from 'node:fs/promises';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import * as simulation from './public/sim.mjs';

const PUBLIC_ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const CLASSES = new Set(['warrior', 'archer', 'wizard']);
const DIFFICULTIES = new Set(['story', 'normal', 'hard']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STEP = 1 / 30;
const MAX_PLAYERS = 4;
const ZERO_INPUT = Object.freeze({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false,
  skill1: false, skill2: false, dodge: false, interact: false, potion: false });
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cleanName(value) {
  return typeof value === 'string'
    ? [...value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()].slice(0, 22).join('') || 'Wanderer'
    : 'Wanderer';
}
function normalCode(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[ -]/g, '').slice(0, 12) : '';
}
function makeCode() {
  return [...randomBytes(6)].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}
function validToken(value, expected) {
  return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value)
    && typeof expected === 'string' && value.length === expected.length
    && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
function bucket(tokens, now) { return { tokens, at: now }; }
function take(limit, perSecond, burst, now) {
  limit.tokens = Math.min(burst, limit.tokens + Math.max(0, now - limit.at) * perSecond / 1000);
  limit.at = now;
  if (limit.tokens < 1) return false;
  limit.tokens--;
  return true;
}

/** Clients describe intentions; no client position, health, damage or loot is accepted. */
export function normalizeInput(value) {
  if (!object(value)) return null;
  for (const field of ['mx', 'my', 'aimX', 'aimY']) {
    if (value[field] !== undefined && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) return null;
  }
  const result = { mx: clamp(value.mx || 0, -1, 1), my: clamp(value.my || 0, -1, 1),
    aimX: clamp(value.aimX || 0, -1000000, 1000000), aimY: clamp(value.aimY || 0, -1000000, 1000000) };
  for (const key of ['attack', 'skill1', 'skill2', 'dodge', 'interact', 'potion']) result[key] = value[key] === true;
  return result;
}

/** The returned server is unbound until listen() is called. Tests can disable timers. */
export function createServer({ port = Number(process.env.PORT || 3000), host = '0.0.0.0',
  publicRoot = PUBLIC_ROOT, now = Date.now, automaticTicks = true, reconnectMs = 90000,
  idleMs = 30 * 60000, inputExpiryMs = 250, maxRooms = 100, maxConnections = 500,
  sim = simulation } = {}) {
  const root = path.resolve(publicRoot), rooms = new Map(), connections = new Set();
  const assets = new Map(), ipLimits = new Map();
  let closed = false, closePromise, simulationTimer, heartbeatTimer, tickNumber = 0;
  let lastTick = now(), accumulator = 0, lastSweep = now();
  const originAllowed = request => {
    const origin = request.headers.origin;
    if (!origin) return true;
    const ownHost = request.headers.host;
    if (origin === `https://${ownHost}` || origin === `http://${ownHost}`) return true;
    try { return !!process.env.RENDER_EXTERNAL_URL && origin === new URL(process.env.RENDER_EXTERNAL_URL).origin; }
    catch { return false; }
  };
  function json(response, status, value, head = false) {
    const body = JSON.stringify(value);
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    response.end(head ? undefined : body);
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!originAllowed(request)) return json(response, 403, { error: 'Open the game from its own address.' });
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return json(response, 405, { error: 'Use GET or HEAD.' });
    }
    let pathname;
    try {
      pathname = decodeURIComponent(String(request.url || '/').split('?')[0]);
      if (!pathname.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(pathname)
        || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) throw new Error();
    } catch { return json(response, 404, { error: 'File not found.' }); }
    if (pathname === '/health' || pathname === '/api/status') {
      return json(response, closed ? 503 : 200, { ok: !closed, service: 'gravebloom', version: '0.1.0',
        rooms: rooms.size, connectedPlayers: [...connections].filter(c => c.seat).length,
        capacity: MAX_PLAYERS, simulationHz: 30, snapshotHz: 15, persistence: 'memory' }, request.method === 'HEAD');
    }
    if (closed) return json(response, 503, { error: 'The game is restarting. Please reconnect.' });
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = path.resolve(root, relative), mime = MIME[path.extname(target).toLowerCase()];
    if (!mime || !target.startsWith(root + path.sep)) return json(response, 404, { error: 'File not found.' });
    try {
      const resolved = await realpath(target);
      if (!resolved.startsWith(root + path.sep)) throw new Error('File outside public assets');
      const info = await stat(resolved);
      if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error('Not a public asset');
      let entry = assets.get(resolved);
      if (!entry || entry.mtime !== info.mtimeMs || entry.size !== info.size) {
        entry = { mtime: info.mtimeMs, size: info.size, bytes: await readFile(resolved) };
        if (assets.size >= 80) assets.delete(assets.keys().next().value);
        assets.set(resolved, entry);
      }
      const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      response.setHeader('Content-Type', mime);
      response.setHeader('Cache-Control', relative.endsWith('.html') ? 'no-store' : 'no-cache');
      response.setHeader('ETag', etag);
      if (!relative.endsWith('.html') && request.headers['if-none-match'] === etag) {
        response.writeHead(304); return response.end();
      }
      response.writeHead(200, { 'Content-Length': entry.bytes.length });
      response.end(request.method === 'HEAD' ? undefined : entry.bytes);
    } catch { if (!response.headersSent) json(response, 404, { error: 'File not found.' }); else response.end(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192,
    perMessageDeflate: { serverNoContextTakeover: true, clientNoContextTakeover: true,
      serverMaxWindowBits: 12, clientMaxWindowBits: 12, threshold: 1024, concurrencyLimit: 4,
      zlibDeflateOptions: { level: 1, memLevel: 4 } } });

  function send(connection, data) {
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) return false;
    if (connection.socket.bufferedAmount > 512 * 1024) { connection.socket.terminate(); return false; }
    try { connection.socket.send(typeof data === 'string' ? data : JSON.stringify(data)); return true; }
    catch { connection.socket.terminate(); return false; }
  }
  const error = (connection, message, code) => send(connection, { type: 'error', message, ...(code ? { code } : {}) });
  const connectedSeats = room => [...room.seats.values()].filter(seat => seat.connection);
  function broadcast(room, data) {
    const message = JSON.stringify(data);
    for (const seat of room.seats.values()) if (seat.connection) send(seat.connection, message);
  }
  function lobby(room) {
    return { type: 'lobby', code: room.code, hostId: room.hostId, started: room.started,
      players: [...room.seats.values()].map(seat => ({ id: seat.id, name: seat.name,
        classId: seat.classId, connected: !!seat.connection })) };
  }
  function chooseHost(room) {
    if (room.seats.get(room.hostId)?.connection) return;
    room.hostId = connectedSeats(room)[0]?.id || room.seats.values().next().value?.id || null;
  }
  function state(room) { return sim.snapshot(room.game); }
  const worldKey = current => JSON.stringify([current.seed, current.run || 1, current.zoneIndex || 0]);
  function sendState(room, { type = 'state', connection = null, forceFull = false } = {}) {
    const current = state(room), key = worldKey(current);
    const { map, ...dynamic } = current;
    const fullPacket = { type, worldKey: key, fullMap: true, state: current };
    const compactPacket = { type, worldKey: key, fullMap: false,
      mapState: { rooms: map?.rooms || [], chests: map?.chests || [], shrines: map?.shrines || [] }, state: dynamic };
    let fullText, compactText;
    const recipients = connection ? [connection] : connectedSeats(room).map(seat => seat.connection);
    for (const target of recipients) {
      const full = forceFull || type === 'started' || target.worldKey !== key;
      const message = full ? (fullText ||= JSON.stringify(fullPacket)) : (compactText ||= JSON.stringify(compactPacket));
      if (send(target, message)) target.worldKey = key;
    }
  }
  function broadcastState(room, type = 'state') { sendState(room, { type }); }
  function clearInput(room, seat) {
    sim.setInput(room.game, seat.id, { ...ZERO_INPUT });
    seat.inputAt = 0;
  }
  function detach(connection, remove = false) {
    const room = connection.room, seat = connection.seat;
    connection.room = null; connection.seat = null;
    if (!room || !seat || seat.connection !== connection) return;
    clearInput(room, seat);
    seat.connection = null; seat.disconnectedAt = now();
    room.lastActive = now();
    sim.removePlayer(room.game, seat.id, { permanent: remove });
    if (remove) room.seats.delete(seat.id);
    chooseHost(room);
    broadcast(room, lobby(room));
  }
  function attach(connection, room, seat) {
    if (seat.connection && seat.connection !== connection) {
      const old = seat.connection;
      old.seat = null; old.room = null;
      old.socket.close(4001, 'This player reconnected from another connection.');
    }
    seat.connection = connection; seat.disconnectedAt = null; seat.inputAt = 0;
    connection.seat = seat; connection.room = room; connection.lastSequence = 0;
    sim.addPlayer(room.game, { id: seat.id, name: seat.name, classId: seat.classId });
    room.lastActive = now(); chooseHost(room);
    const current = state(room), key = worldKey(current);
    send(connection, { type: 'welcome', playerId: seat.id, token: seat.token, code: room.code,
      hostId: room.hostId, worldKey: key, fullMap: true, state: current, started: room.started });
    connection.worldKey = key;
    broadcast(room, lobby(room));
  }
  function gameOver(room) {
    const current = state(room);
    return ['gameover', 'over', 'defeat', 'victory', 'finished'].includes(current?.phase)
      || ['gameover', 'over', 'defeat', 'victory', 'finished'].includes(current?.status);
  }
  function addSeat(connection, room, message) {
    if (room.seats.size >= MAX_PLAYERS) return error(connection, 'This party has four players. A disconnected seat is held for 90 seconds.', 'PARTY_FULL');
    if (room.started && gameOver(room)) return error(connection, 'This expedition has ended. Ask the host to start another.');
    const classId = CLASSES.has(message.classId) ? message.classId : 'warrior';
    const seat = { id: randomBytes(8).toString('hex'), token: randomBytes(24).toString('hex'),
      name: cleanName(message.name), classId, connection: null, disconnectedAt: null, inputAt: 0 };
    const player = sim.addPlayer(room.game, { id: seat.id, name: seat.name, classId });
    if (!player) return error(connection, 'The expedition cannot add another player. Try a new party.');
    room.seats.set(seat.id, seat);
    if (!room.hostId) room.hostId = seat.id;
    attach(connection, room, seat);
  }
  function sweep() {
    const time = now();
    for (const room of rooms.values()) {
      for (const seat of room.seats.values()) {
        if (!seat.connection && seat.disconnectedAt !== null && time - seat.disconnectedAt >= reconnectMs) {
          room.seats.delete(seat.id); sim.removePlayer(room.game, seat.id, { permanent: true }); chooseHost(room);
          broadcast(room, lobby(room));
        }
      }
      if (!connectedSeats(room).length && time - room.lastActive >= idleMs) rooms.delete(room.code);
    }
    for (const [ip, limit] of ipLimits) if (time - limit.at > 60000) ipLimits.delete(ip);
  }
  function tick(dt = STEP) {
    const time = now();
    for (const room of rooms.values()) {
      if (!room.started || !connectedSeats(room).length) continue;
      for (const seat of room.seats.values()) {
        if (seat.inputAt && time - seat.inputAt > inputExpiryMs) clearInput(room, seat);
      }
      try { sim.step(room.game, Math.min(Math.max(dt, 0), 0.1)); }
      catch (failure) {
        room.started = false;
        broadcast(room, { type: 'error', message: 'This expedition stopped unexpectedly. The host can restart it.' });
        console.error('Gravebloom simulation failure:', failure?.message || failure);
      }
      if (tickNumber % 2 === 0) broadcastState(room);
    }
    tickNumber++;
    if (time - lastSweep >= 1000) { lastSweep = time; sweep(); }
  }

  wss.on('connection', (socket, request) => {
    const time = now();
    const connection = { socket, room: null, seat: null, alive: true, lastSequence: 0, worldKey: null,
      inputLimit: bucket(90, time), actionLimit: bucket(15, time), generalLimit: bucket(120, time),
      lobbyLimit: bucket(4, time) };
    connections.add(connection);
    socket.on('pong', () => { connection.alive = true; });
    socket.on('error', () => {});
    socket.on('close', () => { detach(connection); connections.delete(connection); });
    socket.on('message', (bytes, binary) => {
      if (closed) return;
      if (binary || !take(connection.generalLimit, 100, 120, now())) { socket.close(1008, 'Too many requests.'); return; }
      let message;
      try { message = JSON.parse(bytes.toString('utf8')); } catch { return error(connection, 'Send a valid game message.'); }
      if (!object(message) || typeof message.type !== 'string') return error(connection, 'Send a valid game message.');
      try {
        if (message.type === 'ping') {
          if (!take(connection.actionLimit, 10, 15, now())) return;
          return send(connection, { type: 'pong', at: Number.isFinite(message.at) ? message.at : null });
        }
        if (['host', 'join', 'resume'].includes(message.type)) {
          if (connection.seat) return error(connection, 'Leave your current party before joining another.');
          if (!take(connection.lobbyLimit, 1, 4, now())) return error(connection, 'Wait a moment before joining again.');
          if (message.type === 'host') {
            sweep();
            if (rooms.size >= maxRooms) return error(connection, 'All expedition slots are in use. Please try again soon.');
            let code; do { code = makeCode(); } while (rooms.has(code));
            const difficulty = DIFFICULTIES.has(message.difficulty) ? message.difficulty : 'normal';
            const room = { code, game: sim.createGame({ seed: randomInt(1, 0x7fffffff), difficulty }),
              seats: new Map(), hostId: null, started: false, lastActive: now(), difficulty };
            rooms.set(code, room); return addSeat(connection, room, message);
          }
          const code = normalCode(message.code), room = rooms.get(code);
          if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code) || !room) return error(connection, 'That party code was not found. Check the code or ask your friend to host again.', 'ROOM_NOT_FOUND');
          if (message.type === 'resume') {
            const seat = [...room.seats.values()].find(candidate => validToken(message.token, candidate.token));
            if (!seat || (!seat.connection && seat.disconnectedAt !== null && now() - seat.disconnectedAt >= reconnectMs)) {
              return error(connection, 'Your reserved seat expired. Join the party again with its code.', 'RESUME_EXPIRED');
            }
            return attach(connection, room, seat);
          }
          return addSeat(connection, room, message);
        }
        const room = connection.room, seat = connection.seat;
        if (!room || !seat) return error(connection, 'Host or join a party first.');
        room.lastActive = now();
        if (message.type === 'leave') {
          detach(connection, true); return send(connection, { type: 'left' });
        }
        if (message.type === 'sync') {
          if (take(connection.actionLimit, 10, 15, now())) sendState(room, { connection, forceFull: true });
          return;
        }
        if (message.type === 'start') {
          if (room.hostId !== seat.id) return error(connection, 'The party host starts the expedition.');
          if (room.started) return;
          room.started = true;
          broadcast(room, lobby(room)); return broadcastState(room, 'started');
        }
        if (message.type === 'input') {
          if (!room.started) return;
          if (!take(connection.inputLimit, 70, 90, now())) return;
          if (!Number.isSafeInteger(message.seq) || message.seq <= connection.lastSequence || message.seq > 0x7fffffff) return;
          const input = normalizeInput(message.input);
          if (!input) return error(connection, 'Movement and aim must be finite numbers.');
          connection.lastSequence = message.seq; seat.inputAt = now();
          sim.setInput(room.game, seat.id, input); return;
        }
        if (message.type === 'action') {
          if (!take(connection.actionLimit, 10, 15, now())) return;
          if (!object(message.action) || typeof message.action.type !== 'string' || message.action.type.length > 40) return error(connection, 'Invalid game action.');
          const kind = message.action.type;
          if (['choose', 'restart', 'next', 'start'].includes(kind) && room.hostId !== seat.id) return error(connection, 'The party host makes this shared choice.');
          if (!room.started && kind !== 'restart') return error(connection, 'Start the expedition first.');
          const allowed = {};
          for (const [key, value] of Object.entries(message.action)) {
            if (['__proto__', 'constructor', 'prototype', 'playerId', 'health', 'hp', 'damage', 'position', 'x', 'y'].includes(key)) continue;
            if (key.length > 40) continue;
            if (typeof value === 'string' && value.length <= 128 || typeof value === 'boolean'
              || typeof value === 'number' && Number.isFinite(value)) allowed[key] = value;
          }
          const result = sim.action(room.game, seat.id, allowed);
          if (result === false || result?.error) return error(connection, result?.error || 'That action is not available now.');
          if (kind === 'restart') { room.started = true; broadcast(room, lobby(room)); }
          broadcastState(room); return;
        }
        error(connection, 'Unknown game message.');
      } catch (failure) {
        console.error('Gravebloom command failure:', failure?.message || failure);
        error(connection, 'That action could not be completed. Please try again.');
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const time = now(), ip = request.socket.remoteAddress || 'unknown';
    let rate = ipLimits.get(ip);
    if (!rate) {
      if (ipLimits.size > 2000) ipLimits.delete(ipLimits.keys().next().value);
      rate = bucket(24, time); ipLimits.set(ip, rate);
    }
    let pathname; try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { pathname = ''; }
    if (closed || pathname !== '/ws' || !originAllowed(request) || connections.size >= maxConnections || !take(rate, 1, 24, time)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  if (automaticTicks) {
    simulationTimer = setInterval(() => {
      const time = now(); accumulator += Math.min(Math.max((time - lastTick) / 1000, 0), 0.15); lastTick = time;
      let count = 0;
      while (accumulator >= STEP && count < 4) { tick(STEP); accumulator -= STEP; count++; }
      if (count === 4) accumulator = 0;
    }, 1000 / 30);
    heartbeatTimer = setInterval(() => {
      for (const connection of connections) {
        if (!connection.alive) { connection.socket.terminate(); continue; }
        connection.alive = false;
        try { connection.socket.ping(); } catch { connection.socket.terminate(); }
      }
      sweep();
    }, 15000);
  }
  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
    });
  }
  function close() {
    if (closePromise) return closePromise;
    closed = true; clearInterval(simulationTimer); clearInterval(heartbeatTimer);
    closePromise = new Promise(resolve => {
      for (const connection of connections) connection.socket.terminate();
      wss.close();
      if (!server.listening) return resolve();
      server.close(resolve); server.closeAllConnections();
    });
    return closePromise;
  }
  return { server, rooms, listen, close, tick, sweep };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const requestedPort = value('--port'), requestedHost = value('--host');
  if (args.includes('--port') && (requestedPort === undefined || !Number.isInteger(Number(requestedPort))
    || Number(requestedPort) < 0 || Number(requestedPort) > 65535)) throw new Error('--port requires a number from 0 to 65535.');
  if (args.includes('--host') && (!requestedHost || requestedHost.startsWith('--'))) throw new Error('--host requires a hostname.');
  // The preview launcher supplies these standard dev flags. Node naturally keeps
  // the requested port strict: a busy port fails instead of silently selecting another.
  const app = createServer({ ...(requestedPort !== undefined ? { port: Number(requestedPort) } : {}),
    ...(requestedHost ? { host: requestedHost } : {}) });
  const address = await app.listen();
  console.log(`GRAVEBLOOM listening on ${address.address}:${address.port}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
