/** Pocket Volleyball: one server authority per private two-player court. */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, realpath, stat } from 'node:fs/promises';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import * as simulation from './public/sim.mjs';

const PUBLIC_ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const STEP = 1 / 60;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ZERO_INPUT = Object.freeze({ mx: 0, my: 0, pass: false, spike: false, dive: false, switch: false });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const codeFor = value => typeof value === 'string' ? value.toUpperCase().replace(/[ -]/g, '').slice(0, 12) : '';
const validCode = value => /^[A-HJ-NP-Z2-9]{6}$/.test(value);
const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const bucket = (tokens, at) => ({ tokens, at });
function take(limit, perSecond, burst, at) {
  limit.tokens = Math.min(burst, limit.tokens + Math.max(0, at - limit.at) * perSecond / 1000);
  limit.at = at;
  if (limit.tokens < 1) return false;
  limit.tokens--;
  return true;
}
function matchesToken(value, expected) {
  return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value)
    && typeof expected === 'string' && expected.length === value.length
    && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** Positions, teams, ball state and score are never accepted from a client. */
export function normalizeInput(value) {
  if (!object(value)) return null;
  for (const field of ['mx', 'my']) {
    if (value[field] !== undefined && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) return null;
  }
  const input = { mx: clamp(value.mx || 0, -1, 1), my: clamp(value.my || 0, -1, 1) };
  const length = Math.hypot(input.mx, input.my);
  if (length > 1) { input.mx /= length; input.my /= length; }
  for (const field of ['pass', 'spike', 'dive', 'switch']) input[field] = value[field] === true;
  return input;
}

