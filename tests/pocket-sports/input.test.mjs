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
    ["stick", "knob", "shoot", "pass", "lob", "through", "sprint", "switcher"].map((k) => [
      k,
      new Element(),
    ]),
  );
  const actions = [];
  let active = true;
  const i = new Input({
    ...els,
    settings: structuredClone(DEFAULT_SETTINGS),
    ...options.input,
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

test("gameplay input selects touch assistance without unrelated keys disabling it", () => {
  const modes = [];
  const { i, els } = fixture({ input: { onControlMode: (mode) => modes.push(mode) } });
  els.pass.fire("pointerdown", { pointerId: 1, pointerType: "touch" });
  els.pass.fire("pointerup", { pointerId: 1 });
  assert.equal(i.controlMode, "touch");
  window.fire("keydown", { code: "KeyZ" });
  window.fire("keyup", { code: "Space" });
  assert.equal(i.controlMode, "touch");
  window.fire("keydown", { code: "KeyW" });
  assert.equal(i.controlMode, "keyboard");
  els.pass.fire("pointerdown", { pointerId: 2, pointerType: "touch" });
  assert.deepEqual(modes, ["touch", "keyboard", "touch"]);
});

test("a full touch stride frees the right thumb to pass while sprinting", () => {
  const { i, els, actions } = fixture({ input: { autoSprint: () => true } });
  i.settings.sensitivity = 1.6;
  els.stick.fire("pointerdown", {
    pointerId: 1, pointerType: "touch", clientX: 70, clientY: 50,
  });
  assert.equal(i.vector().sprint, false, "sensitivity alone must not start a sprint");
  els.stick.fire("pointermove", {
    pointerId: 1, pointerType: "touch", clientX: 90, clientY: 50,
  });
  assert.equal(i.vector().sprint, true);
  els.pass.fire("pointerdown", { pointerId: 2, pointerType: "touch" });
  els.pass.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 1);
  assert.equal(actions[0][1].sprint, true);
  assert.ok(i.vector().x > 0.9);
  assert.equal(i.vector().sprint, true);
  els.stick.fire("pointermove", {
    pointerId: 1, pointerType: "touch", clientX: 68, clientY: 50,
  });
  assert.equal(i.vector().sprint, false, "easing the thumb back must stop sprinting");
  els.stick.fire("pointercancel", { pointerId: 1 });
  assert.deepEqual(i.vector(), { x: 0, y: 0, sprint: false });
});

test("touch sprint can be disabled and never grants automatic keyboard or mouse sprint", () => {
  let enabled = false;
  const { i, els } = fixture({ input: { autoSprint: () => enabled } });
  els.stick.fire("pointerdown", {
    pointerId: 1, pointerType: "touch", clientX: 95, clientY: 50,
  });
  assert.equal(i.vector().sprint, false);
  enabled = true;
  assert.equal(i.vector().sprint, true);
  window.fire("keydown", { code: "KeyW" });
  assert.equal(i.vector().sprint, false);
  els.stick.fire("pointerup", { pointerId: 1 });
  els.stick.fire("pointerdown", {
    pointerId: 2, pointerType: "mouse", button: 0, clientX: 95, clientY: 50,
  });
  assert.equal(i.vector().sprint, false);
  window.fire("keydown", { code: "KeyK" });
  assert.equal(i.vector().sprint, true, "explicit sprint remains available");
});

test("a defensive press tackles immediately and cannot shoot after possession changes", () => {
  let attacking = false;
  const { i, els, actions } = fixture({ input: { canChargeShot: () => attacking } });
  els.shoot.fire("pointerdown", { pointerId: 1, pointerType: "touch" });
  assert.equal(actions.length, 1, "the tackle must happen before pointerup");
  assert.equal(actions[0][0], "shoot");
  assert.equal(i.chargeStart, null);
  attacking = true;
  els.shoot.fire("pointerup", { pointerId: 1 });
  els.shoot.fire("lostpointercapture", { pointerId: 1 });
  assert.equal(actions.length, 1, "winning the ball must not turn release into a shot");
});

test("losing the ball cancels an attacking hold instead of tackling on release", () => {
  let attacking = true;
  const { i, els, actions } = fixture({ input: { canChargeShot: () => attacking } });
  els.shoot.fire("pointerdown", { pointerId: 1, pointerType: "touch" });
  assert.notEqual(i.chargeStart, null);
  attacking = false;
  i.syncShotContext();
  attacking = true;
  els.shoot.fire("pointerup", { pointerId: 1 });
  assert.equal(actions.length, 0, "regaining possession cannot revive the old charge");
});

test("a charged shot belongs to its receiver and cannot transfer across a pass", () => {
  let owner = { id: 4 };
  const { i, els, actions } = fixture({ input: { shotContext: () => owner } });
  els.shoot.fire("pointerdown", { pointerId: 1, pointerType: "touch" });
  owner = { id: 7 };
  els.shoot.fire("pointerup", { pointerId: 1 });
  assert.equal(actions.length, 0);
  assert.equal(i.chargeStart, null);
  els.shoot.fire("pointerdown", { pointerId: 2, pointerType: "touch" });
  els.shoot.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 1, "a deliberate new press still shoots");
});

