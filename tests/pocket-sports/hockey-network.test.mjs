import test from "node:test";
import assert from "node:assert/strict";
import { HockeyRooms, RoomError, safeInput, INPUT_TTL, CONNECTION_TTL, RECONNECT_TTL } from "../../server/pocket-sports/rooms.mjs";
import { HockeyNetwork, networkVector } from "../../daily_flyer/themes/pocket_sports_assets/core/hockey-network.js";

function fixture({ start = true, ...options } = {}) {
  let clock = 100000;
  const rooms = new HockeyRooms({ now: () => clock, ...options });
  const host = rooms.request({ op: "create", homeTeamId: "bos", awayTeamId: "mtl", name: "Host" });
  const guest = rooms.request({ op: "join", code: host.room.code, name: "Guest" });
  const room = rooms.rooms.get(host.room.code);
  const call = (seat, op, extra = {}) => rooms.request({ op, code: room.code, token: seat.token, ...extra });
  if (start) { call(host, "ready"); call(guest, "ready"); call(host, "start"); }
  return { rooms, host, guest, room, call, now: () => clock,
    advance: (ms, tick = false) => { clock += ms; if (tick) rooms.step(1 / 60); } };
}
const invalid = (fn, status, code) => assert.throws(fn, error => error instanceof RoomError &&
  error.status === status && (code == null || error.code === code));

test("four seats can mix team control and skater locks without sharing a skater", () => {
  const f = fixture({ start: false });
  const third = f.rooms.request({ op: "join", code: f.room.code });
  const fourth = f.rooms.request({ op: "join", code: f.room.code });
  assert.deepEqual(f.room.players.map(p => [p.side, p.mode]), [[0, "team"], [1, "team"], [0, "skater"], [1, "skater"]]);
  assert.equal(new Set(f.room.players.map(p => p.playerId)).size, 4);
  invalid(() => f.rooms.request({ op: "join", code: f.room.code }), 409);
  for (const seat of [f.host, f.guest, third, fourth]) f.call(seat, "ready");
  f.call(f.host, "start");
  assert.equal(f.room.game.controllers.length, 4);
  assert.equal(new Set(f.room.game.controllers.map(p => p.playerId)).size, 4);
  assert.equal(f.room.game.controlled, -1, "authority does not privilege a local home player");
});

test("two skater locks can cooperate on one side and configurations are atomic", () => {
  const f = fixture({ start: false });
  f.call(f.host, "configure", { mode: "skater", playerId: 5 });
  f.call(f.guest, "configure", { side: 0, mode: "skater", playerId: 4 });
  const before = f.room.players.map(p => ({ side: p.side, mode: p.mode, playerId: p.playerId }));
  invalid(() => f.call(f.guest, "configure", { playerId: 5 }), 409);
  assert.deepEqual(f.room.players.map(p => ({ side: p.side, mode: p.mode, playerId: p.playerId })), before);
  f.call(f.host, "ready"); f.call(f.guest, "ready"); f.call(f.host, "start");
  assert.deepEqual(f.room.game.controllers.map(p => p.side), [0, 0]);
});

test("one team controller per side is enforced before starting", () => {
  const f = fixture({ start: false });
  invalid(() => f.rooms.request({ op: "join", code: f.room.code, side: 0, mode: "team" }), 409, "TEAM_CONTROLLER_TAKEN");
  invalid(() => f.call(f.guest, "configure", { side: 0, mode: "team" }), 409, "TEAM_CONTROLLER_TAKEN");
  assert.equal(f.room.players.length, 2);
  assert.equal(f.room.players[1].side, 1);
});

