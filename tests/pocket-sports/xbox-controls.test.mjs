import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Match } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";
import { FOOTBALL_HEIGHT } from "../../daily_flyer/themes/pocket_sports_assets/sports/football-controls.js";

const teams = Object.fromEntries(
  ["hockey", "soccer"].map((sport) => [
    sport,
    JSON.parse(
      fs.readFileSync(
        new URL(
          `../../daily_flyer/themes/pocket_sports_assets/data/teams-${sport}.json`,
          import.meta.url,
        ),
      ),
    ).teams,
  ]),
);
const neutral = { x: 0, y: 0, sprint: false };

function match(sport = "soccer", options = {}) {
  return new Match({
    sport,
    home: teams[sport][0],
    away: teams[sport][1],
    seed: 42,
    practice: true,
    controlMode: "touch",
    touchAssist: true,
    ...options,
  });
}

function isolated(sport = "soccer") {
  const game = match(sport);
  game.phase = "play";
  game.restartData = null;
  game.cooldown = 0;
  game.events = [];
  for (const [index, p] of game.players.entries()) {
    Object.assign(p, {
      x: 45 + (index % 10) * 35,
      y: game.rules.height - 120 - Math.floor(index / 10) * 35,
      vx: 0,
      vy: 0,
      stun: 30,
      decision: 0,
      tackleCooldown: 0,
    });
  }
  game.controlled = game.rules.count - 1;
  game.ball = {
    x: game.rules.width / 2,
    y: game.rules.height / 2,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    owner: null,
    lock: 0,
    shot: false,
  };
  return game;
}

function activate(p, x, y, extra = {}) {
  Object.assign(p, { x, y, vx: 0, vy: 0, stun: 0, decision: 0, ...extra });
  return p;
}

function giveBall(game, p) {
  Object.assign(game.ball, {
    owner: p.id,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    lock: 0,
    shot: false,
  });
  game.lastTouch = p.side;
}

function advance(game, seconds, input = neutral) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++)
    game.step(1 / 60, input);
}

function advanceUntil(game, seconds, done, input = neutral) {
  for (let frame = 0; frame < Math.ceil(seconds * 60) && !done(); frame++)
    game.step(1 / 60, input);
}

function passFixture() {
  const game = isolated();
  const passer = activate(game.user, 440, 900);
  const receiver = activate(game.players[8], 440, 580);
  giveBall(game, passer);
  return { game, passer, receiver };
}

test("A passes with possession and switches the defender without possession", () => {
  const { game, passer, receiver } = passFixture();
  const original = { x: receiver.x, y: receiver.y };
  assert.equal(game.action("pass", { x: 0, y: -1 }), true);
  assert.equal(game.ball.owner, null);
  assert.equal(game.ball.receiver, receiver.id);
  assert.equal(game.ball.passType, "ground");
  assert.equal(game.ball.z || 0, 0);
  assert.deepEqual({ x: receiver.x, y: receiver.y }, original);
  advanceUntil(game, 3, () => game.ball.owner !== null);
  assert.equal(game.ball.owner, receiver.id, "the receiver must collect the moving ball");

  const opponent = activate(game.players.at(-1), 460, 700);
  activate(passer, 440, 700);
  game.controlled = passer.id;
  giveBall(game, opponent);
  const passes = game.stats[0].passes;
  game.action("pass", { x: 0, y: -1 });
  assert.notEqual(game.controlled, passer.id, "defensive A must choose another defender");
  assert.equal(game.user.side, 0);
  assert.equal(game.user.keeper, false);
  assert.equal(game.ball.owner, opponent.id);
  assert.equal(game.stats[0].passes, passes);
});

test("Y leads a runner into space with a ground ball", () => {
  const { game, receiver } = passFixture();
  receiver.vy = -65;
  const start = { x: receiver.x, y: receiver.y };
  assert.equal(game.action("through", { x: 0, y: -1 }), true);
  assert.equal(game.ball.owner, null);
  assert.equal(game.ball.receiver, receiver.id);
  assert.equal(game.ball.passType, "through");
  assert.ok(game.ball.passTarget.y < start.y, "the target must be beyond the runner");
  assert.deepEqual({ x: receiver.x, y: receiver.y }, start);
  advance(game, 0.25);
  assert.ok(receiver.y < start.y, "the receiver must keep running forward, not turn back");
  assert.equal(game.ball.z || 0, 0, "a through pass must remain on the ground");
  advanceUntil(game, 4, () => game.ball.owner !== null);
  assert.equal(game.ball.owner, receiver.id);
  assert.ok(receiver.y < start.y, "the eventual reception should gain ground");
});

