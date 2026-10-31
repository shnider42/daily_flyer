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
async function startCue(state) { tick(state.m, state.c, 20.5); await settle(); assert.equal(state.c.sources.length, 1); }

test('music is lazy, starts after grace plus sustained pressure, and uses only its local cue', async () => {
  const s = setup();
  assert.equal(s.calls.length, 0);
  tick(s.m, s.c, 30, 1); await settle(); assert.equal(s.calls.length, 0, 'one ordinary visible enemy is not enough');
  tick(s.m, s.c, 2.25, 2); await settle(); assert.equal(s.calls.length, 0);
  tick(s.m, s.c, .25, 2); await settle();
  assert.equal(s.calls.length, 1); assert.equal(s.c.sources.length, 1);
  assert.equal(s.calls[0].url.pathname.endsWith('/music/containment-pulse.mp3'), true);
  assert.equal(s.calls[0].init.mode, 'same-origin');
  assert.equal(s.c.resumeCalls, 0, 'only the existing sound system may unlock audio');
});

test('initial combat receives eighteen seconds of silence before the pressure hold', async () => {
  const s = setup(); tick(s.m, s.c, 18); await settle(); assert.equal(s.calls.length, 0);
  tick(s.m, s.c, 2.25); await settle(); assert.equal(s.calls.length, 0);
  tick(s.m, s.c, .25); await settle(); assert.equal(s.calls.length, 1);
  assert.equal(s.c.sources[0].loop, false);
  assert.equal(s.c.sources[0].endAt - s.c.sources[0].starts[0], 36.923);
  const ramp = s.c.gains[0].gain.actions.find(a => a[0] === 'ramp');
  assert.equal(ramp[1], .45); assert.ok(Math.abs(ramp[2] - s.c.currentTime - .8) < 1e-8);
});

test('brief pressure spikes and a single stale long frame cannot trigger combat music', async () => {
  const s = setup(); tick(s.m, s.c, 20, 0);
  for (let i = 0; i < 5; i++) { tick(s.m, s.c, 2, 2); tick(s.m, s.c, .25, 0); }
  s.m.update({ dt: 900, pressure: 3 }); await settle(); assert.equal(s.calls.length, 0);
});

test('a natural cue ends once; continuous combat never rearms or overlaps it', async () => {
  const s = setup(); await startCue(s);
  tick(s.m, s.c, 40); assert.equal(s.c.sources[0].ended, true);
  assert.equal(s.m._active, null);
  tick(s.m, s.c, 180); await settle(); assert.equal(s.c.sources.length, 1, 'cooldown alone is not permission to replay');
  tick(s.m, s.c, 5, 0); tick(s.m, s.c, 2.5, 2); await settle();
  assert.equal(s.c.sources.length, 2); assert.equal(s.calls.length, 1, 'decoded audio is reused');
  assert.equal(s.c.sources.filter(x => !x.ended).length, 1);
});

test('five seconds quiet fades out, while another encounter must wait two minutes', async () => {
  const s = setup(); await startCue(s);
  tick(s.m, s.c, 4.75, 0); assert.notEqual(s.m._active, null);
  tick(s.m, s.c, .25, 0); assert.equal(s.m._active, null);
  const first = s.c.sources[0]; assert.ok(Math.abs(first.endAt - s.c.currentTime - .3) < 1e-8);
  tick(s.m, s.c, 110, 2); await settle(); assert.equal(s.c.sources.length, 1);
  tick(s.m, s.c, 11, 2); await settle(); assert.equal(s.c.sources.length, 2);
});

test('pause/map toggles stop the cue and cannot bypass cooldown; resume never resumes the old source', async () => {
  const s = setup(); await startCue(s);
  s.m.setPlaying(false); assert.equal(s.m._active, null);
  tick(s.m, s.c, 1, 0); const gameTime = s.m.time;
  s.m.setPlaying(true); tick(s.m, s.c, 5, 0); tick(s.m, s.c, 3, 3); await settle();
  assert.equal(s.c.sources.length, 1); assert.equal(s.c.sources[0].starts.length, 1);
  assert.ok(s.m.cooldownUntil >= gameTime + 119);
  assert.equal(s.m.time, gameTime + 8);
});

test('death and blocked frames gate playback even when a caller has not yet toggled playing', async () => {
  for (const extra of [{ alive: false }, { blocked: true }]) {
    const s = setup(); await startCue(s); tick(s.m, s.c, .25, 3, extra);
    assert.equal(s.m._active, null); assert.equal(s.m.time, 20.5);
    tick(s.m, s.c, 5, 3, extra); await settle(); assert.equal(s.c.sources.length, 1);
  }
});

test('nearby warnings duck briefly; remote combat does not mask local sound', async () => {
  const s = setup(); await startCue(s); const param = s.c.gains[0].gain;
  s.m.events([{ type: 'explosion', x: 100, z: 100 }], { x: 0, z: 0 }); assert.equal(param.value, .45);
  s.m.events([{ type: 'enemy-warning', x: 1, z: 1 }], { x: 0, z: 0 }); assert.equal(param.value, .45 * .25);
  tick(s.m, s.c, 1, 2); assert.equal(param.value, .45 * .25);
  tick(s.m, s.c, .25, 2); assert.equal(param.value, .45);
  s.m.configure({ volume: .2 }); assert.equal(param.value, .2);
});

