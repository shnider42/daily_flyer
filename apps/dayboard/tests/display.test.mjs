import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPLAY_KEY, DISPLAY_DEFAULTS, AREA_PALETTE,
  readDisplayPreferences, normalizeDisplayPreferences,
  applyDisplayPreferences, areaDisplayColor, applyAreaColors,
} from '../public/display.mjs';

function savedPreferences(value) {
  return {getItem: key => {
    assert.equal(key, DISPLAY_KEY);
    return JSON.stringify(value);
  }};
}

test('new display preferences use the recommended appearance and independent mutable copies', () => {
  const first = readDisplayPreferences(savedPreferences(null));
  const second = readDisplayPreferences(savedPreferences(null));
  assert.deepEqual(first, DISPLAY_DEFAULTS);
  assert.equal(first.contrast, 'balanced');
  assert.equal(first.urgencyLabels, 'shown');
  first.areaColors.career = '#123456';
  assert.deepEqual(second.areaColors, {});
  assert.deepEqual(DISPLAY_DEFAULTS.areaColors, {});
  assert.ok(Object.isFrozen(DISPLAY_DEFAULTS.areaColors));
});

test('existing text and contrast choices survive addition of color preferences', () => {
  for (const contrast of ['standard', 'strong']) {
    const result = readDisplayPreferences(savedPreferences({textSize: 'largest', contrast}));
    assert.equal(result.textSize, 'largest');
    assert.equal(result.contrast, contrast);
    assert.equal(result.tint, 'medium');
    assert.equal(result.urgency, 'standard');
    assert.deepEqual(result.areaColors, {});
  }
});

test('unavailable or malformed storage falls back without touching saved workspace data', () => {
  const board = '{"tasks":[{"title":"Keep this exact record"}]}';
  for (const display of [null, '{broken', '[]', 'false', '42', '"strong"']) {
    const values = new Map([['dfe.dayboard.v1', board], [DISPLAY_KEY, display]]);
    const reads = [];
    const result = readDisplayPreferences({
      getItem(key) { reads.push(key); return values.get(key); },
      setItem() { assert.fail('Reading display preferences must not write to storage.'); },
    });
    assert.deepEqual(result, DISPLAY_DEFAULTS);
    assert.deepEqual(reads, [DISPLAY_KEY]);
    assert.equal(values.get('dfe.dayboard.v1'), board);
  }
  assert.deepEqual(readDisplayPreferences({getItem() { throw new Error('Storage denied'); }}), DISPLAY_DEFAULTS);
});

test('invalid choices, CSS injection, and inherited overrides cannot enter display preferences', () => {
  const colors = JSON.parse('{"career":"#A1B2C3","life":"red;display:none","dfe":"#abc","__proto__":{"polluted":true},"all":"#123456","bad id":"#123456","constructor":"#abcdef"}');
  const result = normalizeDisplayPreferences({
    textSize: 'tiny', contrast: 'neon', tint: 'rich', urgency: 'prominent', urgencyLabels: false,
    areaColors: colors, unrelated: 'drop me',
  });
  assert.deepEqual(result, {
    textSize: 'larger', contrast: 'balanced', tint: 'rich', urgency: 'prominent', urgencyLabels: 'shown',
    areaColors: {career: '#a1b2c3', constructor: '#abcdef'},
  });
  assert.equal(Object.getPrototypeOf(result.areaColors), Object.prototype);
  assert.equal({}.polluted, undefined);
  const inherited = Object.create({career: '#123456'});
  assert.deepEqual(normalizeDisplayPreferences({areaColors: inherited}).areaColors, {});
  assert.deepEqual(normalizeDisplayPreferences(Object.create({areaColors: {career: '#123456'}})).areaColors, {});
  assert.equal(areaDisplayColor({id: 'career', color: 'blue'}, {areaColors: inherited}), AREA_PALETTE.blue);
  assert.equal(areaDisplayColor({id: 'career', color: 'constructor'}), AREA_PALETTE.slate);
});

