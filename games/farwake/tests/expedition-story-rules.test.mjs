import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteState, inspectSiteRecord, claimSiteReward, stepSiteEncounter, explorationSites, explorationLocation } from '../dist/exploration.mjs';
import { storyStatus, inspectStoryChoice, expeditionHostileTo, storySurfaceView, EXPEDITION_COMBAT_PROFILES } from '../dist/expedition-story-rules.mjs';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const story = extra => ({ expedition: true, archetypeId: 'runtime-fixture', bodyId: 'fixture-world', id: 'story-fixture', key: 'fixture-world:site:story-fixture', name: 'The relay dispute', cols: 48, rows: 36,
  objective: 'Diagnose the damaged relay, restore its safety system, then settle the competing claims.', completionChoiceId: 'settlement', hostile: false, hostiles: [], residents: [],
  records: [{ id: 'diagnosis', name: 'Maintenance diagnosis', x: 8, y: 12, text: 'Isolate the supply before restoring pressure. The public register predates the lease.' }],
  choices: [
    { id: 'isolation', name: 'Supply isolator', text: 'Isolate the supply before restoring pressure.', requireRecords: ['diagnosis'], options: [{ id: 'isolate', label: 'Isolate the supply', text: 'The damaged feed is now safely isolated.' }] },
    { id: 'settlement', name: 'Public route register', text: 'Decide who receives the restored route.', requireChoices: { isolation: 'isolate' }, options: [
      { id: 'public', label: 'Reopen the public route', text: 'The register is open and relief crews have a safe route.', reward: { credits: 95 }, effects: { rep: { freewake: 3, meridian: -1 }, aftermath: 'Relief traffic uses the restored public route.', pacify: true, treatResidents: true } },
      { id: 'lease', label: 'Enforce the lease', text: 'The Combine patrol accepts the lease.', reward: { credits: 125 }, effects: { rep: { meridian: 3 }, aftermath: 'The toll post is operating again.', pacifyFactions: ['meridian'] } }
    ] }
  ], caches: [{ id: 'stores', name: 'Relief stores', x: 25, y: 20, text: 'The authorized stores are recovered.', reward: { ore: 2 }, requireChoices: { settlement: 'public' } }], ...extra });
const openSurface = site => ({ site, combatLayout: { cols: 48, rows: 36, tile: 24, walkable: new Uint8Array(48 * 36).fill(1) }, entities: [] });
const person = (id = 'observer', x = 6, y = 25, input = {}) => ({ id, name: id, person: { ...point(x, y), health: 100, maxHealth: 100, facing: 'right' }, input });
const soldier = (id, factionId, profile, x, y, extra = {}) => ({ id, name: id, species: 'human', factionId, combatProfile: profile, ...point(x, y), hostileToPlayer: false, hostileTo: [factionId === 'meridian' ? 'cinder' : 'meridian'], ...extra });

test('evidence and authored repair order gate choices, show the next physical task, and settle once', () => {
  const site = story(), state = createSiteState(site);
  assert.match(claimSiteReward(state, site, 'isolation', 'isolate').reason, /Maintenance diagnosis/);
  assert.match(claimSiteReward(state, site, 'settlement', 'public').reason, /Supply isolator/);
  const view = inspectStoryChoice(state, site, 'isolation');
  assert.ok(view.choice.options.every(option => option.disabled)); assert.match(view.choice.options[0].reason, /Read/);
  assert.equal(storyStatus(state, site).nextTargetId, `${site.key}:record:diagnosis`);
  ok(inspectSiteRecord(site, 'diagnosis', state)); assert.equal(state.story.readRecords.length, 1);
  ok(inspectSiteRecord(site, 'diagnosis', state)); assert.equal(state.story.readRecords.length, 1);
  ok(claimSiteReward(state, site, 'isolation', 'isolate'));
  assert.equal(storyStatus(state, site).nextTargetId, `${site.key}:choice:settlement`);
  const result = ok(claimSiteReward(state, site, 'settlement', 'public'));
  assert.equal(result.credits, 95); assert.deepEqual(result.rep, { freewake: 3, meridian: -1 });
  assert.equal(claimSiteReward(state, site, 'settlement', 'lease').ok, false);
  const restored = createSiteState(site, structuredClone(state));
  assert.equal(storyStatus(restored, site).completed, true); assert.match(storyStatus(restored, site).aftermath, /public route/);
  assert.equal(claimSiteReward(restored, site, 'settlement', 'public').ok, false);
  assert.equal(ok(claimSiteReward(restored, site, 'stores')).ore, 2); assert.equal(claimSiteReward(restored, site, 'stores').ok, false);
});

