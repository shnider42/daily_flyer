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
const baseline={
 farwake:{
  surfaces:{kettle:'c893a6b5fd4f497d47da384a58090da34125f26171f78cfb03bbe9eed283defb',morrow:'099f1427d456b1e720fcb8c6e623a58dec35c2b43252bf36a5ffbee55bd48a25',tinbell:'6b7fbf5ee76524bcef84817ebaeb2746376ea9fbf5de775d752519ceef83b176'},
  sites:'72464c74425abf0b6ccfb839bc771740f2581b6bd7a7e3681d2c5beb354fd24b'
 },
 'hearth-preservation':{
  surfaces:{kettle:'c70a921cf8db4cdcde5ae6b1f47a2e26bde5b39c1ee84e2b2d2222059e43e45f',morrow:'025f21df8f8e135fe9d0a60bf5c2c155fc8f3137679079b768d7cfd929472b0d',tinbell:'8fd24814ddfe782233667c3e83ddedc635c8de9b9d63dead0c42e9f3057761f0'},
  sites:'84f13ac4d3aa2438a07e5d7bbf3ce00ce26f0915475565431297b7480ea15a35'
 }
};
for(const [seed,expected] of Object.entries(baseline))test(`Hearth preserves its baseline with the authored 0.34 Relay Nine upgrade (${seed})`,()=>{
 const hearth=buildGalaxy(seed).find(system=>system.id==='hearth');
 assert.equal(digest(hearth),'e001d59d987c94f04bc2064a643306fc7281b73ac1afdf226bcb5d0a67f62570','authored bodies, station positions, story and opening geography');
 assert.deepEqual(Object.fromEntries(hearth.bodies.map(body=>[body.id,digest(generateSurface(body,seed,[]))])),expected.surfaces,'every outdoor tile, entity, service and arrival');
 assert.equal(digest(hearth.bodies.map(body=>explorationSites(body,seed))),expected.sites,'all existing Hearth exploration');
});