test("private seat tokens do not leak and forged or unicode tokens cannot reconnect", () => {
  const f = fixture();
  const publicReply = f.call(f.guest, "poll", { seq: 0, input: {} });
  assert.equal(JSON.stringify(publicReply).includes(f.host.token), false);
  assert.equal(JSON.stringify(publicReply).includes(f.guest.token), false);
  invalid(() => f.rooms.request({ op: "poll", code: f.room.code, token: "x".repeat(32) }), 403, "INVALID_TOKEN");
  invalid(() => f.rooms.request({ op: "join", code: f.room.code, token: "é".repeat(32) }), 403, "INVALID_TOKEN");
  invalid(() => f.rooms.request({ op: "join", code: f.room.code }), 409);
});

test("only the host starts and all players must be ready and connected", () => {
  const f = fixture({ start: false });
  invalid(() => f.call(f.guest, "start"), 403);
  invalid(() => f.call(f.host, "start"), 409);
  f.call(f.host, "ready"); f.call(f.guest, "ready");
  f.advance(CONNECTION_TTL + 1);
  invalid(() => f.call(f.host, "start"), 409);
  f.call(f.guest, "poll");
  assert.equal(f.call(f.host, "start").room.status, "playing");
});

test("bounded movement input cannot write positions or scores", () => {
  for (const convert of [safeInput, networkVector]) {
    assert.equal(Math.hypot(convert({ x: 99, y: -99 }).x, convert({ x: 99, y: -99 }).y), 1);
    assert.deepEqual(convert(null), convert({}));
    assert.equal(convert({ x: Infinity, y: NaN, sprint: "yes", fightHeld: 1 }).x, 0);
    assert.equal(convert({ sprint: "yes", fightHeld: 1 }).sprint, false);
  }
  const f = fixture(), x = f.room.game.players[5].x;
  f.call(f.host, "poll", { seq: 10, input: { x: 999, y: 999, sprint: true },
    state: { score: [99, 0], players: [{ id: 5, x: 99999 }] } });
  assert.equal(Math.hypot(f.room.players[0].input.x, f.room.players[0].input.y), 1);
  assert.equal(f.room.game.players[5].x, x);
  assert.deepEqual(f.room.game.score, [0, 0]);
  f.call(f.host, "poll", { seq: 9, input: { x: -1 } });
  assert.ok(f.room.players[0].input.x > 0, "out of order movement is ignored");
});

test("actions are deduplicated and direct fight/forged hold durations are ignored", () => {
  const f = fixture(), executed = [];
  f.room.game.controllerAction = (...args) => executed.push(args);
  const actions = [
    { seq: 0, name: "hockey-shot", power: 999, details: { heldSeconds: 999 } },
    { seq: 1, name: "hockey-fight", details: { heldSeconds: 999 } },
  ];
  f.call(f.host, "poll", { seq: 0, input: {}, actions });
  f.call(f.host, "poll", { seq: 1, input: {}, actions });
  f.rooms.step(1 / 60);
  assert.equal(executed.length, 1);
  assert.equal(executed[0][1], "hockey-shot");
  assert.equal(executed[0][3], 0.22);
  assert.equal(executed[0][4].heldSeconds, 0);
  assert.equal(f.call(f.host, "poll").actionAck, 1);
});

test("shot and dump charges use elapsed server input time and cancel on possession changes", () => {
  const f = fixture(), seat = f.room.players[0];
  f.call(f.host, "poll", { seq: 0, input: { shotHeld: true } });
  f.advance(600);
  f.call(f.host, "poll", { seq: 1, input: {}, actions: [{ seq: 0, name: "hockey-shot", details: { heldSeconds: 0 } }] });
  assert.equal(seat.commands[0].details.heldSeconds, 0.6);
  assert.ok(seat.commands[0].power > 0.7 && seat.commands[0].power < 0.71);
  seat.commands = [];
  f.call(f.host, "poll", { seq: 2, input: { dumpHeld: true } });
  f.advance(1200);
  f.room.game.puckEpoch++;
  f.call(f.host, "poll", { seq: 3, input: {}, actions: [{ seq: 1, name: "hockey-dump", details: { heldSeconds: 4 } }] });
  assert.equal(seat.commands[0].details.heldSeconds, 0);
  assert.equal(seat.commands[0].power, 0.08);
});

