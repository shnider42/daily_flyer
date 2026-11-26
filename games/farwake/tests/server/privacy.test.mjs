import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/index.mjs';
import { Realm } from '../../server/realm.mjs';
import { Game } from '../../dist/engine.mjs';
import { GALAXY_EPOCH } from '../../dist/galaxy-epoch.mjs';
import { newSecret, secretHash } from '../../server/protocol.mjs';
import { authenticateExport, createPrivacyExport, RequestRateLimits, REQUEST_RATE_IDLE_MS } from '../../server/privacy.mjs';

const A = 'captain_' + 'a'.repeat(24), B = 'captain_' + 'b'.repeat(24), realmCode = 'PRIVACY1';
const tokenA = newSecret(), tokenB = newSecret();
const passportA = { realmCode, captainId: A, token: tokenA };
const passportB = { realmCode, captainId: B, token: tokenB };
const privateOther = 'PRIVATE_OTHER_CAPTAIN_CANARY';
const copy = value => structuredClone(value);

function snapshot() {
  const game = copy(new Game('privacy-synthetic-realm').state);
  game.journal = [{ id: 'my-journal', text: 'My saved voyage history.' }];
  game.flags = ['my-choice']; game.stats.distance = 1234;
  game.returnVesselId = 'my-parked-vessel';
  game.shipRecovery = { vesselId: 'my-lost-hull', destination: { systemId: 'hearth', bodyId: 'kettle' } };
  game.militaryRecovery = { factionId: 'freewake', status: 'detained', detention: { remainingSeconds: 172 } };
  game.worlds = { excluded: { privateOther } };
  game.explorationRecords = { excluded: { privateOther } };
  game.worldDirector = { excluded: { privateOther } };
  game.exploration = { key: 'hearth:morrow:lab', bodyId: 'morrow', siteId: 'lab', returnPosition: { x: 10, y: 20 }, encounter: { privateOther } };
  const captain = (id, token, name, state) => ({ id, name, tokenHash: secretHash(token), createdAt: 100, lastSeen: 200,
    home: { kind: 'port', systemId: 'hearth', locationId: 'kettle' }, cameraPreferences: { shipZoom: 1.1, personZoom: 1.4 }, cameraRevision: 2,
    ownedVesselId: `vessel_${id}`, aboard: `vessel_${id}`, crewRole: 'helm', returnVesselId: null, portVesselId: null, boardingTeam: null,
    combatAtDisconnect: false, recentCommands: [{ id: 'my-request', result: { ok: true, text: 'My recorded result', token, tokenHash: secretHash(token) } }], game: state });
  return {
    format: 1, realmId: realmCode, name: 'Synthetic privacy test', seed: 'privacy-synthetic-realm', ownerId: A, createdAt: 50, updatedAt: 300,
    captains: { [A]: captain(A, tokenA, 'Synthetic A', game), [B]: captain(B, tokenB, privateOther, { ...copy(game), journal: [{ text: privateOther }], flags: [privateOther] }) },
    vessels: {
      [`vessel_${A}`]: { id: `vessel_${A}`, ownerId: A, name: 'My ship', ship: copy(game.ship), grants: { [B]: { allowed: true, roles: ['engineering'] } }, bunks: { 0: A }, inventory: { crew: [{ id: 'npc-a', name: 'Hired NPC' }] }, pvp: { crewActors: [{ id: B, captainId: B, human: true, privateDetail: privateOther }] } },
      [`vessel_${B}`]: { id: `vessel_${B}`, ownerId: B, name: 'Shared vessel', ship: copy(game.ship), grants: { [A]: { allowed: true, roles: ['medical'] }, [B]: { privateDetail: privateOther } }, bunks: { 0: B, 1: A }, helmOwner: A, occupation: { controllerId: A, controllerTeam: A }, pvp: { attackerIds: [A, B] }, inventory: { privateDetail: privateOther }, damageControl: { impacts: [{ sourceId: A, privateDetail: privateOther }] } },
    },
    leases: { own: { id: 'my-home', ownerId: A, ownerName: 'Synthetic A', kind: 'room', x: 12, y: 34, createdAt: 150 }, other: { id: 'other-home', ownerId: B, privateDetail: privateOther } },
    director: { events: [{ id: 'event-a', contributors: { [A]: { damage: 42, aid: 1, claimed: false, actions: ['my-action'], lastAt: 160 }, [B]: { privateDetail: privateOther } } }], history: [] },
    worlds: { hearth: { record: { spawned: [{ id: 'job-npc', professionOwner: A, professionContributors: { [A]: 42, [B]: 900 }, privateDetail: privateOther }], enemyStates: { 'captured-npc': { capturedBy: A, privateDetail: privateOther } } } } },
    sites: { 'hearth:morrow:lab': { actorCooldowns: { [A]: .2, [B]: .8 }, monsters: [{ id: 'my-hit', lastHitBy: A }, { id: 'other-hit', lastHitBy: B, privateDetail: privateOther }] } },
  };
}

