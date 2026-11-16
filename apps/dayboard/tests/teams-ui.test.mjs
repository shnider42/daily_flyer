import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamsUI, preparePersonalCopy} from '../public/teams-ui.mjs';
import {makeTask, normalizeWorkspace} from '../public/model.mjs';

const NOW = '2026-11-16T12:00:00.000Z';
const project = (id, area, fields = {}) => ({id, area, name: id, url: '', description: '', starter: false, archived: false, ...fields});

function fixture() {
  return normalizeWorkspace({
    schemaVersion: 2, revision: 29, updatedAt: NOW,
    areas: [
      {id: 'career', name: 'Career', color: 'blue'},
      {id: 'dfe', name: 'DailyFlyer', color: 'green'},
      {id: 'life', name: 'Life', color: 'amber'},
    ],
    projects: [
      project('private-project', 'career', {description: 'PRIVATE project context'}),
      project('release-project', 'dfe', {description: 'Reviewed release context', starter: true}),
      project('archived-project', 'dfe', {archived: true}),
    ],
    tasks: [
      makeTask({id: 'private-task', title: 'PRIVATE career task', area: 'career', projectId: 'private-project', notes: 'PRIVATE notes', today: true}, NOW),
      makeTask({id: 'release', title: 'Review release', area: 'dfe', projectId: 'release-project', notes: 'Reviewed notes', url: 'https://example.test/release', checklist: [{id: 'step', text: 'Reviewed checklist', done: true}], today: true, starter: true, repeat: 'weekly', repeatNextId: 'next-release'}, NOW),
      makeTask({id: 'next-release', title: 'Next release', area: 'dfe', repeat: 'weekly', repeatNextId: 'private-task'}, NOW),
      makeTask({id: 'archived-release', title: 'Archived release', area: 'dfe', projectId: 'archived-project', status: 'done', completedAt: NOW, archived: true}, NOW),
      makeTask({id: 'private-archived', title: 'PRIVATE archived task', area: 'life', archived: true}, NOW),
    ],
    settings: {theme: 'light', density: 'compact', welcomeDismissed: true, lastBackupAt: NOW, lastReviewAt: NOW},
  });
}

test('reviewed copy contains only selected Areas, with their explicitly disclosed completed and archived work', () => {
  const result = preparePersonalCopy(fixture(), ['dfe']);
  assert.deepEqual(result.areas.map(area => [area.id, area.name]), [['dfe', 'DailyFlyer']]);
  assert.deepEqual(result.projects.map(item => item.id), ['release-project', 'archived-project']);
  assert.deepEqual(result.tasks.map(item => item.id), ['release', 'next-release', 'archived-release']);
  assert.equal(result.tasks.find(item => item.id === 'archived-release').archived, true);
  assert.equal(result.tasks.find(item => item.id === 'archived-release').status, 'done');
  assert.equal(result.projects.find(item => item.id === 'archived-project').archived, true);
  const release = result.tasks[0];
  assert.equal(release.notes, 'Reviewed notes');
  assert.equal(release.url, 'https://example.test/release');
  assert.deepEqual(release.checklist, [{id: 'step', text: 'Reviewed checklist', done: true}]);
  assert.equal(result.projects[0].description, 'Reviewed release context');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private-task|private-project|private-archived/);
});

test('personal Today, display choices, review history, and starter flags do not cross into the team copy', () => {
  const result = preparePersonalCopy(fixture(), ['dfe']);
  assert.ok(result.tasks.every(task => task.today === false && task.starter === false));
  assert.ok(result.projects.every(item => item.starter === false));
  assert.deepEqual(result.settings, {
    theme: 'dark', density: 'comfortable', welcomeDismissed: false, lastBackupAt: null, lastReviewAt: null,
  });
  assert.equal(result.revision, 0);
});

test('selected recurrence links are retained while unselected, missing, and self references are removed', () => {
  const source = fixture();
  source.tasks.push(makeTask({id: 'missing-successor', title: 'Old recurrence', area: 'dfe', repeat: 'weekly', repeatNextId: 'deleted-task'}, NOW));
  source.tasks.push(makeTask({id: 'self-successor', title: 'Old self reference', area: 'dfe', repeat: 'weekly', repeatNextId: 'self-successor'}, NOW));
  const result = preparePersonalCopy(source, ['dfe']);
  const byId = new Map(result.tasks.map(task => [task.id, task]));
  assert.equal(byId.get('release').repeatNextId, 'next-release');
  for (const id of ['next-release', 'missing-successor', 'self-successor']) assert.equal(byId.get(id).repeatNextId, '');
  assert.ok(result.tasks.every(task => !task.repeatNextId || byId.has(task.repeatNextId)));
});

