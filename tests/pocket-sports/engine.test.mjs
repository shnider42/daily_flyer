import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Match } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";
import { FixedClock } from "../../daily_flyer/themes/pocket_sports_assets/core/math.js";
import { stickInput, movementInput } from "../../daily_flyer/themes/pocket_sports_assets/core/pgi-controls.js";
const data = Object.fromEntries(
  ["hockey", "soccer"].map((s) => [
    s,
    JSON.parse(
      fs.readFileSync(new URL(`../../daily_flyer/themes/pocket_sports_assets/data/teams-${s}.json`, import.meta.url)),
    ),
  ]),
);
const make = (sport = "hockey", extra = {}) =>
  new Match({
    sport,
    home: data[sport].teams[1],
    away: data[sport].teams[2],
    seed: 42,
    ...extra,
  });
function clearLane(g) {
  for (const p of g.players) {
    p.x = 50;
    p.y = 500;
    p.stun = 2;
  }
  g.ball.owner = null;
  g.ball.lock = 0;
}
for (const sport of ["hockey", "soccer"]) {
  test(sport + ": complete catalogues and authentic distinct lineups", () => {
    const teams = data[sport].teams;
    assert.equal(teams.length, sport === "hockey" ? 32 : 16);
    assert.equal(new Set(teams.map((t) => t.id)).size, teams.length);
    for (const t of teams) {
      assert.equal(t.players.length, sport === "hockey" ? 6 : 11);
      assert.equal(
        new Set(t.players.map((p) => p.name)).size,
        t.players.length,
      );
      assert.ok(t.sourceUrls.every((s) => s.startsWith("https://")));
      assert.equal(
        t.players.filter((p) => ["G", "GK"].includes(p.position)).length,
        1,
      );
    }
  });
  test(sport + ": proper on-field count and controlled kickoff", () => {
    const g = make(sport);
    assert.equal(g.players.length, sport === "hockey" ? 12 : 22);
    assert.equal(g.owner.id, g.controlled);
    assert.equal(g.players.filter((p) => p.keeper).length, 2);
  });
  test(sport + ": scoring swept line increments once and freezes ball", () => {
    const g = make(sport);
    clearLane(g);
    Object.assign(g.ball, { x: 340, y: 4, vx: 0, vy: -1000 });
    g.step(1 / 60);
    assert.deepEqual(g.score, [1, 0]);
    assert.equal(g.phase, "goal");
    for (let i = 0; i < 60; i++) g.step(1 / 60);
    assert.deepEqual(g.score, [1, 0]);
    assert.ok(g.remaining < g.duration);
  });
  test(sport + ": wide shots cannot score", () => {
    const g = make(sport);
    clearLane(g);
    Object.assign(g.ball, { x: 100, y: 4, vx: 0, vy: -1000 });
    g.step(1 / 60);
    assert.deepEqual(g.score, [0, 0]);
  });
  test(sport + ": swept keeper interception saves fast shot", () => {
    const g = make(sport);
    clearLane(g);
    const keeper = g.players.find((p) => p.side === 1 && p.keeper);
    Object.assign(keeper, { x: 340, y: 60, stun: 0 });
    Object.assign(g.ball, {
      x: 340,
      y: 77,
      vx: 0,
      vy: -1000,
      shot: true,
      shooter: 0,
    });
    g.step(1 / 60);
    assert.equal(g.stats[1].saves, 1);
    assert.equal(g.score[0], 0);
    assert.ok(g.ball.vy > 0);
  });
  test(sport + ": neutral player is not pulled towards loose ball", () => {
    const g = make(sport);
    clearLane(g);
    g.user.stun = 0;
    g.user.x = 300;
    g.user.y = 500;
    Object.assign(g.ball, { x: 500, y: 300 });
    g.step(1 / 60);
    assert.equal(g.user.x, 300);
    assert.equal(g.user.y, 500);
  });
  test(
    sport + ": pass becomes a physical free ball and cannot be spammed",
    () => {
      const g = make(sport);
      assert.equal(g.pass(), true);
      assert.equal(g.ball.owner, null);
      assert.ok(Math.hypot(g.ball.vx, g.ball.vy) > 400);
      assert.equal(g.pass(), false);
      assert.equal(g.stats[0].passes, 1);
    },
  );
  test(sport + ": tackle requires proximity and has cooldown", () => {
    const g = make(sport);
    g.kickoff(1);
    const p = g.user,
      o = g.owner;
    p.decision = 0;
    p.x = o.x + 25;
    p.y = o.y;
    g.tackle();
    assert.equal(g.ball.owner, null);
    assert.equal(g.stats[0].tackles, 1);
    g.tackle();
    assert.equal(g.stats[0].tackles, 1);
  });
  test(sport + ": periods, overtime and final cannot stall", () => {
    const g = make(sport, { seconds: 20 });
    g.remaining = 0.001;
    g.period = g.rules.periods;
    g.score = [0, 0];
    g.step(1 / 60);
    assert.equal(g.period, g.rules.periods + 1);
    g.goal(0);
    for (let i = 0; i < 180; i++) g.step(1 / 60);
    assert.equal(g.phase, "finished");
    assert.equal(g.winner, 0);
  });
  test(sport + ": same seed and inputs produce identical simulation", () => {
    const a = make(sport),
      b = make(sport);
    for (let i = 0; i < 1400; i++) {
      const input = { x: Math.sin(i / 120), y: -0.4, sprint: i % 150 < 40 };
      if (i % 130 === 0) {
        a.action("pass", input);
        b.action("pass", input);
      }
      a.step(1 / 60, input);
      b.step(1 / 60, input);
    }
    assert.deepEqual(a.snapshot(), b.snapshot());
  });
  test(sport + ": full CPU exhibition finishes with finite positions", () => {
    const g = make(sport, { seconds: 20, autoplay: true });
    for (let i = 0; i < 18000 && g.phase !== "finished"; i++) g.step(1 / 60);
    assert.equal(g.phase, "finished");
    for (const p of g.players)
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    console.log(
      sport,
      "CPU result",
      g.score,
      "shots",
      g.stats.map((s) => s.shots),
    );
  });
}
test("hockey momentum decays more slowly than football", () => {
  const h = make("hockey"),
    s = make("soccer");
  for (const g of [h, s]) {
    g.user.vx = 200;
    for (let i = 0; i < 15; i++) g.step(1 / 60);
  }
  assert.ok(h.user.vx > s.user.vx * 2);
});
test("hockey boards rebound while soccer creates a throw-in", () => {
  for (const sport of ["hockey", "soccer"]) {
    const g = make(sport);
    clearLane(g);
    Object.assign(g.ball, { x: 679, y: 540, vx: 500, vy: 0 });
    g.step(1 / 60);
    if (sport === "hockey") {
      assert.equal(g.phase, "play");
      assert.ok(g.ball.vx < 0);
    } else {
      assert.equal(g.phase, "restart");
      assert.equal(g.message, "THROW-IN");
      assert.equal(g.restartData.side, 1);
    }
  }
});
test("soccer awards corner after defender last touch over goal line", () => {
  const g = make("soccer");
  clearLane(g);
  g.lastTouch = 1;
  Object.assign(g.ball, { x: 150, y: 1, vx: 0, vy: -500 });
  g.step(1 / 60);
  assert.equal(g.message, "CORNER");
  assert.equal(g.restartData.side, 0);
});
test("fixed clock caps delayed frames rather than simulating a hidden minute", () => {
  let ticks = 0;
  const clock = new FixedClock(() => ticks++);
  clock.advance(60);
  assert.ok(ticks <= 8);
  clock.reset();
  clock.advance(1 / 60);
  assert.ok(ticks >= 1);
});
test("PGI stick dead zone and normalization remain compatible", () => {
  assert.equal(stickInput(1, 1, 60).x, 0);
  const x = movementInput({ x: 1, y: 1 }, { d: true });
  assert.ok(Math.hypot(x.x, x.y) <= 1.000001);
});

