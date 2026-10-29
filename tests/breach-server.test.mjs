import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createBreachServer } from '../server/breach-server.mjs';

const ORIGIN = 'https://dfe-breach.onrender.com';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'breach-network-'));
  const directory = join(root, 'public'); await mkdir(join(directory, 'vendor'), { recursive: true });
  await writeFile(join(root, 'secret.txt'), 'outside-document-root-secret');
  await writeFile(join(directory, '.env'), 'hidden-document-root-secret');
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>BREACH test</title><script id="breach-config" type="application/json">{"version":"0.4.0","coopServer":""}</script>');
  await writeFile(join(directory, 'app.mjs'), 'export const game = "BREACH";');
  await writeFile(join(directory, 'vendor', 'local.js'), 'export const vendor = true;');
  const app = createBreachServer({ directory, allowedOrigins: ORIGIN });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${app.server.address().port}`, sockets = [];
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(async () => { for (const client of sockets) client.socket.terminate(); await close(); await rm(root, { recursive: true, force: true }); });
  return { app, base, close, async client(path = '/ws', origin = ORIGIN) { const client = wire(base.replace('http:', 'ws:') + path, origin); sockets.push(client); await client.opened; return client; } };
}

function wire(url, origin) {
  const socket = new WebSocket(url, { headers: origin ? { Origin: origin } : {} });
  const messages = [], errors = []; let closed;
  socket.on('message', buffer => { messages.push(JSON.parse(buffer.toString())); });
  socket.on('error', error => errors.push(error));
  socket.on('close', (code, reason) => { closed = { code, reason: reason.toString() }; });
  const opened = new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  function wait(predicate, from = 0, timeout = 4000) {
    const found = messages.slice(from).find(predicate); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); socket.off('message', inspect); socket.off('close', ended); };
      const inspect = () => { const value = messages.slice(from).find(predicate); if (value) { cleanup(); resolve(value); } };
      const ended = () => { inspect(); cleanup(); reject(new Error(`Socket closed before expected message: ${JSON.stringify(messages.slice(-4))}`)); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for message: ${JSON.stringify(messages.slice(-4))}; ${errors.map(e => e.message).join(';')}`)); }, timeout);
      socket.on('message', inspect); socket.once('close', ended);
    });
  }
  function waitClosed(timeout = 4000) {
    if (closed) return Promise.resolve(closed);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket did not close')), timeout);
      socket.once('close', (code, reason) => { clearTimeout(timer); resolve({ code, reason: reason.toString() }); });
    });
  }
  return { socket, messages, opened, wait, waitClosed, send(message) { socket.send(typeof message === 'string' || Buffer.isBuffer(message) ? message : JSON.stringify(message)); } };
}

function get(base, path = '/', method = 'GET') {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: url.hostname, port: url.port, path, method }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject); request.end();
  });
}

function rejectedUpgrade(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('Upgrade was not rejected')); }, 3000);
    socket.on('error', () => {});
    socket.on('open', () => { clearTimeout(timer); socket.terminate(); reject(new Error('Unexpectedly accepted WebSocket upgrade')); });
    socket.on('unexpected-response', (request, response) => { clearTimeout(timer); response.resume(); const status = response.statusCode; socket.terminate(); resolve(status); });
  });
}

async function pair(f, mission = 'crosslink-11') {
  const host = await f.client(), guest = await f.client();
  host.send({ type: 'create', protocol: 2, name: 'Host', mission, difficulty: 'relaxed' });
  const ownerWelcome = await host.wait(m => m.type === 'welcome');
  guest.send({ type: 'join', protocol: 2, roomId: ownerWelcome.roomId, name: 'Guest' });
  const guestWelcome = await guest.wait(m => m.type === 'welcome');
  await host.wait(m => m.type === 'room' && m.room.players.length === 2);
  return { host, guest, ownerWelcome, guestWelcome };
}

test('HTTP health and static delivery expose only the public build and configure same-origin co-op', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const health = await get(f.base, '/health'); assert.equal(health.status, 200);
  const status = JSON.parse(health.body); assert.equal(status.ok, true); assert.equal(status.service, 'breach-rooms'); assert.equal(status.version, '0.4.0'); assert.equal(status.protocol, 2); assert.equal(status.activeRooms, 0);
  assert.equal(health.headers['cache-control'], 'no-store');
  const page = await get(f.base); assert.equal(page.status, 200); assert.match(page.body, /"coopServer":"same-origin"/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff'); assert.match(page.headers['content-type'], /text\/html/);
  const head = await get(f.base, '/', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, ''); assert.equal(head.headers['content-length'], page.headers['content-length']);
  const asset = await get(f.base, '/app.mjs'); assert.equal(asset.status, 200); assert.match(asset.headers['content-type'], /javascript/);
  assert.equal((await get(f.base, '/vendor/local.js')).headers['cache-control'], 'public, max-age=86400');
  for (const path of ['/%2e%2e%2fsecret.txt', '/..%2fsecret.txt', '/.env', '/%00', '/missing.mjs']) {
    const blocked = await get(f.base, path); assert.equal(blocked.status, 404, path); assert.ok(!blocked.body.includes('secret'));
  }
  assert.equal((await get(f.base, '/%ZZ')).status, 400);
  const post = await get(f.base, '/', 'POST'); assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
});

