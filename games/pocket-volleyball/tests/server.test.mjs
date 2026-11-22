import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createServer, normalizeInput } from '../server.mjs';
import * as simulation from '../public/sim.mjs';

// Tiny deterministic authority isolates socket behavior from volleyball balance.
const transportSimulation = {
  createMatch: options => ({ options, time: 0, phase: 'serve', score: [0, 0], players: [
    { id: 0, x: -5, y: 0 }, { id: 1, x: 5, y: 0 },
  ] }),
  step: (game, dt, inputs) => {
    game.time += dt;
    game.lastInput = structuredClone(inputs);
    for (let i = 0; i < 2; i++) { game.players[i].x += inputs[i].mx * dt; game.players[i].y += inputs[i].my * dt; }
  },
  snapshot: game => structuredClone(game),
};

async function client(url, options = {}) {
  const socket = new WebSocket(url, options), inbox = [], waiters = [];
  socket.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    const index = waiters.findIndex(waiter => waiter.match(message));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message);
    } else inbox.push(message);
  });
  await once(socket, 'open');
  return {
    socket, inbox,
    send: message => socket.send(JSON.stringify(message)),
    next(type, predicate = () => true) {
      const match = message => message.type === type && predicate(message);
      const index = inbox.findIndex(match);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve };
        waiter.timer = setTimeout(() => {
          const at = waiters.indexOf(waiter); if (at >= 0) waiters.splice(at, 1);
          reject(new Error(`Timed out waiting for ${type}; inbox: ${JSON.stringify(inbox)}`));
        }, 2000);
        waiters.push(waiter);
      });
    },
    async flush() { const sent = Math.random(); this.send({ type: 'ping', sent }); return this.next('pong', message => message.sent === sent); },
    async disconnect() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const done = once(socket, 'close'); socket.close(); await done;
    },
  };
}

