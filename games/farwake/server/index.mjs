import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { Realm } from './realm.mjs';
import { persistenceFromEnvironment } from './persistence.mjs';
import { FixedStepClock } from './timing.mjs';
import { PROTOCOL_VERSION, SIMULATION_HZ, INPUT_HZ, SNAPSHOT_HZ, MAX_ONLINE, newRealmCode, validRealmCode, normaliseRealmCode, cleanName, RateLimit, MOTION_STATE_FIELDS, MOTION_WORLD_FIELDS } from './protocol.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
const json = (response, status, value) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };

/** Frequent motion packets omit journals, static asteroid geometry and realm rosters. */
export function compactSnapshot(snapshot) {
  return { protocol: snapshot.protocol, partial: true, tick: snapshot.tick, serverTime: snapshot.serverTime, simulatedAt: snapshot.simulatedAt, ack: snapshot.ack,
    state: Object.fromEntries(MOTION_STATE_FIELDS.map(key => [key, snapshot.state[key]])),
    world: { ...Object.fromEntries(MOTION_WORLD_FIELDS.map(key => [key, snapshot.world[key]])), asteroidStates: (snapshot.world.asteroids || []).map(rock => [rock.id, Math.round(rock.angle * 1000) / 1000, rock.hp, rock.ore, rock.crystal]) },
    room: snapshot.room, players: snapshot.players, remoteShips: snapshot.remoteShips, events: snapshot.events };
}

export class RealmManager {
  constructor(persistence) { this.persistence = persistence; this.realms = new Map(); this.loading = new Map(); }
  async get(id, { create = false, name } = {}) {
    if (this.realms.has(id)) return this.realms.get(id);
    if (this.loading.has(id)) return this.loading.get(id);
    const operation = (async () => {
      const saved = await this.persistence.load(id);
      if (!saved.snapshot && !create) return null;
      if (saved.snapshot && create) throw new Error('Realm code collision');
      const realm = new Realm({ id, name, persistence: this.persistence, version: saved.version, snapshot: saved.snapshot,
        onConflict: failed => { for (const captain of failed.captains.values()) captain.session?.close(1012, 'Realm revision changed. Reconnect to load its durable state.'); this.realms.delete(failed.id); } });
      this.realms.set(id, realm); return realm;
    })();
    this.loading.set(id, operation);
    try { return await operation; } finally { this.loading.delete(id); }
  }
  async create(name) { for (let i = 0; i < 5; i++) { const id = newRealmCode(); if ((await this.persistence.load(id)).snapshot) continue; return this.get(id, { create: true, name }); } throw new Error('Could not allocate a realm code.'); }
  async flush() { return Promise.allSettled([...this.realms.values()].map(realm => realm.flush())); }
}

