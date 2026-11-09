import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDuelServer } from '../../server/pgi/server.mjs';

function request(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('duels serve shared modules while keeping asset roots isolated and the hub reachable', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'pgi-http-'));
  const directory = join(temp, 'gridiron'), sharedDirectory = join(temp, 'sports');
  await mkdir(join(sharedDirectory, 'core'), { recursive: true });
  await mkdir(directory);
  await writeFile(join(directory, 'index.html'), '<html><body>Gridiron</body></html>');
  await writeFile(join(sharedDirectory, 'index.html'), '<html><body>Sports</body></html>');
  await writeFile(join(sharedDirectory, 'core', 'camera.js'), 'export const camera = true;');
  await writeFile(join(sharedDirectory, 'core', 'pgi-controls.js'), 'export const controls = true;');
  await writeFile(join(sharedDirectory, '.hidden'), 'not public');
  await writeFile(join(temp, 'private.txt'), 'not public');
  const app = createDuelServer({ directory, sharedDirectory });
  try {
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const port = app.server.address().port;
    const entry = await request(port, '/');
    assert.equal(entry.status, 200);
    assert.match(entry.body, /window.PGI_DUEL=true/);
    for (const filename of ['camera.js', 'pgi-controls.js']) {
      const module = await request(port, `/pocket_sports_assets/core/${filename}?v=camera`);
      assert.equal(module.status, 200);
      assert.match(module.headers['content-type'], /^text\/javascript/);
      assert.equal(module.headers['x-content-type-options'], 'nosniff');
      assert.match(module.body, /export const/);
    }
    const head = await request(port, '/pocket_sports_assets/core/camera.js', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.ok(Number(head.headers['content-length']) > 0);
    const sharedIndex = await request(port, '/pocket_sports_assets/index.html');
    assert.equal(sharedIndex.status, 200);
    assert.doesNotMatch(sharedIndex.body, /PGI_DUEL/);
    for (const path of ['/pocket_sports_assets/', '/pocket_sports_assets/.hidden', '/pocket_sports_assets/%2e%2e%2fprivate.txt', '/pocket_sports_assets/%00', '/%2e%2e%2fprivate.txt', '/server/pgi/server.mjs']) {
      const response = await request(port, path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /not public/);
    }
    assert.equal((await request(port, '/pocket_sports_assets/core/camera.js', 'POST')).status, 405);
    for (const path of ['/pocket-sports', '/pocket-sports/']) {
      const response = await request(port, path);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, 'https://dfe-pocket-gridiron.onrender.com/pocket-sports/');
    }
    const health = await request(port, '/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
