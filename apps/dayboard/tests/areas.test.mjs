import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoardStore, createDefaultAreas, makeArea, addArea, renameArea, makeTask,
  normalizeWorkspace, transitionTask, parseCapture, areaCaptureTag, toCSV,
} from '../public/model.mjs';
import {createSeedWorkspace} from '../public/seed.mjs';

const NOW = '2026-11-08T12:00:00.000Z';
const KEY = 'dfe.dayboard.v1';

class MapStorage {
  constructor(entries = []) { this.values = new Map(entries); this.writes = []; this.failKey = null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failKey) throw new Error('QuotaExceededError');
    this.values.set(key, String(value));
    this.writes.push(key);
  }
}

function project(id, area, overrides = {}) {
  return {id, name: 'Saved project', area, url: '', description: 'Keep this description', starter: false, archived: false, ...overrides};
}

function legacyWorkspace() {
  return {
    schemaVersion: 1, revision: 47, updatedAt: NOW,
    tasks: [
      makeTask({id: 'career-task', number: 8, title: 'Review a role', area: 'career', status: 'waiting', followUp: '2026-11-12', today: true}, NOW),
      makeTask({id: 'life-task', number: 19, title: 'Finished errand', area: 'life', status: 'done', completedAt: NOW, archived: true}, NOW),
      makeTask({id: 'dfe-task', number: 32, title: 'Tune the simulator', area: 'dfe', projectId: 'dfe-project', status: 'next', repeat: 'weekly', due: '2026-11-12', notes: 'Two lines\nwith a "quote" and é', checklist: [{id: 'step', text: 'Keep my settings', done: true}]}, NOW),
    ],
    projects: [project('dfe-project', 'dfe'), project('archived-project', 'life', {archived: true})],
    settings: {theme: 'light', density: 'compact', welcomeDismissed: true, lastBackupAt: NOW, lastReviewAt: NOW},
  };
}

function openLegacy() {
  const legacy = legacyWorkspace();
  const raw = `${JSON.stringify(legacy, null, 2)}\n`;
  const storage = new MapStorage([[KEY, raw]]);
  const store = new BoardStore({storage, initialState: createSeedWorkspace()});
  return {legacy, raw, storage, store};
}

test('fresh boards use Career, Life, and Custom at the existing browser storage key', () => {
  for (const initialState of [undefined, createSeedWorkspace()]) {
    const storage = new MapStorage();
    const store = new BoardStore({storage, initialState});
    assert.equal(store.key, KEY);
    assert.equal(store.state.schemaVersion, 2);
    assert.deepEqual(store.state.areas.map(area => [area.id, area.name]), [
      ['career', 'Career'], ['life', 'Life'], ['custom', 'Custom'],
    ]);
    assert.deepEqual(store.state.tasks, []);
    assert.deepEqual(store.state.projects, []);
    assert.deepEqual(JSON.parse(storage.getItem(KEY)), store.state);
    assert.deepEqual(storage.writes, [KEY]);
    assert.equal(storage.getItem(`${KEY}.before-areas-v2`), null);
  }
  const first = createDefaultAreas();
  first[0].name = 'Changed only here';
  assert.equal(createDefaultAreas()[0].name, 'Career', 'default catalogs do not share mutable entries');
});

test('opening a saved v1 board adds Custom in memory without changing a byte of saved work', () => {
  const {legacy, raw, storage, store} = openLegacy();
  assert.equal(store.loadIssue, null);
  assert.equal(store.state.schemaVersion, 2);
  assert.deepEqual(store.state.areas.map(area => area.id), ['career', 'life', 'dfe', 'custom']);
  assert.deepEqual(store.state.tasks, legacy.tasks);
  assert.deepEqual(store.state.projects, legacy.projects);
  assert.deepEqual(store.state.settings, legacy.settings);
  assert.equal(store.state.revision, legacy.revision);
  assert.equal(store.state.updatedAt, legacy.updatedAt);
  const migrated = store.exportJSON();
  store.reload();
  assert.equal(store.exportJSON(), migrated, 'reloading does not add another Custom area');
  assert.deepEqual(normalizeWorkspace(JSON.parse(migrated)), store.state);
  assert.equal(storage.getItem(KEY), raw);
  assert.deepEqual(storage.writes, [], 'opening, exporting, and reloading are read-only for an existing board');
});

