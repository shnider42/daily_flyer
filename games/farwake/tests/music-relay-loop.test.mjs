import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-catalog.mjs';
import { MORROW_FLIGHTLINE } from '../dist/recorded-theme.mjs';

function relay() {
  const game = new Game('relay-loop', { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  assert.equal(game.dock(body.id).ok, true);
  const entrance = generateSurface(body, game.state.seed, game.state.flags).entities.find(entity => entity.data?.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entrance.x, y: entrance.y });
  assert.equal(game.enterSite('relay-nine').ok, true);
  game.drainEvents();
  const context = extra => musicContext({ game, playing: true, surface: game._expeditionSurface(), ...extra });
  const director = new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID, seed: 'relay-loop' });
  return { game, context, director };
}

test('Relay Nine holds the same looping recording across track boundaries and nervous blank shots', () => {
  for (const presence of ['quiet', 'balanced', 'frequent']) {
    const { game, context, director } = relay(), quiet = context();
    assert.equal(quiet.loopCorridor, true);
    assert.equal(quiet.observedThreat, false);
    const first = director.update(quiet, 0, { presence });
    assert.equal(first.cueId, MORROW_FLIGHTLINE.id); assert.equal(first.loop, true);
    for (const now of [142, 145, 286, 430, 720]) {
      const next = director.update(context(), now, { presence });
      assert.equal(next.token, first.token, 'A media loop never recreates or fades the player at a track boundary.');
      assert.equal(next.loop, true); assert.equal(next.mood, 'corridor');
    }
    game.stepExploration(.1, { fire: true, aiming: true, aimX: 1, aimY: 0 });
    const shot = game.drainEvents().find(event => event.type === 'person-shot');
    assert.ok(shot); assert.equal(classifyMusicEvent(shot, context()), null);
    assert.equal(director.update(context(), 721, { presence }).token, first.token);
  }
});

test('revealed danger interrupts the loop, recovery plays, and the corridor resumes without its battle cooldown', () => {
  const { context, director } = relay(), quiet = context();
  const first = director.update(quiet, 0);
  const onset = { type: 'quiet-earth-beat', id: 'revealed-contact', siteId: quiet.siteKey, beatId: 'ambush' };
  director.notify(classifyMusicEvent(onset, quiet), 1, onset.id);
  const battle = director.update(quiet, 1);
  assert.equal(battle.mood, 'combat'); assert.equal(battle.loop, false);
  assert.notEqual(battle.token, first.token); assert.ok(battle.fadeOut < .5);
  for (let now = 2; now <= 6; now++) {
    assert.equal(director.update({ ...quiet, observedThreat: true }, now).token, battle.token);
  }
  const recovery = director.update(quiet, 21);
  assert.equal(recovery.mood, 'recovery'); assert.equal(recovery.loop, false);
  const resumed = director.update(quiet, 100);
  assert.ok(100 < MORROW_FLIGHTLINE.cooldownSeconds, 'The normal battle cooldown has not elapsed.');
  assert.equal(resumed.cueId, MORROW_FLIGHTLINE.id); assert.equal(resumed.loop, true);
  assert.notEqual(resumed.token, first.token);
  const outside = { ...quiet, musicPlace: null, loopCorridor: false, paletteKey: 'hearth:morrow:outside' };
  director.update(outside, 101);
  const left = director.update(outside, 103);
  assert.notEqual(left.cueId, MORROW_FLIGHTLINE.id); assert.equal(left.loop, false);
});

test('pausing ducks the corridor loop, music mute and background stop it, and a manual listen still plays once', () => {
  const { context, director } = relay(), quiet = context(), first = director.update(quiet, 0);
  const paused = director.update({ ...quiet, menuOpen: true, paused: true }, 2);
  assert.equal(paused.token, first.token); assert.equal(paused.loop, true); assert.ok(paused.duck < 1);
  assert.equal(director.update(quiet, 3, { enabled: false }).cueId, null);
  assert.equal(director.update(quiet, 10).cueId, null);
  assert.equal(director.update(quiet, 13).loop, true);
  assert.equal(director.update({ ...quiet, hidden: true }, 14).cueId, null);
  assert.equal(director.update(quiet, 20).cueId, null);
  assert.equal(director.update(quiet, 23).loop, true);
  director.requestPreview(MORROW_FLIGHTLINE.id);
  const audition = director.update(quiet, 24);
  assert.equal(audition.preview, true); assert.equal(audition.loop, false);
  const after = director.update(quiet, 170);
  assert.equal(after.preview, false); assert.equal(after.loop, true);
  assert.equal(after.cueId, MORROW_FLIGHTLINE.id);
});