function memoryPersistence(saved = snapshot()) {
  return { durable: true, kind: 'test-memory', reads: 0, writes: 0, fail: false, version: 7, snapshot: saved,
    async ping() { return { ok: true }; },
    async load(id) { this.reads++; if (this.fail) throw new Error('Synthetic storage outage'); return id === realmCode ? { version: this.version, snapshot: copy(this.snapshot) } : { version: 0, snapshot: null }; },
    async save(id, expected, value) { this.writes++; this.version++; this.snapshot = copy(value); return { version: this.version }; },
  };
}
async function serverFixture(t, persistence = memoryPersistence()) {
  const server = await startServer({ port: 0, host: '127.0.0.1', persistence, flushIntervalMs: 600000, snapshotHz: .01 });
  t.after(() => server.close());
  return { server, persistence, async request(body, options = {}) {
    const response = await fetch(server.url + '/api/privacy/export', { method: 'POST', headers: { 'content-type': 'application/json', ...options.headers }, body: JSON.stringify(body), ...options });
    return { status: response.status, headers: response.headers, data: await response.json() };
  } };
}

test('passport proof cannot select another captain using someone else’s token', () => {
  const source = snapshot();
  assert.equal(authenticateExport(source, passportA)?.id, A);
  assert.equal(authenticateExport(source, passportB)?.id, B);
  assert.equal(authenticateExport(source, { ...passportA, captainId: B }), null);
  assert.equal(authenticateExport(source, { ...passportA, realmCode: 'UNKNOWN1' }), null);
  assert.equal(authenticateExport(source, { ...passportA, token: 'wrong' }), null);
  assert.equal(authenticateExport(source, { ...passportA, captainId: '__proto__' }), null);
  assert.equal(authenticateExport(null, passportA), null);
});

test('export covers own stored records and shared associations without credentials or another private save', () => {
  const source = snapshot(), before = copy(source), captain = source.captains[A];
  const output = createPrivacyExport(source, captain, { version: 7, generatedAt: '2026-11-10T20:00:00Z' });
  assert.equal(output.schemaVersion, 1); assert.equal(output.scope.captainId, A); assert.equal(output.scope.realmCode, realmCode);
  assert.deepEqual(output.captain.game.journal, captain.game.journal);
  assert.deepEqual(output.captain.game.flags, ['my-choice']); assert.equal(output.captain.game.stats.distance, 1234);
  assert.equal(output.captain.game.returnVesselId, 'my-parked-vessel');
  assert.deepEqual(output.captain.game.shipRecovery, captain.game.shipRecovery);
  assert.deepEqual(output.captain.game.militaryRecovery, captain.game.militaryRecovery);
  assert.equal(output.captain.game.galaxyEpoch, captain.game.galaxyEpoch, 'The map marker describes the chart used by this captain’s stored voyage.');
  assert.equal(output.captain.game.spaceVersion, captain.game.spaceVersion, 'The geometry marker describes this captain’s saved space coordinates.');
  assert.equal(output.captain.game.worldTypesVersion, captain.game.worldTypesVersion, 'The place-size marker preserves the saved migration state.');
  assert.equal(output.captain.game.stationGeographyVersion, captain.game.stationGeographyVersion, 'The station marker preserves the saved neighborhood migration state.');
  for (const key of Object.keys(captain).filter(key => !['tokenHash', 'game', 'recentCommands'].includes(key))) assert.deepEqual(output.captain[key], captain[key], `Own captain field ${key} is represented.`);
  assert.equal(output.captain.recentCommands[0].result.text, 'My recorded result');
  assert.deepEqual(output.manifest.unrecognizedGameFields, []);
  assert.equal(output.ownedVessels.length, 1); assert.equal(output.ownedVessels[0].ownerId, A);
  assert.deepEqual(output.ownedVessels[0].grants[B], { allowed: true, roles: ['engineering'] });
  assert.equal(output.ownedHomes[0].id, 'my-home'); assert.equal(output.ownedHomes.length, 1);
  assert.deepEqual(output.sharedRelationships[0].grant.roles, ['medical']); assert.deepEqual(output.sharedRelationships[0].bunks, ['1']);
  assert.ok(output.sharedContributions.keyedRecords.some(record => record.path[0] === 'director' && record.value.damage === 42));
  assert.ok(output.sharedContributions.keyedRecords.some(record => record.path.includes('professionContributors') && record.value === 42));
  assert.ok(output.sharedContributions.keyedRecords.some(record => record.path.includes('actorCooldowns') && record.value === .2));
  assert.ok(output.sharedContributions.references.some(record => record.path.includes('lastHitBy') && record.value === A));
  assert.ok(output.sharedContributions.references.some(record => record.path.includes('capturedBy') && record.value === A));
  assert.ok(output.sharedContributions.references.some(record => record.path.includes('sourceId') && record.value === A));
  const serialized = JSON.stringify(output);
  for (const forbidden of [tokenA, tokenB, secretHash(tokenA), secretHash(tokenB), privateOther]) assert.ok(!serialized.includes(forbidden), 'Export does not contain a credential or the other captain’s private canary.');
  assert.ok(!('worlds' in output.captain.game)); assert.ok(!('encounter' in output.captain.game.exploration));
  assert.deepEqual(source, before, 'Projection must not mutate any source record.');
});

