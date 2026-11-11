import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { npcClock } from '../dist/npc-life.mjs';
import { CONVERSATION_LIMIT, normalizeConversations } from '../dist/npc-dialogue.mjs';

const gameAtPort = options => new Game('lived-in-port', { openingMission: true, ...options });
const person = (game, id = 'kettle:dockworker') => {
  const entity = generateSurface(game.currentBody, game.state.seed).entities.find(value => value.id === id);
  assert.ok(entity, id); return entity;
};
const read = (game, entity, time = 0) => game.conversation(entity, { record: false, time });
const ordinary = () => { const game = gameAtPort(); game.state.openingMission = null; return game; };
const memoryFor = game => game.state.conversations.people[0];

test('local watch changes short speech and follows the same clock as the visible port', () => {
  const game = ordinary(), entity = person(game, 'kettle:mechanic');
  const morning = read(game, entity, 0), night = read(game, entity, 1000);
  assert.equal(morning.clock, npcClock(0, 'kettle').text);
  assert.equal(night.clock, npcClock(1000, 'kettle').text);
  assert.notEqual(morning.greeting, night.greeting);
  assert.match(night.greeting, /night/i);
  assert.ok(morning.greeting.length < 230 && night.greeting.length < 230);
  assert.equal(game.state.conversations.people.length, 0);
});

test('actual meal, rest and sleep activities replace generic working lines', () => {
  const game = ordinary(), entity = person(game);
  entity.life = { activity: 'sleeping', label: 'Sleeping' };
  assert.match(read(game, entity).greeting, /asleep/);
  entity.life = { activity: 'eating', label: 'Meal break' };
  assert.match(read(game, entity).greeting, /meal|mouthful/);
  assert.equal(read(game, entity).activity, 'Meal break');
  entity.life = { activity: 'resting', label: 'Off duty' };
  assert.match(read(game, entity).greeting, /quiet minute|Off my feet/);
});

test('a repeated conversation recognizes the same person without farming reputation or rewards', () => {
  const game = ordinary(), entity = person(game), before = structuredClone({ rep: game.state.rep, credits: game.state.credits, flags: game.state.flags, stats: game.state.stats });
  const first = game.conversation(entity, { time: 20 });
  assert.equal(first.known, false);
  for (let i = 0; i < 150; i++) {
    const answer = game.conversation(entity, { time: 21 });
    assert.equal(answer.known, true); assert.equal(answer.context, 'familiar');
  }
  assert.equal(memoryFor(game).count, 1);
  game.conversation(entity, { time: 51 });
  assert.equal(memoryFor(game).count, 2);
  assert.deepEqual({ rep: game.state.rep, credits: game.state.credits, flags: game.state.flags, stats: game.state.stats }, before);
});

test('familiarity survives save and reload while old saves start without fabricated history', () => {
  const game = ordinary(), entity = person(game);
  game.conversation(entity, { time: 10 });
  const loaded = Game.fromSave(game.serialize());
  assert.equal(read(loaded, entity, 500).known, true);
  assert.equal(loaded.state.conversations.people[0].id, entity.id);
  const old = game.save(); delete old.conversations;
  const legacy = Game.fromSave(old);
  assert.deepEqual(legacy.state.conversations, { version: 1, people: [] });
  assert.equal(read(legacy, entity, 500).known, false);
});

test('familiarity is bounded, normalized and remains private to each captain', () => {
  const first = ordinary(), second = ordinary(), entity = person(first);
  first.conversation(entity, { time: 100 });
  assert.equal(read(second, entity, 101).known, false);
  for (let i = 0; i < CONVERSATION_LIMIT + 30; i++) first.conversation({ ...entity, id: `port:resident-${i}` }, { time: 200 + i });
  assert.equal(first.state.conversations.people.length, CONVERSATION_LIMIT);
  assert.equal(first.state.conversations.people.at(-1).id, `port:resident-${CONVERSATION_LIMIT + 29}`);
  assert.deepEqual(normalizeConversations({ people: [null, { id: '__proto__', count: 99 }, { id: 'valid', count: 1e10, lastAt: Infinity, context: '<script>' }, { id: 'empty', count: -3 }] }), { version: 1, people: [{ id: 'valid', count: 99, lastAt: 0, context: 'script' }] });
  assert.equal(second.state.conversations.people.length, 0);
});

