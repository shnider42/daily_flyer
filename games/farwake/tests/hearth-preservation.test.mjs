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
const baseline={
 farwake:{
  surfaces:{kettle:'c893a6b5fd4f497d47da384a58090da34125f26171f78cfb03bbe9eed283defb',morrow:'baeada330c306b26e4de9e6f84b5e76c70127f6b707ed18dd5286048adda3ece',tinbell:'6b7fbf5ee76524bcef84817ebaeb2746376ea9fbf5de775d752519ceef83b176'},
  sites:'2ceec02afacdc0e4942d51ca7eddf57098a8fc73c575f76cacc8cc981e99aefd'
 },
 'hearth-preservation':{
  surfaces:{kettle:'c70a921cf8db4cdcde5ae6b1f47a2e26bde5b39c1ee84e2b2d2222059e43e45f',morrow:'5fe779ec500f78e070a0c1650e2c0f973dc5eca0146c0cb325e6cf420754b181',tinbell:'8fd24814ddfe782233667c3e83ddedc635c8de9b9d63dead0c42e9f3057761f0'},
  sites:'6f41bd0e811ddc6f5ec9e862bc29e3a6f73afd75f84a9ada75ba871050e3edc5'
 }
};
for(const [seed,expected] of Object.entries(baseline))test(`Hearth preserves its baseline with the authored 0.34 Relay Nine upgrade (${seed})`,()=>{
 const hearth=buildGalaxy(seed).find(system=>system.id==='hearth');
 assert.equal(digest(hearth),'e001d59d987c94f04bc2064a643306fc7281b73ac1afdf226bcb5d0a67f62570','authored bodies, station positions, story and opening geography');
 assert.deepEqual(Object.fromEntries(hearth.bodies.map(body=>[body.id,digest(generateSurface(body,seed,[]))])),expected.surfaces,'every outdoor tile, entity, service and arrival');
 assert.equal(digest(hearth.bodies.map(body=>explorationSites(body,seed))),expected.sites,'all existing Hearth exploration');
});