test("soccer face buttons send distinct grounded, lofted and through passes", () => {
  const { i, els, actions } = fixture({
    input: { footballControls: () => true, defending: () => false },
  });
  els.stick.fire("pointerdown", {
    pointerId: 1, pointerType: "touch", clientX: 90, clientY: 50,
  });
  for (const [button, pointerId] of [["pass", 2], ["lob", 3], ["through", 4]]) {
    els[button].fire("pointerdown", { pointerId, pointerType: "touch" });
    els[button].fire("pointerup", { pointerId });
    els[button].fire("click", { detail: 1 });
  }
  assert.deepEqual(actions.map(([name]) => name), ["ground", "lob", "through"]);
  assert.ok(actions.every(([, v]) => v.x > 0.9));
  assert.ok(i.vector().x > 0.9, "the moving thumb remains independent");
});

test("defensive A and Y hold separate actions without passing or switching", () => {
  const { i, els, actions } = fixture({
    input: { footballControls: () => true, defending: () => true },
  });
  els.pass.fire("pointerdown", { pointerId: 2, pointerType: "touch" });
  els.through.fire("pointerdown", { pointerId: 3, pointerType: "touch" });
  assert.equal(i.vector().contain, true);
  assert.equal(i.vector().keeperRush, true);
  assert.equal(actions.length, 0);
  els.pass.fire("pointerup", { pointerId: 3 });
  els.through.fire("pointercancel", { pointerId: 2 });
  assert.equal(i.vector().contain, true, "Y's finger cannot release A");
  assert.equal(i.vector().keeperRush, true, "A's finger cannot cancel Y");
  els.pass.fire("pointerup", { pointerId: 2 });
  assert.equal(i.vector().contain, false);
  assert.equal(i.vector().keeperRush, true);
  els.through.fire("lostpointercapture", { pointerId: 3 });
  assert.equal(i.vector().keeperRush, false);
  assert.equal(actions.length, 0);
});

test("defensive X slides on contact once rather than on release", () => {
  const { els, actions } = fixture({
    input: { footballControls: () => true, defending: () => true },
  });
  els.lob.fire("pointerdown", { pointerId: 2, pointerType: "touch" });
  assert.deepEqual(actions.map(([name]) => name), ["slide"]);
  els.lob.fire("pointerup", { pointerId: 2 });
  els.lob.fire("click", { detail: 1 });
  assert.equal(actions.length, 1);
});

test("winning possession cancels defensive holds without firing an attacking action", () => {
  let defence = true;
  const { i, els, actions } = fixture({
    input: { footballControls: () => true, defending: () => defence },
  });
  els.pass.fire("pointerdown", { pointerId: 2 });
  els.through.fire("pointerdown", { pointerId: 3 });
  defence = false;
  i.syncShotContext();
  assert.equal(i.vector().contain, false);
  assert.equal(i.vector().keeperRush, false);
  defence = true;
  assert.equal(i.vector().contain, false, "a later turnover cannot revive an old hold");
  assert.equal(i.vector().keeperRush, false);
  els.pass.fire("pointerup", { pointerId: 2 });
  els.through.fire("pointerup", { pointerId: 3 });
  assert.equal(actions.length, 0);
  defence = false;
  els.pass.fire("pointerdown", { pointerId: 4 });
  assert.equal(actions.at(-1)[0], "ground", "a fresh press uses current possession");
});

