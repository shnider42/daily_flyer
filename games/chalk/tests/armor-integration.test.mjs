import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, rebuildNavigationGrid } from '../public/sim.mjs';
import { CoopRooms } from '../server/rooms.mjs';
import { PROTOCOL } from '../public/coop-protocol.mjs';
import { CoopStateHydrator, predictMovement } from '../public/coop-client.mjs';
import { pointBlockedByVehicle, vehiclePoseClear } from '../public/armored-vehicles.mjs';

function run(state, seconds, input = {}) {
  for (let frame = 0; frame < Math.ceil(seconds * 30) && state.status === 'playing'; frame++) step(state, input, 1 / 30);
}
function clearArena(state) {
  state.enemies = []; state.allies = []; state.civilians = []; state.survivors = [];
  state.maxEnemies = 0; state.spawnTimer = 1e9; state.vehicles = []; state.convoyVehicleIds = [];
  state.armorControl = { version: 1, units: [] };
  state.world.walls = []; state.world.buildings = []; state.world.streetSolids = [];
  state.world.navigationSolids = []; state.world.structuralSolids = []; state.world.props = [];
  state.world.geometryRevision = (state.world.geometryRevision || 0) + 1;
  rebuildNavigationGrid(state);
  if (state.story) state.story.opportunities = [];
  const player = state.squad[0];
  Object.assign(player, { x: 300, y: 500, angle: 0, cooldown: 0, suppression: 0 });
  for (const other of state.squad.slice(1)) other.alive = false;
  return player;
}
function arena(role = 'rifleman') {
  const state = createGame({ mission: 2, seed: 63, squadRoles: [role, 'grenadier', 'medic', 'support'] });
  return { state, player: clearArena(state) };
}
function tank(state, extra = {}) {
  const vehicle = { id: ++state.nextId, kind: 'tank', name: 'Test armor', team: 'enemy',
    x: 500, y: 500, angle: 0, turretAngle: 0, hullLength: 94, hullWidth: 56,
    hp: 420, maxHp: 420, mobility: 100, maxMobility: 100, armored: true,
    disabled: false, wreck: false, destroyed: false, active: false, visible: false,
    ammo: { cannon: 0, mg: 0 }, ...extra };
  state.vehicles.push(vehicle); return vehicle;
}
function inertEnemy(state, x, y) {
  const enemy = { id: ++state.nextId, team: 'enemy', kind: 'rifleman', name: 'Fighter',
    x, y, angle: Math.PI, hp: 100, maxHp: 100, alive: true, downed: false,
    radius: 13, cooldown: 10000, reloadTimer: 0, suppression: 0, ammo: 30,
    magSize: 30, reserve: 30, accuracy: 0, path: [], pathTimer: 0, alert: false, visible: false };
  state.enemies.push(enemy); return enemy;
}

// These tests enter through the simulation, snapshot and prediction boundaries.
// Oriented-box mathematics and vehicle balance helpers have their own unit tests.
test('real rifle shots stop at friendly, hostile and wrecked hulls before hitting people behind them', () => {
  for (const extra of [{ team: 'enemy' }, { team: 'ally' }, { team: 'enemy', hp: 0, wreck: true, destroyed: true }]) {
    const { state, player } = arena(), vehicle = tank(state, extra), target = inertEnemy(state, 650, 500);
    const initialHp = vehicle.hp;
    step(state, { fire: true, aimX: 900, aimY: 500 }, .05);step(state, {}, .05);
    assert.equal(player.ammo, 29);assert.equal(target.hp, 100, 'the hull intercepts the actual projectile');
    assert.equal(state.bullets.length, 0);assert.equal(vehicle.hp, initialHp, 'rifle fire cannot chip a tank to death');
    const impact = state.soundEvents.find(event => event.type === 'impact' && event.material === 'metal');
    assert.ok(impact, 'the stopped shot produces metal impact feedback');
    assert.ok(impact.x >= 452 && impact.x <= 454, 'impact occurs on the near hull face');
  }
});

test('held movement stops at a physical hull and resumes after the obstruction is removed', () => {
  const { state, player } = arena();tank(state, { x: 600 });player.x = 520;
  run(state, 1, { moveX: 1 });
  assert.ok(player.x > 520);assert.ok(player.x <= 540, 'soldier radius stays outside the near hull face');
  assert.equal(player.y, 500);
  state.vehicles = [];
  run(state, 1.5, { moveX: 1 });
  assert.ok(player.x > 650, 'collision does not leave a stale movement block');
});

