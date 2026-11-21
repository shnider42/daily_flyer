import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalaxy } from '../dist/engine.mjs';
import { explorationSites, createSiteState } from '../dist/exploration.mjs';
import { expeditionStorySites } from '../dist/expedition-stories.mjs';
import { cavernSites, materializeCavern } from '../dist/cavern-content.mjs';
import { CAVERN_FAMILIES, createCavernLayout } from '../dist/cavern-layouts.mjs';
import { CREATURE_IDS, creatureProfile } from '../dist/creature-catalog.mjs';
import { generateSurface, isWalkable, movePerson } from '../dist/surface.mjs';
import { planetSettlementPlan } from '../dist/planet-layout.mjs';
import { settlementFootprints } from '../dist/settlement-footprints.mjs';
import { clearSidearmSight, sidearmAim } from '../dist/combat.mjs';
import { createSiteVisibility, canSeeConcealedActor, isFoggedSite, visibleSiteCombatEvent, visibleSiteHostiles } from '../dist/site-visibility.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { recordStoryAggression, expeditionHostileTo } from '../dist/expedition-story-rules.mjs';
import { quietEarthSites } from '../dist/quiet-earth-content.mjs';

const point = (x, y) => ({ x: (x + .5) * 24, y: (y + .5) * 24 });
const cell = (surface, at) => Math.floor(at.y / 24) * surface.cols + Math.floor(at.x / 24);
const location = site => ({ id: site.key, kind: 'site', name: site.name, parentId: site.bodyId, siteId: site.id, site });
function reachable(surface) {
  const start = cell(surface, surface.spawn), parents = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i], x = at % surface.cols, y = Math.floor(at / surface.cols);
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const next = yy * surface.cols + xx, p = point(xx, yy);
      if (xx < 0 || yy < 0 || xx >= surface.cols || yy >= surface.rows || parents.has(next) || !isWalkable(surface, p.x, p.y)) continue;
      parents.set(next, at); queue.push(next);
    }
  }
  return parents;
}
function route(surface, parents, target) {
  const steps = [];
  for (let n = cell(surface, target); parents.get(n) !== null; n = parents.get(n)) { assert.ok(parents.has(n)); steps.push(point(n % surface.cols, Math.floor(n / surface.cols))); }
  return steps.reverse();
}

test('five geological families have seeded connected routes and physically reachable evidence, wildlife and exits', () => {
  const familyMaps = new Map();
  for (const family of CAVERN_FAMILIES) {
    const signatures = new Set();
    for (let index = 0; index < 20; index++) {
      const seed = `cavern-route-${index}`, site = materializeCavern(family, { id: 'survey', name: 'Survey' }, seed);
      const surface = generateSurface(location(site), seed), parents = reachable(surface), state = createSiteState(site);
      signatures.add(JSON.stringify(surface.tiles));
      assert.deepEqual(createCavernLayout(family, site.cavernSeed), createCavernLayout(family, site.cavernSeed));
      for (const target of [...surface.entities, ...state.monsters]) assert.ok(parents.has(cell(surface, target)), `${family}/${index}: ${target.id} unreachable`);
      for (let y = 0; y < surface.rows; y++) for (let x = 0; x < surface.cols; x++) if (isWalkable(surface, point(x, y).x, point(x, y).y))
        assert.ok(parents.has(y * surface.cols + x), `${family}/${index}: isolated floor ${x},${y}`);
      const source = surface.entities.find(entity => entity.type === 'siteChoice');
      if (index === 0) {
        const walker = { ...surface.spawn, radius: 6, speed: 120 };
        for (const at of route(surface, parents, source)) {
          movePerson(surface, walker, Math.abs(at.x - walker.x) < .001 ? 0 : Math.sign(at.x - walker.x), Math.abs(at.y - walker.y) < .001 ? 0 : Math.sign(at.y - walker.y), .2);
          assert.ok(Math.hypot(at.x - walker.x, at.y - walker.y) < .001, `${family}: the player's body must fit the route`);
        }
        familyMaps.set(family, JSON.stringify(surface.tiles));
      }
      assert.ok(parents.size > 350 && parents.size < 1400, 'Caves remain bounded field visits with distinct stone and water barriers.');
    }
    assert.ok(signatures.size >= 18, `${family}: new seeds change actual walkable passages`);
  }
  assert.equal(new Set(familyMaps.values()).size, 5);
});

