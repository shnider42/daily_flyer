/** Local, deterministic import readers. These produce proposals; they never save a board. */
import {safeUrl} from './model.mjs';

const MAX_CANDIDATES = 500;
const MAX_INPUT = 5 * 1024 * 1024;
const MAX_COLUMNS = 120;
const PROVIDERS = ['auto', 'clickup', 'monday', 'slack', 'teams', 'onenote', 'text', 'csv'];
const LABELS = {clickup: 'ClickUp', monday: 'Monday', slack: 'Slack', teams: 'Teams', onenote: 'OneNote', text: 'Pasted text', csv: 'Spreadsheet'};
const STATUS_MAP = new Map([
  ['inbox', 'inbox'], ['open', 'inbox'], ['new', 'inbox'], ['unassigned', 'inbox'],
  ['to do', 'next'], ['todo', 'next'], ['not started', 'next'], ['next', 'next'], ['ready', 'next'], ['ready to start', 'next'],
  ['in progress', 'doing'], ['doing', 'doing'], ['working on it', 'doing'], ['in development', 'doing'], ['active', 'doing'],
  ['waiting', 'waiting'], ['blocked', 'waiting'], ['stuck', 'waiting'], ['on hold', 'waiting'], ['pending', 'waiting'],
  ['done', 'done'], ['complete', 'done'], ['completed', 'done'], ['closed', 'done'], ['finished', 'done'],
  ['someday', 'someday'], ['backlog', 'someday'], ['idea', 'someday'], ['ideas', 'someday'],
]);
const FIELD_ALIASES = {
  title: ['task name', 'item name', 'name', 'title', 'task', 'item', 'subitems', 'subitem'],
  notes: ['task content', 'task description', 'description', 'notes', 'details'],
  status: ['status', 'task status', 'state'],
  priority: ['priority', 'task priority', 'importance'],
  due: ['due date text', 'due date', 'deadline', 'due', 'date'],
  url: ['task link', 'item link', 'task url', 'item url', 'url', 'link'],
  itemId: ['task id', 'item id', 'pulse id', 'id'],
  assignee: ['assignees', 'assignee', 'owner', 'people', 'person', 'assigned to'],
  parentId: ['parent id', 'parent task id', 'parent task', 'parent', 'parent item'],
};
const extraAliases = {
  followUp: ['follow up', 'follow up date', 'followup'],
  effort: ['time estimated text', 'estimate', 'estimated time', 'time estimated', 'time estimate'],
  checklist: ['checklists', 'checklist', 'small steps'],
  comments: ['comments', 'updates', 'update'],
  container: ['list name', 'board', 'board name', 'project', 'project name'],
  group: ['group', 'group name', 'folder name path', 'folder name', 'space name'],
  repeat: ['recurrence', 'recurring', 'repeat'],
};

