import test from "node:test";
import assert from "node:assert/strict";
import { Input } from "../../daily_flyer/themes/pocket_sports_assets/core/input.js";
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
function fixture() {
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
    active: () => active,
    onAction: (...v) => actions.push(v),
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
