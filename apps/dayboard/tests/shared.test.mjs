import test from 'node:test';
import assert from 'node:assert/strict';
import {TeamService, readBoardBackup} from '../public/shared.mjs';
import {makeTask, normalizeWorkspace} from '../public/model.mjs';
import {TEAM_CONFIG} from '../public/team-config.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const FORMER = '33333333-3333-4333-8333-333333333333';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = '2026-11-16T12:00:00.000Z';
const config = {enabled: true, url: 'https://dayboard-test.supabase.co', publishableKey: 'sb_publishable_test'};
const clone = value => structuredClone(value);

class MemoryStorage {
  constructor() { this.values = new Map([['dfe.dayboard.v1', 'personal-board-original-bytes']]); this.reads = []; this.writes = []; }
  getItem(key) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes.push(key); this.values.set(key, String(value)); }
  removeItem(key) { this.writes.push(key); this.values.delete(key); }
}

function fixture() {
  const data = normalizeWorkspace({
    schemaVersion: 2, revision: 1, updatedAt: NOW,
    areas: [{id: 'general', name: 'General', color: 'blue'}],
    projects: [{id: 'project', name: 'Shared project', area: 'general', url: '', description: '', starter: false, archived: false}],
    tasks: [makeTask({id: 'a', number: 1, title: 'First shared task', area: 'general', projectId: 'project'}, NOW), makeTask({id: 'b', number: 2, title: 'Second shared task', area: 'general'}, NOW)],
    settings: {},
  });
  return {
    workspace: {id: WORKSPACE, name: 'Test team', role: 'owner', revision: 1}, data,
    versions: {areas: {general: 1}, projects: {project: 1}, tasks: {a: 1, b: 1}, pins: {}},
    assignees: {a: OWNER, b: null},
    members: [{userId: OWNER, email: 'owner@example.test', displayName: 'Owner', role: 'owner'}, {userId: MEMBER, email: 'member@example.test', displayName: 'Member', role: 'member'}],
  };
}

/** A protocol fake; SQL validation, RLS, and transactions have their own DB tests. */
class Server {
  constructor() { this.snapshot = fixture(); this.receipts = new Map(); this.calls = []; this.nextNumber = 3; this.handler = null; this.applied = 0; this.createRequests = new Set(); }
  advance() {
    this.snapshot.workspace.revision++;
    this.snapshot.data.revision = this.snapshot.workspace.revision;
    this.snapshot.data.updatedAt = new Date(Date.parse(NOW) + this.snapshot.workspace.revision * 1000).toISOString();
  }
  editTask(id, changes) {
    Object.assign(this.snapshot.data.tasks.find(task => task.id === id), changes);
    this.snapshot.versions.tasks[id]++;
    this.advance();
    this.snapshot.data.tasks.find(task => task.id === id).updatedAt = this.snapshot.data.updatedAt;
  }
  response(name, args) {
    if (name === 'dayboard_snapshot') return {data: clone(this.snapshot), error: null};
    if (name === 'dayboard_workspaces') return {data: [clone(this.snapshot.workspace)], error: null};
    if (name === 'dayboard_create_workspace') {
      this.createRequests.add(args.p_request_id);
      return {data: clone(this.snapshot), error: null};
    }
    if (name !== 'dayboard_commit') throw new Error(`Unexpected RPC: ${name}`);
    const priorReceipt = this.receipts.get(args.p_request_id);
    if (priorReceipt) return {data: {...clone(this.snapshot), receipt: {...clone(priorReceipt), replayed: true}}, error: null};
    const collections = {area: 'areas', project: 'projects', task: 'tasks', pin: 'pins'};
    for (const change of args.p_changes) {
      const version = this.snapshot.versions[collections[change.entity]][change.id] || 0;
      if (version !== change.expectedVersion) return {data: null, error: {code: '40001', message: `This ${change.entity} changed. Review the latest version before saving.`}};
    }
    const receipt = {requestId: args.p_request_id, replayed: false, versions: {areas: {}, projects: {}, tasks: {}, pins: {}}};
    for (const change of args.p_changes) {
      const collection = collections[change.entity];
      const version = (this.snapshot.versions[collection][change.id] || 0) + 1;
      this.snapshot.versions[collection][change.id] = version;
      receipt.versions[collection][change.id] = version;
      if (change.entity === 'pin') {
        const task = this.snapshot.data.tasks.find(task => task.id === change.id);
        if (task) task.today = change.operation === 'put' && change.value.pinned;
        continue;
      }
      const rows = this.snapshot.data[collection], index = rows.findIndex(row => row.id === change.id);
      if (change.operation === 'delete') {
        if (index !== -1) rows.splice(index, 1);
        if (change.entity === 'task') delete this.snapshot.assignees[change.id];
      } else {
        const row = clone(change.value);
        if (change.entity === 'task') {
          row.number = index === -1 ? this.nextNumber++ : rows[index].number;
          row.today = index === -1 ? false : rows[index].today;
          this.snapshot.assignees[row.id] = change.assigneeId || null;
        }
        if (index === -1) rows.push(row); else rows[index] = row;
      }
    }
    this.advance();
    for (const change of args.p_changes) if (change.entity === 'task' && change.operation === 'put') this.snapshot.data.tasks.find(task => task.id === change.id).updatedAt = this.snapshot.data.updatedAt;
    this.receipts.set(args.p_request_id, receipt);
    this.applied++;
    return {data: {...clone(this.snapshot), receipt: clone(receipt)}, error: null};
  }
  async rpc(name, args) {
    this.calls.push({name, args: clone(args)});
    return this.handler ? await this.handler(name, args, () => this.response(name, args)) : this.response(name, args);
  }
}

