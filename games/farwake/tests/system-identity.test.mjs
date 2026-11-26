import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGalaxy} from '../dist/engine.mjs';
import {systemContext} from '../dist/encounter-context.mjs';
import {SYSTEM_IDENTITIES,systemIdentity,applySystemIdentity,applySystemIdentityContext,systemIdentityIncidentWeight} from '../dist/system-identity.mjs';
import {TINBELL_RESIDUE_RECORD,TINBELL_RESIDUE_LORE,withTinbellResidue} from '../dist/tinbell-evidence.mjs';
import {explorationSites,BELLWETHER_PROFILE,createSiteState,BELLWETHER_ID} from '../dist/exploration.mjs';

test('all 26 systems have distinct public purposes and activities at actual retained bodies',()=>{
 const galaxy=buildGalaxy('identity-coverage');assert.equal(galaxy.length,26);assert.equal(SYSTEM_IDENTITIES.length,26);
 assert.equal(new Set(SYSTEM_IDENTITIES.map(identity=>identity.role)).size,26);
 for(const system of galaxy){
  const identity=systemIdentity(system),ids=new Set(system.bodies.map(body=>body.id));assert.ok(identity,system.id);assert.ok(identity.activities.length>=2);
  assert.equal(new Set(identity.activities.map(activity=>activity.id)).size,identity.activities.length);
  for(const activity of identity.activities)assert.ok(ids.has(activity.bodyId),`${system.id}/${activity.bodyId}`);
  const decorated=applySystemIdentity(system);assert.equal(decorated.identityRole,identity.role);assert.equal(decorated.description,identity.description);assert.equal(decorated.bodies,system.bodies);
  decorated.localActivities[0].label='local edit';assert.notEqual(identity.activities[0].label,'local edit');
 }
});

test('identities produce different lived traffic and incident mixes without erasing regional safety',()=>{
 const galaxy=buildGalaxy('identity-coverage'),context=id=>{const system=galaxy.find(s=>s.id===id);return applySystemIdentityContext(system,systemContext(system));};
 assert.ok(context('cinder').derelictSignalChance>context('nacre').derelictSignalChance);
 assert.ok(context('cairnsea').rescueSignalChance>context('sable').rescueSignalChance);
 assert.ok(context('voltage').trafficCount>context('lacuna').trafficCount);
 assert.equal(context('hearth').backgroundHostileCount,0);assert.equal(context('sol').backgroundHostileCount,0);assert.equal(context('crosswind').backgroundHostileCount,0);
 for(const id of ['sable','cinder','witness'])assert.equal(applySystemIdentityContext({id},{region:'core',rescueSignalChance:.001,derelictSignalChance:.002}).backgroundHostileCount,0);
 assert.ok(systemIdentityIncidentWeight('cairnsea','rescue')>systemIdentityIncidentWeight('ravel','rescue'));
 assert.ok(systemIdentityIncidentWeight('ravel','raid')>systemIdentityIncidentWeight('kindred','raid'));
 assert.equal(systemIdentityIncidentWeight('sol','raid'),0);assert.equal(systemIdentityIncidentWeight('unknown-fixture','rescue'),1);
});

test('Tinbell adds a physical optional observation without changing its animal or revealing a cause',()=>{
 const body={id:'tinbell',name:'Tinbell',kind:'moon',biome:'barren'},original=explorationSites(body,'tinbell-evidence').find(site=>site.id==='hollow'),site=withTinbellResidue(original);
 const record=site.records.find(record=>record.id===TINBELL_RESIDUE_RECORD.id);assert.ok(record);assert.equal(record.loreId,TINBELL_RESIDUE_LORE.id);assert.equal(TINBELL_RESIDUE_LORE.physicalSourceOnly,true);
 assert.match(record.text,/silver, black, amber/);assert.match(record.text,/sealed layers/);assert.match(record.text,/cannot identify/);
 assert.equal(withTinbellResidue(site),site);assert.equal(withTinbellResidue({...original,bodyId:'morrow'}).records,original.records);
 const encounter=createSiteState(site);assert.equal(encounter.monsters.length,1);assert.equal(encounter.monsters[0].id,BELLWETHER_ID);assert.equal(encounter.monsters[0].health,BELLWETHER_PROFILE.health);assert.equal(encounter.monsters[0].damage,BELLWETHER_PROFILE.damage);
 assert.equal(site.choices,original.choices);assert.equal(site.caches,original.caches);
});
