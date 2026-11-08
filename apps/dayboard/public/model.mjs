/**
 * Dayboard data contract. Browser-only; no network requests.
 *
 * makeTask() creates number 0 when no number is supplied; the next workspace
 * normalization assigns it the next unused positive number. Existing positive
 * numbers must be unique. safeUrl() returns an HTTP(S) URL or an empty string.
 * dueBucket() returns overdue | today | soon (next 7 days) | later | none.
 * Waiting tasks also consider their follow-up date; finished/archived tasks
 * return none. nextRepeatDate(..., 'none') returns an empty string.
 *
 * BoardStore saves a fresh initial workspace on first open and keeps the last
 * durable snapshot at `${key}.previous`. A malformed
 * primary record is never overwritten by commit/undo: a valid previous record
 * may be displayed, and importJSON(..., {mode: 'replace'}) explicitly recovers.
 * The malformed original is preserved at `${key}.corrupt` before that recovery.
 */
export const AREAS = Object.freeze(['career', 'life', 'dfe']);
export const STATUSES = Object.freeze(['inbox', 'next', 'doing', 'waiting', 'done', 'someday']);
const PRIORITIES = ['high', 'normal', 'low'];
const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
const EFFORTS = [0, 15, 30, 60, 90];
const MAX_TASKS = 10000;
const MAX_PROJECTS = 1000;
const MAX_JSON_LENGTH = 10 * 1024 * 1024;
const TASK_KEYS = ['id', 'number', 'title', 'area', 'status', 'priority', 'projectId', 'notes', 'due', 'followUp', 'effort', 'today', 'checklist', 'createdAt', 'updatedAt', 'completedAt', 'archived', 'starter', 'repeat', 'repeatNextId', 'url', 'order'];
const PROJECT_KEYS = ['id', 'name', 'area', 'url', 'description', 'starter', 'archived'];
const SETTINGS_KEYS = ['theme', 'density', 'welcomeDismissed', 'lastBackupAt', 'lastReviewAt'];
const WORKSPACE_KEYS = ['schemaVersion', 'revision', 'updatedAt', 'tasks', 'projects', 'settings'];

function fail(message) { throw new TypeError(message); }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(`${label} must be a plain object.`);
  return value;
}
function knownKeys(value, keys, label) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} contains an unsupported field: ${key}.`);
}
function field(value, key, fallback) { return own(value, key) ? value[key] : fallback; }
function string(value, label, {empty = true, trim = false, max = 200000} = {}) {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result = trim ? value.trim() : value;
  if (!empty && !result.trim()) fail(`${label} cannot be empty.`);
  if (result.length > max) fail(`${label} is too long (maximum ${max} characters).`);
  if (result.includes('\0')) fail(`${label} contains an invalid character.`);
  return result;
}
function id(value, label) { return string(value, label, {empty: false, trim: true, max: 200}); }
function choice(value, choices, label) {
  if (!choices.includes(value)) fail(`${label} must be one of: ${choices.join(', ')}.`);
  return value;
}
function bool(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be true or false.`);
  return value;
}
function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${label} must be a whole number of at least ${min}.`);
  return value;
}
function instant(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${label} must be an ISO date and time.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail(`${label} is not a valid date and time.`);
  // Date.parse normalizes impossible calendar dates, so check the source date.
  dateOnly(value.slice(0, 10), label, false);
  return parsed.toISOString();
}
function timestampNow(value) {
  const date = value === undefined ? new Date() : value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('The current date and time is invalid.');
  return date.toISOString();
}
function nullableInstant(value, label) { return value === null ? null : instant(value, label); }
function dateOnly(value, label = 'Date', allowEmpty = true) {
  if (allowEmpty && value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(`${label} is not a real calendar date.`);
  return value;
}
function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Older browsers without randomUUID still get random identifiers when crypto
  // is available. The fallback is only identity, never an authentication token.
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** An absolute HTTP(S) URL, or '' when unsafe/invalid. Credentials are rejected. */
export function safeUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return '';
  const candidate = value.trim();
  if (!/^https?:\/\//i.test(candidate)) return '';
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch { return ''; }
}
function checkedUrl(value, label) {
  const raw = string(value, label, {trim: true, max: 4096});
  if (!raw) return '';
  const result = safeUrl(raw);
  if (!result) fail(`${label} must be an absolute http:// or https:// link without a username or password.`);
  return result;
}

