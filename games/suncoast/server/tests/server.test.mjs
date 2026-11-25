import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createServer, allowedOrigin } from '../../server.mjs';
import { RoomManager } from '../rooms.mjs';
import { PROTOCOL } from '../../public/coop-protocol.mjs';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(predicate, description, ms = 3000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const value = predicate(); if (value) return value; await delay(10); }
  throw new Error(`Timed out: ${description}`);
}
async function fixture(t, options = {}) {
  const server = await createServer({ port: 0, host: '127.0.0.1', production: false, ...options });
  const clients = [];
  t.after(async () => { for (const client of clients) client.socket.terminate(); await server.close(); });
  async function connect(message, extra = {}) {
    const socket = new WebSocket(server.url.replace('http:', 'ws:') + '/ws', { origin: 'http://localhost:3000', ...extra });
    const client = { socket, packets: [], send(packet) { socket.send(JSON.stringify(packet)); },
      latest(type) { return this.packets.findLast(packet => packet.type === type); },
      wait(type, condition = () => true) { return until(() => this.packets.findLast(packet => packet.type === type && condition(packet)), type); } };
    socket.on('message', data => client.packets.push(JSON.parse(data.toString()))); socket.on('error', () => {});
    clients.push(client); await once(socket, 'open'); if (message) client.send({ protocol: PROTOCOL, ...message }); return client;
  }
  return { server, clients, connect };
}

test('four real sockets share one moving city and the fifth cannot take a reserved seat', async t => {
  const f = await fixture(t);
  const host = await f.connect({ type: 'create', name: 'Host' }), first = await host.wait('joined');
  const guests = [];
  for (let i = 0; i < 3; i++) { const client = await f.connect({ type: 'join', code: first.room.code, name: `Driver ${i}` }); await client.wait('joined'); guests.push(client); }
  const full = await f.connect({ type: 'join', code: first.room.code, name: 'Overflow' });
  assert.equal((await full.wait('error')).code, 'ROOM_FULL');
  const room = f.server.rooms.rooms.get(first.room.code), startTick = room.tick;
  host.send({ type: 'input', seq: 1, input: { mx: 1, my: 0 } });
  await host.wait('snapshot', packet => packet.ack === 1 && packet.tick >= startTick + 3);
  const views = await Promise.all([host, ...guests].map(client => client.wait('snapshot', packet => packet.room.players.length === 4 && packet.tick >= startTick + 3)));
  assert.equal(new Set(views.map(view => view.room.code)).size, 1);
  assert.ok(views.every(view => view.state.crew.length === 4));
  assert.ok(views.every(view => !JSON.stringify(view).includes('tokenHash')));
  guests[0].socket.terminate(); await until(() => [...room.players.values()].filter(player => player.peer).length === 3, 'disconnect');
  const reserved = await f.connect({ type: 'join', code: first.room.code, name: 'Cannot displace' });
  assert.equal((await reserved.wait('error')).code, 'ROOM_FULL');
  const sample = host.latest('snapshot');
  t.diagnostic(`Four-client city snapshot: ${Buffer.byteLength(JSON.stringify(sample))} bytes per client; 10 Hz target. This is local transport, not Internet latency.`);
});

test('private tokens resume the same driver; host transfer preserves the other driver', async t => {
  let at = 100000;
  const f = await fixture(t, { autoTick: false, now: () => at });
  const host = await f.connect({ type: 'create', name: 'First' }), joined = await host.wait('joined');
  const guest = await f.connect({ type: 'join', code: joined.room.code, name: 'Second' }), guestJoined = await guest.wait('joined');
  const room = f.server.rooms.rooms.get(joined.room.code), hostId = joined.selfId, guestId = guestJoined.selfId;
  host.socket.terminate(); await until(() => !room.players.get(hostId).peer, 'host disconnect');
  at += 5001; f.server.rooms.step(); assert.equal(room.hostId, guestId);
  const impostor = await f.connect({ type: 'resume', ...joined.session, token: 'incorrect' });
  assert.equal((await impostor.wait('error')).code, 'SESSION_EXPIRED');
  const resumed = await f.connect({ type: 'resume', ...joined.session }), resumedPacket = await resumed.wait('joined');
  assert.equal(resumedPacket.selfId, hostId); assert.equal(resumedPacket.room.hostId, guestId);
  const closed = once(resumed.socket, 'close');
  const replacement = await f.connect({ type: 'resume', ...joined.session }); await replacement.wait('joined');
  const [code] = await closed; assert.equal(code, 4001);
  assert.equal(room.players.size, 2);
  replacement.send({ type: 'leave' }); await replacement.wait('left');
  assert.equal(room.players.size, 1); assert.equal(room.hostId, guestId);
});

