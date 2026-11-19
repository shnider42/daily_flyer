import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, removePlayer, setInput, step, action, snapshot, generateLoot, serializeGame, restoreGame, temperCost } from '../public/sim.mjs';

const advance = (g, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) step(g, 1 / 60); };
function arena(classId = 'warrior', seed = 'test') {
  const g = createGame({ seed }); const template = structuredClone(g.enemies.find(e => e.type === 'crawler') || g.enemies.find(e => !e.boss));
  const p = addPlayer(g, { id: 'p1', name: 'Tester', classId });
  g.enemies = []; g.map.chests = []; g.map.shrines = [];
  p.x = 400; p.y = 400; p.invulnerable = 0;
  for (let y = 3; y < 20; y++) for (let x = 3; x < 24; x++) g.map.tiles[y * g.map.width + x] = 1;
  const enemy = (id, x, y, hp = 500) => {
    const e = structuredClone(template); Object.assign(e, { id, x, y, hp, maxHp: hp, awake: false, speed: 0, attackTimer: 999, skillTimer: 999, r: 15, boss: false, elite: false, damage: 10, _dead: false });
    g.enemies.push(e); return e;
  };
  return { g, p, enemy };
}

test('seeded layouts connect every chamber, boss, chest and shrine over varied seeds', () => {
  for (let seed = 0; seed < 45; seed++) {
    const g = createGame({ seed }), { width, height, tiles } = g.map;
    const start = Math.floor(g.spawn.y / 48) * width + Math.floor(g.spawn.x / 48), seen = new Set([start]), queue = [start];
    for (let at = 0; at < queue.length; at++) {
      const n = queue[at], x = n % width, y = Math.floor(n / width);
      for (const next of [x ? n - 1 : -1, x < width - 1 ? n + 1 : -1, y ? n - width : -1, y < height - 1 ? n + width : -1]) if (next >= 0 && tiles[next] && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
    assert.equal(seen.size, tiles.filter(Boolean).length, `disconnected map seed ${seed}`);
    for (const object of [g.exit, ...g.map.chests, ...g.map.shrines, ...g.enemies]) assert.ok(seen.has(Math.floor(object.y / 48) * width + Math.floor(object.x / 48)), `unreachable object seed ${seed}`);
    assert.deepEqual(createGame({ seed }).map, g.map);
  }
});

test('movement is bounded, diagonal-normalized, finite and blocked by walls', () => {
  const { g, p } = arena(); const old = { x: p.x, y: p.y };
  setInput(g, p.id, { mx: 400, my: 400 }); step(g, .05);
  assert.ok(Math.abs(Math.hypot(p.x - old.x, p.y - old.y) - p.stats.speed * .05) < .01);
  setInput(g, p.id, { mx: NaN, my: Infinity, aimX: Infinity, aimY: NaN }); advance(g, .5);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.facing));
  const col = Math.floor(p.x / 48) + 1;
  for (let y = 0; y < g.map.height; y++) g.map.tiles[y * g.map.width + col] = 0;
  setInput(g, p.id, { mx: 1, my: 0 }); advance(g, 3);
  assert.ok(p.x + p.r < col * 48 + 1);
});

test('warrior cleave respects facing and attack cooldown', () => {
  const { g, p, enemy } = arena(); const front = enemy('front', 470, 400), back = enemy('back', 330, 400);
  p.stats.crit = 0; setInput(g, p.id, { aimX: 600, aimY: 400, attack: true }); step(g, .01);
  assert.equal(front.hp, 500 - p.stats.damage); assert.equal(back.hp, 500);
  advance(g, .2); assert.equal(front.hp, 500 - p.stats.damage);
  advance(g, .3); assert.ok(front.hp <= 500 - p.stats.damage * 2);
});

