import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopGame, COOP_PLAYER_IDS, FRIENDLY_FIRE_SCALE } from '../daily_flyer/themes/breach_assets/coop-core.mjs';
import { Game, WEAPONS } from '../daily_flyer/themes/breach_assets/core.mjs';
import { TOMORROW, TOMORROW_ID, TOMORROW_WORLD_REVISION } from '../daily_flyer/themes/breach_assets/tomorrow.mjs';
import { CoopClient, personalEvents } from '../daily_flyer/themes/breach_assets/coop-client.mjs';
import { BreachRooms, PROTOCOL } from '../server/breach-rooms.mjs';

const peer = () => ({ messages: [], closes: [], send(message) { this.messages.push(structuredClone(message)); }, close(...args) { this.closes.push(args); } });
const last = (p, type) => p.messages.findLast(m => m.type === type);
const request = (type, extra = {}) => ({ type, protocol: PROTOCOL, mission: 'crosslink-11', difficulty: 'standard', name: 'Operator', supportedMissions: ['crosslink-11', TOMORROW_ID], tomorrowRevision: TOMORROW_WORLD_REVISION, ...extra });
function roomFixture(count = 4, options = {}) {
  let time = 1000;
  const rooms = new BreachRooms({ now: () => time });
  const peers = Array.from({ length: count }, peer);
  rooms.handle(peers[0], request('create', options));
  const room = rooms.rooms.get(last(peers[0], 'welcome').roomId);
  for (let i = 1; i < count; i++) rooms.handle(peers[i], request('join', { roomId: room.id, name: `Operator ${i + 1}` }));
  return { rooms, peers, room, advance(ms) { time += ms; } };
}
function startRoom(f) {
  for (const p of f.peers) f.rooms.handle(p, { type: 'ready', ready: true });
  f.rooms.handle(f.peers[0], { type: 'start' });
  assert.equal(f.room.status, 'playing');
}
function firingRange(options = {}) {
  const game = new CoopGame({ players: [...COOP_PLAYER_IDS], friendlyFire: true, aimAssist: false, ...options });
  game.start();
  game.state.enemies = [];
  game.state.pickups = [];
  for (const door of game.state.doors) door.open = true;
  for (const [id, x, z] of [['p1', 10.5, 18.5], ['p2', 10.5, 17.5], ['p3', 14.5, 18.5], ['p4', 8.5, 18.5]]) {
    Object.assign(game.state.players[id], { x, z, health: 100, armor: 0, angle: 0 });
  }
  game.drainEvents();
  return game;
}
function equip(game, id, weapon) {
  const p = game.state.players[id], spec = WEAPONS[weapon];
  if (spec.ownershipKey) p[spec.ownershipKey] = true;
  p.weapon = weapon; p.ammo[spec.ammoKey] = 20;
}

for (const count of [2, 3, 4]) test(`${count} operators share one authoritative room and every present operator must ready`, () => {
  const f = roomFixture(count);
  assert.equal(f.rooms.record(f.room).maxPlayers, 4);
  assert.deepEqual([...f.room.players.keys()], COOP_PLAYER_IDS.slice(0, count));
  f.rooms.handle(f.peers.at(-1), { type: 'start' });
  assert.equal(last(f.peers.at(-1), 'error').code, 'OWNER_ONLY');
  for (const p of f.peers.slice(0, -1)) f.rooms.handle(p, { type: 'ready', ready: true });
  f.rooms.handle(f.peers[0], { type: 'start' });
  assert.equal(last(f.peers[0], 'error').code, 'NOT_READY');
  assert.equal(f.room.game, null);
  f.rooms.handle(f.peers.at(-1), { type: 'ready', ready: true });
  f.rooms.handle(f.peers[0], { type: 'start' });
  assert.equal(f.room.status, 'playing');
  assert.deepEqual(Object.keys(f.room.game.state.players), COOP_PLAYER_IDS.slice(0, count));
  for (const p of f.peers) assert.deepEqual(last(p, 'state'), last(f.peers[0], 'state'));
  assert.equal(f.room.game.state.time, 0);
  f.rooms.step(.05);
  assert.equal(f.room.game.state.time, .05, 'four players do not advance the world four times');
});

