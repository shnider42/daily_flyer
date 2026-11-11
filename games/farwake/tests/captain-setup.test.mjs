import test from 'node:test';
import assert from 'node:assert/strict';
import { openCaptainSetup } from '../dist/captain-setup.mjs';

// A small DOM boundary runs the real setup callbacks without a browser or a
// second rendering implementation. Canvas drawing is outside these form tests.
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[entity]));
const descendants = root => root.children.flatMap(node => typeof node === 'string' ? [] : [node, ...descendants(node)]);
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = new Map();
    this.className = ''; this.disabled = false; this.checked = false; this.hidden = false;
    this.style = { setProperty() {} };
    this.classList = {
      add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false),
      toggle: (name, force) => { const names = new Set(this.className.split(/\s+/).filter(Boolean)), add = force ?? !names.has(name); add ? names.add(name) : names.delete(name); this.className = [...names].join(' '); return add; }
    };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  get textContent() { return this.children.map(node => typeof node === 'string' ? node : node.textContent).join(''); }
  set textContent(value) { this.children = [String(value)]; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'checked') this.checked = true;
    if (name === 'disabled') this.disabled = true;
    if (name === 'hidden') this.hidden = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.attributes.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return Object.hasOwn(this.attributes, attribute[1]) && (attribute[2] === undefined || this.attributes[attribute[1]] === attribute[2]);
    return this.tagName === selector;
  }
  querySelectorAll(selector) { const choices = selector.split(',').map(value => value.trim()); return descendants(this).filter(node => choices.some(choice => node.matches(choice))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  async fire(type, extra = {}) {
    if (this.disabled && ['click', 'change'].includes(type)) return;
    const event = { type, target: this, preventDefault() {}, stopImmediatePropagation() {}, ...extra };
    await this['on' + type]?.(event);
    for (const listener of this.listeners.get(type) || []) await listener(event);
  }
  getBoundingClientRect() { return { width: 200, height: 112 }; }
  getContext() {
    if (!this.context) this.context = new Proxy({ canvas: this, imageSmoothingEnabled: true, measureText: () => ({ width: 1 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => key in target ? target[key] : () => {} });
    return this.context;
  }
  set innerHTML(markup) {
    this.children = [];
    const stack = [this], voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
    for (const token of markup.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
        const node = new Element(tag), attributeText = token.slice(tag.length + 1, -1);
        for (const match of attributeText.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) node.setAttribute(match[1], decode(match[2] ?? ''));
        stack.at(-1).append(node); if (!voidTags.has(tag)) stack.push(node);
      } else stack.at(-1).append(decode(token));
    }
  }
}

function fixture(t, options = {}) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { globalThis.document = previousDocument; });
  const body = new Element(), el = new Element(), backdrop = new Element(), close = new Element('button');
  close.setAttribute('id', 'closeModal'); el.append(close, body);
  const submitted = [], cancelled = [], closed = [];
  const dialog = {
    body, el, backdrop, opened: false, kind: null, onClose: kind => closed.push(kind),
    open(title, kind) { this.title = title; this.kind = kind; this.opened = true; this.body.replaceChildren(); },
    close() { if (!this.opened) return; const kind = this.kind; this.opened = false; this.kind = null; this.onClose?.(kind); },
    html(markup) { this.body.innerHTML = markup; }
  };
  const controller = openCaptainSetup(dialog, { onComplete: value => { submitted.push(value); return { ok: true }; }, onCancel: () => cancelled.push(true), ...options });
  const find = selector => body.querySelector(selector);
  const click = async selector => { const control = find(selector); assert.ok(control, `Setup contains ${selector}`); await control.fire('click'); };
  const chooseOpening = async checked => { const checkbox = find('[data-opening-mission]'); assert.ok(checkbox); checkbox.checked = checked; await checkbox.fire('change'); };
  return { dialog, controller, find, click, chooseOpening, submitted, cancelled, closed, close };
}

