import { Game, MISSIONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { musicScene } from '../daily_flyer/themes/breach_assets/music-cues.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BreachMusic } from '../daily_flyer/themes/breach_assets/music.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

class FakeParam {
  constructor() { this.value = 0; this.actions = []; }
  setValueAtTime(value, at) { this.value = value; this.actions.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.value = value; this.actions.push(['ramp', value, at]); }
  cancelScheduledValues(at) { this.actions.push(['cancel', at]); }
}
class FakeContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sources = []; this.gains = []; this.decodes = 0; this.resumeCalls = 0; }
  resume() { this.resumeCalls++; return Promise.resolve(); }
  createGain() { const gain = { gain: new FakeParam(), connect() {}, disconnect() { this.disconnected = true; } }; this.gains.push(gain); return gain; }
  createBufferSource() {
    const source = { loop: true, starts: [], stops: [], ended: false,
      connect() {}, disconnect() { this.disconnected = true; },
      start(at) { this.starts.push(at); }, stop(at = 0) { this.stops.push(at); this.endAt = at; },
      finish() { if (this.ended) return; this.ended = true; this.onended?.(); }
    };
    this.sources.push(source); return source;
  }
  decodeAudioData() { this.decodes++; return this.decodePromise || Promise.resolve({ duration: 36.923 }); }
  advance(dt) { this.currentTime += dt; for (const source of this.sources) if (!source.ended && this.currentTime >= source.endAt) source.finish(); }
}
function setup(options = {}) {
  const c = new FakeContext(), calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) }; };
  const m = new BreachMusic({ fetcher, ...options });
  m.attach(c, {}); m.setPlaying(true);
  return { m, c, calls };
}
function tick(m, c, seconds, pressure = 2, extra = {}) {
  const n = Math.ceil(seconds / .25);
  for (let i = 0; i < n; i++) {
    const dt = Math.min(.25, seconds - i * .25);
    c?.advance(dt); m.update({ dt, pressure, ...extra });
  }
}
const bed={key:'facility',cues:['iron-wake','containment-pulse','dry-contact'],level:.9,fade:1.2};
const opening={mission:'blacksite-07',zone:'Arrival bay',opening:'iron-wake',rotation:bed,missionTime:0};
const foundry={mission:'underworks-13',zone:'foundry',rotation:{...bed,key:'foundry',cues:['root-pressure','counterweight']},missionTime:70};
async function startCue(s,scene=opening){tick(s.m,s.c,2,0,{scene});await settle();assert.equal(s.c.sources.length,1);}
async function playFor(s,seconds,scene,extra={}){
  let audible=0,maxVoices=0;
  for(let i=0;i<seconds*4;i++){
    s.c.advance(.25);s.m.update({dt:.25,scene,pressure:0,...extra});await settle();
    if(s.m._sources.size)audible+=.25;maxVoices=Math.max(maxVoices,s.m._sources.size);
  }
  return {audible,maxVoices};
}

