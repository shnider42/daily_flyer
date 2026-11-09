import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Match } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";
import { HOCKEY, addHockeyPenalty, hockeyPossessionControl } from "../../daily_flyer/themes/pocket_sports_assets/sports/hockey.js";

const teams = JSON.parse(fs.readFileSync(new URL("../../daily_flyer/themes/pocket_sports_assets/data/teams-hockey.json", import.meta.url))).teams;
function make(extra = {}) {
  const g = new Match({ sport: "hockey", home: teams[0], away: teams[1], practice: true, seed: 21, ...extra });
  g.cooldown = 0;
  for (const p of g.players) Object.assign(p, { x: 50, y: 1250, stun: 99, decision: 99, vx: 0, vy: 0 });
  const p = g.user;
  Object.assign(p, { x: 440, y: 900, stun: 0, decision: 0, fx: 0, fy: -1 });
  Object.assign(g.ball, { x: p.x, y: p.y, owner: p.id, lock: 0, vx: 0, vy: 0, z: 0, vz: 0 });
  return g;
}
function tick(g, seconds, input = {}, controls = {}) {
  for (let t = 0; t < seconds - 0.000001; t += 1 / 60) g.step(Math.min(1 / 60, seconds - t), input, controls);
}
const speed = (g) => Math.hypot(g.ball.vx, g.ball.vy);
function fightFixture() {
  const g = make();
  const p = g.players[5], q = g.players[11];
  Object.assign(p, { x: 440, y: 700, stun: 0, decision: 99 });
  Object.assign(q, { x: 475, y: 700, stun: 0, decision: 99 });
  Object.assign(g.ball, { owner: null, x: 100, y: 100, vx: 0, vy: 0 });
  g.setControllers([
    { id: "home", side: 0, mode: "skater", playerId: p.id },
    { id: "away", side: 1, mode: "skater", playerId: q.id },
  ]);
  return { g, p, q };
}

test("the larger hockey rink keeps skating and baseline puck speeds", () => {
  const g = make();
  assert.deepEqual([g.rules.width, g.rules.height], [880, 1400]);
  assert.deepEqual([g.rules.speed, g.rules.pass, g.rules.shot], [235, 650, 970]);
  Object.assign(g.ball, { owner: null, x: 878, y: 700, vx: 600, vy: 0 });
  g.step(1 / 60);
  assert.ok(g.ball.x <= 872 && g.ball.vx < 0, "the board physics follows the new width");
});

test("playable puck leeway is actor-local, low, and physically close", () => {
  const g = make(), p = g.user, mate = g.players[2];
  assert.equal(g.canPlayPuck(), true);
  g.ball.owner = mate.id;
  assert.equal(g.hasBall, true);
  assert.equal(g.canPlayPuck(), false, "a teammate owning the puck does not grant the actor possession");
  Object.assign(g.ball, { owner: null, x: p.x + 30, y: p.y, z: 0, lock: 0 });
  assert.equal(g.canPlayPuck(), true);
  g.ball.z = HOCKEY.stickHeight + 1;
  assert.equal(g.canPlayPuck(), false);
  g.ball.z = 0; g.ball.x = p.x + HOCKEY.reach + 1;
  assert.equal(g.canPlayPuck(), false);
  g.ball.x = p.x + 20; g.ball.lock = 0.1;
  assert.equal(g.canPlayPuck(), false);
});

test("A can make a one-touch pass from a reachable loose puck", () => {
  const g = make(), p = g.user;
  Object.assign(g.players[3], { x: p.x, y: p.y - 220 });
  Object.assign(g.ball, { owner: null, x: p.x + 20, y: p.y, lock: 0 });
  assert.equal(g.action("hockey-pass", { x: 0, y: -1 }), true);
  assert.equal(g.ball.owner, null);
  assert.equal(g.stats[0].passes, 1);
  assert.ok(speed(g) > 600);
  assert.equal(g.canPlayPuck(p), false, "a passer cannot immediately scoop up the release");
});

