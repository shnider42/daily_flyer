import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { PEOPLE_ENCOUNTERS } from '../dist/people-event-content.mjs';
import { peopleEventAvailable, peopleEventFor, peopleEventSource, recordPeopleEvent } from '../dist/people-event-rules.mjs';
import { conversationTopics } from '../dist/conversation-topics.mjs';
import { NAMED_SYSTEMS, STORY_CHAPTERS } from '../dist/content.mjs';
import { systemIdentity } from '../dist/system-identity.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
function fixture(group = 'kettle', seed = 'ordinary-people') {
  const definition = PEOPLE_ENCOUNTERS.find(event => event.peopleEvent.group === group), game = new Game(seed, { openingMission: false });
  const { systemId, locationId } = definition.conditions;
  game._persistRuntime(); game.state.systemId = systemId; game._loadSystem(systemId); game.system.enemies = [];
  const body = game.system.bodies.find(value => value.id === locationId);
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 40, vx: 0, vy: 0 }); ok(game.dock(body.id));
  const surface = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  const speaker = surface.entities.find(entity => entity.id === `quest:${definition.peopleEvent.participants[0]}`);
  assert.ok(speaker, group); Object.assign(game.state.person, { x: speaker.x, y: speaker.y });
  game.state.credits = 100; game.drainEvents();
  return { game, speaker, surface, event: PEOPLE_ENCOUNTERS.find(value => peopleEventAvailable(game, value, { entityId: speaker.id })) };
}

test('each port has one stable seeded scene, shared by matching galaxies and preserved by reload', () => {
  for (const group of ['kettle', 'morrow', 'weighhouse', 'ledger', 'bastion', 'listening', 'glimmer']) {
    const first = fixture(group), second = fixture(group);
    assert.ok(first.event, group); assert.equal(first.event.id, second.event.id);
    assert.equal(first.game.availableEncounters('person').filter(event => event.peopleEvent).length, 1);
    const reloaded = Game.fromSave(first.game.serialize()); reloaded.state.stats.time += 100000;
    assert.equal(peopleEventFor(reloaded, first.speaker)?.id, first.event.id, 'Age, reentry and loading never select a different scene.');
  }
  const ids = new Set(Array.from({ length: 8 }, (_, index) => fixture('kettle', `people-seed-${index}`).event.id));
  assert.equal(ids.size, 2, 'Different galaxy seeds select different authored local situations.');
});

test('optional scene reads stay quiet and cannot be opened through an unrelated or remote speaker', () => {
  const { game, event, speaker, surface } = fixture();
  const before = structuredClone(game.state);
  for (let i = 0; i < 12; i++) {
    assert.equal(peopleEventFor(game, speaker)?.id, event.id);
    game.conversation(speaker, { record: false });
  }
  assert.deepEqual(game.state, before); assert.deepEqual(game.drainEvents(), []);
  assert.equal(peopleEventSource(game, event, 'kettle:mechanic'), null);
  const other = surface.entities.find(entity => entity.type === 'npc' && !event.peopleEvent.participants.includes(entity.data?.contactId));
  assert.equal(peopleEventFor(game, other), null);
  game.state.person.x += 500; assert.equal(peopleEventFor(game, speaker), null);
  Object.assign(game.state.person, { x: speaker.x, y: speaker.y, health: 0 }); assert.equal(peopleEventFor(game, speaker), null);
  game.state.person.health = 100; game.state.interior = { kind: 'ship' }; assert.equal(peopleEventFor(game, speaker), null);
});

test('an active opening keeps its local contacts free of additional scenes', () => {
  const { game, event, speaker } = fixture();
  game.state.openingMission = { status: 'active', stage: 'offer' };
  assert.equal(peopleEventAvailable(game, event), false); assert.equal(peopleEventFor(game, speaker), null);
});