test("catalogue provider falls back on outage and invalid data", async () => {
  const { loadCatalogue } = await import("../../daily_flyer/themes/pocket_sports_assets/core/catalogue.js");
  for (const bad of [
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ teams: [] }) },
  ]) {
    const calls = [];
    const catalogue = await loadCatalogue("hockey", {
      apiBase: "/api/v1/sports",
      fetcher: async (url) => {
        calls.push(url);
        return calls.length === 1
          ? bad
          : { ok: true, json: async () => data.hockey };
      },
    });
    assert.equal(catalogue.teams.length, 32);
    assert.equal(calls.length, 2);
    assert.equal(calls[1], "data/teams-hockey.json");
  }
});

test("landscape controls follow screen direction with a rotated camera", async () => {
  const { screenToWorld } = await import("../../daily_flyer/themes/pocket_sports_assets/core/math.js");
  assert.deepEqual(screenToWorld({ x: 1, y: 0, sprint: true }, true), {
    x: 0,
    y: -1,
    sprint: true,
  });
  assert.deepEqual(screenToWorld({ x: 0, y: 1 }, true), { x: 1, y: -0 });
  assert.deepEqual(screenToWorld({ x: 0.2, y: -0.5 }, false), {
    x: 0.2,
    y: -0.5,
  });
  const g = make("soccer");
  const start = g.user.y;
  for (let i = 0; i < 20; i++)
    g.step(1 / 60, screenToWorld({ x: 1, y: 0 }, true));
  assert.ok(g.user.y < start - 25);
});
