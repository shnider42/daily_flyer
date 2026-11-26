import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildGalaxy} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {explorationSites} from '../dist/exploration.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Captured from release 0.22.0 (49e5a842). Hearth is explicitly excluded from
// generic expansion. Release 0.34 intentionally upgrades only Relay Nine; its
// Morrow snapshots are updated after verifying identical outdoor geometry and
// every other site/entity against 0.33.1. Kettle and Tinbell retain 0.22 hashes.
// The corridor presentation pass updates four Relay Nine text fields embedded in
// Morrow's site catalog. Outdoor geometry and all non-Relay interiors were compared
// directly with c6511a2 in three seeds; only these Morrow/catalog hashes change.
// 0.34.2 adds Relay lighting controls/metadata. Against ff48c8a, farwake,
// hearth-preservation and legacy-content preserve outdoor geometry/entities except
// Relay metadata, every other interior, and Relay floor/solids/spawn/exit.
// 0.35 adds seeded Relay annex floors and optional records. A direct pre-0.35
// comparison in these two seeds plus legacy-content found no other changes:
// Morrow outdoor differences are only its Relay entrance briefing and embedded
// Relay catalog. Every other site and every outdoor tile/service remain identical;
// all released Relay walkable positions, solids, spawn and exit remain intact.
// quiet-earth-variation.test.mjs checks additive geometry across 16 seeds.
// The creature ecology pass changes only Relay's embedded four-slot roster.
// A clean 0.35 comparison in farwake, hearth-preservation and floodworks proved
// identical outdoor maps and every interior after removing only Relay hostiles.
// No cave geometry, entity, route, service or other Hearth catalog row changed.
// 0.39 compares directly against 0.38 in both seeds: only public system
// identity metadata, one Relay Nine record clarification, and Tinbell’s sealed
// sample change. All outdoor tiles, solids, services, spawn and exits match.
const baseline={
  "farwake": {
    "surfaces": {
      "kettle": "c893a6b5fd4f497d47da384a58090da34125f26171f78cfb03bbe9eed283defb",
      "morrow": "68337f585cc064754edb8dbc82394b98506194f91a4eadd52911093be9d5c60b",
      "tinbell": "024de84b793eabd1bd054e25ef48b8ab7e4291ea20e5695f106737e3682efd3b"
    },
    "sites": "843e25fc95e1cfb9cc73e43b601da478e84a59a82af02a37a5c9ad41a884c3a2"
  },
  "hearth-preservation": {
    "surfaces": {
      "kettle": "c70a921cf8db4cdcde5ae6b1f47a2e26bde5b39c1ee84e2b2d2222059e43e45f",
      "morrow": "ed41ab81e96ab6136d13b1bb77109633605b8add413e2738dfb41d5d75a481e0",
      "tinbell": "fb31e0e0278d52e9b020513382af2846ac4048bae5fe22a058334979f9951907"
    },
    "sites": "eb9e5d3d1ef8ce03a90105d9a226381d77e5782a4cc9f5a3fb1a9f249d9308b8"
  }
};
for(const [seed,expected] of Object.entries(baseline))test(`Hearth preserves its baseline with the authored Relay Nine variation and roster (${seed})`,()=>{
 const hearth=buildGalaxy(seed).find(system=>system.id==='hearth');
 assert.equal(digest(hearth),'9600a12f21fdcdd6d447e4f0d4061362662b86124f9b13d980d79054a677b268','authored bodies, station positions, story and opening geography');
 assert.deepEqual(Object.fromEntries(hearth.bodies.map(body=>[body.id,digest(generateSurface(body,seed,[]))])),expected.surfaces,'every outdoor tile, entity, service and arrival');
 assert.equal(digest(hearth.bodies.map(body=>explorationSites(body,seed))),expected.sites,'all existing Hearth exploration');
});