test('room admission rejects a fifth slot, an old protocol and malformed friendly-fire settings', () => {
  const f = roomFixture(4), fifth = peer();
  f.rooms.handle(fifth, request('join', { roomId: f.room.id }));
  assert.equal(last(fifth, 'error').code, 'ROOM_FULL');
  assert.equal(f.room.players.size, 4);
  const single = roomFixture(1);
  single.rooms.handle(single.peers[0], { type: 'ready', ready: true });
  single.rooms.handle(single.peers[0], { type: 'start' });
  assert.equal(single.room.status, 'lobby');
  for (const fields of [{ protocol: 2 }, { friendlyFire: 'true' }, { friendlyFire: 1 }]) {
    const rooms = new BreachRooms(), p = peer(); rooms.handle(p, request('create', fields));
    assert.equal(rooms.rooms.size, 0);
    assert.ok(['VERSION_MISMATCH', 'INVALID_FRIENDLY_FIRE'].includes(last(p, 'error').code));
  }
});

test('Tomorrow requires matching content and advertises friendly fire before anyone joins', () => {
  for (const revision of [undefined, null, '1', 0, 2]) {
    const rooms = new BreachRooms(), p = peer();
    rooms.handle(p, request('create', { mission: TOMORROW_ID, tomorrowRevision: revision }));
    assert.equal(last(p, 'error').code, 'VERSION_MISMATCH');
    assert.equal(rooms.rooms.size, 0);
  }
  const f = roomFixture(4, { mission: TOMORROW_ID });
  assert.equal(f.rooms.record(f.room).friendlyFire, true);
  assert.equal(f.rooms.record(f.room).tomorrowRevision, TOMORROW_WORLD_REVISION);
  startRoom(f);
  assert.equal(f.room.game.state.friendlyFire, true);
  assert.equal(roomFixture(2).room.friendlyFire, false, 'earlier missions retain their default damage rules');
});

test('p3 reconnects to the same reserved slot and all four operators must resume', () => {
  const f = roomFixture(); startRoom(f);
  const old = f.peers[2], token = last(old, 'welcome').token, game = f.room.game;
  f.rooms.handle(old, { type: 'input', playerId: 'p1', seq: 9, forward: .4, strafe: 0, angle: 1, fire: false });
  assert.equal(f.room.players.get('p3').seq, 9);
  assert.equal(f.room.players.get('p1').seq, -1, 'a fourth-slot packet cannot claim the owner');
  f.rooms.disconnect(old);
  assert.equal(f.room.status, 'paused');
  const returned = peer();
  f.rooms.handle(returned, request('join', { roomId: f.room.id, token, replace: true }));
  assert.equal(last(returned, 'welcome').selfId, 'p3');
  assert.equal(last(returned, 'welcome').resumed, true);
  assert.equal(f.room.game, game);
  f.rooms.handle(old, { type: 'input', seq: 99, forward: 1, strafe: 1, angle: 0, fire: true });
  assert.equal(last(old, 'error').code, 'NOT_IN_ROOM');
  for (const p of [f.peers[0], f.peers[1], f.peers[3]]) f.rooms.handle(p, { type: 'resume' });
  assert.equal(f.room.status, 'paused');
  f.rooms.handle(returned, { type: 'resume' });
  assert.equal(f.room.status, 'playing');
  assert.equal(f.room.players.get('p3').seq, -1, 'the old sequence and held fire do not leak into the replacement');
});

test('three open menus leave the world running; four pause it; one returning resumes it', () => {
  const f = roomFixture(); startRoom(f);
  for (const p of f.peers.slice(0, 3)) f.rooms.handle(p, { type: 'menu', open: true });
  assert.equal(f.room.status, 'playing');
  f.rooms.handle(f.peers[3], { type: 'menu', open: true });
  assert.equal(f.room.status, 'paused'); assert.equal(f.room.pauseKind, 'menus');
  f.rooms.handle(f.peers[2], { type: 'menu', open: false });
  assert.equal(f.room.status, 'playing');
  f.rooms.disconnect(f.peers[0]);
  f.rooms.handle(f.peers[3], { type: 'menu', open: false });
  assert.equal(f.room.status, 'paused', 'a menu action cannot bypass a disconnected operator');
});

