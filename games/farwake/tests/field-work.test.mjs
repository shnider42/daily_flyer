import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { fieldObjectPosition, normalizeFieldState } from '../dist/floodworks.mjs';
import { stepSiteEncounter } from '../dist/exploration.mjs';
import { FIELD_ASSIGNMENTS, FieldWorkRules } from '../dist/field-work.mjs';

Object.assign(Game.prototype, FieldWorkRules);
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const places = { 'floodworks-6': ['brindle', 'orchard'], 'condenser-annex': ['meridian', 'serein'], 'archive-annex': ['vesper', 'lilt'] };
function enter(game, siteId = 'floodworks-6') {
  const [systemId, bodyId] = places[siteId];
  game.state.exploration = null; game.state.interior = null; game.state.systemId = systemId; game._runtime = null; game._loadSystem(systemId);
  const body = game.system.bodies.find(value => value.id === bodyId); game._arriveAsPassenger(body, { discovery: false });
  const entrance = generateSurface(body, game.state.seed, game.state.flags).entities.find(value => value.data?.siteId === siteId);
  assert.ok(entrance, siteId); Object.assign(game.state.person, entrance, { health: 100, down: false }); ok(game.enterSite(siteId)); return game;
}
function make(seed = 'field-career') { const game = new Game(seed, { startMode: 'casual', startSystemId: 'brindle' }); game.initializeFieldWork(); return enter(game); }
function approach(game, objectId) {
  const site = game.state.interior.location.site, point = fieldObjectPosition(game.state.exploration.encounter, site, objectId), surface = game._expeditionSurface();
  assert.ok(point, objectId);
  const candidates = [{ x: point.x, y: point.y }, ...[20, 25, 34, 42].flatMap(radius => [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ x: point.x + Math.cos(n * Math.PI / 4) * radius, y: point.y + Math.sin(n * Math.PI / 4) * radius })))];
  const candidate = candidates.find(value => isWalkable(surface, value.x, value.y, 6)); assert.ok(candidate, `No approach to ${objectId}`);
  Object.assign(game.state.person, candidate); return point;
}
function act(game, objectId, action, extra = {}) { approach(game, objectId); return game.fieldWorkAction({ action, objectId, ...extra }); }
function desk(game, careerId, action, assignmentId) { approach(game, careerId === 'engineering' ? 'workshop-cutter' : 'entry-aid'); return game.fieldWorkAction({ action, assignmentId }); }
function safeAccess(game) {
  ok(act(game, 'service-panel', 'inspect')); ok(act(game, 'workshop-cutter', 'claim')); ok(act(game, 'service-panel', 'cut')); ok(act(game, 'pump-terminal', 'inspect'));
}
function restorePump(game) { ok(act(game, 'workshop-bridge', 'claim')); ok(act(game, 'pump-terminal', 'bridge')); }
function markSafeByEarlierCrew(game, id) {
  const encounter = game.state.exploration.encounter, site = game.state.interior.location.site;
  encounter.field.survivors[id].status = 'safe'; encounter.field.survivors[id].escorts = ['earlier-captain']; encounter.field = normalizeFieldState(site, encounter.field); game._expeditionMap = null;
}
function followup(game, id) { ok(act(game, `casualty-${id}`, 'inspect')); ok(act(game, `casualty-${id}`, 'stabilize')); ok(act(game, 'entry-aid', 'handover')); }

test('the notebook is a pure view and lists six staged assignments outside Hearth', () => {
  const game = new Game('field-read-only'); const before = JSON.stringify(game.state);
  const view = game.fieldWorkStatus(); assert.equal(JSON.stringify(game.state), before);
  assert.equal(view.inFieldSite, false); assert.equal(view.assignments.length, 6); assert.deepEqual(view.careers.map(value => value.total), [3, 3]);
  assert.equal(view.tools.some(tool => tool.owned), false); assert.equal(view.target.systemId, 'brindle');
  assert.ok(FIELD_ASSIGNMENTS.every(value => value.steps.length >= 3));
  assert.equal(game.fieldWorkAction({ action: 'claim', objectId: 'workshop-cutter', tools: { cutter: true } }).code, 'location');
  assert.equal(JSON.stringify(game.state), before);
});

