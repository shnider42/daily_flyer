import {createServer} from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, extname, join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {parseArgs} from 'node:util';
import {gzipSync} from 'node:zlib';
import {RoomError, RecoveryCodec, SnapshotStore, TabletopRooms, localRecoverySecret} from '../tabletop/rooms.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultAssets = join(root, 'daily_flyer/themes/vineyard_assets');
const MIME = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg',
  '.ico':'image/x-icon', '.json':'application/json; charset=utf-8', '.woff2':'font/woff2'};
const MAX_BODY = 1400000;

async function readJson(req) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new RoomError('Send requests as JSON.', 415, 'JSON_REQUIRED');
  if (Number(req.headers['content-length']) > MAX_BODY) throw new RoomError('This request is too large.', 413, 'BODY_TOO_LARGE');
  let size = 0; const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BODY) throw new RoomError('This request is too large.', 413, 'BODY_TOO_LARGE');
    parts.push(part);
  }
  try {
    const data = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new RoomError('This request contains invalid JSON.', 400, 'INVALID_JSON'); }
}
function bearer(req) {
  const auth = req.headers.authorization;
  return typeof auth === 'string' && /^Bearer [A-Za-z0-9_-]+$/.test(auth) ? auth.slice(7) : null;
}
function secureHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}
function json(res, status, body) {
  let data = Buffer.from(JSON.stringify(body));
  const headers = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', Vary:'Accept-Encoding'};
  if (data.length > 1500 && res.acceptsGzip) { data = gzipSync(data); headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = data.length;
  res.writeHead(status, headers);
  res.end(data);
}
function checkOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new RoomError('Open the game directly to use this table.', 403, 'ORIGIN_REJECTED');
  const origin = req.headers.origin;
  if (!origin) return; // CLI and native tests may omit Origin; bearer remains required.
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== req.headers.host) throw new Error();
  } catch { throw new RoomError('This request came from another site.', 403, 'ORIGIN_REJECTED'); }
}

/** Simple bounded rate buckets; no raw addresses/tokens are persisted or logged. */
class RequestLimits {
  constructor() { this.buckets = new Map(); this.sweep = Date.now(); }
  check(key, limit, window = 60000) {
    const now = Date.now();
    if (now - this.sweep > window) {
      for (const [id, item] of this.buckets) if (now - item.start > window) this.buckets.delete(id);
      this.sweep = now;
    }
    let item = this.buckets.get(key);
    if (!item || now - item.start > window) { item = {start:now, count:0}; this.buckets.set(key,item); }
    if (++item.count > limit) throw new RoomError('A few too many requests arrived. Wait a moment and try again.', 429, 'RATE_LIMIT');
    if (this.buckets.size > 10000) this.buckets.delete(this.buckets.keys().next().value);
  }
}

