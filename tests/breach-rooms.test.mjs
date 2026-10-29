import test from 'node:test';
import assert from 'node:assert/strict';
import { BreachRooms, PROTOCOL } from '../server/breach-rooms.mjs';

// Record the simulation boundary rather than duplicating its combat rules. The
// real simulation is exercised in breach-coop and the WebSocket integration tests.
class RecordingGame {
  constructor(options) {
    this.options = options; this.updates = []; this.actions = []; this.events = [];
    this.state = { status: 'ready', time: 0, players: Object.fromEntries(options.players.map(id => [id, { id, health: 100 }])) };
  }
  start() { this.state.status = 'playing'; }
  pause() { this.state.status = 'paused'; }
  resume() { this.state.status = 'playing'; }
  update(dt, inputs) { this.updates.push({ dt, inputs: structuredClone(inputs) }); this.state.time += dt; }
  interact(id) { this.actions.push(['interact', id]); }
  switchWeapon(id) { this.actions.push(['weapon', id]); }
  restart() { this.actions.push(['restart']); this.state.time = 0; this.start(); }
  restartCheckpoint() { this.actions.push(['checkpoint']); this.start(); return true; }
  drainEvents() { return this.events.splice(0); }
  networkSnapshot() { return structuredClone(this.state); }
}

function peer() {
  return { roomId: null, playerId: null, messages: [], closes: [],
    send(message) { this.messages.push(structuredClone(message)); },
    close(code, reason) { this.closes.push({ code, reason }); },
  };
}
const last = (p, type) => p.messages.findLast(m => m.type === type);
const error = p => last(p, 'error')?.code;
const request = (type, extra = {}) => ({ type, protocol: PROTOCOL, name: 'Pilot', mission: 'crosslink-11', difficulty: 'standard', ...extra });
function setup(options = {}) {
  let time = 1000;
  const rooms = new BreachRooms({ now: () => time, GameClass: RecordingGame, ...options });
  const host = peer(), guest = peer();
  rooms.handle(host, request('create', { name: 'Host' }));
  const invite = last(host, 'welcome');
  rooms.handle(guest, request('join', { roomId: invite.roomId, name: 'Guest' }));
  return { rooms, host, guest, room: rooms.rooms.get(invite.roomId), advance(ms) { time += ms; }, time: () => time };
}
function start(f) {
  f.rooms.handle(f.host, { type: 'ready', ready: true });
  f.rooms.handle(f.guest, { type: 'ready', ready: true });
  f.rooms.handle(f.host, { type: 'start' });
  assert.equal(f.room.status, 'playing');
}

test('room validation rejects malformed and incompatible requests before allocating a room', () => {
  const rooms = new BreachRooms({ GameClass: RecordingGame });
  for (const message of [null, [], 'create', {}, { type: 3 }]) {
    const p = peer(); rooms.handle(p, message); assert.equal(error(p), 'INVALID_MESSAGE');
  }
  for (const [override, expected] of [
    [{ protocol: 1 }, 'VERSION_MISMATCH'], [{ protocol: 99 }, 'VERSION_MISMATCH'], [{ mission: 'missing' }, 'INVALID_MISSION'],
    [{ difficulty: 'impossible' }, 'INVALID_DIFFICULTY'], [{ name: ' \n<> ' }, 'INVALID_NAME'],
  ]) {
    const p = peer(); rooms.handle(p, request('create', override)); assert.equal(error(p), expected);
  }
  assert.equal(rooms.rooms.size, 0);
  const outsider = peer(); rooms.handle(outsider, { type: 'start' }); assert.equal(error(outsider), 'NOT_IN_ROOM');
});

