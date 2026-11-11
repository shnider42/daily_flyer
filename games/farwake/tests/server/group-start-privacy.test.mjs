import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivacyExport } from '../../server/privacy.mjs';

test('a departure participant can export their readiness and launch without another captain’s membership record', () => {
  const captain = { id: 'captain_owner', name: 'Own captain', launchStatus: 'launched', launchReady: false, game: { state: { mode: 'person', credits: 180 } } };
  const other = { id: 'captain_other_private', name: 'Other private captain', launchStatus: 'launched', launchReady: false };
  const source = { id: 'TEST-REALM', ownerId: other.id, captains: new Map([[captain.id, captain], [other.id, other]]), vessels: new Map(),
    groupStart: { version: 1, status: 'launched', selectedClassId: 'lark', launchedAt: 123456, participants: [other.id, captain.id], vesselId: 'group-vessel' } };
  const before = JSON.stringify(source.groupStart);
  const report = createPrivacyExport(source, captain, { sourceKind: 'live-authority' });
  assert.equal(report.captain.launchStatus, 'launched');
  assert.equal(report.captain.launchReady, false);
  assert.deepEqual(report.departure, { version: 1, status: 'launched', selectedClassId: 'lark', launchedAt: 123456, isHost: false, participated: true, vesselId: 'group-vessel' });
  assert.equal(JSON.stringify(report).includes(other.id), false);
  assert.equal(JSON.stringify(report).includes(other.name), false);
  assert.equal(JSON.stringify(source.groupStart), before, 'Export must not change a departure or a ready decision.');
});

test('waiting captains export their current choice while unrelated late arrivals receive no departure record', () => {
  const source = { realmId: 'TEST-REALM', ownerId: 'host', captains: {}, vessels: {}, groupStart: { version: 1, status: 'assembling', selectedClassId: 'puffin', launchedAt: null, participants: [], vesselId: null } };
  const captain = { id: 'guest', launchStatus: 'waiting', launchReady: true, game: {} };
  const waiting = createPrivacyExport(source, captain);
  assert.equal(waiting.captain.launchReady, true);
  assert.equal(waiting.departure.selectedClassId, 'puffin');
  assert.equal(waiting.departure.participated, false);
  assert.equal('vesselId' in waiting.departure, false);
  const unrelated = createPrivacyExport(source, { id: 'late', launchStatus: null, launchReady: false, game: {} });
  assert.equal('departure' in unrelated, false);
});