test("X clears a low interceptor and descends for a physical reception", () => {
  const { game, receiver } = passFixture();
  receiver.y = 480;
  const blocker = activate(game.players.at(-1), 440, 720, { decision: 100 });
  assert.equal(game.canCross(), false);
  assert.equal(game.action("lob", { x: 0, y: -1 }), true);
  assert.equal(game.ball.passType, "lob");
  assert.equal(game.ball.owner, null);
  assert.ok(game.ball.airTarget && Number.isFinite(game.ball.airTarget.y));
  let peak = 0;
  let clearedBlocker = false;
  for (let frame = 0; frame < 300 && game.ball.owner === null; frame++) {
    game.step(1 / 60, neutral);
    peak = Math.max(peak, game.ball.z || 0);
    if (
      Math.hypot(game.ball.x - blocker.x, game.ball.y - blocker.y) < 19 &&
      game.ball.z > 30
    ) clearedBlocker = true;
    assert.notEqual(game.ball.owner, blocker.id, "the mid-flight interceptor must be cleared");
  }
  assert.ok(peak > 30, "X must create actual height, not only a different label");
  assert.ok(clearedBlocker, "the exercise must include a real horizontal interception chance");
  assert.equal(game.ball.owner, receiver.id, "the loft must come down to a receiver");
  assert.equal(game.ball.z || 0, 0);
});

test("X becomes a cross from an attacking wing and targets the area", () => {
  const game = isolated();
  const winger = activate(game.user, 70, 250);
  const receiver = activate(game.players[8], 440, 210);
  giveBall(game, winger);
  assert.equal(game.canCross(), true);
  assert.equal(game.action("lob", { x: 1, y: 0 }), true);
  assert.equal(game.ball.passType, "cross");
  assert.equal(game.ball.owner, null);
  assert.equal(game.ball.receiver, receiver.id);
  assert.ok(game.ball.airTarget.x > winger.x + 100, "the cross should travel into the area");
  assert.ok(game.ball.airTarget.y < game.rules.height / 3);
});

test("an airborne ball crossing above the goal becomes a restart, even if it lands later in the frame", () => {
  for (const lastTouch of [0, 1]) {
    const game = isolated();
    game.lastTouch = lastTouch;
    Object.assign(game.ball, {
      x: game.rules.width / 2,
      y: 4,
      z: 100,
      vx: 0,
      vy: -200,
      vz: -1200,
      lock: 0,
    });
    game.step(0.1, neutral);
    assert.deepEqual(game.score, [0, 0], "height at the actual crossing must decide the goal");
    assert.equal(game.phase, "restart");
    assert.equal(game.restartData.type, lastTouch ? "CORNER" : "GOAL KICK");
    assert.equal(game.restartData.side, lastTouch ? 0 : 1);
  }
});

test("a descending ball uses the pre-landing time of a goal-line crossing", () => {
  const game = isolated();
  const crossingTime = 0.02;
  const descentSpeed = 1000;
  // Cross two units above the configured bar, then land before this long frame
  // ends. The slowdown at landing makes distance fraction differ from time.
  const startHeight = FOOTBALL_HEIGHT.bar + 2 + descentSpeed * crossingTime +
    FOOTBALL_HEIGHT.gravity * crossingTime * crossingTime / 2;
  Object.assign(game.ball, {
    x: game.rules.width / 2,
    y: 4,
    z: startHeight,
    vx: 0,
    vy: -200,
    vz: -descentSpeed,
  });
  game.lastTouch = 0;
  game.step(0.1, neutral);
  assert.deepEqual(game.score, [0, 0]);
  assert.equal(game.phase, "restart");
  assert.equal(game.restartData.type, "GOAL KICK");
});

test("X slide reaches through movement, cannot be steered out of commitment, and hits only once", () => {
  const game = isolated();
  const defender = activate(game.user, 400, 700, { decision: 0.84 });
  // Hold the carrier still so this isolates the swept slide rather than
  // requiring the test's chosen direction to predict an AI dribble.
  const opponent = activate(game.players.at(-1), 490, 700, { stun: 30, decision: 100 });
  giveBall(game, opponent);
  const startX = defender.x;
  assert.equal(game.action("slide", { x: 1, y: 0 }), true);
  assert.equal(defender.x, startX, "starting a slide must not teleport the defender");
  assert.ok(defender.slideTimer > 0);
  assert.ok(defender.slideDir.x > 0);
  advanceUntil(game, 0.7, () => game.stats[0].tackles > 0, { x: -1, y: 0 });
  assert.ok(defender.x > startX + 20, "the committed slide must move toward the ball");
  assert.equal(game.stats[0].tackles, 1);
  assert.equal(game.ball.owner, null);

  // Give the opponent another nearby touch during the same slide. One lunge
  // must not repeatedly award tackles or become cancellable with B.
  opponent.stun = 0;
  opponent.x = defender.x + 15;
  opponent.y = defender.y;
  giveBall(game, opponent);
  const recovery = defender.slideTimer;
  game.action("shoot", { x: 1, y: 0 });
  assert.equal(game.stats[0].tackles, 1);
  assert.equal(defender.slideTimer, recovery);
  advance(game, 0.1, { x: 1, y: 0 });
  assert.equal(game.stats[0].tackles, 1, "one slide must register at most one tackle");
});