test("a short ground pass reaches a stationary human teammate without changing either lock", () => {
  const g = make(), p = g.players[5], receiver = g.players[3];
  Object.assign(p, { x: 440, y: 900 });
  Object.assign(receiver, { x: 440, y: 840, stun: 0, decision: 99 });
  Object.assign(g.ball, { x: p.x, y: p.y, owner: p.id });
  g.setControllers([
    { id: "passer", side: 0, mode: "skater", playerId: p.id },
    { id: "receiver", side: 0, mode: "skater", playerId: receiver.id },
  ], "passer");
  assert.equal(g.action("hockey-pass", { x: 0, y: -1 }), true);
  assert.equal(g.ball.owner, null, "passing still creates a physical free puck");
  tick(g, 0.25);
  assert.equal(g.ball.owner, receiver.id);
  assert.deepEqual(g.controllers.map((s) => s.playerId), [p.id, receiver.id]);
  assert.equal(g.controlled, p.id);
  assert.equal(receiver.y, 840);
});

test("a charge context survives pickup of its loose puck but not a new possession", () => {
  const g = make(), p = g.user;
  Object.assign(g.ball, { owner: null, x: p.x + 15, y: p.y, lock: 0 });
  const context = g.puckControlContext();
  g.ball.owner = p.id;
  assert.equal(g.puckControlContext(), context);
  g.release(p, 0, -1, 650, false);
  g.ball.owner = p.id;
  assert.notEqual(g.puckControlContext(), context);
  g.ball.owner = 8;
  assert.equal(g.puckControlContext(), null);
});

test("tap B releases a wrist shot; holding B commits to a stronger slap shot", () => {
  const wrist = make(), slap = make();
  assert.equal(wrist.action("hockey-shot", { x: 0, y: -1 }, 0.22, { heldSeconds: 0.1 }), true);
  const wristSpeed = speed(wrist);
  assert.equal(wrist.ball.shotStyle, "wrist");
  assert.equal(wrist.ball.owner, null);
  assert.equal(slap.action("hockey-shot", { x: 0, y: -1 }, 1, { heldSeconds: 0.9 }), true);
  assert.ok(slap.user.shotWindup > 0);
  assert.equal(slap.ball.owner, slap.user.id);
  tick(slap, 0.15);
  assert.equal(slap.ball.shotStyle, "slap");
  assert.equal(slap.ball.owner, null);
  assert.ok(speed(slap) > wristSpeed * 1.3);
  assert.equal(slap.stats[0].shots, 1);
});

test("losing the puck during a slap windup cancels the shot", () => {
  const g = make(), p = g.user;
  g.action("hockey-shot", {}, 1, { heldSeconds: 0.7 });
  g.ball.owner = 8;
  tick(g, 0.2);
  assert.equal(p.shotWindup, 0);
  assert.equal(p.pendingShot, null);
  assert.equal(g.stats[0].shots, 0);
});

test("held-shot poses use the actor's uninterrupted puck control and reset at stoppages", () => {
  const g = make(), p = g.user;
  Object.assign(g.ball, { owner: null, x: p.x + 10, y: p.y, lock: 0 });
  tick(g, 0.5, { shotHeld: true });
  assert.ok(p.shotHold >= 0.49, "a nearby pickup does not break the held-shot pose");
  g.ball.owner = 8;
  tick(g, 0.02, { shotHeld: true });
  assert.equal(p.shotHold, 0);
  g.ball.owner = p.id;
  tick(g, 0.2, { shotHeld: true });
  assert.equal(p.shotHold, 0, "reacquiring the puck cannot revive a cancelled hold");
  tick(g, 0.02);
  tick(g, 0.2, { shotHeld: true });
  assert.ok(p.shotHold >= 0.19);
  g.restart("FACE-OFF", 0, 440, 700);
  tick(g, 0.02, { shotHeld: true });
  assert.equal(p.shotHold, 0);
  assert.equal(g.stats[0].shots, 0, "pose accumulation itself does not shoot");
});

