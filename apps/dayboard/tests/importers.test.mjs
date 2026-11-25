import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDelimited, detectColumns, parseImportTable, parseImportText} from '../public/importers.mjs';

test('CSV and TSV preserve quoted delimiters, escaped quotes, newlines, and literal formulas', () => {
  const table = parseDelimited('\uFEFFTask ID,Task Name,Task Content,Status\r\na1,"Review, test","Line one\r\nHe said ""ready""",in progress\r\na2,"=SUM(1,2)",literal,open\r\n');
  assert.deepEqual(table.headers, ['Task ID', 'Task Name', 'Task Content', 'Status']);
  assert.equal(table.rows[0][2], 'Line one\nHe said "ready"');
  assert.equal(table.rows[1][1], '=SUM(1,2)');
  const parsed = parseImportTable(table, {scope: 'ClickUp work'});
  assert.equal(parsed.provider, 'clickup');
  assert.equal(parsed.candidates[0].notes, 'Line one\nHe said "ready"');
  assert.equal(parsed.candidates[0].status, 'doing');
  assert.equal(parsed.candidates[1].title, '=SUM(1,2)');
  assert.deepEqual(parseDelimited('Name\tNotes\nTask\t"a\tb"').rows, [['Task', 'a\tb']]);
  assert.deepEqual(parseDelimited('Name;Notes\nTask;"a;b"').rows, [['Task', 'a;b']]);
});

test('incomplete or malformed CSV fails before returning a partial import', () => {
  assert.throws(() => parseDelimited('Name,Notes\nTask,"unfinished'), /not closed/);
  assert.throws(() => parseDelimited('Name,Notes\nTask,"quoted"surprise'), /closing quote/);
  assert.throws(() => parseDelimited('Name,Notes\nTask,first,second'), /more values/);
  assert.throws(() => parseDelimited('Name\nBad\0cell'), /null character/);
});

test('ClickUp identities, owners, subtasks, original custom values, and checklist completion survive conversion', () => {
  const table = {
    headers: ['Task ID', 'Task Name', 'Status', 'Assignees', 'Parent ID', 'Checklists', 'Task Link', 'Custom risk'],
    rows: [
      ['a', 'Same title', 'in progress', 'Chris, Jamie', 'parent-4', '[{"name":"QA","items":[{"name":"Desktop","resolved":true},{"name":"Mobile","resolved":false}]}]', 'https://app.clickup.com/t/a', 'Amber'],
      ['b', 'Same title', 'done', '', '', '', 'https://app.clickup.com/t/b', 'Green'],
    ],
  };
  const result = parseImportTable(table, {provider: 'clickup', sourceName: 'work.csv', scope: 'Team work'});
  const [a, b] = result.candidates;
  assert.equal(a.source.itemId, 'a');
  assert.equal(b.source.itemId, 'b');
  assert.notEqual(a.id, b.id);
  assert.equal(a.source.scope, 'Team work');
  assert.equal(a.source.original['Import source'], 'work.csv');
  assert.equal(a.source.original['Custom risk'], 'Amber');
  assert.match(a.notes, /Chris, Jamie/);
  assert.match(a.notes, /parent-4/);
  assert.deepEqual(a.checklist.map(item => [item.text, item.done]), [['Desktop', true], ['Mobile', false]]);
  assert.ok(a.warnings.some(w => /separate task/.test(w)));
  assert.equal(b.status, 'done');
  assert.equal(parseImportTable(table, {provider: 'clickup', sourceName: 'later.csv', scope: 'Team work'}).candidates[0].source.fingerprint, a.source.fingerprint, 'download filename is not a source-content change');
  const changed = {...table, rows: table.rows.map(row => [...row])};
  changed.rows[0][2] = 'done';
  const refreshed = parseImportTable(changed, {provider: 'clickup', sourceName: 'latest.csv', scope: 'Team work'});
  assert.notEqual(refreshed.candidates[0].source.fingerprint, a.source.fingerprint);
  assert.equal(refreshed.candidates[1].source.fingerprint, b.source.fingerprint);
});

