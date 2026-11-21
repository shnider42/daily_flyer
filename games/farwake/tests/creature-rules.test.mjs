import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATURES, CREATURE_IDS } from '../dist/creature-catalog.mjs';
import { CREATURE_COMBAT, configureCreature, restoreCreatureState, stepCreatureEncounter, creatureDamageTaken, interruptCreature } from '../dist/creature-rules.mjs';
import { createSiteState, stepSiteEncounter } from '../dist/exploration.mjs';
import { storyMonsterTemplate } from '../dist/expedition-story-rules.mjs';
import { isCabinWalkable } from '../dist/interior-layouts.mjs';
import { quietEarthSites } from '../dist/quiet-earth-content.mjs';

const layout = () => ({ cols: 40, rows: 30, tile: 24, walkable: new Uint8Array(40 * 30).fill(1) });
const captain = (id = 'captain', x = 390, y = 300) => ({ id, name: id, person: { x, y, health: 100, maxHealth: 100 }, input: {} });
const creature = (species, extra = {}) => configureCreature({ id: `test:${species}`, name: CREATURES[species].name, species,
  x: 300, y: 300, originX: 300, originY: 300, cooldown: 0, windup: 0, alert: false, hostileToPlayer: true, team: 'hostile', formationIndex: 0, ...extra });
const walk = (unit, to, dt, map) => {
  const dx = to.x - unit.x, dy = to.y - unit.y, length = Math.hypot(dx, dy), d = Math.min(length, unit.speed * dt);
  const next = { x: unit.x + dx / Math.max(1, length) * d, y: unit.y + dy / Math.max(1, length) * d };
  if (isCabinWalkable(map, next.x, next.y, 6)) Object.assign(unit, next, { moving: d > 0 });
};
const fixture = (species, targets = [captain()], extra = {}) => {
  const unit = creature(species, extra), state = { id: 'fixture', time: 0, shotSerial: 0 }, map = layout(), events = [];
  return { unit, state, map, targets, events, tick(dt = .1) { this.state.time += dt; stepCreatureEncounter(this.state, this.unit, this.targets, dt, this.map, (type, data) => this.events.push({ type, ...data }), walk); } };
};
const advance = (fixture, seconds) => { for (let remaining = seconds; remaining > 1e-7; remaining -= .1) fixture.tick(Math.min(.1, remaining)); };
const wall = (map, column) => { for (let y = 0; y < map.rows; y++) map.walkable[y * map.cols + column] = 0; };
const story = hostiles => ({ id: 'test', key: 'test:site:test', bodyId: 'test', expedition: true, cols: 40, rows: 30, hostiles, choices: [], records: [], caches: [] });

test('fifteen biological identities have distinct behaviors while Bellwether, machines and authored intent stay separate', () => {
  assert.equal(CREATURE_IDS.length, 15); assert.equal(Object.keys(CREATURE_COMBAT).length, 14);
  assert.equal(new Set(CREATURE_IDS.map(id => CREATURES[id].behavior)).size, 15);
  const boss = { species: 'bellwether', phase: 'dormant', health: 1500 }, drone = { species: 'sentry-drone', attackKind: 'ranged' };
  assert.equal(configureCreature(boss), boss); assert.equal(configureCreature(drone), drone);
  const site = story([{ id: 'neutral', name: 'A resident grazer', species: 'stoneback', x: 300, y: 300, combatProfile: 'sentinel',
    hostileToPlayer: false, hostileTo: [], health: 123, damage: 7, speed: 19 }]);
  const unit = storyMonsterTemplate(site, 0);
  assert.equal(unit.maxHealth, 123); assert.equal(unit.health, 123); assert.equal(unit.damage, 7); assert.equal(unit.speed, 19);
  assert.equal(unit.hostileToPlayer, false); assert.equal(unit.team, 'neutral'); assert.equal(unit.creatureBehavior, 'shell-slam');
});

