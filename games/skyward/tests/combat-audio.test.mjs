import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightAudio} from '../public/audio.mjs';
import {COMBAT_AUDIO_LIMITS,synthesizeCombatSound,combatCueProfile} from '../public/combat-audio.mjs';

const settings={sound:true,volume:60,effectsVolume:70,engineVolume:60};
const flying={player:{aircraft:'f16',health:100,alive:true,engine:true,speed:250,throttle:1},mission:{aircraft:'f16'}};
class Param{
  constructor(v=0){this.value=v;this.calls=[];}
  setValueAtTime(v,t){this.value=v;this.calls.push(['set',v,t]);}
  setTargetAtTime(v,t,s){this.value=v;this.calls.push(['target',v,t,s]);}
  linearRampToValueAtTime(v,t){this.value=v;this.calls.push(['linear',v,t]);}
  exponentialRampToValueAtTime(v,t){this.value=v;this.calls.push(['exponential',v,t]);}
  cancelScheduledValues(t){this.calls.push(['cancel',t]);}
}
class Node{
  constructor(ctx,type){this.ctx=ctx;this.nodeType=type;this.connections=[];this.disconnected=false;ctx.nodes.push(this);}
  connect(target){this.connections.push(target);return target;}
  disconnect(){this.disconnected=true;this.connections=[];}
  start(at=0){this.startedAt=at;}
  stop(at=0){this.stoppedAt=at;}
}
class Context{
  constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.nodes=[];this.destination={};}
  async resume(){this.state='running';}
  createGain(){return Object.assign(new Node(this,'gain'),{gain:new Param(1)});}
  createDynamicsCompressor(){return Object.assign(new Node(this,'compressor'),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,new Param()])));}
  createOscillator(){return Object.assign(new Node(this,'oscillator'),{frequency:new Param()});}
  createBiquadFilter(){return Object.assign(new Node(this,'filter'),{frequency:new Param(),Q:new Param()});}
  createBufferSource(){return Object.assign(new Node(this,'source'),{playbackRate:new Param(1)});}
  createStereoPanner(){return Object.assign(new Node(this,'panner'),{pan:new Param()});}
  createBuffer(channels,length,rate){const data=new Float32Array(length);return{duration:length/rate,getChannelData:()=>data};}
  advance(seconds){this.currentTime+=seconds;for(const n of this.nodes)if(!n.ended&&Number.isFinite(n.stoppedAt)&&n.stoppedAt<=this.currentTime){n.ended=true;n.onended?.();}}
}
async function withAudio(run,options={}){
  const before=globalThis.AudioContext;globalThis.AudioContext=Context;
  try{const audio=new FlightAudio({...settings,...options});await audio.unlock();audio.setActive(true);await run(audio);}finally{globalThis.AudioContext=before;}
}
const rms=(samples,start,end,rate)=>{let sum=0,count=0;for(let i=Math.floor(start*rate);i<Math.min(samples.length,Math.floor(end*rate));i++){sum+=samples[i]**2;count++;}return Math.sqrt(sum/Math.max(1,count));};

test('combat PCM has a sharp audible midrange strike, a separate blast tail, and no clipped samples',()=>{
  const rate=48000,hit=synthesizeCombatSound('hit',rate),blast=synthesizeCombatSound('explosion',rate),heavy=synthesizeCombatSound('heavyhit',rate);
  assert.deepEqual(hit,synthesizeCombatSound('hit',rate),'the cached asset is deterministic');
  for(const pcm of [hit,heavy,blast]){
    let peak=0,low=0,phone=0,total=0;const a=1-Math.exp(-Math.PI*2*350/rate);
    for(let i=0;i<pcm.length;i++){const v=pcm[i];assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));if(i<rate*.2){low+=(v-low)*a;phone+=(v-low)**2;total+=v*v;}}
    assert.ok(peak>.9&&peak<.95,'source reserves peak headroom');
    assert.ok(phone/total>.2,'impact remains audible above a small speaker’s bass rolloff');
    assert.equal(Math.abs(pcm[0]),0);assert.ok(Math.abs(pcm.at(-1))<.001,'clean attack and release avoid boundary clicks');
  }
  assert.ok(rms(hit,0,.025,rate)>rms(hit,.17,.3,rate)*5,'bullet strike does not become a sustained hiss');
  assert.ok(rms(blast,.5,1.2,rate)>.035,'blast has an audible rolling tail after the initial transient');
  assert.ok(heavy.length>hit.length*2&&blast.length>heavy.length*2,'small strike, heavy strike and detonation have distinct envelopes');
});

test('cue profiles preserve a close impact and attenuate/filter distant blasts without hard panning',()=>{
  const near=combatCueProfile('explosion',{intensity:1,distance:0,pan:100}),far=combatCueProfile('explosion',{intensity:.12,distance:4000});
  assert.ok(near.gain>far.gain*2);assert.ok(near.lowpass>far.lowpass*3);assert.equal(near.pan,.85);
  assert.equal(combatCueProfile('hit',{intensity:.35,weapon:'gun'}).sound,'hit');
  assert.equal(combatCueProfile('hit',{intensity:.35,weapon:'missile'}).sound,'heavyhit');
  assert.equal(combatCueProfile('hit',{intensity:.9}).sound,'heavyhit');
  assert.equal(combatCueProfile('hit',{intensity:0}).gain,0);
});

