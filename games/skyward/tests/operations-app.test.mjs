import test from 'node:test';
import assert from 'node:assert/strict';
import { appFixture } from './helpers/app-fixture.mjs';
import { OPERATIONS } from '../public/operations.mjs';
import { LOGBOOK_KEY } from '../public/logbook.mjs';

function launchOperation(document, id = OPERATIONS[0].id) {
  document.getElementById('operations-button').onclick();
  document.getElementById('operation-list').onclick({ target: { closest: selector => selector === '[data-operation]' ? { dataset: { operation: id } } : null } });
  document.getElementById('launch-operation').onclick();
}

// Simulation success/failure is covered by the goal tests. This boundary input
// lets the real app frame, debrief, buttons and persistence consume that result.
function finishSuccessfully(app, frame, time = 250) {
  app.sim.time = time;
  app.sim.sortieStats.airTime = time - 15;
  app.sim.sortieStats.distance = 14000;
  app.sim.sortieStats.landings = 1;
  app.sim.sortieStats.lastLanding = { runwayIndex: 0, speed: 55, sinkRate: 2, quality: 'smooth' };
  app.sim.status = 'success'; app.sim.objective = 'Operation complete · safe recovery';
  frame(120);
}

function setPreference(document, key, value) {
  document.getElementById('settings-content').dispatch('input', { target: {
    dataset: { setting: key }, type: typeof value === 'boolean' ? 'checkbox' : 'select-one',
    value, checked: value,
  } });
}

function beginSquadron(app) {
  const team = app.team;
  const players = [
    { id: 'lead', name: 'Flight lead', aircraft: 'f16', startMode: 'airborne', connected: true, ready: true },
    { id: 'wing', name: 'Wing', aircraft: 'f16', startMode: 'airborne', connected: true, ready: true },
  ];
  const config = { mode: 'squadron', mapId: 'canyon', durationSeconds: 300, lives: 3 };
  Object.assign(team, { code: 'ABC234', id: 'lead', hostId: 'lead', isHost: true, connected: true,
    mode: 'squadron', config, role: 'pilot', roomState: 'flying', missionId: 'first-light', roster: players });
  team.callbacks.onStart({ missionId: 'first-light', mode: 'squadron', config, players,
    hostId: 'lead', runId: 'shared-one', seed: 1, role: 'pilot' });
}

test('operation selection launches the selected aircraft and never rewrites campaign progress', async t => {
  const { app, document, stored, frame } = await appFixture(t);
  const campaign = JSON.stringify({ completed: { 'first-light': { score: 400, time: 200 } }, lastMission: 'new-teeth', totalTime: 200 });
  stored.set('dfe.skyward.logbook.v1', campaign);
  const operation = OPERATIONS.find(mission => mission.id === 'op-heavy-metal');
  launchOperation(document, operation.id);
  assert.equal(app.screen, 'flight'); assert.equal(app.sim.mission.id, operation.id);
  assert.equal(app.sim.player.aircraft, operation.aircraft);
  assert.equal(document.getElementById('flight-mission-number').textContent, 'OPS');
  assert.equal(stored.get('dfe.skyward.logbook.v1'), campaign);
  finishSuccessfully(app, frame, 400);
  assert.equal(app.screen, 'debrief');
  assert.equal(app.flightLog.flights[0].operationId, operation.id);
  assert.equal(app.flightLog.flights[0].medal, 'gold');
  assert.equal(document.getElementById('debrief-operations').hidden, false);
  assert.equal(document.getElementById('next-mission').hidden, true);
  assert.equal(stored.get('dfe.skyward.logbook.v1'), campaign);
});

test('debrief revisits save once and retry begins a distinct flight with clean progress', async t => {
  const { app, document, stored, frame } = await appFixture(t);
  launchOperation(document);
  finishSuccessfully(app, frame);
  const firstId = app.flightLog.flights[0].id;
  assert.equal(app.flightLog.totals.sorties, 1);
  assert.equal(app.flightRecordResult.newBest, true);
  frame(500);
  assert.equal(app.flightLog.totals.sorties, 1);
  document.getElementById('retry-mission').onclick();
  assert.equal(app.screen, 'flight'); assert.equal(app.sim.time, 0);
  assert.equal(app.sim.waypointIndex, 0); assert.equal(app.flightRecordResult, null);
  assert.equal(app.flightLog.totals.sorties, 1);
  finishSuccessfully(app, frame, 240);
  assert.equal(app.flightLog.totals.sorties, 2);
  assert.notEqual(app.flightLog.flights[0].id, firstId);
  assert.equal(app.flightLog.records.length, 1);
  assert.equal(app.flightLog.records[0].duration, 240);
  assert.equal(JSON.parse(stored.get(LOGBOOK_KEY)).totals.sorties, 2);
  document.getElementById('debrief-logbook').onclick();
  assert.equal(app.screen, 'logbook');
  assert.match(document.getElementById('flight-log-content').innerHTML, /Ridge Runner/);
  frame(500);
  document.getElementById('home-button').onclick();
  assert.equal(app.flightLog.totals.sorties, 2, 'returning home cannot re-log a completed debrief');
  document.getElementById('flight-log-button').onclick();
  assert.equal(app.flightLog.totals.sorties, 2, 'reopening history cannot re-log the flight');
});

