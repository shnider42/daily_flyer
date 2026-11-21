import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoticeCenter, NOTICE_HISTORY_LIMIT } from '../dist/notice-center.mjs';
import { toast, configureNotices, noticeHistory, recordNotice, clearNotices, hasVisibleNotice } from '../dist/ui.mjs';

function fakeClock() {
  let at = 0, serial = 0;
  const pending = new Map(), callbacks = new Map();
  return { now: () => at, pending, callbacks,
    setTimer(callback, delay) { const id = ++serial; pending.set(id, { at: at + delay, callback }); callbacks.set(id, callback); return id; },
    clearTimer(id) { pending.delete(id); },
    advance(delta) {
      const end = at + delta;
      while (true) {
        const next = [...pending].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next || next[1].at > end) break;
        at = next[1].at; pending.delete(next[0]); next[1].callback();
      }
      at = end;
    }
  };
}

function fixture(config = { compact: true }) {
  const clock = fakeClock(), visible = [], reads = [];
  const center = createNoticeCenter({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    render(record, handlers) { const element = { record, ...handlers }; visible.push(element); return element; },
    update(element, record, options) { element.record = record; element.priority = options.priority; },
    remove(element) { const index = visible.indexOf(element); if (index >= 0) visible.splice(index, 1); }
  });
  center.configure({ scope: 'solo:one', onRead: id => reads.push(id), ...config });
  return { center, clock, visible, reads };
}

test('compact notices have one actual card, bounded timers and no delayed burst backlog', () => {
  const f = fixture(), first = f.center.show('The route is marked.');
  assert.equal(f.center.show('A second routine update.'), null);
  assert.equal(f.visible.length, 1); assert.equal(f.clock.pending.size, 1);
  f.clock.advance(1400); const next = f.center.show('The new route is marked.');
  assert.notEqual(next, first); assert.deepEqual(f.visible, [next]); assert.equal(f.clock.pending.size, 1);
  assert.equal(f.center.history().length, 3, 'Suppressed copy stays available in recent notices.');
  f.clock.advance(20000); assert.equal(f.visible.length, 0); assert.equal(f.clock.pending.size, 0); assert.equal(f.center.hasVisible(), false);
});

test('an urgent notice replaces routine copy and routine arrivals cannot displace it', () => {
  const f = fixture(); f.center.show('Cargo received.');
  const warning = f.center.show('Your suit air is low.', 'bad');
  assert.equal(warning.priority, 'urgent'); assert.deepEqual(f.visible, [warning]);
  f.clock.advance(2000); assert.equal(f.center.show('A nearby shop has new stock.', 'good'), null);
  assert.deepEqual(f.visible, [warning]); assert.equal(f.center.history()[0].text, 'A nearby shop has new stock.');
  const explicit = f.center.show('Return to the entry.', 'info', 5000, { priority: 'urgent' });
  assert.equal(explicit.priority, 'urgent'); assert.deepEqual(f.visible, [explicit]); assert.equal(f.clock.pending.size, 1);
});

test('exact duplicate counts coalesce without extending expiry or immediately resurfacing', () => {
  const f = fixture(), first = f.center.show('Hold the marked position.', 'info', 4600), firstId = first.record.id;
  f.clock.advance(2400); assert.equal(f.center.show('Hold the marked position.', 'info', 12000), first);
  assert.equal(first.record.count, 2); assert.equal(f.center.history().length, 1); assert.equal(f.center.history()[0].id, firstId);
  f.clock.advance(400); assert.equal(f.visible.length, 0, 'Repeat delivery does not prolong the first deadline.');
  assert.equal(f.center.show('Hold the marked position.'), null); assert.equal(f.clock.pending.size, 0);
  f.clock.advance(5200); assert.ok(f.center.show('Hold the marked position.')); assert.equal(f.center.history()[0].count, 4);
});