test('four operators receive distinct clear fallback spawns on older missions', () => {
  const game = new CoopGame({ players: [...COOP_PLAYER_IDS] });
  const positions = Object.values(game.state.players);
  for (const p of positions) {
    assert.ok(game._clearCircle(p.x, p.z, .22));
    for (const other of positions) if (p !== other) assert.ok(Math.hypot(p.x - other.x, p.z - other.z) >= .7);
  }
  for (const players of [['p1', 'p2', 'p3', 'p4', 'p5'], ['p1', 'p3', 'p3'], ['__proto__']]) assert.throws(() => new CoopGame({ players }), /distinct/);
});

for (const weapon of ['pistol', 'repeater', 'shotgun', 'arc', 'nullgun', 'lance', 'ricochet']) test(`${weapon} resolves friendly fire through the real shot path without applying monster effects`, () => {
  const game = firingRange(); equip(game, 'p1', weapon);
  game.update(.01, { p1: { angle: 0, fire: true } });
  const target = game.state.players.p2;
  const damage = Math.round(WEAPONS[weapon].damage * WEAPONS[weapon].pellets * FRIENDLY_FIRE_SCALE);
  assert.equal(target.health, 100 - damage);
  assert.equal(target.stunTimer, undefined); assert.equal(target.suppressedTimer, undefined);
  assert.equal(game.state.enemies.length, 0, 'allies never enter the enemy simulation');
  assert.equal(game.state.kills, 0);
  const events = game.drainEvents();
  assert.ok(events.some(e => e.type === 'friendly-fire' && e.playerId === 'p1' && e.targetId === 'p2'));
  assert.ok(events.some(e => e.type === 'hurt' && e.playerId === 'p2' && e.sourceId === 'p1' && e.friendlyFire));
  assert.equal(personalEvents(events, 'p3').some(e => e.type === 'friendly-fire' || e.type === 'hurt'), false);
});

test('friendly fire uses cover and teammate shot occlusion, while a lance pierces at most three bodies', () => {
  const covered = firingRange();
  Object.assign(covered.state.players.p2, { x: 10.5, z: 15.5 });
  covered.state.doors.find(d => d.id === 'arrival').open = false;
  covered.update(.01, { p1: { angle: 0, fire: true } });
  assert.equal(covered.state.players.p2.health, 100);
  const occluded = firingRange();
  occluded.state.enemies.push({ id: 'behind-friend', type: 'runner', x: 10.5, z: 15.5, alive: true, health: 500, maxHealth: 500, attackCooldown: 100, hitTimer: 0, active: false, angle: 0 });
  occluded.update(.01, { p1: { angle: 0, fire: true } });
  assert.equal(occluded.state.players.p2.health, 88);
  assert.equal(occluded.state.enemies[0].health, 500, 'a pistol bullet stops at the nearer teammate');
  const lance = firingRange(); equip(lance, 'p1', 'lance');
  [8.5, 10.5, 12.5, 14].forEach((x, i) => Object.assign(lance.state.players[COOP_PLAYER_IDS[i]], { x, z: 18.5 }));
  lance.update(.01, { p1: { angle: Math.PI / 2, fire: true } });
  for (const id of ['p2', 'p3', 'p4']) assert.equal(lance.state.players[id].health, 60);
});

test('a reflected carbine shot can hit a teammate behind the shooter', () => {
  const game = firingRange(); equip(game, 'p1', 'ricochet');
  Object.assign(game.state.players.p2, { x: 9.5, z: 18.5 });
  Object.assign(game.state.players.p3, { x: 13.5, z: 17.5 });
  Object.assign(game.state.players.p4, { x: 8.5, z: 17.5 });
  game.update(.01, { p1: { angle: Math.PI / 2, fire: true } });
  assert.equal(game.state.players.p2.health, 81);
  assert.ok(game.state.effects.some(e => e.type === 'ricochet' && e.segments.length === 2));
});

