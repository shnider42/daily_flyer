import test from "node:test";
import assert from "node:assert/strict";
import {
  Input,
  matchControlsActive,
} from "../../daily_flyer/themes/pocket_sports_assets/core/input.js";
import { DEFAULT_SETTINGS } from "../../daily_flyer/themes/pocket_sports_assets/core/storage.js";
class Element {
  constructor() {
    this.listeners = {};
    this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(t, f) {
    (this.listeners[t] ??= []).push(f);
  }
  setPointerCapture() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  fire(t, e = {}) {
    for (const f of this.listeners[t] || [])
      f({ preventDefault() {}, target: { tagName: "BODY" }, ...e });
  }
}
function fixture(options = {}) {
  globalThis.window = new Element();
  globalThis.document = new Element();
  const els = Object.fromEntries(
    ["stick", "knob", "shoot", "pass", "sprint", "switcher"].map((k) => [
      k,
      new Element(),
    ]),
  );
  const actions = [];
  let active = true;
  const i = new Input({
    ...els,
    settings: structuredClone(DEFAULT_SETTINGS),
    active: () => active && (options.active?.() ?? true),
    onAction: (...v) => {
      actions.push(v);
      options.onAction?.(...v);
    },
    onPause() {},
  });
  return {
    i,
    els,
    actions,
    deactivate() {
      active = false;
    },
  };
}
test("second thumb can act while the first owns movement", () => {
  const { i, els, actions } = fixture();
  els.stick.fire("pointerdown", {
    pointerId: 1,
    clientX: 50,
    clientY: 0,
    pointerType: "touch",
    isPrimary: true,
  });
  els.pass.fire("pointerdown", {
    pointerId: 2,
    pointerType: "touch",
    isPrimary: false,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], "pass");
  assert.ok(actions[0][1].y < -0.9);
  assert.ok(i.vector().y < -0.9);
});
test("compatibility mouse click does not send a duplicate pass", () => {
  const { els, actions } = fixture();
  els.pass.fire("pointerdown", { pointerId: 1, pointerType: "touch" });
  els.pass.fire("pointerup", { pointerId: 1 });
  els.pass.fire("click", { detail: 1 });
  assert.equal(actions.length, 1);
});
test("pointer cancellation clears movement and never fires a charged shot", () => {
  const { i, els, actions } = fixture();
  els.stick.fire("pointerdown", { pointerId: 1, clientX: 95, clientY: 50 });
  els.shoot.fire("pointerdown", { pointerId: 2 });
  els.shoot.fire("pointercancel", { pointerId: 2 });
  els.stick.fire("pointercancel", { pointerId: 1 });
  assert.equal(i.vector().x, 0);
  assert.equal(actions.length, 0);
  assert.equal(i.chargeStart, null);
});
test("key remapping and keyboard activation keep pointer buttons usable", () => {
  const { i, actions } = fixture();
  i.settings.keys.pass = "KeyL";
  window.fire("keydown", { code: "KeyL", target: { tagName: "BUTTON" } });
  assert.equal(actions.length, 1);
  window.fire("keyup", { code: "KeyL" });
  window.fire("keydown", { code: "KeyJ" });
  assert.equal(actions.length, 1);
});
test("blur clears held sprint and movement", () => {
  const { i, els } = fixture();
  window.fire("keydown", { code: "KeyW" });
  els.sprint.fire("pointerdown", { pointerId: 2 });
  assert.ok(i.vector().sprint);
  window.fire("blur");
  assert.deepEqual(i.vector(), { x: 0, y: 0, sprint: false });
});
test("paused input cannot leak actions", () => {
  const f = fixture();
  f.els.shoot.fire("pointerdown", { pointerId: 2 });
  f.deactivate();
  f.els.shoot.fire("pointerup", { pointerId: 2 });
  assert.equal(f.actions.length, 0);
});

test("another pointer cannot release or cancel the charged shot", () => {
  const { i, els, actions } = fixture();
  els.shoot.fire("pointerdown", { pointerId: 2 });
  const started = i.chargeStart;
  els.shoot.fire("pointerdown", { pointerId: 3 });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"])
    els.shoot.fire(t, { pointerId: 3 });
  assert.equal(i.chargeStart, started);
  assert.equal(actions.length, 0);
  els.shoot.fire("pointerup", { pointerId: 2 });
  els.shoot.fire("lostpointercapture", { pointerId: 2 });
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], "shoot");
});
test("movement, sprint and shot retain independent pointer ownership", () => {
  const { i, els, actions } = fixture();
  els.stick.fire("pointerdown", { pointerId: 1, clientX: 90, clientY: 50 });
  els.sprint.fire("pointerdown", { pointerId: 2 });
  els.shoot.fire("pointerdown", { pointerId: 3 });
  els.sprint.fire("pointercancel", { pointerId: 99 });
  els.shoot.fire("pointerup", { pointerId: 3 });
  assert.ok(i.vector().x > 0.9);
  assert.ok(i.vector().sprint);
  assert.equal(actions.length, 1);
  els.sprint.fire("pointerup", { pointerId: 2 });
  assert.equal(i.vector().sprint, false);
  assert.ok(i.vector().x > 0.9);
});
test("keyboard release cannot cancel a touch-owned charge or held touch sprint", () => {
  const { i, els, actions } = fixture();
  els.shoot.fire("pointerdown", { pointerId: 2 });
  els.sprint.fire("pointerdown", { pointerId: 3 });
  window.fire("keyup", { code: "Space" });
  window.fire("keyup", { code: "KeyK" });
  assert.notEqual(i.chargeStart, null);
  assert.ok(i.vector().sprint);
  assert.equal(actions.length, 0);
  els.shoot.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 1);
});
test("dead-ball phases accept a new left thumb and preserve its heading", () => {
  const game = { phase: "play" };
  const { i, els, actions } = fixture({
    active: () => matchControlsActive(game),
  });
  els.stick.fire("pointerdown", { pointerId: 1, clientX: 50, clientY: 5 });
  els.shoot.fire("pointerdown", { pointerId: 2 });
  for (const phase of ["goal", "break", "restart", "restart_ready", "play"]) {
    game.phase = phase;
    i.cancelShot();
    assert.equal(i.pointer, 1);
    assert.ok(i.vector().y < -0.9);
  }
  els.shoot.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 0);
  els.stick.fire("pointerup", { pointerId: 1 });
  game.phase = "restart";
  els.stick.fire("pointerdown", { pointerId: 4, clientX: 95, clientY: 50 });
  assert.ok(i.vector().x > 0.9);
  game.phase = "play";
  assert.ok(i.vector().x > 0.9);
});
test("manual pause clears ownership so a fresh press works after resume", () => {
  const { i, els, actions } = fixture();
  els.shoot.fire("pointerdown", { pointerId: 2 });
  els.sprint.fire("pointerdown", { pointerId: 3 });
  i.clear();
  assert.equal(i.chargeStart, null);
  assert.equal(i.sprinting, false);
  els.shoot.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 0);
  els.shoot.fire("pointerdown", { pointerId: 5 });
  els.shoot.fire("pointerup", { pointerId: 5 });
  assert.equal(actions.length, 1);
  assert.equal(matchControlsActive({ phase: "restart" }, true), false);
  assert.equal(matchControlsActive({ phase: "play" }, false, true), false);
});
