import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { normalizeConversations } from '../dist/npc-dialogue.mjs';
import { conversationTopics } from '../dist/conversation-topics.mjs';
import { createAmbientMemory, sampleAmbientConversation } from '../dist/ambient-social.mjs';

const atPort = () => { const game = new Game('dialogue-depth', { openingMission: true }); game.state.openingMission = null; return game; };
const speaker = (game, id) => {
  const entity = generateSurface(game.currentBody, game.state.seed).entities.find(value => value.id === id);
  assert.ok(entity, id); return entity;
};

test('a heard mission becomes a short greeting while its full explanation stays available', () => {
  const game = atPort(), len = speaker(game, 'quest:len-vale');
  game.state.narrative.quests.last_fare = { status: 'active', stage: 3, choices: {}, startedAt: 1 };
  const before = JSON.stringify(game.state.narrative);
  const first = game.conversation(len, { time: 20 });
  assert.equal(first.context, 'mission'); assert.match(first.greeting, /destination request/);
  assert.equal(first.updateText, undefined);
  const again = game.conversation(len, { time: 21 });
  assert.equal(again.context, 'mission'); assert.equal(again.repeatedUpdate, true);
  assert.notEqual(again.greeting, first.greeting);
  assert.ok(again.updateText.includes(first.greeting));
  assert.ok(again.updateText.includes(first.rumor));
  assert.equal(again.updateLabel, 'Review the current job');
  assert.equal(game.state.conversations.people[0].count, 1);
  assert.equal(JSON.stringify(game.state.narrative), before, 'talking does not advance, reward or accept a story');

  game.state.narrative.quests.last_fare.stage = 0;
  const changed = game.conversation(len, { time: 22 });
  assert.equal(changed.repeatedUpdate, undefined, 'a real update during the same visit must be heard in full');
  assert.match(changed.greeting, /One seat for Nessa/);
});

test('completed decisions are remembered across reload without reciting them on every visit', () => {
  const game = atPort(), len = speaker(game, 'quest:len-vale');
  game.state.narrative.quests.last_fare = { status: 'completed', stage: 4, choices: { privacy: 'protect' } };
  game.state.flags.push('thread:nessa_protected');
  game.state.narrative.relations['len-vale'] = { trust: 4, memories: [{ text: 'You kept Nessa’s name out of the inspection file.', at: 1 }] };
  const first = game.conversation(len, { time: 30 });
  assert.match(first.greeting, /destination stays out/);
  const restored = Game.fromSave(game.serialize());
  const again = restored.conversation(len, { time: 100 });
  assert.equal(again.context, 'consequence');
  assert.equal(again.repeatedUpdate, true);
  assert.notEqual(again.greeting, first.greeting);
  assert.equal(again.updateText, first.greeting);
  assert.equal(again.relationship, 'Warm');
});

test('practical advice changes across real visits, while previews do not write history', () => {
  const game = atPort(), worker = speaker(game, 'kettle:dockworker');
  let last;
  for (const at of [10, 41, 72, 103, 134]) {
    const words = game.conversation(worker, { time: at });
    assert.notEqual(words.rumor, last);
    assert.ok(words.topics.some(topic => /credits|cargo|Kettle/.test(topic.text)));
    last = words.rumor;
  }
  const before = JSON.stringify(game.state);
  const preview = game.conversation(worker, { time: 200, record: false });
  assert.equal(JSON.stringify(game.state), before);
  assert.ok(preview.topics.length > 0 && preview.topics.length <= 3);
  preview.topics[0].text = 'Changed by a caller';
  assert.notEqual(game.conversation(worker, { time: 200, record: false }).topics[0].text, 'Changed by a caller');
});

test('role topics explain current mechanics and do not invent completed work', () => {
  const game = atPort(), mechanic = speaker(game, 'kettle:mechanic'), medic = speaker(game, 'kettle:medic');
  const fitting = game.conversation(mechanic, { record: false });
  const care = game.conversation(medic, { record: false });
  assert.ok(fitting.topics.some(topic => topic.id === 'fitting' && /requirements/.test(topic.text)));
  assert.ok(care.topics.some(topic => topic.id === 'care' && /health.*hull/.test(topic.text)));
  assert.notDeepEqual(fitting.topics, care.topics);
  assert.doesNotMatch(fitting.greeting + fitting.rumor, /you repaired|you completed|you rescued/i);
  game.state.person.health = 15;
  assert.deepEqual(game.conversation(medic, { record: false }).topics, [], 'urgent injury is not buried under optional advice');
});

