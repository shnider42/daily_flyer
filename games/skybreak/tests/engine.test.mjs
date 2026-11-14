import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, MAX_PLAYERS, WEAPONS, normalizeInput, movePlayer, raycastWorld, aimDirection, buildPlacement, supportHeight } from '../public/engine.mjs';
import { terrainHeight, BUILDINGS, buildingBase, COLLIDERS, PADS } from '../public/world.mjs';

function matchInPlay() {
  const m = new Match({ seed: 42 });
  for (let i = 0; i < MAX_PLAYERS; i++) m.setHuman(i, 'Pilot ' + i, i);
  m.start(); m.phase = 'active'; m.time = 10;
  for (const p of m.players) {
    p.y = terrainHeight(p.x, p.z); p.gliding = false; p.grounded = true; p.vy = 0;
  }
  return m;
}
function place(p, x, z, y = terrainHeight(x, z)) {
  Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, gliding: false, yaw: 0, pitch: 0 });
}
function advance(m, seconds, inputs = new Map()) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.step(1 / 30, inputs);
}

test('ten permanent slots, human identity, round reset and detached snapshots', () => {
  const m = new Match();
  assert.equal(m.players.length, 10);
  assert.ok(m.players.every(p => p.bot));
  assert.equal(m.setHuman(10, 'Nope'), false);
  m.setHuman(0, '  Chris<>  ', 2);
  assert.equal(m.players[0].name, 'Chris');
  const id = m.id;
  m.start(); assert.notEqual(m.id, id);
  assert.equal(m.players[0].bot, false);
  const snapshot = m.snapshot();
  snapshot.players[0].ammo[0] = 999;
  assert.equal(m.players[0].ammo[0], 30);
  assert.ok(!('_bot' in snapshot.players[0]));
  m.removeHuman(0);
  assert.equal(m.players[0].bot, true);
  assert.equal(m.players[0].name, 'Chris');
});

test('all input is finite and diagonal input cannot exceed movement speed', () => {
  const bad = normalizeInput({ moveX: Infinity, moveZ: NaN, yaw: Infinity, pitch: -Infinity, fire: 'yes', sprint: 1 });
  assert.equal(bad.moveX, 0); assert.equal(bad.moveZ, 0); assert.equal(bad.yaw, 0); assert.equal(bad.pitch, 0);
  assert.equal(bad.fire, false); assert.equal(bad.sprint, false);
  const diagonal = normalizeInput({ moveX: 20, moveZ: 20, yaw: 100, pitch: 5 });
  assert.ok(Math.hypot(diagonal.moveX, diagonal.moveZ) <= 1.000001);
  assert.ok(diagonal.yaw >= -Math.PI && diagonal.yaw <= Math.PI);
  assert.equal(diagonal.pitch, 1.35);
  assert.doesNotThrow(() => normalizeInput(null));
});

test('drop resolves to grounded players and active match without early combat', () => {
  const m = new Match(); for (let i = 0; i < 10; i++) m.setHuman(i, 'Pilot');
  m.start();
  assert.ok(m.players.every(p => p.gliding));
  advance(m, 5);
  assert.equal(m.phase, 'drop');
  assert.ok(m.players.every(p => p.hp === 100));
  advance(m, 8.2);
  assert.equal(m.phase, 'active');
  assert.ok(m.players.every(p => !p.gliding && p.grounded));
});

test('opening ceasefire covers a full high-to-low glider descent', () => {
  const m = new Match(); for (let i = 0; i < 10; i++) m.setHuman(i, 'Pilot');
  m.start();
  const inputs = new Map([[4, { yaw: Math.PI, moveZ: 1 }], [0, { yaw: 0, fire: true }]]);
  advance(m, 10.1, inputs);
  assert.equal(m.phase, 'drop', 'opening combat cannot start before a hill-to-lowland glide finishes');
  assert.ok(m.players[4].gliding, 'reproduces the late-landing high-spawn route');
  assert.equal(m.players[0].ammo[0], WEAPONS[0].magazine, 'no firing during the protected drop');
  advance(m, 3.1, inputs);
  assert.equal(m.phase, 'active');
  assert.equal(m.players[4].gliding, false);
});

