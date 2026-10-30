import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { BreachRooms, PROTOCOL } from './breach-rooms.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

export function createBreachServer(options = {}) {
  const directory = resolve(options.directory || resolve(ROOT, 'dist_breach'));
  const rooms = options.rooms || new BreachRooms({ maxRooms: Number(process.env.BREACH_MAX_ROOMS) || 4 });
  const allowed = new Set((options.allowedOrigins || process.env.BREACH_ALLOWED_ORIGINS || 'https://dfe-breach.onrender.com').split(',').map(v => v.trim()).filter(Boolean));
  const connections = new Set(), upgradeWindows = new Map();
  let stopping = false;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }); return response.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { response.writeHead(400); return response.end('Bad request'); }
    if (pathname === '/health' || pathname === '/api/health') {
      const healthy = !stopping && !rooms.shuttingDown;
      response.writeHead(healthy ? 200 : 503, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      return response.end(request.method === 'HEAD' ? '' : JSON.stringify({ ok: healthy, service: 'breach-rooms', version: '0.6.1', protocol: PROTOCOL, activeRooms: rooms.rooms.size, maxRooms: rooms.maxRooms }));
    }
    if (pathname === '/') pathname = '/index.html';
    const path = resolve(directory, '.' + pathname);
    if (!path.startsWith(directory + sep) || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) { response.writeHead(404); return response.end('Not found'); }
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('Not a file');
      let body = await readFile(path);
      if (extname(path) === '.html' && path.endsWith('index.html')) {
        body = Buffer.from(body.toString().replace(/(<script id="breach-config" type="application\/json">)([\s\S]*?)(<\/script>)/, (_, before, raw, after) => {
          const config = JSON.parse(raw); config.coopServer = 'same-origin';
          return before + JSON.stringify(config).replaceAll('<', '\\u003c') + after;
        }));
      }
      response.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': path.includes('/vendor/') ? 'public, max-age=86400' : 'no-cache' });
      response.end(request.method === 'HEAD' ? '' : body);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
  });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: { threshold: 512, concurrencyLimit: 2, serverNoContextTakeover: true, clientNoContextTakeover: true, zlibDeflateOptions: { level: 3, memLevel: 4 } } });
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    let url; try { url = new URL(request.url, 'http://localhost'); } catch { socket.destroy(); return; }
    const origin = request.headers.origin;
    let ownOrigin = false;
    try { ownOrigin = origin && new URL(origin).host === request.headers.host; } catch { /* Invalid origins are rejected. */ }
    const ip = request.socket.remoteAddress || 'unknown';
    const now = Date.now(), record = upgradeWindows.get(ip);
    const window = record && now - record.startedAt < 60_000 ? record : { startedAt: now, count: 0 };
    window.count++; upgradeWindows.set(ip, window);
    if (stopping || url.pathname !== '/ws' || origin && !ownOrigin && !allowed.has(origin) || window.count > 60 || connections.size >= 24) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request));
  });

  sockets.on('connection', ws => {
    connections.add(ws); ws.isAlive = true;
    const peer = {
      roomId: null, playerId: null,
      send(message) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > 512_000) { ws.close(1013, 'Connection too slow'); return; }
        ws.send(JSON.stringify(message), error => { if (error) ws.terminate(); });
      },
      close(code, reason) { if (ws.readyState === WebSocket.OPEN) ws.close(code, reason); },
    };
    let tokens = 150, lastRefill = Date.now();
    const handshake = setTimeout(() => { if (!peer.roomId) ws.close(1008, 'Join a room to continue'); }, 20_000); handshake.unref();
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
    ws.on('message', (buffer, binary) => {
      const now = Date.now(); tokens = Math.min(150, tokens + (now - lastRefill) * .09); lastRefill = now;
      if (--tokens < 0 || binary) { ws.close(1008, 'Unsupported message rate or format'); return; }
      let message; try { message = JSON.parse(buffer.toString()); } catch { rooms.error(peer, 'INVALID_MESSAGE', 'Room messages must be valid JSON.'); return; }
      try { rooms.handle(peer, message); } catch (error) {
        console.error('Room action failed:', error?.message || 'unknown error');
        rooms.error(peer, 'ROOM_ERROR', 'The room could not complete that action. Please reconnect.');
      }
    });
    ws.on('close', () => { clearTimeout(handshake); connections.delete(ws); rooms.disconnect(peer); });
  });

  const step = setInterval(() => {
    try { rooms.step(1 / 30); } catch (error) { console.error('Room simulation failed:', error?.message || 'unknown error'); rooms.shutdown(); }
  }, 1000 / 30); step.unref();
  const heartbeat = setInterval(() => {
    for (const ws of connections) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false; ws.ping();
    }
    const now = Date.now(); for (const [ip, window] of upgradeWindows) if (now - window.startedAt > 60_000) upgradeWindows.delete(ip);
  }, 15_000); heartbeat.unref();

  async function close() {
    stopping = true; clearInterval(step); clearInterval(heartbeat); rooms.shutdown();
    for (const ws of connections) ws.terminate();
    sockets.close();
    await new Promise(resolveClose => server.listening ? server.close(resolveClose) : resolveClose());
  }
  return { server, sockets, rooms, close };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const argumentPort = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (argumentPort >= 0 ? process.argv[argumentPort + 1] : 4173));
  const app = createBreachServer();
  app.server.listen(port, '0.0.0.0', () => console.log(`BREACH rooms 0.6.1 listening on ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
