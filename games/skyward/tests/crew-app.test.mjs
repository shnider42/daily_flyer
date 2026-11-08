import test from 'node:test';
import assert from 'node:assert/strict';
import * as campaign from '../public/campaign.mjs';
import { FlightSimulation } from '../public/sim.mjs';
import { appFixture } from './helpers/app-fixture.mjs';

test('the gunner stays inactive in the crew room across host pause/resume and rejoins a replay safely', async t => {
  const { app, document, window, frame } = await appFixture(t), team = app.team;
  Object.assign(team, { code: 'ABC234', id: 'gunner', hostId: 'pilot', connected: true, isHost: false,
    mode: 'crew', role: 'gunner', maxPlayers: 2, missionId: 'gunship-nightwatch', roomState: 'flying',
    roster: [{ id: 'pilot', name: 'Pilot', role: 'pilot', ready: true, connected: true },
      { id: 'gunner', name: 'Gunner', role: 'gunner', ready: true, connected: true }] });
  const start = { missionId: team.missionId, mode: 'crew', role: 'gunner', seed: 1 };
  team.callbacks.onStart(start);
  const host = new FlightSimulation(campaign.getMission(team.missionId), { playerId: 'pilot' });
  const world = teamPaused => ({ ...host.getSnapshot(), teamPaused });
  team.callbacks.onWorld(world(false));
  assert.equal(app.screen, 'flight'); assert.equal(app.gunnerControls.active, true); assert.equal(app.controls.active, false);
  assert.equal(app.sim.player.id, 'pilot'); assert.equal(app.sim.worldAuthority, false);
  team.sent.length = 0;
  window.dispatch('keydown', { code: 'Space' }); window.dispatch('keyup', { code: 'Space' });
  assert.deepEqual(team.sent.map(input => input.fire), [true, false], 'a complete tap reaches transport without waiting for an animation frame');
  assert.ok(team.sent.every(input => !input.reset), 'ordinary trigger release retains a brief click until the pilot physics tick');
  frame(); assert.equal(app.renderer.lastRender.options.camera, 'gunner'); assert.equal(team.poses.length, 0);
  assert.equal(app.renderer.lastRender.player.id, 'pilot');

  document.getElementById('pause-button').onclick();
  assert.equal(app.gunnerControls.active, false);
  assert.equal(team.sent.at(-1).reset, true, 'gunner pause sends a forced cancellation instead of an ordinary release');
  document.getElementById('pause-restart').onclick();
  assert.equal(app.screen, 'squadron'); assert.equal(app.gunnerControls.active, false);
  team.callbacks.onWorld(world(true)); team.callbacks.onWorld(world(false));
  assert.equal(app.gunnerControls.active, false, 'host snapshots cannot activate controls in another screen');
  assert.equal(app.controls.active, false); assert.equal(app.audio.active, false);
  const count = team.sent.length;
  window.dispatch('keydown', { code: 'Space' }); window.dispatch('keyup', { code: 'Space' });
  assert.equal(team.sent.length, count, 'typing in the room cannot fire the aircraft guns');

  const oldSimulation = app.sim;
  team.callbacks.onStart({ ...start, seed: 2 }); team.callbacks.onWorld(world(false));
  assert.notEqual(app.sim, oldSimulation); assert.equal(app.screen, 'flight');
  assert.equal(app.gunnerControls.active, true); assert.equal(app.controls.active, false);
  assert.equal(app.gunnerControls.seat, '25mm');
  team.connected = false; frame(); assert.equal(app.gunnerControls.active, false);
  team.connected = true; frame(); assert.equal(app.gunnerControls.active, true);
  window.dispatch('keydown', { code: 'Space', repeat: true });
  assert.equal(app.gunnerControls.read(0).fire, false, 'reconnection cannot replay an already-held key');

  Object.assign(team, { id: 'pilot', isHost: true, role: 'pilot' });
  team.callbacks.onStart({ ...start, role: 'pilot', seed: 3 });
  assert.equal(app.controls.active, true); assert.equal(app.gunnerControls.active, false);
  const ammunition = app.sim.crew.stations['25mm'].ammo;
  team.callbacks.onCrewInput({ playerId: 'gunner', input: { seat: '25mm', yaw: 0, pitch: 0, fire: true }, reset: false });
  document.getElementById('pause-button').onclick();
  assert.equal(app.sim.crew.fire, false); assert.equal(team.worlds.at(-1).teamPaused, true);
  document.getElementById('resume-button').onclick(); frame();
  assert.equal(app.sim.crew.stations['25mm'].ammo, ammunition, 'pilot pause cancels a pending press before the next simulation tick');
});