test('bots can target gliders redeployed during the active match', () => {
  const m = matchInPlay(), bot = m.players[0], target = m.players[1];
  for (let i = 2; i < 10; i++) place(m.players[i], 100, -100);
  place(bot, 0, 10); bot.bot = true;
  place(target, 0, 0, terrainHeight(0, 0) + 12); target.gliding = true; target.grounded = false;
  m.botInput(bot, 1 / 30);
  assert.equal(bot._bot.target, 1, 'launch pads must not make players invisible to bot targeting');
});

test('movement follows camera coordinates, jump is edge-triggered, and gravity lands', () => {
  const p = matchInPlay().players[0];
  place(p, 0, 10);
  movePlayer(p, { moveZ: 1, yaw: 0 }, .1);
  assert.ok(p.z < 10); assert.ok(Math.abs(p.x) < .01);
  const x = p.x;
  movePlayer(p, { moveZ: 1, yaw: Math.PI / 2 }, .1);
  assert.ok(p.x < x);
  const y = p.y;
  movePlayer(p, { jump: true, yaw: 0 }, 1 / 30);
  assert.ok(p.y > y); assert.equal(p.grounded, false);
  for (let i = 0; i < 60; i++) movePlayer(p, { jump: true, yaw: 0 }, 1 / 30);
  assert.ok(p.grounded, 'holding jump must not bounce repeatedly');
});

test('static walls stop walking while the designed doorway remains passable', () => {
  const b = BUILDINGS.find(b => b.yaw === 0);
  const p = matchInPlay().players[0];
  place(p, b.x, b.z + b.d / 2 + 3, buildingBase(b));
  for (let i = 0; i < 35; i++) movePlayer(p, { moveZ: 1, yaw: 0 }, 1 / 30);
  assert.ok(p.z < b.z + b.d / 2 - 1, 'walk through doorway');
  place(p, b.x + b.w / 2 - 1, b.z, buildingBase(b));
  for (let i = 0; i < 50; i++) movePlayer(p, { moveX: 1, yaw: 0 }, 1 / 30);
  assert.ok(p.x < b.x + b.w / 2, 'cannot walk through side wall');
});

test('fire spends ammunition, damages shield first, and records authoritative hit events', () => {
  const m = matchInPlay(), p = m.players[0], target = m.players[1];
  place(p, 0, 10); place(target, 0, 0);
  p.pitch = -.04;
  m.step(1 / 30, new Map([[0, { yaw: 0, pitch: -.04, fire: true, aim: true }]]));
  assert.equal(p.ammo[0], 29);
  assert.ok(target.shield < 50);
  assert.equal(target.hp, 100);
  assert.ok(m.events.some(e => e.type === 'shot' && e.player === 0));
  assert.ok(m.events.some(e => e.type === 'hit' && e.target === 1));
  const before = p.ammo[0];
  m.step(1 / 30, new Map([[0, { yaw: 0, pitch: -.04, fire: true }]]));
  assert.equal(p.ammo[0], before, 'cooldown prevents fire rate abuse');
});