test('WebSocket upgrade rejects foreign or malformed origins and wrong endpoints', { timeout: 10000 }, async t => {
  const f = await fixture(t), ws = f.base.replace('http:', 'ws:');
  for (const origin of ['https://unrelated.example', 'not-a-valid-origin']) assert.equal(await rejectedUpgrade(ws + '/ws', origin), 403);
  assert.equal(await rejectedUpgrade(ws + '/wrong-path', ORIGIN), 403);
  const sameOrigin = await f.client('/ws', f.base); sameOrigin.send({ type: 'ping', sentAt: 41 });
  assert.equal((await sameOrigin.wait(m => m.type === 'pong')).sentAt, 41);
});

test('malformed JSON is recoverable, while binary and oversized messages close only the offending connection', { timeout: 10000 }, async t => {
  const f = await fixture(t), malformed = await f.client();
  malformed.send('{'); assert.equal((await malformed.wait(m => m.type === 'error')).code, 'INVALID_MESSAGE');
  let cursor = malformed.messages.length; malformed.send([]);
  assert.equal((await malformed.wait(m => m.type === 'error', cursor)).code, 'INVALID_MESSAGE');
  cursor = malformed.messages.length; malformed.send({ type: 'create', protocol: 99, name: 'Guest', mission: 'crosslink-11', difficulty: 'standard' });
  assert.equal((await malformed.wait(m => m.type === 'error', cursor)).code, 'VERSION_MISMATCH');
  malformed.send({ type: 'ping', sentAt: 52 }); assert.equal((await malformed.wait(m => m.type === 'pong')).sentAt, 52);
  malformed.send(Buffer.from([1, 2, 3])); assert.equal((await malformed.waitClosed()).code, 1008);
  const oversized = await f.client(); oversized.send('x'.repeat(2049)); assert.equal((await oversized.waitClosed()).code, 1009);
  const survivor = await f.client(); survivor.send({ type: 'ping', sentAt: 63 }); assert.equal((await survivor.wait(m => m.type === 'pong')).sentAt, 63);
  assert.equal(JSON.parse((await get(f.base, '/health')).body).ok, true);
});

