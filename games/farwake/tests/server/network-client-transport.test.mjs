import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { startServer } from '../../server/index.mjs';
import { FilePersistence } from '../../server/persistence.mjs';
import { FarwakeNetwork } from '../../dist/network.mjs';

async function until(predicate, timeout = 6000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for the browser transport.');
    await pause(15);
  }
}

class ObservedSocket extends WebSocket {
  constructor(url) {
    super(url); this.deltaPackets = 0; this.fullPackets = 0;
    this.on('message', data => {
      const packet = JSON.parse(data.toString());
      if (packet.snapshotDelta === 1) {
        if (Object.hasOwn(packet, 'baseSnapshotId')) this.deltaPackets++;
        else this.fullPackets++;
      }
    });
  }
}

test('four browser transports decode shared movement, reliable results and fresh reconnect baselines', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farwake-browser-transport-'));
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence: new FilePersistence(directory) });
  const clients = [];
  t.after(async () => { for (const client of clients) client.disconnect(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const newClient = () => {
    const client = new FarwakeNetwork({ url: server.url, WebSocketImpl: ObservedSocket, storage: null, autoReconnect: false });
    clients.push(client); return client;
  };
  const host = newClient();
  await host.connect({ create: true, name: 'Transport captain', realmName: 'Transport regression' });
  for (let i = 1; i < 4; i++) await newClient().connect({ realmCode: host.passport.realmCode, name: `Transport crew ${i}` });
  for (const client of clients) client.setInput({ thrust: 1, turn: .2, flightAssist: true });
  await until(() => clients.every(client => client.socket.deltaPackets >= 3 && client.latest.ack > 0 && client.latest.realm.online === 4));
  for (const client of clients) {
    assert.equal(client.latency.deltaSnapshots, true);
    assert.equal(client.latest.realm.online, 4);
    assert.ok(Number.isFinite(client.latest.state.ship.x));
    assert.ok(client.latest.state.journal, 'the app still receives the reconstructed metadata contract');
    assert.ok(client.latency.receivedBytesPerSecond > 0);
  }

  // Rendering may mutate a delivered snapshot. It must not corrupt the next
  // wire baseline or leak fabricated state back into authority.
  const authoritativeCredits = host.latest.state.credits, previousTick = host.latest.tick;
  host.latest.state.credits = -999999;
  await until(() => host.latest.tick > previousTick);
  assert.equal(host.latest.state.credits, authoritativeCredits);
  const answer = await host.command('renameCaptain', { name: 'Confirmed transport captain' });
  assert.equal(answer.ok, true); assert.equal(host.state.multiplayer.name, 'Confirmed transport captain');
  const resultTick = host.latest.tick;
  await until(() => host.latest.tick > resultTick);
  assert.equal(host.state.multiplayer.name, 'Confirmed transport captain', 'deltas continue after the full reliable result');

  const guest = clients[3], passport = { ...guest.passport };
  guest.disconnect();
  await guest.connect({ passport });
  guest.setInput({ thrust: .5 });
  await until(() => guest.socket.deltaPackets >= 2 && guest.latest.ack > 0);
  assert.ok(guest.socket.fullPackets >= 1, 'the new connection begins from its own full baseline');
  assert.equal(guest.passport.captainId, passport.captainId);
  assert.equal(guest.state.multiplayer.captainId, passport.captainId);
  assert.equal(guest.latency.deltaSnapshots, true);
});
