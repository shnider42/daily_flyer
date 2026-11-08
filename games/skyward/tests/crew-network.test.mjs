import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from '../vendor/ws/wrapper.mjs';
import { createSkywardServer, PROTOCOL_VERSION } from '../server.mjs';
import { SquadronClient } from '../public/network.mjs';
import { FlightSimulation } from '../public/sim.mjs';
import { getMission } from '../public/campaign.mjs';

const CREW_MISSION = 'gunship-nightwatch';
const input = (seat = '25mm', fire = false) => ({ seat, yaw: 0, pitch: 0, fire });
const pose = () => ({ x: 0, y: 900, z: 100, heading: 0.2, pitch: 0.02, roll: 0.1, speed: 95, throttle: 0.6, aircraft: 'ac130', health: 100 });

class Peer {
  constructor(url) {
    this.socket = new WebSocket(url); this.messages = []; this.waiters = [];
    this.socket.on('error', () => {});
    this.socket.on('message', bytes => {
      const msg = JSON.parse(bytes.toString()), index = this.waiters.findIndex(w => w.match(msg));
      if (msg.type === 'start') this.runId = msg.runId;
      if (index < 0) this.messages.push(msg);
      else { const waiter = this.waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(msg); }
    });
  }
  send(message) { this.socket.send(JSON.stringify(message.type === 'crew-input' ? { runId: this.runId, ...message } : message)); }
  next(type, predicate = () => true) {
    const match = msg => msg.type === type && predicate(msg), index = this.messages.findIndex(match);
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        reject(new Error(`Waiting for ${type}; queued: ${JSON.stringify(this.messages)}`));
      }, 2500);
      this.waiters.push(waiter);
    });
  }
  close() { for (const waiter of this.waiters) clearTimeout(waiter.timer); this.socket.terminate(); }
}

async function setup(t, extra = {}) {
  const app = await createSkywardServer({ port: 0, host: '127.0.0.1',
    missionIds: ['formation', CREW_MISSION], crewMissionIds: [CREW_MISSION],
    reconnectGraceMs: 1500, tickMs: 30, ...extra });
  const peers = [], url = `ws://127.0.0.1:${app.port}/ws`;
  t.after(async () => { for (const peer of peers) peer.close(); await app.close(); });
  async function connect() {
    const peer = new Peer(url); peers.push(peer);
    await peer.next('hello'); peer.send({ type: 'hello', version: PROTOCOL_VERSION }); await peer.next('welcome');
    return peer;
  }
  return { app, connect, url };
}

async function flight(t, extra) {
  const context = await setup(t, extra), host = await context.connect(), gunner = await context.connect();
  host.send({ type: 'create', missionId: CREW_MISSION, name: 'Pilot' });
  const pilotSession = await host.next('session');
  gunner.send({ type: 'join', code: pilotSession.code, name: 'Gunner', role: 'pilot' });
  const gunnerSession = await gunner.next('session');
  gunner.send({ type: 'ready', ready: true });
  await host.next('roster', msg => msg.players.length === 2 && msg.players.every(player => player.ready));
  host.send({ type: 'start', missionId: CREW_MISSION });
  const start = await host.next('start'); await gunner.next('start');
  return { ...context, host, gunner, pilotSession, gunnerSession, start };
}

async function until(predicate) {
  const deadline = Date.now() + 2500;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), 'the real websocket exchange settled before its deadline');
}