test('column mapping handles custom Monday names and preserves unmapped original values', () => {
  const result = parseImportTable({headers: ['Deliverable', 'Progress', 'Target', 'Person'], rows: [['Review mobile', 'Needs approval', '2026-12-01', 'Alex']]}, {
    provider: 'monday', columnMap: {title: 0, status: 1, due: 2, assignee: 3, priority: -1},
  });
  const task = result.candidates[0];
  assert.equal(task.title, 'Review mobile');
  assert.equal(task.status, 'inbox');
  assert.equal(task.due, '2026-12-01');
  assert.equal(task.source.original.Progress, 'Needs approval');
  assert.ok(task.warnings.some(w => /needs a mapping/.test(w)));
  assert.ok(task.warnings.some(w => /No stable item ID/.test(w)));
  assert.equal(task.source.itemId, '');
  assert.deepEqual(detectColumns(['Task Name', 'Task ID', 'Due date Text', 'Due date']), {title: 0, notes: -1, status: -1, priority: -1, due: 2, url: -1, itemId: 1, assignee: -1, parentId: -1});
});

test('partial Monday rows and repeated headings are not silently turned into tasks', () => {
  const result = parseImportTable({
    headers: ['Board title', '', ''],
    rows: [['Name', 'Status', 'Person'], ['Launch group', '', ''], ['Review mobile', 'Working on it', 'Chris'], ['Name', 'Status', 'Person'], ['', 'Stuck', 'Alex']],
  }, {provider: 'monday'});
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].kind, 'reference');
  assert.equal(result.candidates[0].selected, false);
  assert.equal(result.candidates[1].selected, true);
  assert.equal(result.candidates[1].status, 'doing');
  assert.ok(result.warnings.some(w => /no task name/.test(w)));
  assert.ok(result.warnings.some(w => /repeated heading/.test(w)));
  assert.equal(result.normalizedTable.headerRow, 2);
  assert.match(result.candidates[1].context, /row 4$/);
  const sheet = parseImportTable({headerRow: 3, headers: ['Name', 'Status'], rows: [['Mobile review', 'Done']]});
  assert.match(sheet.candidates[0].context, /row 4$/);
});

test('untrusted headings and long URLs remain inert and valid source information', () => {
  const longUrl = `https://app.clickup.com/t/item?context=${'x'.repeat(600)}`;
  const result = parseImportTable({headers: ['Task Name', '__proto__', 'constructor', 'Task Link'], rows: [['Review', 'inert', 'literal', longUrl]]});
  const task = result.candidates[0];
  assert.equal(task.source.original['Column: __proto__'], 'inert');
  assert.equal(task.source.original['Column: constructor'], 'literal');
  assert.equal(Object.getPrototypeOf(task.source.original), Object.prototype);
  assert.equal(task.source.itemId, '');
  assert.equal(task.source.url, longUrl);
});

test('date parsing keeps invalid, ambiguous, time-bearing and unsupported dates reviewable', () => {
  const table = {headers: ['Task Name', 'Due date'], rows: [['Ambiguous', '03/04/2026'], ['Impossible', '2026-02-30'], ['Named', 'December 12, 2026'], ['Timestamp', '2026-12-11T23:00:00-05:00'], ['Serial', '46000']]};
  const result = parseImportTable(table);
  assert.deepEqual(result.candidates.map(c => c.due), ['2026-03-04', '', '2026-12-12', '2026-12-11', '']);
  assert.ok(result.candidates[0].warnings.some(w => /date order/.test(w)));
  assert.ok(result.candidates[1].warnings.some(w => /could not be read/.test(w)));
  assert.ok(result.candidates[3].warnings.some(w => /timezone/.test(w)));
  assert.ok(result.candidates[4].warnings.some(w => /could not be read/.test(w)));
  assert.equal(parseImportTable(table, {dateOrder: 'dmy'}).candidates[0].due, '2026-04-03');
});