test('physical work rejects forged gear, remote objects, incapacitation and premature payment without mutations', () => {
  const game = make(), before = JSON.stringify(game.state.fieldWork);
  assert.equal(act(game, 'service-panel', 'cut', { tools: ['field_cutter'], actorId: 'someone-else', reward: 999999 }).ok, false);
  assert.equal(JSON.stringify(game.state.fieldWork), before); assert.equal(game.state.exploration.encounter.field.serviceCut, false);
  approach(game, 'workshop-cutter'); const at = { ...game.state.person }; game.state.person.x += 200;
  assert.equal(game.fieldWorkAction({ action: 'claim', objectId: 'workshop-cutter' }).code, 'distance');
  Object.assign(game.state.person, at, { down: true }); assert.equal(game.fieldWorkAction({ action: 'claim', objectId: 'workshop-cutter' }).code, 'incapacitated'); game.state.person.down = false;
  for (const health of [NaN, Infinity, 0]) { game.state.person.health = health; assert.equal(game.fieldWorkAction({ action: 'begin', assignmentId: 'engineering-safe-access' }).code, 'incapacitated'); }
  game.state.person.health = at.health;
  ok(desk(game, 'engineering', 'begin', 'engineering-safe-access')); const credits = game.state.credits;
  assert.equal(desk(game, 'engineering', 'settle', 'engineering-safe-access').code, 'evidence'); assert.equal(game.state.credits, credits);
  assert.equal(desk(game, 'engineering', 'begin', 'engineering-condenser').ok, false);
  assert.equal(game.fieldWorkAction({ action: 'award', objectId: 'workshop-cutter', paid: 999999 }).code, 'action');
});

test('earlier physical work counts, qualification pay is once only, and tools and receipts survive a save', () => {
  const game = make('field-save'); safeAccess(game); const credits = game.state.credits;
  ok(desk(game, 'engineering', 'begin', 'engineering-safe-access'));
  assert.equal(game.fieldWorkStatus().active.status, 'debrief'); assert.ok(game.fieldWorkStatus().active.steps.every(value => value.done));
  assert.equal(ok(desk(game, 'engineering', 'settle', 'engineering-safe-access')).paid, 145);
  assert.equal(desk(game, 'engineering', 'settle', 'engineering-safe-access').code, 'completed'); assert.equal(game.state.credits, credits + 145);
  const restored = new Game(game.serialize()); assert.equal(restored.fieldWorkStatus().tools.find(value => value.key === 'cutter').owned, true);
  assert.equal(restored.fieldWorkStatus().careers[0].rank, 'Field technician'); assert.ok(restored.state.fieldWork.contributions['floodworks-6:service-panel:cut:cut']);
  assert.equal(desk(restored, 'engineering', 'begin', 'engineering-safe-access').code, 'completed'); assert.equal(restored.state.credits, credits + 145);
});

test('a shared open passage does not issue another captain’s tool or contribution, and the rack serves both', () => {
  const one = make('field-shared-kit'), two = make('field-shared-kit'); one.state.multiplayer = { captainId: 'one' }; two.state.multiplayer = { captainId: 'two' };
  safeAccess(one); two.state.exploration.encounter = one.state.exploration.encounter; two.state.explorationRecords[two.state.exploration.key] = one.state.exploration.encounter; two._expeditionMap = null;
  assert.equal(two.state.exploration.encounter.field.serviceCut, true); assert.equal(two.fieldWorkStatus().tools[0].owned, false); assert.deepEqual(two.state.fieldWork.contributions, {});
  ok(act(two, 'workshop-cutter', 'claim')); assert.equal(two.fieldWorkStatus().tools[0].owned, true); assert.equal(one.fieldWorkStatus().tools[0].owned, true);
  assert.equal(two.state.fieldWork.contributions['floodworks-6:service-panel:cut:cut'], undefined);
  ok(act(two, 'service-panel', 'cut')); assert.ok(two.state.fieldWork.contributions['floodworks-6:service-panel:cut:cut']);
});

