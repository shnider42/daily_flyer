/* DOM checks: node tests/test_your_passage_interactions.cjs <DFE HTML export>
   Test-only dependency: jsdom. No browser/runtime dependency is added to DFE. */
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
if (!process.argv[2]) throw new Error('Provide the path to an exported Your Passage HTML file.');
const html = fs.readFileSync(process.argv[2], 'utf8');
let passed = 0;
const test = (label, fn) => { fn(); passed += 1; console.log(`PASS: ${label}`); };
function make(saved = {}, blocked = false) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {url: 'https://your-passage.example/', runScripts: 'dangerously', virtualConsole,
    beforeParse(w) {
      if (blocked) Object.defineProperty(w, 'localStorage', {get() { throw Error('blocked'); }});
      else for (const [key, value] of Object.entries(saved)) w.localStorage.setItem(key, value);
      w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
      const clickAnchor = w.HTMLAnchorElement.prototype.click;
      w.HTMLAnchorElement.prototype.click = function () {
        if (this.download) w.lastDownload = this.download;
        else clickAnchor.call(this);
      };
      w.print = () => { w.printCalled = true; };
    }
  });
  assert.deepEqual(errors, []);
  return dom;
}
const dom = make(); const w = dom.window; const d = w.document; const $ = id => d.getElementById(id);
const input = (id, text) => { $(id).value = text; $(id).dispatchEvent(new w.Event('input')); };
const route = n => d.querySelector(`[data-route="${n}"]`).click();
const key = n => `your-passage:v1:passage-${n + 1}`;
const payload = JSON.parse($('yp-data').textContent);

test('Starting-point choice changes the actual exercise and preserves unsaved drafts', () => {
  route(0); input('yp-plan', 'Ask my neighbor what their workday looks like.');
  route(1); assert.equal($('yp-plan').value, '');
  assert.equal($('yp-focus-title').textContent, payload.exercises[1].short_title);
  assert.equal($('yp-read-heading').textContent, payload.exercises[1].heading);
  route(0); assert.match($('yp-plan').value, /neighbor/);
  assert.equal(w.localStorage.length, 0);
});
test('Focus view has an explicit exit and returns keyboard focus', () => {
  $('yp-start-practice').focus(); $('yp-start-practice').click();
  assert.equal($('yp').classList.contains('yp-focus'), true);
  assert.equal($('yp-exit-focus').hidden, false);
  assert.equal(d.activeElement.id, 'yp-tab-read');
  assert.equal($('yp-practice-explorer').open, true);
  $('yp-exit-focus').click();
  assert.equal($('yp').classList.contains('yp-focus'), false);
  assert.equal(d.activeElement.id, 'yp-start-practice');
});
test('Mobile menu closes on Escape and notebook links open the notebook', () => {
  // jsdom does not evaluate viewport media queries. Expose the mobile control.
  $('yp-menu-toggle').style.display = 'inline-flex';
  $('yp-menu-toggle').click(); assert.equal($('yp-menu-toggle').getAttribute('aria-expanded'), 'true');
  $('yp-menu-toggle').dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.equal($('yp-menu-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(d.activeElement.id, 'yp-menu-toggle');
  d.querySelector('[data-open-notebook]').click(); assert.equal($('notebook').open, true);
});
test('Rehearsal feedback is specific to the selected response and topic', () => {
  route(1); $('yp-response-options').children[1].click();
  assert.equal($('yp-response-feedback').hidden, false);
  assert.equal($('yp-response-feedback').textContent, payload.exercises[1].responses[1].feedback);
  route(2); assert.equal($('yp-response-feedback').hidden, true);
  route(1); assert.equal($('yp-response-options').children[1].getAttribute('aria-pressed'), 'true');
});
test('Action choices are editable; card keeps action, timing, and reflection as literal text', () => {
  $('yp-action-list').querySelector('button').click();
  assert.equal($('yp-plan').value, payload.exercises[1].steps[0]);
  input('yp-plan', '<img src=x onerror=alert(1)> Ask for a demonstration.');
  input('yp-when', 'Monday at 9am'); input('yp-reflection', 'I can ask specific questions.');
  d.querySelector('[data-complete=reflect]').click();
  assert.equal($('yp-takeaway').hidden, false);
  assert.equal(d.activeElement.id, 'yp-takeaway');
  assert.equal($('yp-takeaway-plan').textContent, $('yp-plan').value);
  assert.equal($('yp-takeaway-plan').querySelector('img'), null);
  assert.equal($('yp-takeaway-when').textContent, 'Monday at 9am');
  assert.equal(w.localStorage.length, 0);
  $('yp-print').click(); assert.equal(w.printCalled, true);
  $('yp-download').click(); assert.match(w.lastDownload, /^new-passage-passage-2-/);
});
test('Explicit saves populate notebook and survive a reload', () => {
  $('yp-save').click();
  assert.equal(JSON.parse(w.localStorage.getItem(key(1))).when, 'Monday at 9am');
  assert.equal(d.querySelector('[data-notebook-count]').textContent, '1');
  assert.equal($('yp-notebook-list').querySelectorAll('.yp-saved-passage').length, 1);
  route(3); $('yp-notebook-list').querySelector('button').click();
  assert.equal($('yp-topic').value, '1'); assert.equal($('notebook').open, false);
  const fresh = make({[key(1)]: w.localStorage.getItem(key(1))});
  fresh.window.document.querySelector('[data-route="1"]').click();
  assert.equal(fresh.window.document.getElementById('yp-when').value, 'Monday at 9am');
  fresh.window.close();
});
test('Legacy v1 notes remain readable without the newly introduced fields', () => {
  const legacy = make({[key(0)]: JSON.stringify({plan: 'My old plan', reflection: 'My old reflection', done: ['read', 'try', 'reflect'], tab: 'reflect'})});
  const ld = legacy.window.document; ld.querySelector('[data-route="0"]').click();
  assert.equal(ld.getElementById('yp-plan').value, 'My old plan');
  assert.equal(ld.getElementById('yp-when').value, '');
  assert.equal(ld.getElementById('yp-takeaway-plan').textContent, 'My old plan');
  assert.equal(ld.getElementById('yp-progress').value, 3); legacy.window.close();
});
test('Confirming clear removes only the selected save and resets the card', () => {
  route(0); $('yp-save').click(); route(1);
  $('yp-clear').click(); assert.notEqual(w.localStorage.getItem(key(1)), null);
  $('yp-clear').click(); assert.equal(w.localStorage.getItem(key(1)), null);
  assert.notEqual(w.localStorage.getItem(key(0)), null);
  assert.equal($('yp-takeaway').hidden, true); assert.equal($('yp-progress').value, 0);
});
test('Storage restrictions and corrupt notes give accurate recovery messages', () => {
  const blocked = make({}, true); blocked.window.document.getElementById('yp-save').click();
  assert.match(blocked.window.document.getElementById('yp-storage-status').textContent, /could not save/); blocked.window.close();
  const corrupt = make({[key(payload.selected)]: 'not json'});
  assert.match(corrupt.window.document.getElementById('yp-storage-status').textContent, /could not be read/); corrupt.window.close();
});
test('Tab navigation keeps only the active tab in the tab order', () => {
  $('yp-tab-read').dispatchEvent(new w.KeyboardEvent('keydown', {key: 'End', bubbles: true}));
  assert.equal(d.activeElement.id, 'yp-tab-reflect');
  assert.equal($('yp-panel-reflect').hidden, false);
  assert.equal($('yp-tab-read').tabIndex, -1);
});
dom.window.close();
console.log(`${passed} interaction checks passed. DOM checks do not verify visual layout.`);
