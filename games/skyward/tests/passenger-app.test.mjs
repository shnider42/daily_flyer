import test from 'node:test';
import assert from 'node:assert/strict';
import { appFixture } from './helpers/app-fixture.mjs';
import { OPERATIONS } from '../public/operations.mjs';
import { AIRCRAFT } from '../public/campaign.mjs';
import { LOGBOOK_KEY, loadLogbook } from '../public/logbook.mjs';
import { terrainHeight } from '../public/terrain.mjs';

const passengerFlights = () => OPERATIONS.filter(mission => mission.goal?.task === 'passenger');
function selectPassengerBoard(document) {
  document.getElementById('operations-button').onclick();
  document.querySelector('[data-operation-group="passenger"]').onclick();
}

test('passenger board exposes three routes without mixing them into the challenge list', async t => {
  const { app, document } = await appFixture(t);
  const routes = passengerFlights();
  assert.equal(routes.length, 3);
  selectPassengerBoard(document);
  const list = document.getElementById('operation-list').innerHTML;
  for (const route of routes) assert.ok(list.includes(route.title));
  assert.ok(!list.includes('Ridge Runner'));
  assert.equal(document.getElementById('operation-count').textContent, '3 AVAILABLE');
  assert.equal(document.querySelector('[data-operation-group="passenger"]').getAttribute('aria-pressed'), 'true');
  const route = routes[1];
  document.getElementById('operation-list').onclick({ target: { closest: () => ({ dataset: { operation: route.id } }) } });
  const brief = document.getElementById('operation-brief').innerHTML;
  assert.ok(brief.includes(route.runways[route.goal.departureRunway].label));
  assert.ok(brief.includes(route.runways[route.goal.destinationRunway].label));
  assert.ok(brief.includes(`${route.passengers} passengers`));
  document.getElementById('launch-operation').onclick();
  assert.equal(app.sim.mission.id, route.id);
  assert.equal(app.sim.player.aircraft, 'b767');
  assert.equal(document.getElementById('flight-mission-number').textContent, route.passengerRoute.flightNumber);
  assert.equal(document.getElementById('hud-stores').textContent, `${route.passengers} ABOARD`);
  for (const id of ['fire-button', 'payload-quick', 'payload-action', 'missile-action', 'countermeasure-action', 'radar-action', 'weapon-actions', 'crosshair']) {
    assert.equal(document.getElementById(id).hidden, true, `${id} stays out of the passenger cockpit`);
  }
});

test('passenger debrief and persisted flight history keep arrival totals and omit combat statistics', async t => {
  const { app, document, stored, frame } = await appFixture(t);
  selectPassengerBoard(document); document.getElementById('launch-operation').onclick();
  const mission = app.sim.mission;
  // Consume the simulation's completed-flight boundary through the actual app.
  // Full departure and arrival mechanics are exercised in passenger simulation tests.
  app.sim.time = 400; app.sim.status = 'success';
  app.sim.passengerState.aboard = 0; app.sim.passengerState.delivered = mission.passengers;
  app.sim.sortieStats.airTime = 360; app.sim.sortieStats.landings = 1;
  app.sim.sortieStats.lastLanding = { runwayIndex: 1, speed: 71, sinkRate: 2.1, quality: 'smooth' };
  frame(120);
  assert.equal(app.screen, 'debrief');
  const debrief = document.getElementById('debrief-flight-report').innerHTML;
  assert.match(debrief, /Passengers arrived/);
  assert.ok(debrief.includes(`${mission.passengers} / ${mission.passengers}`));
  assert.ok(!debrief.includes('Air / ground targets'));
  assert.ok(debrief.includes('Smooth'));
  const book = loadLogbook({ getItem: key => stored.get(key) });
  assert.equal(book.flights[0].passenger.delivered, mission.passengers);
  assert.equal(book.flights[0].passenger.arrival, mission.runways[1].label);
  assert.equal(book.flights[0].aircraft, 'b767');
  assert.ok(stored.has(LOGBOOK_KEY));
  document.getElementById('debrief-logbook').onclick();
  assert.ok(document.getElementById('flight-log-content').innerHTML.includes(mission.passengerRoute.flightNumber));
  assert.equal(app.flightLog.totals.sorties, 1);
});

test('767 free flight starts at a passenger airport with jet startup controls and no payload options', async t => {
  const { app, document } = await appFixture(t);
  document.getElementById('free-button').onclick();
  document.getElementById('aircraft-list').onclick({ target: { closest: () => ({ dataset: { aircraft: 'b767' } }) } });
  document.getElementById('free-start').value = 'runway';
  assert.equal(document.getElementById('free-payload-field').hidden, true);
  document.getElementById('launch-free').onclick();
  const runway = app.sim.mission.runways.find(runway => !runway.carrier);
  assert.equal(app.sim.aircraft, AIRCRAFT.b767);
  assert.equal(runway.airport, true); assert.ok(runway.length >= 3000); assert.ok(runway.width >= 120);
  assert.equal(app.sim.player.onGround, true); assert.equal(app.sim.player.engine, false);
  assert.equal(document.getElementById('startup-title').textContent, 'Fuel supply.');
  assert.equal(document.getElementById('startup-steps').children[3].textContent, 'ENGINES');
  assert.equal(document.getElementById('hud-stores').textContent, 'PASSENGER JET · EMPTY');
  assert.equal(document.getElementById('weapon-actions').hidden, true);
});

test('Alpine passenger airport and spawn sit at the natural ridge elevation', async t => {
  const { app, document } = await appFixture(t);
  document.getElementById('free-button').onclick();
  document.getElementById('aircraft-list').onclick({ target: { closest: () => ({ dataset: { aircraft: 'b767' } }) } });
  document.getElementById('free-biome').value = 'mountains';
  document.getElementById('free-start').value = 'runway';
  document.getElementById('launch-free').onclick();
  const runway = app.sim.mission.runways.find(runway => !runway.carrier);
  const natural = terrainHeight(runway.x, runway.z, { biome: 'mountains' });
  assert.equal(runway.y, natural);
  assert.equal(app.sim.player.y, natural + 3);
  assert.ok(runway.y > 600, 'the heavy jet must not start in a sea-level trench below the mountain ridge');
});
