import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Match } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";

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
const touch = { controlMode: "touch", touchAssist: true };

function match(sport = "soccer", options = {}) {
  return new Match({
    sport,
    home: teams[sport][0],
    away: teams[sport][1],
    seed: 42,
    practice: true,
    ...options,
  });
}

// Keep unrelated players out of the exercise without replacing the actual
// movement, collision, possession, or boundary code being tested.
function isolated(sport = "soccer", options = {}) {
  const game = match(sport, options);
  game.phase = "play";
  game.restartData = null;
  game.cooldown = 0;
  game.aimAssist = 0.7;
  game.events = [];
  for (const [index, p] of game.players.entries()) {
    Object.assign(p, {
      x: 40 + (index % 10) * 35,
      y: game.rules.height - 200 - Math.floor(index / 10) * 40,
      vx: 0,
      vy: 0,
      stun: 30,
      decision: 0,
    });
  }
  game.controlled = game.rules.count - 1;
  game.ball = {
    x: game.rules.width / 2,
    y: game.rules.height / 2,
    vx: 0,
    vy: 0,
    owner: null,
    lock: 0,
    shot: false,
  };
  return game;
}

function advanceUntil(game, seconds, done, input = neutral) {
  for (let frame = 0; frame < Math.ceil(seconds * 60) && !done(); frame++)
    game.step(1 / 60, input);
}

for (const x of [-1, -Math.SQRT1_2, Math.SQRT1_2, 1]) {
  test(`soccer: assisted shot reaches the goal while steering x=${x.toFixed(3)}`, () => {
    const game = isolated("soccer", touch);
    const p = game.user;
    Object.assign(p, { x: game.rules.width / 2, y: 250, stun: 0 });
    game.ball.owner = p.id;
    game.action("shoot", { x, y: -Math.sqrt(1 - x * x) }, 0.65);
    assert.equal(game.ball.owner, null, "a shot must remain a physical ball");
    advanceUntil(game, 1.5, () => game.phase !== "play");
    assert.deepEqual(
      game.score,
      [1, 0],
      "ordinary thumb steering must not aim an assisted clear shot outside the posts",
    );
  });
}

function receptionUnderPressure(options, configure = () => {}) {
  const game = isolated("soccer", options);
  configure(game);
  const receiver = game.user;
  const defender = game.players[game.rules.count * 2 - 1];
  Object.assign(receiver, { x: 440, y: 700, stun: 0 });
  Object.assign(defender, {
    x: 475,
    y: 700,
    stun: 0,
    decision: -1,
  });
  Object.assign(game.ball, { x: receiver.x, y: receiver.y });
  game.step(1 / 60, neutral);
  assert.equal(game.ball.owner, receiver.id, "fixture must complete a real reception");
  const receivedAt = game.time;
  advanceUntil(game, 2.5, () => game.stats[1].tackles > 0);
  return { game, elapsed: game.time - receivedAt };
}

test("soccer: touch reception gives time to react, then permits an opponent tackle", () => {
  const phone = receptionUnderPressure(touch);
  const keyboard = receptionUnderPressure({
    controlMode: "keyboard",
    touchAssist: true,
  });
  assert.equal(phone.game.stats[1].tackles, 1, "protection must expire");
  assert.equal(keyboard.game.stats[1].tackles, 1);
  assert.ok(phone.elapsed >= 0.2, "the receiver needs a usable response window");
  assert.ok(
    phone.elapsed > keyboard.elapsed + 0.12,
    "the touch profile must actually change the nearby opponent's response",
  );
  assert.ok(phone.elapsed < 2.5, "the receiver must not stay protected indefinitely");
});

test("soccer: input mode and touch-assist setters change subsequent reception behavior", () => {
  const enabled = receptionUnderPressure(
    { controlMode: "keyboard", touchAssist: false },
    (game) => {
      game.setControlMode("touch");
      game.setTouchAssist(true);
    },
  );
  const disabled = receptionUnderPressure(touch, (game) => game.setTouchAssist(false));
  const keyboard = receptionUnderPressure(touch, (game) => game.setControlMode("keyboard"));
  assert.ok(enabled.elapsed > disabled.elapsed + 0.12);
  assert.equal(disabled.elapsed, keyboard.elapsed);
});

