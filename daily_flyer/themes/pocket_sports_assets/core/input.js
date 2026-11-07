import { stickInput, protectGameSurface } from "./pgi-controls.js";
import { clamp } from "./math.js";
export class Input {
  constructor({
    stick,
    knob,
    shoot,
    pass,
    sprint,
    switcher,
    onAction,
    onPause,
    active,
    settings,
  }) {
    this.stick = stick;
    this.knob = knob;
    this.settings = settings;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.pointer = null;
    this.sprinting = false;
    this.chargeStart = null;
    this.active = active;
    this.onAction = onAction;
    this.onPause = onPause;
    protectGameSurface(stick);
    [shoot, pass, sprint, switcher].forEach(protectGameSurface);
    stick.addEventListener("pointerdown", (e) => {
      if (!active() || this.pointer !== null) return;
      e.preventDefault();
      this.pointer = e.pointerId;
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
          this.move = { x: 0, y: 0 };
          knob.style.transform = "translate(0px,0px)";
        }
      });
    this.bind(
      shoot,
      () => this.startCharge(),
      () => this.releaseCharge(),
      () => (this.chargeStart = null),
    );
    this.bind(pass, () => this.command("pass"));
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
        moves.includes(e.code) ||
        Object.values(settings.keys).includes(e.code)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === settings.keys.shoot) this.startCharge();
      if (e.code === settings.keys.pass) this.command("pass");
      if (e.code === settings.keys.switch) this.command("switch");
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === settings.keys.shoot) this.releaseCharge();
    });
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });
  }
  bind(el, down, up = () => {}, cancel = up) {
    el.addEventListener("pointerdown", (e) => {
      if (!this.active() || (e.pointerType === "mouse" && e.button !== 0))
        return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("held");
      down();
    });
    el.addEventListener("pointerup", (e) => {
      e.preventDefault();
      el.classList.remove("held");
      up();
    });
    for (const n of ["pointercancel", "lostpointercapture"])
      el.addEventListener(n, () => {
        el.classList.remove("held");
        cancel();
      });
    el.addEventListener("click", (e) => {
      if (e.detail === 0 && this.active()) {
        down();
        up();
      }
    });
  }
  moveStick(e) {
    const r = this.stick.getBoundingClientRect(),
      radius = r.width * 0.34;
    const v = stickInput(
      (e.clientX - r.left - r.width / 2) * this.settings.sensitivity,
      (e.clientY - r.top - r.height / 2) * this.settings.sensitivity,
      radius,
    );
    this.move = { x: v.x, y: -v.y };
    this.knob.style.transform = `translate(${v.px}px,${v.py}px)`;
  }
  vector() {
    let x =
        this.move.x +
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0),
      y =
        this.move.y +
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
    const n = Math.max(1, Math.hypot(x, y));
    return {
      x: x / n,
      y: y / n,
      sprint: this.sprinting || this.keys.has(this.settings.keys.sprint),
    };
  }
  command(name, power) {
    if (this.active()) this.onAction(name, this.vector(), power);
  }
  startCharge() {
    if (this.active()) this.chargeStart = performance.now();
  }
  releaseCharge() {
    if (this.chargeStart === null) return;
    const power = this.power();
    this.chargeStart = null;
    this.command("shoot", power);
  }
  power() {
    return this.chargeStart === null
      ? 0
      : clamp((performance.now() - this.chargeStart) / 850, 0.22, 1);
  }
  clear() {
    this.keys.clear();
    this.move = { x: 0, y: 0 };
    this.sprinting = false;
    this.chargeStart = null;
    this.pointer = null;
    this.knob.style.transform = "translate(0px,0px)";
  }
}
