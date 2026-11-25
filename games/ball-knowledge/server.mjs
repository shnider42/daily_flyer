import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createEngine, GameError, VERSION } from './engine.mjs';
import { createStorage } from './storage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const MAX_BODY = 8192;

function headers(response, extra = {}) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  for (const [key, value] of Object.entries(extra)) response.setHeader(key, value);
}

function json(response, status, body) {
  if (response.writableEnded || response.destroyed) return;
  headers(response, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new GameError(415, 'content_type', 'Send this request as JSON.');
  if (Number(request.headers['content-length'] || 0) > MAX_BODY) throw new GameError(413, 'request_too_large', 'That request is too large.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new GameError(413, 'request_too_large', 'That request is too large.');
    chunks.push(chunk);
  }
  try {
    const object = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!object || Array.isArray(object) || typeof object !== 'object') throw new Error();
    return object;
  } catch { throw new GameError(400, 'invalid_json', 'This request could not be read.'); }
}

export async function createGameServer({ questions, manifest, storage, clock = Date.now, env = process.env, publicDir = join(HERE, 'public'), ...engineOptions } = {}) {
  if (!questions) questions = JSON.parse(await readFile(join(HERE, 'data', 'questions.json'), 'utf8'));
  if (!manifest) {
    try { manifest = JSON.parse(await readFile(join(HERE, 'data', 'manifest.json'), 'utf8')); } catch { manifest = {}; }
  }
  const bankVersion = manifest.bankVersion || manifest.version || '2026-11-25.v1';
  const engine = createEngine({ questions, bankVersion, now: clock, playerSalt: env.BK_WRITE_TOKEN, ...engineOptions });
  storage ||= createStorage({ env, directory: HERE, bankVersion, now: clock });
  const rates = new Map();
  const root = resolve(publicDir);

  function checkRate(request, isStart) {
    let ip = request.socket.remoteAddress || 'unknown';
    if (env.BK_TRUST_PROXY === '1') {
      // Render appends the connecting client's address. The last address avoids trusting a prepended user value.
      const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map(value => value.trim());
      if (forwarded.at(-1)) ip = forwarded.at(-1).slice(0, 80);
    }
    const timestamp = clock();
    let entry = rates.get(ip);
    if (!entry || timestamp > entry.until) {
      entry = { until: timestamp + 60000, requests: 0, starts: 0 };
      rates.set(ip, entry);
    }
    entry.requests++;
    if (isStart) entry.starts++;
    if (entry.requests > 240 || entry.starts > 20) throw new GameError(429, 'rate_limit', 'Too many requests. Give it a moment, then try again.');
    if (rates.size > 10000) {
      for (const [key, value] of rates) if (value.until < timestamp) rates.delete(key);
      while (rates.size > 10000) rates.delete(rates.keys().next().value);
    }
  }

  async function save(run) {
    if (!run.finished || run.mode !== 'ranked' || run.saved) return;
    if (run.savePromise) return run.savePromise;
    run.savePromise = (async () => {
      try { await storage.saveRun(engine.record(run)); run.saved = true; run.saveError = null; }
      catch { run.saveError = 'The leaderboard could not save this round. Tap Retry save while this page is open.'; }
      finally { run.savePromise = null; }
    })();
    return run.savePromise;
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      if (path.startsWith('/api/')) {
        checkRate(request, request.method === 'POST' && path === '/api/runs');
        if (request.method === 'POST') {
          const origin = request.headers.origin;
          if (origin) {
            let originHost;
            try { originHost = new URL(origin).host; } catch { throw new GameError(403, 'origin', 'This request is not allowed.'); }
            if (originHost !== request.headers.host) throw new GameError(403, 'origin', 'This request is not allowed.');
          }
        }
        if (path === '/api/meta' && request.method === 'GET') return json(response, 200, { ...engine.meta(await storage.health()), storageMode: storage.mode });
        if (path === '/api/leaderboard' && request.method === 'GET') {
          const period = url.searchParams.get('period') || 'week';
          if (!['week', 'all'].includes(period)) throw new GameError(400, 'invalid_period', 'Choose the last seven days or all time.');
          try { return json(response, 200, { entries: await storage.leaderboard(period), available: true, period, bankVersion }); }
          catch { return json(response, 503, { entries: [], available: false, error: 'leaderboard_unavailable', message: 'The leaderboard is temporarily unavailable. Try again shortly.' }); }
        }
        if (path === '/api/runs' && request.method === 'POST') {
          const body = await readJson(request);
          const { payload } = engine.start(body);
          return json(response, 201, payload);
        }
        const match = path.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(answer|next|save))?$/);
        if (match) {
          const [, id, action] = match;
          if (!action && request.method === 'GET') {
            const authorization = request.headers.authorization || '';
            const run = engine.authorize(id, authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
            return json(response, 200, engine.state(run));
          }
          if (request.method !== 'POST' || !action) throw new GameError(405, 'method', 'This method is not allowed.');
          const body = await readJson(request);
          const run = engine.authorize(id, body.token);
          if (action === 'answer') {
            const feedback = engine.answer(run, body);
            if (feedback.finished) { await save(run); feedback.result = engine.result(run); }
            return json(response, 200, feedback);
          }
          if (action === 'next') return json(response, 200, engine.next(run));
          if (!run.finished || run.mode !== 'ranked') throw new GameError(409, 'unfinished', 'Finish a ranked round before saving it.');
          await save(run);
          return json(response, run.saved ? 200 : 503, { ok: run.saved, result: engine.result(run), ...(!run.saved ? { error: 'save_failed', message: run.saveError } : {}) });
        }
        if (path === '/api/reports' && request.method === 'POST') {
          const body = await readJson(request);
          const run = engine.authorize(body.runId, body.token);
          const report = engine.report(run, body.questionId, body.reason);
          if (report) {
            try { await storage.report(report); engine.markReported(run, body.questionId); }
            catch { throw new GameError(503, 'report_failed', 'The report could not be sent. Please try again.'); }
          }
          return json(response, 200, { ok: true });
        }
        throw new GameError(404, 'not_found', 'This endpoint was not found.');
      }
      if (path === '/health' && request.method === 'GET') return json(response, 200, { ok: true, version: VERSION, bankVersion, questionCount: questions.length, leaderboardAvailable: await storage.health(), storageMode: storage.mode });
      if (!['GET', 'HEAD'].includes(request.method)) throw new GameError(405, 'method', 'This method is not allowed.');
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { throw new GameError(400, 'path', 'Invalid path.'); }
      if (decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.')) || decoded.includes('\\')) throw new GameError(404, 'not_found', 'This page was not found.');
      const filepath = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!filepath.startsWith(root + sep) || !MIME[extname(filepath)]) throw new GameError(404, 'not_found', 'This page was not found.');
      let file;
      try { const info = await stat(filepath); if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error(); file = await readFile(filepath); }
      catch { throw new GameError(404, 'not_found', 'This page was not found.'); }
      headers(response, { 'Content-Type': MIME[extname(filepath)], 'Cache-Control': 'no-cache', 'Content-Length': file.length });
      response.writeHead(200);
      response.end(request.method === 'HEAD' ? undefined : file);
    } catch (error) {
      if (error instanceof GameError) { if (error.status === 429) response.setHeader('Retry-After', '60'); return json(response, error.status, { error: error.code, message: error.message }); }
      json(response, 500, { error: 'server_error', message: 'Something went wrong. Please retry the last action.' });
    }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  const sweep = setInterval(() => { engine.sweep(); const timestamp = clock(); for (const [key, value] of rates) if (value.until < timestamp) rates.delete(key); }, 60000);
  sweep.unref();
  server.on('close', () => clearInterval(sweep));
  return { server, engine, storage };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server } = await createGameServer();
  const args = process.argv.slice(2);
  const argument = name => {
    const inline = args.find(value => value.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const port = Number(argument('--port') ?? process.env.PORT ?? 3000);
  const host = argument('--host') ?? '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535.');
  if (typeof host !== 'string' || !/^[A-Za-z0-9.:-]+$/.test(host)) throw new Error('Host must be a valid bind address.');
  server.listen(port, host, () => console.log(`Ball Knowledge ${VERSION} listening on ${host}:${port}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