test('sequence puzzles retry without locking an incorrect choice and reward only the completed sequence', () => {
  const puzzle = { id: 'settlement', name: 'Pressure controls', text: 'Use the sequence described in the log.', requireRecords: ['diagnosis'],
    puzzle: { solution: ['seal', 'vent', 'prime'], text: 'The pressure system is working.', wrongText: 'Unsafe order. The controls reset.', reward: { credits: 120 }, effects: { rep: { lantern: 2 }, aftermath: 'The green pressure lamp stays lit.' } },
    options: ['seal', 'vent', 'prime'].map(id => ({ id, label: id, text: `${id} accepted.` })) };
  const site = story({ choices: [puzzle], caches: [] }), state = createSiteState(site);
  ok(inspectSiteRecord(site, 'diagnosis', state));
  const wrong = ok(claimSiteReward(state, site, 'settlement', 'prime'));
  assert.equal(wrong.completed, false); assert.equal(wrong.wrong, true); assert.equal(wrong.credits, undefined); assert.equal(state.choices.settlement, undefined);
  const first = ok(claimSiteReward(state, site, 'settlement', 'seal')); assert.equal(first.completed, false);
  const restored = createSiteState(site, structuredClone(state)); assert.deepEqual(restored.story.puzzles.settlement, ['seal']);
  ok(claimSiteReward(restored, site, 'settlement', 'vent'));
  const done = ok(claimSiteReward(restored, site, 'settlement', 'prime'));
  assert.equal(done.credits, 120); assert.equal(done.completed, true); assert.equal(restored.choices.settlement, 'complete');
  assert.equal(inspectStoryChoice(restored, site, 'settlement').resolutionText, 'The pressure system is working.');
  assert.equal(claimSiteReward(createSiteState(site, restored), site, 'settlement', 'prime').ok, false);
});

test('unknown saved evidence, decisions, puzzle progress, units, and forged actor stats are discarded', () => {
  const site = story({ hostiles: [soldier('guard', 'meridian', 'sentinel', 16, 16, { hostileToPlayer: true })] });
  const state = createSiteState(site), id = state.monsters[0].id;
  const restored = createSiteState(site, { story: { readRecords: ['invented', 'diagnosis'], puzzles: { ghost: ['pay'] } }, choices: { settlement: 'mint-money', ghost: 'cash' },
    collected: ['invented'], monsters: [{ id, health: 999999, maxHealth: 999999, damage: 999999, speed: 999999, x: Infinity, y: -100, pacified: true, hostileToPlayer: false }, { id: 'injected', health: 100 }] });
  assert.deepEqual(restored.story.readRecords, ['diagnosis']); assert.deepEqual(restored.story.puzzles, {});
  assert.deepEqual(restored.choices, {}); assert.deepEqual(restored.collected, []); assert.equal(restored.monsters.length, 1);
  assert.equal(restored.monsters[0].maxHealth, EXPEDITION_COMBAT_PROFILES.sentinel.health);
  assert.equal(restored.monsters[0].damage, EXPEDITION_COMBAT_PROFILES.sentinel.damage);
  assert.equal(restored.monsters[0].pacified, false); assert.equal(restored.monsters[0].hostileToPlayer, true); assert.ok(Number.isFinite(restored.monsters[0].x));
});

test('neutral faction units fight each other without automatically attacking an observing captain', () => {
  const site = story({ hostiles: [soldier('Combine rifle', 'meridian', 'faction-rifle', 16, 15), soldier('Clan sentinel', 'cinder', 'sentinel', 23, 15)] });
  const state = createSiteState(site), surface = openSurface(site), captain = person('neutral', 17, 26);
  const health = state.monsters.map(unit => unit.health), events = [];
  for (let index = 0; index < 300 && state.monsters.every(unit => unit.health > 0); index++) events.push(...stepSiteEncounter(state, [captain], .1, surface));
  assert.equal(captain.person.health, 100); assert.equal(captain.person.weaponDrawn, true);
  assert.equal(events.some(event => event.type === 'person-shot' && event.attackerId === captain.id), false, 'Readiness never fires on neutral squads without input.');
  assert.ok(state.monsters.some((unit, index) => unit.health < health[index]), 'The opposing squads cause real damage without player fire.');
  assert.ok(events.some(event => event.type === 'person-hit' && state.monsters.some(unit => unit.id === event.targetId)));
  assert.ok(state.monsters.every(unit => !expeditionHostileTo(unit, captain.id)));
});