test('cross-Area project references never expand permission to include unselected project context', () => {
  const source = fixture();
  source.tasks[1].projectId = 'private-project';
  for (const selected of [['dfe'], ['career', 'dfe']]) {
    const result = preparePersonalCopy(source, selected);
    assert.equal(result.tasks.find(task => task.id === 'release').projectId, '');
    assert.ok(result.tasks.every(task => !task.projectId || result.projects.some(item => item.id === task.projectId && item.area === task.area)));
    assert.equal(result.projects.some(item => item.id === 'private-project'), selected.includes('career'));
  }
  assert.equal(source.tasks[1].projectId, 'private-project', 'repair affects only the prepared copy');
});

test('preparation and later edits to its result leave every personal source byte unchanged', () => {
  const source = fixture(), before = JSON.stringify(source);
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  };
  freeze(source);
  const result = preparePersonalCopy(source, ['dfe']);
  result.tasks[0].notes = 'Changed copy';
  result.tasks[0].checklist[0].text = 'Changed copied checklist';
  result.projects[0].description = 'Changed copied context';
  result.areas[0].name = 'Changed copied Area';
  result.settings.theme = 'light';
  assert.equal(JSON.stringify(source), before);
});

test('copy requires explicit existing Area IDs and does not infer a selection from names', () => {
  const source = fixture();
  for (const selected of [[], ['missing'], ['dfe', 'missing'], ['DailyFlyer']]) {
    assert.throws(() => preparePersonalCopy(source, selected), /Choose at least one existing Area/);
  }
  assert.deepEqual(preparePersonalCopy(source, ['dfe', 'dfe']).areas.map(area => area.id), ['dfe']);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

/** Only the dialog/event surface needed to test account and draft boundaries. */
function viewHarness({guard = () => true, hash = ''} = {}) {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const documentListeners = new Map(), dialogListeners = new Map(), sessions = new Map();
  const add = (map, name, listener) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(listener); };
  const remove = (map, name, listener) => map.get(name)?.delete(listener);
  const node = () => ({innerHTML: '', textContent: '', hidden: false, focus() {}});
  let html = '', nodes = new Map();
  const dialog = {
    open: false,
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; nodes = new Map(['#team-error', '#team-status', '#team-workspace-list', '#team-create-controls', '#team-creation-note'].map(id => [id, node()])); },
    querySelector(selector) { return selector === '[data-teams-content]' ? (html.includes('data-teams-content') ? {} : null) : (html.includes('data-teams-content') ? nodes.get(selector) || null : null); },
    querySelectorAll() { return []; },
    classList: {add() {}}, setAttribute() {}, removeAttribute() {},
    close() { this.open = false; for (const listener of dialogListeners.get('close') || []) listener(); },
    addEventListener(name, listener) { add(dialogListeners, name, listener); },
    removeEventListener(name, listener) { remove(dialogListeners, name, listener); },
  };
  globalThis.document = {
    body: {classList: {remove() {}}},
    querySelector(selector) { return selector === '#utility-dialog' ? dialog : null; },
    addEventListener(name, listener) { add(documentListeners, name, listener); },
    removeEventListener(name, listener) { remove(documentListeners, name, listener); },
  };
  globalThis.window = {
    location: {origin: 'https://example.test', pathname: '/dayboard', search: '', hash},
    history: {replaceState(_state, _title, url) { globalThis.window.location.hash = new URL(url, 'https://example.test').hash; }},
    sessionStorage: {getItem: key => sessions.get(key), setItem: (key, value) => sessions.set(key, value), removeItem: key => sessions.delete(key)},
    addEventListener() {}, removeEventListener() {},
  };
  let authListener, store = {kind: 'local'}, activated = 0;
  const calls = {preview: 0}, notifications = [];
  const service = {
    configured: true, user: {id: 'account-a', email: 'a@example.test'},
    init: async () => null,
    onAuthChange(listener) { authListener = listener; return () => {}; },
    listWorkspaces: async () => [],
    capabilities: async () => ({mayCreateWorkspace: false, workspaceLimit: 0, ownedWorkspaceCount: 0}),
    previewInvite: async () => { calls.preview++; return {}; },
  };
  const ui = createTeamsUI({
    service, localStore: store, getStore: () => store,
    onBeforeSwitch: guard,
    onWorkspaceChange: async next => { activated++; store = next; },
    openUtility(_title, body) { dialog.innerHTML = body; dialog.open = true; },
    notify: message => notifications.push(message), esc: value => String(value), icon: () => '',
  });
  return {
    ui, dialog, service, calls, sessions, notifications,
    get activated() { return activated; },
    changeAccount() {
      const previousUserId = service.user.id;
      service.user = {id: 'account-b', email: 'b@example.test'};
      authListener({event: 'SIGNED_IN', user: service.user, previousUserId});
    },
    async click(name, extra = {}) {
      const button = {dataset: {teamAction: name, ...extra}};
      const event = {target: {closest: selector => selector === '[data-team-action]' ? button : null}, preventDefault() {}};
      for (const listener of documentListeners.get('click') || []) await listener(event);
    },
    dispose() {
      ui.dispose();
      if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
      if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    },
  };
}

