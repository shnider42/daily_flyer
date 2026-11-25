import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from '../../server.mjs';
import { CoopClient, SESSION_KEY, CREW_SAVE_KEY } from '../../public/coop-client.mjs';
import { LOCATIONS } from '../../public/world.mjs';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(predicate, description, ms = 4500) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const value = predicate(); if (value) return value; await delay(10); }
  throw new Error(`Timed out: ${description}`);
}
function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
}
async function fixture(t, options = {}) {
  const server = await createServer({ port: 0, host: '127.0.0.1', ...options }), clients = [];
  t.after(async () => { for (const record of clients) record.client.leave(); await server.close(); });
  function makeClient() {
    const storage = memoryStorage({ 'dfe.suncoast.save.v1': '{"solo":"unchanged"}' }), record = { storage, results: [], joined: [], statuses: [], checkpoints: [] };
    record.client = new CoopClient({ url: server.url.replace('http:', 'ws:') + '/ws', WebSocketImpl: WebSocket, storage,
      onJoined: packet => record.joined.push(packet), onStatus: (status, reason) => record.statuses.push({ status, reason }),
      onResult: (result, action) => record.results.push({ result, action }),
      onCheckpoint: save => { record.checkpoints.push(save); storage.setItem(CREW_SAVE_KEY, JSON.stringify(save)); } });
    clients.push(record); return record;
  }
  async function connect(request) { const record = makeClient(); record.client.connect(request); await until(() => record.client.connected && record.client.state, 'client joined'); return record; }
  async function action(record, value) {
    const id = record.client.action(value); assert.ok(id, 'Action enqueued by actual browser client');
    return (await until(() => record.results.find(entry => entry.result.id === id), `action ${value.type}`)).result;
  }
  return { server, clients, makeClient, connect, action };
}

test('actual CoopClient transports four players, movement, map pings and a separate checkpoint', async t => {
  const f = await fixture(t);
  const host = await f.connect({ type: 'create', name: 'Host' }), code = host.client.room.code;
  const crew = [host];
  for (let i = 0; i < 3; i++) crew.push(await f.connect({ type: 'join', code, name: `Friend ${i + 1}` }));
  await until(() => crew.every(record => record.client.state.crew.length === 4), 'four visible crew members');
  const initialX = host.client.state.player.x;
  const moving = setInterval(() => host.client.advance({ mx: 1, my: 0 }, .016), 16);
  try { await until(() => host.client.state.player.x > initialX + 20, 'authoritative movement'); }
  finally { clearInterval(moving); host.client.neutral(); }
  await until(() => crew[1].client.state.crew.find(player => player.id === host.client.session.playerId)?.x > initialX + 15, 'friend sees motion');
  const ping = await f.action(host, { type: 'ping', x: LOCATIONS.garage.door.x, y: LOCATIONS.garage.door.y, interior: null }); assert.equal(ping.ok, true);
  await until(() => crew.every(record => record.client.state.pings.length === 1), 'shared meetup marker');
  const saved = await f.action(host, { type: 'checkpoint' }); assert.equal(saved.ok, true); assert.equal(host.checkpoints.length, 1);
  assert.equal(host.checkpoints[0].kind, 'suncoast-crew-checkpoint');
  for (const record of crew) assert.equal(record.storage.getItem('dfe.suncoast.save.v1'), '{"solo":"unchanged"}');
  assert.ok(host.storage.getItem(SESSION_KEY));
  const beforeLeave = f.server.rooms.rooms.get(code).players.size, departingId = crew[3].client.session.playerId;
  crew[3].client.leave();
  await until(() => !f.server.rooms.rooms.get(code).players.has(departingId), 'explicit leave releases its seat');
  assert.equal(f.server.rooms.rooms.get(code).players.size, beforeLeave - 1);
});

test('actual browser client reconnects its token, clears held controls and accepts fresh ACKs', async t => {
  const f = await fixture(t);
  const host = await f.connect({ type: 'create', name: 'Returning driver' }), code = host.client.room.code;
  const guest = await f.connect({ type: 'join', code, name: 'Staying driver' });
  const originalId = host.client.session.playerId, originalToken = host.client.session.token;
  host.client.setInput({ mx: 1, fire: true }); host.client._sendInput();
  await until(() => host.client.ack > 0, 'initial ACK');
  const oldSocket = host.client.ws;
  oldSocket.terminate();
  await until(() => host.client.status === 'reconnecting', 'reconnect status');
  await until(() => host.joined.length === 2 && host.client.connected, 'authenticated client recovery');
  assert.equal(host.client.session.playerId, originalId); assert.equal(host.client.session.token, originalToken);
  assert.equal(host.client.input.fire, undefined); assert.equal(host.client.input.mx, undefined);
  assert.equal(f.server.rooms.rooms.get(code).players.size, 2);
  assert.ok(guest.client.connected);
  await until(() => host.client.ack >= host.client.seq - 2, 'reconnected input acknowledged');
  const result = await f.action(host, { type: 'ping', x: 740, y: 1148, interior: null }); assert.equal(result.ok, true);
});

test('browser client sends current dialogue identity and obeys story host permissions', async t => {
  const f = await fixture(t);
  const host = await f.connect({ type: 'create', name: 'Speaker' }), code = host.client.room.code;
  const guest = await f.connect({ type: 'join', code, name: 'Helper' });
  const room = f.server.rooms.rooms.get(code), hostId = host.client.session.playerId;
  // Put the authority at an authored interaction, then exercise the real client
  // command, response, projection and current-dialogue-ID path end to end.
  const member = room.world.players[hostId]; member.player.interior = 'cafe'; member.player.x = 320; member.player.y = 150;
  room.world.game.mission = { id: 'first_favor', step: 2, elapsed: 0 };
  f.server.rooms.snapshot(room);
  const used = await f.action(host, { type: 'interact' }); assert.equal(used.ok, true);
  const dialogue = await until(() => host.client.state.dialogue, 'authored dialogue');
  const guestChoice = await f.action(guest, { type: 'choose', dialogueId: dialogue.id, index: 0 }); assert.equal(guestChoice.ok, false);
  const staleChoice = await f.action(host, { type: 'choose', dialogueId: 'old-conversation', index: 0 }); assert.equal(staleChoice.ok, false);
  const validChoice = await f.action(host, { type: 'choose', dialogueId: dialogue.id, index: 0 }); assert.equal(validChoice.ok, true);
  await until(() => !host.client.state.dialogue || host.client.state.dialogue.id !== dialogue.id, 'resolved dialogue projection');
});
