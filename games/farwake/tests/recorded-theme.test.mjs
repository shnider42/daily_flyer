import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_THEME, RecordedTheme } from '../dist/recorded-theme.mjs';

class Param {
  constructor() { this.value = 0; this.events = []; }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
  setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); }
}

class Media {
  constructor(src) { this.src = src; this.paused = true; this.ended = false; this.currentTime = 0; this.calls = 0; this.listeners = new Map(); }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  play() { this.calls++; this.paused = false; return this.nextPlay?.() || Promise.resolve(); }
  pause() { this.paused = true; }
}

function boundary() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  globalThis.Audio = Media;
  const ctx = { currentTime: 0, state: 'running', sources: 0,
    createGain() { return { gain: new Param(), connect() {} }; },
    createMediaElementSource(media) { this.sources++; return { media, connect() {} }; },
  };
  const transport = new RecordedTheme(ctx, {});
  return { ctx, transport, restore() {
    transport.suspend();
    if (original) Object.defineProperty(globalThis, 'Audio', original); else delete globalThis.Audio;
  } };
}

const settled = async () => { await Promise.resolve(); await Promise.resolve(); };

test('gesture priming is silent, happens once and reuses the streaming element across sessions', async () => {
  const b = boundary(), t = b.transport;
  try {
    t.unlock(); const media = t.media;
    assert.equal(t.gain.gain.value, 0);
    await settled(); assert.equal(media.paused, true); assert.equal(t.primed, true);
    for (let i = 0; i < 10; i++) t.unlock();
    assert.equal(media.calls, 1, 'Ordinary later clicks never re-prime the title recording.');
    const first = t.createPlayer().play(MENU_THEME.id, { loop: true }); await settled();
    assert.equal(first.status().activeVoices, 1); assert.equal(media.loop, true);
    first.dispose(); assert.equal(media.paused, true);
    const second = t.createPlayer().play(MENU_THEME.id); await settled();
    assert.equal(t.media, media); assert.equal(b.ctx.sources, 1); assert.equal(media.loop, false);
    assert.equal(second.status().activeVoices, 1);
  } finally { b.restore(); }
});

test('a session claimed during pending priming stays playing when the prime resolves', async () => {
  const b = boundary(), t = b.transport; let resolve;
  try {
    t.ensure(); t.media.nextPlay = () => new Promise(done => { resolve = done; });
    t.unlock(); const player = t.createPlayer().play(MENU_THEME.id, { loop: true });
    assert.equal(t.media.calls, 1, 'One pending play request serves the requested theme.');
    resolve(); await settled();
    assert.equal(t.media.paused, false); assert.equal(player.status().activeVoices, 1);
    assert.ok(t.gain.gain.events.some(([kind, value]) => kind === 'ramp' && value === 1));
  } finally { b.restore(); }
});

test('rejected playback waits for another gesture, and does not retry on animation updates', async () => {
  const b = boundary(), t = b.transport;
  try {
    t.ensure(); t.media.nextPlay = () => Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }));
    const player = t.createPlayer().play(MENU_THEME.id); await settled();
    assert.equal(t.blocked, true); assert.equal(player.ended, false); assert.equal(player.status().activeVoices, 0);
    for (let now = 0; now < 60; now++) player.update(now);
    assert.equal(t.media.calls, 1);
    t.media.nextPlay = () => Promise.resolve(); t.unlock(); await settled();
    assert.equal(t.blocked, false); assert.equal(player.status().activeVoices, 1); assert.equal(t.media.calls, 2);
  } finally { b.restore(); }
});

test('fading ends on update and disposal of a retired player cannot stop a newer owner', async () => {
  const b = boundary(), t = b.transport;
  try {
    const first = t.createPlayer().play(MENU_THEME.id); await settled();
    first.stop(2); b.ctx.currentTime = 1; first.update();
    assert.equal(first.playing, true);
    const second = t.createPlayer().play(MENU_THEME.id, { loop: true }); await settled();
    first.dispose(); b.ctx.currentTime = 3; first.update();
    assert.equal(second.playing, true); assert.equal(t.media.paused, false); assert.equal(t.owner, second);
    second.stop(.5); b.ctx.currentTime = 3.6; second.update();
    assert.equal(second.ended, true); assert.equal(t.media.paused, true);
  } finally { b.restore(); }
});

test('suspending pending playback prevents late completion from restarting hidden or abandoned music', async () => {
  const b = boundary(), t = b.transport; let resolve;
  try {
    t.ensure(); t.media.nextPlay = () => new Promise(done => { resolve = done; });
    t.unlock(); const player = t.createPlayer().play(MENU_THEME.id);
    t.suspend(); resolve(); await settled();
    assert.equal(player.ended, true); assert.equal(t.owner, null); assert.equal(t.media.paused, true);
    assert.equal(t.gain.gain.value, 0); assert.equal(t.pending, null);
    t.media.nextPlay = () => Promise.resolve(); t.unlock(); await settled();
    assert.equal(t.primed, true);
    t.suspend(); t.unlock();
    assert.equal(t.media.calls, 2, 'Suspension retains a successfully primed element.');
  } finally { b.restore(); }
});

test('natural endings and media errors remain local and respect session ownership', async () => {
  const b = boundary(), t = b.transport;
  try {
    const first = t.createPlayer().play(MENU_THEME.id); await settled();
    t.media.ended = true; t.media.listeners.get('ended')();
    assert.equal(first.ended, true); assert.equal(t.owner, null);
    t.media.ended = false;
    const second = t.createPlayer().play(MENU_THEME.id); await settled();
    t.media.error = { name: 'DecodeError' };
    assert.doesNotThrow(() => t.media.listeners.get('error')());
    assert.equal(t.blocked, true); assert.equal(second.status().activeVoices, 0);
    second.dispose(); assert.equal(t.owner, null);
  } finally { b.restore(); }
});