test("remote shot holds are attached to their seat's own actor", () => {
  const g = make(), p = g.user, q = g.players[11];
  q.stun = 0;
  g.setControllers([
    { id: "home", side: 0, mode: "skater", playerId: p.id },
    { id: "away", side: 1, mode: "skater", playerId: q.id },
  ]);
  tick(g, 0.3, {}, { home: { shotHeld: true }, away: { shotHeld: true } });
  assert.ok(p.shotHold >= 0.29);
  assert.equal(q.shotHold, 0);
  g.ball.owner = q.id;
  tick(g, 0.02, {}, { home: { shotHeld: true }, away: {} });
  tick(g, 0.2, {}, { home: { shotHeld: true }, away: { shotHeld: true } });
  assert.equal(p.shotHold, 0);
  assert.ok(q.shotHold >= 0.19);
});

test("a longer Y hold produces a higher, longer actual dump", () => {
  const low = make(), high = make();
  for (const [g, power] of [[low, 0.1], [high, 1]]) {
    g.action("hockey-dump", { x: 0, y: -1 }, power);
    assert.equal(g.ball.owner, null);
    assert.equal(g.ball.flightKind, "dump");
  }
  assert.ok(high.ball.airTime > low.ball.airTime * 2);
  assert.ok(high.ball.airTarget.y < low.ball.airTarget.y - 500);
  tick(low, 0.2); tick(high, 0.2);
  assert.ok(high.ball.z > low.ball.z * 2);
  assert.equal(high.stats[0].shots, 0, "a dump is not counted as a shot");
});

test("X saucer pass clears a low stick and arrives at its receiver", () => {
  const g = make(), p = g.players[5], receiver = g.players[3], defender = g.players[8];
  Object.assign(p, { x: 440, y: 850 });
  Object.assign(receiver, { x: 440, y: 520, stun: 0, decision: 99 });
  Object.assign(defender, { x: 440, y: 685, stun: 0, decision: 99 });
  g.setControllers([
    { id: "home", side: 0, mode: "skater", playerId: p.id },
    { id: "away", side: 1, mode: "skater", playerId: defender.id },
  ], "home");
  Object.assign(g.ball, { x: p.x, y: p.y, owner: p.id });
  g.action("hockey-saucer", { x: 0, y: -1 });
  assert.equal(g.ball.receiver, receiver.id);
  assert.equal(g.ball.flightKind, "saucer");
  let cleared = false;
  for (let i = 0; i < 90 && g.ball.owner === null; i++) {
    g.step(1 / 60);
    if (Math.abs(g.ball.y - defender.y) < 25 && g.ball.z > HOCKEY.stickHeight) cleared = true;
    assert.notEqual(g.ball.owner, defender.id);
  }
  assert.ok(cleared);
  assert.equal(g.ball.owner, receiver.id);
});

test("a missed saucer receiver follows the rolling puck after touchdown", () => {
  const g = make(), receiver = g.players[3];
  Object.assign(receiver, { x: 440, y: 700, stun: 0.15, decision: 99 });
  Object.assign(g.ball, {
    owner: null, x: 440, y: 700, vx: 0, vy: -650, z: 1, vz: -100,
    airTime: 0.01, flightKind: "saucer", receiver: receiver.id, lock: 0,
    passTarget: { x: 440, y: 700 },
  });
  tick(g, 0.35);
  assert.equal(g.ball.passTarget, null);
  assert.ok(receiver.y < 690, "the receiver chases the missed puck instead of waiting at its old landing point");
});