test('archer projectiles hit distant targets but cannot pass through walls', () => {
  const { g, p, enemy } = arena('archer'); const target = enemy('target', 650, 400); p.stats.crit = 0;
  setInput(g, p.id, { aimX: 700, aimY: 400, attack: true }); step(g, .01); setInput(g, p.id, {}); advance(g, .6);
  assert.equal(target.hp, 500 - p.stats.damage);
  target.hp = 500; p.cooldowns.primary = 0;
  for (let y = 0; y < g.map.height; y++) g.map.tiles[y * g.map.width + 11] = 0;
  setInput(g, p.id, { aimX: 700, aimY: 400, attack: true }); step(g, .01); setInput(g, p.id, {}); advance(g, 1);
  assert.equal(target.hp, 500);
});

test('wizard frost and lightning produce a stronger shatter chain', () => {
  const { g, p, enemy } = arena('wizard'); const a = enemy('a', 510, 400), b = enemy('b', 560, 455); p.stats.crit = 0;
  setInput(g, p.id, { aimX: a.x, aimY: a.y, skill1: true }); step(g, .01);
  assert.ok(a.statuses.chill > 0 && b.statuses.chill > 0);
  const before = a.hp; setInput(g, p.id, { aimX: a.x, aimY: a.y, skill2: true }); step(g, .01);
  assert.ok(a.hp < before - p.stats.damage * 2); assert.equal(a.statuses.chill, 0);
  assert.ok(g.effects.some(e => e.value === 'SHATTER')); assert.ok(b.hp < 470);
});

test('class combination: a fire bolt erupts in an archer poison field', () => {
  const { g, p, enemy } = arena('archer'); const e = enemy('e', 470, 400); p.stats.crit = 0;
  setInput(g, p.id, { skill2: true }); step(g, .01); setInput(g, p.id, {}); advance(g, .1);
  assert.ok(e.statuses.poison > 0);
  const wizard = addPlayer(g, { id: 'p2', classId: 'wizard' }); wizard.x = 400; wizard.y = 400;
  setInput(g, wizard.id, { aimX: e.x, aimY: e.y, attack: true }); step(g, .01); setInput(g, wizard.id, {}); advance(g, .2);
  assert.ok(g.effects.some(f => f.value === 'ERUPTION'));
});

test('loot rolls vary and equipping changes combat stats; old gear remains in pack', () => {
  const { g, p } = arena(); const items = Array.from({ length: 80 }, () => generateLoot(g, p.classId));
  assert.ok(new Set(items.map(i => i.rarity)).size >= 3); assert.ok(new Set(items.map(i => i.name)).size > 25);
  assert.ok(items.some(i => i.affixes.length));
  const item = generateLoot(g, 'warrior', { rarity: 'rare', slot: 'weapon', level: 4 }); p.inventory.push(item);
  const old = p.equipment.weapon, damage = p.stats.damage;
  assert.equal(action(g, p.id, { type: 'equip', itemId: item.id }).ok, true);
  assert.ok(p.stats.damage > damage); assert.ok(p.inventory.find(i => i.id === old.id)); assert.equal(p.equipment.weapon.id, item.id);
  const gold = p.gold; assert.equal(action(g, p.id, { type: 'salvage', itemId: old.id }).ok, true); assert.equal(p.gold, gold + old.value);
  assert.equal(action(g, p.id, { type: 'equip', itemId: old.id }).ok, false);
});

test('potion cooldown and real dodge invulnerability protect against contact damage', () => {
  const { g, p, enemy } = arena(); p.hp = 40; p._hurtAgo = 0;
  setInput(g, p.id, { potion: true }); step(g, .01); const healed = p.hp; advance(g, .5);
  assert.equal(p.hp, healed); assert.ok(p.cooldowns.potion > 17);
  const e = enemy('e', p.x + 20, p.y); e.attackTimer = 0; p.hp = 100;
  setInput(g, p.id, { dodge: true, mx: 1, my: 0 }); step(g, .01);
  assert.equal(p.hp, 100); assert.ok(p.dodgeTimer > 0 && p.cooldowns.dodge > 0);
  setInput(g, p.id, {}); advance(g, .5); e.x = p.x + 20; e.y = p.y; e.attackTimer = 0; step(g, .01);
  assert.ok(p.hp < 100);
});

