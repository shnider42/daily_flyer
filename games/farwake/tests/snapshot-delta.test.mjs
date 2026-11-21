import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotDeltaEncoder, SnapshotDeltaDecoder } from '../dist/snapshot-delta.mjs';

const wire = value => JSON.parse(JSON.stringify(value));
const base = () => ({ type: 'snapshot', tick: 1, room: { id: 'test:hearth', systemId: 'hearth' }, state: { mode: 'ship', ship: { id: 'cinder', x: 0, y: 0 }, person: { health: 100 }, flags: ['arrived'], interior: null }, world: { traffic: [{ id: 'a', x: 1, name: 'Courier' }, { id: 'b', x: 2, name: 'Hauler' }], bullets: [] }, players: [], remoteShips: [], events: [] });
function transfer(encoder, decoder, snapshot, options) {
  const prepared = encoder.prepare(snapshot, options);
  const result = decoder.decode(JSON.parse(prepared.data));
  encoder.commit(prepared);
  assert.deepEqual(result, wire(snapshot));
  return { prepared, result };
}

test('wire deltas reproduce object deletion, nulls, array insertion/removal and full room resets exactly', () => {
  const encoder = new SnapshotDeltaEncoder(), decoder = new SnapshotDeltaDecoder(), initial = base();
  transfer(encoder, decoder, initial);
  const moved = structuredClone(initial); moved.tick++;
  moved.state.ship.x = 2.25; moved.state.person.health = 78;
  moved.world.traffic.unshift({ id: 'c', x: 5, name: 'New arrival' });
  moved.world.traffic[2].name = 'Renamed hauler';
  moved.world.bullets.push({ id: 'shot-1', x: 2, y: 3 });
  moved.events = [{ type: 'hit', amount: 22 }];
  transfer(encoder, decoder, moved);
  const removed = structuredClone(moved); removed.tick++;
  removed.world.traffic.splice(1, 1); removed.world.traffic.reverse();
  removed.world.bullets = []; removed.events = [];
  delete removed.state.flags; removed.state.ship.power = null; removed.state.interior = { kind: 'ship', location: { id: 'deck' } };
  transfer(encoder, decoder, removed);
  const full = base(); full.tick = 4; full.room = { id: 'test:morrow', systemId: 'hearth' }; full.state.mode = 'person';
  assert.equal(transfer(encoder, decoder, full, { reset: true }).prepared.full, true);
  full.tick++; full.state.interior = null; transfer(encoder, decoder, full);
});

test('encoder and decoder baselines follow actual JSON semantics and cannot be poisoned by caller mutation', () => {
  const encoder = new SnapshotDeltaEncoder(), decoder = new SnapshotDeltaDecoder(), initial = base();
  initial.state.odd = { absent: undefined, notFinite: Infinity, values: [undefined, NaN, null, false, ''], ...JSON.parse('{"__proto__":{"value":3}}') };
  const { result } = transfer(encoder, decoder, initial);
  result.state.ship.x = 900; result.world.traffic[0].name = 'Client prediction';
  initial.state.ship.x = 10; initial.world.traffic[0].x = 20; initial.tick++;
  const next = transfer(encoder, decoder, initial).result;
  assert.equal(next.world.traffic[0].name, 'Courier');
  assert.equal(next.state.odd.absent, undefined);
  assert.equal(Object.hasOwn(next.state.odd, 'absent'), false);
  assert.deepEqual(next.state.odd.values, [null, null, null, false, '']);
  assert.equal(Object.getPrototypeOf(next.state.odd), Object.prototype);
  initial.state.odd.values = [1, undefined]; delete initial.state.odd.__proto__; initial.tick++;
  transfer(encoder, decoder, initial);
});

