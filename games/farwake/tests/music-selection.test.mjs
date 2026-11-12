import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMED_SYSTEMS } from '../dist/content.mjs';
import { SPECIES_HOMEWORLDS } from '../dist/species-content.mjs';
import { musicContext } from '../dist/music-context.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { MUSIC_CUES } from '../dist/music-score.mjs';
import { ENVIRONMENT_COMPOSITIONS } from '../dist/music-environments.mjs';
import { DANGER_COMPOSITIONS } from '../dist/music-danger.mjs';

const metadata = id => MUSIC_CUES.find(cue => cue.id === id);
const namedBody = id => NAMED_SYSTEMS.flatMap(system => system.bodies).find(body => body.id === id);
const director = seed => new MusicDirector({ cues: MUSIC_CUES, seed });

function surfaceContext(body, { cave = false } = {}) {
  const currentBody = cave ? { id: `${body.id}:test-cave`, kind: 'site', biome: 'cave',
    parentId: body.id, site: { id: 'test-cave', bodyId: body.id, kind: 'cave', atmosphere: 'cave' } } : body;
  return musicContext({ playing: true, game: {
    playerId: 'listener', currentBody, currentSystem: { faction: 'freewake' },
    system: { bodies: [body], enemies: [], bullets: [] },
    state: { mode: 'person', systemId: 'palette-test', locationId: currentBody.id,
      person: { x: 0, y: 0 }, exploration: cave ? { bodyId: body.id, siteId: 'test-cave' } : null },
  } });
}

function shipContext({ capital = false, navy = false, boarding = false } = {}) {
  const ship = { id: 'occupied-hull', x: 0, y: 0, radius: 30, maxHull: capital ? 900 : 160 };
  return musicContext({ playing: true, deckHull: ship, game: {
    playerId: 'listener', currentBody: null, currentSystem: { faction: 'freewake' },
    system: { bodies: [], enemies: [], bullets: [{ id: 'incoming', ttl: 1, ownerId: 'raider',
      targetId: 'listener', targetVesselId: ship.id, x: 60, y: 0 }] },
    state: { mode: navy || boarding ? 'person' : 'ship', systemId: 'palette-test', ship,
      person: { x: 0, y: 0 }, interior: navy || boarding ? { kind: 'ship' } : null,
      npcContract: navy ? { active: true, vesselId: ship.id, navy: { operationId: 'real-watch' } } : null,
      boarding: boarding ? { id: 'actual-boarding', phase: 'active' } : null },
  } });
}

test('actual planet biomes beat generic family and descriptive tags on first arrival', () => {
  const expected = {
    morrow: 'rain-over-morrow', orchard: 'orchards-in-orbit', serein: 'roads-of-violet-dust',
    lilt: 'the-tide-keeps-time', ward: 'the-white-distance', kiln: 'embers-below-the-road',
    tallow: 'windows-after-shift', tinbell: 'small-sky-on-a-moon',
    palimpsest: 'the-garden-remembers', earth: 'the-garden-remembers',
  };
  for (const [bodyId, id] of Object.entries(expected)) {
    const context = surfaceContext(namedBody(bodyId));
    assert.equal(context.environment, 'planet', bodyId);
    for (let seed = 0; seed < 24; seed++) {
      assert.equal(director(`biome-${seed}`).update(context, 0).cueId, id, `${bodyId}: exact biome, seed ${seed}`);
    }
  }
});

test('real homeworld cultures get their piece, then keep the ordinary biome available during its cooldown', () => {
  for (const { body } of SPECIES_HOMEWORLDS) {
    const context = surfaceContext(body), d = director(body.id);
    assert.ok(context.tags.includes(body.culture));
    assert.equal(d.update(context, 0).cueId, 'the-common-horizon', body.id);
    const following = d.select('planet', 90, context);
    assert.ok(following && following.tags.includes(body.biome), body.id);
    assert.notEqual(following.id, 'the-common-horizon');
  }
});