test('actual galaxies expose all fourteen ordinary creatures, mixed populations and quiet dark places without replacing authored stories', () => {
  for (const seed of ['farwake', 'cavern-distribution-a', 'cavern-distribution-b']) {
    const families = new Set(), species = new Set(); let count = 0, fog = 0, quietFog = 0, mixed = 0, expanded = 0;
    for (const system of buildGalaxy(seed)) for (const raw of system.bodies) {
      const body = { ...raw, systemId: system.id }, selected = explorationSites(body, seed), caves = selected.filter(site => site.cavern);
      assert.ok(caves.length <= 1);
      const stories = expeditionStorySites(body, seed);
      for (const story of stories) assert.ok(selected.some(site => site.id === story.id && site.tileX === story.tileX && site.tileY === story.tileY));
      if (system.authored) assert.equal(caves.length, 0, `${body.id} is an authored world`);
      for (const cave of caves) {
        count++; families.add(cave.cavernFamily); if (body.id.startsWith('frontier-')) expanded++;
        const oldSites = selected.filter(site => !site.cavern), plan = planetSettlementPlan(body, seed);
        assert.deepEqual(settlementFootprints(plan, selected).centers, settlementFootprints(plan, oldSites).centers, 'An additive cave cannot move the old landing or services.');
        assert.deepEqual(cavernSites(body, seed, oldSites), [cave], 'Looking up or returning to a cave never rerolls its geometry or population.');
        assert.ok(!oldSites.some(site => site.tileX === cave.tileX && site.tileY === cave.tileY));
        if (cave.visibility.mode === 'local') { fog++; if (!cave.hostile) quietFog++; }
        if (cave.hostiles.some(actor => actor.hostileToPlayer) && cave.hostiles.some(actor => !actor.hostileToPlayer)) mixed++;
        for (const actor of cave.hostiles) {
          species.add(actor.species);
          assert.ok(creatureProfile(actor.species).habitats.includes(cave.cavernFamily));
          assert.notEqual(actor.species, 'bellwether');
          if (!actor.hostileToPlayer) assert.equal(creatureProfile(actor.species).peacefulEligible, true);
        }
      }
    }
    assert.ok(count > 70 && count < 300 && expanded > 30);
    assert.deepEqual([...families].sort(), [...CAVERN_FAMILIES].sort());
    assert.deepEqual([...species].sort(), CREATURE_IDS.filter(id => id !== 'bellwether').sort());
    assert.ok(fog > 0 && fog < count / 3 && quietFog > 0 && mixed > 0, 'Fog is selective and does not predict danger.');
  }
});

test('a neutral cavern species does not become another species’ army when the captain attacks it', () => {
  let site;
  for (let i = 0; i < 50; i++) {
    const candidate = materializeCavern('root-grotto', { id: 'ecology' }, `mixed-${i}`);
    if (candidate.hostiles.some(actor => actor.hostileToPlayer) && candidate.hostiles.some(actor => !actor.hostileToPlayer)) { site = candidate; break; }
  }
  assert.ok(site);
  const state = createSiteState(site), neutral = state.monsters.find(actor => !actor.hostileToPlayer), neighbours = state.monsters.filter(actor => actor !== neutral);
  assert.equal(expeditionHostileTo(neutral, 'local'), false);
  recordStoryAggression(state, neutral, 'local');
  assert.equal(expeditionHostileTo(neutral, 'local'), true);
  assert.ok(neighbours.every(actor => !actor.aggressors.includes('local')), 'Independent species do not inherit the injury receipt.');
});