test('field-work export preserves personal qualifications and receipts without copying shared rescue participants', () => {
  const source = snapshot(), captain = source.captains[A], otherRescuer = 'captain_' + 'c'.repeat(24);
  const siteKey = 'orchard:site:floodworks-6', receiptId = 'floodworks-6:service-panel:cut:cut', aftercareId = 'floodworks-6:casualty-mara:handover:aftercare';
  const personal = {
    version: 1, tools: { cutter: true, powerBridge: false },
    active: { assignmentId: 'engineering-condenser', startedAt: 130 },
    completed: { 'engineering-safe-access': { assignmentId: 'engineering-safe-access', careerId: 'engineering', paid: 145, at: 125 } },
    contributions: {
      [receiptId]: { id: receiptId, siteId: 'floodworks-6', objectId: 'service-panel', action: 'cut', kind: 'cut', at: 110 },
      [aftercareId]: { id: aftercareId, siteId: 'floodworks-6', objectId: 'casualty-mara', action: 'handover', kind: 'aftercare', at: 120 },
    },
  };
  const sharedField = {
    version: 1, revision: 5, serviceCut: true,
    foreman: { phase: 'shutdown', participants: [A, otherRescuer], hitIds: [otherRescuer] },
    survivors: { mara: { id: 'mara', status: 'safe', escortId: otherRescuer, stabilizers: [A, otherRescuer], escorts: [otherRescuer], aftercare: [A, otherRescuer], travel: { [A]: 42, [otherRescuer]: 900 }, privateDetail: privateOther } },
  };
  captain.game.fieldWork = copy(personal);
  // Keep the private projection explicit even if a historical record retained
  // extra shared fields; ordinary stored achievements must stay unchanged.
  captain.game.fieldWork.shared = sharedField;
  captain.game.fieldWork.tools.borrowedFrom = otherRescuer;
  captain.game.fieldWork.active.escortId = otherRescuer;
  captain.game.fieldWork.completed['engineering-safe-access'].participants = [A, otherRescuer];
  captain.game.fieldWork.contributions[receiptId].participants = [A, otherRescuer];
  const location = { id: siteKey, kind: 'site', parentId: 'orchard', siteId: 'floodworks-6', site: { id: 'floodworks-6', name: 'Floodworks 6' }, field: sharedField };
  captain.game.interior = { kind: 'site', location };
  captain.game.exploration = { key: siteKey, bodyId: 'orchard', siteId: 'floodworks-6', returnPosition: { x: 10, y: 20 }, encounter: { field: sharedField } };
  captain.game.explorationRecords = { [siteKey]: { field: sharedField } };
  source.sites[siteKey] = { field: sharedField };
  captain.recentCommands.push({ id: 'enter-floodworks', result: { ok: true, body: location } });
  captain.game.futureUnclassifiedField = { privateDetail: privateOther };
  const before = copy(source);

  for (const live of [false, true]) {
    const selected = live ? { ...captain, game: { state: captain.game } } : captain;
    const authority = live ? { ...source, id: realmCode, captains: new Map([[A, selected], [B, source.captains[B]]]) } : source;
    const output = createPrivacyExport(authority, selected, { sourceKind: live ? 'live-authority' : 'durable-snapshot' });
    assert.deepEqual(output.captain.game.fieldWork, personal, 'Own earned pay, tools, active work and exact evidence kinds remain present.');
    assert.deepEqual(output.manifest.unrecognizedGameFields, ['futureUnclassifiedField'], 'New fields still require an explicit export classification.');
    assert.equal(output.captain.game.interior.location.id, siteKey);
    assert.equal(output.captain.game.interior.location.field, undefined);
    assert.equal(output.captain.game.exploration.encounter, undefined);
    assert.equal(output.captain.recentCommands.at(-1).result.body.field, undefined, 'Retained site-entry results cannot bypass the shared-state exclusion.');
    assert.ok(output.sharedContributions.keyedRecords.some(record => record.path.includes(siteKey) && record.path.includes('travel') && record.path.at(-1) === A && record.value === 42));
    assert.ok(output.sharedContributions.references.some(record => record.path.includes(siteKey) && record.path.includes('aftercare') && record.value === A));
    const serialized = JSON.stringify(output);
    for (const excluded of [otherRescuer, privateOther, tokenA, secretHash(tokenA)]) assert.ok(!serialized.includes(excluded));
  }
  assert.deepEqual(source, before, 'Neither a live nor a durable projection changes personal or shared records.');
});

