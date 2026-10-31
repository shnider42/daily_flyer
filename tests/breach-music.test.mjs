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
const opening={mission:'blacksite-07',zone:'Arrival bay',opening:'iron-wake',missionTime:0};
const foundry={mission:'underworks-13',zone:'foundry',section:{key:'foundry',cue:'root-pressure',delay:2,window:30,gap:25},missionTime:70};
async function startCue(s,scene=opening){tick(s.m,s.c,2,0,{scene});await settle();assert.equal(s.c.sources.length,1);}

test('opening music is fixed and starts without enemies after a brief fade-in delay',async()=>{
  const s=setup();tick(s.m,s.c,1.5,0,{scene:opening});await settle();assert.equal(s.calls.length,0);
  tick(s.m,s.c,.25,0,{scene:opening});await settle();assert.match(s.calls[0].url.pathname,/iron-wake/);
  assert.equal(s.c.sources[0].loop,false);assert.equal(s.c.resumeCalls,0);
});
test('enemy counts alone never trigger or choose music',async()=>{
  const s=setup();for(const pressure of [0,1,3,10]){tick(s.m,s.c,60,pressure,{scene:{mission:'hollow-19',zone:'wards',missionTime:90}});await settle();}
  assert.equal(s.calls.length,0);
});
test('a section has one fixed cue and does not switch when enemies disappear',async()=>{
  const s=setup();tick(s.m,s.c,2.5,3,{scene:foundry});await settle();assert.match(s.calls[0].url.pathname,/root-pressure/);
  tick(s.m,s.c,8,0,{scene:foundry});assert.notEqual(s.m._active,null);
  tick(s.m,s.c,100,0,{scene:foundry});await settle();assert.equal(s.c.sources.length,1);
});
test('moving through unscored corridors lets a written phrase finish; a silent sector fades it',async()=>{
  const s=setup();await startCue(s);tick(s.m,s.c,4,0,{scene:{...opening,zone:'Service passage'}});assert.ok(s.m._active);
  tick(s.m,s.c,.25,0,{scene:{...opening,zone:'Extraction bay',silence:true}});assert.equal(s.m._active,null);
  assert.ok(s.c.sources[0].endAt-s.c.currentTime<.31);
});
test('quickly crossing a section never schedules a late track or doorway replay',async()=>{
  const s=setup();tick(s.m,s.c,1,0,{scene:foundry});tick(s.m,s.c,3,0,{scene:{mission:'underworks-13',zone:'hall'}});
  tick(s.m,s.c,40,0,{scene:foundry});await settle();assert.equal(s.calls.length,0);
});
test('an opening occupies the moment; a section encountered under it is not queued',async()=>{
  const s=setup();await startCue(s);tick(s.m,s.c,60,0,{scene:foundry});await settle();assert.equal(s.calls.length,1);
});
test('separate later sections can play after the silence budget, but never overlap',async()=>{
  const s=setup();await startCue(s);tick(s.m,s.c,70,0,{scene:{...opening,opening:null}});
  tick(s.m,s.c,2.5,0,{scene:foundry});await settle();assert.equal(s.c.sources.length,2);
  assert.equal(s.c.sources.filter(x=>!x.ended).length,1);
});
for(const reason of ['pause','map','mute','death','silence','new-context'])test(`stale decoding cannot play an opening after ${reason}`,async()=>{
  const s=setup(),d=deferred();s.c.decodePromise=d.promise;tick(s.m,s.c,2,0,{scene:opening});await settle();assert.equal(s.c.decodes,1);
  if(reason==='pause')s.m.setPlaying(false);
  if(reason==='map')tick(s.m,s.c,.25,0,{scene:opening,blocked:true});
  if(reason==='mute')s.m.configure({enabled:false});
  if(reason==='death')tick(s.m,s.c,.25,0,{scene:opening,alive:false});
  if(reason==='silence')tick(s.m,s.c,.25,0,{scene:{...opening,silence:true}});
  if(reason==='new-context')s.m.attach(new FakeContext(),{});
  d.resolve({duration:30});await settle();assert.equal(s.c.sources.length,0);assert.equal(s.m.cooldownUntil,0);
});
test('stale section loads are retained for explicit tests but cannot follow the player',async()=>{
  const s=setup(),d=deferred();s.c.decodePromise=d.promise;tick(s.m,s.c,2.5,0,{scene:foundry});await settle();
  tick(s.m,s.c,.25,0,{scene:{mission:'underworks-13',zone:'hall'}});d.resolve({duration:30});await settle();
  assert.equal(s.c.sources.length,0);assert.equal(s.m._buffers.size,1);assert.equal(s.m._pending,null);
});
test('loading an opening after its moment expires never backfills it',async()=>{
  const s=setup(),d=deferred();s.c.decodePromise=d.promise;tick(s.m,s.c,2,0,{scene:opening});await settle();
  tick(s.m,s.c,30,0,{scene:opening});d.resolve({duration:30});await settle();assert.equal(s.c.sources.length,0);
});
test('guardians require local exposure in their authored arena; they cannot summon music elsewhere',async()=>{
  const scene={...foundry,zone:'reactor',section:{...foundry.section,key:'guardian',cue:'weight-of-stone',guardian:true,delay:8}};
  const s=setup();tick(s.m,s.c,4,3,{scene,guardian:true});tick(s.m,s.c,.25,0,{scene,guardian:false});
  tick(s.m,s.c,7.75,3,{scene,guardian:true});await settle();assert.equal(s.calls.length,0);
  tick(s.m,s.c,.25,3,{scene,guardian:true});await settle();assert.match(s.calls[0].url.pathname,/weight-of-stone/);
});
test('horror spaces have fixed quiet cues and yield to danger',async()=>{
  const s=setup(),scene={mission:'hollow-19',zone:'listening',missionTime:100,section:{key:'listening',cue:'below-the-carrier',quiet:true,delay:4,window:30,gap:60}};
  tick(s.m,s.c,4.5,0,{scene});await settle();assert.equal(s.c.sources.length,1);
  tick(s.m,s.c,.25,1,{scene});assert.equal(s.m._active,null);assert.ok(s.m.cooldownUntil>=s.m.time+60);
});
test('records stop music, while local attack warnings duck it briefly',async()=>{
  const s=setup();await startCue(s);s.m.events([{type:'enemy-warning',x:1,z:1}],{x:0,z:0});assert.equal(s.c.gains[0].gain.value,.45*.25);
  tick(s.m,s.c,1.5,0,{scene:opening});assert.equal(s.c.gains[0].gain.value,.45);
  s.m.events([{type:'record',playerId:'remote'}],{id:'local'});assert.ok(s.m._active);
  s.m.events([{type:'record',playerId:'local'}],{id:'local'});assert.equal(s.m._active,null);
});
test('pause, retry and restored saves do not repeat introductions or already visited passages',async()=>{
  const s=setup();await startCue(s);s.m.setPlaying(false);s.m.setPlaying(true);tick(s.m,s.c,80,0,{scene:opening});await settle();assert.equal(s.c.sources.length,1);
  const memory=s.m.snapshot();s.m.reset({retry:true});tick(s.m,s.c,80,0,{scene:opening});await settle();assert.equal(s.c.sources.length,1);
  const fresh=setup();fresh.m.reset({snapshot:memory});tick(fresh.m,fresh.c,80,0,{scene:opening});await settle();assert.equal(fresh.c.sources.length,0);
});
test('continuing an older save or joining co-op late does not restart the level introduction',async()=>{
  const s=setup();tick(s.m,s.c,30,0,{scene:{...opening,missionTime:40}});await settle();assert.equal(s.calls.length,0);
});
test('muted openings are consumed rather than sprung on the listener when enabling music later',async()=>{
  const s=setup({enabled:false});tick(s.m,s.c,3,0,{scene:opening});s.m.configure({enabled:true});tick(s.m,s.c,20,0,{scene:opening});await settle();assert.equal(s.calls.length,0);
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
  assert.equal(s.calls.length,2);assert.equal(s.m._buffers.size,2);assert.equal(s.m.cooldownUntil,0);
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
test('menu stop, backgrounding, and starting a level cancel stale menu loading',async()=>{
  for(const action of ['stop','background','start']){
    const s=setup(),d=deferred();s.c.decodePromise=d.promise;s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
    if(action==='stop')s.m.toggleMenu();if(action==='background')s.m.updateMenu({blocked:true});if(action==='start')s.m.setPlaying(true);
    d.resolve({duration:38});await settle();assert.equal(s.c.sources.length,0);
  }
});
test('menu to mission fades without overlap or a menu-imposed opening cooldown',async()=>{
  const s=setup();s.m.setPlaying(false);s.m.setMenu(true);s.m.activateMenu();s.m.updateMenu();await settle();
  s.m.reset();assert.equal(s.m._active.kind,'menu','browsing mission briefings preserves menu music');
  s.m.setPlaying(true);tick(s.m,s.c,2,0,{scene:opening});await settle();
  assert.equal(s.c.sources.length,2);assert.equal(s.c.sources.filter(x=>!x.ended).length,1);assert.equal(s.m._active.id,'iron-wake');
});
test('preparation is bounded, shares requests and cannot autoplay',async()=>{
  const s=setup(),a=s.m.prepare('iron-wake'),b=s.m.prepare('iron-wake');assert.equal(a,b);await a;
  await s.m.prepare('dry-contact');await s.m.prepare('root-pressure');assert.equal(s.m._buffers.size,2);assert.equal(s.c.sources.length,0);
});
test('cleanup from a previous mission cannot silence a new mission section',async()=>{
  const s=setup();await startCue(s);s.m.setPlaying(false);s.m.reset();s.m.setPlaying(true);
  tick(s.m,s.c,2.5,0,{scene:foundry});await settle();
  assert.equal(s.m._active?.id,'root-pressure');assert.equal(s.m.cooldownUntil,0);
  assert.equal(s.c.sources.filter(x=>!x.ended).length,1);
});
test('failed loading is not retried continuously in the same room',async()=>{
  let calls=0;const s=setup({fetcher:async()=>{calls++;throw new Error('offline');}});tick(s.m,s.c,3,0,{scene:foundry});await settle();tick(s.m,s.c,120,0,{scene:foundry});await settle();assert.equal(calls,1);
});
test('native browser fetch keeps its global receiver through actual cue playback',async()=>{
  const old=globalThis.fetch;globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});};
  try{const m=new BreachMusic(),c=new FakeContext();m.attach(c,{});m.setPlaying(true);tick(m,c,2,0,{scene:opening});await settle();assert.equal(c.sources.length,1);}finally{globalThis.fetch=old;}
});
test('replacing a closed context cleans up sources and permits a new run',async()=>{
  const s=setup();await startCue(s);s.c.state='closed';const fresh=new FakeContext();s.m.attach(fresh,{});s.m.reset();tick(s.m,fresh,2,0,{scene:opening});await settle();assert.equal(s.m._sources.size,1);assert.equal(fresh.sources.length,1);
});