test('AC-130 roles share one aircraft and accept only bounded gunner intentions', async t => {
  const { app, connect, host, gunner, pilotSession, gunnerSession, start } = await flight(t);
  assert.equal(pilotSession.role, 'pilot'); assert.equal(gunnerSession.role, 'gunner');
  assert.equal(pilotSession.mode, 'crew'); assert.equal(gunnerSession.maxPlayers, 2);
  assert.equal(start.mode, 'crew'); assert.equal(start.hostId, pilotSession.id);
  const room = app.rooms.get(pilotSession.code), third = await connect();
  third.send({ type: 'join', code: pilotSession.code, name: 'Third' });
  assert.equal((await third.next('error')).code, 'flight_in_progress');
  host.send({ type: 'pose', seq: 0, player: pose() });
  assert.equal((await gunner.next('pose')).playerId, pilotSession.id);
  gunner.send({ type: 'pose', seq: 0, player: pose(), playerId: pilotSession.id });
  assert.equal((await gunner.next('error')).code, 'pilot_only');
  assert.equal(room.players.get(gunnerSession.id).pose, null);
  gunner.send({ type: 'world', seq: 0, snapshot: { status: 'success' } });
  assert.equal((await gunner.next('error')).code, 'host_only');
  gunner.send({ type: 'action', action: 'fire' });
  assert.equal((await gunner.next('error')).code, 'crew_input_required');
  host.send({ type: 'crew-input', seq: 0, input: input() });
  assert.equal((await host.next('error')).code, 'gunner_only');

  for (const [seq, seat] of ['25mm', '40mm', '105mm'].entries()) {
    gunner.send({ type: 'crew-input', seq, playerId: pilotSession.id,
      input: { ...input(seat, true), damage: 1e6, ammo: 999, targetId: 'instant-win', player: pose() } });
    const received = await host.next('crew-input', msg => msg.seq === seq);
    assert.equal(received.playerId, gunnerSession.id);
    assert.deepEqual(received.input, input(seat, true));
    assert.equal(received.reset, false);
  }
  gunner.send({ type: 'crew-input', seq: 2, input: input() });
  assert.equal((await gunner.next('error')).code, 'stale_sequence');
  for (const bad of [{ ...input(), seat: 'pilot' }, { ...input(), yaw: 0.601 },
    { ...input(), pitch: -0.601 }, { ...input(), pitch: null }, { ...input(), fire: 1 }]) {
    gunner.send({ type: 'crew-input', seq: 3, input: bad });
    assert.equal((await gunner.next('error')).code, 'bad_crew_input');
  }
  for (const message of [{ reset: 'yes', input: input() }, { reset: true, input: input('25mm', true) }]) {
    gunner.send({ type: 'crew-input', seq: 3, ...message });
    assert.equal((await gunner.next('error')).code, 'bad_crew_input');
  }
  assert.equal(room.players.get(gunnerSession.id).crewSeq, 2);
  const world = { player: pose(), crew: { seat: '105mm', stations: { '105mm': { ammo: 31 } } }, targets: [{ id: 'target-1', health: 25 }] };
  host.send({ type: 'world', seq: 0, snapshot: world });
  assert.deepEqual((await gunner.next('world')).snapshot, world, 'only the pilot supplies aircraft, ammo and damage outcomes');
});

test('crew input bursts are bounded while trigger release always reaches the pilot', async t => {
  const { app, host, gunner, pilotSession, gunnerSession } = await flight(t);
  for (let seq = 0; seq < 20; seq++) gunner.send({ type: 'crew-input', seq, input: input('25mm', true) });
  gunner.send({ type: 'ping', nonce: 123 }); await gunner.next('pong');
  const player = app.rooms.get(pilotSession.code).players.get(gunnerSession.id);
  assert.ok(player.crewSeq < 5, 'one burst can relay at most the small token allowance');
  assert.equal(player.crewInput.fire, true);
  gunner.send({ type: 'crew-input', seq: 20, input: input('25mm', false) });
  assert.equal((await host.next('crew-input', msg => msg.seq === 20)).input.fire, false);
  assert.equal(player.crewSeq, 20);
  gunner.send({ type: 'crew-input', seq: 21, input: input(), reset: true });
  assert.equal((await host.next('crew-input', msg => msg.seq === 21)).reset, true, 'a cancellation after ordinary release still clears a pending click when the bucket is empty');
  for (let seq = 22; seq < 40; seq++) gunner.send({ type: 'crew-input', seq, input: input(), reset: true });
  gunner.send({ type: 'ping', nonce: 124 }); await gunner.next('pong');
  assert.ok(player.crewSeq < 25, 'repeated resets regain no priority without another accepted press');
});

