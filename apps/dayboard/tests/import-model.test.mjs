import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardStore, makeTask, normalizeWorkspace, transitionTask} from '../public/model.mjs';
import {reviewImport, applyImport, importSourceKey} from '../public/import-model.mjs';

const NOW = '2026-11-25T20:00:00.000Z';
const LATER = '2026-11-26T20:00:00.000Z';
const KEY = 'imports.test';

class Storage {
  constructor(entries = []) { this.data = new Map(entries); this.writes = []; this.failKey = ''; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failKey) throw new Error('QuotaExceededError');
    this.data.set(key, String(value)); this.writes.push(key);
  }
}

function candidate(overrides = {}) {
  return {
    id: 'proposal-1', title: 'Review mobile onboarding', selected: true,
    notes: 'Original source notes', status: 'next', originalStatus: 'Open', priority: 'normal',
    due: '2026-11-27', followUp: '', effort: 30, checklist: [{id: 'source-check', text: 'Check narrow screen', done: false}],
    url: 'https://app.clickup.com/t/abc123', kind: 'task', context: 'Review mobile onboarding', warnings: [],
    source: {provider: 'clickup', scope: 'Workspace A', itemId: 'abc123', url: 'https://app.clickup.com/t/abc123', fingerprint: 'source-v1', original: {Name: 'Review mobile onboarding', Owner: 'Pat', Description: 'Original source notes'}},
    ...overrides,
  };
}

function setup() { const storage = new Storage(); return {storage, store: new BoardStore({storage, key: KEY})}; }

function importCandidates(store, candidates, options = {}) {
  let counts;
  store.commit(state => { counts = applyImport(state, candidates, {area: 'career', now: NOW, ...options}); });
  return counts;
}

function importFirst(store) { return importCandidates(store, reviewImport(store.state, [candidate()])); }

test('the first external import preserves v1/v2 bytes and all prior work, then round-trips source evidence', () => {
  for (const schemaVersion of [1, 2]) {
    const initial = normalizeWorkspace({schemaVersion: 1, tasks: [makeTask({id: 'old', title: 'Keep my work', area: 'dfe', notes: 'Private notes', today: true, repeat: 'weekly'}, NOW)], projects: [], settings: {}, revision: 17, updatedAt: NOW});
    initial.schemaVersion = schemaVersion;
    if (schemaVersion === 1) delete initial.areas;
    const raw = `${JSON.stringify(initial, null, 2)}\n`;
    const storage = new Storage([[KEY, raw]]);
    const store = new BoardStore({storage, key: KEY});
    const before = structuredClone(store.state);
    assert.equal(storage.getItem(KEY), raw);
    assert.deepEqual(storage.writes, []);
    assert.deepEqual(importFirst(store), {created: 1, updated: 0, skipped: 0});
    assert.equal(store.state.schemaVersion, 3);
    assert.equal(storage.getItem(store.beforeImportsKey), raw);
    assert.deepEqual(store.state.tasks[0], before.tasks[0]);
    assert.deepEqual(store.state.areas, before.areas);
    assert.equal(store.state.tasks[1].source.importedAt, NOW);
    assert.equal(store.state.tasks[1].today, false);
    assert.equal(store.state.tasks[1].repeat, 'none');
    assert.equal(store.state.tasks[1].source.original.Owner, 'Pat');
    const restored = setup().store;
    restored.importJSON(store.exportJSON(), {mode: 'replace'});
    assert.deepEqual(restored.state.tasks, store.state.tasks);
    store.undo();
    assert.deepEqual(store.state.tasks, before.tasks);
    assert.equal(store.state.schemaVersion, 2);
    assert.equal(storage.getItem(store.beforeImportsKey), raw);
  }
});

test('reimport identity survives a title edit and identical source data never overwrites local changes', () => {
  const {store} = setup(); importFirst(store);
  store.commit(state => { state.tasks[0].title = 'My preferred title'; state.tasks[0].notes = 'My own explanation'; state.tasks[0].today = true; });
  const preview = reviewImport(store.state, [candidate()]);
  assert.equal(preview[0].matchType, 'unchanged');
  assert.equal(preview[0].existingId, store.state.tasks[0].id);
  assert.deepEqual(preview[0].conflictFields.sort(), ['notes', 'title']);
  assert.equal(preview[0].selected, false);
  assert.equal(preview[0].action, 'skip');
  assert.deepEqual(importCandidates(store, preview), {created: 0, updated: 0, skipped: 1});
  assert.equal(store.state.tasks.length, 1);
  assert.equal(store.state.tasks[0].title, 'My preferred title');
  assert.equal(store.state.tasks[0].notes, 'My own explanation');
  assert.equal(store.state.tasks[0].today, true);
});