test('AI followers walk around horizontal and vertical vehicle columns to rejoin a waiting human', () => {
  for (const angle of [0, Math.PI / 2]) {
    const { state, player } = arena(), follower = state.squad[2];
    follower.alive = true;
    const rotate = (x, y) => ({
      x: 1000 + (x - 600) * Math.cos(angle) - (y - 500) * Math.sin(angle),
      y: 900 + (x - 600) * Math.sin(angle) + (y - 500) * Math.cos(angle),
    });
    Object.assign(player, rotate(900, 500));Object.assign(follower, rotate(300, 500));
    state.formationHeading = angle - Math.PI / 2;
    state.formationAnchor = { id: player.id, x: player.x, y: player.y };
    const waiting = { x: player.x, y: player.y };
    for (const x of [500, 630]) tank(state, { ...rotate(x, 500), angle, kind: 'truck', team: 'ally',
      w: 76, h: 40, hullLength: 76, hullWidth: 40, hp: 180, maxHp: 180, armored: false });
    for (let frame = 0; frame < 30 * 20; frame++) {
      step(state, {}, 1 / 30);
      assert.equal(pointBlockedByVehicle(state, follower.x, follower.y, follower.radius), false,
        'every movement step keeps the follower and their radius outside each oriented hull');
    }
    assert.equal(state.status, 'playing');
    assert.deepEqual({ x: player.x, y: player.y }, waiting, 'the waiting human is never moved to clear the route');
    assert.ok(Math.hypot(follower.x - follower.formationGoal.x, follower.y - follower.formationGoal.y) < 25,
      `the follower reaches their clear formation slot around the ${angle === 0 ? 'horizontal' : 'vertical'} column`);
    assert.ok(Math.hypot(follower.x - player.x, follower.y - player.y) < 145);
  }
});

test('AI followers use a narrow legal lane beside a hull without reducing their collision radius', () => {
  const { state, player } = arena(), follower = state.squad[2];
  follower.alive = true;Object.assign(player, { x: 700, y: 500 });Object.assign(follower, { x: 350, y: 500 });
  state.world.walls = [{ x: 0, y: 0, w: state.world.width, h: 450 },
    { x: 0, y: 545, w: state.world.width, h: state.world.height - 545 }];
  state.world.geometryRevision++;rebuildNavigationGrid(state);
  tank(state, { x: 500, y: 500, angle: 0, kind: 'truck', team: 'ally',
    w: 82, h: 44, hullLength: 82, hullWidth: 44, armored: false });
  state.formationHeading = -Math.PI / 2;state.formationAnchor = { id: player.id, x: player.x, y: player.y };
  const waiting = { x: player.x, y: player.y },radius = follower.radius;
  // The upper wall ends at 450 and the vehicle starts at 478. A 26px-wide
  // soldier has a real 2px center lane; the south side is physically closed.
  for (let frame = 0; frame < 30 * 12; frame++) {
    step(state, {}, 1 / 30);
    assert.equal(follower.radius, radius);
    assert.equal(pointBlockedByVehicle(state, follower.x, follower.y, radius), false);
    assert.ok(follower.y - radius > 450 && follower.y + radius < 545, 'the complete body stays outside both solid walls');
  }
  assert.ok(follower.x > 630, 'the follower crosses the hull through the existing lane');
  assert.ok(Math.hypot(follower.x - follower.formationGoal.x, follower.y - follower.formationGoal.y) < 25);
  assert.deepEqual({ x: player.x, y: player.y }, waiting, 'the waiting human keeps control of their position');
});

test('an AI leader approaches the clear edge of a parked-center order and follows subsequent target changes', () => {
  const { state, player: leader } = arena(), member = state.squad[1];
  member.alive = true; Object.assign(member, { x: 400, y: 650 });
  state.role = 'member'; state.playerId = member.id;
  const vehicle = tank(state, { x: 600, y: 500, kind: 'truck', team: 'ally', hullLength: 76, hullWidth: 40, w: 76, h: 40 });
  const target = { id: 'parked-rally', kind: 'rally', x: 600, y: 500, radius: 130, duration: 999,
    title: 'Rally at transport', description: 'Approach the waiting transport.' };
  state.stages = [target]; state.stageIndex = 0; state.stageCount = 1; state.phaseTime = 0; state.objective = { ...target };
  const humanPosition = { x: member.x, y: member.y };
  for (let frame = 0; frame < 30 * 8; frame++) {
    step(state, {}, 1 / 30);
    assert.equal(pointBlockedByVehicle(state, leader.x, leader.y, leader.radius), false);
  }
  assert.ok(Math.hypot(leader.x - vehicle.x, leader.y - vehicle.y) < 110, 'the AI reaches a legal edge of the parked hull');
  assert.deepEqual({ x: target.x, y: target.y, radius: target.radius }, { x: 600, y: 500, radius: 130 }, 'navigation does not rewrite the authored objective or arrival radius');
  vehicle.x = 900;
  run(state, 3);
  assert.ok(Math.hypot(leader.x - 600, leader.y - 500) < 35, 'moving the vehicle clears the former blocked endpoint');
  target.x = 620; target.y = 620;
  run(state, 3);
  assert.ok(Math.hypot(leader.x - target.x, leader.y - target.y) < 35, 'a later destination invalidates the old hull-edge approach');
  assert.deepEqual({ x: member.x, y: member.y }, humanPosition, 'the human following the leader remains under direct control');
});

