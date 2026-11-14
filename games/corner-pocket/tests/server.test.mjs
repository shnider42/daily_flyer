import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { RoomHub } from '../multiplayer.mjs';
import { OnlineRoom } from '../public/online.mjs';

async function fixture(t) {
  const publicRoot = await mkdtemp(path.join(tmpdir(), 'corner-pocket-http-'));
  await writeFile(path.join(publicRoot, 'index.html'), '<!doctype html><title>Corner Pocket</title>');
  const hub = new RoomHub(), server = createServer({ hub, publicRoot, automaticTicks: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, controllers = [];
  t.after(async () => {
    controllers.forEach(controller => controller.abort());
    await new Promise(resolve => server.shutdown(resolve));
    await rm(publicRoot, { recursive: true, force: true });
  });
  async function post(route, value = {}, token, headers = {}) {
    const response = await fetch(base + route, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: JSON.stringify(value) });
    return { response, data: await response.json() };
  }
  async function stream(seat) {
    const controller = new AbortController(); controllers.push(controller);
    const response = await fetch(`${base}/api/rooms/${seat.code}/stream`, {
      headers: { Authorization: `Bearer ${seat.token}` }, signal: controller.signal });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
    async function readSnapshot(predicate = () => true) {
      const deadline = Date.now() + 4000;
      for (;;) {
        let split;
        while ((split = pending.indexOf('\n\n')) >= 0) {
          const event = pending.slice(0, split); pending = pending.slice(split + 2);
          const data = event.split('\n').find(line => line.startsWith('data: '));
          if (!data) continue;
          const packet = JSON.parse(data.slice(6));
          if (packet.snapshot && predicate(packet.snapshot)) return packet.snapshot;
        }
        if (Date.now() >= deadline) throw new Error('Snapshot did not arrive');
        let timer;
        const part = await Promise.race([reader.read(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Snapshot timed out')), deadline - Date.now());
        })]).finally(() => clearTimeout(timer));
        if (part.done) throw new Error('Stream closed before snapshot');
        pending += decoder.decode(part.value, { stream: true });
      }
    }
    return { readSnapshot, controller };
  }
  return { base, hub, server, post, stream };
}

test('two real HTTP/SSE clients share one authoritative rack and cannot duplicate or steal shots', async t => {
  const f = await fixture(t);
  const created = await f.post('/api/rooms', { name: 'Host' });
  assert.equal(created.response.status, 201); assert.equal(created.data.seatIndex, 0);
  const host = created.data, a = await f.stream(host);
  const joined = await f.post(`/api/rooms/${host.code}/join`, { name: 'Guest' });
  assert.equal(joined.response.status, 200); assert.equal(joined.data.seatIndex, 1);
  const guest = joined.data, b = await f.stream(guest);
  const both = await a.readSnapshot(snapshot => snapshot.seats.every(seat => seat.connected));
  assert.equal(both.phase, 'lobby'); assert.equal(both.game, null);
  const third = await f.post(`/api/rooms/${host.code}/join`, { name: 'Third' });
  assert.equal(third.response.status, 409); assert.equal(third.data.code, 'room_full');
  const started = await f.post(`/api/rooms/${host.code}/input`,
    { action: 'start', seq: 1, rackId: null, shotNumber: null }, host.token);
  assert.equal(started.response.status, 200); assert.equal(started.data.snapshot.game.balls.length, 16);
  const snapshot = started.data.snapshot;
  const stolen = await f.post(`/api/rooms/${host.code}/input`,
    { action: 'shoot', seq: 1, rackId: snapshot.rackId, shotNumber: 0, angle: 0, power: .75, seatIndex: 0 }, guest.token);
  assert.equal(stolen.response.status, 403); assert.equal(stolen.data.code, 'wrong_turn');
  const envelope = { action: 'shoot', seq: 2, rackId: snapshot.rackId, shotNumber: 0, angle: 0, power: .75 };
  const shot = await f.post(`/api/rooms/${host.code}/input`, envelope, host.token);
  assert.equal(shot.response.status, 200); assert.equal(shot.data.snapshot.game.shotNumber, 1);
  assert.equal(shot.data.snapshot.game.phase, 'rolling');
  const duplicate = await f.post(`/api/rooms/${host.code}/input`, envelope, host.token);
  assert.equal(duplicate.data.duplicate, true); assert.equal(duplicate.data.snapshot.game.shotNumber, 1);
  const observed = await b.readSnapshot(state => state.game?.shotNumber === 1);
  assert.equal(observed.rackId, snapshot.rackId);
  for (const seat of [host, guest]) assert.equal(JSON.stringify(observed).includes(seat.token), false);
  for (let i = 0; i < 4000 && f.hub.room(host.code).game.phase === 'rolling'; i++) f.hub.tick(1 / 120);
  assert.notEqual(f.hub.room(host.code).game.phase, 'rolling', 'the actual engine settles the rack');
  assert.equal(f.hub.room(host.code).game.shotNumber, 1);
});

