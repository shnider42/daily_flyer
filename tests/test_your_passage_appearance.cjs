/* Appearance behavior against a real DFE export. Test-only dependency: jsdom. */
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
if (!process.argv[2]) throw new Error('Provide the path to an exported Your Passage HTML file.');
const html = fs.readFileSync(process.argv[2], 'utf8');
const appearanceKey = 'your-passage:appearance';
const noteKey = 'your-passage:v1:passage-1';
let passed = 0;
async function test(label, run) { await run(); passed += 1; console.log(`PASS: ${label}`); }
async function make({dark = false, saved = {}, blocked = false, noMedia = false} = {}) {
  const errors = [];
  const listeners = new Set();
  const media = {matches: dark, addEventListener: (_, listener) => listeners.add(listener)};
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  // Observe the actual head bootstrap before any body markup exists.
  const observed = html.replace('</head>', '<script>window.beforeBodyAppearance = document.documentElement.dataset.ypAppearance; window.bodyWasPresent = Boolean(document.getElementById("yp"));</script></head>');
  const dom = new JSDOM(observed, {url: 'https://your-passage.example/', runScripts: 'dangerously', virtualConsole,
    beforeParse(w) {
      if (!noMedia) w.matchMedia = () => media;
      if (blocked) Object.defineProperty(w, 'localStorage', {get() { throw Error('Storage unavailable'); }});
      else for (const [key, value] of Object.entries(saved)) w.localStorage.setItem(key, value);
    }
  });
  await new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  assert.deepEqual(errors, []);
  const w = dom.window;
  return {w, d: w.document, $: id => w.document.getElementById(id),
    mode: () => w.document.documentElement.dataset.ypAppearance,
    system(value) { media.matches = value; listeners.forEach(listener => listener({matches: value})); },
    close: () => w.close()};
}
(async () => {
  await test('Dark device preference applies in the head before body content exists', async () => {
    const a = await make({dark: true});
    assert.equal(a.w.beforeBodyAppearance, 'night'); assert.equal(a.w.bodyWasPresent, false);
    assert.equal(a.mode(), 'night'); assert.equal(a.$('yp-appearance').hidden, false);
    assert.equal(a.$('yp-appearance-toggle').getAttribute('aria-checked'), 'true');
    assert.equal(a.$('yp-theme-color').content, '#121e29');
    assert.equal(a.w.localStorage.length, 0); a.close();
  });
  await test('Automatic appearance follows live device changes without saving an override', async () => {
    const a = await make(); assert.equal(a.mode(), 'day');
    a.system(true); assert.equal(a.mode(), 'night');
    a.system(false); assert.equal(a.mode(), 'day');
    assert.equal(a.$('yp-appearance-system').getAttribute('aria-pressed'), 'true');
    assert.equal(a.w.localStorage.getItem(appearanceKey), null); a.close();
  });
  await test('Saved day and night preferences override the device from the first paint', async () => {
    for (const preference of ['day', 'night']) {
      const a = await make({dark: preference === 'day', saved: {[appearanceKey]: preference}});
      assert.equal(a.w.beforeBodyAppearance, preference);
      a.system(false); a.system(true); assert.equal(a.mode(), preference);
      assert.equal(a.$('yp-appearance-system').getAttribute('aria-pressed'), 'false'); a.close();
    }
  });
  await test('Toggle persists, survives reload, and leaves practice drafts and focus view intact', async () => {
    const a = await make();
    a.$('yp-plan').value = 'A draft that must survive the change.';
    a.$('yp-plan').dispatchEvent(new a.w.Event('input'));
    a.$('yp-start-practice').click(); a.$('yp-appearance-toggle').click();
    assert.equal(a.mode(), 'night'); assert.equal(a.w.localStorage.getItem(appearanceKey), 'night');
    assert.equal(a.$('yp').classList.contains('yp-focus'), true);
    assert.equal(a.$('yp-plan').value, 'A draft that must survive the change.');
    assert.equal(a.w.localStorage.getItem(noteKey), null);
    const b = await make({saved: {[appearanceKey]: a.w.localStorage.getItem(appearanceKey)}});
    assert.equal(b.mode(), 'night'); b.close();
    a.$('yp-appearance-toggle').click(); assert.equal(a.mode(), 'day');
    assert.equal(a.$('yp-theme-color').content, '#f4f6f4'); a.close();
  });
  await test('Device control clears only the appearance override and resumes automatic changes', async () => {
    const note = JSON.stringify({plan: 'Keep this saved note'});
    const a = await make({dark: true, saved: {[appearanceKey]: 'day', [noteKey]: note}});
    a.$('yp-appearance-system').click(); assert.equal(a.mode(), 'night');
    assert.equal(a.w.localStorage.getItem(appearanceKey), null);
    assert.equal(a.w.localStorage.getItem(noteKey), note);
    a.system(false); assert.equal(a.mode(), 'day'); a.close();
  });
  await test('Blocked storage permits switching for this visit and reports the save limit', async () => {
    const a = await make({dark: true, blocked: true});
    a.$('yp-appearance-toggle').click(); assert.equal(a.mode(), 'day');
    assert.match(a.$('yp-appearance-status').textContent, /could not save/);
    assert.equal(a.d.querySelector('[data-appearance-unsaved]').hidden, false);
    a.$('yp-appearance-system').click(); assert.equal(a.mode(), 'night'); a.close();
  });
  await test('Invalid saved preferences and missing media-query support have usable fallbacks', async () => {
    const a = await make({dark: true, saved: {[appearanceKey]: 'unexpected-value'}});
    assert.equal(a.mode(), 'night'); a.close();
    const b = await make({noMedia: true}); assert.equal(b.mode(), 'day');
    b.$('yp-appearance-toggle').click(); assert.equal(b.mode(), 'night'); b.close();
  });
  await test('Appearance syncs between tabs without reacting to note storage changes', async () => {
    const a = await make();
    a.w.dispatchEvent(new a.w.StorageEvent('storage', {key: appearanceKey, newValue: 'night'}));
    assert.equal(a.mode(), 'night');
    a.w.dispatchEvent(new a.w.StorageEvent('storage', {key: noteKey, newValue: 'day'}));
    assert.equal(a.mode(), 'night');
    a.w.dispatchEvent(new a.w.StorageEvent('storage', {key: appearanceKey, newValue: null}));
    assert.equal(a.mode(), 'day'); a.system(true); assert.equal(a.mode(), 'night'); a.close();
  });
  console.log(`${passed} appearance checks passed. DOM checks do not verify visual layout.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
