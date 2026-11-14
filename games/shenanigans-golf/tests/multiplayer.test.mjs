import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomHub, RoomError, cleanName } from '../multiplayer.mjs';

function setup(t, options = {}) {
  let time = 100000;
  const hub = new RoomHub({ now: () => time, ...options });
  t.after(() => hub.close());
  const host = hub.create({ name: 'Host', difficulty: 'club' });
  const sequence = new Map();
  const streams = new Map();
  function connect(seat) {
    const packets = [], stream = packet => packets.push(packet);
    stream.closed = false; stream.close = () => { stream.closed = true; };
    const disconnect = hub.connect(seat.code, seat.token, stream);
    const value = { stream, packets, disconnect }; streams.set(seat.playerId, value); return value;
  }
  function input(seat, action, extra = {}) {
    const state = hub.room(seat.code).game.state;
    const seq = (sequence.get(seat.token) || 0) + 1; sequence.set(seat.token, seq);
    return hub.input(seat.code, seat.token, { seq, roundId: state.roundId, holeIndex: state.holeIndex, action, ...extra });
  }
  function advance(ms, dt = 0) { time += ms; hub.tick(dt); }
  return { hub, host, connect, input, advance, streams, get room() { return hub.room(host.code); } };
}

test('rooms have four permanent seats with computer fill and no public credentials', t => {
  const p = setup(t), state = p.host.snapshot;
  assert.equal(state.phase, 'lobby'); assert.equal(state.players.length, 4);
  assert.deepEqual(state.players.map(player => player.id), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(state.players.filter(player => player.human).length, 1);
  assert.equal(state.players.filter(player => player.isBot).length, 3);
  assert.equal(state.hostId, p.host.playerId);
  assert.match(p.host.code, /^[A-Z2-9]{6}$/); assert.match(p.host.token, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(state).includes(p.host.token), false);
  const before = p.room.game.state.time;
  p.advance(1000, .25);
  assert.equal(p.room.game.state.time, before, 'lobby simulation stays still');
});

test('four humans join; a fifth cannot steal a seat; names are bounded', t => {
  const p = setup(t), tokens = [p.host.token];
  for (let i = 0; i < 3; i++) tokens.push(p.hub.join(p.host.code, { name: '<Guest>\n' + 'x'.repeat(90) }).token);
  assert.equal(new Set(tokens).size, 4);
  assert.throws(() => p.hub.join(p.host.code, { name: 'Fifth' }), error => error.status === 409 && error.code === 'room_full');
  for (const player of p.hub.snapshot(p.room).players) {
    assert.equal(player.human, true); assert.ok([...player.name].length <= 22); assert.doesNotMatch(player.name, /[<>\n]/);
  }
  assert.equal(cleanName(null), 'Golfer'); assert.equal(cleanName('\n<>'), 'Golfer');
});

test('host starts the round; another credential cannot start or take another seat shot', t => {
  const p = setup(t), guest = p.hub.join(p.host.code, { name: 'Guest' });
  p.connect(p.host); p.connect(guest);
  assert.equal(p.input(guest, 'start').code, 'host_only');
  assert.equal(p.input(p.host, 'start').ok, true);
  assert.equal(p.hub.snapshot(p.room).phase, 'playing');
  assert.equal(p.input(guest, 'shot', { angle: 0, power: .3, playerId: 'p1' }).ok, true);
  assert.equal(p.room.game.state.players[0].strokes, 0);
  assert.equal(p.room.game.state.players[1].strokes, 1);
  assert.throws(() => p.hub.auth(p.host.code, '0'.repeat(64)), error => error.status === 401);
});

test('late join preserves the computer scorecard, current strokes and moving ball', t => {
  const p = setup(t); p.connect(p.host); p.input(p.host, 'start');
  const bot = p.room.game.state.players[1];
  bot.scores[0] = 5; bot.points = 3; bot.strokes = 2;
  Object.assign(bot.ball, { x: 2.1, z: -5.2, vx: 1.3, moving: true });
  const originalBall = JSON.parse(JSON.stringify(bot.ball));
  const guest = p.hub.join(p.host.code, { name: 'Late arrival' }); p.connect(guest);
  assert.equal(guest.playerId, bot.id); assert.equal(bot.scores[0], 5); assert.equal(bot.points, 3); assert.equal(bot.strokes, 2);
  assert.deepEqual(bot.ball, originalBall); assert.equal(bot.isBot, false);
  assert.equal(p.input(guest, 'shot', { angle: 0, power: .4 }).code, 'handoff_pending');
  bot.ball.moving = false; bot.ball.vx = 0; p.advance(20);
  assert.equal(p.hub.snapshot(p.room).players[1].reconnecting, false);
});

test('disconnect grace turns a human into a computer; reconnect preserves the same seat and score', t => {
  const p = setup(t), connection = p.connect(p.host);
  const guest = p.hub.join(p.host.code, { name: 'Still here' }); p.connect(guest);
  p.input(p.host, 'start');
  const player = p.room.game.state.players[0]; player.scores[0] = 4;
  connection.disconnect(); p.advance(9000);
  assert.equal(player.isBot, false, 'a short disconnect does not trigger a CPU shot');
  p.advance(1100); assert.equal(player.isBot, true);
  assert.equal(p.hub.snapshot(p.room).hostId, guest.playerId, 'host duties migrate after grace');
  Object.assign(player.ball, { moving: true, vx: 2 });
  const before = JSON.parse(JSON.stringify(player.ball));
  const session = p.hub.rejoin(p.host.code, p.host.token);
  assert.equal(session.playerId, p.host.playerId); assert.equal(session.snapshot.players[0].scores[0], 4);
  p.connect(session); assert.deepEqual(player.ball, before); assert.equal(player.isBot, false);
  assert.equal(p.input(p.host, 'shot', { angle: 0, power: .2 }).code, 'handoff_pending');
  player.ball.moving = false; player.ball.vx = 0; p.advance(16);
  assert.equal(p.hub.snapshot(p.room).players[0].reconnecting, false);
});

test('replaced stream cannot disconnect the current connection', t => {
  const p = setup(t), original = p.connect(p.host), replacement = p.connect(p.host);
  assert.equal(original.stream.closed, true);
  original.disconnect();
  assert.equal(p.hub.snapshot(p.room).players[0].connected, true);
  assert.equal(p.room.seats[0].stream, replacement.stream);
});

test('duplicate inputs do not take a second shot; stale hole/round and invalid numeric inputs are rejected', t => {
  const p = setup(t); p.connect(p.host); p.input(p.host, 'start');
  const state = p.room.game.state;
  const command = { seq: 2, roundId: state.roundId, holeIndex: state.holeIndex, action: 'shot', angle: 0, power: .4 };
  assert.equal(p.hub.input(p.host.code, p.host.token, command).ok, true);
  const before = JSON.parse(JSON.stringify(state.players[0]));
  assert.equal(p.hub.input(p.host.code, p.host.token, command).duplicate, true);
  assert.deepEqual(state.players[0], before);
  assert.equal(p.hub.input(p.host.code, p.host.token, { ...command, seq: 3, roundId: 'old' }).code, 'stale_round');
  assert.equal(p.hub.input(p.host.code, p.host.token, { ...command, seq: 4, holeIndex: 9 }).code, 'stale_hole');
  for (const [index, extra] of [{ angle: NaN }, { power: Infinity }, { power: .01 }, { power: 1.01 }, { angle: '0' }].entries()) {
    assert.equal(p.hub.input(p.host.code, p.host.token, { ...command, seq: index + 5, ...extra }).code, 'bad_shot');
  }
  assert.throws(() => p.hub.input(p.host.code, p.host.token, { ...command, seq: 0 }), RoomError);
});

test('leave releases one seat to CPU, migrates host, and permanently invalidates the old credential', t => {
  const p = setup(t), guest = p.hub.join(p.host.code, { name: 'Guest' });
  p.connect(p.host); p.connect(guest); p.input(p.host, 'start');
  const player = p.room.game.state.players[0]; player.scores[0] = 7;
  assert.equal(p.input(p.host, 'leave').ok, true);
  assert.equal(p.room.hostId, guest.playerId); assert.equal(player.isBot, true);
  assert.throws(() => p.hub.rejoin(p.host.code, p.host.token), error => error.status === 401);
  const newcomer = p.hub.join(p.host.code, { name: 'Replacement' });
  assert.equal(newcomer.playerId, p.host.playerId); assert.equal(newcomer.snapshot.players[0].scores[0], 7);
  assert.notEqual(newcomer.token, p.host.token);
});

test('next cannot skip unfinished holes and only host can rematch a finished round', t => {
  const p = setup(t), guest = p.hub.join(p.host.code, { name: 'Guest' });
  p.connect(p.host); p.connect(guest); p.input(p.host, 'start');
  assert.equal(p.input(guest, 'next').code, 'wrong_phase');
  assert.equal(p.input(p.host, 'rematch').code, 'wrong_phase');
  const originalRound = p.room.game.state.roundId;
  p.room.game.state.phase = 'finished'; p.room.game.state.players[0].scores.fill(5);
  assert.equal(p.input(guest, 'rematch').code, 'host_only');
  assert.equal(p.input(p.host, 'rematch').ok, true);
  assert.notEqual(p.room.game.state.roundId, originalRound); assert.equal(p.room.game.state.holeIndex, 0);
  assert.ok(p.room.game.state.players[0].scores.every(score => score === null));
  assert.equal(p.room.game.state.players.filter(player => player.isBot).length, 2);
  assert.equal(p.hub.rejoin(guest.code, guest.token).playerId, guest.playerId);
});

test('abandoned rooms expire, capacity stays bounded, and shutdown closes each stream', t => {
  const p = setup(t, { maxRooms: 1, orphanMs: 1000 });
  assert.throws(() => p.hub.create({ name: 'Extra' }), error => error.code === 'capacity');
  p.advance(1001); assert.equal(p.hub.rooms.size, 0);
  const newSeat = p.hub.create({ name: 'New' });
  const packets = [], stream = packet => packets.push(packet); let closed = false; stream.close = () => { closed = true; };
  p.hub.connect(newSeat.code, newSeat.token, stream); p.hub.close();
  assert.equal(closed, true); assert.equal(packets.at(-1).snapshot.closed, true);
  assert.equal(p.hub.rooms.size, 0); assert.throws(() => p.hub.create({}), error => error.status === 503);
});

test('one broken stream does not suppress snapshots to the other golfers', t => {
  const p = setup(t), host = p.connect(p.host), guest = p.hub.join(p.host.code, { name: 'Guest' });
  const other = p.connect(guest); let broken = false;
  const badStream = () => { if (broken) throw new Error('closed'); };
  p.hub.connect(p.host.code, p.host.token, badStream); broken = true;
  const before = other.packets.length; p.hub.broadcast(p.room);
  assert.equal(other.packets.length, before + 1);
  assert.equal(p.room.seats[0].connected, false); assert.equal(host.stream.closed, true);
});
