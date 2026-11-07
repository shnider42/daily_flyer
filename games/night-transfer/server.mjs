import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from './vendor/ws/wrapper.mjs';
import * as world from './public/world.mjs';
const { VERSION, newGame, reduce } = world;

function accessibleRooms(state) {
  return typeof world.availableRooms === 'function' ? world.availableRooms(state) : [];
}
function roomBounds(room) {
  const width = Number(room.width ?? room.w ?? room.size?.[0]);
  const depth = Number(room.depth ?? room.d ?? room.size?.[1]);
  return {
    x: Number.isFinite(width) && width > 0 ? Math.min(width / 2, 100) : 100,
    z: Number.isFinite(depth) && depth > 0 ? Math.min(depth / 2, 100) : 100,
  };
}

export const PROTOCOL = 1;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codePattern = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const safeName = name => typeof name === 'string'
  ? name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || 'Inmate'
  : 'Inmate';
const sameToken = (a, b) => typeof b === 'string' && /^[A-Za-z0-9_-]{32}$/.test(b)
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** A single process owns each team's puzzle state. Clients can request actions only. */
export function createNightTransferServer({
  directory = fileURLToPath(new URL('./public/', import.meta.url)),
  now = Date.now, makeGame = newGame, reducer = reduce, listRooms = accessibleRooms,
  maxRooms = 48, reconnectMs = 90_000, idleMs = 3_600_000, maxLifeMs = 21_600_000,
} = {}) {
  directory = resolve(directory);
  const rooms = new Map(), connections = new Set(), upgradeWindows = new Map();
  const allowedOrigins = new Set((process.env.NIGHT_TRANSFER_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
  let stopping = false;

  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end('Invalid request'); return; }
    if (pathname === '/health') {
      response.writeHead(stopping ? 503 : 200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? '' : JSON.stringify({
        status: stopping ? 'stopping' : 'ready', game: 'NIGHT TRANSFER', version: VERSION,
        protocol: PROTOCOL, maxPlayers: 4, rooms: rooms.size,
      }));
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const path = resolve(directory, '.' + pathname);
    if (!path.startsWith(directory + sep) || pathname.includes('\0') || pathname.split('/').some(p => p.startsWith('.'))) {
      response.writeHead(404); response.end('Not found'); return;
    }
    try {
      if (!(await stat(path)).isFile()) throw Error('Not a file');
      const body = await readFile(path);
      response.writeHead(200, {
        'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
        'Content-Length': body.length, 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
  });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const send = (peer, packet) => {
    if (peer.ws.readyState !== WebSocket.OPEN) return;
    if (peer.ws.bufferedAmount > 131_072) { peer.ws.close(1013, 'Connection too slow'); return; }
    peer.ws.send(JSON.stringify(packet), error => { if (error) peer.ws.terminate(); });
  };
  const fail = (peer, code, message) => send(peer, { type: 'error', code, message });
  const roster = room => [...room.players.values()].map(p => ({
    id: p.id, name: p.name, slot: p.slot, connected: !!p.peer, room: p.room,
  }));
  const broadcast = (room, packet) => { for (const player of room.players.values()) if (player.peer) send(player.peer, packet); };
  const poses = room => [...room.players.values()].filter(p => p.peer && p.pose).map(p => ({ id: p.id, ...p.pose }));
  const publishRoster = room => {
    broadcast(room, { type: 'roster', roomCode: room.code, roster: roster(room) });
    room.posesDirty = true;
  };
  const definition = (room, id) => listRooms(room.state).find(r => (typeof r === 'string' ? r : r.id) === id);
  const firstRoom = room => { const first = listRooms(room.state)[0]; return typeof first === 'string' ? first : first?.id || ''; };
  const sanitizeLocations = room => {
    let changed = false;
    for (const player of room.players.values()) if (!definition(room, player.room)) {
      player.room = firstRoom(room); player.pose = null; player.lastPoseAt = -Infinity; changed = true;
    }
    if (changed) publishRoster(room);
  };
  const statePacket = (room, extra = {}) => ({
    type: 'state', roomCode: room.code, revision: room.revision,
    state: room.state, serverTime: now(), ...extra,
  });
  const expirePlayers = room => {
    let changed = false;
    for (const [id, player] of room.players) {
      if (!player.peer && player.disconnectedAt !== null && now() - player.disconnectedAt >= reconnectMs) {
        room.players.delete(id); changed = true;
      }
    }
    if (changed) publishRoster(room);
  };
  const terminateRoom = (room, code, message) => {
    for (const player of room.players.values()) {
      if (!player.peer) continue;
      fail(player.peer, code, message);
      player.peer.session = null;
      player.peer.ws.close(4004, message.slice(0, 100));
    }
    rooms.delete(room.code);
  };
  const collect = () => {
    for (const room of rooms.values()) {
      expirePlayers(room);
      if (!room.players.size) { rooms.delete(room.code); continue; }
      if (now() - room.lastActivity >= idleMs || now() - room.createdAt >= maxLifeMs) {
        terminateRoom(room, 'ROOM_EXPIRED', 'This team session expired. Create a fresh escape.');
      }
    }
  };

  function hello(peer, message) {
    if (message.protocol !== PROTOCOL || message.version !== VERSION) {
      fail(peer, 'VERSION_MISMATCH', 'The game has been updated. Reload every device, then join again.'); return;
    }
    if (peer.session) { fail(peer, 'ALREADY_JOINED', 'You are already in a team.'); return; }
    let room;
    if (message.create === true) {
      if (message.campaign !== undefined && !['escape', 'annex'].includes(message.campaign)) {
        fail(peer, 'INVALID_CAMPAIGN', 'Choose the original escape or Dead Air.'); return;
      }
      collect();
      if (rooms.size >= maxRooms) { fail(peer, 'ROOM_CAPACITY', 'All team rooms are occupied. Try again shortly.'); return; }
      let code;
      do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); } while (rooms.has(code));
      room = { code, state: makeGame({ now: now(), campaign: message.campaign === 'annex' ? 'annex' : 'escape', seed: randomInt(1, 0x7fffffff) }), revision: 0, players: new Map(), posesDirty: false, createdAt: now(), lastActivity: now() };
      rooms.set(code, room);
    } else {
      const code = typeof message.code === 'string' ? message.code.toUpperCase().trim() : '';
      room = codePattern.test(code) ? rooms.get(code) : undefined;
      if (!room) { fail(peer, 'ROOM_NOT_FOUND', 'Team code not found. The host may need to create a new escape.'); return; }
      expirePlayers(room);
    }
    let player;
    if (message.token !== undefined && message.token !== null) {
      player = [...room.players.values()].find(p => sameToken(p.token, message.token));
      if (!player) { fail(peer, 'INVALID_TOKEN', 'Your reserved place expired. Join the team again with its code.'); return; }
    } else {
      if (room.players.size >= 4) { fail(peer, 'ROOM_FULL', 'This team already has four players.'); return; }
      const usedSlots = new Set([...room.players.values()].map(p => p.slot));
      player = {
        id: randomBytes(8).toString('hex'), token: randomBytes(24).toString('base64url'),
        name: safeName(message.name), slot: [1, 2, 3, 4].find(n => !usedSlots.has(n)),
        room: firstRoom(room), pose: null, lastPoseAt: -Infinity, peer: null, disconnectedAt: null, actions: new Map(),
      };
      room.players.set(player.id, player);
    }
    if (player.peer) {
      const previous = player.peer;
      previous.session = null;
      previous.ws.close(4001, 'Your place reconnected in another tab');
    }
    player.peer = peer; player.disconnectedAt = null; player.lastPoseAt = -Infinity;
    peer.session = { room, player }; room.lastActivity = now();
    clearTimeout(peer.handshake);
    send(peer, {
      type: 'welcome', protocol: PROTOCOL, version: VERSION, roomCode: room.code,
      playerId: player.id, token: player.token, name: player.name, maxPlayers: 4,
      state: room.state, revision: room.revision, roster: roster(room), poses: poses(room), serverTime: now(),
    });
    publishRoster(room);
  }

  function handle(peer, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return fail(peer, 'BAD_MESSAGE', 'Invalid room message.');
    if (message.type === 'ping') return send(peer, { type: 'pong', at: Number.isFinite(message.at) ? message.at : 0, serverTime: now() });
    if (message.type === 'hello') return hello(peer, message);
    const session = peer.session;
    if (!session || session.player.peer !== peer) return;
    const { room, player } = session;
    if (message.type === 'leave') {
      room.players.delete(player.id); peer.session = null;
      if (room.players.size) publishRoster(room); else rooms.delete(room.code);
      return;
    }
    if (message.type === 'presence') {
      const source = message.pose && typeof message.pose === 'object' && !Array.isArray(message.pose) ? message.pose : message;
      if (typeof source.room !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(source.room)) return;
      const target = definition(room, source.room);
      if (!target) return;
      const hasPose = source.x !== undefined || source.z !== undefined || source.yaw !== undefined;
      let pose = null;
      if (hasPose) {
        if (![source.x, source.z, source.yaw].every(Number.isFinite) || typeof source.crouch !== 'boolean') return;
        const bounds = roomBounds(target);
        if (Math.abs(source.x) > bounds.x || Math.abs(source.z) > bounds.z || Math.abs(source.yaw) > 1_000_000) return;
        pose = {
          room: source.room, x: Math.round(source.x * 1000) / 1000, z: Math.round(source.z * 1000) / 1000,
          yaw: Math.atan2(Math.sin(source.yaw), Math.cos(source.yaw)), crouch: source.crouch, serverTime: now(),
        };
      }
      if (now() - player.lastPoseAt < 100) return;
      player.lastPoseAt = now();
      const movedRoom = player.room !== source.room;
      if (movedRoom) { player.room = source.room; player.pose = null; publishRoster(room); }
      if (pose) { player.pose = pose; room.posesDirty = true; }
      room.lastActivity = now();
      return;
    }
    if (message.type !== 'action') return fail(peer, 'BAD_ACTION', 'That room command is not supported.');
    const { actionId, action } = message;
    if (typeof actionId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(actionId)
      || !action || typeof action !== 'object' || Array.isArray(action)) {
      return fail(peer, 'BAD_ACTION', 'Invalid interaction.');
    }
    if (player.actions.has(actionId)) { send(peer, player.actions.get(actionId)); return; }
    // No client may replace state or restart a shared campaign through this endpoint.
    let result;
    if (['restart', 'reset', 'newGame', 'load', 'restore'].includes(action.type)) {
      result = { ok: false, message: 'Leave this team and create a new one to start another escape.' };
    } else {
      try { result = reducer(structuredClone(room.state), action, { now: now(), server: true, playerId: player.id, playerRoom: player.room }); }
      catch { result = { ok: false, message: 'That interaction could not be completed. Try again.' }; }
    }
    if (!result || typeof result.ok !== 'boolean') result = { ok: false, message: 'That interaction is not available.' };
    if (result.ok && result.changed !== false && result.state && typeof result.state === 'object') {
      room.state = result.state; room.revision++; room.lastActivity = now();
      sanitizeLocations(room);
      broadcast(room, statePacket(room, { actorId: player.id, event: result.event, message: result.message }));
    }
    // Door acknowledgements move the authoritative room before the next action.
    // Presence is intentionally throttled and must not delay a legitimate crossing.
    if (result.ok && result.event?.type === 'room' && definition(room, result.event.room)
      && player.room !== result.event.room) {
      player.room = result.event.room; player.pose = null; player.lastPoseAt = -Infinity;
      room.lastActivity = now(); publishRoster(room);
    }
    const reply = {
      type: 'action-result', actionId, ok: result.ok, message: result.message || '',
      event: result.event, revision: room.revision, serverTime: now(),
    };
    player.actions.set(actionId, reply);
    if (player.actions.size > 256) player.actions.delete(player.actions.keys().next().value);
    send(peer, reply);
  }

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    const origin = request.headers.origin;
    let ownOrigin = false;
    try { ownOrigin = !!origin && new URL(origin).host === request.headers.host; } catch { /* Reject malformed origins. */ }
    const ip = request.socket.remoteAddress || 'unknown';
    const previous = upgradeWindows.get(ip);
    const record = previous && now() - previous.at < 60_000 ? previous : { at: now(), count: 0 };
    record.count++; upgradeWindows.set(ip, record);
    if (stopping || pathname !== '/ws' || (origin && !ownOrigin && !allowedOrigins.has(origin))
      || record.count > 120 || connections.size >= 256) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
  });

  sockets.on('connection', ws => {
    const peer = { ws, session: null, alive: true, handshake: null };
    connections.add(peer);
    peer.handshake = setTimeout(() => { if (!peer.session) ws.close(1008, 'Join a team to continue'); }, 20_000);
    peer.handshake.unref();
    let tokens = 60, lastRefill = now();
    ws.on('pong', () => { peer.alive = true; });
    ws.on('error', () => {});
    ws.on('message', (data, binary) => {
      tokens = Math.min(60, tokens + (now() - lastRefill) * .02); lastRefill = now();
      if (--tokens < 0 || binary) { ws.close(1008, 'Unsupported message rate or format'); return; }
      let message;
      try { message = JSON.parse(data.toString()); } catch { fail(peer, 'BAD_MESSAGE', 'Room messages must be valid JSON.'); return; }
      try { handle(peer, message); } catch { fail(peer, 'ROOM_ERROR', 'The team could not complete that action. Reconnect and try again.'); }
    });
    ws.on('close', () => {
      clearTimeout(peer.handshake); connections.delete(peer);
      const session = peer.session;
      if (!session || session.player.peer !== peer) return;
      session.player.peer = null; session.player.disconnectedAt = now();
      publishRoster(session.room);
    });
  });

  const poseTimer = setInterval(() => {
    for (const room of rooms.values()) if (room.posesDirty) {
      room.posesDirty = false;
      broadcast(room, { type: 'poses', roomCode: room.code, poses: poses(room), serverTime: now() });
    }
  }, 100); poseTimer.unref();
  const cleanupTimer = setInterval(collect, 10_000); cleanupTimer.unref();
  const heartbeatTimer = setInterval(() => {
    for (const peer of connections) {
      if (!peer.alive) { peer.ws.terminate(); continue; }
      peer.alive = false; peer.ws.ping();
    }
    for (const [ip, record] of upgradeWindows) if (now() - record.at >= 60_000) upgradeWindows.delete(ip);
  }, 15_000); heartbeatTimer.unref();

  async function close() {
    if (stopping) return;
    stopping = true; clearInterval(cleanupTimer); clearInterval(heartbeatTimer); clearInterval(poseTimer);
    for (const room of rooms.values()) terminateRoom(room, 'SERVER_RESTART', 'The game service restarted. Create a new team escape.');
    for (const peer of connections) { clearTimeout(peer.handshake); peer.ws.terminate(); }
    await new Promise(done => sockets.close(done));
    await new Promise(done => server.listening ? server.close(done) : done());
  }
  return { server, sockets, rooms, collect, close };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const app = createNightTransferServer();
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : (process.env.PORT || 3000));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Use a valid PORT or --port number.');
  app.server.listen(port, '0.0.0.0', () => console.log(`NIGHT TRANSFER ${VERSION} ready on ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(0), 5000); deadline.unref();
    app.close().then(() => process.exit(0));
  });
}
