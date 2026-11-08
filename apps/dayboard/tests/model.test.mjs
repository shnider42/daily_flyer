import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS, STATUSES, BoardStore, makeTask, normalizeWorkspace,
  parseCapture, dueBucket, nextRepeatDate, safeUrl, toCSV, transitionTask,
} from '../public/model.mjs';
import {createSeedWorkspace} from '../public/seed.mjs';

const NOW = '2026-11-08T12:00:00.000Z';
const LATER = '2026-11-09T12:00:00.000Z';
const KEY = 'test.dayboard';

class MapStorage {
  constructor() { this.values = new Map(); this.writes = 0; this.failWhen = null; this.failRead = false; }
  getItem(key) {
    if (this.failRead) throw new Error('Storage blocked');
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    if (this.failWhen?.(key)) throw new Error('QuotaExceededError');
    this.values.set(key, String(value));
    this.writes++;
  }
  removeItem(key) { this.values.delete(key); }
}
function task(title = 'Review one role', overrides = {}) {
  return makeTask({id: 'task-1', title, number: 1, ...overrides}, NOW);
}
function project(overrides = {}) {
  return {id: 'project-1', name: 'Portfolio', area: 'career', url: '', description: '', starter: false, archived: false, ...overrides};
}
function workspace(tasks = [task()], projects = []) {
  return {schemaVersion: 1, revision: 0, updatedAt: NOW, tasks, projects, settings: {theme: 'dark', density: 'comfortable', welcomeDismissed: false, lastBackupAt: null, lastReviewAt: null}};
}
function setup(initialState = workspace()) {
  const storage = new MapStorage();
  const store = new BoardStore({storage, initialState, key: KEY});
  return {storage, store};
}

// These test actual data-loss boundaries and untrusted import/export behavior.
test('public app starts empty without publishing personal records', () => {
  const seed = normalizeWorkspace(createSeedWorkspace());
  assert.equal(seed.tasks.length, 0);
  assert.equal(seed.projects.length, 0);
  assert.equal(seed.tasks.filter(t => t.status === 'next').length, 0);
  assert.ok(seed.tasks.every(t => ['inbox', 'next'].includes(t.status)));
  assert.ok(seed.tasks.every(t => !t.due && !t.followUp && !t.today && t.starter));
  assert.deepEqual(AREAS, ['career', 'life', 'dfe']);
  assert.ok(STATUSES.includes('someday'));
});

test('new tasks have safe defaults; workspace allocates unique numbers', () => {
  const first = makeTask({title: '  A useful next action  '}, NOW);
  const second = makeTask({title: 'Something else'}, NOW);
  assert.notEqual(first.id, second.id);
  assert.equal(first.title, 'A useful next action');
  assert.equal(first.status, 'inbox');
  assert.equal(first.due, '');
  assert.equal(first.number, 0);
  assert.equal(first.createdAt, NOW);
  assert.equal(first.today, false);
  const state = normalizeWorkspace(workspace([task('Already here', {number: 12}), first, second]));
  assert.deepEqual(state.tasks.map(t => t.number), [12, 13, 14]);
  assert.equal(first.number, 0, 'normalization does not mutate caller objects');
});

test('invalid fields and impossible dates are rejected rather than coerced', () => {
  for (const fields of [
    {title: ''}, {title: '  '}, {title: 'Task', status: 'to-do'},
    {title: 'Task', area: 'work'}, {title: 'Task', effort: '15'},
    {title: 'Task', today: 'false'}, {title: 'Task', due: '2026-02-30'},
    {title: 'Task', followUp: 'tomorrow'}, {title: 'Task', createdAt: '2026-02-30T12:00:00Z'},
    {title: 'Task', checklist: [{id: 'check', text: 'One', done: true}, {id: 'check', text: 'Two', done: false}]},
  ]) assert.throws(() => makeTask(fields, NOW), TypeError);
  assert.throws(() => normalizeWorkspace(workspace([task(), task('Duplicate ID', {number: 2})])), /duplicated/);
  assert.throws(() => normalizeWorkspace(workspace([task(), task('Duplicate number', {id: 'task-2'})])), /number is duplicated/);
  assert.throws(() => normalizeWorkspace(workspace([task('Missing project', {projectId: 'absent'})])), /missing project/);
});

