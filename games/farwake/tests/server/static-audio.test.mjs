import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server/index.mjs';

test('menu audio supports complete and ranged playback without changing other static responses', async t => {
  const staticDir = await mkdtemp(path.join(os.tmpdir(), 'farwake-audio-'));
  const audio = Buffer.from('0123456789');
  await Promise.all([writeFile(path.join(staticDir, 'theme.m4a'), audio), writeFile(path.join(staticDir, 'index.html'), 'Farwake'), writeFile(path.join(staticDir, 'empty.m4a'), '')]);
  const server = await startServer({ port: 0, host: '127.0.0.1', staticDir, persistence: { ping: async () => {}, kind: 'test-memory', durable: false } });
  t.after(async () => { await server.close(); await rm(staticDir, { recursive: true, force: true }); });
  const request = (resource = '/theme.m4a', options = {}) => fetch(server.url + resource, options);
  const full = await request();
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/mp4');
  assert.equal(full.headers.get('accept-ranges'), 'bytes'); assert.equal(full.headers.get('content-length'), '10');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), audio);

  for (const [range, expected, contentRange] of [['bytes=0-1', '01', 'bytes 0-1/10'], ['bytes=4-', '456789', 'bytes 4-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=7-99', '789', 'bytes 7-9/10'], ['bytes=-99', '0123456789', 'bytes 0-9/10']]) {
    const response = await request('/theme.m4a', { headers: { range } });
    assert.equal(response.status, 206, range); assert.equal(response.headers.get('content-range'), contentRange, range);
    assert.equal(response.headers.get('content-length'), String(expected.length), range); assert.equal(await response.text(), expected, range);
  }
  for (const range of ['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=9007199254740992-', 'invalid']) {
    const response = await request('/theme.m4a', { headers: { range } });
    assert.equal(response.status, 416, range); assert.equal(response.headers.get('content-range'), 'bytes */10', range);
    assert.equal(await response.text(), '', range);
  }
  const head = await request('/theme.m4a', { method: 'HEAD', headers: { range: 'bytes=0-1' } });
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '10'); assert.equal(head.headers.get('content-range'), null); assert.equal(await head.text(), '');
  const empty = await request('/empty.m4a'); assert.equal(empty.status, 200); assert.equal(await empty.text(), '');
  const emptyRange = await request('/empty.m4a', { headers: { range: 'bytes=0-1' } }); assert.equal(emptyRange.status, 416); assert.equal(emptyRange.headers.get('content-range'), 'bytes */0'); await emptyRange.text();
  const html = await request('/', { headers: { range: 'bytes=0-1' } }); assert.equal(html.status, 200); assert.equal(await html.text(), 'Farwake');
  const missing = await request('/missing.m4a'); assert.equal(missing.status, 404); await missing.text();
  const traversal = await request('/%2e%2e%2ftheme.m4a'); assert.equal(traversal.status, 403); await traversal.text();
});
