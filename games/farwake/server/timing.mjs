/** Fixed simulation steps scheduled against the remaining deadline, not a polling interval. */
export class FixedStepClock {
  constructor({ hz = 30, now = 0, maxElapsed = .25, maxSteps = 6 } = {}) {
    this.dt = 1 / hz;
    this.lastTime = now;
    this.accumulator = 0;
    this.tick = 0;
    this.maxElapsed = maxElapsed;
    this.maxSteps = maxSteps;
  }

  advance(time, step) {
    this.accumulator += Math.min(this.maxElapsed, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.accumulator -= this.dt;
      this.tick++;
      steps++;
      step(this.dt, this.tick, this.accumulator);
    }
    return steps;
  }

  nextDelay(time = this.lastTime) {
    const workElapsed = Math.max(0, (time - this.lastTime) / 1000);
    return Math.max(1, Math.ceil((this.dt - this.accumulator - workElapsed) * 1000));
  }
}