test('the authored relief bridge becomes a real moving faction battle while a neutral arrival remains safe', () => {
  const seed = 'authored-bridge-battle';
  let location = null;
  for (const system of buildGalaxy(seed)) {
    for (const body of system.bodies) {
      const site = explorationSites(body, seed).find(value => value.archetypeId === 'relief-bridge');
      if (site) { location = explorationLocation(body, site.id, seed); break; }
    }
    if (location) break;
  }
  assert.ok(location, 'An existing world exposes the authored relief bridge.');
  const surface = generateSurface(location, seed), state = createSiteState(location.site), captain = person();
  Object.assign(captain.person, surface.spawn);
  const before = state.monsters.map(unit => ({ x: unit.x, y: unit.y, health: unit.health })), events = [];
  assert.ok(state.monsters.length >= 4); assert.ok(state.monsters.every(unit => unit.weaponDrawn && unit.weapon === 'field-carbine'));
  for (let tick = 0; tick < 450; tick++) events.push(...stepSiteEncounter(state, [captain], .1, surface));
  assert.ok(state.monsters.some((unit, index) => Math.hypot(unit.x - before[index].x, unit.y - before[index].y) > 72), 'Opposing squads approach across the authored geography.');
  assert.ok(state.monsters.some((unit, index) => unit.health < before[index].health), 'Faction combat causes actual wounds within 45 seconds.');
  assert.ok(events.some(event => event.type === 'person-hit' && state.monsters.some(unit => unit.id === event.targetId)));
  assert.equal(new Set(events.map(event => event.id)).size, events.length, 'Shots and impacts have distinct IDs so the presentation does not suppress damage feedback.');
  assert.equal(captain.person.health, 100); assert.equal(captain.person.weaponDrawn, true);
  assert.equal(events.some(event => event.type === 'person-shot' && event.attackerId === captain.id), false);
  assert.ok(state.monsters.every(unit => !expeditionHostileTo(unit, captain.id)));
});

test('manual aggression targets the offending captain while automatic aim leaves neutral combatants alone', () => {
  const site = story({ hostiles: [soldier('Combine rifle', 'meridian', 'faction-rifle', 16, 15, { hostileTo: [] })] });
  const state = createSiteState(site), surface = openSurface(site), shooter = person('shooter', 13, 15, { fire: true }), observer = person('bystander', 15, 16);
  const before = state.monsters[0].health;
  stepSiteEncounter(state, [shooter, observer], .1, surface); assert.equal(state.monsters[0].health, before);
  shooter.input = { aiming: true, aimX: 1, aimY: 0 };
  stepSiteEncounter(state, [shooter, observer], .25, surface); // The preceding blank pulse uses the normal recharge.
  shooter.input = { fire: true, aiming: true, aimX: 1, aimY: 0 };
  stepSiteEncounter(state, [shooter, observer], .1, surface);
  assert.ok(state.monsters[0].health < before); assert.equal(expeditionHostileTo(state.monsters[0], 'shooter'), true);
  assert.equal(expeditionHostileTo(state.monsters[0], 'bystander'), false);
  const restored = createSiteState(site, state); assert.equal(expeditionHostileTo(restored.monsters[0], 'shooter'), true);
});