test('conversations preserve author and uncertainty instead of assigning commitments to the importer', () => {
  const result = parseImportText('Alex: I\'ll update the checklist tomorrow.\nChris: Could you review mobile onboarding once Jamie sends the mockups? We are aiming for Friday, not confirmed.\nThanks!', {provider: 'slack', sourceName: '#launch', sourceUrl: 'https://example.com/thread'});
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].source.original.author, 'Alex');
  assert.equal(result.candidates[0].selected, false);
  assert.equal(result.candidates[0].due, '');
  assert.ok(result.candidates[0].warnings.some(w => /original message date/.test(w)));
  assert.equal(result.candidates[1].status, 'waiting');
  assert.equal(result.candidates[1].selected, false);
  assert.equal(result.candidates[1].due, '');
  assert.ok(result.candidates[1].warnings.some(w => /request/.test(w)));
  assert.equal(result.candidates[0].source.itemId, '');
  assert.equal(result.candidates[1].source.itemId, '', 'shared conversation URL never identifies an extracted task');
  assert.match(result.candidates[0].context, /Jamie/);
});

test('cancellation replies deselect the preceding suggestion and preserve the evidence', () => {
  const result = parseImportText('- [ ] Update the deployment checklist\nNever mind, already handled.', {provider: 'teams'});
  assert.equal(result.candidates[0].selected, false);
  assert.ok(result.candidates[0].warnings.some(w => /later reply/.test(w)));
  assert.equal(result.candidates[1].kind, 'reference');
  assert.equal(result.candidates[1].selected, false);
  assert.match(result.candidates[0].context, /already handled/);
});

test('OneNote checkboxes retain completion while ordinary notes remain unselected context', () => {
  const result = parseImportText('Meeting notes:\nThe design guide is available in the shared folder.\n\nAction items:\n- [ ] Review layout\n- [x] Send the agenda\nMaybe we should rethink onboarding someday.', {provider: 'onenote'});
  assert.equal(result.candidates[0].kind, 'reference');
  assert.equal(result.candidates[0].selected, false);
  assert.equal(result.candidates[1].kind, 'task');
  assert.equal(result.candidates[1].selected, true);
  assert.equal(result.candidates[2].status, 'done');
  assert.equal(result.candidates[2].selected, false);
  assert.equal(result.candidates[3].status, 'someday');
  assert.equal(result.candidates[3].selected, false);
  const notes = parseImportText('Meeting notes:\n- The design guide lives in the shared folder.\n- Review the next draft.', {provider: 'onenote'});
  assert.equal(notes.candidates[0].kind, 'reference');
  assert.equal(notes.candidates[0].selected, false);
  assert.equal(notes.candidates[1].kind, 'task');
  const ambiguous = parseImportText('- Quarterly report\n- Cancel unused subscription');
  assert.equal(ambiguous.candidates[0].selected, false);
  assert.equal(ambiguous.candidates[1].selected, true);
});

test('relative dates use an explicitly supplied source date and never the import date', () => {
  const result = parseImportText('- Send review tomorrow', {referenceDate: '2026-12-31'});
  assert.equal(result.candidates[0].due, '2027-01-01');
  assert.ok(result.candidates[0].warnings.some(w => /2026-12-31/.test(w)));
  assert.throws(() => parseImportText('Review tomorrow', {referenceDate: '2026-02-30'}), /real YYYY/);
  assert.throws(() => parseImportText('Review', {sourceUrl: 'javascript:alert(1)'}), /HTTP|http/);
});

test('source and proposal limits fail loudly rather than losing records', () => {
  assert.throws(() => parseImportTable({headers: ['Name'], rows: Array.from({length: 501}, (_, i) => [`Task ${i}`])}), /more than 500/);
  assert.throws(() => parseImportText(Array.from({length: 501}, (_, i) => `- Task ${i}`).join('\n')), /more than 500/);
  assert.throws(() => parseImportTable({headers: ['Name', 'Notes'], rows: [['Task', 'x'.repeat(50001)]]}), /50?000|50000/);
  assert.throws(() => parseImportTable({headers: ['Not a title'], rows: [['Task']]}), /Choose the column/);
});