test("a queued charge cannot transfer to a different skater or possession before simulation", () => {
  const f = fixture(), executed = [];
  f.call(f.host, "poll", { seq: 0, input: { shotHeld: true } });
  f.advance(600);
  f.call(f.host, "poll", { seq: 1, input: {}, actions: [{ seq: 0, name: "hockey-shot" }] });
  f.room.game.controllers[0].playerId = 4;
  f.room.game.ball.owner = 4;
  f.room.game.controllerAction = (...args) => executed.push(args);
  f.rooms.step(1 / 60);
  assert.equal(executed.length, 0);
});

test("stale input stops, stalled connections pause, and authenticated reconnect preserves a seat", () => {
  const f = fixture();
  f.call(f.host, "poll", { seq: 0, input: { x: 1, fightHeld: true, shotHeld: true } });
  f.advance(INPUT_TTL + 1, true);
  assert.deepEqual(f.room.players[0].input, safeInput({}));
  assert.deepEqual(f.room.players[0].holds, {});
  f.advance(CONNECTION_TTL + 1, true);
  assert.equal(f.room.status, "paused");
  const rejoined = f.rooms.request({ op: "join", code: f.room.code, token: f.host.token });
  assert.equal(rejoined.seatId, f.host.seatId);
  assert.equal(rejoined.room.players.length, 2);
  f.rooms.request({ op: "join", code: f.room.code, token: f.guest.token });
  assert.equal(f.call(f.host, "resume").room.status, "paused");
  assert.equal(f.call(f.guest, "resume").room.status, "playing");
  f.advance(CONNECTION_TTL + 1, true);
  f.advance(RECONNECT_TTL + 1, true);
  invalid(() => f.call(f.host, "poll"), 404, "ROOM_ENDED");
});

test("a shared pause requires every player to resume and a game departure ends the room", () => {
  const f = fixture();
  f.call(f.guest, "pause");
  const time = f.room.game.time;
  f.rooms.step(1);
  assert.equal(f.room.game.time, time);
  assert.equal(f.call(f.host, "resume").room.status, "paused");
  assert.equal(f.call(f.guest, "resume").room.status, "playing");
  assert.equal(f.call(f.guest, "leave").closed, true);
  invalid(() => f.call(f.host, "poll"), 404, "ROOM_ENDED");
});

test("lobby departures transfer host and rooms have bounded capacity", () => {
  const f = fixture({ start: false, maxRooms: 1 });
  invalid(() => f.rooms.request({ op: "create", home: "bos", away: "mtl" }), 503, "ROOMS_BUSY");
  f.call(f.host, "leave");
  assert.equal(f.room.hostId, f.guest.seatId);
  f.call(f.guest, "leave");
  assert.equal(f.rooms.rooms.size, 0);
});

test("events are delivered once with stable IDs and full match details remain serializable", () => {
  const f = fixture();
  f.room.game.emit("goal", { side: 0 });
  f.rooms.collectEvents(f.room); f.rooms.collectEvents(f.room);
  const state = f.call(f.host, "poll").state;
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].networkId, 1);
  assert.ok(Array.isArray(state.penalties));
  assert.equal(typeof state.ball.z, "number");
  assert.ok(Array.isArray(state.stats));
  assert.doesNotThrow(() => JSON.stringify(state));
});

function clientFixture() {
  const f = fixture();
  const network = new HockeyNetwork({ now: f.now, storage: { getItem: () => null } });
  network.accept(f.call(f.guest, "poll"));
  return { ...f, network };
}