for (const [label, originY, deflected, penalty] of [
  ["direct defensive-zone dump", 1200, false, true],
  ["neutral-zone dump", 700, false, false],
  ["deflected defensive-zone dump", 1200, true, false],
]) {
  test(`${label}: over-glass ruling follows launch position and deflection`, () => {
    const g = make(), p = g.user;
    Object.assign(g.ball, {
      owner: null, x: 876, y: 1200, vx: 500, vy: 0, z: 100, vz: 0, lock: 0,
      launch: { side: 0, playerId: p.id, x: 800, y: originY, deflected },
    });
    g.step(1 / 60);
    assert.equal(g.phase, "restart");
    assert.equal(g.penalties.length, penalty ? 1 : 0);
    assert.equal(g.score[0], 0);
    if (penalty) {
      assert.equal(g.penalties[0].kind, "Delay of game");
      assert.equal(g.penalties[0].minutes, 2);
      assert.equal(p.offIce, true);
      assert.deepEqual(g.manpower, [4, 5]);
    }
  });
}

test("a high puck is not bounced by the inset board before crossing the glass", () => {
  const g = make();
  Object.assign(g.ball, { owner: null, x: 870, y: 700, vx: 150, vy: 0, z: 140, vz: 0, lock: 0 });
  g.step(1 / 60);
  assert.ok(g.ball.vx > 0, "height clears the inset board");
  tick(g, 0.1);
  assert.equal(g.phase, "restart");
  assert.equal(g.penalties.length, 0);
});

test("an aerial puck above the crossbar cannot score", () => {
  const g = make();
  Object.assign(g.ball, { owner: null, x: 440, y: 4, vx: 0, vy: -1000, z: 60, vz: 0, lock: 0 });
  g.step(1 / 60);
  assert.deepEqual(g.score, [0, 0]);
  assert.ok(g.ball.vy > 0, "the puck meets the end glass above the net");
});

test("a power-play goal releases a minor but not a matching fighting major", () => {
  const g = make();
  const minor = g.players[2];
  addHockeyPenalty(g, minor, "Delay of game", 2);
  assert.deepEqual(g.manpower, [4, 5]);
  g.goal(1);
  assert.equal(minor.offIce, false);
  assert.equal(g.penalties.length, 0);
  assert.deepEqual(g.manpower, [5, 5]);
  g.phase = "play";
  addHockeyPenalty(g, g.players[3], "Fighting", 5, true);
  addHockeyPenalty(g, g.players[9], "Fighting", 5, true);
  g.goal(1);
  assert.equal(g.penalties.length, 2);
  assert.deepEqual(g.manpower, [5, 5]);
});

test("penalties count active play and return their player safely", () => {
  const g = make(), p = g.players[2];
  const penalty = addHockeyPenalty(g, p, "Delay of game", 2);
  const remaining = penalty.remaining;
  g.phase = "restart"; g.timer = 5; g.restartData = { side: 1, x: 440, y: 1100 };
  tick(g, 1);
  assert.equal(penalty.remaining, remaining);
  g.phase = "play"; penalty.remaining = 0.03;
  tick(g, 0.05);
  assert.equal(p.offIce, false);
  assert.equal(g.penalties.length, 0);
  assert.ok(p.x >= 18 && p.x <= g.rules.width - 18);
});

test("Y requires three uninterrupted defensive seconds and another human's acceptance", () => {
  const { g, p, q } = fightFixture();
  tick(g, 2.9, {}, { home: { fightHeld: true } });
  assert.equal(g.phase, "play");
  assert.equal(g.fightChallenge, null);
  tick(g, 0.12, {}, { home: { fightHeld: true } });
  assert.equal(g.phase, "play");
  assert.equal(g.fightChallenge.target, q.id);
  tick(g, 3.02, {}, { home: {}, away: { fightHeld: true } });
  assert.equal(g.phase, "fight");
  assert.deepEqual(g.fight.players.sort(), [p.id, q.id].sort());
  tick(g, 2.5);
  assert.equal(g.phase, "restart");
  assert.equal(g.penalties.length, 2);
  assert.ok(g.penalties.every((penalty) => penalty.minutes === 5 && penalty.coincidental));
  assert.deepEqual(g.manpower, [5, 5], "matching majors use AI bench substitutes");
});