test('a new voyage starts freely unless its opening mission is explicitly selected', async t => {
  const f = fixture(t), checkbox = f.find('[data-opening-mission]');
  assert.equal(checkbox.checked, false); assert.equal(checkbox.attributes.type, 'checkbox');
  assert.match(f.find('.captain-opening').textContent, /Begin with a short opening mission/);
  assert.match(f.find('.captain-opening').textContent, /A small paid job introduces life on foot and in space/);
  assert.equal(f.controller.getSelection().openingMission, false);
  await f.click('[data-captain-next]');
  assert.equal(f.find('[data-opening-summary]').textContent, 'Start freely');
  await f.click('[data-captain-submit]');
  assert.equal(f.submitted.length, 1); assert.equal(f.submitted[0].openingMission, false); assert.equal(f.dialog.opened, false);
});

test('shared Regular creation offers a crew lobby and preserves the choice without changing solo or Hardcore starts', async t => {
  const shared = fixture(t, { groupStartPolicy: 'choose' });
  assert.equal(shared.find('[data-start-together]').checked, true);
  assert.equal(shared.controller.getSelection().startTogether, true);
  const checkbox = shared.find('[data-start-together]'); checkbox.checked = false; await checkbox.fire('change');
  await shared.click('[data-captain-next]'); await shared.click('[data-captain-back]');
  assert.equal(shared.find('[data-start-together]').checked, false);
  await shared.click('[data-start-mode="hardcore"]');
  assert.equal(shared.find('[data-start-together]'), null); assert.equal(shared.controller.getSelection().startTogether, false);
  await shared.click('[data-start-mode="regular"]');
  assert.equal(shared.find('[data-start-together]').checked, false);
  await shared.click('[data-captain-next]'); await shared.click('[data-captain-submit]');
  assert.equal(shared.submitted[0].startTogether, false);
});

test('solo setup and joining cannot submit a new group departure policy', async t => {
  const solo = fixture(t); assert.equal(solo.find('[data-start-together]'), null); assert.equal(Object.hasOwn(solo.controller.getSelection(), 'startTogether'), false); solo.controller.cancel();
  const join = fixture(t, { groupStartPolicy: 'realm', openingPolicy: 'realm' });
  assert.equal(join.find('[data-start-together]'), null); assert.equal(Object.hasOwn(join.controller.getSelection(), 'startTogether'), false);
  await join.click('[data-captain-next]'); await join.click('[data-captain-submit]');
  assert.equal(Object.hasOwn(join.submitted[0], 'startTogether'), false);
});

test('opening selection survives starting-mode changes and back/next without losing the captain draft', async t => {
  const f = fixture(t);
  await f.chooseOpening(true); await f.click('[data-starter-ship="mule"]');
  await f.click('[data-start-mode="hardcore"]'); assert.equal(f.find('[data-opening-mission]').checked, true);
  await f.click('[data-start-mode="regular"]'); assert.equal(f.controller.getSelection().starterShip, 'mule');
  await f.click('[data-captain-next]');
  const suit = f.find('[data-appearance="suit"]'); suit.value = 'rust'; await suit.fire('change');
  await f.click('[data-trait="long_stride"]');
  assert.equal(f.find('[data-opening-summary]').textContent, 'Opening mission included');
  await f.click('[data-captain-back]');
  assert.equal(f.find('[data-opening-mission]').checked, true);
  await f.click('[data-captain-next]'); await f.click('[data-captain-submit]');
  assert.equal(f.submitted[0].openingMission, true); assert.equal(f.submitted[0].starterShip, 'mule'); assert.equal(f.submitted[0].startMode, 'regular');
  assert.equal(f.submitted[0].character.appearance.suit, 'rust'); assert.deepEqual(f.submitted[0].character.traits, ['long_stride']);
});

