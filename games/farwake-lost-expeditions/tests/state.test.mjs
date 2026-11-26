import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_ORDER, getChapter } from '../dist/content.mjs';
import { initialState, hydrateState, initialCollection, hydrateCollection, storeChapter, perform, availableActions, getEnding, SAVE_KEY, LEGACY_SAVE_KEY } from '../dist/state.mjs';
import { apply, playChapter } from './chapter-helpers.mjs';

for(const id of CHAPTER_ORDER)test(`${id}: complete physical puzzle, ending and repeated save/load`,()=>{
  const s=playChapter(id),ending=getEnding(s);
  assert.equal(s.completed,true);assert(ending?.paragraphs.length>=4);
  assert.equal(ending.chapter,id);assert.equal(s.scene,getChapter(id).actions.find(a=>a.terminal).scene);
  assert.deepEqual(availableActions(s),[]);
  assert.deepEqual(perform(s,'go:survey').state,s);
  assert.deepEqual(hydrateState(s),s);
});

test('Luna connector cannot be replaced with the radio live or without the spare',()=>{
  let s=apply(initialState(),'test-radio','go:junction','go:service','read-circuit-card','power-inspection','go:junction','go:shaft','inspect-feed','go:lower');
  assert(availableActions(s).find(a=>a.id==='replace-coupler').disabled);
  assert.deepEqual(perform(s,'replace-coupler').state,s);
  s=apply(s,'go:shaft','go:junction','go:service','take-coupler','isolate-radio','go:junction','go:shaft','go:lower','replace-coupler');
  assert(s.flags.couplerReplaced);assert(s.flags.inspectionPowered);assert(!s.flags.benchPassed);
  assert.equal(getEnding(s),null);
});

test('Luna local proof precedes the Earth call and does not manufacture an incoming reply',()=>{
  let s=playChapter('nightglass',{until:'benchPassed'});
  assert(s.records.includes('luna-bench'));assert(!s.flags.antennaPassed);
  assert(availableActions(s).find(a=>a.id==='open-earth-channel').disabled);
  assert.deepEqual(perform(s,'open-earth-channel').state,s);
  const end=getEnding(playChapter('nightglass'));
  assert.match(end.text,/Static/);assert.match(end.details.join(' '),/No reply/);
});

test('Mars requires a full heater cycle before transferring the supply to the camera',()=>{
  let s=apply(initialState('mars'),'diagnose-camera','go:mars-workshop','read-camera-card');
  assert(availableActions(s).find(a=>a.id==='select-camera').disabled);
  assert.deepEqual(perform(s,'select-camera').state,s);
  assert.deepEqual(perform(s,'test-both-loads').state,s);
  s=apply(s,'select-heater','run-deice','select-camera','go:mars-control','check-live-camera');
  assert(s.flags.liveVerified);assert(!s.completed);
  assert.match(getEnding(apply(s,'pan-east-camera')).text,/A scream fills the room/);
});

test('outpost pressure order is enforced and the chapter never requires opening a door',()=>{
  let s=apply(initialState('outpost'),'read-arrivals','go:outpost-door','inspect-door');
  assert(availableActions(s).find(a=>a.id==='seat-latch').disabled);
  assert.deepEqual(perform(s,'seat-latch').state,s);
  const used=[];s=playChapter('outpost',{onStep:(_s,a)=>used.push(a.id)});
  assert(s.flags.sealVerified&&s.flags.cameraChecked&&s.flags.intercomUsed);
  assert(!used.some(id=>/^open-|cycle-/.test(id)));
  assert.match(getEnding(s).text,/utility door/);
});

test('a new collection isolates chapter progress and rejects legacy recovery saves',()=>{
  assert.notEqual(SAVE_KEY,LEGACY_SAVE_KEY);
  const old={version:1,scene:'airlock',completed:true,receiverMode:'mute',flags:{warningPublished:true,recorderRecovered:true}};
  assert.deepEqual(hydrateState(old),initialState());
  assert.deepEqual(hydrateCollection(old),initialCollection());
  let c=storeChapter(initialCollection(),playChapter('mars'));
  assert.equal(c.chapters.mars.completed,true);
  assert.deepEqual(c.chapters.nightglass,initialState());
  c=storeChapter(c,apply(initialState('outpost'),'read-arrivals'));
  c=hydrateCollection(JSON.parse(JSON.stringify(c)));
  assert.equal(c.selected,'outpost');assert.equal(c.chapters.mars.completed,true);
  assert(c.chapters.outpost.records.includes('outpost-arrivals'));
  c=storeChapter(c,initialState('outpost'));
  assert.equal(c.chapters.mars.completed,true);assert.deepEqual(c.chapters.outpost,initialState('outpost'));
});

test('corrupt and cross-chapter saves cannot unlock final events or foreign notes',()=>{
  const forged={...initialState('mars'),scene:'lower',records:['luna-bench'],flags:{finalEvent:true,liveVerified:true},completed:true};
  const s=hydrateState(forged);
  assert.equal(s.scene,'mars-control');assert.equal(s.completed,false);assert.equal(s.flags.liveVerified,false);assert.deepEqual(s.records,[]);
  assert.deepEqual(hydrateState(playChapter('mars'),'outpost'),initialState('outpost'));
  const c=hydrateCollection({version:2,selected:'bad',chapters:{mars:playChapter('nightglass')}});
  assert.equal(c.selected,'nightglass');assert.deepEqual(c.chapters.mars,initialState('mars'));
});

test('invalid or unavailable actions are immutable and cannot skip a prerequisite',()=>{
  for(const id of CHAPTER_ORDER){const s=initialState(id),before=JSON.stringify(s);Object.freeze(s.flags);Object.freeze(s.records);Object.freeze(s);
    const result=perform(s,'open-earth-channel');assert.equal(JSON.stringify(s),before);assert(!result.state.completed);
    assert.deepEqual(perform(s,'nonexistent').state,s);
  }
});