async function setup({server = new Server(), storage = new MemoryStorage(), serviceOptions = {}} = {}) {
  let authCallback;
  const session = {access_token: 'synthetic-owner-token', user: {id: OWNER, email: 'owner@example.test', email_confirmed_at: NOW}};
  const client = {
    auth: {
      getSession: async () => ({data: {session}, error: null}),
      onAuthStateChange: callback => { authCallback = callback; return {data: {subscription: {unsubscribe() {}}}}; },
      signOut: async () => { authCallback('SIGNED_OUT', null); return {error: null}; },
      signInWithOtp: async args => { client.signInArgs = args; return {error: null}; },
    },
    rpc: (name, args) => server.rpc(name, args),
  };
  const service = new TeamService(config, {client, storage, personalSettings: {theme: 'light', density: 'compact'}, storeOptions: {autoSubscribe: false}, ...serviceOptions});
  await service.init();
  const store = await service.openWorkspace(WORKSPACE);
  return {service, store, server, storage, client, authChange: (userId = MEMBER) => authCallback('SIGNED_IN', {user: {id: userId, email: 'member@example.test', email_confirmed_at: NOW}})};
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function connectionClock() {
  let elapsed = 0, wall = Date.parse(NOW), nextTimer = 0;
  const timers = new Map();
  return {
    options: {
      autoSubscribe: false, now: () => wall, monotonicNow: () => elapsed,
      scheduleTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, {callback, at: elapsed + delay}); return id; },
      cancelTimeout: id => timers.delete(id),
    },
    get now() { return wall; },
    get timerCount() { return timers.size; },
    shiftWall(ms) { wall += ms; },
    advance(ms) {
      const target = elapsed + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        wall += timer.at - elapsed; elapsed = timer.at;
        timers.delete(id); timer.callback();
      }
      wall += target - elapsed; elapsed = target;
    },
  };
}