test('explicit source updates preserve planning choices and personal notes while exposing checklist conflicts', () => {
  const {store} = setup(); importFirst(store);
  const identity = {id: store.state.tasks[0].id, number: store.state.tasks[0].number, order: store.state.tasks[0].order};
  store.commit(state => {
    state.projects.push({id: 'project', name: 'Personal project', area: 'life', url: '', description: '', archived: false, starter: false});
    Object.assign(state.tasks[0], {area: 'life', projectId: 'project', today: true, repeat: 'weekly', notes: 'My note must survive', updatedAt: LATER});
    state.tasks[0].checklist[0].done = true;
  });
  const updated = candidate({title: 'Revised source title', notes: 'Revised source notes', due: '2026-12-01', source: {...candidate().source, fingerprint: 'source-v2', original: {Description: 'Revised source notes'}}});
  const preview = reviewImport(store.state, [updated]);
  assert.equal(preview[0].matchType, 'conflict');
  assert.deepEqual(preview[0].conflictFields.sort(), ['checklist', 'notes']);
  preview[0].action = 'update'; preview[0].selected = true;
  assert.deepEqual(importCandidates(store, preview, {now: LATER}), {created: 0, updated: 1, skipped: 0});
  const saved = store.state.tasks[0];
  assert.deepEqual({id: saved.id, number: saved.number, order: saved.order}, identity);
  assert.equal(saved.title, 'Revised source title');
  assert.equal(saved.notes, 'My note must survive');
  assert.equal(saved.source.original.Description, 'Revised source notes');
  assert.equal(saved.area, 'life'); assert.equal(saved.projectId, 'project');
  assert.equal(saved.today, true); assert.equal(saved.repeat, 'weekly');
  assert.equal(saved.checklist[0].done, false, 'an explicitly approved checklist replacement applies');
  const third = reviewImport(store.state, [candidate({source: {...candidate().source, fingerprint: 'source-v3'}})]);
  assert.ok(third[0].conflictFields.includes('notes'), 'preserved local notes do not become source-owned after an update');
});

test('title-only matches remain reviewable and distinct source namespaces do not collapse', () => {
  const {store} = setup(); importFirst(store);
  const different = candidate({source: {...candidate().source, itemId: 'xyz789', url: ''}});
  const preview = reviewImport(store.state, [different]);
  assert.equal(preview[0].matchType, 'possible'); assert.equal(preview[0].selected, false);
  preview[0].action = 'update'; preview[0].selected = true;
  assert.throws(() => importCandidates(store, preview), /unique source match/);
  preview[0].action = 'create';
  importCandidates(store, preview);
  assert.equal(store.state.tasks.length, 2);
  const otherWorkspace = candidate({source: {...candidate().source, scope: 'Workspace B'}});
  const otherPreview = reviewImport(store.state, [otherWorkspace]);
  assert.equal(otherPreview[0].matchType, 'possible');
  otherPreview[0].action = 'create'; otherPreview[0].selected = true;
  importCandidates(store, otherPreview);
  assert.equal(store.state.tasks.length, 3);
});

test('conversation links do not merge different extracted actions; repeats within a structured batch are counted once', () => {
  assert.equal(importSourceKey({provider: 'slack', scope: 'Channel', itemId: '', url: 'https://example.slack.com/archives/C/p123'}), '');
  assert.notEqual(importSourceKey({provider: 'clickup', scope: 'Work', itemId: '', url: 'https://app.clickup.com/t/abc'}), '');
  const {store} = setup();
  const first = candidate(), second = candidate({id: 'proposal-2'});
  const preview = reviewImport(store.state, [first, second]);
  assert.equal(preview[1].duplicateOf, first.id); assert.equal(preview[1].selected, false);
  preview[1].selected = true; preview[1].action = 'create';
  assert.deepEqual(importCandidates(store, preview), {created: 1, updated: 0, skipped: 1});
  const source = {provider: 'teams', scope: 'Planning', itemId: '', url: 'https://teams.microsoft.com/l/message/123', fingerprint: 'text', original: {Text: 'Two possible actions'}};
  const text = reviewImport(store.state, [candidate({id: 'text-1', title: 'One action', source}), candidate({id: 'text-2', title: 'Another action', source})]);
  assert.deepEqual(importCandidates(store, text), {created: 2, updated: 0, skipped: 0});
});