test('stale inputs stop movement and acknowledged sequences cannot move backwards', async t => {
  let at = 100000;
  const f = await fixture(t, { autoTick: false, now: () => at });
  const host = await f.connect({ type: 'create', name: 'Walker' }), joined = await host.wait('joined');
  const room = f.server.rooms.rooms.get(joined.room.code), player = room.players.get(joined.selfId);
  host.send({ type: 'input', seq: 10, input: { mx: 1, my: 0, x: 999999, cash: 999999 } });
  await until(() => player.receivedSeq === 10, 'input receipt');
  f.server.rooms.step(); const moving = f.server.rooms.fields(room, player).state.player.x;
  at += 501; f.server.rooms.step(); const stationary = f.server.rooms.fields(room, player).state.player.x;
  assert.equal(stationary, moving); assert.equal(player.appliedSeq, 10);
  host.send({ type: 'input', seq: 9, input: { mx: -1 } }); await delay(20); f.server.rooms.step();
  assert.equal(player.receivedSeq, 10); assert.equal(f.server.rooms.fields(room, player).state.player.x, stationary);
  assert.ok(f.server.rooms.fields(room, player).state.player.cash < 999999);
});

test('named actions are deduplicated and only the host can export a separate crew checkpoint', async t => {
  const f = await fixture(t, { autoTick: false });
  const host = await f.connect({ type: 'create', name: 'Host' }), joined = await host.wait('joined');
  const guest = await f.connect({ type: 'join', code: joined.room.code, name: 'Guest' }); await guest.wait('joined');
  host.send({ type: 'action', id: 'ping-once', action: { type: 'ping', x: 740, y: 1148 } });
  const first = await host.wait('result', packet => packet.id === 'ping-once'); assert.equal(first.ok, true);
  const count = host.packets.length;
  host.send({ type: 'action', id: 'ping-once', action: { type: 'surrender' } });
  await until(() => host.packets.slice(count).some(packet => packet.type === 'result'), 'duplicate receipt');
  assert.deepEqual(host.latest('result'), first);
  guest.send({ type: 'action', id: 'no-checkpoint', action: { type: 'checkpoint' } });
  assert.equal((await guest.wait('result', packet => packet.id === 'no-checkpoint')).ok, false);
  host.send({ type: 'action', id: 'save-crew', action: { type: 'checkpoint' } });
  const saved = await host.wait('result', packet => packet.id === 'save-crew'); assert.equal(saved.ok, true); assert.ok(saved.save);
  assert.ok(!JSON.stringify(saved.save).includes(joined.session.token));
  const restored = await f.connect({ type: 'create', name: 'Restored', save: saved.save }), restoredPacket = await restored.wait('joined');
  assert.notEqual(restoredPacket.room.code, joined.room.code); assert.notEqual(restoredPacket.selfId, joined.selfId);
  assert.deepEqual(restoredPacket.state.progress, joined.state.progress);
  host.send({ type: 'action', id: 'invalid-action', action: { type: 'setCash', cash: 9999 } });
  assert.equal((await host.wait('result', packet => packet.id === 'invalid-action')).ok, false);
});

