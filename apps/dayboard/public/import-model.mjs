import {makeTask, safeUrl, STATUSES} from './model.mjs';

const IMPORT_FIELDS = ['title', 'notes', 'status', 'priority', 'due', 'followUp', 'effort', 'checklist', 'url'];
const MAX_CANDIDATES = 500;
const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// A deterministic change marker, not an authentication or security primitive.
function fingerprint(value) {
  const text = canonical(value);
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function fieldValue(task, key) {
  // A parser may regenerate checklist row IDs without changing the content.
  return key === 'checklist' ? (task.checklist || []).map(item => ({text: item.text, done: item.done})) : task[key];
}

function baseline(task) {
  return Object.fromEntries(IMPORT_FIELDS.map(key => [key, fingerprint(fieldValue(task, key))]));
}

function localChanges(task) {
  return IMPORT_FIELDS.filter(key => task.source?.baseline?.[key] !== fingerprint(fieldValue(task, key)));
}

function candidatesList(candidates) {
  if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES) throw new TypeError(`Review at most ${MAX_CANDIDATES} items in one import.`);
  for (const candidate of candidates) if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new TypeError('Every proposed import must be an item.');
  return candidates;
}

/** A conversation/page URL alone does not identify each action extracted from it. */
export function importSourceKey(source) {
  if (!source || typeof source.provider !== 'string') return '';
  const provider = source.provider.trim().toLowerCase();
  const scope = typeof source.scope === 'string' ? source.scope.trim() : '';
  const itemId = typeof source.itemId === 'string' ? source.itemId.trim() : '';
  if (itemId) return JSON.stringify([provider, scope, 'id', itemId]);
  const url = safeUrl(source.url || '');
  if (!url) return '';
  const parsed = new URL(url);
  const taskURL = provider === 'clickup' && /(^|\.)clickup\.com$/i.test(parsed.hostname) && /^\/t\/[^/]+/.test(parsed.pathname);
  const mondayURL = provider === 'monday' && /(^|\.)monday\.com$/i.test(parsed.hostname) && /\/boards\/\d+\/(?:pulses|items)\/\d+/.test(parsed.pathname);
  return taskURL || mondayURL ? JSON.stringify([provider, scope, 'url', url]) : '';
}

function titleKey(title) { return String(title || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); }

/**
 * Suggest matches without modifying the workspace. No timestamp or title alone
 * permits an overwrite. Every existing item defaults to Skip.
 */
export function reviewImport(state, candidates, defaults = {}) {
  if (!state || !Array.isArray(state.tasks)) throw new TypeError('The current board is unavailable.');
  candidatesList(candidates);
  const exact = new Map(), titles = new Map(), seen = new Map();
  for (const task of state.tasks) {
    const key = importSourceKey(task.source);
    if (key) exact.set(key, [...(exact.get(key) || []), task]);
    const title = titleKey(task.title);
    if (title) titles.set(title, [...(titles.get(title) || []), task]);
  }
  return candidates.map((input, index) => {
    const candidate = clone(input);
    candidate.id = candidate.id || `proposal-${index + 1}`;
    candidate.warnings = Array.isArray(candidate.warnings) ? candidate.warnings.slice() : [];
    const key = importSourceKey(candidate.source);
    const matches = key ? exact.get(key) || [] : [];
    const possible = matches.length ? [] : titles.get(titleKey(candidate.title)) || [];
    const existing = matches.length === 1 ? matches[0] : possible.length === 1 ? possible[0] : null;
    const conflictFields = matches.length === 1 ? localChanges(existing) : [];
    let matchType = 'new';
    if (matches.length === 1) {
      const incomingFingerprint = candidate.source?.fingerprint || fingerprint(candidate.source?.original || {});
      matchType = incomingFingerprint === existing.source.fingerprint ? 'unchanged' : conflictFields.length ? 'conflict' : 'changed';
    } else if (matches.length > 1) {
      matchType = 'conflict';
      candidate.warnings.push('More than one saved task has this source identity. Review those tasks before updating.');
    } else if (possible.length) {
      matchType = 'possible';
      candidate.warnings.push('A task has the same title. This is only a possible match; creating it will add a separate task.');
    }
    const duplicateOf = key ? seen.get(key) || '' : '';
    if (duplicateOf) candidate.warnings.push('This source item also appears earlier in this import. Only one copy can be imported.');
    else if (key) seen.set(key, candidate.id);
    const automaticallySelected = matchType === 'new' && candidate.kind !== 'reference' && !duplicateOf && candidate.selected !== false;
    return {
      ...defaults,
      ...candidate,
      matchType,
      existingId: existing?.id || '',
      existingUpdatedAt: existing?.updatedAt || '',
      reviewedTaskFingerprint: existing ? fingerprint(existing) : '',
      matchedTaskTitle: existing?.title || (matches.length > 1 ? `${matches.length} matching tasks` : ''),
      conflictFields,
      duplicateOf,
      selected: automaticallySelected,
      action: automaticallySelected ? 'create' : 'skip',
    };
  });
}

