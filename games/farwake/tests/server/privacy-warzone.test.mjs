import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../dist/engine.mjs';
import { createPrivacyExport } from '../../server/privacy.mjs';

const captainId='captain_'+ 'a'.repeat(24),otherId='captain_'+ 'b'.repeat(24),shipId='own-crosswind-ship';
const otherSecret='OTHER_CAPTAIN_WARZONE_PRIVATE',spaceRoll='CANONICAL_SPACE_ROLL_SECRET',groundRoll='CANONICAL_GROUND_ROLL_SECRET';
const personal={version:1,side:'freewake',hostileFactions:['meridian'],visits:4,acknowledged:true,lastHail:'Union Watchknife',mission:{id:'crosswind-relief-approach',factionId:'freewake',damage:130,seconds:32,status:'active',paid:false}};
const stories={version:1,revision:8,hospital:{stage:'done',allocation:'triage'},evacuation:{stage:'escorting',escort:{x:1600,y:1420,moving:true,waiting:false,walkTime:15}},names:{stage:'done',registry:true,tags:true,decision:'families'},dispatch:{decision:'relief'}};

function fixture(){
  const state=structuredClone(new Game('privacy-crosswind').state);state.warzone=structuredClone(personal);state.warzoneStories=structuredClone(stories);
  const captain={id:captainId,name:'Requesting captain',ownedVesselId:shipId,aboard:shipId,recentCommands:[],game:state};
  const source={realmId:'WARPRIV1',captains:{[captainId]:captain,[otherId]:{id:otherId,name:otherSecret,game:{warzone:{private:otherSecret},warzoneStories:{private:otherSecret}}}},vessels:{[shipId]:{id:shipId,name:'Owned hull',ownerId:captainId,ship:structuredClone(state.ship)}},worlds:{},sites:{},leases:{}};
  return{state,captain,source};
}

test('Crosswind privacy exports own allegiance, exact sortie progress and civilian aftermaths without shared battle internals',()=>{
  const{state,captain,source}=fixture();
  const fleet={version:1,systemId:'crosswind',rng:spaceRoll,nextWaveAt:{freewake:90,meridian:113},projectiles:[{targetVesselId:shipId}],ships:[{id:'military-hull',warzone:true,capturedBy:captainId,warzoneProvokedBy:shipId,private:otherSecret}],contributions:{[captainId]:{damage:32,aid:1,lastAt:100,rng:spaceRoll,participants:{[otherId]:{private:otherSecret}}},[otherId]:{private:otherSecret}}};
  const ground={id:'crosswind-vey:site:ashfall-front',siteId:'ashfall-front',warzone:true,warzoneGround:{version:1,rng:groundRoll,nextWave:{freewake:30,meridian:42},shells:[{targetId:captainId}]},monsters:[{id:'infantry',warzoneUnit:true,lastHitBy:captainId},{id:'other-infantry',lastHitBy:otherId,private:otherSecret}],actorCooldowns:{[captainId]:.2,[otherId]:.9}};
  source.worlds.crosswind={record:{warzoneSpace:fleet}};source.sites[ground.id]=ground;
  state.warzone.rng=spaceRoll;state.warzone.fleet=fleet;state.warzone.mission.participants={[otherId]:{private:otherSecret}};
  state.warzoneStories.shared=ground;state.warzoneStories.hospital.otherCaptain=otherSecret;state.warzoneStories.evacuation.escort.ownerId=otherId;state.warzoneStories.dispatch.participants=[otherId];
  state.warzoneView={sharedPrivate:otherSecret};state.exploration={key:ground.id,bodyId:'crosswind-vey',siteId:'ashfall-front',encounter:ground,returnPosition:{x:100,y:200}};
  state.interior={kind:'site',location:{id:ground.id,name:'Ashfall Front',kind:'site',warzoneGround:ground.warzoneGround}};
  captain.recentCommands.push({id:'old-recorded-boarding',result:{ok:true,warzoneSpace:fleet,world:{warzone:fleet},encounter:ground,text:'My recorded action'}});
  const before=structuredClone(source);
  for(const live of[false,true]){
    const selected=live?{...captain,game:{state}}:captain;
    const authority=live?{...source,id:source.realmId,captains:new Map([[captainId,selected],[otherId,source.captains[otherId]]]),rooms:new Map([['crosswind',{record:source.worlds.crosswind.record,runtime:{enemies:fleet.ships}}]])}:source;
    const output=createPrivacyExport(authority,selected,{sourceKind:live?'live-authority':'durable-snapshot'});
    assert.deepEqual(output.captain.game.warzone,personal);assert.deepEqual(output.captain.game.warzoneStories,stories);
    assert.deepEqual(output.manifest.unrecognizedGameFields,[]);assert.equal(output.captain.game.warzoneView,undefined);assert.equal(output.captain.game.exploration.encounter,undefined);
    assert.equal(output.captain.game.interior.location.warzoneGround,undefined);assert.equal(output.captain.game.interior.location.name,'Ashfall Front');
    const result=output.captain.recentCommands[0].result;assert.equal(result.text,'My recorded action');assert.equal(result.warzoneSpace,undefined);assert.equal(result.world.warzone,undefined);assert.equal(result.encounter.monsters,undefined);assert.equal(result.encounter.warzoneGround,undefined);
    const facts=output.sharedContributions.keyedRecords.find(record=>record.path.includes('contributions')&&record.path.at(-1)===captainId);assert.deepEqual(facts.value,{damage:32,aid:1,lastAt:100});
    assert.ok(output.sharedContributions.keyedRecords.some(record=>record.path.includes('actorCooldowns')&&record.path.at(-1)===captainId&&record.value===.2));
    assert.ok(output.sharedContributions.references.some(record=>record.path.includes('capturedBy')&&record.value===captainId));
    assert.ok(output.sharedContributions.references.some(record=>record.path.includes('warzoneProvokedBy')&&record.value===shipId));
    assert.ok(output.sharedContributions.references.some(record=>record.path.includes('lastHitBy')&&record.value===captainId));
    assert.ok(!output.sharedContributions.references.some(record=>record.path.includes('shells')||record.path.includes('projectiles')),'combat predictions are not stored personal provenance');
    const json=JSON.stringify(output);for(const secret of[otherId,otherSecret,spaceRoll,groundRoll])assert.ok(!json.includes(secret),secret);
  }
  assert.deepEqual(source,before,'live and durable exports leave gameplay and RNG untouched');
});

test('new Crosswind personal fields are classified while unknown fields remain visible in the privacy manifest',()=>{
  const{state,captain,source}=fixture();state.futureUnclassifiedField={secret:otherSecret};state.warzoneStories.evacuation={stage:'unasked',escort:null};
  const output=createPrivacyExport(source,captain);assert.deepEqual(output.manifest.unrecognizedGameFields,['futureUnclassifiedField']);
  assert.deepEqual(output.captain.game.warzoneStories.evacuation,{stage:'unasked',escort:null});assert.equal(output.captain.game.futureUnclassifiedField,undefined);
});