test('capture preserves literal dates and supports multiline lists and area tags', () => {
  const capture = parseCapture(' - [ ] Call dentist #life\n\n2. Review CV #career\n• Tune controls #dfe\n[ x ] Write tomorrow\n#life\nKeep #lifelong learning', 'dfe');
  assert.deepEqual(capture, [
    {title: 'Call dentist', area: 'life'},
    {title: 'Review CV', area: 'career'},
    {title: 'Tune controls', area: 'dfe'},
    {title: 'Write tomorrow', area: 'dfe'},
    {title: 'Keep #lifelong learning', area: 'dfe'},
  ]);
  assert.deepEqual(parseCapture('[x] Write tomorrow\r\n+ [ ] Plan', 'life'), [{title: 'Write tomorrow', area: 'life'}, {title: 'Plan', area: 'life'}]);
});

test('commit persists, reloads, and exports a lossless JSON roundtrip', () => {
  const {store, storage} = setup();
  const original = store.state;
  assert.equal(storage.writes, 1, 'a new board is persisted on first open');
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), original);
  store.commit(draft => {
    draft.tasks[0].notes = 'Two lines\nwith a "quote" and é';
    draft.tasks.push(makeTask({title: 'New next action', area: 'life'}, NOW));
  });
  assert.equal(store.state.revision, 1);
  assert.equal(original.tasks.length, 1);
  assert.equal(store.state.tasks[1].number, 2);
  assert.ok(Object.isFrozen(store.state.tasks[0]));
  const reloaded = new BoardStore({storage, initialState: workspace([]), key: KEY});
  assert.deepEqual(reloaded.state, store.state);
  assert.equal(reloaded.loadIssue, null);
  assert.deepEqual(normalizeWorkspace(JSON.parse(store.exportJSON())), store.state);
  assert.equal(JSON.parse(storage.getItem(`${KEY}.previous`)).revision, 0);
  assert.throws(() => { store.state.tasks[0].title = 'Accidental direct mutation'; }, TypeError);
});

test('validation or mutator errors leave memory and storage untouched', () => {
  const {store, storage} = setup();
  store.commit(draft => { draft.tasks[0].status = 'next'; });
  const before = store.exportJSON();
  const rawBefore = storage.getItem(KEY);
  const writesBefore = storage.writes;
  assert.throws(() => store.commit(draft => { draft.tasks[0].status = 'unknown'; }), /Status/);
  assert.throws(() => store.commit(draft => { draft.tasks[0].title = 'Draft only'; throw new Error('Stop'); }), /Stop/);
  assert.equal(store.exportJSON(), before);
  assert.equal(storage.getItem(KEY), rawBefore);
  assert.equal(storage.writes, writesBefore);
});

test('invalid imports are atomic, including unsupported schemas and broken references', () => {
  const {store, storage} = setup();
  store.commit(draft => { draft.tasks[0].status = 'next'; });
  const before = store.exportJSON();
  const rawBefore = storage.getItem(KEY);
  const writesBefore = storage.writes;
  const invalid = [
    'not json',
    JSON.stringify({...workspace(), schemaVersion: 2}),
    JSON.stringify(workspace([task('Broken reference', {projectId: 'absent'})])),
    JSON.stringify(workspace([task('Bad link', {url: 'https://example.com'})])).replace('https://example.com/', 'javascript:alert(1)'),
    JSON.stringify({...workspace(), settings: {theme: 'dark', welcomeDismissed: 'yes'}}),
    '{"schemaVersion":1,"tasks":[],"projects":[],"__proto__":{"polluted":true}}',
  ];
  for (const text of invalid) assert.throws(() => store.importJSON(text, {mode: 'replace'}));
  assert.equal(store.exportJSON(), before);
  assert.equal(storage.getItem(KEY), rawBefore);
  assert.equal(storage.writes, writesBefore);
  assert.equal({}.polluted, undefined);
});

test('quota failure on primary write keeps state, saved data, revision, and undo history', () => {
  const {store, storage} = setup();
  store.commit(draft => { draft.tasks[0].status = 'next'; });
  const originalState = store.state;
  const rawBefore = storage.getItem(KEY);
  storage.failWhen = key => key === KEY;
  assert.throws(() => store.commit(draft => { draft.tasks[0].title = 'Unsaved change'; }), /could not be saved/);
  assert.equal(store.state, originalState);
  assert.equal(storage.getItem(KEY), rawBefore);
  assert.equal(store.state.revision, 1);
  assert.equal(store.canUndo, true);
  storage.failWhen = null;
  store.undo();
  assert.equal(store.state.tasks[0].status, 'inbox');
  assert.equal(store.state.revision, 2);
});