test('an AI escort clears the real next rotation sweep before a convoy turns at a junction', () => {
  const state = createGame({ mission: 7, seed: 17, role: 'leader', difficulty: 'story' });
  state.enemies = []; state.allies = []; state.civilians = []; state.survivors = []; state.maxEnemies = 0;
  state.stageIndex = state.stages.findIndex(stage => stage.kind === 'convoy');
  state.convoyIndex = 4; state.convoyCleared = [1, 4]; state.phaseTime = 0;
  const lead = state.vehicles[0], rear = state.vehicles[1];
  Object.assign(lead, { x: 1639.8852304720965, y: 1346.001709257331, angle: -1.4076758502198805, waiting: false });
  Object.assign(rear, { x: 1637.7294938553032, y: 1457.5834633304698, angle: -1.5514889859046466, waiting: true, routeIndex: 3 });
  const poses = [[1723.8695406687343, 1362.8798091412912], [1742.3858437443462, 1398.3360712174324],
    [1600.020304756292, 1384.4343332899707], [1695.476477481367, 1492.5675589432392]];
  for (const [index, actor] of state.squad.entries()) Object.assign(actor, { x: poses[index][0], y: poses[index][1], path: [], pathTimer: 0 });
  const human = state.squad[0], escort = state.squad[2], humanPosition = { x: human.x, y: human.y };
  const before = { x: escort.x, y: escort.y }, initialAngle = lead.angle, initialX = lead.x;
  assert.equal(pointBlockedByVehicle(state, escort.x, escort.y, escort.radius), false, 'the escort starts legally beside the current hull');
  assert.equal(vehiclePoseClear(state, lead, { x: lead.x, y: lead.y, angle: lead.angle + .72 / 30 }), false, 'the next rotation would catch the escort at its rear corner');
  step(state, {}, 1 / 30);
  assert.equal(escort.tactic, 'clearing_vehicle');
  assert.ok(Math.hypot(escort.x - before.x, escort.y - before.y) > 0, 'the AI steps out before normal formation planning');
  for (let frame = 0; frame < 90; frame++) {
    step(state, {}, 1 / 30);
    for (const actor of state.squad) assert.equal(pointBlockedByVehicle(state, actor.x, actor.y, actor.radius), false, `${actor.name} stays outside the moving hulls`);
  }
  assert.ok(lead.angle > initialAngle + .5); assert.ok(lead.x > initialX, 'the convoy resumes its actual route after turning');
  assert.deepEqual({ x: human.x, y: human.y }, humanPosition, 'right of way never moves the human');
});

test('finite launcher rounds physically hit armor, damage its tracks and immobilize it without destroying it', () => {
  const { state, player } = arena('grenadier'), vehicle = tank(state);
  for (let round = 0; round < 4 && !vehicle.disabled; round++) {
    const before = vehicle.hp;
    step(state, { grenade: true, aimX: vehicle.x, aimY: vehicle.y }, 1 / 30);
    assert.equal(player.grenades, 3 - round);
    assert.ok(state.grenades.length, 'the launcher creates a travelling projectile');
    assert.equal(vehicle.hp, before, 'launching does not remotely apply the blast');
    run(state, 1.1);
    assert.ok(vehicle.hp < before);assert.ok(vehicle.mobility < 100);
    if (!vehicle.disabled) run(state, 2.1);
  }
  assert.equal(vehicle.disabled, true);assert.equal(vehicle.mobility, 0);
  assert.ok(vehicle.hp > 0);assert.equal(vehicle.wreck, false);
  assert.ok(state.soundEvents.some(event => event.type === 'explosion'));
});

test('destroying a required convoy vehicle through the combat pipeline ends the mission with a readable reason', () => {
  const state = createGame({ mission: 2, seed: 63 });
  state.enemies = [];state.allies = [];state.maxEnemies = 0;state.spawnTimer = 1e9;
  const vehicle = state.vehicles.find(item => state.convoyVehicleIds.includes(item.id));
  assert.ok(vehicle, 'the legacy relief mission registers its required transport');
  state.stageIndex = state.stages.findIndex(stage => stage.kind === 'convoy');
  vehicle.hp = 30;
  // A side hit starts immediately outside the north-facing carrier's hull.
  const x = vehicle.x - vehicle.hullWidth / 2 - 10, y = vehicle.y;
  state.bullets.push({ id: ++state.nextId, x, y, px: x, py: y, vx: 1600, vy: 0,
    team: 'enemy', owner: 999999, weapon: 'tank-cannon', damage: 145,
    blastRadius: 112, ttl: 1, rangeRemaining: 1000, firedAt: state.time });
  step(state, {}, .05);
  assert.equal(vehicle.wreck, true);assert.equal(vehicle.hp, 0);
  assert.equal(state.status, 'lost');assert.match(state.endReason, /transport|carrier|convoy/i);
  assert.match(state.endReason, /destroyed|lost/i);assert.ok(state.squad[0].alive);
});

