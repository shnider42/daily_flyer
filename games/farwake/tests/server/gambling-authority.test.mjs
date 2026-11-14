import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { createPrivacyExport } from '../../server/privacy.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const storage = () => ({ kind: 'memory', durable: true, save: async (_id, version) => ({ version: version + 1 }) });
async function fixture(gameId = 'poker') {
  const realm = new Realm({ id: 'TABLE123', seed: 'authoritative-gaming', persistence: storage() }), captains = [];
  for (let index = 0; index < 2; index++) {
    const { captain } = await realm.createCaptain(`Player ${index + 1}`, { startMode: index ? 'hardcore' : 'regular' });
    ok(realm.attach(captain, { close() {} }));
    const vessel = realm.vessels.get(captain.ownedVesselId);
    if (vessel) { vessel.dockedAt = 'kettle'; vessel.helmOwner = null; }
    realm._landCharacter(captain, 'hearth', 'kettle');
    realm._bindCaptain(captain);
    const table = realm._surface(captain).entities.find(entity => entity.type === 'gambling' && entity.data.gameId === gameId);
    assert.ok(table);
    Object.assign(captain.game.state.person, { x: table.x, y: table.y });
    captains.push(captain);
  }
  const table = realm._surface(captains[0]).entities.find(entity => entity.type === 'gambling' && entity.data.gameId === gameId);
  return { realm, captains, table };
}
const action = (captain, type, extra = {}) => ({ type, sessionId: captain.game.gamblingStatus().id, revision: captain.game.gamblingStatus().revision, ...extra });
function assertPrivate(view) {
  const text = JSON.stringify(view);
  assert.ok(!text.includes('"deck"'));
  assert.ok(!text.includes('"rng"'));
  assert.ok(!text.includes('"randomState"'));
  assert.ok(!text.includes('"seed"'));
}

test('authority charges only the caller, validates the actual table and deduplicates retried wagers', async () => {
  const { realm, captains: [captain, other], table } = await fixture(), game = captain.game, funds = game.state.credits;
  game.state.person.x += 100;
  assert.equal((await realm.command(captain, 'startGambling', { entityId: table.id, gameId: 'poker', stake: 10, x: table.x, y: table.y })).code, 'distance');
  Object.assign(game.state.person, { x: table.x, y: table.y });
  const args = { entityId: table.id, gameId: 'poker', stake: 20, captainId: other.id, credits: 99999, payout: [99999], deck: [1, 2, 3], escrow: 0 };
  const first = ok(await realm.command(captain, 'startGambling', args, 'buy-in-1'));
  assert.equal(game.state.credits, funds - 20);
  assert.equal(other.game.state.credits, 180);
  assert.deepEqual(ok(await realm.command(captain, 'startGambling', args, 'buy-in-1')), first);
  assert.equal(game.state.credits, funds - 20);
  assert.equal((await realm.command(captain, 'gamblingAction', { type: 'fold' })).code, 'gambling-stale');
  const folding = action(captain, 'fold'), finished = ok(await realm.command(captain, 'gamblingAction', folding, 'fold-1'));
  assert.equal(finished.session.settled, true);
  const paid = game.state.credits;
  ok(await realm.command(captain, 'gamblingAction', folding, 'fold-1'));
  assert.equal(game.state.credits, paid);
  assert.equal(game.state.gamblingHistory.length, 1);
  assert.equal((await realm.command(captain, 'gamblingAction', folding, 'forged-second-fold')).ok, false);
});

test('full snapshots, motion packets, other captains and account exports never reveal future cards', async () => {
  const { realm, captains: [captain, other], table } = await fixture();
  const first = ok(await realm.command(captain, 'startGambling', { entityId: table.id, gameId: 'poker', stake: 10 }));
  assertPrivate(first.session);
  const full = realm.snapshotFor(captain), motion = realm.snapshotFor(captain, { compact: true }), peer = realm.snapshotFor(other);
  assert.equal(Object.hasOwn(full.state, 'gamblingSession'), false);
  assert.equal(Object.hasOwn(motion.state, 'gamblingSession'), false);
  assertPrivate(full.state.gamblingView); assertPrivate(motion.state.gamblingView);
  assert.equal(peer.state.gamblingView, null);
  assert.equal(JSON.stringify(peer.players).includes('poker'), false);
  assert.deepEqual(mergeSnapshot(full, motion).state.gamblingView, full.state.gamblingView);
  const report = createPrivacyExport(realm, captain);
  assert.ok(!JSON.stringify(report).includes('"deck"'));
  assert.equal(JSON.stringify(report).includes('"gamblingSession"'), false);
  assert.deepEqual(report.manifest.unrecognizedGameFields, []);
});

test('reserved rounds and receipts survive an authority restart without a new charge or reward', async () => {
  const { realm, captains: [captain], table } = await fixture('pool');
  ok(await realm.command(captain, 'startGambling', { entityId: table.id, gameId: 'pool', stake: 20 }, 'pool-buy-in'));
  const saved = realm.document(), restored = new Realm({ id: realm.id, snapshot: saved, persistence: storage() }), returning = restored.captains.get(captain.id);
  assert.equal(returning.game.state.credits, 160);
  assert.equal(returning.game.gamblingStatus().gameId, 'pool');
  ok(await restored.command(returning, 'leaveGambling', action(returning, 'leave'), 'pool-leave'));
  assert.equal(returning.game.state.credits, 160);
  const again = new Realm({ id: restored.id, snapshot: restored.document(), persistence: storage() });
  assert.equal(again.captains.get(captain.id).game.state.credits, 160);
  assert.equal(again.captains.get(captain.id).game.state.gamblingHistory.length, 1);
});