test('origin, authorization, payload and sequence boundaries are enforced over HTTP', async t => {
  const f = await fixture(t);
  const alien = await f.post('/api/rooms', { name: 'Alien' }, null, { Origin: 'https://unrelated.example' });
  assert.equal(alien.response.status, 403); assert.equal(f.hub.rooms.size, 0);
  const created = await f.post('/api/rooms', { name: 'Owner' }, null, { Origin: f.base });
  const seat = created.data;
  const noBearer = await fetch(`${f.base}/api/rooms/${seat.code}/stream?token=${seat.token}`);
  assert.equal(noBearer.status, 401); await noBearer.text();
  const wrong = await f.post(`/api/rooms/${seat.code}/rejoin`, {}, '0'.repeat(64));
  assert.equal(wrong.response.status, 401);
  assert.equal((await f.post('/api/rooms', { name: 'x'.repeat(5000) })).response.status, 413);
  assert.equal((await f.post('/api/rooms', {}, null, { 'Content-Type': 'text/plain' })).response.status, 415);
  assert.equal((await f.post('/api/rooms', [])).response.status, 400);
  const malformed = await fetch(f.base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400); await malformed.text();
  const watch = await f.stream(seat); await watch.readSnapshot();
  const stale = await f.post(`/api/rooms/${seat.code}/input`,
    { action: 'start', seq: 1, rackId: 'old-rack', shotNumber: 0 }, seat.token);
  assert.equal(stale.response.status, 409); assert.equal(stale.data.code, 'stale_rack');
  const method = await fetch(`${f.base}/api/rooms/${seat.code}/input`);
  assert.equal(method.status, 405); await method.text();
});

test('static hosting and health expose only the public directory', async t => {
  const f = await fixture(t);
  const health = await fetch(f.base + '/health'); assert.equal(health.status, 200);
  assert.equal((await health.json()).game, 'corner-pocket');
  const page = await fetch(f.base + '/'); assert.equal(page.status, 200); assert.match(await page.text(), /<title>Corner Pocket/);
  const head = await fetch(f.base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.ok(+head.headers.get('content-length') > 0); assert.equal(await head.text(), '');
  for (const route of ['/..%2fserver.mjs', '/.env', '/.git/config', '/%5c..%5cserver.mjs', '/%00', '/missing.mjs']) {
    const response = await fetch(f.base + route); assert.equal(response.status, 404, route); await response.text();
  }
  const malformed = await fetch(f.base + '/%zz'); assert.equal(malformed.status, 400); await malformed.text();
});

test('refreshing a player keeps their identity and old transport closure cannot take away the seat', async t => {
  const f = await fixture(t), created = await f.post('/api/rooms', { name: 'Returner' });
  const seat = created.data, first = await f.stream(seat); await first.readSnapshot();
  first.controller.abort();
  for (let i = 0; i < 30 && f.hub.room(seat.code).seats[0].connected; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.hub.room(seat.code).seats[0].connected, false);
  const rejoined = await f.post(`/api/rooms/${seat.code}/rejoin`, {}, seat.token);
  assert.equal(rejoined.response.status, 200); assert.equal(rejoined.data.seatIndex, 0);
  assert.equal(rejoined.data.token, seat.token);
  const replacement = await f.stream(rejoined.data), snapshot = await replacement.readSnapshot();
  assert.equal(snapshot.seats[0].connected, true); assert.equal(snapshot.seats[0].name, 'Returner');
});

test('the shipped OnlineRoom clients create, join, shoot and leave through the real SSE transport', async t => {
  const f = await fixture(t), states = [[], []];
  const clients = states.map(list => new OnlineRoom({ baseUrl: f.base,
    onSnapshot: state => list.push(state) }));
  async function until(predicate) {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Room state did not arrive');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  try {
    await clients[0].create('One');
    await clients[1].join(clients[0].session.code, 'Two');
    await until(() => clients.every(client => client.connected && client.snapshot?.seats.every(seat => seat.connected)));
    await clients[0].command('start');
    await until(() => clients[1].snapshot.game?.phase === 'aiming');
    await assert.rejects(clients[1].command('shoot', { angle: 0, power: .7 }), /opponent/);
    await clients[0].command('shoot', { angle: 0, power: .7 });
    await until(() => clients[1].snapshot.game?.shotNumber === 1);
    assert.equal(clients[0].snapshot.rackId, clients[1].snapshot.rackId);
    await clients[1].leave();
    await until(() => clients[0].snapshot.phase === 'finished');
    assert.equal(clients[0].snapshot.game.winner, 0);
    assert.equal(clients[0].snapshot.seats[0].score, 1);
    assert.equal(clients[1].session, null);
  } finally { clients.forEach(client => client.destroy()); }
});