test("soccer: switching defender allows an immediate tackle despite an old AI decision timer", () => {
  const game = isolated("soccer", touch);
  const defender = game.players[8];
  const opponent = game.players[game.rules.count * 2 - 1];
  Object.assign(defender, {
    x: 440,
    y: 700,
    stun: 0,
    decision: 0.84,
  });
  Object.assign(opponent, { x: 465, y: 700, stun: 0 });
  Object.assign(game.ball, { x: opponent.x, y: opponent.y, owner: opponent.id });
  game.action("switch");
  assert.equal(game.controlled, defender.id);
  game.action("shoot");
  assert.equal(game.stats[0].tackles, 1);
  assert.equal(game.ball.owner, null);

  // Remove only physical stun and restore the opponent's possession: a second
  // command must still respect the cooldown of the actual tackle just made.
  defender.stun = 0;
  opponent.stun = 0;
  game.ball.owner = opponent.id;
  game.action("shoot");
  assert.equal(game.stats[0].tackles, 1, "a manual tackle must not be spammable");
});

test("soccer: a short physical pass can be collected by its selected stationary receiver", () => {
  const game = isolated("soccer", touch);
  const passer = game.user;
  const receiver = game.players[8];
  Object.assign(passer, { x: 440, y: 700, stun: 0 });
  Object.assign(receiver, { x: 440, y: 660, stun: 0 });
  game.ball.owner = passer.id;
  game.action("pass", { x: 0, y: -1 });
  assert.equal(game.ball.owner, null, "passing must not transfer possession instantly");
  assert.equal(game.ball.receiver, receiver.id);
  game.controlled = receiver.id;
  passer.stun = 2;
  advanceUntil(game, 0.6, () => game.ball.owner !== null);
  assert.equal(game.phase, "play");
  assert.equal(
    game.ball.owner,
    receiver.id,
    "a short pass must not fly through the receiver while pickup is locked",
  );
});

test("soccer: touch passing finds a clear nearby lane instead of a directly blocked receiver", () => {
  const game = isolated("soccer", touch);
  const passer = game.user;
  const blockedReceiver = game.players[8];
  const openReceiver = game.players[9];
  const opponent = game.players[game.rules.count * 2 - 1];
  Object.assign(passer, { x: 440, y: 900, stun: 0 });
  Object.assign(blockedReceiver, { x: 440, y: 500, stun: 0 });
  Object.assign(openReceiver, { x: 650, y: 650, stun: 0 });
  Object.assign(opponent, { x: 440, y: 750, stun: 0 });
  game.ball.owner = passer.id;
  game.action("pass", { x: 0, y: -1 });
  assert.equal(game.ball.receiver, openReceiver.id);
  assert.equal(game.ball.owner, null);
  advanceUntil(game, 2, () => game.ball.owner !== null);
  assert.equal(game.phase, "play");
  assert.equal(game.ball.owner, openReceiver.id, "the safer selection must produce a playable pass");
});

for (const input of [{ x: 0, y: 0 }, { x: 0, y: -1 }]) {
  test(`soccer: PASS still works with every teammate behind and stick y=${input.y}`, () => {
    const game = isolated("soccer", touch);
    const passer = game.user;
    Object.assign(passer, { x: 440, y: 500, stun: 0 });
    game.ball.owner = passer.id;
    game.action("pass", input);
    assert.equal(game.stats[0].passes, 1, "no forward option must not swallow the command");
    assert.equal(game.ball.owner, null);
    assert.ok(Number.isInteger(game.ball.receiver));
    assert.equal(game.players[game.ball.receiver].side, 0);
    assert.ok(game.ball.vy > 0, "the remaining teammate is behind the passer");
    assert.ok(Number.isFinite(game.ball.vx) && Number.isFinite(game.ball.vy));
  });
}

function playScript(game) {
  for (let frame = 0; frame < 720; frame++) {
    const input = {
      x: Math.sin(frame / 80) * 0.65,
      y: -0.7,
      sprint: frame % 150 < 45,
    };
    if (!game.autoplay) {
      if (frame % 90 === 0) game.action("pass", input);
      if (frame % 210 === 0) game.action("shoot", input, 0.65);
    }
    game.step(1 / 60, input);
  }
  return { state: game.snapshot(), stats: game.stats, events: game.events };
}

for (const [label, sport, options] of [
  ["keyboard soccer", "soccer", { controlMode: "keyboard" }],
  ["touch hockey", "hockey", { controlMode: "touch" }],
  ["CPU exhibition", "soccer", { controlMode: "touch", autoplay: true }],
]) {
  test(`touch assistance does not alter ${label}`, () => {
    const enabled = match(sport, { ...options, touchAssist: true });
    const disabled = match(sport, { ...options, touchAssist: false });
    assert.deepEqual(playScript(enabled), playScript(disabled));
  });
}