test('contextual fog conceals ordinary wildlife consistently from aim, local pursuit, shared events and rendering', () => {
  let site, surface, observer, contact;
  for (let i = 0; i < 30 && !contact; i++) {
    const candidate = materializeCavern('root-grotto', { id: 'lamps' }, `lamp-${i}`);
    if (candidate.visibility.mode !== 'local') continue;
    const map = generateSurface(location(candidate), `lamp-${i}`), distance = Math.ceil((candidate.visibility.range + 24) / 24);
    for (let y = 2; y < map.rows - 2 && !contact; y++) for (let x = 2; x < map.cols - distance - 2; x++) {
      const from = point(x, y), to = point(x + distance, y);
      if (isWalkable(map, from.x, from.y) && isWalkable(map, to.x, to.y) && clearSidearmSight(map.combatLayout, from, to)) {
        site = candidate; surface = map; observer = from; contact = to; break;
      }
    }
  }
  assert.ok(contact, 'The physical cave must contain a clear line longer than the local lamp.');
  const person = { id: 'local', ...observer, health: 100, maxHealth: 100, facing: 'right', weapon: 'union-longwatch', ownedWeapons: ['pulse-sidearm', 'union-longwatch'] };
  const actor = { id: `${site.key}:actor:ordinary`, ...contact, species: 'skitter', name: 'Cave skitter', health: 48, maxHealth: 48,
    team: 'hostile', hostile: true, alert: true, targetId: 'local', attackKind: 'melee', revealed: true };
  const encounter = { id: site.key, monsters: [actor], time: 0 }, game = { playerId: 'local', currentBody: location(site), state: {
    mode: 'person', systemId: 'sector-1', locationId: site.key, person, exploration: { bodyId: site.bodyId, siteId: site.id, encounter } } };
  assert.equal(actor.concealed, undefined, 'Normal cave wildlife has no special scripted concealment flag.');
  assert.equal(isFoggedSite(surface), true); assert.match(createSiteVisibility(surface, person).reason, /mist|lamp/i);
  assert.equal(canSeeConcealedActor(surface.combatLayout, person, actor), false);
  assert.deepEqual(visibleSiteHostiles(surface, person, [actor]), []);
  assert.equal(sidearmAim(person, [actor], {}, surface.combatLayout).target, null);
  const context = musicContext({ game, surface, playing: true });
  assert.equal(context.pursuit, false); assert.equal(context.observedThreat, false);
  const remoteHit = { type: 'person-hit', id: 'shared-hit', siteId: site.key, attackerId: actor.id, actorName: actor.name, targetId: 'another-captain', damage: 9, ...contact };
  assert.equal(classifyMusicEvent(remoteHit, context), null);
  assert.equal(visibleSiteCombatEvent(remoteHit, { surface, observer: person, actors: [actor] }), null);
  const localHit = { ...remoteHit, targetId: 'local', ...person };
  assert.equal(classifyMusicEvent(localHit, context), 'combat', 'A real local injury is still observed danger.');
  const injury = visibleSiteCombatEvent(localHit, { surface, observer: person, actors: [actor] });
  assert.equal(injury.actorName, 'Unseen movement');
  const clear = { ...surface, site: { ...site, visibility: { mode: 'clear' } }, combatLayout: { ...surface.combatLayout, visibility: { mode: 'clear' } } };
  assert.equal(createSiteVisibility(clear, person), null);
  assert.equal(canSeeConcealedActor(clear.combatLayout, person, actor), true);
  assert.equal(sidearmAim(person, [actor], {}, clear.combatLayout).target?.id, actor.id);
  assert.equal(isFoggedSite({ id: 'ordinary-cave', biome: 'cave' }), false, 'A biome alone never opts into fog.');
});

test('Relay Nine varies compatible finale bodies while all four released positions, dormant gates and escape budget remain', () => {
  const compositions = new Set(), expected = [[112,10],[121,17],[117,27],[111,28]];
  for (let i = 0; i < 24; i++) {
    const [site] = quietEarthSites({ id: 'morrow', kind: 'planet' }, `relay-ecology-${i}`), state = createSiteState(site);
    compositions.add(site.hostiles.map(actor => actor.species).join(','));
    assert.deepEqual(site.hostiles.map(actor => [actor.tileX, actor.tileY]), expected);
    assert.ok(state.monsters.every(actor => actor.quietEarthDormant && actor.hidden && !actor.revealed && !actor.hostileToPlayer && actor.damage <= 10 && actor.maxHealth <= 80));
    assert.ok(site.hostiles.every(actor => creatureProfile(actor.species).habitats.includes('service-tunnel')));
  }
  assert.ok(compositions.size >= 10, 'New galaxies vary the actual ending roster.');
});