test('camera-center aim offsets hit close targets without rotating movement', () => {
  const m = matchInPlay(), p = m.players[0], target = m.players[1];
  place(p, 0, 10);
  // With a .82m shoulder offset, the center of the rendered camera sees this
  // target at10m while the uncorrected yaw0 bullet passes .63m to its left.
  const xOffset = .82 * (60 - 10) / (60 + 5.2);
  place(target, xOffset, 0);
  const aimYaw = Math.atan2(-xOffset, -(-10));
  const aimPitch = Math.atan2(-.35, Math.hypot(xOffset, 10));
  m.step(1 / 30, new Map([[0, { yaw: 0, pitch: 0, aimYaw, aimPitch, fire: true, aim: true, moveZ: 1 }]]));
  assert.ok(target.shield < 50, 'corrected muzzle ray hits target under center-camera reticle');
  assert.equal(p.yaw, 0, 'view and movement yaw remain independent');
  assert.equal(p.x, 0, 'aim correction must not make forward movement drift sideways');
  assert.ok(p.z < 10);
  assert.equal(p.aimYaw, aimYaw);
  const hostile = normalizeInput({ yaw: .5, pitch: -.2, aimYaw: Infinity, aimPitch: NaN });
  assert.equal(hostile.aimYaw, .5); assert.equal(hostile.aimPitch, -.2);
  const limits = normalizeInput({ aimYaw: 1e200, aimPitch: 1e200 });
  assert.ok(Number.isFinite(limits.aimYaw)); assert.equal(limits.aimPitch, 1.35);
});

test('walls block bullets, take damage and can be destroyed', () => {
  const m = matchInPlay(), p = m.players[0], target = m.players[1];
  place(p, 0, 10); place(target, 0, 0);
  m.builds.push({ id: 'test-wall', type: 'wall', x: 0, y: p.y, z: 5, yaw: 0, hp: 170, maxHp: 170, owner: 2 });
  m.step(1 / 30, new Map([[0, { yaw: 0, pitch: 0, fire: true, aim: true }]]));
  assert.equal(target.shield, 50); assert.equal(target.hp, 100);
  assert.ok(m.builds[0].hp < 170);
  advance(m, 2.5, new Map([[0, { yaw: 0, pitch: 0, fire: true, aim: true }]]));
  assert.equal(m.builds.length, 0);
  assert.ok(target.shield < 50 || target.hp < 100);
});

test('reload uses reserves, switching to an unowned gun fails and ammo cannot go negative', () => {
  const m = matchInPlay(), p = m.players[0];
  p.ammo[0] = 0; p.reserve[0] = 12;
  assert.equal(m.action(0, 'slot3'), false);
  assert.equal(m.action(0, 'reload'), true);
  assert.equal(m.action(0, 'reload'), false);
  advance(m, 2);
  assert.equal(p.ammo[0], 12); assert.equal(p.reserve[0], 0);
  advance(m, 4, new Map([[0, { fire: true, yaw: 0 }]]));
  assert.equal(p.ammo[0], 0); assert.equal(p.reserve[0], 0);
});

test('loot can only be collected nearby and removed once; weapon upgrades persist', () => {
  const m = matchInPlay(), p = m.players[0];
  place(p, 0, 10);
  m.loot = [{ id: 'gun', kind: 'weapon', x: 0, z: 8, y: p.y + .2, weapon: 3, rarity: 3 }];
  assert.equal(m.action(1, 'interact'), false);
  assert.equal(m.action(0, 'interact'), true);
  assert.equal(p.owned[3], true); assert.equal(p.rarity[3], 3); assert.equal(p.weapon, 3);
  assert.equal(m.loot.length, 0); assert.equal(m.action(0, 'interact'), false);
  m.giveWeapon(p, 3, 0); assert.equal(p.rarity[3], 3);
});

test('medkits require uninterrupted use and shield cells restore only shield', () => {
  const m = matchInPlay(), p = m.players[0];
  place(p, 0, 10); p.hp = 20; p.shield = 0;
  assert.equal(m.action(0, 'heal'), true);
  advance(m, 1); assert.equal(p.hp, 20);
  m.step(1 / 30, new Map([[0, { moveZ: 1, yaw: 0 }]]));
  assert.equal(p.using, ''); assert.equal(p.medkits, 1);
  assert.equal(m.action(0, 'heal'), true);
  advance(m, 3.2); assert.equal(p.hp, 85); assert.equal(p.medkits, 0);
  assert.equal(m.action(0, 'shield'), true);
  advance(m, 2); assert.equal(p.shield, 50); assert.equal(p.hp, 85); assert.equal(p.shieldCells, 1);
});