test('all ordinary species need a locally visible contact and never attack while hidden or dormant', () => {
  for (const species of Object.keys(CREATURE_COMBAT)) {
    const f = fixture(species, [captain('hidden', 450, 300)]); wall(f.map, 16);
    const before = { x: f.unit.x, y: f.unit.y }; advance(f, 2);
    assert.equal(f.unit.alert, false, species); assert.equal(f.unit.windup, 0, species);
    assert.deepEqual({ x: f.unit.x, y: f.unit.y }, before, species); assert.equal(f.events.length, 0, species);
    f.map = layout(); f.unit.hidden = true; f.unit.alert = true; advance(f, 2);
    assert.equal(f.events.length, 0, species); assert.equal(f.unit.phase, 'idle', species);
    f.unit.hidden = false; f.unit.quietEarthDormant = true; advance(f, 2); assert.equal(f.events.length, 0, species);
  }
});

test('a Skitter visibly commits to two bites and a sideways dodge escapes the second', () => {
  const f = fixture('skitter', [captain('prey', 320, 300)]); f.tick();
  assert.ok(f.unit.windup > 0); assert.equal(f.targets[0].person.health, 100);
  advance(f, .4); assert.equal(f.events.filter(e => e.type === 'person-hit').length, 1);
  assert.ok(f.unit.windup > 0, 'The second bite has its own readable pause.');
  f.targets[0].person.y += 55; advance(f, .4);
  assert.equal(f.events.filter(e => e.type === 'person-hit').length, 1);
  const still = fixture('skitter', [captain('prey', 320, 300)]); advance(still, 1.2);
  assert.equal(still.events.filter(e => e.type === 'person-hit').length, 2); assert.equal(still.targets[0].person.health, 88);
});

test('a nearer captain behind a wall cannot suppress a second visible participant', () => {
  const hidden = captain('hidden', 374, 300), seen = captain('seen', 300, 400), f = fixture('mire-spitter', [hidden, seen]);
  wall(f.map, 14); f.tick();
  assert.ok(f.unit.windup > 0); assert.equal(f.unit.aimTargetId, 'seen'); assert.equal(f.unit.targetId, 'seen');
  advance(f, 1); assert.equal(hidden.person.health, 100); assert.equal(seen.person.health, 88);
});

test('spit and shard fan keep locked directions, and solid cover stops every shot', () => {
  for (const species of ['mire-spitter', 'shardling']) {
    const f = fixture(species, [captain('dodger', 410, 300)]); f.tick();
    assert.ok(f.unit.windup > 0); const angle = f.unit.aimAngle;
    f.targets[0].person.y += 100; advance(f, 1);
    const shots = f.events.filter(e => e.type === 'person-shot');
    assert.equal(shots.length, species === 'shardling' ? 3 : 1); assert.equal(f.targets[0].person.health, 100);
    assert.equal(shots[Math.floor(shots.length / 2)].angle, angle);
    const covered = fixture(species, [captain('covered', 410, 300)]); covered.tick(); wall(covered.map, 16); advance(covered, 1);
    assert.equal(covered.targets[0].person.health, 100);
    assert.ok(covered.events.filter(e => e.type === 'person-shot').every(e => e.blocked && e.to.x < 384));
  }
});

test('a Sporeback leaves a bounded lingering cloud, hurts an entrant once, and cover blocks it', () => {
  const lure = captain('lure', 355, 300), entrant = captain('entrant', 430, 300), f = fixture('sporeback', [lure, entrant]);
  f.tick(); lure.person.x = 430; advance(f, 1.1);
  assert.equal(f.unit.phase, 'strike'); assert.ok(f.unit.strikeRemaining > 0); assert.equal(lure.person.health, 100);
  entrant.person.x = 350; advance(f, .9); assert.equal(entrant.person.health, 87);
  assert.equal(f.events.filter(e => e.type === 'person-hit' && e.targetId === entrant.id).length, 1);
  advance(f, 1); assert.notEqual(f.unit.phase, 'strike');
  const covered = fixture('sporeback', [captain('cover', 355, 300)]); covered.tick(); wall(covered.map, 14); advance(covered, 1.4);
  assert.equal(covered.targets[0].person.health, 100);
});