test('an invitation arriving during a dirty personal utility stays pending without replacing the draft', async () => {
  const token = 'a'.repeat(64);
  const view = viewHarness({guard: () => false, hash: `#invite=${token}`});
  try {
    view.dialog.innerHTML = '<form id="project-form">Personal project draft</form>';
    view.dialog.open = true;
    await view.ui.init();
    await view.ui.open();
    assert.equal(view.dialog.innerHTML, '<form id="project-form">Personal project draft</form>');
    assert.equal(view.calls.preview, 0, 'blocked review never reads invitation metadata');
    assert.equal(view.sessions.get('dfe.dayboard.pending-invite.v1'), token, 'the invitation remains available after finishing the draft');
  } finally { view.dispose(); }
});

test('a workspace opening under a previous account cannot activate after an identity change', async () => {
  const view = viewHarness(), response = deferred(), requested = deferred();
  let disposed = false;
  view.service.openWorkspace = () => { requested.resolve(); return response.promise; };
  try {
    await view.ui.init();
    await view.ui.open();
    const opening = view.click('select', {workspaceId: 'workspace-a'});
    await requested.promise;
    view.changeAccount();
    response.resolve({kind: 'shared', workspace: {id: 'workspace-a', name: 'Old account workspace'}, dispose() { disposed = true; }});
    await opening;
    assert.equal(view.activated, 0);
    assert.equal(disposed, true, 'the unused store must stop polling and subscribing');
    assert.doesNotMatch(view.dialog.innerHTML, /Old account workspace|a@example\.test/);
  } finally { view.dispose(); }
});

test('the workspace click handler opens the chooser when shared configuration is disabled', async () => {
  const view = viewHarness();
  view.service.configured = false;
  view.service.user = null;
  try {
    await view.ui.init();
    await view.click('workspaces');
    assert.equal(view.dialog.open, true);
    assert.match(view.dialog.innerHTML, /Shared workspaces are not available on this build yet/);
    assert.equal(view.notifications.length, 0);
  } finally { view.dispose(); }
});

test('an invited member can see their workspaces without being offered organizer controls', async () => {
  const view = viewHarness();
  view.service.listWorkspaces = async () => [{id: 'joined', name: 'Invited team', role: 'member', memberCount: 2}];
  try {
    await view.ui.init();
    await view.ui.open();
    assert.match(view.dialog.querySelector('#team-workspace-list').innerHTML, /Invited team/);
    assert.equal(view.dialog.querySelector('#team-create-controls').innerHTML, '');
    assert.match(view.dialog.querySelector('#team-creation-note').textContent, /organizer approval/);
    await view.click('create');
    assert.doesNotMatch(view.dialog.innerHTML, /team-create-form/);
    assert.match(view.dialog.querySelector('#team-error').textContent, /organizer approval/);
  } finally { view.dispose(); }
});

test('organizer creation follows the current account allowance and fails closed on a permissions error', async () => {
  const view = viewHarness();
  view.service.capabilities = async () => ({mayCreateWorkspace: true, workspaceLimit: 3, ownedWorkspaceCount: 1});
  try {
    await view.ui.init();
    await view.ui.open();
    assert.match(view.dialog.querySelector('#team-create-controls').innerHTML, /Create workspace/);
    assert.match(view.dialog.querySelector('#team-creation-note').textContent, /1 of 3/);
    view.service.capabilities = async () => { throw new Error('Permission lookup failed'); };
    await view.ui.open();
    assert.equal(view.dialog.querySelector('#team-create-controls').innerHTML, '');
    await view.click('create');
    assert.doesNotMatch(view.dialog.innerHTML, /team-create-form/);
  } finally { view.dispose(); }
});
