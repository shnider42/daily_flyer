import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from './vendor/ws/wrapper.mjs';
import { GUNSHIP_SEATS, GUNSHIP_AIM_LIMITS } from './public/gunship.mjs';
import { AIRCRAFT, MISSIONS, SPECIAL_MISSIONS } from './public/campaign.mjs';
import { getNuclearPayload, normalizePayload } from './public/payloads.mjs';
import { ROOM_MODES, ROUND_DURATIONS, ARENA_MAPS, isDogfightMode, usesRoomMap,
  requiresFourPilots, roomMapMissionId } from './public/arena.mjs';

export const PROTOCOL_VERSION = 1;
const ROOT = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MESSAGE_BYTES = 64 * 1024;
const ACTIONS = new Set(['fire', 'missile', 'payload', 'countermeasure', 'radar', 'target', 'abort', 'bailout', 'crash', 'respawn']);
const MAP_IDS = new Set(ARENA_MAPS.map(map => map.id));
const START_MODES = new Set(['airborne', 'high', 'runway', 'carrier']);
const MISSION_LIVES = new Set([1, 3, 5]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'
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

// Crew controls contain no position, target, damage or ammunition claims. The
// pilot's simulation resolves them against its shared aircraft and weapon state.
export function cleanCrewInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!GUNSHIP_SEATS.includes(value.seat) || typeof value.fire !== 'boolean' ||
      !finiteRange(value.yaw, GUNSHIP_AIM_LIMITS.yawMin, GUNSHIP_AIM_LIMITS.yawMax) ||
      !finiteRange(value.pitch, GUNSHIP_AIM_LIMITS.pitchMin, GUNSHIP_AIM_LIMITS.pitchMax)) return null;
  return { seat: value.seat, yaw: value.yaw, pitch: value.pitch, fire: value.fire };
}

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
  for (const key of ['engine', 'onGround', 'stalled', 'gear', 'flaps', 'crashed', 'radarOn', 'hover', 'brake']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
    else if (['gear', 'flaps'].includes(key) && finiteRange(value[key], 0, 1)) result[key] = value[key];
  }
  if (typeof value.aircraft === 'string' && /^[a-z0-9_-]{1,48}$/i.test(value.aircraft)) result.aircraft = value.aircraft;
  if (value.targetId !== undefined && value.targetId !== null) {
    if (typeof value.targetId !== 'string' || !/^[a-z0-9_.:-]{1,80}$/i.test(value.targetId)) return null;
    result.targetId = value.targetId;
  } else if (value.targetId === null) result.targetId = null;
  if (value.lifeId !== undefined) {
    if (!Number.isSafeInteger(value.lifeId) || value.lifeId < 1 || value.lifeId > 1000000) return null;
    result.lifeId = value.lifeId;
  }
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
  const missions = new Map([...MISSIONS, ...SPECIAL_MISSIONS].map(m => [m.id, m]));
  const missionIds = new Set(options.missionIds || missions.keys());
  for (const map of ARENA_MAPS) {
    missionIds.add(roomMapMissionId({ mode: 'freeflight', mapId: map.id }));
    missionIds.add(roomMapMissionId({ mode: 'coop', mapId: map.id }));
  }
  const crewMissionIds = new Set(options.crewMissionIds || [...missions.values()].filter(m => m.kind === 'gunship').map(m => m.id));
  const rooms = new Map();
  const connections = new Set();
  const attempts = new Map();
  const validMission = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && (!missionIds || missionIds.has(id));
  const missionMode = id => crewMissionIds.has(id) ? 'crew'
    : id?.startsWith('coop-') ? 'coop' : id?.startsWith('arena-') ? 'freeflight' : 'squadron';
  const maxPlayers = room => room.mode === 'crew' ? 2 : 4;
  const playerRole = (room, player) => room.mode === 'crew' && player.id !== room.hostId ? 'gunner' : 'pilot';

  function configuration(missionId, value = {}, previous = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    let mode = value.mode ?? previous?.mode ?? missionMode(missionId);
    if (!ROOM_MODES.includes(mode)) return null;
    const mapId = value.mapId ?? previous?.mapId ?? (usesRoomMap(missionMode(missionId)) ? missionId.split('-')[1] : 'canyon');
    if (!MAP_IDS.has(mapId)) return null;
    const lives = value.lives ?? previous?.lives ?? 3;
    if (!MISSION_LIVES.has(lives)) return null;
    const timed = isDogfightMode(mode);
    if (value.durationSeconds !== undefined && !ROUND_DURATIONS.includes(value.durationSeconds) && !(value.durationSeconds === 0 && !timed)) return null;
    const durationSeconds = timed ? value.durationSeconds ?? (ROUND_DURATIONS.includes(previous?.durationSeconds) ? previous.durationSeconds : 600) : 0;
    if (usesRoomMap(mode)) missionId = roomMapMissionId({ mode, mapId });
    else {
      if (usesRoomMap(missionMode(missionId))) missionId = [...missionIds].find(id => missionMode(id) === 'squadron');
      if (mode === 'crew' && !crewMissionIds.has(missionId)) return null;
      mode = missionMode(missionId);
    }
    if (!validMission(missionId)) return null;
    return { missionId, mode, config: { mode, mapId, durationSeconds, lives } };
  }
  function loadout(room, value = {}, previous = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const mission = missions.get(room.missionId);
    const aircraft = value.aircraft ?? previous?.aircraft ?? (usesRoomMap(room.mode) ? 'f16' : mission?.aircraft || 'avro504');
    const startMode = value.startMode ?? previous?.startMode ?? (mission?.start?.airborne === false ? 'runway' : 'airborne');
    if (!Object.hasOwn(AIRCRAFT, aircraft) || !START_MODES.has(startMode)) return null;
    if (value.payload !== undefined && (typeof value.payload !== 'string' || value.payload !== 'conventional' && (!getNuclearPayload(value.payload) || aircraft !== 'b2'))) return null;
    let payload = normalizePayload(aircraft, value.payload ?? previous?.payload, mission?.kind === 'nuclear' ? 'atomic' : 'conventional');
    if (aircraft === 'b2' && mission?.kind === 'nuclear' && !getNuclearPayload(payload)) payload = 'atomic';
    // Carrier suitability is a warning in the UI, never an authorization check.
    return { aircraft, startMode, payload };
  }
  const acceptedLoadout = (room, player) => room.mode === 'crew' ? { aircraft: 'ac130', startMode: 'airborne', payload: 'conventional' } : { aircraft: player.aircraft, startMode: player.startMode, payload: player.payload };
  function assignedTeams(room, players) {
    if (room.mode !== 'team-dogfight') return new Map();
    if (room.runPlayers) return new Map(room.runPlayers.map(p => [p.id, p.team]));
    const wingmate = players.find(p => p.id === room.wingmateId) || players[2];
    return new Map(players.map(p => [p.id, p.id === room.hostId || p === wingmate ? 'blue' : 'red']));
  }
  function clearGuestReadiness(room) {
    for (const member of room.players.values()) if (member.id !== room.hostId) member.ready = false;
  }
  function playerList(room) {
    const players = [...room.players.values()], teams = assignedTeams(room, players);
    return players.map(p => ({ id: p.id, name: p.name, isHost: p.id === room.hostId, role: playerRole(room, p), ready: p.ready,
      connected: !!p.socket, ...acceptedLoadout(room, p), ...(teams.has(p.id) ? { team: teams.get(p.id) } : {}) }));
  }
  function configureRoom(room, next) {
    const changed = room.missionId !== next.missionId || JSON.stringify(room.config) !== JSON.stringify(next.config);
    Object.assign(room, next);
    if (changed) for (const p of room.players.values()) {
      if (!p.loadoutExplicit) Object.assign(p, loadout(room));
      else if (room.mode !== 'crew') Object.assign(p, loadout(room, {}, p));
      if (p.id !== room.hostId) p.ready = false;
    }
  }

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
      state: room.paused ? 'paused' : room.phase, mode: room.mode, config: room.config, maxPlayers: maxPlayers(room),
      players: playerList(room)
    });
  }
  function issueSession(room, player) {
    send(player.socket, {
      type: 'session', code: room.code, id: player.id, token: player.token,
      isHost: player.id === room.hostId, hostId: room.hostId, missionId: room.missionId,
      mode: room.mode, config: room.config, players: playerList(room), ...acceptedLoadout(room, player), role: playerRole(room, player), maxPlayers: maxPlayers(room),
      state: room.paused ? 'paused' : room.phase, reconnectGraceMs,
      poseSeq: player.poseSeq, actionSeq: player.actionSeq, worldSeq: room.worldSeq, crewSeq: player.crewSeq,
      lifeId: room.participants.get(player.id)?.lifeId || 1
    });
  }
  function startMessage(room, resumed = false) {
    return { type: 'start', missionId: room.missionId, seed: room.seed, runId: room.runId, resumed,
      mode: room.mode, config: room.config, players: room.runPlayers || playerList(room), maxPlayers: maxPlayers(room), hostId: room.hostId };
  }
  function stopCrew(room, player, reason) {
    if (room.mode !== 'crew' || player.id === room.hostId) return;
    player.crewInput = { ...(player.crewInput || { seat: '25mm', yaw: 0, pitch: 0 }), fire: false };
    player.crewCancellable = false;
    send(room.players.get(room.hostId)?.socket, { type: 'crew-input', runId: room.runId, playerId: player.id,
      input: player.crewInput, seq: player.crewSeq, reset: true, reason });
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
  function addPlayer(room, socket, name, isHost = false, selection = {}) {
    const now = Date.now();
    const player = {
      id: randomBytes(9).toString('hex'), token: randomBytes(24).toString('hex'), name: cleanName(name),
      ready: isHost, socket, disconnectedAt: 0, pose: null, poseSeq: -1, poseAt: 0,
      ...loadout(room, selection), loadoutExplicit: selection.aircraft !== undefined || selection.startMode !== undefined || selection.payload !== undefined,
      poseBucket: bucket(2, now), actionBucket: bucket(4, now), actionSeq: -1,
      crewSeq: -1, crewInput: null, crewCancellable: false, crewBucket: bucket(3, now)
    };
    room.players.set(player.id, player);
    if (isHost) room.hostId = player.id;
    else if (room.mode === 'team-dogfight' && room.players.size >= 3) clearGuestReadiness(room);
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
    if (requiresFourPilots(room.mode) && room.phase === 'lobby' && player.id !== room.hostId) player.ready = false;
    if (room.mode === 'crew') {
      if (room.phase === 'lobby' && player.id !== room.hostId) player.ready = false;
      if (player.id === room.hostId) for (const p of room.players.values()) stopCrew(room, p, 'host-disconnected');
      else stopCrew(room, player, 'gunner-disconnected');
    }
    if (player.id === room.hostId) {
      if (explicit) { endRoom(room, 'The host ended this squadron. Create a new room to fly again.'); return; }
      room.paused = true;
      broadcast(room, { type: 'pause', message: `Host disconnected. Flight paused for up to ${Math.round(reconnectGraceMs / 1000)} seconds while they reconnect.`, reason: 'host-disconnected' });
    } else if (explicit) {
      room.players.delete(player.id);
      if (room.mode === 'team-dogfight' && room.phase === 'lobby') clearGuestReadiness(room);
    }
    roster(room);
  }
  function requireFlight(socket) {
    const s = socket.session;
    if (!s || s.room.phase !== 'flying') { error(socket, 'not_flying', 'The host must start the mission first.'); return null; }
    if (s.room.paused) { error(socket, 'host_reconnecting', 'Flight is paused while the host reconnects.'); return null; }
    return s;
  }
  function currentRun(socket, msg) {
    const room = socket.session.room;
    // Older unconfigured campaign clients may omit the field. New clients and
    // every arena always bind all traffic to the specific sortie, not just a room.
    if (msg.runId === room.runId || msg.runId === undefined && !socket.flightProtocol && !room.strictFlight && !usesRoomMap(room.mode)) return true;
    error(socket, 'stale_run', 'An update from an earlier sortie was ignored.');
    return false;
  }
  function currentLife(socket, value) {
    const { room, player } = socket.session;
    const lifeId = room.participants.get(player.id)?.lifeId || 1;
    if (value === lifeId || value === undefined && !socket.flightProtocol && !room.strictFlight && !usesRoomMap(room.mode)) return lifeId;
    error(socket, 'stale_life', 'An update from an earlier aircraft life was ignored.');
    return null;
  }
  function participantUpdates(room, snapshot) {
    if (snapshot.participants === undefined) return usesRoomMap(room.mode) ? null : new Map();
    if (!Array.isArray(snapshot.participants) || snapshot.participants.length > 4) return null;
    const updates = new Map(), pilots = new Map((room.runPlayers || []).map(p => [p.id, p]));
    for (const p of snapshot.participants) {
      const previous = room.participants.get(p?.id), pilot = pilots.get(p?.id);
      if (!pilot || updates.has(p.id) || !Number.isSafeInteger(p.lifeId) || p.lifeId < 1 || p.lifeId > 1000000 ||
          typeof p.alive !== 'boolean' || !finiteRange(p.health, 0, 10000)) return null;
      if (previous && (p.lifeId < previous.lifeId || p.lifeId > previous.lifeId + 1 || p.lifeId === previous.lifeId && !previous.alive && p.alive)) return null;
      for (const key of ['kills', 'deaths', 'damageId']) if (p[key] !== undefined && (!validSequence(p[key]) || p[key] < (previous?.[key] || 0))) return null;
      if (p.livesRemaining !== undefined && p.livesRemaining !== null && (!Number.isSafeInteger(p.livesRemaining) || p.livesRemaining < 0 || p.livesRemaining > 5)) return null;
      Object.assign(p, { aircraft: pilot.aircraft, startMode: pilot.startMode, payload: pilot.payload });
      if (pilot.team) p.team = pilot.team;
      else delete p.team;
      if (p.pose && typeof p.pose === 'object') {
        p.pose.payload = pilot.payload;
        if (pilot.team) p.pose.team = pilot.team;
        else delete p.pose.team;
      }
      updates.set(p.id, { lifeId: p.lifeId, alive: p.alive, health: p.health, kills: p.kills || 0, deaths: p.deaths || 0, damageId: p.damageId || 0, team: pilot.team });
    }
    if (usesRoomMap(room.mode) && updates.size !== pilots.size) return null;
    return updates;
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
        socket.flightProtocol = msg.flightProtocol === 2;
        send(socket, { type: 'welcome', version: PROTOCOL_VERSION, time: now });
        return;
      }
      if (msg.type === 'ping') { if (Number.isSafeInteger(msg.nonce)) send(socket, { type: 'pong', nonce: msg.nonce, time: now }); return; }
      if (['create', 'join', 'resume', 'ready', 'mission', 'configure', 'loadout', 'team-partner', 'start', 'lobby', 'leave'].includes(msg.type) && !take(socket.lobbyBucket, 2, 12, now)) {
        error(socket, 'slow_down', 'Please wait a moment before another lobby action.'); return;
      }
      if (['create', 'join', 'resume'].includes(msg.type) && socket.session) {
        error(socket, 'already_in_room', 'Leave your current squadron first.'); return;
      }
      if (msg.type === 'create') {
        if (rooms.size >= maxRooms) { error(socket, 'server_full', 'The hangar is full. Please try again shortly.'); return; }
        const settings = configuration(msg.missionId, msg.config);
        if (!settings) { error(socket, 'bad_mission', 'Choose an available mission or arena and valid round settings.'); return; }
        if (!loadout(settings, msg)) { error(socket, 'bad_loadout', 'Choose an available aircraft and an airborne, runway, or carrier start.'); return; }
        let code;
        do { code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(code));
        const room = { code, hostId: null, players: new Map(), createdAt: now, phase: 'lobby', paused: false, ...settings,
          strictFlight: socket.flightProtocol || Object.keys(msg.config || {}).length > 0,
          seed: 0, runId: null, runPlayers: null, wingmateId: null, participants: new Map(), actionSerial: 0, worldSeq: -1, world: null, worldBucket: bucket(2, now), lastStart: 0 };
        rooms.set(code, room);
        addPlayer(room, socket, msg.name, true, msg);
        return;
      }
      if (msg.type === 'join') {
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        const room = rooms.get(code);
        if (!room) { error(socket, 'room_missing', 'No squadron has that code. Check the six characters with your host.'); return; }
        if (room.phase !== 'lobby') { error(socket, 'flight_in_progress', 'That squadron is already flying. Ask the host to create a fresh room for you.'); return; }
        if (room.paused) { error(socket, 'host_reconnecting', 'The host is reconnecting. Try again in a moment.'); return; }
        if (room.players.size >= maxPlayers(room)) { error(socket, 'room_full', room.mode === 'crew' ? 'This AC-130 already has its pilot and gunner.' : 'That squadron already has four pilots.'); return; }
        if (!loadout(room, msg)) { error(socket, 'bad_loadout', 'Choose an available aircraft and an airborne, runway, or carrier start.'); return; }
        addPlayer(room, socket, msg.name, false, msg);
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
        if (room.mode === 'crew') {
          if (p.id === room.hostId) for (const member of room.players.values()) stopCrew(room, member, 'host-reconnected');
          else stopCrew(room, p, 'gunner-reconnected');
        }
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
          if (room.world) send(socket, { type: 'world', runId: room.runId, snapshot: room.world, seq: room.worldSeq, at: now });
          for (const other of room.players.values()) if (other.id !== p.id && other.pose) send(socket, { type: 'pose', runId: room.runId, playerId: other.id, player: other.pose, seq: other.poseSeq, at: other.poseAt });
          if (room.mode === 'crew' && p.id === room.hostId) for (const member of room.players.values()) stopCrew(room, member, 'host-reconnected');
        }
        if (wasPaused && !room.paused) broadcast(room, { type: 'resume-play', message: 'Host reconnected. The squadron can continue.', state: room.phase });
        roster(room);
        return;
      }
      if (!socket.session) { error(socket, 'no_room', 'Create or join a squadron first.'); return; }
      const { room, player } = socket.session;
      if (msg.type === 'leave') { depart(socket, true); send(socket, { type: 'left' }); socket.close(1000, 'Left room'); return; }
      if (msg.type === 'lobby') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can return the squadron to its lobby.'); return; }
        if (room.paused) return;
        if (room.mode === 'crew') for (const member of room.players.values()) stopCrew(room, member, 'returned-to-lobby');
        room.phase = 'lobby'; room.runId = null; room.runPlayers = null;
        room.world = null; room.worldSeq = -1; room.participants.clear();
        for (const member of room.players.values()) {
          member.ready = member.id === room.hostId; member.pose = null;
        }
        broadcast(room, { type: 'lobby', missionId: room.missionId, mode: room.mode, config: room.config, players: playerList(room), hostId: room.hostId });
        roster(room); return;
      }
      if (msg.type === 'ready') {
        if (typeof msg.ready !== 'boolean') return;
        if (room.phase !== 'lobby') { error(socket, 'lobby_only', 'Readiness changes are available before takeoff.'); return; }
        player.ready = player.id === room.hostId ? true : msg.ready;
        roster(room); return;
      }
      if (msg.type === 'loadout') {
        if (room.phase !== 'lobby') { error(socket, 'loadout_locked', 'Choose your aircraft and start before the sortie begins.'); return; }
        if (room.mode === 'crew') { error(socket, 'crew_aircraft', 'The pilot and gunner share the AC-130 in this operation.'); return; }
        const chosen = loadout(room, msg, player);
        if (!chosen) { error(socket, 'bad_loadout', 'Choose an available aircraft and an airborne, runway, or carrier start.'); return; }
        if (chosen.aircraft !== player.aircraft || chosen.startMode !== player.startMode || chosen.payload !== player.payload) {
          Object.assign(player, chosen); player.loadoutExplicit = true;
          if (player.id !== room.hostId) player.ready = false;
        }
        roster(room); return;
      }
      if (msg.type === 'team-partner') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can assign a wingmate.'); return; }
        if (room.phase !== 'lobby' || room.mode !== 'team-dogfight') { error(socket, 'lobby_only', 'Choose a wingmate in the 2v2 lobby.'); return; }
        const wingmate = room.players.get(msg.playerId);
        if (!wingmate?.socket || wingmate.id === room.hostId) { error(socket, 'bad_wingmate', 'Pick a connected wingmate.'); return; }
        if (room.wingmateId === wingmate.id) return;
        room.wingmateId = wingmate.id;
        clearGuestReadiness(room);
        roster(room); return;
      }
      if (msg.type === 'configure') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can configure the sortie.'); return; }
        if (room.phase !== 'lobby') { error(socket, 'mission_locked', 'Create a new room to change settings after takeoff.'); return; }
        const settings = configuration(msg.missionId ?? room.missionId, msg.config, room.config);
        if (!settings) { error(socket, 'bad_config', 'Choose valid flight settings. Dogfights run for 3, 5, 10, or 20 minutes. Missions allow 1, 3, or 5 lives.'); return; }
        if (settings.mode === 'crew' && room.players.size > 2) { error(socket, 'crew_capacity', 'An AC-130 crew has one pilot and one gunner. Use a two-person room for this mission.'); return; }
        room.strictFlight = true;
        configureRoom(room, settings); roster(room); return;
      }
      if (msg.type === 'mission') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can choose a mission.'); return; }
        if (room.phase !== 'lobby') { error(socket, 'mission_locked', 'Create a new room to change the mission after takeoff.'); return; }
        if (!validMission(msg.missionId)) { error(socket, 'bad_mission', 'Choose a mission from the campaign.'); return; }
        if (missionMode(msg.missionId) === 'crew' && room.players.size > 2) { error(socket, 'crew_capacity', 'An AC-130 crew has one pilot and one gunner. Use a two-person room for this mission.'); return; }
        const settings = configuration(msg.missionId, { mode: missionMode(msg.missionId), ...(usesRoomMap(missionMode(msg.missionId)) ? { mapId: msg.missionId.split('-')[1] } : {}) }, room.config);
        configureRoom(room, settings);
        roster(room); return;
      }
      if (msg.type === 'start') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can choose and start a mission.'); return; }
        if (room.paused) return;
        const missionId = msg.missionId ?? room.missionId;
        if (requiresFourPilots(room.mode) && missionId !== room.missionId) { error(socket, 'bad_mission', 'Choose the map in the lobby before launching.'); return; }
        const requestedMode = missionId === room.missionId ? room.mode : missionMode(missionId);
        const settings = configuration(missionId, { mode: requestedMode, ...(usesRoomMap(missionMode(missionId)) ? { mapId: missionId.split('-')[1] } : {}) }, room.config);
        if (!settings) { error(socket, 'bad_mission', 'Choose an available mission or arena.'); return; }
        const { mode } = settings;
        if (mode === 'crew' && room.players.size > 2) { error(socket, 'crew_capacity', 'An AC-130 crew has one pilot and one gunner. Use a two-person room for this mission.'); return; }
        const present = [...room.players.values()].filter(p => p.socket);
        if (requiresFourPilots(mode) && present.length !== 4) { error(socket, 'need_four_pilots', 'Connect all four pilots before launching this mode.'); return; }
        if (present.length < 2) { error(socket, 'need_wingmate', mode === 'crew' ? 'Invite a gunner to join your AC-130 before starting.' : 'A squadron needs at least two connected pilots. Invite a wingmate or fly solo from the campaign.'); return; }
        if (present.some(p => !p.ready)) { error(socket, 'not_ready', 'Wait until every connected wingmate is ready.'); return; }
        if (now - room.lastStart < 1000) { error(socket, 'slow_down', 'Please wait a moment before restarting.'); return; }
        Object.assign(room, settings);
        room.strictFlight ||= socket.flightProtocol;
        room.phase = 'flying'; room.seed = randomInt(0x7fffffff); room.runId = randomBytes(8).toString('hex');
        room.world = null; room.worldSeq = -1; room.worldBucket = bucket(2, now); room.lastStart = now;
        for (const p of room.players.values()) {
          if (!p.loadoutExplicit) Object.assign(p, loadout(room));
          p.pose = null; p.poseSeq = -1; p.poseBucket = bucket(2, now);
          p.actionSeq = -1; p.actionBucket = bucket(4, now);
          p.crewSeq = -1; p.crewInput = null; p.crewCancellable = false; p.crewBucket = bucket(3, now);
        }
        room.runPlayers = playerList(room); room.actionSerial = 0;
        room.participants = new Map(room.runPlayers.map(p => [p.id, { lifeId: 1, alive: true, health: AIRCRAFT[p.aircraft].health, kills: 0, deaths: 0, damageId: 0, team: p.team }]));
        broadcast(room, startMessage(room)); roster(room); return;
      }
      if (msg.type === 'pose') {
        if (!requireFlight(socket)) return;
        if (room.mode === 'crew' && player.id !== room.hostId) { error(socket, 'pilot_only', 'The pilot controls the shared AC-130.'); return; }
        if (!currentRun(socket, msg)) return;
        if (!validSequence(msg.seq) || msg.seq <= player.poseSeq) { error(socket, 'stale_sequence', 'An old plane update was ignored.'); return; }
        const pose = cleanPose(msg.player);
        if (!pose) { error(socket, 'bad_pose', 'An invalid plane update was ignored.'); return; }
        const lifeId = currentLife(socket, pose.lifeId);
        if (lifeId === null) return;
        if (!take(player.poseBucket, 15, 2, now)) return;
        Object.assign(pose, acceptedLoadout(room, player), { lifeId });
        const participant = room.participants.get(player.id);
        if (participant) {
          if (participant.team) pose.team = participant.team;
          if (room.world?.participants) Object.assign(pose, { health: participant.health, alive: participant.alive });
        }
        player.poseSeq = msg.seq; player.pose = pose; player.poseAt = now;
        broadcast(room, { type: 'pose', runId: room.runId, playerId: player.id, player: pose, seq: msg.seq, at: now }, player.id);
        return;
      }
      if (msg.type === 'world') {
        if (player.id !== room.hostId) { error(socket, 'host_only', 'Only the host can update the mission world.'); return; }
        if (!requireFlight(socket)) return;
        if (!currentRun(socket, msg)) return;
        if (!validSequence(msg.seq) || msg.seq <= room.worldSeq) { error(socket, 'stale_sequence', 'An old world update was ignored.'); return; }
        if (!validWorld(msg.snapshot)) { error(socket, 'bad_world', 'The mission update exceeded safe bounds.'); return; }
        const updates = participantUpdates(room, msg.snapshot);
        if (!updates) { error(socket, 'bad_participants', 'The player-life update contained an invalid identity or generation.'); return; }
        if (!take(room.worldBucket, 10, 2, now)) return;
        if (room.mode === 'crew' && msg.snapshot.teamPaused && !room.world?.teamPaused) {
          for (const member of room.players.values()) stopCrew(room, member, 'mission-paused');
        }
        for (const [id, participant] of updates) {
          const p = room.players.get(id);
          if (participant.lifeId !== room.participants.get(id)?.lifeId && p) p.pose = null;
          room.participants.set(id, participant);
        }
        room.world = msg.snapshot; room.worldSeq = msg.seq;
        broadcast(room, { type: 'world', runId: room.runId, snapshot: msg.snapshot, seq: msg.seq, at: now }, player.id);
        return;
      }
      if (msg.type === 'action') {
        if (!requireFlight(socket)) return;
        if (player.id === room.hostId) return;
        if (room.mode === 'crew') { error(socket, 'crew_input_required', 'Use the gun station controls for this shared aircraft.'); return; }
        if (!currentRun(socket, msg)) return;
        const seq = msg.seq ?? (!socket.flightProtocol && !room.strictFlight && !usesRoomMap(room.mode) ? player.actionSeq + 1 : undefined);
        if (!validSequence(seq) || seq <= player.actionSeq) { error(socket, 'stale_sequence', 'An old control action was ignored.'); return; }
        const lifeId = currentLife(socket, msg.lifeId);
        if (lifeId === null) return;
        const action = cleanAction(msg.action);
        const name = typeof action === 'string' ? action : action?.name;
        const participant = room.participants.get(player.id);
        if (!action || !player.pose && name !== 'respawn' && name !== 'bailout') { error(socket, 'bad_action', 'That action needs a current plane position.'); return; }
        if (name !== 'respawn' && participant?.alive === false) { error(socket, 'pilot_down', 'Respawn or spectate while this aircraft is down.'); return; }
        if (room.world?.round?.ended || room.world?.teamPaused) { error(socket, 'mission_paused', 'This sortie is paused or complete.'); return; }
        if (!take(player.actionBucket, 10, 4, now)) return;
        player.actionSeq = seq;
        const actionId = `${room.runId}:${++room.actionSerial}`;
        send(room.players.get(room.hostId)?.socket, { type: 'action', runId: room.runId, lifeId, actionId, seq, action, playerId: player.id, player: { ...player.pose, ...acceptedLoadout(room, player), lifeId, id: player.id, playerId: player.id, name: player.name } });
        return;
      }
      if (msg.type === 'crew-input') {
        if (!requireFlight(socket)) return;
        if (room.mode !== 'crew' || player.id === room.hostId) { error(socket, 'gunner_only', 'Only the assigned AC-130 gunner can use these stations.'); return; }
        if (room.world?.teamPaused) { error(socket, 'mission_paused', 'The pilot paused this sortie.'); return; }
        if (msg.runId !== room.runId) { error(socket, 'stale_run', 'A gun station update from an earlier sortie was ignored.'); return; }
        if (!validSequence(msg.seq) || msg.seq <= player.crewSeq) { error(socket, 'stale_sequence', 'An old gun station update was ignored.'); return; }
        const input = cleanCrewInput(msg.input);
        const reset = msg.reset === true;
        if (!input || msg.reset !== undefined && typeof msg.reset !== 'boolean' || reset && input.fire) { error(socket, 'bad_crew_input', 'An invalid gun station update was ignored.'); return; }
        const releasing = player.crewInput?.fire && !input.fire || reset && player.crewCancellable;
        // A stop always reaches the pilot, even after a burst exhausts the rate
        // limit. One reset after a press also cancels any unticked click latch.
        // Repeated resets cannot amplify traffic without a new firing input.
        if (!take(player.crewBucket, 15, 3, now) && !releasing) return;
        player.crewSeq = msg.seq; player.crewInput = input;
        if (input.fire) player.crewCancellable = true;
        else if (reset) player.crewCancellable = false;
        send(room.players.get(room.hostId)?.socket, { type: 'crew-input', runId: room.runId, playerId: player.id, input, seq: msg.seq, reset });
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
          room.players.delete(p.id);
          if (room.mode === 'team-dogfight' && room.phase === 'lobby') clearGuestReadiness(room);
          roster(room);
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
