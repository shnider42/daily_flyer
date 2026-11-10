import { movePlayer } from "./movement.js";
import { playerActionRatings, planAction, releaseAction } from "./ballistics.js";
import {
  setupFootballRestart,
  stepFootballRestart,
  takeFootballRestart,
  footballBoundary,
} from "../sports/football.js";
import {
  resetFootballFlight,
  clearFootballActions,
  footballDefensiveHolds,
  footballCanCross,
  footballThroughPass,
  footballLobPass,
  stepFootballBall,
  footballReachable,
  footballContainAxes,
  footballRushTarget,
  startFootballSlide,
  stepFootballSlide,
} from "../sports/football-controls.js";
import { SPORTS, DIFFICULTY, SOCCER_TOUCH_ASSIST } from "../sports/rules.js";
import {
  hockeyActive, canPlayHockeyPuck, hockeyControlContext, setHockeyControllers,
  hockeyHumanInputs, hockeySwitchPlayer, hockeyPossessionControl, hockeyAction,
  resetHockeyFlight, stepHockeyPlayer, stepHockeyDiscipline, stepHockeyPuck,
  hockeyReachable, hockeyBoundary, hockeyGoalPenalties,
} from "../sports/hockey.js";
import { clamp, norm, distance, seeded, segmentDistance } from "./math.js";
export const ENGINE_VERSION = "1.7.1";
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
    controlMode = "keyboard",
    touchAssist = true,
  }) {
    this.rules = SPORTS[sport];
    if (!this.rules || !home || !away)
      throw Error("Invalid match configuration");
    this.sport = sport;
    this.autoplay = autoplay;
    this.teams = [home, away];
    this.difficultyName = DIFFICULTY[difficulty] ? difficulty : "club";
    this.difficulty = DIFFICULTY[this.difficultyName];
    this.setControlMode(controlMode);
    this.setTouchAssist(touchAssist);
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
    if (sport === "hockey") {
      this.puckEpoch = 0;
      this.penalties = [];
      this.fight = null;
      this.fightChallenge = null;
      this.controllers = [];
      this.localControllerId = null;
    }
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
          position: data.position,
          ratings: playerActionRatings(data, this.sport),
          keeper: i === 0,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          stamina: 1,
          stun: 0,
          decision: this.random(),
          tackleCooldown: 0,
          tackleTarget: null,
          tackleReadyIn: 0,
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
    return this.owner?.side === (this.sport === "hockey" ? this.user?.side ?? 0 : 0);
  }
  canPlayPuck(p = this.user) {
    return canPlayHockeyPuck(this, p);
  }
  puckControlContext(p = this.user) {
    return hockeyControlContext(this, p);
  }
  isPlayerActive(p) {
    return this.sport !== "hockey" || hockeyActive(p);
  }
  setControllers(seats, localSeatId = null) {
    return setHockeyControllers(this, seats, localSeatId);
  }
  controllerAction(id, name, input = {}, power = 0.65, details = {}) {
    const seat = this.controllers?.find((s) => s.id === id);
    if (!seat) return false;
    return hockeyAction(this, name, input, power, details, seat);
  }
  get manpower() {
    return [0, 1].map((side) => this.players.filter((p) => p.side === side && !p.keeper && hockeyActive(p)).length);
  }
  get touchProfile() {
    return this.sport === "soccer" &&
      this.controlMode === "touch" &&
      this.touchAssist &&
      !this.autoplay
      ? SOCCER_TOUCH_ASSIST[this.difficultyName]
      : null;
  }
  setControlMode(mode) {
    this.controlMode = mode === "touch" ? "touch" : "keyboard";
  }
  setTouchAssist(enabled) {
    this.touchAssist = Boolean(enabled);
  }
  canCross(p = this.user) {
    return footballCanCross(this, p);
  }
  throughPass(p = this.user, input = { x: 0, y: 0 }) {
    return footballThroughPass(this, p, input);
  }
  lobPass(p = this.user, input = { x: 0, y: 0 }, power = 0.65) {
    return footballLobPass(this, p, input, power);
  }
  slide(p = this.user, input = { x: 0, y: 0 }) {
    return startFootballSlide(this, p, input);
  }
  aimPreview(name, input = { x: 0, y: 0 }, power = 0.65, actor = this.user) {
    if (!actor) return null;
    let action = name, strength = power;
    if (this.sport === "soccer" && ["restart", "restart_ready"].includes(this.phase)) {
      const restart = this.restartData;
      if (!restart || actor.id !== restart.taker) return null;
      if (name === "shoot" && ["KEEPER BALL", "GOAL KICK"].includes(restart.type)) {
        action = "lob";
        strength = 1;
      }
      else if (name === "shoot" && ["KICK-OFF", "THROW-IN"].includes(restart.type)) action = "ground";
    } else if (this.phase !== "play" || actor.slideTimer > 0 ||
        (this.sport === "hockey" ? !this.canPlayPuck(actor) : this.ball.owner !== actor.id)) return null;
    return planAction(this, actor, action, input, strength);
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
      if (!hockeyActive(p)) return;
      const f = this.rules.formation[p.slot];
      p.x = f[0] * this.rules.width;
      p.y = (p.side ? 1 - f[1] : f[1]) * this.rules.height;
      p.vx = p.vy = 0;
      p.stun = 0;
    });
    const p = this.players.find((p) => p.side === side && p.slot === this.rules.count - 1 && hockeyActive(p)) ||
      this.players.find((p) => p.side === side && !p.keeper && hockeyActive(p));
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
      z: 0, vz: 0, airTime: 0, airTarget: null,
    };
    this.puckEpoch++;
    this.fightChallenge = null;
    this.lastTouch = side;
    hockeyPossessionControl(this, p);
    this.phase = "play";
    this.cooldown = 0.3;
  }
  switchPlayer() {
    if (this.sport === "hockey")
      return hockeySwitchPlayer(this, this.controllers?.find((s) => s.id === this.localControllerId) || null);
    if (this.hasBall) {
      this.controlled = this.owner.id;
      return;
    }
    const b = this.ball;
    let choices = this.players.filter(
      (p) => !p.side && !p.keeper && p.id !== this.controlled,
    );
    if (this.touchProfile) {
      // A defender in the attacker's path is often more useful than the nearest
      // teammate chasing from behind. Keep proximity dominant over this bias.
      const threat = this.owner || b;
      const target = {
        x: clamp(threat.x + (threat.vx || 0) * 0.22, 18, this.rules.width - 18),
        y: clamp(threat.y + (threat.vy || 0) * 0.22, 18, this.rules.height - 18),
      };
      const score = (p) =>
        distance(p, target) +
        (this.owner?.side === 1 ? clamp(target.y - p.y, 0, 120) * 0.4 : 0);
      choices.sort((a, c) => score(a) - score(c));
    } else choices.sort((a, c) => distance(a, b) - distance(c, b));
    if (choices[0]) this.controlled = choices[0].id;
  }
  release(p, dx, dy, speed, shot, kind = "pass") {
    const v = norm(dx, dy);
    this.ball.owner = null;
    this.ball.x = p.x + v.x * (this.sport === "soccer" ? 0 : 21);
    this.ball.y = p.y + v.y * (this.sport === "soccer" ? 0 : 21);
    this.ball.vx = v.x * speed;
    this.ball.vy = v.y * speed;
    this.ball.lock = 0.18;
    this.ball.shot = shot;
    this.ball.shooter = p.side;
    this.ball.intendedTarget = null;
    this.ball.actionRating = null;
    this.ball.accuracyRadius = 0;
    this.ball.actionKey = null;
    if (this.sport === "soccer") {
      resetFootballFlight(this.ball);
      this.ball.receiver = null;
      this.ball.passTarget = null;
      this.ball.passType = shot ? "shot" : "ground";
      this.ball.flight = 0;
      this.ball.firstTouch = 0;
      this.ball.firstTouchOwner = null;
      this.ball.passer = null;
      this.ball.passerLock = 0;
    } else {
      this.puckEpoch++;
      resetHockeyFlight(this.ball);
      this.ball.flightKind = null;
      this.ball.launch = null;
      this.ball.receiver = null;
      this.ball.passTarget = null;
      this.ball.passer = p.id;
      this.ball.passerLock = 0.24;
    }
    this.lastTouch = p.side;
    if (shot) {
      this.stats[p.side].shots++;
      this.emit("shot", { side: p.side });
    } else if (kind === "pass") {
      this.stats[p.side].passes++;
      this.emit("pass", { side: p.side });
    } else this.emit(kind, { side: p.side, player: p.id });
    p.decision = 0.5;
  }
  pass(p = this.user, input = { x: 0, y: 0 }) {
    if (!p || this.phase !== "play" || this.ball.owner !== p.id || p.slideTimer > 0) return false;
    const plan = planAction(this, p, "ground", input);
    if (!plan) return false;
    const result = releaseAction(this, p, plan);
    const q = this.players[plan.receiverId];
    this.ball.receiver = q.id;
    this.ball.passTarget = { ...result.target };
    // Even keyboard passes need to unlock before a close receiver. Excluding
    // just the passer avoids an immediate re-pickup without swallowing a pass.
    const profile = !p.side ? this.touchProfile : null;
    this.ball.lock = clamp(
      (distance(p, q) - (this.sport === "hockey" ? 38 : (profile?.receiveRadius || 19) + 10)) / result.speed,
      this.sport === "hockey" ? 0.02 : 0.025,
      this.sport === "hockey" ? 0.14 : 0.18,
    );
    this.ball.passer = p.id;
    this.ball.passerLock = 0.28;
    return true;
  }
  shoot(p = this.user, power = 0.65, input = { x: 0, y: 0 }) {
    if (!p || this.phase !== "play" || this.ball.owner !== p.id || p.slideTimer > 0) return false;
    const plan = planAction(this, p, "shoot", input, power);
    if (!plan) return false;
    releaseAction(this, p, plan);
    return true;
  }
  tackle(p = this.user) {
    if (!p || this.phase !== "play" || p.stun > 0 || p.slideTimer > 0) return false;
    const profile = this.touchProfile;
    const manualTouch = profile && p.id === this.controlled && p.side === 0;
    // An AI thinking/pass timer must not swallow the user's tackle after a
    // switch. Manual touch tackles instead have their own anti-spam cooldown.
    if (manualTouch ? p.tackleCooldown > 0 : p.decision > 0.05) return false;
    const o = this.owner;
    if (
      profile &&
      p.side === 1 &&
      o?.side === 0 &&
      this.ball.firstTouchOwner === o.id &&
      this.ball.firstTouch > 0
    ) return false;
    p.decision = 0.8;
    p.tackleCooldown = manualTouch ? profile.tackleCooldown : 0.8;
    p.stun = 0.13;
    const dir = norm((o || this.ball).x - p.x, (o || this.ball).y - p.y);
    p.vx += dir.x * 150;
    p.vy += dir.y * 150;
    const reach = manualTouch
      ? profile.tackleReach
      : this.sport === "hockey" ? 67 : 52;
    if (o && o.side !== p.side && distance(p, o) < reach) {
      this.stats[p.side].tackles++;
      o.stun = this.sport === "hockey" ? 0.65 : 0.38;
      this.ball.owner = null;
      if (this.sport === "hockey") {
        this.puckEpoch++;
        resetHockeyFlight(this.ball);
        this.ball.receiver = null;
        this.ball.passTarget = null;
        if (this.ball.launch) this.ball.launch.deflected = true;
      }
      if (this.sport === "soccer") {
        resetFootballFlight(this.ball);
        this.ball.receiver = null;
        this.ball.passTarget = null;
        this.ball.passType = null;
      }
      this.ball.firstTouch = 0;
      this.ball.firstTouchOwner = null;
      this.ball.vx = dir.x * 235;
      this.ball.vy = dir.y * 235;
      this.ball.lock = 0.12;
      this.lastTouch = p.side;
      this.emit("tackle", { side: p.side });
    }
    return true;
  }
  action(name, input = { x: 0, y: 0 }, power = 0.65, details = {}) {
    if (this.sport === "hockey") {
      const seat = this.controllers?.find((s) => s.id === this.localControllerId) || null;
      return hockeyAction(this, name, input, power, details, seat);
    }
    if (
      this.sport === "soccer" &&
      ["restart", "restart_ready"].includes(this.phase)
    ) {
      if (this.restartData.side === 1) {
        if (name === "switch" || name === "pass") this.switchPlayer();
      } else if (["pass", "ground", "lob", "through", "shoot"].includes(name)) {
        if (this.phase === "restart_ready")
          return takeFootballRestart(this, name, input, power);
        this.restartData.pending = { name, power };
      }
      return;
    }
    if (this.phase !== "play") return;
    if (name === "switch") return this.switchPlayer();
    if (this.sport === "soccer") {
      if (name === "ground") return this.hasBall ? this.pass(this.user, input) : false;
      if (name === "through") return this.hasBall ? this.throughPass(this.user, input) : false;
      if (name === "lob") return this.hasBall ? this.lobPass(this.user, input, power) : false;
      if (name === "slide") return this.slide(this.user, input);
    }
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
    resetHockeyFlight(this.ball);
    this.puckEpoch++;
    this.fightChallenge = null;
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
      .filter((p) => p.side === r.side && !p.keeper && hockeyActive(p))
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
      z: 0, vz: 0, airTime: 0, airTarget: null,
    };
    this.puckEpoch++;
    this.lastTouch = r.side;
    hockeyPossessionControl(this, p);
    this.phase = "play";
    this.cooldown = 0.7;
  }
  goal(side) {
    if (this.sport === "soccer") clearFootballActions(this);
    else hockeyGoalPenalties(this, side);
    this.score[side]++;
    this.phase = "goal";
    this.timer = this.sport === "soccer" ? 1.8 : 2.8;
    this.nextSide = 1 - side;
    this.message = "GOAL";
    this.emit("goal", { side, score: [...this.score] });
    if (this.period > this.rules.periods) this.winner = side;
  }
  finish() {
    if (this.sport === "soccer") clearFootballActions(this);
    this.phase = "finished";
    this.winner =
      this.score[0] === this.score[1]
        ? null
        : this.score[0] > this.score[1]
          ? 0
          : 1;
    this.emit("finished", { winner: this.winner });
  }
  step(dt, input = { x: 0, y: 0, sprint: false }, controllerInputs = {}) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
    if (this.phase === "finished") return;
    this.time += dt;
    const hockeyInputs = this.sport === "hockey" ? hockeyHumanInputs(this, input, controllerInputs) : null;
    if (this.sport === "hockey" && stepHockeyDiscipline(this, dt, hockeyInputs)) return;
    const defensiveHolds = this.sport === "soccer"
      ? footballDefensiveHolds(this, input)
      : { contain: false, keeperRush: false };
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
          if (this.sport === "soccer") clearFootballActions(this);
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
    if (this.sport === "soccer") {
      this.ball.flight = Math.max(0, (this.ball.flight || 0) - dt);
      this.ball.firstTouch = Math.max(0, (this.ball.firstTouch || 0) - dt);
      this.ball.passerLock = Math.max(0, (this.ball.passerLock || 0) - dt);
    } else this.ball.passerLock = Math.max(0, (this.ball.passerLock || 0) - dt);
    const profile = this.touchProfile;
    const owner = this.owner;
    if (owner) this.stats[owner.side].possession += dt;
    const nearest = [0, 1].map((side) =>
      this.players
        .filter((p) => p.side === side && !p.keeper && (this.sport !== "hockey" || hockeyActive(p)))
        .sort((a, b) => distance(a, this.ball) - distance(b, this.ball))
        .map((p) => p.id),
    );
    this.players.forEach((p) => {
      if (this.sport === "hockey" && !hockeyActive(p)) return;
      p.stun = Math.max(0, p.stun - dt);
      p.decision -= dt;
      p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      if (this.sport === "hockey") stepHockeyPlayer(this, p, dt);
      if (this.sport === "soccer") {
        p.containing = false;
        p.keeperRushing = false;
        if (stepFootballSlide(this, p, dt)) return;
      }
      const touchPressure = profile && p.side === 1 && owner?.side === 0;
      if (touchPressure && distance(p, owner) < 72) {
        if (p.tackleTarget !== owner.id) {
          p.tackleTarget = owner.id;
          p.tackleReadyIn = profile.tackleReaction;
        } else p.tackleReadyIn = Math.max(0, p.tackleReadyIn - dt);
      } else if (!touchPressure || distance(p, owner) > 90) {
        p.tackleTarget = null;
        p.tackleReadyIn = 0;
      }
      let tx = 0,
        ty = 0,
        burst = false;
      const humanInput = this.sport === "hockey" ? hockeyInputs.get(p.id) : p.id === this.controlled ? input : null;
      if (humanInput) {
        tx = Number.isFinite(humanInput.x) ? humanInput.x : 0;
        ty = Number.isFinite(humanInput.y) ? humanInput.y : 0;
        const n = Math.max(1, Math.hypot(tx, ty));
        tx /= n;
        ty /= n;
        if (defensiveHolds.contain && !p.keeper) {
          p.containing = true;
          const axes = footballContainAxes(this, p, { x: tx, y: ty });
          tx = axes.x;
          ty = axes.y;
        }
        burst = humanInput.sprint && p.stamina > 0.12;
      } else if (p.keeper) {
        const homeY = p.side ? 58 : this.rules.height - 58;
        let targetX = clamp(
          this.rules.width / 2 + (this.ball.x - this.rules.width / 2) * 0.32,
          this.rules.width / 2 - this.rules.goal * 0.42,
          this.rules.width / 2 + this.rules.goal * 0.42,
        );
        let targetY = homeY + (this.ball.y - homeY) * 0.018;
        if (p.side === 0 && defensiveHolds.keeperRush) {
          p.keeperRushing = true;
          const target = footballRushTarget(this);
          targetX = target.x;
          targetY = target.y;
        }
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
          this.ball.receiver === p.id
        ) {
          // Ground passes are met; through balls and lofts ask the receiver to
          // continue to their lead/landing point instead of turning back.
          target = this.ball.passTarget || {
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
            this.cooldown <= 0 &&
            (!touchPressure || p.tackleReadyIn <= 0)
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
            // Apply pressure only to opponents closing a human ball carrier.
            // The existing difficulty press rating now distinguishes the tiers.
            const pressure = touchPressure && target === this.ball
              ? Math.min(1, profile.pressureSpeed * this.difficulty.press)
              : 1;
            tx = v.x * Math.min(1, d / 65) * pressure;
            ty = v.y * Math.min(1, d / 65) * pressure;
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
        if (this.sport === "hockey" && (!hockeyActive(a) || !hockeyActive(b))) continue;
        if (d > 0 && d < 24) {
          const n = norm(a.x - b.x, a.y - b.y),
            s = (24 - d) * 0.25;
          if (this.sport === "hockey" ? !hockeyInputs.has(a.id) : a.id !== this.controlled) {
            a.x += n.x * s;
            a.y += n.y * s;
          }
          if (this.sport === "hockey" ? !hockeyInputs.has(b.id) : b.id !== this.controlled) {
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
      if (this.sport === "hockey") this.ball.z = 0;
      if (this.sport === "soccer") {
        this.ball.z = 0;
        // A rushing keeper can claim a carried ball too; the loose-ball loop
        // below is never reached while an attacker still owns it.
        const keeper = this.players.find((q) => q.keeper && q.side === 0);
        if (defensiveHolds.keeperRush && p.side === 1 && keeper?.stun <= 0 &&
            distance(keeper, this.ball) < 29) {
          this.emit("keeper-claim", { side: 0 });
          setupFootballRestart(this, "KEEPER BALL", 0, keeper.x, keeper.y);
          return;
        }
        footballBoundary(this, { x: p.x, y: p.y, z: 0 });
      }
      return;
    }
    const old = {
      x: this.ball.x, y: this.ball.y,
      z: this.ball.z || 0, vz: this.ball.vz || 0, dt,
      flightKind: this.ball.flightKind,
    };
    const b = this.ball;
    if (this.sport === "soccer") stepFootballBall(this, dt);
    else stepHockeyPuck(this, dt);
    if (b.lock <= 0) {
      const candidates = this.players
        .filter(
          (p) =>
            p.stun <= 0 &&
            (this.sport !== "hockey" || (hockeyActive(p) && hockeyReachable(p, old, b))) &&
            !(b.passerLock > 0 && b.passer === p.id) &&
            !(
              this.sport === "soccer" &&
              (this.ball.flight > 0 || this.ball.restartKicker === p.id ||
                p.slideTimer > 0 || !footballReachable(p, old, b))
            ) &&
            segmentDistance(p, old, b) <
              (p.keeper ? 25 :
                profile && !p.side && b.receiver === p.id && !b.shot
                  ? profile.receiveRadius : 19),
        )
        .sort((a, c) => distance(a, old) - distance(c, old));
      for (const p of candidates) {
        const speed = Math.hypot(b.vx, b.vy);
        if (this.sport === "soccer") {
          b.restartKicker = null;
          b.noDirectGoal = false;
        } else if (b.launch) b.launch.deflected = true;
        if (b.shot && speed > 300 && !p.keeper) {
          if (p.side === b.shooter) continue;
          b.vx *= 0.4;
          b.vy *= -0.35;
          b.shot = false;
          if (this.sport === "soccer") {
            resetFootballFlight(b);
            b.passTarget = null;
            b.receiver = null;
          } else {
            resetHockeyFlight(b);
            b.receiver = null;
            b.passTarget = null;
          }
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
          if (this.sport === "soccer") {
            resetFootballFlight(b);
            b.passTarget = null;
            b.receiver = null;
          } else {
            resetHockeyFlight(b);
            b.receiver = null;
            b.passTarget = null;
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
          if (this.sport === "soccer") {
            resetFootballFlight(b);
            b.receiver = null;
            b.passTarget = null;
            b.passType = null;
            // This starts once per actual collection, never every carried frame.
            // It prevents an instant turnover but expires even while standing.
            b.firstTouch = profile && p.side === 0 ? profile.receiveGrace : 0;
            b.firstTouchOwner = b.firstTouch ? p.id : null;
          } else {
            resetHockeyFlight(b);
            b.receiver = null;
            b.passTarget = null;
            b.flightKind = null;
          }
          b.shot = false;
          this.lastTouch = p.side;
          if (this.sport === "hockey") hockeyPossessionControl(this, p);
          else if (p.side === 0 && !this.autoplay) this.controlled = p.id;
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
    hockeyBoundary(this, old);
  }

  snapshot() {
    return {
      time: this.time,
      score: [...this.score],
      players: this.players.map((p) => ({
        ...p,
        ...(p.ratings ? { ratings: { ...p.ratings } } : {}),
        ...(p.slideDir ? { slideDir: { ...p.slideDir } } : {}),
      })),
      ball: {
        ...this.ball,
        ...(this.ball.intendedTarget ? { intendedTarget: { ...this.ball.intendedTarget } } : {}),
        ...(this.ball.airTarget ? { airTarget: { ...this.ball.airTarget } } : {}),
        ...(this.ball.passTarget ? { passTarget: { ...this.ball.passTarget } } : {}),
      },
      controlled: this.controlled,
      sport: this.sport,
      ...(this.sport === "hockey" ? {
        controllers: this.controllers.map((seat) => ({ ...seat })),
        localControllerId: this.localControllerId,
        penalties: this.penalties.map((p) => ({ ...p })),
        fight: this.fight ? { ...this.fight, players: [...this.fight.players] } : null,
        fightChallenge: this.fightChallenge ? { ...this.fightChallenge } : null,
        puckEpoch: this.puckEpoch,
      } : {}),
    };
  }
}
