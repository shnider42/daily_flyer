import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { RoomHub } from '../multiplayer.mjs';

async function fixture(t) {
  const publicRoot = await mkdtemp(path.join(tmpdir(), 'golf-http-'));
  await writeFile(path.join(publicRoot, 'index.html'), '<!doctype html><title>Golf</title>');
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

test('HTTP creation, authenticated SSE, four-player joining and authoritative shots work end to end', async t => {
  const f = await fixture(t), created = await f.post('/api/rooms', { name: 'First', mode: 'points' });
  assert.equal(created.response.status, 201);
  const seats = [created.data], connections = [await f.stream(created.data)];
  for (const name of ['Second', 'Third', 'Fourth']) {
    const joined = await f.post(`/api/rooms/${created.data.code}/join`, { name });
    assert.equal(joined.response.status, 200); seats.push(joined.data); connections.push(await f.stream(joined.data));
  }
  const fifth = await f.post(`/api/rooms/${created.data.code}/join`, { name: 'Too many' });
  assert.equal(fifth.response.status, 409); assert.equal(fifth.data.code, 'room_full');
  const state = await connections[0].readSnapshot(snapshot => snapshot.players.every(player => player.connected));
  assert.equal(state.players.length, 4); assert.equal(state.mode, 'points');
  assert.equal(state.players.some(player => player.isBot), false);
  const start = await f.post(`/api/rooms/${state.code}/input`, {
    seq: 1, roundId: state.roundId, holeIndex: 0, action: 'start' }, seats[0].token);
  assert.equal(start.response.status, 200); assert.equal(start.data.ok, true);
  const shotCommand = { seq: 1, roundId: state.roundId, holeIndex: 0, action: 'shot', angle: .15, power: .35, playerId: 'p1' };
  const shot = await f.post(`/api/rooms/${state.code}/input`, shotCommand, seats[2].token);
  assert.equal(shot.response.status, 200); assert.equal(shot.data.snapshot.players[2].strokes, 1);
  assert.equal(shot.data.snapshot.players[0].strokes, 0, 'identity derives from the bearer token');
  const duplicate = await f.post(`/api/rooms/${state.code}/input`, shotCommand, seats[2].token);
  assert.equal(duplicate.data.duplicate, true); assert.equal(duplicate.data.snapshot.players[2].strokes, 1);
  const observed = await connections[3].readSnapshot(snapshot => snapshot.players[2].strokes === 1);
  assert.equal(observed.roundId, state.roundId);
  for (const seat of seats) assert.equal(JSON.stringify(observed).includes(seat.token), false);
  const rejoin = await f.post(`/api/rooms/${state.code}/rejoin`, {}, seats[2].token);
  assert.equal(rejoin.data.playerId, seats[2].playerId); assert.equal(rejoin.data.lastSeq, 1);
});

test('origin, bearer credentials, JSON size/type and stale commands are enforced', async t => {
  const f = await fixture(t);
  const alien = await f.post('/api/rooms', { name: 'Bad origin' }, null, { Origin: 'https://unrelated.example' });
  assert.equal(alien.response.status, 403); assert.equal(f.hub.rooms.size, 0);
  const own = await f.post('/api/rooms', { name: 'Allowed' }, null, { Origin: f.base });
  assert.equal(own.response.status, 201);
  const seat = own.data;
  const noBearer = await fetch(`${f.base}/api/rooms/${seat.code}/stream?token=${seat.token}`);
  assert.equal(noBearer.status, 401, 'credentials in the URL are not accepted'); await noBearer.text();
  const wrongToken = await f.post(`/api/rooms/${seat.code}/rejoin`, {}, '0'.repeat(64));
  assert.equal(wrongToken.response.status, 401);
  const tooLarge = await f.post('/api/rooms', { name: 'x'.repeat(5000) }); assert.equal(tooLarge.response.status, 413);
  const badType = await f.post('/api/rooms', {}, null, { 'Content-Type': 'text/plain' }); assert.equal(badType.response.status, 415);
  const arrayBody = await f.post('/api/rooms', []); assert.equal(arrayBody.response.status, 400);
  const malformed = await fetch(f.base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400); await malformed.text();
  const watch = await f.stream(seat); await watch.readSnapshot();
  const stale = await f.post(`/api/rooms/${seat.code}/input`, { action: 'start', seq: 1, roundId: 'old', holeIndex: 0 }, seat.token);
  assert.equal(stale.response.status, 409); assert.equal(stale.data.code, 'stale_round');
  const method = await fetch(`${f.base}/api/rooms/${seat.code}/input`); assert.equal(method.status, 405); await method.text();
});

test('static hosting, health, HEAD and traversal guard expose only public files', async t => {
  const f = await fixture(t);
  const health = await fetch(f.base + '/health'); assert.equal(health.status, 200);
  assert.equal((await health.json()).game, 'shenanigans-golf');
  const page = await fetch(f.base + '/'); assert.equal(page.status, 200); assert.match(await page.text(), /<title>Golf/);
  const head = await fetch(f.base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.ok(+head.headers.get('content-length') > 0); assert.equal(await head.text(), '');
  for (const route of ['/..%2fserver.mjs', '/.env', '/.git/config', '/%5c..%5cserver.mjs', '/%00', '/missing.mjs']) {
    const response = await fetch(f.base + route); assert.equal(response.status, 404, route); await response.text();
  }
  const malformed = await fetch(f.base + '/%zz'); assert.equal(malformed.status, 400); await malformed.text();
});

test('closing an SSE stream starts the disconnect grace without discarding the score', async t => {
  const f = await fixture(t), created = await f.post('/api/rooms', { name: 'Returner' });
  const seat = created.data, watch = await f.stream(seat); await watch.readSnapshot();
  f.hub.room(seat.code).game.state.players[0].scores[0] = 6;
  watch.controller.abort();
  for (let i = 0; i < 20 && f.hub.room(seat.code).seats[0].connected; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.hub.room(seat.code).seats[0].connected, false);
  const rejoined = await f.post(`/api/rooms/${seat.code}/rejoin`, {}, seat.token);
  assert.equal(rejoined.data.snapshot.players[0].scores[0], 6);
  const replacement = await f.stream(rejoined.data), snapshot = await replacement.readSnapshot();
  assert.equal(snapshot.players[0].connected, true); assert.equal(snapshot.players[0].scores[0], 6);
});
