import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createNightTransferServer, PROTOCOL } from '../server.mjs';
import { VERSION, OBJECTS, LEVELS, newGame as realGame, reduce as realReducer, availableRooms, validateSave } from '../public/world.mjs';
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

const listRooms = () => [{ id: 'cell', width: 8, depth: 6 }, { id: 'corridor', width: 4, depth: 14 }, { id: 'washroom', width: 6, depth: 8 }];
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
  const app = createNightTransferServer({ makeGame, reducer, listRooms, ...options });
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
  assert.deepEqual(await health.json(), { status: 'ready', game: 'NIGHT TRANSFER', version: VERSION, protocol: PROTOCOL, maxPlayers: 4, rooms: 0 });
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

test('the actual browser client resumes actions and interpolates remote poses without moving its own camera', async t => {
  let clock = Date.now();
  const { app, origin, connect } = await fixture(t, { now: () => clock });
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
    onPoses: poses => events.emit('poses', poses),
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
    assert.equal(typeof client.sendAction({ type: 'hint' }), 'string');
    await changed;
    const rejoined = waitFor('state', p => p.meta.initial && p.state.hints === 1);
    peer.ws.terminate(); await rejoined; await acknowledged;
    assert.equal(client.playerId, identity); assert.equal(client.connected, true);
    assert.equal(room.state.hints, 1); assert.equal(room.players.size, 1);
    const presence = waitFor('roster', r => r.some(p => p.id === identity && p.room === 'washroom'));
    client.presence('washroom'); await presence;
    const guest = await connect(); guest.hello({ code: client.code, name: 'Teammate' });
    const guestWelcome = await guest.next('welcome');
    const firstPose = waitFor('poses', p => p.some(p => p.id === guestWelcome.playerId && p.x === 1));
    guest.send({ type: 'presence', room: 'cell', x: 1, z: 0, yaw: 3.1, crouch: false }); await firstPose;
    clock += 200;
    const nextPose = waitFor('poses', p => p.some(p => p.id === guestWelcome.playerId && p.x === 3));
    guest.send({ type: 'presence', room: 'cell', x: 3, z: 0, yaw: -3.1, crouch: false }); await nextPose;
    const sampled = client.samplePoses(clock - 100);
    assert.equal(sampled.length, 1); assert.equal(sampled[0].id, guestWelcome.playerId);
    assert.equal(sampled[0].x, 2); assert.ok(Math.abs(Math.abs(sampled[0].yaw) - Math.PI) < 0.01);
    assert.equal(client.session.id, identity); assert.equal('token' in client.session, false);
    const gone = waitFor('poses', p => !p.some(p => p.id === guestWelcome.playerId));
    guest.send({ type: 'leave' }); await gone; assert.equal(client.samplePoses().length, 0);
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


test('four players broadcast bounded poses without broadcasting puzzle state', async t => {
  let clock = 1000;
  const { app, connect } = await fixture(t, { now: () => clock });
  const host = await connect(); host.hello({ create: true }); const welcome = await host.next('welcome');
  const clients = [host], identities = [welcome.playerId];
  for (let i = 0; i < 3; i++) {
    const guest = await connect(); guest.hello({ code: welcome.roomCode });
    identities.push((await guest.next('welcome')).playerId); clients.push(guest);
  }
  clients.forEach((c, i) => c.send({ type: 'presence', room: 'cell', x: i, z: -1, yaw: i / 2, crouch: i % 2 === 0 }));
  const update = await host.next('poses', p => p.poses.length === 4);
  assert.equal(update.serverTime, clock);
  assert.equal('state' in update, false);
  assert.deepEqual(update.poses.map(p => p.id).sort(), identities.sort());
  assert.deepEqual(update.poses.map(p => p.x).sort(), [0, 1, 2, 3]);
  assert.equal(app.rooms.get(welcome.roomCode).revision, 0);
  assert.equal(clients.some(c => c.queue.some(p => p.type === 'state')), false);

  const player = app.rooms.get(welcome.roomCode).players.get(welcome.playerId);
  const original = { ...player.pose };
  clock = 1100;
  for (const bad of [
    { room: 'locked-chamber', x: 0, z: 0, yaw: 0, crouch: false },
    { room: 'cell', x: 999999, z: 0, yaw: 0, crouch: false },
    { room: 'cell', x: 4.01, z: 0, yaw: 0, crouch: false },
    { room: 'cell', x: 0, z: -3.01, yaw: 0, crouch: false },
    { room: 'cell', x: null, z: 0, yaw: 0, crouch: false },
    { room: 'cell', x: 0, z: 0, yaw: 0, crouch: 'yes' },
  ]) host.send({ type: 'presence', ...bad });
  host.send({ type: 'ping', at: 11 }); await host.next('pong');
  assert.deepEqual(player.pose, original);
  host.send({ type: 'presence', room: 'cell', x: 1, z: 2, yaw: 0, crouch: false });
  await host.next('poses', p => p.poses.find(p => p.id === welcome.playerId)?.x === 1);
  host.send({ type: 'presence', room: 'cell', x: 2, z: 2, yaw: 0, crouch: false });
  host.send({ type: 'ping', at: 12 }); await host.next('pong');
  assert.equal(player.pose.x, 1, 'positions over ten updates per second are discarded');
});

test('presence respects puzzle room access and discards old positions when the level changes', async t => {
  let clock = 1000;
  const listRooms = state => state.departed ? [{ id: 'yard', width: 20, depth: 16 }] : [
    { id: 'cell', width: 8, depth: 6 }, ...(state.key ? [{ id: 'corridor', width: 4, depth: 14 }] : []),
  ];
  const trackedReducer = (state, action, context) => {
    if (action.type === 'depart') {
      assert.equal(context.playerRoom, 'corridor');
      return { state: { ...state, departed: true }, ok: true };
    }
    return reducer(state, action, context);
  };
  const { app, connect } = await fixture(t, { now: () => clock, listRooms, reducer: trackedReducer });
  const host = await connect(); host.hello({ create: true }); const welcome = await host.next('welcome');
  const sendPose = room => host.send({ type: 'presence', room, x: 1, z: 1, yaw: 0, crouch: false });
  sendPose('corridor'); host.send({ type: 'ping', at: 1 }); await host.next('pong');
  const player = app.rooms.get(welcome.roomCode).players.get(welcome.playerId);
  assert.equal(player.room, 'cell'); assert.equal(player.pose, null);
  host.action('unlock', { type: 'interact', id: 'key' }); await host.next('action-result');
  sendPose('corridor'); await host.next('poses', p => p.poses[0]?.room === 'corridor');
  host.action('depart', { type: 'depart' }); await host.next('action-result');
  assert.equal(player.room, 'yard'); assert.equal(player.pose, null);
  clock += 100;
  sendPose('cell'); host.send({ type: 'ping', at: 2 }); await host.next('pong');
  assert.equal(player.room, 'yard'); assert.equal(player.pose, null);
});

test('room capacity is bounded and leaving the last seat releases capacity', async t => {
  const { app, connect } = await fixture(t, { maxRooms: 1 });
  const first = await connect(); first.hello({ create: true }); await first.next('welcome');
  const second = await connect(); second.hello({ create: true });
  assert.equal((await second.next('error')).code, 'ROOM_CAPACITY');
  first.send({ type: 'leave' }); first.send({ type: 'ping', at: 1 }); await first.next('pong');
  assert.equal(app.rooms.size, 0);
  second.hello({ create: true }); await second.next('welcome'); assert.equal(app.rooms.size, 1);
});


test('four players complete the real campaign and door crossings permit immediate interactions', async t => {
  const { app, connect } = await fixture(t, { makeGame: realGame, reducer: realReducer, listRooms: availableRooms, now: () => 6000 });
  const clients = [], identities = [];
  for (let i = 0; i < 4; i++) {
    const client = await connect();
    client.hello(i ? { code: identities[0].roomCode, name: 'Escapee ' + i } : { create: true, name: 'Escapee 0' });
    clients.push(client); identities.push(await client.next('welcome'));
  }
  const room = app.rooms.get(identities[0].roomCode);
  let serial = 0;
  async function action(clientIndex, request) {
    const id = 'campaign-' + ++serial;
    clients[clientIndex].action(id, request);
    const result = await clients[clientIndex].next('action-result', packet => packet.actionId === id);
    assert.equal(result.ok, true, JSON.stringify(request) + ': ' + result.message);
    return result;
  }
  const campaigns = [
    [ ['bunkPocket'], ['holdingDoor'], ['routeCabinet', ['gate', 'eye', 'lamp', 'moon']], ['recordsDoor'], ['transferDesk'], ['transferExit'] ],
    [ ['laundryCart'], ['watchroomDoor'], ['authorisationPanel', '846'], ['dispatchShutter'], ['dispatchDesk'], ['dispatchExit'] ],
    [ ['toolChest'], ['sluiceDoor'], ['valveBank', [2, 4, 1]], ['quayDoor'], ['keeperBox'], ['quayExit'] ],
  ];
  for (let level = 0; level < 3; level++) {
    const actor = level % 4;
    // Use a fourth participant to exercise the shared hint budget at each level.
    for (let h = 0; h < 3; h++) await action((h + 1) % 4, { type: 'hint' });
    clients[3].action('hint-limit-' + level, { type: 'hint' });
    assert.equal((await clients[3].next('action-result', packet => packet.actionId === 'hint-limit-' + level)).ok, false);
    for (let step = 0; step < campaigns[level].length; step++) {
      const [id, value] = campaigns[level][step];
      const request = { type: value === undefined ? 'interact' : 'solve', id, room: OBJECTS[id].room, ...(value === undefined ? {} : { value }) };
      const result = await action(actor, request);
      if (result.event?.type === 'room') {
        assert.equal(room.players.get(identities[actor].playerId).room, result.event.room);
        assert.equal(room.players.get(identities[actor].playerId).pose, null);
        // Other players may enter an unlocked room independently without producing a world-state delta.
        const revision = room.revision;
        await action((actor + 1) % 4, { type: 'enter', room: result.event.room });
        assert.equal(room.revision, revision);
      }
    }
    assert.deepEqual(room.state.completedLevels, Array.from({ length: level + 1 }, (_, i) => i));
    if (level < 2) {
      for (const player of room.players.values()) assert.equal(player.room, LEVELS[level + 1].startRoom);
    }
  }
  assert.equal(room.state.won, true);
  assert.deepEqual(room.state.hintsUsed, [3, 3, 3]);
  assert.deepEqual(validateSave(room.state), room.state);
  assert.equal(room.revision, room.state.revision);
  const snapshots = await Promise.all(clients.map(client => client.next('state', packet => packet.state.won)));
  snapshots.forEach(packet => assert.deepEqual(packet.state, room.state));
});