test("a missed slide has a recovery period before ordinary movement resumes", () => {
  const game = isolated();
  const defender = activate(game.user, 400, 700);
  const opponent = activate(game.players.at(-1), 780, 700, { decision: 100 });
  giveBall(game, opponent);
  game.action("slide", { x: 1, y: 0 });
  advanceUntil(game, 1.5, () => !defender.sliding, { x: -1, y: 0 });
  assert.equal(game.stats[0].tackles, 0);
  assert.ok(defender.slideTimer > 0, "the player must recover after the moving part ends");
  const atRecovery = defender.x;
  advance(game, 0.1, { x: -1, y: 0 });
  assert.ok(defender.x >= atRecovery - 5, "full reverse movement must wait for recovery");
  advanceUntil(game, 2, () => defender.slideTimer <= 0);
  const recoveredX = defender.x;
  advance(game, 0.3, { x: -1, y: 0 });
  assert.ok(defender.x < recoveredX - 10, "manual movement must return after recovery");
});

test("a restart taker cannot second-touch its own pass by sliding through it", () => {
  const game = match();
  advanceUntil(game, 3, () => game.phase === "restart_ready");
  assert.equal(game.phase, "restart_ready");
  const taker = game.players[game.restartData.taker];
  assert.equal(game.action("ground", { x: 1, y: 0 }), true);
  const receiver = game.ball.receiver;
  const start = { x: taker.x, y: taker.y };
  assert.ok(
    Math.hypot(game.ball.x - start.x, game.ball.y - start.y) < 1,
    "the slide starts through the actual restart release point",
  );

  game.controlled = taker.id;
  assert.equal(game.action("slide", { x: 1, y: 0 }), true);
  game.step(1 / 60, neutral);
  assert.ok(Math.hypot(taker.x - start.x, taker.y - start.y) > 1);
  assert.equal(game.ball.owner, null);
  assert.equal(game.ball.restartKicker, taker.id, "the taker's slide must not count as a legal touch");
  assert.equal(game.ball.receiver, receiver, "the slide must not deflect its own restart pass");
  assert.equal(game.ball.passType, "ground");
});

function containFixture() {
  const game = isolated();
  const defender = activate(game.user, 400, 950);
  const opponent = activate(game.players.at(-1), 440, 700, { stun: 30, decision: 100 });
  giveBall(game, opponent);
  return { game, defender, opponent };
}

test("holding contain positions a defender without tackling and release stops the assistance", () => {
  const { game, defender, opponent } = containFixture();
  const startDistance = Math.hypot(defender.x - opponent.x, defender.y - opponent.y);
  advance(game, 1.2, { ...neutral, contain: true });
  const heldDistance = Math.hypot(defender.x - opponent.x, defender.y - opponent.y);
  assert.ok(heldDistance < startDistance - 50);
  assert.ok(defender.y > opponent.y, "contain should keep the defender between attacker and goal");
  assert.equal(game.ball.owner, opponent.id);
  assert.equal(game.stats[0].tackles, 0, "contain must not stand in for a tackle command");
  const released = { x: defender.x, y: defender.y };
  advance(game, 0.6, neutral);
  assert.ok(
    Math.hypot(defender.x - released.x, defender.y - released.y) < 30,
    "release may leave ordinary momentum, but must end automatic positioning",
  );
});

test("strong manual steering overrides held contain", () => {
  const { game, defender } = containFixture();
  const startY = defender.y;
  advance(game, 0.5, { x: 0, y: 1, contain: true });
  assert.ok(defender.y > startY + 25, "the stick must override the automatic target");
});

function keeperFixture(ballY = 950) {
  const game = isolated();
  const keeper = activate(game.players[0], 440, game.rules.height - 58);
  const opponent = activate(game.players.at(-1), 440, ballY, { stun: 30, decision: 100 });
  giveBall(game, opponent);
  return { game, keeper, opponent };
}

