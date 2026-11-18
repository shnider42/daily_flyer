import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSharedConnection} from '../public/connection-status.mjs';

const NOW = Date.parse('2026-11-17T18:00:00Z');
const board = (overrides = {}) => ({
  busy: false, hasPending: false, loadIssue: null,
  connection: {updates: 'live', online: true, checking: false, slow: false, lastConfirmedAt: NOW - 10000, lastResponseMs: 180, pollIntervalMs: 15000},
  ...overrides,
});
const describe = store => describeSharedConnection(store, {now: NOW});

test('live transport never conceals stale content or confirms an unconfirmed save', () => {
  const store = board();
  assert.equal(describe(store).label, 'Live updates');
  store.connection.checking = true;
  assert.equal(describe(store).label, 'Live updates', 'routine quick polls do not repeatedly announce a status change');
  assert.equal(describe(store).actionLabel, 'Checking…');
  store.connection.checking = false;
  store.connection.lastConfirmedAt = NOW - 45000;
  assert.equal(describe(store).label, 'Updates delayed');
  store.connection.lastConfirmedAt = NOW;
  store.hasPending = true;
  store.connection.checking = true;
  const status = describe(store);
  assert.equal(status.label, 'Save needs confirmation');
  assert.equal(status.saveLabel, 'Save needs confirmation');
  assert.equal(status.action, 'retry-pending');
  assert.match(status.detail, /may have reached/);
});

test('fallback and read failures preserve the separate confirmed-save status', () => {
  const store = board();
  store.connection.updates = 'polling';
  assert.equal(describe(store).label, 'Checking every 15s');
  store.loadIssue = 'The last refresh failed.';
  const status = describe(store);
  assert.equal(status.label, 'Updates delayed');
  assert.equal(status.saveLabel, 'Saved to shared workspace');
  assert.equal(status.saveError, false);
  assert.equal(status.action, 'refresh-shared');
});

test('offline takes precedence over a subscribed channel and allows no misleading refresh action', () => {
  const store = board();
  store.connection.online = false;
  let status = describe(store);
  assert.equal(status.label, 'Offline · updates paused');
  assert.equal(status.actionDisabled, true);
  assert.match(status.detail, /last confirmed copy/);
  store.hasPending = true;
  status = describe(store);
  assert.equal(status.label, 'Save needs confirmation');
  assert.equal(status.actionDisabled, true);
});

test('slow in-flight saves are still waiting, not already failed or confirmed', () => {
  const store = board({busy: true, hasPending: true});
  store.connection.slow = true;
  const status = describe(store);
  assert.equal(status.label, 'Save taking longer…');
  assert.equal(status.saveLabel, 'Still saving…');
  assert.equal(status.saveError, false);
  assert.equal(status.actionDisabled, true);
  assert.match(status.detail, /another submission is not needed/);
});

test('freshness and response duration use only confirmed measurements and explain their scope', () => {
  const store = board();
  assert.equal(describe(store).freshness, 'Last confirmed 10s ago.');
  assert.match(describe(store).response, /180 ms, including server processing/);
  store.connection.lastResponseMs = 2450;
  assert.match(describe(store).response, /2\.5 s/);
  store.connection.lastConfirmedAt = null;
  store.connection.lastResponseMs = null;
  assert.equal(describe(store).label, 'Updates delayed');
  assert.equal(describe(store).response, '');
  store.connection.lastConfirmedAt = NOW + 10000;
  assert.equal(describe(store).freshness, 'Last confirmed just now.');
});