test('crew reconnect and pause preserve authority, sequence guards and released triggers', async t => {
  const { app, connect, host, gunner, pilotSession, gunnerSession, start } = await flight(t);
  gunner.send({ type: 'crew-input', seq: 4, input: input('40mm', true) });
  await host.next('crew-input', msg => msg.seq === 4);
  gunner.socket.terminate();
  const stop = await host.next('crew-input', msg => msg.reset);
  assert.equal(stop.input.fire, false); assert.equal(stop.playerId, gunnerSession.id);
  await host.next('roster', msg => msg.players.some(player => player.id === gunnerSession.id && !player.connected));
  const recovered = await connect();
  recovered.send({ type: 'resume', code: pilotSession.code, playerId: gunnerSession.id, token: gunnerSession.token });
  const session = await recovered.next('session');
  assert.equal(session.role, 'gunner'); assert.equal(session.crewSeq, 4);
  assert.equal((await recovered.next('start')).runId, start.runId);
  recovered.send({ type: 'crew-input', seq: 4, input: input('40mm', true) });
  assert.equal((await recovered.next('error')).code, 'stale_sequence');
  await delay(80);
  recovered.send({ type: 'crew-input', seq: 5, input: input('105mm', true) });
  await host.next('crew-input', msg => msg.seq === 5);
  host.socket.terminate(); await recovered.next('pause');
  recovered.send({ type: 'crew-input', seq: 6, input: input('105mm', true) });
  assert.equal((await recovered.next('error')).code, 'host_reconnecting');
  const recoveredHost = await connect();
  recoveredHost.send({ type: 'resume', code: pilotSession.code, playerId: pilotSession.id, token: pilotSession.token });
  assert.equal((await recoveredHost.next('session')).role, 'pilot');
  assert.equal((await recoveredHost.next('start')).runId, start.runId);
  assert.equal((await recoveredHost.next('crew-input', msg => msg.reset)).input.fire, false);
  await recovered.next('resume-play');
  recoveredHost.send({ type: 'world', seq: 0, snapshot: { teamPaused: true } });
  assert.equal((await recoveredHost.next('crew-input', msg => msg.reason === 'mission-paused')).input.fire, false);
  recovered.send({ type: 'crew-input', seq: 6, input: input() });
  assert.equal((await recovered.next('error')).code, 'mission_paused');
  recoveredHost.send({ type: 'world', seq: 1, snapshot: { teamPaused: false } });
  await recovered.next('world', msg => msg.seq === 1);
  const replacement = await connect();
  replacement.send({ type: 'resume', code: pilotSession.code, playerId: gunnerSession.id, token: gunnerSession.token });
  assert.equal((await replacement.next('session')).crewSeq, 5);
  await recovered.next('replaced');
  assert.equal((await recoveredHost.next('crew-input', msg => msg.reason === 'gunner-reconnected')).input.fire, false);
  replacement.send({ type: 'leave' });
  await recoveredHost.next('roster', msg => msg.players.length === 1);
  assert.equal((await recoveredHost.next('crew-input', msg => msg.reason === 'gunner-disconnected')).input.fire, false);
  assert.equal(app.rooms.get(pilotSession.code).players.size, 1);
});

