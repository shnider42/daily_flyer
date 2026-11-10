import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Match } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";
import { playerActionRatings } from "../../daily_flyer/themes/pocket_sports_assets/core/ballistics.js";
import { HockeyRooms } from "../../server/pocket-sports/rooms.mjs";
import { HockeyNetwork } from "../../daily_flyer/themes/pocket_sports_assets/core/hockey-network.js";

const teams = Object.fromEntries(["soccer", "hockey"].map(sport => [sport,
  JSON.parse(fs.readFileSync(new URL(`../../daily_flyer/themes/pocket_sports_assets/data/teams-${sport}.json`, import.meta.url))).teams,
]));
const rating = value => ({ passing: value, crossing: value, shooting: value, lofting: value });
const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fixture(sport = "soccer", { side = 0, seed = 42, skill = 80, cross = false, controlMode = "keyboard" } = {}) {
  const g = new Match({ sport, home: teams[sport][0], away: teams[sport][1], seed,
    practice: true, controlMode, touchAssist: true });
  g.phase = "play";
  g.restartData = null;
  g.cooldown = 0;
  g.events = [];
  for (const [index, p] of g.players.entries()) Object.assign(p, {
    x: 45 + (index % 10) * 26, y: 1250 + Math.floor(index / 10) * 35,
    vx: 0, vy: 0, stun: 99, decision: 99, stamina: 1,
    ratings: rating(skill),
  });
  const p = g.players[side * g.rules.count + g.rules.count - 1];
  const q = g.players[side * g.rules.count + g.rules.count - 3];
  const mirror = y => side ? g.rules.height - y : y;
  Object.assign(p, { x: cross ? 120 : 440, y: mirror(cross ? 300 : 900),
    vx: 0, vy: 0, stun: 0, decision: 99, fx: cross ? 0.94 : 0, fy: (side ? 1 : -1) * (cross ? 0.34 : 1) });
  Object.assign(q, { x: 440, y: mirror(cross ? 180 : 600), vx: 0, vy: 0, stun: 0, decision: 99 });
  g.controlled = p.id;
  Object.assign(g.ball, { x: p.x, y: p.y, owner: p.id, vx: 0, vy: 0,
    z: 0, vz: 0, lock: 0, shot: false, receiver: null, passerLock: 0 });
  g.lastTouch = side;
  return { g, p, q };
}

function tick(g, seconds) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60)
    g.step(Math.min(1 / 60, seconds - elapsed), { x: 0, y: 0, sprint: false });
}

function releaseError({ sport = "soccer", name = "lob", skill = 80, seed = 42, cross = true, input = {}, power = 0.65 } = {}) {
  const { g, p, q } = fixture(sport, { skill, seed, cross });
  const plan = g.aimPreview(name, input, power);
  assert.ok(plan);
  assert.equal(g.action(name, input, power), true);
  const actual = g.ball.airTarget || g.ball.passTarget;
  assert.ok(actual, `${name} must expose its physical destination`);
  return { g, p, q, plan, actual, error: separation(actual, plan.target) };
}

test("arcade action ratings are role-based across clubs and accept only finite explicit overrides", () => {
  const one = fixture("soccer", { skill: 80 }).g;
  for (let slot = 0; slot < one.rules.count; slot++) {
    const home = one.players[slot], away = one.players[slot + one.rules.count];
    delete home.ratings;
    delete away.ratings;
    assert.deepEqual(playerActionRatings(home, "soccer"), playerActionRatings(away, "soccer"));
  }
  const defaults = playerActionRatings({ role: "CM" }, "soccer");
  const custom = playerActionRatings({ role: "CM", ratings: {
    passing: 99, crossing: Infinity, shooting: "99", lofting: -5,
  } }, "soccer");
  assert.equal(custom.passing, 99);
  assert.equal(custom.crossing, defaults.crossing);
  assert.equal(custom.shooting, defaults.shooting);
  assert.ok(custom.lofting >= 1 && custom.lofting <= 99);
  assert.notEqual(defaults.passing, playerActionRatings({ role: "CB" }, "soccer").passing);
});

test("lineup ratings match the same players' actual simulation ratings in both sports", () => {
  for (const sport of ["soccer", "hockey"]) {
    const g = new Match({ sport, home: teams[sport][0], away: teams[sport][1] });
    for (const player of g.players) {
      const source = g.teams[player.side].players.find(p => p.name === player.name);
      assert.ok(source);
      assert.deepEqual(player.ratings, playerActionRatings(source, sport), `${sport}: ${player.name}`);
    }
  }
});