test("releasing Y early resets the fight gesture", () => {
  const { g, p } = fightFixture();
  tick(g, 2.7, {}, { home: { fightHeld: true } });
  tick(g, 0.05);
  assert.equal(p.fightHold, 0);
  tick(g, 2.7, {}, { home: { fightHeld: true } });
  assert.equal(g.fightChallenge, null);
  assert.equal(g.phase, "play");
});

test("a fight hold cannot survive possession and restart as a different action", () => {
  const { g, p } = fightFixture();
  tick(g, 1, {}, { home: { fightHeld: true } });
  Object.assign(g.ball, { owner: p.id, x: p.x, y: p.y });
  g.step(1 / 60, {}, { home: { fightHeld: true } });
  Object.assign(g.ball, { owner: null, x: 100, y: 100 });
  tick(g, 3.2, {}, { home: { fightHeld: true } });
  assert.equal(g.fightChallenge, null);
  assert.equal(p.fightHold, 0);
});

test("fighting does not reach across the rink or accept forged heldSeconds", () => {
  const { g, p, q } = fightFixture();
  q.x = 750;
  assert.equal(g.controllerAction("home", "hockey-fight", {}, 1, { heldSeconds: 99 }), false);
  tick(g, 3.2, {}, { home: { fightHeld: true } });
  assert.equal(g.phase, "play");
  assert.equal(g.fightChallenge, null);
  assert.equal(p.fightTriggered, true);
  const count = g.events.filter((e) => e.type === "fight-declined").length;
  tick(g, 3.2, {}, { home: { fightHeld: true } });
  assert.equal(g.events.filter((e) => e.type === "fight-declined").length, count);
});

test("B hit and X poke have separate reach, commitment, and anti-spam", () => {
  const hit = make(), poke = make();
  for (const g of [hit, poke]) {
    const p = g.user, q = g.players[8];
    Object.assign(q, { x: p.x + 45, y: p.y, stun: 0, decision: 99 });
    g.ball.owner = q.id;
    p.decision = 9;
  }
  assert.equal(hit.action("hockey-hit", { x: 1, y: 0 }), true);
  assert.equal(poke.action("hockey-poke", { x: 1, y: 0 }), true);
  assert.equal(hit.ball.owner, null);
  assert.equal(poke.ball.owner, null);
  assert.ok(hit.players[8].stun > poke.players[8].stun * 3);
  assert.ok(hit.user.tackleCooldown > poke.user.tackleCooldown);
  assert.equal(hit.action("hockey-hit"), false);
  assert.equal(poke.action("hockey-poke"), false);
});

test("four seats steer distinct skaters on either side", () => {
  const g = make();
  const seats = [
    { id: "a", side: 0, mode: "skater", playerId: 1 },
    { id: "b", side: 0, mode: "skater", playerId: 2 },
    { id: "c", side: 1, mode: "skater", playerId: 7 },
    { id: "d", side: 1, mode: "skater", playerId: 8 },
  ];
  seats.forEach((s, i) => Object.assign(g.players[s.playerId], { x: 200 + 150 * i, y: 650, stun: 0, vx: 0, vy: 0 }));
  g.setControllers(seats, "a");
  g.step(0.1, {}, { a: { x: 1 }, b: { x: -1 }, c: { y: 1 }, d: { y: -1 } });
  assert.ok(g.players[1].vx > 0);
  assert.ok(g.players[2].vx < 0);
  assert.ok(g.players[7].vy > 0);
  assert.ok(g.players[8].vy < 0);
  assert.equal(g.user.id, 1);
});

