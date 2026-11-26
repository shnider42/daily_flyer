import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHAPTER_ORDER, getChapter, RECORDS } from '../dist/content.mjs';
import { initialState, sceneDescription } from '../dist/state.mjs';
import { sceneObservations, sceneObservationLead, evidenceCards } from '../dist/investigation.mjs';
import { playChapter } from './chapter-helpers.mjs';

for(const id of CHAPTER_ORDER)test(`${id}: optional details cannot change progress or expose another witness's notes`,()=>{
  const s=initialState(id),before=JSON.stringify(s);
  assert(sceneObservations(s).length);assert(sceneObservationLead(s));assert.deepEqual(evidenceCards(s),[]);
  assert.equal(JSON.stringify(s),before);
  const end=playChapter(id);
  assert(evidenceCards(end).length>0);
  for(const r of evidenceCards(end))assert(getChapter(id).records.some(x=>x.id===r.id));
  for(const r of getChapter(id).records)assert(r.body&&r.source&&RECORDS[r.id]);
});

test('revisit descriptions acknowledge actual repairs and do not restore the old fault',()=>{
  const luna=playChapter('nightglass',{until:'benchPassed'});
  assert.match(sceneDescription(luna),/works|work/);assert.doesNotMatch(sceneDescription(luna),/local test fails/i);
  const mars=playChapter('mars',{until:'liveVerified'});assert.match(sceneDescription(mars),/picture is live/);
  const outpost=playChapter('outpost',{until:'sealVerified'});assert.match(sceneDescription(outpost),/pressure seal passed/);
});

test('every illustrated scene references a bundled asset and every connection stays in its chapter',()=>{
  for(const id of CHAPTER_ORDER){const c=getChapter(id);
    assert(fs.existsSync(new URL(`../dist/assets/${c.image}`,import.meta.url)),id);
    for(const scene of Object.values(c.scenes)){
      assert(fs.existsSync(new URL(`../dist/assets/${scene.image}`,import.meta.url)),scene.id);
      for(const r of scene.routes)assert(c.scenes[r.target],`${scene.id} to ${r.target}`);
      for(const observation of scene.observations)assert(observation.title&&observation.body);
    }
  }
});
