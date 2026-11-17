import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { voyageReaction } from '../dist/voyage-reactions.mjs';

const incident = () => ({ id: 'recovery:captain:1', at: 30, sourceKind: 'boarding-casualty',
  source: { systemId: 'crosswind', name: 'Crosswind', vesselId: 'cinder', vesselName: 'Cinder' },
  recoveryDestination: { systemId: 'crosswind', bodyId: 'crosswind-vey', name: 'Union field hospital', factionId: 'freewake' },
  home: { systemId: 'hearth', bodyId: 'morrow', name: 'Morrow' },
  crew: [{ id: 'ari', name: 'Ari', role: 'engineer', status: 'recovered', health: 43, maxHealth: 100, personal: true },
    { id: 'mina', name: 'Mina', role: 'medic', status: 'dead', health: 0, personal: true }],
  service: { factionId: 'freewake', rank: 'Ablecrew' }, arrival: { arrived: false, acknowledged: false },
  evacuation: { home: { name: 'Morrow' }, arrived: false }, unknowns: [] });
function view(report = incident(), place = 'recovery') {
  const target = place === 'home' ? report.home : report.recoveryDestination;
  return { state: { systemId: target.systemId, locationId: target.bodyId, person: { health: 60 }, crew: [] }, recoveryReport: () => report };
}
const medic = { id: 'field-medic:freewake', type: 'medic', role: 'medic', data: { factionId: 'freewake' } };

test('treating medic references actual crew outcomes and the authorized free route', () => {
  const report = incident(), game = view(report), before = JSON.stringify(report);
  const words = voyageReaction(game, medic, { role: 'medic' });
  assert.equal(words.context, 'recovery');
  assert.match(words.rumor, /1 crewmate is accounted for/);
  assert.match(words.rumor, /1 confirmed death/);
  assert.match(words.rumor, /covers passage to Morrow/);
  assert.equal(JSON.stringify(report), before);
  assert.equal(voyageReaction(game, { ...medic, data: { factionId: 'meridian' } }, { role: 'medic' }), null);
});

test('the same survivor acknowledges injury without reviving a confirmed dead crewmate', () => {
  const game = view(), person = { id: 'recovered-crew:ari', type: 'npc', role: 'engineer', data: { recoveredCrew: true, crewId: 'ari', health: 43, maxHealth: 100 } };
  assert.match(voyageReaction(game, person, { role: 'engineer' }).greeting, /made it out.*recover/);
  assert.equal(voyageReaction(game, { ...person, data: { ...person.data, crewId: 'mina' } }, { role: 'engineer' }), null);
});

test('own recruiter acknowledges the actual return and distinguishes it from earned service', () => {
  const report = incident(); report.arrival.arrived = true;
  const game = view(report, 'home'), recruiter = { id: 'navy-recruiter', type: 'npc', data: { militaryRecruiter: true, militaryFactionId: 'freewake' } };
  const before = voyageReaction(game, recruiter, { role: 'warden' });
  assert.match(before.greeting, /back from Crosswind/); assert.match(before.rumor, /does not count as a completed mission/);
  report.arrival.acknowledged = true;
  assert.match(voyageReaction(game, recruiter, { role: 'warden' }).greeting, /in the service record/);
  assert.equal(voyageReaction(game, { ...recruiter, data: { ...recruiter.data, militaryFactionId: 'meridian' } }, { role: 'warden' }), null);
  game.state.systemId = 'meridian'; game.state.locationId = 'serein';
  assert.equal(voyageReaction(game, recruiter, { role: 'warden' }), null);
});

test('familiar local people recognize the return; strangers and distant cultures do not inherit private facts', () => {
  const report = incident(); report.arrival.arrived = true;
  const game = view(report, 'home'), local = { id: 'morrow:courier', type: 'npc', role: 'courier', data: {} };
  const words = voyageReaction(game, local, { known: true, role: 'courier' });
  assert.equal(words.context, 'homecoming'); assert.doesNotMatch(words.greeting, /Ari|Mina|Crosswind|injur|death/);
  assert.equal(voyageReaction(game, local, { known: false, role: 'courier' }), null);
  assert.equal(voyageReaction(game, { ...local, data: { techLevel: 'preflight' } }, { known: true, role: 'courier' }), null);
  assert.equal(voyageReaction(game, { ...local, data: { homeLocationId: 'kettle' } }, { known: true, role: 'courier' }), null);
});

test('conversation remembers one return per person and incident across save, with no rewards or forced quest progress', () => {
  const game = new Game('homecoming-conversation', { startMode: 'casual' }), report = incident();
  report.arrival.arrived = true; game.state.systemId = 'hearth'; game.state.locationId = 'morrow'; game.state.mode = 'person';
  game.recoveryReport = () => report;
  const recruiter = { id: 'morrow:navy-recruiter', name: 'Recruiting officer', type: 'npc', role: 'warden', data: { militaryRecruiter: true, militaryFactionId: 'freewake' } };
  const before = structuredClone({ credits: game.state.credits, rep: game.state.rep, professions: game.state.professions, quests: game.state.narrative });
  const first = game.conversation(recruiter, { time: 50 });
  assert.match(first.greeting, /back from Crosswind/);
  const again = game.conversation(recruiter, { time: 51 });
  assert.equal(again.repeatedUpdate, true); assert.match(again.updateText, /Crosswind/);
  assert.equal(again.updateLabel, 'About coming home');
  const loaded = Game.fromSave(game.save()); loaded.recoveryReport = () => report;
  assert.equal(loaded.conversation(recruiter, { time: 200 }).repeatedUpdate, true);
  assert.deepEqual({ credits: game.state.credits, rep: game.state.rep, professions: game.state.professions, quests: game.state.narrative }, before);
  report.id = 'recovery:captain:2';
  assert.match(loaded.conversation(recruiter, { time: 201 }).greeting, /back from Crosswind/);
});

test('active fighting and urgent injuries keep priority over a return conversation', () => {
  const game = new Game('homecoming-urgency'), report = incident(); game.recoveryReport = () => report;
  game.state.locationId = 'crosswind-vey'; game.state.systemId = 'crosswind'; game.state.person.health = 10;
  const words = game.conversation(medic, { record: false });
  assert.equal(words.context, 'urgent'); assert.match(words.greeting, /hurt/);
});