test('opening contact speaks to the actual saved job stage and reward outcome', () => {
  const game = gameAtPort(), tala = person(game);
  assert.match(read(game, tala).greeting, /small paid job/);
  game.state.openingMission.stage = 'repair';
  assert.match(read(game, tala).greeting, /marked relay/);
  game.state.openingMission.stage = 'ore';
  assert.match(read(game, tala).greeting, /two fresh ore/);
  game.state.openingMission.oreMined = 2;
  assert.match(read(game, tala).greeting, /own hold/);
  game.state.openingMission.status = 'completed';
  game.state.openingMission.outcome = 'relay-report';
  assert.match(read(game, tala).greeting, /report/);
  assert.doesNotMatch(read(game, tala).greeting, /ore is logged/);
  assert.equal(read(game, person(game, 'kettle:visitor-refugee')).context, 'routine');
});

test('Hardcore contact reflects paid passage without claiming the player owns a ship', () => {
  const game = gameAtPort({ startMode: 'hardcore' }), nessa = person(game, 'morrow:courier');
  game.state.openingMission.stage = 'passage';
  const answer = read(game, nessa);
  assert.match(answer.greeting, /note.*Kettle/);
  assert.match(answer.rumor, /credits.*fare/);
  assert.equal(game.ownsShip, false);
});

test('unaccepted quests do not expose future choices in ordinary conversation', () => {
  const game = ordinary(), len = person(game, 'quest:len-vale');
  const answer = read(game, len);
  assert.equal(answer.context, 'routine');
  assert.doesNotMatch(answer.greeting, /Nessa|inspection|license|destination request/);
  assert.equal(Object.keys(game.state.narrative.quests).length, 0);
});

test('an active conversation step outranks time and reputation, without advancing the mission', () => {
  const game = ordinary(), len = person(game, 'quest:len-vale');
  game.state.narrative.quests.last_fare = { status: 'active', stage: 3, choices: {}, startedAt: 20 };
  game.state.narrative.relations['len-vale'] = { trust: -10, memories: [] };
  const before = JSON.stringify(game.state.narrative);
  const answer = read(game, len, 1000);
  assert.equal(answer.context, 'mission');
  assert.match(answer.greeting, /destination request/);
  assert.equal(answer.relationship, 'Estranged');
  assert.equal(JSON.stringify(game.state.narrative), before);
});

test('past choices give specific reactions from the people affected', () => {
  const game = ordinary(), len = person(game, 'quest:len-vale');
  game.state.narrative.quests.last_fare = { status: 'completed', stage: 4, choices: { privacy: 'protect' } };
  game.state.flags.push('thread:nessa_protected');
  game.state.narrative.relations['len-vale'] = { trust: 4, memories: [{ text: 'You kept Nessa’s name out of the inspection file.', at: 200 }] };
  const answer = read(game, len, 220);
  assert.equal(answer.context, 'consequence');
  assert.equal(answer.relationship, 'Warm');
  assert.match(answer.greeting, /destination stays out/);
  const stranger = person(game, 'kettle:visitor-engineer');
  assert.doesNotMatch(read(game, stranger, 220).greeting, /Nessa|destination stays out/);
});

test('the latest intertwined memory takes precedence over an older matching flag', () => {
  const game = ordinary(), silas = person(game, 'quest:silas-voss');
  game.state.flags.push('thread:medicine_sold', 'thread:rusk_debts_erased');
  const latest = 'You erased the inherited debts in Rusk’s household book.';
  game.state.narrative.relations['silas-voss'] = { trust: 2, memories: [{ text: 'You honored Silas’s medicine contract.', at: 1 }, { text: latest, at: 2 }] };
  const answer = read(game, silas, 100);
  assert.equal(answer.greeting, latest);
  assert.doesNotMatch(answer.greeting, /kept the terms/);
});

