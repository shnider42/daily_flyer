import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomHub, RoomError, cleanName } from '../multiplayer.mjs';

function fixture(options = {}) {
  let clock = 1000;
  const hub = new RoomHub({ now: () => clock,
    gameFactory: ({ names, breaker }) => ({ id: 'test-game', phase: 'aiming', turn: breaker,
      shotNumber: 0, players: names.map(name => ({ name, group: null })),
      balls: [{ id: 0, x: -.6, z: 0, vx: 0, vz: 0, pocketed: false }], winner: null }),
    shootGame: state => { state.shotNumber++; state.phase = 'rolling'; state.balls[0].vx = 1; return { ok: true }; },
    placeGame: (state, point) => { Object.assign(state.balls[0], point); return { ok: true }; },
    stepGame: (state, dt) => { state.balls[0].x += dt; state.balls[0].vx = 0; state.phase = 'aiming'; state.turn = 1 - state.turn; },
    ...options });
  const first = hub.create({ name: 'Chris' }), second = hub.join(first.code, { name: 'Guest' });
  const packets = [[], []], streams = packets.map(list => packet => list.push(packet));
  const stops = [hub.connect(first.code, first.token, streams[0]), hub.connect(first.code, second.token, streams[1])];
  const room = hub.room(first.code), seats = [first, second], sequences = [0, 0];
  function command(index, action, extra = {}) {
    return hub.input(first.code, seats[index].token, { seq: ++sequences[index], rackId: room.rackId,
      shotNumber: room.game?.shotNumber ?? null, action, ...extra });
  }
  return { hub, room, seats, streams, packets, stops, command,
    advance(ms) { clock += ms; hub.tick(ms / 1000); }, now: () => clock };
}

test('two authenticated seats are required and a third player cannot replace either human', () => {
  const f = fixture();
  assert.throws(() => f.hub.join(f.room.code, { name: 'Third' }), error => error.code === 'room_full');
  assert.throws(() => f.hub.auth(f.room.code, '0'.repeat(64)), error => error.status === 401);
  assert.equal(f.command(1, 'start').code, 'host_only');
  f.stops[1](); assert.equal(f.command(0, 'start').code, 'opponent_absent');
  f.hub.connect(f.room.code, f.seats[1].token, f.streams[1]);
  const started = f.command(0, 'start');
  assert.equal(started.ok, true); assert.equal(started.snapshot.phase, 'playing');
  assert.equal(started.snapshot.game.turn, 0); assert.equal(started.snapshot.rackNumber, 1);
});

test('turn, rack and shot identities are enforced, while retries cannot shoot twice', () => {
  const f = fixture(); f.command(0, 'start');
  const shot = { angle: 0, power: .7, spin: 0 };
  assert.equal(f.command(1, 'shoot', { ...shot, seatIndex: 0 }).code, 'wrong_turn');
  const oldRack = f.room.rackId;
  const accepted = f.command(0, 'shoot', shot);
  assert.equal(accepted.ok, true); assert.equal(f.room.game.shotNumber, 1);
  const duplicate = f.hub.input(f.room.code, f.seats[0].token,
    { action: 'shoot', seq: accepted.seq, rackId: oldRack, shotNumber: 0, ...shot });
  assert.equal(duplicate.duplicate, true); assert.equal(f.room.game.shotNumber, 1);
  assert.equal(f.command(0, 'shoot', { ...shot, shotNumber: 0 }).code, 'stale_shot');
  assert.equal(f.command(0, 'shoot', shot).code, 'balls_moving');
  f.advance(250);
  assert.equal(f.room.game.turn, 1);
  assert.equal(f.command(1, 'shoot', { ...shot, rackId: 'earlier-rack' }).code, 'stale_rack');
  assert.equal(f.command(1, 'shoot', { ...shot, power: NaN }).code, 'bad_shot');
  assert.equal(f.command(1, 'shoot', { ...shot, calledPocket: 6 }).code, 'bad_shot');
  assert.equal(f.command(1, 'place', { x: Infinity, z: 0 }).code, 'bad_position');
});

test('cosmetic aiming has a separate sequence and never consumes a shot command', () => {
  const f = fixture(); f.command(0, 'start');
  const envelope = { action: 'aim', rackId: f.room.rackId, shotNumber: 0, aimSeq: 8, angle: .2, power: .5 };
  const aimed = f.hub.input(f.room.code, f.seats[0].token, envelope);
  assert.equal(aimed.ok, true); assert.equal(f.room.seats[0].lastSeq, 1);
  assert.ok(Math.abs(f.room.aim.angle - .2) < 1e-12); assert.equal(f.room.aim.seatIndex, 0);
  const ignored = f.hub.input(f.room.code, f.seats[0].token, { ...envelope, aimSeq: 7, angle: .8 });
  assert.equal(ignored.ignored, true); assert.ok(Math.abs(f.room.aim.angle - .2) < 1e-12);
  assert.equal(f.command(0, 'shoot', { angle: .2, power: .5 }).ok, true);
  assert.equal(f.room.aim, null);
});

