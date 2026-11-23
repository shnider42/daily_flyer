import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_ACTIONS, createDefaultBindings, normalizeBindings, eventToken, bindingLabel, actionLabel, actionsForToken, actionHeld, rebindControl } from '../public/control-bindings.mjs';
import { createDefaults, normalizePreferences } from '../public/settings.mjs';

test('default desktop controls keep firing, orders and pings on separate mouse buttons', () => {
  const bindings = createDefaultBindings();
  assert.deepEqual(actionsForToken('Mouse0', bindings), ['fire']);
  assert.deepEqual(actionsForToken('Mouse1', bindings), ['ping']);
  assert.deepEqual(actionsForToken('Mouse2', bindings), ['moveOrder']);
  assert.deepEqual(actionsForToken('KeyP', bindings), ['ping']);
  assert.deepEqual(actionsForToken('KeyT', bindings), ['moveOrder']);
  assert.equal(actionHeld('moveUp', new Set(['ArrowUp']), bindings), true);
  assert.equal(actionHeld('sprint', new Set(['ShiftRight']), bindings), true);
  const tokens = Object.values(bindings).flat().filter(Boolean);
  assert.equal(new Set(tokens).size, tokens.length, 'no default input may issue two actions');
});

test('a mouse or keyboard rebind drives both held actions and current help labels', () => {
  const original = createDefaultBindings();
  const fire = rebindControl(original, 'fire', 0, 'Space');
  assert.equal(fire.ok, true);
  assert.deepEqual(actionsForToken('Space', fire.bindings), ['fire']);
  assert.deepEqual(actionsForToken('Mouse0', fire.bindings), []);
  assert.equal(actionHeld('fire', new Set(['Space']), fire.bindings), true);
  assert.equal(actionLabel('fire', fire.bindings), 'Space');
  const interact = rebindControl(fire.bindings, 'interact', 1, 'Mouse4');
  assert.equal(interact.ok, true);
  assert.equal(actionHeld('interact', new Set(['Mouse4']), interact.bindings), true);
  assert.equal(actionLabel('interact', interact.bindings), 'E / Mouse 5');
  assert.deepEqual(original.fire, ['Mouse0', null]);
});

test('conflicts require explicit replacement and cannot make a ping issue a move order', () => {
  const original = createDefaultBindings();
  const proposal = rebindControl(original, 'ping', 0, 'Mouse2');
  assert.equal(proposal.ok, false);
  assert.deepEqual(proposal.conflicts, [{action:'moveOrder',slot:0,label:'Order squad to move'}]);
  assert.deepEqual(proposal.bindings, original);
  const accepted = rebindControl(original, 'ping', 0, 'Mouse2', {resolveConflict:true});
  assert.equal(accepted.ok, true);
  assert.deepEqual(actionsForToken('Mouse2', accepted.bindings), ['ping']);
  assert.deepEqual(accepted.bindings.moveOrder, [null, 'KeyT']);
  assert.deepEqual(actionsForToken('KeyT', accepted.bindings), ['moveOrder']);
  assert.deepEqual(original.moveOrder, ['Mouse2', 'KeyT']);
});

test('moving an alternate into the primary slot does not duplicate it, and explicit clears persist', () => {
  const result = rebindControl(createDefaultBindings(), 'ping', 0, 'KeyP');
  assert.equal(result.ok, true);
  assert.deepEqual(result.bindings.ping, ['KeyP', null]);
  const cleared = rebindControl(result.bindings, 'ping', 0, null);
  assert.equal(cleared.ok, true);
  assert.deepEqual(normalizeBindings(cleared.bindings).ping, [null, null]);
  assert.equal(actionLabel('ping', cleared.bindings), 'Unbound');
  assert.equal(actionHeld('ping', new Set(['KeyP']), cleared.bindings), false);
});

test('Escape stays a safe menu route even when the menu is rebound or all its slots are cleared', () => {
  const rebound = rebindControl(createDefaultBindings(), 'pause', 0, 'KeyO');
  assert.equal(rebound.ok, true);
  assert.deepEqual(actionsForToken('Escape', rebound.bindings), ['pause']);
  assert.deepEqual(actionsForToken('KeyO', rebound.bindings), ['pause']);
  assert.equal(actionLabel('pause', rebound.bindings), 'O / Esc');
  const cleared = rebindControl(rebound.bindings, 'pause', 0, null);
  assert.equal(actionLabel('pause', cleared.bindings), 'Esc');
  assert.equal(rebindControl(cleared.bindings, 'fire', 0, 'Escape').ok, false);
});