test('the same combat loop produces rapid melee, ranged pressure, armor, and pack flanking', () => {
  const template = combatProfile => story({ hostiles: [soldier(combatProfile, 'wildlife', combatProfile, 16, 15, { hostileToPlayer: true, hostileTo: [], species: 'reedstalker' })] });
  const fast = template('fast-melee'), heavy = template('sentinel');
  const quick = createSiteState(fast), armored = createSiteState(heavy), target = person('target', 25, 15);
  quick.monsters[0].alert = true; armored.monsters[0].alert = true;
  for (let index = 0; index < 6; index++) { stepSiteEncounter(quick, [target], .1, openSurface(fast)); stepSiteEncounter(armored, [target], .1, openSurface(heavy)); }
  assert.ok(quick.monsters[0].x - point(16, 15).x > armored.monsters[0].x - point(16, 15).x);
  assert.ok(armored.monsters[0].armor > quick.monsters[0].armor);
  const rangedSite = template('spitter'), ranged = createSiteState(rangedSite), near = person('near', 20, 15), events = [];
  for (let index = 0; index < 60; index++) events.push(...stepSiteEncounter(ranged, [near], .1, openSurface(rangedSite)));
  assert.ok(events.some(event => event.type === 'person-shot' && event.weaponId === 'acid-spit'));
  assert.ok(near.person.health < 100, 'Spitters can harm someone beyond melee reach.');
  const packSite = template('pack-stalker'), pack = createSiteState(packSite), prey = person('prey', 24, 15); pack.monsters[0].alert = true;
  stepSiteEncounter(pack, [prey], .2, openSurface(packSite)); assert.notEqual(pack.monsters[0].y, point(16, 15).y, 'A pack stalker approaches from a flank.');
});

test('ranged tells keep their locked direction, permit a sidestep, and stop missed visuals at solid cover', () => {
  const site = story({ hostiles: [soldier('spitter', 'fauna', 'spitter', 16, 15, { hostileToPlayer: true, hostileTo: [], species: 'mire-spitter' })] });
  const surface = openSurface(site), state = createSiteState(site), unit = state.monsters[0], captain = person('dodging', 20, 15);
  Object.assign(unit, { alert: true, cooldown: 0, windup: .05, aimAngle: 0, aimTargetId: captain.id });
  captain.person.y += 30;
  const dodged = stepSiteEncounter(state, [captain], .1, surface).find(event => event.type === 'person-shot');
  assert.ok(dodged); assert.equal(dodged.hit, false); assert.equal(dodged.angle, 0); assert.equal(captain.person.health, 100);
  Object.assign(captain.person, point(20, 15)); surface.combatLayout.walkable[15 * 48 + 18] = 0;
  Object.assign(unit, { windup: .05, aimAngle: 0, aimTargetId: captain.id });
  const blocked = stepSiteEncounter(state, [captain], .1, surface).find(event => event.type === 'person-shot');
  assert.ok(blocked); assert.equal(blocked.hit, false); assert.equal(blocked.blocked, true);
  assert.ok(blocked.to.x < 18 * 24, 'The shot ends before the first opaque tile.'); assert.equal(captain.person.health, 100);
});

test('peaceful outcomes persist with living units, treated residents, and a reusable view without mutating the base map', () => {
  const site = story({ hostiles: [soldier('Patrol', 'meridian', 'faction-rifle', 16, 15, { hostileToPlayer: true })] }), state = createSiteState(site);
  ok(inspectSiteRecord(site, 'diagnosis', state)); ok(claimSiteReward(state, site, 'isolation', 'isolate')); ok(claimSiteReward(state, site, 'settlement', 'public'));
  assert.ok(state.monsters[0].health > 0); assert.equal(state.monsters[0].pacified, true); assert.equal(state.cleared, true);
  const surface = { ...openSurface(site), entities: [{ id: 'resident', type: 'npc', text: 'I am hurt.', health: 20, maxHealth: 100, data: { siteId: site.id } }, { id: 'record', type: 'siteRecord', data: { recordId: 'diagnosis' } }] }, before = JSON.stringify(surface);
  const view = storySurfaceView(surface, state); assert.equal(storySurfaceView(view, state), view); assert.equal(view.entities[0].health, 100); assert.equal(view.entities[1].completed, true);
  assert.equal(JSON.stringify(surface), before); assert.equal(createSiteState(site, state).monsters[0].pacified, true);
  Object.assign(surface.entities[0], { x: 72, y: 144, moving: true, life: { label: 'On an errand' } });
  assert.equal(storySurfaceView(surface, state), view); assert.equal(view.entities[0].x, 72); assert.equal(view.entities[0].life.label, 'On an errand');
  assert.equal(view.entities[0].health, 100); assert.equal(surface.entities[0].health, 20, 'Ambient updates cannot remove the consequence or mutate the base wound.');
  view.entities[0].x = 80; assert.equal(storySurfaceView(view, state).entities[0].x, 80, 'Client animation of the projected map stays authoritative for its local clock.');
});