test('compact routine dwell is capped at 2800ms while urgent and desktop deadlines keep their requested duration', () => {
  const mobile = fixture(); mobile.center.show('A long routine receipt.', 'info', 6500);
  mobile.clock.advance(2799); assert.equal(mobile.visible.length, 1); mobile.clock.advance(1); assert.equal(mobile.visible.length, 0);
  mobile.center.show('A critical warning.', 'bad', 6500); mobile.clock.advance(6499); assert.equal(mobile.visible.length, 1);
  mobile.clock.advance(1); assert.equal(mobile.visible.length, 0);
  const desktop = fixture({ compact: false }); desktop.center.show('A desktop receipt.', 'info', 6500);
  desktop.clock.advance(3000); assert.equal(desktop.visible.length, 1); desktop.center.configure({ compact: true });
  assert.equal(desktop.visible.length, 0, 'Resizing does not restart a routine card that already used its compact dwell.');
  assert.equal(desktop.clock.pending.size, 0);
});

test('urgent escalation receives a fresh deadline and an old timer cannot remove it or its replacement', () => {
  const f = fixture(), first = f.center.show('Move out of the shaft.', 'info', 4600), originalTimer = [...f.clock.callbacks.keys()][0];
  f.clock.advance(2000); const escalated = f.center.show('Move out of the shaft.', 'info', 4600, { priority: 'urgent' });
  assert.equal(escalated, first); assert.equal(escalated.priority, 'urgent');
  f.clock.callbacks.get(originalTimer)(); assert.deepEqual(f.visible, [escalated]);
  f.clock.advance(600); assert.deepEqual(f.visible, [escalated]);
  f.clock.advance(3999); assert.deepEqual(f.visible, [escalated]);
  f.clock.advance(1); assert.equal(f.visible.length, 0);
  const replacement = f.center.show('Leave the damaged bay.', 'bad');
  for (const callback of [...f.clock.callbacks.values()].slice(0, -1)) callback();
  assert.deepEqual(f.visible, [replacement]);
});

test('quiet mode archives routine messages, removes an existing routine card, and retains urgent warnings', () => {
  const f = fixture(); f.center.show('Optional work is available.');
  f.center.configure({ quiet: true }); assert.equal(f.visible.length, 0); assert.equal(f.clock.pending.size, 0);
  assert.equal(f.center.show('The station has a new bulletin.'), null);
  const warning = f.center.show('A hull breach needs attention.', 'bad'); assert.deepEqual(f.visible, [warning]);
  f.center.configure({ quiet: false }); f.clock.advance(5000);
  assert.equal(f.visible.length, 0, 'Leaving a quiet context never replays archived copy.');
  assert.equal(f.center.history().length, 3);
});

test('desktop capacity and transition to compact retain the newest urgent card with no hidden timers', () => {
  const f = fixture({ compact: false });
  for (let i = 0; i < 5; i++) f.center.show(`Critical warning ${i}`, 'bad');
  assert.equal(f.visible.length, 4); assert.equal(f.clock.pending.size, 4);
  assert.equal(f.center.show('Routine update.'), null);
  const newest = f.visible.at(-1); f.center.configure({ compact: true });
  assert.deepEqual(f.visible, [newest]); assert.equal(f.clock.pending.size, 1);
});

test('scope changes clear current cards, history and timers, and stale click handlers cannot cross scopes', () => {
  const f = fixture(), old = f.center.show('Captain One has arrived.', 'bad'), callbacks = [...f.clock.callbacks.values()];
  f.center.configure({ scope: 'shared:room:captain-two' });
  assert.equal(f.visible.length, 0); assert.equal(f.clock.pending.size, 0); assert.deepEqual(f.center.history(), []);
  const fresh = f.center.show('Captain Two has arrived.');
  old.onRead(); old.onDismiss(); callbacks.forEach(callback => callback());
  assert.deepEqual(f.reads, []); assert.deepEqual(f.visible, [fresh]);
  f.center.configure({ scope: 'shared:room:captain-two', quiet: false }); assert.deepEqual(f.visible, [fresh]);
  fresh.onRead(); assert.deepEqual(f.reads, [fresh.record.id]); assert.equal(f.visible.length, 0); assert.equal(f.center.history().length, 1);
});

