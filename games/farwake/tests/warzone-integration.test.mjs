import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { normalizeWarzone } from '../dist/warzone-rules.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const visit = seed => { const game = new Game(seed, { startMode: 'casual' }); ok(game.travel('crosswind')); return game; };
const pulse = (game, enemy, damage) => {
  game._worldGames = [game]; game._rewardGames = new Map([[game.playerId, game]]);
  game.system.bullets.push({ id: `verified-hit-${damage}`, owner: 'player', ownerId: game.playerId, vesselId: game.state.ship.id, x: enemy.x - enemy.radius - 8, y: enemy.y, vx: 300, vy: 0, ttl: 1, damage, radius: 4 });
  game._updateBullets(.1, [game]);
};

test('Crosswind is one Fold I jump from Hearth, has exactly three planets, and a real medium picket hails', () => {
  const game = visit('crosswind-route');
  assert.equal(game.system.bodies.filter(body => body.kind === 'planet').length, 3);
  assert.equal(game.system.enemies.filter(ship => ship.warzone).length, 56);
  const hail = game.drainEvents().find(event => event.type === 'warzone-arrival');
  const picket = game.system.enemies.find(ship => ship.id === hail.sourceId);
  assert.equal(picket.warzoneSize, 'medium'); assert.equal(game.state.warzone.mission, null);
  assert.equal(game.system.traffic.length, 0);
  assert.equal(game.system.enemies.some(ship => !ship.warzone), false);
});

test('service, rather than reputation alone, issues immediate orders and controls allegiance', () => {
  const neutral = new Game('friendly-standing', { startMode: 'casual' }); neutral.state.rep.freewake = 95;
  ok(neutral.travel('crosswind')); assert.equal(neutral.warzoneFaction(), null); assert.equal(neutral.state.warzone.mission, null);
  const serving = new Game('service-orders', { startMode: 'casual' });
  serving.state.professions.careers.military = { enlisted: true, factionId: 'meridian', xp: 0 };
  ok(serving.travel('crosswind')); assert.equal(serving.warzoneFaction(), 'meridian'); assert.equal(serving.state.warzone.mission.factionId, 'meridian');
  assert.equal(serving.warzoneAction({ action: 'join', factionId: 'freewake' }).code, 'service');
  serving.state.rep.meridian = -25; assert.equal(serving.warzoneFaction(), null);
  assert.equal(serving.warzoneAction({ action: 'join', factionId: 'meridian' }).ok, false);
});

test('only confirmed opposing hull hits advance a sortie; declared damage is not a command', () => {
  const game = visit('confirmed-sortie'); ok(game.warzoneAction({ action: 'join', factionId: 'freewake' }));
  const enemy = game.system.enemies.find(ship => ship.faction === 'meridian');
  Object.assign(enemy, { x: 6800, y: 6700 });
  pulse(game, enemy, 11);
  assert.equal(game.state.warzone.mission.damage, 11); assert.ok(game.state.warzone.hostileFactions.includes('meridian'));
  const before = structuredClone(game.state.warzone.mission);
  assert.equal(game.warzoneAction({ action: 'complete', damage: 999, seconds: 999 }).ok, false);
  assert.deepEqual(game.state.warzone.mission, before);
  const ally = game.system.enemies.find(ship => ship.faction === 'freewake'); Object.assign(ally, { x: 6800, y: 6200 });
  pulse(game, ally, 8); assert.equal(game.state.warzone.mission.damage, 11);
  assert.ok(game.warzoneHostilities().includes('freewake'), 'friendly-fire evidence overrides allied clearance');
});