test('unloaded captain export is read-only and does not start, advance, or save a realm', async t => {
  const f = await serverFixture(t), before = copy(f.persistence.snapshot);
  const result = await f.request({ passport: passportA, captainId: B, userId: B });
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.data.export.scope.source, 'durable-snapshot'); assert.equal(result.data.export.scope.durableVersion, 7);
  assert.equal(result.data.export.captain.id, A, 'An unrelated top-level target ID cannot change the subject.');
  assert.equal(f.server.manager.realms.size, 0); assert.equal(f.persistence.writes, 0); assert.deepEqual(f.persistence.snapshot, before);
  const config = await (await fetch(f.server.url + '/api/config')).json(); assert.equal(config.privacyExportVersion, 1);
});

test('credential aliases are suppressed server-side while gameplay activity tokens remain available', () => {
  const source = snapshot(), captain = source.captains[A];
  const aliases = ['accessToken', 'refresh_token', 'token_hash', 'passwordHash', 'encrypted_password', 'service_role_key', 'serviceKey', 'keyHash', 'privateKey', 'cookies', 'sessionCookie', 'recoveryCode'];
  captain.recentCommands[0].result.credentials = { nested: 'must-not-export' };
  for (const field of aliases) captain.recentCommands[0].result[field] = 'credential-alias-canary';
  captain.game.activityTokens = ['entered:hearth:morrow:lab'];
  const output = createPrivacyExport(source, captain);
  assert.ok(!JSON.stringify(output).includes('credential-alias-canary'));
  assert.ok(!JSON.stringify(output).includes('must-not-export'));
  assert.deepEqual(output.captain.game.activityTokens, ['entered:hearth:morrow:lab']);
});

test('export removes known passport values accidentally retained in IDs, text or object keys', async t => {
  const stored = snapshot(), captain = stored.captains[A];
  captain.recentCommands[0].id = tokenA;
  captain.game.journal.push({ text: `Accidental credential: ${tokenA} / ${captain.tokenHash}.` });
  captain.game.stats[`accidental_${tokenA}`] = 'must-not-export';
  const before = copy(stored), f = await serverFixture(t, memoryPersistence(stored));
  const response = await f.request({ passport: passportA });
  assert.equal(response.status, 200);
  const report = response.data.export, serialized = JSON.stringify(report);
  for (const forbidden of [tokenA, captain.tokenHash, 'must-not-export']) assert.ok(!serialized.includes(forbidden));
  assert.equal(report.captain.recentCommands[0].id, '[credential omitted]');
  assert.equal(report.captain.game.journal[1].text, 'Accidental credential: [credential omitted] / [credential omitted].');
  assert.deepEqual(f.persistence.snapshot, before); assert.equal(f.persistence.writes, 0);
});

test('missing, unknown and cross-captain credentials receive identical 401 errors', async t => {
  const f = await serverFixture(t);
  const missing = await f.request({}); assert.equal(missing.status, 401); assert.equal(f.persistence.reads, 0, 'Malformed passports do not trigger a snapshot read.');
  const unknown = await f.request({ passport: { ...passportA, realmCode: 'UNKNOWN1' } });
  const forged = await f.request({ passport: { ...passportA, captainId: B } });
  assert.equal(unknown.status, 401); assert.equal(forged.status, 401);
  assert.deepEqual(unknown.data, missing.data); assert.deepEqual(forged.data, missing.data);
  assert.equal(f.persistence.writes, 0); assert.equal(f.server.manager.realms.size, 0);
});

