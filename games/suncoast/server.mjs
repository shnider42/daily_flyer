/** SUNCOAST shared-city authority and static game server. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { RoomManager } from './server/rooms.mjs';
import { PROTOCOL, MAX_PLAYERS, SIMULATION_HZ, INPUT_HZ, SNAPSHOT_HZ } from './public/coop-protocol.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json; charset=utf-8' };
const defaultOrigins = ['https://dfe-suncoast.onrender.com', 'https://dfe-suncoast-coop.onrender.com'];
const bucket = (capacity, at) => ({ value: capacity, at });
function take(budget, rate, capacity, at) {
  budget.value = Math.min(capacity, budget.value + Math.max(0, at - budget.at) * rate / 1000); budget.at = at;
  if (budget.value < 1) return false; budget.value--; return true;
}
export function allowedOrigin(origin, origins = defaultOrigins, production = process.env.NODE_ENV === 'production') {
  if (!origin) return true;
  let value; try { value = new URL(origin); } catch { return false; }
  if (value.origin !== origin || !['http:', 'https:'].includes(value.protocol)) return false;
  return origins.includes(origin) || !production && ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname);
}
export async function createServer({ port = Number(process.env.PORT || 3000), host = '0.0.0.0',
  staticDir = path.join(directory, 'public'), now = () => Date.now(), autoTick = true,
  production = process.env.NODE_ENV === 'production',
  allowedOrigins = [...defaultOrigins, ...(process.env.SUNCOAST_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)],
  roomOptions = {}, heartbeatMs = 15000, handshakeMs = 15000, maxConnections = 128 } = {}) {
  const root = path.resolve(staticDir), rooms = new RoomManager({ ...roomOptions, now });
  const started = Date.now(), peers = new Set(), ipBudgets = new Map(); let closing = false;
  const originOK = request => allowedOrigin(request.headers.origin, allowedOrigins, production);
  const reply = (response, status, body, request, contentType = 'application/json; charset=utf-8') => {
    const value = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      ...(request.headers.origin && originOK(request) ? { 'Access-Control-Allow-Origin': request.headers.origin, Vary: 'Origin' } : {}) });
    response.end(request.method === 'HEAD' ? undefined : value);
  };
  const server = http.createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { reply(response, 400, 'Invalid path.', request, 'text/plain'); return; }
    if (request.method === 'OPTIONS') {
      if (!originOK(request)) return reply(response, 403, { ok: false }, request);
      response.writeHead(204, { ...(request.headers.origin ? { 'Access-Control-Allow-Origin': request.headers.origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }); response.end(); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { reply(response, 405, 'Method not allowed.', request, 'text/plain'); return; }
    if (['/health', '/healthz', '/api/config'].includes(pathname)) {
      reply(response, 200, { ok: !closing, game: 'suncoast', version: '0.2.0', protocol: PROTOCOL,
        maxPlayers: MAX_PLAYERS, simulationHz: SIMULATION_HZ, inputHz: INPUT_HZ, snapshotHz: SNAPSHOT_HZ,
        persistence: 'session', uptimeSeconds: Math.round((Date.now() - started) / 1000), performance: rooms.summary() }, request); return;
    }
    if (pathname === '/__qa/mobile' && !production) {
      try { reply(response, 200, await readFile(path.join(directory, 'dev/mobile.html')), request, 'text/html; charset=utf-8'); }
      catch { reply(response, 404, 'Not found.', request, 'text/plain'); } return;
    }
    if (pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) { reply(response, 404, 'Not found.', request, 'text/plain'); return; }
    const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(root + path.sep)) { reply(response, 404, 'Not found.', request, 'text/plain'); return; }
    try {
      if (!(await stat(file)).isFile()) throw new Error('Not a file');
      reply(response, 200, await readFile(file), request, mime[path.extname(file)] || 'application/octet-stream');
    } catch { reply(response, 404, 'Not found.', request, 'text/plain'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false });
  const rejectUpgrade = (socket, code, phrase) => { socket.end(`HTTP/1.1 ${code} ${phrase}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
  server.on('upgrade', (request, socket, head) => {
    let pathname; try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { pathname = ''; }
    if (pathname !== '/ws') return rejectUpgrade(socket, 404, 'Not Found');
    if (closing || peers.size >= maxConnections) return rejectUpgrade(socket, 503, 'Service Unavailable');
    if (!originOK(request)) return rejectUpgrade(socket, 403, 'Forbidden');
    const ip = request.socket.remoteAddress || 'unknown', at = now(); let budget = ipBudgets.get(ip);
    if (!budget) {
      if (ipBudgets.size >= 2048) for (const [key, value] of ipBudgets) if (at - value.at > 60000) ipBudgets.delete(key);
      if (ipBudgets.size >= 2048) return rejectUpgrade(socket, 429, 'Too Many Requests');
      budget = bucket(30, at); ipBudgets.set(ip, budget);
    }
    if (!take(budget, 2, 30, at)) return rejectUpgrade(socket, 429, 'Too Many Requests');
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  wss.on('connection', ws => {
    const peer = { socket: ws, roomCode: null, playerId: null, alive: true,
      general: bucket(120, now()), controls: bucket(80, now()), actions: bucket(20, now()), lobbies: bucket(4, now()),
      get bufferedAmount() { return ws.bufferedAmount; },
      send(packet) {
        if (ws.readyState !== 1) return false;
        if (ws.bufferedAmount > 256 * 1024) { ws.close(1013, 'Connection cannot keep up. Reconnecting may help.'); return false; }
        const data = JSON.stringify(packet); ws.send(data); return Buffer.byteLength(data);
      },
      close(code, reason) { if (ws.readyState < 2) ws.close(code, reason); }
    };
    peers.add(peer);
    const timeout = setTimeout(() => { if (!peer.roomCode) ws.close(4003, 'Choose a crew to connect.'); }, handshakeMs); timeout.unref?.();
    ws.on('pong', () => { peer.alive = true; });
    ws.on('message', (data, binary) => {
      if (binary) { ws.close(1003, 'Send JSON messages.'); return; }
      if (!take(peer.general, 100, 120, now())) { ws.close(1008, 'Too many messages.'); return; }
      let message; try { message = JSON.parse(data.toString()); } catch { ws.close(1007, 'Invalid JSON.'); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (data.length > 4096 && message.type !== 'create') { ws.close(1009, 'Message too large.'); return; }
      if (message.type === 'input' && !take(peer.controls, 60, 80, now())) return;
      if (message.type === 'action' && !take(peer.actions, 10, 20, now())) { peer.send({ type: 'result', id: typeof message.id === 'string' ? message.id.slice(0, 80) : '', ok: false, reason: 'Wait a moment before another action.' }); return; }
      if (['create', 'join', 'resume'].includes(message.type) && !take(peer.lobbies, 1, 4, now())) { rooms.reject(peer, 'Wait a moment before connecting again.', 'RATE_LIMIT'); return; }
      try { rooms.handle(peer, message); } catch (error) { console.error('SUNCOAST message rejected:', error?.message); rooms.reject(peer, 'The city could not process that message.', 'SERVER_ERROR'); }
      if (peer.roomCode) clearTimeout(timeout);
    });
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(timeout); peers.delete(peer); rooms.disconnect(peer); });
  });
  const heartbeat = setInterval(() => {
    for (const peer of peers) {
      if (!peer.alive) { peer.socket.terminate(); continue; }
      peer.alive = false; if (peer.socket.readyState === 1) peer.socket.ping();
    }
  }, heartbeatMs); heartbeat.unref?.();
  let timer, last = performance.now(), accumulator = 0;
  function advance() {
    if (closing) return;
    const at = performance.now(); accumulator += Math.min(.25, Math.max(0, (at - last) / 1000)); last = at;
    let steps = 0;
    while (accumulator >= 1 / SIMULATION_HZ && steps++ < 8) { accumulator -= 1 / SIMULATION_HZ; rooms.step(1 / SIMULATION_HZ); }
    timer = setTimeout(advance, Math.max(1, Math.ceil((1 / SIMULATION_HZ - accumulator) * 1000 - (performance.now() - at)))); timer.unref?.();
  }
  if (autoTick) timer = setTimeout(advance, 1000 / SIMULATION_HZ);
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); }); }
  catch (error) { closing = true; clearTimeout(timer); clearInterval(heartbeat); wss.close(); throw error; }
  const address = server.address();
  return { server, wss, rooms, address, url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`,
    async close() {
      if (closing) return; closing = true; clearTimeout(timer); clearInterval(heartbeat); rooms.shutdown();
      for (const peer of peers) peer.socket.terminate();
      await Promise.all([new Promise(resolve => wss.close(resolve)), new Promise(resolve => server.close(resolve))]);
    } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), argument = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  const requestedPort = Number(argument('--port') ?? process.env.PORT ?? 3000), requestedHost = argument('--host') || '0.0.0.0';
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('PORT must be between 0 and 65535.');
  const app = await createServer({ port: requestedPort, host: requestedHost });
  console.log(`SUNCOAST co-op ready on ${requestedHost}:${app.address.port} (up to ${MAX_PLAYERS} drivers)`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
}