/** Create a task with validated fields and stable, serializable defaults. */
export function makeTask(fields = {}, now) {
  object(fields, 'Task');
  knownKeys(fields, TASK_KEYS, 'Task');
  const stamp = timestampNow(now);
  const createdAt = instant(field(fields, 'createdAt', stamp), 'Created at');
  const checklist = field(fields, 'checklist', []);
  if (!Array.isArray(checklist) || checklist.length > 500) fail('Checklist must be an array with at most 500 items.');
  const itemIds = new Set();
  const items = checklist.map((entry, index) => {
    object(entry, `Checklist item ${index + 1}`);
    knownKeys(entry, ['id', 'text', 'done'], `Checklist item ${index + 1}`);
    const itemId = id(field(entry, 'id', uid()), 'Checklist item ID');
    if (itemIds.has(itemId)) fail('Checklist item IDs must be unique within a task.');
    itemIds.add(itemId);
    return {id: itemId, text: string(entry.text, 'Checklist item text', {empty: false, trim: true, max: 2000}), done: bool(field(entry, 'done', false), 'Checklist completion')};
  });
  const order = field(fields, 'order', 0);
  if (typeof order !== 'number' || !Number.isFinite(order) || Math.abs(order) > Number.MAX_SAFE_INTEGER) fail('Task order must be a finite number.');
  return {
    id: id(field(fields, 'id', uid()), 'Task ID'),
    number: integer(field(fields, 'number', 0), 'Task number'),
    title: string(fields.title, 'Task title', {empty: false, trim: true, max: 500}),
    area: choice(field(fields, 'area', 'career'), AREAS, 'Area'),
    status: choice(field(fields, 'status', 'inbox'), STATUSES, 'Status'),
    priority: choice(field(fields, 'priority', 'normal'), PRIORITIES, 'Priority'),
    projectId: string(field(fields, 'projectId', ''), 'Project ID', {trim: true, max: 200}),
    notes: string(field(fields, 'notes', ''), 'Notes'),
    due: dateOnly(field(fields, 'due', ''), 'Due date'),
    followUp: dateOnly(field(fields, 'followUp', ''), 'Follow-up date'),
    effort: choice(field(fields, 'effort', 0), EFFORTS, 'Estimated minutes'),
    today: bool(field(fields, 'today', false), 'Today selection'),
    checklist: items,
    createdAt,
    updatedAt: instant(field(fields, 'updatedAt', createdAt), 'Updated at'),
    completedAt: nullableInstant(field(fields, 'completedAt', null), 'Completed at'),
    archived: bool(field(fields, 'archived', false), 'Archived'),
    starter: bool(field(fields, 'starter', false), 'Starter suggestion'),
    repeat: choice(field(fields, 'repeat', 'none'), REPEATS, 'Repeat'),
    repeatNextId: string(field(fields, 'repeatNextId', ''), 'Next repeat task ID', {trim: true, max: 200}),
    url: checkedUrl(field(fields, 'url', ''), 'Task link'),
    order,
  };
}

function normalizeProject(project) {
  object(project, 'Project');
  knownKeys(project, PROJECT_KEYS, 'Project');
  return {
    id: id(project.id, 'Project ID'),
    name: string(project.name, 'Project name', {empty: false, trim: true, max: 200}),
    area: choice(project.area, AREAS, 'Project area'),
    url: checkedUrl(field(project, 'url', ''), 'Project link'),
    description: string(field(project, 'description', ''), 'Project description', {max: 10000}),
    starter: bool(field(project, 'starter', false), 'Project starter suggestion'),
    archived: bool(field(project, 'archived', false), 'Project archived'),
  };
}