test('live captain export works at full capacity without replacing sessions or mutating state', async t => {
  const stored = snapshot();
  // Use valid game state for the running authority, rather than the deliberate
  // privacy canaries/partial shared-world objects used by the projection test.
  for (const captain of Object.values(stored.captains)) captain.game = copy(new Game('live-privacy-synthetic').state);
  stored.galaxyEpoch = GALAXY_EPOCH;
  stored.vessels = {}; stored.worlds = {}; stored.sites = {}; delete stored.director;
  for (let n = 2; n < 10; n++) { const id = 'captain_' + n.toString(16).padStart(24, '0'); stored.captains[id] = { ...copy(stored.captains[B]), id, ownedVesselId: `vessel_${id}`, aboard: `vessel_${id}` }; }
  const f = await serverFixture(t, memoryPersistence(stored));
  const realm = new Realm({ id: realmCode, persistence: f.persistence, snapshot: stored, version: 7 });
  realm.step = () => {}; // Isolate export mutations from ordinary simulation ticks.
  for (const captain of realm.captains.values()) captain.session = { send() {}, close() {}, ws: { bufferedAmount: 0 } };
  const captain = realm.captains.get(A), originalSession = captain.session;
  captain.events = [{ type: 'synthetic-event', text: 'Do not drain me.' }]; captain.game.state.credits = 321;
  f.server.manager.realms.set(realmCode, realm);
  const stateBefore = JSON.stringify({ state: captain.game.state, lastSeen: captain.lastSeen, events: captain.events, worlds: realm.worlds, sites: realm.sites, director: realm.director, revision: realm.revision });
  const result = await f.request({ passport: passportA });
  assert.equal(result.status, 200); assert.equal(result.data.export.scope.source, 'live-authority'); assert.equal(result.data.export.captain.game.credits, 321);
  assert.equal(realm.onlineCount, 10); assert.equal(captain.session, originalSession); assert.equal(f.persistence.reads, 0); assert.equal(f.persistence.writes, 0);
  assert.equal(JSON.stringify({ state: captain.game.state, lastSeen: captain.lastSeen, events: captain.events, worlds: realm.worlds, sites: realm.sites, director: realm.director, revision: realm.revision }), stateBefore);
});

test('unavailable storage fails explicitly without manufacturing an empty successful export', async t => {
  const f = await serverFixture(t); f.persistence.fail = true;
  const response = await f.request({ passport: passportA });
  assert.equal(response.status, 503); assert.equal(response.data.ok, false); assert.ok(!('export' in response.data));
  assert.ok(!JSON.stringify(response.data).includes(tokenA)); assert.equal(f.persistence.writes, 0);
});

test('export enforces origin, POST, request size and a modest request budget', async t => {
  const f = await serverFixture(t);
  const foreign = await f.request({ passport: passportA }, { headers: { origin: 'https://unrelated.example' } }); assert.equal(foreign.status, 403);
  const method = await fetch(f.server.url + '/api/privacy/export'); assert.equal(method.status, 405); assert.equal(method.headers.get('cache-control'), 'no-store');
  const oversized = await f.request({ passport: passportA, padding: 'x'.repeat(5000) }); assert.equal(oversized.status, 413);
  assert.equal((await f.request({})).status, 401); assert.equal((await f.request({})).status, 401);
  assert.equal((await f.request({})).status, 429); assert.equal(f.persistence.reads, 0);
});

test('rate counters expire after inactivity and stay bounded without changing normal realm limits', () => {
  let time = 0; const limits = new RequestRateLimits({ now: () => time, maxEntries: 2 });
  for (let n = 0; n < 40; n++) assert.equal(limits.take('address-a'), true);
  assert.equal(limits.take('address-a'), false);
  for (let n = 0; n < 3; n++) assert.equal(limits.take('address-a', 'privacy'), true);
  assert.equal(limits.take('address-a', 'privacy'), false);
  time = 10000; assert.equal(limits.take('address-a', 'privacy'), true);
  limits.take('address-b'); limits.take('address-c'); assert.equal(limits.entries.size, 2); assert.ok(!limits.entries.has('address-a'));
  time += REQUEST_RATE_IDLE_MS; limits.prune(); assert.equal(limits.entries.size, 0);
  assert.equal(limits.take('address-b', 'privacy'), true);
});