/** Tests can supply a deterministic clock and tick without starting timers. */
export function createServer({ port = Number(process.env.PORT || 3000), host = '0.0.0.0',
  publicRoot = PUBLIC_ROOT, sim = simulation, now = Date.now, automaticTicks = true,
  reconnectMs = 90000, idleMs = 10 * 60000, inputExpiryMs = 250, stallMs = 1500,
  maxRooms = 80, maxConnections = 200 } = {}) {
  const root = path.resolve(publicRoot), rooms = new Map(), connections = new Set();
  const ipLimits = new Map(), assets = new Map();
  let closed = false, closePromise, simulationTimer, heartbeatTimer;
  let tickNumber = 0, lastTick = now(), accumulator = 0, lastSweep = now();

  function originAllowed(request) {
    const origin = request.headers.origin;
    if (!origin) return true; // Native websocket/test clients may omit Origin.
    if (origin === `https://${request.headers.host}` || origin === `http://${request.headers.host}`) return true;
    try { return !!process.env.RENDER_EXTERNAL_URL && origin === new URL(process.env.RENDER_EXTERNAL_URL).origin; }
    catch { return false; }
  }
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
    if (!originAllowed(request)) return json(response, 403, { error: 'Open the game from its own address.' }, request.method === 'HEAD');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return json(response, 405, { error: 'Use GET or HEAD.' });
    }
    let pathname;
    try {
      pathname = decodeURIComponent(String(request.url || '/').split('?')[0]);
      if (!pathname.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(pathname)
        || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) throw new Error();
    } catch { return json(response, 404, { error: 'File not found.' }, request.method === 'HEAD'); }
    if (pathname === '/health') {
      return json(response, closed ? 503 : 200, { ok: !closed, service: 'pocket-volleyball',
        version: simulation.VERSION || '0.1.0', rooms: rooms.size,
        connectedPlayers: [...connections].filter(connection => connection.seat).length,
        playersPerRoom: 2, simulationHz: 60, snapshotHz: 20, persistence: 'memory' }, request.method === 'HEAD');
    }
    if (closed) return json(response, 503, { error: 'The court is restarting. Reconnect in a moment.' }, request.method === 'HEAD');
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = path.resolve(root, relative), mime = MIME[path.extname(target).toLowerCase()];
    if (!mime || !target.startsWith(root + path.sep)) return json(response, 404, { error: 'File not found.' }, request.method === 'HEAD');
    try {
      const resolved = await realpath(target);
      if (!resolved.startsWith(root + path.sep)) throw new Error('Outside public root');
      const info = await stat(resolved);
      if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error('Not a public asset');
      let entry = assets.get(resolved);
      if (!entry || entry.mtime !== info.mtimeMs || entry.size !== info.size) {
        entry = { mtime: info.mtimeMs, size: info.size, bytes: await readFile(resolved) };
        if (assets.size >= 32) assets.delete(assets.keys().next().value);
        if (entry.size <= 512 * 1024) assets.set(resolved, entry);
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
    } catch {
      if (!response.headersSent) json(response, 404, { error: 'File not found.' }, request.method === 'HEAD');
      else response.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });

  function send(connection, data) {
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) return false;
    if (connection.socket.bufferedAmount > 128 * 1024) { connection.socket.terminate(); return false; }
    try { connection.socket.send(typeof data === 'string' ? data : JSON.stringify(data)); return true; }
    catch { connection.socket.terminate(); return false; }
  }
  const error = (connection, message, code = 'INVALID_ACTION') => send(connection, { type: 'error', message, code });
  const connectedSeats = room => [...room.seats.values()].filter(seat => seat.connection);
  const bothConnected = room => room.seats.size === 2 && connectedSeats(room).length === 2;
  function broadcast(room, data) {
    const text = JSON.stringify(data);
    for (const seat of room.seats.values()) if (seat.connection) send(seat.connection, text);
  }
  function lobby(room) {
    return { type: 'lobby', code: room.code, mode: room.mode, host: 0,
      difficulty: room.difficulty, target: room.target, started: room.started,
      paused: room.paused, reason: room.reason,
      players: [...room.seats.values()].sort((a, b) => a.index - b.index).map(seat => ({
        seat: seat.index, name: `Player ${seat.index + 1}`, connected: !!seat.connection, ready: seat.ready,
      })) };
  }
  function packet(room, type = 'state') {
    return { type, state: sim.snapshot(room.game), paused: room.paused, reason: room.reason,
      tick: room.tick, serverTime: now() };
  }
  const broadcastState = (room, type = 'state') => broadcast(room, packet(room, type));
  function clearInput(seat) { seat.input = { ...ZERO_INPUT }; seat.inputAt = null; }
  function pause(room, reason) {
    const changed = !room.paused || [...room.seats.values()].some(seat => seat.ready) || room.reason !== reason;
    room.paused = true; room.reason = reason;
    for (const seat of room.seats.values()) { seat.ready = false; clearInput(seat); }
    if (changed) { broadcast(room, lobby(room)); broadcastState(room); }
  }
  function detach(connection, remove = false) {
    const { room, seat } = connection;
    connection.room = null; connection.seat = null;
    if (!room || !seat || seat.connection !== connection) return;
    seat.connection = null; seat.disconnectedAt = now(); seat.ready = false; clearInput(seat);
    room.lastActive = now();
    if (remove) room.seats.delete(seat.index);
    if (room.started) pause(room, remove ? 'A player left. Invite a friend to continue.' : 'Connection interrupted. Waiting for both players.');
    broadcast(room, lobby(room));
    if (!room.seats.size) rooms.delete(room.code);
  }
  function attach(connection, room, seat) {
    if (seat.connection && seat.connection !== connection) {
      const previous = seat.connection;
      previous.room = null; previous.seat = null;
      previous.socket.close(4001, 'This seat reconnected in another tab.');
    }
    seat.connection = null;
    if (room.started) pause(room, 'Both players must choose Ready to resume.');
    seat.connection = connection; seat.disconnectedAt = null; seat.ready = false; clearInput(seat);
    seat.lastInputAt = now(); connection.seat = seat; connection.room = room; connection.lastSequence = -1;
    room.lastActive = now();
    send(connection, { type: 'welcome', code: room.code, seat: seat.index, token: seat.token,
      isHost: seat.index === 0, mode: room.mode, difficulty: room.difficulty, target: room.target,
      state: sim.snapshot(room.game), started: room.started, paused: room.paused, reason: room.reason });
    broadcast(room, lobby(room));
  }
  function addSeat(connection, room) {
    if (room.seats.size >= 2) return error(connection, 'This court already has two players. Disconnected places are held for 90 seconds.', 'ROOM_FULL');
    const index = room.seats.has(0) ? 1 : 0;
    const seat = { index, token: randomBytes(24).toString('hex'), connection: null,
      disconnectedAt: null, ready: false, input: { ...ZERO_INPUT }, inputAt: null, lastInputAt: now() };
    room.seats.set(index, seat); attach(connection, room, seat);
  }
  function sweep() {
    const at = now();
    for (const room of rooms.values()) {
      for (const seat of room.seats.values()) {
        if (!seat.connection && seat.disconnectedAt !== null && at - seat.disconnectedAt >= reconnectMs) {
          room.seats.delete(seat.index);
          broadcast(room, lobby(room));
        }
      }
      if (!room.seats.size || !connectedSeats(room).length && at - room.lastActive >= idleMs) rooms.delete(room.code);
    }
    for (const [ip, limit] of ipLimits) if (at - limit.at > 60000) ipLimits.delete(ip);
  }
  function tick(dt = STEP) {
    const at = now();
    for (const room of rooms.values()) {
      if (!room.started || room.paused) continue;
      if (!bothConnected(room)) { pause(room, 'Waiting for both players.'); continue; }
      if ([...room.seats.values()].some(seat => at - seat.lastInputAt > stallMs)) {
        pause(room, 'Connection stalled. Both players must choose Ready to resume.'); continue;
      }
      for (const seat of room.seats.values()) {
        if (seat.inputAt !== null && at - seat.inputAt > inputExpiryMs) clearInput(seat);
      }
      try {
        sim.step(room.game, Math.min(Math.max(dt, 0), 0.05), [room.seats.get(0).input, room.seats.get(1).input]);
        room.tick++;
      } catch (failure) {
        pause(room, 'The match stopped unexpectedly. The host can start a rematch.');
        broadcast(room, { type: 'error', code: 'MATCH_STOPPED', message: room.reason });
        console.error('Pocket Volleyball simulation failure:', failure?.message || failure);
      }
      if (tickNumber % 3 === 0) broadcastState(room);
    }
    tickNumber++;
    if (at - lastSweep >= 1000) { lastSweep = at; sweep(); }
  }

  wss.on('connection', socket => {
    const at = now();
    const connection = { socket, room: null, seat: null, alive: true, lastSequence: -1,
      generalLimit: bucket(100, at), inputLimit: bucket(80, at), actionLimit: bucket(16, at), lobbyLimit: bucket(4, at) };
    connections.add(connection);
    socket.on('pong', () => { connection.alive = true; });
    socket.on('error', () => {});
    socket.on('close', () => { detach(connection); connections.delete(connection); });
    socket.on('message', (bytes, binary) => {
      if (closed) return;
      if (binary || !take(connection.generalLimit, 90, 100, now())) { socket.close(1008, 'Too many requests.'); return; }
      let message;
      try { message = JSON.parse(bytes.toString('utf8')); }
      catch { return error(connection, 'Send a valid game message.', 'INVALID_MESSAGE'); }
      if (!object(message) || typeof message.type !== 'string') return error(connection, 'Send a valid game message.', 'INVALID_MESSAGE');
      try {
        if (message.type === 'ping') {
          if (take(connection.actionLimit, 10, 16, now())) send(connection, { type: 'pong', sent: Number.isFinite(message.sent) ? message.sent : null });
          return;
        }
        if (['create', 'join', 'reconnect'].includes(message.type)) {
          if (connection.seat) return error(connection, 'Leave this court before joining another.');
          if (!take(connection.lobbyLimit, 1, 4, now())) return error(connection, 'Wait a moment before trying again.', 'RATE_LIMITED');
          sweep();
          if (message.type === 'create') {
            if (rooms.size >= maxRooms) return error(connection, 'All courts are busy. Try again shortly.', 'CAPACITY');
            const mode = message.mode === 'coop' ? 'coop' : 'versus';
            const difficulty = ['chill', 'club', 'pro'].includes(message.difficulty) ? message.difficulty : 'club';
            const target = [11, 21].includes(message.target) ? message.target : 11;
            let code; do { code = makeCode(); } while (rooms.has(code));
            const room = { code, mode, difficulty, target, seats: new Map(), started: false,
              paused: false, reason: '', lastActive: now(), tick: 0,
              game: sim.createMatch({ mode, difficulty, target, seed: randomInt(1, 0x7fffffff), assist: true }) };
            rooms.set(code, room); return addSeat(connection, room);
          }
          const code = codeFor(message.code), room = rooms.get(code);
          if (!validCode(code) || !room) return error(connection, 'That court was not found. Check the code or ask your friend to host again.', 'ROOM_NOT_FOUND');
          if (message.type === 'reconnect') {
            const seat = [...room.seats.values()].find(candidate => matchesToken(message.token, candidate.token));
            if (!seat) return error(connection, 'Your reserved place has expired. Join again with the court code.', 'RECONNECT_EXPIRED');
            return attach(connection, room, seat);
          }
          return addSeat(connection, room);
        }
        const { room, seat } = connection;
        if (!room || !seat) return error(connection, 'Create or join a court first.', 'NO_ROOM');
        room.lastActive = now();
        if (message.type === 'input') {
          if (!room.started || !take(connection.inputLimit, 65, 80, now())) return;
          if (!Number.isSafeInteger(message.seq) || message.seq < 0 || message.seq <= connection.lastSequence || message.seq > 0x7fffffff) return;
          const input = normalizeInput(message.input);
          if (!input) return error(connection, 'Movement must contain finite numbers.', 'INVALID_INPUT');
          connection.lastSequence = message.seq; seat.lastInputAt = now();
          // Neutral updates still prove connectivity while a match is paused.
          if (!room.paused) { seat.input = input; seat.inputAt = now(); }
          return;
        }
        if (!take(connection.actionLimit, 10, 16, now())) return error(connection, 'Wait a moment before trying again.', 'RATE_LIMITED');
        if (message.type === 'leave') { detach(connection, true); return send(connection, { type: 'left' }); }
        if (message.type === 'sync') return send(connection, packet(room));
        if (message.type === 'start' || message.type === 'rematch') {
          if (seat.index !== 0) return error(connection, 'Player 1 starts the match.', 'HOST_ONLY');
          if (!bothConnected(room)) return error(connection, 'Both players must be connected before starting.', 'NEED_TWO_PLAYERS');
          if (message.type === 'start' && room.started) return error(connection, 'This match has already started. Choose Ready to resume.', 'ALREADY_STARTED');
          if (message.type === 'rematch' && !room.started) return error(connection, 'Start a match first.');
          if (message.type === 'rematch') {
            room.game = sim.createMatch({ mode: room.mode, difficulty: room.difficulty,
              target: room.target, seed: randomInt(1, 0x7fffffff), assist: true });
            room.tick = 0;
          }
          room.started = true; room.paused = false; room.reason = '';
          for (const member of room.seats.values()) { member.ready = true; member.lastInputAt = now(); clearInput(member); }
          broadcast(room, lobby(room)); return broadcastState(room, 'started');
        }
        if (message.type === 'pause' || message.type === 'ready' && message.ready !== true) {
          if (room.started) pause(room, 'Paused. Both players must choose Ready to resume.');
          else { seat.ready = false; broadcast(room, lobby(room)); }
          return;
        }
        if (message.type === 'ready') {
          seat.ready = true; seat.lastInputAt = now();
          if (room.started && room.paused && bothConnected(room) && [...room.seats.values()].every(member => member.ready)) {
            room.paused = false; room.reason = '';
            for (const member of room.seats.values()) { member.lastInputAt = now(); clearInput(member); }
            broadcastState(room);
          }
          broadcast(room, lobby(room)); return;
        }
        error(connection, 'Unknown game message.', 'UNKNOWN_MESSAGE');
      } catch (failure) {
        console.error('Pocket Volleyball command failure:', failure?.message || failure);
        error(connection, 'That action could not be completed. Try again.', 'ACTION_FAILED');
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const at = now(), ip = request.socket.remoteAddress || 'unknown';
    let rate = ipLimits.get(ip);
    if (!rate) {
      if (ipLimits.size >= 2000) ipLimits.delete(ipLimits.keys().next().value);
      rate = bucket(16, at); ipLimits.set(ip, rate);
    }
    let pathname; try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { pathname = ''; }
    if (closed || pathname !== '/ws' || !originAllowed(request) || connections.size >= maxConnections || !take(rate, 1, 16, at)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  if (automaticTicks) {
    simulationTimer = setInterval(() => {
      const at = now(); accumulator += Math.min(Math.max((at - lastTick) / 1000, 0), 0.1); lastTick = at;
      let count = 0;
      while (accumulator >= STEP && count < 6) { tick(STEP); accumulator -= STEP; count++; }
      if (count === 6) accumulator = 0;
    }, 1000 / 60);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const requestedPort = value('--port'), requestedHost = value('--host');
  if (args.includes('--port') && (requestedPort === undefined || !Number.isInteger(Number(requestedPort))
    || Number(requestedPort) < 0 || Number(requestedPort) > 65535)) throw new Error('--port requires a number from 0 to 65535.');
  if (args.includes('--host') && (!requestedHost || requestedHost.startsWith('--'))) throw new Error('--host requires a hostname.');
  const app = createServer({ ...(requestedPort !== undefined ? { port: Number(requestedPort) } : {}),
    ...(requestedHost ? { host: requestedHost } : {}) });
  const address = await app.listen();
  console.log(`Pocket Volleyball listening on ${address.address}:${address.port}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