async function fixture(t, options = {}) {
  let time = 1000;
  const root = await mkdtemp(path.join(tmpdir(), 'pocket-volleyball-server-'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Pocket Volleyball</title>');
  await writeFile(path.join(root, 'app.mjs'), 'export const version = 1;');
  const app = createServer({ port: 0, host: '127.0.0.1', publicRoot: root, automaticTicks: false,
    sim: transportSimulation, now: () => time, ...options });
  const address = await app.listen(), url = `http://127.0.0.1:${address.port}`, wsUrl = url.replace('http:', 'ws:') + '/ws';
  const clients = [];
  t.after(async () => { for (const connection of clients) connection.socket.terminate(); await app.close(); await rm(root, { recursive: true, force: true }); });
  return { app, url, wsUrl, root, advance: ms => { time += ms; },
    async connect() { const connection = await client(wsUrl); clients.push(connection); return connection; } };
}
async function create(connection, options = {}) {
  connection.send({ type: 'create', mode: 'versus', difficulty: 'club', target: 11, ...options });
  return connection.next('welcome');
}
async function join(connection, code) { connection.send({ type: 'join', code }); return connection.next('welcome'); }
async function pair(f, options = {}) {
  const a = await f.connect(), b = await f.connect(), host = await create(a, options), guest = await join(b, host.code);
  a.send({ type: 'start' }); await Promise.all([a.next('started'), b.next('started')]);
  return { a, b, host, guest, room: f.app.rooms.get(host.code) };
}
function rawGet(url, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = http.get({ host: parsed.hostname, port: parsed.port, path: requestPath, headers }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
  });
}

test('two real sockets share one authority; only host starts and private tokens never leak', async t => {
  const f = await fixture(t), a = await f.connect(), b = await f.connect();
  const host = await create(a, { mode: 'coop', difficulty: 'pro', target: 21 });
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(host.seat, 0); assert.equal(host.isHost, true);
  a.send({ type: 'start' }); assert.equal((await a.next('error')).code, 'NEED_TWO_PLAYERS');
  const guest = await join(b, host.code.toLowerCase());
  assert.equal(guest.seat, 1); assert.equal(guest.isHost, false); assert.notEqual(guest.token, host.token);
  assert.equal(guest.state.options.mode, 'coop'); assert.equal(guest.state.options.difficulty, 'pro');
  b.send({ type: 'start' }); assert.equal((await b.next('error')).code, 'HOST_ONLY');
  const third = await f.connect(); third.send({ type: 'join', code: host.code });
  assert.equal((await third.next('error')).code, 'ROOM_FULL');
  a.send({ type: 'start' }); await Promise.all([a.next('started'), b.next('started')]);
  a.send({ type: 'input', seq: 1, input: { mx: 1, my: 0, pass: true, score: [999, 0], x: 100000 } });
  b.send({ type: 'input', seq: 1, input: { mx: 0, my: -1, spike: true } });
  await Promise.all([a.flush(), b.flush()]); f.app.tick();
  const [sa, sb] = await Promise.all([a.next('state', m => m.tick === 1), b.next('state', m => m.tick === 1)]);
  assert.deepEqual(sa.state, sb.state);
  assert.ok(sa.state.players[0].x > -5 && sa.state.players[0].x < -4.9);
  assert.ok(sa.state.players[1].y < 0);
  assert.deepEqual(sa.state.score, [0, 0]);
  for (const message of [sa, sb, ...a.inbox, ...b.inbox]) {
    assert.ok(!JSON.stringify(message).includes(host.token)); assert.ok(!JSON.stringify(message).includes(guest.token));
  }
  b.send({ type: 'rematch' }); assert.equal((await b.next('error')).code, 'HOST_ONLY');
  a.send({ type: 'rematch' }); const fresh = await a.next('started');
  assert.equal(fresh.state.time, 0); assert.deepEqual(fresh.state.score, [0, 0]);
});

test('disconnect reserves the seat, freezes play and requires both players to resume after authenticated reconnect', async t => {
  const f = await fixture(t), { a, b, host, guest, room } = await pair(f);
  a.send({ type: 'input', seq: 1, input: { mx: 1 } }); await a.flush(); f.app.tick();
  await b.disconnect();
  await a.next('lobby', message => message.paused && message.players.some(player => player.seat === 1 && !player.connected));
  const frozen = structuredClone(room.game); f.advance(500); f.app.tick(); assert.deepEqual(room.game, frozen);
  const other = await f.connect(); other.send({ type: 'join', code: host.code }); assert.equal((await other.next('error')).code, 'ROOM_FULL');
  other.send({ type: 'reconnect', code: host.code, token: '0'.repeat(48) }); assert.equal((await other.next('error')).code, 'RECONNECT_EXPIRED');
  other.send({ type: 'reconnect', code: host.code, token: guest.token });
  const welcome = await other.next('welcome');
  assert.equal(welcome.seat, 1); assert.equal(welcome.token, guest.token); assert.equal(welcome.paused, true);
  other.send({ type: 'ready', ready: true }); await other.flush();
  assert.equal(room.paused, true);
  a.send({ type: 'ready', ready: true }); await a.flush();
  assert.equal(room.paused, false);
  f.app.tick(); assert.ok(room.game.time > frozen.time);
  other.send({ type: 'pause' }); await other.flush();
  assert.equal(room.paused, true); assert.deepEqual([...room.seats.values()].map(seat => seat.ready), [false, false]);
});

test('an expired reservation is replaceable, and a room restart cannot reuse the old token', async t => {
  const f = await fixture(t), { a, b, host, guest, room } = await pair(f);
  await b.disconnect(); await a.next('lobby', m => m.paused);
  f.advance(90001); f.app.sweep();
  assert.equal(room.seats.size, 1);
  const replacement = await f.connect();
  replacement.send({ type: 'reconnect', code: host.code, token: guest.token });
  assert.equal((await replacement.next('error')).code, 'RECONNECT_EXPIRED');
  const next = await join(replacement, host.code);
  assert.equal(next.seat, 1); assert.notEqual(next.token, guest.token); assert.equal(next.paused, true);
  a.send({ type: 'rematch' }); assert.equal((await a.next('started')).paused, false);
  replacement.send({ type: 'leave' }); await replacement.next('left');
  await a.next('lobby', m => m.paused && m.players.length === 1);
  a.send({ type: 'rematch' }); assert.equal((await a.next('error')).code, 'NEED_TWO_PLAYERS');
});

test('only bounded finite inputs apply; repeated sequences expire; a stalled connection pauses the match', async t => {
  assert.equal(normalizeInput({ mx: NaN }), null);
  assert.equal(normalizeInput({ my: Infinity }), null);
  assert.equal(normalizeInput({ mx: '1' }), null);
  const normalized = normalizeInput({ mx: 200, my: 200, pass: 'yes', dive: true, x: 999 });
  assert.ok(Math.hypot(normalized.mx, normalized.my) <= 1.0000001);
  assert.equal(normalized.pass, false); assert.equal(normalized.dive, true); assert.equal(normalized.x, undefined);
  const f = await fixture(t), { a, b, room } = await pair(f);
  a.socket.send('not-json'); assert.equal((await a.next('error')).code, 'INVALID_MESSAGE');
  a.send({ type: 'input', seq: 1, input: { mx: '1' } }); assert.equal((await a.next('error')).code, 'INVALID_INPUT');
  a.send({ type: 'input', seq: 1, input: { mx: 1 } }); await a.flush(); f.app.tick();
  const firstX = room.game.players[0].x;
  a.send({ type: 'input', seq: 1, input: { mx: -1 } }); await a.flush(); f.app.tick();
  assert.ok(room.game.players[0].x > firstX);
  f.advance(251); f.app.tick();
  const staleX = room.game.players[0].x; f.app.tick(); assert.equal(room.game.players[0].x, staleX);
  f.advance(1250); f.app.tick(); assert.equal(room.paused, true); assert.match(room.reason, /stalled/);
  a.send({ type: 'input', seq: 2, input: { mx: 1 } }); b.send({ type: 'input', seq: 1, input: { mx: 1 } });
  await Promise.all([a.flush(), b.flush()]);
  assert.equal(room.paused, true); f.app.tick(); assert.equal(room.game.players[0].x, staleX);
});

test('HTTP serves bounded public assets, rejects traversal and foreign origins, and websocket payloads are bounded', async t => {
  const f = await fixture(t);
  const home = await rawGet(f.url, '/'); assert.equal(home.status, 200); assert.match(home.body, /Pocket Volleyball/);
  const health = JSON.parse((await rawGet(f.url, '/health')).body);
  assert.equal(health.simulationHz, 60); assert.equal(health.snapshotHz, 20); assert.equal(health.persistence, 'memory');
  for (const requestPath of ['/../package.json', '/%2e%2e/package.json', '/%2ehidden', '/%5c..%5cpackage.json', '/%00', '/%zz']) {
    assert.equal((await rawGet(f.url, requestPath)).status, 404, requestPath);
  }
  await symlink(path.resolve(f.root, '../'), path.join(f.root, 'outside'));
  assert.equal((await rawGet(f.url, '/outside/package.json')).status, 404);
  assert.equal((await rawGet(f.url, '/', { Origin: 'https://unrelated.example' })).status, 403);
  const asset = await rawGet(f.url, '/app.mjs');
  assert.equal((await rawGet(f.url, '/app.mjs', { 'If-None-Match': asset.headers.etag })).status, 304);
  const foreign = new WebSocket(f.wsUrl, { origin: 'https://unrelated.example' });
  const denied = await new Promise(resolve => { foreign.on('error', resolve); foreign.on('open', () => resolve(null)); });
  assert.match(denied.message, /403/);
  const oversized = await f.connect(); const closed = once(oversized.socket, 'close');
  oversized.socket.send(JSON.stringify({ type: 'ping', data: 'x'.repeat(3000) }));
  assert.equal((await closed)[0], 1009);
});

test('real volleyball simulation runs with two authenticated controllers and serializable snapshots', async t => {
  const f = await fixture(t, { sim: simulation }), { a, b, room } = await pair(f, { mode: 'versus', difficulty: 'chill' });
  a.send({ type: 'input', seq: 1, input: { mx: 0.5, pass: true } });
  b.send({ type: 'input', seq: 1, input: { my: 0.5, pass: true } });
  await Promise.all([a.flush(), b.flush()]);
  for (let frame = 0; frame < 180; frame++) f.app.tick();
  assert.equal(room.paused, false); assert.ok(room.game.time > 2.9); assert.equal(room.game.players.length, 4);
  assert.equal(room.game.options.mode, 'versus'); assert.equal(room.game.controls.length, 2);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(simulation.snapshot(room.game))));
  a.send({ type: 'sync' }); const state = await a.next('state', m => m.tick === 180);
  assert.equal(state.state.players.length, 4); assert.equal(state.paused, false);
});