test('records and noncombat landmarks silence music and suppress new cues for their reading window', async () => {
  for (const [type, seconds] of [['record', 12], ['refuge', 8], ['transit', 8], ['transit-activated', 8], ['checkpoint', 8], ['relay', 8], ['power', 8]]) {
    const s = setup(); tick(s.m, s.c, 20, 0);
    s.m.events([{ type }]); assert.equal(s.m.suppressedUntil, s.m.time + seconds);
    tick(s.m, s.c, seconds + 2.25, 2); await settle(); assert.equal(s.calls.length, 0, type);
    tick(s.m, s.c, .25, 2); await settle(); assert.equal(s.calls.length, 1, type);
    s.m.events([{ type }]); assert.equal(s.m._active, null, type);
  }
});

test('another player reading a tape does not silence the local player', async () => {
  const s = setup(); await startCue(s);
  s.m.events([{ type: 'record', playerId: 'partner' }], { id: 'local', x: 0, z: 0 });
  assert.notEqual(s.m._active, null);
  s.m.events([{ type: 'record', playerId: 'local' }], { id: 'local', x: 0, z: 0 });
  assert.equal(s.m._active, null);
});

for (const interrupt of ['pause', 'mute', 'zero-volume', 'reset', 'quiet', 'blocked', 'death', 'new-context']) {
  test(`a stale decode cannot start music after ${interrupt}, including after another unlock`, async () => {
    const s = setup(), decoding = deferred(); s.c.decodePromise = decoding.promise;
    tick(s.m, s.c, 20.5); await settle(); assert.equal(s.c.decodes, 1);
    if (interrupt === 'pause') s.m.setPlaying(false);
    if (interrupt === 'mute') s.m.configure({ enabled: false });
    if (interrupt === 'zero-volume') s.m.configure({ volume: 0 });
    if (interrupt === 'reset') s.m.reset();
    if (interrupt === 'quiet') tick(s.m, s.c, .25, 0);
    if (interrupt === 'blocked') tick(s.m, s.c, .25, 3, { blocked: true });
    if (interrupt === 'death') tick(s.m, s.c, .25, 3, { alive: false });
    const replacement = interrupt === 'new-context' ? new FakeContext() : s.c;
    s.m.attach(replacement, {}); s.m.configure({ enabled: true, volume: .45 }); s.m.setPlaying(true);
    decoding.resolve({ duration: 36.923 }); await settle();
    assert.equal(s.c.sources.length, 0); assert.equal(replacement.sources.length, 0);
    tick(s.m, replacement, 5, 0); tick(s.m, replacement, 3, 3); await settle();
    assert.equal(replacement.sources.length, 0, 'stale work also cannot bypass cooldown');
  });
}

test('pending fetch is cancelled too; quiet combat disappearance cannot resurrect it', async () => {
  const loading = deferred(), s = setup({ fetcher: () => loading.promise });
  tick(s.m, s.c, 20.5); await settle(); assert.notEqual(s.m._pending, null);
  tick(s.m, s.c, .25, 0); loading.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }); await settle();
  assert.equal(s.c.decodes, 0); assert.equal(s.c.sources.length, 0); assert.equal(s.m._pending, null);
});

test('failed downloads have bounded retries after cooldown and a new encounter', async () => {
  let calls = 0; const s = setup({ fetcher: async () => { calls++; throw new Error('offline'); } });
  tick(s.m, s.c, 20.5); await settle(); assert.equal(calls, 1);
  tick(s.m, s.c, 180); await settle(); assert.equal(calls, 1, 'continuous pressure never hammers a failed file');
  tick(s.m, s.c, 5, 0); tick(s.m, s.c, 2.5, 2); await settle(); assert.equal(calls, 2);
});

test('missing, suspended, broken, or closed audio and missing fetch leave gameplay available', async () => {
  const m = new BreachMusic({ fetcher: null }); m.setPlaying(true);
  assert.doesNotThrow(() => tick(m, null, 30, 3));
  const s = setup(); s.c.state = 'suspended'; tick(s.m, s.c, 30, 3); await settle(); assert.equal(s.calls.length, 0); assert.equal(s.c.resumeCalls, 0);
  s.c.state = 'running'; tick(s.m, s.c, .25, 3); await settle(); assert.equal(s.c.sources.length, 1);
  s.c.state = 'closed'; assert.doesNotThrow(() => tick(s.m, s.c, .25, 3)); assert.equal(s.m._active, null);
  const broken = setup(); broken.c.createGain = () => { throw new Error('audio exhausted'); };
  assert.doesNotThrow(() => tick(broken.m, broken.c, 21, 3)); await settle(); assert.equal(broken.m._active, null);
});

test('reset grants a new quiet opening but preserves the session cooldown', async () => {
  const s = setup(); await startCue(s); s.m.reset();
  assert.equal(s.m.graceUntil, s.m.time + 18);
  const cooldown = s.m.cooldownUntil;
  s.m.reset(); assert.equal(s.m.cooldownUntil, cooldown);
  tick(s.m, s.c, 5, 0); tick(s.m, s.c, 30, 3); await settle(); assert.equal(s.c.sources.length, 1);
});


test('a replaced closed context cannot retain an old source or obstruct a later encounter', async () => {
  const s = setup(); await startCue(s); s.c.state = 'closed';
  tick(s.m, s.c, .25, 3);
  const fresh = new FakeContext(); s.m.attach(fresh, {});
  assert.equal(s.m._sources.size, 0);
  tick(s.m, fresh, 121, 0); tick(s.m, fresh, 2.5, 3); await settle();
  assert.equal(fresh.sources.length, 1);
});


test('the single pass preserves the supplied cue release tail', async () => {
  const s = setup(); s.c.decodePromise = Promise.resolve({ duration: 38.765 });
  await startCue(s);
  assert.ok(Math.abs(s.c.sources[0].endAt - s.c.sources[0].starts[0] - 38.765) < 1e-8);
  assert.equal(s.c.sources[0].loop, false);
});
