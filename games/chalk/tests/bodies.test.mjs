import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDeadActors, recordBloodHit } from '../public/bodies.mjs';
import { createGame, step } from '../public/sim.mjs';

function fixture() {
  return {
    time: 3, missionIndex: 0,
    world: { width: 2400, height: 1900, buildings: [], walls: [] },
    squad: [{ id: 1, team: 'squad', role: 'leader', x: 100, y: 100, angle: 0, alive: true }],
    enemies: [], civilians: [], survivors: [], bodies: [], bloodstains: [], effects: [],
  };
}
const casualty = (id, team, more = {}) => ({ id, team, x: 200, y: 100, angle: .7, alive: false, downed: true, ...more });

test('true deaths of every team persist while living casualties remain recoverable actors', () => {
  const s = fixture();
  s.squad.push(casualty(2, 'squad', { role: 'support' }), casualty(3, 'squad', { alive: true, hp: 0 }));
  s.enemies.push(casualty(4, 'enemy', { kind: 'sniper', deathTime: 2.75 }));
  s.civilians.push(casualty(5, 'civilian'));
  s.survivors.push(casualty(6, 'survivor'));
  assert.equal(recordDeadActors(s), 4);
  assert.deepEqual(s.bodies.map(body => body.team), ['squad', 'enemy', 'civilian', 'survivor']);
  assert.ok(s.bodies.every(body => body.seen && Number.isFinite(body.pose)));
  assert.equal(s.bodies.some(body => body.actorId === 3), false);
  assert.equal(s.bodies[0].role, 'support');
  assert.equal(s.bodies[1].kind, 'sniper');
  assert.equal(s.bodies[1].diedAt, 2.75);
  s.squad[2].alive = false; s.time = 90;
  assert.equal(recordDeadActors(s), 1, 'a casualty becomes a body only after death');
});

test('body position and pose are captured once and survive actor cleanup and snapshot repetition', () => {
  const s = fixture(), enemy = casualty(8, 'enemy');
  s.enemies.push(enemy); recordDeadActors(s);
  const captured = structuredClone(s.bodies[0]);
  enemy.x = 900; enemy.y = 850; enemy.angle = -2; s.time = 20;
  assert.equal(recordDeadActors(s), 0);
  assert.deepEqual(s.bodies[0], captured);
  s.enemies = []; s.time = 1000; recordDeadActors(s);
  assert.deepEqual(s.bodies, [captured], 'the corpse outlives the cleaned-up combat actor');
  const snapshot = JSON.parse(JSON.stringify(s));
  snapshot.enemies.push(casualty(8, 'enemy', { x: 800 }));
  assert.equal(recordDeadActors(snapshot), 0);
  assert.deepEqual(snapshot.bodies, [captured], 'repeated snapshots do not duplicate or relocate a corpse');
});

test('unobserved deaths stay hidden until actual squad sight, then keep only their inert memory', () => {
  const s = fixture();
  s.world.walls = [{ x: 150, y: 0, w: 10, h: 500 }];
  s.enemies.push(casualty(9, 'enemy', { visible: true }));
  recordDeadActors(s);
  assert.equal(s.bodies[0].seen, false, 'a stale hostile visible flag does not bypass a wall');
  s.world.walls = []; s.smokes = [{ x: 165, y: 100, radius: 90, ttl: 8 }]; s.time += .2;
  recordDeadActors(s); assert.equal(s.bodies[0].seen, false, 'thick smoke blocks discovery');
  s.smokes = []; s.squad[0].downed = true; s.time += .2;
  recordDeadActors(s); assert.equal(s.bodies[0].seen, false, 'downed squad members cannot scout');
  s.squad[0].downed = false; s.time += .2;
  recordDeadActors(s); assert.equal(s.bodies[0].seen, true);
  s.world.walls = [{ x: 150, y: 0, w: 10, h: 500 }]; s.time += .2;
  recordDeadActors(s); assert.equal(s.bodies[0].seen, true, 'previously seen stationary remains stay known');
});

test('ordinary distant deaths require exploration while a witnessed sniper death is retained', () => {
  const s = fixture();
  s.enemies.push(casualty(10, 'enemy', { x: 820, visible: false }), casualty(11, 'enemy', { x: 850, visible: true, kind: 'sniper' }));
  recordDeadActors(s);
  assert.equal(s.bodies[0].seen, false);
  assert.equal(s.bodies[1].seen, true);
  s.squad[0].role = 'grenadier'; s.squad[0].observing = true; s.time += .2;
  recordDeadActors(s); assert.equal(s.bodies[0].seen, true, 'binocular sight can discover a body ahead');
});

test('bullet and blast hits make deterministic ground marks and short visible impact events', () => {
  const a = fixture(), b = fixture();
  const target = { id: 20, team: 'civilian', x: 190, y: 100, alive: true };
  for (const state of [a, b]) {
    recordBloodHit(state, target, { damage: 24, sourceId: 1, cause: 'bullet' });
    recordBloodHit(state, { ...target, x: 240, alive: false }, { damage: 60, cause: 'blast', angle: Math.PI / 2 });
  }
  assert.deepEqual(a, b, 'visual state does not consume random or simulation RNG');
  assert.equal(a.bloodstains.length, 2); assert.equal(a.effects.length, 2);
  assert.equal(a.bloodstains[0].angle, 0);
  assert.ok(a.bloodstains.every(stain => stain.seen));
  assert.ok(a.effects.every(effect => effect.type === 'blood' && effect.ttl === effect.maxTtl && effect.ttl < .3));
  assert.equal(recordBloodHit(a, target, { damage: 0 }), null);
  assert.equal(recordBloodHit(a, target, { damage: 10, cause: 'heal' }), null);
  assert.equal(a.effects.length, 2);
});