test('build placements cost materials, reject overlaps and form walkable ramps', () => {
  const m = matchInPlay(), p = m.players[0];
  place(p, 0, 20); p.yaw = 0;
  const proposal = buildPlacement(p, 'ramp', m.builds);
  assert.equal(proposal.valid, true, proposal.reason);
  assert.equal(m.action(0, 'ramp'), true); assert.equal(p.materials, 50);
  assert.equal(m.action(0, 'ramp'), false, 'cooldown prevents repeated actions');
  advance(m, .7);
  assert.equal(m.action(0, 'ramp'), false, 'cannot overlap the same structure');
  const ramp = m.builds[0];
  const low = supportHeight(ramp.x, ramp.z + 2, ramp.y + 4, m.builds);
  const high = supportHeight(ramp.x, ramp.z - 2, ramp.y + 4, m.builds);
  assert.ok(high > low + 1.5);
  p.materials = 0;
  assert.equal(buildPlacement(p, 'wall', []).valid, false);
});

test('jump pads redeploy a controllable glider', () => {
  const m = matchInPlay(), p = m.players[0], pad = PADS[0];
  place(p, pad.x, pad.z, pad.y);
  m.step(1 / 30);
  assert.equal(p.gliding, true); assert.ok(p.vy > 20);
  const previous = p.x;
  advance(m, .5, new Map([[0, { moveX: 1, yaw: 0 }]]));
  assert.ok(p.x > previous + 1); assert.ok(p.y > pad.y + 5);
});

test('storm bypasses shield, shrinks and ends a match with a ranked winner', () => {
  const m = matchInPlay();
  m.storm.radius = 20; m.storm.damage = 5;
  const p = m.players[0]; place(p, 80, 0); p.shield = 100;
  advance(m, 1);
  assert.ok(p.hp < 100); assert.equal(p.shield, 100);
  for (let i = 1; i < 10; i++) m.hurt(m.players[i], 1000, 0);
  m.step(1 / 30);
  assert.equal(m.phase, 'finished'); assert.equal(m.winner, 0); assert.equal(p.placement, 1);
  assert.equal(p.kills, 9);
  assert.ok(m.events.some(e => e.type === 'win'));
});

test('bots route around a building and enter its door to collect loot', () => {
  const m = matchInPlay(), p = m.players[0], b = BUILDINGS[0];
  for (let i = 1; i < 10; i++) place(m.players[i], 100, -100);
  place(p, b.x, b.z - b.d / 2 - 3);
  p.bot = true;
  m.loot = [{ id: 'inside', kind: 'weapon', weapon: 3, rarity: 2, x: b.x, z: b.z, y: buildingBase(b) + .2 }];
  for (let i = 0; i < 600 && !p.owned[3]; i++) m.step(1 / 30);
  assert.equal(p.owned[3], true, 'bot must use the entrance rather than running against the back wall');
});

test('long running bot match completes with combat, bounded entities and finite state', () => {
  const m = new Match({ seed: 52 }); m.start();
  for (let i = 0; i < 10500 && m.phase !== 'finished'; i++) m.step(1 / 30);
  assert.equal(m.phase, 'finished');
  assert.ok(m.players.some(p => p.kills > 0), 'bots must fight rather than waiting only for the storm');
  assert.ok(m.time <= 350);
  assert.ok(m.builds.length <= 100); assert.ok(m.loot.length <= 180); assert.ok(m.events.length <= 30);
  for (const p of m.players) {
    for (const key of ['x', 'y', 'z', 'hp', 'shield', 'yaw']) assert.ok(Number.isFinite(p[key]), `${p.id}.${key}`);
    assert.ok(p.ammo.every(a => a >= 0)); assert.ok(p.reserve.every(a => a >= 0));
  }
});