test('cave selection keeps the parent biome and all five cave scores have a real setting', () => {
  const expected = { tinbell: 'under-the-first-ridge', lilt: 'water-between-walls',
    kiln: 'basalt-letters', morrow: 'a-little-room-below', ward: 'the-long-quiet-seam' };
  for (const [bodyId, id] of Object.entries(expected)) {
    const body = namedBody(bodyId), context = surfaceContext(body, { cave: true });
    assert.equal(context.environment, 'cave'); assert.equal(context.biome, body.biome);
    for (let seed = 0; seed < 12; seed++) assert.equal(director(`cave-${seed}`).update(context, 0).cueId, id, bodyId);
  }
});

test('ground pursuit stays in the ground pool while small ships and Navy capital ships keep their own emphasis', () => {
  const ordinaryGround = surfaceContext(namedBody('morrow'));
  const chasedGround = { ...ordinaryGround, pursuit: true, tags: [...ordinaryGround.tags, 'pursuit'] };
  const smallShip = shipContext(), navy = shipContext({ capital: true, navy: true });
  assert.ok(smallShip.observedThreat); assert.ok(navy.tags.includes('navy'));
  for (let seed = 0; seed < 48; seed++) {
    const onFoot = metadata(director(`ground-${seed}`).update(chasedGround, 0).cueId);
    const ground = onFoot.tags.some(tag => ['ground', 'surface', 'infantry'].includes(tag));
    const space = onFoot.tags.some(tag => ['flight', 'ship', 'navy', 'capital'].includes(tag));
    assert.ok(!space || ground, `${onFoot.id}: a chase cannot bypass domain compatibility`);
    const small = metadata(director(`small-${seed}`).update(smallShip, 0).cueId);
    assert.ok(!small.tags.includes('capital') && !small.tags.includes('navy'), small.id);
    const naval = metadata(director(`navy-${seed}`).update(navy, 0).cueId);
    assert.ok(naval.tags.includes('capital') || naval.tags.includes('navy'), naval.id);
    assert.equal(director(`board-${seed}`).update(shipContext({ boarding: true }), 0).cueId, 'through-the-bulkhead');
  }
});

test('affinity preserves rotation and every added composition is reachable through compatible settings', () => {
  const heard = new Set();
  const bodyIds = ['morrow', 'orchard', 'serein', 'lilt', 'ward', 'kiln', 'tallow', 'tinbell', 'palimpsest'];
  const peaceful = bodyIds.map(id => surfaceContext(namedBody(id)))
    .concat(SPECIES_HOMEWORLDS.map(({ body }) => surfaceContext(body)))
    .concat(['tinbell', 'lilt', 'kiln', 'morrow', 'ward'].map(id => surfaceContext(namedBody(id), { cave: true })));
  for (const [index, context] of peaceful.entries()) heard.add(director(`place-${index}`).update(context, 0).cueId);
  const foot = surfaceContext(namedBody('morrow'));
  const situations = [shipContext(), shipContext({ capital: true, navy: true }), shipContext({ boarding: true }),
    { ...foot, tags: [...foot.tags, 'infantry'] },
    { ...shipContext(), tags: [...shipContext().tags, 'pursuit'], pursuit: true },
    { ...shipContext(), tags: [...shipContext().tags, 'emergency'], emergency: true }];
  for (const [index, context] of situations.entries()) {
    const d = director(`rotation-${index}`), recent = [];
    for (let i = 0; i < 18; i++) {
      const cue = d.select('combat', i * 90, context);
      assert.ok(cue, 'Observed danger keeps a compatible score available.');
      assert.notEqual(cue.id, recent.at(-1), 'A full compatible pool has no immediate repeat.');
      d.begin(cue, i * 90, context); heard.add(cue.id); recent.push(cue.id);
    }
  }
  for (const cue of [...ENVIRONMENT_COMPOSITIONS, ...DANGER_COMPOSITIONS]) assert.ok(heard.has(cue.id), `${cue.id}: reachable`);
  const context = surfaceContext(namedBody('tinbell')), d = director('barren-fallback');
  const first = d.update(context, 0).cueId;
  const second = d.select('planet', 90, context);
  assert.equal(first, 'small-sky-on-a-moon');
  assert.ok(second && second.id !== first, 'The exact biome rests while another available planet piece plays.');
});