test('a congested peer skips snapshots while other players and the room continue', () => {
  let at = 100000;
  const rooms = new RoomManager({ now: () => at });
  const peer = () => ({ packets: [], bufferedAmount: 0, send(packet) { this.packets.push(structuredClone(packet)); return 1; }, close() {} });
  const host = peer(), guest = peer(); rooms.handle(host, { type: 'create', protocol: PROTOCOL, name: 'Host' });
  rooms.handle(guest, { type: 'join', protocol: PROTOCOL, code: host.roomCode, name: 'Guest' });
  const room = rooms.rooms.get(host.roomCode), hostCount = host.packets.length, guestCount = guest.packets.length;
  host.bufferedAmount = 1;
  for (let i = 0; i < 30; i++) { at += 1000 / 30; rooms.step(); }
  assert.equal(room.tick, 30); assert.equal(host.packets.length, hostCount); assert.ok(guest.packets.length >= guestCount + 10);
  assert.ok(rooms.metrics.skippedSnapshots >= 10);
  host.bufferedAmount = 0; rooms.snapshot(room); assert.ok(host.packets.length > hostCount);
  rooms.shutdown();
});

test('a brief attack survives input coalescing while explicit neutral cancels it', () => {
  const rooms = new RoomManager({ now: () => 100000 });
  const peer = { send() { return 1; }, close() {}, bufferedAmount: 0 };
  rooms.handle(peer, { type: 'create', protocol: PROTOCOL, name: 'Driver' });
  const room = rooms.rooms.get(peer.roomCode), player = room.players.get(peer.playerId);
  rooms.handle(peer, { type: 'input', seq: 1, input: { fire: true } });
  rooms.handle(peer, { type: 'input', seq: 2, input: { fire: false } });
  rooms.step();
  assert.ok(rooms.fields(room, player).state.effects.some(effect => effect.type === 'punch'), 'Brief tap produced the real punch.');
  for (let i = 0; i < 30; i++) rooms.step();
  rooms.handle(peer, { type: 'input', seq: 3, input: { fire: true } });
  rooms.handle(peer, { type: 'input', seq: 4, input: {}, cancelActions: true });
  rooms.step();
  assert.ok(!rooms.fields(room, player).state.effects.some(effect => effect.type === 'punch'), 'Opening a menu cancelled the queued attack.');
  rooms.shutdown();
});

test('empty rooms and reservations expire; a quiet room never runs without a connected player', () => {
  let at = 100000;
  const rooms = new RoomManager({ now: () => at, graceMs: 1000, emptyMs: 2000 });
  const peer = { send() { return 1; }, close() {}, bufferedAmount: 0 };
  rooms.handle(peer, { type: 'create', protocol: PROTOCOL, name: 'Driver' }); const code = peer.roomCode, room = rooms.rooms.get(code);
  rooms.disconnect(peer); at += 1100; rooms.step(); assert.equal(room.players.size, 0); assert.equal(room.tick, 0);
  at += 1000; rooms.step(); assert.equal(rooms.rooms.size, 0);
});

test('production origin policy and HTTP boundaries retain static play and aggregate health only', async t => {
  const f = await fixture(t, { production: true });
  assert.equal(allowedOrigin('https://dfe-suncoast.onrender.com', undefined, true), true);
  assert.equal(allowedOrigin('https://dfe-suncoast.onrender.com.attacker.invalid', undefined, true), false);
  assert.equal(allowedOrigin('http://localhost:3000', undefined, true), false);
  assert.equal(allowedOrigin('http://localhost:3000', undefined, false), true);
  assert.equal((await fetch(f.server.url)).status, 200);
  assert.equal((await fetch(f.server.url + '/server.mjs')).status, 404);
  assert.equal((await fetch(f.server.url + '/%2e%2e%2fpackage.json')).status, 404);
  assert.equal((await fetch(f.server.url + '/__qa/mobile')).status, 404);
  assert.equal((await fetch(f.server.url, { method: 'POST' })).status, 405);
  const health = await (await fetch(f.server.url + '/healthz', { headers: { Origin: 'https://dfe-suncoast.onrender.com' } })).json();
  assert.equal(health.protocol, PROTOCOL); assert.equal(health.maxPlayers, 4); assert.equal(health.persistence, 'session');
  assert.deepEqual(Object.keys(health.performance).sort(), ['connected', 'rooms', 'skippedSnapshots', 'snapshotBytes', 'snapshots', 'ticks']);
  const socket = new WebSocket(f.server.url.replace('http:', 'ws:') + '/ws', { origin: 'https://attacker.invalid' });
  const [error] = await once(socket, 'error'); assert.match(error.message, /403/);
});
