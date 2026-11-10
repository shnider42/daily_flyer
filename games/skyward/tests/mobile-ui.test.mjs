import test from 'node:test';
import assert from 'node:assert/strict';
import { appFixture } from './helpers/app-fixture.mjs';
import { createArenaMission } from '../public/arena.mjs';
import { getMission } from '../public/campaign.mjs';
import { terrainHeight } from '../public/terrain.mjs';
import { NUCLEAR_PAYLOADS } from '../public/payloads.mjs';
import { FlightSimulation } from '../public/sim.mjs';

function beginFree(app, aircraft = 'f16', payload = 'conventional') {
  const mission = createArenaMission({ mode: 'freeflight', mapId: 'canyon' }, aircraft);
  app.startMission({ ...mission, payload });
}

function assertTrays(document, nav, systems) {
  const screen = document.getElementById('flight-screen');
  assert.equal(screen.classList.contains('flight-nav-open'), nav);
  assert.equal(screen.classList.contains('aircraft-controls-open'), systems);
  assert.equal(document.getElementById('flight-nav-toggle').getAttribute('aria-expanded'), String(nav));
  assert.equal(document.getElementById('aircraft-controls-toggle').getAttribute('aria-expanded'), String(systems));
}

test('navigation and systems are mutually exclusive and close on pause, resize and leaving flight', async t => {
  const { app, document, window } = await appFixture(t);
  beginFree(app);
  const nav = document.getElementById('flight-nav-toggle');
  const systems = document.getElementById('aircraft-controls-toggle');
  assertTrays(document, false, false);
  nav.onclick(); assertTrays(document, true, false);
  assert.match(nav.getAttribute('aria-label'), /^Hide /);
  systems.onclick(); assertTrays(document, false, true);
  nav.onclick(); assertTrays(document, true, false);
  document.getElementById('pause-button').onclick(); assertTrays(document, false, false);
  nav.onclick(); systems.onclick(); assertTrays(document, false, false);
  document.getElementById('resume-button').onclick();
  systems.onclick(); window.dispatch('resize'); assertTrays(document, false, false);
  nav.onclick();
  document.getElementById('pause-home').onclick();
  assert.equal(app.screen, 'home'); assertTrays(document, false, false);
  nav.onclick(); systems.onclick(); assertTrays(document, false, false);
});

test('systems taps preserve independently held sticks and weapon pointerdown does not dismiss its own tray', async t => {
  const { app, document, window } = await appFixture(t);
  beginFree(app);
  const flight = document.getElementById('flight-stick');
  const yaw = document.getElementById('yaw-thrust-stick');
  flight.dispatch('pointerdown', { pointerId: 11, clientX: 50, clientY: 50 });
  flight.dispatch('pointermove', { pointerId: 11, clientX: 80, clientY: 80 });
  yaw.dispatch('pointerdown', { pointerId: 22, clientX: 50, clientY: 50 });
  yaw.dispatch('pointermove', { pointerId: 22, clientX: 20, clientY: 20 });
  const before = app.controls.read(0);
  assert.ok(before.roll > 0 && before.pitch > 0 && before.yaw < 0);
  document.getElementById('aircraft-controls-toggle').onclick();
  assert.deepEqual(app.controls.read(0), before);

  const radar = document.getElementById('radar-action');
  // The small DOM adapter does not build parent chains. Supply the browser's
  // closest() result for a tap on the nested label in the real weapons group.
  const label = { closest: selector => selector.split(',').includes('#weapon-actions') ? document.getElementById('weapon-actions') : null };
  document.dispatch('pointerdown', { pointerId: 33, target: label });
  assertTrays(document, false, true);
  assert.equal(app.sim.radarOn, true);
  radar.onclick();
  assert.equal(app.sim.radarOn, false);
  assertTrays(document, false, false);
  assert.deepEqual(app.controls.read(0), before);
  window.dispatch('pointerup', { pointerId: 33 });
  assert.deepEqual(app.controls.read(0), before, 'releasing the action finger must not release either stick');
  window.dispatch('pointerup', { pointerId: 11 });
  assert.equal(app.controls.read(0).roll, 0);
  assert.equal(app.controls.read(0).pitch, 0);
  assert.equal(app.controls.read(0).yaw, before.yaw);
});

test('B-2 quick drop reports the altitude lock, retains a rejected bomb and releases with one tap when ready', async t => {
  const { app, document, frame } = await appFixture(t);
  beginFree(app, 'b2', 'hydrogen');
  const profile = NUCLEAR_PAYLOADS.hydrogen;
  const quick = document.getElementById('payload-quick');
  const player = app.sim.player;
  const ground = Math.max(0, terrainHeight(player.x, player.z, app.sim.mission));
  player.y = ground + profile.minimumAltitude - 200;
  frame(120);
  assert.equal(document.getElementById('fire-button').hidden, true);
  assert.equal(quick.hidden, false);
  assert.equal(quick.disabled, false, 'a locked tap explains the release requirement');
  assert.equal(document.getElementById('payload-quick-state').textContent, 'CLIMB');
  assert.match(quick.getAttribute('aria-label'), /locked below/);
  assert.equal(document.getElementById('flight-warning').hidden, false);
  assert.match(document.getElementById('flight-warning').textContent, /PAYLOAD LOCKED/);
  quick.onclick();
  assert.equal(player.bombs, 1);
  assert.equal(app.sim.projectiles.length, 0);

  player.y = ground + profile.minimumAltitude + 400;
  frame(120);
  assert.equal(document.getElementById('payload-quick-state').textContent, 'ARMED');
  assert.equal(quick.classList.contains('ready'), true);
  quick.onclick();
  assert.equal(player.bombs, 0);
  assert.equal(app.sim.projectiles.length, 1);
  assert.equal(app.sim.projectiles[0].payload, 'hydrogen');
  assert.equal(document.getElementById('payload-quick-state').textContent, 'EMPTY');
  assert.equal(quick.disabled, true);
  assertTrays(document, false, false);

  beginFree(app, 'f16');
  assert.equal(document.getElementById('payload-quick').hidden, true, 'fighters keep their one-tap gun control');
  assert.equal(document.getElementById('fire-button').hidden, false);
});

test('the gunner can open navigation without enabling pilot controls or firing a gun', async t => {
  const { app, document } = await appFixture(t);
  const team = app.team;
  Object.assign(team, { code: 'ABC234', id: 'gunner', hostId: 'pilot', connected: true, isHost: false,
    mode: 'crew', role: 'gunner', maxPlayers: 2, missionId: 'gunship-nightwatch', roomState: 'flying',
    roster: [{ id: 'pilot', name: 'Pilot', role: 'pilot', ready: true, connected: true },
      { id: 'gunner', name: 'Gunner', role: 'gunner', ready: true, connected: true }] });
  team.callbacks.onStart({ missionId: team.missionId, mode: 'crew', role: 'gunner', seed: 1 });
  const host = new FlightSimulation(getMission(team.missionId), { playerId: 'pilot' });
  team.callbacks.onWorld({ ...host.getSnapshot(), teamPaused: false });
  const nav = document.getElementById('flight-nav-toggle');
  nav.onclick(); assertTrays(document, true, false);
  assert.equal(app.controls.active, false);
  assert.equal(app.gunnerControls.active, true);
  assert.equal(app.gunnerControls.read(0).fire, false);
  nav.onclick(); assertTrays(document, false, false);
  document.getElementById('pause-button').onclick();
  nav.onclick(); assertTrays(document, false, false);
});