test("client hydration preserves player identity, away-side getters, and server game time", () => {
  const f = clientFixture(), n = f.network, game = n.game;
  assert.equal(game.localSide, 1);
  assert.equal(game.user.side, 1);
  assert.equal(typeof game.canPlayPuck, "function");
  const actor = game.user, time = game.time, score = [...game.score];
  n.setInput({ x: 1 });
  n.step(1 / 60);
  assert.ok(actor.x > f.room.game.players[actor.id].x);
  game.step(60, { x: 1 });
  assert.equal(game.time, time);
  assert.deepEqual(game.score, score);
  n.accept(f.call(f.guest, "poll"));
  assert.equal(n.game, game);
  assert.equal(n.game.user, actor);
  assert.ok(n.history.length <= 1);
  n.stop();
});

test("prediction only steers the local active skater and freezes on stale or paused snapshots", () => {
  const f = clientFixture(), n = f.network, actor = n.game.user;
  const other = n.game.players[1], x = other.x, y = other.y;
  n.setInput({ x: 1, y: 1 }); n.step(0.05);
  assert.equal(other.x, x); assert.equal(other.y, y);
  actor.offIce = true;
  const inactiveX = actor.x;
  n.step(0.05);
  assert.ok(actor.x <= inactiveX, "an inactive skater may reconcile but cannot steer forward");
  actor.offIce = false;
  f.advance(801);
  const staleX = actor.x; n.step(0.05);
  assert.equal(actor.x, staleX);
  n.accept(f.call(f.guest, "pause"));
  const pausedX = actor.x; n.step(0.05);
  assert.equal(actor.x, pausedX);
  assert.equal(n.history.length, 0);
  n.stop();
});

test("client rejects reordered replies and clears every held action on interruption", () => {
  const f = clientFixture(), n = f.network;
  const old = f.call(f.guest, "poll");
  const paused = f.call(f.guest, "pause");
  n.accept(paused); n.accept(old);
  assert.equal(n.room.status, "paused");
  n.setInput({ x: 1, shotHeld: true, dumpHeld: true, fightHeld: true });
  n.clearInput();
  assert.deepEqual(n.input, networkVector({}));
  assert.deepEqual(n.history, []);
  n.stop();
});

test("held-button edges poll immediately and release vectors accompany the action", () => {
  const f = clientFixture(), n = f.network, scheduled = [];
  n.running = true;
  n.schedule = delay => scheduled.push(delay);
  n.setInput({ shotHeld: true });
  assert.deepEqual(scheduled, [0]);
  n.action("hockey-shot", { x: 1, shotHeld: false }, 0.5, { heldSeconds: 0.5 });
  assert.equal(n.input.shotHeld, false);
  assert.equal(n.actions.length, 1);
  assert.equal(n.actions[0].input.shotHeld, false);
  assert.equal(n.input.x, 1);
  n.stop();
});

test("private reconnect credentials remain in tab storage and are sent only in JSON bodies", async () => {
  const f = fixture({ start: false }), values = new Map(), sent = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  values.set(`dfe.hockey.room.${f.room.code}`, JSON.stringify({ token: f.guest.token, seatId: f.guest.seatId }));
  const n = new HockeyNetwork({ storage, now: f.now, fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); sent.push({ url, body });
    return { ok: true, json: async () => f.rooms.request({ ...body, op: "join" }) };
  } });
  await n.join(f.room.code.toLowerCase());
  n.stop();
  assert.equal(n.seatId, f.guest.seatId);
  assert.equal(sent[0].url, "/api/v1/hockey/rooms/join");
  assert.equal(sent[0].body.token, f.guest.token);
  assert.equal(HockeyNetwork.savedRoom(storage), f.room.code);
  assert.equal(n.room.players.length, 2);
});

test("a failed poll stops prediction without inventing match outcomes", async () => {
  const f = clientFixture(), n = f.network;
  n.running = true; n.token = f.guest.token;
  n.fetchImpl = async () => { throw new TypeError("offline"); };
  n.setInput({ x: 1 });
  await n.flush();
  assert.equal(n.connected, false);
  const x = n.game.user.x, score = [...n.game.score];
  n.step(0.05);
  assert.equal(n.game.user.x, x);
  assert.deepEqual(n.game.score, score);
  n.stop();
});