test("soccer defensive keyboard holds coexist with touches and ignore repeats", () => {
  const { i, els, actions } = fixture({
    input: { footballControls: () => true, defending: () => true },
  });
  i.settings.keys.lob = "KeyL";
  i.settings.keys.through = "KeyI";
  els.pass.fire("pointerdown", { pointerId: 2 });
  window.fire("keydown", { code: "KeyJ" });
  window.fire("keydown", { code: "KeyI" });
  window.fire("keydown", { code: "KeyL" });
  window.fire("keydown", { code: "KeyL", repeat: true });
  assert.equal(i.vector().contain, true);
  assert.equal(i.vector().keeperRush, true);
  assert.deepEqual(actions.map(([name]) => name), ["slide"]);
  window.fire("keyup", { code: "KeyJ" });
  assert.equal(i.vector().contain, true, "keyboard release preserves the touch hold");
  els.pass.fire("pointerup", { pointerId: 2 });
  assert.equal(i.vector().contain, false);
  window.fire("keyup", { code: "KeyI" });
  assert.equal(i.vector().keeperRush, false);
});

test("pausing or hiding cancels face-button holds and allows fresh presses", () => {
  const { i, els, actions } = fixture({
    input: { footballControls: () => true, defending: () => true },
  });
  els.pass.fire("pointerdown", { pointerId: 2 });
  els.through.fire("pointerdown", { pointerId: 3 });
  document.hidden = true;
  document.fire("visibilitychange");
  assert.equal(i.vector().contain, false);
  assert.equal(i.vector().keeperRush, false);
  document.hidden = false;
  els.pass.fire("pointerup", { pointerId: 2 });
  els.through.fire("pointerup", { pointerId: 3 });
  assert.equal(actions.length, 0);
  els.pass.fire("pointerdown", { pointerId: 4 });
  assert.equal(i.vector().contain, true);
  i.clear();
  assert.equal(i.vector().contain, false);
});

test("leaving live defence for a restart invalidates old A and Y holds", () => {
  let live = true;
  const { i, els, actions } = fixture({
    input: { footballControls: () => true, defending: () => live },
  });
  els.pass.fire("pointerdown", { pointerId: 2 });
  els.through.fire("pointerdown", { pointerId: 3 });
  live = false;
  i.syncShotContext();
  live = true;
  assert.equal(i.vector().contain, false);
  assert.equal(i.vector().keeperRush, false);
  els.pass.fire("pointerup", { pointerId: 2 });
  els.through.fire("pointerup", { pointerId: 3 });
  assert.equal(actions.length, 0);
});

test("hockey keeps its original pass action and ignores soccer-only buttons", () => {
  const { i, els, actions } = fixture({
    input: { footballControls: () => false, defending: () => true },
  });
  for (const [button, pointerId] of [["pass", 2], ["lob", 3], ["through", 4]]) {
    els[button].fire("pointerdown", { pointerId });
    els[button].fire("pointerup", { pointerId });
  }
  assert.deepEqual(actions.map(([name]) => name), ["pass"]);
  assert.deepEqual(i.vector(), { x: 0, y: 0, sprint: false });
});

function hockeyFixture() {
  const state = { playable: true, actor: 5, context: "5:possession:1" };
  const f = fixture({ input: {
    hockeyControls: () => true,
    hockeyActor: () => state.actor,
    canChargeShot: () => state.playable,
    shotContext: () => state.context,
  } });
  return { ...f, state };
}

test("hockey face actions use the controlled skater's puck context", () => {
  const { els, actions, state } = hockeyFixture();
  els.pass.fire("pointerdown", { pointerId: 1 });
  els.pass.fire("pointerup", { pointerId: 1 });
  els.lob.fire("pointerdown", { pointerId: 2 });
  els.lob.fire("pointerup", { pointerId: 2 });
  state.playable = false;
  els.lob.fire("pointerdown", { pointerId: 3 });
  els.shoot.fire("pointerdown", { pointerId: 4 });
  assert.deepEqual(actions.map(([name]) => name), ["hockey-pass", "hockey-saucer", "hockey-poke", "hockey-hit"]);
  els.shoot.fire("pointerup", { pointerId: 4 });
  assert.equal(actions.length, 4, "releasing a hit cannot create a shot");
});

