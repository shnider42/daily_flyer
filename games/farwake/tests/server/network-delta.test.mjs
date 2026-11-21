import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { startServer } from '../../server/index.mjs';
import { WORLD_CONTENT_VERSION } from '../../dist/world-content.mjs';
import { SnapshotDeltaDecoder } from '../../dist/snapshot-delta.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

async function until(predicate, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Transport condition timed out.'); await pause(10); }
}
class MemoryPersistence {
  kind = 'test-memory'; durable = false; records = new Map();
  async ping() { return true; }
  async load(id) { return this.records.get(id) || { version: 0, snapshot: null }; }
  async save(id, version, snapshot) { this.records.set(id, { version: version + 1, snapshot: structuredClone(snapshot) }); return { version: version + 1 }; }
}
async function client(server, passport, delta = true) {
  const ws = new WebSocket(server.url.replace(/^http/, 'ws') + '/ws'), decoder = new SnapshotDeltaDecoder();
  const result = { ws, passport, packets: [], raw: [], latest: null, failures: 0 };
  ws.on('message', buffer => {
    const packet = JSON.parse(buffer.toString()); result.raw.push(packet);
    if (packet.type === 'welcome' || packet.type === 'snapshot' || packet.state) {
      const decoded = decoder.decode(packet);
      if (!decoded) { result.failures++; return; }
      result.packets.push(decoded); result.latest = mergeSnapshot(result.latest, decoded);
    }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'hello', protocol: 1, worldContentVersion: WORLD_CONTENT_VERSION, passport, ...(delta ? { snapshotDelta: 1 } : {}) }));
  await until(() => result.latest);
  result.command = async (name, args, id) => {
    ws.send(JSON.stringify({ type: 'command', name, args, id }));
    await until(() => result.raw.some(packet => packet.type === 'result' && packet.id === id));
    return result.raw.find(packet => packet.type === 'result' && packet.id === id);
  };
  return result;
}

test('four real sockets isolate congestion, retain unsent events, reset command baselines and preserve legacy clients', async t => {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: new MemoryPersistence() }), clients = [];
  t.after(async () => { for (const c of clients) c.ws.terminate(); await server.close(); });
  const realm = await server.manager.create('Delta transport', {}, 'delta-transport-regression');
  for (let index = 0; index < 4; index++) {
    const { passport } = await realm.createCaptain(`Captain ${index}`);
    clients.push(await client(server, passport, index !== 3));
  }
  await until(() => clients.slice(0, 3).every(c => c.raw.some(packet => packet.baseSnapshotId)));
  assert.ok(clients[3].raw.every(packet => packet.snapshotDelta === undefined), 'A previous-version tab keeps the original protocol.');
  const slow = clients[0], captain = realm.captains.get(slow.passport.captainId), session = captain.session;
  Object.defineProperty(session.ws, 'bufferedAmount', { configurable: true, get: () => 1 });
  t.after(() => { delete session.ws.bufferedAmount; });
  await pause(60); // Let any already accepted pre-congestion packet arrive.
  const packetsBefore = slow.packets.length, baselineBefore = session.deltaEncoder.sequence, tickBefore = server.tick;
  captain.events.push({ type: 'transport-check', id: 'retained-event', text: 'Gameplay event during congestion.' });
  const otherBefore = clients[1].packets.length;
  await pause(330);
  assert.equal(slow.packets.length, packetsBefore, 'No more periodic frames join an existing socket backlog.');
  assert.equal(session.deltaEncoder.sequence, baselineBefore, 'Skipped snapshots do not advance the peer baseline.');
  assert.ok(captain.events.some(event => event.id === 'retained-event'), 'Skipped snapshots do not drain gameplay events.');
  assert.ok(server.tick > tickBefore && clients[1].packets.length > otherBefore, 'Other captains and the authority continue.');
  delete session.ws.bufferedAmount;
  await until(() => slow.packets.some(packet => packet.events?.some(event => event.id === 'retained-event')));
  await pause(220);
  assert.equal(slow.packets.flatMap(packet => packet.events || []).filter(event => event.id === 'retained-event').length, 1);
  assert.equal(slow.failures, 0, 'The first packet after congestion uses the actual sent baseline.');

  const renamed = await slow.command('renameCaptain', { name: 'Renamed after backlog' }, 'rename-after-congestion');
  assert.equal(renamed.ok, true); assert.ok(renamed.state); assert.equal(renamed.baseSnapshotId, undefined, 'Reliable command results reset with a full state.');
  const refused = await slow.command('patchState', { credits: 99999999 }, 'invalid-state-upload');
  assert.equal(refused.ok, false); assert.ok(refused.state); assert.equal(refused.baseSnapshotId, undefined);
  assert.notEqual(captain.game.state.credits, 99999999);
  const resultSequence = refused.snapshotId;
  await until(() => slow.raw.some(packet => packet.type === 'snapshot' && packet.baseSnapshotId === resultSequence));
  assert.equal(slow.failures, 0);
  assert.ok(slow.packets.every(packet => !Object.hasOwn(packet.state, 'gamblingSession')), 'Transport preserves the existing public snapshot projection.');

  // Full-only metadata must still refresh at the old cadence while its wire
  // representation may itself be encoded as a delta.
  captain.game.state.flags.push('transport_metadata_changed');
  const metadataChangedAt = Date.now();
  await until(() => slow.latest.state.flags?.includes('transport_metadata_changed'), 2500);
  assert.ok(Date.now() - metadataChangedAt < 2000);
  assert.ok(clients.every(c => c.failures === 0));
});
