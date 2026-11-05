// Run with: node --test tests/audio.test.mjs
// Checks scheduling and lifecycle contracts. Audible quality still needs browser QA.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Sound} from '../dist/audio.mjs';

class MockParam{
  constructor(value=0){this.value=value;this.events=[];}
  schedule(kind,value,time){
    assert(Number.isFinite(value));
    assert(Number.isFinite(time));
    this.value=value;
    this.events.push({kind,value,time});
    return this;
  }
  setValueAtTime(v,t){return this.schedule('set',v,t);}
  setTargetAtTime(v,t){return this.schedule('target',v,t);}
  exponentialRampToValueAtTime(v,t){assert(v>0);return this.schedule('exp',v,t);}
  linearRampToValueAtTime(v,t){return this.schedule('linear',v,t);}
  cancelScheduledValues(t){this.events=this.events.filter(e=>e.time<t);}
}

class MockNode{
  constructor(ctx){
    this.ctx=ctx;
    this.gain=new MockParam(1);
    this.frequency=new MockParam(440);
    this.Q=new MockParam(1);
    this.pan=new MockParam();
    this.threshold=new MockParam();
    this.knee=new MockParam();
    this.ratio=new MockParam();
    this.connections=[];
  }
  connect(node){this.connections.push(node);}
  disconnect(){this.disconnected=true;this.connections=[];}
  start(){this.ctx.sources.push(this);}
  stop(at=this.ctx.currentTime){this.stopAt=at;}
}

class MockAudioContext{
  constructor(){
    this.state='running';
    this.currentTime=0;
    this.sampleRate=8000;
    this.sources=[];
    this.destination={};
  }
  createGain(){return new MockNode(this);}
  createDynamicsCompressor(){return new MockNode(this);}
  createOscillator(){return new MockNode(this);}
  createBufferSource(){return new MockNode(this);}
  createBiquadFilter(){return new MockNode(this);}
  createStereoPanner(){return new MockNode(this);}
  createBuffer(channels,length){
    const data=new Float32Array(length);
    return {getChannelData:()=>data};
  }
  resume(){this.state='running';return Promise.resolve();}
  advance(dt){
    this.currentTime+=dt;
    for(const n of this.sources){
      if(n.stopAt<=this.currentTime&&!n.ended){n.ended=true;n.onended?.();}
    }
  }
}

const makeState=(level,phase='explore')=>({
  level,phase,status:'playing',time:0,phaseTime:0,choices:0,
  chasing:false,stare:0,step:0,moving:0,transition:null,
});

async function soundFor(state){
  const old=globalThis.AudioContext;
  globalThis.AudioContext=MockAudioContext;
  try{
    const audio=new Sound();
    audio.reset(state);
    await audio.unlock();
    return audio;
  }finally{
    if(old===undefined)delete globalThis.AudioContext;
    else globalThis.AudioContext=old;
  }
}

const voices=(audio,tag)=>[...audio.nodes].filter(v=>!tag||v.tag===tag);
const envelopePeak=audio=>Math.max(...voices(audio,'whisper').flatMap(v=>v.gain.gain.events.map(e=>e.value)));

test('chapter reset cancels previous sounds, silence beds, and retains the new state identity',async()=>{
  const first=makeState(1),audio=await soundFor(first);
  audio.update(first,.016);
  audio.event('distant',first);
  const previous=voices(audio);
  assert(previous.length>0);
  const second=makeState(2);
  audio.reset(second);
  assert.equal(audio.nodes.size,0);
  assert(previous.every(v=>v.cleaned&&v.source.disconnected&&v.source.stopAt===audio.ctx.currentTime));
  assert.equal(audio.hum.gain.value,0);
  assert.equal(audio.air.gain.value,0);
  assert.equal(audio.state,second);
  audio.event('pickup',second);
  const pickup=voices(audio);
  audio.update(second,.016);
  assert(pickup.every(v=>!v.cleaned),'first update must not erase events after an explicit reset');
});

