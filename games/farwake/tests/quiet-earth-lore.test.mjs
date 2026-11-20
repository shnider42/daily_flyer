import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { storyStatus } from '../dist/expedition-story-rules.mjs';
import { QUIET_EARTH_FRAGMENT_RECORDS, QUIET_EARTH_LORE } from '../dist/quiet-earth-lore.mjs';

const loreIds = new Set(QUIET_EARTH_LORE.map(entry => entry.id));
const ownedFragments = game => game.state.knownLore.filter(id => loreIds.has(id));
const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };

function fixture(seed = 'quiet-earth-personal-evidence') {
  const game = new Game(seed, { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(item => item.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(game.dock(body.id));
  const entrance = generateSurface(body, seed, game.state.flags).entities.find(item => item.data?.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entrance.x, y: entrance.y });
  ok(game.enterSite('relay-nine'));
  return game;
}

function entity(game, type, id) {
  const found = game._expeditionSurface().entities.find(item => item.type === type &&
    (item.data?.recordId === id || item.data?.choiceId === id));
  assert.ok(found, `Expected physical ${type}: ${id}`);
  return found;
}

function interact(game, type, id, action = 'inspect', option) {
  const target = entity(game, type, id);
  Object.assign(game.state.person, { x: target.x, y: target.y });
  return game.siteAction(target.id, action, option);
}

test('optional Earth fragments need a physical read and stay in that captain’s archive after reload', () => {
  let game = fixture();
  assert.deepEqual(ownedFragments(game), [], 'Entering a corridor does not reveal its optional evidence.');
  const first = QUIET_EARTH_FRAGMENT_RECORDS[0];
  const target = entity(game, 'siteRecord', first.id);
  assert.equal(game.siteAction(target.id, 'inspect').ok, false, 'A distant optional record is not a free archive grant.');
  assert.deepEqual(ownedFragments(game), []);
  for (const fragment of QUIET_EARTH_FRAGMENT_RECORDS) {
    const response = ok(interact(game, 'siteRecord', fragment.id));
    assert.equal(response.loreId, fragment.loreId);
    assert.equal(response.text, fragment.text);
  }
  const before = game.state.credits;
  game = Game.fromSave(game.serialize());
  assert.deepEqual(new Set(ownedFragments(game)), loreIds);
  ok(interact(game, 'siteRecord', first.id));
  assert.equal(ownedFragments(game).length, QUIET_EARTH_FRAGMENT_RECORDS.length);
  assert.equal(game.state.credits, before, 'Rereading evidence never issues a payment.');
});

test('captains can finish and escape Relay Nine without collecting optional Earth fragments', () => {
  const game = fixture('quiet-earth-optional-not-a-gate');
  ok(interact(game, 'siteChoice', 'check-in', 'choose', 'begin'));
  ok(interact(game, 'siteRecord', 'voices'));
  ok(interact(game, 'siteChoice', 'breaker', 'choose', 'restore'));
  ok(interact(game, 'siteRecord', 'service'));
  ok(interact(game, 'siteChoice', 'receiver', 'choose', 'copy'));
  ok(interact(game, 'siteChoice', 'evacuate', 'choose', 'seal'));
  const status = storyStatus(game.state.exploration.encounter, game._expeditionSurface().site);
  assert.equal(status.completed, true);
  assert.deepEqual(ownedFragments(game), []);
});

test('late-game survey scans cannot award physically sourced corridor evidence', () => {
  const game = new Game('quiet-earth-survey-source', { startMode: 'casual', startSystemId: 'hearth' });
  game._flag('vault_recovered');
  // Isolate the existing survey-packet branch, without unrelated authored encounters.
  game.triggerEncounter = () => ({ ok: false });
  for (let i = 0; i < 48; i++) {
    const signal = { id: `quiet-earth-survey-${i}`, kind: 'survey', name: 'Ordinary survey packet',
      x: game.state.ship.x, y: game.state.ship.y, scanned: false, resolved: false };
    game.system.signals.push(signal);
    game.state.ship.energy = game.state.ship.maxEnergy;
    ok(game._scanActiveShip(signal.id));
  }
  assert.ok(game.state.knownLore.length, 'The ordinary survey archive path was exercised.');
  assert.deepEqual(ownedFragments(game), [], 'Deep evidence must not leak through unrelated scan rewards.');
});