test('lobby mission changes assign crew seats, reset readiness and reject excess members atomically', async t => {
  const { app, connect } = await setup(t), host = await connect();
  host.send({ type: 'create', missionId: 'formation', name: 'Pilot' });
  const session = await host.next('session'), guests = [], guestSessions = [];
  for (let i = 0; i < 3; i++) {
    const guest = await connect(); guest.send({ type: 'join', code: session.code, name: `Wing ${i}` });
    guestSessions.push(await guest.next('session')); guest.send({ type: 'ready', ready: true }); guests.push(guest);
  }
  await host.next('roster', msg => msg.players.length === 4 && msg.players.every(player => player.ready));
  host.send({ type: 'mission', missionId: CREW_MISSION });
  assert.equal((await host.next('error')).code, 'crew_capacity');
  assert.equal(app.rooms.get(session.code).missionId, 'formation');
  guests[1].send({ type: 'leave' }); guests[2].send({ type: 'leave' });
  await host.next('roster', msg => msg.players.length === 2);
  host.send({ type: 'mission', missionId: CREW_MISSION });
  const roster = await host.next('roster', msg => msg.mode === 'crew');
  assert.equal(roster.maxPlayers, 2);
  assert.deepEqual(roster.players.map(player => [player.role, player.ready]), [['pilot', true], ['gunner', false]]);
  const third = await connect(); third.send({ type: 'join', code: session.code, name: 'Third' });
  assert.equal((await third.next('error')).code, 'room_full');
  guests[0].send({ type: 'mission', missionId: 'formation' });
  assert.equal((await guests[0].next('error')).code, 'host_only');
  host.send({ type: 'start', missionId: CREW_MISSION });
  assert.equal((await host.next('error')).code, 'not_ready');
  guests[0].send({ type: 'ready', ready: true });
  await host.next('roster', msg => msg.mode === 'crew' && msg.players.every(player => player.ready));
  guests[0].socket.terminate();
  const disconnected = await host.next('roster', msg => msg.mode === 'crew' && msg.players.some(player => !player.connected));
  assert.equal(disconnected.players.find(player => player.role === 'gunner').ready, false);
  host.send({ type: 'start', missionId: CREW_MISSION });
  assert.equal((await host.next('error')).code, 'need_wingmate');
  const recovered = await connect(), gunnerSession = guestSessions[0];
  recovered.send({ type: 'resume', code: session.code, playerId: gunnerSession.id, token: gunnerSession.token });
  assert.equal((await recovered.next('session')).role, 'gunner');
  recovered.send({ type: 'ready', ready: true });
  await host.next('roster', msg => msg.mode === 'crew' && msg.players.every(player => player.ready && player.connected));
  host.send({ type: 'start', missionId: CREW_MISSION }); await host.next('start');
  host.send({ type: 'mission', missionId: 'formation' });
  assert.equal((await host.next('error')).code, 'mission_locked');
});

test('a crew replay starts fresh and rejects delayed controls from the previous sortie', async t => {
  const { app, host, gunner, pilotSession, gunnerSession, start } = await flight(t);
  gunner.send({ type: 'crew-input', seq: 12, input: input('105mm', true) });
  await host.next('crew-input', msg => msg.seq === 12);
  host.send({ type: 'world', seq: 20, snapshot: { status: 'success', crew: { seat: '105mm' } } });
  await gunner.next('world');
  host.send({ type: 'start', missionId: CREW_MISSION });
  assert.equal((await host.next('error')).code, 'slow_down');
  await delay(1010);
  host.send({ type: 'start', missionId: CREW_MISSION });
  const replay = await host.next('start'); await gunner.next('start');
  assert.notEqual(replay.runId, start.runId);
  const room = app.rooms.get(pilotSession.code), member = room.players.get(gunnerSession.id);
  assert.equal(room.world, null); assert.equal(room.worldSeq, -1);
  assert.equal(member.crewSeq, -1); assert.equal(member.crewInput, null);
  gunner.send({ type: 'crew-input', runId: start.runId, seq: 13, input: input('105mm', true) });
  assert.equal((await gunner.next('error')).code, 'stale_run');
  gunner.send({ type: 'crew-input', seq: 0, input: input('25mm', false) });
  assert.equal((await host.next('crew-input', msg => msg.seq === 0)).input.fire, false);
});