test('Tidebell rings have a safe center and outer edge, while Ember mites burn out after one rupture', () => {
  const close = captain('close', 320, 300), ring = captain('ring', 370, 300), far = captain('far', 450, 300);
  const f = fixture('tidebell', [ring, close, far]); advance(f, 1.4);
  assert.equal(close.person.health, 100); assert.equal(far.person.health, 100); assert.equal(ring.person.health, 85);
  const mite = fixture('ember-mite', [captain('prey', 335, 300)]); advance(mite, 1.5);
  assert.equal(mite.targets[0].person.health, 78); assert.equal(mite.unit.health, 0); assert.equal(mite.unit.phase, 'dead');
  advance(mite, 2); assert.equal(mite.events.filter(e => e.type === 'person-hit').length, 1);
});

test('all four moving strikes sweep their body, hit once per target, and permit dodging and cover', () => {
  for (const species of ['reedstalker', 'rimehorn', 'coilworm', 'veilwing']) {
    const target = captain('prey', 370, 300), f = fixture(species, [target]); f.tick();
    assert.ok(f.unit.windup > 0, species); target.person.y = 380; advance(f, 2.1);
    assert.equal(target.person.health, 100, `${species}: sideways dodge`);
    const still = fixture(species, [captain('prey', 370, 300)]); advance(still, 2.1);
    assert.equal(still.events.filter(e => e.type === 'person-hit').length, 1, `${species}: one swept hit`);
    const cover = fixture(species, [captain('prey', 370, 300)]); cover.tick(); wall(cover.map, 14); advance(cover, 2.1);
    assert.equal(cover.targets[0].person.health, 100, `${species}: wall blocks damage`);
    assert.ok(cover.unit.x < 336, `${species}: body cannot cross wall`);
  }
});

test('Root snares never pursue and their locked patch can be vacated or entered by another participant', () => {
  const lure = captain('lure', 390, 300), other = captain('other', 430, 300), f = fixture('root-snare', [lure, other], { stationary: true });
  f.tick(); assert.ok(f.unit.windup > 0); assert.equal(f.unit.attackTargetX, 390);
  lure.person.y += 65; other.person.x = 390; advance(f, 1.1);
  assert.equal(lure.person.health, 100); assert.equal(other.person.health, 82);
  other.person.x = 600; lure.person.x = 600; advance(f, 4);
  assert.deepEqual({ x: f.unit.x, y: f.unit.y }, { x: 300, y: 300 });
});

test('front armor and recovery openings reward position and timing without invulnerability', () => {
  const crab = creature('kiln-crab'), stone = creature('stoneback'), wing = creature('veilwing');
  crab.aimAngle = 0;
  assert.ok(creatureDamageTaken(crab, { x: 340, y: 300 }, 20) < creatureDamageTaken(crab, { x: 260, y: 300 }, 20));
  crab.phase = 'recovery'; assert.equal(creatureDamageTaken(crab, { x: 340, y: 300 }, 20), 20);
  stone.phase = 'windup'; assert.equal(creatureDamageTaken(stone, { x: 340, y: 300 }, 20), 13);
  wing.phase = 'recovery'; assert.equal(creatureDamageTaken(wing, { x: 340, y: 300 }, 20), 26);
});

test('save restore preserves locked attacks but discards forged stats and legacy latent attacks', () => {
  const site = story([{ id: 'horn', species: 'rimehorn', name: 'Horn', x: 300, y: 300, hostileToPlayer: true }]);
  const state = createSiteState(site), surface = { site, combatLayout: layout() }, actor = captain();
  stepSiteEncounter(state, [actor], .1, surface); const unit = state.monsters[0]; assert.ok(unit.windup > 0);
  const saved = structuredClone(state); saved.monsters[0].damage = 9999; saved.monsters[0].speed = 9999;
  const restored = createSiteState(site, saved), fresh = restored.monsters[0];
  assert.equal(fresh.phase, 'windup'); assert.equal(fresh.windup, unit.windup); assert.equal(fresh.aimAngle, unit.aimAngle);
  assert.equal(fresh.damage, CREATURE_COMBAT.rimehorn.damage); assert.equal(fresh.speed, CREATURE_COMBAT.rimehorn.speed);
  actor.person.y += 90; advance({ tick: dt => stepSiteEncounter(restored, [actor], dt, surface) }, 2.3); assert.equal(actor.person.health, 100);
  const legacy = restoreCreatureState(creature('rimehorn'), { phase: 'strike', windup: 99, chargeRemaining: 9999, damage: 9999 }, 40);
  assert.equal(legacy.phase, 'idle'); assert.equal(legacy.windup, 0); assert.equal(legacy.chargeRemaining, 0);
  const cloud = fixture('sporeback', [captain('first', 350, 300)]); advance(cloud, 1.3);
  const resumed = restoreCreatureState(creature('sporeback'), structuredClone(cloud.unit), cloud.state.time);
  assert.deepEqual(resumed.attackHitIds, ['first']); assert.equal(resumed.phase, 'strike');
  cloud.unit = resumed; const health = cloud.targets[0].person.health;
  stepCreatureEncounter(cloud.state, resumed, cloud.targets, .1, cloud.map, () => {}, walk); assert.equal(cloud.targets[0].person.health, health);
});