test('grenade teammate damage retains p4 ownership and honors cover, distance and the damage setting', () => {
  const game = firingRange();
  Object.assign(game.state.players.p4, { x: 10.5, z: 18.5 });
  game._explodeGrenade({ id: 'p4-grenade', x: 10.5, z: 18.5, ownerId: 'p4' });
  assert.equal(game.state.players.p4.health, 45, 'the thrower receives existing self splash exactly once');
  assert.equal(game.state.players.p1.health, 55);
  assert.ok(game.state.players.p2.health < 100);
  assert.equal(game.state.players.p3.health, 100);
  assert.equal(game.state.player, game.state.players.p1, 'nested damage restores the normal alias');
  assert.ok(game.drainEvents().some(e => e.type === 'friendly-fire' && e.sourceId === 'p4' && e.targetId === 'p1'));
  const wall = firingRange(); Object.assign(wall.state.players.p2, { x: 10.5, z: 15.5 });
  wall.state.doors.find(d => d.id === 'arrival').open = false;
  wall._explodeGrenade({ id: 'wall-grenade', x: 10.5, z: 17.5, ownerId: 'p1' });
  assert.equal(wall.state.players.p2.health, 100);
  const safe = firingRange({ friendlyFire: false });
  safe._explodeGrenade({ id: 'safe-grenade', x: 10.5, z: 17.5, ownerId: 'p1' });
  assert.equal(safe.state.players.p2.health, 100);
});

test('difficulty does not amplify friendly shots, aim assist does not choose teammates, and old missions keep damage disabled', () => {
  const hard = firingRange({ difficulty: 'insane' });
  hard.update(.01, { p1: { angle: 0, fire: true } });
  assert.equal(hard.state.players.p2.health, 88);
  const aim = firingRange({ aimAssist: true });
  Object.assign(aim.state.players.p2, { x: 10.88, z: 14.5 });
  aim.update(.01, { p1: { angle: 0, fire: true, aimAssist: true } });
  assert.equal(aim.state.players.p2.health, 100, 'an ally inside aim-assist tolerance is not an aim-assist candidate');
  const old = new CoopGame({ players: [...COOP_PLAYER_IDS] }); old.start();
  old.state.enemies = []; old.state.pickups = [];
  Object.assign(old.state.players.p2, { x: 10.5, z: 17.5 });
  old.update(.01, { p1: { angle: 0, fire: true } });
  assert.equal(old.state.players.p2.health, 100); assert.equal(old.state.friendlyFire, false);
});

test('friendly damage can down teammates and checkpoints revive and retain all four identities', () => {
  const game = firingRange();
  game.state.players.p2.health = 5;
  game.update(.01, { p1: { angle: 0, fire: true } });
  assert.equal(game.state.players.p2.alive, false);
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.kills, 0);
  game._withPlayer('p3', () => game._hurt(1000, { x: 0, z: 0 }));
  game._withPlayer('p4', () => game._hurt(1000, { x: 0, z: 0 }));
  game._withPlayer('p1', () => game._saveCheckpoint('Rendezvous.'));
  assert.ok(Object.values(game.state.players).every(p => p.alive && p.health >= 75));
  assert.equal(game.state.friendlyFire, true);
  const checkpointPositions = Object.fromEntries(Object.entries(game.state.players).map(([id, p]) => [id, [p.x, p.z]]));
  for (const id of COOP_PLAYER_IDS) game._withPlayer(id, () => game._hurt(1000, { x: 0, z: 0 }));
  assert.equal(game.state.status, 'dead');
  assert.equal(game.restartCheckpoint(), true);
  assert.deepEqual(Object.keys(game.networkSnapshot().players), COOP_PLAYER_IDS);
  for (const [id, p] of Object.entries(game.state.players)) assert.deepEqual([p.x, p.z], checkpointPositions[id]);
  assert.equal(game.state.friendlyFire, true);
});