export function createApp({manager, assets = defaultAssets, build = process.env.RENDER_GIT_COMMIT || 'development', stableSecret = !!process.env.ROOM_SECRET} = {}) {
  if (!manager) throw new Error('A room manager is required.');
  const limits = new RequestLimits();
  return createServer(async (req, res) => {
    secureHeaders(res);
    res.acceptsGzip = /(?:^|,)\s*gzip(?:\s*;\s*q=(?!0(?:\.0*)?(?:\s*,|\s*$))[0-9.]+)?\s*(?:,|$)/i.test(String(req.headers['accept-encoding'] || ''));
    try {
      const url = new URL(req.url, 'http://local');
      const path = url.pathname;
      if (path === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        return json(res, 200, {ok:true, game:'vineyard-table', build, protocol:1,
          recovery: stableSecret ? 'deployment-secret' : 'local-secret'});
      }
      if (path.startsWith('/api/')) {
        if (!['GET','POST'].includes(req.method)) throw new RoomError('This method is not supported.',405,'METHOD_NOT_ALLOWED');
        checkOrigin(req);
        const token = bearer(req);
        // Render's proxy supplies the client address; locally use the socket.
        const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        limits.check(`request:${address}`, 500);
        if (req.method === 'GET' && path === '/api/rules') return json(res,200,{
          name:'Vineyard Table', inspiredBy:'Viticulture Essential Edition', players:'2–6',
          fullTarget:20, shortTarget:12, guidance:['Simple','Moderate','Expert'],
          notes:['The same workers are shared between summer and winter.',
            'This independent implementation uses original visitors and orders and a uniform starting estate.',
            'Solo uses computer opponents, not the published Automa.',
            'Saved tables can be recovered for fourteen days using the original device or a private backup.'],
          source:'https://store.stonemaiergames.com/products/viticulture-essential-edition',
        });
        if (req.method === 'POST') {
          const data = await readJson(req);
          if (path === '/api/rooms') {
            limits.check(`create:${address}`,15);
            return json(res,201,manager.create(data));
          }
          if (path === '/api/restore') {
            limits.check(`restore:${address}`,30);
            return json(res,200,manager.restore(token,data.recovery));
          }
          const match = path.match(/^\/api\/rooms\/([A-Za-z0-9]{8})\/(join|start|action|rematch)$/);
          if (match) {
            const [,code,op] = match;
            if (op === 'join') { limits.check(`join:${address}`,30); return json(res,200,manager.join(code,data)); }
            if (op === 'start') return json(res,200,manager.start(code,token,data));
            if (op === 'action') return json(res,200,manager.action(code,token,data));
            if (op === 'rematch') return json(res,200,manager.rematch(code,token));
          }
        } else {
          const match = path.match(/^\/api\/rooms\/([A-Za-z0-9]{8})$/);
          if (match) return json(res,200,manager.get(match[1],token));
        }
        throw new RoomError('This game endpoint does not exist.',404,'NOT_FOUND');
      }
      if (!['GET','HEAD'].includes(req.method)) throw new RoomError('This method is not supported.',405,'METHOD_NOT_ALLOWED');
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { throw new RoomError('Invalid path.',400); }
      if (decoded.includes('\0') || decoded.includes('\\')) throw new RoomError('Not found.',404);
      // Exact files only; do not allow API/game source or path traversal to escape assets.
      const file = resolve(assets, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!file.startsWith(resolve(assets) + sep) || !existsSync(file) || !statSync(file).isFile()) {
        throw new RoomError('This page does not exist.',404,'NOT_FOUND');
      }
      const mime = MIME[extname(file).toLowerCase()];
      if (!mime) throw new RoomError('This file cannot be served.',404,'NOT_FOUND');
      res.writeHead(200,{'Content-Type':mime, 'Cache-Control':'no-cache', 'Content-Length':statSync(file).size});
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (!(error instanceof RoomError)) console.error('Vineyard request failed:', error.message);
      json(res,error instanceof RoomError ? error.status : 500,{
        error:error instanceof RoomError ? error.message : 'The server could not finish that request. Your previous turn is still saved. Refresh and try again.',
        code:error instanceof RoomError ? error.code : 'SERVER_ERROR',
      });
    }
  });
}

export async function createDefaultManager() {
  const engine = await import('./engine.mjs');
  const directory = process.env.ROOM_DATA_DIR || join(tmpdir(),'dfe-vineyard-rooms');
  const secret = process.env.ROOM_SECRET || localRecoverySecret(directory);
  const codec = new RecoveryCodec(secret);
  const store = new SnapshotStore(directory,codec);
  return new TabletopRooms({engine,secret,store});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manager = await createDefaultManager();
  const server = createApp({manager});
  const {values} = parseArgs({options:{port:{type:'string'},host:{type:'string'},strictPort:{type:'boolean'}},strict:true});
  const port = Number(values.port ?? process.env.PORT ?? 3000);
  const host = values.host || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a whole number from 1 to 65535.');
  server.listen(port,host,()=>console.log(`Vineyard Table listening on http://${host}:${port}`));
  const shutdown = () => {
    try { manager.shutdown(); } catch (error) { console.error('Could not persist every table:',error.message); }
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(0),8000).unref();
  };
  process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
}