test('recommended DFE and custom colors remain independent of saved area records and names', () => {
  const area = Object.freeze({id: 'dfe', name: 'DailyFlyer', color: 'amber'});
  assert.equal(areaDisplayColor(area), AREA_PALETTE.purple);
  assert.equal(areaDisplayColor(area, {areaColors: {dfe: '#ABCDEF'}}), '#abcdef');
  assert.equal(areaDisplayColor({...area, color: 'teal'}), AREA_PALETTE.teal);
  assert.equal(areaDisplayColor({id: 'custom', name: 'DFE', color: 'green'}), AREA_PALETTE.green);
  assert.equal(areaDisplayColor({id: 'life', color: 'green'}), AREA_PALETTE.green);
  assert.equal(areaDisplayColor(undefined), AREA_PALETTE.slate);
  assert.equal(areaDisplayColor(undefined, {areaColors: {undefined: '#123456'}}), AREA_PALETTE.slate);
  assert.equal(area.color, 'amber');
});

test('recommended built-in area colors stay distinct without changing saved palette records', () => {
  const areas = Object.freeze([
    Object.freeze({id: 'career', color: 'blue'}),
    Object.freeze({id: 'life', color: 'green'}),
    Object.freeze({id: 'dfe', color: 'amber'}),
    Object.freeze({id: 'custom', color: 'purple'}),
  ]);
  const colors = areas.map(area => areaDisplayColor(area));
  assert.deepEqual(colors, [AREA_PALETTE.blue, AREA_PALETTE.green, AREA_PALETTE.purple, AREA_PALETTE.teal]);
  assert.equal(new Set(colors).size, areas.length);
  assert.equal(areaDisplayColor(areas[3], {areaColors: {custom: '#ABCDEF'}}), '#abcdef');
  assert.equal(areaDisplayColor({id: 'custom', color: 'rose'}), AREA_PALETTE.rose);
  assert.equal(areaDisplayColor({id: 'my-area', color: 'purple'}), AREA_PALETTE.purple);
  assert.deepEqual(areas.map(area => area.color), ['blue', 'green', 'amber', 'purple']);
});

test('applying appearance exposes only validated values to the document', () => {
  const root = {dataset: {theme: 'light'}};
  applyDisplayPreferences({textSize: 'largest', contrast: 'strong', tint: 'rich', urgency: 'prominent', urgencyLabels: 'hidden'}, root);
  assert.deepEqual(root.dataset, {
    theme: 'light', textSize: 'largest', contrast: 'strong', areaTint: 'rich', urgencyProminence: 'prominent', urgencyLabels: 'hidden',
  });
  applyDisplayPreferences({contrast: 'invalid'}, root);
  assert.equal(root.dataset.contrast, 'balanced');
  assert.equal(root.dataset.urgencyLabels, 'shown');
});

test('area coloring uses a fixed selector, supports subtree roots, and clears stale colors', () => {
  const node = id => {
    const properties = new Map([['--area-color', '#000000']]);
    return {dataset: {areaId: id}, properties, style: {
      setProperty(key, value) { properties.set(key, value); },
      removeProperty(key) { properties.delete(key); },
    }};
  };
  const root = node('career'), child = node('dfe'), removed = node('removed');
  root.matches = selector => { assert.equal(selector, '[data-area-id]'); return true; };
  root.querySelectorAll = selector => { assert.equal(selector, '[data-area-id]'); return [child, removed]; };
  const areas = [{id: 'career', color: 'blue'}, {id: 'dfe', color: 'amber'}];
  applyAreaColors(areas, {areaColors: {career: '#123456', dfe: 'url(bad)'}}, root);
  assert.equal(root.properties.get('--area-color'), '#123456');
  assert.equal(child.properties.get('--area-color'), AREA_PALETTE.purple);
  assert.equal(removed.properties.has('--area-color'), false);
  assert.deepEqual(areas, [{id: 'career', color: 'blue'}, {id: 'dfe', color: 'amber'}]);
});