test('two mechanics keep distinct personal voices alongside a direct help topic', () => {
  const game = atPort(), iona = speaker(game, 'kettle:mechanic');
  const mara = { id: 'quest:mara-reed', role: 'mechanic', data: { contactId: 'mara-reed', homeLocationId: 'morrow', systemId: 'hearth' } };
  const ionaTopics = conversationTopics(game, iona, 'mechanic'), maraTopics = conversationTopics(game, mara, 'mechanic');
  assert.match(ionaTopics[0].text, /wrench/);
  assert.match(maraTopics[0].text, /table.*parts|parts.*water/);
  assert.notEqual(ionaTopics[0].text, maraTopics[0].text);
  assert.equal(ionaTopics[1].id, 'fitting');
  assert.equal(maraTopics[1].id, 'field-tools');
  assert.ok(ionaTopics.length <= 3 && maraTopics.length <= 3);
  assert.doesNotMatch(maraTopics.map(value => value.text).join(' '), /Nessa|medicine case|export guarantee|water_cooperative/i, 'unstarted personal stories are not spoiled');
  const len = conversationTopics(game, speaker(game, 'quest:len-vale'), 'contact');
  const silas = conversationTopics(game, speaker(game, 'quest:silas-voss'), 'contact');
  assert.notEqual(len[0].text, silas[0].text, 'named contacts are not collapsed into the same fallback role');
  assert.match(len[0].text, /announcements|kettle/); assert.match(silas[0].text, /cup/);
});

test('quiet cultures and stale location data do not become generic spaceport directions', () => {
  const game = atPort(), entity = { id: 'river:weaver', name: 'Weaver', role: 'settler', data: { culture: 'reedbound', techLevel: 'preflight', cultureRole: 'weaver' } };
  const words = game.conversation(entity, { record: false });
  assert.equal(words.context, 'culture');
  assert.ok(words.topics.length);
  assert.doesNotMatch(words.topics.map(value => value.text).join(' '), /shipyard|credits|port|fold drive/i);

  const stale = { id: 'glimmer:pilot', role: 'pilot', data: { homeLocationId: 'glimmer', systemId: 'voltage' } };
  assert.ok(!conversationTopics(game, stale, 'pilot').some(topic => topic.id === 'place-glimmer'));
  game._directorShared = { time: 10, events: [{ type: 'raid', status: 'active', systemId: 'voltage', bodyId: 'glimmer' }], conditions: {} };
  assert.notEqual(game.conversation(stale, { record: false }).newsContext, 'local-event', 'a retained entity from elsewhere cannot announce remote trouble as local news');
});

test('new memory fields are bounded and legacy or malformed records stay compatible', () => {
  assert.deepEqual(normalizeConversations({ version: 1, people: [{ id: 'old', count: 1, lastAt: 3, context: 'routine' }] }), { version: 1, people: [{ id: 'old', count: 1, lastAt: 3, context: 'routine' }] });
  const normalized = normalizeConversations({ people: [{ id: 'x', count: 1, updateKey: '<script>', rumorKey: 'r'.repeat(81) }, { id: 'y', count: 2, updateKey: 'mission:123', rumorKey: 'rumor:456' }] });
  assert.equal(normalized.people[0].updateKey, undefined);
  assert.equal(normalized.people[0].rumorKey, undefined);
  assert.equal(normalized.people[1].updateKey, 'mission:123');
  assert.equal(normalized.people[1].rumorKey, 'rumor:456');
});

test('ambient chatter gives speakers a break and avoids replaying the same exchange', () => {
  const surface = { id: 'quiet-court', seed: 42, kind: 'site', systemId: 'remote', socialStyle: 'park', entities: [
    { id: 'one', type: 'npc', name: 'One', x: 100, y: 100, life: { activity: 'resting' } },
    { id: 'two', type: 'npc', name: 'Two', x: 140, y: 100, life: { activity: 'working' } }
  ] }, person = { x: 110, y: 120 };
  let memory = createAmbientMemory(surface, 0), count = 0;
  const lines = new Map(), speakers = new Map();
  for (let seconds = 0; seconds < 20000; seconds++) {
    const before = JSON.stringify(memory);
    const cue = sampleAmbientConversation(surface, seconds, person, { memory });
    assert.equal(JSON.stringify(memory), before, 'sampling is pure');
    if (!cue) continue;
    count++;
    const key = cue.lines.map(line => line.text).join('|');
    if (lines.has(key)) assert.ok(seconds - lines.get(key) >= 1800);
    lines.set(key, seconds);
    for (const line of cue.lines) {
      if (speakers.has(line.speakerId)) assert.ok(seconds - speakers.get(line.speakerId) >= 720);
      speakers.set(line.speakerId, seconds);
    }
    memory = cue.nextMemory;
    assert.ok(memory.heard.length <= 12 && memory.speakers.length <= 12);
  }
  assert.ok(count >= 3 && count < 25);
});