function canReachArrivalHall(game, player) {
  const target = game.state.interactables.find(i => i.id === 'aux-power');
  assert.ok(target, 'the mission has a common power hall');
  const start = [Math.floor(player.x), Math.floor(player.z)], goal = `${Math.floor(target.x)},${Math.floor(target.z)}`;
  const pending = [start], seen = new Set([start.join(',')]);
  for (let n = 0; n < pending.length; n++) {
    const [x, z] = pending[n]; if (`${x},${z}` === goal) return true;
    for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
      const key = `${nx},${nz}`;
      if (seen.has(key) || nx < 0 || nz < 0 || nx >= game.level.width || nz >= game.level.height || game.level.grid[nz][nx] === '#') continue;
      const door = game.state.doors.find(d => Math.floor(d.x) === nx && Math.floor(d.z) === nz);
      if (door && !door.open && door.requires) continue;
      seen.add(key); pending.push([nx, nz]);
    }
  }
  return false;
}

test('every authored arrival variant is deterministic, separated safely and reachable without late-game equipment', () => {
  assert.ok(TOMORROW.coopSpawnVariants.length >= 2);
  const layouts = new Set(); let split = false, together = false;
  for (let seed = 1; seed <= TOMORROW.coopSpawnVariants.length; seed++) {
    const options = { mission: TOMORROW_ID, players: [...COOP_PLAYER_IDS], seed };
    const game = new CoopGame(options), repeat = new CoopGame(options);
    const players = Object.values(game.state.players);
    assert.deepEqual(players.map(p => [p.x, p.z]), Object.values(repeat.state.players).map(p => [p.x, p.z]));
    layouts.add(JSON.stringify(players.map(p => [p.x, p.z])));
    const dispersed = players.some(p => Math.hypot(p.x - players[0].x, p.z - players[0].z) > 12);
    split ||= dispersed; together ||= !dispersed;
    for (const p of players) {
      assert.equal(p.hasShotgun, false);
      assert.ok(game._clearCircle(p.x, p.z, .22), `clear spawn ${seed}/${p.id}`);
      assert.ok(canReachArrivalHall(game, p), `walkable arrival ${seed}/${p.id}`);
      for (const other of players) if (p !== other) assert.ok(Math.hypot(p.x - other.x, p.z - other.z) >= .7);
    }
  }
  assert.equal(layouts.size, TOMORROW.coopSpawnVariants.length);
  assert.ok(split && together, 'arrivals sometimes separate the team and sometimes keep it together');
});

test('the fourth client projects its own health, position and objective with all three other operators', () => {
  const game = new CoopGame({ mission: TOMORROW_ID, players: [...COOP_PLAYER_IDS], seed: 2 }); game.start();
  const client = new CoopClient({ base: 'same-origin', origin: 'https://breach.example', storage: null, statusUI: false });
  try {
    client.selfId = 'p4'; client.connected = true;
    client.room = { id: 'ABCDEFGH', mission: TOMORROW_ID, tomorrowRevision: TOMORROW_WORLD_REVISION, difficulty: 'standard', status: 'playing', ownerId: 'p1', maxPlayers: 4, friendlyFire: true };
    client._applySnapshot({ type: 'state', tick: 1, ackByPlayer: { p1: 0, p2: 0, p3: 0, p4: 0 }, state: game.networkSnapshot(), events: [] });
    assert.equal(client.view.state.player, client.view.state.players.p4);
    assert.equal(client.view.state.localPlayerId, 'p4');
    assert.equal(Object.keys(client.view.state.players).length, 4);
    assert.equal(client.view.state.friendlyFire, true);
    assert.equal(client.view.state.partyScale, game.state.partyScale);
    for (const enemy of game.state.enemies) {
      const projected = client.view.state.enemies.find(e => e.id === enemy.id);
      assert.equal(projected.maxHealth, enemy.maxHealth, 'WebGL and software views consume the same scaled network maximum');
      assert.equal(projected.health, enemy.health);
    }
    assert.equal(client.view.state.player.x, game.state.players.p4.x);
    assert.ok(client.view.getObjective());
  } finally { client.leave(); }
});