test('new state detection cleans up even without an explicit reset',async()=>{
  const first=makeState(2),audio=await soundFor(first);
  first.chasing=true;
  audio.event('screech',first);
  const previous=voices(audio);
  audio.update(makeState(2),.016);
  assert(previous.every(v=>v.cleaned));
  assert.equal(audio.nodes.size,0);
});

test('the yellow floor stays hum-only before pursuit, with no delayed phantom footstep',async()=>{
  const state=makeState(2),audio=await soundFor(state);
  state.step=12;
  state.moving=2.8;
  audio.update(state,.016);
  audio.event('pulse',state);
  audio.event('distant',state);
  assert.equal(audio.nodes.size,0);
  assert.equal(audio.air.gain.value,0);
  assert(audio.hum.gain.value>0);
  state.chasing=true;
  state.moving=0;
  audio.event('screech',state);
  audio.update(state,.016);
  assert(audio.nodes.size>0);
  assert.equal(voices(audio,'footstep').length,0);
});

test('garden tones start once and cease at blackout',async()=>{
  const state=makeState(3,'garden'),audio=await soundFor(state);
  audio.update(state,.016);
  const chord=voices(audio,'garden');
  assert(chord.length>0);
  audio.update(state,.016);
  assert.deepEqual(voices(audio,'garden'),chord);
  state.phase='blackout';
  audio.event('cut',state);
  audio.update(state,.016);
  assert.equal(voices(audio,'garden').length,0);
  assert(chord.every(v=>v.cleaned));
  assert.equal(audio.hum.gain.value,0);
  assert.equal(audio.air.gain.value,0);
});

test('door whispers begin after the third choice, grow louder, and fade during eye contact',async()=>{
  const state=makeState(3,'doors'),audio=await soundFor(state);
  state.choices=2;
  for(let i=0;i<50;i++)audio.update(state,.1);
  assert.equal(voices(audio,'whisper').length,0);
  state.choices=3;
  for(let i=0;i<7;i++)audio.update(state,.1);
  assert(voices(audio,'whisper').length>0);
  const earlyPeak=envelopePeak(audio);
  audio.ctx.advance(3);
  state.choices=6;
  for(let i=0;i<7;i++)audio.update(state,.1);
  assert(envelopePeak(audio)>earlyPeak);
  const oldWhispers=voices(audio,'whisper');
  state.phase='ghost';
  audio.event('ghost',state);
  assert(oldWhispers.every(v=>v.cleaned),'the final hallway replaces earlier room whispers');
  assert(voices(audio,'whisper').length>0);
  state.stare=2.25;
  audio.update(state,.016);
  assert.equal(audio.whispers.gain.value,.5);
  state.stare=4.5;
  audio.update(state,.016);
  assert.equal(audio.whispers.gain.value,0);
});

test('ended sources release their graph and paused or suspended audio cannot queue stale cues',async()=>{
  const state=makeState(3,'ghost'),audio=await soundFor(state);
  audio.event('ghost',state);
  const old=voices(audio);
  audio.ctx.advance(4);
  assert.equal(audio.nodes.size,0);
  assert(old.every(v=>v.nodes.every(node=>node.disconnected)));
  audio.setPaused(true);
  audio.event('ghost',state);
  assert.equal(audio.nodes.size,0);
  audio.setPaused(false);
  audio.ctx.state='suspended';
  audio.update(state,.1);
  audio.event('ghost',state);
  assert.equal(audio.nodes.size,0);
  await audio.unlock();
  audio.event('ghost',state);
  assert(audio.nodes.size>0);
});

test('devices without a stereo panner use mono output and reset remains safe',async()=>{
  const state=makeState(3,'ghost'),audio=await soundFor(state);
  audio.ctx.createStereoPanner=undefined;
  audio.event('pulse',state);
  assert(audio.nodes.size>0);
  audio.reset();
  assert.equal(audio.nodes.size,0);
  assert.equal(audio.state,null);
});