test('recent history retains full text, immutable independent copies and at most sixty entries', () => {
  const f = fixture(), long = 'Full navigation evidence.\n' + 'The original account stays readable. '.repeat(160);
  const warning = f.center.show(long, 'bad'), snapshot = f.center.history();
  assert.equal(snapshot[0].text, long); assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot[0]));
  assert.throws(() => { snapshot[0].text = 'shortened'; }, TypeError);
  f.clock.advance(1); f.center.record(long, 'bad'); assert.equal(snapshot[0].count, 1); assert.equal(f.center.history()[0].count, 2);
  for (let i = 0; i < 90; i++) { f.clock.advance(1); f.center.record(`Archive-only update ${i}.`); }
  assert.equal(f.center.history().length, NOTICE_HISTORY_LIMIT); assert.equal(f.clock.pending.size, 1);
  assert.equal(f.center.history()[0].text, 'Archive-only update 89.');
  assert.equal(f.center.history().find(row => row.id === warning.record.id)?.text, long, 'A visible card always retains a readable history entry.');
  f.center.clear(); assert.equal(f.visible.length, 0); assert.equal(f.center.history().length, NOTICE_HISTORY_LIMIT);
  f.center.clear({ history: true }); assert.deepEqual(f.center.history(), []); assert.equal(f.clock.pending.size, 0);
});

test('the UI adapter imports without a DOM and uses separate full-copy and dismiss buttons', t => {
  const previous = globalThis.document, reads = [];
  delete globalThis.document; clearNotices({ history: true });
  configureNotices({ compact: true, quiet: false, scope: 'ui-no-dom', onRead: id => reads.push(id) });
  assert.equal(toast('An archived message without a document.'), null); assert.equal(hasVisibleNotice(), false);
  assert.equal(recordNotice('Stored without an overlay.').text, 'Stored without an overlay.');
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.textContent = ''; }
    append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; } }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    get isConnected() { return this === stack || this.parent?.isConnected === true; }
  }
  const stack = new Element('div'); globalThis.document = { createElement: tag => new Element(tag), getElementById: id => id === 'toastStack' ? stack : null };
  t.after(() => { clearNotices({ history: true }); if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  configureNotices({ scope: 'ui-buttons', compact: true });
  const text = 'A complete notice containing <literal markup> and enough information to open in history.';
  const card = toast(text, 'bad'); assert.equal(stack.children.length, 1); assert.equal(card.dataset.priority, 'urgent');
  const [message, dismiss] = card.children;
  assert.equal(message.className, 'toast-message'); assert.equal(message.children[0].className, 'toast-text'); assert.equal(message.children[0].textContent, text);
  assert.equal(dismiss.className, 'toast-dismiss'); assert.equal(dismiss.attributes['aria-label'], 'Dismiss notice');
  dismiss.listeners.click({ stopPropagation() {} }); assert.deepEqual(reads, []); assert.equal(stack.children.length, 0);
  const next = toast('Read this complete warning.', 'bad'); next.children[0].listeners.click({ stopPropagation() {} });
  assert.deepEqual(reads, [next.dataset.noticeId]); assert.equal(stack.children.length, 0); assert.equal(noticeHistory()[0].text, 'Read this complete warning.');
  const external = toast('An externally removed critical card.', 'bad'); external.remove();
  assert.equal(hasVisibleNotice(), false, 'DOM removal cannot leave an invisible active warning.');
  const routine = toast('An ordinary update after external removal.'); assert.equal(routine.isConnected, true);
  routine.remove(); configureNotices({ compact: true }); assert.equal(hasVisibleNotice(), false);
  const removed = toast('A detached duplicate must not be returned.', 'bad'); removed.remove();
  assert.equal(toast('A detached duplicate must not be returned.', 'bad'), null);
  assert.equal(hasVisibleNotice(), false); assert.equal(stack.children.length, 0);
});
