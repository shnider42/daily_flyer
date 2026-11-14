import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { WebSocket } from '../vendor/ws/wrapper.mjs';
import { createGameServer } from '../server.mjs';

async function fixture(t, options = {}) {
  let clock = 100000;
  const game = createGameServer({ now: () => clock, automaticTicks: false, heartbeatMs: 60000, ...options });
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${game.server.address().port}`;
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.socket.terminate();
    await game.close();
  });
  return { ...game, address, url: `http://${address}`, ws: `ws://${address}/ws`,
    advance(ms, dt = ms / 1000) { clock += ms; game.tick(dt); },
    async connect() {
      const client = await connect(`ws://${address}/ws`, { origin: `http://${address}` });
      clients.push(client); return client;
    } };
}
async function connect(url, options = {}) {
  const socket = new WebSocket(url, options), messages = [], waiters = [], closures = [];
  let closed = null;
  socket.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message);
    } else messages.push(message);
  });
  socket.on('close', (code, reason) => {
    closed = { code, reason: reason.toString() };
    for (const resolve of closures) resolve(closed);
  });
  socket.on('error', () => {});
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const next = (predicate, timeout = 4000) => {
    const index = messages.findIndex(predicate);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1);
        reject(new Error('Timed out waiting for game message. Queued: ' + messages.map(m => m.type).join(', ')));
      }, timeout);
      waiters.push(waiter);
    });
  };
  return { socket, messages, next, send(value) { socket.send(JSON.stringify(value)); },
    close() { socket.close(); },
    closed() { return closed ? Promise.resolve(closed) : new Promise(resolve => closures.push(resolve)); },
    async request(value, predicate) { const pending = next(predicate); socket.send(JSON.stringify(value)); return pending; },
    async sync() { return this.request({ type: 'ping', at: 42 }, m => m.type === 'pong' && m.at === 42); } };
}
const welcome = message => message.type === 'welcome';
const error = message => message.type === 'error';
const phase = expected => message => message.type === 'snapshot' && message.snapshot.phase === expected;

test('ten real WebSocket clients share one authoritative match; the eleventh cannot take a seat', async t => {
  const game = await fixture(t);
  const host = await game.connect();
  const first = await host.request({ type: 'create', name: 'Host', public: false }, welcome);
  const players = [{ client: host, welcome: first }];
  for (let i = 1; i < 10; i++) {
    const client = await game.connect();
    const joined = await client.request({ type: 'join', code: first.code, name: `Guest ${i}`, color: i }, welcome);
    players.push({ client, welcome: joined });
  }
  assert.equal(new Set(players.map(p => p.welcome.playerId)).size, 10);
  assert.equal(new Set(players.map(p => p.welcome.token)).size, 10);
  assert.equal(players[9].welcome.lobby.players.filter(p => !p.bot && p.connected).length, 10);
  assert.equal(players[9].welcome.snapshot.players.length, 10);
  const extra = await game.connect();
  const full = await extra.request({ type: 'join', code: first.code, name: 'Eleventh' }, error);
  assert.match(full.message, /ten.*taken/i);
  const unauthorized = await players[1].client.request({ type: 'start' }, error);
  assert.match(unauthorized.message, /host/i);
  const starts = players.map(({ client }) => client.next(phase('drop')));
  host.send({ type: 'start' });
  const snapshots = await Promise.all(starts);
  assert.equal(new Set(snapshots.map(packet => packet.snapshot.id)).size, 1);
  assert.notEqual(snapshots[0].snapshot.id, first.snapshot.id);
  assert.equal(snapshots[0].snapshot.players.filter(p => !p.bot).length, 10);
  const serialized = JSON.stringify(snapshots);
  for (const player of players) assert.equal(serialized.includes(player.welcome.token), false, 'Seat tokens must stay out of broadcasts');
  // Advance the actual simulation and make sure every connection sees the same world time.
  const next = players.map(({ client }) => client.next(m => m.type === 'snapshot' && m.snapshot.time > 0));
  game.advance(100, .1);
  const ticks = await Promise.all(next);
  assert.equal(new Set(ticks.map(packet => packet.snapshot.time)).size, 1);
  assert.ok(ticks[0].snapshot.time > 0);
});