test('shared area attacks respect individual aggression, and Quiet Earth stagger cancels the complete moving strike', () => {
  const site = story([{ id: 'bell', species: 'tidebell', name: 'Bell', x: 300, y: 300, hostileToPlayer: false, hostileTo: [] }]);
  const state = createSiteState(site), surface = { site, combatLayout: layout() }, offender = captain('offender', 370, 300), observer = captain('observer', 370, 304);
  state.monsters[0].aggressors = [offender.id];
  for (let i = 0; i < 15; i++) stepSiteEncounter(state, [offender, observer], .1, surface);
  assert.equal(offender.person.health, 85); assert.equal(observer.person.health, 100);
  const chargeSite = story([{ id: 'echo', species: 'rimehorn', name: 'Echo', x: 300, y: 300, hostileToPlayer: true, quietEarthActor: true }]);
  const chargeState = createSiteState(chargeSite), charger = chargeState.monsters[0], shooter = captain('shooter', 370, 300);
  Object.assign(charger, { phase: 'strike', chargeRemaining: 200, attackX: 300, attackY: 300, aimAngle: 0, attackHitIds: [] });
  shooter.input = { fire: true, aiming: true, aimX: -1, aimY: 0 };
  stepSiteEncounter(chargeState, [shooter], .1, { site: chargeSite, combatLayout: layout() });
  assert.equal(charger.phase, 'idle'); assert.equal(charger.chargeRemaining, 0); assert.equal(charger.x, 300); assert.equal(shooter.person.health, 100);
  interruptCreature(charger); assert.equal(charger.attackUntil, 0);
});

test('Relay Nine updates only pristine unseen contacts and retains witnessed identity, wounds and deaths', () => {
  const site = quietEarthSites({ id: 'morrow' }, 'creature-roster-restore')[0], old = createSiteState(site);
  const oldSpecies = ['glassmaw', 'shardling', 'glassmaw', 'shardling'];
  for (const [index, unit] of old.monsters.entries()) Object.assign(unit, { species: oldSpecies[index], maxHealth: 48, health: 48,
    quietEarthDormant: true, hidden: true, revealed: false, alert: false, creatureVersion: undefined, damage: 9999 });
  const pristine = createSiteState(site, structuredClone(old));
  assert.deepEqual(pristine.monsters.map(unit => unit.species), site.hostiles.map(unit => unit.species));
  assert.ok(pristine.monsters.every(unit => unit.health === unit.maxHealth && unit.damage === 10));
  old.monsters[0].revealed = true; old.monsters[1].alert = true; old.monsters[2].health = 17; old.monsters[3].health = 0;
  const witnessed = createSiteState(site, structuredClone(old));
  assert.deepEqual(witnessed.monsters.map(unit => unit.species), oldSpecies);
  assert.equal(witnessed.monsters[2].health, 17); assert.equal(witnessed.monsters[3].health, 0);
  assert.deepEqual(witnessed.monsters.map(unit => unit.id), old.monsters.map(unit => unit.id));
  assert.deepEqual(witnessed.monsters.map(unit => [unit.x, unit.y]), old.monsters.map(unit => [unit.x, unit.y]));
  old.choices.receiver = 'copy'; old.monsters[0].species = 'bellwether';
  const forged = createSiteState(site, old); assert.notEqual(forged.monsters[0].species, 'bellwether');
  assert.equal(forged.monsters[3].health, 0); assert.ok(forged.monsters.every(unit => unit.damage === 10));
});