test("aiming previews never consume randomness or mutate a match", () => {
  const { g } = fixture("soccer", { cross: true });
  const before = g.snapshot();
  let calls = 0;
  g.random = () => { calls++; return 0.1; };
  const first = g.aimPreview("lob", { x: 0.25, y: -0.6 }, 0.7);
  for (let frame = 0; frame < 120; frame++)
    assert.deepEqual(g.aimPreview("lob", { x: 0.25, y: -0.6 }, 0.7), first);
  assert.equal(calls, 0, "rendering an aim marker must not change the next kick");
  assert.deepEqual(g.snapshot(), before);
});

test("cross execution improves progressively from 70 to 90 to 99 without guaranteed perfect deliveries", () => {
  const averages = [70, 90, 99].map(skill => {
    let sum = 0, maximum = 0, changed = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { error, plan } = releaseError({ skill, seed });
      sum += error;
      maximum = Math.max(maximum, error);
      if (error > 1e-6) changed++;
      assert.ok(Number.isFinite(error));
      assert.ok(error <= plan.uncertaintyRadius * 1.5 + 1, "sample remains in a bounded neighbourhood of the aimed point");
    }
    assert.ok(changed > 90, "a cross must have actual execution variation");
    return { average: sum / 100, maximum };
  });
  assert.ok(averages[0].average > averages[1].average * 1.2, JSON.stringify(averages));
  assert.ok(averages[1].average > averages[2].average * 1.2, JSON.stringify(averages));
  assert.ok(averages[2].average < averages[0].average * 0.45, JSON.stringify(averages));
});

test("a specialist's crossing rating changes crosses independently of their passing rating", () => {
  const low = fixture("soccer", { cross: true }), high = fixture("soccer", { cross: true });
  low.p.ratings.crossing = 55;
  high.p.ratings.crossing = 99;
  const lowCross = low.g.aimPreview("lob", {}), highCross = high.g.aimPreview("lob", {});
  assert.equal(lowCross.action, "crossing");
  assert.equal(highCross.rating, 99);
  assert.ok(lowCross.uncertaintyRadius > highCross.uncertaintyRadius);
  assert.equal(low.g.aimPreview("ground", {}).uncertaintyRadius, high.g.aimPreview("ground", {}).uncertaintyRadius);
});

test("ground passes, lofts and shots use their own action ratings in both sports", () => {
  const cases = [
    ["soccer", "ground", "passing"], ["soccer", "through", "passing"],
    ["soccer", "lob", "lofting"], ["soccer", "shoot", "shooting"],
    ["hockey", "hockey-pass", "passing"], ["hockey", "hockey-saucer", "lofting"],
    ["hockey", "hockey-dump", "lofting"], ["hockey", "hockey-shot", "shooting"],
  ];
  for (const [sport, action, attribute] of cases) {
    const averageError = skill => {
      let total = 0;
      for (let seed = 1; seed <= 48; seed++) {
        const { g, p } = fixture(sport, { seed, skill: 99 });
        p.ratings[attribute] = skill;
        const input = { x: 0, y: -1 }, plan = g.aimPreview(action, input, 0.5);
        assert.equal(plan.rating, skill);
        assert.equal(g.action(action, input, 0.5), true);
        const actual = attribute === "shooting"
          ? { x: g.ball.x + g.ball.vx * (plan.target.y - g.ball.y) / g.ball.vy, y: plan.target.y }
          : g.ball.airTarget || g.ball.passTarget;
        total += separation(actual, plan.target);
      }
      return total / 48;
    };
    const ordinary = averageError(70), elite = averageError(99);
    assert.ok(ordinary > elite * 1.5, `${sport} ${action}: ${ordinary} vs ${elite}`);
  }
});

test("the human aim-assistance slider does not alter CPU shot intent or execution difficulty", () => {
  for (const sport of ["soccer", "hockey"]) {
    const { g, p } = fixture(sport);
    g.autoplay = true;
    g.controlled = -1;
    g.aimAssist = 0;
    const manual = g.aimPreview("shoot", { x: 0.4, y: -0.9 }, 0.65, p);
    g.aimAssist = 1;
    const assisted = g.aimPreview("shoot", { x: 0.4, y: -0.9 }, 0.65, p);
    assert.deepEqual(manual, assisted);
    g.autoplay = false;
    g.controlled = p.id;
    const humanAssisted = g.aimPreview("shoot", { x: 0.4, y: -0.9 }, 0.65, p);
    g.aimAssist = 0;
    const humanManual = g.aimPreview("shoot", { x: 0.4, y: -0.9 }, 0.65, p);
    assert.notEqual(humanManual.target.x, humanAssisted.target.x);
  }
});