test('reconnect keeps life and identity, resets input sequence, and cannot be detached by an older socket', async t => {
  const game = await fixture(t);
  const host = await game.connect();
  const initial = await host.request({ type: 'create', name: 'Original' }, welcome);
  const guest = await game.connect();
  const second = await guest.request({ type: 'join', code: initial.code, name: 'New host' }, welcome);
  const room = game.rooms.get(initial.code);
  room.match.players[initial.playerId].hp = 73;
  const movedHost = guest.next(m => m.type === 'lobby' && m.lobby.hostId === second.playerId);
  host.close(); await host.closed(); await movedHost;
  const returning = await game.connect();
  const resumed = await returning.request({ type: 'resume', code: initial.code, token: initial.token }, welcome);
  assert.equal(resumed.playerId, initial.playerId);
  assert.equal(resumed.token, initial.token);
  assert.equal(resumed.lastSeq, 0);
  assert.equal(resumed.snapshot.players[initial.playerId].hp, 73);
  assert.equal(resumed.hostId, second.playerId, 'Returning original host does not steal host control');
  assert.equal(resumed.snapshot.players.filter(p => !p.bot).length, 2);
  const replacement = await game.connect();
  await replacement.request({ type: 'resume', code: initial.code, token: initial.token }, welcome);
  assert.equal((await returning.closed()).code, 4001);
  await replacement.sync();
  assert.ok(room.seats[initial.playerId].connection, 'Old socket close must leave replacement connected');
  const intruder = await game.connect();
  assert.match((await intruder.request({ type: 'resume', code: initial.code, token: '0'.repeat(48) }, error)).message, /seat.*expired/i);
  replacement.close(); await replacement.closed(); await guest.sync();
  game.advance(120001, 0);
  assert.equal(room.seats[initial.playerId].human, false);
  assert.equal(room.match.players[initial.playerId].bot, true);
  const late = await game.connect();
  assert.match((await late.request({ type: 'resume', code: initial.code, token: initial.token }, error)).message, /seat.*expired/i);
});

test('server accepts intent only, rejects replayed sequences and stale rounds, and expires held controls', async t => {
  const game = await fixture(t);
  const host = await game.connect();
  const initial = await host.request({ type: 'create', name: 'Authority' }, welcome);
  const drop = await host.request({ type: 'start' }, phase('drop'));
  const room = game.rooms.get(initial.code), seat = room.seats[initial.playerId];
  const before = { x: room.match.players[0].x, hp: room.match.players[0].hp };
  host.send({ type: 'input', matchId: drop.snapshot.id, seq: 1, input: {
    moveX: 9999, moveZ: 9999, yaw: 1e20, pitch: -9999, aimYaw: .37, aimPitch: .22, sprint: true, fire: 'true',
    x: 900000, hp: 1000000, damage: 1000000, ammo: [1000000], bot: false,
  } });
  await host.sync();
  assert.ok(Number.isFinite(seat.input.yaw));
  assert.ok(Math.abs(seat.input.aimYaw - .37) < .000001, 'Camera-reticle aiming must reach the authoritative engine independently of body yaw');
  assert.equal(seat.input.aimPitch, .22);
  assert.ok(Math.abs(seat.input.moveX) <= 1 && Math.abs(seat.input.moveZ) <= 1);
  assert.equal(seat.input.fire, false);
  assert.equal(Object.hasOwn(seat.input, 'hp'), false);
  assert.equal(Object.hasOwn(seat.input, 'x'), false);
  assert.equal(room.match.players[0].hp, before.hp);
  assert.equal(room.match.players[0].x, before.x);
  const accepted = { ...seat.input };
  host.send({ type: 'input', matchId: drop.snapshot.id, seq: 1, input: { moveX: -1, moveZ: 0 } });
  host.send({ type: 'input', matchId: initial.snapshot.id, seq: 999, input: { moveX: -1, moveZ: 0 } });
  await host.sync();
  assert.deepEqual(seat.input, accepted);
  const actions = [], action = room.match.action.bind(room.match);
  room.match.action = (...args) => { actions.push(args); return action(...args); };
  host.send({ type: 'action', matchId: drop.snapshot.id, seq: 2, action: 'reload' });
  host.send({ type: 'action', matchId: drop.snapshot.id, seq: 2, action: 'reload' });
  host.send({ type: 'action', matchId: initial.snapshot.id, seq: 1000, action: 'heal' });
  host.send({ type: 'action', matchId: drop.snapshot.id, seq: 3, action: 'shield' });
  await host.sync();
  assert.deepEqual(actions.map(args => args[1]), ['reload', 'shield']);
  let latestInputs;
  const step = room.match.step.bind(room.match);
  room.match.step = (dt, inputs) => { latestInputs = inputs; return step(dt, inputs); };
  game.advance(401, 1 / 30);
  assert.equal(latestInputs.has(initial.playerId), false, 'A stuck held control must expire after400ms');
  // Force only the match boundary; rematch itself and stale packet handling go through the socket.
  room.match.phase = 'finished';
  const reset = await host.request({ type: 'rematch' }, phase('lobby'));
  assert.notEqual(reset.snapshot.id, drop.snapshot.id);
  assert.equal(reset.snapshot.players[0].name, 'Authority');
  host.send({ type: 'input', matchId: drop.snapshot.id, seq: 1001, input: { fire: true } });
  await host.sync();
  assert.equal(seat.input, null);
  const again = await host.request({ type: 'start' }, message => phase('drop')(message) && message.snapshot.id !== drop.snapshot.id);
  host.send({ type: 'input', matchId: again.snapshot.id, seq: 4, input: { moveX: 0, moveZ: 1, yaw: 0, pitch: 0 } });
  await host.sync();
  assert.equal(seat.input.moveZ, 1, 'A stale round must not poison the sequence for the current round');
});