test('the first edit preserves the exact v1 original once and stale tabs cannot overwrite it', () => {
  const {legacy, raw, storage, store} = openLegacy();
  const stale = new BoardStore({storage, initialState: createSeedWorkspace()});
  const staleState = stale.state;
  store.commit(draft => {
    renameArea(draft, 'custom', 'Home projects');
    renameArea(draft, 'dfe', 'DailyFlyer');
  });
  assert.equal(store.legacyKey, `${KEY}.before-areas-v2`);
  assert.equal(storage.getItem(store.legacyKey), raw);
  assert.equal(JSON.parse(storage.getItem(KEY)).schemaVersion, 2);
  assert.equal(store.state.revision, legacy.revision + 1);
  assert.deepEqual(store.state.tasks, legacy.tasks);
  assert.deepEqual(store.state.projects, legacy.projects);
  assert.throws(() => stale.commit(draft => { draft.tasks[0].title = 'Stale overwrite'; }), /another tab/);
  assert.equal(stale.state, staleState);

  store.commit(draft => renameArea(draft, 'career', 'Work'));
  store.undo();
  stale.reload();
  assert.deepEqual(stale.state.areas.map(area => area.name), ['Career', 'Life', 'DailyFlyer', 'Home projects']);
  stale.commit(draft => { draft.tasks[0].notes = 'Saved after reloading'; });
  assert.equal(storage.getItem(store.legacyKey), raw);
  assert.equal(storage.writes.filter(key => key === store.legacyKey).length, 1);
  assert.deepEqual(stale.state.tasks.map(task => task.area), ['career', 'life', 'dfe']);
});

test('failure at any migration write leaves the saved v1 board and in-memory state intact', () => {
  for (const failedKey of [`${KEY}.before-areas-v2`, `${KEY}.previous`, KEY]) {
    const {raw, storage, store} = openLegacy();
    const originalState = store.state;
    storage.failKey = failedKey;
    assert.throws(() => store.commit(draft => renameArea(draft, 'custom', 'Home')), /could not be saved/, failedKey);
    assert.equal(storage.getItem(KEY), raw, failedKey);
    assert.equal(store.state, originalState, failedKey);
    assert.equal(store.canUndo, false, failedKey);
    storage.failKey = null;
    store.commit(draft => renameArea(draft, 'custom', 'Home'));
    assert.equal(storage.getItem(store.legacyKey), raw, failedKey);
    assert.equal(store.state.areas.find(area => area.id === 'custom').name, 'Home');
    assert.deepEqual(store.state.tasks, originalState.tasks);
  }
});

test('renaming and adding areas preserve existing assignments and custom recurring tasks through backup imports', () => {
  const {legacy, storage, store} = openLegacy();
  let learningId;
  store.commit(draft => {
    renameArea(draft, 'career', 'Work');
    renameArea(draft, 'dfe', 'DailyFlyer');
    renameArea(draft, 'custom', 'Home');
    learningId = addArea(draft, {name: '  Learning & practice  ', color: 'teal'}).id;
    for (let index = 0; index < 40; index++) addArea(draft, {id: `extra-${index}`, name: `Additional area ${index + 1}`});
    draft.projects.push(project('learning-project', learningId));
    draft.tasks.push(makeTask({id: 'learning-task', title: 'Practice each week', area: learningId, projectId: 'learning-project', repeat: 'weekly', due: '2026-11-12'}, NOW));
  });
  assert.deepEqual(store.state.tasks.slice(0, 3), legacy.tasks);
  assert.deepEqual(store.state.projects.slice(0, 2), legacy.projects);
  assert.equal(store.state.areas.length, 45, 'additional areas are not limited to a fixed menu');
  assert.equal(store.state.areas.find(area => area.id === learningId).name, 'Learning & practice');
  store.commit(draft => {
    renameArea(draft, learningId, 'Study');
    transitionTask(draft, 'learning-task', 'done', {today: '2026-11-08', now: NOW});
  });
  const parent = store.state.tasks.find(task => task.id === 'learning-task');
  const successor = store.state.tasks.find(task => task.id === parent.repeatNextId);
  assert.equal(successor.area, learningId);
  assert.equal(successor.projectId, 'learning-project');
  assert.equal(successor.repeat, 'weekly');
  const reopened = new BoardStore({storage});
  assert.deepEqual(reopened.state, store.state);
  const imported = new BoardStore({storage: new MapStorage(), initialState: createSeedWorkspace()});
  imported.importJSON(reopened.exportJSON(), {mode: 'replace'});
  for (const key of ['areas', 'tasks', 'projects', 'settings']) assert.deepEqual(imported.state[key], store.state[key], key);
});