class Peer {
  constructor() { this.messages = [];this.bufferedAmount = 0; }
  send(packet) { this.messages.push(structuredClone(packet));return true; }
  sendRaw() { return true; }
}
function roomFixture() {
  const rooms = new CoopRooms({ seed: () => 63 }), peer = new Peer();
  rooms.handle(peer, { type: 'create', protocol: PROTOCOL, name: 'Host', mission: 2, difficulty: 'standard' });
  const room = rooms.rooms.get(peer.roomCode), player = clearArena(room.game);
  const friendly = tank(room.game, { team: 'ally', x: 700, y: 700, visible: true });
  const visible = tank(room.game, { x: 520, y: 500, visible: true, route: [{ x: 1800, y: 100 }], targetId: player.id, cannonIn: 9 });
  const hidden = tank(room.game, { x: 1800, y: 300, visible: false, route: [{ x: 1900, y: 500 }] });
  room.game.armorControl = { version: 1, units: [{ vehicleId: hidden.id, route: [{ x: 1900, y: 500 }], targetId: player.id, cannonIn: 3 }] };
  return { rooms, room, peer, player, friendly, visible, hidden };
}

test('public snapshots omit unseen hostile armor and every private route or controller field', () => {
  const { rooms, room, player, friendly, visible, hidden } = roomFixture();
  const snapshot = rooms.snapshotFor(room, room.players[0]);
  assert.deepEqual(snapshot.state.vehicles.map(vehicle => vehicle.id), [friendly.id, visible.id]);
  assert.equal('armorControl' in snapshot.state, false);assert.equal('armorControl' in snapshot.init, false);
  const exposed = snapshot.state.vehicles.find(vehicle => vehicle.id === visible.id);
  for (const key of ['route', 'routeIndex', 'targetId', 'targetType', 'cannonIn', 'mgIn', 'warmup']) assert.equal(key in exposed, false, key);
  assert.equal(exposed.hullLength, 94);assert.equal(exposed.mobility, 100);
  assert.equal(room.game.vehicles.length, 3);assert.equal(room.game.armorControl.units[0].targetId, player.id);
  assert.equal(snapshot.state.vehicles.some(vehicle => vehicle.id === hidden.id), false);
  friendly.x = 410;friendly.y = 500;
  assert.deepEqual(rooms.snapshotFor(room, room.players[0]).state.vehicles.map(vehicle => vehicle.id), [friendly.id], 'an intervening hull hides nearby hostile armor despite its old visible flag');
  friendly.x = 700;friendly.y = 700;
  visible.x = 1700;visible.y = 300;visible.visible = false;
  assert.deepEqual(rooms.snapshotFor(room, room.players[0]).state.vehicles.map(vehicle => vehicle.id), [friendly.id], 'lost sight removes the old contact');
});

test('hydration removes seeded armor controllers and prediction collides only with received public hulls', () => {
  const { rooms, room, friendly, visible, hidden } = roomFixture(), hydrator = new CoopStateHydrator();
  const snapshot = rooms.snapshotFor(room, room.players[0]);
  snapshot.state.armorControl = { version: 1, units: [{ vehicleId: hidden.id, route: [{ x: 1900, y: 500 }] }] };
  const { game } = hydrator.apply(snapshot, room.players[0].id);
  assert.equal('armorControl' in game, false, 'neither seeded nor packet-private controllers reach clients');
  assert.deepEqual(game.vehicles.map(vehicle => vehicle.id), [friendly.id, visible.id]);
  const actor = { ...game.squad[0], x: 450, y: 500, suppression: 0 }, input = { moveX: 1, sprint: true };
  const stopped = predictMovement(actor, input, .2, game.world, game.vehicles);
  assert.ok(stopped.x > actor.x);assert.ok(stopped.x <= 460, 'public 94-unit hull plus soldier radius blocks movement');
  const clear = predictMovement(actor, input, .2, game.world, []);
  assert.ok(clear.x > 480);assert.equal(stopped.ammo, actor.ammo);assert.equal(stopped.hp, actor.hp);
  const next = structuredClone(snapshot);next.tick++;
  hydrator.apply(next, room.players[0].id);assert.equal('armorControl' in game, false, 'later packets cannot reintroduce hidden routes');
});