test('quota failure while saving backup also leaves the current record intact', () => {
  const {store, storage} = setup();
  store.commit(() => {});
  const rawBefore = storage.getItem(KEY);
  const stateBefore = store.state;
  storage.failWhen = key => key.endsWith('.previous');
  assert.throws(() => store.commit(draft => { draft.tasks = []; }), /could not be saved/);
  assert.equal(store.state, stateBefore);
  assert.equal(storage.getItem(KEY), rawBefore);
});

test('replace imports are undoable and do not adopt an external revision counter', () => {
  const {store, storage} = setup();
  const imported = workspace([task('Imported life task', {id: 'imported', area: 'life'})]);
  imported.revision = 9876;
  store.importJSON(JSON.stringify(imported), {mode: 'replace'});
  assert.equal(store.state.tasks[0].id, 'imported');
  assert.equal(store.state.revision, 1);
  const reloaded = new BoardStore({storage, initialState: workspace([]), key: KEY});
  assert.equal(reloaded.canUndo, true);
  reloaded.undo();
  assert.equal(reloaded.state.tasks[0].id, 'task-1');
  assert.equal(reloaded.state.revision, 2);
});

test('merge keeps both boards, valid references, stable IDs, and unique task numbers', () => {
  const {store} = setup(workspace([task('Existing task', {projectId: 'project-1'})], [project()]));
  const imported = workspace([
    task('Newer version of existing task', {projectId: 'project-2', number: 7, updatedAt: LATER}),
    task('New imported task', {id: 'imported-task', number: 1, projectId: 'project-2'}),
    task('Independent imported task', {id: 'independent', number: 3}),
  ], [project({id: 'project-2', name: 'New project', area: 'dfe'})]);
  store.importJSON(JSON.stringify(imported), {mode: 'merge'});
  assert.equal(store.state.tasks.length, 3);
  assert.equal(store.state.projects.length, 2);
  assert.equal(store.state.tasks[0].title, 'Newer version of existing task');
  assert.equal(store.state.tasks[0].number, 1, 'a newer matching task keeps its current stable number');
  assert.equal(store.state.tasks[0].projectId, 'project-2');
  assert.ok(store.state.tasks.some(t => t.id === 'imported-task'));
  assert.equal(new Set(store.state.tasks.map(t => t.number)).size, 3);
  assert.ok(store.state.tasks.every(t => !t.projectId || store.state.projects.some(p => p.id === t.projectId)));
  const count = store.state.tasks.length;
  store.importJSON(JSON.stringify(imported), {mode: 'merge'});
  assert.equal(store.state.tasks.length, count, 'repeated import does not duplicate matching tasks');
});

test('older matching tasks and current project metadata survive a merge', () => {
  const current = workspace([task('Current title', {updatedAt: LATER})], [project()]);
  const {store} = setup(current);
  const incoming = workspace([task('Old title')], [project({name: 'Old project name'})]);
  store.importJSON(JSON.stringify(incoming), {mode: 'merge'});
  assert.equal(store.state.tasks[0].title, 'Current title');
  assert.equal(store.state.projects[0].name, 'Portfolio');
});

test('a stale tab cannot overwrite newer saved work; reload resolves the conflict', () => {
  const {store: first, storage} = setup();
  const second = new BoardStore({storage, initialState: workspace(), key: KEY});
  first.commit(draft => { draft.tasks[0].title = 'Saved in first tab'; });
  const staleState = second.state;
  assert.throws(() => second.commit(draft => { draft.tasks[0].title = 'Stale overwrite'; }), /another tab/);
  assert.equal(second.state, staleState);
  assert.equal(JSON.parse(storage.getItem(KEY)).tasks[0].title, 'Saved in first tab');
  second.reload();
  second.commit(draft => { draft.tasks[0].notes = 'Merged after reloading'; });
  first.reload();
  assert.equal(first.state.tasks[0].title, 'Saved in first tab');
  assert.equal(first.state.tasks[0].notes, 'Merged after reloading');
  assert.equal(first.state.revision, 2);
});

