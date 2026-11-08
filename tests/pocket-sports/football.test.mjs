import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Match } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";
import { SPORTS } from "../../daily_flyer/themes/pocket_sports_assets/sports/rules.js";
import { footballBoundary } from "../../daily_flyer/themes/pocket_sports_assets/sports/football.js";
const teams = JSON.parse(
  fs.readFileSync(new URL("../../daily_flyer/themes/pocket_sports_assets/data/teams-soccer.json", import.meta.url)),
).teams;
const match = (extra = {}) =>
  new Match({
    sport: "soccer",
    home: teams[0],
    away: teams[1],
    seed: 42,
    ...extra,
  });
const advance = (g, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) g.step(1 / 60);
};
const ready = (g) => {
  for (let i = 0; i < 1800 && g.phase === "restart"; i++) g.step(1 / 60);
  assert.equal(g.phase, "restart_ready");
};
function clear(g) {
  for (const p of g.players) {
    p.x = 50;
    p.y = 700;
    p.stun = 5;
  }
  g.phase = "play";
  g.restartData = null;
  g.ball = { x: 440, y: 700, vx: 0, vy: 0, owner: null, lock: 0, shot: false };
}

test("football gains meaningful space and time without slowing the hockey rules", () => {
  assert.ok(SPORTS.soccer.width >= 880 && SPORTS.soccer.height >= 1400);
  assert.ok(SPORTS.soccer.height / SPORTS.soccer.speed > (1080 / 202) * 1.7);
  assert.deepEqual(
    [
      SPORTS.hockey.width,
      SPORTS.hockey.height,
      SPORTS.hockey.speed,
      SPORTS.hockey.pass,
      SPORTS.hockey.shot,
    ],
    [680, 1080, 235, 650, 970],
  );
});
test("kick-off waits for player input; clock and ball stay still during the delay", () => {
  const g = match();
  assert.equal(g.phase, "restart");
  const remaining = g.remaining;
  g.action("pass");
  advance(g, 2);
  assert.equal(g.phase, "restart");
  ready(g);
  advance(g, 15);
  assert.equal(g.phase, "restart_ready");
  assert.equal(g.remaining, remaining);
  assert.equal(g.ball.owner, null);
  assert.equal(g.action("pass"), true);
  assert.equal(g.phase, "play");
  assert.equal(g.ball.owner, null);
  assert.ok(Math.hypot(g.ball.vx, g.ball.vy) > 0);
  advance(g, 0.1);
  assert.ok(g.remaining < remaining);
});
test("throw-in has a four-second minimum and walks the taker to the actual touchline", () => {
  const g = match();
  ready(g);
  g.action("pass");
  advance(g, 0.1);
  const before = g.players.map((p) => ({ x: p.x, y: p.y }));
  g.restart("THROW-IN", 0, 0, 500);
  const r = g.restartData;
  assert.deepEqual(
    g.players.map((p) => ({ x: p.x, y: p.y })),
    before,
  );
  g.action("pass");
  advance(g, 3.8);
  assert.equal(g.phase, "restart");
  assert.equal(g.ball.x, 0);
  assert.equal(g.ball.y, 500);
  ready(g);
  const p = g.players[r.taker];
  assert.ok(Math.hypot(p.x, p.y - 500) < 3);
  assert.equal(g.action("shoot"), true);
  assert.equal(g.ball.x, 0);
  assert.equal(g.ball.y, 500);
  assert.ok(g.ball.vx > 0);
  assert.equal(g.ball.flight, 0.35);
  assert.equal(g.stats[0].shots, 0);
});
test("goal kick belongs to the goalkeeper, with opponents outside the area and a physical pass", () => {
  const g = match();
  advance(g, 0.1);
  g.restart("GOAL KICK", 0, 100, 1400);
  ready(g);
  const r = { ...g.restartData };
  assert.equal(g.players[r.taker].keeper, true);
  assert.equal(g.ball.y, 1345);
  for (const p of g.players.filter((p) => p.side === 1)) assert.ok(p.y <= 1180);
  g.action("pass");
  assert.equal(g.phase, "play");
  assert.equal(g.ball.owner, null);
  assert.ok(g.ball.vy < 0);
  assert.equal(g.ball.restartKicker, r.taker);
  assert.equal(g.user.keeper, false);
});
test("CPU restarts complete on both touchlines and at either end", () => {
  for (const [type, x, y] of [
    ["THROW-IN", 0, 350],
    ["THROW-IN", 880, 900],
    ["GOAL KICK", 440, 0],
    ["CORNER", 0, 1400],
    ["CORNER", 880, 1400],
  ]) {
    const g = match({ autoplay: true });
    advance(g, 0.1);
    g.restart(type, 1, x, y);
    for (let i = 0; i < 1800 && g.phase !== "play"; i++) g.step(1 / 60);
    assert.equal(g.phase, "play", type);
    assert.equal(g.ball.owner, null);
    assert.ok(Math.hypot(g.ball.vx, g.ball.vy) > 0);
  }
});
test("a throw-in cannot score directly at either end", () => {
  for (const [y, expected, side] of [
    [-5, "GOAL KICK", 1],
    [1405, "CORNER", 1],
  ]) {
    const g = match();
    clear(g);
    g.lastTouch = 0;
    g.ball.noDirectGoal = true;
    g.ball.x = 440;
    g.ball.y = y;
    footballBoundary(g, { x: 440, y: y < 0 ? 2 : 1398 });
    assert.deepEqual(g.score, [0, 0]);
    assert.equal(g.restartData.type, expected);
    assert.equal(g.restartData.side, side);
  }
});
test("a diagonal ball crossing the touchline before the goal line gives a throw-in", () => {
  const g = match();
  clear(g);
  g.lastTouch = 0;
  g.ball.x = 895;
  g.ball.y = -2;
  footballBoundary(g, { x: 875, y: 10 });
  assert.equal(g.restartData.type, "THROW-IN");
  assert.equal(g.restartData.side, 1);
  assert.ok(g.restartData.y > 0);
});
test("taker cannot collect their own restart before another player touches it", () => {
  const g = match();
  ready(g);
  const id = g.restartData.taker;
  g.action("pass");
  clear(g);
  g.ball.restartKicker = id;
  const p = g.players[id];
  p.stun = 0;
  p.x = g.ball.x;
  p.y = g.ball.y;
  g.controlled = id;
  g.step(1 / 60);
  assert.equal(g.ball.owner, null);
  const mate = g.players.find((q) => q.side === 0 && !q.keeper && q.id !== id);
  mate.x = g.ball.x;
  mate.y = g.ball.y;
  mate.stun = 0;
  g.step(1 / 60);
  assert.equal(g.ball.owner, mate.id);
  assert.equal(g.ball.restartKicker, null);
});
test("goalkeeper holds a controllable shot before distributing", () => {
  const g = match();
  clear(g);
  const p = g.players.find((p) => p.keeper && p.side === 1);
  p.x = 440;
  p.y = 60;
  p.stun = 0;
  Object.assign(g.ball, {
    x: 440,
    y: 85,
    vx: 0,
    vy: -500,
    shot: true,
    shooter: 0,
  });
  g.step(1 / 60);
  assert.equal(g.stats[1].saves, 1);
  assert.equal(g.phase, "restart");
  assert.equal(g.restartData.type, "KEEPER BALL");
  assert.equal(g.restartData.taker, p.id);
});
test("a close-range shot crosses the goal line instead of starting outside it", () => {
  const g = match();
  clear(g);
  const p = g.players.find((p) => !p.keeper && p.side === 0);
  p.x = 440;
  p.y = 18;
  p.stun = 0;
  g.ball.owner = p.id;
  g.controlled = p.id;
  assert.equal(g.shoot(p, 1), true);
  advance(g, 0.06);
  assert.deepEqual(g.score, [1, 0]);
});
test("second half kick-off goes to the other side", () => {
  const g = match();
  ready(g);
  g.action("pass");
  g.remaining = 0.001;
  g.step(1 / 60);
  assert.equal(g.phase, "break");
  advance(g, 6.1);
  assert.equal(g.restartData.side, 1);
});
test("Dortmund has three dated teams, including the exact Wembley starting XI and no rating overrides", () => {
  const bvb = teams.filter((t) => t.id.startsWith("bvb"));
  assert.equal(bvb.length, 3);
  assert.ok(!teams.some((t) => t.id === "bvb2012"));
  const classic = bvb.find((t) => t.id === "bvb2013");
  assert.equal(classic.asOf, "2013-05-25");
  assert.equal(classic.season, "2012/13");
  assert.deepEqual(
    classic.players.map((p) => p.number).sort((a, b) => a - b),
    [1, 4, 6, 8, 9, 11, 15, 16, 19, 26, 29],
  );
  for (const name of [
    "Sven Bender",
    "Marco Reus",
    "Kevin Großkreutz",
    "Robert Lewandowski",
  ])
    assert.ok(classic.players.some((p) => p.name === name));
  assert.ok(!classic.players.some((p) => /Götze|Kagawa/.test(p.name)));
  for (const t of bvb) {
    assert.equal(t.players.length, 11);
    assert.ok(t.season && t.asOf);
    assert.equal(t.rating, undefined);
    assert.equal(t.speed, undefined);
  }
});