test('browser crew client interpolates only its shared pilot and releases fire across reconnect', async t => {
  const { url } = await setup(t, { reconnectGraceMs: 4000 });
  const commands = [], starts = [], worlds = [];
  const host = new SquadronClient({ url, onCrewInput: data => commands.push(data), onStart: data => starts.push(['host', data]) });
  const gunner = new SquadronClient({ url, onWorld: data => worlds.push(data), onStart: data => starts.push(['gunner', data]) });
  t.after(() => { host.leave(); gunner.leave(); });
  assert.equal(await host.create('Pilot', CREW_MISSION), true);
  assert.equal(await gunner.join(host.code, 'Gunner'), true);
  assert.equal(host.role, 'pilot'); assert.equal(gunner.role, 'gunner');
  gunner.ready(true); await until(() => host.roster.length === 2 && host.roster.every(player => player.ready));
  assert.equal(host.start(CREW_MISSION), true); await until(() => starts.length === 2);
  assert.equal(starts.find(([name]) => name === 'gunner')[1].role, 'gunner');
  assert.equal(gunner.sendPose(pose()), false); assert.equal(gunner.sendAction('fire'), false);
  assert.equal(gunner.sendWorld({ targets: [] }), false); assert.equal(host.sendCrewInput(input()), false);
  assert.equal(gunner.sendCrewInput(input('25mm', true), { reset: true }), false);
  assert.equal(gunner.sendCrewInput(input(), { reset: 'yes' }), false);
  assert.equal(host.sendPose(pose()), true); await until(() => gunner.samplePilot());
  assert.equal(gunner.samplePilot().id, host.id);
  assert.deepEqual(gunner.samplePlayers(), []); assert.deepEqual(host.samplePlayers(), []);
  assert.equal(gunner.sendCrewInput(input()), true); await until(() => commands.length === 1);
  assert.equal(gunner.sendCrewInput(input('25mm', true)), true);
  assert.equal(gunner.sendCrewInput(input('25mm', false)), true);
  await until(() => commands.length === 3);
  assert.deepEqual(commands.slice(0, 3).map(command => command.input.fire), [false, true, false], 'a short press and release survive transport throttling');
  await delay(90);
  gunner.sendCrewInput({ ...input('40mm', true), yaw: 0.25, damage: 100000 });
  await until(() => commands.some(command => command.input.seat === '40mm' && command.input.fire));
  assert.equal(commands.at(-1).input.damage, undefined);
  host.sendWorld({ player: pose(), crew: { seat: '40mm', ammo: 119 }, targets: [{ id: 'target', health: 35 }] });
  await until(() => worlds.length);
  assert.equal(worlds[0].player.aircraft, 'ac130');
  gunner._ws.close(1000, 'test interruption');
  await until(() => !gunner.connected); await until(() => gunner.connected);
  assert.equal(gunner.role, 'gunner'); assert.equal(starts.length, 2, 'a transport recovery does not restart the mission');
  const before = commands.length;
  gunner.sendCrewInput(input('40mm', true));
  await until(() => commands.length > before);
  assert.equal(commands.at(-1).input.fire, false, 'a trigger held across reconnection requires a fresh release');
  gunner.sendCrewInput(input('40mm', false));
  await delay(80); gunner.sendCrewInput(input('40mm', true));
  await until(() => commands.at(-1).input.fire);
  gunner.sendCrewInput(input('105mm', true));
  gunner.leave();
  assert.equal(gunner._crewTimer, null); assert.equal(gunner._pendingCrew, null);
  await until(() => commands.at(-1).reset && !commands.at(-1).input.fire);
});

