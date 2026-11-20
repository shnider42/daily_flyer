import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { MusicDirector } from '../dist/music-director.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-catalog.mjs';
import { scoreEvents, SCORE_MAX_VOICES } from '../dist/music-score.mjs';
import { INSTRUMENT } from '../dist/music-instruments.mjs';
import { MORROW_FLIGHTLINE } from '../dist/recorded-theme.mjs';
import { QUIET_EARTH_DANGER_ID } from '../dist/music-quiet-earth.mjs';

function relay(seed = 'quiet-earth-danger-music') {
  const game = new Game(seed, { startMode: 'casual', startSystemId: 'hearth' });
  const body = game.system.bodies.find(value => value.id === 'morrow');
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  assert.equal(game.dock(body.id).ok, true);
  const entrance = generateSurface(body, seed, game.state.flags).entities.find(entity => entity.data?.siteId === 'relay-nine');
  Object.assign(game.state.person, { x: entrance.x, y: entrance.y });
  assert.equal(game.enterSite('relay-nine').ok, true); game.drainEvents();
  const context = () => musicContext({ game, playing: true, surface: game._expeditionSurface() });
  return { game, context, director: new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID, seed }) };
}

test('the full Quiet Earth danger arrangement keeps its melody, written sections and voice headroom without guitar', () => {
  const cue = MUSIC_CUES.find(cue => cue.id === QUIET_EARTH_DANGER_ID), score = scoreEvents(cue.id, { seed: 'no-way-back-mix' });
  assert.ok(cue.durationSeconds >= 120 && cue.durationSeconds <= 145);
  assert.equal(cue.family, 'combat'); assert.ok(cue.tags.includes('quiet-earth'));
  assert.ok(!cue.tags.includes('long-corridor'), 'A danger composition must not be eligible as the peaceful corridor recording.');
  const lead = score.events.filter(event => event.part === 'melody');
  assert.ok(lead.length >= 120, 'The entire 2-minute piece retains a composed melodic voice.');
  assert.ok(lead.every(event => event.midi >= 55 && event.midi <= 70), 'Pressure stays in a deliberate middle register.');
  assert.ok(score.events.every(event => !['guitar', 'metalLead', 'metalChug', 'pluck'].includes(event.instrument)));
  assert.deepEqual(lead.filter(event => event.beat >= 16 - .01 && event.beat < 48 - .01).map(event => event.midi),
    lead.filter(event => event.beat >= 208 - .01 && event.beat < 240 - .01).map(event => event.midi), 'The opening theme returns after its development.');
  const seconds = 60 / score.bpm;
  const edges = score.events.flatMap(event => [[event.beat * seconds, 1], [(event.beat + event.duration) * seconds + INSTRUMENT[event.instrument].release, -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let count = 0, peak = 0;
  for (const [, change] of edges) { count += change; peak = Math.max(peak, count); }
  assert.ok(peak <= SCORE_MAX_VOICES - 4, 'Every written note fits, leaving capacity for release tails.');
});

test('harmless corridor beats and empty shots keep the original loop, then an actual scoped attack starts No Way Back', () => {
  const { game, context, director } = relay(), quiet = context();
  assert.ok(quiet.tags.includes('quiet-earth')); assert.equal(quiet.observedThreat, false);
  const first = director.update(quiet, 0);
  assert.equal(first.cueId, MORROW_FLIGHTLINE.id); assert.equal(first.loop, true);
  for (const [i, beatId] of ['false-door', 'false-shadow', 'pressure-release', 'distant-cart', 'footsteps-stop'].entries()) {
    const beat = { type: 'quiet-earth-beat', id: `harmless-${i}`, siteId: quiet.siteKey, beatId };
    assert.equal(classifyMusicEvent(beat, quiet), null);
    const signal = classifyMusicEvent(beat, quiet); if (signal) director.notify(signal, i + 1, beat.id);
    assert.equal(director.update(context(), i + 1).token, first.token);
  }
  game.stepExploration(.1, { fire: true, aiming: true, aimX: 1, aimY: 0 });
  const shot = game.drainEvents().find(event => event.type === 'person-shot');
  assert.ok(shot); assert.equal(classifyMusicEvent(shot, context()), null);
  const unrelated = { type: 'quiet-earth-beat', siteId: 'other-site', beatId: 'ambush' };
  assert.equal(classifyMusicEvent(unrelated, context()), null, 'Another captain’s encounter cannot score this hall.');
  assert.equal(classifyMusicEvent({ ...unrelated, siteId: quiet.siteKey, harmless: true }, context()), null,
    'A beat explicitly marked harmless never becomes combat because of its label.');
  const incoming = { type: 'person-shot', siteId: quiet.siteKey, team: 'hostile', intendedTargetId: quiet.captainId };
  assert.equal(classifyMusicEvent(incoming, context()), 'combat', 'A dodged hostile shot is real danger without requiring a health loss.');
  director.notify(classifyMusicEvent(incoming, context()), 7, 'actual-incoming');
  const battle = director.update(context(), 7);
  assert.equal(battle.cueId, QUIET_EARTH_DANGER_ID); assert.equal(battle.loop, false);
  assert.ok(battle.fadeOut < .5); assert.notEqual(battle.token, first.token);
  assert.equal(director.update(context(), 20).token, battle.token, 'Brief loss of sight does not restart or end the danger cue.');
  assert.equal(director.update(context(), 22).mood, 'recovery');
  const resumed = director.update(context(), 90);
  assert.equal(resumed.cueId, MORROW_FLIGHTLINE.id); assert.equal(resumed.loop, true);
});

test('a long real corridor encounter keeps its danger score, while other battles and quiet passages retain their own pools', () => {
  const { context, director } = relay(), battleContext = { ...context(), observedThreat: true };
  const first = director.update(battleContext, 0);
  assert.equal(first.cueId, QUIET_EARTH_DANGER_ID);
  for (const now of [2, 14, 60, 130]) assert.equal(director.update(battleContext, now).token, first.token);
  const continued = director.update(battleContext, 134);
  assert.equal(continued.cueId, QUIET_EARTH_DANGER_ID); assert.notEqual(continued.token, first.token);
  const ordinary = new MusicDirector({ cues: MUSIC_CUES, themeId: THEME_ID });
  for (const tags of [['ground', 'surface'], ['flight', 'ship'], ['crosswind', 'ground']]) {
    for (let now = 0; now < 20; now++) {
      const cue = ordinary.select('combat', now, { tags, musicPlace: tags.includes('crosswind') ? 'crosswind' : null });
      assert.notEqual(cue.id, QUIET_EARTH_DANGER_ID);
      ordinary.lastPlayed.set(cue.id, now);
    }
  }
  const quiet = context();
  assert.equal(director.select('corridor', 200, quiet).id, MORROW_FLIGHTLINE.id);
  ordinary.requestPreview(QUIET_EARTH_DANGER_ID);
  const listen = ordinary.update({ scene: 'exploration', tags: ['ground'] }, 500);
  assert.equal(listen.cueId, QUIET_EARTH_DANGER_ID); assert.equal(listen.preview, true, 'A deliberate listening-panel audition remains possible.');
});

test('the shared relay alarm needs revealed living pursuers and clears when they are pacified or defeated', () => {
  const { game } = relay('quiet-earth-alarm-visibility'), surface = game._expeditionSurface();
  const snapshot = { state: structuredClone(game.state), currentBody: game.currentBody, system: game.system };
  const encounter = snapshot.state.exploration.encounter;
  const actor = { id: 'revealed-pursuer', quietEarthActor: true, quietEarthDormant: true, health: 40,
    revealed: false, hidden: true, pacified: false, x: 0, y: 0, targetId: null };
  encounter.monsters = [actor]; encounter.quietEarth.ambushAnnounced = true;
  const read = () => musicContext({ game: snapshot, playing: true, surface });
  assert.equal(read().observedThreat, false, 'A saved alarm flag cannot reveal a dormant enemy.');
  actor.quietEarthDormant = false;
  assert.equal(read().observedThreat, false, 'An unobserved future actor cannot reveal itself through music.');
  actor.revealed = true; actor.hidden = false;
  assert.equal(read().observedThreat, true, 'An announced real pursuit remains dangerous around corridor corners.');
  actor.pacified = true; assert.equal(read().observedThreat, false);
  actor.pacified = false; actor.health = 0; assert.equal(read().observedThreat, false);
});