test('relationship and faction standing change responses without disabling access', () => {
  const game = ordinary(), len = person(game, 'quest:len-vale');
  game.state.narrative.relations['len-vale'] = { trust: 10, memories: [] };
  const trusted = read(game, len);
  game.state.narrative.relations['len-vale'].trust = -8;
  const wary = read(game, len);
  assert.equal(trusted.relationship, 'Trusted');
  assert.equal(wary.relationship, 'Estranged');
  assert.notEqual(trusted.greeting, wary.greeting);
  assert.equal(wary.context, 'relationship');
  const medic = person(game, 'kettle:medic'); game.state.rep[medic.data.faction] = -50;
  assert.match(read(game, medic).greeting, /need care/);
  assert.equal(game.state.person.health, 100);
});

test('visible injuries and real deck hazards outrank mission and friendly history', () => {
  const game = ordinary(), medic = person(game, 'kettle:medic');
  game.state.person.health = 20;
  assert.equal(read(game, medic).context, 'urgent');
  assert.match(read(game, medic).greeting, /hurt/);
  game.state.person.health = 100;
  const crew = { id: 'crew:anika', name: 'Anika', role: 'engineer', type: 'crew', data: { health: 20, maxHealth: 100 } };
  assert.match(read(game, crew).greeting, /hurt/);
  game.state.interior = { kind: 'ship' };
  game.state.ship.damageControl.sections[0].fire = 1;
  assert.match(read(game, crew).greeting, /fire/);
  game.state.boarding = { phase: 'active' };
  assert.match(read(game, crew).greeting, /head down/);
});

test('distant or expired events do not turn a peaceful local conversation into an attack warning', () => {
  const game = ordinary(), medic = person(game, 'kettle:medic');
  game._directorShared = { time: 100, events: [{ type: 'raid', status: 'active', systemId: 'vesper', bodyId: 'listening' }, { type: 'outbreak', status: 'active', systemId: 'hearth', bodyId: 'morrow' }], conditions: { 'hearth:kettle': { until: 99, text: 'Old raid warning.' } } };
  const answer = read(game, medic);
  assert.equal(answer.context, 'routine');
  assert.notEqual(answer.newsContext, 'local-event');
  assert.doesNotMatch(answer.rumor, /Old raid warning|convoy under attack|fever surge/);
});

test('current local news describes the actual incident, not an invisible attack on the player', () => {
  const game = ordinary(), dockworker = person(game);
  game._directorShared = { time: 100, events: [{ type: 'raid', status: 'active', systemId: 'hearth', bodyId: 'kettle' }], conditions: {} };
  const answer = read(game, dockworker);
  assert.equal(answer.newsContext, 'local-event');
  assert.match(answer.rumor, /Dispatch.*convoy/);
  assert.doesNotMatch(answer.greeting + answer.rumor, /you’re being attacked|your ship is under attack/i);
});

test('fixed service terminals do not acquire human social memories', () => {
  const game = ordinary();
  const answer = game.conversation({ id: 'quest:passage-desk:kettle', name: 'Passage desk', data: { automated: true, serviceDesk: 'passage' } });
  assert.equal(game.state.conversations.people.length, 0);
  assert.equal(answer.context, 'service'); assert.equal(answer.relationship, '');
  assert.match(answer.greeting, /Passenger dispatch/);
  assert.doesNotMatch(answer.greeting, /I |my |Morning|familiar/);
});

test('the shipwright reacts to actual main-story progress and never assumes a Sparrow starter', () => {
  const game = ordinary(), iona = person(game, 'kettle:mechanic');
  assert.doesNotMatch(read(game, iona).greeting, /Sparrow|fold drive fitted/i);
  game.state.flags.push('first_job');
  assert.match(read(game, iona).greeting, /finished a job/);
  game.state.flags.push('census_fragment');
  assert.match(read(game, iona).greeting, /recent address from Earth/i);
  game.state.upgrades.fold_1 = true; game.state.ship.warpRange = 4;
  assert.match(read(game, iona).greeting, /Fold drive fitted/);
  game.state.flags.push('jumped_to_vesper');
  assert.match(read(game, iona).greeting, /Back from your first fold/);
});

test('moving a saved captain between clock origins does not trap a conversation in a recent-repeat response', () => {
  const game = ordinary(), entity = person(game);
  game.conversation(entity, { time: 20000 });
  const answer = game.conversation(entity, { time: 5 });
  assert.notEqual(answer.greeting, 'Still here. Was there something else?');
  assert.equal(memoryFor(game).lastAt, 5);
});
