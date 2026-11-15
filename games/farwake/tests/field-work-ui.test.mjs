import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldWorkUI } from '../dist/field-work-ui.mjs';

function fixture(initial, handler = async () => ({ ok: true })) {
  let view = initial, game;
  const calls = [], marked = [], accepted = [], requested = [], refreshes = [];
  const makeGame = id => ({ playerId: id, state: { seed: id }, fieldWorkStatus(objectId) { requested.push(objectId); return view; } });
  game = makeGame('field-one');
  const dialog = { revision: 0, opened: false, body: { scrollTop: 0 }, items: [],
    open(title, kind) { this.title = title; this.kind = kind; this.revision++; this.opened = true; this.items = []; this.body.scrollTop = 0; },
    close() { this.revision++; this.opened = false; this.kind = null; }, html(value) { this.markup = value; }, choices(items) { this.items.push(...items); } };
  const ui = createFieldWorkUI({ getGame: () => game, dialog,
    invoke: async (name, args) => { calls.push({ name, args }); return handler(name, args); },
    acceptResult: answer => { accepted.push(answer); return answer.ok; }, track: target => marked.push(target), refreshWorld: () => refreshes.push(true) });
  return { ui, dialog, calls, marked, accepted, requested, refreshes, setView: next => { view = next; }, switchCaptain: () => { game = makeGame('field-two'); } };
}
const empty = () => ({ title: 'Field work', objective: 'Begin at Floodworks 6 on Orchard Nine, in Brindle.', target: { systemId: 'brindle', bodyId: 'orchard', siteId: 'floodworks-6', entityId: 'orchard:site:floodworks-6' }, inFieldSite: false, tools: [], careers: [], assignments: [], actions: [], active: null });
const cutter = () => ({ ...empty(), inFieldSite: true, siteName: 'Floodworks 6', object: { id: 'workshop-cutter', name: 'Workshop <cutter>', text: 'Issue one & keep your own kit.', actions: [{ action: 'claim', objectId: 'workshop-cutter', label: 'Collect field cutter', available: true }] } });

test('the object panel invokes the exact current field action and renders authored text safely', async () => {
  const f = fixture(cutter()); f.ui.openObject({ id: 'orchard:site:floodworks-6:field:workshop-cutter', data: { fieldObjectId: 'workshop-cutter' } });
  assert.equal(f.requested[0], 'workshop-cutter'); assert.match(f.dialog.markup, /one &amp; keep/);
  await f.dialog.items.find(item => item.label === 'Collect field cutter').action();
  assert.deepEqual(f.calls, [{ name: 'fieldWorkAction', args: { action: 'claim', objectId: 'workshop-cutter' } }]);
  assert.equal(f.accepted.length, 1); assert.equal(f.refreshes.length, 1); assert.equal(f.dialog.kind, 'field-work');
});

test('moving away or a changed shared permission invalidates an old object button before sending', async () => {
  const f = fixture(cutter()); f.ui.openObject('orchard:site:floodworks-6:field:workshop-cutter');
  const old = f.dialog.items.find(item => item.label === 'Collect field cutter');
  const next = cutter(); next.object.actions[0].available = false; next.object.actions[0].reason = 'Move closer to the workshop.'; f.setView(next);
  await old.action(); assert.deepEqual(f.calls, []);
  const current = f.dialog.items.find(item => item.label === 'Collect field cutter');
  assert.equal(current.disabled, true); assert.equal(current.detail, 'Move closer to the workshop.');
});

test('pending field work cannot double-submit or apply its result to a different captain', async () => {
  let resolve; const f = fixture(cutter(), () => new Promise(done => { resolve = done; })); f.ui.openObject('workshop-cutter');
  const button = f.dialog.items.find(item => item.label === 'Collect field cutter');
  const pending = button.action(); await button.action(); assert.equal(f.calls.length, 1);
  f.switchCaptain(); resolve({ ok: true }); await pending;
  assert.deepEqual(f.accepted, []); assert.deepEqual(f.refreshes, []);
  assert.equal(f.ui.refresh(), false); assert.equal(f.dialog.opened, false);
});

test('notebook tracks the next physical objective and refreshes a live checklist without losing scroll', () => {
  const target = { systemId: 'brindle', bodyId: 'orchard', siteId: 'floodworks-6', entityId: 'orchard:site:floodworks-6:field:service-panel', fieldObjectId: 'service-panel', label: 'Inspect service panel' };
  const view = { ...empty(), inFieldSite: true, objective: 'Inspect service panel', active: { id: 'engineering-safe-access', title: 'Safe passage', target, next: { label: 'Inspect service panel', detail: 'Read the damaged feed.' }, steps: [{ id: 'inspect', label: 'Inspect service panel', done: false }] } };
  const f = fixture(view); f.ui.open(); f.dialog.body.scrollTop = 78;
  const updated = structuredClone(view); updated.active.steps[0].done = true; updated.objective = 'Collect your cutter'; updated.active.next.label = 'Collect your cutter'; f.setView(updated);
  assert.equal(f.ui.refresh(), true); assert.equal(f.dialog.body.scrollTop, 78); assert.match(f.dialog.markup, /class="done"/); assert.match(f.dialog.markup, /Collect your cutter/);
  f.dialog.items.find(item => item.label === 'Mark my next field task').action(); assert.deepEqual(f.marked, [target]); assert.equal(f.dialog.opened, false);
  assert.equal(f.ui.refresh(), false); assert.deepEqual(f.calls, []);
});

test('an overview keeps unavailable qualifications visible and never invents an unlocked tool or reward action', () => {
  const locked = { action: 'begin', assignmentId: 'engineering-condenser', label: 'Take condenser assignment', available: false, reason: 'Complete the service passage first.' };
  const view = { ...empty(), tools: [{ id: 'power_bridge', name: 'Portable power bridge', description: 'Reconnect a marked service bus.', owned: false, target: { ...empty().target } }], actions: [locked] };
  const f = fixture(view); f.ui.open();
  assert.match(f.dialog.markup, /Collect at the Floodworks workshop/); assert.equal(f.dialog.items.find(item => item.label === locked.label).disabled, true);
  assert.equal(f.dialog.items.some(item => /Claim|Unlock|Pay/.test(item.label)), false); assert.deepEqual(f.calls, []);
});