test('a stale update preview and a malformed later row cannot partially save a batch', () => {
  const {store, storage} = setup(); importFirst(store);
  const preview = reviewImport(store.state, [candidate({source: {...candidate().source, fingerprint: 'changed'}})]);
  preview[0].action = 'update'; preview[0].selected = true;
  store.commit(state => { state.tasks[0].priority = 'high'; });
  const before = store.state, raw = storage.getItem(KEY), writes = storage.writes.length;
  assert.throws(() => importCandidates(store, preview), /changed after the preview/);
  const next = reviewImport(store.state, [candidate({id: 'new', title: 'New task', source: {...candidate().source, itemId: 'new'}}), candidate({id: 'bad', title: 'Invalid date task', due: '2026-02-30', source: {...candidate().source, itemId: 'bad'}})]);
  assert.throws(() => importCandidates(store, next), /real calendar date/);
  assert.equal(store.state, before); assert.equal(storage.getItem(KEY), raw); assert.equal(storage.writes.length, writes);
});

test('migration and storage failures leave the original board untouched and retry remains possible', () => {
  for (const suffix of ['.before-imports-v3', '.previous', '']) {
    const {store, storage} = setup();
    const before = store.state, raw = storage.getItem(KEY);
    storage.failKey = `${KEY}${suffix}`;
    const preview = reviewImport(store.state, [candidate()]);
    assert.throws(() => importCandidates(store, preview), /could not be saved/);
    assert.equal(store.state, before); assert.equal(storage.getItem(KEY), raw);
    assert.equal(store.canUndo, false);
    storage.failKey = '';
    importCandidates(store, preview);
    assert.equal(store.state.tasks.length, 1);
  }
});

test('unsupported source data is rejected and v3 sources merge into older backups without losing evidence', () => {
  const {store} = setup(); importFirst(store);
  const valid = JSON.parse(store.exportJSON());
  for (const damage of [
    data => { data.tasks[0].source.url = 'javascript:alert(1)'; },
    data => { data.tasks[0].source.original.Nested = {executable: 'no'}; },
    data => { data.tasks[0].source.original.Huge = 'a'.repeat(50001); },
    data => { data.tasks[0].source.importedAt = 'yesterday'; },
    data => { data.tasks[0].source.baseline.other = 'unsupported'; },
    data => { data.tasks[0].source.original = JSON.parse('{"__proto__":"no"}'); },
    data => { data.schemaVersion = 2; },
  ]) {
    const invalid = structuredClone(valid); damage(invalid);
    assert.throws(() => store.importJSON(JSON.stringify(invalid), {mode: 'replace'}));
  }
  const fresh = setup().store;
  fresh.importJSON(JSON.stringify(valid));
  assert.equal(fresh.state.schemaVersion, 3);
  assert.deepEqual(fresh.state.tasks[0].source, valid.tasks[0].source);
  assert.equal({}.polluted, undefined);
});

test('source completion does not generate recurrences and locally generated repeats detach the external identity', () => {
  const {store} = setup(); importFirst(store);
  store.commit(state => { state.tasks[0].repeat = 'weekly'; state.tasks[0].today = true; });
  const done = reviewImport(store.state, [candidate({status: 'done', source: {...candidate().source, fingerprint: 'done'}})]);
  done[0].action = 'update'; done[0].selected = true;
  importCandidates(store, done);
  assert.equal(store.state.tasks.length, 1);
  assert.equal(store.state.tasks[0].today, false);
  assert.equal(store.state.tasks[0].completedAt, null, 'the import time is not invented as the original completion date');
  store.commit(state => {
    transitionTask(state, state.tasks[0].id, 'next', {now: NOW});
    transitionTask(state, state.tasks[0].id, 'done', {now: LATER});
  });
  assert.equal(store.state.tasks.length, 2);
  assert.ok(store.state.tasks[0].source);
  assert.equal(store.state.tasks[1].source, undefined);
});

test('status mapping supports an explicit row override and leaves reference material unselected', () => {
  const {store} = setup();
  const preview = reviewImport(store.state, [candidate({statusOverride: 'waiting'}), candidate({id: 'reference', title: 'Meeting background', kind: 'reference', source: {...candidate().source, itemId: 'ref'}})]);
  assert.equal(preview[1].selected, false); assert.equal(preview[1].action, 'skip');
  importCandidates(store, preview, {statusMap: {Open: 'doing'}});
  assert.equal(store.state.tasks[0].status, 'waiting');
  assert.equal(store.state.tasks.length, 1);
});