test('field interactions cannot reach a nearby console through an intervening closed wall', () => {
  const game = make('field-wall'), original = game._expeditionSurface.bind(game); approach(game, 'workshop-cutter');
  const target = fieldObjectPosition(game.state.exploration.encounter, game.state.interior.location.site, 'workshop-cutter');
  Object.assign(game.state.person, { x: target.x - 42, y: target.y });
  const surface = original(), layout = { ...surface.combatLayout, walkable: [...surface.combatLayout.walkable] };
  layout.walkable[Math.floor(target.y / 24) * layout.cols + Math.floor((target.x - 24) / 24)] = 0;
  game._expeditionSurface = () => ({ ...surface, combatLayout: layout });
  assert.equal(game.fieldWorkAction({ action: 'claim', objectId: 'workshop-cutter' }).code, 'blocked'); assert.equal(game.state.fieldWork.tools.cutter, false);
});

test('both engineering revisits require their own physical records and all three commissions pay once', () => {
  const game = make('field-engineering'); safeAccess(game); ok(desk(game, 'engineering', 'begin', 'engineering-safe-access')); ok(desk(game, 'engineering', 'settle', 'engineering-safe-access')); restorePump(game);
  ok(desk(game, 'engineering', 'begin', 'engineering-condenser')); enter(game, 'condenser-annex');
  ok(act(game, 'service-panel', 'inspect')); ok(act(game, 'service-panel', 'cut')); ok(act(game, 'pump-terminal', 'bridge')); ok(act(game, 'archive-terminal', 'read'));
  assert.equal(ok(desk(game, 'engineering', 'settle', 'engineering-condenser')).paid, 225);
  enter(game); ok(desk(game, 'engineering', 'begin', 'engineering-commission')); ok(act(game, 'archive-panel', 'cut')); ok(act(game, 'archive-terminal', 'read'));
  for (const objectId of ['release-port', 'release-starboard']) {
    approach(game, objectId);
    for (let n = 0; n < 90 && game.state.exploration.encounter.field.foreman.phase !== 'recovery'; n++) stepSiteEncounter(game.state.exploration.encounter, [game.explorationParticipant()], .1, game._expeditionSurface());
    assert.equal(game.state.exploration.encounter.field.foreman.phase, 'recovery'); ok(game.fieldWorkAction({ action: 'release', objectId }));
  }
  ok(act(game, 'shortcut-lever', 'open')); assert.equal(ok(desk(game, 'engineering', 'settle', 'engineering-commission')).paid, 290);
  assert.equal(game.fieldWorkStatus().careers[0].completed, 3); assert.equal(game.fieldWorkStatus().careers[0].rank, 'Commissioning specialist');
});

test('late responders perform real aftercare and handover without claiming another crew’s evacuation', () => {
  const game = make('field-aftercare'); game.state.multiplayer = { captainId: 'late-responder' }; safeAccess(game); restorePump(game);
  markSafeByEarlierCrew(game, 'mara'); ok(desk(game, 'rescue', 'begin', 'rescue-mara'));
  ok(act(game, 'casualty-mara', 'inspect')); ok(act(game, 'casualty-mara', 'stabilize'));
  assert.equal(desk(game, 'rescue', 'settle', 'rescue-mara').code, 'evidence', 'Care alone cannot impersonate the physical receiving handover.');
  ok(act(game, 'entry-aid', 'handover')); assert.equal(ok(desk(game, 'rescue', 'settle', 'rescue-mara')).paid, 150);
  assert.ok(game.state.fieldWork.contributions['floodworks-6:casualty-mara:handover:aftercare']); assert.equal(game.state.fieldWork.contributions['floodworks-6:casualty-mara:handover:rescue'], undefined);
  markSafeByEarlierCrew(game, 'ivo'); ok(desk(game, 'rescue', 'begin', 'rescue-ivo')); ok(act(game, 'shortcut-lever', 'open')); followup(game, 'ivo');
  assert.equal(ok(desk(game, 'rescue', 'settle', 'rescue-ivo')).paid, 220);
  ok(desk(game, 'rescue', 'begin', 'rescue-archive')); enter(game, 'archive-annex'); ok(act(game, 'pump-terminal', 'inspect')); ok(act(game, 'pump-terminal', 'bridge')); markSafeByEarlierCrew(game, 'lin'); followup(game, 'lin');
  assert.equal(ok(desk(game, 'rescue', 'settle', 'rescue-archive')).paid, 275); assert.equal(game.fieldWorkStatus().careers[1].rank, 'Relief specialist');
  const before = JSON.stringify(game.state), view = game.fieldWorkStatus('entry-aid'); assert.equal(JSON.stringify(game.state), before); assert.equal(view.object.actions.find(value => value.action === 'handover').available, true);
});
