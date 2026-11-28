import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH_SLOTS, DEFAULT_TOUCH_LAYOUT, normalizeTouchLayout, assignTouchAction, touchButtonFor } from '../public/touch-layout.js';

const actions = ['through', 'sprint', 'shoot', 'pass'];
function assertComplete(layout) {
  assert.deepEqual(Object.keys(layout), ['Y', 'X', 'B', 'A']);
  assert.deepEqual(Object.values(layout).sort(), [...actions].sort());
}
function permutations(values) {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(tail => [value, ...tail]));
}

test('missing legacy settings migrate to B shoot, X sprint, A pass, and Y through', () => {
  const expected = { Y: 'through', X: 'sprint', B: 'shoot', A: 'pass' };
  for (const saved of [undefined, null, {}, '', 'old-controls', true, false, 0, 42, [], ['shoot', 'pass']])
    assert.deepEqual(normalizeTouchLayout(saved), expected);
  for (const action of actions) assert.equal(touchButtonFor(undefined, action), Object.keys(expected).find(slot => expected[slot] === action));
});

test('partial saves preserve valid choices and fill all remaining actions exactly once', () => {
  assert.deepEqual(normalizeTouchLayout({ A: 'shoot' }), { Y: 'through', X: 'sprint', B: 'pass', A: 'shoot' });
  assert.deepEqual(normalizeTouchLayout({ Y: 'pass', B: 'through', extra: 'shoot' }), { Y: 'pass', X: 'sprint', B: 'through', A: 'shoot' });
  const malformed = { Y: [], X: { action: 'sprint' }, B: 3, A: 'steal', unknown: 'pass' };
  assert.deepEqual(normalizeTouchLayout(malformed), DEFAULT_TOUCH_LAYOUT);
});

test('duplicate and unreadable assignments recover deterministically without losing an action', () => {
  assert.deepEqual(normalizeTouchLayout({ Y: 'shoot', X: 'shoot', B: 'shoot', A: 'shoot' }),
    { Y: 'shoot', X: 'sprint', B: 'through', A: 'pass' });
  const inherited = Object.create({ Y: 'pass', X: 'shoot', B: 'through', A: 'sprint' });
  assert.deepEqual(normalizeTouchLayout(inherited), DEFAULT_TOUCH_LAYOUT);
  const getter = { get Y() { throw new Error('Do not evaluate saved getters'); }, X: 'pass' };
  assert.deepEqual(normalizeTouchLayout(getter), { Y: 'through', X: 'pass', B: 'shoot', A: 'sprint' });
  const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('Unreadable'); } });
  assert.deepEqual(normalizeTouchLayout(hostile), DEFAULT_TOUCH_LAYOUT);
});

test('all 24 custom permutations survive normalization and reverse lookup', () => {
  const all = permutations(actions); assert.equal(all.length, 24);
  for (const permutation of all) {
    const saved = Object.fromEntries(TOUCH_SLOTS.map((slot, index) => [slot, permutation[index]]));
    const normalized = normalizeTouchLayout(saved);
    assert.deepEqual(normalized, saved); assert.notEqual(normalized, saved); assertComplete(normalized);
    for (const slot of TOUCH_SLOTS) assert.equal(touchButtonFor(saved, saved[slot]), slot);
  }
});

test('legacy screen assignments migrate to through in the same slot for every custom layout', () => {
  for (const permutation of permutations(actions)) {
    const expected = Object.fromEntries(TOUCH_SLOTS.map((slot, index) => [slot, permutation[index]]));
    const saved = Object.freeze(Object.fromEntries(Object.entries(expected)
      .map(([slot, action]) => [slot, action === 'through' ? 'screen' : action])));
    const migrated = normalizeTouchLayout(saved);
    assert.deepEqual(migrated, expected); assertComplete(migrated);
    assert.equal(touchButtonFor(saved, 'through'), TOUCH_SLOTS.find(slot => saved[slot] === 'screen'));
    assert.ok(Object.values(saved).includes('screen'), 'normalization does not rewrite the input object');
    assert.deepEqual(normalizeTouchLayout(migrated), expected, 'migration is stable on later loads');
  }
});

test('mixed legacy and current duplicates repair deterministically without losing through', () => {
  assert.deepEqual(normalizeTouchLayout({ Y: 'screen', X: 'through', B: 'shoot', A: 'pass' }),
    { Y: 'through', X: 'sprint', B: 'shoot', A: 'pass' });
  assert.deepEqual(normalizeTouchLayout({ X: 'screen', A: 'shoot' }),
    { Y: 'sprint', X: 'through', B: 'pass', A: 'shoot' });
  const swapped = assignTouchAction({ Y: 'pass', X: 'screen', B: 'sprint', A: 'shoot' }, 'B', 'through');
  assert.deepEqual(swapped, { Y: 'pass', X: 'sprint', B: 'through', A: 'shoot' });
});

test('every assignment across every layout swaps the displaced action and preserves other buttons', () => {
  for (const permutation of permutations(actions)) {
    const original = Object.freeze(Object.fromEntries(TOUCH_SLOTS.map((slot, index) => [slot, permutation[index]])));
    for (const slot of TOUCH_SLOTS) for (const action of actions) {
      const previousSlot = TOUCH_SLOTS.find(candidate => original[candidate] === action);
      const next = assignTouchAction(original, slot, action);
      assertComplete(next); assert.notEqual(next, original); assert.equal(next[slot], action);
      assert.equal(next[previousSlot], original[slot]);
      for (const untouched of TOUCH_SLOTS.filter(candidate => candidate !== slot && candidate !== previousSlot))
        assert.equal(next[untouched], original[untouched]);
      assert.deepEqual(assignTouchAction(next, slot, original[slot]), original, 'the inverse assignment restores the original layout');
    }
  }
});

test('invalid changes are harmless and corrupt input is repaired before a valid swap', () => {
  const saved = { A: 'shoot' }, repaired = normalizeTouchLayout(saved);
  for (const [slot, action] of [['Q', 'shoot'], ['B', 'steal'], [null, 'pass'], ['A', undefined], [{}, 'through']])
    assert.deepEqual(assignTouchAction(saved, slot, action), repaired);
  const swapped = assignTouchAction({ Y: 'pass', X: 'pass' }, 'B', 'through');
  assertComplete(swapped); assert.equal(swapped.B, 'through'); assert.equal(swapped.Y, 'pass');
  for (const unknown of [undefined, null, 'steal', 'block', 'screen', 'SHOOT', {}]) assert.equal(touchButtonFor(saved, unknown), null);
  assert.deepEqual(saved, { A: 'shoot' });
});

test('constants stay frozen and returned layouts never mutate inputs or each other', () => {
  assert.ok(Object.isFrozen(TOUCH_SLOTS)); assert.ok(Object.isFrozen(DEFAULT_TOUCH_LAYOUT));
  assert.throws(() => TOUCH_SLOTS.push('Q'), TypeError);
  assert.throws(() => { DEFAULT_TOUCH_LAYOUT.B = 'pass'; }, TypeError);
  const source = Object.freeze({ Y: 'pass', X: 'through', B: 'sprint', A: 'shoot' });
  const first = normalizeTouchLayout(source), second = normalizeTouchLayout(source);
  first.A = 'changed'; assert.equal(second.A, 'shoot'); assert.equal(source.A, 'shoot');
  const changed = assignTouchAction(source, 'Y', 'shoot'); changed.B = 'changed';
  assert.equal(source.B, 'sprint'); assert.equal(DEFAULT_TOUCH_LAYOUT.B, 'shoot');
  assertComplete(normalizeTouchLayout());
});