test('downed allies can be revived by holding interact; a total wipe ends the run', () => {
  const { g, p } = arena(); const q = addPlayer(g, { id: 'p2', classId: 'wizard' }); q.x = p.x + 25; q.y = p.y; q.downed = true; q.hp = 0;
  setInput(g, p.id, { interact: true }); advance(g, 2.6);
  assert.equal(q.downed, false); assert.ok(q.hp > 0 && q.invulnerable > 0);
  p.downed = true; p.hp = 0; q.downed = true; q.hp = 0; step(g, .01); assert.equal(g.phase, 'defeat');
  assert.equal(action(g, p.id, { type: 'restart' }).ok, true); assert.equal(g.phase, 'playing'); assert.equal(g.players.length, 2); assert.ok(g.players.every(p => !p.downed));
});

test('boss kill pays personal loot and heart choices advance all three areas', () => {
  const g = createGame({ seed: 'bosses' }), p = addPlayer(g, { id: 'p1', classId: 'warrior' });
  for (let zone = 0; zone < 3; zone++) {
    const boss = g.enemies.find(e => e.boss); g.enemies = [boss]; boss.hp = 1; boss.attackTimer = 99; boss.skillTimer = 99;
    p.x = boss.x - 70; p.y = boss.y; p.cooldowns.primary = 0;
    setInput(g, p.id, { aimX: boss.x, aimY: boss.y, attack: true }); step(g, .01);
    assert.equal(g.phase, 'choice'); assert.ok(g.players[0].inventory.some(i => i.rarity === 'rare' || i.rarity === 'legendary'));
    const beforeHp = p.maxHp;
    assert.equal(action(g, p.id, { type: 'choose', choice: zone === 0 ? 'claim' : 'cleanse' }).ok, true);
    if (zone === 0) assert.equal(g.corruption, 1); else assert.equal(p.maxHp, beforeHp + 20);
    assert.equal(g.hearts.length, zone + 1);
    if (zone < 2) assert.equal(g.zoneIndex, zone + 1);
  }
  assert.equal(g.phase, 'victory'); assert.equal(g.zonesCleared, 3);
});

test('party scaling preserves health ratio through disconnect, reconnect and permanent leave', () => {
  const g = createGame({ seed: 'party' }); addPlayer(g, { id: 'a' }); const boss = g.enemies.find(e => e.boss), initial = boss.maxHp; boss.hp = initial * .5;
  addPlayer(g, { id: 'b' }); assert.ok(boss.maxHp > initial); assert.ok(Math.abs(boss.hp / boss.maxHp - .5) < .001);
  removePlayer(g, 'b'); assert.ok(Math.abs(boss.maxHp - initial) < .0001);
  addPlayer(g, { id: 'b' }); assert.ok(boss.maxHp > initial); assert.equal(g.players.length, 2);
  removePlayer(g, 'b', { permanent: true }); assert.equal(g.players.length, 1); assert.ok(Math.abs(boss.maxHp - initial) < .0001);
});

test('public snapshots exclude internals; full local saves preserve inventory, RNG and progression', () => {
  const { g, p } = arena('wizard'); p.inventory.push(generateLoot(g, 'wizard')); advance(g, .4);
  const snap = snapshot(g); assert.equal('_rng' in snap, false); assert.equal('_input' in snap.players[0], false);
  const save = serializeGame(g), restored = restoreGame(save); assert.ok(restored);
  assert.deepEqual(restored.players[0].inventory, p.inventory); assert.equal(restored.seed, g.seed);
  assert.deepEqual(generateLoot(restored, 'wizard'), generateLoot(g, 'wizard'));
  step(restored, .05); assert.ok(Number.isFinite(restored.players[0].x));
  assert.equal(restoreGame({ ...save, version: 'wrong' }), null); assert.equal(restoreGame('not json'), null);
});