test('invalid catalogs and missing area references cannot overwrite a valid board', () => {
  const storage = new MapStorage();
  const store = new BoardStore({storage, initialState: createSeedWorkspace()});
  const stateBefore = store.state;
  const rawBefore = storage.getItem(KEY);
  const writesBefore = storage.writes.length;
  const corruptions = [
    data => { delete data.areas; },
    data => { data.areas = []; },
    data => { delete data.areas[0].id; },
    data => { data.areas[0].id = 'all'; },
    data => { data.areas[0].color = 'javascript:red'; },
    data => { data.areas[0].name = ' '; },
    data => { data.areas[0].name = 'A'.repeat(81); },
    data => { data.areas[1].id = 'career'; },
    data => { data.areas[1].name = ' cArEeR '; },
    data => { data.tasks.push(makeTask({id: 'missing-area', title: 'Keep my assignment', area: 'missing'}, NOW)); },
    data => { data.projects.push(project('missing-area-project', 'missing')); },
  ];
  for (const corrupt of corruptions) {
    const data = structuredClone(stateBefore);
    corrupt(data);
    assert.throws(() => store.importJSON(JSON.stringify(data), {mode: 'replace'}), TypeError);
  }
  for (const edit of [
    draft => addArea(draft, {name: ' career '}),
    draft => addArea(draft, {id: 'custom', name: 'Another'}),
    draft => renameArea(draft, 'custom', 'LIFE'),
    draft => renameArea(draft, 'custom', ''),
    draft => renameArea(draft, 'missing', 'Home'),
  ]) assert.throws(() => store.commit(edit), TypeError);
  assert.equal(store.state, stateBefore);
  assert.equal(storage.getItem(KEY), rawBefore);
  assert.equal(storage.writes.length, writesBefore);
});

test('merging area catalogs preserves current identities and keeps distinct same-name imported areas separate', () => {
  const {store} = openLegacy();
  store.commit(draft => {
    renameArea(draft, 'career', 'Work');
    renameArea(draft, 'dfe', 'DailyFlyer');
    renameArea(draft, 'custom', 'Home');
    addArea(draft, {id: 'my-studies', name: 'Study', color: 'teal'});
    addArea(draft, {id: 'prior-import', name: 'Study (imported)', color: 'slate'});
  });
  const incoming = createSeedWorkspace();
  incoming.areas.find(area => area.id === 'career').name = 'Old work label';
  incoming.areas.push(makeArea({id: 'their-studies', name: 'Study', color: 'rose'}));
  incoming.projects.push(project('their-project', 'their-studies'));
  incoming.tasks.push(makeTask({id: 'their-task', title: 'Imported study', area: 'their-studies', projectId: 'their-project'}, NOW));
  store.importJSON(JSON.stringify(incoming), {mode: 'merge'});
  assert.equal(store.state.areas.find(area => area.id === 'career').name, 'Work');
  assert.equal(store.state.areas.find(area => area.id === 'custom').name, 'Home');
  assert.equal(store.state.areas.find(area => area.id === 'their-studies').name, 'Study (imported 2)');
  assert.equal(store.state.areas.find(area => area.id === 'their-studies').color, 'rose');
  assert.equal(store.state.tasks.find(task => task.id === 'their-task').area, 'their-studies');
  assert.equal(store.state.projects.find(project => project.id === 'their-project').area, 'their-studies');
  const once = structuredClone(store.state);
  store.importJSON(JSON.stringify(incoming), {mode: 'merge'});
  assert.deepEqual(store.state.areas, once.areas);
  assert.deepEqual(store.state.tasks, once.tasks);
  store.importJSON(JSON.stringify(legacyWorkspace()), {mode: 'merge'});
  assert.deepEqual(store.state.areas, once.areas, 'an old backup does not reset renamed or additional areas');
  assert.deepEqual(store.state.tasks, once.tasks);
});