test('received hits sit above the ambience, pan toward the attacker, duck engines and then recover',async()=>{
  await withAudio(audio=>{
    audio.update(flying,1/60);const before=audio.engine.gain.value;
    audio.cue('hit',{intensity:.45,pan:-.6,weapon:'gun'});
    const voice=[...audio.voices][0];assert.equal(voice.kind,'hit');assert.equal(voice.sources[0].buffer,audio.combatBuffers.hit);
    assert.ok(voice.gain.gain.value>before*3);assert.equal(voice.nodes.find(n=>n.nodeType==='panner').pan.value,-.6);
    assert.ok(audio.ambience.gain.value<.3);assert.ok(audio.effects.connections.includes(audio.master));
    assert.ok(audio.engine.connections.includes(audio.ambience)&&audio.wind.connections.includes(audio.ambience));
    audio.ctx.advance(.7);audio.update(flying,1/60);assert.equal(audio.ambience.gain.value,1);assert.equal(audio.voices.size,0);
    assert.ok(voice.nodes.every(node=>node.disconnected),'all one-shot graph nodes disconnect at the end');
  });
});

test('repeated packets cannot stack an unlimited impact burst and a missile can interrupt a light strike',async()=>{
  await withAudio(audio=>{
    for(let i=0;i<100;i++)audio.cue('hit',{intensity:.3,weapon:'gun'});
    assert.equal(audio.voices.size,1);
    audio.cue('hit',{intensity:.9,weapon:'missile'});assert.equal(audio.voices.size,2);
    assert.equal([...audio.voices].at(-1).sources[0].buffer,audio.combatBuffers.heavyhit);
    audio.ctx.advance(.07);audio.cue('hit',{intensity:.4,weapon:'gun'});assert.equal(audio.voices.size,3);
  });
});

test('holding the trigger does not rate-limit a received hit in the same frame',async()=>{
  await withAudio(audio=>{
    for(let i=0;i<20;i++){audio.ctx.advance(.1);audio.cue('gun');}
    audio.cue('hit',{intensity:.4,weapon:'gun'});
    assert.ok([...audio.voices].some(v=>v.kind==='gun'));
    assert.ok([...audio.voices].some(v=>v.kind==='hit'&&v.at===audio.ctx.currentTime),'damage has a separate limiter and higher voice priority');
    assert.ok(audio.duckLevel<.3);
  });
});

test('the voice ceiling protects damage cues from lower-priority weapons and cleans evictions',async()=>{
  await withAudio(audio=>{
    // Keep the synthetic clock from issuing ended callbacks to exercise the
    // ceiling as if the main thread were busy while many network events arrive.
    for(let i=0;i<COMBAT_AUDIO_LIMITS.voices;i++){audio.ctx.currentTime+=.1;audio.cue('gun');}
    assert.equal(audio.voices.size,COMBAT_AUDIO_LIMITS.voices);const gun=[...audio.voices][0];
    audio.cue('hit',{intensity:.8});assert.equal(audio.voices.size,COMBAT_AUDIO_LIMITS.voices);assert.ok(gun.finished);
    for(let i=0;i<COMBAT_AUDIO_LIMITS.voices;i++){audio.ctx.currentTime+=.1;audio.cue('hit',{intensity:.8});}
    const victims=[...audio.voices];audio.ctx.currentTime+=.1;audio.cue('gun');
    assert.deepEqual([...audio.voices],victims,'new gunfire cannot evict received damage sounds');
    audio.setActive(false);assert.equal(audio.voices.size,0);assert.ok(victims.every(v=>v.nodes.every(n=>n.disconnected)));
  });
});

test('dead airframes stop engine and wind while the fatal blast remains audible',async()=>{
  await withAudio(audio=>{
    audio.update(flying,1/60);assert.ok(audio.engine.gain.value>0);
    audio.update({...flying,player:{...flying.player,health:0,crashed:true,alive:false}},1/60);
    assert.equal(audio.engine.gain.value,0);assert.equal(audio.wind.gain.value,0);
    audio.cue('explosion',{intensity:1});assert.equal(audio.voices.size,1);assert.equal(audio.active,true);
  });
});

test('mute, zero effects, suspended playback and pause create no unwanted one-shots',async()=>{
  await withAudio(audio=>{
    audio.ctx.state='suspended';audio.cue('hit');assert.equal(audio.voices.size,0);audio.ctx.state='running';
    audio.setSettings({...settings,effectsVolume:0});audio.cue('explosion');assert.equal(audio.voices.size,0);assert.equal(audio.duckLevel,1);
    audio.setSettings(settings);audio.cue('success');assert.equal(audio.voices.size,2,'success follow-up uses a scheduled, cancellable audio voice');
    const voices=[...audio.voices];audio.setSettings({...settings,sound:false});assert.equal(audio.voices.size,0);assert.ok(voices.every(v=>v.finished));
    audio.cue('hit');assert.equal(audio.voices.size,0);audio.setSettings(settings);audio.setActive(false);audio.cue('explosion');assert.equal(audio.voices.size,0);
  });
});

test('stereo-panner fallback plays combat through the effects bus',async()=>{
  await withAudio(audio=>{
    audio.ctx.createStereoPanner=undefined;audio.cue('hit',{intensity:.3,pan:1});
    const voice=[...audio.voices][0];assert.ok(voice.gain.connections.includes(audio.effects));
    audio.ctx.advance(1);assert.equal(audio.voices.size,0);
  });
});
