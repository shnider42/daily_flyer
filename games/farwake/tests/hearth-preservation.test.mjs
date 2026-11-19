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
const baseline={
 farwake:{
  surfaces:{kettle:'c893a6b5fd4f497d47da384a58090da34125f26171f78cfb03bbe9eed283defb',morrow:'29235a7b733d22f3b3de2e23ec063244a327fc66d3342d590873f3129c20262d',tinbell:'6b7fbf5ee76524bcef84817ebaeb2746376ea9fbf5de775d752519ceef83b176'},
  sites:'6dda22c029ab61b63fcd44aaa5320fe12620ef3619aeb06e2ee9707e86b85b4b'
 },
 'hearth-preservation':{
  surfaces:{kettle:'c70a921cf8db4cdcde5ae6b1f47a2e26bde5b39c1ee84e2b2d2222059e43e45f',morrow:'c28fa0d6b56258a66a6ba5a92ece3970ce6007da56385b2e573253a70f4c12a0',tinbell:'8fd24814ddfe782233667c3e83ddedc635c8de9b9d63dead0c42e9f3057761f0'},
  sites:'cd92ad488e9e30ddfb4c418b166a226c6aa4ceeceda483df6f18e41ad935967a'
 }
};
for(const [seed,expected] of Object.entries(baseline))test(`Hearth preserves its baseline with the authored 0.34 Relay Nine upgrade (${seed})`,()=>{
 const hearth=buildGalaxy(seed).find(system=>system.id==='hearth');
 assert.equal(digest(hearth),'e001d59d987c94f04bc2064a643306fc7281b73ac1afdf226bcb5d0a67f62570','authored bodies, station positions, story and opening geography');
 assert.deepEqual(Object.fromEntries(hearth.bodies.map(body=>[body.id,digest(generateSurface(body,seed,[]))])),expected.surfaces,'every outdoor tile, entity, service and arrival');
 assert.equal(digest(hearth.bodies.map(body=>explorationSites(body,seed))),expected.sites,'all existing Hearth exploration');
});
