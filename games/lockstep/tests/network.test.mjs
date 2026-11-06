import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createLockstepServer, PROTOCOL } from '../server.mjs';
import { VERSION, newGame, reduce, PIPE_SOLUTION } from '../public/world.mjs';
import { WebSocket } from '../vendor/ws/wrapper.mjs';

class Client {
  constructor(ws) {
    this.ws = ws; this.queue = []; this.waiters = [];
    ws.on('message', data => {
      const packet = JSON.parse(data.toString());
      const index = this.waiters.findIndex(w => w.match(packet));
      if (index >= 0) {
        const waiter = this.waiters.splice(index, 1)[0];
        clearTimeout(waiter.timer); waiter.resolve(packet);
      } else this.queue.push(packet);
    });
  }
  send(packet) { this.ws.send(JSON.stringify(packet)); }
  next(type, predicate = () => true) {
    const match = packet => packet.type === type && predicate(packet);
    const index = this.queue.findIndex(match);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(Error('Timed out waiting for ' + type));
      }, 2000);
      this.waiters.push(waiter);
    });
  }
  hello(message) { this.send({ type: 'hello', protocol: PROTOCOL, version: VERSION, ...message }); }
  action(id, action) { this.send({ type: 'action', actionId: id, action }); }
  stop() { for (const w of this.waiters) clearTimeout(w.timer); this.ws.terminate(); }
}

const makeGame = () => ({ key: false, clues: [], hints: 0 });
function reducer(state, action) {
  if (action.type === 'interact' && action.id === 'key' && !state.key) {
    return { ok: true, changed: true, state: { ...state, key: true }, message: 'Key collected.' };
  }
  if (action.type === 'hint' && state.hints < 3) {
    return { ok: true, changed: true, state: { ...state, hints: state.hints + 1 }, message: 'Look under the bed.' };
  }
  if (action.type === 'inspect') return { ok: true, changed: false, state, message: 'An empty drawer.' };
  return { ok: false, changed: false, state, message: 'Unavailable.' };
}

async function fixture(t, options = {}) {
  const app = createLockstepServer({ makeGame, reducer, ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const clients = [];
  const connect = async () => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
    const client = new Client(ws); clients.push(client); await once(ws, 'open'); return client;
  };
  t.after(async () => { clients.forEach(c => c.stop()); await app.close(); });
  return { app, origin, connect };
}

test('HTTP health and browser modules use the same server; private paths are not served', async t => {
  const { origin } = await fixture(t);
  const health = await fetch(origin + '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ready', game: 'LOCKSTEP', version: VERSION, protocol: PROTOCOL, maxPlayers: 4, rooms: 0 });
  const module = await fetch(origin + '/network.js');
  assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /javascript/);
  assert.match(await module.text(), /class CoopClient/);
  assert.equal((await fetch(origin + '/.env')).status, 404);
  assert.equal((await fetch(origin + '/%2e%2e%2fserver.mjs')).status, 404);
  assert.equal((await fetch(origin + '/health', { method: 'POST' })).status, 405);
});