test('destroying a fleet hull records the war loss without generating pirate bounty or growing ordinary ledgers', () => {
  const game = visit('military-not-bounties'), enemy = game.system.enemies.find(ship => ship.faction === 'meridian');
  Object.assign(enemy, { x: 6900, y: 6400, hp: 2 });
  const credits = game.state.credits, defeats = game._record().defeated.length, bounty = game.state.stats.kills;
  pulse(game, enemy, 10);
  assert.equal(game.state.credits, credits); assert.equal(game._record().defeated.length, defeats);
  assert.equal(game.state.stats.kills, bounty); assert.equal(game.system.warzone.casualties.meridian, 1);
  assert.equal(game._record().enemyHealth[enemy.id], undefined);
  game.save(); assert.equal(Object.keys(game._record().enemyStates).some(id => id.startsWith('crosswind:fleet:')), false);
});

test('approach presence excludes a landed captain and a completed sortie pays only once across reload', () => {
  let game = visit('once-only-sortie'); ok(game.warzoneAction({ action: 'join', factionId: 'freewake' }));
  const vey = game.system.bodies.find(body => body.id === 'crosswind-vey');
  Object.assign(game.state.ship, { x: vey.x, y: vey.y });
  game.state.mode = 'person'; game.state.locationId = vey.id;
  game.stepWorld(.1); assert.equal(game.state.warzone.mission.seconds, 0);
  game.state.mode = 'ship'; game.state.locationId = null;
  game.stepWorld(.1); assert.ok(game.state.warzone.mission.seconds > 0);
  game.state.warzone.mission.seconds = 45; game.state.warzone.mission.damage = 179;
  const enemy = game.system.enemies.find(ship => ship.faction === 'meridian'); Object.assign(enemy, { x: 6800, y: 6300 });
  const credits = game.state.credits; pulse(game, enemy, 2);
  assert.equal(game.state.credits, credits + 220); assert.equal(game.state.warzone.mission.status, 'complete');
  game = Game.fromSave(game.save()); game.recordWarzoneDamage('meridian', 999); game._completeWarzoneSortie();
  assert.equal(game.state.credits, credits + 220); assert.equal(game.warzoneAction({ action: 'join', factionId: 'meridian' }).ok, false);
});

test('boarding a disabled military escort is a physical hostile action with military defenders', () => {
  const game = visit('military-boarding'); game.state.fleet.owned.push('mule'); game._activateClass('mule', true);
  const enemy = game.system.enemies.find(ship => ship.warzoneSize === 'medium' && ship.faction === 'meridian');
  Object.assign(enemy, { x: game.state.ship.x + 100, y: game.state.ship.y, hp: enemy.maxHp * .3, disabled: true, vx: 0, vy: 0 });
  ok(game.boardEnemy(enemy.id));
  assert.equal(game.state.boarding.kind, 'assault'); assert.ok(game.state.boarding.enemies.every(person => person.name.startsWith('Military')));
  assert.ok(game.warzoneHostilities().includes('meridian'));
});

test('nearby fleets fighting each other do not falsely lock a neutral captain out of their airlock', () => {
  const game = visit('neutral-airlock'), nearby = game.system.enemies.find(ship => ship.warzonePicket);
  Object.assign(nearby, { x: game.state.ship.x + 160, y: game.state.ship.y, active: true, warzoneTargetKind: 'fleet', targetVesselId: null });
  ok(game.enterCabin()); ok(game.exitCabin());
  Object.assign(nearby, { warzoneTargetKind: 'player', targetVesselId: game.state.ship.id });
  assert.equal(game.enterCabin().code, 'combat');
});

test('warzone save normalization bounds counters and refuses forged allegiance or completed reward replay', () => {
  assert.equal(normalizeWarzone(null).side, null);
  const state = normalizeWarzone({ side: 'unknown', hostileFactions: ['freewake', 'freewake', 'unknown'], visits: -9, mission: { factionId: 'freewake', status: 'complete', paid: false, damage: Infinity, seconds: -4 } });
  assert.equal(state.side, null); assert.deepEqual(state.hostileFactions, ['freewake']); assert.equal(state.visits, 0);
  assert.equal(state.mission.paid, true); assert.equal(state.mission.damage, 0); assert.equal(state.mission.seconds, 0);
});