test('even edits with the same revision are detected across tabs', () => {
  const {store, storage} = setup();
  store.commit(() => {});
  const other = JSON.parse(storage.getItem(KEY));
  other.tasks[0].title = 'External edit without increment';
  storage.setItem(KEY, JSON.stringify(other));
  assert.throws(() => store.commit(draft => { draft.tasks[0].notes = 'Will not save'; }), /another tab/);
});

test('corrupt primary data is never silently replaced; previous snapshot can be recovered explicitly', () => {
  const {store, storage} = setup();
  store.commit(draft => { draft.tasks[0].status = 'next'; });
  store.commit(draft => { draft.tasks[0].status = 'doing'; });
  storage.setItem(KEY, '{damaged');
  const writesBefore = storage.writes;
  const reopened = new BoardStore({storage, initialState: workspace([]), key: KEY});
  assert.equal(reopened.state.tasks[0].status, 'next');
  assert.match(reopened.loadIssue, /previous saved snapshot/i);
  assert.equal(storage.writes, writesBefore);
  assert.throws(() => reopened.commit(draft => { draft.tasks = []; }), /recovery/);
  assert.equal(storage.getItem(KEY), '{damaged');
  reopened.importJSON(reopened.exportJSON(), {mode: 'replace'});
  assert.equal(storage.getItem(`${KEY}.corrupt`), '{damaged');
  assert.equal(reopened.loadIssue, null);
  assert.equal(JSON.parse(storage.getItem(KEY)).tasks[0].status, 'next');
});

test('corrupt data without a backup stays blocked and visible as a load issue', () => {
  const storage = new MapStorage();
  storage.setItem(KEY, 'null');
  const writesBefore = storage.writes;
  const store = new BoardStore({storage, initialState: workspace(), key: KEY});
  assert.ok(store.loadIssue);
  assert.throws(() => store.commit(draft => { draft.tasks[0].title = 'Will not overwrite'; }), /recovery/);
  assert.equal(storage.writes, writesBefore);
  assert.equal(storage.getItem(KEY), 'null');
});

test('unavailable storage preserves the last in-memory board and prevents writes', () => {
  const {store, storage} = setup();
  store.commit(draft => { draft.tasks[0].title = 'Last saved title'; });
  const before = store.state;
  storage.failRead = true;
  store.reload();
  assert.equal(store.state, before);
  assert.ok(store.loadIssue);
  assert.throws(() => store.commit(() => {}), /storage is unavailable/);
  storage.failRead = false;
  store.reload();
  assert.equal(store.loadIssue, null);
  assert.equal(store.state.tasks[0].title, 'Last saved title');
});

test('unsafe URL schemes and embedded credentials are blocked', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//example.com', 'file:///etc/passwd', 'https://name:password@example.com', 'https://example.com\n/hidden', 'mailto:a@example.com', 'not a link']) {
    assert.equal(safeUrl(url), '', url);
    assert.throws(() => makeTask({title: 'Task', url}, NOW), /link/);
  }
  assert.equal(safeUrl('https://example.com/path?q=one#section'), 'https://example.com/path?q=one#section');
  assert.equal(safeUrl(''), '');
});