test("team switching and automatic possession respect a teammate's player lock", () => {
  const g = make();
  g.setControllers([
    { id: "team", side: 0, mode: "team", playerId: 5 },
    { id: "lock", side: 0, mode: "skater", playerId: 3 },
  ], "team");
  g.ball.owner = 3;
  g.controllerAction("team", "hockey-pass");
  assert.notEqual(g.controllers.find((s) => s.id === "team").playerId, 3);
  assert.equal(g.controllers.find((s) => s.id === "lock").playerId, 3);
  assert.equal(g.ball.owner, 3, "A does not pass another human's puck");
});

test("goalie puck handling cannot move a team controller onto the goalie", () => {
  const g = make(), p = g.user, keeper = g.players[0];
  g.setControllers([{ id: "home", side: 0, mode: "team", playerId: p.id }], "home");
  Object.assign(keeper, { x: 440, y: 1342, stun: 0 });
  Object.assign(g.ball, {
    owner: null, x: 440, y: 1322, vx: 0, vy: 400, shot: true, shooter: 1, lock: 0,
  });
  g.step(1 / 60);
  assert.equal(g.stats[0].saves, 1);
  assert.equal(g.controllers[0].playerId, p.id);
  assert.equal(g.controlled, p.id);
  hockeyPossessionControl(g, keeper);
  assert.equal(g.controllers[0].playerId, p.id, "the possession helper itself also preserves the skater-only invariant");
});

test("locked A calls an AI carrier but never commands a human teammate", () => {
  const g = make(), p = g.players[5], carrier = g.players[3];
  Object.assign(p, { x: 440, y: 500, stun: 0 });
  Object.assign(carrier, { x: 440, y: 800, stun: 0, decision: 0 });
  g.setControllers([{ id: "lock", side: 0, mode: "skater", playerId: p.id }], "lock");
  g.ball.owner = carrier.id;
  g.controllerAction("lock", "hockey-pass");
  assert.equal(g.ball.owner, null);
  assert.equal(g.ball.receiver, p.id);
  assert.equal(g.user.id, p.id);
  p.callCooldown = 0;
  g.setControllers([
    { id: "lock", side: 0, mode: "skater", playerId: p.id },
    { id: "friend", side: 0, mode: "skater", playerId: carrier.id },
  ], "lock");
  g.ball.owner = carrier.id;
  g.controllerAction("lock", "hockey-pass");
  assert.equal(g.ball.owner, carrier.id);
});

test("an away-side controller shoots its own puck toward the opposite goal", () => {
  const g = make(), p = g.players[11];
  Object.assign(p, { x: 440, y: 900, stun: 0, fy: 1 });
  g.setControllers([{ id: "away", side: 1, mode: "skater", playerId: p.id }]);
  g.ball.owner = p.id;
  assert.equal(g.controllerAction("away", "hockey-shot", { x: 0, y: 1 }, 0.3, { heldSeconds: 0.1 }), true);
  assert.ok(g.ball.vy > 0);
  assert.equal(g.stats[1].shots, 1);
  assert.equal(g.stats[0].shots, 0);
});

test("AI teammates have symmetric shooting aim, error, and speed when either side has human seats", () => {
  const matches = [make(), make()];
  for (let side = 0; side < 2; side++) {
    const g = matches[side], p = g.players[side ? 11 : 5];
    g.setControllers([
      { id: "home", side: 0, mode: "skater", playerId: 3 },
      { id: "away", side: 1, mode: "skater", playerId: 9 },
    ]);
    g.aimAssist = 0.05;
    g.random = () => 0.8;
    Object.assign(p, { x: 380, y: side ? 1100 : 300, stun: 0 });
    Object.assign(g.ball, { x: p.x, y: p.y, owner: p.id });
    assert.equal(g.shoot(p, 0.65, { x: 0.32, y: side ? 1 : -1 }), true);
  }
  assert.ok(Math.abs(matches[0].ball.vx - matches[1].ball.vx) < 0.000001);
  assert.ok(Math.abs(matches[0].ball.vy + matches[1].ball.vy) < 0.000001);
  assert.ok(Math.abs(speed(matches[0]) - speed(matches[1])) < 0.000001);
});

