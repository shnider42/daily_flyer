import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createServer } from '../server.mjs';
import * as simulation from '../public/sim.mjs';

// A deliberately small authority isolates transport invariants from combat balance.
// The same server API is exercised with real WebSocket and HTTP clients.
const transportSimulation = {
  createGame: options => ({ ...options, tick: 0, phase: 'playing', players: new Map() }),
  addPlayer: (game, player) => {
    if (game.players.has(player.id)) { game.players.get(player.id).connected = true; return game.players.get(player.id); }
    const created = { ...player, connected: true, x: 100, y: 100, hp: 100, inventory: ['original-item'], input: {} };
    game.players.set(player.id, created); return created;
  },
  removePlayer: (game, id, { permanent = false } = {}) => {
    if (permanent) game.players.delete(id);
    else if (game.players.has(id)) game.players.get(id).connected = false;
  },
  setInput: (game, id, input) => { if (game.players.has(id)) game.players.get(id).input = input; },
  step: (game, dt) => { game.tick++; for (const player of game.players.values()) {
    player.x += (player.input.mx || 0) * 100 * dt;
    player.y += (player.input.my || 0) * 100 * dt;
  } },
  action: (game, id, command) => { game.lastAction = { id, ...command }; return true; },
  snapshot: game => ({ phase: game.phase, tick: game.tick, lastAction: game.lastAction,
    players: [...game.players.values()].map(({ input, ...player }) => ({ ...player })) }),
};

async function client(url) {
  const socket = new WebSocket(url);
  const inbox = [], waiters = [];
  socket.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    const index = waiters.findIndex(waiter => waiter.match(message));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message);
    } else inbox.push(message);
  });
  await once(socket, 'open');
  return {
    socket,
    send: message => socket.send(JSON.stringify(message)),
    next: (type, predicate = () => true) => {
      const match = message => message.type === type && predicate(message);
      const index = inbox.findIndex(match);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve };
        waiter.timer = setTimeout(() => {
          const at = waiters.indexOf(waiter); if (at >= 0) waiters.splice(at, 1);
          reject(new Error(`Timed out waiting for ${type}; messages: ${JSON.stringify(inbox)}`));
        }, 2500);
        waiters.push(waiter);
      });
    },
    async flush() {
      const stamp = Math.random(); socket.send(JSON.stringify({ type: 'ping', at: stamp }));
      return this.next('pong', message => message.at === stamp);
    },
    async disconnect() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const done = once(socket, 'close'); socket.close(); await done;
    },
  };
}

