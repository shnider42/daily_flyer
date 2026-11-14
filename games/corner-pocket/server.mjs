/** Same-origin static game and authenticated, authoritative two-player tables. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGzip, constants as ZLIB } from 'node:zlib';
import { RoomHub, RoomError } from './multiplayer.mjs';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || '')))
    throw new RoomError(415, 'Send JSON for a table request.', 'content_type');
  if (+req.headers['content-length'] > 4096) throw new RoomError(413, 'That request is too large.', 'body_too_large');
  return new Promise((resolve, reject) => {
    let size = 0; let settled = false; const parts = [];
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    req.on('data', part => {
      size += part.length;
      if (size > 4096) { parts.length = 0; fail(new RoomError(413, 'That request is too large.', 'body_too_large')); return; }
      if (!settled) parts.push(part);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const value = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        settled = true; resolve(value);
      } catch { fail(new RoomError(400, 'The request was not valid JSON.', 'bad_json')); }
    });
    req.on('error', () => fail(new RoomError(400, 'The request was interrupted.', 'request_interrupted')));
    req.on('aborted', () => fail(new RoomError(400, 'The request was interrupted.', 'request_interrupted')));
  });
}

export function createServer({ hub = new RoomHub(), automaticTicks = true, tickMs = 1000 / 60,
  publicRoot = ROOT, heartbeatMs = 10000, maxStreams = 128 } = {}) {
  const root = path.resolve(publicRoot), rates = new Map(), streams = new Set();
  function rate(req, category, maximum, windowMs = 60000) {
    const now = Date.now(), key = `${req.socket.remoteAddress || 'unknown'}:${category}`;
    let bucket = rates.get(key);
    if (!bucket || now - bucket.at >= windowMs) {
      if (!bucket && rates.size >= 4096) rates.delete(rates.keys().next().value);
      bucket = { at: now, count: 0 }; rates.set(key, bucket);
    }
    if (++bucket.count > maximum) throw new RoomError(429, 'Please wait a moment before trying again.', 'rate_limited');
    if (rates.size > 2048) for (const [id, value] of rates) if (now - value.at > 60000) rates.delete(id);
  }
  function json(res, status, body, head = false) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(text) });
    res.end(head ? undefined : text);
  }
  function origin(req, res) {
    const value = req.headers.origin;
    if (!value) return;
    const protocol = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const expected = `${protocol}://${req.headers.host}`;
    if (value !== expected) throw new RoomError(403, 'Open this room from the game website.', 'origin_rejected');
    res.setHeader('Access-Control-Allow-Origin', value); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { json(res, 400, { ok: false, error: 'Invalid address.', code: 'bad_url' }); return; }
    if (pathname === '/health' || pathname === '/api/health') {
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { ok: false, error: 'Use GET for health.' }); return; }
      json(res, hub.closed ? 503 : 200, { ok: !hub.closed, game: 'corner-pocket', version: '1.0.0', rooms: hub.rooms.size }, req.method === 'HEAD');
      return;
    }
    if (pathname.startsWith('/api/')) {
      try {
        origin(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (hub.closed) throw new RoomError(503, 'The table server is restarting. Try again shortly.', 'restarting');
        rate(req, 'all', 240, 1000);
        if (pathname === '/api/rooms' && req.method === 'POST') {
          rate(req, 'create', 12); json(res, 201, hub.create(await readBody(req))); return;
        }
        const match = /^\/api\/rooms\/([A-Z2-9]{6})\/(join|rejoin|input|stream)$/i.exec(pathname);
        if (!match) throw new RoomError(404, 'That table route was not found.', 'route_missing');
        const code = match[1].toUpperCase(), action = match[2].toLowerCase();
        const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
        if (action === 'stream') {
          if (req.method !== 'GET') throw new RoomError(405, 'Use GET to watch a table.', 'method');
          const authorized = hub.auth(code, token);
          if (streams.size >= maxStreams && !authorized.seat.stream) throw new RoomError(503, 'All table connections are busy. Try again shortly.', 'capacity');
          const compressed = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
          if (compressed) {
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Vary', req.headers.origin ? 'Origin, Accept-Encoding' : 'Accept-Encoding');
          }
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.flushHeaders(); req.socket.setNoDelay(true); req.socket.setTimeout(0);
          const writer = compressed ? createGzip({ level: ZLIB.Z_BEST_SPEED, flush: ZLIB.Z_SYNC_FLUSH }) : res;
          if (compressed) {
            writer.on('error', () => res.destroy()); writer.pipe(res);
            res.on('close', () => writer.destroy());
          }
          streams.add(res); writer.write(': Corner Pocket\n\n');
          const send = packet => {
            if (res.destroyed || res.writableEnded || res.writableLength + (compressed ? writer.writableLength : 0) > 256 * 1024) {
              res.destroy(); throw new Error('Stream unavailable');
            }
            writer.write(`data: ${JSON.stringify(packet)}\n\n`);
          };
          send.close = () => { if (!writer.writableEnded) writer.end(); };
          const disconnect = hub.connect(code, token, send);
          const heartbeat = setInterval(() => {
            if (res.destroyed || res.writableEnded || res.writableLength + (compressed ? writer.writableLength : 0) > 256 * 1024) { res.destroy(); return; }
            writer.write(': keepalive\n\n');
          }, heartbeatMs);
          heartbeat.unref();
          res.on('close', () => { clearInterval(heartbeat); streams.delete(res); disconnect(); });
          return;
        }
        if (req.method !== 'POST') throw new RoomError(405, 'Use POST for a table action.', 'method');
        const body = await readBody(req);
        if (action === 'join') { rate(req, 'join', 48); json(res, 200, hub.join(code, body)); return; }
        if (action === 'rejoin') { json(res, 200, hub.rejoin(code, token)); return; }
        const outcome = hub.input(code, token, body);
        const { status, ...payload } = outcome;
        json(res, status || 200, payload);
      } catch (error) {
        if (error instanceof RoomError && error.status === 413 && !res.headersSent) res.setHeader('Connection', 'close');
        if (!res.headersSent) json(res, error instanceof RoomError ? error.status : 500,
          { ok: false, error: error instanceof RoomError ? error.message : 'The table could not complete that request.',
            code: error instanceof RoomError ? error.code : 'server_error' });
        else res.end();
      }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed.'); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || relative.split('/').some(segment => segment.startsWith('.')) ||
      /[\\\u0000-\u001f\u007f]/.test(relative)) {
      res.writeHead(404); res.end('Not found.'); return;
    }
    try {
      const details = await stat(file);
      if (!details.isFile()) throw new Error('Not a file');
      const data = req.method === 'HEAD' ? undefined : await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'Content-Length': details.size });
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found.'); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  let previous = performance.now();
  const timer = automaticTicks ? setInterval(() => {
    const now = performance.now(); hub.tick((now - previous) / 1000); previous = now;
  }, tickMs) : null;
  timer?.unref();
  server.roomHub = hub;
  server.on('close', () => { if (timer) clearInterval(timer); hub.close(); });
  server.shutdown = callback => {
    if (timer) clearInterval(timer); hub.close();
    server.close(callback); server.closeIdleConnections?.();
  };
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(), port = Number(process.env.PORT) || 4182;
  server.listen(port, '0.0.0.0', () => console.log(`Corner Pocket listening on ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.shutdown(() => process.exit(0));
    const deadline = setTimeout(() => { server.closeAllConnections?.(); process.exit(0); }, 5000);
    deadline.unref();
  });
}
