import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPreview } from '../daily_flyer/themes/breach_assets/music-preview.mjs';
import { BreachAudio } from '../daily_flyer/themes/breach_assets/audio.mjs';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup() {
  const sources=[],gains=[],messages=[],output={};
  const context={state:'running',currentTime:5,createBufferSource(){const s={connect(to){this.output=to;},disconnect(){this.disconnected=true;},start(at){this.startAt=at;},stop(at){this.stopAt=at;}};sources.push(s);return s;},createGain(){const g={gain:{values:[],setValueAtTime(v,t){this.values.push([v,t]);},linearRampToValueAtTime(v,t){this.values.push([v,t]);}},connect(to){this.output=to;},disconnect(){this.disconnected=true;}};gains.push(g);return g;}};
  const music={context,prepare:async()=>({duration:38})};
  const preview=new MusicPreview(music);
  const options={context,output,volume:.45,onStatus:m=>messages.push(m)};
  return {preview,context,music,sources,gains,messages,output,options};
}
test('the explicit test uses the actual output and music volume, ends in eight seconds, and never loops',async()=>{
  const s=setup();await s.preview.play(s.options);
  assert.equal(s.sources.length,1);assert.equal(s.gains[0].output,s.output);
  assert.equal(s.sources[0].loop,false);assert.equal(s.sources[0].stopAt-s.sources[0].startAt,8);
  assert.equal(Math.max(...s.gains[0].gain.values.map(v=>v[0])),.45);
  s.sources[0].onended();assert.equal(s.preview.busy,false);assert.match(s.messages.at(-1),/Sample finished/);
});
test('closing settings or resuming during decode cannot produce a late sample',async()=>{
  const s=setup(),d=deferred();s.music.prepare=()=>d.promise;
  const playing=s.preview.play(s.options);await Promise.resolve();s.preview.stop();d.resolve({duration:38});await playing;
  assert.equal(s.sources.length,0);assert.equal(s.preview.busy,false);assert.doesNotMatch(s.messages.at(-1),/^Playing/);
});
test('stopping the sample disconnects its source and gain',async()=>{
  const s=setup();await s.preview.play(s.options);s.preview.stop();
  assert.equal(s.sources[0].disconnected,true);assert.equal(s.gains[0].disconnected,true);assert.equal(s.preview.busy,false);
});
test('an unavailable browser audio context reports a retry instead of pretending to play',async()=>{
  const s=setup();s.context.state='interrupted';await s.preview.play(s.options);
  assert.equal(s.sources.length,0);assert.equal(s.preview.busy,false);assert.match(s.messages.at(-1),/could not start/);
});
test('Start/Resume unlock handles suspended and interrupted contexts synchronously',async()=>{
  for(const state of ['suspended','interrupted','running']){
    const audio=new BreachAudio();let resumes=0;
    audio.context={state,resume(){resumes++;this.state='running';return Promise.resolve();}};
    const ready=audio.unlock();assert.equal(resumes,state==='running'?0:1);await ready;
    assert.equal(audio.context.state,'running');
  }
});
test('muted tests never change preferences or create an audio context',()=>{
  const audio=new BreachAudio(false);let message='';audio.testMusic(m=>message=m);
  assert.equal(audio.context,null);assert.equal(audio.enabled,false);assert.match(message,/Turn on Sound/);
});
test('opening preparation loads one likely cue and cannot autoplay without a usable context',async()=>{
  const audio=new BreachAudio(),game=new Game({mission:'blacksite-07'}),calls=[];
  audio.context={state:'running'};audio.music.prepare=async id=>calls.push(id);
  audio.setPlaying(true);
  for(let i=0;i<100;i++)audio.updateMusic(game,.1);
  assert.deepEqual(calls,['iron-wake']);assert.equal(audio.music._active,null);
  const muted=new BreachAudio(false);muted.context={state:'running'};muted.music.prepare=async()=>assert.fail('muted prefetch');muted.setPlaying(true);muted.updateMusic(game,.1);
});