test('two actual WebSocket clients share authoritative play, expire inputs, pause, reconnect, and leave', { timeout: 15000 }, async t => {
  const f = await fixture(t), { host, guest, ownerWelcome, guestWelcome } = await pair(f);
  host.send({ type: 'start' }); assert.equal((await host.wait(m => m.type === 'error')).code, 'NOT_READY');
  guest.send({ type: 'start' }); assert.equal((await guest.wait(m => m.type === 'error')).code, 'OWNER_ONLY');
  host.send({ type: 'ready', ready: true }); guest.send({ type: 'ready', ready: true });
  await host.wait(m => m.type === 'room' && m.room.players.every(p => p.ready)); host.send({ type: 'start' });
  const initial = await host.wait(m => m.type === 'state' && m.state.status === 'playing');
  const matching = await guest.wait(m => m.type === 'state' && m.tick === initial.tick);
  assert.deepEqual(initial.state, matching.state); assert.deepEqual(Object.keys(initial.state.players), ['p1', 'p2']);
  assert.equal(initial.state.player, undefined, 'Each client chooses its own local-player view');
  const start1 = initial.state.players.p1, start2 = initial.state.players.p2;
  const ammo = p => p.ammo.pistol + p.ammo.shells;
  // Back away from the landing's ammunition pickup so consuming a shot is
  // observable without conflating firing with an unrelated pickup reward.
  host.send({ type: 'input', seq: 1, forward: -1, strafe: 0, angle: 0, fire: true, x: 999, health: 999, dt: 99 });
  guest.send({ type: 'input', seq: 1, forward: 0, strafe: 1, angle: 0, fire: false });
  const moved = await host.wait(m => m.type === 'state' && m.ackByPlayer.p1 === 1 && m.ackByPlayer.p2 === 1 && m.tick >= initial.tick + 6);
  assert.ok(moved.state.players.p1.z > start1.z + .1); assert.ok(moved.state.players.p2.x > start2.x + .1);
  assert.ok(Math.abs(moved.state.players.p1.x - start1.x) < .001); assert.ok(Math.abs(moved.state.players.p2.z - start2.z) < .001);
  assert.ok(ammo(moved.state.players.p1) < ammo(start1)); assert.equal(ammo(moved.state.players.p2), ammo(start2));
  assert.ok(moved.state.players.p1.health <= 100); assert.ok(moved.state.time < 2, 'Client dt cannot speed up the server world');
  const expired = await host.wait(m => m.type === 'state' && m.tick >= moved.tick + 15);
  const later = await host.wait(m => m.type === 'state' && m.tick >= expired.tick + 9);
  for (const id of ['p1', 'p2']) { assert.equal(later.state.players[id].x, expired.state.players[id].x); assert.equal(later.state.players[id].z, expired.state.players[id].z); }

  let cursor = host.messages.length; host.send({ type: 'pause', reason: 'menu' });
  const paused = await host.wait(m => m.type === 'state' && m.state.status === 'paused', cursor);
  host.send({ type: 'resume' });
  await host.wait(m => m.type === 'room' && m.room.status === 'paused' && m.room.players.find(p => p.id === 'p1').ready, cursor);
  cursor = host.messages.length; guest.send({ type: 'resume' });
  const resumed = await host.wait(m => m.type === 'state' && m.state.status === 'playing', cursor);
  assert.equal(resumed.state.time, paused.state.time);

  cursor = host.messages.length; guest.socket.close(1000, 'Test reconnect'); await guest.waitClosed();
  await host.wait(m => m.type === 'room' && m.room.status === 'paused' && !m.room.players.find(p => p.id === 'p2').connected, cursor);
  const returned = await f.client();
  returned.send({ type: 'join', protocol: 2, roomId: ownerWelcome.roomId, name: 'Returned', token: guestWelcome.token });
  const welcome = await returned.wait(m => m.type === 'welcome'); assert.equal(welcome.selfId, 'p2'); assert.equal(welcome.resumed, true);
  const rejoined = await returned.wait(m => m.type === 'state'); assert.equal(rejoined.state.status, 'paused');
  assert.equal(rejoined.state.players.p2.x, later.state.players.p2.x);
  cursor = host.messages.length; host.send({ type: 'resume' }); returned.send({ type: 'resume' });
  await host.wait(m => m.type === 'state' && m.state.status === 'playing', cursor);
  for (const client of [host, guest, returned]) for (const message of client.messages.filter(m => m.type !== 'welcome')) {
    const raw = JSON.stringify(message); assert.ok(!raw.includes(ownerWelcome.token)); assert.ok(!raw.includes(guestWelcome.token));
  }
  cursor = host.messages.length; const guestCursor = returned.messages.length; host.send({ type: 'leave' });
  assert.match((await host.wait(m => m.type === 'closed', cursor)).message, /Host left/);
  assert.match((await returned.wait(m => m.type === 'closed', guestCursor)).message, /Host left/);
  assert.equal((await returned.waitClosed()).code, 1000);
  assert.equal(JSON.parse((await get(f.base, '/health')).body).activeRooms, 0);
});

test('the large Underworks mission starts over the real room transport with shared upgrade state', { timeout: 10000 }, async t => {
  const f = await fixture(t), { host, guest, ownerWelcome } = await pair(f, 'underworks-13');
  assert.equal(ownerWelcome.protocol, 2);
  host.send({ type: 'ready', ready: true }); guest.send({ type: 'ready', ready: true });
  await host.wait(m => m.type === 'room' && m.room.players.every(p => p.ready));
  host.send({ type: 'start' });
  const initial = await host.wait(m => m.type === 'state' && m.state.status === 'playing');
  const matching = await guest.wait(m => m.type === 'state' && m.tick === initial.tick);
  assert.equal(initial.state.missionId, 'underworks-13');
  assert.equal(initial.state.levelId, 'underworks-13-v1');
  assert.deepEqual(initial.state.upgrades, { cutter: false, insulator: false, phase: false });
  assert.deepEqual(matching.state, initial.state);
  assert.ok(initial.state.enemies.length >= 30);
  assert.ok(initial.state.interactables.some(item => item.type === 'refuge'));
  assert.ok(initial.state.interactables.some(item => item.type === 'transit'));
  const oldClient = await f.client();
  oldClient.send({ type: 'join', protocol: 1, roomId: ownerWelcome.roomId, name: 'Old client' });
  assert.equal((await oldClient.wait(m => m.type === 'error')).code, 'VERSION_MISMATCH');
});

test('service shutdown delivers an explanation to both real room clients', { timeout: 10000 }, async t => {
  const f = await fixture(t), { host, guest } = await pair(f);
  const hostClosed = host.wait(m => m.type === 'closed'), guestClosed = guest.wait(m => m.type === 'closed');
  await f.close();
  assert.match((await hostClosed).message, /restarting/); assert.match((await guestClosed).message, /restarting/);
  await host.waitClosed(); await guest.waitClosed();
});
