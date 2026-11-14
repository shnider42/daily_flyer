import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import WebSocket from 'ws';
import { startServer } from '../../server/index.mjs';
import { FilePersistence } from '../../server/persistence.mjs';
import { WORLD_CONTENT_VERSION } from '../../dist/world-content.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

const ok = packet => { assert.equal(packet?.ok, true, packet?.result?.reason || packet?.reason); return packet; };
async function until(condition, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!condition()) { if (Date.now() >= deadline) throw new Error('Timed out waiting for a gaming-table packet.'); await pause(15); }
}
function assertNoKeys(value, forbidden, label = 'public table') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!forbidden.includes(key), `${label} excludes ${key}`);
    assertNoKeys(child, forbidden, label);
  }
}
const assertPrivateCards = value => assertNoKeys(value, ['deck', 'rng', 'randomState', 'hands', 'gamblingSession']);
const assertNoReplay = value => assertNoKeys(value, ['frames'], 'snapshot, saved round or retry receipt');

class TableClient {
  constructor(server, passport) { this.server = server; this.passport = passport; this.packets = []; this.pending = new Map(); this.serial = 0; }
  async connect() {
    this.ws = new WebSocket(this.server.url.replace(/^http/, 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Gaming client welcome timed out.')), 5000);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'hello', protocol: 1, worldContentVersion: WORLD_CONTENT_VERSION, passport: this.passport })));
      this.ws.on('message', buffer => {
        const packet = JSON.parse(buffer.toString());
        this.packets.push(packet);
        if (packet.state) this.latest = mergeSnapshot(this.latest, packet);
        if (packet.type === 'welcome') { clearTimeout(timer); resolve(); }
        if (packet.type === 'error') { clearTimeout(timer); reject(new Error(packet.reason)); }
        if (packet.type === 'result') {
          const waiting = this.pending.get(packet.id);
          if (waiting) { clearTimeout(waiting.timer); this.pending.delete(packet.id); waiting.resolve(packet); }
        }
      });
      this.ws.once('error', error => { clearTimeout(timer); reject(error); });
    });
    return this;
  }
  command(name, args = {}, id = `table-wire-${++this.serial}`) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${name} was not acknowledged.`)); }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ type: 'command', name, args, id }));
    });
  }
  close() { for (const request of this.pending.values()) clearTimeout(request.timer); this.pending.clear(); this.ws?.terminate(); }
}

async function fixture(t, gameId) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'farwake-table-wire-')), persistence = new FilePersistence(directory), clients = [];
  let server;
  t.after(async () => { for (const client of clients) client.close(); if (server) await server.close(); await rm(directory, { recursive: true, force: true }); });
  server = await startServer({ port: 0, host: '127.0.0.1', persistence, flushIntervalMs: 60000 });
  async function register(action, realmCode, name) {
    const response = await fetch(server.url + '/api/realms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, realmCode, name, realmName: 'Glimmer table transport', worldContentVersion: WORLD_CONTENT_VERSION }) });
    assert.equal(response.status, 200); return ok(await response.json());
  }
  const first = await register('create', undefined, 'First captain'), second = await register('join', first.passport.realmCode, 'Second captain');
  const realm = server.manager.realms.get(first.passport.realmCode), captains = [], tables = [];
  for (const registration of [first, second]) {
    const captain = realm.captains.get(registration.passport.captainId), vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel, { systemId: 'voltage', dockedAt: 'glimmer', helmOwner: null, actor: null });
    realm._landCharacter(captain, 'voltage', 'glimmer'); realm._bindCaptain(captain);
    const table = realm._surface(captain).entities.find(entity => entity.type === 'gambling' && entity.data.gameId === gameId);
    assert.ok(table, `Glimmer has its actual ${gameId} table.`);
    Object.assign(captain.game.state.person, { x: table.x, y: table.y });
    captains.push(captain); tables.push(table);
    const client = new TableClient(server, registration.passport); clients.push(client); await client.connect();
  }
  return { server, realm, captains, clients, tables, persistence };
}
const action = (view, type, rest = {}) => ({ type, sessionId: view.id, revision: view.revision, ...rest });

test('real WebSocket wagers keep two captains separate, conceal cards and settle retries once', async t => {
  const f = await fixture(t, 'poker'), [first, second] = f.clients, [owner, peer] = f.captains;
  const funds = [owner.game.state.credits, peer.game.state.credits], buyIn = { entityId: f.tables[0].id, gameId: 'poker', stake: 20 };
  const started = ok(await first.command('startGambling', buyIn, 'poker-buy-in'));
  assert.equal(started.result.session.gameId, 'poker');
  assert.equal(started.state.credits, funds[0] - 20);
  assert.deepEqual(started.state.gamblingView, started.result.session);
  assert.deepEqual(started.result.session.opponentCards, [null, null]);
  assert.equal(Object.hasOwn(started.state, 'gamblingSession'), false);
  assertPrivateCards(started.result.session);
  const retried = ok(await first.command('startGambling', buyIn, 'poker-buy-in'));
  assert.deepEqual(retried.result, started.result);
  assert.equal(owner.game.state.credits, funds[0] - 20);
  assert.equal(peer.game.state.credits, funds[1]);

  await until(() => second.packets.some(packet => packet.type === 'snapshot' && packet.room?.locationId === 'glimmer'));
  assert.equal(second.latest.state.gamblingView, null);
  assertNoKeys(second.latest.players, ['gamblingView', 'gamblingSession', 'cards', 'deck']);
  const remoteAttempt = await second.command('gamblingAction', action(started.result.session, 'fold', { captainId: owner.id }));
  assert.equal(remoteAttempt.ok, false);
  assert.equal(owner.game.state.gamblingSession.revision, started.result.session.revision);

  const peerStarted = ok(await second.command('startGambling', { ...buyIn, captainId: owner.id, credits: 99999, payout: [99999, 99999] }, 'peer-poker-buy-in'));
  assert.equal(peerStarted.result.session.playerName, 'Second captain');
  assert.equal(peer.game.state.credits, funds[1] - 20);
  assert.equal(owner.game.state.credits, funds[0] - 20);
  assert.equal(peerStarted.state.gamblingView.playerName, 'Second captain');
  assertPrivateCards(peerStarted.result.session);
  const peerFold = ok(await second.command('gamblingAction', action(peerStarted.result.session, 'fold', { captainId: owner.id }), 'peer-fold'));
  assert.equal(peerFold.result.session.settled, true);
  assert.equal(owner.game.state.gamblingSession.status, 'playing');
  assert.equal(owner.game.state.credits, funds[0] - 20);
  assert.equal(peer.game.state.credits, funds[1] - 20 + peerFold.result.session.creditsReturned);

  const folding = action(started.result.session, 'fold'), finished = ok(await first.command('gamblingAction', folding, 'poker-fold'));
  const paid = owner.game.state.credits;
  assert.equal(paid, funds[0] - 20 + finished.result.session.creditsReturned);
  assert.equal(finished.result.session.settled, true);
  assert.deepEqual(finished.state.gamblingView, finished.result.session);
  ok(await first.command('gamblingAction', folding, 'poker-fold'));
  assert.equal(owner.game.state.credits, paid);
  assert.equal(owner.game.state.gamblingHistory.length, 1);
  assert.equal((await first.command('gamblingAction', folding, 'fresh-duplicate-fold')).ok, false);
  await until(() => first.packets.some(packet => packet.type === 'snapshot' && packet.partial && packet.state?.gamblingView?.settled));
  for (const packet of first.packets.filter(packet => packet.state?.gamblingView)) assertPrivateCards(packet.state.gamblingView);
  assert.equal(first.latest.state.credits, paid);
});

test('a real pool shot sends replay once and keeps snapshots, private saves and cached retries compact', async t => {
  const f = await fixture(t, 'pool'), [first, second] = f.clients, [owner, peer] = f.captains;
  const buyIn = { entityId: f.tables[0].id, gameId: 'pool', stake: 20 };
  const started = ok(await first.command('startGambling', buyIn, 'pool-buy-in'));
  const peerStarted = ok(await second.command('startGambling', buyIn, 'peer-pool-buy-in'));
  const peerBalls = structuredClone(peerStarted.result.session.balls), peerFunds = peer.game.state.credits;
  const shotArgs = action(started.result.session, 'shoot', { angle: 0, power: 1 });
  const shot = ok(await first.command('gamblingAction', shotArgs, 'pool-break'));
  const session = shot.result.session;
  assert.ok(session.shotNumber >= 1);
  assert.ok(session.recentShots.length >= 1);
  assert.equal(session.recentShots[0].actor, 0);
  assert.ok(session.recentShots[0].frames.length > 1, 'The acknowledged physical shot can be animated.');
  assert.notDeepEqual(session.balls, started.result.session.balls);
  assert.equal(shot.state.gamblingView.shotNumber, session.shotNumber);
  assertNoReplay(shot.state.gamblingView);
  assertNoReplay(owner.game.state.gamblingSession);
  assertNoReplay(owner.recentCommands);
  assert.deepEqual(peer.game.gamblingStatus().balls, peerBalls);
  assert.equal(peer.game.state.credits, peerFunds);
  assert.equal(peer.game.gamblingStatus().shotNumber, 0);

  const paid = owner.game.state.credits, retry = ok(await first.command('gamblingAction', shotArgs, 'pool-break'));
  assert.equal(retry.result.session.revision, session.revision);
  assert.equal(retry.result.session.shotNumber, session.shotNumber);
  assert.deepEqual(retry.result.session.balls, session.balls);
  assertNoReplay(retry.result.session);
  assertNoReplay(retry.state.gamblingView);
  assert.equal(owner.game.state.credits, paid);
  assert.equal((await first.command('gamblingAction', shotArgs, 'fresh-stale-shot')).ok, false);
  assert.equal(owner.game.gamblingStatus().shotNumber, session.shotNumber);

  await until(() => first.packets.some(packet => packet.type === 'snapshot' && packet.partial && packet.state?.gamblingView?.shotNumber === session.shotNumber));
  await until(() => second.packets.some(packet => packet.type === 'snapshot' && packet.state?.gamblingView?.gameId === 'pool'));
  for (const client of f.clients) for (const packet of client.packets.filter(packet => packet.state?.gamblingView)) assertNoReplay(packet.state.gamblingView);
  assert.equal(second.latest.state.gamblingView.shotNumber, 0);
  assert.deepEqual(second.latest.state.gamblingView.balls, peerBalls);
  assertNoKeys(second.latest.players, ['gamblingView', 'gamblingSession', 'recentShots', 'frames']);

  await f.realm.flush();
  const saved = (await f.persistence.load(f.realm.id)).snapshot;
  assert.equal(saved.captains[owner.id].game.gamblingSession.pool.shotNumber, session.shotNumber);
  assertNoReplay(saved.captains[owner.id].game.gamblingSession);
  assertNoReplay(saved.captains[owner.id].recentCommands);
  assert.equal(saved.captains[peer.id].game.gamblingSession.pool.shotNumber, 0);
  t.diagnostic(`Pool action result: ${Buffer.byteLength(JSON.stringify(session))} bytes; replay-free snapshot view: ${Buffer.byteLength(JSON.stringify(shot.state.gamblingView))} bytes.`);
});