test('an active legacy frontier hollow restores and exits after its public entrance has been replaced', () => {
  const game = new Game('legacy-expedition-runtime', { startMode: 'casual', startSystemId: 'brindle' });
  const body = game.system.bodies.find(value => value.id === 'orchard'), old = explorationLocation(body, 'hollow', game.state.seed);
  assert.ok(old); assert.equal(explorationSites(body, game.state.seed).some(site => site.id === 'hollow'), false);
  const encounter = createSiteState(old.site); encounter.monsters[0].health = 17; encounter.collected.push('survey-case');
  Object.assign(game.state, { mode: 'person', locationId: old.id, interior: { kind: 'site', location: old }, exploration: { key: old.site.key, bodyId: body.id, siteId: 'hollow', returnPosition: point(4, 6), encounter } });
  game.state.explorationRecords[old.site.key] = encounter;
  const restored = Game.fromSave(game.serialize());
  assert.equal(restored.state.exploration.siteId, 'hollow'); assert.equal(restored.state.exploration.encounter.monsters[0].health, 17);
  assert.ok(restored.state.exploration.encounter.collected.includes('survey-case'));
  const exit = restored._expeditionSurface().entities.find(entity => entity.type === 'siteExit'); Object.assign(restored.state.person, { x: exit.x, y: exit.y });
  ok(restored.exitSite()); assert.equal(restored.state.locationId, 'orchard'); assert.equal(restored.state.exploration, null);
});

test('an expedition resident keeps its local objective and aftermath despite unrelated port news or work', () => {
  const seed = 'expedition-dialogue-scope', system = buildGalaxy(seed).find(value => value.bodies.some(body => body.id === 'avel'));
  assert.ok(system);
  const game = new Game(seed, { startMode: 'casual', startSystemId: system.id }), body = game.system.bodies.find(value => value.id === 'avel');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 }); ok(game.dock(body.id));
  const entrance = generateSurface(body, seed).entities.find(entity => entity.type === 'siteEntrance' && entity.data.siteId === 'story-tidal-intake');
  assert.ok(entrance); Object.assign(game.state.person, { x: entrance.x, y: entrance.y }); ok(game.enterSite('story-tidal-intake'));
  const surface = game._expeditionSurface(), site = surface.site, encounter = game.state.exploration.encounter;
  const keeper = surface.entities.find(entity => entity.type === 'npc' && entity.data.roleLabel === 'Tideward pump keeper'); assert.ok(keeper);
  const director = game.worldDirector, incident = { id: 'unrelated-port-raid', type: 'raid', status: 'active', bodyId: body.id, systemId: system.id };
  const unrelatedJob = { id: 'unrelated-port-job', title: 'Unrelated freight shift', type: 'work', status: 'active', targetBody: body.id, targetSystem: system.id };
  director.conditions = {}; game.state.missions = [unrelatedJob];
  const verify = () => {
    const expected = storyStatus(encounter, site), answer = game.conversation(keeper, { record: false });
    const localText = expected.completed ? expected.aftermath : [expected.objective, expected.pendingSummary].filter(Boolean).join(' ');
    assert.equal(answer.context, 'local-expedition'); assert.equal(answer.newsContext, 'local-expedition');
    assert.equal(answer.greeting, keeper.text); assert.equal(answer.rumor, localText);
    assert.equal(answer.topics.find(topic => topic.id === 'local-expedition')?.text, localText);
  };
  director.events = [incident]; verify(); director.events = []; verify();
  game.state.missions = [];
  const act = (type, id, action, optionId) => {
    const entity = game._expeditionSurface().entities.find(item => item.type === type && (item.data.recordId === id || item.data.choiceId === id));
    assert.ok(entity); Object.assign(game.state.person, { x: entity.x, y: entity.y }); return ok(game.siteAction(entity.id, action, optionId));
  };
  act('siteRecord', 'plate', 'inspect');
  for (const choice of site.choices) for (const optionId of choice.puzzle.solution) act('siteChoice', choice.id, 'choose', optionId);
  assert.equal(storyStatus(encounter, site).completed, true);
  game.state.missions = [unrelatedJob]; director.events = [incident]; verify(); director.events = []; verify();
});