/** Validate an entire workspace, reconstructing only supported schema fields. */
export function normalizeWorkspace(data) {
  object(data, 'Workspace');
  knownKeys(data, WORKSPACE_KEYS, 'Workspace');
  if (data.schemaVersion !== 1) fail('This file uses an unsupported workspace format. Expected schemaVersion 1.');
  if (!Array.isArray(data.tasks) || data.tasks.length > MAX_TASKS) fail(`Tasks must be an array with at most ${MAX_TASKS} items.`);
  if (!Array.isArray(data.projects) || data.projects.length > MAX_PROJECTS) fail(`Projects must be an array with at most ${MAX_PROJECTS} items.`);
  const settings = field(data, 'settings', {});
  object(settings, 'Settings');
  knownKeys(settings, SETTINGS_KEYS, 'Settings');
  const now = timestampNow();
  const projects = data.projects.map(normalizeProject);
  const projectIds = new Set();
  for (const project of projects) {
    if (projectIds.has(project.id)) fail(`Project ID is duplicated: ${project.id}.`);
    projectIds.add(project.id);
  }
  const taskIds = new Set();
  const numbers = new Set();
  let nextNumber = 1;
  const tasks = data.tasks.map(raw => {
    object(raw, 'Task');
    // An imported record needs a real identity; only makeTask creates new IDs.
    if (!own(raw, 'id')) fail('Every saved task must have an ID.');
    const task = makeTask(raw, now);
    if (taskIds.has(task.id)) fail(`Task ID is duplicated: ${task.id}.`);
    taskIds.add(task.id);
    if (task.projectId && !projectIds.has(task.projectId)) fail(`Task “${task.title}” refers to a missing project.`);
    if (task.number > 0) {
      if (numbers.has(task.number)) fail(`Task number is duplicated: ${task.number}.`);
      numbers.add(task.number);
      nextNumber = Math.max(nextNumber, task.number + 1);
    }
    return task;
  });
  for (const task of tasks) if (task.number === 0) {
    integer(nextNumber, 'Next task number', 1);
    task.number = nextNumber++;
  }
  return {
    schemaVersion: 1,
    revision: integer(field(data, 'revision', 0), 'Workspace revision'),
    updatedAt: instant(field(data, 'updatedAt', now), 'Workspace updated at'),
    tasks,
    projects,
    settings: {
      theme: choice(field(settings, 'theme', 'dark'), ['dark', 'light'], 'Theme'),
      density: choice(field(settings, 'density', 'comfortable'), ['comfortable', 'compact'], 'Density'),
      welcomeDismissed: bool(field(settings, 'welcomeDismissed', false), 'Welcome dismissal'),
      lastBackupAt: nullableInstant(field(settings, 'lastBackupAt', null), 'Last backup at'),
      lastReviewAt: nullableInstant(field(settings, 'lastReviewAt', null), 'Last review at'),
    },
  };
}

/** Multiline capture stays literal; only list markers and area tags are parsed. */
export function parseCapture(text, area = 'career') {
  string(text, 'Capture text');
  choice(area, AREAS, 'Capture area');
  return text.split(/\r?\n/).map(line => {
    let title = line.trim().replace(/^(?:(?:[-*+•]|\d+[.)])\s+)?\[\s*[xX]?\s*\]\s*/, '').replace(/^(?:[-*+•]|\d+[.)])\s+/, '');
    let taskArea = area;
    title = title.replace(/(^|\s)#(career|life|dfe)(?=\s|$)/gi, (_, spacing, tag) => { taskArea = tag.toLowerCase(); return spacing; }).replace(/[ \t]{2,}/g, ' ').trim();
    if (!title) return null;
    return {title, area: taskArea};
  }).filter(Boolean);
}

