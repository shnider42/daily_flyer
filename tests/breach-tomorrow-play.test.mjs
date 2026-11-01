import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WEAPONS, ownedWeapons } from '../daily_flyer/themes/breach_assets/core.mjs';
import { TOMORROW_ID, tomorrowEnding } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';

// This is a deterministic controller, not a fixture that edits combat state.
// It uses ordinary movement, shooting, pickups, consoles and rest stations.
const object = (game, id) => [...game.state.interactables, ...game.state.pickups, ...game.state.doors, ...game.state.enemies].find(o => o.id === id);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (a, b) => Math.atan2(b.x - a.x, -(b.z - a.z));

function pathTo(game, target) {
  const width = game.level.width, p = game.state.player;
  const start = Math.floor(p.z) * width + Math.floor(p.x), goal = Math.floor(target.z) * width + Math.floor(target.x);
  const queue = [start], previous = new Map([[start, null]]);
  const doors = new Map(game.state.doors.map(d => [Math.floor(d.z) * width + Math.floor(d.x), d]));
  for (let i = 0; i < queue.length && !previous.has(goal); i++) {
    const index = queue[i], x = index % width, z = Math.floor(index / width);
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const next = nz * width + nx, door = doors.get(next);
      if (previous.has(next) || game.level.grid[nz]?.[nx] !== '.' || door && !door.open && !game.canTraverseDoor(door)) continue;
      previous.set(next, index); queue.push(next);
    }
  }
  assert.ok(previous.has(goal), `walking route exists to ${target.id || JSON.stringify(target)}`);
  const path = [];
  for (let index = goal; index !== null; index = previous.get(index)) path.push({ x: index % width + .5, z: Math.floor(index / width) + .5 });
  return path.reverse();
}

function visibleThreat(game, range = 13) {
  const p = game.state.player;
  return game.state.enemies.filter(e => e.alive && (e.type !== 'lantern-maw' || e.revealed) && distance(p, e) < range
    && game.hasLineOfSight(p.x, p.z, e.x, e.z)).sort((a, b) => distance(p, a) - distance(p, b))[0];
}

function chooseWeapon(game, target) {
  const p = game.state.player, available = ownedWeapons(p).filter(id => p.ammo[WEAPONS[id].ammoKey] > 0);
  const order = distance(p, target) < 7 ? ['shotgun', 'lance', 'repeater', 'pistol', 'ricochet', 'nullgun'] : ['lance', 'repeater', 'pistol', 'ricochet', 'shotgun', 'nullgun'];
  const weapon = order.find(id => available.includes(id) && distance(p, target) < WEAPONS[id].range);
  if (weapon && p.weapon !== weapon) game.selectWeapon(weapon);
}

function fightVisible(game, stats, maxSteps = 1200) {
  let side = 1, stalled = 0;
  for (let step = 0; step < maxSteps; step++) {
    assert.equal(game.state.status, 'playing', `survive live combat at ${game.getZone()}`);
    const target = visibleThreat(game);
    if (!target) return;
    const p = game.state.player, before = { x: p.x, z: p.z }, d = distance(p, target);
    chooseWeapon(game, target); p.angle = angle(p, target);
    game.update(.05, { fire: true, strafe: side, forward: d < 4.5 ? -.65 : d > 10 ? .35 : 0 });
    if (distance(before, p) < .025) stalled++; else stalled = 0;
    if (stalled > 2) { side *= -1; stalled = 0; }
    tally(game, stats);
  }
  assert.fail(`bounded combat controller could not clear ${game.getZone()}`);
}

function tally(game, stats) {
  for (const event of game.drainEvents()) {
    if (event.type === 'hurt') { stats.hitsTaken++; stats.damageTaken += event.damage; }
    if (event.type === 'kill') stats.kills.add(event.id);
    if (event.type === 'pickup') stats.pickups.add(event.item);
    if (event.type === 'boss-phase') stats.bossPhases.add(event.phase);
  }
}