test("B sends a shot hold to authority and releases with a bounded power", () => {
  const { i, els, actions } = hockeyFixture();
  els.shoot.fire("pointerdown", { pointerId: 2 });
  assert.equal(i.vector().shotHeld, true);
  i.chargeStart -= 600;
  els.shoot.fire("pointerup", { pointerId: 2 });
  assert.equal(i.vector().shotHeld, false);
  assert.equal(actions[0][0], "hockey-shot");
  assert.ok(actions[0][2] > 0.5 && actions[0][2] <= 1);
  assert.ok(actions[0][3].heldSeconds >= 0.6);
});

test("Y charges a dump independently while the left thumb keeps moving", () => {
  const { i, els, actions } = hockeyFixture();
  els.stick.fire("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 95, clientY: 50 });
  els.through.fire("pointerdown", { pointerId: 2, pointerType: "touch" });
  i.hockeyHold.started -= 1100;
  assert.equal(i.vector().dumpHeld, true);
  assert.equal(i.vector().fightHeld, false);
  els.through.fire("pointerup", { pointerId: 3 });
  assert.equal(actions.length, 0, "a different finger cannot release the dump");
  assert.equal(i.hockeyProgress().kind, "dump");
  els.through.fire("pointerup", { pointerId: 2 });
  assert.equal(actions[0][0], "hockey-dump");
  assert.ok(actions[0][2] >= 0.75 && actions[0][2] <= 1);
  assert.ok(i.vector().x > 0.9);
});

test("Y's off-puck gesture remains held input instead of a client-timed fight", () => {
  const { i, els, actions, state } = hockeyFixture();
  state.playable = false;
  els.through.fire("pointerdown", { pointerId: 2 });
  i.hockeyHold.started -= 3200;
  assert.equal(i.vector().fightHeld, true);
  assert.equal(i.vector().dumpHeld, false);
  assert.equal(i.hockeyProgress().power, 1);
  assert.equal(actions.length, 0, "the simulation must measure the three-second hold");
  els.through.fire("pointerup", { pointerId: 2 });
  assert.equal(i.vector().fightHeld, false);
  assert.equal(actions.length, 0);
});

test("losing the puck cannot turn a held dump into a fight attempt", () => {
  const { i, els, actions, state } = hockeyFixture();
  els.through.fire("pointerdown", { pointerId: 2 });
  state.playable = false;
  i.syncShotContext();
  assert.equal(i.vector().dumpHeld, false);
  assert.equal(i.vector().fightHeld, false);
  state.playable = true;
  els.through.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 0);
});

test("winning the puck cannot turn a held fight gesture into a dump", () => {
  const { i, els, actions, state } = hockeyFixture();
  state.playable = false;
  els.through.fire("pointerdown", { pointerId: 2 });
  state.playable = true;
  i.syncShotContext();
  state.playable = false;
  assert.equal(i.vector().fightHeld, false);
  els.through.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 0);
});

test("switching skaters invalidates hockey holds even if the next skater can play the puck", () => {
  const { i, els, actions, state } = hockeyFixture();
  els.shoot.fire("pointerdown", { pointerId: 2 });
  els.through.fire("pointerdown", { pointerId: 3 });
  state.actor = 4;
  state.context = "4:possession:2";
  i.syncShotContext();
  els.shoot.fire("pointerup", { pointerId: 2 });
  els.through.fire("pointerup", { pointerId: 3 });
  assert.equal(actions.length, 0);
  assert.equal(i.vector().shotHeld, false);
  assert.equal(i.vector().dumpHeld, false);
});

test("pointer cancellation and blur never release hockey shots or dumps", () => {
  const { i, els, actions } = hockeyFixture();
  els.through.fire("pointerdown", { pointerId: 2 });
  els.through.fire("pointercancel", { pointerId: 2 });
  assert.equal(actions.length, 0);
  els.through.fire("pointerdown", { pointerId: 3 });
  els.shoot.fire("pointerdown", { pointerId: 4 });
  window.fire("blur");
  assert.equal(i.vector().dumpHeld, false);
  assert.equal(i.vector().shotHeld, false);
  assert.equal(actions.length, 0);
});

test("keyboard Y release cannot end a touch-owned dump", () => {
  const { i, els, actions } = hockeyFixture();
  els.through.fire("pointerdown", { pointerId: 2 });
  window.fire("keyup", { code: i.settings.keys.through });
  assert.equal(i.vector().dumpHeld, true);
  assert.equal(actions.length, 0);
  els.through.fire("pointerup", { pointerId: 2 });
  assert.equal(actions.length, 1);
});
