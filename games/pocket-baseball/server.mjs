/** Local preview / optional web-service host. Production v1 can be static. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff' };

export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid request.'); return; }
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(), port = Number(process.env.PORT) || 4173;
  server.listen(port, '0.0.0.0', () => console.log(`Pocket Baseball listening on ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
