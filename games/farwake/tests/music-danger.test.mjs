import test from 'node:test';
import assert from 'node:assert/strict';
import { DANGER_COMPOSITIONS } from '../dist/music-danger.mjs';
import { MUSIC_CUES, scoreEvents, SCORE_MAX_VOICES } from '../dist/music-score.mjs';

// Include the renderer's release tails when judging whether the arrangement
// leaves voice capacity for its melody. The existing playback tests separately
// exercise scheduling, voice culling, node disposal and sample memory.
const releases={piano:.7,guitar:.7,pluck:.28,bell:.8,bass:.14,pad:1.2,organ:.4,bowed:1.3,kick:.05,snare:.06,hat:.035,brush:.08,rim:.035,shimmer:.4};
const peakVoices=score=>{
 const seconds=60/score.bpm,edges=score.events.flatMap(event=>[[event.beat*seconds,1],[(event.beat+event.duration)*seconds+releases[event.instrument],-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 let count=0,peak=0;for(const[,change]of edges){count+=change;peak=Math.max(peak,count);}return peak;
};
const windows=(values,length)=>Array.from({length:Math.max(0,values.length-length+1)},(_,index)=>values.slice(index,index+length).join(','));

test('ten additional danger pieces retain independent identities and cover different kinds of pressure',()=>{
 assert.equal(DANGER_COMPOSITIONS.length,10);
 assert.equal(new Set(DANGER_COMPOSITIONS.map(cue=>cue.id)).size,10);
 const tags=new Set(DANGER_COMPOSITIONS.flatMap(cue=>cue.tags));
 for(const tag of ['pursuit','flight','ground','infantry','boarding','capital','navy','emergency','engineering','escort','defense'])assert.ok(tags.has(tag),tag);
 for(const cue of DANGER_COMPOSITIONS){
  const published=MUSIC_CUES.find(entry=>entry.id===cue.id);assert.ok(published,cue.id);
  assert.equal(cue.family,'combat');assert.equal(published.title,cue.title);assert.equal(published.bpm,cue.bpm);
  assert.ok(published.durationSeconds>=45&&published.durationSeconds<=100,cue.id);
  assert.ok(cue.cooldownSeconds>=published.durationSeconds*2,cue.id);
  assert.ok(!cue.tags.includes('authored-terror'),'combat expansion must not dilute the rare terror cue policy');
 }
 assert.ok(MUSIC_CUES.some(cue=>cue.id==='keep-her-together'),'the original battle piece remains in the catalog');
});

test('every danger piece introduces a tune, develops it, returns to it, and has an authored ending',()=>{
 const melodies=new Set(),rhythms=new Set();
 for(const cue of DANGER_COMPOSITIONS){
  const score=scoreEvents(cue.id),lead=score.events.filter(event=>event.part==='melody');
  assert.ok(lead.length>=28,`${cue.id}: a written melody carries the piece`);
  assert.ok(lead[0].beat*60/score.bpm<1.5,`${cue.id}: an immediate musical gesture establishes urgency`);
  const first=lead.filter(event=>event.beat>=7.9&&event.beat<score.beats*.5).map(event=>event.midi);
  const returning=lead.filter(event=>event.beat>=score.beats*.64&&event.beat<score.beats-7.9).map(event=>event.midi);
  const statements=new Set(windows(first,5));
  assert.ok(windows(returning,5).some(window=>statements.has(window)),`${cue.id}: the later melody recalls its opening statement`);
  assert.ok(lead.some(event=>event.beat>score.beats-12),`${cue.id}: an authored coda follows the return`);
  melodies.add(lead.slice(0,20).map(event=>event.midi).join(','));
  rhythms.add(score.events.filter(event=>event.part==='rhythm'&&event.beat<16).map(event=>`${Math.round(event.beat*4)/4}:${event.instrument}`).join(','));
 }
 assert.equal(melodies.size,10,'the additions are not one melody transposed ten times');
 assert.equal(rhythms.size,10,'different drum phrasing helps the situations sound distinct');
});

test('danger arrangements leave release-tail headroom and begin without a large attack cluster',()=>{
 for(const cue of DANGER_COMPOSITIONS){
  const score=scoreEvents(cue.id,{seed:'pressure-mix-check'}),seconds=60/score.bpm;
  assert.ok(peakVoices(score)<=SCORE_MAX_VOICES,`${cue.id}: no written voice requires culling`);
  assert.ok(score.events.filter(event=>event.beat*seconds<.25).length<=6,`${cue.id}: urgency does not depend on a sudden full-band hit`);
  for(const event of score.events){
   assert.ok(Object.hasOwn(releases,event.instrument),`${cue.id}: instrument ${event.instrument} already exists`);
   assert.ok(event.velocity<=.78,`${cue.id}: weapon effects retain mix space`);
   assert.ok(event.midi>=24&&event.midi<=96&&Number.isInteger(event.midi),cue.id);
  }
 }
});