async function readJson(request, limit = 16384) {
  let length = 0; const chunks = [];
  for await (const chunk of request) { length += chunk.length; if (length > limit) throw new Error('Request body is too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('A JSON request body is required.'); }
}

/** Starts an HTTP/static/WebSocket authority; tests supply a temporary persistence adapter. */
export async function startServer({ port = Number(process.env.PORT || 3000), host = process.env.HOST || '0.0.0.0', persistence = persistenceFromEnvironment(), staticDir = path.resolve(directory, '../dist'), allowedOrigins = (process.env.FARWAKE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean), flushIntervalMs = 7000, snapshotHz = SNAPSHOT_HZ, heartbeatIntervalMs = 15000 } = {}) {
  await persistence.ping();
  const manager = new RealmManager(persistence), sockets = new Set(), rates = new Map();
  const started = Date.now(); let closing = false, tick = 0;
  const clock = new FixedStepClock({ hz: SIMULATION_HZ, now: performance.now() });
  const configuredOrigins = new Set(allowedOrigins);
  if (process.env.RENDER_EXTERNAL_URL) configuredOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
  function originAllowed(request) {
    const origin = request.headers.origin; if (!origin) return true;
    if (configuredOrigins.has(origin)) return true;
    const hostHeader = request.headers.host;
    return origin === `http://${hostHeader}` || origin === `https://${hostHeader}`;
  }
  function rateFor(request) { const key = request.socket.remoteAddress || 'local'; if (!rates.has(key)) rates.set(key, new RateLimit(2, 40)); if (rates.size > 5000) rates.delete(rates.keys().next().value); return rates.get(key); }
  const server = http.createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff'); response.setHeader('referrer-policy', 'same-origin');
    if (!originAllowed(request)) return json(response, 403, { ok: false, reason: 'This web origin is not allowed to use the multiplayer service.' });
    if (request.headers.origin) { response.setHeader('access-control-allow-origin', request.headers.origin); response.setHeader('vary', 'Origin'); response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS'); response.setHeader('access-control-allow-headers', 'Content-Type'); }
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
    let pathname; try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { return json(response, 400, { ok: false, reason: 'Invalid URL.' }); }
    if (pathname === '/healthz') {
      const storageHealthy = [...manager.realms.values()].every(realm => !realm.storageError);
      return json(response, closing || !storageHealthy ? 503 : 200, { ok: !closing && storageHealthy, service: 'farwake', protocol: PROTOCOL_VERSION, uptimeSeconds: Math.floor((Date.now() - started) / 1000), durable: persistence.durable, storage: storageHealthy ? 'ready' : 'unavailable', onlineCaptains: [...manager.realms.values()].reduce((n, r) => n + r.onlineCount, 0), activeSystems: [...manager.realms.values()].reduce((n, r) => n + r.rooms.size, 0) });
    }
    if (pathname === '/api/config' && request.method === 'GET') return json(response, 200, { ok: true, protocol: PROTOCOL_VERSION, capacity: MAX_ONLINE, simulationHz: SIMULATION_HZ, inputHz: INPUT_HZ, snapshotHz });
    if (pathname === '/api/realms' && request.method === 'POST') {
      if (closing) return json(response, 503, { ok: false, reason: 'The authority is restarting. Try again shortly.' });
      if (!rateFor(request).take()) return json(response, 429, { ok: false, reason: 'Please wait before creating or resuming another passport.' });
      try {
        const body = await readJson(request); const action = body.action || (body.passport ? 'resume' : 'join');
        let realm, captain, passport;
        if (action === 'create') { realm = await manager.create(cleanName(body.realmName, 'Farwake friends')); ({ captain, passport } = await realm.createCaptain(body.name, {starterShip:body.starterShip,character:body.character})); }
        else {
          const code = normaliseRealmCode(body.realmCode || body.passport?.realmCode);
          if (!validRealmCode(code)) return json(response, 400, { ok: false, reason: 'Enter a valid invitation realm code.' });
          realm = await manager.get(code); if (!realm) return json(response, 404, { ok: false, reason: 'That realm code was not found.' });
          if (action === 'resume') { captain = realm.authenticate(body.passport); if (!captain) return json(response, 401, { ok: false, reason: 'This captain passport is not valid for the realm.' }); passport = { realmCode: code, captainId: captain.id, token: body.passport.token }; }
          else if (action === 'join') ({ captain, passport } = await realm.createCaptain(body.name, {starterShip:body.starterShip,character:body.character}));
          else return json(response, 400, { ok: false, reason: 'Choose create, join, or resume.' });
        }
        if (!captain.session && realm.onlineCount >= MAX_ONLINE) return json(response, 409, { ok: false, reason: 'This realm already has ten online captains.' });
        return json(response, 200, { ok: true, passport, realm: { code: realm.id, name: realm.name, capacity: MAX_ONLINE, online: realm.onlineCount }, protocol: PROTOCOL_VERSION });
      } catch (error) { return json(response, /ten online|limit/.test(error.message) ? 409 : /JSON|large/.test(error.message) ? 400 : 503, { ok: false, reason: error.message.includes('Storage') || error.message.includes('storage') ? 'Durable storage is temporarily unavailable.' : error.message }); }
    }
    if (pathname.startsWith('/api/') || pathname === '/ws') return json(response, 404, { ok: false, reason: 'Endpoint not found.' });
    if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { ok: false, reason: 'Method not allowed.' });
    const filename = path.resolve(staticDir, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (filename !== staticDir && !filename.startsWith(`${staticDir}${path.sep}`)) return json(response, 403, { ok: false, reason: 'Path not allowed.' });
    try {
      const info = await stat(filename); if (!info.isFile()) throw new Error('not a file');
      const contents = await readFile(filename);
      response.writeHead(200, { 'content-type': mime[path.extname(filename)] || 'application/octet-stream', 'content-length': contents.length, 'cache-control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch { json(response, 404, { ok: false, reason: 'File not found.' }); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    if (closing || request.url.split('?')[0] !== '/ws' || !originAllowed(request)) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  wss.on('connection', (ws, request) => {
    sockets.add(ws); let realm = null, captain = null, authenticating = false, inFlight = 0;
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    const trafficLimit = new RateLimit(55, 100), commandLimit = new RateLimit(8, 16);
    const send = packet => { if (ws.readyState === 1) ws.send(JSON.stringify(packet)); };
    const session = { send, close: (code, reason) => ws.close(code, reason), ws };
    const helloTimer = setTimeout(() => ws.close(4001, 'A captain passport is required.'), 10000); helloTimer.unref?.();
    ws.on('message', async buffer => {
      if (!trafficLimit.take()) { ws.close(4008, 'Input rate exceeded.'); return; }
      let packet; try { packet = JSON.parse(buffer.toString('utf8')); } catch { send({ type: 'error', code: 'protocol', reason: 'Malformed JSON packet.' }); return; }
      if (!packet || typeof packet !== 'object') return;
      if (!captain) {
        if (packet.type !== 'hello' || authenticating) return;
        authenticating = true;
        try {
          if (packet.protocol !== PROTOCOL_VERSION) throw new Error('This client protocol needs an update.');
          const code = normaliseRealmCode(packet.passport?.realmCode); if (!validRealmCode(code)) throw new Error('Invalid realm code.');
          realm = await manager.get(code); captain = realm?.authenticate(packet.passport);
          if (!captain) throw new Error('Invalid captain passport.');
          const result = realm.attach(captain, session);
          if (!result.ok) { send({ type: 'error', ...result }); captain = null; ws.close(result.code === 'realm-full' ? 4003 : 1013, result.reason); return; }
          clearTimeout(helloTimer); const snapshot = realm.snapshotFor(captain); session.lastFullAt = Date.now(); session.lastRoomId = snapshot.room.id; session.lastSystemId = snapshot.room.systemId; session.lastShipClass = snapshot.state.ship.classId; send({ type: 'welcome', ...snapshot });
        } catch (error) { send({ type: 'error', code: 'authentication', reason: error.message }); ws.close(4001, 'Authentication failed.'); }
        return;
      }
      if (captain.session !== session) { ws.close(4009, 'This passport connected in another window.'); return; }
      if (packet.type === 'input') { realm.acceptInput(captain, packet.seq, packet.input); return; }
      if (packet.type === 'ping') { send({ type: 'pong', sentAt: Number(packet.sentAt) || Date.now(), serverTime: Date.now() }); return; }
      if (packet.type === 'goodbye') { ws.close(1000, 'Voyage safely disconnected.'); return; }
      if (packet.type !== 'command') return;
      if (typeof packet.id !== 'string' || packet.id.length > 100 || typeof packet.name !== 'string' || packet.name.length > 40) { send({ type: 'error', code: 'protocol', reason: 'Invalid command envelope.' }); return; }
      if (!commandLimit.take() || inFlight >= 6) { send({ type: 'result', id: packet.id, ok: false, result: { ok: false, reason: 'Wait for the current actions before issuing more.', code: 'rate' } }); return; }
      inFlight++;
      try { const result = await realm.command(captain, packet.name, packet.args || {}, packet.id); const snapshot = realm.snapshotFor(captain); session.lastFullAt = Date.now(); session.lastRoomId = snapshot.room.id; session.lastSystemId = snapshot.room.systemId; session.lastShipClass = snapshot.state.ship.classId; send({ type: 'result', id: packet.id, ok: result.ok, result, ...snapshot }); }
      catch { send({ type: 'result', id: packet.id, ok: false, result: { ok: false, reason: 'The authority could not complete that action.', code: 'server' } }); }
      finally { inFlight--; }
    });
    ws.on('close', () => { clearTimeout(helloTimer); sockets.delete(ws); if (captain && realm) realm.detach(captain, session); });
    ws.on('error', () => {});
  });
  const snapshotEvery = Math.max(1, Math.round(SIMULATION_HZ / snapshotHz));
  let simulation, nextSnapshotTick = snapshotEvery;
  const simulate = () => {
    if (closing) return;
    const time = performance.now(), wallTime = Date.now();
    clock.advance(time, (dt, nextTick, remaining) => {
      tick = nextTick;
      for (const realm of manager.realms.values()) {
        try { realm.step(dt, tick, wallTime, wallTime - remaining * 1000); }
        catch (error) { realm.failed = true; for (const c of realm.captains.values()) c.session?.close(1011, 'Realm validation failed. Reconnect to restore the last durable revision.'); manager.realms.delete(realm.id); console.error('Realm simulation error:', realm.id, error.message); }
      }
    });
    if (tick >= nextSnapshotTick) {
      nextSnapshotTick = (Math.floor(tick / snapshotEvery) + 1) * snapshotEvery;
      // After a delayed callback, publish only the newest completed state, not a burst of obsolete frames.
      for (const realm of manager.realms.values()) for (const c of realm.captains.values()) if (c.session) {
        // Drop superseded snapshots for a congested socket. Never wait for client acknowledgments.
        if (c.session.ws.bufferedAmount > 524288) continue;
        try {
          const room = realm.roomInfo(c), shipClass = realm.vessels.get(c.aboard || c.ownedVesselId)?.ship.classId || c.game.state.ship.classId;
          const full = room.id !== c.session.lastRoomId || room.systemId !== c.session.lastSystemId || shipClass !== c.session.lastShipClass || Date.now() - (c.session.lastFullAt || 0) >= 1000;
          const snapshot = realm.snapshotFor(c, { compact: !full });
          if (full) { c.session.lastFullAt = Date.now(); c.session.lastRoomId = room.id; c.session.lastSystemId = room.systemId; c.session.lastShipClass = shipClass; }
          c.session.send({ type: 'snapshot', ...snapshot });
        } catch (error) { console.error('Snapshot error:', realm.id, error.message); }
      }
    }
    simulation = setTimeout(simulate, clock.nextDelay(performance.now())); simulation.unref?.();
  };
  simulation = setTimeout(simulate, clock.nextDelay(performance.now()));
  const flushing = setInterval(() => manager.flush(), flushIntervalMs);
  const heartbeat = setInterval(() => { for (const socket of sockets) { if (!socket.isAlive) { socket.terminate(); continue; } socket.isAlive = false; if (socket.readyState === 1) socket.ping(); } }, heartbeatIntervalMs);
  simulation.unref?.(); flushing.unref?.(); heartbeat.unref?.();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const address = server.address();
  const close = async () => {
    if (closing) return; closing = true; clearTimeout(simulation); clearInterval(flushing); clearInterval(heartbeat);
    for (const realm of manager.realms.values()) for (const c of realm.captains.values()) if (c.session) { const session = c.session; realm.detach(c, session); session.close(1012, 'Authority restarting. Your passport will resume the voyage.'); }
    const saves = await Promise.allSettled([...manager.realms.values()].map(realm => realm.shutdown()));
    for (const ws of sockets) ws.terminate();
    await new Promise(resolve => server.close(resolve)); wss.close();
    if (saves.some(result => result.status === 'rejected')) throw new Error('One or more realms could not be durably flushed during shutdown.');
  };
  return { server, wss, manager, persistence, address, url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`, close, get tick() { return tick; } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), argument = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
    const options = {};
    if (argument('--host')) options.host = argument('--host');
    if (argument('--port')) { const port = Number(argument('--port')); if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid --port value.'); options.port = port; }
    const authority = await startServer(options);
    console.log(`Farwake authority listening on port ${authority.address.port}; persistence: ${authority.persistence.kind}.`);
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; try { await authority.close(); process.exitCode = 0; } catch (error) { console.error(error.message); process.exitCode = 1; } };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  } catch (error) { console.error(`Farwake startup failed: ${error.message}`); process.exitCode = 1; }
}