function connectionSurface(client) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const listeners = new Map();
  const target = name => ({
    addEventListener(type, listener) { const key = `${name}:${type}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(listener); },
    removeEventListener(type, listener) { listeners.get(`${name}:${type}`)?.delete(listener); },
  });
  globalThis.window = {...target('window'), navigator: {onLine: true}};
  globalThis.document = {...target('document'), visibilityState: 'visible'};
  let update, status, removed = 0;
  const channel = {
    on(_event, _filter, callback) { update = callback; return this; },
    subscribe(callback) { status = callback; return this; },
  };
  client.channel = () => channel;
  client.removeChannel = () => { removed++; };
  return {
    update: () => update(), status: value => status(value),
    event(type) { for (const listener of listeners.get(`window:${type}`) || []) listener(); },
    get listenerCount() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
    get removedChannels() { return removed; },
    restore() {
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    },
  };
}

test('team mode is disabled by default and cannot instantiate an SDK or reach a backend', async () => {
  let called = false;
  const service = new TeamService(TEAM_CONFIG, {clientFactory: () => { called = true; throw new Error('Should not run'); }});
  assert.equal(await service.init(), null);
  assert.equal(service.configured, false);
  await assert.rejects(service.listWorkspaces(), /not enabled/);
  assert.equal(called, false);
  assert.equal(new TeamService({...config, publishableKey: 'sb_secret_never-public'}).configured, false);
});

test('independent edits submit only their changed record and retain another member’s task update', async () => {
  const {store, server, storage} = await setup();
  server.editTask('b', {title: 'Another member updated this'});
  await store.commit(draft => { draft.tasks.find(task => task.id === 'a').title = 'My independent edit'; });
  const request = server.calls.find(call => call.name === 'dayboard_commit');
  assert.deepEqual(request.args.p_changes.map(change => [change.entity, change.id, change.expectedVersion]), [['task', 'a', 1]]);
  assert.equal(store.state.tasks.find(task => task.id === 'b').title, 'Another member updated this');
  assert.equal(store.state.tasks.find(task => task.id === 'a').title, 'My independent edit');
  assert.equal(storage.values.get('dfe.dayboard.v1'), 'personal-board-original-bytes');
  assert.equal(storage.reads.includes('dfe.dayboard.v1'), false);
  assert.equal(storage.writes.includes('dfe.dayboard.v1'), false);
});

test('same-record conflicts leave memory and undo history intact', async () => {
  const {store, server} = await setup();
  const before = store.state;
  server.editTask('a', {title: 'A newer edit'});
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'My retained draft'; }), error => error.conflict === true && /changed/.test(error.message));
  assert.equal(store.state, before);
  assert.equal(store.hasPending, false);
  assert.equal(store.canUndo, false);
  assert.equal(server.snapshot.data.tasks[0].title, 'A newer edit');
});

test('Today changes are private pin operations and display choices only use account-scoped preferences', async () => {
  const {store, server, storage} = await setup();
  await store.commit(draft => { draft.tasks[0].today = true; draft.tasks[0].updatedAt = new Date().toISOString(); });
  const changes = server.calls.find(call => call.name === 'dayboard_commit').args.p_changes;
  assert.deepEqual(changes, [{entity: 'pin', id: 'a', operation: 'put', expectedVersion: 0, value: {pinned: true}}]);
  assert.equal(store.versions.tasks.a, 1);
  const callsBefore = server.calls.length;
  await store.commit(draft => { draft.settings.density = 'comfortable'; });
  assert.equal(server.calls.length, callsBefore);
  assert.deepEqual(storage.writes, [`dfe.dayboard.team-preferences.v1.${OWNER}.${WORKSPACE}`]);
  assert.equal(store.state.settings.density, 'comfortable');
  assert.equal(JSON.parse(store.exportJSON()).board.tasks[0].today, false);
});

test('a lost acknowledgement is retried with the same request and does not duplicate a task', async () => {
  const {store, server} = await setup();
  let lost = false;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_commit' && !lost) { lost = true; return {data: null, error: {message: 'fetch failed'}}; }
    return result;
  };
  await store.commit(draft => { draft.tasks.push(makeTask({id: 'new', title: 'Only once', area: 'general'}, NOW)); });
  const requests = server.calls.filter(call => call.name === 'dayboard_commit');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].args, requests[1].args);
  assert.equal(server.applied, 1);
  assert.equal(store.state.tasks.filter(task => task.id === 'new').length, 1);
  assert.equal(store.hasPending, false);
});

test('unconfirmed saves retain the original request and block unrelated edits until explicit retry', async () => {
  const {store, server} = await setup();
  const before = store.state;
  let failures = 2;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_commit' && failures-- > 0) return {data: null, error: {message: 'Lost reply'}};
    return result;
  };
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'Already on the server'; }), error => error.uncertain === true);
  assert.equal(store.state, before);
  assert.equal(store.hasPending, true);
  assert.equal(store.busy, false);
  const count = server.calls.length;
  await assert.rejects(store.commit(draft => { draft.tasks[1].title = 'Another edit'; }), /original save/);
  assert.equal(server.calls.length, count);
  await store.retryPending();
  assert.equal(store.hasPending, false);
  assert.equal(store.state.tasks[0].title, 'Already on the server');
  assert.equal(server.applied, 1);
  const requestIds = new Set(server.calls.filter(call => call.name === 'dayboard_commit').map(call => call.args.p_request_id));
  assert.equal(requestIds.size, 1);
});

test('action-specific Undo retains later edits to unrelated tasks and rejects later edits to the same task', async () => {
  const {store, server} = await setup();
  await store.commit(draft => { draft.tasks[0].status = 'doing'; });
  server.editTask('b', {notes: 'Keep another member’s work'});
  await store.reload();
  await store.undo();
  assert.equal(store.state.tasks[0].status, 'inbox');
  assert.equal(store.state.tasks[1].notes, 'Keep another member’s work');
  const undo = server.calls.filter(call => call.name === 'dayboard_commit').at(-1);
  assert.deepEqual(undo.args.p_changes.map(change => [change.entity, change.id]), [['task', 'a']]);
  await store.commit(draft => { draft.tasks[0].title = 'My later change'; });
  server.editTask('a', {title: 'Someone edited this afterwards'});
  await store.reload();
  const before = store.state;
  await assert.rejects(store.undo(), error => error.conflict === true);
  assert.equal(store.state, before);
  assert.equal(store.state.tasks[0].title, 'Someone edited this afterwards');
});

test('replayed receipts keep original affected versions so Undo cannot erase work after a lost reply', async () => {
  const {store, server} = await setup();
  let failures = 2;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_commit' && failures-- > 0) return {data: null, error: {message: 'Lost reply'}};
    return result;
  };
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'My confirmed-later edit'; }));
  server.editTask('a', {title: 'New work after the first edit'});
  await store.retryPending();
  assert.equal(store.versions.tasks.a, 3);
  assert.equal(store.state.tasks[0].title, 'New work after the first edit');
  await assert.rejects(store.undo(), error => error.conflict === true);
  const request = server.calls.filter(call => call.name === 'dayboard_commit').at(-1);
  assert.equal(request.args.p_changes[0].expectedVersion, 2);
});

test('a slow refresh cannot overwrite a later acknowledged edit', async () => {
  const {store, server} = await setup();
  let release;
  server.handler = async (name, args, respond) => {
    if (name === 'dayboard_snapshot') {
      const result = respond();
      return await new Promise(resolve => { release = () => resolve(result); });
    }
    return respond();
  };
  const refresh = store.reload();
  await new Promise(resolve => setImmediate(resolve));
  await store.commit(draft => { draft.tasks[0].title = 'Newer acknowledged work'; });
  release();
  await refresh;
  assert.equal(store.state.tasks[0].title, 'Newer acknowledged work');
});

test('an obsolete refresh failure cannot replace a newer save or its connection confirmation', async t => {
  const clock = connectionClock();
  const {store, server} = await setup({serviceOptions: {storeOptions: clock.options}});
  t.after(() => store.dispose());
  let rejectRead;
  server.handler = async (name, _args, respond) => {
    if (name === 'dayboard_snapshot') return await new Promise(resolve => { rejectRead = () => resolve({data: null, error: {code: '42501', message: 'Obsolete denied read'}}); });
    clock.advance(25);
    return respond();
  };
  const refresh = store.reload();
  const failed = assert.rejects(refresh, /Obsolete denied read/);
  await settle();
  clock.advance(100);
  await store.commit(draft => { draft.tasks[0].title = 'Newer confirmed save'; });
  const confirmed = store.connection;
  assert.equal(confirmed.lastResponseMs, 25);
  assert.equal(confirmed.checking, false);
  rejectRead();
  await failed;
  assert.equal(store.state.tasks[0].title, 'Newer confirmed save');
  assert.equal(store.syncStatus, 'saved');
  assert.equal(store.lastError, null);
  assert.equal(store.loadIssue, null);
  assert.deepEqual(store.connection, confirmed);
  assert.equal(store._disposed, false, 'an old permission response must not revoke a newer successful session');
});

test('updates arriving during a refresh coalesce into a fresh authorized read after it settles', async t => {
  const clock = connectionClock();
  const {store, server, client} = await setup({serviceOptions: {storeOptions: clock.options}});
  const surface = connectionSurface(client);
  t.after(() => { store.dispose(); surface.restore(); });
  store._startUpdates();
  let release, reads = 0;
  server.handler = async (name, _args, respond) => {
    if (name === 'dayboard_snapshot' && ++reads === 1) {
      const older = respond();
      return await new Promise(resolve => { release = () => resolve(older); });
    }
    return respond();
  };
  const first = store.reload();
  await settle();
  server.editTask('b', {title: 'Changed after the first read'});
  surface.update(); surface.update();
  clock.advance(100);
  await settle();
  assert.equal(reads, 1, 'invalidation must not start overlapping refreshes');
  release();
  await first;
  clock.advance(100);
  await settle();
  assert.equal(reads, 2, 'an invalidation received in flight must not disappear with the old reply');
  assert.equal(store.state.tasks.find(task => task.id === 'b').title, 'Changed after the first read');
  assert.equal(store.connection.checking, false);
});

test('connection timing distinguishes slow reads and saves and only records valid responses using monotonic time', async t => {
  const clock = connectionClock();
  const {store, server} = await setup({serviceOptions: {storeOptions: clock.options}});
  t.after(() => store.dispose());
  assert.ok(Object.isFrozen(store.connection));
  assert.equal(store.connection.lastConfirmedAt, clock.now);
  assert.equal(store.connection.lastResponseMs, null);
  assert.equal(store.connection.pollIntervalMs, 15000);
  let release;
  server.handler = async (_name, _args, respond) => {
    const response = respond();
    return await new Promise(resolve => { release = () => resolve(response); });
  };
  const events = [];
  store.subscribe((_store, event) => events.push(event.type));
  const state = store.state;
  const read = store.reload();
  await settle();
  assert.equal(store.connection.checking, true);
  clock.advance(1999);
  assert.equal(store.connection.slow, false);
  clock.advance(1);
  assert.equal(store.connection.slow, true);
  assert.equal(store.state, state, 'slow feedback must not mutate board content');
  assert.ok(events.every(type => type === 'connection'));
  clock.shiftWall(60 * 60 * 1000);
  clock.advance(250);
  release();
  await read;
  assert.equal(store.connection.lastResponseMs, 2250, 'a wall-clock adjustment must not change measured response time');
  assert.equal(store.connection.lastConfirmedAt, clock.now);
  assert.equal(store.connection.checking, false);
  assert.equal(store.connection.slow, false);
  assert.equal(clock.timerCount, 0);

  const save = store.commit(draft => { draft.tasks[0].title = 'Slow acknowledged save'; });
  await settle();
  assert.equal(store.connection.checking, false);
  assert.equal(store.busy, true);
  clock.advance(2075);
  assert.equal(store.connection.slow, true);
  release();
  await save;
  assert.equal(store.connection.lastResponseMs, 2075);
  assert.equal(store.connection.slow, false);
  assert.equal(clock.timerCount, 0);

  const confirmed = store.connection;
  server.handler = async () => ({data: null, error: {code: 'NETWORK', message: 'Read unavailable'}});
  clock.advance(400);
  await assert.rejects(store.reload(), /Read unavailable/);
  assert.equal(store.connection.lastConfirmedAt, confirmed.lastConfirmedAt);
  assert.equal(store.connection.lastResponseMs, confirmed.lastResponseMs);
  assert.equal(store.connection.checking, false);
  assert.equal(clock.timerCount, 0);
});

test('browser connectivity is immediate, online always rechecks, and disposal silences timers and late replies', async t => {
  const clock = connectionClock();
  const {store, server, client} = await setup({serviceOptions: {storeOptions: clock.options}});
  const surface = connectionSurface(client);
  t.after(() => { store.dispose(); surface.restore(); });
  store._startUpdates();
  const events = [];
  store.subscribe((_store, event) => events.push(event.type));
  const openedAt = store.connection.lastConfirmedAt;
  surface.status('SUBSCRIBED');
  assert.equal(store.connection.updates, 'live');
  assert.equal(store.connection.lastConfirmedAt, openedAt, 'socket subscription does not confirm board freshness');
  clock.advance(100);
  await settle();
  const reads = () => server.calls.filter(call => call.name === 'dayboard_snapshot').length;
  assert.equal(reads(), 2, 'subscription follows the initial opening with an authorized read');
  server.editTask('a', {title: 'New work while already subscribed'});
  surface.event('online');
  clock.advance(100);
  await settle();
  assert.equal(reads(), 3, 'online revalidates even when the channel was already subscribed');
  assert.equal(store.state.tasks[0].title, 'New work while already subscribed');
  const state = store.state, confirmed = store.connection;
  surface.event('offline');
  assert.equal(store.connection.online, false);
  assert.equal(store.connection.updates, 'polling');
  assert.equal(store.state, state);
  clock.advance(15000);
  await settle();
  assert.equal(reads(), 3, 'background polling pauses while the browser reports offline');
  assert.equal(store.connection.lastConfirmedAt, confirmed.lastConfirmedAt);

  let release;
  server.handler = async (_name, _args, respond) => {
    const response = respond();
    return await new Promise(resolve => { release = () => resolve(response); });
  };
  surface.status('SUBSCRIBED');
  surface.event('online');
  assert.equal(store.connection.online, true);
  assert.equal(store.connection.updates, 'polling');
  surface.update();
  assert.equal(store.connection.updates, 'live', 'a surviving subscription can resume without a new SUBSCRIBED callback');
  assert.equal(store.connection.lastConfirmedAt, confirmed.lastConfirmedAt);
  clock.advance(100);
  await settle();
  assert.equal(store.connection.checking, true);
  const inFlight = store._refreshPromise;
  const closed = assert.rejects(inFlight, /closed/);
  store.dispose();
  const afterDisposal = store.connection, eventCount = events.length;
  assert.equal(clock.timerCount, 0);
  assert.equal(surface.listenerCount, 0);
  assert.equal(surface.removedChannels, 1);
  surface.status('SUBSCRIBED'); surface.update(); surface.event('online');
  clock.advance(20000);
  release();
  await closed;
  assert.equal(events.length, eventCount);
  assert.deepEqual(store.connection, afterDisposal);
  assert.equal(store.connection.checking, false);
  assert.equal(store.connection.slow, false);
});

test('connection recovery never replays an unconfirmed write or advertises it as confirmed', async t => {
  const clock = connectionClock();
  const {store, server, client} = await setup({serviceOptions: {storeOptions: clock.options}});
  const surface = connectionSurface(client);
  t.after(() => { store.dispose(); surface.restore(); });
  store._startUpdates();
  const confirmedAt = store.connection.lastConfirmedAt;
  server.handler = async (name, _args, respond) => {
    const response = respond();
    if (name === 'dayboard_commit') throw new Error('Lost response');
    return response;
  };
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'Original pending save'; }), error => error.uncertain);
  const originalRequest = server.calls.find(call => call.name === 'dayboard_commit').args.p_request_id;
  const calls = server.calls.length;
  assert.equal(store.hasPending, true);
  surface.event('offline'); surface.event('online'); surface.status('SUBSCRIBED'); surface.update();
  clock.advance(15000);
  await settle();
  assert.equal(server.calls.length, calls, 'connection events must not replay the pending operation');
  assert.equal(store.hasPending, true);
  assert.equal(store.connection.lastConfirmedAt, confirmedAt);
  server.handler = null;
  await store.retryPending();
  assert.equal(server.calls.at(-1).args.p_request_id, originalRequest);
  assert.equal(server.applied, 1);
  assert.equal(store.hasPending, false);
  assert.equal(store.connection.lastConfirmedAt, clock.now);
});

test('an account change during a save cannot publish or retry the original account’s request under another identity', async () => {
  const {store, server, authChange} = await setup();
  const before = store.state;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_commit') authChange();
    return result;
  };
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'Original account edit'; }), error => error.code === 'AUTH_CHANGED');
  assert.equal(store.state, before);
  assert.equal(store.hasPending, true);
  const count = server.calls.length;
  await assert.rejects(store.retryPending(), /account changed/i);
  await assert.rejects(store.reload(), /account changed/i);
  assert.equal(server.calls.length, count);
});

test('same-account restoration transfers an unconfirmed request only after fresh membership authorization', async () => {
  const {service, store, server, authChange} = await setup();
  let failures = 2;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_commit' && failures-- > 0) return {data: null, error: {message: 'Lost reply'}};
    return result;
  };
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'Original account’s retained save'; }));
  const originalRequest = server.calls.find(call => call.name === 'dayboard_commit').args.p_request_id;
  authChange(MEMBER);
  await assert.rejects(service.reopenWorkspace(store), error => error.code === 'AUTH_CHANGED');
  authChange(OWNER);
  const resumed = await service.reopenWorkspace(store);
  assert.equal(resumed.userId, OWNER);
  assert.equal(resumed.hasPending, true);
  await assert.rejects(resumed.commit(draft => { draft.tasks[1].title = 'Blocked until original save is confirmed'; }), /original save/);
  await resumed.retryPending();
  assert.equal(resumed.hasPending, false);
  assert.equal(resumed.state.tasks[0].title, 'Original account’s retained save');
  assert.equal(server.calls.filter(call => call.name === 'dayboard_commit').at(-1).args.p_request_id, originalRequest);
  assert.equal(server.applied, 1);
  assert.equal(resumed.canUndo, true);
  await assert.rejects(service.reopenWorkspace(store), /already been reopened/);
});

test('SDK requests are bound to the original account token before its asynchronous transport runs', async () => {
  const {store, client, server, authChange} = await setup();
  const headers = new Map();
  client.rpc = (name, args) => ({
    setHeader(key, value) { headers.set(key, value); return this; },
    then(resolve, reject) {
      authChange(MEMBER);
      return server.rpc(name, args).then(resolve, reject);
    },
  });
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'Bound to the original account'; }), error => error.code === 'AUTH_CHANGED');
  assert.equal(headers.get('Authorization'), 'Bearer synthetic-owner-token');
  assert.equal(store.hasPending, true);
  assert.equal(store.state.tasks[0].title, 'First shared task');
});

test('an expired session cannot discard the identity of an already unconfirmed save', async () => {
  const {service, store, client, server} = await setup();
  server.handler = async (name, args, respond) => {
    const result = respond();
    return name === 'dayboard_commit' ? {data: null, error: {message: 'Lost acknowledgement'}} : result;
  };
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'A save awaiting confirmation'; }));
  const originalRequest = server.calls.find(call => call.name === 'dayboard_commit').args.p_request_id;
  const originalGetSession = client.auth.getSession;
  client.auth.getSession = async () => ({data: {session: null}, error: null});
  await assert.rejects(store.retryPending(), error => error.accessDenied === true);
  assert.equal(store.hasPending, true);
  client.auth.getSession = originalGetSession;
  server.handler = null;
  const resumed = await service.reopenWorkspace(store);
  await resumed.retryPending();
  assert.equal(server.calls.filter(call => call.name === 'dayboard_commit').at(-1).args.p_request_id, originalRequest);
  assert.equal(server.applied, 1);
});

test('transport deadlines abort the SDK request and preserve the original request for a safe retry', async () => {
  const timers = new Map();
  let nextTimer = 0;
  const {store, client, server} = await setup({serviceOptions: {
    scheduleTimeout: (callback, delay) => { assert.equal(delay, 15000); const id = ++nextTimer; timers.set(id, callback); return id; },
    cancelTimeout: id => timers.delete(id),
  }});
  const before = store.state, signals = [], releases = [];
  let held = 2;
  client.rpc = (name, args) => {
    const response = server.rpc(name, args), hold = held-- > 0;
    return {
      setHeader() { return this; },
      abortSignal(signal) { signals.push(signal); return this; },
      then(resolve, reject) {
        return response.then(result => hold ? new Promise(release => releases.push(() => release(result))) : result).then(resolve, reject);
      },
    };
  };
  const save = store.commit(draft => { draft.tasks[0].title = 'Saved once despite two timeouts'; });
  const rejection = assert.rejects(save, error => error.code === 'TIMEOUT' && error.uncertain);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await rejection;
  assert.equal(signals.every(signal => signal.aborted), true);
  assert.equal(store.state, before);
  assert.equal(store.hasPending, true);
  assert.equal(store.busy, false);
  await store.retryPending();
  const acknowledged = store.state;
  for (const release of releases) release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.state, acknowledged);
  assert.equal(server.applied, 1);
  assert.equal(new Set(server.calls.filter(call => call.name === 'dayboard_commit').map(call => call.args.p_request_id)).size, 1);
  assert.equal(timers.size, 0);
});

test('an original in-flight completion cannot mutate the new store after same-account pending recovery', async () => {
  const {service, store, server, authChange} = await setup();
  let release, held = false;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_commit' && !held) { held = true; return new Promise(resolve => { release = () => resolve(result); }); }
    return result;
  };
  const save = store.commit(draft => { draft.tasks[0].title = 'Original in-flight change'; });
  const rejection = assert.rejects(save, error => error.code === 'AUTH_CHANGED' && error.uncertain);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.busy, true);
  authChange(MEMBER);
  authChange(OWNER);
  const resumed = await service.reopenWorkspace(store);
  assert.equal(resumed.hasPending, true);
  await resumed.retryPending();
  const acknowledged = resumed.state;
  release();
  await rejection;
  assert.equal(resumed.state, acknowledged);
  assert.equal(resumed.hasPending, false);
  assert.equal(resumed.canUndo, true);
  assert.equal(store.busy, false);
  assert.equal(server.applied, 1);
  assert.equal(new Set(server.calls.filter(call => call.name === 'dayboard_commit').map(call => call.args.p_request_id)).size, 1);
});

test('revoked access blocks subsequent operations while keeping the visible copy distinct from an empty board', async () => {
  const {store, server} = await setup();
  const before = store.state;
  server.handler = async () => ({data: null, error: {code: '42501', message: 'Workspace access denied'}});
  await assert.rejects(store.reload(), error => error.accessDenied === true);
  assert.equal(store.state, before);
  assert.equal(store.syncStatus, 'access-lost');
  assert.match(store.loadIssue, /access.*ended/);
  const count = server.calls.length;
  await assert.rejects(store.commit(draft => { draft.tasks[0].title = 'Not allowed'; }));
  assert.equal(server.calls.length, count);
});

test('explicit import makes new copies with valid dependencies and only assigns current members', async () => {
  const {store, server, storage} = await setup();
  const incoming = fixture().data;
  incoming.tasks[0].repeat = 'weekly';
  incoming.tasks[0].repeatNextId = 'b';
  incoming.tasks[0].today = true;
  const backup = JSON.stringify({format: 'dayboard-team-backup', version: 1, board: incoming, assignments: [{taskId: 'a', userId: MEMBER, email: 'member@example.test'}, {taskId: 'b', userId: FORMER, email: 'former@example.test'}]});
  const before = clone(store.state);
  await store.importJSON(backup);
  assert.deepEqual(store.state.tasks.slice(0, 2), before.tasks);
  const [first, second] = store.state.tasks.slice(2);
  assert.notEqual(first.id, 'a');
  assert.equal(first.repeatNextId, second.id);
  assert.equal(first.today, false);
  assert.notEqual(first.area, 'general');
  assert.equal(store.state.areas.find(area => area.id === first.area).name, 'General (copy)');
  assert.equal(store.state.projects.find(project => project.id === first.projectId).area, first.area);
  assert.equal(store.assignees[first.id], MEMBER);
  assert.equal(store.assignees[second.id], null);
  assert.equal(storage.values.get('dfe.dayboard.v1'), 'personal-board-original-bytes');
  const count = server.calls.length;
  await assert.rejects(store.importJSON(backup, {mode: 'replace'}), /Replacing the whole team/);
  assert.equal(server.calls.length, count);
  const exported = JSON.parse(store.exportJSON());
  assert.equal(exported.format, 'dayboard-team-backup');
  assert.equal(exported.assignments.find(item => item.taskId === first.id).email, 'member@example.test');
  assert.equal(readBoardBackup(JSON.stringify(exported)).tasks.length, 4);
});

test('auth storage is separate and sign-in redirects only to this app’s origin and path', async () => {
  const storage = new MemoryStorage();
  let options, signInArgs;
  const service = new TeamService(config, {storage, clientFactory: async (url, key, authOptions) => {
    options = authOptions;
    return {auth: {
      onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}}),
      getSession: async () => ({data: {session: null}, error: null}),
      signInWithOtp: async args => { signInArgs = args; return {error: null}; },
    }};
  }});
  const previous = globalThis.location;
  globalThis.location = {origin: 'https://board.example.test', pathname: '/dayboard/', hash: '#invite=private-token'};
  try {
    await service.requestSignIn(' PERSON@example.test ');
    assert.equal(signInArgs.email, 'person@example.test');
    assert.equal(signInArgs.options.emailRedirectTo, 'https://board.example.test/dayboard/');
    assert.equal(options.auth.flowType, 'pkce');
    assert.match(options.auth.storageKey, /^dfe\.dayboard\.auth\.v1\./);
    assert.equal(options.auth.storage.getItem('dfe.dayboard.v1'), null);
    assert.throws(() => options.auth.storage.setItem('dfe.dayboard.v1', 'bad'), /Invalid auth storage/);
    assert.equal(storage.values.get('dfe.dayboard.v1'), 'personal-board-original-bytes');
  } finally {
    if (previous === undefined) delete globalThis.location; else globalThis.location = previous;
  }
});

test('retrying workspace creation after a lost reply reuses its request ID', async () => {
  const {service, server} = await setup();
  let lost = false;
  server.handler = async (name, args, respond) => {
    const result = respond();
    if (name === 'dayboard_create_workspace' && !lost) { lost = true; return {data: null, error: {message: 'Lost response'}}; }
    return result;
  };
  await assert.rejects(service.createWorkspace('Pilot team'));
  const created = await service.createWorkspace('Pilot team');
  assert.equal(created.workspace.id, WORKSPACE);
  const requests = server.calls.filter(call => call.name === 'dayboard_create_workspace');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].args.p_request_id, requests[1].args.p_request_id);
  assert.equal(server.createRequests.size, 1);
});

test('the real SQL boundary supports two clients, copied recurrence, private pins, delete/Undo, conflicts, and revoked access', async () => {
  const {PGlite} = await import('@electric-sql/pglite');
  const {readFile, readdir} = await import('node:fs/promises');
  const db = new PGlite();
  const stores = [];
  try {
    // Only synthetic Auth identities exist in this isolated, in-memory DB.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role supabase_auth_admin nologin;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, email_confirmed_at timestamptz,
        is_anonymous boolean default false, banned_until timestamptz,
        deleted_at timestamptz, raw_user_meta_data jsonb default '{}'
      );
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
      $$;
    `);
    for (const [id, email] of [[OWNER, 'owner@example.test'], [MEMBER, 'member@example.test']]) {
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [id, email, NOW]);
    }
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, directory), 'utf8'));
    await db.query('insert into dayboard_private.organizer_approvals(email) values($1)', ['owner@example.test']);

    const storage = new MemoryStorage();
    const serviceFor = async (id, email) => {
      const session = {user: {id, email, email_confirmed_at: NOW}};
      const service = new TeamService(config, {storage, storeOptions: {autoSubscribe: false}, client: {
        auth: {
          getSession: async () => ({data: {session}, error: null}),
          onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}}),
        },
        rpc: async (name, args = {}) => {
          assert.match(name, /^dayboard_[a-z_]+$/);
          try {
            const data = await db.transaction(async tx => {
              await tx.exec('set local role authenticated');
              await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub: id, email, role: 'authenticated'})]);
              const values = Object.values(args).map(value => value && typeof value === 'object' ? JSON.stringify(value) : value);
              const result = await tx.query(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) as result`, values);
              return result.rows[0].result;
            });
            return {data, error: null};
          } catch (error) { return {data: null, error: {code: error.code, message: error.message}}; }
        },
      }});
      await service.init();
      return service;
    };
    const owner = await serviceFor(OWNER, 'owner@example.test');
    const member = await serviceFor(MEMBER, 'member@example.test');
    const ownerBoard = await owner.createWorkspace('Two-person synthetic pilot');
    stores.push(ownerBoard);
    assert.equal(ownerBoard.state.tasks.length, 0);
    const invite = await owner.invite(ownerBoard.workspace.id, 'member@example.test');
    assert.equal((await member.previewInvite(invite.token)).alreadyJoined, false);
    const memberBoard = await member.acceptInvite(invite.token);
    stores.push(memberBoard);
    await ownerBoard.reload();

    const incoming = fixture().data;
    incoming.tasks[0].repeat = 'weekly';
    incoming.tasks[0].repeatNextId = 'b';
    await ownerBoard.importJSON(JSON.stringify({format: 'dayboard-team-backup', version: 1, board: incoming, assignments: [{taskId: 'a', userId: MEMBER, email: 'member@example.test'}]}));
    const [first, second] = ownerBoard.state.tasks;
    assert.equal(first.repeatNextId, second.id);
    assert.equal(ownerBoard.assignees[first.id], MEMBER);
    assert.deepEqual(ownerBoard.state.tasks.map(task => task.number), [1, 2]);
    assert.equal(ownerBoard.audit[first.id].createdBy, OWNER);

    await ownerBoard.commit(draft => { draft.tasks.find(task => task.id === first.id).today = true; });
    await memberBoard.reload();
    assert.equal(memberBoard.state.tasks.find(task => task.id === first.id).today, false);
    assert.equal(ownerBoard.state.tasks.find(task => task.id === first.id).today, true);
    await ownerBoard.commit(draft => { draft.tasks = draft.tasks.filter(task => task.id !== first.id); });
    assert.equal(ownerBoard.state.tasks.length, 1);
    await ownerBoard.undo();
    assert.equal(ownerBoard.state.tasks.find(task => task.id === first.id).today, true);
    assert.equal(ownerBoard.state.tasks.find(task => task.id === first.id).number, first.number);

    await memberBoard.reload();
    await memberBoard.commit(draft => { draft.tasks.find(task => task.id === second.id).notes = 'Member’s independent work'; });
    await ownerBoard.commit(draft => { draft.tasks.find(task => task.id === first.id).title = 'Owner’s independent work'; });
    assert.equal(ownerBoard.state.tasks.find(task => task.id === second.id).notes, 'Member’s independent work');
    await assert.rejects(memberBoard.commit(draft => { draft.tasks.find(task => task.id === first.id).title = 'Stale member draft'; }), error => error.conflict === true);
    assert.equal(readBoardBackup(ownerBoard.exportJSON()).tasks.length, 2);
    await owner.removeMember(ownerBoard.workspace.id, MEMBER);
    await assert.rejects(memberBoard.reload(), error => error.accessDenied === true);
    assert.equal(memberBoard.syncStatus, 'access-lost');
    assert.equal(memberBoard.state.tasks.length, 2);
    assert.equal(storage.values.get('dfe.dayboard.v1'), 'personal-board-original-bytes');
    assert.equal(storage.reads.includes('dfe.dayboard.v1'), false);
    assert.equal(storage.writes.includes('dfe.dayboard.v1'), false);
  } finally {
    for (const store of stores) store.dispose();
    await db.close();
  }
});
