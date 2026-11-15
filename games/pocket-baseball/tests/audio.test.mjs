import test from 'node:test';
import assert from 'node:assert/strict';
import { BallparkAudio } from '../public/audio.mjs';

class Parameter {
  constructor(){this.value=0;this.values=[];}
  setValueAtTime(value){this.values.push(value);this.value=value;}
  linearRampToValueAtTime(value){this.values.push(value);this.value=value;}
  exponentialRampToValueAtTime(value){assert(value>0);this.values.push(value);this.value=value;}
  setTargetAtTime(value){this.values.push(value);this.value=value;}
}
class AudioNode {
  constructor(){for(const key of ['gain','frequency','Q','pan','threshold','knee','ratio','attack','release'])this[key]=new Parameter();this.stops=[];this.starts=[];}
  connect(node){return node;}
  disconnect(){this.disconnected=true;}
  start(...args){this.starts.push(args);}
  stop(at){this.stops.push(at);if(at===undefined)this.onended?.();}
}
class Context {
  constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.buffers=0;this.nodes=[];this.destination=new AudioNode();}
  node(){const n=new AudioNode();this.nodes.push(n);return n;}
  createGain(){return this.node();}createOscillator(){return this.node();}createBufferSource(){return this.node();}
  createBiquadFilter(){return this.node();}createDynamicsCompressor(){return this.node();}createStereoPanner(){return this.node();}
  createBuffer(channels,length){this.buffers++;const data=new Float32Array(length);return {getChannelData:()=>data};}
  async resume(){this.state='running';}async suspend(){this.state='suspended';}
}
function install(t){const previous=globalThis.AudioContext;globalThis.AudioContext=Context;t.after(()=>{if(previous===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=previous;});}

test('effects remain silent until audio is explicitly unlocked', async t=>{
  install(t);const audio=new BallparkAudio();
  audio.event({type:'contact',quality:1});audio.update({time:1,phase:'live'});
  assert.equal(audio.context,null);
  await audio.unlock();audio.event({type:'contact',quality:1});
  assert.equal(audio.context.state,'running');assert(audio.sources.size>3);
});

test('frequent effects reuse two cached noise buffers rather than allocating per impact', async t=>{
  install(t);const audio=new BallparkAudio();await audio.unlock();
  for(let i=0;i<40;i++){audio.context.currentTime+=.2;audio.bat(i/40);audio.glove();audio.footstep();}
  assert.equal(audio.context.buffers,2);assert.equal(audio.noiseBuffers.size,2);
  for(const buffer of audio.noiseBuffers.values())assert(buffer.getChannelData(0).every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
});

test('mute stops ambient and pending effects; restoring audio can resume', async t=>{
  install(t);const audio=new BallparkAudio();await audio.unlock();audio.update({time:1,phase:'ready'});audio.organ();
  assert(audio.ambient);assert(audio.sources.size>1);
  audio.setEnabled(false);assert.equal(audio.sources.size,0);assert.equal(audio.ambient,null);
  const count=audio.context.nodes.length;audio.event({type:'contact'});assert.equal(audio.context.nodes.length,count);
  audio.setEnabled(true);audio.update({time:2,phase:'ready'});assert(audio.ambient);
});

test('pause and menu clear pending sounds and do not schedule footsteps', async t=>{
  install(t);const audio=new BallparkAudio();await audio.unlock();
  const state={time:1,phase:'brawl',brawl:{stage:'charge'}};audio.update(state);audio.crowd(true);
  assert(audio.sources.size>1);audio.update(state,{paused:true});assert.equal(audio.sources.size,0);
  const count=audio.context.nodes.length;audio.update({...state,time:4},{paused:true});assert.equal(audio.context.nodes.length,count);
  audio.update({...state,time:5},{paused:false});assert(audio.sources.size>0);
  audio.update(state,{active:false});assert.equal(audio.sources.size,0);
});

test('crowd calls are rate limited, speech ducks ambience, and fight events remain bounded', async t=>{
  install(t);const audio=new BallparkAudio();await audio.unlock();audio.crowd(true);
  const afterFirst=audio.context.nodes.length;for(let i=0;i<20;i++)audio.crowd(true);assert.equal(audio.context.nodes.length,afterFirst);
  audio.setDucked(true);assert.equal(audio.crowdBus.gain.value,.32);audio.setDucked(false);assert.equal(audio.crowdBus.gain.value,.7);
  for(const event of [{type:'fight-action',action:'jab'},{type:'fight-action',action:'guard'},{type:'fight-action',action:'dodge'},{type:'fight-hit',blocked:false},{type:'fight-hit',blocked:true},{type:'fight-end'}])audio.event(event);
  for(const node of audio.context.nodes)for(const key of ['gain','frequency'])assert(node[key].values.every(Number.isFinite));
  audio.reset();assert.equal(audio.sources.size,0);assert.equal(audio.cooldowns.size,0);
});
