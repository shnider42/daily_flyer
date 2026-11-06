import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from './vendor/ws/wrapper.mjs';

export const PROTOCOL_VERSION = 1;
const ROOT = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MESSAGE_BYTES = 64 * 1024;
const ACTIONS = new Set(['fire', 'missile', 'payload', 'countermeasure', 'radar', 'target', 'abort']);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'
};

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 192 * 1024) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}
function cleanName(value) {
  if (typeof value !== 'string') return 'Pilot';
  return [...value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()].slice(0, 24).join('') || 'Pilot';
}
function cleanAction(value) {
  if (typeof value === 'string') return ACTIONS.has(value) ? value : null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ACTIONS.has(value.name)) return null;
  const result = { name: value.name };
  if (value.targetId !== undefined && value.targetId !== null) {
    if (typeof value.targetId !== 'string' || !/^[a-z0-9_.:-]{1,80}$/i.test(value.targetId)) return null;
    result.targetId = value.targetId;
  }
  return result;
}
function validSequence(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff; }
function validToken(a, b) {
  if (typeof a !== 'string' || !/^[0-9a-f]{48}$/.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function take(bucket, rate, burst, now) {
  bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.at) * rate / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
function bucket(tokens, now) { return { tokens, at: now }; }
const finiteRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Relay only a bounded, known plane shape. Identity always comes from the connection. */
export function cleanPose(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ranges = {
    x: [-2e6, 2e6], y: [-1000, 100000], z: [-2e6, 2e6],
    heading: [-1e6, 1e6], pitch: [-1e6, 1e6], roll: [-1e6, 1e6],
    speed: [0, 1800], throttle: [0, 1], health: [0, 10000], fuel: [0, 10000],
    verticalSpeed: [-1800, 1800], startupStep: [0, 16], ammo: [0, 100000],
    missiles: [0, 10000], bombs: [0, 10000]
  };
  const result = {};
  for (const key of ['x', 'y', 'z', 'heading', 'pitch', 'roll', 'speed']) {
    if (!finiteRange(value[key], ...ranges[key])) return null;
  }
  for (const [key, range] of Object.entries(ranges)) {
    if (value[key] === undefined) continue;
    if (!finiteRange(value[key], ...range)) return null;
    result[key] = ['heading', 'pitch', 'roll'].includes(key) ? wrap(value[key]) : value[key];
  }
  for (const key of ['engine', 'onGround', 'stalled', 'gear', 'flaps']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
    else if (['gear', 'flaps'].includes(key) && finiteRange(value[key], 0, 1)) result[key] = value[key];
  }
  if (typeof value.aircraft === 'string' && /^[a-z0-9_-]{1,48}$/i.test(value.aircraft)) result.aircraft = value.aircraft;
  return result;
}

// Worlds are authored by the host. Bounds protect the relay and other browsers;
// they do not make the host's simulation cheat resistant.
function validWorld(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  let remaining = 6000;
  function visit(node, depth) {
    if (--remaining < 0 || depth > 8) return false;
    if (node === null || typeof node === 'boolean') return true;
    if (typeof node === 'number') return Number.isFinite(node) && Math.abs(node) <= 1e9;
    if (typeof node === 'string') return node.length <= 2048;
    if (Array.isArray(node)) return node.length <= 512 && node.every(v => visit(v, depth + 1));
    if (typeof node !== 'object') return false;
    const keys = Object.keys(node);
    return keys.length <= 80 && keys.every(key => key.length <= 64 && !['__proto__', 'constructor', 'prototype'].includes(key) && visit(node[key], depth + 1));
  }
  return visit(value, 0);
}

/** A real, bounded in-memory relay. Returned close() makes integration tests clean. */
export async function createSkywardServer(options = {}) {
  const roomTtlMs = options.roomTtlMs ?? 90 * 60 * 1000;
  const reconnectGraceMs = options.reconnectGraceMs ?? 20000;
  const staleSocketMs = options.staleSocketMs ?? 15000;
  const maxRooms = options.maxRooms ?? 100;
  const maxConnections = options.maxConnections ?? 480;
  const tickMs = options.tickMs ?? 1000;
  let missionIds = options.missionIds ? new Set(options.missionIds) : null;
  if (!missionIds) {
    try { const { MISSIONS } = await import('./public/campaign.mjs'); missionIds = new Set(MISSIONS.map(m => m.id)); }
    catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  }
  const rooms = new Map();
  const connections = new Set();
  const attempts = new Map();
  const validMission = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && (!missionIds || missionIds.has(id));

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-cache');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end('Bad request'); return; }
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', service: 'skyward', protocol: PROTOCOL_VERSION, rooms: rooms.size, connections: connections.size, persistence: 'memory' }));
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('Bad path'); return; }
    const filePath = resolve(ROOT, `.${path === '/' ? '/index.html' : path}`);
    if (!filePath.startsWith(ROOT + sep) || !CONTENT_TYPES[extname(filePath).toLowerCase()]) { res.writeHead(404).end('Not found'); return; }
    try {
      const file = await stat(filePath);
      if (!file.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()], 'Content-Length': file.size });
      if (req.method === 'HEAD') res.end();
      else createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

  function error(socket, code, message) { send(socket, { type: 'error', code, message }); }
  function broadcast(room, message, except = null) {
    for (const player of room.players.values()) if (player.id !== except) send(player.socket, message);
  }
  function roster(room) {
    broadcast(room, {
      type: 'roster', code: room.code, hostId: room.hostId, missionId: room.missionId,
      state: room.paused ? 'paused' : room.phase,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, isHost: p.id === room.hostId, ready: p.ready, connected: !!p.socket }))
    });
  }
  function issueSession(room, player) {
    send(player.socket, {
      type: 'session', code: room.code, id: player.id, token: player.token,
      isHost: player.id === room.hostId, missionId: room.missionId,
      state: room.paused ? 'paused' : room.phase, reconnectGraceMs,
      poseSeq: player.poseSeq, worldSeq: room.worldSeq
    });
  }
  function startMessage(room, resumed = false) {
    return { type: 'start', missionId: room.missionId, seed: room.seed, runId: room.runId, resumed };
  }
  function endRoom(room, message) {
    if (!rooms.has(room.code)) return;
    rooms.delete(room.code);
    for (const p of room.players.values()) {
      if (p.socket) {
        p.socket.session = null;
        send(p.socket, { type: 'end', message });
        p.socket.close(1000, 'Room ended');
      }
    }
    room.players.clear();
  }
  function addPlayer(room, socket, name, isHost = false) {
    const now = Date.now();
    const player = {
      id: randomBytes(9).toString('hex'), token: randomBytes(24).toString('hex'), name: cleanName(name),
      ready: isHost, socket, disconnectedAt: 0, pose: null, poseSeq: -1, poseAt: 0,
      poseBucket: bucket(2, now), actionBucket: bucket(4, now)
    };
    room.players.set(player.id, player);
    if (isHost) room.hostId = player.id;
    socket.session = { room, player };
    issueSession(room, player);
    roster(room);
  }
  function depart(socket, explicit = false) {
    const session = socket.session;
    socket.session = null;
    if (!session || session.player.socket !== socket || !rooms.has(session.room.code)) return;
    const { room, player } = session;
    player.socket = null;
    player.disconnectedAt = Date.now();
    if (player.id === room.hostId) {
      if (explicit) { endRoom(room, 'The host ended this squadron. Create a new room to fly again.'); return; }
      room.paused = true;
      broadcast(room, { type: 'pause', message: `Host disconnected. Flight paused for up to ${Math.round(reconnectGraceMs / 1000)} seconds while they reconnect.`, reason: 'host-disconnected' });
    } else if (explicit) room.players.delete(player.id);
    roster(room);
  }
  function requireFlight(socket) {
    const s = socket.session;
    if (!s || s.room.phase !== 'flying') { error(socket, 'not_flying', 'The host must start the mission first.'); return null; }
    if (s.room.paused) { error(socket, 'host_reconnecting', 'Flight is paused while the host reconnects.'); return null; }
    return s;
  }

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (pathname !== '/ws' || connections.size >= maxConnections) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return;
    }
    // Browsers always send Origin. Match the requested host, including its port.
    // Requests without Origin are useful to native/test clients; room tokens are still required to resume.
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { socket.destroy(); return; }
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host.toLowerCase() !== String(req.headers.host).toLowerCase()) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
      }
    }
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const limit = attempts.get(ip) || bucket(40, now);
    attempts.set(ip, limit);
    if (!take(limit, 0.5, 40, now)) { socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', socket => {
    const now = Date.now();
    connections.add(socket);
    socket.lastSeen = now;
    socket.acceptedAt = now;
    socket.handshaken = false;
    socket.session = null;
    socket.messageBucket = bucket(70, now);
    socket.lobbyBucket = bucket(8, now);
    socket.violations = 0;
    send(socket, { type: 'hello', version: PROTOCOL_VERSION, time: now, maxPlayers: 4 });
    socket.on('pong', () => { socket.lastSeen = Date.now(); });
    socket.on('error', () => {});
    socket.on('message', (bytes, isBinary) => {
      const now = Date.now();
      socket.lastSeen = now;
      if (isBinary || !take(socket.messageBucket, 45, 70, now)) { socket.close(1008, 'Message rate exceeded'); return; }
      let msg;
      try { msg = JSON.parse(bytes.toString()); } catch { error(socket, 'bad_json', 'Could not read that message.'); return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return;
      if (!socket.handshaken) {
        if (msg.type !== 'hello' || msg.version !== PROTOCOL_VERSION) {
          error(socket, 'version_mismatch', 'Your game version is out of date. Reload before joining.');
          socket.close(1008, 'Protocol version mismatch');
          return;
        }
        socket.handshaken = true;
        send(socket, { type: 'welcome', version: PROTOCOL_VERSION, time: now });
        return;
      }
      if (msg.type === 'ping') { if (Number.isSafeInteger(msg.nonce)) send(socket, { type: 'pong', nonce: msg.nonce, time: now }); return; }
      if (['create', 'join', 'resume', 'ready', 'start', 'leave'].includes(msg.type) && !take(socket.lobbyBucket, 1, 8, now)) {
        error(socket, 'slow_down', 'Please wait a moment before another lobby action.'); return;
      }
      if (['create', 'join', 'resume'].includes(msg.type) && socket.session) {
        error(socket, 'already_in_room', 'Leave your current squadron first.'); return;
      }
      if (msg.type === 'create') {
        if (rooms.size >= maxRooms) { error(socket, 'server_full', 'The hangar is full. Please try again shortly.'); return; }
        if (!validMission(msg.missionId)) { error(socket, 'bad_mission', 'Choose a mission from the campaign.'); return; }
        let code;
        do { code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
        const room = { code, hostId: null, players: new Map(), createdAt: now, phase: 'lobby', paused: false, missionId: msg.missionId, seed: 0, runId: null, worldSeq: -1, world: null, worldBucket: bucket(2, now), lastStart: 0 };
        rooms.set(code, room);
        addPlayer(room, socket, msg.name, true);
        return;
      }
      if (msg.type === 'join') {
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        const room = rooms.get(code);
        if (!room) { error(socket, 'room_missing', 'No squadron has that code. Check the six characters with your host.'); return; }
        if (room.phase !== 'lobby') { error(socket, 'flight_in_progress', 'That squadron is already flying. Ask the host to create a fresh room for you.'); return; }
        if (room.paused) { error(socket, 'host_reconnecting', 'The host is reconnecting. Try again in a moment.'); return; }
        if (room.players.size >= 4) { error(socket, 'room_full', 'That squadron already has four pilots.'); return; }
        addPlayer(room, socket, msg.name);
        return;
      }
      if (msg.type === 'resume') {
        const room = typeof msg.code === 'string' ? rooms.get(msg.code) : null;
        const p = room?.players.get(msg.playerId);
        if (!p || !validToken(msg.token, p.token) || (p.disconnectedAt && now - p.disconnectedAt > reconnectGraceMs)) {
          error(socket, 'resume_denied', 'This flight session has expired. Join or create a new squadron.');
          socket.close(1008, 'Session expired'); return;
        }
        const oldSocket = p.socket;
        p.socket = socket;
        p.disconnectedAt = 0;
        socket.session = { room, player: p };
        if (oldSocket && oldSocket !== socket) {
          oldSocket.session = null;
          send(oldSocket, { type: 'replaced', message: 'This pilot reconnected in another tab. This tab has left the squadron.' });
          oldSocket.close(4001, 'Session replaced');
        }
        const wasPaused = room.paused;
        if (p.id === room.hostId) room.paused = false;
        issueSession(room, p);
        if (room.phase === 'flying') {
          send(socket, startMessage(room, true));
          if (room.world) send(socket, { type: 'world', snapshot: room.world, seq: room.worldSeq, at: now });
          for (const other of room.players.values()) if (other.id !== p.id && other.pose) send(socket, { type: 'pose', playerId: other.id, player: other.pose, seq: other.poseSeq, at: other.poseAt });
        }
        if (wasPaused && !room.paused) broadcast(room, { type: 'resume-play', message: 'Host reconnected. The squadron can continue.', state: room.phase });
        roster(room);
        return;
      }
      if (!socket.session) { error(socket, 'no_room', 'Create or join a squadron first.'); return; }
      const { room, player } = socket.session;
      if (msg.type === 'leave') { depart(socket, true); send(socket, { type: 'left' }); socket.close(1000, 'Left room'); return; }
      if (msg.type === 'ready') {
        if (typeof msg.ready !== 'boolean') return;
        player.ready = player.id === room.hostId ? true : msg.ready;
        roster(room); return;
      }
      if (msg.type === 'start') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can choose and start a mission.'); return; }
        if (room.paused) return;
        if (!validMission(msg.missionId)) { error(socket, 'bad_mission', 'Choose a mission from the campaign.'); return; }
        const present = [...room.players.values()].filter(p => p.socket);
        if (present.length < 2) { error(socket, 'need_wingmate', 'A squadron needs at least two connected pilots. Invite a wingmate or fly solo from the campaign.'); return; }
        if (present.some(p => !p.ready)) { error(socket, 'not_ready', 'Wait until every connected wingmate is ready.'); return; }
        if (now - room.lastStart < 1000) { error(socket, 'slow_down', 'Please wait a moment before restarting.'); return; }
        room.phase = 'flying'; room.missionId = msg.missionId; room.seed = randomInt(0x7fffffff); room.runId = randomBytes(8).toString('hex');
        room.world = null; room.worldSeq = -1; room.worldBucket = bucket(2, now); room.lastStart = now;
        for (const p of room.players.values()) { p.pose = null; p.poseSeq = -1; p.poseBucket = bucket(2, now); }
        broadcast(room, startMessage(room)); roster(room); return;
      }
      if (msg.type === 'pose') {
        if (!requireFlight(socket)) return;
        if (!validSequence(msg.seq) || msg.seq <= player.poseSeq) { error(socket, 'stale_sequence', 'An old plane update was ignored.'); return; }
        const pose = cleanPose(msg.player);
        if (!pose) { error(socket, 'bad_pose', 'An invalid plane update was ignored.'); return; }
        if (!take(player.poseBucket, 15, 2, now)) return;
        player.poseSeq = msg.seq; player.pose = pose; player.poseAt = now;
        broadcast(room, { type: 'pose', playerId: player.id, player: pose, seq: msg.seq, at: now }, player.id);
        return;
      }
      if (msg.type === 'world') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can update the mission world.'); return; }
        if (!requireFlight(socket)) return;
        if (!validSequence(msg.seq) || msg.seq <= room.worldSeq) { error(socket, 'stale_sequence', 'An old world update was ignored.'); return; }
        if (!validWorld(msg.snapshot)) { error(socket, 'bad_world', 'The mission update exceeded safe bounds.'); return; }
        if (!take(room.worldBucket, 10, 2, now)) return;
        room.world = msg.snapshot; room.worldSeq = msg.seq;
        broadcast(room, { type: 'world', snapshot: msg.snapshot, seq: msg.seq, at: now }, player.id);
        return;
      }
      if (msg.type === 'action') {
        if (!requireFlight(socket)) return;
        if (player.id === room.hostId) return;
        const action = cleanAction(msg.action);
        if (!action || !player.pose) { error(socket, 'bad_action', 'That action needs a current plane position.'); return; }
        if (!take(player.actionBucket, 10, 4, now)) return;
        send(room.players.get(room.hostId)?.socket, { type: 'action', action, playerId: player.id, player: { ...player.pose, id: player.id, playerId: player.id, name: player.name } });
      }
    });
    socket.on('close', () => { connections.delete(socket); depart(socket); });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const socket of connections) {
      if ((!socket.handshaken && now - socket.acceptedAt > 5000) || (!socket.session && now - socket.acceptedAt > 20000) || now - socket.lastSeen > staleSocketMs) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
    for (const room of rooms.values()) {
      if (now - room.createdAt > roomTtlMs) { endRoom(room, 'This squadron reached its 90-minute session limit. Create a new room to continue.'); continue; }
      for (const p of room.players.values()) {
        if (!p.socket && now - p.disconnectedAt > reconnectGraceMs) {
          if (p.id === room.hostId) { endRoom(room, 'The host could not reconnect. This flight has ended; create a new squadron to continue.'); break; }
          room.players.delete(p.id); roster(room);
        }
      }
    }
    for (const [ip, limit] of attempts) if (now - limit.at > 5 * 60 * 1000) attempts.delete(ip);
  }, tickMs);
  cleanup.unref();
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? Number(process.env.PORT || 3000), options.host ?? '0.0.0.0', resolveListening);
  });
  return {
    server, rooms, wss, port: server.address().port,
    async close() {
      clearInterval(cleanup);
      for (const socket of connections) socket.terminate();
      await new Promise(resolveClose => wss.close(resolveClose));
      await new Promise(resolveClose => server.close(resolveClose));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Preview runners pass Vite-style flags through npm. An explicit --port wins
  // over PORT; the relay already fails on busy ports (--strictPort behavior).
  const args = process.argv.slice(2);
  const flag = args.findIndex(arg => arg === '--port' || arg.startsWith('--port='));
  const rawPort = flag >= 0 ? (args[flag] === '--port' ? args[flag + 1] : args[flag].slice(7)) : (process.env.PORT || '3000');
  const port = Number(rawPort);
  if (!/^\d+$/.test(String(rawPort)) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    console.error('SKYWARD: --port or PORT must be an integer from 1 to 65535.');
    process.exit(1);
  }
  const app = await createSkywardServer({ port });
  console.log(`SKYWARD listening on http://0.0.0.0:${app.port}`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
