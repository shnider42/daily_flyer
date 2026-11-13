/** Static preview and the optional authoritative, private-room online service. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGzip, constants as ZLIB } from 'node:zlib';
import { RoomHub, RoomError } from './multiplayer.mjs';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff' };

export function createServer({ hub = new RoomHub(), allowedOrigins, automaticTicks = true } = {}) {
  const origins = new Set(allowedOrigins || (process.env.BASEBALL_ALLOWED_ORIGINS || 'https://dfe-pocket-baseball.onrender.com').split(',').map(s => s.trim()).filter(Boolean));
  const rates = new Map();
  function rate(req, category, maximum, window = 60000) {
    // Render supplies the immediate proxy address; forwarded headers are not a credential.
    const address = req.socket.remoteAddress || 'unknown', key = `${address}:${category}`, now = Date.now();
    let bucket = rates.get(key);
    if (!bucket || now - bucket.at >= window) { bucket = { at: now, count: 0 }; rates.set(key, bucket); }
    if (++bucket.count > maximum) throw new RoomError(429, 'Please wait a moment before trying again.', 'rate_limited');
    if (rates.size > 2048) for (const [id, item] of rates) if (now - item.at > 60000) rates.delete(id);
  }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  function authorizeOrigin(req, res) {
    const origin = req.headers.origin;
    if (!origin) return;
    const protocol = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const self = `${protocol}://${req.headers.host}`;
    if (!origins.has(origin) && origin !== self) throw new RoomError(403, 'This game cannot connect from that origin.', 'origin_rejected');
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
  }
  async function body(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new RoomError(415, 'Send JSON for a baseball request.');
    let size = 0; const parts = [];
    for await (const part of req) { size += part.length; if (size > 4096) throw new RoomError(413, 'That request is too large.'); parts.push(part); }
    try { const parsed = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
    catch { throw new RoomError(400, 'The request was not valid JSON.'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid request.'); return; }
    if (pathname === '/api/health' || pathname === '/health' && req.method === 'GET') {
      try { authorizeOrigin(req, res); json(res, 200, { ok: !hub.closed, service: 'pocket-baseball-online', version: '0.4.0', rooms: hub.rooms.size }); }
      catch (error) { json(res, error.status || 500, { ok: false, error: error.message }); }
      return;
    }
    if (pathname.startsWith('/api/')) {
      try {
        authorizeOrigin(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        rate(req, 'all', 180, 1000);
        if (pathname === '/api/rooms' && req.method === 'POST') {
          rate(req, 'create', 12); json(res, 201, hub.create(await body(req))); return;
        }
        const match = /^\/api\/rooms\/([A-Z2-9]{6})\/(join|rejoin|stream|input|pong)$/i.exec(pathname);
        if (!match) throw new RoomError(404, 'That baseball route was not found.');
        const code = match[1].toUpperCase(), action = match[2].toLowerCase(), token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
        if (action === 'stream' && req.method === 'GET') {
          hub.auth(code, token);
          const compress = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
          if (compress) { res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', req.headers.origin ? 'Origin, Accept-Encoding' : 'Accept-Encoding'); }
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.flushHeaders();
          const writer = compress ? createGzip({ level: ZLIB.Z_BEST_SPEED, flush: ZLIB.Z_SYNC_FLUSH }) : res;
          if (compress) { writer.on('error', () => res.destroy()); writer.pipe(res); res.on('close', () => writer.destroy()); }
          writer.write(': Pocket Baseball\n\n');
          const stream = packet => {
            if (res.destroyed || res.writableEnded) throw new Error('Stream closed');
            if (res.writableLength + (compress ? writer.writableLength : 0) > 512 * 1024) { res.destroy(); throw new Error('Slow stream'); }
            writer.write(`data: ${JSON.stringify(packet)}\n\n`);
          };
          stream.close = () => writer.end();
          const disconnect = hub.connect(code, token, stream);
          res.on('close', disconnect); return;
        }
        if (req.method !== 'POST') throw new RoomError(405, 'This request needs POST.');
        const input = await body(req);
        if (action === 'join') { rate(req, 'join', 36); json(res, 200, hub.join(code, input)); }
        else if (action === 'rejoin') json(res, 200, hub.rejoin(code, token));
        else if (action === 'input') json(res, 200, hub.input(code, token, input));
        else if (action === 'pong') json(res, 200, hub.pong(code, token, input.challenge));
        else throw new RoomError(404, 'That baseball route was not found.');
      } catch (error) {
        if (!res.headersSent) json(res, error instanceof RoomError ? error.status : 500, { ok: false, error: error instanceof RoomError ? error.message : 'The online field could not complete that request.', code: error.code || 'server_error' });
        else res.end();
      }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    if (pathname === '/health') pathname = '/health.json';
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || relative.split('/').some(p => p.startsWith('.')) || relative.includes('\\')) {
      res.writeHead(404); res.end('Not found.'); return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      const data = req.method === 'HEAD' ? null : await readFile(file);
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Content-Length', info.size);
      res.writeHead(200); res.end(data);
    } catch { res.writeHead(404); res.end('Not found.'); }
  });
  let previous = performance.now();
  const timer = automaticTicks ? setInterval(() => { const now = performance.now(); hub.tick((now - previous) / 1000); previous = now; }, 1000 / 120) : null;
  timer?.unref();
  server.baseballHub = hub;
  server.on('close', () => { if (timer) clearInterval(timer); hub.close(); });
  server.shutdown = callback => { if (timer) clearInterval(timer); hub.close(); server.close(callback); server.closeIdleConnections?.(); };
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(), port = Number(process.env.PORT) || 4173;
  server.listen(port, '0.0.0.0', () => console.log(`Pocket Baseball listening on ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.shutdown(() => process.exit(0)));
}