test("pressure, fatigue, long range and full power widen an elite player's execution envelope", () => {
  const clean = fixture("soccer", { skill: 99, cross: true });
  const calm = clean.g.aimPreview("lob", {}, 0.55);
  const defender = clean.g.players.find(p => p.side !== clean.p.side && !p.keeper);
  Object.assign(defender, { x: clean.p.x + 22, y: clean.p.y, stun: 0 });
  const pressure = clean.g.aimPreview("lob", {}, 0.55);
  assert.ok(pressure.uncertaintyRadius > calm.uncertaintyRadius);
  Object.assign(defender, { x: 800, y: 1300 });
  clean.p.stamina = 0.1;
  const tired = clean.g.aimPreview("lob", {}, 0.55);
  assert.ok(tired.uncertaintyRadius > calm.uncertaintyRadius);
  clean.p.stamina = 1;
  assert.ok(clean.g.aimPreview("lob", {}, 1).uncertaintyRadius > calm.uncertaintyRadius);

  const distanceCase = fixture("soccer");
  distanceCase.q.y = 820;
  const short = distanceCase.g.aimPreview("ground", {});
  distanceCase.q.y = 360;
  const long = distanceCase.g.aimPreview("ground", {});
  assert.equal(short.receiverId, long.receiverId);
  assert.ok(long.uncertaintyRadius > short.uncertaintyRadius);
});

test("crosses can be placed left, right, short and long without changing the intended receiver", () => {
  const { g } = fixture("soccer", { cross: true, skill: 99 });
  const left = g.aimPreview("lob", { x: -0.65, y: 0 });
  const right = g.aimPreview("lob", { x: 0.65, y: 0 });
  const short = g.aimPreview("lob", { x: 0, y: 0.65 });
  const long = g.aimPreview("lob", { x: 0, y: -0.65 });
  assert.equal(left.receiverId, right.receiverId);
  assert.equal(short.receiverId, long.receiverId);
  assert.ok(right.target.x > left.target.x + 15);
  assert.ok(short.target.y > long.target.y + 15);
});

for (const [sport, action, cross] of [["soccer", "lob", true], ["hockey", "hockey-saucer", false], ["hockey", "hockey-dump", false]]) {
  test(`${sport} ${action} flight stays fixed when the intended receiver moves after release`, () => {
    const first = releaseError({ sport, name: action, cross, input: { x: 0, y: -1 }, power: 0.5 });
    const second = releaseError({ sport, name: action, cross, input: { x: 0, y: -1 }, power: 0.5 });
    const target = { ...first.g.ball.airTarget };
    for (const f of [first, second]) {
      for (const p of f.g.players) p.stun = 99;
      f.g.controlled = -1;
    }
    second.q.x = 800;
    second.q.y = 1150;
    const duration = first.g.ball.airTime;
    tick(first.g, duration * 0.55);
    tick(second.g, duration * 0.55);
    assert.deepEqual(first.g.ball.airTarget, target);
    assert.deepEqual(second.g.ball.airTarget, target);
    assert.equal(first.g.ball.x, second.g.ball.x);
    assert.equal(first.g.ball.y, second.g.ball.y);
    assert.equal(first.g.ball.z, second.g.ball.z);
    assert.equal(first.g.ball.owner, null);
    assert.equal(second.g.ball.owner, null);
  });
}

test("the same seed and intent reproduce the same error, and previews cannot change it", () => {
  const direct = fixture("soccer", { cross: true, seed: 873 });
  const previewed = fixture("soccer", { cross: true, seed: 873 });
  for (let frame = 0; frame < 500; frame++) previewed.g.aimPreview("lob", { x: 0.3, y: -0.2 });
  direct.g.action("lob", { x: 0.3, y: -0.2 });
  previewed.g.action("lob", { x: 0.3, y: -0.2 });
  assert.deepEqual(previewed.g.ball, direct.g.ball);
});