test("held Y rushes the keeper within defensive bounds and release returns them", () => {
  const { game, keeper } = keeperFixture(500);
  const homeY = keeper.y;
  advance(game, 2, { ...neutral, keeperRush: true });
  assert.ok(keeper.y < homeY - 60, "the keeper must actually move out");
  assert.ok(keeper.y > game.rules.height * 0.65, "keeper rush must not chase into midfield");
  const rushedY = keeper.y;
  advance(game, 0.8, neutral);
  assert.ok(keeper.y > rushedY + 40, "release must send the keeper back through movement");
});

test("a rushing keeper can collect a carried ball on actual arrival", () => {
  const { game, keeper, opponent } = keeperFixture(1220);
  const startY = keeper.y;
  advanceUntil(game, 2, () => game.phase !== "play", { ...neutral, keeperRush: true });
  assert.ok(keeper.y < startY - 20);
  assert.equal(game.phase, "restart");
  assert.equal(game.restartData.type, "KEEPER BALL");
  assert.equal(game.restartData.side, 0);
  assert.equal(game.restartData.taker, keeper.id);
  assert.notEqual(game.ball.owner, opponent.id);
});

test("defensive holds do not control an attacking player or persist during a restart", () => {
  const attack = isolated();
  activate(attack.user, 440, 700);
  giveBall(attack, attack.user);
  const before = { x: attack.user.x, y: attack.user.y };
  advance(attack, 0.4, { ...neutral, contain: true, keeperRush: true });
  assert.deepEqual({ x: attack.user.x, y: attack.user.y }, before);

  const held = match();
  const plain = match();
  held.restart("THROW-IN", 1, 0, 700);
  plain.restart("THROW-IN", 1, 0, 700);
  advance(held, 0.25, { ...neutral, contain: true, keeperRush: true });
  advance(plain, 0.25, neutral);
  assert.deepEqual(held.snapshot(), plain.snapshot(), "dead-ball positioning must ignore defensive holds");
});

const restarts = [
  ["KICK-OFF", 440, 700],
  ["THROW-IN", 0, 650],
  ["GOAL KICK", 440, 1400],
  ["CORNER", 0, 0],
  ["KEEPER BALL", 440, 1320],
];

for (const [type, x, y] of restarts) {
  for (const action of ["ground", "shoot", "lob", "through"]) {
    test(`${action} can be queued for an own ${type.toLowerCase()}`, () => {
      const game = match();
      game.restart(type, 0, x, y);
      const taker = game.restartData.taker;
      game.action(action, { x: 0, y: -1 });
      assert.equal(game.restartData.pending?.name, action);
      advanceUntil(game, 4, () => game.phase === "play", { x: 0.35, y: -1 });
      assert.equal(game.phase, "play", "the queued action must release at the normal restart");
      assert.equal(game.ball.owner, null, "restart actions must release a physical ball");
      assert.equal(game.ball.restartKicker, taker);
      assert.equal(game.stats[0].passes + game.stats[0].shots, 1);
      assert.equal(game.user.keeper, false, "a distribution must return control to an outfield player");
      if (type === "THROW-IN") assert.equal(game.ball.noDirectGoal, true);
      if (type === "THROW-IN" || type === "KEEPER BALL")
        assert.equal(game.canCross(game.players[taker]), false);
    });
  }
}

test("A switches defenders during an opponent restart without queuing an attacking action", () => {
  const game = match();
  game.restart("THROW-IN", 1, 0, 700);
  const controlled = game.controlled;
  const passes = game.stats[0].passes;
  game.action("pass", { x: 0, y: -1 });
  assert.notEqual(game.controlled, controlled);
  assert.equal(game.user.side, 0);
  assert.equal(game.user.keeper, false);
  assert.equal(game.phase, "restart");
  assert.equal(game.ball.owner, null);
  assert.equal(game.restartData.pending, null);
  assert.equal(game.stats[0].passes, passes);
});

test("soccer-only buttons and defensive holds leave hockey behavior unchanged", () => {
  const extra = match("hockey");
  const baseline = match("hockey");
  for (const game of [extra, baseline]) {
    const opponent = game.players.at(-1);
    giveBall(game, opponent);
  }
  for (const name of ["ground", "lob", "through", "slide"]) extra.action(name);
  for (let frame = 0; frame < 90; frame++) {
    const input = { x: 0.3, y: -0.6, sprint: frame < 30 };
    extra.step(1 / 60, { ...input, contain: true, keeperRush: true });
    baseline.step(1 / 60, input);
  }
  assert.deepEqual(extra.snapshot(), baseline.snapshot());
  assert.deepEqual(extra.stats, baseline.stats);
  assert.deepEqual(extra.events, baseline.events);
});