test('unsent prepared snapshots do not advance baseline; a gap waits for a full reset', () => {
  const encoder = new SnapshotDeltaEncoder(), decoder = new SnapshotDeltaDecoder(), initial = base();
  transfer(encoder, decoder, initial);
  const skipped = structuredClone(initial); skipped.tick = 2; skipped.state.ship.x = 5;
  encoder.prepare(skipped); // The socket was not writable: no commit and no receive.
  const delivered = structuredClone(skipped); delivered.tick = 3; delivered.state.ship.x = 8;
  const sent = transfer(encoder, decoder, delivered).prepared;
  assert.equal(sent.packet.baseSnapshotId, 1);
  const missing = encoder.prepare({ ...delivered, tick: 4 }); encoder.commit(missing);
  const afterGap = encoder.prepare({ ...delivered, tick: 5 }); encoder.commit(afterGap);
  assert.equal(decoder.decode(JSON.parse(afterGap.data)), null);
  assert.equal(decoder.decode(JSON.parse(afterGap.data)), null);
  transfer(encoder, decoder, { ...delivered, tick: 6, type: 'result', id: 'command', result: { ok: true } }, { reset: true });
  transfer(encoder, decoder, { ...delivered, tick: 7 });
  const legacy = { ...base(), tick: 8 };
  assert.equal(decoder.decode(legacy), legacy);
  const needsBaseline = encoder.prepare({ ...delivered, tick: 9 });
  assert.equal(decoder.decode(JSON.parse(needsBaseline.data)), null);
});

test('a mixed evolving scene stays exact across hundreds of real JSON packets', () => {
  const encoder = new SnapshotDeltaEncoder(), decoder = new SnapshotDeltaDecoder(), snapshot = base();
  let seed = 48271;
  const random = max => { seed = Math.imul(seed, 1664525) + 1013904223 >>> 0; return seed % max; };
  for (let tick = 1; tick <= 240; tick++) {
    snapshot.tick = tick; snapshot.state.ship.x = random(1000) / 10;
    snapshot.events = tick % 9 ? [] : [{ type: 'arrival', id: tick }];
    snapshot.partial = tick % 10 !== 0;
    if (snapshot.partial) delete snapshot.state.flags;
    else snapshot.state.flags = ['arrived', `completed-${Math.floor(tick / 10)}`];
    switch (random(4)) {
      case 0: snapshot.world.traffic.push({ id: `ship-${tick}`, x: random(100), health: 100, target: null }); break;
      case 1: snapshot.world.traffic.splice(random(Math.max(1, snapshot.world.traffic.length)), 1); break;
      case 2: snapshot.world.traffic.reverse(); break;
      default: if (snapshot.world.traffic.length) { const ship = snapshot.world.traffic[random(snapshot.world.traffic.length)]; ship.x = random(100); ship.health = random(101); ship.target = random(2) ? 'cinder' : null; }
    }
    const result = transfer(encoder, decoder, snapshot, { reset: tick % 50 === 0 }).result;
    result.state.ship.y = -999; // The next decode must remain independent.
  }
});

test('one broadcast can reuse neutral world work without sharing private views or guessing a delayed peer baseline', () => {
  const encoders = Array.from({ length: 4 }, () => new SnapshotDeltaEncoder());
  const decoders = Array.from({ length: 4 }, () => new SnapshotDeltaDecoder());
  for (let index = 0; index < 4; index++) {
    const snapshot = base(); snapshot.state.privateFlag = `captain-${index}`;
    snapshot.world.traffic[0].x = index * 10;
    transfer(encoders[index], decoders[index], snapshot);
  }
  for (let tick = 2; tick <= 16; tick++) {
    // Same immutable neutral objects, fresh cache for this broadcast only.
    const traffic = [{ id: 'a', x: tick * 3, name: tick > 8 ? 'Renamed courier' : 'Courier' }];
    if (tick < 10) traffic.push({ id: 'b', x: -tick, name: 'Hauler' });
    const shared = new WeakMap();
    for (let index = 0; index < 4; index++) {
      if (index === 1 && tick >= 4 && tick <= 7) continue; // Congested peer.
      const snapshot = base(); snapshot.tick = tick;
      snapshot.state.privateFlag = `captain-${index}`;
      snapshot.world.traffic = traffic;
      snapshot.world.signals = [{ id: 'personal-signal', resolved: index % 2 === 0 }];
      transfer(encoders[index], decoders[index], snapshot, { shared, reset: index === 2 && tick === 6 });
    }
  }
});