test("shot placement follows opposite stick directions even with identical ratings and seeds", () => {
  for (const sport of ["soccer", "hockey"]) {
    const left = fixture(sport), right = fixture(sport);
    const action = sport === "soccer" ? "shoot" : "hockey-shot";
    const beforeLeft = left.g.aimPreview(action, { x: -0.6, y: -0.8 }, 0.4);
    const beforeRight = right.g.aimPreview(action, { x: 0.6, y: -0.8 }, 0.4);
    assert.ok(beforeLeft.target.x < beforeRight.target.x);
    left.g.action(action, { x: -0.6, y: -0.8 }, 0.4);
    right.g.action(action, { x: 0.6, y: -0.8 }, 0.4);
    assert.ok(left.g.ball.vx < right.g.ball.vx);
  }
});

test("a badly aimed 99-rated shot can still miss and take the normal boundary path", () => {
  const { g, p } = fixture("soccer", { skill: 99 });
  p.y = 140;
  g.ball.y = p.y;
  g.aimAssist = 0;
  const preview = g.aimPreview("shoot", { x: 1, y: -0.1 }, 0.7);
  assert.ok(preview.target.x > g.rules.width / 2 + g.rules.goal / 2);
  g.action("shoot", { x: 1, y: -0.1 }, 0.7);
  for (const player of g.players) player.stun = 99;
  tick(g, 0.65);
  assert.deepEqual(g.score, [0, 0]);
  assert.equal(g.phase, "restart");
  assert.equal(g.restartData.type, "GOAL KICK");
});

test("home and away hockey humans get the same rating error and mirrored release intent", () => {
  const releases = [0, 1].map(side => {
    const f = fixture("hockey", { side, skill: 76, seed: 777 });
    const { g, p } = f;
    g.setControllers([
      { id: "home", side: 0, mode: "skater", playerId: 5 },
      { id: "away", side: 1, mode: "skater", playerId: 11 },
    ], side ? "away" : "home");
    const input = { x: 0.25, y: side ? 0.8 : -0.8 };
    const plan = g.aimPreview("hockey-shot", input, 0.4, p);
    assert.equal(g.controllerAction(side ? "away" : "home", "hockey-shot", input, 0.4), true);
    return { g, plan };
  });
  assert.equal(releases[0].plan.rating, releases[1].plan.rating);
  assert.equal(releases[0].plan.uncertaintyRadius, releases[1].plan.uncertaintyRadius);
  assert.equal(releases[0].plan.target.x, releases[1].plan.target.x);
  assert.equal(releases[0].g.ball.vx, releases[1].g.ball.vx);
  assert.equal(releases[0].g.ball.vy, -releases[1].g.ball.vy);
});

test("ratings and intended flight metadata survive network hydration and replay snapshots", () => {
  let clock = 100000;
  const rooms = new HockeyRooms({ now: () => clock });
  const host = rooms.request({ op: "create", homeTeamId: "bos", awayTeamId: "mtl" });
  const guest = rooms.request({ op: "join", code: host.room.code });
  const room = rooms.rooms.get(host.room.code);
  const request = (who, op, data = {}) => rooms.request({ op, code: room.code, token: who.token, ...data });
  request(host, "ready"); request(guest, "ready"); request(host, "start");
  const g = room.game, actor = g.players[g.controllers[0].playerId];
  actor.ratings = rating(87);
  g.ball.owner = actor.id;
  g.phase = "play";
  assert.equal(g.controllerAction(g.controllers[0].id, "hockey-saucer", { x: 0, y: -1 }), true);
  const snapshot = g.snapshot();
  assert.ok(snapshot.ball.intendedTarget);
  const frozenRating = snapshot.players[actor.id].ratings.passing;
  const frozenTarget = snapshot.ball.intendedTarget.x;
  actor.ratings.passing = 42;
  g.ball.intendedTarget.x += 10;
  assert.equal(snapshot.players[actor.id].ratings.passing, frozenRating);
  assert.equal(snapshot.ball.intendedTarget.x, frozenTarget);
  const client = new HockeyNetwork({ now: () => clock, storage: { getItem: () => null } });
  client.accept(request(guest, "poll"));
  assert.deepEqual(client.game.players[actor.id].ratings, actor.ratings);
  assert.deepEqual(client.game.ball.intendedTarget, g.ball.intendedTarget);
  assert.equal(typeof client.game.aimPreview, "function");
  client.stop();
});