test('a real encounter choice pays once, changes the existing personal relationships and preserves campaign evidence', () => {
  const { game, event, speaker } = fixture(), peer = fixture().game;
  const flags = [...game.state.flags], lore = [...game.state.knownLore], quests = structuredClone(game.state.narrative.quests), credits = game.state.credits;
  const choice = event.choices.find(value => value.effects.credits < 0);
  assert.ok(choice); ok(game.triggerEncounter(event.id, { entityId: speaker.id }));
  assert.equal(game.state.pendingEncounter.entityId, speaker.id);
  ok(game.applyChoice(event.id, choice.id));
  assert.equal(game.state.credits, credits + choice.effects.credits);
  for (const [id, trust] of Object.entries(choice.peopleTrust)) assert.equal(game.state.narrative.relations[id].trust, trust);
  assert.ok(game.state.journal.some(entry => entry.title === event.title));
  assert.deepEqual(game.state.knownLore, lore); assert.deepEqual(game.state.narrative.quests, quests);
  assert.deepEqual(game.state.flags.filter(flag => flag !== 'made_choice' && !flag.startsWith('people:')), flags);
  const settled = structuredClone({ credits: game.state.credits, relations: game.state.narrative.relations, history: game.state.encounterHistory });
  assert.equal(game.applyChoice(event.id, choice.id).ok, false); assert.equal(recordPeopleEvent(game, event, choice), false);
  assert.deepEqual({ credits: game.state.credits, relations: game.state.narrative.relations, history: game.state.encounterHistory }, settled);
  const saved = Game.fromSave(game.serialize());
  assert.deepEqual(saved.state.narrative.relations, settled.relations); assert.equal(peopleEventFor(saved, speaker), null);
  assert.ok(saved.conversation(speaker, { record: false }).greeting.length);
  assert.deepEqual(peer.state.narrative.relations, {}); assert.ok(peopleEventFor(peer, speaker), 'Another captain keeps their own choice.');
});

test('source and cost are rechecked before a local choice; walking away cannot resolve it remotely', () => {
  const { game, event, speaker } = fixture('morrow');
  ok(game.triggerEncounter(event.id, { entityId: speaker.id }));
  const paid = event.choices.find(choice => choice.effects.credits < 0), free = event.choices.find(choice => !choice.effects.credits);
  game.state.credits = 0; assert.equal(game.choiceAvailable(event.id, paid.id), false);
  assert.equal(game.applyChoice(event.id, paid.id).ok, false); assert.equal(game.state.pendingEncounter.id, event.id);
  game.state.person.x += 500; assert.equal(game.choiceAvailable(event.id, free.id), false);
  assert.equal(game.applyChoice(event.id, free.id).ok, false); assert.deepEqual(game.state.narrative.relations, {});
  Object.assign(game.state.person, { x: speaker.x, y: speaker.y });
  ok(game.applyChoice(event.id, free.id)); assert.ok(game.state.encounterHistory.includes(event.id));
});

test('local scenes include independent lives and cannot issue Sol clearance, rescue receipts or late findings', () => {
  const earthScenes = PEOPLE_ENCOUNTERS.filter(event => /\b(?:Sol|Earth|cordon)\b/.test(event.text));
  assert.equal(earthScenes.length, 1);
  for (const event of PEOPLE_ENCOUNTERS) for (const choice of event.choices) {
    assert.equal(choice.effects.lore, undefined); assert.equal(choice.effects.crew, undefined);
    assert.ok(choice.effects.flags.every(flag => flag.startsWith('people:')));
  }
  const sol = NAMED_SYSTEMS.find(system => system.id === 'sol');
  assert.match(sol.description, /reachable/); assert.match(sol.description, /detained or fired/);
  assert.match(systemIdentity('sol').description, /attempt Sol/);
  assert.match(STORY_CHAPTERS.find(chapter => chapter.id === 'threshold').brief, /screened route through the defenses/);
  const game = new Game('inspection-words'); game.state.systemId = 'sol'; game._loadSystem('sol');
  game.state.mode = 'person'; game.state.locationId = 'threshold';
  const source = generateSurface(game.currentBody, game.state.seed, game.state.flags).entities.find(entity => entity.id === 'quest:earth-sol');
  const inspection = conversationTopics(game, source, 'warden').find(topic => topic.id === 'sol-inspection');
  assert.match(inspection.text, /same hull/); assert.match(inspection.text, /no Earth clearance/);
  assert.doesNotMatch(JSON.stringify([PEOPLE_ENCOUNTERS, sol, inspection]), /Breakwater filters|Reservoir intelligence|earth-origin-breakwater|earth-limits-of-repair/i);
});