function fail(message) { throw new TypeError(message); }
function key(value) { return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[_\-\/.()]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function cell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\r\n?/g, '\n');
}
function textInput(value, label, max = MAX_INPUT) {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  if (value.length > max) fail(`${label} is too large. Import a smaller selection (maximum ${Math.round(max / 1024)} KB of text).`);
  if (value.includes('\0')) fail(`${label} contains a null character. Choose a CSV, TSV, or plain-text export.`);
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}
function bounded(value, max, label) {
  const result = cell(value).trim();
  if (result.length > max) fail(`${label} is too long (maximum ${max} characters). Import a smaller selection.`);
  if (result.includes('\0')) fail(`${label} contains a null character. Choose a clean text export.`);
  return result;
}
function fingerprint(value) {
  const string = typeof value === 'string' ? value : JSON.stringify(value, Object.keys(value).sort());
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < string.length; i++) {
    a = Math.imul(a ^ string.charCodeAt(i), 16777619);
    b = Math.imul(b ^ string.charCodeAt(i), 2246822507);
  }
  return `v1-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
function requireProvider(provider) {
  if (!PROVIDERS.includes(provider)) fail('Choose a supported import source.');
  return provider;
}
function checkCount(count) {
  if (count > MAX_CANDIDATES) fail(`This selection contains more than ${MAX_CANDIDATES} items. Export or paste a smaller selection; nothing has been imported.`);
}
function originalFields(headers, row, sourceName) {
  const labels = new Set();
  const result = Object.fromEntries(headers.map((header, i) => {
    let label = ['__proto__', 'constructor', 'prototype'].includes(header) ? `Column: ${header}` : header;
    while (labels.has(label)) label += ' field';
    labels.add(label);
    return [label, bounded(row[i], 50000, `Value in “${header}”`)];
  }));
  if (sourceName) {
    let label = 'Import source';
    while (Object.hasOwn(result, label)) label += ' file';
    result[label] = sourceName;
  }
  if (JSON.stringify(result).length > 100000) fail('One row contains too much source information (maximum 100,000 characters). Import a smaller item.');
  return result;
}
function uniqueHeaders(values) {
  const used = new Set();
  return values.map((value, i) => {
    const raw = bounded(value, 180, 'Column name') || `Column ${i + 1}`;
    let label = raw, suffix = 2;
    while (used.has(label)) label = `${raw} (${suffix++})`;
    used.add(label);
    return label;
  });
}

/** Parse RFC-style quoted CSV, TSV, or semicolon-separated exports without executing formulas. */
export function parseDelimited(input) {
  const text = textInput(input, 'File');
  if (!text.trim()) fail('The file is empty.');
  const counts = new Map([[',', 0], ['\t', 0], [';', 0]]);
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quote && text[i + 1] === '"') i++;
      else quote = !quote;
    } else if (!quote && char === '\n' && [...counts.values()].some(Boolean)) break;
    else if (!quote && counts.has(char)) counts.set(char, counts.get(char) + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const matrix = [];
  let row = [], value = '', quoted = false, afterQuote = false;
  const pushCell = () => { row.push(value); value = ''; afterQuote = false; if (row.length > MAX_COLUMNS) fail(`This file has more than ${MAX_COLUMNS} columns. Export fewer columns.`); };
  const pushRow = () => {
    pushCell();
    if (row.some(v => v.trim())) matrix.push(row);
    row = [];
    if (matrix.length > 5000) fail('This file has more than 5,000 rows. Export a smaller selection.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else value += char;
      continue;
    }
    if (char === delimiter) { pushCell(); continue; }
    if (char === '\n') { pushRow(); continue; }
    if (afterQuote) {
      if (/\s/.test(char)) continue;
      fail(`Unexpected text after a closing quote near row ${matrix.length + 1}. Save the export as CSV or TSV again.`);
    }
    if (char === '"' && !value.trim()) { value = ''; quoted = true; }
    else value += char;
  }
  if (quoted) fail('A quoted field is not closed. The file may be incomplete.');
  if (value || row.length || afterQuote) pushRow();
  if (!matrix.length) fail('The file has no readable rows.');
  const headers = uniqueHeaders(matrix.shift());
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].length > headers.length && matrix[i].slice(headers.length).some(v => v.trim())) fail(`Row ${i + 2} has more values than the header. Check the export delimiter and quoted cells.`);
  }
  return {headers, rows: matrix.map(values => headers.map((_, i) => values[i] ?? ''))};
}

/** Suggested columns. A UI can override each with an index, or -1 to ignore it. */
export function detectColumns(headers, _provider = 'auto') {
  const keys = headers.map(key);
  return Object.fromEntries(Object.entries(FIELD_ALIASES).map(([field, aliases]) => {
    let index = -1;
    for (const alias of aliases) { index = keys.indexOf(alias); if (index >= 0) break; }
    return [field, index];
  }));
}
function findColumn(headers, aliases) {
  const keys = headers.map(key);
  for (const alias of aliases) { const index = keys.indexOf(alias); if (index >= 0) return index; }
  return -1;
}
export function inferStatus(value) { return STATUS_MAP.get(key(value)) || 'inbox'; }
export function inferPriority(value) {
  const normalized = key(value);
  if (/^(?:urgent|critical|highest|high|1|2)$/.test(normalized)) return 'high';
  if (/^(?:low|lowest|4)$/.test(normalized)) return 'low';
  return 'normal';
}
function isoDate(year, month, day) {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function readDate(value, {dateOrder = 'mdy', referenceDate = ''} = {}) {
  const raw = cell(value).trim(), warnings = [];
  if (!raw || /^(?:none|n\/a|null|—|-|0)$/i.test(raw)) return {date: '', warnings};
  let date = '', match;
  if (/\b(?:maybe|tentative|aim(?:ing)?|target|unconfirmed|not confirmed|hopefully|possibly)\b/i.test(raw)) return {date: '', warnings: [`Tentative date “${raw}” needs confirmation.`]};
  if ((match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/))) {
    date = isoDate(+match[1], +match[2], +match[3]);
    if (raw.length > 10) warnings.push('Only the calendar date is imported; the original time and timezone remain in source details.');
  } else if ((match = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/))) {
    const a = +match[1], b = +match[2], year = +match[3];
    const order = dateOrder === 'dmy' ? 'dmy' : 'mdy';
    date = order === 'dmy' ? isoDate(year, b, a) : isoDate(year, a, b);
    if (a <= 12 && b <= 12 && a !== b) warnings.push(`“${raw}” was read as ${order === 'dmy' ? 'day/month/year' : 'month/day/year'}; verify the date order.`);
  } else if ((match = raw.match(/^(\d{1,2})\s+([a-z]+)\.?[,]?\s+(\d{4})$/i)) || (match = raw.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/i))) {
    const numericFirst = /^\d/.test(raw), monthWord = (numericFirst ? match[2] : match[1]).toLowerCase();
    const month = MONTHS.findIndex(name => name === monthWord || name.slice(0, 3) === monthWord) + 1;
    date = isoDate(+match[3], month, +(numericFirst ? match[1] : match[2]));
  } else if (/^\d{10}(?:\d{3})?$/.test(raw)) {
    const instant = new Date(Number(raw) * (raw.length === 10 ? 1000 : 1));
    if (Number.isFinite(instant.getTime())) date = instant.toISOString().slice(0, 10);
    warnings.push('A timestamp was converted to a UTC date; verify the source timezone.');
  } else if (/^(?:today|tomorrow|yesterday)$/i.test(raw)) {
    if (referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) && isoDate(...referenceDate.split('-').map(Number))) {
      const value = new Date(`${referenceDate}T00:00:00Z`);
      value.setUTCDate(value.getUTCDate() + ({today: 0, tomorrow: 1, yesterday: -1})[raw.toLowerCase()]);
      date = value.toISOString().slice(0, 10);
      warnings.push(`“${raw}” uses the source date ${referenceDate}; verify this was the message date.`);
    } else warnings.push(`“${raw}” needs the original message date; no deadline was guessed.`);
  }
  if (!date && !warnings.length) warnings.push(`Date “${raw}” could not be read reliably; choose it in the preview.`);
  return {date, warnings};
}
function readEffort(raw, warnings) {
  const text = cell(raw).trim();
  if (!text) return 0;
  let minutes = 0, match;
  if ((match = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)$/i))) minutes = +match[1];
  else if ((match = text.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)$/i))) minutes = +match[1] * 60;
  if ([15, 30, 60, 90].includes(minutes)) return minutes;
  warnings.push(`Estimate “${text}” is kept in source details; choose a Dayboard estimate if needed.`);
  return 0;
}
function readChecklist(raw, rowKey, warnings) {
  const value = cell(raw).trim();
  if (!value) return [];
  let entries;
  try {
    const decoded = JSON.parse(value);
    const lists = Array.isArray(decoded) ? decoded : decoded && Array.isArray(decoded.checklists) ? decoded.checklists : [decoded];
    entries = lists.flatMap(item => item && Array.isArray(item.items) ? item.items : [item]);
    if (entries.some(item => !(typeof item === 'string' || item && typeof item === 'object' && (item.name || item.text)))) entries = undefined;
  } catch { /* A plain-text checklist is also useful. */ }
  if (!entries) entries = value.split('\n').filter(line => line.trim());
  if (entries.length > 500) fail('A task has more than 500 checklist steps. Import a smaller checklist.');
  return entries.map((item, i) => {
    const text = typeof item === 'string' ? item : cell(item.name || item.text);
    const done = typeof item === 'object' ? item.resolved === true || item.done === true || item.completed === true : /^\s*(?:[-*•]\s*)?(?:\[[xX]\]|☑|✅)/.test(text);
    const stripped = text.replace(/^\s*(?:[-*•]\s*)?(?:\[[ xX]\]|☐|☑|✅)\s*/, '').trim();
    if (stripped.length > 2000) fail('A checklist step is longer than 2,000 characters. Shorten that step before importing.');
    return {id: `step-${fingerprint(`${rowKey}:${i}:${stripped}`)}`, text: stripped, done};
  }).filter(item => item.text);
}
function recognizedHeader(row) {
  const detected = detectColumns(row);
  return detected.title >= 0 && Object.values(detected).filter(index => index >= 0).length >= 2;
}

/** Map task exports to editable proposals while retaining original fields. */
export function parseImportTable(table, options = {}) {
  const {provider: requested = 'auto', sourceName = '', scope = '', dateOrder = 'mdy', columnMap = {}} = options;
  requireProvider(requested);
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) fail('The spreadsheet has no readable table.');
  if (table.headers.length > MAX_COLUMNS) fail(`Import at most ${MAX_COLUMNS} columns at a time.`);
  if (table.rows.length > 5000) fail('Import fewer than 5,000 source rows at a time.');
  const warnings = [...(table.warnings || [])], candidates = [], statuses = new Set();
  let headers = uniqueHeaders(table.headers), rows = table.rows;
  let headerRow = Number.isSafeInteger(table.headerRow) && table.headerRow > 0 ? table.headerRow : 1;
  if (detectColumns(headers).title < 0 && (columnMap.title === undefined || columnMap.title === '')) {
    const index = rows.slice(0, 25).findIndex(row => Array.isArray(row) && recognizedHeader(row));
    if (index >= 0) { headers = uniqueHeaders(rows[index]); rows = rows.slice(index + 1); headerRow += index + 1; warnings.push('Introductory rows were skipped before the task-column headings.'); }
  }
  const provider = requested === 'auto' ? (headers.some(h => key(h) === 'task id' || key(h) === 'task name') ? 'clickup' : headers.some(h => /^(?:subitems|item id|pulse id|people|person)$/.test(key(h))) ? 'monday' : 'csv') : requested;
  const columns = detectColumns(headers, provider);
  for (const [field, index] of Object.entries(columnMap)) {
    if (!Object.hasOwn(FIELD_ALIASES, field) || index === undefined || index === '') continue;
    if (!Number.isInteger(index) || index < -1 || index >= headers.length) fail(`Choose a valid column for ${field}.`);
    columns[field] = index;
  }
  if (columns.title < 0) fail('Choose the column containing task or item names. Common headings are Task Name, Name, Item, or Title.');
  const extra = Object.fromEntries(Object.entries(extraAliases).map(([name, aliases]) => [name, findColumn(headers, aliases)]));
  const sourceScope = bounded(scope || sourceName, 500, 'Source name');
  const fileName = bounded(sourceName, 500, 'Filename');
  let emptyRows = 0, repeatedHeaders = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const rowNumber = headerRow + rowIndex + 1;
    if (!Array.isArray(rows[rowIndex])) fail(`Row ${rowNumber} is not a readable spreadsheet row.`);
    const row = rows[rowIndex].map(cell);
    if (!row.some(v => v.trim())) { emptyRows++; continue; }
    if (row.length > headers.length && row.slice(headers.length).some(v => v.trim())) fail(`Row ${rowNumber} has data beyond the mapped columns. Check the sheet's headings.`);
    if (recognizedHeader(row) && FIELD_ALIASES.title.includes(key(row[columns.title]))) { repeatedHeaders++; continue; }
    const get = field => columns[field] >= 0 ? (row[columns[field]] || '').trim() : '';
    const more = field => extra[field] >= 0 ? (row[extra[field]] || '').trim() : '';
    const rawTitle = get('title');
    if (!rawTitle) { warnings.push(`Row ${rowNumber} has no task name and was skipped.`); continue; }
    const rowWarnings = [], originalStatus = get('status');
    if (originalStatus) statuses.add(originalStatus);
    if (originalStatus && !STATUS_MAP.has(key(originalStatus))) rowWarnings.push(`Status “${originalStatus}” needs a mapping; proposed Inbox.`);
    const original = originalFields(headers, row, fileName);
    const sourceValues = originalFields(headers, row, '');
    const sourceFingerprint = fingerprint(sourceValues);
    const candidateId = `row-${rowIndex + 1}-${sourceFingerprint}`;
    const rawUrl = get('url'), parsedUrl = safeUrl(rawUrl), url = parsedUrl.length <= 4096 ? parsedUrl : '';
    if (rawUrl && !url) rowWarnings.push('The source link is invalid or longer than 4,096 characters; its text is preserved in source details.');
    let itemId = bounded(get('itemId'), 500, 'Source task ID');
    if (!itemId && url && url.length <= 500 && ((provider === 'clickup' && /(?:^|\.)clickup\.com$/i.test(new URL(url).hostname) && /\/(?:t|task)\//.test(new URL(url).pathname)) || (provider === 'monday' && /(?:^|\.)monday\.com$/i.test(new URL(url).hostname) && /\/(?:pulses|items)\//.test(new URL(url).pathname)))) itemId = url;
    if (!itemId) rowWarnings.push('No stable item ID was supplied; repeat imports can only suggest possible matches.');
    const due = readDate(get('due'), {dateOrder}), followUp = readDate(more('followUp'), {dateOrder});
    rowWarnings.push(...due.warnings, ...followUp.warnings.map(warning => `Follow-up: ${warning}`));
    if (get('due') && columns.due >= 0 && key(headers[columns.due]) === 'date') rowWarnings.push('The “Date” column is proposed as a due date; verify what this column means.');
    const nameOnly = row.filter(v => v.trim()).length === 1 && headers.length > 1;
    const canceled = /^(?:cancelled|canceled|won['’]?t do)$/i.test(originalStatus);
    if (nameOnly) rowWarnings.push('This row contains only a name; it may be a group heading rather than a task.');
    if (canceled) rowWarnings.push('The source marks this item canceled. It starts unchecked; choose its status if you want to keep it.');
    if (rawTitle.length > 500) rowWarnings.push('The title was shortened to 500 characters; its full text is in source details.');
    if (get('parentId')) rowWarnings.push('This subtask stays a separate task; its original parent is preserved in source details.');
    if (more('repeat')) rowWarnings.push('The recurrence is preserved as source information; repeating tasks are not activated by importing.');
    const parts = [];
    if (get('notes')) parts.push(get('notes'));
    if (get('assignee')) parts.push(`Source assignee: ${get('assignee')}`);
    if (get('parentId')) parts.push(`Source parent: ${get('parentId')}`);
    if (more('container')) parts.push(`Source project/list: ${more('container')}`);
    if (more('group')) parts.push(`Source group/folder: ${more('group')}`);
    if (more('comments')) parts.push(`Source comments/updates:\n${more('comments')}`);
    const notes = parts.join('\n\n');
    if (notes.length > 18000) rowWarnings.push('The notes preview is shortened; full original fields are retained in source details.');
    candidates.push({
      id: candidateId, selected: !nameOnly && !canceled, title: rawTitle.slice(0, 500),
      notes: notes.length > 18000 ? `${notes.slice(0, 17900)}\n\n[Continued in original source fields.]` : notes,
      status: inferStatus(originalStatus), originalStatus, priority: inferPriority(get('priority')),
      due: due.date, followUp: followUp.date, effort: readEffort(more('effort'), rowWarnings),
      checklist: readChecklist(more('checklist'), candidateId, rowWarnings), url,
      source: {provider, scope: sourceScope, itemId, url, fingerprint: sourceFingerprint, original},
      warnings: rowWarnings, kind: nameOnly ? 'reference' : 'task',
      context: `${LABELS[provider] || provider}${fileName ? ` · ${fileName}` : ''} · row ${rowNumber}`,
    });
    checkCount(candidates.length);
  }
  if (emptyRows) warnings.push(`${emptyRows} empty ${emptyRows === 1 ? 'row was' : 'rows were'} skipped.`);
  if (repeatedHeaders) warnings.push(`${repeatedHeaders} repeated heading ${repeatedHeaders === 1 ? 'row was' : 'rows were'} skipped.`);
  if (!candidates.length) fail('No task names were found in this selection. Choose a different sheet or name column.');
  return {provider, candidates, warnings, statuses: [...statuses], headers, columns, normalizedTable: {headers, rows, headerRow}};
}

const ACTION = /^(?:(?:please|kindly)\s+)?(?:review|check|send|write|update|fix|test|call|email|schedule|book|prepare|create|finish|complete|follow up|confirm|investigate|deploy|publish|add|remove|resolve|share|draft|read|renew|pay|buy|submit|ask|contact|meet|order|compare|verify|document|organize|set up|look into|look at|respond|reply|take|make|cancel)\b/i;
const REQUEST = /\b(?:can|could|would|will)\s+you\b|\b(?:need|needs)\s+to\b|\baction\s+item\b/i;
const COMMITMENT = /\bI(?:'|’)ll\b|\bI\s+will\b|\bwe(?:'|’)ll\b|\bwe\s+will\b/i;
const IDEA = /\b(?:maybe|perhaps|someday|consider|we should|we could|could try|might be worth|possible idea)\b/i;
const CANCELED = /\b(?:never\s*mind|no longer needed|already (?:handled|done|fixed|completed)|(?:it|that|this)\s+(?:is|was)\s+(?:done|fixed|completed)|cancelled|canceled|no need to|(?:do not|don't|don’t) need to)\b/i;
const ACK = /^(?:thanks|thank you|thx|ok(?:ay)?|got it|sounds good|agreed|yes|no|great|perfect|will do|👍|✅)[.!\s]*$/i;
const HEADING = /^(?:action items?|actions?|to[ -]?do|tasks?|notes?|meeting notes?|decisions?|references?|context|ideas?|next steps?)\s*:?[\s]*$/i;
function messageLine(line) {
  let content = line.trim(), author = '';
  content = content.replace(/^\[\d{1,4}[^\]]{0,40}\]\s*/, '');
  const match = content.match(/^([\p{L}][\p{L}\p{N} ._'’-]{0,39}):\s+(.+)$/u);
  if (match && !/^(?:action|todo|task|note|idea|deadline|due|status|https?|reference|context|decision)$/i.test(match[1])) { author = match[1].trim(); content = match[2]; }
  const box = content.match(/^\s*(?:[-*+•]\s*|\d+[.)]\s*)?(?:\[([ xX])\]|(☐|☑|✅))\s*/);
  const bullet = /^\s*(?:[-*+•]\s+|\d+[.)]\s+)/.test(content);
  const checkbox = Boolean(box), completed = box ? /[xX]/.test(box[1] || '') || /☑|✅/.test(box[2] || '') : false;
  content = box ? content.slice(box[0].length) : content.replace(/^\s*(?:[-*+•]\s+|\d+[.)]\s+)/, '');
  const explicit = /^(?:todo|to-do|action(?: item)?|task):\s*/i.test(content);
  content = content.replace(/^(?:todo|to-do|action(?: item)?|task):\s*/i, '').trim();
  return {content, author, checkbox, completed, bullet, explicit};
}
function proseDate(content, options) {
  const match = content.match(/\b(?:due(?:\s+on)?|by|deadline(?:\s+is)?|on)\s+((?:\d{4}-\d{2}-\d{2})|(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})|(?:today|tomorrow|yesterday)|(?:(?:next\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)))\b/i)
    || content.match(/\b(today|tomorrow|yesterday)\b/i);
  if (!match) return {date: '', warnings: []};
  if (/\b(?:tentative|aiming|target|unconfirmed|not confirmed|hopefully|possibly|maybe)\b/i.test(content)) return {date: '', warnings: [`“${match[1]}” is a tentative target; confirm a due date.`]};
  return readDate(match[1], options);
}

/** Conservative prose extraction; original wording remains available for every proposal. */
export function parseImportText(input, options = {}) {
  const {provider: requested = 'text', sourceName = '', scope = '', sourceUrl = '', referenceDate = '', dateOrder = 'mdy'} = options;
  requireProvider(requested);
  const provider = requested === 'auto' ? 'text' : requested;
  const text = textInput(input, 'Pasted text', 100000).trim();
  if (!text) fail('Paste a conversation, note, or task list first.');
  const sourceScope = bounded(scope || sourceName, 500, 'Source name');
  const fileName = bounded(sourceName, 500, 'Source label');
  const url = safeUrl(sourceUrl);
  if (sourceUrl && !url) fail('The source link must be an absolute http:// or https:// URL.');
  if (url.length > 4096) fail('The source link is longer than 4,096 characters. Use a shorter link.');
  if (referenceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || !isoDate(...referenceDate.split('-').map(Number)))) fail('The original message date must be a real YYYY-MM-DD date.');
  const lines = text.split('\n'), candidates = [], warnings = ['These are local text suggestions. Review the original wording, person, status, and dates before importing.'];
  let heading = '', skipped = 0, paragraph = 0;
  const actionByParagraph = new Map();
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw) { paragraph++; continue; }
    const parsed = messageLine(raw), content = parsed.content;
    if (!content || ACK.test(content)) { skipped++; continue; }
    if (HEADING.test(content)) { heading = content.replace(/:$/, ''); continue; }
    const rowWarnings = [];
    const canceled = CANCELED.test(content);
    const idea = IDEA.test(content);
    const request = REQUEST.test(content);
    const commitment = COMMITMENT.test(content);
    const waiting = /\b(?:waiting (?:for|on)|blocked (?:by|until)|once .{1,100}(?:sends?|provides?|approves?)|after .{1,100}(?:sends?|provides?|approves?))\b/i.test(content);
    const taskHeading = /^(?:action|to[ -]?do|task|next step)/i.test(heading);
    const referenceHeading = /(?:^|\s)(?:notes?|references?|context|decisions?)$/i.test(heading);
    const clearAction = ACTION.test(content) || request || commitment || waiting;
    const ambiguousBullet = parsed.bullet && !clearAction && !parsed.checkbox && !parsed.explicit && !taskHeading;
    const action = parsed.checkbox || parsed.explicit || clearAction || (taskHeading || parsed.bullet && !referenceHeading);
    let kind = action && !canceled ? 'task' : 'reference';
    let status = parsed.completed || canceled ? 'done' : idea ? 'someday' : waiting ? 'waiting' : 'inbox';
    let selected = kind === 'task' && (parsed.checkbox || parsed.explicit || parsed.bullet && !ambiguousBullet) && !parsed.completed && !idea && !request;
    if (request) rowWarnings.push('This reads as a request; confirm whether it is your task and whether it was accepted.');
    if (commitment) rowWarnings.push(parsed.author ? `The commitment was written by ${parsed.author}; it is not automatically assigned to you.` : 'The person making this commitment is unknown; confirm who owns it.');
    if (idea) { rowWarnings.push('This may be an idea rather than a commitment; proposed Someday.'); selected = false; }
    if (waiting) rowWarnings.push('A dependency is mentioned; confirm that the work is still waiting.');
    if (ambiguousBullet && kind === 'task') rowWarnings.push('A bullet can be a task or a note; confirm that this item needs action.');
    if (parsed.completed) rowWarnings.push('This checkbox is already complete.');
    if (canceled) {
      rowWarnings.push('This passage describes canceled or completed work; no new active task is proposed.');
      const previous = actionByParagraph.get(paragraph);
      if (previous && index - previous.line <= 3) {
        previous.candidate.selected = false;
        previous.candidate.warnings.push('A later reply may resolve or cancel this request. Check the source before adding it.');
      }
    }
    if (kind === 'reference') rowWarnings.push('Reference/context only. Leave unchecked unless you want to make a task from it.');
    const due = kind === 'task' ? proseDate(content, {referenceDate, dateOrder}) : {date: '', warnings: []};
    rowWarnings.push(...due.warnings);
    let start = index, end = index;
    while (start > 0 && index - start < 4 && lines[start - 1].trim()) start--;
    while (end + 1 < lines.length && end - index < 4 && lines[end + 1].trim()) end++;
    let context = lines.slice(start, end + 1).join('\n');
    if (context.length > 20000) {
      context = raw;
      rowWarnings.push('Surrounding context is large; only this passage is retained. Review the complete pasted source above.');
    }
    if (context.length > 50000) fail('A pasted paragraph is longer than 50,000 characters. Import a smaller selection.');
    if (content.length > 500) rowWarnings.push('The title is shortened; the complete passage remains in source details.');
    const original = {text: raw, context, author: parsed.author, heading, sourceDate: referenceDate, sourceName: fileName};
    if (JSON.stringify(original).length > 100000) fail('A pasted paragraph contains too much source information. Import a smaller selection.');
    const sourceFingerprint = fingerprint({text: raw, context, author: parsed.author, heading});
    const candidate = {
      id: `text-${index + 1}-${sourceFingerprint}`, selected, title: content.slice(0, 500),
      notes: `${parsed.author ? `Source author: ${parsed.author}\n\n` : ''}${heading ? `${heading}\n\n` : ''}Original passage:\n${raw.length > 17000 ? `${raw.slice(0, 16900)}\n[Continued in source details.]` : raw}`,
      status, originalStatus: parsed.checkbox ? (parsed.completed ? 'Checked' : 'Unchecked') : '',
      priority: 'normal', due: due.date, followUp: '', effort: 0, checklist: [], url,
      source: {provider, scope: sourceScope, itemId: '', url, fingerprint: sourceFingerprint, original},
      warnings: rowWarnings, kind, context,
    };
    candidates.push(candidate);
    if (kind === 'task') actionByParagraph.set(paragraph, {candidate, line: index});
    checkCount(candidates.length);
  }
  if (skipped) warnings.push(`${skipped} empty or acknowledgment ${skipped === 1 ? 'line was' : 'lines were'} skipped.`);
  if (!candidates.length) fail('No actions or reference passages were found. Paste a fuller note or conversation.');
  if (candidates.some(candidate => candidate.kind === 'reference')) warnings.push('Reference passages start unchecked. They are not automatically turned into work.');
  return {provider, candidates, warnings, statuses: [...new Set(candidates.map(candidate => candidate.originalStatus).filter(Boolean))]};
}
