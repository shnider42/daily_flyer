import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildGalaxy} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {explorationSites} from '../dist/exploration.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Captured from release 0.22.0 (49e5a842). Hearth is explicitly excluded from
// this expansion: system geography, all outdoor content, and its sites stay exact.
const baseline={
 farwake:{
  surfaces:{kettle:'c893a6b5fd4f497d47da384a58090da34125f26171f78cfb03bbe9eed283defb',morrow:'3396b2cce8bd7d52a04f88c18a9fbf44e39c035e7ae0f9a4a863e0363bb732ab',tinbell:'6b7fbf5ee76524bcef84817ebaeb2746376ea9fbf5de775d752519ceef83b176'},
  sites:'95e41da191d2f7a22dbd9f706b77df4953ddb3399d5307f8dc7513a57b3bb23d'
 },
 'hearth-preservation':{
  surfaces:{kettle:'c70a921cf8db4cdcde5ae6b1f47a2e26bde5b39c1ee84e2b2d2222059e43e45f',morrow:'0ad4d6e9d39f688920fa053bbf4e37eb3c9c07b5943da5b2e8ade38b403ed980',tinbell:'8fd24814ddfe782233667c3e83ddedc635c8de9b9d63dead0c42e9f3057761f0'},
  sites:'e10709fe9d085ad0bacd7d1023055e04938ac61cd310b0cf3fa2d4ce88e2029a'
 }
};
for(const [seed,expected] of Object.entries(baseline))test(`the tailored Hearth system stays identical to 0.22.0 (${seed})`,()=>{
 const hearth=buildGalaxy(seed).find(system=>system.id==='hearth');
 assert.equal(digest(hearth),'e001d59d987c94f04bc2064a643306fc7281b73ac1afdf226bcb5d0a67f62570','authored bodies, station positions, story and opening geography');
 assert.deepEqual(Object.fromEntries(hearth.bodies.map(body=>[body.id,digest(generateSurface(body,seed,[]))])),expected.surfaces,'every outdoor tile, entity, service and arrival');
 assert.equal(digest(hearth.bodies.map(body=>explorationSites(body,seed))),expected.sites,'all existing Hearth exploration');
});