test('quick play fills open lobby slots with bots, counts down12s, then routes new players to a new island', async t => {
  const game = await fixture(t);
  const host = await game.connect();
  const initial = await host.request({ type: 'quick', name: 'Quick' }, welcome);
  assert.equal(initial.lobby.public, true);
  assert.equal(initial.lobby.countdown, 12);
  assert.equal(initial.lobby.players.filter(p => p.bot).length, 9);
  const guest = await game.connect();
  const second = await guest.request({ type: 'quick', name: 'Also quick' }, welcome);
  assert.equal(second.code, initial.code);
  game.advance(11999, 0);
  assert.equal(game.rooms.get(initial.code).match.phase, 'lobby');
  const started = host.next(phase('drop'));
  game.advance(1, 0); await started;
  const later = await game.connect();
  const third = await later.request({ type: 'quick', name: 'Next match' }, welcome);
  assert.notEqual(third.code, initial.code);
  const direct = await game.connect();
  assert.match((await direct.request({ type: 'join', code: initial.code, name: 'Late' }, error)).message, /already underway/i);
});

test('leaving frees a seat and migrates host without stopping the remaining match', async t => {
  const game = await fixture(t);
  const host = await game.connect();
  const initial = await host.request({ type: 'create', name: 'Leaving' }, welcome);
  const guest = await game.connect();
  const joined = await guest.request({ type: 'join', code: initial.code, name: 'Staying' }, welcome);
  await host.request({ type: 'start' }, phase('drop'));
  const migrated = guest.next(m => m.type === 'lobby' && m.lobby.hostId === joined.playerId);
  host.send({ type: 'leave' });
  const newLobby = await migrated;
  assert.equal((await host.closed()).code, 1000);
  assert.equal(newLobby.lobby.players[initial.playerId].bot, true);
  assert.equal(game.rooms.get(initial.code).match.phase, 'drop');
  assert.equal(game.rooms.get(initial.code).seats[initial.playerId].token, null);
});

test('malformed, oversized, binary and cross-origin messages do not become gameplay authority', async t => {
  const game = await fixture(t);
  const anonymous = await game.connect();
  assert.match((await anonymous.request({ type: 'input', seq: 1, matchId: 'fake', input: { x: 1000 } }, error)).message, /join/i);
  const badJson = anonymous.next(error); anonymous.socket.send('{not json');
  assert.match((await badJson).message, /JSON/i);
  assert.match((await anonymous.request([], error)).message, /valid game message/i);
  const valid = await anonymous.request({ type: 'create', name: '<Guest>\u0000', options: { difficulty: 'impossible' } }, welcome);
  assert.equal(valid.snapshot.players[valid.playerId].name, 'Guest');
  assert.equal(valid.lobby.options.difficulty, 'regular');
  const oversized = await game.connect();
  oversized.socket.send(JSON.stringify({ type: 'create', name: 'x'.repeat(9000) }));
  assert.equal((await oversized.closed()).code, 1009);
  const binary = await game.connect();
  binary.socket.send(Buffer.from('{}'));
  assert.equal((await binary.closed()).code, 1003);
  const status = await new Promise(resolve => {
    const rejected = new WebSocket(game.ws, { origin: 'https://unrelated.example' });
    rejected.on('unexpected-response', (_req, response) => { response.resume(); rejected.terminate(); resolve(response.statusCode); });
    rejected.on('error', () => {});
  });
  assert.equal(status, 403);
  assert.equal((await fetch(game.url + '/health')).status, 200);
});