async function fixture(t, options = {}) {
  let time = 1000;
  const root = await mkdtemp(path.join(tmpdir(), 'gravebloom-server-'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>GRAVEBLOOM</title>');
  const app = createServer({ port: 0, host: '127.0.0.1', automaticTicks: false,
    publicRoot: root, sim: transportSimulation, now: () => time, ...options });
  const address = await app.listen();
  const url = `http://127.0.0.1:${address.port}`, wsUrl = url.replace('http:', 'ws:') + '/ws';
  const clients = [];
  t.after(async () => {
    for (const connection of clients) connection.socket.terminate();
    await app.close(); await rm(root, { recursive: true, force: true });
  });
  return { app, url, wsUrl, root, advance: ms => { time += ms; },
    async connect() { const connection = await client(wsUrl); clients.push(connection); return connection; } };
}

async function host(connection, classId = 'warrior') {
  connection.send({ type: 'host', name: 'Host', classId, difficulty: 'normal' });
  return connection.next('welcome');
}
async function join(connection, code, classId = 'archer') {
  connection.send({ type: 'join', code, name: 'Friend', classId });
  return connection.next('welcome');
}

test('two real clients share one authoritative state and only the host starts or chooses', async t => {
  const f = await fixture(t), a = await f.connect(), b = await f.connect();
  const first = await host(a), second = await join(b, first.code);
  assert.equal(second.code, first.code);
  assert.notEqual(first.playerId, second.playerId);
  b.send({ type: 'start' }); assert.match((await b.next('error')).message, /host/);
  a.send({ type: 'start' });
  await Promise.all([a.next('started'), b.next('started')]);
  b.send({ type: 'input', seq: 1, input: { mx: 1, my: 0, hp: 999999, x: 100000 } });
  await b.flush(); f.app.tick();
  const [s1, s2] = await Promise.all([a.next('state', m => m.state.tick === 1), b.next('state', m => m.state.tick === 1)]);
  assert.deepEqual(s1.state, s2.state);
  const player = s1.state.players.find(p => p.id === second.playerId);
  assert.ok(player.x > 100 && player.x < 104);
  assert.equal(player.hp, 100);
  assert.ok(!JSON.stringify(s1).includes(first.token));
  assert.ok(!JSON.stringify(s1).includes(second.token));
  b.send({ type: 'action', action: { type: 'choose', choice: 'harvest' } });
  assert.match((await b.next('error')).message, /host/);
  a.send({ type: 'action', action: { type: 'choose', choice: 'harvest', playerId: second.playerId } });
  const choice = await a.next('state', m => m.state.lastAction?.type === 'choose');
  assert.equal(choice.state.lastAction.id, first.playerId);
  assert.equal(choice.state.lastAction.playerId, undefined);
});

test('four seats are reserved across disconnect; reconnect preserves avatar and host migrates', async t => {
  const f = await fixture(t), a = await f.connect(), b = await f.connect(), c = await f.connect(), d = await f.connect();
  const first = await host(a), second = await join(b, first.code);
  await join(c, first.code, 'wizard'); await join(d, first.code);
  a.send({ type: 'start' }); await a.next('started');
  const extra = await f.connect(); extra.send({ type: 'join', code: first.code, name: 'Fifth' });
  assert.match((await extra.next('error')).message, /four players/);
  await a.disconnect();
  const migrated = await b.next('lobby', m => m.hostId === second.playerId && m.players.some(p => p.id === first.playerId && !p.connected));
  assert.equal(migrated.players.length, 4);
  extra.send({ type: 'join', code: first.code, name: 'Fifth' });
  assert.match((await extra.next('error')).message, /four players/);
  const resumed = await f.connect(); resumed.send({ type: 'resume', code: first.code, token: first.token });
  const welcome = await resumed.next('welcome');
  assert.equal(welcome.playerId, first.playerId);
  assert.equal(welcome.hostId, second.playerId);
  assert.equal(welcome.started, true);
  assert.deepEqual(welcome.state.players.find(p => p.id === first.playerId).inventory, ['original-item']);
  assert.equal(welcome.state.players.length, 4);
  await resumed.disconnect(); f.advance(91000); f.app.sweep();
  const late = await f.connect(); late.send({ type: 'resume', code: first.code, token: first.token });
  assert.match((await late.next('error')).message, /expired/);
  const replacement = await join(late, first.code);
  assert.notEqual(replacement.playerId, first.playerId);
});

test('bounded movement, duplicate sequences, malformed inputs and stale input fail safely', async t => {
  const f = await fixture(t), a = await f.connect();
  const first = await host(a); a.send({ type: 'start' }); await a.next('started');
  const room = f.app.rooms.get(first.code);
  a.send({ type: 'input', seq: 1, input: { mx: 99999, my: 0, aimX: 2000000 } });
  await a.flush(); f.app.tick();
  const p = room.game.players.get(first.playerId);
  assert.equal(p.input.mx, 1); assert.equal(p.input.aimX, 1000000);
  const x = p.x;
  a.send({ type: 'input', seq: 1, input: { mx: -1 } });
  await a.flush(); f.app.tick(); assert.ok(p.x > x);
  a.send({ type: 'input', seq: 2, input: { mx: 'Infinity' } });
  assert.match((await a.next('error')).message, /finite numbers/);
  assert.equal(p.input.mx, 1);
  const stopped = p.x; f.advance(300); f.app.tick(); assert.equal(p.x, stopped);
  a.send({ type: 'leave' }); await a.next('left');
  a.send({ type: 'resume', code: first.code, token: first.token });
  assert.match((await a.next('error')).message, /expired/);
});

test('HTTP serves only public assets and WebSocket origin checks reject foreign sites', async t => {
  const f = await fixture(t);
  const page = await fetch(f.url); assert.equal(page.status, 200); assert.match(await page.text(), /GRAVEBLOOM/);
  const health = await (await fetch(f.url + '/health')).json();
  assert.equal(health.capacity, 4); assert.equal(health.persistence, 'memory');
  for (const suffix of ['/server.mjs', '/%2e%2e/package.json', '/.env', '/%5csecret']) {
    assert.equal((await fetch(f.url + suffix)).status, 404);
  }
  assert.equal((await fetch(f.url, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  const hostile = new WebSocket(f.wsUrl, { origin: 'https://unrelated.example' });
  const failure = await once(hostile, 'error');
  assert.match(failure[0].message, /403/);
});

test('real combat authority preserves gear on resume, releases expired avatars and honors migrated leader', async t => {
  const f = await fixture(t, { sim: simulation }), a = await f.connect(), b = await f.connect();
  const first = await host(a), second = await join(b, first.code, 'wizard');
  const room = f.app.rooms.get(first.code);
  const originalWeapon = first.state.players.find(p => p.id === first.playerId).equipment.weapon.id;
  a.send({ type: 'start' }); await a.next('started');
  await a.disconnect(); await b.next('lobby', m => m.hostId === second.playerId);
  assert.equal(room.game.players.find(p => p.id === first.playerId).connected, false);
  const resumed = await f.connect(); resumed.send({ type: 'resume', code: first.code, token: first.token });
  const welcome = await resumed.next('welcome');
  assert.equal(welcome.state.players.find(p => p.id === first.playerId).equipment.weapon.id, originalWeapon);
  assert.equal(welcome.state.players.find(p => p.id === first.playerId).connected, true);
  assert.equal(welcome.hostId, second.playerId);
  // Place the simulation at a terminal state; this test targets network leadership,
  // not the separately tested combat required to reach the ending.
  room.game.phase = 'defeat';
  b.send({ type: 'action', action: { type: 'restart' } });
  const restarted = await b.next('state', m => m.state.run === 2);
  assert.equal(restarted.state.phase, 'playing');
  await resumed.disconnect(); f.advance(91000); f.app.sweep();
  assert.equal(room.game.players.some(p => p.id === first.playerId), false);
  const newcomer = await f.connect();
  const entered = await join(newcomer, first.code, 'archer');
  assert.equal(entered.state.players.length, 2);
  assert.equal(entered.state.players.some(p => p.id === entered.playerId), true);
});

test('cached maps keep chest changes live and send fresh geometry for heart choices and resync', async t => {
  const f = await fixture(t, { sim: simulation }), a = await f.connect(), b = await f.connect();
  const first = await host(a);
  assert.equal(first.fullMap, true); assert.ok(first.state.map.tiles.length > 0);
  a.send({ type: 'start' }); const start = await a.next('started');
  assert.equal(start.fullMap, true); assert.equal(start.worldKey, first.worldKey);
  const second = await join(b, first.code, 'wizard');
  assert.equal(second.started, true); assert.equal(second.fullMap, true);
  assert.equal(second.worldKey, first.worldKey);
  f.app.tick();
  const [movingA, movingB] = await Promise.all([a.next('state'), b.next('state')]);
  assert.equal(movingA.fullMap, false); assert.equal(movingA.state.map, undefined);
  assert.ok(movingA.mapState.rooms.length > 0); assert.equal(movingA.worldKey, first.worldKey);
  assert.deepEqual(movingA.state, movingB.state);
  assert.ok(JSON.stringify(movingA).length < JSON.stringify(start).length);
  const room = f.app.rooms.get(first.code), p = room.game.players.find(player => player.id === first.playerId);
  const chest = room.game.map.chests[0]; p.x = chest.x; p.y = chest.y;
  a.send({ type: 'action', action: { type: 'interact' } });
  const [openedA, openedB] = await Promise.all([
    a.next('state', m => m.mapState?.chests.some(c => c.id === chest.id && c.opened)),
    b.next('state', m => m.mapState?.chests.some(c => c.id === chest.id && c.opened)),
  ]);
  assert.equal(openedA.state.map, undefined);
  assert.ok(openedB.state.players.every(player => player.inventory.length > 0));
  const mergedMap = { ...first.state.map, ...openedA.mapState };
  assert.equal(mergedMap.chests.find(c => c.id === chest.id).opened, true);
  assert.equal(mergedMap.tiles, first.state.map.tiles);
  // The combat suite covers earning this phase; here verify a real shared choice
  // replaces cached geometry for every connected player.
  room.game.phase = 'choice'; room.game.bossDefeated = true;
  a.send({ type: 'action', action: { type: 'choose', choice: 'claim' } });
  const [nextA, nextB] = await Promise.all([
    a.next('state', m => m.state.zoneIndex === 1), b.next('state', m => m.state.zoneIndex === 1),
  ]);
  assert.equal(nextA.fullMap, true); assert.equal(nextB.fullMap, true);
  assert.notEqual(nextA.worldKey, first.worldKey);
  assert.equal(nextA.worldKey, nextB.worldKey);
  assert.ok(nextA.state.map.tiles.length > 0);
  assert.equal(nextA.state.phase, 'playing');
  a.send({ type: 'sync' }); const resync = await a.next('state', m => m.fullMap);
  assert.equal(resync.worldKey, nextA.worldKey); assert.deepEqual(resync.state.map, nextA.state.map);
});

test('dev launcher host and port flags start the requested HTTP listener', { timeout: 5000 }, async t => {
  const filename = fileURLToPath(new URL('../server.mjs', import.meta.url));
  const child = spawn(process.execPath, [filename, '--host', '127.0.0.1', '--port', '0', '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });
  let output = '';
  const address = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Dev server exited before listening: ${code}`)));
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  assert.equal((await (await fetch(address + '/health')).json()).service, 'gravebloom');
  const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended;
});