test('event capture separates physical keys and mouse buttons and ignores browser chords and touch', () => {
  assert.equal(eventToken({code:'KeyQ',key:'a'}), 'KeyQ', 'bindings use the physical code');
  assert.equal(eventToken({code:'KeyW',shiftKey:true}), 'KeyW', 'sprinting must not block movement');
  assert.equal(eventToken({pointerType:'mouse',button:1}), 'Mouse1');
  assert.equal(eventToken({pointerType:'touch',button:0}), null);
  assert.equal(eventToken({code:'KeyR',ctrlKey:true}), null);
  assert.equal(eventToken({code:'KeyR',metaKey:true}), null);
  assert.equal(eventToken({code:'F4',altKey:true}), null);
  assert.equal(eventToken({code:'KeyE',isComposing:true}), null);
  for (const code of ['Tab','F5','F11','F12','MetaLeft','ControlLeft','Backspace']) assert.equal(eventToken({code}), null);
  assert.equal(eventToken({button:5}), null);
  assert.equal(eventToken(null), null);
});

test('malformed saved bindings cannot add actions, reserved inputs, inherited properties or double dispatch', () => {
  const raw = JSON.parse('{"ping":["KeyR",null],"fire":["KeyR","Escape"],"moveOrder":["BadCode",null],"__proto__":{"polluted":true},"constructor":["KeyA"],"extra":["Mouse2"]}');
  const bindings = normalizeBindings(raw);
  assert.equal(Object.hasOwn(bindings, 'extra'), false);
  assert.equal(Object.hasOwn(bindings, '__proto__'), false);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys(bindings).length, CONTROL_ACTIONS.length);
  assert.deepEqual(actionsForToken('KeyR', bindings), ['fire']);
  assert.equal(bindings.reload[0], null);
  assert.equal(bindings.fire.includes('Escape'), false);
  assert.equal(bindings.moveOrder[0], 'Mouse2');
  assert.equal(bindings.moveOrder[1], null);
  const tokens = Object.values(bindings).flat().filter(Boolean);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.deepEqual(normalizeBindings(Object.create({fire:['KeyJ']})), createDefaultBindings());
  assert.deepEqual(normalizeBindings([]), createDefaultBindings());
});

test('saved explicit choices win over missing defaults and survive preference round trips', () => {
  const saved = normalizePreferences({guidance:'moderate',completed:{cordon:true},keyBindings:{ping:['KeyR'],fire:[],map:['KeyL',null]}});
  assert.deepEqual(saved.keyBindings.ping, ['KeyR', null]);
  assert.deepEqual(saved.keyBindings.fire, [null, null]);
  assert.deepEqual(saved.keyBindings.reload, [null, null]);
  assert.deepEqual(saved.keyBindings.moveUp, ['KeyW', 'ArrowUp']);
  assert.equal(saved.keyBindings.map[0], 'KeyL');
  assert.deepEqual(normalizePreferences(JSON.parse(JSON.stringify(saved))), saved);
  assert.deepEqual(saved.completed, {cordon:true});
  assert.equal(saved.guidance, 'moderate');
});

test('fresh preference and binding defaults do not share mutable arrays', () => {
  const first = createDefaults(), second = createDefaults();
  first.keyBindings.fire[0] = 'Space';
  assert.deepEqual(second.keyBindings.fire, ['Mouse0', null]);
  const inherited = normalizePreferences({}, first);
  assert.equal(inherited.keyBindings.fire[0], 'Space');
  inherited.keyBindings.fire[0] = 'KeyJ';
  assert.equal(first.keyBindings.fire[0], 'Space');
  assert.equal(createDefaultBindings().fire[0], 'Mouse0');
});

test('invalid rebind requests leave the active mapping intact', () => {
  const original = createDefaultBindings();
  for (const [action, slot, token] of [['fire',0,'F5'],['fire',0,'ControlLeft'],['fire',2,'KeyL'],['missing',0,'KeyL'],['fire',0,{}]]) {
    const result = rebindControl(original, action, slot, token);
    assert.equal(result.ok, false);
    assert.deepEqual(result.bindings, original);
    assert.ok(result.reason);
  }
  assert.equal(bindingLabel('Mouse1'), 'Middle mouse');
  assert.equal(bindingLabel('Numpad8'), 'Num 8');
  assert.equal(bindingLabel(null), 'Unbound');
});