test('unseen blood never enlarges an observed mark or leaks through a partition within its cell', () => {
  const s = fixture(), target = { id: 21, team: 'enemy', visible: true, x: 163, y: 100 };
  s.world.walls = [{ x: 157, y: 0, w: 3, h: 500 }];
  recordBloodHit(s, target, { damage: 20 });
  assert.equal(s.bloodstains[0].seen, false); assert.equal(s.effects[0].seen, false);
  // x154 shares the 28px cell with x163, but lies on the visible side.
  recordBloodHit(s, { ...target, x: 154 }, { damage: 45 });
  assert.equal(s.bloodstains.length, 1);
  assert.equal(s.bloodstains[0].seen, false, 'a nearby visible hit cannot reveal a mark behind masonry');
  assert.equal(s.effects[1].seen, true);
  s.world.walls = []; s.time += .2; recordDeadActors(s);
  assert.equal(s.bloodstains[0].seen, true);
  const remembered = structuredClone(s.bloodstains[0]);
  s.world.walls = [{ x: 150, y: 0, w: 10, h: 500 }]; s.time += 5;
  recordBloodHit(s, target, { damage: 100 });
  assert.deepEqual(s.bloodstains[0], remembered, 'unseen later hits cannot change known ground details');
});

test('ground-mark density is bounded without deleting old marks, suppressing impacts, or limiting bodies', () => {
  const s = fixture();
  for (let i = 0; i < 700; i++) recordBloodHit(s, { id: i + 50, team: 'enemy', x: (i % 60) * 30, y: Math.floor(i / 60) * 30 }, { damage: 10 });
  assert.equal(s.bloodstains.length, 512);
  assert.equal(s.bloodstains[0].x, 0);
  assert.equal(s.effects.at(-1).x, (699 % 60) * 30);
  assert.ok(s.effects.length <= 220, 'impact particles use the existing bounded effect queue');
  s.enemies = Array.from({ length: 600 }, (_, i) => casualty(1000 + i, 'enemy', { x: (i % 50) * 30, y: Math.floor(i / 50) * 30 }));
  recordDeadActors(s); assert.equal(s.bodies.length, 600, 'visual density limits never remove a body');
});

test('simulation keeps remains after enemy cleanup and clears mission traces on restart', () => {
  const s = createGame({ seed: 17 });
  s.maxEnemies = 0; s.spawnTimer = 9999;
  const enemy = s.enemies[0]; enemy.x = 280; enemy.y = 1720;
  const expected = { x: enemy.x, y: enemy.y };
  enemy.alive = false; enemy.downed = true; enemy.deathTime = -20;
  s.enemies = [enemy];
  recordBloodHit(s, enemy, { damage: 25 });
  step(s, {}, 1 / 30);
  assert.equal(s.enemies.some(actor => actor.id === enemy.id), false);
  const body = s.bodies.find(body => body.actorId === enemy.id);
  assert.ok(body, 'the death is recorded before the old combat actor is removed');
  assert.equal(body.x, expected.x); assert.equal(body.y, expected.y);
  assert.equal(body.seen, true);
  const captured = structuredClone(body), mark = structuredClone(s.bloodstains[0]);
  for (let frame = 0; frame < 60 * 30; frame++) step(s, {}, 1 / 30);
  assert.ok(s.time >= 60, 'the test advances well beyond the old cleanup lifetime');
  assert.deepEqual(s.bodies.find(body => body.actorId === enemy.id), captured);
  assert.deepEqual(s.bloodstains[0], mark);
  const fresh = createGame({ seed: 17 });
  assert.deepEqual(fresh.bodies, []); assert.deepEqual(fresh.bloodstains, []);
  assert.equal(fresh.effects.some(effect => effect.type === 'blood'), false);
});

test('real bullet impacts bleed on every team while only lethal enemy and civilian hits create corpses', () => {
  for (const team of ['squad', 'enemy', 'civilian', 'survivor']) {
    const s = createGame({ mission: 1, seed: 17 });
    const target = team === 'squad' ? s.squad[0] : team === 'enemy' ? s.enemies[0] : team === 'civilian' ? s.civilians[0] : s.survivors[0];
    for (const [i, soldier] of s.squad.entries()) { soldier.x = 200; soldier.y = 1680 + i * 25; soldier.cooldown = 999; }
    target.x = 340; target.y = 1720; target.alive = true; target.downed = false; target.hp = 40; target.cooldown = 999; target.stabilized = true;
    s.enemies = team === 'enemy' ? [target] : [];
    s.civilians = team === 'civilian' ? [target] : [];
    s.survivors = team === 'survivor' ? [target] : [];
    s.maxEnemies = 0; s.spawnTimer = 9999;
    s.bullets = [{ id: 9000, x: 300, y: 1720, px: 300, py: 1720, vx: 2000, vy: 0, team: ['squad', 'survivor'].includes(team) ? 'enemy' : 'squad', owner: 8000, damage: 80, ttl: 1 }];
    step(s, {}, .05);
    assert.equal(target.hp, 0, `${team} receives the actual collision damage`);
    assert.equal(s.bloodstains.length, 1, `${team} impact leaves a persistent mark`);
    assert.ok(s.effects.some(effect => effect.type === 'blood' && effect.seen), `${team} impact has a witnessed short spurt`);
    assert.ok(!s.effects.some(effect => effect.type === 'hit'), 'the old ungated hit puff is replaced');
    assert.equal(s.bodies.some(body => body.actorId === target.id), ['enemy', 'civilian'].includes(team), `${team} death and recoverable casualty stay distinct`);
  }
});