test('Tomorrow scales enemy health with party size after difficulty while preserving attack timing and older maps', () => {
  const original = JSON.stringify(TOMORROW.enemies);
  for (const difficulty of ['standard', 'insane']) for (const count of [1, 2, 3, 4]) {
    const solo = new Game({ mission: TOMORROW_ID, difficulty });
    const game = new CoopGame({ mission: TOMORROW_ID, difficulty, players: COOP_PLAYER_IDS.slice(0, count) });
    const scale = 1 + .30 * (count - 1);
    assert.equal(game.state.partyScale, scale);
    for (const enemy of game.state.enemies) {
      const base = solo.state.enemies.find(e => e.id === enemy.id);
      assert.equal(enemy.health, Math.round(base.health * scale));
      assert.equal(enemy.maxHealth, Math.round(base.maxHealth * scale));
      assert.equal(enemy.attackCooldown, base.attackCooldown);
      assert.equal(enemy.bossPhase, base.bossPhase);
      assert.equal(enemy.telegraph, base.telegraph);
    }
    assert.deepEqual(game._difficulty, solo._difficulty, 'party size never changes warning, damage or movement tuning');
  }
  for (const mission of ['crosslink-11', 'beneath-the-shadow']) {
    const solo = new Game({ mission, difficulty: 'hard' });
    const team = new CoopGame({ mission, difficulty: 'hard', players: [...COOP_PLAYER_IDS] });
    assert.equal(team.state.partyScale, 1);
    assert.deepEqual(team.state.enemies.map(e => [e.health, e.maxHealth]), solo.state.enemies.map(e => [e.health, e.maxHealth]));
  }
  assert.equal(JSON.stringify(TOMORROW.enemies), original, 'authored enemy data is unchanged');
});

test('scaled enemy health survives checkpoint retry and full restart without multiplying twice', () => {
  const game = new CoopGame({ mission: TOMORROW_ID, difficulty: 'insane', players: [...COOP_PLAYER_IDS] }); game.start();
  const original = game.state.enemies.map(e => [e.id, e.health, e.maxHealth]);
  game._withPlayer('p1', () => game._saveCheckpoint('Arrival checkpoint.'));
  game.state.enemies[0].health -= 17;
  game.state.status = 'dead';
  assert.equal(game.restartCheckpoint(), true);
  assert.equal(game.state.partyScale, 1.9);
  assert.deepEqual(game.state.enemies.map(e => [e.id, e.health, e.maxHealth]), original);
  game.restart();
  assert.equal(game.state.partyScale, 1.9);
  assert.deepEqual(game.state.enemies.map(e => [e.id, e.health, e.maxHealth]), original);
});

test('each Tomorrow operator gets one accurate identity and arrival message per mission start', () => {
  const game = new CoopGame({ mission: TOMORROW_ID, players: [...COOP_PLAYER_IDS], seed: 2 });
  assert.equal(game.drainEvents().some(e => e.arrival), false);
  game.start();
  const events = game.drainEvents();
  for (const id of COOP_PLAYER_IDS) {
    const own = personalEvents(events, id).filter(e => e.arrival);
    assert.equal(own.length, 1);
    assert.equal(own[0].playerId, id);
    assert.ok(own[0].text.startsWith(`${id.toUpperCase()} · ${game.getZone(id)}.`));
    assert.match(own[0].text, /Follow signs to the exchange\. Friendly fire is on\./);
  }
  game.start(); game.pause(); game.resume(); game.start();
  assert.equal(game.drainEvents().some(e => e.arrival), false, 'resuming never repeats the arrival messages');
  game.restart();
  assert.equal(game.drainEvents().filter(e => e.arrival).length, 4, 'a fresh mission restart introduces each new arrival once');
});