test('Shadow opening keeps its full phrase and fades into a deliberate silent room',async()=>{
 const s=setup();s.c.decodeAudioData=async()=>({duration:42.94});
 const scene={mission:'beneath-the-shadow',zone:'descent',opening:'shadow-running',openingFade:1.4,missionTime:0};
 await startCue(s,scene);const source=s.c.sources[0];assert.equal(source.endAt-source.starts[0],42.94);
 assert.ok(s.c.gains[0].gain.actions.some(a=>a[0]==='ramp'&&a[1]===0&&a[2]===source.endAt));
 tick(s.m,s.c,.25,0,{scene:{...scene,zone:'gantry',silence:true}});assert.equal(s.m._active,null);assert.ok(Math.abs(source.endAt-s.c.currentTime-1.4)<.001);
});
test('Shadow bosses can take over a fading passage without overlapping or losing their slot before exposure',async()=>{
 const s=setup();const scene={mission:'beneath-the-shadow',zone:'lantern',missionTime:50,section:{key:'lantern',cue:'lanterns-below',delay:2,window:30,gap:18,fade:2}};
 await startCue(s,{...scene,section:{...scene.section,delay:1}});
 const boss={...scene,zone:'hydra',section:{key:'hydra',cue:'sever-the-echo',guardian:true,priority:true,delay:3,window:120,gap:15,fade:2}};
 tick(s.m,s.c,5,0,{scene:boss,guardian:false});assert.ok(!s.m.completed.has('beneath-the-shadow:hydra'));
 tick(s.m,s.c,3.5,2,{scene:boss,guardian:true});await settle();assert.equal(s.m._active.id,'sever-the-echo');assert.equal(s.c.sources.filter(x=>!x.ended).length,1);
 tick(s.m,s.c,120,2,{scene:boss,guardian:true});await settle();assert.equal(s.c.sources.length,2,'no boss loop or doorway repeat');
});