test('Hardcore retains its shipless choice when its selected opening mission is submitted', async t => {
  const f = fixture(t, { startMode: 'hardcore', openingMission: true });
  assert.equal(f.find('[data-opening-mission]').checked, true); assert.equal(f.find('[data-starter-ship]'), null);
  await f.click('[data-captain-next]'); await f.click('[data-captain-submit]');
  assert.equal(f.submitted[0].startMode, 'hardcore'); assert.equal(f.submitted[0].openingMission, true);
});

test('a selected opening can be turned off after returning to Starting life', async t => {
  const f = fixture(t, { openingMission: true });
  await f.click('[data-captain-next]'); await f.click('[data-captain-back]'); await f.chooseOpening(false);
  await f.click('[data-captain-next]'); assert.equal(f.find('[data-opening-summary]').textContent, 'Start freely');
  await f.click('[data-captain-submit]'); assert.equal(f.submitted[0].openingMission, false);
});

test('joining inherits the galaxy policy and never submits a personal opening override', async t => {
  const f = fixture(t, { openingPolicy: 'realm', openingMission: true, startMode: 'hardcore' });
  assert.equal(f.find('[data-opening-mission]'), null);
  assert.match(f.find('.captain-opening-inherited').textContent, /follow this galaxy’s opening-mission setting/);
  assert.equal(Object.hasOwn(f.controller.getSelection(), 'openingMission'), false);
  await f.click('[data-captain-next]'); assert.match(f.find('[data-opening-summary]').textContent, /follows this galaxy’s setting/);
  await f.click('[data-captain-submit]'); assert.equal(Object.hasOwn(f.submitted[0], 'openingMission'), false); assert.equal(f.submitted[0].startMode, 'hardcore');
});

test('appearance editing neither displays nor submits an opening mission', async t => {
  const f = fixture(t, { mode: 'edit', locked: true, openingMission: true });
  assert.equal(f.find('[data-opening-mission]'), null); assert.equal(f.find('[data-opening-summary]'), null);
  assert.equal(f.find('.captain-opening-inherited'), null);
  await f.click('[data-captain-submit]'); assert.equal(Object.hasOwn(f.submitted[0], 'openingMission'), false);
});

test('cancelling an opening selection leaves supplied captain data untouched and never starts a voyage', async t => {
  const character = { appearance: { suit: 'moss', hair: 'silver', skin: 'deep', style: 'swept' }, traits: ['long_stride'] }, before = structuredClone(character);
  const f = fixture(t, { character });
  await f.chooseOpening(true); await f.click('[data-captain-next]');
  const suit = f.find('[data-appearance="suit"]'); suit.value = 'rust'; await suit.fire('change');
  await f.click('[data-captain-cancel]'); f.controller.cancel();
  assert.deepEqual(character, before); assert.equal(f.submitted.length, 0); assert.equal(f.cancelled.length, 1); assert.equal(f.dialog.opened, false);
  assert.deepEqual(f.closed, ['captain-setup']); assert.equal(f.close.disabled, false);
});

test('a failed opening submission retains the selected draft and restores its controls for retry', async t => {
  const selections = [];
  const f = fixture(t, { openingMission: true, onComplete: selection => { selections.push(selection); return selections.length === 1 ? { ok: false, reason: 'Try that departure again.' } : { ok: true }; } });
  await f.click('[data-captain-next]'); await f.click('[data-captain-submit]');
  assert.equal(f.dialog.opened, true); assert.match(f.find('[data-captain-error]').textContent, /Try that departure again/);
  assert.equal(f.find('[data-opening-summary]').textContent, 'Opening mission included'); assert.equal(f.close.disabled, false);
  await f.click('[data-captain-back]'); assert.equal(f.find('[data-opening-mission]').checked, true);
  await f.click('[data-captain-next]'); await f.click('[data-captain-submit]');
  assert.equal(selections.length, 2); assert.ok(selections.every(selection => selection.openingMission === true)); assert.equal(f.dialog.opened, false);
});