test('an accepted shot finishes through disconnection and reconnect preserves the seat and table', () => {
  const f = fixture(); f.command(0, 'start'); f.command(0, 'shoot', { angle: 0, power: .6 });
  const token = f.seats[0].token, rack = f.room.rackId;
  f.stops[0](); f.advance(250);
  assert.equal(f.room.game.phase, 'aiming'); assert.equal(f.room.game.turn, 1);
  assert.equal(f.command(1, 'shoot', { angle: 0, power: .4 }).code, 'opponent_absent');
  const rejoined = f.hub.rejoin(f.room.code, token);
  assert.equal(rejoined.token, token); assert.equal(rejoined.lastSeq, 2);
  assert.equal(rejoined.snapshot.rackId, rack); assert.equal(rejoined.snapshot.game.shotNumber, 1);
  f.hub.connect(f.room.code, token, () => {});
  assert.equal(f.command(1, 'shoot', { angle: 0, power: .4 }).ok, true);
});

test('replacing an SSE stream cannot let the old close callback disconnect the new stream', () => {
  const f = fixture(), fresh = () => {};
  f.hub.connect(f.room.code, f.seats[0].token, fresh);
  f.stops[0]();
  assert.equal(f.room.seats[0].connected, true); assert.equal(f.room.seats[0].stream, fresh);
});

test('an absent opponent has sixty seconds to reconnect; a claimed rack scores only once', () => {
  const f = fixture(); f.command(0, 'start'); f.stops[1]();
  assert.equal(f.command(0, 'claim').code, 'claim_too_soon');
  f.advance(59000); assert.equal(f.hub.snapshot(f.room).claimAvailable[0], false);
  f.advance(1001); assert.equal(f.hub.snapshot(f.room).claimAvailable[0], true);
  const claimed = f.command(0, 'claim');
  assert.equal(claimed.ok, true); assert.equal(f.room.game.winner, 0); assert.equal(f.room.game.reason, 'forfeit');
  f.advance(500); assert.deepEqual(f.room.seats.map(seat => seat.score), [1, 0]);
  assert.equal(f.command(0, 'claim').code, 'wrong_phase');
});

test('both players must agree to a rematch; scores persist and the breaker alternates', () => {
  const f = fixture(); f.command(0, 'start');
  const firstRack = f.room.rackId;
  Object.assign(f.room.game, { phase: 'finished', winner: 1 }); f.advance(50);
  assert.deepEqual(f.room.seats.map(seat => seat.score), [0, 1]);
  assert.equal(f.command(0, 'rematch').ok, true);
  assert.equal(f.room.rackId, firstRack); assert.deepEqual([...f.room.rematchVotes], [0]);
  const secondVote = f.command(1, 'rematch');
  assert.equal(secondVote.ok, true); assert.notEqual(f.room.rackId, firstRack);
  assert.equal(f.room.rackNumber, 2); assert.equal(f.room.game.turn, 1);
  assert.deepEqual(f.room.seats.map(seat => seat.score), [0, 1]);
  assert.deepEqual([...f.room.rematchVotes], []);
  const duplicate = f.hub.input(f.room.code, f.seats[1].token,
    { action: 'rematch', seq: secondVote.seq, rackId: firstRack, shotNumber: 0 });
  assert.equal(duplicate.duplicate, true); assert.equal(f.room.rackNumber, 2);
  assert.equal(f.command(1, 'shoot', { rackId: firstRack, angle: 0, power: .6 }).code, 'stale_rack');
});

test('explicit leave forfeits an active rack and revokes the departing credential', () => {
  const f = fixture(); f.command(0, 'start');
  const left = f.command(0, 'leave');
  assert.equal(left.ok, true); assert.equal(f.room.game.winner, 1);
  assert.equal(f.room.seats[1].score, 1); assert.equal(f.room.seats[0].occupied, false);
  assert.throws(() => f.hub.rejoin(f.room.code, f.seats[0].token), error => error.status === 401);
  assert.throws(() => f.hub.join(f.room.code, { name: 'Replacement' }), error => error.code === 'match_started');
  assert.equal(f.command(1, 'rematch').code, 'opponent_absent');
});

test('private credentials never enter snapshots, names are bounded, and abandoned rooms expire', () => {
  const f = fixture({ orphanMs: 1000 });
  const snapshot = f.hub.snapshot(f.room), text = JSON.stringify(snapshot);
  for (const seat of f.seats) assert.equal(text.includes(seat.token), false);
  assert.equal(snapshot.seats[0].token, undefined);
  snapshot.seats[0].score = 9; assert.equal(f.room.seats[0].score, 0);
  assert.equal(cleanName(' <Chris>\n\u200d '), 'Chris'); assert.equal([...cleanName('x'.repeat(40))].length, 22);
  f.stops[0](); f.stops[1](); f.advance(1001);
  assert.equal(f.hub.rooms.size, 0);
  assert.throws(() => f.hub.room(f.room.code), error => error instanceof RoomError && error.status === 404);
});