test('invite codes identify a private two-player room and reconnect passes never enter broadcasts', () => {
  const rooms = new BreachRooms({ GameClass: RecordingGame }), host = peer(), guest = peer();
  rooms.handle(host, request('create', { name: ' <Host>\n ' }));
  const ownerWelcome = last(host, 'welcome');
  assert.match(ownerWelcome.roomId, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.match(ownerWelcome.token, /^[A-Za-z0-9_-]{32}$/);
  rooms.handle(guest, request('join', { roomId: ` ${ownerWelcome.roomId.toLowerCase()} `, name: 'Guest' }));
  const guestWelcome = last(guest, 'welcome'), room = rooms.rooms.get(ownerWelcome.roomId);
  assert.equal(guestWelcome.roomId, ownerWelcome.roomId); assert.equal(guestWelcome.selfId, 'p2');
  assert.notEqual(guestWelcome.token, ownerWelcome.token);
  assert.equal(last(host, 'room').room.players[0].name, 'Host');
  for (const recipient of [host, guest]) {
    for (const message of recipient.messages.filter(m => m.type !== 'welcome')) {
      const raw = JSON.stringify(message); assert.ok(!raw.includes(ownerWelcome.token)); assert.ok(!raw.includes(guestWelcome.token));
    }
  }
  assert.ok(!JSON.stringify(rooms.record(room)).includes('token'));
  assert.ok(!JSON.stringify(host.messages).includes(guestWelcome.token));
  assert.ok(!JSON.stringify(guest.messages).includes(ownerWelcome.token));
  const third = peer(); rooms.handle(third, request('join', { roomId: room.id })); assert.equal(error(third), 'ROOM_FULL');
  rooms.handle(host, request('create')); assert.equal(error(host), 'ALREADY_IN_ROOM');
});

test('room allocation limits release after leave and unknown invites do not allocate', () => {
  const f = setup({ maxRooms: 1 }), other = peer();
  f.rooms.handle(other, request('create')); assert.equal(error(other), 'ROOM_CAPACITY');
  f.rooms.handle(other, request('join', { roomId: 'ZZZZZZZZ' })); assert.equal(error(other), 'ROOM_NOT_FOUND');
  f.rooms.handle(f.guest, { type: 'leave' }); assert.equal(f.rooms.rooms.size, 0);
  f.rooms.handle(other, request('create')); assert.ok(last(other, 'welcome')); assert.equal(f.rooms.rooms.size, 1);
});

test('only the owner can start after both connected players explicitly become ready', () => {
  const f = setup();
  f.rooms.handle(f.guest, { type: 'start' }); assert.equal(error(f.guest), 'OWNER_ONLY');
  f.rooms.handle(f.host, { type: 'start' }); assert.equal(error(f.host), 'NOT_READY');
  f.rooms.handle(f.host, { type: 'ready', ready: true });
  f.rooms.handle(f.guest, { type: 'ready', ready: 'true' });
  f.rooms.handle(f.host, { type: 'start' }); assert.equal(error(f.host), 'NOT_READY');
  start(f);
  assert.deepEqual(f.room.game.options.players, ['p1', 'p2']);
  assert.equal(f.room.game.options.mission, 'crosslink-11');
  assert.equal(last(f.host, 'state').state.status, 'playing');
  assert.deepEqual(last(f.host, 'state'), last(f.guest, 'state'));
  const raw = JSON.stringify(last(f.host, 'state'));
  for (const p of f.room.players.values()) assert.ok(!raw.includes(p.token));
});

test('independent commands advance one shared tick, cannot impersonate another player, and expire', () => {
  const f = setup(); start(f);
  f.rooms.handle(f.host, { type: 'input', playerId: 'p2', seq: 1, forward: 5, strafe: 0, angle: .2, fire: true, dt: 100 });
  f.rooms.handle(f.guest, { type: 'input', playerId: 'p1', seq: 7, forward: 0, strafe: -5, angle: 1.2, fire: false });
  assert.equal(f.room.game.updates.length, 0, 'Client packets do not advance the simulation');
  f.rooms.step(1 / 30);
  assert.equal(f.room.game.updates.length, 1); assert.equal(f.room.game.state.time, 1 / 30);
  const first = f.room.game.updates[0];
  assert.equal(first.inputs.p1.forward, 1); assert.equal(first.inputs.p1.fire, true); assert.equal(first.inputs.p1.angle, .2);
  assert.equal(first.inputs.p2.strafe, -1); assert.equal(first.inputs.p2.fire, false); assert.equal(first.inputs.p2.angle, 1.2);
  f.rooms.handle(f.host, { type: 'input', seq: 1, forward: -1, strafe: 0, angle: 0, fire: false });
  f.rooms.handle(f.guest, { type: 'input', seq: 8, forward: NaN, strafe: 0, angle: 0, fire: true });
  f.rooms.step(1 / 30); assert.equal(f.room.game.updates.at(-1).inputs.p1.forward, 1);
  assert.equal(f.room.game.updates.at(-1).inputs.p2.strafe, -1);
  f.advance(301); f.rooms.step(1 / 30);
  const stale = f.room.game.updates.at(-1).inputs;
  for (const id of ['p1', 'p2']) { assert.equal(stale[id].forward, 0); assert.equal(stale[id].strafe, 0); assert.equal(stale[id].fire, false); }
  assert.deepEqual(last(f.host, 'state').ackByPlayer, { p1: 1, p2: 7 });
  f.rooms.handle(f.guest, { type: 'interact', playerId: 'p1' });
  assert.deepEqual(f.room.game.actions.at(-1), ['interact', 'p2']);
});

test('invalid numeric inputs and replayed sequences cannot replace accepted controls', () => {
  const f = setup(); start(f);
  const valid = { type: 'input', seq: 10, forward: .5, strafe: -.5, angle: 1, fire: false };
  f.rooms.handle(f.host, valid);
  for (const override of [{ seq: -1 }, { seq: 10 }, { seq: 1.5 }, { seq: 1e13 }, { seq: 11, angle: Infinity }, { seq: 11, angle: 1e7 }, { seq: 11, strafe: '1' }, { seq: 11, fire: 1 }]) f.rooms.handle(f.host, { ...valid, ...override });
  f.rooms.step();
  assert.equal(f.room.players.get('p1').seq, 10);
  const actual = f.room.game.updates[0].inputs.p1;
  assert.equal(actual.forward, .5); assert.equal(actual.strafe, -.5); assert.equal(actual.angle, 1); assert.equal(actual.fire, false);
});

test('deliberate pause freezes the shared world and requires fresh consent and input from both players', () => {
  const f = setup(); start(f);
  f.rooms.handle(f.host, { type: 'input', seq: 1, forward: 1, strafe: 0, angle: 0, fire: true });
  f.rooms.step(); const time = f.room.game.state.time;
  f.rooms.handle(f.guest, { type: 'pause', reason: 'background' });
  assert.equal(f.room.status, 'paused'); assert.match(f.room.pauseReason, /switched away/);
  for (let n = 0; n < 4; n++) f.rooms.step(); assert.equal(f.room.game.state.time, time);
  f.rooms.handle(f.host, { type: 'resume' }); assert.equal(f.room.status, 'paused');
  f.rooms.handle(f.guest, { type: 'resume' }); assert.equal(f.room.status, 'playing');
  f.rooms.step(); assert.equal(f.room.game.updates.at(-1).inputs.p1.forward, 0); assert.equal(f.room.game.updates.at(-1).inputs.p1.fire, false);
  assert.ok(f.room.game.state.time > time);
});

test('a connected client that stops sending controls pauses the team before either player keeps taking damage', () => {
  const f = setup(); start(f);
  f.rooms.handle(f.host, { type: 'input', seq: 1, forward: 0, strafe: 0, angle: 0, fire: false });
  f.rooms.handle(f.guest, { type: 'input', seq: 1, forward: 1, strafe: 0, angle: 0, fire: true });
  f.rooms.step(); const time = f.room.game.state.time;
  f.advance(1501);
  f.rooms.handle(f.host, { type: 'input', seq: 2, forward: 0, strafe: 0, angle: 0, fire: false });
  f.rooms.step();
  assert.equal(f.room.status, 'paused'); assert.equal(f.room.game.state.time, time);
  assert.match(f.room.pauseReason, /Guest.*stopped sending controls/);
  assert.ok([...f.room.players.values()].every(p => !p.ready));
  f.rooms.handle(f.guest, { type: 'input', seq: 2, forward: 0, strafe: 0, angle: 0, fire: false });
  assert.equal(f.room.status, 'paused', 'Returning packets do not silently resume the team');
  f.rooms.handle(f.host, { type: 'resume' }); assert.equal(f.room.status, 'paused');
  f.rooms.handle(f.guest, { type: 'resume' }); assert.equal(f.room.status, 'playing');
});

test('disconnect reserves identity, rejects forged or duplicate reconnects, and restores the same paused run', () => {
  const f = setup({ reconnectMs: 1000 }); start(f);
  const welcome = last(f.guest, 'welcome'), game = f.room.game;
  const duplicate = peer(); f.rooms.handle(duplicate, request('join', { roomId: f.room.id, token: welcome.token }));
  assert.equal(error(duplicate), 'ALREADY_CONNECTED');
  f.rooms.disconnect(f.guest); assert.equal(f.room.status, 'paused'); assert.equal(f.guest.roomId, null);
  const intruder = peer(); f.rooms.handle(intruder, request('join', { roomId: f.room.id })); assert.equal(error(intruder), 'ROOM_FULL');
  for (const token of ['x'.repeat(32), 'é'.repeat(32), 'short']) {
    const p = peer(); f.rooms.handle(p, request('join', { roomId: f.room.id, token })); assert.equal(error(p), 'INVALID_TOKEN');
  }
  f.advance(500); const returned = peer();
  f.rooms.handle(returned, request('join', { roomId: f.room.id, token: welcome.token, name: 'Changed name' }));
  assert.equal(last(returned, 'welcome').selfId, 'p2'); assert.equal(last(returned, 'welcome').resumed, true);
  assert.equal(f.room.game, game); assert.equal(f.room.players.get('p2').name, 'Guest');
  assert.equal(last(returned, 'state').state.status, 'paused');
  f.rooms.handle(f.guest, { type: 'resume' }); assert.equal(error(f.guest), 'NOT_IN_ROOM');
  f.rooms.handle(f.host, { type: 'resume' }); assert.equal(f.room.status, 'paused');
  f.rooms.handle(returned, { type: 'resume' }); assert.equal(f.room.status, 'playing');
});

test('expired reconnect slots close the private room rather than accepting a replacement', () => {
  const f = setup({ reconnectMs: 500 }); start(f);
  const token = last(f.guest, 'welcome').token, id = f.room.id;
  f.rooms.disconnect(f.guest); f.advance(501); f.rooms.step();
  assert.equal(f.rooms.rooms.size, 0); assert.match(last(f.host, 'closed').message, /reconnect/);
  const late = peer(); f.rooms.handle(late, request('join', { roomId: id, token })); assert.equal(error(late), 'ROOM_NOT_FOUND');
});

test('idle lobbies expire, active play ignores idle timeout, and maximum lifetime still applies', () => {
  const lobby = setup({ idleMs: 500, maxLifeMs: 2000 }); lobby.advance(501); lobby.rooms.step(); assert.equal(lobby.rooms.rooms.size, 0);
  const active = setup({ idleMs: 500, maxLifeMs: 2000 }); start(active);
  active.advance(1000); active.rooms.step(); assert.equal(active.rooms.rooms.size, 1);
  active.advance(1001); active.rooms.step(); assert.equal(active.rooms.rooms.size, 0);
});

test('shared retries are owner-only and pause for both players; leave and shutdown notify the team', () => {
  const f = setup(); start(f);
  f.rooms.handle(f.guest, { type: 'restart', checkpoint: true }); assert.equal(error(f.guest), 'OWNER_ONLY');
  f.rooms.handle(f.host, { type: 'restart', checkpoint: true });
  assert.deepEqual(f.room.game.actions.at(-1), ['checkpoint']); assert.equal(f.room.status, 'paused');
  assert.ok([...f.room.players.values()].every(p => !p.ready));
  f.rooms.handle(f.guest, { type: 'leave' });
  for (const p of [f.host, f.guest]) { assert.match(last(p, 'closed').message, /Guest left/); assert.equal(p.closes.at(-1).code, 1000); assert.equal(p.roomId, null); }
  const restart = setup(); restart.rooms.shutdown(); assert.equal(restart.rooms.rooms.size, 0);
  for (const p of [restart.host, restart.guest]) assert.match(last(p, 'closed').message, /restarting/);
  const next = peer(); restart.rooms.handle(next, request('create')); assert.equal(error(next), 'SERVER_RESTARTING');
});