test('a fresh mission opens promptly with its authored theme and preloads the next phrase',async()=>{
  const s=setup();await startCue(s);assert.equal(s.m._active.id,'iron-wake');assert.equal(s.c.sources[0].loop,false);
  assert.equal(s.calls.length,2);assert.equal(s.c.resumeCalls,0);
});
test('mission scoring continues for ten minutes with crossfades, bounded memory and no random combat selection',async()=>{
  const s=setup();const result=await playFor(s,600,opening);
  assert.ok(result.audible/600>.98);assert.ok(result.maxVoices<=2);assert.ok(s.c.sources.length>15);assert.ok(s.m._buffers.size<=2);
  const ids=s.calls.map(call=>call.url.pathname.split('/').at(-1));assert.ok(ids.every(id=>['iron-wake.mp3','containment-pulse.mp3','dry-contact.mp3'].includes(id)));
  const active=s.m._active;await playFor(s,2,opening,{pressure:20});assert.equal(s.m._active,active,'ordinary threat counts never restart a phrase');
});
test('crossing ordinary sections preserves the current phrase and uses the latest location at the handoff',async()=>{
  const s=setup();await startCue(s);const first=s.m._active;
  await playFor(s,4,foundry);assert.equal(s.m._active,first);
  const archive={...foundry,zone:'archives',rotation:{...bed,key:'archive',cues:['dead-carrier','lanterns-below']}};
  await playFor(s,40,archive);assert.equal(s.m._active.scope,'underworks-13:archive');assert.ok(archive.rotation.cues.includes(s.m._active.id));
});
test('a dramatic hush expires in the same room, is skipped in combat and never repeats on return',async()=>{
  const s=setup();await startCue(s);
  const quiet={...foundry,quietBeat:{key:'quarters',seconds:8}};
  await playFor(s,2,quiet);assert.equal(s.m._active,null);
  await playFor(s,8,quiet);assert.ok(s.m._active);
  await playFor(s,2,foundry);await playFor(s,2,quiet);assert.ok(s.m._active);
  const fighting=setup();await playFor(fighting,2,quiet,{pressure:2});assert.ok(fighting.m._active);
});
test('danger interrupts a deliberate hush promptly without waiting out its timer',async()=>{
  const s=setup(),quiet={...foundry,quietBeat:{key:'listening',seconds:10}};
  await playFor(s,2,quiet);assert.equal(s.m._active,null);
  await playFor(s,2,quiet,{pressure:2});assert.ok(s.m._active);
});
test('records, power, checkpoints and refuges lower the mix instead of stopping music',async()=>{
  const s=setup();await startCue(s);const cue=s.m._active;
  for(const type of ['power','checkpoint','refuge','transit','enemy-warning']){
    s.m.events([{type}],{id:'local'});assert.equal(s.m._active,cue);assert.equal(cue.mix,.55);
  }
  s.m.events([{type:'record',playerId:'remote'}],{id:'local'});assert.equal(cue.mix,.55);
  s.m.events([{type:'record',playerId:'local'}],{id:'local'});assert.equal(cue.mix,.3);
  await playFor(s,9,opening);assert.equal(cue.mix,1);assert.equal(s.m._active,cue);
});
test('pausing, muting, retries and old saves resume a musical bed without replaying the introduction',async()=>{
  const s=setup();await startCue(s);s.m.setPlaying(false);s.c.advance(1);s.m.setPlaying(true);await playFor(s,2,opening);
  assert.equal(s.m._active.kind,'score');assert.notEqual(s.m._active.id,'iron-wake');
  s.m.configure({enabled:false});s.c.advance(1);s.m.configure({enabled:true});await playFor(s,2,opening);assert.ok(s.m._active);
  s.m.reset({retry:true});await playFor(s,2,opening);assert.equal(s.m._active.kind,'score');
  const restored=setup();restored.m.reset({snapshot:{openingUsed:true,completed:['blacksite-07:facility','blacksite-07:opening']}});
  await playFor(restored,90,opening);assert.ok(restored.c.sources.length>=3,'old played-once flags cannot silence the new score');
});
test('a late co-op join receives the current score without an arrival replay',async()=>{
  const s=setup();await playFor(s,2,{...opening,missionTime:140});assert.equal(s.m._active.kind,'score');
});
test('a boss needs local exposure, sustains music through cover and continues until defeat',async()=>{
  const s=setup();const arena={...foundry,boss:{...bed,key:'warden',cues:['shadow-running','sever-the-echo'],delay:1.5,level:1}};
  await playFor(s,2,arena);assert.equal(s.m._active.kind,'score');
  await playFor(s,2,arena,{guardian:true});assert.equal(s.m._active.id,'shadow-running');assert.equal(s.m._active.kind,'boss');
  const result=await playFor(s,150,arena,{guardian:false});assert.ok(result.audible>148);assert.equal(s.m._active.kind,'boss');
  assert.ok(s.c.sources.length>=5,'boss score does not stop after its first cue');
  await playFor(s,3,{...arena,boss:null});assert.equal(s.m._active.kind,'score');
});
test('a distant teammate fight cannot select the local boss score',async()=>{
  const s=setup();await playFor(s,100,{...foundry,boss:{...bed,key:'boss',cues:['weight-of-stone','crown-circuit']}},{guardian:false});
  assert.equal(s.m._active.kind,'score');assert.ok(s.calls.every(c=>!c.url.pathname.includes('weight-of-stone')));
});
for(const reason of ['pause','map','mute','death','silence','new-context'])test(`stale decoding cannot play after ${reason}`,async()=>{
  const s=setup(),d=deferred();s.c.decodePromise=d.promise;tick(s.m,s.c,2,0,{scene:opening});await settle();assert.equal(s.c.decodes,1);
  if(reason==='pause')s.m.setPlaying(false);
  if(reason==='map')tick(s.m,s.c,.25,0,{scene:opening,blocked:true});
  if(reason==='mute')s.m.configure({enabled:false});
  if(reason==='death')tick(s.m,s.c,.25,0,{scene:opening,alive:false});
  if(reason==='silence')tick(s.m,s.c,.25,0,{scene:{...opening,silence:true}});
  if(reason==='new-context')s.m.attach(new FakeContext(),{});
  d.resolve({duration:30});await settle();assert.equal(s.c.sources.length,0);
});
test('late downloads cannot bring a previous room or boss into a new location',async()=>{
  const s=setup(),d=deferred();s.c.decodePromise=d.promise;tick(s.m,s.c,2,0,{scene:foundry});await settle();
  s.m.update({dt:.25,scene:{...foundry,zone:'archive',rotation:{...bed,key:'archive',cues:['dead-carrier','lanterns-below']}}});
  d.resolve({duration:30});await settle();assert.equal(s.c.sources.length,0);
  await playFor(s,2,{...foundry,zone:'archive',rotation:{...bed,key:'archive',cues:['dead-carrier','lanterns-below']}});assert.equal(s.m._active.id,'dead-carrier');
});
test('all voices stop when a crossfade is paused or muted',async()=>{
  for(const action of ['pause','mute','death']){
    const s=setup();await startCue(s);s.c.advance(s.m._active.endAt-s.c.currentTime-1);s.m.update({dt:.25,scene:opening});await settle();assert.equal(s.m._sources.size,2);
    if(action==='pause')s.m.setPlaying(false);if(action==='mute')s.m.configure({enabled:false});if(action==='death')s.m.update({dt:.25,scene:opening,alive:false});
    s.c.advance(.5);assert.equal(s.m._sources.size,0);
  }
});
test('missing audio is skipped with bounded retries and recovers after connectivity returns',async()=>{
  let calls=0,online=false;
  const s=setup({fetcher:async()=>{calls++;if(!online)throw new Error('offline');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};}});
  await playFor(s,30,foundry);assert.ok(calls<=6,`bounded attempts: ${calls}`);assert.equal(s.m._active,null);
  online=true;await playFor(s,20,foundry);assert.ok(s.m._active);
});
test('native fetch retains its global receiver; preparation stays bounded and never autoplays',async()=>{
  const old=globalThis.fetch;globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});};
  try{const m=new BreachMusic(),c=new FakeContext();m.attach(c,{});const a=m.prepare('iron-wake');assert.equal(a,m.prepare('iron-wake'));await a;await m.prepare('dry-contact');await m.prepare('root-pressure');assert.equal(m._buffers.size,2);assert.equal(c.sources.length,0);m.setPlaying(true);await playFor({m,c},2,opening);assert.equal(c.sources.length,1);}finally{globalThis.fetch=old;}
});
test('save and restore retain rotation order and spent quiet moments',async()=>{
  const s=setup();await playFor(s,50,{...foundry,quietBeat:{key:'quarters',seconds:8}});const saved=s.m.snapshot(),restored=setup();restored.m.reset({snapshot:saved});
  await playFor(restored,2,{...foundry,quietBeat:{key:'quarters',seconds:8}});assert.ok(restored.m._active);assert.notEqual(restored.m._active.id,saved.lastCue);
});
test('menu alternates two complete themes continuously with a quiet crossfade and bounded downloads',async()=>{
  const s=setup();s.m.setPlaying(false);s.m.setMenu(true);s.m.updateMenu();await settle();assert.equal(s.calls.length,0);
  s.m.activateMenu();s.m.updateMenu();await settle();assert.equal(s.c.sources.length,1);
  assert.equal(s.m._active.id,'containment-pulse');
  assert.ok(s.c.gains[0].gain.actions.some(a=>a[0]==='ramp'&&a[1]===.45*.65));
  assert.equal(s.calls.length,2,'next theme is prepared during the first');
  for(let i=0;i<6;i++){
    const outgoing=s.m._active;
    s.c.advance(outgoing.endAt-s.c.currentTime-outgoing.fade+.001);
    s.m.updateMenu();await settle();
    assert.equal(s.m._active.id,i%2?'containment-pulse':'lanterns-below');
    assert.equal(s.c.sources.filter(x=>!x.ended).length,2,'brief menu-only overlap');
    assert.equal(s.c.sources.at(-1).loop,false,'each song plays its full phrase');
    s.c.advance(1.2);assert.equal(s.c.sources.filter(x=>!x.ended).length,1);
  }
  assert.equal(s.calls.length,2);assert.equal(s.m._buffers.size,2);
});
for(const action of ['stop','mute','zero-volume','background','start'])test(`menu crossfade cancels both voices on ${action}`,async()=>{
  const s=setup();s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
  s.c.advance(s.m._active.endAt-1);s.m.updateMenu();await settle();assert.equal(s.m._sources.size,2);
  if(action==='stop')s.m.toggleMenu();
  if(action==='mute')s.m.configure({enabled:false});
  if(action==='zero-volume')s.m.configure({volume:0});
  if(action==='background')s.m.updateMenu({blocked:true});
  if(action==='start')s.m.setPlaying(true);
  assert.equal(s.m._active,null);s.c.advance(.5);assert.equal(s.m._sources.size,0);
  s.m.updateMenu({blocked:action==='background'});await settle();assert.equal(s.c.sources.length,2);
  if(action==='start'){tick(s.m,s.c,2,0,{scene:opening});await settle();assert.equal(s.m._active.id,'iron-wake');assert.equal(s.m._sources.size,1);}
});
test('menu returns after backgrounding and enabling music, but an explicit stop stays stopped',async()=>{
  const s=setup();s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
  s.m.updateMenu({blocked:true});s.c.advance(1);s.m.updateMenu();await settle();assert.equal(s.m._active.id,'lanterns-below');
  s.m.configure({enabled:false});s.c.advance(1);s.m.configure({enabled:true});s.m.updateMenu();await settle();assert.equal(s.m._active.id,'containment-pulse');
  s.m.toggleMenu();s.c.advance(1);s.m.activateMenu();s.m.updateMenu();await settle();assert.equal(s.m._active,null);
  s.m.setMenu(false);s.m.setMenu(true);s.m.updateMenu();await settle();assert.equal(s.m._active,null);
  s.m.toggleMenu();s.m.updateMenu();await settle();assert.equal(s.m._active.id,'containment-pulse');
});
test('failed menu loads retry with a bounded interval and recover when connectivity returns',async()=>{
  let calls=0,online=false;
  const s=setup({fetcher:async()=>{calls++;if(!online)throw new Error('offline');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};}});
  s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();
  for(let i=0;i<100;i++){s.m.updateMenu();await settle();s.c.advance(.1);}
  assert.equal(calls,1);assert.equal(s.m.menuError,true);
  online=true;s.c.advance(6);s.m.updateMenu();await settle();assert.equal(s.m._active.id,'containment-pulse');assert.equal(s.m.menuError,false);
});
test('an iPhone resume gesture restarts an interrupted menu without turning the playlist off',async()=>{
  const s=setup();s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
  s.m.updateMenu({blocked:true});s.c.advance(1);s.c.state='interrupted';s.m.updateMenu();await settle();assert.equal(s.m._active,null);
  s.c.state='running';s.m.toggleMenu({resume:true});s.m.updateMenu();await settle();assert.equal(s.m.menuMuted,false);assert.equal(s.m._active.id,'lanterns-below');
  s.m.toggleMenu();assert.equal(s.m.menuMuted,true,'a normal second tap still stops music');
});
test('menu stop, backgrounding, and starting a level cancel stale menu loading',async()=>{
  for(const action of ['stop','background','start']){
    const s=setup(),d=deferred();s.c.decodePromise=d.promise;s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
    if(action==='stop')s.m.toggleMenu();if(action==='background')s.m.updateMenu({blocked:true});if(action==='start')s.m.setPlaying(true);
    d.resolve({duration:38});await settle();assert.equal(s.c.sources.length,0);
  }
});
test('menu to mission fades cleanly before its opening',async()=>{
  const s=setup();s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
  s.m.reset();assert.equal(s.m._active.kind,'menu','browsing mission briefings preserves menu music');
  s.m.setPlaying(true);tick(s.m,s.c,2,0,{scene:opening});await settle();
  assert.equal(s.c.sources.length,2);assert.equal(s.c.sources.filter(x=>!x.ended).length,1);assert.equal(s.m._active.id,'iron-wake');
});