test('CSV escapes quotes, newlines, and spreadsheet formulas', () => {
  const csv = toCSV([
    task('=HYPERLINK("https://example.com")', {notes: '  +SUM(1,2)', projectId: '@project'}),
    task('A, "quoted" title', {id: 'second', number: 2, notes: 'Line one\nLine two'}),
    task('-1+2', {id: 'third', number: 3, notes: '\t=1+1'}),
  ]);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes('"\'  +SUM(1,2)"'));
  assert.ok(csv.includes('"\'@project"'));
  assert.ok(csv.includes('"A, ""quoted"" title"'));
  assert.ok(csv.includes('"Line one\nLine two"'));
  assert.ok(csv.includes('"\'-1+2"'));
  assert.ok(csv.includes('"\'\t=1+1"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('due buckets use calendar dates and the earlier applicable waiting date', () => {
  const today = '2026-11-08';
  assert.equal(dueBucket(task('Past', {due: '2026-11-07'}), today), 'overdue');
  assert.equal(dueBucket(task('Today', {due: today}), today), 'today');
  assert.equal(dueBucket(task('Week', {due: '2026-11-15'}), today), 'soon');
  assert.equal(dueBucket(task('Later', {due: '2026-11-16'}), today), 'later');
  assert.equal(dueBucket(task(), today), 'none');
  assert.equal(dueBucket(task('Follow-up', {status: 'waiting', due: '2026-12-01', followUp: '2026-11-07'}), today), 'overdue');
  assert.equal(dueBucket(task('Not waiting', {followUp: '2026-11-07'}), today), 'none');
  assert.equal(dueBucket(task('Complete', {status: 'done', due: '2026-11-07'}), today), 'none');
  assert.equal(dueBucket(task('Archived', {archived: true, due: '2026-11-07'}), today), 'none');
});

test('recurrence handles leap years, month ends, year boundaries, and DST dates', () => {
  assert.equal(nextRepeatDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextRepeatDate('2024-01-31', 'monthly'), '2024-02-29');
  assert.equal(nextRepeatDate('2026-03-31', 'monthly'), '2026-04-30');
  assert.equal(nextRepeatDate('2026-12-31', 'monthly'), '2027-01-31');
  assert.equal(nextRepeatDate('2026-12-31', 'daily'), '2027-01-01');
  assert.equal(nextRepeatDate('2026-03-08', 'daily'), '2026-03-09');
  assert.equal(nextRepeatDate('2026-10-28', 'weekly'), '2026-11-04');
  assert.equal(nextRepeatDate('', 'none'), '');
  assert.throws(() => nextRepeatDate('2026-02-29', 'daily'), /calendar date/);
  assert.throws(() => nextRepeatDate('2026-11-08', 'yearly'), /Repeat/);
});

test('failed initial persistence reports an issue instead of claiming the board was saved', () => {
  const storage = new MapStorage();
  storage.failWhen = () => true;
  const store = new BoardStore({storage, initialState: workspace(), key: KEY});
  assert.match(store.loadIssue, /has not been saved/);
  assert.equal(storage.getItem(KEY), null);
  assert.throws(() => store.commit(() => {}), /recovery/);
  storage.failWhen = null;
  store.reload();
  assert.equal(store.loadIssue, null);
  assert.equal(JSON.parse(storage.getItem(KEY)).tasks[0].title, 'Review one role');
});


test('completing, reopening, and recompleting a recurring task keeps exactly one successor', () => {
  const draft = normalizeWorkspace(workspace([
    task('Weekly application review', {
      status: 'doing', repeat: 'weekly', due: '2026-11-12', followUp: '2026-11-09',
      today: true, starter: true, order: 2, notes: 'Keep these notes',
      checklist: [{id: 'check-1', text: 'Review saved roles', done: true}],
    }),
    task('Unrelated task', {id: 'unrelated', number: 12, order: 20}),
  ]));
  const parent = transitionTask(draft, 'task-1', 'done', {today: '2026-11-08', now: NOW});
  assert.equal(parent.status, 'done');
  assert.equal(parent.completedAt, NOW);
  assert.equal(parent.today, false);
  const successor = draft.tasks.find(item => item.id === parent.repeatNextId);
  assert.ok(successor);
  assert.notEqual(successor.id, parent.id);
  assert.equal(successor.number, 13);
  assert.equal(successor.order, 21);
  assert.equal(successor.status, 'next');
  assert.equal(successor.due, '2026-11-19', 'an early completion repeats from the future due date');
  assert.equal(successor.followUp, '');
  assert.equal(successor.today, false);
  assert.equal(successor.completedAt, null);
  assert.equal(successor.starter, false);
  assert.equal(successor.repeatNextId, '');
  assert.equal(successor.notes, parent.notes);
  assert.equal(successor.checklist[0].done, false);
  assert.equal(parent.checklist[0].done, true);
  assert.notEqual(successor.checklist[0], parent.checklist[0]);

  const firstCompletion = structuredClone(draft);
  transitionTask(draft, parent.id, 'done', {today: '2026-11-09', now: LATER});
  assert.deepEqual(draft, firstCompletion, 'a repeated completion call is a no-op');
  transitionTask(draft, parent.id, 'doing', {today: '2026-11-09', now: LATER});
  assert.equal(parent.completedAt, null);
  assert.equal(parent.repeatNextId, successor.id);
  successor.archived = true;
  transitionTask(draft, parent.id, 'done', {today: '2026-11-09', now: LATER});
  assert.equal(parent.completedAt, LATER);
  assert.equal(draft.tasks.length, 3, 'an archived successor still prevents duplicates');
  assert.equal(parent.repeatNextId, successor.id);
  assert.equal(successor.due, '2026-11-19');
});

test('recurrence chains independently and replaces a successor only after it is missing', () => {
  const draft = normalizeWorkspace(workspace([task('Monthly reset', {
    status: 'next', repeat: 'monthly', due: '2026-01-01', repeatNextId: 'previously-deleted',
  })]));
  const parent = transitionTask(draft, 'task-1', 'done', {
    today: '2026-01-31', now: '2026-01-31T12:00:00.000Z',
  });
  const second = draft.tasks.find(item => item.id === parent.repeatNextId);
  assert.equal(second.due, '2026-02-28', 'an overdue repeat starts from today and clamps the next month');
  assert.equal(second.repeatNextId, '');
  transitionTask(draft, second.id, 'done', {today: '2026-02-28', now: '2026-02-28T12:00:00.000Z'});
  const third = draft.tasks.find(item => item.id === second.repeatNextId);
  assert.ok(third);
  assert.equal(third.due, '2026-03-28');
  assert.equal(third.repeatNextId, '');
  assert.equal(parent.repeatNextId, second.id, 'the original parent still points to its own successor');
  assert.equal(draft.tasks.length, 3);

  draft.tasks = draft.tasks.filter(item => item.id !== third.id);
  assert.doesNotThrow(() => normalizeWorkspace(draft), 'deleted successor references remain importable');
  transitionTask(draft, second.id, 'next', {today: '2026-02-28', now: '2026-02-28T13:00:00.000Z'});
  transitionTask(draft, second.id, 'done', {today: '2026-02-28', now: '2026-02-28T14:00:00.000Z'});
  assert.notEqual(second.repeatNextId, third.id);
  assert.equal(draft.tasks.length, 3);
  assert.ok(draft.tasks.some(item => item.id === second.repeatNextId));
  assert.equal(new Set(draft.tasks.map(item => item.number)).size, 3);
});

test('recurring completion and its successor save and undo as one atomic change', () => {
  const {store, storage} = setup(workspace([task('Daily check-in', {
    status: 'next', repeat: 'daily', today: true, due: '',
    checklist: [{id: 'step', text: 'Write one next action', done: true}],
  })]));
  const originalTasks = structuredClone(store.state.tasks);
  store.commit(draft => transitionTask(draft, 'task-1', 'done', {today: '2026-11-08', now: NOW}));
  assert.equal(store.state.tasks.length, 2);
  assert.equal(store.state.tasks[0].status, 'done');
  assert.equal(store.state.tasks[1].due, '2026-11-09');
  assert.equal(store.state.tasks[0].repeatNextId, store.state.tasks[1].id);
  assert.equal(JSON.parse(storage.getItem(KEY)).tasks.length, 2);
  store.undo();
  assert.deepEqual(store.state.tasks, originalTasks, 'undo restores the parent and removes its successor together');
  assert.equal(JSON.parse(storage.getItem(KEY)).tasks.length, 1);

  const beforeFailure = store.state;
  const rawBeforeFailure = storage.getItem(KEY);
  storage.failWhen = key => key === KEY;
  assert.throws(() => store.commit(draft => transitionTask(draft, 'task-1', 'done', {
    today: '2026-11-08', now: NOW,
  })), /could not be saved/);
  assert.equal(store.state, beforeFailure);
  assert.equal(storage.getItem(KEY), rawBeforeFailure);
  assert.equal(store.state.tasks[0].repeatNextId, '');
  storage.failWhen = null;
  store.commit(draft => transitionTask(draft, 'task-1', 'done', {today: '2026-11-08', now: NOW}));
  assert.equal(store.state.tasks.length, 2, 'retry creates exactly one durable successor');
  store.reload();
  store.commit(draft => transitionTask(draft, 'task-1', 'next', {today: '2026-11-09', now: LATER}));
  store.commit(draft => transitionTask(draft, 'task-1', 'done', {today: '2026-11-09', now: LATER}));
  assert.equal(store.state.tasks.length, 2, 'successor identity survives persistence and reload');
});
