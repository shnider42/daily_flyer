import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { SOCIAL_DAY_SECONDS } from '../dist/social-world.mjs';

const chapterSeconds = SOCIAL_DAY_SECONDS * 2;
const traveler = {
  id: 'social:recurring:tamsin-rue', type: 'npc', name: 'Tamsin Rue', role: 'courier',
  data: { recurringId: 'tamsin-rue', socialOnly: true, bodyId: 'tessera' }
};
const read = game => game.conversation(traveler, { record: false });

test('an old solo voyage starts newly introduced projects at the beginning and keeps its epoch after reload', () => {
  const original = new Game('old-social-project'), raw = original.save();
  raw.stats.time = 500000;
  delete raw.socialEpoch;
  let game = Game.fromSave(raw);
  assert.equal(game.state.socialEpoch, 500000);
  assert.equal(read(game).storyStage, 0, 'Absolute playtime must not complete a newly introduced story.');
  assert.equal(game.conversation(traveler, { record: false, time: 9000000 }).storyStage, 0, 'The routine clock is independent from the project clock.');
  const first = game.conversation(traveler);
  assert.equal(first.relationship, 'First meeting');
  assert.equal(game.state.socialVisits.people[0].storyStage, 0);

  game.state.stats.time += chapterSeconds + 15;
  const next = game.conversation(traveler);
  assert.equal(next.storyStage, 1); assert.match(next.greeting, /Since we last spoke/);
  game = Game.fromSave(game.serialize());
  assert.equal(game.state.socialEpoch, 500000);
  assert.equal(game.state.stats.time, 500000 + chapterSeconds + 15);
  assert.equal(read(game).storyStage, 1);
  assert.equal(read(game).known, true, 'The clock migration retains personal recognition.');

  game.state.stats.time += chapterSeconds;
  assert.equal(game.conversation(traveler).storyStage, 2);
  const reloaded = Game.fromSave(game.save());
  assert.equal(reloaded.state.socialEpoch, 500000);
  assert.equal(read(reloaded).storyStage, 2, 'Repeated saves cannot restart an established project.');
});

test('new solo voyages retain a valid zero epoch instead of resetting their progress on every load', () => {
  const game = new Game('new-social-project');
  assert.equal(game.state.socialEpoch, 0);
  game.state.stats.time = chapterSeconds + 1;
  assert.equal(read(game).storyStage, 1);
  const restored = Game.fromSave(game.serialize());
  assert.equal(restored.state.socialEpoch, 0);
  assert.equal(read(restored).storyStage, 1);
  restored.state.stats.time += chapterSeconds;
  assert.equal(read(restored).storyStage, 2);
});

test('authoritative and projected social clocks take precedence without borrowing an old captain clock', () => {
  const game = new Game('shared-social-projection');
  game.state.stats.time = 500000;
  game.state.npcLife = { time: 900000, socialTime: chapterSeconds + 1 };
  game._socialTime = () => 0;
  assert.equal(game.conversation(traveler, { record: false, time: 900000, storyTime: 900000 }).storyStage, 0, 'The authority hook overrides projection and caller-supplied story time.');
  delete game._socialTime;
  assert.equal(read(game).storyStage, 1, 'A shared client reads the projected project clock.');
  game.state.npcLife.socialTime = 0;
  assert.equal(read(game).storyStage, 0, 'A valid projected zero must not fall back to captain age.');
  delete game.state.npcLife;
  assert.equal(read(game).storyStage, 2, 'Solo uses its own persisted epoch when no shared clock exists.');
});

test('invalid or future saved epochs normalize without exhausting a legacy story', () => {
  for (const epoch of [undefined, null, -1, Infinity, 'bad', 999999]) {
    const raw = new Game('invalid-social-epoch').save(); raw.stats.time = 100000;
    if (epoch === undefined) delete raw.socialEpoch; else raw.socialEpoch = epoch;
    const restored = Game.fromSave(raw);
    assert.equal(restored.state.socialEpoch, 100000);
    assert.equal(read(restored).storyStage, 0);
  }
});