test('one flood-limited connection does not prevent another player on the same address sending input', async t => {
  const game = await fixture(t);
  const host = await game.connect();
  const initial = await host.request({ type: 'create', name: 'Flood' }, welcome);
  const guest = await game.connect();
  const other = await guest.request({ type: 'join', code: initial.code, name: 'Normal' }, welcome);
  const started = await host.request({ type: 'start' }, phase('drop'));
  const limited = host.next(error);
  for (let i = 0; i < 150; i++) host.send({ type: 'ping', at: i });
  assert.match((await limited).message, /too many/i);
  guest.send({ type: 'input', matchId: started.snapshot.id, seq: 1, input: { moveX: 1, moveZ: 0, yaw: 0, pitch: 0 } });
  await guest.sync();
  assert.equal(game.rooms.get(initial.code).seats[other.playerId].input.moveX, 1);
});

test('room capacity is bounded and expired rooms release capacity', async t => {
  const game = await fixture(t, { maxRooms: 2, idleMs: 1000 });
  const a = await game.connect(), b = await game.connect(), c = await game.connect();
  await a.request({ type: 'create', name: 'A' }, welcome);
  await b.request({ type: 'create', name: 'B' }, welcome);
  assert.match((await c.request({ type: 'create', name: 'C' }, error)).message, /all islands/i);
  game.advance(1001, 0);
  assert.equal(game.rooms.size, 0);
  const admitted = await c.request({ type: 'create', name: 'C' }, welcome);
  assert.equal(admitted.playerId, 0);
  assert.equal(game.rooms.size, 1);
});

function request(address, target, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://${address}`, { path: target, headers, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

test('HTTP assets support gzip, cache validation and HEAD while denying traversal and symlink escapes', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'skybreak-http-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const publicRoot = path.join(temporary, 'public');
  await mkdir(path.join(publicRoot, 'vendor'), { recursive: true });
  const html = '<!doctype html><title>Skybreak</title>';
  const javascript = 'export const coastline = ' + JSON.stringify('island '.repeat(400)) + ';';
  await writeFile(path.join(publicRoot, 'index.html'), html);
  await writeFile(path.join(publicRoot, 'world.mjs'), javascript);
  await writeFile(path.join(publicRoot, 'vendor', 'engine.js'), javascript);
  await writeFile(path.join(temporary, 'private.txt'), 'Not public');
  await symlink(path.join(temporary, 'private.txt'), path.join(publicRoot, 'escape.txt'));
  const game = await fixture(t, { publicRoot });
  const root = await request(game.address, '/?room=ABC234');
  assert.equal(root.status, 200);
  assert.equal(root.body.toString(), html);
  assert.equal(root.headers['cache-control'], 'no-store');
  assert.equal(root.headers['x-content-type-options'], 'nosniff');
  const compressed = await request(game.address, '/world.mjs', { 'Accept-Encoding': 'gzip' });
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(compressed.body).toString(), javascript);
  assert.equal(compressed.headers['cache-control'], 'no-cache');
  const cached = await request(game.address, '/world.mjs', { 'If-None-Match': compressed.headers.etag });
  assert.equal(cached.status, 304);
  const head = await request(game.address, '/world.mjs', {}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  assert.equal(+head.headers['content-length'], Buffer.byteLength(javascript));
  assert.match((await request(game.address, '/vendor/engine.js')).headers['cache-control'], /max-age=86400/);
  for (const target of ['/../private.txt', '/%2e%2e/private.txt', '/%2e%2e%2fprivate.txt', '/.env', '/%00world.mjs', '/..%5cprivate.txt', '/escape.txt', '/server.mjs']) {
    assert.equal((await request(game.address, target)).status, 404, target);
  }
  assert.equal((await request(game.address, '/', {}, 'POST')).status, 405);
  const health = JSON.parse((await request(game.address, '/health')).body.toString());
  assert.equal(health.ok, true); assert.equal(health.maxPlayers, 10);
});