for(const mission of MISSIONS)test(`${mission.name}: every district stays scored during a complete route`,async t=>{
  const g=new Game({mission:mission.id}),s=setup();g.start();let audible=0,seconds=0,maxVoices=0;
  for(const zone of g.level.zones){
    Object.assign(g.state.player,{x:zone.x1+.5,z:zone.z1+.5});
    const scene=musicScene(g),result=await playFor(s,45,scene);
    audible+=result.audible;seconds+=45;g.state.time+=45;maxVoices=Math.max(maxVoices,result.maxVoices);
    assert.ok(s.m._active,`music must return even when staying in ${scene.zone}`);
  }
  assert.ok(audible/seconds>.93,`route music coverage ${(audible/seconds*100).toFixed(1)}%`);assert.ok(maxVoices<=2);assert.ok(s.m._buffers.size<=2);
  t.diagnostic(`${mission.id}: ${(audible/seconds*100).toFixed(1)}% scored; ${s.c.sources.length} phrases`);
});

test('enabling music after a muted arrival starts the current region score',async()=>{
  const s=setup({enabled:false});await playFor(s,3,opening);assert.equal(s.m._active,null);
  s.m.configure({enabled:true});await playFor(s,2,foundry);assert.equal(s.m._active.kind,'score');assert.equal(s.m._active.id,'root-pressure');
});
test('replacing a closed context removes old voices and resumes the current score',async()=>{
  const s=setup();await startCue(s);s.c.state='closed';const fresh=new FakeContext();s.m.attach(fresh,{});
  await playFor({m:s.m,c:fresh},2,opening);assert.equal(s.m._sources.size,1);assert.equal(s.m._active.kind,'score');assert.equal(s.c.sources[0].onended,null);
});