test('a rapid gunner tap survives real sockets until the host physics tick and shares actual ground damage', async t => {
  // Exercise the production mission allowlist as well as both browser clients;
  // Nightwatch lives outside the chronological campaign in SPECIAL_MISSIONS.
  const { url } = await setup(t, { missionIds: undefined, crewMissionIds: undefined });
  let pilotSim, gunnerSim, receivedInputs = 0;
  const errors = [];
  const status = (state, message) => { if (state === 'error') errors.push(message); };
  const host = new SquadronClient({ url, onStatus: status,
    onStart: data => { pilotSim = new FlightSimulation(getMission(data.missionId), { playerId: host.id }); },
    onCrewInput: data => { pilotSim.applyCrewInput(data.input, data.playerId, { reset: data.reset }); receivedInputs++; } });
  const gunner = new SquadronClient({ url, onStatus: status,
    onStart: data => { gunnerSim = new FlightSimulation(getMission(data.missionId), { playerId: gunner.id }); },
    onWorld: snapshot => gunnerSim.applySnapshot(snapshot) });
  t.after(() => { host.leave(); gunner.leave(); });
  assert.equal(await host.create('Nightwatch pilot', CREW_MISSION), true);
  assert.equal(await gunner.join(host.code, 'Nightwatch gunner'), true);
  assert.equal(host.mode, 'crew'); assert.equal(gunner.role, 'gunner');
  gunner.ready(true); await until(() => host.roster.length === 2 && host.roster.every(player => player.ready));
  host.start(CREW_MISSION); await until(() => pilotSim && gunnerSim);
  host.sendWorld(pilotSim.getSnapshot()); await until(() => !gunnerSim.worldAuthority);
  const initialHealth = pilotSim.targets[0].health, initialAmmo = pilotSim.crew.stations['25mm'].ammo;
  gunner.sendCrewInput({ ...input('25mm', true), damage: 100000, targetId: pilotSim.targets[0].id });
  gunner.sendCrewInput(input('25mm', false));
  await until(() => receivedInputs === 2);
  assert.equal(pilotSim.crew.fire, false, 'both trigger edges arrive before any host physics tick');
  pilotSim.step(1 / 60);
  assert.equal(pilotSim.crew.stations['25mm'].ammo, initialAmmo - 1);
  assert.equal(pilotSim.crew.gunnerId, gunner.id);
  assert.equal(pilotSim.targets[0].health, initialHealth, 'the shot does no instant client-claimed damage');
  for (let frame = 0; frame < 180; frame++) pilotSim.step(1 / 60);
  assert.equal(pilotSim.targets[0].health, initialHealth - 9, 'the authoritative shell reaches the default visible depot');
  host.sendWorld(pilotSim.getSnapshot());
  await until(() => gunnerSim.targets[0].health === pilotSim.targets[0].health);
  assert.deepEqual(gunnerSim.crew.stations, pilotSim.crew.stations);
  assert.equal(gunnerSim.player.id, host.id); assert.equal(pilotSim.player.id, host.id);
  assert.deepEqual(gunnerSim.player.orientation, pilotSim.player.orientation);
  const sharedAircraft = structuredClone(gunnerSim.player);
  gunnerSim.step(1 / 60, { pitch: 1, roll: 1, yaw: 1, fire: true });
  assert.deepEqual(gunnerSim.player, sharedAircraft, 'the gunner never advances a second aircraft');
  assert.equal(gunner.sendPose(gunnerSim.player), false);
  const beforeCancellation = receivedInputs, storesBeforeCancellation = pilotSim.crew.stations['25mm'].ammo;
  gunner.sendCrewInput(input('25mm', true));
  gunner.sendCrewInput(input('25mm', false));
  assert.equal(gunner.sendCrewInput(input('25mm', false), { reset: true }), true);
  assert.equal(gunner._crewTimer, null, 'cancellation bypasses the aim coalescing timer even after normal release');
  await until(() => receivedInputs === beforeCancellation + 3);
  pilotSim.step(1 / 60);
  assert.equal(pilotSim.crew.stations['25mm'].ammo, storesBeforeCancellation, 'gunner pause cancels the unticked press through the relay');
  await delay(80);
  const storesBeforePause = pilotSim.crew.stations['25mm'].ammo;
  gunner.sendCrewInput(input('25mm', true)); await until(() => pilotSim.crew.fire);
  host.sendWorld({ ...pilotSim.getSnapshot(), teamPaused: true });
  await until(() => !pilotSim.crew.fire);
  pilotSim.step(1 / 60);
  assert.equal(pilotSim.crew.stations['25mm'].ammo, storesBeforePause, 'the server pause reset cancels an unticked press as well as a held trigger');
  assert.deepEqual(errors, []);
});
