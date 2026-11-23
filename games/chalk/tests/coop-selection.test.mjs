import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopRooms } from '../server/rooms.mjs';
import { PROTOCOL } from '../public/coop-protocol.mjs';
import { SnapshotDeltaDecoder } from '../public/snapshot-delta.mjs';

class Peer {
  messages = []; states = []; bufferedAmount = 0; decoder = new SnapshotDeltaDecoder();
  send(packet) { this.messages.push(structuredClone(packet)); return true; }
  sendRaw(data) { const packet = this.decoder.decode(JSON.parse(data)); assert.ok(packet); this.states.push(packet); return true; }
  close(code, reason) { this.closed = { code, reason }; }
  get session() { return this.messages.find(packet => packet.type === 'joined')?.session; }
  get latest() { return this.states.at(-1); }
}
function setup() {
  let now = 100000, commandId = 0;
  const rooms = new CoopRooms({ now: () => now, seed: () => 63 }), host = new Peer(), guest = new Peer();
  rooms.handle(host, { type: 'create', protocol: PROTOCOL, name: 'Host', mission: 0, difficulty: 'story' });
  const room = rooms.rooms.get(host.session.code);
  rooms.handle(guest, { type: 'join', protocol: PROTOCOL, code: room.code, name: 'Guest' });
  const command = (peer, type, fields = {}) => rooms.handle(peer, { type, id: `selection-${++commandId}`, epoch: room.epoch, ...fields });
  const start = () => { command(host, 'start'); room.game.enemies = []; room.game.maxEnemies = 0; };
  const advance = milliseconds => { now += milliseconds; rooms.step(); };
  return { rooms, room, host, guest, command, start, advance };
}

test('briefing exposes four real soldiers and either human can choose medic or support before deployment', () => {
  const { room, host, guest, command, start } = setup();
  const game = room.game, actors = [...game.squad];
  assert.deepEqual(host.latest.room.soldiers.map(actor => actor.id), actors.map(actor => actor.id));
  assert.deepEqual(host.latest.room.soldiers.map(actor => actor.role), ['leader', 'grenadier', 'medic', 'support']);
  command(guest, 'select_soldier', { actorId: actors[2].id });
  assert.equal(guest.messages.at(-1).ok, true);
  command(host, 'select_soldier', { actorId: actors[3].id });
  assert.equal(host.messages.at(-1).ok, true);
  assert.equal(room.game, game, 'selection must not reconstruct the mission');
  assert.deepEqual(room.game.squad, actors);
  assert.deepEqual(room.game.humanIds, [actors[3].id, actors[2].id]);
  assert.equal(host.latest.room.leaderId, null, 'Hale is under AI control');
  assert.equal(host.latest.room.hostId, host.session.playerId);
  assert.equal(host.latest.room.capacity, 2);
  assert.equal(host.latest.room.soldiers[3].claimedBy, host.session.playerId);
  assert.equal(guest.latest.room.soldiers[2].claimedBy, guest.session.playerId);
  command(guest, 'start'); assert.equal(guest.messages.at(-1).ok, false, 'choosing a soldier does not grant host privileges');
  start();
  assert.equal(host.latest.actorId, room.game.squad[3].id);
  assert.equal(guest.latest.actorId, room.game.squad[2].id);
  assert.equal(room.game.squad.filter(actor => actor.human).length, 2);
  assert.equal(room.game.squad.filter(actor => !actor.human).length, 2);
});

test('in-mission selection preserves physical soldiers and cancels queued controls from the prior assignment', () => {
  const { rooms, room, host, guest, command, start, advance } = setup(); start();
  const game = room.game, squad = game.squad, [hale, mercer, , webb] = squad;
  Object.assign(hale, { hp: 71, ammo: 17, reserve: 65, frags: 1, flashbangs: 0 });
  Object.assign(webb, { hp: 82, ammo: 108, reserve: 215, frags: 1, flashbangs: 1, smokes: 2 });
  const fields = actor => Object.fromEntries(['id','x','y','hp','ammo','reserve','frags','flashbangs','smokes','medkits'].map(key => [key, actor[key]]));
  const before = squad.map(fields), epoch = room.epoch, time = game.time;
  rooms.handle(host, { type: 'input', epoch, seq: 4, input: { fire: true, frag: true, smoke: true, reload: true, moveX: 1 } });
  rooms.handle(guest, { type: 'input', epoch, seq: 6, input: { flashbang: true, fire: true } });
  command(host, 'select_soldier', { actorId: webb.id });
  assert.equal(host.messages.at(-1).ok, true);
  assert.equal(room.epoch, epoch + 1); assert.equal(room.game, game); assert.equal(game.time, time);
  assert.equal(game.squad, squad); assert.deepEqual(squad.map(fields), before);
  assert.equal(hale.human, false); assert.equal(webb.human, true); assert.equal(mercer.human, true);
  assert.equal(host.latest.actorId, webb.id); assert.equal(host.latest.state.role, 'member');
  assert.equal(host.latest.room.players.find(player => player.id === host.session.playerId).specialty, 'support');
  for (const player of room.players) {
    assert.equal(player.input.fire, false); assert.equal(player.input.moveX, 0);
    assert.equal(player.actions.frag, false); assert.equal(player.actions.flashbang, false); assert.equal(player.actions.smoke, false);
  }
  rooms.handle(host, { type: 'input', epoch, seq: 5, input: { fire: true, frag: true, moveX: 1 } });
  assert.equal(room.players[0].seq, 4, 'late old-epoch controls cannot reach the new soldier');
  advance(1000 / 30);
  assert.equal(webb.frags, 1); assert.equal(hale.frags, 1); assert.equal(mercer.flashbangs, 2);
  assert.equal(game.grenades.length, 0); assert.equal(game.smokes.length, 0);
});

