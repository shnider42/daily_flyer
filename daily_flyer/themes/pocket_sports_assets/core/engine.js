import { movePlayer } from "./movement.js";
import {
  setupFootballRestart,
  stepFootballRestart,
  takeFootballRestart,
  footballBoundary,
} from "../sports/football.js";
import { SPORTS, DIFFICULTY } from "../sports/rules.js";
import { clamp, norm, distance, seeded, segmentDistance } from "./math.js";
export const ENGINE_VERSION = "1.2.0";
export class Match {
  constructor({
    sport = "hockey",
    home,
    away,
    difficulty = "club",
    seconds = 45,
    practice = false,
    cup = false,
    seed = 42,
    autoplay = false,
  }) {
    this.rules = SPORTS[sport];
    if (!this.rules || !home || !away)
      throw Error("Invalid match configuration");
    this.sport = sport;
    this.autoplay = autoplay;
    this.teams = [home, away];
    this.difficulty = DIFFICULTY[difficulty] || DIFFICULTY.club;
    this.duration = clamp(Number(seconds) || 45, 20, 240);
    this.practice = practice;
    this.cup = cup;
    this.random = seeded(seed);
    this.score = [0, 0];
    this.stats = [
      { shots: 0, saves: 0, passes: 0, tackles: 0, possession: 0 },
      { shots: 0, saves: 0, passes: 0, tackles: 0, possession: 0 },
    ];
    this.period = 1;
    this.remaining = this.duration;
    this.phase = "play";
    this.events = [];
    this.time = 0;
    this.cooldown = 0;
    this.timer = 0;
    this.aimAssist = 0.65;
    this.message = "";
    this.lastTouch = 0;
    this.players = [];
    this.ball = {
      x: this.rules.width / 2,
      y: this.rules.height / 2,
      vx: 0,
      vy: 0,
      owner: null,
      lock: 0,
      shot: false,
    };
    this.teams.forEach((team, side) => {
      const keep = team.players.filter((p) =>
          ["G", "GK", "Goalkeeper"].includes(p.position),
        ),
        out = team.players.filter((p) => !keep.includes(p));
      const arranged =
        this.sport === "hockey"
          ? [
              ...out.filter((p) => p.position === "D"),
              ...out.filter((p) => p.position !== "D"),
            ]
          : out;
      const lineup = [keep[0] || team.players[0], ...arranged].slice(
        0,
        this.rules.count,
      );
      while (lineup.length < this.rules.count)
        lineup.push({
          name: "Academy player",
          number: lineup.length + 1,
          position: "F",
        });
      lineup.forEach((data, i) =>
        this.players.push({
          id: this.players.length,
          side,
          slot: i,
          name: data.name,
          number: data.number || i + 1,
          role: this.rules.positions[i],
          keeper: i === 0,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          stamina: 1,
          stun: 0,
          decision: this.random(),
          fx: 0,
          fy: side ? 1 : -1,
        }),
      );
    });
    this.controlled = this.autoplay ? -1 : this.rules.count - 1;
    this.kickoff(0);
  }
  get user() {
    return this.players[this.controlled];
  }
  get owner() {
    return this.ball.owner === null ? null : this.players[this.ball.owner];
  }
  get hasBall() {
    return this.owner?.side === 0;
  }
  emit(type, data = {}) {
    this.events.push({ type, time: this.time, ...data });
    if (this.events.length > 80) this.events.shift();
  }
  kickoff(side = 0) {
    if (this.sport === "soccer")
      return setupFootballRestart(
        this,
        "KICK-OFF",
        side,
        this.rules.width / 2,
        this.rules.height / 2,
      );
    this.players.forEach((p) => {
      const f = this.rules.formation[p.slot];
      p.x = f[0] * this.rules.width;
      p.y = (p.side ? 1 - f[1] : f[1]) * this.rules.height;
      p.vx = p.vy = 0;
      p.stun = 0;
    });
    const p = this.players.find(
      (p) => p.side === side && p.slot === this.rules.count - 1,
    );
    p.x = this.rules.width / 2;
    p.y = this.rules.height / 2;
    this.ball = {
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      owner: p.id,
      lock: 0.55,
      shot: false,
    };
    this.lastTouch = side;
    if (!side && !this.autoplay) this.controlled = p.id;
    this.phase = "play";
    this.cooldown = 0.3;
  }
  switchPlayer() {
    if (this.hasBall) {
      this.controlled = this.owner.id;
      return;
    }
    const b = this.ball;
    let choices = this.players.filter(
      (p) => !p.side && !p.keeper && p.id !== this.controlled,
    );
    choices.sort((a, c) => distance(a, b) - distance(c, b));
    if (choices[0]) this.controlled = choices[0].id;
  }
  release(p, dx, dy, speed, shot) {
    const v = norm(dx, dy);
    this.ball.owner = null;
    this.ball.x = p.x + v.x * (this.sport === "soccer" ? 0 : 21);
    this.ball.y = p.y + v.y * (this.sport === "soccer" ? 0 : 21);
    this.ball.vx = v.x * speed;
    this.ball.vy = v.y * speed;
    this.ball.lock = 0.18;
    this.ball.shot = shot;
    this.ball.shooter = p.side;
    if (this.sport === "soccer") this.ball.receiver = null;
    this.lastTouch = p.side;
    if (shot) {
      this.stats[p.side].shots++;
      this.emit("shot", { side: p.side });
    } else {
      this.stats[p.side].passes++;
      this.emit("pass", { side: p.side });
    }
    p.decision = 0.5;
  }
  pass(p = this.user, input = { x: 0, y: 0 }) {
    if (this.phase !== "play" || this.ball.owner !== p.id) return false;
    const dir = p.side ? 1 : -1;
    const v =
      Math.hypot(input.x, input.y) > 0.2
        ? norm(input.x, input.y)
        : { x: 0, y: dir };
    const mates = this.players.filter(
      (q) => q.side === p.side && q.id !== p.id && !q.keeper,
    );
    mates.sort((a, b) => {
      const score = (q) => {
        const d = distance(q, p);
        return (
          (((q.x - p.x) * v.x + (q.y - p.y) * v.y) / (d || 1)) * 150 - d * 0.16
        );
      };
      return score(b) - score(a);
    });
    const q = mates[0];
    if (!q) return false;
    this.release(
      p,
      q.x + q.vx * 0.16 - p.x,
      q.y + q.vy * 0.16 - p.y,
      this.rules.pass,
      false,
    );
    if (this.sport === "soccer") this.ball.receiver = q.id;
    return true;
  }
  shoot(p = this.user, power = 0.65, input = { x: 0, y: 0 }) {
    if (this.phase !== "play" || this.ball.owner !== p.id) return false;
    const gy = p.side ? this.rules.height + 5 : -5;
    const assist = p.side ? 1 : this.aimAssist;
    const gx =
      this.rules.width / 2 +
      clamp(input.x, -1, 1) * (this.rules.goal * 0.8 + 110 * (1 - assist));
    const error =
      (this.random() - 0.5) *
      (p.side ? this.difficulty.accuracy * 220 : 35 * (1 - assist));
    this.release(
      p,
      gx - p.x + error,
      gy - p.y,
      this.rules.shot * (0.65 + clamp(power, 0, 1) * 0.35),
      true,
    );
    return true;
  }
  tackle(p = this.user) {
    if (this.phase !== "play" || p.stun > 0 || p.decision > 0.05) return;
    const o = this.owner;
    p.decision = 0.8;
    p.stun = 0.13;
    const dir = norm((o || this.ball).x - p.x, (o || this.ball).y - p.y);
    p.vx += dir.x * 150;
    p.vy += dir.y * 150;
    if (
      o &&
      o.side !== p.side &&
      distance(p, o) < (this.sport === "hockey" ? 67 : 52)
    ) {
      this.stats[p.side].tackles++;
      o.stun = this.sport === "hockey" ? 0.65 : 0.38;
      this.ball.owner = null;
      this.ball.vx = dir.x * 235;
      this.ball.vy = dir.y * 235;
      this.ball.lock = 0.12;
      this.lastTouch = p.side;
      this.emit("tackle", { side: p.side });
    }
  }
  action(name, input = { x: 0, y: 0 }, power = 0.65) {
    if (
      this.sport === "soccer" &&
      ["restart", "restart_ready"].includes(this.phase)
    ) {
      if (this.restartData.side === 1) {
        if (name === "switch" || name === "pass") this.switchPlayer();
      } else if (["pass", "shoot"].includes(name)) {
        if (this.phase === "restart_ready")
          return takeFootballRestart(this, name, input, power);
        this.restartData.pending = { name, power };
      }
      return;
    }
    if (this.phase !== "play") return;
    if (name === "switch") return this.switchPlayer();
    if (name === "pass") {
      if (this.hasBall) return this.pass(this.user, input);
      return this.switchPlayer();
    }
    if (name === "shoot") {
      if (this.hasBall) return this.shoot(this.user, power, input);
      return this.tackle(this.user);
    }
  }
  restart(type, side, x, y) {
    if (this.sport === "soccer")
      return setupFootballRestart(this, type, side, x, y);
    this.ball.owner = null;
    this.ball.vx = this.ball.vy = 0;
    this.phase = "restart";
    this.timer = 1.15;
    this.restartData = {
      side,
      x: clamp(x, 28, this.rules.width - 28),
      y: clamp(y, 25, this.rules.height - 25),
    };
    this.message = type;
    this.emit("restart", { label: type });
  }
  resumeRestart() {
    const r = this.restartData;
    const ps = this.players
      .filter((p) => p.side === r.side && !p.keeper)
      .sort((a, b) => distance(a, r) - distance(b, r));
    const p = ps[0];
    p.x = r.x;
    p.y = r.y;
    p.vx = p.vy = 0;
    this.ball = {
      x: p.x,
      y: p.y,
      owner: p.id,
      vx: 0,
      vy: 0,
      lock: 0.8,
      shot: false,
    };
    this.lastTouch = r.side;
    if (!r.side && !this.autoplay) this.controlled = p.id;
    this.phase = "play";
    this.cooldown = 0.7;
  }
  goal(side) {
    this.score[side]++;
    this.phase = "goal";
    this.timer = this.sport === "soccer" ? 1.8 : 2.8;
    this.nextSide = 1 - side;
    this.message = "GOAL";
    this.emit("goal", { side, score: [...this.score] });
    if (this.period > this.rules.periods) this.winner = side;
  }
  finish() {
    this.phase = "finished";
    this.winner =
      this.score[0] === this.score[1]
        ? null
        : this.score[0] > this.score[1]
          ? 0
          : 1;
    this.emit("finished", { winner: this.winner });
  }
  step(dt, input = { x: 0, y: 0, sprint: false }) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
    if (this.phase === "finished") return;
    this.time += dt;
    if (
      this.sport === "soccer" &&
      ["restart", "restart_ready"].includes(this.phase)
    ) {
      stepFootballRestart(this, dt, input);
      return;
    }
    if (this.phase !== "play") {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.phase === "goal") {
          if (this.winner !== undefined) this.finish();
          else this.kickoff(this.nextSide);
        } else if (this.phase === "restart") this.resumeRestart();
        else if (this.phase === "break")
          this.kickoff(
            this.sport === "soccer" ? (this.period - 1) % 2 : this.period % 2,
          );
      }
      return;
    }
    if (!this.practice) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining === 0) {
        if (this.period < this.rules.periods) {
          this.period++;
          this.remaining = this.duration;
          this.phase = "break";
          this.timer = 2;
          this.message = this.sport === "hockey" ? "NEXT PERIOD" : "HALF TIME";
          this.emit("break");
          return;
        }
        if (this.score[0] !== this.score[1]) return this.finish();
        if (this.period === this.rules.periods) {
          this.period++;
          this.remaining = this.duration;
          this.message = "GOLDEN GOAL";
          this.emit("overtime");
        } else if (this.cup) {
          this.remaining = this.duration;
        } else return this.finish();
      }
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.ball.lock = Math.max(0, this.ball.lock - dt);
    if (this.sport === "soccer")
      this.ball.flight = Math.max(0, (this.ball.flight || 0) - dt);
    const owner = this.owner;
    if (owner) this.stats[owner.side].possession += dt;
    const nearest = [0, 1].map((side) =>
      this.players
        .filter((p) => p.side === side && !p.keeper)
        .sort((a, b) => distance(a, this.ball) - distance(b, this.ball))
        .map((p) => p.id),
    );
    this.players.forEach((p) => {
      p.stun = Math.max(0, p.stun - dt);
      p.decision -= dt;
      let tx = 0,
        ty = 0,
        burst = false;
      if (p.id === this.controlled) {
        tx = Number.isFinite(input.x) ? input.x : 0;
        ty = Number.isFinite(input.y) ? input.y : 0;
        const n = Math.max(1, Math.hypot(tx, ty));
        tx /= n;
        ty /= n;
        burst = input.sprint && p.stamina > 0.12;
      } else if (p.keeper) {
        const homeY = p.side ? 58 : this.rules.height - 58;
        const targetX = clamp(
          this.rules.width / 2 + (this.ball.x - this.rules.width / 2) * 0.32,
          this.rules.width / 2 - this.rules.goal * 0.42,
          this.rules.width / 2 + this.rules.goal * 0.42,
        );
        const targetY = homeY + (this.ball.y - homeY) * 0.018;
        const d = distance(p, { x: targetX, y: targetY });
        if (d > 3) {
          const v = norm(targetX - p.x, targetY - p.y);
          tx = v.x * Math.min(1, d / 30);
          ty = v.y * Math.min(1, d / 30);
        }
      } else {
        let target;
        const attack = p.side ? 1 : -1;
        const own = owner?.side === p.side;
        if (owner?.id === p.id) {
          target = {
            x: this.rules.width / 2 + Math.sin(this.time * 0.7 + p.id) * 110,
            y: p.side ? this.rules.height - 20 : 20,
          };
          const fromGoal = Math.abs(p.y - (p.side ? this.rules.height : 0));
          if (p.decision <= 0 && this.cooldown <= 0) {
            if (
              fromGoal < (this.sport === "soccer" ? 360 : 410) &&
              Math.abs(p.x - this.rules.width / 2) < 210
            ) {
              this.shoot(p, 0.65, {
                x: (this.random() - 0.5) * 0.9,
                y: attack,
              });
              p.decision = this.difficulty.reaction;
            } else if (this.random() < 0.24) {
              this.pass(p);
              p.decision = this.sport === "soccer" ? 1.1 : 0.7;
            } else
              p.decision =
                this.difficulty.reaction * (this.sport === "soccer" ? 2 : 1);
          }
        } else if (
          !owner &&
          this.sport === "soccer" &&
          this.ball.receiver === p.id
        ) {
          // The intended receiver comes to the pass instead of continuing a formation run.
          target = {
            x: clamp(
              this.ball.x + this.ball.vx * 0.12,
              18,
              this.rules.width - 18,
            ),
            y: clamp(
              this.ball.y + this.ball.vy * 0.12,
              18,
              this.rules.height - 18,
            ),
          };
        } else if (
          nearest[p.side].slice(0, owner ? 1 : 2).includes(p.id) &&
          (!own || !owner)
        ) {
          target = this.ball;
          if (
            owner &&
            owner.side !== p.side &&
            distance(p, owner) < 48 &&
            p.decision <= 0 &&
            this.cooldown <= 0
          )
            this.tackle(p);
        } else {
          const f = this.rules.formation[p.slot];
          const baseY = (p.side ? 1 - f[1] : f[1]) * this.rules.height;
          target = {
            x: clamp(
              f[0] * this.rules.width +
                (this.ball.x - this.rules.width / 2) * 0.24,
              38,
              this.rules.width - 38,
            ),
            y: clamp(
              baseY +
                (this.ball.y - this.rules.height / 2) * (own ? 0.36 : 0.26) +
                (own ? attack * 65 : 0),
              65,
              this.rules.height - 65,
            ),
          };
        }
        if (target) {
          const d = distance(p, target);
          if (d > 12) {
            const v = norm(target.x - p.x, target.y - p.y);
            tx = v.x * Math.min(1, d / 65);
            ty = v.y * Math.min(1, d / 65);
          }
        }
      }
      movePlayer(
        p,
        this.rules,
        dt,
        { x: tx, y: ty, sprint: burst },
        owner?.id === p.id,
      );
    });
    // Soft separation prevents teammate piles without moving the controlled player by AI.
    for (let i = 0; i < this.players.length; i++)
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i],
          b = this.players[j],
          d = distance(a, b);
        if (d > 0 && d < 24) {
          const n = norm(a.x - b.x, a.y - b.y),
            s = (24 - d) * 0.25;
          if (a.id !== this.controlled) {
            a.x += n.x * s;
            a.y += n.y * s;
          }
          if (b.id !== this.controlled) {
            b.x -= n.x * s;
            b.y -= n.y * s;
          }
        }
      }
    if (this.owner) {
      const p = this.owner;
      const facing = norm(p.fx, p.fy);
      this.ball.x = p.x + facing.x * 16;
      this.ball.y = p.y + facing.y * 16;
      this.ball.vx = this.ball.vy = 0;
      if (this.sport === "soccer") footballBoundary(this, { x: p.x, y: p.y });
      return;
    }
    const old = { x: this.ball.x, y: this.ball.y };
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const decay = Math.exp(-this.rules.ballDrag * dt);
    b.vx *= decay;
    b.vy *= decay;
    if (b.lock <= 0) {
      const candidates = this.players
        .filter(
          (p) =>
            p.stun <= 0 &&
            !(
              this.sport === "soccer" &&
              (this.ball.flight > 0 || this.ball.restartKicker === p.id)
            ) &&
            segmentDistance(p, old, b) < (p.keeper ? 25 : 19),
        )
        .sort((a, c) => distance(a, old) - distance(c, old));
      for (const p of candidates) {
        const speed = Math.hypot(b.vx, b.vy);
        if (this.sport === "soccer") {
          b.restartKicker = null;
          b.noDirectGoal = false;
        }
        if (b.shot && speed > 300 && !p.keeper) {
          if (p.side === b.shooter) continue;
          b.vx *= 0.4;
          b.vy *= -0.35;
          b.shot = false;
          b.lock = 0.08;
          this.lastTouch = p.side;
          this.emit("block");
          break;
        }
        if (p.keeper && b.shot) {
          this.stats[p.side].saves++;
          this.emit("save", { side: p.side });
          if (this.sport === "soccer" && speed < 630) {
            setupFootballRestart(this, "KEEPER BALL", p.side, p.x, p.y);
            break;
          }
          b.vx = (b.x - p.x) * 18 + (this.random() - 0.5) * 150;
          b.vy = p.side ? 280 : -280;
          b.lock = 0.25;
          b.shot = false;
          this.lastTouch = p.side;
          break;
        }
        if (!p.keeper) {
          b.owner = p.id;
          if (this.sport === "soccer") b.receiver = null;
          b.shot = false;
          this.lastTouch = p.side;
          if (p.side === 0 && !this.autoplay) this.controlled = p.id;
          p.decision = this.difficulty.reaction;
          break;
        } else {
          if (this.sport === "soccer") {
            setupFootballRestart(this, "KEEPER BALL", p.side, p.x, p.y);
            break;
          }
          b.vx = (this.rules.width / 2 - p.x) * 2;
          b.vy = p.side ? 350 : -350;
          b.lock = 0.3;
          this.lastTouch = p.side;
          break;
        }
      }
    }
    if (b.owner !== null || this.phase !== "play") return;
    if (this.sport === "soccer") {
      footballBoundary(this, old);
      return;
    }
    // Swept line crossing: fast shots cannot skip a goal or score through the side wall.
    if (b.y < 0 || b.y > this.rules.height) {
      const line = b.y < 0 ? 0 : this.rules.height;
      const t = (line - old.y) / (b.y - old.y || 1);
      const crossX = old.x + (b.x - old.x) * clamp(t, 0, 1);
      if (Math.abs(crossX - this.rules.width / 2) < this.rules.goal / 2) {
        this.goal(b.y < 0 ? 0 : 1);
        return;
      }
    }
    if (this.sport === "hockey") {
      if (b.x < 8 || b.x > 672) {
        b.x = clamp(b.x, 8, 672);
        b.vx *= -0.83;
        this.emit("board");
      }
      if (b.y < 8 || b.y > 1072) {
        b.y = clamp(b.y, 8, 1072);
        b.vy *= -0.82;
        this.emit("board");
      }
    }
  }

  snapshot() {
    return {
      time: this.time,
      score: [...this.score],
      players: this.players.map((p) => ({ ...p })),
      ball: { ...this.ball },
      controlled: this.controlled,
      sport: this.sport,
    };
  }
}
