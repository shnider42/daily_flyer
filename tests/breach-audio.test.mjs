import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../daily_flyer/themes/breach_assets/core.mjs';
import { BreachAudio, musicPressure } from '../daily_flyer/themes/breach_assets/audio.mjs';

const enemy = (extra = {}) => ({
  alive: true, health: 52, active: true, type: 'runner', x: 3, z: 0, ...extra,
});
function scene(enemies, { visible = true, player = {} } = {}) {
  let rays = 0;
  const game = {
    state: { player: { x: 0, z: 0, health: 100, alive: true, ...player }, enemies },
    isHostileToPlayer: Game.prototype.isHostileToPlayer,
    hasLineOfSight() { rays++; return visible; },
  };
  return { game, rays: () => rays };
}

test('music pressure ignores inactive and dead enemies before tracing visibility', () => {
  const s = scene([enemy({ active: false }), enemy({ alive: false, health: 0 })]);
  assert.equal(musicPressure(s.game), 0);
  assert.equal(s.rays(), 0);
});

test('neutral security is quiet until the existing hostility rule marks it provoked', () => {
  const sentry = enemy({ type: 'sentry', faction: 'security' });
  const s = scene([sentry]);
  assert.equal(musicPressure(s.game), 0);
  assert.equal(s.rays(), 0);
  sentry.provoked = true;
  assert.equal(musicPressure(s.game), 1);
  assert.equal(s.rays(), 1);
});

test('distant enemies and a teammate encounter do not perform local visibility traces', () => {
  const s = scene([enemy({ x: 10.01 }), enemy({ x: 50, z: 50 })]);
  s.game.state.players = {
    p1: s.game.state.player,
    p2: { x: 50, z: 50, health: 100, alive: true },
  };
  assert.equal(musicPressure(s.game), 0);
  assert.equal(s.rays(), 0);
});

test('walls and closed doors prevent nearby active enemies from raising music pressure', () => {
  const s = scene([enemy(), enemy({ guardian: true })], { visible: false });
  assert.equal(musicPressure(s.game), 0);
  assert.equal(s.rays(), 2);
});

test('two nearby active visible enemies create encounter pressure; a guardian carries its own weight', () => {
  const regular = scene([enemy(), enemy({ x: 4 })]);
  assert.equal(musicPressure(regular.game), 2);
  const guardian = scene([enemy({ guardian: true })]);
  assert.equal(musicPressure(guardian.game), 3);
});

test('a downed local operator remains quiet while a healthy teammate keeps fighting', () => {
  for (const player of [{ health: 0 }, { alive: false }]) {
    const s = scene([enemy({ guardian: true })], { player });
    s.game.state.players = {
      p1: { x: 3, z: 0, health: 100, alive: true },
      p2: s.game.state.player,
    };
    s.game.state.localPlayerId = 'p2';
    assert.equal(musicPressure(s.game), 0);
    assert.equal(s.rays(), 0);
  }
});

test('pressure assessment stops tracing once enough nearby threats are confirmed', () => {
  const regular = scene(Array.from({ length: 30 }, () => enemy()));
  assert.equal(musicPressure(regular.game), 3);
  assert.equal(regular.rays(), 3);
  const guardian = scene([enemy({ guardian: true }), ...Array.from({ length: 30 }, () => enemy())]);
  assert.equal(musicPressure(guardian.game), 3);
  assert.equal(guardian.rays(), 1);
});

test('Hollow containment shutter geometry conceals pressure until the real door opens', () => {
  const game = new Game({ mission: 'hollow-19' });
  Object.assign(game.state.player, { x: 30.5, z: 56.5 });
  game.state.enemies = [enemy({ x: 35.5, z: 56.5 })];
  const door = game.state.doors.find(item => item.id === 'route-1');
  assert.ok(door);
  assert.equal(door.open, false);
  assert.equal(game.hasLineOfSight(30.5, 56.5, 35.5, 56.5), false);
  assert.equal(musicPressure(game), 0);
  door.open = true;
  assert.equal(game.hasLineOfSight(30.5, 56.5, 35.5, 56.5), true);
  assert.equal(musicPressure(game), 1);
});

test('co-op mission rewind restores silence grace without clearing session cooldown or reacting to clock jitter', () => {
  const audio = new BreachAudio();
  const { game } = scene([enemy(), enemy({ x: 4 })]);
  audio.setPlaying(true);
  audio.music.time = 70;
  audio.music.cooldownUntil = 190;
  const originalGrace = audio.music.graceUntil;
  for (const time of [100, 100, 99.95, 100.05]) {
    game.state.time = time;
    audio.updateMusic(game, .05);
    assert.equal(audio.music.graceUntil, originalGrace, 'repeated snapshots and small jitter do not restart grace');
    assert.equal(audio.music.cooldownUntil, 190);
  }

  const beforeRewind = audio.music.time;
  game.state.time = 40;
  audio.updateMusic(game, .05);
  assert.equal(audio.music.graceUntil, beforeRewind + 18, 'checkpoint rewind grants eighteen seconds of silence');
  assert.equal(audio.music.cooldownUntil, 190, 'retry cannot bypass the session music cooldown');
  assert.equal(audio.music.pressureTime, 0, 'old sustained combat does not carry into the retry');
  const retryGrace = audio.music.graceUntil;
  audio.updateMusic(game, .05);
  assert.equal(audio.music.graceUntil, retryGrace, 'duplicate retry snapshots do not keep postponing grace');

  audio.resetMusic();
  assert.equal(audio.lastMusicStateTime, null);
  const mountedGrace = audio.music.graceUntil;
  game.state.time = 0;
  audio.updateMusic(game, .05);
  assert.equal(audio.music.graceUntil, mountedGrace, 'a new mount has no prior mission clock to rewind');
  assert.equal(audio.music.cooldownUntil, 190);
  assert.equal(audio.context, null, 'policy updates never require browser audio initialization');
});