test("a simple kick-off pass selects its recipient and reaches them without running out", () => {
  const g = match();
  ready(g);
  g.action("pass");
  const recipient = g.ball.receiver;
  assert.equal(g.controlled, recipient);
  for (let i = 0; i < 180 && g.ball.owner === null && g.phase === "play"; i++)
    g.step(1 / 60);
  assert.equal(g.phase, "play");
  assert.equal(g.ball.owner, recipient);
  assert.equal(g.owner.side, 0);
});

test("an AI receiver moves to meet a deliberate pass", () => {
  const g = match();
  clear(g);
  const p = g.players.find((p) => p.side === 0 && p.slot === 10),
    q = g.players.find((p) => p.side === 0 && p.slot === 8);
  Object.assign(p, { x: 440, y: 700, stun: 0 });
  Object.assign(q, { x: 190, y: 600, vx: 0, vy: -100, stun: 0 });
  g.controlled = p.id;
  g.ball.owner = p.id;
  g.pass(p, { x: -1, y: -0.4 });
  assert.equal(g.ball.receiver, q.id);
  for (let i = 0; i < 180 && g.ball.owner === null && g.phase === "play"; i++)
    g.step(1 / 60);
  assert.equal(g.phase, "play");
  assert.equal(g.ball.owner, q.id);
});