/** Dates use UTC arithmetic so browser timezones and DST cannot shift a day. */
export function dueBucket(task, today) {
  dateOnly(today, 'Today', false);
  if (!task || task.status === 'done' || task.archived) return 'none';
  const dates = [task.due || '', ...(task.status === 'waiting' ? [task.followUp || ''] : [])].filter(Boolean);
  if (!dates.length) return 'none';
  dates.forEach(date => dateOnly(date, 'Task date', false));
  const date = dates.sort()[0];
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  const distance = (new Date(`${date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000;
  return distance <= 7 ? 'soon' : 'later';
}

export function nextRepeatDate(date, repeat) {
  choice(repeat, REPEATS, 'Repeat');
  if (repeat === 'none') return '';
  dateOnly(date, 'Repeat date', false);
  const result = new Date(`${date}T00:00:00.000Z`);
  if (repeat === 'monthly') {
    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    const endOfMonth = new Date(result.getTime());
    endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1);
    endOfMonth.setUTCDate(0);
    result.setUTCDate(Math.min(originalDay, endOfMonth.getUTCDate()));
  } else result.setUTCDate(result.getUTCDate() + (repeat === 'weekly' ? 7 : 1));
  return dateOnly(result.toISOString().slice(0, 10), 'Next repeat date', false);
}

/**
 * Apply a status transition to a mutable workspace draft. A completed recurring
 * task remembers its successor so reopening/recompleting does not duplicate it.
 * Dangling successor IDs are allowed in backups; a later completion may replace
 * a missing successor. Use inside BoardStore.commit for durable atomic changes.
 * Returns the original, now-mutated task. Repeating the same status is a no-op.
 */
export function transitionTask(state, taskId, status, options = {}) {
  object(state, 'Workspace');
  if (!Array.isArray(state.tasks)) fail('Workspace tasks must be an array.');
  id(taskId, 'Task ID');
  choice(status, STATUSES, 'Status');
  object(options, 'Transition options');
  knownKeys(options, ['today', 'now'], 'Transition options');
  const stamp = own(options, 'now') ? instant(options.now, 'Transition time') : timestampNow();
  const local = new Date(stamp);
  const localDay = `${String(local.getFullYear()).padStart(4, '0')}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  const today = dateOnly(field(options, 'today', localDay), 'Today', false);
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) fail('That task no longer exists in this board.');
  if (task.status === status) return task;

  let next = null;
  const repeat = choice(field(task, 'repeat', 'none'), REPEATS, 'Repeat');
  const successorId = string(field(task, 'repeatNextId', ''), 'Next repeat task ID', {trim: true, max: 200});
  const hasSuccessor = successorId && state.tasks.some(item => item.id === successorId);
  if (status === 'done' && repeat !== 'none' && !hasSuccessor) {
    const due = dateOnly(field(task, 'due', ''), 'Due date');
    const baseDate = due && due > today ? due : today;
    const number = Math.max(0, ...state.tasks.map(item => item.number)) + 1;
    const order = Math.max(0, ...state.tasks.map(item => item.order)) + 1;
    // Build and validate the successor before changing its parent. makeTask
    // reconstructs checklist objects, keeping occurrences independent.
    next = makeTask({
      ...task,
      id: uid(),
      number,
      order,
      status: 'next',
      due: nextRepeatDate(baseDate, repeat),
      followUp: '',
      today: false,
      completedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
      archived: false,
      starter: false,
      repeatNextId: '',
      checklist: task.checklist.map(item => ({...item, done: false})),
    }, stamp);
    while (state.tasks.some(item => item.id === next.id)) next.id = uid();
  }

  task.status = status;
  task.updatedAt = stamp;
  task.starter = false;
  task.completedAt = status === 'done' ? stamp : null;
  if (status === 'done' || status === 'someday') task.today = false;
  if (next) {
    task.repeatNextId = next.id;
    state.tasks.push(next);
  }
  return task;
}

function csvCell(value) {
  let result = value == null ? '' : String(value);
  // Spreadsheet programs interpret formula-like values even when CSV-quoted.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(result) || /^[\t\r\n]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}
export function toCSV(tasks) {
  if (!Array.isArray(tasks)) fail('CSV tasks must be an array.');
  const rows = [['Number', 'Title', 'Area', 'Status', 'Priority', 'Project', 'Due', 'Follow-up', 'Minutes', 'Today', 'Checklist complete', 'Checklist total', 'URL', 'Notes', 'Created', 'Updated', 'Completed', 'Archived']];
  for (const task of tasks) rows.push([task.number, task.title, task.area, task.status, task.priority, task.projectId, task.due, task.followUp, task.effort, task.today ? 'Yes' : 'No', (task.checklist || []).filter(item => item.done).length, (task.checklist || []).length, task.url, task.notes, task.createdAt, task.updatedAt, task.completedAt, task.archived ? 'Yes' : 'No']);
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function parseWorkspace(text) {
  if (typeof text !== 'string' || text.length > MAX_JSON_LENGTH) fail('The backup must be a JSON file smaller than 10 MB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('This file is not valid JSON. Your current board has not changed.'); }
  return normalizeWorkspace(parsed);
}
function emptyWorkspace() { return {schemaVersion: 1, revision: 0, updatedAt: timestampNow(), tasks: [], projects: [], settings: {}}; }
function errorText(error) { return error instanceof Error ? error.message : String(error); }
function mergeWorkspaces(current, incoming) {
  const result = clone(current);
  const knownProjects = new Set(result.projects.map(project => project.id));
  for (const project of incoming.projects) if (!knownProjects.has(project.id)) {
    result.projects.push(clone(project));
    knownProjects.add(project.id);
  }
  // Existing project IDs identify the same project. Without per-project update
  // times, preserve the current board's project metadata on a collision.
  const positions = new Map(result.tasks.map((task, index) => [task.id, index]));
  const usedNumbers = new Set(result.tasks.map(task => task.number));
  let nextNumber = Math.max(0, ...usedNumbers) + 1;
  for (const raw of incoming.tasks) {
    const task = clone(raw);
    if (positions.has(task.id)) {
      const index = positions.get(task.id);
      if (task.updatedAt > result.tasks[index].updatedAt) {
        task.number = result.tasks[index].number;
        result.tasks[index] = task;
      }
      continue;
    }
    if (usedNumbers.has(task.number)) task.number = nextNumber++;
    usedNumbers.add(task.number);
    nextNumber = Math.max(nextNumber, task.number + 1);
    positions.set(task.id, result.tasks.length);
    result.tasks.push(task);
  }
  return result;
}

export class BoardStore {
  constructor({storage, initialState, key = 'dfe.dayboard.v1'} = {}) {
    this.key = string(key, 'Storage key', {empty: false, max: 200});
    this.previousKey = `${this.key}.previous`;
    this.corruptKey = `${this.key}.corrupt`;
    this._initial = normalizeWorkspace(initialState === undefined ? emptyWorkspace() : initialState);
    this._state = freeze(clone(this._initial));
    this._raw = null;
    this._history = [];
    this._writeBlocked = false;
    this._rawKnown = false;
    this.loadIssue = null;
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
      if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function') throw new Error('Browser storage is unavailable.');
    } catch (error) {
      this.storage = null;
      this._writeBlocked = true;
      this.loadIssue = `Your board could not access browser storage: ${errorText(error)} Export a backup before closing this page.`;
      return;
    }
    this.reload();
  }

  get state() { return this._state; }
  get canUndo() { return this._history.length > 0 && !this._writeBlocked; }

  reload() {
    if (!this.storage) return this._state;
    let raw;
    try { raw = this.storage.getItem(this.key); }
    catch (error) {
      this._rawKnown = false;
      this._writeBlocked = true;
      this.loadIssue = `Your saved board could not be read: ${errorText(error)} Export a backup before closing this page.`;
      return this._state;
    }
    this._raw = raw;
    this._rawKnown = true;
    this._history = [];
    if (raw === null) {
      this._state = freeze(clone(this._initial));
      const initialRaw = JSON.stringify(this._state);
      try {
        this.storage.setItem(this.key, initialRaw);
        this._raw = initialRaw;
        this._writeBlocked = false;
        this.loadIssue = null;
      } catch (error) {
        this._writeBlocked = true;
        this.loadIssue = `This board has not been saved because browser storage could not be written: ${errorText(error)} Export a backup before closing this page, then try reloading.`;
      }
      return this._state;
    }
    let primary;
    try { primary = parseWorkspace(raw); }
    catch (error) {
      this._writeBlocked = true;
      this.loadIssue = `Your saved board is unreadable and has been kept untouched. ${errorText(error)} Export what is visible, then import a valid replacement to recover.`;
      try {
        const previous = this.storage.getItem(this.previousKey);
        if (previous !== null) {
          this._state = freeze(parseWorkspace(previous));
          this.loadIssue = `The previous saved snapshot is shown. Your unreadable current record is kept untouched. Export this snapshot, then import it with Replace to recover.`;
        }
      } catch { /* Keep the last trustworthy in-memory state if backup also fails. */ }
      return this._state;
    }
    this._state = freeze(primary);
    this._writeBlocked = false;
    this.loadIssue = null;
    try {
      const previous = this.storage.getItem(this.previousKey);
      if (previous !== null) {
        const snapshot = parseWorkspace(previous);
        if (snapshot.revision < primary.revision) this._history.push(snapshot);
      }
    } catch { /* A damaged backup does not prevent use of a valid current board. */ }
    return this._state;
  }

  _persist(candidate, {recovery = false, undo = false} = {}) {
    if (!this.storage || !this._rawKnown) throw new Error('Browser storage is unavailable. Export a backup and try reloading before editing.');
    if (this._writeBlocked && !recovery) throw new Error('Your saved record needs recovery. Export the visible board, then import a valid backup with Replace.');
    const currentRaw = this.storage.getItem(this.key);
    if (currentRaw !== this._raw) throw new Error('This board changed in another tab. Reload the board before saving so those changes are preserved.');
    const next = normalizeWorkspace(candidate);
    next.revision = integer(this._state.revision + 1, 'Next workspace revision', 1);
    next.updatedAt = timestampNow();
    const serialized = JSON.stringify(next);
    if (serialized.length > MAX_JSON_LENGTH) throw new Error('The board is too large to save. Export a backup before reducing it.');
    const prior = clone(this._state);
    const previousRaw = JSON.stringify(prior);
    try {
      if (this._writeBlocked && recovery && this._raw !== null) this.storage.setItem(this.corruptKey, this._raw);
      this.storage.setItem(this.previousKey, previousRaw);
      this.storage.setItem(this.key, serialized);
    } catch (error) {
      throw new Error(`The board could not be saved. Your last saved board is unchanged. ${errorText(error)}`);
    }
    // No state, undo history, or revision changes are published before the main
    // record is durably written. Failure on either write leaves them intact.
    this._raw = serialized;
    this._state = freeze(next);
    this._writeBlocked = false;
    this.loadIssue = null;
    if (undo) this._history.pop();
    else {
      this._history.push(prior);
      if (this._history.length > 30) this._history.shift();
    }
    return this._state;
  }

  commit(mutator) {
    if (typeof mutator !== 'function') fail('A board change must be a function.');
    const draft = clone(this._state);
    const result = mutator(draft);
    if (result && typeof result.then === 'function') fail('Board changes must be synchronous.');
    return this._persist(draft);
  }

  undo() {
    if (!this._history.length) return this._state;
    return this._persist(clone(this._history[this._history.length - 1]), {undo: true});
  }

  exportJSON() { return JSON.stringify(this._state, null, 2); }

  importJSON(text, {mode = 'merge'} = {}) {
    choice(mode, ['merge', 'replace'], 'Import mode');
    const incoming = parseWorkspace(text); // All validation precedes storage writes.
    const candidate = mode === 'merge' ? mergeWorkspaces(this._state, incoming) : incoming;
    return this._persist(candidate, {recovery: mode === 'replace'});
  }
}
