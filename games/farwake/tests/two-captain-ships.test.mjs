import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game } from '../dist/engine.mjs';
import { Realm } from '../server/realm.mjs';
import { getShipClass, STARTER_SHIP_IDS, advanceShip } from '../dist/fleet.mjs';
import { groupLaunchChoices } from '../dist/group-start.mjs';
import { hullEnergyAfterStep } from '../dist/hull-systems.mjs';
import { cabinLayout } from '../dist/interior-layouts.mjs';
import { drawShip, SHIP_VISUALS } from '../dist/space-art.mjs';
import { withHull } from './helpers/fleet-fixtures.mjs';

const added = ['swift', 'kingfisher', 'lamprey'];
const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const persistence = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
async function station(realm, captain, role) {
  const physical = role === 'weapons' ? 'security' : role;
  const entity = realm._surface(captain).entities.find(value => value.data?.stationRole === physical);
  assert.ok(entity, `${role} has a real console.`);
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y });
  ok(await realm.command(captain, 'takeStation', { role, entityId: entity.id }));
}
for (const [classId, partnerRole] of [['swift', 'navigation'], ['kingfisher', 'weapons'], ['lamprey', 'engineering']]) {
  test(`two captains can depart on ${classId}, operate different stations, and resume the same vessel`, async () => {
    assert.equal(groupLaunchChoices(1).find(choice => choice.id === classId).eligible, false);
    assert.equal(groupLaunchChoices(2).find(choice => choice.id === classId).eligible, true);
    const realm = new Realm({ id: 'TWOCREW1', seed: `two-crew-${classId}`, persistence: persistence(), settings: { startTogether: true } });
    const { captain: owner } = await realm.createCaptain('Pilot'), { captain: partner } = await realm.createCaptain('Partner');
    for (const captain of [owner, partner]) ok(realm.attach(captain, { close() {} }));
    const parkedId = partner.ownedVesselId;
    ok(await realm.command(owner, 'chooseGroupShip', { classId }));
    ok(await realm.command(partner, 'groupStartReady', { ready: true, classId, selectionRevision: realm.groupStart.selectionRevision }));
    ok(await realm.command(owner, 'startGroupVoyage'));
    const vessel = realm.vessels.get(owner.ownedVesselId);
    assert.equal(vessel.ship.classId, classId); assert.equal(partner.aboard, vessel.id);
    assert.equal(vessel.ship.humanOccupants, 2); assert.equal(vessel.ship.warpRange, 0);
    assert.deepEqual(owner.game.state.upgrades, {}); assert.deepEqual(owner.game.state.completedChapters, []);
    assert.equal(owner.game.state.flags.includes('first_fold_done'), false);
    await station(realm, partner, partnerRole); await station(realm, owner, 'helm');
    assert.equal(owner.game.state.mode, 'ship'); assert.equal(vessel.helmOwner, owner.id);
    assert.equal(partner.game.state.mode, 'person'); assert.equal(partner.crewRole, partnerRole);
    const room = realm._room(vessel.systemId); room.runtime.enemies = [];
    if (classId === 'kingfisher') {
      const timestamp = Date.now(), before = vessel.ship.energy;
      partner.input = { fire: true }; partner.inputAt = timestamp; partner.inputSeq = 1;
      owner.input = {}; owner.inputAt = timestamp; realm.step(1 / 30, 1, timestamp, timestamp);
      const shots = room.runtime.bullets.filter(shot => shot.vesselId === vessel.id);
      assert.equal(shots.length, 2); assert.ok(shots.every(shot => shot.shooterId === partner.id));
      near(vessel.ship.energy, Math.min(vessel.ship.maxEnergy, before + 11 / 30) - 5);
    } else if (classId === 'lamprey') {
      vessel.ship.hull -= 25; const before = vessel.ship.hull, energy = vessel.ship.energy;
      ok(await realm.command(partner, 'crewAction', { action: 'repair' }));
      assert.equal(vessel.ship.hull, before + 12); assert.equal(vessel.ship.energy, energy - 20);
    }
    const restored = new Realm({ id: realm.id, snapshot: structuredClone(realm.document()), persistence: persistence() });
    assert.equal(restored.vessels.get(vessel.id).ship.classId, classId);
    assert.equal(restored.captains.get(partner.id).aboard, vessel.id);
    assert.equal(restored.captains.get(partner.id).crewRole, partnerRole);
    assert.equal(restored.vessels.get(parkedId).ship.classId, 'sparrow');
  });
}

test('new hulls have paid shipyard paths and preserve their equipment after solo save/resume', () => {
  assert.deepEqual(STARTER_SHIP_IDS, ['sparrow', 'kestrel', 'mule']);
  for (const id of added) {
    const game = new Game(`two-crew-commission-${id}`), hull = getShipClass(id), port = game.system.bodies.find(body => body.id === 'kettle');
    Object.assign(game.state.ship, { x: port.x, y: port.y + port.radius + 60 }); ok(game.dock(port.id));
    game.state.credits = 2000; game.state.cargo.ore = hull.ore;
    ok(game.buyShip(id)); assert.equal(game.state.credits, 2000 - hull.cost); assert.equal(game.state.cargo.ore, 0);
    const resumed = Game.fromSave(game.serialize()); assert.equal(resumed.state.ship.classId, id);
    assert.equal(resumed.shipClass.systems.id, id); assert.equal(resumed.state.ship.warpRange, 0);
  }
});

