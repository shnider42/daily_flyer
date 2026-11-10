import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalaxy } from '../dist/engine.mjs';
import { systemContext, incidentTypeWeight } from '../dist/encounter-context.mjs';
import { advanceWorldDirector, WORLD_DIRECTOR_RULES, directorEvent } from '../dist/world-director.mjs';

const systems=buildGalaxy('quiet-geography');
const system=id=>systems.find(value=>value.id===id);

test('the unchanged central starting system is busy and protected while remote routes are sparse',()=>{
 const hearth=system('hearth'),core=systemContext(hearth),border=systemContext(system('cinder')),deep=systemContext(system('lacuna'));
 assert.equal(hearth.gx,0);assert.equal(hearth.gy,0);assert.equal(core.region,'core');assert.equal(core.security,'high');
 assert.equal(core.backgroundHostileCount,0);assert.ok(core.trafficCount>=16);assert.ok(core.trafficCount>deep.trafficCount*5);
 assert.equal(border.region,'frontier');assert.equal(border.border,true);assert.equal(deep.region,'deep');
 assert.equal(systemContext(system('brindle')).region,'core');assert.equal(systemContext(system('vesper')).region,'core');
 assert.ok(core.rescueSignalChance>0&&core.rescueSignalChance<=.001);assert.ok(border.rescueSignalChance<.2);assert.ok(deep.rescueSignalChance<.2);
 assert.ok(core.rescueSignalChance*100<border.rescueSignalChance);assert.ok(core.derelictSignalChance*40<border.derelictSignalChance);
});

test('incident types are tied to security and settlement context',()=>{
 for(const value of systems){
  const context=systemContext(value);
  if(context.region==='core'||context.region==='settled'){
   assert.equal(incidentTypeWeight(value,'raid'),0,value.id);assert.equal(incidentTypeWeight(value,'clash'),0,value.id);
  }
 }
 assert.ok(incidentTypeWeight(system('hearth'),'rescue')>0,'a core rescue is possible, but exceptional');
 assert.ok(incidentTypeWeight(system('hearth'),'rescue')*1000<incidentTypeWeight(system('cinder'),'rescue'));
 assert.equal(incidentTypeWeight({id:'empty',gx:50,gy:40,danger:5,bodies:[{kind:'blackhole'}]},'rescue'),0);
});

test('a fresh galaxy has a substantial quiet opening regardless of seed or captain count',()=>{
 for(let index=0;index<32;index++){
  const options={seed:`quiet-start-${index}`,systems};
  let state=advanceWorldDirector(null,100,options).state;
  assert.equal(state.events.length,0);assert.equal(state.cycle,-1);
  for(const elapsed of[1,45,180,540,720,900]){
   const advanced=advanceWorldDirector(state,100+elapsed,options);state=advanced.state;
   assert.equal(state.events.length,0);assert.equal(state.history.length,0);assert.equal(advanced.transitions.length,0);
  }
 }
});

test('a simulated day has long irregular gaps, quiet cycles and only context-valid incidents',()=>{
 const options={seed:'quiet-day',systems},seen=new Map();let state=advanceWorldDirector(null,0,options).state;
 for(let now=30;now<=86400;now+=30){
  state=advanceWorldDirector(state,now,options).state;
  for(const event of [...state.events,...state.history])seen.set(event.id,event);
 }
 const events=[...seen.values()].sort((a,b)=>a.startAt-b.startAt);
 assert.ok(events.length>20&&events.length<80,`a whole day produced ${events.length} incidents across 900 systems`);
 assert.ok(events[0].startAt>=900);assert.ok(events.length<state.cycle+1,'some scheduled opportunities must remain quiet');
 const gaps=events.slice(1).map((event,index)=>event.startAt-events[index].startAt);
 assert.ok(gaps.every(gap=>gap>=WORLD_DIRECTOR_RULES.minIntervalSeconds));assert.ok(new Set(gaps).size>5);
 assert.ok(gaps.some(gap=>gap>WORLD_DIRECTOR_RULES.maxIntervalSeconds),'quiet opportunities extend the time between actual incidents');
 const lastBySystem=new Map();
 for(const event of events){
  const target=system(event.systemId);assert.ok(incidentTypeWeight(target,event.type)>0,`${event.type} at ${target.id}`);
  if(lastBySystem.has(target.id))assert.ok(event.startAt-lastBySystem.get(target.id)>=systemContext(target).localIncidentCooldownSeconds);
  lastBySystem.set(target.id,event.startAt);
 }
 assert.ok(events.filter(event=>systemContext(system(event.systemId)).region==='core').length<events.length*.05);
});

test('a single inhabited system cannot be assigned another incident during its local recovery window',()=>{
 const only={...system('cinder')},options={seed:'one-border-port',systems:[only]},events=new Map();let state=advanceWorldDirector(null,0,options).state;
 for(let now=60;now<=86400;now+=60){state=advanceWorldDirector(state,now,options).state;for(const event of [...state.events,...state.history])events.set(event.id,event);}
 const ordered=[...events.values()].sort((a,b)=>a.startAt-b.startAt);assert.ok(ordered.length>5&&ordered.length<25);
 for(let index=1;index<ordered.length;index++)assert.ok(ordered[index].startAt-ordered[index-1].startAt>=3600);
});

test('v1 migration preserves an ongoing incident and its contribution evidence while replacing only its future cadence',()=>{
 const options={seed:'ongoing-migration',systems};let original=advanceWorldDirector(null,0,options).state;
 for(let now=30;now<=7200&&!original.events.some(event=>event.status==='active');now+=30)original=advanceWorldDirector(original,now,options).state;
 const prior=original.events.find(event=>event.status==='active');assert.ok(prior);
 prior.contributors.captain={damage:24,aid:1,neutralized:0,claimed:false,actions:['completed-shift'],lastAt:original.time};prior.progress=1;
 original.version=1;delete original.scheduleEpoch;const originalEvidence=structuredClone(prior);
 const migration=advanceWorldDirector(original,original.time+1,options);assert.equal(migration.state.version,2);assert.equal(migration.state.cycle,-1);
 assert.deepEqual(directorEvent(migration.state,prior.id),originalEvidence);assert.equal(migration.state.events.length,original.events.length);
 const finished=advanceWorldDirector(migration.state,prior.expiresAt+1,options).state;
 assert.equal(directorEvent(finished,prior.id).outcome,'unassisted');assert.equal(directorEvent(finished,prior.id).contributors.captain.damage,24);
 assert.deepEqual(directorEvent(finished,prior.id).contributors.captain.actions,['completed-shift']);
});

test('offline catch-up records history without replaying a stack of old warning and attack alerts',()=>{
 const options={seed:'quiet-offline',systems},first=advanceWorldDirector(null,0,options).state,now=365*86400;
 const caught=advanceWorldDirector(first,now,options);assert.ok(caught.state.skippedCycles>20000);
 assert.ok(caught.state.history.length<=WORLD_DIRECTOR_RULES.maxHistory);assert.ok(caught.state.events.length<=WORLD_DIRECTOR_RULES.maxEvents);
 assert.ok(caught.transitions.length<=8);assert.ok(caught.transitions.every(event=>event.at>=now-30));
 assert.ok(caught.spawns.every(spawn=>caught.state.events.some(event=>event.id===spawn.eventId&&event.status==='active'&&event.expiresAt>now)));
 assert.deepEqual(advanceWorldDirector(JSON.parse(JSON.stringify(caught.state)),now,options).state,caught.state);
});