test('busy four-player simulation remains finite and bounded', () => {
  const g = createGame({ seed: 'stress' });
  for (const [i, classId] of ['warrior', 'archer', 'wizard', 'wizard'].entries()) addPlayer(g, { id: String(i), classId });
  const room = g.map.rooms[1], cx = (room.x + room.w / 2) * 48, cy = (room.y + room.h / 2) * 48;
  for (const p of g.players) { p.x = cx; p.y = cy; p.invulnerable = 60; }
  for (let i = 0; i < 1200; i++) {
    for (const p of g.players) { const target = g.enemies.find(e => !e.boss) || g.enemies[0]; setInput(g, p.id, { mx: Math.sin(i / 60) * .3, my: Math.cos(i / 60) * .3, aimX: target?.x, aimY: target?.y, attack: true, skill1: true, skill2: true }); }
    step(g, 1 / 60);
  }
  for (const entity of [...g.players, ...g.enemies, ...g.projectiles]) assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y));
  assert.ok(g.effects.length <= 181 && g.projectiles.length <= 180 && g.loot.length <= 80);
  assert.ok(g.kills > 0);
});

test('all three bosses complete their attack cycles with finite projectile paths', () => {
  const g = createGame({ seed: 'patterns' }), p = addPlayer(g, { id: 'p1' });
  for (let zone = 0; zone < 3; zone++) {
    const boss = g.enemies.find(e => e.boss); g.enemies = [boss];
    p.x = boss.x - 180; p.y = boss.y; p.invulnerable = 100; boss.awake = true; boss.speed = 0;
    const patterns = new Set(); let shots = 0;
    for (let i = 0; i < 1200; i++) {
      step(g, 1 / 60);
      if (boss.telegraph) patterns.add(boss.telegraph.type);
      shots += g.projectiles.length;
      for (const b of g.projectiles) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy));
    }
    assert.ok(patterns.size >= 3, `${boss.name} only used ${[...patterns]}`); assert.ok(shots > 0);
    g.phase = 'choice'; assert.equal(action(g, p.id, { type: 'choose', choice: 'cleanse' }).ok, true);
  }
});

test('enemy chase steers its body into a corridor instead of snagging the wall corner', () => {
  const { g, p, enemy } = arena(); g.map.tiles.fill(0);
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.map.tiles[y * g.map.width + x] = 1; };
  carve(8, 3, 16, 8); carve(10, 8, 13, 14); carve(8, 14, 16, 21);
  p.x = 482; p.y = 840; p.invulnerable = 100;
  const e = enemy('corner', 482, 264); e.speed = 113; e.awake = true;
  advance(g, 8);
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < 80, `enemy stuck at ${e.x},${e.y}`);
});

test('tempering spends the stated gold, improves damage and stops after three upgrades', () => {
  const { g, p } = arena(); const damage = p.stats.damage;
  assert.equal(temperCost(p), 60);
  assert.equal(action(g, p.id, { type: 'temper' }).ok, false); assert.equal(p.gold, 0); assert.equal(p.stats.damage, damage);
  p.gold = 1000;
  for (let i = 0; i < 3; i++) {
    const cost = temperCost(p), gold = p.gold;
    const result = action(g, p.id, { type: 'temper' });
    assert.equal(result.ok, true); assert.equal(result.cost, cost); assert.equal(p.gold, gold - cost); assert.equal(p.equipment.weapon.temper, i + 1);
    assert.equal(p.stats.damage, damage + (i + 1) * 5);
  }
  const gold = p.gold;
  assert.equal(action(g, p.id, { type: 'temper' }).ok, false); assert.equal(p.gold, gold); assert.equal(p.stats.damage, damage + 15);
});
