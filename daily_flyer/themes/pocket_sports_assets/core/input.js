import { stickInput, protectGameSurface } from "./pgi-controls.js";
import { clamp } from "./math.js";
// Automatic match stoppages keep input tracking alive; only menus, hiding and
// the end of the match should release held controls.
export function matchControlsActive(game, paused = false, dialogOpen = false) {
  return !!game && !paused && !dialogOpen && game.phase !== "finished";
}
export class Input {
  constructor({
    stick,
    knob,
    shoot,
    pass,
    lob,
    through,
    sprint,
    switcher,
    onAction,
    onPause,
    active,
    settings,
    controlMode = "keyboard",
    onControlMode = () => {},
    autoSprint = () => false,
    canChargeShot = () => true,
    shotContext = () => null,
    footballControls = () => false,
    defending = () => false,
    hockeyControls = () => false,
    hockeyActor = () => null,
  }) {
    this.stick = stick;
    this.knob = knob;
    this.settings = settings;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.pointer = null;
    this.stickPointerType = null;
    this.stickTravel = 0;
    this.controlMode = controlMode === "touch" ? "touch" : "keyboard";
    this.onControlMode = onControlMode;
    this.autoSprint = autoSprint;
    this.canChargeShot = canChargeShot;
    this.shotContext = shotContext;
    this.footballControls = footballControls;
    this.defending = defending;
    this.hockeyControls = hockeyControls;
    this.hockeyActor = hockeyActor;
    this.hockeyHold = null;
    this.chargeKind = null;
    this.defensiveHolds = { contain: new Set(), keeperRush: new Set() };
    this.chargeContext = null;
    this.sprinting = false;
    this.chargeStart = null;
    this.chargeSource = null;
    this.bindings = [];
    this.active = active;
    this.onAction = onAction;
    this.onPause = onPause;
    protectGameSurface(stick);
    [shoot, pass, lob, through, sprint, switcher]
      .filter(Boolean)
      .forEach(protectGameSurface);
    stick.addEventListener("pointerdown", (e) => {
      if (
        !active() ||
        this.pointer !== null ||
        (e.pointerType === "mouse" && e.button !== 0)
      )
        return;
      e.preventDefault();
      this.pointer = e.pointerId;
      this.stickPointerType = e.pointerType;
      stick.setPointerCapture(e.pointerId);
      this.moveStick(e);
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.pointer) this.moveStick(e);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      stick.addEventListener(event, (e) => {
        if (e.pointerId === this.pointer) {
          this.pointer = null;
          this.stickPointerType = null;
          this.stickTravel = 0;
          this.move = { x: 0, y: 0 };
          knob.style.transform = "translate(0px,0px)";
        }
      });
    this.bind(
      shoot,
      (source) => this.startCharge(source),
      (source) => this.releaseCharge(source),
      (source) => this.cancelShot(source),
    );
    this.bind(
      pass,
      (source) => this.faceButton("pass", source),
      (source) => this.releaseDefence("contain", source),
    );
    this.bind(lob, (source) => this.faceButton("lob", source));
    this.bind(
      through,
      (source) => this.faceButton("through", source),
      (source) => this.releaseThrough(source),
      (source) => this.cancelThrough(source),
    );
    this.bind(switcher, () => this.command("switch"));
    this.bind(
      sprint,
      () => (this.sprinting = true),
      () => (this.sprinting = false),
      () => (this.sprinting = false),
    );
    window.addEventListener("keydown", (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (!e.repeat) onPause();
        return;
      }
      if (!active()) return;
      const moves = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ];
      if (
        !moves.includes(e.code) &&
        !Object.values(settings.keys).includes(e.code)
      )
        return;
      e.preventDefault();
      this.setControlMode("keyboard");
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === settings.keys.shoot) this.startCharge("keyboard");
      else if (e.code === settings.keys.pass)
        this.faceButton("pass", "keyboard:pass");
      else if (e.code === settings.keys.lob)
        this.faceButton("lob", "keyboard:lob");
      else if (e.code === settings.keys.through)
        this.faceButton("through", "keyboard:through");
      else if (e.code === settings.keys.switch) this.command("switch");
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === settings.keys.shoot) this.releaseCharge("keyboard");
      if (e.code === settings.keys.pass)
        this.releaseDefence("contain", "keyboard:pass");
      if (e.code === settings.keys.through)
        this.releaseThrough("keyboard:through");
    });
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });
  }
  bind(el, down, up = () => {}, cancel = up) {
    if (!el) return;
    // Every surface owns one pointer. A different finger (or a stale capture
    // event) must never end the current press on this or another surface.
    let owner = null;
    const finish = (e, cancelled) => {
      if (owner === null || e.pointerId !== owner) return;
      const source = `pointer:${owner}`;
      owner = null; // implicit lostpointercapture after pointerup is now a no-op
      el.classList.remove("held");
      (cancelled ? cancel : up)(source);
    };
    el.addEventListener("pointerdown", (e) => {
      if (
        !this.active() ||
        owner !== null ||
        (e.pointerType === "mouse" && e.button !== 0)
      )
        return;
      e.preventDefault();
      owner = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add("held");
      this.notePointer(e);
      down(`pointer:${owner}`);
    });
    el.addEventListener("pointerup", (e) => {
      e.preventDefault();
      finish(e, false);
    });
    for (const type of ["pointercancel", "lostpointercapture"])
      el.addEventListener(type, (e) => finish(e, true));
    el.addEventListener("click", (e) => {
      if (e.detail === 0 && owner === null && this.active()) {
        down("activation");
        up("activation");
      }
    });
    this.bindings.push(() => {
      const id = owner;
      if (id !== null) finish({ pointerId: id }, true);
      if (id !== null && el.hasPointerCapture?.(id))
        el.releasePointerCapture(id);
    });
  }
  setControlMode(mode) {
    const next = mode === "touch" ? "touch" : "keyboard";
    if (next === this.controlMode) return;
    this.controlMode = next;
    this.onControlMode(next);
  }
  notePointer(e) {
    if (e.pointerType)
      this.setControlMode(e.pointerType === "touch" ? "touch" : "keyboard");
  }
  moveStick(e) {
    this.notePointer(e);
    const r = this.stick.getBoundingClientRect(),
      radius = r.width * 0.34,
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2;
    // Sprint follows deliberate physical travel, independent of sensitivity.
    this.stickTravel = Math.min(1, Math.hypot(dx, dy) / radius);
    const v = stickInput(
      dx * this.settings.sensitivity,
      dy * this.settings.sensitivity,
      radius,
    );
    this.move = { x: v.x, y: -v.y };
    this.knob.style.transform = `translate(${v.px}px,${v.py}px)`;
  }
  vector() {
    this.syncDefensiveHolds();
    this.syncHockeyHold();
    let x =
        this.move.x +
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0),
      y =
        this.move.y +
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
    const n = Math.max(1, Math.hypot(x, y));
    const vector = {
      x: x / n,
      y: y / n,
      sprint:
        this.sprinting ||
        this.keys.has(this.settings.keys.sprint) ||
        (this.controlMode === "touch" &&
          this.stickPointerType === "touch" &&
          this.stickTravel >= 0.94 &&
          this.autoSprint()),
    };
    if (this.footballControls()) {
      vector.contain = this.defensiveHolds.contain.size > 0;
      vector.keeperRush = this.defensiveHolds.keeperRush.size > 0;
    }
    if (this.hockeyControls()) {
      vector.shotHeld = this.chargeSource !== null && this.chargeKind === "hockey-shot";
      vector.dumpHeld = this.hockeyHold?.kind === "dump";
      vector.fightHeld = this.hockeyHold?.kind === "fight";
    }
    return vector;
  }
  faceButton(button, source) {
    if (!this.active()) return;
    if (this.hockeyControls()) {
      if (button === "pass") this.command("hockey-pass");
      else if (button === "lob")
        this.command(this.canChargeShot() ? "hockey-saucer" : "hockey-poke");
      else if (button === "through") this.startThrough(source);
      return;
    }
    if (!this.footballControls()) {
      if (button === "pass") this.command("pass");
      return;
    }
    if (this.defending()) {
      if (button === "pass") this.defensiveHolds.contain.add(source);
      else if (button === "through")
        this.defensiveHolds.keeperRush.add(source);
      else if (button === "lob") this.command("slide");
      return;
    }
    this.command(button === "pass" ? "ground" : button);
  }
  releaseDefence(action, source) {
    this.defensiveHolds[action].delete(source);
  }
  startThrough(source) {
    if (this.hockeyHold || !this.active()) return;
    const actor = this.hockeyActor();
    if (actor === null || actor === undefined) return;
    const playable = this.canChargeShot();
    this.hockeyHold = {
      source,
      kind: playable ? "dump" : "fight",
      actor,
      context: playable ? this.shotContext() : null,
      started: performance.now(),
    };
  }
  syncHockeyHold() {
    const hold = this.hockeyHold;
    if (!hold) return;
    if (!this.active() || !this.hockeyControls() || this.hockeyActor() !== hold.actor ||
        (hold.kind === "dump"
          ? !this.canChargeShot() || this.shotContext() !== hold.context
          : this.canChargeShot())) this.hockeyHold = null;
  }
  releaseThrough(source) {
    this.releaseDefence("keeperRush", source);
    this.syncHockeyHold();
    const hold = this.hockeyHold;
    if (!hold || hold.source !== source) return;
    this.hockeyHold = null;
    if (hold.kind === "dump") {
      const seconds = Math.max(0, (performance.now() - hold.started) / 1000);
      this.command("hockey-dump", clamp(seconds / 1.4, 0.08, 1), { heldSeconds: seconds });
    }
    // Fights are attempted by the simulation only after three uninterrupted
    // seconds of fightHeld input. A client cannot turn a tap into a fight.
  }
  cancelThrough(source = null) {
    if (source !== null) this.releaseDefence("keeperRush", source);
    if (source === null || this.hockeyHold?.source === source) this.hockeyHold = null;
  }
  hockeyProgress() {
    this.syncHockeyHold();
    const hold = this.hockeyHold;
    if (!hold) return { kind: null, seconds: 0, power: 0 };
    const seconds = Math.max(0, (performance.now() - hold.started) / 1000);
    return { kind: hold.kind, seconds, power: clamp(seconds / (hold.kind === "fight" ? 3 : 1.4), 0, 1) };
  }
  syncDefensiveHolds() {
    // A press belongs to the defensive phase in which it began. A turnover,
    // stoppage or menu cancels it; releasing later must never fire a pass.
    if (!this.active() || !this.footballControls() || !this.defending()) {
      this.defensiveHolds.contain.clear();
      this.defensiveHolds.keeperRush.clear();
    }
  }
  command(name, power, details) {
    if (this.active()) this.onAction(name, this.vector(), power, details);
  }
  startCharge(source = "activation") {
    if (this.active() && this.chargeSource === null) {
      if (!this.canChargeShot()) {
        this.command(this.hockeyControls() ? "hockey-hit" : "shoot");
        return;
      }
      this.chargeSource = source;
      this.chargeKind = this.hockeyControls() ? "hockey-shot" : "shoot";
      this.chargeContext = this.shotContext();
      this.chargeStart = performance.now();
    }
  }
  syncShotContext() {
    this.syncDefensiveHolds();
    this.syncHockeyHold();
    if (
      this.chargeSource !== null &&
      (!this.canChargeShot() || this.shotContext() !== this.chargeContext)
    )
      this.cancelShot();
  }
  releaseCharge(source = "activation") {
    if (this.chargeStart === null || source !== this.chargeSource) return;
    this.syncShotContext();
    if (this.chargeStart === null) return;
    const power = this.power();
    const kind = this.chargeKind;
    const heldSeconds = Math.max(0, (performance.now() - this.chargeStart) / 1000);
    this.cancelShot(source);
    this.command(kind || "shoot", power, kind === "hockey-shot" ? { heldSeconds } : undefined);
  }
  cancelShot(source = null) {
    if (source !== null && source !== this.chargeSource) return;
    this.chargeStart = null;
    this.chargeSource = null;
    this.chargeContext = null;
    this.chargeKind = null;
  }
  power() {
    return this.chargeStart === null
      ? 0
      : clamp((performance.now() - this.chargeStart) / 850, 0.22, 1);
  }
  clear() {
    for (const cancel of this.bindings) cancel();
    const stickPointer = this.pointer;
    this.pointer = null;
    if (stickPointer !== null && this.stick.hasPointerCapture?.(stickPointer))
      this.stick.releasePointerCapture(stickPointer);
    this.keys.clear();
    this.move = { x: 0, y: 0 };
    this.stickPointerType = null;
    this.stickTravel = 0;
    this.sprinting = false;
    this.defensiveHolds.contain.clear();
    this.defensiveHolds.keeperRush.clear();
    this.cancelShot();
    this.cancelThrough();
    this.pointer = null;
    this.knob.style.transform = "translate(0px,0px)";
  }
}