test('occupied, incapacitated, unknown and stale selections fail without moving either player', () => {
  const { room, host, guest, command, start } = setup(); start();
  const [hale, mercer, ames, webb] = room.game.squad, epoch = room.epoch;
  command(guest, 'select_soldier', { actorId: hale.id });
  assert.equal(guest.messages.at(-1).ok, false); assert.match(guest.messages.at(-1).reason, /controlled by Host/);
  ames.downed = true; command(host, 'select_soldier', { actorId: ames.id });
  assert.equal(host.messages.at(-1).ok, false); assert.match(host.messages.at(-1).reason, /down/);
  webb.alive = false; command(host, 'select_soldier', { actorId: webb.id });
  assert.equal(host.messages.at(-1).ok, false); assert.match(host.messages.at(-1).reason, /lost/);
  for (const actorId of [999999, '3', {}, null]) { command(host, 'select_soldier', { actorId }); assert.equal(host.messages.at(-1).ok, false); }
  ames.downed = false; command(host, 'select_soldier', { actorId: ames.id, epoch: epoch - 1 });
  assert.equal(host.messages.at(-1).ok, false);
  assert.equal(room.epoch, epoch); assert.equal(host.latest.actorId, hale.id); assert.equal(guest.latest.actorId, mercer.id);
  hale.downed = true; command(host, 'select_soldier', { actorId: ames.id });
  assert.equal(host.messages.at(-1).ok, true, 'a wounded player can take over a standing AI soldier');
  assert.equal(host.latest.actorId, ames.id);
});

test('Hale grants squad command while room hosting stays with its existing human owner', () => {
  const { room, host, guest, command, start } = setup(); start();
  const [hale, , ames] = room.game.squad;
  command(host, 'select_soldier', { actorId: ames.id });
  command(host, 'order', { order: 'hold' }); assert.equal(host.messages.at(-1).ok, false);
  command(guest, 'select_soldier', { actorId: hale.id });
  assert.equal(guest.messages.at(-1).ok, true);
  assert.equal(host.latest.room.hostId, host.session.playerId);
  assert.equal(host.latest.room.leaderId, guest.session.playerId);
  command(guest, 'order', { order: 'hold' }); assert.equal(guest.messages.at(-1).ok, true);
  command(host, 'order', { order: 'help' }); assert.equal(host.messages.at(-1).ok, true);
  assert.equal(room.game.helpTargetId, ames.id);
  assert.equal(room.game.order.type, 'hold');
});

test('reconnect reserves and restores an arbitrary selected soldier without granting a duplicate controller', () => {
  const { rooms, room, host, guest, command, start } = setup(); start();
  const ames = room.game.squad[2]; command(guest, 'select_soldier', { actorId: ames.id });
  ames.hp = 68; ames.ammo = 13; const session = guest.session;
  rooms.disconnect(guest); assert.equal(ames.human, false);
  assert.equal(host.latest.room.soldiers[2].claimedBy, session.playerId);
  assert.equal(host.latest.room.soldiers[2].connected, false);
  command(host, 'select_soldier', { actorId: ames.id });
  assert.equal(host.messages.at(-1).ok, false); assert.match(host.messages.at(-1).reason, /reserved.*reconnect/);
  const replacement = new Peer(); rooms.handle(replacement, { type: 'resume', protocol: PROTOCOL, ...session });
  assert.equal(replacement.latest.actorId, ames.id); assert.equal(ames.human, true);
  assert.equal(ames.hp, 68); assert.equal(ames.ammo, 13);
  assert.equal(room.game.humanIds.length, 2); assert.equal(new Set(room.game.humanIds).size, 2);
});

test('expired reservations free the selected slot and joining chooses an available standing soldier', () => {
  const { rooms, room, host, guest, command, start, advance } = setup(); start();
  command(guest, 'select_soldier', { actorId: room.game.squad[2].id });
  rooms.disconnect(guest); advance(30001);
  command(host, 'select_soldier', { actorId: room.game.squad[2].id });
  assert.equal(host.messages.at(-1).ok, true);
  room.game.squad[0].alive = false;
  const newcomer = new Peer(); rooms.handle(newcomer, { type: 'join', protocol: PROTOCOL, code: room.code, name: 'New' });
  assert.equal(newcomer.latest.actorId, room.game.squad[1].id);
  assert.equal(room.players.length, 2);
  assert.equal(new Set(room.players.map(player => player.slot)).size, 2);
});

test('repeated selections are idempotent and legacy host exchange works with medic and support slots', () => {
  const { rooms, room, host, guest, command, start } = setup(); start();
  const [, , ames, webb] = room.game.squad;
  const packet = { type: 'select_soldier', id: 'choose-once', epoch: room.epoch, actorId: ames.id };
  rooms.handle(host, packet); const epoch = room.epoch;
  rooms.handle(host, packet); assert.equal(room.epoch, epoch); assert.equal(host.messages.at(-1).ok, true);
  command(host, 'select_soldier', { actorId: ames.id }); assert.equal(room.epoch, epoch);
  command(guest, 'select_soldier', { actorId: webb.id });
  command(host, 'swap_roles'); assert.equal(host.messages.at(-1).ok, true);
  assert.equal(host.latest.actorId, webb.id); assert.equal(guest.latest.actorId, ames.id);
  assert.equal(room.game.squad.length, 4); assert.equal(room.game.squad.filter(actor => actor.human).length, 2);
});