test("explicit skater locks are reserved before team seats and fallback assignments", () => {
  const g = make();
  g.setControllers([
    { id: "team", side: 0, mode: "team", playerId: 5 },
    { id: "fallback", side: 0, mode: "skater", playerId: -1 },
    { id: "locked", side: 0, mode: "skater", playerId: 5 },
    { id: "also-locked", side: 0, mode: "skater", playerId: 1 },
  ]);
  assert.equal(g.controllers.find((s) => s.id === "locked").playerId, 5);
  assert.equal(g.controllers.find((s) => s.id === "also-locked").playerId, 1);
  assert.equal(new Set(g.controllers.map((s) => s.playerId)).size, 4);
});

test("a fighting skater's return cannot give a team seat another human's locked player", () => {
  const g = make(), p = g.players[5];
  g.setControllers([
    { id: "team", side: 0, mode: "team", playerId: 4 },
    { id: "locked", side: 0, mode: "skater", playerId: p.id },
  ], "team");
  const penalty = addHockeyPenalty(g, p, "Fighting", 5, true);
  const reserve = g.players.find((q) => q.replacementFor === p.id);
  g.controllers[0].playerId = reserve.id;
  g.ball.owner = reserve.id;
  penalty.remaining = 0.001;
  g.step(1 / 60);
  assert.equal(g.controllers[1].playerId, p.id);
  assert.notEqual(g.controllers[0].playerId, p.id);
  assert.ok(g.isPlayerActive(g.user));
  assert.equal(g.ball.owner, p.id);
  assert.deepEqual(g.manpower, [5, 5]);
});

test("a queued minor starts without leaving a team controller on a retired substitute", () => {
  const g = make();
  const first = addHockeyPenalty(g, g.players[1], "Delay of game", 2);
  addHockeyPenalty(g, g.players[2], "Delay of game", 2);
  const queued = addHockeyPenalty(g, g.players[3], "Delay of game", 2);
  const reserve = g.players.find((q) => q.replacementFor === 3);
  assert.ok(queued.queued);
  g.setControllers([{ id: "team", side: 0, mode: "team", playerId: reserve.id }], "team");
  g.ball.owner = reserve.id;
  const epoch = g.puckEpoch;
  first.remaining = 0.001;
  g.step(1 / 60);
  assert.equal(queued.queued, false);
  assert.equal(reserve.retired, true);
  assert.ok(g.isPlayerActive(g.user));
  assert.notEqual(g.controlled, reserve.id);
  assert.ok(g.puckEpoch > epoch);
  assert.deepEqual(g.manpower, [3, 5]);
  assert.equal(g.action("switch"), true);
});

for (const majorFirst of [true, false]) {
  test(`a replacement's minor preserves manpower when the ${majorFirst ? "original major" : "replacement minor"} ends first`, () => {
    const g = make(), p = g.players[5];
    const major = addHockeyPenalty(g, p, "Fighting", 5, true);
    const reserve = g.players.find((q) => q.replacementFor === p.id);
    const minor = addHockeyPenalty(g, reserve, "Delay of game", 2);
    assert.deepEqual(g.manpower, [4, 5]);
    (majorFirst ? major : minor).remaining = 0.001;
    (majorFirst ? minor : major).remaining = 0.1;
    g.step(1 / 60);
    assert.deepEqual(g.manpower, [majorFirst ? 4 : 5, 5]);
    tick(g, 0.12);
    assert.deepEqual(g.manpower, [5, 5]);
    assert.equal(g.isPlayerActive(p), true);
    assert.equal(g.isPlayerActive(reserve), false);
    assert.equal(g.penalties.length, 0);
  });
}