test('Swift trades protection and capacity for measurable speed and cheaper overdrive and fold travel', () => {
  const swift = withHull(new Game('swift-dispatch'), 'swift'), lark = withHull(new Game('swift-dispatch'), 'lark');
  for (const game of [swift, lark]) { game.state.upgrades.fold_2 = 1; game._updateStats(true); }
  const target = swift.galaxy.find(system => swift.travelInfo(system.id).fuelCost > 7);
  assert.ok(target); assert.ok(swift.travelInfo(target.id).fuelCost < lark.travelInfo(target.id).fuelCost);
  const start = id => ({ ...getShipClass(id).stats, classId: id, x: 0, y: 500, angle: 0, vx: 0, vy: 0, energy: 100 });
  const fast = advanceShip(start('swift'), .25, { thrust: 1, boost: true }), modest = advanceShip(start('lark'), .25, { thrust: 1, boost: true });
  assert.ok(fast.vx > modest.vx); assert.ok(hullEnergyAfterStep(fast, .25, { thrust: 1, boost: true }) > hullEnergyAfterStep(modest, .25, { thrust: 1, boost: true }));
  assert.ok(swift.state.ship.maxHull < lark.state.ship.maxHull); assert.ok(swift.state.ship.cargoCap < lark.state.ship.cargoCap);
});

test('Lamprey recovers distant material, treats living occupants, and keeps its forward cradle open', () => {
  const game = withHull(new Game('lamprey-recovery'), 'lamprey');
  Object.assign(game.state.ship, { x: 0, y: 500, angle: 0, energy: 100 }); game.system.enemies = [];
  game.system.asteroids = [{ id: 'distant-work', x: 320, y: 500, radius: 12, hp: 1, ore: 4, crystal: 0 }];
  game._mine(.1); assert.equal(game.state.cargo.ore, 4);
  game.system.pickups = [{ id: 'recovered', x: 215, y: 500, ore: 2, crystal: 0, credits: 0 }];
  game._updatePickups(.1, [game]); assert.ok(game.system.pickups[0].x < 215); ok(game.salvage('recovered')); assert.equal(game.state.cargo.ore, 6);
  game.state.person.health = 40; game.state.crew = [{ id: 'rescuer', role: 'medic', name: 'Rescuer', health: 30, maxHealth: 100, status: 'injured' }];
  ok(game.enterCabin()); const charge = game.state.ship.energy; ok(game.medicalFromStation());
  assert.equal(game.state.person.health, 56); assert.equal(game.state.crew[0].health, 42); assert.equal(game.state.ship.energy, charge - 16);
  const layout = cabinLayout('lamprey'), fore = Math.round(layout.rows * .2), center = Math.floor(layout.cols / 2);
  assert.equal(layout.hullMask[fore * layout.cols + center], 0); assert.equal(layout.walkable[fore * layout.cols + center], 0);
  assert.ok(layout.stations.helm.y > layout.height * .5);
});

class CaptureCanvas { constructor(width, height) { this.width = width; this.height = height; this.ctx = new CaptureContext(this); } getContext() { return this.ctx; } }
class CaptureContext {
  constructor(canvas) { this.canvas = canvas; this.images = []; this.fills = []; this.x = 0; this.y = 0; this.stack = []; }
  save() { this.stack.push([this.x, this.y]); } restore() { [this.x, this.y] = this.stack.pop(); } rotate() {} scale() {} clearRect() {}
  translate(x, y) { this.x += x; this.y += y; }
  fillRect(x, y, w, h) { this.fills.push([this.fillStyle, Math.round(x + this.x), Math.round(y + this.y), Math.round(w), Math.round(h)]); }
  drawImage(canvas, ...args) { this.images.push({ canvas, args }); }
}
test('three readable exteriors use their own proportions and cached, unclipped sprites', () => {
  const prior = globalThis.OffscreenCanvas; globalThis.OffscreenCanvas = CaptureCanvas;
  try {
    const signatures = [];
    for (const id of added) {
      const hull = getShipClass(id), profile = SHIP_VISUALS[id], target = new CaptureCanvas(500, 300);
      assert.equal(profile.length, hull.stats.renderLength); assert.equal(profile.width, hull.stats.renderWidth);
      drawShip(target.ctx, 250, 150, 0, '#bac9bc', 1, false, 0, false, { shipClass: id });
      const work = target.ctx.images.at(-1).canvas, sprite = work.ctx.images.at(-1).canvas, pixels = new Map();
      for (const [color, x, y, w, h] of sprite.ctx.fills) for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
        assert.ok(col >= 0 && row >= 0 && col < sprite.width && row < sprite.height, `${id} sprite fits its buffer.`);
        pixels.set(`${col},${row}`, color);
      }
      assert.ok(pixels.size > 1800); signatures.push(createHash('sha256').update(JSON.stringify([...pixels])).digest('hex'));
      drawShip(target.ctx, 251, 150, .1, '#bac9bc', 1, false, 0, false, { shipClass: id });
      assert.equal(target.ctx.images.at(-1).canvas, work); assert.equal(work.ctx.images.at(-1).canvas, sprite);
    }
    assert.equal(new Set(signatures).size, 3);
  } finally { if (prior === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = prior; }
});