function walk(game, target, stats) {
  let path = pathTo(game, target), cursor = 0;
  for (let step = 0; step < 18000; step++) {
    assert.equal(game.state.status, 'playing', `survive movement toward ${target.id || JSON.stringify(target)}`);
    const p = game.state.player;
    if (visibleThreat(game)) { fightVisible(game, stats); path = pathTo(game, target); cursor = 0; }
    while (cursor < path.length && distance(p, path[cursor]) < .03) cursor++;
    if (cursor >= path.length) return;
    const next = path[cursor], door = game.state.doors.find(d => !d.open && Math.floor(d.x) === Math.floor(next.x) && Math.floor(d.z) === Math.floor(next.z));
    if (door && distance(p, door) < 1.6) { p.angle = angle(p, door); assert.ok(game.interact(), `open ${door.id}`); assert.ok(door.open); }
    const d = distance(p, next); p.angle = angle(p, next);
    game.update(Math.min(.075, d / 3.35), { forward: 1 }); tally(game, stats);
  }
  assert.fail(`bounded walking controller could not reach ${target.id || JSON.stringify(target)}`);
}

function use(game, id, stats) {
  walk(game, object(game, id), stats);
  assert.ok(game.interact(), `use ${id}: ${game.getPrompt()}`); tally(game, stats);
}

test('Standard Tomorrow can reach both guarded registers and seal the live court using only walked routes and authored supplies', () => {
  const game = new Game({ mission: TOMORROW_ID, difficulty: 'standard', seed: 73, aimAssist: false }); game.start();
  const stats = { hitsTaken: 0, damageTaken: 0, kills: new Set(), pickups: new Set(), bossPhases: new Set() }; tally(game, stats);
  walk(game, object(game, 'pump-shotgun'), stats);
  walk(game, object(game, 'arrivals-ammo'), stats);
  use(game, 'aux-power', stats);
  use(game, 'relay-west', stats);
  use(game, 'wardrobe-refuge', stats);
  walk(game, object(game, 'wardrobe-shells'), stats);
  use(game, 'relay-east', stats);
  walk(game, object(game, 'breach-lance'), stats);
  use(game, 'exchange-refuge', stats);
  walk(game, object(game, 'access-key'), stats);
  walk(game, { id: 'court-combat-floor', x: 45.5, z: 24.5 }, stats);
  fightVisible(game, stats);
  assert.equal(object(game, 'tomorrow-guardian').alive, false);
  assert.ok(stats.kills.has('tomorrow-guardian'));
  use(game, 'ending-seal', stats);
  assert.equal(tomorrowEnding(game)?.id, 'seal');
  assert.equal(game.state.status, 'won');
  assert.ok(game.state.player.health > 0);
  assert.ok(stats.kills.size >= 6, 'the played route genuinely fought multiple authored defenders');
  assert.ok(stats.hitsTaken > 0 && stats.damageTaken > 0, 'authored enemies dealt real incoming damage during the run');
  assert.ok(stats.bossPhases.size > 0, 'the live keeper had time to attack');
  assert.ok(game.state.pickups.find(p => p.id === 'pump-shotgun').collected);
  assert.ok(game.state.pickups.find(p => p.id === 'breach-lance').collected);
  assert.ok(game.state.shots > 0 && game.state.hits > 0);
  const restored = new Game(); assert.ok(restored.restore(game.serialize()), 'a real combat run remains valid save data');
  assert.equal(restored.state.status, 'won'); assert.equal(tomorrowEnding(restored)?.id, 'seal');
  console.log(`Tomorrow live Standard route: ${game.state.time.toFixed(1)}s, ${stats.kills.size} kills, ${stats.hitsTaken} incoming hits / ${stats.damageTaken} damage, ${game.state.shots} shots, ${game.state.player.health} HP remaining.`);
});
