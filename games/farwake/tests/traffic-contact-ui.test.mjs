import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { getShipClass } from '../dist/fleet.mjs';

const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const declarations = [...app.matchAll(/^(?:async )?function (\w+)\(/gm)];
const index = declarations.findIndex(value => value[1] === 'openTrafficContact');
const handler = app.slice(declarations[index].index, declarations[index + 1].index);
function fixture(invoke) {
  const dialog = { opened: false, revision: 0, kind: null, title: '', markup: '', buttons: [],
    open(title, kind) { this.opened = true; this.revision++; this.title = title; this.kind = kind; this.buttons = []; },
    html(value) { this.markup = value; }, choices(value) { this.buttons.push(...value); },
    close() { this.opened = false; this.revision++; this.kind = null; } };
  const context = vm.createContext({ dialog, network: null, getShipClass, invoke,
    esc: value => String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    openEncounter: value => { dialog.encounter = value; } });
  vm.runInContext(handler, context);
  return { dialog, context, call: target => context.openTrafficContact(target) };
}

test('restricted naval replies offer acknowledgment without the civilian news encounter', async () => {
  const commands = [], f = fixture(async (name, args) => { commands.push([name, args]); return { ok: true, name: 'FWS Resolute', classId: 'judicator', role: 'Harbor watch', faction: 'Freewake', message: 'Clear the patrol envelope.', clearance: false, restricted: true }; });
  await f.call({ id: 'hearth:peacekeeper:resolute', name: 'FWS Resolute' });
  assert.equal(commands.length, 1); assert.equal(commands[0][0], 'hailTraffic');
  assert.equal(commands[0][1].id, 'hearth:peacekeeper:resolute');
  assert.equal(f.dialog.buttons.length, 1);
  assert.equal(f.dialog.buttons[0].label, 'Acknowledge and close channel');
  assert.match(f.dialog.markup, /Clear the patrol envelope/);
  f.dialog.buttons[0].action(); assert.equal(f.dialog.opened, false);
  assert.equal(commands.length, 1, 'Acknowledgment cannot open a civilian reward or news encounter.');
});

test('a distant contact cannot present a successful hail, and a late reply cannot overwrite another panel', async () => {
  const denied = fixture(async () => ({ ok: false, reason: 'Move within local radio range of the vessel.' }));
  await denied.call({ id: 'gone', name: 'Distant contact' });
  assert.match(denied.dialog.markup, /radio range/); assert.equal(denied.dialog.buttons.length, 1);
  assert.equal(denied.dialog.buttons[0].label, 'Close channel');
  let reply;
  const delayed = fixture(() => new Promise(resolve => { reply = resolve; }));
  const pending = delayed.call({ id: 'guard', name: 'Guard' });
  delayed.dialog.open('Your crew', 'crew'); delayed.dialog.html('A newer panel');
  reply({ ok: true, name: 'Guard', classId: 'judicator', restricted: true, message: 'Old reply' });
  await pending;
  assert.equal(delayed.dialog.title, 'Your crew'); assert.equal(delayed.dialog.markup, 'A newer panel');
});