test('old backup replacement upgrades its original assignments and can be undone with the current catalog', () => {
  const storage = new MapStorage();
  const store = new BoardStore({storage, initialState: createSeedWorkspace()});
  store.commit(draft => {
    renameArea(draft, 'custom', 'Home');
    addArea(draft, {id: 'study', name: 'Study'});
    draft.tasks.push(makeTask({id: 'current-task', title: 'Current work', area: 'study'}, NOW));
  });
  const before = structuredClone(store.state);
  const legacy = legacyWorkspace();
  store.importJSON(JSON.stringify(legacy), {mode: 'replace'});
  assert.deepEqual(store.state.areas.map(area => area.id), ['career', 'life', 'dfe', 'custom']);
  assert.deepEqual(store.state.tasks, legacy.tasks);
  assert.deepEqual(store.state.projects, legacy.projects);
  store.undo();
  assert.deepEqual(store.state.areas, before.areas);
  assert.deepEqual(store.state.tasks, before.tasks);
});

test('capture recognizes renamed areas, retains stable ID tags, and leaves ambiguous or unknown tags literal', () => {
  const state = normalizeWorkspace(legacyWorkspace());
  renameArea(state, 'career', 'Professional work');
  renameArea(state, 'dfe', 'DailyFlyer');
  renameArea(state, 'custom', 'Home projects');
  const study = addArea(state, {id: 'study', name: 'Études & practice'});
  const first = addArea(state, {id: 'first-study', name: 'Side project'});
  const second = addArea(state, {id: 'second-study', name: 'Side-project'});
  const colliding = addArea(state, {id: 'career-lookalike', name: 'Career'});
  assert.equal(areaCaptureTag(study, state.areas), 'etudes-practice');
  assert.equal(areaCaptureTag(first, state.areas), 'first-study');
  assert.equal(areaCaptureTag(second, state.areas), 'second-study');
  assert.equal(areaCaptureTag(colliding, state.areas), 'career-lookalike');
  assert.deepEqual(parseCapture([
    'Review #professional-work', 'Legacy #career', 'Build #dailyflyer', 'Old tag #dfe',
    'Plan #home-projects', 'Read #ETUDES-PRACTICE', 'Choose #first-study',
    'Keep #side-project', 'Keep #unknown', 'Original #career', 'Other #career-lookalike',
  ].join('\n'), 'life', state.areas), [
    {title: 'Review', area: 'career'}, {title: 'Legacy', area: 'career'},
    {title: 'Build', area: 'dfe'}, {title: 'Old tag', area: 'dfe'},
    {title: 'Plan', area: 'custom'}, {title: 'Read', area: 'study'},
    {title: 'Choose', area: 'first-study'}, {title: 'Keep #side-project', area: 'life'},
    {title: 'Keep #unknown', area: 'life'}, {title: 'Original', area: 'career'},
    {title: 'Other', area: 'career-lookalike'},
  ]);
  assert.deepEqual(parseCapture('Keep #dfe', 'career', createDefaultAreas()), [{title: 'Keep #dfe', area: 'career'}]);
});

test('CSV exports readable custom area labels with formula and quote escaping', () => {
  const areas = [makeArea({id: 'formula', name: '=SUM(1,2)'}), makeArea({id: 'quoted', name: 'Home, "projects"'})];
  const tasks = areas.map((area, index) => makeTask({id: `task-${index}`, title: 'Saved work', area: area.id, number: index + 1}, NOW));
  const csv = toCSV(tasks, areas);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"Home, ""projects"""'));
  assert.ok(toCSV(tasks).includes('"formula"'), 'callers without a catalog retain stable ID exports');
});