test('four independent sockets share an authoritative run, and a fifth is rejected', async t => {
  const { app, connect } = await fixture(t);
  const host = await connect(); host.hello({ create: true, name: 'Host' });
  const welcome = await host.next('welcome');
  assert.match(welcome.roomCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(welcome.maxPlayers, 4);
  const guests = [];
  for (let i = 0; i < 3; i++) {
    const guest = await connect(); guest.hello({ code: welcome.roomCode, name: 'Guest ' + i });
    guests.push(guest); await guest.next('welcome');
  }
  const full = await connect(); full.hello({ code: welcome.roomCode, name: 'Fifth' });
  assert.equal((await full.next('error')).code, 'ROOM_FULL');
  guests[1].action('collect-key', { type: 'interact', id: 'key' });
  for (const client of [host, ...guests]) {
    const packet = await client.next('state');
    assert.equal(packet.state.key, true); assert.equal(packet.revision, 1);
    assert.equal(typeof packet.serverTime, 'number');
  }
  assert.equal(app.rooms.get(welcome.roomCode).players.size, 4);
  const roster = await host.next('roster', packet => packet.roster.length === 4);
  assert.equal(new Set(roster.roster.map(p => p.slot)).size, 4);
});

test('actions are deduplicated across retries and concurrent key collection cannot duplicate progress', async t => {
  const { app, connect } = await fixture(t);
  const a = await connect(); a.hello({ create: true }); const welcome = await a.next('welcome');
  const b = await connect(); b.hello({ code: welcome.roomCode }); await b.next('welcome');
  a.action('same-command', { type: 'hint' });
  const first = await a.next('action-result'); assert.equal(first.ok, true);
  a.action('same-command', { type: 'hint' });
  const duplicate = await a.next('action-result');
  assert.equal(duplicate.revision, first.revision);
  a.action('a-key', { type: 'interact', id: 'key' }); b.action('b-key', { type: 'interact', id: 'key' });
  const results = await Promise.all([a.next('action-result'), b.next('action-result')]);
  assert.equal(results.filter(r => r.ok).length, 1);
  const room = app.rooms.get(welcome.roomCode);
  assert.equal(room.state.hints, 1); assert.equal(room.state.key, true); assert.equal(room.revision, 2);
});

test('reconnect preserves identity, solved state and dedup history while invalidating an old socket', async t => {
  const { app, connect } = await fixture(t);
  const original = await connect(); original.hello({ create: true, name: 'Moth' });
  const welcome = await original.next('welcome');
  original.action('hint-before-drop', { type: 'hint' }); await original.next('action-result');
  const oldClose = once(original.ws, 'close');
  const replacement = await connect();
  replacement.hello({ code: welcome.roomCode, token: welcome.token, name: 'Other name' });
  const resumed = await replacement.next('welcome');
  assert.equal(resumed.playerId, welcome.playerId); assert.equal(resumed.name, 'Moth');
  assert.equal(resumed.state.hints, 1); assert.equal(resumed.revision, 1);
  assert.equal((await oldClose)[0], 4001);
  replacement.action('hint-before-drop', { type: 'hint' });
  assert.equal((await replacement.next('action-result')).revision, 1);
  const room = app.rooms.get(welcome.roomCode);
  assert.equal(room.players.size, 1); assert.equal(room.state.hints, 1);
  assert(room.players.get(welcome.playerId).peer);
  const intruder = await connect(); intruder.hello({ code: welcome.roomCode, token: 'not-a-token' });
  assert.equal((await intruder.next('error')).code, 'INVALID_TOKEN');
  replacement.action('still-connected', { type: 'hint' });
  assert.equal((await replacement.next('action-result')).ok, true);
});

test('disconnected seats remain reserved for 90 seconds, then free without resetting the team', async t => {
  let clock = 1000;
  const { app, connect } = await fixture(t, { now: () => clock });
  const a = await connect(); a.hello({ create: true }); const first = await a.next('welcome');
  const b = await connect(); b.hello({ code: first.roomCode }); await b.next('welcome');
  a.action('key', { type: 'interact', id: 'key' }); await a.next('action-result');
  const disconnected = b.next('roster', packet => packet.roster.some(p => p.id === first.playerId && !p.connected));
  a.ws.close(); await disconnected;
  clock += 89_999; app.collect(); assert.equal(app.rooms.get(first.roomCode).players.size, 2);
  clock += 2; app.collect(); assert.equal(app.rooms.get(first.roomCode).players.size, 1);
  const c = await connect(); c.hello({ code: first.roomCode, token: first.token });
  assert.equal((await c.next('error')).code, 'INVALID_TOKEN');
  const d = await connect(); d.hello({ code: first.roomCode, name: 'New arrival' });
  const joined = await d.next('welcome'); assert.equal(joined.state.key, true);
  assert.notEqual(joined.playerId, first.playerId);
});

test('version mismatches, missing rooms and arbitrary state replacement are rejected', async t => {
  const { app, connect } = await fixture(t);
  const old = await connect(); old.hello({ create: true, version: 'obsolete' });
  assert.equal((await old.next('error')).code, 'VERSION_MISMATCH'); assert.equal(app.rooms.size, 0);
  const missing = await connect(); missing.hello({ code: 'AAAAAA' });
  assert.equal((await missing.next('error')).code, 'ROOM_NOT_FOUND');
  const a = await connect(); a.hello({ create: true }); const welcome = await a.next('welcome');
  a.action('forged', { type: 'load', state: { key: true, hints: 99 } });
  assert.equal((await a.next('action-result')).ok, false);
  a.action('unknown', { type: 'grant_everything' }); assert.equal((await a.next('action-result')).ok, false);
  a.action('read-only', { type: 'inspect' }); assert.equal((await a.next('action-result')).revision, 0);
  assert.deepEqual(app.rooms.get(welcome.roomCode).state, makeGame());
});

test('presence is personal while hints are shared and limited by the authoritative reducer', async t => {
  const { app, connect } = await fixture(t);
  const a = await connect(); a.hello({ create: true }); const welcome = await a.next('welcome');
  const b = await connect(); b.hello({ code: welcome.roomCode }); const second = await b.next('welcome');
  a.send({ type: 'presence', room: 'cell' }); b.send({ type: 'presence', room: 'corridor' });
  const positions = await a.next('roster', packet => packet.roster.find(p => p.id === second.playerId)?.room === 'corridor');
  assert.equal(positions.roster.find(p => p.id === welcome.playerId).room, 'cell');
  for (let i = 0; i < 3; i++) {
    const client = i % 2 ? b : a; client.action('hint-' + i, { type: 'hint' });
    assert.equal((await client.next('action-result')).ok, true);
  }
  b.action('hint-4', { type: 'hint' }); assert.equal((await b.next('action-result')).ok, false);
  assert.equal(app.rooms.get(welcome.roomCode).state.hints, 3);
});

test('clock replies support synchronized visual puzzles and explicit leave frees one seat', async t => {
  const { app, connect } = await fixture(t, { now: () => 123456789 });
  const a = await connect(); a.hello({ create: true }); const welcome = await a.next('welcome');
  const b = await connect(); b.hello({ code: welcome.roomCode }); await b.next('welcome');
  a.send({ type: 'ping', at: 123 });
  assert.deepEqual(await a.next('pong'), { type: 'pong', at: 123, serverTime: 123456789 });
  a.send({ type: 'leave' }); await b.next('roster', packet => packet.roster.length === 1);
  assert.equal(app.rooms.get(welcome.roomCode).players.size, 1);
  b.send({ type: 'leave' });
  b.send({ type: 'ping', at: 456 }); await b.next('pong');
  assert.equal(app.rooms.size, 0);
});

test('cross-origin websocket upgrades are refused', async t => {
  const { origin } = await fixture(t);
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/ws', { origin: 'https://unrelated.example' });
  const error = await new Promise(resolve => socket.once('error', resolve));
  assert.match(error.message, /403/);
});

test('the actual browser client retries a lost acknowledgement after reconnect without replaying the action', async t => {
  const { app, origin } = await fixture(t);
  const names = ['document', 'window', 'location', 'sessionStorage', 'WebSocket'];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const store = new Map();
  Object.assign(globalThis, {
    document: Object.assign(new EventTarget(), { hidden: false }), window: new EventTarget(),
    location: { href: origin + '/', protocol: 'http:' }, WebSocket,
    sessionStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  });
  const { CoopClient } = await import('../public/network.js');
  const events = new EventEmitter();
  const waitFor = (name, predicate = () => true) => new Promise((resolve, reject) => {
    const listener = packet => {
      if (!predicate(packet)) return;
      clearTimeout(timer); events.off(name, listener); resolve(packet);
    };
    const timer = setTimeout(() => { events.off(name, listener); reject(Error('Client event timeout: ' + name)); }, 3000);
    events.on(name, listener);
  });
  const client = new CoopClient({
    onState: (state, meta) => events.emit('state', { state, meta }),
    onMessage: message => events.emit('message', message),
    onRoster: roster => events.emit('roster', roster),
  });
  try {
    const started = waitFor('state', p => p.meta.initial);
    client.create('Browser'); await started;
    const identity = client.playerId;
    const room = app.rooms.get(client.roomCode);
    const peer = room.players.get(identity).peer;
    const send = peer.ws.send.bind(peer.ws);
    peer.ws.send = (data, ...args) => {
      if (JSON.parse(data).type === 'action-result') return;
      send(data, ...args);
    };
    const changed = waitFor('state', p => p.state.hints === 1 && !p.meta.initial);
    const acknowledged = waitFor('message', p => p.type === 'action-result' && p.ok);
    assert.equal(client.sendAction({ type: 'hint' }), true);
    await changed;
    const rejoined = waitFor('state', p => p.meta.initial && p.state.hints === 1);
    peer.ws.terminate(); await rejoined; await acknowledged;
    assert.equal(client.playerId, identity); assert.equal(client.connected, true);
    assert.equal(room.state.hints, 1); assert.equal(room.players.size, 1);
    const presence = waitFor('roster', r => r.some(p => p.id === identity && p.room === 'washroom'));
    client.presence('washroom'); await presence;
    const closed = once(client.socket, 'close'); client.leave(); await closed;
    assert.equal(app.rooms.size, 0);
  } finally {
    client.destroy();
    for (const name of names) {
      const descriptor = original.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('four real players can complete all three production levels on one authoritative campaign', async t => {
  let clock = 1000;
  const { app, connect } = await fixture(t, { makeGame: newGame, reducer: reduce, now: () => clock });
  const host = await connect(); host.hello({ create: true, name: 'P1' });
  const welcome = await host.next('welcome');
  const players = [host];
  for (let i = 2; i <= 4; i++) {
    const player = await connect(); player.hello({ code: welcome.roomCode, name: 'P' + i });
    await player.next('welcome'); players.push(player);
  }
  let sequence = 0;
  const act = async (action, ok = true) => {
    const player = players[sequence % 4], id = 'campaign-' + sequence++;
    player.action(id, action);
    const result = await player.next('action-result', packet => packet.actionId === id);
    assert.equal(result.ok, ok, JSON.stringify(action) + ': ' + result.message);
    return result;
  };
  await act({ type: 'interact', id: 'maintenanceDesk' }, false);
  await act({ type: 'interact', id: 'bunk' });
  await act({ type: 'interact', id: 'cellDoor' });
  await act({ type: 'solve', id: 'laundryLocker', value: '714' });
  await act({ type: 'interact', id: 'intakeDoor' });
  await act({ type: 'interact', id: 'transferDesk' });
  await act({ type: 'interact', id: 'transferDoor' });
  await act({ type: 'advance' });
  await act({ type: 'interact', id: 'cleaningCart' });
  await act({ type: 'interact', id: 'controlDoor' });
  await act({ type: 'solve', id: 'switchboard', value: [true, false, true] });
  await act({ type: 'interact', id: 'keyCage', now: 6000 }, false);
  clock = 6000;
  await act({ type: 'interact', id: 'keyCage' });
  await act({ type: 'interact', id: 'archiveDoor' });
  await act({ type: 'advance' });
  await act({ type: 'interact', id: 'maintenanceDesk' });
  await act({ type: 'interact', id: 'turbineDoor' });
  await act({ type: 'solve', id: 'powerGrid', value: PIPE_SOLUTION });
  await act({ type: 'interact', id: 'seawallBox' });
  await act({ type: 'interact', id: 'seawallGate' });
  for (const player of players) {
    const won = await player.next('state', packet => packet.state.won);
    assert.deepEqual(won.state.completedLevels, [0, 1, 2]);
    assert.equal(won.state.inventory.filter(item => item === 'seawallKey').length, 1);
  }
  const room = app.rooms.get(welcome.roomCode);
  assert.equal(room.state.won, true); assert.equal(room.players.size, 4);
  assert.equal(room.revision, room.state.revision);
});