test('ending free flight records only a meaningful flight and keeps it distinct from successful missions', async t => {
  const { app, document, stored } = await appFixture(t);
  const launch = () => { document.getElementById('free-button').onclick(); document.getElementById('launch-free').onclick(); };
  launch(); app.sim.time = 9.99;
  document.getElementById('pause-button').onclick(); document.getElementById('pause-home').onclick();
  assert.equal(app.flightLog.totals.sorties, 0); assert.equal(stored.has(LOGBOOK_KEY), false);
  launch(); app.sim.time = 10; app.sim.sortieStats.airTime = 8; app.sim.sortieStats.distance = 500;
  document.getElementById('pause-button').onclick(); document.getElementById('pause-home').onclick();
  assert.equal(app.screen, 'home'); assert.equal(app.sim, null);
  assert.equal(app.flightLog.totals.sorties, 1); assert.equal(app.flightLog.totals.ended, 1);
  assert.equal(app.flightLog.totals.completed, 0); assert.equal(app.flightLog.totals.airTime, 8);
  assert.equal(app.flightLog.flights[0].outcome, 'ended'); assert.equal(app.flightLog.flights[0].medal, null);
  assert.equal(app.flightLog.records.length, 0);
  document.getElementById('flight-log-button').onclick();
  assert.match(document.getElementById('flight-log-content').innerHTML, /Flight ended/);
});

test('restarting an unfinished operation records an ended attempt and preserves a clean new run', async t => {
  const { app, document } = await appFixture(t);
  launchOperation(document);
  app.sim.time = 45; app.sim.sortieStats.airTime = 40; app.sim.waypointIndex = 2;
  document.getElementById('pause-button').onclick(); document.getElementById('pause-restart').onclick();
  assert.equal(app.screen, 'flight'); assert.equal(app.sim.time, 0); assert.equal(app.sim.waypointIndex, 0);
  assert.equal(app.flightLog.totals.sorties, 1); assert.equal(app.flightLog.totals.ended, 1);
  assert.equal(app.flightLog.flights[0].operationId, OPERATIONS[0].id);
  assert.equal(app.flightLog.flights[0].medal, null); assert.equal(app.flightLog.records.length, 0);
});

test('changing handling during an operation cannot earn a record even after restoring it', async t => {
  const { app, document, frame } = await appFixture(t);
  launchOperation(document);
  document.getElementById('pause-button').onclick();
  document.querySelector('.secondary[data-open-settings]').onclick();
  setPreference(document, 'assist', 'expert');
  assert.equal(app.sim.settings.assist, 'expert');
  setPreference(document, 'assist', 'assisted');
  document.getElementById('done-settings').onclick(); document.getElementById('resume-button').onclick();
  finishSuccessfully(app, frame);
  const changed = app.flightLog.flights[0];
  assert.equal(changed.outcome, 'success'); assert.equal(changed.medal, null);
  assert.equal(changed.recordEligible, false); assert.equal(app.flightLog.records.length, 0);
  assert.match(document.getElementById('debrief-flight-report').innerHTML, /Handling changed during flight/);
  document.getElementById('retry-mission').onclick();
  document.getElementById('pause-button').onclick();
  document.querySelector('.secondary[data-open-settings]').onclick(); setPreference(document, 'theme', 'day');
  document.getElementById('done-settings').onclick(); document.getElementById('resume-button').onclick();
  finishSuccessfully(app, frame, 245);
  assert.equal(app.flightLog.flights[0].medal, 'gold', 'display changes do not invalidate handling records');
  assert.equal(app.flightLog.flights[0].recordEligible, true);
  assert.equal(app.flightLog.records.length, 1);
});

test('operations board refreshes its best record when handling changes in setup', async t => {
  const { app, document, frame } = await appFixture(t);
  launchOperation(document); finishSuccessfully(app, frame);
  document.getElementById('debrief-operations').onclick();
  assert.equal(app.screen, 'operations');
  assert.match(document.getElementById('operation-brief').innerHTML, /Gold · 4:10/);
  document.querySelector('[data-open-settings]').onclick(); setPreference(document, 'assist', 'expert');
  document.getElementById('done-settings').onclick();
  assert.match(document.getElementById('operation-brief').innerHTML, /YOUR BEST · EXPERT/);
  assert.match(document.getElementById('operation-brief').innerHTML, /No completed flight/);
  assert.equal(app.flightLog.records.length, 1, 'changing view preferences preserves the assisted record');
});

test('squadron debrief and return to hangar do not add solo flight records', async t => {
  const { app, document, stored, frame } = await appFixture(t);
  beginSquadron(app);
  finishSuccessfully(app, frame, 300);
  assert.equal(app.screen, 'debrief');
  assert.equal(document.getElementById('debrief-logbook').hidden, true);
  assert.equal(document.getElementById('debrief-flight-report').hidden, true);
  assert.equal(app.flightRecordResult, null); assert.equal(app.flightLog.totals.sorties, 0);
  assert.equal(stored.has(LOGBOOK_KEY), false);
  document.querySelector('.text-button[data-home]').onclick();
  assert.equal(app.screen, 'home'); assert.equal(app.flightLog.totals.sorties, 0);
});