function incomingFields(candidate, statusMap) {
  const status = candidate.statusOverride ?? (own(statusMap, candidate.originalStatus || '') ? statusMap[candidate.originalStatus || ''] : candidate.status || 'inbox');
  if (!STATUSES.includes(status)) throw new TypeError(`Choose a valid Dayboard status for “${candidate.title || 'this item'}”.`);
  return {
    title: candidate.title,
    notes: candidate.notes || '',
    status,
    priority: candidate.priority || 'normal',
    due: candidate.due || '',
    followUp: candidate.followUp || '',
    effort: candidate.effort ?? 0,
    checklist: candidate.checklist || [],
    url: candidate.url || '',
  };
}

/**
 * Apply a reviewed batch inside one BoardStore.commit. The store makes the
 * complete batch durable and undoable together. Selected updates are explicit;
 * only exact source identities can update, and stale previews are rejected.
 */
export function applyImport(state, candidates, {area, projectId = '', statusMap = {}, now} = {}) {
  if (!state || !Array.isArray(state.tasks) || !Array.isArray(state.areas)) throw new TypeError('The current board is unavailable.');
  candidatesList(candidates);
  if (!state.areas.some(item => item.id === area)) throw new TypeError('Choose an area that exists in this board.');
  const project = projectId ? state.projects.find(item => item.id === projectId && !item.archived) : null;
  if (projectId && (!project || project.area !== area)) throw new TypeError('Choose a project in the selected area.');
  const stamp = new Date(now === undefined ? Date.now() : now).toISOString();
  const result = {created: 0, updated: 0, skipped: 0};
  const seen = new Set();
  let number = Math.max(0, ...state.tasks.map(task => task.number)) + 1;
  let order = Math.max(0, ...state.tasks.map(task => task.order)) + 1;
  for (const candidate of candidates) {
    if (!candidate.selected || candidate.action === 'skip') { result.skipped++; continue; }
    const action = candidate.action || (candidate.matchType === 'new' ? 'create' : 'skip');
    if (action === 'skip') { result.skipped++; continue; }
    if (!['create', 'update'].includes(action)) throw new TypeError('Choose Create, Update, or Skip for each selected item.');
    const key = importSourceKey(candidate.source);
    if (key && seen.has(key)) { result.skipped++; continue; }
    if (key) seen.add(key);
    const matches = key ? state.tasks.filter(task => importSourceKey(task.source) === key) : [];
    let existing = null;
    if (action === 'update') {
      if (!key || matches.length !== 1 || matches[0].id !== candidate.existingId) throw new Error('This item no longer has a unique source match. Review the import again.');
      existing = matches[0];
      if (!candidate.reviewedTaskFingerprint || candidate.reviewedTaskFingerprint !== fingerprint(existing)) throw new Error(`“${existing.title}” changed after the preview. Review the import again before updating it.`);
    } else if (matches.length) {
      throw new Error(`“${candidate.title}” was already imported. Review its existing task instead of adding a duplicate.`);
    }
    const fields = incomingFields(candidate, statusMap);
    // Validation also prevents unsafe URLs, oversized fields and invalid dates.
    const proposed = makeTask({...fields, area: existing?.area || area, projectId: existing?.projectId || projectId}, stamp);
    const rawSource = candidate.source || {provider: 'text', scope: '', itemId: '', url: '', original: {Text: candidate.context || candidate.notes || candidate.title}};
    const source = {
      provider: rawSource.provider || 'text',
      scope: rawSource.scope || '',
      itemId: rawSource.itemId || '',
      url: rawSource.url || '',
      fingerprint: rawSource.fingerprint || fingerprint(rawSource.original || {}),
      original: rawSource.original || {},
      importedAt: stamp,
      baseline: baseline(proposed),
    };
    if (existing) {
      const preserveNotes = existing.source?.baseline?.notes !== fingerprint(existing.notes);
      const updated = makeTask({
        ...existing,
        ...fields,
        notes: preserveNotes ? existing.notes : fields.notes,
        source,
        updatedAt: stamp,
        starter: false,
        today: ['done', 'someday'].includes(fields.status) ? false : existing.today,
        completedAt: fields.status === 'done' && existing.status === 'done' ? existing.completedAt : null,
      }, stamp);
      state.tasks[state.tasks.indexOf(existing)] = updated;
      result.updated++;
    } else {
      state.tasks.push(makeTask({
        ...proposed,
        number: number++,
        order: order++,
        source,
        today: false,
        repeat: 'none',
        starter: false,
        completedAt: null,
      }, stamp));
      result.created++;
    }
  }
  if (result.created || result.updated) state.schemaVersion = 3;
  return result;
}
