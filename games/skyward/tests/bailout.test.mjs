import test from 'node:test';
import assert from 'node:assert/strict';
import { createArenaMission, roomTeam } from '../public/arena.mjs';
import { getMission } from '../public/campaign.mjs';
import { FlightSimulation, surfaceHeight } from '../public/sim.mjs';

const config = { mode: 'team-dogfight', mapId: 'canyon', durationSeconds: 180 };
const pilots = ['lead', 'wing', 'third', 'fourth'].map((id, index) => ({ id, aircraft: 'f16', startMode: 'airborne', team: roomTeam(index) }));
const arena = playerId => new FlightSimulation(createArenaMission(config), { playerId }).configureMultiplayer({
  config, players: pilots, playerId, hostId: 'lead', runId: 'bailout-test',
});

function place(sim, pose, { x = 0, z = 0, altitude = 180, speed = 180, onGround = false } = {}) {
  Object.assign(pose, { x, y: surfaceHeight(x, z, sim.mission) + altitude, z, speed, onGround });
}

function fly(sim, seconds) {
  for (let i = 0; i < seconds * 20; i++) sim.step(.05, { throttle: sim.player.throttle });
}

test('a severe hit grounds weapons, then a clear exit recovers the pilot and records the airframe loss', () => {
  const sim = new FlightSimulation(createArenaMission());
  place(sim, sim.player);
  assert.equal(sim.action('bailout'), false);
  assert.equal(sim._damagePlayer(sim.aircraft.health, 'missile'), true);
  assert.equal(sim.player.engine, false);
  assert.equal(sim.player.health, 1);
  assert.equal(sim.bailoutStatus.phase, 'disabled');
  assert.equal(sim.bailoutStatus.canBail, true);
  assert.equal(sim.action('fire'), false);
  assert.equal(sim.action('bailout'), true);
  assert.equal(sim.action('bailout'), false);
  assert.equal(sim.bailoutStatus.phase, 'descending');
  const altitude = sim.bailoutStatus.altitude;
  assert.equal(sim.paratroopers.length, 1);
  assert.equal(sim.paratroopers[0].pilotId, sim.player.id);
  fly(sim, 1);
  assert.ok(sim.bailoutStatus.altitude < altitude);
  assert.equal(sim.player.y, sim.paratroopers[0].y);
  assert.equal(sim._damagePlayer(20, 'gun'), false);
  fly(sim, 18);
  assert.equal(sim.bailoutStatus.phase, 'landed');
  assert.equal(sim.status, 'failed');
  assert.match(sim.objective, /recovered safely/);
  assert.equal(sim.dropsLanded, 0, 'personal escape is not a cargo drop');
});

test('critical damage permits bailout only at usable altitude and speed, and water is a loss', () => {
  const sim = new FlightSimulation(createArenaMission({ mapId: 'islands' }));
  place(sim, sim.player, { altitude: 40 });
  sim._damagePlayer(sim.aircraft.health * .8, 'gun');
  assert.equal(sim.bailoutStatus.phase, 'critical');
  assert.match(sim.action('bailout').message, /95 m AGL/);
  place(sim, sim.player, { speed: 600 });
  assert.match(sim.action('bailout').message, /460 m\/s/);
  place(sim, sim.player);
  assert.equal(sim.action('bailout'), true);
  fly(sim, 18);
  assert.equal(sim.bailoutStatus.phase, 'lost');
  assert.match(sim.objective, /at sea/);
});

test('very low, overwhelming and nuclear damage do not open an escape window', () => {
  for (const { weapon, altitude, multiplier } of [
    { weapon: 'missile', altitude: 40, multiplier: 1 },
    { weapon: 'missile', altitude: 180, multiplier: 2 },
    { weapon: 'nuclear', altitude: 180, multiplier: 1 },
  ]) {
    const sim = new FlightSimulation(createArenaMission());
    place(sim, sim.player, { altitude });
    sim._damagePlayer(sim.aircraft.health * multiplier, weapon);
    assert.equal(sim.player.health, 0);
    assert.equal(sim.bailoutStatus, null);
    assert.equal(sim.action('bailout'), false);
  }
  const crew = new FlightSimulation(getMission('gunship-nightwatch'));
  crew._damagePlayer(crew.aircraft.health, 'missile');
  assert.equal(crew.player.health, 0);
  assert.equal(crew.bailoutStatus, null);
});

test('a guest escape is host-authoritative, scores its aircraft loss once and preserves replacement rules', () => {
  const host = arena('lead'), guest = arena('wing'), target = host.participants.get('wing');
  place(host, target.pose);
  host._damageParticipant(target, target.health, host.player.id, 'missile');
  assert.equal(guest.applySnapshot(host.getSnapshot()), true);
  assert.equal(guest.bailoutStatus.phase, 'disabled');
  assert.equal(guest.player.engine, false);
  assert.equal(guest.action('bailout'), false);
  const pose = { ...target.pose };
  const action = { runId: 'bailout-test', lifeId: 1, actionId: 'first-escape' };
  assert.equal(host.applyRemoteAction('bailout', pose, action), true);
  assert.equal(host.applyRemoteAction('bailout', pose, action), false);
  assert.equal(host.localParticipant.kills, 1);
  assert.equal(target.deaths, 1);
  assert.equal(host.requestRespawn(target.id), false);
  assert.equal(host.selectedTarget?.id === target.id, false);
  assert.equal(guest.applySnapshot(host.getSnapshot()), true);
  assert.equal(guest.bailoutStatus.phase, 'descending');
  const altitude = guest.bailoutStatus.altitude;
  fly(guest, 1);
  assert.ok(guest.bailoutStatus.altitude < altitude);
  fly(host, 18);
  assert.equal(guest.applySnapshot(host.getSnapshot()), true);
  assert.equal(guest.bailoutStatus.phase, 'landed');
  assert.equal(guest.localParticipant.alive, false);
  assert.equal(guest.localParticipant.deaths, 1);
  assert.equal(host.localParticipant.kills, 1);
  host.time = Math.max(host.time, target.respawnAt);
  assert.equal(host.requestRespawn(target.id), true);
  assert.equal(guest.applySnapshot(host.getSnapshot()), true);
  assert.equal(guest.bailoutStatus, null);
  assert.equal(guest.player.lifeId, 2);
  assert.equal(host.applyRemoteAction('bailout', pose, action), false);
});
